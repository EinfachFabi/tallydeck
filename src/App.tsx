import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardPage } from './pages/DashboardPage';
import { api } from './api';
import { useLocalStorage } from './utils/useLocalStorage';

const HEALTH_POLL_MS = 30_000;

export default function App() {
  const [collapsed, setCollapsed] = useLocalStorage('tallydeck.sidebarCollapsed', false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastSyncAdded, setLastSyncAdded] = useState<number | null>(null);
  /** Incremented whenever data may have changed (manual or background sync) -> pages reload. */
  const [refreshKey, setRefreshKey] = useState(0);
  const knownSyncAt = useRef<number | null>(null);

  // Watch the server's background poller: when it finishes a sync, refresh the visible data.
  const checkHealth = useCallback(async () => {
    try {
      const health = await api.health();
      setLastSyncAt(health.lastSyncAt);
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

  const syncAll = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await api.sync();
      knownSyncAt.current = result.finishedAt;
      setLastSyncAt(result.finishedAt);
      setLastSyncAdded(result.added);
    } catch {
      /* errors are shown per feed in the channel strip */
    } finally {
      setSyncing(false);
      setRefreshKey((k) => k + 1);
    }
  }, []);

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
        syncing={syncing}
        lastSyncAt={lastSyncAt}
        lastSyncAdded={lastSyncAdded}
        onSync={syncAll}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 min-h-0 overflow-y-auto xl:overflow-hidden">
          <Routes>
            <Route path="/" element={<Navigate to="/youtube" replace />} />
            <Route path="/youtube" element={<DashboardPage key="youtube" type="youtube" refreshKey={refreshKey} />} />
            <Route path="/rss" element={<DashboardPage key="rss" type="rss" refreshKey={refreshKey} />} />
            <Route path="*" element={<Navigate to="/youtube" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
