import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { ThemeService } from '../../../core/services/theme.service';
import { chartSegmentBorderColor } from '../../../shared/utils/chart-theme.util';

const TOTAL_COLOR = '#4cc9f0';
const ACTIVE_COLOR = '#34e2c4';
const OTHER_COLOR = '#ffb020';

/** Compact donut alongside the summary stat cards - the "at a glance" numbers get one chart
 * to anchor them instead of reading as a wall of digits. Each status (Total/Active/Other) is
 * given its own distinct, high-contrast color so the legend stays legible at a glance - "Total"
 * isn't a chart segment (it's the sum of the other two, not a subset of it), but it's still
 * shown with its own dot color for visual consistency with the other two rows. */
@Component({
  selector: 'app-community-split-chart',
  standalone: true,
  imports: [BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="split-card">
      <p class="split-card__label">Community split</p>
      <div class="split-card__body">
        <div class="split-card__donut">
          <canvas baseChart type="doughnut" role="img" [attr.aria-label]="summaryText()" [data]="chartData()" [options]="chartOptions"></canvas>
          <span class="split-card__pct">{{ activePct() }}%</span>
        </div>
        <ul class="split-card__legend">
          <li><span class="dot dot--total" aria-hidden="true"></span>Total Students <strong>{{ totalStudents() }}</strong></li>
          <li><span class="dot dot--active" aria-hidden="true"></span>Active <strong>{{ activeStudents() }}</strong></li>
          <li><span class="dot dot--other" aria-hidden="true"></span>Other <strong>{{ inactiveCount() }}</strong></li>
        </ul>
      </div>
    </article>
  `,
  styles: `
    .split-card {
      background: var(--glass-bg);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg);
      padding: var(--space-5) var(--space-6);
      box-shadow: var(--shadow-card);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
    }

    .split-card__label {
      margin: 0;
      font-size: 0.9rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-text-secondary);
    }

    .split-card__body {
      display: flex;
      align-items: center;
      gap: var(--space-4);
    }

    .split-card__donut {
      position: relative;
      width: 64px;
      height: 64px;
      flex-shrink: 0;
    }

    .split-card__pct {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.8rem;
      font-weight: 800;
      color: var(--color-text-primary);
    }

    .split-card__legend {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }

    .split-card__legend strong {
      color: var(--color-text-primary);
      font-variant-numeric: tabular-nums;
    }

    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: var(--space-2);
    }

    .dot--total {
      background: ${TOTAL_COLOR};
    }

    .dot--active {
      background: ${ACTIVE_COLOR};
    }

    .dot--other {
      background: ${OTHER_COLOR};
    }
  `,
})
export class CommunitySplitChartComponent {
  private readonly theme = inject(ThemeService);

  readonly totalStudents = input.required<number>();
  readonly activeStudents = input.required<number>();

  protected readonly inactiveCount = computed(() => Math.max(this.totalStudents() - this.activeStudents(), 0));

  protected readonly activePct = computed(() => {
    const total = this.totalStudents();
    return total > 0 ? Math.round((this.activeStudents() / total) * 100) : 0;
  });

  protected readonly summaryText = computed(
    () => `${this.activeStudents()} of ${this.totalStudents()} students are active in Common Core (${this.activePct()}%).`,
  );

  protected readonly chartData = computed<ChartConfiguration<'doughnut'>['data']>(() => ({
    labels: ['Active', 'Other'],
    datasets: [
      {
        data: [this.activeStudents(), this.inactiveCount()],
        backgroundColor: [ACTIVE_COLOR, OTHER_COLOR],
        borderColor: chartSegmentBorderColor(this.theme.isLight(), 0.6),
        borderWidth: 2,
      },
    ],
  }));

  protected readonly chartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    animation: { duration: 400 },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
  };
}
