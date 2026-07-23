"use client"
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { api, DecisionBadge, RiskBadge, timeLabel } from "./shared"
import { Radio, Play, Pause, SkipForward, SkipBack, Clock, Activity, RotateCcw, ChevronRight, ArrowRight } from "lucide-react"

interface TimelineEvent { id: string; time: string; agentName: string; agentProvider: string; toolName: string; decision: string; riskLevel: "low" | "medium" | "high" | "critical"; riskScore: number; reason: string; input: Record<string, unknown>; output: Record<string, unknown> | null }
interface ReplayStep { index: number; time: string; label: string; detail: string; decision: string; riskLevel: string }

export function FlightRecorder() {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [steps, setSteps] = useState<ReplayStep[]>([])
  const [selected, setSelected] = useState<TimelineEvent | null>(null)
  const [playing, setPlaying] = useState(false)
  const [replayIdx, setReplayIdx] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([api<{ timeline: TimelineEvent[] }>("/api/audit?limit=80"), api<{ steps: ReplayStep[] }>("/api/audit/replay")])
      .then(([t, r]) => { setTimeline(t.timeline); setSteps(r.steps); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  // Replay player
  useEffect(() => {
    if (!playing || steps.length === 0) return
    if (replayIdx >= steps.length - 1) { setPlaying(false); return }
    const t = setTimeout(() => setReplayIdx((i) => i + 1), 1100)
    return () => clearTimeout(t)
  }, [playing, replayIdx, steps.length])

  const currentStep = steps[replayIdx]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-light tracking-tight text-white">AI Flight Recorder</h2>
        <p className="text-xs text-zinc-400">The AI black box — every action recorded. Replay mode lets you watch "what did the AI do?" step by step.</p>
      </div>

      {/* Replay player */}
      <Card className="relative overflow-hidden border-blue-500/20 bg-gradient-to-br from-blue-500/[0.05] to-[#0d1218] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2"><RotateCcw className="h-4 w-4 text-blue-400" /><h3 className="text-sm font-medium tracking-tight text-white">Replay Mode</h3>
            {playing && <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-400"><span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />PLAYING</Badge>}
          </div>
          <div className="font-mono text-xs text-zinc-400">Step {Math.min(replayIdx + 1, steps.length)} / {steps.length}</div>
        </div>

        {steps.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/5 py-8 text-center text-xs text-zinc-500">No recorded sessions yet. Invoke tools in the MCP Gateway to populate the recorder.</div>
        ) : (
          <>
            {/* Replay track */}
            <div className="relative mb-4 h-2 rounded-full bg-white/5">
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-sky-400 transition-all" style={{ width: `${steps.length ? ((replayIdx + 1) / steps.length) * 100 : 0}%` }} />
            </div>
            {currentStep && (
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2 font-mono text-xs">
                  <Clock className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-zinc-400">{timeLabel(currentStep.time)}</span>
                  <ArrowRight className="h-3 w-3 text-zinc-600" />
                  <span className="text-white">{currentStep.label}</span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <DecisionBadge decision={currentStep.decision} />
                  <RiskBadge level={currentStep.riskLevel as "low" | "medium" | "high" | "critical"} />
                </div>
                <div className="mt-2 text-xs text-zinc-400">{currentStep.detail}</div>
              </div>
            )}
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setReplayIdx(0)} className="border-white/10"><SkipBack className="h-4 w-4" /></Button>
              <Button size="sm" onClick={() => setPlaying(!playing)} className="bg-blue-600 text-white hover:bg-blue-500">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button>
              <Button size="sm" variant="outline" onClick={() => setReplayIdx((i) => Math.min(i + 1, steps.length - 1))} className="border-white/10"><SkipForward className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" onClick={() => { setReplayIdx(0); setPlaying(false) }} className="ml-2 border-white/10"><RotateCcw className="h-4 w-4" /></Button>
            </div>
          </>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Timeline */}
        <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5 lg:col-span-3">
          <div className="mb-4 flex items-center gap-2"><Activity className="h-4 w-4 text-blue-400" /><h3 className="text-sm font-medium tracking-tight text-white">Action Timeline</h3></div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded bg-white/[0.02]" />)}</div>
          ) : (
            <div className="relative max-h-[600px] space-y-1 overflow-y-auto pr-2" style={{ scrollbarWidth: "thin" }}>
              {timeline.length === 0 && <div className="rounded-lg border border-dashed border-white/5 py-8 text-center text-xs text-zinc-500">No recorded actions yet.</div>}
              {timeline.map((e, i) => (
                <button key={e.id} onClick={() => setSelected(e)} className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${selected?.id === e.id ? "border-blue-500/30 bg-blue-500/[0.05]" : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"}`}>
                  <div className="flex flex-col items-center">
                    <span className="font-mono text-[10px] text-zinc-500">{timeLabel(e.time)}</span>
                    {i < timeline.length - 1 && <span className="mt-1 h-4 w-px bg-white/10" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-xs text-zinc-300">{e.agentName}</span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-zinc-600" />
                      <span className="truncate font-mono text-xs text-blue-400">{e.toolName}</span>
                    </div>
                    <div className="truncate text-[10px] text-zinc-500">{e.reason}</div>
                  </div>
                  <DecisionBadge decision={e.decision} />
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Event detail */}
        <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5 lg:col-span-2">
          <div className="mb-3 flex items-center gap-2"><Radio className="h-4 w-4 text-blue-400" /><h3 className="text-sm font-medium tracking-tight text-white">Event Detail</h3></div>
          {selected ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                <div className="font-mono text-xs text-blue-400">{selected.toolName}</div>
                <div className="mt-1 text-[11px] text-zinc-400">{selected.agentName} ({selected.agentProvider})</div>
                <div className="mt-1 text-[11px] text-zinc-500">{new Date(selected.time).toLocaleString()}</div>
              </div>
              <div className="flex items-center gap-2">
                <DecisionBadge decision={selected.decision} />
                <RiskBadge level={selected.riskLevel} score={selected.riskScore} />
              </div>
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-3 text-[11px] text-amber-200/80">{selected.reason}</div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Input</div>
                <pre className="max-h-40 overflow-auto rounded-lg border border-white/5 bg-[#070a0f] p-3 font-mono text-[10px] text-sky-300">{JSON.stringify(selected.input, null, 2)}</pre>
              </div>
              {selected.output && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Output</div>
                  <pre className="max-h-40 overflow-auto rounded-lg border border-white/5 bg-[#070a0f] p-3 font-mono text-[10px] text-blue-300">{JSON.stringify(selected.output, null, 2)}</pre>
                </div>
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-zinc-500">Select an event from the timeline</div>
          )}
        </Card>
      </div>
    </div>
  )
}
