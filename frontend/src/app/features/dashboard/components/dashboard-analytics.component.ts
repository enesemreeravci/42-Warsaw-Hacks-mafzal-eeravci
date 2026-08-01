import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { CoalitionStanding, DashboardSummary } from '../../../core/models/api.models';
import { CommunityLevelCardComponent } from './community-level-card.component';
import { NarratorTargetDirective } from '../narrator-target.directive';
import { ProjectActivityCardComponent } from './project-activity-card.component';
import { RecentCoalitionActivityComponent } from './recent-coalition-activity.component';
import { StudentOverviewCardComponent } from './student-overview-card.component';

/**
 * Dedicated analytics/stats section for the main dashboard: three cards side by side (student
 * overview, project activity, community & level) followed by a full-width recent coalition
 * activity feed underneath. Purely a layout + narrator-wiring shell - each card is a standalone,
 * independently reusable component that takes its own primitive inputs (no shared state, no
 * dashboard-store dependency), so this section could be dropped into another page unchanged.
 */
@Component({
  selector: 'app-dashboard-analytics',
  standalone: true,
  imports: [
    StudentOverviewCardComponent,
    ProjectActivityCardComponent,
    CommunityLevelCardComponent,
    RecentCoalitionActivityComponent,
    NarratorTargetDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="dashboard-analytics">
      <div class="dashboard-analytics__grid">
        <div
          class="dashboard-analytics__cell"
          [appNarratorTarget]="'analytics-students'"
          [class.narrator-highlight]="activeCueId() === 'analytics-students'"
          [style.--highlight-color]="activeCueColor()"
        >
          <app-student-overview-card [totalStudents]="summary()?.totalStudents ?? 0" [activeStudents]="summary()?.activeStudents ?? 0" />
        </div>

        <div
          class="dashboard-analytics__cell"
          [appNarratorTarget]="'analytics-projects'"
          [class.narrator-highlight]="activeCueId() === 'analytics-projects'"
          [style.--highlight-color]="activeCueColor()"
        >
          <app-project-activity-card
            [totalEnrolledProjects]="summary()?.totalEnrolledProjects ?? 0"
            [completionsLast7Days]="summary()?.completionsLast7Days ?? 0"
            [completionsLast30Days]="summary()?.completionsLast30Days ?? 0"
            [averageCompletionRate]="summary()?.averageCompletionRate ?? 0"
          />
        </div>

        <div
          class="dashboard-analytics__cell"
          [appNarratorTarget]="'analytics-community'"
          [class.narrator-highlight]="activeCueId() === 'analytics-community'"
          [style.--highlight-color]="activeCueColor()"
        >
          <app-community-level-card
            [totalStudents]="summary()?.totalStudents ?? 0"
            [activeStudents]="summary()?.activeStudents ?? 0"
            [averageLevel]="summary()?.averageLevel ?? 0"
          />
        </div>
      </div>

      <div
        class="dashboard-analytics__cell"
        [appNarratorTarget]="'analytics-coalition'"
        [class.narrator-highlight]="activeCueId() === 'analytics-coalition'"
        [style.--highlight-color]="activeCueColor()"
      >
        <app-recent-coalition-activity [coalitions]="coalitions()" />
      </div>
    </section>
  `,
  styles: `
    .dashboard-analytics {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .dashboard-analytics__grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-4);
      align-items: stretch;
    }

    .dashboard-analytics__cell {
      border-radius: var(--radius-lg);
      transition: box-shadow 500ms ease;
    }

    /* Mirrors .narrator-highlight in dashboard.page.scss - that rule is scoped to dashboard.page.html
       by Angular's view encapsulation and never reaches these cells since they live in this
       component's own template, so the narrator's spotlight ring needs its own copy here too. */
    .dashboard-analytics__cell.narrator-highlight {
      box-shadow: 0 0 0 2px var(--highlight-color, var(--color-accent)), 0 0 32px -6px var(--highlight-color, var(--color-accent));
    }

    @media (max-width: 1100px) {
      .dashboard-analytics__grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class DashboardAnalyticsComponent {
  readonly summary = input<DashboardSummary | null>(null);
  readonly coalitions = input.required<CoalitionStanding[]>();

  /** The narrator's current cue id/color, so whichever of the four cells it's pointing at can
   * light up in step with it - see dashboard.page.ts activeNarratorCue(). */
  readonly activeCueId = input<string | null>(null);
  readonly activeCueColor = input<string | null>(null);
}
