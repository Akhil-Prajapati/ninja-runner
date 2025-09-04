export interface ServerConfig {
  id: string;
  name: string;
  type: "frontend" | "backend";
  command: string;
  workingDirectory: string;
  emoji: string;
  category: "Frontend Servers" | "Backend Servers";
}

export class ServerConfigManager {
  private static instance: ServerConfigManager;
  private servers: ServerConfig[] = [];

  private constructor() {
    // Don't load default servers - let auto-detection handle it
    this.servers = [];
  }

  public static getInstance(): ServerConfigManager {
    if (!ServerConfigManager.instance) {
      ServerConfigManager.instance = new ServerConfigManager();
    }
    return ServerConfigManager.instance;
  }

  public getServers(): ServerConfig[] {
    return [...this.servers];
  }

  public getServerById(id: string): ServerConfig | undefined {
    return this.servers.find((server) => server.id === id);
  }

  public addServer(server: ServerConfig): void {
    // Check if server with same ID already exists
    const existingIndex = this.servers.findIndex((s) => s.id === server.id);
    if (existingIndex !== -1) {
      this.servers[existingIndex] = server; // Update existing
    } else {
      this.servers.push(server); // Add new
    }
  }

  public deleteServer(id: string): boolean {
    const index = this.servers.findIndex((server) => server.id === id);
    if (index !== -1) {
      this.servers.splice(index, 1);
      return true;
    }
    return false;
  }

  public clearAllServers(): void {
    this.servers = [];
  }

  public getServersByCategory(category: string): ServerConfig[] {
    return this.servers.filter((server) => server.category === category);
  }

  public generateUniqueId(name: string): string {
    const baseId = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    let counter = 1;
    let uniqueId = baseId;

    while (this.servers.some((server) => server.id === uniqueId)) {
      uniqueId = `${baseId}-${counter}`;
      counter++;
    }

    return uniqueId;
  }
}
