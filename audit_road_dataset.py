from pathlib import Path
from collections import Counter

root = Path("road_damage_yolo")
classes = ["D00", "D01", "D0w0", "D10", "D11",
           "D20", "D40", "D43", "D44", "D50"]

for split in ["train", "val"]:
    image_dir = root / "images" / split
    label_dir = root / "labels" / split

    images = [
        p for p in image_dir.iterdir()
        if p.suffix.lower() in [".jpg", ".jpeg", ".png"]
    ]
    labels = list(label_dir.glob("*.txt"))

    counts = Counter()
    positive_images = 0
    negative_images = 0
    missing_labels = []

    for image in images:
        label = label_dir / (image.stem + ".txt")

        if not label.exists():
            missing_labels.append(image.name)
            continue

        lines = label.read_text(encoding="utf-8").splitlines()
        if not lines:
            negative_images += 1
            continue

        positive_images += 1

        for line in lines:
            parts = line.split()
            if len(parts) != 5:
                raise ValueError(f"Invalid label: {label}")

            class_id = int(parts[0])
            values = [float(v) for v in parts[1:]]

            if not 0 <= class_id < len(classes):
                raise ValueError(f"Invalid class ID in {label}")

            if not all(0 <= v <= 1 for v in values):
                raise ValueError(f"Invalid normalized box in {label}")

            if values[2] <= 0 or values[3] <= 0:
                raise ValueError(f"Invalid box dimensions in {label}")

            counts[class_id] += 1

    print(f"\n{split.upper()} DATASET")
    print("Images:", len(images))
    print("Label files:", len(labels))
    print("Positive images:", positive_images)
    print("Negative images:", negative_images)
    print("Images missing labels:", len(missing_labels))
    print("Object counts by class:")

    for class_id, name in enumerate(classes):
        print(f"  {name}: {counts[class_id]}")

    if missing_labels:
        print("First missing labels:", missing_labels[:10])

print("\nDataset audit completed.")
