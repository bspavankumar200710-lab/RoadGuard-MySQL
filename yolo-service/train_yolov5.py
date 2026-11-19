"""
RoadGuard YOLOv5 Custom Model Training Script
Trains a custom YOLOv5 road-damage detector on RDD2022 / road_damage_yolo dataset
for classes: D00 (Longitudinal Crack), D10 (Transverse Crack), D20 (Alligator Crack), D40 (Pothole).

Usage:
  python train_yolov5.py --epochs 50 --batch-size 16 --img 640 --weights yolov5s.pt
"""

import os
import sys
import argparse

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
YOLOV5_DIR = os.path.join(CURRENT_DIR, "yolov5")
DATASET_YAML = os.path.join(CURRENT_DIR, "dataset.yaml")

def train_yolov5(epochs: int = 50, batch_size: int = 16, img_size: int = 640, weights: str = "yolov5s.pt"):
    print("=" * 70)
    print("RoadGuard YOLOv5 Road Damage Training Pipeline (RDD2022)")
    print("=" * 70)
    print(f"Dataset Config: {DATASET_YAML}")
    print(f"Target Epochs:  {epochs}")
    print(f"Batch Size:     {batch_size}")
    print(f"Image Size:     {img_size}x{img_size}")
    print(f"Base Weights:   {weights}")
    print("=" * 70)
    
    train_script = os.path.join(YOLOV5_DIR, "train.py")
    if not os.path.exists(train_script):
        raise FileNotFoundError(f"YOLOv5 train.py not found at {train_script}")
        
    cmd = (
        f"{sys.executable} {train_script} "
        f"--img {img_size} "
        f"--batch {batch_size} "
        f"--epochs {epochs} "
        f"--data {DATASET_YAML} "
        f"--weights {weights} "
        f"--project runs/train "
        f"--name roadguard_yolov5 "
        f"--exist-ok"
    )
    
    print(f"Executing: {cmd}")
    os.system(cmd)
    
    best_weights = os.path.join(CURRENT_DIR, "runs", "train", "roadguard_yolov5", "weights", "best.pt")
    if os.path.exists(best_weights):
        target = os.path.join(CURRENT_DIR, "best.pt")
        import shutil
        shutil.copy2(best_weights, target)
        print(f"[Training Complete] Saved custom best weights to {target}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train YOLOv5 on Road Damage Dataset")
    parser.add_argument("--epochs", type=int, default=50, help="Number of epochs")
    parser.add_argument("--batch-size", type=int, default=16, help="Batch size")
    parser.add_argument("--img", type=int, default=640, help="Image size")
    parser.add_argument("--weights", type=str, default="yolov5s.pt", help="Initial weights")
    args = parser.parse_args()
    
    train_yolov5(epochs=args.epochs, batch_size=args.batch_size, img_size=args.img, weights=args.weights)
