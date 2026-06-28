import { useMemo } from "react";

export function useSpeechSynthesis() {
  return useMemo(
    () => ({
      speak(content: string) {
        if (!("speechSynthesis" in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(content);
        utterance.lang = "ko-KR";
        utterance.rate = 0.95;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
      },
      cancel() {
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      },
    }),
    [],
  );
}
