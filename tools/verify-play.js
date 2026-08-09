/* =====================================================================
 *  たべもののつくりかた — play.html の動作確認
 *
 *  実行:  node tools/verify-play.js            （13本ぜんぶ）
 *         node tools/verify-play.js トースト   （名前で絞り込み。部分一致）
 *
 *  tools/shoot.js は「サンプルを直に読み込んで実行する専用ページ」で撮る。
 *  こちらは、実際に配る play.html をそのまま開いて
 *  「図鑑から押したら本当に動くのか」を確かめる。
 *  違いは play.js が CDN からライブラリを取り、fetch でサンプルを読み、
 *  new Function に canvas / engine / HavokPhysics を渡して呼ぶところ。
 *
 *  合格の条件:
 *    ・window.__playScene が入る（createScene が値を返した）
 *    ・その後もフレームが増えている（描画ループが回っている）
 *    ・ページ内にエラーが出ていない
 *
 *  【注意】ヘッドレスなので SwiftShader で描きます。重いサンプルは
 *          出るまでに数分かかります。
 * ===================================================================== */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SAMPLES = path.join(ROOT, "samples");
const PORT = +(process.env.VERIFY_PORT || 8788);
const DBG = +(process.env.VERIFY_DBG_PORT || 9344);
const TIMEOUT = +(process.env.VERIFY_TIMEOUT || 600000);

const only = process.argv[2];
const files = fs.readdirSync(SAMPLES)
  .filter((f) => f.endsWith(".js") && !f.startsWith("_"))
  .filter((f) => !only || f.includes(only));
if (!files.length) { console.error("対象がありません:", only); process.exit(1); }

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg", ".png": "image/png"
};

/* リポジトリをそのまま配る。play.html は fetch で直下の .js を読む */
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  let p = path.join(ROOT, decodeURIComponent(u.pathname));
  if (u.pathname === "/") p = path.join(ROOT, "index.html");
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); return res.end();
  }
  res.writeHead(200, { "content-type": MIME[path.extname(p)] || "application/octet-stream" });
  res.end(fs.readFileSync(p));
});

function connect(url) {
  return new Promise((ok, ng) => {
    const ws = new WebSocket(url);
    const waits = new Map();
    let id = 0;
    ws.addEventListener("open", () => ok({
      send(method, params) {
        return new Promise((res, rej) => {
          const n = ++id;
          waits.set(n, { res, rej });
          ws.send(JSON.stringify({ id: n, method, params: params || {} }));
        });
      },
      close() { ws.close(); }
    }));
    ws.addEventListener("error", ng);
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && waits.has(m.id)) {
        const w = waits.get(m.id); waits.delete(m.id);
        m.error ? w.rej(new Error(m.error.message)) : w.res(m.result);
      }
    });
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(pathname, method) {
  // 【対策】/json/new は GET を受け付けない。PUT で叩く
  const res = await fetch("http://127.0.0.1:" + DBG + pathname, { method: method || "GET" });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch (e) { throw new Error(pathname + " → " + text.slice(0, 80)); }
}

function findChrome() {
  const cands = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  throw new Error("Chrome / Edge が見つかりません");
}

async function evalOn(page, expr) {
  const r = await page.send("Runtime.evaluate", { expression: expr, returnByValue: true });
  return r.result && r.result.value;
}

(async function main() {
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  console.log("server  http://127.0.0.1:" + PORT);

  const profile = path.join(require("os").tmpdir(), "vfc-verify-" + process.pid);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* noop */ }
  const chrome = spawn(findChrome(), [
    "--headless=new",
    "--remote-debugging-port=" + DBG,
    "--user-data-dir=" + profile,
    "--window-size=900,700",
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--enable-webgl", "--ignore-gpu-blocklist", "--hide-scrollbars", "--mute-audio",
    "about:blank"
  ], { stdio: "ignore" });

  let ver = null;
  for (let i = 0; i < 60 && !ver; i++) {
    try { ver = await getJson("/json/version"); } catch (e) { await sleep(500); }
  }
  if (!ver) { chrome.kill(); server.close(); throw new Error("Chrome に接続できません"); }
  console.log("chrome  " + ver["Browser"] + "\n");

  const ok = [], ng = [];
  for (const f of files) {
    process.stdout.write("  " + f.replace(/\.js$/, "").padEnd(14, "　") + " ");
    const t0 = Date.now();
    let page = null;
    try {
      const t = await getJson("/json/new?" + encodeURIComponent("about:blank"), "PUT");
      page = await connect(t.webSocketDebuggerUrl);
      await page.send("Page.enable");
      await page.send("Runtime.enable");
      // ページ内のエラーを拾えるようにしておく
      await page.send("Page.addScriptToEvaluateOnNewDocument", {
        source: "window.__errs=[];window.addEventListener('error',function(e){window.__errs.push(e.message)});"
      });
      await page.send("Page.navigate", {
        url: "http://127.0.0.1:" + PORT + "/play.html?f=" + encodeURIComponent(f)
      });

      // play.js が window.__playScene を入れるまで待つ
      let built = false;
      const until = Date.now() + TIMEOUT;
      let state = "";
      while (Date.now() < until) {
        await sleep(1000);
        built = await evalOn(page, "!!window.__playScene");
        state = await evalOn(page, "(document.getElementById('playState')||{}).textContent||''");
        if (built) break;
        if (/エラー|できません|見つかりません/.test(state)) break;
      }
      if (!built) throw new Error(state || "組み立てが終わりません");

      // 描画ループが本当に回っているか（1枚も進まないなら固まっている）
      const n1 = await evalOn(page, "window.__playScene.getEngine().frameId||0");
      await sleep(3000);
      const n2 = await evalOn(page, "window.__playScene.getEngine().frameId||0");
      if (!(n2 > n1)) throw new Error("描画ループが回っていません");

      const errs = await evalOn(page, "JSON.stringify(window.__errs||[])");
      const list = JSON.parse(errs || "[]");
      if (list.length) throw new Error("ページ内エラー: " + list[0]);

      const meshes = await evalOn(page, "window.__playScene.meshes.length");
      console.log("OK  メッシュ " + meshes + " / " +
        (n2 - n1) + "フレーム進行  " + Math.round((Date.now() - t0) / 1000) + "s");
      ok.push(f);
      await page.send("Page.close").catch(() => {});
    } catch (e) {
      console.log("NG  " + e.message);
      ng.push(f + "（" + e.message + "）");
    } finally {
      if (page) page.close();
    }
  }

  chrome.kill();
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* noop */ }
  console.log("\n動いた: " + ok.length + " / " + files.length);
  if (ng.length) { console.log("失敗:"); ng.forEach((x) => console.log("  " + x)); }
  process.exit(ng.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
