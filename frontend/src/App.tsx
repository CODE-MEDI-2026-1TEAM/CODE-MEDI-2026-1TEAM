import { useCallback, useEffect, useMemo, useState } from 'react';
import { request } from './api';
import ChatSidebar from './components/ChatSidebar';
import ClinicScene from './components/ClinicScene';
import type { CpxCase, Message, Session } from './types';

export default function App() {
  const [cases, setCases] = useState<CpxCase[]>([]);
  const [selectedCaseSlug, setSelectedCaseSlug] = useState('');
  const [assignedCase, setAssignedCase] = useState<CpxCase | null>(null);
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(true);
  const [isAssigningCase, setIsAssigningCase] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setIsCaseModalOpen(true);
  }, []);

  const assignRandomCase = useCallback(() => {
    if (cases.length === 0 || isAssigningCase || isLoading) return;

    setIsAssigningCase(true);
    setAssignedCase(null);
    setError(null);

    window.setTimeout(() => {
      const randomCase = cases[Math.floor(Math.random() * cases.length)];
      setAssignedCase(randomCase);
      setSelectedCaseSlug(randomCase.slug);
      setIsAssigningCase(false);
    }, 900);
  }, [cases, isAssigningCase, isLoading]);

  const startAssignedCase = useCallback(() => {
    if (!assignedCase) return;

    setIsCaseModalOpen(false);
    void startSession(assignedCase.slug);
  }, [assignedCase, startSession]);

  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const trimmed = content.trim();
      if (!session || !trimmed) return false;

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

  useEffect(() => {
    request<{ cases: CpxCase[] }>('/cases')
      .then((data) => {
        setCases(data.cases);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main className="simulation-app">
      <ClinicScene
        isPatientSpeaking={isPatientSpeaking}
        patientReply={patientReply}
      />

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
        isLoading={isLoading}
        onClearError={clearError}
        onSendMessage={sendMessage}
        session={session}
      />

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
                  <div className={isAssigningCase ? 'assignment-orbit spinning' : 'assignment-orbit'}>
                    <span />
                    <strong>{isAssigningCase ? '배정 중' : assignedCase ? '배정 완료' : '대기 중'}</strong>
                  </div>

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

function patientDisplayName(cpxCase: CpxCase) {
  return cpxCase.patientProfile.name ?? cpxCase.title;
}

function getCaseAgeGroup(cpxCase: CpxCase) {
  const age = cpxCase.patientProfile.age;
  const searchableText = `${cpxCase.title} ${cpxCase.patientProfile.occupation ?? ''}`;

  if (typeof age === 'number') {
    if (age <= 12) return '소아';
    if (age <= 18) return '청소년';
    return '성인';
  }

  if (/소아|아동|어린이|초등/.test(searchableText)) return '소아';
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
