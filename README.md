# 🥷 Ninja Runner - VS Code Extension

⚡ Lightning-fast server runner for FSP and HRMS frontend/backend development

## Features

- **One-Click Server Management**: Start all your development servers with a single click
- **Auto-Start on Focus**: Every time you click the Ninja Runner icon in the activity bar, all servers start automatically
- **Smart Sidebar Integration**: Automatically opens the tree sidebar for easy navigation
- **Multi-Server Support**: Run frontend and backend servers simultaneously
- **Custom Server Configuration**: Add, edit, and manage your own server configurations
- **Real-time Status Monitoring**: Visual indicators show which servers are running
- **Terminal Integration**: Each server runs in its own VS Code terminal

## Quick Start

1. Click the 🥷 Ninja Runner icon in the VS Code activity bar
2. All configured servers will start automatically
3. The sidebar will open showing your server tree
4. Manage servers through the intuitive UI

## Supported Projects

- **FSP Frontend**: React/Next.js development server
- **FSP Backend**: Spring Boot Maven application
- **HRMS Frontend**: React/Next.js development server
- **HRMS Backend**: Spring Boot Maven application
- **Custom Servers**: Add your own server configurations

## Commands

- `🚀 Start All Servers` - Launch all configured servers
- `🛑 Stop All Servers` - Stop all running servers
- `➕ Add New Server` - Add custom server configuration
- `✏️ Edit Server` - Modify existing server settings
- `🗑️ Delete Server` - Remove server configuration

## Installation

Install from VS Code Marketplace or install manually:

```bash
code --install-extension ninja-runner-0.0.1.vsix
```

## Development

```bash
npm install
npm run compile
npx vsce package
```

## Author

Created by **akhilninja** - Lightning-fast development tools for modern web applications

## License

MIT License - see LICENSE file for details
