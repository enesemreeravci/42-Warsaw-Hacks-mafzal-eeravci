import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { CoalitionStanding, CoalitionTopContributor, CoalitionWeeklyContributor } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { CoalitionFlagComponent } from './coalition-flag.component';

const FALLBACK_COLOR = '#34e2c4';

interface CoalitionFeedEntry {
  standing: CoalitionStanding;
  weekly: CoalitionWeeklyContributor;
  /** All-time top contributor, shown alongside the weekly MVP so "who's leading" and "who's hot
   * this week" are visible side by side - null only if no roster member could be matched. */
  leader: CoalitionTopContributor | null;
}

/**
 * Analytics section, bottom row: recent coalition-scoped milestones. There's no live "event
 * log" endpoint for coalitions - `coalitions_users.score` is a cumulative, un-timestamped
 * total - so this surfaces each coalition's `weeklyTopContributor` (the same trailing-7-day
 * proxy metric behind the Weekly XP race and the coalition leaderboard's "This Week" column,
 * see docs/LIMITATIONS.md) as the closest honest signal to "what just happened for this
 * coalition," ranked by weekly points so the most active coalition leads the feed. Each card
 * pairs that with the coalition's all-time `topContributor` so "who's leading overall" is
 * visible next to "who's hot this week" instead of requiring a trip to the TV-mode leaderboard.
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
        <ol class="mvp-grid">
          @for (entry of entries(); track entry.standing.id) {
            <li class="mvp-card" [style.--coalition-color]="entry.standing.color ?? FALLBACK_COLOR">
              <div class="mvp-card__header">
                <app-coalition-flag size="sm" [name]="entry.standing.name" [color]="entry.standing.color ?? FALLBACK_COLOR" />
                <span class="mvp-card__coalition">{{ entry.standing.name }}</span>
              </div>

              <div class="mvp-card__cols">
                <div class="mvp-col">
                  <p class="mvp-col__label">Leading</p>
                  @if (entry.leader; as leader) {
                    <a class="mvp-col__body" [routerLink]="['/students', leader.login]">
                      <app-avatar [imageUrl]="leader.imageUrl" [name]="leader.displayName" [size]="40" />
                      <div class="mvp-col__info">
                        <p class="mvp-col__name">{{ leader.displayName }}</p>
                        <p class="mvp-col__value">{{ leader.score | number }} pts</p>
                      </div>
                    </a>
                  } @else {
                    <p class="mvp-col__empty">No data yet</p>
                  }
                </div>

                <div class="mvp-card__divider" aria-hidden="true"></div>

                <div class="mvp-col">
                  <p class="mvp-col__label">This week <span class="mvp-col__badge">⚡ MVP</span></p>
                  <a class="mvp-col__body" [routerLink]="['/students', entry.weekly.login]">
                    <app-avatar [imageUrl]="entry.weekly.imageUrl" [name]="entry.weekly.displayName" [size]="40" />
                    <div class="mvp-col__info">
                      <p class="mvp-col__name">{{ entry.weekly.displayName }}</p>
                      <p class="mvp-col__value mvp-col__value--weekly">{{ entry.weekly.weeklyPoints | number }} pts</p>
                    </div>
                  </a>
                </div>
              </div>
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

    .mvp-grid {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: var(--space-4);
    }

    .mvp-card {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
      background:
        radial-gradient(120% 100% at 0% 0%, color-mix(in srgb, var(--coalition-color, var(--color-accent)) 16%, transparent), transparent 60%),
        var(--color-bg-elevated);
      overflow: hidden;
      transition: transform 250ms ease, box-shadow 250ms ease, border-color 250ms ease;
    }

    .mvp-card::before {
      content: '';
      position: absolute;
      inset: 0 0 auto 0;
      height: 3px;
      background: linear-gradient(90deg, var(--coalition-color, var(--color-accent)), transparent 85%);
    }

    .mvp-card:hover {
      transform: translateY(-3px);
      border-color: var(--coalition-color, var(--color-accent));
      box-shadow: 0 16px 32px -16px var(--coalition-color, var(--color-accent));
    }

    .mvp-card__header {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .mvp-card__coalition {
      flex: 1;
      min-width: 0;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--coalition-color, var(--color-accent));
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mvp-card__cols {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: var(--space-3);
      align-items: start;
    }

    .mvp-card__divider {
      width: 1px;
      align-self: stretch;
      background: var(--color-border);
    }

    .mvp-col {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .mvp-col__label {
      margin: 0;
      display: flex;
      align-items: center;
      gap: var(--space-1);
      font-size: 0.62rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-text-muted);
      white-space: nowrap;
    }

    .mvp-col__badge {
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 0.58rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      color: #06080a;
      background: linear-gradient(90deg, var(--color-warn), var(--color-accent-strong));
      box-shadow: 0 0 10px -1px var(--color-warn), 0 0 16px -2px var(--color-accent-glow);
      animation: mvp-badge-pulse 2.4s ease-in-out infinite;
    }

    @keyframes mvp-badge-pulse {
      0%, 100% {
        box-shadow: 0 0 10px -1px var(--color-warn), 0 0 16px -2px var(--color-accent-glow);
      }
      50% {
        box-shadow: 0 0 16px 1px var(--color-warn), 0 0 26px 2px var(--color-accent-glow);
      }
    }

    .mvp-col__body {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      text-decoration: none;
      color: inherit;
    }

    .mvp-col__info {
      min-width: 0;
    }

    .mvp-col__name {
      margin: 0;
      font-size: 0.85rem;
      font-weight: 800;
      color: var(--color-text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .mvp-col__value {
      margin: 2px 0 0;
      font-size: 0.9rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: var(--color-warn);
    }

    .mvp-col__value--weekly {
      color: var(--color-accent-strong);
    }

    .mvp-col__empty {
      margin: 0;
      font-size: 0.78rem;
      color: var(--color-text-muted);
    }

    @media (max-width: 420px) {
      .mvp-card__cols {
        grid-template-columns: 1fr;
      }

      .mvp-card__divider {
        width: 100%;
        height: 1px;
      }
    }
  `,
})
export class RecentCoalitionActivityComponent {
  readonly coalitions = input.required<CoalitionStanding[]>();

  protected readonly FALLBACK_COLOR = FALLBACK_COLOR;

  protected readonly entries = computed<CoalitionFeedEntry[]>(() =>
    this.coalitions()
      .filter((standing): standing is CoalitionStanding & { weeklyTopContributor: CoalitionWeeklyContributor } => standing.weeklyTopContributor !== null)
      .map((standing) => ({ standing, weekly: standing.weeklyTopContributor, leader: standing.topContributor }))
      .sort((a, b) => b.weekly.weeklyPoints - a.weekly.weeklyPoints),
  );
}
