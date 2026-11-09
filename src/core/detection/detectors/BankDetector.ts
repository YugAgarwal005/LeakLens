// LeakLens — BankDetector
// Detects Indian bank account numbers and IFSC codes.
//
// IFSC format: AAAA0XXXXXX
//   - 4 uppercase bank code letters
//   - 0 (literal zero, reserved)
//   - 6 alphanumeric branch code characters
//
// Bank Account Numbers:
//   - Vary by bank: 9–18 digits typically
//   - SBI: 11 digits; HDFC: 14 digits; ICICI: 12 digits; Axis: 15 digits
//   - No universal checksum — rely heavily on context
//   - Only flag account numbers when IFSC or strong context is nearby

import type { Detector } from '../Detector.js';
import { maskValue } from '../Detector.js';
import type { DetectionResult, FieldContext, RawFieldValue } from '../../types/index.js';

/** IFSC format: 4 alpha + '0' + 6 alphanumeric */
const IFSC_REGEX = /\b([A-Z]{4}0[A-Z0-9]{6})\b/g;

/** Bank account number: 9–18 digits, not adjacent to more digits */
const ACCT_REGEX = /\b(\d{9,18})\b/g;

const IFSC_CONTEXT = ['ifsc', 'ifsc code', 'bank code', 'branch code'];
const ACCT_CONTEXT_HIGH = ['account number', 'account no', 'a/c number', 'a/c no', 'acct', 'bank account'];
const ACCT_CONTEXT_MEDIUM = ['account', 'bank', 'neft', 'rtgs', 'imps', 'transfer'];

export class BankDetector implements Detector {
  readonly id = 'bank-v1';
  readonly version = '1.0.0';
  readonly category = 'PAYMENT_BANK' as const;
  readonly regions = ['IN'] as const;
  readonly severityHint = 'high' as const;

  detect(value: RawFieldValue, context: FieldContext): DetectionResult[] {
    if (context.isPasswordField) return [];
    const text = value as string;
    const contextText = this.contextText(context);
    const results: DetectionResult[] = [];

    // ── IFSC Detection ──
    IFSC_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IFSC_REGEX.exec(text)) !== null) {
      const ifsc = match[1];
      if (!ifsc) continue;
      const contextSignals = IFSC_CONTEXT.filter((s) => contextText.includes(s));
      // IFSC format is distinctive enough — medium confidence even without label
      results.push({
        detectorId: this.id,
        category: this.category,
        confidence: contextSignals.length > 0 ? 'high' : 'medium',
        maskedPreview: `${ifsc.slice(0, 4)}0XXXXXX`,
        matchCount: 1,
        contextSignals: [...contextSignals, 'IFSC'],
      });
    }

    // ── Account Number Detection ──
    // Only fire if there's meaningful context — too many false positives otherwise
    const acctSignalsHigh = ACCT_CONTEXT_HIGH.filter((s) => contextText.includes(s));
    const acctSignalsMed = ACCT_CONTEXT_MEDIUM.filter((s) => contextText.includes(s));

    if (acctSignalsHigh.length > 0 || acctSignalsMed.length > 0) {
      ACCT_REGEX.lastIndex = 0;
      while ((match = ACCT_REGEX.exec(text)) !== null) {
        const acct = match[1];
        if (!acct) continue;
        // Skip if it looks like a phone number (10 digits starting with 6-9)
        if (/^[6-9]\d{9}$/.test(acct)) continue;
        // Skip if it looks like a card number (Luhn would be checked by CardDetector)
        if (acct.length === 16) continue;

        results.push({
          detectorId: this.id,
          category: this.category,
          confidence: acctSignalsHigh.length > 0 ? 'high' : 'medium',
          maskedPreview: maskValue(acct),
          matchCount: 1,
          contextSignals: [...acctSignalsHigh, ...acctSignalsMed],
        });
      }
    }

    return results;
  }

  private contextText(ctx: FieldContext): string {
    return [ctx.labelText, ctx.placeholder, ctx.fieldName, ctx.autocomplete].join(' ').toLowerCase();
  }
}
