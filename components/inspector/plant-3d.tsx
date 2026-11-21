"use client";

/**
 * 3D Plant Inspector scene. One plant, procedural low-poly geometry by `form`.
 * Budget ≤ 5,000 triangles: leaves are 2-triangle quads and flowers/fruit are 20-triangle icosahedra,
 * both drawn with InstancedMesh (one draw call each). frameloop="demand", dpr [1, 1.5], no shadows.
 * Loaded with next/dynamic (ssr: false); the panel falls back to the 2D SVG if WebGL is missing or this throws.
 */
import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { Plant } from "@/lib/types";

import type { Stage } from "./stage";

const MAX_LEAVES = 900; // 1,800 triangles
const MAX_BLOOMS = 120; // 2,400 triangles
const BUD = "#9bb06b";

/** Seeded PRNG so the same plant looks the same at every age (only scale changes as it grows). */
function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const hash = (str: string) => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

interface Inst { p: THREE.Vector3; n: THREE.Vector3; s: number; tilt?: number }
interface Rod { a: THREE.Vector3; b: THREE.Vector3; r: number }

/**
 * Unit layout for a form: positions in a plant of height 1 and spread 1. Scaled by the current height/spread at render.
 * `slots` are candidate leaf/flower spots; how many are shown grows with canopy size.
 */
