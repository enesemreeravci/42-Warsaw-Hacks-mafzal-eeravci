import { Injectable, computed, signal } from '@angular/core';

const DEFAULT_ROTATION_SECONDS = 15;
/** The Hive, the Level-Up Spotlight, Weekly XP Insights, the Coalition Leaderboard, Live
 * Evaluations, the two Weekly Campus Activity rankings (Most Campus Time, Most Recent Session
 * Started), Night Owls, Early Birds, the Cluster Occupancy Map, the Evaluation Activity Heatmap,
 * Returning Students, the Transcendence Completed showcase, and - last, closing out every loop -
 * the Robot Achievement Showcase. Index-matched to SECTION_TITLES below. (The standalone "Weekly
 * Top Coalitions" progress-ring section was removed earlier - it duplicated the coalition
 * standings already shown in the Coalition Leaderboard. The "Weekly Top Coalition Contributors"
 * leaderboard was removed too - it never resolved past its loading state.) */
const DASHBOARD_SECTION_COUNT = 14;

/** Short section names, index-matched to `activeSection`, shown in the unified TV header bar
 * (see app.html) instead of each section rendering its own in-card title. */
const SECTION_TITLES: readonly string[] = [
  // "The Hive" section: cadet avatars drift freely across the whole screen, so it reads in the
  // unified header as "Active Students on Campus" rather than its internal component name.
  'Active Students on Campus',
  'Recently Completed',
  'Weekly XP Insights',
  'Coalition Leaderboard',
  'Live Evaluations',
  'Most Campus Time',
  'Most Recent Session Started',
  'Night Owls',
  'Early Birds',
  'Cluster Occupancy',
  'Evaluation Activity Heatmap',
  'Welcome Back',
  'Transcendence Completed',
  'Achievement Unlock',
];

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

  /** The name of whichever section is currently on screen, for the unified TV header bar.
   * "Welcome" while the robot's intro is still playing, since no rotation section is active yet. */
  readonly currentSectionTitle = computed(() =>
    this.introCompleteSignal() ? (SECTION_TITLES[this.activeSectionSignal()] ?? '') : 'Welcome',
  );

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
