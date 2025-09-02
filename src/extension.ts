import * as vscode from "vscode";
import { ServerRunnerProvider, ServerItem } from "./serverProvider";
import { ServerConfigManager, ServerConfig } from "./serverConfig";

let terminals: { [key: string]: vscode.Terminal } = {};
let serverProvider: ServerRunnerProvider;
let configManager: ServerConfigManager;
let isFirstViewAccess = true;

export function activate(context: vscode.ExtensionContext) {
  console.log("🥷 Ninja Runner extension is now active!");

  // Set context to show the view
  vscode.commands.executeCommand("setContext", "serverRunnerEnabled", true);

  configManager = ServerConfigManager.getInstance();
  serverProvider = new ServerRunnerProvider();
  vscode.window.registerTreeDataProvider("serverRunnerView", serverProvider);

  // Auto-start servers ONLY when the view is accessed for the first time
  const onViewVisible = vscode.commands.registerCommand(
    "serverRunnerView.focus",
    () => {
      if (isFirstViewAccess) {
        setTimeout(() => {
          autoStartAllServersOnActivation();
          isFirstViewAccess = false;
        }, 100);
      }
    }
  );

  // Register commands
  const disposables = [
    onViewVisible,

    vscode.commands.registerCommand("serverRunner.startFspFrontend", () => {
      console.log("🥷 FSP Frontend command triggered!");
      startServer(
        "FSP Frontend",
        "cd FSP/frontend && npm run dev",
        "fsp-frontend"
      );
    }),

    vscode.commands.registerCommand("serverRunner.startHrmsFrontend", () => {
      console.log("🥷 HRMS Frontend command triggered!");
      startServer(
        "HRMS Frontend",
        "cd HRMS/frontend && npm run dev",
        "hrms-frontend"
      );
    }),

    vscode.commands.registerCommand("serverRunner.startFspBackend", () => {
      console.log("🥷 FSP Backend command triggered!");
      startServer(
        "FSP Backend",
        "cd FSP/backend && mvn spring-boot:run",
        "fsp-backend"
      );
    }),

    vscode.commands.registerCommand("serverRunner.startHrmsBackend", () => {
      console.log("🥷 HRMS Backend command triggered!");
      startServer(
        "HRMS Backend",
        "cd HRMS/backend && mvn spring-boot:run",
        "hrms-backend"
      );
    }),

    vscode.commands.registerCommand("serverRunner.stopAllServers", () => {
      stopAllServers();
    }),

    vscode.commands.registerCommand("serverRunner.startAllServers", () => {
      startAllServers();
    }),

    vscode.commands.registerCommand("serverRunner.refresh", () => {
      serverProvider.refresh();
    }),

    vscode.commands.registerCommand(
      "serverRunner.startDynamicServer",
      (serverId: string) => {
        const serverConfig = configManager.getServerById(serverId);
        if (serverConfig) {
          startServer(serverConfig.name, serverConfig.command, serverId);
        }
      }
    ),

    vscode.commands.registerCommand("serverRunner.addServer", () => {
      addNewServer();
    }),

    vscode.commands.registerCommand(
      "serverRunner.editServer",
      (item: ServerItem) => {
        if (item.contextValue) {
          editServer(item.contextValue);
        }
      }
    ),

    vscode.commands.registerCommand(
      "serverRunner.deleteServer",
      (item: ServerItem) => {
        if (item.contextValue) {
          deleteServer(item.contextValue);
        }
      }
    ),
  ];

  context.subscriptions.push(...disposables);

  // Start periodic status monitoring
  startServerStatusMonitoring();
}

