import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonToggleModule, MatButtonToggleChange } from '@angular/material/button-toggle';
import { filter, timer } from 'rxjs';
import { DashboardStore } from '../../core/services/dashboard-store.service';
import { TvModeService } from '../../core/services/tv-mode.service';
import { VisibilityService } from '../../core/services/visibility.service';
import { ErrorStateComponent } from '../../shared/components/error-state/error-state.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { AchievementSpotlightComponent } from './components/achievement-spotlight.component';
import { CelebrationCarouselComponent } from './components/celebration-carousel.component';
import { CoalitionLeaderboardComponent } from './components/coalition-leaderboard.component';
import { CompletionTrendChartComponent } from './components/completion-trend-chart.component';
import { DashboardAnalyticsComponent } from './components/dashboard-analytics.component';
import { HiveNodeMapComponent } from './components/hive-node-map.component';
import { LiveEvaluationsComponent } from './components/live-evaluations.component';
import { NarratorRobotComponent, type NarratorCue } from './components/narrator-robot.component';
import { NarratorTargetDirective } from './narrator-target.directive';
import { NarratorTargetRegistry } from './narrator-target-registry.service';
import { RobotAchievementShowcaseComponent } from './components/robot-achievement-showcase.component';
import { RobotIntroComponent } from './components/robot-intro.component';
import { TopProjectsListComponent } from './components/top-projects-list.component';
import { TopStudentsByCompletedComponent } from './components/top-students-by-completed.component';
import { TopStudentsByLevelComponent } from './components/top-students-by-level.component';
import { TranscendenceCompletedShowcaseComponent } from './components/transcendence-completed-showcase.component';
import { UpcomingEventsComponent } from './components/upcoming-events.component';
import { WeeklyCampusActivityBoardComponent } from './components/weekly-campus-activity-board.component';
import { WeeklyTopCoalitionsComponent } from './components/weekly-top-coalitions.component';
import { XpRaceBlackholeComponent } from './components/xp-race-blackhole.component';

const NARRATOR_ROTATION_MS = 6500;

/** Cues for the main (non-TV) dashboard, in the order the narrator cycles through them. Each
 * `id` is matched against an `appNarratorTarget` directive on the corresponding panel in
 * dashboard.page.html - that's how the narrator finds its target's real screen position. */
const DASHBOARD_NARRATOR_CUES: NarratorCue[] = [
  { id: 'analytics-students', color: '#4cc9f0', text: 'Total vs. active Common Core students, at a glance.' },
  { id: 'analytics-projects', color: '#ffb020', text: 'Enrolled projects and completion activity over the last 7 and 30 days.' },
  { id: 'analytics-community', color: '#be2ad1', text: "The community split, and the campus's average level." },
  { id: 'analytics-coalition', color: '#38e19a', text: "Which coalition's pulling ahead this week." },
  { id: 'celebration', color: '#ffb020', text: 'Freshly validated completions show up here first.' },
  { id: 'trend', color: '#16f0a6', text: 'Validation activity over time - switch the range above to zoom.' },
  { id: 'projects', color: '#be2ad1', text: 'The most-completed projects across the whole cursus.' },
  { id: 'level', color: '#52bdff', text: 'Top students ranked by level.' },
  { id: 'completed', color: '#38e19a', text: 'Top students ranked by validated projects.' },
  { id: 'events', color: '#ffb020', text: "What's coming up next on campus." },
];

/** Cue shown while the robot's welcome typewriter intro is still playing, before the rotation
 * below starts. Not index-matched to anything - it's only used while `!tvMode.introComplete()`. */
const TV_INTRO_CUE: NarratorCue = { id: 'intro', color: '#34e2c4', text: 'Getting ready to take you on a tour of campus…' };

/** Cues for TV mode, one per rotating section (index-matched to `TvModeService.activeSection()`).
 * The Robot Achievement Showcase is deliberately last, so it closes out every loop. */
