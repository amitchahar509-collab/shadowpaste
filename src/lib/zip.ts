// ShadowPaste — dependency-free ZIP extraction
//
// The ZIP-upload import needs to expand an archive server-side before the
// workspace engine scans it. Rather than pull in a native/3rd-party unzip
// dependency, this parses the ZIP container directly and inflates entries with
// Node's built-in zlib (raw DEFLATE). It handles the two compression methods
// every mainstream zip tool emits — stored (0) and deflate (8) — and rejects
// anything it can't safely handle (ZIP64, encryption, unknown methods) with a
// clear message instead of producing corrupt output.
//
// Security properties:
//   - Zip-slip: every entry path is resolved against the destination and
//     rejected if it would escape it (via "../" or an absolute path).
//   - Zip-bomb: hard caps on file count and total uncompressed bytes.

import path from "path"
import zlib from "zlib"
import { promises as fs } from "fs"

const EOCD_SIG = 0x06054b50 // End of Central Directory
const CDH_SIG = 0x02014b50 // Central Directory File Header
const LFH_SIG = 0x04034b50 // Local File Header

export class ZipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ZipError"
  }
}

export interface ExtractOptions {
  /** Reject archives that expand to more than this many files. */
  maxFiles?: number
  /** Reject archives whose entries sum to more than this many uncompressed bytes. */
  maxTotalBytes?: number
  /** Directory names to skip entirely (e.g. node_modules, .git). */
  skipDirs?: Set<string>
}

export interface ExtractResult {
  /** Files written to disk. */
  files: number
  /** Entries skipped because they matched skipDirs. */
  skipped: number
  /** Common top-level folder that was stripped (e.g. "repo-main/"), or null. */
  rootPrefix: string | null
}

interface CdEntry {
  method: number
  compressedSize: number
  uncompressedSize: number
  localOffset: number
  fileName: string
  encrypted: boolean
}

/** Extract `buf` (an in-memory ZIP) into `destDir`. Creates destDir if needed. */
export async function extractZip(buf: Buffer, destDir: string, opts: ExtractOptions = {}): Promise<ExtractResult> {
  const maxFiles = opts.maxFiles ?? 20000
  const maxTotalBytes = opts.maxTotalBytes ?? 500 * 1024 * 1024 // 500 MB expanded
  const skipDirs = opts.skipDirs ?? new Set<string>()

  const eocd = findEOCD(buf)
  if (!eocd) throw new ZipError("Not a valid ZIP file (no end-of-central-directory record found).")
  if (eocd.cdCount === 0xffff || eocd.cdOffset === 0xffffffff || eocd.cdSize === 0xffffffff) {
    throw new ZipError("ZIP64 archives are not supported. Re-create the archive without ZIP64, or upload the project as a folder path.")
  }

  const entries = readCentralDirectory(buf, eocd.cdOffset, eocd.cdCount)
  if (entries.length === 0) throw new ZipError("ZIP central directory is empty or unreadable.")

  // Reject an oversized archive from the central directory BEFORE inflating
  // anything. The per-entry checks below alone let an adversarial 20,000-entry
  // ZIP write maxFiles files first — measured at 11 SECONDS, which on a
  // serverless host means the request times out (and leaves a partial tree
  // behind) instead of returning a clean 4xx. The directory already states the
  // counts, so this costs nothing.
  if (entries.length > maxFiles) {
    throw new ZipError(`ZIP contains too many files (${entries.length}, limit ${maxFiles}).`)
  }
  const declaredBytes = entries.reduce((n, e) => n + (e.uncompressedSize || 0), 0)
  if (declaredBytes > maxTotalBytes) {
    throw new ZipError(`ZIP expands too large (limit ${Math.round(maxTotalBytes / 1048576)} MB).`)
  }

  const rootPrefix = detectRootPrefix(entries)
  const destResolved = path.resolve(destDir)
  await fs.mkdir(destResolved, { recursive: true })

  let files = 0
  let skipped = 0
  let totalBytes = 0

  for (const e of entries) {
    let name = e.fileName.replace(/\\/g, "/")
    if (rootPrefix && name.startsWith(rootPrefix)) name = name.slice(rootPrefix.length)
    if (!name || name.endsWith("/")) continue // directory entry — created lazily below

    const segments = name.split("/").filter(Boolean)
    if (segments.length === 0) continue
    if (segments.some((s) => skipDirs.has(s))) {
      skipped++
      continue
    }

    // Zip-slip: the resolved output must stay inside destDir.
    const outPath = path.resolve(destResolved, name)
    if (outPath !== destResolved && !outPath.startsWith(destResolved + path.sep)) {
      throw new ZipError(`Refusing to extract entry outside the destination: ${e.fileName}`)
    }
    if (e.encrypted) throw new ZipError("Encrypted ZIP entries are not supported.")

    if (files >= maxFiles) throw new ZipError(`ZIP contains too many files (limit ${maxFiles}).`)
    totalBytes += e.uncompressedSize
    if (totalBytes > maxTotalBytes) {
      throw new ZipError(`ZIP expands too large (limit ${Math.round(maxTotalBytes / 1048576)} MB).`)
    }

    const data = inflateEntry(buf, e)
    await fs.mkdir(path.dirname(outPath), { recursive: true })
    await fs.writeFile(outPath, data)
    files++
  }

  return { files, skipped, rootPrefix }
}

