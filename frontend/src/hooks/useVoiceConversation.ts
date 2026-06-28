import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import { useSpeechSynthesis } from './useSpeechSynthesis';
import type { Session } from '../types';

const isConversationDebugEnabled =
  import.meta.env.VITE_ENABLE_CONVERSATION_DEBUG === 'true';

interface UseVoiceConversationProps {
  session: Session | null;
  /** 메시지 전송(네트워크). 성공하면 true. */
  onSendMessage: (content: string) => Promise<boolean>;
  /** 마이크 토글 시 기존 에러를 지우기 위한 콜백. */
  onClearError: () => void;
}

/**
 * 음성 대화(STT 입력 + TTS 출력)를 한 곳에 캡슐화한다.
 * - 입력: 마이크 → transcript → onSendMessage
 * - 출력: 최신 환자(assistant) 응답을 음성으로 1회 재생
 */
export function useVoiceConversation({
  session,
  onSendMessage,
  onClearError,
}: UseVoiceConversationProps) {
  const [transcript, setTranscript] = useState('');
  const [isVoiceReplyEnabled, setIsVoiceReplyEnabled] = useState(true);
  const lastSpokenMessageIdRef = useRef<string | null>(null);
  const isSpeechOutputActiveRef = useRef(false);
  const ignoreTranscriptsUntilRef = useRef(0);
  const speechSynthesis = useSpeechSynthesis();

  const latestAssistantMessage = useMemo(
    () =>
      session?.messages
        .filter((message) => message.role === 'assistant')
        .at(-1),
    [session],
  );
  const voiceProfile = useMemo(() => {
    const profile = session?.case.patientProfile;

    if (!profile) return null;

    return {
      age: profile.age,
      ageRaw: profile.ageRaw,
      respondent: profile.respondent,
      sex: profile.sex,
    };
  }, [session?.case.patientProfile]);

  useEffect(() => {
    isSpeechOutputActiveRef.current = speechSynthesis.isSpeaking;
    if (speechSynthesis.isSpeaking) {
      ignoreTranscriptsUntilRef.current = Date.now() + 3_000;
    } else {
      ignoreTranscriptsUntilRef.current = Math.max(
        ignoreTranscriptsUntilRef.current,
        Date.now() + 800,
      );
    }
  }, [speechSynthesis.isSpeaking]);

  // 파이널 transcript 처리: 전송문을 표시하고, 성공 시에만 비운다(실패 시 유지).
  const handleFinalTranscript = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      if (
        isSpeechOutputActiveRef.current ||
        Date.now() < ignoreTranscriptsUntilRef.current
      ) {
        debugConversation('voice.finalTranscript.ignoredDuringSpeechOutput', {
          sessionId: session?.id ?? null,
          caseSlug: session?.case.slug ?? null,
          transcript: trimmed,
          transcriptLength: trimmed.length,
        });
        setTranscript('');
        return;
      }
      setTranscript(trimmed);
      debugConversation('voice.finalTranscript', {
        sessionId: session?.id ?? null,
        caseSlug: session?.case.slug ?? null,
        transcript: trimmed,
        transcriptLength: trimmed.length,
      });
      const ok = await onSendMessage(trimmed);
      if (ok) setTranscript('');
    },
    [onSendMessage, session?.case.slug, session?.id],
  );

  const speechRecognition = useSpeechRecognition({
    onInterimTranscript: setTranscript,
    onFinalTranscript: handleFinalTranscript,
  });

  // 마이크 토글 전 에러를 지운다(기존 handleVoiceToggle).
  const toggle = useCallback(() => {
    if (speechSynthesis.isSpeaking) return;
    onClearError();
    speechRecognition.toggle();
  }, [onClearError, speechRecognition, speechSynthesis.isSpeaking]);

  // 음성 재생 토글: 끄면 진행 중인 TTS를 중단한다.
  const setVoiceReplyEnabled = useCallback(
    (enabled: boolean) => {
      setIsVoiceReplyEnabled(enabled);
      if (!enabled) speechSynthesis.cancel();
    },
    [speechSynthesis],
  );

  // 새 세션(id 변경) 시 마지막 발화 기록을 리셋한다.
  // ⚠️ 아래 TTS effect보다 먼저 선언되어야 새 세션의 첫 응답이 정상 발화된다.
  useEffect(() => {
    lastSpokenMessageIdRef.current = null;
  }, [session?.id]);

  // 최신 환자 응답을 1회 발화(중복 방지: id 가드).
  useEffect(() => {
    if (!latestAssistantMessage || !isVoiceReplyEnabled) return;
    if (latestAssistantMessage.id === lastSpokenMessageIdRef.current) return;
    lastSpokenMessageIdRef.current = latestAssistantMessage.id;
    speechRecognition.cancel();
    setTranscript('');
    ignoreTranscriptsUntilRef.current = Date.now() + 3_000;
    void speechSynthesis.speak(latestAssistantMessage.content, voiceProfile);
  }, [
    isVoiceReplyEnabled,
    latestAssistantMessage,
    speechRecognition,
    speechSynthesis,
    voiceProfile,
  ]);

  return {
    transcript,
    isListening: speechRecognition.isListening,
    isSpeaking: speechSynthesis.isSpeaking,
    isSupported: speechRecognition.isSupported,
    toggle,
    isVoiceReplyEnabled,
    setVoiceReplyEnabled,
  };
}

function debugConversation(event: string, payload: Record<string, unknown>) {
  if (!isConversationDebugEnabled) return;

  console.info(`[conversation-debug] ${event}`, payload);
}
