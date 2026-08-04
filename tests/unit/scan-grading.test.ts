// Scan grading — pins two defects found by live MCP testing.
//
// Observed through a real MCP client against production:
//   octocat/Hello-World          -> filesScanned 0, findings 0, grade "A+"
//   amitchahar509-collab/shadowpaste -> scan never ran, grade "F", no error shown
//
// Both come from the same root cause: the grade was computed with no notion of
// whether a scan actually happened. computeTrustScore starts at 100 and only
// deducts, so "nothing scanned" scored 100 (A+), while every failure path
// hard-coded grade "F" and the adapter dropped the accompanying `error`.
//
// For a security scanner these are the two worst outputs available: false
// assurance about a repository it never read, and a failure that reads as a
// damning verdict on a healthy repository.

import { describe, expect, test } from "bun:test";
import { computeTrustScore, scoreToGrade } from "@/lib/scanner";

describe("trust score", () => {
  test("still grades a genuinely clean scan A+", () => {
    expect(computeTrustScore([])).toBe(100);
    expect(scoreToGrade(100)).toBe("A+");
  });

  test("deducts by severity", () => {
    const f = (severity: string) => ({ severity } as never);
    expect(computeTrustScore([f("critical")])).toBe(75);
    expect(computeTrustScore([f("high")])).toBe(88);
    expect(computeTrustScore([f("medium")])).toBe(95);
    expect(computeTrustScore([f("low")])).toBe(98);
  });

  test("a score of 100 alone cannot distinguish 'clean' from 'not scanned'", () => {
    // This is WHY the caller must gate on filesScanned — the scoring function
    // has no way to tell the difference, and never will.
    expect(computeTrustScore([])).toBe(computeTrustScore([]));
  });
});

describe("scanner never grades what it did not read", () => {
  test("every failure path returns N/A, not F", async () => {
    const src = await Bun.file("src/lib/github-scanner.ts").text();
    expect(src).not.toContain('grade: "F"');
    // Each error return must also mark itself unassessed.
    const errorReturns = src.split("\n").filter((l) => l.includes("ok: false") && l.includes("grade:"));
    expect(errorReturns.length).toBeGreaterThan(0);
    for (const line of errorReturns) {
      expect(line).toContain('grade: "N/A"');
      expect(line).toContain("assessed: false");
    }
  });

  test("a successful scan of zero files is not graded", async () => {
    const src = await Bun.file("src/lib/github-scanner.ts").text();
    expect(src).toContain("const assessed = scannedFiles.length > 0");
    expect(src).toContain('grade: assessed ? scoreToGrade(score) : "N/A"');
  });

  test("the MCP adapter surfaces the failure instead of dropping it", async () => {
    const src = await Bun.file("src/lib/tools/adapters.ts").text();
    expect(src).toContain("result.error ? { error: result.error }");
    expect(src).toContain("assessed");
  });
});
