import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import type { CampusEvent } from '../../../core/models/api.models';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { formatWarsawTime } from '../../../shared/utils/warsaw-time.util';
import { formatCountdown, formatWarsawDate, isEventLiveNow, isEventToday } from '../upcoming-events.utils';

const REFRESH_TICK_MS = 30_000;
/** Small, fixed palette for theme tags - cycled deterministically by string hash so the same
 * theme name always gets the same color without maintaining an explicit lookup table. */
const THEME_COLORS = ['#4cc9f0', '#ffb020', '#be2ad1', '#38e19a', '#ff5470', '#34e2c4'];

interface EventCard {
  event: CampusEvent;
  isToday: boolean;
  isLive: boolean;
  countdown: string;
  dateLabel: string;
  timeLabel: string;
  participantsLabel: string;
  /** null when the event has no capacity limit - there's nothing to show a bar for. */
  capacityPct: number | null;
}

/**
 * "Upcoming Events" dashboard panel: the next few Warsaw campus events (already sorted/limited
 * server-side, see backend/src/services/events.ts), each with a live countdown, capacity meter,
 * and Today/Live Now badges. Ticks its own clock every REFRESH_TICK_MS so countdowns/badges stay
 * accurate between DashboardStore's 5-minute data refreshes, without needing new data to do so.
 */
