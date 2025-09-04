# 🥷 Ninja Runner - Universal Server Manager

⚡ Universal development server runner - Auto-detect and manage ANY frontend/backend projects with one-click!

## ✨ Features

- **🔍 Universal Auto-Detection**: Automatically finds React, Angular, Vue, Spring Boot, Django, and more
- **🎯 One-Click Project Selection**: Choose your projects once, saved forever
- **⚡ Smart Folder Scanning**: Handles complex nested structures like `Project/Module/frontend`
- **🅵🅱️ Visual Indicators**: Clear frontend (🅵) and backend (🅱️) project marking
- **💾 Workspace Persistence**: Your preferences remembered across VS Code sessions
- **🚀 Floating Status Bar**: Live server status with start/stop controls
- **📦 Auto Dependencies**: Automatic npm and Maven dependency installation
- **🧹 Clean Interface**: Streamlined toolbar design with essential actions only

## 🚀 Quick Start

1. **Open any workspace** containing frontend/backend projects
2. **Click the 🥷 ninja icon** in the VS Code activity bar  
3. **Select which projects to run** from the auto-detected list
4. **Your choices are saved** - next time just click to start all!
5. **Manage servers** through the clean tree sidebar

## 🎯 Supported Project Types

**Frontend Projects:**
- ⚛️ React (Create React App, Next.js)
- 🅰️ Angular (ng serve)
- 💚 Vue.js (npm run dev)
- 🔥 Vite projects
- 📦 Any Node.js project with package.json

**Backend Projects:**
- ☕ Spring Boot (Maven)
- 🟢 Node.js/Express servers
- 🐍 Python Django (coming soon)
- 🚀 Any project with start scripts

## 📋 Essential Commands

**Toolbar Actions:**
- **� Auto Detect** - Scan workspace for projects
- **▶️ Start All** - Launch all selected servers
- **⏹️ Stop All** - Stop all running servers
- **⚙️ Reset Config** - Reconfigure project defaults
- **🔄 Refresh** - Update server status

**Command Palette:** (`Ctrl+Shift+P`)
- `Ninja: Add Server` - Add custom server
- `Ninja: Install All Dependencies` - Install npm/Maven deps

## 🛠️ Installation

Install from VS Code Marketplace:
```
ext install akhilninja.ninja-runner
```

Or install manually:
```bash
code --install-extension ninja-runner-0.1.0.vsix
```

## 🎯 Perfect For

- **Multi-module projects** like OCBISPhaseTwo/FSP/frontend
- **Microservices development** with multiple frontend/backend pairs
- **Team development** with consistent server management
- **Complex project structures** with nested configurations
- **Any developer** who wants one-click server management!

## 🔧 Development

```bash
git clone https://github.com/Akhil-Prajapati/ninja-runner.git
cd ninja-runner
npm install
npm run compile
npx vsce package
```

## 📝 License

MIT License - Open source and free to use!

## 👨‍💻 Author

**Akhil Ninja** - Creating developer productivity tools that make coding faster and more enjoyable!

---

*🥷 Happy Coding with Ninja Runner! ⚡*
