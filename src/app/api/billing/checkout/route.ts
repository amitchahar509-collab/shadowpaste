import { NextRequest, NextResponse } from "next/server"
import { getContext } from "@/lib/auth"
import { PLANS } from "@/lib/billing"
import { db } from "@/lib/db"

// POST /api/billing/checkout — create a Stripe Checkout session for a plan
// Body: { plan: "PRO" | "TEAM" | "ENTERPRISE" }
export async function POST(req: NextRequest) {
  const ctx = await getContext(req)
  if (!ctx || !ctx.user) return NextResponse.json({ error: "authentication required" }, { status: 401 })

  const { plan } = await req.json()
  const planConfig = PLANS[plan as keyof typeof PLANS]
  if (!planConfig || planConfig.price === 0) return NextResponse.json({ error: "invalid plan" }, { status: 400 })

  // Get org
  const membership = await db.membership.findFirst({ where: { userId: ctx.user.id }, include: { org: true } })
  if (!membership) return NextResponse.json({ error: "no organization found" }, { status: 404 })

  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    // Dev mode: return a mock checkout URL (clearly marked)
    return NextResponse.json({
      ok: true,
      dev: true,
      message: "Stripe not configured (STRIPE_SECRET_KEY missing). In production this returns a real Checkout URL.",
      plan: planConfig.name,
      price: planConfig.price,
      mockCheckoutUrl: `/billing/success?plan=${plan}&org=${membership.org.id}`,
    })
  }

  // Real Stripe Checkout
  try {
    const origin = req.headers.get("origin") || "http://localhost:3000"
    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        mode: "subscription",
        "line_items[0][price]": planConfig.stripePriceId!,
        "line_items[0][quantity]": "1",
        success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/billing/cancel`,
        client_reference_id: membership.org.id,
        customer_email: ctx.user.email,
      }),
    })
    const session = await res.json()
    if (!res.ok) throw new Error(session.error?.message || "Stripe error")
    return NextResponse.json({ ok: true, checkoutUrl: session.url, sessionId: session.id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
