import { useLocation } from 'react-router-dom';
import { Languages } from 'lucide-react';
import { NAV_ITEMS } from '../navigation';
import { LANGUAGES, useI18n } from '../i18n/I18nContext';
import { cn } from '../utils/format';

const GITHUB_URL = 'https://github.com/EinfachFabi/tallydeck';

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
    </svg>
  );
}

export function TopBar() {
  const { t, language, setLanguage } = useI18n();
  const { pathname } = useLocation();
  const active = NAV_ITEMS.find((item) => pathname.startsWith(item.path));

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-canvas/80 px-6 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        {active && (
          <>
            {active.externalUrl ? (
              <a
                href={active.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={active.externalLabelKey ? t(active.externalLabelKey) : undefined}
                aria-label={active.externalLabelKey ? t(active.externalLabelKey) : t(active.labelKey)}
                className="inline-flex shrink-0 items-center justify-center rounded-lg transition-transform hover:scale-110"
              >
                <active.brandLogo className="h-8 w-8" />
              </a>
            ) : (
              <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center">
                <active.brandLogo className="h-8 w-8" />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">{t(`pages.${active.id}.title`)}</h1>
              <p className="truncate text-xs text-muted">{t(`pages.${active.id}.subtitle`)}</p>
            </div>
          </>
        )}
      </div>

      {/* Language switcher + GitHub repository link button – top right corner */}
      <div className="flex items-center gap-3">
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

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={t('topbar.github')}
          aria-label={t('topbar.github')}
          className="flex h-8.5 w-8.5 items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:border-accent hover:text-accent"
        >
          <GitHubIcon className="h-4.5 w-4.5" />
        </a>
      </div>
    </header>
  );
}
