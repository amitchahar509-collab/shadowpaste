// ShadowPaste V18 — Risk Scoring Engine
// Assigns risk scores 0-100 and levels to MCP tool calls

export type RiskLevel = "low" | "medium" | "high" | "critical"

export interface RiskFactor {
  factor: string
  weight: number
  description: string
}

// Base risk by tool category + action
const TOOL_RISK: Record<string, { score: number; level: RiskLevel }> = {
  // Filesystem
  "fs.read": { score: 10, level: "low" },
  "fs.write": { score: 35, level: "medium" },
  "fs.delete": { score: 75, level: "high" },
  "fs.execute": { score: 90, level: "critical" },
  // GitHub
  "github.read": { score: 10, level: "low" },
  "github.pr.create": { score: 35, level: "medium" },
  "github.pr.merge": { score: 70, level: "high" },
  "github.repo.delete": { score: 100, level: "critical" },
  "github.secret.access": { score: 95, level: "critical" },
  "github.admin": { score: 88, level: "critical" },
  // Database
  "db.read": { score: 20, level: "low" },
  "db.write": { score: 55, level: "high" },
  "db.schema.drop": { score: 100, level: "critical" },
  "db.export": { score: 92, level: "critical" },
  "db.migrate": { score: 65, level: "high" },
  // Shell
  "shell.exec": { score: 85, level: "critical" },
  "shell.read": { score: 30, level: "medium" },
  // Network
  "network.fetch": { score: 25, level: "low" },
  "network.webhook": { score: 60, level: "high" },
  // Stripe / Payment
  "stripe.charge": { score: 90, level: "critical" },
  "stripe.refund": { score: 80, level: "high" },
  "stripe.read": { score: 25, level: "low" },
  "stripe.customer.delete": { score: 85, level: "critical" },
  // AI / External calls
  "ai.generate": { score: 20, level: "low" },
  "ai.train": { score: 70, level: "high" },
}

export function getToolBaseRisk(toolName: string): { score: number; level: RiskLevel } {
  // Try exact match, then prefix match
  if (TOOL_RISK[toolName]) return TOOL_RISK[toolName]
  const parts = toolName.split(".")
  for (let i = parts.length; i >= 1; i--) {
    const prefix = parts.slice(0, i).join(".")
    if (TOOL_RISK[prefix]) return TOOL_RISK[prefix]
  }
  return { score: 15, level: "low" }
}

export function scoreToLevel(score: number): RiskLevel {
  if (score >= 80) return "critical"
  if (score >= 50) return "high"
  if (score >= 25) return "medium"
  return "low"
}

// Analyze input for dangerous patterns (prompt injection, destructive verbs)
const DESTRUCTIVE_PATTERNS = [
  { re: /drop\s+(table|database|schema)/i, weight: 40, name: "DROP statement" },
  { re: /delete\s+from/i, weight: 30, name: "DELETE statement" },
  { re: /rm\s+-rf/i, weight: 45, name: "rm -rf" },
  { re: /format|mkfs/i, weight: 50, name: "format command" },
  { re: /:\(\)\s*\{.*\};:/i, weight: 50, name: "fork bomb" },
  { re: /curl.*\|\s*(bash|sh)/i, weight: 50, name: "curl pipe shell" },
  { re: /wget.*\|\s*(bash|sh)/i, weight: 50, name: "wget pipe shell" },
  { re: /ignore.{0,10}(previous|above|prior).{0,10}(instruction|rule|policy)/i, weight: 35, name: "prompt injection: ignore instructions" },
  { re: /disregard.{0,10}(all|any|previous).{0,10}(instruction|rule)/i, weight: 35, name: "prompt injection: disregard" },
  { re: /you\s+are\s+(now|actually)\s+/i, weight: 20, name: "prompt injection: identity override" },
  { re: /system\s*prompt/i, weight: 25, name: "system prompt exfil attempt" },
  { re: /\bsecret\b.*/i, weight: 15, name: "secret reference" },
  { re: /\bapi[_-]?key\b/i, weight: 20, name: "API key reference" },
  { re: /\bpassword\b/i, weight: 20, name: "password reference" },
  { re: /\btoken\b/i, weight: 12, name: "token reference" },
]

export interface RiskAssessment {
  baseScore: number
  baseLevel: RiskLevel
  finalScore: number
  finalLevel: RiskLevel
  factors: RiskFactor[]
  inputFlags: string[]
}

export function assessRisk(
  toolName: string,
  input: Record<string, unknown>,
  agentTrustScore: number = 50
): RiskAssessment {
  const base = getToolBaseRisk(toolName)
  const factors: RiskFactor[] = []
  const inputFlags: string[] = []

  // 1. Base tool risk
  factors.push({
    factor: "Tool base risk",
    weight: base.score,
    description: `Tool category "${toolName.split(".")[0]}" base risk`,
  })

  let extra = 0

  // 2. Input pattern analysis
  const inputStr = JSON.stringify(input)
  for (const p of DESTRUCTIVE_PATTERNS) {
    if (p.re.test(inputStr)) {
      extra += p.weight
      inputFlags.push(p.name)
      factors.push({
        factor: p.name,
        weight: p.weight,
        description: "Dangerous pattern detected in input",
      })
    }
  }

  // 3. Input size (large inputs = more injection surface)
  if (inputStr.length > 5000) {
    extra += 5
    factors.push({
      factor: "Large input payload",
      weight: 5,
      description: `Input size ${inputStr.length} chars exceeds 5000`,
    })
  }

  // 4. Agent trust modifier — untrusted agents add risk
  const trustModifier = Math.round((50 - agentTrustScore) / 4) // -12 to +12
  if (trustModifier !== 0) {
    extra += trustModifier
    factors.push({
      factor: "Agent trust modifier",
      weight: trustModifier,
      description: `Agent trust score ${agentTrustScore}/100 adjusts risk`,
    })
  }

  const finalScore = Math.max(0, Math.min(100, base.score + extra))
  const finalLevel = scoreToLevel(finalScore)

  return {
    baseScore: base.score,
    baseLevel: base.level,
    finalScore,
    finalLevel,
    factors,
    inputFlags,
  }
}
