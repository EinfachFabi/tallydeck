import { useState, type ReactNode } from 'react';
import { Check, CheckCheck, ExternalLink, Inbox, PartyPopper, RefreshCw, Rss, Undo2 } from 'lucide-react';
import type { FeedType, Item } from '../types';
import { useI18n } from '../i18n/I18nContext';
import { useSettings, type ViewDensity } from '../context/SettingsContext';
import { cn, formatDateTime, formatRelative } from '../utils/format';
import { getTopicColor } from '../utils/topicColor';
import { YouTubeIcon } from './YouTubeIcon';

interface SplitFeedTablesProps {
  type: FeedType;
  uncompleted: Item[];
  completed: Item[];
  completedTotal: number;
  completedDays: number;
  onToggle: (item: Item, completed: boolean) => void;
  onCompleteAll: () => void;
  onSync: () => void;
  syncing: boolean;
  onLoadMore: () => void;
  searching: boolean;
}

/** All external links open in a new tab. */
const EXTERNAL = { target: '_blank', rel: 'noopener noreferrer' } as const;

function Thumbnail({ item, type, done }: { item: Item; type: FeedType; done?: boolean }) {
  const [broken, setBroken] = useState(false);
  const { t } = useI18n();
  const isYouTube = type === 'youtube';
  const box = isYouTube ? 'w-28 aspect-video' : 'w-16 h-12';

  return (
    <a
      href={item.url}
      {...EXTERNAL}
      tabIndex={-1}
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-lg border border-line/60 bg-elevated transition-all',
        box,
        done && 'grayscale opacity-50 group-hover:opacity-75',
      )}
    >
      {item.thumbnailUrl && !broken ? (
        <img
          src={item.thumbnailUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className={cn(
            'h-full w-full object-cover transition-transform duration-300',
            !done && 'hover:scale-105',
          )}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          {isYouTube ? (
            <YouTubeIcon className="h-6 w-6 text-youtube/75" />
          ) : (
            <Rss className="h-5 w-5 text-warning/75" />
          )}
        </span>
      )}
      {item.isShort && (
        <span className="absolute bottom-1 right-1 rounded bg-youtube px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
          {t('common.short')}
        </span>
      )}
    </a>
  );
}

function ItemCell({
  item,
  type,
  done,
  density,
}: {
  item: Item;
  type: FeedType;
  done?: boolean;
  density: ViewDensity;
}) {
  const { t, locale } = useI18n();
  const compact = density === 'compact';

  if (compact) {
    return (
      <div className="flex min-w-0 items-center justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {item.feedCategory && (
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.25 text-[10px] font-semibold',
                getTopicColor(item.feedCategory).badge,
              )}
            >
              {item.feedCategory}
            </span>
          )}
          {item.isShort && (
            <span className="shrink-0 rounded bg-youtube px-1.5 py-0.25 text-[10px] font-bold uppercase text-white">
              {t('common.short')}
            </span>
          )}
          <a
            href={item.url}
            {...EXTERNAL}
            title={item.summary ?? item.title}
            className={cn(
              'truncate text-sm font-medium transition-colors hover:text-accent hover:underline',
              done ? 'text-muted/75 line-through decoration-muted/60' : 'text-fg',
            )}
          >
            {item.title}
          </a>
        </div>
        <span className="max-w-36 shrink-0 truncate text-xs text-muted">{item.feedTitle}</span>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3.5">
      <Thumbnail item={item} type={type} done={done} />
      <div className="min-w-0 flex-1">
        <a
          href={item.url}
          {...EXTERNAL}
          title={item.summary ?? item.title}
          className={cn(
            'line-clamp-2 text-sm font-medium leading-snug transition-colors hover:text-accent hover:underline',
            done ? 'text-muted/75 line-through decoration-muted/60' : 'text-fg',
          )}
        >
          {item.title}
        </a>
        <div className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted">
          {item.feedCategory && (
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.25 text-[10px] font-semibold',
                getTopicColor(item.feedCategory).badge,
              )}
            >
              {item.feedCategory}
            </span>
          )}
          <span className="truncate font-medium">{item.feedTitle}</span>
          {item.author && item.author !== item.feedTitle && <span className="truncate">· {item.author}</span>}
          {done && item.publishedAt && (
            <span
              className="shrink-0"
              title={`${t('common.published')}: ${formatDateTime(item.publishedAt, locale)}`}
            >
              · {formatRelative(item.publishedAt, locale)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  count,
  icon,
  mutedPanel,
  action,
  children,
}: {
  title: string;
  count: string;
  icon: ReactNode;
  mutedPanel?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-surface',
        mutedPanel && 'bg-surface/75',
      )}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          {icon}
          <h2 className={cn('text-base font-semibold', mutedPanel && 'text-muted')}>{title}</h2>
          <span className="rounded-full bg-elevated px-2.5 py-0.5 text-xs font-medium tabular-nums text-muted">
            {count}
          </span>
        </div>
        {action}
      </header>
      {/* Fixed height on stacked small screens, full remaining viewport height on desktop -> no outer+inner double scroll */}
      <div className="h-[58vh] min-h-0 overflow-y-auto xl:h-auto xl:flex-1">{children}</div>
    </section>
  );
}

