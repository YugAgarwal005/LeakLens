import React, { useEffect, useState, useCallback, useRef } from 'react';
import type {
  DataCategory,
  DomainPolicyType,
  ExtensionSettings,
  DomainPoliciesConfig,
  CustomDetectorRule,
  Region,
  SeverityHint,
} from '../../src/core/types/index';
import './Options.css';

// ─────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────

type TabId = 'general' | 'detectors' | 'domains' | 'rules';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'general',   label: 'General',      icon: '⚙' },
  { id: 'detectors', label: 'Detectors',    icon: '🔍' },
  { id: 'domains',   label: 'Domains',      icon: '🌐' },
  { id: 'rules',     label: 'Custom Rules', icon: '📝' },
];

const DETECTOR_META: {
  id: string; category: DataCategory; name: string; desc: string; regions: string;
}[] = [
  { id: 'aadhaar-v1',           category: 'IDENTITY_GOV_IN', name: 'Aadhaar',          desc: '12-digit UID with Verhoeff checksum',                regions: 'India' },
  { id: 'pan-v1',               category: 'IDENTITY_GOV_IN', name: 'PAN Card',          desc: '10-character income tax identifier',                  regions: 'India' },
  { id: 'card-v1',              category: 'PAYMENT_CARD',    name: 'Payment Cards',     desc: 'Visa, Mastercard, RuPay, Amex (Luhn validated)',       regions: 'Global' },
  { id: 'upi-v1',               category: 'PAYMENT_UPI',     name: 'UPI ID',            desc: 'handle@psp VPA format (47 PSPs supported)',           regions: 'India' },
  { id: 'bank-v1',              category: 'PAYMENT_BANK',    name: 'Bank Details',      desc: 'IFSC codes and bank account numbers',                 regions: 'India' },
  { id: 'apikey-v1',            category: 'AUTH_SECRET',     name: 'API Keys & Tokens', desc: 'GitHub, AWS, Stripe, OpenAI, JWTs, PEM blocks',       regions: 'Global' },
  { id: 'password-heuristic-v1',category: 'AUTH_SECRET',     name: 'Password Heuristic',desc: 'Complex strings in non-password fields',              regions: 'Global' },
  { id: 'email-v1',             category: 'PERSONAL_CONTACT',name: 'Email Addresses',   desc: 'Emails in unexpected field contexts (low severity)',  regions: 'Global' },
  { id: 'phone-v1',             category: 'PERSONAL_CONTACT',name: 'Phone Numbers',     desc: 'Indian mobile + international (low severity)',        regions: 'Global' },
];

const CATEGORY_COLORS: Record<DataCategory, string> = {
  IDENTITY_GOV_IN:  '#ff4757',
  PAYMENT_CARD:     '#ffa502',
  PAYMENT_UPI:      '#2ed573',
  PAYMENT_BANK:     '#70a1ff',
  AUTH_SECRET:      '#ff6b81',
  PERSONAL_CONTACT: '#9494b8',
  CUSTOM:           '#a29bfe',
};

const POLICY_DESCRIPTIONS: Record<Exclude<DomainPolicyType, 'default'>, { title: string; desc: string; badge: string }> = {
  trusted:  { title: 'Trusted',   desc: 'Reduced sensitivity — expected use sites like your bank or HR portal.', badge: 'badge-dim' },
  excluded: { title: 'Excluded',  desc: 'LeakLens is fully disabled on these domains.', badge: 'badge-dim' },
  stricter: { title: 'Stricter',  desc: 'Extra sensitivity — personal data or confidential environments.', badge: 'badge-warning' },
};

const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  badgeEnabled: true,
  detectorsEnabled: {},
};

const DEFAULT_POLICIES: DomainPoliciesConfig = {
  trusted: [], excluded: [], stricter: [],
};

// ─────────────────────────────────────────────────────────
// Storage helpers
// ─────────────────────────────────────────────────────────

async function loadAll(): Promise<{
  settings: ExtensionSettings;
  domainPolicies: DomainPoliciesConfig;
  customDetectors: CustomDetectorRule[];
}> {
  const data = await browser.storage.local.get(['settings', 'domainPolicies', 'customDetectors']) as Record<string, unknown>;
  return {
    settings:        (data['settings']        as ExtensionSettings)       ?? DEFAULT_SETTINGS,
    domainPolicies:  (data['domainPolicies']  as DomainPoliciesConfig)    ?? DEFAULT_POLICIES,
    customDetectors: (data['customDetectors'] as CustomDetectorRule[])    ?? [],
  };
}

