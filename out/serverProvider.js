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
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (!element) {
            // Root items
            return Promise.resolve([
                new ServerItem("⚡ Frontend Servers", vscode.TreeItemCollapsibleState.Expanded, "folder", undefined),
                new ServerItem("🥷 Backend Servers", vscode.TreeItemCollapsibleState.Expanded, "folder", undefined),
            ]);
        }
        if (element.label === "⚡ Frontend Servers") {
            const frontendServers = this.configManager.getServersByCategory("Frontend Servers");
            return Promise.resolve(frontendServers.map((server) => new ServerItem(`🅵 ${server.name}`, vscode.TreeItemCollapsibleState.None, "server", server.id, this.getServerStatus(server.id))));
        }
        if (element.label === "🥷 Backend Servers") {
            const backendServers = this.configManager.getServersByCategory("Backend Servers");
            return Promise.resolve(backendServers.map((server) => new ServerItem(`🅱️ ${server.name}`, vscode.TreeItemCollapsibleState.None, "server", server.id, this.getServerStatus(server.id))));
        }
        return Promise.resolve([]);
    }
}
exports.ServerRunnerProvider = ServerRunnerProvider;
class ServerItem extends vscode.TreeItem {
    constructor(label, collapsibleState, itemType, contextValue, status) {
        super(label, collapsibleState);
        this.label = label;
        this.collapsibleState = collapsibleState;
        this.itemType = itemType;
        this.contextValue = contextValue;
        this.status = status;
        this.tooltip = this.label;
        if (itemType === "folder") {
            this.iconPath = new vscode.ThemeIcon("folder");
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