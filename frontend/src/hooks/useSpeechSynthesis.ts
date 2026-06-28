import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiBaseUrl } from "../api";

export type SpeechVoiceProfile = {
  age?: number;
  ageRaw?: string;
  respondent?: string;
  sex?: string;
};

export function useSpeechSynthesis() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const speakWithBrowser = useCallback(
    (content: string, profile?: SpeechVoiceProfile | null) => {
      if (!("speechSynthesis" in window)) return;

      window.speechSynthesis.cancel();

      const voicePreset = voicePresetFor(profile);
      const utterance = new SpeechSynthesisUtterance(content);
      utterance.lang = "ko-KR";
      utterance.rate = voicePreset.rate;
      utterance.pitch = voicePreset.pitch;
      utterance.voice = selectKoreanVoice(voices, voicePreset.voicePreference);

      window.speechSynthesis.speak(utterance);
    },
    [voices],
  );

  const speak = useCallback(
    async (content: string, profile?: SpeechVoiceProfile | null) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      cancel();

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const response = await fetch(`${apiBaseUrl}/speech/synthesis`, {
          body: JSON.stringify({ profile, text: trimmed }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audioRef.current = audio;
        audioUrlRef.current = audioUrl;
        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          if (audioUrlRef.current === audioUrl) audioUrlRef.current = null;
          if (audioRef.current === audio) audioRef.current = null;
        };

        await audio.play();
      } catch (error) {
        if (abortController.signal.aborted) return;
        speakWithBrowser(trimmed, profile);
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [cancel, speakWithBrowser],
  );

  useEffect(() => cancel, [cancel]);

  return useMemo(() => ({ cancel, speak }), [cancel, speak]);
}

type VoicePreset = {
  pitch: number;
  rate: number;
  voicePreference: "female" | "male";
};

function voicePresetFor(profile?: SpeechVoiceProfile | null): VoicePreset {
  if (profile?.respondent) {
    return { pitch: 1.08, rate: 0.92, voicePreference: "female" };
  }

  if (isChildProfile(profile)) {
    return { pitch: 1.28, rate: 1.02, voicePreference: inferVoicePreference(profile?.sex) };
  }

  if (isAdolescentProfile(profile)) {
    return {
      pitch: inferVoicePreference(profile?.sex) === "female" ? 1.14 : 0.92,
      rate: 0.98,
      voicePreference: inferVoicePreference(profile?.sex),
    };
  }

  if (inferVoicePreference(profile?.sex) === "female") {
    return { pitch: 1.04, rate: 0.94, voicePreference: "female" };
  }

  return { pitch: 0.74, rate: 0.9, voicePreference: "male" };
}

function selectKoreanVoice(
  voices: SpeechSynthesisVoice[],
  preference: VoicePreset["voicePreference"],
) {
  const koreanVoices = voices.filter(isKoreanVoice);
  const preferredKoreanVoice = bestVoiceFor(koreanVoices, preference);

  if (preferredKoreanVoice) return preferredKoreanVoice;
  if (koreanVoices.length > 0) return bestVoiceFor(koreanVoices, "female") ?? koreanVoices[0];

  return bestVoiceFor(voices, preference) ?? voices[0] ?? null;
}

function bestVoiceFor(
  voices: SpeechSynthesisVoice[],
  preference: VoicePreset["voicePreference"],
) {
  const preferredPattern = preference === "female"
    ? /female|woman|girl|yuna|yu-na|유나|sunhi|sun-hi|sora|seo-?yeon|서연|여성|여자|여아/i
    : /male|man|boy|injoon|in-?joon|joon|준|minsu|민수|남성|남자|남아/i;

  const scoredVoices = voices
    .map((voice) => {
      const searchableText = `${voice.name} ${voice.voiceURI} ${voice.lang}`;
      const isPreferred = preferredPattern.test(searchableText);
      const isKorean = isKoreanVoice(voice);

      return {
        score:
          (isPreferred ? 100 : 0) +
          (isKorean ? 50 : 0) +
          (voice.localService ? 8 : 0),
        voice,
      };
    })
    .filter((entry) => entry.score >= 100)
    .sort((a, b) => b.score - a.score);

  return scoredVoices[0]?.voice ?? null;
}

function isKoreanVoice(voice: SpeechSynthesisVoice) {
  const searchableText = `${voice.name} ${voice.voiceURI} ${voice.lang}`;

  return /^ko(-|_)?/i.test(voice.lang) || /korean|korea|한국|ko-kr/i.test(searchableText);
}

function inferVoicePreference(sex?: string): VoicePreset["voicePreference"] {
  return /female|여성|여자|여아/i.test(sex ?? "") ? "female" : "male";
}

function isChildProfile(profile?: SpeechVoiceProfile | null) {
  if (profile?.respondent) return false;
  if (typeof profile?.age === "number") return profile.age <= 12;

  return /생후|개월|영유아|소아|아동|어린이|초등/i.test(profile?.ageRaw ?? "");
}

function isAdolescentProfile(profile?: SpeechVoiceProfile | null) {
  if (typeof profile?.age === "number") return profile.age > 12 && profile.age <= 18;

  return /청소년|중학생|고등학생|고등/i.test(profile?.ageRaw ?? "");
}
