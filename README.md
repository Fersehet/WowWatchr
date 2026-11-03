<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-animated.svg">
    <img src="public/logo-animated-light.svg" alt="WowWatchr" height="72">
  </picture>
</h1>

A World of Warcraft stats overlay for OBS, and part of the Watchrs family next to [FaceitWatchr](https://github.com/Fersehet/FaceitWatchr) and [YoutubeWatchr](https://github.com/Fersehet/YoutubeWatchr). You host it yourself, pick a layout in the editor, and OBS shows it as a browser source.

<p align="center">
  <img src="docs/screenshots/overlay.png" alt="Finished overlay as it appears in OBS" width="420">
</p>

> **Status:** demo mode. The overlay and editor work, but they show sample data. Real character data comes next.

## What it looks like

**Editor:** pick a layout, switch pages on or off, choose the accent colour and copy the OBS links. The tabs at the top switch the preview between the pages.

![Editor with overlay preview](docs/screenshots/editor.png)

**Sign-in:** the editor is protected by a login, the overlay for OBS is not.

![Sign-in page](docs/screenshots/login.png)

## What it shows

- **Character:** item level, Mythic+ rating and secondary stats
- **Mythic+:** your rating, best key and recent dungeons
- **Raid:** progress, kills and best parse for Normal, Heroic and Mythic

## Layouts

| Layout | Size for OBS | Best for |
| --- | --- | --- |
| Classic | 640 × 270 | A card in the corner, like FaceitWatchr |
| Bar | 1060 × 84 | A slim strip that covers little of the game |
| Sidebar | 300 × 590 | A tall column beside the game |

The editor and overlay are available in English, German, Russian and French.

## Setup and start

You need [Node.js](https://nodejs.org) 22.13 or newer.

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

Open **http://localhost:3312** in your browser and sign in with user `admin` and your password. Set `PORT` in `.env` to use a different port.

## Adding it to OBS

1. Copy a URL from **Add to OBS** in the editor.
2. In OBS choose **Add source → Browser** and paste the URL.
3. Enter the width and height shown in the editor.

There is one URL that rotates through the enabled pages, and one URL per page if you would rather switch them yourself. Changes in the editor appear in OBS right away. If the server runs on another machine, use its IP instead of `localhost`. The overlay can be read without signing in, the editor cannot.

## Troubleshooting

- **The sign-in page says login is not set up:** put `ADMIN_PASSWORD` into `.env` and restart the server. On Windows, make sure the file is called `.env` and not `.env.txt`.
- **"Too many attempts":** after 10 wrong passwords the login is locked for up to 15 minutes.

## License

[MIT](LICENSE). Fonts (Geist, Chakra Petch, Barlow, JetBrains Mono): [SIL Open Font License](public/fonts/OFL.txt).

WowWatchr is a fan project and is not affiliated with or endorsed by Blizzard Entertainment. World of Warcraft is a trademark of Blizzard Entertainment, Inc.
