import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { DashboardStore } from '../../../core/services/dashboard-store.service';

type AssistantTab = 'campus' | 'events' | 'transcendence' | 'congratulate';

interface FxParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  rotation: number;
  rotationSpeed: number;
  shape: 'circle' | 'rect';
}

const FX_COLORS = ['#34e2c4', '#16f0a6', '#4cc9f0', '#ffb020', '#ff5470'];
const WELCOME_MESSAGE =
  "Hello! I'm your 42 Warsaw assistant, here to guide you through campus life and common events. Tap a button below to get started.";

/**
 * Floating, self-contained campus guide. Injects DashboardStore directly so it can be
 * dropped anywhere in the template with no bindings. Celebration effects use a small
 * hand-rolled canvas particle engine (no confetti/lottie dependency) so the bundle stays lean.
 */
@Component({
  selector: 'app-assistant-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <canvas #fx class="assistant-fx" aria-hidden="true"></canvas>

    <div class="assistant-widget">
      @if (expanded()) {
        <div class="assistant-panel" role="dialog" aria-label="42 Warsaw assistant">
          <div class="assistant-panel__header">
            <span class="assistant-panel__title">42 Warsaw Assistant</span>
            <button type="button" class="assistant-panel__close" (click)="toggleOpen()" aria-label="Close assistant">✕</button>
          </div>

          <div class="assistant-bubble" aria-live="polite">{{ message() }}</div>

          <div class="assistant-actions">
            <button type="button" [class.is-active]="activeTab() === 'campus'" (click)="showCampusInfo()">Campus Info</button>
            <button type="button" [class.is-active]="activeTab() === 'transcendence'" (click)="showTranscendenceHallOfFame()">
              Transcendence Hall of Fame
            </button>
            <button type="button" [class.is-active]="activeTab() === 'events'" (click)="showCurrentEvents()">Current Events</button>
            <button type="button" [class.is-active]="activeTab() === 'congratulate'" (click)="congratulatePeer()">
              Congratulate Peer
            </button>
          </div>
        </div>
      }

      <button
        type="button"
        class="assistant-toggle"
        [class.assistant-toggle--active]="expanded()"
        (click)="toggleOpen()"
        [attr.aria-expanded]="expanded()"
        [attr.aria-label]="expanded() ? 'Close 42 Warsaw assistant' : 'Open 42 Warsaw assistant'"
      >
        <span class="assistant-toggle__pulse" aria-hidden="true"></span>
        <svg class="assistant-avatar" viewBox="0 0 24 24" aria-hidden="true">
          <defs>
            <linearGradient id="assistantChatGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#4cc9f0" />
              <stop offset="55%" stop-color="#34e2c4" />
              <stop offset="100%" stop-color="#16f0a6" />
            </linearGradient>
          </defs>

          <path
            d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8A2.5 2.5 0 0 1 17.5 16H10l-4.2 3.8a.5.5 0 0 1-.8-.37V16h-.5A2.5 2.5 0 0 1 2 13.5v-8A2.5 2.5 0 0 1 4 5.5Z"
            fill="url(#assistantChatGradient)"
          />
          <circle class="assistant-eye" cx="9" cy="10" r="1.15" fill="#06080a" />
          <circle class="assistant-eye" cx="13.5" cy="10" r="1.15" fill="#06080a" />
        </svg>
      </button>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      right: var(--space-5);
      bottom: var(--space-5);
      z-index: 1000;
    }

    .assistant-fx {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 1200;
      display: none;
    }

    .assistant-widget {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: var(--space-3);
    }

    .assistant-toggle {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 68px;
      height: 68px;
      border-radius: 50%;
      border: 1px solid var(--color-border-strong);
      background: var(--color-bg-card);
      box-shadow: var(--shadow-card);
      cursor: pointer;
      padding: 0;
    }

    .assistant-toggle--active {
      border-color: var(--color-accent-strong);
    }

    .assistant-toggle__pulse {
      position: absolute;
      inset: -6px;
      border-radius: 50%;
      background: radial-gradient(circle, var(--color-accent-glow) 0%, transparent 70%);
      animation: assistant-pulse 3.2s ease-in-out infinite;
    }

    .assistant-avatar {
      position: relative;
      width: 42px;
      height: auto;
      filter: drop-shadow(0 4px 10px rgba(52, 226, 196, 0.35));
    }

    .assistant-eye {
      animation: assistant-blink 5s ease-in-out infinite;
    }

    .assistant-panel {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: min(340px, 84vw);
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      background: var(--color-bg-card);
      border: 1px solid var(--color-border);
      box-shadow: var(--shadow-card);
    }

    .assistant-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .assistant-panel__title {
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-secondary);
    }

    .assistant-panel__close {
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      cursor: pointer;
      font-size: 0.9rem;
      line-height: 1;
      padding: var(--space-1);
    }

    .assistant-panel__close:hover {
      color: var(--color-text-primary);
    }

    .assistant-bubble {
      position: relative;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      background: var(--color-bg-elevated);
      border: 1px solid var(--color-border-strong);
      font-size: 0.88rem;
      line-height: 1.45;
      color: var(--color-text-primary);
    }

    .assistant-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-2);
    }

    .assistant-actions button {
      padding: var(--space-2) var(--space-2);
      border-radius: var(--radius-sm);
      border: 1px solid var(--color-border-strong);
      background: var(--color-bg-elevated);
      color: var(--color-text-primary);
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      transition: border-color var(--transition-standard), color var(--transition-standard);
    }

    .assistant-actions button:hover {
      border-color: var(--color-accent);
    }

    .assistant-actions button.is-active {
      border-color: var(--color-accent-strong);
      color: var(--color-accent-strong);
    }

    @keyframes assistant-pulse {
      0%, 100% { opacity: 0.5; transform: scale(1); }
      50% { opacity: 0.9; transform: scale(1.12); }
    }

    @keyframes assistant-blink {
      0%, 90%, 100% { transform: scaleY(1); }
      95% { transform: scaleY(0.1); }
    }

    @media (max-width: 640px) {
      :host {
        right: var(--space-3);
        bottom: var(--space-3);
      }
    }
  `,
})
export class AssistantWidgetComponent {
  private readonly store = inject(DashboardStore);
  private readonly destroyRef = inject(DestroyRef);

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('fx');

  protected readonly expanded = signal(false);
  protected readonly message = signal(WELCOME_MESSAGE);
  protected readonly activeTab = signal<AssistantTab | null>(null);

  private readonly totalStudents = computed(() => this.store.data().summary?.totalStudents ?? 0);
  private readonly activeStudents = computed(() => this.store.data().summary?.activeStudents ?? 0);
  private readonly activeNow = computed(() => this.store.data().livePulse?.activeNow.length ?? 0);
  private readonly evaluationCount = computed(() => this.store.data().evaluations.length);
  private readonly blackHoleWatchCount = computed(() => this.store.data().livePulse?.blackHoleWatch.length ?? 0);

  private readonly transcendenceGraduates = computed(() =>
    this.store.data().recentCompletions.filter((c) => c.validated && /transcendence/i.test(c.projectName)),
  );
  private readonly transcendenceProject = computed(
    () => this.store.data().topProjects.find((p) => /transcendence/i.test(p.projectName)) ?? null,
  );

  private particles: FxParticle[] = [];
  private pendingBursts = 0;
  private rafId: number | null = null;
  private readonly reducedMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    });
  }

  protected toggleOpen(): void {
    this.expanded.update((v) => !v);
  }

  protected showCampusInfo(): void {
    this.activeTab.set('campus');
    this.message.set(
      `42 Warsaw runs out of SPARK: 2000+ m² of space, 150+ workstations, and 24/7 open access — a completely ` +
        `tuition-free, peer-to-peer coding academy. Right now the community has ${this.totalStudents()} students, ` +
        `${this.activeStudents()} active in Common Core, and ${this.evaluationCount()} peer evaluations on record.`,
    );
  }

  protected showCurrentEvents(): void {
    this.activeTab.set('events');
    this.message.set(
      `Live campus pulse: ${this.activeNow()} students on campus right now, ${this.evaluationCount()} peer ` +
        `evaluations tracked recently, and ${this.blackHoleWatchCount()} on black-hole watch. The Hive never sleeps!`,
    );
  }

  protected showTranscendenceHallOfFame(): void {
    this.activeTab.set('transcendence');
    const graduates = this.transcendenceGraduates();

    if (graduates.length > 0) {
      const names = graduates.slice(0, 5).map((g) => g.displayName).join(', ');
      this.message.set(
        `🎆 Hall of Fame! ${names} just conquered ft_transcendence — the final Common Core boss. Massive respect!`,
      );
      this.celebrate('fireworks');
      return;
    }

    const project = this.transcendenceProject();
    this.message.set(
      project
        ? `No ft_transcendence completions in the current window, but ${project.completionCount} students have ` +
            `finished it overall with a ${Math.round(project.successRate * 100)}% success rate. You could be next!`
        : `No ft_transcendence completions yet in this window — it's the final Common Core boss fight. Someone's ` +
            `going to make history soon!`,
    );
  }

  protected congratulatePeer(): void {
    this.activeTab.set('congratulate');
    const pool = this.store.data().recentCompletions.filter((c) => c.validated);

    if (pool.length === 0) {
      this.message.set('No recent completions to celebrate just yet — check back soon!');
      return;
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    this.message.set(`🎉 Congrats to ${pick.displayName} for completing ${pick.projectName}! Well earned.`);
    this.celebrate('confetti');
  }

  private celebrate(kind: 'confetti' | 'fireworks'): void {
    if (this.reducedMotion) return; // message alone is enough when motion is disabled

    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';

    if (kind === 'confetti') {
      this.spawnConfetti(canvas.width);
    } else {
      this.spawnFireworkBursts(canvas.width, canvas.height);
    }

    if (this.rafId === null) {
      this.runLoop(canvas);
    }
  }

  private spawnConfetti(width: number): void {
    for (let i = 0; i < 140; i++) {
      this.particles.push({
        x: Math.random() * width,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 3,
        life: 0,
        maxLife: 140 + Math.random() * 60,
        color: FX_COLORS[Math.floor(Math.random() * FX_COLORS.length)],
        size: 6 + Math.random() * 6,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.3,
        shape: 'rect',
      });
    }
  }

  private spawnFireworkBursts(width: number, height: number): void {
    const bursts = 5;
    this.pendingBursts += bursts;

    for (let b = 0; b < bursts; b++) {
      setTimeout(() => {
        const cx = width * (0.2 + Math.random() * 0.6);
        const cy = height * (0.15 + Math.random() * 0.35);
        const color = FX_COLORS[Math.floor(Math.random() * FX_COLORS.length)];

        for (let i = 0; i < 60; i++) {
          const angle = (Math.PI * 2 * i) / 60;
          const speed = 2 + Math.random() * 3;
          this.particles.push({
            x: cx,
            y: cy,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 0,
            maxLife: 60 + Math.random() * 30,
            color,
            size: 3 + Math.random() * 2,
            rotation: 0,
            rotationSpeed: 0,
            shape: 'circle',
          });
        }

        this.pendingBursts -= 1;

        const canvas = this.canvasRef()?.nativeElement;
        if (canvas && this.rafId === null) this.runLoop(canvas);
      }, b * 260);
    }
  }

  private runLoop(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const step = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      this.particles = this.particles.filter((p) => p.life < p.maxLife);
      for (const p of this.particles) {
        p.life += 1;
        p.vy += 0.04; // gravity
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        ctx.globalAlpha = Math.max(1 - p.life / p.maxLife, 0);
        ctx.fillStyle = p.color;

        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.5);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;

      if (this.particles.length > 0 || this.pendingBursts > 0) {
        this.rafId = requestAnimationFrame(step);
      } else {
        this.rafId = null;
        canvas.style.display = 'none';
      }
    };

    this.rafId = requestAnimationFrame(step);
  }
}
