import type { AppConfig } from './config/env.js';
import type { Logger } from './config/logger.js';
import { BackgroundRefreshService } from './services/backgroundRefresh.js';
import { DataService } from './services/dataService.js';
import { DiscoveryService } from './services/discoveryService.js';
import { Ft42ApiClient } from './services/ft42ApiClient.js';
import { StatusService } from './services/statusService.js';
import { TokenManager } from './services/tokenManager.js';
import { RateLimiter } from './utils/rateLimiter.js';

// One instance shared by TokenManager and Ft42ApiClient (the only two places that ever call
// api.intra.42.fr) so the whole application - not just one service - is capped at ~2 req/s.
const FT42_MIN_REQUEST_INTERVAL_MS = 600;

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  tokenManager: TokenManager;
  apiClient: Ft42ApiClient;
  discoveryService: DiscoveryService;
  dataService: DataService;
  statusService: StatusService;
  backgroundRefresh: BackgroundRefreshService;
  startedAt: Date;
  refreshInProgress: boolean;
}

export function createAppContext(config: AppConfig, logger: Logger): AppContext {
  const rateLimiter = new RateLimiter({ minIntervalMs: FT42_MIN_REQUEST_INTERVAL_MS });
  const tokenManager = new TokenManager(config, logger, undefined, rateLimiter);
  const apiClient = new Ft42ApiClient(config, tokenManager, logger, undefined, rateLimiter);
  const discoveryService = new DiscoveryService(config, apiClient, logger);
  const dataService = new DataService(config, apiClient, discoveryService, logger);
  const statusService = new StatusService(apiClient, tokenManager, logger);
  const backgroundRefresh = new BackgroundRefreshService(dataService, statusService, logger);

  return {
    config,
    logger,
    tokenManager,
    apiClient,
    discoveryService,
    dataService,
    statusService,
    backgroundRefresh,
    startedAt: new Date(),
    refreshInProgress: false,
  };
}
