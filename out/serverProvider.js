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
exports.BuildItem = exports.ServerItem = exports.ServerRunnerProvider = exports.ServerDecorationProvider = exports.makeServerUri = exports.NINJA_RUNNER_SCHEME = void 0;
const vscode = __importStar(require("vscode"));
const serverConfig_1 = require("./serverConfig");
// ── Color tokens (VS Code ≥ 1.58) ────────────────────────────────────────────
const COLOR_RUNNING = new vscode.ThemeColor("testing.iconPassed"); // green
const COLOR_STARTING = new vscode.ThemeColor("editorWarning.foreground"); // yellow/orange
const COLOR_RESTARTING = new vscode.ThemeColor("editorInfo.foreground"); // blue
const COLOR_ERROR = new vscode.ThemeColor("testing.iconFailed"); // red
const COLOR_STOPPED = new vscode.ThemeColor("disabledForeground"); // muted grey
// ── URI scheme used for FileDecoration (colors the label text row) ───────────
exports.NINJA_RUNNER_SCHEME = "ninja-runner";
function makeServerUri(serverId) {
    // encode serverId in the path so the decoration provider can retrieve it
    return vscode.Uri.parse(`${exports.NINJA_RUNNER_SCHEME}:///${encodeURIComponent(serverId)}`);
}
exports.makeServerUri = makeServerUri;
// ── FileDecorationProvider — tints the entire tree-item row ──────────────────
//
//  VS Code calls provideFileDecoration() for every tree item that has
//  resourceUri set.  We return a ThemeColor that tints the label text,
//  making the running/stopped/error state immediately obvious even when
//  the icon is small.
//
class ServerDecorationProvider {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChangeFileDecorations = this._onDidChange.event;
        this.statusMap = {};
    }
    /** Called by ServerRunnerProvider whenever a server's status changes. */
    update(serverId, status) {
        this.statusMap[serverId] = status;
        this._onDidChange.fire(makeServerUri(serverId));
    }
    provideFileDecoration(uri) {
        if (uri.scheme !== exports.NINJA_RUNNER_SCHEME) {
            return undefined;
        }
        const serverId = decodeURIComponent(uri.path.slice(1)); // strip leading "/"
        const status = this.statusMap[serverId] ?? "stopped";
        switch (status) {
            case "running":
                return {
                    color: COLOR_RUNNING,
                    tooltip: "Running",
                };
            case "starting":
                return {
                    color: COLOR_STARTING,
                    badge: "…",
                    tooltip: "Starting",
                };
            case "restarting":
                return {
                    color: COLOR_RESTARTING,
                    badge: "↺",
                    tooltip: "Restarting",
                };
            case "error":
                return {
                    color: COLOR_ERROR,
                    badge: "!",
                    tooltip: "Error — click to retry",
                };
            case "stopped":
            default:
                return undefined; // default label colour = stopped (no decoration)
        }
    }
}
exports.ServerDecorationProvider = ServerDecorationProvider;
// ── Tree data provider ────────────────────────────────────────────────────────
class ServerRunnerProvider {
    constructor(decorations) {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.serverStatus = {};
        this.buildStatus = {};
        this.configManager = serverConfig_1.ServerConfigManager.getInstance();
        this.decorations = decorations;
        this.initializeServerStatus();
    }
    initializeServerStatus() {
        const servers = this.configManager.getServers();
        servers.forEach((server) => {
            this.serverStatus[server.id] = "stopped";
        });
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    updateServerStatus(serverKey, status) {
        this.serverStatus[serverKey] = status;
        this.decorations.update(serverKey, status); // update label colour
        this.refresh();
    }
    getServerStatus(serverKey) {
        return this.serverStatus[serverKey] ?? "stopped";
    }
    isServerRunning(serverKey) {
        return this.serverStatus[serverKey] === "running";
    }
    updateBuildStatus(projectPath, status) {
        this.buildStatus[projectPath] = status;
        this.refresh();
    }
    getBuildStatus(projectPath) {
        return this.buildStatus[projectPath] ?? "idle";
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            return Promise.resolve([
                new ServerItem("Frontend Servers", vscode.TreeItemCollapsibleState.Expanded, "folder", "folder-frontend"),
                new ServerItem("Backend Servers", vscode.TreeItemCollapsibleState.Expanded, "folder", "folder-backend"),
                new ServerItem("Build Manager", vscode.TreeItemCollapsibleState.Expanded, "folder", "folder-build"),
            ]);
        }
        const ctx = element.contextValue;
        if (ctx === "folder-frontend") {
            const servers = this.configManager.getServersByCategory("Frontend Servers");
            return Promise.resolve(servers.map((s) => new ServerItem(s.name, vscode.TreeItemCollapsibleState.None, "server", `${s.id}:frontend`, this.getServerStatus(s.id), s.port)));
        }
        if (ctx === "folder-backend") {
            const servers = this.configManager.getServersByCategory("Backend Servers");
            return Promise.resolve(servers.map((s) => new ServerItem(s.name, vscode.TreeItemCollapsibleState.None, "server", `${s.id}:backend`, this.getServerStatus(s.id), s.port)));
        }
        if (ctx === "folder-build") {
            return this.scanBuildProjects();
        }
        return Promise.resolve([]);
    }
    async scanBuildProjects() {
        // Only show projects whose servers are already configured
        // (same set the user selected during auto-detect).
        // workingDirectory is like "Auth/frontend" or "Auth/backend" —
        // take the first path segment as the project name.
        const servers = this.configManager.getServers();
        const seen = new Set();
        const items = [];
        for (const server of servers) {
            // Normalise separators so it works on Windows too
            const parts = server.workingDirectory.replace(/\\/g, "/").split("/");
            if (parts.length < 2) {
                continue;
            } // skip top-level entries
            const projectName = parts[0];
            if (seen.has(projectName)) {
                continue;
            }
            seen.add(projectName);
            items.push(new BuildItem(projectName, projectName, this.buildStatus[projectName] ?? "idle"));
        }
        return items;
    }
}
exports.ServerRunnerProvider = ServerRunnerProvider;
// ── Tree item ─────────────────────────────────────────────────────────────────
class ServerItem extends vscode.TreeItem {
    constructor(label, collapsibleState, itemType, contextValue, status, port) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.itemType = itemType;
        this.contextValue = contextValue;
        this.status = status;
        this.port = port;
        this.tooltip = this.label;
        if (itemType === "folder") {
            if (contextValue === "folder-frontend") {
                this.iconPath = new vscode.ThemeIcon("browser", new vscode.ThemeColor("charts.blue"));
            }
            else if (contextValue === "folder-build") {
                this.iconPath = new vscode.ThemeIcon("package", new vscode.ThemeColor("charts.purple"));
            }
            else {
                this.iconPath = new vscode.ThemeIcon("server", new vscode.ThemeColor("charts.orange"));
            }
        }
        else {
            // ── coloured icon reflects status ──────────────────────────────────────
            const portSuffix = port ? ` · :${port}` : "";
            switch (status) {
                case "running":
                    this.iconPath = new vscode.ThemeIcon("pass-filled", COLOR_RUNNING);
                    this.description = `Running${portSuffix}`;
                    this.tooltip = port
                        ? `${label} — Running on http://localhost:${port}`
                        : `${label} — Running`;
                    break;
                case "starting":
                    this.iconPath = new vscode.ThemeIcon("loading~spin", COLOR_STARTING);
                    this.description = `Starting…${portSuffix}`;
                    break;
                case "restarting":
                    this.iconPath = new vscode.ThemeIcon("sync~spin", COLOR_RESTARTING);
                    this.description = `Restarting…${portSuffix}`;
                    break;
                case "error":
                    this.iconPath = new vscode.ThemeIcon("error", COLOR_ERROR);
                    this.description = "Error — click to retry";
                    break;
                case "stopped":
                default:
                    this.iconPath = new vscode.ThemeIcon("circle-outline", COLOR_STOPPED);
                    this.description = port ? `Stopped · :${port}` : "Stopped";
                    break;
            }
            // ── resourceUri enables the FileDecoration (row colour) ───────────────
            if (contextValue) {
                const serverId = contextValue.split(":")[0];
                this.resourceUri = makeServerUri(serverId);
            }
            // ── single-click command ───────────────────────────────────────────────
            if (contextValue) {
                this.command = {
                    command: status === "error"
                        ? "serverRunner.retryServer"
                        : "serverRunner.startDynamicServer",
                    title: status === "error" ? `Retry ${label}` : `Start ${label}`,
                    arguments: [contextValue],
                };
            }
        }
    }
}
exports.ServerItem = ServerItem;
// ── Build item ────────────────────────────────────────────────────────────────
class BuildItem extends vscode.TreeItem {
    constructor(label, projectPath, // relative path from workspace root
    buildStatus = "idle") {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.projectPath = projectPath;
        this.buildStatus = buildStatus;
        this.contextValue = "build-project";
        this.tooltip = `${label} — Build staging + prod`;
        switch (buildStatus) {
            case "building":
                this.iconPath = new vscode.ThemeIcon("loading~spin", new vscode.ThemeColor("editorWarning.foreground"));
                this.description = "Building…";
                break;
            case "done":
                this.iconPath = new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed"));
                this.description = "Built ✓";
                break;
            case "error":
                this.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
                this.description = "Build failed";
                break;
            default: // idle
                this.iconPath = new vscode.ThemeIcon("repo", new vscode.ThemeColor("charts.blue"));
                this.description = projectPath;
                break;
        }
    }
}
exports.BuildItem = BuildItem;
//# sourceMappingURL=serverProvider.js.map