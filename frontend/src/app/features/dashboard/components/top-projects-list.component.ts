import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import type { ProjectMetric } from '../../../core/models/api.models';
import { ThemeService } from '../../../core/services/theme.service';
import { chartSegmentBorderColor } from '../../../shared/utils/chart-theme.util';

const MEDALS = ['🥇', '🥈', '🥉'];
const SUCCESS_COLOR = '#38e19a';
const FAIL_COLOR = 'rgba(255, 84, 112, 0.35)';

interface ProjectCard {
  metric: ProjectMetric;
  badge: string;
  successPct: number;
  chartData: ChartConfiguration<'doughnut'>['data'];
}

/** Circular project cards: each a small pass-rate donut with the percentage as its center
 * metric, rather than a horizontal bar list. */
@Component({
  selector: 'app-top-projects-list',
  standalone: true,
  imports: [EmptyStateComponent, BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cards().length === 0) {
      <app-empty-state title="No completions in this period" description="Try widening the display period." />
    } @else {
      <ol class="project-grid">
        @for (card of cards(); track card.metric.projectId) {
          <li class="project-card">
            <span class="project-card__badge">{{ card.badge }}</span>
            <div class="project-card__donut">
              <canvas
                baseChart
                type="doughnut"
                role="img"
                [attr.aria-label]="card.metric.projectName + ': ' + card.successPct + '% pass rate, ' + card.metric.completionCount + ' completions'"
                [data]="card.chartData"
                [options]="chartOptions"
              ></canvas>
              <div class="project-card__center">
                <span class="project-card__pct">{{ card.successPct }}%</span>
                <span class="project-card__pct-label">pass</span>
              </div>
            </div>
            <p class="project-card__name">{{ card.metric.projectName }}</p>
            <p class="project-card__count">{{ card.metric.completionCount }} completions</p>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    .project-grid {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: var(--space-4);
    }

    .project-card {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1);
      padding: var(--space-3);
      border-radius: var(--radius-lg);
      border: 1px solid var(--glass-border);
      background: var(--glass-bg-elevated);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      text-align: center;
    }

    .project-card__badge {
      position: absolute;
      top: var(--space-2);
      left: var(--space-2);
      font-size: 1.1rem;
      line-height: 1;
    }

    .project-card__donut {
      position: relative;
      width: 88px;
      height: 88px;
      margin-top: var(--space-2);
    }

    .project-card__center {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    .project-card__pct {
      font-size: 1.05rem;
      font-weight: 800;
      color: var(--color-text-primary);
    }

    .project-card__pct-label {
      font-size: 0.62rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
    }

    .project-card__name {
      margin: var(--space-1) 0 0;
      font-weight: 700;
      font-size: 0.88rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }

    .project-card__count {
      margin: 0;
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }
  `,
})
export class TopProjectsListComponent {
  private readonly theme = inject(ThemeService);

  readonly projects = input.required<ProjectMetric[]>();

  protected readonly cards = computed<ProjectCard[]>(() => {
    const borderColor = chartSegmentBorderColor(this.theme.isLight(), 0.6);
    return this.projects().map((metric, index) => {
      const successPct = Math.round(metric.successRate);
      return {
        metric,
        badge: MEDALS[index] ?? `${index + 1}`,
        successPct,
        chartData: {
          labels: ['Passed', 'Failed'],
          datasets: [
            {
              data: [metric.successfulCompletionCount, metric.failedCompletionCount],
              backgroundColor: [SUCCESS_COLOR, FAIL_COLOR],
              borderColor,
              borderWidth: 2,
            },
          ],
        },
      };
    });
  });

  protected readonly chartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    animation: { duration: 300 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.label}: ${ctx.parsed}`,
        },
      },
    },
  };
}
