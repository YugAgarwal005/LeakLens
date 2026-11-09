// LeakLens — StorageManager Unit Tests
// Tests schema validation, migration framework, and default loading.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StorageSchema } from '../../../src/core/types/index.js';
import { DEFAULT_STORAGE } from '../../../src/core/storage/schema.js';
import { CustomDetectorRuleSchema } from '../../../src/core/storage/schema.js';

// ---------------------------------------------------------------------------
// Schema validation tests (using Zod validators directly)
// ---------------------------------------------------------------------------

describe('CustomDetectorRuleSchema validation', () => {
  const validRule = {
    id: 'acme-employee-id-v1',
    name: 'ACME Employee ID',
    category: 'CUSTOM' as const,
    region: 'GLOBAL' as const,
    severity: 'medium' as const,
    pattern: 'ACME-[0-9]{6}',
    flags: '' as const,
    requireContext: ['employee'],
    luhnValidate: false,
    enabled: true,
  };

  it('accepts a valid custom detector rule', () => {
    const result = CustomDetectorRuleSchema.safeParse(validRule);
    expect(result.success).toBe(true);
  });

  it('rejects a rule with an empty pattern', () => {
    const result = CustomDetectorRuleSchema.safeParse({ ...validRule, pattern: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a rule whose pattern matches the empty string', () => {
    // Pattern ".*" matches empty string — high DoS risk
    const result = CustomDetectorRuleSchema.safeParse({ ...validRule, pattern: '.*' });
    expect(result.success).toBe(false);
  });

  it('rejects a pattern longer than 500 characters', () => {
    const longPattern = 'A'.repeat(501);
    const result = CustomDetectorRuleSchema.safeParse({ ...validRule, pattern: longPattern });
    expect(result.success).toBe(false);
  });

  it('rejects a rule with an invalid regex pattern', () => {
    const result = CustomDetectorRuleSchema.safeParse({ ...validRule, pattern: '[invalid(' });
    expect(result.success).toBe(false);
  });

  it('rejects a rule with disallowed regex flags', () => {
    const result = CustomDetectorRuleSchema.safeParse({ ...validRule, flags: 'g' });
    expect(result.success).toBe(false);
  });

  it('accepts the "i" flag', () => {
    const result = CustomDetectorRuleSchema.safeParse({ ...validRule, flags: 'i' });
    expect(result.success).toBe(true);
  });

  it('rejects an ID with uppercase characters', () => {
    const result = CustomDetectorRuleSchema.safeParse({ ...validRule, id: 'Invalid-ID' });
    expect(result.success).toBe(false);
  });

  it('rejects an ID with special characters', () => {
    const result = CustomDetectorRuleSchema.safeParse({ ...validRule, id: 'invalid id!' });
    expect(result.success).toBe(false);
  });

  it('rejects more than 100 context strings', () => {
    const manyContexts = Array.from({ length: 101 }, (_, i) => `context-${i}`);
    const result = CustomDetectorRuleSchema.safeParse({ ...validRule, requireContext: manyContexts });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid category', () => {
    const result = CustomDetectorRuleSchema.safeParse({ ...validRule, category: 'INVALID_CATEGORY' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Default storage structure
// ---------------------------------------------------------------------------

describe('DEFAULT_STORAGE', () => {
  it('has schemaVersion 1', () => {
    expect(DEFAULT_STORAGE.schemaVersion).toBe(1);
  });

  it('has extension enabled by default', () => {
    expect(DEFAULT_STORAGE.settings.enabled).toBe(true);
  });

  it('has badge enabled by default', () => {
    expect(DEFAULT_STORAGE.settings.badgeEnabled).toBe(true);
  });

  it('has all detectors enabled by default', () => {
    const { detectorsEnabled } = DEFAULT_STORAGE.settings;
    const categories = [
      'IDENTITY_GOV_IN',
      'PAYMENT_CARD',
      'PAYMENT_UPI',
      'PAYMENT_BANK',
      'PERSONAL_CONTACT',
      'AUTH_SECRET',
      'CUSTOM',
    ];
    for (const cat of categories) {
      expect(detectorsEnabled[cat as keyof typeof detectorsEnabled]).toBe(true);
    }
  });

  it('has empty domain lists by default', () => {
    const { domainPolicies } = DEFAULT_STORAGE;
    expect(domainPolicies.trusted).toHaveLength(0);
    expect(domainPolicies.excluded).toHaveLength(0);
    expect(domainPolicies.stricter).toHaveLength(0);
  });

  it('has no custom detectors by default', () => {
    expect(DEFAULT_STORAGE.customDetectors).toHaveLength(0);
  });
});
