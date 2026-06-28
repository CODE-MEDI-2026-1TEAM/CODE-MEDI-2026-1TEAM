import { useEffect, useRef } from 'react';
import { useVoiceConversation } from '../hooks/useVoiceConversation';
import type { CpxCase, Session } from '../types';

const vitalSigns = [
  ['혈압', '120/82mmHg'],
  ['맥박', '80회/분'],
  ['호흡', '18회/분'],
  ['체온', '36.5°C'],
];

type ChatSidebarProps = {
  activeCase: CpxCase | undefined;
  session: Session | null;
  isLoading: boolean;
  error: string | null;
  onSendMessage: (content: string) => Promise<boolean>;
  onClearError: () => void;
};

export default function ChatSidebar({
  activeCase,
  session,
  isLoading,
  error,
  onSendMessage,
  onClearError,
}: ChatSidebarProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const voice = useVoiceConversation({ session, onSendMessage, onClearError });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [session?.messages, isLoading]);

  const profile = activeCase?.patientProfile;

  return (
    <aside className="chat-sidebar" aria-label="환자 대화 기록">
      <header className="patient-summary">
        <div className="profile-image-slot" aria-label="환자 프로필 이미지 영역">환자</div>
        <div className="patient-heading">
          <p>환자 정보</p>
          <h2>{activeCase?.title ?? '환자 연결 중'}</h2>
        </div>
        <dl className="patient-details">
          <div><dt>나이</dt><dd>{profile?.age ? `${profile.age}세` : '-'}</dd></div>
          <div><dt>성별</dt><dd>{profile?.sex ?? '-'}</dd></div>
          <div><dt>직업</dt><dd>{profile?.occupation ?? '-'}</dd></div>
          <div className="full-width"><dt>내원 이유</dt><dd>{activeCase?.chiefComplaint ?? '-'}</dd></div>
        </dl>
      </header>

      <section className="vitals-card" aria-label="활력 징후">
        <h3>활력 징후</h3>
        <div className="vitals-grid">
          {vitalSigns.map(([label, value]) => <p key={label}><span>{label}</span><strong>{value}</strong></p>)}
        </div>
      </section>

      <section className="chat-history" aria-live="polite">
        <p className="chat-label">대화 기록</p>
        <div className="message-list">
          {session?.messages.map((message) => (
            <article className={`message ${message.role === 'user' ? 'user-message' : 'patient-message'}`} key={message.id}>
              <span>{message.role === 'user' ? '의료진' : '환자'}</span>
              <p>{message.content}</p>
            </article>
          ))}
          {isLoading ? <article className="message patient-message pending"><span>환자</span><p>응답을 생각하고 있습니다…</p></article> : null}
          <div ref={chatEndRef} />
        </div>
      </section>

      <div className="voice-panel">
        <div className="voice-status">
          <span>{isLoading ? '환자 응답 생성 중' : voice.isListening ? '듣는 중' : session ? '진료 대기' : '세션 준비 중'}</span>
          {voice.transcript ? <p>{voice.transcript}</p> : <p>마이크를 눌러 환자에게 질문하세요.</p>}
          {error ? <p className="voice-error">{error}</p> : null}
        </div>
        <div className="voice-actions">
          <button className={voice.isListening ? 'mic-button active' : 'mic-button'} disabled={!session || isLoading || !voice.isSupported} onClick={voice.toggle} title={voice.isSupported ? '음성 입력 시작/중지' : '이 브라우저는 음성 입력을 지원하지 않습니다'} type="button">
            {voice.isListening ? '중지' : '음성'}
          </button>
          <label className="voice-toggle"><input type="checkbox" checked={voice.isVoiceReplyEnabled} onChange={(event) => voice.setVoiceReplyEnabled(event.target.checked)} /> 음성 재생</label>
        </div>
      </div>
    </aside>
  );
}
