import { useEffect, useMemo, useRef, useState } from 'react';
import { useVoiceConversation } from '../hooks/useVoiceConversation';
import { choosePatientCaseKey, PATIENT_CASES, patientAvatarPathForCase } from '../patientModels';
import type {
  CpxCase,
  PhysicalExamEvent,
  Session,
  SystemTimelineEvent,
} from '../types';
import { DEFAULT_VITALS } from '../vitals';
import type { VitalSigns } from '../vitals';

type ChatSidebarProps = {
  activeCase: CpxCase | undefined;
  session: Session | null;
  isLoading: boolean;
  isEvaluating: boolean;
  error: string | null;
  vitals?: VitalSigns;
  onSendMessage: (content: string) => Promise<boolean>;
  onEvaluate: () => Promise<void>;
  onOpenEvaluation: () => void;
  onClearError: () => void;
  systemTimelineEvents: SystemTimelineEvent[];
};

export default function ChatSidebar({
  activeCase,
  session,
  isLoading,
  isEvaluating,
  error,
  vitals = DEFAULT_VITALS,
  onSendMessage,
  onEvaluate,
  onOpenEvaluation,
  onClearError,
  systemTimelineEvents,
}: ChatSidebarProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const autoEvaluationSessionIdRef = useRef<string | null>(null);
  const voice = useVoiceConversation({ session, onSendMessage, onClearError });
  const isCompleted = session?.status === 'completed';
  const vitalSigns = [
    ['혈압', `${vitals.bp}mmHg`],
    ['맥박', `${vitals.hr}회/분`],
    ['호흡', `${vitals.rr}회/분`],
    ['체온', `${vitals.temp}°C`],
  ];

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [session?.messages, isLoading]);

  const profile = activeCase?.patientProfile;
  const chatPatientLabel = profile?.age == null ? '보호자' : '환자';
  const displayAge = profile?.age
    ? `${profile.age}세`
    : (profile?.ageRaw ?? '-');
  const avatarCaseKey = choosePatientCaseKey(
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
  );
  const avatarCase = PATIENT_CASES[avatarCaseKey];
  const avatarPath = patientAvatarPathForCase(avatarCaseKey);
  const remainingSeconds = useCountdownSeconds(session);
  const timeProgress = useMemo(
    () => Math.max(0, Math.min(100, (remainingSeconds / EXAM_DURATION_SECONDS) * 100)),
    [remainingSeconds],
  );
  useEffect(() => {
    if (
      !session ||
      isCompleted ||
      isEvaluating ||
      isLoading ||
      remainingSeconds > 0 ||
      autoEvaluationSessionIdRef.current === session.id
    ) {
      return;
    }

    autoEvaluationSessionIdRef.current = session.id;
    void onEvaluate();
  }, [
    isCompleted,
    isEvaluating,
    isLoading,
    onEvaluate,
    remainingSeconds,
    session,
  ]);
  const timelineItems = useMemo(
    () =>
      [
        ...(session?.messages.map((message) => ({
          createdAt: message.createdAt,
          id: message.id,
          kind: 'message' as const,
          message,
        })) ?? []),
        ...systemTimelineEvents.map((event) => ({
          createdAt: event.createdAt,
          event,
          id: event.id,
          kind: 'system' as const,
        })),
        ...(session?.physicalExamEvents?.map((event) => ({
          createdAt: event.createdAt,
          event,
          id: event.id ?? `${event.examKey}-${event.createdAt}`,
          kind: 'physicalExam' as const,
        })) ?? []),
      ].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [session?.messages, session?.physicalExamEvents, systemTimelineEvents],
  );

  return (
    <aside className="chat-sidebar" aria-label="환자 대화 기록">
      <header className="patient-summary">
        <PatientAvatar
          avatarPath={avatarPath}
          category={avatarCase.category}
          hasGuardian={Boolean(profile?.respondent)}
          name={profile?.name ?? activeCase?.title}
        />
        <div className="patient-heading">
          <p>환자 정보</p>
          <h2>{profile?.name ?? activeCase?.title ?? '환자 연결 중'}</h2>
        </div>
        <dl className="patient-details">
          <div><dt>나이</dt><dd>{displayAge}</dd></div>
          <div><dt>성별</dt><dd>{profile?.sex ?? '-'}</dd></div>
          <div><dt>직업</dt><dd>{profile?.occupation ?? '-'}</dd></div>
          {profile?.respondent ? <div><dt>응답자</dt><dd>{profile.respondent}</dd></div> : null}
        </dl>
      </header>

      <section className="vitals-card" aria-label="활력 징후">
        <h3>활력 징후</h3>
        <div className="vitals-grid">
          {vitalSigns.map(([label, value]) => <p key={label}><span>{label}</span><strong>{value}</strong></p>)}
        </div>
      </section>

      <section className="exam-control-card" aria-label="CPX 채점">
        <div className="exam-timer-row">
          <div>
            <span>CPX 타이머</span>
            <strong>{session ? formatRemainingTime(remainingSeconds) : '12:00'}</strong>
          </div>
          {isCompleted && session?.evaluation ? (
            <button
              className="evaluate-button secondary"
              onClick={onOpenEvaluation}
              type="button"
            >
              결과 보기
            </button>
          ) : (
            <button
              className="evaluate-button"
              disabled={!session || isLoading || isEvaluating}
              onClick={() => void onEvaluate()}
              type="button"
            >
              {isEvaluating ? (
                <>
                  <span className="button-spinner" aria-hidden="true" />
                  채점 중
                </>
              ) : (
                '종료/채점하러 가기'
              )}
            </button>
          )}
        </div>
        <div className="timer-track" aria-hidden="true">
          <span style={{ width: `${timeProgress}%` }} />
        </div>
        {isEvaluating ? (
          <div className="evaluation-loading-card" role="status">
            <span className="evaluation-spinner" aria-hidden="true" />
            <div>
              <strong>채점 중입니다.</strong>
              <p>대화 내용을 CPX 기준으로 분석하고 있어 잠시 시간이 걸릴 수 있습니다.</p>
            </div>
          </div>
        ) : null}
        {remainingSeconds === 0 && session && !isCompleted && !isEvaluating ? (
          <p className="timer-note">제한 시간이 종료되어 자동 채점을 시작합니다.</p>
        ) : null}
      </section>

      <section className="chat-history" aria-live="polite">
        <p className="chat-label">대화 기록</p>
        <div className="message-list">
          {timelineItems.map((item) =>
            item.kind === 'system' ? (
              <article className="system-timeline-message" key={item.id}>
                <p>{item.event.content}</p>
              </article>
            ) : item.kind === 'physicalExam' ? (
              <PhysicalExamResultCard event={item.event} key={item.id} />
            ) : (
              <article className={`message ${item.message.role === 'user' ? 'user-message' : 'patient-message'}`} key={item.id}>
                <span>{item.message.role === 'user' ? '의료진' : chatPatientLabel}</span>
                <p>{item.message.content}</p>
              </article>
            ),
          )}
          {isLoading ? <article className="message patient-message pending"><span>{chatPatientLabel}</span><p>응답을 생각하고 있습니다…</p></article> : null}
          <div ref={chatEndRef} />
        </div>
      </section>

      <div className="voice-panel">
        <div className="voice-status">
          <span>{isLoading ? '환자 응답 생성 중' : voice.isListening ? '듣는 중' : session ? '진료 대기' : '세션 준비 중'}</span>
          {voice.transcript ? <p>{voice.transcript}</p> : <p>{isCompleted ? '채점이 완료된 세션입니다.' : '마이크를 눌러 환자에게 질문하세요.'}</p>}
          {error ? <p className="voice-error">{error}</p> : null}
        </div>
        <div className="voice-actions">
          <button
            aria-label={voice.isListening ? '음성 입력 중지' : '음성 입력 시작'}
            className={voice.isListening ? 'mic-button active' : 'mic-button'}
            disabled={!session || isCompleted || isLoading || !voice.isSupported}
            onClick={voice.toggle}
            title={voice.isSupported ? '음성 입력 시작/중지' : '이 브라우저는 음성 입력을 지원하지 않습니다'}
            type="button"
          >
            {voice.isListening ? <StopIcon /> : <MicIcon />}
          </button>
          <label className="voice-toggle"><input type="checkbox" checked={voice.isVoiceReplyEnabled} onChange={(event) => voice.setVoiceReplyEnabled(event.target.checked)} /> 음성 재생</label>
        </div>
      </div>
    </aside>
  );
}

