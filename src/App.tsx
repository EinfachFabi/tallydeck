import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { FeedType, VersionInfo } from './types';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { SettingsModal, type SettingsTab } from './components/SettingsModal';
import { DashboardPage } from './pages/DashboardPage';
import { TopicsProvider } from './context/TopicsContext';
import { api } from './api';
import { useLocalStorage } from './utils/useLocalStorage';

const HEALTH_POLL_MS = 30_000;
const VERSION_POLL_MS = 6 * 60 * 60 * 1000;

export default function App() {
  const location = useLocation();
  const activeFeedType: FeedType = location.pathname.startsWith('/rss') ? 'rss' : 'youtube';

  const [collapsed, setCollapsed] = useLocalStorage('tallydeck.sidebarCollapsed', false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  /** Incremented whenever data may have changed (manual, OPML import, or background sync) -> pages reload. */
  const [refreshKey, setRefreshKey] = useState(0);
  const knownSyncAt = useRef<number | null>(null);

  // Watch the server's background poller: when it finishes a sync, refresh the visible data.
  const checkHealth = useCallback(async () => {
    try {
      const health = await api.health();
      if (health.lastSyncAt && knownSyncAt.current !== null && health.lastSyncAt !== knownSyncAt.current) {
        setRefreshKey((k) => k + 1);
      }
      knownSyncAt.current = health.lastSyncAt ?? 0;
    } catch {
      /* server temporarily unavailable */
    }
  }, []);

  useEffect(() => {
    void checkHealth();
    const id = setInterval(checkHealth, HEALTH_POLL_MS);
    return () => clearInterval(id);
  }, [checkHealth]);

  useEffect(() => {
    const fetchVersion = () => {
      api
        .version()
        .then(setVersionInfo)
        .catch(() => {
          /* ignore if server unavailable */
        });
    };
    fetchVersion();
    const id = setInterval(fetchVersion, VERSION_POLL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <TopicsProvider refreshKey={refreshKey}>
      <div className="flex h-full overflow-hidden">
        <Sidebar
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          onOpenSettings={() => setSettingsTab('appearance')}
          versionInfo={versionInfo}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden">
            <Routes>
              <Route path="/" element={<Navigate to="/youtube" replace />} />
              <Route
                path="/youtube"
                element={
                  <DashboardPage
                    key="youtube"
                    type="youtube"
                    refreshKey={refreshKey}
                    onManageFeeds={() => setSettingsTab('manage')}
                  />
                }
              />
              <Route
                path="/rss"
                element={
                  <DashboardPage
                    key="rss"
                    type="rss"
                    refreshKey={refreshKey}
                    onManageFeeds={() => setSettingsTab('manage')}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/youtube" replace />} />
            </Routes>
          </main>
        </div>
        <SettingsModal
          open={settingsTab !== null}
          initialTab={settingsTab ?? 'appearance'}
          activeFeedType={activeFeedType}
          versionInfo={versionInfo}
          onVersionChange={setVersionInfo}
          onClose={() => setSettingsTab(null)}
          onImported={() => setRefreshKey((k) => k + 1)}
        />
      </div>
    </TopicsProvider>
  );
}
