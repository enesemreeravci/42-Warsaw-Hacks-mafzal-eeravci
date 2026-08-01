import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import type { CoalitionStanding } from '../../../core/models/api.models';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

const FALLBACK_COLOR = '#34e2c4';

/**
 * "Weekly Top Coalitions": which coalition's members earned the most points this week (sum of
 * every member's weekly XP, see CoalitionStanding.weeklyPoints), as a horizontal bar chart - a
 * "climbing fastest" signal distinct from the all-time score ranking in
 * CoalitionLeaderboardComponent and the single-student spotlight in weeklyTopContributor. For
 * TV mode; the section's identity is shown in the unified TV header bar (see app.html).
 */
@Component({
  selector: 'app-weekly-top-coalitions',
  standalone: true,
  imports: [BaseChartDirective, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="weekly-coalitions">
      @if (ranked().length === 0) {
        <app-empty-state
          title="No weekly coalition activity yet"
          description="Coalition members' weekly points will show up here once validated completions come in."
        />
      } @else {
        <div class="weekly-coalitions__chart-wrap">
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

    .weekly-coalitions__chart-wrap {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 60vh;
    }
  `,
})
export class WeeklyTopCoalitionsComponent {
  readonly standings = input.required<CoalitionStanding[]>();

  protected readonly ranked = computed(() =>
    [...this.standings()].filter((s) => s.weeklyPoints > 0).sort((a, b) => b.weeklyPoints - a.weeklyPoints),
  );

  protected readonly chartData = computed<ChartConfiguration<'bar'>['data']>(() => {
    const entries = this.ranked();
    return {
      labels: entries.map((e) => e.name),
      datasets: [
        {
          label: 'Weekly points',
          data: entries.map((e) => e.weeklyPoints),
          backgroundColor: entries.map((e) => e.color ?? FALLBACK_COLOR),
          borderRadius: 8,
          maxBarThickness: 56,
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
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.formattedValue} pts this week` } },
    },
  };

  protected readonly chartSummary = computed(() => {
    const entries = this.ranked();
    if (entries.length === 0) return 'No weekly coalition point data available.';
    return entries.map((e) => `${e.name}: ${e.weeklyPoints} points this week`).join(', ');
  });
}
