import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { ServerRunnerProvider, ServerItem } from "./serverProvider";
import { ServerConfigManager, ServerConfig } from "./serverConfig";

let terminals: { [key: string]: vscode.Terminal } = {};
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
        installDependencies(item.contextValue);
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
      (serverId: string) => {
        const serverConfig = configManager.getServerById(serverId);
        if (serverConfig) {
          startServer(serverConfig.name, serverConfig.command, serverId);
        }
      }
    ),

    vscode.commands.registerCommand(
      "serverRunner.retryServer",
      (serverId: string) => {
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
          stopServer(item.contextValue);
        }
      }
    ),

    vscode.commands.registerCommand("serverRunner.checkForUpdates", () => {
      checkForUpdates(extensionContext);
    }),
  ];

  context.subscriptions.push(...disposables);

  // Start periodic status monitoring
  startServerStatusMonitoring();
}

function autoStartAllServersOnActivation() {
  const servers = configManager.getServers();

  if (servers.length === 0) {
    vscode.window.showInformationMessage(
      "🔍 No servers found. Auto-detecting projects..."
    );
    autoDetectProjects();
    return;
  }

  vscode.window.showInformationMessage("🥷 Ninja Auto-Starting All Servers...");

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
          `🔍 Terminal for ${server.name} has exited with status:`,
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

      // Only update to running if we're not already tracking it as running/starting/error
      else if (currentStatus === "stopped") {
        serverProvider.updateServerStatus(server.id, "running");
      }
    });
  }, 2000); // Check every 2 seconds for more responsive updates
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
  saveUserPreferences();
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

  // Initially set server status to starting, will be updated by monitoring
  serverProvider.updateServerStatus(terminalKey, "starting");

  // Set up a more robust server health check with error detection
  let healthCheckAttempts = 0;
  const maxHealthCheckAttempts = 6; // Check for 6 times over 12 seconds
  let hasShownOutput = false;

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

      // If terminal exited quickly OR with non-zero exit code, it likely failed
      if (healthCheckAttempts <= 2 || (exitStatus && exitStatus.code !== 0)) {
        serverProvider.updateServerStatus(terminalKey, "error");
        vscode.window.showErrorMessage(
          `🔴 ${name} failed to start - check terminal for errors`
        );
      } else {
        serverProvider.updateServerStatus(terminalKey, "stopped");
      }
      return;
    }

    // After reasonable attempts, if terminal is still alive, consider server running
    if (healthCheckAttempts >= 3) {
      // Wait at least 6 seconds before marking as running
      clearInterval(healthCheck);
      serverProvider.updateServerStatus(terminalKey, "running");

      // Show success message only once
      if (!hasShownOutput) {
        vscode.window.showInformationMessage(
          `✅ ${name} started successfully!`
        );
        hasShownOutput = true;
      }
      return;
    }

    // If we've exceeded max attempts and server isn't clearly running, be more conservative
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
          vscode.window.showInformationMessage(
            `✅ ${name} appears to be running`
          );
          hasShownOutput = true;
        }
      } else {
        serverProvider.updateServerStatus(terminalKey, "error");
      }
    }
  }, 2000); // Check every 2 seconds

  // Clean up terminal reference when it exits or closes
  const onCloseDisposable = vscode.window.onDidCloseTerminal(
    (closedTerminal) => {
      if (closedTerminal === terminal) {
        delete terminals[terminalKey];
        serverProvider.updateServerStatus(terminalKey, "stopped");
        console.log(`🛑 Terminal for ${name} was closed`);
        onCloseDisposable.dispose();
      }
    }
  );

  vscode.window.showInformationMessage(`🥷 Ninja launching ${name}...`);
}

function startAllServers() {
  const servers = configManager.getServers();

  if (servers.length === 0) {
    vscode.window.showWarningMessage(
      "No servers configured! Use auto-detect to find projects."
    );
    return;
  }

  vscode.window.showInformationMessage("🚀 Ninja launching all servers...");

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
    vscode.window.showInformationMessage("🔍 No servers found running, ninja!");
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

  // First, scan and collect all potential projects
  const detectedProjects: Array<{
    name: string;
    fullPath: string;
    type: "frontend" | "backend";
    framework: string;
  }> = [];

  for (const folder of workspaceFolders) {
    await scanForProjectsWithCollection(folder.uri.fsPath, detectedProjects);
  }

  if (detectedProjects.length === 0) {
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
    detectedProjects,
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

// Scan directory for frontend/backend projects and collect them
async function scanForProjectsWithCollection(
  basePath: string,
  detectedProjects: Array<{
    name: string;
    fullPath: string;
    type: "frontend" | "backend";
    framework: string;
  }>
) {
  try {
    console.log("Scanning directory:", basePath);

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
                    console.log("Found nested React project:", projectName);
                    detectedProjects.push({
                      name: projectName,
                      fullPath: subPath,
                      type: "frontend",
                      framework: "React/Next.js",
                    });
                    foundProject = true;
                  } else if (await isNodeProject(subPath)) {
                    const projectName = `${entry.name} Frontend`;
                    console.log("Found nested Node.js project:", projectName);
                    detectedProjects.push({
                      name: projectName,
                      fullPath: subPath,
                      type: "frontend",
                      framework: "Node.js",
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
                    const projectName = `${entry.name} Backend`;
                    console.log(
                      "Found nested Node.js backend project:",
                      projectName
                    );
                    detectedProjects.push({
                      name: projectName,
                      fullPath: subPath,
                      type: "backend",
                      framework: "Node.js",
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
            const projectName = `${getProjectDisplayName(
              fullPath,
              entry.name
            )}`;
            console.log("Found direct Node.js project:", projectName);
            detectedProjects.push({
              name: projectName,
              fullPath,
              type: "frontend",
              framework: "Node.js",
            });
            foundProject = true;
          }
        }

        // Continue scanning deeper only if we haven't found any projects and depth allows
        if (!foundProject) {
          const relativePath = path.relative(process.cwd(), basePath);
          const depth = relativePath.split(path.sep).length;
          const maxDepth = 4; // Reduced depth to prevent excessive scanning

          if (depth < maxDepth) {
            await scanForProjectsWithCollection(fullPath, detectedProjects);
          }
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
    command = `cd ${terminalPath} && npm run dev`;
    emoji = "🌐";
  } else {
    command = `cd ${terminalPath} && mvn spring-boot:run`;
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

    // Show welcome message for new users
    if (lastNotifiedVersion === "0.0.0") {
      setTimeout(() => {
        vscode.window
          .showInformationMessage(
            "🥷 Welcome to Ninja Runner! Click the Ninja icon in the sidebar to get started.",
            "Open Ninja Runner",
            "View Documentation"
          )
          .then((selection) => {
            if (selection === "Open Ninja Runner") {
              vscode.commands.executeCommand("serverRunner.showView");
            } else if (selection === "View Documentation") {
              const readmePath = path.join(context.extensionPath, "README.md");
              const readmeUri = vscode.Uri.file(readmePath);
              vscode.commands.executeCommand("vscode.open", readmeUri);
            }
          });
      }, 2000);
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
  // Clean up terminals when extension is deactivated
  Object.values(terminals).forEach((terminal) => {
    if (terminal.exitStatus === undefined) {
      terminal.dispose();
    }
  });
  terminals = {};

  // Clean up status bar items
  statusBarItems.forEach((item) => item.dispose());
  statusBarItems = [];
}
