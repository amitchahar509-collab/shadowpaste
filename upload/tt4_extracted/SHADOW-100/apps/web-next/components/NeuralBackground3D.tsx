// NeuralBackground3D — React Three Fiber port of the verified vanilla WebGL
// neural mesh in ../../../index.html (NeuralCommandCenter IIFE).
//
// STATUS: real code, NOT built/run in the authoring environment (no Node here).
// The vanilla version IS verified running at index.html. This file mirrors it so a
// Vite + R3F app can adopt the same visuals. Install:
//   npm i three @react-three/fiber @react-three/drei framer-motion
//
// Palette matches the neuron-reconstruction identity: blue base → red/orange core →
// amber highlights on near-black, with energy pulses travelling along branches.

import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

function palette(t: number): [number, number, number] {
  const u = Math.min(1, Math.max(0, t + (Math.random() - 0.5) * 0.12));
  if (u < 0.42) { const k = u / 0.42; return [0.36 + k * 0.5, 0.42 + k * 0.1, 0.9 - k * 0.5]; }
  const k = (u - 0.42) / 0.58; return [0.86 + k * 0.14, 0.28 + k * 0.55, 0.4 - k * 0.28];
}

function useNeuralData(N = 1400) {
  return useMemo(() => {
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), pts: number[][] = [];
    for (let i = 0; i < N; i++) {
      const y = (Math.pow(Math.random(), 0.7) * 2 - 1) * 16;
      const radius = Math.pow(Math.random(), 1.6) * (5 + (1 - Math.abs(y) / 18) * 9);
      const a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * radius + (Math.random() - 0.5) * 3;
      const z = Math.sin(a) * radius * 0.7 + (Math.random() - 0.5) * 3;
      pos.set([x, y, z], i * 3); col.set(palette((y + 16) / 32), i * 3); pts.push([x, y, z]);
    }
    const lp: number[] = [], lc: number[] = [], eA: number[] = [], eB: number[] = [];
    for (let i = 0; i < N; i++) {
      const pi = pts[i]; let best: number[] = [], bd = [Infinity, Infinity];
      for (let s = 0; s < 26; s++) {
        const j = (Math.random() * N) | 0; if (j === i) continue; const pj = pts[j];
        const d = (pi[0]-pj[0])**2 + (pi[1]-pj[1])**2 + (pi[2]-pj[2])**2;
        if (d < bd[0]) { bd[1]=bd[0]; best[1]=best[0]; bd[0]=d; best[0]=j; } else if (d < bd[1]) { bd[1]=d; best[1]=j; }
      }
      for (const j of best) { if (j == null) continue; const pj = pts[j];
        eA.push(i); eB.push(j); lp.push(...pi, ...pj);
        lc.push(...palette((pi[1]+16)/32).map(v=>v*0.7), ...palette((pj[1]+16)/32).map(v=>v*0.7)); }
    }
    return { pos, col, pts, lp: new Float32Array(lp), lc: new Float32Array(lc), eA, eB };
  }, [N]);
}

function NeuralMesh() {
  const g = useRef<THREE.Group>(null!);
  const d = useNeuralData();
  const pulses = useRef(Array.from({ length: 150 }, () => ({ e: (Math.random() * d.eA.length) | 0, t: Math.random(), sp: 0.004 + Math.random() * 0.012 })));
  const pulsePos = useMemo(() => new Float32Array(150 * 3), []);
  const pulseRef = useRef<THREE.BufferAttribute>(null!);
  const { pointer } = useThree();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    g.current.rotation.y = Math.sin(t * 0.06) * 0.35 + pointer.x * 0.6;
    g.current.rotation.x = Math.cos(t * 0.05) * 0.12 + pointer.y * 0.4;
    g.current.scale.setScalar(1 + Math.sin(t * 0.5) * 0.03);
    for (let i = 0; i < pulses.current.length; i++) {
      const p = pulses.current[i]; p.t += p.sp;
      if (p.t >= 1) { p.t = 0; p.e = (Math.random() * d.eA.length) | 0; }
      const a = d.pts[d.eA[p.e]], b = d.pts[d.eB[p.e]];
      pulsePos.set([a[0]+(b[0]-a[0])*p.t, a[1]+(b[1]-a[1])*p.t, a[2]+(b[2]-a[2])*p.t], i * 3);
    }
    if (pulseRef.current) pulseRef.current.needsUpdate = true;
  });

  return (
    <group ref={g}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[d.lp, 3]} />
          <bufferAttribute attach="attributes-color" args={[d.lc, 3]} />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent opacity={0.34} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[d.pos, 3]} />
          <bufferAttribute attach="attributes-color" args={[d.col, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.6} vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
      </points>
      <points>
        <bufferGeometry>
          <bufferAttribute ref={pulseRef} attach="attributes-position" args={[pulsePos, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.9} color="#bfe0ff" transparent blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
      </points>
    </group>
  );
}

export default function NeuralBackground3D() {
  return (
    <Canvas
      className="neural-bg"
      dpr={[1, 1.6]}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 0, 26], fov: 60 }}
      style={{ position: 'absolute', inset: 0, zIndex: 0 }}
    >
      <NeuralMesh />
    </Canvas>
  );
}
