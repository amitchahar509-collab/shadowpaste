## What & why
Describe the change and the problem it solves. Link related issues (e.g.
`Closes #123`).

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Security fix
- [ ] Docs
- [ ] Refactor / chore

## Checklist
- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes (app + cli/tests)
- [ ] `bun run build` passes
- [ ] Tests added/updated (and war tests run for auth/gateway changes)
- [ ] New mutating/file-touching endpoints require auth and scope by `orgId`
- [ ] No hardcoded secrets; no real secrets in the diff or description

## Notes for reviewers
Anything that needs special attention.
