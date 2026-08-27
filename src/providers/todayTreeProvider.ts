import * as vscode from "vscode";
import { ConfigService } from "../services/configService";
import { PortService } from "../services/portService";
import { TodayService } from "../services/todayService";
import { DevQuote, Holiday } from "../types";

const COLOR_QUOTE = new vscode.ThemeColor("editorInfo.foreground");
const COLOR_HOLIDAY = new vscode.ThemeColor("testing.iconFailed");
const COLOR_RUNNING = new vscode.ThemeColor("testing.iconPassed");
const COLOR_STOPPED = new vscode.ThemeColor("disabledForeground");

export class TodayTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChange = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private midnightTimer?: NodeJS.Timeout;
  private dinoStep = 0;
  private dinoTimer?: NodeJS.Timeout;

  constructor() {
    this.scheduleMidnightRefresh();
    this.startDinoWalkAnimation();
  }

  public refresh(): void {
    const todayService = TodayService.getInstance();
    todayService.bustCache();
    this._onDidChange.fire();
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      return [
        new DashboardSectionItem("Daily Developer Card", "section-quote", "quote", "charts.purple"),
        new DashboardSectionItem("Port Kill Switch & Inspector", "section-ports", "flame", "charts.yellow"),
        new DashboardSectionItem("Offline Dino Run", "section-dino", "game", "charts.green"),
      ];
    }

    const ctx = element.contextValue;

    if (ctx === "section-quote") {
      return this.getQuoteAndHolidayItems();
    }

    if (ctx === "section-ports") {
      return this.getPortInspectorItems();
    }

    if (ctx === "section-dino") {
      return this.getDinoItems();
    }

    return [];
  }

  /**
   * Top Section: Full multi-line Daily Developer Quote and Gujarat Holiday status.
   */
  private async getQuoteAndHolidayItems(): Promise<vscode.TreeItem[]> {
    const todayService = TodayService.getInstance();
    const [holidays, quote] = await Promise.all([
      todayService.fetchTodayHolidays(),
      todayService.getDailyQuote(),
    ]);

    const items: vscode.TreeItem[] = [];

    // 1. Multi-line Word-wrapped Quote Lines
    const quoteItems = this.buildQuoteLines(quote);
    items.push(...quoteItems);

    // 2. Holiday Status directly under quote
    if (holidays.length > 0) {
      for (const h of holidays) {
        const hItem = new vscode.TreeItem(`🌸 Holiday: ${h.name}`, vscode.TreeItemCollapsibleState.None);
        hItem.iconPath = new vscode.ThemeIcon("calendar", COLOR_HOLIDAY);
        hItem.description = "Gujarat Public Holiday";
        hItem.tooltip = `Gujarat Public Holiday: ${h.name}`;
        items.push(hItem);
      }
    } else {
      const noHItem = new vscode.TreeItem("No holiday today — Ship it!", vscode.TreeItemCollapsibleState.None);
      noHItem.iconPath = new vscode.ThemeIcon("rocket", COLOR_RUNNING);
      noHItem.description = "Dev Mode Active";
      noHItem.tooltip = "Gujarat holiday calendar — No holiday today";
      items.push(noHItem);
    }

    return items;
  }

  private buildQuoteLines(quote: DevQuote): vscode.TreeItem[] {
    const fullTooltip = new vscode.MarkdownString(
      `### 💬 Daily Dev Quote\n\n❝ *${quote.text}* ❞\n\n**— ${quote.author}**`,
    );

    const lines = this.wordWrap(quote.text, 34);
    const items: vscode.TreeItem[] = [];

    lines.forEach((line, i) => {
      const isFirst = i === 0;
      const isLast = i === lines.length - 1;

      const displayText = isFirst
        ? `❝  ${line}`
        : isLast
          ? `   ${line}  ❞`
          : `   ${line}`;

      const item = new vscode.TreeItem(displayText, vscode.TreeItemCollapsibleState.None);
      item.tooltip = fullTooltip;

      if (isFirst) {
        item.iconPath = new vscode.ThemeIcon("quote", COLOR_QUOTE);
      } else {
        item.iconPath = new vscode.ThemeIcon("blank");
      }
      items.push(item);
    });

    const authorItem = new vscode.TreeItem(`   — ${quote.author}`, vscode.TreeItemCollapsibleState.None);
    authorItem.iconPath = new vscode.ThemeIcon("blank");
    authorItem.tooltip = fullTooltip;
    items.push(authorItem);

    return items;
  }

  private wordWrap(text: string, maxLen: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if (current.length === 0) {
        current = word;
      } else if (current.length + 1 + word.length <= maxLen) {
        current += " " + word;
      } else {
        lines.push(current);
        current = word;
      }
    }
    if (current) {
      lines.push(current);
    }
    return lines;
  }

  /**
   * Middle Section: Port Kill Switch & Inspector (Input action + Active ports list).
   */
  private async getPortInspectorItems(): Promise<vscode.TreeItem[]> {
    const items: vscode.TreeItem[] = [];

    // 1. Kill Custom Port Action
    const killCustomItem = new vscode.TreeItem("⚡ Kill Custom Port Process...", vscode.TreeItemCollapsibleState.None);
    killCustomItem.iconPath = new vscode.ThemeIcon("flame", new vscode.ThemeColor("testing.iconFailed"));
    killCustomItem.description = "Type any port";
    killCustomItem.tooltip = "Click to enter any port number (e.g. 8080, 3000, 5432) and terminate the process holding it";
    killCustomItem.command = {
      command: "serverRunner.killPort",
      title: "Kill Custom Port",
    };
    items.push(killCustomItem);

    // 2. Active Ports List
    const configService = ConfigService.getInstance();
    const portService = PortService.getInstance();
    const servers = configService.getServers();

    const seenPorts = new Set<number>();

    for (const server of servers) {
      if (server.port && !seenPorts.has(server.port)) {
        seenPorts.add(server.port);
        const inUse = await portService.isPortInUse(server.port);

        const portItem = new vscode.TreeItem(
          `:${server.port} — ${server.name}`,
          vscode.TreeItemCollapsibleState.None,
        );

        if (inUse) {
          portItem.iconPath = new vscode.ThemeIcon("radio-tower", COLOR_RUNNING);
          portItem.description = "In Use · Click to Free";
          portItem.tooltip = `Port :${server.port} is currently active. Click to terminate the process on this port.`;
          portItem.command = {
            command: "serverRunner.freeSpecificPort",
            title: "Free Port",
            arguments: [server.port],
          };
        } else {
          portItem.iconPath = new vscode.ThemeIcon("circle-outline", COLOR_STOPPED);
          portItem.description = "Free";
          portItem.tooltip = `Port :${server.port} is available.`;
        }

        items.push(portItem);
      }
    }

    return items;
  }

  /**
   * Bottom Section: Chrome Dino Walker & Playable Arcade Game.
   */
  private getDinoItems(): vscode.TreeItem[] {
    const items: vscode.TreeItem[] = [];

    // Animated Dino Walking Track
    const tracks = [
      "🦖  .  .  .  🌵  .  .  🌵",
      " .  🦖  .  .  🌵  .  .  🌵",
      " .  .  🦖  .  🌵  .  .  🌵",
      " .  .  .  🦖 (Hop!) 🌵  .  🌵",
      " .  .  .  .  🌵  🦖  .  🌵",
      " .  .  .  .  🌵  .  🦖  🌵",
      " .  .  .  .  🌵  .  .  🦖",
    ];

    const currentTrack = tracks[this.dinoStep % tracks.length];

    const trackItem = new vscode.TreeItem(currentTrack, vscode.TreeItemCollapsibleState.None);
    trackItem.iconPath = new vscode.ThemeIcon("game", new vscode.ThemeColor("charts.green"));
    trackItem.description = "Click to Play!";
    trackItem.tooltip = "Click to launch the classic offline Chrome Dino runner game in VS Code!";
    trackItem.command = {
      command: "serverRunner.openDinoGame",
      title: "Play Chrome Dino Runner",
    };
    items.push(trackItem);

    const playBtnItem = new vscode.TreeItem("🎮 Launch Fullscreen Dino Game", vscode.TreeItemCollapsibleState.None);
    playBtnItem.iconPath = new vscode.ThemeIcon("play", new vscode.ThemeColor("charts.blue"));
    playBtnItem.description = "Space to Jump";
    playBtnItem.tooltip = "Open Chrome Dino arcade game";
    playBtnItem.command = {
      command: "serverRunner.openDinoGame",
      title: "Play Chrome Dino Runner",
    };
    items.push(playBtnItem);

    return items;
  }

  private startDinoWalkAnimation(): void {
    // Step forward every 3 seconds for a subtle, fun animation
    this.dinoTimer = setInterval(() => {
      this.dinoStep++;
      this._onDidChange.fire();
    }, 3000);
  }

  private scheduleMidnightRefresh(): void {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msLeft = midnight.getTime() - now.getTime();

    this.midnightTimer = setTimeout(() => {
      this.refresh();
      this.midnightTimer = setInterval(() => this.refresh(), 24 * 60 * 60 * 1000);
    }, msLeft);
  }

  public dispose(): void {
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
    }
    if (this.dinoTimer) {
      clearInterval(this.dinoTimer);
    }
    this._onDidChange.dispose();
  }
}

export class DashboardSectionItem extends vscode.TreeItem {
  constructor(
    label: string,
    contextValue: string,
    iconCodicon: string,
    colorToken: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = contextValue;
    this.iconPath = new vscode.ThemeIcon(
      iconCodicon,
      new vscode.ThemeColor(colorToken),
    );
  }
}
