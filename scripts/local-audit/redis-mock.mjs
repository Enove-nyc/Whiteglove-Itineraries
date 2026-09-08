// A stand-in for the Upstash Redis REST API, for exercising the site locally.
// Implements exactly the commands the codebase uses, in the URL shapes it uses:
//   GET  /get/key            POST /set/key   (value = request body)   /set/key/value
//   /del/k1/k2  /incr/key  /setnx/key/value  /expire/key/secs
//   /lpush/key  (body) | /lpush/key/value   /lrange/key/start/stop
//   /sadd/key (body) | /sadd/key/member   /smembers/key   /srem/key/member
//   /zadd/key/score/member  /zrange/key/start/stop[/WITHSCORES]  /zrem/key/member
//   /hgetall/key  /hset/key/field/value  /keys/pattern  /scan/cursor/match/pat/count/n
//   POST /pipeline  body: [[cmd, ...args], ...]
// Every response is { result }. Nothing persists past the process.
import { createServer } from "node:http";

const store = new Map(); // key -> { t: "s"|"l"|"set"|"z"|"h", v }
const ttl = new Map();
const alive = (k) => { const e = ttl.get(k); if (e && e < Date.now()) { store.delete(k); ttl.delete(k); } return store.get(k); };
const dec = (s) => decodeURIComponent(s);
const glob = (pat) => new RegExp("^" + pat.split("*").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");

function run(cmd, args, body) {
  const c = cmd.toLowerCase();
  const key = args[0] !== undefined ? dec(args[0]) : undefined;
  const cur = key !== undefined ? alive(key) : undefined;
  switch (c) {
    case "get": return cur?.t === "s" ? cur.v : null;
    case "set": { const v = args.length > 1 ? dec(args.slice(1).join("/")) : body ?? ""; store.set(key, { t: "s", v: String(v) }); ttl.delete(key); return "OK"; }
    case "setnx": { if (cur) return 0; store.set(key, { t: "s", v: dec(args.slice(1).join("/")) }); return 1; }
    case "del": { let n = 0; for (const a of args) if (store.delete(dec(a))) n++; return n; }
    case "exists": return cur ? 1 : 0;
    case "incr": { const n = (cur?.t === "s" ? Number(cur.v) : 0) + 1; store.set(key, { t: "s", v: String(n) }); return n; }
    case "expire": { if (!cur) return 0; ttl.set(key, Date.now() + Number(args[1]) * 1000); return 1; }
    case "lpush": { const list = cur?.t === "l" ? cur.v : []; const vals = args.length > 1 ? args.slice(1).map(dec) : [body ?? ""]; list.unshift(...vals); store.set(key, { t: "l", v: list }); return list.length; }
    case "rpush": { const list = cur?.t === "l" ? cur.v : []; const vals = args.length > 1 ? args.slice(1).map(dec) : [body ?? ""]; list.push(...vals); store.set(key, { t: "l", v: list }); return list.length; }
    case "lrange": { const list = cur?.t === "l" ? cur.v : []; let a = Number(args[1]), b = Number(args[2]); if (b < 0) b = list.length + b; return list.slice(a, b + 1); }
    case "sadd": { const s = cur?.t === "set" ? cur.v : new Set(); const vals = args.length > 1 ? args.slice(1).map(dec) : [body ?? ""]; let n = 0; for (const v of vals) if (!s.has(v)) { s.add(v); n++; } store.set(key, { t: "set", v: s }); return n; }
    case "srem": { const s = cur?.t === "set" ? cur.v : new Set(); let n = 0; for (const a of args.slice(1)) if (s.delete(dec(a))) n++; return n; }
    case "smembers": return cur?.t === "set" ? [...cur.v] : [];
    case "sismember": return cur?.t === "set" && cur.v.has(dec(args[1])) ? 1 : 0;
    case "zadd": { const z = cur?.t === "z" ? cur.v : new Map(); z.set(dec(args[2]), Number(args[1])); store.set(key, { t: "z", v: z }); return 1; }
    case "zrem": { const z = cur?.t === "z" ? cur.v : new Map(); return z.delete(dec(args[1])) ? 1 : 0; }
    case "zrange": { const z = cur?.t === "z" ? [...cur.v.entries()].sort((a, b) => a[1] - b[1]) : []; let a = Number(args[1]), b = Number(args[2]); if (b < 0) b = z.length + b; const slice = z.slice(a, b + 1); return args.slice(3).some((x) => /withscores/i.test(x)) ? slice.flatMap(([m, s]) => [m, String(s)]) : slice.map(([m]) => m); }
    case "hset": { const h = cur?.t === "h" ? cur.v : new Map(); for (let i = 1; i + 1 < args.length; i += 2) h.set(dec(args[i]), dec(args[i + 1])); store.set(key, { t: "h", v: h }); return 1; }
    case "hget": return cur?.t === "h" ? (cur.v.get(dec(args[1])) ?? null) : null;
    case "hgetall": return cur?.t === "h" ? [...cur.v.entries()].flat() : [];
    case "hincrby": { const h = cur?.t === "h" ? cur.v : new Map(); const n = Number(h.get(dec(args[1])) ?? 0) + Number(args[2]); h.set(dec(args[1]), String(n)); store.set(key, { t: "h", v: h }); return n; }
    case "keys": { const re = glob(dec(args[0])); return [...store.keys()].filter((k) => re.test(k)); }
    case "scan": { const mi = args.findIndex((a) => a.toLowerCase() === "match"); const re = mi >= 0 ? glob(dec(args[mi + 1])) : /.*/; return ["0", [...store.keys()].filter((k) => re.test(k))]; }
    case "ping": return "PONG";
    default: throw new Error(`unsupported command ${cmd}`);
  }
}

createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    try {
      const url = new URL(req.url, "http://x");
      const parts = url.pathname.split("/").filter(Boolean);
      let result;
      if (parts[0] === "pipeline") {
        const cmds = JSON.parse(body || "[]");
        result = cmds.map((c) => { try { return { result: run(c[0], c.slice(1).map(encodeURIComponent), undefined) }; } catch (e) { return { error: String(e.message) }; } });
        res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(result)); return;
      }
      result = run(parts[0], parts.slice(1), req.method === "POST" && body !== "" ? body : undefined);
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ result }));
    } catch (e) {
      res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ error: String(e.message) }));
    }
  });
}).listen(Number(process.env.PORT ?? 6380), "127.0.0.1", () => console.log("redis-mock listening on 6380"));
