"use client"
import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  Shield, LayoutDashboard, Network, Bot, KeyRound, Radio, Boxes, Github,
  Gauge, Store, Globe, Bug, Database, Menu, X, Zap, Activity, Cpu, Lock, ScrollText,
  FolderLock, LogIn, LogOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Toaster } from "sonner"
import { api } from "@/components/shadowpaste/shared"
import { Dashboard } from "@/components/shadowpaste/dashboard"
import { McpGateway } from "@/components/shadowpaste/mcp-gateway"
import { Agents } from "@/components/shadowpaste/agents"
import { Permissions } from "@/components/shadowpaste/permissions"
import { FlightRecorder } from "@/components/shadowpaste/flight-recorder"
import { Sandbox } from "@/components/shadowpaste/sandbox"
import { AiSafeGithub } from "@/components/shadowpaste/ai-safe-github"
import { TrustScore } from "@/components/shadowpaste/trust-score"
import { Marketplace } from "@/components/shadowpaste/marketplace"
import { PublicScanner } from "@/components/shadowpaste/public-scanner"
import { Attacks } from "@/components/shadowpaste/attacks"
import { Vault } from "@/components/shadowpaste/vault"
import { AuditTrail } from "@/components/shadowpaste/audit-trail"
import { AiSafeWorkspace } from "@/components/shadowpaste/ai-safe-workspace"
import { AuthPanel, type AuthUser } from "@/components/shadowpaste/auth-panel"
import { toast } from "sonner"

type ModuleId =
  | "dashboard" | "workspace" | "gateway" | "agents" | "permissions" | "recorder"
  | "sandbox" | "github" | "trust" | "marketplace" | "public" | "attacks" | "vault" | "audit"

const NAV: Array<{ id: ModuleId; label: string; icon: typeof Shield; phase: string; group: string }> = [
  { id: "dashboard", label: "Command Center", icon: LayoutDashboard, phase: "OVERVIEW", group: "Monitor" },
  { id: "workspace", label: "AI-Safe Workspace", icon: FolderLock, phase: "CORE", group: "Protect" },
  { id: "gateway", label: "MCP Gateway", icon: Network, phase: "P1", group: "Control" },
  { id: "agents", label: "Agent Identities", icon: Bot, phase: "P2", group: "Control" },
  { id: "permissions", label: "Permission Center", icon: KeyRound, phase: "P3", group: "Control" },
  { id: "vault", label: "Secret Vault", icon: Lock, phase: "P4", group: "Control" },
  { id: "recorder", label: "Flight Recorder", icon: Radio, phase: "P4", group: "Monitor" },
  { id: "audit", label: "Audit Trail", icon: ScrollText, phase: "COMPLIANCE", group: "Monitor" },
  { id: "sandbox", label: "Shadow Sandbox", icon: Boxes, phase: "P5", group: "Build" },
  { id: "github", label: "AI Safe GitHub", icon: Github, phase: "P6", group: "Build" },
  { id: "trust", label: "Trust Scores", icon: Gauge, phase: "P7", group: "Build" },
  { id: "marketplace", label: "MCP Marketplace", icon: Store, phase: "P8", group: "Build" },
  { id: "public", label: "Public Scanner", icon: Globe, phase: "P10", group: "Growth" },
  { id: "attacks", label: "Red Team Lab", icon: Bug, phase: "P11", group: "Test" },
]

