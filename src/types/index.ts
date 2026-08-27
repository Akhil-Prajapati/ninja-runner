import * as vscode from "vscode";

export type ServerType = "frontend" | "backend";

export type ServerStatusValue =
  | "running"
  | "stopped"
  | "starting"
  | "restarting"
  | "error";

export type BuildStatusValue = "idle" | "building" | "done" | "error";

export interface ServerConfig {
  id: string;
  name: string;
  type: ServerType;
  command: string;
  workingDirectory: string;
  emoji?: string;
  category: "Frontend Servers" | "Backend Servers";
  port?: number;
  framework?: string;
}

export interface ServerStatusMap {
  [serverId: string]: ServerStatusValue;
}

export interface BuildStatusMap {
  [projectPath: string]: BuildStatusValue;
}

export interface DetectedProject {
  name: string;
  fullPath: string;
  relativePath: string;
  type: ServerType;
  framework: string;
  port?: number;
}

export interface PortInfo {
  port: number;
  serverId?: string;
  serverName?: string;
  inUse: boolean;
  type?: ServerType;
}

export interface Holiday {
  name: string;
}

export interface DevQuote {
  text: string;
  author: string;
}
