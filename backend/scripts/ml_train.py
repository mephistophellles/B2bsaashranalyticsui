"""Train baseline ML model. Run from backend/: PYTHONPATH=. python -m scripts.ml_train"""

from __future__ import annotations

import argparse
import sys

from app.database import SessionLocal
from app.ml.dataset import build_training_dataset
from app.ml.train import (
    DEFAULT_MIN_PAIRS,
    DEFAULT_MIN_UNIQUE_EMPLOYEES,
    format_training_report,
    train_baseline_model,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Train baseline ESSI delta model")
    parser.add_argument("--model-type", default="linear_numpy", choices=["linear_numpy", "lightgbm"])
    parser.add_argument("--min-pairs", type=int, default=DEFAULT_MIN_PAIRS)
    parser.add_argument("--min-unique-employees", type=int, default=DEFAULT_MIN_UNIQUE_EMPLOYEES)
    parser.add_argument("--artifact-dir", default=None)
    args = parser.parse_args()

    db = SessionLocal()
    try:
        rows = build_training_dataset(db)
    finally:
        db.close()

    result = train_baseline_model(
        rows,
        preferred_model_type=args.model_type,
        min_pairs=args.min_pairs,
        min_unique_employees=args.min_unique_employees,
        artifact_root=args.artifact_dir,
    )
    print(format_training_report(result))
    if result.status == "failed":
        raise SystemExit(1)
    raise SystemExit(0)


if __name__ == "__main__":
    main()
