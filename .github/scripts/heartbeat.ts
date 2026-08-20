import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function command(command: string): string {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "Unavailable";
  }
}

const now = new Date();

const branch = command("git branch --show-current");
const latestCommit = command(
  'git log -1 --pretty=format:"%h - %s"'
);
const commits24h = command(
  'git log --since="24 hours ago" --oneline | wc -l'
);
const totalCommits = command(
  "git rev-list --count HEAD"
);
const contributors = command(
  "git shortlog -sne HEAD | wc -l"
);
const nodeVersion = process.version;

const heartbeat = `# Repository Heartbeat

> Automated repository health and activity report.

## Current Status

| Metric | Value |
|---|---|
| Last update | ${now.toISOString()} |
| Branch | \`${branch}\` |
| Commits in last 24h | ${commits24h} |
| Total commits | ${totalCommits} |
| Contributors | ${contributors} |
| Node.js | \`${nodeVersion}\` |

## Latest Commit

\`${latestCommit}\`

## Repository Activity

This page is automatically refreshed every 30 minutes by GitHub Actions.

The heartbeat tracks repository activity and provides a lightweight
snapshot of the project's current state.

---

_This file is generated automatically. Manual edits may be overwritten._
`;

writeFileSync("heartbeat.md", heartbeat);

console.log("Heartbeat updated successfully.");
