import type { CSSProperties } from 'react';
import type { TopicColor } from '../types';

export type TopicCustomStyle = CSSProperties & { '--tc'?: string };

export interface TopicColorTheme {
  /** Compact inline badge used in feed tables and on channel chips */
  badge: string;
  /** Topic filter pill when selected/active */
  pillActive: string;
  /** Topic filter pill when unselected (subtle colored border/dot) */
  pillIdle: string;
  /** Folder / tag icon color */
  icon: string;
  /** Unread counter badge inside topic pill */
  count: string;
  /** Solid color dot / swatch */
  dot: string;
  /** Optional CSS variable style for custom hex colors */
  badgeStyle?: TopicCustomStyle;
  pillActiveStyle?: TopicCustomStyle;
  dotStyle?: CSSProperties;
}

export const TOPIC_PALETTE: TopicColorTheme[] = [
  // 0: Monokai Cyan
  {
    badge: 'border border-accent/40 bg-accent/15 text-accent',
    pillActive: 'border-accent bg-accent/20 text-accent',
    pillIdle: 'border-line text-fg/90 hover:border-accent/60',
    icon: 'text-accent',
    count: 'bg-accent/25 text-accent',
    dot: 'bg-accent',
  },
  // 1: Monokai Green
  {
    badge: 'border border-success/40 bg-success/15 text-success',
    pillActive: 'border-success bg-success/20 text-success',
    pillIdle: 'border-line text-fg/90 hover:border-success/60',
    icon: 'text-success',
    count: 'bg-success/25 text-success',
    dot: 'bg-success',
  },
  // 2: Monokai Orange
  {
    badge: 'border border-warning/40 bg-warning/15 text-warning',
    pillActive: 'border-warning bg-warning/20 text-warning',
    pillIdle: 'border-line text-fg/90 hover:border-warning/60',
    icon: 'text-warning',
    count: 'bg-warning/25 text-warning',
    dot: 'bg-warning',
  },
  // 3: Monokai Pink / Magenta
  {
    badge: 'border border-danger/40 bg-danger/15 text-danger',
    pillActive: 'border-danger bg-danger/20 text-danger',
    pillIdle: 'border-line text-fg/90 hover:border-danger/60',
    icon: 'text-danger',
    count: 'bg-danger/25 text-danger',
    dot: 'bg-danger',
  },
  // 4: Monokai Purple
  {
    badge: 'border border-purple/40 bg-purple/15 text-purple',
    pillActive: 'border-purple bg-purple/20 text-purple',
    pillIdle: 'border-line text-fg/90 hover:border-purple/60',
    icon: 'text-purple',
    count: 'bg-purple/25 text-purple',
    dot: 'bg-purple',
  },
  // 5: Monokai Yellow
  {
    badge: 'border border-yellow/40 bg-yellow/15 text-yellow',
    pillActive: 'border-yellow bg-yellow/20 text-yellow',
    pillIdle: 'border-line text-fg/90 hover:border-yellow/60',
    icon: 'text-yellow',
    count: 'bg-yellow/25 text-yellow',
    dot: 'bg-yellow',
  },
  // 6: Teal
  {
    badge: 'border border-teal-500/40 bg-teal-500/15 text-teal-600 dark:text-teal-300',
    pillActive: 'border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-300',
    pillIdle: 'border-line text-fg/90 hover:border-teal-500/60',
    icon: 'text-teal-600 dark:text-teal-300',
    count: 'bg-teal-500/25 text-teal-600 dark:text-teal-300',
    dot: 'bg-teal-500',
  },
  // 7: Sky Blue
  {
    badge: 'border border-sky-500/40 bg-sky-500/15 text-sky-600 dark:text-sky-300',
    pillActive: 'border-sky-500 bg-sky-500/20 text-sky-600 dark:text-sky-300',
    pillIdle: 'border-line text-fg/90 hover:border-sky-500/60',
    icon: 'text-sky-600 dark:text-sky-300',
    count: 'bg-sky-500/25 text-sky-600 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  // 8: Red
  {
    badge: 'border border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400',
    pillActive: 'border-red-500 bg-red-500/20 text-red-600 dark:text-red-400',
    pillIdle: 'border-line text-fg/90 hover:border-red-500/60',
    icon: 'text-red-600 dark:text-red-400',
    count: 'bg-red-500/25 text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
  },
  // 9: Rose
  {
    badge: 'border border-rose-500/40 bg-rose-500/15 text-rose-600 dark:text-rose-400',
    pillActive: 'border-rose-500 bg-rose-500/20 text-rose-600 dark:text-rose-400',
    pillIdle: 'border-line text-fg/90 hover:border-rose-500/60',
    icon: 'text-rose-600 dark:text-rose-400',
    count: 'bg-rose-500/25 text-rose-600 dark:text-rose-400',
    dot: 'bg-rose-500',
  },
  // 10: Fuchsia
  {
    badge: 'border border-fuchsia-500/40 bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400',
    pillActive: 'border-fuchsia-500 bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-400',
    pillIdle: 'border-line text-fg/90 hover:border-fuchsia-500/60',
    icon: 'text-fuchsia-600 dark:text-fuchsia-400',
    count: 'bg-fuchsia-500/25 text-fuchsia-600 dark:text-fuchsia-400',
    dot: 'bg-fuchsia-500',
  },
  // 11: Indigo
  {
    badge: 'border border-indigo-500/40 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
    pillActive: 'border-indigo-500 bg-indigo-500/20 text-indigo-600 dark:text-indigo-400',
    pillIdle: 'border-line text-fg/90 hover:border-indigo-500/60',
    icon: 'text-indigo-600 dark:text-indigo-400',
    count: 'bg-indigo-500/25 text-indigo-600 dark:text-indigo-400',
    dot: 'bg-indigo-500',
  },
  // 12: Blue
  {
    badge: 'border border-blue-500/40 bg-blue-500/15 text-blue-600 dark:text-blue-400',
    pillActive: 'border-blue-500 bg-blue-500/20 text-blue-600 dark:text-blue-400',
    pillIdle: 'border-line text-fg/90 hover:border-blue-500/60',
    icon: 'text-blue-600 dark:text-blue-400',
    count: 'bg-blue-500/25 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  // 13: Emerald
  {
    badge: 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    pillActive: 'border-emerald-500 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    pillIdle: 'border-line text-fg/90 hover:border-emerald-500/60',
    icon: 'text-emerald-600 dark:text-emerald-400',
    count: 'bg-emerald-500/25 text-emerald-600 dark:text-emerald-400',
    dot: 'bg-emerald-500',
  },
  // 14: Lime
  {
    badge: 'border border-lime-500/40 bg-lime-500/15 text-lime-700 dark:text-lime-400',
    pillActive: 'border-lime-500 bg-lime-500/20 text-lime-700 dark:text-lime-400',
    pillIdle: 'border-line text-fg/90 hover:border-lime-500/60',
    icon: 'text-lime-700 dark:text-lime-400',
    count: 'bg-lime-500/25 text-lime-700 dark:text-lime-400',
    dot: 'bg-lime-500',
  },
  // 15: Amber
  {
    badge: 'border border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-400',
    pillActive: 'border-amber-500 bg-amber-500/20 text-amber-700 dark:text-amber-400',
    pillIdle: 'border-line text-fg/90 hover:border-amber-500/60',
    icon: 'text-amber-700 dark:text-amber-400',
    count: 'bg-amber-500/25 text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
];

const KNOWN_TOPICS: Record<string, number> = {
  tech: 0,
  technology: 0,
  technik: 0,
  homelab: 1,
  linux: 1,
  selfhosted: 1,
  server: 1,
  news: 2,
  politik: 2,
  politics: 2,
  world: 2,
  gaming: 3,
  games: 3,
  entertainment: 3,
  science: 4,
  wissenschaft: 4,
  ai: 4,
  ki: 4,
  economy: 5,
  wirtschaft: 5,
  finance: 5,
  finanzen: 5,
  security: 6,
  cybersecurity: 6,
  hardware: 6,
  dev: 7,
  coding: 7,
  programming: 7,
  software: 7,
};

/** Palette index used when no explicit color was chosen for a topic. */
export function autoTopicColorIndex(topic: string): number {
  const key = topic.trim().toLowerCase();
  if (key in KNOWN_TOPICS) return KNOWN_TOPICS[key];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % TOPIC_PALETTE.length;
}

/** Validates #rgb / #rrggbb and returns normalized lowercase #rrggbb or null. */
export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

/**
 * Color theme for a topic. `color` is the user's choice from the settings (preset index, #rrggbb hex, or null = automatic).
 * Prefer `useTopics().colorOf(name)` in components, which applies the saved colors automatically.
 */
export function getTopicColor(topic: string, color?: TopicColor): TopicColorTheme {
  if (typeof color === 'string') {
    const hex = normalizeHexColor(color);
    if (hex) {
      return {
        badge: 'topic-badge-custom',
        pillActive: 'topic-pill-custom',
        pillIdle: 'border-line text-fg/90 hover:border-muted/60',
        icon: '',
        count: 'bg-canvas/70 text-fg',
        dot: '',
        badgeStyle: { '--tc': hex },
        pillActiveStyle: { '--tc': hex },
        dotStyle: { backgroundColor: hex },
      };
    }
  }
  if (typeof color === 'number' && TOPIC_PALETTE[color]) {
    return TOPIC_PALETTE[color];
  }
  return TOPIC_PALETTE[autoTopicColorIndex(topic)];
}
