# 🛠️ AirCade — Project Workflow & Feature Summary

> **Last updated:** 1 Aug 2026 | **Status:** Playable MVP (Solo Mode)

Welcome to AirCade! This document tells you **exactly what's been built**, how it all fits together, and what still needs work. Read this before touching any code.

---

## 1. 🎮 What Is AirCade?

An **8-bit pixel-art plane crash survival game** designed to be played offline during flights.

**Story:** You survive a plane crash on a tropical island. Gather wood and stone, craft campfires to survive freezing nights, and find 3 scattered radio parts to call a rescue helicopter and win.

**Targets:**
- ✅ Desktop browser (Chrome/Firefox/Edge)
- ✅ Android APK (via Capacitor WebView wrapper)
- 🔲 BLE Multiplayer (planned — Bluetooth co-op between nearby phones)

---

## 2. 🧱 Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Game Engine** | Phaser 3 (v4.2) | 2D arcade physics, sprite rendering, camera system |
| **UI Framework** | React 19 (Vite 8) | Menus, HUD overlay, state management |
| **Mobile Joystick** | react-joystick-component | Touch controls for phone/tablet |
| **Android Wrapper** | Capacitor 8 | Wraps the web app in a native Android WebView |
| **Multiplayer (planned)** | PeerJS + BLE plugin | Peer-to-peer over Bluetooth Low Energy |
| **Font** | Silkscreen (Google Fonts) | Strict 8-bit retro aesthetic on ALL text |

---

## 3. 📁 Project Structure

```
G:\MoreCode\AirCade\
├── README.md                       ← Repo overview
└── aircade/                        ← The actual app
    ├── index.html                  ← Entry HTML (loads Vite bundle)
    ├── package.json                ← Dependencies & scripts
    ├── vite.config.js              ← Vite bundler config
    ├── capacitor.config.json       ← Capacitor settings (webDir: "dist")
    │
    ├── src/                        ← ALL SOURCE CODE
    │   ├── main.jsx                ← React entry point
    │   ├── index.css               ← Global styles (Silkscreen font, retro-box, retro-button)
    │   ├── App.jsx                 ← React root: Menus, HUD, Game Over, Win screens
    │   ├── game/
    │   │   ├── PhaserGame.jsx      ← Initializes Phaser engine with Arcade Physics
    │   │   └── GameScene.js        ← ⭐ THE MAIN GAME LOGIC (255 lines)
    │   └── components/
    │       └── MobileControls.jsx  ← Touch joystick + CHOP button (mobile only)
    │
    ├── public/                     ← Static assets (served at root URL /)
    │   ├── island_map.jpg          ← 4000×4000 pixel art island background
    │   ├── menu_bg.jpg             ← Main menu background image
    │   ├── player.jpg              ← Player character sprite
    │   ├── rock.jpg                ← Mineable rock sprite
    │   ├── campfire.jpg            ← Placed campfire sprite
    │   ├── radio_part.png          ← Collectible radio part icon
    │   ├── helicopter.png          ← Win screen helicopter image
    │   ├── icon_wood.png           ← HUD wood icon
    │   ├── icon_stone.png          ← HUD stone icon
    │   ├── icon_heart.png          ← HUD heart icon
    │   └── favicon.svg             ← Browser tab icon
    │
    ├── android/                    ← Auto-generated Android Studio project
    └── dist/                       ← Compiled production build (npm run build)
```

### Key Files At A Glance

| File | What It Does | Lines |
|------|-------------|-------|
| `GameScene.js` | Player movement, resource spawning, gathering, campfire crafting, day/night cycle, darkness/flashlight rendering, freezing damage, particles | ~255 |
| `App.jsx` | Main Menu, Host/Join/Scan lobby screens, in-game HUD (health bar, inventory slots, craft button), tutorial popup, day counter, Game Over & Win screens, React↔Phaser event bridge | ~327 |
| `PhaserGame.jsx` | Creates and destroys the Phaser.Game instance, connects it to the React component via `gameRef` | ~32 |
| `MobileControls.jsx` | Touch joystick (left thumb) + CHOP button (right thumb) for mobile | ~18 |
| `index.css` | Silkscreen font import, `.retro-box`, `.retro-button` styles, health flash animation | ~44 |

