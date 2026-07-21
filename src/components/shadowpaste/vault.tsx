"use client"
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import { api } from "./shared"
import {
  Lock, KeyRound, Plus, Trash2, ShieldCheck, Eye, EyeOff, Clock, Zap, Fingerprint,
  ArrowRight, Database, Github, CreditCard, Cloud, Brain, AlertCircle, RefreshCw,
} from "lucide-react"

interface VaultSecret {
  id: string
  name: string
  provider: string
  scope: string
  masked: string
  fingerprint: string
  createdAt: string
}

const PROVIDER_ICONS: Record<string, typeof KeyRound> = {
  GITHUB: Github, STRIPE: CreditCard, AWS_ACCESS_KEY: Cloud, AWS_SESSION: Cloud,
  AWS_SECRET_KEY: Cloud, OPENAI: Brain, ANTHROPIC: Brain, GOOGLE: Cloud,
  DATABASE: Database, ENV_SECRET: KeyRound, SLACK: KeyRound, DISCORD: KeyRound,
}

export function Vault() {
  const [secrets, setSecrets] = useState<VaultSecret[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())

  const load = () => {
    setLoading(true)
    api<{ secrets: VaultSecret[]; count: number }>("/api/vault").then((d) => { setSecrets(d.secrets); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  const add = async (data: { raw: string; name: string; contextHint: string }) => {
    try {
      await api("/api/vault", { method: "POST", body: JSON.stringify(data) })
      toast.success("Secret encrypted & vaulted")
      setOpen(false)
      load()
    } catch (e) { toast.error((e as Error).message) }
  }
  const remove = async (id: string, name: string) => {
    await api(`/api/vault/${id}`, { method: "DELETE" })
    toast.success(`"${name}" revoked from vault`)
    load()
  }

  const providerCounts = secrets.reduce((acc, s) => { acc[s.provider] = (acc[s.provider] || 0) + 1; return acc }, {} as Record<string, number>)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-emerald-400" />
            <h2 className="font-mono text-lg font-bold text-white">Zero-Trust Secret Vault</h2>
          </div>
          <p className="mt-1 text-xs text-zinc-400">AES-GCM-256 encrypted storage. AI agents NEVER receive raw secrets — they get scoped, time-limited, single-use capability tokens.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} className="border-white/10"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Refresh</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 text-white hover:bg-emerald-500"><Plus className="mr-1.5 h-4 w-4" />Vault Secret</Button>
            </DialogTrigger>
            <AddSecretDialog onAdd={add} />
          </Dialog>
        </div>
      </div>

      {/* Encryption flow visualization */}
      <Card className="relative overflow-hidden border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] via-[#0d1218] to-[#0d1218] p-5">
        <div className="absolute right-0 top-0 h-full w-1/3 opacity-10" style={{ background: "radial-gradient(circle at 70% 30%, rgba(16,185,129,0.5), transparent 60%)" }} />
        <div className="relative">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <h3 className="font-mono text-sm font-semibold text-white">Credential Injection Flow</h3>
            <Badge variant="outline" className="ml-auto border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400">AES-GCM-256 · HMAC-SHA256</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {[
              { label: "Agent requests tool", icon: Zap, color: "text-amber-400" },
              { label: "Policy check", icon: ShieldCheck, color: "text-emerald-400" },
              { label: "Mint capability token", icon: KeyRound, color: "text-violet-400" },
              { label: "Inject credential", icon: ArrowRight, color: "text-cyan-400" },
              { label: "Execute tool", icon: Zap, color: "text-emerald-400" },
              { label: "Redact from audit", icon: EyeOff, color: "text-red-400" },
              { label: "Consume token (single-use)", icon: Clock, color: "text-zinc-400" },
            ].map((s, i, arr) => {
              const Icon = s.icon
              return (
                <div key={s.label} className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-mono">
                    <Icon className={`h-3 w-3 ${s.color}`} />
                    {s.label}
                  </div>
                  {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-zinc-600" />}
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {/* Provider breakdown */}
      {Object.keys(providerCounts).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Object.entries(providerCounts).map(([provider, count]) => {
            const Icon = PROVIDER_ICONS[provider] || KeyRound
            return (
              <Card key={provider} className="border-white/5 bg-[#0d1218] p-4">
                <div className="flex items-center justify-between">
                  <Icon className="h-4 w-4 text-emerald-400" />
                  <span className="font-mono text-lg font-bold text-white">{count}</span>
                </div>
                <div className="mt-1 truncate text-[10px] uppercase tracking-wider text-zinc-500">{provider}</div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Secrets list */}
      <Card className="border-white/5 bg-[#0d1218] p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-emerald-400" />
            <h3 className="font-mono text-sm font-semibold text-white">Vaulted Secrets ({secrets.length})</h3>
          </div>
          <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[10px] text-zinc-400">
            <Lock className="mr-1 h-2.5 w-2.5" />encrypted at rest
          </Badge>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded bg-white/[0.02]" />)}</div>
        ) : secrets.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/5 py-12 text-center">
            <Lock className="mx-auto mb-2 h-8 w-8 text-zinc-600" />
            <div className="text-sm text-zinc-400">No secrets vaulted yet</div>
            <p className="mt-1 text-xs text-zinc-500">Add a secret to enable credential injection for AI agents.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {secrets.map((s) => {
              const Icon = PROVIDER_ICONS[s.provider] || KeyRound
              const isRevealed = revealed.has(s.id)
              return (
                <div key={s.id} className="group flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3 transition-all hover:border-white/10 hover:bg-white/[0.04]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500/15 to-teal-500/5 text-emerald-400">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-white">{s.name}</span>
                      <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[9px] text-zinc-400">{s.provider}</Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
                      <Fingerprint className="h-3 w-3" />
                      <span className="truncate">{isRevealed ? s.masked : `${s.fingerprint.slice(0, 16)}…`}</span>
                      <button onClick={() => setRevealed((r) => { const n = new Set(r); if (n.has(s.id)) { n.delete(s.id) } else { n.add(s.id) } return n })} className="text-zinc-500 hover:text-emerald-400">
                        {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[10px] text-zinc-500">{new Date(s.createdAt).toLocaleDateString()}</div>
                    <button onClick={() => remove(s.id, s.name)} className="mt-1 text-zinc-500 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Security note */}
      <Card className="border-amber-500/20 bg-amber-500/[0.03] p-4">
        <div className="flex items-start gap-2 text-[11px] text-amber-200/80">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <span className="font-semibold">How it works:</span> When an AI agent invokes a tool that needs a credential (e.g. <code className="rounded bg-white/5 px-1">github.read</code>), ShadowPaste checks the agent's identity, permission, and policy. If approved, it mints a single-use HMAC-signed capability token bound to the session, injects the raw secret into the tool adapter <em>only for the duration of execution</em>, redacts the secret from all audit logs, and consumes the token so it can never be replayed.
          </div>
        </div>
      </Card>
    </div>
  )
}

function AddSecretDialog({ onAdd }: { onAdd: (d: { raw: string; name: string; contextHint: string }) => void }) {
  const [raw, setRaw] = useState("")
  const [name, setName] = useState("")
  const [contextHint, setContextHint] = useState("")
  return (
    <DialogContent className="border-white/10 bg-[#0d1218]">
      <DialogHeader>
        <DialogTitle className="font-mono text-white">Vault a Secret</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label className="text-xs text-zinc-400">Secret Value</Label>
          <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={3} className="mt-1 border-white/10 bg-[#070a0f] font-mono text-xs text-emerald-300" placeholder="ghp_... / sk_live_... / AKIA..." />
        </div>
        <div>
          <Label className="text-xs text-zinc-400">Name (optional)</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 border-white/10 bg-white/[0.03]" placeholder="production-github-token" />
        </div>
        <div>
          <Label className="text-xs text-zinc-400">Context Hint (optional)</Label>
          <Input value={contextHint} onChange={(e) => setContextHint(e.target.value)} className="mt-1 border-white/10 bg-white/[0.03]" placeholder="github" />
        </div>
        <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.05] p-2.5 text-[11px] text-emerald-300/70">
          <Lock className="mb-1 inline h-3 w-3" /> Encrypted with AES-GCM-256 before storage. Provider auto-detected. Never returned in plaintext.
        </div>
        <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-500" disabled={!raw} onClick={() => onAdd({ raw, name, contextHint })}>
          <Lock className="mr-1.5 h-4 w-4" />Encrypt & Vault
        </Button>
      </div>
    </DialogContent>
  )
}
