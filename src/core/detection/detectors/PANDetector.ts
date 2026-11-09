// LeakLens — PANDetector
// Detects Indian Permanent Account Numbers (PAN) issued by the Income Tax Dept.
//
// PAN format: AAAAA9999A
//   - 5 uppercase letters
//   - 4 digits
//   - 1 uppercase letter (check character, but no public algorithm to validate)
//
// Additional structure rules (from official spec):
//   - Position 4 (index 3): category of taxpayer
//     P = Individual, C = Company, H = HUF, F = Firm, A = AOP, T = Trust, etc.
//   - Position 5 (index 4): first letter of surname (Individual) or entity name
//   - These are checked optionally for HIGH confidence only.

import type { Detector } from '../Detector.js';
import { maskValue } from '../Detector.js';
import type { DetectionResult, FieldContext, RawFieldValue } from '../../types/index.js';

/** Strict PAN regex: exactly AAAAA9999A */
const PAN_REGEX = /\b([A-Z]{5}[0-9]{4}[A-Z])\b/g;

/** Valid 4th-character (taxpayer type) values */
const VALID_TAXPAYER_TYPES = new Set(['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G']);

const CONTEXT_HIGH = ['pan', 'permanent account', 'income tax', 'pan card', 'pan number', 'pancard'];
const CONTEXT_MEDIUM = ['tax', 'kyc', 'identity', 'id proof', 'id number', 'id no'];

export class PANDetector implements Detector {
  readonly id = 'pan-v1';
  readonly version = '1.0.0';
  readonly category = 'IDENTITY_GOV_IN' as const;
  readonly regions = ['IN'] as const;
  readonly severityHint = 'high' as const;

  detect(value: RawFieldValue, context: FieldContext): DetectionResult[] {
    if (context.isPasswordField) return [];
    const text = (value as string).toUpperCase();
    const contextText = this.contextText(context);
    const results: DetectionResult[] = [];

    let match: RegExpExecArray | null;
    PAN_REGEX.lastIndex = 0;

    while ((match = PAN_REGEX.exec(text)) !== null) {
      const pan = match[1];
      if (!pan) continue;

      // Validate 4th character is a known taxpayer type
      const taxpayerType = pan[3];
      const validType = taxpayerType ? VALID_TAXPAYER_TYPES.has(taxpayerType) : false;
      const contextSignals = this.scoreContext(contextText);

      let confidence: DetectionResult['confidence'];
      if (validType && contextSignals.length > 0) {
        confidence = 'high';
      } else if (validType || contextSignals.length > 0) {
        confidence = 'medium';
      } else {
        // No valid type, no context — PAN-shaped strings appear in codes/IDs
        confidence = 'low';
      }

      results.push({
        detectorId: this.id,
        category: this.category,
        confidence,
        maskedPreview: `${pan.slice(0, 5)}XXXX${pan[9] ?? ''}`,
        matchCount: 1,
        contextSignals,
      });
    }

    return results;
  }

  private contextText(ctx: FieldContext): string {
    return [ctx.labelText, ctx.placeholder, ctx.fieldName, ctx.autocomplete].join(' ').toLowerCase();
  }

  private scoreContext(text: string): string[] {
    const signals: string[] = [];
    for (const s of CONTEXT_HIGH) if (text.includes(s)) signals.push(s);
    for (const s of CONTEXT_MEDIUM) if (text.includes(s)) signals.push(s);
    return signals;
  }
}
