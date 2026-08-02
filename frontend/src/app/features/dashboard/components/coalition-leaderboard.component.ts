import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import type { CoalitionStanding } from '../../../core/models/api.models';
import { TvModeService } from '../../../core/services/tv-mode.service';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { CoalitionFlagComponent } from './coalition-flag.component';

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
  imports: [DecimalPipe, BaseChartDirective, AvatarComponent, EmptyStateComponent, CoalitionFlagComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="leaderboard">
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
                  [size]="leaderAvatarSize()"
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

                  <app-coalition-flag
                    [name]="card.standing.name"
                    [color]="card.standing.color ?? FALLBACK_COLOR"
                    [fallbackImageUrl]="card.standing.imageUrl"
                  />

                  <span class="coalition-card__name">{{ card.standing.name }}</span>
                </div>

                <div class="coalition-card__stats">
                  <span class="coalition-card__score">{{ card.standing.score | number }} pts</span>
                  <span class="coalition-card__percent">{{ card.percent | number: '1.0-1' }}%</span>
                </div>

                <div class="coalition-card__contributors">
                  <div class="contributor-col">
                    <p class="contributor-col__label">Top Contributor <span>(All-Time)</span></p>
                    @if (card.standing.topContributor; as top) {
                      <div class="contributor-col__body">
                        <app-avatar [imageUrl]="top.imageUrl" [name]="top.displayName" [size]="32" />
                        <div class="contributor-col__details">
                          <p class="contributor-col__name">{{ top.displayName }}</p>
                          <p class="contributor-col__value">{{ top.score | number }} pts</p>
                        </div>
                      </div>
                    } @else {
                      <p class="contributor-col__empty">No data yet</p>
                    }
                  </div>

                  <div class="coalition-card__divider" aria-hidden="true"></div>

                  <div class="contributor-col">
                    <p class="contributor-col__label">Top Contributor <span>(This Week)</span></p>
                    @if (card.standing.weeklyTopContributor; as weekly) {
                      <div class="contributor-col__body">
                        <app-avatar [imageUrl]="weekly.imageUrl" [name]="weekly.displayName" [size]="32" />
                        <div class="contributor-col__details">
                          <p class="contributor-col__name">{{ weekly.displayName }}</p>
                          <p class="contributor-col__value contributor-col__value--weekly">{{ weekly.weeklyPoints | number }} pts</p>
                        </div>
                      </div>
                      <span class="contributor-col__badge">⚡ 7-Day MVP</span>
                    } @else {
                      <p class="contributor-col__empty">No activity this week</p>
                    }
                  </div>
                </div>
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
      min-height: 380px;
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
      font-size: 1.3rem;
      font-weight: 800;
      max-width: 14ch;
      text-align: center;
      line-height: 1.2;
    }

    .leaderboard__center-score {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 800;
      color: var(--color-warn);
    }

    .leaderboard__center-coalition {
      margin: 0;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
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

    .coalition-card__contributors {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      gap: var(--space-3);
      align-items: start;
      padding-top: var(--space-2);
      border-top: 1px solid var(--color-border);
    }

    .coalition-card__divider {
      width: 1px;
      align-self: stretch;
      background: var(--color-border);
    }

    .contributor-col {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .contributor-col__label {
      margin: 0;
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
      white-space: nowrap;

      span {
        color: var(--color-text-secondary);
      }
    }

    .contributor-col__body {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .contributor-col__details {
      min-width: 0;
    }

    .contributor-col__name {
      margin: 0;
      font-weight: 700;
      font-size: 0.85rem;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }

    .contributor-col__value {
      margin: 0;
      font-size: 0.78rem;
      font-weight: 800;
      color: var(--color-warn);
    }

    .contributor-col__value--weekly {
      color: var(--color-accent-strong);
    }

    .contributor-col__empty {
      margin: 0;
      font-size: 0.78rem;
      color: var(--color-text-muted);
    }

    .contributor-col__badge {
      align-self: flex-start;
      margin-top: 2px;
      padding: 2px var(--space-2);
      border-radius: 999px;
      font-size: 0.62rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      white-space: nowrap;
      color: #06080a;
      background: linear-gradient(90deg, var(--color-warn), var(--color-accent-strong));
      box-shadow: 0 0 10px -1px var(--color-warn), 0 0 16px -2px var(--color-accent-glow);
      animation: weekly-badge-pulse 2.4s ease-in-out infinite;
    }

    @keyframes weekly-badge-pulse {
      0%, 100% {
        box-shadow: 0 0 10px -1px var(--color-warn), 0 0 16px -2px var(--color-accent-glow);
      }
      50% {
        box-shadow: 0 0 16px 1px var(--color-warn), 0 0 26px 2px var(--color-accent-glow);
      }
    }

    @media (max-width: 1100px) {
      .leaderboard__body {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 480px) {
      .coalition-card__contributors {
        grid-template-columns: 1fr;
      }

      .coalition-card__divider {
        width: 100%;
        height: 1px;
      }
    }

    /* TV mode — the donut/cards read as noticeably too small on a big screen at the default
     * sizing, so this scales the whole card up to genuinely fill it. */
    :host-context(.dashboard--tv) .leaderboard__body { min-height: 72vh; padding: var(--space-6); }
    :host-context(.dashboard--tv) .leaderboard__chart-wrap { min-height: 460px; }
    :host-context(.dashboard--tv) .coalition-card { padding: var(--space-4) var(--space-5); }
    :host-context(.dashboard--tv) .coalition-card__name { font-size: 1.4rem; }
    :host-context(.dashboard--tv) .coalition-card__score { font-size: 1.15rem; }
    :host-context(.dashboard--tv) .coalition-card__percent { font-size: 1.3rem; }
    :host-context(.dashboard--tv) .contributor-col__name { font-size: 1rem; }
    :host-context(.dashboard--tv) .contributor-col__value { font-size: 0.95rem; }
  `,
})
export class CoalitionLeaderboardComponent {
  readonly standings = input.required<CoalitionStanding[]>();

  protected readonly FALLBACK_COLOR = FALLBACK_COLOR;

  private readonly tvMode = inject(TvModeService);
  /** The `size` avatar input renders as an inline pixel style, so a CSS-only
   * `:host-context(.dashboard--tv)` override can't reach it - this picks the TV-scaled size directly. */
  protected readonly leaderAvatarSize = computed(() => (this.tvMode.enabled() ? 220 : 168));

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
    cutout: '60%',
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
