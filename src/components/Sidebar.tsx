import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, RefreshCw } from 'lucide-react';
import { NAV_ITEMS } from '../navigation';
import { useI18n } from '../i18n/I18nContext';
import { cn, formatRelative } from '../utils/format';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  syncing: boolean;
  lastSyncAt: number | null;
  lastSyncAdded: number | null;
  onSync: () => void;
}

/** Tooltip shown next to icons while the sidebar is collapsed. */
function Tooltip({ label, show }: { label: string; show: boolean }) {
  if (!show) return null;
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-elevated px-2.5 py-1 text-xs font-medium text-fg opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
      {label}
    </span>
  );
}

export function Sidebar({ collapsed, onToggle, syncing, lastSyncAt, lastSyncAdded, onSync }: SidebarProps) {
  const { t, locale } = useI18n();

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-200 ease-out',
        collapsed ? 'w-18' : 'w-60',
      )}
    >
      {/* Brand + collapse toggle */}
      <div className={cn('flex h-16 items-center border-b border-line', collapsed ? 'justify-center' : 'justify-between px-4')}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <img src="/favicon.svg" alt="" className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <div className="truncate text-base font-semibold tracking-tight">{t('app.name')}</div>
              <div className="truncate text-[11px] text-muted">{t('app.tagline')}</div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="group relative rounded-lg p-2.5 text-muted transition-colors hover:bg-elevated hover:text-fg"
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          {collapsed ? <PanelLeftOpen className="h-5.5 w-5.5" /> : <PanelLeftClose className="h-5.5 w-5.5" />}
          <Tooltip label={t('nav.expand')} show={collapsed} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1.5 p-2.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const label = t(item.labelKey);
          return (
            <NavLink
              key={item.id}
              to={item.path}
              aria-label={label}
              className={({ isActive }) =>
                cn(
                  'group relative flex items-center gap-3 rounded-xl py-3 text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-0' : 'px-3.5',
                  isActive ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-elevated hover:text-fg',
                )
              }
            >
              <Icon className="h-6 w-6 shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
              <Tooltip label={label} show={collapsed} />
            </NavLink>
          );
        })}
      </nav>

      {/* Sync */}
      <div className="border-t border-line p-2.5">
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          aria-label={t('nav.syncAll')}
          className={cn(
            'group relative flex w-full items-center gap-3 rounded-xl py-3 text-sm font-medium text-muted transition-colors hover:bg-elevated hover:text-fg disabled:cursor-wait',
            collapsed ? 'justify-center' : 'px-3.5',
          )}
        >
          <RefreshCw className={cn('h-5.5 w-5.5 shrink-0', syncing && 'animate-spin text-accent')} />
          {!collapsed && <span className="truncate">{syncing ? t('nav.syncing') : t('nav.syncAll')}</span>}
          <Tooltip label={syncing ? t('nav.syncing') : t('nav.syncAll')} show={collapsed} />
        </button>
        {!collapsed && (
          <p className="truncate px-3.5 pb-1 text-[11px] text-muted/80" title={lastSyncAt ? new Date(lastSyncAt).toLocaleString(locale) : undefined}>
            {lastSyncAt ? t('nav.lastSync', { time: formatRelative(lastSyncAt, locale) }) : t('nav.neverSynced')}
            {lastSyncAdded !== null && lastSyncAdded > 0 && (
              <span className="ml-1 text-success">· {t('nav.syncDone', { count: lastSyncAdded })}</span>
            )}
          </p>
        )}
      </div>
    </aside>
  );
}
