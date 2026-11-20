import { ApiError } from '../api';
import type { TFunction } from '../i18n/I18nContext';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function formatRelative(ts: number | null, locale: string, now = Date.now()): string {
  if (!ts) return '–';
  const seconds = Math.round((ts - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, 'minute');
}

export function formatDateTime(ts: number | null, locale: string): string {
  if (!ts) return '–';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(ts);
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

export function errorText(err: unknown, t: TFunction): string {
  if (err instanceof ApiError) {
    const key = `errors.${err.code}`;
    const translated = t(key);
    return translated === key ? err.message || t('errors.unknown') : translated;
  }
  return t('errors.unknown');
}

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
