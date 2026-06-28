import { useEffect, useRef, useState } from "react";
import type { SpeechRecognition } from "../types";

interface UseSpeechRecognitionProps {
  onInterimTranscript: (transcript: string) => void;
  onFinalTranscript: (transcript: string) => void;
}

export function useSpeechRecognition({
  onInterimTranscript,
  onFinalTranscript,
}: UseSpeechRecognitionProps) {
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const finalTranscriptRef = useRef("");
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let interimTranscript = "";
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        const text = result[0].transcript.trim();
        if (result.isFinal) {
          finalTranscriptRef.current = text;
        } else {
          interimTranscript += text;
        }
      }
      onInterimTranscript(
        finalTranscriptRef.current || interimTranscript.trim(),
      );
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => {
      setIsListening(false);
      const finalTranscript = finalTranscriptRef.current.trim();
      finalTranscriptRef.current = "";
      if (finalTranscript) onFinalTranscript(finalTranscript);
    };

    recognitionRef.current = recognition;
    setIsSupported(true);

    return () => recognition.abort();
  }, [onFinalTranscript, onInterimTranscript]);

  function toggle() {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (isListening) {
      recognition.stop();
      setIsListening(false);
      return;
    }
    finalTranscriptRef.current = "";
    onInterimTranscript("");
    recognition.start();
    setIsListening(true);
  }

  return { isListening, isSupported, toggle };
}
