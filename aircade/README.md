# AirCade ✈️🕹️

**AirCade** is a local multiplayer 8-bit survival game for Android! We built this as a hackathon project to create a game you can play with your friends anywhere, without needing Wi-Fi or cellular data.

---

## 👨‍💻 Built By
- **Milind**
- **Dhruv**
- **Vinayak**

---

## 🎮 How to Play

You and up to 3 friends crash land on a freezing island. Work together to survive:
- **Gather:** Chop trees for wood and mine rocks for stone.
- **Survive:** Craft campfires to stay warm. If you stay in the cold too long, you will freeze!
- **Escape:** Find the 3 missing radio parts scattered around the island to call the rescue helicopter and win!

The game uses Bluetooth to connect players completely offline. One person hosts the game, and the others join.

---

## 📱 How to Install (Android)

1. Build the web code:
   ```bash
   npm run build
   ```
2. Sync with Android:
   ```bash
   npx cap sync android
   ```
3. Open Android Studio and install the app to your phone:
   ```bash
   npx cap open android
   ```

---

## 💻 Test on your Computer

If you just want to test the game in your web browser without building the Android app:
```bash
npm install
npm run dev
```
Open `http://localhost:5173` in multiple browser tabs to simulate a multiplayer session!
