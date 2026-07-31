import { ElementRef, Injectable, signal } from '@angular/core';

/**
 * Tracks which real DOM element each narrator cue id currently corresponds to, and which one
 * (if any) the user is hovering. `NarratorRobotComponent` reads this to compute where to sit
 * (the target's real top-right corner) instead of guessing a fixed screen position, and
 * `NarratorTargetDirective` is what populates it - see that file for the registration side.
 */
@Injectable({ providedIn: 'root' })
export class NarratorTargetRegistry {
  private readonly targets = new Map<string, ElementRef<HTMLElement>>();

  /** The cue id of whichever registered target the pointer is currently over, if any - lets a
   * hover take priority over the automatic rotation. */
  readonly focusedId = signal<string | null>(null);

  register(id: string, el: ElementRef<HTMLElement>): void {
    this.targets.set(id, el);
  }

  unregister(id: string): void {
    this.targets.delete(id);
  }

  element(id: string): HTMLElement | null {
    return this.targets.get(id)?.nativeElement ?? null;
  }

  focus(id: string): void {
    this.focusedId.set(id);
  }

  blur(id: string): void {
    this.focusedId.update((current) => (current === id ? null : current));
  }
}
