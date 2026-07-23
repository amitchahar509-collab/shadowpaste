"use client"
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { api } from "./shared"
import { Bot, Plus, Shield, ShieldAlert, ShieldCheck, Trash2, Activity, Lock, Cpu, ChevronRight } from "lucide-react"

interface Agent {
  id: string; name: string; provider: string; description: string | null
  trustScore: number; status: string; avatarColor: string; modelVersion: string | null
  totalCalls: number; deniedCalls: number; allowedCalls: number; lastActiveAt: string | null
  createdAt: string; _count: { toolCalls: number; permissions: number; sessions: number }
}

const PROVIDERS = ["Claude", "ChatGPT", "Cursor", "Copilot", "Gemini", "Custom"]

export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selected, setSelected] = useState<Agent | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const load = () => { setLoading(true); api<{ agents: Agent[] }>("/api/agents").then((d) => { setAgents(d.agents); if (d.agents[0] && !selected) setSelected(d.agents[0]); setLoading(false) }).catch(() => { setAgents([]); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const updateTrust = async (id: string, trustScore: number) => {
    await api(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify({ trustScore }) })
    setAgents((a) => a.map((x) => x.id === id ? { ...x, trustScore } : x))
    if (selected?.id === id) setSelected({ ...selected, trustScore })
  }
  const setStatus = async (id: string, status: string) => {
    await api(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify({ status }) })
    toast.success(`Agent status → ${status}`)
    load()
  }

  const create = async (data: { name: string; provider: string; description: string; trustScore: number; modelVersion: string }) => {
    await api("/api/agents", { method: "POST", body: JSON.stringify({ ...data, avatarColor: "#3b6dff" }) })
    toast.success("Agent created")
    setOpen(false)
    load()
  }

  if (loading) return <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="sp-skeleton h-48 rounded-xl border border-white/5" />)}</div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2.5 text-blue-300/90">
            <span className="h-px w-6 bg-gradient-to-r from-transparent to-blue-400" />
            <span className="label-thin">Identity · Trust · History</span>
          </div>
          <h2 className="text-3xl font-light tracking-tight text-white">Agent Identities</h2>
          <p className="mt-2 max-w-xl text-xs font-light leading-relaxed text-zinc-400">Every AI agent gets an identity, trust score, and full action history.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-blue-600 text-white hover:bg-blue-500"><Plus className="mr-1.5 h-4 w-4" />Register Agent</Button></DialogTrigger>
          <CreateAgentDialog onCreate={create} />
        </Dialog>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Agent list */}
        <div className="space-y-3 lg:col-span-2">
          {agents.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] py-16 text-center backdrop-blur-xl">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
                <Plus className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div className="text-sm font-medium text-zinc-200">No agents registered</div>
              <p className="mt-1 max-w-xs text-xs font-light text-zinc-500">Register an AI agent to give it an identity, a trust score, and a full audited action history. Sign in if you haven&apos;t yet.</p>
              <Button onClick={() => setOpen(true)} className="mt-4 bg-blue-600 text-white hover:bg-blue-500"><Plus className="mr-1.5 h-4 w-4" />Register your first agent</Button>
            </div>
          )}
          {agents.map((a) => (
            <Card key={a.id} className={`cursor-pointer border bg-white/[0.02] backdrop-blur-xl p-5 transition-all ${selected?.id === a.id ? "border-blue-500/40" : "border-white/5 hover:border-white/10"}`} onClick={() => setSelected(a)}>
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl font-light tracking-tight text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${a.avatarColor}, ${a.avatarColor}99)` }}>
                  {a.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-white">{a.name}</h3>
                    <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[10px] text-zinc-400">{a.provider}</Badge>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-zinc-400">{a.description || a.modelVersion || "—"}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <Stat label="Calls" value={a.totalCalls} />
                    <Stat label="Allowed" value={a.allowedCalls} accent="blue" />
                    <Stat label="Denied" value={a.deniedCalls} accent="red" />
                  </div>
                </div>
                <div className="shrink-0 text-center">
                  <div className={`font-mono text-2xl font-bold ${a.trustScore >= 80 ? "text-blue-400" : a.trustScore >= 50 ? "text-amber-400" : "text-red-400"}`}>{a.trustScore}</div>
                  <div className="text-[9px] uppercase tracking-wider text-zinc-500">trust</div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Detail panel */}
        <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5 lg:sticky lg:top-24 lg:self-start">
          {selected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg font-mono font-bold text-white" style={{ background: selected.avatarColor }}>{selected.name.charAt(0)}</div>
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{selected.name}</div>
                  <div className="text-[11px] text-zinc-500">{selected.provider} · {selected.modelVersion || "unknown model"}</div>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Trust Score</span>
                  <span className="font-mono font-bold text-white">{selected.trustScore}/100</span>
                </div>
                <Progress value={selected.trustScore} className="h-2 bg-white/5 [&>div]:bg-gradient-to-r [&>div]:from-blue-500 [&>div]:to-sky-400" />
                <Slider className="mt-3" value={[selected.trustScore]} max={100} onValueChange={(v) => updateTrust(selected.id, v[0])} />
              </div>

              <div>
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-zinc-500">Status Control</div>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant={selected.status === "active" ? "default" : "outline"} onClick={() => setStatus(selected.id, "active")} className={selected.status === "active" ? "bg-blue-600 text-white" : "border-white/10"}><ShieldCheck className="mr-1 h-3 w-3" />Active</Button>
                  <Button size="sm" variant={selected.status === "quarantined" ? "default" : "outline"} onClick={() => setStatus(selected.id, "quarantined")} className={selected.status === "quarantined" ? "bg-red-600 text-white" : "border-white/10"}><Lock className="mr-1 h-3 w-3" />Quarantine</Button>
                  <Button size="sm" variant={selected.status === "suspended" ? "default" : "outline"} onClick={() => setStatus(selected.id, "suspended")} className={selected.status === "suspended" ? "bg-amber-600 text-white" : "border-white/10"}><ShieldAlert className="mr-1 h-3 w-3" />Suspend</Button>
                  <Button size="sm" variant={selected.status === "revoked" ? "default" : "outline"} onClick={() => setStatus(selected.id, "revoked")} className={selected.status === "revoked" ? "bg-red-700 text-white" : "border-white/10"}><Trash2 className="mr-1 h-3 w-3" />Revoke</Button>
                </div>
              </div>

              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-blue-400" /><span className="text-[11px] font-semibold text-white">Identity Fingerprint</span></div>
                <div className="space-y-1 font-mono text-[10px] text-zinc-400">
                  <Row k="agent_id" v={selected.id} />
                  <Row k="provider" v={selected.provider} />
                  <Row k="model" v={selected.modelVersion || "—"} />
                  <Row k="sessions" v={String(selected._count.sessions)} />
                  <Row k="permissions" v={String(selected._count.permissions)} />
                  <Row k="registered" v={new Date(selected.createdAt).toLocaleDateString()} />
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[11px] text-amber-200/80">
                <ShieldAlert className="mb-1 h-3.5 w-3.5" />
                Revoked agents are blocked at the gateway before any policy evaluation. Suspended agents require re-approval.
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-zinc-500">Select an agent</div>
          )}
        </Card>
      </div>
    </div>
  )
}

function CreateAgentDialog({ onCreate }: { onCreate: (d: { name: string; provider: string; description: string; trustScore: number; modelVersion: string }) => void }) {
  const [name, setName] = useState("")
  const [provider, setProvider] = useState("Claude")
  const [description, setDescription] = useState("")
  const [modelVersion, setModelVersion] = useState("")
  const [trust, setTrust] = useState(50)
  return (
    <DialogContent className="border-white/10 bg-white/[0.02] backdrop-blur-xl">
      <DialogHeader><DialogTitle className="font-mono text-white">Register AI Agent</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label className="text-xs text-zinc-400">Agent Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 border-white/10 bg-white/[0.03]" placeholder="Claude Code Agent" /></div>
        <div><Label className="text-xs text-zinc-400">Provider</Label>
          <Select value={provider} onValueChange={setProvider}><SelectTrigger className="mt-1 border-white/10 bg-white/[0.03]"><SelectValue /></SelectTrigger><SelectContent className="border-white/10 bg-white/[0.02] backdrop-blur-xl">{PROVIDERS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select>
        </div>
        <div><Label className="text-xs text-zinc-400">Model Version</Label><Input value={modelVersion} onChange={(e) => setModelVersion(e.target.value)} className="mt-1 border-white/10 bg-white/[0.03]" placeholder="claude-sonnet-4.5" /></div>
        <div><Label className="text-xs text-zinc-400">Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 border-white/10 bg-white/[0.03]" placeholder="What does this agent do?" /></div>
        <div><Label className="text-xs text-zinc-400">Initial Trust Score: {trust}</Label><Slider className="mt-2" value={[trust]} max={100} onValueChange={(v) => setTrust(v[0])} /></div>
        <Button className="w-full bg-blue-600 text-white hover:bg-blue-500" onClick={() => name && onCreate({ name, provider, description, trustScore: trust, modelVersion })}><Cpu className="mr-1.5 h-4 w-4" />Create Identity</Button>
      </div>
    </DialogContent>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "blue" | "red" }) {
  const color = accent === "blue" ? "text-blue-400" : accent === "red" ? "text-red-400" : "text-white"
  return <div className="rounded bg-white/[0.02] py-1.5"><div className={`font-mono text-sm font-bold ${color}`}>{value}</div><div className="text-[9px] uppercase text-zinc-500">{label}</div></div>
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-zinc-500">{k}</span><span className="text-zinc-300">{v}</span></div>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = { active: "border-blue-500/30 bg-blue-500/10 text-blue-400", suspended: "border-amber-500/30 bg-amber-500/10 text-amber-400", quarantined: "border-red-500/30 bg-red-500/10 text-red-400", revoked: "border-red-700/40 bg-red-700/15 text-red-300" }
  return <Badge variant="outline" className={`text-[10px] uppercase ${map[status] || "border-white/10"}`}>{status}</Badge>
}
