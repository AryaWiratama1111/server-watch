# server-watch

A small, dependency-free CLI tool to check whether hosts are reachable over TCP and how fast they respond — useful for a quick uptime check without pulling in a full monitoring stack.

## Usage

```bash
node index.js example.com:443 db.internal:3306
```

```
example.com:443 — UP (42ms)
db.internal:3306 — DOWN
```

### JSON output

```bash
node index.js example.com:443 --json
```

```json
[
  { "host": "example.com", "port": 443, "up": true, "latencyMs": 42 }
]
```

### Config file

```bash
node index.js --config targets.json
```

```json
["example.com:443", "db.internal:3306"]
```

### Options

| Flag | Description | Default |
|---|---|---|
| `--json` | Output machine-readable JSON instead of plain text | off |
| `--timeout <ms>` | Connection timeout per host | `3000` |
| `--retries <n>` | Retry a failed check before reporting it down | `0` |
| `--retry-delay <ms>` | Delay between retries | `500` |
| `--config <file>` | Load targets from a JSON file instead of args | — |
| `--discord-webhook <url>` | Post an alert to a Discord webhook if any host is down | — |

Exit code is `1` if any target is down, `0` if all are up — handy for chaining in a cron job or CI step.
