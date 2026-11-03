// Bridges Neon's serverless driver (Postgres wire protocol inside WebSocket
// binary frames, over TLS on :443) to a plain local Postgres on 127.0.0.1:5433.
// Local audit tooling only. Hand-rolled RFC 6455 framing — no ws dependency.
import { createServer } from "node:https";
import { connect } from "node:net";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const PG_PORT = Number(process.env.PG_PORT ?? 5433);
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

function encodeFrame(payload, opcode = 0x2) {
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}

// Returns { frames: [{opcode, payload}], rest } from a buffer of one or more frames.
function decodeFrames(buf) {
  const frames = [];
  let off = 0;
  while (off + 2 <= buf.length) {
    const b0 = buf[off], b1 = buf[off + 1];
    const opcode = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f, p = off + 2;
    if (len === 126) { if (p + 2 > buf.length) break; len = buf.readUInt16BE(p); p += 2; }
    else if (len === 127) { if (p + 8 > buf.length) break; len = Number(buf.readBigUInt64BE(p)); p += 8; }
    let mask = null;
    if (masked) { if (p + 4 > buf.length) break; mask = buf.subarray(p, p + 4); p += 4; }
    if (p + len > buf.length) break;
    const payload = Buffer.from(buf.subarray(p, p + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    frames.push({ opcode, payload });
    off = p + len;
  }
  return { frames, rest: buf.subarray(off) };
}

const server = createServer({ key: readFileSync(new URL("./ws.key", import.meta.url)), cert: readFileSync(new URL("./ws.crt", import.meta.url)) }, (req, res) => {
  res.writeHead(426); res.end("upgrade required");
});

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  const accept = createHash("sha1").update(key + GUID).digest("base64");
  socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, "", ""].join("\r\n"));
  const pg = connect({ host: "127.0.0.1", port: PG_PORT });
  let pending = Buffer.alloc(0);
  let assembling = null; // continuation frames
  const trustFixture = process.env.COST_TRUST_AUTH_BRIDGE === "1";
  if (trustFixture && (process.env.AUDIT_ISOLATED !== "1" || PG_PORT !== 5433)) throw new Error("Trust auth bridge is for disposable fixtures only.");
  let frontend = Buffer.alloc(0), started = false, firstMessage = true;
  const forward = (payload) => {
    if (!trustFixture) { pg.write(payload); return; }
    frontend = Buffer.concat([frontend, payload]);
    for (;;) {
      if (!started) {
        if (frontend.length < 8) return;
        const length = frontend.readUInt32BE(0);
        if (length < 8 || length > 16 * 1024 * 1024 || frontend.readUInt32BE(4) !== 196608) throw new Error("Unsupported fixture startup.");
        if (frontend.length < length) return;
        pg.write(frontend.subarray(0, length));
        frontend = frontend.subarray(length);
        started = true;
      } else {
        if (frontend.length < 5) return;
        const length = frontend.readUInt32BE(1) + 1;
        if (length < 5 || length > 16 * 1024 * 1024) throw new Error("Invalid fixture wire message.");
        if (frontend.length < length) return;
        // Neon may pipeline one PasswordMessage. The disposable database uses
        // trust auth and has already sent AuthenticationOk; discard only that
        // initial password. Every query and result still reaches real Postgres.
        if (!(firstMessage && frontend[0] === 0x70)) pg.write(frontend.subarray(0, length));
        firstMessage = false;
        frontend = frontend.subarray(length);
      }
    }
  };
  socket.on("data", (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    const { frames, rest } = decodeFrames(pending);
    pending = Buffer.from(rest);
    for (const f of frames) {
      if (f.opcode === 0x8) { pg.end(); socket.end(encodeFrame(Buffer.alloc(0), 0x8)); return; }
      if (f.opcode === 0x9) { socket.write(encodeFrame(f.payload, 0xa)); continue; }
      if (f.opcode === 0x0) { assembling = Buffer.concat([assembling ?? Buffer.alloc(0), f.payload]); forward(assembling); assembling = null; continue; }
      if (f.opcode === 0x1 || f.opcode === 0x2) forward(f.payload);
    }
  });
  pg.on("data", (d) => socket.write(encodeFrame(d, 0x2)));
  pg.on("close", () => { try { socket.end(encodeFrame(Buffer.alloc(0), 0x8)); } catch {} });
  pg.on("error", (e) => { process.stderr.write(`pg error: ${e.message}\n`); socket.destroy(); });
  socket.on("close", () => pg.destroy());
  socket.on("error", () => pg.destroy());
});

server.listen(443, "127.0.0.1", () => console.log("ws→pg bridge on wss://127.0.0.1:443 → 127.0.0.1:" + PG_PORT));

