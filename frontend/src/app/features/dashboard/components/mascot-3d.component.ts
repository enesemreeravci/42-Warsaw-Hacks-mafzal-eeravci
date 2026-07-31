import { AfterViewInit, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, input, output, signal, viewChild } from '@angular/core';
import '@splinetool/viewer';

const GREETING = 'Hello! Click me to refresh';
const BUBBLE_REVERT_MS = 2500;
const DEFAULT_SCENE_URL = 'https://prod.spline.design/quDX76eTdC6YCMca/scene.splinecode'; // GENKUBL (updated color variant)


@Component({
  selector: 'app-mascot-3d',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  schemas: [CUSTOM_ELEMENTS_SCHEMA], // required: <spline-viewer> is a custom element Angular doesn't know about
  template: `
    <div
      class="mascot3d"
      [class.mascot3d--mirrored]="mirrored()"
      [style.height.px]="heightPx()"
      role="button"
      tabindex="0"
      aria-label="3D animated mascot - click to say hello and refresh"
      (click)="onInteract()"
      (keydown.enter)="onInteract()"
      (keydown.space)="onInteract(); $event.preventDefault()"
    >
      <spline-viewer #viewer [url]="sceneUrl()" background="transparent" loading-anim-type="spinner-small-light"></spline-viewer>

      <div class="mascot3d__bubble" [class.mascot3d__bubble--pop]="bubblePop()" aria-live="polite">{{ bubbleText() }}</div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    .mascot3d {
      position: relative;
      width: 100%;
      height: 100%;
      cursor: pointer;
      background: transparent;
    }

    .mascot3d:focus-visible {
      outline: 3px solid var(--color-accent);
      outline-offset: -3px;
    }

    spline-viewer {
      display: block;
      width: 100%;
      height: 100%;
    }

    .mascot3d--mirrored spline-viewer {
      transform: scaleX(-1);
    }

    .mascot3d__bubble {
      position: absolute;
      top: var(--space-3);
      left: 50%;
      transform: translateX(-50%);
      padding: var(--space-1) var(--space-3);
      border-radius: 999px;
      background: var(--color-bg-card);
      border: 1px solid var(--color-border-strong);
      font-size: 0.82rem;
      font-weight: 600;
      color: var(--color-text-primary);
      white-space: nowrap;
      max-width: calc(100% - var(--space-5));
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
      z-index: 1;
    }

    .mascot3d__bubble::after {
      content: '';
      position: absolute;
      bottom: -5px;
      left: 50%;
      transform: translateX(-50%) rotate(45deg);
      width: 8px;
      height: 8px;
      background: inherit;
      border-right: 1px solid var(--color-border-strong);
      border-bottom: 1px solid var(--color-border-strong);
    }

    .mascot3d__bubble--pop {
      animation: mascot3d-pop 0.4s ease-out;
    }

    @keyframes mascot3d-pop {
      0% {
        transform: translateX(-50%) scale(0.85);
        opacity: 0.4;
      }
      60% {
        transform: translateX(-50%) scale(1.05);
      }
      100% {
        transform: translateX(-50%) scale(1);
      }
    }
  `,
})
export class Mascot3dComponent implements AfterViewInit, OnDestroy {
  /** Flip this to true while a dashboard refresh is in flight to make the mascot react and the
   * bubble switch to a "working" message, instead of relying on clicks alone. */
  readonly refreshing = input<boolean>(false);
  readonly heightPx = input<number>(320);
  /** URL of a `.splinecode` scene exported from the Spline editor. Defaults to GENKUBL. */
  readonly sceneUrl = input<string>(DEFAULT_SCENE_URL);
  /**
   * Optional: the object name (from the Spline editor's Events panel) to fire an interaction
   * event on when `refreshing` goes true or the mascot is clicked - lets a refresh trigger
   * whatever animation/state you've wired up in the scene itself, the same way clicking an
   * object with a "Mouse Down" event configured in Spline would. Leave unset to skip this and
   * rely solely on the scene's own built-in pointer interactions (clicking the canvas already
   * reaches them natively - no wiring needed for that part).
   */
  readonly triggerObjectName = input<string | null>(null);
  /** Event name to emit on `triggerObjectName`, matching whatever trigger you set up in Spline's Events panel. */
  readonly triggerEventName = input<string>('mouseDown');
  /** Optional external narration text (e.g. a rotating cue from a caller like
   * NarratorRobotComponent) - overrides the default greeting whenever set, and is what the
   * bubble reverts to after a transient "Hello!"/"Syncing…" message instead of the greeting. */
  readonly message = input<string | null>(null);
  /** Mirrors just the 3D viewer (not the speech bubble text) horizontally, so the mascot appears
   * to gaze inward/left when it's perched at a target's top-right corner. */
  readonly mirrored = input<boolean>(false);

  readonly refresh = output<void>();

  protected readonly bubbleText = signal(GREETING);
  protected readonly bubblePop = signal(false);

