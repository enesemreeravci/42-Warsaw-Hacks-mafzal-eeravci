import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { ThemeService } from '../../../core/services/theme.service';
import { chartAxisColors } from '../../../shared/utils/chart-theme.util';
import { CommunitySplitChartComponent } from './community-split-chart.component';

const TOTAL_COLOR = '#4cc9f0';
const ACTIVE_COLOR = '#34e2c4';

/** Analytics card 1: a bar comparing total vs. active Common Core students, paired with the
 * same ratio as a donut (reusing CommunitySplitChartComponent) directly underneath. */
@Component({
  selector: 'app-student-overview-card',
  standalone: true,
  imports: [BaseChartDirective, CommunitySplitChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="overview-card">
      <h3 class="overview-card__title">Student Overview</h3>

      <div class="overview-card__bar">
        <canvas baseChart type="bar" role="img" [attr.aria-label]="barSummary()" [data]="barData()" [options]="barOptions()"></canvas>
      </div>

      <app-community-split-chart [totalStudents]="totalStudents()" [activeStudents]="activeStudents()" />
    </article>
  `,
  styles: `
    .overview-card {
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

    .overview-card__title {
      margin: 0;
      font-size: 0.9rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-text-secondary);
    }

    .overview-card__bar {
      position: relative;
      height: 150px;
    }
  `,
})
export class StudentOverviewCardComponent {
  private readonly theme = inject(ThemeService);

  readonly totalStudents = input.required<number>();
  readonly activeStudents = input.required<number>();

  protected readonly barData = computed<ChartConfiguration<'bar'>['data']>(() => ({
    labels: ['Total Students', 'Active Common Core'],
    datasets: [
      {
        data: [this.totalStudents(), this.activeStudents()],
        backgroundColor: [TOTAL_COLOR, ACTIVE_COLOR],
        borderRadius: 8,
        maxBarThickness: 56,
      },
    ],
  }));

  protected readonly barOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const { tick, grid } = chartAxisColors(this.theme.isLight());
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${Number(ctx.parsed.y).toLocaleString()}` } },
      },
      scales: {
        x: { ticks: { color: tick }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: tick, precision: 0 }, grid: { color: grid } },
      },
    };
  });

  protected readonly barSummary = computed(
    () => `${this.totalStudents().toLocaleString()} total students, ${this.activeStudents().toLocaleString()} active in Common Core.`,
  );
}
