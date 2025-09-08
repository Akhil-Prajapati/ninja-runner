import * as vscode from "vscode";
import { ServerConfigManager, ServerConfig } from "./serverConfig";

export interface ServerStatus {
  [key: string]: "running" | "stopped" | "starting" | "error";
}

export class ServerRunnerProvider
  implements vscode.TreeDataProvider<ServerItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    ServerItem | undefined | null | void
  > = new vscode.EventEmitter<ServerItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    ServerItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  private serverStatus: ServerStatus = {};
  private configManager: ServerConfigManager;

  constructor() {
    this.configManager = ServerConfigManager.getInstance();
    this.initializeServerStatus();
  }

  private initializeServerStatus(): void {
    const servers = this.configManager.getServers();
    servers.forEach((server) => {
      this.serverStatus[server.id] = "stopped";
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateServerStatus(
    serverKey: string,
    status: "running" | "stopped" | "starting" | "error"
  ): void {
    this.serverStatus[serverKey] = status;
    this.refresh();
  }

  getServerStatus(
    serverKey: string
  ): "running" | "stopped" | "starting" | "error" {
    return this.serverStatus[serverKey] || "stopped";
  }

  isServerRunning(serverKey: string): boolean {
    return this.serverStatus[serverKey] === "running";
  }

  getTreeItem(element: ServerItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ServerItem): Thenable<ServerItem[]> {
    if (!element) {
      // Root items
      return Promise.resolve([
        new ServerItem(
          "⚡ Frontend Servers",
          vscode.TreeItemCollapsibleState.Expanded,
          "folder",
          undefined
        ),
        new ServerItem(
          "🥷 Backend Servers",
          vscode.TreeItemCollapsibleState.Expanded,
          "folder",
          undefined
        ),
      ]);
    }

    if (element.label === "⚡ Frontend Servers") {
      const frontendServers =
        this.configManager.getServersByCategory("Frontend Servers");
      return Promise.resolve(
        frontendServers.map(
          (server) =>
            new ServerItem(
              `🅵 ${server.name}`,
              vscode.TreeItemCollapsibleState.None,
              "server",
              server.id,
              this.getServerStatus(server.id)
            )
        )
      );
    }

    if (element.label === "🥷 Backend Servers") {
      const backendServers =
        this.configManager.getServersByCategory("Backend Servers");
      return Promise.resolve(
        backendServers.map(
          (server) =>
            new ServerItem(
              `🅱️ ${server.name}`,
              vscode.TreeItemCollapsibleState.None,
              "server",
              server.id,
              this.getServerStatus(server.id)
            )
        )
      );
    }

    return Promise.resolve([]);
  }
}

export class ServerItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: "folder" | "server",
    public readonly contextValue?: string,
    public readonly status?: "running" | "stopped" | "starting" | "error"
  ) {
    super(label, collapsibleState);

    this.tooltip = this.label;

    if (itemType === "folder") {
      this.iconPath = new vscode.ThemeIcon("folder");
    } else {
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
        } else {
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