function EmptyState({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2.5 px-6 py-12 text-center text-sm text-muted">
      {icon}
      <p className="max-w-xs">{text}</p>
    </div>
  );
}

const TH =
  'sticky top-0 z-10 bg-surface/95 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted backdrop-blur';

export function SplitFeedTables(props: SplitFeedTablesProps) {
  const {
    type,
    uncompleted,
    completed,
    completedTotal,
    completedDays,
    onToggle,
    onCompleteAll,
    onSync,
    syncing,
    onLoadMore,
    searching,
  } = props;
  const { t, locale } = useI18n();
  const { viewDensity } = useSettings();
  const compact = viewDensity === 'compact';

  const daysBadgeLabel =
    completedDays === 1
      ? t('common.last1Day')
      : completedDays === 7
        ? t('common.last7Days')
        : t('common.lastNDays', { days: completedDays });

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-2">
      {/* LEFT: new / unread (foreground focus) */}
      <Panel
        title={t(`${type}.leftTitle`)}
        count={String(uncompleted.length)}
        icon={<Inbox className="h-5 w-5 text-accent" />}
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              title={t(`${type}.syncButton`)}
              aria-label={t(`${type}.syncButton`)}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-elevated/60 px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent hover:bg-accent/15 hover:text-accent disabled:cursor-wait"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin text-accent')} />
              <span>{syncing ? t('nav.syncing') : t('nav.sync')}</span>
            </button>
            {uncompleted.length > 0 && (
              <button
                type="button"
                onClick={onCompleteAll}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-elevated/60 px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:border-success hover:bg-success/15 hover:text-success"
              >
                <CheckCheck className="h-4 w-4" />
                <span>{t(`${type}.markAllDone`)}</span>
              </button>
            )}
          </div>
        }
      >
        {uncompleted.length === 0 ? (
          <EmptyState
            icon={<PartyPopper className="h-9 w-9 text-success/80" />}
            text={searching ? t('common.noResults') : t(`${type}.emptyLeft`)}
          />
        ) : (
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr>
                <th className={cn(TH, 'w-14 text-center')} aria-label={t(`${type}.markDone`)} />
                <th className={TH}>{t('common.item')}</th>
                <th className={cn(TH, 'hidden w-28 sm:table-cell')}>{t('common.published')}</th>
                <th className={cn(TH, 'w-13')} />
              </tr>
            </thead>
            <tbody>
              {uncompleted.map((item) => (
                <tr key={item.id} className="group animate-fade-in border-t border-line/60 hover:bg-elevated/55">
                  <td className={cn('px-3 align-middle', compact ? 'py-1.5' : 'py-2.5')}>
                    <button
                      type="button"
                      onClick={() => onToggle(item, true)}
                      title={t(`${type}.markDone`)}
                      aria-label={t(`${type}.markDone`)}
                      className={cn(
                        'flex items-center justify-center rounded-lg border-2 border-line bg-canvas/70 text-muted/60 transition-all hover:scale-105 hover:border-success hover:bg-success/20 hover:text-success',
                        compact ? 'h-7 w-7' : 'h-9 w-9',
                      )}
                    >
                      <Check className={cn('stroke-[2.5]', compact ? 'h-4 w-4' : 'h-5 w-5')} />
                    </button>
                  </td>
                  <td className={cn('pr-2', compact ? 'py-1.5' : 'py-2.5')}>
                    <ItemCell item={item} type={type} density={viewDensity} />
                  </td>
                  <td
                    className={cn('hidden px-3 text-xs text-muted sm:table-cell', compact ? 'py-1.5' : 'py-2.5')}
                    title={formatDateTime(item.publishedAt, locale)}
                  >
                    {formatRelative(item.publishedAt ?? item.createdAt, locale)}
                  </td>
                  <td className={cn('pr-3 text-right', compact ? 'py-1.5' : 'py-2.5')}>
                    <a
                      href={item.url}
                      {...EXTERNAL}
                      title={t('common.open')}
                      aria-label={t('common.open')}
                      className={cn(
                        'inline-flex items-center justify-center rounded-lg text-muted transition-colors hover:bg-elevated hover:text-accent',
                        compact ? 'h-7 w-7' : 'h-9 w-9',
                      )}
                    >
                      <ExternalLink className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {/* RIGHT: watched / read (receded with grayscale thumbnails & strikethrough titles, configurable retention days) */}
      <Panel
        title={t(`${type}.rightTitle`)}
        count={
          completed.length < completedTotal
            ? t('common.showing', { shown: completed.length, total: completedTotal })
            : String(completedTotal)
        }
        icon={<CheckCheck className="h-5 w-5 text-success" />}
        mutedPanel
        action={
          <span className="rounded-md border border-line/70 bg-elevated/50 px-2 py-0.5 text-[11px] font-medium text-muted">
            {daysBadgeLabel}
          </span>
        }
      >
        {completed.length === 0 ? (
          <EmptyState
            icon={<CheckCheck className="h-9 w-9 text-muted/50" />}
            text={searching ? t('common.noResults') : t(`${type}.emptyRight`, { days: completedDays })}
          />
        ) : (
          <>
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr>
                  <th className={cn(TH, 'pl-4')}>{t('common.item')}</th>
                  <th className={cn(TH, 'hidden w-32 sm:table-cell')}>{t(`${type}.completedAt`)}</th>
                  <th className={cn(TH, 'w-14')} />
                </tr>
              </thead>
              <tbody>
                {completed.map((item) => (
                  <tr
                    key={item.id}
                    className="group animate-fade-in border-t border-line/60 hover:bg-elevated/45"
                  >
                    <td className={cn('pl-4 pr-2', compact ? 'py-1.5' : 'py-2.5')}>
                      <ItemCell item={item} type={type} done density={viewDensity} />
                    </td>
                    <td
                      className={cn('hidden px-3 text-xs text-muted/80 sm:table-cell', compact ? 'py-1.5' : 'py-2.5')}
                      title={formatDateTime(item.completedAt, locale)}
                    >
                      {formatRelative(item.completedAt, locale)}
                    </td>
                    <td className={cn('pr-3 text-right', compact ? 'py-1.5' : 'py-2.5')}>
                      <button
                        type="button"
                        onClick={() => onToggle(item, false)}
                        title={t('common.undo')}
                        aria-label={t('common.undo')}
                        className={cn(
                          'inline-flex items-center justify-center rounded-lg text-muted transition-colors hover:bg-elevated hover:text-warning',
                          compact ? 'h-7 w-7' : 'h-9 w-9',
                        )}
                      >
                        <Undo2 className={compact ? 'h-4 w-4' : 'h-5 w-5'} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {completed.length < completedTotal && (
              <div className="border-t border-line/60 p-3 text-center">
                <button
                  type="button"
                  onClick={onLoadMore}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-accent hover:bg-elevated"
                >
                  {t('common.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
