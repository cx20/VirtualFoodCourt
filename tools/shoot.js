/* =====================================================================
 *  たべもののつくりかた — 図鑑用サムネイルの収録
 *
 *  実行:  node tools/shoot.js            （14本ぜんぶ）
 *         node tools/shoot.js トースト   （名前で絞り込み。部分一致）
 *
 *  やっていること:
 *    1. ローカルに小さな HTTP サーバを立てる（file:// だと CDN も
 *       WebGL も面倒になるため）
 *    2. ヘッドレスの Chrome を --remote-debugging-port つきで起動し、
 *       DevTools プロトコル（CDP）を Node 内蔵の WebSocket で叩く
 *    3. サンプルを1本ずつ実際に実行し、盛り付けが落ち着いたところで
 *       GUI だけ隠して撮る
 *    4. assets/thumbs/<名前>.jpg に書き出す
 *
 *  【注意】初回だけ Babylon 本体を CDN から落とします（以後は一時フォルダに
 *          置いたものを使い回すので、ネットが不安定でも止まりません）。
 *          GPU が無くても SwiftShader で描けます。
 *
 *  【注意】この14本は野菜編より1本あたりが重いです。模様を画像として
 *          持たず、1024x1024 のテクスチャを実行時に何枚も CPU で焼くため
 *          （たこ焼きは4柄 x 3枚、チョコレートは8種ぶん）。
 *          組み立てだけで1〜3分かかるものがあり、14本で20〜40分見てください。
 *
 *  再収録が要るのは「サンプルの見た目を変えたとき」だけです。
 *  生成物は assets/thumbs/ に入り、リポジトリに入れて配ります:
 *    ・<名前>.jpg   … 図鑑のカードに出す写真
 *    ・index.json   … 人が読む用の一覧
 *    ・thumbs.js    … 図鑑が読む用（file:// でも動くよう JSON ではなく JS）
 * ===================================================================== */
const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const SAMPLES = path.join(ROOT, "samples");
const OUT = path.join(ROOT, "assets/thumbs");
const PORT = +(process.env.SHOOT_PORT || 8777);
const DBG = +(process.env.SHOOT_DBG_PORT || 9333);

/* 撮影サイズ。カードには幅320前後で置くので、2倍弱で撮って縮める */
const W = 640, H = 480, SCALE = 1.5, QUALITY = 78;

/* createScene() の完了待ちの上限（ms）。
   たこ焼きは 1024² のテクスチャを4柄 x 3枚、チョコレートは8種ぶん焼くので、
   組み立てるだけで数分かかることがある */
const BUILD_TIMEOUT = +(process.env.SHOOT_BUILD_TIMEOUT || 600000);
/* 【対策】固定時間で待つと、盛り付けの途中（宙に唐揚げが浮いた絵）で撮れる。
 *         SwiftShader は数 fps しか出ないうえ、サンプル側が
 *         dt = min(0.05, 実時間) と刻んでいるので、シーン内の時間は
 *         実時間の何分の一かでしか進まない。何個落とすかも料理ごとに違う。
 *         そこで「もの（メッシュ）が増えず、動かなくなった」ことを見て待つ */
const SETTLE_TIMEOUT = 150000;
const STABLE_POLLS = 2;        // 個数がこれだけ連続で同じなら投入は済み
const STILL_POLLS = 3;         // 誰も動かない状態がこれだけ続いたら完了
const GIVEUP_POLLS = 14;       // 止まりきらないサンプル用の保険
const POLL_EVERY = 1500;
const SETTLE_MOVE = 0.02;      // 1回ぶんの間にこれ以下しか動かなければ静止（cm）

const only = process.argv[2];
const files = fs
  .readdirSync(SAMPLES)
  .filter((f) => f.endsWith(".js") && !f.startsWith("_"))
  .filter((f) => !only || f.includes(only));

if (!files.length) { console.error("対象がありません:", only); process.exit(1); }

/* ---------- 1. ローカルサーバ ----------
 *  【対策】PAGE はテンプレートリテラルなので、この中に
 *          バックスラッシュ付きの記法（改行やタブのエスケープ）を書くと、
 *          ページに届く前に本物の改行へ変換され、ページ側の文字列が
 *          閉じないままインラインの <script> が丸ごと構文エラーになる。
 *          症状は「組み立てが終わりません」だけで、原因が見えない。
 *          この中ではエスケープを一切使わないこと。
 *          検査したいときは、テンプレートを評価してから構文検査する
 * ------------------------------------------------------------------ */
