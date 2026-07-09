// ShadowPaste V18 — Policy / Permission Engine
// Decides ALLOW / DENY / ASK / SANDBOX for every tool call

import { RiskAssessment, RiskLevel } from "./risk"
import { db } from "./db"

export type Decision = "allow_always" | "allow_once" | "ask" | "deny" | "sandbox"

export interface PolicyInput {
  agentId: string
  sessionId: string
  toolName: string
  risk: RiskAssessment
  agentTrustScore: number
}

export interface PolicyResult {
  decision: Decision
  reason: string
  policy: string
  auditRequired: boolean
}

// Hard rules: always deny regardless of permission
const HARD_DENY: Record<string, string> = {
  "github.repo.delete": "Production repository deletion is permanently denied by global policy",
  "db.schema.drop": "Schema destruction is permanently denied by global policy",
  "fs.execute": "Arbitrary filesystem execution is permanently denied (use sandbox)",
  "db.export": "Full database export is permanently denied (use scoped read)",
  "stripe.charge": "Direct payment charges require human approval flow",
}

// Auto-allow low risk read operations for trusted agents
const AUTO_ALLOW_LOW = ["fs.read", "github.read", "db.read", "network.fetch", "stripe.read", "ai.generate"]

export async function evaluatePolicy(input: PolicyInput): Promise<PolicyResult> {
  const { agentId, toolName, risk, agentTrustScore } = input

  // RULE 0: Hard deny
  if (HARD_DENY[toolName]) {
    return {
      decision: "deny",
      reason: HARD_DENY[toolName],
      policy: "HARD_DENY_GLOBAL",
      auditRequired: true,
    }
  }

  // RULE 1: Critical risk — always deny unless sandbox
  if (risk.finalLevel === "critical") {
    if (risk.finalScore < 95) {
      return {
        decision: "sandbox",
        reason: `Critical risk (${risk.finalScore}/100) — routing to shadow sandbox for human review`,
        policy: "CRITICAL_SANDBOX",
        auditRequired: true,
      }
    }
    return {
      decision: "deny",
      reason: `Critical risk score ${risk.finalScore}/100 exceeds deny threshold`,
      policy: "CRITICAL_DENY",
      auditRequired: true,
    }
  }

  // RULE 2: Check existing explicit permission for this agent+tool
  const existing = await db.permission.findFirst({
    where: { agentId, toolName },
    orderBy: { updatedAt: "desc" },
  })

  if (existing) {
    if (existing.decision === "allow_always") {
      // Honor allow_always only if risk stays within the granted level
      if (riskLevelOrdinal(risk.finalLevel) <= riskLevelOrdinal(existing.riskLevel as RiskLevel)) {
        return {
          decision: "allow_always",
          reason: `Pre-approved "${existing.decision}" for ${toolName}`,
          policy: "EXISTING_PERMISSION",
          auditRequired: risk.finalLevel !== "low",
        }
      }
      return {
        decision: "ask",
        reason: `Risk escalated beyond granted "${existing.riskLevel}" level — re-confirmation required`,
        policy: "RISK_ESCALATION",
        auditRequired: true,
      }
    }
    if (existing.decision === "deny") {
      return {
        decision: "deny",
        reason: `Agent was previously denied access to ${toolName}`,
        policy: "EXISTING_DENY",
        auditRequired: true,
      }
    }
    // "ask" falls through
  }

  // RULE 3: Auto-allow low-risk reads for trusted agents (trust >= 70)
  const toolPrefix = toolName.split(".").slice(0, 2).join(".")
  if (AUTO_ALLOW_LOW.includes(toolPrefix) && risk.finalLevel === "low" && agentTrustScore >= 70) {
    return {
      decision: "allow_once",
      reason: `Auto-approved low-risk read for trusted agent (${agentTrustScore}/100)`,
      policy: "TRUSTED_AUTO_ALLOW",
      auditRequired: false,
    }
  }

  // RULE 4: High risk — require explicit ask (unless already allowed)
  if (risk.finalLevel === "high") {
    return {
      decision: "ask",
      reason: `High risk (${risk.finalScore}/100) — explicit user approval required`,
      policy: "HIGH_RISK_ASK",
      auditRequired: true,
    }
  }

  // RULE 5: Medium risk — ask if agent trust low, allow_once if high trust
  if (risk.finalLevel === "medium") {
    if (agentTrustScore >= 80 && inputFlagsClean(risk)) {
      return {
        decision: "allow_once",
        reason: `Medium risk auto-approved for highly trusted agent (${agentTrustScore}/100)`,
        policy: "MEDIUM_TRUSTED_ALLOW",
        auditRequired: true,
      }
    }
    return {
      decision: "ask",
      reason: `Medium risk (${risk.finalScore}/100) — approval recommended`,
      policy: "MEDIUM_RISK_ASK",
      auditRequired: true,
    }
  }

  // RULE 6: Low risk — allow once
  return {
    decision: "allow_once",
    reason: `Low risk (${risk.finalScore}/100) — auto-approved`,
    policy: "LOW_RISK_ALLOW",
    auditRequired: false,
  }
}

function riskLevelOrdinal(l: RiskLevel): number {
  return { low: 0, medium: 1, high: 2, critical: 3 }[l]
}

function inputFlagsClean(risk: RiskAssessment): boolean {
  // If input contains any prompt-injection flags, don't auto-allow
  const injectionFlags = risk.inputFlags.filter((f) => f.toLowerCase().includes("injection"))
  return injectionFlags.length === 0
}
