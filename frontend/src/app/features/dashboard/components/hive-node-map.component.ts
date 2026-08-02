import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ActiveSessionEntry } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

interface HiveNode {
  entry: ActiveSessionEntry;
  leftPct: number;
  topPct: number;
  sizePx: number;
  driftDurationSec: number;
  driftDelaySec: number;
  bobDurationSec: number;
  bobDelaySec: number;
  bobAmplitudePx: number;
  glowIntensity: number;
}

/** Vertical band the lanes are spread across, as a percentage of the stage's height. */
const LANE_START_PCT = 10;
const LANE_SPAN_PCT = 74;
/** Capped rather than one lane per node - with more cadets than lanes, several share a band,
 * relying on jitter plus each node's own drift speed/delay to keep them from lining up. */
const MAX_LANES = 11;

/** Deterministic string hash so each login always lands in the same lane/timing, rather than
 * jumping around every time the "who's active now" list is re-fetched. */
function hash(input: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function unitFrom(input: string, salt: number): number {
  return (hash(input, salt) % 1000) / 1000;
}

/**
 * Assigns each node a vertical "lane" (spread deterministically via a hash-based shuffle, not
 * array order, so it's not correlated with the session-length sort the entries already arrive
 * in) plus a small jitter within that lane - this is what keeps cadets from stacking on top of
 * each other once they're all drifting independently, especially once several end up mid-stage
 * at once.
 */
function buildNodes(students: ActiveSessionEntry[]): HiveNode[] {
  const laneCount = Math.max(1, Math.min(students.length, MAX_LANES));
  const laneHeight = LANE_SPAN_PCT / laneCount;

  const shuffled = [...students].sort((a, b) => unitFrom(a.login, 6) - unitFrom(b.login, 6));

  return shuffled.map((entry, shuffledIndex) => {
    const lane = shuffledIndex % laneCount;
    const jitter = (unitFrom(entry.login, 8) - 0.5) * laneHeight * 0.7;
    const driftDurationSec = 16 + unitFrom(entry.login, 3) * 16; // 16-32s, varying float speeds
    const glowIntensity = Math.min(1, entry.sessionMinutes / 180);

    return {
      entry,
      leftPct: unitFrom(entry.login, 1) * 100, // static resting spot for reduced-motion users
      topPct: LANE_START_PCT + lane * laneHeight + laneHeight / 2 + jitter,
      sizePx: 64 + Math.round(unitFrom(entry.login, 2) * 24),
      driftDurationSec,
      // Negative delay starts each node already partway through its cycle, so the stage looks
      // populated immediately instead of every avatar entering from the left edge in a clump.
      driftDelaySec: -unitFrom(entry.login, 4) * driftDurationSec,
      bobDurationSec: 3 + unitFrom(entry.login, 5) * 3,
      bobDelaySec: -unitFrom(entry.login, 9) * 6,
      bobAmplitudePx: 8 + unitFrom(entry.login, 10) * 10,
      glowIntensity: 0.35 + glowIntensity * 0.65,
    };
  });
}

/** "The Hive": full-bleed live map of who's currently on campus, for TV mode. Cadet avatars
 * drift continuously left-to-right with a gentle vertical bob, fading out at the right edge and
 * back in at the left, rather than sitting at fixed positions. */
@Component({
  selector: 'app-hive-node-map',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="hive">
      @if (nodes().length === 0) {
        <app-empty-state title="No live sessions" description="No students are currently logged in on campus." />
      } @else {
        <div class="hive__stage" role="list" aria-label="Students currently on campus">
          @for (node of nodes(); track node.entry.id) {
            <div
              class="hive__node"
              role="listitem"
              [style.left.%]="node.leftPct"
              [style.top.%]="node.topPct"
              [style.--drift-duration.s]="node.driftDurationSec"
              [style.--drift-delay.s]="node.driftDelaySec"
              [style.--bob-duration.s]="node.bobDurationSec"
              [style.--bob-delay.s]="node.bobDelaySec"
              [style.--bob-amplitude.px]="node.bobAmplitudePx"
              [style.--glow]="node.glowIntensity"
            >
              <app-avatar [imageUrl]="node.entry.imageUrl" [name]="node.entry.displayName" [size]="node.sizePx" />
              <span class="hive__label">{{ node.entry.login }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .hive {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: var(--space-5);
    }

    .hive__stage {
      position: relative;
      flex: 1;
      min-height: 60vh;
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
      background:
        radial-gradient(circle at 20% 20%, rgba(52, 226, 196, 0.08), transparent 40%),
        radial-gradient(circle at 80% 70%, rgba(76, 201, 240, 0.08), transparent 45%),
        var(--color-bg-elevated);
      overflow: hidden;
    }

    .hive__node {
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      transform: translate(-50%, -50%);
      filter: drop-shadow(0 0 calc(var(--glow, 0.5) * 22px) var(--color-accent-glow));
      cursor: default;
    }

    .hive__label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-text-secondary);
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
    }

    @media (prefers-reduced-motion: no-preference) {
      .hive__node {
        /* "left" (drift) and "transform" (bob, layered on top of the -50%/-50% centering so the
           node stays anchored on its point through the whole bob cycle) run independently, so a
           node's horizontal speed and its vertical bob never lock into the same rhythm. */
        animation:
          hive-drift-x var(--drift-duration, 20s) linear var(--drift-delay, 0s) infinite,
          hive-bob-y var(--bob-duration, 4s) ease-in-out var(--bob-delay, 0s) infinite;
      }

      .hive__node:hover {
        animation-play-state: paused;
        z-index: 1;
      }
    }

    @keyframes hive-drift-x {
      0% {
        left: -8%;
        opacity: 0;
      }
      6% {
        opacity: 1;
      }
      94% {
        opacity: 1;
      }
      100% {
        left: 108%;
        opacity: 0;
      }
    }

    @keyframes hive-bob-y {
      0%,
      100% {
        transform: translate(-50%, calc(-50% - var(--bob-amplitude, 12px)));
      }
      50% {
        transform: translate(-50%, calc(-50% + var(--bob-amplitude, 12px)));
      }
    }
  `,
})
export class HiveNodeMapComponent {
  readonly students = input.required<ActiveSessionEntry[]>();

  protected readonly nodes = computed(() => buildNodes(this.students()));
}