const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>html,body{margin:0;overflow:hidden;background:#000}
canvas{width:100vw;height:100vh;display:block;outline:none}</style>
</head><body>
<canvas id="renderCanvas" touch-action="none"></canvas>
<script src="/lib/babylon.js"></script>
<script src="/lib/babylon.gui.min.js"></script>
<script src="/lib/HavokPhysics_umd.js"></script>
<script>
window.__state = "loading";
window.addEventListener("error", function (e) {
    window.__err = (e && e.message) || "error";
});
var canvas = document.getElementById("renderCanvas");
/* 第4引数 adaptToDeviceRatio = true。これが無いと CSS の 640px ぶんしか
   描かず、撮影時に引き伸ばされて眠い絵になる */
var engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true, stencil: true, antialias: true
}, true);
var f = new URLSearchParams(location.search).get("f");
var s = document.createElement("script");
s.src = "/sample?f=" + encodeURIComponent(f);
s.onerror = function () { window.__state = "error:サンプルを読めません"; };
s.onload = function () {
    Promise.resolve()
        .then(function () { return createScene(); })
        .then(function (scene) {
            window.__scene = scene;
            window.__frames = 0;
            engine.runRenderLoop(function () {
                if (!scene.activeCamera) return;
                window.__frames++;
                scene.render();
            });
            window.__state = "built";
        })
        .catch(function (e) { window.__state = "error:" + (e && e.message || e); });
};
document.head.appendChild(s);

/* 撮る直前に GUI（右下のスライダーと左上のカード）だけ隠す。
   これは操作パネルであって料理ではないので、サムネイルには要らない */
/* 【対策】GPU が無いので SwiftShader が描く。PBR + IBL + 影 + SSAO を
 *         等倍で回すと 1 fps しか出ず、盛り付けが終わるまで5分かかった。
 *         物理が進むかどうかは「1秒に何フレーム描けたか」で決まるので、
 *         待っているあいだだけ 1/4 の解像度で描き、撮る直前に戻す。
 *         見た目に影響するのは最後の数フレームだけ */
window.__fast = function (on) {
    var s = window.__scene; if (!s) return 0;
    var e = s.getEngine();
    if (on) {
        if (window.__hw === undefined) window.__hw = e.getHardwareScalingLevel();
        e.setHardwareScalingLevel(6);
        // 影と後処理（SSAO・トーンマッピング）は待っているあいだ要らない。
        // この2つを切るだけで、盛り付けが終わるまでの時間が数分の一になる
        s.shadowsEnabled = false;
        s.postProcessesEnabled = false;
    } else {
        e.setHardwareScalingLevel(window.__hw === undefined ? 1 : window.__hw);
        s.shadowsEnabled = true;
        s.postProcessesEnabled = true;
    }
    return e.getHardwareScalingLevel();
};

window.__hideGui = function () {
    var n = 0, s = window.__scene;
    if (!s) return 0;
    (s.textures || []).forEach(function (t) {
        if (t.getClassName && t.getClassName() === "AdvancedDynamicTexture" && t.rootContainer) {
            t.rootContainer.isVisible = false; n++;
        }
    });
    return n;
};

/* 盛り付けが終わったかの目印。
   【対策】位置を丸めた値を比べる方式は、1秒に3枚しか描けないと
           「たまたま同じ」で早すぎる合格を出し、具が宙に浮いたまま
           撮れてしまった。サンプル側は落とすまで mesh を setEnabled(false)
           にし、静まったら STATIC に固定するので、
           「見えているものの数」と「いちばん速いものの速さ」を見れば確実 */
