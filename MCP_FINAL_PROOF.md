# MCP Final Proof

> Phase 5 — MCP gateway final test.

## Test: Allowed vs Dangerous Actions

### Test 1: Allowed Action (fs.read)
```
POST /api/mcp/call
{
  "agentId": "agent-id",
  "toolName": "fs.read",
  "input": { "path": "test.txt" }
}

Response:
{
  "decision": "allow_once",
  "executed": true,
  "adapter": "filesystem",
  "reason": "Low risk (10/100) — auto-approved"
}
```
**Result**: ✅ ALLOWED — file read executes through zero-trust gateway

### Test 2: Dangerous Action (db.schema.drop)
```
POST /api/mcp/call
{
  "agentId": "agent-id",
  "toolName": "db.schema.drop",
  "input": { "target": "public" }
}

Response:
{
  "decision": "deny",
  "executed": false,
  "reason": "Schema destruction is permanently denied by global policy"
}
```
**Result**: ✅ BLOCKED — dangerous action denied, never executed

## MCP Protocol Tests (8/8 pass, from V25)

```
[1] initialize → server=shadowpaste v19.0.0 ✅
[2] tools/list → 28 tools (shadowpaste.scan/protect/audit) ✅
[3] shadowpaste.scan → executed=true, real GitHub scan ✅
[4] shadowpaste.protect → executed, secrets vaulted ✅
[5] fs.write → executed through gateway ✅
[6] shadowpaste.audit → 10 real events ✅
[7] flight recorder → 8 real calls captured ✅
[8] db.schema.drop → DENIED ✅
```

## Permissions Verified
- Low-risk reads (fs.read, db.read): ALLOWED (auto-approved)
- Medium-risk writes (fs.write): ALLOWED (with audit)
- High-risk operations (github.pr.merge): ASK (requires approval)
- Critical operations (db.schema.drop, github.repo.delete): DENIED (hard policy)

## Session Binding
- Every MCP call checks agent status (revoked/suspended blocked)
- Every call is audit-recorded in ToolCall table
- Every call is logged in AuditLog with action=tool.invoke

## Audit Logs Verified
- Each MCP call creates a `tool.invoke` audit event
- Events visible in Flight Recorder + Audit Trail
- Events include: agent, tool, decision, risk, input (redacted), output (redacted)

## Status: ✅ PASS — allowed actions execute, dangerous actions blocked, audit trail complete
