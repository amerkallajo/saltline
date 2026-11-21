# Saltline Online

## Play on GitHub Pages

Open [Saltline](https://amerkallajo.github.io/saltline/), choose **Online Free-for-All**, and select **Host arena**. From the pause menu, choose **Copy invite link** and share it. Your friends open that link and choose **Join arena**. The host's browser runs the match, so keep it open while everyone plays.

GitHub Pages serves the standalone browser build. It uses PeerJS Cloud to introduce browsers and WebRTC data channels for play. Some restrictive networks may block direct peer connections.

## Play on a dedicated server

Choose **Online Free-for-All**, enter a display name, and choose **Join arena**. Everyone on the same server joins one 12-player match on Saltline Terminal. The rifle and pistol are available, scores last for the current connection, and players respawn automatically.

## Run the server

With Node.js 22 or newer, run these commands from the project folder.

```sh
npm ci
npm run build
npm start
```

Open [Saltline on localhost](http://localhost:8080). The server serves the standalone build and accepts the game WebSocket at `/online`. Set `PORT` or `HOST` to override the defaults. For public hosting, serve the Node process behind HTTPS and forward WebSocket upgrades on the same host. All players in a match must reach the same process. A restart clears the arena and its scores.

The offline modes still work when opening `index.html` or `dist/saltline.html` directly. The online mode needs the server URL.

## Multiplayer integration

The dedicated server and the GitHub Pages room host use the same damage, cover, scoring, and respawn rules. Each browser simulates local movement and sends positions, which the match checks against arena bounds and movement limits.

`server/terminal.json` mirrors the base game's terminal collision boxes and walkable ground spawns. If the terminal geometry changes, refresh its boxes from `window.__G.physics.boxes` (excluding `playerOnly` boxes), its bounds from `window.__G.physics.bounds`, and its spawn positions from `window.__G.level`. Coordinates use XYZ order. Each box contains its minimum XYZ followed by its maximum XYZ.
