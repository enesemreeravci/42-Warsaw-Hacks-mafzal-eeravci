import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import type { CompletionTrendPoint } from '../../../core/models/api.models';
import { ThemeService } from '../../../core/services/theme.service';
import { chartAxisColors } from '../../../shared/utils/chart-theme.util';

@Component({
  selector: 'app-completion-trend-chart',
  standalone: true,
  imports: [BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="trend-chart">
      <canvas
        baseChart
        role="img"
        [attr.aria-label]="textSummary()"
        [data]="chartData()"
        [options]="chartOptions()"
        type="line"
      ></canvas>
      <p class="visually-hidden">{{ textSummary() }}</p>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .trend-chart {
      position: relative;
      flex: 1;
      min-height: 260px;
    }
  `,
})
export class CompletionTrendChartComponent {
  private readonly theme = inject(ThemeService);

  readonly points = input.required<CompletionTrendPoint[]>();

  readonly chartData = computed<ChartConfiguration<'line'>['data']>(() => ({
    labels: this.points().map((p) => p.date.slice(5)),
    datasets: [
      {
        label: 'Validated completions',
        data: this.points().map((p) => p.count),
        borderColor: '#34e2c4',
        backgroundColor: 'rgba(52, 226, 196, 0.18)',
        pointBackgroundColor: '#34e2c4',
        tension: 0.35,
        fill: true,
      },
    ],
  }));

  readonly textSummary = computed(() => {
    const points = this.points();
    if (points.length === 0) return 'No completion trend data available.';
    const total = points.reduce((sum, p) => sum + p.count, 0);
    const peak = points.reduce((max, p) => (p.count > max.count ? p : max), points[0]!);
    return `Daily validated completions over ${points.length} days. Total ${total}, peak ${peak.count} on ${peak.date}.`;
  });

  protected readonly chartOptions = computed<ChartConfiguration<'line'>['options']>(() => {
    const { tick, grid } = chartAxisColors(this.theme.isLight());
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      scales: {
        x: { ticks: { color: tick }, grid: { color: grid } },
        y: { beginAtZero: true, ticks: { color: tick, precision: 0 }, grid: { color: grid } },
      },
      plugins: {
        legend: { display: false },
      },
    };
  });
}