/** Scan backwards from the end for the EOCD signature (comment may be up to 64 KB). */
function findEOCD(buf: Buffer): { cdCount: number; cdSize: number; cdOffset: number } | null {
  const MIN = 22
  if (buf.length < MIN) return null
  const maxBack = Math.min(buf.length, 65557) // 22 + max 65535-byte comment
  for (let i = buf.length - MIN; i >= buf.length - maxBack; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      return {
        cdCount: buf.readUInt16LE(i + 10),
        cdSize: buf.readUInt32LE(i + 12),
        cdOffset: buf.readUInt32LE(i + 16),
      }
    }
  }
  return null
}

function readCentralDirectory(buf: Buffer, offset: number, count: number): CdEntry[] {
  const entries: CdEntry[] = []
  let p = offset
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CDH_SIG) break
    const flag = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const uncompressedSize = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const fileName = buf.toString("utf8", p + 46, p + 46 + nameLen)
    entries.push({
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
      fileName,
      encrypted: (flag & 0x1) !== 0,
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

/** Read + decompress one entry's data using its local header for the exact data offset. */
function inflateEntry(buf: Buffer, e: CdEntry): Buffer {
  const lh = e.localOffset
  if (lh + 30 > buf.length || buf.readUInt32LE(lh) !== LFH_SIG) {
    throw new ZipError(`Corrupt ZIP: bad local header for ${e.fileName}.`)
  }
  const nameLen = buf.readUInt16LE(lh + 26)
  const extraLen = buf.readUInt16LE(lh + 28)
  const dataStart = lh + 30 + nameLen + extraLen
  const compressed = buf.subarray(dataStart, dataStart + e.compressedSize)

  if (e.method === 0) return Buffer.from(compressed) // stored
  if (e.method === 8) return zlib.inflateRawSync(compressed) // deflate
  throw new ZipError(`Unsupported ZIP compression method (${e.method}) for ${e.fileName}.`)
}

/**
 * Detect a single wrapping top-level folder — the shape GitHub/most "Download
 * ZIP" tools produce ("reponame-branch/…"). Returned prefix is stripped so the
 * workspace isn't needlessly nested one level deep. Returns null when files sit
 * at the archive root or span multiple top-level folders.
 */
function detectRootPrefix(entries: CdEntry[]): string | null {
  const firsts = new Set<string>()
  for (const e of entries) {
    const name = e.fileName.replace(/\\/g, "/")
    if (!name) continue
    const seg = name.split("/")[0]
    if (seg) firsts.add(seg)
    if (firsts.size > 1) return null // more than one top-level entry → no common wrapper
  }
  if (firsts.size !== 1) return null
  const only = [...firsts][0]
  const prefix = only + "/"
  // Only strip if something actually lives under it (i.e. it's a real wrapper folder).
  const hasChildren = entries.some((e) => {
    const n = e.fileName.replace(/\\/g, "/")
    return n.startsWith(prefix) && n !== prefix
  })
  return hasChildren ? prefix : null
}
