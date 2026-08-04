// Generic entropy patterns — pins the URL false-positive fix.
//
// `github.read` on a PUBLIC repository reported 11 secrets redacted through a
// live MCP client. Every one was a GitHub API URL:
//
//   "contributors_url": "https://api.github.{{SHADOW_REDACTED:entropy_40:…}}"
//
// Cause: the `entropy_*` catalog patterns are named for entropy but only tested
// LENGTH and character class — `[A-Za-z0-9+/=_-]{40,}` — and a URL path lies
// entirely inside that class. The generic-pattern context gate did not catch it
// either, because that gate accepts `before.includes(":")` and in JSON every
// value is preceded by a colon.
//
// Consequences were not cosmetic: the agent received corrupted output with real
// URLs replaced by markers, a routine read escalated to risk 70/high, and with a
// delivery webhook configured it would page on every GitHub call.
//
// The fix is TWO gates, because measuring showed one was not enough:
//   1. an entropy floor, which removes prose-shaped paths (3.78-3.86)
//   2. URL-structure exclusion, which removes paths carrying random resource
//      IDs (4.28-4.83) — those overlap real credentials (4.57-5.00), so no
//      threshold can separate them
// Neither is a slash ban: slashes are legitimate inside base64 secrets (the AWS
// secret key has two). Query strings stay scannable, since `?token=` is exactly
// where a credential does appear in a URL.

import { describe, expect, test } from "bun:test";
import { scanForSecrets, shannonEntropy, MIN_GENERIC_ENTROPY } from "@/lib/security/detector";

const GH_PAYLOAD = JSON.stringify(
  {
    contributors_url: "https://api.github.com/repos/octocat/Hello-World/contributors",
    deployments_url: "https://api.github.com/repos/octocat/Hello-World/deployments",
    git_commits_url: "https://api.github.com/repos/octocat/Hello-World/git/commits{/sha}",
    notifications_url: "https://api.github.com/repos/octocat/Hello-World/notifications{?since,all}",
    subscribers_url: "https://api.github.com/repos/octocat/Hello-World/subscribers",
    milestones_url: "https://api.github.com/repos/octocat/Hello-World/milestones{/number}",
    issue_events_url: "https://api.github.com/repos/octocat/Hello-World/issues/events{/number}",
    stargazers_url: "https://api.github.com/repos/octocat/Hello-World/stargazers",
  },
  null,
  2
);

describe("URL paths are not secrets", () => {
  test("the exact payload that produced 11 false positives now produces none", () => {
    expect(scanForSecrets(GH_PAYLOAD, "github.read").length).toBe(0);
  });

  test("URLs carrying high-entropy resource IDs stay clean", () => {
    // These are why an entropy floor alone was NOT enough. Measured 4.28-4.83,
    // above the floor and overlapping real credentials (4.57-5.00) — no
    // threshold separates them, so URL structure has to.
    const urls = [
      "https://api.stripe.com/v1/customers/cus_NffrFeUfNV2Hib/subscriptions",
      "https://api.stripe.com/v1/charges/ch_3MmlLrLkdIwHu7ix0snN0B15",
      "https://api.github.com/repos/facebook/react/commits/a1b2c3d4e5f67890abcdef1234567890abcdef12",
      "https://api.example.com/v2/users/550e8400-e29b-41d4-a716-446655440000/profile",
      "https://s3.amazonaws.com/my-bucket/uploads/2024/01/report-final-v2.pdf",
      "https://gitlab.com/api/v4/projects/12345/repository/branches",
      "https://avatars.githubusercontent.com/u/583231?v=4",
    ];
    for (const u of urls) {
      const generic = scanForSecrets(JSON.stringify({ url: u }), "api").filter((f) => f.provider === "HighEntropy");
      expect(generic.length).toBe(0);
    }
  });

  test("a secret in a QUERY STRING is still caught — the query is not structure", () => {
    for (const u of [
      "https://api.example.com/v1/data?access_token=ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8",
      "https://hooks.example.com/send?key=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    ]) {
      expect(scanForSecrets(JSON.stringify({ url: u }), "api").length).toBeGreaterThan(0);
    }
  });
});

describe("real credentials are still detected", () => {
  test("secrets embedded in the same JSON shape are all found", () => {
    const mixed = JSON.stringify(
      {
        contributors_url: "https://api.github.com/repos/octocat/Hello-World/contributors",
        stripe: "sk_live_51HxKlMNoPqRsTuVwXyZaBcDeFgHiJkLmNoPq",
        github_token: "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8",
        aws: "AKIAIOSFODNN7EXAMPLE",
        aws_secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        google: "AIzaSyD-1a2B3c4D5e6F7g8H9i0J1k2L3m4N5o6P",
        jwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9.abc",
        db: "postgresql://admin:hunter2@prod-db.internal:5432/main",
      },
      null,
      2
    );
    const providers = new Set(scanForSecrets(mixed, "mixed").map((f) => f.provider));
    for (const p of ["STRIPE", "GITHUB", "AWS_ACCESS_KEY", "GOOGLE", "JWT", "POSTGRES"]) {
      expect([...providers]).toContain(p);
    }
  });

  test("a slash-bearing base64 secret survives — this is why the fix is entropy, not slashes", () => {
    // AWS secret access keys routinely contain "/" and would be lost to any
    // rule that treated slashes as a URL signal.
    const awsKey = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    expect(shannonEntropy(awsKey)).toBeGreaterThan(MIN_GENERIC_ENTROPY);
    const found = scanForSecrets(`aws_secret_access_key = "${awsKey}"`, "cfg");
    expect(found.length).toBeGreaterThan(0);
  });
});

describe("the entropy floor is where the measurements put it", () => {
  test("URL paths fall below it, credentials above it", () => {
    for (const url of [
      "com/repos/octocat/Hello-World/contributors",
      "com/repos/octocat/Hello-World/deployments",
      "com/repos/octocat/Hello-World/notifications",
    ]) {
      expect(shannonEntropy(url)).toBeLessThan(MIN_GENERIC_ENTROPY);
    }
    for (const secret of [
      "sk_live_51HxKlMNoPqRsTuVwXyZaBcDeFgHiJkLmNoPq",
      "ghp_A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8",
      "AIzaSyD-1a2B3c4D5e6F7g8H9i0J1k2L3m4N5o6P",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NSJ9",
      "dGhpcy1pcy1hLXZlcnktbG9uZy1iYXNlNjQtc2VjcmV0LXZhbHVl",
    ]) {
      expect(shannonEntropy(secret)).toBeGreaterThan(MIN_GENERIC_ENTROPY);
    }
  });

  test("the floor keeps a safety margin on both sides", () => {
    // Tightening toward the credential side starts losing real secrets, which is
    // the failure direction that matters here. Keep the gap visible.
    expect(MIN_GENERIC_ENTROPY).toBeGreaterThan(3.9);
    expect(MIN_GENERIC_ENTROPY).toBeLessThan(4.5);
  });
});
