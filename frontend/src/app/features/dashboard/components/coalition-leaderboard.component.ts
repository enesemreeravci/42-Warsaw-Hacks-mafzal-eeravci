import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import type { CoalitionStanding } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

const FALLBACK_COLOR = '#34e2c4';

interface CoalitionCard {
  standing: CoalitionStanding;
  percent: number;
}

/** Coalition leaderboard: donut chart of each coalition's score share, with the leading
 * coalition's top contributor spotlighted in the donut's center cutout, and a ranked card per
 * coalition (score, share, and that coalition's own top contributor) below. For TV mode. */
@Component({
  selector: 'app-coalition-leaderboard',
  standalone: true,
  imports: [DecimalPipe, BaseChartDirective, AvatarComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="leaderboard">
      <h2 class="leaderboard__title">Coalition leaderboard</h2>

      @if (cards().length === 0) {
        <app-empty-state title="No coalition data" description="Coalition standings will appear here once scores are available." />
      } @else {
        <div class="leaderboard__body">
          <div class="leaderboard__chart-wrap">
            <canvas
              baseChart
              role="img"
              [attr.aria-label]="chartSummary()"
              [data]="chartData()"
              [options]="chartOptions"
              type="doughnut"
            ></canvas>

            @if (leader(); as leader) {
              <div class="leaderboard__center">
                <app-avatar
                  [imageUrl]="leader.standing.topContributor?.imageUrl ?? null"
                  [name]="leader.standing.topContributor?.displayName ?? leader.standing.name"
                  [size]="76"
                />
                <p class="leaderboard__center-name">{{ leader.standing.topContributor?.displayName ?? 'No contributor yet' }}</p>
                @if (leader.standing.topContributor; as top) {
                  <p class="leaderboard__center-score">{{ top.score | number }} pts</p>
                }
                <p class="leaderboard__center-coalition">{{ leader.standing.name }}</p>
              </div>
            }
          </div>

          <ol class="leaderboard__cards">
            @for (card of cards(); track card.standing.id) {
              <li
                class="coalition-card"
                [class.coalition-card--leader]="card.standing.rank === 1"
                [style.--coalition-color]="card.standing.color ?? FALLBACK_COLOR"
              >
                <div class="coalition-card__header">
                  <span class="coalition-card__rank">{{ card.standing.rank === 1 ? '👑' : '#' + card.standing.rank }}</span>
                  @if (card.standing.imageUrl; as logo) {
                    <img class="coalition-card__logo" [src]="logo" [alt]="card.standing.name" />
                  }
                  <span class="coalition-card__name">{{ card.standing.name }}</span>
                </div>

                <div class="coalition-card__stats">
                  <span class="coalition-card__score">{{ card.standing.score | number }} pts</span>
                  <span class="coalition-card__percent">{{ card.percent | number: '1.0-1' }}%</span>
                </div>

                @if (card.standing.topContributor; as top) {
                  <div class="coalition-card__top">
                    <app-avatar [imageUrl]="top.imageUrl" [name]="top.displayName" [size]="40" />
                    <div class="coalition-card__top-details">
                      <p class="coalition-card__top-label">Top contributor</p>
                      <p class="coalition-card__top-name">{{ top.displayName }}</p>
                    </div>
                    <span class="coalition-card__top-score">{{ top.score | number }}</span>
                  </div>
                } @else {
                  <p class="coalition-card__top-empty">No contributor data yet</p>
                }
              </li>
            }
          </ol>
        </div>
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

    .leaderboard__body {
      flex: 1;
      min-height: 60vh;
      display: grid;
      grid-template-columns: minmax(260px, 1fr) minmax(320px, 1.3fr);
      gap: var(--space-5);
      padding: var(--space-5);
      border-radius: var(--radius-lg);
      border: 1px solid var(--glass-border);
      background: var(--glass-bg-elevated);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
    }

    .leaderboard__chart-wrap {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 280px;
    }

    .leaderboard__chart-wrap::before {
      content: '';
      position: absolute;
      inset: 6%;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(52, 226, 196, 0.14), transparent 70%);
      filter: blur(6px);
      z-index: 0;
    }

    .leaderboard__chart-wrap canvas {
      position: relative;
      z-index: 1;
    }

    .leaderboard__center {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      text-align: center;
      pointer-events: none;
      animation: leaderboard-center-in 500ms ease-out;
    }

    @keyframes leaderboard-center-in {
      from {
        opacity: 0;
        transform: scale(0.85);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .leaderboard__center-name {
      margin: var(--space-2) 0 0;
      font-size: 1.05rem;
      font-weight: 800;
      max-width: 16ch;
    }

    .leaderboard__center-score {
      margin: 0;
      font-weight: 700;
      color: var(--color-warn);
    }

    .leaderboard__center-coalition {
      margin: 0;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .leaderboard__cards {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      justify-content: center;
      overflow-y: auto;
    }

    .coalition-card {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      border-left: 4px solid var(--coalition-color, var(--color-accent));
      background:
        linear-gradient(120deg, color-mix(in srgb, var(--coalition-color, var(--color-accent)) 8%, transparent), transparent 60%),
        var(--color-bg-card);
      transition: transform 250ms ease, box-shadow 250ms ease;
    }

    .coalition-card:hover {
      transform: translateX(2px);
    }

    .coalition-card--leader {
      box-shadow: 0 0 0 1px var(--coalition-color, var(--color-accent)) inset, 0 0 24px -8px var(--coalition-color, var(--color-accent));
    }

    .coalition-card__header {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .coalition-card__rank {
      font-size: 1.1rem;
      font-weight: 800;
      color: var(--color-text-secondary);
      min-width: 2rem;
    }

    .coalition-card__logo {
      width: 28px;
      height: 28px;
      object-fit: contain;
      flex-shrink: 0;
    }

    .coalition-card__name {
      font-size: 1.15rem;
      font-weight: 700;
      flex: 1;
    }

    .coalition-card__stats {
      display: flex;
      align-items: baseline;
      gap: var(--space-3);
    }

    .coalition-card__score {
      font-weight: 700;
      color: var(--color-text-secondary);
    }

    .coalition-card__percent {
      font-weight: 800;
      color: var(--coalition-color, var(--color-accent));
    }

    .coalition-card__top {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding-top: var(--space-2);
      border-top: 1px solid var(--color-border);
    }

    .coalition-card__top-details {
      flex: 1;
      min-width: 0;
    }

    .coalition-card__top-label {
      margin: 0;
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .coalition-card__top-name {
      margin: 0;
      font-weight: 700;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }

    .coalition-card__top-score {
      font-weight: 800;
      color: var(--color-warn);
    }

    .coalition-card__top-empty {
      margin: var(--space-1) 0 0;
      padding-top: var(--space-2);
      border-top: 1px solid var(--color-border);
      font-size: 0.85rem;
      color: var(--color-text-muted);
    }

    @media (max-width: 1100px) {
      .leaderboard__body {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class CoalitionLeaderboardComponent {
  readonly standings = input.required<CoalitionStanding[]>();

  protected readonly FALLBACK_COLOR = FALLBACK_COLOR;

  private readonly totalScore = computed(() => this.standings().reduce((sum, s) => sum + Math.max(s.score, 0), 0));

  protected readonly cards = computed<CoalitionCard[]>(() => {
    const total = this.totalScore();
    return this.standings().map((standing) => ({
      standing,
      percent: total > 0 ? (Math.max(standing.score, 0) / total) * 100 : 0,
    }));
  });

  /** The #1-ranked coalition, whose top contributor is spotlighted in the donut's center. */
  protected readonly leader = computed<CoalitionCard | null>(() => this.cards().find((c) => c.standing.rank === 1) ?? null);

  protected readonly chartData = computed<ChartConfiguration<'doughnut'>['data']>(() => {
    const entries = this.standings();
    return {
      labels: entries.map((e) => e.name),
      datasets: [
        {
          data: entries.map((e) => Math.max(e.score, 0)),
          backgroundColor: entries.map((e) => e.color ?? FALLBACK_COLOR),
          borderColor: 'rgba(6, 8, 10, 0.6)',
          borderWidth: 2,
          hoverOffset: 12,
        },
      ],
    };
  });

  protected readonly chartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '68%',
    animation: { duration: 500 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.label}: ${Number(ctx.parsed).toLocaleString()} pts`,
        },
      },
    },
  };

  protected readonly chartSummary = computed(() => {
    const total = this.totalScore();
    const entries = this.standings();
    if (entries.length === 0) return 'No coalition data available.';
    return entries
      .map((e) => `${e.name}: ${e.score.toLocaleString()} points (${total > 0 ? Math.round((Math.max(e.score, 0) / total) * 100) : 0}%)`)
      .join(', ');
  });
}
