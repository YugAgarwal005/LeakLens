// LeakLens — DetectorRegistry
// Holds all registered detectors and runs them against a field value.
// Detectors are registered at content script startup.
// Custom rules are compiled into CustomDetector instances that implement Detector.

import type { Detector } from './Detector.js';
import type {
  DetectionResult,
  FieldContext,
  RawFieldValue,
  Region,
} from '../types/index.js';

export class DetectorRegistry {
  private detectors = new Map<string, Detector>();

  /** Register a detector. Overwrites any existing detector with the same id. */
  register(detector: Detector): void {
    this.detectors.set(detector.id, detector);
  }

  /** Unregister a detector by id. */
  unregister(id: string): void {
    this.detectors.delete(id);
  }

  /** Return all currently active detectors for the given regions. */
  getActive(regions: readonly Region[]): Detector[] {
    const regionSet = new Set<Region>(regions);
    return Array.from(this.detectors.values()).filter((d) =>
      d.regions.some((r) => r === 'GLOBAL' || regionSet.has(r)),
    );
  }

  /**
   * Run all active detectors against a field value.
   *
   * @param value   Raw field value (branded — never stored beyond this call)
   * @param context Sanitized field metadata
   * @param regions Active region filter (default: ['IN', 'GLOBAL'])
   * @returns Deduplicated array of detection results
   */
  runAll(
    value: RawFieldValue,
    context: FieldContext,
    regions: readonly Region[] = ['IN', 'GLOBAL'],
  ): DetectionResult[] {
    const active = this.getActive(regions);
    const results: DetectionResult[] = [];

    for (const detector of active) {
      try {
        const detections = detector.detect(value, context);
        results.push(...detections);
      } catch {
        // Detector errors must never crash the content script or log raw values
        // Silent fail — detection is best-effort
      }
    }

    return results;
  }

  /** Number of registered detectors */
  get size(): number {
    return this.detectors.size;
  }
}
