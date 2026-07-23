"use client"
import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import {
  Layers, Code2, Cpu, Hammer, Database, Boxes, Cloud, Server, GitBranch, Network,
  Bot, ShieldCheck, ShieldAlert, Gauge, Package, FileCode2, Lightbulb, ListChecks,
  FolderTree, KeyRound, HardDrive, CheckCircle2, AlertTriangle, Container,
} from "lucide-react"

// Types mirror src/lib/project-intelligence.ts (kept structural to avoid import cycles).
export interface Intelligence {
  name: string; projectType: string
  stack: { languages: string[]; frameworks: string[]; packageManagers: string[]; dependencyCount: number; hasGit: boolean; hasDocker: boolean; isMonorepo: boolean; isWorkspace: boolean; projectType: string }
  runtime: string | null; buildTools: string[]; databases: string[]; orms: string[]; cloudProviders: string[]
  containerization: string[]; iac: string[]; cicd: string[]; monorepoTools: string[]
  aiTools: Array<{ name: string; evidence: string }>
  fileCount: number; folderCount: number; totalSize: number
  binaryFileCount: number; hiddenFileCount: number
  configFiles: string[]; lockFiles: string[]; envFiles: string[]
  packageCount: number; dependencyCount: number
  languageDistribution: Array<{ language: string; files: number; pct: number }>
  hasReadme: boolean; hasLicense: boolean; licenseType: string | null; hasGitignore: boolean; hasTests: boolean
  secretsFound: number; secretsByCategory: Record<string, number>
  todoCount: number; fixmeCount: number; duplicateFileGroups: number
  scores: { security: number; risk: number; aiReadiness: number; complexity: number; dependency: number; health: number }
  buildStatus: { status: string; reason: string }
  insights: string[]
  recommendations: { beforeProtect: string[]; beforeScan: string[]; beforeRestore: string[]; beforeAiEditing: string[]; beforeProduction: string[] }
  analysisMs: number
}

function useCountUp(target: number, ms = 800): number {
  const [n, setN] = useState(0); const ref = useRef(0)
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(target); return }
    const start = performance.now(); const from = ref.current; let raf = 0
    const tick = (t: number) => { const p = Math.min(1, (t - start) / ms); const v = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))); setN(v); ref.current = v; if (p < 1) raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return n
}

