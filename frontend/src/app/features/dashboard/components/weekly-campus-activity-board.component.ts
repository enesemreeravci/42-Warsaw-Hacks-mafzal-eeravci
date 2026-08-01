import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { WeeklyActivityStudent, WeeklyCampusActivityResponse } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { formatMinutesAsHoursAndMinutes, formatWarsawDateRange, formatWarsawTime } from '../weekly-campus-activity.utils';

export type WeeklyActivityMetric = 'time' | 'sessions';

interface RankedEntry {
  student: WeeklyActivityStudent;
  rank: number;
  primaryValue: string;
  primaryLabel: string;
  secondaryValue: string;
  secondaryLabel: string;
  averageLabel: string;
}

type BoardState = 'loading' | 'error' | 'empty' | 'ready';

const VISIBLE_COUNT = 5;

/**
 * One TV slide for the "Weekly Campus Activity" feature - either the "Most Campus Time" or
 * "Most Sessions Started" Top-5 ranking, trailing 7 days, Warsaw main-cursus students only.
 * Same component for both (via `metric`) since the layout is identical and only which stat
 * leads differs - keeps the ranking/formatting logic in one place instead of two near-duplicate
 * components. All aggregation already happened on the backend; this only formats for display.
 */
@Component({
  selector: 'app-weekly-campus-activity-board',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="board">
      <header class="board__header">
        <h2 class="board__title">{{ title() }}</h2>
        @if (rangeLabel(); as range) {
          <p class="board__meta">{{ range }} &middot; Last updated {{ lastUpdatedLabel() }}</p>
        }
      </header>

      @if (cacheBanner(); as banner) {
        <p class="board__banner" role="status">{{ banner }}</p>
      }

      @switch (state()) {
        @case ('loading') {
          <app-empty-state title="Calculating this week's campus activity&hellip;" />
        }
        @case ('error') {
          <app-empty-state title="Weekly campus activity is temporarily unavailable." />
        }
        @case ('empty') {
          <app-empty-state title="No valid campus sessions were found for the selected period." />
        }
        @default {
          <ol class="board__list">
            @for (entry of rankedEntries(); track entry.student.userId) {
              <li class="board__row" [class.board__row--leader]="entry.rank === 1">
                <span class="board__rank">{{ entry.rank }}</span>
                <app-avatar [imageUrl]="entry.student.imageUrl" [name]="entry.student.displayName" [size]="64" />
                <div class="board__name">
                  <p class="board__display-name">{{ entry.student.displayName }}</p>
                  <p class="board__login">&#64;{{ entry.student.login }}</p>
                </div>
                <div class="board__stat board__stat--primary">
                  <span class="board__stat-value">{{ entry.primaryValue }}</span>
                  <span class="board__stat-label">{{ entry.primaryLabel }}</span>
                </div>
                <div class="board__stat">
                  <span class="board__stat-value">{{ entry.secondaryValue }}</span>
                  <span class="board__stat-label">{{ entry.secondaryLabel }}</span>
                </div>
                <div class="board__stat">
                  <span class="board__stat-value">{{ entry.averageLabel }}</span>
                  <span class="board__stat-label">Avg session</span>
                </div>
              </li>
            }
          </ol>
        }
      }
    </div>
  `,
  styles: `
    .board {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      height: 100%;
    }

    .board__header {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .board__title {
      margin: 0;
      font-size: 2.2rem;
      font-weight: 800;
    }

    .board__meta {
      margin: 0;
      font-size: 1.1rem;
      color: var(--color-text-muted);
    }

    .board__banner {
      margin: 0;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-warn);
      background: rgba(255, 176, 32, 0.08);
      color: var(--color-warn);
      font-size: 1.05rem;
      font-weight: 700;
    }

    .board__list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      flex: 1;
      justify-content: center;
    }

    .board__row {
      display: grid;
      grid-template-columns: 4rem auto 1fr auto auto auto;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-5);
      border-radius: var(--radius-lg);
      border: 1px solid var(--glass-border);
      background: var(--glass-bg-elevated);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
    }

    .board__row--leader {
      border-color: var(--color-accent);
      box-shadow: 0 0 0 1px var(--color-accent), 0 0 28px -8px var(--color-accent);
    }

    .board__rank {
      font-size: 2.4rem;
      font-weight: 900;
      text-align: center;
      color: var(--color-text-secondary);
    }

    .board__row--leader .board__rank {
      color: var(--color-accent);
    }

    .board__name {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .board__display-name {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .board__login {
      margin: 0;
      font-size: 1rem;
      color: var(--color-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .board__stat {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      min-width: 9rem;
    }

    .board__stat-value {
      font-size: 1.6rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: var(--color-text-primary);
    }

    .board__stat--primary .board__stat-value {
      font-size: 2rem;
      color: var(--color-accent);
    }

    .board__stat-label {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
    }

    @media (max-width: 1400px) {
      .board__row {
        grid-template-columns: 3.5rem auto 1fr auto;
      }

      .board__stat:not(.board__stat--primary) {
        display: none;
      }
    }
  `,
})
export class WeeklyCampusActivityBoardComponent {
  readonly activity = input<WeeklyCampusActivityResponse | null>(null);
  /** Set when this specific field failed to load this cycle (DashboardStore.partialErrors()) -
   * distinct from `activity` being null, which just as often means "still warming up". */
  readonly loadError = input<string | null>(null);
  readonly metric = input.required<WeeklyActivityMetric>();
  readonly title = input.required<string>();

  protected readonly state = computed<BoardState>(() => {
    const activity = this.activity();
    if (!activity) return this.loadError() ? 'error' : 'loading';
    const students = this.metric() === 'time' ? activity.mostCampusTime : activity.mostSessionsStarted;
    return students.length === 0 ? 'empty' : 'ready';
  });

  protected readonly rangeLabel = computed(() => {
    const period = this.activity()?.period;
    return period ? formatWarsawDateRange(period.start, period.end) : null;
  });

  protected readonly lastUpdatedLabel = computed(() => formatWarsawTime(this.activity()?.meta.lastUpdated));

  /** Only shown when the backend explicitly fell back to a stale cached result - a normal,
   * still-fresh cache hit never sets meta.source to 'cache' (see DataService.getWeeklyCampusActivity()). */
  protected readonly cacheBanner = computed(() => {
    const activity = this.activity();
    if (!activity || activity.meta.source !== 'cache') return null;
    return `Showing cached data. Last updated: ${this.lastUpdatedLabel()}`;
  });

  protected readonly rankedEntries = computed<RankedEntry[]>(() => {
    const activity = this.activity();
    if (!activity) return [];

    const students = this.metric() === 'time' ? activity.mostCampusTime : activity.mostSessionsStarted;
    const metric = this.metric();

    return students.slice(0, VISIBLE_COUNT).map((student, index) => ({
      student,
      rank: index + 1,
      primaryValue: metric === 'time' ? formatMinutesAsHoursAndMinutes(student.totalMinutes) : String(student.sessionCount),
      primaryLabel: metric === 'time' ? 'Campus time' : 'Sessions started',
      secondaryValue: metric === 'time' ? String(student.sessionCount) : formatMinutesAsHoursAndMinutes(student.totalMinutes),
      secondaryLabel: metric === 'time' ? 'Sessions' : 'Campus time',
      averageLabel: formatMinutesAsHoursAndMinutes(student.averageSessionMinutes),
    }));
  });
}
