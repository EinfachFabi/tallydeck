import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Topic } from '../types';
import { api } from '../api';
import { getTopicColor, type TopicColorTheme } from '../utils/topicColor';

interface TopicsContextValue {
  /** All topics (with saved colors and feed counts), sorted by name. */
  topics: Topic[];
  /** Reloads the topic list from the server. */
  reload: () => Promise<void>;
  /** Replaces the topic list (e.g. with the response of a topic mutation). */
  setTopics: (topics: Topic[]) => void;
  /** Color theme of a topic, respecting the color chosen in the settings. */
  colorOf: (name: string) => TopicColorTheme;
}

const TopicsContext = createContext<TopicsContextValue | null>(null);

export function TopicsProvider({ children, refreshKey }: { children: ReactNode; refreshKey?: number }) {
  const [topics, setTopics] = useState<Topic[]>([]);

  const reload = useCallback(async () => {
    try {
      setTopics(await api.getTopics());
    } catch {
      /* server temporarily unavailable – keep the last known topics */
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const colorOf = useCallback(
    (name: string) => {
      const key = name.trim().toLocaleLowerCase();
      const topic = topics.find((t) => t.name.toLocaleLowerCase() === key);
      return getTopicColor(name, topic?.color);
    },
    [topics],
  );

  const value = useMemo(() => ({ topics, reload, setTopics, colorOf }), [topics, reload, colorOf]);
  return <TopicsContext.Provider value={value}>{children}</TopicsContext.Provider>;
}

export function useTopics(): TopicsContextValue {
  const ctx = useContext(TopicsContext);
  if (!ctx) throw new Error('useTopics must be used inside <TopicsProvider>');
  return ctx;
}
