import express from 'express';
import type { Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Auth, type LoginError } from './auth.ts';
import { DEMO_CODE, demoFight, demoHistory, demoState } from './demo.ts';
import { Discord } from './discord.ts';
import { TEXTS as DISCORD_TEXTS, buildPost, type Look } from './discord-format.ts';
import { History, type Run } from './history.ts';
import { Blizzard, Live, slug } from './live.ts';
import { Logs, WarcraftLogs } from './logs.ts';
import { DEFAULTS, loadSettings, sanitize, saveSettings } from './settings.ts';

const ROOT = join(import.meta.dirname, '..');
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));

const PUBLIC = join(ROOT, 'public');
// Optionale eigene Startseite für / (das Repo WowWatchr-Website, geklont nach website/)
const SITE = resolve(ROOT, process.env.SITE_DIR?.trim() || 'website');
const DATA = join(ROOT, 'data');
const SETTINGS_FILE = join(DATA, 'settings.json');
const PORT = Number(process.env.PORT) || 3312;
const HOST = process.env.HOST || '0.0.0.0';

let settings = loadSettings(SETTINGS_FILE);
const listeners = new Set<Response>();
const auth = new Auth(join(DATA, 'session-secret'), process.env.SESSION_SECRET?.trim() || '', {
  name: process.env.ADMIN_USER?.trim() || 'admin',
  password: process.env.ADMIN_PASSWORD || '',
});

const notify = () => {
  for (const listener of listeners) listener.write('event: settings\ndata: {}\n\n');
};
// Echte Daten nur mit Blizzard-Schlüssel, sonst Beispieldaten
const blizzard = new Blizzard(process.env.BLIZZARD_CLIENT_ID?.trim() || '', process.env.BLIZZARD_CLIENT_SECRET?.trim() || '');
const history = new History(join(DATA, 'history.db'));
const discord = new Discord(history.db, join(DATA, 'discord-webhook'));
const live = new Live(blizzard, notify, (character, snapshot) => {
  const fresh = history.save(character, snapshot);
  discord.announce(character, fresh, look(), settings.name.trim()).catch(() => {});
  // Jetzt ist der Realm-Slug von Blizzard bekannt, den Warcraft Logs braucht
  refreshLogs();
});
const wantsLive = () => blizzard.enabled && Boolean(settings.name.trim());
// Warcraft Logs nur mit eigenem Schlüssel und nur für Retail (Forever-Logs liegen woanders)
const logs = new Logs(new WarcraftLogs(process.env.WCL_CLIENT_ID?.trim() || '', process.env.WCL_CLIENT_SECRET?.trim() || ''), history.db);
// So sehen die Discord-Posts gerade aus (Stil und Sprache aus dem Editor)
const look = (): Look => ({
  lang: settings.discordLang,
  style: settings.discordStyle,
  accent: settings.accent,
  diffColors: settings.diffColors,
  who: `${settings.name.trim()} · ${settings.realm.trim()} (${settings.region.toUpperCase()})`,
  logsEnabled: logs.enabled && settings.game === 'retail',
});
const refreshLogs = () => {
  if (settings.game !== 'retail' || !settings.name.trim()) return;
  logs.refresh(Live.character(settings), { name: settings.name.trim(), realm: live.realmSlug || slug(settings.realm), region: settings.region });
};

const app = express();
// Hinter einem Reverse Proxy: echte Besucher-IP (für die Login-Sperre) und https-Erkennung (für sichere Cookies)
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

/** Ohne Login erreichbar: Overlay und seine Daten nur lesend (für OBS), Schriften, Bilder und der Login selbst. */
function isPublic(req: Request) {
  if (['/api/login', '/api/logout', '/api/me'].includes(req.path)) return true;
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  return (
    req.path.startsWith('/fonts/') ||
    /^\/overlay(\/[\w-]+)?$/.test(req.path) ||
    [
      '/api/settings', '/api/state', '/api/events',
      '/login.html', '/css/editor.css', '/css/overlay.css', '/js/render.js', '/js/i18n.js',
      '/favicon.svg', '/logo.svg', '/logo-wordmark.svg', '/img/sample-portrait.svg',
    ].includes(req.path)
  );
}

// Die Startseite ist ohne Login erreichbar. Fehlt sie, führt / zum Editor.
app.use(express.static(SITE));

const hostOf = (url: string) => URL.parse(url)?.host ?? null;

