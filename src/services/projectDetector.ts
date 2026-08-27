import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { DetectedProject, ServerConfig, ServerType } from "../types";
import { PortService } from "./portService";
import { ConfigService } from "./configService";

export class ProjectDetector {
  private static instance: ProjectDetector;
  private readonly ignoredDirs = new Set([
    "node_modules",
    ".git",
    "target",
    "build",
    "built",
    "bin",
    "dist",
    ".vscode",
    ".idea",
    ".next",
    ".nuxt",
    ".output",
    "out",
    "coverage",
  ]);

  private constructor() {}

  public static getInstance(): ProjectDetector {
    if (!ProjectDetector.instance) {
      ProjectDetector.instance = new ProjectDetector();
    }
    return ProjectDetector.instance;
  }

  /**
   * Scans workspace folders and returns all detected projects.
   */
  public async scanWorkspace(): Promise<DetectedProject[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    const detected: DetectedProject[] = [];
    const processedPaths = new Set<string>();

    for (const folder of workspaceFolders) {
      await this.scanDirectory(folder.uri.fsPath, folder.uri.fsPath, detected, processedPaths, 0);
    }

    return this.deduplicate(detected);
  }

  private async scanDirectory(
    rootPath: string,
    currentPath: string,
    results: DetectedProject[],
    processed: Set<string>,
    depth: number,
  ): Promise<void> {
    if (depth > 4) {
      return;
    }

    const normalized = path.resolve(currentPath).toLowerCase();
    if (processed.has(normalized)) {
      return;
    }
    processed.add(normalized);

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    // 1. Check if current folder itself is a project
    const currentProject = await this.evaluateFolderAsProject(rootPath, currentPath);
    if (currentProject) {
      results.push(currentProject);
      // If it's a project, do not deeply scan subdirectories unless they are frontend/backend subfolders
    }

    // 2. Scan subdirectories
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (this.ignoredDirs.has(entry.name) || entry.name.startsWith(".")) {
          continue;
        }

        const subPath = path.join(currentPath, entry.name);
        await this.scanDirectory(rootPath, subPath, results, processed, depth + 1);
      }
    }
  }

  private async evaluateFolderAsProject(
    workspaceRoot: string,
    folderPath: string,
  ): Promise<DetectedProject | null> {
    const relativePath = path.relative(workspaceRoot, folderPath) || ".";
    const folderName = path.basename(folderPath);
    const parentName = path.basename(path.dirname(folderPath));

    const portService = PortService.getInstance();

    // Check Spring Boot (pom.xml)
    const pomPath = path.join(folderPath, "pom.xml");
    if (fs.existsSync(pomPath)) {
      const displayName = this.formatDisplayName(parentName, folderName, "Backend");
      const port = portService.detectServerPort(folderPath, "backend", "Spring Boot");
      return {
        name: displayName,
        fullPath: folderPath,
        relativePath,
        type: "backend",
        framework: "Spring Boot",
        port,
      };
    }

    // Check Node / JavaScript / TypeScript projects (package.json)
    const pkgPath = path.join(folderPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const content = fs.readFileSync(pkgPath, "utf8");
        const pkg = JSON.parse(content);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        // Determine framework & type
        let framework = "Node.js";
        let type: ServerType = "frontend";

        if (deps["next"]) {
          framework = "Next.js";
          type = "frontend";
        } else if (deps["react"] || deps["react-dom"] || deps["react-scripts"]) {
          framework = "React";
          type = "frontend";
        } else if (deps["@angular/core"] || fs.existsSync(path.join(folderPath, "angular.json"))) {
          framework = "Angular";
          type = "frontend";
        } else if (deps["vue"] || deps["nuxt"]) {
          framework = deps["nuxt"] ? "Nuxt" : "Vue";
          type = "frontend";
        } else if (deps["vite"]) {
          framework = "Vite";
          type = "frontend";
        } else if (deps["@nestjs/core"]) {
          framework = "NestJS";
          type = "backend";
        } else if (deps["express"] || deps["fastify"] || deps["koa"] || deps["@hapi/hapi"]) {
          framework = deps["express"] ? "Express" : deps["fastify"] ? "Fastify" : "Node API";
          type = "backend";
        } else {
          // Heuristic: check if scripts have dev / build / start
          if (folderName.toLowerCase().includes("backend") || folderName.toLowerCase().includes("server") || folderName.toLowerCase().includes("api")) {
            type = "backend";
          }
        }

        const displayName = this.formatDisplayName(
          parentName,
          folderName,
          type === "frontend" ? "Frontend" : "Backend",
        );
        const port = portService.detectServerPort(folderPath, type, framework);

        return {
          name: displayName,
          fullPath: folderPath,
          relativePath,
          type,
          framework,
          port,
        };
      } catch {}
    }

    return null;
  }

  private formatDisplayName(parentName: string, folderName: string, roleSuffix: string): string {
    const fnLower = folderName.toLowerCase();
    if (fnLower === "frontend" || fnLower === "backend" || fnLower === "client" || fnLower === "server") {
      return `${parentName} ${roleSuffix}`;
    }
    return `${folderName}`;
  }

  private deduplicate(projects: DetectedProject[]): DetectedProject[] {
    const seen = new Set<string>();
    const unique: DetectedProject[] = [];

    for (const p of projects) {
      const normalizedPath = path.resolve(p.fullPath).toLowerCase();
      if (!seen.has(normalizedPath)) {
        seen.add(normalizedPath);
        unique.push(p);
      }
    }

    return unique;
  }

  /**
   * Prompts user with a sleek, modern QuickPick to choose which projects to include.
   */
  public async promptUserSelection(
    detected: DetectedProject[],
  ): Promise<DetectedProject[] | undefined> {
    const configService = ConfigService.getInstance();
    const currentServers = configService.getServers();
    const currentPaths = new Set(currentServers.map((s) => s.workingDirectory));

    interface ProjectQuickPickItem extends vscode.QuickPickItem {
      project: DetectedProject;
    }

    const items: ProjectQuickPickItem[] = detected.map((p) => {
      const isConfigured = currentPaths.has(p.relativePath);
      const isSelected = currentServers.length === 0 ? true : isConfigured;

      const typeIcon = p.type === "frontend" ? "$(browser)" : "$(server-process)";
      const portBadge = p.port ? `:${p.port}` : "";

      return {
        label: `${typeIcon} ${p.name}`,
        description: `${p.framework} ${portBadge}`.trim(),
        detail: `📁 ${p.relativePath}`,
        picked: isSelected,
        project: p,
      };
    });

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      title: "🥷 Ninja Runner · Configure Workspace Projects",
      placeHolder: "Select projects to manage (previously configured items are checked)",
      ignoreFocusOut: true,
    });

    if (!selected) {
      return undefined;
    }

    return selected.map((item) => item.project);
  }

  /**
   * Converts a detected project into a ServerConfig.
   */
  public createServerConfig(project: DetectedProject): ServerConfig {
    const configService = ConfigService.getInstance();
    const id = configService.generateUniqueId(`${project.name}-${project.type}`);

    let command = "";
    if (project.type === "frontend") {
      const fw = project.framework.toLowerCase();
      if (fw.includes("angular")) {
        command = "ng serve";
      } else if (fw.includes("vue")) {
        command = "npm run serve";
      } else if (fw.includes("next") || fw.includes("vite")) {
        command = "npm run dev";
      } else if (fw.includes("react")) {
        command = "npm start";
      } else {
        command = "npm run dev";
      }
    } else {
      if (project.framework.includes("Spring")) {
        command = "mvn spring-boot:run -Dspring-boot.run.profiles=dev -Dspring.profiles.active=dev";
      } else {
        command = "npm run dev";
      }
    }

    return {
      id,
      name: project.name,
      type: project.type,
      command,
      workingDirectory: project.relativePath,
      category: project.type === "frontend" ? "Frontend Servers" : "Backend Servers",
      port: project.port,
      framework: project.framework,
    };
  }
}
