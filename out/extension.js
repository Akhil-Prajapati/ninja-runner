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
const serverProvider_1 = require("./serverProvider");
const serverConfig_1 = require("./serverConfig");
let terminals = {};
let serverProvider;
let configManager;
let isFirstActivation = true;
function activate(context) {
    console.log("🥷 Ninja Runner extension is now active!");
    // Set context to show the view
    vscode.commands.executeCommand("setContext", "serverRunnerEnabled", true);
    configManager = serverConfig_1.ServerConfigManager.getInstance();
    serverProvider = new serverProvider_1.ServerRunnerProvider();
    vscode.window.registerTreeDataProvider("serverRunnerView", serverProvider);
    // Auto-start all servers on first activation when view becomes visible
    const onViewVisibilityChanged = vscode.window.onDidChangeWindowState((e) => {
        if (e.focused && isFirstActivation) {
            // Small delay to ensure view is ready
            setTimeout(() => {
                autoStartAllServersOnActivation();
                isFirstActivation = false;
            }, 500);
        }
    });
    // Also handle when the view becomes visible
    const onViewVisible = vscode.commands.registerCommand("serverRunnerView.focus", () => {
        if (isFirstActivation) {
            setTimeout(() => {
                autoStartAllServersOnActivation();
                isFirstActivation = false;
            }, 100);
        }
    });
    // Register commands
    const disposables = [
        onViewVisibilityChanged,
        onViewVisible,
        vscode.commands.registerCommand("serverRunner.startFspFrontend", () => {
            console.log("🥷 FSP Frontend command triggered!");
            startServer("FSP Frontend", "cd FSP/frontend && npm run dev", "fsp-frontend");
        }),
        vscode.commands.registerCommand("serverRunner.startHrmsFrontend", () => {
            console.log("🥷 HRMS Frontend command triggered!");
            startServer("HRMS Frontend", "cd HRMS/frontend && npm run dev", "hrms-frontend");
        }),
        vscode.commands.registerCommand("serverRunner.startFspBackend", () => {
            console.log("🥷 FSP Backend command triggered!");
            startServer("FSP Backend", "cd FSP/backend && mvn spring-boot:run", "fsp-backend");
        }),
        vscode.commands.registerCommand("serverRunner.startHrmsBackend", () => {
            console.log("🥷 HRMS Backend command triggered!");
            startServer("HRMS Backend", "cd HRMS/backend && mvn spring-boot:run", "hrms-backend");
        }),
        vscode.commands.registerCommand("serverRunner.stopAllServers", () => {
            stopAllServers();
        }),
        vscode.commands.registerCommand("serverRunner.startAllServers", () => {
            startAllServers();
        }),
        vscode.commands.registerCommand("serverRunner.refresh", () => {
            serverProvider.refresh();
        }),
        vscode.commands.registerCommand("serverRunner.startDynamicServer", (serverId) => {
            const serverConfig = configManager.getServerById(serverId);
            if (serverConfig) {
                startServer(serverConfig.name, serverConfig.command, serverId);
            }
        }),
        vscode.commands.registerCommand("serverRunner.addServer", () => {
            addNewServer();
        }),
        vscode.commands.registerCommand("serverRunner.editServer", (item) => {
            if (item.contextValue) {
                editServer(item.contextValue);
            }
        }),
        vscode.commands.registerCommand("serverRunner.deleteServer", (item) => {
            if (item.contextValue) {
                deleteServer(item.contextValue);
            }
        }),
    ];
    context.subscriptions.push(...disposables);
    // Start periodic status monitoring
    startServerStatusMonitoring();
}
exports.activate = activate;
function autoStartAllServersOnActivation() {
    vscode.window.showInformationMessage("🥷 Ninja Auto-Starting All Servers...");
    // Show progress notification
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "🚀 Ninja launching all servers...",
        cancellable: false,
    }, async (progress) => {
        progress.report({ increment: 0, message: "Starting FSP Frontend..." });
        startServer("FSP Frontend", "cd FSP/frontend && npm run dev", "fsp-frontend");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        progress.report({ increment: 25, message: "Starting HRMS Frontend..." });
        startServer("HRMS Frontend", "cd HRMS/frontend && npm run dev", "hrms-frontend");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        progress.report({ increment: 50, message: "Starting FSP Backend..." });
        startServer("FSP Backend", "cd FSP/backend && mvn spring-boot:run", "fsp-backend");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        progress.report({ increment: 75, message: "Starting HRMS Backend..." });
        startServer("HRMS Backend", "cd HRMS/backend && mvn spring-boot:run", "hrms-backend");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        progress.report({ increment: 100, message: "All servers launched! 🥷" });
        return new Promise((resolve) => {
            setTimeout(() => {
                vscode.window.showInformationMessage("🎯 All ninja servers are now running!");
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
            const isRunning = terminal && terminal.exitStatus === undefined;
            serverProvider.updateServerStatus(server.id, isRunning || false);
        });
    }, 3000); // Check every 3 seconds
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
        prompt: "Enter an emoji for the server",
        placeHolder: "e.g., 🚀",
        value: type === "frontend" ? "🌐" : "⚙️",
    });
    const id = configManager.generateUniqueId(name);
    const category = type === "frontend" ? "Frontend Servers" : "Backend Servers";
    const newServer = {
        id,
        name,
        type: type,
        command,
        workingDirectory,
        emoji: emoji || (type === "frontend" ? "🌐" : "⚙️"),
        category: category,
    };
    configManager.addServer(newServer);
    serverProvider.refresh();
    vscode.window.showInformationMessage(`🥷 Ninja added ${name} server!`);
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
    serverProvider.refresh();
    vscode.window.showInformationMessage(`🥷 Ninja updated ${name} server!`);
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
        serverProvider.refresh();
        vscode.window.showInformationMessage(`🥷 Ninja removed ${serverConfig.name} server!`);
    }
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
    // Create new terminal
    const terminal = vscode.window.createTerminal({
        name: name,
        cwd: workspaceRoot,
    });
    terminals[terminalKey] = terminal;
    terminal.show();
    terminal.sendText(command);
    // Update server status to running
    serverProvider.updateServerStatus(terminalKey, true);
    // Clean up terminal reference when it exits
    vscode.window.onDidCloseTerminal((closedTerminal) => {
        if (closedTerminal === terminal) {
            delete terminals[terminalKey];
            // Update server status to stopped
            serverProvider.updateServerStatus(terminalKey, false);
        }
    });
    vscode.window.showInformationMessage(`🥷 Ninja launching ${name}...`);
}
function startAllServers() {
    vscode.window.showInformationMessage("🚀 Ninja launching all servers...");
    // Start all servers in sequence
    setTimeout(() => {
        startServer("FSP Frontend", "cd FSP/frontend && npm run dev", "fsp-frontend");
    }, 100);
    setTimeout(() => {
        startServer("HRMS Frontend", "cd HRMS/frontend && npm run dev", "hrms-frontend");
    }, 200);
    setTimeout(() => {
        startServer("FSP Backend", "cd FSP/backend && mvn spring-boot:run", "fsp-backend");
    }, 300);
    setTimeout(() => {
        startServer("HRMS Backend", "cd HRMS/backend && mvn spring-boot:run", "hrms-backend");
    }, 400);
}
function stopAllServers() {
    const activeTerminals = Object.values(terminals).filter((terminal) => terminal.exitStatus === undefined);
    if (activeTerminals.length === 0) {
        vscode.window.showInformationMessage("🔍 No servers found running, ninja!");
        return;
    }
    activeTerminals.forEach((terminal) => {
        terminal.sendText("\u0003"); // Send Ctrl+C
        terminal.dispose();
    });
    // Update all server statuses to stopped
    Object.keys(terminals).forEach((terminalKey) => {
        serverProvider.updateServerStatus(terminalKey, false);
    });
    terminals = {}; // Clear all terminal references
    vscode.window.showInformationMessage("🛑 All servers stopped by ninja power!");
}
function deactivate() {
    // Clean up terminals when extension is deactivated
    Object.values(terminals).forEach((terminal) => {
        if (terminal.exitStatus === undefined) {
            terminal.dispose();
        }
    });
    terminals = {};
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map