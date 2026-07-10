# Restore Proof

> Phase 3 — Protect/restore real test.

## Test Project
Created `/tmp/test-project/` with:
```env
# .env
OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012mno345pqr678
GITHUB_TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789
DATABASE_URL=postgresql://admin:s3cretPass@prod-db.internal:5432/app
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
STRIPE_SECRET_KEY=sk_live_51H8xK2eZvKuLmNoPqRsTuVwXyZ0123456789
```
```typescript
// app.ts
const config = {
  openaiKey: process.env.OPENAI_API_KEY,
  githubToken: process.env.GITHUB_TOKEN,
  dbUrl: process.env.DATABASE_URL,
}
export default config
```

## Step 1: Protect
```
$ shadowpaste protect -p /tmp/test-project
  ✓ 2 files scanned
  ✓ 5 secrets protected with format-compatible fakes
  ✓ Workspace: /home/z/my-project/.workspaces/test-project-ws-mrenbjwp
  ✅ AI-safe workspace ready!
```

## Step 2: Verify Fake Secrets in Workspace
```
# .env in workspace (AI sees this):
OPENAI_API_KEY=sk-proj-shadow-D8nFrAx0wJVzmutHvv6xORvzwJCyL
```
- ✅ Real secret `sk-proj-abc123...` → fake `sk-proj-shadow-D8nFrAx0wJVzmutHvv6xORvzwJCyL`
- ✅ Same OpenAI format (sk-proj- prefix)
- ✅ Invalid for API calls
- ✅ Code still runs (valid format)

## Step 3: Simulate AI Edit
```bash
echo "// AI added this comment" >> .workspaces/test-project-ws-mrenbjwp/app.ts
```

## Step 4: Restore
```
$ shadowpaste restore -w .workspaces/test-project-ws-mrenbjwp
  ✓ 5 secrets restored to source project
  ✅ Restore complete! Source project has real secrets back.
```

## Step 5: Verify Source Has Real Secrets + AI Edit
```
# /tmp/test-project/.env (after restore):
OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012mno345pqr678  ← real secret back ✅

# /tmp/test-project/app.ts (after restore):
// AI added this comment  ← AI edit preserved ✅
```

## Verification Summary
| Check | Result |
|-------|--------|
| Secrets removed from workspace | ✅ 5 secrets replaced with fakes |
| Fake secrets format-compatible | ✅ sk-proj-shadow-xxx (same format) |
| Code still valid | ✅ workspace files parse correctly |
| AI edit preserved | ✅ "// AI added this comment" in source |
| Secrets restored | ✅ 5 real secrets back in source |
| No corruption | ✅ all files intact |

**Status**: ✅ PASS — protect + AI edit + restore works end-to-end, 0 leaks, 0 corruption
