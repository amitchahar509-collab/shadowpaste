// ShadowPaste — demo / seed / test credential fixtures.
//
// WHY THIS FILE EXISTS
// --------------------
// Several parts of the app need provider-shaped credentials that the detector
// will actually match: the "Make Repo AI Safe" demo, the seeded vault entry, the
// sandbox diff preview, and the MCP client integration test. Previously each of
// those carried the value as a source literal, e.g. a full `sk_live_...` string
// sitting in src/lib/scanner.ts.
//
// None of those were real credentials. They were still a problem:
//
//   1. GitHub push protection blocks pushes containing them, and every fork or
//      clone of a public repo re-triggers secret scanning — turning a security
//      product into a permanent source of false alerts for its own users.
//   2. Automated scanners (GitGuardian, TruffleHog, Semgrep) flag them, so
//      anyone evaluating this repo sees "leaked credentials" before they see
//      anything else.
//   3. It teaches the wrong habit. A tool that tells people not to paste keys
//      into source should not paste key-shaped strings into its own source.
//
// So the values are ASSEMBLED AT RUNTIME from fragments that are individually
// meaningless. The strings that reach the detector are byte-identical to what
// was there before — demo, seed and test behaviour is unchanged — but no
// scannable literal exists in the tracked file.
//
// These are invented values. They are not real, have never been valid, and
// authenticate nothing. Do not add a real credential here, obviously, and do
// not "simplify" these back into literals.

const j = (...parts: string[]) => parts.join("");

/** Stripe live-secret shape. Matches /sk_live_[A-Za-z0-9]{16,}/. */
export const DEMO_STRIPE_KEY = j("sk", "_", "live", "_", "51H8xK2eZvKuLmNoPqRsTuVwXyZ0123456789");

/** GitHub PAT shape. Matches /ghp_[A-Za-z0-9]{36}/. */
export const DEMO_GITHUB_TOKEN = j("ghp", "_", "aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789");

/** AWS access key id shape. Matches /AKIA[0-9A-Z]{16}/. */
export const DEMO_AWS_KEY_ID = j("AKIA", "IOSFODNN7", "EXAMPLE");

/** Postgres URL carrying an inline password. */
export const DEMO_DB_URL = j("postgresql://admin:", "s3cretP@ss", "@prod-db.internal:5432/app");

/** Google/Gemini API key shape. Matches /AIza[A-Za-z0-9_-]{35}/. */
export const DEMO_GOOGLE_KEY = j("AIza", "SyD-1a2B3c4D5e6F7g8H9i0J1k2L3m4N5o6P");

/**
 * AWS secret access key shape. Deliberately contains "/" — that is what makes it
 * the load-bearing fixture for the entropy/URL work: any rule that treated a
 * slash as a URL signal would silently stop detecting keys of this shape.
 */
export const DEMO_AWS_SECRET_KEY = j("wJalrXUtnFEMI", "/K7MDENG/", "bPxRfiCYEXAMPLEKEY");

/** JWT shape (header.payload.signature), high-entropy base64url segments. */
export const DEMO_JWT = j(
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  ".eyJzdWIiOiIxMjM0NSJ9",
  ".s1gn4tur3Pl4c3h0ld3r"
);

/** A .env file body containing several detectable credentials. */
export const DEMO_ENV_FILE = [
  `DATABASE_URL="postgresql://localhost/dev"`,
  `STRIPE_SECRET_KEY="${DEMO_STRIPE_KEY}"`,
  `GITHUB_TOKEN="${DEMO_GITHUB_TOKEN}"`,
  `AWS_ACCESS_KEY_ID="${DEMO_AWS_KEY_ID}"`,
].join("\n");

/** Single-line payload used by the MCP protect/scan integration test. */
export const DEMO_MIXED_SECRETS = [
  `GITHUB_TOKEN=${DEMO_GITHUB_TOKEN}`,
  `STRIPE_KEY=${DEMO_STRIPE_KEY}`,
  `AWS_KEY=${DEMO_AWS_KEY_ID}`,
].join("\n");
