// 환자 씬 구성 데이터.
//
// 2단 구조:
//   1) MODEL LIBRARY (PATIENT_MODELS) — glb 파일 하나하나의 "기본 배치".
//      모델마다 크기/원점이 달라서 의자에 맞는 scale/position 을 여기서 잡는다.
//   2) CASES (PATIENT_CASES) — 한 화면에 띄울 "환자 구성".
//      성인은 모델 1개, 소아는 보호자(여자) + 소아 모델 2개가 한 번에 들어간다.
//
// 씬(ClinicScene)은 ACTIVE_CASE 키로 케이스를 골라, 그 안의 모델들을 전부 렌더한다.

// ──────────────────────────────────────────────────────────────────────────
// 1) 모델 라이브러리
// ──────────────────────────────────────────────────────────────────────────

export type ModelPlacement = {
  /** public 기준 경로. 공백은 %20 으로. */
  path: string;
  /** 모델 크기 배율. */
  scale: number;
  /** 의자 기준 위치 [x(좌우), y(높이), z(앞뒤)]. */
  position: [number, number, number];
  /** 회전 [x, y, z] (라디안). 생략하면 [0,0,0]. */
  rotation?: [number, number, number];
};

/** @deprecated 이름 호환용. 새 코드는 ModelPlacement 를 쓴다. */
export type PatientModelConfig = ModelPlacement;

type PatientModelKey =
  | "Man1"
  | "Man2"
  | "Man4"
  | "Man5"
  | "Woman1"
  | "Woman3"
  | "Woman4"
  | "Baby"
  | "Boy"
  | "Girl"
  | "Schoolboy"
  | "Schoolgirl";

export const PATIENT_MODELS: Record<PatientModelKey, ModelPlacement> = {
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
  // 소아 모델들. 어른 모델과 원점/방향이 달라 의자에 딱 맞지 않음.
  // 단독 기본값은 화면에 보이도록만 맞춰둔 임시값(실제 배치 시 재조정 필요).
  Baby: {
    path: "/models/patients/Baby.glb",
    scale: 0.6,
    position: [0, 1, 0.15],
  },
  // 소아_2 남아.
  Boy: {
    path: "/models/patients/Boy.glb",
    scale: 1.0,
    position: [0, -0.6, 0.05],
  },
  // 소아_2 여아.
  Girl: {
    path: "/models/patients/Girl.glb",
    scale: 1.0,
    position: [0, -0.6, 0.05],
  },
  // 청소년 남. 단독 기본값은 임시값(실제 배치 시 재조정 필요).
  Schoolboy: {
    path: "/models/patients/Schoolboy.glb",
    scale: 1.3,
    position: [0, 0.8, 0.05],
  },
  // 청소년 여.
  Schoolgirl: {
    path: "/models/patients/Schoolgirl.glb",
    scale: 1.3,
    position: [0, 0.8, 0.05],
  },
};

export type PatientKey = keyof typeof PATIENT_MODELS;

// ──────────────────────────────────────────────────────────────────────────
// 2) 케이스
// ──────────────────────────────────────────────────────────────────────────

/** 크게 나눈 연령대 분류. */
export type PatientCategory = "child" | "adolescent" | "adult";
export type PatientGender = "male" | "female";

/** 케이스 안에서 모델이 맡는 역할. patient(=말하는 환자 본인) / guardian(=동반 보호자). */
export type CaseModelRole = "patient" | "guardian";

/** 케이스에 들어가는 모델 1개. 라이브러리 기본 배치를 쓰되, 같이 띄울 땐 placement 로 덮어쓴다. */
export type CaseModel = {
  /** PATIENT_MODELS 키. */
  model: PatientKey;
  /** 기본 patient. 소아 케이스의 보호자는 "guardian" (말하지 않고 옆에 앉아 있음). */
  role?: CaseModelRole;
  /** 동반 렌더 시 겹치지 않도록 위치/크기 일부만 덮어쓰기. */
  placement?: Partial<ModelPlacement>;
};

export type PatientCase = {
  /** 사이드바/디버그용 표시 이름. */
  label: string;
  category: PatientCategory;
  gender?: PatientGender;
  /** 한 화면에 띄울 모델들. 1개=단독, 2개=동반(보호자+소아). */
  models: CaseModel[];
};

