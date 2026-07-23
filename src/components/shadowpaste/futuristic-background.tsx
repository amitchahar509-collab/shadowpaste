"use client"
import { useEffect, useRef } from "react"

// Immersive OS backdrop: matte-black base + volumetric aurora + blueprint grid
// + drifting particle field with light mouse parallax. GPU-friendly, capped
// devicePixelRatio, and fully disabled under prefers-reduced-motion.
//
// Purely decorative (aria-hidden, pointer-events: none) — sits behind all
// content and never intercepts input.
export function FuturisticBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const parallaxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let w = 0, h = 0
    let raf = 0
    const mouse = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 }

    type P = { x: number; y: number; z: number; vx: number; vy: number; r: number }
    let particles: P[] = []

    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(90, Math.floor((w * h) / 22000))
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: Math.random() * 0.8 + 0.2,
        vx: (Math.random() - 0.5) * 0.14,
        vy: (Math.random() - 0.5) * 0.14,
        r: Math.random() * 1.4 + 0.4,
      }))
    }

    const onMove = (e: MouseEvent) => {
      mouse.tx = e.clientX / window.innerWidth
      mouse.ty = e.clientY / window.innerHeight
    }

    const LINK = 130
    const draw = () => {
      mouse.x += (mouse.tx - mouse.x) * 0.05
      mouse.y += (mouse.ty - mouse.y) * 0.05
      const px = (mouse.x - 0.5) * 26
      const py = (mouse.y - 0.5) * 26
      if (parallaxRef.current) parallaxRef.current.style.transform = `translate3d(${px * 0.6}px, ${py * 0.6}px, 0)`

      ctx.clearRect(0, 0, w, h)

      for (const p of particles) {
        p.x += p.vx * p.z
        p.y += p.vy * p.z
        if (p.x < -20) p.x = w + 20
        if (p.x > w + 20) p.x = -20
        if (p.y < -20) p.y = h + 20
        if (p.y > h + 20) p.y = -20
      }
      // links
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i]
        const ax = a.x + px * a.z, ay = a.y + py * a.z
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j]
          const bx = b.x + px * b.z, by = b.y + py * b.z
          const d = Math.hypot(ax - bx, ay - by)
          if (d < LINK) {
            ctx.strokeStyle = `rgba(59,109,255,${(1 - d / LINK) * 0.14})`
            ctx.lineWidth = 0.6
            ctx.beginPath()
            ctx.moveTo(ax, ay)
            ctx.lineTo(bx, by)
            ctx.stroke()
          }
        }
      }
      // nodes
      for (const p of particles) {
        const x = p.x + px * p.z, y = p.y + py * p.z
        ctx.beginPath()
        ctx.arc(x, y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(122,165,255,${0.25 + p.z * 0.4})`
        ctx.fill()
      }
      raf = requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener("resize", resize)
    if (!reduce) {
      window.addEventListener("mousemove", onMove)
      raf = requestAnimationFrame(draw)
    } else {
      // one static frame
      draw()
      cancelAnimationFrame(raf)
    }
    return () => {
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", onMove)
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Aurora / volumetric light */}
      <div ref={parallaxRef} className="absolute inset-0">
        <div className="sp-aurora absolute -top-40 right-[-10%] h-[60vh] w-[60vh] rounded-full opacity-60 blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(59,109,255,0.5), transparent 65%)" }} />
        <div className="sp-aurora absolute bottom-[-20%] left-[-5%] h-[55vh] w-[55vh] rounded-full opacity-40 blur-[130px]"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.35), transparent 65%)", animationDelay: "-8s" }} />
        <div className="sp-aurora absolute top-[30%] left-[40%] h-[40vh] w-[40vh] rounded-full opacity-30 blur-[120px]"
          style={{ background: "radial-gradient(circle, rgba(56,189,248,0.3), transparent 65%)", animationDelay: "-14s" }} />
      </div>
      {/* Blueprint grid */}
      <div className="grid-bg absolute inset-0 opacity-70" />
      {/* Particle network */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {/* Vignette + scan-line sheen */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(120% 120% at 50% 0%, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "repeating-linear-gradient(0deg, #fff 0, #fff 1px, transparent 1px, transparent 3px)" }} />
    </div>
  )
}
