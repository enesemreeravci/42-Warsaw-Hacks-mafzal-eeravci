import { Injectable, computed, signal } from '@angular/core';

const DEFAULT_ROTATION_SECONDS = 15;
/** The Hive, the Level-Up Spotlight, the XP Race / Black Hole tracker, the Coalition
 * Leaderboard, Live Evaluations, the Robot Achievement Showcase, and the two Weekly Campus
 * Activity rankings (Most Campus Time, Most Sessions Started). */
const DASHBOARD_SECTION_COUNT = 8;

/** Holds TV-mode UI state: on/off, section rotation index, and rotation interval. */
@Injectable({ providedIn: 'root' })
export class TvModeService {
  private readonly enabledSignal = signal(false);
  private readonly rotationSecondsSignal = signal(DEFAULT_ROTATION_SECONDS);
  private readonly activeSectionSignal = signal(0);

  readonly enabled = this.enabledSignal.asReadonly();
  readonly rotationSeconds = this.rotationSecondsSignal.asReadonly();
  readonly activeSection = this.activeSectionSignal.asReadonly();
  readonly sectionCount = DASHBOARD_SECTION_COUNT;

  readonly rotationProgressLabel = computed(() => `Section ${this.activeSectionSignal() + 1} of ${DASHBOARD_SECTION_COUNT}`);

  toggle(): void {
    this.enabledSignal.update((v) => !v);
  }

  enable(): void {
    this.enabledSignal.set(true);
  }

  disable(): void {
    this.enabledSignal.set(false);
  }

  setRotationSeconds(seconds: number): void {
    this.rotationSecondsSignal.set(Math.max(5, seconds));
  }

  advanceSection(): void {
    this.activeSectionSignal.update((i) => (i + 1) % DASHBOARD_SECTION_COUNT);
  }

  resetSection(): void {
    this.activeSectionSignal.set(0);
  }
}
