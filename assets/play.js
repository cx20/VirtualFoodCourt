/* =======================================================================
   たべもののつくりかた — サンプルをその場で実行するページ

   図鑑のサムネイルから飛んでくる。やっていることは Playground と同じで、
   Babylon.js 本体・GUI・Havok を読み込み、サンプルの中の createScene() を
   呼んで、返ってきたシーンを描き続けるだけ。

   【注意】サンプルは Playground 用に書かれていて、グローバルの
           canvas と engine があることを前提にしている。だから
           new Function の引数として渡す。末尾の
           「export default createScene;」は素の <script> では
           構文エラーになるので落とす。
   ======================================================================= */
(function () {
"use strict";

var CDN = [
    "https://cdn.babylonjs.com/babylon.js",
    "https://cdn.babylonjs.com/gui/babylon.gui.min.js",
    "https://cdn.babylonjs.com/havok/HavokPhysics_umd.js"
];

var $ = function (s) { return document.querySelector(s); };
var stage = $("#playStage");
if (!stage) return;

var q = /[?&]f=([^&]+)/.exec(location.search);
var file = q ? decodeURIComponent(q[1]) : "トースト.js";

var titleEl = $("#playTitle"), stateEl = $("#playState");
var srcEl = $("#playSrc"), rawEl = $("#playRaw");
if (titleEl) titleEl.textContent = file;
document.title = file + " を動かす — たべもののつくりかた";
if (srcEl) srcEl.href = "view.html?f=" + encodeURIComponent(file);
if (rawEl) rawEl.href = "samples/" + encodeURIComponent(file);

function say(msg, bad) {
    if (!stateEl) return;
    stateEl.textContent = msg;
    stateEl.classList.toggle("bad", !!bad);
}

/* ---- ライブラリを順に読む ---- */
function loadScripts(list, done, fail) {
    var i = 0;
    (function next() {
        if (i >= list.length) { done(); return; }
        var s = document.createElement("script");
        s.src = list[i++];
        s.onload = next;
        s.onerror = function () { fail(s.src); };
        document.head.appendChild(s);
    })();
}

/* ---- サンプルのソースを読む（view.html と同じ手口）---- */
function loadCode(name, done, fail) {
    function fallback() {
        if (window.__SRC && window.__SRC[name]) { done(window.__SRC[name]); return; }
        var s = document.createElement("script");
        s.src = "assets/src/" + encodeURIComponent(name.replace(/\.js$/, ".src.js"));
        s.onload = function () {
            var t = window.__SRC && window.__SRC[name];
            t ? done(t) : fail();
        };
        s.onerror = fail;
        document.head.appendChild(s);
    }
    var settled = false;
    try {
        fetch("samples/" + encodeURIComponent(name)).then(function (r) {
            if (!r.ok) throw new Error(r.status);
            return r.text();
        }).then(function (t) { settled = true; done(t); })
          .catch(function () { if (!settled) fallback(); });
    } catch (e) { fallback(); }
}

/* ---- 実行 ---- */
function run(code) {
    var canvas = $("#playCanvas");
    var engine;
    try {
        engine = new BABYLON.Engine(canvas, true, {
            preserveDrawingBuffer: true, stencil: true, antialias: true
        }, true);
    } catch (e) {
        say("この環境では WebGL が使えないようです（" + e.message + "）", true);
        return;
    }
    // Playground と同じ形にする。末尾の export は素の実行では通らない
    var body = code.replace(/^\s*export\s+default\s+createScene\s*;?\s*$/m, "");
    var make;
    try {
        make = new Function("canvas", "engine", "HavokPhysics",
            body + "\n;return typeof createScene === 'function' ? createScene : null;");
    } catch (e) {
        say("サンプルを読み込めませんでした（" + e.message + "）", true);
        return;
    }
    var factory = make(canvas, engine, window.HavokPhysics);
    if (!factory) { say("createScene が見つかりませんでした", true); return; }

    // テクスチャを何枚も CPU で焼くサンプルがあるので、待ち時間が長い
    say("組み立てています…（テクスチャを焼くので十数秒かかることがあります）");
    Promise.resolve().then(factory).then(function (scene) {
        window.__playScene = scene;   // 動作確認用
        engine.runRenderLoop(function () {
            if (scene.activeCamera) scene.render();
        });
        window.addEventListener("resize", function () { engine.resize(); });
        say("実行中。ドラッグで回す／ホイールで寄る。右下のつまみで作り直せます");
        stage.classList.add("ready");
    }).catch(function (e) {
        say("実行中にエラーが出ました（" + (e && e.message || e) + "）", true);
    });
}

say("ライブラリを読み込んでいます…");
loadScripts(CDN, function () {
    say("ソースを読み込んでいます…");
    loadCode(file, function (code) { run(code); }, function () {
        say(file + " を読み込めませんでした", true);
    });
}, function (src) {
    say("ライブラリを読み込めませんでした（" + src + "）。ネットにつながっているか確認してください", true);
});

})();
