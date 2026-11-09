// LeakLens — APIKeyDetector
// Detects API keys, access tokens, secret keys, and private keys.
//
// Strategy:
// 1. Named patterns: detect keys that follow provider-specific formats
//    (GitHub PATs, AWS access keys, Stripe keys, GCP service account keys, etc.)
// 2. Generic high-entropy detection: detect long (≥32 chars) opaque strings
//    that have high Shannon entropy (≥4.0 bits/char) — typical of randomly
//    generated secrets.
// 3. PEM blocks: detect private key headers.
//
// The high-entropy check is essential to catch internal/custom API keys
// that don't match known provider formats.

import type { Detector } from '../Detector.js';
import type { DetectionResult, FieldContext, RawFieldValue } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Named provider patterns
// Each pattern is matched with at most one group: the full key string.
// ---------------------------------------------------------------------------

interface NamedPattern {
  name: string;
  regex: RegExp;
  minLen: number;
  maxLen: number;
}

const NAMED_PATTERNS: NamedPattern[] = [
  // GitHub Personal Access Token (classic: ghp_, OAuth: gho_, etc.)
  { name: 'GitHub PAT',       regex: /\b(gh[pousr]_[A-Za-z0-9_]{36,255})\b/g,          minLen: 40, maxLen: 260 },
  // AWS Access Key ID
  { name: 'AWS Access Key',   regex: /\b(AKIA[0-9A-Z]{16})\b/g,                         minLen: 20, maxLen: 20 },
  // AWS Secret Access Key (heuristic — 40 chars base64)
  { name: 'AWS Secret',       regex: /\b([A-Za-z0-9/+]{40})\b/g,                        minLen: 40, maxLen: 40 },
  // Stripe keys
  { name: 'Stripe Key',       regex: /\b((?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{24,})\b/g, minLen: 30, maxLen: 200 },
  // OpenAI
  { name: 'OpenAI Key',       regex: /\b(sk-[A-Za-z0-9]{32,}(?:T3BlbkFJ[A-Za-z0-9]{32,})?)\b/g, minLen: 36, maxLen: 300 },
  // Google API key
  { name: 'Google API Key',   regex: /\b(AIza[0-9A-Za-z_\-]{35})\b/g,                   minLen: 39, maxLen: 39 },
  // Twilio
  { name: 'Twilio SID',       regex: /\b(AC[a-f0-9]{32})\b/g,                            minLen: 34, maxLen: 34 },
  { name: 'Twilio Token',     regex: /\b(SK[a-f0-9]{32})\b/g,                            minLen: 34, maxLen: 34 },
  // Slack
  { name: 'Slack Token',      regex: /\b(xox[bporas]-[0-9A-Za-z\-]{10,200})\b/g,        minLen: 14, maxLen: 210 },
  // SendGrid
  { name: 'SendGrid Key',     regex: /\b(SG\.[A-Za-z0-9_\-.]{22}\.[A-Za-z0-9_\-.]{43})\b/g, minLen: 69, maxLen: 69 },
  // JWT (3 base64url segments)
  { name: 'JWT',              regex: /\b(eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+)\b/g, minLen: 30, maxLen: 4096 },
  // SSH/RSA private key header
  { name: 'Private Key',      regex: /(-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----)/g, minLen: 27, maxLen: 100 },
  // npm token
  { name: 'npm Token',        regex: /\b(npm_[A-Za-z0-9]{36})\b/g,                       minLen: 40, maxLen: 40 },
  // PyPI / generic bearer
  { name: 'Bearer Token',     regex: /\bBearer\s+([A-Za-z0-9\-._~+/]+=*)\b/gi,          minLen: 20, maxLen: 2048 },
];

// ---------------------------------------------------------------------------
// Shannon entropy calculation
// ---------------------------------------------------------------------------

function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** Minimum entropy to consider a string a potential secret (bits/char) */
const MIN_ENTROPY = 3.5;
/** Minimum length for generic high-entropy detection */
const MIN_GENERIC_LEN = 32;
/** Maximum length for generic detection (avoid flagging large text blocks) */
const MAX_GENERIC_LEN = 512;

/** Matches potential secret strings — long alphanum+symbols, no spaces */
const GENERIC_SECRET_REGEX = /\b([A-Za-z0-9+/=_\-.]{32,512})\b/g;

const CONTEXT_HIGH = [
  'api key', 'api_key', 'apikey', 'secret', 'token', 'access key',
  'private key', 'credential', 'auth', 'authorization', 'bearer',
  'passphrase', 'client secret', 'client_secret',
];

export class APIKeyDetector implements Detector {
  readonly id = 'apikey-v1';
  readonly version = '1.0.0';
  readonly category = 'AUTH_SECRET' as const;
  readonly regions = ['GLOBAL'] as const;
  readonly severityHint = 'high' as const;

  detect(value: RawFieldValue, context: FieldContext): DetectionResult[] {
    // API keys in password fields are expected — only skip non-password suppression
    const text = value as string;
    if (text.trim().length < 16) return [];

    const contextText = this.contextText(context);
    const contextSignals = CONTEXT_HIGH.filter((s) => contextText.includes(s));
    const results: DetectionResult[] = [];
    const seenRanges = new Set<string>();

    // ── Named patterns ──
    for (const { name, regex, minLen, maxLen } of NAMED_PATTERNS) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const key = match[1] ?? match[0];
        if (!key) continue;
        if (key.length < minLen || key.length > maxLen) continue;
        const range = `${match.index}-${match.index + key.length}`;
        if (seenRanges.has(range)) continue;
        seenRanges.add(range);

        results.push({
          detectorId: this.id,
          category: this.category,
          confidence: 'high',
          maskedPreview: this.maskKey(key, name),
          matchCount: 1,
          contextSignals: [...contextSignals, `pattern:${name}`],
        });
      }
    }

    // ── Generic high-entropy detection ──
    // Only run if context suggests a secret-type field
    if (contextSignals.length > 0 || context.isPasswordField) {
      GENERIC_SECRET_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = GENERIC_SECRET_REGEX.exec(text)) !== null) {
        const candidate = match[1];
        if (!candidate) continue;
        if (candidate.length < MIN_GENERIC_LEN || candidate.length > MAX_GENERIC_LEN) continue;

        const range = `${match.index}-${match.index + candidate.length}`;
        if (seenRanges.has(range)) continue;

        const entropy = shannonEntropy(candidate);
        if (entropy < MIN_ENTROPY) continue;

        seenRanges.add(range);
        results.push({
          detectorId: this.id,
          category: this.category,
          confidence: contextSignals.length > 0 ? 'medium' : 'low',
          maskedPreview: this.maskKey(candidate, 'secret'),
          matchCount: 1,
          contextSignals: [...contextSignals, `entropy:${entropy.toFixed(1)}`],
        });
      }
    }

    return results;
  }

  private maskKey(key: string, name: string): string {
    if (key.startsWith('-----BEGIN')) return `[Private Key block]`;
    if (key.length <= 8) return `[${name}]`;
    return `${key.slice(0, 4)}${'X'.repeat(Math.min(key.length - 8, 16))}${key.slice(-4)}`;
  }

  private contextText(ctx: FieldContext): string {
    return [ctx.labelText, ctx.placeholder, ctx.fieldName, ctx.autocomplete].join(' ').toLowerCase();
  }
}
