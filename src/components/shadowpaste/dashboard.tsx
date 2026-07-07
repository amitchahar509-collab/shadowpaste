"use client"
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { api, DecisionBadge, RiskBadge, timeAgo, ScoreRing } from "./shared"
import {
  Bot, Network, ShieldCheck, ShieldAlert, Bug, Activity, TrendingUp, ArrowRight,
  Cpu, Lock, Zap, Radio, Boxes, Github, Store, Globe, Gauge,
} from "lucide-react"

interface DashboardData {
  counts: { agents: number; tools: number; packages: number; projects: number; toolCalls: number; attacks: number; publicScans: number; sandboxChanges: number }
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
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="h-32 animate-pulse border-white/5 bg-white/[0.02]" />)}
      </div>
    )
  }

  const callTotal = data.calls.allowed + data.calls.denied + data.calls.sandboxed + data.calls.pending
  const blockRate = callTotal ? Math.round(((data.calls.denied + data.calls.sandboxed) / callTotal) * 100) : 0

  return (
    <div className="space-y-6">
      {/* Hero banner */}
      <Card className="relative overflow-hidden border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-[#0d1218] to-[#0d1218] p-6">
        <div className="absolute right-0 top-0 h-full w-1/2 opacity-20" style={{ background: "radial-gradient(circle at 80% 20%, rgba(16,185,129,0.4), transparent 60%)" }} />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">PHASE 1-11 · LIVE</Badge>
              <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[10px] text-zinc-400">ZERO-TRUST MCP</Badge>
            </div>
            <h2 className="font-mono text-2xl font-bold text-white lg:text-3xl">
              The security layer between developers,<br className="hidden lg:block" /> AI agents, and real systems.
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              Every tool call from Claude, ChatGPT, or Cursor passes through ShadowPaste — risk-scored, policy-gated, audit-recorded, sandbox-default.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <ScoreRing score={data.agents.avgTrust} size={110} />
            <div className="text-xs">
              <div className="font-mono uppercase tracking-wider text-zinc-500">Avg Agent Trust</div>
              <div className="mt-1 text-2xl font-bold text-white">{data.agents.avgTrust}<span className="text-sm text-zinc-500">/100</span></div>
              <div className="mt-1 text-[11px] text-emerald-400">{data.agents.active} active · {data.agents.quarantined} quarantined</div>
            </div>
          </div>
        </div>
      </Card>

      {/* Top KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Bot} label="AI Agents" value={data.counts.agents} sub={`${data.agents.active} active`} accent="emerald" onClick={() => onNavigate("agents")} />
        <KpiCard icon={Network} label="MCP Tools" value={data.counts.tools} sub={`${data.counts.packages} packages`} accent="teal" onClick={() => onNavigate("gateway")} />
        <KpiCard icon={ShieldCheck} label="Tool Calls Audited" value={data.counts.toolCalls} sub={`${data.calls.denied} denied`} accent="cyan" onClick={() => onNavigate("recorder")} />
        <KpiCard icon={Bug} label="Attacks Blocked" value={data.attacks.blocked} sub={`${data.attacks.allowed} slipped`} accent="red" onClick={() => onNavigate("attacks")} />
      </div>

      {/* Live call feed + decision breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-white/5 bg-[#0d1218] p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <h3 className="font-mono text-sm font-semibold text-white">Live Tool Call Feed</h3>
            </div>
            <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400">
              <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />LIVE
            </Badge>
          </div>
          <div className="space-y-1.5">
            {data.recentCalls.length === 0 && (
              <div className="rounded-lg border border-dashed border-white/5 py-8 text-center text-xs text-zinc-500">
                No calls yet. Go to <button onClick={() => onNavigate("gateway")} className="text-emerald-400 hover:underline">MCP Gateway</button> to invoke a tool.
              </div>
            )}
            {data.recentCalls.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 hover:bg-white/[0.04]">
                <div className="font-mono text-[10px] text-zinc-500">{timeAgo(c.time)}</div>
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate font-mono text-xs text-zinc-300">{c.agent}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-zinc-600" />
                  <span className="truncate font-mono text-xs text-emerald-400">{c.tool}</span>
                </div>
                <RiskBadge level={c.riskLevel} score={c.riskScore} />
                <DecisionBadge decision={c.decision} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="border-white/5 bg-[#0d1218] p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <h3 className="font-mono text-sm font-semibold text-white">Decision Breakdown</h3>
          </div>
          <div className="space-y-3">
            <DecisionBar label="Allowed" value={data.calls.allowed} total={callTotal} color="bg-emerald-500" />
            <DecisionBar label="Denied" value={data.calls.denied} total={callTotal} color="bg-red-500" />
            <DecisionBar label="Sandboxed" value={data.calls.sandboxed} total={callTotal} color="bg-violet-500" />
            <DecisionBar label="Pending" value={data.calls.pending} total={callTotal} color="bg-amber-500" />
          </div>
          <div className="mt-4 border-t border-white/5 pt-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">Block Rate</span>
              <span className="font-mono font-bold text-red-400">{blockRate}%</span>
            </div>
            <Progress value={blockRate} className="mt-2 h-1.5 bg-white/5 [&>div]:bg-gradient-to-r [&>div]:from-amber-500 [&>div]:to-red-500" />
          </div>
        </Card>
      </div>

      {/* Phase navigation grid */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Lock className="h-4 w-4 text-emerald-400" />
          <h3 className="font-mono text-sm font-semibold text-white">Security OS Modules</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ModuleTile icon={Network} phase="P1" title="MCP Zero-Trust Gateway" desc="Claude / ChatGPT / Cursor connect through ShadowPaste." onClick={() => onNavigate("gateway")} />
          <ModuleTile icon={Bot} phase="P2" title="Agent Identity System" desc="Every AI agent gets an identity, trust score & history." onClick={() => onNavigate("agents")} />
          <ModuleTile icon={ShieldCheck} phase="P3" title="Permission Control Center" desc="Phone-style prompts: Allow once / Always / Deny." onClick={() => onNavigate("permissions")} />
          <ModuleTile icon={Radio} phase="P4" title="AI Flight Recorder" desc="Black box timeline + replay of every agent action." onClick={() => onNavigate("recorder")} />
          <ModuleTile icon={Boxes} phase="P5" title="Shadow Sandbox" desc="AI changes land in a copy first. Human approve → merge." onClick={() => onNavigate("sandbox")} />
          <ModuleTile icon={Github} phase="P6" title="AI Safe GitHub" desc="One-click repo scan → AI Safety Report." onClick={() => onNavigate("github")} />
          <ModuleTile icon={Gauge} phase="P7" title="AI Trust Score" desc="Shareable 0-100 score per project." onClick={() => onNavigate("trust")} />
          <ModuleTile icon={Store} phase="P8" title="MCP Marketplace" desc="Safe MCP Store — every tool policy-gated." onClick={() => onNavigate("marketplace")} />
          <ModuleTile icon={Globe} phase="P10" title="Public Scanner" desc="Drop a GitHub URL → free AI safety scan, no login." onClick={() => onNavigate("public")} />
          <ModuleTile icon={Bug} phase="P11" title="Red Team Lab" desc="Prompt injection, malicious MCP, stolen token, rogue agent." onClick={() => onNavigate("attacks")} />
        </div>
      </div>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub, accent, onClick }: { icon: typeof Bot; label: string; value: number; sub: string; accent: "emerald" | "teal" | "cyan" | "red"; onClick?: () => void }) {
  const colors = { emerald: "text-emerald-400 bg-emerald-500/10", teal: "text-teal-400 bg-teal-500/10", cyan: "text-cyan-400 bg-cyan-500/10", red: "text-red-400 bg-red-500/10" }
  return (
    <Card className="group cursor-pointer border-white/5 bg-[#0d1218] p-5 transition-all hover:border-white/10 hover:bg-white/[0.03]" onClick={onClick}>
      <div className="flex items-start justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${colors[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <ArrowRight className="h-4 w-4 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="mt-3 font-mono text-3xl font-bold text-white">{value.toLocaleString()}</div>
      <div className="mt-1 text-xs font-medium text-zinc-300">{label}</div>
      <div className="text-[11px] text-zinc-500">{sub}</div>
    </Card>
  )
}

function DecisionBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total ? Math.round((value / total) * 100) : 0
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-300">{value} · {pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ModuleTile({ icon: Icon, phase, title, desc, onClick }: { icon: typeof Bot; phase: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex flex-col items-start rounded-xl border border-white/5 bg-[#0d1218] p-4 text-left transition-all hover:border-emerald-500/30 hover:bg-emerald-500/[0.03]">
      <div className="mb-3 flex w-full items-center justify-between">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-emerald-400 transition-colors group-hover:bg-emerald-500/15">
          <Icon className="h-4 w-4" />
        </div>
        <span className="font-mono text-[9px] text-zinc-600">{phase}</span>
      </div>
      <div className="text-sm font-semibold text-zinc-100">{title}</div>
      <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">{desc}</div>
    </button>
  )
}
