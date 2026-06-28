# CODE MEDI 경련 CPX MVP

LLM 기반 경련 CPX 표준화 환자 시뮬레이터 MVP입니다. 의대생이 AI 환자와 문진을 연습하고, 대화 후 체크리스트 기반 피드백을 받는 흐름을 목표로 합니다.

## Monorepo Structure

```txt
MVP/
  backend/    NestJS + Prisma + Supabase + OpenAI
  frontend/   Vite + React client
  package.json
```

하나의 GitHub repo 안에서 프론트와 백엔드를 함께 관리합니다. Render 배포 시에는 `backend/`, Vercel 또는 정적 배포 시에는 `frontend/`를 각각 Root Directory로 사용하면 됩니다.

## Quick Start

루트에서 한 번에 의존성을 설치합니다.

```bash
npm install
```

백엔드와 프론트는 터미널을 2개 열어서 각각 실행합니다.

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

기본 주소:

```txt
Backend: http://localhost:3000
Frontend: http://localhost:5173
```

## Environment

백엔드 환경변수는 `backend/.env`에 둡니다. 실제 키는 GitHub에 올리지 않습니다.

```bash
cd backend
cp .env.example .env
```

필수 값:

```env
DATABASE_URL="Supabase session pooler URL"
OPENAI_API_KEY="OpenAI API key"
OPENAI_MODEL="gpt-4.1-mini"
PORT=3000
```

프론트 환경변수는 `frontend/.env`에 둡니다.

```bash
cd frontend
cp .env.example .env
```

```env
VITE_API_BASE_URL=http://localhost:3000
```

Render 배포 후에는 `VITE_API_BASE_URL`을 배포된 백엔드 URL로 바꿉니다.

```env
VITE_API_BASE_URL=https://your-render-service.onrender.com
```

## Database

Supabase DB migration과 seed는 백엔드 폴더에서 실행합니다.

```bash
cd backend
npm run prisma:deploy
npm run prisma:seed
```

현재 seed에는 `21세 남성 경련 환자` 케이스가 포함되어 있습니다.

## Scripts

루트에서 자주 쓰는 명령입니다.

```bash
npm run build        # backend + frontend production build
npm run test         # backend unit test
npm run lint         # backend lint
npm run dev:backend  # NestJS dev server
npm run dev:frontend # Vite dev server
```

## Render Backend Deploy

Render Web Service 설정 예시:

```txt
Root Directory: backend
Build Command: npm install && npm run prisma:generate && npm run build
Start Command: npm run start:prod
```

Render Environment Variables:

```env
DATABASE_URL="Supabase session pooler URL"
OPENAI_API_KEY="OpenAI API key"
OPENAI_MODEL="gpt-4.1-mini"
PORT=3000
```

## API

- `GET /health`
- `GET /cases`
- `GET /cases/:caseId`
- `POST /sessions`
- `GET /sessions/:sessionId`
- `POST /sessions/:sessionId/messages`
- `POST /sessions/:sessionId/evaluate`
