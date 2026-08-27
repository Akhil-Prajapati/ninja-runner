import * as vscode from "vscode";
import * as net from "net";
import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { ServerType } from "../types";

export class PortService {
  private static instance: PortService;

  private constructor() {}

  public static getInstance(): PortService {
    if (!PortService.instance) {
      PortService.instance = new PortService();
    }
    return PortService.instance;
  }

  /**
   * Tests whether a TCP port is currently open and listening.
   */
  public isPortInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (!port || port <= 0 || port > 65535) {
        return resolve(false);
      }

      const socket = new net.Socket();
      socket.setTimeout(400);

      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });

      socket.on("error", () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, "127.0.0.1");
    });
  }

  /**
   * Kills any process holding the specified TCP port.
   * Works seamlessly across Windows, Linux, and macOS.
   */
  public killPortProcess(port: number): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      if (!port || isNaN(port) || port <= 0 || port > 65535) {
        return resolve({ success: false, message: `Invalid port number: ${port}` });
      }

      const isWin = process.platform === "win32";

      if (isWin) {
        // Windows: Find PID with netstat then taskkill
        const cmd = `cmd.exe /c "for /f "tokens=5" %a in ('netstat -aon ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a"`;
        exec(cmd, (error, stdout, stderr) => {
          if (error && !stdout.includes("SUCCESS")) {
            // Fallback powershell method
            const psCmd = `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`;
            exec(psCmd, (psErr) => {
              if (psErr) {
                resolve({ success: false, message: `Failed to kill process on port ${port}` });
              } else {
                resolve({ success: true, message: `Freed port :${port}` });
              }
            });
          } else {
            resolve({ success: true, message: `Freed port :${port}` });
          }
        });
      } else {
        // Linux / macOS: fuser or lsof
        const cmd = `fuser -k ${port}/tcp 2>/dev/null || (lsof -ti :${port} | xargs kill -9 2>/dev/null) || true`;
        exec(cmd, (error) => {
          // Double check if port is freed
          setTimeout(async () => {
            const inUse = await this.isPortInUse(port);
            if (!inUse) {
              resolve({ success: true, message: `Freed port :${port}` });
            } else {
              resolve({ success: false, message: `Could not free port :${port}` });
            }
          }, 300);
        });
      }
    });
  }

  /**
   * Prompts the user to enter a custom port to kill (Manual Port Kill Switch).
   */
  public async promptKillCustomPort(): Promise<void> {
    const portStr = await vscode.window.showInputBox({
      title: "⚡ Ninja Port Kill Switch",
      prompt: "Enter the port number to terminate (e.g. 3000, 8080, 5173)",
      placeHolder: "8080",
      validateInput: (value) => {
        const num = parseInt(value.trim(), 10);
        if (isNaN(num) || num <= 0 || num > 65535) {
          return "Please enter a valid port between 1 and 65535";
        }
        return null;
      },
    });

    if (!portStr) {
      return;
    }

    const port = parseInt(portStr.trim(), 10);
    const inUse = await this.isPortInUse(port);

    if (!inUse) {
      vscode.window.showInformationMessage(`Port :${port} is already free!`);
      return;
    }

    const result = await this.killPortProcess(port);
    if (result.success) {
      vscode.window.showInformationMessage(`🎯 ${result.message}`);
    } else {
      vscode.window.showErrorMessage(`❌ ${result.message}`);
    }
  }

  /**
   * Automatically scans project files to discover the listening port.
   */
  public detectServerPort(
    projectPath: string,
    type: ServerType,
    framework: string,
  ): number | undefined {
    try {
      if (type === "backend") {
        return this.detectBackendPort(projectPath, framework);
      } else {
        return this.detectFrontendPort(projectPath, framework);
      }
    } catch {
      return this.getDefaultPort(type, framework);
    }
  }

  private detectBackendPort(projectPath: string, framework: string): number | undefined {
    // 1. Check application.properties
    const appPropsPath = path.join(
      projectPath,
      "src",
      "main",
      "resources",
      "application.properties",
    );
    if (fs.existsSync(appPropsPath)) {
      try {
        const content = fs.readFileSync(appPropsPath, "utf8");
        const match = content.match(/^\s*server\.port\s*=\s*(\d+)/m);
        if (match?.[1]) {
          return parseInt(match[1], 10);
        }
      } catch {}
    }

    // 2. Check application.yml / application.yaml
    for (const yamlName of ["application.yml", "application.yaml"]) {
      const yamlPath = path.join(projectPath, "src", "main", "resources", yamlName);
      if (fs.existsSync(yamlPath)) {
        try {
          const content = fs.readFileSync(yamlPath, "utf8");
          const match = content.match(/port:\s*(\d+)/);
          if (match?.[1]) {
            return parseInt(match[1], 10);
          }
        } catch {}
      }
    }

    // 3. Check .env file
    const envPath = path.join(projectPath, ".env");
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, "utf8");
        const match = content.match(/^PORT\s*=\s*(\d+)/m);
        if (match?.[1]) {
          return parseInt(match[1], 10);
        }
      } catch {}
    }

    return this.getDefaultPort("backend", framework);
  }

  private detectFrontendPort(projectPath: string, framework: string): number | undefined {
    const fw = framework.toLowerCase();

    // 1. Angular — angular.json
    if (fw.includes("angular")) {
      const angularJsonPath = path.join(projectPath, "angular.json");
      if (fs.existsSync(angularJsonPath)) {
        try {
          const content = fs.readFileSync(angularJsonPath, "utf8");
          const json = JSON.parse(content);
          for (const proj of Object.values<any>(json.projects || {})) {
            const port = proj?.architect?.serve?.options?.port;
            if (port && typeof port === "number") {
              return port;
            }
          }
        } catch {}
      }
      return 4200;
    }

    // 2. Vite — vite.config.ts / js
    if (fw.includes("vite")) {
      for (const ext of ["ts", "js", "mjs"]) {
        const vitePath = path.join(projectPath, `vite.config.${ext}`);
        if (fs.existsSync(vitePath)) {
          try {
            const content = fs.readFileSync(vitePath, "utf8");
            const match = content.match(/port\s*:\s*(\d+)/);
            if (match?.[1]) {
              return parseInt(match[1], 10);
            }
          } catch {}
        }
      }
      return 5173;
    }

    // 3. .env in frontend root
    const envPath = path.join(projectPath, ".env");
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, "utf8");
        const match = content.match(/^PORT\s*=\s*(\d+)/m);
        if (match?.[1]) {
          return parseInt(match[1], 10);
        }
      } catch {}
    }

    // 4. package.json scripts (e.g., -p 3000, --port 3001)
    const pkgPath = path.join(projectPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const content = fs.readFileSync(pkgPath, "utf8");
        const pkg = JSON.parse(content);
        const scriptsStr = Object.values(pkg.scripts || {}).join(" ");
        const match = scriptsStr.match(/(?:--port|-p)\s+(\d{4,5})/);
        if (match?.[1]) {
          return parseInt(match[1], 10);
        }
      } catch {}
    }

    return this.getDefaultPort("frontend", framework);
  }

  public getDefaultPort(type: ServerType, framework: string): number {
    const fw = (framework || "").toLowerCase();
    if (type === "backend") {
      if (fw.includes("spring")) {
        return 8080;
      }
      if (fw.includes("nest")) {
        return 3000;
      }
      if (fw.includes("express") || fw.includes("fastify") || fw.includes("node")) {
        return 5000;
      }
      return 8080;
    } else {
      if (fw.includes("angular")) {
        return 4200;
      }
      if (fw.includes("vite")) {
        return 5173;
      }
      if (fw.includes("vue")) {
        return 8080;
      }
      if (fw.includes("next") || fw.includes("react")) {
        return 3000;
      }
      return 3000;
    }
  }
}
