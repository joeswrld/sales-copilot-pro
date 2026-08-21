import { writeFileSync } from "node:fs";

const now = new Date();

const heartbeat = `# Repository Heartbeat

> Automated repository activity report.

## Latest Update

**${now.toISOString()}**

This repository heartbeat is automatically updated every 30 minutes.

Last successful workflow execution:
${now.toUTCString()}
`;

writeFileSync("heartbeat.md", heartbeat);

console.log("heartbeat.md updated:", now.toISOString());