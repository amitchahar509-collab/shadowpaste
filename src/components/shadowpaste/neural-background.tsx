"use client"
import { useMemo, useRef } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

// ShadowPaste — Living AI Security Intelligence Core
// A vast mosaic of interconnected points — "countless souls with electric wings"
// Central glowing core + neural network + color-coded pulses (blue=safe, white=trust, red=blocked)

function palette(t: number): [number, number, number] {
  // Emerald (0.0) → sky (0.3) → white (0.5) → amber (0.7) → red (1.0)
  const u = Math.min(1, Math.max(0, t))
  if (u < 0.3) { const k = u / 0.3; return [0.0 + k * 0.06, 0.72 + k * 0.18, 0.52 + k * 0.42] }
  if (u < 0.5) { const k = (u - 0.3) / 0.2; return [0.06 + k * 0.9, 0.9 + k * 0.1, 0.94 + k * 0.06] }
  if (u < 0.7) { const k = (u - 0.5) / 0.2; return [0.96 - k * 0.1, 1.0 - k * 0.4, 1.0 - k * 0.7] }
  const k = (u - 0.7) / 0.3; return [0.86 + k * 0.14, 0.6 - k * 0.5, 0.3 - k * 0.25]
}

function useNeuralData(N = 1500) {
  return useMemo(() => {
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), pts: number[][] = []
    for (let i = 0; i < N; i++) {
      // Spherical distribution with denser core
      const r = Math.pow(Math.random(), 0.5) * 14 + 1
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const x = r * Math.sin(phi) * Math.cos(theta)
      const y = r * Math.sin(phi) * Math.sin(theta) * 0.7
      const z = r * Math.cos(phi)
      pos.set([x, y, z], i * 3)
      col.set(palette(r / 15), i * 3)
      pts.push([x, y, z])
    }
    // Build connections (each node connects to 2-3 nearest)
    const lp: number[] = [], lc: number[] = [], eA: number[] = [], eB: number[] = []
    for (let i = 0; i < N; i++) {
      const pi = pts[i]; let best: number[] = [], bd = [Infinity, Infinity, Infinity]
      for (let s = 0; s < 30; s++) {
        const j = (Math.random() * N) | 0; if (j === i) continue
        const pj = pts[j]
        const d = (pi[0]-pj[0])**2 + (pi[1]-pj[1])**2 + (pi[2]-pj[2])**2
        if (d < bd[0]) { bd[2]=bd[1]; best[2]=best[1]; bd[1]=bd[0]; best[1]=best[0]; bd[0]=d; best[0]=j }
        else if (d < bd[1]) { bd[2]=bd[1]; best[2]=best[1]; bd[1]=d; best[1]=j }
        else if (d < bd[2]) { bd[2]=d; best[2]=j }
      }
      for (const j of best) {
        if (j == null) continue
        const pj = pts[j]
        eA.push(i); eB.push(j)
        lp.push(...pi, ...pj)
        lc.push(...palette(Math.abs(pi[0])/15).map(v=>v*0.5), ...palette(Math.abs(pj[0])/15).map(v=>v*0.5))
      }
    }
    return { pos, col, pts, lp: new Float32Array(lp), lc: new Float32Array(lc), eA, eB }
  }, [N])
}

function CentralCore() {
  const coreRef = useRef<THREE.Mesh>(null!)
  const glowRef = useRef<THREE.Mesh>(null!)
  const ringRef = useRef<THREE.Mesh>(null!)
  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (coreRef.current) {
      const breath = 1 + Math.sin(t * 0.8) * 0.08
      coreRef.current.scale.setScalar(breath)
      coreRef.current.rotation.y = t * 0.2
      coreRef.current.rotation.x = Math.sin(t * 0.3) * 0.2
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(1 + Math.sin(t * 1.2) * 0.15)
      glowRef.current.rotation.z = t * 0.1
    }
    if (ringRef.current) {
      ringRef.current.rotation.x = Math.PI / 2 + Math.sin(t * 0.4) * 0.1
      ringRef.current.rotation.z = t * 0.15
    }
  })
  return (
    <group>
      {/* Inner core */}
      <mesh ref={coreRef}>
        <icosahedronGeometry args={[1.2, 2]} />
        <meshBasicMaterial color="#3b6dff" transparent opacity={0.9} wireframe />
      </mesh>
      {/* Solid core glow */}
      <mesh scale={0.8}>
        <sphereGeometry args={[1.2, 24, 24]} />
        <meshBasicMaterial color="#3b6dff" transparent opacity={0.15} />
      </mesh>
      {/* Outer glow halo */}
      <mesh ref={glowRef} scale={2.5}>
        <sphereGeometry args={[1.2, 16, 16]} />
        <meshBasicMaterial color="#3b6dff" transparent opacity={0.04} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Rotating ring */}
      <mesh ref={ringRef} scale={3}>
        <torusGeometry args={[1, 0.02, 8, 64]} />
        <meshBasicMaterial color="#6ee7b7" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

