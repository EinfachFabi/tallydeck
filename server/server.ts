import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { config } from './config.ts';
import { openDatabase } from './db.ts';
import { createFeedService } from './feedService.ts';
import { defaultFetchText } from './http.ts';
import { buildApp } from './app.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** Compiled: dist/server/server.js -> dist/public. Dev (node server/server.ts) -> ../dist/public. */
function findStaticDir(): string | undefined {
  const candidates = config.staticDir ? [config.staticDir] : [resolve(here, '../public'), resolve(here, '../dist/public')];
  return candidates.find((dir) => existsSync(resolve(dir, 'index.html')));
}

async function main() {
  const db = openDatabase(config.dbPath);

  let app: FastifyInstance | undefined;
  const feedService = createFeedService(db, defaultFetchText, {
    info: (msg) => app?.log.info(msg),
    warn: (msg) => app?.log.warn(msg),
  });

  app = await buildApp({
    db,
    feedService,
    staticDir: findStaticDir(),
    pollIntervalMinutes: config.pollIntervalMinutes,
    logger: true,
  });

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`TallyDeck running on http://localhost:${config.port} (db: ${config.dbPath})`);

  const stopScheduler = feedService.startScheduler(config.pollIntervalMinutes);
  app.log.info(`Background sync every ${config.pollIntervalMinutes} minutes`);

  const shutdown = async () => {
    stopScheduler();
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
