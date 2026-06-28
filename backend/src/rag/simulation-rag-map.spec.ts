import { readFileSync } from 'fs';
import { join } from 'path';
import { SIMULATION_TOPIC_TO_EVALUATION_MODULE } from './simulation-rag-map';

type ModuleIndexEntry = {
  module_id: string;
};

describe('SIMULATION_TOPIC_TO_EVALUATION_MODULE', () => {
  it('points only to evaluationRAG modules that exist', () => {
    const moduleIndex = JSON.parse(
      readFileSync(
        join(process.cwd(), 'src/rag/evaluationRAG/data/cpx_module_index.json'),
        'utf-8',
      ),
    ) as ModuleIndexEntry[];
    const moduleIds = new Set(moduleIndex.map((entry) => entry.module_id));

    for (const moduleId of Object.values(
      SIMULATION_TOPIC_TO_EVALUATION_MODULE,
    )) {
      expect(moduleIds.has(moduleId)).toBe(true);
    }
  });
});
