// LeakLens — FieldObserver
// Attaches event listeners to editable fields and drives the detection pipeline.
//
// Responsibilities:
// - Observe existing and dynamically injected editable fields (MutationObserver)
// - Fire on input, paste, and submit events
// - Extract field context (never raw values beyond the detect() call)
// - Coordinate with BadgeManager (live feedback) and ModalController (submit warning)
//
// Security rules:
// - Raw field values are cast to RawFieldValue only here, and passed directly
//   to DetectionEngine.analyze(). They are NOT stored in this class.
// - All event handlers are capture-phase to beat page-level handlers.
// - submit is preventDefault()-ed immediately and reinstated only if the
//   user approves or the score is below the modal threshold.

import type { FieldContext, RawFieldValue, DomainPolicyType } from '../core/types/index.js';
import { asRawFieldValue } from '../core/types/index.js';
import type { DetectionEngine } from '../core/detection/DetectionEngine.js';
import type { BadgeManager } from './BadgeManager.js';
import type { ModalController } from './ModalController.js';

type EditableElement = HTMLInputElement | HTMLTextAreaElement | HTMLElement;

const INPUT_SELECTOR =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), textarea, [contenteditable="true"], [contenteditable=""]';

export class FieldObserver {
  private domainPolicy: DomainPolicyType;
  private detectionEngine: DetectionEngine;
  private badgeManager: BadgeManager;
  private modalController: ModalController;
  private observer: MutationObserver | null = null;
  private observedFields = new WeakSet<Element>();
  private _running = false;

  /** Whether the observer is currently active. */
  get isRunning(): boolean { return this._running; }

  constructor(
    domainPolicy: DomainPolicyType,
    detectionEngine: DetectionEngine,
    badgeManager: BadgeManager,
    modalController: ModalController,
  ) {
    this.domainPolicy = domainPolicy;
    this.detectionEngine = detectionEngine;
    this.badgeManager = badgeManager;
    this.modalController = modalController;
  }