const fmtBytes = (b: number) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1073741824).toFixed(2)} GB`
const scoreColor = (s: number, invert = false) => { const v = invert ? 100 - s : s; return v >= 80 ? "#3b6dff" : v >= 60 ? "#f59e0b" : "#ef4444" }

function Ring({ score, size = 108, label, invert = false }: { score: number; size?: number; label: string; invert?: boolean }) {
  const n = useCountUp(score)
  const r = size / 2 - 8; const c = 2 * Math.PI * r; const color = scoreColor(score, invert)
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={6} />
          <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round"
            strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c - (score / 100) * c }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
            style={{ filter: `drop-shadow(0 0 6px ${color}99)` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-light tracking-tight" style={{ color }}>{n}</span>
        </div>
      </div>
      <div className="mt-1.5 label-thin text-zinc-500">{label}</div>
    </div>
  )
}

function Meter({ label, score, invert = false }: { label: string; score: number; invert?: boolean }) {
  const color = scoreColor(score, invert)
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]"><span className="font-light text-zinc-400">{label}</span><span className="font-mono" style={{ color }}>{score}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <motion.div initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="h-full rounded-full" style={{ background: color }} />
      </div>
    </div>
  )
}

function TechRow({ icon: Icon, label, items }: { icon: typeof Layers; label: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400"><Icon className="h-3.5 w-3.5" /></div>
      <div className="min-w-0">
        <div className="label-thin mb-1 text-zinc-500">{label}</div>
        <div className="flex flex-wrap gap-1.5">
          {items.map((t) => <span key={t} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-zinc-200">{t}</span>)}
        </div>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Layers; label: string; value: number; sub?: string }) {
  const n = useCountUp(value)
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <Icon className="h-4 w-4 text-blue-400" strokeWidth={1.75} />
      <div className="mt-2 text-xl font-light tracking-tight text-white tabular-nums">{sub === "bytes" ? fmtBytes(value) : n.toLocaleString()}</div>
      <div className="label-thin text-zinc-500">{label}</div>
    </div>
  )
}

const REC_TABS: Array<{ key: keyof Intelligence["recommendations"]; label: string }> = [
  { key: "beforeProtect", label: "Protect" },
  { key: "beforeScan", label: "Scan" },
  { key: "beforeRestore", label: "Restore" },
  { key: "beforeAiEditing", label: "AI Editing" },
  { key: "beforeProduction", label: "Production" },
]

export function ProjectHealthReport({ intel }: { intel: Intelligence }) {
  const [recTab, setRecTab] = useState<keyof Intelligence["recommendations"]>("beforeProtect")
  const s = intel.scores
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      className="overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-blue-500/[0.05] to-transparent backdrop-blur-xl">
      {/* header band */}
      <div className="flex flex-col gap-4 border-b border-white/5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Ring score={s.health} label="Health" />
          <div>
            <div className="label-thin text-blue-300/90">Project Intelligence · {intel.analysisMs}ms</div>
            <div className="mt-0.5 text-2xl font-light tracking-tight text-white">{intel.name}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-300">{intel.projectType}</span>
              {intel.runtime && <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-zinc-300">{intel.runtime}</span>}
              {intel.stack.hasGit && <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-zinc-300"><GitBranch className="h-3 w-3 text-blue-400" />Git</span>}
              {intel.hasLicense && <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-zinc-400">{intel.licenseType || "License"}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <Ring score={s.aiReadiness} size={92} label="AI Ready" />
          <Ring score={s.security} size={92} label="Security" />
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        {/* left: scores + stats */}
        <div className="space-y-4">
          <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center gap-2"><Gauge className="h-4 w-4 text-blue-400" /><span className="text-sm font-medium tracking-tight text-white">Scores</span></div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3">
              <Meter label="Security" score={s.security} />
              <Meter label="Risk" score={s.risk} invert />
              <Meter label="Complexity" score={s.complexity} invert />
              <Meter label="Dependency" score={s.dependency} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={FileCode2} label="Files" value={intel.fileCount} />
            <Stat icon={FolderTree} label="Folders" value={intel.folderCount} />
            <Stat icon={HardDrive} label="Size" value={intel.totalSize} sub="bytes" />
            <Stat icon={KeyRound} label="Secrets" value={intel.secretsFound} />
            <Stat icon={Package} label="Deps" value={intel.dependencyCount} />
            <Stat icon={ListChecks} label="TODO/FIXME" value={intel.todoCount + intel.fixmeCount} />
          </div>
          {intel.languageDistribution.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="mb-2 label-thin text-zinc-500">Language distribution</div>
              <div className="flex h-2 overflow-hidden rounded-full bg-white/5">
                {intel.languageDistribution.map((l, i) => (
                  <div key={l.language} title={`${l.language} ${l.pct}%`} style={{ width: `${l.pct}%`, background: ["#3b6dff", "#7aa5ff", "#38bdf8", "#8b5cf6", "#22d3ee", "#f59e0b", "#34d399", "#f472b6"][i % 8] }} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
                {intel.languageDistribution.slice(0, 6).map((l) => <span key={l.language}>{l.language} <span className="text-zinc-500">{l.pct}%</span></span>)}
              </div>
            </div>
          )}
        </div>

        {/* right: detected tech */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <div className="mb-1 flex items-center gap-2"><Layers className="h-4 w-4 text-blue-400" /><span className="text-sm font-medium tracking-tight text-white">Detected technologies</span></div>
          <div className="divide-y divide-white/5">
            <TechRow icon={Layers} label="Frameworks" items={intel.stack.frameworks} />
            <TechRow icon={Code2} label="Languages" items={intel.stack.languages} />
            <TechRow icon={Hammer} label="Build tools" items={intel.buildTools} />
            <TechRow icon={Package} label="Package managers" items={intel.stack.packageManagers} />
            <TechRow icon={Database} label="Databases" items={intel.databases} />
            <TechRow icon={Boxes} label="ORMs" items={intel.orms} />
            <TechRow icon={Cloud} label="Cloud" items={intel.cloudProviders} />
            <TechRow icon={Container} label="Containers" items={intel.containerization} />
            <TechRow icon={Server} label="Infrastructure" items={intel.iac} />
            <TechRow icon={GitBranch} label="CI / CD" items={intel.cicd} />
            <TechRow icon={Network} label="Monorepo" items={intel.monorepoTools} />
            <TechRow icon={Bot} label="AI tools" items={intel.aiTools.map((t) => t.name)} />
          </div>
        </div>
      </div>

      {/* insights */}
      {intel.insights.length > 0 && (
        <div className="border-t border-white/5 p-5">
          <div className="mb-2 flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-400" /><span className="text-sm font-medium tracking-tight text-white">Smart insights</span></div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {intel.insights.map((i, idx) => (
              <div key={idx} className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[12px] text-zinc-300">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />{i}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* recommendations */}
      <div className="border-t border-white/5 p-5">
        <div className="mb-3 flex items-center gap-2"><ListChecks className="h-4 w-4 text-blue-400" /><span className="text-sm font-medium tracking-tight text-white">Recommendations</span></div>
        <div className="mb-3 flex flex-wrap gap-1">
          {REC_TABS.map((t) => (
            <button key={t.key} onClick={() => setRecTab(t.key)} className={`rounded-full px-3 py-1 text-[11px] transition ${recTab === t.key ? "bg-blue-500/20 text-blue-200 ring-1 ring-inset ring-blue-500/30" : "text-zinc-400 hover:bg-white/[0.04]"}`}>Before {t.label}</button>
          ))}
        </div>
        <div className="space-y-1.5">
          {intel.recommendations[recTab].length === 0 && <div className="text-[12px] text-zinc-500">Nothing flagged for this stage — you&apos;re good to go.</div>}
          {intel.recommendations[recTab].map((r, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-[12px] text-zinc-300">
              {intel.secretsFound > 0 && recTab === "beforeProtect" && i === 0 ? <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" /> : <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />}
              {r}
            </div>
          ))}
        </div>
        {intel.buildStatus.status === "not_run" && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.015] px-3 py-2 text-[11px] text-zinc-500">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-zinc-500" />Build / type-check / lint were not run — that requires installing dependencies, which onboarding skips. Run them locally for dynamic analysis.
          </div>
        )}
      </div>
    </motion.div>
  )
}
