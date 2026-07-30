import { DatePipe } from '@angular/common';
import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { DashboardStore } from './core/services/dashboard-store.service';
import { TvModeService } from './core/services/tv-mode.service';
import { AchievementTakeoverOverlayComponent } from './features/dashboard/components/achievement-takeover-overlay.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSlideToggleModule,
    MatTooltipModule,
    DatePipe,
    AchievementTakeoverOverlayComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly store = inject(DashboardStore);
  protected readonly tvMode = inject(TvModeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly fullscreenActive = signal(false);
  protected readonly announcement = signal('');
  protected readonly currentUrl = signal('/dashboard');
  protected readonly clockLabel = signal(this.formatClock());
  protected readonly refreshIntervalOptions = [60, 120, 300, 600, 900];

  constructor() {
    this.store.init();
    this.watchFullscreenChanges();
    this.watchAnnouncements();

    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed(this.destroyRef)).subscribe((e) => {
      this.currentUrl.set((e as NavigationEnd).urlAfterRedirects);
    });

    setInterval(() => this.clockLabel.set(this.formatClock()), 1000);

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (event) => this.onKeydown(event));
    }
  }

  protected toggleTvMode(): void {
    this.tvMode.toggle();
  }

  protected async toggleFullscreen(): Promise<void> {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen().catch(() => undefined);
    } else {
      await document.exitFullscreen().catch(() => undefined);
    }
  }

  protected setRefreshInterval(seconds: number): void {
    this.store.setAutoRefreshInterval(seconds);
  }

  private onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;

    if (event.key === 't' || event.key === 'T') {
      this.tvMode.toggle();
    } else if (event.key === 'r' || event.key === 'R') {
      this.store.refreshNow();
    } else if (event.key === 'Escape' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
  }

  private watchFullscreenChanges(): void {
    if (typeof document === 'undefined') return;
    const handler = () => this.fullscreenActive.set(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handler);
    this.destroyRef.onDestroy(() => document.removeEventListener('fullscreenchange', handler));
  }

  private watchAnnouncements(): void {
    effect(() => {
      const refreshing = this.store.refreshing();
      if (refreshing) {
        this.announcement.set('Refreshing dashboard data.');
      }
    });
    effect(() => {
      const updated = this.store.lastSuccessfulUpdate();
      if (updated) {
        this.announcement.set(`Dashboard data refreshed successfully at ${this.formatClock(updated)}.`);
      }
    });
    effect(() => {
      const err = this.store.error();
      if (err) {
        this.announcement.set(`Dashboard refresh failed: ${err.message}`);
      }
    });
  }

  private formatClock(date: Date = new Date()): string {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
