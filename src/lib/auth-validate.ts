// ShadowPaste — signup input validation.
//
// THE GAP THIS CLOSES
// -------------------
// POST /api/auth/signup checked only `!email || !password` — presence, not
// validity. A live audit probe registered an account with the email
// `'; DROP TABLE users;--`. No SQL injection occurred (Prisma parameterizes, so
// the string is stored as data and the table is untouched) — but two real
// problems remained:
//
//   1. Garbage / abuse accounts. Any non-email string, and any 1-character
//      password, created a real User + Organization + Membership. That is an
//      unauthenticated write amplifier and a spam vector.
//   2. Unbounded input. A multi-megabyte email or password string was accepted
//      and hashed, wasting CPU and storage on attacker-controlled size.
//
// Validation is a pure function so it is unit-testable without a database, and
// centralised so the same rules cannot drift between call sites if signup logic
// is ever duplicated.

export interface SignupInput {
  email?: unknown;
  password?: unknown;
  name?: unknown;
  orgName?: unknown;
}

export interface ValidatedSignup {
  email: string;
  password: string;
  name: string | null;
  orgName: string | null;
}

export type ValidationResult =
  | { ok: true; value: ValidatedSignup }
  | { ok: false; error: string };

// Deliberately conservative, not RFC 5322-exhaustive: one @, a dot in the
// domain, no whitespace or control characters, bounded length. The goal is to
// reject garbage and abuse, not to police every exotic-but-valid address — and a
// permissive-but-bounded rule is safer than a clever regex that can catastrophically
// backtrack on hostile input.
const EMAIL_RE = /^[^\s@"'`;<>]{1,64}@[^\s@"'`;<>]{1,255}\.[^\s@"'`;<>]{2,}$/;

const MAX_EMAIL = 254; // RFC 5321 maximum
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200; // bcrypt/scrypt inputs beyond this add no security, only cost
const MAX_NAME = 100;

export function validateSignup(input: SignupInput): ValidationResult {
  // Defensive: a validator that throws on null/non-object input is itself a
  // liability — it would turn a malformed body into a 500 instead of a clean 400.
  const src: SignupInput = input && typeof input === "object" ? input : {};
  const email = typeof src.email === "string" ? src.email.trim() : "";
  const password = typeof src.password === "string" ? src.password : "";

  if (!email || !password) return { ok: false, error: "email and password required" };
  if (email.length > MAX_EMAIL) return { ok: false, error: "email is too long" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "invalid email address" };
  if (password.length < MIN_PASSWORD) return { ok: false, error: `password must be at least ${MIN_PASSWORD} characters` };
  if (password.length > MAX_PASSWORD) return { ok: false, error: "password is too long" };

  // Name / orgName are optional display strings. Bound them and coerce empties
  // to null so the DB never stores an oversized or whitespace-only label.
  const rawName = typeof src.name === "string" ? src.name.trim() : "";
  const rawOrg = typeof src.orgName === "string" ? src.orgName.trim() : "";
  if (rawName.length > MAX_NAME) return { ok: false, error: "name is too long" };
  if (rawOrg.length > MAX_NAME) return { ok: false, error: "organization name is too long" };

  return {
    ok: true,
    value: {
      // Emails are case-insensitive in practice; normalise so `A@x.com` and
      // `a@x.com` cannot register as two accounts and bypass the uniqueness check.
      email: email.toLowerCase(),
      password,
      name: rawName || null,
      orgName: rawOrg || null,
    },
  };
}
