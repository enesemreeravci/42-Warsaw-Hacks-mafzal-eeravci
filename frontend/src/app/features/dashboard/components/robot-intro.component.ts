import { ChangeDetectionStrategy, Component, DestroyRef, inject, output, signal } from '@angular/core';
import { Mascot3dComponent } from './mascot-3d.component';

const WELCOME_MESSAGE = `Welcome to 42 Warsaw!

Hello! I'm your tour guide, and I'll walk you through the latest insights and achievements from our campus.

Before we begin, take a moment to appreciate how far you've come. You should be proud of yourself you're one of the few people who accepted the challenge and made it this far.

Now, let's see what I have prepared for you.

Ready? Let's go!`;
const CHAR_INTERVAL_MS = 32;
const HOLD_AFTER_TYPING_MS = 1800;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * TV-mode opener: the 3D mascot "speaks" a welcome message via a letter-by-letter typewriter
 * effect, then emits `introDone` once the text has finished printing and held on screen for a
 * moment. TvModeService gates the rest of the TV rotation (including the Achievement Unlock
 * section) behind this, so nothing else in TV mode renders until this fires.
 */
@Component({
  selector: 'app-robot-intro',
  standalone: true,
  imports: [Mascot3dComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="intro">
      <div class="intro__mascot">
        <app-mascot-3d [heightPx]="360" [showBubble]="false" />
      </div>
      <p class="intro__text" aria-live="polite">
        {{ visibleText() }}<span class="intro__caret" aria-hidden="true"></span>
      </p>
    </div>
  `,
  styles: `
    .intro {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-4);
      height: 100%;
      min-height: 60vh;
      text-align: center;
      padding: var(--space-6);
    }

    .intro__mascot {
      width: min(360px, 70vw);
      height: 300px;
    }

    .intro__text {
      margin: 0;
      max-width: 68ch;
      font-size: 1.3rem;
      font-weight: 600;
      line-height: 1.6;
      color: var(--color-text-primary);
      min-height: 2.4em;
      text-align: center;
      white-space: pre-line;
    }

    .intro__caret {
      display: inline-block;
      width: 0.5ch;
      margin-left: 2px;
      border-right: 2px solid var(--color-accent-strong);
    }

    @media (prefers-reduced-motion: no-preference) {
      .intro__caret {
        animation: intro-caret-blink 900ms steps(1) infinite;
      }
    }

    @keyframes intro-caret-blink {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0; }
    }
  `,
})
export class RobotIntroComponent {
  readonly introDone = output<void>();

  protected readonly visibleText = signal('');

  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    if (prefersReducedMotion()) {
      this.visibleText.set(WELCOME_MESSAGE);
      const timeoutId = setTimeout(() => this.introDone.emit(), HOLD_AFTER_TYPING_MS);
      this.destroyRef.onDestroy(() => clearTimeout(timeoutId));
      return;
    }

    let charIndex = 0;
    const typingInterval = setInterval(() => {
      charIndex += 1;
      this.visibleText.set(WELCOME_MESSAGE.slice(0, charIndex));

      if (charIndex >= WELCOME_MESSAGE.length) {
        clearInterval(typingInterval);
        const holdTimeoutId = setTimeout(() => this.introDone.emit(), HOLD_AFTER_TYPING_MS);
        this.destroyRef.onDestroy(() => clearTimeout(holdTimeoutId));
      }
    }, CHAR_INTERVAL_MS);

    this.destroyRef.onDestroy(() => clearInterval(typingInterval));
  }
}
