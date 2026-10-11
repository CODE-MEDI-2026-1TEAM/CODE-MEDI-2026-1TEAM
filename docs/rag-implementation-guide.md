# 경련 문진 RAG 구현 안내

현재 환자 응답 파이프라인은 기존 경련 증례를 사용한다. 다른 증례를 추가하지 않는다. 증례 원자료와 평가 자료는 기존 저장소의 파일을 사용하며, 환자가 답변할 때 평가 기준이나 진단 정답을 근거로 쓰지 않는다.

## 검색과 답변

증례 원자료를 답변에 필요한 개별 사실로 정리한다. 각 사실에는 원자료 경로와 내용 해시, 대상, 사건, 시점, 환자가 알 수 있는 정보인지에 대한 기록을 붙인다. 검색 문장에도 이 맥락을 담는다. 원자료에서 뜻을 확정하기 어려운 항목은 검토 대상으로 남긴다.

유료 모델을 사용하는 흐름은 다음과 같다.

1. 질문 원문과 최근 대화에서 검색할 문장을 만든다.
2. 현재 증례와 판본, 환자 또는 보호자가 알 수 있는 범위 안에서 후보를 검색한다.
3. 벡터 검색과 어휘 검색 결과를 RRF로 합친다. 질문의 개념 분류는 후보의 순위를 돕는 데 사용한다.
4. 선택한 근거만 전달해 환자 답변을 만든다.
5. 별도 검증에서 답변의 근거, 대상, 사건, 시점과 수치를 확인한다.

질문을 잘못 분류해도 검색을 시도할 수 있다. 다만 검색 후보가 맞는 것과 최종 답변이 맞는 것은 별개다. 근거 선택이나 검증에서 오류가 남을 수 있으므로 검색만으로 정확도가 보장되지는 않는다.

`PATIENT_COMBINED_ENABLED=true`이면 질문 해석, 근거 선택과 답변 생성을 한 모델 호출에 묶는다. 답변 검증은 별도로 수행한다. 이 호출이 실패했을 때 같은 해석을 유료 모델로 자동 재시도하지 않는다.

## 환자의 대화 방식

환자는 질문받은 정보를 쉬운 일상어로 간결하게 답한다. 글자 수나 문장 수로 답변을 잘라내지 않는다. 의미에 필요한 부정 표현, 시점, 수치와 관찰 출처는 유지한다.

한 발화에 질문이 여러 개 있으면 첫 번째 실제 질문에 답한다. 나머지는 보류한 질문으로 기록한다. 실습생이 다시 물으면 현재 발화와 최근 대화에서 질문을 해석한다. 문진과 무관한 요청에는 환자 역할 안에서 대화를 돌린다.

최근 문답과 실패한 질문을 저장해 꼬리 질문과 정정 요청을 처리한다. 다시 답한 질문이 앞선 실패를 해결했는지는 확인 과정을 거친다. API 실패를 환자가 정보를 모르는 상황으로 처리하지 않는다. 해결되지 않은 시스템 오류가 남으면 종료 평가를 차단한다.

## 비용과 처리 성능

증례 임베딩은 요청마다 만들지 않는다. 미리 구축한 색인을 사용하고, 원자료와 임베딩 설정이 같으면 기존 벡터를 재사용한다. 색인은 구축이 끝난 판본만 조회한다.

증례 정규화, 질문 임베딩, 검색 결과와 검증을 통과한 답변에는 크기와 만료 시간이 있는 캐시를 사용한다. 답변 캐시 키에 증례 판본, 대화 맥락과 응답 정책을 포함한다.

벡터 검색과 어휘 검색의 동시 실행 수를 제한한다. 같은 세션의 요청은 큐에서 순서대로 처리한다. 요청 ID가 같은 재전송은 중복 문답이나 중복 비용을 만들지 않도록 처리한다.

