# CPX Patient Simulation Pack

업로드된 `CPX 증례.pdf`를 환자 역할 시뮬레이션용 데이터로 분리한 패키지다.

## 핵심 원칙

이 자료는 **전체 증례를 한 번에 벡터 검색해서 환자 역할을 하는 구조가 아니다.**

1. 사용자가 케이스를 선택한다.
2. 선택된 `case_id`의 JSON 한 개를 불러온다.
3. 환자 역할 LLM에는 `patient_visible`만 전달한다.
4. 진단, 검사 계획, 정답 후보 등은 `examiner_only`에만 있으므로 환자 역할 LLM에 전달하지 않는다.
5. 케이스가 긴 경우에만 `patient_visible_chunks.jsonl`을 벡터 DB에 넣고 `case_id` 필터로 검색한다.

이렇게 해야 다른 증례의 정보가 섞이거나 환자가 정답 진단을 먼저 말하는 문제가 줄어든다.

## 파일 구조

```text
CPX_Patient_Simulation_Pack/
├─ README.md
├─ docs/
│  ├─ cpx_cases_full.md                 # PDF 전체 페이지 단위 원문 추출
│  └─ cases/<topic>/*.md                # 사람이 검토하기 좋은 케이스별 문서
├─ data/
│  ├─ case_index.json                   # 케이스 탐색용 색인
│  ├─ topic_index.json                  # 주제별 케이스 색인
│  ├─ cases.jsonl                       # 전체 케이스 JSONL
│  ├─ patient_visible_chunks.jsonl      # 선택 케이스 내부 RAG용 청크
│  └─ cases/<topic>/*.json              # 케이스별 원본 JSON
├─ prompts/
│  └─ patient_simulator_system.md       # 표준화 환자 역할 시스템 프롬프트
├─ scripts/
│  ├─ emit_selected_case_context.py     # case_id로 안전한 LLM 컨텍스트 출력
│  └─ validate_case_pack.py             # JSON/청크 구성 검증
└─ qa/
   └─ validation_report.json             # 추출 건수·검토 대상 목록
```

## JSON 구조

각 케이스는 아래처럼 구성된다.

```json
{
  "case_id": "acute_abdominal_pain-001",
  "patient_visible": {
    "identity": {},
    "setting": "응급실",
    "opening_statement": "배가 아파요",
    "vital_signs_available_on_scenario_card": {},
    "history_blocks": {},
    "physical_exam_results": "",
    "patient_question_or_concern": ""
  },
  "examiner_only": {
    "likely_diagnoses": [],
    "planned_tests": [],
    "planned_treatments_or_education": []
  }
}
```

- `patient_visible`: 환자 시뮬레이션 모델에만 전달하는 사실 데이터
- `examiner_only`: 평가 모델이나 운영자 화면에서만 사용하는 정보
- `simulation_policy`: 없는 내용을 지어내지 않도록 하는 기본 환자 역할 규칙
- `quality.flags`: OCR/레이아웃 문제로 수동 확인이 필요한 레코드 표시

## 권장 구현 플로우

```text
케이스 선택
  ↓
case_id로 data/cases/<topic>/<case_id>.json 로드
  ↓
patient_visible + prompts/patient_simulator_system.md를 LLM에 전달
  ↓
학생 질문에 대해 환자처럼 답변
  ↓
학생이 신체진찰을 요청하면 physical_exam_results 안의 관련 소견만 공개
```

## 선택 케이스 내부 RAG가 필요한 경우

단일 JSON이 길어서 토큰을 아끼고 싶을 때만 `patient_visible_chunks.jsonl`을 벡터 DB에 넣는다.

Qdrant 검색 필터 예시:

```ts
filter: {
  must: [
    { key: "case_id", match: { value: selectedCaseId } },
    { key: "metadata.visibility", match: { value: "patient_visible" } }
  ]
}
```

`examiner_only`는 절대 `patient_visible_chunks.jsonl`에 넣지 않는다.

## 주의

- 이 패키지는 교육용 CPX 시뮬레이션 데이터다. 실제 진료나 임상 의사결정 시스템으로 사용하면 안 된다.
- OCR 텍스트가 깨진 일부 케이스는 `qa/validation_report.json`의 `manual_review_case_ids`에 표시했다.
- 민감한 상담 주제(자살, 성폭력, 가정폭력 등)는 운영 화면에서 위기 대응 정책과 별도 안전 프로토콜을 구현해야 한다.
