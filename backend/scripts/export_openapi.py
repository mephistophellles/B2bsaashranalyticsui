"""Write OpenAPI schema to stdout or file. PYTHONPATH=. python scripts/export_openapi.py"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app

if __name__ == "__main__":
    path = Path(__file__).resolve().parents[2] / "openapi" / "openapi.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {path}")
