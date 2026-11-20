import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from './db.ts';
import { isFeedType, type FeedType } from './db.ts';
import type { FeedService } from './feedService.ts';
import { AppError } from './errors.ts';
import { buildOpml } from './opml.ts';
import * as repo from './repository.ts';

export interface AppOptions {
  db: DatabaseSync;
  feedService: FeedService;
  staticDir?: string;
  pollIntervalMinutes?: number;
  logger?: boolean;
}

const VERSION = '0.2.0';

function parseType(value: unknown): FeedType {
  if (!isFeedType(value)) throw new AppError('invalid_type', 400, 'Parameter "type" must be "youtube" or "rss".');
  return value;
}

function parseId(value: unknown, name = 'id'): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError('invalid_id', 400, `Invalid ${name}.`);
  return id;
}

function optionalId(value: unknown, name: string): number | undefined {
  return value === undefined || value === '' || value === null ? undefined : parseId(value, name);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function parseBool(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const { db, feedService } = options;
  const app = Fastify({ logger: options.logger ?? false });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.status).send({ error: err.code, message: err.message });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) request.log.error(err);
    return reply.status(status).send({ error: status >= 500 ? 'internal' : 'bad_request', message: (err as Error).message });
  });

  // ---------- API ----------

  app.get('/api/health', async () => {
    const syncState = feedService.getSyncState();
    return {
      status: 'ok',
      version: VERSION,
      ...syncState,
    };
  });

  app.get('/api/settings', async () => ({
    settings: repo.getServerSettings(db, options.pollIntervalMinutes ?? 15),
  }));

  app.patch('/api/settings', async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const patch: Partial<repo.ServerSettingsDto> = {};
    if (body.pollIntervalMinutes !== undefined) {
      const n = Number(body.pollIntervalMinutes);
      if (!(repo.VALID_POLL_INTERVALS as readonly number[]).includes(n)) {
        throw new AppError('bad_request', 400, 'Invalid pollIntervalMinutes. Allowed: 0, 5, 15, 30, 60.');
      }
      patch.pollIntervalMinutes = n as repo.PollIntervalMinutes;
    }
    if (body.autoArchiveEnabled !== undefined) {
      if (typeof body.autoArchiveEnabled !== 'boolean') {
        throw new AppError('bad_request', 400, 'autoArchiveEnabled must be a boolean.');
      }
      patch.autoArchiveEnabled = body.autoArchiveEnabled;
    }
    if (body.autoArchiveDays !== undefined) {
      const days = Number(body.autoArchiveDays);
      if (!Number.isFinite(days) || days < 1 || days > 365) {
        throw new AppError('bad_request', 400, 'autoArchiveDays must be between 1 and 365.');
      }
      patch.autoArchiveDays = Math.round(days);
    }

    const settings = repo.updateServerSettings(db, patch, options.pollIntervalMinutes ?? 15);
    feedService.setPollInterval(settings.pollIntervalMinutes);
    const archived = settings.autoArchiveEnabled ? repo.archiveOldUncompleted(db, settings.autoArchiveDays) : 0;
    return { settings, archived };
  });

  app.get('/api/backup', async () => repo.exportFullBackup(db, options.pollIntervalMinutes ?? 15));

  app.post('/api/backup', async (request) => {
    const body = (request.body ?? {}) as Partial<repo.FullBackupPayload>;
    if (body.app !== 'tallydeck' || !Array.isArray(body.feeds) || !Array.isArray(body.items)) {
      throw new AppError('invalid_backup', 400, 'Invalid TallyDeck backup file.');
    }
    const result = repo.restoreFullBackup(db, body as repo.FullBackupPayload, options.pollIntervalMinutes ?? 15);
    feedService.setPollInterval(result.serverSettings.pollIntervalMinutes);
    return result;
  });

  app.get('/api/feeds', async (request) => {
    const q = request.query as Record<string, unknown>;
    return { feeds: repo.listFeeds(db, parseType(q.type), parseBool(q.hideShorts)) };
  });

  app.post('/api/feeds', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const type = parseType(body.type);
    if (typeof body.url !== 'string' || !body.url.trim()) {
      throw new AppError('invalid_url', 400, 'Please provide a URL.');
    }
    const category = typeof body.category === 'string' ? body.category : null;
    const result = await feedService.addFeed(type, body.url, category);
    return reply.status(201).send(result);
  });

  app.patch('/api/feeds/:id', async (request) => {
    const id = parseId((request.params as Record<string, unknown>).id);
    const body = (request.body ?? {}) as Record<string, unknown>;
    const category = typeof body.category === 'string' ? body.category : null;
    const feed = repo.updateFeedCategory(db, id, category);
    if (!feed) throw new AppError('feed_not_found', 404, 'Feed not found.');
    return { feed };
  });

  app.delete('/api/feeds/:id', async (request, reply) => {
    const id = parseId((request.params as Record<string, unknown>).id);
    if (!repo.deleteFeed(db, id)) throw new AppError('feed_not_found', 404, 'Feed not found.');
    return reply.status(204).send();
  });

  app.post('/api/feeds/sync', async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const feedId = optionalId(body.feedId, 'feedId');
    if (feedId !== undefined) return feedService.syncFeed(feedId);
    return feedService.syncAll(body.type === undefined ? undefined : parseType(body.type));
  });

  app.get('/api/feeds/opml', async (request, reply) => {
    const q = request.query as Record<string, unknown>;
    const type = parseType(q.type);
    const feeds = repo.listFeeds(db, type);
    const xml = buildOpml(type, feeds);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `tallydeck-${type}-${date}.opml`;
    return reply
      .header('Content-Type', 'text/x-opml; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(xml);
  });

  app.post('/api/feeds/opml', async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const type = parseType(body.type);
    if (typeof body.opml !== 'string' || !body.opml.trim()) {
      throw new AppError('invalid_opml', 400, 'Please provide a valid OPML file.');
    }
    return feedService.importOpml(type, body.opml);
  });

  app.get('/api/items', async (request) => {
    const q = request.query as Record<string, unknown>;
    const filter: repo.ItemFilter = {
      type: parseType(q.type),
      feedId: optionalId(q.feedId, 'feedId'),
      category: optionalString(q.category),
      hideShorts: parseBool(q.hideShorts),
    };
    const serverSettings = repo.getServerSettings(db, options.pollIntervalMinutes ?? 15);
    if (serverSettings.autoArchiveEnabled) {
      repo.archiveOldUncompleted(db, serverSettings.autoArchiveDays);
    }
    const inboxLimit = Math.min(Math.max(Number(q.inboxLimit) || 100, 1), 5000);
    const completedLimit = Math.min(Math.max(Number(q.completedLimit) || 100, 1), 5000);
    const completedDays = Math.min(Math.max(Number(q.completedDays) || 7, 1), 30);
    const completed = repo.listCompleted(db, filter, completedLimit, completedDays);
    return {
      uncompleted: repo.listUncompleted(db, filter, inboxLimit),
      completed: completed.items,
      completedTotal: completed.total,
      // Stats always cover the whole page type (all feeds), independent of the channel filter.
      stats: repo.getStats(db, { type: filter.type, hideShorts: filter.hideShorts }),
    };
  });

  app.patch('/api/items/:id', async (request) => {
    const id = parseId((request.params as Record<string, unknown>).id);
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (typeof body.completed !== 'boolean') {
      throw new AppError('bad_request', 400, 'Body must contain "completed": true|false.');
    }
    const item = repo.setItemCompleted(db, id, body.completed);
    if (!item) throw new AppError('item_not_found', 404, 'Item not found.');
    return { item };
  });

  app.post('/api/items/complete-all', async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const updated = repo.completeAll(db, {
      type: parseType(body.type),
      feedId: optionalId(body.feedId, 'feedId'),
      category: optionalString(body.category),
      hideShorts: parseBool(body.hideShorts),
    });
    return { updated };
  });

  app.all('/api/*', async () => {
    throw new AppError('not_found', 404, 'Unknown API endpoint.');
  });

  // ---------- Frontend (single-page app) ----------

  if (options.staticDir && existsSync(join(options.staticDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: options.staticDir, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'not_found', message: 'Not found.' });
      }
      return reply.type('text/html').sendFile('index.html');
    });
  } else {
    app.get('/', async () => ({
      name: 'TallyDeck API',
      message: 'Frontend not built. Run "npm run build" or use "npm run dev" (Vite on :5173).',
    }));
  }

  return app;
}
