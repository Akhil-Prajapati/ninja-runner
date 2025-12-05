import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ServerRunnerProvider, ServerItem } from "./serverProvider";
import { ServerConfigManager, ServerConfig } from "./serverConfig";

let terminals: { [key: string]: vscode.Terminal } = {};
let debugSessions: { [key: string]: vscode.DebugSession } = {};
let debugPorts: { [key: string]: number } = {};
let nextJavaDebugPort = 5005;
let nextNodeDebugPort = 9229;
let serverProvider: ServerRunnerProvider;
let configManager: ServerConfigManager;
let statusBarItems: vscode.StatusBarItem[] = [];
let isAutoDetectDone = false;
let extensionContext: vscode.ExtensionContext;

export function activate(context: vscode.ExtensionContext) {
  console.log("🥷 Ninja Runner extension is now active!");

  // Store extension context for persistence
  extensionContext = context;

  // Check for updates and notify user
  checkForUpdates(context);

  // Set context to show the view
  vscode.commands.executeCommand("setContext", "serverRunnerEnabled", true);

  configManager = ServerConfigManager.getInstance();
  serverProvider = new ServerRunnerProvider();
  vscode.window.registerTreeDataProvider("serverRunnerView", serverProvider);

  // Load saved user preferences
  loadUserPreferences();

  // Auto-detect projects on first activation only if no saved preferences
  if (!isAutoDetectDone && configManager.getServers().length === 0) {
    setTimeout(() => {
      // On first run, pass empty set so all projects default to selected
      autoDetectProjects();
      isAutoDetectDone = true;
    }, 1000);
  }

  // Auto-start servers and show sidebar every time the view is focused (activity bar icon clicked)
  const onViewVisible = vscode.commands.registerCommand(
    "serverRunnerView.focus",
    async () => {
      // Auto-detect if not done yet
      if (!isAutoDetectDone) {
        await autoDetectProjects();
        isAutoDetectDone = true;
      }

      // Start all servers immediately
      setTimeout(() => {
        autoStartAllServersOnActivation();
      }, 100);

      // Ensure the server runner view is visible in the activity bar
      await vscode.commands.executeCommand(
        "workbench.view.extension.serverRunner"
      );
    }
  );

  // Command specifically for activity bar icon click
  const onActivityBarClick = vscode.commands.registerCommand(
    "serverRunner.showView",
    async () => {
      // Auto-detect if not done yet
      if (!isAutoDetectDone) {
        await autoDetectProjects();
        isAutoDetectDone = true;
      }

      // Start all servers immediately
      autoStartAllServersOnActivation();

      // Show the server runner view in the sidebar
      await vscode.commands.executeCommand(
        "workbench.view.extension.serverRunner"
      );

      // Focus on the specific view
      await vscode.commands.executeCommand("serverRunnerView.focus");
    }
  );

  // Auto-detect projects command
  const autoDetectCommand = vscode.commands.registerCommand(
    "serverRunner.autoDetectProjects",
    () => {
      autoDetectProjects();
    }
  );

  // Reset configuration command
  const resetConfigCommand = vscode.commands.registerCommand(
    "serverRunner.resetConfiguration",
    async () => {
      const confirmation = await vscode.window.showWarningMessage(
        "🔄 This will clear all current server configurations and let you reselect projects. Continue?",
        { modal: true },
        "Yes, Reset",
        "Cancel"
      );

      if (confirmation === "Yes, Reset") {
        // Note: Don't clear saved preferences here, let auto-detect preserve selections
        // Trigger auto-detection with user selection (which will now preserve previous choices)
        await autoDetectProjects();
      }
    }
  );

  // Clear all selections command - for when users want to start completely fresh
  const clearAllSelectionsCommand = vscode.commands.registerCommand(
    "serverRunner.clearAllSelections",
    async () => {
      const confirmation = await vscode.window.showWarningMessage(
        "🗑️ This will completely clear all server selections and preferences. You'll need to reselect all projects from scratch. Continue?",
        { modal: true },
        "Yes, Clear All",
        "Cancel"
      );

      if (confirmation === "Yes, Clear All") {
        // Clear saved preferences completely
        extensionContext.workspaceState.update(
          "ninja-runner-servers",
          undefined
        );
        configManager.clearAllServers();
        serverProvider.refresh();

        // Trigger auto-detection with fresh selection
        await autoDetectProjects();

        vscode.window.showInformationMessage(
          "🗑️ All selections cleared! Please reselect your projects."
        );
      }
    }
  );

  // Install dependencies command
  const installDepsCommand = vscode.commands.registerCommand(
    "serverRunner.installDependencies",
    (item: ServerItem) => {
      if (item.contextValue) {
        const serverId = extractServerId(item.contextValue);
        installDependencies(serverId);
      }
    }
  );

  // Install all dependencies command
  const installAllDepsCommand = vscode.commands.registerCommand(
    "serverRunner.installAllDependencies",
    () => {
      installAllDependencies();
    }
  );

  // Status bar commands
  const showStatusBarCommand = vscode.commands.registerCommand(
    "serverRunner.showStatusBar",
    () => {
      createStatusBar();
    }
  );

  // Register commands
  const disposables = [
    onViewVisible,
    onActivityBarClick,
    autoDetectCommand,
    resetConfigCommand,
    clearAllSelectionsCommand,
    installDepsCommand,
    installAllDepsCommand,
    showStatusBarCommand,

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
      (contextValue: string) => {
        const serverId = extractServerId(contextValue);
        const serverConfig = configManager.getServerById(serverId);
        if (serverConfig) {
          startServer(serverConfig.name, serverConfig.command, serverId);
        }
      }
    ),

    vscode.commands.registerCommand(
      "serverRunner.retryServer",
      (contextValue: string) => {
        const serverId = extractServerId(contextValue);
        const serverConfig = configManager.getServerById(serverId);
        if (serverConfig) {
          // Reset status and try again
          serverProvider.updateServerStatus(serverId, "stopped");
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
      "serverRunner.stopServer",
      (item: ServerItem) => {
        if (item.contextValue) {
          const serverId = extractServerId(item.contextValue);
          stopServer(serverId);
        }
      }
    ),

    vscode.commands.registerCommand("serverRunner.checkForUpdates", () => {
      checkForUpdates(extensionContext);
    }),

    vscode.commands.registerCommand(
      "serverRunner.runInDebug",
      (item: ServerItem) => {
        if (item.contextValue) {
          const serverId = extractServerId(item.contextValue);
          runServerInDebug(serverId);
        }
      }
    ),

    vscode.commands.registerCommand(
      "serverRunner.triggerBuild",
      (contextValue: string) => {
        if (contextValue) {
          // contextValue format: "build:environment:projectPath"
          const parts = contextValue.split(":");
          if (parts.length >= 3) {
            const environment = parts[1];
            const projectPath = parts.slice(2).join(":"); // Rejoin in case path has colons
            triggerBuild(environment, projectPath);
          }
        }
      }
    ),

    vscode.commands.registerCommand(
      "serverRunner.patchBuildScript",
      async (item: any) => {
        if (item && item.projectPath) {
          const buildScriptPath = await findBuildScriptInProject(
            item.projectPath
          );
          if (buildScriptPath) {
            try {
              await patchBuildScript(buildScriptPath);
              const projectName = path.basename(item.projectPath);
              vscode.window.showInformationMessage(
                `✅ Successfully patched ${projectName}/build.sh!`
              );
            } catch (error) {
              vscode.window.showErrorMessage(
                `❌ Failed to patch build.sh: ${error}`
              );
            }
          } else {
            vscode.window.showErrorMessage(
              `❌ build.sh not found in ${path.basename(item.projectPath)}`
            );
          }
        }
      }
    ),
  ];

  // Listen for debug session termination
  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession((session) => {
      // Find which server this debug session belongs to
      for (const [serverId, debugSession] of Object.entries(debugSessions)) {
        if (debugSession.id === session.id) {
          console.log(`🐛 Debug session terminated for server: ${serverId}`);
          delete debugSessions[serverId];
          delete debugPorts[serverId];
          break;
        }
      }
    })
  );

  // Listen for debug session start and associate with correct server
  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => {
      console.log(`🐛 Debug session started: ${session.name}`);

      // Find which server this debug session belongs to by matching the name
      const servers = configManager.getServers();
      for (const server of servers) {
        if (session.name === `Debug ${server.name}`) {
          debugSessions[server.id] = session;
          console.log(
            `✅ Associated debug session with server: ${server.name} (ID: ${server.id})`
          );
          break;
        }
      }
    })
  );

  context.subscriptions.push(...disposables);

  // Start periodic status monitoring
  startServerStatusMonitoring();
}

