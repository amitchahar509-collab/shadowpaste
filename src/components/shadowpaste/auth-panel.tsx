"use client"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Loader2, LogIn, UserPlus, ShieldCheck } from "lucide-react"

export interface AuthUser { id: string; email: string; name: string | null }

// Login / signup dialog. Mutating and file-touching endpoints require a session;
// this is how a dashboard user gets one.
export function AuthPanel({
  open,
  onOpenChange,
  onAuthed,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onAuthed: (user: AuthUser) => void
}) {
  const [mode, setMode] = useState<"login" | "signup">("signup")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!email || !password) { toast.error("Email and password are required"); return }
    setBusy(true)
    try {
      const path = mode === "signup" ? "/api/auth/signup" : "/api/auth/login"
      const body = mode === "signup" ? { email, password, name } : { email, password }
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `${res.status} ${res.statusText}`)
      const user: AuthUser = data.user
      toast.success(mode === "signup" ? "Account created — you're signed in" : "Signed in")
      onAuthed(user)
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-[#0d1218] text-zinc-200 sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
              <ShieldCheck className="h-4 w-4 text-white" />
            </div>
            <DialogTitle className="font-mono text-white">
              {mode === "signup" ? "Create your workspace" : "Sign in"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-zinc-400">
            {mode === "signup"
              ? "One account gives you an isolated org. Vault, scans, agents, and protect/restore all run under it."
              : "Sign in to unlock scanning, the vault, and protect/restore."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {mode === "signup" && (
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Name (optional)</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" className="border-white/10 bg-white/[0.03]" />
            </div>
          )}
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="you@example.com" className="border-white/10 bg-white/[0.03]" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" className="border-white/10 bg-white/[0.03]" />
          </div>

          <Button onClick={submit} disabled={busy} className="w-full bg-emerald-600 text-white hover:bg-emerald-500">
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : mode === "signup" ? <UserPlus className="mr-1.5 h-4 w-4" /> : <LogIn className="mr-1.5 h-4 w-4" />}
            {mode === "signup" ? "Create account & sign in" : "Sign in"}
          </Button>

          <button
            onClick={() => setMode(mode === "signup" ? "login" : "signup")}
            className="w-full text-center text-[11px] text-zinc-400 hover:text-emerald-300"
          >
            {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Create one"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
