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
