import type { ComponentType } from 'react';
import { CalendarDays, CheckCheck, Inbox, Layers, TrendingUp } from 'lucide-react';
import type { FeedType, Stats } from '../types';
import { useI18n } from '../i18n/I18nContext';
import { cn, formatNumber } from '../utils/format';

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  hintClass,
  accent,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
  hintClass?: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className={cn('rounded-lg p-2', accent)}>
          <Icon className="h-4.5 w-4.5" />
        </span>
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className={cn('mt-0.5 truncate text-xs', hintClass ?? 'text-muted')}>{hint}</div>}
    </div>
  );
}

function WeeklyChart({ label, weekly }: { label: string; weekly: number[] }) {
  const { t } = useI18n();
  const max = Math.max(1, ...weekly);
  return (
    <div className="col-span-2 rounded-xl border border-line bg-surface p-3.5 md:col-span-3 xl:col-span-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <div className="mt-2.5 flex h-13 items-end gap-1.5">
        {weekly.map((value, i) => {
          const weeksAgo = weekly.length - 1 - i;
          const title = `${weeksAgo === 0 ? t('common.thisWeek') : t('common.weeksAgo', { count: weeksAgo })}: ${value}`;
          return (
            <div key={i} className="group relative flex h-full flex-1 items-end" title={title}>
              <div
                className={cn(
                  'w-full rounded-sm transition-all',
                  weeksAgo === 0 ? 'bg-success' : 'bg-accent/40 group-hover:bg-accent/70',
                )}
                style={{ height: `${Math.max(8, (value / max) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StatsBar({ type, stats }: { type: FeedType; stats: Stats | null }) {
  const { t, locale } = useI18n();
  const s = stats ?? {
    totalCompleted: 0,
    completedThisWeek: 0,
    completedLastWeek: 0,
    avgPerWeek: 0,
    pendingCount: 0,
    feedCount: 0,
    weekly: new Array(8).fill(0),
  };
  const diff = s.completedThisWeek - s.completedLastWeek;

  return (
    <section className="grid shrink-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatCard
        icon={CheckCheck}
        label={t(`${type}.statTotal`)}
        value={formatNumber(s.totalCompleted, locale)}
        accent="bg-success/15 text-success"
      />
      <StatCard
        icon={CalendarDays}
        label={t(`${type}.statWeek`)}
        value={formatNumber(s.completedThisWeek, locale)}
        hint={t('common.vsLastWeek', { diff: `${diff > 0 ? '+' : ''}${diff}` })}
        hintClass={diff > 0 ? 'text-success' : diff < 0 ? 'text-warning' : undefined}
        accent="bg-accent/15 text-accent"
      />
      <StatCard
        icon={TrendingUp}
        label={t(`${type}.statAvg`)}
        value={formatNumber(s.avgPerWeek, locale)}
        accent="bg-yellow/15 text-yellow"
      />
      <StatCard
        icon={Inbox}
        label={t(`${type}.statPending`)}
        value={formatNumber(s.pendingCount, locale)}
        accent="bg-warning/15 text-warning"
      />
      <StatCard
        icon={Layers}
        label={t(`${type}.statFeeds`)}
        value={formatNumber(s.feedCount, locale)}
        accent="bg-purple/15 text-purple"
      />
      <WeeklyChart label={t(`${type}.statChart`)} weekly={s.weekly} />
    </section>
  );
}
