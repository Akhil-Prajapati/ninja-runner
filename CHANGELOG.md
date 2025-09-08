# Change Log

## [0.1.2] - 2025-01-03 - Status & UX Improvements

### 🔧 Enhanced Server Status Management

- ✅ **Accurate Status Indicators** - Fixed issue where failed servers showed "🟢 Running" instead of "🔴 Stopped"
- ✅ **4-State Status System** - Added "starting" and "error" states for better visibility
- ✅ **Persistent Error Status** - Error states remain visible until manually cleared
- ✅ **Improved Error Detection** - Better terminal monitoring for server failures

### 🎯 Better User Experience

- ✅ **Selection Preservation** - Server selections now preserved during auto-detect operations
- ✅ **Smart Selection Matching** - Multiple strategies for maintaining user choices
- ✅ **Stop Instead of Delete** - Replaced delete icons with stop buttons for better UX
- ✅ **Server Management** - Users can only remove servers through selection/deselection

### ⚡ New Commands

- ✅ **Stop Server** - Gracefully stop running servers
- ✅ **Retry Server** - Restart failed servers
- ✅ **Clear All Selections** - Reset all server selections

---

## [0.1.1] - 2025-09-04 - Compatibility Update

### 🔧 Improved Compatibility

- ✅ **Broader VS Code Support** - Now supports VS Code 1.10.0+ (covers 99% of users)
- ✅ **Legacy Version Support** - Works with older VS Code installations
- ✅ **Enhanced Accessibility** - More developers can install and use the extension

---

## [0.1.0] - 2025-09-04 - Major Release

### 🚀 Universal Server Management

- ✅ **Universal Project Detection** - Auto-detects React, Angular, Vue, Spring Boot, Django, and more
- ✅ **Smart Folder Scanning** - Handles nested structures like `OCBISPhaseTwo/FSP/frontend`
- ✅ **One-Click Project Selection** - Choose your projects once, remembered forever
- ✅ **Workspace Persistence** - Your preferences saved across VS Code sessions

### 🎯 Enhanced User Experience

- ✅ **Clean Toolbar Design** - Reduced button clutter with essential actions only
- ✅ **Visual Project Indicators** - 🅵 for Frontend, 🅱️ for Backend projects
- ✅ **Intelligent Filtering** - Excludes `node_modules`, `built`, `bin`, `.git` folders
- ✅ **No Duplicates** - Smart logic prevents duplicate project detection

### ⚡ Advanced Features

- ✅ **Floating Status Bar** - Live server status with start/stop controls
- ✅ **Auto Dependency Installation** - npm and Maven dependency management
- ✅ **Reset Configuration** - Easy reconfiguration of default servers
- ✅ **Recursive Project Discovery** - Finds projects at any folder depth

### 🔧 Technical Improvements

- ✅ **Custom Ninja Icon** - Unique server-management themed icon
- ✅ **Enhanced Error Handling** - Better debugging and error messages
- ✅ **Performance Optimized** - Efficient scanning with depth limiting
- ✅ **Marketplace Ready** - Professional packaging and publishing

---

## [0.0.1] - 2025-09-02 - Initial Release

### Added

- 🥷 Initial release of Ninja Runner
- ⚡ Basic server startup for FSP and HRMS projects
- 🚀 Start All servers functionality
- 🟢🔴 Real-time server status monitoring with visual indicators
- ➕ Dynamic server management (Add/Edit/Delete custom servers)
- 🎯 Smart organization with Frontend/Backend categories
- 🎨 Modern UI with emoji-enhanced server labels
- 🔄 Auto-refresh server status every 3 seconds
- 📦 Clean, efficient extension architecture

### Features

- Support for npm and Maven-based projects
- Terminal management with proper cleanup
- Configurable server commands and working directories
- Single-click server startup from tree view
- Context menus for server management
- Activity bar integration with custom icon

### Technical

- TypeScript implementation
- Dynamic tree view provider
- Server configuration management system
- Terminal lifecycle management
- Status monitoring with periodic updates
