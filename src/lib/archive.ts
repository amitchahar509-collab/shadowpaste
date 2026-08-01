// ShadowPaste — unified archive extraction (dependency-free).
//
// Dispatches by file type to a format-specific extractor and writes the tree
// into a destination directory. Supports:
//   .zip                      -> zip.ts (DEFLATE/stored)
//   .tar                      -> tar parser below
//   .tar.gz / .tgz / .gz-tar  -> gunzip (node:zlib) then tar parser
//
// Shares the zip extractor's safety model: zip-slip protection, file-count and
// total-size caps, and skip-dirs. Everything is parsed in-process with Node's
// built-in zlib — no third-party unpack dependency.

import path from "path"
import zlib from "zlib"
import { promises as fs } from "fs"
import { extractZip, ZipError, type ExtractOptions, type ExtractResult } from "./zip"

export { ZipError } from "./zip"
export type { ExtractResult, ExtractOptions } from "./zip"

export type ArchiveKind = "zip" | "tar" | "tgz"

/**
 * Limits for archives arriving over HTTP (uploads, remote tarballs).
 *
 * The library defaults (20,000 files / 500 MB) are sized for a trusted local
 * CLI import. They are far too permissive for a request handler: an adversarial
 * 20,000-entry ZIP measured 45 SECONDS of extraction on one request, and a
 * single 60 MB entry expanded with no ceiling — on a serverless host that is
 * request-timeout exhaustion plus a shared /tmp that other invocations need.
 *
 * A project being imported for a secret scan does not need 20,000 files, and
 * build output is skipped rather than counted against the budget.
 */
export const IMPORT_LIMITS: ExtractOptions = {
  maxFiles: 5000,
  maxTotalBytes: 100 * 1024 * 1024,
  skipDirs: new Set(["node_modules", ".git", ".next", "dist", "build", ".workspaces", "vendor", "target"]),
}

/** Classify an upload by filename + magic bytes. Returns null if unsupported. */
export function classifyArchive(filename: string, buf: Buffer): ArchiveKind | null {
  const name = (filename || "").toLowerCase()
  // Magic bytes take priority over extension where possible.
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b
  const isZip = buf.length > 3 && buf[0] === 0x50 && buf[1] === 0x4b // "PK"
  if (isZip || name.endsWith(".zip")) return "zip"
  if (isGzip || name.endsWith(".tar.gz") || name.endsWith(".tgz") || name.endsWith(".gz")) return "tgz"
  if (name.endsWith(".tar") || looksLikeTar(buf)) return "tar"
  return null
}

/** ustar magic sits at offset 257 of the first header block. */
function looksLikeTar(buf: Buffer): boolean {
  return buf.length >= 265 && buf.toString("ascii", 257, 262) === "ustar"
}

export const SUPPORTED_ARCHIVE_EXTS = [".zip", ".tar", ".tar.gz", ".tgz", ".gz"]

/** Extract any supported archive `buf` (named `filename`) into `destDir`. */
export async function extractArchive(
  buf: Buffer,
  filename: string,
  destDir: string,
  opts: ExtractOptions = {}
): Promise<ExtractResult & { kind: ArchiveKind }> {
  const kind = classifyArchive(filename, buf)
  if (!kind) throw new ZipError("Unsupported archive type. Use .zip, .tar, .tar.gz, or .tgz.")

  if (kind === "zip") {
    const r = await extractZip(buf, destDir, opts)
    return { ...r, kind }
  }
  // tar (optionally gzip-wrapped)
  let tarBuf = buf
  if (kind === "tgz") {
    try {
      tarBuf = zlib.gunzipSync(buf)
    } catch {
      throw new ZipError("Could not decompress the .gz archive (corrupt or not gzip).")
    }
  }
  const r = await extractTar(tarBuf, destDir, opts)
  return { ...r, kind }
}

// ---- minimal tar (ustar/GNU) reader -------------------------------------
const BLOCK = 512

function readOctal(buf: Buffer, off: number, len: number): number {
  // tar numeric fields are NUL/space-terminated octal ASCII
  let s = buf.toString("ascii", off, off + len).replace(/\0.*$/, "").trim()
  if (!s) return 0
  // GNU base-256 encoding (high bit set) — rare; treat leading 0x80 as size in binary
  if (buf[off] & 0x80) {
    let n = 0
    for (let i = off + 1; i < off + len; i++) n = n * 256 + buf[i]
    return n
  }
  const n = parseInt(s, 8)
  return Number.isFinite(n) ? n : 0
}

