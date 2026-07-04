#!/usr/bin/env node
import { Socket } from "node:net";
import { readFile } from "node:fs/promises";

function parseArgs(argv) {
  const args = { targets: [], config: null, json: false, timeout: 3000 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--config") args.config = argv[++i];
    else if (arg === "--json") args.json = true;
    else if (arg === "--timeout") args.timeout = Number(argv[++i]);
    else args.targets.push(arg);
  }
  return args;
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

  const results = await Promise.all(targets.map((t) => checkHost(t.host, t.port, args.timeout)));

  if (args.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      const status = r.up ? `UP (${r.latencyMs}ms)` : "DOWN";
      console.log(`${r.host}:${r.port} — ${status}`);
    }
  }

  process.exitCode = results.some((r) => !r.up) ? 1 : 0;
}

main();