@Component({
  selector: 'app-upcoming-events',
  standalone: true,
  imports: [EmptyStateComponent, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="events">
      <header class="events__header">
        <h3 class="events__title">Upcoming Events</h3>
        @if (nextCountdown(); as countdown) {
          <span class="events__countdown-badge">{{ countdown }}</span>
        }
      </header>

      @if (cards().length === 0) {
        <app-empty-state title="No upcoming events" description="New campus events will show up here as soon as they're scheduled." />
      } @else {
        <ol class="events__list">
          @for (card of cards(); track card.event.id) {
            <li class="event-card" [class.event-card--today]="card.isToday" [class.event-card--live]="card.isLive">
              <div class="event-card__top">
                <div class="event-card__badges">
                  @if (card.isLive) {
                    <span class="event-card__badge event-card__badge--live">Live Now</span>
                  } @else if (card.isToday) {
                    <span class="event-card__badge event-card__badge--today">Today</span>
                  }
                  <span class="event-card__kind">{{ card.event.kind }}</span>
                </div>
                <span class="event-card__countdown">{{ card.countdown }}</span>
              </div>

              <h4 class="event-card__name">{{ card.event.name }}</h4>

              @if (card.event.description) {
                <p class="event-card__description">{{ card.event.description }}</p>
              }

              <div class="event-card__meta">
                <span class="event-card__meta-item">
                  <mat-icon aria-hidden="true">event</mat-icon>
                  {{ card.dateLabel }}
                </span>
                <span class="event-card__meta-item">
                  <mat-icon aria-hidden="true">schedule</mat-icon>
                  {{ card.timeLabel }}
                </span>
                @if (card.event.location) {
                  <span class="event-card__meta-item">
                    <mat-icon aria-hidden="true">place</mat-icon>
                    {{ card.event.location }}
                  </span>
                }
              </div>

              @if (card.event.themes.length > 0) {
                <div class="event-card__themes">
                  @for (theme of card.event.themes; track theme) {
                    <span class="event-card__theme" [style.--theme-color]="themeColor(theme)">{{ theme }}</span>
                  }
                </div>
              }

              <div class="event-card__capacity">
                <div class="event-card__capacity-row">
                  <span class="event-card__meta-item">
                    <mat-icon aria-hidden="true">group</mat-icon>
                    {{ card.participantsLabel }}
                  </span>
                  @if (card.event.availableSpots !== null) {
                    <span class="event-card__spots">{{ card.event.availableSpots }} spot{{ card.event.availableSpots === 1 ? '' : 's' }} left</span>
                  }
                </div>
                @if (card.capacityPct !== null) {
                  <div class="event-card__capacity-track" role="progressbar" [attr.aria-valuenow]="card.capacityPct" aria-valuemin="0" aria-valuemax="100">
                    <div class="event-card__capacity-fill" [style.width.%]="card.capacityPct"></div>
                  </div>
                }
              </div>
            </li>
          }
        </ol>
      }
    </div>
  `,
  styles: `
    .events {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      height: 100%;
    }

    .events__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
      flex-wrap: wrap;
    }

    .events__title {
      margin: 0;
      font-size: 1rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-secondary);
    }

    .events__countdown-badge {
      padding: var(--space-1) var(--space-3);
      border-radius: 999px;
      border: 1px solid var(--color-accent);
      background: rgba(52, 226, 196, 0.1);
      color: var(--color-accent);
      font-size: 0.85rem;
      font-weight: 800;
      white-space: nowrap;
    }

    .events__list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--space-4);
    }

    .event-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      border: 1px solid var(--glass-border);
      background: var(--glass-bg-elevated);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      box-shadow: var(--glass-shadow);
      transition: transform 250ms ease, box-shadow 250ms ease, border-color 250ms ease;
      animation: event-card-enter 400ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    .event-card:hover {
      transform: translateY(-3px);
      border-color: var(--color-accent);
      box-shadow: 0 16px 32px -16px var(--color-accent);
    }

    .event-card--today {
      border-color: var(--color-warn);
    }

    .event-card--live {
      border-color: var(--color-danger);
      box-shadow: 0 0 0 1px var(--color-danger), 0 0 28px -8px var(--color-danger);
    }

    @keyframes event-card-enter {
      from {
        opacity: 0;
        transform: translateY(12px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .event-card__top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .event-card__badges {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      flex-wrap: wrap;
    }

    .event-card__badge {
      padding: 2px var(--space-2);
      border-radius: 999px;
      font-size: 0.68rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .event-card__badge--today {
      color: var(--color-warn);
      background: rgba(255, 176, 32, 0.14);
      border: 1px solid var(--color-warn);
    }

    .event-card__badge--live {
      color: #06080a;
      background: var(--color-danger);
      animation: event-live-pulse 2s ease-in-out infinite;
    }

    @keyframes event-live-pulse {
      0%, 100% { box-shadow: 0 0 8px -1px var(--color-danger); }
      50% { box-shadow: 0 0 16px 2px var(--color-danger); }
    }

    .event-card__kind {
      padding: 2px var(--space-2);
      border-radius: 999px;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: capitalize;
      color: var(--color-text-secondary);
      background: var(--color-bg-card);
      border: 1px solid var(--color-border);
    }

    .event-card__countdown {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--color-text-muted);
      white-space: nowrap;
    }

    .event-card__name {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 800;
      color: var(--color-text-primary);
    }

    .event-card__description {
      margin: 0;
      font-size: 0.85rem;
      color: var(--color-text-secondary);
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .event-card__meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
    }

    .event-card__meta-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.8rem;
      color: var(--color-text-secondary);

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--color-text-muted);
      }
    }

    .event-card__themes {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
    }

    .event-card__theme {
      padding: 1px var(--space-2);
      border-radius: 999px;
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--theme-color);
      border: 1px solid var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 14%, transparent);
    }

    .event-card__capacity {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      margin-top: auto;
    }

    .event-card__capacity-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .event-card__spots {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--color-accent);
      white-space: nowrap;
    }

    .event-card__capacity-track {
      height: 6px;
      border-radius: 999px;
      background: var(--color-bg-card);
      overflow: hidden;
    }

    .event-card__capacity-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--color-accent), var(--color-accent-strong));
      transition: width 500ms ease;
    }
  `,
})
export class UpcomingEventsComponent {
  readonly events = input<CampusEvent[]>([]);

  private readonly destroyRef = inject(DestroyRef);
  protected readonly now = signal(new Date());

  constructor() {
    if (typeof window === 'undefined') return;
    const id = window.setInterval(() => this.now.set(new Date()), REFRESH_TICK_MS);
    this.destroyRef.onDestroy(() => window.clearInterval(id));
  }

  protected readonly cards = computed<EventCard[]>(() => {
    const now = this.now();

    return this.events().map((event) => {
      const isLive = isEventLiveNow(event.beginAt, event.endAt, now);
      const capacityPct =
        event.maxParticipants !== null && event.maxParticipants > 0
          ? Math.min(100, Math.round((event.participants / event.maxParticipants) * 100))
          : null;

      return {
        event,
        isToday: isEventToday(event.beginAt, now),
        isLive,
        countdown: isLive ? 'In progress' : formatCountdown(event.beginAt, now),
        dateLabel: formatWarsawDate(event.beginAt),
        timeLabel: `${formatWarsawTime(event.beginAt)} - ${formatWarsawTime(event.endAt)}`,
        participantsLabel:
          event.maxParticipants !== null ? `${event.participants} / ${event.maxParticipants}` : `${event.participants} registered`,
        capacityPct,
      };
    });
  });

  /** Countdown badge for the section header - the very next event's, since the list is already
   * sorted soonest-first. */
  protected readonly nextCountdown = computed(() => this.cards()[0]?.countdown ?? null);

  protected themeColor(theme: string): string {
    let hash = 0;
    for (let i = 0; i < theme.length; i += 1) hash = (hash * 31 + theme.charCodeAt(i)) >>> 0;
    return THEME_COLORS[hash % THEME_COLORS.length]!;
  }
}