function autoStartAllServersOnActivation() {
  const servers = configManager.getServers();

  if (servers.length === 0) {
    console.log("🔍 No servers found. Auto-detecting projects...");
    autoDetectProjects();
    return;
  }

  console.log("🥷 Auto-Starting All Servers...");
  // Don't show popup, just log to console

  // Show progress notification
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "🚀 Ninja launching all servers...",
      cancellable: false,
    },
    async (progress) => {
      const totalServers = servers.length;

      for (let i = 0; i < servers.length; i++) {
        const server = servers[i];
        const percentage = Math.round(((i + 1) / totalServers) * 100);

        progress.report({
          increment: percentage / totalServers,
          message: `Starting ${server.name}...`,
        });

        startServer(server.name, server.command, server.id);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      progress.report({ increment: 100, message: "All servers launched! 🥷" });

      return new Promise((resolve) => {
        setTimeout(() => {
          vscode.window.showInformationMessage(
            "🎯 All ninja servers are now running!"
          );
          createStatusBar();
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

      if (!terminal) {
        // No terminal exists, server is definitely not running
        const currentStatus = serverProvider.getServerStatus(server.id);
        if (currentStatus !== "stopped") {
          serverProvider.updateServerStatus(server.id, "stopped");
        }
        return;
      }

      // Check if terminal has exited
      if (terminal.exitStatus !== undefined) {
        // Terminal has exited, clean up and mark appropriately
        delete terminals[server.id];

        const currentStatus = serverProvider.getServerStatus(server.id);

        // If it was running and then exited, it might be an error
        if (currentStatus === "running") {
          // Check exit code to determine if it was an error or normal termination
          if (terminal.exitStatus.code !== 0) {
            serverProvider.updateServerStatus(server.id, "error");
            vscode.window.showErrorMessage(
              `🔴 ${server.name} exited with error code ${terminal.exitStatus.code}`
            );
          } else {
            serverProvider.updateServerStatus(server.id, "stopped");
          }
        } else {
          serverProvider.updateServerStatus(server.id, "stopped");
        }

        console.log(
          `🔍 Terminal for ${server.id} has exited with status:`,
          terminal.exitStatus
        );
        return;
      }

      // Terminal exists and hasn't exited
      const currentStatus = serverProvider.getServerStatus(server.id);

      // Don't automatically reset error status back to running just because terminal exists
      // Error status should only be reset manually by user action or explicit recovery detection
      if (currentStatus === "error") {
        // Keep error status - don't automatically reset to running
        // User can manually restart the server if they want to try again
        return;
      }

      // Enhanced monitoring for backend servers - detect runtime crashes
      if (server.type === "backend" && currentStatus === "running") {
        // Check terminal output for common error patterns that indicate server crash
        checkForServerCrash(server.id, server.name, terminal);
      }

      // Only update to running if we're not already tracking it as running/starting/error
      else if (currentStatus === "stopped") {
        serverProvider.updateServerStatus(server.id, "running");
      }
    });
  }, 3000); // Check every 3 seconds for better responsiveness while avoiding excessive calls
}

// Enhanced crash detection for backend servers
let lastTerminalOutputCheck: { [serverId: string]: number } = {};

function checkForServerCrash(
  serverId: string,
  serverName: string,
  terminal: vscode.Terminal
) {
  // Note: VS Code API doesn't provide direct access to terminal output
  // However, we can implement alternative detection methods

  // Method 1: Check if terminal is responsive by tracking last activity time
  const now = Date.now();
  const lastCheck = lastTerminalOutputCheck[serverId] || 0;

  // If this is the first check, just record the time
  if (lastCheck === 0) {
    lastTerminalOutputCheck[serverId] = now;
    return;
  }

  // Method 2: For Spring Boot specifically, try to detect common crash scenarios
  // Since we can't read terminal output directly, we'll use a periodic health check approach

  // Check if we should perform a health check (every 15 seconds)
  if (now - lastCheck < 15000) {
    return;
  }

  lastTerminalOutputCheck[serverId] = now;

  // Method 3: Enhanced terminal monitoring
  // Check if terminal process is still active but not responding
  if (terminal.exitStatus === undefined) {
    // Terminal process exists, but let's check if it's actually responsive

    // For Spring Boot apps, we can try to detect if the port is still occupied
    // This is a heuristic approach since VS Code API is limited

    console.log(`🔍 Performing health check for ${serverName} (${serverId})`);

    // If the terminal has been "running" for too long without any activity indicators,
    // it might be crashed but the process is still alive
    performServerHealthCheck(serverId, serverName);
  }
}

// Perform a health check specific to the server type
async function performServerHealthCheck(serverId: string, serverName: string) {
  const server = configManager.getServerById(serverId);
  if (!server) return;

  // For Spring Boot servers, common crash patterns include:
  // - Connection timeouts
  // - Database connection failures
  // - OutOfMemory errors
  // - Port binding failures after restart

  if (
    server.command.includes("spring-boot:run") ||
    server.command.includes("mvn")
  ) {
    // Spring Boot specific health check
    await checkSpringBootHealth(serverId, serverName);
  } else if (
    server.command.includes("npm") ||
    server.command.includes("yarn")
  ) {
    // Node.js specific health check
    await checkNodeJsHealth(serverId, serverName);
  }
}

// Spring Boot specific health check
async function checkSpringBootHealth(serverId: string, serverName: string) {
  const terminal = terminals[serverId];
  if (!terminal) return;

  console.log(`🏥 Performing Spring Boot health check for ${serverName}`);

  // Since we can't read terminal output directly in VS Code API,
  // we implement alternative monitoring approaches:

  const serverStartTime = getServerStartTime(serverId);
  const now = Date.now();

  if (serverStartTime) {
    const runtimeMinutes = Math.round((now - serverStartTime) / 60000);

    // If server has been running for a while, it's likely stable
    if (runtimeMinutes > 10) {
      console.log(
        `✅ ${serverName} has been stable for ${runtimeMinutes} minutes`
      );
      return;
    }

    // For newer servers, be more vigilant but less noisy
    if (runtimeMinutes < 5) {
      // Spring Boot servers that crash within first 5 minutes often have config issues
      // Only show notification once at 3-minute mark to avoid spam
      if (runtimeMinutes === 3) {
        console.log(
          `⚠️ ${serverName} has been running for 3 minutes. Monitoring for stability...`
        );
        // Don't show popup unless explicitly requested by user
      }
    }
  }

  // Additional Spring Boot specific checks
  // Check if the terminal process is still responsive
  if (terminal.exitStatus === undefined) {
    // Process is still running, which is good for Spring Boot
    console.log(`✅ ${serverName} terminal process is still active`);
  }
}

// Node.js specific health check
async function checkNodeJsHealth(serverId: string, serverName: string) {
  const terminal = terminals[serverId];
  if (!terminal) return;

  console.log(`🟢 Performing Node.js health check for ${serverName}`);

  // Similar approach for Node.js servers
  // Could check for common Node.js error patterns when API becomes available
}

// Track server start times for better monitoring
let serverStartTimes: { [serverId: string]: number } = {};

function getServerStartTime(serverId: string): number | undefined {
  return serverStartTimes[serverId];
}

function setServerStartTime(serverId: string, startTime: number) {
  serverStartTimes[serverId] = startTime;
}

// Manual health check triggered by user
async function performManualHealthCheck(serverId: string) {
  const server = configManager.getServerById(serverId);
  const terminal = terminals[serverId];

  if (!server) {
    vscode.window.showErrorMessage("Server not found!");
    return;
  }

  if (!terminal) {
    vscode.window.showInformationMessage(`${server.name} is not running.`);
    return;
  }

  if (terminal.exitStatus !== undefined) {
    vscode.window.showWarningMessage(
      `${server.name} has exited with code ${terminal.exitStatus.code}. Use restart to try again.`
    );
    return;
  }

  // Show concise health information
  const startTime = getServerStartTime(serverId);
  const now = Date.now();
  const runtimeMinutes = startTime ? Math.round((now - startTime) / 60000) : 0;

  const isSpringBoot =
    server.command.includes("spring-boot:run") ||
    server.command.includes("mvn");
  const currentStatus = serverProvider.getServerStatus(serverId);

  let healthMessage = `🏥 ${server.name}: ${currentStatus} (${runtimeMinutes}m)`;

  const action = await vscode.window.showInformationMessage(
    healthMessage,
    "Show Terminal",
    "Restart"
  );

  if (action === "Show Terminal") {
    terminal.show();
  } else if (action === "Restart") {
    stopServer(serverId);
    setTimeout(() => {
      startServer(server.name, server.command, serverId);
    }, 2000);
  }
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
  saveUserPreferences();
  serverProvider.refresh();

  console.log(`🥷 Added ${name} server!`); // Log instead of popup
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
  saveUserPreferences();
  serverProvider.refresh();

  console.log(`🥷 Updated ${name} server!`); // Log instead of popup
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
    saveUserPreferences();
    serverProvider.refresh();

    vscode.window.showInformationMessage(
      `🥷 Ninja removed ${serverConfig.name} server!`
    );
  }
}

async function stopServer(serverId: string) {
  const serverConfig = configManager.getServerById(serverId);
  if (!serverConfig) {
    vscode.window.showErrorMessage("Server not found!");
    return;
  }

  // Stop debug session if running
  if (debugSessions[serverId]) {
    console.log(`🐛 Stopping debug session for ${serverConfig.name}...`);
    try {
      await vscode.debug.stopDebugging(debugSessions[serverId]);
      delete debugSessions[serverId];
      delete debugPorts[serverId];
    } catch (error) {
      console.error(`Error stopping debug session: ${error}`);
    }
  }

  // Check if server is running
  const terminal = terminals[serverId];
  if (!terminal || terminal.exitStatus !== undefined) {
    vscode.window.showInformationMessage(
      `${serverConfig.name} is not currently running.`
    );
    return;
  }

  // Stop the server
  terminal.sendText("\u0003"); // Send Ctrl+C
  terminal.dispose();
  delete terminals[serverId];

  // Update status
  serverProvider.updateServerStatus(serverId, "stopped");

  vscode.window.showInformationMessage(
    `🛑 Stopped ${serverConfig.name} server!`
  );
}

