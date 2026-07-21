import { NextRequest, NextResponse } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { db } from "@/lib/db"

// POST /api/billing/webhook — Stripe webhook receiver.
//
// The event body drives org plan upgrades, so it MUST be authenticated as
// genuinely from Stripe. Without verification, anyone could POST a forged
// `checkout.session.completed` with amount_total=49900 and upgrade any org to
// ENTERPRISE for free. We verify the `stripe-signature` header using the same
// HMAC-SHA256 scheme as stripe.webhooks.constructEvent (no SDK dependency).

const SIGNATURE_TOLERANCE_S = 5 * 60 // reject events older than 5 minutes

function verifyStripeSignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false
  // Header form: "t=timestamp,v1=sig[,v1=sig...]"
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const i = kv.indexOf("=")
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()]
    })
  ) as { t?: string; v1?: string }
  const t = parts.t
  if (!t || !parts.v1) return false

  // Reject stale timestamps to blunt replay attacks.
  const age = Math.abs(Date.now() / 1000 - Number(t))
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_S) return false

  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex")
  // The header may carry multiple v1 signatures; accept if any matches.
  const provided = header
    .split(",")
    .filter((kv) => kv.trim().startsWith("v1="))
    .map((kv) => kv.slice(kv.indexOf("=") + 1).trim())
  const expBuf = Buffer.from(expected, "hex")
  return provided.some((sig) => {
    const sigBuf = Buffer.from(sig, "hex")
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf)
  })
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (webhookSecret) {
    if (!verifyStripeSignature(body, sig, webhookSecret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 400 })
    }
  } else if (process.env.NODE_ENV === "production") {
    // Never trust an unverified billing event in production.
    console.error("[billing] STRIPE_WEBHOOK_SECRET is not set — refusing unverified webhook in production")
    return NextResponse.json({ error: "webhook verification not configured" }, { status: 503 })
  } else {
    console.warn("[billing] STRIPE_WEBHOOK_SECRET not set — accepting unverified event (dev only)")
  }

  let event: { type: string; data: { object: Record<string, unknown> } }
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 })
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object
      const orgId = session.client_reference_id as string
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
