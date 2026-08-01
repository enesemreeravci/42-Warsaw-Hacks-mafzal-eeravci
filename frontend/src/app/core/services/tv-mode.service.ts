import { Injectable, computed, signal } from '@angular/core';

const DEFAULT_ROTATION_SECONDS = 15;
/** The Hive, the Level-Up Spotlight, the XP Race / Black Hole tracker, the Coalition
 * Leaderboard, Live Evaluations, the two Weekly Campus Activity rankings (Most Campus Time,
 * Most Sessions Started), the Transcendence Completed showcase, and - last, closing out every
 * loop - the Robot Achievement Showcase. */
const DASHBOARD_SECTION_COUNT = 9;

/** Holds TV-mode UI state: on/off, section rotation index, rotation interval, and whether the
 * one-time robot welcome intro (typewriter greeting) has finished. */
@Injectable({ providedIn: 'root' })
export class TvModeService {
  private readonly enabledSignal = signal(false);
  private readonly rotationSecondsSignal = signal(DEFAULT_ROTATION_SECONDS);
  private readonly activeSectionSignal = signal(0);
  private readonly introCompleteSignal = signal(false);

  readonly enabled = this.enabledSignal.asReadonly();
  readonly rotationSeconds = this.rotationSecondsSignal.asReadonly();
  readonly activeSection = this.activeSectionSignal.asReadonly();
  readonly sectionCount = DASHBOARD_SECTION_COUNT;
  /** True once the robot's welcome typewriter intro has finished playing for this TV-mode
   * session. False whenever TV mode is (re-)turned on, so the intro replays every time it
   * starts - the rest of the rotation (including the Achievement Unlock finale) stays hidden
   * until this flips true. */
  readonly introComplete = this.introCompleteSignal.asReadonly();

  readonly rotationProgressLabel = computed(() => `Section ${this.activeSectionSignal() + 1} of ${DASHBOARD_SECTION_COUNT}`);

  toggle(): void {
    const next = !this.enabledSignal();
    this.enabledSignal.set(next);
    if (next) this.startIntroSequence();
  }

  enable(): void {
    this.enabledSignal.set(true);
    this.startIntroSequence();
  }

  disable(): void {
    this.enabledSignal.set(false);
  }

  /** Marks the robot's welcome intro as finished, revealing the rest of the TV rotation. */
  completeIntro(): void {
    this.introCompleteSignal.set(true);
  }

  private startIntroSequence(): void {
    this.introCompleteSignal.set(false);
    this.activeSectionSignal.set(0);
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
