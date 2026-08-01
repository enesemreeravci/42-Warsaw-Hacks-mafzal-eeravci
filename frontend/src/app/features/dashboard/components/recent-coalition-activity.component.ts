import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CoalitionStanding, CoalitionWeeklyContributor } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { CoalitionFlagComponent } from './coalition-flag.component';

const FALLBACK_COLOR = '#34e2c4';

interface CoalitionFeedEntry {
  standing: CoalitionStanding;
  weekly: CoalitionWeeklyContributor;
}

/**
 * Analytics section, bottom row: recent coalition-scoped milestones. There's no live "event
 * log" endpoint for coalitions - `coalitions_users.score` is a cumulative, un-timestamped
 * total - so this surfaces each coalition's `weeklyTopContributor` (the same trailing-7-day
 * proxy metric behind the Weekly XP race and the coalition leaderboard's "This Week" column,
 * see docs/LIMITATIONS.md) as the closest honest signal to "what just happened for this
 * coalition," ranked by weekly points so the most active coalition leads the feed.
 */
@Component({
  selector: 'app-recent-coalition-activity',
  standalone: true,
  imports: [DecimalPipe, AvatarComponent, EmptyStateComponent, CoalitionFlagComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="coalition-activity">
      <h3 class="coalition-activity__title">Recent Coalition Activity</h3>

      @if (entries().length === 0) {
        <app-empty-state
          title="No coalition activity yet"
          description="Weekly coalition contributions will appear here once someone validates a project."
        />
      } @else {
        <ol class="coalition-feed">
          @for (entry of entries(); track entry.standing.id) {
            <li class="coalition-feed__item" [style.--coalition-color]="entry.standing.color ?? FALLBACK_COLOR">
              <app-coalition-flag size="sm" [name]="entry.standing.name" [color]="entry.standing.color ?? FALLBACK_COLOR" />

              <a class="coalition-feed__avatar" [routerLink]="['/students', entry.weekly.login]">
                <app-avatar [imageUrl]="entry.weekly.imageUrl" [name]="entry.weekly.displayName" [size]="40" />
              </a>

              <div class="coalition-feed__body">
                <p class="coalition-feed__text">
                  <strong>{{ entry.weekly.displayName }}</strong> is leading
                  <strong class="coalition-feed__coalition-name">{{ entry.standing.name }}</strong>
                  this week
                </p>
                <p class="coalition-feed__meta">{{ entry.weekly.weeklyPoints | number }} pts earned in the last 7 days</p>
              </div>

              <span class="coalition-feed__badge">⚡ 7-Day MVP</span>
            </li>
          }
        </ol>
      }
    </article>
  `,
  styles: `
    .coalition-activity {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-5);
      border-radius: var(--radius-lg);
      border: 1px solid var(--glass-border);
      background: var(--glass-bg);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      box-shadow: var(--glass-shadow);
    }

    .coalition-activity__title {
      margin: 0;
      font-size: 0.9rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-text-secondary);
    }

    .coalition-feed {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--space-3);
    }

    .coalition-feed__item {
      position: relative;
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      border-left: 4px solid var(--coalition-color, var(--color-accent));
      background: var(--color-bg-elevated);
      transition: transform 200ms ease, box-shadow 200ms ease;
    }

    .coalition-feed__item:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px -8px var(--coalition-color, var(--color-accent));
    }

    .coalition-feed__avatar {
      flex-shrink: 0;
    }

    .coalition-feed__body {
      min-width: 0;
      flex: 1;
    }

    .coalition-feed__text {
      margin: 0;
      font-size: 0.88rem;
      color: var(--color-text-primary);
    }

    .coalition-feed__coalition-name {
      color: var(--coalition-color, var(--color-accent));
    }

    .coalition-feed__meta {
      margin: 2px 0 0;
      font-size: 0.78rem;
      color: var(--color-text-muted);
    }

    .coalition-feed__badge {
      align-self: flex-start;
      flex-shrink: 0;
      padding: 2px var(--space-2);
      border-radius: 999px;
      font-size: 0.6rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      white-space: nowrap;
      color: #06080a;
      background: linear-gradient(90deg, var(--color-warn), var(--color-accent-strong));
      box-shadow: 0 0 10px -1px var(--color-warn), 0 0 16px -2px var(--color-accent-glow);
    }
  `,
})
export class RecentCoalitionActivityComponent {
  readonly coalitions = input.required<CoalitionStanding[]>();

  protected readonly FALLBACK_COLOR = FALLBACK_COLOR;

  protected readonly entries = computed<CoalitionFeedEntry[]>(() =>
    this.coalitions()
      .filter((standing): standing is CoalitionStanding & { weeklyTopContributor: CoalitionWeeklyContributor } => standing.weeklyTopContributor !== null)
      .map((standing) => ({ standing, weekly: standing.weeklyTopContributor }))
      .sort((a, b) => b.weekly.weeklyPoints - a.weekly.weeklyPoints),
  );
}
