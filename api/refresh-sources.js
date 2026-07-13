const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const TIMEOUT_MS = 9000;
const CONCURRENCY = 14;

module.exports = async function handler(req, res) {
  if (!["POST", "GET"].includes(req.method)) {
    res.statusCode = 405;
    res.setHeader("Allow", "GET, POST");
    res.end("Method Not Allowed");
    return;
  }

  try {
    const programs = readPrograms();
    const previous = readStatus();
    const results = await mapLimit(programs, CONCURRENCY, (program) => checkProgram(program, previous.sources || {}));
    const status = {
      checkedAt: new Date().toISOString(),
      summary: {
        total: results.length,
        ok: results.filter((item) => item.ok).length,
        changed: results.filter((item) => item.changed).length,
        failed: results.filter((item) => !item.ok).length
      },
      sources: Object.fromEntries(results.map((item) => [item.programId, item]))
    };

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ status }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: error.message }));
  }
};

function readPrograms() {
  const dataPath = path.join(process.cwd(), "data.js");
  const text = fs.readFileSync(dataPath, "utf8");
  const match = text.match(/window\.APPLICATION_TRACKER_DATA\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!match) throw new Error("Cannot parse data.js");
  return JSON.parse(match[1]).programs || [];
}

function readStatus() {
  const statusPath = path.join(process.cwd(), "sources-status.js");
  if (!fs.existsSync(statusPath)) {
    return { checkedAt: null, summary: { total: 0, ok: 0, changed: 0, failed: 0 }, sources: {} };
  }
  const text = fs.readFileSync(statusPath, "utf8");
  const match = text.match(/window\.APPLICATION_TRACKER_SOURCE_STATUS\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!match) {
    return { checkedAt: null, summary: { total: 0, ok: 0, changed: 0, failed: 0 }, sources: {} };
  }
  return JSON.parse(match[1]);
}

async function checkProgram(program, previousSources) {
  const checkedAt = new Date().toISOString();
  const source = program.source || "";
  const base = {
    programId: program.id,
    school: program.shortName || program.school || "",
    program: program.program || "",
    source,
    ok: false,
    statusCode: null,
    changed: false,
    hash: null,
    checkedAt,
    message: ""
  };

  if (!source) return { ...base, message: "No source URL" };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const response = await fetch(source, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EUApplyTracker/1.0; +cloud-personal-use)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        ...base,
        statusCode: response.status,
        message: response.status === 404 ? "Source URL returned 404" : `HTTP ${response.status}`
      };
    }

    const text = normalizeHtml(await response.text());
    const hash = crypto.createHash("sha256").update(text).digest("hex");
    const previousHash = previousSources[program.id] && previousSources[program.id].hash;

    return {
      ...base,
      ok: true,
      statusCode: response.status,
      changed: Boolean(previousHash && previousHash !== hash),
      hash,
      message: previousHash && previousHash !== hash ? "Changed since baseline" : "Reachable"
    };
  } catch (error) {
    return { ...base, message: error.name === "AbortError" ? "Timeout" : error.message };
  }
}

function normalizeHtml(html) {
  return String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 250000);
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