async function savePartial(key: string, value: unknown): Promise<void> {
  await browser.storage.local.set({ [key]: value });
}

// ─────────────────────────────────────────────────────────
// Save indicator hook
// ─────────────────────────────────────────────────────────

function useSaveIndicator() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback(() => {
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 2000);
  }, []);
  return { visible, flash };
}

// ─────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────

// Toggle row
function SettingRow({ id, label, desc, checked, onChange }: {
  id: string; label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row-info">
        <div className="setting-row-label">{label}</div>
        {desc && <div className="setting-row-desc">{desc}</div>}
      </div>
      <label className="toggle" aria-label={label}>
        <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="toggle-track" />
      </label>
    </div>
  );
}

// Domain column
function DomainColumn({
  policyKey, title, desc, badge, domains, onChange,
}: {
  policyKey: Exclude<DomainPolicyType, 'default'>;
  title: string; desc: string; badge: string;
  domains: readonly string[];
  onChange: (updated: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const validate = (val: string): string | null => {
    const v = val.trim().toLowerCase();
    if (!v) return 'Enter a domain';
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(v)) return 'Enter a valid domain (e.g. example.com)';
    if (domains.includes(v)) return 'Already in this list';
    return null;
  };

  const add = () => {
    const v = input.trim().toLowerCase();
    const err = validate(v);
    if (err) { setError(err); return; }
    onChange([...domains, v]);
    setInput('');
    setError('');
  };

  const remove = (domain: string) => {
    onChange(domains.filter(d => d !== domain));
  };

  return (
    <div className="settings-group">
      <div>
        <div className="settings-group-title">
          {title} <span className={`badge ${badge}`} style={{ fontSize: '10px', marginLeft: '6px' }}>{title}</span>
        </div>
        <div className="settings-group-desc">{desc}</div>
      </div>

      <div className="domain-add-form">
        <input
          className={`input${error ? ' error' : ''}`}
          type="text"
          placeholder="example.com"
          value={input}
          id={`domain-input-${policyKey}`}
          onChange={e => { setInput(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && add()}
          aria-label={`Add ${title.toLowerCase()} domain`}
          aria-describedby={error ? `domain-err-${policyKey}` : undefined}
        />
        <button className="btn btn-primary btn-sm" onClick={add} id={`add-domain-${policyKey}`}>Add</button>
      </div>
      {error && <div id={`domain-err-${policyKey}`} className="field-error">{error}</div>}

      {domains.length === 0 ? (
        <div className="empty-state" style={{ padding: '16px 0' }}>
          <p>No {title.toLowerCase()} domains configured</p>
        </div>
      ) : (
        <ul className="domain-list" role="list">
          {[...domains].sort().map(d => (
            <li key={d} className="domain-item">
              <span className="domain-item-name">{d}</span>
              <button
                className="domain-item-remove"
                onClick={() => remove(d)}
                aria-label={`Remove ${d}`}
                id={`remove-domain-${policyKey}-${d}`}
              >✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Custom rule form
const EMPTY_RULE: Omit<CustomDetectorRule, 'id'> = {
  name: '', category: 'CUSTOM', region: 'GLOBAL', severity: 'medium',
  pattern: '', flags: '', requireContext: [], luhnValidate: false, enabled: true,
};

function CustomRuleForm({ onSave, onCancel, initial }: {
  onSave: (rule: Omit<CustomDetectorRule, 'id'>) => void;
  onCancel: () => void;
  initial?: Omit<CustomDetectorRule, 'id'> | null | undefined;
}) {
  const [form, setForm] = useState<Omit<CustomDetectorRule, 'id'>>(initial ?? EMPTY_RULE);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [regexValid, setRegexValid] = useState(true);

  const set = <K extends keyof typeof form>(key: K, val: typeof form[K]) => {
    setForm(f => ({ ...f, [key]: val }));
    if (key === 'pattern') {
      try { new RegExp(val as string); setRegexValid(true); }
      catch { setRegexValid(false); }
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs['name'] = 'Name is required';
    if (!form.pattern.trim()) errs['pattern'] = 'Pattern is required';
    if (!regexValid) errs['pattern'] = 'Invalid regular expression';
    if (form.name.length > 60) errs['name'] = 'Max 60 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const submit = () => { if (validate()) onSave(form); };

  const contextStr = form.requireContext.join(', ');

  return (
    <div className="rule-form" role="form" aria-label="Custom rule form">
      <div className="rule-form-row">
        <div className="field-group">
          <label className="field-label" htmlFor="rule-name">Rule Name</label>
          <input id="rule-name" className={`input${errors['name'] ? ' error' : ''}`}
            value={form.name} onChange={e => set('name', e.target.value)}
            placeholder="e.g. Employee ID" maxLength={60} />
          {errors['name'] && <div className="field-error">{errors['name']}</div>}
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="rule-category">Category</label>
          <select id="rule-category" className="input" value={form.category}
            onChange={e => set('category', e.target.value as DataCategory)}>
            <option value="CUSTOM">Custom</option>
            <option value="IDENTITY_GOV_IN">Government ID</option>
            <option value="PAYMENT_CARD">Payment Card</option>
            <option value="AUTH_SECRET">Secret / Credential</option>
            <option value="PERSONAL_CONTACT">Personal Contact</option>
          </select>
        </div>
      </div>

      <div className="field-group">
        <label className="field-label" htmlFor="rule-pattern">Regex Pattern</label>
        <input id="rule-pattern"
          className={`input${errors['pattern'] ? ' error' : ''}`}
          style={{ fontFamily: 'monospace', fontSize: '12px' }}
          value={form.pattern} onChange={e => set('pattern', e.target.value)}
          placeholder="\b[A-Z]{2}\d{6}\b" />
        {errors['pattern']
          ? <div className="field-error">{errors['pattern']}</div>
          : <div className="field-hint">JavaScript-compatible regex. Do not include leading/trailing slashes.</div>
        }
      </div>

      <div className="rule-form-row">
        <div className="field-group">
          <label className="field-label" htmlFor="rule-flags">Regex Flags</label>
          <select id="rule-flags" className="input" value={form.flags}
            onChange={e => set('flags', e.target.value as CustomDetectorRule['flags'])}>
            <option value="">None</option>
            <option value="i">Case insensitive (i)</option>
            <option value="m">Multiline (m)</option>
            <option value="im">Case insensitive + Multiline (im)</option>
          </select>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="rule-severity">Severity</label>
          <select id="rule-severity" className="input" value={form.severity}
            onChange={e => set('severity', e.target.value as SeverityHint)}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div className="rule-form-row">
        <div className="field-group">
          <label className="field-label" htmlFor="rule-region">Region</label>
          <select id="rule-region" className="input" value={form.region}
            onChange={e => set('region', e.target.value as Region)}>
            <option value="GLOBAL">Global</option>
            <option value="IN">India</option>
            <option value="US">United States</option>
            <option value="UK">United Kingdom</option>
            <option value="EU">European Union</option>
          </select>
        </div>
        <div className="field-group">
          <label className="field-label" htmlFor="rule-context">Context Keywords</label>
          <input id="rule-context" className="input"
            value={contextStr}
            onChange={e => set('requireContext', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="employee, staff id, emp id" />
          <div className="field-hint">Comma-separated label/placeholder keywords for HIGH confidence.</div>
        </div>
      </div>

      <div className="setting-row" style={{ padding: '10px 12px' }}>
        <div className="setting-row-info">
          <div className="setting-row-label">Luhn checksum validation</div>
          <div className="setting-row-desc">Enable for numeric identifiers that use Luhn (e.g. card-like numbers).</div>
        </div>
        <label className="toggle">
          <input id="rule-luhn" type="checkbox" checked={form.luhnValidate}
            onChange={e => set('luhnValidate', e.target.checked)} />
          <span className="toggle-track" />
        </label>
      </div>

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" id="rule-cancel-btn" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" id="rule-save-btn" onClick={submit}>Save Rule</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main Options component
// ─────────────────────────────────────────────────────────

export default function OptionsApp() {
  const [tab, setTab]                   = useState<TabId>('general');
  const [settings, setSettings]         = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [policies, setPolicies]         = useState<DomainPoliciesConfig>(DEFAULT_POLICIES);
  const [rules, setRules]               = useState<CustomDetectorRule[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule]   = useState<CustomDetectorRule | null>(null);
  const { visible: saved, flash }       = useSaveIndicator();

  useEffect(() => { void load(); }, []);

  const load = async () => {
    setLoading(true);
    const data = await loadAll();
    setSettings(data.settings);
    setPolicies(data.domainPolicies);
    setRules(data.customDetectors);
    setLoading(false);
  };

  // ── Settings save helpers ──

  const updateSettings = useCallback(async (patch: Partial<ExtensionSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await savePartial('settings', next);
    flash();
  }, [settings, flash]);

  const updateDetectorEnabled = useCallback(async (category: DataCategory, enabled: boolean) => {
    const next: ExtensionSettings = {
      ...settings,
      detectorsEnabled: { ...settings.detectorsEnabled, [category]: enabled },
    };
    setSettings(next);
    await savePartial('settings', next);
    flash();
  }, [settings, flash]);

  const updatePolicies = useCallback(async (patch: Partial<DomainPoliciesConfig>) => {
    const next = { ...policies, ...patch };
    setPolicies(next);
    await savePartial('domainPolicies', next);
    flash();
  }, [policies, flash]);

  // ── Custom rules ──

  const saveRule = useCallback(async (ruleData: Omit<CustomDetectorRule, 'id'>) => {
    let next: CustomDetectorRule[];
    if (editingRule) {
      next = rules.map(r => r.id === editingRule.id ? { ...ruleData, id: editingRule.id } : r);
    } else {
      const newRule: CustomDetectorRule = { ...ruleData, id: `custom-${Date.now()}` };
      next = [...rules, newRule];
    }
    setRules(next);
    await savePartial('customDetectors', next);
    setShowRuleForm(false);
    setEditingRule(null);
    flash();
  }, [rules, editingRule, flash]);

  const deleteRule = useCallback(async (id: string) => {
    const next = rules.filter(r => r.id !== id);
    setRules(next);
    await savePartial('customDetectors', next);
    flash();
  }, [rules, flash]);

  const toggleRule = useCallback(async (id: string) => {
    const next = rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r);
    setRules(next);
    await savePartial('customDetectors', next);
    flash();
  }, [rules, flash]);

  if (loading) {
    return (
      <div className="options-root" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-dim)', fontSize: '14px' }}>Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="options-root">
      {/* Top bar */}
      <div className="options-topbar">
        <div className="options-logo">
          <img src={browser.runtime.getURL('/icons/icon-48.png')} alt="LeakLens" />
        </div>
        <div>
          <div className="options-title">LeakLens Settings</div>
          <div className="options-subtitle">Privacy-first sensitive data protection</div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <div className={`save-indicator ${saved ? 'visible' : ''}`} aria-live="polite">
            ✓ Saved
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tab-bar" role="tablist" aria-label="Settings tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            className={`tab-btn ${tab === t.id ? 'active' : ''}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Content panels */}
      <main className="options-content" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>

        {/* ── General tab ── */}
        {tab === 'general' && (
          <div className="settings-group">
            <div>
              <div className="settings-group-title">General</div>
              <div className="settings-group-desc">Core protection settings</div>
            </div>
            <SettingRow id="setting-enabled" label="Enable LeakLens"
              desc="Activates detection on all non-excluded pages. Changes take effect immediately."
              checked={settings.enabled}
              onChange={v => void updateSettings({ enabled: v })} />
            <SettingRow id="setting-badge" label="Inline field badge"
              desc="Show a subtle indicator next to fields containing detected sensitive data."
              checked={settings.badgeEnabled}
              onChange={v => void updateSettings({ badgeEnabled: v })} />

            <div className="divider" />

            <div>
              <div className="settings-group-title">Privacy</div>
              <div className="settings-group-desc">LeakLens is built with a privacy-first architecture.</div>
            </div>
            {[
              ['All detection runs locally',        'No field values, keystrokes, or URLs are ever sent to any server.'],
              ['No persistent sensitive data',      'Session warning counts are in-memory only and cleared when the browser closes.'],
              ['Masked previews only',              'The warning dialog shows at most 8 real characters per detected value.'],
              ['No analytics or telemetry',         'The extension contains no tracking, analytics, or crash reporting.'],
            ].map(([label, desc]) => (
              <div key={label} className="setting-row" style={{ cursor: 'default' }}>
                <div className="setting-row-info">
                  <div className="setting-row-label">✓ {label}</div>
                  <div className="setting-row-desc">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Detectors tab ── */}
        {tab === 'detectors' && (
          <div className="settings-group">
            <div>
              <div className="settings-group-title">Detection Rules</div>
              <div className="settings-group-desc">
                Enable or disable individual detectors. Disabled detectors are skipped entirely — they do not affect performance.
              </div>
            </div>
            <div className="detector-grid">
              {DETECTOR_META.map(d => {
                const enabled = settings.detectorsEnabled?.[d.category] !== false;
                return (
                  <div key={d.id} className="setting-row">
                    <div className="setting-row-info" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        style={{
                          width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                          background: CATEGORY_COLORS[d.category],
                          boxShadow: `0 0 6px ${CATEGORY_COLORS[d.category]}60`,
                        }}
                        aria-hidden="true"
                      />
                      <div>
                        <div className="setting-row-label">{d.name}</div>
                        <div className="setting-row-desc">{d.desc}</div>
                        <div style={{ marginTop: '3px' }}>
                          <span className="badge badge-dim" style={{ fontSize: '10px' }}>{d.regions}</span>
                        </div>
                      </div>
                    </div>
                    <label className="toggle" aria-label={`Toggle ${d.name}`}>
                      <input
                        id={`detector-toggle-${d.id}`}
                        type="checkbox"
                        checked={enabled}
                        onChange={e => void updateDetectorEnabled(d.category, e.target.checked)}
                      />
                      <span className="toggle-track" />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Domains tab ── */}
        {tab === 'domains' && (
          <div>
            <div className="settings-group" style={{ marginBottom: '24px' }}>
              <div>
                <div className="settings-group-title">Domain Policies</div>
                <div className="settings-group-desc">
                  Configure per-domain behaviour. Exact hostname matching (no wildcards). The most specific rule wins.
                </div>
              </div>
            </div>
            <div className="policy-tab-grid">
              {(Object.keys(POLICY_DESCRIPTIONS) as Exclude<DomainPolicyType, 'default'>[]).map(key => {
                const meta = POLICY_DESCRIPTIONS[key];
                return (
                  <DomainColumn
                    key={key}
                    policyKey={key}
                    title={meta.title}
                    desc={meta.desc}
                    badge={meta.badge}
                    domains={policies[key]}
                    onChange={updated => void updatePolicies({ [key]: updated })}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* ── Custom Rules tab ── */}
        {tab === 'rules' && (
          <div className="settings-group">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div className="settings-group-title">Custom Detection Rules</div>
                <div className="settings-group-desc">
                  Add your own regex-based detectors. Rules are declarative JSON — no code execution.
                </div>
              </div>
              {!showRuleForm && (
                <button
                  className="btn btn-primary btn-sm"
                  id="add-rule-btn"
                  onClick={() => { setEditingRule(null); setShowRuleForm(true); }}
                  style={{ flexShrink: 0 }}
                >
                  + Add Rule
                </button>
              )}
            </div>

            {showRuleForm && (
              <CustomRuleForm
                initial={editingRule ? { ...editingRule } : undefined}
                onSave={d => void saveRule(d)}
                onCancel={() => { setShowRuleForm(false); setEditingRule(null); }}
              />
            )}

            {rules.length === 0 && !showRuleForm ? (
              <div className="empty-state">
                <span className="empty-icon">📝</span>
                <p>No custom rules yet</p>
                <p style={{ marginTop: '4px', fontSize: '11px' }}>Add a rule to detect organisation-specific identifiers.</p>
              </div>
            ) : (
              <ul className="rule-list" role="list">
                {rules.map(rule => (
                  <li key={rule.id} className="rule-item">
                    <span
                      style={{
                        width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                        background: CATEGORY_COLORS[rule.category] ?? '#9494b8',
                        opacity: rule.enabled ? 1 : 0.3,
                      }}
                      aria-hidden="true"
                    />
                    <div className="rule-item-info">
                      <div className="rule-item-name" style={{ opacity: rule.enabled ? 1 : 0.5 }}>{rule.name}</div>
                      <div className="rule-item-pattern">/{rule.pattern}/{rule.flags}</div>
                    </div>
                    <div className="rule-item-actions">
                      <label className="toggle" aria-label={`Toggle rule ${rule.name}`}>
                        <input
                          id={`rule-toggle-${rule.id}`}
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={() => void toggleRule(rule.id)}
                        />
                        <span className="toggle-track" />
                      </label>
                      <button
                        className="btn btn-secondary btn-xs"
                        id={`edit-rule-${rule.id}`}
                        onClick={() => { setEditingRule(rule); setShowRuleForm(true); setTab('rules'); }}
                      >Edit</button>
                      <button
                        className="btn btn-danger btn-xs"
                        id={`delete-rule-${rule.id}`}
                        onClick={() => void deleteRule(rule.id)}
                      >✕</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="options-footer">
        <span>LeakLens v0.1.0 — MIT License</span>
        <span>All processing is local. Nothing leaves your browser.</span>
        <a href="https://github.com/leaklens/leaklens" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-light)' }}>GitHub ↗</a>
      </footer>
    </div>
  );
}
