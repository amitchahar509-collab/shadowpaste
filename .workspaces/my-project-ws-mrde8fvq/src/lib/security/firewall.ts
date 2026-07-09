// @shadowpaste/security — prompt-injection shield + Agent Firewall V2
// Ported from packages/security/index.mjs.

export interface InjectionResult {
  injection: boolean;
  categories: string[];
}

export const InjectionShield = {
  categories: {
    JAILBREAK: [
      /ignore\s+(all\s+|any\s+)?(previous|prior|above|earlier)\s+(instructions|rules|prompts)/i,
      /you\s+are\s+now\s+(dan|jailbroken|unrestricted)/i,
      /pretend\s+(there\s+are\s+)?no\s+(rules|restrictions|guardrails)/i,
    ],
    SECRET_EXTRACTION: [
      /(reveal|show|display|expose|print|output|tell\s+me|what\s+is)\s+.{0,30}(the\s+)?(raw\s+|actual\s+|real\s+|underlying\s+|decrypted\s+)?(value\s+of\s+)?.{0,20}(secret|api[\s_-]?key|credential|token|password|private\s+key)/i,
      /(print|list|dump|export|leak)\s+(all\s+)?(the\s+)?(secrets|api[\s_-]?keys|credentials|env|environment\s+variables|vault)/i,
      /(decrypt|unmask|decode|expand|resolve)\s+.{0,25}(shadow_secret|secret|token|credential|placeholder)/i,
    ],
    EXFILTRATION: [
      /send\s+.{0,40}(secret|api[\s_-]?key|credential|token|password).{0,40}(to|http|https|url|server|webhook|endpoint|email)/i,
      /(post|upload|forward|transmit)\s+.{0,30}(secret|key|credential|token)/i,
    ],
    TOOL_ABUSE: [
      /(bypass|disable|turn\s+off|override)\s+.{0,25}(firewall|security|guardrail|policy|shield|protection)/i,
      /use\s+.{0,20}(admin|root|sudo)\s+.{0,20}(access|privilege)/i,
    ],
    SOCIAL_ENGINEERING: [
      /(i\s+am|this\s+is)\s+(the\s+)?(owner|admin|developer|ceo).{0,30}(give|show|send|reveal)/i,
      /for\s+(debugging|testing|audit)\s+purposes.{0,30}(reveal|show|print).{0,20}(secret|key|credential)/i,
    ],
  } as Record<string, RegExp[]>,
  scan(text: string): InjectionResult {
    const hits: string[] = [];
    for (const [cat, pats] of Object.entries(this.categories)) {
      for (const p of pats) {
        if (p.test(text)) {
          hits.push(cat);
          break;
        }
      }
    }
    return { injection: hits.length > 0, categories: [...new Set(hits)] };
  },
};

export interface FirewallAssessment {
  who: string;
  what: string;
  why: string;
  level: "LOW" | "HIGH" | "CRITICAL";
  reasons: string[];
  injection: InjectionResult;
}

export const FirewallV2 = {
  assessPrompt(text: string, opts: { session?: string } = {}): FirewallAssessment {
    const inj = InjectionShield.scan(text);
    const reasons: string[] = [];
    let level: FirewallAssessment["level"] = "LOW";
    if (inj.categories.includes("EXFILTRATION") || inj.categories.includes("SECRET_EXTRACTION")) {
      level = "CRITICAL";
      reasons.push("Secret extraction / exfiltration attempt — no reveal path exists");
    } else if (inj.categories.includes("JAILBREAK") || inj.categories.includes("TOOL_ABUSE") || inj.categories.includes("SOCIAL_ENGINEERING")) {
      level = "HIGH";
      reasons.push("Prompt attempts to bypass controls (" + inj.categories.join(", ") + ")");
    } else if (/(delete|drop|truncate|destroy|wipe)\b.{0,40}\b(prod|production|database|db|table|bucket)/i.test(text)) {
      level = "HIGH";
      reasons.push("Destructive action against production data");
    }
    return {
      who: opts.session || "unknown-session",
      what: "prompt-submit",
      why: inj.categories.join(",") || "benign",
      level,
      reasons,
      injection: inj,
    };
  },
  assessAction(action: string): { level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; reason: string } {
    const a = (action || "").toLowerCase();
    if (/(exfil|send[\s._-]?key|reveal|export[\s._-]?secret|print[\s._-]?secret|leak)/.test(a))
      return { level: "CRITICAL", reason: "Action would expose the raw credential" };
    if (/(delete|drop|destroy|wipe|remove).*(prod|db|database|bucket|resource)/.test(a))
      return { level: "HIGH", reason: "Destructive resource action — human approval required" };
    if (/(write|update|modify|insert|create).*(db|database|table|record)/.test(a))
      return { level: "HIGH", reason: "Database mutation — human approval required" };
    if (/(admin|billing|payment|transfer|charge)/.test(a))
      return { level: "MEDIUM", reason: "Elevated-privilege scope requested" };
    if (/(chat|complete|generate|embed|read|list|models)/.test(a))
      return { level: "LOW", reason: "Scoped read/generate action" };
    return { level: "LOW", reason: "Scoped action" };
  },
};
