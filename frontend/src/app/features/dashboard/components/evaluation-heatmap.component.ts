import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { EvaluationAnalyticsResponse, EvaluationHeatmapCell } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

const HOUR_LABELS = Array.from({ length: 9 }, (_, i) => `${String(i * 3).padStart(2, '0')}:00`);
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function heatmapCellColor(count: number, p90: number): string {
  if (count === 0 || p90 === 0) return 'rgba(255, 255, 255, 0.05)';
  const intensity = Math.min(count / p90, 1);
  return `rgba(76, 201, 240, ${0.15 + intensity * 0.75})`;
}

/**
 * TV-mode view of the Evaluation Activity Heatmap - reuses the exact same
 * `/api/evaluations/analytics` data already powering the full `/evaluations` page
 * (backend/src/services/evaluationAnalytics.ts), condensed for a large-screen, no-interaction
 * display. A fresh instance is created (and refetches) each time TV mode's rotation cycles back
 * to this section, matching the rest of the TV sections' remount-refreshes pattern.
 */
@Component({
  selector: 'app-evaluation-heatmap',
  standalone: true,
  imports: [EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="eval-heatmap">
      @if (loading()) {
        <app-empty-state title="Loading evaluation activity…" />
      } @else if (!data() || data()!.meta.totalEvaluations === 0) {
        <app-empty-state
          title="No evaluation activity yet"
          description="Completed peer evaluations from the last 7 days will populate this heatmap."
        />
      } @else {
        <div class="eval-heatmap__summary">
          @if (data()!.heatmapSummary.peakHourLabel) {
            <div class="stat">
              <span class="stat__value">{{ data()!.heatmapSummary.peakHourLabel }}</span>
              <span class="stat__label">Peak Hour</span>
            </div>
          }
          @if (data()!.heatmapSummary.busiestDay) {
            <div class="stat">
              <span class="stat__value">{{ data()!.heatmapSummary.busiestDay }}</span>
              <span class="stat__label">Busiest Day</span>
            </div>
          }
          @if (data()!.heatmapSummary.quietestDay) {
            <div class="stat">
              <span class="stat__value">{{ data()!.heatmapSummary.quietestDay }}</span>
              <span class="stat__label">Quietest Day</span>
            </div>
          }
          <div class="stat">
            <span class="stat__value">{{ data()!.heatmapSummary.averageDailyEvaluations }}</span>
            <span class="stat__label">Avg / Day</span>
          </div>
        </div>

        <div class="eval-heatmap__body">
          <div class="heatmap">
            <div class="heatmap__day-labels" aria-hidden="true">
              @for (label of dayLabels; track label) {
                <span class="heatmap__day-label">{{ label }}</span>
              }
            </div>
            <div class="heatmap__main">
              <div class="heatmap__grid" role="img" aria-label="Evaluation activity by day and hour, Warsaw time">
                @for (cell of data()!.heatmap; track cell.dayIndex + '-' + cell.hour) {
                  <span
                    class="heatmap__cell"
                    [style.background]="cellColor(cell)"
                    [title]="cell.count + ' evaluations — ' + cell.dayLabel + ' ' + cell.hour + ':00 (Warsaw)' + (cell.topProject ? ' · ' + cell.topProject : '')"
                  ></span>
                }
              </div>
              <div class="heatmap__hour-labels" aria-hidden="true">
                @for (h of hourLabels; track h) {
                  <span>{{ h }}</span>
                }
              </div>
            </div>
          </div>

          <div class="eval-heatmap__legend" aria-label="Color scale from low to high activity">
            <span>Low</span>
            <span class="legend-bar" aria-hidden="true"></span>
            <span>High</span>
          </div>

          @if (data()!.insights.length > 0) {
            <ul class="eval-heatmap__insights">
              @for (insight of data()!.insights; track insight.type) {
                <li>{{ insight.label }}: <strong>{{ insight.value }}</strong></li>
              }
            </ul>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .eval-heatmap {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      height: 100%;
      min-height: 60vh;
    }

    .eval-heatmap__summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--space-3);
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      border: 1px solid var(--glass-border);
      background: var(--glass-bg-elevated);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
    }

    .stat__value {
      font-size: 1.6rem;
      font-weight: 800;
      color: var(--color-accent);
    }

    .stat__label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .eval-heatmap__body {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-5);
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
    }

    .heatmap {
      display: flex;
      gap: var(--space-2);
      flex: 1;
    }

    .heatmap__day-labels {
      display: flex;
      flex-direction: column;
      justify-content: space-around;
      padding-top: 2px;
    }

    .heatmap__day-label {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--color-text-secondary);
    }

    .heatmap__main {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .heatmap__grid {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(24, 1fr);
      grid-template-rows: repeat(7, 1fr);
      grid-auto-flow: column;
      gap: 3px;
    }

    .heatmap__cell {
      border-radius: 3px;
      min-height: 18px;
    }

    @media (prefers-reduced-motion: no-preference) {
      .heatmap__cell {
        transition: background 400ms ease;
      }
    }

    .heatmap__hour-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.7rem;
      color: var(--color-text-muted);
    }

    .eval-heatmap__legend {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      font-size: 0.8rem;
      color: var(--color-text-muted);
      align-self: center;
    }

    .legend-bar {
      width: 140px;
      height: 10px;
      border-radius: 999px;
      background: linear-gradient(90deg, rgba(76, 201, 240, 0.08), rgba(76, 201, 240, 0.9));
    }

    .eval-heatmap__insights {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
      justify-content: center;
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }

    .eval-heatmap__insights strong {
      color: var(--color-text-primary);
    }

    /* TV mode — bigger cells/labels/stats so the heatmap genuinely fills a large screen. */
    :host-context(.dashboard--tv) .stat__value { font-size: 2.4rem; }
    :host-context(.dashboard--tv) .stat__label { font-size: 0.85rem; }
    :host-context(.dashboard--tv) .eval-heatmap__body { padding: var(--space-6); gap: var(--space-5); }
    :host-context(.dashboard--tv) .heatmap { gap: var(--space-3); }
    :host-context(.dashboard--tv) .heatmap__day-label { font-size: 1.3rem; }
    :host-context(.dashboard--tv) .heatmap__grid { gap: 5px; }
    :host-context(.dashboard--tv) .heatmap__cell { min-height: 34px; border-radius: 5px; }
    :host-context(.dashboard--tv) .heatmap__hour-labels { font-size: 0.95rem; }
    :host-context(.dashboard--tv) .eval-heatmap__insights { font-size: 1.15rem; gap: var(--space-5); }
    :host-context(.dashboard--tv) .eval-heatmap__legend { font-size: 1rem; }
    :host-context(.dashboard--tv) .legend-bar { width: 200px; height: 14px; }
  `,
})
export class EvaluationHeatmapComponent {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly dayLabels = DAY_LABELS;
  protected readonly hourLabels = HOUR_LABELS;

  protected readonly loading = signal(true);
  protected readonly data = signal<EvaluationAnalyticsResponse | null>(null);

  private readonly heatmapP90 = computed(() => {
    const d = this.data();
    if (!d) return 1;
    const sorted = d.heatmap.map((c) => c.count).filter((c) => c > 0).sort((a, b) => a - b);
    return sorted.length > 0 ? (sorted[Math.floor(sorted.length * 0.9)] ?? 1) : 1;
  });

  constructor() {
    this.api
      .getEvaluationAnalytics('last7Days')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (envelope) => {
          this.data.set(envelope.data);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  protected cellColor(cell: EvaluationHeatmapCell): string {
    return heatmapCellColor(cell.count, this.heatmapP90());
  }
}