// Run backend server in debug mode
async function runServerInDebug(serverId: string) {
  const serverConfig = configManager.getServerById(serverId);
  if (!serverConfig) {
    vscode.window.showErrorMessage("Server not found!");
    return;
  }

  // Check if it's a backend server
  if (serverConfig.type !== "backend") {
    vscode.window.showWarningMessage(
      "Debug mode is only available for backend servers!"
    );
    return;
  }

  // Stop the server if it's already running
  if (terminals[serverId] && terminals[serverId].exitStatus === undefined) {
    await stopServer(serverId);
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for server to stop
  }

  // Get workspace root
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace folder found!");
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Allocate a unique debug port for this server
  let debugConfig: any;
  let debugCommand = serverConfig.command;
  let debugPort: number;

  // For Spring Boot (Maven)
  if (
    debugCommand.includes("spring-boot:run") ||
    debugCommand.includes("mvn")
  ) {
    // Allocate next available Java debug port
    debugPort = nextJavaDebugPort;
    nextJavaDebugPort += 1; // Increment for next server

    debugCommand = debugCommand.replace(
      "spring-boot:run",
      `spring-boot:run -Dspring-boot.run.jvmArguments="-Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=n,address=*:${debugPort}"`
    );

    // Create Java debug configuration
    debugConfig = {
      type: "java",
      name: `Debug ${serverConfig.name}`,
      request: "attach",
      hostName: "localhost",
      port: debugPort,
      projectName: serverConfig.name,
      console: "internalConsole",
      internalConsoleOptions: "neverOpen",
    };
  }
  // For Node.js backends
  else if (debugCommand.includes("npm") || debugCommand.includes("node")) {
    // Allocate next available Node debug port
    debugPort = nextNodeDebugPort;
    nextNodeDebugPort += 1; // Increment for next server

    if (debugCommand.includes("npm start")) {
      debugCommand = debugCommand.replace(
        "npm start",
        `node --inspect=${debugPort} .`
      );
    } else if (debugCommand.includes("npm run dev")) {
      debugCommand = debugCommand.replace(
        "npm run dev",
        `node --inspect=${debugPort} node_modules/.bin/nodemon`
      );
    } else if (debugCommand.includes("npm run")) {
      const scriptName = debugCommand.split("npm run ")[1]?.split(" ")[0];
      debugCommand = debugCommand.replace(
        `npm run ${scriptName}`,
        `node --inspect=${debugPort} node_modules/.bin/${scriptName}`
      );
    } else if (debugCommand.includes("node ")) {
      debugCommand = debugCommand.replace(
        "node ",
        `node --inspect=${debugPort} `
      );
    }

    // Create Node.js debug configuration
    debugConfig = {
      type: "node",
      name: `Debug ${serverConfig.name}`,
      request: "attach",
      port: debugPort,
      restart: true,
      protocol: "inspector",
      console: "internalConsole",
      internalConsoleOptions: "neverOpen",
    };
  }
  // For other backends
  else {
    vscode.window.showWarningMessage(
      `Debug mode for ${serverConfig.name} requires manual configuration. Please set up launch.json manually.`
    );
    return;
  }

  // Store the debug port for this server
  debugPorts[serverId] = debugPort;

  // Create new terminal for debug mode
  const terminal = vscode.window.createTerminal({
    name: `${serverConfig.name} (Debug)`,
    cwd: workspaceRoot,
  });

  terminals[serverId] = terminal;
  terminal.show();

  // Fix paths in command for Windows compatibility
  const fixedCommand = fixPathsInCommand(debugCommand);
  terminal.sendText(fixedCommand);

  // Record server start time
  setServerStartTime(serverId, Date.now());

  // Update status
  serverProvider.updateServerStatus(serverId, "starting");

  console.log(
    `🐛 Launching ${serverConfig.name} in debug mode on port ${debugPort}...`
  );

  vscode.window.showInformationMessage(
    `🐛 Starting ${serverConfig.name} in debug mode on port ${debugPort}...`
  );

  // Wait for server to start, then attach debugger with retry logic
  const attemptDebugAttach = async (
    attempt: number = 1,
    maxAttempts: number = 5
  ) => {
    const isSpringBoot =
      debugCommand.includes("spring-boot:run") || debugCommand.includes("mvn");
    const waitTime = isSpringBoot ? 8000 : 6000; // Spring Boot needs more time
    const retryDelay = 3000 * attempt; // Exponential backoff: 3s, 6s, 9s, 12s, 15s

    setTimeout(
      async () => {
        try {
          console.log(
            `🔌 Attempt ${attempt}/${maxAttempts}: Attaching debugger to ${serverConfig.name} on port ${debugPort}...`
          );

          // Start debugging session
          const success = await vscode.debug.startDebugging(
            workspaceFolders[0],
            debugConfig
          );

          if (success) {
            // Debug session will be stored by the onDidStartDebugSession event listener
            console.log(
              `✅ Debugger attached successfully to ${serverConfig.name} on port ${debugPort}`
            );
            vscode.window.showInformationMessage(
              `🐛 Debugger attached to ${serverConfig.name} on port ${debugPort}!`
            );
          } else {
            console.log(
              `⚠️ Attempt ${attempt} failed to attach debugger to ${serverConfig.name}`
            );

            // Retry automatically if we haven't exhausted attempts
            if (attempt < maxAttempts) {
              console.log(`🔄 Retrying in ${retryDelay / 1000} seconds...`);
              attemptDebugAttach(attempt + 1, maxAttempts);
            } else {
              // Only show error after all attempts failed
              console.log(
                `❌ All ${maxAttempts} attempts failed to attach debugger to ${serverConfig.name}`
              );
            }
          }
        } catch (error: any) {
          console.error(
            `❌ Error on attempt ${attempt} for ${serverConfig.name}:`,
            error
          );

          // Check if it's a timeout or connection error
          const isTimeout =
            error.message?.includes("timeout") ||
            error.message?.includes("handshake");

          if (isTimeout && attempt < maxAttempts) {
            // Silently retry on timeout errors
            console.log(
              `🔄 Timeout detected, retrying in ${retryDelay / 1000} seconds...`
            );
            attemptDebugAttach(attempt + 1, maxAttempts);
          } else if (attempt >= maxAttempts) {
            // Only show error message after all retries exhausted
            console.log(
              `❌ Failed to attach debugger after ${maxAttempts} attempts. Server may need more time to start.`
            );
          }
        }
      },
      attempt === 1 ? waitTime : retryDelay
    );
  };

  // Start the attachment process
  attemptDebugAttach();

  // Set up monitoring similar to startServer
  let healthCheckAttempts = 0;
  const maxHealthCheckAttempts = 8;

  const healthCheck = setInterval(() => {
    healthCheckAttempts++;

    if (!terminals[serverId] || terminals[serverId].exitStatus !== undefined) {
      clearInterval(healthCheck);

      const exitStatus = terminals[serverId]?.exitStatus;
      if (exitStatus && exitStatus.code !== 0) {
        serverProvider.updateServerStatus(serverId, "error");
        vscode.window.showErrorMessage(
          `🔴 ${serverConfig.name} (Debug) failed to start`
        );
      }
      return;
    }

    if (healthCheckAttempts >= 4) {
      clearInterval(healthCheck);
      serverProvider.updateServerStatus(serverId, "running");
      console.log(`✅ ${serverConfig.name} running in debug mode`);
      return;
    }
  }, 2000);
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

  // Fix any paths in the command for Windows compatibility
  const fixedCommand = fixPathsInCommand(command);
  terminal.sendText(fixedCommand);

  // Record server start time for health monitoring
  setServerStartTime(terminalKey, Date.now());

  // Initially set server status to starting, will be updated by monitoring
  serverProvider.updateServerStatus(terminalKey, "starting");

  // Enhanced health check with Spring Boot specific monitoring
  let healthCheckAttempts = 0;
  const maxHealthCheckAttempts = 8; // Extended to 16 seconds for Spring Boot
  let hasShownOutput = false;
  const isSpringBoot =
    command.includes("spring-boot:run") || command.includes("mvn");
  const isNodeJs = command.includes("npm") || command.includes("yarn");

  const healthCheck = setInterval(() => {
    healthCheckAttempts++;

    // Check if terminal still exists and hasn't exited
    if (
      !terminals[terminalKey] ||
      terminals[terminalKey].exitStatus !== undefined
    ) {
      // Terminal has exited or been removed, server is not running
      clearInterval(healthCheck);

      const exitStatus = terminals[terminalKey]?.exitStatus;

      // For Spring Boot, be more specific about error detection
      if (exitStatus && exitStatus.code !== 0) {
        serverProvider.updateServerStatus(terminalKey, "error");
        if (isSpringBoot) {
          vscode.window.showErrorMessage(
            `🔴 ${name} (Spring Boot) failed - check for port conflicts, database connections, or configuration errors`
          );
        } else {
          vscode.window.showErrorMessage(
            `🔴 ${name} failed to start - check terminal for errors`
          );
        }
      } else if (healthCheckAttempts <= 2) {
        // Quick exit might indicate startup failure
        serverProvider.updateServerStatus(terminalKey, "error");
        vscode.window.showErrorMessage(
          `🔴 ${name} exited too quickly - likely a startup error`
        );
      } else {
        serverProvider.updateServerStatus(terminalKey, "stopped");
      }
      return;
    }

    // Spring Boot takes longer to start, so be more patient
    const minAttemptsBeforeRunning = isSpringBoot ? 4 : 3;
    const startupTimeoutAttempts = isSpringBoot ? 8 : 6;

    // After minimum attempts, if terminal is still alive, consider server running
    if (healthCheckAttempts >= minAttemptsBeforeRunning) {
      clearInterval(healthCheck);
      serverProvider.updateServerStatus(terminalKey, "running");

      // Show success message only once (less intrusive)
      if (!hasShownOutput) {
        if (isSpringBoot) {
          console.log(`✅ ${name} (Spring Boot) started successfully!`);
          // Only show popup for Spring Boot if it's the first server started
          const runningServers = Object.keys(terminals).length;
          if (runningServers <= 1) {
            vscode.window.showInformationMessage(
              `✅ ${name} (Spring Boot) started successfully!`
            );
          }
        } else {
          console.log(`✅ ${name} started successfully!`);
          // Show popup only for first server to reduce noise
          const runningServers = Object.keys(terminals).length;
          if (runningServers <= 1) {
            vscode.window.showInformationMessage(`✅ ${name} started!`);
          }
        }
        hasShownOutput = true;
      }
      return;
    }

    // If we've exceeded max attempts and server isn't clearly running
    if (healthCheckAttempts >= maxHealthCheckAttempts) {
      clearInterval(healthCheck);

      // At this point, if terminal exists but we're unsure, mark as running
      // The monitoring function will catch actual failures
      if (
        terminals[terminalKey] &&
        terminals[terminalKey].exitStatus === undefined
      ) {
        serverProvider.updateServerStatus(terminalKey, "running");

        if (!hasShownOutput) {
          if (isSpringBoot) {
            console.log(
              `⚠️ ${name} (Spring Boot) appears to be running, monitoring for stability...`
            );
          } else {
            console.log(`✅ ${name} appears to be running`);
          }
          hasShownOutput = true;
        }
      } else {
        serverProvider.updateServerStatus(terminalKey, "error");
      }
    }
  }, 2000); // Check every 2 seconds

  // Enhanced terminal cleanup with better error detection
  const onCloseDisposable = vscode.window.onDidCloseTerminal(
    (closedTerminal) => {
      if (closedTerminal === terminal) {
        delete terminals[terminalKey];
        delete lastTerminalOutputCheck[terminalKey]; // Clean up monitoring data
        delete serverStartTimes[terminalKey]; // Clean up start time data

        const currentStatus = serverProvider.getServerStatus(terminalKey);
        if (currentStatus === "running") {
          // If it was running and terminal closed, it might be a crash
          serverProvider.updateServerStatus(terminalKey, "error");
          vscode.window.showWarningMessage(
            `⚠️ ${name} terminal closed unexpectedly - server may have crashed`
          );
        } else {
          serverProvider.updateServerStatus(terminalKey, "stopped");
        }

        console.log(`🛑 Terminal for ${name} was closed`);
        onCloseDisposable.dispose();
      }
    }
  );

  console.log(`🥷 Launching ${name}...`); // Log instead of popup
}

