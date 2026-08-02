# AirCade ✈️🕹️

**AirCade** is a local multiplayer 8-bit pixel-art plane crash survival game designed specifically for Android devices. Stranded on a freezing procedurally generated island, you and up to 3 friends must collaborate, gather resources, craft campfires to stay warm, and locate radios to call for a rescue helicopter.

Built with **React**, **Phaser 3**, and wrapped natively via **Capacitor** using **Bluetooth Low Energy (BLE)** to provide seamless offline multiplayer without needing Wi-Fi or cellular data!

---

## 🛠️ Technology Stack

- **Frontend:** React + Vite
- **Game Engine:** Phaser 3 (Arcade Physics, Pixel Art Mode)
- **Native Wrapper:** Capacitor v7
- **Networking:** Capacitor Bluetooth Low Energy (`@capgo/capacitor-bluetooth-low-energy`)
- **Multiplayer Model:** Deterministic Host-Client Simulation with binary custom packet serialization (Uint8Array).

---

## 🎮 Gameplay Features

* **Offline Multiplayer:** Play with friends anywhere. One player acts as the Host via Bluetooth Advertising, while others scan and connect seamlessly.
* **Procedural World:** The island generates deterministically using a hashed seed, ensuring all clients see the exact same layout of trees, rocks, and radios without massive network payloads.
* **Survival Mechanics:** Gather wood and stone to craft campfires. Stand near campfires to heal from the biting cold.
* **Objective:** Find and gather 3 radio parts scattered across the map to call the rescue helicopter and win!
* **Mobile-First Controls:** Virtual on-screen joystick with multi-touch support for smooth mobile gameplay.

---

## 💻 Local Development (Web)

Since BLE requires native mobile hardware, the project includes a powerful `MockBleTransport` that uses the `BroadcastChannel` API to simulate Bluetooth connections across multiple browser tabs!

```bash
# 1. Install dependencies
npm install

# 2. Start the Vite development server
npm run dev
```
Open `http://localhost:5173` in multiple browser tabs to simulate a multiplayer session! 

---

## 📱 Compiling for Android

The game is strictly optimized for Android. To compile and run on a physical device, follow these steps:

### Prerequisites
- Install **Node.js** (v18+)
- Install **Android Studio** (Flamingo or later)
- An Android device with Bluetooth and Developer Mode / USB Debugging enabled.

### Build Steps

1. **Build the Web Assets**
   This compiles the React and Phaser code into the `dist/` directory.
   ```bash
   npm run build
   ```

2. **Sync with Capacitor**
   This copies your newly built web assets into the Android native project folder and updates native plugins.
   ```bash
   npx cap sync android
   ```

3. **Open Android Studio**
   Open the Android project in Android Studio.
   ```bash
   npx cap open android
   ```

4. **Deploy to Device**
   - Connect your Android phone via USB.
   - Wait for Android Studio to finish Gradle Sync.
   - Click the green **Run (▶)** button in the top toolbar to build the APK and install it on your device.

---

## 🐞 Debugging & Architecture

- **Custom Binary Codec:** To bypass Bluetooth MTU limits and latency, the entire game state is packed into custom `Uint8Array` binary payloads in `MessageCodec.js`. 
- **Deterministic Simulation:** Since all random elements (like world generation) rely on `_seededRandom`, clients only need the `worldSeed` to generate identical maps.
- **Tick Rate:** The simulation runs at 20 Ticks/Second (`BLE.TICK_RATE`).
- **Input Queueing:** Mobile input is sampled and queued to be processed deterministically on the next host tick to prevent input dropping over spotty BLE connections.
