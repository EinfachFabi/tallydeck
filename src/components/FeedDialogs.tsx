import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, LoaderCircle, Plus, Rss, Trash2, X } from 'lucide-react';
import type { Feed, FeedType } from '../types';
import { useI18n } from '../i18n/I18nContext';
import { useTopics } from '../context/TopicsContext';
import { cn } from '../utils/format';
import { YouTubeIcon } from './YouTubeIcon';

function rssSiteFavicon(feed: {
  siteUrl?: string | null;
  sourceUrl?: string | null;
  feedUrl?: string;
}): string | null {
  for (const candidate of [feed.siteUrl, feed.sourceUrl, feed.feedUrl]) {
    if (!candidate) continue;
    try {
      const u = new URL(candidate);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return `${u.origin}/favicon.ico`;
      }
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Channel avatar (falls back to site /favicon.ico for RSS, then to a YouTube / RSS icon). */
export function FeedAvatar({
  feed,
  size = 'md',
}: {
  feed: Pick<Feed, 'iconUrl' | 'type'> & {
    siteUrl?: string | null;
    sourceUrl?: string | null;
    feedUrl?: string;
  };
  size?: 'sm' | 'md';
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const box = size === 'sm' ? 'h-5 w-5' : 'h-7 w-7';
  const primary = feed.iconUrl;
  const fallback = feed.type === 'rss' ? rssSiteFavicon(feed) : null;
  const src = primary && failedSrc !== primary ? primary : fallback && failedSrc !== fallback ? fallback : null;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailedSrc(src)}
        className={cn(box, 'shrink-0 rounded-full bg-elevated object-cover')}
      />
    );
  }
  const Icon = feed.type === 'youtube' ? YouTubeIcon : Rss;
  return (
    <span className={cn(box, 'flex shrink-0 items-center justify-center rounded-full bg-elevated')}>
      <Icon className={cn('h-3.5 w-3.5', feed.type === 'youtube' ? 'text-youtube' : 'text-warning')} />
    </span>
  );
}

/** Closes nested dialogs on Escape without also closing a surrounding modal (e.g. the settings). */
function useEscape(onEscape: () => void, enabled = true) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        ref.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}

function DialogShell({
  title,
  icon,
  onClose,
  busy,
  children,
  maxWidth = 'max-w-md',
}: {
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
  maxWidth?: string;
}) {
  const { t } = useI18n();
  useEscape(() => !busy && onClose());
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn('w-full animate-fade-in rounded-2xl border border-line bg-surface p-5 shadow-2xl', maxWidth)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {icon}
            <h3 className="truncate text-base font-semibold">{title}</h3>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted hover:bg-elevated hover:text-fg"
            aria-label={t('common.cancel')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Text input + clickable topic chips (existing topics first, then presets). */
export function TopicPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const { t } = useI18n();
  const { topics, colorOf } = useTopics();

  const suggestions = useMemo(() => {
    const presets = t('common.presetTopics')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const name of [...topics.map((topic) => topic.name), ...presets]) {
      const key = name.toLocaleLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(name);
      }
    }
    return result;
  }, [topics, t]);

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('common.topicPlaceholder')}
        className="w-full rounded-lg border border-line bg-canvas px-3.5 py-2 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
      />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange('')}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
            value.trim() === ''
              ? 'border-accent bg-accent/15 text-accent'
              : 'border-line text-muted hover:border-muted/60 hover:text-fg',
          )}
        >
          {t('common.noTopic')}
        </button>
        {suggestions.map((topic) => {
          const active = value.trim().toLocaleLowerCase() === topic.toLocaleLowerCase();
          const color = colorOf(topic);
          return (
            <button
              key={topic}
              type="button"
              onClick={() => onChange(active ? '' : topic)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                active ? color.pillActive : color.badge + ' opacity-80 hover:opacity-100',
              )}
              style={active ? color.pillActiveStyle : color.badgeStyle}
            >
              {topic}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface AddFeedDialogProps {
  type: FeedType;
  initialTopic?: string;
  onClose: () => void;
  /** Adds the feed and returns a success message. Throws with a user-facing message on failure. */
  onSubmit: (url: string, category: string | null) => Promise<string>;
  onAdded: (message: string) => void;
}

export function AddFeedDialog({ type, initialTopic = '', onClose, onSubmit, onAdded }: AddFeedDialogProps) {
  const { t } = useI18n();
  const [url, setUrl] = useState('');
  const [topic, setTopic] = useState(initialTopic);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || adding) return;
    setAdding(true);
    setError(null);
    try {
      const message = await onSubmit(url.trim(), topic.trim() || null);
      onAdded(message);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAdding(false);
    }
  }

  return (
    <DialogShell title={t(`${type}.addTitle`)} onClose={onClose} busy={adding} maxWidth="max-w-lg">
      <p className="mt-1.5 text-xs text-muted">{t(`${type}.addHint`)}</p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <input
          type="text"
          autoFocus
          disabled={adding}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t(`${type}.addPlaceholder`)}
          className="w-full rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-sm placeholder:text-muted/70 focus:border-accent focus:outline-none"
        />

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
            {t('common.topicLabel')}
          </label>
          <TopicPicker value={topic} onChange={setTopic} />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-danger/15 px-3 py-2 text-xs text-danger">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={adding}
            onClick={onClose}
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-elevated hover:text-fg"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={adding || !url.trim()}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-canvas hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {adding ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span>{t(`${type}.addButton`)}</span>
          </button>
        </div>
      </form>
    </DialogShell>
  );
}

interface ConfirmDeleteDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmDeleteDialog({ title, message, confirmLabel, onClose, onConfirm }: ConfirmDeleteDialogProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell
      title={title}
      onClose={onClose}
      busy={busy}
      icon={
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger">
          <Trash2 className="h-5 w-5" />
        </span>
      }
    >
      <p className="mt-3 text-sm text-muted">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-muted hover:bg-elevated hover:text-fg"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void confirm()}
          className="flex items-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          <span>{confirmLabel}</span>
        </button>
      </div>
    </DialogShell>
  );
}
