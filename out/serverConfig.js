"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerConfigManager = void 0;
class ServerConfigManager {
    constructor() {
        this.servers = [];
        this.loadDefaultServers();
    }
    static getInstance() {
        if (!ServerConfigManager.instance) {
            ServerConfigManager.instance = new ServerConfigManager();
        }
        return ServerConfigManager.instance;
    }
    loadDefaultServers() {
        this.servers = [
            {
                id: 'fsp-frontend',
                name: 'FSP Frontend',
                type: 'frontend',
                command: 'cd FSP/frontend && npm run dev',
                workingDirectory: 'FSP/frontend',
                emoji: '🌐',
                category: 'Frontend Servers'
            },
            {
                id: 'hrms-frontend',
                name: 'HRMS Frontend',
                type: 'frontend',
                command: 'cd HRMS/frontend && npm run dev',
                workingDirectory: 'HRMS/frontend',
                emoji: '🌐',
                category: 'Frontend Servers'
            },
            {
                id: 'fsp-backend',
                name: 'FSP Backend',
                type: 'backend',
                command: 'cd FSP/backend && mvn spring-boot:run',
                workingDirectory: 'FSP/backend',
                emoji: '⚙️',
                category: 'Backend Servers'
            },
            {
                id: 'hrms-backend',
                name: 'HRMS Backend',
                type: 'backend',
                command: 'cd HRMS/backend && mvn spring-boot:run',
                workingDirectory: 'HRMS/backend',
                emoji: '⚙️',
                category: 'Backend Servers'
            }
        ];
    }
    getServers() {
        return [...this.servers];
    }
    getServerById(id) {
        return this.servers.find(server => server.id === id);
    }
    addServer(server) {
        // Check if server with same ID already exists
        const existingIndex = this.servers.findIndex(s => s.id === server.id);
        if (existingIndex !== -1) {
            this.servers[existingIndex] = server; // Update existing
        }
        else {
            this.servers.push(server); // Add new
        }
    }
    deleteServer(id) {
        const index = this.servers.findIndex(server => server.id === id);
        if (index !== -1) {
            this.servers.splice(index, 1);
            return true;
        }
        return false;
    }
    getServersByCategory(category) {
        return this.servers.filter(server => server.category === category);
    }
    generateUniqueId(name) {
        const baseId = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        let id = baseId;
        let counter = 1;
        while (this.servers.some(server => server.id === id)) {
            id = `${baseId}-${counter}`;
            counter++;
        }
        return id;
    }
}
exports.ServerConfigManager = ServerConfigManager;
//# sourceMappingURL=serverConfig.js.map