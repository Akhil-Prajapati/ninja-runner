import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { ConfigService } from "../services/configService";
import { TerminalService } from "../services/terminalService";
import { ProjectDetector } from "../services/projectDetector";
import { PortService } from "../services/portService";
import { BuildService } from "../services/buildService";
import { DebugService } from "../services/debugService";
import { ServerTreeProvider, ServerItem, BuildItem } from "../providers/serverTreeProvider";
import { TodayTreeProvider } from "../providers/todayTreeProvider";
import { DinoGameService } from "../services/dinoGameService";

export function registerAllCommands(
  context: vscode.ExtensionContext,
  serverProvider: ServerTreeProvider,
  todayProvider: TodayTreeProvider,
): void {
  const configService = ConfigService.getInstance();
  const terminalService = TerminalService.getInstance();
  const projectDetector = ProjectDetector.getInstance();
  const portService = PortService.getInstance();
  const buildService = BuildService.getInstance();
  const debugService = DebugService.getInstance();

  // Helper to extract serverId
  function resolveServerId(itemOrArg: any): string | undefined {
    if (itemOrArg instanceof ServerItem) {
      return itemOrArg.server.id;
    }
    if (typeof itemOrArg === "string") {
      return itemOrArg.split(":")[0];
    }
    if (itemOrArg?.server?.id) {
      return itemOrArg.server.id;
    }
    return undefined;
  }

  // ── Auto-Detect Projects ───────────────────────────────────────────────────
  const autoDetectCommand = vscode.commands.registerCommand(
    "serverRunner.autoDetectProjects",
    async () => {
      const detected = await projectDetector.scanWorkspace();
      if (detected.length === 0) {
        vscode.window.showWarningMessage(
          "No projects found in workspace. Make sure package.json or pom.xml files are present.",
        );
        return;
      }

      const selected = await projectDetector.promptUserSelection(detected);
      if (selected && selected.length > 0) {
        const configs = selected.map((p) => projectDetector.createServerConfig(p));
        configService.setServers(configs);
        serverProvider.refresh();
        todayProvider.refresh();
        vscode.window.setStatusBarMessage(`$(check) Ninja Runner configured ${configs.length} projects`, 3000);
      }
    },
  );

  // ── Start / Stop All ───────────────────────────────────────────────────────
  const startAllCommand = vscode.commands.registerCommand("serverRunner.startAllServers", async () => {
    await terminalService.startAllServers();
    vscode.window.setStatusBarMessage("$(play) Started all Ninja servers", 3000);
  });

  const stopAllCommand = vscode.commands.registerCommand("serverRunner.stopAllServers", async () => {
    await terminalService.stopAllServers();
    vscode.window.setStatusBarMessage("$(stop) Stopped all Ninja servers", 3000);
  });

  // ── Single Server Start / Stop / Retry ─────────────────────────────────────
  const startServerCommand = vscode.commands.registerCommand(
    "serverRunner.startDynamicServer",
    async (itemOrArg: any) => {
      const serverId = resolveServerId(itemOrArg);
      if (!serverId) {
        return;
      }
      const server = configService.getServerById(serverId);
      if (server) {
        await terminalService.startServer(server);
      }
    },
  );

  const stopServerCommand = vscode.commands.registerCommand(
    "serverRunner.stopServer",
    async (itemOrArg: any) => {
      const serverId = resolveServerId(itemOrArg);
      if (!serverId) {
        return;
      }
      await terminalService.stopServer(serverId);
    },
  );

  const retryServerCommand = vscode.commands.registerCommand(
    "serverRunner.retryServer",
    async (itemOrArg: any) => {
      const serverId = resolveServerId(itemOrArg);
      if (!serverId) {
        return;
      }
      const server = configService.getServerById(serverId);
      if (server) {
        await terminalService.stopServer(serverId);
        await new Promise((r) => setTimeout(r, 600));
        await terminalService.startServer(server);
      }
    },
  );

  // ── Debug Server ───────────────────────────────────────────────────────────
  const runInDebugCommand = vscode.commands.registerCommand(
    "serverRunner.runInDebug",
    async (itemOrArg: any) => {
      const serverId = resolveServerId(itemOrArg);
      if (!serverId) {
        return;
      }
      const server = configService.getServerById(serverId);
      if (server) {
        await debugService.runInDebug(server);
      }
    },
  );

  // ── Open in Browser ────────────────────────────────────────────────────────
  const openInBrowserCommand = vscode.commands.registerCommand(
    "serverRunner.openInBrowser",
    async (itemOrArg: any) => {
      const serverId = resolveServerId(itemOrArg);
      if (!serverId) {
        return;
      }
      const server = configService.getServerById(serverId);
      if (!server || !server.port) {
        vscode.window.showWarningMessage(`No port detected for ${server?.name ?? "server"}`);
        return;
      }
      const uri = vscode.Uri.parse(`http://localhost:${server.port}`);
      vscode.env.openExternal(uri);
    },
  );

  // ── Universal Port Kill Switch ─────────────────────────────────────────────
  const killPortCommand = vscode.commands.registerCommand("serverRunner.killPort", async () => {
    await portService.promptKillCustomPort();
    todayProvider.refresh();
  });

  const freeSpecificPortCommand = vscode.commands.registerCommand(
    "serverRunner.freeSpecificPort",
    async (port: number) => {
      if (typeof port === "number") {
        const result = await portService.killPortProcess(port);
        if (result.success) {
          vscode.window.setStatusBarMessage(`$(check) ${result.message}`, 3000);
        } else {
          vscode.window.showErrorMessage(result.message);
        }
        todayProvider.refresh();
      }
    },
  );

  // ── Build Manager Commands ─────────────────────────────────────────────────
  const buildProjectCommand = vscode.commands.registerCommand(
    "serverRunner.buildProject",
    async (item: BuildItem) => {
      if (item?.projectPath) {
        await buildService.runBuild(item.projectPath, "both");
      }
    },
  );

  const buildStagingCommand = vscode.commands.registerCommand(
    "serverRunner.buildProjectStaging",
    async (item: BuildItem) => {
      if (item?.projectPath) {
        await buildService.runBuild(item.projectPath, "staging");
      }
    },
  );

  const buildProdCommand = vscode.commands.registerCommand(
    "serverRunner.buildProjectProd",
    async (item: BuildItem) => {
      if (item?.projectPath) {
        await buildService.runBuild(item.projectPath, "prod");
      }
    },
  );

  // ── Reset & Reconfigure ────────────────────────────────────────────────────
  const resetConfigCommand = vscode.commands.registerCommand(
    "serverRunner.resetConfiguration",
    async () => {
      vscode.commands.executeCommand("serverRunner.autoDetectProjects");
    },
  );

  const clearAllSelectionsCommand = vscode.commands.registerCommand(
    "serverRunner.clearAllSelections",
    async () => {
      const confirm = await vscode.window.showWarningMessage(
        "Clear all server selections and preferences?",
        { modal: true },
        "Yes, Clear All",
      );

      if (confirm === "Yes, Clear All") {
        configService.clearAllServers();
        serverProvider.refresh();
        todayProvider.refresh();
        vscode.window.showInformationMessage("Ninja Runner selections cleared.");
      }
    },
  );

  // ── Dependencies ───────────────────────────────────────────────────────────
  const installDepsCommand = vscode.commands.registerCommand(
    "serverRunner.installDependencies",
    async (itemOrArg: any) => {
      const serverId = resolveServerId(itemOrArg);
      if (!serverId) {
        return;
      }
      const server = configService.getServerById(serverId);
      if (!server) {
        return;
      }

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        return;
      }
      const projectPath = path.isAbsolute(server.workingDirectory)
        ? server.workingDirectory
        : path.join(workspaceFolders[0].uri.fsPath, server.workingDirectory);

      const cmd = server.type === "backend" ? "mvn clean install" : "npm install";
      const term = vscode.window.createTerminal({
        name: `[Ninja Install] ${server.name}`,
        cwd: projectPath,
      });
      term.show();
      term.sendText(cmd);
    },
  );

  const installAllDepsCommand = vscode.commands.registerCommand(
    "serverRunner.installAllDependencies",
    async () => {
      const servers = configService.getServers();
      for (const server of servers) {
        vscode.commands.executeCommand("serverRunner.installDependencies", server.id);
        await new Promise((r) => setTimeout(r, 600));
      }
    },
  );

  // ── Refresh ────────────────────────────────────────────────────────────────
  const refreshCommand = vscode.commands.registerCommand("serverRunner.refresh", () => {
    serverProvider.refresh();
    todayProvider.refresh();
  });

  const refreshInfoCommand = vscode.commands.registerCommand(
    "serverRunner.refreshInfoPanel",
    () => {
      todayProvider.refresh();
    },
  );

  // ── View Focus ─────────────────────────────────────────────────────────────
  const showViewCommand = vscode.commands.registerCommand("serverRunner.showView", () => {
    vscode.commands.executeCommand("workbench.view.extension.serverRunner");
  });

  const focusCommand = vscode.commands.registerCommand("serverRunnerView.focus", () => {
    vscode.commands.executeCommand("workbench.view.extension.serverRunner");
  });

  // ── Play Dino Game ────────────────────────────────────────────────────────
  const openDinoGameCommand = vscode.commands.registerCommand("serverRunner.openDinoGame", () => {
    const dinoService = DinoGameService.getInstance();
    dinoService.openGame(context);
  });

  context.subscriptions.push(
    autoDetectCommand,
    startAllCommand,
    stopAllCommand,
    startServerCommand,
    stopServerCommand,
    retryServerCommand,
    runInDebugCommand,
    openInBrowserCommand,
    killPortCommand,
    freeSpecificPortCommand,
    buildProjectCommand,
    buildStagingCommand,
    buildProdCommand,
    resetConfigCommand,
    clearAllSelectionsCommand,
    installDepsCommand,
    installAllDepsCommand,
    refreshCommand,
    refreshInfoCommand,
    showViewCommand,
    focusCommand,
    openDinoGameCommand,
  );
}
