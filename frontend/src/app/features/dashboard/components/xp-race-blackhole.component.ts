import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { BlackHoleWatchEntry, XpLeaderboardEntry } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

interface RaceBar {
  entry: XpLeaderboardEntry;
  rank: number;
  widthPct: number;
  medal: string;
}

interface DangerEntry {
  student: BlackHoleWatchEntry;
  urgency: 'critical' | 'warning' | 'normal';
}

/** "Black Hole Evasion & XP Race": weekly XP bar race plus a danger-zone black hole tracker, for TV mode. */
@Component({
  selector: 'app-xp-race-blackhole',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="race">
      <section class="race__panel race__panel--xp">
        <div class="race__header">
          <span class="race__icon" aria-hidden="true">🏆</span>
          <div>
            <h2 class="race__title">Weekly XP race</h2>
            <p class="race__subtitle">Sum of final marks on validated completions, last 7 days</p>
          </div>
        </div>

        @if (bars().length === 0) {
          <app-empty-state title="No XP this week" description="Weekly XP is a proxy score - the sum of final marks on validated completions." />
        } @else {
          <ol class="race__bars">
            @for (bar of bars(); track bar.entry.id) {
              <li class="race__bar" [class.race__bar--leader]="bar.rank === 1">
                <span class="race__rank">{{ bar.medal }}</span>
                <app-avatar [imageUrl]="bar.entry.imageUrl" [name]="bar.entry.displayName" [size]="40" />
                <div class="race__track">
                  <div class="race__fill" [style.width.%]="bar.widthPct">
                    <span class="race__name">{{ bar.entry.displayName }}</span>
                  </div>
                </div>
                <span class="race__xp">{{ bar.entry.weeklyXp }} XP</span>
              </li>
            }
          </ol>
        }
      </section>

      <section class="race__panel race__panel--danger">
        <div class="race__header">
          <span class="race__icon" aria-hidden="true">🕳️</span>
          <div>
            <h2 class="race__title">Black hole watch</h2>
            <p class="race__subtitle">Soonest black-hole dates on the roster</p>
          </div>
        </div>

        <div class="black-hole" aria-hidden="true">
          <div class="black-hole__disk"></div>
          <div class="black-hole__core"></div>
        </div>

        @if (blackHoleWatch().length === 0) {
          <app-empty-state title="No one in the danger zone" description="Nobody's black hole date is coming up soon." />
        } @else {
          <ul class="danger-list">
            @for (danger of dangers(); track danger.student.id) {
              <li class="danger-item" [class.danger-item--critical]="danger.urgency === 'critical'" [class.danger-item--warning]="danger.urgency === 'warning'">
                <app-avatar [imageUrl]="danger.student.imageUrl" [name]="danger.student.displayName" [size]="44" />
                <span class="danger-item__name">{{ danger.student.displayName }}</span>
                <span class="danger-item__days">{{ danger.student.daysRemaining }}d left</span>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
  styles: `
    .race {
      display: grid;
      grid-template-columns: 1.5fr 1fr;
      gap: var(--space-5);
      height: 100%;
    }

    .race__panel {
      position: relative;
      border-radius: var(--radius-lg);
      border: 1px solid var(--glass-border);
      background: radial-gradient(circle at 100% 0%, rgba(52, 226, 196, 0.1), transparent 55%), var(--glass-bg-elevated);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      padding: var(--space-5);
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      min-height: 60vh;
      overflow: hidden;
    }

    .race__panel--danger {
      background: radial-gradient(circle at 100% 0%, rgba(255, 84, 112, 0.1), transparent 55%), var(--glass-bg-elevated);
    }

    .race__header {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .race__icon {
      font-size: 2rem;
      filter: drop-shadow(0 0 10px rgba(52, 226, 196, 0.35));
    }

    .race__title {
      margin: 0;
      font-size: 1.6rem;
      font-weight: 800;
    }

    .race__subtitle {
      margin: 2px 0 0;
      font-size: 0.8rem;
      color: var(--color-text-muted);
    }

    .race__bars {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      justify-content: center;
      flex: 1;
    }

    .race__bar {
      display: grid;
      grid-template-columns: 3rem auto 1fr auto;
      align-items: center;
      gap: var(--space-3);
    }

    .race__rank {
      font-size: 1.2rem;
      font-weight: 800;
      text-align: center;
      color: var(--color-text-secondary);
    }

    .race__bar--leader .race__rank {
      font-size: 1.8rem;
    }

    .race__track {
      position: relative;
      height: 34px;
      border-radius: 999px;
      background: var(--color-bg-card);
      border: 1px solid var(--color-border);
      overflow: hidden;
    }

    .race__fill {
      height: 100%;
      display: flex;
      align-items: center;
      padding-left: var(--space-3);
      min-width: 2.5rem;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--color-accent), var(--color-accent-strong));
      transition: width 900ms cubic-bezier(0.2, 0.8, 0.2, 1);
      white-space: nowrap;
      overflow: hidden;
    }

    .race__bar--leader .race__fill {
      background: linear-gradient(90deg, var(--color-warn), #ffd876);
      box-shadow: 0 0 18px rgba(255, 176, 32, 0.5);
    }

    .race__name {
      font-size: 0.85rem;
      font-weight: 700;
      color: #06080a;
      text-overflow: ellipsis;
      overflow: hidden;
    }

    .race__xp {
      font-weight: 700;
      color: var(--color-text-secondary);
      white-space: nowrap;
    }

    .black-hole {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--space-4) 0;
      height: 120px;
    }

    .black-hole__disk {
      position: absolute;
      width: 130px;
      height: 130px;
      border-radius: 50%;
      background: conic-gradient(from 0deg, transparent 0%, rgba(255, 84, 112, 0.5) 25%, transparent 50%, rgba(255, 176, 32, 0.4) 75%, transparent 100%);
      -webkit-mask: radial-gradient(circle, transparent 44%, black 46%, black 60%, transparent 62%);
      mask: radial-gradient(circle, transparent 44%, black 46%, black 60%, transparent 62%);
    }

    .black-hole__core {
      position: relative;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #2a0a12, #06080a 70%);
      box-shadow: 0 0 0 6px rgba(255, 84, 112, 0.12), 0 0 40px rgba(255, 84, 112, 0.35);
    }

    @media (prefers-reduced-motion: no-preference) {
      .black-hole__disk {
        animation: black-hole-spin 6s linear infinite;
      }

      .black-hole__core {
        animation: black-hole-pulse 2.6s ease-in-out infinite;
      }
    }

    @keyframes black-hole-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @keyframes black-hole-pulse {
      0%, 100% { box-shadow: 0 0 0 6px rgba(255, 84, 112, 0.12), 0 0 40px rgba(255, 84, 112, 0.3); }
      50% { box-shadow: 0 0 0 12px rgba(255, 84, 112, 0.2), 0 0 60px rgba(255, 84, 112, 0.55); }
    }

    .danger-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      overflow-y: auto;
    }

    .danger-item {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      background: var(--color-bg-card);
      transition: border-color 300ms ease, background 300ms ease;
    }

    .danger-item__name {
      flex: 1;
      font-weight: 600;
    }

    .danger-item__days {
      font-weight: 800;
      color: var(--color-text-secondary);
    }

    .danger-item--warning {
      border-color: var(--color-warn);
      background: rgba(255, 176, 32, 0.06);
    }

    .danger-item--warning .danger-item__days {
      color: var(--color-warn);
    }

    .danger-item--critical {
      border-color: var(--color-danger);
      background: rgba(255, 84, 112, 0.1);
    }

    .danger-item--critical .danger-item__days {
      color: var(--color-danger);
    }

    @media (prefers-reduced-motion: no-preference) {
      .danger-item--critical {
        animation: danger-pulse 2s ease-in-out infinite;
      }
    }

    @keyframes danger-pulse {
      0%, 100% { box-shadow: 0 0 0 rgba(255, 84, 112, 0); }
      50% { box-shadow: 0 0 16px -2px rgba(255, 84, 112, 0.45); }
    }

    @media (max-width: 1100px) {
      .race {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class XpRaceBlackholeComponent {
  readonly xpLeaderboard = input.required<XpLeaderboardEntry[]>();
  readonly blackHoleWatch = input.required<BlackHoleWatchEntry[]>();

  private static readonly MEDALS = ['🥇', '🥈', '🥉'];

  protected readonly bars = computed<RaceBar[]>(() => {
    const entries = this.xpLeaderboard();
    const maxXp = Math.max(...entries.map((e) => e.weeklyXp), 1);
    return entries.map((entry, index) => ({
      entry,
      rank: index + 1,
      widthPct: Math.max(8, Math.round((entry.weeklyXp / maxXp) * 100)),
      medal: XpRaceBlackholeComponent.MEDALS[index] ?? `#${index + 1}`,
    }));
  });

  protected readonly dangers = computed<DangerEntry[]>(() =>
    this.blackHoleWatch().map((student) => ({
      student,
      urgency: student.daysRemaining <= 1 ? 'critical' : student.daysRemaining <= 3 ? 'warning' : 'normal',
    })),
  );
}
