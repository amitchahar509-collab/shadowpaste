"use client"
import { useMemo, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import * as THREE from "three"

// Agent Map — 3D network graph showing AI agents → ShadowPaste Core → Tools.
// Animated pulses represent: green=allowed request, amber=permission ask, red=blocked attack.

interface MapNode {
  id: string
  label: string
  position: [number, number, number]
  color: string
  size: number
  type: "agent" | "core" | "tool"
}

interface MapEdge {
  from: string
  to: string
}

const NODES: MapNode[] = [
  // Core
  { id: "core", label: "ShadowPaste", position: [0, 0, 0], color: "#3b6dff", size: 1.6, type: "core" },
  // Agents (left side)
  { id: "claude", label: "Claude", position: [-8, 3, 2], color: "#d97706", size: 0.9, type: "agent" },
  { id: "gpt", label: "GPT-4o", position: [-9, 0, -1], color: "#3b6dff", size: 0.9, type: "agent" },
  { id: "cursor", label: "Cursor", position: [-8, -3, 2], color: "#0ea5e9", size: 0.9, type: "agent" },
  { id: "gemini", label: "Gemini", position: [-7, -1, -3], color: "#8b5cf6", size: 0.9, type: "agent" },
  // Tools (right side)
  { id: "github", label: "GitHub", position: [8, 3, 2], color: "#f59e0b", size: 0.9, type: "tool" },
  { id: "db", label: "Database", position: [9, 0, -1], color: "#38bdf8", size: 0.9, type: "tool" },
  { id: "stripe", label: "Stripe", position: [8, -3, 2], color: "#8b5cf6", size: 0.9, type: "tool" },
  { id: "fs", label: "Filesystem", position: [7, -1, -3], color: "#3b6dff", size: 0.9, type: "tool" },
]

const EDGES: MapEdge[] = [
  { from: "claude", to: "core" }, { from: "gpt", to: "core" }, { from: "cursor", to: "core" }, { from: "gemini", to: "core" },
  { from: "core", to: "github" }, { from: "core", to: "db" }, { from: "core", to: "stripe" }, { from: "core", to: "fs" },
]

function NodeSphere({ node }: { node: MapNode }) {
  const ref = useRef<THREE.Mesh>(null!)
  useFrame((state) => {
    if (ref.current) {
      const t = state.clock.elapsedTime
      ref.current.position.y = node.position[1] + Math.sin(t * 1.5 + node.position[0]) * 0.08
      const pulse = node.type === "core" ? 1 + Math.sin(t * 3) * 0.08 : 1 + Math.sin(t * 2 + node.position[0]) * 0.05
      ref.current.scale.setScalar(pulse)
    }
  })
  return (
    <group position={node.position}>
      <mesh ref={ref}>
        <sphereGeometry args={[node.size, 24, 24]} />
        <meshBasicMaterial color={node.color} transparent opacity={0.9} />
      </mesh>
      {/* Glow halo */}
      <mesh scale={1.8}>
        <sphereGeometry args={[node.size, 16, 16]} />
        <meshBasicMaterial color={node.color} transparent opacity={0.08} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

function EdgeLine({ from, to, pulseType }: { from: [number, number, number]; to: [number, number, number]; pulseType: number }) {
  const pulseRef = useRef<THREE.Mesh>(null!)
  const tRef = useRef(Math.random())
  useFrame(() => {
    tRef.current += 0.006 + Math.random() * 0.003
    if (tRef.current >= 1) {
      tRef.current = 0
      // Randomly reassign pulse type: 0=allowed(green), 1=ask(amber), 2=blocked(red)
      pulseType = Math.floor(Math.random() * 10)
    }
    if (pulseRef.current) {
      const t = tRef.current
      pulseRef.current.position.set(
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
      )
      const colors = ["#3b6dff", "#f59e0b", "#ef4444"]
      const c = new THREE.Color(colors[pulseType % 3])
      ;(pulseRef.current.material as THREE.MeshBasicMaterial).color = c
    }
  })
  return (
    <>
      <line>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[new Float32Array([...from, ...to]), 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#3b6dff" transparent opacity={0.15} />
      </line>
      <mesh ref={pulseRef}>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshBasicMaterial color="#3b6dff" transparent opacity={0.9} blending={THREE.AdditiveBlending} />
      </mesh>
    </>
  )
}

function Scene() {
  const group = useRef<THREE.Group>(null!)
  useFrame((state) => {
    if (group.current) {
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.15) * 0.15
    }
  })
  const nodeMap = useMemo(() => Object.fromEntries(NODES.map((n) => [n.id, n])), [])
  return (
    <group ref={group}>
      {NODES.map((n) => <NodeSphere key={n.id} node={n} />)}
      {EDGES.map((e, i) => (
        <EdgeLine key={i} from={nodeMap[e.from].position} to={nodeMap[e.to].position} pulseType={i % 3} />
      ))}
    </group>
  )
}

export default function AgentMap3D() {
  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 0, 14], fov: 55 }}
      style={{ width: "100%", height: "100%" }}
    >
      <Scene />
    </Canvas>
  )
}
