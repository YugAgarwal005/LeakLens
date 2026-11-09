// LeakLens — PhoneDetector
// Detects Indian mobile numbers and international phone numbers.
//
// Indian mobile format:
//   - 10 digits, starting with 6–9 (TRAI specification)
//   - With optional +91 or 0 prefix
//   - With optional separators (spaces, hyphens, dots) every 5 digits
//
// International format:
//   - +[1-9][1-4 digits country code][6-14 digits subscriber] 
//   - Only fires at MEDIUM confidence; Indian numbers fire at HIGH with context
//
// Suppression:
//   - fieldType 'tel' → suppress (expected)
//   - autocomplete 'tel' → suppress
//   - The number overlaps with the field's other content (e.g., a zip code prefix)

import type { Detector } from '../Detector.js';
import type { DetectionResult, FieldContext, RawFieldValue } from '../../types/index.js';

/** Indian mobile: optional +91/0, then 10 digits starting 6–9 */
const INDIA_MOBILE_REGEX =
  /(?<!\d)(?:\+91[\s\-]?|0)?([6-9]\d{4}[\s\-]?\d{5})(?!\d)/g;

/** International: + followed by country code and subscriber digits */
const INTL_PHONE_REGEX =
  /(?<!\d)\+([1-9]\d{1,3}[\s\-]?\d{3,5}[\s\-]?\d{3,9})(?!\d)/g;

const SUPPRESS_AUTOCOMPLETE = ['tel', 'mobile', 'phone'];
const CONTEXT_HIGH = ['phone', 'mobile', 'contact', 'whatsapp', 'call', 'number'];

export class PhoneDetector implements Detector {
  readonly id = 'phone-v1';
  readonly version = '1.0.0';
  readonly category = 'PERSONAL_CONTACT' as const;
  readonly regions = ['IN', 'GLOBAL'] as const;
  readonly severityHint = 'low' as const;

  detect(value: RawFieldValue, context: FieldContext): DetectionResult[] {
    if (context.isPasswordField) return [];
    if (context.fieldType === 'tel' || context.fieldType === 'number') return [];
    if (SUPPRESS_AUTOCOMPLETE.some((s) => context.autocomplete.includes(s))) return [];

    const text = value as string;
    const contextText = this.contextText(context);
    const phoneContext = CONTEXT_HIGH.filter((s) => contextText.includes(s));

    // Suppress if the field is labelled for phone
    if (phoneContext.length >= 2) return [];

    const results: DetectionResult[] = [];
    const seenRanges = new Set<string>();

    // ── Indian mobile numbers ──
    INDIA_MOBILE_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INDIA_MOBILE_REGEX.exec(text)) !== null) {
      const raw = match[1];
      if (!raw) continue;
      const digits = raw.replace(/[\s\-]/g, '');
      if (digits.length !== 10) continue;
      const range = `${match.index}-${match.index + raw.length}`;
      if (seenRanges.has(range)) continue;
      seenRanges.add(range);

      results.push({
        detectorId: this.id,
        category: this.category,
        confidence: 'medium',
        maskedPreview: `${digits.slice(0, 2)}XXXXXX${digits.slice(-2)}`,
        matchCount: 1,
        contextSignals: phoneContext.length > 0 ? phoneContext : ['indian-mobile'],
      });
    }

    // ── International phone numbers (only in unexpected contexts) ──
    if (phoneContext.length === 0) {
      INTL_PHONE_REGEX.lastIndex = 0;
      while ((match = INTL_PHONE_REGEX.exec(text)) !== null) {
        const full = match[0];
        const range = `${match.index}-${match.index + full.length}`;
        if (seenRanges.has(range)) continue;
        seenRanges.add(range);

        const digits = full.replace(/[\s\-+]/g, '');
        if (digits.length < 8 || digits.length > 15) continue;

        results.push({
          detectorId: this.id,
          category: this.category,
          confidence: 'low',
          maskedPreview: `+${digits.slice(0, 2)}XXXX${digits.slice(-2)}`,
          matchCount: 1,
          contextSignals: ['intl-phone'],
        });
      }
    }

    return results;
  }

  private contextText(ctx: FieldContext): string {
    return [ctx.labelText, ctx.placeholder, ctx.fieldName, ctx.autocomplete].join(' ').toLowerCase();
  }
}
