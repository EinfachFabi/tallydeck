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
import { config } from './config.ts';
import { createVersionService, type VersionService } from './versionService.ts';
import { createTwitchService, type TwitchService } from './twitchService.ts';

export interface AppOptions {
  db: DatabaseSync;
  feedService: FeedService;
  twitchService?: TwitchService;
  staticDir?: string;
  pollIntervalMinutes?: number;
  twitchPollIntervalMinutes?: number;
  logger?: boolean;
  /** Update check service; defaults to a disabled checker (no outgoing requests, e.g. in tests). */
  versionService?: VersionService;
}

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
  const defaultPollInterval = options.pollIntervalMinutes ?? 15;
  const defaultTwitchPollInterval = options.twitchPollIntervalMinutes ?? 15;
  const twitchService =
    options.twitchService ??
    createTwitchService(db, {
      clientId: config.twitchClientId,
      clientSecret: config.twitchClientSecret,
      defaultPollIntervalMinutes: defaultTwitchPollInterval,
    });
  const versionService =
    options.versionService ??
    createVersionService({ current: config.appVersion, repo: config.updateRepo, enabled: false });
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
    const twitchState = twitchService.getSyncState();
    return {
      status: 'ok',
      version: versionService.current,
      ...syncState,
      lastTwitchSyncAt: twitchState.lastTwitchSyncAt,
      twitchSyncing: twitchState.twitchSyncing,
    };
  });

  app.get('/api/version', async () => versionService.get());

  app.post('/api/version/check', async () => versionService.refresh());

  app.get('/api/settings', async () => ({
    settings: repo.getServerSettings(db, defaultPollInterval, defaultTwitchPollInterval),
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
    if (body.twitchPollIntervalMinutes !== undefined) {
      const n = Number(body.twitchPollIntervalMinutes);
      if (!(repo.VALID_TWITCH_POLL_INTERVALS as readonly number[]).includes(n)) {
        throw new AppError('bad_request', 400, 'Invalid twitchPollIntervalMinutes. Allowed: 15, 30, 60, 120.');
      }
      patch.twitchPollIntervalMinutes = n as repo.TwitchPollIntervalMinutes;
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

    const settings = repo.updateServerSettings(db, patch, defaultPollInterval, defaultTwitchPollInterval);
    feedService.setPollInterval(settings.pollIntervalMinutes);
    twitchService.setPollInterval(settings.twitchPollIntervalMinutes);
    const archived = settings.autoArchiveEnabled ? repo.archiveOldUncompleted(db, settings.autoArchiveDays) : 0;
    return { settings, archived };
  });

  app.get('/api/backup', async () => repo.exportFullBackup(db, defaultPollInterval));

  app.post('/api/backup', async (request) => {
    const body = (request.body ?? {}) as Partial<repo.FullBackupPayload>;
    if (body.app !== 'tallydeck' || !Array.isArray(body.feeds) || !Array.isArray(body.items)) {
      throw new AppError('invalid_backup', 400, 'Invalid TallyDeck backup file.');
    }
    const result = repo.restoreFullBackup(db, body as repo.FullBackupPayload, defaultPollInterval);
    feedService.setPollInterval(result.serverSettings.pollIntervalMinutes);
    twitchService.setPollInterval(result.serverSettings.twitchPollIntervalMinutes);
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

  // ---------- Topics ----------

  app.get('/api/topics', async () => ({ topics: repo.listTopics(db) }));

  app.post('/api/topics', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const topics = repo.createTopic(db, body.name, body.color);
    if (!topics) throw new AppError('invalid_topic', 400, 'Please provide a topic name.');
    return reply.status(201).send({ topics });
  });

  app.patch('/api/topics/:name', async (request) => {
    const name = String((request.params as Record<string, unknown>).name ?? '');
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (body.newName !== undefined && !repo.normalizeCategory(body.newName)) {
      throw new AppError('invalid_topic', 400, 'Please provide a topic name.');
    }
    const topics = repo.updateTopic(db, name, { newName: body.newName, color: body.color });
    if (!topics) throw new AppError('topic_not_found', 404, 'Topic not found.');
    return { topics };
  });

  app.delete('/api/topics/:name', async (request) => {
    const name = String((request.params as Record<string, unknown>).name ?? '');
    if (!repo.deleteTopic(db, name)) throw new AppError('topic_not_found', 404, 'Topic not found.');
    return { topics: repo.listTopics(db) };
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

  // ---------- Twitch ----------

  app.get('/api/twitch/streams', async () => twitchService.getStreams());

  app.post('/api/twitch/channels', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (typeof body.channel !== 'string' || !body.channel.trim()) {
      throw new AppError('invalid_twitch_channel', 400, 'Please enter a Twitch channel name or URL.');
    }
    const channel = await twitchService.addChannel(body.channel);
    return reply.status(201).send({ channel });
  });

  app.delete('/api/twitch/channels/:id', async (request, reply) => {
    const id = parseId((request.params as Record<string, unknown>).id);
    if (!twitchService.removeChannel(id)) {
      throw new AppError('twitch_channel_not_found', 404, 'Twitch channel not found.');
    }
    return reply.status(204).send();
  });

  app.post('/api/twitch/sync', async () => twitchService.refresh());

  app.get('/api/twitch/channels/export', async (_request, reply) => {
    const channels = repo.listTwitchChannels(db).map((ch) => ({
      login: ch.login,
      displayName: ch.displayName,
      avatarUrl: ch.avatarUrl,
    }));
    const date = new Date().toISOString().slice(0, 10);
    const filename = `tallydeck-twitch-${date}.json`;
    const payload = {
      app: 'tallydeck-twitch',
      version: 1,
      exportedAt: Date.now(),
      channels,
    };
    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(JSON.stringify(payload, null, 2));
  });

  app.post('/api/twitch/channels/import', async (request) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    if (typeof body.content !== 'string' || !body.content.trim()) {
      throw new AppError('invalid_twitch_import', 400, 'Please provide a valid Twitch channels file.');
    }
    return twitchService.importChannels(body.content);
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
