import { useState } from 'react';
import { Check, CheckCircle2, Copy, ExternalLink, LoaderCircle, RefreshCw, Terminal } from 'lucide-react';
import type { VersionInfo } from '../types';
import { api } from '../api';
import { useI18n } from '../i18n/I18nContext';
import { cn, formatRelative } from '../utils/format';

interface InfoTabProps {
  versionInfo: VersionInfo | null;
  onVersionChange: (info: VersionInfo) => void;
}

const DEFAULT_REPO_URL = 'https://github.com/EinfachFabi/tallydeck';
const DEFAULT_RELEASES_URL = `${DEFAULT_REPO_URL}/releases`;

/** Copies text, falling back to a temporary textarea when navigator.clipboard is unavailable (plain HTTP LAN). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback below */
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

export function InfoTab({ versionInfo, onVersionChange }: InfoTabProps) {
  const { t, locale } = useI18n();
  const [checking, setChecking] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'pull' | 'compose' | null>(null);

  const currentVersion = versionInfo?.current ?? __APP_VERSION__;
  const repoUrl = versionInfo?.repoUrl ?? DEFAULT_REPO_URL;
  const changelogUrl = versionInfo?.releaseUrl ?? versionInfo?.releasesUrl ?? DEFAULT_RELEASES_URL;
  const dockerPullCmd = versionInfo ? `docker pull ${versionInfo.dockerImage}:latest` : '';
  const dockerComposeCmd = 'docker compose pull && docker compose up -d';

  async function handleCheckNow() {
    if (checking) return;
    setChecking(true);
    try {
      const next = await api.checkVersion();
      onVersionChange(next);
    } catch {
      /* ignore temporary network error */
    } finally {
      setChecking(false);
    }
  }

  async function handleCopy(key: 'pull' | 'compose', text: string) {
    if (!text) return;
    if (await copyText(text)) {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
    }
  }

  return (
    <div className="space-y-4">
      {/* App Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-canvas/60 p-4">
        <div className="flex items-center gap-3.5">
          <img src="/favicon.svg" alt="" className="h-11 w-11 shrink-0" />
          <div>
            <div className="text-base font-semibold tracking-tight">{t('app.name')}</div>
            <p className="text-xs text-muted">{t('settings.info.description')}</p>
          </div>
        </div>
        <a
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent"
        >
          <span>{t('settings.info.githubRepo')}</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {/* Version & Update Status Card */}
      <div className="space-y-4 rounded-xl border border-line bg-canvas/60 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-line/70 bg-surface px-3.5 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t('settings.info.currentVersion')}
            </div>
            <div className="mt-1 text-base font-semibold tabular-nums">v{currentVersion}</div>
          </div>

          <div className="rounded-lg border border-line/70 bg-surface px-3.5 py-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t('settings.info.latestVersion')}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {versionInfo?.checkEnabled === false ? (
                <span className="text-xs text-muted">{t('settings.info.checkDisabled')}</span>
              ) : checking ? (
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent" />
                  <span>{t('settings.info.checking')}</span>
                </span>
              ) : versionInfo?.error ? (
                <span className="text-xs text-warning" title={versionInfo.error}>
                  {t('settings.info.checkFailed')}
                </span>
              ) : versionInfo?.latest ? (
                <>
                  <span className="text-base font-semibold tabular-nums">v{versionInfo.latest}</span>
                  {versionInfo.updateAvailable ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" />
                      {t('settings.info.updateAvailable')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">
                      <CheckCircle2 className="h-3 w-3" />
                      {t('settings.info.upToDate')}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted">{t('settings.info.noRelease')}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-line/60 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={changelogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent"
            >
              <span>{t('settings.info.changelog')}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            {versionInfo?.checkEnabled !== false && (
              <button
                type="button"
                disabled={checking}
                onClick={() => void handleCheckNow()}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-fg transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin text-accent')} />
                <span>{checking ? t('settings.info.checking') : t('settings.info.checkNow')}</span>
              </button>
            )}
          </div>

          {versionInfo?.checkedAt && (
            <span className="text-xs text-muted">
              {t('settings.info.lastChecked', { time: formatRelative(versionInfo.checkedAt, locale) })}
            </span>
          )}
        </div>
      </div>

      {/* Docker Update Instructions (shown ONLY when a new release is available) */}
      {versionInfo?.updateAvailable && (
        <div className="space-y-3 rounded-xl border border-success/40 bg-success/5 p-4">
          <div className="flex items-start gap-2.5">
            <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <div>
              <h3 className="text-sm font-semibold text-fg">{t('settings.info.dockerUpdateTitle')}</h3>
              <p className="mt-0.5 text-xs text-muted">{t('settings.info.dockerUpdateHint')}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
              <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-fg">
                {dockerPullCmd}
              </code>
              <button
                type="button"
                onClick={() => void handleCopy('pull', dockerPullCmd)}
                className="flex shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-fg transition-colors hover:border-accent hover:text-accent"
              >
                {copiedKey === 'pull' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-success" />
                    <span className="text-success">{t('settings.info.copied')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>{t('settings.info.copy')}</span>
                  </>
                )}
              </button>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] font-medium text-muted">{t('settings.info.dockerComposeLabel')}</div>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs text-fg">
                  {dockerComposeCmd}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy('compose', dockerComposeCmd)}
                  className="flex shrink-0 items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-fg transition-colors hover:border-accent hover:text-accent"
                >
                  {copiedKey === 'compose' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-success" />
                      <span className="text-success">{t('settings.info.copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>{t('settings.info.copy')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
