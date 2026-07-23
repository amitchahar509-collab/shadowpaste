"use client"
import { useEffect, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import {
  Loader2, ShieldCheck, KeyRound, Copy, RotateCcw, Sparkles, FolderOpen, TerminalSquare,
  Lock, UploadCloud, FileArchive, FolderUp, HardDrive, GitBranch, Github, X, Clock,
  Boxes, GitFork, Server, ArrowRight,
} from "lucide-react"
import { ProjectHealthReport, type Intelligence } from "./project-health-report"

interface WsSecret { filePath: string; line: number; fake: string; provider: string; vaulted: boolean }
interface Stack {
  languages: string[]; frameworks: string[]; packageManagers: string[]
  dependencyCount: number; hasGit: boolean; hasDocker: boolean; isMonorepo: boolean; isWorkspace: boolean; projectType: string
}
interface Workspace { id: string; workspacePath: string; fileCount: number; secretCount: number; secrets: WsSecret[] }
interface ImportResult { ok: boolean; source: string; duplicate?: boolean; stack?: Stack | null; intelligence?: Intelligence | null; workspace: Workspace }
interface RecentProject { name: string; workspacePath: string; source: string; fileCount: number; secretCount: number; intelligence: Intelligence | null; when: number }

const RECENT_KEY = "shadowpaste.recent.v1"
type Method = "upload" | "path" | "git"

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/40 px-3 py-2">
      <div className="min-w-0">
        <div className="label-thin text-zinc-500">{label}</div>
        <div className="truncate font-mono text-xs text-zinc-200">{value}</div>
      </div>
      <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copied") }} className="shrink-0 text-zinc-400 hover:text-blue-300">
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// Read a DataTransfer (drag-drop) into a flat list of files + relative paths,
// recursing into directory entries. Enables true drag-&-drop of a folder.
async function readDataTransfer(dt: DataTransfer): Promise<{ files: File[]; paths: string[]; hasFolder: boolean }> {
  const out = { files: [] as File[], paths: [] as string[], hasFolder: false }
  const roots: FileSystemEntry[] = []
  for (let i = 0; i < dt.items.length; i++) {
    const entry = (dt.items[i] as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null }).webkitGetAsEntry?.()
    if (entry) roots.push(entry)
  }
  const readAll = (reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> =>
    new Promise((resolve) => {
      const acc: FileSystemEntry[] = []
      const step = () => reader.readEntries((ents) => { if (!ents.length) resolve(acc); else { acc.push(...ents); step() } }, () => resolve(acc))
      step()
    })
  const walk = async (entry: FileSystemEntry, prefix: string) => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
      out.files.push(file); out.paths.push(prefix + entry.name)
    } else if (entry.isDirectory) {
      out.hasFolder = true
      const ents = await readAll((entry as FileSystemDirectoryEntry).createReader())
      for (const e of ents) await walk(e, prefix + entry.name + "/")
    }
  }
  if (roots.length) { for (const r of roots) await walk(r, "") }
  else { for (let i = 0; i < dt.files.length; i++) { out.files.push(dt.files[i]); out.paths.push(dt.files[i].name) } }
  return out
}

const ARCHIVE_RE = /\.(zip|tar\.gz|tgz|tar|gz)$/i

