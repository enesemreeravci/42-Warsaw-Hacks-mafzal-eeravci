import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type {
  BlackHoleStatusCategory,
  BlackHoleStatusResponse,
  BlackHoleUpcomingEntry,
} from '../../core/models/api.models';
import { ApiService } from '../../core/services/api.service';

const STATUS_CONFIG: Record<
  BlackHoleStatusCategory,
  { label: string; color: string; bg: string }
> = {
  critical:          { label: 'Critical',         color: '#f72585', bg: 'rgba(247,37,133,0.12)' },
  urgent:            { label: 'Urgent',            color: '#ff6b35', bg: 'rgba(255,107,53,0.12)' },
  warning:           { label: 'Warning',           color: '#ffd700', bg: 'rgba(255,215,0,0.10)' },
  upcoming:          { label: 'Upcoming',          color: '#4cc9f0', bg: 'rgba(76,201,240,0.10)' },
  safe:              { label: 'Safe',              color: '#34e2c4', bg: 'rgba(52,226,196,0.10)' },
  recentlyBlackHoled:{ label: 'Recently BH\'d',   color: '#888',    bg: 'rgba(136,136,136,0.10)' },
  historical:        { label: 'Historical',        color: '#666',    bg: 'rgba(100,100,100,0.08)' },
};

