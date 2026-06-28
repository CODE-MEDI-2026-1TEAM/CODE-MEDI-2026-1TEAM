#!/usr/bin/env python3
"""Print selected case data that is safe to pass to a patient-simulation LLM."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_PATH = ROOT / "data" / "case_index.json"

def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python emit_selected_case_context.py <case_id>")
    case_id = sys.argv[1]
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    hit = next((item for item in index if item["case_id"] == case_id), None)
    if hit is None:
        raise SystemExit(f"Unknown case_id: {case_id}")
    source = ROOT / "data" / "cases" / hit["topic_id"] / f"{case_id}.json"
    case = json.loads(source.read_text(encoding="utf-8"))
    safe_context = {
        "case_id": case["case_id"],
        "topic": case["topic"],
        "patient_visible": case["patient_visible"],
        "simulation_policy": case["simulation_policy"],
    }
    print(json.dumps(safe_context, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
