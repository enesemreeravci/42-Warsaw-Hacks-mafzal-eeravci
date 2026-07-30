import type { AppConfig } from './config/env.js';
import type { Logger } from './config/logger.js';
import { DataService } from './services/dataService.js';
import { DiscoveryService } from './services/discoveryService.js';
import { Ft42ApiClient } from './services/ft42ApiClient.js';
import { StatusService } from './services/statusService.js';
import { TokenManager } from './services/tokenManager.js';

export interface AppContext {
  config: AppConfig;
  logger: Logger;
  tokenManager: TokenManager;
  apiClient: Ft42ApiClient;
  discoveryService: DiscoveryService;
  dataService: DataService;
  statusService: StatusService;
  startedAt: Date;
  refreshInProgress: boolean;
}

export function createAppContext(config: AppConfig, logger: Logger): AppContext {
  const tokenManager = new TokenManager(config, logger);
  const apiClient = new Ft42ApiClient(config, tokenManager, logger);
  const discoveryService = new DiscoveryService(config, apiClient, logger);
  const dataService = new DataService(config, apiClient, discoveryService, logger);
  const statusService = new StatusService(apiClient, tokenManager, logger);

  return {
    config,
    logger,
    tokenManager,
    apiClient,
    discoveryService,
    dataService,
    statusService,
    startedAt: new Date(),
    refreshInProgress: false,
  };
}
