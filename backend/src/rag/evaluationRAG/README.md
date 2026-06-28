# CPX Evaluation RAG Pack

업로드된 `CPX 총론.pdf` 전체를 **페이지 단위 Markdown**으로 추출하고, CPX 환자 시뮬레이터의 평가 엔진에서 쓰기 좋게 **48개 임상표현 모듈 + 공통 평가 루브릭 JSON**으로 분리한 패키지다.

## 바로 사용할 파일

- `docs/cpx_general_full.md` - PDF 466쪽 전체 추출본. 모든 원본 PDF 페이지에 대응하는 `PDF page N` 앵커 포함.
- `docs/media/page-036.png`, `docs/media/page-066.png` - 텍스트 레이어가 비어 있던 시각 자료 페이지의 렌더 이미지.
- `data/global_evaluation_rubric.json` - 병력 청취 프레임워크, PPI 6개 항목, 환자 교육, 신체 진찰 태도, 공통 안전 기준.
- `data/cpx_module_index.json` - 48개 임상표현의 범위·파일 위치 색인.
- `data/modules/*.json` - 증상별 평가 모듈 메타데이터와 검색 힌트.
- `docs/modules/*.md` - 증상별 원문 추출본.
- `prompts/evaluate_cpx_session.md` - 대화 종료 후 평가 모델에 전달할 템플릿.

## 권장 적용 구조

```text
case JSON (증례별 환자 설정·필수 질문·red flag)
  + data/modules/<증상>.json
  + docs/modules/<증상>.md (RAG retrieval)
  + data/global_evaluation_rubric.json
  + 대화 기록
  -> 평가 결과 JSON
```

## 구현 순서

1. 사용자가 케이스를 선택하면 `caseId`와 `moduleId`를 함께 고정한다.
2. 문진 중에는 증례 JSON만 우선 사용해 환자 역할을 수행한다.
3. 종료 시에는 `case_checklist`를 정확한 정답 기준으로 사용한다.
4. 공통 PPI·환자교육·신체진찰 태도는 `global_evaluation_rubric.json`으로 평가한다.
5. 질환별 문진/진찰/교육 항목은 해당 `docs/modules/*.md`를 검색하여 보완한다.

## 추출 품질 주의

이 PDF에는 검색 가능한 텍스트/OCR 레이어가 있어 자동 추출이 가능했다. 텍스트가 비어 있던 36·66쪽은 이미지로 별도 포함했다. 다만 표·도식·알고리즘·그림은 레이아웃 때문에 Markdown의 읽기 순서가 일부 섞일 수 있다. 따라서 자동 평가의 최종 근거에는 항상 `source_pdf_pages`를 남기고, 중요한 의학적 항목은 원본 PDF와 한 번 대조한다.

## 범위

- 전체 PDF 페이지: 466쪽
- 임상표현 모듈: 48개
- 공통 평가 루브릭: 병력 청취, 환자 교육, PPI, 신체 진찰 태도, 안전·응급 고려

