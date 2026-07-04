#!/usr/bin/env node
import { Socket } from "node:net";
import { readFile } from "node:fs/promises";

function parseArgs(argv) {
  const args = { targets: [], config: null, json: false, timeout: 3000, retries: 0, retryDelayMs: 500 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--config") args.config = argv[++i];
    else if (arg === "--json") args.json = true;
    else if (arg === "--timeout") args.timeout = Number(argv[++i]);
    else if (arg === "--retries") args.retries = Number(argv[++i]);
    else if (arg === "--retry-delay") args.retryDelayMs = Number(argv[++i]);
    else if (arg === "--discord-webhook") args.discordWebhook = argv[++i];
    else if (arg === "--quiet") args.quiet = true;
    else args.targets.push(arg);
  }
  return args;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkHostWithRetries(host, port, timeoutMs, retries, retryDelayMs) {
  let attempt = 0;
  let result;
  do {
    result = await checkHost(host, port, timeoutMs);
    if (result.up) return result;
    attempt++;
    if (attempt <= retries) await delay(retryDelayMs);
  } while (attempt <= retries);
  return result;
}

function checkHost(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new Socket();
    let settled = false;

    function finish(up) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ host, port, up, latencyMs: up ? Date.now() - start : null });
    }

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, host);
  });
}

async function notifyDiscord(webhookUrl, downHosts) {
  const content = `🔴 **server-watch alert** — ${downHosts.length} host(s) down:\n${downHosts
    .map((r) => `• ${r.host}:${r.port}`)
    .join("\n")}`;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
}

function parseTarget(target) {
  const [host, portStr] = target.split(":");
  return { host, port: Number(portStr) || 443 };
}

async function loadTargets(args) {
  if (args.config) {
    const raw = await readFile(args.config, "utf8");
    return JSON.parse(raw).map((t) => (typeof t === "string" ? parseTarget(t) : t));
  }
  return args.targets.map(parseTarget);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = await loadTargets(args);

  if (targets.length === 0) {
    console.error("Usage: server-watch <host:port> [host:port ...] [--config file.json] [--json] [--timeout ms]");
    process.exitCode = 1;
    return;
  }

  const results = await Promise.all(
    targets.map((t) => checkHostWithRetries(t.host, t.port, args.timeout, args.retries, args.retryDelayMs)),
  );

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      if (args.quiet && r.up) continue;
      const status = r.up ? `UP (${r.latencyMs}ms)` : "DOWN";
      console.log(`${r.host}:${r.port} — ${status}`);
    }
  }

  const downHosts = results.filter((r) => !r.up);
  if (downHosts.length > 0 && args.discordWebhook) {
    await notifyDiscord(args.discordWebhook, downHosts);
  }

  process.exitCode = downHosts.length > 0 ? 1 : 0;
}

main();
