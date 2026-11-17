import os
import random
import shutil
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ZIP_PATH = Path("public/assets/aistudio/India_28eab0aa.zip")
XML_DIR = Path("dataset_check/India/train/annotations/xmls")
OUT_DIR = Path("road_damage_yolo")

CLASSES = ["D00", "D01", "D0w0", "D10", "D11",
           "D20", "D40", "D43", "D44", "D50"]
CLASS_TO_ID = {name: i for i, name in enumerate(CLASSES)}

random.seed(42)

if not ZIP_PATH.exists():
    raise FileNotFoundError(f"ZIP not found: {ZIP_PATH}")
if not XML_DIR.exists():
    raise FileNotFoundError(f"XML folder not found: {XML_DIR}")
if OUT_DIR.exists():
    raise FileExistsError(
        f"{OUT_DIR} already exists. Rename or remove it before running again."
    )

print("Reading training images from ZIP...")
with zipfile.ZipFile(ZIP_PATH, "r") as z:
    image_files = [
        n for n in z.namelist()
        if n.startswith("India/train/images/")
        and Path(n).suffix.lower() in [".jpg", ".jpeg", ".png"]
    ]

    images_by_stem = {}
    for name in image_files:
        stem = Path(name).stem.lower()
        if stem in images_by_stem:
            raise ValueError(f"Duplicate image filename: {stem}")
        images_by_stem[stem] = name

    xml_files = list(XML_DIR.glob("*.xml"))
    xml_by_stem = {p.stem.lower(): p for p in xml_files}

    missing_xml = set(images_by_stem) - set(xml_by_stem)
    missing_image = set(xml_by_stem) - set(images_by_stem)

    if missing_xml or missing_image:
        raise ValueError(
            f"Filename mismatch: {len(missing_xml)} images without XML; "
            f"{len(missing_image)} XML files without images."
        )

    records = []
    object_counts = {name: 0 for name in CLASSES}
    negative_count = 0

    print("Checking annotations and preparing YOLO labels...")

    for stem, image_path in images_by_stem.items():
        xml_path = xml_by_stem[stem]
        root = ET.parse(xml_path).getroot()

        size = root.find("size")
        if size is None:
            raise ValueError(f"Missing image size in {xml_path.name}")

        width = int(size.findtext("width", "0"))
        height = int(size.findtext("height", "0"))
        if width <= 0 or height <= 0:
            raise ValueError(f"Invalid image dimensions in {xml_path.name}")

        labels = []
        found_classes = set()

        for obj in root.findall("object"):
            class_name = obj.findtext("name")
            if class_name not in CLASS_TO_ID:
                raise ValueError(
                    f"Unknown class '{class_name}' in {xml_path.name}"
                )

            box = obj.find("bndbox")
            if box is None:
                raise ValueError(f"Missing bounding box in {xml_path.name}")

            xmin = float(box.findtext("xmin"))
            ymin = float(box.findtext("ymin"))
            xmax = float(box.findtext("xmax"))
            ymax = float(box.findtext("ymax"))

            if not (0 <= xmin < xmax <= width and
                    0 <= ymin < ymax <= height):
                raise ValueError(
                    f"Invalid box in {xml_path.name}: "
                    f"{xmin}, {ymin}, {xmax}, {ymax}"
                )

            x_center = ((xmin + xmax) / 2) / width
            y_center = ((ymin + ymax) / 2) / height
            box_width = (xmax - xmin) / width
            box_height = (ymax - ymin) / height

            labels.append(
                f"{CLASS_TO_ID[class_name]} "
                f"{x_center:.6f} {y_center:.6f} "
                f"{box_width:.6f} {box_height:.6f}"
            )

            object_counts[class_name] += 1
            found_classes.add(class_name)

        if not labels:
            negative_count += 1

        records.append({
            "stem": stem,
            "image_path": image_path,
            "labels": labels,
            "classes": found_classes
        })

    # Keep the single D0w0 example in training.
    rare_class_records = [
        r for r in records if "D0w0" in r["classes"]
    ]
    remaining = [
        r for r in records if "D0w0" not in r["classes"]
    ]

    random.shuffle(remaining)
    val_count = round(len(records) * 0.20)
    val_records = remaining[:val_count]
    train_records = rare_class_records + remaining[val_count:]

    print("Copying images and writing YOLO labels...")

    for split, split_records in [
        ("train", train_records),
        ("val", val_records)
    ]:
        image_dir = OUT_DIR / "images" / split
        label_dir = OUT_DIR / "labels" / split
        image_dir.mkdir(parents=True, exist_ok=True)
        label_dir.mkdir(parents=True, exist_ok=True)

        for record in split_records:
            image_name = Path(record["image_path"]).name
            with z.open(record["image_path"]) as source:
                with open(image_dir / image_name, "wb") as destination:
                    shutil.copyfileobj(source, destination)

            label_file = label_dir / f"{record['stem']}.txt"
            label_file.write_text(
                "\n".join(record["labels"]),
                encoding="utf-8"
            )

    yaml_text = (
        f"path: {OUT_DIR.resolve().as_posix()}\n"
        "train: images/train\n"
        "val: images/val\n"
        "names:\n"
    )
    for i, name in enumerate(CLASSES):
        yaml_text += f"  {i}: {name}\n"

    (OUT_DIR / "data.yaml").write_text(yaml_text, encoding="utf-8")

print("\nDATASET PREPARATION COMPLETE")
print(f"Total images: {len(records)}")
print(f"Training images: {len(train_records)}")
print(f"Validation images: {len(val_records)}")
print(f"Negative images (empty annotations): {negative_count}")
print("\nObject counts:")
for name, count in object_counts.items():
    print(f"{name}: {count}")

print(f"\nDataset folder: {OUT_DIR.resolve()}")
print("Configuration: data.yaml")
