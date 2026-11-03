import express from 'express';
import type { Response } from 'express';
import { join } from 'node:path';
import { demoState } from './demo.ts';
import { loadSettings, sanitize, saveSettings } from './settings.ts';

const ROOT = join(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');
const SETTINGS_FILE = join(ROOT, 'data', 'settings.json');
const PORT = Number(process.env.PORT) || 3312;

let settings = loadSettings(SETTINGS_FILE);
const listeners = new Set<Response>();

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC));

app.get('/', (_req, res) => res.sendFile(join(PUBLIC, 'editor.html')));
app.get(['/overlay', '/overlay/:page'], (req, res) => {
  const { page } = req.params as { page?: string };
  if (page && !['character', 'mplus', 'raid'].includes(page)) return void res.sendStatus(404);
  res.sendFile(join(PUBLIC, 'overlay.html'));
});

app.get('/api/settings', (_req, res) => void res.json(settings));
app.put('/api/settings', (req, res) => {
  settings = sanitize(req.body);
  saveSettings(SETTINGS_FILE, settings);
  for (const listener of listeners) listener.write('event: settings\ndata: {}\n\n');
  res.json(settings);
});

app.get('/api/state', (_req, res) => void res.json(demoState(settings)));

// Änderungen im Editor erscheinen sofort in OBS
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  res.flushHeaders();
  listeners.add(res);
  req.on('close', () => listeners.delete(res));
});

// Nur lokal erreichbar, deshalb ohne Anmeldung
app.listen(PORT, '127.0.0.1', () => console.log(`WowWatchr: http://localhost:${PORT}`));
