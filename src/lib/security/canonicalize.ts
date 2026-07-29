// ShadowPaste — canonicalization ladder for the secret scanner.
//
// THE GAP THIS CLOSES
// -------------------
// Every detector pattern matches literal text. A credential that has been
// percent-encoded, or written with fullwidth/homoglyph characters, or split by
// zero-width joiners, matches nothing. Measured before this module existed —
// 8 of 9 obfuscations walked straight past a 500-pattern catalog:
//
//   DETECTED  plain (control)
//   MISSED    fully url-encoded          %73%6b%5f%6c%69%76%65...
//   MISSED    partially encoded          sk_live_%35%31...
//   MISSED    double-encoded             %2573%256b...
//   MISSED    encoded in a URL param     ?token=%73%6b...
//   MISSED    NFKC fullwidth             ｓｋ_live_...
//   MISSED    zero-width injected        sk_live_<U+200B>51Qa...
//   MISSED    nested JSON encoded
//
// WHY THIS KEEPS AN INDEX MAP
// ---------------------------
// Returning only the decoded string is not enough, and getting this wrong fails
// silently in the worst possible direction. Downstream redaction and vaulting
// work by substring replacement on the ORIGINAL text:
//
//     sanitized = original.split(finding.raw).join(marker)
//
// If `raw` is the DECODED secret it does not occur in the original, so the
// replacement matches nothing, the call reports "1 secret redacted", and the
// encoded credential is still there. A confident log line and an unmodified
// leak is worse than no detection at all.
//
// So every canonical character carries the [start,end) span of the original
// text that produced it. A match in canonical space maps back to a real span,
// and the scanner reports the ENCODED original as `raw` — the same approach the
// base64 pre-decode pass uses, for the same reason.
//
// BOUNDS
// ------
// Passes are capped (MAX_PASSES) and output length is capped (MAX_LENGTH).
// Decoding is attacker-influenced input, so it must not be able to spin or
// balloon memory. Malformed sequences are left as literal text, never thrown.

const MAX_PASSES = 5;
const MAX_LENGTH = 1_000_000;

// Zero-width, bidi-control, soft-hyphen and word-joiner characters. NFKC does
// NOT remove these - U+200B and friends survive normalization - so they are
// dropped explicitly. Splitting a key with one is the cheapest possible evasion.
//
// Tested numerically rather than with a regex literal: a character class of
// invisible characters is, by definition, invisible in the source, and an
// editor or tool that eats one silently weakens the scanner with no diff to
// review. Code points are auditable.
function isInvisible(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    c === 0x00ad || // soft hyphen
    c === 0xfeff || // zero-width no-break space / BOM
    (c >= 0x200b && c <= 0x200f) || // zero-width space..RLM
    (c >= 0x202a && c <= 0x202e) || // bidi embedding/override
    (c >= 0x2060 && c <= 0x2064) || // word joiner..invisible plus
    (c >= 0x206a && c <= 0x206f) //   deprecated format controls
  );
}

/** Character-level text plus, for each character, its span in the ORIGINAL. */
interface Mapped {
  chars: string[];
  start: number[];
  end: number[];
}

export interface CanonicalResult {
  /** Fully canonicalized text. */
  text: string;
  /** True when canonicalization actually changed something. */
  changed: boolean;
  /** Map a canonical [a,b) range back to an original [start,end) span. */
  toOriginal(a: number, b: number): { start: number; end: number };
}

const isHex = (c: string) => c.length === 1 && /[0-9a-fA-F]/.test(c);

function seed(input: string): Mapped {
  const chars = [...input];
  const start: number[] = [];
  const end: number[] = [];
  // [...input] splits by code point, so a surrogate pair is one entry but two
  // UTF-16 indices. Track real string offsets or every span drifts after the
  // first emoji.
  let offset = 0;
  for (const ch of chars) {
    start.push(offset);
    offset += ch.length;
    end.push(offset);
  }
  return { chars, start, end };
}