// Editor und alle Änderungen nur nach Login, egal ob über localhost, LAN oder eine Domain.
// Ohne ADMIN_PASSWORD gibt es keinen Login, dann ist der Editor für alle offen.
app.use((req, res, next) => {
  if (isPublic(req)) return next();
  if (!auth.enabled || auth.user(req)) {
    // Änderungen nur von der eigenen Seite aus, nicht von fremden Seiten im selben Browser
    const origin = req.headers.origin;
    if (req.method !== 'GET' && req.method !== 'HEAD' && origin && hostOf(origin) !== req.headers.host) {
      return void res.status(403).json({ error: 'Fremde Herkunft' });
    }
    return next();
  }
  if (req.path.startsWith('/api/')) return void res.status(401).json({ error: 'Bitte anmelden' });
  if (req.method === 'GET') {
    // Sprache aus dem Link auch auf der Login-Seite verwenden
    const lang = typeof req.query.lang === 'string' ? `&lang=${encodeURIComponent(req.query.lang)}` : '';
    return res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}${lang}`);
  }
  res.status(404).send('Nicht gefunden');
});

app.use(express.json());
app.use(express.static(PUBLIC));

app.get('/', (_req, res) => res.sendFile(join(PUBLIC, 'editor.html')));
app.get(['/overlay', '/overlay/:page'], (req, res) => {
  const { page } = req.params as { page?: string };
  if (page && !['character', 'mplus', 'raid'].includes(page)) return void res.sendStatus(404);
  res.sendFile(join(PUBLIC, 'overlay.html'));
});

// Login für den Editor
app.get('/api/me', (req, res) => {
  res.set('Cache-Control', 'no-store').json({ user: auth.enabled ? auth.user(req) : null, loginEnabled: auth.enabled });
});

const LOGIN_ERRORS: Record<LoginError, number> = { disabled: 503, locked: 429, wrong: 401 };

app.post('/api/login', (req, res) => {
  const error = auth.login(req, res, String(req.body?.user ?? ''), String(req.body?.password ?? ''));
  if (error) return void res.status(LOGIN_ERRORS[error]).json({ error });
  res.json({ ok: true });
});

app.post('/api/logout', (_req, res) => {
  auth.logout(res);
  res.status(204).end();
});

app.get('/api/settings', (_req, res) => void res.json(settings));
app.put('/api/settings', (req, res) => {
  settings = sanitize(req.body);
  saveSettings(SETTINGS_FILE, settings);
  notify();
  res.json(settings);
});

// Auch ohne offenen Editor alle paar Minuten neu holen; Live fragt höchstens alle fünf Minuten an
setInterval(() => {
  if (wantsLive()) live.refresh(settings);
  if (wantsLive()) refreshLogs();
  // Discord: nicht zugestellte Posts erneut senden, Logs in bestehende Posts eintragen
  if (wantsLive()) {
    const character = Live.character(settings);
    discord.work(character, look(), settings.name.trim(), logs.reports(character), (code, fight) => logs.fight(code, fight)).catch(() => {});
  }
}, 60_000);

// Echte Daten, sobald ein Charakter gefunden ist, sonst Beispieldaten
app.get('/api/state', (_req, res) => {
  if (!wantsLive()) return void res.json({ ...demoState(settings), status: blizzard.enabled ? 'demo' : 'noKey' });
  live.refresh(settings);
  if (live.state) return void res.json({ ...live.state, status: live.status });
  // Noch keine echten Daten: Beispieldaten nicht unter dem echten Namen zeigen
  res.json({ ...demoState({ ...settings, name: DEFAULTS.name, realm: DEFAULTS.realm }), status: live.status });
});

// Statistik-Seite im Editor: gespeicherter Verlauf, ohne Schlüssel Beispieldaten
app.get('/api/stats', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!wantsLive()) return void res.json({ ...demoHistory(), status: blizzard.enabled ? 'demo' : 'noKey' });
  live.refresh(settings);
  refreshLogs();
  const character = Live.character(settings);
  res.json({ demo: false, ...history.get(character), status: live.status, logs: { status: logs.status, reports: logs.reports(character) } });
});

// Werte pro Spieler aus Warcraft Logs, erst beim Aufklappen eines Kampfes
app.get('/api/stats/fight', async (req, res) => {
  const code = String(req.query.code ?? '');
  const fight = Number(req.query.fight);
  if (!/^[A-Za-z0-9]{16}$/.test(code) || !Number.isInteger(fight)) return void res.status(400).json({ error: 'code/fight' });
  if (code === DEMO_CODE) return void res.json(demoFight(fight));
  try {
    res.set('Cache-Control', 'no-store').json(await logs.fight(code, fight));
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

// Discord-Webhook: der Link bleibt auf dem Server, der Editor erfährt nur, ob einer gesetzt ist
app.get('/api/discord', (_req, res) => void res.set('Cache-Control', 'no-store').json({ connected: discord.connected }));
app.put('/api/discord', (req, res) => {
  try {
    discord.setUrl(String(req.body?.url ?? ''));
  } catch {
    return void res.status(400).json({ error: 'invalid' });
  }
  res.json({ connected: discord.connected });
});

// Testpost mit Beispieldaten im gewählten Stil und in der gewählten Sprache
app.post('/api/discord/test', async (_req, res) => {
  if (!discord.connected) return void res.status(409).json({ error: 'notConnected' });
  const sample = demoHistory();
  const run = { ...sample.runs[0], at: Date.now() } as Run;
  const post = buildPost({ kind: 'run', run }, { tries: null, fightMs: run.ms, bestWipe: null, players: demoFight(1) }, { ...look(), logsEnabled: false }, settings.name.trim());
  post.payload.content = `**${DISCORD_TEXTS[settings.discordLang].testTitle}**\n${DISCORD_TEXTS[settings.discordLang].testNote}`;
  try {
    await discord.send(post);
    res.json({ ok: true });
  } catch (error) {
    res.status(502).json({ error: (error as Error).message });
  }
});

// Änderungen im Editor erscheinen sofort in OBS
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  res.flushHeaders();
  listeners.add(res);
  req.on('close', () => listeners.delete(res));
});

app.listen(PORT, HOST, () => {
  console.log(`WowWatchr: http://localhost:${PORT}`);
  if (!blizzard.enabled) console.log('Hinweis: BLIZZARD_CLIENT_ID/BLIZZARD_CLIENT_SECRET fehlen in der .env, das Overlay zeigt Beispieldaten.');
  if (!auth.enabled) console.log('Hinweis: ADMIN_PASSWORD fehlt in der .env, der Editor ist ohne Login offen. Jeder, der den Server erreicht, kann ihn ändern.');
});
