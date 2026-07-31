// Signup input validation — pins the fix for the live-audit finding.
//
// A production audit probe registered an account with the email
// `'; DROP TABLE users;--`. No injection occurred (Prisma parameterizes), but
// signup accepted garbage input and a 1-char password, creating real accounts.
// These tests lock the validator that now runs before any DB write.

import { describe, expect, test } from "bun:test";
import { validateSignup } from "@/lib/auth-validate";

describe("validateSignup", () => {
  test("accepts a normal signup and normalises it", () => {
    const r = validateSignup({ email: "  Alice@Example.COM ", password: "correct horse", name: "  Alice  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBe("alice@example.com"); // trimmed + lowercased
      expect(r.value.name).toBe("Alice");
      expect(r.value.orgName).toBeNull();
    }
  });

  test("rejects the exact audit-probe payload", () => {
    const r = validateSignup({ email: "'; DROP TABLE users;--", password: "whatever123" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid email address");
  });

  test("rejects missing fields, junk emails and short passwords", () => {
    expect(validateSignup({ password: "12345678" }).ok).toBe(false);
    expect(validateSignup({ email: "a@b.com" }).ok).toBe(false);
    for (const bad of ["notanemail", "no@domain", "@nolocal.com", "spaces in@x.com", "a@b", "<script>@x.com"]) {
      const r = validateSignup({ email: bad, password: "longenough1" });
      expect(r.ok).toBe(false);
    }
    const short = validateSignup({ email: "a@b.com", password: "short" });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.error).toContain("at least 8");
  });

  test("bounds oversized input rather than hashing megabytes", () => {
    expect(validateSignup({ email: "a".repeat(300) + "@x.com", password: "longenough1" }).ok).toBe(false);
    expect(validateSignup({ email: "a@b.com", password: "x".repeat(500) }).ok).toBe(false);
    expect(validateSignup({ email: "a@b.com", password: "longenough1", name: "n".repeat(200) }).ok).toBe(false);
  });

  test("never throws on non-string / hostile input types", () => {
    for (const v of [null, undefined, 123, {}, [], { email: 42, password: true }]) {
      expect(() => validateSignup(v as never)).not.toThrow();
      expect(validateSignup(v as never).ok).toBe(false);
    }
  });

  test("accepts realistic addresses (not over-strict)", () => {
    for (const good of ["a@b.co", "first.last@sub.example.com", "user+tag@example.org", "x_y@example-domain.io"]) {
      expect(validateSignup({ email: good, password: "longenough1" }).ok).toBe(true);
    }
  });
});
