import { resolve } from 'node:path';

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = {
  port: intFromEnv('PORT', 5555),
  host: process.env.HOST ?? '0.0.0.0',
  dbPath: process.env.DB_PATH ?? resolve(process.cwd(), 'data', 'tallydeck.db'),
  pollIntervalMinutes: intFromEnv('POLL_INTERVAL_MINUTES', 15),
  staticDir: process.env.STATIC_DIR,
};
