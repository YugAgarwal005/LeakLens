// LeakLens — Core Type Definitions
// All shared types used across the extension.
// IMPORTANT: Raw field values are represented by the opaque FieldValue type
// and must never appear in storage, messages, or logs.

// ---------------------------------------------------------------------------
// Opaque sentinel — prevents raw values from crossing trust boundaries
// ---------------------------------------------------------------------------

/** A brand that marks a string as a raw, sensitive field value.
 *  Only FieldObserver and DetectionEngine may create this type.
 *  It must never be stored, serialized, logged, or sent via messages.
 */
declare const __rawFieldValueBrand: unique symbol;
export type RawFieldValue = string & { readonly [__rawFieldValueBrand]: true };

/** Cast a string into RawFieldValue. Only call this at the point of reading
 *  a DOM field value in FieldObserver. Never propagate the raw value further
 *  than the DetectionEngine.analyze() call.
 */
export function asRawFieldValue(s: string): RawFieldValue {
  return s as RawFieldValue;
}

// ---------------------------------------------------------------------------
// Detection categories
// ---------------------------------------------------------------------------

export type DataCategory =
  | 'IDENTITY_GOV_IN' // Indian government identifiers
  | 'PAYMENT_CARD' // Credit/debit cards
  | 'PAYMENT_UPI' // UPI IDs
  | 'PAYMENT_BANK' // Bank account + IFSC
  | 'PERSONAL_CONTACT' // Email, phone, postal address
  | 'AUTH_SECRET' // Passwords, API keys, tokens, private keys
  | 'CUSTOM'; // User-defined rules

export type Region = 'IN' | 'GLOBAL' | 'US' | 'UK' | 'EU';

// ---------------------------------------------------------------------------
// Confidence and severity
// ---------------------------------------------------------------------------

export type ConfidenceLevel = 'low' | 'medium' | 'high';
export type SeverityHint = 'low' | 'medium' | 'high';

// ---------------------------------------------------------------------------
// Risk levels (user-facing)
// ---------------------------------------------------------------------------

/** Internal numeric risk score 0–100 */
export type RiskScore = number;

/** User-facing risk level */
export type RiskLevel = 'none' | 'low' | 'medium' | 'high';

export const RISK_THRESHOLDS = {
  LOW: 31,
  MEDIUM: 61,
} as const;

export function scoreToRiskLevel(score: RiskScore): RiskLevel {
  if (score < RISK_THRESHOLDS.LOW) return 'none';
  if (score < RISK_THRESHOLDS.MEDIUM) return 'low';
  if (score < 61) return 'low';
  if (score < 81) return 'medium';
  return 'high';
}

// Corrected thresholds matching the plan
export function scoreToRiskLevelFull(score: RiskScore): RiskLevel {
  if (score <= 0) return 'none';
  if (score < 31) return 'none';
  if (score < 61) return 'low';
  if (score < 81) return 'medium';
  return 'high';
}

// ---------------------------------------------------------------------------
// Field context
// ---------------------------------------------------------------------------

/** Sanitized context about the field being analyzed.
 *  Contains NO raw field value — only structural metadata.
 */
export interface FieldContext {
  /** The field's type attribute (e.g. "text", "email", "password", "tel") */
  fieldType: string;
  /** Sanitized name/id attribute of the field */
  fieldName: string;
  /** Text of the associated <label> element, if any */
  labelText: string;
  /** The origin of the form's action URL (scheme + host only, no path) */
  formActionOrigin: string;
  /** The placeholder attribute text */
  placeholder: string;
  /** The autocomplete attribute value */
  autocomplete: string;
  /** Whether this is a password-type field */
  isPasswordField: boolean;
  /** Whether this field is inside an <iframe> (same-origin) */
  isInsideFrame: boolean;
}

// ---------------------------------------------------------------------------
// Detection results
// ---------------------------------------------------------------------------

/** A masked preview string — at most 4 leading + 4 trailing chars exposed.
 *  Never contains more than 8 consecutive original characters.
 */
export type MaskedPreview = string;

/** Result from a single detector for a single field.
 *  Never contains the raw field value.
 */
export interface DetectionResult {
  detectorId: string;
  category: DataCategory;
  confidence: ConfidenceLevel;
  /** Masked preview for display in warning modal — never the raw value */
  maskedPreview: MaskedPreview;
  /** How many distinct matches were found */
  matchCount: number;
  /** Which contextual signals contributed to this result */
  contextSignals: readonly string[];
}

// ---------------------------------------------------------------------------
// Risk assessment
// ---------------------------------------------------------------------------

/** The output of the RiskScorer for a single analysis pass.
 *  Never contains raw field values.
 */
export interface RiskAssessment {
  riskLevel: RiskLevel;
  score: RiskScore;
  detections: readonly DetectionResult[];
  /** The origin being submitted to (for display only) */
  destinationOrigin: string;
  /** Whether the badge should be shown (score > 0 even if below modal threshold) */
  shouldShowBadge: boolean;
  /** Whether the modal should be shown (score >= LOW threshold) */
  shouldShowModal: boolean;
}

