// ShadowPaste — filesystem path confinement
//
// The workspace engine takes caller-supplied directory paths (the project to
// scan, the project to restore into). Those values reach fs.readFile and
// fs.writeFile, so they must be confined to an explicitly allowed set of roots
// before use. path.resolve() alone does NOT do this: it normalises a path but
// happily accepts any absolute location on the host.
//
// Allowed roots come from SHADOWPASTE_PROJECT_ROOTS (OS path-delimiter
// separated). When unset we fall back to the process working directory, which
// keeps local single-user usage working without configuration.

import path from "path"
import { promises as fs } from "fs"

export class PathNotAllowedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PathNotAllowedError"
  }
}

/** Directories the server is permitted to read from and write to. */
export function allowedRoots(): string[] {
  const raw = process.env.SHADOWPASTE_PROJECT_ROOTS
  if (!raw || !raw.trim()) return [path.resolve(process.cwd())]
  return raw
    .split(path.delimiter)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p))
}

/** True when `child` is `parent` or sits underneath it. */
export function isWithin(parent: string, child: string): boolean {
  const rel = path.relative(parent, child)
  // "" means identical; a leading ".." or an absolute result means outside.
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))
}

/**
 * Resolve a caller-supplied path and assert it falls inside an allowed root.
 * Symlinks are resolved first where the path exists, so a symlink inside an
 * allowed root cannot be used to escape it.
 */
export async function resolveWithinRoots(input: string, label = "path"): Promise<string> {
  if (typeof input !== "string" || !input.trim()) {
    throw new PathNotAllowedError(`${label} is required`)
  }
  if (input.includes("\0")) {
    throw new PathNotAllowedError(`${label} contains an invalid character`)
  }

  let resolved = path.resolve(input)
  // Resolve symlinks on the deepest existing ancestor so that neither the path
  // itself nor a parent can hop outside an allowed root via a link.
  try {
    resolved = await fs.realpath(resolved)
  } catch {
    let parent = path.dirname(resolved)
    for (let i = 0; i < 64 && parent !== path.dirname(parent); i++) {
      try {
        resolved = path.join(await fs.realpath(parent), path.relative(parent, resolved))
        break
      } catch {
        parent = path.dirname(parent)
      }
    }
  }

  const roots = allowedRoots()
  if (!roots.some((root) => isWithin(root, resolved))) {
    throw new PathNotAllowedError(
      `${label} is outside the allowed project roots. ` +
        `Set SHADOWPASTE_PROJECT_ROOTS to permit this location.`
    )
  }
  return resolved
}

/** Assert a resolved path is an existing directory. */
export async function assertDirectory(resolved: string, label = "path"): Promise<void> {
  let stat
  try {
    stat = await fs.stat(resolved)
  } catch {
    throw new PathNotAllowedError(`${label} not found`)
  }
  if (!stat.isDirectory()) throw new PathNotAllowedError(`${label} must be a directory`)
}
