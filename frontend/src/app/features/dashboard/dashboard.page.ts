import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonToggleModule, MatButtonToggleChange } from '@angular/material/button-toggle';
import { filter, timer } from 'rxjs';
import { DashboardStore } from '../../core/services/dashboard-store.service';
import { TvModeService } from '../../core/services/tv-mode.service';
import { VisibilityService } from '../../core/services/visibility.service';
import { ErrorStateComponent } from '../../shared/components/error-state/error-state.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { AchievementSpotlightComponent } from './components/achievement-spotlight.component';
import { CelebrationCarouselComponent } from './components/celebration-carousel.component';
import { CommunityProgressComponent } from './components/community-progress.component';
import { CompletionTrendChartComponent } from './components/completion-trend-chart.component';
import { FeaturedStudentCardComponent } from './components/featured-student-card.component';
import { HiveNodeMapComponent } from './components/hive-node-map.component';
import { SystemStatusComponent } from './components/system-status.component';
import { TopProjectsListComponent } from './components/top-projects-list.component';
import { XpRaceBlackholeComponent } from './components/xp-race-blackhole.component';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonToggleModule,
    ErrorStateComponent,
    LoadingSkeletonComponent,
    StatCardComponent,
    CelebrationCarouselComponent,
    CommunityProgressComponent,
    CompletionTrendChartComponent,
    FeaturedStudentCardComponent,
    SystemStatusComponent,
    TopProjectsListComponent,
    HiveNodeMapComponent,
    AchievementSpotlightComponent,
    XpRaceBlackholeComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  protected readonly store = inject(DashboardStore);
  protected readonly tvMode = inject(TvModeService);
  private readonly visibility = inject(VisibilityService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly periodOptions = [7, 14, 30, 60, 90];

  constructor() {
    timer(0, 1000)
      .pipe(
        filter(() => this.tvMode.enabled() && !this.visibility.hidden()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.tickRotation());
  }

  private secondsInSection = 0;

  private tickRotation(): void {
    this.secondsInSection += 1;
    if (this.secondsInSection >= this.tvMode.rotationSeconds()) {
      this.secondsInSection = 0;
      this.tvMode.advanceSection();
    }
  }

  protected onPeriodChange(event: MatButtonToggleChange): void {
    this.store.setPeriodDays(Number(event.value));
  }

  protected retry(): void {
    this.store.refreshNow();
  }
}
