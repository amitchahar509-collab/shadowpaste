"use client"
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { api, timeLabel, timeAgo } from "./shared"
import {
  ScrollText, Filter, Download, User, Bot, Server, Search, RefreshCw,
  KeyRound, Cpu, ScanLine, ShieldCheck, FileCode, Activity, Lock, Zap,
} from "lucide-react"

interface AuditEntry {
  id: string
  orgId: string
  actorType: string // user, agent, system
  actorId: string | null
  action: string // vault.store, agent.create, tool.invoke, scan.run
  target: string | null
  metadata: Record<string, unknown> | null
  time: string
}

interface AuditData {
  logs: AuditEntry[]
  counts: { total: number; byAction: Record<string, number>; byActor: Record<string, number> }
}

const ACTOR_META: Record<string, { icon: typeof User; color: string; bg: string; label: string }> = {
  user: { icon: User, color: "text-blue-400", bg: "bg-blue-500/10", label: "User" },
  agent: { icon: Bot, color: "text-amber-400", bg: "bg-amber-500/10", label: "AI Agent" },
  system: { icon: Server, color: "text-sky-400", bg: "bg-sky-500/10", label: "System" },
}

const ACTION_META: Record<string, { icon: typeof KeyRound; color: string; label: string }> = {
  "vault.store": { icon: Lock, color: "text-violet-400", label: "Secret Vaulted" },
  "vault.delete": { icon: KeyRound, color: "text-red-400", label: "Secret Revoked" },
  "agent.create": { icon: Bot, color: "text-blue-400", label: "Agent Created" },
  "tool.invoke": { icon: Zap, color: "text-sky-400", label: "Tool Invoked" },
  "scan.run": { icon: ScanLine, color: "text-sky-400", label: "Repo Scanned" },
  "agent.update": { icon: ShieldCheck, color: "text-amber-400", label: "Agent Updated" },
}

