// ShadowPaste V20 — Billing + Usage Limits
// Plan-based limits + Stripe checkout/webhook helpers.

export type Plan = "FREE" | "PRO" | "TEAM" | "ENTERPRISE"

export interface PlanConfig {
  name: Plan
  price: number // USD/month, 0 for free
  stripePriceId?: string
  limits: {
    agents: number
    toolCallsPerMonth: number
    vaultSecrets: number
    scansPerMonth: number
    members: number
  }
  features: string[]
}

export const PLANS: Record<Plan, PlanConfig> = {
  FREE: {
    name: "FREE",
    price: 0,
    limits: { agents: 3, toolCallsPerMonth: 500, vaultSecrets: 10, scansPerMonth: 10, members: 1 },
    features: ["3 AI agents", "500 MCP calls/month", "10 vaulted secrets", "10 repo scans/month", "Community support"],
  },
  PRO: {
    name: "PRO",
    price: 29,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID || "price_pro_placeholder",
    limits: { agents: 25, toolCallsPerMonth: 10000, vaultSecrets: 200, scansPerMonth: 100, members: 5 },
    features: ["25 AI agents", "10K MCP calls/month", "200 vaulted secrets", "100 repo scans/month", "5 team members", "Audit trail export", "Priority support"],
  },
  TEAM: {
    name: "TEAM",
    price: 99,
    stripePriceId: process.env.STRIPE_TEAM_PRICE_ID || "price_team_placeholder",
    limits: { agents: 100, toolCallsPerMonth: 100000, vaultSecrets: 1000, scansPerMonth: 500, members: 25 },
    features: ["100 AI agents", "100K MCP calls/month", "1K vaulted secrets", "500 repo scans/month", "25 team members", "SSO ready", "Audit trail export", "Dedicated support"],
  },
  ENTERPRISE: {
    name: "ENTERPRISE",
    price: 499,
    stripePriceId: process.env.STRIPE_ENT_PRICE_ID || "price_ent_placeholder",
    limits: { agents: 1000, toolCallsPerMonth: 1000000, vaultSecrets: 10000, scansPerMonth: 5000, members: 200 },
    features: ["Unlimited-scale agents", "1M MCP calls/month", "10K vaulted secrets", "5K repo scans/month", "200 members", "SSO/SAML", "Audit trail export", "SLA + dedicated CSM", "On-prem option"],
  },
}

export function getPlan(orgPlan: string): PlanConfig {
  return PLANS[(orgPlan || "FREE").toUpperCase() as Plan] || PLANS.FREE
}

// Check whether an org can perform an action based on its plan limits.
// Returns { ok: true } or { ok: false, reason, limit, current }
export interface UsageCheck {
  ok: boolean
  reason?: string
  limit?: number
  current?: number
}

export async function checkUsageLimit(orgId: string, metric: "agents" | "toolCallsPerMonth" | "vaultSecrets" | "scansPerMonth" | "members", orgPlan: string): Promise<UsageCheck> {
  const plan = getPlan(orgPlan)
  const limit = plan.limits[metric]
  const { db } = await import("@/lib/db")

  let current = 0
  switch (metric) {
    case "agents": current = await db.agent.count({ where: { orgId } }); break
    case "vaultSecrets": current = await db.vaultEntry.count({ where: { orgId } }); break
    case "members": current = await db.membership.count({ where: { orgId } }); break
    case "toolCallsPerMonth": {
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      current = await db.toolCall.count({ where: { agent: { orgId }, createdAt: { gte: monthAgo } } })
      break
    }
    case "scansPerMonth": {
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      current = await db.scan.count({ where: { project: { orgId }, createdAt: { gte: monthAgo } } })
      break
    }
  }

  if (current >= limit) {
    return { ok: false, reason: `${metric} limit (${limit}) reached for ${plan.name} plan. Upgrade to continue.`, limit, current }
  }
  return { ok: true, limit, current }
}
