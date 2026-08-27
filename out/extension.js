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
const configService_1 = require("./services/configService");
const terminalService_1 = require("./services/terminalService");
const portService_1 = require("./services/portService");
const buildService_1 = require("./services/buildService");
const debugService_1 = require("./services/debugService");
const projectDetector_1 = require("./services/projectDetector");
const serverTreeProvider_1 = require("./providers/serverTreeProvider");
const todayTreeProvider_1 = require("./providers/todayTreeProvider");
const commands_1 = require("./commands");
let statusBarItem;
let monitoringInterval;
async function activate(context) {
    console.log("🥷 Ninja Runner v0.3.0 activated!");
    // 1. Initialize Services
    const configService = configService_1.ConfigService.getInstance();
    configService.initialize(context);
    const terminalService = terminalService_1.TerminalService.getInstance();
    const buildService = buildService_1.BuildService.getInstance();
    const debugService = debugService_1.DebugService.getInstance();
    // 2. Set Context for View Visibility
    vscode.commands.executeCommand("setContext", "serverRunnerEnabled", true);
    // 3. Register Providers
    const decorationProvider = new serverTreeProvider_1.ServerDecorationProvider();
    context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorationProvider));
    const serverProvider = new serverTreeProvider_1.ServerTreeProvider(decorationProvider);
    vscode.window.registerTreeDataProvider("serverRunnerView", serverProvider);
    const todayProvider = new todayTreeProvider_1.TodayTreeProvider();
    vscode.window.registerTreeDataProvider("ninjaInfoView", todayProvider);
    // 4. Register Commands
    (0, commands_1.registerAllCommands)(context, serverProvider, todayProvider);
    // 5. Connect Status Change Callbacks
    terminalService.onStatusChange((serverId, status) => {
        serverProvider.updateServerStatus(serverId, status);
        updateStatusBar();
        todayProvider.refresh();
    });
    buildService.onBuildStatusChange(() => {
        serverProvider.refresh();
    });
    // 6. Setup Status Bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = "serverRunner.showView";
    statusBarItem.tooltip = "Click to open Ninja Runner";
    context.subscriptions.push(statusBarItem);
    statusBarItem.show();
    // 7. Initial State Reconciliation
    await reconcileServerStates(serverProvider);
    updateStatusBar();
    // 8. Start Real-time Health Polling (Detects Ctrl+C, Port Closing, Startup)
    startHealthMonitoring(serverProvider);
    // 9. Auto-detect on first activation if no servers configured
    if (configService.getServers().length === 0) {
        setTimeout(async () => {
            const detector = projectDetector_1.ProjectDetector.getInstance();
            const detected = await detector.scanWorkspace();
            if (detected.length > 0) {
                const configs = detected.map((p) => detector.createServerConfig(p));
                configService.setServers(configs);
                await reconcileServerStates(serverProvider);
                serverProvider.refresh();
                todayProvider.refresh();
                updateStatusBar();
            }
        }, 1200);
    }
}
exports.activate = activate;
/**
 * Reconciles server running state across VS Code / extension reload.
 * Strictly checks if this specific server's terminal is active before probing ports.
 */
async function reconcileServerStates(serverProvider) {
    const configService = configService_1.ConfigService.getInstance();
    const portService = portService_1.PortService.getInstance();
    const terminalService = terminalService_1.TerminalService.getInstance();
    const servers = configService.getServers();
    terminalService.reconnectExistingTerminals();
    for (const server of servers) {
        const isTerminalActive = terminalService.isServerTerminalActive(server.id);
        if (isTerminalActive) {
            if (server.port) {
                const inUse = await portService.isPortInUse(server.port);
                serverProvider.updateServerStatus(server.id, inUse ? "running" : "stopped");
            }
            else {
                serverProvider.updateServerStatus(server.id, "running");
            }
        }
        else {
            // No active terminal registered for this server -> strictly stopped
            serverProvider.updateServerStatus(server.id, "stopped");
        }
    }
}
/**
 * Real-time monitoring: Checks TCP port listening and terminal activity.
 * Bound to individual server terminals to avoid marking all frontends as running when one starts.
 * Immediately transitions server to 'stopped' when Ctrl+C is pressed in terminal!
 */
function startHealthMonitoring(serverProvider) {
    const configService = configService_1.ConfigService.getInstance();
    const portService = portService_1.PortService.getInstance();
    const terminalService = terminalService_1.TerminalService.getInstance();
    monitoringInterval = setInterval(async () => {
        const servers = configService.getServers();
        for (const server of servers) {
            const isTerminalActive = terminalService.isServerTerminalActive(server.id);
            const currentStatus = serverProvider.getServerStatus(server.id);
            // If server does NOT have an active terminal in this session, it must be stopped!
            if (!isTerminalActive) {
                if (currentStatus !== "stopped") {
                    serverProvider.updateServerStatus(server.id, "stopped");
                }
                continue;
            }
            // This server HAS an active terminal started by Ninja Runner
            if (terminalService.isStartingGracePeriodActive(server.id)) {
                if (server.port) {
                    const inUse = await portService.isPortInUse(server.port);
                    if (inUse && currentStatus !== "running") {
                        serverProvider.updateServerStatus(server.id, "running");
                    }
                }
                continue;
            }
            if (server.port) {
                const inUse = await portService.isPortInUse(server.port);
                if (inUse) {
                    if (currentStatus !== "running" && currentStatus !== "restarting") {
                        serverProvider.updateServerStatus(server.id, "running");
                    }
                }
                else {
                    // Port is NOT in use — server was stopped (e.g. user pressed Ctrl+C in terminal)
                    if (currentStatus === "running" || currentStatus === "starting") {
                        serverProvider.updateServerStatus(server.id, "stopped");
                    }
                }
            }
            else {
                if (currentStatus !== "running") {
                    serverProvider.updateServerStatus(server.id, "running");
                }
            }
        }
        updateStatusBar();
    }, 2000);
}
function updateStatusBar() {
    const configService = configService_1.ConfigService.getInstance();
    const servers = configService.getServers();
    const total = servers.length;
    if (total === 0) {
        statusBarItem.text = "$(zap) Ninja Runner";
        return;
    }
    const terminalService = terminalService_1.TerminalService.getInstance();
    let runningCount = 0;
    for (const s of servers) {
        if (terminalService.isServerTerminalActive(s.id)) {
            runningCount++;
        }
    }
    statusBarItem.text = `$(server-process) Ninja: ${runningCount}/${total} Running`;
}
function deactivate() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    const terminalService = terminalService_1.TerminalService.getInstance();
    terminalService.disposeAll();
    const debugService = debugService_1.DebugService.getInstance();
    debugService.dispose();
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map