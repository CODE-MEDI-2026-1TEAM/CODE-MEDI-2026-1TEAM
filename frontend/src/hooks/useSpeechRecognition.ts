import { useCallback, useEffect, useRef, useState } from 'react';
import { apiBaseUrl } from '../api';

interface UseSpeechRecognitionProps {
  onInterimTranscript: (transcript: string) => void;
  onFinalTranscript: (transcript: string) => void;
}

export function useSpeechRecognition({
  onInterimTranscript,
  onFinalTranscript,
}: UseSpeechRecognitionProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
        typeof window.MediaRecorder !== 'undefined',
    );

    return () => {
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const transcribe = useCallback(
    async (audioBlob: Blob) => {
      if (!audioBlob.size) return;

      onInterimTranscript('음성을 텍스트로 변환하고 있습니다.');

      try {
        const formData = new FormData();
        formData.append('audio', audioBlob, `voice.${fileExtensionFor(audioBlob.type)}`);

        const response = await fetch(`${apiBaseUrl}/speech/transcriptions`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Transcription failed with ${response.status}`);
        }

        const data = (await response.json()) as { text?: string };
        const transcript = data.text?.trim();
        if (!transcript) {
          throw new Error('Empty transcription result');
        }

        onFinalTranscript(transcript);
      } catch {
        onInterimTranscript('음성 인식에 실패했습니다. 다시 시도해 주세요.');
      }
    },
    [onFinalTranscript, onInterimTranscript],
  );

  const toggle = useCallback(async () => {
    if (!isSupported) return;

    const recorder = mediaRecorderRef.current;
    if (isListening) {
      recorder?.stop();
      setIsListening(false);
      return;
    }

    try {
      chunksRef.current = [];
      onInterimTranscript('녹음 중입니다. 질문을 말한 뒤 중지를 누르세요.');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mimeType = preferredMimeType();
      const mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType || mimeType || 'audio/webm',
        });
        chunksRef.current = [];
        stopStream();
        void transcribe(audioBlob);
      };

      mediaRecorder.onerror = () => {
        chunksRef.current = [];
        stopStream();
        setIsListening(false);
        onInterimTranscript('녹음 중 오류가 발생했습니다. 다시 시도해 주세요.');
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
    } catch {
      stopStream();
      setIsListening(false);
      onInterimTranscript('마이크 권한을 확인해 주세요.');
    }
  }, [isListening, isSupported, onInterimTranscript, stopStream, transcribe]);

  return { isListening, isSupported, toggle };
}

function preferredMimeType() {
  const supportedTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];

  return supportedTypes.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

function fileExtensionFor(mimeType: string) {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mpeg')) return 'mp3';
  return 'webm';
}
