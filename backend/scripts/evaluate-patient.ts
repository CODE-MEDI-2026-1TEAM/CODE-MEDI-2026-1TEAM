import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import dataset from '../src/rag/simulationRAG/data/seizure_cases.json';
import fixtures from '../test/fixtures/patient-conversation-cases.json';
import holdout from '../test/fixtures/patient-question-holdout.json';
import { PatientResponseService } from '../src/llm/patient-response.service';
import { analyzePatientQuestions } from '../src/patient/patient-question';
import {
  extractPatientFacts,
  selectPatientFacts,
  type PatientPersona,
} from '../src/patient/patient-facts';

async function main() {
  Logger.overrideLogger(['error', 'warn']);
  const apiMode = process.argv.includes('--api');
  const modelMode = process.argv.includes('--model');
  const holdoutMode = process.argv.includes('--holdout');
  if (modelMode && !process.env.OPENAI_API_KEY)
    throw new Error('--model requires OPENAI_API_KEY');
  const repeats = Math.max(
    1,
    Math.min(10, Number(process.env.PATIENT_EVAL_REPEATS ?? 1)),
  );
  const config = modelMode
    ? new ConfigService(process.env)
    : ({ get: () => undefined } as unknown as ConfigService);
  const service = new PatientResponseService(config);
  const apiBase = (
    process.env.PATIENT_EVAL_API_URL ?? 'http://localhost:3000'
  ).replace(/\/$/, '');
  const http = async (path: string, body?: object): Promise<any> => {
    const response = await fetch(apiBase + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error(`API ${response.status}: ${path}`);
    return response.json();
  };
  const liveCases = apiMode ? (await http('/cases')).cases : [];
  const results: Array<Record<string, unknown>> = [];
  const evaluationSessionIds: string[] = [];
  const usages: Array<{
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  }> = [];
  for (let repeat = 0; repeat < repeats; repeat++) {
    if (holdoutMode) {
      for (const expected of holdout) {
        const start = performance.now();
        const raw = analyzePatientQuestions(expected.text);
        const questions = await service.resolveQuestions(raw, undefined, {
          onUsage: (usage) => usages.push(usage),
        });
        const q = questions[0];
        const passed =
          questions.length === 1 &&
          ('topic' in expected
            ? q.topic === expected.topic
            : q.kind === expected.kind) &&
          (!('aspect' in expected) || q.aspect === expected.aspect);
        results.push({
          repeat,
          question: expected.text,
          expected,
          questions,
          usedModel: raw.some(
            (q) => q.kind === 'clarify' && q.allowModel !== false,
          ),
          passed,
          elapsedMs: performance.now() - start,
        });
      }
      continue;
    }
    for (const expected of fixtures.cases) {
      const item = dataset.증례목록.find(
        (c) => c.증례번호 === expected.caseNumber,
      )!;
      const basic = item.문진및신체진찰정보.기본정보;
      const liveCase = liveCases.find(
        (c: any) =>
          c.simulationCaseId ===
          `seizure_case_${String(expected.caseNumber).padStart(2, '0')}`,
      );
      if (apiMode && !liveCase)
        throw new Error(`Missing imported case ${expected.caseNumber}`);
      const persona: PatientPersona = liveCase?.patientProfile ?? {
        name: basic.성함,
        birthDate: basic.생년월일,
        ageRaw: basic.나이,
        sex: basic.성별,
        isGuardianCase: basic.source === 'caregiver',
        witnessPresent: item.목격자정보.목격자유무,
        witnessRelation: item.목격자정보.관계,
      };
      const facts = extractPatientFacts(
        String(expected.caseNumber),
        item.문진및신체진찰정보,
        persona,
        basic.주소,
      );
      const session = apiMode
        ? (await http('/sessions', { caseId: liveCase.id })).session
        : null;
      if (session) evaluationSessionIds.push(session.id);
      for (let index = 0; index < fixtures.questions.length; index++) {
        const [question, expectedTopic] = fixtures.questions[index];
        const start = performance.now();
        const questions = await service.resolveQuestions(
          analyzePatientQuestions(question),
        );
        const answers = questions.map((q) => ({
          question: q,
          facts: selectPatientFacts(q, facts, persona),
        }));
        const reference = await service.generateReply({
          patientPersona: persona,
          answers,
          allowedFacts: facts,
        });
        const reply = apiMode
          ? (
              await http(`/sessions/${session.id}/messages`, {
                content: question,
                requestId: randomUUID(),
              })
            ).message.content
          : reference;
        const value = expected.values[index];
        const values = answers.flatMap((a) => a.facts.map((f) => f.value));
        const passed =
          questions.length === 1 &&
          questions[0].topic === expectedTopic &&
          JSON.stringify(values) ===
            JSON.stringify(value === null ? [] : [value]) &&
          reply === reference;
        results.push({
          repeat,
          caseNumber: expected.caseNumber,
          question,
          expectedTopic,
          expectedValue: value,
          selectedValues: values,
          reply,
          passed,
          elapsedMs: performance.now() - start,
        });
      }
    }
    if (!apiMode) {
      for (const edge of fixtures.edges) {
        const start = performance.now();
        const questions = await service.resolveQuestions(
          analyzePatientQuestions(
            edge.text,
            'previous' in edge ? edge.previous : undefined,
          ),
          'previous' in edge ? edge.previous : undefined,
        );
        const passed =
          (!('topics' in edge) ||
            JSON.stringify(questions.map((q) => q.topic)) ===
              JSON.stringify(edge.topics)) &&
          (!('kinds' in edge) ||
            JSON.stringify(questions.map((q) => q.kind)) ===
              JSON.stringify(edge.kinds)) &&
          (!('phases' in edge) ||
            JSON.stringify(questions.map((q) => q.phase)) ===
              JSON.stringify(edge.phases)) &&
          (!('aspects' in edge) ||
            JSON.stringify(questions.map((q) => q.aspect)) ===
              JSON.stringify(edge.aspects));
        results.push({
          repeat,
          question: edge.text,
          questions,
          passed,
          elapsedMs: performance.now() - start,
        });
      }
    }
  }
  const latencies = results
    .map((r) => Number(r.elapsedMs))
    .sort((a, b) => a - b);
  const summary = {
    generatedAt: new Date().toISOString(),
    mode: apiMode
      ? 'live-api'
      : modelMode
        ? 'local-with-model-intent'
        : 'local-no-api',
    repeats,
    total: results.length,
    successfulModelCalls: usages.length,
    usage: {
      promptTokens: usages.reduce((n, u) => n + u.prompt_tokens, 0),
      completionTokens: usages.reduce((n, u) => n + u.completion_tokens, 0),
      totalTokens: usages.reduce((n, u) => n + u.total_tokens, 0),
    },
    passed: results.filter((r) => r.passed).length,
    medianMs: latencies[Math.floor(latencies.length * 0.5)],
    p95Ms:
      latencies[
        Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))
      ],
    notes: apiMode
      ? 'Creates evaluation sessions. Exact output regression against the local reference; human review still required.'
      : 'Local parsing, fact selection and rendering only. Does not measure database/network latency or live model quality.',
    evaluationSessionIds,
  };
  const output = resolve(
    process.env.PATIENT_EVAL_OUTPUT ??
      '../docs/patient-simulator-evaluation.json',
  );
  mkdirSync(resolve(output, '..'), { recursive: true });
  writeFileSync(output, JSON.stringify({ summary, results }, null, 2) + '\n');
  console.log(JSON.stringify({ ...summary, output }, null, 2));
  if (summary.passed !== summary.total) process.exitCode = 1;
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Evaluation failed');
  process.exitCode = 1;
});
