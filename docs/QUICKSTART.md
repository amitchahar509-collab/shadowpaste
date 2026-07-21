# Quick Start

This walks through the core loop: **protect → let AI edit → restore**.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- Node.js ≥ 20 (Prisma native bindings + WebCrypto)

## 1. Install and set up

```bash
bun install
cp .env.example .env
bun run db:push        # creates the local SQLite database
```

## 2. Protect a project

Point the CLI at any project directory:

```bash
bun run cli/index.ts protect -p /path/to/your/project
```

ShadowPaste scans the project, vaults each secret it finds (AES-GCM-256), and
writes a copy to `.workspaces/<project>-<id>/` where every secret is replaced
with a **format-compatible fake**. A `.shadowpaste-meta.json` inside the
workspace records the real↔fake mapping (used only locally, by `restore`).

## 3. Let AI edit the workspace

Open the generated workspace in your AI coding tool:

```bash
cursor .workspaces/<project>-<id>/
# or
claude .workspaces/<project>-<id>/
```

The AI sees fakes like `sk-proj-shadow-…` — valid shape, dead credential. Code
runs, tests pass, and the AI can edit freely.

## 4. Restore real secrets

When you are done:

```bash
bun run cli/index.ts restore
```

Every file is copied back to the source project — **AI edits are preserved**,
and each fake is swapped back to its real secret so you can commit.

## Using the dashboard instead

```bash
bun run dev            # http://localhost:3000
```

Create an account, then drive the same flow through the UI (Public Scanner,
AI-Safe GitHub, Vault, MCP Gateway, and the rest of the 13 modules).

> The dashboard's mutating and file-touching endpoints require authentication.
> The CLI works directly on your local filesystem and needs no server.

## Next steps

- [Configuration](CONFIGURATION.md) — environment variables
- [Installation](INSTALLATION.md) — Docker and production
- [API Reference](API.md) — driving ShadowPaste over HTTP