window.__sig = function () {
    var s = window.__scene; if (!s) return "0:99:99";
    var n = 0, vmax = 0, bodies = 0;
    var cur = [];
    var list = s.meshes.concat(s.transformNodes || []);
    for (var i = 0; i < list.length; i++) {
        var m = list[i];
        var real = m.getTotalVertices && m.getTotalVertices() && m.isEnabled();
        if (real) {
            n++;
            // 【対策】剛体の速度だけを見ていたら、全サンプルで 0.00 と出た。
            //         止まったからではなく読めていなかったので、落下の
            //         途中で「静止した」と判定して撮ってしまい、唐揚げが
            //         皿を突き抜けた絵になった。位置と姿勢を実測する
            m.computeWorldMatrix(true);
            var p = m.getAbsolutePosition();
            cur.push(p.x, p.y, p.z);
            var bb = m.getBoundingInfo && m.getBoundingInfo().boundingBox;
            if (bb) {
                // 回転だけしているものも捉えたいので、対角の2点も見る
                cur.push(bb.vectorsWorld[0].x, bb.vectorsWorld[0].y, bb.vectorsWorld[0].z);
                cur.push(bb.vectorsWorld[7].x, bb.vectorsWorld[7].y, bb.vectorsWorld[7].z);
            }
        }
        var b = m.physicsBody;
        if (b) {
            bodies++;
            try {
                var v = b.getLinearVelocity().length();
                var w = b.getAngularVelocity().length();
                if (v > vmax) vmax = v;
                if (w > vmax) vmax = w;
            } catch (e) { /* STATIC に落とされた後は読めないことがある */ }
        }
    }
    // 前回からいちばん大きく動いた距離（cm）
    var prev = window.__prevPos, motion = 999;
    window.__prevPos = cur;
    if (prev && prev.length === cur.length) {
        motion = 0;
        for (var k = 0; k < cur.length; k += 3) {
            var dx = cur[k] - prev[k], dy = cur[k + 1] - prev[k + 1], dz = cur[k + 2] - prev[k + 2];
            var dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dd > motion) motion = dd;
        }
    }
    return n + ":" + motion.toFixed(4) + ":" + bodies + "/" + vmax.toFixed(2);
};

/* 描かれた絵そのものを走査して、料理の写っている範囲を返す。
   【対策】はじめは各メッシュの境界ボックスを射影して求めていたが、
           カメラが寄っているサンプルでは手前の角がニアクリップより内側に
           入り、その角を捨てるせいで枠が上半分しか取れなかった
           （盛りの下がぶつ切りになった）。
           背景がべた塗りなので、背景と違う色のピクセルを探すほうが確実。
           走査は 200px 幅に縮めた絵で行う（誤差は数ピクセル） */
