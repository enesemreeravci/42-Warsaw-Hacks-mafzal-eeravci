import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CoalitionStanding } from '../../../core/models/api.models';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

const FALLBACK_COLOR = '#34e2c4';

interface RingCard {
  standing: CoalitionStanding;
  rank: number;
  /** Share of this week's total points across all ranked coalitions, 0-100. */
  percent: number;
  color: string;
  ringGradient: string;
}

/**
 * "Weekly Top Coalitions": which coalition's members earned the most points this week (sum of
 * every member's weekly XP, see CoalitionStanding.weeklyPoints) - a "climbing fastest" signal
 * distinct from the all-time score donut in CoalitionLeaderboardComponent and the single-student
 * spotlight in weeklyTopContributor. Rendered as a grid of progress-ring stat cards (each ring a
 * pure-CSS conic-gradient, no chart.js) rather than another bar/donut chart, so it reads as its
 * own distinct moment in the TV rotation. For TV mode; the section's identity is shown in the
 * unified TV header bar (see app.html).
 */
@Component({
  selector: 'app-weekly-top-coalitions',
  standalone: true,
  imports: [EmptyStateComponent, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="weekly-coalitions">
      @if (cards().length === 0) {
        <app-empty-state
          title="No weekly coalition activity yet"
          description="Coalition members' weekly points will show up here once validated completions come in."
        />
      } @else {
        <div class="weekly-coalitions__grid">
          @for (card of cards(); track card.standing.id) {
            <div class="ring-card" [class.ring-card--leader]="card.rank === 1" [style.--ring-color]="card.color">
              <div class="ring-card__ring" [style.background]="card.ringGradient">
                <div class="ring-card__ring-inner">
                  <span class="ring-card__pct">{{ card.percent }}%</span>
                  <span class="ring-card__pct-label">of this week</span>
                </div>
              </div>
              <p class="ring-card__name">{{ card.standing.name }}</p>
              <p class="ring-card__points">+{{ card.standing.weeklyPoints | number }} pts</p>
              @if (card.rank === 1) {
                <span class="ring-card__badge">👑 Climbing Fastest</span>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .weekly-coalitions {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 65vh;
      padding: var(--space-6);
      border-radius: var(--radius-lg);
      border: 1px solid var(--glass-border);
      background: radial-gradient(circle at 0% 100%, rgba(190, 42, 209, 0.1), transparent 55%), var(--glass-bg-elevated);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
    }

    .weekly-coalitions__grid {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--space-6);
    }

    .ring-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-5);
      border-radius: var(--radius-lg);
      border: 1px solid var(--glass-border);
      background: var(--glass-bg-elevated);
    }

    .ring-card--leader {
      border-color: var(--ring-color, var(--color-accent));
      box-shadow: 0 0 32px -8px var(--ring-color, var(--color-accent));
    }

    .ring-card__ring {
      position: relative;
      width: 190px;
      height: 190px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    @media (prefers-reduced-motion: no-preference) {
      .ring-card__ring {
        transition: background 900ms cubic-bezier(0.2, 0.8, 0.2, 1);
        animation: ring-pop-in 500ms ease-out;
      }
    }

    @keyframes ring-pop-in {
      from { opacity: 0; transform: scale(0.85); }
      to { opacity: 1; transform: scale(1); }
    }

    .ring-card__ring-inner {
      position: relative;
      width: 74%;
      height: 74%;
      border-radius: 50%;
      background: var(--color-bg-elevated);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      box-shadow: inset 0 0 0 1px var(--glass-border);
    }

    .ring-card__pct {
      font-size: 1.9rem;
      font-weight: 900;
      color: var(--color-text-primary);
      font-variant-numeric: tabular-nums;
    }

    .ring-card__pct-label {
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .ring-card__name {
      margin: 0;
      font-size: 1.3rem;
      font-weight: 800;
      text-align: center;
    }

    .ring-card__points {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--ring-color, var(--color-accent));
      font-variant-numeric: tabular-nums;
    }

    .ring-card__badge {
      padding: 2px var(--space-3);
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      color: #06080a;
      background: linear-gradient(90deg, var(--color-warn), var(--color-accent-strong));
      box-shadow: 0 0 14px -2px var(--color-warn);
    }

    :host-context(.dashboard--tv) .ring-card__ring { width: 240px; height: 240px; }
    :host-context(.dashboard--tv) .ring-card__pct { font-size: 2.4rem; }
    :host-context(.dashboard--tv) .ring-card__name { font-size: 1.6rem; }
    :host-context(.dashboard--tv) .ring-card__points { font-size: 1.4rem; }
  `,
})
export class WeeklyTopCoalitionsComponent {
  readonly standings = input.required<CoalitionStanding[]>();

  private readonly ranked = computed(() =>
    [...this.standings()].filter((s) => s.weeklyPoints > 0).sort((a, b) => b.weeklyPoints - a.weeklyPoints),
  );

  protected readonly cards = computed<RingCard[]>(() => {
    const entries = this.ranked();
    const total = entries.reduce((sum, e) => sum + e.weeklyPoints, 0);
    return entries.map((standing, index) => {
      const percent = total > 0 ? Math.round((standing.weeklyPoints / total) * 100) : 0;
      const color = standing.color ?? FALLBACK_COLOR;
      return {
        standing,
        rank: index + 1,
        percent,
        color,
        ringGradient: `conic-gradient(${color} 0% ${percent}%, rgba(255, 255, 255, 0.08) ${percent}% 100%)`,
      };
    });
  });
}
