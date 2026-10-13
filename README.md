<p align="center">
  <img width="1000" alt="Seizure CPX 진료실 화면" src="https://github.com/user-attachments/assets/403e8939-caf4-4674-96ce-7b84b50cbaa3" />
</p>

<h1 align="center">Seizure CPX</h1>

<p align="center">
  3D 진료실에서 환자에게 질문하고, 진찰하고, 피드백을 받는 경련 CPX 연습 도구
</p>

<p align="center">
  <strong>🏆 2026 CODE:MEDI 해커톤 대상</strong><br />
  <sub>동아대학교 의과대학 주최</sub>
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="Three.js" src="https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white" />
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" />
</p>

<p align="center">
  <a href="https://code-medi-2026-1-team-frontend.vercel.app/">서비스 바로가기</a>
  &nbsp; | &nbsp;
  <a href="https://www.youtube.com/watch?v=vS0mFh-VEVU">시연 영상</a>
</p>

<br />

---

<br />

## 프로젝트 소개

Seizure CPX는 의대생이 혼자서도 경련 환자 문진을 연습할 수 있도록 만든 시뮬레이터입니다. 환자나 보호자에게 말로 질문하고, 3D 환자 모델을 진찰한 뒤, 빠뜨린 항목을 확인할 수 있습니다.

CPX는 환자에게 병력을 묻고 신체진찰과 환자 교육을 수행하는 실기 시험입니다. 이 프로젝트에서는 경련 증례를 바탕으로 문진부터 피드백까지 한 번에 연습할 수 있도록 구성했습니다.

| 항목             | 내용                                |
| ---------------- | ----------------------------------- |
| 팀               | Team 1, 아프지마 닥터 잠보 🐘       |
| 해커톤 개발 기간 | 2026.06.28 ~ 2026.06.29             |
| 실습 주제        | 경련 환자 문진, 신체진찰, 환자 교육 |
| 실습 시간        | 한 세션당 12분                      |

<br />

---

<br />

## 목차

