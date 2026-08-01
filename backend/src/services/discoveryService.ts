import type { AppConfig } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type { RawCampus, RawCursus } from '../models/types.js';
import type { Ft42ApiClient } from './ft42ApiClient.js';

export class DiscoveryError extends Error {}

export interface DiscoveredConfig {
  campusId: number;
  campusName: string;
  cursusId: number;
  cursusName: string;
}

/**
 * Resolves the Warsaw campus and 42cursus IDs by name (with optional ID
 * overrides), so operators never have to hand-look-up numeric IDs.
 */
export class DiscoveryService {
  constructor(
    private readonly config: Pick<AppConfig, 'ft42CampusId' | 'ft42CampusName' | 'ft42CursusId' | 'ft42CursusName'>,
    private readonly apiClient: Ft42ApiClient,
    private readonly logger: Logger,
  ) {}

  async discoverCampus(): Promise<{ id: number; name: string }> {
    if (this.config.ft42CampusId) {
      const campus = await this.apiClient.get<RawCampus>(`/v2/campus/${this.config.ft42CampusId}`);
      return { id: campus.id, name: campus.name };
    }

    const campuses = await this.apiClient.paginate<RawCampus>('/v2/campus', {}, { pageSize: 100, maxPages: 10 });
    const target = this.config.ft42CampusName.trim().toLowerCase();

    const matches = campuses.filter((c) => c.name.trim().toLowerCase() === target);
    const exactMatch = matches.find((c) => c.name === this.config.ft42CampusName) ?? matches[0];

    if (!exactMatch) {
      const close = campuses.filter((c) => c.name.toLowerCase().includes(target)).map((c) => c.name);
      this.logger.warn({ target, closeMatches: close }, 'Could not find an exact campus match');
      throw new DiscoveryError(`Campus "${this.config.ft42CampusName}" could not be found via the 42 API.`);
    }

    if (matches.length > 1) {
      this.logger.warn({ target, matchCount: matches.length }, 'Multiple campuses matched by name, using exact-name match');
    }

    return { id: exactMatch.id, name: exactMatch.name };
  }

  async discoverCursus(): Promise<{ id: number; name: string }> {
    if (this.config.ft42CursusId) {
      const cursus = await this.apiClient.get<RawCursus>(`/v2/cursus/${this.config.ft42CursusId}`);
      return { id: cursus.id, name: cursus.name };
    }

    const cursuses = await this.apiClient.paginate<RawCursus>('/v2/cursus', {}, { pageSize: 100, maxPages: 10 });
    const target = this.config.ft42CursusName.trim().toLowerCase();

    const exactMatch = cursuses.find((c) => c.name.trim().toLowerCase() === target || c.slug?.toLowerCase() === target);

    if (!exactMatch) {
      const close = cursuses.filter((c) => c.name.toLowerCase().includes('cursus') || c.name.toLowerCase().includes(target)).map((c) => c.name);
      this.logger.warn({ target, closeMatches: close }, 'Could not find an exact cursus match');
      throw new DiscoveryError(`Cursus "${this.config.ft42CursusName}" could not be found via the 42 API.`);
    }

    return { id: exactMatch.id, name: exactMatch.name };
  }

  async discoverAll(): Promise<DiscoveredConfig> {
    const [campus, cursus] = await Promise.all([this.discoverCampus(), this.discoverCursus()]);
    return {
      campusId: campus.id,
      campusName: campus.name,
      cursusId: cursus.id,
      cursusName: cursus.name,
    };
  }
}
