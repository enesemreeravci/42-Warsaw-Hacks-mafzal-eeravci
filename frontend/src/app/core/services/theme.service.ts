import { Injectable, computed, effect, signal } from '@angular/core';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'theme-mode';

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

/**
 * Global light/dark theme state. The app is dark-first by design (see styles.scss), so the
 * default - and the fallback for anyone who's never chosen a preference - is 'dark'; `light` is
 * an explicit opt-in that's persisted to localStorage so it survives reloads. Applies a
 * `data-theme` attribute to <html>, which every themeable CSS custom property (see styles.scss's
 * `[data-theme='light']` block) and the dual Angular Material theme are scoped against.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly modeSignal = signal<ThemeMode>(readStoredTheme());

  readonly mode = this.modeSignal.asReadonly();
  readonly isLight = computed(() => this.modeSignal() === 'light');

  constructor() {
    effect(() => {
      const mode = this.modeSignal();
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', mode);
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, mode);
      }
    });
  }

  toggle(): void {
    this.modeSignal.update((mode) => (mode === 'dark' ? 'light' : 'dark'));
  }

  setMode(mode: ThemeMode): void {
    this.modeSignal.set(mode);
  }
}