window.__frame = function () {
    var s = window.__scene; if (!s) return null;
    var cv = document.getElementById("renderCanvas");
    var SW = 200, SH = Math.max(1, Math.round(SW * cv.height / cv.width));
    var off = document.createElement("canvas");
    off.width = SW; off.height = SH;
    var g = off.getContext("2d", { willReadFrequently: true });
    g.drawImage(cv, 0, 0, SW, SH);
    var d;
    try { d = g.getImageData(0, 0, SW, SH).data; } catch (e) { return null; }

    // 【対策】背景を「四隅の色」で決める方式は、寿司や焼き魚のように
    //         暗いホリゾントを敷いたシーンで破綻した（背景が四隅と違う色なので
    //         画面ぜんぶが被写体と判定され、切り出しがまるで効かない）。
    //         このスタジオ背景は上から下へ変わるが、横方向にはどの行も一様。
    //         そこで背景を「その行の中央値」と置く。ホリゾントの境目は行ぜんぶに
    //         わたるので中央値そのものになって消え、被写体だけが残る
    var TOL = 18;
    var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, hit = 0;
    for (var y2 = 0; y2 < SH; y2++) {
        var mr = [], mg = [], mb = [], x2, i2;
        for (x2 = 0; x2 < SW; x2++) {
            i2 = (y2 * SW + x2) * 4;
            mr.push(d[i2]); mg.push(d[i2 + 1]); mb.push(d[i2 + 2]);
        }
        var cmp = function (a, b) { return a - b; };
        mr.sort(cmp); mg.sort(cmp); mb.sort(cmp);
        var mid = SW >> 1, Rr = mr[mid], Gr = mg[mid], Br = mb[mid];
        for (x2 = 0; x2 < SW; x2++) {
            i2 = (y2 * SW + x2) * 4;
            var dv = Math.max(Math.abs(d[i2] - Rr),
                              Math.abs(d[i2 + 1] - Gr),
                              Math.abs(d[i2 + 2] - Br));
            if (dv < TOL) continue;
            if (x2 < minx) minx = x2; if (x2 > maxx) maxx = x2;
            if (y2 < miny) miny = y2; if (y2 > maxy) maxy = y2;
            hit++;
        }
    }
    if (hit < 20) return null;

    // カードの下地に使う色は、いちばん端の帯の中央値にする
    var edge = [];
    for (var e2 = 0; e2 < SW; e2++) edge.push(e2 * 4);
    var pick = function (o) {
        var a = edge.map(function (i) { return d[i + o]; }).sort(function (p2, q2) { return p2 - q2; });
        return a[a.length >> 1];
    };
    var R0 = pick(0), G0 = pick(1), B0 = pick(2);

    var kx = window.innerWidth / SW, ky = window.innerHeight / SH;
    var box = { x: minx * kx, y: miny * ky,
                w: (maxx - minx + 1) * kx, h: (maxy - miny + 1) * ky, how: "画素" };

    // 【対策】寿司のように「暗いホリゾント」を敷いてあるシーンでは、
    //         背景そのものが四隅と違う色なので画面全体が中身と判定される。
    //         画面をほぼ埋めてしまったときだけ、メッシュの境界ボックスを
    //         射影した枠に切り替える（こちらは ground を名前で除ける）
    // 【対策】形状から出した枠は、隠れているメッシュや親子付けの都合で
    //         実際よりずっと小さく出ることがある（粒を集めた盛りで
    //         3〜7% しか拾えず、寄りすぎて被写体が切れた）。
    //         画面の 12% 未満しか無いときは信用せず、画素の枠のまま使う
    var frameArea = window.innerWidth * window.innerHeight;
    if (box.w * box.h > frameArea * 0.985) {
        var g2 = window.__geoFrame();
        if (g2 && g2.w * g2.h > frameArea * 0.12 && g2.w * g2.h < box.w * box.h * 0.5) box = g2;
    }

    // カードの余白をこの色で塗れば、切り出しの縦横比が揃わなくても目立たない
    var h2 = function (n) { n = Math.round(n); return (n < 16 ? "0" : "") + n.toString(16); };
    box.W = window.innerWidth; box.H = window.innerHeight; box.n = hit;
    box.bg = "#" + h2(R0) + h2(G0) + h2(B0);
    return box;
};

/* 形から枠を出す方式。__frame の控え。
   【対策】境界ボックスの8隅を射影する素直なやり方は、カメラが寄っていると
           手前の隅がニアクリップの外に出て捨てられ、枠が壊れる。
           境界球の中心と、そこから右へ半径ぶんずらした点を射影して
           「画面上の半径」を作れば、隅を扱わずに済む */
window.__geoFrame = function () {
    var s = window.__scene, cam = s.activeCamera; if (!cam) return null;
    var eng = s.getEngine();
    var rw = eng.getRenderWidth(), rh = eng.getRenderHeight();
    var vp = cam.viewport.toGlobal(rw, rh);
    var tm = s.getTransformMatrix(), I = BABYLON.Matrix.Identity();
    var right = cam.getDirection(BABYLON.Axis.X);
    var minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9, hit = 0;
    for (var i = 0; i < s.meshes.length; i++) {
        var m = s.meshes[i];
        if (!m.isEnabled() || !m.isVisible || !m.getTotalVertices || !m.getTotalVertices()) continue;
        /* 背景だけを除く。皿・板・舟皿は「料理の一部」なので残す
           （ここで plate まで除くと、寄りすぎて皿が切れた絵になる） */
        if (/ground|floor|backdrop|shadowCatcher|skybox|table|cloth|paper|fence|probe|normals|dbg/i.test(m.name)) continue;
        var bs = m.getBoundingInfo().boundingSphere;
        var c = BABYLON.Vector3.Project(bs.centerWorld, I, tm, vp);
        if (c.z < 0 || c.z > 1) continue;
        var e = BABYLON.Vector3.Project(
            bs.centerWorld.add(right.scale(bs.radiusWorld)), I, tm, vp);
        var r = Math.abs(e.x - c.x);
        if (!(r > 0)) continue;
        if (c.x - r < minx) minx = c.x - r; if (c.x + r > maxx) maxx = c.x + r;
        if (c.y - r < miny) miny = c.y - r; if (c.y + r > maxy) maxy = c.y + r;
        hit++;
    }
    if (!hit) return null;
    var k2 = window.innerWidth / rw;
    return { x: minx * k2, y: miny * k2,
             w: (maxx - minx) * k2, h: (maxy - miny) * k2, how: "形状" };
};

