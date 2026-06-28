import { Environment, Html, OrbitControls, PerspectiveCamera, useAnimations, useGLTF } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture } from 'three';
import type { Group, Mesh, Object3D } from 'three';
import { ACTIVE_CASE, PATIENT_CASES, resolveCaseModel } from '../patientModels';
import type { CaseModel, ModelPlacement } from '../patientModels';
import { FURNITURE_MODELS } from '../furnitureModels';

type ClinicSceneProps = {
  isPatientSpeaking: boolean;
  patientReply: string;
};

// Single source of truth for desk placement (값은 furnitureModels.ts에서 가져옴).
// Move the desk → the vital screen follows automatically.
const DESK_POSITION = FURNITURE_MODELS.Desk.position;
const DESK_SCALE = FURNITURE_MODELS.Desk.scale;
const ACTIVE_CASE_MODELS = PATIENT_CASES[ACTIVE_CASE].models as CaseModel[];

// Preload all models
useGLTF.preload(FURNITURE_MODELS.Desk.path);
useGLTF.preload(FURNITURE_MODELS.Chair.path);
useGLTF.preload(FURNITURE_MODELS.Door.path);
// 활성 케이스의 모든 모델(소아면 보호자+소아 둘 다) 미리 로드.
ACTIVE_CASE_MODELS.forEach((cm) => useGLTF.preload(resolveCaseModel(cm).path));

