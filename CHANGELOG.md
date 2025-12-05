# Change Log

## [0.1.5] - 2025-12-05 - Build Manager & Automation

### 🏗️ Build Manager

- ✅ **Environment Build Buttons** - Added 4 quick-access build buttons (Dev, Staging, Beta, Prod) in the sidebar
- ✅ **Automatic Profile Update** - Automatically updates `spring.profiles.active` in `application.properties` before building
- ✅ **One-Click Builds** - Execute `./build.sh zip war [environment]` with a single click
- ✅ **Auto Restart Frontend** - Automatically restarts all frontend servers after successful builds
- ✅ **Smart Properties Detection** - Automatically finds `application.properties` in common locations
- ✅ **Build Progress Tracking** - Visual progress notifications during build process
- ✅ **Dedicated Build Terminal** - Creates a dedicated terminal for each build with clear environment labeling

### 🎯 Developer Experience

- ✅ **No Manual Edits Needed** - Eliminates manual profile switching in configuration files
- ✅ **Time Saver** - Reduces build time from multiple manual steps to one click
- ✅ **Color-Coded Buttons** - Each environment has distinct color coding (🟢 Dev, 🟡 Staging, 🟠 Beta, 🔴 Prod)
- ✅ **Team Collaboration** - Makes it easier for teams to build for different environments consistently

---

## [0.1.4] - 2025-09-08 - Enhanced Server Monitoring & Fixes

### 🚀 Enhanced Project Detection

- ✅ **Universal Node.js Detection** - Now detects Node.js projects regardless of folder structure
- ✅ **Smart Framework Recognition** - Automatically identifies React, Next.js, Vue.js, Angular, Express.js, Fastify, NestJS, and more
- ✅ **Intelligent Type Detection** - Determines if Node.js projects are frontend or backend based on dependencies and scripts
- ✅ **Improved Command Generation** - Uses appropriate start commands (npm run dev, npm start, ng serve, etc.) based on framework
- ✅ **Deeper Project Scanning** - Scans more thoroughly to find standalone projects not in "frontend/backend" folders

### 🎯 Better User Experience

- ✅ **Reduced Popup Spam** - Significantly reduced excessive notification popups during startup and operation
- ✅ **Console Logging** - Non-critical messages now go to console instead of popup notifications
- ✅ **Smarter Notifications** - Only shows essential popups, like errors and first-time welcome
- ✅ **Quieter Auto-Start** - Server startup messages are less intrusive
- ✅ **Enhanced Health Checks** - Added manual health check command for servers

### 🔧 Technical Improvements

- ✅ **Advanced Package.json Analysis** - Reads dependencies, scripts, and metadata to determine project type
- ✅ **Framework-Specific Commands** - Different start commands for different Node.js frameworks
- ✅ **Better Spring Boot Support** - Enhanced Maven commands with better error handling
- ✅ **Improved Error Detection** - Better monitoring for backend server crashes and runtime errors

---

## [0.1.3] - 2025-09-08 - Windows Path Fix

### 🔧 Windows Compatibility Fix

- ✅ **Fixed Windows Path Separators** - Resolved issue where `cd FSP/frontend` was using forward slashes instead of backslashes on Windows
- ✅ **Cross-Platform Path Handling** - Added proper path formatting for terminal commands across different operating systems
- ✅ **Quoted Path Support** - Paths with spaces or special characters are now properly quoted in terminal commands
- ✅ **Custom Command Support** - Both auto-generated and user-defined commands now handle Windows paths correctly

### ⚡ Technical Improvements

- ✅ **Smart Path Detection** - Automatically converts backslashes to forward slashes for better terminal compatibility on Windows
- ✅ **Command Processing** - Enhanced command processing to fix path issues in custom user commands
- ✅ **Robust Path Quoting** - Intelligent quoting for paths containing spaces, parentheses, or special characters

---

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
