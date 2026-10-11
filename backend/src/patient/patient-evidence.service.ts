import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from '../llm/embeddings.service';
import { BoundedCache } from './bounded-cache';
import { CONCEPT_BY_ID, normalizeSearchText } from './concept-catalog';
import type {
  EvidenceAnswer,
  EvidenceCorpus,
  EvidenceFact,
  ProcessingIssue,
  TurnFrame,
} from './evidence-contract';
import { hashContent } from './evidence-facts';
import type { PatientPersona } from './patient-facts';
import { PatientEvidenceRepository } from './patient-evidence.repository';
import { PatientModelService } from './patient-model.service';
import { compactFact, compactFrame } from './model-evidence';
import { mapConcurrent } from './concurrency';

export function searchableEvidence(
  facts: EvidenceFact[],
  persona: PatientPersona,
): EvidenceFact[] {
  return facts.filter(
    (f) =>
      f.visibility === 'patient' &&
      (f.informationSource !== 'witness' || persona.witnessPresent === true) &&
      (f.informationSource !== 'caregiver' || persona.isGuardianCase === true),
  );
}

export function allowedEvidence(
  frame: TurnFrame,
  facts: EvidenceFact[],
  persona: PatientPersona,
): EvidenceFact[] {
  if (!frame.conceptId) return [];
  let candidates = facts.filter(
    (f) =>
      f.visibility === 'patient' &&
      f.subjectId === frame.subjectId &&
      (f.informationSource !== 'witness' || persona.witnessPresent === true) &&
      (f.informationSource !== 'caregiver' || persona.isGuardianCase === true),
  );
  const concepts =
    frame.conceptId === 'incontinence'
      ? ['urinary_incontinence', 'fecal_incontinence', 'incontinence']
      : frame.conceptId === 'post_symptoms'
        ? ['fatigue', 'muscle_pain', 'weakness', 'memory']
        : ['urinary_incontinence', 'fecal_incontinence'].includes(
              frame.conceptId,
            )
          ? [frame.conceptId, 'incontinence']
          : [frame.conceptId];
  if (['urinary_incontinence', 'fecal_incontinence'].includes(frame.conceptId))
    candidates = candidates.filter(
      (f) => f.conceptId !== 'incontinence' || f.value === false,
    );
  candidates = candidates.filter((f) => concepts.includes(f.conceptId));
  candidates = candidates.filter((f) => f.aspect === frame.aspect);
  if (frame.timeScope !== 'unspecified')
    candidates = candidates.filter((f) => f.timeScope === frame.timeScope);
  if (frame.eventId)
    candidates = candidates.filter((f) => f.eventId === frame.eventId);
  if (
    frame.phase !== 'general' &&
    ![
      'onset',
      'duration',
      'frequency',
      'location',
      'previous_episode',
    ].includes(frame.conceptId)
  )
    candidates = candidates.filter((f) => f.phase === frame.phase);
  else if (candidates.some((f) => f.phase === 'general'))
    candidates = candidates.filter((f) => f.phase === 'general');
  else if (new Set(candidates.map((f) => f.phase)).size > 1) return [];
  if (frame.conceptId === 'past_history') {
    const names: Record<string, string> = {
      DM: '당뇨',
      HTN: '고혈압',
      Tb: '결핵',
      TB: '결핵',
      Hepatitis: '간염',
    };
    const requested = candidates.filter((f) =>
      normalizeSearchText(frame.text).includes(
        normalizeSearchText(names[f.label] ?? f.label),
      ),
    );
    candidates = requested.length
      ? requested
      : candidates.filter((f) => f.value !== false);
  }
  return candidates;
}

