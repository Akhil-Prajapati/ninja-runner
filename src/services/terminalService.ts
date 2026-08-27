import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ServerConfig, ServerStatusValue } from "../types";
import { ConfigService } from "./configService";
import { PortService } from "./portService";

export class TerminalService {
  private static instance: TerminalService;
  private terminals: Map<string, vscode.Terminal> = new Map();
  private startingGracePeriod: Map<string, number> = new Map();
  private onStatusChangeCallbacks: Array<(serverId: string, status: ServerStatusValue) => void> = [];

  private constructor() {
    this.reconnectExistingTerminals();
    this.registerTerminalCloseListener();
  }

  public static getInstance(): TerminalService {
    if (!TerminalService.instance) {
      TerminalService.instance = new TerminalService();
    }
    return TerminalService.instance;
  }

  public onStatusChange(callback: (serverId: string, status: ServerStatusValue) => void): void {
    this.onStatusChangeCallbacks.push(callback);
  }

  private notifyStatusChange(serverId: string, status: ServerStatusValue): void {
    for (const cb of this.onStatusChangeCallbacks) {
      cb(serverId, status);
    }
  }

  /**
   * Reconnects to existing VS Code terminals if the window was reloaded.
   */
  public reconnectExistingTerminals(): void {
    const configService = ConfigService.getInstance();
    const servers = configService.getServers();

    for (const term of vscode.window.terminals) {
      for (const server of servers) {
        if (
          term.name === server.name ||
          term.name === `Ninja: ${server.name}` ||
          term.name === `[Ninja] ${server.name}`
        ) {
          if (term.exitStatus === undefined) {
            this.terminals.set(server.id, term);
          }
        }
      }
    }
  }

  private registerTerminalCloseListener(): void {
    vscode.window.onDidCloseTerminal((closedTerminal) => {
      for (const [serverId, terminal] of this.terminals.entries()) {
        if (terminal === closedTerminal) {
          this.terminals.delete(serverId);
          this.startingGracePeriod.delete(serverId);
          this.notifyStatusChange(serverId, "stopped");
          break;
        }
      }
    });
  }

  public getTerminal(serverId: string): vscode.Terminal | undefined {
    return this.terminals.get(serverId);
  }

  public isServerTerminalActive(serverId: string): boolean {
    const term = this.terminals.get(serverId);
    return !!term && term.exitStatus === undefined;
  }

  /**
   * Starts or restarts a server.
   * Handles restarting in an existing open terminal after Ctrl+C.
   */
  public async startServer(server: ServerConfig): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("No workspace folder open.");
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const projectPath = path.isAbsolute(server.workingDirectory)
      ? server.workingDirectory
      : path.join(workspaceRoot, server.workingDirectory);

    const portService = PortService.getInstance();

    // Prepare clean command
    let executionCommand = server.command;

    // Remove any legacy "cd path &&" or "cd path;" prefix since terminal cwd is set directly!
    executionCommand = this.cleanCommandForDirectCwd(executionCommand);