/* 診断用。どのメッシュが枠の計算に入ったかを見る */
window.__dump = function () {
    var s = window.__scene, out = [];
    var all = s.meshes.concat(s.transformNodes || []);
    for (var i = 0; i < all.length && i < 40; i++) {
        var m = all[i];
        m.computeWorldMatrix(true);
        var p = m.getAbsolutePosition();
        out.push(m.name +
            " v=" + (m.getTotalVertices ? m.getTotalVertices() : 0) +
            " en=" + (m.isEnabled() ? 1 : 0) +
            " par=" + (m.parent ? m.parent.name : "-") +
            " body=" + (m.physicsBody ? 1 : 0) +
            " imp=" + (m.physicsImpostor ? 1 : 0) +
            " y=" + p.y.toFixed(2));
    }
    out.push("[meshes=" + s.meshes.length + " nodes=" + (s.transformNodes || []).length +
        " engine=" + (s.getPhysicsEngine() ? "yes" : "no") + "]");
    return out.join("  ||  ");
};
</script></body></html>`;

/* Babylon 本体は一度だけ落として使い回す。
   【対策】毎回 CDN から読ませていたら、何十回も走らせるうちに
           読み込みが落ちるようになり、「組み立てが終わりません」で
           止まるサンプルが出た。手元に置いてしまえば起きない */
/* 【対策】UMD だけ置いても足りない。HavokPhysics() は自分と同じ場所から
 *         HavokPhysics.wasm を読みに行くので、これを配り忘れると
 *         物理の初期化が黙って失敗する。サンプル側は物理が無ければ
 *         「一列に並べる」フォールバックに落ちるので、絵は出るが
 *         具が皿を突き抜けた状態で撮れてしまう */
const LIBS = {
  "babylon.js": "https://cdn.babylonjs.com/babylon.js",
  "babylon.gui.min.js": "https://cdn.babylonjs.com/gui/babylon.gui.min.js",
  "HavokPhysics_umd.js": "https://cdn.babylonjs.com/havok/HavokPhysics_umd.js",
  "HavokPhysics.wasm": "https://cdn.babylonjs.com/havok/HavokPhysics.wasm"
};
const LIBDIR = path.join(require("os").tmpdir(), "vfc-shoot-lib");

async function ensureLibs() {
  fs.mkdirSync(LIBDIR, { recursive: true });
  for (const [name, url] of Object.entries(LIBS)) {
    const p = path.join(LIBDIR, name);
    if (fs.existsSync(p) && fs.statSync(p).size > 10000) continue;
    process.stdout.write("  取得 " + name + " ... ");
    const res = await fetch(url);
    if (!res.ok) throw new Error(name + " が取れません（HTTP " + res.status + "）");
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(p, buf);
    console.log(Math.round(buf.length / 1024) + "KB");
  }
}

/* PAGE の中のスクリプトが壊れていると、症状が
   「組み立てが終わりません」としか出ず原因が分からない。起動時に検査する */
{
  const m = PAGE.match(/<script>([\s\S]*?)<\/script>/);
  try { new Function(m[1]); }
  catch (e) {
    console.error("PAGE のスクリプトが壊れています: " + e.message +
      "\n（テンプレートリテラルの中でバックスラッシュのエスケープを使っていませんか）");
    process.exit(1);
  }
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (process.env.SHOOT_TRACE) console.log("    ← " + req.url);
  if (u.pathname.startsWith("/lib/")) {
    const name = path.basename(u.pathname);
    const p = path.join(LIBDIR, name);
    if (!LIBS[name] || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, {
      "content-type": name.endsWith(".wasm")
        ? "application/wasm" : "application/javascript; charset=utf-8"
    });
    return res.end(fs.readFileSync(p));
  }
  if (u.pathname === "/sample") {
    const name = u.searchParams.get("f") || "";
    const p = path.join(SAMPLES, name);
    if (!fs.existsSync(p) || path.dirname(p) !== SAMPLES) { res.writeHead(404); return res.end(); }
    // Playground 用の行なので、素の <script> では構文エラーになる。落とす
    const code = fs.readFileSync(p, "utf8").replace(/^export default createScene;\s*$/m, "");
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
    return res.end(code);
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(PAGE);
});

/* ---------- 2. CDP の薄いクライアント ---------- */
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

/* 等倍に戻したあと、実際に n フレーム描き終わるまで待つ。
   時間で待つと、重いサンプルで前の解像度の絵が残ったまま撮ってしまう */
async function waitFrames(page, n, timeout) {
  const base = (await page.send("Runtime.evaluate", {
    expression: "window.__frames", returnByValue: true
  })).result.value || 0;
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    await sleep(500);
    const now = (await page.send("Runtime.evaluate", {
      expression: "window.__frames", returnByValue: true
    })).result.value || 0;
    if (now - base >= n) return true;
  }
  return false;
}

/* 中身の枠から、切り出し範囲を作る。
   【対策】4:3 に決め打ちすると、長角皿のように「横に広くて薄い」絵で
           上下に巨大な余白ができた（中身は縦の4割しか占めない）。
           かといって縦に高く盛るものもあるので、比率は 1.1〜2.0 の範囲に収めるだけにし、
           残りはカード側で背景色を敷いて吸収する。
   【対策】枠にぴったり寄せると影とハイライトが切れるので、8% ほど余白を足す
   【対策】ただし「形状」から出した枠のときは 8% では足りない。
           境界球から作る都合で実際より小さく出るうえ、料理は木のテーブルや
           クロスを敷いていて画素の走査が効かず、この経路に落ちるものが多い。
           茶碗の底が切れた絵（ご飯.js）がこれだった。形状のときは 30% 足す */
const AR_MIN = 1.1, AR_MAX = 2.0;
function cropOf(f) {
  if (!f || !(f.w > 4) || !(f.h > 4)) return null;
  const pad = f.how === "形状" ? 1.30 : 1.08;
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  let w = f.w * pad, h = f.h * pad;
  // 比率を整えるときは「足りないほうを伸ばす」だけ。縮めると中身が切れる
  if (w / h > AR_MAX) h = w / AR_MAX;
  if (w / h < AR_MIN) w = h * AR_MIN;
  // 画面に収まるところまでは戻す。ただし「中身そのもの」より小さくはしない
  // 【対策】ここで無条件に縮めると、盛りの下がぶつ切りになった。
  //         逆に画面より大きいからと全面を撮ると、長角皿のように横長のシーンで
  //         上下が余白だらけになる
  w = Math.max(Math.min(w, f.W), Math.min(f.w, f.W));
  h = Math.max(Math.min(h, f.H), Math.min(f.h, f.H));
  const x = Math.max(0, Math.min(f.W - w, cx - w / 2));
  const y = Math.max(0, Math.min(f.H - h, cy - h / 2));
  // scale は 1。Emulation 側で既に 1.5 倍に描いているので、
  // ここで更に掛けると実際に描いた画素より大きく引き伸ばすだけになる
  return { x: Math.round(x), y: Math.round(y),
           width: Math.round(w), height: Math.round(h), scale: 1 };
}

async function getJson(pathname, method) {
  // 【対策】/json/new は GET を受け付けない（"Using unsafe HTTP verb" が
  //         JSON ではなく素のテキストで返り、パースで落ちる）。PUT で叩く
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

/* ---------- 3. 本体 ---------- */
(async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await ensureLibs();
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  console.log("server  http://127.0.0.1:" + PORT);

  // 【対策】プロファイルを使い回すと、前回の Chrome が生き残っていたときに
  //         新しいプロセスがそちらへ引き継がれ、デバッグポートが「前回の
  //         ブラウザ」につながる。前回のページは既に死んだサーバを見ているので
  //         /sample が返らず、組み立てが永久に終わらない。毎回まっさらにする
  const profile = path.join(require("os").tmpdir(), "vfc-shoot-" + process.pid);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* noop */ }
  const chrome = spawn(findChrome(), [
    "--headless=new",
    "--remote-debugging-port=" + DBG,
    "--user-data-dir=" + profile,
    "--window-size=" + W + "," + H,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    // GPU が無くても WebGL を出す
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "--enable-webgl", "--ignore-gpu-blocklist",
    "--hide-scrollbars", "--mute-audio",
    "about:blank"
  ], { stdio: "ignore" });

  // デバッグポートが開くのを待つ
  let ver = null;
  for (let i = 0; i < 60 && !ver; i++) {
    try { ver = await getJson("/json/version"); } catch (e) { await sleep(500); }
  }
  if (!ver) { chrome.kill(); server.close(); throw new Error("Chrome に接続できません"); }
  console.log("chrome ", ver["Browser"]);

  // 撮り直しは1本だけということもあるので、あるぶんは読んで引き継ぐ
  const MANIFEST = path.join(OUT, "index.json");
  const manifest = fs.existsSync(MANIFEST)
    ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};

  const done = [], failed = [];
  for (const f of files) {
    const label = f.replace(/\.js$/, "");
    // 皿に落として積むサンプルだけ物理を使う。1皿を据えて撮るものは使わない
    const needsPhysics = fs.readFileSync(path.join(SAMPLES, f), "utf8").includes("HavokPhysics()");
    process.stdout.write("  " + label.padEnd(14, "　") + " ");
    const t0 = Date.now();
    let page = null;
    try {
      const t = await getJson("/json/new?" + encodeURIComponent("about:blank"), "PUT");
      page = await connect(t.webSocketDebuggerUrl);
      await page.send("Page.enable");
      await page.send("Runtime.enable");
      await page.send("Emulation.setDeviceMetricsOverride", {
        width: W, height: H, deviceScaleFactor: SCALE, mobile: false
      });
      await page.send("Page.navigate", {
        url: "http://127.0.0.1:" + PORT + "/thumb.html?f=" + encodeURIComponent(f)
      });

      // createScene() が終わるまで待つ
      let state = "loading";
      const until = Date.now() + BUILD_TIMEOUT;
      while (Date.now() < until) {
        await sleep(700);
        const r = await page.send("Runtime.evaluate", {
          expression: "window.__state", returnByValue: true
        });
        state = r.result.value || "loading";
        if (state !== "loading") break;
      }
      if (state === "built") {
        // 【対策】物理が死んでいても絵は出る。ただしサンプルは
        //         「一列に並べる」フォールバックに落ちるので、
        //         皿を突き抜けた嘘の絵になる。撮る前に必ず確かめる
        const phys = (await page.send("Runtime.evaluate", {
          expression: "!!(window.__scene && window.__scene.getPhysicsEngine())",
          returnByValue: true
        })).result.value;
        if (needsPhysics && !phys) {
          throw new Error("物理エンジンが動いていません（Havok の wasm を配れていない可能性）");
        }
      }
      if (state !== "built") {
        // 何が読めていないのかが分からないと直しようがないので、状況を添える
        const diag = (await page.send("Runtime.evaluate", {
          expression: "['BABYLON:'+typeof BABYLON, 'GUI:'+(typeof BABYLON!=='undefined'&&typeof BABYLON.GUI)," +
            "'Havok:'+typeof HavokPhysics, 'createScene:'+typeof createScene, document.readyState," +
            "'state:'+window.__state, 'engine:'+typeof window.engine, 'fast:'+typeof window.__fast," +
            "'err:'+(window.__err||'-')].join(' / ')",
          returnByValue: true
        })).result.value;
        throw new Error((state === "loading" ? "組み立てが終わりません" : state) + "  [" + diag + "]");
      }
      const tBuilt = Date.now();

      // 盛り付けが終わる（増えも動きもしなくなる）まで待つ。
      // 待っているあいだは粗く描いて、物理を実時間で進める
      await page.send("Runtime.evaluate", { expression: "window.__fast(true)", returnByValue: true });
      let lastCount = -1, same = 0, still = 0, lastFrames = 0, fps = 0;
      let motion = 999, dbg = "";
      const settleUntil = Date.now() + SETTLE_TIMEOUT;
      while (Date.now() < settleUntil) {
        await sleep(POLL_EVERY);
        const r = await page.send("Runtime.evaluate", {
          expression: "window.__sig() + '|' + window.__frames", returnByValue: true
        });
        const [sig, fr] = String(r.result.value || "0:99:0/0|0").split("|");
        const part = sig.split(":");
        const cnt = +part[0];
        motion = +part[1];
        dbg = part[2] || "";
        const drawn = (+fr) - lastFrames; lastFrames = +fr;
        fps = drawn / (POLL_EVERY / 1000);
        // 【対策】絵が止まっているだけの「見せかけの安定」を弾く。
        //         描けていないなら、物理も進んでいない
        const alive = drawn > 2;
        same = (cnt === lastCount && alive) ? same + 1 : 0;
        still = (motion < SETTLE_MOVE && alive) ? still + 1 : 0;
        lastCount = cnt;
        // 投入が終わり（個数が動かない）、かつ誰も動いていない状態が続いたら完了
        if (same >= STABLE_POLLS && still >= STILL_POLLS) break;
        if (same >= GIVEUP_POLLS) break;   // 止まりきらないものは、そこで撮る
      }
      if (process.env.SHOOT_DEBUG) {
        console.log("\n    組立 " + Math.round((tBuilt - t0) / 1000) + "s" +
          "  整定 " + Math.round((Date.now() - tBuilt) / 1000) + "s" +
          "  fps≈" + fps.toFixed(1) + "  最大移動=" + motion.toFixed(4) + "cm" +
          "  剛体/速度=" + dbg);
      }

      // 撮る用に解像度を戻し、GUI を隠して、描き直しを待つ
      await page.send("Runtime.evaluate", { expression: "window.__hideGui()", returnByValue: true });
      await page.send("Runtime.evaluate", { expression: "window.__fast(false)", returnByValue: true });
      await waitFrames(page, 4, 60000);

      // 見えているものに寄せて切り出す
      const fr = (await page.send("Runtime.evaluate", {
        expression: "JSON.stringify(window.__frame())", returnByValue: true
      })).result.value;
      const info = fr ? JSON.parse(fr) : null;
      const clip = cropOf(info);
      if (process.env.SHOOT_DUMP) {
        const dmp = (await page.send("Runtime.evaluate", {
          expression: "window.__dump()", returnByValue: true
        })).result.value;
        console.log("\n" + dmp);
      }
      if (process.env.SHOOT_DEBUG && info) {
        console.log("    画面 " + Math.round(info.W) + "x" + Math.round(info.H) +
          "  中身(" + info.how + ") " + Math.round(info.w) + "x" + Math.round(info.h) +
          " @ " + Math.round(info.x) + "," + Math.round(info.y) +
          "  切り出し " + (clip ? clip.width + "x" + clip.height + " @ " + clip.x + "," + clip.y : "なし"));
      }

      const shot = await page.send("Page.captureScreenshot", Object.assign({
        format: "jpeg", quality: QUALITY, captureBeyondViewport: false
      }, clip ? { clip } : {}));
      const file = path.join(OUT, label + ".jpg");
      fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
      const kb = Math.round(fs.statSync(file).size / 1024);
      manifest[f] = {
        img: label + ".jpg",
        bg: (info && info.bg) || "#eeeeee",
        w: Math.round((clip ? clip.width : W) * SCALE),
        h: Math.round((clip ? clip.height : H) * SCALE)
      };
      console.log("OK  " + kb + "KB  " + Math.round((Date.now() - t0) / 1000) + "s");
      done.push(label);
      await page.send("Page.close").catch(() => {});
    } catch (e) {
      console.log("NG  " + e.message);
      failed.push(label + "（" + e.message + "）");
    } finally {
      if (page) page.close();
    }
  }

  // ファイル名順に並べ直して書く（差分が読みやすくなる）
  const sorted = {};
  Object.keys(manifest).sort().forEach((k) => { sorted[k] = manifest[k]; });
  fs.writeFileSync(MANIFEST, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  // 図鑑から読む用。file:// でも動くように JSON ではなく <script> の形で置く
  fs.writeFileSync(
    path.join(OUT, "thumbs.js"),
    "/* tools/shoot.js が書き出したもの。手で直さないこと */\n" +
    "window.__THUMBS = " + JSON.stringify(sorted, null, 2) + ";\n",
    "utf8"
  );

  chrome.kill();
  server.close();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* noop */ }
  console.log("\n撮れた: " + done.length + " / " + files.length);
  if (failed.length) { console.log("失敗:"); failed.forEach((x) => console.log("  " + x)); }
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
