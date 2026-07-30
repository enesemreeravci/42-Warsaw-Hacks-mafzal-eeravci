import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import type { NormalizedApiError } from '../../core/interceptors/error.interceptor';
import type { StudentDetail } from '../../core/models/api.models';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/components/error-state/error-state.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';

@Component({
  selector: 'app-student-detail-page',
  standalone: true,
  imports: [
    RouterLink,
    MatButtonModule,
    MatIconModule,
    AvatarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    LoadingSkeletonComponent,
    RelativeTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './student-detail.page.html',
  styleUrl: './student-detail.page.scss',
})
export class StudentDetailPage {
  /** Bound directly from the :login route param via withComponentInputBinding(). */
  readonly login = input.required<string>();

  private readonly api = inject(ApiService);

  protected readonly student = signal<StudentDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly notFound = signal(false);
  protected readonly error = signal<NormalizedApiError | null>(null);

  protected readonly successRate = computed(() => {
    const s = this.student();
    if (!s) return 0;
    const allFinished = [...s.completedProjects, ...s.recentCompletions.filter((c) => c.status === 'finished' && !c.validated)];
    const uniqueByProjectUserId = new Map(allFinished.map((c) => [c.projectUserId, c]));
    const finished = [...uniqueByProjectUserId.values()];
    if (finished.length === 0) return 0;
    const successful = finished.filter((c) => c.validated).length;
    return Math.round((successful / finished.length) * 100);
  });

  constructor() {
    effect(() => {
      const login = this.login();
      this.fetch(login);
    });
  }

  protected retry(): void {
    this.fetch(this.login());
  }

  private fetch(login: string): void {
    this.loading.set(true);
    this.notFound.set(false);
    this.error.set(null);

    this.api.getStudentDetail(login).subscribe({
      next: (envelope) => {
        this.student.set(envelope.data);
        this.loading.set(false);
      },
      error: (err: NormalizedApiError) => {
        this.loading.set(false);
        if (err.status === 404) {
          this.notFound.set(true);
        } else {
          this.error.set(err);
        }
      },
    });
  }
}
