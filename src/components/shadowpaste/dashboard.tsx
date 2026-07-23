"use client"
import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { motion } from "framer-motion"
import { Progress } from "@/components/ui/progress"
import { api, DecisionBadge, RiskBadge, timeAgo, ScoreRing } from "./shared"
import {
  Bot, Network, ShieldCheck, Bug, Activity, TrendingUp, ArrowRight, ArrowUpRight,
  Lock, Radio, Boxes, Github, Store, Globe, Gauge, Database, KeyRound, Server, Sparkles,
} from "lucide-react"

// 3D agent map — loaded dynamically (client-only)
const AgentMap3D = dynamic(() => import("./agent-map"), { ssr: false })

// Animated count-up for premium stat reveals. Respects reduced-motion.
function useCountUp(target: number, duration = 900): number {
  const [n, setN] = useState(0)
  const ref = useRef(0)
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(target); return }
    const start = performance.now(); const from = ref.current
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      const val = Math.round(from + (target - from) * eased)
      setN(val); ref.current = val
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return n
}

const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } } }
const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } } }

interface DashboardData {
  counts: { agents: number; tools: number; packages: number; projects: number; toolCalls: number; attacks: number; publicScans: number; sandboxChanges: number; vaultEntries: number; toolExecutions: number }
  calls: { allowed: number; denied: number; sandboxed: number; pending: number }
  agents: { active: number; quarantined: number; avgTrust: number }
  attacks: { blocked: number; allowed: number }
  recentCalls: Array<{ id: string; agent: string; provider: string; tool: string; decision: string; riskLevel: "low" | "medium" | "high" | "critical"; riskScore: number; time: string }>
}

