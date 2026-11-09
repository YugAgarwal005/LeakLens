// LeakLens — CustomRuleDetector
// Interprets a declarative CustomDetectorRule config object at runtime and
// presents itself as a standard Detector. This is what allows users to add
// their own patterns through the options page without any code execution.
//
// Security properties:
// 1. The regex is compiled once at construction time and reused.
// 2. Only 'i' and 'm' flags are allowed — 'g' is managed internally.
// 3. Optional Luhn validation is applied via the shared algorithm module.
// 4. The pattern string length is capped at 512 chars to prevent catastrophic
//    backtracking from user-supplied ReDoS patterns.
// 5. Construction throws if the pattern is invalid — the caller must catch.

import type { Detector } from '../Detector.js';
import { maskValue } from '../Detector.js';
import { luhnValidate } from '../algorithms/luhn.js';
import type {
  DetectionResult,
  FieldContext,
  RawFieldValue,
  CustomDetectorRule,
  Region,
} from '../../types/index.js';

const MAX_PATTERN_LENGTH = 512;
const ALLOWED_FLAGS = /^[im]*$/;

export class CustomRuleDetector implements Detector {
  readonly id: string;
  readonly version = '1.0.0';
  readonly category: CustomDetectorRule['category'];
  readonly regions: readonly Region[];
  readonly severityHint: CustomDetectorRule['severity'];

  private readonly regex: RegExp;
  private readonly rule: CustomDetectorRule;

  constructor(rule: CustomDetectorRule) {
    if (rule.pattern.length > MAX_PATTERN_LENGTH) {
      throw new Error(`Custom rule "${rule.name}": pattern exceeds max length of ${MAX_PATTERN_LENGTH}`);
    }
    if (!ALLOWED_FLAGS.test(rule.flags)) {
      throw new Error(`Custom rule "${rule.name}": only flags 'i' and 'm' are allowed`);
    }

    // Always add 'g' internally for exec loop — never expose to user input
    this.regex = new RegExp(rule.pattern, rule.flags + 'g');
    this.rule = rule;
    this.id = rule.id;
    this.category = rule.category;
    this.regions = [rule.region];
    this.severityHint = rule.severity;
  }

  detect(value: RawFieldValue, context: FieldContext): DetectionResult[] {
    if (context.isPasswordField && this.category !== 'AUTH_SECRET') return [];
    const text = value as string;
    const contextText = [context.labelText, context.placeholder, context.fieldName, context.autocomplete]
      .join(' ')
      .toLowerCase();

    const results: DetectionResult[] = [];
    this.regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    let count = 0;

    while ((match = this.regex.exec(text)) !== null) {
      const raw = match[1] ?? match[0]; // Prefer capture group 1 if present
      if (!raw) continue;

      // Optional Luhn validation
      if (this.rule.luhnValidate) {
        const digits = raw.replace(/\D/g, '');
        if (!luhnValidate(digits)) continue;
      }

      // Context-driven confidence
      const contextSignals = this.rule.requireContext.filter(kw => contextText.includes(kw.toLowerCase()));
      let confidence: DetectionResult['confidence'];
      if (contextSignals.length > 0) {
        confidence = 'high';
      } else if (this.rule.requireContext.length > 0) {
        // Rule requires context but none found — suppress at low confidence
        confidence = 'low';
      } else {
        confidence = 'medium';
      }

      count++;
      results.push({
        detectorId: this.id,
        category: this.category,
        confidence,
        maskedPreview: maskValue(raw),
        matchCount: 1,
        contextSignals: contextSignals.length > 0 ? contextSignals : [`rule:${this.rule.name}`],
      });

      // Prevent runaway on pathological inputs
      if (count >= 10) break;
    }

    // Collapse multiple matches into a single result with a count
    if (results.length > 1) {
      return [{
        ...results[0]!,
        matchCount: results.length,
        maskedPreview: results[0]!.maskedPreview + (results.length > 1 ? ` +${results.length - 1} more` : ''),
      }];
    }

    return results;
  }
}

/**
 * Safe factory: attempts to construct a CustomRuleDetector and returns null
 * if the rule's pattern is invalid. Prevents a bad rule from crashing the
 * entire registry.
 */
export function tryCreateCustomDetector(rule: CustomDetectorRule): CustomRuleDetector | null {
  try {
    return new CustomRuleDetector(rule);
  } catch (err) {
    console.warn(`[LeakLens] Skipping custom rule "${rule.name}":`, err);
    return null;
  }
}