---

## 4. ✅ Features Already Built

### 🕹️ Core Gameplay (GameScene.js)

| Feature | How It Works |
|---------|-------------|
| **Player Movement** | WASD keyboard input + touch joystick via `react-joystick-component`. Speed: 400px/s. Collides with world bounds (4000×4000). |
| **Resource Spawning** | 20 trees, 15 rocks, 3 radio parts — randomly placed across the 4000×4000 island at scene creation. |
| **Gathering** | Press SPACE or tap CHOP button. Checks distance to nearest tree/rock/radio (< 80px). Destroys the object, emits `itemGathered` event to React. Priority: Tree → Rock → Radio. |
| **Campfire Crafting** | Costs 2 Wood + 1 Stone. Places a campfire sprite at player position with smoke particles. Campfire is a static physics body (player collides with it). |
| **Day/Night Cycle** | `darknessAlpha` increments by 0.0001 per frame. Peaks at 0.85 (near-total darkness), then reverses back to 0 (sunrise). Tracks `dayCount`, emits `newDay` event. |
| **Flashlight Effect** | Uses a `RenderTexture` filled with black, then `erase()` punches 300×300px circular holes around the player and each campfire. Creates a real flashlight look, not a boring overlay. |
| **Freezing Damage** | Every 3 seconds, if `darknessAlpha > 0.5` AND player is NOT within 150px of a campfire → emits `takeDamage` event (-5 HP) + camera shake. |
| **Smoke Particles** | Each campfire emits white smoke particles rising upward using Phaser's built-in particle system. Texture generated procedurally (8×8 white circle). |
| **Dust Particles** | Player kicks up brown dust when moving. Stops when idle. Generated procedurally (6×6 brown circle). |
| **Floating Text** | "+1 Wood" / "+1 Stone" / "+1 Radio" / "-5 HP" — tweens upward and fades out over 1.5s. Uses Silkscreen font with black stroke. |
| **Camera** | Follows player. Zoom = `Math.max(screenWidth, screenHeight) / 1200` for responsive scaling across phones and laptops. Bounds: -500 to 4500. |
| **Island Map** | Pre-rendered pixel art image (`island_map.jpg`) displayed as 4000×4000 background at depth -1. |

### 🖥️ UI Layer (App.jsx)

| Feature | How It Works |
|---------|-------------|
| **Main Menu** | Full-screen with `menu_bg.jpg` background + dark overlay. Two buttons: "BROADCAST (HOST)" and "SCAN (JOIN)". |
| **Hosting Screen** | Shows "BROADCASTING BLE SIGNAL..." with pulsing blue circle animation. Has "START SOLO" button to begin game without waiting. |
| **Scanning Screen** | Shows "SCANNING LOCAL AREA..." with pulsing red circle. Auto-transitions to "SURVIVOR FOUND" after 3 seconds (placeholder — not real BLE yet). |
| **Found Survivor Screen** | Shows "SURVIVOR FOUND: PLAYER 1" with "CONNECT VIA BLUETOOTH" button (placeholder). Transitions to gameplay. |
| **HUD — Health Bar** | 300px wide red bar with white border. Shrinks with `width: ${health}%` and smooth CSS transition. |
| **HUD — Inventory** | 3 retro-box slots showing Wood/Stone/Radio counts with their PNG icons. Radio shows `X/3` format. |
| **HUD — Craft Button** | Orange slot labeled 🔥 CRAFT. Turns dark gray when resources insufficient. Calls `craftCampfire` event. |
| **Day Counter** | Top-right "DAY X" retro-box. Flashes gold for 2 seconds on day change via `.day-flash` CSS class. |
| **Tutorial Popup** | Shows on game start: "WASD to move \| SPACE to gather \| Build campfires to survive the night \| Find 3 Radio Parts to escape". Auto-fades after 5s, fully hidden at 6s. |
| **Low Health Warning** | When HP < 30, screen edges pulse red using `box-shadow: inset` animation. |
| **Game Over Screen** | Full red background. "YOU FROZE TO DEATH" + "TRY AGAIN" button. Resets health, inventory, day, and increments `gameKey` to force Phaser scene restart. |
| **Win Screen** | Full blue background. "RESCUE HAS ARRIVED!" + helicopter image + "PLAY AGAIN" button. |
| **Scene Restart** | Uses React `key={gameKey}` prop on `<PhaserGame>`. Incrementing the key unmounts/remounts the entire Phaser instance, giving a fresh scene with new resource spawns. |

