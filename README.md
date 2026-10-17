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

## Big-screen celebrations and music (2026 update)

When any student selects the correct match, the server immediately awards their point and broadcasts their name to all screens. The shared teacher card **does not flip for three seconds**. During the wait the teacher screen shows a colourful, flashing name announcement, a 3–2–1 countdown, and a short arcade-style success jingle. All further guesses are locked until the next card is dealt; the last winning card also gets a full three-second celebration before the winner is announced.

An original synthesised 120-BPM looping background tune plays on the **teacher screen only** while a race is running. It becomes quieter for each celebration. The top-right **Music on/off** control is independent of the overall **Sound on/off** control. The tune and sound effects use browser Web Audio, require no sound assets or external services, and are subject to the browser's user-interaction policy: click Create Game or Start to unlock audio. Music is stopped during pauses, in the lobby and after the race.

## Teacher display, music and fullscreen

On the teacher dashboard students see **spot-sprint-classroom.onrender.com** prominently, along with the separate six-character code. Use **⛶ Full screen** in the top-right corner to project the game without a browser toolbar or document scrolling. The fullscreen view fits the card, joining directions, control buttons and leading scores; with large classes the leaderboard shows the highest players plus a count of others.

An original electronic **lobby track** plays on the teacher's screen after the teacher clicks Create Game (a user click is required by browser sound policies). Click **♫ Lobby music playing · Pause** or the top-right music toggle to stop it. When the round begins it transitions to the faster game track; correct matches briefly lower the music while the sound and three-second announcement play. The separate sound control mutes all audio. Music is synthesised in the browser, requires no downloads, and never plays on student devices.

## Classroom game hub

Use **Change Game** in the teacher lobby (or after a round) to choose Spot Sprint, **Word Weave**, or **Find a Word**. Switching returns every connected student to the selected game's lobby without changing the room code, student token, or name. Scores reset for each new round. Return to the lobby before switching away from an active round.

- **Word Weave:** connect adjacent letters horizontally, vertically or diagonally, without reusing a tile. Teachers choose a 4×4 or 5×5 grid, 1–6 minutes, and a minimum of 3 or 4 letters. Each valid word scores once per student; classmates can independently find the same words. Longer words earn more points. QU is one tile and two letters. Highest score wins, with shared winners on a tie.
- **Find a Word:** choose 5, 10, 15 or 20 targets, Everyday/Animals/Science/Geography, and easy, diagonal or all-direction placement. Drag along a word or tap its two ends. Each found word earns one point; first to find every target wins.
- Both games use server-validated paths, live scores, pause/resume, a shared countdown, fresh grids each round, and the existing room reconnect mechanism. Late arrivals wait for the next round.

The Word Weave dictionary is an offline 3–12 letter subset of [dwyl/english-words](https://github.com/dwyl/english-words), with a basic inappropriate-term exclusion and Australian spelling additions. It includes uncommon English words; it is not a curriculum-specific vocabulary list. Its public-domain Unlicense is included at `data/WORDS-LICENSE.txt`. The compressed dictionary needs no external API. Word-search themes use small curated lists in `wordgames.js`.

The new game artwork in `public/word-weave.webp` and `public/find-a-word.webp` was generated for this project: ivory letter tiles with a turquoise woven path for Word Weave; an ivory word-search grid with a blue magnifying glass and warm highlighted word for Find a Word. Both use the existing purple classroom arcade palette.

Word Weave takes inspiration from the shared-grid, adjacent-letter, timed word-finding mechanics described in [Netflix's Boggle Party guide](https://help.netflix.com/en/node/486016964629093). Its name, artwork and classroom implementation are original.

Word-game implementation: `wordgames.js`, `public/word-hub.js`, and `public/word-hub.css`. `npm test` runs the existing Spot Sprint tests plus generator, validation, scoring, timer, and cross-game session tests. Rooms remain in memory and do not survive a server restart or deployment.
