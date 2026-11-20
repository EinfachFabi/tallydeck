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
}

const PALETTE: TopicColorTheme[] = [
  // 0: Monokai Cyan
  {
    badge: 'border border-accent/40 bg-accent/15 text-accent',
    pillActive: 'border-accent bg-accent/20 text-accent',
    pillIdle: 'border-line text-fg/90 hover:border-accent/60',
    icon: 'text-accent',
    count: 'bg-accent/25 text-accent',
  },
  // 1: Monokai Green
  {
    badge: 'border border-success/40 bg-success/15 text-success',
    pillActive: 'border-success bg-success/20 text-success',
    pillIdle: 'border-line text-fg/90 hover:border-success/60',
    icon: 'text-success',
    count: 'bg-success/25 text-success',
  },
  // 2: Monokai Orange
  {
    badge: 'border border-warning/40 bg-warning/15 text-warning',
    pillActive: 'border-warning bg-warning/20 text-warning',
    pillIdle: 'border-line text-fg/90 hover:border-warning/60',
    icon: 'text-warning',
    count: 'bg-warning/25 text-warning',
  },
  // 3: Monokai Pink / Magenta
  {
    badge: 'border border-danger/40 bg-danger/15 text-danger',
    pillActive: 'border-danger bg-danger/20 text-danger',
    pillIdle: 'border-line text-fg/90 hover:border-danger/60',
    icon: 'text-danger',
    count: 'bg-danger/25 text-danger',
  },
  // 4: Monokai Purple
  {
    badge: 'border border-purple/40 bg-purple/15 text-purple',
    pillActive: 'border-purple bg-purple/20 text-purple',
    pillIdle: 'border-line text-fg/90 hover:border-purple/60',
    icon: 'text-purple',
    count: 'bg-purple/25 text-purple',
  },
  // 5: Monokai Yellow
  {
    badge: 'border border-yellow/40 bg-yellow/15 text-yellow',
    pillActive: 'border-yellow bg-yellow/20 text-yellow',
    pillIdle: 'border-line text-fg/90 hover:border-yellow/60',
    icon: 'text-yellow',
    count: 'bg-yellow/25 text-yellow',
  },
  // 6: Teal
  {
    badge: 'border border-teal-500/40 bg-teal-500/15 text-teal-600 dark:text-teal-300',
    pillActive: 'border-teal-500 bg-teal-500/20 text-teal-600 dark:text-teal-300',
    pillIdle: 'border-line text-fg/90 hover:border-teal-500/60',
    icon: 'text-teal-600 dark:text-teal-300',
    count: 'bg-teal-500/25 text-teal-600 dark:text-teal-300',
  },
  // 7: Sky Blue
  {
    badge: 'border border-sky-500/40 bg-sky-500/15 text-sky-600 dark:text-sky-300',
    pillActive: 'border-sky-500 bg-sky-500/20 text-sky-600 dark:text-sky-300',
    pillIdle: 'border-line text-fg/90 hover:border-sky-500/60',
    icon: 'text-sky-600 dark:text-sky-300',
    count: 'bg-sky-500/25 text-sky-600 dark:text-sky-300',
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

export function getTopicColor(topic: string): TopicColorTheme {
  const key = topic.trim().toLowerCase();
  if (key in KNOWN_TOPICS) {
    return PALETTE[KNOWN_TOPICS[key]];
  }
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
