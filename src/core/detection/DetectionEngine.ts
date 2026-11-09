// LeakLens — DetectionEngine
// Orchestrates the DetectorRegistry + RiskScorer for a single field analysis.
// This is the single entry point used by FieldObserver.

import type { RiskAssessment, RawFieldValue, FieldContext, DomainPolicyType } from '../types/index.js';
import type { DetectorRegistry } from './DetectorRegistry.js';
import { RiskScorer } from '../risk/RiskScorer.js';

export class DetectionEngine {
  private registry: DetectorRegistry;
  private scorer: RiskScorer;

  constructor(registry: DetectorRegistry) {
    this.registry = registry;
    this.scorer = new RiskScorer();
  }

  /**
   * Analyze a single field value and return a risk assessment.
   * The raw value is consumed here and must not be stored or propagated.
   *
   * @param value          Raw field value (branded)
   * @param context        Sanitized field metadata
   * @param domainPolicy   Resolved policy for the page origin
   * @param isSubmitAction True during form submit, false during typing/paste
   */
  analyze(
    value: RawFieldValue,
    context: FieldContext,
    domainPolicy: DomainPolicyType,
    isSubmitAction: boolean,
  ): RiskAssessment {
    // Skip if excluded at the policy level
    if (domainPolicy === 'excluded') {
      return this.emptyAssessment();
    }

    // Skip very short values — no valid sensitive identifier is < 8 chars
    if ((value as string).trim().length < 8) {
      return this.emptyAssessment();
    }

    const detections = this.registry.runAll(value, context);

    if (detections.length === 0) {
      return this.emptyAssessment();
    }

    return this.scorer.score(
      detections,
      context,
      domainPolicy,
      window.location.origin,
      isSubmitAction,
    );
  }

  private emptyAssessment(): RiskAssessment {
    return {
      riskLevel: 'none',
      score: 0,
      detections: [],
      destinationOrigin: window.location.origin,
      shouldShowBadge: false,
      shouldShowModal: false,
    };
  }
}