function autoStartAllServersOnActivation() {
  vscode.window.showInformationMessage("🥷 Ninja Auto-Starting All Servers...");

  // Show progress notification
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "🚀 Ninja launching all servers...",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0, message: "Starting FSP Frontend..." });
      startServer(
        "FSP Frontend",
        "cd FSP/frontend && npm run dev",
        "fsp-frontend"
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));

      progress.report({ increment: 25, message: "Starting HRMS Frontend..." });
      startServer(
        "HRMS Frontend",
        "cd HRMS/frontend && npm run dev",
        "hrms-frontend"
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));

      progress.report({ increment: 50, message: "Starting FSP Backend..." });
      startServer(
        "FSP Backend",
        "cd FSP/backend && mvn spring-boot:run",
        "fsp-backend"
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));

      progress.report({ increment: 75, message: "Starting HRMS Backend..." });
      startServer(
        "HRMS Backend",
        "cd HRMS/backend && mvn spring-boot:run",
        "hrms-backend"
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));

      progress.report({ increment: 100, message: "All servers launched! 🥷" });

      return new Promise((resolve) => {
        setTimeout(() => {
          vscode.window.showInformationMessage(
            "🎯 All ninja servers are now running!"
          );
          resolve(undefined);
        }, 500);
      });
    }
  );
}

function startServerStatusMonitoring() {
  setInterval(() => {
    // Check each terminal status and update the tree view
    const servers = configManager.getServers();

    servers.forEach((server) => {
      const terminal = terminals[server.id];
      const isRunning = terminal && terminal.exitStatus === undefined;
      serverProvider.updateServerStatus(server.id, isRunning || false);
    });
  }, 3000); // Check every 3 seconds
}

async function addNewServer() {
  const name = await vscode.window.showInputBox({
    prompt: "Enter server name",
    placeHolder: "e.g., My New Server",
  });

  if (!name) return;

  const type = await vscode.window.showQuickPick(["frontend", "backend"], {
    placeHolder: "Select server type",
  });

  if (!type) return;

  const command = await vscode.window.showInputBox({
    prompt: "Enter the command to start the server",
    placeHolder: "e.g., cd my-project && npm start",
  });

  if (!command) return;

  const workingDirectory = await vscode.window.showInputBox({
    prompt: "Enter working directory (relative to workspace)",
    placeHolder: "e.g., my-project",
  });

  if (!workingDirectory) return;

  const emoji = await vscode.window.showInputBox({
    prompt: "Enter an emoji for the server",
    placeHolder: "e.g., 🚀",
    value: type === "frontend" ? "🌐" : "⚙️",
  });

  const id = configManager.generateUniqueId(name);
  const category = type === "frontend" ? "Frontend Servers" : "Backend Servers";

  const newServer: ServerConfig = {
    id,
    name,
    type: type as "frontend" | "backend",
    command,
    workingDirectory,
    emoji: emoji || (type === "frontend" ? "🌐" : "⚙️"),
    category: category as "Frontend Servers" | "Backend Servers",
  };

  configManager.addServer(newServer);
  serverProvider.refresh();

  vscode.window.showInformationMessage(`🥷 Ninja added ${name} server!`);
}

async function editServer(serverId: string) {
  const serverConfig = configManager.getServerById(serverId);
  if (!serverConfig) {
    vscode.window.showErrorMessage("Server not found!");
    return;
  }

  const name = await vscode.window.showInputBox({
    prompt: "Enter server name",
    value: serverConfig.name,
  });

  if (!name) return;

  const command = await vscode.window.showInputBox({
    prompt: "Enter the command to start the server",
    value: serverConfig.command,
  });

  if (!command) return;

  const workingDirectory = await vscode.window.showInputBox({
    prompt: "Enter working directory (relative to workspace)",
    value: serverConfig.workingDirectory,
  });

  if (!workingDirectory) return;

  const emoji = await vscode.window.showInputBox({
    prompt: "Enter an emoji for the server",
    value: serverConfig.emoji,
  });

  const updatedServer: ServerConfig = {
    ...serverConfig,
    name,
    command,
    workingDirectory,
    emoji: emoji || serverConfig.emoji,
  };

  configManager.addServer(updatedServer);
  serverProvider.refresh();

  vscode.window.showInformationMessage(`🥷 Ninja updated ${name} server!`);
}

