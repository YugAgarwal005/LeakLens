// LeakLens — EmailDetector
// Detects email addresses in fields where they are not expected.
//
// Policy:
// - If fieldType === 'email' → SUPPRESS entirely (expected usage)
// - If autocomplete contains 'email' → SUPPRESS
// - If context explicitly labels the field for email → LOW confidence only
// - Otherwise → MEDIUM confidence (email in an unexpected context)
//
// We intentionally score emails LOW to avoid warning on every login form's
// email field. The trigger is "email in a non-email context" — for example,
// a free-text feedback box or a code-entry field.

import type { Detector } from '../Detector.js';
import type { DetectionResult, FieldContext, RawFieldValue } from '../../types/index.js';

// RFC 5322-simplified email regex (handles 99%+ of real emails)
const EMAIL_REGEX = /\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/g;

const EMAIL_CONTEXT_SIGNALS = ['email', 'e-mail', 'mail', 'contact', 'inbox'];
const SUPPRESS_AUTOCOMPLETE = ['email', 'username', 'webauthn'];

export class EmailDetector implements Detector {
  readonly id = 'email-v1';
  readonly version = '1.0.0';
  readonly category = 'PERSONAL_CONTACT' as const;
  readonly regions = ['GLOBAL'] as const;
  readonly severityHint = 'low' as const;

  detect(value: RawFieldValue, context: FieldContext): DetectionResult[] {
    if (context.isPasswordField) return [];

    // Suppress for email-type fields and email autocomplete
    if (context.fieldType === 'email') return [];
    if (SUPPRESS_AUTOCOMPLETE.some((s) => context.autocomplete.includes(s))) return [];

    const text = value as string;
    const contextText = this.contextText(context);
    const emailContextSignals = EMAIL_CONTEXT_SIGNALS.filter((s) => contextText.includes(s));

    // If the field is labelled for email entry, also suppress
    if (emailContextSignals.length > 0) return [];

    const results: DetectionResult[] = [];
    let match: RegExpExecArray | null;
    EMAIL_REGEX.lastIndex = 0;

    while ((match = EMAIL_REGEX.exec(text)) !== null) {
      const email = match[1];
      if (!email) continue;

      results.push({
        detectorId: this.id,
        category: this.category,
        confidence: 'medium',
        maskedPreview: this.maskEmail(email),
        matchCount: 1,
        contextSignals: ['unexpected-context'],
      });
    }

    return results;
  }

  private maskEmail(email: string): string {
    const atIdx = email.indexOf('@');
    if (atIdx < 0) return '••••@••••';
    const local = email.slice(0, atIdx);
    const domain = email.slice(atIdx);
    const masked = local.length > 2
      ? `${local[0]}${'•'.repeat(local.length - 2)}${local[local.length - 1]}`
      : '••';
    return `${masked}${domain}`;
  }

  private contextText(ctx: FieldContext): string {
    return [ctx.labelText, ctx.placeholder, ctx.fieldName, ctx.autocomplete].join(' ').toLowerCase();
  }
}
