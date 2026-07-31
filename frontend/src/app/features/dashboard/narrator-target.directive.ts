import { Directive, ElementRef, HostListener, effect, inject, input } from '@angular/core';
import { NarratorTargetRegistry } from './narrator-target-registry.service';

/**
 * Marks an element as a narrator cue target: `[appNarratorTarget]="'trend'"` registers this
 * element's real DOM position under the id `'trend'` in `NarratorTargetRegistry`, so the
 * floating 3D mascot can position itself at this element's actual top-right corner instead of a
 * guessed fixed screen position. Also reports hover in/out, so mousing over a panel can pull the
 * narrator's focus onto it ahead of the automatic rotation.
 *
 * The input is reactive (not just read once in ngOnInit) so a single host element can be
 * re-targeted at a different id over time - TV mode uses this to keep one `.tv-stage` wrapper
 * registered under whichever section's cue id is currently active, rather than needing a
 * separate directive instance per section.
 */
@Directive({
  selector: '[appNarratorTarget]',
  standalone: true,
})
export class NarratorTargetDirective {
  readonly appNarratorTarget = input.required<string>();

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly registry = inject(NarratorTargetRegistry);

  constructor() {
    effect((onCleanup) => {
      const id = this.appNarratorTarget();
      if (!id) return;
      this.registry.register(id, this.el);
      onCleanup(() => this.registry.unregister(id));
    });
  }

  @HostListener('mouseenter')
  protected onEnter(): void {
    this.registry.focus(this.appNarratorTarget());
  }

  @HostListener('mouseleave')
  protected onLeave(): void {
    this.registry.blur(this.appNarratorTarget());
  }
}