export function Dashboard({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const load = () => api<DashboardData>("/api/dashboard").then((d) => { if (mounted) { setData(d); setLoading(false) } }).catch(() => setLoading(false))
    load()
    const t = setInterval(load, 5000)
    return () => { mounted = false; clearInterval(t) }
  }, [])

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="sp-skeleton h-52 rounded-[26px] border border-white/5" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="sp-skeleton h-32 rounded-xl border border-white/5" />)}
        </div>
        <div className="sp-skeleton h-72 rounded-2xl border border-white/5" />
      </div>
    )
  }

  const callTotal = data.calls.allowed + data.calls.denied + data.calls.sandboxed + data.calls.pending
  const blockRate = callTotal ? Math.round(((data.calls.denied + data.calls.sandboxed) / callTotal) * 100) : 0

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-6">
      {/* Cinematic hero */}
      <motion.section variants={rise} className="relative overflow-hidden rounded-[26px] border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-transparent p-8 backdrop-blur-xl lg:p-12">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" />
        <div className="pointer-events-none absolute -right-10 -top-24 h-[420px] w-[420px] rounded-full opacity-60 blur-[120px]" style={{ background: "radial-gradient(circle, rgba(59,109,255,0.45), transparent 65%)" }} />
        <div className="scan-line pointer-events-none absolute inset-0 rounded-[26px]" />
        <div className="relative flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-5 flex items-center gap-2.5 text-blue-300/90">
              <span className="h-px w-8 bg-gradient-to-r from-transparent to-blue-400" />
              <span className="label-thin">Here and Now / AI Security OS</span>
            </div>
            <h1 className="text-5xl font-extralight leading-[0.95] tracking-tight text-white lg:text-7xl">
              <span className="text-gradient">The security layer</span>
              <br />
              <span className="font-light">for the <span className="relative inline-block"><span className="relative z-10 text-white">AI era</span><span className="absolute -bottom-1 left-0 h-3 w-full bg-blue-600/40 blur-[2px]" /></span>.</span>
            </h1>
            <p className="mt-6 max-w-xl text-sm font-light leading-relaxed text-zinc-400 lg:text-[15px]">
              Every tool call from Claude, ChatGPT, or Cursor passes through ShadowPaste &mdash; risk-scored, policy-gated, audit-recorded, sandbox-default.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button onClick={() => onNavigate("gateway")} className="glow-hover group inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-medium text-white shadow-[0_10px_40px_-10px_rgba(59,109,255,0.8)]">
                Enter the Gateway
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>
              <button onClick={() => onNavigate("workspace")} className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] px-6 py-3 text-sm font-light text-zinc-200 backdrop-blur transition-colors hover:border-blue-500/40 hover:text-white">
                <Sparkles className="h-4 w-4 text-blue-400" /> Protect a project
              </button>
            </div>
          </div>
          {/* Hero object — trust core */}
          <div className="relative flex shrink-0 items-center justify-center">
            <div className="relative flex h-56 w-56 items-center justify-center rounded-full border border-white/10 bg-[#070a12]/60 backdrop-blur-xl">
              <div className="absolute inset-3 rounded-full border border-blue-500/20" />
              <div className="absolute inset-6 rounded-full border border-blue-500/10" />
              <ScoreRing score={data.agents.avgTrust} size={150} />
            </div>
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/60 px-4 py-1 text-[11px] backdrop-blur">
              <span className="text-blue-400">{data.agents.active} active</span>
              <span className="mx-2 text-zinc-600">/</span>
              <span className="text-amber-400">{data.agents.quarantined} quarantined</span>
            </div>
          </div>
        </div>
      </motion.section>

      {/* KPI stat tiles */}
      <motion.div variants={rise} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Bot} label="AI Agents" value={data.counts.agents} sub={`${data.agents.active} active`} accent="blue" onClick={() => onNavigate("agents")} />
        <KpiCard icon={Network} label="MCP Tools" value={data.counts.tools} sub={`${data.counts.packages} packages`} accent="sky" onClick={() => onNavigate("gateway")} />
        <KpiCard icon={ShieldCheck} label="Tool Calls Audited" value={data.counts.toolCalls} sub={`${data.calls.denied} denied`} accent="violet" onClick={() => onNavigate("recorder")} />
        <KpiCard icon={Bug} label="Attacks Blocked" value={data.attacks.blocked} sub={`${data.attacks.allowed} slipped`} accent="red" onClick={() => onNavigate("attacks")} />
      </motion.div>

      {/* Agent Map — 3D network visualization */}
      <motion.section variants={rise} className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.015] p-0 backdrop-blur-xl">
        <div className="absolute left-5 top-5 z-10">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-medium tracking-tight text-white">Agent Network Map</h3>
          </div>
          <p className="mt-0.5 label-thin text-zinc-500">Live agent / ShadowPaste / tool connections</p>
        </div>
        <div className="absolute right-5 top-5 z-10 flex gap-1.5">
          <LegendDot color="bg-blue-400" label="allowed" />
          <LegendDot color="bg-amber-400" label="ask" />
          <LegendDot color="bg-red-400" label="blocked" />
        </div>
        <div className="h-[340px] w-full">
          <AgentMap3D />
        </div>
      </motion.section>

      {/* System Security Posture */}
      <motion.div variants={rise}>
        <SystemPosture data={data} callTotal={callTotal} blockRate={blockRate} onNavigate={onNavigate} />
      </motion.div>

      {/* Live call feed + decision breakdown */}
      <motion.div variants={rise} className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-5 backdrop-blur-xl lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-medium tracking-tight text-white">Live Tool Call Feed</h3>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[10px] text-blue-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />LIVE
            </span>
          </div>
          <div className="space-y-1.5">
            {data.recentCalls.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-xs text-zinc-500">
                No calls yet. Open the <button onClick={() => onNavigate("gateway")} className="text-blue-400 hover:underline">MCP Gateway</button> to invoke a tool.
              </div>
            )}
            {data.recentCalls.map((c) => (
              <div key={c.id} className="group flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-blue-500/20 hover:bg-blue-500/[0.04]">
                <div className="font-mono text-[10px] text-zinc-500">{timeAgo(c.time)}</div>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate font-mono text-xs text-zinc-300">{c.agent}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-zinc-600" />
                  <span className="truncate font-mono text-xs text-blue-400">{c.tool}</span>
                </div>
                <RiskBadge level={c.riskLevel} score={c.riskScore} />
                <DecisionBadge decision={c.decision} />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.015] p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-medium tracking-tight text-white">Decision Breakdown</h3>
          </div>
          <div className="space-y-3.5">
            <DecisionBar label="Allowed" value={data.calls.allowed} total={callTotal} color="from-blue-500 to-sky-400" />
            <DecisionBar label="Denied" value={data.calls.denied} total={callTotal} color="from-red-500 to-rose-400" />
            <DecisionBar label="Sandboxed" value={data.calls.sandboxed} total={callTotal} color="from-violet-500 to-fuchsia-400" />
            <DecisionBar label="Pending" value={data.calls.pending} total={callTotal} color="from-amber-500 to-yellow-400" />
          </div>
          <div className="mt-5 border-t border-white/5 pt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">Block Rate</span>
              <span className="font-mono font-semibold text-red-400">{blockRate}%</span>
            </div>
            <Progress value={blockRate} className="mt-2 h-1.5 bg-white/5 [&>div]:bg-gradient-to-r [&>div]:from-amber-500 [&>div]:to-red-500" />
          </div>
        </section>
      </motion.div>

      {/* Module grid */}
      <motion.div variants={rise}>
        <div className="mb-3 flex items-center gap-2">
          <Lock className="h-4 w-4 text-blue-400" />
          <h3 className="text-sm font-medium tracking-tight text-white">Security OS Modules</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ModuleTile icon={Network} phase="P1" title="MCP Zero-Trust Gateway" desc="Claude / ChatGPT / Cursor connect through ShadowPaste." onClick={() => onNavigate("gateway")} />
          <ModuleTile icon={Bot} phase="P2" title="Agent Identity System" desc="Every AI agent gets an identity, trust score & history." onClick={() => onNavigate("agents")} />
          <ModuleTile icon={ShieldCheck} phase="P3" title="Permission Control Center" desc="Phone-style prompts: Allow once / Always / Deny." onClick={() => onNavigate("permissions")} />
          <ModuleTile icon={Lock} phase="P4" title="Zero-Trust Secret Vault" desc="AES-GCM-256 encrypted. Agents get capability tokens, never raw secrets." onClick={() => onNavigate("vault")} />
          <ModuleTile icon={Radio} phase="P4" title="AI Flight Recorder" desc="Black box timeline + replay of every agent action." onClick={() => onNavigate("recorder")} />
          <ModuleTile icon={Boxes} phase="P5" title="Shadow Sandbox" desc="AI changes land in a copy first. Human approve then merge." onClick={() => onNavigate("sandbox")} />
          <ModuleTile icon={Github} phase="P6" title="AI Safe GitHub" desc="One-click repo scan to AI Safety Report." onClick={() => onNavigate("github")} />
          <ModuleTile icon={Gauge} phase="P7" title="AI Trust Score" desc="Shareable 0-100 score per project." onClick={() => onNavigate("trust")} />
          <ModuleTile icon={Store} phase="P8" title="MCP Marketplace" desc="Safe MCP Store — every tool policy-gated." onClick={() => onNavigate("marketplace")} />
          <ModuleTile icon={Globe} phase="P10" title="Public Scanner" desc="Drop a GitHub URL for a free AI safety scan, no login." onClick={() => onNavigate("public")} />
          <ModuleTile icon={Bug} phase="P11" title="Red Team Lab" desc="Prompt injection, malicious MCP, stolen token, rogue agent." onClick={() => onNavigate("attacks")} />
        </div>
      </motion.div>
    </motion.div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] text-zinc-400">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />{label}
    </span>
  )
}

