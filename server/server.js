// 袋づめ名人のサーバー：src/ を配信し、レシート解析(/api/analyze)を Claude Agent SDK で行う。
// CLAUDE_CODE_OAUTH_TOKEN は環境変数（.env）にだけ置き、ブラウザには出さない。
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 20 * 1024 * 1024, MAX_IMAGES = 8, MAX_PROMPT = 4000, MAX_RUNNING = 2;
const EXT = { "image/jpeg": "jpg", "image/png": "png" };
const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png", ".ico":"image/x-icon" };
let running = 0;

class ApiError extends Error { constructor(status, code){ super(code); this.status = status; this.code = code; } }

function send(res, status, body){
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req){
  let size = 0; const chunks = [];
  for await (const c of req){
    size += c.length;
    if(size > MAX_BODY) throw new ApiError(413, "image_rejected");
    chunks.push(c);
  }
  try{ return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch{ throw new ApiError(400, "invalid_json"); }
}

// 返答から最初の { 〜 最後の } を取り出してJSONにする
function extractJson(text){
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if(a < 0 || b <= a) throw new ApiError(502, "invalid_json");
  try{ return JSON.parse(text.slice(a, b + 1)); }
  catch{ throw new ApiError(502, "invalid_json"); }
}

function mapError(e){
  if(e instanceof ApiError) return e;
  const m = String(e?.message ?? e);
  if(/authentication|unauthorized|401|oauth|token|login/i.test(m)) return new ApiError(401, "session_expired");
  if(/rate.?limit|429|usage limit|overloaded/i.test(m)) return new ApiError(429, "rate_limited");
  return new ApiError(500, "unknown");
}

async function analyze(req, res){
  if(running >= MAX_RUNNING) throw new ApiError(429, "rate_limited");
  const body = await readJson(req);
  const { prompt, images } = body ?? {};
  if(typeof prompt !== "string" || !prompt || prompt.length > MAX_PROMPT) throw new ApiError(400, "invalid_json");
  if(!Array.isArray(images) || !images.length || images.length > MAX_IMAGES) throw new ApiError(400, "image_rejected");

  running++;
  const ac = new AbortController();
  res.on("close", () => { if(!res.writableEnded) ac.abort(); });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "fukurozume-"));
  try{
    const files = [];
    for(const [i, im] of images.entries()){
      const ext = EXT[im?.type];
      if(!ext || typeof im.data !== "string") throw new ApiError(400, "image_rejected");
      const file = path.join(dir, `img${i + 1}.${ext}`);
      await fs.writeFile(file, Buffer.from(im.data, "base64"));
      files.push(file);
    }
    const full = `${prompt}\n\n画像ファイル（先頭から順に）：\n${files.join("\n")}\nReadツールで全部読んでから、JSONだけで答えてください。`;

    let text = "";
    for await (const msg of query({
      prompt: full,
      options: {
        cwd: dir,
        abortController: ac,
        tools: ["Read"],
        maxTurns: 4,
        settingSources: [],
        systemPrompt: "あなたはレシートや、袋・箱の写真の解析器です。指示されたJSONだけを返答し、それ以外は書きません。",
        // Readは一時フォルダの中だけ。それ以外は何も許可しない
        canUseTool: async (tool, input) => {
          const target = typeof input?.file_path === "string" ? path.resolve(input.file_path) : "";
          if(tool === "Read" && target.startsWith(dir + path.sep)) return { behavior: "allow", updatedInput: input };
          return { behavior: "deny", message: "この操作は許可されていません" };
        }
      }
    })){
      if(msg.type === "result"){
        if(msg.is_error || msg.subtype !== "success") throw new ApiError(502, /auth|login|token/i.test(String(msg.result ?? "")) ? "session_expired" : "unknown");
        text = String(msg.result ?? "");
      }
    }
    if(!text.trim()) throw new ApiError(502, "empty_completion");
    send(res, 200, extractJson(text));
  } finally {
    running--;
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function serveStatic(req, res){
  let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if(rel.endsWith("/")) rel += "index.html";
  const file = path.resolve(ROOT, "." + rel);
  if(!file.startsWith(ROOT + path.sep)){ res.writeHead(403).end(); return; }
  try{
    const data = await fs.readFile(file);
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  }catch{ res.writeHead(404).end("not found"); }
}

http.createServer(async (req, res) => {
  try{
    const { pathname } = new URL(req.url, "http://x");
    if(req.method === "GET" && pathname === "/api/health")
      return send(res, 200, { ok: true, limits: { images: { maxCount: MAX_IMAGES } } });
    if(req.method === "POST" && pathname === "/api/analyze") return await analyze(req, res);
    if(req.method === "GET") return await serveStatic(req, res);
    res.writeHead(405).end();
  }catch(e){
    const err = mapError(e);
    if(res.headersSent) res.end(); else send(res, err.status, { error: { code: err.code } });
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