async function deleteServer(serverId: string) {
  const serverConfig = configManager.getServerById(serverId);
  if (!serverConfig) {
    vscode.window.showErrorMessage("Server not found!");
    return;
  }

  const confirmation = await vscode.window.showWarningMessage(
    `Are you sure you want to delete ${serverConfig.name}?`,
    { modal: true },
    "Yes",
    "No"
  );

  if (confirmation === "Yes") {
    // Stop server if running
    if (terminals[serverId]) {
      terminals[serverId].sendText("\u0003"); // Send Ctrl+C
      terminals[serverId].dispose();
      delete terminals[serverId];
    }

    configManager.deleteServer(serverId);
    serverProvider.refresh();

    vscode.window.showInformationMessage(
      `🥷 Ninja removed ${serverConfig.name} server!`
    );
  }
}

function startServer(name: string, command: string, terminalKey: string) {
  // Check if terminal already exists and is running
  if (
    terminals[terminalKey] &&
    terminals[terminalKey].exitStatus === undefined
  ) {
    vscode.window.showInformationMessage(
      `⚡ ${name} is already running like a ninja!`
    );
    terminals[terminalKey].show();
    return;
  }

  // Get workspace root
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace folder found!");
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Create new terminal
  const terminal = vscode.window.createTerminal({
    name: name,
    cwd: workspaceRoot,
  });

  terminals[terminalKey] = terminal;
  terminal.show();
  terminal.sendText(command);

  // Update server status to running
  serverProvider.updateServerStatus(terminalKey, true);

  // Clean up terminal reference when it exits
  vscode.window.onDidCloseTerminal((closedTerminal) => {
    if (closedTerminal === terminal) {
      delete terminals[terminalKey];
      // Update server status to stopped
      serverProvider.updateServerStatus(terminalKey, false);
    }
  });

  vscode.window.showInformationMessage(`🥷 Ninja launching ${name}...`);
}

function startAllServers() {
  vscode.window.showInformationMessage("🚀 Ninja launching all servers...");

  // Start all servers in sequence
  setTimeout(() => {
    startServer(
      "FSP Frontend",
      "cd FSP/frontend && npm run dev",
      "fsp-frontend"
    );
  }, 100);

  setTimeout(() => {
    startServer(
      "HRMS Frontend",
      "cd HRMS/frontend && npm run dev",
      "hrms-frontend"
    );
  }, 200);

  setTimeout(() => {
    startServer(
      "FSP Backend",
      "cd FSP/backend && mvn spring-boot:run",
      "fsp-backend"
    );
  }, 300);

  setTimeout(() => {
    startServer(
      "HRMS Backend",
      "cd HRMS/backend && mvn spring-boot:run",
      "hrms-backend"
    );
  }, 400);
}

function stopAllServers() {
  const activeTerminals = Object.values(terminals).filter(
    (terminal) => terminal.exitStatus === undefined
  );

  if (activeTerminals.length === 0) {
    vscode.window.showInformationMessage("🔍 No servers found running, ninja!");
    return;
  }

  activeTerminals.forEach((terminal) => {
    terminal.sendText("\u0003"); // Send Ctrl+C
    terminal.dispose();
  });

  // Update all server statuses to stopped
  Object.keys(terminals).forEach((terminalKey) => {
    serverProvider.updateServerStatus(terminalKey, false);
  });

  terminals = {}; // Clear all terminal references
  vscode.window.showInformationMessage(
    "🛑 All servers stopped by ninja power!"
  );
}

export function deactivate() {
  // Clean up terminals when extension is deactivated
  Object.values(terminals).forEach((terminal) => {
    if (terminal.exitStatus === undefined) {
      terminal.dispose();
    }
  });
  terminals = {};
}
