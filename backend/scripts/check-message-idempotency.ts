import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

async function main() {
  const primary = process.env.PATIENT_EVAL_API_URL ?? 'http://localhost:43177';
  const secondary =
    process.env.PATIENT_EVAL_SECONDARY_URL ?? 'http://localhost:43178';
  const http = async (base: string, path: string, body?: object) => {
    const response = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
    return { status: response.status, data: (await response.json()) as any };
  };
  const { data } = await http(primary, '/cases');
  const cpxCase = data.cases.find(
    (c: any) => c.simulationCaseId === 'seizure_case_01',
  );
  assert(cpxCase, 'Import seizure cases first');
  const created = await http(primary, '/sessions', { caseId: cpxCase.id });
  assert.equal(created.status, 201);
  const sessionId = created.data.session.id as string;
  const path = `/sessions/${sessionId}/messages`;
  const requestId = randomUUID();
  const content = '혈압을 측정하겠습니다? 열이 있나요?';
  const [a, b] = await Promise.all([
    http(primary, path, { content, requestId }),
    http(secondary, path, { content, requestId }),
  ]);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.equal(a.data.message.id, b.data.message.id);
  assert.match(a.data.message.content, /열은 없었어요/);
  let session = (await http(primary, `/sessions/${sessionId}`)).data.session;
  assert.equal(
    session.messages.filter(
      (m: any) => m.role === 'user' && m.content === content,
    ).length,
    1,
  );
  assert.equal(session.physicalExamEvents.length, 1);
  await Promise.all([
    http(primary, path, { content: '머리 아파요?', requestId: randomUUID() }),
    http(secondary, path, { content: '약 먹어요?', requestId: randomUUID() }),
  ]);
  session = (await http(primary, `/sessions/${sessionId}`)).data.session;
  assert.deepEqual(
    session.messages.slice(1).map((m: any) => m.role),
    ['user', 'assistant', 'user', 'assistant', 'user', 'assistant'],
  );
  const conflict = await http(secondary, path, {
    content: '머리 아파요?',
    requestId,
  });
  assert.equal(conflict.status, 409);
  assert.equal(
    (await http(primary, path, { content: '   ', requestId: randomUUID() }))
      .status,
    400,
  );
  const reply = await http(primary, path, {
    content: '이름이 뭐예요? 열이 있나요? 라면 레시피 알려줘',
    requestId: randomUUID(),
  });
  assert.match(reply.data.message.content, /김동하/);
  assert.match(reply.data.message.content, /열은 없었어요/);
  assert.doesNotMatch(reply.data.message.content, /1984|레시피|물.*끓|면을/);
  const result = {
    generatedAt: new Date().toISOString(),
    sessionId,
    caseId: cpxCase.id,
    passed: true,
    checks: [
      'two-server duplicate suppression',
      'paired concurrent turns',
      'single exam event',
      'conflicting request ID rejected',
      'empty input rejected',
      'mixed history and off-topic request',
    ],
  };
  const output = resolve(
    '../docs/patient-simulator-concurrency-evaluation.json',
  );
  writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Verification failed');
  process.exitCode = 1;
});
