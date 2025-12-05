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

  getProjectsWithBuildScript(): { name: string; path: string }[] {
    const servers = this.configManager.getServers();
    const projects = new Map<string, string>();

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
      } else if (frontendIndex > 0) {
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
        new ServerItem(
          "🏗️ Build Manager",
          vscode.TreeItemCollapsibleState.Expanded,
          "buildManager",
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
              `${server.id}:frontend`,
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
              `${server.id}:backend`,
              this.getServerStatus(server.id)
            )
        )
      );
    }

    if (element.label === "🏗️ Build Manager") {
      // Get all unique projects that have build.sh
      const buildProjects = this.getProjectsWithBuildScript();
      const projectFolders: ServerItem[] = [];

      buildProjects.forEach((project: { name: string; path: string }) => {
        projectFolders.push(
          new ServerItem(
            `🏗️ ${project.name}`,
            vscode.TreeItemCollapsibleState.Collapsed,
            "buildFolder",
            `buildFolder:${project.path}`,
            undefined,
            project.path
          )
        );
      });

      return Promise.resolve(projectFolders);
    }

    // Check if this is a build folder being expanded
    if (element.itemType === "buildFolder" && element.projectPath) {
      const projectName = element.label?.replace("🏗️ ", "") || "Project";
      return Promise.resolve([
        new ServerItem(
          `🟡 Staging Build`,
          vscode.TreeItemCollapsibleState.None,
          "build",
          `build:staging:${element.projectPath}`,
          undefined,
          undefined,
          projectName
        ),
        new ServerItem(
          `🟠 Beta Build`,
          vscode.TreeItemCollapsibleState.None,
          "build",
          `build:beta:${element.projectPath}`,
          undefined,
          undefined,
          projectName
        ),
        new ServerItem(
          `🔴 Production Build`,
          vscode.TreeItemCollapsibleState.None,
          "build",
          `build:prod:${element.projectPath}`,
          undefined,
          undefined,
          projectName
        ),
      ]);
    }

    return Promise.resolve([]);
  }
}

export class ServerItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType:
      | "folder"
      | "server"
      | "build"
      | "buildFolder"
      | "buildManager",
    public readonly contextValue?: string,
    public readonly status?: "running" | "stopped" | "starting" | "error",
    public readonly projectPath?: string,
    public readonly projectName?: string
  ) {
    super(label, collapsibleState);

    this.tooltip = this.label;

    if (itemType === "folder") {
      this.iconPath = new vscode.ThemeIcon("folder");
    } else if (itemType === "buildManager") {
      // Build Manager root with distinct icon
      this.iconPath = new vscode.ThemeIcon("tools");
    } else if (itemType === "buildFolder") {
      // Project folders in Build Manager - use package icon to differentiate from regular folders
      this.iconPath = new vscode.ThemeIcon("briefcase");
      this.description = "Build Environments";
    } else if (itemType === "build") {
      // Build buttons with distinct colored icons
      const envMatch = label.match(/(Staging|Beta|Production)/);
      const environment = envMatch ? envMatch[1] : "";

      // Different icons with descriptions for each environment
      if (environment === "Staging") {
        this.iconPath = new vscode.ThemeIcon("beaker");
        this.description = `🟡 Test Environment`;
      } else if (environment === "Beta") {
        this.iconPath = new vscode.ThemeIcon("package");
        this.description = `🟠 Pre-Release`;
      } else if (environment === "Production") {
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
