import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-about-page',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="about">
      <h1>About this dashboard</h1>
      <p class="lede">
        42 Warsaw Insight is a TV-friendly dashboard built for the 42 Warsaw Hacks hackathon. It surfaces
        Common Core learning-progress and community metrics for the Warsaw campus, sourced from the official 42 API.
      </p>

      <section>
        <h2>What it shows</h2>
        <ul>
          <li>Community-wide progress metrics: active students, average level, recent completions.</li>
          <li>A celebration carousel for recently completed projects.</li>
          <li>Completion trends and most-completed projects over a configurable period.</li>
          <li>A featured student profile and a searchable/sortable student directory.</li>
        </ul>
      </section>

      <section>
        <h2>Data &amp; privacy</h2>
        <p>
          Only public, read-only 42 API data is used. The 42 Client ID and Client Secret live exclusively on the backend
          server and are never sent to the browser. See <a routerLink="/dashboard">the dashboard</a> for live status, or the
          project's <code>docs/</code> folder for full technical documentation (API research, architecture, metric
          definitions, and known limitations).
        </p>
      </section>

      <section>
        <h2>Mode</h2>
        <p>This instance is connected live to the official 42 API via the backend-for-frontend server - there is no demo/offline mode.</p>
      </section>

      <section>
        <h2>Contributors</h2>
        <p>Built by Muhammad Afzal (<code>mafzal</code>) for the 42 Warsaw Hacks hackathon.</p>
      </section>
    </div>
  `,
  styles: `
    .about {
      max-width: 72ch;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
    }

    h1 {
      font-size: clamp(1.6rem, 3vw, 2.2rem);
      margin: 0;
    }

    .lede {
      color: var(--color-text-secondary);
      font-size: 1.05rem;
    }

    h2 {
      font-size: 1.1rem;
      color: var(--color-accent);
      margin-bottom: var(--space-2);
    }

    ul {
      color: var(--color-text-secondary);
      line-height: 1.7;
    }

    code {
      background: var(--color-bg-card);
      border: 1px solid var(--color-border);
      border-radius: 4px;
      padding: 0 4px;
    }
  `,
})
export class AboutPage {}
