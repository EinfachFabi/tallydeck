import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { config } from './config.ts';
import { openDatabase } from './db.ts';
import { createFeedService } from './feedService.ts';
import { createTwitchService } from './twitchService.ts';
import { defaultFetchText } from './http.ts';
import { buildApp } from './app.ts';
import { createVersionService } from './versionService.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** Compiled: dist/server/server.js -> dist/public. Dev (node server/server.ts) -> ../dist/public. */
function findStaticDir(): string | undefined {
  const candidates = config.staticDir ? [config.staticDir] : [resolve(here, '../public'), resolve(here, '../dist/public')];
  return candidates.find((dir) => existsSync(resolve(dir, 'index.html')));
}

async function main() {
  const db = openDatabase(config.dbPath);

  let app: FastifyInstance | undefined;
  const logger = {
    info: (msg: string) => app?.log.info(msg),
    warn: (msg: string) => app?.log.warn(msg),
  };
  const feedService = createFeedService(db, defaultFetchText, logger);
  const twitchService = createTwitchService(db, {
    clientId: config.twitchClientId,
    clientSecret: config.twitchClientSecret,
    defaultPollIntervalMinutes: config.twitchPollIntervalMinutes,
    logger,
  });

  app = await buildApp({
    db,
    feedService,
    twitchService,
    staticDir: findStaticDir(),
    pollIntervalMinutes: config.pollIntervalMinutes,
    twitchPollIntervalMinutes: config.twitchPollIntervalMinutes,
    logger: true,
    versionService: createVersionService({
      current: config.appVersion,
      repo: config.updateRepo,
      enabled: config.updateCheck,
    }),
  });

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`TallyDeck v${config.appVersion} running on http://localhost:${config.port} (db: ${config.dbPath})`);

  const stopScheduler = feedService.startScheduler(config.pollIntervalMinutes);
  const stopTwitchScheduler = twitchService.startScheduler(config.twitchPollIntervalMinutes);
  const activePoll = feedService.getSyncState().pollIntervalMinutes;
  const twitchState = twitchService.getSyncState();
  app.log.info(
    activePoll > 0 ? `Background sync every ${activePoll} minutes` : 'Background sync disabled (Off)',
  );
  app.log.info(
    `Twitch background sync (${twitchState.mode.toUpperCase()}) every ${twitchState.twitchPollIntervalMinutes} minutes`,
  );

  const shutdown = async () => {
    stopScheduler();
    stopTwitchScheduler();
    await app?.close();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
