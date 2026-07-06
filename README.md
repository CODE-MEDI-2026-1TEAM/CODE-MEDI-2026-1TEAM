<p align="center">
  <img width="1152" height="648" alt="Cover picture" src="https://github.com/user-attachments/assets/403e8939-caf4-4674-96ce-7b84b50cbaa3" />
</p>

<h1 align="center">Seizure CPX</h1>

<p align="center">
  <sub>AI 기반 경련 문진 CPX 시뮬레이션 — 3D 진료실에서 말로 문진하고, 즉시 채점받는 임상수행 연습 도구</sub>
</p>

<p align="center">
  <strong>🏆 2026 CODE:MEDI 해커톤 대상 (7팀 중 1위)</strong><br/>
  <sub>동아대학교 의과대학 주최</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Medical_Education-CPX-4A80F0?style=flat" alt="Medical Education" />
  &nbsp;
  <img src="https://img.shields.io/badge/3D-three.js-000000?style=flat&logo=threedotjs&logoColor=white" alt="three.js" />
  &nbsp;
  <img src="https://img.shields.io/badge/Retrieval-Dual_RAG-A78BFA?style=flat" alt="Dual RAG" />
</p>


## 📖 프로젝트 소개 (Introduction)

> **"AI로 CPX 연습을 실제처럼, 피드백은 즉시."**

**Seizure CPX** 는 의대생·의료인이 혼자서도 **경련(seizure) 증례 CPX**\*를 반복 연습할 수 있도록 만든 **AI 기반 문진·신체진찰·자동 채점 시뮬레이터**입니다.

학생은 3D 진료실에서 **음성으로 환자에게 문진**하고, 앉거나 누운 **3D 환자 모델을 신체진찰**하며, 문진이 끝나면 CPX 교재 기준에 따라 **영역별 채점과 총평**을 즉시 받습니다. 텍스트 챗봇을 넘어, 실제 시험장에 가까운 경험을 목표로 했습니다.

> \* **CPX (Clinical Performance Examination, 임상수행평가)** — 표준화 환자를 대상으로 문진·신체진찰·환자 교육 등 임상 수행 능력을 평가하는 실기 시험.

