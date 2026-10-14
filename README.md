# SPOT SPRINT — Live classroom matching game

A free-to-run **real-time multiplayer website** for a teacher projector and up to **40 student devices**. Students join using a **six-character game code** and a first name/nickname. No student email, sign-in or accounts required.

## How it plays

1. The teacher clicks **Create game** and displays the teacher page on the projector.
2. Students visit the same website, type the code, and enter a display name.
3. Before starting, the teacher selects **1–30 cards to win** (shortcuts for 5, 10 or 20).
4. The teacher clicks **Start the race**. There is one big card on the teacher screen; students get different personal cards. Students can also see a smaller version of the shared teacher card on their own screen.
5. Each pair of different cards has **exactly one shared picture**. A student earns **one point** when they tap this picture on their card. Their own card disappears and is replaced, and **the teacher's card changes immediately for the entire class**.
6. The **first player to reach the target number of cards wins**. The teacher sees a live leaderboard and can pause the race, replay, or return to the lobby.

There are 57 mathematically constructed cards and 57 distinct emoji pictures. Students' race stacks are chosen randomly each game. Audio effects are synthesized in the browser and can be muted. The server checks every answer, preventing clients from awarding points to themselves.

## Run on your own computer (Windows / Mac)

Install the current LTS release of **Node.js** from https://nodejs.org/ (only needed once).

**Windows:** unzip this package, then double-click `start-windows.bat`. It starts the game server and opens `http://localhost:3000` in your browser. Keep the **Spot Sprint Server** window open while playing.

**Mac / Linux:** in the extracted project folder, open Terminal and run:

```bash
npm start
```

Then visit `http://localhost:3000`.

### Allow other devices to join on the same school Wi-Fi

The teacher's computer and student devices must be able to access each other on the network. Use the **teacher computer's local IP** rather than `localhost`, for example `http://192.168.1.25:3000`. The website and the join link both then use that address. Check Windows Firewall if access is blocked. Many schools isolate student devices from teacher devices, so the **public hosting option below is usually easier**. **Important:** if your teacher browser shows `localhost`, change it to your computer’s LAN IP before copying the join link; `localhost` only works on your own device.

## Put the website online

To make it accessible through a normal HTTPS website from every student device, deploy it on a Node.js host supporting Server-Sent Events (SSE), such as **Render**, **Railway** or another Node provider. These are example deployment steps for a GitHub + Render workflow:

1. Create a GitHub repository and upload all of the extracted files **except `node_modules`**.
2. In Render, create a new **Web Service** from that repository, with **Node** as the runtime (or use the included `render.yaml` blueprint).
3. Build command: `npm install` (no runtime dependencies); Start command: `npm start`.
4. Open the HTTPS website address the host gives you. That's the link to share with students. They join on the same address.

**Important:** This ZIP is a complete application but it is **not automatically hosted or published**. A connected hosting account is required to put it online. Hosting plans, network rules and fees depend on the provider. For reliable play, choose a hosting setup that supports persistent live streaming connections and doesn't go to sleep during class.

## Classroom use / privacy

- No student emails, passwords, dates of birth or registration are requested.
- Names and game information are stored **temporarily in server memory** and disappear on server restart. Inactive rooms expire.
- Teachers can use first names, initials or pseudonyms to minimise student information.
- Browser tab refresh normally restores the game session for that tab. Closing the tab may require joining again.
- A participant who joins after a race starts watches until the next race.
- When hosted publicly, prefer an appropriate school-approved host and comply with your school system's privacy requirements.
- While the server verifies matches and race wins, this is a **casual classroom game**, not an exam or high-stakes anti-cheat system.

## Troubleshooting

| Problem | What to try |
|---|---|
| Students cannot join | Verify all devices use the **same accessible server URL**, not `localhost` on students' devices. Confirm the 6-character code. |
| Game goes offline | Check the server terminal and Wi-Fi connection. Reconnect or refresh the browser. |
| Sounds are silent | Tap the **Sound on** button and interact with the page. Browsers require a gesture before playing audio. |
| Room vanished | Rooms only live in memory; they reset when the host restarts. Create a fresh code. |
| Class cannot connect using an IP address | Your school's Wi-Fi may block device-to-device traffic. Use a publicly deployed HTTPS instance. |

## For developers

- Backend: `server.js` (native Node HTTP + Server-Sent Events)
- Deck: `deck.js` (finite projective plane of order 7)
- UI: `public/index.html`, `public/app.js`, `public/realtime.js`, `public/style.css`
- Run mathematical deck tests: `npm test`
- Health check: `GET /health`
- Environment variable: `PORT` (defaults to `3000`)

**Game mechanics note:** There are 57 cards (8 pictures each). The server ensures the central card is *different* from every student's current card, so the exactly-one-match rule is always valid. A successful student's own card and the shared class card advance in one atomic server-side turn. Other students must then spot the new match. Disconnected players can return to the same game from their browser tab.
