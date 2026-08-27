import * as vscode from "vscode";
import { ConfigService } from "./services/configService";
import { TerminalService } from "./services/terminalService";
import { PortService } from "./services/portService";
import { BuildService } from "./services/buildService";
import { DebugService } from "./services/debugService";
import { ProjectDetector } from "./services/projectDetector";
import { ServerTreeProvider, ServerDecorationProvider } from "./providers/serverTreeProvider";
import { TodayTreeProvider } from "./providers/todayTreeProvider";
import { registerAllCommands } from "./commands";

let statusBarItem: vscode.StatusBarItem;
let monitoringInterval: NodeJS.Timeout | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log("🥷 Ninja Runner v0.3.0 activated!");

  // 1. Initialize Services
  const configService = ConfigService.getInstance();
  configService.initialize(context);

  const terminalService = TerminalService.getInstance();
  const buildService = BuildService.getInstance();
  const debugService = DebugService.getInstance();

  // 2. Set Context for View Visibility
  vscode.commands.executeCommand("setContext", "serverRunnerEnabled", true);

  // 3. Register Providers
  const decorationProvider = new ServerDecorationProvider();
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorationProvider),
  );

  const serverProvider = new ServerTreeProvider(decorationProvider);
  vscode.window.registerTreeDataProvider("serverRunnerView", serverProvider);

  const todayProvider = new TodayTreeProvider();
  vscode.window.registerTreeDataProvider("ninjaInfoView", todayProvider);

  // 4. Register Commands
  registerAllCommands(context, serverProvider, todayProvider);

  // 5. Connect Status Change Callbacks
  terminalService.onStatusChange((serverId, status) => {
    serverProvider.updateServerStatus(serverId, status);
    updateStatusBar();
    todayProvider.refresh();
  });

  buildService.onBuildStatusChange(() => {
    serverProvider.refresh();
  });

  // 6. Setup Status Bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.command = "serverRunner.showView";
  statusBarItem.tooltip = "Click to open Ninja Runner";
  context.subscriptions.push(statusBarItem);
  statusBarItem.show();

  // 7. Initial State Reconciliation
  await reconcileServerStates(serverProvider);
  updateStatusBar();

  // 8. Start Real-time Health Polling (Detects Ctrl+C, Port Closing, Startup)
  startHealthMonitoring(serverProvider);

  // 9. Auto-detect on first activation if no servers configured
  if (configService.getServers().length === 0) {
    setTimeout(async () => {
      const detector = ProjectDetector.getInstance();
      const detected = await detector.scanWorkspace();
      if (detected.length > 0) {
        const configs = detected.map((p) => detector.createServerConfig(p));
        configService.setServers(configs);
        await reconcileServerStates(serverProvider);
        serverProvider.refresh();
        todayProvider.refresh();
        updateStatusBar();
      }
    }, 1200);
  }
}

/**
 * Reconciles server running state across VS Code / extension reload.
 * Strictly checks if this specific server's terminal is active before probing ports.
 */
async function reconcileServerStates(serverProvider: ServerTreeProvider): Promise<void> {
  const configService = ConfigService.getInstance();
  const portService = PortService.getInstance();
  const terminalService = TerminalService.getInstance();
  const servers = configService.getServers();

  terminalService.reconnectExistingTerminals();

  for (const server of servers) {
    const isTerminalActive = terminalService.isServerTerminalActive(server.id);

    if (isTerminalActive) {
      if (server.port) {
        const inUse = await portService.isPortInUse(server.port);
        serverProvider.updateServerStatus(server.id, inUse ? "running" : "stopped");
      } else {
        serverProvider.updateServerStatus(server.id, "running");
      }
    } else {
      // No active terminal registered for this server -> strictly stopped
      serverProvider.updateServerStatus(server.id, "stopped");
    }
  }
}

/**
 * Real-time monitoring: Checks TCP port listening and terminal activity.
 * Bound to individual server terminals to avoid marking all frontends as running when one starts.
 * Immediately transitions server to 'stopped' when Ctrl+C is pressed in terminal!
 */
function startHealthMonitoring(serverProvider: ServerTreeProvider): void {
  const configService = ConfigService.getInstance();
  const portService = PortService.getInstance();
  const terminalService = TerminalService.getInstance();

  monitoringInterval = setInterval(async () => {
    const servers = configService.getServers();

    for (const server of servers) {
      const isTerminalActive = terminalService.isServerTerminalActive(server.id);
      const currentStatus = serverProvider.getServerStatus(server.id);

      // If server does NOT have an active terminal in this session, it must be stopped!
      if (!isTerminalActive) {
        if (currentStatus !== "stopped") {
          serverProvider.updateServerStatus(server.id, "stopped");
        }
        continue;
      }

      // This server HAS an active terminal started by Ninja Runner
      if (terminalService.isStartingGracePeriodActive(server.id)) {
        if (server.port) {
          const inUse = await portService.isPortInUse(server.port);
          if (inUse && currentStatus !== "running") {
            serverProvider.updateServerStatus(server.id, "running");
          }
        }
        continue;
      }

      if (server.port) {
        const inUse = await portService.isPortInUse(server.port);

        if (inUse) {
          if (currentStatus !== "running" && currentStatus !== "restarting") {
            serverProvider.updateServerStatus(server.id, "running");
          }
        } else {
          // Port is NOT in use — server was stopped (e.g. user pressed Ctrl+C in terminal)
          if (currentStatus === "running" || currentStatus === "starting") {
            serverProvider.updateServerStatus(server.id, "stopped");
          }
        }
      } else {
        if (currentStatus !== "running") {
          serverProvider.updateServerStatus(server.id, "running");
        }
      }
    }

    updateStatusBar();
  }, 2000);
}

function updateStatusBar(): void {
  const configService = ConfigService.getInstance();
  const servers = configService.getServers();
  const total = servers.length;

  if (total === 0) {
    statusBarItem.text = "$(zap) Ninja Runner";
    return;
  }

  const terminalService = TerminalService.getInstance();
  let runningCount = 0;

  for (const s of servers) {
    if (terminalService.isServerTerminalActive(s.id)) {
      runningCount++;
    }
  }

  statusBarItem.text = `$(server-process) Ninja: ${runningCount}/${total} Running`;
}

export function deactivate(): void {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
  }

  const terminalService = TerminalService.getInstance();
  terminalService.disposeAll();

  const debugService = DebugService.getInstance();
  debugService.dispose();
}