export default function Home() {
  const [active, setActive] = useState<ModuleId>("dashboard")
  const [mobileNav, setMobileNav] = useState(false)
  const [seeded, setSeeded] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [stats, setStats] = useState<{ agents: number; toolCalls: number; attacks: number; vaultEntries?: number } | null>(null)
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)
  const [authOpen, setAuthOpen] = useState(false)

  const logout = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }) } catch { /* ignore */ }
    setAuthUser(null)
    toast.success("Signed out")
  }

  useEffect(() => {
    // Auto-seed on first load
    (async () => {
      try {
        setSeeding(true)
        await api("/api/seed", { method: "POST" })
        setSeeded(true)
        const d = await api<{ counts: { agents: number; toolCalls: number; attacks: number; vaultEntries: number } }>("/api/dashboard")
        setStats({ agents: d.counts.agents, toolCalls: d.counts.toolCalls, attacks: d.counts.attacks, vaultEntries: d.counts.vaultEntries })
      } catch {
        // ignore — dashboard will still load
      } finally {
        setSeeding(false)
      }
    })()
    // Check auth status
    api<{ user: { id: string; email: string; name: string | null } | null }>("/api/auth/me").then((d) => setAuthUser(d.user)).catch(() => {})
  }, [])

  const activeItem = NAV.find((n) => n.id === active)!

  return (
    <div className="min-h-screen flex flex-col text-zinc-200 selection:bg-blue-500/30">
      {/* Immersive OS backdrop is mounted globally in layout.tsx
          (FuturisticBackground): aurora + blueprint grid + particle network +
          mouse parallax, GPU-light and reduced-motion aware. */}

      <div className="relative flex flex-1">
        {/* Sidebar */}
        <aside className={`${mobileNav ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 fixed lg:sticky top-0 z-40 h-screen w-72 shrink-0 border-r border-white/5 bg-[#080b12]/60 backdrop-blur-2xl transition-transform duration-300`}>
          <div className="flex h-full flex-col">
            {/* Brand */}
            <div className="flex items-center gap-3 border-b border-white/5 px-5 py-5">
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-sky-600 shadow-lg shadow-blue-500/20">
                  <Shield className="h-5 w-5 text-white" strokeWidth={2.5} />
                </div>
                <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
                </span>
              </div>
              <div>
                <div className="font-mono text-sm font-bold tracking-tight text-white">SHADOWPASTE</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-blue-400/80">AI Security OS · v19</div>
              </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto px-3 py-4" style={{ scrollbarWidth: "thin" }}>
              {(["Protect", "Monitor", "Control", "Build", "Growth", "Test"] as const).map((group) => {
                const items = NAV.filter((n) => n.group === group)
                if (!items.length) return null
                return (
                  <div key={group} className="mb-5">
                    <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{group}</div>
                    <div className="space-y-1">
                      {items.map((item) => {
                        const Icon = item.icon
                        const isActive = active === item.id
                        return (
                          <button
                            key={item.id}
                            onClick={() => { setActive(item.id); setMobileNav(false) }}
                            className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                              isActive
                                ? "bg-blue-500/[0.12] text-white shadow-[0_0_24px_-8px_rgba(59,109,255,0.6)] ring-1 ring-inset ring-blue-500/20"
                                : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                            }`}
                          >
                            {isActive && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-blue-400 shadow-[0_0_10px_rgba(59,109,255,0.9)]" />}
                            <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-blue-400" : "text-zinc-500 group-hover:text-zinc-300"}`} />
                            <span className="flex-1 text-left font-medium">{item.label}</span>
                            <span className="font-mono text-[9px] text-zinc-600">{item.phase}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </nav>

            {/* Status footer */}
            <div className="border-t border-white/5 p-4">
              <div className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5 text-blue-400" />
                  <span className="text-[11px] text-zinc-400">Gateway</span>
                </div>
                <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-[10px] text-blue-400">ONLINE</Badge>
              </div>
              {stats && (
                <div className="mt-2 grid grid-cols-2 gap-1.5 text-center">
                  <div className="rounded bg-white/[0.02] py-1.5">
                    <div className="font-mono text-xs font-bold text-white">{stats.agents}</div>
                    <div className="text-[9px] uppercase text-zinc-500">Agents</div>
                  </div>
                  <div className="rounded bg-white/[0.02] py-1.5">
                    <div className="font-mono text-xs font-bold text-white">{stats.toolCalls}</div>
                    <div className="text-[9px] uppercase text-zinc-500">Calls</div>
                  </div>
                  <div className="rounded bg-white/[0.02] py-1.5">
                    <div className="font-mono text-xs font-bold text-blue-400">{stats.vaultEntries ?? 0}</div>
                    <div className="text-[9px] uppercase text-zinc-500">Vaulted</div>
                  </div>
                  <div className="rounded bg-white/[0.02] py-1.5">
                    <div className="font-mono text-xs font-bold text-white">{stats.attacks}</div>
                    <div className="text-[9px] uppercase text-zinc-500">Tests</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        {mobileNav && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setMobileNav(false)} />}

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-white/5 bg-[#05070d]/50 px-4 backdrop-blur-2xl lg:px-8">
            <button onClick={() => setMobileNav(true)} className="lg:hidden text-zinc-400 hover:text-white">
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2">
              <activeItem.icon className="h-4 w-4 text-blue-400" />
              <h1 className="font-mono text-sm font-semibold text-white">{activeItem.label}</h1>
              <Badge variant="outline" className="ml-1 border-white/10 bg-white/[0.03] text-[9px] text-zinc-400">{activeItem.phase}</Badge>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5 md:flex">
                <Cpu className="h-3.5 w-3.5 text-blue-400" />
                <span className="font-mono text-[11px] text-zinc-400">policy-engine</span>
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              </div>
              {/* Auth control */}
              {authUser ? (
                <button
                  onClick={logout}
                  title="Sign out"
                  className="group flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 hover:border-blue-500/40"
                >
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-300">
                    {(authUser.name || authUser.email).charAt(0).toUpperCase()}
                  </div>
                  <span className="hidden font-mono text-[11px] text-blue-300 sm:inline">{authUser.name || authUser.email}</span>
                  <LogOut className="h-3.5 w-3.5 text-blue-400/60 group-hover:text-blue-300" />
                </button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAuthOpen(true)}
                  className="border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                >
                  <LogIn className="mr-1.5 h-3.5 w-3.5" />Sign in
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  setSeeding(true)
                  try {
                    await api("/api/seed", { method: "POST" })
                    setSeeded(true)
                    window.location.reload()
                  } catch (e) {
                    toast.error(`Demo data unavailable: ${(e as Error).message}`)
                  } finally {
                    setSeeding(false)
                  }
                }}
                disabled={seeding}
                className="border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 hover:text-blue-200"
              >
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                {seeding ? "Syncing…" : seeded ? "Reseed Data" : "Init Demo"}
              </Button>
            </div>
          </header>

          {/* Content — keyed by `active` so each module remounts and fades in.
              We deliberately do NOT gate this on an AnimatePresence exit
              animation: mode="wait" leaves the previous module on screen until
              its exit tween finishes, which never happens when rAF is throttled
              (background tab, reduced-motion, headless), stranding the user on
              the old view. */}
          <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
            <div>
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                {active === "dashboard" && <Dashboard onNavigate={(id) => setActive(id as ModuleId)} />}
                {active === "workspace" && <AiSafeWorkspace authed={!!authUser} onRequireAuth={() => setAuthOpen(true)} />}
                {active === "gateway" && <McpGateway />}
                {active === "agents" && <Agents />}
                {active === "permissions" && <Permissions />}
                {active === "recorder" && <FlightRecorder />}
                {active === "sandbox" && <Sandbox />}
                {active === "github" && <AiSafeGithub authed={!!authUser} onRequireAuth={() => setAuthOpen(true)} onProtect={() => setActive("workspace")} />}
                {active === "trust" && <TrustScore />}
                {active === "marketplace" && <Marketplace />}
                {active === "public" && <PublicScanner />}
                {active === "attacks" && <Attacks />}
                {active === "vault" && <Vault />}
                {active === "audit" && <AuditTrail />}
              </motion.div>
            </div>
          </main>

          {/* Footer */}
          <footer className="mt-auto border-t border-white/5 bg-[#0a0e14]/80 px-4 py-4 lg:px-8">
            <div className="flex flex-col items-center justify-between gap-2 text-[11px] text-zinc-500 sm:flex-row">
              <div className="flex items-center gap-2">
                <Shield className="h-3.5 w-3.5 text-blue-500/70" />
                <span className="font-mono">ShadowPaste V18 · The security layer every AI agent needs before touching real systems.</span>
              </div>
              <div className="flex items-center gap-3 font-mono">
                <span>MCP</span><span className="text-zinc-700">·</span>
                <span>Zero-Trust</span><span className="text-zinc-700">·</span>
                <span>Audit-First</span><span className="text-zinc-700">·</span>
                <span className="text-blue-500/70">Sandbox-Default</span>
              </div>
            </div>
          </footer>
        </div>
      </div>
      <AuthPanel open={authOpen} onOpenChange={setAuthOpen} onAuthed={(u) => setAuthUser(u)} />
      <Toaster theme="dark" position="bottom-right" />
    </div>
  )
}
