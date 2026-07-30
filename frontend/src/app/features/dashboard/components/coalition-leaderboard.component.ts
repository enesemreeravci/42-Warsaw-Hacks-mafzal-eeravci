import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CoalitionStanding } from '../../../core/models/api.models';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

interface LeaderboardBar {
  standing: CoalitionStanding;
  widthPct: number;
}

/** Coalition leaderboard: ranked bar list colored by each coalition's own brand color, for TV mode. */
@Component({
  selector: 'app-coalition-leaderboard',
  standalone: true,
  imports: [DecimalPipe, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="leaderboard">
      <h2 class="leaderboard__title">Coalition leaderboard</h2>

      @if (bars().length === 0) {
        <app-empty-state title="No coalition data" description="Coalition standings will appear here once scores are available." />
      } @else {
        <ol class="leaderboard__list">
          @for (bar of bars(); track bar.standing.id) {
            <li class="leaderboard__row" [class.leaderboard__row--leader]="bar.standing.rank === 1">
              <span class="leaderboard__rank">{{ bar.standing.rank === 1 ? '👑' : '#' + bar.standing.rank }}</span>
              @if (bar.standing.imageUrl; as logo) {
                <img class="leaderboard__logo" [src]="logo" [alt]="bar.standing.name" />
              }
              <div class="leaderboard__track">
                <div
                  class="leaderboard__fill"
                  [style.width.%]="bar.widthPct"
                  [style.background]="bar.standing.color ?? 'var(--color-accent)'"
                >
                  <span class="leaderboard__name">{{ bar.standing.name }}</span>
                </div>
              </div>
              <span class="leaderboard__score">{{ bar.standing.score | number }}</span>
            </li>
          }
        </ol>
      }
    </div>
  `,
  styles: `
    .leaderboard {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      height: 100%;
    }

    .leaderboard__title {
      margin: 0;
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: -0.01em;
    }

    .leaderboard__list {
      list-style: none;
      margin: 0;
      padding: var(--space-5);
      flex: 1;
      min-height: 60vh;
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: var(--space-4);
      overflow-y: auto;
    }

    .leaderboard__row {
      display: grid;
      grid-template-columns: 3rem auto 1fr auto;
      align-items: center;
      gap: var(--space-3);
    }

    .leaderboard__rank {
      font-size: 1.2rem;
      font-weight: 800;
      text-align: center;
      color: var(--color-text-secondary);
    }

    .leaderboard__row--leader .leaderboard__rank {
      font-size: 1.6rem;
    }

    .leaderboard__logo {
      width: 40px;
      height: 40px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .leaderboard__track {
      position: relative;
      height: 34px;
      border-radius: 999px;
      background: var(--color-bg-card);
      border: 1px solid var(--color-border);
      overflow: hidden;
    }

    .leaderboard__fill {
      height: 100%;
      display: flex;
      align-items: center;
      padding-left: var(--space-3);
      min-width: 2.5rem;
      border-radius: 999px;
      transition: width 900ms cubic-bezier(0.2, 0.8, 0.2, 1);
      white-space: nowrap;
      overflow: hidden;
    }

    .leaderboard__name {
      font-size: 0.85rem;
      font-weight: 700;
      color: #06080a;
      text-shadow: 0 1px 2px rgba(255, 255, 255, 0.25);
      text-overflow: ellipsis;
      overflow: hidden;
    }

    .leaderboard__score {
      font-weight: 700;
      color: var(--color-text-secondary);
      white-space: nowrap;
    }
  `,
})
export class CoalitionLeaderboardComponent {
  readonly standings = input.required<CoalitionStanding[]>();

  protected readonly bars = computed<LeaderboardBar[]>(() => {
    const entries = this.standings();
    const maxScore = Math.max(...entries.map((e) => e.score), 1);
    return entries.map((standing) => ({
      standing,
      widthPct: Math.max(8, Math.round((standing.score / maxScore) * 100)),
    }));
  });
}
