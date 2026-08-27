import * as vscode from "vscode";
import { ServerConfig, ServerType } from "../types";

const WORKSPACE_STORAGE_KEY = "ninja-runner-servers";

export class ConfigService {
  private static instance: ConfigService;
  private servers: ServerConfig[] = [];
  private context?: vscode.ExtensionContext;

  private constructor() {}

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  public initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.loadFromWorkspace();
  }

  public getServers(): ServerConfig[] {
    return [...this.servers];
  }

  public getServerById(id: string): ServerConfig | undefined {
    return this.servers.find((s) => s.id === id);
  }

  public getServersByType(type: ServerType): ServerConfig[] {
    return this.servers.filter((s) => s.type === type);
  }

  public getServersByCategory(category: "Frontend Servers" | "Backend Servers"): ServerConfig[] {
    return this.servers.filter((s) => s.category === category);
  }

  public setServers(servers: ServerConfig[]): void {
    this.servers = [...servers];
    this.saveToWorkspace();
  }

  public addServer(server: ServerConfig): void {
    const existingIndex = this.servers.findIndex((s) => s.id === server.id);
    if (existingIndex !== -1) {
      this.servers[existingIndex] = server;
    } else {
      this.servers.push(server);
    }
    this.saveToWorkspace();
  }

  public updateServerPort(serverId: string, port: number): void {
    const server = this.getServerById(serverId);
    if (server) {
      server.port = port;
      this.saveToWorkspace();
    }
  }

  public deleteServer(id: string): boolean {
    const index = this.servers.findIndex((s) => s.id === id);
    if (index !== -1) {
      this.servers.splice(index, 1);
      this.saveToWorkspace();
      return true;
    }
    return false;
  }

  public clearAllServers(): void {
    this.servers = [];
    this.saveToWorkspace();
  }

  public generateUniqueId(name: string): string {
    const baseId = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    let counter = 1;
    let uniqueId = baseId || "server";

    while (this.servers.some((s) => s.id === uniqueId)) {
      uniqueId = `${baseId}-${counter}`;
      counter++;
    }

    return uniqueId;
  }

  private saveToWorkspace(): void {
    if (this.context) {
      this.context.workspaceState.update(WORKSPACE_STORAGE_KEY, this.servers);
    }
  }

  private loadFromWorkspace(): void {
    if (this.context) {
      const saved = this.context.workspaceState.get<ServerConfig[]>(WORKSPACE_STORAGE_KEY);
      if (Array.isArray(saved)) {
        this.servers = saved.map((s) => {
          if (s.type === "backend" && s.command.includes("spring-boot:run")) {
            let cleanCmd = s.command
              .replace(/^cd\s+(?:"[^"]+"|\S+)\s*(?:&&|;)\s*/i, "")
              .replace(/-Dspring-boot\.run\.profiles=[^\s]+/g, "")
              .replace(/-Dspring\.profiles\.active=[^\s]+/g, "")
              .trim();
            s.command = `${cleanCmd} -Dspring-boot.run.profiles=dev -Dspring.profiles.active=dev`;
          }
          return s;
        });
      }
    }
  }
}
