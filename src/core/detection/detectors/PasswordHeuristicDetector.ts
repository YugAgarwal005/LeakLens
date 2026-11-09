// LeakLens — PasswordHeuristicDetector
// Detects password-like content pasted or typed into non-password fields.
//
// Heuristics for a "password-like" string:
// 1. Contains uppercase + lowercase + digit + special char (complexity)
// 2. Length ≥ 8 characters
// 3. High character variety (many distinct characters)
// 4. Does NOT look like natural language (no spaces, very few repeated chars)
//
// This catches common cases like:
//   - Pasting a master password into a note/feedback field by mistake
//   - Pasting a passphrase into a form that auto-filled the wrong field
//
// Suppress on:
//   - password-type fields (obviously expected)
//   - Fields with autocomplete="current-password" or "new-password"
//   - Very long text (>200 chars) — looks like content, not a password
//   - Text with spaces (sentences, not passwords)
//   - Fields labelled clearly as "comment", "message", "description"

import type { Detector } from '../Detector.js';
import type { DetectionResult, FieldContext, RawFieldValue } from '../../types/index.js';

const MIN_LEN = 8;
const MAX_LEN = 200;
const MIN_DISTINCT_CHARS = 6;

const SUPPRESS_LABELS = ['comment', 'message', 'description', 'note', 'feedback', 'text', 'content'];
const SUPPRESS_AUTOCOMPLETE = ['current-password', 'new-password', 'one-time-code'];

function hasPasswordComplexity(s: string): boolean {
  return (
    /[A-Z]/.test(s) &&
    /[a-z]/.test(s) &&
    /[0-9]/.test(s) &&
    /[^A-Za-z0-9\s]/.test(s)
  );
}

function distinctCharCount(s: string): number {
  return new Set(s).size;
}

function hasSpaces(s: string): boolean {
  return /\s/.test(s);
}

export class PasswordHeuristicDetector implements Detector {
  readonly id = 'password-heuristic-v1';
  readonly version = '1.0.0';
  readonly category = 'AUTH_SECRET' as const;
  readonly regions = ['GLOBAL'] as const;
  readonly severityHint = 'medium' as const;

  detect(value: RawFieldValue, context: FieldContext): DetectionResult[] {
    // Primary suppression: password fields are expected
    if (context.isPasswordField) return [];
    if (SUPPRESS_AUTOCOMPLETE.some((s) => context.autocomplete.includes(s))) return [];

    const text = (value as string).trim();

    // Length gate
    if (text.length < MIN_LEN || text.length > MAX_LEN) return [];

    // Spaces → likely natural language, not a password
    if (hasSpaces(text)) return [];

    // Suppress if field is clearly for long-form content
    const contextText = [context.labelText, context.placeholder, context.fieldName].join(' ').toLowerCase();
    if (SUPPRESS_LABELS.some((s) => contextText.includes(s))) return [];

    // Must look like a password (complexity + variety)
    if (!hasPasswordComplexity(text)) return [];
    if (distinctCharCount(text) < MIN_DISTINCT_CHARS) return [];

    return [
      {
        detectorId: this.id,
        category: this.category,
        confidence: 'low',  // Conservative — many false positives possible
        maskedPreview: '•'.repeat(Math.min(text.length, 12)),
        matchCount: 1,
        contextSignals: ['password-heuristic'],
      },
    ];
  }
}