function NeuralMesh() {
  const g = useRef<THREE.Group>(null!)
  const d = useNeuralData(1500)
  // Color-coded pulses: 0=blue(safe), 1=white(trust), 2=red(blocked)
  const pulses = useRef(Array.from({ length: 180 }, () => ({
    e: (Math.random() * d.eA.length) | 0,
    t: Math.random(),
    sp: 0.003 + Math.random() * 0.015,
    type: Math.random() < 0.6 ? 0 : Math.random() < 0.85 ? 1 : 2,
  })))
  const pulsePos = useMemo(() => new Float32Array(180 * 3), [])
  const pulseCol = useMemo(() => new Float32Array(180 * 3), [])
  const pulseRef = useRef<THREE.BufferAttribute>(null!)
  const pulseColRef = useRef<THREE.BufferAttribute>(null!)
  const { pointer } = useThree()

  useFrame((state) => {
    const t = state.clock.elapsedTime
    // Slow breathing rotation + pointer interaction
    g.current.rotation.y = Math.sin(t * 0.04) * 0.3 + pointer.x * 0.4
    g.current.rotation.x = Math.cos(t * 0.03) * 0.1 + pointer.y * 0.3
    const breath = 1 + Math.sin(t * 0.6) * 0.04
    g.current.scale.setScalar(breath)

    for (let i = 0; i < pulses.current.length; i++) {
      const p = pulses.current[i]
      p.t += p.sp
      if (p.t >= 1) {
        p.t = 0
        p.e = (Math.random() * d.eA.length) | 0
        p.type = Math.random() < 0.6 ? 0 : Math.random() < 0.85 ? 1 : 2
      }
      const a = d.pts[d.eA[p.e]], b = d.pts[d.eB[p.e]]
      pulsePos.set([a[0]+(b[0]-a[0])*p.t, a[1]+(b[1]-a[1])*p.t, a[2]+(b[2]-a[2])*p.t], i * 3)
      // Color by type: blue=safe, white=trust, red=blocked
      const c = p.type === 0 ? [0.1, 0.8, 0.5] : p.type === 1 ? [0.9, 0.95, 1.0] : [1.0, 0.2, 0.1]
      pulseCol.set(c, i * 3)
    }
    if (pulseRef.current) pulseRef.current.needsUpdate = true
    if (pulseColRef.current) pulseColRef.current.needsUpdate = true
  })

  return (
    <group ref={g}>
      {/* Connection lines — trust paths */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[d.lp, 3]} />
          <bufferAttribute attach="attributes-color" args={[d.lc, 3]} />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      {/* Node particles — neural points */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[d.pos, 3]} />
          <bufferAttribute attach="attributes-color" args={[d.col, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.5} vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
      </points>
      {/* Energy pulses — safe (blue), trust (white), blocked (red) */}
      <points>
        <bufferGeometry>
          <bufferAttribute ref={pulseRef} attach="attributes-position" args={[pulsePos, 3]} />
          <bufferAttribute ref={pulseColRef} attach="attributes-color" args={[pulseCol, 3]} />
        </bufferGeometry>
        <pointsMaterial size={1.0} vertexColors transparent blending={THREE.AdditiveBlending} depthWrite={false} sizeAttenuation />
      </points>
    </group>
  )
}

export default function NeuralBackground3D() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 28], fov: 55 }}
      style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}
    >
      <NeuralMesh />
      <CentralCore />
    </Canvas>
  )
}