// ---------------------------------------------------------------------------
// Domain policy
// ---------------------------------------------------------------------------

export type DomainPolicyType = 'trusted' | 'excluded' | 'stricter' | 'default';

export interface DomainPolicy {
  domain: string;
  policyType: DomainPolicyType;
}

// ---------------------------------------------------------------------------
// Approval tracking (service worker, in-memory only)
// ---------------------------------------------------------------------------

/** A narrow, scoped approval for a single form submission action.
 *  Never contains raw field values.
 */
export interface ApprovalRecord {
  tabId: number;
  /** Hash of {formActionOrigin, fieldNames} — ties approval to this specific form */
  actionId: string;
  /** Unix timestamp when this approval expires */
  expiresAt: number;
  grantedAt: number;
}

// ---------------------------------------------------------------------------
// Extension messages (content script ↔ service worker)
// ---------------------------------------------------------------------------

/** Warning detected — sends only metadata, NEVER raw values */
export interface MsgWarningDetected {
  type: 'LEAKLENS_WARNING_DETECTED';
  tabId: number;
  category: DataCategory;
  riskLevel: RiskLevel;
}

/** Request the domain policy for a given origin */
export interface MsgGetDomainPolicy {
  type: 'LEAKLENS_GET_DOMAIN_POLICY';
  origin: string;
}

/** Response with the resolved domain policy */
export interface MsgDomainPolicyResponse {
  type: 'LEAKLENS_DOMAIN_POLICY_RESPONSE';
  policyType: DomainPolicyType;
}

/** Check if an approval exists for a given tab + action */
export interface MsgCheckApproval {
  type: 'LEAKLENS_CHECK_APPROVAL';
  tabId: number;
  actionId: string;
}

/** Response with approval status */
export interface MsgApprovalResponse {
  type: 'LEAKLENS_APPROVAL_RESPONSE';
  approved: boolean;
}

/** Record a new approval */
export interface MsgRecordApproval {
  type: 'LEAKLENS_RECORD_APPROVAL';
  tabId: number;
  actionId: string;
}

/** Request the session counter state */
export interface MsgGetSessionCounts {
  type: 'LEAKLENS_GET_SESSION_COUNTS';
}

/** Response with session counter state */
export interface MsgSessionCountsResponse {
  type: 'LEAKLENS_SESSION_COUNTS_RESPONSE';
  counts: Partial<Record<DataCategory, number>>;
  total: number;
}

/** Request extension settings */
export interface MsgGetSettings {
  type: 'LEAKLENS_GET_SETTINGS';
}

export type ExtensionMessage =
  | MsgWarningDetected
  | MsgGetDomainPolicy
  | MsgDomainPolicyResponse
  | MsgCheckApproval
  | MsgApprovalResponse
  | MsgRecordApproval
  | MsgGetSessionCounts
  | MsgSessionCountsResponse
  | MsgGetSettings;

// ---------------------------------------------------------------------------
// Warning UI (warning iframe ↔ content script via postMessage)
// ---------------------------------------------------------------------------

/** Payload sent from content script to warning iframe.
 *  MUST NOT contain raw field values.
 */
export interface WarningPayload {
  type: 'LEAKLENS_SHOW_WARNING';
  riskLevel: RiskLevel;
  categories: readonly DataCategory[];
  maskedPreviews: readonly MaskedPreview[];
  destinationOrigin: string;
  /** Nonce to prevent replay of this warning */
  nonce: string;
}

/** Decision sent back from warning iframe to content script */
export interface WarningDecision {
  type: 'LEAKLENS_WARNING_DECISION';
  decision: 'proceed' | 'cancel';
  nonce: string;
}

// ---------------------------------------------------------------------------
// Storage schema types (see storage/schema.ts for Zod validators)
// ---------------------------------------------------------------------------

export interface ExtensionSettings {
  enabled: boolean;
  badgeEnabled: boolean;
  detectorsEnabled: Partial<Record<DataCategory, boolean>>;
}

export interface CustomDetectorRule {
  id: string;
  name: string;
  category: DataCategory;
  region: Region;
  severity: SeverityHint;
  /** The regex pattern string */
  pattern: string;
  /** Optional regex flags: only 'i' and 'm' are allowed */
  flags: '' | 'i' | 'm' | 'im';
  /** Label/placeholder substrings that must appear for HIGH confidence */
  requireContext: readonly string[];
  luhnValidate: boolean;
  enabled: boolean;
}

export interface DomainPoliciesConfig {
  trusted: readonly string[];
  excluded: readonly string[];
  stricter: readonly string[];
}

export interface StorageSchema {
  schemaVersion: 1;
  settings: ExtensionSettings;
  domainPolicies: DomainPoliciesConfig;
  customDetectors: readonly CustomDetectorRule[];
}
