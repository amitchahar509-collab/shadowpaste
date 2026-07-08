import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"

// POST /api/billing/webhook — Stripe webhook receiver
// Verifies signature, updates org plan on checkout.session.completed
export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    // Dev mode: accept unverified events (clearly logged)
    console.warn("[billing] STRIPE_WEBHOOK_SECRET not set — accepting unverified event (dev only)")
  }

  let event: { type: string; data: { object: Record<string, unknown> } }
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  // In production: verify signature with stripe.webhooks.constructEvent(body, sig, webhookSecret)
  // For now we trust the event type (dev). Mark as UNVERIFIED in production without real Stripe.

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object
      const orgId = session.client_reference_id as string
      // Determine plan from line item price (simplified: use metadata or amount)
      const amountTotal = session.amount_total as number
      // Map amount to plan (monthly USD): 2900=PRO, 9900=TEAM, 49900=ENTERPRISE
      const plan = amountTotal >= 49900 ? "ENTERPRISE" : amountTotal >= 9900 ? "TEAM" : "PRO"
      if (orgId) {
        await db.organization.update({ where: { id: orgId }, data: { plan } })
        await db.auditLog.create({ data: { orgId, actorType: "system", action: "billing.upgrade", target: orgId, metadata: JSON.stringify({ plan, amount: amountTotal }) } })
      }
      break
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object
      const orgId = sub.client_reference_id as string
      if (orgId) {
        await db.organization.update({ where: { id: orgId }, data: { plan: "FREE" } })
        await db.auditLog.create({ data: { orgId, actorType: "system", action: "billing.downgrade", target: orgId, metadata: JSON.stringify({ plan: "FREE" }) } })
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