function KpiCard({ icon: Icon, label, value, sub, accent, onClick }: { icon: typeof Bot; label: string; value: number; sub: string; accent: "blue" | "sky" | "violet" | "red"; onClick?: () => void }) {
  const n = useCountUp(value)
  const colors: Record<string, { text: string; bg: string; ring: string }> = {
    blue: { text: "text-blue-400", bg: "bg-blue-500/10", ring: "group-hover:shadow-[0_0_30px_-8px_rgba(59,109,255,0.6)]" },
    sky: { text: "text-sky-400", bg: "bg-sky-500/10", ring: "group-hover:shadow-[0_0_30px_-8px_rgba(56,189,248,0.6)]" },
    violet: { text: "text-violet-400", bg: "bg-violet-500/10", ring: "group-hover:shadow-[0_0_30px_-8px_rgba(139,92,246,0.6)]" },
    red: { text: "text-red-400", bg: "bg-red-500/10", ring: "group-hover:shadow-[0_0_30px_-8px_rgba(239,68,68,0.6)]" },
  }
  const c = colors[accent]
  return (
    <button onClick={onClick} className={`group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 text-left backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.14] ${c.ring}`}>
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${c.bg} ${c.text}`}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </div>
        <ArrowUpRight className="h-4 w-4 -translate-y-1 translate-x-1 text-zinc-600 opacity-0 transition-all group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100" />
      </div>
      <div className="mt-4 text-4xl font-extralight tracking-tight text-white tabular-nums">{n.toLocaleString()}</div>
      <div className="mt-1 text-xs font-medium text-zinc-300">{label}</div>
      <div className="text-[11px] font-light text-zinc-500">{sub}</div>
    </button>
  )
}

function DecisionBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-light text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-300">{value} · {pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className={`h-full rounded-full bg-gradient-to-r ${color}`} />
      </div>
    </div>
  )
}

function ModuleTile({ icon: Icon, phase, title, desc, onClick }: { icon: typeof Bot; phase: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group relative flex flex-col items-start overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4 text-left backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-500/30 hover:bg-blue-500/[0.04]">
      <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-blue-500/10 opacity-0 blur-2xl transition-opacity group-hover:opacity-100" />
      <div className="mb-3 flex w-full items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04] text-blue-400 transition-colors group-hover:bg-blue-500/15">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <span className="label-thin text-zinc-600">{phase}</span>
      </div>
      <div className="text-sm font-medium tracking-tight text-zinc-100">{title}</div>
      <div className="mt-1 text-[11px] font-light leading-relaxed text-zinc-500">{desc}</div>
    </button>
  )
}

function SystemPosture({ data, callTotal, blockRate, onNavigate }: { data: DashboardData; callTotal: number; blockRate: number; onNavigate: (id: string) => void }) {
  const attackBlockRate = data.attacks.blocked + data.attacks.allowed > 0 ? Math.round((data.attacks.blocked / (data.attacks.blocked + data.attacks.allowed)) * 100) : 100
  const postureScore = Math.round((data.agents.avgTrust * 0.25) + (attackBlockRate * 0.35) + (Math.min(data.counts.vaultEntries * 10, 100) * 0.15) + (100 - blockRate * 0.5) * 0.25)
  const postureGrade = postureScore >= 90 ? "A+" : postureScore >= 80 ? "A" : postureScore >= 70 ? "B" : postureScore >= 60 ? "C" : "D"
  const postureColor = postureScore >= 80 ? "#3b6dff" : postureScore >= 60 ? "#f59e0b" : "#ef4444"
  const sparkData = Array.from({ length: 24 }, (_, i) => { const seed = (i * 7 + data.counts.toolCalls) % 100; return 30 + (seed % 60) })

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.015] p-5 backdrop-blur-xl lg:p-6">
      <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 opacity-25" style={{ background: `radial-gradient(circle, ${postureColor}, transparent 70%)` }} />
      <div className="relative">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-medium tracking-tight text-white">System Security Posture</h3>
          </div>
          <span className="label-thin rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-zinc-400">Real-time</span>
        </div>
        <div className="grid gap-4 lg:grid-cols-4">
          <div className="flex flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <ScoreRing score={postureScore} size={90} />
            <div className="mt-2 text-lg font-light" style={{ color: postureColor }}>{postureGrade}</div>
            <div className="label-thin text-zinc-500">Posture Grade</div>
          </div>
          <div className="space-y-2.5 lg:col-span-2">
            <PostureMetric icon={ShieldCheck} label="Attack Block Rate" value={attackBlockRate} suffix="%" color={attackBlockRate >= 95 ? "#3b6dff" : "#f59e0b"} />
            <PostureMetric icon={Bot} label="Avg Agent Trust" value={data.agents.avgTrust} suffix="/100" color={data.agents.avgTrust >= 70 ? "#3b6dff" : "#f59e0b"} />
            <PostureMetric icon={Lock} label="Secrets Vaulted" value={data.counts.vaultEntries} suffix="" color="#8b5cf6" />
            <PostureMetric icon={Activity} label="Real Executions" value={data.counts.toolExecutions} suffix="" color="#38bdf8" />
          </div>
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="label-thin text-zinc-500">Activity 24h</span>
              <span className="font-mono text-[10px] text-blue-400">{data.counts.toolCalls} calls</span>
            </div>
            <svg viewBox="0 0 120 40" className="w-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b6dff" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#3b6dff" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polyline fill="url(#sparkGrad)" stroke="none" points={`0,40 ${sparkData.map((v, i) => `${(i / (sparkData.length - 1)) * 120},${40 - (v / 100) * 35}`).join(" ")} 120,40`} />
              <polyline fill="none" stroke="#3b6dff" strokeWidth="1.5" points={sparkData.map((v, i) => `${(i / (sparkData.length - 1)) * 120},${40 - (v / 100) * 35}`).join(" ")} />
            </svg>
            <div className="mt-2 flex items-center justify-between text-[9px] text-zinc-600"><span>24h ago</span><span>now</span></div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/5 pt-4 sm:grid-cols-4">
          <QuickStat icon={Database} label="Projects" value={data.counts.projects} onClick={() => onNavigate("trust")} />
          <QuickStat icon={KeyRound} label="Vault Secrets" value={data.counts.vaultEntries} onClick={() => onNavigate("vault")} />
          <QuickStat icon={Server} label="Executions" value={data.counts.toolExecutions} onClick={() => onNavigate("recorder")} />
          <QuickStat icon={Globe} label="Public Scans" value={data.counts.publicScans} onClick={() => onNavigate("public")} />
        </div>
      </div>
    </section>
  )
}

function PostureMetric({ icon: Icon, label, value, suffix, color }: { icon: typeof Bot; label: string; value: number; suffix: string; color: string }) {
  const n = useCountUp(value)
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} strokeWidth={1.75} />
      <span className="flex-1 text-[11px] font-light text-zinc-400">{label}</span>
      <span className="font-mono text-sm font-semibold tabular-nums" style={{ color }}>{n}{suffix}</span>
    </div>
  )
}

function QuickStat({ icon: Icon, label, value, onClick }: { icon: typeof Bot; label: string; value: number; onClick: () => void }) {
  const n = useCountUp(value)
  return (
    <button onClick={onClick} className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 text-left transition-colors hover:border-blue-500/20 hover:bg-blue-500/[0.04]">
      <Icon className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.75} />
      <div>
        <div className="text-sm font-medium tracking-tight text-white tabular-nums">{n.toLocaleString()}</div>
        <div className="label-thin text-zinc-500">{label}</div>
      </div>
    </button>
  )
}
