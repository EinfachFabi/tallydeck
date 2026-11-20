import type { ComponentType } from 'react';
import { Rss } from 'lucide-react';
import { YouTubeIcon } from './components/YouTubeIcon';

export interface NavItem {
  id: string;
  path: string;
  /** i18n key for the sidebar label */
  labelKey: string;
  icon: ComponentType<{ className?: string }>;
}

/**
 * Sidebar navigation. To add a new page later:
 * 1. add an entry here,
 * 2. add a <Route> in App.tsx,
 * 3. add "nav.<id>" and "pages.<id>.title/subtitle" to the i18n files.
 */
export const NAV_ITEMS: NavItem[] = [
  { id: 'youtube', path: '/youtube', labelKey: 'nav.youtube', icon: YouTubeIcon },
  { id: 'rss', path: '/rss', labelKey: 'nav.rss', icon: Rss },
];
