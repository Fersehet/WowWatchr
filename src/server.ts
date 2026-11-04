import express from 'express';
import type { Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Auth, type LoginError } from './auth.ts';
import { demoState } from './demo.ts';
import { Blizzard, Live } from './live.ts';
import { DEFAULTS, loadSettings, sanitize, saveSettings } from './settings.ts';

const ROOT = join(import.meta.dirname, '..');
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'));

const PUBLIC = join(ROOT, 'public');
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
const live = new Live(blizzard, notify);
const wantsLive = () => blizzard.enabled && Boolean(settings.name.trim());

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
      '/favicon.svg', '/logo.svg', '/logo-wordmark.svg',
    ].includes(req.path)
  );
}

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
setInterval(() => wantsLive() && live.refresh(settings), 60_000);

// Echte Daten, sobald ein Charakter gefunden ist, sonst Beispieldaten
app.get('/api/state', (_req, res) => {
  if (!wantsLive()) return void res.json({ ...demoState(settings), status: blizzard.enabled ? 'demo' : 'noKey' });
  live.refresh(settings);
  if (live.state) return void res.json({ ...live.state, status: live.status });
  // Noch keine echten Daten: Beispieldaten nicht unter dem echten Namen zeigen
  res.json({ ...demoState({ ...settings, name: DEFAULTS.name, realm: DEFAULTS.realm }), status: live.status });
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
