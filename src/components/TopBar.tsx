import { useLocation } from 'react-router-dom';
import { Languages } from 'lucide-react';
import { NAV_ITEMS } from '../navigation';
import { LANGUAGES, useI18n } from '../i18n/I18nContext';
import { cn } from '../utils/format';

export function TopBar() {
  const { t, language, setLanguage } = useI18n();
  const { pathname } = useLocation();
  const active = NAV_ITEMS.find((item) => pathname.startsWith(item.path));

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-canvas/80 px-6 backdrop-blur">
      <div className="min-w-0">
        {active && (
          <>
            <h1 className="truncate text-lg font-semibold tracking-tight">{t(`pages.${active.id}.title`)}</h1>
            <p className="truncate text-xs text-muted">{t(`pages.${active.id}.subtitle`)}</p>
          </>
        )}
      </div>

      {/* Language switcher – top right corner */}
      <div className="flex items-center gap-2.5" role="group" aria-label={t('topbar.language')}>
        <Languages className="h-5 w-5 text-muted" aria-hidden="true" />
        <div className="flex rounded-lg border border-line bg-surface p-1">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              title={lang.name}
              onClick={() => setLanguage(lang.code)}
              aria-pressed={language === lang.code}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                language === lang.code ? 'bg-accent text-canvas' : 'text-muted hover:text-fg',
              )}
            >
              {lang.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