// 케이스 키 네이밍: <분류>_<성별 또는 변형>.
// 소아=child, 청소년=adolescent, 성인=adult.
export const PATIENT_CASES = {
  // ── 성인 (기존 캐릭터 전부를 남/여로 분리해 수용) ─────────────────────────
  adult_m1: {
    label: "성인 남성 1",
    category: "adult",
    gender: "male",
    models: [{ model: "Man1" }],
  },
  adult_m2: {
    label: "성인 남성 2",
    category: "adult",
    gender: "male",
    models: [{ model: "Man2" }],
  },
  adult_m4: {
    label: "성인 남성 4",
    category: "adult",
    gender: "male",
    models: [{ model: "Man4" }],
  },
  adult_m5: {
    label: "성인 남성 5",
    category: "adult",
    gender: "male",
    models: [{ model: "Man5" }],
  },
  adult_f1: {
    label: "성인 여성 1",
    category: "adult",
    gender: "female",
    models: [{ model: "Woman1" }],
  },
  adult_f3: {
    label: "성인 여성 3",
    category: "adult",
    gender: "female",
    models: [{ model: "Woman3" }],
  },
  adult_f4: {
    label: "성인 여성 4",
    category: "adult",
    gender: "female",
    models: [{ model: "Woman4" }],
  },

  child1_1: {
    label: "소아_1 (영유아 + 보호자A)",
    category: "child",
    models: [
      {
        model: "Woman1",
        role: "guardian",
        placement: { position: [-0, -0.6, 0.05] },
      },
      {
        model: "Baby",
        role: "patient",
        placement: { position: [-0.1, 1.1, 0.4], scale: 0.4 },
      },
    ],
  },
  child1_2: {
    label: "소아_1 (영유아 + 보호자B)",
    category: "child",
    models: [
      {
        model: "Woman4",
        role: "guardian",
        placement: { position: [-0, -0.6, 0.05] },
      },
      {
        model: "Baby",
        role: "patient",
        placement: { position: [-0.1, 1.1, 0.4], scale: 0.4 },
      },
    ],
  },
  child1_3: {
    label: "소아_1 (영유아 + 보호자C)",
    category: "child",
    models: [
      {
        model: "Woman3",
        role: "guardian",
        placement: { position: [-0, -0.6, 0.05] },
      },
      {
        model: "Baby",
        role: "patient",
        placement: { position: [-0.1, 1.1, 0.4], scale: 0.4 },
      },
    ],
  },

  child2_f: {
    label: "소아_2 여아 (Girl + 보호자)",
    category: "child",
    gender: "female",
    models: [
      {
        model: "Woman1",
        role: "guardian",
        placement: { position: [-0.2, -0.6, 0.05] },
      },
      {
        model: "Girl",
        role: "patient",
        placement: { position: [0.25, 1, 0.2], scale: 0.6 },
      },
    ],
  },
  child2_m: {
    label: "소아_2 남아 (Boy + 보호자)",
    category: "child",
    gender: "male",
    models: [
      {
        model: "Woman1",
        role: "guardian",
        placement: { position: [-0.2, -0.6, 0.05] },
      },
      {
        model: "Boy",
        role: "patient",
        placement: { position: [0.25, 1, 0.2], scale: 0.6 },
      },
    ],
  },

  // ── 청소년 (단독 모델) ──────────────────────────────────────────────────
  adolescent_f: {
    label: "청소년 여 (Schoolgirl)",
    category: "adolescent",
    gender: "female",
    models: [{ model: "Schoolgirl" }],
  },
  adolescent_m: {
    label: "청소년 남 (Schoolboy)",
    category: "adolescent",
    gender: "male",
    models: [{ model: "Schoolboy" }],
  },
} satisfies Record<string, PatientCase>;

export type CaseKey = keyof typeof PATIENT_CASES;

/** 케이스 모델의 최종 배치 = 라이브러리 기본값 + 케이스별 오버라이드. */
export function resolveCaseModel(cm: CaseModel): ModelPlacement {
  return { ...PATIENT_MODELS[cm.model], ...cm.placement };
}

// 지금 화면에 띄울 케이스. 이 한 줄만 바꾸면 교체됨.
export const ACTIVE_CASE: CaseKey = "adolescent_m";
