# TallyDeck

**Your feeds, tallied.** A self-hosted inbox-zero dashboard for **YouTube channels** and **RSS/Atom news feeds**, built with a warm Monokai dark theme and full **Docker / Docker Compose** support on port `5555`.

---

## Features

- **Two-Table Inbox-Zero Workflow:**
  - **Left Table (New / Unread):** New YouTube uploads and unread news articles in full color (configurable inbox limit, default `100`), with quick per-page **Sync** and **Mark all as watched/read** buttons. Tick an entry off and it moves immediately to the right table.
  - **Right Table (Watched / Read):** Completed items from the last `7` days (configurable from `1` to `30` days in Settings) with grayed-out thumbnails, strikethrough titles, completion timestamps, and a one-click **Undo** button. Older completed items remain in SQLite so lifetime statistics and duplicate protection stay intact.
- **YouTube Without API Key:** Paste any YouTube channel link (`https://www.youtube.com/@name`, `/channel/UC…`, a video link, or RSS URL) – TallyDeck resolves it automatically to the official YouTube RSS feed. Includes a **Hide Shorts** toggle.
- **RSS & Atom Auto-Discovery:** Paste a direct feed URL **or a website URL** – TallyDeck automatically discovers the RSS/Atom feed.
- **Topics / Tag Grouping with Distinct Colors:** Group channels and feeds by topic (e.g. *Tech*, *Gaming*, *Economy*, *Homelab*, *Science*, *News* or any custom topic) with color-coded badges and topic filters.
- **Settings Menu (Themes, Dark/Light Mode, Limits & OPML Backup):** Accessible from the bottom of the left sidebar:
  - **Dark Mode / Light Mode** switch (Dark Mode by default) and **5 color themes** (**Monokai** default, **Dracula**, **Nord**, **Catppuccin**, **Gruvbox**).
  - Configurable **Inbox display limit** (default `100` items) and **Watched / Read history duration** (`7` days default, up to `30` days).
  - **OPML 2.0 Import & Export / Backup** buttons separately for **YouTube channels** and **RSS feeds** (preserving topic folders).
- **Automatic Background Sync:** Polls all subscribed channels and feeds in the background (default: every 15 minutes) and adds new items automatically without duplicating or resetting already watched/read items.
- **Statistics & Weekly Trend:** Tracks total watched/read, this week (with comparison vs. last week), weekly average, unread count, and an 8-week bar chart.
- **Collapsible Sidebar & Multilingual UI:** Collapsible icon sidebar, confirmation dialog before removing channels/feeds, and top-right language switcher (**English** default, **German** included).

---

## Run with Docker

TallyDeck runs in a single container on port **`5555`** and stores its SQLite database in `/app/data/tallydeck.db`. Multi-architecture images (`linux/amd64` and `linux/arm64`) are published automatically to the GitHub Container Registry (`ghcr.io`).

### Option 1: `docker run` (Pre-built Image)

```bash
docker run -d \
  --name tallydeck \
  -p 5555:5555 \
  -v tallydeck-data:/app/data \
  -e PORT=5555 \
  -e POLL_INTERVAL_MINUTES=15 \
  --restart unless-stopped \
  ghcr.io/einfachfabi/tallydeck:latest
```

Then open **<http://localhost:5555>** in your browser.

### Option 2: `docker compose` (Pre-built Image)

Save this as `docker-compose.yml` and run `docker compose up -d`:

```yaml
services:
  tallydeck:
    image: ghcr.io/einfachfabi/tallydeck:latest
    container_name: tallydeck
    ports:
      - "5555:5555"
    volumes:
      - tallydeck-data:/app/data
    environment:
      - PORT=5555
      - DB_PATH=/app/data/tallydeck.db
      - POLL_INTERVAL_MINUTES=15
    restart: unless-stopped

volumes:
  tallydeck-data:
```

### Option 3: Build Locally with Docker Compose

If you cloned this repository and want to build the image locally:

```bash
git clone https://github.com/EinfachFabi/tallydeck.git
cd tallydeck
docker compose up -d --build
```

Then open **<http://localhost:5555>**.

---

## Configuration (Environment Variables)

| Variable                | Default                  | Description                              |
| ----------------------- | ------------------------ | ---------------------------------------- |
| `PORT`                  | `5555`                   | HTTP server port                         |
| `DB_PATH`               | `/app/data/tallydeck.db` | Path to the SQLite database file         |
| `POLL_INTERVAL_MINUTES` | `15`                     | Background feed sync interval in minutes |

### Database Backup

```bash
docker cp tallydeck:/app/data/tallydeck.db ./tallydeck-backup.db
```

---

## Local Development (Without Docker)

Requires **Node.js ≥ 22.13** (uses Node's built-in `node:sqlite`).

```bash
npm install
npm run dev        # Fastify API on :5555, Vite dev server on :5173 (proxying /api)
npm test           # Run backend unit & integration tests (node:test)
npm run build      # Typecheck + production bundle into dist/
npm start          # Start the production server on http://localhost:5555
```

### Project Structure

```text
.github/workflows/ GitHub Actions workflow (tests + multi-arch GHCR Docker publish)
server/            Fastify API, SQLite repository, RSS/Atom parser, YouTube resolver, scheduler
  tests/           node:test unit + API tests with fixtures
src/               React + Vite + Tailwind CSS frontend (Monokai theme)
  components/      Sidebar, TopBar, StatsBar, ChannelStrip, SplitFeedTables
  pages/           DashboardPage (shared by YouTube & News)
  i18n/            en.json, de.json, I18nContext
  utils/           Formatting helpers, localStorage hook, Monokai topic color palette
  navigation.ts    Sidebar navigation entries – extend here to add new pages
```

### REST API

| Method   | Endpoint                                          | Description                                                |
| -------- | ------------------------------------------------- | ---------------------------------------------------------- |
| `GET`    | `/api/health`                                     | Health status and last sync timestamp                      |
| `GET`    | `/api/feeds?type=youtube\|rss`                    | List subscribed channels or feeds with unread counts       |
| `POST`   | `/api/feeds`                                      | `{ type, url, category? }` – add channel/feed              |
| `PATCH`  | `/api/feeds/:id`                                  | `{ category }` – assign or change a feed's topic           |
| `DELETE` | `/api/feeds/:id`                                  | Remove a channel/feed and all its items                    |
| `POST`   | `/api/feeds/sync`                                 | `{ type?, feedId? }` – trigger immediate feed refresh      |
| `GET`    | `/api/feeds/opml?type=youtube\|rss`               | Export subscribed channels or feeds as an OPML 2.0 file    |
| `POST`   | `/api/feeds/opml`                                 | `{ type, opml }` – import channels or feeds from OPML XML  |
| `GET`    | `/api/items?type=&feedId=&category=&hideShorts=&inboxLimit=&completedDays=` | Uncompleted items, completed items, & stats |
| `PATCH`  | `/api/items/:id`                                  | `{ completed: boolean }` – mark item watched/read or undo  |
| `POST`   | `/api/items/complete-all`                         | `{ type, feedId?, category?, hideShorts? }` – complete all |
