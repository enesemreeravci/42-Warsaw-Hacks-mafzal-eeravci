import { DecimalPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import type {
  EvaluationAnalyticsResponse,
  EvaluationHeatmapCell,
  EvaluationRangeOption,
  TopEvaluatorEntry,
  TopContributorEntry,
  EvaluationProjectRanking,
  EvaluationTimelineEntry,
} from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';

const RANGE_OPTIONS: { label: string; value: EvaluationRangeOption }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 days', value: 'last7Days' },
  { label: 'Last week', value: 'lastWeek' },
  { label: 'This month', value: 'thisMonth' },
];

const STATUS_COLORS: Record<string, string> = {
  ok: '#4cc9f0',
  fail: '#f72585',
};

function heatmapCellColor(count: number, maxCount: number): string {
  if (count === 0 || maxCount === 0) return 'rgba(255,255,255,0.04)';
  const intensity = Math.min(count / maxCount, 1);
  return `rgba(76, 201, 240, ${0.12 + intensity * 0.78})`;
}

@Component({
  selector: 'app-evaluations-page',
  standalone: true,
  imports: [DecimalPipe, DatePipe, MatButtonToggleModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="eval-page">
      <div class="eval-page__header">
        <h1 class="eval-page__title">Evaluation Analytics</h1>
        <mat-button-toggle-group [value]="selectedRange()" (change)="onRangeChange($event.value)" aria-label="Date range">
          @for (opt of rangeOptions; track opt.value) {
            <mat-button-toggle [value]="opt.value">{{ opt.label }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
      </div>

      @if (loading()) {
        <div class="eval-page__loading" role="status" aria-label="Loading evaluation analytics">
          <mat-icon class="spin">autorenew</mat-icon>
          <p>Loading evaluation data from the 42 API — this may take a few seconds on first load.</p>
        </div>
      } @else if (error()) {
        <div class="eval-page__error" role="alert">
          <mat-icon>error_outline</mat-icon>
          <span>{{ error() }}</span>
        </div>
      } @else if (data(); as d) {
        <!-- KPI Row -->
        <div class="kpi-row">
          <div class="kpi-card">
            <span class="kpi-card__value">{{ d.kpi.evaluationsToday | number }}</span>
            <span class="kpi-card__label">Today</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-card__value">{{ d.kpi.evaluationsThisWeek | number }}</span>
            <span class="kpi-card__label">This week</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-card__value">{{ d.kpi.activeEvaluators | number }}</span>
            <span class="kpi-card__label">Active evaluators</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-card__value">{{ d.kpi.studentsEvaluated | number }}</span>
            <span class="kpi-card__label">Students evaluated</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-card__value">{{ d.kpi.averagePerDay | number: '1.1-1' }}</span>
            <span class="kpi-card__label">Avg per day</span>
          </div>
          @if (d.kpi.mostEvaluatedProject) {
            <div class="kpi-card kpi-card--wide">
              <span class="kpi-card__value kpi-card__value--small">{{ d.kpi.mostEvaluatedProject }}</span>
              <span class="kpi-card__label">Most evaluated project</span>
            </div>
          }
        </div>

        <!-- Total count + historical note -->
        <p class="eval-page__meta">
          {{ d.meta.totalEvaluations | number }} evaluation{{ d.meta.totalEvaluations !== 1 ? 's' : '' }}
          in the selected period.
          @if (d.meta.totalEvaluations === 0) {
            No evaluation data in this window. Try a wider range.
          }
        </p>
        <p class="eval-page__historical-note">{{ d.meta.note }}</p>

        <!-- Insights -->
        @if (d.insights.length > 0) {
          <div class="insights-row">
            @for (insight of d.insights; track insight.type) {
              <div class="insight-chip">
                <span class="insight-chip__label">{{ insight.label }}</span>
                <span class="insight-chip__value">{{ insight.value }}</span>
              </div>
            }
          </div>
        }

        <!-- Main grid -->
        <div class="eval-grid">

          <!-- Heatmap -->
          <section class="panel eval-grid__heatmap" aria-label="Evaluation activity heatmap">
            <h2 class="panel__title">Activity Heatmap (Warsaw time)</h2>
            @if (d.meta.totalEvaluations === 0) {
              <p class="empty-note">No evaluations in this period.</p>
            } @else {
              <div class="heatmap">
                <div class="heatmap__labels">
                  @for (label of heatmapDayLabels; track label) {
                    <span class="heatmap__day-label">{{ label }}</span>
                  }
                </div>
                <div class="heatmap__grid">
                  @for (cell of d.heatmap; track cell.dayIndex + '-' + cell.hour) {
                    <div
                      class="heatmap__cell"
                      [style.background]="cellColor(cell, heatmapMax())"
                      [title]="cell.count + ' evaluations on ' + cell.dayLabel + ' ' + cell.hour + ':00 Warsaw'"
                      [attr.aria-label]="cell.count + ' evaluations'"
                    ></div>
                  }
                </div>
                <div class="heatmap__hour-labels">
                  @for (h of heatmapHourLabels; track h) {
                    <span>{{ h }}</span>
                  }
                </div>
              </div>
              @if (d.heatmapSummary.peakHourLabel) {
                <p class="heatmap__summary">
                  Peak window: <strong>{{ d.heatmapSummary.peakHourLabel }}</strong>
                  @if (d.heatmapSummary.busiestDay) { · Busiest day: <strong>{{ d.heatmapSummary.busiestDay }}</strong> }
                </p>
              }
            }
          </section>

          <!-- Top Evaluators -->
          <section class="panel" aria-label="Top evaluators">
            <h2 class="panel__title">Top Evaluators</h2>
            @if (d.topEvaluators.length === 0) {
              <p class="empty-note">No evaluators in this period.</p>
            } @else {
              <ol class="rank-list">
                @for (ev of d.topEvaluators; track ev.login; let i = $index) {
                  <li class="rank-list__item">
                    <span class="rank-list__rank">#{{ i + 1 }}</span>
                    <div class="rank-list__info">
                      <span class="rank-list__name">{{ ev.displayName }}</span>
                      <span class="rank-list__login">{{ ev.login }}</span>
                    </div>
                    <div class="rank-list__stats">
                      <span class="rank-list__primary">{{ ev.evaluationCount }}</span>
                      <span class="rank-list__secondary">{{ ev.uniqueStudentsEvaluated }} students · {{ ev.uniqueProjectsEvaluated }} projects</span>
                    </div>
                  </li>
                }
              </ol>
            }
          </section>

          <!-- Most Evaluated Students -->
          <section class="panel" aria-label="Most evaluated students">
            <h2 class="panel__title">Most Evaluated Students</h2>
            @if (d.mostEvaluatedStudents.length === 0) {
              <p class="empty-note">No students evaluated in this period.</p>
            } @else {
              <ol class="rank-list">
                @for (st of d.mostEvaluatedStudents; track st.login; let i = $index) {
                  <li class="rank-list__item">
                    <span class="rank-list__rank">#{{ i + 1 }}</span>
                    <div class="rank-list__info">
                      <span class="rank-list__name">{{ st.displayName }}</span>
                      <span class="rank-list__login">{{ st.login }}</span>
                    </div>
                    <div class="rank-list__stats">
                      <span class="rank-list__primary">{{ st.evaluationsReceived }}</span>
                      <span class="rank-list__secondary">{{ st.uniqueProjects }} project{{ st.uniqueProjects !== 1 ? 's' : '' }}</span>
                    </div>
                  </li>
                }
              </ol>
            }
          </section>

          <!-- Top Contributors -->
          <section class="panel" aria-label="Top evaluation contributors">
            <h2 class="panel__title">Top Contributors</h2>
            <p class="panel__subtitle">Score = evals×3 + unique students×2 + unique projects + active days</p>
            @if (d.topContributors.length === 0) {
              <p class="empty-note">No contributors in this period.</p>
            } @else {
              <ol class="rank-list">
                @for (c of d.topContributors; track c.login; let i = $index) {
                  <li class="rank-list__item">
                    <span class="rank-list__rank">#{{ i + 1 }}</span>
                    <div class="rank-list__info">
                      <span class="rank-list__name">{{ c.displayName }}</span>
                      <span class="rank-list__login">{{ c.login }}</span>
                    </div>
                    <div class="rank-list__stats">
                      <span class="rank-list__primary">{{ c.contributionScore }}</span>
                      <span class="rank-list__secondary">{{ c.evaluationCount }} evals</span>
                    </div>
                  </li>
                }
              </ol>
            }
          </section>

          <!-- Project Rankings -->
          <section class="panel" aria-label="Most evaluated projects">
            <h2 class="panel__title">Most Evaluated Projects</h2>
            @if (d.projectRankings.length === 0) {
              <p class="empty-note">No project data in this period.</p>
            } @else {
              <ol class="rank-list">
                @for (p of d.projectRankings; track p.projectName; let i = $index) {
                  <li class="rank-list__item">
                    <span class="rank-list__rank">#{{ i + 1 }}</span>
                    <div class="rank-list__info">
                      <span class="rank-list__name">{{ p.projectName }}</span>
                    </div>
                    <div class="rank-list__stats">
                      <span class="rank-list__primary">{{ p.totalEvaluations }}</span>
                      <span class="rank-list__secondary">
                        {{ p.uniqueStudents }} students
                        @if (p.averageMark !== null) { · avg {{ p.averageMark | number: '1.0-1' }} }
                      </span>
                    </div>
                  </li>
                }
              </ol>
            }
          </section>

          <!-- Evaluation Timeline -->
          <section class="panel eval-grid__timeline" aria-label="Evaluation timeline">
            <h2 class="panel__title">Recent Evaluations</h2>
            @if (d.timeline.length === 0) {
              <p class="empty-note">No evaluations in this period.</p>
            } @else {
              <ol class="timeline-list">
                @for (ev of d.timeline; track ev.id) {
                  <li class="timeline-item">
                    <span
                      class="timeline-item__flag"
                      [style.color]="ev.flagPositive === null ? '#888' : ev.flagPositive ? '#4cc9f0' : '#f72585'"
                      [title]="ev.flagPositive === null ? 'No flag' : ev.flagPositive ? 'Passed' : 'Failed'"
                    >{{ ev.flagPositive === null ? '–' : ev.flagPositive ? '✓' : '✗' }}</span>
                    <div class="timeline-item__body">
                      <span class="timeline-item__who">
                        <strong>{{ ev.correctorLogin }}</strong> evaluated <strong>{{ ev.correctedLogin }}</strong>
                        @if (ev.projectName) { on <em>{{ ev.projectName }}</em> }
                      </span>
                      <span class="timeline-item__meta">
                        @if (ev.finalMark !== null) { Mark: {{ ev.finalMark }} · }
                        {{ ev.filledAt | date: 'dd MMM HH:mm' : 'Europe/Warsaw' }}
                      </span>
                    </div>
                  </li>
                }
              </ol>
            }
          </section>
        </div>
      }
    </div>
  `,
  styles: `
    .eval-page {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      padding: var(--space-5);
      max-width: 1400px;
      margin: 0 auto;
    }

    .eval-page__header {
      display: flex;
      align-items: center;
      gap: var(--space-5);
      flex-wrap: wrap;
    }

    .eval-page__title {
      margin: 0;
      font-size: 1.6rem;
      font-weight: 800;
      flex: 1;
    }

    .eval-page__loading {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      color: var(--color-text-secondary);
      padding: var(--space-6);

      p { margin: 0; }
    }

    .eval-page__error {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-4);
      border: 1px solid var(--color-error, #f72585);
      border-radius: var(--radius-md);
      color: var(--color-error, #f72585);
    }

    .eval-page__meta {
      margin: 0;
      font-size: 0.9rem;
      color: var(--color-text-secondary);
    }

    .eval-page__historical-note {
      margin: 0;
      font-size: 0.8rem;
      color: var(--color-text-muted);
      font-style: italic;
    }

    .kpi-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
    }

    .kpi-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: var(--space-4) var(--space-5);
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg);
      min-width: 100px;
      gap: var(--space-1);
    }

    .kpi-card--wide {
      min-width: 180px;
    }

    .kpi-card__value {
      font-size: 1.8rem;
      font-weight: 800;
      color: var(--color-accent);
      line-height: 1;
    }

    .kpi-card__value--small {
      font-size: 1.1rem;
    }

    .kpi-card__label {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .insights-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
    }

    .insight-chip {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-3);
      background: rgba(76, 201, 240, 0.08);
      border: 1px solid rgba(76, 201, 240, 0.2);
      border-radius: 999px;
      font-size: 0.85rem;
    }

    .insight-chip__label {
      color: var(--color-text-muted);
    }

    .insight-chip__value {
      font-weight: 700;
      color: var(--color-accent);
    }

    .eval-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-5);
    }

    .eval-grid__heatmap {
      grid-column: 1 / -1;
    }

    .eval-grid__timeline {
      grid-column: 1 / -1;
    }

    .panel {
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg);
      padding: var(--space-5);
    }

    .panel__title {
      margin: 0 0 var(--space-3);
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-secondary);
    }

    .panel__subtitle {
      margin: calc(var(--space-3) * -1) 0 var(--space-3);
      font-size: 0.72rem;
      color: var(--color-text-muted);
    }

    .empty-note {
      margin: 0;
      color: var(--color-text-muted);
      font-size: 0.9rem;
    }

    .heatmap {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      overflow-x: auto;
    }

    .heatmap__labels {
      display: grid;
      grid-template-rows: repeat(7, 16px);
      gap: 3px;
      padding-right: var(--space-2);
      font-size: 0.72rem;
      color: var(--color-text-muted);
    }

    .heatmap__day-label {
      line-height: 16px;
    }

    .heatmap__grid {
      display: grid;
      grid-template-columns: repeat(24, 1fr);
      grid-template-rows: repeat(7, 16px);
      gap: 3px;
      min-width: 600px;
    }

    .heatmap__cell {
      border-radius: 2px;
      transition: opacity 200ms;
      cursor: default;
    }

    .heatmap__cell:hover {
      opacity: 0.7;
    }

    .heatmap__hour-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.65rem;
      color: var(--color-text-muted);
      min-width: 600px;
      padding: 0 2px;

      span:nth-child(n+2) {
        text-align: center;
      }
    }

    .heatmap__summary {
      margin: var(--space-3) 0 0;
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }

    .rank-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .rank-list__item {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      background: rgba(255,255,255,0.03);
      border: 1px solid transparent;
      transition: border-color 200ms;
    }

    .rank-list__item:hover {
      border-color: var(--glass-border);
    }

    .rank-list__rank {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--color-text-muted);
      min-width: 2rem;
    }

    .rank-list__info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .rank-list__name {
      font-weight: 600;
      font-size: 0.9rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .rank-list__login {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .rank-list__stats {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    .rank-list__primary {
      font-size: 1.1rem;
      font-weight: 800;
      color: var(--color-accent);
    }

    .rank-list__secondary {
      font-size: 0.72rem;
      color: var(--color-text-muted);
    }

    .timeline-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      max-height: 400px;
      overflow-y: auto;
    }

    .timeline-item {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      background: rgba(255,255,255,0.03);
    }

    .timeline-item__flag {
      font-size: 1.1rem;
      font-weight: 800;
      min-width: 1.5rem;
      text-align: center;
      line-height: 1.4;
    }

    .timeline-item__body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .timeline-item__who {
      font-size: 0.9rem;
    }

    .timeline-item__meta {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .spin {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @media (max-width: 900px) {
      .eval-grid {
        grid-template-columns: 1fr;
      }

      .eval-grid__heatmap,
      .eval-grid__timeline {
        grid-column: 1;
      }
    }
  `,
})
export class EvaluationsPage implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly rangeOptions = RANGE_OPTIONS;
  protected readonly heatmapDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly heatmapHourLabels = Array.from({ length: 9 }, (_, i) => `${String(i * 3).padStart(2, '0')}:00`);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly data = signal<EvaluationAnalyticsResponse | null>(null);
  protected readonly selectedRange = signal<EvaluationRangeOption>('last7Days');

  protected readonly heatmapMax = computed(() => {
    const d = this.data();
    if (!d) return 0;
    return Math.max(...d.heatmap.map((c) => c.count), 1);
  });

  protected readonly cellColor = (cell: EvaluationHeatmapCell, max: number) => heatmapCellColor(cell.count, max);

  ngOnInit(): void {
    this.loadData();
  }

  protected onRangeChange(range: EvaluationRangeOption): void {
    this.selectedRange.set(range);
    this.loadData();
  }

  private loadData(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getEvaluationAnalytics(this.selectedRange()).subscribe({
      next: (envelope) => {
        this.data.set(envelope.data);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.error.set(err?.message ?? 'Failed to load evaluation analytics.');
        this.loading.set(false);
      },
    });
  }
}
