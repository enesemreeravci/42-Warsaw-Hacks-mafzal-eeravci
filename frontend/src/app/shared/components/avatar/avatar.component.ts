import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Student avatar with a deterministic initials fallback when no image URL is available. */
@Component({
  selector: 'app-avatar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (imageUrl(); as url) {
      <img class="avatar" [style.width.px]="size()" [style.height.px]="size()" [src]="url" [alt]="name()" loading="lazy" />
    } @else {
      <div class="avatar avatar--fallback" [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="size() * 0.4" aria-hidden="true">
        {{ initials() }}
      </div>
    }
  `,
  styles: `
    .avatar {
      border-radius: 50%;
      object-fit: cover;
      background: var(--color-bg-elevated);
      border: 2px solid var(--color-border-strong);
      flex-shrink: 0;
    }

    .avatar--fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--color-accent);
      font-weight: 700;
      background: linear-gradient(135deg, var(--color-bg-elevated), var(--color-bg-card));
    }
  `,
})
export class AvatarComponent {
  readonly imageUrl = input<string | null>(null);
  readonly name = input.required<string>();
  readonly size = input<number>(48);

  readonly initials = computed(() => {
    const parts = this.name().trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
  });
}
