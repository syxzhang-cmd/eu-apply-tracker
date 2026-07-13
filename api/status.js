const fs = require("node:fs");
const path = require("node:path");

module.exports = function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = 200;
  res.end(JSON.stringify({ refreshAvailable: true, status: readStatus() }));
};

function readStatus() {
  const statusPath = path.join(process.cwd(), "sources-status.js");
  const text = fs.readFileSync(statusPath, "utf8");
  const match = text.match(/window\.APPLICATION_TRACKER_SOURCE_STATUS\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!match) {
    return { checkedAt: null, summary: { total: 0, ok: 0, changed: 0, failed: 0 }, sources: {} };
  }
  return JSON.parse(match[1]);
}
