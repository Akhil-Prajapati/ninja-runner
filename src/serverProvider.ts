import * as vscode from "vscode";
import { ServerConfigManager, ServerConfig } from "./serverConfig";

export interface ServerStatus {
  [key: string]: boolean;
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
      this.serverStatus[server.id] = false;
    });
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  updateServerStatus(serverKey: string, isRunning: boolean): void {
    this.serverStatus[serverKey] = isRunning;
    this.refresh();
  }

  getServerStatus(serverKey: string): boolean {
    return this.serverStatus[serverKey] || false;
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
    public readonly isRunning?: boolean
  ) {
    super(label, collapsibleState);

    this.tooltip = this.label;

    if (itemType === "folder") {
      this.iconPath = new vscode.ThemeIcon("folder");
    } else {
      // Dynamic icon based on server status
      if (isRunning) {
        this.iconPath = new vscode.ThemeIcon("circle-filled");
        this.description = "🟢 Running";
      } else {
        this.iconPath = new vscode.ThemeIcon("circle-outline");
        this.description = "🔴 Stopped";
      }

      // Set up single-click command for dynamic servers
      if (contextValue) {
        this.command = {
          command: "serverRunner.startDynamicServer",
          title: `Start ${label}`,
          arguments: [contextValue],
        };
      }
    }
  }
}
