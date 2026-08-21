import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

function run(command: string): string {
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

const branch = run("git branch --show-current");

const latestCommit = run(
  'git log -1 --pretty=format:"%h - %s"'
);

const commits24h = run(
  'git log --since="24 hours ago" --oneline | wc -l'
);

const totalCommits = run(
  "git rev-list --count HEAD"
);

const contributors = run(
  "git shortlog -sne HEAD | wc -l"
);

const nodeVersion = process.version;

const heartbeat = `# Repository Heartbeat

> Automated repository health and activity report.

## Current Status

| Metric | Value |
|---|---|
| Maintainer | @joeswrld |
| Last update | ${now.toISOString()} |
| Branch | \`${branch}\` |
| Commits in last 24h | ${commits24h} |
| Total commits | ${totalCommits} |
| Contributors | ${contributors} |
| Node.js | \`${nodeVersion}\` |

## Latest Commit

\`${latestCommit}\`

## Repository Activity

This heartbeat is automatically generated every 30 minutes.

It tracks repository activity and provides a lightweight
snapshot of the project's current state.

---

_Automatically maintained._
`;

writeFileSync("heartbeat.md", heartbeat);

console.log("Heartbeat generated successfully.");