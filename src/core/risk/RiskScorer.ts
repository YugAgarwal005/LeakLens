// LeakLens — RiskScorer
// Converts raw detection results into a user-facing risk assessment.
//
// Scoring model (from Phase 2 plan):
//   BASE SCORE by category:
//     AUTH_SECRET          → 70
//     IDENTITY_GOV_IN      → 65
//     PAYMENT_CARD         → 65
//     PAYMENT_BANK         → 60
//     PAYMENT_UPI          → 40
//     PERSONAL_CONTACT     → 15
//     CUSTOM               → 45 (configurable per rule, but default 45)
//
//   CONFIDENCE MODIFIER:
//     HIGH   → × 1.0
//     MEDIUM → × 0.7
//     LOW    → × 0.4
//
//   AGGREGATION: highest score + 10 per additional detector (capped at 100)
//
//   ACTION MODIFIER (applied externally by FieldObserver):
//     Typing/paste → × 0.5 (badge only)
//     Submit       → × 1.0 (full modal assessment)
//
//   DOMAIN MODIFIER:
//     trusted  + expected field → × 0.0
//     trusted  + unexpected     → × 0.5
//     stricter                  → × 1.3 (capped at 100)
//     excluded                  → score 0 (no-op — FieldObserver exits early)

import type {
  DetectionResult,
  FieldContext,
  RiskAssessment,
  RiskLevel,
  RiskScore,
  DataCategory,
  DomainPolicyType,
} from '../types/index.js';
import { RISK_THRESHOLDS } from '../types/index.js';

// ---------------------------------------------------------------------------
// Category base scores
// ---------------------------------------------------------------------------

const CATEGORY_BASE_SCORE: Record<DataCategory, number> = {
  AUTH_SECRET:      70,
  IDENTITY_GOV_IN:  65,
  PAYMENT_CARD:     65,
  PAYMENT_BANK:     60,
  PAYMENT_UPI:      40,
  PERSONAL_CONTACT: 15,
  CUSTOM:           45,
};

// ---------------------------------------------------------------------------
// Confidence multipliers
// ---------------------------------------------------------------------------

const CONFIDENCE_MULTIPLIER: Record<DetectionResult['confidence'], number> = {
  high:   1.0,
  medium: 0.7,
  low:    0.4,
};

// ---------------------------------------------------------------------------
// Context suppression — certain field types suppress low-sensitivity detectors
// ---------------------------------------------------------------------------

/** If the field type is expected for the category, suppress or reduce score */
function isExpectedFieldContext(category: DataCategory, context: FieldContext): boolean {
  if (category === 'PERSONAL_CONTACT') {
    if (context.fieldType === 'email' || context.fieldType === 'tel') return true;
  }
  if (category === 'PAYMENT_CARD') {
    // On a trusted payment domain this is handled by domain modifier
    // Here we only check if the field explicitly says "card"
    if (context.autocomplete.includes('cc-number')) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// RiskScorer
// ---------------------------------------------------------------------------

export class RiskScorer {
  /**
   * Compute a risk assessment from a set of detection results.
   *
   * @param detections  Results from DetectorRegistry.runAll()
   * @param context     Field context (for expected-use suppression)
   * @param domainPolicy The resolved domain policy for the page origin
   * @param destinationOrigin The scheme+host of the page (for display only)
   * @param isSubmitAction If true, apply the full action multiplier (×1.0);
   *                       if false (typing/paste), apply ×0.5
   */
  score(
    detections: readonly DetectionResult[],
    context: FieldContext,
    domainPolicy: DomainPolicyType,
    destinationOrigin: string,
    isSubmitAction: boolean,
  ): RiskAssessment {
    // Excluded domains: never score
    if (domainPolicy === 'excluded' || detections.length === 0) {
      return this.buildAssessment(0, detections, destinationOrigin);
    }

    // Compute per-detection scores
    const scores = detections.map((d) => {
      const base = CATEGORY_BASE_SCORE[d.category] ?? 45;
      const confidenceMod = CONFIDENCE_MULTIPLIER[d.confidence];
      let raw = base * confidenceMod;

      // Suppress if field context is the expected use-case
      if (isExpectedFieldContext(d.category, context)) {
        raw *= 0.3;
      }

      return raw;
    });

    // Aggregate: highest + 10 per additional detection
    scores.sort((a, b) => b - a);
    let aggregate = scores[0] ?? 0;
    for (let i = 1; i < scores.length; i++) {
      aggregate += 10;
    }
    aggregate = Math.min(aggregate, 100);

    // Domain policy modifier
    if (domainPolicy === 'trusted') {
      // Trusted: suppress to 0 for expected contexts, halve for unexpected
      const hasExpected = detections.some((d) => isExpectedFieldContext(d.category, context));
      aggregate *= hasExpected ? 0 : 0.5;
    } else if (domainPolicy === 'stricter') {
      aggregate = Math.min(aggregate * 1.3, 100);
    }

    const unadjustedScore = Math.round(aggregate);
    let riskLevel = this.scoreToLevel(unadjustedScore);
    if (riskLevel === 'none' && unadjustedScore > 0 && detections.length > 0) {
      riskLevel = 'low';
    }

    // Action modifier: typing/paste phase gets half score (suppresses modal, keeps badge)
    let finalScore = unadjustedScore;
    if (!isSubmitAction) {
      finalScore = Math.round(finalScore * 0.5);
    }

    return {
      riskLevel,
      score: finalScore,
      detections,
      destinationOrigin,
      shouldShowBadge: detections.length > 0 && unadjustedScore > 0,
      shouldShowModal: isSubmitAction && finalScore >= RISK_THRESHOLDS.LOW,
    };
  }

  private buildAssessment(
    score: RiskScore,
    detections: readonly DetectionResult[],
    destinationOrigin: string,
  ): RiskAssessment {
    const riskLevel = this.scoreToLevel(score);

    return {
      riskLevel,
      score,
      detections,
      destinationOrigin,
      shouldShowBadge: score > 0,
      shouldShowModal: score >= RISK_THRESHOLDS.LOW,
    };
  }

  private scoreToLevel(score: RiskScore): RiskLevel {
    if (score <= 0) return 'none';
    if (score < RISK_THRESHOLDS.LOW) return 'none';  // 0–30: none
    if (score < 61) return 'low';                      // 31–60: low
    if (score < 81) return 'medium';                   // 61–80: medium
    return 'high';                                     // 81–100: high
  }
}
