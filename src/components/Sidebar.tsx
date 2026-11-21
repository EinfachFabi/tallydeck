import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
import type { VersionInfo } from '../types';
import { NAV_ITEMS } from '../navigation';
import { useI18n } from '../i18n/I18nContext';
import { cn } from '../utils/format';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onOpenSettings: () => void;
  versionInfo: VersionInfo | null;
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

export function Sidebar({ collapsed, onToggle, onOpenSettings, versionInfo }: SidebarProps) {
  const { t } = useI18n();
  const currentVersion = versionInfo?.current ?? __APP_VERSION__;
  const updateAvailable = Boolean(versionInfo?.updateAvailable && versionInfo.latest);
  const releaseHref = versionInfo?.releaseUrl ?? versionInfo?.releasesUrl;

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-line bg-sidebar transition-[width] duration-200 ease-out',
        collapsed ? 'w-18' : 'w-60',
      )}
    >
      {/* Brand + collapse toggle */}
      <div className={cn('flex h-16 items-center border-b border-line', collapsed ? 'justify-center' : 'justify-between px-3')}>
        {!collapsed && (
          <div className="flex min-w-0 items-center gap-2.5 overflow-hidden">
            <img src="/favicon.svg" alt="" className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <div className="truncate text-base font-semibold tracking-tight">{t('app.name')}</div>
              <div className="flex items-center gap-1.5 truncate text-[10.5px] leading-tight text-muted">
                <span className="shrink-0 tabular-nums">v{currentVersion}</span>
                {updateAvailable && versionInfo?.latest && releaseHref && (
                  <a
                    href={releaseHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={t('update.availableTooltip', { version: `v${versionInfo.latest}` })}
                    className="inline-flex min-w-0 items-center gap-1 font-medium text-success transition-opacity hover:underline"
                  >
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
                    <span className="truncate">{t('update.badge', { version: `v${versionInfo.latest}` })}</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="group relative shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-elevated hover:text-fg"
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

      {/* Settings button at the bottom of the left sidebar */}
      <div className="border-t border-line p-2.5">
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label={t('nav.settings')}
          className={cn(
            'group relative flex w-full items-center gap-3 rounded-xl py-3 text-sm font-medium text-muted transition-colors hover:bg-elevated hover:text-fg',
            collapsed ? 'justify-center' : 'px-3.5',
          )}
        >
          <span className="relative shrink-0">
            <Settings className="h-5.5 w-5.5" />
            {collapsed && updateAvailable && (
              <span
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-sidebar"
                aria-hidden="true"
              />
            )}
          </span>
          {!collapsed && <span className="flex-1 truncate text-left">{t('nav.settings')}</span>}
          {!collapsed && updateAvailable && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
          )}
          <Tooltip label={t('nav.settings')} show={collapsed} />
        </button>
      </div>
    </aside>
  );
}
