import { ConfigService } from '@nestjs/config';
import data from '../rag/simulationRAG/data/seizure_cases.json';
import fixture from '../../test/fixtures/patient-v2-regression.json';
import { PatientModelService } from './patient-model.service';
import { TurnUnderstandingService } from './turn-understanding.service';
import { PatientEvidenceService } from './patient-evidence.service';
import { GroundedResponseService } from './grounded-response.service';
import { PatientPipelineService } from './patient-pipeline.service';

describe('240 source-bound provisional regression questions', () => {
  const config = { get: () => undefined } as unknown as ConfigService;
  const model = new PatientModelService(config);
  const pipeline = new PatientPipelineService(
    new TurnUnderstandingService(model),
    new PatientEvidenceService(
      {} as any,
      { getCacheKey: () => 'offline' } as any,
      model,
      config,
    ),
    new GroundedResponseService(model, config),
  );
  it.each(fixture.rows)('$id: $question', async (row) => {
    const c = data.증례목록[row.caseIndex - 1];
    const result = await pipeline.turn({
      caseId: `case${row.caseIndex}`,
      patientPrompt: JSON.stringify(c.문진및신체진찰정보),
      chiefComplaint: c.문진및신체진찰정보.기본정보.주소,
      persona: {
        isGuardianCase: [2, 8].includes(row.caseIndex),
        witnessPresent: row.caseIndex !== 6,
        witnessRelation: '목격자',
      },
      content: row.question,
    });
    expect(result.answers).toHaveLength(1);
    expect(result.answers[0].status).toBe(row.expectedStatus);
    for (const fact of result.answers[0].facts)
      expect(row.expectedSources).toContainEqual({
        path: fact.sourceRef.path,
        value: fact.sourceRef.originalValue,
      });
    expect(
      result.processing.generationTokens +
        result.processing.understandingTokens,
    ).toBe(0);
  });
});
