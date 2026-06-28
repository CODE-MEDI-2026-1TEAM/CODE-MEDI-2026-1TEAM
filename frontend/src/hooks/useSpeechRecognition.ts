import { useCallback, useEffect, useRef, useState } from 'react';
import { apiBaseUrl } from '../api';

const isConversationDebugEnabled =
  import.meta.env.VITE_ENABLE_CONVERSATION_DEBUG === 'true';

interface UseSpeechRecognitionProps {
  onInterimTranscript: (transcript: string) => void;
  onFinalTranscript: (transcript: string) => void;
}

const maxRecordingMs = 15_000;
const minRecordingMs = 900;
const silenceStopMs = 1_300;
const silenceVolumeThreshold = 0.018;

export function useSpeechRecognition({
  onInterimTranscript,
  onFinalTranscript,
}: UseSpeechRecognitionProps) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const maxRecordingTimeoutRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef(0);
  const silenceStartedAtRef = useRef<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported(
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
        typeof window.MediaRecorder !== 'undefined',
    );

    return () => {
      mediaRecorderRef.current?.stop();
      stopAudioAnalysis();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
    setIsListening(false);
  }, []);

  const transcribe = useCallback(
    async (audioBlob: Blob) => {
      if (!audioBlob.size) return;

      onInterimTranscript('음성을 텍스트로 변환하고 있습니다.');

      try {
        const formData = new FormData();
        formData.append('audio', audioBlob, `voice.${fileExtensionFor(audioBlob.type)}`);
        debugConversation('speech.transcription.request', {
          apiBaseUrl,
          audioType: audioBlob.type,
          audioSize: audioBlob.size,
        });

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

        debugConversation('speech.transcription.response', {
          transcript,
          transcriptLength: transcript.length,
        });
        onFinalTranscript(transcript);
      } catch (error) {
        debugConversation('speech.transcription.error', {
          detail: error instanceof Error ? error.message : 'Unknown STT error',
        });
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
      onInterimTranscript('녹음 중입니다. 말을 마치면 자동으로 전송됩니다.');

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
      debugConversation('speech.recording.started', {
        mimeType: mediaRecorder.mimeType || mimeType || 'browser-default',
        maxRecordingMs,
        silenceStopMs,
        silenceVolumeThreshold,
      });
      const stopWhenSilent = () => stopRecording();

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stopAudioAnalysis();
        const audioBlob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType || mimeType || 'audio/webm',
        });
        debugConversation('speech.recording.stopped', {
          audioType: audioBlob.type,
          audioSize: audioBlob.size,
          chunks: chunksRef.current.length,
        });
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        stopStream();
        void transcribe(audioBlob);
      };

      mediaRecorder.onerror = () => {
        debugConversation('speech.recording.error', {
          mimeType: mediaRecorder.mimeType || mimeType || 'browser-default',
        });
        chunksRef.current = [];
        stopAudioAnalysis();
        mediaRecorderRef.current = null;
        stopStream();
        setIsListening(false);
        onInterimTranscript('녹음 중 오류가 발생했습니다. 다시 시도해 주세요.');
      };

      mediaRecorderRef.current = mediaRecorder;
      startAudioAnalysis(stream, stopWhenSilent);
      mediaRecorder.start();
      setIsListening(true);
    } catch {
      stopAudioAnalysis();
      stopStream();
      setIsListening(false);
      onInterimTranscript('마이크 권한을 확인해 주세요.');
    }
  }, [
    isListening,
    isSupported,
    onInterimTranscript,
    stopRecording,
    stopStream,
    transcribe,
  ]);

  return { isListening, isSupported, toggle };

  function startAudioAnalysis(stream: MediaStream, onSilence: () => void) {
    stopAudioAnalysis();

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);

    audioContextRef.current = audioContext;
    recordingStartedAtRef.current = performance.now();
    silenceStartedAtRef.current = null;

    const samples = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      const volume = rootMeanSquare(samples);
      const now = performance.now();
      const elapsed = now - recordingStartedAtRef.current;

      if (volume < silenceVolumeThreshold && elapsed > minRecordingMs) {
        silenceStartedAtRef.current ??= now;
        if (now - silenceStartedAtRef.current >= silenceStopMs) {
          onSilence();
          return;
        }
      } else {
        silenceStartedAtRef.current = null;
      }

      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);
    maxRecordingTimeoutRef.current = window.setTimeout(
      onSilence,
      maxRecordingMs,
    );
  }

  function stopAudioAnalysis() {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (maxRecordingTimeoutRef.current !== null) {
      window.clearTimeout(maxRecordingTimeoutRef.current);
      maxRecordingTimeoutRef.current = null;
    }

    void audioContextRef.current?.close();
    audioContextRef.current = null;
    silenceStartedAtRef.current = null;
  }
}

function rootMeanSquare(samples: Uint8Array) {
  let sum = 0;

  for (const sample of samples) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }

  return Math.sqrt(sum / samples.length);
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

function debugConversation(event: string, payload: Record<string, unknown>) {
  if (!isConversationDebugEnabled) return;

  console.info(`[conversation-debug] ${event}`, payload);
}
