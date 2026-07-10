"use client"
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { api, RiskBadge } from "./shared"
import * as Icons from "lucide-react"
import { Store, Search, BadgeCheck, Download, Shield, Filter } from "lucide-react"

interface Pkg { id: string; name: string; displayName: string; description: string; category: string; icon: string | null; installs: number; verified: boolean; riskLevel: "low" | "medium" | "high" | "critical"; publisher: string; version: string; toolCount: number }

export function Marketplace() {
  const [pkgs, setPkgs] = useState<Pkg[]>([])
  const [q, setQ] = useState("")
  const [cat, setCat] = useState("all")
  const [installed, setInstalled] = useState<Set<string>>(new Set())

  useEffect(() => { api<{ packages: Pkg[] }>("/api/marketplace").then((d) => setPkgs(d.packages)) }, [])

  const install = async (p: Pkg) => {
    await api(`/api/marketplace/${p.id}/install`, { method: "POST" })
    setPkgs((arr) => arr.map((x) => x.id === p.id ? { ...x, installs: x.installs + 1 } : x))
    setInstalled((s) => new Set(s).add(p.id))
    toast.success(`Installed ${p.displayName}`)
  }

  const categories = ["all", ...new Set(pkgs.map((p) => p.category))]
  const filtered = pkgs.filter((p) => (cat === "all" || p.category === cat) && (p.displayName.toLowerCase().includes(q.toLowerCase()) || p.name.toLowerCase().includes(q.toLowerCase()) || p.description.toLowerCase().includes(q.toLowerCase())))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-mono text-lg font-bold text-white">MCP Marketplace — Safe MCP Store</h2>
        <p className="text-xs text-zinc-400">Every MCP tool runs through the ShadowPaste Policy Layer. Verified packages only touch scoped resources.</p>
      </div>

      {/* Search + filters */}
      <Card className="border-white/5 bg-[#0d1218] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search MCP packages…" className="border-white/10 bg-white/[0.03] pl-9 font-mono text-sm" />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            <Filter className="h-4 w-4 text-zinc-500" />
            {categories.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors ${cat === c ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05]"}`}>{c}</button>
            ))}
          </div>
        </div>
      </Card>

      {/* Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => {
          const Icon = p.icon ? (Icons as unknown as Record<string, Icons.LucideIcon>)[p.icon] || Icons.Box : Icons.Box
          const isInstalled = installed.has(p.id)
          return (
            <Card key={p.id} className="group flex flex-col border-white/5 bg-[#0d1218] p-5 transition-all hover:border-emerald-500/20">
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 text-emerald-400"><Icon className="h-5 w-5" /></div>
                {p.verified ? <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-400"><BadgeCheck className="mr-1 h-3 w-3" />Verified</Badge> : <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[10px] text-zinc-400">Community</Badge>}
              </div>
              <div className="mt-3 flex-1">
                <div className="font-semibold text-white">{p.displayName}</div>
                <div className="font-mono text-[10px] text-zinc-500">{p.name} · v{p.version}</div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">{p.description}</p>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RiskBadge level={p.riskLevel} />
                  <span className="font-mono text-[10px] text-zinc-500">{p.toolCount} tools</span>
                </div>
                <span className="font-mono text-[10px] text-zinc-500">{p.installs.toLocaleString()} installs</span>
              </div>
              <Button size="sm" onClick={() => install(p)} disabled={isInstalled} className={`mt-3 w-full ${isInstalled ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "bg-emerald-600 text-white hover:bg-emerald-500"}`}>
                {isInstalled ? <><BadgeCheck className="mr-1.5 h-3.5 w-3.5" />Installed</> : <><Download className="mr-1.5 h-3.5 w-3.5" />Install</>}
              </Button>
            </Card>
          )
        })}
      </div>

      {/* Policy layer banner */}
      <Card className="border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.05] to-[#0d1218] p-5">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-emerald-400" />
          <div>
            <div className="font-mono text-sm font-semibold text-white">Every tool runs through the ShadowPaste Policy Layer</div>
            <div className="text-xs text-zinc-400">Risk scoring → permission check → sandbox-default → full audit. No MCP tool executes directly.</div>
          </div>
        </div>
      </Card>
    </div>
  )
}
