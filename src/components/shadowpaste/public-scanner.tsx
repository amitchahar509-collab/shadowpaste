"use client"
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { api, GradeBadge, ScoreRing } from "./shared"
import { Globe, Zap, Share2, KeyRound, ShieldAlert, Settings2, Lock, Loader2, TrendingUp, ExternalLink, Github } from "lucide-react"

interface Scan { id: string; repoUrl: string; repoName: string; score: number; secrets: number; permissions: number; configs: number; findings: string; shareId: string; createdAt: string }
interface ScanResult { ok: boolean; scan: Scan; findings: Array<{ type: string; severity: string; file: string; line: number; message: string; evidence: string }>; secretsCount: number; permissionsCount: number; configsCount: number; score: number; grade: string }

export function PublicScanner() {
  const [repoUrl, setRepoUrl] = useState("https://github.com/acme/platform")
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [recent, setRecent] = useState<Scan[]>([])

  const loadRecent = () => { api<{ scans: Scan[] }>("/api/public-scan").then((d) => setRecent(d.scans)) }
  useEffect(() => { loadRecent() }, [])

  const scan = async () => {
    setScanning(true); setResult(null)
    try {
      const r = await api<ScanResult>("/api/public-scan", { method: "POST", body: JSON.stringify({ repoUrl }) })
      setResult(r); toast.success(`Scan complete — score ${r.score}/100`); loadRecent()
    } catch (e) { toast.error((e as Error).message) } finally { setScanning(false) }
  }

  const share = (shareId: string) => {
    const url = `${window.location.origin}/#share=${shareId}`
    navigator.clipboard.writeText(url); toast.success("Share link copied!")
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-400"><Lock className="mr-1 h-3 w-3" />NO LOGIN REQUIRED</Badge>
          <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[10px] text-zinc-400">FREE FOREVER</Badge>
        </div>
        <h2 className="mt-2 text-2xl font-light tracking-tight text-white">Public AI Safety Scanner</h2>
        <p className="text-xs text-zinc-400">Drop a GitHub URL → instant AI safety scan → score → share. The viral growth loop.</p>
      </div>

      {/* Hero scanner */}
      <Card className="relative overflow-hidden border-blue-500/20 bg-gradient-to-br from-blue-500/[0.08] via-[#0d1218] to-[#0d1218] p-8">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 30% 20%, rgba(59,109,255,0.4), transparent 50%)" }} />
        <div className="relative mx-auto max-w-2xl text-center">
          <Globe className="mx-auto mb-3 h-10 w-10 text-blue-400" />
          <h3 className="font-mono text-2xl font-bold text-white">Is your repo AI-safe?</h3>
          <p className="mt-1 text-sm text-zinc-400">Free instant scan. No account needed.</p>
          <div className="mt-5 flex items-center gap-2">
            <div className="relative flex-1">
              <Github className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="github.com/owner/repo" className="border-white/10 bg-white/[0.05] pl-9 font-mono text-sm" onKeyDown={(e) => e.key === "Enter" && scan()} />
            </div>
            <Button onClick={scan} disabled={scanning} size="lg" className="bg-blue-600 text-white hover:bg-blue-500">{scanning ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Zap className="mr-1.5 h-4 w-4" />}{scanning ? "Scanning" : "Scan"}</Button>
          </div>
          <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1"><KeyRound className="h-3 w-3" />Secrets</span>
            <span className="flex items-center gap-1"><ShieldAlert className="h-3 w-3" />Permissions</span>
            <span className="flex items-center gap-1"><Settings2 className="h-3 w-3" />Configs</span>
          </div>
        </div>
      </Card>

      {result && (
        <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-6">
          <div className="flex flex-col items-center gap-6 lg:flex-row lg:justify-between">
            <div className="flex items-center gap-5">
              <ScoreRing score={result.score} size={120} />
              <div>
                <div className="flex items-center gap-2"><Github className="h-4 w-4 text-blue-400" /><span className="font-mono text-sm text-white">{result.scan.repoName}</span></div>
                <div className="mt-1 flex items-center gap-2"><span className="font-mono text-3xl font-bold text-blue-400">{result.score}</span><span className="text-zinc-500">/100</span><GradeBadge score={result.score} /></div>
                <div className="mt-2 flex gap-2">
                  <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-[10px] text-red-400">{result.secretsCount} secrets</Badge>
                  <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 text-[10px] text-orange-400">{result.permissionsCount} perms</Badge>
                  <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-400">{result.configsCount} configs</Badge>
                </div>
              </div>
            </div>
            <Button onClick={() => share(result.scan.shareId)} className="bg-blue-600 text-white hover:bg-blue-500"><Share2 className="mr-1.5 h-4 w-4" />Share Result</Button>
          </div>
        </Card>
      )}

      {/* Recent public scans — viral leaderboard */}
      <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5">
        <div className="mb-4 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-400" /><h3 className="text-sm font-medium tracking-tight text-white">Recently Scanned Repos</h3></div>
        <div className="space-y-2">
          {recent.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg font-mono text-sm font-bold ${s.score >= 80 ? "bg-blue-500/10 text-blue-400" : s.score >= 60 ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>{s.score}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs text-white">{s.repoName}</div>
                <div className="truncate text-[10px] text-zinc-500">{s.repoUrl}</div>
              </div>
              <div className="hidden gap-2 sm:flex">
                {s.secrets > 0 && <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-[10px] text-red-400">{s.secrets} secrets</Badge>}
                {s.permissions > 0 && <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 text-[10px] text-orange-400">{s.permissions} perms</Badge>}
              </div>
              <Button size="sm" variant="ghost" onClick={() => share(s.shareId)} className="text-zinc-400 hover:text-blue-400"><ExternalLink className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
          {recent.length === 0 && <div className="rounded-lg border border-dashed border-white/5 py-8 text-center text-xs text-zinc-500">No public scans yet. Be the first!</div>}
        </div>
      </Card>

      {/* Growth loop explanation */}
      <Card className="border-violet-500/20 bg-gradient-to-br from-violet-500/[0.05] to-[#0d1218] p-5">
        <div className="font-mono text-xs text-violet-300">GROWTH LOOP</div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          {["Developer scans repo", "Gets AI Safety Score", "Shares badge on Twitter/LinkedIn", "Peers click → scan their repos", "ShadowPaste promoted"].map((s, i, arr) => (
            <div key={s} className="flex items-center gap-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-zinc-300">{s}</div>
              {i < arr.length - 1 && <span className="text-violet-400">→</span>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
