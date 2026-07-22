"use client"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type RiskLevel = "low" | "medium" | "high" | "critical"

export const RISK_STYLES: Record<RiskLevel, string> = {
  low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
}

export const RISK_DOT: Record<RiskLevel, string> = {
  low: "bg-emerald-400",
  medium: "bg-amber-400",
  high: "bg-orange-400",
  critical: "bg-red-400",
}

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  return (
    <Badge variant="outline" className={cn("font-mono uppercase text-[10px] tracking-wider", RISK_STYLES[level])}>
      <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", RISK_DOT[level])} />
      {level}
      {score !== undefined && <span className="ml-1 opacity-70">·{score}</span>}
    </Badge>
  )
}

export const DECISION_STYLES: Record<string, string> = {
  allowed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  denied: "bg-red-500/15 text-red-400 border-red-500/30",
  blocked: "bg-red-500/15 text-red-400 border-red-500/30",
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  sandboxed: "bg-violet-500/15 text-violet-400 border-violet-500/30",
}

export function DecisionBadge({ decision }: { decision: string }) {
  return (
    <Badge variant="outline" className={cn("font-mono uppercase text-[10px] tracking-wider", DECISION_STYLES[decision] || "bg-muted text-muted-foreground border-border")}>
      {decision}
    </Badge>
  )
}

export function GradeBadge({ score }: { score: number }) {
  const grade = score >= 95 ? "A+" : score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F"
  const color = score >= 90 ? "text-emerald-400" : score >= 70 ? "text-amber-400" : "text-red-400"
  return <span className={cn("font-mono text-2xl font-bold", color)}>{grade}</span>
}

export function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const r = (size - 14) / 2
  const c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  const color = score >= 90 ? "#10b981" : score >= 70 ? "#f59e0b" : score >= 50 ? "#f97316" : "#ef4444"
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-muted/30" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-2xl font-bold" style={{ color }}>{score}</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">/ 100</span>
      </div>
    </div>
  )
}

export async function api<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts })
  if (!res.ok) {
    // Surface the server's error message (routes return { error }) so toasts are
    // actionable, while keeping the status prefix callers key off (e.g. "401").
    let detail = res.statusText
    try {
      const body = await res.json()
      if (body?.error) detail = body.error
    } catch { /* non-JSON body */ }
    throw new Error(`${res.status} ${detail}`)
  }
  return res.json()
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
}
