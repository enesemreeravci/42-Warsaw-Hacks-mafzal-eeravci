import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal } from '@angular/core';
import type { AchievementEntry } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';

const DISPLAY_MS = 5000;
const CONFETTI_COUNT = 36;
const CONFETTI_COLORS = ['#34e2c4', '#ffb020', '#4cc9f0', '#38e19a', '#ff5470'];

interface ConfettiPiece {
  leftPct: number;
  delaySec: number;
  durationSec: number;
  color: string;
}

/**
 * Full-screen "ACHIEVEMENT UNLOCKED" takeover, mounted once at the app shell so it can
 * interrupt whichever TV mode is currently on screen. Watches the live achievement feed
 * for entries flagged `isTakeover` (final mark >= 100) that haven't been shown yet, queues
 * them, and auto-dismisses after a few seconds.
 *
 * This component isn't created until `tvMode.introComplete()` (see app.html), so it always
 * mounts right as the robot's welcome message finishes. Without seeding `seenIds` at
 * construction, every achievement already sitting in the feed at that instant would look
 * "fresh" and fire immediately - a wall of takeovers right on the heels of the welcome message.
 * Seeding means only achievements that arrive *after* this component is already mounted ever
 * trigger the celebration.
 */
@Component({
  selector: 'app-achievement-takeover-overlay',
  standalone: true,
  imports: [AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (current(); as item) {
      <div class="takeover" role="alert" aria-live="assertive">
        <div class="takeover__confetti" aria-hidden="true">
          @for (piece of confettiPieces; track $index) {
            <span
              class="confetti-piece"
              [style.left.%]="piece.leftPct"
              [style.background]="piece.color"
              [style.--delay.s]="piece.delaySec"
              [style.--duration.s]="piece.durationSec"
            ></span>
          }
        </div>

        <div class="takeover__content">
          <p class="takeover__eyebrow">Achievement unlocked</p>
          <app-avatar [imageUrl]="item.imageUrl" [name]="item.displayName" [size]="160" />
          <h2 class="takeover__name">{{ item.displayName }}</h2>
          <p class="takeover__project">{{ item.projectName }}</p>
          <p class="takeover__score">{{ item.finalMark }}<span>/100</span></p>
        </div>
      </div>
    }
  `,
  styles: `
    .takeover {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at center, rgba(13, 23, 32, 0.97), rgba(6, 8, 10, 0.99));
      overflow: hidden;
    }

    @media (prefers-reduced-motion: no-preference) {
      .takeover {
        animation: takeover-fade-in 300ms ease-out;
      }
    }

    @keyframes takeover-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .takeover__content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      text-align: center;
    }

    .takeover__eyebrow {
      margin: 0 0 var(--space-3);
      font-size: 1.4rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--color-warn);
      text-shadow: 0 0 24px rgba(255, 176, 32, 0.6);
    }

    .takeover__name {
      margin: var(--space-3) 0 0;
      font-size: 3rem;
      font-weight: 800;
    }

    .takeover__project {
      margin: 0;
      font-size: 1.6rem;
      color: var(--color-text-secondary);
    }

    .takeover__score {
      margin: var(--space-3) 0 0;
      font-size: 5rem;
      font-weight: 900;
      color: var(--color-warn);
      text-shadow: 0 0 40px rgba(255, 176, 32, 0.7);

      span {
        font-size: 2rem;
        color: var(--color-text-muted);
      }
    }

    .takeover__confetti {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .confetti-piece {
      position: absolute;
      top: -5%;
      width: 10px;
      height: 16px;
      opacity: 0.9;
      border-radius: 2px;
    }

    @media (prefers-reduced-motion: no-preference) {
      .confetti-piece {
        animation: confetti-fall var(--duration, 3s) linear var(--delay, 0s) infinite;
      }
    }

    @keyframes confetti-fall {
      0% { transform: translateY(0) rotate(0deg); opacity: 0.9; }
      100% { transform: translateY(110vh) rotate(540deg); opacity: 0.2; }
    }
  `,
})
export class AchievementTakeoverOverlayComponent {
  readonly achievements = input.required<AchievementEntry[]>();

  protected readonly current = signal<AchievementEntry | null>(null);
  protected readonly confettiPieces: ConfettiPiece[] = Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    leftPct: (i * 37) % 100,
    delaySec: (i % 9) * 0.2,
    durationSec: 2.4 + (i % 5) * 0.35,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
  }));

  private readonly destroyRef = inject(DestroyRef);
  private readonly seenIds = new Set<number>();
  private queue: AchievementEntry[] = [];
  private dismissTimeout: ReturnType<typeof setTimeout> | null = null;
  /** Signal inputs aren't readable in the constructor, so the "seed seenIds, don't celebrate
   * anything already present" step (see the class doc comment above) happens on the effect's
   * own first run instead - the earliest point `achievements()` is guaranteed to have a value. */
  private isFirstEffectRun = true;

  constructor() {
    effect(() => {
      const list = this.achievements();

      if (this.isFirstEffectRun) {
        this.isFirstEffectRun = false;
        for (const a of list) {
          if (a.isTakeover) this.seenIds.add(a.projectUserId);
        }
        return;
      }

      const fresh = list.filter((a) => a.isTakeover && !this.seenIds.has(a.projectUserId));
      if (fresh.length === 0) return;

      fresh.forEach((a) => this.seenIds.add(a.projectUserId));
      this.queue.push(...fresh);
      this.showNextIfIdle();
    });

    this.destroyRef.onDestroy(() => {
      if (this.dismissTimeout) clearTimeout(this.dismissTimeout);
    });
  }

  private showNextIfIdle(): void {
    if (this.current() !== null) return;
    const next = this.queue.shift();
    if (!next) return;

    this.current.set(next);
    this.dismissTimeout = setTimeout(() => {
      this.current.set(null);
      this.showNextIfIdle();
    }, DISPLAY_MS);
  }
}
