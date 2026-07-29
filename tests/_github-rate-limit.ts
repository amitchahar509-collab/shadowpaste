// Shared GitHub rate-limit detection for the integration tests.
//
// Extracted from test-real-scanner.ts so it can be unit-tested directly. The
// previous inline version was wrong in a way that only showed up as an
// intermittent red CI run, which is the hardest kind of bug to trust a fix for
// — so the fix is now covered by assertions rather than by reasoning.
//
// WHAT WENT WRONG
// ---------------
// The old check was:
//
//     status === 502 && /GitHub API (403|429)/.test(errorText)
//
// `GitHub API 403` is the error the scanner emits for the REPO METADATA call.
// But it makes three GitHub calls, and the tree fetch fails with a completely
// different string — `Cannot fetch tree: 403`. A rate limit landing on the
// second call therefore sailed past the soft-skip and failed CI as though the
// scanner were broken. Observed on commit 6d7d59a: the job failed, and the
// identical commit passed on re-run minutes later with no code change.

/** True when a response indicates GitHub throttling rather than a scanner defect. */
export function isGitHubRateLimited(status: number, errorText: string): boolean {
  if (status === 429) return true;
  const e = String(errorText || "");
  return (
    // Any scanner error shape carrying a throttling status:
    //   "GitHub API 403"        (repo metadata)
    //   "Cannot fetch tree: 403" (tree fetch)
    /\b(?:403|429)\b/.test(e) ||
    // GitHub's own wording, in case the scanner ever surfaces the body.
    /rate.?limit/i.test(e) ||
    /secondary rate/i.test(e) ||
    /abuse detection/i.test(e)
  );
}

/** The exact skip line CI logs are scraped for. */
export function logRateLimitSkip(which: string): void {
  console.log(`[SKIP] GitHub API rate limit reached, skipping live scanner integration test. (${which})`);
}
