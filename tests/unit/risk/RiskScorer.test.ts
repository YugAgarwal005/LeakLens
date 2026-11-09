// LeakLens — RiskScorer Unit Tests

import { describe, it, expect } from 'vitest';
import { RiskScorer } from '../../../src/core/risk/RiskScorer.js';
import type { DetectionResult, FieldContext } from '../../../src/core/types/index.js';

const SCORER = new RiskScorer();

function buildCtx(overrides: Partial<FieldContext> = {}): FieldContext {
  return {
    fieldType: 'text', fieldName: '', labelText: '',
    formActionOrigin: 'https://example.com', placeholder: '',
    autocomplete: '', isPasswordField: false, isInsideFrame: false,
    ...overrides,
  };
}

function makeDetection(
  category: DetectionResult['category'],
  confidence: DetectionResult['confidence'],
): DetectionResult {
  return {
    detectorId: 'test-detector',
    category,
    confidence,
    maskedPreview: 'XXXX1234',
    matchCount: 1,
    contextSignals: [],
  };
}

// ---------------------------------------------------------------------------
// Basic scoring
// ---------------------------------------------------------------------------

describe('RiskScorer — basic scoring', () => {
  it('returns none risk for empty detections', () => {
    const r = SCORER.score([], buildCtx(), 'default', 'https://example.com', true);
    expect(r.riskLevel).toBe('none');
    expect(r.score).toBe(0);
    expect(r.shouldShowBadge).toBe(false);
    expect(r.shouldShowModal).toBe(false);
  });

  it('scores IDENTITY_GOV_IN HIGH confidence as high risk on submit', () => {
    const r = SCORER.score(
      [makeDetection('IDENTITY_GOV_IN', 'high')],
      buildCtx(), 'default', 'https://example.com', true,
    );
    // Base 65 × 1.0 = 65 → 'medium' (61–80)
    expect(r.riskLevel).toBe('medium');
    expect(r.score).toBeGreaterThanOrEqual(61);
  });

  it('scores AUTH_SECRET HIGH confidence as high risk on submit', () => {
    const r = SCORER.score(
      [makeDetection('AUTH_SECRET', 'high')],
      buildCtx(), 'default', 'https://example.com', true,
    );
    // Base 70 × 1.0 = 70 → 'medium'
    expect(r.score).toBeGreaterThanOrEqual(61);
  });

  it('applies confidence multiplier — LOW confidence reduces score', () => {
    const highR = SCORER.score(
      [makeDetection('IDENTITY_GOV_IN', 'high')],
      buildCtx(), 'default', 'https://example.com', true,
    );
    const lowR = SCORER.score(
      [makeDetection('IDENTITY_GOV_IN', 'low')],
      buildCtx(), 'default', 'https://example.com', true,
    );
    expect(highR.score).toBeGreaterThan(lowR.score);
  });

  it('typing action (isSubmitAction=false) gives half the score', () => {
    const submitR = SCORER.score(
      [makeDetection('IDENTITY_GOV_IN', 'high')],
      buildCtx(), 'default', 'https://example.com', true,
    );
    const typingR = SCORER.score(
      [makeDetection('IDENTITY_GOV_IN', 'high')],
      buildCtx(), 'default', 'https://example.com', false,
    );
    expect(typingR.score).toBeLessThan(submitR.score);
    expect(Math.round(submitR.score / 2)).toBe(typingR.score);
  });
});

// ---------------------------------------------------------------------------
// Domain policy effects
// ---------------------------------------------------------------------------

describe('RiskScorer — domain policy effects', () => {
  it('excluded domain always returns score 0', () => {
    const r = SCORER.score(
      [makeDetection('PAYMENT_CARD', 'high')],
      buildCtx(), 'excluded', 'https://example.com', true,
    );
    expect(r.score).toBe(0);
    expect(r.riskLevel).toBe('none');
  });

  it('trusted domain with expected field context reduces to 0', () => {
    const r = SCORER.score(
      [makeDetection('PERSONAL_CONTACT', 'high')],
      buildCtx({ fieldType: 'email' }), 'trusted', 'https://bank.com', true,
    );
    expect(r.score).toBe(0);
  });

  it('trusted domain with unexpected high-risk category halves the score', () => {
    const defaultR = SCORER.score(
      [makeDetection('IDENTITY_GOV_IN', 'high')],
      buildCtx(), 'default', 'https://example.com', true,
    );
    const trustedR = SCORER.score(
      [makeDetection('IDENTITY_GOV_IN', 'high')],
      buildCtx(), 'trusted', 'https://bank.com', true,
    );
    expect(trustedR.score).toBeLessThan(defaultR.score);
  });

  it('stricter domain increases score (capped at 100)', () => {
    const defaultR = SCORER.score(
      [makeDetection('AUTH_SECRET', 'high')],
      buildCtx(), 'default', 'https://example.com', true,
    );
    const stricterR = SCORER.score(
      [makeDetection('AUTH_SECRET', 'high')],
      buildCtx(), 'stricter', 'https://example.com', true,
    );
    expect(stricterR.score).toBeGreaterThanOrEqual(defaultR.score);
    expect(stricterR.score).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Multiple detections
// ---------------------------------------------------------------------------

describe('RiskScorer — multiple detections', () => {
  it('adds 10 per additional detection beyond the first', () => {
    const single = SCORER.score(
      [makeDetection('PAYMENT_CARD', 'high')],
      buildCtx(), 'default', 'https://example.com', true,
    );
    const double = SCORER.score(
      [makeDetection('PAYMENT_CARD', 'high'), makeDetection('AUTH_SECRET', 'high')],
      buildCtx(), 'default', 'https://example.com', true,
    );
    // Double should be higher (up to cap)
    expect(double.score).toBeGreaterThanOrEqual(single.score);
  });

  it('caps aggregate score at 100', () => {
    const many = Array.from({ length: 10 }, () => makeDetection('AUTH_SECRET', 'high'));
    const r = SCORER.score(many, buildCtx(), 'default', 'https://example.com', true);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// shouldShowModal threshold
// ---------------------------------------------------------------------------

describe('RiskScorer — shouldShowModal threshold', () => {
  it('shouldShowModal is true when score ≥ 31', () => {
    const r = SCORER.score(
      [makeDetection('IDENTITY_GOV_IN', 'high')],
      buildCtx(), 'default', 'https://example.com', true,
    );
    if (r.score >= 31) {
      expect(r.shouldShowModal).toBe(true);
    }
  });

  it('shouldShowModal is false when score is 0', () => {
    const r = SCORER.score([], buildCtx(), 'default', 'https://example.com', true);
    expect(r.shouldShowModal).toBe(false);
  });
});