function startAllServers() {
  const servers = configManager.getServers();

  if (servers.length === 0) {
    vscode.window.showWarningMessage(
      "No servers configured! Use auto-detect to find projects."
    );
    return;
  }

  console.log("🚀 Launching all servers..."); // Log instead of popup

  // Start all configured servers
  servers.forEach((server, index) => {
    setTimeout(() => {
      startServer(server.name, server.command, server.id);
    }, index * 100); // Stagger starts by 100ms each
  });

  // Create status bar after starting servers
  setTimeout(() => {
    createStatusBar();
  }, 1000);
}

function stopAllServers() {
  const activeTerminals = Object.values(terminals).filter(
    (terminal) => terminal.exitStatus === undefined
  );

  if (activeTerminals.length === 0) {
    console.log("🔍 No servers found running.");
    return;
  }

  activeTerminals.forEach((terminal) => {
    terminal.sendText("\u0003"); // Send Ctrl+C
    terminal.dispose();
  });

  // Update all server statuses to stopped
  Object.keys(terminals).forEach((terminalKey) => {
    serverProvider.updateServerStatus(terminalKey, "stopped");
  });

  terminals = {}; // Clear all terminal references
  vscode.window.showInformationMessage(
    "🛑 All servers stopped by ninja power!"
  );
}

// Auto-detect frontend and backend projects
async function autoDetectProjects() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showWarningMessage("No workspace folder found!");
    return;
  }

  vscode.window.showInformationMessage("🔍 Auto-detecting projects...");

  // Get currently saved servers to preserve selection state
  const currentServers = configManager.getServers();
  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Create a simpler mapping using just the working directory path for more reliable matching
  const currentServerPaths = new Set(
    currentServers.map((server) => server.workingDirectory)
  );

  // Also create a name-based mapping for additional matching
  const currentServerNames = new Set(
    currentServers.map((server) => {
      // Extract the base name without framework info - try multiple patterns
      let baseName = server.name;

      // Remove framework info in parentheses: "FSP Frontend (React/Next.js)" -> "FSP Frontend"
      if (baseName.includes("(")) {
        baseName = baseName.split("(")[0].trim();
      }

      // Also add just the project name part: "FSP Frontend" -> "FSP Frontend"
      return baseName;
    })
  );

  // Add some more variations for better matching
  const currentServerNamesLowerCase = new Set(
    Array.from(currentServerNames).map((name) => name.toLowerCase())
  );

  console.log("Current server paths:", Array.from(currentServerPaths));
  console.log("Current server names:", Array.from(currentServerNames));

  // First, scan and collect all potential projects with deduplication
  const detectedProjects: Array<{
    name: string;
    fullPath: string;
    type: "frontend" | "backend";
    framework: string;
  }> = [];

  // Track already processed paths to avoid duplicates
  const processedPaths = new Set<string>();

  for (const folder of workspaceFolders) {
    await scanForProjectsWithCollection(
      folder.uri.fsPath,
      detectedProjects,
      processedPaths
    );
  }

  // Additional deduplication by path normalization
  const uniqueProjects = deduplicateProjects(detectedProjects);

  if (uniqueProjects.length === 0) {
    vscode.window.showWarningMessage(
      "🥷 No projects detected in workspace!\n\n" +
        "Make sure your workspace contains:\n" +
        "• Frontend projects with package.json\n" +
        "• Backend projects with pom.xml (Spring Boot)\n" +
        "• Projects not in node_modules or build folders\n\n" +
        "Check VS Code OUTPUT panel for scan details."
    );

    // Log workspace structure for debugging
    console.log(
      "Workspace folders:",
      workspaceFolders.map((f) => f.uri.fsPath)
    );

    return;
  }

  // Show user selection dialog with preserved selections
  const selectedProjects = await showProjectSelectionDialog(
    uniqueProjects,
    currentServerPaths,
    currentServerNames,
    currentServerNamesLowerCase
  );

  if (selectedProjects && selectedProjects.length > 0) {
    // Clear existing servers and add selected projects to configuration
    configManager.clearAllServers();

    for (const project of selectedProjects) {
      await addDetectedProject(
        project.name,
        project.fullPath,
        project.type,
        project.framework
      );
    }

    // Save user preferences
    saveUserPreferences();

    serverProvider.refresh();

    if (currentServerPaths && currentServerPaths.size > 0) {
      vscode.window.showInformationMessage(
        `✅ Updated server list! ${selectedProjects.length} projects selected (previous selections preserved).`
      );
    } else {
      vscode.window.showInformationMessage(
        `✅ Added ${selectedProjects.length} selected projects as defaults!`
      );
    }
  } else {
    vscode.window.showInformationMessage("No projects selected.");
  }
}

// Helper function to create meaningful project names
function getProjectDisplayName(fullPath: string, folderName: string): string {
  const pathParts = fullPath.split(path.sep);
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders) {
    return folderName;
  }

  // Find the workspace root
  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const relativePath = path.relative(workspaceRoot, fullPath);
  const relativePathParts = relativePath.split(path.sep);

  // If it's nested (like FSP/frontend), show parent folder name
  if (relativePathParts.length > 1) {
    const parentFolder = relativePathParts[relativePathParts.length - 2];
    return `${parentFolder} ${folderName}`;
  }

  return folderName;
}

// Deduplicate projects based on normalized paths
function deduplicateProjects(
  projects: Array<{
    name: string;
    fullPath: string;
    type: "frontend" | "backend";
    framework: string;
  }>
): Array<{
  name: string;
  fullPath: string;
  type: "frontend" | "backend";
  framework: string;
}> {
  const seen = new Set<string>();
  const uniqueProjects: Array<{
    name: string;
    fullPath: string;
    type: "frontend" | "backend";
    framework: string;
  }> = [];

  for (const project of projects) {
    // Normalize the path for comparison
    const normalizedPath = path.resolve(project.fullPath).toLowerCase();

    if (!seen.has(normalizedPath)) {
      seen.add(normalizedPath);
      uniqueProjects.push(project);
      console.log(
        `✅ Added unique project: ${project.name} at ${project.fullPath}`
      );
    } else {
      console.log(
        `🔄 Skipping duplicate project: ${project.name} at ${project.fullPath}`
      );
    }
  }

  console.log(
    `📋 Deduplication: ${projects.length} found → ${uniqueProjects.length} unique projects`
  );
  return uniqueProjects;
}

