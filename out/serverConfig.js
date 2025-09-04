"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerConfigManager = void 0;
class ServerConfigManager {
    constructor() {
        this.servers = [];
        // Don't load default servers - let auto-detection handle it
        this.servers = [];
    }
    static getInstance() {
        if (!ServerConfigManager.instance) {
            ServerConfigManager.instance = new ServerConfigManager();
        }
        return ServerConfigManager.instance;
    }
    getServers() {
        return [...this.servers];
    }
    getServerById(id) {
        return this.servers.find((server) => server.id === id);
    }
    addServer(server) {
        // Check if server with same ID already exists
        const existingIndex = this.servers.findIndex((s) => s.id === server.id);
        if (existingIndex !== -1) {
            this.servers[existingIndex] = server; // Update existing
        }
        else {
            this.servers.push(server); // Add new
        }
    }
    deleteServer(id) {
        const index = this.servers.findIndex((server) => server.id === id);
        if (index !== -1) {
            this.servers.splice(index, 1);
            return true;
        }
        return false;
    }
    clearAllServers() {
        this.servers = [];
    }
    getServersByCategory(category) {
        return this.servers.filter((server) => server.category === category);
    }
    generateUniqueId(name) {
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
exports.ServerConfigManager = ServerConfigManager;
//# sourceMappingURL=serverConfig.js.map