async function extractTar(buf: Buffer, destDir: string, opts: ExtractOptions): Promise<ExtractResult> {
  const maxFiles = opts.maxFiles ?? 20000
  const maxTotalBytes = opts.maxTotalBytes ?? 500 * 1024 * 1024
  const skipDirs = opts.skipDirs ?? new Set<string>()

  const destResolved = path.resolve(destDir)
  await fs.mkdir(destResolved, { recursive: true })

  // First pass: collect entry paths to detect a common wrapping folder.
  const names: string[] = []
  { let o = 0
    while (o + BLOCK <= buf.length) {
      if (buf[o] === 0) break
      const nameField = buf.toString("utf8", o, o + 100).replace(/\0.*$/, "")
      const prefix = buf.toString("utf8", o + 345, o + 500).replace(/\0.*$/, "")
      const typeflag = String.fromCharCode(buf[o + 156] || 0)
      const size = readOctal(buf, o + 124, 12)
      const full = prefix ? `${prefix}/${nameField}` : nameField
      if (typeflag !== "L" && typeflag !== "K" && typeflag !== "x" && typeflag !== "g" && full) names.push(full.replace(/\\/g, "/"))
      o += BLOCK + Math.ceil(size / BLOCK) * BLOCK
    }
  }
  const rootPrefix = detectRootPrefix(names)

  let files = 0, skipped = 0, total = 0
  let longName: string | null = null
  let o = 0
  while (o + BLOCK <= buf.length) {
    if (buf[o] === 0) break // end-of-archive zero block
    let name = buf.toString("utf8", o, o + 100).replace(/\0.*$/, "")
    const prefix = buf.toString("utf8", o + 345, o + 500).replace(/\0.*$/, "")
    const size = readOctal(buf, o + 124, 12)
    const typeflag = String.fromCharCode(buf[o + 156] || 0)
    const dataStart = o + BLOCK
    const dataBlocks = Math.ceil(size / BLOCK)

    if (typeflag === "L") {
      // GNU long name: the data holds the real name for the NEXT entry
      longName = buf.toString("utf8", dataStart, dataStart + size).replace(/\0.*$/, "")
      o = dataStart + dataBlocks * BLOCK
      continue
    }
    if (typeflag === "x" || typeflag === "g" || typeflag === "K") {
      // pax/extended headers — skip
      o = dataStart + dataBlocks * BLOCK
      continue
    }

    let full = (longName || (prefix ? `${prefix}/${name}` : name)).replace(/\\/g, "/")
    longName = null

    const isDir = typeflag === "5" || full.endsWith("/")
    if (rootPrefix && full.startsWith(rootPrefix)) full = full.slice(rootPrefix.length)

    if (!isDir && full && (typeflag === "0" || typeflag === "\0" || typeflag === "7")) {
      const segments = full.split("/").filter(Boolean)
      if (segments.some((s) => skipDirs.has(s))) {
        skipped++
      } else {
        const outPath = path.resolve(destResolved, full)
        if (outPath !== destResolved && !outPath.startsWith(destResolved + path.sep)) {
          throw new ZipError(`Refusing to extract entry outside the destination: ${full}`)
        }
        if (files >= maxFiles) throw new ZipError(`Archive contains too many files (limit ${maxFiles}).`)
        total += size
        if (total > maxTotalBytes) throw new ZipError(`Archive expands too large (limit ${Math.round(maxTotalBytes / 1048576)} MB).`)
        const data = buf.subarray(dataStart, dataStart + size)
        await fs.mkdir(path.dirname(outPath), { recursive: true })
        await fs.writeFile(outPath, data)
        files++
      }
    }
    o = dataStart + dataBlocks * BLOCK
  }

  if (files === 0 && names.length === 0) throw new ZipError("Not a valid tar archive (no entries found).")
  return { files, skipped, rootPrefix }
}

function detectRootPrefix(names: string[]): string | null {
  const firsts = new Set<string>()
  for (const n of names) {
    const seg = n.split("/")[0]
    if (seg) firsts.add(seg)
    if (firsts.size > 1) return null
  }
  if (firsts.size !== 1) return null
  const only = [...firsts][0]
  const prefix = only + "/"
  return names.some((n) => n.startsWith(prefix) && n !== prefix) ? prefix : null
}