    // Spring Boot Profile Enforcement: Dynamically inspect application.properties & ensure active profile
    if (server.type === "backend" && (executionCommand.includes("spring-boot:run") || executionCommand.includes("mvn"))) {
      let activeProfile = "dev";

      const appPropsPath = path.join(projectPath, "src", "main", "resources", "application.properties");
      if (fs.existsSync(appPropsPath)) {
        try {
          const content = fs.readFileSync(appPropsPath, "utf8");
          const match = content.match(/^\s*spring\.profiles\.active\s*=\s*([^\s@#]+)/m);
          if (match?.[1]) {
            activeProfile = match[1].trim();
          }
        } catch {}
      }

      if (!activeProfile || activeProfile.includes("@")) {
        activeProfile = "dev";
      }

      // Strip any stale -Dspring-boot.run.profiles=... or -Dspring.profiles.active=...
      executionCommand = executionCommand
        .replace(/-Dspring-boot\.run\.profiles=[^\s]+/g, "")
        .replace(/-Dspring\.profiles\.active=[^\s]+/g, "")
        .trim();

      executionCommand = `${executionCommand} -Dspring-boot.run.profiles=${activeProfile} -Dspring.profiles.active=${activeProfile}`;
    }

    // Check if terminal already exists and is open
    const existingTerminal = this.terminals.get(server.id);

    if (existingTerminal && existingTerminal.exitStatus === undefined) {
      // Check if server is currently active on its port
      const isAlreadyRunning = server.port ? await portService.isPortInUse(server.port) : false;

      if (isAlreadyRunning) {
        existingTerminal.show();
        return;
      }

      // Terminal is alive but server was stopped (e.g. via Ctrl+C) -> RESTART IN EXISTING TERMINAL!
      this.startingGracePeriod.set(server.id, Date.now());
      this.notifyStatusChange(server.id, "starting");
      existingTerminal.show();
      existingTerminal.sendText(executionCommand);
      return;
    }

    // Check if port is already in use before creating new terminal
    if (server.port) {
      const inUse = await portService.isPortInUse(server.port);
      if (inUse) {
        if (server.type === "backend") {
          const choice = await vscode.window.showWarningMessage(
            `Port :${server.port} is already in use. ${server.name} may fail to bind. Free the port first or start anyway?`,
            "Free Port & Start",
            "Start Anyway",
            "Cancel",
          );

          if (choice === "Free Port & Start") {
            await portService.killPortProcess(server.port);
            await new Promise((r) => setTimeout(r, 600));
          } else if (choice !== "Start Anyway") {
            return;
          }
        }
      }
    }

    // Create fresh terminal directly inside the project directory
    const terminal = vscode.window.createTerminal({
      name: `[Ninja] ${server.name}`,
      cwd: projectPath,
    });

    this.terminals.set(server.id, terminal);
    this.startingGracePeriod.set(server.id, Date.now());

    this.notifyStatusChange(server.id, "starting");
    terminal.show();
    terminal.sendText(executionCommand);
  }

  /**
   * Stops a server process gracefully or disposes its terminal.
   */
  public async stopServer(serverId: string): Promise<void> {
    const configService = ConfigService.getInstance();
    const server = configService.getServerById(serverId);
    const terminal = this.terminals.get(serverId);

    if (terminal) {
      terminal.sendText("\u0003"); // Send Ctrl+C
      setTimeout(() => {
        if (terminal.exitStatus === undefined) {
          terminal.dispose();
        }
      }, 800);
      this.terminals.delete(serverId);
    }

    // If port is known, check and ensure process is terminated
    if (server?.port) {
      const portService = PortService.getInstance();
      const inUse = await portService.isPortInUse(server.port);
      if (inUse) {
        await portService.killPortProcess(server.port);
      }
    }

    this.startingGracePeriod.delete(serverId);
    this.notifyStatusChange(serverId, "stopped");
  }

  public async startAllServers(): Promise<void> {
    const configService = ConfigService.getInstance();
    const servers = configService.getServers();
    for (const server of servers) {
      await this.startServer(server);
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  public async stopAllServers(): Promise<void> {
    const configService = ConfigService.getInstance();
    const servers = configService.getServers();
    for (const server of servers) {
      await this.stopServer(server.id);
    }
  }

  public isStartingGracePeriodActive(serverId: string): boolean {
    const startTime = this.startingGracePeriod.get(serverId);
    if (!startTime) {
      return false;
    }
    if (Date.now() - startTime < 15000) {
      return true;
    }
    this.startingGracePeriod.delete(serverId);
    return false;
  }

  /**
   * Cleans legacy "cd ... &&" or "cd ... ;" from commands so they run cleanly in direct CWD.
   */
  private cleanCommandForDirectCwd(command: string): string {
    let cmd = command.trim();
    cmd = cmd.replace(/^cd\s+(?:"[^"]+"|\S+)\s*(?:&&|;)\s*/i, "");
    return cmd;
  }

  public disposeAll(): void {
    for (const term of this.terminals.values()) {
      try {
        term.dispose();
      } catch {}
    }
    this.terminals.clear();
    this.startingGracePeriod.clear();
  }
}
