<h1><img src="public/logo.svg" alt="" height="48"> WowWatchr</h1>

A World of Warcraft stats overlay for OBS, and part of the Watchrs family next to [FaceitWatchr](https://github.com/Fersehet/FaceitWatchr) and [YoutubeWatchr](https://github.com/Fersehet/YoutubeWatchr). You host it yourself, pick a layout in the editor, and OBS shows it as a browser source.

> **Status:** demo mode. The overlay and editor work, but they show sample data. Real character data comes next.

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
npm start
```

Open **http://localhost:3312** in your browser. The server only accepts connections from your own PC, so there is no login. Set `PORT` to use a different port.

## Adding it to OBS

1. Copy a URL from **Add to OBS** in the editor.
2. In OBS choose **Add source → Browser** and paste the URL.
3. Enter the width and height shown in the editor.

There is one URL that rotates through the enabled pages, and one URL per page if you would rather switch them yourself. Changes in the editor appear in OBS right away.

## License

[MIT](LICENSE). Geist font: [SIL Open Font License](public/fonts/OFL.txt).

WowWatchr is a fan project and is not affiliated with or endorsed by Blizzard Entertainment. World of Warcraft is a trademark of Blizzard Entertainment, Inc.
