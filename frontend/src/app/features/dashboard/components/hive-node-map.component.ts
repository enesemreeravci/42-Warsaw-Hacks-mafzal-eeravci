import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ActiveSessionEntry } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

interface HiveNode {
  entry: ActiveSessionEntry;
  leftPct: number;
  topPct: number;
  sizePx: number;
  floatDelaySec: number;
  floatDurationSec: number;
  glowIntensity: number;
}

/** Deterministic string hash so each login always lands in the same spot on the stage. */
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

function buildNode(entry: ActiveSessionEntry): HiveNode {
  const glowIntensity = Math.min(1, entry.sessionMinutes / 180);
  return {
    entry,
    leftPct: 6 + unitFrom(entry.login, 1) * 88,
    topPct: 10 + unitFrom(entry.login, 2) * 74,
    sizePx: 64 + Math.round(unitFrom(entry.login, 3) * 24),
    floatDelaySec: unitFrom(entry.login, 4) * 4,
    floatDurationSec: 4 + unitFrom(entry.login, 5) * 3,
    glowIntensity: 0.35 + glowIntensity * 0.65,
  };
}

/** "The Hive": full-bleed live map of who's currently on campus, for TV mode. */
@Component({
  selector: 'app-hive-node-map',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="hive">
      <header class="hive__header">
        <span class="hive__dot" aria-hidden="true"></span>
        <h2 class="hive__title">{{ nodes().length }} cadets on campus right now</h2>
      </header>

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
              [style.--float-delay.s]="node.floatDelaySec"
              [style.--float-duration.s]="node.floatDurationSec"
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

    .hive__header {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .hive__dot {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--color-accent-strong);
      box-shadow: 0 0 12px var(--color-accent-glow);
    }

    .hive__title {
      margin: 0;
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: -0.01em;
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
    }

    .hive__label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-text-secondary);
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
    }

    @media (prefers-reduced-motion: no-preference) {
      .hive__node {
        animation: hive-float var(--float-duration, 5s) ease-in-out infinite;
        animation-delay: var(--float-delay, 0s);
      }
    }

    @keyframes hive-float {
      0%, 100% { transform: translate(-50%, -50%) translateY(0); }
      50% { transform: translate(-50%, -50%) translateY(-14px); }
    }
  `,
})
export class HiveNodeMapComponent {
  readonly students = input.required<ActiveSessionEntry[]>();

  protected readonly nodes = computed(() => this.students().map(buildNode));
}
