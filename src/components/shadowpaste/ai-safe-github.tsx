"use client"
import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { toast } from "sonner"
import { api, GradeBadge, ScoreRing } from "./shared"
import { Github, Zap, ShieldCheck, ShieldAlert, FileWarning, KeyRound, Settings2, Loader2, Sparkles, ArrowRight } from "lucide-react"

interface Finding { type: "secret" | "permission" | "config" | "dependency"; severity: "low" | "medium" | "high" | "critical"; file: string; line: number; message: string; evidence: string }
interface ScanResult { ok: boolean; projectId: string; scanId: string; repoUrl: string; repoName: string; files: string[]; findings: Finding[]; secretsCount: number; permissionsCount: number; configsCount: number; score: number; grade: string }

export function AiSafeGithub({ authed = true, onRequireAuth, onProtect }: { authed?: boolean; onRequireAuth?: () => void; onProtect?: () => void } = {}) {
  const [repoUrl, setRepoUrl] = useState("https://github.com/acme/platform")
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)

  const scan = async () => {
    if (!authed) { onRequireAuth?.(); return }
    setScanning(true); setResult(null)
    try {
      const r = await api<ScanResult>("/api/scan", { method: "POST", body: JSON.stringify({ repoUrl }) })
      setResult(r); toast.success(`AI Safety Report ready — score ${r.score}/100`)
    } catch (e) {
      const msg = (e as Error).message
      if (msg.startsWith("401")) { onRequireAuth?.(); toast.error("Please sign in to scan a repo.") }
      else toast.error(msg)
    } finally { setScanning(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-light tracking-tight text-white">AI Safe GitHub</h2>
        <p className="text-xs text-zinc-400">One click — "Make Repo AI Safe". We scan for secrets, dangerous permissions, and unsafe configs.</p>
      </div>

      {/* Big CTA */}
      <Card className="relative overflow-hidden border-blue-500/20 bg-gradient-to-br from-blue-500/[0.07] via-[#0d1218] to-[#0d1218] p-6">
        <div className="absolute right-0 top-0 h-full w-1/3 opacity-20" style={{ background: "radial-gradient(circle at 70% 30%, rgba(59,109,255,0.5), transparent 60%)" }} />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-sky-600 shadow-lg shadow-blue-500/20"><Github className="h-7 w-7 text-white" /></div>
            <div>
              <h3 className="font-mono text-xl font-bold text-white">Make Repo AI Safe</h3>
              <p className="text-xs text-zinc-400">Connect GitHub → instant AI safety report</p>
            </div>
          </div>
          <div className="flex w-full max-w-md items-center gap-2">
            <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo" className="border-white/10 bg-white/[0.03] font-mono text-xs" />
            <Button onClick={scan} disabled={scanning} className="bg-blue-600 text-white hover:bg-blue-500 shrink-0">
              {scanning ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Scanning…</> : <><Zap className="mr-1.5 h-4 w-4" />Scan</>}
            </Button>
          </div>
        </div>
      </Card>

      {scanning && (
        <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-6">
          <div className="space-y-3">
            {["Cloning repo metadata", "Scanning for hardcoded secrets", "Auditing IAM permissions", "Inspecting unsafe configs", "Computing AI Safety Score"].map((s, i) => (
              <div key={s} className="flex items-center gap-3">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full ${i < 3 ? "bg-blue-500/15 text-blue-400" : "bg-white/[0.03] text-zinc-500"}`}>
                  {i < 3 ? <ShieldCheck className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
                </div>
                <span className={`font-mono text-xs ${i < 3 ? "text-zinc-200" : "text-zinc-500"}`}>{s}</span>
              </div>
            ))}
            <Progress value={60} className="h-1.5 bg-white/5 [&>div]:bg-blue-500" />
          </div>
        </Card>
      )}

      {result && (
        <div className="space-y-6">
          {/* Score header */}
          <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-6">
            <div className="flex flex-col items-center gap-6 lg:flex-row">
              <ScoreRing score={result.score} size={140} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Github className="h-4 w-4 text-blue-400" />
                  <span className="font-mono text-sm text-white">{result.repoName}</span>
                  <GradeBadge score={result.score} />
                </div>
                <p className="mt-1 text-xs text-zinc-400">{result.repoUrl}</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <FindingStat icon={KeyRound} label="Secrets" value={result.secretsCount} color="text-red-400" />
                  <FindingStat icon={ShieldAlert} label="Permissions" value={result.permissionsCount} color="text-orange-400" />
                  <FindingStat icon={Settings2} label="Configs" value={result.configsCount} color="text-amber-400" />
                </div>
              </div>
              <Button onClick={onProtect} className="bg-blue-600 text-white hover:bg-blue-500"><Sparkles className="mr-1.5 h-4 w-4" />Protect a local copy</Button>
            </div>
          </Card>

          {/* Findings */}
          <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5">
            <div className="mb-4 flex items-center gap-2"><FileWarning className="h-4 w-4 text-amber-400" /><h3 className="text-sm font-medium tracking-tight text-white">AI Safety Findings ({result.findings.length})</h3></div>
            <div className="space-y-2">
              {result.findings.map((f, i) => (
                <div key={i} className="flex items-start gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${f.type === "secret" ? "bg-red-500/10 text-red-400" : f.type === "permission" ? "bg-orange-500/10 text-orange-400" : "bg-amber-500/10 text-amber-400"}`}>
                    {f.type === "secret" ? <KeyRound className="h-3.5 w-3.5" /> : f.type === "permission" ? <ShieldAlert className="h-3.5 w-3.5" /> : <Settings2 className="h-3.5 w-3.5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-white">{f.message}</span>
                      <Badge variant="outline" className={`text-[9px] uppercase ${f.severity === "critical" ? "border-red-500/30 bg-red-500/10 text-red-400" : f.severity === "high" ? "border-orange-500/30 bg-orange-500/10 text-orange-400" : f.severity === "medium" ? "border-amber-500/30 bg-amber-500/10 text-amber-400" : "border-white/10 text-zinc-400"}`}>{f.severity}</Badge>
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-zinc-500">{f.file}:{f.line}</div>
                    <div className="mt-1 rounded bg-[#070a0f] px-2 py-1 font-mono text-[10px] text-zinc-400">{f.evidence}</div>
                  </div>
                </div>
              ))}
              {result.findings.length === 0 && <div className="rounded-lg border border-blue-500/20 bg-blue-500/[0.05] py-6 text-center text-xs text-blue-300"><ShieldCheck className="mx-auto mb-1 h-5 w-5" />No findings — this repo is AI-safe!</div>}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

function FindingStat({ icon: Icon, label, value, color }: { icon: typeof KeyRound; label: string; value: number; color: string }) {
  return <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"><div className="flex items-center gap-1.5"><Icon className={`h-3 w-3 ${color}`} /><span className="text-2xl font-light tracking-tight text-white">{value}</span></div><div className="text-[10px] uppercase text-zinc-500">{label}</div></div>
}
