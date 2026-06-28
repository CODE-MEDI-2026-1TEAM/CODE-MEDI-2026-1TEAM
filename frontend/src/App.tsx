import { useCallback, useEffect, useMemo, useState } from 'react';
import ChatSidebar from './components/ChatSidebar';
import ClinicScene from './components/ClinicScene';
import type { CpxCase, Message, Session } from './types';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export default function App() {
  const [cases, setCases] = useState<CpxCase[]>([]);
  const [selectedCaseSlug, setSelectedCaseSlug] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCase = useMemo(
    () =>
      session?.case ??
      cases.find((cpxCase) => cpxCase.slug === selectedCaseSlug) ??
      cases[0],
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
        setSelectedCaseSlug((current) => current || data.cases[0]?.slug || '');
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedCaseSlug) return;
    void startSession(selectedCaseSlug);
  }, [selectedCaseSlug, startSession]);

  return (
    <main className="simulation-app">
      <ClinicScene
        isPatientSpeaking={isPatientSpeaking}
        patientReply={patientReply}
      />

      <div className="scene-overlay top-left">
        <p className="eyebrow">CODE MEDI Seizure Lab</p>
        <h1>{activeCase?.title ?? 'AI 모의 환자'}</h1>
        <span>{activeCase?.chiefComplaint ?? '케이스를 불러오는 중'}</span>
      </div>

      <ChatSidebar
        activeCase={activeCase}
        error={error}
        isLoading={isLoading}
        onClearError={clearError}
        onSendMessage={sendMessage}
        session={session}
      />
    </main>
  );
}
