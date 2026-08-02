import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { ChartConfiguration } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import type { WeeklyActivityStudent, WeeklyCampusActivityResponse } from '../../../core/models/api.models';
import { ThemeService } from '../../../core/services/theme.service';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { chartSegmentBorderColor } from '../../../shared/utils/chart-theme.util';
import { formatMinutesAsHoursAndMinutes, formatWarsawDateRange, formatWarsawTime } from '../weekly-campus-activity.utils';

export type WeeklyActivityMetric = 'time' | 'sessions' | 'nightOwls' | 'earlyBirds';

/** 'sessions' ranks by session count with time as the secondary stat; every other metric
 * ('time', and the two campus-time-in-a-window variants 'nightOwls'/'earlyBirds') ranks by time
 * on campus with session count as the secondary stat. */
function isTimePrimary(metric: WeeklyActivityMetric): boolean {
  return metric !== 'sessions';
}

function studentsForMetric(activity: WeeklyCampusActivityResponse, metric: WeeklyActivityMetric): WeeklyActivityStudent[] {
  switch (metric) {
    case 'time':
      return activity.mostCampusTime;
    case 'sessions':
      return activity.mostSessionsStarted;
    case 'nightOwls':
      return activity.nightOwls;
    case 'earlyBirds':
      return activity.earlyBirds;
  }
}

interface RankedEntry {
  student: WeeklyActivityStudent;
  rank: number;
  primaryValue: string;
  primaryLabel: string;
  secondaryValue: string;
  secondaryLabel: string;
  averageLabel: string;
  color: string;
}

interface PodiumSlot {
  position: 'gold' | 'silver' | 'bronze';
  label: string;
  avatarSize: number;
  entry: RankedEntry | null;
}

type BoardState = 'loading' | 'error' | 'empty' | 'ready';

/** Top 5 everywhere - dashboard and TV mode alike. */
const VISIBLE_COUNT = 5;
const RANK_COLORS = ['#ffd700', '#b0b8c8', '#cd7f32', '#4cc9f0', '#be2ad1'];

