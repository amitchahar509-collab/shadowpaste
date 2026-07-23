"use client"
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { api, RiskBadge } from "./shared"
import { Boxes, GitBranch, Check, X, ShieldAlert, FileCode, Plus, Lock, ArrowRight, ScanLine } from "lucide-react"

interface SandboxChange { id: string; filePath: string; changeType: "created" | "modified" | "deleted"; diff: string; riskLevel: "low" | "medium" | "high" | "critical"; riskReason: string; approved: boolean }
interface Project { id: string; name: string; repoUrl: string | null; sandboxStatus: string; trustScore: number; fileCount: number }

export function Sandbox() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState("")
  const [changes, setChanges] = useState<SandboxChange[]>([])
  const [selected, setSelected] = useState<SandboxChange | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProjects = () => { api<{ projects: Project[] }>("/api/sandbox").then((d) => { setProjects(d.projects); if (d.projects[0] && !projectId) { setProjectId(d.projects[0].id); loadChanges(d.projects[0].id) } }) }
  const loadChanges = (id: string) => { setLoading(true); api<{ project: Project & { sandboxChanges: SandboxChange[] } }>(`/api/sandbox?projectId=${id}`).then((d) => { setChanges(d.project.sandboxChanges); setSelected(d.project.sandboxChanges[0] || null); setLoading(false) }) }
  useEffect(() => { loadProjects() }, [])

  const approve = async (id: string) => { const r = await api<{ ok: boolean; merged: boolean }>(`/api/sandbox/${id}/approve`, { method: "POST" }); toast.success(r.merged ? "Approved — all changes merged to main" : "Change approved"); if (projectId) loadChanges(projectId) }
  const reject = async (id: string) => { await api(`/api/sandbox/${id}/approve`, { method: "DELETE" }); toast.success("Change rejected"); if (projectId) loadChanges(projectId) }
  const createSandbox = async () => { await api("/api/sandbox", { method: "POST", body: JSON.stringify({ projectId }) }); toast.success("Shadow workspace created with synthetic AI changes"); if (projectId) loadChanges(projectId) }

  const project = projects.find((p) => p.id === projectId)
  const approvedCount = changes.filter((c) => c.approved).length
  const pendingCount = changes.filter((c) => !c.approved).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-light tracking-tight text-white">Shadow Sandbox</h2>
        <p className="text-xs text-zinc-400">Never let AI touch production first. Original → sandbox copy → AI changes → security scan → human approve → merge.</p>
      </div>

      {/* Flow */}
      <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {[
            { label: "Original Project", icon: GitBranch, color: "text-zinc-300" },
            { label: "AI Sandbox Copy", icon: Boxes, color: "text-violet-400" },
            { label: "AI Changes", icon: FileCode, color: "text-amber-400" },
            { label: "Security Scan", icon: ScanLine, color: "text-sky-400" },
            { label: "Human Approve", icon: Check, color: "text-blue-400" },
            { label: "Merge", icon: GitBranch, color: "text-blue-400" },
          ].map((s, i, arr) => (
            <div key={s.label} className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono"><s.icon className={`h-3.5 w-3.5 ${s.color}`} />{s.label}</div>
              {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-zinc-600" />}
            </div>
          ))}
        </div>
      </Card>

      {/* Project selector + summary */}
      <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-violet-400" />
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); loadChanges(e.target.value) }} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-xs text-zinc-200">
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {project && <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-[10px] text-violet-300">{project.sandboxStatus}</Badge>}
          </div>
          <Button size="sm" onClick={createSandbox} className="bg-violet-600 text-white hover:bg-violet-500"><Plus className="mr-1.5 h-3.5 w-3.5" />Regenerate AI Changes</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Metric label="Total Changes" value={changes.length} />
          <Metric label="Approved" value={approvedCount} color="text-blue-400" />
          <Metric label="Pending Review" value={pendingCount} color="text-amber-400" />
          <Metric label="Trust Score" value={project?.trustScore ?? 0} color="text-sky-400" />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Change list */}
        <div className="space-y-2 lg:col-span-2">
          {loading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded bg-white/[0.02]" />)}</div> : (
            changes.map((c) => (
              <button key={c.id} onClick={() => setSelected(c)} className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${selected?.id === c.id ? "border-violet-500/30 bg-violet-500/[0.05]" : c.approved ? "border-blue-500/20 bg-blue-500/[0.03]" : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"}`}>
                <div className={`flex h-7 w-7 items-center justify-center rounded-md ${c.changeType === "created" ? "bg-blue-500/10 text-blue-400" : c.changeType === "deleted" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"}`}>
                  {c.changeType === "created" ? <Plus className="h-3.5 w-3.5" /> : c.changeType === "deleted" ? <X className="h-3.5 w-3.5" /> : <FileCode className="h-3.5 w-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs text-zinc-200">{c.filePath}</div>
                  <div className="truncate text-[10px] text-zinc-500">{c.riskReason}</div>
                </div>
                {c.approved ? <Check className="h-4 w-4 text-blue-400" /> : <RiskBadge level={c.riskLevel} />}
              </button>
            ))
          )}
        </div>

        {/* Diff viewer */}
        <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5 lg:col-span-3">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><FileCode className="h-4 w-4 text-blue-400" /><span className="font-mono text-xs text-white">{selected.filePath}</span></div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[10px] text-zinc-400">{selected.changeType}</Badge>
                  <RiskBadge level={selected.riskLevel} />
                </div>
              </div>
              {selected.riskLevel !== "low" && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/[0.05] p-3 text-[11px] text-red-300">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div><span className="font-semibold">Risk detected:</span> {selected.riskReason}</div>
                </div>
              )}
              <div className="overflow-hidden rounded-lg border border-white/5 bg-[#070a0f]">
                <div className="border-b border-white/5 bg-white/[0.02] px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500">Unified Diff</div>
                <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed">
                  {selected.diff.split("\n").map((line, i) => {
                    const cls = line.startsWith("+") && !line.startsWith("+++") ? "text-blue-400 bg-blue-500/5" : line.startsWith("-") && !line.startsWith("---") ? "text-red-400 bg-red-500/5" : line.startsWith("@@") ? "text-sky-400" : "text-zinc-400"
                    return <div key={i} className={`px-1 ${cls}`}>{line || " "}</div>
                  })}
                </pre>
              </div>
              {!selected.approved ? (
                <div className="flex gap-2">
                  <Button onClick={() => approve(selected.id)} className="flex-1 bg-blue-600 text-white hover:bg-blue-500"><Check className="mr-1.5 h-4 w-4" />Approve & Merge</Button>
                  <Button onClick={() => reject(selected.id)} variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10"><X className="mr-1.5 h-4 w-4" />Reject</Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/[0.05] p-3 text-xs text-blue-300"><Lock className="h-3.5 w-3.5" />Approved and merged to main.</div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-zinc-500">Select a change to review its diff</div>
          )}
        </Card>
      </div>
    </div>
  )
}

function Metric({ label, value, color }: { label: string; value: number; color?: string }) {
  return <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5"><div className={`font-mono text-xl font-bold ${color || "text-white"}`}>{value}</div><div className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</div></div>
}
