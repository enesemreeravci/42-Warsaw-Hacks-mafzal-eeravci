import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core';
import { Mascot3dComponent } from './mascot-3d.component';
import { NarratorTargetRegistry } from '../narrator-target-registry.service';

/** One thing the narrator can be "saying" - which panel it's about (`id`, matched against an
 * `appNarratorTarget` directive elsewhere in the page to find that panel's real position) and
 * the accent color shared by its glow shadow and the caller's highlight ring. */
export interface NarratorCue {
  id: string;
  text: string;
  color: string;
}

const ROBOT_WIDTH = 150;
const ROBOT_HEIGHT = 120;
const EDGE_MARGIN = 8;

/**
 * Floating, boxless 3D mascot: no card, background, or speech bubble wraps it, it just floats
 * over whichever panel is currently active, perched at that panel's real top-right corner (read
 * from `NarratorTargetRegistry`, populated by `appNarratorTarget` directives elsewhere on the
 * page - this component never guesses a fixed screen position). Always faces left (its natural,
 * unmirrored orientation - toward whatever it's perched beside) regardless of which panel it's
 * tracking. Smooth-scrolls the active panel into view whenever the cue changes, and keeps
 * tracking the corner in real time while that scroll (or a window resize) is in flight. There is
 * exactly one instance of this on the page at any time (mounted once outside the
 * TV-mode/main-dashboard branch in dashboard.page.html) so the mascot is never duplicated per
 * panel or per TV slide.
 */
@Component({
  selector: 'app-narrator-robot',
  standalone: true,
  imports: [Mascot3dComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cue(); as active) {
      <div
        class="narrator"
        [class.narrator--visible]="position() !== null"
        [style.top.px]="position()?.top ?? 0"
        [style.left.px]="position()?.left ?? 0"
        [style.--narrator-color]="active.color"
      >
        <div class="narrator__figure">
          <app-mascot-3d
            [message]="active.text"
            [refreshing]="refreshing()"
            [heightPx]="ROBOT_HEIGHT"
            [mirrored]="false"
            [showBubble]="false"
            (refresh)="refresh.emit()"
          />
        </div>
        <div class="narrator__shadow" aria-hidden="true">42</div>
      </div>
    }
  `,
  styles: `
    .narrator {
      position: fixed;
      width: 150px;
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 500;
      opacity: 0;
      pointer-events: none;
      transition:
        top 700ms cubic-bezier(0.2, 0.8, 0.2, 1),
        left 700ms cubic-bezier(0.2, 0.8, 0.2, 1),
        opacity 300ms ease;
    }

    .narrator--visible {
      opacity: 1;
      pointer-events: auto;
    }

    .narrator__figure {
      width: 100%;
      height: 120px;
      filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.5));
    }

    .narrator__shadow {
      margin-top: -8px;
      font-size: 1.7rem;
      font-weight: 900;
      line-height: 1;
      color: var(--narrator-color, #34e2c4);
      opacity: 0.4;
      filter: blur(2px);
      text-shadow: 0 0 16px var(--narrator-color, #34e2c4), 0 0 36px var(--narrator-color, #34e2c4);
      user-select: none;
      pointer-events: none;
      transition: color 500ms ease;
    }

    @media (max-width: 900px) {
      .narrator {
        display: none;
      }
    }
  `,
})
export class NarratorRobotComponent {
  readonly cue = input<NarratorCue | null>(null);
  readonly refreshing = input<boolean>(false);
  readonly refresh = output<void>();

  protected readonly ROBOT_HEIGHT = ROBOT_HEIGHT;

  private readonly registry = inject(NarratorTargetRegistry);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly position = signal<{ top: number; left: number } | null>(null);

  constructor() {
    effect(() => {
      const cue = this.cue();
      if (!cue) {
        this.position.set(null);
        return;
      }
      this.focusTarget(cue.id);
    });

    const recompute = (): void => {
      const id = this.cue()?.id;
      if (id) this.positionAt(id);
    };
    const onScrollOrResize = () => requestAnimationFrame(recompute);
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    });
  }

  /** Scrolls the newly active target into view and starts tracking its corner. If the target
   * hasn't registered itself yet (a startup ordering race with `appNarratorTarget`), retries on
   * the next frame instead of leaving the robot stuck with no position. */
  private focusTarget(id: string): void {
    const target = this.registry.element(id);
    if (!target) {
      requestAnimationFrame(() => {
        if (this.cue()?.id === id) this.focusTarget(id);
      });
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    this.positionAt(id);
  }

  private positionAt(id: string): void {
    const target = this.registry.element(id);
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const top = Math.max(EDGE_MARGIN, rect.top - ROBOT_HEIGHT * 0.5);
    const maxLeft = window.innerWidth - ROBOT_WIDTH - EDGE_MARGIN;
    const left = Math.min(Math.max(EDGE_MARGIN, rect.right - ROBOT_WIDTH * 0.5), maxLeft);
    this.position.set({ top, left });
  }
}
