import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { ThemeService } from '../../../core/services/theme.service';
import { chartAxisColors } from '../../../shared/utils/chart-theme.util';

/** Analytics card 2: enrolled-project count and completion rate as headline stats, plus a
 * 7-day-vs-30-day completions bar so the two windows are easy to compare at a glance. */
@Component({
  selector: 'app-project-activity-card',
  standalone: true,
  imports: [DecimalPipe, BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="activity-card">
      <h3 class="activity-card__title">Enrolled Projects</h3>

      <div class="activity-card__stats">
        <div class="activity-stat">
          <span class="activity-stat__value">{{ totalEnrolledProjects() | number }}</span>
          <span class="activity-stat__label">Enrolled projects</span>
        </div>
        <div class="activity-stat activity-stat--accent">
          <span class="activity-stat__value">{{ averageCompletionRate() | number: '1.0-1' }}%</span>
          <span class="activity-stat__label">Avg completion rate</span>
        </div>
      </div>

      <div class="activity-card__chart">
        <canvas baseChart type="bar" role="img" [attr.aria-label]="chartSummary()" [data]="periodData()" [options]="periodOptions()"></canvas>
      </div>
    </article>
  `,
  styles: `
    .activity-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      height: 100%;
      padding: var(--space-5);
      border-radius: var(--radius-lg);
      border: 1px solid var(--glass-border);
      background: var(--glass-bg);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      box-shadow: var(--glass-shadow);
    }

    .activity-card__title {
      margin: 0;
      font-size: 0.9rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-text-secondary);
    }

    .activity-card__stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-3);
    }

    .activity-stat {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--space-3);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
    }

    .activity-stat--accent {
      border-color: var(--color-accent);
      box-shadow: 0 0 0 1px var(--color-accent-glow);
    }

    .activity-stat__value {
      font-size: 1.5rem;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
      color: var(--color-text-primary);
    }

    .activity-stat--accent .activity-stat__value {
      color: var(--color-accent);
    }

    .activity-stat__label {
      font-size: 0.72rem;
      color: var(--color-text-muted);
    }

    .activity-card__chart {
      position: relative;
      flex: 1;
      min-height: 90px;
    }
  `,
})
export class ProjectActivityCardComponent {
  private readonly theme = inject(ThemeService);

  readonly totalEnrolledProjects = input.required<number>();
  readonly completionsLast7Days = input.required<number>();
  readonly completionsLast30Days = input.required<number>();
  readonly averageCompletionRate = input.required<number>();

  protected readonly periodData = computed<ChartConfiguration<'bar'>['data']>(() => ({
    labels: ['Last 7 days', 'Last 30 days'],
    datasets: [
      {
        data: [this.completionsLast7Days(), this.completionsLast30Days()],
        backgroundColor: ['#ffb020', '#16f0a6'],
        borderRadius: 8,
        maxBarThickness: 28,
      },
    ],
  }));

  protected readonly periodOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const { tick, grid } = chartAxisColors(this.theme.isLight());
    return {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${Number(ctx.parsed.x).toLocaleString()}` } },
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: tick, precision: 0 }, grid: { color: grid } },
        y: { ticks: { color: tick }, grid: { display: false } },
      },
    };
  });

  protected readonly chartSummary = computed(
    () => `${this.completionsLast7Days()} completions in the last 7 days, ${this.completionsLast30Days()} in the last 30 days.`,
  );
}