### 📱 Mobile Controls (MobileControls.jsx)

| Feature | How It Works |
|---------|-------------|
| **Virtual Joystick** | Bottom-left, 100px size. Dark base, white stick. Emits normalized X/Y to GameScene via Phaser events. |
| **CHOP Button** | Bottom-right, big red button. Fires `chopAction` event in Phaser. |
| **Auto-Detection** | Only shown when `navigator.maxTouchPoints > 0`. Desktop shows a keyboard-style "GATHER (SPACE)" button instead. |

### 🎨 Styling (index.css)

| Class | What It Does |
|-------|-------------|
| `*` | Forces Silkscreen font globally — the 8-bit theme is **sacred** |
| `.retro-box` | Black background, 4px solid white border, white text |
| `.retro-button` | Red background, black 4px border, 4px drop shadow. Presses down on click (translate + shadow removal) |
| `.health-flash` | Red color flash + scale animation for damage feedback |

### 📦 Android (Capacitor)

- `capacitor.config.json` points `webDir` to `"dist"`
- `android/` folder is generated and ready for Android Studio
- Build flow: `npm run build` → `npx cap sync` → Open in Android Studio → Run on device

---

## 5. 🔧 How It All Connects (Data Flow)

```
┌─────────────────────────────────────────────────────────────────┐
│                        React (App.jsx)                          │
│  ┌──────────┐  ┌────────┐  ┌───────────────┐  ┌────────────┐  │
│  │ Main Menu│→ │Lobby UI│→ │ In-Game HUD   │→ │ End Screen │  │
│  │          │  │Host/Join│  │HP bar, items, │  │ Win / Death│  │
│  └──────────┘  └────────┘  │craft, day     │  └──────┬─────┘  │
│                             └──────┬────────┘         │        │
│                                    │ gameRef           │        │
│         ┌──────────────────────────┼──────────────────┐│        │
│         │    Phaser Event Bridge   │                  ││        │
│         │  ┌───────────────────────▼───────────────┐  ││        │
│         │  │ game.events.on('itemGathered')        │  ││        │
│         │  │ game.events.on('takeDamage')          │◄─┘│        │
│         │  │ game.events.on('newDay')              │   │        │
│         │  │ game.events.emit('chopAction')        │   │        │
│         │  │ game.events.emit('craftCampfire')      │   │        │
│         │  │ game.events.emit('joystickMove/Stop') │   │        │
│         │  └───────────────────────────────────────┘   │        │
│         └──────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Phaser (GameScene.js)                         │
│  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐    │
│  │Player  │ │Resources │ │Campfires │ │ Day/Night + Light  │    │
│  │movement│ │trees,    │ │crafted by│ │ RenderTexture with │    │
│  │WASD +  │ │rocks,    │ │player,   │ │ circular erase for │    │
│  │joystick│ │radios    │ │smoke VFX │ │ flashlight effect  │    │
│  └────────┘ └──────────┘ └──────────┘ └───────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight:** React owns the UI and state (HP, inventory, game screens). Phaser owns the game world (sprites, physics, rendering). They talk through `game.events` — Phaser emits events when things happen in the game world, React listens and updates the UI.

---

## 6. 💻 Running Locally

### First Time
```bash
cd aircade
npm install
```

### Dev Server
```bash
npm run dev
# Opens at http://localhost:5173
# WASD to move, SPACE to gather, click CRAFT when you have 2 Wood + 1 Stone
```

---

## 7. 📱 Building the Android APK

### Prerequisites
- **Android Studio** installed ([download](https://developer.android.com/studio))
- **Java JDK 17+** installed
- Android phone with **USB Debugging** enabled

### Build Steps
```bash
cd aircade
npm run build           # 1. Compile web app → dist/
npx cap sync            # 2. Copy dist/ into android/ project
npx cap open android    # 3. Open in Android Studio
```
Then in Android Studio:
1. Wait for Gradle sync to finish
2. Connect phone via USB
3. Click ▶️ Run
4. For a shareable APK: **Build → Build APK(s)** → find it at `android/app/build/outputs/apk/debug/app-debug.apk`

### Update Cycle
```bash
# After any code change:
npm run build → npx cap sync → Run ▶️ in Android Studio
```

> **Pro Tip:** Use `npm run dev` in the browser for fast iteration. Only build the APK when you need to test on a real phone.

---

## 8. 🔲 What Still Needs Work

### Frontend (Priority)

| Feature | Difficulty | Impact | Description |
|---------|-----------|--------|-------------|
| Walking Animation | Medium | 🔥🔥🔥 | Player is a static JPEG sliding around. Need a spritesheet with walk cycle + flip sprite on direction change. |
| Audio | Medium | 🔥🔥🔥 | No sound at all currently. Need background music, chop/mine SFX, damage SFX, win jingle. |
| Scene Restart Bug | Easy | 🔥🔥 | When player dies and retries, trees/rocks may not respawn properly. The `gameKey` approach works but needs verification. |
| More Craftables | Medium | 🔥🔥 | Torch (extends flashlight radius), Stone Axe (2× wood per chop). |
| Minimap | Medium | 🔥🔥 | Corner minimap showing dots for player, resources, and campfires. |
| Menu Polish | Easy | 🔥 | Flickering retro title text, CRT scanline overlay effect on menu. |

### Backend / Native (After Frontend)

| Feature | Difficulty | Owner | Description |
|---------|-----------|-------|-------------|
| BLE Multiplayer | Hard | Milind | Host broadcasts GATT service, scanner finds nearby hosts. Uses `@capacitor-community/bluetooth-le`. |
| PeerJS Fallback | Medium | Milind | Wi-Fi multiplayer fallback using WebRTC peer connections. |
| Player 2 Sync | Hard | Milind/Dhruv | Transmit X/Y coordinates over BLE characteristic. Render second player sprite in GameScene. |
| APK Testing | Easy | Milind | Build, install, and QA test on physical Android devices. |

---

## 9. 👥 Team

| Person | Focus | Key Files |
|--------|-------|-----------|
| **Dhruv** | Game logic, Phaser mechanics, Capacitor setup | `GameScene.js`, `PhaserGame.jsx` |
| **Vinayak** | UI/UX, pixel art, CSS, prompt engineering | `App.jsx`, `index.css`, `public/*` |
| **Milind** | BLE plugin, hardware testing, QA | `MobileControls.jsx`, `android/`, BLE integration |

---

## 10. 🚨 Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm run dev` shows blank screen | Clear browser cache or restart Vite (`Ctrl+C`, `npm run dev`) |
| Android Studio says "No device" | Enable USB Debugging on phone, reconnect USB |
| Gradle sync fails | File → Invalidate Caches → Restart |
| Assets not loading on phone | Run `npx cap sync` again after `npm run build` |
| Game looks zoomed wrong | Camera zoom auto-adjusts via `Math.max(w,h)/1200` — resize browser to test |

---

**Questions? Ask Vinayak — he set all of this up.** 🚀