  /** Start observing the page. Call once after DOM is ready. */
  start(): void {
    // Attach to all currently present fields
    document.querySelectorAll<Element>(INPUT_SELECTOR).forEach((el) => {
      this.attachFieldListeners(el as EditableElement);
    });

    // Observe dynamically added fields (SPA route changes, injected forms)
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const el = node as Element;
          if (el.matches(INPUT_SELECTOR)) {
            this.attachFieldListeners(el as EditableElement);
          }
          // Also check descendants
          el.querySelectorAll<Element>(INPUT_SELECTOR).forEach((child) => {
            this.attachFieldListeners(child as EditableElement);
          });
        }
      }
    });

    this.observer.observe(document.body, { childList: true, subtree: true });

    // Capture all form submit events — preventDefault immediately, then assess
    document.addEventListener('submit', this.handleSubmit, { capture: true });
    this._running = true;
  }

  /** Stop observing (called on extension disable or excluded domain). */
  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    document.removeEventListener('submit', this.handleSubmit, { capture: true });
    this._running = false;
  }

  // ---------------------------------------------------------------------------
  // Private — field-level listeners
  // ---------------------------------------------------------------------------

  private attachFieldListeners(el: EditableElement): void {
    if (this.observedFields.has(el)) return;
    this.observedFields.add(el);

    el.addEventListener('input', (e) => this.handleInput(e, el), { passive: true });
    el.addEventListener('paste', (e) => void this.handlePaste(e, el), { passive: true });
    el.addEventListener('keydown', (e) => this.handleKeyDown(e as KeyboardEvent, el), { capture: true });
  }

  private handleKeyDown(e: KeyboardEvent, el: EditableElement): void {
    // Intercept Enter key submissions (Google search, ChatGPT, SPAs, etc.)
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;

    const value = this.readValue(el);
    if (!value.trim()) return;

    const context = this.buildContext(el);
    const assessment = this.detectionEngine.analyze(
      asRawFieldValue(value),
      context,
      this.domainPolicy,
      true, // Treat Enter key as submit action
    );

    if (!assessment.shouldShowModal) return;

    // High/medium risk detected: intercept Enter immediately
    e.preventDefault();
    e.stopImmediatePropagation();

    void this.modalController.show(assessment).then((decision) => {
      if (decision === 'proceed') {
        const form = (el as HTMLElement).closest?.('form');
        if (form) {
          HTMLFormElement.prototype.submit.call(form);
        }
      }
    });
  }

  private handleInput(_e: Event, el: EditableElement): void {
    const value = this.readValue(el);
    const context = this.buildContext(el);
    // Pass raw value directly to engine — not stored here
    const assessment = this.detectionEngine.analyze(
      asRawFieldValue(value),
      context,
      this.domainPolicy,
      false, // isSubmitAction
    );
    this.badgeManager.update(el, assessment);
  }

  private async handlePaste(_e: Event, el: EditableElement): Promise<void> {
    // Wait one microtask so the pasted content is in the DOM
    await Promise.resolve();
    const value = this.readValue(el);
    const context = this.buildContext(el);
    const assessment = this.detectionEngine.analyze(
      asRawFieldValue(value),
      context,
      this.domainPolicy,
      false,
    );
    this.badgeManager.update(el, assessment);
  }

  // Defined as arrow function to preserve `this` when used as event listener
  private handleSubmit = (e: SubmitEvent): void => {
    // ALWAYS prevent default immediately — we decide whether to re-submit
    e.preventDefault();
    e.stopImmediatePropagation();

    const form = e.target as HTMLFormElement | null;
    if (!form) {
      // No form — release (shouldn't happen)
      this.releaseSubmit(form, e);
      return;
    }

    // Collect all form field values and contexts
    const { maxScore, detections, context } = this.analyzeForm(form);

    if (maxScore === null || maxScore.score < 31) {
      // Score below modal threshold — allow submission
      this.releaseSubmit(form, e);
      return;
    }

    // Show modal — async; submission is held pending user decision
    void this.modalController.show(maxScore).then((decision) => {
      if (decision === 'proceed') {
        // User accepted — submit the form natively
        // Use the native HTMLFormElement.submit to bypass our event listener
        HTMLFormElement.prototype.submit.call(form);

        // Notify background (category only — no raw values)
        if (detections.length > 0 && detections[0]) {
          void browser.runtime.sendMessage({
            type: 'LEAKLENS_WARNING_DETECTED',
            tabId: -1, // Will be resolved by background from sender
            category: detections[0].category,
            riskLevel: maxScore.riskLevel,
          });
        }
      }
      // If 'cancel' — form stays prevented, user reviews the field
    });
  };

  // ---------------------------------------------------------------------------
  // Private — form analysis
  // ---------------------------------------------------------------------------

  private analyzeForm(form: HTMLFormElement): {
    maxScore: ReturnType<DetectionEngine['analyze']> | null;
    detections: ReturnType<DetectionEngine['analyze']>['detections'];
    context: FieldContext | null;
  } {
    const fields = form.querySelectorAll<Element>(INPUT_SELECTOR);
    let maxScore: ReturnType<DetectionEngine['analyze']> | null = null;
    let topContext: FieldContext | null = null;

    for (const el of Array.from(fields)) {
      const value = this.readValue(el as EditableElement);
      if (!value.trim()) continue;
      const context = this.buildContext(el as EditableElement);
      const assessment = this.detectionEngine.analyze(
        asRawFieldValue(value),
        context,
        this.domainPolicy,
        true, // isSubmitAction
      );
      if (!maxScore || assessment.score > maxScore.score) {
        maxScore = assessment;
        topContext = context;
      }
    }

    return {
      maxScore,
      detections: maxScore ? maxScore.detections : [],
      context: topContext,
    };
  }

  private releaseSubmit(form: HTMLFormElement | null, _e: SubmitEvent): void {
    if (form) {
      HTMLFormElement.prototype.submit.call(form);
    }
  }

  // ---------------------------------------------------------------------------
  // Private — value and context extraction
  // ---------------------------------------------------------------------------

  private readValue(el: EditableElement): string {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      return el.value;
    }
    // contenteditable
    return el.textContent ?? '';
  }

  private buildContext(el: EditableElement): FieldContext {
    const tagName = el.tagName.toLowerCase();
    const input = el instanceof HTMLInputElement ? el : null;

    // Find associated <label>
    let labelText = '';
    if (input?.id) {
      const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(input.id)}"]`);
      labelText = label?.textContent?.trim() ?? '';
    }
    if (!labelText) {
      // Check aria-label
      labelText = el.getAttribute('aria-label') ?? '';
    }
    if (!labelText) {
      // Check wrapping label
      const wrapping = el.closest('label');
      if (wrapping) {
        labelText = wrapping.textContent?.replace(this.readValue(el), '').trim() ?? '';
      }
    }

    // Sanitize: strip any long text that might contain sensitive content
    const sanitize = (s: string): string => s.slice(0, 200).toLowerCase();

    const formAction = el.closest('form')?.action ?? '';
    let formActionOrigin = '';
    try {
      formActionOrigin = new URL(formAction, window.location.href).origin;
    } catch {
      formActionOrigin = window.location.origin;
    }

    return {
      fieldType: input?.type ?? tagName,
      fieldName: sanitize(input?.name ?? el.id ?? el.getAttribute('name') ?? ''),
      labelText: sanitize(labelText),
      formActionOrigin,
      placeholder: sanitize(input?.placeholder ?? el.getAttribute('placeholder') ?? ''),
      autocomplete: sanitize(input?.autocomplete ?? el.getAttribute('autocomplete') ?? ''),
      isPasswordField: input?.type === 'password',
      isInsideFrame: window !== window.top,
    };
  }
}
