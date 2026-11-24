import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../db.ts';
import { createFeedService } from '../feedService.ts';
import { createTwitchService, normalizeTwitchLogin } from '../twitchService.ts';
import { buildApp } from '../app.ts';
import type { FetchText } from '../http.ts';

const noopFetchText: FetchText = async (url) => {
  throw new Error(`Unexpected fetchText: ${url}`);
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('normalizeTwitchLogin handles plain names, @handles, and Twitch URLs', () => {
  assert.equal(normalizeTwitchLogin('Gronkh'), 'gronkh');
  assert.equal(normalizeTwitchLogin(' @HandOfBlood '), 'handofblood');
  assert.equal(normalizeTwitchLogin('twitch.tv/RocketBeansTV'), 'rocketbeanstv');
  assert.equal(normalizeTwitchLogin('https://www.twitch.tv/shroud/videos'), 'shroud');
  assert.equal(normalizeTwitchLogin('https://m.twitch.tv/esl_csgo?referrer=raid'), 'esl_csgo');

  assert.throws(() => normalizeTwitchLogin(''), /invalid_twitch_channel|Please enter/i);
  assert.throws(() => normalizeTwitchLogin('https://youtube.com/@fireship'), /not a Twitch link/i);
  assert.throws(() => normalizeTwitchLogin('https://www.twitch.tv/directory'), /valid Twitch channel/i);
});

test('Twitch Web-GQL mode: add, list sorted, duplicate, delete, and sync', async () => {
  const db = openDatabase(':memory:');
  const remoteUsers: Record<
    string,
    {
      login: string;
      displayName: string;
      profileImageURL: string;
      stream: null | {
        id: string;
        title: string;
        viewersCount: number;
        createdAt: string;
        previewImageURL: string;
        game: { name: string };
      };
    }
  > = {
    gronkh: {
      login: 'gronkh',
      displayName: 'GRONKH',
      profileImageURL: 'https://img.example/gronkh.png',
      stream: {
        id: '101',
        title: 'Abendstream!',
        viewersCount: 15000,
        createdAt: '2026-11-24T08:00:00Z',
        previewImageURL: 'https://img.example/gronkh-live.jpg',
        game: { name: 'Just Chatting' },
      },
    },
    shroud: {
      login: 'shroud',
      displayName: 'shroud',
      profileImageURL: 'https://img.example/shroud.png',
      stream: {
        id: '102',
        title: 'Ranked Grind',
        viewersCount: 25000,
        createdAt: '2026-11-24T07:30:00Z',
        previewImageURL: 'https://img.example/shroud-live.jpg',
        game: { name: 'Counter-Strike' },
      },
    },
    rocketbeanstv: {
      login: 'rocketbeanstv',
      displayName: 'RocketBeansTV',
      profileImageURL: 'https://img.example/rbtv.png',
      stream: null,
    },
  };

  const mockFetch: typeof fetch = async (url, init) => {
    assert.equal(String(url), 'https://gql.twitch.tv/gql');
    const ops = JSON.parse(String(init?.body)) as Array<{ variables: { login: string } }>;
    const payload = ops.map((op) => ({
      data: { user: remoteUsers[op.variables.login] ?? null },
    }));
    return jsonResponse(payload);
  };

  const twitchService = createTwitchService(db, { fetchImpl: mockFetch });
  const app = await buildApp({
    db,
    feedService: createFeedService(db, noopFetchText),
    twitchService,
  });

  // Add three channels (two live, one offline)
  const r1 = await app.inject({ method: 'POST', url: '/api/twitch/channels', payload: { channel: 'twitch.tv/gronkh' } });
  assert.equal(r1.statusCode, 201);
  assert.equal(r1.json().channel.displayName, 'GRONKH');
  assert.equal(r1.json().channel.isLive, true);

  const r2 = await app.inject({ method: 'POST', url: '/api/twitch/channels', payload: { channel: 'shroud' } });
  assert.equal(r2.statusCode, 201);

  const r3 = await app.inject({
    method: 'POST',
    url: '/api/twitch/channels',
    payload: { channel: 'https://www.twitch.tv/rocketbeanstv' },
  });
  assert.equal(r3.statusCode, 201);
  assert.equal(r3.json().channel.isLive, false);

  // Duplicate rejected
  const dup = await app.inject({ method: 'POST', url: '/api/twitch/channels', payload: { channel: 'GRONKH' } });
  assert.equal(dup.statusCode, 409);
  assert.equal(dup.json().error, 'twitch_channel_exists');

  // Unknown channel rejected
  const missing = await app.inject({
    method: 'POST',
    url: '/api/twitch/channels',
    payload: { channel: 'nonexistent_xyz_999' },
  });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.json().error, 'twitch_channel_not_found');

  // List: online sorted by viewers desc, then offline
  const listRes = await app.inject({ method: 'GET', url: '/api/twitch/streams' });
  assert.equal(listRes.statusCode, 200);
  const list = listRes.json();
  assert.equal(list.mode, 'gql');
  assert.deepEqual(
    list.channels.map((c: { login: string; isLive: boolean }) => [c.login, c.isLive]),
    [
      ['shroud', true],
      ['gronkh', true],
      ['rocketbeanstv', false],
    ],
  );

  // Simulate shroud going offline and trigger sync
  remoteUsers.shroud.stream = null;
  const syncRes = await app.inject({ method: 'POST', url: '/api/twitch/sync' });
  assert.equal(syncRes.statusCode, 200);
  assert.deepEqual(
    syncRes.json().channels.map((c: { login: string; isLive: boolean }) => [c.login, c.isLive]),
    [
      ['gronkh', true],
      ['rocketbeanstv', false],
      ['shroud', false],
    ],
  );

  // Delete channel
  const delRes = await app.inject({ method: 'DELETE', url: `/api/twitch/channels/${r1.json().channel.id}` });
  assert.equal(delRes.statusCode, 204);

  const afterDel = await app.inject({ method: 'GET', url: '/api/twitch/streams' });
  assert.equal(afterDel.json().channels.length, 2);
});

