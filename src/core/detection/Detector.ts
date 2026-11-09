// LeakLens — Detector Interface
// All detectors implement this interface. The DetectorRegistry discovers and
// runs them. No detector may retain or log raw field values.

import type {
  DataCategory,
  Region,
  SeverityHint,
  DetectionResult,
  FieldContext,
  RawFieldValue,
} from '../types/index.js';

// ---------------------------------------------------------------------------
// Core detector interface
// ---------------------------------------------------------------------------

export interface Detector {
  /** Unique, stable identifier for this detector (e.g. "aadhaar-v1") */
  readonly id: string;
  /** Semver string */
  readonly version: string;
  /** Broad data category this detector targets */
  readonly category: DataCategory;
  /** Geographic regions where this detector is relevant */
  readonly regions: readonly Region[];
  /** Suggested severity when this detector fires at HIGH confidence */
  readonly severityHint: SeverityHint;

  /**
   * Analyse a raw field value and return any detections.
   *
   * IMPORTANT: This function receives the raw field value as RawFieldValue.
   * - It MUST NOT store the value beyond this call.
   * - It MUST NOT log the value.
   * - It MUST NOT include the value in DetectionResult — only masked previews.
   *
   * @param value  The raw field value (branded — cannot be stored/sent accidentally)
   * @param context Sanitized field metadata (no raw value inside)
   * @returns Array of detection results (possibly empty)
   */
  detect(value: RawFieldValue, context: FieldContext): DetectionResult[];
}

// ---------------------------------------------------------------------------
// Masking utility — used by all detectors to produce safe previews
// ---------------------------------------------------------------------------

/**
 * Produce a masked preview of a matched string.
 * Shows at most 4 leading + 4 trailing characters, with Xs in between.
 * For values shorter than 8 characters, shows only the category name.
 *
 * @param matched  The matched portion of the raw value (NOT the full value)
 * @param minLen   Minimum length to show any preview (default 8)
 * @returns A safe preview string — never more than 8 real characters exposed
 */
export function maskValue(matched: string, minLen = 8): string {
  if (matched.length < minLen) {
    return '•••••••••';
  }
  const lead = matched.slice(0, 4);
  const tail = matched.slice(-4);
  const middle = 'X'.repeat(Math.max(2, matched.length - 8));
  return `${lead}${middle}${tail}`;
}
