"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const serverProvider_1 = require("./serverProvider");
const serverConfig_1 = require("./serverConfig");
let terminals = {};
let debugSessions = {};
let debugPorts = {};
let nextJavaDebugPort = 5005;
let nextNodeDebugPort = 9229;
let serverProvider;
let configManager;
let statusBarItems = [];
let isAutoDetectDone = false;
let extensionContext;
function activate(context) {
    console.log("Ninja Runner extension is now active!");
    // Store extension context for persistence
    extensionContext = context;
    // Check for updates and notify user
    checkForUpdates(context);
    // Set context to show the view
    vscode.commands.executeCommand("setContext", "serverRunnerEnabled", true);
    configManager = serverConfig_1.ServerConfigManager.getInstance();
    // Create decoration provider first — ServerRunnerProvider needs it
    const decorationProvider = new serverProvider_1.ServerDecorationProvider();
    context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider));
    serverProvider = new serverProvider_1.ServerRunnerProvider(decorationProvider);
    vscode.window.registerTreeDataProvider("serverRunnerView", serverProvider);
    // Load saved user preferences
    loadUserPreferences();
    // Auto-detect projects on first activation only if no saved preferences
    if (!isAutoDetectDone && configManager.getServers().length === 0) {
        setTimeout(() => {
            // On first run, pass empty set so all projects default to selected
            autoDetectProjects();
            isAutoDetectDone = true;
        }, 1000);
    }
    // Auto-start servers and show sidebar every time the view is focused (activity bar icon clicked)
    const onViewVisible = vscode.commands.registerCommand("serverRunnerView.focus", async () => {
        // Auto-detect if not done yet
        if (!isAutoDetectDone) {
            await autoDetectProjects();
            isAutoDetectDone = true;
        }
        // Start all servers immediately
        setTimeout(() => {
            autoStartAllServersOnActivation();
        }, 100);
        // Ensure the server runner view is visible in the activity bar
        await vscode.commands.executeCommand("workbench.view.extension.serverRunner");
    });
    // Command specifically for activity bar icon click
    const onActivityBarClick = vscode.commands.registerCommand("serverRunner.showView", async () => {
        // Auto-detect if not done yet
        if (!isAutoDetectDone) {
            await autoDetectProjects();
            isAutoDetectDone = true;
        }
        // Start all servers immediately
        autoStartAllServersOnActivation();
        // Show the server runner view in the sidebar
        await vscode.commands.executeCommand("workbench.view.extension.serverRunner");
        // Focus on the specific view
        await vscode.commands.executeCommand("serverRunnerView.focus");
    });
    // Auto-detect projects command
    const autoDetectCommand = vscode.commands.registerCommand("serverRunner.autoDetectProjects", () => {
        autoDetectProjects();
    });
    // Reset configuration command
    const resetConfigCommand = vscode.commands.registerCommand("serverRunner.resetConfiguration", async () => {
        const confirmation = await vscode.window.showWarningMessage("This will clear all current server configurations and let you reselect projects. Continue?", { modal: true }, "Yes, Reset", "Cancel");
        if (confirmation === "Yes, Reset") {
            // Note: Don't clear saved preferences here, let auto-detect preserve selections
            // Trigger auto-detection with user selection (which will now preserve previous choices)
            await autoDetectProjects();
        }
    });
    // Clear all selections command - for when users want to start completely fresh
    const clearAllSelectionsCommand = vscode.commands.registerCommand("serverRunner.clearAllSelections", async () => {
        const confirmation = await vscode.window.showWarningMessage("This will completely clear all server selections and preferences. You'll need to reselect all projects from scratch. Continue?", { modal: true }, "Yes, Clear All", "Cancel");
        if (confirmation === "Yes, Clear All") {
            // Clear saved preferences completely
            extensionContext.workspaceState.update("ninja-runner-servers", undefined);
            configManager.clearAllServers();
            serverProvider.refresh();
            // Trigger auto-detection with fresh selection
            await autoDetectProjects();
            vscode.window.showInformationMessage("All selections cleared. Please reselect your projects.");
        }
    });
    // Install dependencies command
    const installDepsCommand = vscode.commands.registerCommand("serverRunner.installDependencies", (itemOrContextValue) => {
        const contextValue = resolveContextValue(itemOrContextValue);
        if (contextValue) {
            const serverId = extractServerId(contextValue);
            installDependencies(serverId);
        }
    });
    // Install all dependencies command
    const installAllDepsCommand = vscode.commands.registerCommand("serverRunner.installAllDependencies", () => {
        installAllDependencies();
    });
    // Status bar commands
    const showStatusBarCommand = vscode.commands.registerCommand("serverRunner.showStatusBar", () => {
        createStatusBar();
    });
    // Register commands
    const disposables = [
        onViewVisible,
        onActivityBarClick,
        autoDetectCommand,
        resetConfigCommand,
        clearAllSelectionsCommand,
        installDepsCommand,
        installAllDepsCommand,
        showStatusBarCommand,
        vscode.commands.registerCommand("serverRunner.stopAllServers", () => {
            stopAllServers();
        }),
        vscode.commands.registerCommand("serverRunner.startAllServers", () => {
            startAllServers();
        }),
        vscode.commands.registerCommand("serverRunner.refresh", () => {
            serverProvider.refresh();
        }),
        vscode.commands.registerCommand("serverRunner.startDynamicServer", (itemOrContextValue) => {
            const contextValue = resolveContextValue(itemOrContextValue);
            if (!contextValue) {
                return;
            }
            const serverId = extractServerId(contextValue);
            const serverConfig = configManager.getServerById(serverId);
            if (serverConfig) {
                startServer(serverConfig.name, serverConfig.command, serverId);
            }
        }),
        vscode.commands.registerCommand("serverRunner.retryServer", (itemOrContextValue) => {
            const contextValue = resolveContextValue(itemOrContextValue);
            if (!contextValue) {
                return;
            }
            const serverId = extractServerId(contextValue);
            const serverConfig = configManager.getServerById(serverId);
            if (serverConfig) {
                // Reset status and try again
                serverProvider.updateServerStatus(serverId, "stopped");
                startServer(serverConfig.name, serverConfig.command, serverId);
            }
        }),
        vscode.commands.registerCommand("serverRunner.addServer", () => {
            addNewServer();
        }),
        vscode.commands.registerCommand("serverRunner.editServer", (itemOrContextValue) => {
            const contextValue = resolveContextValue(itemOrContextValue);
            if (contextValue) {
                editServer(contextValue);
            }
        }),
        vscode.commands.registerCommand("serverRunner.stopServer", (itemOrContextValue) => {
            const contextValue = resolveContextValue(itemOrContextValue);
            if (contextValue) {
                const serverId = extractServerId(contextValue);
                stopServer(serverId);
            }
        }),
        vscode.commands.registerCommand("serverRunner.checkForUpdates", () => {
            checkForUpdates(extensionContext);
        }),
        vscode.commands.registerCommand("serverRunner.runInDebug", (itemOrContextValue) => {
            const contextValue = resolveContextValue(itemOrContextValue);
            if (contextValue) {
                const serverId = extractServerId(contextValue);
                runServerInDebug(serverId);
            }
        }),
        vscode.commands.registerCommand("serverRunner.buildProject", (item) => {
            const projectPath = typeof item === "string" ? item : item?.projectPath;
            if (!projectPath) {
                return;
            }
            buildProject(projectPath);
        }),
        vscode.commands.registerCommand("serverRunner.buildProjectStaging", (item) => {
            const projectPath = typeof item === "string" ? item : item?.projectPath;
            if (!projectPath) {
                return;
            }
            runSingleEnvBuild(projectPath, "zip war staging", "staging", "staging");
        }),
        vscode.commands.registerCommand("serverRunner.buildProjectProd", (item) => {
            const projectPath = typeof item === "string" ? item : item?.projectPath;
            if (!projectPath) {
                return;
            }
            runSingleEnvBuild(projectPath, "zip war", "prod", "prod");
        }),
    ];
    // Listen for debug session termination
    context.subscriptions.push(vscode.debug.onDidTerminateDebugSession((session) => {
        // Find which server this debug session belongs to
        for (const [serverId, debugSession] of Object.entries(debugSessions)) {
            if (debugSession.id === session.id) {
                console.log(`🐛 Debug session terminated for server: ${serverId}`);
                delete debugSessions[serverId];
                delete debugPorts[serverId];
                break;
            }
        }
    }));
    // Listen for debug session start and associate with correct server
    context.subscriptions.push(vscode.debug.onDidStartDebugSession((session) => {
        console.log(`🐛 Debug session started: ${session.name}`);
        // Find which server this debug session belongs to by matching the name
        const servers = configManager.getServers();
        for (const server of servers) {
            if (session.name === `Debug ${server.name}`) {
                debugSessions[server.id] = session;
                console.log(`✅ Associated debug session with server: ${server.name} (ID: ${server.id})`);
                break;
            }
        }
    }));
    context.subscriptions.push(...disposables);
    // Start periodic status monitoring
    startServerStatusMonitoring();
}
exports.activate = activate;
function autoStartAllServersOnActivation() {
    const servers = configManager.getServers();
    if (servers.length === 0) {
        console.log("🔍 No servers found. Auto-detecting projects...");
        autoDetectProjects();
        return;
    }
    console.log("🥷 Auto-Starting All Servers...");
    // Don't show popup, just log to console
    // Show progress notification
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Starting all servers...",
        cancellable: false,
    }, async (progress) => {
        const totalServers = servers.length;
        for (let i = 0; i < servers.length; i++) {
            const server = servers[i];
            const percentage = Math.round(((i + 1) / totalServers) * 100);
            progress.report({
                increment: percentage / totalServers,
                message: `Starting ${server.name}...`,
            });
            startServer(server.name, server.command, server.id);
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
        progress.report({ increment: 100, message: "All servers launched." });
        return new Promise((resolve) => {
            setTimeout(() => {
                vscode.window.showInformationMessage("All servers are running.");
                createStatusBar();
                resolve(undefined);
            }, 500);
        });
    });
}
function startServerStatusMonitoring() {
    setInterval(() => {
        // Check each terminal status and update the tree view
        const servers = configManager.getServers();
        servers.forEach((server) => {
            const terminal = terminals[server.id];
            if (!terminal) {
                // No terminal exists, server is definitely not running
                const currentStatus = serverProvider.getServerStatus(server.id);
                if (currentStatus !== "stopped") {
                    serverProvider.updateServerStatus(server.id, "stopped");
                }
                return;
            }
            // Check if terminal has exited
            if (terminal.exitStatus !== undefined) {
                // Terminal has exited, clean up and mark appropriately
                delete terminals[server.id];
                const currentStatus = serverProvider.getServerStatus(server.id);
                // If it was running and then exited, it might be an error
                if (currentStatus === "running") {
                    // Check exit code to determine if it was an error or normal termination
                    if (terminal.exitStatus.code !== 0) {
                        serverProvider.updateServerStatus(server.id, "error");
                        vscode.window.showErrorMessage(`🔴 ${server.name} exited with error code ${terminal.exitStatus.code}`);
                    }
                    else {
                        serverProvider.updateServerStatus(server.id, "stopped");
                    }
                }
                else {
                    serverProvider.updateServerStatus(server.id, "stopped");
                }
                console.log(`🔍 Terminal for ${server.id} has exited with status:`, terminal.exitStatus);
                return;
            }
            // Terminal exists and hasn't exited
            const currentStatus = serverProvider.getServerStatus(server.id);
            // Don't automatically reset error status back to running just because terminal exists
            // Error status should only be reset manually by user action or explicit recovery detection
            if (currentStatus === "error") {
                // Keep error status - don't automatically reset to running
                // User can manually restart the server if they want to try again
                return;
            }
            // Enhanced monitoring for backend servers - detect runtime crashes
            if (server.type === "backend" && currentStatus === "running") {
                // Check terminal output for common error patterns that indicate server crash
                checkForServerCrash(server.id, server.name, terminal);
            }
            // Only update to running if we're not already tracking it as running/starting/error
            else if (currentStatus === "stopped") {
                serverProvider.updateServerStatus(server.id, "running");
            }
        });
    }, 3000); // Check every 3 seconds for better responsiveness while avoiding excessive calls
}
// Enhanced crash detection for backend servers
let lastTerminalOutputCheck = {};
function checkForServerCrash(serverId, serverName, terminal) {
    // Note: VS Code API doesn't provide direct access to terminal output
    // However, we can implement alternative detection methods
    // Method 1: Check if terminal is responsive by tracking last activity time
    const now = Date.now();
    const lastCheck = lastTerminalOutputCheck[serverId] || 0;
    // If this is the first check, just record the time
    if (lastCheck === 0) {
        lastTerminalOutputCheck[serverId] = now;
        return;
    }
    // Method 2: For Spring Boot specifically, try to detect common crash scenarios
    // Since we can't read terminal output directly, we'll use a periodic health check approach
    // Check if we should perform a health check (every 15 seconds)
    if (now - lastCheck < 15000) {
        return;
    }
    lastTerminalOutputCheck[serverId] = now;
    // Method 3: Enhanced terminal monitoring
    // Check if terminal process is still active but not responding
    if (terminal.exitStatus === undefined) {
        // Terminal process exists, but let's check if it's actually responsive
        // For Spring Boot apps, we can try to detect if the port is still occupied
        // This is a heuristic approach since VS Code API is limited
        console.log(`🔍 Performing health check for ${serverName} (${serverId})`);
        // If the terminal has been "running" for too long without any activity indicators,
        // it might be crashed but the process is still alive
        performServerHealthCheck(serverId, serverName);
    }
}
// Perform a health check specific to the server type
async function performServerHealthCheck(serverId, serverName) {
    const server = configManager.getServerById(serverId);
    if (!server)
        return;
    // For Spring Boot servers, common crash patterns include:
    // - Connection timeouts
    // - Database connection failures
    // - OutOfMemory errors
    // - Port binding failures after restart
    if (server.command.includes("spring-boot:run") ||
        server.command.includes("mvn")) {
        // Spring Boot specific health check
        await checkSpringBootHealth(serverId, serverName);
    }
    else if (server.command.includes("npm") ||
        server.command.includes("yarn")) {
        // Node.js specific health check
        await checkNodeJsHealth(serverId, serverName);
    }
}
// Spring Boot specific health check
async function checkSpringBootHealth(serverId, serverName) {
    const terminal = terminals[serverId];
    if (!terminal)
        return;
    console.log(`🏥 Performing Spring Boot health check for ${serverName}`);
    // Since we can't read terminal output directly in VS Code API,
    // we implement alternative monitoring approaches:
    const serverStartTime = getServerStartTime(serverId);
    const now = Date.now();
    if (serverStartTime) {
        const runtimeMinutes = Math.round((now - serverStartTime) / 60000);
        // If server has been running for a while, it's likely stable
        if (runtimeMinutes > 10) {
            console.log(`✅ ${serverName} has been stable for ${runtimeMinutes} minutes`);
            return;
        }
        // For newer servers, be more vigilant but less noisy
        if (runtimeMinutes < 5) {
            // Spring Boot servers that crash within first 5 minutes often have config issues
            // Only show notification once at 3-minute mark to avoid spam
            if (runtimeMinutes === 3) {
                console.log(`⚠️ ${serverName} has been running for 3 minutes. Monitoring for stability...`);
                // Don't show popup unless explicitly requested by user
            }
        }
    }
    // Additional Spring Boot specific checks
    // Check if the terminal process is still responsive
    if (terminal.exitStatus === undefined) {
        // Process is still running, which is good for Spring Boot
        console.log(`✅ ${serverName} terminal process is still active`);
    }
}
// Node.js specific health check
async function checkNodeJsHealth(serverId, serverName) {
    const terminal = terminals[serverId];
    if (!terminal)
        return;
    console.log(`🟢 Performing Node.js health check for ${serverName}`);
    // Similar approach for Node.js servers
    // Could check for common Node.js error patterns when API becomes available
}
// Track server start times for better monitoring
let serverStartTimes = {};
function getServerStartTime(serverId) {
    return serverStartTimes[serverId];
}
function setServerStartTime(serverId, startTime) {
    serverStartTimes[serverId] = startTime;
}
// Manual health check triggered by user
async function performManualHealthCheck(serverId) {
    const server = configManager.getServerById(serverId);
    const terminal = terminals[serverId];
    if (!server) {
        vscode.window.showErrorMessage("Server not found!");
        return;
    }
    if (!terminal) {
        vscode.window.showInformationMessage(`${server.name} is not running.`);
        return;
    }
    if (terminal.exitStatus !== undefined) {
        vscode.window.showWarningMessage(`${server.name} has exited with code ${terminal.exitStatus.code}. Use restart to try again.`);
        return;
    }
    // Show concise health information
    const startTime = getServerStartTime(serverId);
    const now = Date.now();
    const runtimeMinutes = startTime ? Math.round((now - startTime) / 60000) : 0;
    const isSpringBoot = server.command.includes("spring-boot:run") ||
        server.command.includes("mvn");
    const currentStatus = serverProvider.getServerStatus(serverId);
    let healthMessage = `🏥 ${server.name}: ${currentStatus} (${runtimeMinutes}m)`;
    const action = await vscode.window.showInformationMessage(healthMessage, "Show Terminal", "Restart");
    if (action === "Show Terminal") {
        terminal.show();
    }
    else if (action === "Restart") {
        stopServer(serverId);
        setTimeout(() => {
            startServer(server.name, server.command, serverId);
        }, 2000);
    }
}
async function addNewServer() {
    const name = await vscode.window.showInputBox({
        prompt: "Enter server name",
        placeHolder: "e.g., My New Server",
    });
    if (!name)
        return;
    const type = await vscode.window.showQuickPick(["frontend", "backend"], {
        placeHolder: "Select server type",
    });
    if (!type)
        return;
    const command = await vscode.window.showInputBox({
        prompt: "Enter the command to start the server",
        placeHolder: "e.g., cd my-project && npm start",
    });
    if (!command)
        return;
    const workingDirectory = await vscode.window.showInputBox({
        prompt: "Enter working directory (relative to workspace)",
        placeHolder: "e.g., my-project",
    });
    if (!workingDirectory)
        return;
    const emoji = await vscode.window.showInputBox({
        prompt: "Enter an icon label for the server (optional)",
        placeHolder: "e.g., api, web, auth",
        value: type === "frontend" ? "web" : "api",
    });
    const id = configManager.generateUniqueId(name);
    const category = type === "frontend" ? "Frontend Servers" : "Backend Servers";
    const newServer = {
        id,
        name,
        type: type,
        command,
        workingDirectory,
        emoji: emoji || (type === "frontend" ? "web" : "api"),
        category: category,
    };
    configManager.addServer(newServer);
    saveUserPreferences();
    serverProvider.refresh();
    console.log(`🥷 Added ${name} server!`); // Log instead of popup
}
async function editServer(serverId) {
    const serverConfig = configManager.getServerById(serverId);
    if (!serverConfig) {
        vscode.window.showErrorMessage("Server not found!");
        return;
    }
    const name = await vscode.window.showInputBox({
        prompt: "Enter server name",
        value: serverConfig.name,
    });
    if (!name)
        return;
    const command = await vscode.window.showInputBox({
        prompt: "Enter the command to start the server",
        value: serverConfig.command,
    });
    if (!command)
        return;
    const workingDirectory = await vscode.window.showInputBox({
        prompt: "Enter working directory (relative to workspace)",
        value: serverConfig.workingDirectory,
    });
    if (!workingDirectory)
        return;
    const emoji = await vscode.window.showInputBox({
        prompt: "Enter an emoji for the server",
        value: serverConfig.emoji,
    });
    const updatedServer = {
        ...serverConfig,
        name,
        command,
        workingDirectory,
        emoji: emoji || serverConfig.emoji,
    };
    configManager.addServer(updatedServer);
    saveUserPreferences();
    serverProvider.refresh();
    console.log(`🥷 Updated ${name} server!`); // Log instead of popup
}
async function deleteServer(serverId) {
    const serverConfig = configManager.getServerById(serverId);
    if (!serverConfig) {
        vscode.window.showErrorMessage("Server not found!");
        return;
    }
    const confirmation = await vscode.window.showWarningMessage(`Are you sure you want to delete ${serverConfig.name}?`, { modal: true }, "Yes", "No");
    if (confirmation === "Yes") {
        // Stop server if running
        if (terminals[serverId]) {
            terminals[serverId].sendText("\u0003"); // Send Ctrl+C
            terminals[serverId].dispose();
            delete terminals[serverId];
        }
        configManager.deleteServer(serverId);
        saveUserPreferences();
        serverProvider.refresh();
        vscode.window.showInformationMessage(`Removed ${serverConfig.name}.`);
    }
}
async function stopServer(serverId) {
    const serverConfig = configManager.getServerById(serverId);
    if (!serverConfig) {
        vscode.window.showErrorMessage("Server not found!");
        return;
    }
    // Stop debug session if running
    if (debugSessions[serverId]) {
        console.log(`🐛 Stopping debug session for ${serverConfig.name}...`);
        try {
            await vscode.debug.stopDebugging(debugSessions[serverId]);
            delete debugSessions[serverId];
            delete debugPorts[serverId];
        }
        catch (error) {
            console.error(`Error stopping debug session: ${error}`);
        }
    }
    // Check if server is running
    const terminal = terminals[serverId];
    if (!terminal || terminal.exitStatus !== undefined) {
        vscode.window.showInformationMessage(`${serverConfig.name} is not currently running.`);
        return;
    }
    // Stop the server
    terminal.sendText("\u0003"); // Send Ctrl+C
    terminal.dispose();
    delete terminals[serverId];
    // Update status
    serverProvider.updateServerStatus(serverId, "stopped");
    vscode.window.showInformationMessage(`Stopping ${serverConfig.name}...`);
}
// ── Build helpers ─────────────────────────────────────────────────────────────
/** Resolve workspace / script paths for a build project. */
function resolveBuildPaths(projectPath) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return null;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const fullPath = path.join(workspaceRoot, projectPath);
    const projectName = path.basename(projectPath);
    const scriptPath = path.join(extensionContext.extensionPath, "build.sh");
    const markerFile = path.join(fullPath, ".ninja_build_status");
    const script = scriptPath.replace(/\\/g, "/");
    try {
        fs.chmodSync(scriptPath, "755");
    }
    catch { /* Windows */ }
    try {
        fs.unlinkSync(markerFile);
    }
    catch { /* ok */ }
    return { fullPath, projectName, script, markerFile };
}
/** Open the built/<env>/ output folder in the OS file manager. */
function openBuiltFolder(fullPath, env) {
    const builtDir = path.join(fullPath, "built", env);
    if (fs.existsSync(builtDir)) {
        vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(builtDir));
    }
}
/** Build a single environment (staging or prod). */
async function runSingleEnvBuild(projectPath, envArgs, // e.g. "zip war staging"
envLabel, // display label
expectedMarker) {
    const resolved = resolveBuildPaths(projectPath);
    if (!resolved) {
        vscode.window.showErrorMessage("No workspace folder found!");
        return;
    }
    const { fullPath, projectName, script } = resolved;
    serverProvider.updateBuildStatus(projectPath, "building");
    const terminal = vscode.window.createTerminal({
        name: `Build: ${projectName}  [${envLabel}]`,
        cwd: fullPath,
    });
    terminal.show();
    terminal.sendText(`NINJA_BUILD_DIR="${fullPath}" bash "${script}" ${envArgs}`);
    vscode.window.showInformationMessage(`Building ${projectName} [${envLabel}]…`);
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(fullPath), ".ninja_build_status"));
    let done = false;
    const handleMarker = (uri) => {
        try {
            const env = fs.readFileSync(uri.fsPath, "utf8").trim();
            fs.unlinkSync(uri.fsPath);
            if (env === expectedMarker && !done) {
                done = true;
                terminal.dispose();
                watcher.dispose();
                serverProvider.updateBuildStatus(projectPath, "done");
                openBuiltFolder(fullPath, env);
                vscode.window.showInformationMessage(`✅ ${projectName} [${envLabel}] complete!`);
            }
        }
        catch { /* ignore */ }
    };
    watcher.onDidCreate(handleMarker);
    watcher.onDidChange(handleMarker);
    const closeDisposable = vscode.window.onDidCloseTerminal((closed) => {
        if (closed !== terminal) {
            return;
        }
        closeDisposable.dispose();
        if (!done) {
            watcher.dispose();
            serverProvider.updateBuildStatus(projectPath, "error");
            vscode.window.showErrorMessage(`❌ ${projectName} [${envLabel}] build failed.`);
        }
    });
}
/** Build staging then prod sequentially (two terminals). */
async function buildProject(projectPath) {
    const resolved = resolveBuildPaths(projectPath);
    if (!resolved) {
        vscode.window.showErrorMessage("No workspace folder found!");
        return;
    }
    const { fullPath, projectName, script } = resolved;
    serverProvider.updateBuildStatus(projectPath, "building");
    // ── Phase 1: Staging ──────────────────────────────────────────────────────
    const stagingTerminal = vscode.window.createTerminal({
        name: `Build: ${projectName}  [staging]`,
        cwd: fullPath,
    });
    stagingTerminal.show();
    stagingTerminal.sendText(`NINJA_BUILD_DIR="${fullPath}" bash "${script}" zip war staging`);
    vscode.window.showInformationMessage(`Building ${projectName}: staging…`);
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(vscode.Uri.file(fullPath), ".ninja_build_status"));
    let stagingDone = false;
    let prodDone = false;
    let prodTerminal;
    let prodCloseDisposable;
    // Unified marker handler — handles both "staging" and "prod" markers
    const handleMarker = (uri) => {
        try {
            const env = fs.readFileSync(uri.fsPath, "utf8").trim();
            fs.unlinkSync(uri.fsPath);
            if (env === "staging" && !stagingDone) {
                stagingDone = true;
                stagingTerminal.dispose();
                vscode.window.showInformationMessage(`✅ ${projectName} staging done — starting prod…`);
                setTimeout(() => {
                    prodTerminal = vscode.window.createTerminal({
                        name: `Build: ${projectName}  [prod]`,
                        cwd: fullPath,
                    });
                    prodTerminal.show();
                    prodTerminal.sendText(`NINJA_BUILD_DIR="${fullPath}" bash "${script}" zip war`);
                    // Fallback: prod terminal closed without writing marker = error
                    prodCloseDisposable = vscode.window.onDidCloseTerminal((closed) => {
                        if (closed !== prodTerminal) {
                            return;
                        }
                        prodCloseDisposable?.dispose();
                        if (!prodDone) {
                            watcher.dispose();
                            serverProvider.updateBuildStatus(projectPath, "error");
                            vscode.window.showErrorMessage(`❌ ${projectName} prod build failed.`);
                        }
                    });
                }, 800);
            }
            else if (env === "prod" && !prodDone) {
                prodDone = true;
                prodCloseDisposable?.dispose();
                prodTerminal?.dispose();
                watcher.dispose();
                serverProvider.updateBuildStatus(projectPath, "done");
                openBuiltFolder(fullPath, "prod");
                vscode.window.showInformationMessage(`✅ ${projectName} — staging + prod complete!`);
            }
        }
        catch { /* ignore */ }
    };
    watcher.onDidCreate(handleMarker);
    watcher.onDidChange(handleMarker);
    // Fallback: staging terminal closed without writing marker = error
    const stagingCloseDisposable = vscode.window.onDidCloseTerminal((closed) => {
        if (closed !== stagingTerminal) {
            return;
        }
        stagingCloseDisposable.dispose();
        if (!stagingDone) {
            watcher.dispose();
            serverProvider.updateBuildStatus(projectPath, "error");
            vscode.window.showErrorMessage(`❌ ${projectName} staging build failed.`);
        }
    });
}
// Run backend server in debug mode
async function runServerInDebug(serverId) {
    const serverConfig = configManager.getServerById(serverId);
    if (!serverConfig) {
        vscode.window.showErrorMessage("Server not found!");
        return;
    }
    // Check if it's a backend server
    if (serverConfig.type !== "backend") {
        vscode.window.showWarningMessage("Debug mode is only available for backend servers!");
        return;
    }
    // Stop the server if it's already running
    if (terminals[serverId] && terminals[serverId].exitStatus === undefined) {
        await stopServer(serverId);
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for server to stop
    }
    // Get workspace root
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder found!");
        return;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    // Allocate a unique debug port for this server
    let debugConfig;
    let debugCommand = serverConfig.command;
    let debugPort;
    // For Spring Boot (Maven)
    if (debugCommand.includes("spring-boot:run") ||
        debugCommand.includes("mvn")) {
        // Allocate next available Java debug port
        debugPort = nextJavaDebugPort;
        nextJavaDebugPort += 1; // Increment for next server
        debugCommand = debugCommand.replace("spring-boot:run", `spring-boot:run -Dspring-boot.run.jvmArguments="-Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=*:${debugPort}"`);
        // Create Java debug configuration
        debugConfig = {
            type: "java",
            name: `Debug ${serverConfig.name}`,
            request: "attach",
            hostName: "localhost",
            port: debugPort,
            projectName: serverConfig.name,
            console: "internalConsole",
            internalConsoleOptions: "neverOpen",
        };
    }
    // For Node.js backends
    else if (debugCommand.includes("npm") || debugCommand.includes("node")) {
        // Allocate next available Node debug port
        debugPort = nextNodeDebugPort;
        nextNodeDebugPort += 1; // Increment for next server
        if (debugCommand.includes("npm start")) {
            debugCommand = debugCommand.replace("npm start", `node --inspect=${debugPort} .`);
        }
        else if (debugCommand.includes("npm run dev")) {
            debugCommand = debugCommand.replace("npm run dev", `node --inspect=${debugPort} node_modules/.bin/nodemon`);
        }
        else if (debugCommand.includes("npm run")) {
            const scriptName = debugCommand.split("npm run ")[1]?.split(" ")[0];
            debugCommand = debugCommand.replace(`npm run ${scriptName}`, `node --inspect=${debugPort} node_modules/.bin/${scriptName}`);
        }
        else if (debugCommand.includes("node ")) {
            debugCommand = debugCommand.replace("node ", `node --inspect=${debugPort} `);
        }
        // Create Node.js debug configuration
        debugConfig = {
            type: "node",
            name: `Debug ${serverConfig.name}`,
            request: "attach",
            port: debugPort,
            restart: true,
            protocol: "inspector",
            console: "internalConsole",
            internalConsoleOptions: "neverOpen",
        };
    }
    // For other backends
    else {
        vscode.window.showWarningMessage(`Debug mode for ${serverConfig.name} requires manual configuration. Please set up launch.json manually.`);
        return;
    }
    // Store the debug port for this server
    debugPorts[serverId] = debugPort;
    // Create new terminal for debug mode with PowerShell support on Windows
    const debugTerminalOptions = {
        name: `${serverConfig.name} (Debug)`,
        cwd: workspaceRoot,
    };
    if (process.platform === "win32") {
        debugTerminalOptions.shellPath = "powershell.exe";
    }
    const terminal = vscode.window.createTerminal(debugTerminalOptions);
    terminals[serverId] = terminal;
    terminal.show();
    // Fix paths in command for cross-platform compatibility
    const fixedCommand = convertCommandForShell(debugCommand);
    terminal.sendText(fixedCommand);
    // Record server start time
    setServerStartTime(serverId, Date.now());
    // Update status
    serverProvider.updateServerStatus(serverId, "starting");
    console.log(`🐛 Launching ${serverConfig.name} in debug mode on port ${debugPort}...`);
    vscode.window.showInformationMessage(`🐛 Starting ${serverConfig.name} in debug mode on port ${debugPort}...`);
    // Wait for server to start, then attach debugger with retry logic
    const attemptDebugAttach = async (attempt = 1, maxAttempts = 5) => {
        const isSpringBoot = debugCommand.includes("spring-boot:run") || debugCommand.includes("mvn");
        const waitTime = isSpringBoot ? 8000 : 6000; // Spring Boot needs more time
        const retryDelay = 3000 * attempt; // Exponential backoff: 3s, 6s, 9s, 12s, 15s
        setTimeout(async () => {
            try {
                console.log(`🔌 Attempt ${attempt}/${maxAttempts}: Attaching debugger to ${serverConfig.name} on port ${debugPort}...`);
                // Start debugging session
                const success = await vscode.debug.startDebugging(workspaceFolders[0], debugConfig);
                if (success) {
                    // Debug session will be stored by the onDidStartDebugSession event listener
                    console.log(`✅ Debugger attached successfully to ${serverConfig.name} on port ${debugPort}`);
                    vscode.window.showInformationMessage(`🐛 Debugger attached to ${serverConfig.name} on port ${debugPort}!`);
                }
                else {
                    console.log(`⚠️ Attempt ${attempt} failed to attach debugger to ${serverConfig.name}`);
                    // Retry automatically if we haven't exhausted attempts
                    if (attempt < maxAttempts) {
                        console.log(`🔄 Retrying in ${retryDelay / 1000} seconds...`);
                        attemptDebugAttach(attempt + 1, maxAttempts);
                    }
                    else {
                        // Only show error after all attempts failed
                        console.log(`❌ All ${maxAttempts} attempts failed to attach debugger to ${serverConfig.name}`);
                    }
                }
            }
            catch (error) {
                console.error(`❌ Error on attempt ${attempt} for ${serverConfig.name}:`, error);
                // Check if it's a timeout or connection error
                const isTimeout = error.message?.includes("timeout") ||
                    error.message?.includes("handshake");
                if (isTimeout && attempt < maxAttempts) {
                    // Silently retry on timeout errors
                    console.log(`🔄 Timeout detected, retrying in ${retryDelay / 1000} seconds...`);
                    attemptDebugAttach(attempt + 1, maxAttempts);
                }
                else if (attempt >= maxAttempts) {
                    // Only show error message after all retries exhausted
                    console.log(`❌ Failed to attach debugger after ${maxAttempts} attempts. Server may need more time to start.`);
                }
            }
        }, attempt === 1 ? waitTime : retryDelay);
    };
    // Start the attachment process
    attemptDebugAttach();
    // Set up monitoring similar to startServer
    let healthCheckAttempts = 0;
    const maxHealthCheckAttempts = 8;
    const healthCheck = setInterval(() => {
        healthCheckAttempts++;
        if (!terminals[serverId] || terminals[serverId].exitStatus !== undefined) {
            clearInterval(healthCheck);
            const exitStatus = terminals[serverId]?.exitStatus;
            if (exitStatus && exitStatus.code !== 0) {
                serverProvider.updateServerStatus(serverId, "error");
                vscode.window.showErrorMessage(`🔴 ${serverConfig.name} (Debug) failed to start`);
            }
            return;
        }
        if (healthCheckAttempts >= 4) {
            clearInterval(healthCheck);
            serverProvider.updateServerStatus(serverId, "running");
            console.log(`✅ ${serverConfig.name} running in debug mode`);
            return;
        }
    }, 2000);
}
function startServer(name, command, terminalKey) {
    // Check if terminal already exists and is running
    if (terminals[terminalKey] &&
        terminals[terminalKey].exitStatus === undefined) {
        vscode.window.showInformationMessage(`⚡ ${name} is already running like a ninja!`);
        terminals[terminalKey].show();
        return;
    }
    // Get workspace root
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showErrorMessage("No workspace folder found!");
        return;
    }
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    // Create new terminal with PowerShell support on Windows
    const terminalOptions = {
        name: name,
        cwd: workspaceRoot,
    };
    if (process.platform === "win32") {
        terminalOptions.shellPath = "powershell.exe";
    }
    const terminal = vscode.window.createTerminal(terminalOptions);
    terminals[terminalKey] = terminal;
    terminal.show();
    // Fix any paths in the command for cross-platform compatibility
    const fixedCommand = convertCommandForShell(command);
    terminal.sendText(fixedCommand);
    // Record server start time for health monitoring
    setServerStartTime(terminalKey, Date.now());
    // Initially set server status to starting, will be updated by monitoring
    serverProvider.updateServerStatus(terminalKey, "starting");
    // Enhanced health check with Spring Boot specific monitoring
    let healthCheckAttempts = 0;
    const maxHealthCheckAttempts = 8; // Extended to 16 seconds for Spring Boot
    let hasShownOutput = false;
    const isSpringBoot = command.includes("spring-boot:run") || command.includes("mvn");
    const isNodeJs = command.includes("npm") || command.includes("yarn");
    const healthCheck = setInterval(() => {
        healthCheckAttempts++;
        // Check if terminal still exists and hasn't exited
        if (!terminals[terminalKey] ||
            terminals[terminalKey].exitStatus !== undefined) {
            // Terminal has exited or been removed, server is not running
            clearInterval(healthCheck);
            const exitStatus = terminals[terminalKey]?.exitStatus;
            // For Spring Boot, be more specific about error detection
            if (exitStatus && exitStatus.code !== 0) {
                serverProvider.updateServerStatus(terminalKey, "error");
                if (isSpringBoot) {
                    vscode.window.showErrorMessage(`🔴 ${name} (Spring Boot) failed - check for port conflicts, database connections, or configuration errors`);
                }
                else {
                    vscode.window.showErrorMessage(`🔴 ${name} failed to start - check terminal for errors`);
                }
            }
            else if (healthCheckAttempts <= 2) {
                // Quick exit might indicate startup failure
                serverProvider.updateServerStatus(terminalKey, "error");
                vscode.window.showErrorMessage(`🔴 ${name} exited too quickly - likely a startup error`);
            }
            else {
                serverProvider.updateServerStatus(terminalKey, "stopped");
            }
            return;
        }
        // Spring Boot takes longer to start, so be more patient
        const minAttemptsBeforeRunning = isSpringBoot ? 4 : 3;
        const startupTimeoutAttempts = isSpringBoot ? 8 : 6;
        // After minimum attempts, if terminal is still alive, consider server running
        if (healthCheckAttempts >= minAttemptsBeforeRunning) {
            clearInterval(healthCheck);
            serverProvider.updateServerStatus(terminalKey, "running");
            // Show success message only once (less intrusive)
            if (!hasShownOutput) {
                if (isSpringBoot) {
                    console.log(`✅ ${name} (Spring Boot) started successfully!`);
                    // Only show popup for Spring Boot if it's the first server started
                    const runningServers = Object.keys(terminals).length;
                    if (runningServers <= 1) {
                        vscode.window.showInformationMessage(`✅ ${name} (Spring Boot) started successfully!`);
                    }
                }
                else {
                    console.log(`✅ ${name} started successfully!`);
                    // Show popup only for first server to reduce noise
                    const runningServers = Object.keys(terminals).length;
                    if (runningServers <= 1) {
                        vscode.window.showInformationMessage(`✅ ${name} started!`);
                    }
                }
                hasShownOutput = true;
            }
            return;
        }
        // If we've exceeded max attempts and server isn't clearly running
        if (healthCheckAttempts >= maxHealthCheckAttempts) {
            clearInterval(healthCheck);
            // At this point, if terminal exists but we're unsure, mark as running
            // The monitoring function will catch actual failures
            if (terminals[terminalKey] &&
                terminals[terminalKey].exitStatus === undefined) {
                serverProvider.updateServerStatus(terminalKey, "running");
                if (!hasShownOutput) {
                    if (isSpringBoot) {
                        console.log(`⚠️ ${name} (Spring Boot) appears to be running, monitoring for stability...`);
                    }
                    else {
                        console.log(`✅ ${name} appears to be running`);
                    }
                    hasShownOutput = true;
                }
            }
            else {
                serverProvider.updateServerStatus(terminalKey, "error");
            }
        }
    }, 2000); // Check every 2 seconds
    // Enhanced terminal cleanup with better error detection
    const onCloseDisposable = vscode.window.onDidCloseTerminal((closedTerminal) => {
        if (closedTerminal === terminal) {
            delete terminals[terminalKey];
            delete lastTerminalOutputCheck[terminalKey]; // Clean up monitoring data
            delete serverStartTimes[terminalKey]; // Clean up start time data
            const currentStatus = serverProvider.getServerStatus(terminalKey);
            if (currentStatus === "running") {
                // If it was running and terminal closed, it might be a crash
                serverProvider.updateServerStatus(terminalKey, "error");
                vscode.window.showWarningMessage(`⚠️ ${name} terminal closed unexpectedly - server may have crashed`);
            }
            else {
                serverProvider.updateServerStatus(terminalKey, "stopped");
            }
            console.log(`🛑 Terminal for ${name} was closed`);
            onCloseDisposable.dispose();
        }
    });
    console.log(`🥷 Launching ${name}...`); // Log instead of popup
}
function startAllServers() {
    const servers = configManager.getServers();
    if (servers.length === 0) {
        vscode.window.showWarningMessage("No servers configured! Use auto-detect to find projects.");
        return;
    }
    console.log("🚀 Launching all servers..."); // Log instead of popup
    // Start all configured servers
    servers.forEach((server, index) => {
        setTimeout(() => {
            startServer(server.name, server.command, server.id);
        }, index * 100); // Stagger starts by 100ms each
    });
    // Create status bar after starting servers
    setTimeout(() => {
        createStatusBar();
    }, 1000);
}
function stopAllServers() {
    const activeTerminals = Object.values(terminals).filter((terminal) => terminal.exitStatus === undefined);
    if (activeTerminals.length === 0) {
        console.log("🔍 No servers found running.");
        return;
    }
    activeTerminals.forEach((terminal) => {
        terminal.sendText("\u0003"); // Send Ctrl+C
        terminal.dispose();
    });
    // Update all server statuses to stopped
    Object.keys(terminals).forEach((terminalKey) => {
        serverProvider.updateServerStatus(terminalKey, "stopped");
    });
    terminals = {}; // Clear all terminal references
    vscode.window.showInformationMessage("All servers stopped.");
}
// Auto-detect frontend and backend projects
async function autoDetectProjects() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showWarningMessage("No workspace folder found!");
        return;
    }
    vscode.window.showInformationMessage("Auto-detecting projects...");
    // Get currently saved servers to preserve selection state
    const currentServers = configManager.getServers();
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    // Create a simpler mapping using just the working directory path for more reliable matching
    const currentServerPaths = new Set(currentServers.map((server) => server.workingDirectory));
    // Also create a name-based mapping for additional matching
    const currentServerNames = new Set(currentServers.map((server) => {
        // Extract the base name without framework info - try multiple patterns
        let baseName = server.name;
        // Remove framework info in parentheses: "FSP Frontend (React/Next.js)" -> "FSP Frontend"
        if (baseName.includes("(")) {
            baseName = baseName.split("(")[0].trim();
        }
        // Also add just the project name part: "FSP Frontend" -> "FSP Frontend"
        return baseName;
    }));
    // Add some more variations for better matching
    const currentServerNamesLowerCase = new Set(Array.from(currentServerNames).map((name) => name.toLowerCase()));
    console.log("Current server paths:", Array.from(currentServerPaths));
    console.log("Current server names:", Array.from(currentServerNames));
    // First, scan and collect all potential projects with deduplication
    const detectedProjects = [];
    // Track already processed paths to avoid duplicates
    const processedPaths = new Set();
    for (const folder of workspaceFolders) {
        await scanForProjectsWithCollection(folder.uri.fsPath, detectedProjects, processedPaths);
    }
    // Additional deduplication by path normalization
    const uniqueProjects = deduplicateProjects(detectedProjects);
    if (uniqueProjects.length === 0) {
        vscode.window.showWarningMessage("No projects detected in workspace!\n\n" +
            "Make sure your workspace contains:\n" +
            "- Frontend projects with package.json\n" +
            "- Backend projects with pom.xml (Spring Boot)\n" +
            "- Projects not in node_modules or build folders\n\n" +
            "Check the VS Code Output panel for scan details.");
        // Log workspace structure for debugging
        console.log("Workspace folders:", workspaceFolders.map((f) => f.uri.fsPath));
        return;
    }
    // Show user selection dialog with preserved selections
    const selectedProjects = await showProjectSelectionDialog(uniqueProjects, currentServerPaths, currentServerNames, currentServerNamesLowerCase);
    if (selectedProjects && selectedProjects.length > 0) {
        // Clear existing servers and add selected projects to configuration
        configManager.clearAllServers();
        for (const project of selectedProjects) {
            await addDetectedProject(project.name, project.fullPath, project.type, project.framework);
        }
        // Save user preferences
        saveUserPreferences();
        serverProvider.refresh();
        if (currentServerPaths && currentServerPaths.size > 0) {
            vscode.window.showInformationMessage(`Server list updated. ${selectedProjects.length} projects selected (previous selections preserved).`);
        }
        else {
            vscode.window.showInformationMessage(`Added ${selectedProjects.length} selected projects.`);
        }
    }
    else {
        vscode.window.showInformationMessage("No projects selected.");
    }
}
// Helper function to create meaningful project names
function getProjectDisplayName(fullPath, folderName) {
    const pathParts = fullPath.split(path.sep);
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return folderName;
    }
    // Find the workspace root
    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const relativePath = path.relative(workspaceRoot, fullPath);
    const relativePathParts = relativePath.split(path.sep);
    // If it's nested (like FSP/frontend), show parent folder name
    if (relativePathParts.length > 1) {
        const parentFolder = relativePathParts[relativePathParts.length - 2];
        return `${parentFolder} ${folderName}`;
    }
    return folderName;
}
// Deduplicate projects based on normalized paths
function deduplicateProjects(projects) {
    const seen = new Set();
    const uniqueProjects = [];
    for (const project of projects) {
        // Normalize the path for comparison
        const normalizedPath = path.resolve(project.fullPath).toLowerCase();
        if (!seen.has(normalizedPath)) {
            seen.add(normalizedPath);
            uniqueProjects.push(project);
            console.log(`✅ Added unique project: ${project.name} at ${project.fullPath}`);
        }
        else {
            console.log(`🔄 Skipping duplicate project: ${project.name} at ${project.fullPath}`);
        }
    }
    console.log(`📋 Deduplication: ${projects.length} found → ${uniqueProjects.length} unique projects`);
    return uniqueProjects;
}
// Scan directory for frontend/backend projects and collect them
async function scanForProjectsWithCollection(basePath, detectedProjects, processedPaths) {
    try {
        console.log("Scanning directory:", basePath);
        // Check if this path has already been processed to avoid infinite loops
        const normalizedBasePath = path.resolve(basePath).toLowerCase();
        if (processedPaths.has(normalizedBasePath)) {
            console.log("Already processed path:", basePath);
            return;
        }
        processedPaths.add(normalizedBasePath);
        const entries = await fs.promises.readdir(basePath, {
            withFileTypes: true,
        });
        console.log("Found entries:", entries.map((e) => e.name));
        for (const entry of entries) {
            if (entry.isDirectory()) {
                // Skip common directories that shouldn't be scanned
                if (entry.name === "node_modules" ||
                    entry.name === ".git" ||
                    entry.name === "target" ||
                    entry.name === "build" ||
                    entry.name === "built" ||
                    entry.name === "bin" ||
                    entry.name === "dist" ||
                    entry.name === ".vscode" ||
                    entry.name === ".idea" ||
                    entry.name.startsWith(".")) {
                    console.log("Skipping directory:", entry.name);
                    continue;
                }
                const fullPath = path.join(basePath, entry.name);
                console.log("Checking project at:", fullPath);
                // Skip if this project path has already been added
                const normalizedFullPath = path.resolve(fullPath).toLowerCase();
                const alreadyExists = detectedProjects.some((project) => path.resolve(project.fullPath).toLowerCase() === normalizedFullPath);
                if (alreadyExists) {
                    console.log("Project already detected, skipping:", fullPath);
                    continue;
                }
                // Track if we found a project to avoid duplicates
                let foundProject = false;
                // Check if this folder has frontend/backend subfolders (like FSP, HRMS, etc.)
                try {
                    const subEntries = await fs.promises.readdir(fullPath, {
                        withFileTypes: true,
                    });
                    let hasFrontend = false;
                    let hasBackend = false;
                    // Look for frontend and backend subfolders
                    for (const subEntry of subEntries) {
                        if (subEntry.isDirectory()) {
                            if (subEntry.name === "frontend" ||
                                subEntry.name.toLowerCase().includes("frontend")) {
                                hasFrontend = true;
                            }
                            if (subEntry.name === "backend" ||
                                subEntry.name.toLowerCase().includes("backend")) {
                                hasBackend = true;
                            }
                        }
                    }
                    // If we found both frontend and backend, process them
                    if (hasFrontend || hasBackend) {
                        for (const subEntry of subEntries) {
                            if (subEntry.isDirectory()) {
                                const subPath = path.join(fullPath, subEntry.name);
                                // Check frontend subfolder
                                if (subEntry.name === "frontend" ||
                                    subEntry.name.toLowerCase().includes("frontend")) {
                                    if (await isReactProject(subPath)) {
                                        const projectName = `${entry.name} Frontend`;
                                        console.log("Found nested React project:", projectName, "at:", subPath);
                                        detectedProjects.push({
                                            name: projectName,
                                            fullPath: subPath,
                                            type: "frontend",
                                            framework: "React/Next.js",
                                        });
                                        foundProject = true;
                                    }
                                    else if (await isNodeProject(subPath)) {
                                        const nodeProjectInfo = await analyzeNodeProject(subPath);
                                        const projectName = `${entry.name} Frontend`;
                                        console.log(`Found nested Node.js project: ${projectName} (${nodeProjectInfo.framework}) at: ${subPath}`);
                                        detectedProjects.push({
                                            name: projectName,
                                            fullPath: subPath,
                                            type: nodeProjectInfo.type,
                                            framework: nodeProjectInfo.framework,
                                        });
                                        foundProject = true;
                                    }
                                }
                                // Check backend subfolder
                                if (subEntry.name === "backend" ||
                                    subEntry.name.toLowerCase().includes("backend")) {
                                    if (await isSpringBootProject(subPath)) {
                                        const projectName = `${entry.name} Backend`;
                                        console.log("Found nested Spring Boot project:", projectName);
                                        detectedProjects.push({
                                            name: projectName,
                                            fullPath: subPath,
                                            type: "backend",
                                            framework: "Spring Boot",
                                        });
                                        foundProject = true;
                                    }
                                    else if (await isNodeProject(subPath)) {
                                        const nodeProjectInfo = await analyzeNodeProject(subPath);
                                        const projectName = `${entry.name} Backend`;
                                        console.log(`Found nested Node.js backend project: ${projectName} (${nodeProjectInfo.framework})`);
                                        detectedProjects.push({
                                            name: projectName,
                                            fullPath: subPath,
                                            type: nodeProjectInfo.type,
                                            framework: nodeProjectInfo.framework,
                                        });
                                        foundProject = true;
                                    }
                                }
                            }
                        }
                    }
                }
                catch (subError) {
                    console.log(`Cannot read subfolders of ${entry.name}:`, subError);
                }
                // Only check as direct project if we didn't find nested projects
                if (!foundProject) {
                    if (await isReactProject(fullPath)) {
                        const projectName = `${getProjectDisplayName(fullPath, entry.name)}`;
                        console.log("Found direct React project:", projectName);
                        detectedProjects.push({
                            name: projectName,
                            fullPath,
                            type: "frontend",
                            framework: "React/Next.js",
                        });
                        foundProject = true;
                    }
                    else if (await isSpringBootProject(fullPath)) {
                        const projectName = `${getProjectDisplayName(fullPath, entry.name)}`;
                        console.log("Found direct Spring Boot project:", projectName);
                        detectedProjects.push({
                            name: projectName,
                            fullPath,
                            type: "backend",
                            framework: "Spring Boot",
                        });
                        foundProject = true;
                    }
                    else if (await isNodeProject(fullPath)) {
                        // Enhanced Node.js project detection - check if it's frontend or backend
                        const nodeProjectInfo = await analyzeNodeProject(fullPath);
                        const projectName = `${getProjectDisplayName(fullPath, entry.name)}`;
                        console.log(`Found direct Node.js project: ${projectName} (${nodeProjectInfo.type} - ${nodeProjectInfo.framework})`);
                        detectedProjects.push({
                            name: projectName,
                            fullPath,
                            type: nodeProjectInfo.type,
                            framework: nodeProjectInfo.framework,
                        });
                        foundProject = true;
                    }
                }
                // Continue scanning deeper if we haven't found any projects and depth allows
                // But don't go too deep if we've already found structured projects
                const relativePath = path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, fullPath);
                const depth = relativePath.split(path.sep).length;
                const maxDepth = foundProject ? 3 : 5; // Less depth if we already found projects
                if (depth < maxDepth) {
                    await scanForProjectsWithCollection(fullPath, detectedProjects, processedPaths);
                }
                else {
                    console.log("Skipping deeper scan for:", fullPath, "depth:", depth);
                }
            }
        }
    }
    catch (error) {
        console.error("Error scanning projects in", basePath, ":", error);
    }
}
// Helper function to generate a unique key for a project to better match selections
function getProjectKey(projectPath, projectName, framework) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const relativePath = path.relative(workspaceRoot, projectPath);
    return `${relativePath}||${projectName}||${framework}`;
}
// Show project selection dialog
async function showProjectSelectionDialog(detectedProjects, currentServerPaths, currentServerNames, currentServerNamesLowerCase) {
    // Create quick pick items
    const quickPickItems = detectedProjects.map((project) => {
        const icon = project.type === "frontend" ? "$(browser)" : "$(server)";
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
        const relativePath = path.relative(workspaceRoot, project.fullPath);
        // Check if this project was previously selected using multiple matching strategies
        let wasSelected = true; // Default to true for new detections
        if (currentServerPaths && currentServerPaths.size > 0) {
            // Try path-based matching first (most reliable)
            const pathMatch = currentServerPaths.has(relativePath);
            // Try name-based matching as fallback
            const baseName = project.name.includes("(")
                ? project.name.split("(")[0].trim()
                : project.name;
            const nameMatch = currentServerNames
                ? currentServerNames.has(baseName)
                : false;
            const nameLowerMatch = currentServerNamesLowerCase
                ? currentServerNamesLowerCase.has(baseName.toLowerCase())
                : false;
            // Try partial name matching (for cases like "FSP Frontend" matching "FSP")
            let partialNameMatch = false;
            if (currentServerNames) {
                for (const savedName of currentServerNames) {
                    if (baseName.includes(savedName) || savedName.includes(baseName)) {
                        partialNameMatch = true;
                        break;
                    }
                }
            }
            // Consider it selected if any matching strategy succeeds
            wasSelected =
                pathMatch || nameMatch || nameLowerMatch || partialNameMatch;
            console.log(`Project: ${project.name}`);
            console.log(`  - Relative path: ${relativePath}`);
            console.log(`  - Base name: ${baseName}`);
            console.log(`  - Path match: ${pathMatch}`);
            console.log(`  - Name match: ${nameMatch}`);
            console.log(`  - Lower name match: ${nameLowerMatch}`);
            console.log(`  - Partial name match: ${partialNameMatch}`);
            console.log(`  - Final selection: ${wasSelected}`);
        }
        return {
            label: `${icon} ${project.name}`,
            description: `${project.framework} (${project.type})`,
            detail: relativePath,
            picked: wasSelected,
            project: project,
        };
    });
    const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
        canPickMany: true,
        placeHolder: currentServerPaths && currentServerPaths.size > 0
            ? "Select projects to keep as default servers (previously selected items are pre-checked)"
            : "Select projects to add as default servers (these will auto-start)",
    });
    return selectedItems?.map((item) => item.project);
}
async function scanForProjects(basePath) {
    try {
        const entries = await fs.promises.readdir(basePath, {
            withFileTypes: true,
        });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(basePath, entry.name);
                // Check if it's a frontend project
                if (await isReactProject(fullPath)) {
                    await addDetectedProject(entry.name, fullPath, "frontend", "React/Next.js");
                }
                // Check if it's a backend project
                else if (await isSpringBootProject(fullPath)) {
                    await addDetectedProject(entry.name, fullPath, "backend", "Spring Boot");
                }
                // Check if it's a Node.js project
                else if (await isNodeProject(fullPath)) {
                    await addDetectedProject(entry.name, fullPath, "frontend", "Node.js");
                }
            }
        }
    }
    catch (error) {
        console.error("Error scanning projects:", error);
    }
}
// Check if directory is a React project
async function isReactProject(projectPath) {
    try {
        const packageJsonPath = path.join(projectPath, "package.json");
        console.log("Checking for React project at:", packageJsonPath);
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, "utf8"));
            const hasReact = !!(packageJson.dependencies?.react ||
                packageJson.devDependencies?.react ||
                packageJson.dependencies?.next ||
                packageJson.devDependencies?.next);
            console.log("React project check result:", hasReact, "Dependencies:", Object.keys(packageJson.dependencies || {}));
            return hasReact;
        }
        console.log("No package.json found at:", packageJsonPath);
    }
    catch (error) {
        console.error("Error checking React project:", error);
    }
    return false;
}
// Check if directory is a Spring Boot project
async function isSpringBootProject(projectPath) {
    try {
        const pomPath = path.join(projectPath, "pom.xml");
        console.log("Checking for Spring Boot project at:", pomPath);
        if (fs.existsSync(pomPath)) {
            const pomContent = await fs.promises.readFile(pomPath, "utf8");
            const hasSpringBoot = pomContent.includes("spring-boot");
            console.log("Spring Boot project check result:", hasSpringBoot);
            return hasSpringBoot;
        }
        console.log("No pom.xml found at:", pomPath);
    }
    catch (error) {
        console.error("Error checking Spring Boot project:", error);
    }
    return false;
}
// Check if directory is a Node.js project
async function isNodeProject(projectPath) {
    try {
        const packageJsonPath = path.join(projectPath, "package.json");
        console.log("Checking for Node.js project at:", packageJsonPath);
        const exists = fs.existsSync(packageJsonPath);
        console.log("Node.js project check result:", exists);
        return exists;
    }
    catch (error) {
        console.error("Error checking Node.js project:", error);
    }
    return false;
}
// Enhanced Node.js project analysis to determine type and framework
async function analyzeNodeProject(projectPath) {
    try {
        const packageJsonPath = path.join(projectPath, "package.json");
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
        console.log("Analyzing Node.js project:", projectPath);
        console.log("Package name:", packageJson.name);
        console.log("Dependencies:", Object.keys(packageJson.dependencies || {}));
        console.log("DevDependencies:", Object.keys(packageJson.devDependencies || {}));
        console.log("Scripts:", Object.keys(packageJson.scripts || {}));
        const dependencies = {
            ...packageJson.dependencies,
            ...packageJson.devDependencies,
        };
        const scripts = packageJson.scripts || {};
        const projectName = packageJson.name || "";
        const description = packageJson.description || "";
        // Check for frontend frameworks
        if (dependencies.react || dependencies["@types/react"]) {
            return { type: "frontend", framework: "React" };
        }
        if (dependencies.next || dependencies["@types/next"]) {
            return { type: "frontend", framework: "Next.js" };
        }
        if (dependencies.vue || dependencies["@vue/cli-service"]) {
            return { type: "frontend", framework: "Vue.js" };
        }
        if (dependencies.angular || dependencies["@angular/core"]) {
            return { type: "frontend", framework: "Angular" };
        }
        if (dependencies.vite) {
            return { type: "frontend", framework: "Vite" };
        }
        // Check for backend frameworks/indicators
        if (dependencies.express) {
            return { type: "backend", framework: "Express.js" };
        }
        if (dependencies.fastify) {
            return { type: "backend", framework: "Fastify" };
        }
        if (dependencies.koa) {
            return { type: "backend", framework: "Koa.js" };
        }
        if (dependencies.nestjs || dependencies["@nestjs/core"]) {
            return { type: "backend", framework: "NestJS" };
        }
        if (dependencies.hapi || dependencies["@hapi/hapi"]) {
            return { type: "backend", framework: "Hapi.js" };
        }
        // Check for database/API related dependencies (likely backend)
        const backendKeywords = [
            "mongoose",
            "sequelize",
            "typeorm",
            "prisma",
            "mysql",
            "postgresql",
            "mongodb",
            "redis",
            "passport",
            "jwt",
            "bcrypt",
            "cors",
            "helmet",
            "morgan",
            "winston",
        ];
        if (backendKeywords.some((keyword) => dependencies[keyword])) {
            return { type: "backend", framework: "Node.js API" };
        }
        // Check scripts for hints
        if (scripts.serve || scripts.dev || scripts.start) {
            const startScript = scripts.start || scripts.dev || scripts.serve || "";
            if (startScript.includes("react-scripts") ||
                startScript.includes("next")) {
                return { type: "frontend", framework: "React/Next.js" };
            }
            if (startScript.includes("vue-cli-service") ||
                startScript.includes("vite")) {
                return { type: "frontend", framework: "Vue.js/Vite" };
            }
            if (startScript.includes("ng serve") || startScript.includes("angular")) {
                return { type: "frontend", framework: "Angular" };
            }
            if (startScript.includes("node") ||
                startScript.includes("nodemon") ||
                startScript.includes("ts-node")) {
                return { type: "backend", framework: "Node.js" };
            }
        }
        // Check project name and description for hints
        const nameAndDesc = (projectName + " " + description).toLowerCase();
        if (nameAndDesc.includes("frontend") ||
            nameAndDesc.includes("client") ||
            nameAndDesc.includes("ui") ||
            nameAndDesc.includes("web")) {
            return { type: "frontend", framework: "Node.js" };
        }
        if (nameAndDesc.includes("backend") ||
            nameAndDesc.includes("server") ||
            nameAndDesc.includes("api") ||
            nameAndDesc.includes("service")) {
            return { type: "backend", framework: "Node.js" };
        }
        // Default fallback - check if it has typical frontend build tools
        if (dependencies.webpack ||
            dependencies.parcel ||
            dependencies["@types/webpack"]) {
            return { type: "frontend", framework: "Node.js" };
        }
        // If we can't determine, default to frontend for Node.js projects
        // (most standalone Node.js projects without backend dependencies are frontend)
        return { type: "frontend", framework: "Node.js" };
    }
    catch (error) {
        console.error("Error analyzing Node.js project:", error);
        return { type: "frontend", framework: "Node.js" }; // Fallback
    }
}
// Helper function to extract serverId from contextValue (format: "serverId:type")
function extractServerId(contextValue) {
    if (contextValue.includes(":")) {
        return contextValue.split(":")[0];
    }
    return contextValue;
}
// Resolve contextValue from either a raw string or a ServerItem object
// (inline tree-view buttons pass the ServerItem; click-commands pass the string)
function resolveContextValue(itemOrContextValue) {
    if (typeof itemOrContextValue === "string") {
        return itemOrContextValue;
    }
    return itemOrContextValue?.contextValue;
}
// Helper function to format path for terminal commands (cross-platform)
function formatPathForTerminal(relativePath) {
    // Handle empty or current directory paths
    if (!relativePath || relativePath === "." || relativePath === "./") {
        return ".";
    }
    let formattedPath = relativePath;
    // On Windows, convert backslashes to forward slashes for better terminal compatibility
    if (process.platform === "win32") {
        formattedPath = formattedPath.replace(/\\/g, "/");
    }
    // If path contains spaces or special characters, quote it
    if (formattedPath.includes(" ") ||
        formattedPath.includes("&") ||
        formattedPath.includes("(") ||
        formattedPath.includes(")") ||
        formattedPath.includes("'") ||
        formattedPath.includes('"')) {
        // Use double quotes and escape any existing double quotes
        formattedPath = `"${formattedPath.replace(/"/g, '\\"')}"`;
    }
    return formattedPath;
}
// Convert shell command for cross-platform compatibility (including PowerShell on Windows)
function convertCommandForShell(command) {
    if (process.platform !== "win32") {
        return command;
    }
    // PowerShell uses ';' instead of '&&' for command chaining
    let converted = command.replace(/\s*&&\s*/g, "; ");
    // Fix 'cd' paths: convert backslashes to forward slashes and quote if needed
    converted = converted.replace(/cd\s+([^\s;|]+)/g, (match, p) => {
        if (p.startsWith('"') || p.startsWith("'") || p === "." || p === "./") {
            return match;
        }
        const fixedPath = p.replace(/\\/g, "/");
        if (fixedPath.includes(" ") ||
            fixedPath.includes("&") ||
            fixedPath.includes("(") ||
            fixedPath.includes(")")) {
            return `cd "${fixedPath}"`;
        }
        return `cd ${fixedPath}`;
    });
    return converted;
}
// Legacy alias kept for any remaining callers
function fixPathsInCommand(command) {
    return convertCommandForShell(command);
}
// Add detected project to configuration
async function addDetectedProject(name, fullPath, type, framework) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const relativePath = path.relative(workspaceRoot, fullPath);
    const terminalPath = formatPathForTerminal(relativePath);
    let command = "";
    let emoji = "";
    if (type === "frontend") {
        // Enhanced frontend command detection
        if (framework.toLowerCase().includes("next")) {
            command = `cd ${terminalPath} && npm run dev`;
        }
        else if (framework.toLowerCase().includes("react")) {
            command = `cd ${terminalPath} && npm start`;
        }
        else if (framework.toLowerCase().includes("vue")) {
            command = `cd ${terminalPath} && npm run serve`;
        }
        else if (framework.toLowerCase().includes("angular")) {
            command = `cd ${terminalPath} && ng serve`;
        }
        else if (framework.toLowerCase().includes("vite")) {
            command = `cd ${terminalPath} && npm run dev`;
        }
        else {
            // Default Node.js frontend
            command = `cd ${terminalPath} && npm run dev`;
        }
        emoji = "web";
    }
    else {
        // Backend commands
        if (framework.toLowerCase().includes("spring")) {
            // Use mvn spring-boot:run with additional error handling flags
            command = `cd ${terminalPath} && mvn spring-boot:run -Dspring-boot.run.fork=false`;
            console.log(`🔧 Using enhanced Spring Boot command for ${name}: ${command}`);
        }
        else if (framework.toLowerCase().includes("express") ||
            framework.toLowerCase().includes("fastify") ||
            framework.toLowerCase().includes("nestjs") ||
            framework.toLowerCase().includes("koa") ||
            framework.toLowerCase().includes("hapi") ||
            framework.toLowerCase().includes("node")) {
            // Node.js backend projects - try common start commands
            try {
                const packageJsonPath = path.join(fullPath, "package.json");
                if (fs.existsSync(packageJsonPath)) {
                    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
                    const scripts = packageJson.scripts || {};
                    if (scripts.dev) {
                        command = `cd ${terminalPath} && npm run dev`;
                    }
                    else if (scripts.start) {
                        command = `cd ${terminalPath} && npm start`;
                    }
                    else if (scripts.serve) {
                        command = `cd ${terminalPath} && npm run serve`;
                    }
                    else {
                        // Fallback - assume main entry point
                        const main = packageJson.main || "index.js";
                        command = `cd ${terminalPath} && node ${main}`;
                    }
                    console.log(`🔧 Using Node.js backend command for ${name}: ${command}`);
                }
                else {
                    command = `cd ${terminalPath} && npm start`;
                }
            }
            catch (error) {
                console.error("Error reading package.json for backend command:", error);
                command = `cd ${terminalPath} && npm start`;
            }
        }
        else {
            // Default backend command (assume Maven for unknown backends)
            command = `cd ${terminalPath} && mvn spring-boot:run`;
        }
        emoji = "⚙️";
    }
    const id = configManager.generateUniqueId(name);
    const category = type === "frontend" ? "Frontend Servers" : "Backend Servers";
    const newServer = {
        id,
        name: `${name} (${framework})`,
        type,
        command,
        workingDirectory: relativePath,
        emoji,
        category: category,
    };
    // Check if already exists
    const existing = configManager
        .getServers()
        .find((s) => s.name === newServer.name);
    if (!existing) {
        configManager.addServer(newServer);
        console.log(`Added detected project: ${newServer.name}`);
    }
}
// Install dependencies for a project
async function installDependencies(serverId) {
    const serverConfig = configManager.getServerById(serverId);
    if (!serverConfig) {
        vscode.window.showErrorMessage("Server not found!");
        return;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const projectPath = path.join(workspaceRoot, serverConfig.workingDirectory);
    vscode.window.showInformationMessage(`Installing dependencies for ${serverConfig.name}...`);
    // Create terminal for dependency installation
    const terminal = vscode.window.createTerminal({
        name: `Install Dependencies - ${serverConfig.name}`,
        cwd: projectPath,
    });
    terminal.show();
    if (serverConfig.type === "frontend") {
        // Check if package.json exists and install npm dependencies
        const packageJsonPath = path.join(projectPath, "package.json");
        if (fs.existsSync(packageJsonPath)) {
            terminal.sendText("npm install");
        }
    }
    else if (serverConfig.type === "backend") {
        // Check if pom.xml exists and install maven dependencies
        const pomPath = path.join(projectPath, "pom.xml");
        if (fs.existsSync(pomPath)) {
            terminal.sendText("mvn clean install");
        }
    }
}
// Install all dependencies for all projects
async function installAllDependencies() {
    const servers = configManager.getServers();
    if (servers.length === 0) {
        vscode.window.showWarningMessage("No servers configured! Use auto-detect to find projects.");
        return;
    }
    vscode.window.showInformationMessage("Downloading dependencies for all projects...");
    // Install dependencies for all servers with progress
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Downloading all dependencies...",
        cancellable: false,
    }, async (progress) => {
        const totalServers = servers.length;
        for (let i = 0; i < servers.length; i++) {
            const server = servers[i];
            const percentage = Math.round(((i + 1) / totalServers) * 100);
            progress.report({
                increment: percentage / totalServers,
                message: `Downloading for ${server.name}...`,
            });
            await installDependencies(server.id);
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        progress.report({
            increment: 100,
            message: "All downloads complete.",
        });
    });
    vscode.window.showInformationMessage("Dependencies download started for all projects.");
}
// Create status bar with server controls
function createStatusBar() {
    // Clear existing status bar items
    statusBarItems.forEach((item) => item.dispose());
    statusBarItems = [];
    const servers = configManager.getServers();
    const runningCount = Object.keys(terminals).length;
    // Main status item
    const mainStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    mainStatus.text = `$(server) ${runningCount}/${servers.length} servers`;
    mainStatus.tooltip = "Ninja Runner - Click to open view";
    mainStatus.command = "serverRunner.showView";
    mainStatus.show();
    statusBarItems.push(mainStatus);
    // Start All button
    const startAll = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    startAll.text = "$(play) Start All";
    startAll.tooltip = "Start all servers";
    startAll.command = "serverRunner.startAllServers";
    startAll.show();
    statusBarItems.push(startAll);
    // Stop All button
    const stopAll = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    stopAll.text = "$(stop) Stop All";
    stopAll.tooltip = "Stop all servers";
    stopAll.command = "serverRunner.stopAllServers";
    stopAll.show();
    statusBarItems.push(stopAll);
}
// Save user preferences to workspace state
function saveUserPreferences() {
    const servers = configManager.getServers();
    extensionContext.workspaceState.update("ninja-runner-servers", servers);
}
// Load user preferences from workspace state
function loadUserPreferences() {
    const savedServers = extensionContext.workspaceState.get("ninja-runner-servers");
    if (savedServers && savedServers.length > 0) {
        // Clear current servers and load saved ones
        configManager.clearAllServers();
        savedServers.forEach((server) => {
            configManager.addServer(server);
        });
        serverProvider.refresh();
        console.log(`🥷 Loaded ${savedServers.length} saved server configurations`);
    }
}
// Check for extension updates, notify user, and auto-replace managed build.sh files
async function checkForUpdates(context) {
    const lastNotifiedVersion = context.globalState.get("lastNotifiedVersion", "0.0.0");
    try {
        const packageJsonPath = path.join(context.extensionPath, "package.json");
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
        const installedVersion = packageJson.version;
        const extensionName = packageJson.displayName || packageJson.name;
        const isUpdate = installedVersion !== lastNotifiedVersion && lastNotifiedVersion !== "0.0.0";
        const isFirstRun = lastNotifiedVersion === "0.0.0";
        // ── Auto-replace managed build.sh files on every version change ──────────
        if (isUpdate || isFirstRun) {
            await autoReplaceBuildScripts(context, installedVersion);
        }
        // ── Show update notification ──────────────────────────────────────────────
        if (isUpdate) {
            const action = await vscode.window.showInformationMessage(`${extensionName} updated to v${installedVersion}.`, "View Changelog", "Dismiss");
            if (action === "View Changelog") {
                const changelogUri = vscode.Uri.file(path.join(context.extensionPath, "CHANGELOG.md"));
                await vscode.commands.executeCommand("vscode.open", changelogUri);
            }
        }
        await context.globalState.update("lastNotifiedVersion", installedVersion);
        // ── Welcome message for new users ─────────────────────────────────────────
        if (isFirstRun) {
            setTimeout(() => {
                if (configManager.getServers().length === 0) {
                    vscode.window
                        .showInformationMessage("Welcome to Ninja Runner! Auto-detecting your projects...", "Open Ninja Runner")
                        .then((sel) => {
                        if (sel === "Open Ninja Runner") {
                            vscode.commands.executeCommand("serverRunner.showView");
                        }
                    });
                }
            }, 3000);
        }
    }
    catch (error) {
        console.error("Error checking for updates:", error);
    }
}
// Auto-replace every build.sh in the workspace that was installed by this
// extension (identified by the # NINJA_RUNNER_VERSION= header line).
// Files without that marker prompt the user before being replaced.
async function autoReplaceBuildScripts(context, newVersion) {
    const templatePath = path.join(context.extensionPath, "build.sh");
    if (!fs.existsSync(templatePath)) {
        return;
    }
    const templateContent = fs.readFileSync(templatePath, "utf8");
    // Find every build.sh in the workspace (skip node_modules / target / dist)
    let files = [];
    try {
        files = await vscode.workspace.findFiles("**/build.sh", "{**/node_modules/**,**/target/**,**/dist/**,**/built/**}");
    }
    catch {
        return;
    }
    let replaced = 0;
    for (const file of files) {
        try {
            const content = fs.readFileSync(file.fsPath, "utf8");
            if (content.includes("# NINJA_RUNNER_VERSION=")) {
                // Managed file — check version and auto-replace if outdated
                const match = content.match(/^# NINJA_RUNNER_VERSION=(.+)$/m);
                const fileVersion = match ? match[1].trim() : "";
                if (fileVersion === newVersion) {
                    continue; // already up to date
                }
                fs.writeFileSync(file.fsPath, templateContent, "utf8");
                try {
                    fs.chmodSync(file.fsPath, "755");
                }
                catch { /* Windows */ }
                replaced++;
                console.log(`[Ninja Runner] Updated build.sh at ${file.fsPath} (${fileVersion} → ${newVersion})`);
            }
            else {
                // Unmanaged file — ask the user before touching it
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
                const relativePath = path.relative(workspaceRoot, file.fsPath);
                const answer = await vscode.window.showInformationMessage(`Ninja Runner: A build.sh already exists at "${relativePath}". Replace it with the Ninja Runner managed version?`, { modal: true }, "Replace", "Skip");
                if (answer !== "Replace") {
                    continue;
                }
                fs.writeFileSync(file.fsPath, templateContent, "utf8");
                try {
                    fs.chmodSync(file.fsPath, "755");
                }
                catch { /* Windows */ }
                replaced++;
                console.log(`[Ninja Runner] Replaced unmanaged build.sh at ${file.fsPath} with v${newVersion}`);
            }
        }
        catch (err) {
            console.error(`[Ninja Runner] Failed to update ${file.fsPath}:`, err);
        }
    }
    if (replaced > 0) {
        vscode.window.showInformationMessage(`Ninja Runner: updated ${replaced} build.sh file${replaced > 1 ? "s" : ""} to v${newVersion}.`);
    }
}
function deactivate() {
    // Stop all debug sessions
    Object.entries(debugSessions).forEach(([serverId, session]) => {
        console.log(`🐛 Stopping debug session for server: ${serverId}`);
        vscode.debug.stopDebugging(session);
    });
    debugSessions = {};
    debugPorts = {};
    // Clean up terminals when extension is deactivated
    Object.values(terminals).forEach((terminal) => {
        if (terminal.exitStatus === undefined) {
            terminal.dispose();
        }
    });
    terminals = {};
    // Reset debug port counters
    nextJavaDebugPort = 5005;
    nextNodeDebugPort = 9229;
    // Clean up status bar items
    statusBarItems.forEach((item) => item.dispose());
    statusBarItems = [];
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map