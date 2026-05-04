import * as vscode from "vscode";
import * as path from "path";
import { ServerConfigManager } from "./serverConfig";

export type StatusValue =
  | "running"
  | "stopped"
  | "starting"
  | "error"
  | "restarting";
export type BuildStatusValue = "idle" | "building" | "done" | "error";

export interface ServerStatus {
  [key: string]: StatusValue;
}

// ── Color tokens (VS Code ≥ 1.58) ────────────────────────────────────────────
const COLOR_RUNNING = new vscode.ThemeColor("testing.iconPassed"); // green
const COLOR_STARTING = new vscode.ThemeColor("editorWarning.foreground"); // yellow/orange
const COLOR_RESTARTING = new vscode.ThemeColor("editorInfo.foreground"); // blue
const COLOR_ERROR = new vscode.ThemeColor("testing.iconFailed"); // red
const COLOR_STOPPED = new vscode.ThemeColor("disabledForeground"); // muted grey

// ── URI scheme used for FileDecoration (colors the label text row) ───────────
export const NINJA_RUNNER_SCHEME = "ninja-runner";

export function makeServerUri(serverId: string): vscode.Uri {
  // encode serverId in the path so the decoration provider can retrieve it
  return vscode.Uri.parse(
    `${NINJA_RUNNER_SCHEME}:///${encodeURIComponent(serverId)}`,
  );
}

// ── FileDecorationProvider — tints the entire tree-item row ──────────────────
//
//  VS Code calls provideFileDecoration() for every tree item that has
//  resourceUri set.  We return a ThemeColor that tints the label text,
//  making the running/stopped/error state immediately obvious even when
//  the icon is small.
//
export class ServerDecorationProvider implements vscode.FileDecorationProvider {
  private readonly _onDidChange = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[] | undefined
  >();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  private statusMap: ServerStatus = {};

  /** Called by ServerRunnerProvider whenever a server's status changes. */
  update(serverId: string, status: StatusValue): void {
    this.statusMap[serverId] = status;
    this._onDidChange.fire(makeServerUri(serverId));
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== NINJA_RUNNER_SCHEME) {
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

// ── Tree data provider ────────────────────────────────────────────────────────
export class ServerRunnerProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private serverStatus: ServerStatus = {};
  private configManager: ServerConfigManager;
  private decorations: ServerDecorationProvider;
  private buildStatus: { [projectPath: string]: BuildStatusValue } = {};

  constructor(decorations: ServerDecorationProvider) {
    this.configManager = ServerConfigManager.getInstance();
    this.decorations = decorations;
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

  updateServerStatus(serverKey: string, status: StatusValue): void {
    this.serverStatus[serverKey] = status;
    this.decorations.update(serverKey, status); // update label colour
    this.refresh();
  }

  getServerStatus(serverKey: string): StatusValue {
    return this.serverStatus[serverKey] ?? "stopped";
  }

  isServerRunning(serverKey: string): boolean {
    return this.serverStatus[serverKey] === "running";
  }

  updateBuildStatus(projectPath: string, status: BuildStatusValue): void {
    this.buildStatus[projectPath] = status;
    this.refresh();
  }

  getBuildStatus(projectPath: string): BuildStatusValue {
    return this.buildStatus[projectPath] ?? "idle";
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
    if (!element) {
      return Promise.resolve([
        new ServerItem(
          "Frontend Servers",
          vscode.TreeItemCollapsibleState.Expanded,
          "folder",
          "folder-frontend",
        ),
        new ServerItem(
          "Backend Servers",
          vscode.TreeItemCollapsibleState.Expanded,
          "folder",
          "folder-backend",
        ),
        new ServerItem(
          "Build Manager",
          vscode.TreeItemCollapsibleState.Expanded,
          "folder",
          "folder-build",
        ),
      ]);
    }

    const ctx = (element as ServerItem).contextValue;

    if (ctx === "folder-frontend") {
      const servers =
        this.configManager.getServersByCategory("Frontend Servers");
      return Promise.resolve(
        servers.map(
          (s) =>
            new ServerItem(
              s.name,
              vscode.TreeItemCollapsibleState.None,
              "server",
              `${s.id}:frontend`,
              this.getServerStatus(s.id),
              s.port,
            ),
        ),
      );
    }

    if (ctx === "folder-backend") {
      const servers =
        this.configManager.getServersByCategory("Backend Servers");
      return Promise.resolve(
        servers.map(
          (s) =>
            new ServerItem(
              s.name,
              vscode.TreeItemCollapsibleState.None,
              "server",
              `${s.id}:backend`,
              this.getServerStatus(s.id),
              s.port,
            ),
        ),
      );
    }

    if (ctx === "folder-build") {
      return this.scanBuildProjects();
    }

    return Promise.resolve([]);
  }

  private async scanBuildProjects(): Promise<BuildItem[]> {
    // Only show projects whose servers are already configured
    // (same set the user selected during auto-detect).
    // workingDirectory is like "Auth/frontend" or "Auth/backend" —
    // take the first path segment as the project name.
    const servers = this.configManager.getServers();
    const seen = new Set<string>();
    const items: BuildItem[] = [];

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

      items.push(
        new BuildItem(
          projectName,
          projectName,
          this.buildStatus[projectName] ?? "idle",
        ),
      );
    }

    return items;
  }
}

// ── Tree item ─────────────────────────────────────────────────────────────────
export class ServerItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly itemType: "folder" | "server",
    public readonly contextValue?: string,
    public readonly status?: StatusValue,
    public readonly port?: number,
  ) {
    super(label, collapsibleState);

    this.tooltip = this.label;

    if (itemType === "folder") {
      if (contextValue === "folder-frontend") {
        this.iconPath = new vscode.ThemeIcon(
          "browser",
          new vscode.ThemeColor("charts.blue"),
        );
      } else if (contextValue === "folder-build") {
        this.iconPath = new vscode.ThemeIcon(
          "package",
          new vscode.ThemeColor("charts.purple"),
        );
      } else {
        this.iconPath = new vscode.ThemeIcon(
          "server",
          new vscode.ThemeColor("charts.orange"),
        );
      }
    } else {
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
          command:
            status === "error"
              ? "serverRunner.retryServer"
              : "serverRunner.startDynamicServer",
          title: status === "error" ? `Retry ${label}` : `Start ${label}`,
          arguments: [contextValue],
        };
      }
    }
  }
}

// ── Build item ────────────────────────────────────────────────────────────────
export class BuildItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly projectPath: string, // relative path from workspace root
    public readonly buildStatus: BuildStatusValue = "idle",
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "build-project";
    this.tooltip = `${label} — Build staging + prod`;

    switch (buildStatus) {
      case "building":
        this.iconPath = new vscode.ThemeIcon(
          "loading~spin",
          new vscode.ThemeColor("editorWarning.foreground"),
        );
        this.description = "Building…";
        break;
      case "done":
        this.iconPath = new vscode.ThemeIcon(
          "pass-filled",
          new vscode.ThemeColor("testing.iconPassed"),
        );
        this.description = "Built ✓";
        break;
      case "error":
        this.iconPath = new vscode.ThemeIcon(
          "error",
          new vscode.ThemeColor("testing.iconFailed"),
        );
        this.description = "Build failed";
        break;
      default: // idle
        this.iconPath = new vscode.ThemeIcon(
          "repo",
          new vscode.ThemeColor("charts.blue"),
        );
        this.description = projectPath;
        break;
    }
  }
}
