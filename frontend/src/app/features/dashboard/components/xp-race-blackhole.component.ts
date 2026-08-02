import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { XpLeaderboardEntry } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

const MEDALS = ['🥇', '🥈', '🥉'];
const BAR_COLORS = ['#ffd700', '#b0b8c8', '#cd7f32', '#4cc9f0', '#be2ad1', '#38e19a', '#ffb020', '#ff5470'];

interface ExperienceBar {
  entry: XpLeaderboardEntry;
  rank: number;
  medal: string;
  widthPct: number;
  color: string;
}

/**
 * "Weekly Experience": weekly XP (sum of final marks on validated completions, last 7 days) per
 * student, as a custom bar-race - a chart.js bar chart's axis/tooltip doesn't put the actual XP
 * number anywhere on screen at rest, so this renders each student's own value directly at the
 * end of their bar instead. For TV mode; the section's identity ("Weekly Experience") is shown
 * in the unified TV header bar (see app.html), not repeated here.
 */
@Component({
  selector: 'app-xp-race-blackhole',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="experience">
      @if (bars().length === 0) {
        <app-empty-state title="No XP this week" description="Weekly XP is a proxy score - the sum of final marks on validated completions." />
      } @else {
        <ol class="experience__bars">
          @for (bar of bars(); track bar.entry.id) {
            <li class="experience__bar" [class.experience__bar--leader]="bar.rank === 1">
              <span class="experience__rank">{{ bar.medal }}</span>
              <app-avatar [imageUrl]="bar.entry.imageUrl" [name]="bar.entry.displayName" [size]="48" />
              <div class="experience__track">
                <div class="experience__fill" [style.width.%]="bar.widthPct" [style.background]="bar.color">
                  <span class="experience__name">{{ bar.entry.displayName }}</span>
                </div>
              </div>
              <span class="experience__value">{{ bar.entry.weeklyXp }} XP</span>
            </li>
          }
        </ol>
      }
    </div>
  `,
  styles: `
    .experience {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 70vh;
      padding: var(--space-6);
      border-radius: var(--radius-lg);
      border: 1px solid var(--glass-border);
      background: radial-gradient(circle at 100% 0%, rgba(52, 226, 196, 0.1), transparent 55%), var(--glass-bg-elevated);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
    }

    .experience__bars {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      justify-content: center;
      flex: 1;
    }

    .experience__bar {
      display: grid;
      grid-template-columns: 3.5rem auto 1fr auto;
      align-items: center;
      gap: var(--space-4);
    }

    .experience__rank {
      font-size: 1.4rem;
      font-weight: 800;
      text-align: center;
      color: var(--color-text-secondary);
    }

    .experience__bar--leader .experience__rank {
      font-size: 2.1rem;
    }

    .experience__track {
      position: relative;
      height: 44px;
      border-radius: 999px;
      background: var(--color-bg-card);
      border: 1px solid var(--color-border);
      overflow: hidden;
    }

    .experience__fill {
      height: 100%;
      display: flex;
      align-items: center;
      padding-left: var(--space-4);
      min-width: 3rem;
      border-radius: 999px;
      transition: width 900ms cubic-bezier(0.2, 0.8, 0.2, 1);
      white-space: nowrap;
      overflow: hidden;
    }

    .experience__bar--leader .experience__fill {
      box-shadow: 0 0 22px -2px rgba(255, 215, 0, 0.6);
    }

    .experience__name {
      font-size: 1rem;
      font-weight: 700;
      color: #06080a;
      text-overflow: ellipsis;
      overflow: hidden;
    }

    // The number lives at the far end of each bar, outside the fill itself, so it's always
    // fully legible regardless of how short/long the bar is.
    .experience__value {
      font-weight: 800;
      font-size: 1.2rem;
      color: var(--color-text-primary);
      white-space: nowrap;
      text-align: right;
      min-width: 6ch;
      font-variant-numeric: tabular-nums;
    }

    :host-context(.dashboard--tv) .experience__track { height: 56px; }
    :host-context(.dashboard--tv) .experience__value { font-size: 1.5rem; }
    :host-context(.dashboard--tv) .experience__name { font-size: 1.15rem; }
  `,
})
export class XpRaceBlackholeComponent {
  readonly xpLeaderboard = input.required<XpLeaderboardEntry[]>();

  protected readonly bars = computed<ExperienceBar[]>(() => {
    const entries = this.xpLeaderboard();
    const maxXp = Math.max(...entries.map((e) => e.weeklyXp), 1);
    return entries.map((entry, index) => ({
      entry,
      rank: index + 1,
      medal: MEDALS[index] ?? `#${index + 1}`,
      widthPct: Math.max(10, Math.round((entry.weeklyXp / maxXp) * 100)),
      color: BAR_COLORS[index % BAR_COLORS.length]!,
    }));
  });
}
