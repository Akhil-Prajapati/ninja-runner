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
exports.ServerItem = exports.ServerRunnerProvider = void 0;
const vscode = __importStar(require("vscode"));
const serverConfig_1 = require("./serverConfig");
class ServerRunnerProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.serverStatus = {};
        this.configManager = serverConfig_1.ServerConfigManager.getInstance();
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
        this.refresh();
    }
    getServerStatus(serverKey) {
        return this.serverStatus[serverKey] || "stopped";
    }
    isServerRunning(serverKey) {
        return this.serverStatus[serverKey] === "running";
    }
    getProjectsWithBuildScript() {
        const servers = this.configManager.getServers();
        const projects = new Map();
        // Group servers by their parent project directory
        servers.forEach((server) => {
            const workingDir = server.workingDirectory;
            // Try to find the project root (parent of backend/frontend)
            const parts = workingDir.split(/[\/\\]/);
            // Look for common project patterns
            let projectRoot = "";
            let projectName = "";
            // Check if path contains backend or frontend
            const backendIndex = parts.findIndex((p) => p === "backend");
            const frontendIndex = parts.findIndex((p) => p === "frontend");
            if (backendIndex > 0) {
                // Project root is parent of backend folder
                projectRoot = parts.slice(0, backendIndex).join("/");
                projectName = parts[backendIndex - 1];
            }
            else if (frontendIndex > 0) {
                // Project root is parent of frontend folder
                projectRoot = parts.slice(0, frontendIndex).join("/");
                projectName = parts[frontendIndex - 1];
            }
            if (projectRoot && projectName && !projects.has(projectName)) {
                projects.set(projectName, projectRoot);
            }
        });
        return Array.from(projects.entries()).map(([name, path]) => ({
            name,
            path,
        }));
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            // Root items
            return Promise.resolve([
                new ServerItem("⚡ Frontend Servers", vscode.TreeItemCollapsibleState.Expanded, "folder", undefined),
                new ServerItem("🥷 Backend Servers", vscode.TreeItemCollapsibleState.Expanded, "folder", undefined),
                new ServerItem("🏗️ Build Manager", vscode.TreeItemCollapsibleState.Expanded, "buildManager", undefined),
            ]);
        }
        if (element.label === "⚡ Frontend Servers") {
            const frontendServers = this.configManager.getServersByCategory("Frontend Servers");
            return Promise.resolve(frontendServers.map((server) => new ServerItem(`🅵 ${server.name}`, vscode.TreeItemCollapsibleState.None, "server", `${server.id}:frontend`, this.getServerStatus(server.id))));
        }
        if (element.label === "🥷 Backend Servers") {
            const backendServers = this.configManager.getServersByCategory("Backend Servers");
            return Promise.resolve(backendServers.map((server) => new ServerItem(`🅱️ ${server.name}`, vscode.TreeItemCollapsibleState.None, "server", `${server.id}:backend`, this.getServerStatus(server.id))));
        }
        if (element.label === "🏗️ Build Manager") {
            // Get all unique projects that have build.sh
            const buildProjects = this.getProjectsWithBuildScript();
            const projectFolders = [];
            buildProjects.forEach((project) => {
                projectFolders.push(new ServerItem(`🏗️ ${project.name}`, vscode.TreeItemCollapsibleState.Collapsed, "buildFolder", `buildFolder:${project.path}`, undefined, project.path));
            });
            return Promise.resolve(projectFolders);
        }
        // Check if this is a build folder being expanded
        if (element.itemType === "buildFolder" && element.projectPath) {
            const projectName = element.label?.replace("🏗️ ", "") || "Project";
            return Promise.resolve([
                new ServerItem(`🟡 Staging Build`, vscode.TreeItemCollapsibleState.None, "build", `build:staging:${element.projectPath}`, undefined, undefined, projectName),
                new ServerItem(`🟠 Beta Build`, vscode.TreeItemCollapsibleState.None, "build", `build:beta:${element.projectPath}`, undefined, undefined, projectName),
                new ServerItem(`🔴 Production Build`, vscode.TreeItemCollapsibleState.None, "build", `build:prod:${element.projectPath}`, undefined, undefined, projectName),
            ]);
        }
        return Promise.resolve([]);
    }
}
exports.ServerRunnerProvider = ServerRunnerProvider;
class ServerItem extends vscode.TreeItem {
    constructor(label, collapsibleState, itemType, contextValue, status, projectPath, projectName) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.itemType = itemType;
        this.contextValue = contextValue;
        this.status = status;
        this.projectPath = projectPath;
        this.projectName = projectName;
        this.tooltip = this.label;
        if (itemType === "folder") {
            this.iconPath = new vscode.ThemeIcon("folder");
        }
        else if (itemType === "buildManager") {
            // Build Manager root with distinct icon
            this.iconPath = new vscode.ThemeIcon("tools");
        }
        else if (itemType === "buildFolder") {
            // Project folders in Build Manager - use package icon to differentiate from regular folders
            this.iconPath = new vscode.ThemeIcon("briefcase");
            this.description = "Build Environments";
        }
        else if (itemType === "build") {
            // Build buttons with distinct colored icons
            const envMatch = label.match(/(Staging|Beta|Production)/);
            const environment = envMatch ? envMatch[1] : "";
            // Different icons with descriptions for each environment
            if (environment === "Staging") {
                this.iconPath = new vscode.ThemeIcon("beaker");
                this.description = `🟡 Test Environment`;
            }
            else if (environment === "Beta") {
                this.iconPath = new vscode.ThemeIcon("package");
                this.description = `🟠 Pre-Release`;
            }
            else if (environment === "Production") {
                this.iconPath = new vscode.ThemeIcon("rocket");
                this.description = `🔴 Live Deploy`;
            }
            // Set up single-click command for build buttons
            if (contextValue) {
                this.command = {
                    command: "serverRunner.triggerBuild",
                    title: `Trigger ${label}`,
                    arguments: [contextValue],
                };
            }
        }
        else {
            // Dynamic icon based on server status
            switch (status) {
                case "running":
                    this.iconPath = new vscode.ThemeIcon("circle-filled");
                    this.description = "🟢 Running";
                    break;
                case "starting":
                    this.iconPath = new vscode.ThemeIcon("loading~spin");
                    this.description = "🟡 Starting";
                    break;
                case "error":
                    this.iconPath = new vscode.ThemeIcon("error");
                    this.description = "🔴 Error";
                    break;
                case "stopped":
                default:
                    this.iconPath = new vscode.ThemeIcon("circle-outline");
                    this.description = "🔴 Stopped";
                    break;
            }
            // Set up single-click command for dynamic servers based on status
            if (contextValue) {
                if (status === "error") {
                    this.command = {
                        command: "serverRunner.retryServer",
                        title: `Retry ${label}`,
                        arguments: [contextValue],
                    };
                }
                else {
                    this.command = {
                        command: "serverRunner.startDynamicServer",
                        title: `Start ${label}`,
                        arguments: [contextValue],
                    };
                }
            }
        }
    }
}
exports.ServerItem = ServerItem;
//# sourceMappingURL=serverProvider.js.map