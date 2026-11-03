<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-animated.svg">
    <img src="public/logo-animated-light.svg" alt="WowWatchr" height="72">
  </picture>
</h1>

Show your **World of Warcraft** stats in your OBS stream: character, Mythic+ and raid progress, as a card, a slim bar or a sidebar. You host it yourself, design the overlay in the editor, and OBS shows it as a browser source.

<p align="center">
  <img src="docs/screenshots/overlay.gif" alt="The Classic overlay switching through its three pages: Character, Mythic+ and Raid" width="640">
</p>

- Three pages: **Character** (item level, Mythic+ rating, secondary stats), **Mythic+** (rating, best key, recent dungeons) and **Raid** (progress, kills and best parse for Normal, Heroic and Mythic)
- Three layouts: a **Classic** card, a slim **Bar** and a tall **Sidebar**
- One OBS URL that switches through the pages on its own, or one URL per page
- An editor in your browser with a live preview, protected by a login, and every change shows up in OBS right away
- Editor and overlay in English, German, Russian and French

> **Status:** demo mode. The overlay and editor work, but they show sample data. Real character data comes next.

## What it looks like

**Editor:** pick a layout, switch pages on or off, change the accent colour, character name or overlay language. The preview and OBS follow every change right away.

![Editor with the overlay preview](docs/screenshots/editor.png)

**Classic** (640 × 270): a card in the corner.

![Classic layout: Character, Mythic+ and Raid page](docs/screenshots/layout-classic.png)

**Bar** (1060 × 84): a slim strip that covers little of the game.

![Bar layout: Character, Mythic+ and Raid page](docs/screenshots/layout-bar.png)

**Sidebar** (300 × 590): a tall column beside the game.

<p align="center">
  <img src="docs/screenshots/layout-sidebar.png" alt="Sidebar layout: Character, Mythic+ and Raid page" width="720">
</p>

The screenshots show the sample character of the demo mode.

## Requirements

- [Node.js](https://nodejs.org) 22.13 or newer

## Setup and start

```bash
git clone https://github.com/Fersehet/WowWatchr.git
cd WowWatchr
npm install
cp .env.example .env   # Windows: copy .env.example .env
```

Put at least this into `.env`:

```env
ADMIN_PASSWORD=a-long-password
```

Then start it:

```bash
npm start
```

Open **http://localhost:3312** in your browser and sign in with user `admin` and your password. Enter your character name and realm in the editor and pick a layout.

## Adding it to OBS

1. In the editor under **Add to OBS**, copy a URL, e.g. `http://localhost:3312/overlay`.
2. In OBS choose **Add source → Browser** and paste the URL.
3. Enter the width and height shown in the editor for your layout.

`/overlay` switches through the enabled pages on its own. `/overlay/character`, `/overlay/mplus` and `/overlay/raid` always show one page, if you would rather switch them yourself. If the server runs on another machine, use its IP instead of `localhost`. The overlay can be read without signing in, the editor cannot.

## Troubleshooting

- **The sign-in page says login is not set up:** put `ADMIN_PASSWORD` into `.env` and restart the server. On Windows, make sure the file is called `.env` and not `.env.txt`.
- **"Too many attempts":** after 10 wrong passwords the login is locked for up to 15 minutes.
- **The overlay shows Vaelric from Blackrock and not my character:** WowWatchr is still in demo mode and shows sample data. Real character data comes in a later version.
- **Nothing shows up in OBS:** open the OBS URL in your browser. If it stays empty there, copy the URL again from the editor under **Add to OBS**. If the server runs on another machine, use its IP instead of `localhost`.
- **The overlay is cut off in OBS:** set the width and height of the Browser source to the size of your layout: Classic 640 × 270, Bar 1060 × 84, Sidebar 300 × 590.
- **The overlay doesn't switch pages:** the switching URL only rotates through pages that are ticked under **Pages**, so tick at least two. The time per page is set under **Switch every (seconds)**.
- **Changes don't show up after an update:** an old server may still be running in the background and holding port `3312`. Close every terminal running `npm start` (or end the `node` processes), then run `npm start` once. If the port is used by something else, set another one, e.g. `PORT=3313` in `.env`.
- **`npm start` fails right away:** check `node --version`. WowWatchr needs Node.js 22.13 or newer.

## Updating

```bash
git pull
npm install
npm start
```

Your settings live in `data/` and are kept. More settings (port, login) are listed in `.env.example`.

## License

[MIT](LICENSE). Fonts (Geist, Chakra Petch, Barlow, JetBrains Mono): [SIL Open Font License](public/fonts/OFL.txt).

WowWatchr is a fan project and is not affiliated with or endorsed by Blizzard Entertainment. World of Warcraft is a trademark of Blizzard Entertainment, Inc.
