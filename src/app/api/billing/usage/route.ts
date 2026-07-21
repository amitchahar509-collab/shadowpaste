import { NextRequest, NextResponse } from "next/server"
import { getContext, anonymousContext } from "@/lib/auth"
import { getPlan, checkUsageLimit } from "@/lib/billing"
import { db } from "@/lib/db"

// GET /api/billing/usage — current org's plan + usage vs limits
export async function GET(req: NextRequest) {
  const ctx = await getContext(req) || anonymousContext()
  const org = await db.organization.findUnique({ where: { id: ctx.orgId } })
  const plan = getPlan(org?.plan || "FREE")

  const checks = await Promise.all([
    checkUsageLimit(ctx.orgId, "agents", plan.name),
    checkUsageLimit(ctx.orgId, "toolCallsPerMonth", plan.name),
    checkUsageLimit(ctx.orgId, "vaultSecrets", plan.name),
    checkUsageLimit(ctx.orgId, "scansPerMonth", plan.name),
    checkUsageLimit(ctx.orgId, "members", plan.name),
  ])

  return NextResponse.json({
    plan: { name: plan.name, price: plan.price, features: plan.features },
    usage: {
      agents: { current: checks[0].current, limit: checks[0].limit, ok: checks[0].ok },
      toolCallsThisMonth: { current: checks[1].current, limit: checks[1].limit, ok: checks[1].ok },
      vaultSecrets: { current: checks[2].current, limit: checks[2].limit, ok: checks[2].ok },
      scansThisMonth: { current: checks[3].current, limit: checks[3].limit, ok: checks[3].ok },
      members: { current: checks[4].current, limit: checks[4].limit, ok: checks[4].ok },
    },
  })
}