test('Twitch Helix API mode activates when clientId and clientSecret are provided', async () => {
  const db = openDatabase(':memory:');
  let tokenCalls = 0;

  const mockFetch: typeof fetch = async (url) => {
    const u = String(url);
    if (u === 'https://id.twitch.tv/oauth2/token') {
      tokenCalls += 1;
      return jsonResponse({ access_token: 'helix_tok_123', expires_in: 3600 });
    }
    if (u.startsWith('https://api.twitch.tv/helix/users')) {
      return jsonResponse({
        data: [{ login: 'gronkh', display_name: 'GRONKH', profile_image_url: 'https://img.example/g.png' }],
      });
    }
    if (u.startsWith('https://api.twitch.tv/helix/streams')) {
      return jsonResponse({
        data: [
          {
            user_login: 'gronkh',
            title: 'Helix Live',
            game_name: 'Minecraft',
            viewer_count: 9876,
            started_at: '2026-11-24T08:15:00Z',
            thumbnail_url: 'https://img.example/{width}x{height}.jpg',
          },
        ],
      });
    }
    throw new Error(`Unexpected URL: ${u}`);
  };

  const twitchService = createTwitchService(db, {
    clientId: 'my_client_id',
    clientSecret: 'my_client_secret',
    fetchImpl: mockFetch,
  });
  const app = await buildApp({
    db,
    feedService: createFeedService(db, noopFetchText),
    twitchService,
  });

  const added = await app.inject({ method: 'POST', url: '/api/twitch/channels', payload: { channel: 'gronkh' } });
  assert.equal(added.statusCode, 201);
  assert.equal(added.json().channel.thumbnailUrl, 'https://img.example/640x360.jpg');
  assert.equal(added.json().channel.viewerCount, 9876);
  assert.equal(added.json().channel.gameName, 'Minecraft');
  assert.equal(tokenCalls, 1);

  const list = await app.inject({ method: 'GET', url: '/api/twitch/streams' });
  assert.equal(list.json().mode, 'helix');
});

test('twitchPollIntervalMinutes enforces minimum 15 minutes in settings', async () => {
  const db = openDatabase(':memory:');
  const app = await buildApp({
    db,
    feedService: createFeedService(db, noopFetchText),
  });

  const initial = await app.inject({ method: 'GET', url: '/api/settings' });
  assert.equal(initial.statusCode, 200);
  assert.equal(initial.json().settings.twitchPollIntervalMinutes, 15);

  const tooLow = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: { twitchPollIntervalMinutes: 5 },
  });
  assert.equal(tooLow.statusCode, 400);

  const zero = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: { twitchPollIntervalMinutes: 0 },
  });
  assert.equal(zero.statusCode, 400);

  const valid = await app.inject({
    method: 'PATCH',
    url: '/api/settings',
    payload: { twitchPollIntervalMinutes: 30 },
  });
  assert.equal(valid.statusCode, 200);
  assert.equal(valid.json().settings.twitchPollIntervalMinutes, 30);
});

test('exports and imports Twitch channels as JSON and plain text', async () => {
  const db = openDatabase(':memory:');
  const remoteUsers: Record<string, { login: string; displayName: string; profileImageURL: string; stream: null }> = {
    gronkh: { login: 'gronkh', displayName: 'GRONKH', profileImageURL: 'https://img.example/g.png', stream: null },
    shroud: { login: 'shroud', displayName: 'shroud', profileImageURL: 'https://img.example/s.png', stream: null },
  };
  const mockFetch: typeof fetch = async (_url, init) => {
    const ops = JSON.parse(String(init?.body)) as Array<{ variables: { login: string } }>;
    return jsonResponse(ops.map((op) => ({ data: { user: remoteUsers[op.variables.login] ?? null } })));
  };

  const twitchService = createTwitchService(db, { fetchImpl: mockFetch });
  const app = await buildApp({
    db,
    feedService: createFeedService(db, noopFetchText),
    twitchService,
  });

  await app.inject({ method: 'POST', url: '/api/twitch/channels', payload: { channel: 'gronkh' } });

  const exp = await app.inject({ method: 'GET', url: '/api/twitch/channels/export' });
  assert.equal(exp.statusCode, 200);
  const exported = exp.json();
  assert.equal(exported.app, 'tallydeck-twitch');
  assert.equal(exported.channels.length, 1);
  assert.equal(exported.channels[0].login, 'gronkh');

  // Import JSON containing existing + new + missing
  const impJson = await app.inject({
    method: 'POST',
    url: '/api/twitch/channels/import',
    payload: {
      content: JSON.stringify({
        app: 'tallydeck-twitch',
        channels: [{ login: 'gronkh' }, { login: 'shroud' }, { login: 'doesnotexist999' }],
      }),
    },
  });
  assert.equal(impJson.statusCode, 200);
  assert.equal(impJson.json().imported, 1);
  assert.equal(impJson.json().skipped, 1);
  assert.equal(impJson.json().failed, 1);

  // Import plain text list
  const impTxt = await app.inject({
    method: 'POST',
    url: '/api/twitch/channels/import',
    payload: { content: '# comment\ntwitch.tv/gronkh\nshroud\n' },
  });
  assert.equal(impTxt.statusCode, 200);
  assert.equal(impTxt.json().imported, 0);
  assert.equal(impTxt.json().skipped, 2);
  assert.equal(impTxt.json().failed, 0);
});