function PhysicalExamResultCard({ event }: { event: PhysicalExamEvent }) {
  const statusLabel =
    event.status === 'abnormal'
      ? '비정상'
      : event.status === 'unavailable'
        ? '확인 불가'
        : event.status === 'unclear'
          ? '불명확'
          : '정상';
  const positionLabel = event.position === 'supine' ? '누움' : '앉음';
  const expectedLabel = event.expectedPosition === 'supine' ? '누움' : '앉음';

  return (
    <article className={`physical-exam-card ${event.status}`}>
      <div>
        <span>신체진찰 결과</span>
        <strong>{event.label}</strong>
      </div>
      <p>{event.result}</p>
      <footer>
        <em>{statusLabel}</em>
        <span>
          시행 자세 {positionLabel}
          {event.position !== event.expectedPosition ? ` / 권장 ${expectedLabel}` : ''}
        </span>
      </footer>
    </article>
  );
}

const EXAM_DURATION_SECONDS = 12 * 60;

function useCountdownSeconds(session: Session | null) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!session || session.status === 'completed') return;

    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.id, session?.status]);

  if (!session) return EXAM_DURATION_SECONDS;
  if (session.status === 'completed') return 0;

  const startedAt = new Date(session.startedAt).getTime();
  if (Number.isNaN(startedAt)) return EXAM_DURATION_SECONDS;

  const elapsed = Math.floor((now - startedAt) / 1000);
  return Math.max(0, EXAM_DURATION_SECONDS - elapsed);
}

function formatRemainingTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function MicIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="24" viewBox="0 0 24 24" width="24">
      <path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v5a3.5 3.5 0 0 0 3.5 3.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M5 10.5a7 7 0 0 0 14 0M12 17.5V21M9 21h6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="24" viewBox="0 0 24 24" width="24">
      <rect height="10" rx="2" stroke="currentColor" strokeWidth="2" width="10" x="7" y="7" />
    </svg>
  );
}

function PatientAvatar({
  avatarPath,
  category,
  hasGuardian,
  name,
}: {
  avatarPath: string;
  category: 'child' | 'adolescent' | 'adult';
  hasGuardian: boolean;
  name?: string;
}) {
  const avatarClassName = [
    'profile-avatar',
    `profile-avatar-${category}`,
  ].join(' ');

  return (
    <div className={avatarClassName} aria-label={`${name ?? '환자'} 아바타`}>
      <img alt="" src={avatarPath} />
      {hasGuardian ? <span className="avatar-guardian">보</span> : null}
    </div>
  );
}
