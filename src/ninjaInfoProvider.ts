import * as vscode from "vscode";
import * as https from "https";
import * as http from "http";

// ── Daily developer quotes (90 total — one per day, cycles yearly) ────────────
const QUOTES: { text: string; author: string }[] = [
  // ── Classics ──────────────────────────────────────────────────────────────
  {
    text: "It's not a bug — it's an undocumented feature.",
    author: "Anonymous",
  },
  {
    text: "99 little bugs in the code. Take one down, patch it around… 127 little bugs in the code.",
    author: "Anonymous",
  },
  { text: "The best code is no code at all.", author: "Jeff Atwood" },
  {
    text: "Always code as if the person maintaining your code is a violent psychopath who knows where you live.",
    author: "John F. Woods",
  },
  {
    text: "If debugging is removing bugs, then programming must be putting them in.",
    author: "Edsger Dijkstra",
  },
  {
    text: "Any fool can write code a computer understands. Good programmers write code humans understand.",
    author: "Martin Fowler",
  },
  {
    text: "First, solve the problem. Then, write the code.",
    author: "John Johnson",
  },
  {
    text: "Code is like humor. When you have to explain it, it's bad.",
    author: "Cory House",
  },
  {
    text: "Weeks of coding can save you hours of planning.",
    author: "Anonymous",
  },
  {
    text: "Java is to JavaScript what car is to carpet.",
    author: "Chris Heilmann",
  },
  {
    text: "A user interface is like a joke. If you have to explain it, it's not that good.",
    author: "Anonymous",
  },
  {
    text: "Debugging is twice as hard as writing the code. So if you write it as cleverly as possible, you're not smart enough to debug it.",
    author: "Brian Kernighan",
  },
  { text: "Real programmers count from 0.", author: "Anonymous" },
  {
    text: "If at first you don't succeed, call it version 1.0.",
    author: "Anonymous",
  },
  {
    text: "Walking on water and developing software from a spec are easy — if both are frozen.",
    author: "Edward V. Berard",
  },
  {
    text: "Give a man a program, frustrate him for a day. Teach a man to program, frustrate him for a lifetime.",
    author: "Muhammad Waseem",
  },
  {
    text: "There are only 10 types of people: those who understand binary and those who don't.",
    author: "Anonymous",
  },
  {
    text: "The trouble with programmers is you can never tell what they're doing until it's too late.",
    author: "Seymour Cray",
  },
  {
    text: "Software is like entropy: it always increases.",
    author: "Norman Augustine",
  },
  {
    text: "Measuring programming progress by lines of code is like measuring aircraft progress by weight.",
    author: "Bill Gates",
  },
  {
    text: "One man's crappy software is another man's full-time job.",
    author: "Jessica Gaston",
  },
  {
    text: "Most good programmers program not for pay, but because it is fun.",
    author: "Linus Torvalds",
  },
  { text: "No code is faster than no code.", author: "Kevlin Henney" },
  {
    text: "Before software can be reusable it first has to be usable.",
    author: "Ralph Johnson",
  },
  {
    text: "A good programmer looks both ways before crossing a one-way street.",
    author: "Doug Linder",
  },
  { text: "Programming is thinking, not typing.", author: "Casey Patton" },
  {
    text: "The most disastrous thing you can ever learn is your first programming language.",
    author: "Alan Kay",
  },
  { text: "Copy-paste is a design error.", author: "David Parnas" },
  { text: "It works on my machine. Ship the machine.", author: "Anonymous" },
  { text: "Don't comment bad code — rewrite it.", author: "Brian Kernighan" },

  // ── Funny but true ────────────────────────────────────────────────────────
  {
    text: "My code doesn't have bugs. It has random features.",
    author: "Anonymous",
  },
  {
    text: "I don't always test my code, but when I do, I do it in production.",
    author: "Anonymous",
  },
  {
    text: "git commit -m 'Fixed bug' — translation: I have no idea what I changed but it works now.",
    author: "Anonymous",
  },
  {
    text: "To understand recursion, you must first understand recursion.",
    author: "Anonymous",
  },
  {
    text: "A programmer's wife tells him: 'Go to the store, get a gallon of milk, and if they have eggs, get a dozen.' He comes back with 12 gallons of milk.",
    author: "Anonymous",
  },
  { text: "There is no place like 127.0.0.1.", author: "Anonymous" },
  {
    text: "In order to understand recursion, one must first understand recursion.",
    author: "Stephen Hawking",
  },
  {
    text: "An SQL query walks into a bar, walks up to two tables and asks… 'Can I join you?'",
    author: "Anonymous",
  },
  {
    text: "Why do programmers prefer dark mode? Because light attracts bugs.",
    author: "Anonymous",
  },
  {
    text: "A null pointer walked into a bar. The bar crashed.",
    author: "Anonymous",
  },
  {
    text: "Software developers like to solve problems. If there are no problems, they create new ones.",
    author: "Anonymous",
  },
  {
    text: "I have a joke about UDP… but you might not get it.",
    author: "Anonymous",
  },
  {
    text: "Why did the programmer quit his job? Because he didn't get arrays.",
    author: "Anonymous",
  },
  {
    text: "Programmers are tools for converting caffeine into code.",
    author: "Anonymous",
  },
  { text: "Keyboard not found. Press F1 to continue.", author: "Classic BIOS" },
  {
    text: "I would love to change the world, but they won't give me the source code.",
    author: "Anonymous",
  },
  {
    text: "The computer was born to solve problems that did not exist before.",
    author: "Bill Gates",
  },
  {
    text: "My software never has bugs. It just develops random features.",
    author: "Anonymous",
  },
  {
    text: "If builders built buildings the way programmers wrote programs, the first woodpecker to come along would destroy civilization.",
    author: "Gerald Weinberg",
  },
  { text: "Documentation? That's what the code is for.", author: "Anonymous" },

  // ── Wisdom ────────────────────────────────────────────────────────────────
  {
    text: "The function of good software is to make the complex appear simple.",
    author: "Grady Booch",
  },
  {
    text: "Make it work, make it right, make it fast — in that order.",
    author: "Kent Beck",
  },
  {
    text: "The only way to go fast is to go well.",
    author: "Robert C. Martin",
  },
  {
    text: "Simple things should be simple. Complex things should be possible.",
    author: "Alan Kay",
  },
  {
    text: "Good code is its own best documentation.",
    author: "Steve McConnell",
  },
  {
    text: "The best error message is the one that never shows up.",
    author: "Thomas Fuchs",
  },
  {
    text: "Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.",
    author: "Antoine de Saint-Exupéry",
  },
  { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
  {
    text: "Every great developer you know got there by solving problems they were unqualified to solve until they did it.",
    author: "Patrick McKenzie",
  },
  {
    text: "You don't have to be great to start, but you have to start to be great.",
    author: "Zig Ziglar",
  },
  {
    text: "Programs must be written for people to read, and only incidentally for machines to execute.",
    author: "Harold Abelson",
  },
  {
    text: "An investment in knowledge pays the best interest.",
    author: "Benjamin Franklin",
  },
  {
    text: "The value of a prototype is in the education it gives you, not in the code itself.",
    author: "Alan Cooper",
  },
  {
    text: "Write code that is easy to delete, not easy to extend.",
    author: "Tef",
  },
  { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
  {
    text: "A language that doesn't affect the way you think about programming is not worth knowing.",
    author: "Alan Perlis",
  },
  {
    text: "The most important property of a program is whether it accomplishes the intention of its user.",
    author: "C.A.R. Hoare",
  },

  // ── Motivational ──────────────────────────────────────────────────────────
  { text: "Every expert was once a beginner.", author: "Helen Hayes" },
  {
    text: "The best way to predict the future is to implement it.",
    author: "David Heinemeier Hansson",
  },
  { text: "Code is poetry.", author: "WordPress" },
  {
    text: "Your most unhappy customers are your greatest source of learning.",
    author: "Bill Gates",
  },
  {
    text: "The secret to getting ahead is getting started.",
    author: "Mark Twain",
  },
  { text: "When you get tired, learn to rest, not to quit.", author: "Banksy" },
  {
    text: "An hour of planning can save you 10 hours of doing.",
    author: "Dale Carnegie",
  },
  {
    text: "The only way to learn a new programming language is by writing programs in it.",
    author: "Brian Kernighan",
  },
  {
    text: "Sometimes it pays to stay in bed on Monday rather than spending the rest of the week debugging Monday's code.",
    author: "Dan Salomon",
  },
  {
    text: "A ship in harbor is safe, but that is not what ships are for. Push your code to prod.",
    author: "John A. Shedd (adapted)",
  },
];

function getDailyQuote(): { text: string; author: string } {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start.getTime()) / 86_400_000);
  return QUOTES[dayOfYear % QUOTES.length];
}

