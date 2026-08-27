import * as vscode from "vscode";
import { ServerConfig, ServerStatusValue, BuildStatusValue } from "../types";
import { ConfigService } from "../services/configService";
import { BuildService } from "../services/buildService";

export const NINJA_RUNNER_SCHEME = "ninja-runner";

export function makeServerUri(serverId: string): vscode.Uri {
  return vscode.Uri.parse(`${NINJA_RUNNER_SCHEME}:///${encodeURIComponent(serverId)}`);
}

const COLOR_RUNNING = new vscode.ThemeColor("testing.iconPassed");
const COLOR_STARTING = new vscode.ThemeColor("editorWarning.foreground");
const COLOR_RESTARTING = new vscode.ThemeColor("editorInfo.foreground");
const COLOR_ERROR = new vscode.ThemeColor("testing.iconFailed");
const COLOR_STOPPED = new vscode.ThemeColor("disabledForeground");

export class ServerDecorationProvider implements vscode.FileDecorationProvider {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this._onDidChange.event;
  private statusMap: Map<string, ServerStatusValue> = new Map();

  public update(serverId: string, status: ServerStatusValue): void {
    this.statusMap.set(serverId, status);
    this._onDidChange.fire(makeServerUri(serverId));
  }

  public provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== NINJA_RUNNER_SCHEME) {
      return undefined;
    }

    const serverId = decodeURIComponent(uri.path.slice(1));
    const status = this.statusMap.get(serverId) ?? "stopped";

    switch (status) {
      case "running":
        return { color: COLOR_RUNNING, tooltip: "Running" };
      case "starting":
        return { color: COLOR_STARTING, badge: "…", tooltip: "Starting…" };
      case "restarting":
        return { color: COLOR_RESTARTING, badge: "↺", tooltip: "Restarting…" };
      case "error":
        return { color: COLOR_ERROR, badge: "!", tooltip: "Error — Click to Retry" };
      default:
        return undefined;
    }
  }
}

export class ServerTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private serverStatus: Map<string, ServerStatusValue> = new Map();

  constructor(private decorations: ServerDecorationProvider) {}

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  public updateServerStatus(serverId: string, status: ServerStatusValue): void {
    this.serverStatus.set(serverId, status);
    this.decorations.update(serverId, status);
    this.refresh();
  }

  public getServerStatus(serverId: string): ServerStatusValue {
    return this.serverStatus.get(serverId) ?? "stopped";
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    const configService = ConfigService.getInstance();

    if (!element) {
      return [
        new CategoryItem("Frontend Servers", "folder-frontend", "$(browser)", "charts.blue"),
        new CategoryItem("Backend Servers", "folder-backend", "$(server-process)", "charts.orange"),
        new CategoryItem("Build Manager", "folder-build", "$(package)", "charts.purple"),
      ];
    }

    const ctx = element.contextValue;

    if (ctx === "folder-frontend") {
      const frontends = configService.getServersByType("frontend");
      return frontends.map(
        (s) => new ServerItem(s, this.getServerStatus(s.id)),
      );
    }

    if (ctx === "folder-backend") {
      const backends = configService.getServersByType("backend");
      return backends.map(
        (s) => new ServerItem(s, this.getServerStatus(s.id)),
      );
    }

    if (ctx === "folder-build") {
      return this.getBuildProjects();
    }

    return [];
  }

  private getBuildProjects(): BuildItem[] {
    const configService = ConfigService.getInstance();
    const buildService = BuildService.getInstance();
    const servers = configService.getServers();

    const seen = new Set<string>();
    const items: BuildItem[] = [];

    for (const server of servers) {
      const parts = server.workingDirectory.replace(/\\/g, "/").split("/");
      const projectName = parts.length > 1 ? parts[0] : server.name;

      if (!seen.has(projectName)) {
        seen.add(projectName);
        const status = buildService.getBuildStatus(projectName);
        items.push(new BuildItem(projectName, projectName, status));
      }
    }

    return items;
  }
}

export class CategoryItem extends vscode.TreeItem {
  constructor(
    label: string,
    contextValue: string,
    iconCodicon: string,
    colorToken: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = contextValue;
    this.iconPath = new vscode.ThemeIcon(
      iconCodicon.replace("$", "").replace("(", "").replace(")", ""),
      new vscode.ThemeColor(colorToken),
    );
  }
}

export class ServerItem extends vscode.TreeItem {
  constructor(
    public readonly server: ServerConfig,
    public readonly status: ServerStatusValue,
  ) {
    super(server.name, vscode.TreeItemCollapsibleState.None);

    this.contextValue = `${server.id}:${server.type}`;
    this.resourceUri = makeServerUri(server.id);

    const portSuffix = server.port ? ` · :${server.port}` : "";
    const frameworkSuffix = server.framework ? ` (${server.framework})` : "";

    switch (status) {
      case "running":
        this.iconPath = new vscode.ThemeIcon("pass-filled", COLOR_RUNNING);
        this.description = `Running${portSuffix}`;
        this.tooltip = `${server.name}${frameworkSuffix}\nStatus: Running on port ${server.port ?? "unknown"}\nClick to focus terminal`;
        this.command = {
          command: "serverRunner.startDynamicServer",
          title: `Start ${server.name}`,
          arguments: [this],
        };
        break;

      case "starting":
        this.iconPath = new vscode.ThemeIcon("loading~spin", COLOR_STARTING);
        this.description = `Starting…${portSuffix}`;
        this.tooltip = `${server.name} is starting up…`;
        break;

      case "restarting":
        this.iconPath = new vscode.ThemeIcon("sync~spin", COLOR_RESTARTING);
        this.description = `Restarting…${portSuffix}`;
        this.tooltip = `${server.name} is restarting…`;
        break;

      case "error":
        this.iconPath = new vscode.ThemeIcon("error", COLOR_ERROR);
        this.description = "Failed · Click to retry";
        this.tooltip = `${server.name} exited with error. Click to restart.`;
        this.command = {
          command: "serverRunner.retryServer",
          title: `Retry ${server.name}`,
          arguments: [this],
        };
        break;

      case "stopped":
      default:
        this.iconPath = new vscode.ThemeIcon("circle-outline", COLOR_STOPPED);
        this.description = `Stopped${portSuffix}`;
        this.tooltip = `${server.name}${frameworkSuffix}\nStatus: Stopped\nClick to start`;
        this.command = {
          command: "serverRunner.startDynamicServer",
          title: `Start ${server.name}`,
          arguments: [this],
        };
        break;
    }
  }
}

export class BuildItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly projectPath: string,
    public readonly status: BuildStatusValue = "idle",
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "build-project";
    this.tooltip = `${label} — Build Staging & Prod packages`;

    switch (status) {
      case "building":
        this.iconPath = new vscode.ThemeIcon("loading~spin", new vscode.ThemeColor("editorWarning.foreground"));
        this.description = "Packaging…";
        break;
      case "done":
        this.iconPath = new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed"));
        this.description = "Built ✓";
        break;
      case "error":
        this.iconPath = new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed"));
        this.description = "Build Failed";
        break;
      default:
        this.iconPath = new vscode.ThemeIcon("repo", new vscode.ThemeColor("charts.blue"));
        this.description = projectPath;
        break;
    }
  }
}