- **팀:** Team 1 · **아프지마 닥터 잠보** 🐘
- **개발 기간:** `2026.06.28 ~ 2026.06.29` 
- **배포 주소:** [https://code-medi-2026-1-team-frontend.vercel.app/](https://code-medi-2026-1-team-frontend.vercel.app/)

<br/>

### 🩺 우리가 만드는 것 — "채점받는 CPX 연습장"

| 기존 의료 챗봇이 하는 것 | Seizure CPX가 하는 것 |
| :--- | :--- |
| 텍스트로 증상을 문답 | **음성 문진 → STT → 환자 음성(TTS) 응답** |
| 단일 환자와 1:1 대화 | 소아 케이스의 **보호자·목격자 문진**까지 반영 |
| 표현·공감 위주 피드백 | CPX 교재 기반 **영역별 채점 + 총평 + 감별진단 체크** |
| 신체진찰은 말로만 | **3D 환자 모델**을 앉은/누운 자세로 **진찰 시뮬레이션** |
| 근거 없는 자유 생성 | **경련 증례 RAG**에서 검색한 근거로 응답·평가 |

<br/>

## 📌 목차

- [프로젝트 소개](#-프로젝트-소개-introduction)
- [핵심 기능](#-핵심-기능-key-features)
- [🧊 3D 모델링 & three.js](#-3d-모델링--threejs)  
- [🔍 이중 RAG 구조](#-이중-rag-구조-dual-rag-architecture)  
- [동작 원리](#-동작-원리-how-it-works)
- [시스템 아키텍처](#-시스템-아키텍처-architecture)
- [기술 스택](#-기술-스택-tech-stack)
- [기술적 도전](#-기술적-도전-technical-challenges)
- [토큰 최적화](#-토큰-최적화-cost-optimization)
- [프로젝트 구조 (모노레포)](#-프로젝트-구조-project-structure--monorepo)
- [실행 방법](#-실행-방법-getting-started)
- [환경 변수](#-환경-변수-environment)
- [배포](#-배포-deployment)
- [API 명세](#-api-명세-api-reference)
- [3D 에셋 출처](#-3d-에셋-출처-asset-credits)
- [팀 소개](#-팀-소개-team)
- [면책 조항](#-면책-조항-disclaimer)

<br/>

## ✨ 핵심 기능 (Key Features)

Seizure CPX의 한 세션은 **입장 → 음성 문진 → 3D 신체진찰 → 자동 채점**으로 이어집니다.

<br/>

### 🧍 증례 케이스별 · 연령대별 3D 환자 모델링

> 서로 다른 연령대(소아 · 청소년 · 성인)를 **실제 경련 증례에 기반해 각각의 3D 모델**로 구현했습니다. 특히 **보호자 동반 소아 케이스**를 포함해, 환자 외 정보원에서 병력을 얻어야 하는 경련 진료의 특성을 반영했습니다.

<table>
  <tr align="center">
    <td width="50%">
      <strong>소아 (7개월)</strong>
    </td>
    <td width="50%">
      <strong>소아 (9세)</strong>
    </td>
  </tr>
  <tr align="center">
    <td>
      <img
        width="450"
        alt="소아 7개월"
        src="https://github.com/user-attachments/assets/0c3a2a42-0805-40e7-a35e-84401b95e7b1"
      />
    </td>
    <td>
      <img
        width="450"
        alt="소아 9세"
        src="https://github.com/user-attachments/assets/06ff3729-5470-4619-a06b-6989f0909d08"
      />
    </td>
  </tr>

  <tr align="center">
    <td>
      <strong>청소년 (15세)</strong>
    </td>
    <td>
      <strong>성인 (42세)</strong>
    </td>
  </tr>
  <tr align="center">
    <td>
      <img
        width="450"
        alt="청소년 15세"
        src="https://github.com/user-attachments/assets/786b3618-31ff-40da-89d5-bb17fc8bffe4"
      />
    </td>
    <td>
      <img
        width="450"
        alt="성인 42세"
        src="https://github.com/user-attachments/assets/5280f1be-70b7-488e-8390-a3c87a85c493"
      />
    </td>
  </tr>
</table>

<br/>

### 🛏 신체 진찰 시뮬레이션

> 텍스트 대화를 넘어, **앉은 자세와 누운 자세**에서 진찰이 가능한 환경을 구현했습니다. **진료실 ↔ 침상/침실 장면 전환**으로 Brudzinski sign · Kernig sign 등 경련 관련 신체진찰을 3D로 시뮬레이션합니다.

<table>
  <tr align="center">
    <td width="50%"><strong>수막자극징후 검사 (Brudzinski / Kernig)</strong></td>
    <td width="50%"><strong>침상 자세 진찰 화면</strong></td>
  </tr>
  <tr align="center">
    <td>
      <img
        width="480"
        alt="수막자극징후 검사"
        src="https://github.com/user-attachments/assets/39a70dc0-d819-4797-9b28-18f22c9f5a42"
      />
    </td>
    <td>
      <img
        width="480"
        alt="침상 자세 진찰 화면"
        src="https://github.com/user-attachments/assets/6bcf7904-8948-40ae-be2f-a46a3fcc9465"
      />
    </td>
  </tr>
</table>
<br/>

### 📋 직관적인 채점 UI

> CPX 교재 기반 평가 항목과 LLM 기반 총평을 함께 제공합니다. 단순 승패가 아니라, **왜 이 점수인지**를 영역별로 돌아볼 수 있습니다.

| 평가 요소 | 설명 |
| :--- | :--- |
| **문진 완료 현황** | 종합 평가 점수(100점 만점) 및 **LLM 총평** 제공 |
| **신체진찰 요약** | 문진 중 시행한 **신체진찰 내역**을 한 번에 정리 |
| **손소독 타이밍** | 최소 3회(진찰 시작 · 검진 전 · 검진 후) **손소독제 사용 여부** 확인 |
| **상황지침 평가** | CPX 교재의 **감별 진단 문항**을 그대로 평가 항목에 반영 |

<table>
  <tr align="center">
    <td><img width="660" height="412" alt="ezgif-663f2d8766bf3fa0" src="https://github.com/user-attachments/assets/6d245f99-ffa2-4392-902d-77318c243a5d" />
</td>
  </tr>
</table>

<br/>

### 🎬 시연 영상

> 실제 문진 → 신체진찰 → 채점까지의 전체 흐름을 영상으로 확인하세요.

▶️ **https://www.youtube.com/watch?v=vS0mFh-VEVU**

<br/>

---

## 🧊 3D 모델링 & three.js

> ⭐ **Seizure CPX를 "시험장처럼" 느끼게 하는 핵심.** 텍스트 문진을 실제 CPX 진료실 경험으로 바꾸는 3D 레이어입니다.

**Three.js + React Three Fiber** 를 활용해, 브라우저 위에 **진료실 · 침상 · 환자 아바타**를 실시간으로 렌더링했습니다.

### 무엇을 3D로 구현했나

| 구성 | 내용 |
| :--- | :--- |
| **진료실 3D 룸** | 책상 · 모니터(활력징후) · 침대가 놓인 진료실 공간 |
| **연령대별 아바타** | 소아(0 ~ 24개월) · 소아(2 ~ 12세) · 청소년(12 ~ 19세) · 성인(20세 ~) — 증례별 별도 모델 |
| **자세 전환** | 앉은 자세(문진) ↔ 누운 자세(신체진찰) 전환 |
| **장면 전환** | 진료실 → 침상/침실 장면 이동으로 진찰 맥락 재현 |
| **진찰 인터랙션** | Brudzinski · Kernig 등 신체진찰 동작과 결과 표시 연동 |

### 설계 포인트

- **React Three Fiber** 로 React 컴포넌트처럼 3D 씬을 선언적으로 구성해, 채팅 UI·타이머·채점 UI와 상태를 자연스럽게 연결했습니다.
- 저폴리(low-poly) 에셋으로 **모바일·저사양 환경에서도 부드러운 렌더링**을 목표로 했습니다.
- 3D 씬은 "보여주기용"이 아니라, **손소독·진찰 이벤트를 기록**해 채점 근거로 이어지도록 설계했습니다.

<table>
  <tr align="center">
    <td><img width="1463" height="823" alt="스크린샷 2026-06-29 083702" src="https://github.com/user-attachments/assets/efad7e7a-6275-4833-b058-f26d9c95ce08" />
</td>
  </tr>
</table>

> 무료 에셋을 적극 활용하되, 증례 구현에 필요한 환자 모델과 주요 오브젝트는 직접 제작하여 사용하였습니다.

<br/>

---

## 🔍 이중 RAG 구조 (Dual RAG Architecture)

> ⭐ **환자를 연기하는 RAG와, 학생을 채점하는 RAG를 분리했습니다.** 실제 경련 증례를 근거로, 응답 생성과 평가를 각각 독립적으로 수행합니다.

하나의 LLM에 모든 것을 맡기지 않고, **역할이 다른 두 개의 지식 팩(RAG Knowledge Packs)** 으로 나눴습니다.

<table>
  <tr align="center">
    <td><strong>DB Schema: Simulation / Evaluation RAG 저장 구조</strong></td>
    <td><strong>Simulation RAG: 환자 답변용 청크 분리</strong></td>
    <td><strong>Evaluation RAG: 경련 문진 체크리스트와 안전 기준</strong></td>
  </tr>
  <tr align="center">
    <td>
      <img src="이미지_URL_1" width="300" alt="DB Schema: Simulation / Evaluation RAG 저장 구조" />
    </td>
    <td>
      <img src="이미지_URL_2" width="300" alt="Simulation RAG: 환자 답변용 청크 분리" />
    </td>
    <td>
      <img src="이미지_URL_3" width="300" alt="Evaluation RAG: 경련 문진 체크리스트와 안전 기준" />
    </td>
  </tr>
</table>

### 🗣 Simulation RAG — 환자 응답 생성용

실제 경련 증례를 **환자 답변용 청크로 분리**해, 환자·보호자가 말할 수 있는 정보만 검색해 응답합니다.

| Retrieval Scope | 역할 |
| :--- | :--- |
| `patient_dialogue` | 환자/보호자가 말할 수 있는 정보 |
| `physical_exam` | 진찰 또는 활력징후 확인 시 노출되는 결과 |
| `examiner_only` | 문제자·평가자 확인용 정보 (환자 답변에 사용 금지) |
| `teaching_notes` | 학습 코멘트 (환자 답변에 사용 금지) |

> 예: `seizure_case_01_initial` · `seizure_case_01_history` · `seizure_case_01_physical_exam` 처럼 하나의 증례를 문진 흐름 단위로 청크화했습니다.

### 📝 Evaluation RAG — 문진 수행 평가용

경련 문진 **체크리스트와 안전 기준**을 근거로 학생의 수행을 채점합니다.

| Rubric 요소 | 내용 |
| :--- | :--- |
| `common_required_checks` | 발작 시작·지속시간·유발 상황·의식 소실 등 필수 문진 항목 |
| `starred_condition_triggers` | 열성 경련 · 영아 연축 · 근간대성 간질 · 측두엽 뇌전증 · 뇌수막염 등 **감별진단 trigger** |
| `starred_physical_exam_checks` | 활력징후 · 신경학적 검진 · Todd's palsy · DTR 등 신체진찰 항목 |
| `safety_critical_checks` | 발작 5분 이상 지속 · 의식 회복 지연 등 **red flag 안전 교육** 항목 |

### 왜 나눴나

- **환각 방지** — 환자 역은 "환자가 알 만한 정보"만, 평가 역은 "채점 기준"만 보게 해 서로의 정보가 섞이지 않습니다.
- **추적 가능성** — 채점 결과를 rubric 항목과 1:1로 매칭해, *왜 이 점수인지* 역추적할 수 있습니다.
- **확장성** — 새 증례를 추가할 때 두 RAG를 독립적으로 확장할 수 있습니다.

<br/>

## 🧠 동작 원리 (How It Works)

> 음성 인식 결과가 **환자 응답과 채점 기준에서 같은 의도로 해석**되도록 하나의 흐름으로 연결했습니다.

```
① 음성 입력        학생 질문
      │
② STT             텍스트화
      │
③ 의도 분류        문진 항목 매칭
      │
④ Case 검색        RAG DB (Simulation RAG)
      │
⑤ 환자 응답        TTS 음성 출력
      │
⑥ 이벤트 기록      진찰 / 손소독 타이밍 저장
      │
⑦ 최종 피드백      Evaluation RAG 기반 영역별 채점
```

> **핵심** — 학생 질문 → 의도 분류 → 환자 응답 → 채점이 **같은 기준(문진 항목)** 으로 작동합니다.

<br/>

## 🏗 시스템 아키텍처 (Architecture)

<table>
  <tr align="center">
    <td><img width="1920" height="1080" alt="KakaoTalk_20260705_172802775" src="https://github.com/user-attachments/assets/49d2bf44-7b6d-47d8-81c2-326c05e6df49" />
</p></td>
  </tr>
</table>
  

| 레이어 | 구성 | 역할 |
| :--- | :--- | :--- |
| **Frontend** | React · Vite · **Three.js** (Vercel) | 3D 진료실 · 채팅 · 음성 응답 · 12분 타이머 · 채점 결과 UI |
| **Backend** | NestJS · Prisma (Render) | Session / Case API, STT·TTS 중계, RAG Retrieval, CPX Evaluation |
| **AI** | OpenAI API | GPT 환자 응답 · STT · TTS · Embedding |
| **DB** | Supabase — PostgreSQL + **pgvector** | Cases / Sessions / Messages · RAG Vectors 저장 |
| **RAG** | Simulation RAG · Evaluation RAG | 환자 응답 생성용 · 문진 평가용 지식 팩 |
| **CI/CD** | GitHub Push → Build & Deploy | Frontend는 Vercel, Backend는 Render 배포 |

<br/>

## 🛠 기술 스택 (Tech Stack)

### 💻 Frontend

| Category | Stack |
| :--- | :--- |
| **Language** | ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) |
| **Framework** | ![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB) ![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white) |
| **3D** | ![three.js](https://img.shields.io/badge/three.js-000000?logo=threedotjs&logoColor=white) ![React Three Fiber](https://img.shields.io/badge/React_Three_Fiber-000000?logo=react&logoColor=61DAFB) |
| **Voice** | ![Web Speech / STT·TTS](https://img.shields.io/badge/STT_·_TTS-4A80F0?logoColor=white) |
| **Deploy** | ![Vercel](https://img.shields.io/badge/Vercel-000000?logo=vercel&logoColor=white) |

### 🗄 Backend

| Category | Stack |
| :--- | :--- |
| **Language** | ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) |
| **Framework** | ![NestJS](https://img.shields.io/badge/NestJS-E0234E?logo=nestjs&logoColor=white) |
| **ORM** | ![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white) |
| **Deploy** | ![Render](https://img.shields.io/badge/Render-46E3B7?logo=render&logoColor=white) |

### 🤖 AI / RAG

| Category | Stack |
| :--- | :--- |
| **LLM / Voice** | ![OpenAI](https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white) |
| **Retrieval** | ![Dual RAG](https://img.shields.io/badge/Dual_RAG-A78BFA?logoColor=white) ![pgvector](https://img.shields.io/badge/pgvector-4169E1?logo=postgresql&logoColor=white) |

### 🧱 Database / Infra

| Category | Stack |
| :--- | :--- |
| **Database** | ![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white) |
| **CI/CD** | ![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?logo=githubactions&logoColor=white) |

<br/>

## 🔥 기술적 도전 (Technical Challenges)

### 1. 3D 진료실을 브라우저에서 부드럽게

Three.js + React Three Fiber로 진료실·침상·아바타를 렌더링하고, 채팅·타이머·채점 UI와 상태를 연결했습니다. 저폴리 에셋과 씬 최적화로 저사양 환경에서도 매끄러운 경험을 목표로 했습니다.

### 2. 환자 역과 채점 역을 분리한 이중 RAG

하나의 LLM이 "환자이자 채점관"이 되면 정보가 새어 채점이 오염됩니다. Simulation RAG와 Evaluation RAG로 **정보 접근 범위 자체를 분리**해, 환자는 알 만한 것만 말하고 채점은 rubric만 보게 했습니다.

### 3. 음성 문진의 의도 분류

STT로 변환된 학생 질문을 **문진 항목에 매칭**해, 환자 응답과 채점이 같은 기준으로 해석되도록 파이프라인을 설계했습니다.

### 4. 손소독·진찰 이벤트의 채점 연동

3D 씬의 인터랙션(손소독 3회 · 신체진찰 시행)을 이벤트로 기록해, 단순 대화가 아니라 **실제 CPX 수행 절차**를 채점에 반영했습니다.

### 5. 안전(red flag) 기준 반영

`safety_critical_checks`로 발작 지속시간·의식 회복 지연 등 응급 신호 교육 항목을 평가에 포함해, 경련 진료의 안전 감별을 훈련하도록 했습니다.

<br/>

## 💰 토큰 최적화 (Cost Optimization)

> 반복 실습이 핵심인 CPX 특성상, **저렴하고 확장 가능한 SaaS 모델**을 목표로 토큰 사용을 최적화했습니다.
<table>
  <tr align="center">
    <td><img width="1808" height="870" alt="KakaoTalk_20260629_084926528" src="https://github.com/user-attachments/assets/504b32e4-d730-4831-9bf6-afdc99572a42" />
</p></td>
  </tr>
</table>


| 지표 | 최적화 전 | 최적화 후 | 절감 |
| :--- | ---: | ---: | ---: |
| **API 지출** | $5.77 | **$1.24** | ▼ 78.6% |
| **총 토큰** | 804,577 | **182,436** | ▼ 77.3% |
| **요청 수** | 1,599 | **612** | ▼ 61.7% |

> 토큰 비용을 **78.6% 절감**하여, 경련 CPX 반복 실습을 기존 표준화 환자 기반 훈련보다 저렴하게 제공할 수 있는 기반을 만들었습니다.

<br/>

## 📁 프로젝트 구조 (Project Structure — Monorepo)

> 하나의 GitHub repo 안에서 **프론트엔드와 백엔드를 함께 관리**하는 모노레포입니다. 루트에서 의존성을 한 번에 설치하고, 배포 시에는 각 폴더를 Root Directory로 지정합니다.

```txt
seizure-cpx/
├── backend/      # NestJS + Prisma + Supabase + OpenAI  (Render 배포)
│   ├── src/      #  Cases · Sessions · Speech(STT/TTS) · RAG · Evaluation
│   ├── prisma/   #  schema.prisma · migrations · seed
│   └── data/     #  경련 증례 · Simulation/Evaluation RAG 지식 팩
├── frontend/     # Vite + React + three.js  (Vercel 배포)
│   └── src/      #  3D 진료실 · 음성 문진 UI · 채점 결과 UI
├── render.yaml   # Render Blueprint (Root Directory: backend)
└── package.json  # 모노레포 루트 스크립트
```

> **왜 모노레포인가** — 프론트·백엔드가 같은 증례 스키마와 API 계약을 공유하기 때문에, 한 repo에서 함께 버전 관리하면 변경 사항을 원자적으로 반영할 수 있습니다. 배포는 Render(`backend/`)와 Vercel(`frontend/`)로 각각 Root Directory만 다르게 지정합니다.

<br/>

## 💻 실행 방법 (Getting Started)

### 사전 요구사항

- Node.js `>= 20`
- npm
- Supabase 프로젝트 (PostgreSQL + pgvector)
- OpenAI API Key

### 설치 & 실행

루트에서 프론트·백엔드 의존성을 **한 번에** 설치합니다.

```bash
# 1. 저장소 클론
git clone https://github.com/<org>/<seizure-cpx>.git
cd <seizure-cpx>

# 2. 루트에서 의존성 설치 (모노레포)
npm install
```

백엔드와 프론트는 **터미널 2개**를 열어 각각 실행합니다.

```bash
npm run dev:backend    # NestJS  → http://localhost:3000
```

```bash
npm run dev:frontend   # Vite    → http://localhost:5173
```

### 데이터베이스 (Supabase + Prisma)

증례 마이그레이션과 seed는 `backend/`에서 실행합니다. 현재 seed에는 **21세 남성 경련 환자** 케이스가 포함되어 있습니다.

```bash
cd backend
npm run prisma:deploy
npm run prisma:seed
```

### 자주 쓰는 스크립트

| 명령 | 설명 |
| :--- | :--- |
| `npm run dev:backend` | NestJS 개발 서버 |
| `npm run dev:frontend` | Vite 개발 서버 |
| `npm run build` | backend + frontend 프로덕션 빌드 |
| `npm run test` | backend 유닛 테스트 |
| `npm run lint` | backend lint |

<br/>

## 🔑 환경 변수 (Environment)

실제 키는 GitHub에 커밋하지 않습니다. `.env.example`을 복사해 사용하세요.

### `backend/.env`

```env
DATABASE_URL="Supabase session pooler URL"
OPENAI_API_KEY="OpenAI API key"
OPENAI_MODEL="gpt-5.5"
OPENAI_EMBEDDING_MODEL="text-embedding-3-large"
OPENAI_EMBEDDING_DIMENSIONS=1536
PORT=3000
```

### `frontend/.env`

```env
VITE_API_BASE_URL=http://localhost:3000
```

> 배포 후에는 `VITE_API_BASE_URL`을 배포된 백엔드 URL(예: `https://your-render-service.onrender.com`)로 바꿉니다. Supabase 연결 문자열은 Supabase 프로젝트의 `Connect` 메뉴에서 가져옵니다.

<br/>

## 🚀 배포 (Deployment)

### Render — Backend

루트의 `render.yaml`을 Blueprint로 연결하면 아래 설정이 자동 반영됩니다.

```txt
Root Directory:      backend
Build Command:       npm install && npm run prisma:generate && npm run build
Pre-Deploy Command:  npm run prisma:deploy && npm run prisma:seed
                     && npm run rag:import -- data/cases/seizure-21m.json
                     && npm run simulation:import
Start Command:       npm run start:prod
Health Check Path:   /health
```

- Migration·seed·RAG import가 **pre-deploy에서 자동 실행**되므로, 첫 배포 전에 Supabase DB 비밀번호와 OpenAI API key만 Render에 입력하면 됩니다.
- `PORT`는 Render가 자동 주입하므로 배포 환경에서 직접 설정하지 않아도 됩니다.

### Vercel — Frontend

같은 repo를 import하고 Root Directory를 `frontend`로 지정합니다.

```txt
Framework Preset:  Vite
Root Directory:    frontend
Install Command:   npm install
Build Command:     npm run build
Output Directory:  dist
```

백엔드 Render URL이 확정되면 Vercel의 Production/Preview 환경변수 `VITE_API_BASE_URL`에 동일하게 입력합니다.

<br/>

## 🌐 API 명세 (API Reference)

| Method | Endpoint | 설명 |
| :--- | :--- | :--- |
| `GET` | `/health` | 헬스 체크 |
| `GET` | `/cases` | 증례 목록 조회 |
| `GET` | `/cases/:caseId` | 특정 증례 상세 조회 |
| `POST` | `/sessions` | CPX 세션 생성 |
| `GET` | `/sessions/:sessionId` | 세션 조회 |
| `POST` | `/sessions/:sessionId/messages` | 문진 메시지 전송 · 환자 응답 |
| `POST` | `/sessions/:sessionId/evaluate` | 문진 종료 후 채점 실행 |

<br/>

## 🎨 3D 에셋 출처 (Asset Credits)

> 3D 진료실·환자 모델에 사용된 에셋의 라이선스 및 출처입니다. **CC-BY** 에셋은 저작자 표기가 필요합니다.

| 에셋 | 저작자 | 라이선스 · 출처 |
| :--- | :--- | :--- |
| Desk | dook | CC-BY · Poly Pizza |
| Chair | J-Toastie | CC-BY · Poly Pizza |
| Suit | Quaternius | CC-BY · Poly Pizza |
| Door | Quaternius | Quaternius |
| Bed (Single) | Quaternius | Quaternius |
| Character (Animated) | Quaternius | Quaternius |
| Animated Woman | Quaternius | Quaternius |
| Man / Business Man | Quaternius | Quaternius |
| Hoodie / Casual / Beach Character | Quaternius | Quaternius |

<br/>

## 👥 팀 소개 (Team)

> **Team 1 · 아프지마 닥터 잠보** 🐘 — 음성으로 문진하고, 즉시 채점받는 CPX 시뮬레이터를 만들었습니다.

<table>
  <tr align="center">
    <td><strong>김다혜</strong></td>
    <td><strong>김지우</strong></td>
    <td><strong>유승주</strong></td>
    <td><strong><a href="https://github.com/GITHUB_ID_김지훈">김지훈</a></strong></td>
    <td><strong><a href="https://github.com/GITHUB_ID_이준섭">이준섭</a></strong></td>
    <td><strong><a href="https://github.com/GITHUB_ID_한나영">한나영</a></strong></td>
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

## ⚠️ 면책 조항 (Disclaimer)

Seizure CPX는 **의료 진단·치료 도구가 아니며**, 실제 진료나 임상 판단을 대체하지 않습니다. 의대생·의료인의 **CPX 학습·연습을 돕기 위한 교육용 시뮬레이터**로 설계되었습니다. 사용된 증례와 환자 응답은 학습 목적의 시뮬레이션이며, 실제 환자 정보가 아닙니다.

<br/>

<p align="center">
  <sub>Seizure CPX · AI로 경련 CPX 연습을 실제처럼, 피드백은 즉시 🐘</sub>
</p>
