import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import type { XpLeaderboardEntry } from '../../../core/models/api.models';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

const BAR_COLORS = ['#ffd700', '#b0b8c8', '#cd7f32', '#4cc9f0', '#be2ad1', '#38e19a', '#ffb020', '#ff5470'];

/** "Weekly Experience": weekly XP (sum of final marks on validated completions, last 7 days) per
 * student, as a large horizontal bar chart. For TV mode. The section's identity ("Weekly
 * Experience") is shown in the unified TV header bar (see app.html), not repeated here. */
@Component({
  selector: 'app-xp-race-blackhole',
  standalone: true,
  imports: [BaseChartDirective, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="experience">
      @if (xpLeaderboard().length === 0) {
        <app-empty-state title="No XP this week" description="Weekly XP is a proxy score - the sum of final marks on validated completions." />
      } @else {
        <div class="experience__chart-wrap">
          <canvas
            baseChart
            role="img"
            [attr.aria-label]="chartSummary()"
            [data]="chartData()"
            [options]="chartOptions"
            type="bar"
          ></canvas>
        </div>
      }
    </div>
  `,
  styles: `
    .experience {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 70vh;
      padding: var(--space-6);
      border-radius: var(--radius-lg);
      border: 1px solid var(--glass-border);
      background: radial-gradient(circle at 100% 0%, rgba(52, 226, 196, 0.1), transparent 55%), var(--glass-bg-elevated);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
    }

    .experience__chart-wrap {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 65vh;
    }
  `,
})
export class XpRaceBlackholeComponent {
  readonly xpLeaderboard = input.required<XpLeaderboardEntry[]>();

  protected readonly chartData = computed<ChartConfiguration<'bar'>['data']>(() => {
    const entries = this.xpLeaderboard();
    return {
      labels: entries.map((e) => e.displayName),
      datasets: [
        {
          label: 'Weekly XP',
          data: entries.map((e) => e.weeklyXp),
          backgroundColor: entries.map((_, i) => BAR_COLORS[i % BAR_COLORS.length]!),
          borderRadius: 8,
          maxBarThickness: 52,
        },
      ],
    };
  });

  protected readonly chartOptions: ChartConfiguration<'bar'>['options'] = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600 },
    scales: {
      x: {
        beginAtZero: true,
        ticks: { color: '#9aa5b1', font: { size: 13 } },
        grid: { color: 'rgba(255, 255, 255, 0.06)' },
      },
      y: {
        ticks: { color: '#e8edf2', font: { size: 16, weight: 700 } },
        grid: { display: false },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.formattedValue} XP` } },
    },
  };

  protected readonly chartSummary = computed(() => {
    const entries = this.xpLeaderboard();
    if (entries.length === 0) return 'No weekly XP data available.';
    return entries.map((e) => `${e.displayName}: ${e.weeklyXp} XP`).join(', ');
  });
}
