import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const FALLBACK_COLOR = '#34e2c4';

/** Pentagon "banner" badge (a rectangle with a single downward point) carrying each coalition's
 * hand-drawn emblem in white over its own theme color. Shared by the coalition leaderboard cards
 * and the recent-activity feed so the three SVG emblems live in exactly one place. Falls back to
 * the API's own coalition image for any coalition that isn't one of the three known factions. */
@Component({
  selector: 'app-coalition-flag',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="coalition-flag" [class.coalition-flag--sm]="size() === 'sm'" [attr.aria-label]="name() + ' emblem'" role="img">
      @switch (key()) {
        @case ('lunaria') {
          <svg viewBox="0 0 720 720" class="coalition-flag--icon" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M360,11.3c2.7,0,5.5,0.7,7.9,2.1l288.3,166.4c4.9,2.8,7.9,8.1,7.9,13.7v332.8c0,5.7-3,10.9-7.9,13.7L367.9,706.6c-2.5,1.4-5.2,2.1-7.9,2.1s-5.5-0.7-7.9-2.1L63.8,540.2c-4.9-2.8-7.9-8.1-7.9-13.7V193.6c0-5.7,3-10.9,7.9-13.7L352.1,13.4C354.5,12,357.3,11.3,360,11.3 M360,0c-4.8,0-9.4,1.3-13.6,3.6L58.2,170.1c-8.4,4.8-13.6,13.8-13.6,23.5v332.8c0,9.7,5.2,18.7,13.6,23.5l288.3,166.4c4.1,2.4,8.8,3.6,13.6,3.6s9.4-1.3,13.6-3.6l288.3-166.4c8.4-4.8,13.6-13.8,13.6-23.5V193.6c0-9.7-5.2-18.7-13.6-23.5L373.6,3.7C369.4,1.3,364.8,0,360,0z"
              fill="#ffffff"
            />
            <path
              d="M360,145.6c-118.4,0-214.4,96-214.4,214.4s96,214.4,214.4,214.4s214.4-96,214.4-214.4S478.4,145.6,360,145.6z M360,502.5c-78.7,0-142.5-63.8-142.5-142.5S281.3,217.5,360,217.5S502.5,281.3,502.5,360S438.7,502.5,360,502.5z"
              fill="#ffffff"
            />
            <circle cx="405" cy="299.1" r="34.4" fill="#ffffff" />
          </svg>
        }
        @case ('orionis') {
          <svg viewBox="0 0 720 720" class="coalition-flag--icon" fill="#ffffff" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M360,11c2.7,0,5.5,0.7,7.9,2.1l288.3,166.5c4.9,2.8,7.9,8.1,7.9,13.8v333c0,5.7-3,10.9-7.9,13.8L367.9,706.6c-2.5,1.4-5.2,2.1-7.9,2.1s-5.5-0.7-7.9-2.1L63.7,540.1c-4.9-2.8-7.9-8.1-7.9-13.8v-333c0-5.7,3-10.9,7.9-13.8L352.1,13.2C354.5,11.8,357.3,11,360,11 M360-0.2c-4.8,0-9.5,1.3-13.6,3.6L58.1,169.9c-8.4,4.8-13.6,13.8-13.6,23.5v333c0,9.7,5.2,18.7,13.6,23.5l288.3,166.5c4.1,2.4,8.8,3.6,13.6,3.6s9.5-1.3,13.6-3.6l288.3-166.5c8.4-4.8,13.6-13.8,13.6-23.5v-333c0-9.7-5.2-18.7-13.6-23.5L373.6,3.4C369.5,1.1,364.8-0.2,360-0.2z"
            />
            <polygon points="350.7,564.9 177.8,465.1 177.8,176.2 109.8,215.5 109.8,504.3 350.7,643.4 " />
            <circle cx="203.6" cy="157.9" r="10.6" /><circle cx="636.6" cy="336.2" r="15.9" /><circle
              cx="614.1"
              cy="267.3"
              r="9.3"
            /><circle cx="648.6" cy="390.4" r="9.3" /><circle cx="364" cy="669.7" r="9.3" /><circle
              cx="80.7"
              cy="203.8"
              r="9.3"
            /><circle cx="589" cy="201.2" r="9.3" /><circle cx="266" cy="618.1" r="9.3" /><circle cx="170.7" cy="565.2" r="9.3" />
            <path
              d="M246,337c0.9-0.5,1.8-0.7,2.8-0.7c1.3-0.3,2.7-0.1,3.9,0.6l64.6,37.3l44-25.4c1.9-1.1,4.1-0.9,5.9,0.2c0.4,0.1,0.7,0.3,1.1,0.5L469,407.6l88.9-51.3c2.3-1.3,5.2-0.8,6.9,1.1l20,11.6c2.7-12.7,4.1-25.9,4.1-39.4c0-104.5-84.7-189.3-189.3-189.3S210.4,225,210.4,329.6c0,9.1,0.7,18.1,1.9,26.9L246,337z"
            />
            <path
              d="M364.3,360.2l-159.3,92l17.7,10.3l109.6-63.3c2.7-1.5,6.1-0.6,7.7,2.1c1.5,2.7,0.6,6.1-2.1,7.7l-104,60l13.9,8l75.2-43.4c2.7-1.5,6.1-0.6,7.7,2.1c1.5,2.7,0.6,6.1-2.1,7.7L259,483.5l13.1,7.6L413,409.7c2.7-1.5,6.1-0.6,7.7,2.1c1.5,2.7,0.6,6.1-2.1,7.7l-135.2,78.1l14.9,8.6l159.4-92L364.3,360.2z"
            />
            <path
              d="M249.5,348.1l-48.6,28v25.3l26.8-15.5c2.7-1.5,6.1-0.6,7.7,2.1c1.5,2.7,0.6,6.1-2.1,7.7l-32.4,18.7v27.1l105.2-60.7L249.5,348.1z"
            />
            <path
              d="M517.5,421.6l81.2,46.9v-78.6l-38.3-22.1L309.6,512.7l17.2,9.9l106.1-61.3c2.7-1.5,6.1-0.6,7.7,2.1c1.5,2.7,0.6,6.1-2.1,7.7l-100.5,58l26.1,15.1l113.8-65.7c1-0.6,2.2-0.8,3.3-0.7c1.1-0.1,2.2,0.1,3.3,0.7l73.8,46.4l26.1-15.1l-60.6-38.7c-2.7-1.5-3.6-5-2.1-7.7c1.5-2.7,5-3.6,7.7-2.1l66.2,42l3.1-2v-19.8l-86.9-50.1c-2.7-1.5-3.6-5-2.1-7.7C511.3,421,514.8,420.1,517.5,421.6z"
            />
          </svg>
        }
        @case ('uniterrax') {
          <svg viewBox="0 0 720 720" class="coalition-flag--icon" fill="#ffffff" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M360,11c2.7,0,5.5,0.7,7.9,2.1l288.3,166.5c4.9,2.8,7.9,8.1,7.9,13.8v333c0,5.7-3,10.9-7.9,13.8L367.9,706.6c-2.5,1.4-5.2,2.1-7.9,2.1s-5.5-0.7-7.9-2.1L63.7,540.1c-4.9-2.8-7.9-8.1-7.9-13.8v-333c0-5.7,3-10.9,7.9-13.8L352.1,13.2C354.5,11.8,357.3,11,360,11 M360-0.2c-4.8,0-9.5,1.3-13.6,3.6L58.1,169.9c-8.4,4.8-13.6,13.8-13.6,23.5v333c0,9.7,5.2,18.7,13.6,23.5l288.3,166.5c4.1,2.4,8.8,3.6,13.6,3.6s9.5-1.3,13.6-3.6l288.3-166.5c8.4-4.8,13.6-13.8,13.6-23.5v-333c0-9.7-5.2-18.7-13.6-23.5L373.6,3.4C369.5,1.1,364.8-0.2,360-0.2z"
            />
            <path d="M360,200 L440,250 L440,370 L360,420 L280,370 L280,250 Z" fill="none" stroke="#ffffff" stroke-width="12" />
            <path
              d="M320,270 L320,340 L360,370 L400,340 L400,270 L370,270 L370,325 L360,332 L350,325 L350,270 Z"
              fill="#ffffff"
            />
          </svg>
        }
        @default {
          @if (fallbackImageUrl(); as logo) {
            <img class="coalition-flag__fallback" [src]="logo" [alt]="name()" />
          }
        }
      }
    </div>
  `,
  styles: `
    .coalition-flag {
      position: relative;
      flex-shrink: 0;
      width: 44px;
      height: 58px;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 6px;
      background: var(--flag-color, ${FALLBACK_COLOR});
      clip-path: polygon(0 0, 100% 0, 100% 76%, 50% 100%, 0 76%);
      box-shadow: 0 3px 10px -3px rgba(0, 0, 0, 0.5);
    }

    .coalition-flag--sm {
      width: 32px;
      height: 42px;
      padding-top: 4px;
    }

    .coalition-flag--icon {
      width: 26px;
      height: 26px;
      color: #ffffff;
    }

    .coalition-flag--sm .coalition-flag--icon {
      width: 18px;
      height: 18px;
    }

    .coalition-flag__fallback {
      width: 26px;
      height: 26px;
      object-fit: contain;
      margin-top: 6px;
    }

    .coalition-flag--sm .coalition-flag__fallback {
      width: 18px;
      height: 18px;
      margin-top: 4px;
    }
  `,
  host: {
    '[style.--flag-color]': 'color() ?? FALLBACK_COLOR',
  },
})
export class CoalitionFlagComponent {
  readonly name = input.required<string>();
  readonly color = input<string | null>(null);
  readonly fallbackImageUrl = input<string | null>(null);
  readonly size = input<'md' | 'sm'>('md');

  protected readonly FALLBACK_COLOR = FALLBACK_COLOR;

  /** Matched by name rather than the API's `slug` since the three known factions' display names
   * are exact and stable, whereas slug casing/format isn't guaranteed. */
  protected readonly key = computed(() => this.name().trim().toLowerCase());
}
