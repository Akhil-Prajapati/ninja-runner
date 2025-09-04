"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const serverProvider_1 = require("./serverProvider");
const serverConfig_1 = require("./serverConfig");
let terminals = {};
let serverProvider;
let configManager;
let statusBarItems = [];
let isAutoDetectDone = false;
let extensionContext;
function activate(context) {
    console.log("🥷 Ninja Runner extension is now active!");
    // Store extension context for persistence
    extensionContext = context;
    // Set context to show the view
    vscode.commands.executeCommand("setContext", "serverRunnerEnabled", true);
    configManager = serverConfig_1.ServerConfigManager.getInstance();
    serverProvider = new serverProvider_1.ServerRunnerProvider();
    vscode.window.registerTreeDataProvider("serverRunnerView", serverProvider);
    // Load saved user preferences
    loadUserPreferences();
    // Auto-detect projects on first activation only if no saved preferences
    if (!isAutoDetectDone && configManager.getServers().length === 0) {
        setTimeout(() => {
            autoDetectProjects();
            isAutoDetectDone = true;
        }, 1000);
    }
    // Auto-start servers and show sidebar every time the view is focused (activity bar icon clicked)
    const onViewVisible = vscode.commands.registerCommand("serverRunnerView.focus", async () => {
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
        await vscode.commands.executeCommand("workbench.view.extension.serverRunner");
    });
    // Command specifically for activity bar icon click
    const onActivityBarClick = vscode.commands.registerCommand("serverRunner.showView", async () => {
        // Auto-detect if not done yet
        if (!isAutoDetectDone) {
            await autoDetectProjects();
            isAutoDetectDone = true;
        }
        // Start all servers immediately
        autoStartAllServersOnActivation();
        // Show the server runner view in the sidebar
        await vscode.commands.executeCommand("workbench.view.extension.serverRunner");
        // Focus on the specific view
        await vscode.commands.executeCommand("serverRunnerView.focus");
    });
    // Auto-detect projects command
    const autoDetectCommand = vscode.commands.registerCommand("serverRunner.autoDetectProjects", () => {
        autoDetectProjects();
    });
    // Reset configuration command
    const resetConfigCommand = vscode.commands.registerCommand("serverRunner.resetConfiguration", async () => {
        const confirmation = await vscode.window.showWarningMessage("🔄 This will clear all current server configurations and let you reselect projects. Continue?", { modal: true }, "Yes, Reset", "Cancel");
        if (confirmation === "Yes, Reset") {
            // Clear saved preferences
            extensionContext.workspaceState.update("ninja-runner-servers", undefined);
            // Trigger auto-detection with user selection
            await autoDetectProjects();
        }
    });
    // Install dependencies command
    const installDepsCommand = vscode.commands.registerCommand("serverRunner.installDependencies", (item) => {
        if (item.contextValue) {
            installDependencies(item.contextValue);
        }
    });
    // Install all dependencies command
    const installAllDepsCommand = vscode.commands.registerCommand("serverRunner.installAllDependencies", () => {
        installAllDependencies();
    });
    // Status bar commands
    const showStatusBarCommand = vscode.commands.registerCommand("serverRunner.showStatusBar", () => {
        createStatusBar();
    });
    // Register commands
    const disposables = [
        onViewVisible,
        onActivityBarClick,
        autoDetectCommand,
        resetConfigCommand,
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
        vscode.commands.registerCommand("serverRunner.startDynamicServer", (serverId) => {
            const serverConfig = configManager.getServerById(serverId);
            if (serverConfig) {
                startServer(serverConfig.name, serverConfig.command, serverId);
            }
        }),
        vscode.commands.registerCommand("serverRunner.addServer", () => {
            addNewServer();
        }),
        vscode.commands.registerCommand("serverRunner.editServer", (item) => {
            if (item.contextValue) {
                editServer(item.contextValue);
            }
        }),
        vscode.commands.registerCommand("serverRunner.deleteServer", (item) => {
            if (item.contextValue) {
                deleteServer(item.contextValue);
            }
        }),
    ];
    context.subscriptions.push(...disposables);
    // Start periodic status monitoring
    startServerStatusMonitoring();
}
exports.activate = activate;
function autoStartAllServersOnActivation() {
    const servers = configManager.getServers();
    if (servers.length === 0) {
        vscode.window.showInformationMessage("🔍 No servers found. Auto-detecting projects...");
        autoDetectProjects();
        return;
    }
    vscode.window.showInformationMessage("🥷 Ninja Auto-Starting All Servers...");
    // Show progress notification
    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "🚀 Ninja launching all servers...",
        cancellable: false,
    }, async (progress) => {
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
                vscode.window.showInformationMessage("🎯 All ninja servers are now running!");
                createStatusBar();
                resolve(undefined);
            }, 500);
        });
    });
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
    if (!name)
        return;
    const type = await vscode.window.showQuickPick(["frontend", "backend"], {
        placeHolder: "Select server type",
    });
    if (!type)
        return;
    const command = await vscode.window.showInputBox({
        prompt: "Enter the command to start the server",
        placeHolder: "e.g., cd my-project && npm start",
    });
    if (!command)
        return;
    const workingDirectory = await vscode.window.showInputBox({
        prompt: "Enter working directory (relative to workspace)",
        placeHolder: "e.g., my-project",
    });
    if (!workingDirectory)
        return;
    const emoji = await vscode.window.showInputBox({
        prompt: "Enter an emoji for the server",
        placeHolder: "e.g., 🚀",
        value: type === "frontend" ? "🌐" : "⚙️",
    });
    const id = configManager.generateUniqueId(name);
    const category = type === "frontend" ? "Frontend Servers" : "Backend Servers";
    const newServer = {
        id,
        name,
        type: type,
        command,
        workingDirectory,
        emoji: emoji || (type === "frontend" ? "🌐" : "⚙️"),
        category: category,
    };
    configManager.addServer(newServer);
    saveUserPreferences();
    serverProvider.refresh();
    vscode.window.showInformationMessage(`🥷 Ninja added ${name} server!`);
}
async function editServer(serverId) {
    const serverConfig = configManager.getServerById(serverId);
    if (!serverConfig) {
        vscode.window.showErrorMessage("Server not found!");
        return;
    }
    const name = await vscode.window.showInputBox({
        prompt: "Enter server name",
        value: serverConfig.name,
    });
    if (!name)
        return;
    const command = await vscode.window.showInputBox({
        prompt: "Enter the command to start the server",
        value: serverConfig.command,
    });
    if (!command)
        return;
    const workingDirectory = await vscode.window.showInputBox({
        prompt: "Enter working directory (relative to workspace)",
        value: serverConfig.workingDirectory,
    });
    if (!workingDirectory)
        return;
    const emoji = await vscode.window.showInputBox({
        prompt: "Enter an emoji for the server",
        value: serverConfig.emoji,
    });
    const updatedServer = {
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
async function deleteServer(serverId) {
    const serverConfig = configManager.getServerById(serverId);
    if (!serverConfig) {
        vscode.window.showErrorMessage("Server not found!");
        return;
    }
    const confirmation = await vscode.window.showWarningMessage(`Are you sure you want to delete ${serverConfig.name}?`, { modal: true }, "Yes", "No");
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
        vscode.window.showInformationMessage(`🥷 Ninja removed ${serverConfig.name} server!`);
    }
}
function startServer(name, command, terminalKey) {
    // Check if terminal already exists and is running
    if (terminals[terminalKey] &&
        terminals[terminalKey].exitStatus === undefined) {
        vscode.window.showInformationMessage(`⚡ ${name} is already running like a ninja!`);
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
    const servers = configManager.getServers();
    if (servers.length === 0) {
        vscode.window.showWarningMessage("No servers configured! Use auto-detect to find projects.");
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
    const activeTerminals = Object.values(terminals).filter((terminal) => terminal.exitStatus === undefined);
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
    vscode.window.showInformationMessage("🛑 All servers stopped by ninja power!");
}
// Auto-detect frontend and backend projects
async function autoDetectProjects() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        vscode.window.showWarningMessage("No workspace folder found!");
        return;
    }
    // Clear existing servers first
    configManager.clearAllServers();
    vscode.window.showInformationMessage("🔍 Auto-detecting projects...");
    // First, scan and collect all potential projects
    const detectedProjects = [];
    for (const folder of workspaceFolders) {
        await scanForProjectsWithCollection(folder.uri.fsPath, detectedProjects);
    }
    if (detectedProjects.length === 0) {
        vscode.window.showWarningMessage("🥷 No projects detected in workspace!\n\n" +
            "Make sure your workspace contains:\n" +
            "• Frontend projects with package.json\n" +
            "• Backend projects with pom.xml (Spring Boot)\n" +
            "• Projects not in node_modules or build folders\n\n" +
            "Check VS Code OUTPUT panel for scan details.");
        // Log workspace structure for debugging
        console.log("Workspace folders:", workspaceFolders.map((f) => f.uri.fsPath));
        return;
    }
    // Show user selection dialog
    const selectedProjects = await showProjectSelectionDialog(detectedProjects);
    if (selectedProjects && selectedProjects.length > 0) {
        // Add selected projects to configuration
        for (const project of selectedProjects) {
            await addDetectedProject(project.name, project.fullPath, project.type, project.framework);
        }
        // Save user preferences
        saveUserPreferences();
        serverProvider.refresh();
        vscode.window.showInformationMessage(`✅ Added ${selectedProjects.length} selected projects as defaults!`);
    }
    else {
        vscode.window.showInformationMessage("No projects selected.");
    }
}
// Helper function to create meaningful project names
function getProjectDisplayName(fullPath, folderName) {
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
async function scanForProjectsWithCollection(basePath, detectedProjects) {
    try {
        console.log("Scanning directory:", basePath);
        const entries = await fs.promises.readdir(basePath, {
            withFileTypes: true,
        });
        console.log("Found entries:", entries.map((e) => e.name));
        for (const entry of entries) {
            if (entry.isDirectory()) {
                // Skip common directories that shouldn't be scanned
                if (entry.name === "node_modules" ||
                    entry.name === ".git" ||
                    entry.name === "target" ||
                    entry.name === "build" ||
                    entry.name === "built" ||
                    entry.name === "bin" ||
                    entry.name === "dist" ||
                    entry.name === ".vscode" ||
                    entry.name === ".idea" ||
                    entry.name.startsWith(".")) {
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
                            if (subEntry.name === "frontend" ||
                                subEntry.name.toLowerCase().includes("frontend")) {
                                hasFrontend = true;
                            }
                            if (subEntry.name === "backend" ||
                                subEntry.name.toLowerCase().includes("backend")) {
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
                                if (subEntry.name === "frontend" ||
                                    subEntry.name.toLowerCase().includes("frontend")) {
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
                                    }
                                    else if (await isNodeProject(subPath)) {
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
                                if (subEntry.name === "backend" ||
                                    subEntry.name.toLowerCase().includes("backend")) {
                                    if (await isSpringBootProject(subPath)) {
                                        const projectName = `${entry.name} Backend`;
                                        console.log("Found nested Spring Boot project:", projectName);
                                        detectedProjects.push({
                                            name: projectName,
                                            fullPath: subPath,
                                            type: "backend",
                                            framework: "Spring Boot",
                                        });
                                        foundProject = true;
                                    }
                                    else if (await isNodeProject(subPath)) {
                                        const projectName = `${entry.name} Backend`;
                                        console.log("Found nested Node.js backend project:", projectName);
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
                }
                catch (subError) {
                    console.log(`Cannot read subfolders of ${entry.name}:`, subError);
                }
                // Only check as direct project if we didn't find nested projects
                if (!foundProject) {
                    if (await isReactProject(fullPath)) {
                        const projectName = `${getProjectDisplayName(fullPath, entry.name)}`;
                        console.log("Found direct React project:", projectName);
                        detectedProjects.push({
                            name: projectName,
                            fullPath,
                            type: "frontend",
                            framework: "React/Next.js",
                        });
                        foundProject = true;
                    }
                    else if (await isSpringBootProject(fullPath)) {
                        const projectName = `${getProjectDisplayName(fullPath, entry.name)}`;
                        console.log("Found direct Spring Boot project:", projectName);
                        detectedProjects.push({
                            name: projectName,
                            fullPath,
                            type: "backend",
                            framework: "Spring Boot",
                        });
                        foundProject = true;
                    }
                    else if (await isNodeProject(fullPath)) {
                        const projectName = `${getProjectDisplayName(fullPath, entry.name)}`;
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
    }
    catch (error) {
        console.error("Error scanning projects in", basePath, ":", error);
    }
}
// Show project selection dialog
async function showProjectSelectionDialog(detectedProjects) {
    // Create quick pick items
    const quickPickItems = detectedProjects.map((project) => {
        const emoji = project.type === "frontend" ? "🌐" : "⚙️";
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
        const relativePath = path.relative(workspaceRoot, project.fullPath);
        return {
            label: `${emoji} ${project.name}`,
            description: `${project.framework} (${project.type})`,
            detail: relativePath,
            picked: true,
            project: project,
        };
    });
    const selectedItems = await vscode.window.showQuickPick(quickPickItems, {
        canPickMany: true,
        placeHolder: "Select projects to add as default servers (these will auto-start)",
        title: "🥷 Ninja Runner - Select Default Projects",
    });
    return selectedItems?.map((item) => item.project);
}
async function scanForProjects(basePath) {
    try {
        const entries = await fs.promises.readdir(basePath, {
            withFileTypes: true,
        });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const fullPath = path.join(basePath, entry.name);
                // Check if it's a frontend project
                if (await isReactProject(fullPath)) {
                    await addDetectedProject(entry.name, fullPath, "frontend", "React/Next.js");
                }
                // Check if it's a backend project
                else if (await isSpringBootProject(fullPath)) {
                    await addDetectedProject(entry.name, fullPath, "backend", "Spring Boot");
                }
                // Check if it's a Node.js project
                else if (await isNodeProject(fullPath)) {
                    await addDetectedProject(entry.name, fullPath, "frontend", "Node.js");
                }
            }
        }
    }
    catch (error) {
        console.error("Error scanning projects:", error);
    }
}
// Check if directory is a React project
async function isReactProject(projectPath) {
    try {
        const packageJsonPath = path.join(projectPath, "package.json");
        console.log("Checking for React project at:", packageJsonPath);
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, "utf8"));
            const hasReact = !!(packageJson.dependencies?.react ||
                packageJson.devDependencies?.react ||
                packageJson.dependencies?.next ||
                packageJson.devDependencies?.next);
            console.log("React project check result:", hasReact, "Dependencies:", Object.keys(packageJson.dependencies || {}));
            return hasReact;
        }
        console.log("No package.json found at:", packageJsonPath);
    }
    catch (error) {
        console.error("Error checking React project:", error);
    }
    return false;
}
// Check if directory is a Spring Boot project
async function isSpringBootProject(projectPath) {
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
    }
    catch (error) {
        console.error("Error checking Spring Boot project:", error);
    }
    return false;
}
// Check if directory is a Node.js project
async function isNodeProject(projectPath) {
    try {
        const packageJsonPath = path.join(projectPath, "package.json");
        console.log("Checking for Node.js project at:", packageJsonPath);
        const exists = fs.existsSync(packageJsonPath);
        console.log("Node.js project check result:", exists);
        return exists;
    }
    catch (error) {
        console.error("Error checking Node.js project:", error);
    }
    return false;
}
// Add detected project to configuration
async function addDetectedProject(name, fullPath, type, framework) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const relativePath = path.relative(workspaceRoot, fullPath);
    let command = "";
    let emoji = "";
    if (type === "frontend") {
        command = `cd ${relativePath} && npm run dev`;
        emoji = "🌐";
    }
    else {
        command = `cd ${relativePath} && mvn spring-boot:run`;
        emoji = "⚙️";
    }
    const id = configManager.generateUniqueId(name);
    const category = type === "frontend" ? "Frontend Servers" : "Backend Servers";
    const newServer = {
        id,
        name: `${name} (${framework})`,
        type,
        command,
        workingDirectory: relativePath,
        emoji,
        category: category,
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
async function installDependencies(serverId) {
    const serverConfig = configManager.getServerById(serverId);
    if (!serverConfig) {
        vscode.window.showErrorMessage("Server not found!");
        return;
    }
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
    const projectPath = path.join(workspaceRoot, serverConfig.workingDirectory);
    vscode.window.showInformationMessage(`📦 Installing dependencies for ${serverConfig.name}...`);
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
    }
    else if (serverConfig.type === "backend") {
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
        vscode.window.showWarningMessage("No servers configured! Use auto-detect to find projects.");
        return;
    }
    vscode.window.showInformationMessage("📦 Installing dependencies for all projects...");
    // Install dependencies for all servers
    for (const server of servers) {
        await installDependencies(server.id);
        // Wait a bit between installations
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    vscode.window.showInformationMessage("✅ Dependencies installation started for all projects!");
}
// Create status bar with server controls
function createStatusBar() {
    // Clear existing status bar items
    statusBarItems.forEach((item) => item.dispose());
    statusBarItems = [];
    const servers = configManager.getServers();
    const runningCount = Object.keys(terminals).length;
    // Main status item
    const mainStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    mainStatus.text = `🥷 Servers: ${runningCount}/${servers.length}`;
    mainStatus.tooltip = "Ninja Runner - Click to open view";
    mainStatus.command = "serverRunner.showView";
    mainStatus.show();
    statusBarItems.push(mainStatus);
    // Start All button
    const startAll = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    startAll.text = "$(play) Start All";
    startAll.tooltip = "Start all servers";
    startAll.command = "serverRunner.startAllServers";
    startAll.show();
    statusBarItems.push(startAll);
    // Stop All button
    const stopAll = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
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
    const savedServers = extensionContext.workspaceState.get("ninja-runner-servers");
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
function deactivate() {
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
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map