export function AuditTrail() {
  const [data, setData] = useState<AuditData | null>(null)
  const [loading, setLoading] = useState(true)
  const [filterAction, setFilterAction] = useState<string>("all")
  const [filterActor, setFilterActor] = useState<string>("all")
  const [search, setSearch] = useState("")

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterAction !== "all") params.set("action", filterAction)
    if (filterActor !== "all") params.set("actorType", filterActor)
    api<AuditData>(`/api/audit-logs?${params}`).then((d) => { setData(d); setLoading(false) }).catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [filterAction, filterActor])

  const exportCsv = () => {
    if (!data) return
    const rows = [["time", "actorType", "actorId", "action", "target"]]
    data.logs.forEach((l) => rows.push([l.time, l.actorType, l.actorId || "", l.action, l.target || ""]))
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `shadowpaste-audit-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
    toast.success("Audit log exported as CSV")
  }

  const filtered = data?.logs.filter((l) => {
    if (!search) return true
    const q = search.toLowerCase()
    return l.action.toLowerCase().includes(q) || (l.target || "").toLowerCase().includes(q) || (l.actorId || "").toLowerCase().includes(q)
  }) || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-blue-400" />
            <h2 className="text-2xl font-light tracking-tight text-white">Compliance Audit Trail</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-400">Immutable record of every security-relevant action across the organization. Exportable for SOC2 / compliance audits.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} className="border-white/10"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
          <Button size="sm" onClick={exportCsv} className="bg-blue-600 text-white hover:bg-blue-500"><Download className="mr-1.5 h-3.5 w-3.5" />Export CSV</Button>
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard icon={Activity} label="Total Events" value={data.counts.total} color="text-blue-400" />
          <SummaryCard icon={Bot} label="Agent Actions" value={data.counts.byActor.agent || 0} color="text-amber-400" />
          <SummaryCard icon={User} label="User Actions" value={data.counts.byActor.user || 0} color="text-sky-400" />
          <SummaryCard icon={Server} label="System Actions" value={data.counts.byActor.system || 0} color="text-violet-400" />
        </div>
      )}

      {/* Action distribution */}
      {data && Object.keys(data.counts.byAction).length > 0 && (
        <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5">
          <div className="mb-3 flex items-center gap-2"><Filter className="h-4 w-4 text-blue-400" /><h3 className="text-sm font-medium tracking-tight text-white">Action Distribution</h3></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(data.counts.byAction).sort((a, b) => b[1] - a[1]).map(([action, count]) => {
              const meta = ACTION_META[action] || { icon: Activity, color: "text-zinc-400", label: action }
              const Icon = meta.icon
              const pct = data.counts.total ? Math.round((count / data.counts.total) * 100) : 0
              return (
                <button key={action} onClick={() => setFilterAction(filterAction === action ? "all" : action)} className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${filterAction === action ? "border-blue-500/30 bg-blue-500/[0.05]" : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"}`}>
                  <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-zinc-200">{meta.label}</div>
                    <div className="font-mono text-[9px] text-zinc-500">{action}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-white">{count}</div>
                    <div className="text-[9px] text-zinc-500">{pct}%</div>
                  </div>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {/* Filters + timeline */}
      <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-blue-400" /><h3 className="text-sm font-medium tracking-tight text-white">Event Timeline</h3></div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search events…" className="w-44 border-white/10 bg-white/[0.03] pl-8 text-xs" />
            </div>
            <Select value={filterActor} onValueChange={setFilterActor}>
              <SelectTrigger className="w-32 border-white/10 bg-white/[0.03] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="border-white/10 bg-white/[0.02] backdrop-blur-xl">
                <SelectItem value="all">All Actors</SelectItem>
                <SelectItem value="user">Users</SelectItem>
                <SelectItem value="agent">Agents</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
            {(filterAction !== "all" || filterActor !== "all" || search) && (
              <Button size="sm" variant="ghost" onClick={() => { setFilterAction("all"); setFilterActor("all"); setSearch("") }} className="text-zinc-400 hover:text-white">Clear</Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded bg-white/[0.02]" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/5 py-12 text-center">
            <ScrollText className="mx-auto mb-2 h-8 w-8 text-zinc-600" />
            <div className="text-sm text-zinc-400">No audit events match your filters</div>
            <p className="mt-1 text-xs text-zinc-500">Try clearing filters or invoking tools in the MCP Gateway.</p>
          </div>
        ) : (
          <div className="relative max-h-[600px] space-y-1 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
            {/* Timeline line */}
            <div className="absolute left-[18px] top-2 bottom-2 w-px bg-white/5" />
            {filtered.map((l) => {
              const actor = ACTOR_META[l.actorType] || ACTOR_META.system
              const action = ACTION_META[l.action] || { icon: Activity, color: "text-zinc-400", label: l.action }
              const ActorIcon = actor.icon
              const ActionIcon = action.icon
              return (
                <div key={l.id} className="relative flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 pl-10 hover:bg-white/[0.04]">
                  {/* Timeline node */}
                  <div className={`absolute left-2 top-3 flex h-4 w-4 items-center justify-center rounded-full ${actor.bg} ring-4 ring-[#0d1218]`}>
                    <ActorIcon className={`h-2.5 w-2.5 ${actor.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ActionIcon className={`h-3.5 w-3.5 ${action.color}`} />
                      <span className="text-xs font-medium text-white">{action.label}</span>
                      <Badge variant="outline" className={`border-white/10 ${actor.bg} text-[9px] ${actor.color}`}>{actor.label}</Badge>
                      {l.target && <span className="truncate font-mono text-[10px] text-zinc-500">→ {l.target}</span>}
                    </div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-zinc-500">
                      <span>{timeLabel(l.time)}</span>
                      <span>·</span>
                      <span>{timeAgo(l.time)}</span>
                      {l.actorId && <><span>·</span><span className="truncate">by {l.actorId.slice(-12)}</span></>}
                    </div>
                    {l.metadata && Object.keys(l.metadata).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {Object.entries(l.metadata).slice(0, 4).map(([k, v]) => (
                          <span key={k} className="rounded bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9px] text-zinc-500">{k}: {String(v).slice(0, 24)}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Compliance note */}
      <Card className="border-blue-500/20 bg-blue-500/[0.03] p-4">
        <div className="flex items-start gap-2 text-[11px] text-blue-200/80">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <span className="font-semibold">Compliance-ready:</span> Every security-relevant action (secret vaulting, agent creation, tool invocation, repo scanning) is written to an immutable audit log scoped to your organization. Export as CSV for SOC2 / ISO 27001 / GDPR evidence. Logs are never deleted — only appended.
          </div>
        </div>
      </Card>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, color }: { icon: typeof User; label: string; value: number; color: string }) {
  return (
    <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-4">
      <div className="flex items-center justify-between">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="font-mono text-2xl font-bold text-white">{value.toLocaleString()}</span>
      </div>
      <div className="mt-2 text-[11px] text-zinc-400">{label}</div>
    </Card>
  )
}