// Scan directory for frontend/backend projects and collect them
async function scanForProjectsWithCollection(
  basePath: string,
  detectedProjects: Array<{
    name: string;
    fullPath: string;
    type: "frontend" | "backend";
    framework: string;
  }>,
  processedPaths: Set<string>
) {
  try {
    console.log("Scanning directory:", basePath);

    // Check if this path has already been processed to avoid infinite loops
    const normalizedBasePath = path.resolve(basePath).toLowerCase();
    if (processedPaths.has(normalizedBasePath)) {
      console.log("Already processed path:", basePath);
      return;
    }
    processedPaths.add(normalizedBasePath);

    const entries = await fs.promises.readdir(basePath, {
      withFileTypes: true,
    });

    console.log(
      "Found entries:",
      entries.map((e) => e.name)
    );

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Skip common directories that shouldn't be scanned
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === "target" ||
          entry.name === "build" ||
          entry.name === "built" ||
          entry.name === "bin" ||
          entry.name === "dist" ||
          entry.name === ".vscode" ||
          entry.name === ".idea" ||
          entry.name.startsWith(".")
        ) {
          console.log("Skipping directory:", entry.name);
          continue;
        }

        const fullPath = path.join(basePath, entry.name);
        console.log("Checking project at:", fullPath);

        // Skip if this project path has already been added
        const normalizedFullPath = path.resolve(fullPath).toLowerCase();
        const alreadyExists = detectedProjects.some(
          (project) =>
            path.resolve(project.fullPath).toLowerCase() === normalizedFullPath
        );

        if (alreadyExists) {
          console.log("Project already detected, skipping:", fullPath);
          continue;
        }

        // Track if we found a project to avoid duplicates
        let foundProject = false;

        // Check if this folder has frontend/backend subfolders (like FSP, HRMS, etc.)
        try {
          const subEntries = await fs.promises.readdir(fullPath, {
            withFileTypes: true,
          });

          let hasFrontend = false;
          let hasBackend = false;

          // Look for frontend and backend subfolders
          for (const subEntry of subEntries) {
            if (subEntry.isDirectory()) {
              if (
                subEntry.name === "frontend" ||
                subEntry.name.toLowerCase().includes("frontend")
              ) {
                hasFrontend = true;
              }
              if (
                subEntry.name === "backend" ||
                subEntry.name.toLowerCase().includes("backend")
              ) {
                hasBackend = true;
              }
            }
          }

          // If we found both frontend and backend, process them
          if (hasFrontend || hasBackend) {
            for (const subEntry of subEntries) {
              if (subEntry.isDirectory()) {
                const subPath = path.join(fullPath, subEntry.name);

                // Check frontend subfolder
                if (
                  subEntry.name === "frontend" ||
                  subEntry.name.toLowerCase().includes("frontend")
                ) {
                  if (await isReactProject(subPath)) {
                    const projectName = `${entry.name} Frontend`;
                    console.log(
                      "Found nested React project:",
                      projectName,
                      "at:",
                      subPath
                    );
                    detectedProjects.push({
                      name: projectName,
                      fullPath: subPath,
                      type: "frontend",
                      framework: "React/Next.js",
                    });
                    foundProject = true;
                  } else if (await isNodeProject(subPath)) {
                    const nodeProjectInfo = await analyzeNodeProject(subPath);
                    const projectName = `${entry.name} Frontend`;
                    console.log(
                      `Found nested Node.js project: ${projectName} (${nodeProjectInfo.framework}) at: ${subPath}`
                    );
                    detectedProjects.push({
                      name: projectName,
                      fullPath: subPath,
                      type: nodeProjectInfo.type,
                      framework: nodeProjectInfo.framework,
                    });
                    foundProject = true;
                  }
                }

                // Check backend subfolder
                if (
                  subEntry.name === "backend" ||
                  subEntry.name.toLowerCase().includes("backend")
                ) {
                  if (await isSpringBootProject(subPath)) {
                    const projectName = `${entry.name} Backend`;
                    console.log(
                      "Found nested Spring Boot project:",
                      projectName
                    );
                    detectedProjects.push({
                      name: projectName,
                      fullPath: subPath,
                      type: "backend",
                      framework: "Spring Boot",
                    });
                    foundProject = true;
                  } else if (await isNodeProject(subPath)) {
                    const nodeProjectInfo = await analyzeNodeProject(subPath);
                    const projectName = `${entry.name} Backend`;
                    console.log(
                      `Found nested Node.js backend project: ${projectName} (${nodeProjectInfo.framework})`
                    );
                    detectedProjects.push({
                      name: projectName,
                      fullPath: subPath,
                      type: nodeProjectInfo.type,
                      framework: nodeProjectInfo.framework,
                    });
                    foundProject = true;
                  }
                }
              }
            }
          }
        } catch (subError) {
          console.log(`Cannot read subfolders of ${entry.name}:`, subError);
        }

        // Only check as direct project if we didn't find nested projects
        if (!foundProject) {
          if (await isReactProject(fullPath)) {
            const projectName = `${getProjectDisplayName(
              fullPath,
              entry.name
            )}`;
            console.log("Found direct React project:", projectName);
            detectedProjects.push({
              name: projectName,
              fullPath,
              type: "frontend",
              framework: "React/Next.js",
            });
            foundProject = true;
          } else if (await isSpringBootProject(fullPath)) {
            const projectName = `${getProjectDisplayName(
              fullPath,
              entry.name
            )}`;
            console.log("Found direct Spring Boot project:", projectName);
            detectedProjects.push({
              name: projectName,
              fullPath,
              type: "backend",
              framework: "Spring Boot",
            });
            foundProject = true;
          } else if (await isNodeProject(fullPath)) {
            // Enhanced Node.js project detection - check if it's frontend or backend
            const nodeProjectInfo = await analyzeNodeProject(fullPath);
            const projectName = `${getProjectDisplayName(
              fullPath,
              entry.name
            )}`;
            console.log(
              `Found direct Node.js project: ${projectName} (${nodeProjectInfo.type} - ${nodeProjectInfo.framework})`
            );
            detectedProjects.push({
              name: projectName,
              fullPath,
              type: nodeProjectInfo.type,
              framework: nodeProjectInfo.framework,
            });
            foundProject = true;
          }
        }

        // Continue scanning deeper if we haven't found any projects and depth allows
        // But don't go too deep if we've already found structured projects
        const relativePath = path.relative(
          vscode.workspace.workspaceFolders![0].uri.fsPath,
          fullPath
        );
        const depth = relativePath.split(path.sep).length;
        const maxDepth = foundProject ? 3 : 5; // Less depth if we already found projects

        if (depth < maxDepth) {
          await scanForProjectsWithCollection(
            fullPath,
            detectedProjects,
            processedPaths
          );
        } else {
          console.log("Skipping deeper scan for:", fullPath, "depth:", depth);
        }
      }
    }
  } catch (error) {
    console.error("Error scanning projects in", basePath, ":", error);
  }
}

// Helper function to generate a unique key for a project to better match selections
function getProjectKey(
  projectPath: string,
  projectName: string,
  framework: string
): string {
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
  const relativePath = path.relative(workspaceRoot, projectPath);
  return `${relativePath}||${projectName}||${framework}`;
}

// Show project selection dialog
async function showProjectSelectionDialog(
  detectedProjects: Array<{
    name: string;
    fullPath: string;
    type: "frontend" | "backend";
    framework: string;
  }>,
  currentServerPaths?: Set<string>,
  currentServerNames?: Set<string>,
  currentServerNamesLowerCase?: Set<string>
): Promise<
  | Array<{
      name: string;
      fullPath: string;
      type: "frontend" | "backend";
      framework: string;
    }>
  | undefined
> {
  // Create quick pick items
  const quickPickItems = detectedProjects.map((project) => {
    const emoji = project.type === "frontend" ? "🌐" : "⚙️";
    const workspaceRoot =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const relativePath = path.relative(workspaceRoot, project.fullPath);

    // Check if this project was previously selected using multiple matching strategies
    let wasSelected = true; // Default to true for new detections

    if (currentServerPaths && currentServerPaths.size > 0) {
      // Try path-based matching first (most reliable)
      const pathMatch = currentServerPaths.has(relativePath);

      // Try name-based matching as fallback
      const baseName = project.name.includes("(")
        ? project.name.split("(")[0].trim()
        : project.name;
      const nameMatch = currentServerNames
        ? currentServerNames.has(baseName)
        : false;
      const nameLowerMatch = currentServerNamesLowerCase
        ? currentServerNamesLowerCase.has(baseName.toLowerCase())
        : false;

      // Try partial name matching (for cases like "FSP Frontend" matching "FSP")
      let partialNameMatch = false;
      if (currentServerNames) {
        for (const savedName of currentServerNames) {
          if (baseName.includes(savedName) || savedName.includes(baseName)) {
            partialNameMatch = true;
            break;
          }
        }
      }

      // Consider it selected if any matching strategy succeeds
      wasSelected =
        pathMatch || nameMatch || nameLowerMatch || partialNameMatch;

      console.log(`Project: ${project.name}`);
      console.log(`  - Relative path: ${relativePath}`);
      console.log(`  - Base name: ${baseName}`);
      console.log(`  - Path match: ${pathMatch}`);
      console.log(`  - Name match: ${nameMatch}`);
      console.log(`  - Lower name match: ${nameLowerMatch}`);
      console.log(`  - Partial name match: ${partialNameMatch}`);
      console.log(`  - Final selection: ${wasSelected}`);
    }

    return {
      label: `${emoji} ${project.name}`,
      description: `${project.framework} (${project.type})`,
      detail: relativePath,
      picked: wasSelected,
      project: project,
    };
  });

  const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
    canPickMany: true,
    placeHolder:
      currentServerPaths && currentServerPaths.size > 0
        ? "Select projects to keep as default servers (previously selected items are pre-checked)"
        : "Select projects to add as default servers (these will auto-start)",
  });

  return selectedItems?.map((item: any) => item.project);
}
async function scanForProjects(basePath: string) {
  try {
    const entries = await fs.promises.readdir(basePath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(basePath, entry.name);

        // Check if it's a frontend project
        if (await isReactProject(fullPath)) {
          await addDetectedProject(
            entry.name,
            fullPath,
            "frontend",
            "React/Next.js"
          );
        }
        // Check if it's a backend project
        else if (await isSpringBootProject(fullPath)) {
          await addDetectedProject(
            entry.name,
            fullPath,
            "backend",
            "Spring Boot"
          );
        }
        // Check if it's a Node.js project
        else if (await isNodeProject(fullPath)) {
          await addDetectedProject(entry.name, fullPath, "frontend", "Node.js");
        }
      }
    }
  } catch (error) {
    console.error("Error scanning projects:", error);
  }
}

// Check if directory is a React project
async function isReactProject(projectPath: string): Promise<boolean> {
  try {
    const packageJsonPath = path.join(projectPath, "package.json");
    console.log("Checking for React project at:", packageJsonPath);

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(
        await fs.promises.readFile(packageJsonPath, "utf8")
      );

      const hasReact = !!(
        packageJson.dependencies?.react ||
        packageJson.devDependencies?.react ||
        packageJson.dependencies?.next ||
        packageJson.devDependencies?.next
      );

      console.log(
        "React project check result:",
        hasReact,
        "Dependencies:",
        Object.keys(packageJson.dependencies || {})
      );
      return hasReact;
    }

    console.log("No package.json found at:", packageJsonPath);
  } catch (error) {
    console.error("Error checking React project:", error);
  }
  return false;
}

// Check if directory is a Spring Boot project
async function isSpringBootProject(projectPath: string): Promise<boolean> {
  try {
    const pomPath = path.join(projectPath, "pom.xml");
    console.log("Checking for Spring Boot project at:", pomPath);

    if (fs.existsSync(pomPath)) {
      const pomContent = await fs.promises.readFile(pomPath, "utf8");
      const hasSpringBoot = pomContent.includes("spring-boot");
      console.log("Spring Boot project check result:", hasSpringBoot);
      return hasSpringBoot;
    }

    console.log("No pom.xml found at:", pomPath);
  } catch (error) {
    console.error("Error checking Spring Boot project:", error);
  }
  return false;
}

// Check if directory is a Node.js project
async function isNodeProject(projectPath: string): Promise<boolean> {
  try {
    const packageJsonPath = path.join(projectPath, "package.json");
    console.log("Checking for Node.js project at:", packageJsonPath);

    const exists = fs.existsSync(packageJsonPath);
    console.log("Node.js project check result:", exists);
    return exists;
  } catch (error) {
    console.error("Error checking Node.js project:", error);
  }
  return false;
}

