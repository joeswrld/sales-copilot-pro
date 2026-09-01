import { writeFileSync } from "node:fs";

const now = new Date();

const heartbeat = `# Repository Heartbeat

> Automated repository activity report.

## Latest Update

**${now.toISOString()}**

This repository heartbeat is automatically updated every 5 minutes.

Last successful workflow execution:
${now.toUTCString()}
`;

writeFileSync("heartbeat.md", heartbeat, "utf8");

console.log("heartbeat.md updated:", now.toISOString());