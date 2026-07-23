"use client"
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { api, DecisionBadge, RiskBadge } from "./shared"
import { Bug, Play, ShieldCheck, Skull, AlertTriangle, Syringe, KeyRound, Bot, Activity, Loader2, Flame } from "lucide-react"

interface Scenario { id: string; type: "prompt_injection" | "malicious_mcp" | "stolen_token" | "rogue_agent"; title: string; description: string; payload: string; expectedDefense: string }
interface AttackResult { scenario: Scenario; blocked: boolean; decision: string; reason: string; riskScore: number; riskLevel: "low" | "medium" | "high" | "critical"; inputFlags: string[] }
interface AttackTest { id: string; type: string; description: string; payload: string; result: string; severity: string; defense: string | null; createdAt: string }

const TYPE_META: Record<string, { icon: typeof Bug; color: string; label: string }> = {
  prompt_injection: { icon: Syringe, color: "text-violet-400 bg-violet-500/10", label: "Prompt Injection" },
  malicious_mcp: { icon: Skull, color: "text-red-400 bg-red-500/10", label: "Malicious MCP" },
  stolen_token: { icon: KeyRound, color: "text-amber-400 bg-amber-500/10", label: "Stolen Token" },
  rogue_agent: { icon: Bot, color: "text-orange-400 bg-orange-500/10", label: "Rogue Agent" },
}

export function Attacks() {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [history, setHistory] = useState<AttackTest[]>([])
  const [running, setRunning] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, AttackResult>>({})

  useEffect(() => { api<{ scenarios: Scenario[]; history: AttackTest[] }>("/api/attacks").then((d) => { setScenarios(d.scenarios); setHistory(d.history) }) }, [])

  const run = async (s: Scenario) => {
    setRunning(s.id)
    try {
      const r = await api<AttackResult>("/api/attacks/run", { method: "POST", body: JSON.stringify({ scenarioId: s.id }) })
      setResults((p) => ({ ...p, [s.id]: r }))
      if (r.blocked) toast.success(`✓ BLOCKED — ${s.title}`)
      else toast.error(`✗ ATTACK SUCCEEDED — ${s.title}`)
      // refresh history
      api<{ history: AttackTest[] }>("/api/attacks").then((d) => setHistory(d.history))
    } catch (e) { toast.error((e as Error).message) } finally { setRunning(null) }
  }

  const runAll = async () => {
    for (const s of scenarios) { await run(s) }
    toast.success("All attack scenarios executed")
  }

  const blockedCount = Object.values(results).filter((r) => r.blocked).length
  const ranCount = Object.keys(results).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Flame className="h-5 w-5 text-red-400" /><h2 className="text-2xl font-light tracking-tight text-white">Red Team Lab</h2></div>
          <p className="text-xs text-zinc-400">Simulated attacks: prompt injection, malicious MCP, stolen token, rogue agent. Verify the gateway blocks them all.</p>
        </div>
        <Button onClick={runAll} disabled={!!running} className="bg-red-600 text-white hover:bg-red-500"><Play className="mr-1.5 h-4 w-4" />Run All Attacks</Button>
      </div>

      {/* Summary */}
      {ranCount > 0 && (
        <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.05] p-4"><div className="font-mono text-3xl font-bold text-blue-400">{blockedCount}</div><div className="text-[11px] text-zinc-400">Blocked</div></div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] p-4"><div className="font-mono text-3xl font-bold text-red-400">{ranCount - blockedCount}</div><div className="text-[11px] text-zinc-400">Slipped Through</div></div>
            <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4"><div className="font-mono text-3xl font-bold text-white">{ranCount}</div><div className="text-[11px] text-zinc-400">Total Run</div></div>
          </div>
        </Card>
      )}

      {/* Scenarios */}
      <div className="grid gap-4 lg:grid-cols-2">
        {scenarios.map((s) => {
          const meta = TYPE_META[s.type]
          const Icon = meta.icon
          const r = results[s.id]
          return (
            <Card key={s.id} className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5">
              <div className="flex items-start gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${meta.color}`}><Icon className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><h3 className="font-semibold text-white">{s.title}</h3><Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[9px] text-zinc-400">{meta.label}</Badge></div>
                  <p className="mt-1 text-xs text-zinc-400">{s.description}</p>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-white/5 bg-[#070a0f] p-3">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Payload</div>
                <pre className="overflow-x-auto font-mono text-[11px] text-red-300">{s.payload}</pre>
              </div>
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-blue-500/15 bg-blue-500/[0.03] p-2.5 text-[11px] text-blue-300/80">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span><span className="font-semibold">Expected defense:</span> {s.expectedDefense}</span>
              </div>

              {r && (
                <div className={`mt-3 rounded-lg border p-3 ${r.blocked ? "border-blue-500/30 bg-blue-500/[0.07]" : "border-red-500/30 bg-red-500/[0.07]"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {r.blocked ? <ShieldCheck className="h-4 w-4 text-blue-400" /> : <AlertTriangle className="h-4 w-4 text-red-400" />}
                      <span className="font-mono text-sm font-bold text-white">{r.blocked ? "BLOCKED" : "BREACHED"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <RiskBadge level={r.riskLevel} score={r.riskScore} />
                      <DecisionBadge decision={r.decision} />
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-zinc-300">{r.reason}</div>
                  {r.inputFlags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{r.inputFlags.map((f) => <Badge key={f} variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-300">{f}</Badge>)}</div>}
                </div>
              )}

              <Button onClick={() => run(s)} disabled={running === s.id} className="mt-3 w-full bg-red-600/90 text-white hover:bg-red-500">
                {running === s.id ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Executing attack…</> : <><Bug className="mr-1.5 h-4 w-4" />Execute Attack</>}
              </Button>
            </Card>
          )
        })}
      </div>

      {/* History */}
      <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5">
        <div className="mb-4 flex items-center gap-2"><Activity className="h-4 w-4 text-blue-400" /><h3 className="text-sm font-medium tracking-tight text-white">Attack History</h3></div>
        <div className="max-h-96 space-y-1.5 overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
          {history.map((t) => {
            const meta = TYPE_META[t.type] || TYPE_META.prompt_injection
            const Icon = meta.icon
            return (
              <div key={t.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                <Icon className={`h-3.5 w-3.5 ${meta.color.split(" ")[0]}`} />
                <div className="min-w-0 flex-1"><div className="truncate font-mono text-[11px] text-zinc-200">{t.description}</div><div className="truncate text-[10px] text-zinc-500">{t.defense || "—"}</div></div>
                <Badge variant="outline" className={`text-[9px] uppercase ${t.result === "blocked" ? "border-blue-500/30 bg-blue-500/10 text-blue-400" : "border-red-500/30 bg-red-500/10 text-red-400"}`}>{t.result}</Badge>
              </div>
            )
          })}
          {history.length === 0 && <div className="rounded-lg border border-dashed border-white/5 py-8 text-center text-xs text-zinc-500">No attacks executed yet.</div>}
        </div>
      </Card>
    </div>
  )
}
