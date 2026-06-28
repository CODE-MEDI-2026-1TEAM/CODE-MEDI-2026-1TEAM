import { useCallback, useEffect, useMemo, useState } from 'react';
import { request } from './api';
import ChatSidebar from './components/ChatSidebar';
import ClinicScene from './components/ClinicScene';
import type { CpxCase, Message, Session } from './types';

export default function App() {
  const [cases, setCases] = useState<CpxCase[]>([]);
  const [selectedCaseSlug, setSelectedCaseSlug] = useState('');
  const [pendingCaseSlug, setPendingCaseSlug] = useState('');
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCase = useMemo(
    () =>
      session?.case ??
      cases.find((cpxCase) => cpxCase.slug === selectedCaseSlug),
    [cases, selectedCaseSlug, session],
  );

  const pendingCase = useMemo(
    () => cases.find((cpxCase) => cpxCase.slug === pendingCaseSlug) ?? cases[0],
    [cases, pendingCaseSlug],
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
    activeCase?.openingStatement ??
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
    setPendingCaseSlug(selectedCaseSlug || cases[0]?.slug || '');
    setIsCaseModalOpen(true);
  }, [cases, selectedCaseSlug]);

  const confirmCaseSelection = useCallback(() => {
    const caseSlug = pendingCaseSlug || cases[0]?.slug;
    if (!caseSlug) return;

    setSelectedCaseSlug(caseSlug);
    setIsCaseModalOpen(false);
    void startSession(caseSlug);
  }, [cases, pendingCaseSlug, startSession]);

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
        setPendingCaseSlug((current) => current || data.cases[0]?.slug || '');
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
        <h1>{activeCase?.title ?? '케이스 선택 대기'}</h1>
        <span>{activeCase?.chiefComplaint ?? '시작할 환자군을 선택하세요'}</span>
        <button className="case-change-button" onClick={openCaseModal} type="button">
          케이스 변경
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
              <p className="eyebrow">Seizure CPX Case</p>
              <h2 id="case-picker-title">환자군 선택</h2>
              <p>소아, 청소년, 성인 경련 케이스 중 하나를 선택해 진료를 시작합니다.</p>
            </header>

            <div className="case-option-grid">
              {cases.length > 0 ? (
                cases.map((cpxCase) => {
                  const isSelected = pendingCase?.slug === cpxCase.slug;
                  const ageGroup = getCaseAgeGroup(cpxCase);

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={isSelected ? 'case-option selected' : 'case-option'}
                      key={cpxCase.id}
                      onClick={() => setPendingCaseSlug(cpxCase.slug)}
                      type="button"
                    >
                      <span className="case-option-group">{ageGroup}</span>
                      <strong>{cpxCase.title}</strong>
                      <span className="case-option-meta">
                        {formatCaseMeta(cpxCase)}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="case-option-empty">
                  <strong>케이스를 불러오는 중입니다.</strong>
                  <span>{error ?? '잠시만 기다려 주세요.'}</span>
                </div>
              )}
            </div>

            <footer className="case-modal-actions">
              <button
                className="case-start-button"
                disabled={!pendingCase || isLoading}
                onClick={confirmCaseSelection}
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
  const age = cpxCase.patientProfile.age
    ? `${cpxCase.patientProfile.age}세`
    : '나이 미상';
  const sex = cpxCase.patientProfile.sex ?? '성별 미상';
  const occupation = cpxCase.patientProfile.occupation;

  return occupation ? `${age} / ${sex} / ${occupation}` : `${age} / ${sex}`;
}