function layout(form: Plant["form"], seed: number) {
  const r = rng(seed);
  const leaves: Inst[] = [];
  const tips: Inst[] = [];
  const rods: Rod[] = [];
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const push = (arr: Inst[], p: THREE.Vector3, n: THREE.Vector3, s = 1, tilt?: number) => arr.push({ p, n: n.normalize(), s, tilt });

  switch (form) {
    case "palm": {
      rods.push({ a: v(0, 0, 0), b: v(0, 0.62, 0), r: 0.035 });
      const fronds = 12;
      for (let f = 0; f < fronds; f++) {
        const ang = (f / fronds) * Math.PI * 2 + r() * 0.3;
        const droop = 0.15 + r() * 0.35;
        for (let k = 1; k <= 22; k++) {
          const t = k / 22;
          const x = Math.cos(ang) * t * 0.5;
          const z = Math.sin(ang) * t * 0.5;
          const y = 0.62 + t * 0.32 - t * t * (0.32 + droop);
          for (const side of [-1, 1]) {
            const n = v(-Math.sin(ang) * side, 0.5, Math.cos(ang) * side);
            push(leaves, v(x, y, z), n, 0.9 - t * 0.4, ang);
          }
        }
      }
      for (let i = 0; i < 40; i++) push(tips, v((r() - 0.5) * 0.12, 0.58 + r() * 0.04, (r() - 0.5) * 0.12), v(0, -1, 0), 0.6);
      break;
    }
    case "tree": {
      rods.push({ a: v(0, 0, 0), b: v(0, 0.45, 0), r: 0.04 });
      for (let b = 0; b < 5; b++) {
        const ang = (b / 5) * Math.PI * 2;
        rods.push({ a: v(0, 0.38, 0), b: v(Math.cos(ang) * 0.22, 0.62, Math.sin(ang) * 0.22), r: 0.018 });
      }
      for (let i = 0; i < MAX_LEAVES; i++) {
        const u = r() * Math.PI * 2, w = Math.acos(2 * r() - 1);
        const n = v(Math.sin(w) * Math.cos(u), Math.cos(w), Math.sin(w) * Math.sin(u));
        const rad = 0.75 + r() * 0.25;
        push(leaves, v(n.x * 0.5 * rad, 0.68 + n.y * 0.3 * rad, n.z * 0.5 * rad), n.clone(), 1);
      }
      for (let i = 0; i < MAX_BLOOMS; i++) {
        const u = r() * Math.PI * 2, w = Math.acos(r() * 1.6 - 0.6);
        const n = v(Math.sin(w) * Math.cos(u), Math.cos(w), Math.sin(w) * Math.sin(u));
        push(tips, v(n.x * 0.52, 0.68 + n.y * 0.32, n.z * 0.52), n, 1);
      }
      break;
    }
    case "grass": {
      for (let i = 0; i < MAX_LEAVES; i++) {
        const ang = r() * Math.PI * 2;
        const lean = 0.2 + r() * 0.5;
        const base = v(Math.cos(ang) * r() * 0.08, 0, Math.sin(ang) * r() * 0.08);
        const len = 0.6 + r() * 0.4;
        // Blades are 3 stacked quads that bend outward.
        for (let k = 0; k < 3; k++) {
          const t = (k + 0.5) / 3;
          const p = base.clone().add(v(Math.cos(ang) * lean * t * t * 0.6, t * len, Math.sin(ang) * lean * t * t * 0.6));
          push(leaves, p, v(Math.cos(ang), 0.2, Math.sin(ang)), 1, ang);
          if (leaves.length >= MAX_LEAVES) break;
        }
        if (leaves.length >= MAX_LEAVES) break;
      }
      for (let i = 0; i < MAX_BLOOMS; i++) {
        const ang = r() * Math.PI * 2, d = 0.15 + r() * 0.35;
        push(tips, v(Math.cos(ang) * d, 0.9 + r() * 0.2, Math.sin(ang) * d), v(0, 1, 0), 0.6);
      }
      break;
    }
    case "upright": {
      const stems = 9;
      for (let s = 0; s < stems; s++) {
        const ang = (s / stems) * Math.PI * 2 + r();
        const lean = 0.1 + r() * 0.3;
        const top = v(Math.cos(ang) * lean, 0.75 + r() * 0.25, Math.sin(ang) * lean);
        rods.push({ a: v(0, 0, 0), b: top, r: 0.012 });
        for (let k = 0; k < 90; k++) {
          const t = 0.08 + (k / 90) * 0.85;
          const p = top.clone().multiplyScalar(t);
          const a2 = ang + k * 2.4;
          push(leaves, p.add(v(Math.cos(a2) * 0.05, 0, Math.sin(a2) * 0.05)), v(Math.cos(a2), 0.6, Math.sin(a2)), 0.9 - t * 0.4, a2);
        }
        for (let k = 0; k < MAX_BLOOMS / stems; k++) {
          const t = 0.8 + r() * 0.22;
          push(tips, top.clone().multiplyScalar(t).add(v((r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08)), v(0, 1, 0), 1);
        }
      }
      break;
    }
    case "vine": {
      rods.push({ a: v(0, 0, 0), b: v(0, 1.05, 0), r: 0.01 });
      for (let i = 0; i < MAX_LEAVES; i++) {
        const t = i / MAX_LEAVES;
        const ang = t * Math.PI * 14 + r() * 0.6;
        const rad = 0.12 + r() * 0.18;
        push(leaves, v(Math.cos(ang) * rad, t, Math.sin(ang) * rad), v(Math.cos(ang), 0.3, Math.sin(ang)), 1.1);
      }
      for (let i = 0; i < MAX_BLOOMS; i++) {
        const t = 0.2 + r() * 0.8, ang = r() * Math.PI * 2;
        push(tips, v(Math.cos(ang) * 0.3, t, Math.sin(ang) * 0.3), v(Math.cos(ang), 0, Math.sin(ang)), 1.1);
      }
      break;
    }
    case "fern": {
      const fronds = 14;
      for (let f = 0; f < fronds; f++) {
        const ang = (f / fronds) * Math.PI * 2 + r() * 0.3;
        const arch = 0.55 + r() * 0.35;
        for (let k = 1; k <= 30; k++) {
          const t = k / 30;
          const p = v(Math.cos(ang) * t * 0.5, Math.sin(t * Math.PI * 0.85) * arch * (1 - t * 0.3), Math.sin(ang) * t * 0.5);
          for (const side of [-1, 1]) push(leaves, p.clone(), v(-Math.sin(ang) * side, 1, Math.cos(ang) * side), 0.9 - t * 0.5, ang);
        }
      }
      break;
    }
    default: {
      // mounding / spreading shrubs and wildflowers: a dome of leaves on a few stems
      const flat = form === "spreading" ? 0.5 : 1;
      for (let b = 0; b < 7; b++) {
        const ang = (b / 7) * Math.PI * 2 + r();
        rods.push({ a: v(0, 0, 0), b: v(Math.cos(ang) * 0.3, 0.6 * flat, Math.sin(ang) * 0.3), r: 0.014 });
      }
      for (let i = 0; i < MAX_LEAVES; i++) {
        const u = r() * Math.PI * 2, w = Math.acos(r()); // upper hemisphere
        const n = v(Math.sin(w) * Math.cos(u), Math.cos(w), Math.sin(w) * Math.sin(u));
        const rad = 0.7 + r() * 0.3;
        push(leaves, v(n.x * 0.5 * rad, n.y * 0.95 * flat * rad + 0.04, n.z * 0.5 * rad), n.clone(), 1);
      }
      for (let i = 0; i < MAX_BLOOMS; i++) {
        const u = r() * Math.PI * 2, w = Math.acos(0.25 + r() * 0.75);
        const n = v(Math.sin(w) * Math.cos(u), Math.cos(w), Math.sin(w) * Math.sin(u));
        push(tips, v(n.x * 0.52, n.y * 0.98 * flat + 0.05, n.z * 0.52), n, 1);
      }
    }
  }
  // Palms: the crown sits on top of the trunk and its shape scales with spread, not trunk height.
  return { leaves: leaves.slice(0, MAX_LEAVES), tips: tips.slice(0, MAX_BLOOMS), rods, crown: form === "palm" ? 0.62 : null };
}

/** Leaf quad: 2 triangles, pointed at both ends, lying in XZ with +Z as its length. */
function leafGeometry(form: Plant["form"]) {
  const g = new THREE.BufferGeometry();
  const long = form === "grass" ? 3.2 : form === "palm" || form === "fern" ? 2.4 : 1.6;
  const pos = new Float32Array([0, 0, 0, 0.32, 0, long * 0.45, 0, 0, long, -0.32, 0, long * 0.45]);
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.computeVertexNormals();
  return g;
}

/** Height of a unit-layout point. Palm crowns sit on the trunk top and keep their shape scaled by spread. */
const yAt = (y: number, crown: number | null, h: number, s: number) => (crown == null ? y * h : crown * h + (y - crown) * s);

function Plant3D({ plant, heightFt, spreadFt, stage }: { plant: Plant; heightFt: number; spreadFt: number; stage: Stage }) {
  const invalidate = useThree((s) => s.invalidate);
  const lay = useMemo(() => layout(plant.form, hash(plant.id)), [plant.form, plant.id]);
  const leafGeo = useMemo(() => leafGeometry(plant.form), [plant.form]);
  const bloomGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
  const leaves = useRef<THREE.InstancedMesh>(null);
  const blooms = useRef<THREE.InstancedMesh>(null);

  const matureH = Math.max(plant.mature_height_ft[1], 1);
  const matureS = Math.max(plant.mature_spread_ft[1], 1);
  // How "full" the plant is: shows more leaves as it grows (min 18% so seedlings still read as plants).
  const fill = Math.min(1, Math.max(0.18, (heightFt / matureH) * 0.5 + (spreadFt / matureS) * 0.5));
  // Leaf size tracks plant size so big canopies still read as full (a 27 ft oak needs ~2 ft "leaf clusters").
  const big = plant.form === "tree" || plant.form === "palm";
  const leafSize = Math.max(0.12, Math.min(big ? 3 : 0.6, Math.sqrt(heightFt * spreadFt) * (big ? 0.075 : 0.09)));

  useLayoutEffect(() => {
    const m = leaves.current;
    if (!m) return;
    const o = new THREE.Object3D();
    const base = new THREE.Color(plant.foliage_color);
    const c = new THREE.Color();
    const count = Math.max(24, Math.round(lay.leaves.length * fill));
    const r = rng(hash(plant.id) + 1);
    for (let i = 0; i < count; i++) {
      const L = lay.leaves[Math.floor((i / count) * lay.leaves.length)];
      o.position.set(L.p.x * spreadFt, yAt(L.p.y, lay.crown, heightFt, spreadFt), L.p.z * spreadFt);
      o.lookAt(o.position.clone().add(L.n));
      o.rotateZ((L.tilt ?? 0) + r() * Math.PI);
      o.rotateX(-0.6 + r() * 0.4);
      o.scale.setScalar(leafSize * L.s * (0.75 + r() * 0.5));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      c.copy(base).offsetHSL((r() - 0.5) * 0.03, (r() - 0.5) * 0.1, (r() - 0.5) * 0.12);
      m.setColorAt(i, c);
    }
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [lay, heightFt, spreadFt, fill, leafSize, plant.foliage_color, plant.id, invalidate]);

  const accent = useMemo(
    () => (stage === "flowers" ? plant.flower_colors : stage === "fruit" ? plant.fruit_colors : stage === "buds" ? [{ name: "bud", hex: BUD }] : []),
    [stage, plant.flower_colors, plant.fruit_colors],
  );
  useLayoutEffect(() => {
    const m = blooms.current;
    if (!m) return;
    if (!accent.length || !lay.tips.length) { m.count = 0; invalidate(); return; }
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    const r = rng(hash(plant.id) + 2);
    const count = Math.max(6, Math.round(lay.tips.length * fill * (stage === "fruit" ? 0.6 : 0.85)));
    const size = stage === "buds" ? 0.35 : stage === "fruit" ? 0.4 : 0.6;
    for (let i = 0; i < count; i++) {
      const t = lay.tips[i];
      o.position.set(t.p.x * spreadFt, yAt(t.p.y, lay.crown, heightFt, spreadFt), t.p.z * spreadFt);
      o.rotation.set(r() * 3, r() * 3, r() * 3);
      o.scale.setScalar(leafSize * size * t.s * (0.8 + r() * 0.4));
      if (stage === "flowers") o.scale.y *= 0.55; // flattened disks read as open flowers
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
      m.setColorAt(i, c.set(accent[i % accent.length].hex));
    }
    m.count = count;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    invalidate();
  }, [lay, heightFt, spreadFt, fill, leafSize, stage, accent, plant.id, invalidate]);

  const stemColor = plant.form === "palm" || plant.form === "tree" ? "#7a5a3a" : "#5d7a3a";
  return (
    <group>
      {lay.rods.map((rd, i) => {
        const a = new THREE.Vector3(rd.a.x * spreadFt, rd.a.y * heightFt, rd.a.z * spreadFt);
        const b = new THREE.Vector3(rd.b.x * spreadFt, rd.b.y * heightFt, rd.b.z * spreadFt);
        const len = a.distanceTo(b);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        const rad = Math.max(0.03, rd.r * Math.max(heightFt, spreadFt) * (plant.form === "palm" ? 1.3 : 1));
        return (
          <mesh key={i} position={mid} quaternion={q}>
            <cylinderGeometry args={[rad * 0.7, rad, len, 7, 1]} />
            <meshStandardMaterial color={stemColor} roughness={0.9} />
          </mesh>
        );
      })}
      <instancedMesh ref={leaves} args={[leafGeo, undefined, MAX_LEAVES]} frustumCulled={false}>
        <meshStandardMaterial side={THREE.DoubleSide} roughness={0.75} />
      </instancedMesh>
      <instancedMesh ref={blooms} args={[bloomGeo, undefined, MAX_BLOOMS]} frustumCulled={false}>
        <meshStandardMaterial roughness={0.55} flatShading />
      </instancedMesh>
    </group>
  );
}

const STAKE_FT = 6;
const frameSize = (h: number, s: number) => Math.max(h, s * 0.8, 2.5);

/**
 * Keeps the plant filling the view as it grows: eases the camera distance and orbit target toward the current size.
 * The fixed 6 ft stake beside the plant keeps growth readable while the camera zooms out.
 */
function CameraRig({ size }: { size: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [size, invalidate]);
  useFrame((state, dt) => {
    const c = state.controls as unknown as { target: THREE.Vector3; update: () => void; minDistance: number; maxDistance: number } | null;
    if (!c) return;
    const camera = state.camera;
    const F = size;
    const k = 1 - Math.exp(-dt * 6);
    const off = camera.position.clone().sub(c.target);
    const dist = off.length();
    const goalDist = F * 2.1;
    const goalY = F * 0.42;
    const nd = dist + (goalDist - dist) * k;
    c.target.y += (goalY - c.target.y) * k;
    camera.position.copy(c.target).add(off.setLength(nd));
    c.minDistance = F * 0.8;
    c.maxDistance = F * 5;
    c.update();
    if (Math.abs(goalDist - nd) > F * 0.002 || Math.abs(goalY - c.target.y) > F * 0.002) state.invalidate();
  });
  return null;
}

function Stake({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0]}>
      <mesh position-y={STAKE_FT / 2}>
        <cylinderGeometry args={[0.06, 0.06, STAKE_FT, 6, 1]} />
        <meshStandardMaterial color="#b08850" roughness={0.9} />
      </mesh>
      {[1, 2, 3, 4, 5, 6].map((ft) => (
        <mesh key={ft} position-y={ft - 0.04}>
          <cylinderGeometry args={[0.075, 0.075, 0.08, 6, 1]} />
          <meshStandardMaterial color={ft % 3 === 0 ? "#c0392b" : "#f4f2ea"} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

export default function PlantScene({ plant, heightFt, spreadFt, stage }: { plant: Plant; heightFt: number; spreadFt: number; stage: Stage }) {
  const M = Math.max(plant.mature_height_ft[1], plant.mature_spread_ft[1], STAKE_FT);
  const F = frameSize(heightFt, spreadFt);
  return (
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [F * 1.1, F * 1.0, F * 1.6], fov: 40, near: 0.05, far: M * 30 }}
      gl={{ antialias: true, powerPreference: "low-power" }} aria-label={`3D model of ${plant.common_name}, about ${heightFt.toFixed(1)} ft tall, next to a 6 ft stake`}>
      <color attach="background" args={["#e8f1f4"]} />
      <hemisphereLight args={["#ffffff", "#c9b98f", 1.4]} />
      <directionalLight position={[M, M * 2, M]} intensity={1.6} />
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <circleGeometry args={[M * 2.5, 48]} />
        <meshStandardMaterial color="#e7dcc0" roughness={1} />
      </mesh>
      <Plant3D plant={plant} heightFt={heightFt} spreadFt={spreadFt} stage={stage} />
      <Stake x={spreadFt / 2 + Math.max(0.8, spreadFt * 0.15)} />
      <OrbitControls makeDefault target={[0, F * 0.42, 0]} enablePan={false} maxPolarAngle={Math.PI / 2.05} />
      <CameraRig size={F} />
    </Canvas>
  );
}