function enableShadows(scene: Object3D) {
  scene.traverse((child) => {
    if ((child as Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

export default function ClinicScene({ isPatientSpeaking, patientReply }: ClinicSceneProps) {
  return (
    <div className="clinic-scene" aria-label="3D CPX clinic room">
      <Canvas gl={{ preserveDrawingBuffer: true }} shadows dpr={[1, 1.5]}>
        <PerspectiveCamera makeDefault position={[0.08, 1.52, 2.58]} fov={47} />
        <ambientLight intensity={0.42} color="#fff4e0" />
        <directionalLight
          castShadow
          intensity={2.0}
          position={[3.5, 5.5, 2.5]}
          color="#ffe8c0"
          shadow-mapSize={[1024, 1024]}
        />
        {/* Window sunlight */}
        <pointLight position={[2.8, 2.4, -2.6]} intensity={2.2} color="#ffb050" distance={6} decay={2} />
        {/* Soft fill */}
        <pointLight position={[-2.5, 2.5, 0.5]} intensity={0.5} color="#fff0d8" distance={8} decay={2} />
        {/* Desk lamp glow */}
        <pointLight position={[0.9, 1.35, -0.62]} intensity={1.0} color="#ffa030" distance={2.5} decay={2} />
        <ClinicRoom isPatientSpeaking={isPatientSpeaking} patientReply={patientReply} />
        <Environment files="/hdri/lebombo_1k.hdr" />
        <OrbitControls
          enableDamping
          enableRotate={false}
          enableZoom={false}
          enablePan={false}
          target={[0.5, 1.0, -1.8]}
        />
      </Canvas>
    </div>
  );
}

function ClinicRoom({ isPatientSpeaking, patientReply }: ClinicSceneProps) {
  // Shared ref: the chair acts as an occluder mask for the monitor screen.
  const chairRef = useRef<Group>(null);
  return (
    <group>
      <RoomShell />
      <ModelDesk />
      <MonitorScreen occluderRef={chairRef} />
      <PatientSeat
        isPatientSpeaking={isPatientSpeaking}
        patientReply={patientReply}
        chairRef={chairRef}
      />
      <WindowBlinds />
      <Printer />
      <ModelDoor />
      <IndoorPlant />
    </group>
  );
}

function RoomShell() {
  return (
    <group>
      {/* Floor — warm wood */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[8, 7]} />
        <meshStandardMaterial color="#b8845a" roughness={0.72} metalness={0.02} />
      </mesh>
      {/* Ceiling */}
      <mesh position={[0, 3.5, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 6]} />
        <meshStandardMaterial color="#f5ede3" roughness={0.92} />
      </mesh>
      {/* Back wall */}
      <mesh receiveShadow position={[0, 1.75, -3.05]}>
        <boxGeometry args={[8, 3.5, 0.12]} />
        <meshStandardMaterial color="#f0e8da" roughness={0.88} />
      </mesh>
      {/* Left wall */}
      <mesh receiveShadow position={[-4, 1.75, 0]}>
        <boxGeometry args={[0.12, 3.5, 6.2]} />
        <meshStandardMaterial color="#ede5d8" roughness={0.88} />
      </mesh>
      {/* Right wall */}
      <mesh receiveShadow position={[4, 1.75, 0]}>
        <boxGeometry args={[0.12, 3.5, 6.2]} />
        <meshStandardMaterial color="#ede5d8" roughness={0.88} />
      </mesh>
      {/* Baseboard back */}
      <mesh position={[0, 0.07, -2.99]}>
        <boxGeometry args={[8, 0.14, 0.06]} />
        <meshStandardMaterial color="#d4c0a8" roughness={0.6} />
      </mesh>
      {/* Baseboard left */}
      <mesh position={[-3.94, 0.07, 0]}>
        <boxGeometry args={[0.06, 0.14, 6.2]} />
        <meshStandardMaterial color="#d4c0a8" roughness={0.6} />
      </mesh>
      {/* Baseboard right */}
      <mesh position={[3.94, 0.07, 0]}>
        <boxGeometry args={[0.06, 0.14, 6.2]} />
        <meshStandardMaterial color="#d4c0a8" roughness={0.6} />
      </mesh>
    </group>
  );
}

// Static desk placement, captured once from the old dynamic recenterToFloor
// result. It used to be recomputed in an effect every mount, but because
// useGLTF caches/shares the scene, HMR/StrictMode re-runs kept re-applying the
// offset on top of the previous one → the desk drifted away in +z each edit.
// Freezing it as a constant offset on a wrapper group removes the drift while
// keeping the exact same on-screen position.
const DESK_OFFSET: [number, number, number] = [
  -15.075542786967414, 4.017585544939756, 1.63,
];
const DESK_ROTATION: [number, number, number] = [0, Math.PI / 2, 0];

function ModelDesk() {
  const { scene } = useGLTF(FURNITURE_MODELS.Desk.path);
  useEffect(() => {
    // Hide the chair baked into the desk model.
    scene.traverse((o) => {
      if (o.name && /chair/i.test(o.name)) o.visible = false;
    });
    enableShadows(scene);
    // Shared cached scene may still carry a transform from a previous mount —
    // keep it at identity and place it via the wrapper group below.
    scene.position.set(0, 0, 0);
    scene.rotation.set(0, 0, 0);
  }, [scene]);
  return (
    <group position={DESK_POSITION} scale={DESK_SCALE}>
      <group position={DESK_OFFSET} rotation={DESK_ROTATION}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

function ModelDoor() {
  const cfg = FURNITURE_MODELS.Door;
  const { scene } = useGLTF(cfg.path);
  useEffect(() => { enableShadows(scene); }, [scene]);
  return (
    <primitive
      object={scene}
      position={cfg.position}
      rotation={cfg.rotation ?? [0, 0, 0]}
      scale={cfg.scale}
    />
  );
}

function PatientSeat({
  isPatientSpeaking,
  patientReply,
  chairRef,
}: ClinicSceneProps & { chairRef: React.RefObject<Group | null> }) {
  const patientRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!patientRef.current) return;
    const t = clock.elapsedTime;
    if (isPatientSpeaking) {
      patientRef.current.position.y = Math.sin(t * 6) * 0.018 + Math.sin(t * 11) * 0.008;
      patientRef.current.rotation.y = Math.sin(t * 1.4) * 0.04;
      patientRef.current.rotation.x = Math.sin(t * 3) * 0.01;
    } else {
      patientRef.current.position.y = Math.sin(t * 0.9) * 0.007;
      patientRef.current.rotation.y = Math.sin(t * 0.5) * 0.012;
      patientRef.current.rotation.x = 0;
    }
  });

  return (
    <group position={[1.0, 0, -1.0]} rotation={[0, -0.3, 0]}>
      {/* Rug */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <circleGeometry args={[0.7, 32]} />
        <meshStandardMaterial color="#8a6858" roughness={0.88} />
      </mesh>
      <ModelChair chairRef={chairRef} />
      {ACTIVE_CASE_MODELS.map((cm, i) => {
        const placement = resolveCaseModel(cm);
        // 보호자(guardian)는 가만히 앉아 있고, 환자 본인(patient)만 말하기 애니메이션 + 말풍선.
        if (cm.role === 'guardian') {
          return <ModelCharacter key={i} placement={placement} isPatientSpeaking={false} />;
        }
        return (
          <group key={i} ref={patientRef}>
            <ModelCharacter placement={placement} isPatientSpeaking={isPatientSpeaking} />
            <Html center position={[0.95, 1.7, 0.04]} distanceFactor={3.4}>
              <div className={isPatientSpeaking ? 'patient-bubble speaking' : 'patient-bubble'}>
                {patientReply}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function ModelChair({ chairRef }: { chairRef: React.RefObject<Group | null> }) {
  const cfg = FURNITURE_MODELS.Chair;
  const { scene } = useGLTF(cfg.path);
  useEffect(() => { enableShadows(scene); }, [scene]);
  return (
    <group ref={chairRef}>
      <primitive object={scene} position={cfg.position} rotation={cfg.rotation ?? [0, 0, 0]} scale={cfg.scale} />
    </group>
  );
}

function ModelCharacter({
  placement,
  isPatientSpeaking: _isPatientSpeaking,
}: {
  placement: ModelPlacement;
  isPatientSpeaking: boolean;
}) {
  const groupRef = useRef<Group>(null);
  const { scene, animations } = useGLTF(placement.path);
  const { actions, names } = useAnimations(animations, groupRef);

  useEffect(() => {
    enableShadows(scene);
    // Play Idle — no sitting animation in this model
    const idle = names.find((n) => n === 'CharacterArmature|Idle' || n === 'Idle');
    if (idle && actions[idle]) actions[idle]!.play();
  }, [actions, names, scene]);

  // 주의: useGLTF 는 path 별로 scene 을 공유 캐시한다. 한 케이스에서 "같은 glb" 를
  // 두 번 쓰면 같은 scene 객체가 두 부모에 붙어 충돌하므로, 그럴 땐 별도 복제가 필요.
  // 현재 케이스들은 모델이 모두 서로 다른 파일이라 문제 없음.
  return (
    <group ref={groupRef} position={placement.position} scale={placement.scale} rotation={placement.rotation ?? [0, 0, 0]}>
      <primitive object={scene} />
    </group>
  );
}

// 모니터 화면 위치. 이 3개 숫자만 바꾸면 됨.
//   1번(x): 좌우  → 키우면 오른쪽, 줄이면 왼쪽
//   2번(y): 높이  → 키우면 위
//   3번(z): 앞뒤  → 키우면 카메라 쪽(앞)
const SCREEN_POSITION: [number, number, number] = [0.0054, 1.433, 0.55];

// 책상이 움직여도 화면은 안 따라감(고정).
const DESK_ANCHOR: [number, number, number] = [...DESK_POSITION];

// Vitals to render on the screen.
const VITALS: [string, string, string][] = [
  ['HR', '80', 'bpm'],
  ['BP', '120/82', 'mmHg'],
  ['RR', '18', '/min'],
  ['TEMP', '36.5', 'degC'],
];

// Draw the CPX monitor UI onto a canvas → use as a texture on a real mesh.
// A real mesh is depth-tested by the GPU, so the chair occludes it correctly.
function useMonitorTexture() {
  return useMemo(() => {
    const w = 476;
    const h = 268;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    // Background
    ctx.fillStyle = '#0c1820';
    ctx.fillRect(0, 0, w, h);
    // Grid
    ctx.strokeStyle = 'rgba(134,209,180,0.10)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 26) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 26) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    // Header
    ctx.fillStyle = '#a7b8c0';
    ctx.font = 'bold 21px Arial';
    ctx.fillText('CPX MONITOR', 24, 42);
    ctx.fillStyle = '#58e197';
    ctx.font = 'bold 17px Arial';
    ctx.fillText('LIVE', w - 78, 40);
    ctx.strokeStyle = "'rgba(134,209,180,0.3)'";
    ctx.beginPath();
    ctx.moveTo(24, 56);
    ctx.lineTo(w - 24, 56);
    ctx.stroke();
    // Rows
    VITALS.forEach(([label, value, unit], i) => {
      const y = 108 + i * 44;
      ctx.fillStyle = '#8ba7b1';
      ctx.font = 'bold 18px Arial';
      ctx.fillText(label, 28, y);
      ctx.fillStyle = i === 0 ? '#72f2a7' : '#effff9';
      ctx.font = `900 ${i === 0 ? 32 : 25}px Arial`;
      ctx.fillText(value, 150, y + (i === 0 ? 3 : 0));
      ctx.fillStyle = '#8ba7b1';
      ctx.font = 'bold 18px Arial';
      ctx.fillText(unit, w - 110, y);
    });
    const tex = new CanvasTexture(canvas);
    tex.anisotropy = 8;
    return tex;
  }, []);
}

function MonitorScreen({ occluderRef: _occluderRef }: { occluderRef: React.RefObject<Group | null> }) {
  const texture = useMonitorTexture();
  const pos: [number, number, number] = [
    SCREEN_POSITION[0] + (DESK_POSITION[0] - DESK_ANCHOR[0]),
    SCREEN_POSITION[1] + (DESK_POSITION[1] - DESK_ANCHOR[1]),
    SCREEN_POSITION[2] + (DESK_POSITION[2] - DESK_ANCHOR[2]),
  ];
  return (
    <group position={pos} rotation={[0, 0, 0]} scale={0.72}>
      {/* Bezel */}
      <mesh position={[0, 0, -0.01]}>
        <boxGeometry args={[0.93, 0.524, 0.04]} />
        <meshStandardMaterial color="#000000" roughness={0.4} />
      </mesh>
      {/* Screen with vitals texture */}
      <mesh position={[0, 0, 0.015]}>
        <planeGeometry args={[0.93, 0.524]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

function WindowBlinds() {
  return (
    <group position={[2.85, 1.9, -2.98]}>
      <mesh receiveShadow>
        <boxGeometry args={[1.7, 1.05, 0.06]} />
        <meshStandardMaterial color="#e8d8c4" roughness={0.45} />
      </mesh>
      {[-0.36, -0.18, 0, 0.18, 0.36].map((y) => (
        <mesh castShadow key={y} position={[0, y, 0.05]}>
          <boxGeometry args={[1.6, 0.035, 0.08]} />
          <meshStandardMaterial color="#f8f0e2" roughness={0.38} />
        </mesh>
      ))}
      <mesh position={[0.86, -0.04, 0.08]}>
        <cylinderGeometry args={[0.01, 0.01, 1, 8]} />
        <meshStandardMaterial color="#8c7c6c" roughness={0.4} />
      </mesh>
    </group>
  );
}

function Printer() {
  return (
    <group position={[2.95, 0.72, -1.85]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.72, 0.34, 0.52]} />
        <meshStandardMaterial color="#d8dde1" roughness={0.5} />
      </mesh>
      <mesh castShadow position={[0, 0.2, -0.04]}>
        <boxGeometry args={[0.62, 0.06, 0.36]} />
        <meshStandardMaterial color="#f4f6f7" roughness={0.45} />
      </mesh>
      <mesh position={[0.2, 0.03, 0.27]}>
        <boxGeometry args={[0.22, 0.045, 0.02]} />
        <meshStandardMaterial color="#5d8fa3" emissive="#234b55" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
}

function IndoorPlant() {
  return (
    <group position={[-3.4, 0, -0.6]}>
      <mesh castShadow receiveShadow position={[0, 0.22, 0]}>
        <cylinderGeometry args={[0.14, 0.1, 0.44, 14]} />
        <meshStandardMaterial color="#9a7254" roughness={0.72} />
      </mesh>
      <mesh position={[0, 0.45, 0]}>
        <cylinderGeometry args={[0.135, 0.135, 0.04, 14]} />
        <meshStandardMaterial color="#4a3520" roughness={0.92} />
      </mesh>
      <mesh castShadow position={[0, 0.64, 0]}>
        <cylinderGeometry args={[0.018, 0.022, 0.36, 8]} />
        <meshStandardMaterial color="#4a6840" roughness={0.78} />
      </mesh>
      {(
        [
          [0, 0.88, 0, 0.22, '#3d7a4a'],
          [-0.16, 0.78, 0.09, 0.14, '#2d6640'],
          [0.15, 0.8, -0.06, 0.15, '#346e44'],
          [0.05, 0.7, 0.14, 0.11, '#2a5e38'],
          [-0.08, 0.95, -0.1, 0.13, '#3a7248'],
        ] as [number, number, number, number, string][]
      ).map(([x, y, z, r, c], i) => (
        <mesh castShadow key={i} position={[x, y, z]}>
          <sphereGeometry args={[r, 10, 8]} />
          <meshStandardMaterial color={c} roughness={0.82} />
        </mesh>
      ))}
    </group>
  );
}