// ── ICS holiday fetch + parse ──────────────────────────────────────────────────
const ICS_URL = "https://www.officeholidays.com/ics/india/gujarat";

export interface Holiday {
  name: string;
}

interface HolidayCache {
  dateStr: string;
  holidays: Holiday[];
}

let _cache: HolidayCache | null = null;

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function fetchUrl(url: string, redirectsLeft = 5): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = (lib as typeof https).get(
      url,
      { headers: { "User-Agent": "ninja-runner-vscode/2.0" } },
      (res) => {
        if (
          (res.statusCode === 301 || res.statusCode === 302) &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          fetchUrl(res.headers.location, redirectsLeft - 1)
            .then(resolve)
            .catch(reject);
          return;
        }
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () => resolve(body));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error("Holiday fetch timed out"));
    });
  });
}

function parseIcs(ics: string, dateStr: string): Holiday[] {
  const results: Holiday[] = [];
  const blocks = ics.split("BEGIN:VEVENT").slice(1);
  for (const block of blocks) {
    // Match both DATE and DATETIME formats
    const dtMatch = block.match(/DTSTART[^:\n\r]*:(\d{8})/);
    if (!dtMatch || dtMatch[1] !== dateStr) {
      continue;
    }
    const sumMatch = block.match(/SUMMARY:([^\r\n]+)/);
    if (!sumMatch) {
      continue;
    }
    results.push({ name: sumMatch[1].trim() });
  }
  return results;
}