API 비용 상한을 설정하면 호출 전에 예상 비용을 예약하고, 호출 후 사용량을 원장에 반영한다. 종료 평가용 예산을 따로 남길 수 있다. 단가를 확인할 수 없는 모델은 예산을 사용하는 호출에서 거부한다. 외부 청구 내역과 비교할 때는 재시도와 실패한 요청도 함께 확인해야 한다.

## 설정과 적용

설정 항목은 [backend/.env.example](../backend/.env.example)에 있다. API 키와 DB 연결 정보는 로컬 `.env`에서 설정한다.

- `PATIENT_PIPELINE_V2`: 새 환자 파이프라인 사용 여부
- `PATIENT_AI_ENABLED`: 유료 모델과 임베딩 사용 여부
- `PATIENT_GENERATION_ENABLED`: 모델 답변 생성 여부
- `PATIENT_COMBINED_ENABLED`: 해석과 생성 통합 호출 여부
- `PATIENT_VECTOR_WEIGHT`, `PATIENT_LEXICAL_WEIGHT`, `PATIENT_RRF_K`: 검색 결과 결합 설정
- `PATIENT_CANDIDATE_MAX`, `PATIENT_SEARCH_CONCURRENCY`: 후보 수와 검색 동시 실행 수
- `API_BUDGET_USD`, `API_USAGE_LEDGER_PATH`, `API_EVALUATION_RESERVE_USD`: 비용 상한, 로컬 원장 경로와 평가용 예산
- `SESSION_LOCK_MAX`, `SESSION_QUEUE_MAX`: 세션 요청 처리 제한

환경 파일의 기본값은 유료 환자 모델 호출을 끈 상태다. 이 상태의 응답과 검증 결과로 실제 모델의 정확도를 판단해서는 안 된다.

DB 변경은 다음 마이그레이션으로 적용한다.

- `20261010090000_message_request_idempotency`
- `20261011090000_patient_evidence_pipeline`

백엔드에서 `npm run prisma:deploy`로 마이그레이션을 적용하고 `npm run prisma:generate`로 클라이언트를 생성한다. 기존 경련 증례가 DB에 있어야 한다. `npm run patient:import-evidence`는 어휘 검색용 근거를 구축한다. 벡터 색인을 구축하려면 API 사용 설정을 확인한 뒤 `npm run patient:import-evidence -- --embed`를 실행한다. 임베딩 구축에는 API 비용이 발생한다.

회귀 검사는 `npm test -- --runInBand`, 빌드는 `npm run build`로 실행한다. `npm run patient:benchmark-offline`은 외부 API를 호출하지 않는 로컬 검사다. 실제 모델 정확도와 운영 환경의 지연 시간을 측정하는 검사는 별도로 필요하다.

## 주요 코드

- [patient-pipeline.service.ts](../backend/src/patient/patient-pipeline.service.ts): 대화 처리 흐름과 상태 저장
- [evidence-facts.ts](../backend/src/patient/evidence-facts.ts): 원자료 정리와 출처 연결
- [patient-evidence.service.ts](../backend/src/patient/patient-evidence.service.ts): 검색과 후보 결합
- [patient-evidence.repository.ts](../backend/src/patient/patient-evidence.repository.ts): 벡터 색인과 DB 조회
- [integrated-turn.service.ts](../backend/src/patient/integrated-turn.service.ts): 통합 모델 호출과 근거 선택
- [grounded-response.service.ts](../backend/src/patient/grounded-response.service.ts): 근거 기반 답변과 검증
- [patient-turn-policy.ts](../backend/src/patient/patient-turn-policy.ts): 첫 질문 응답 정책과 간결한 말투
- [dialogue-repair.ts](../backend/src/patient/dialogue-repair.ts): 정정과 실패 질문 관리
- [sessions.service.ts](../backend/src/sessions/sessions.service.ts): 요청 중복 방지와 종료 평가 처리
- [api-cost.service.ts](../backend/src/llm/api-cost.service.ts): API 예산과 사용량 원장

문답 기록, 실행 결과, 평가 보고서와 개인 테스트용 스크립트는 로컬에만 보관한다. 이 문서에는 기능 설명과 적용 방법만 담는다.
