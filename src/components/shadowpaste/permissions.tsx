"use client"
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { api, RiskBadge } from "./shared"
import { KeyRound, Check, X, ShieldQuestion, CheckCircle2, XCircle, HelpCircle, Lock, Bot, RefreshCw } from "lucide-react"

interface Permission { id: string; toolName: string; scope: string; decision: string; riskLevel: "low" | "medium" | "high" | "critical"; grantedBy: string | null; agent: { id: string; name: string; provider: string; avatarColor: string } }
interface Agent { id: string; name: string; provider: string; avatarColor: string }

const DECISION_META: Record<string, { label: string; icon: typeof Check; color: string; bg: string }> = {
  allow_always: { label: "Allow Always", icon: CheckCircle2, color: "text-emerald-400", bg: "border-emerald-500/30 bg-emerald-500/10" },
  allow_once: { label: "Allow Once", icon: Check, color: "text-teal-400", bg: "border-teal-500/30 bg-teal-500/10" },
  ask: { label: "Ask", icon: HelpCircle, color: "text-amber-400", bg: "border-amber-500/30 bg-amber-500/10" },
  deny: { label: "Deny", icon: XCircle, color: "text-red-400", bg: "border-red-500/30 bg-red-500/10" },
}

export function Permissions() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [agentId, setAgentId] = useState("")
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [loading, setLoading] = useState(true)

  const loadPerms = (id: string) => { setLoading(true); api<{ permissions: Permission[] }>(`/api/permissions?agentId=${id}`).then((d) => { setPermissions(d.permissions); setLoading(false) }) }
  useEffect(() => { api<{ agents: Agent[] }>("/api/agents").then((d) => { setAgents(d.agents); if (d.agents[0]) { setAgentId(d.agents[0].id); loadPerms(d.agents[0].id) } }) }, [])

  const setDecision = async (permId: string, decision: string) => {
    const p = permissions.find((x) => x.id === permId)
    if (!p) return
    await api("/api/permissions", { method: "POST", body: JSON.stringify({ agentId: p.agent.id, toolName: p.toolName, scope: p.scope, decision, riskLevel: p.riskLevel, grantedBy: "user" }) })
    toast.success(`${p.toolName} → ${DECISION_META[decision].label}`)
    if (agentId) loadPerms(agentId)
  }
  const remove = async (id: string) => { await api(`/api/permissions/${id}`, { method: "DELETE" }); toast.success("Permission removed"); if (agentId) loadPerms(agentId) }

  const selectedAgent = agents.find((a) => a.id === agentId)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-mono text-lg font-bold text-white">AI Permission Control Center</h2>
        <p className="text-xs text-zinc-400">Like phone permissions — decide what each AI agent can access. Allow once, allow always, or deny.</p>
      </div>

      {/* Permission prompt mockup — phone-style */}
      {selectedAgent && (
        <Card className="relative overflow-hidden border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.05] to-[#0d1218] p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl font-mono text-xl font-bold text-white shadow-lg" style={{ background: selectedAgent.avatarColor }}>{selectedAgent.name.charAt(0)}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-emerald-400" />
                <span className="font-semibold text-white">{selectedAgent.name}</span>
                <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[10px] text-zinc-400">{selectedAgent.provider}</Badge>
              </div>
              <p className="mt-1 text-sm text-zinc-300">wants access to project resources.</p>
            </div>
            <ShieldQuestion className="h-6 w-6 text-amber-400" />
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {[
              { label: "Read project files", tool: "fs.read", allowed: true },
              { label: "Edit source code", tool: "fs.write", allowed: true },
              { label: "Open pull requests", tool: "github.pr.create", allowed: true },
              { label: "Access Stripe", tool: "stripe.read", allowed: false },
              { label: "Production database", tool: "db.write", allowed: false },
              { label: "Delete repository", tool: "github.repo.delete", allowed: false },
            ].map((p) => (
              <div key={p.tool} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                <div className="flex items-center gap-2">
                  {p.allowed ? <Check className="h-4 w-4 text-emerald-400" /> : <X className="h-4 w-4 text-zinc-500" />}
                  <span className="text-xs text-zinc-200">{p.label}</span>
                </div>
                <span className={`font-mono text-[10px] ${p.allowed ? "text-emerald-400" : "text-zinc-500"}`}>{p.allowed ? "ALLOWED" : "BLOCKED"}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Agent selector + permission table */}
      <Card className="border-white/5 bg-[#0d1218] p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-emerald-400" /><h3 className="font-mono text-sm font-semibold text-white">Permission Grants</h3></div>
          <div className="flex items-center gap-2">
            <Select value={agentId} onValueChange={(v) => { setAgentId(v); loadPerms(v) }}>
              <SelectTrigger className="w-56 border-white/10 bg-white/[0.03] font-mono text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/10 bg-[#0d1218]">{agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={() => agentId && loadPerms(agentId)} className="border-white/10"><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded bg-white/[0.02]" />)}</div>
        ) : (
          <div className="space-y-2">
            {permissions.map((p) => {
              const meta = DECISION_META[p.decision] || DECISION_META.ask
              const Icon = meta.icon
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${meta.bg}`}><Icon className={`h-3.5 w-3.5 ${meta.color}`} /></div>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs text-zinc-200">{p.toolName}</div>
                      <div className="text-[10px] text-zinc-500">scope: {p.scope} · by {p.grantedBy || "policy"}</div>
                    </div>
                  </div>
                  <RiskBadge level={p.riskLevel} />
                  <div className="flex gap-1">
                    {(Object.keys(DECISION_META) as string[]).map((d) => (
                      <button key={d} onClick={() => setDecision(p.id, d)} title={DECISION_META[d].label}
                        className={`flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${p.decision === d ? DECISION_META[d].bg : "border-white/5 bg-white/[0.02] text-zinc-500 hover:bg-white/[0.05]"}`}>
                        {(() => { const I = DECISION_META[d].icon; return <I className="h-3.5 w-3.5" /> })()}
                      </button>
                    ))}
                    <button onClick={() => remove(p.id)} className="flex h-7 w-7 items-center justify-center rounded-md border border-white/5 bg-white/[0.02] text-zinc-500 hover:bg-red-500/10 hover:text-red-400"><X className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              )
            })}
            {permissions.length === 0 && <div className="rounded-lg border border-dashed border-white/5 py-8 text-center text-xs text-zinc-500">No permission grants for this agent.</div>}
          </div>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-4">
        {Object.entries(DECISION_META).map(([k, m]) => {
          const Icon = m.icon
          const count = permissions.filter((p) => p.decision === k).length
          return (
            <Card key={k} className={`border p-4 ${m.bg}`}>
              <Icon className={`mb-2 h-5 w-5 ${m.color}`} />
              <div className="font-mono text-2xl font-bold text-white">{count}</div>
              <div className="text-[11px] text-zinc-300">{m.label}</div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