export function AiSafeWorkspace({ authed, onRequireAuth }: { authed: boolean; onRequireAuth: () => void }) {
  const [method, setMethod] = useState<Method>("upload")
  const [sourcePath, setSourcePath] = useState("")
  const [gitUrl, setGitUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string>("")
  const [ws, setWs] = useState<Workspace | null>(null)
  const [intel, setIntel] = useState<Intelligence | null>(null)
  const [restored, setRestored] = useState<{ restored: number; sourcePath: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [recent, setRecent] = useState<RecentProject[]>([])
  const folderInputRef = useRef<HTMLInputElement>(null)
  const archiveInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    try { setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")) } catch { /* ignore */ }
  }, [])

  const pushRecent = (r: RecentProject) => {
    setRecent((prev) => {
      const next = [r, ...prev.filter((p) => p.workspacePath !== r.workspacePath)].slice(0, 6)
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const guard = () => { if (!authed) { onRequireAuth(); return false } return true }

  // One import pipeline for every method. Handles progress, cancel, errors.
  const run = async (label: string, url: string, init: RequestInit) => {
    if (!guard()) return
    const ctrl = new AbortController(); abortRef.current = ctrl
    setBusy(true); setProgress(label); setWs(null); setIntel(null); setRestored(null)
    try {
      const res = await fetch(url, { method: "POST", signal: ctrl.signal, ...init })
      const data = (await res.json().catch(() => ({}))) as ImportResult & { error?: string }
      if (!res.ok) { if (res.status === 401) onRequireAuth(); throw new Error(`${res.status} ${data.error || res.statusText}`) }
      setWs(data.workspace); setIntel(data.intelligence || null)
      pushRecent({
        name: data.intelligence?.name || data.workspace.workspacePath.split(/[\\/]/).pop() || "project",
        workspacePath: data.workspace.workspacePath, source: data.source,
        fileCount: data.workspace.fileCount, secretCount: data.workspace.secretCount, intelligence: data.intelligence || null, when: Date.now(),
      })
      if (data.duplicate) toast.info("A project with this name already existed — re-imported a fresh AI-safe copy.")
      toast.success(`Imported — ${data.workspace.secretCount} secret(s) replaced with fakes`)
    } catch (e) {
      const msg = (e as Error).message
      if ((e as Error).name === "AbortError") { toast.message("Import cancelled"); return }
      toast.error(friendly(msg))
    } finally { setBusy(false); setProgress(""); abortRef.current = null; resetFileInputs() }
  }

  const resetFileInputs = () => {
    if (folderInputRef.current) folderInputRef.current.value = ""
    if (archiveInputRef.current) archiveInputRef.current.value = ""
  }
  const cancel = () => abortRef.current?.abort()

  const protect = () => {
    if (!sourcePath.trim()) { toast.error("Enter the full path to your project folder"); return }
    run(`Scanning ${sourcePath}`, "/api/workspace/create", { headers: { "content-type": "application/json" }, body: JSON.stringify({ sourcePath }) })
  }
  const cloneRepo = () => {
    const u = gitUrl.trim()
    if (!u) { toast.error("Paste a repository URL"); return }
    if (!/^https:\/\//i.test(u)) { toast.error("Use an HTTPS clone URL (SSH/private repos: use the CLI)"); return }
    run(`Cloning ${u}`, "/api/workspace/clone", { headers: { "content-type": "application/json" }, body: JSON.stringify({ repoUrl: u }) })
  }
  const importArchive = (file: File | null | undefined) => {
    if (!file) return
    if (!ARCHIVE_RE.test(file.name)) { toast.error("Choose a .zip, .tar, .tar.gz or .tgz archive"); return }
    const fd = new FormData(); fd.append("file", file)
    run(`Extracting ${file.name}`, "/api/workspace/import", { body: fd })
  }
  const uploadFolder = (files: File[], paths: string[]) => {
    if (!files.length) { toast.error("That folder was empty"); return }
    const name = (paths[0] || "").split("/")[0] || "project"
    const fd = new FormData()
    files.forEach((f) => fd.append("files", f))
    fd.append("paths", JSON.stringify(paths)); fd.append("projectName", name)
    run(`Uploading ${files.length} files from ${name}`, "/api/workspace/upload", { body: fd })
  }
  const onFolderPick = (list: FileList | null) => {
    if (!list || !list.length) return
    const files = Array.from(list)
    const paths = files.map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name)
    uploadFolder(files, paths)
  }
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    if (!guard()) return
    // Single archive dropped?
    const f = e.dataTransfer.files?.[0]
    if (f && ARCHIVE_RE.test(f.name) && e.dataTransfer.files.length === 1) { importArchive(f); return }
    setProgress("Reading folder…"); setBusy(true)
    try {
      const { files, paths, hasFolder } = await readDataTransfer(e.dataTransfer)
      setBusy(false)
      if (hasFolder || files.length > 1) uploadFolder(files, paths)
      else if (files[0]) importArchive(files[0])
    } catch { setBusy(false); toast.error("Could not read the dropped item") }
  }

  const reopen = (r: RecentProject) => {
    setWs({ id: "", workspacePath: r.workspacePath, fileCount: r.fileCount, secretCount: r.secretCount, secrets: [] })
    setIntel(r.intelligence || null); setRestored(null)
    toast.success(`Reopened ${r.name}`)
  }

  const restore = async () => {
    if (!ws) return
    setBusy(true); setProgress("Restoring secrets")
    try {
      const res = await fetch("/api/workspace/restore", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspacePath: ws.workspacePath }) })
      const r = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`${res.status} ${r.error || res.statusText}`)
      setRestored({ restored: r.restored, sourcePath: r.sourcePath })
      toast.success(`Restored ${r.restored} secret(s) to your project`)
    } catch (e) { toast.error(friendly((e as Error).message)) } finally { setBusy(false); setProgress("") }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2.5 text-blue-300/90">
          <span className="h-px w-6 bg-gradient-to-r from-transparent to-blue-400" />
          <span className="label-thin">Import · Protect · Edit · Restore</span>
        </div>
        <h2 className="text-3xl font-light tracking-tight text-white">AI-Safe Workspace</h2>
        <p className="mt-2 max-w-xl text-xs font-light leading-relaxed text-zinc-400">
          Bring your project in any way you like — <span className="text-blue-300">drag a folder, drop an archive, paste a path, or clone a repo</span>. ShadowPaste makes an AI-safe copy with fake secrets, then restores the real ones when you&apos;re done.
        </p>
      </div>

      {/* ── Import Hub ─────────────────────────────────────────────────── */}
      <Card className="relative overflow-hidden border-blue-500/20 bg-gradient-to-b from-blue-500/[0.06] to-transparent p-0">
        {/* method tabs */}
        <div className="flex flex-wrap gap-1 border-b border-white/5 p-2">
          <MethodTab active={method === "upload"} onClick={() => setMethod("upload")} icon={UploadCloud} label="Upload / Drop" hint="Folder or archive" />
          <MethodTab active={method === "path"} onClick={() => setMethod("path")} icon={HardDrive} label="Local path" hint="On this machine" />
          <MethodTab active={method === "git"} onClick={() => setMethod("git")} icon={GitBranch} label="Git repo" hint="Clone by URL" />
        </div>

        <div className="p-6">
          {/* progress / cancel banner */}
          {busy && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-500/25 bg-blue-500/[0.06] px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              <div className="flex-1">
                <div className="text-xs font-medium text-blue-200">{progress || "Working…"}</div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-1/3 animate-[sp-shimmer_1.2s_infinite] rounded-full bg-gradient-to-r from-transparent via-blue-400 to-transparent" />
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={cancel} className="text-zinc-400 hover:text-red-300"><X className="mr-1 h-3.5 w-3.5" />Cancel</Button>
            </div>
          )}

          {method === "upload" && (
            <div>
              <input ref={folderInputRef} type="file" className="hidden" onChange={(e) => onFolderPick(e.target.files)}
                // @ts-expect-error non-standard directory picker attributes
                webkitdirectory="" directory="" multiple />
              <input ref={archiveInputRef} type="file" accept=".zip,.tar,.tar.gz,.tgz,.gz" className="hidden" onChange={(e) => importArchive(e.target.files?.[0])} />
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-4 py-12 text-center transition ${dragOver ? "border-blue-400/70 bg-blue-500/[0.1]" : "border-white/12 bg-white/[0.02]"}`}
              >
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400 transition ${dragOver ? "scale-110" : ""}`}>
                  <UploadCloud className="h-7 w-7" strokeWidth={1.5} />
                </div>
                <div className="text-sm font-medium text-zinc-100">{dragOver ? "Release to import" : "Drag a folder or archive here"}</div>
                <p className="max-w-sm text-[11px] font-light text-zinc-500">Folders, monorepos, workspaces, Docker projects — or <span className="text-zinc-300">.zip .tar .tar.gz .tgz</span>. Scanned in a throwaway copy, then discarded. Up to 200 MB.</p>
                <div className="mt-1 flex flex-wrap justify-center gap-2">
                  <Button onClick={() => guard() && folderInputRef.current?.click()} disabled={busy} className="bg-blue-600 text-white hover:bg-blue-500"><FolderUp className="mr-1.5 h-4 w-4" />Select folder</Button>
                  <Button onClick={() => guard() && archiveInputRef.current?.click()} disabled={busy} variant="outline" className="border-white/12 text-zinc-200"><FileArchive className="mr-1.5 h-4 w-4" />Select archive</Button>
                </div>
              </div>
            </div>
          )}

          {method === "path" && (
            <div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={sourcePath} onChange={(e) => setSourcePath(e.target.value)} onKeyDown={(e) => e.key === "Enter" && protect()}
                  placeholder="C:\Users\you\my-project   ·   /home/you/my-project   ·   \\nas\share\project"
                  className="border-white/10 bg-white/[0.03] font-mono text-xs" />
                <Button onClick={protect} disabled={busy} className="shrink-0 bg-blue-600 text-white hover:bg-blue-500"><ShieldCheck className="mr-1.5 h-4 w-4" />Protect</Button>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">Any local or network-drive path inside an allowed root. Default root: your home directory (<span className="font-mono text-zinc-400">~</span>). Set <span className="font-mono text-zinc-400">SHADOWPASTE_PROJECT_ROOTS</span> to add more.</p>
            </div>
          )}

          {method === "git" && (
            <div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && cloneRepo()}
                  placeholder="https://github.com/owner/repo.git" className="border-white/10 bg-white/[0.03] font-mono text-xs" />
                <Button onClick={cloneRepo} disabled={busy} className="shrink-0 bg-blue-600 text-white hover:bg-blue-500"><GitFork className="mr-1.5 h-4 w-4" />Clone</Button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                <span className="label-thin">Supported</span>
                {[["GitHub", Github], ["GitLab", GitBranch], ["Bitbucket", Boxes], ["Azure DevOps", Server]].map(([n, Ic]) => {
                  const I = Ic as typeof Github
                  return <span key={n as string} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-zinc-400"><I className="h-3 w-3 text-blue-400" />{n as string}</span>
                })}
              </div>
              <p className="mt-2 text-[11px] text-amber-400/80">Public HTTPS repositories only. For SSH or private repos, clone locally and use the Local-path tab or <span className="font-mono">shadowpaste protect</span>.</p>
            </div>
          )}

          {!authed && <p className="mt-4 text-[11px] text-amber-400/90">You&apos;ll be asked to sign in first — importing writes an AI-safe copy and vaults your secrets under your account.</p>}
        </div>
      </Card>

      {/* ── Recent projects ────────────────────────────────────────────── */}
      {recent.length > 0 && (
        <Card className="border-white/5 bg-white/[0.015] backdrop-blur-xl p-5">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-medium tracking-tight text-white">Recent projects</h3>
            <span className="label-thin text-zinc-500">One-click reopen</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((r) => (
              <button key={r.workspacePath} onClick={() => reopen(r)} className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-all hover:-translate-y-0.5 hover:border-blue-500/30">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400"><SourceIcon source={r.source} /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-zinc-100">{r.name}</div>
                  <div className="truncate text-[10px] text-zinc-500">{r.intelligence?.projectType || r.source} · {r.secretCount} vaulted · {timeSince(r.when)}</div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-blue-400" />
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ── Result ─────────────────────────────────────────────────────── */}
      {ws && (
        <>
          {/* Project Intelligence — auto-generated health report */}
          {intel && <ProjectHealthReport intel={intel} />}

          <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-400" />
              <h3 className="text-sm font-medium tracking-tight text-white">Workspace ready</h3>
              <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-300">{ws.secretCount} secret(s) vaulted</Badge>
              <Badge variant="outline" className="border-white/10 text-[10px] text-zinc-400">{ws.fileCount} files</Badge>
            </div>

            <CopyRow label="AI-safe workspace path" value={ws.workspacePath} />
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2"><Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[10px] text-zinc-400">NEXT</Badge><span className="flex items-center gap-1.5 text-xs text-zinc-300"><FolderOpen className="h-3.5 w-3.5 text-blue-400" />Open the workspace in your AI tool</span></div>
              <div className="space-y-1.5">
                <CopyRow label="Claude Code" value={`claude "${ws.workspacePath}"`} />
                <CopyRow label="Cursor" value={`cursor "${ws.workspacePath}"`} />
                <CopyRow label="VS Code" value={`code "${ws.workspacePath}"`} />
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">The AI sees format-compatible fakes. Code runs, tests pass, and no real secret is exposed.</p>
            </div>

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
                        {s.vaulted && <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-[9px] text-blue-300"><Lock className="mr-0.5 h-2.5 w-2.5" />vaulted</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card className="border-white/5 bg-white/[0.02] backdrop-blur-xl p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10"><RotateCcw className="h-5 w-5 text-blue-400" /></div>
                <div>
                  <span className="text-sm font-medium tracking-tight text-white">Restore when done</span>
                  <p className="text-xs text-zinc-400">Copies AI edits back to your project and swaps fakes for the real secrets.</p>
                </div>
              </div>
              <Button onClick={restore} disabled={busy} className="shrink-0 bg-blue-600 text-white hover:bg-blue-500">
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}Restore secrets
              </Button>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-[11px] text-zinc-400">
              <TerminalSquare className="h-3.5 w-3.5 text-zinc-500" /><span>CLI equivalent:</span><span className="font-mono text-zinc-300">shadowpaste restore</span>
            </div>
            {restored && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-3 py-2 text-xs text-blue-300">
                <ShieldCheck className="h-4 w-4" />Restored {restored.restored} secret(s) to <span className="font-mono">{restored.sourcePath}</span> — AI edits preserved. Ready to commit.
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function MethodTab({ active, onClick, icon: Icon, label, hint }: { active: boolean; onClick: () => void; icon: typeof UploadCloud; label: string; hint: string }) {
  return (
    <button onClick={onClick} className={`flex flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all ${active ? "bg-blue-500/[0.12] ring-1 ring-inset ring-blue-500/25" : "hover:bg-white/[0.04]"}`}>
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? "bg-blue-500/20 text-blue-300" : "bg-white/[0.04] text-zinc-400"}`}><Icon className="h-4 w-4" /></div>
      <div className="min-w-0">
        <div className={`text-xs font-medium ${active ? "text-white" : "text-zinc-300"}`}>{label}</div>
        <div className="truncate text-[10px] text-zinc-500">{hint}</div>
      </div>
    </button>
  )
}

function SourceIcon({ source }: { source: string }) {
  if (source === "git") return <GitBranch className="h-4 w-4" />
  if (source === "folder") return <FolderUp className="h-4 w-4" />
  if (source === "path") return <HardDrive className="h-4 w-4" />
  return <FileArchive className="h-4 w-4" />
}

function timeSince(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return "just now"
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function friendly(msg: string): string {
  if (msg.startsWith("401")) return "Please sign in first."
  if (msg.startsWith("429")) return "Rate limited — wait a moment and try again."
  if (msg.startsWith("413")) return "That project is too large for browser upload — use the Local-path tab instead."
  return msg
}
