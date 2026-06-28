import { Environment, OrbitControls, PerspectiveCamera, useAnimations, useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import type { Group, Mesh, Object3D } from 'three';
import { ACTIVE_CASE, PATIENT_CASES, resolveCaseModel } from '../patientModels';
import type { CaseKey, CaseModel, ModelPlacement, PatientKey } from '../patientModels';
import { FURNITURE_MODELS } from '../furnitureModels';

// 침대에 누운 환자 전용 씬.
// ClinicScene(앉은 면담)과 같은 patientCaseKey 를 받아 "같은 환자"를 눕혀서 보여준다.
// 좌표/스케일은 면담 씬과 완전히 별개이므로 여기 상수만 만지면 된다.

type BedsideSceneProps = {
  isPatientSpeaking: boolean;
  patientReply: string;
  patientCaseKey?: CaseKey;
  showPatientBubble?: boolean;
};

// ── 배치 상수 (여기 숫자만 만지면 됨) ─────────────────────────────
// 카메라: 침대를 옆(+X)에서 살짝 비스듬히·위에서 내려다보는 3/4 구도.
//   침대 긴 축 = Z. 헤드보드(머리)는 -Z, 발치는 +Z.
//   화면에서 머리가 오른쪽으로 가버리면 → 카메라 X를 음수로(반대편에서 보기): [-3.8, ...]
const CAMERA_POSITION: [number, number, number] = [-2.4, 3.4, 1.05];
const CAMERA_TARGET: [number, number, number] = [0, 0.45, 0.1];
const CAMERA_FOV = 44;

// 침대: 긴 축 Z, 머리 -Z. 카메라 반대편(+X) 벽에 바짝 붙임.
const BED_PLACEMENT = {
  position: [0.5, 0, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  scale: 1,
};

// 벽 (ClinicScene 색 그대로). 카메라가 -X 쪽이라 +X 옆벽이 침대 뒤 배경이 됨.
const WALL_BACK_COLOR = '#f0e8da'; // 뒷벽(-Z)
const WALL_SIDE_COLOR = '#ede5d8'; // 옆벽(+X)
const SIDE_WALL_X = 1.4; // +X 옆벽 위치(침대를 여기에 붙임)

// 누운 환자: 서 있는 모델을 X축 -90° 눕힘 → 등을 대고 누움(얼굴 위), 머리 -Z 방향.
//   position[0](X) = 침대 X(0.5) 고정 / position[2](Z) = 베개(-Z)·발치(+Z) 맞춤.
//   머리·발이 뒤집히면 rotation 을 [Math.PI/2, Math.PI, 0] 로.
// ── 모델마다 키·원점이 달라 scale 과 높이(position[1])를 따로 잡는다. ──
type LyingConfig = {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
};

const LYING_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];
const BED_X = 0.5; // 침대 X (BED_PLACEMENT.position[0] 과 동일하게)

// 성인 기준 폴백.
const LYING_DEFAULT: LyingConfig = {
  position: [BED_X, 0.97, -0.1],
  rotation: LYING_ROTATION,
  scale: 1.5,
};

// 모델별 누운 설정. 없는 키는 LYING_DEFAULT 사용.
//   소아 케이스(보호자+소아)에서는 환자=소아만 이 표로 눕고, 보호자는 GUARDIAN_OVERRIDE 로 서 있음.
const LYING_BY_MODEL: Partial<Record<PatientKey, LyingConfig>> = {
  // 성인 남
  Man1: { position: [BED_X, 0.9, 1.1], rotation: LYING_ROTATION, scale: 1.5 },
  Man2: { position: [BED_X, 0.9, 1.1], rotation: LYING_ROTATION, scale: 1.5 },
  Man4: { position: [BED_X, 0.9, 1.1], rotation: LYING_ROTATION, scale: 1.5 },
  Man5: { position: [BED_X, 0.9, 1.1], rotation: LYING_ROTATION, scale: 1.5 },
  // 성인 여
  Woman1: { position: [BED_X, 0.9, 1.15], rotation: LYING_ROTATION, scale: 1.5 },
  Woman3: { position: [BED_X, 0.9, 1.15], rotation: LYING_ROTATION, scale: 1.5 },
  Woman4: { position: [BED_X, 0.9, 1.15], rotation: LYING_ROTATION, scale: 1.5 },
  // 청소년 (성인보다 약간 작게)
  Schoolboy: { position: [BED_X, 0.92, 0.05], rotation: LYING_ROTATION, scale: 1.3 },
  Schoolgirl: { position: [BED_X, 0.94, -0.35], rotation: LYING_ROTATION, scale: 1.3 },
  // 소아 (더 작게, 베개 쪽으로 당김)
  Boy: { position: [BED_X, 0.93, -0.6], rotation: LYING_ROTATION, scale: 1.05 },
  Girl: { position: [BED_X, 0.93, -0.7], rotation: LYING_ROTATION, scale: 1.05 },
  // 영유아 (가장 작게)
  Baby: { position: [BED_X, 0.95, -0.85], rotation: LYING_ROTATION, scale: 0.65 },
};

useGLTF.preload(FURNITURE_MODELS.Bed.path);

function enableShadows(scene: Object3D) {
  scene.traverse((child) => {
    if ((child as Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

export default function BedsideScene({
  patientCaseKey = ACTIVE_CASE,
}: BedsideSceneProps) {
  return (
    <div className="clinic-scene" aria-label="3D bedside room">
      <Canvas gl={{ preserveDrawingBuffer: true }} shadows dpr={[1, 1.5]}>
        <PerspectiveCamera makeDefault position={CAMERA_POSITION} fov={CAMERA_FOV} />
        <ambientLight intensity={0.46} color="#fff4e0" />
        <directionalLight
          castShadow
          intensity={1.9}
          position={[2.5, 5.5, 3.0]}
          color="#ffe8c0"
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-2.5, 2.5, 1.0]} intensity={0.5} color="#fff0d8" distance={9} decay={2} />
        <BedsideRoom
          patientCaseKey={patientCaseKey}
        />
        <Environment files="/hdri/lebombo_1k.hdr" />
        <OrbitControls
          enableDamping
          enableRotate={false}
          enableZoom={false}
          enablePan={false}
          target={CAMERA_TARGET}
        />
      </Canvas>
    </div>
  );
}

function BedsideRoom({ patientCaseKey = ACTIVE_CASE }: Pick<BedsideSceneProps, 'patientCaseKey'>) {
  const caseModels = PATIENT_CASES[patientCaseKey].models as CaseModel[];
  return (
    <group>
      <RoomShell />
      <ModelBed />
      {caseModels.map((cm, i) => {
        const base = resolveCaseModel(cm);
        if (cm.role === 'guardian') {
          // 침대 씬에선 보호자(부모)는 렌더링하지 않음 — 소아 환자만 눕힘.
          return null;
        }
        // 환자 본인(소아 케이스에선 소아)은 침대에 눕힘. 모델별 설정 적용.
        const lying = LYING_BY_MODEL[cm.model] ?? LYING_DEFAULT;
        return (
          <group key={i}>
            <BedsideCharacter placement={{ ...base, ...lying }} />
          </group>
        );
      })}
    </group>
  );
}

function RoomShell() {
  return (
    <group>
      {/* Floor */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[8, 7]} />
        <meshStandardMaterial color="#b8845a" roughness={0.72} metalness={0.02} />
      </mesh>
      {/* Back wall (-Z) */}
      <mesh receiveShadow position={[0, 1.75, -2.2]}>
        <boxGeometry args={[8, 3.5, 0.12]} />
        <meshStandardMaterial color={WALL_BACK_COLOR} roughness={0.88} />
      </mesh>
      {/* Side wall (+X) — 침대를 붙이는 벽이자 침대 뒤 배경 */}
      <mesh receiveShadow position={[SIDE_WALL_X + 0.06, 1.75, 0]}>
        <boxGeometry args={[0.12, 3.5, 6.2]} />
        <meshStandardMaterial color={WALL_SIDE_COLOR} roughness={0.88} />
      </mesh>
    </group>
  );
}

function ModelBed() {
  const { scene } = useGLTF(FURNITURE_MODELS.Bed.path);
  useEffect(() => { enableShadows(scene); }, [scene]);
  return (
    <primitive
      object={scene}
      position={BED_PLACEMENT.position}
      rotation={BED_PLACEMENT.rotation}
      scale={BED_PLACEMENT.scale}
    />
  );
}

function BedsideCharacter({ placement }: { placement: ModelPlacement }) {
  const groupRef = useRef<Group>(null);
  const { scene, animations } = useGLTF(placement.path);
  const { actions, names } = useAnimations(animations, groupRef);

  useEffect(() => {
    enableShadows(scene);
    const idle = names.find((n) => n === 'CharacterArmature|Idle' || n === 'Idle');
    if (idle && actions[idle]) actions[idle]!.play();
  }, [actions, names, scene]);

  return (
    <group ref={groupRef} position={placement.position} scale={placement.scale} rotation={placement.rotation ?? [0, 0, 0]}>
      <primitive object={scene} />
    </group>
  );
}
