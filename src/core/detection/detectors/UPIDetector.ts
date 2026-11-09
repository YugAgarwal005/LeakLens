// LeakLens — UPIDetector
// Detects Unified Payment Interface (UPI) IDs.
//
// UPI ID format: <handle>@<provider>
//   - Handle: alphanumeric + dots/hyphens/underscores (mobile number or name)
//   - Provider (Virtual Payment Address suffix): known PSP identifiers
//
// Known PSPs: okaxis, okhdfcbank, okicici, oksbi, upi, paytm, ybl, ibl,
//             apl, axl, barodampay, cnrb, csbpay, dbs, dlb, ezeepay,
//             fbl, federal, finobank, hdfcbank, icici, idbi, idfcbank,
//             ikwik, indus, jkb, kbl, kotak, lvb, mahb, myicici,
//             nsdl, payzapp, pingpay, pnb, rbl, sbi, scb, tjsb, ucobank,
//             unionbank, utbi, waaxis, yapl, yesbank, yesb

import type { Detector } from '../Detector.js';
import type { DetectionResult, FieldContext, RawFieldValue } from '../../types/index.js';

// Authoritative list of VPA suffixes (NPCI registered PSPs)
const UPI_PSP_SUFFIXES = [
  'okaxis', 'okhdfcbank', 'okicici', 'oksbi', 'upi', 'paytm',
  'ybl', 'ibl', 'apl', 'axl', 'barodampay', 'cnrb', 'csbpay',
  'dbs', 'dlb', 'ezeepay', 'fbl', 'federal', 'finobank', 'hdfcbank',
  'icici', 'idbi', 'idfcbank', 'ikwik', 'indus', 'jkb', 'kbl',
  'kotak', 'lvb', 'mahb', 'myicici', 'nsdl', 'payzapp', 'pingpay',
  'pnb', 'rbl', 'sbi', 'scb', 'tjsb', 'ucobank', 'unionbank',
  'utbi', 'waaxis', 'yapl', 'yesbank', 'yesb', 'axisbank',
  'equitas', 'airtel', 'airtelpaymentsbank', 'juspay', 'gpay',
  'iciciprulife', 'allbank', 'andb', 'aubank',
];

// Build regex: handle@(known_psps) — anchored to word boundary
const PSP_PATTERN = UPI_PSP_SUFFIXES.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const UPI_REGEX = new RegExp(
  `\\b([a-zA-Z0-9._\\-]{3,50}@(?:${PSP_PATTERN}))\\b`,
  'gi',
);

// Also match phone@upi format (numeric handles with @upi suffix)
const UPI_PHONE_REGEX = /\b([6-9]\d{9}@[a-z]{2,20})\b/gi;

const CONTEXT_HIGH = ['upi', 'vpa', 'virtual payment', 'bhim', 'gpay', 'paytm', 'phonepe'];
const CONTEXT_MEDIUM = ['payment', 'pay', 'transfer', 'send money'];

export class UPIDetector implements Detector {
  readonly id = 'upi-v1';
  readonly version = '1.0.0';
  readonly category = 'PAYMENT_UPI' as const;
  readonly regions = ['IN'] as const;
  readonly severityHint = 'medium' as const;

  detect(value: RawFieldValue, context: FieldContext): DetectionResult[] {
    if (context.isPasswordField) return [];
    const text = value as string;
    const contextText = this.contextText(context);
    const seen = new Set<string>();
    const results: DetectionResult[] = [];

    for (const regex of [UPI_REGEX, UPI_PHONE_REGEX]) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const upi = match[1]?.toLowerCase();
        if (!upi || seen.has(upi)) continue;
        seen.add(upi);

        const contextSignals = this.scoreContext(contextText);
        const confidence: DetectionResult['confidence'] = contextSignals.length > 0 ? 'high' : 'medium';

        results.push({
          detectorId: this.id,
          category: this.category,
          confidence,
          maskedPreview: this.mask(upi),
          matchCount: 1,
          contextSignals,
        });
      }
    }

    return results;
  }

  private mask(upi: string): string {
    const atIdx = upi.indexOf('@');
    if (atIdx < 0) return '•••@•••';
    const handle = upi.slice(0, atIdx);
    const suffix = upi.slice(atIdx);
    const masked = handle.length > 4
      ? handle.slice(0, 2) + '•'.repeat(handle.length - 4) + handle.slice(-2)
      : '••••';
    return `${masked}${suffix}`;
  }

  private contextText(ctx: FieldContext): string {
    return [ctx.labelText, ctx.placeholder, ctx.fieldName, ctx.autocomplete].join(' ').toLowerCase();
  }

  private scoreContext(text: string): string[] {
    const s: string[] = [];
    for (const c of CONTEXT_HIGH) if (text.includes(c)) s.push(c);
    for (const c of CONTEXT_MEDIUM) if (text.includes(c)) s.push(c);
    return s;
  }
}