// Enhanced Node.js project analysis to determine type and framework
async function analyzeNodeProject(projectPath: string): Promise<{
  type: "frontend" | "backend";
  framework: string;
}> {
  try {
    const packageJsonPath = path.join(projectPath, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

    console.log("Analyzing Node.js project:", projectPath);
    console.log("Package name:", packageJson.name);
    console.log("Dependencies:", Object.keys(packageJson.dependencies || {}));
    console.log(
      "DevDependencies:",
      Object.keys(packageJson.devDependencies || {})
    );
    console.log("Scripts:", Object.keys(packageJson.scripts || {}));

    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    const scripts = packageJson.scripts || {};
    const projectName = packageJson.name || "";
    const description = packageJson.description || "";

    // Check for frontend frameworks
    if (dependencies.react || dependencies["@types/react"]) {
      return { type: "frontend", framework: "React" };
    }
    if (dependencies.next || dependencies["@types/next"]) {
      return { type: "frontend", framework: "Next.js" };
    }
    if (dependencies.vue || dependencies["@vue/cli-service"]) {
      return { type: "frontend", framework: "Vue.js" };
    }
    if (dependencies.angular || dependencies["@angular/core"]) {
      return { type: "frontend", framework: "Angular" };
    }
    if (dependencies.vite) {
      return { type: "frontend", framework: "Vite" };
    }

    // Check for backend frameworks/indicators
    if (dependencies.express) {
      return { type: "backend", framework: "Express.js" };
    }
    if (dependencies.fastify) {
      return { type: "backend", framework: "Fastify" };
    }
    if (dependencies.koa) {
      return { type: "backend", framework: "Koa.js" };
    }
    if (dependencies.nestjs || dependencies["@nestjs/core"]) {
      return { type: "backend", framework: "NestJS" };
    }
    if (dependencies.hapi || dependencies["@hapi/hapi"]) {
      return { type: "backend", framework: "Hapi.js" };
    }

    // Check for database/API related dependencies (likely backend)
    const backendKeywords = [
      "mongoose",
      "sequelize",
      "typeorm",
      "prisma",
      "mysql",
      "postgresql",
      "mongodb",
      "redis",
      "passport",
      "jwt",
      "bcrypt",
      "cors",
      "helmet",
      "morgan",
      "winston",
    ];

    if (backendKeywords.some((keyword) => dependencies[keyword])) {
      return { type: "backend", framework: "Node.js API" };
    }

    // Check scripts for hints
    if (scripts.serve || scripts.dev || scripts.start) {
      const startScript = scripts.start || scripts.dev || scripts.serve || "";

      if (
        startScript.includes("react-scripts") ||
        startScript.includes("next")
      ) {
        return { type: "frontend", framework: "React/Next.js" };
      }
      if (
        startScript.includes("vue-cli-service") ||
        startScript.includes("vite")
      ) {
        return { type: "frontend", framework: "Vue.js/Vite" };
      }
      if (startScript.includes("ng serve") || startScript.includes("angular")) {
        return { type: "frontend", framework: "Angular" };
      }
      if (
        startScript.includes("node") ||
        startScript.includes("nodemon") ||
        startScript.includes("ts-node")
      ) {
        return { type: "backend", framework: "Node.js" };
      }
    }

    // Check project name and description for hints
    const nameAndDesc = (projectName + " " + description).toLowerCase();
    if (
      nameAndDesc.includes("frontend") ||
      nameAndDesc.includes("client") ||
      nameAndDesc.includes("ui") ||
      nameAndDesc.includes("web")
    ) {
      return { type: "frontend", framework: "Node.js" };
    }
    if (
      nameAndDesc.includes("backend") ||
      nameAndDesc.includes("server") ||
      nameAndDesc.includes("api") ||
      nameAndDesc.includes("service")
    ) {
      return { type: "backend", framework: "Node.js" };
    }

    // Default fallback - check if it has typical frontend build tools
    if (
      dependencies.webpack ||
      dependencies.parcel ||
      dependencies["@types/webpack"]
    ) {
      return { type: "frontend", framework: "Node.js" };
    }

    // If we can't determine, default to frontend for Node.js projects
    // (most standalone Node.js projects without backend dependencies are frontend)
    return { type: "frontend", framework: "Node.js" };
  } catch (error) {
    console.error("Error analyzing Node.js project:", error);
    return { type: "frontend", framework: "Node.js" }; // Fallback
  }
}

// Helper function to extract serverId from contextValue (format: "serverId:type")
function extractServerId(contextValue: string): string {
  if (contextValue.includes(":")) {
    return contextValue.split(":")[0];
  }
  return contextValue;
}

// Helper function to format path for terminal commands (cross-platform)
function formatPathForTerminal(relativePath: string): string {
  // Handle empty or current directory paths
  if (!relativePath || relativePath === "." || relativePath === "./") {
    return ".";
  }

  let formattedPath = relativePath;

  // On Windows, convert backslashes to forward slashes for better terminal compatibility
  if (process.platform === "win32") {
    formattedPath = formattedPath.replace(/\\/g, "/");
  }

  // If path contains spaces or special characters, quote it
  if (
    formattedPath.includes(" ") ||
    formattedPath.includes("&") ||
    formattedPath.includes("(") ||
    formattedPath.includes(")") ||
    formattedPath.includes("'") ||
    formattedPath.includes('"')
  ) {
    // Use double quotes and escape any existing double quotes
    formattedPath = `"${formattedPath.replace(/"/g, '\\"')}"`;
  }

  return formattedPath;
}

// Helper function to fix paths in terminal commands (for custom commands)
function fixPathsInCommand(command: string): string {
  if (process.platform !== "win32") {
    return command; // Only fix on Windows
  }

  // Look for cd commands and fix paths in them
  return command.replace(/cd\s+([^\s&|]+)/g, (match, path) => {
    // Don't modify if path is already quoted or if it's a simple path like "."
    if (
      path.startsWith('"') ||
      path.startsWith("'") ||
      path === "." ||
      path === "./"
    ) {
      return match;
    }

    // Convert backslashes to forward slashes
    const fixedPath = path.replace(/\\/g, "/");

    // Quote if necessary
    if (
      fixedPath.includes(" ") ||
      fixedPath.includes("&") ||
      fixedPath.includes("(") ||
      fixedPath.includes(")")
    ) {
      return `cd "${fixedPath}"`;
    }

    return `cd ${fixedPath}`;
  });
}

// Add detected project to configuration
async function addDetectedProject(
  name: string,
  fullPath: string,
  type: "frontend" | "backend",
  framework: string
) {
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
  const relativePath = path.relative(workspaceRoot, fullPath);
  const terminalPath = formatPathForTerminal(relativePath);

  let command = "";
  let emoji = "";

  if (type === "frontend") {
    // Enhanced frontend command detection
    if (framework.toLowerCase().includes("next")) {
      command = `cd ${terminalPath} && npm run dev`;
    } else if (framework.toLowerCase().includes("react")) {
      command = `cd ${terminalPath} && npm start`;
    } else if (framework.toLowerCase().includes("vue")) {
      command = `cd ${terminalPath} && npm run serve`;
    } else if (framework.toLowerCase().includes("angular")) {
      command = `cd ${terminalPath} && ng serve`;
    } else if (framework.toLowerCase().includes("vite")) {
      command = `cd ${terminalPath} && npm run dev`;
    } else {
      // Default Node.js frontend
      command = `cd ${terminalPath} && npm run dev`;
    }
    emoji = "🌐";
  } else {
    // Backend commands
    if (framework.toLowerCase().includes("spring")) {
      // Use mvn spring-boot:run with additional error handling flags
      command = `cd ${terminalPath} && mvn spring-boot:run -Dspring-boot.run.fork=false`;
      console.log(
        `🔧 Using enhanced Spring Boot command for ${name}: ${command}`
      );
    } else if (
      framework.toLowerCase().includes("express") ||
      framework.toLowerCase().includes("fastify") ||
      framework.toLowerCase().includes("nestjs") ||
      framework.toLowerCase().includes("koa") ||
      framework.toLowerCase().includes("hapi") ||
      framework.toLowerCase().includes("node")
    ) {
      // Node.js backend projects - try common start commands
      try {
        const packageJsonPath = path.join(fullPath, "package.json");
        if (fs.existsSync(packageJsonPath)) {
          const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, "utf8")
          );
          const scripts = packageJson.scripts || {};

          if (scripts.dev) {
            command = `cd ${terminalPath} && npm run dev`;
          } else if (scripts.start) {
            command = `cd ${terminalPath} && npm start`;
          } else if (scripts.serve) {
            command = `cd ${terminalPath} && npm run serve`;
          } else {
            // Fallback - assume main entry point
            const main = packageJson.main || "index.js";
            command = `cd ${terminalPath} && node ${main}`;
          }
          console.log(
            `🔧 Using Node.js backend command for ${name}: ${command}`
          );
        } else {
          command = `cd ${terminalPath} && npm start`;
        }
      } catch (error) {
        console.error("Error reading package.json for backend command:", error);
        command = `cd ${terminalPath} && npm start`;
      }
    } else {
      // Default backend command (assume Maven for unknown backends)
      command = `cd ${terminalPath} && mvn spring-boot:run`;
    }
    emoji = "⚙️";
  }

  const id = configManager.generateUniqueId(name);
  const category = type === "frontend" ? "Frontend Servers" : "Backend Servers";

  const newServer: ServerConfig = {
    id,
    name: `${name} (${framework})`,
    type,
    command,
    workingDirectory: relativePath,
    emoji,
    category: category as "Frontend Servers" | "Backend Servers",
  };

  // Check if already exists
  const existing = configManager
    .getServers()
    .find((s) => s.name === newServer.name);
  if (!existing) {
    configManager.addServer(newServer);
    console.log(`Added detected project: ${newServer.name}`);
  }
}

// Install dependencies for a project
async function installDependencies(serverId: string) {
  const serverConfig = configManager.getServerById(serverId);
  if (!serverConfig) {
    vscode.window.showErrorMessage("Server not found!");
    return;
  }

  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
  const projectPath = path.join(workspaceRoot, serverConfig.workingDirectory);

  vscode.window.showInformationMessage(
    `📦 Installing dependencies for ${serverConfig.name}...`
  );

  // Create terminal for dependency installation
  const terminal = vscode.window.createTerminal({
    name: `Install Dependencies - ${serverConfig.name}`,
    cwd: projectPath,
  });

  terminal.show();

  if (serverConfig.type === "frontend") {
    // Check if package.json exists and install npm dependencies
    const packageJsonPath = path.join(projectPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      terminal.sendText("npm install");
    }
  } else if (serverConfig.type === "backend") {
    // Check if pom.xml exists and install maven dependencies
    const pomPath = path.join(projectPath, "pom.xml");
    if (fs.existsSync(pomPath)) {
      terminal.sendText("mvn clean install");
    }
  }
}