export function lexicalRank(
  frame: TurnFrame,
  facts: EvidenceFact[],
): Array<{ id: string; score: number }> {
  const q = normalizeSearchText(frame.text);
  return facts
    .map((f) => {
      const definition = CONCEPT_BY_ID.get(f.conceptId);
      const tokens = [
        f.label,
        definition?.label ?? '',
        ...(definition?.aliases ?? []),
      ]
        .map(normalizeSearchText)
        .filter((t) => t.length > 1);
      const score =
        tokens.reduce(
          (sum, t) => sum + (q.includes(t) ? Math.min(t.length, 12) : 0),
          0,
        ) +
        (f.conceptId === frame.conceptId ? 2 : 0) +
        (f.aspect === frame.aspect ? 0.3 : 0) +
        (f.subjectId === frame.subjectId ? 0.1 : 0) +
        (f.phase === frame.phase ? 0.1 : 0);
      return { id: f.id, score };
    })
    .filter((r) => r.score >= 2)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
export function fuseRanks(
  vector: Array<{ id: string }>,
  lexical: Array<{ id: string }>,
  weights = { vector: 1, lexical: 1, k: 60 },
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();
  for (const [rows, weight] of [
    [vector, weights.vector],
    [lexical, weights.lexical],
  ] as const) {
    for (const [i, row] of rows.entries())
      scores.set(
        row.id,
        (scores.get(row.id) ?? 0) + weight / (weights.k + i + 1),
      );
  }
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

@Injectable()
export class PatientEvidenceService {
  private readonly queries = new BoundedCache<number[]>(512, 600_000);
  private readonly pendingQueries = new Map<string, Promise<number[] | null>>();
  private readonly results = new BoundedCache<{
    ranked: Array<{ id: string; score: number }>;
    vectorCandidates: number;
    lexicalCandidates: number;
  }>(512, 300_000);
  constructor(
    private readonly repository: PatientEvidenceRepository,
    private readonly embeddings: EmbeddingsService,
    private readonly model: PatientModelService,
    private readonly config: ConfigService,
  ) {}
  async retrieve(
    corpus: EvidenceCorpus,
    frames: TurnFrame[],
    persona: PatientPersona,
    candidatesOnly = false,
  ): Promise<{
    answers: EvidenceAnswer[];
    issues: ProcessingIssue[];
    trace: any;
  }> {
    const started = Date.now();
    const issues: ProcessingIssue[] = [];
    const trace: any = {
      source: 'scoped_lexical',
      vectorQueries: 0,
      vectorCandidates: 0,
      lexicalCandidates: 0,
      rerankTokens: 0,
      candidateCount: 0,
      reranker: 'scope_and_lexical',
      cacheHits: 0,
      rejectedCount: 0,
    };
    const history = frames.filter((f) => f.speechAct === 'ask_history');
    const allowed = new Map(
      history.map((f) => [
        f.frameId,
        searchableEvidence(corpus.facts, persona),
      ]),
    );
    let vectorReady = false;
    const profile = this.embeddings.getCacheKey();
    if (
      this.model.enabled &&
      history.some((f) => allowed.get(f.frameId)!.length)
    ) {
      try {
        vectorReady = await this.repository.ready(corpus, profile);
        if (!vectorReady)
          issues.push({ stage: 'retrieval', code: 'index_not_ready' });
      } catch {
        issues.push({ stage: 'retrieval', code: 'index_unavailable' });
      }
    }
    const vectors = new Map<string, number[]>();
    const queryText = (f: TurnFrame) => f.searchText || f.text;
    if (vectorReady) {
      const uncached: Array<{ id: string; text: string }> = [];
      const waiting: Array<Promise<void>> = [];
      const completions = new Map<string, (vector: number[] | null) => void>();
      for (const f of history) {
        if (!allowed.get(f.frameId)!.length) continue;
        const key = hashContent([profile, queryText(f)]);
        const cached = this.queries.get(key);
        if (cached) {
          vectors.set(f.frameId, cached);
          trace.cacheHits++;
          continue;
        }
        let pending = this.pendingQueries.get(key);
        if (!pending) {
          pending = new Promise<number[] | null>((resolve) =>
            completions.set(f.frameId, resolve),
          );
          this.pendingQueries.set(key, pending);
          uncached.push({ id: f.frameId, text: queryText(f) });
        } else trace.cacheHits++;
        waiting.push(
          pending.then((vector) => {
            if (vector) vectors.set(f.frameId, vector);
            else
              issues.push({
                stage: 'embedding',
                code: 'provider_unavailable',
                frameIds: [f.frameId],
              });
          }),
        );
      }
      if (uncached.length) {
        trace.vectorQueries = uncached.length;
        try {
          const batch = await this.embeddings.embedBatch(uncached);
          for (const request of uncached) {
            const vector =
              batch.find((row) => row.id === request.id)?.embedding ?? null;
            if (vector)
              this.queries.set(hashContent([profile, request.text]), vector);
            completions.get(request.id)!(vector);
          }
        } catch {
          for (const complete of completions.values()) complete(null);
        } finally {
          for (const request of uncached)
            this.pendingQueries.delete(hashContent([profile, request.text]));
        }
      }
      await Promise.all(waiting);
    }
    const requestedConcurrency = Number(this.config.get('PATIENT_SEARCH_CONCURRENCY') ?? 2);
    const concurrency = Number.isInteger(requestedConcurrency) ? Math.max(1, Math.min(8, requestedConcurrency)) : 2;
    const searchStarted = Date.now();
    const answers = await mapConcurrent(frames, concurrency, async (frame): Promise<EvidenceAnswer> => {
      if (frame.speechAct !== 'ask_history') {
        return {
          frame,
          status:
            frame.speechAct === 'clarify'
              ? 'needs_clarification'
              : 'acknowledge',
          facts: [],
        };
      }
      const candidates = allowed.get(frame.frameId)!;
      trace.candidateCount += candidates.length;
      trace.rejectedCount += corpus.facts.length - candidates.length;
      const lexical = lexicalRank(frame, candidates);
      const vector = vectors.get(frame.frameId);
      let ranked = lexical;
      if (vector) {
        const { frameId: _id, originalSpan: _span, ...queryFrame } = frame;
        const key = hashContent([
          corpus.caseId,
          corpus.caseVersion,
          profile,
          queryFrame,
          persona,
          'rrf-v2-broad',
          this.weights(),
        ]);
        try {
          const cachedResult = this.results.get(key);
          const result = cachedResult ?? await this.results.resolve(key, async () => {
            const ids = candidates.map((f) => f.id);
            const rows = await Promise.all([
              this.repository.vectors(corpus, profile, vector, ids, 24),
              this.repository.lexical(
                corpus,
                profile,
                frame.text.split(/[\s?？!,.;]+/).filter(Boolean),
                ids,
                24,
              ),
            ]);
            const accepted = rows.map((list) =>
              list.filter(
                (row) => ids.includes(row.id) && Number.isFinite(row.score),
              ),
            );
            return {
              ranked: fuseRanks(
                accepted[0],
                fuseRanks(accepted[1], lexical),
                this.weights(),
              ),
              vectorCandidates: accepted[0].length,
              lexicalCandidates: accepted[1].length,
            };
          });
          ranked = result.ranked;
          if (cachedResult) trace.cacheHits++;
          trace.vectorCandidates += result.vectorCandidates;
          trace.lexicalCandidates += result.lexicalCandidates;
          if (result.vectorCandidates) trace.source = 'hybrid_rrf';
          else
            issues.push({
              stage: 'retrieval',
              code: 'vector_candidates_missing',
              frameIds: [frame.frameId],
            });
          trace.lexicalSource = 'postgres_fts_and_catalogue';
        } catch {
          issues.push({
            stage: 'retrieval',
            code: 'index_unavailable',
            frameIds: [frame.frameId],
          });
        }
      }
      const canonical = new Map(candidates.map((f) => [f.id, f]));
      let selected = ranked
        .map((r) => canonical.get(r.id))
        .filter((f): f is EvidenceFact => !!f);
      if (
        !candidatesOnly &&
        this.config.get<string>('PATIENT_RERANK_ENABLED') === 'true' &&
        this.model.enabled &&
        selected.length > 1
      ) {
        try {
          const result = await this.model.json(
            'patient_evidence_rerank',
            {
              type: 'object',
              additionalProperties: false,
              required: ['factIds'],
              properties: {
                factIds: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: selected.slice(0, 12).map((f) => f.id),
                  },
                },
              },
            },
            '질문이 요구하는 측면·사건·시점에 정확히 답하는 최소 사실만 순서대로 선택한다. 자료가 답을 지원하지 않으면 빈 배열. 새로운 사실이나 진단을 만들지 않는다.',
            {
              frame: compactFrame(frame),
              candidates: selected
                .slice(0, 12)
                .map((f) => compactFact(f, f.id)),
            },
          );
          const ids = result.data.factIds;
          trace.rerankTokens += result.tokens;
          if (
            !Array.isArray(ids) ||
            ids.some((id) => !selected.slice(0, 12).some((f) => f.id === id))
          )
            throw new Error('Invalid rerank');
          selected = [...new Set<string>(ids)].map((id) => canonical.get(id)!);
          trace.reranker = 'semantic_model';
        } catch {
          issues.push({
            stage: 'reranking',
            code: 'rerank_invalid',
            frameIds: [frame.frameId],
          });
        }
      }
      // IDs from the DB/model never supply a value; values always come from this immutable corpus.
      // Broad candidates are never directly disclosed. The integrated path selects them semantically;
      // the compatibility/offline path still performs strict final scope checks.
      if (!candidatesOnly) {
        const scoped = allowedEvidence(frame, corpus.facts, persona);
        const finalIds = new Set(scoped.map((f) => f.id));
        selected = selected.filter((f) => finalIds.has(f.id));
        // Lexical recall alone can miss group facts such as generic incontinence.
        // The explicit compatibility frame has already passed the strict scope contract.
        if (!selected.length && !this.model.enabled) selected = scoped;
      }
      const unique = selected
        .filter(
          (f, i, all) =>
            all.findIndex((other) => other.reply === f.reply) === i,
        )
        .slice(0, candidatesOnly ? 32 : 2);
      return {
        frame,
        status: unique.length ? 'known' : 'not_provided',
        facts: unique,
      };
    });
    trace.timings = { embeddingAndReadinessMs: searchStarted - started, searchMs: Date.now() - searchStarted };
    trace.searchConcurrency = concurrency;
    return { answers, issues, trace };
  }
  private weights() {
    const number = (key: string, fallback: number) => {
      const value = Number(this.config.get<string>(key));
      return Number.isFinite(value) && value > 0 ? value : fallback;
    };
    return {
      vector: number('PATIENT_VECTOR_WEIGHT', 1),
      lexical: number('PATIENT_LEXICAL_WEIGHT', 1),
      k: number('PATIENT_RRF_K', 60),
    };
  }
}
