# 🥷 Ninja Runner — Universal Server Manager & Dev Hub

[![Version](https://img.shields.io/badge/version-0.3.0-blue.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=akhilninja.ninja-runner)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.58%2B-007ACC.svg?style=flat-square&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=akhilninja.ninja-runner)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=flat-square)](LICENSE.txt)

> **The ultimate server manager for developers who love to code, not juggle terminals.**  
> Automatically detect, launch, monitor, and manage all your frontend & backend projects in a single click.

---

## 💡 Why Ninja Runner?

Are you tired of manually opening 10 terminal tabs, typing `cd Auth/frontend && npm run dev` every single morning, and hunting down zombie processes blocking port `3000` or `8080`?

**Ninja Runner** turns your multi-project workspace into a streamlined, high-speed control center.

---

## ✨ Key Features

- 🔍 **Zero-Config Auto-Detection**: Instantly finds all nested & standalone projects (React, Next.js, Angular, Vue, Vite, Spring Boot, Express, NestJS, etc.).
- 🚀 **1-Click Multi-Server Management**: Start or stop all your servers at once, or control them individually with live status badges.
- ⚡ **Universal Port Kill Switch**: Blocked on port `3000` or `8080`? Type any port or click **Free Port** to immediately terminate stuck zombie processes.
- 🛡️ **Smart Profile Enforcement**: Automatically prevents Maven staging/prod builds from contaminating your local development runs (`dev` profile strictly enforced).
- ⏱️ **Real-Time Port & Ctrl+C Tracking**: If a server stops or you press `Ctrl+C`, Ninja Runner immediately detects the closed port and updates the UI.
- 🪟 **Rock-Solid Cross-Platform Support**: Fixed shell execution traps across Windows (PowerShell/CMD), macOS, and Linux.
- 🦖 **Built-in Offline Dino Runner**: Jump cacti and beat your high score in the classic Chrome arcade game right inside your editor while code compiles!
- 🌸 **Daily Dev Wisdom & Gujarat Holidays**: Inspiring developer humor, quotes, and public holiday tracker.

---

## 📖 User Manual & Quick-Start Guide

### Step 1: Open the Ninja Runner Sidebar
Click the **Ninja Star (🥷)** icon on your VS Code Activity Bar (left sidebar).

### Step 2: Auto-Detect Your Projects
1. Click the **Search ($(search))** icon in the title bar or run `Ninja: Auto-Detect Projects` (`Ctrl+Shift+P`).
2. A clean selection dialog will appear with all detected frontend and backend projects.
3. Check the projects you want to manage and hit **Enter**. Your choices are remembered forever across sessions!

### Step 3: Run Your Servers
- **Start All**: Click the **Run All ($(run-all))** button in the title bar to spin up all servers simultaneously.
- **Start Individual**: Click on any server in the list (`Auth Frontend`, `Auth Backend`) to start it in its own dedicated terminal.
- **Stop Server**: Click the inline **Stop ($(stop))** icon next to any running server.
- **Open in Browser**: Click the **Open in Browser ($(link-external))** icon on any frontend server to launch `http://localhost:PORT`.

### Step 4: Kill Stuck Ports with the Port Kill Switch
If a zombie process is holding port `8080`, `3000`, or `5432`:
1. In the **Dev Dashboard** panel below, click **`⚡ Kill Custom Port Process...`**.
2. Type the port number and press **Enter**.
3. *Done!* The blocking process is terminated instantly.

### Step 5: Play Offline Dino Runner 🦖
Taking a mental break or waiting for a heavy build?
- Look at the bottom of the **Dev Dashboard** and click **`🎮 Launch Fullscreen Dino Game`** to play the classic Chrome T-Rex runner with Spacebar controls!

---

## 🌐 Supported Tech Stacks & Frameworks

| Category | Supported Technologies | Default Port |
| :--- | :--- | :--- |
| **Frontend** | React, Next.js, Vite, Angular, Vue.js, Nuxt, Svelte, Static Web | `:3000`, `:4200`, `:5173`, `:8080` |
| **Backend** | Spring Boot (Maven), NestJS, Express.js, Fastify, Koa, Hapi, Node.js | `:8080`, `:3000`, `:5000` |
| **Packaging** | Spring Boot WAR / Next.js ZIP via Build Manager (`build.sh`) | Staging / Prod / Both |

---

## 🎨 Server States & Visual Indicators

| State | Visual Indicator | Meaning |
| :--- | :--- | :--- |
| **Running** | 🟢 Green Checkmark (`pass-filled`) | Server is live and actively listening on its port |
| **Starting** | 🟡 Yellow Spinner (`loading~spin`) | Terminal initialized, compiling and binding port |
| **Stopped** | ⚪ Muted Circle (`circle-outline`) | Server is idle / stopped |
| **Failed** | 🔴 Red Error Badge (`error`) | Server exited or crashed — click to retry |

---

## ⌨️ Command Palette (`Ctrl+Shift+P`)

| Command | Action |
| :--- | :--- |
| `Ninja: Auto-Detect Projects` | Scan workspace and configure projects |
| `Ninja: Start All Servers` | Launch all selected frontend and backend servers |
| `Ninja: Stop All Servers` | Stop all active servers gracefully |
| `Ninja: Kill Port Process` | Interactive prompt to kill any port (Port Switch) |
| `Ninja: Reset & Reconfigure` | Reselect workspace projects from scratch |
| `Ninja: Install All Dependencies` | Batch install `npm` and `mvn` dependencies |
| `Ninja: Play Chrome Dino Runner` | Launch the arcade Dino game webview |

---

## 📦 Installation

### From VS Code Marketplace
Search for **`Ninja Runner`** in the Extensions view (`Ctrl+Shift+X`) and click **Install**.

Or install via terminal:
```bash
code --install-extension akhilninja.ninja-runner
```

### From Open VSX (Antigravity IDE / VSCodium)
```bash
ovsx install akhilninja.ninja-runner
```

---

## 👨‍💻 Author & Community

Crafted with ❤️ by **[Akhil Prajapati](https://github.com/akhil-prajapati)** to supercharge developer productivity and make multi-project workflows effortless.

- 🐛 **Found a bug or have an idea?** [Open an Issue](https://github.com/akhil-prajapati/ninja-runner/issues)
- ⭐ **Love Ninja Runner?** Leave a 5-star rating on the VS Code Marketplace!

---

*Happy Coding with Ninja Runner! 🥷⚡*