// Install all dependencies for all projects
async function installAllDependencies() {
  const servers = configManager.getServers();

  if (servers.length === 0) {
    vscode.window.showWarningMessage(
      "No servers configured! Use auto-detect to find projects."
    );
    return;
  }

  vscode.window.showInformationMessage(
    "� Downloading dependencies for all projects..."
  );

  // Install dependencies for all servers with progress
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "📥 Ninja downloading all dependencies...",
      cancellable: false,
    },
    async (progress) => {
      const totalServers = servers.length;

      for (let i = 0; i < servers.length; i++) {
        const server = servers[i];
        const percentage = Math.round(((i + 1) / totalServers) * 100);

        progress.report({
          increment: percentage / totalServers,
          message: `Downloading for ${server.name}...`,
        });

        await installDependencies(server.id);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      progress.report({
        increment: 100,
        message: "All downloads complete! 📦",
      });
    }
  );

  vscode.window.showInformationMessage(
    "✅ Dependencies download started for all projects!"
  );
}

// Create status bar with server controls
function createStatusBar() {
  // Clear existing status bar items
  statusBarItems.forEach((item) => item.dispose());
  statusBarItems = [];

  const servers = configManager.getServers();
  const runningCount = Object.keys(terminals).length;

  // Main status item
  const mainStatus = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  mainStatus.text = `🥷 Servers: ${runningCount}/${servers.length}`;
  mainStatus.tooltip = "Ninja Runner - Click to open view";
  mainStatus.command = "serverRunner.showView";
  mainStatus.show();
  statusBarItems.push(mainStatus);

  // Start All button
  const startAll = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    99
  );
  startAll.text = "$(play) Start All";
  startAll.tooltip = "Start all servers";
  startAll.command = "serverRunner.startAllServers";
  startAll.show();
  statusBarItems.push(startAll);

  // Stop All button
  const stopAll = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    98
  );
  stopAll.text = "$(stop) Stop All";
  stopAll.tooltip = "Stop all servers";
  stopAll.command = "serverRunner.stopAllServers";
  stopAll.show();
  statusBarItems.push(stopAll);
}

// Save user preferences to workspace state
function saveUserPreferences() {
  const servers = configManager.getServers();
  extensionContext.workspaceState.update("ninja-runner-servers", servers);
}

// Load user preferences from workspace state
function loadUserPreferences() {
  const savedServers = extensionContext.workspaceState.get<ServerConfig[]>(
    "ninja-runner-servers"
  );
  if (savedServers && savedServers.length > 0) {
    // Clear current servers and load saved ones
    configManager.clearAllServers();
    savedServers.forEach((server) => {
      configManager.addServer(server);
    });
    serverProvider.refresh();
    console.log(`🥷 Loaded ${savedServers.length} saved server configurations`);
  }
}

// Trigger build for specific environment and project
async function triggerBuild(environment: string, projectPath: string) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showErrorMessage("❌ No workspace folder found!");
    return;
  }

  // Find build.sh in the specific project path
  const buildScriptPath = await findBuildScriptInProject(projectPath);
  if (!buildScriptPath) {
    vscode.window.showErrorMessage(`❌ build.sh not found in ${projectPath}!`);
    return;
  }

  console.log(`✅ Found build.sh at: ${buildScriptPath}`);
  const buildScriptDir = path.dirname(buildScriptPath);
  const projectName = path.basename(projectPath);

  // Check if build.sh has the completion marker
  const buildScriptContent = fs.readFileSync(buildScriptPath, "utf8");
  const hasMarker = buildScriptContent.includes("NINJA_BUILD_COMPLETE");

  if (!hasMarker) {
    const action = await vscode.window.showWarningMessage(
      `⚠️ ${projectName}'s build.sh needs updating for automatic frontend restart. Add completion marker?`,
      "Add Marker",
      "Show Instructions",
      "Skip"
    );

    if (action === "Add Marker") {
      // Automatically patch the build.sh
      await patchBuildScript(buildScriptPath);
      vscode.window.showInformationMessage(
        `✅ Updated ${projectName}/build.sh with completion marker!`
      );
    } else if (action === "Show Instructions") {
      const guideUri = vscode.Uri.file(
        path.join(extensionContext.extensionPath, "BUILD_INTEGRATION.md")
      );
      await vscode.commands.executeCommand("vscode.open", guideUri);
      return;
    }
  }

  // Find application.properties file
  const appPropertiesPath = await findApplicationProperties(buildScriptDir);

  if (appPropertiesPath) {
    // Update spring.profiles.active in application.properties
    try {
      const content = fs.readFileSync(appPropertiesPath, "utf8");
      const updatedContent = content.replace(
        /spring\.profiles\.active\s*=\s*\w+/,
        `spring.profiles.active = ${environment}`
      );
      fs.writeFileSync(appPropertiesPath, updatedContent, "utf8");
      console.log(`✅ Updated spring.profiles.active to ${environment}`);
      vscode.window.showInformationMessage(
        `✅ Updated profile to ${environment}`
      );
    } catch (error) {
      console.error("Error updating application.properties:", error);
      vscode.window.showErrorMessage(
        "⚠️ Could not update application.properties, continuing with build..."
      );
    }
  } else {
    console.log("⚠️ application.properties not found, skipping profile update");
  }

  // Show progress notification
  vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `🏗️ Building ${projectName} for ${environment.toUpperCase()}...`,
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0, message: "Starting build process..." });

      // Create a dedicated terminal for the build
      const buildTerminal = vscode.window.createTerminal({
        name: `🏗️ ${projectName} Build (${environment})`,
        cwd: buildScriptDir,
      });

      buildTerminal.show();

      // Execute build command
      const envArg = environment === "dev" ? "" : environment;
      const buildCommand = `./build.sh zip war ${envArg}`.trim();

      console.log(`🏗️ Executing: ${buildCommand}`);

      // Execute build and monitor for completion
      buildTerminal.sendText(buildCommand);

      progress.report({ increment: 10, message: "Build in progress..." });

      // Check for completion marker file (build.sh will create this)
      const markerFile = path.join(buildScriptDir, ".ninja_build_complete");

      // Remove old marker if exists
      if (fs.existsSync(markerFile)) {
        fs.unlinkSync(markerFile);
      }

      // Wait for build completion (check for marker file or timeout)
      const maxWaitTime = 120000; // 120 seconds max
      const checkInterval = 2000; // Check every 2 seconds
      let elapsedTime = 0;
      let buildComplete = false;

      while (!buildComplete && elapsedTime < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        elapsedTime += checkInterval;

        // Check if marker file exists
        if (fs.existsSync(markerFile)) {
          buildComplete = true;
          console.log("✅ Build completion marker detected!");
          // Clean up marker file
          fs.unlinkSync(markerFile);
          break;
        }

        // Update progress every 5 seconds
        if (elapsedTime % 5000 === 0) {
          const progressPercent = Math.min(
            70,
            10 + Math.floor((elapsedTime / maxWaitTime) * 60)
          );
          progress.report({
            message: `Building... (${Math.floor(elapsedTime / 1000)}s)`,
          });
        }
      }

      if (buildComplete) {
        console.log("✅ Build completed successfully!");
        progress.report({
          increment: 80,
          message: "Build complete! Finalizing...",
        });
      } else {
        console.log("⚠️ Build timeout - proceeding anyway");
        progress.report({
          increment: 80,
          message: "Build timeout - finalizing...",
        });
      }

      // Give a moment for file system to sync
      await new Promise((resolve) => setTimeout(resolve, 2000));

      progress.report({ increment: 90, message: "Resetting profile..." });

      // Reset spring.profiles.active back to dev
      if (appPropertiesPath) {
        try {
          const content = fs.readFileSync(appPropertiesPath, "utf8");
          const updatedContent = content.replace(
            /spring\.profiles\.active\s*=\s*\w+/,
            `spring.profiles.active = dev`
          );
          fs.writeFileSync(appPropertiesPath, updatedContent, "utf8");
          console.log(`✅ Reset spring.profiles.active back to dev`);
        } catch (error) {
          console.error("Error resetting application.properties:", error);
        }
      }

      progress.report({ increment: 100, message: "Done!" });

      vscode.window.showInformationMessage(
        `🎉 ${projectName} ${environment.toUpperCase()} build completed! Profile reset to dev, frontend auto-restarted by build.sh`
      );
    }
  );
}

// Find build.sh in specific project path
async function findBuildScriptInProject(
  projectPath: string
): Promise<string | null> {
  // Check common locations within the project
  const commonPaths = [
    path.join(projectPath, "build.sh"),
    path.join(projectPath, "backend", "build.sh"),
  ];

  for (const scriptPath of commonPaths) {
    if (fs.existsSync(scriptPath)) {
      console.log(`✅ Found build.sh at: ${scriptPath}`);
      return scriptPath;
    }
  }

  // Search recursively within the project path
  try {
    const projectName = path.basename(projectPath);
    const files = await vscode.workspace.findFiles(
      `**/${projectName}/**/build.sh`,
      "**/node_modules/**",
      1
    );

    if (files.length > 0) {
      console.log(`✅ Found build.sh at: ${files[0].fsPath}`);
      return files[0].fsPath;
    }
  } catch (error) {
    console.error("Error searching for build.sh:", error);
  }

  return null;
}

// Find application.properties file in workspace
async function findApplicationProperties(
  searchRoot: string
): Promise<string | null> {
  const commonPaths = [
    "backend/src/main/resources/application.properties",
    "src/main/resources/application.properties",
    "application.properties",
  ];

  for (const relativePath of commonPaths) {
    const fullPath = path.join(searchRoot, relativePath);
    if (fs.existsSync(fullPath)) {
      console.log(`✅ Found application.properties at: ${fullPath}`);
      return fullPath;
    }
  }

  // If not found in common paths, search recursively in the workspace
  try {
    const files = await vscode.workspace.findFiles(
      "**/application.properties",
      "**/node_modules/**",
      1
    );
    if (files.length > 0) {
      console.log(`✅ Found application.properties at: ${files[0].fsPath}`);
      return files[0].fsPath;
    }
  } catch (error) {
    console.error("Error searching for application.properties:", error);
  }

  return null;
}

