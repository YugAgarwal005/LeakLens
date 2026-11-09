// LeakLens — Storage Schema (Zod validators + defaults)
// All data written to chrome.storage.local must pass these validators.

import { z } from 'zod';
import type { StorageSchema } from '../types/index.js';

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const DataCategorySchema = z.enum([
  'IDENTITY_GOV_IN',
  'PAYMENT_CARD',
  'PAYMENT_UPI',
  'PAYMENT_BANK',
  'PERSONAL_CONTACT',
  'AUTH_SECRET',
  'CUSTOM',
]);

const RegionSchema = z.enum(['IN', 'GLOBAL', 'US', 'UK', 'EU']);
const SeverityHintSchema = z.enum(['low', 'medium', 'high']);

/** Allowed regex flags — restrict to safe subset only */
const RegexFlagsSchema = z.enum(['', 'i', 'm', 'im']);

/** Domain name validator — basic hostname check */
const DomainSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
    'Invalid domain name',
  );

// ---------------------------------------------------------------------------
// Custom detector rule schema
// ---------------------------------------------------------------------------

/** Maximum allowed pattern length to prevent regex DoS via enormous patterns */
const MAX_PATTERN_LENGTH = 500;

/** Safe pattern validator: rejects empty-match patterns and applies length limit */
const SafeRegexPatternSchema = z
  .string()
  .min(1, 'Pattern must not be empty')
  .max(MAX_PATTERN_LENGTH, `Pattern must not exceed ${MAX_PATTERN_LENGTH} characters`)
  .refine(
    (pattern) => {
      try {
        const re = new RegExp(pattern);
        // Reject patterns that match the empty string (high DoS risk)
        return !re.test('');
      } catch {
        return false;
      }
    },
    { message: 'Pattern is invalid or matches empty string' },
  );

export const CustomDetectorRuleSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[a-z0-9-_]+$/, 'ID must be lowercase alphanumeric with hyphens/underscores'),
  name: z.string().min(1).max(200),
  category: DataCategorySchema,
  region: RegionSchema,
  severity: SeverityHintSchema,
  pattern: SafeRegexPatternSchema,
  flags: RegexFlagsSchema,
  requireContext: z.array(z.string().min(1).max(100)).max(20),
  luhnValidate: z.boolean(),
  enabled: z.boolean(),
});

// ---------------------------------------------------------------------------
// Full storage schema
// ---------------------------------------------------------------------------

export const ExtensionSettingsSchema = z.object({
  enabled: z.boolean(),
  badgeEnabled: z.boolean(),
  detectorsEnabled: z.record(DataCategorySchema, z.boolean()),
});

export const DomainPoliciesConfigSchema = z.object({
  trusted: z.array(DomainSchema).max(500),
  excluded: z.array(DomainSchema).max(500),
  stricter: z.array(DomainSchema).max(500),
});

export const StorageSchemaValidator = z.object({
  schemaVersion: z.literal(1),
  settings: ExtensionSettingsSchema,
  domainPolicies: DomainPoliciesConfigSchema,
  customDetectors: z.array(CustomDetectorRuleSchema).max(100),
});

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS: StorageSchema['settings'] = {
  enabled: true,
  badgeEnabled: true,
  detectorsEnabled: {
    IDENTITY_GOV_IN: true,
    PAYMENT_CARD: true,
    PAYMENT_UPI: true,
    PAYMENT_BANK: true,
    PERSONAL_CONTACT: true,
    AUTH_SECRET: true,
    CUSTOM: true,
  },
};

export const DEFAULT_DOMAIN_POLICIES: StorageSchema['domainPolicies'] = {
  trusted: [],
  excluded: [],
  stricter: [],
};

export const DEFAULT_STORAGE: StorageSchema = {
  schemaVersion: 1,
  settings: DEFAULT_SETTINGS,
  domainPolicies: DEFAULT_DOMAIN_POLICIES,
  customDetectors: [],
};
