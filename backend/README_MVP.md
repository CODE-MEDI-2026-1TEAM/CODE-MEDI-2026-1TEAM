# AI CPX Backend MVP

NestJS backend for a lightweight CPX standardized-patient simulator.

## Setup

1. Install dependencies.

```bash
npm install
```

2. Create `.env` from `.env.example`.

```bash
cp .env.example .env
```

3. Fill these values in `.env`.

```bash
DATABASE_URL="your-supabase-postgres-url"
OPENAI_API_KEY="your-openai-api-key"
OPENAI_MODEL="gpt-4.1-mini"
PORT=3000
```

4. Generate Prisma client, migrate the DB, and seed the first CPX case.

```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run prisma:seed
```

If you are applying the checked-in migration to Supabase, use:

```bash
npm run prisma:deploy
npm run prisma:seed
```

5. Run locally.

```bash
npm run start:dev
```

## MVP API

- `GET /health`
- `GET /cases`
- `GET /cases/:caseId`
- `POST /sessions` with `{ "caseId": "seizure-21m" }`
- `GET /sessions/:sessionId`
- `POST /sessions/:sessionId/messages` with `{ "content": "언제 경련했나요?" }`
- `POST /sessions/:sessionId/evaluate`

## Deployment Notes

Use Render as a Web Service.

- Build command: `npm install && npm run prisma:generate && npm run build`
- Start command: `npm run start:prod`
- Environment variables: `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `PORT`