/**
 * Decode contiguous runs of %XX. A whole run collapses to one original span:
 * a match covering part of a run expands to the entire run, which
 * over-redacts an encoded blob slightly rather than under-redacting a secret.
 */
function percentDecodePass(m: Mapped): Mapped {
  const out: Mapped = { chars: [], start: [], end: [] };
  const n = m.chars.length;
  let i = 0;
  while (i < n) {
    if (m.chars[i] === "%" && i + 2 < n && isHex(m.chars[i + 1]) && isHex(m.chars[i + 2])) {
      const runStart = i;
      const bytes: number[] = [];
      let j = i;
      while (j + 2 < n && m.chars[j] === "%" && isHex(m.chars[j + 1]) && isHex(m.chars[j + 2])) {
        bytes.push(parseInt(m.chars[j + 1] + m.chars[j + 2], 16));
        j += 3;
      }
      const oStart = m.start[runStart];
      const oEnd = m.end[j - 1];
      let decoded: string;
      if (bytes.every((b) => b < 0x80)) {
        // Pure ASCII — the overwhelmingly common case for credentials.
        decoded = String.fromCharCode(...bytes);
      } else {
        try {
          decoded = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
        } catch {
          // Malformed UTF-8: keep the literal source rather than emitting
          // replacement characters that could corrupt an adjacent match.
          decoded = m.chars.slice(runStart, j).join("");
        }
      }
      for (const ch of decoded) {
        out.chars.push(ch);
        out.start.push(oStart);
        out.end.push(oEnd);
      }
      i = j;
    } else {
      out.chars.push(m.chars[i]);
      out.start.push(m.start[i]);
      out.end.push(m.end[i]);
      i++;
    }
  }
  return out;
}

/**
 * Apply NFKC and drop invisible characters, per character so the index map
 * survives. Per-character NFKC will not recompose a base letter plus a separate
 * combining mark; that is irrelevant for the ASCII-shaped credentials this
 * scanner looks for, and it is the price of exact position mapping.
 */
function normalizePass(m: Mapped): Mapped {
  const out: Mapped = { chars: [], start: [], end: [] };
  for (let i = 0; i < m.chars.length; i++) {
    const c = m.chars[i];
    if (isInvisible(c)) continue;
    let nfkc: string;
    try {
      nfkc = c.normalize("NFKC");
    } catch {
      nfkc = c;
    }
    for (const ch of nfkc) {
      out.chars.push(ch);
      out.start.push(m.start[i]);
      out.end.push(m.end[i]);
    }
  }
  return out;
}

/** Full ladder, retaining the original-position map. */
export function canonicalizeWithMap(input: string): CanonicalResult {
  let m = seed(input);

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const before = m.chars.length;
    let next = percentDecodePass(m);
    next = normalizePass(next);
    if (next.chars.length > MAX_LENGTH) break;
    const stable = next.chars.length === before && next.chars.join("") === m.chars.join("");
    m = next;
    if (stable) break; // nothing left to unwrap
  }

  const text = m.chars.join("");
  // Build canonical UTF-16 index -> map-entry lookup, since callers index into
  // `text` with normal string offsets.
  const idxToEntry: number[] = [];
  for (let i = 0; i < m.chars.length; i++) {
    for (let k = 0; k < m.chars[i].length; k++) idxToEntry.push(i);
  }

  return {
    text,
    changed: text !== input,
    toOriginal(a: number, b: number) {
      if (idxToEntry.length === 0) return { start: 0, end: 0 };
      const ea = idxToEntry[Math.max(0, Math.min(a, idxToEntry.length - 1))];
      const eb = idxToEntry[Math.max(0, Math.min(b - 1, idxToEntry.length - 1))];
      return { start: m.start[ea], end: m.end[eb] };
    },
  };
}

/**
 * Canonicalize text: bounded multi-pass percent-decoding, Unicode NFKC, and
 * removal of zero-width / bidi-control characters. Never throws.
 */
export function canonicalizeText(input: string): string {
  return canonicalizeWithMap(input).text;
}
