import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, interval, merge } from 'rxjs';
import { debounceTime, switchMap } from 'rxjs/operators';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import type {
  EvaluationAnalyticsResponse,
  EvaluationHeatmapCell,
  EvaluationRangeOption,
} from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';

type EvaluationGranularity = 'hourly' | 'daily' | 'weekly' | 'monthly';

const RANGE_OPTIONS: { label: string; value: EvaluationRangeOption }[] = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 days', value: 'last7Days' },
  { label: 'Last week', value: 'lastWeek' },
  { label: 'This month', value: 'thisMonth' },
];

const GRANULARITY_OPTIONS: { label: string; value: EvaluationGranularity }[] = [
  { label: 'Daily', value: 'daily' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
];

function heatmapCellColor(count: number, p90: number): string {
  if (count === 0 || p90 === 0) return 'rgba(255,255,255,0.04)';
  const intensity = Math.min(count / p90, 1);
  return `rgba(76, 201, 240, ${0.12 + intensity * 0.78})`;
}

@Component({
  selector: 'app-evaluations-page',
  standalone: true,
  imports: [DecimalPipe, DatePipe, MatButtonToggleModule, MatIconModule, BaseChartDirective, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="eval-page">

      <!-- Header -->
      <div class="eval-page__header">
        <h1 class="eval-page__title">Evaluation Analytics</h1>
        <mat-button-toggle-group [value]="selectedRange()" (change)="onRangeChange($event.value)" aria-label="Date range">
          @for (opt of rangeOptions; track opt.value) {
            <mat-button-toggle [value]="opt.value">{{ opt.label }}</mat-button-toggle>
          }
        </mat-button-toggle-group>
      </div>

      <!-- Filters -->
      <div class="filter-row" role="search" aria-label="Evaluation filters">
        <div class="filter-field">
          <label class="filter-field__label" for="filter-student">Student login</label>
          <input
            id="filter-student"
            class="filter-field__input"
            type="search"
            placeholder="alice…"
            autocomplete="off"
            [value]="filterStudent()"
            (input)="onStudentFilterInput($any($event.target).value)"
          />
        </div>
        <div class="filter-field">
          <label class="filter-field__label" for="filter-evaluator">Evaluator login</label>
          <input
            id="filter-evaluator"
            class="filter-field__input"
            type="search"
            placeholder="bob…"
            autocomplete="off"
            [value]="filterEvaluator()"
            (input)="onEvaluatorFilterInput($any($event.target).value)"
          />
        </div>
        <div class="filter-field">
          <label class="filter-field__label" for="filter-project">Project name</label>
          <input
            id="filter-project"
            class="filter-field__input"
            type="search"
            placeholder="libft…"
            autocomplete="off"
            [value]="filterProject()"
            (input)="onProjectFilterInput($any($event.target).value)"
          />
        </div>
        <div class="filter-field filter-field--granularity">
          <span class="filter-field__label">Granularity</span>
          <mat-button-toggle-group [value]="selectedGranularity()" (change)="onGranularityChange($event.value)" aria-label="Chart granularity">
            @for (opt of granularityOptions; track opt.value) {
              <mat-button-toggle [value]="opt.value">{{ opt.label }}</mat-button-toggle>
            }
          </mat-button-toggle-group>
        </div>
      </div>

      <!-- Loading / error / data -->
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
            <span class="kpi-card__label">Avg / day</span>
          </div>
          @if (d.kpi.mostEvaluatedProject) {
            <div class="kpi-card kpi-card--wide">
              <span class="kpi-card__value kpi-card__value--small">{{ d.kpi.mostEvaluatedProject }}</span>
              <span class="kpi-card__label">Top project</span>
            </div>
          }
        </div>

        <!-- Meta + note -->
        <p class="eval-page__meta">
          {{ d.meta.totalEvaluations | number }} evaluation{{ d.meta.totalEvaluations !== 1 ? 's' : '' }}
          in the selected period.
          @if (d.meta.totalEvaluations === 0) { No evaluation data in this window. Try a wider range. }
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

          <!-- Activity Chart -->
          <section class="panel eval-grid__chart" aria-label="Evaluation activity chart">
            <h2 class="panel__title">Activity</h2>
            @if (activityChartData(); as chartData) {
              <div class="chart-container">
                <canvas baseChart type="bar" [data]="chartData" [options]="activityChartOptions"
                  role="img" aria-label="Evaluation activity bar chart"></canvas>
              </div>
            } @else {
              <p class="empty-note">No evaluation activity in this period.</p>
            }
          </section>

          <!-- Heatmap -->
          <section class="panel eval-grid__heatmap" aria-label="Evaluation activity heatmap">
            <h2 class="panel__title">Activity Heatmap (Warsaw time)</h2>
            @if (d.meta.totalEvaluations === 0) {
              <p class="empty-note">No evaluations in this period.</p>
            } @else {
              <div class="heatmap-wrap">
                <div class="heatmap">
                  <div class="heatmap__day-labels" aria-hidden="true">
                    @for (label of heatmapDayLabels; track label) {
                      <span class="heatmap__day-label">{{ label }}</span>
                    }
                  </div>
                  <div class="heatmap__main">
                    <div class="heatmap__grid" role="grid" aria-label="Hourly activity grid">
                      @for (cell of d.heatmap; track cell.dayIndex + '-' + cell.hour) {
                        <div
                          class="heatmap__cell"
                          role="gridcell"
                          [style.background]="cellColor(cell)"
                          [title]="cell.count + ' evaluations — ' + cell.dayLabel + ' ' + cell.hour + ':00' + (cell.topProject ? ' · ' + cell.topProject : '') + (cell.topEvaluator ? ' · top: ' + cell.topEvaluator : '') + ' (Warsaw)'"
                          [attr.aria-label]="cell.count + ' evaluations on ' + cell.dayLabel + ' at ' + cell.hour + ':00 Warsaw'"
                        ></div>
                      }
                    </div>
                    <div class="heatmap__hour-labels" aria-hidden="true">
                      @for (h of heatmapHourLabels; track h) {
                        <span>{{ h }}</span>
                      }
                    </div>
                  </div>
                </div>
                <div class="heatmap__legend" aria-label="Color scale from low to high activity">
                  <span class="heatmap__legend-text">Low</span>
                  <div class="heatmap__legend-bar" aria-hidden="true"></div>
                  <span class="heatmap__legend-text">High</span>
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
                    <app-avatar [imageUrl]="ev.imageUrl" [name]="ev.displayName" [size]="32" />
                    <div class="rank-list__info">
                      <span class="rank-list__name">{{ ev.displayName }}</span>
                      <span class="rank-list__login">{{ ev.login }} · Lv {{ ev.level | number: '1.0-1' }}</span>
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
                    <app-avatar [imageUrl]="st.imageUrl" [name]="st.displayName" [size]="32" />
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
                    <app-avatar [imageUrl]="c.imageUrl" [name]="c.displayName" [size]="32" />
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

          <!-- Timeline -->
          <section class="panel eval-grid__timeline" aria-label="Recent evaluations timeline">
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

    /* ── Filters ──────────────────────────────────────── */

    .filter-row {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: var(--space-4);
      padding: var(--space-4);
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg);
    }

    .filter-field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .filter-field--granularity {
      margin-left: auto;
    }

    .filter-field__label {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .filter-field__input {
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-md);
      color: var(--color-text);
      font-size: 0.88rem;
      padding: 6px 10px;
      min-width: 160px;
      outline: none;
      transition: border-color 150ms;

      &:focus {
        border-color: var(--color-accent);
      }

      &::placeholder {
        color: var(--color-text-muted);
      }
    }

    /* ── KPI ──────────────────────────────────────────── */

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
      text-align: center;
    }

    .kpi-card--wide { min-width: 180px; }

    .kpi-card__value {
      font-size: 1.8rem;
      font-weight: 800;
      color: var(--color-accent);
      line-height: 1;
    }

    .kpi-card__value--small { font-size: 1.1rem; }

    .kpi-card__label {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    /* ── Insights ─────────────────────────────────────── */

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

    .insight-chip__label { color: var(--color-text-muted); }

    .insight-chip__value {
      font-weight: 700;
      color: var(--color-accent);
    }

    /* ── Grid ─────────────────────────────────────────── */

    .eval-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-5);
    }

    .eval-grid__chart   { grid-column: 1 / -1; }
    .eval-grid__heatmap { grid-column: 1 / -1; }
    .eval-grid__timeline { grid-column: 1 / -1; }

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

    /* ── Activity Chart ───────────────────────────────── */

    .chart-container {
      position: relative;
      height: 220px;
    }

    /* ── Heatmap ──────────────────────────────────────── */

    .heatmap-wrap {
      overflow-x: auto;
    }

    .heatmap {
      display: flex;
      align-items: flex-start;
      min-width: 620px;
      gap: var(--space-2);
    }

    .heatmap__day-labels {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding-top: 1px;
    }

    .heatmap__day-label {
      height: 16px;
      line-height: 16px;
      font-size: 0.72rem;
      color: var(--color-text-muted);
      white-space: nowrap;
    }

    .heatmap__main {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .heatmap__grid {
      display: grid;
      grid-template-columns: repeat(24, 1fr);
      grid-template-rows: repeat(7, 16px);
      gap: 3px;
    }

    .heatmap__cell {
      border-radius: 2px;
      cursor: default;
      transition: opacity 150ms;

      &:hover { opacity: 0.7; }
    }

    .heatmap__hour-labels {
      display: flex;
      justify-content: space-between;
      font-size: 0.65rem;
      color: var(--color-text-muted);
      padding: 0 2px;
    }

    .heatmap__legend {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: var(--space-3);
      font-size: 0.7rem;
      color: var(--color-text-muted);
    }

    .heatmap__legend-bar {
      width: 140px;
      height: 10px;
      border-radius: 4px;
      background: linear-gradient(to right, rgba(76,201,240,0.10), rgba(76,201,240,0.90));
    }

    .heatmap__legend-text { white-space: nowrap; }

    .heatmap__summary {
      margin: var(--space-3) 0 0;
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }

    /* ── Rank lists ───────────────────────────────────── */

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
      transition: border-color 150ms;

      &:hover { border-color: var(--glass-border); }
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

    /* ── Timeline ─────────────────────────────────────── */

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

    .timeline-item__who { font-size: 0.9rem; }

    .timeline-item__meta {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    /* ── Misc ─────────────────────────────────────────── */

    .spin { animation: spin 1s linear infinite; }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

    @media (max-width: 900px) {
      .eval-grid { grid-template-columns: 1fr; }
      .eval-grid__chart, .eval-grid__heatmap, .eval-grid__timeline { grid-column: 1; }
      .filter-field--granularity { margin-left: 0; }
    }
  `,
})
export class EvaluationsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rangeOptions = RANGE_OPTIONS;
  protected readonly granularityOptions = GRANULARITY_OPTIONS;
  protected readonly heatmapDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly heatmapHourLabels = Array.from({ length: 9 }, (_, i) => `${String(i * 3).padStart(2, '0')}:00`);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly data = signal<EvaluationAnalyticsResponse | null>(null);
  protected readonly selectedRange = signal<EvaluationRangeOption>('last7Days');
  protected readonly selectedGranularity = signal<EvaluationGranularity>('daily');
  protected readonly filterStudent = signal('');
  protected readonly filterEvaluator = signal('');
  protected readonly filterProject = signal('');

  private readonly reload$ = new Subject<void>();
  private readonly filterChange$ = new Subject<void>();

  /** 90th-percentile count used for robust heatmap color normalization. */
  protected readonly heatmapP90 = computed(() => {
    const d = this.data();
    if (!d) return 1;
    const sorted = d.heatmap.map((c) => c.count).filter((c) => c > 0).sort((a, b) => a - b);
    if (sorted.length === 0) return 1;
    return sorted[Math.floor(sorted.length * 0.9)] ?? 1;
  });

  protected readonly cellColor = (cell: EvaluationHeatmapCell): string =>
    heatmapCellColor(cell.count, this.heatmapP90());

  protected readonly activityChartData = computed((): ChartConfiguration<'bar'>['data'] | null => {
    const d = this.data();
    if (!d || d.activitySeries.length === 0) return null;
    return {
      labels: d.activitySeries.map((p) => p.period),
      datasets: [
        {
          label: 'Evaluations',
          data: d.activitySeries.map((p) => p.count),
          backgroundColor: 'rgba(76, 201, 240, 0.55)',
          borderColor: 'rgba(76, 201, 240, 0.9)',
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    };
  });

  protected readonly activityChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: { legend: { display: false } },
    scales: {
      x: {
        ticks: { color: '#9aabb5', maxRotation: 45 },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
      y: {
        beginAtZero: true,
        ticks: { color: '#9aabb5', precision: 0 },
        grid: { color: 'rgba(255,255,255,0.05)' },
      },
    },
  };

  ngOnInit(): void {
    merge(
      this.reload$,
      this.filterChange$.pipe(debounceTime(350)),
      interval(5 * 60 * 1000), // Auto-refresh every 5 minutes; backend serves from 30-min cache
    )
      .pipe(
        switchMap(() => {
          this.loading.set(true);
          this.error.set(null);
          return this.api.getEvaluationAnalytics(
            this.selectedRange(),
            {
              studentLogin: this.filterStudent() || null,
              evaluatorLogin: this.filterEvaluator() || null,
              projectName: this.filterProject() || null,
            },
            this.selectedGranularity(),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (envelope) => {
          this.data.set(envelope.data);
          this.loading.set(false);
        },
        error: (err: Error) => {
          this.error.set(err?.message ?? 'Failed to load evaluation analytics.');
          this.loading.set(false);
        },
      });

    this.reload$.next();
  }

  protected onRangeChange(range: EvaluationRangeOption): void {
    this.selectedRange.set(range);
    this.reload$.next();
  }

  protected onGranularityChange(g: EvaluationGranularity): void {
    this.selectedGranularity.set(g);
    this.reload$.next();
  }

  protected onStudentFilterInput(value: string): void {
    this.filterStudent.set(value);
    this.filterChange$.next();
  }

  protected onEvaluatorFilterInput(value: string): void {
    this.filterEvaluator.set(value);
    this.filterChange$.next();
  }

  protected onProjectFilterInput(value: string): void {
    this.filterProject.set(value);
    this.filterChange$.next();
  }
}
