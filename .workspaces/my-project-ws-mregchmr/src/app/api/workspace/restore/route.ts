import { NextRequest, NextResponse } from "next/server"
import { getContext, anonymousContext } from "@/lib/auth"
import { restoreSecrets, type WorkspaceSecret } from "@/lib/workspace"
import { db } from "@/lib/db"

// POST /api/workspace/restore — restore real secrets back into the source project
// Body: { workspacePath: string, sourcePath: string, secrets: [...] }
export async function POST(req: NextRequest) {
  const ctx = await getContext(req) || anonymousContext()
  const { workspacePath, sourcePath, secrets } = await req.json()
  if (!workspacePath || !sourcePath || !secrets) {
    return NextResponse.json({ error: "workspacePath, sourcePath, secrets required" }, { status: 400 })
  }

  try {
    const result = await restoreSecrets({
      workspacePath,
      sourcePath,
      secrets: secrets as WorkspaceSecret[],
    })

    await db.auditLog.create({
      data: {
        orgId: ctx.orgId,
        actorType: ctx.user ? "user" : "system",
        actorId: ctx.user?.id,
        action: "workspace.restore",
        target: workspacePath,
        metadata: JSON.stringify({ restored: result.restored, errors: result.errors.length }),
      },
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
