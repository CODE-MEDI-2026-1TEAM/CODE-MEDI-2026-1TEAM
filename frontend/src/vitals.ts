// 활력징후 단일 소스.
// 모니터(ClinicScene)와 사이드바(ChatSidebar)가 같은 값을 prop 으로 받아 표시한다.
// 표시 형식(단위/라벨)은 각 컴포넌트가 알아서 붙인다.

export type VitalSigns = {
  /** 혈압 수축기/이완기, 예: '120/82' */
  bp: string;
  /** 맥박(분당), 예: '80' */
  hr: string;
  /** 호흡(분당), 예: '18' */
  rr: string;
  /** 체온(섭씨), 예: '36.5' */
  temp: string;
};

export const DEFAULT_VITALS: VitalSigns = {
  bp: '120/82',
  hr: '80',
  rr: '18',
  temp: '36.5',
};

export type SourceVitalSigns = {
  맥박?: string;
  체온?: string;
  혈압?: string;
  호흡?: string;
} | null | undefined;

export function resolveVitalSigns(source: SourceVitalSigns): VitalSigns {
  if (!source) return DEFAULT_VITALS;

  return {
    bp: stripUnit(source.혈압, /mmhg/gi) ?? DEFAULT_VITALS.bp,
    hr: stripUnit(source.맥박, /회\s*\/\s*분/g) ?? DEFAULT_VITALS.hr,
    rr: stripUnit(source.호흡, /회\s*\/\s*분/g) ?? DEFAULT_VITALS.rr,
    temp: stripUnit(source.체온, /℃|°C/gi) ?? DEFAULT_VITALS.temp,
  };
}

function stripUnit(value: string | undefined, unitPattern: RegExp) {
  const normalized = value?.replace(unitPattern, '').trim();
  return normalized || undefined;
}
