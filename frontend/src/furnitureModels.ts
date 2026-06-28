// 가구 GLB 모델별 설정 모음.
// 씬(ClinicScene)은 이 표에서 path/scale/position/rotation을 가져와 배치만 한다.
// 가구 위치/크기를 바꿀 땐 여기 숫자만 만지면 됨.

export type FurnitureModelConfig = {
  /** public 기준 경로. */
  path: string;
  /** 모델 크기 배율. */
  scale: number;
  /** 위치 [x(좌우), y(높이), z(앞뒤)]. Chair는 PatientSeat 그룹 내부(상대) 좌표. */
  position: [number, number, number];
  /** 회전 [x, y, z] (라디안). 생략하면 [0,0,0]. */
  rotation?: [number, number, number];
};

type FurnitureKey = "Desk" | "Chair" | "Door" | "Bed" | "HandWash";

// ── 가구별 설정 ───────────────────────────────────────────────
export const FURNITURE_MODELS: Record<FurnitureKey, FurnitureModelConfig> = {
  // Desk: position/scale은 모니터 화면이 기준점으로도 참조함(ClinicScene의 MonitorScreen).
  //       회전은 모델 useEffect에서 baked 처리하므로 여기엔 두지 않는다.
  Desk: { path: "/models/Desk.glb", scale: 1.2, position: [24, -5, -2.421] },
  // Chair: PatientSeat 그룹 내부 기준 좌표이며 occluder(가림막) 역할도 함.
  Chair: {
    path: "/models/Chair.glb",
    scale: 1,
    position: [0, -0.1, 0],
    rotation: [0, -Math.PI / 2, 0],
  },
  Door: {
    path: "/models/Door.glb",
    scale: 0.95,
    position: [-2.05, 0, -2.91],
    rotation: [0, 0, 0],
  },
  // Bed: 오른쪽 벽(x=4)에 붙여 화면 오른쪽 모서리에 보이도록 배치.
  // 머리가 벽쪽(뒤)을 향하도록 90도 회전.
  Bed: {
    path: "/models/Bed Single.glb",
    scale: 1,
    position: [3.1, 0, -1.4],
    rotation: [0, 0, 0],
  },
  // HandWash: 책상 오른쪽 위에 올려두는 손세정대. 책상 위 높이/오른쪽 끝에 맞춰 조정.
  HandWash: {
    path: "/models/HandWash.glb",
    scale: 0.2,
    position: [0.55, 1.1, 0.25],
    rotation: [0, 0, 0],
  },
};

export type FurnitureKeyType = keyof typeof FURNITURE_MODELS;
