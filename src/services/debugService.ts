import * as vscode from "vscode";
import * as path from "path";
import { ServerConfig } from "../types";
import { TerminalService } from "./terminalService";

export class DebugService {
  private static instance: DebugService;
  private nextJavaPort = 5005;
  private nextNodePort = 9229;
  private debugSessions: Map<string, vscode.DebugSession> = new Map();

  private constructor() {}

  public static getInstance(): DebugService {
    if (!DebugService.instance) {
      DebugService.instance = new DebugService();
    }
    return DebugService.instance;
  }

  public async runInDebug(server: ServerConfig): Promise<void> {
    if (server.type !== "backend") {
      vscode.window.showWarningMessage("Debug mode is only supported for backend servers.");
      return;
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const projectPath = path.isAbsolute(server.workingDirectory)
      ? server.workingDirectory
      : path.join(workspaceRoot, server.workingDirectory);

    // Stop existing server if running
    const terminalService = TerminalService.getInstance();
    await terminalService.stopServer(server.id);
    await new Promise((r) => setTimeout(r, 600));

    const isSpringBoot = server.framework?.includes("Spring") || server.command.includes("spring-boot");

    if (isSpringBoot) {
      const debugPort = this.nextJavaPort++;
      const debugCmd = `mvn spring-boot:run -Dspring-boot.run.profiles=dev -Dspring.profiles.active=dev -Dspring-boot.run.jvmArguments="-Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=*:${debugPort}"`;

      const terminal = vscode.window.createTerminal({
        name: `[Debug] ${server.name}`,
        cwd: projectPath,
      });

      terminal.show();
      terminal.sendText(debugCmd);

      // Wait a few seconds for JVM to bind debug port, then attach
      setTimeout(async () => {
        const debugConfig: vscode.DebugConfiguration = {
          type: "java",
          name: `Attach Java: ${server.name}`,
          request: "attach",
          hostName: "localhost",
          port: debugPort,
        };
        const started = await vscode.debug.startDebugging(undefined, debugConfig);
        if (started && vscode.debug.activeDebugSession) {
          this.debugSessions.set(server.id, vscode.debug.activeDebugSession);
        }
      }, 5000);
    } else {
      // Node.js backend
      const debugPort = this.nextNodePort++;
      const debugCmd = `node --inspect=${debugPort} index.js`;

      const terminal = vscode.window.createTerminal({
        name: `[Debug] ${server.name}`,
        cwd: projectPath,
      });

      terminal.show();
      terminal.sendText(debugCmd);

      setTimeout(async () => {
        const debugConfig: vscode.DebugConfiguration = {
          type: "node",
          name: `Attach Node: ${server.name}`,
          request: "attach",
          port: debugPort,
          restart: true,
        };
        const started = await vscode.debug.startDebugging(undefined, debugConfig);
        if (started && vscode.debug.activeDebugSession) {
          this.debugSessions.set(server.id, vscode.debug.activeDebugSession);
        }
      }, 2000);
    }
  }

  public dispose(): void {
    for (const session of this.debugSessions.values()) {
      vscode.debug.stopDebugging(session);
    }
    this.debugSessions.clear();
  }
}