export async function fetchTodayHolidays(): Promise<Holiday[]> {
  const today = todayStr();
  if (_cache?.dateStr === today) {
    return _cache.holidays;
  }
  try {
    const ics = await fetchUrl(ICS_URL);
    const holidays = parseIcs(ics, today);
    _cache = { dateStr: today, holidays };
    return holidays;
  } catch (err) {
    console.error("Ninja Runner: holiday fetch failed:", err);
    // Return stale cache if available, else empty
    return _cache?.holidays ?? [];
  }
}

export function bustHolidayCache(): void {
  _cache = null;
}

// ── Tree items ─────────────────────────────────────────────────────────────────
const COLOR_HOLIDAY = new vscode.ThemeColor(
  "notificationsErrorIcon.foreground",
); // red/pink
const COLOR_QUOTE = new vscode.ThemeColor("editorInfo.foreground"); // blue
const COLOR_DIM = new vscode.ThemeColor("disabledForeground"); // grey

export class HolidayItem extends vscode.TreeItem {
  constructor(holiday: Holiday) {
    super(`${holiday.name}`, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "ninja-holiday";
    this.iconPath = new vscode.ThemeIcon("calendar", COLOR_HOLIDAY);
    this.description = "🌸 Holiday today!";
    this.tooltip = new vscode.MarkdownString(
      `**🎉 Gujarat Public Holiday**\n\n${holiday.name}`,
    );
  }
}

export class NoHolidayItem extends vscode.TreeItem {
  constructor() {
    super("No holiday today — ship it!", vscode.TreeItemCollapsibleState.None);
    this.contextValue = "ninja-no-holiday";
    this.iconPath = new vscode.ThemeIcon("circle-slash", COLOR_DIM);
    this.description = "";
    this.tooltip = "Gujarat holiday calendar — no holiday today";
  }
}

/** Splits text into lines of at most maxLen chars, breaking on word boundaries. */
function wordWrap(text: string, maxLen: number): string[] {
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

/** Returns 3-or-more TreeItems that form a visual quote card. */
export function buildQuoteItems(quote: {
  text: string;
  author: string;
}): vscode.TreeItem[] {
  const fullTooltip = new vscode.MarkdownString(
    `### 💬 Dev Quote\n\n❝ *${quote.text}* ❞\n\n**— ${quote.author}**`,
  );

  const lines = wordWrap(quote.text, 36);
  const items: vscode.TreeItem[] = [];

  lines.forEach((line, i) => {
    const isFirst = i === 0;
    const isLast = i === lines.length - 1;

    // Decorate first and last line with opening/closing quote marks
    const displayText = isFirst
      ? `❝  ${line}`
      : isLast
        ? `   ${line}  ❞`
        : `   ${line}`;

    const item = new vscode.TreeItem(
      displayText,
      vscode.TreeItemCollapsibleState.None,
    );
    item.contextValue = "ninja-quote-line";
    item.tooltip = fullTooltip;

    if (isFirst) {
      // First line gets the comment icon as the visual anchor
      item.iconPath = new vscode.ThemeIcon("quote", COLOR_QUOTE);
    } else {
      // Subsequent lines — no icon so text feels indented / continuous
      item.iconPath = new vscode.ThemeIcon("blank");
    }
    items.push(item);
  });

  // Author line
  const authorItem = new vscode.TreeItem(
    `   — ${quote.author}`,
    vscode.TreeItemCollapsibleState.None,
  );
  authorItem.contextValue = "ninja-quote-author";
  authorItem.iconPath = new vscode.ThemeIcon("blank");
  authorItem.description = "";
  authorItem.tooltip = fullTooltip;
  items.push(authorItem);

  return items;
}

export class LoadingItem extends vscode.TreeItem {
  constructor() {
    super("Checking holidays…", vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("loading~spin", COLOR_DIM);
  }
}

// ── Provider ───────────────────────────────────────────────────────────────────
export class NinjaInfoProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onChange = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onChange.event;

  private _items: vscode.TreeItem[] = [new LoadingItem()];
  private _midnightTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this._load();
    this._scheduleMidnightRefresh();
  }

  private async _load(): Promise<void> {
    const [holidays] = await Promise.all([fetchTodayHolidays()]);
    const quote = getDailyQuote();

    this._items = [];

    // Holiday section
    if (holidays.length > 0) {
      for (const h of holidays) {
        this._items.push(new HolidayItem(h));
      }
    } else {
      this._items.push(new NoHolidayItem());
    }

    // Quote card — split into word-wrapped lines with ❝ ❞ marks
    this._items.push(...buildQuoteItems(quote));

    this._onChange.fire();
  }

  refresh(): void {
    bustHolidayCache();
    this._items = [new LoadingItem()];
    this._onChange.fire();
    this._load();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (element) {
      return [];
    } // flat list — no children
    return this._items;
  }

  dispose(): void {
    if (this._midnightTimer) {
      clearTimeout(this._midnightTimer);
    }
    this._onChange.dispose();
  }

  private _scheduleMidnightRefresh(): void {
    const now = new Date();
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const msLeft = midnight.getTime() - now.getTime();
    this._midnightTimer = setTimeout(() => {
      this.refresh();
      // Re-schedule every 24h from now
      this._midnightTimer = setInterval(
        () => this.refresh(),
        24 * 60 * 60 * 1000,
      );
    }, msLeft);
  }
}
