import * as https from "https";
import * as http from "http";
import { DevQuote, Holiday } from "../types";

const ICS_URL = "https://www.officeholidays.com/ics/india/gujarat";

const QUOTES: DevQuote[] = [
  // ── Funny / Memes / Relatable ──────────────────────────────────────────────
  { text: "My code doesn't have bugs. It has unexpected party tricks.", author: "Sleep-Deprived Dev" },
  { text: "git commit -m 'Fixed bug' — translation: I have no idea what I changed but it works now.", author: "Git Historian" },
  { text: "I don't always test my code, but when I do, I do it directly in production.", author: "The Most Interesting Dev" },
  { text: "Why do programmers prefer dark mode? Because light attracts bugs.", author: "Midnight Coder" },
  { text: "A SQL query walks into a bar, walks up to two tables and asks: 'Can I join you?'", author: "Database Joker" },
  { text: "There are only 10 types of people: those who understand binary and those who don't.", author: "Anonymous" },
  { text: "A null pointer walked into a bar. The entire bar crashed.", author: "JVM Crash Report" },
  { text: "Programmer: An organism that converts caffeine and pizza into code.", author: "Science" },
  { text: "Why did the developer quit his job? Because he didn't get arrays.", author: "HR Department" },
  { text: "Keyboard not found. Press F1 to continue.", author: "Classic BIOS" },
  { text: "It works on my machine! Then ship your machine to the client.", author: "Senior Architect" },
  { text: "Weeks of coding can save you hours of planning.", author: "Anonymous" },
  { text: "Java is to JavaScript what car is to carpet.", author: "Chris Heilmann" },
  { text: "There is no place like 127.0.0.1.", author: "Localhost Explorer" },
  { text: "I have a joke about UDP... but you probably won't get it.", author: "Network Engineer" },
  { text: "Hardware is the part of the computer that you can kick when software crashes.", author: "Angry Sysadmin" },
  { text: "In order to understand recursion, you must first understand recursion.", author: "Anonymous" },
  { text: "Documentation? That's what the git commit history is for.", author: "Cowboy Coder" },
  { text: "99 little bugs in the code. Take one down, patch it around… 127 little bugs in the code.", author: "Song of Engineers" },
  { text: "Code never lies, comments sometimes do.", author: "Ron Jeffries" },
  { text: "Real programmers count from 0.", author: "Zero Index Fan Club" },
  { text: "If at first you don't succeed, call it version 1.0.", author: "Startup Founder" },

  // ── Classics & Wisdom ──────────────────────────────────────────────────────
  { text: "It's not a bug — it's an undocumented feature.", author: "Anonymous" },
  { text: "The best code is no code at all.", author: "Jeff Atwood" },
  { text: "Always code as if the person maintaining your code is a violent psychopath who knows where you live.", author: "John F. Woods" },
  { text: "If debugging is removing bugs, then programming must be putting them in.", author: "Edsger Dijkstra" },
  { text: "Any fool can write code a computer understands. Good programmers write code humans understand.", author: "Martin Fowler" },
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  { text: "Code is like humor. When you have to explain it, it's bad.", author: "Cory House" },
  { text: "A user interface is like a joke. If you have to explain it, it's not that good.", author: "Martin LeBlanc" },
  { text: "Debugging is twice as hard as writing the code. So if you write it as cleverly as possible, you're not smart enough to debug it.", author: "Brian Kernighan" },
  { text: "Walking on water and developing software from a spec are easy — if both are frozen.", author: "Edward V. Berard" },
  { text: "Measuring programming progress by lines of code is like measuring aircraft progress by weight.", author: "Bill Gates" },
  { text: "One man's crappy software is another man's full-time job.", author: "Jessica Gaston" },
  { text: "Most good programmers program not for pay, but because it is fun.", author: "Linus Torvalds" },
  { text: "No code is faster than no code.", author: "Kevlin Henney" },
  { text: "A good programmer looks both ways before crossing a one-way street.", author: "Doug Linder" },
  { text: "Programming is thinking, not typing.", author: "Casey Patton" },
  { text: "Copy-paste is a design error.", author: "David Parnas" },
  { text: "Don't comment bad code — rewrite it.", author: "Brian Kernighan" },
  { text: "Make it work, make it right, make it fast — in that order.", author: "Kent Beck" },
  { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
  { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
  { text: "The secret to getting ahead is getting started.", author: "Mark Twain" },
  { text: "A ship in harbor is safe, but that is not what ships are for. Push your code to prod.", author: "John A. Shedd" },
];

export class TodayService {
  private static instance: TodayService;
  private holidayCache: { dateStr: string; holidays: Holiday[] } | null = null;

  private constructor() {}

  public static getInstance(): TodayService {
    if (!TodayService.instance) {
      TodayService.instance = new TodayService();
    }
    return TodayService.instance;
  }

  public getDailyQuote(): DevQuote {
    const start = new Date(new Date().getFullYear(), 0, 0);
    const dayOfYear = Math.floor((Date.now() - start.getTime()) / 86_400_000);
    return QUOTES[dayOfYear % QUOTES.length];
  }

  public async fetchTodayHolidays(): Promise<Holiday[]> {
    const today = this.todayStr();
    if (this.holidayCache?.dateStr === today) {
      return this.holidayCache.holidays;
    }

    try {
      const ics = await this.fetchUrl(ICS_URL);
      const holidays = this.parseIcs(ics, today);
      this.holidayCache = { dateStr: today, holidays };
      return holidays;
    } catch {
      return this.holidayCache?.holidays ?? [];
    }
  }

  public bustCache(): void {
    this.holidayCache = null;
  }

  private todayStr(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}${m}${day}`;
  }

  private fetchUrl(url: string, redirectsLeft = 5): Promise<string> {
    return new Promise((resolve, reject) => {
      const lib = url.startsWith("https") ? https : http;
      const req = (lib as typeof https).get(
        url,
        { headers: { "User-Agent": "ninja-runner-vscode/3.0" } },
        (res) => {
          if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirectsLeft > 0) {
            this.fetchUrl(res.headers.location, redirectsLeft - 1).then(resolve).catch(reject);
            return;
          }
          let body = "";
          res.on("data", (chunk: Buffer) => (body += chunk.toString()));
          res.on("end", () => resolve(body));
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error("Timeout"));
      });
    });
  }

  private parseIcs(ics: string, dateStr: string): Holiday[] {
    const results: Holiday[] = [];
    const blocks = ics.split("BEGIN:VEVENT").slice(1);
    for (const block of blocks) {
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
}
