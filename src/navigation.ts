import type { ComponentType } from 'react';
import { Rss } from 'lucide-react';
import { YouTubeIcon } from './components/YouTubeIcon';
import { TwitchIcon } from './components/TwitchIcon';
import { RssLogo, TwitchLogo, YouTubeLogo } from './components/BrandLogos';

export interface NavItem {
  id: string;
  path: string;
  /** i18n key for the sidebar label */
  labelKey: string;
  /** Monochrome icon used in the left sidebar navigation */
  icon: ComponentType<{ className?: string }>;
  /** Full-color brand logo displayed in the TopBar page header */
  brandLogo: ComponentType<{ className?: string }>;
  /** Optional external platform URL opened in a new tab when clicking the TopBar logo */
  externalUrl?: string;
  externalLabelKey?: string;
}

/**
 * Sidebar navigation. To add a new page later:
 * 1. add an entry here,
 * 2. add a <Route> in App.tsx,
 * 3. add "nav.<id>" and "pages.<id>.title/subtitle" to the i18n files.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    id: 'rss',
    path: '/rss',
    labelKey: 'nav.rss',
    icon: Rss,
    brandLogo: RssLogo,
  },
  {
    id: 'youtube',
    path: '/youtube',
    labelKey: 'nav.youtube',
    icon: YouTubeIcon,
    brandLogo: YouTubeLogo,
    externalUrl: 'https://www.youtube.com',
    externalLabelKey: 'topbar.openYoutube',
  },
  {
    id: 'twitch',
    path: '/twitch',
    labelKey: 'nav.twitch',
    icon: TwitchIcon,
    brandLogo: TwitchLogo,
    externalUrl: 'https://www.twitch.tv',
    externalLabelKey: 'topbar.openTwitch',
  },
];
