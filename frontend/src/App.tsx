import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { request } from './api';
import ChatSidebar from './components/ChatSidebar';
import BedsideScene from './components/BedsideScene';
import ClinicScene from './components/ClinicScene';
import { choosePatientCaseKey } from './patientModels';
import { resolveVitalSigns } from './vitals';
import type { CpxCase, Evaluation, Message, Session } from './types';

const isConversationDebugEnabled =
  import.meta.env.VITE_ENABLE_CONVERSATION_DEBUG === 'true';

export default function App() {
  const [cases, setCases] = useState<CpxCase[]>([]);
  const [selectedCaseSlug, setSelectedCaseSlug] = useState('');
  const [assignedCase, setAssignedCase] = useState<CpxCase | null>(null);
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(true);
  const [isAssigningCase, setIsAssigningCase] = useState(false);
  const [isManualSelectionOpen, setIsManualSelectionOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isEvaluationModalOpen, setIsEvaluationModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'desk' | 'bed'>('desk');
  const [isHandWashed, setIsHandWashed] = useState(false);

  const activeCase = useMemo(
    () =>
      session?.case ??
      cases.find((cpxCase) => cpxCase.slug === selectedCaseSlug),
    [cases, selectedCaseSlug, session],
  );

  const latestAssistantMessage = useMemo(
    () =>
      session?.messages
        .filter((message) => message.role === 'assistant')
        .at(-1),
    [session],
  );
  const patientCaseKey = useMemo(
    () =>
      choosePatientCaseKey(
        activeCase
          ? {
            age: activeCase.patientProfile.age,
            ageRaw: activeCase.patientProfile.ageRaw,
            name: activeCase.patientProfile.name,
            seed: activeCase.slug,
            sex: activeCase.patientProfile.sex,
            title: activeCase.title,
          }
          : null,
      ),
    [activeCase],
  );

  const patientReply =
    latestAssistantMessage?.content ??
    (activeCase ? '안녕하세요.' : null) ??
    '진료를 시작하면 환자 응답이 여기에 표시됩니다.';
  const isPatientSpeaking = Boolean(latestAssistantMessage) && !isLoading;
  const vitals = useMemo(
    () => resolveVitalSigns(activeCase?.patientProfile.vitalSigns),
    [activeCase?.patientProfile.vitalSigns],
  );

  const clearError = useCallback(() => setError(null), []);

  const startSession = useCallback(async (caseSlug: string) => {
    if (!caseSlug) return;

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setSession(null);
    setIsEvaluationModalOpen(false);
    setIsLoading(true);
    setError(null);

    try {
      const data = await request<{ session: Session }>('/sessions', {
        method: 'POST',
        body: JSON.stringify({ caseId: caseSlug }),
      });
      setSession(data.session);
    } catch (err) {
      setError(err instanceof Error ? err.message : '세션 생성에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const openCaseModal = useCallback(() => {
    setAssignedCase(null);
    setIsAssigningCase(false);
    setIsManualSelectionOpen(false);
    setIsEvaluationModalOpen(false);
    setIsCaseModalOpen(true);
  }, []);

  const assignRandomCase = useCallback(() => {
    if (cases.length === 0 || isAssigningCase || isLoading) return;

    setIsAssigningCase(true);
    setAssignedCase(null);
    setIsManualSelectionOpen(false);
    setError(null);

    window.setTimeout(() => {
      const randomCase = cases[Math.floor(Math.random() * cases.length)];
      setAssignedCase(randomCase);
      setSelectedCaseSlug(randomCase.slug);
      setIsAssigningCase(false);
    }, 900);
  }, [cases, isAssigningCase, isLoading]);

  const selectCaseManually = useCallback((cpxCase: CpxCase) => {
    setAssignedCase(cpxCase);
    setSelectedCaseSlug(cpxCase.slug);
  }, []);

  const startAssignedCase = useCallback(() => {
    if (!assignedCase) return;

    setIsCaseModalOpen(false);
    void startSession(assignedCase.slug);
  }, [assignedCase, startSession]);

  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const trimmed = content.trim();
      if (!session || session.status === 'completed' || !trimmed) return false;

      setIsLoading(true);
      setError(null);

      debugConversation('frontend.message.send', {
        sessionId: session.id,
        caseSlug: session.case.slug,
        simulationCaseId: session.case.simulationCaseId,
        content: trimmed,
        contentLength: trimmed.length,
      });

      try {
        const data = await request<{ message: Message; debug?: object }>(`/sessions/${session.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: trimmed }),
        });
        debugConversation('frontend.message.response', {
          sessionId: session.id,
          assistantReply: data.message.content,
          backendDebug: data.debug ?? null,
        });
        const refreshed = await request<{ session: Session }>(
          `/sessions/${session.id}`,
        );
        setSession(refreshed.session);
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : '환자 응답 생성에 실패했습니다.',
        );
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [session],
  );

  const evaluateSession = useCallback(async () => {
    if (!session || isEvaluating) return;

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    setIsEvaluating(true);
    setError(null);

    try {
      const data = await request<{ evaluation: Evaluation }>(
        `/sessions/${session.id}/evaluate`,
        { method: 'POST' },
      );
      setSession((current) =>
        current?.id === session.id
          ? {
            ...current,
            status: 'completed',
            endedAt: new Date().toISOString(),
            evaluation: data.evaluation,
          }
          : current,
      );
      setIsEvaluationModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '채점에 실패했습니다.');
    } finally {
      setIsEvaluating(false);
    }
  }, [isEvaluating, session]);

  useEffect(() => {
    request<{ cases: CpxCase[] }>('/cases')
      .then((data) => {
        setCases(data.cases);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main className={isCaseModalOpen ? 'simulation-app modal-open' : 'simulation-app'}>
      {viewMode === 'bed' ? (
        <BedsideScene
          isPatientSpeaking={isPatientSpeaking}
          patientCaseKey={patientCaseKey}
          patientReply={patientReply}
          showPatientBubble={
            !isCaseModalOpen &&
            !isEvaluationModalOpen &&
            !isEvaluating &&
            Boolean(session)
          }
        />
      ) : (
        <ClinicScene
          isPatientSpeaking={isPatientSpeaking}
          patientCaseKey={patientCaseKey}
          patientReply={patientReply}
          vitals={vitals}
          showPatientBubble={
            !isCaseModalOpen &&
            !isEvaluationModalOpen &&
            !isEvaluating &&
            Boolean(session)
          }
        />
      )}

      <div className="scene-overlay bottom-center">
        <button
          className="view-toggle-button"
          onClick={() => setViewMode((mode) => (mode === 'desk' ? 'bed' : 'desk'))}
          type="button"
        >
          {viewMode === 'desk' ? '침대에 눕히기' : '책상으로 돌아가기'}
        </button>
        <button
          className={isHandWashed ? 'view-toggle-button is-active' : 'view-toggle-button'}
          disabled={isHandWashed}
          onClick={() => {
            setIsHandWashed(true);
            window.setTimeout(() => setIsHandWashed(false), 1000);
          }}
          type="button"
        >
          {isHandWashed ? '소독 완료' : '손 소독하기'}
        </button>
      </div>

      <div className="scene-overlay top-left">
        <p className="eyebrow">CODE MEDI Seizure Lab</p>
        <h1>{activeCase ? patientDisplayName(activeCase) : '케이스 배정 대기'}</h1>
        <span>{activeCase?.title ?? '환자 배정을 시작하세요'}</span>
        <button className="case-change-button" onClick={openCaseModal} type="button">
          재배정
        </button>
      </div>

      <ChatSidebar
        activeCase={activeCase}
        error={error}
        isEvaluating={isEvaluating}
        isLoading={isLoading}
        onClearError={clearError}
        onEvaluate={evaluateSession}
        onOpenEvaluation={() => setIsEvaluationModalOpen(true)}
        onSendMessage={sendMessage}
        session={session}
        vitals={vitals}
      />

      {session?.evaluation && isEvaluationModalOpen ? (
        <EvaluationResultModal
          evaluation={session.evaluation}
          onClose={() => setIsEvaluationModalOpen(false)}
        />
      ) : null}

      {isCaseModalOpen ? (
        <section
          aria-labelledby="case-picker-title"
          aria-modal="true"
          className="case-modal-backdrop"
          role="dialog"
        >
          <div className="case-modal">
            <header className="case-modal-header">
              <h2 id="case-picker-title">환자 배정</h2>
              <p>실제 CPX처럼 케이스를 직접 고르지 않고, 준비된 경련 환자 중 한 명을 무작위로 배정합니다.</p>
            </header>

            <div className="case-assignment-panel">
              {cases.length > 0 ? (
                <>
                  <div className="case-assignment-main">
                    <div className={isAssigningCase ? 'assignment-orbit spinning' : 'assignment-orbit'}>
                      {isAssigningCase ? <span /> : null}
                      <strong>{isAssigningCase ? '배정 중' : assignedCase ? '배정 완료' : '대기 중'}</strong>
                    </div>

                    {isManualSelectionOpen ? (
                      <section className="manual-case-panel" aria-label="직접 환자 선택">
                        <div className="manual-case-list">
                          {cases.map((cpxCase) => {
                            const isSelected = assignedCase?.slug === cpxCase.slug;

                            return (
                              <button
                                aria-pressed={isSelected}
                                className={isSelected ? 'manual-case-option selected' : 'manual-case-option'}
                                key={cpxCase.id}
                                onClick={() => selectCaseManually(cpxCase)}
                                type="button"
                              >
                                <span className="case-option-group">
                                  {getCaseAgeGroup(cpxCase)}
                                </span>
                                <strong>{patientDisplayName(cpxCase)}</strong>
                                <span className="case-option-meta">
                                  {formatCaseMeta(cpxCase)}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ) : (
                      <section className="assigned-case-card" aria-live="polite">
                        {assignedCase ? (
                          <>
                            <span className="case-option-group">
                              {getCaseAgeGroup(assignedCase)}
                            </span>
                            <strong>{patientDisplayName(assignedCase)}</strong>
                            <span className="case-option-meta">
                              {formatCaseMeta(assignedCase)}
                            </span>
                            <span>{assignedCase.title}</span>
                          </>
                        ) : (
                          <>
                            <strong>아직 배정된 환자가 없습니다.</strong>
                            <span>배정 버튼을 누르면 경련 케이스 중 하나가 무작위로 선택됩니다.</span>
                          </>
                        )}
                      </section>
                    )}
                  </div>
                </>
              ) : (
                <div className="case-option-empty">
                  <strong>케이스를 불러오는 중입니다.</strong>
                  <span>{error ?? '잠시만 기다려 주세요.'}</span>
                </div>
              )}
            </div>

            <footer className="case-modal-actions">
              <button
                className="case-random-button"
                disabled={cases.length === 0 || isAssigningCase || isLoading}
                onClick={assignRandomCase}
                type="button"
              >
                {isAssigningCase ? '배정 중' : assignedCase ? '다시 배정' : '무작위 배정'}
              </button>
              <button
                aria-expanded={isManualSelectionOpen}
                className="case-manual-toggle"
                disabled={cases.length === 0 || isAssigningCase || isLoading}
                onClick={() => setIsManualSelectionOpen((isOpen) => !isOpen)}
                type="button"
              >
                {isManualSelectionOpen ? '직접 선택 닫기' : '직접 선택'}
              </button>
              <button
                className="case-start-button"
                disabled={!assignedCase || isAssigningCase || isLoading}
                onClick={startAssignedCase}
                type="button"
              >
                {isLoading ? '세션 준비 중' : '진료 시작'}
              </button>
            </footer>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function EvaluationResultModal({
  evaluation,
  onClose,
}: {
  evaluation: Evaluation;
  onClose: () => void;
}) {
  const score = clampScore(evaluation.score);
  const readiness = getEvaluationReadiness(score);
  const categorySummaries = buildEvaluationCategorySummaries(evaluation, score);
  const formattedDate = formatEvaluationDate(evaluation.createdAt);
  const primaryFocus =
    evaluation.missedItems[0] ??
    evaluation.suggestions[0] ??
    '현재 채점 결과에서 즉시 보완할 핵심 항목은 표시되지 않았습니다.';

  return (
    <section
      aria-labelledby="evaluation-result-title"
      aria-modal="true"
      className="evaluation-modal-backdrop"
      role="dialog"
    >
      <div className="evaluation-modal">
        <header className="evaluation-modal-header">
          <div>
            <p className="eyebrow">CPX Evaluation</p>
            <h2 id="evaluation-result-title">채점 결과</h2>
            <span className={`evaluation-readiness-badge ${readiness.tone}`}>
              {readiness.label}
            </span>
          </div>
          <button
            aria-label="채점 결과 닫기"
            className="evaluation-modal-close"
            onClick={onClose}
            type="button"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="evaluation-dashboard">
          <section className="evaluation-score-panel">
            <div
              className="evaluation-score-ring"
              style={{ '--score-percent': `${score}%` } as CSSProperties}
            >
              <span>총점</span>
              <strong>{score}</strong>
              <em>/100</em>
            </div>
            <div className="evaluation-score-copy">
              <h3>{readiness.title}</h3>
              <p>{readiness.description}</p>
              <span>채점 시간 {formattedDate}</span>
            </div>
          </section>

          <section className="evaluation-summary-card">
            <div>
              <span>종합 평가</span>
              <h3>위험도 및 진료 흐름</h3>
            </div>
            <p>{evaluation.riskAssessment}</p>
          </section>

          <div className="evaluation-metric-grid">
            <EvaluationMetricCard
              label="강점"
              tone="positive"
              value={evaluation.strengths.length}
            />
            <EvaluationMetricCard
              label="놓친 항목"
              tone="warning"
              value={evaluation.missedItems.length}
            />
            <EvaluationMetricCard
              label="개선 제안"
              tone="neutral"
              value={evaluation.suggestions.length}
            />
          </div>

          <section className="evaluation-domain-card">
            <div className="evaluation-domain-heading">
              <div>
                <span>Feedback Map</span>
                <h3>영역별 피드백 요약</h3>
              </div>
              <p>세부 코멘트를 문진 흐름 기준으로 묶어 한눈에 확인합니다.</p>
            </div>
            <div className="evaluation-domain-list">
              {categorySummaries.map((category) => (
                <div className="evaluation-domain-row" key={category.label}>
                  <div>
                    <strong>{category.label}</strong>
                    <span>{category.note}</span>
                  </div>
                  <div className="evaluation-domain-track" aria-hidden="true">
                    <span style={{ width: `${category.value}%` }} />
                  </div>
                  <em>{category.value}</em>
                </div>
              ))}
            </div>
          </section>

          <section className="evaluation-priority-card">
            <span>우선 보완</span>
            <p>{primaryFocus}</p>
          </section>

          <div className="evaluation-modal-grid">
            <EvaluationResultSection
              items={evaluation.strengths}
              title="잘한 점"
              tone="positive"
            />
            <EvaluationResultSection
              items={evaluation.missedItems}
              title="놓친 항목"
              tone="warning"
            />
            <EvaluationResultSection
              items={evaluation.suggestions}
              title="개선 제안"
              tone="neutral"
            />
          </div>
        </div>

        <footer className="evaluation-modal-actions">
          <button onClick={onClose} type="button">닫기</button>
        </footer>
      </div>
    </section>
  );
}

function debugConversation(event: string, payload: Record<string, unknown>) {
  if (!isConversationDebugEnabled) return;

  console.info(`[conversation-debug] ${event}`, payload);
}

function EvaluationMetricCard({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'neutral' | 'positive' | 'warning';
  value: number;
}) {
  return (
    <section className={`evaluation-metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function EvaluationResultSection({
  items,
  title,
  tone,
}: {
  items: string[];
  title: string;
  tone: 'neutral' | 'positive' | 'warning';
}) {
  return (
    <section className={`evaluation-result-section ${tone}`}>
      <h3>{title}</h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <p>표시할 항목이 없습니다.</p>
      )}
    </section>
  );
}

const EVALUATION_FEEDBACK_CATEGORIES = [
  {
    label: '병력 청취',
    keywords: ['문진', '병력', '증상', '경련', '발작', '과거력', '가족력', '약물', '동반'],
    note: '증상과 배경 정보 확인',
  },
  {
    label: '위험 신호',
    keywords: ['위험', '응급', '의식', '발열', '두통', '신경', '외상', '저혈당'],
    note: '응급도와 red flag 확인',
  },
  {
    label: '환자 소통',
    keywords: ['공감', '경청', '설명', '안심', '확인', '보호자', '관계', '의사소통'],
    note: '공감과 이해 확인',
  },
  {
    label: '진단 계획',
    keywords: ['감별', '진단', '검사', '치료', '계획', '교육', '추적', '상담'],
    note: '임상 추론과 다음 단계',
  },
];

function buildEvaluationCategorySummaries(evaluation: Evaluation, score: number) {
  const strengths = evaluation.strengths;
  const improvementItems = [...evaluation.missedItems, ...evaluation.suggestions];

  return EVALUATION_FEEDBACK_CATEGORIES.map((category) => {
    const strengthHits = countKeywordMatches(strengths, category.keywords);
    const improvementHits = countKeywordMatches(improvementItems, category.keywords);
    const value = clampScore(score + strengthHits * 6 - improvementHits * 8);

    return {
      ...category,
      value,
    };
  });
}

function countKeywordMatches(items: string[], keywords: string[]) {
  return items.filter((item) =>
    keywords.some((keyword) => item.toLowerCase().includes(keyword.toLowerCase())),
  ).length;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getEvaluationReadiness(score: number) {
  if (score >= 85) {
    return {
      description: '핵심 문진 흐름과 환자 소통이 안정적으로 유지되었습니다.',
      label: '높은 수행도',
      title: '임상 흐름이 안정적입니다.',
      tone: 'high',
    };
  }

  if (score >= 65) {
    return {
      description: '진료 흐름은 형성되었고 일부 핵심 항목 보완이 필요합니다.',
      label: '좋은 흐름',
      title: '보완하면 충분히 개선됩니다.',
      tone: 'medium',
    };
  }

  return {
    description: '놓친 문진 항목과 위험 신호 확인을 먼저 점검해야 합니다.',
    label: '보완 포인트 확인',
    title: '핵심 문진 구조를 다시 정리하세요.',
    tone: 'low',
  };
}

function formatEvaluationDate(createdAt: string) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return '기록 없음';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function patientDisplayName(cpxCase: CpxCase) {
  return cpxCase.patientProfile.name ?? cpxCase.title;
}

function getCaseAgeGroup(cpxCase: CpxCase) {
  const age = cpxCase.patientProfile.age;
  const searchableText = [
    cpxCase.title,
    cpxCase.patientProfile.ageRaw,
    cpxCase.patientProfile.name,
    cpxCase.patientProfile.occupation,
    cpxCase.patientProfile.sex,
  ].filter(Boolean).join(' ');

  if (typeof age === 'number') {
    if (age <= 12) return '소아';
    if (age <= 18) return '청소년';
    return '성인';
  }

  if (/김정환|박로하|생후|개월|영유아|소아|아동|어린이|초등|남아|여아/.test(searchableText)) return '소아';
  if (/청소년|중학생|고등학생|고등/.test(searchableText)) return '청소년';
  return '성인';
}

function formatCaseMeta(cpxCase: CpxCase) {
  const age =
    cpxCase.patientProfile.ageRaw ??
    (cpxCase.patientProfile.age ? `${cpxCase.patientProfile.age}세` : '나이 미상');
  const sex = cpxCase.patientProfile.sex ?? '성별 미상';
  const occupation = cpxCase.patientProfile.occupation;
  const respondent = cpxCase.patientProfile.respondent;

  if (respondent) {
    return `${age} / ${sex} / 보호자: ${respondent}`;
  }

  return occupation ? `${age} / ${sex} / ${occupation}` : `${age} / ${sex}`;
}
