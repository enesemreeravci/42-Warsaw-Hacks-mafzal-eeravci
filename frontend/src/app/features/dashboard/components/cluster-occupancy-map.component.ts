import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ClusterOccupancyResponse, ClusterWorkstation } from '../../../core/models/api.models';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

/** A workstation counts as "occupied a long time" past this many minutes into the session. */
const LONG_SESSION_MINUTES = 120;

type SeatState = 'occupied' | 'long-session' | 'known-empty';

interface SeatView {
  workstation: ClusterWorkstation;
  state: SeatState;
  title: string;
}

function seatView(w: ClusterWorkstation): SeatView {
  if (!w.occupied || !w.student) {
    return { workstation: w, state: 'known-empty', title: `${w.host} — not currently occupied` };
  }
  const state: SeatState = (w.sessionMinutes ?? 0) >= LONG_SESSION_MINUTES ? 'long-session' : 'occupied';
  const mins = w.sessionMinutes ?? 0;
  const sessionLabel = `${Math.floor(mins / 60)}h ${mins % 60}m`;
  const coalition = w.student.coalition ? ` — ${w.student.coalition.name}` : '';
  return { workstation: w, state, title: `${w.host} — ${w.student.login} (Lvl ${w.student.level.toFixed(2)}${coalition}) — ${sessionLabel}` };
}

/**
 * "Interactive Cluster Occupancy Map": every cluster as a card of small workstation squares,
 * built entirely from observed session data (backend/src/services/clusterOccupancy.ts) - the
 * 42 API exposes no hardware/capacity inventory, so there is deliberately no "N of M seats"
 * figure anywhere here, only what was actually seen occupied. For TV mode.
 */
@Component({
  selector: 'app-cluster-occupancy-map',
  standalone: true,
  imports: [EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="occupancy">
      @if (occupancy(); as data) {
        @if (data.clusters.length === 0) {
          <app-empty-state
            title="No cluster activity observed yet"
            description="Workstations appear here once students start campus sessions."
          />
        } @else {
          <div class="occupancy__summary">
            <div class="stat">
              <span class="stat__value">{{ data.summary.studentsOnline }}</span>
              <span class="stat__label">Students Online</span>
            </div>
            <div class="stat">
              <span class="stat__value">{{ data.summary.mostOccupiedCluster ?? '—' }}</span>
              <span class="stat__label">Busiest Cluster</span>
            </div>
            <div class="stat">
              <span class="stat__value">{{ data.summary.mostPopularComputer ?? '—' }}</span>
              <span class="stat__label">Most Popular Seat</span>
            </div>
            <div class="stat">
              <span class="stat__value">{{ formatDuration(data.summary.averageSessionMinutes) }}</span>
              <span class="stat__label">Average Session</span>
            </div>
          </div>

          <div class="occupancy__grid">
            @for (cluster of data.clusters; track cluster.cluster) {
              <div class="cluster-card">
                <div class="cluster-card__header">
                  <span class="cluster-card__name">Cluster {{ cluster.cluster }}</span>
                  <span class="cluster-card__occupancy">{{ cluster.occupiedCount }} / {{ cluster.knownSeatCount }} online</span>
                </div>

                <div class="cluster-card__seats">
                  @for (seat of seatsFor(cluster.cluster); track seat.workstation.host) {
                    <span
                      class="seat"
                      [class.seat--occupied]="seat.state === 'occupied'"
                      [class.seat--long]="seat.state === 'long-session'"
                      [class.seat--empty]="seat.state === 'known-empty'"
                      [title]="seat.title"
                    ></span>
                  }
                </div>

                <div class="cluster-card__footer">
                  <span>Avg <strong>{{ formatDuration(cluster.averageSessionMinutes) }}</strong></span>
                  <span>Longest <strong>{{ formatDuration(cluster.longestSessionMinutes) }}</strong></span>
                  @if (cluster.mostUsedHost) {
                    <span>Top seat <strong>{{ cluster.mostUsedHost }}</strong></span>
                  }
                </div>
              </div>
            }
          </div>

          <p class="occupancy__limitation">{{ data.meta.limitation }}</p>
        }
      } @else {
        <app-empty-state title="Loading cluster occupancy…" />
      }
    </div>
  `,
  styles: `
    .occupancy {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      height: 100%;
      min-height: 60vh;
    }

    .occupancy__summary {
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
      font-variant-numeric: tabular-nums;
    }

    .stat__label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .occupancy__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: var(--space-4);
      overflow-y: auto;
    }

    .cluster-card {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
    }

    .cluster-card__header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }

    .cluster-card__name {
      font-size: 1.15rem;
      font-weight: 800;
    }

    .cluster-card__occupancy {
      font-size: 0.8rem;
      color: var(--color-text-secondary);
      font-variant-numeric: tabular-nums;
    }

    .cluster-card__seats {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .seat {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      background: var(--color-bg-card);
      border: 1px solid var(--color-border);
    }

    @media (prefers-reduced-motion: no-preference) {
      .seat {
        transition: background 300ms ease, border-color 300ms ease;
      }
    }

    .seat--empty {
      background: rgba(255, 255, 255, 0.05);
    }

    .seat--occupied {
      background: var(--color-success);
      border-color: var(--color-success);
      box-shadow: 0 0 6px -1px var(--color-success);
    }

    .seat--long {
      background: var(--color-warn);
      border-color: var(--color-warn);
      box-shadow: 0 0 6px -1px var(--color-warn);
    }

    .cluster-card__footer {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      font-size: 0.72rem;
      color: var(--color-text-muted);
    }

    .cluster-card__footer strong {
      color: var(--color-text-secondary);
    }

    .occupancy__limitation {
      margin: 0;
      font-size: 0.7rem;
      color: var(--color-text-muted);
      text-align: center;
    }

    /* TV mode — bigger cluster cards, seats, and stats so the grid genuinely fills a large
     * screen instead of just technically reaching full container height with small content. */
    :host-context(.dashboard--tv) .stat__value { font-size: 2.4rem; }
    :host-context(.dashboard--tv) .stat__label { font-size: 0.85rem; }
    :host-context(.dashboard--tv) .occupancy__grid { grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--space-5); }
    :host-context(.dashboard--tv) .cluster-card { padding: var(--space-5); gap: var(--space-4); }
    :host-context(.dashboard--tv) .cluster-card__name { font-size: 1.6rem; }
    :host-context(.dashboard--tv) .cluster-card__occupancy { font-size: 1.05rem; }
    :host-context(.dashboard--tv) .cluster-card__footer { font-size: 0.95rem; }
    :host-context(.dashboard--tv) .seat { width: 30px; height: 30px; border-radius: 6px; }
  `,
})
export class ClusterOccupancyMapComponent {
  readonly occupancy = input<ClusterOccupancyResponse | null>(null);

  private readonly seatsByCluster = computed<Map<string, SeatView[]>>(() => {
    const data = this.occupancy();
    const map = new Map<string, SeatView[]>();
    if (!data) return map;
    for (const cluster of data.clusters) {
      map.set(cluster.cluster, cluster.workstations.map(seatView));
    }
    return map;
  });

  protected seatsFor(cluster: string): SeatView[] {
    return this.seatsByCluster().get(cluster) ?? [];
  }

  protected formatDuration(minutes: number): string {
    const safe = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes)) : 0;
    return `${Math.floor(safe / 60)}h ${safe % 60}m`;
  }
}
