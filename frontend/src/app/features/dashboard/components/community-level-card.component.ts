import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { CommunitySplitChartComponent } from './community-split-chart.component';

/** 42's Common Core levels don't have a single official ceiling, but this is a reasonable,
 * stable scale for a "how far along" gauge - most graduating students land well under it. */
const LEVEL_GAUGE_MAX = 21;
const GAUGE_FILL_COLOR = '#be2ad1';
const GAUGE_TRACK_COLOR = 'rgba(154, 171, 181, 0.18)';

/** Analytics card 3: the Active/Total community split donut (reused from the summary card)
 * alongside the campus's average level as a half-doughnut gauge. */
@Component({
  selector: 'app-community-level-card',
  standalone: true,
  imports: [BaseChartDirective, CommunitySplitChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="community-level-card">
      <h3 class="community-level-card__title">Community &amp; Level</h3>

      <div class="community-level-card__row">
        <app-community-split-chart [totalStudents]="totalStudents()" [activeStudents]="activeStudents()" />

        <div class="level-gauge">
          <canvas
            baseChart
            type="doughnut"
            role="img"
            [attr.aria-label]="'Average level ' + averageLevel().toFixed(2) + ' of ' + LEVEL_GAUGE_MAX"
            [data]="gaugeData()"
            [options]="gaugeOptions"
          ></canvas>
          <div class="level-gauge__center">
            <span class="level-gauge__value">{{ averageLevel().toFixed(2) }}</span>
            <span class="level-gauge__label">Avg level</span>
          </div>
        </div>
      </div>
    </article>
  `,
  styles: `
    .community-level-card {
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

    .community-level-card__title {
      margin: 0;
      font-size: 0.9rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-text-secondary);
    }

    .community-level-card__row {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      flex: 1;
    }

    .level-gauge {
      position: relative;
      flex: 1;
      min-height: 110px;
      display: flex;
      align-items: flex-end;
      justify-content: center;
    }

    .level-gauge canvas {
      width: 100% !important;
      max-width: 220px;
    }

    .level-gauge__center {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 6%;
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
    }

    .level-gauge__value {
      font-size: 1.6rem;
      font-weight: 800;
      color: var(--color-text-primary);
    }

    .level-gauge__label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
    }
  `,
})
export class CommunityLevelCardComponent {
  readonly totalStudents = input.required<number>();
  readonly activeStudents = input.required<number>();
  readonly averageLevel = input.required<number>();

  protected readonly LEVEL_GAUGE_MAX = LEVEL_GAUGE_MAX;

  protected readonly gaugeData = computed<ChartConfiguration<'doughnut'>['data']>(() => {
    const filled = Math.min(Math.max(this.averageLevel(), 0), LEVEL_GAUGE_MAX);
    const remaining = LEVEL_GAUGE_MAX - filled;
    return {
      labels: ['Average level', 'Remaining'],
      datasets: [
        {
          data: [filled, remaining],
          backgroundColor: [GAUGE_FILL_COLOR, GAUGE_TRACK_COLOR],
          borderWidth: 0,
        },
      ],
    };
  });

  protected readonly gaugeOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    circumference: 180,
    rotation: -90,
    cutout: '75%',
    animation: { duration: 500 },
    plugins: {
      legend: { display: false },
      tooltip: { enabled: false },
    },
  };
}