@Component({
  selector: 'app-weekly-campus-activity-board',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent, BaseChartDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="board">
      <header class="board__header">
        <h2 class="board__title">{{ title() }}</h2>
        @if (rangeLabel(); as range) {
          <p class="board__meta">{{ range }} &middot; Last updated {{ lastUpdatedLabel() }}</p>
        }
      </header>

      @if (cacheBanner(); as banner) {
        <p class="board__banner" role="status">{{ banner }}</p>
      }

      @switch (state()) {
        @case ('loading') {
          <app-empty-state title="Calculating this week's campus activity&hellip;" />
        }
        @case ('error') {
          <app-empty-state title="Weekly campus activity is temporarily unavailable." />
        }
        @case ('empty') {
          <app-empty-state title="No valid campus sessions were found for the selected period." />
        }
        @default {
          <div class="board__content">
            <!-- Left: donut chart + campus-wide summary stats -->
            <div class="board__overview">
              <div class="board__chart-wrap">
                <canvas
                  baseChart
                  role="img"
                  aria-label="Share of campus activity among top students"
                  [data]="chartData()"
                  [options]="chartOptions"
                  type="doughnut"
                ></canvas>
                <div class="board__chart-center">
                  <span class="board__chart-total">{{ totalLabel() }}</span>
                  <span class="board__chart-sub">{{ chartSubLabel() }}</span>
                </div>
              </div>

              <div class="board__summary">
                @for (stat of summaryStats(); track stat.label) {
                  <div class="summary-stat">
                    <span class="summary-stat__value">{{ stat.value }}</span>
                    <span class="summary-stat__label">{{ stat.label }}</span>
                  </div>
                }
              </div>
            </div>

            <!-- Right: Top 3 podium -->
            <div class="board__podium">
              @for (slot of podiumSlots(); track slot.position) {
                @if (slot.entry; as entry) {
                  <div
                    class="podium-slot podium-slot--{{ slot.position }}"
                    [style.--rank-color]="entry.color"
                  >
                    <div class="podium-slot__avatar-wrap">
                      <app-avatar
                        [imageUrl]="entry.student.imageUrl"
                        [name]="entry.student.displayName"
                        [size]="slot.avatarSize"
                      />
                      <span class="podium-slot__badge podium-slot__badge--{{ slot.position }}">{{ entry.rank }}</span>
                    </div>
                    <p class="podium-slot__name">{{ entry.student.displayName }}</p>
                    <p class="podium-slot__login">&#64;{{ entry.student.login }}</p>
                    <p class="podium-slot__primary">{{ entry.primaryValue }}</p>
                    <p class="podium-slot__secondary">
                      {{ entry.secondaryValue }}<span class="podium-slot__secondary-label"> {{ entry.secondaryLabel }}</span>
                    </p>
                    <p class="podium-slot__avg">Avg <strong>{{ entry.averageLabel }}</strong></p>
                    <div class="podium-slot__platform">{{ slot.label }}</div>
                  </div>
                }
              }
            </div>
          </div>

          <!-- Ranks 4+ compact list -->
          @if (listEntries().length > 0) {
            <div class="board__rest">
              <div class="board__rest-head">
                <span>Rank</span>
                <span></span>
                <span>Name</span>
                <span>{{ rankedEntries()[0]?.primaryLabel }}</span>
                <span class="board__rest-hide">{{ rankedEntries()[0]?.secondaryLabel }}</span>
                <span class="board__rest-hide">Avg Session</span>
              </div>
              @for (entry of listEntries(); track entry.student.userId) {
                <div class="board__rest-row" [style.--rank-color]="entry.color">
                  <span class="board__rest-rank">{{ entry.rank }}</span>
                  <app-avatar [imageUrl]="entry.student.imageUrl" [name]="entry.student.displayName" [size]="36" />
                  <div class="board__rest-name">
                    <p class="board__rest-display">{{ entry.student.displayName }}</p>
                    <p class="board__rest-login">&#64;{{ entry.student.login }}</p>
                  </div>
                  <span class="board__rest-value board__rest-value--primary">{{ entry.primaryValue }}</span>
                  <span class="board__rest-value board__rest-hide">{{ entry.secondaryValue }}</span>
                  <span class="board__rest-value board__rest-hide">{{ entry.averageLabel }}</span>
                </div>
              }
            </div>
          }
        }
      }
    </div>
  `,
  styles: `
    .board {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      height: 100%;
    }

    .board__header {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    // Matches dashboard.page.scss's shared ".panel h3" heading style (COMPLETION TREND, TOP BY
    // LEVEL, etc.) - this component renders its own title internally instead of via the page's
    // <h3> wrapper (see dashboard.page.html), so it has to replicate that look explicitly rather
    // than inheriting it.
    .board__title {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-secondary);
    }

    .board__meta {
      margin: 0;
      font-size: 0.9rem;
      color: var(--color-text-muted);
    }

    .board__banner {
      margin: 0;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-warn);
      background: rgba(255, 176, 32, 0.08);
      color: var(--color-warn);
      font-size: 0.95rem;
      font-weight: 700;
    }

    /* Main content: overview | podium ───────────────────────────────
     * The chart/donut card and the podium are sized to their own natural content (not stretched
     * into grid tracks that can leave one side of the card looking mostly empty) and laid out as
     * one compact flex group, chart first via the "order" property so it reads as anchored on
     * the left with the ranking on the right - then that whole group is centered as a unit
     * within the card, so left/right outer padding always ends up equal no matter how wide the
     * card itself is. */
    .board__content {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: var(--space-5);
      flex: 1;
    }

    /* Overview: donut chart + summary stats ─────────────────────── */
    .board__overview {
      order: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      align-items: center;
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      border: 1px solid var(--glass-border);
      background: var(--glass-bg-elevated);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      width: 240px;
      flex-shrink: 0;
    }

    .board__chart-wrap {
      position: relative;
      width: 100%;
      max-width: 168px;
      aspect-ratio: 1;
    }

    .board__chart-wrap::before {
      content: '';
      position: absolute;
      inset: 10%;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(52, 226, 196, 0.12), transparent 70%);
      filter: blur(6px);
      z-index: 0;
    }

    .board__chart-wrap canvas {
      position: relative;
      z-index: 1;
    }

    .board__chart-center {
      position: absolute;
      inset: 0;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      text-align: center;
      gap: 2px;
    }

    .board__chart-total {
      font-size: 1.1rem;
      font-weight: 900;
      color: var(--color-text-primary);
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }

    .board__chart-sub {
      font-size: 0.62rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .board__summary {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      width: 100%;
    }

    .summary-stat {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      background: var(--surface-tint-soft);
      border: 1px solid var(--surface-tint-strong);
    }

    .summary-stat__value {
      font-size: 0.98rem;
      font-weight: 800;
      color: var(--color-accent);
      font-variant-numeric: tabular-nums;
    }

    .summary-stat__label {
      font-size: 0.65rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--color-text-muted);
    }

    /* Podium ──────────────────────────────────────────────────────── */
    .board__podium {
      order: 2;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      gap: var(--space-3);
      flex-shrink: 0;
    }

    .podium-slot {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1);
      flex: 1;
      max-width: 200px;
      min-width: 0;
    }

    .podium-slot__avatar-wrap {
      position: relative;
      display: inline-flex;
      margin-bottom: var(--space-1);
    }

    .podium-slot--gold .podium-slot__avatar-wrap {
      filter: drop-shadow(0 0 18px rgba(255, 215, 0, 0.65));
    }

    .podium-slot--silver .podium-slot__avatar-wrap {
      filter: drop-shadow(0 0 10px rgba(176, 184, 200, 0.5));
    }

    .podium-slot--bronze .podium-slot__avatar-wrap {
      filter: drop-shadow(0 0 9px rgba(205, 127, 50, 0.48));
    }

    .podium-slot__badge {
      position: absolute;
      bottom: -5px;
      right: -5px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.76rem;
      font-weight: 900;
      color: #06080a;
      border: 2px solid rgba(6, 8, 10, 0.85);
    }

    .podium-slot__badge--gold   { background: linear-gradient(135deg, #ffe55a, #ffa500); }
    .podium-slot__badge--silver { background: linear-gradient(135deg, #dde3ee, #9ca3af); }
    .podium-slot__badge--bronze { background: linear-gradient(135deg, #e8a05c, #a05a1a); }

    .podium-slot__name {
      margin: 0;
      font-size: 0.9rem;
      font-weight: 800;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    .podium-slot--gold .podium-slot__name {
      font-size: 1.02rem;
    }

    .podium-slot__login {
      margin: 0;
      font-size: 0.7rem;
      color: var(--color-text-muted);
      text-align: center;
    }

    .podium-slot__primary {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 900;
      font-variant-numeric: tabular-nums;
      color: var(--rank-color, var(--color-accent));
      text-align: center;
      line-height: 1;
    }

    .podium-slot--gold .podium-slot__primary {
      font-size: 1.75rem;
    }

    .podium-slot__secondary {
      margin: 0;
      font-size: 0.76rem;
      color: var(--color-text-secondary);
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .podium-slot__secondary-label {
      color: var(--color-text-muted);
    }

    .podium-slot__avg {
      margin: 0;
      font-size: 0.72rem;
      color: var(--color-text-muted);
      text-align: center;
      font-variant-numeric: tabular-nums;
    }

    .podium-slot__avg strong {
      color: var(--color-text-secondary);
      font-weight: 700;
    }

    .podium-slot__platform {
      align-self: stretch;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.62rem;
      font-weight: 900;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgba(6, 8, 10, 0.9);
      border-radius: var(--radius-md) var(--radius-md) 0 0;
      background: linear-gradient(
        180deg,
        var(--rank-color, #888) 0%,
        color-mix(in srgb, var(--rank-color, #888) 60%, #000) 100%
      );
      margin-top: var(--space-2);
    }

    .podium-slot--gold   .podium-slot__platform { height: 64px; }
    .podium-slot--silver .podium-slot__platform { height: 44px; }
    .podium-slot--bronze .podium-slot__platform { height: 30px; }

    /* TV mode — larger platform steps ──────────────────────────── */
    :host-context(.dashboard--tv) .podium-slot--gold   .podium-slot__platform { height: 88px; }
    :host-context(.dashboard--tv) .podium-slot--silver .podium-slot__platform { height: 60px; }
    :host-context(.dashboard--tv) .podium-slot--bronze .podium-slot__platform { height: 40px; }

    /* TV mode — the section's identity ("Most Campus Time" / "Most Recent Session Started") is
     * shown once in the unified TV header bar instead of repeating it on the card. The "last
     * updated"/range meta line stays, since it's live info rather than a redundant label. With
     * the title gone, it's the only text in the header, so it's centered top-middle instead of
     * sitting isolated at the far left edge (also keeps it clear of the floating narrator
     * mascot, which tends to sit around the TV stage's top-right corner). */
    :host-context(.dashboard--tv) .board__title { display: none; }
    :host-context(.dashboard--tv) .board__header { align-items: center; }
    :host-context(.dashboard--tv) .board__meta { text-align: center; }

    :host-context(.dashboard--tv) .board__chart-total   { font-size: 1.7rem; }
    :host-context(.dashboard--tv) .podium-slot__primary { font-size: 1.6rem; }
    :host-context(.dashboard--tv) .podium-slot--gold .podium-slot__primary { font-size: 2rem; }

    /* TV mode — the donut is far too small at the default 168px on a big screen; give it real
     * presence, matching the enlarged podium/avatar sizing around it. The overview card has to
     * widen too, or its own padding would clip the bigger chart back down. (Chart-left/
     * podium-right ordering is now the base layout above, shared by dashboard and TV alike, so
     * no order override is needed here anymore. .board__content centers the chart+podium group
     * as a whole, so widening the chart card alone doesn't unbalance the padding on either side.) */
    :host-context(.dashboard--tv) .board__chart-wrap { max-width: 320px; }
    :host-context(.dashboard--tv) .board__overview { width: 380px; }
    :host-context(.dashboard--tv) .board__content { gap: var(--space-8); }

    /* TV mode — .tv-stage (the full-bleed section wrapper) has zero padding of its own, so
     * without this the donut chart sits flush against the left edge while the podium's rightmost
     * card sits flush against the right edge - visibly unbalanced. Padding the whole board
     * (header + chart/podium row + ranks-4+ list all together, so they stay aligned with each
     * other) gives both edges - and the gap between the chart and the podium above - matching
     * breathing room. */
    :host-context(.dashboard--tv) .board { padding: 0 var(--space-6); }

    /* Ranks 4+ list ─────────────────────────────────────────────── */
    .board__rest {
      border-radius: var(--radius-lg);
      border: 1px solid var(--glass-border);
      background: var(--glass-bg-elevated);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      overflow: hidden;
    }

    /* Fixed-width value columns (not auto) - .board__rest-head and each .board__rest-row are
     * separate grid instances, so "auto" columns size independently per row/header based on
     * their own content (e.g. the header's "CAMPUS TIME" label vs. a row's "10h 5m" value), which
     * leaves the header and the data visibly out of column with each other. Fixed widths make
     * every instance size identically regardless of content, so everything lines up. */
    .board__rest-head,
    .board__rest-row {
      display: grid;
      grid-template-columns: 2.2rem 2.4rem 1fr 6.5rem 5rem 6rem;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-4);
    }

    .board__rest-head {
      font-size: 0.66rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-text-muted);
      border-bottom: 1px solid var(--glass-border);
      padding-top: var(--space-3);
      padding-bottom: var(--space-3);
    }

    .board__rest-row {
      border-left: 3px solid var(--rank-color, transparent);
      transition: background 150ms ease;
    }

    .board__rest-row:not(:last-child) {
      border-bottom: 1px solid var(--surface-tint-mild);
    }

    .board__rest-row:hover {
      background: var(--surface-tint-faint);
    }

    .board__rest-rank {
      font-size: 1.05rem;
      font-weight: 900;
      text-align: center;
      color: var(--rank-color, var(--color-text-muted));
    }

    .board__rest-name {
      min-width: 0;
    }

    .board__rest-display {
      margin: 0;
      font-size: 0.88rem;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .board__rest-login {
      margin: 0;
      font-size: 0.7rem;
      color: var(--color-text-muted);
    }

    .board__rest-value {
      font-size: 0.9rem;
      font-weight: 700;
      text-align: right;
      font-variant-numeric: tabular-nums;
      color: var(--color-text-secondary);
    }

    .board__rest-value--primary {
      color: var(--color-accent);
      font-size: 1rem;
    }

    /* Responsive ──────────────────────────────────────────────────── */
    @media (max-width: 960px) {
      .board__content {
        flex-direction: column;
      }

      .board__overview {
        flex-direction: row;
        align-items: flex-start;
        gap: var(--space-5);
        width: 100%;
      }

      .board__chart-wrap {
        max-width: 120px;
        flex-shrink: 0;
      }

      .board__summary {
        flex: 1;
        flex-direction: row;
        flex-wrap: wrap;
        align-content: flex-start;
      }

      .summary-stat {
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        flex: 1;
        min-width: 80px;
      }
    }

    @media (max-width: 640px) {
      .board__rest-hide {
        display: none;
      }

      .board__rest-head,
      .board__rest-row {
        grid-template-columns: 2.2rem 2.4rem 1fr 6.5rem;
      }
    }
  `,
})
export class WeeklyCampusActivityBoardComponent {
  private readonly theme = inject(ThemeService);

  readonly activity = input<WeeklyCampusActivityResponse | null>(null);
  readonly loadError = input<string | null>(null);
  readonly metric = input.required<WeeklyActivityMetric>();
  readonly title = input.required<string>();

  protected readonly state = computed<BoardState>(() => {
    const activity = this.activity();
    if (!activity) return this.loadError() ? 'error' : 'loading';
    const students = studentsForMetric(activity, this.metric());
    return students.length === 0 ? 'empty' : 'ready';
  });

  protected readonly rangeLabel = computed(() => {
    const period = this.activity()?.period;
    return period ? formatWarsawDateRange(period.start, period.end) : null;
  });

  protected readonly lastUpdatedLabel = computed(() => formatWarsawTime(this.activity()?.meta.lastUpdated));

  protected readonly cacheBanner = computed(() => {
    const activity = this.activity();
    if (!activity || activity.meta.source !== 'cache') return null;
    return `Showing cached data. Last updated: ${this.lastUpdatedLabel()}`;
  });

  protected readonly rankedEntries = computed<RankedEntry[]>(() => {
    const activity = this.activity();
    if (!activity) return [];
    const metric = this.metric();
    const students = studentsForMetric(activity, metric);
    const timePrimary = isTimePrimary(metric);
    return students.slice(0, VISIBLE_COUNT).map((student, index) => ({
      student,
      rank: index + 1,
      primaryValue: timePrimary ? formatMinutesAsHoursAndMinutes(student.totalMinutes) : String(student.sessionCount),
      primaryLabel: timePrimary ? 'Campus time' : 'Sessions started',
      secondaryValue: timePrimary ? String(student.sessionCount) : formatMinutesAsHoursAndMinutes(student.totalMinutes),
      secondaryLabel: timePrimary ? 'sessions' : 'campus time',
      averageLabel: formatMinutesAsHoursAndMinutes(student.averageSessionMinutes),
      color: RANK_COLORS[index] ?? '#888',
    }));
  });

  protected readonly podiumSlots = computed<PodiumSlot[]>(() => {
    const entries = this.rankedEntries();
    return [
      { position: 'silver', label: '2nd', avatarSize: 72, entry: entries[1] ?? null },
      { position: 'gold',   label: '1st', avatarSize: 92, entry: entries[0] ?? null },
      { position: 'bronze', label: '3rd', avatarSize: 62, entry: entries[2] ?? null },
    ];
  });

  protected readonly listEntries = computed(() => this.rankedEntries().slice(3));

  protected readonly totalLabel = computed(() => {
    const entries = this.rankedEntries();
    if (entries.length === 0) return '—';
    if (isTimePrimary(this.metric())) {
      return formatMinutesAsHoursAndMinutes(entries.reduce((s, e) => s + e.student.totalMinutes, 0));
    }
    return String(entries.reduce((s, e) => s + e.student.sessionCount, 0));
  });

  protected readonly summaryStats = computed(() => {
    const activity = this.activity();
    if (!activity) return [];
    const { totalCampusMinutes, totalSessions } = activity.summary;
    const avg = totalSessions > 0 ? totalCampusMinutes / totalSessions : 0;
    return [
      { value: formatMinutesAsHoursAndMinutes(totalCampusMinutes), label: 'All Campus Time' },
      { value: String(totalSessions), label: 'All Sessions' },
      { value: formatMinutesAsHoursAndMinutes(avg), label: 'Avg Session' },
    ];
  });

  protected readonly chartSubLabel = computed(() => {
    switch (this.metric()) {
      case 'time':
        return 'Time';
      case 'sessions':
        return 'Sessions';
      // Night Owls / Early Birds already say so in the panel title above this donut, so the
      // sub-label just needs the unit, not a repeat of which time-of-day window it is.
      case 'nightOwls':
      case 'earlyBirds':
        return 'Hours';
    }
  });

  protected readonly chartData = computed<ChartConfiguration<'doughnut'>['data']>(() => {
    const entries = this.rankedEntries();
    const timePrimary = isTimePrimary(this.metric());
    return {
      labels: entries.map((e) => e.student.displayName),
      datasets: [
        {
          data: entries.map((e) => (timePrimary ? e.student.totalMinutes : e.student.sessionCount)),
          backgroundColor: entries.map((e) => e.color),
          borderColor: chartSegmentBorderColor(this.theme.isLight(), 0.7),
          borderWidth: 2,
          hoverOffset: 8,
        },
      ],
    };
  });

  protected readonly chartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    animation: { duration: 600 },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          // The raw chart value is minutes or a session count, which reads as a meaningless
          // number on its own (e.g. "3,573") - showing the same already-formatted, unit-labeled
          // value used everywhere else on the card ("3h 10m" / "24 Sessions") instead.
          label: (ctx) => {
            const entry = this.rankedEntries()[ctx.dataIndex];
            if (!entry) return '';
            const unit = isTimePrimary(this.metric()) ? '' : ' Sessions';
            return ` ${entry.student.displayName}: ${entry.primaryValue}${unit}`;
          },
        },
      },
    },
  };
}
