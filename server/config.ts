import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return !['0', 'false', 'no', 'off'].includes(raw);
}

/** Reads the app version from package.json (works for `node server/server.ts` and the compiled dist build). */
export function readAppVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), 'package.json'),
    resolve(here, '../package.json'),
    resolve(here, '../../package.json'),
  ];
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    try {
      const pkg = JSON.parse(readFileSync(file, 'utf8')) as { name?: string; version?: string };
      if (pkg.name === 'tallydeck' && typeof pkg.version === 'string') return pkg.version;
    } catch {
      /* try next candidate */
    }
  }
  return '0.0.0';
}

export const config = {
  port: intFromEnv('PORT', 5555),
  host: process.env.HOST ?? '0.0.0.0',
  dbPath: process.env.DB_PATH ?? resolve(process.cwd(), 'data', 'tallydeck.db'),
  pollIntervalMinutes: intFromEnv('POLL_INTERVAL_MINUTES', 15),
  staticDir: process.env.STATIC_DIR,
  appVersion: readAppVersion(),
  /** Set UPDATE_CHECK=false to disable the GitHub release check (no outgoing request). */
  updateCheck: boolFromEnv('UPDATE_CHECK', true),
  updateRepo: process.env.UPDATE_REPO?.trim() || 'EinfachFabi/tallydeck',
  /** Optional Twitch Helix API credentials; if unset, TallyDeck uses the public Web-GQL endpoint. */
  twitchClientId: process.env.TWITCH_CLIENT_ID?.trim() || undefined,
  twitchClientSecret: process.env.TWITCH_CLIENT_SECRET?.trim() || undefined,
  twitchPollIntervalMinutes: Math.max(intFromEnv('TWITCH_POLL_INTERVAL_MINUTES', 15), 15),
};
