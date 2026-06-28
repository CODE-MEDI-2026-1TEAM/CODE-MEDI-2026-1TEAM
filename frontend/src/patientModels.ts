// 환자 캐릭터 모델별 설정 모음.
// 모델마다 크기/좌표가 다르므로 여기서 개별로 조정한다.
// 씬(ClinicScene)은 ACTIVE_PATIENT 키로 이 표에서 설정을 가져와 쓴다.

export type PatientModelConfig = {
  /** public 기준 경로. 공백은 %20 으로. */
  path: string;
  /** 모델 크기 배율. */
  scale: number;
  /** 의자 기준 위치 [x(좌우), y(높이), z(앞뒤)]. */
  position: [number, number, number];
  /** 회전 [x, y, z] (라디안). 생략하면 [0,0,0]. */
  rotation?: [number, number, number];
};

type PatientModelKey =
  | "Man1"
  | "Man2"
  | "Man3"
  | "Man4"
  | "Man5"
  | "Woman1"
  | "Woman2"
  | "Woman3"
  | "Woman4"
  | "Zelda";

export const PATIENT_MODELS: Record<PatientModelKey, PatientModelConfig> = {
  Man1: {
    path: "/models/patients/Man1.glb",
    scale: 1.5,
    position: [0, -0.6, 0.05],
  },
  Man2: {
    path: "/models/patients/Man2.glb",
    scale: 1.5,
    position: [0, -0.6, 0.05],
  },
  Man3: {
    path: "/models/patients/Man3.glb",
    scale: 0.6,
    position: [0, -0.7, 0.05],
  },
  Man4: {
    path: "/models/patients/Man4.glb",
    scale: 1.5,
    position: [0, -0.6, 0.05],
  },
  Man5: {
    path: "/models/patients/Man5.glb",
    scale: 1.5,
    position: [0, -0.6, 0.05],
  },
  Woman1: {
    path: "/models/patients/Woman1.glb",
    scale: 1.5,
    position: [0, -0.6, 0.05],
  },
  Woman2: {
    path: "/models/patients/Woman2.glb",
    scale: 0.53,
    position: [0, -0.55, 0.05],
  },
  Woman3: {
    path: "/models/patients/Woman3.glb",
    scale: 1.5,
    position: [0, -0.6, 0.05],
  },
  Woman4: {
    path: "/models/patients/Woman4.glb",
    scale: 1.5,
    position: [0, -0.6, 0.05],
  },
  Zelda: {
    path: "/models/patients/Zelda.glb",
    scale: 0.82,
    position: [0, -0.1, 0.05],
  },
};

export type PatientKey = keyof typeof PATIENT_MODELS;

// 지금 화면에 띄울 환자. 이 한 줄만 바꾸면 교체됨.
export const ACTIVE_PATIENT: PatientKey = "Woman4";