// Restart the matching frontend server for the backend being built
async function restartMatchingFrontendServer(buildDir: string) {
  const frontendServers =
    configManager.getServersByCategory("Frontend Servers");

  // Try to find the frontend that matches this backend
  // buildDir is like: /path/to/NEXTGEN-OCBIS/Publication
  // We want to find frontend in: /path/to/NEXTGEN-OCBIS/Publication/frontend
  const projectRoot = buildDir; // This is already the Publication folder

  for (const server of frontendServers) {
    // Check if frontend server is in the same project (e.g., Publication/frontend)
    const serverDir = server.workingDirectory;

    // If frontend's working directory contains the project root path, it's a match
    if (
      serverDir.includes(projectRoot) &&
      serverProvider.isServerRunning(server.id)
    ) {
      console.log(
        `🔄 Restarting matching frontend server: ${server.name} at ${serverDir}`
      );

      // Stop the running frontend server first
      await stopServer(server.id);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Use build.sh to rebuild and restart the frontend with dev environment
      const buildScriptPath = path.join(projectRoot, "build.sh");

      if (fs.existsSync(buildScriptPath)) {
        console.log(
          `🚀 Running ./build.sh dev to rebuild frontend at ${projectRoot}`
        );

        // Create a new terminal for the dev build
        const buildTerminal = vscode.window.createTerminal({
          name: `🔄 Frontend Rebuild: ${server.name}`,
          cwd: projectRoot,
        });

        buildTerminal.show();
        buildTerminal.sendText(`./build.sh dev`);

        vscode.window.showInformationMessage(
          `🔄 Rebuilding and restarting frontend: ${server.name}`
        );
      } else {
        console.log(`⚠️ build.sh not found, using standard restart`);
        // Fallback to normal restart
        startServer(server.name, server.command, server.id);
        vscode.window.showInformationMessage(
          `🔄 Restarted frontend: ${server.name}`
        );
      }
      return;
    }
  }

  console.log(
    `⚠️ No matching frontend server found for project at ${buildDir}`
  );
}

// Automatically patch build.sh with completion marker
async function patchBuildScript(buildScriptPath: string): Promise<void> {
  try {
    let content = fs.readFileSync(buildScriptPath, "utf8");

    // 1. Add dev mode after the dir variable declaration
    const dirPattern =
      /dir="\$\(cd -P -- "\$\(dirname -- "\$0"\)" && pwd -P\)"/;
    const devModeCode = `

# Handle dev mode - kill existing and start fresh frontend
if [[ $@ == *"dev"* ]]; then
  cd "$dir/frontend"
  
  echo "🛑 Killing frontend process for $(basename "$dir")..."
  
  # Find node processes running from THIS specific frontend directory
  pids=$(lsof -ti -sTCP:LISTEN -a -c node 2>/dev/null | while read pid; do
    cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null || echo "")
    # Check if this process is running from our frontend directory
    if [[ "$cwd" == "$dir/frontend"* ]]; then
      echo "$pid"
    fi
  done)
  
  if [ -n "$pids" ]; then
    echo "Found frontend process(es): $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    echo "✅ Killed frontend for $(basename "$dir")"
  else
    echo "ℹ️  No running frontend found for $(basename "$dir")"
  fi
  
  # Wait for cleanup
  sleep 2
  
  echo "🚀 Starting fresh frontend server for $(basename "$dir")..."
  npm start
  exit 0
fi`;

    if (
      dirPattern.test(content) &&
      !content.includes('if [[ $@ == *"dev"* ]]; then')
    ) {
      content = content.replace(
        dirPattern,
        `dir="$(cd -P -- "$(dirname -- "$0")" && pwd -P)"${devModeCode}`
      );
      console.log(`✅ Added dev mode to build.sh`);
    }

    // 2. Find the location after "✔ built: ZIP" line and add completion marker + auto-restart
    const zipBuiltPattern = /echo "✔ built: ZIP \$env_label"/;
    const markerCode = `
  
  # Signal completion for automation tools
  echo ""
  echo "🎉 NINJA_BUILD_COMPLETE 🎉"
  echo ""
  touch "$dir/.ninja_build_complete"
  
  # Auto-restart frontend after build completion
  echo ""
  echo "🔄 Killing all frontend servers on ports 3000-3030..."
  
  # Kill all processes on ports 3000-3030
  killed_ports=""
  for port in {3000..3030}; do
    pids=$(lsof -ti:$port 2>/dev/null || echo "")
    if [ -n "$pids" ]; then
      echo "🛑 Killing processes on port $port: $pids"
      echo "$pids" | xargs kill -9 2>/dev/null || true
      killed_ports="$killed_ports $port"
    fi
  done
  
  if [ -n "$killed_ports" ]; then
    echo "✅ Killed processes on ports:$killed_ports"
  else
    echo "ℹ️  No processes found on ports 3000-3030"
  fi
  
  # Wait for ports to be freed
  sleep 3
  
  echo ""
  echo "🚀 Starting frontends..."
  
  # Get parent directory (NEXTGEN-OCBIS)
  parent_dir=$(dirname "$dir")
  
  # Start Auth project frontend
  auth_frontend="$parent_dir/Auth/frontend"
  if [ -d "$auth_frontend" ]; then
    cd "$auth_frontend"
    echo "🔐 Starting Auth frontend from: $(pwd)"
    nohup npm start > "$parent_dir/Auth/auth-frontend.log" 2>&1 &
    auth_pid=$!
    echo "✅ Auth frontend started (PID: $auth_pid)"
    sleep 2
  else
    echo "ℹ️  Auth frontend not found at: $auth_frontend"
  fi
  
  # Start current project frontend
  current_frontend="$dir/frontend"
  if [ -d "$current_frontend" ]; then
    cd "$current_frontend"
    echo "📦 Starting $(basename "$dir") frontend from: $(pwd)"
    nohup npm start > "$dir/frontend.log" 2>&1 &
    current_pid=$!
    echo "✅ $(basename "$dir") frontend started (PID: $current_pid)"
  else
    echo "⚠️  Frontend directory not found: $current_frontend"
  fi
  
  cd "$dir"
  echo ""
  echo "🎉 Frontend restart complete!"
  echo "📝 Logs:"
  echo "   - Auth: $parent_dir/Auth/auth-frontend.log"
  echo "   - $(basename "$dir"): $dir/frontend.log"`;

    if (
      zipBuiltPattern.test(content) &&
      !content.includes("NINJA_BUILD_COMPLETE")
    ) {
      content = content.replace(
        zipBuiltPattern,
        `echo "✔ built: ZIP $env_label"${markerCode}`
      );
      console.log(`✅ Added completion marker and auto-restart to build.sh`);
    }

    fs.writeFileSync(buildScriptPath, content, "utf8");
    console.log(`✅ Patched build.sh at: ${buildScriptPath}`);
  } catch (error) {
    console.error("Error patching build.sh:", error);
    throw error;
  }
}

// Check for extension updates and notify user
async function checkForUpdates(context: vscode.ExtensionContext) {
  // Check if we've already notified about this version
  const lastNotifiedVersion = context.globalState.get(
    "lastNotifiedVersion",
    "0.0.0"
  );

  try {
    // Read the current version from package.json
    const packageJsonPath = path.join(context.extensionPath, "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const installedVersion = packageJson.version;
    const extensionName = packageJson.displayName || packageJson.name;

    console.log(`🔍 Current version: ${installedVersion}`);
    console.log(`📦 Extension: ${extensionName}`);

    // Show update notification if this is a first run after update
    if (
      installedVersion !== lastNotifiedVersion &&
      lastNotifiedVersion !== "0.0.0"
    ) {
      const action = await vscode.window.showInformationMessage(
        `🎉 ${extensionName} has been updated to v${installedVersion}! Check out the new features.`,
        "View Changelog",
        "What's New",
        "Dismiss"
      );

      if (action === "View Changelog") {
        const changelogPath = path.join(context.extensionPath, "CHANGELOG.md");
        const changelogUri = vscode.Uri.file(changelogPath);
        await vscode.commands.executeCommand("vscode.open", changelogUri);
      } else if (action === "What's New") {
        vscode.window.showInformationMessage(
          "Latest improvements: Windows path fix for cd commands, better cross-platform compatibility!"
        );
      }
    }

    // Update the last notified version
    await context.globalState.update("lastNotifiedVersion", installedVersion);

    // Show welcome message for new users (less intrusive)
    if (lastNotifiedVersion === "0.0.0") {
      // Only show a subtle notification, not a popup
      console.log("🥷 Welcome to Ninja Runner! New user detected.");

      // Show a less intrusive message after a delay, and only if no servers are configured
      setTimeout(() => {
        const servers = configManager.getServers();
        if (servers.length === 0) {
          vscode.window
            .showInformationMessage(
              "🥷 Welcome to Ninja Runner! Auto-detecting your projects...",
              "Open Ninja Runner"
            )
            .then((selection) => {
              if (selection === "Open Ninja Runner") {
                vscode.commands.executeCommand("serverRunner.showView");
              }
            });
        }
      }, 3000);
    }
  } catch (error) {
    console.error("Error checking for updates:", error);
  }
}

// Helper function to prompt users to reload VS Code after marketplace update
function showReloadPrompt() {
  vscode.window
    .showInformationMessage(
      "🔄 Ninja Runner has been updated! Please reload VS Code to use the latest features.",
      "Reload Now",
      "Later"
    )
    .then((selection) => {
      if (selection === "Reload Now") {
        vscode.commands.executeCommand("workbench.action.reloadWindow");
      }
    });
}

export function deactivate() {
  // Stop all debug sessions
  Object.entries(debugSessions).forEach(([serverId, session]) => {
    console.log(`🐛 Stopping debug session for server: ${serverId}`);
    vscode.debug.stopDebugging(session);
  });
  debugSessions = {};
  debugPorts = {};

  // Clean up terminals when extension is deactivated
  Object.values(terminals).forEach((terminal) => {
    if (terminal.exitStatus === undefined) {
      terminal.dispose();
    }
  });
  terminals = {};

  // Reset debug port counters
  nextJavaDebugPort = 5005;
  nextNodeDebugPort = 9229;

  // Clean up status bar items
  statusBarItems.forEach((item) => item.dispose());
  statusBarItems = [];
}
