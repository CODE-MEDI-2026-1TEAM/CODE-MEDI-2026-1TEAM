#!/usr/bin/env python3
"""Validate that cases and RAG chunks are usable and do not expose examiner-only content."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
index = json.loads((ROOT / "data" / "case_index.json").read_text(encoding="utf-8"))
chunks = [json.loads(line) for line in (ROOT / "data" / "patient_visible_chunks.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]

assert len(index) > 0, "No cases indexed"
case_ids = {item["case_id"] for item in index}
assert all(chunk["case_id"] in case_ids for chunk in chunks), "Chunk references unknown case_id"
assert all(chunk["metadata"]["visibility"] == "patient_visible" for chunk in chunks), "Unsafe visibility in chunk"
for forbidden in ("likely_diagnoses", "planned_tests", "planned_treatments_or_education", "examiner_only"):
    assert all(forbidden not in chunk["text"] for chunk in chunks), f"Potential hidden field leakage: {forbidden}"
print(f"OK: {len(index)} cases, {len(chunks)} patient-visible chunks")