const TV_NARRATOR_CUES: NarratorCue[] = [
  { id: 'hive', color: '#4cc9f0', text: "The Hive - who's on campus right now, live." },
  { id: 'spotlight', color: '#ffb020', text: 'Celebrating a recent stand-out achievement.' },
  { id: 'race', color: '#16f0a6', text: "This week's XP race, and who's closest to a black hole." },
  { id: 'coalitions', color: '#be2ad1', text: "Coalition standings and each team's top contributor." },
  { id: 'evaluations', color: '#4cc9f0', text: 'Freshly filled peer evaluations.' },
  { id: 'weekly-campus-time', color: '#4cc9f0', text: 'These students spent the most time working from campus this week.' },
  { id: 'weekly-sessions', color: '#ffb020', text: 'These students started the most cluster sessions this week.' },
  { id: 'night-owls', color: '#be2ad1', text: 'Who was on campus deepest into the night this week.' },
  { id: 'early-birds', color: '#4cc9f0', text: 'Who showed up earliest on campus this week.' },
  { id: 'weekly-top-coalitions', color: '#38e19a', text: "Which coalition is climbing fastest this week." },
  { id: 'transcendence', color: '#be2ad1', text: 'Celebrating every student who reached Transcendence.' },
  { id: 'showcase', color: '#34e2c4', text: "Saving the best for last - today's top achievements." },
];

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    MatButtonToggleModule,
    ErrorStateComponent,
    LoadingSkeletonComponent,
    CelebrationCarouselComponent,
    CompletionTrendChartComponent,
    DashboardAnalyticsComponent,
    TopProjectsListComponent,
    TopStudentsByLevelComponent,
    TopStudentsByCompletedComponent,
    HiveNodeMapComponent,
    AchievementSpotlightComponent,
    XpRaceBlackholeComponent,
    CoalitionLeaderboardComponent,
    LiveEvaluationsComponent,
    RobotAchievementShowcaseComponent,
    RobotIntroComponent,
    TranscendenceCompletedShowcaseComponent,
    NarratorRobotComponent,
    NarratorTargetDirective,
    WeeklyCampusActivityBoardComponent,
    WeeklyTopCoalitionsComponent,
    UpcomingEventsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  protected readonly store = inject(DashboardStore);
  protected readonly tvMode = inject(TvModeService);
  private readonly visibility = inject(VisibilityService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly targetRegistry = inject(NarratorTargetRegistry);

  protected readonly periodOptions = [7, 14, 30, 60, 90];

  protected readonly partialErrorEntries = computed(() =>
    Object.entries(this.store.partialErrors()).map(([field, message]) => ({ field, message })),
  );

  private readonly narratorIndex = signal(0);
  /** True once the mouse has been still for MOUSE_IDLE_MS. The narrator's auto-rotation only
   * advances while this is true - a user actively moving the mouse around the dashboard is
   * presumably looking at something specific, and having panels highlight themselves out from
   * under their attention every few seconds is disorienting. It resumes on its own once they
   * stop moving the mouse, so a genuinely idle/kiosk screen still cycles through panels. */
  private readonly mouseIdle = signal(true);
  private mouseIdleTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private static readonly MOUSE_IDLE_MS = 1500;

  /** The cue the narrator robot is currently showing. A panel the user is hovering (registered
   * via `appNarratorTarget`, see NarratorTargetRegistry) takes priority over the automatic
   * rotation; otherwise it's synced to the active TV section in TV mode, or auto-rotates on its
   * own timer on the main dashboard. */
  protected readonly activeNarratorCue = computed<NarratorCue | null>(() => {
    if (this.tvMode.enabled() && !this.tvMode.introComplete()) {
      return TV_INTRO_CUE;
    }

    const cues = this.tvMode.enabled() ? TV_NARRATOR_CUES : DASHBOARD_NARRATOR_CUES;

    const focusedId = this.targetRegistry.focusedId();
    if (focusedId) {
      const focused = cues.find((c) => c.id === focusedId);
      if (focused) return focused;
    }

    if (this.tvMode.enabled()) {
      return TV_NARRATOR_CUES[this.tvMode.activeSection()] ?? null;
    }
    return DASHBOARD_NARRATOR_CUES[this.narratorIndex() % DASHBOARD_NARRATOR_CUES.length] ?? null;
  });

  /** TV mode has one full-bleed section active at a time, so its narrator target is always the
   * same wrapper element - only the id it's registered under changes as sections rotate (or, while
   * the welcome intro is still playing, stays pinned to the intro cue's id). */
  protected readonly tvNarratorTargetId = computed(() =>
    !this.tvMode.introComplete() ? TV_INTRO_CUE.id : (TV_NARRATOR_CUES[this.tvMode.activeSection()]?.id ?? ''),
  );

  constructor() {
    timer(0, 1000)
      .pipe(
        filter(() => this.tvMode.enabled() && !this.visibility.hidden()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.tickRotation());

    timer(NARRATOR_ROTATION_MS, NARRATOR_ROTATION_MS)
      .pipe(
        filter(() => !this.tvMode.enabled() && !this.visibility.hidden() && this.mouseIdle()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.narratorIndex.update((i) => i + 1));

    this.watchMouseIdle();
  }

  private watchMouseIdle(): void {
    if (typeof window === 'undefined') return;

    const onActivity = () => {
      this.mouseIdle.set(false);
      if (this.mouseIdleTimeoutId !== null) clearTimeout(this.mouseIdleTimeoutId);
      this.mouseIdleTimeoutId = setTimeout(() => this.mouseIdle.set(true), DashboardPage.MOUSE_IDLE_MS);
    };

    window.addEventListener('mousemove', onActivity, { passive: true });
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('mousemove', onActivity);
      if (this.mouseIdleTimeoutId !== null) clearTimeout(this.mouseIdleTimeoutId);
    });
  }

  private secondsInSection = 0;

  private tickRotation(): void {
    this.secondsInSection += 1;
    if (this.secondsInSection >= this.tvMode.rotationSeconds()) {
      this.secondsInSection = 0;
      this.tvMode.advanceSection();
    }
  }

  protected onPeriodChange(event: MatButtonToggleChange): void {
    this.store.setPeriodDays(Number(event.value));
  }

  protected retry(): void {
    this.store.refreshNow();
  }
}