- [주요 기능](#주요-기능)
- [3D 진료실](#3d-진료실)
- [이중 RAG 구조](#이중-rag-구조)
- [동작 원리](#동작-원리)
- [RAG 시퀀스 다이어그램](#rag-시퀀스-다이어그램)
- [시스템 구성](#시스템-구성)
- [기술 스택](#기술-스택)
- [기술적 도전](#기술적-도전)
- [비용 기록과 호출 줄이기](#비용-기록과-호출-줄이기)
- [프로젝트 구조](#프로젝트-구조)
- [실행 방법](#실행-방법)
- [환경 변수](#환경-변수)
- [배포 설정](#배포-설정)
- [API](#api)
- [팀 소개](#-팀-소개-team)
- [3D 에셋 출처](#3d-에셋-출처)
- [면책 조항](#-면책-조항-disclaimer)

<br />

---

<br />

## 주요 기능

실습 흐름: **증례 선택 → 문진 → 신체진찰과 환자 교육 → 피드백**

| 기능               | 설명                                                                       |
| ------------------ | -------------------------------------------------------------------------- |
| 음성 문진          | 음성 질문의 텍스트 변환과 전송, 환자 답변의 음성 재생                      |
| 환자와 보호자 역할 | 소아 증례의 보호자 응답, 목격자에게 들은 정보와 환자가 직접 아는 정보 구분 |
| 3D 신체진찰        | 앉은 자세와 누운 자세 전환, 진찰 결과와 수행 기록 확인                     |
| 손소독 기록        | 실습 시작, 진찰 전, 진찰 후의 손소독 시점 기록                             |
| 문진 피드백        | 평가 기준에 따른 점수, 잘한 점, 놓친 항목 제공                             |

- 음성 기능과 자동 평가: AI 사용 설정에 따라 활성화
- 기본 예시 설정: 텍스트 문진 사용, 새 자동 평가 보류

### 연령대별 환자 모델

- 경련 증례에 맞춘 소아, 청소년, 성인 모델
- 어린 환자의 병력을 보호자가 대신 설명하는 문진 상황

<table>
  <tr>
    <th width="50%">소아, 7개월</th>
    <th width="50%">소아, 9세</th>
  </tr>
  <tr>
    <td><img width="450" alt="7개월 소아 환자 모델" src="https://github.com/user-attachments/assets/0c3a2a42-0805-40e7-a35e-84401b95e7b1" /></td>
    <td><img width="450" alt="9세 소아 환자 모델" src="https://github.com/user-attachments/assets/06ff3729-5470-4619-a06b-6989f0909d08" /></td>
  </tr>
  <tr>
    <th>청소년, 15세</th>
    <th>성인, 42세</th>
  </tr>
  <tr>
    <td><img width="450" alt="15세 청소년 환자 모델" src="https://github.com/user-attachments/assets/786b3618-31ff-40da-89d5-bb17fc8bffe4" /></td>
    <td><img width="450" alt="42세 성인 환자 모델" src="https://github.com/user-attachments/assets/5280f1be-70b7-488e-8390-a3c87a85c493" /></td>
  </tr>
</table>

### 신체진찰

- 진료실과 침상 화면 이동, 환자 자세 전환
- Brudzinski 검사와 Kernig 검사 등 경련 관련 신체진찰

<table>
  <tr>
    <th width="50%">수막자극징후 검사</th>
    <th width="50%">침상 진찰 화면</th>
  </tr>
  <tr>
    <td><img width="480" alt="Brudzinski 검사와 Kernig 검사 화면" src="https://github.com/user-attachments/assets/39a70dc0-d819-4797-9b28-18f22c9f5a42" /></td>
    <td><img width="480" alt="누운 자세의 환자 진찰 화면" src="https://github.com/user-attachments/assets/6bcf7904-8948-40ae-be2f-a46a3fcc9465" /></td>
  </tr>
</table>

### 피드백 화면

- 문진에서 놓친 내용과 신체진찰 기록 확인
- 감별진단, 필요한 검사, 환자 교육 내용 평가

<p align="center">
  <img width="760" alt="문진 점수와 놓친 항목을 보여주는 피드백 화면" src="https://github.com/user-attachments/assets/6d245f99-ffa2-4392-902d-77318c243a5d" />
</p>

- 현재 점수: 모델이 제안한 임시 평가
- 평가 보류 조건: 해결되지 않은 질문 해석 또는 답변 처리 실패

<br />

---

<br />

## 3D 진료실

- Three.js와 React Three Fiber 기반 진료실, 침상, 환자 모델 구성
- 채팅, 타이머, 환자 자세와 3D 장면 연동

| 구성      | 구현 내용                                |
| --------- | ---------------------------------------- |
| 진료실    | 책상, 모니터, 침대가 있는 공간           |
| 환자 모델 | 증례와 연령에 맞는 환자 모델             |
| 자세 전환 | 문진할 때 앉은 자세, 진찰할 때 누운 자세 |
| 장면 전환 | 진료실과 침상 화면 이동                  |
| 수행 기록 | 손소독 시점, 진찰 항목, 자세와 결과 저장 |

<p align="center">
  <img width="1000" alt="Three.js로 구현한 3D 진료실" src="https://github.com/user-attachments/assets/efad7e7a-6275-4833-b058-f26d9c95ce08" />
</p>

무료 진료실 에셋 활용, 증례용 환자 모델과 일부 오브젝트 직접 제작

<br />

---

<br />

## 이중 RAG 구조

- 환자 응답 자료와 학생 평가 자료의 역할 분리
- 환자 답변에 정답 진단과 채점 기준이 섞이는 상황 방지

```mermaid
%%{init: {"fontFamily": "Arial", "flowchart": {"nodeSpacing": 24, "rankSpacing": 14, "padding": 10}, "themeVariables": {"fontFamily": "Arial", "fontSize": "14px"}}}%%
flowchart LR
    subgraph Patient["문진 RAG"]
        direction TB
        Question("질문 입력<br/>질문, 대화 Context")
        Facts("답변에 쓸 정보 준비<br/>환자, 보호자가 아는 내용")
        Search("하이브리드 검색<br/>벡터, 전문 검색, RRF")
        Generate("답변 생성<br/>질문 해석, 근거 선택")
        Verify("근거 검증<br/>서버 검사, 의미 검증")
        Reply("환자 답변<br/>근거 기반 환자 응답")

        Question --> Facts --> Search --> Generate --> Verify --> Reply
    end

    subgraph Evaluation["평가 RAG"]
        direction TB
        Records("실습 기록 조회<br/>문진, 진찰, 손소독")
        Criteria("평가 기준 선택<br/>모듈 ID 기반 JSON")
        Context("평가 Context 구성<br/>공통 기준, 증례별 답안")
        Evaluate("항목별 평가<br/>평가 기준 + 실습 기록")
        Save("평가 결과 저장<br/>임시 점수, 평가 결과")
        Feedback("평가 피드백<br/>잘한 점, 놓친 항목")

        Records --> Criteria --> Context --> Evaluate --> Save --> Feedback
    end

    Patient ~~~ Evaluation

    classDef stage fill:transparent,stroke:#94a3b8,stroke-width:1px
    classDef retrieval fill:transparent,stroke:#3b82f6,stroke-width:1.5px
    classDef result fill:transparent,stroke:#64748b,stroke-width:1.5px
    class Question,Facts,Generate,Verify,Records,Context,Evaluate,Save stage
    class Search,Criteria retrieval
    class Reply,Feedback result
    style Patient fill:transparent,stroke:transparent
    style Evaluation fill:transparent,stroke:transparent
```

| 구분          | 환자 응답 데이터                                   | 평가 데이터                                     |
| ------------- | -------------------------------------------------- | ----------------------------------------------- |
| 사용하는 정보 | 환자의 증상과 병력, 보호자와 목격자가 아는 내용    | 문진, 진찰, 환자 교육의 평가 기준과 사례별 답안 |
| 데이터 처리   | 질문에 답할 수 있도록 정보를 작은 단위로 나눠 정리 | 선택한 환자 사례에 맞는 평가 기준 선택          |
| 불러오는 방식 | 조건에 따라 벡터 검색과 단어 검색 함께 사용        | 환자 사례에 연결된 평가 모듈 ID로 JSON 선택     |
| 사용하는 시점 | 문진 중 질문이 들어왔을 때 시                      | 실습을 마친 뒤 평가할 때                        |

### 환자 응답 자료 검색

- 경련 환자 사례 8개에서 문진에 필요한 정보 정리
- **열이 나는지**, **근육통이 얼마나 지속되는지** 처럼 질문에 답할 수 있는 단위로 분리
- 누구에 관한 내용인지, 언제 발생한 일인지, 환자 | 보호자 | 목격자 중 누가 아는 내용인지 함께 기록
- 신체진찰 결과, 정답 진단, 채점 기준은 환자의 문진 답변에서 제외

**AI와 답변 생성 활성화 시 처리 순서**

1. 질문과 필요한 이전 대화 컨텍스트로 검색 후보 구성
2. 현재 증례에서 환자나 보호자에게 공개 가능한 정보 검색
3. 벡터 검색이 준비되어 있으면 **의미 검색(pgvector), 단어 검색(PostgreSQL)**, 동의어 사전 검색 함께 사용
4. 각 검색 결과의 순위를 RRF 방식으로 합쳐, 여러 검색에서 높은 순위에 나온 정보 우선
5. 모델이 질문의 뜻을 파악하고, 검색한 정보에서 근거를 골라 환자 답변 생성
6. 여러 질문이 한 번에 들어오면 첫 질문 하나에만 답하며, 근거는 최대 2개 사용
7. 서버 검사와 별도 모델 호출로 답변이 질문과 근거에 맞는지 확인

| 상황(설정)                                 | 처리 방식                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------- | --- |
| 검색 결과 확인                             | 현재 환자 사례와 데이터 버전에 맞는 정보인지 확인하고, 실제 값은 데이터에서 선택 |
| 답할 정보가 없거나 질문이 모호함           | 정보가 없으면 모른다고 답하고, 질문의 뜻이 불분명하면 다시 질문                  |
| `PATIENT_COMBINED_ENABLED=false`           | 질문 해석, 정보 검색, 답변 생성을 각각 나눠 처리                                 |
| 분리 처리 중 `PATIENT_RERANK_ENABLED=true` | 모델이 검색 후보를 검토해 질문에 잘 맞는 순서로 다시 정렬                        |     |

### 평가 자료 선택

- `EvaluationCriteriaService`가 현재 환자 사례에 맞는 경련 평가 기준(`cpx-34-seizure`), 공통 평가 기준, 진단 | 검사 | 환자 교육 답안 준비
- 학생의 원문 질문과 대화, 신체진찰 | 손소독 기록을 평가 기준과 함께 모델에 전달
- 평가 자료는 벡터 검색으로 찾지 않고, 환자 사례에 연결된 평가 모듈 ID로 JSON 파일 선택
- 환자가 답변할 때 사용하는 정보와 학생을 평가할 때 사용하는 기준을 따로 관리. 이를 통해 문진 중 정답 진단이나 채점 기준이 환자 답변에 섞이지 않도록 관리

<details>
<summary>실제 구현 코드 보기</summary>

**검색 결과 순위 결합**

<img width="1000" alt="벡터 검색과 단어 검색을 병렬 실행하고 RRF로 합치는 실제 코드 발췌" src="assets/readme/rag-retrieval-code.png" />

[PatientEvidenceService 코드](backend/src/patient/patient-evidence.service.ts)

**증례별 평가 기준 선택**

<img width="1000" alt="공통 평가 기준과 현재 증례의 평가 모듈을 불러오는 실제 코드 발췌" src="assets/readme/rag-evaluation-code.png" />

[EvaluationCriteriaService 코드](backend/src/rag/evaluation-criteria.service.ts)

</details>

<br />

---

<br />

## 동작 원리

\*_음성 질문 input부터 환자 답변과 평가까지의 플로우_

```text
① 질문 입력       실습생의 음성 또는 텍스트 질문
      ↓
② 음성 인식       STT를 통한 음성 텍스트 변환
      ↓
③ 근거 검색       현재 증례의 공개 정보 검색, 검색 순위 결합
      ↓
④ 환자 답변       질문 해석과 근거 선택, 첫 질문에 대한 답변 생성
      ↓
⑤ 답변 검증       서버 검사와 별도 모델의 의미 검증
      ↓
⑥ 화면과 음성     답변 표시, TTS를 통한 음성 재생
      ↓
⑦ 수행 기록       문진 내용, 진찰 항목, 손소독 시점 저장
      ↓
⑧ 최종 피드백     평가 기준과 수행 기록을 이용한 점수와 피드백
```

- 직접 입력한 질문의 STT 단계 생략
- AI 비활성화 시 사전 기반 질문 해석과 기존의 데이터 표현으로 응답
- 진찰과 손소독 기록의 문진 중 수시로 저장, 실습 종료 후 평가에 활용

<br />

---

<br />

## RAG 시퀀스 다이어그램

문진 : **검색 → 근거 컨텍스트 구성 → 답변 생성, 검증**
<br>
평가 : **평가 기준 선택 → 실습 기록과 결합 → 항목별 평가**

### 문진에서 환자 답변까지

```mermaid
%%{init: {"fontFamily": "Arial", "sequence": {"useMaxWidth": true, "actorMargin": 32, "height": 44, "messageMargin": 22, "noteMargin": 12, "mirrorActors": false, "wrap": false, "actorFontSize": 14, "messageFontSize": 14, "noteFontSize": 13}, "themeVariables": {"fontFamily": "Arial", "actorBkg": "transparent", "actorBorder": "#94a3b8", "noteBkgColor": "transparent", "noteBorderColor": "#94a3b8"}}}%%
sequenceDiagram
    autonumber
    actor Student as 실습생
    participant Pipeline as 환자 파이프라인
    participant Retriever as 근거 검색기
    participant Store as PostgreSQL / pgvector
    participant Model as 모델 API

    Student->>Pipeline: 문진 질문 입력
    Pipeline->>Retriever: 질문 | 대화 맥락, 증례 전달
    Note over Retriever,Store: Retrieval, 검색 범위 제한<br/>현재 증례의 공개 정보
    Retriever->>Retriever: 화자별 공개 범위 필터링<br/>동의어 사전 검색
    Retriever->>Model: 검색 질의 임베딩
    Model-->>Retriever: 질의 벡터

    par 의미 기반 검색
        Retriever->>Store: pgvector 유사도 검색
        Store-->>Retriever: 사실 ID와 검색 순위
    and 어휘 기반 검색
        Retriever->>Store: PostgreSQL 전문 검색
        Store-->>Retriever: 사실 ID와 검색 순위
    end

    Retriever->>Retriever: 벡터, 전문 검색, 사전 순위를 RRF로 결합<br/>사실 ID를 기존 데이터 값에 연결
    Retriever-->>Pipeline: 순위 결합을 마친 후보 근거
    Note over Pipeline,Model: Generation, 근거 컨텍스트 구성<br/>질문 + 후보 근거 + 환자 역할
    Pipeline->>Model: 질문 해석, 근거 선택, 답변 생성
    Model-->>Pipeline: 선택한 근거 ID와 환자 답변
    Pipeline->>Pipeline: 근거 ID, 공개 범위, 수치 검사<br/>첫 질문 하나, 선택 근거 최대 2개
    Pipeline->>Model: 별도 호출로 질문 | 근거 | 답변 의미 검증
    Model-->>Pipeline: 근거 일치 검증 결과
    Pipeline-->>Student: 환자 답변 또는 재확인 요청
```

벡터 색인이 준비되지 않으면 동의어 사전 검색 사용

### 실습 종료 후 평가

```mermaid
%%{init: {"fontFamily": "Arial", "sequence": {"useMaxWidth": true, "actorMargin": 32, "height": 44, "messageMargin": 22, "noteMargin": 12, "mirrorActors": false, "wrap": false, "actorFontSize": 14, "messageFontSize": 14, "noteFontSize": 13}, "themeVariables": {"fontFamily": "Arial", "actorBkg": "transparent", "actorBorder": "#94a3b8", "noteBkgColor": "transparent", "noteBorderColor": "#94a3b8"}}}%%
sequenceDiagram
    autonumber
    actor Student as 실습생
    participant Session as 평가 서비스
    participant Records as 실습 기록 DB
    participant Selector as 평가 기준 선택기
    participant Rubric as 평가 JSON 자료
    participant Model as 평가 모델

    Student->>Session: 실습 종료 및 평가 요청
    Session->>Records: 원문 대화, 진찰, 손소독 기록 조회
    Records-->>Session: 실습 수행 기록
    Session->>Selector: 현재 증례와 평가 모듈 정보 전달
    Note over Selector,Rubric: Retrieval, 평가 기준 선택<br/>모듈 ID 기반 JSON 자료 로드
    Selector->>Rubric: 경련 모듈과 공통 평가 기준 로드
    Rubric-->>Selector: cpx-34-seizure, 공통 기준
    Selector->>Selector: 증례별 진단, 검사, 교육 답안 결합
    Selector-->>Session: 평가 기준 묶음
    Note over Session,Model: Augmentation ·평가 컨텍스트 구성<br/>수행 기록 + 평가 기준 + 증례별 답안
    Session->>Model: 원문 대화 + 수행 기록<br/>평가 기준 + 증례별 답안
    Model-->>Session: 항목별 평가, 임시 점수, 피드백
    Session->>Records: 평가 결과 저장
    Session-->>Student: 점수와 피드백 제공
```

평가 자료는 벡터 유사도 검색 대신 모듈 ID로 선택
<br>
환자 답변에 공개하지 않는 진단, 채점 기준을 평가 단계에서 사용

<br />

---

<br />

## 시스템 구성

```mermaid
flowchart LR
    User[실습생] --> Front[React와 Three.js]
    Front --> Back[NestJS API]
    Back --> Data[(Supabase PostgreSQL)]
    Back --> Model[모델 API]
    Back --> Speech[음성 인식과 합성]
    Speech --> Model
    Back --> Patient[환자 응답 파이프라인]
    Patient --> Data
    Patient --> Model
    Back --> Eval[평가 기준 선택]
    Eval --> Rubric[경련 모듈과 공통 평가 JSON]
```

| 구성         | 역할                                                       |
| ------------ | ---------------------------------------------------------- |
| 프론트엔드   | 3D 진료실, 채팅, 음성 입출력, 타이머, 결과 화면            |
| 백엔드       | 증례와 세션 관리, 환자 답변 처리, 진찰과 손소독 기록, 평가 |
| 모델 API     | 질문 해석, 임베딩, 답변 생성과 검증, 평가, 음성 처리       |
| 데이터베이스 | 증례, 대화, 수행 기록, 평가 결과, 환자 사실과 벡터 저장    |
| 배포         | 프론트엔드 Vercel, 백엔드 Render                           |

<br />

---

<br />

## 기술 스택

### 프론트엔드

<p>
  <img alt="React" src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img alt="Three.js" src="https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=threedotjs&logoColor=white" />
  <img alt="React Three Fiber" src="https://img.shields.io/badge/React_Three_Fiber-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" />
</p>

### 백엔드와 데이터베이스

<p>
  <img alt="NestJS" src="https://img.shields.io/badge/NestJS-E0234E?style=for-the-badge&logo=nestjs&logoColor=white" />
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-2D3748?style=for-the-badge&logo=prisma&logoColor=white" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white" />
  <img alt="pgvector" src="https://img.shields.io/badge/pgvector-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" />
</p>

### AI와 배포

<p>
  <img alt="OpenAI API" src="https://img.shields.io/badge/OpenAI_API-412991?style=for-the-badge" />
  <img alt="Vercel" src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" />
  <img alt="Render" src="https://img.shields.io/badge/Render-000000?style=for-the-badge&logo=render&logoColor=white" />
</p>

<br />

---

<br />

## 기술적 도전

### 1. 3D 진료실을 브라우저에서 부드럽게

- Three.js와 React Three Fiber를 통한 진료실, 침상, 환자 모델 렌더링
- 채팅, 타이머, 평가 화면과 3D 장면의 상태 연결
- 저폴리 에셋과 장면 최적화를 통한 저사양 환경의 렌더링 부담 감소 목표

### 2. 환자 역과 채점 역을 분리한 이중 RAG

- 환자 응답 자료와 평가 자료의 접근 범위 분리
- 환자와 보호자가 아는 병력만 답변 근거로 사용
- 정답 진단과 채점 기준의 환자 답변 노출 방지
- 공통 평가 기준과 증례별 답안을 이용한 별도 평가

### 3. 음성 문진의 의도 분류

- STT로 변환한 질문의 문진 항목과 대화 행동 구분
- 증상, 대상, 발생 시점과 이전 질문 맥락을 고려한 근거 선택
- 학생의 원문 질문 보존을 통한 평가 근거 유지

### 4. 손소독과 진찰 이벤트의 채점 연동

- 실습 시작, 진찰 전, 진찰 후의 손소독 기록
- 신체진찰 항목, 환자 자세, 수행 여부와 결과 기록
- 대화 내용과 실제 수행 기록을 함께 활용한 평가

### 5. 안전 기준 반영

- 발작 지속시간, 의식 회복 지연 등 위험 신호 관련 문진 항목 반영
- 경련 평가 자료의 안전 기준과 증례별 주의사항 활용
- 응급 상황 안내 등 필요한 환자 교육 내용 평가

<br />

---

<br />

## 비용 기록과 호출 줄이기

- 측정 시점: 해커톤 개발 당시
- 현재 v2.5 파이프라인의 성능 비교와 별도인 사용량 기록

| 항목     | 변경 전 | 변경 후 | 감소율 |
| -------- | ------: | ------: | -----: |
| API 지출 |   $5.77 |   $1.24 |  78.5% |
| 총 토큰  | 804,577 | 182,436 |  77.3% |
| 요청 수  |   1,599 |     612 |  61.7% |

<p align="center">
  <img width="1000" alt="해커톤 개발 당시 API 사용량 비교 화면" src="https://github.com/user-attachments/assets/504b32e4-d730-4831-9bf6-afdc99572a42" />
</p>

| 호출 관리             | 적용 방식                                        |
| --------------------- | ------------------------------------------------ |
| 반복 질문             | 질문 임베딩과 검색 결과 캐시                     |
| 같은 작업의 동시 요청 | 진행 중 작업 공유                                |
| 통합 경로             | 질문 해석, 근거 선택, 답변 생성의 단일 호출 처리 |
| 검증 성공 결과        | 통합 처리 결과 캐시                              |
| 자료 재적재           | 같은 검색 텍스트의 기존 임베딩 재사용            |

<br />

---

<br />

## 프로젝트 구조

```text
CODE-MEDI-2026-1TEAM/
├── frontend/
│   └── src/
│       ├── components/        # 진료실, 침상, 채팅 화면
│       ├── hooks/             # 음성 입력과 출력
│       └── App.tsx            # 세션과 화면 상태
├── backend/
│   ├── src/
│   │   ├── cases/             # 증례 조회
│   │   ├── sessions/          # 문진과 수행 기록, 종료 평가
│   │   ├── patient/           # 현재 환자 응답 파이프라인
│   │   ├── rag/
│   │   │   ├── simulationRAG/ # 경련 증례 원자료
│   │   │   └── evaluationRAG/ # 평가 모듈과 공통 기준
│   │   ├── llm/               # 모델 호출과 임베딩
│   │   └── speech/            # 음성 인식과 합성 API
│   ├── prisma/                # DB 스키마, 마이그레이션, 초기 자료
│   └── scripts/               # 사실 적재와 검증
├── assets/readme/             # README 구조 그림과 코드 이미지
├── docs/                      # RAG 구현 설명
├── render.yaml                # 백엔드 배포 설정
└── package.json               # 공통 실행 명령
```

npm workspaces 기반 프론트엔드와 백엔드 관리, 루트에서 의존성 설치와 개발 서버 실행

<br />

---

<br />

## 실행 방법

필요 환경: Node.js 22.12 이상, npm, PostgreSQL

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 파일 준비

- `backend/.env.example` → `backend/.env` 복사 후 DB 연결 정보 설정
- `frontend/.env.example` → `frontend/.env` 복사

### 3. DB 초기화

```bash
npm run prisma:generate --workspace backend
npm run prisma:deploy --workspace backend
npm run prisma:seed --workspace backend
```

초기 증례: 21세 남성 경련 환자

### 4. 개발 서버 실행

각각 별도 터미널에서 실행:

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

접속 주소: 프론트엔드 <http://localhost:5173>, 백엔드 <http://localhost:3000>

<details>
<summary>경련 증례 8개와 벡터 검색 준비</summary>

필요 설정: 유효한 API 키, `PATIENT_AI_ENABLED=true`

```bash
npm run simulation:import --workspace backend
npm run patient:import-evidence --workspace backend -- --embed
```

임베딩 API 비용 발생 가능, 적재 완료 후 `ready` 색인 사용

</details>

<br />

---

<br />

## 환경 변수

| 파일            | 주요 설정                                         |
| --------------- | ------------------------------------------------- |
| `backend/.env`  | `DATABASE_URL`: PostgreSQL 연결 문자열            |
| `backend/.env`  | `OPENAI_API_KEY`, `OPENAI_MODEL`: AI 사용 시 설정 |
| `frontend/.env` | `VITE_API_BASE_URL=http://localhost:3000`         |

| AI 설정                           | 역할                                        |
| --------------------------------- | ------------------------------------------- |
| `PATIENT_PIPELINE_V2=true`        | 현재 환자 응답 파이프라인 사용              |
| `PATIENT_AI_ENABLED=true`         | 모델과 임베딩 사용, 자동 평가 활성화        |
| `PATIENT_GENERATION_ENABLED=true` | 모델을 통한 환자 답변 생성                  |
| `PATIENT_COMBINED_ENABLED=true`   | 질문 해석, 근거 선택, 답변 생성의 통합 처리 |

기본 예시 설정: AI와 답변 생성 비활성화, 텍스트 문진 사용

<br />

---

<br />

## 배포 설정

| 항목             | Vercel                           | Render                                                |
| ---------------- | -------------------------------- | ----------------------------------------------------- |
| 대상             | 프론트엔드                       | 백엔드                                                |
| Root Directory   | `frontend`                       | `backend`                                             |
| Build Command    | `npm run build`                  | `npm install --include=dev && npm run build`          |
| Start Command    | 없음                             | `npm run start:prod`                                  |
| Output Directory | `dist`                           | 없음                                                  |
| 필수 환경 변수   | `VITE_API_BASE_URL`: 백엔드 주소 | `DATABASE_URL`, AI 사용 시 `OPENAI_API_KEY`와 AI 설정 |

- Render: 루트 `render.yaml`의 Blueprint 설정 사용, 상태 확인 경로 `/health`
- 현재 환자 파이프라인의 벡터 색인: 별도 적재 필요

<br />

---

<br />

## API

| 메서드 | 경로                                | 설명                          |
| ------ | ----------------------------------- | ----------------------------- |
| `GET`  | `/health`                           | 서버 상태와 AI 기능 사용 여부 |
| `GET`  | `/cases`                            | 증례 목록                     |
| `GET`  | `/cases/:caseId`                    | 증례 상세                     |
| `POST` | `/sessions`                         | 실습 세션 생성                |
| `GET`  | `/sessions/:sessionId`              | 세션과 대화 기록 조회         |
| `POST` | `/sessions/:sessionId/messages`     | 질문 전송과 환자 답변         |
| `POST` | `/sessions/:sessionId/hand-hygiene` | 손소독 기록                   |
| `POST` | `/sessions/:sessionId/evaluate`     | 실습 종료 후 평가             |
| `POST` | `/speech/transcriptions`            | 녹음한 음성을 텍스트로 변환   |
| `POST` | `/speech/synthesis`                 | 환자 답변을 음성으로 변환     |

<br />

---

<br />

## 👥 팀 소개 (Team)

> **Team 1 · 아프지마 닥터 잠보** 🐘 — 음성으로 문진하고, 즉시 채점받는 CPX 시뮬레이터를 만들었습니다.

<table>
  <tr align="center">
    <td><strong>김다혜</strong></td>
    <td><strong>김지우</strong></td>
    <td><strong>유승주</strong></td>
    <td><strong><a href="https://github.com/hoon-ground">김지훈</a></strong></td>
    <td><strong><a href="https://github.com/SubJeeLee">이준섭</a></strong></td>
    <td><strong><a href="https://github.com/nyoeng">한나영</a></strong></td>
  </tr>

<tr align="center">
  <td><a href="#"><img src="https://github.com/github.png" width="110" alt="김다혜" /></a></td>
  <td><a href="#"><img src="https://github.com/github.png" width="110" alt="김지우" /></a></td>
  <td><a href="#"><img src="https://github.com/github.png" width="110" alt="유승주" /></a></td>
  <td><a href="https://github.com/hoon-groundd"><img src="https://github.com/hoon-ground.png" width="110" alt="김지훈" /></a></td>
  <td><a href="https://github.com/SubJeeLee"><img src="https://github.com/SubJeeLee.png" width="110" alt="이준섭" /></a></td>
  <td><a href="https://github.com/nyoeng"><img src="https://github.com/nyoeng.png" width="110" alt="한나영" /></a></td>
</tr>

  <tr align="center">
    <td rowspan="2">동아대학교 의학과</td>
    <td rowspan="2">동아대학교 의학과</td>
    <td rowspan="2">동아대학교 의학과</td>
    <td>경북대학교 컴퓨터학부</td>
    <td>경북대학교 컴퓨터학부</td>
    <td>경북대학교 컴퓨터학부</td>
  </tr>

  <tr align="center">
    <td>RAG</td>
    <td>FE·BE</td>
    <td>FE</td>
  </tr>
</table>

<br/>

<br />

---

<br />

## 3D 에셋 출처

| 에셋                              | 제작자     | 출처와 라이선스   |
| --------------------------------- | ---------- | ----------------- |
| Desk                              | dook       | Poly Pizza, CC-BY |
| Chair                             | J-Toastie  | Poly Pizza, CC-BY |
| Suit                              | Quaternius | Poly Pizza, CC-BY |
| Door                              | Quaternius | Quaternius        |
| Bed (Single)                      | Quaternius | Quaternius        |
| Character (Animated)              | Quaternius | Quaternius        |
| Animated Woman                    | Quaternius | Quaternius        |
| Man / Business Man                | Quaternius | Quaternius        |
| Hoodie / Casual / Beach Character | Quaternius | Quaternius        |

<br />

---

<br />

## ⚠️ 면책 조항 (Disclaimer)

Seizure CPX는 **의료 진단·치료 도구가 아니며**, 실제 진료나 임상 판단을 대체하지 않습니다. 의대생·의료인의 **CPX 학습·연습을 돕기 위한 교육용 시뮬레이터**로 설계되었습니다. 사용된 증례와 환자 응답은 학습 목적의 시뮬레이션이며, 실제 환자 정보가 아닙니다.

<br/>
