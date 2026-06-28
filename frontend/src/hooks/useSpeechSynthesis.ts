import { useEffect, useMemo, useState } from "react";

export type SpeechVoiceProfile = {
  age?: number;
  ageRaw?: string;
  respondent?: string;
  sex?: string;
};

export function useSpeechSynthesis() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, []);

  return useMemo(
    () => ({
      speak(content: string, profile?: SpeechVoiceProfile | null) {
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
      cancel() {
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      },
    }),
    [voices],
  );
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
  const koreanVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("ko"));
  const preferredNamePattern =
    preference === "female"
      ? /female|woman|yuna|유나|여성|여자/i
      : /male|man|남성|남자/i;

  return (
    koreanVoices.find((voice) => preferredNamePattern.test(voice.name)) ??
    koreanVoices[0] ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("ko")) ??
    null
  );
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
