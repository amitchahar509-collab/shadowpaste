import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { seedDatabase } from "@/lib/seed"

export async function GET() {
  try {
    const result = await seedDatabase()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}

export async function POST() {
  try {
    const result = await seedDatabase()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