  private readonly viewerRef = viewChild<ElementRef<HTMLElement>>('viewer');

  private bubbleRevertTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private bubblePopTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private wasRefreshing = false;
  private brandingObserver: MutationObserver | null = null;

  constructor() {
    effect(() => {
      const isRefreshing = this.refreshing();
      if (isRefreshing) {
        this.announce('Syncing campus stats…', { revert: false });
        this.tryEmitSplineEvent();
      } else if (this.wasRefreshing) {
        this.announce('All caught up!', { revert: true });
      }
      this.wasRefreshing = isRefreshing;
    });

    effect(() => {
      const msg = this.message();
      if (msg !== null) {
        this.announce(msg, { revert: false });
      }
    });
  }

  ngAfterViewInit(): void {
    const viewerEl = this.viewerRef()?.nativeElement;
    if (!viewerEl) return;

    // Attempt immediate application in case the shadow DOM is already populated.
    this.hideSplineBranding();

    // @splinetool/viewer has no 'load' event - it dispatches 'load-start' then 'load-complete'
    // once the scene has fetched and its shadow DOM (incl. #logo) is populated. It also fires
    // again on scene reloads (e.g. the `sceneUrl` input changing), so this stays subscribed
    // rather than using `{ once: true }`.
    viewerEl.addEventListener('load-complete', () => this.hideSplineBranding());
  }

  ngOnDestroy(): void {
    if (this.bubbleRevertTimeoutId !== null) clearTimeout(this.bubbleRevertTimeoutId);
    if (this.bubblePopTimeoutId !== null) clearTimeout(this.bubblePopTimeoutId);
    this.brandingObserver?.disconnect();
  }

  protected onInteract(): void {
    this.announce('Hello! 👋', { revert: true });
    this.tryEmitSplineEvent();
    this.refresh.emit();
  }

  private announce(text: string, options: { revert: boolean }): void {
    this.bubbleText.set(text);
    this.bubblePop.set(false);
    if (this.bubblePopTimeoutId !== null) clearTimeout(this.bubblePopTimeoutId);
    // Re-trigger the pop animation even if the class was already applied last tick.
    requestAnimationFrame(() => this.bubblePop.set(true));
    this.bubblePopTimeoutId = setTimeout(() => this.bubblePop.set(false), 400);

    if (this.bubbleRevertTimeoutId !== null) clearTimeout(this.bubbleRevertTimeoutId);
    if (options.revert) {
      this.bubbleRevertTimeoutId = setTimeout(() => this.announce(this.message() ?? GREETING, { revert: false }), BUBBLE_REVERT_MS);
    }
  }

  /**
   * Best-effort only. `@splinetool/viewer`'s public API (the `url`/`background`/... properties
   * documented in its .d.ts) has no supported way to trigger a named scene event - the
   * `Application` instance that exposes `emitEvent()` is only reachable via an internal,
   * undocumented `_spline` field. This reads it defensively so a future viewer version
   * changing that internal shape degrades silently instead of breaking the dashboard.
   */
  private tryEmitSplineEvent(): void {
    const objectName = this.triggerObjectName();
    if (!objectName) return;

    try {
      const viewer = this.viewerRef()?.nativeElement as unknown as
        | { _spline?: { emitEvent?: (eventName: string, target: string) => void } }
        | undefined;
      viewer?._spline?.emitEvent?.(this.triggerEventName(), objectName);
    } catch {
      // Unsupported internal API - never let this break the rest of the dashboard.
    }
  }

  private hideSplineBranding(): void {
    const viewer = this.viewerRef()?.nativeElement;
    const shadowRoot = viewer?.shadowRoot;
    if (!shadowRoot) {
      return;
    }

    const HIDDEN_STYLE = 'display: none !important;';

    // Guard is required, not cosmetic: this observer watches the `style` attribute (see below),
    // and setAttribute() fires a mutation record even when the value is unchanged. Without the
    // pre-check, applyHide()'s own write would re-trigger the observer, which calls applyHide()
    // again, forever - a synchronous microtask loop that never yields back to the event loop
    // (freezes the whole tab, no exception, confirmed live). Skipping the write when the style
    // already matches breaks that cycle while still reacting to Spline re-showing the logo.
    const applyHide = () => {
      const logo = shadowRoot.querySelector<HTMLElement>('#logo');
      if (logo && logo.getAttribute('style') !== HIDDEN_STYLE) {
        logo.setAttribute('style', HIDDEN_STYLE);
      }
    };

    applyHide();

    if (this.brandingObserver !== null) {
      return;
    }

    // `childList` alone misses this: Spline's `onLoaded()` handler shows the logo by setting
    // `_logo.style.display = "flex"` directly on the existing node, which is a style/attribute
    // mutation, not a node addition/removal. `attributes` is required to catch and re-hide it.
    this.brandingObserver = new MutationObserver(() => applyHide());
    this.brandingObserver.observe(shadowRoot, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    });
  }
}
