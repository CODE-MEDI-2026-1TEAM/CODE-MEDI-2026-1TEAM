import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { request } from './api';
import ChatSidebar from './components/ChatSidebar';
import BedsideScene from './components/BedsideScene';
import ClinicScene from './components/ClinicScene';
import { choosePatientCaseKey } from './patientModels';
import { DEFAULT_VITALS } from './vitals';
import type { CpxCase, Evaluation, Message, Session } from './types';

export default function App() {
  const [cases, setCases] = useState<CpxCase[]>([]);
  const [selectedCaseSlug, setSelectedCaseSlug] = useState('');
  const [assignedCase, setAssignedCase] = useState<CpxCase | null>(null);
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false); // TEMP: 모달 비활성화 (씬 확인용)
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

      try {
        await request<{ message: Message }>(`/sessions/${session.id}/messages`, {
          method: 'POST',
          body: JSON.stringify({ content: trimmed }),
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
          vitals={DEFAULT_VITALS}
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
        vitals={DEFAULT_VITALS}
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
  const score = Math.max(0, Math.min(100, evaluation.score));

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

        <div className="evaluation-score-panel">
          <div
            className="evaluation-score-ring"
            style={{ '--score-percent': `${score}%` } as CSSProperties}
          >
            <span>총점</span>
            <strong>{score}</strong>
          </div>
          <div>
            <h3>위험도 평가</h3>
            <p>{evaluation.riskAssessment}</p>
          </div>
        </div>

        <div className="evaluation-modal-grid">
          <EvaluationResultSection
            items={evaluation.strengths}
            title="잘한 점"
          />
          <EvaluationResultSection
            items={evaluation.missedItems}
            title="놓친 항목"
          />
          <EvaluationResultSection
            items={evaluation.suggestions}
            title="개선 제안"
          />
        </div>

        <footer className="evaluation-modal-actions">
          <button onClick={onClose} type="button">닫기</button>
        </footer>
      </div>
    </section>
  );
}

function EvaluationResultSection({
  items,
  title,
}: {
  items: string[];
  title: string;
}) {
  return (
    <section className="evaluation-result-section">
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
