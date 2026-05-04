# Ninja Runner - Universal Server Manager

Universal development server runner for VS Code — auto-detect and manage any frontend/backend projects with one click.

## Features

- **Universal Auto-Detection**: Automatically finds React, Angular, Vue, Vite, Spring Boot, Express, NestJS, and more
- **One-Click Server Management**: Start/stop individual or all servers at once
- **Build Manager**: Build Staging and Production environments (WAR/ZIP packaging via Maven)
- **Spring Boot Profile Resolution**: Detects `@spring.profiles.active@` Maven placeholder and resolves the real profile from `pom.xml`
- **Debug Support**: Java (port 5005) and Node.js (port 9229) debug sessions with auto-incrementing ports
- **Browser Integration**: Open frontend servers directly in browser
- **Live Status Decorations**: Color-coded file decorations (green/yellow/blue/red/grey) for server states
- **Status Bar Controls**: Live server count with Start All / Stop All buttons
- **Daily Developer Quotes**: Rotating daily quote card in the Today panel
- **Holiday Info**: Fetches Gujarat public holidays and displays them in the Today panel
- **Workspace Persistence**: Server selections and configurations saved across VS Code sessions

## Quick Start

1. Open any workspace containing frontend/backend projects
2. Click the **Ninja Runner** icon in the VS Code activity bar
3. Use **Auto-Detect Projects** to scan your workspace
4. Select which projects to run from the detected list
5. Click **Start All** or start individual servers from the tree view

## Supported Project Types

**Frontend:**

- React / Next.js (port 3000)
- Angular (port 4200)
- Vue.js (port 8000)
- Vite (port 5173)
- Any Node.js project with `package.json`

**Backend:**

- Spring Boot / Maven (`pom.xml`) (port 8080)
- Express.js
- NestJS
- Fastify
- Koa.js
- Hapi.js
- Generic Node.js backends

## Commands

**Command Palette** (`Ctrl+Shift+P`):

| Command                              | Description                               |
| ------------------------------------ | ----------------------------------------- |
| `Ninja: Auto-Detect Projects`        | Scan workspace for projects               |
| `Ninja: Start All Servers`           | Launch all selected servers               |
| `Ninja: Stop All Servers`            | Stop all running servers                  |
| `Ninja: Add New Server`              | Add a custom server manually              |
| `Ninja: Reset & Reconfigure`         | Clear selections and re-run setup         |
| `Ninja: Install All Dependencies`    | Install npm and Maven dependencies        |
| `Ninja: Build Staging`               | Run a Maven staging build                 |
| `Ninja: Build Prod`                  | Run a Maven production build              |
| `Ninja: Build Both (Staging + Prod)` | Run staging then prod builds sequentially |
| `Ninja: Run in Debug`                | Start server in debug mode                |
| `Ninja: Open in Browser`             | Open a running server in the browser      |
| `Ninja: Check for Updates`           | Check for extension updates               |

## Build Manager

The Build Manager supports WAR/ZIP packaging for Spring Boot projects:

- **Staging Build**: Runs `mvn clean package -Pstaging -DskipTests`
- **Prod Build**: Runs `mvn clean package -Pprod -DskipTests`
- **Build Both**: Runs staging, then prod sequentially in separate terminals
- Build status is tracked via `.ninja_build_status` marker files
- Frontend servers are managed (stopped before build, restarted after)

## Spring Boot Integration

- Detects `pom.xml` for project identification
- Resolves `@spring.profiles.active@` Maven placeholder to the actual profile defined in `pom.xml`
- Falls back to `dev` profile if not defined in `pom.xml`
- Run command: `mvn spring-boot:run -Dspring-boot.run.profiles=<profile>`
- Extended startup health checks (8 attempts over 16 seconds)
- Detects port conflicts, DB connection errors, and config failures

## Server States

| State      | Color  | Badge |
| ---------- | ------ | ----- |
| Running    | Green  | —     |
| Starting   | Yellow | `…`   |
| Restarting | Blue   | `↺`   |
| Error      | Red    | `!`   |
| Stopped    | Grey   | —     |

## Installation

Install from VS Code Marketplace:

```
ext install akhilninja.ninja-runner
```

Or install manually:

```bash
code --install-extension ninja-runner-0.2.1.vsix
```

## Development

```bash
git clone https://github.com/Akhil-Prajapati/ninja-runner.git
cd ninja-runner
npm install
npm run compile
npx vsce package
```

## License

MIT License

## Author

**Akhil Ninja** — Building developer productivity tools for faster, smoother coding workflows.

## Contributors

| Contributor          | Contribution                                 |
| -------------------- | -------------------------------------------- |
| **Chirag Patel**     | WAR/ZIP build packaging logic                |
| **Maharshi Bhavsar** | Core `build.sh` scripting and build pipeline |

---

_Happy Coding with Ninja Runner!_
