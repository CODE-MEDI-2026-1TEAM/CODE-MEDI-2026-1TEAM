import type { EvidenceCorpus } from './evidence-contract';
export function auditSourceCoverage(prompt: string, corpus: EvidenceCorpus) {
  const indexed = new Set(corpus.facts.map((f) => f.sourceRef.path));
  const issues = new Map(corpus.issues.map((i) => [i.path, i.reason]));
  const rows: Array<{
    path: string;
    status: 'searchable' | 'excluded' | 'not_provided' | 'review_required';
    reason: string;
  }> = [];
  const publicRoot =
    /^(기본정보|O_L_D_Co_Ex|C|A_F|E_외_과_약|사회력_가족력|사회력_가족력_여성력|발달력)(\.|$)/;
  const walk = (node: any, path: string, source: string, missing: boolean) => {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      const nextSource = typeof node.source === 'string' ? node.source : source;
      const nextMissing = missing || node.원문정보없음 === true;
      for (const [key, value] of Object.entries(node))
        walk(value, path ? `${path}.${key}` : key, nextSource, nextMissing);
      return;
    }
    const metadata = /(^|\.)(source|원문[^.]*|해석[^.]*|근거[^.]*)$/.test(path);
    const publicConcern = /^(질문_특이사항|P_E_및_특이사항)\.질문$/.test(path);
    const publicField = publicRoot.test(path) || publicConcern;
    const status = indexed.has(path)
      ? 'searchable'
      : metadata ||
          !publicField ||
          !['patient', 'caregiver', 'witness'].includes(source)
        ? 'excluded'
        : missing || node == null || node === '' || node === '-'
          ? 'not_provided'
          : 'review_required';
    rows.push({
      path,
      status,
      reason: indexed.has(path)
        ? 'source_fact_linked'
        : (issues.get(path) ??
          (status === 'excluded'
            ? 'metadata_station_exam_or_nonpatient_source'
            : status === 'not_provided'
              ? 'source_unknown'
              : 'unmapped_or_ambiguous')),
    });
  };
  walk(
    JSON.parse(prompt),
    '',
    corpus.facts[0]?.informationSource ?? 'patient',
    false,
  );
  return {
    reviewStatus: 'developer_provisional',
    counts: Object.fromEntries(
      ['searchable', 'excluded', 'not_provided', 'review_required'].map((s) => [
        s,
        rows.filter((r) => r.status === s).length,
      ]),
    ),
    rows,
  };
}
