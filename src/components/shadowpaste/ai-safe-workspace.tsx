"use client"
import { useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { api } from "./shared"
import {
  FolderLock, Loader2, ShieldCheck, KeyRound, Copy, RotateCcw, Sparkles,
  FolderOpen, TerminalSquare, ArrowRight, Lock, UploadCloud, FileArchive,
} from "lucide-react"

interface WsSecret { filePath: string; line: number; fake: string; provider: string; vaulted: boolean }
interface CreateResult {
  ok: boolean
  workspace: { id: string; workspacePath: string; fileCount: number; secretCount: number; secrets: WsSecret[] }
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-[#070a0f] px-3 py-2">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
        <div className="truncate font-mono text-xs text-zinc-200">{value}</div>
      </div>
      <Button
        size="sm" variant="ghost"
        onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied") }}
        className="shrink-0 text-zinc-400 hover:text-emerald-300"
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// The flagship local flow: point at a project folder → Protect (create an
// AI-safe copy with fake secrets) → open it in your AI tool → Restore.
export function AiSafeWorkspace({ authed, onRequireAuth }: { authed: boolean; onRequireAuth: () => void }) {
  const [sourcePath, setSourcePath] = useState("")
  const [busy, setBusy] = useState(false)
  const [ws, setWs] = useState<CreateResult["workspace"] | null>(null)
  const [restored, setRestored] = useState<{ restored: number; sourcePath: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const protect = async () => {
    if (!authed) { onRequireAuth(); return }
    if (!sourcePath.trim()) { toast.error("Enter the full path to your project folder"); return }
    setBusy(true); setWs(null); setRestored(null)
    try {
      const r = await api<CreateResult>("/api/workspace/create", { method: "POST", body: JSON.stringify({ sourcePath }) })
      setWs(r.workspace)
      toast.success(`Protected — ${r.workspace.secretCount} secret(s) replaced with fakes`)
    } catch (e) {
      const msg = (e as Error).message
      if (msg.startsWith("401")) onRequireAuth()
      toast.error(friendly(msg))
    } finally { setBusy(false) }
  }

  // ZIP import: multipart upload, so we call fetch directly rather than the
  // JSON `api()` helper (which forces a JSON content-type and would clobber the
  // multipart boundary).
  const importZip = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) return
    if (!authed) { onRequireAuth(); return }
    if (!file.name.toLowerCase().endsWith(".zip")) { toast.error("Please choose a .zip archive"); return }
    setBusy(true); setWs(null); setRestored(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/workspace/import", { method: "POST", body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401) onRequireAuth()
        throw new Error(`${res.status} ${data.error || res.statusText}`)
      }
      setWs(data.workspace)
      toast.success(`Imported ${file.name} — ${data.workspace.secretCount} secret(s) replaced with fakes`)
    } catch (e) {
      toast.error(friendly((e as Error).message))
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = "" // allow re-selecting the same file
    }
  }

  const restore = async () => {
    if (!ws) return
    setBusy(true)
    try {
      const r = await api<{ ok: boolean; restored: number; sourcePath: string }>("/api/workspace/restore", {
        method: "POST", body: JSON.stringify({ workspacePath: ws.workspacePath }),
      })
      setRestored({ restored: r.restored, sourcePath: r.sourcePath })
      toast.success(`Restored ${r.restored} secret(s) to your project`)
    } catch (e) { toast.error(friendly((e as Error).message)) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-mono text-lg font-bold text-white">AI-Safe Workspace</h2>
        <p className="text-xs text-zinc-400">
          Let AI code your <span className="text-emerald-300">real repo</span> without exposing secrets. Protect → open in your AI tool → Restore.
        </p>
      </div>

      {/* Step 1 — Protect */}
      <Card className="relative overflow-hidden border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-[#0d1218] to-[#0d1218] p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20"><FolderLock className="h-7 w-7 text-white" /></div>
          <div>
            <div className="flex items-center gap-2"><Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">STEP 1</Badge><h3 className="font-mono text-xl font-bold text-white">Protect a project</h3></div>
            <p className="text-xs text-zinc-400">Enter the full path to a project folder on this machine.</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && protect()}
            placeholder="/home/you/my-project   (or  C:\\Users\\you\\my-project)"
            className="border-white/10 bg-white/[0.03] font-mono text-xs"
          />
          <Button onClick={protect} disabled={busy} className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-500">
            {busy && !ws ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Protecting…</> : <><ShieldCheck className="mr-1.5 h-4 w-4" />Protect</>}
          </Button>
        </div>
        {!authed && (
          <p className="mt-2 text-[11px] text-amber-400/90">You'll be asked to sign in first — protect writes to your machine and vaults your secrets.</p>
        )}
        <p className="mt-2 text-[11px] text-zinc-500">
          The folder must be inside an allowed root. Default: your home directory (<span className="font-mono text-zinc-400">{"~"}</span>). Set <span className="font-mono text-zinc-400">SHADOWPASTE_PROJECT_ROOTS</span> to permit locations outside it.
        </p>

        {/* — or upload a ZIP — */}
        <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wide text-zinc-600">
          <div className="h-px flex-1 bg-white/5" /> or upload a zip <div className="h-px flex-1 bg-white/5" />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(e) => importZip(e.target.files)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => { if (!authed) { onRequireAuth(); return } fileInputRef.current?.click() }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!authed) { onRequireAuth(); return } importZip(e.dataTransfer.files) }}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition ${
            dragOver ? "border-emerald-400/60 bg-emerald-500/[0.08]" : "border-white/10 bg-white/[0.02] hover:border-emerald-500/30 hover:bg-white/[0.04]"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
          ) : (
            <UploadCloud className="h-6 w-6 text-emerald-400" />
          )}
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-200">
            <FileArchive className="h-3.5 w-3.5 text-zinc-400" />
            {busy ? "Protecting…" : "Drop a .zip here, or click to browse"}
          </div>
          <p className="text-[11px] text-zinc-500">No filesystem path needed — the archive is scanned in place, then discarded. Max 100 MB.</p>
        </button>
      </Card>

      {/* Result */}
      {ws && (
        <>
          <Card className="border-white/5 bg-[#0d1218] p-5">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <h3 className="font-mono text-sm font-semibold text-white">Workspace ready</h3>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">{ws.secretCount} secret(s) vaulted</Badge>
              <Badge variant="outline" className="border-white/10 text-[10px] text-zinc-400">{ws.fileCount} files</Badge>
            </div>
            <CopyRow label="AI-safe workspace path" value={ws.workspacePath} />

            {/* Step 2 — open in AI tool */}
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2"><Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[10px] text-zinc-400">STEP 2</Badge><span className="flex items-center gap-1.5 text-xs text-zinc-300"><FolderOpen className="h-3.5 w-3.5 text-emerald-400" />Open the workspace in your AI tool</span></div>
              <div className="space-y-1.5">
                <CopyRow label="Claude Code" value={`claude "${ws.workspacePath}"`} />
                <CopyRow label="Cursor" value={`cursor "${ws.workspacePath}"`} />
                <CopyRow label="VS Code" value={`code "${ws.workspacePath}"`} />
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">The AI sees format-compatible fakes. Code runs, tests pass, and no real secret is exposed.</p>
            </div>

            {/* Secrets table */}
            {ws.secrets.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-1.5 text-xs text-zinc-300"><KeyRound className="h-3.5 w-3.5 text-amber-400" />Replaced secrets</div>
                <div className="space-y-1">
                  {ws.secrets.map((s, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[11px] text-zinc-200">{s.filePath}:{s.line}</div>
                        <div className="truncate font-mono text-[10px] text-zinc-500">→ {s.fake}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px] uppercase text-zinc-400">{s.provider}</Badge>
                        {s.vaulted && <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300"><Lock className="mr-0.5 h-2.5 w-2.5" />vaulted</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Step 3 — Restore */}
          <Card className="border-white/5 bg-[#0d1218] p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10"><RotateCcw className="h-5 w-5 text-emerald-400" /></div>
                <div>
                  <div className="flex items-center gap-2"><Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[10px] text-zinc-400">STEP 3</Badge><span className="font-mono text-sm font-semibold text-white">Restore when done</span></div>
                  <p className="text-xs text-zinc-400">Copies AI edits back to your project and swaps fakes for the real secrets.</p>
                </div>
              </div>
              <Button onClick={restore} disabled={busy} className="shrink-0 bg-emerald-600 text-white hover:bg-emerald-500">
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}Restore secrets
              </Button>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/5 bg-[#070a0f] px-3 py-2 text-[11px] text-zinc-400">
              <TerminalSquare className="h-3.5 w-3.5 text-zinc-500" />
              <span>CLI equivalent:</span>
              <span className="font-mono text-zinc-300">shadowpaste restore</span>
            </div>
            {restored && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-xs text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
                Restored {restored.restored} secret(s) to <span className="font-mono">{restored.sourcePath}</span> — AI edits preserved. Ready to commit.
              </div>
            )}
          </Card>
        </>
      )}

      {/* Empty-state helper */}
      {!ws && !busy && (
        <Card className="border-white/5 bg-[#0d1218] p-5">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <ArrowRight className="h-3.5 w-3.5 text-emerald-400" />
            Prefer the terminal? Run <span className="font-mono text-zinc-200">shadowpaste protect -p /path/to/project</span>, then <span className="font-mono text-zinc-200">shadowpaste restore</span>.
          </div>
        </Card>
      )}
    </div>
  )
}

function friendly(msg: string): string {
  if (msg.startsWith("401")) return "Please sign in first."
  if (msg.startsWith("429")) return "Rate limited — wait a moment and try again."
  return msg
}
