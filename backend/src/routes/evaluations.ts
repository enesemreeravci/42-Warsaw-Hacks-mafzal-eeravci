import { Router } from 'express';
import type { AppContext } from '../appContext.js';
import { sendData } from '../middleware/envelope.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { buildEvaluationAnalytics, type EvaluationFilters, type EvaluationGranularity } from '../services/evaluationAnalytics.js';

const WARSAW_TZ = 'Europe/Warsaw';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Returns the start of the given date in Warsaw local time as a UTC Date. */
function warsawStartOfDay(date: Date): Date {
  const dateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: WARSAW_TZ, dateStyle: 'short' }).format(date);
  // dateStr = 'YYYY-MM-DD'. Reconstruct as UTC noon to find the correct Warsaw day,
  // then use formatToParts to recover the actual UTC offset for that day.
  const utcNoon = new Date(`${dateStr}T12:00:00Z`);
  const warsawHour = parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: WARSAW_TZ, hour: 'numeric', hour12: false }).format(utcNoon),
    10,
  ) % 24;
  // At noon UTC: Warsaw = noon + offset, offset = warsawHour - 12
  const offsetHours = warsawHour - 12;
  // Midnight Warsaw = midnight UTC - offset = midnight UTC - (warsawHour - 12)
  const midnightUTC = new Date(`${dateStr}T00:00:00Z`);
  return new Date(midnightUTC.getTime() - offsetHours * 60 * 60 * 1000);
}

function parseRangeParam(
  range: string,
  customFrom: string,
  customTo: string,
  now: Date,
): { from: Date; to: Date; rangeLabel: string } {
  const todayStart = warsawStartOfDay(now);
  const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);

  switch (range) {
    case 'today':
      return { from: todayStart, to: now, rangeLabel: 'today' };

    case 'yesterday':
      return { from: yesterdayStart, to: todayStart, rangeLabel: 'yesterday' };

    case 'last7Days':
      return { from: new Date(now.getTime() - 7 * DAY_MS), to: now, rangeLabel: 'last7Days' };

    case 'lastWeek': {
      // Previous calendar week: Mon–Sun
      const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // 1=Mon … 7=Sun
      const thisMonday = new Date(todayStart.getTime() - (dayOfWeek - 1) * DAY_MS);
      const prevMonday = new Date(thisMonday.getTime() - 7 * DAY_MS);
      return { from: prevMonday, to: thisMonday, rangeLabel: 'lastWeek' };
    }

    case 'thisMonth': {
      const warsawDateStr = new Intl.DateTimeFormat('sv-SE', { timeZone: WARSAW_TZ, dateStyle: 'short' }).format(now);
      const [year, month] = warsawDateStr.split('-');
      const firstOfMonth = warsawStartOfDay(new Date(`${year}-${month}-01T12:00:00Z`));
      return { from: firstOfMonth, to: now, rangeLabel: 'thisMonth' };
    }

    case 'custom': {
      const from = customFrom ? new Date(customFrom) : new Date(now.getTime() - 7 * DAY_MS);
      const to = customTo ? new Date(customTo) : now;
      if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
        return { from: new Date(now.getTime() - 7 * DAY_MS), to: now, rangeLabel: 'last7Days' };
      }
      return { from, to, rangeLabel: 'custom' };
    }

    default:
      return { from: new Date(now.getTime() - 7 * DAY_MS), to: now, rangeLabel: 'last7Days' };
  }
}

export function evaluationsRouter(ctx: AppContext): Router {
  const router = Router();

  /**
   * GET /api/evaluations/analytics
   * Returns evaluation analytics for the requested date window.
   *
   * Query params:
   *   range  - today | yesterday | last7Days | lastWeek | thisMonth | custom  (default: last7Days)
   *   from   - ISO timestamp (only for range=custom)
   *   to     - ISO timestamp (only for range=custom)
   *
   * On first call, this endpoint fetches up to 30 days of /v2/scale_teams from the 42 API
   * (may take several seconds). Results are cached for 30 minutes. Subsequent calls within
   * that window respond immediately from cache. Historical comparisons are not available.
   */
  router.get(
    '/evaluations/analytics',
    asyncHandler(async (req, res) => {
      const now = new Date();
      const { from, to, rangeLabel } = parseRangeParam(
        String(req.query.range ?? 'last7Days'),
        String(req.query.from ?? ''),
        String(req.query.to ?? ''),
        now,
      );

      const studentLogin = String(req.query.studentLogin ?? '').trim() || null;
      const evaluatorLogin = String(req.query.evaluatorLogin ?? '').trim() || null;
      const projectName = String(req.query.projectName ?? '').trim() || null;
      const rawGranularity = String(req.query.granularity ?? '');
      const granularity: EvaluationGranularity = (
        ['hourly', 'daily', 'weekly', 'monthly'] as const
      ).includes(rawGranularity as EvaluationGranularity)
        ? (rawGranularity as EvaluationGranularity)
        : 'daily';
      const filters: EvaluationFilters = { studentLogin, evaluatorLogin, projectName };

      const { scaleTeams, students } = await ctx.dataService.getEvalAnalyticsData();
      const studentsByLogin = new Map(students.map((s) => [s.login.toLowerCase(), s]));

      const response = buildEvaluationAnalytics(scaleTeams, studentsByLogin, from, to, now, 'cache', filters, granularity);
      response.filters.range = rangeLabel;

      sendData(res, response);
    }),
  );

  return router;
}
