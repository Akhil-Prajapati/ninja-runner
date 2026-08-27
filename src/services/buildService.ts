import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { BuildStatusValue } from "../types";

export class BuildService {
  private static instance: BuildService;
  private buildStatuses: Map<string, BuildStatusValue> = new Map();
  private onBuildStatusChangeCallbacks: Array<(projectPath: string, status: BuildStatusValue) => void> = [];

  private constructor() {}

  public static getInstance(): BuildService {
    if (!BuildService.instance) {
      BuildService.instance = new BuildService();
    }
    return BuildService.instance;
  }

  public onBuildStatusChange(callback: (projectPath: string, status: BuildStatusValue) => void): void {
    this.onBuildStatusChangeCallbacks.push(callback);
  }

  private notifyStatus(projectPath: string, status: BuildStatusValue): void {
    this.buildStatuses.set(projectPath, status);
    for (const cb of this.onBuildStatusChangeCallbacks) {
      cb(projectPath, status);
    }
  }

  public getBuildStatus(projectPath: string): BuildStatusValue {
    return this.buildStatuses.get(projectPath) ?? "idle";
  }

  /**
   * Runs a single environment build (e.g. staging or prod) by invoking ./build.sh.
   */
  public async runBuild(projectPath: string, env: "staging" | "prod" | "both"): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("No workspace folder open.");
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const targetDir = path.join(workspaceRoot, projectPath);

    // Locate build.sh
    const localBuildScript = path.join(targetDir, "build.sh");
    const rootBuildScript = path.join(workspaceRoot, "build.sh");
    const scriptPath = fs.existsSync(localBuildScript) ? localBuildScript : rootBuildScript;

    if (!fs.existsSync(scriptPath)) {
      vscode.window.showErrorMessage(`build.sh script not found in ${projectPath} or workspace root.`);
      return;
    }

    this.notifyStatus(projectPath, "building");

    if (env === "both") {
      await this.runSequentialBuilds(projectPath, targetDir, scriptPath);
    } else {
      await this.executeBuildTerminal(projectPath, targetDir, scriptPath, env);
    }
  }

  private async executeBuildTerminal(
    projectPath: string,
    targetDir: string,
    scriptPath: string,
    env: "staging" | "prod",
  ): Promise<void> {
    const envFlag = env === "staging" ? "staging" : "";
    const command = `bash "${scriptPath}" zip war ${envFlag}`.trim();

    const terminal = vscode.window.createTerminal({
      name: `[Ninja Build] ${path.basename(projectPath)} (${env})`,
      cwd: targetDir,
      env: {
        NINJA_BUILD_DIR: targetDir,
      },
    });

    terminal.show();
    terminal.sendText(command);

    // Watch status marker or terminal completion
    this.watchBuildCompletion(projectPath, targetDir, env, terminal);
  }

  private async runSequentialBuilds(
    projectPath: string,
    targetDir: string,
    scriptPath: string,
  ): Promise<void> {
    // Staging first
    await this.executeBuildTerminal(projectPath, targetDir, scriptPath, "staging");
    
    // Listen for staging done before kicking off prod
    const checkInterval = setInterval(async () => {
      const status = this.getBuildStatus(projectPath);
      if (status === "done") {
        clearInterval(checkInterval);
        this.notifyStatus(projectPath, "building");
        await new Promise((r) => setTimeout(r, 1000));
        await this.executeBuildTerminal(projectPath, targetDir, scriptPath, "prod");
      } else if (status === "error") {
        clearInterval(checkInterval);
      }
    }, 2000);
  }

  private watchBuildCompletion(
    projectPath: string,
    targetDir: string,
    env: string,
    terminal: vscode.Terminal,
  ): void {
    const markerFile = path.join(targetDir, ".ninja_build_status");

    // Clean any stale marker
    if (fs.existsSync(markerFile)) {
      try {
        fs.unlinkSync(markerFile);
      } catch {}
    }

    const interval = setInterval(() => {
      // 1. Check if marker written by build.sh
      if (fs.existsSync(markerFile)) {
        try {
          const content = fs.readFileSync(markerFile, "utf8").trim();
          if (content.toLowerCase().includes(env.toLowerCase()) || content.length > 0) {
            clearInterval(interval);
            fs.unlinkSync(markerFile);
            this.notifyStatus(projectPath, "done");
            return;
          }
        } catch {}
      }

      // 2. Check if terminal exited with error
      if (terminal.exitStatus !== undefined) {
        clearInterval(interval);
        if (terminal.exitStatus.code === 0) {
          this.notifyStatus(projectPath, "done");
        } else {
          this.notifyStatus(projectPath, "error");
        }
      }
    }, 1500);

    // Timeout safety after 10 mins
    setTimeout(() => {
      clearInterval(interval);
    }, 600000);
  }
}
