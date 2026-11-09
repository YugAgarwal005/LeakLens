// LeakLens — AadhaarDetector
// Detects 12-digit Aadhaar numbers using format matching and Verhoeff checksum.
//
// Key design decisions:
// - Regex finds candidates (12 consecutive digits, with optional separators).
// - Verhoeff validates the checksum — dramatically reduces false positives.
// - Context signals from label/placeholder boost or reduce confidence.
// - The first digit of a valid Aadhaar must be 2–9 (UIDAI specification).

import type { Detector } from '../Detector.js';
import { maskValue } from '../Detector.js';
import type { DetectionResult, FieldContext, RawFieldValue } from '../../types/index.js';
import { verhoeffValidate } from '../algorithms/verhoeff.js';

/** Matches 12-digit sequences (starting with 2–9) with optional spaces or hyphens every 4 digits */
const AADHAAR_REGEX =
  /\b([2-9]\d{3}[\s\-]*\d{4}[\s\-]*\d{4})\b/g;

/** First digit must be 2–9 per UIDAI specification */
const VALID_FIRST_DIGIT = /^[2-9]/;

/** Context signals that increase confidence */
const CONTEXT_SIGNALS_HIGH = [
  'aadhaar', 'aadhar', 'uid', 'unique id', 'unique identification',
  'uidai', 'enrollment', 'enrolment',
];

/** Context signals that provide some confidence */
const CONTEXT_SIGNALS_MEDIUM = [
  'identity', 'id number', 'id no', 'government id', 'govt id', 'kyc',
];

export class AadhaarDetector implements Detector {
  readonly id = 'aadhaar-v1';
  readonly version = '1.0.0';
  readonly category = 'IDENTITY_GOV_IN' as const;
  readonly regions = ['IN'] as const;
  readonly severityHint = 'high' as const;

  detect(value: RawFieldValue, context: FieldContext): DetectionResult[] {
    // Skip password fields — Aadhaar in a password field is a credentials issue
    if (context.isPasswordField) return [];

    const results: DetectionResult[] = [];
    const text = value as string;
    const contextText = this.buildContextText(context);

    // Find all 12-digit candidates
    let match: RegExpExecArray | null;
    AADHAAR_REGEX.lastIndex = 0;

    while ((match = AADHAAR_REGEX.exec(text)) !== null) {
      const raw = match[1];
      if (!raw) continue;

      // Strip separators to get pure digits
      const digits = raw.replace(/[\s\-]/g, '');
      if (digits.length !== 12) continue;

      // UIDAI: first digit must be 2–9
      if (!VALID_FIRST_DIGIT.test(digits)) continue;

      // Verhoeff checksum validation
      const checksumValid = verhoeffValidate(digits);

      // Context scoring
      const contextSignals = this.scoreContext(contextText);

      // Determine confidence
      let confidence: DetectionResult['confidence'];
      if (checksumValid && contextSignals.length > 0) {
        confidence = 'high';
      } else if (checksumValid) {
        confidence = 'medium';
      } else if (contextSignals.length > 0) {
        // Context suggests Aadhaar but checksum is wrong — could be typo
        confidence = 'low';
      } else {
        // No checksum, no context — skip (too many false positives)
        continue;
      }

      results.push({
        detectorId: this.id,
        category: this.category,
        confidence,
        maskedPreview: maskValue(digits),
        matchCount: 1,
        contextSignals,
      });
    }

    return results;
  }

  private buildContextText(ctx: FieldContext): string {
    return [ctx.labelText, ctx.placeholder, ctx.fieldName, ctx.autocomplete]
      .join(' ')
      .toLowerCase();
  }

  private scoreContext(text: string): string[] {
    const signals: string[] = [];
    for (const signal of CONTEXT_SIGNALS_HIGH) {
      if (text.includes(signal)) signals.push(signal);
    }
    for (const signal of CONTEXT_SIGNALS_MEDIUM) {
      if (text.includes(signal)) signals.push(signal);
    }
    return signals;
  }
}
