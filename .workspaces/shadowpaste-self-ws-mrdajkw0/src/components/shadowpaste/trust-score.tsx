"use client"
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { api, GradeBadge, ScoreRing } from "./shared"
import { Gauge, TrendingUp, Share2, ShieldCheck, KeyRound, FileWarning, Bot, Download, Github } from "lucide-react"
import { toast } from "sonner"

interface Project { id: string; name: string; repoUrl: string | null; trustScore: number; secretsProtected: number; riskyFiles: number; agentPermissions: number; securityIssues: number; status: string; updatedAt: string }

export function TrustScore() {
  const [projects, setProjects] = useState<Project[]>([])
  const [avg, setAvg] = useState(0)
  const [selected, setSelected] = useState<Project | null>(null)

  useEffect(() => { api<{ projects: Project[]; avgScore: number }>("/api/trust").then((d) => { setProjects(d.projects); setAvg(d.avgScore); if (d.projects[0]) setSelected(d.projects[0]) }) }, [])

  const share = (p: Project) => {
    const text = `My repo "${p.name}" is AI Safe — score ${p.trustScore}/100 🛡️ via ShadowPaste`
    if (navigator.share) navigator.share({ title: "AI Safety Score", text }).catch(() => {})
    else { navigator.clipboard.writeText(text); toast.success("Score copied to clipboard — paste it anywhere!") }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-mono text-lg font-bold text-white">AI Trust Score</h2>
        <p className="text-xs text-zinc-400">Every project gets a 0-100 score. Generate a shareable "My repo is AI Safe" badge for viral marketing.</p>
      </div>

      {/* Shareable badge */}
      {selected && (
        <Card className="relative overflow-hidden border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] via-[#0d1218] to-[#0d1218] p-6">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, rgba(16,185,129,0.3), transparent 50%)" }} />
          <div className="relative flex flex-col items-center gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-5">
              <ScoreRing score={selected.trustScore} size={130} />
              <div>
                <div className="mb-1 flex items-center gap-2"><Github className="h-4 w-4 text-emerald-400" /><span className="font-mono text-lg font-bold text-white">{selected.name}</span></div>
                <div className="flex items-center gap-2"><span className="font-mono text-3xl font-bold text-emerald-400">{selected.trustScore}</span><span className="text-zinc-500">/100</span><GradeBadge score={selected.trustScore} /></div>
                <p className="mt-1 text-xs text-zinc-400">{selected.status === "safe" ? "✓ AI Safe — ready for agent access" : "⚠ At risk — review findings before granting agent access"}</p>
              </div>
            </div>
            <Button onClick={() => share(selected)} className="bg-emerald-600 text-white hover:bg-emerald-500"><Share2 className="mr-1.5 h-4 w-4" />Share Score</Button>
          </div>
        </Card>
      )}

      {/* Metrics breakdown */}
      {selected && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard icon={KeyRound} label="Secrets Protected" value={selected.secretsProtected} color="text-red-400" desc="Found & vaulted" />
          <MetricCard icon={FileWarning} label="Risky Files" value={selected.riskyFiles} color="text-amber-400" desc="Flagged for review" />
          <MetricCard icon={Bot} label="Agent Permissions" value={selected.agentPermissions} color="text-cyan-400" desc="Active grants" />
          <MetricCard icon={ShieldCheck} label="Security Issues" value={selected.securityIssues} color="text-orange-400" desc="High+ severity" />
        </div>
      )}

      {/* All projects leaderboard */}
      <Card className="border-white/5 bg-[#0d1218] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-400" /><h3 className="font-mono text-sm font-semibold text-white">Project Trust Leaderboard</h3></div>
          <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[10px] text-zinc-400">avg {avg}/100</Badge>
        </div>
        <div className="space-y-2">
          {projects.map((p, i) => (
            <button key={p.id} onClick={() => setSelected(p)} className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${selected?.id === p.id ? "border-emerald-500/30 bg-emerald-500/[0.05]" : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"}`}>
              <div className="w-6 text-center font-mono text-sm font-bold text-zinc-500">#{i + 1}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="truncate font-mono text-sm text-white">{p.name}</span><Badge variant="outline" className={`text-[9px] uppercase ${p.status === "safe" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-amber-500/30 bg-amber-500/10 text-amber-400"}`}>{p.status}</Badge></div>
                <div className="text-[10px] text-zinc-500">{p.repoUrl}</div>
              </div>
              <div className="hidden gap-4 sm:flex">
                <MiniMetric label="secrets" value={p.secretsProtected} />
                <MiniMetric label="issues" value={p.securityIssues} />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-24 overflow-hidden rounded-full bg-white/5"><div className={`h-full ${p.trustScore >= 80 ? "bg-emerald-500" : p.trustScore >= 60 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${p.trustScore}%` }} /></div>
                <span className={`w-10 text-right font-mono text-sm font-bold ${p.trustScore >= 80 ? "text-emerald-400" : p.trustScore >= 60 ? "text-amber-400" : "text-red-400"}`}>{p.trustScore}</span>
              </div>
            </button>
          ))}
          {projects.length === 0 && <div className="rounded-lg border border-dashed border-white/5 py-8 text-center text-xs text-zinc-500">No projects scanned yet. Use AI Safe GitHub to scan one.</div>}
        </div>
      </Card>

      {/* Viral badge preview */}
      {selected && (
        <Card className="border-white/5 bg-[#0d1218] p-5">
          <div className="mb-3 flex items-center gap-2"><Download className="h-4 w-4 text-emerald-400" /><h3 className="font-mono text-sm font-semibold text-white">Shareable Badge Preview</h3></div>
          <div className="flex justify-center">
            <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-600 to-teal-700 p-6 text-center shadow-2xl shadow-emerald-500/20">
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 30% 20%, white, transparent 50%)" }} />
              <div className="relative">
                <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-white" />
                <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-100">AI Safety Certified</div>
                <div className="my-2 font-mono text-5xl font-bold text-white">{selected.trustScore}<span className="text-xl text-emerald-200">/100</span></div>
                <div className="font-mono text-sm text-white">{selected.name}</div>
                <div className="mt-1 text-[10px] text-emerald-200">Scanned by ShadowPaste · shadowpaste.io</div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, color, desc }: { icon: typeof KeyRound; label: string; value: number; color: string; desc: string }) {
  return <Card className="border-white/5 bg-[#0d1218] p-4"><div className="flex items-center gap-2"><Icon className={`h-4 w-4 ${color}`} /><span className="text-[11px] text-zinc-400">{label}</span></div><div className="mt-2 font-mono text-2xl font-bold text-white">{value}</div><div className="text-[10px] text-zinc-500">{desc}</div></Card>
}
function MiniMetric({ label, value }: { label: string; value: number }) {
  return <div className="text-center"><div className="font-mono text-sm font-bold text-white">{value}</div><div className="text-[9px] uppercase text-zinc-500">{label}</div></div>
}