@Component({
  selector: 'app-blackhole-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bh-page">
      <h1 class="bh-page__title">Black Hole Status</h1>
      <p class="bh-page__subtitle">Students with an upcoming or recent black hole date on the main cursus.</p>

      @if (loading()) {
        <div class="bh-page__loading" role="status">
          <mat-icon class="spin">autorenew</mat-icon>
          <p>Loading black hole data…</p>
        </div>
      } @else if (error()) {
        <div class="bh-page__error" role="alert">
          <mat-icon>error_outline</mat-icon>
          <span>{{ error() }}</span>
        </div>
      } @else if (data(); as d) {

        <!-- KPI Summary -->
        <div class="kpi-row">
          <div class="kpi-card kpi-card--critical">
            <span class="kpi-card__value">{{ d.summary.criticalCount }}</span>
            <span class="kpi-card__label">Critical (≤3 days)</span>
          </div>
          <div class="kpi-card kpi-card--urgent">
            <span class="kpi-card__value">{{ d.summary.urgentCount }}</span>
            <span class="kpi-card__label">Urgent (4–7 days)</span>
          </div>
          <div class="kpi-card kpi-card--warning">
            <span class="kpi-card__value">{{ d.summary.atRiskIn14Days }}</span>
            <span class="kpi-card__label">At risk (≤14 days)</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-card__value">{{ d.summary.upcomingIn30Days }}</span>
            <span class="kpi-card__label">Upcoming (≤30 days)</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-card__value">{{ d.summary.recentlyBlackHoledCount }}</span>
            <span class="kpi-card__label">Recently BH'd</span>
          </div>
          @if (d.summary.closestBlackHoleDate) {
            <div class="kpi-card kpi-card--date">
              <span class="kpi-card__value kpi-card__value--small">
                {{ d.summary.closestBlackHoleDate | date: 'dd MMM yyyy' : 'Europe/Warsaw' }}
              </span>
              <span class="kpi-card__label">Closest date</span>
            </div>
          }
        </div>

        <div class="bh-grid">

          <!-- Upcoming: Closest to Black Hole -->
          <section class="panel" aria-label="Students closest to black hole">
            <h2 class="panel__title">Closest to Black Hole</h2>
            <p class="panel__subtitle">Sorted by days remaining, ascending. Default window: {{ d.filters.upcomingDays }} days.</p>
            @if (d.upcoming.length === 0) {
              <p class="empty-note">No students with an upcoming black hole date in the next {{ d.filters.upcomingDays }} days.</p>
            } @else {
              <ol class="bh-list">
                @for (entry of d.upcoming; track entry.id; let i = $index) {
                  <li
                    class="bh-entry"
                    [style.--status-color]="statusConfig(entry.status).color"
                    [style.--status-bg]="statusConfig(entry.status).bg"
                  >
                    <div class="bh-entry__badge" [title]="statusConfig(entry.status).label">
                      {{ statusConfig(entry.status).label }}
                    </div>
                    <div class="bh-entry__days">
                      <span class="bh-entry__days-value">{{ entry.daysRemaining }}</span>
                      <span class="bh-entry__days-label">day{{ entry.daysRemaining !== 1 ? 's' : '' }}</span>
                    </div>
                    <div class="bh-entry__info">
                      <span class="bh-entry__name">{{ entry.displayName }}</span>
                      <span class="bh-entry__login">{{ entry.login }} · Level {{ entry.level | number: '1.0-2' }}</span>
                    </div>
                    <div class="bh-entry__date">
                      <span class="bh-entry__date-value">
                        {{ entry.blackholedAt | date: 'dd MMM yyyy' : 'Europe/Warsaw' }}
                      </span>
                    </div>
                  </li>
                }
              </ol>
            }
          </section>

          <!-- Recently Black Holed -->
          <section class="panel" aria-label="Recently black holed students">
            <h2 class="panel__title">Recently Black Holed</h2>
            <p class="panel__subtitle">Students whose black hole date has passed in the last {{ d.filters.recentDays }} days.</p>
            @if (d.recentlyBlackHoled.length === 0) {
              <p class="empty-note">No students were black holed in the last {{ d.filters.recentDays }} days.</p>
            } @else {
              <ol class="bh-list">
                @for (entry of d.recentlyBlackHoled; track entry.id) {
                  <li class="bh-entry bh-entry--recent">
                    <div class="bh-entry__days">
                      <span class="bh-entry__days-value">{{ entry.daysSince }}</span>
                      <span class="bh-entry__days-label">day{{ entry.daysSince !== 1 ? 's' : '' }} ago</span>
                    </div>
                    <div class="bh-entry__info">
                      <span class="bh-entry__name">{{ entry.displayName }}</span>
                      <span class="bh-entry__login">{{ entry.login }} · Level {{ entry.level | number: '1.0-2' }}</span>
                    </div>
                    <div class="bh-entry__date">
                      <span class="bh-entry__date-value">
                        {{ entry.blackholedAt | date: 'dd MMM yyyy' : 'Europe/Warsaw' }}
                      </span>
                    </div>
                  </li>
                }
              </ol>
            }
          </section>

        </div>

        <!-- Footer note -->
        <p class="bh-page__note">
          Data timezone: {{ d.timezone }}. Generated {{ d.generatedAt | date: 'HH:mm dd MMM' : 'Europe/Warsaw' }}.
          Students without a black hole date are not shown ({{ d.excludedCount }} excluded).
        </p>
      }
    </div>
  `,
  styles: `
    .bh-page {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      padding: var(--space-5);
      max-width: 1200px;
      margin: 0 auto;
    }

    .bh-page__title {
      margin: 0;
      font-size: 1.6rem;
      font-weight: 800;
    }

    .bh-page__subtitle {
      margin: calc(var(--space-3) * -1) 0 0;
      font-size: 0.9rem;
      color: var(--color-text-secondary);
    }

    .bh-page__loading {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      color: var(--color-text-secondary);
      padding: var(--space-6);

      p { margin: 0; }
    }

    .bh-page__error {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-4);
      border: 1px solid var(--color-error, #f72585);
      border-radius: var(--radius-md);
      color: var(--color-error, #f72585);
    }

    .bh-page__note {
      margin: 0;
      font-size: 0.78rem;
      color: var(--color-text-muted);
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
      padding: var(--space-4) var(--space-5);
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg);
      min-width: 100px;
      gap: var(--space-1);
      text-align: center;
    }

    .kpi-card--critical { border-color: rgba(247,37,133,0.4); }
    .kpi-card--urgent   { border-color: rgba(255,107,53,0.4); }
    .kpi-card--warning  { border-color: rgba(255,215,0,0.4); }
    .kpi-card--date     { min-width: 140px; }

    .kpi-card__value {
      font-size: 2rem;
      font-weight: 800;
      line-height: 1;
    }

    .kpi-card--critical .kpi-card__value { color: #f72585; }
    .kpi-card--urgent   .kpi-card__value { color: #ff6b35; }
    .kpi-card--warning  .kpi-card__value { color: #ffd700; }

    .kpi-card__value--small { font-size: 1.1rem; }

    .kpi-card__label {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .bh-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-5);
      align-items: start;
    }

    .panel {
      background: var(--glass-bg);
      border: 1px solid var(--glass-border);
      border-radius: var(--radius-lg);
      padding: var(--space-5);
    }

    .panel__title {
      margin: 0 0 var(--space-1);
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-secondary);
    }

    .panel__subtitle {
      margin: 0 0 var(--space-4);
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .empty-note {
      margin: 0;
      color: var(--color-text-muted);
      font-size: 0.9rem;
    }

    .bh-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      max-height: 70vh;
      overflow-y: auto;
    }

    .bh-entry {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3);
      border-radius: var(--radius-md);
      background: var(--status-bg, rgba(255,255,255,0.03));
      border: 1px solid var(--status-color, transparent);
      border-left-width: 4px;
    }

    .bh-entry--recent {
      --status-color: rgba(136,136,136,0.3);
      --status-bg: rgba(136,136,136,0.06);
    }

    .bh-entry__badge {
      padding: 2px var(--space-2);
      border-radius: 999px;
      background: var(--status-color);
      color: #06080a;
      font-size: 0.65rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }

    .bh-entry__days {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 40px;
    }

    .bh-entry__days-value {
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--status-color, var(--color-text-secondary));
      line-height: 1;
    }

    .bh-entry__days-label {
      font-size: 0.65rem;
      color: var(--color-text-muted);
    }

    .bh-entry__info {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .bh-entry__name {
      font-weight: 600;
      font-size: 0.9rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .bh-entry__login {
      font-size: 0.75rem;
      color: var(--color-text-muted);
    }

    .bh-entry__date {
      text-align: right;
    }

    .bh-entry__date-value {
      font-size: 0.8rem;
      color: var(--color-text-secondary);
      white-space: nowrap;
    }

    .spin {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @media (max-width: 900px) {
      .bh-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 600px) {
      .bh-entry {
        grid-template-columns: auto 1fr auto;
      }

      .bh-entry__badge {
        display: none;
      }
    }
  `,
})
export class BlackholePage implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly data = signal<BlackHoleStatusResponse | null>(null);

  protected readonly statusConfig = (status: BlackHoleStatusCategory) =>
    STATUS_CONFIG[status] ?? STATUS_CONFIG['upcoming']!;

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getBlackHoleStatus().subscribe({
      next: (envelope) => {
        this.data.set(envelope.data);
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.error.set(err?.message ?? 'Failed to load black hole status.');
        this.loading.set(false);
      },
    });
  }
}
