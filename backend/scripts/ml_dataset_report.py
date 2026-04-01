"""ML dataset coverage report. Run from backend/: PYTHONPATH=. python -m scripts.ml_dataset_report"""

from __future__ import annotations

from app.database import SessionLocal
from app.ml.dataset import build_training_dataset, format_coverage_report, summarize_training_coverage


def main() -> None:
    db = SessionLocal()
    try:
        rows = build_training_dataset(db)
        summary = summarize_training_coverage(db, rows)
        print(format_coverage_report(summary))
    finally:
        db.close()


if __name__ == "__main__":
    main()
