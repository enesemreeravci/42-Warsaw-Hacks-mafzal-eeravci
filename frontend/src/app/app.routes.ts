import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
    title: '42 Warsaw Insight — Dashboard',
  },
  {
    path: 'students',
    loadComponent: () => import('./features/students/students-list.page').then((m) => m.StudentsListPage),
    title: 'Students — 42 Warsaw Insight',
  },
  {
    path: 'students/:login',
    loadComponent: () => import('./features/student-detail/student-detail.page').then((m) => m.StudentDetailPage),
    title: 'Student — 42 Warsaw Insight',
  },
  {
    path: 'projects',
    loadComponent: () => import('./features/projects/projects.page').then((m) => m.ProjectsPage),
    title: 'Projects — 42 Warsaw Insight',
  },
  {
    path: 'evaluations',
    loadComponent: () => import('./features/evaluations/evaluations.page').then((m) => m.EvaluationsPage),
    title: 'Evaluations — 42 Warsaw Insight',
  },
  {
    path: 'blackhole',
    loadComponent: () => import('./features/blackhole/blackhole.page').then((m) => m.BlackholePage),
    title: 'Black Hole — 42 Warsaw Insight',
  },
  {
    path: 'about',
    loadComponent: () => import('./features/about/about.page').then((m) => m.AboutPage),
    title: 'About — 42 Warsaw Insight',
  },
  {
    path: 'error',
    loadComponent: () => import('./features/error/error.page').then((m) => m.ErrorPage),
    title: 'Error — 42 Warsaw Insight',
  },
  { path: '**', redirectTo: 'error' },
];
