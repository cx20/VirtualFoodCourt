/* =====================================================================
 *  たべもののつくりかた — ページ生成スクリプト
 *
 *  実行:  node tools/build.js   （リポジトリのどこからでも可）
 *
 *  生成するもの:
 *    ・index.html / start.html / ch01〜ch17.html /
 *      zukan.html / view.html / terms.html / play.html   … 全23ページ
 *    ・assets/src/*.src.js  … 13本のサンプルをビューア用に複製
 *                             （.gitignore 済み。再生成はこれで行う）
 *
 *  【注意】上記のファイルは毎回まるごと上書きされます。
 *          HTML を直接手で編集しても、次にこれを走らせると消えます。
 *          文章を直すときは tools/pages-1.js / tools/pages-2.js を、
 *          目次や図鑑の枠組みを直すときはこのファイルを直してください。
 *
 *  入力:
 *    ・tools/pages-1.js  … 第I部（00〜11章）の本文
 *    ・tools/pages-2.js  … 第II部（12〜17章）の本文
 *    ・samples/*.js（13本） … ビューア用の複製元
 *
 *  手書きで管理しているもの（このスクリプトは触りません）:
 *    ・assets/site.css / assets/labs.js / assets/play.js
 *
 *  なぜ assets/src が要るか:
 *    view.html と play.html は、まず fetch でリポジトリ直下の .js を読みます。
 *    ところが file:// でそのまま開くと fetch は必ず失敗します。
 *    そのときの控えとして、同じ中身を JS の文字列として持つ複製を用意します。
 * ===================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SAMPLES = path.join(ROOT, "samples");
const SITE = "たべもののつくりかた";
const TAGLINE = "Babylon.js による、料理の手続き的モデリングの学習ノート";

const chapters = [].concat(require("./pages-1.js"), require("./pages-2.js"));

/* ---------------------------------------------------------------
   ナビゲーション
   章ページ + 資料ページ。すべてのページの上部に同じものが出る。
   --------------------------------------------------------------- */
const REF_PAGES = [
  { file: "zukan.html", nav: "図鑑" },
  { file: "view.html", nav: "ソース" },
  { file: "terms.html", nav: "用語" }
];

const NAV = [{ file: "index.html", nav: "目次" }]
  .concat(chapters.map((p) => ({ file: p.file, nav: p.nav })))
  .concat(REF_PAGES);

function nav(current) {
  return NAV.map((n) => {
    const cur = n.file === current ? ' aria-current="page"' : "";
    return '      <a href="' + n.file + '"' + cur + ">" + n.nav + "</a>";
  }).join("\n");
}

/* ---------------------------------------------------------------
   ページの外枠
   --------------------------------------------------------------- */
function shell(o) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${o.title}</title>
<meta name="description" content="${o.desc}">
<link rel="stylesheet" href="assets/site.css">
${o.head || ""}<script src="assets/labs.js" defer></script>
</head>
<body>
<header class="topbar">
  <div class="topbar-in">
    <a class="brand" href="index.html">${SITE}<span class="dot">.</span></a>
    <nav class="navlinks" aria-label="章">
${nav(o.current)}
    </nav>
  </div>
</header>

${o.main}

<footer>
  <div class="wrap">
    <div><b>${SITE}</b> — ${TAGLINE}</div>
    <div><a href="index.html">目次へ戻る</a></div>
  </div>
</footer>
</body>
</html>
`;
}

/* ---------------------------------------------------------------
   章ページの部品
   --------------------------------------------------------------- */
function recapBox(items) {
  if (!items || !items.length) return "";
  return (
    '    <div class="recap">\n' +
    '      <span class="label">この章の3行まとめ</span>\n' +
    "      <ul>\n" +
    items.map((s) => "        <li>" + s + "</li>").join("\n") +
    "\n      </ul>\n    </div>\n"
  );
}

function tryBox(items) {
  if (!items || !items.length) return "";
  return (
    '\n    <div class="try">\n' +
    '      <span class="label">やってみよう</span>\n' +
    "      <ol>\n" +
    items.map((s) => "        <li>" + s + "</li>").join("\n") +
    "\n      </ol>\n    </div>\n"
  );
}

/* 前後の章。無い側は破線の空箱にして、左右の幅を保つ */
function pager(i) {
  const prev = i > 0 ? chapters[i - 1] : null;
  const next = i < chapters.length - 1 ? chapters[i + 1] : REF_PAGES[0];
  const nextTitle = next === REF_PAGES[0] ? "図鑑 どのファイルで、何が学べるか" : next.no + " " + next.title;
  const left = prev
    ? '    <a class="prev" href="' + prev.file + '"><span class="dir">← まえの章</span>' +
      '<span class="ttl">' + prev.no + " " + prev.title + "</span></a>"
    : '    <span class="prev none"></span>';
  return (
    '  <div class="pager">\n' + left + "\n" +
    '    <a class="next" href="' + next.file + '"><span class="dir">つぎの章 →</span>' +
    '<span class="ttl">' + nextTitle + "</span></a>\n" +
    "  </div>"
  );
}

function chapterPage(p, i) {
  const ch = "var(--p-" + p.color + ")";
  const main = `<main id="top" class="page">
<div class="wrap" style="--ch:${ch}">
  <p class="crumbs"><a href="index.html">目次</a><span class="sep">/</span>${p.crumb}</p>
<section class="chapter" id="${p.file.replace(".html", "")}" style="--ch:${ch}">
  <div class="chapter-head">
    <div class="chnum">${p.no}<small>${p.tag}</small></div>
    <div>
      <h2>${p.title}</h2>
      <p class="sub">${p.sub}</p>
    </div>
  </div>
  <div class="body">
${recapBox(p.recap)}${p.html}
${tryBox(p.tryIt)}
  </div>
</section>
${pager(i)}
</div>
</main>`;
  return shell({
    title: p.title + " — " + SITE,
    desc: p.title,
    current: p.file,
    main: main
  });
}

/* ---------------------------------------------------------------
   トップページ
   --------------------------------------------------------------- */
function hubCard(p) {
  return `      <a class="hubcard" href="${p.file}" style="--ch:var(--p-${p.color})">
        <span class="no">${p.no}<span style="opacity:.55;margin-left:8px">${p.tag}</span></span>
        <h3>${p.title}</h3>
        <p>${p.lede}</p>
      </a>`;
}

/* トップの各カードに出す1行。章の見出しだけでは中身が分からないので別に持つ */
const LEDE = {
  "start.html": "インストールなし。ブラウザだけで13本を動かす手順。まずここから。",
  "ch01.html": "モデルファイルも写真も読み込まず、実行した瞬間に座標と模様を計算で作る。",
  "ch02.html": "Math.random() を使わない理由。種を渡すと毎回同じ結果になる乱数を自分で書く。",
  "ch03.html": "となり合う値がなめらかにつながる乱数。重ねると焼きムラや生地の肌理になる。",
  "ch04.html": "断面を1枚描いて軸のまわりに回す。回らないものは外形×縦断面で作る。",
  "ch05.html": "3Dモデルの正体は座標の配列と三角形の番号表。裏返ると立体が消える理由。",
  "ch06.html": "UVで立体と画像を対応させ、模様を1ピクセルずつ計算で描く。色・光り方・凹凸の3枚。",
  "ch07.html": "「照っている」「ぬれている」を数値で書く。粗さ・クリアコート・透け。",
  "ch08.html": "皿への盛り付けは手で置かない。重力と摩擦だけ与えて物理エンジンに任せる。",
  "ch09.html": "青のりもかつお節も、テクスチャに描くと消える。実体のかけらとして撒く。",
  "ch10.html": "ウィンナーも秋刀魚も曲がっている。先に軸を決め、断面を軸に垂直に置いていく。",
  "ch11.html": "同じ料理でも光で別物になる。IBL・影・露出・トーンマッピング。",
  "ch12.html": "焼き色は最後に塗る飾りではない。形と結びついていないと「汚れ」に見える。",
  "ch13.html": "たれを茶色く塗ると光沢のない卵になる。色は厚みから解くもの。",
  "ch14.html": "透けを切ると、白玉は石膏に、赤身は消しゴムになる。厚みを持たせる。",
  "ch15.html": "茶碗一杯は約1400粒。説得力を決めるのは粒間の暗がりで、SSAOでは出ない。",
  "ch16.html": "団子は真球では積めない。潰した体積の行き先と、接触の縁の土手。",
  "ch17.html": "トーストとエッグトーストは同じプログラム。色を変えただけでは別物にならない。"
};

function indexPage() {
  const part1 = chapters.filter((p) => Number(p.no) <= 11);
  const part2 = chapters.filter((p) => Number(p.no) >= 12);
  const cards = (list) =>
    list.map((p) => hubCard(Object.assign({}, p, { lede: LEDE[p.file] || p.sub }))).join("\n");

  const main = `<main id="top" class="page">
<section class="hero">
  <div class="hero-grid">
    <div>
      <p class="eyebrow">Babylon.js / procedural food</p>
      <h1>3Dの料理は、<br><span class="accent">数式から焼ける</span>。</h1>
      <p class="lede">
        このサイトで扱う13本のプログラムは、3Dモデルも写真も1枚も読み込みません。
        点の座標を計算で並べ、焼き色をその場で描き、たれの濃さを厚みから解く。
        絵を描く技術ではなく、形と質感を組み立てる技術です。
        中学・高校の数学で追えるところから順に見ていきます。
      </p>
      <div class="hero-cta">
        <a class="btn" href="start.html">まず動かしてみる</a>
        <a class="btn ghost" href="ch01.html">01章から読む</a>
        <button class="btn ghost" id="heroReplay" type="button">もう一度焼く</button>
      </div>
    </div>
    <div class="stage">
      <canvas id="heroCanvas" width="640" height="480" aria-label="たこ焼きが点から立体へ組み上がり、焼き色がついていく様子"></canvas>
      <div class="stage-caption">
        <b id="heroStage">準備中</b>
        <span id="heroCount">0 頂点</span>
      </div>
    </div>
  </div>
</section>

<div class="wrap">

<section class="chapter" id="howto" style="--ch:var(--p-kitsune);border-top:0;padding-top:34px">
  <div class="chapter-head">
    <div class="chnum" style="font-size:15px">読み方<small style="opacity:.7">HOW TO</small></div>
    <div>
      <h2>このサイトの使い方</h2>
      <p class="sub">上から順でも、気になる章からでも</p>
    </div>
  </div>
  <div class="body">
    <p>
      各章には<b>その場で動かせる実験</b>がついています。スライダーを動かすと、
      文章で説明していることが目の前で起きます。読むより先に、まず動かしてください。
      むずかしい言葉は<a href="terms.html">用語集</a>にまとめてあります。
    </p>
    <ul class="roadmap">
      <li><span class="rn">A</span><span class="rt"><b>とにかく動かしたい人</b><span><a href="zukan.html">図鑑</a>の写真を押す → その料理がこのサイトの中で動きます</span></span></li>
      <li><span class="rn">B</span><span class="rt"><b>順番に理解したい人</b><span>01 → 02 → 03 …… と上から。04章（かたち）と05章（面と法線）がこの教材の背骨です。</span></span></li>
      <li><span class="rn">C</span><span class="rt"><b>料理として面白い所だけ見たい人</b><span>第II部（<a href="ch12.html">12</a>〜<a href="ch17.html">17</a>）へ。焼き色・たれ・透け・粒・潰れ。野菜には出てこない5つです。</span></span></li>
      <li><span class="rn">D</span><span class="rt"><b>コードを読みたい人</b><span><a href="view.html">ソース</a>でファイルを選ぶ → 対応する章に戻る</span></span></li>
    </ul>
    <div class="note">
      <b>必要な数学。</b>
      sin・cos（三角関数）、座標、比例、指数関数（<code>exp</code>）、
      それに少しだけベクトル（内積・外積）。
      高校1年までの内容でだいたい追えます。出てきたところで、そのつど説明します。
    </div>
    <div class="note">
      <b>姉妹編があります。</b>
      同じ作りで野菜と果物23本を扱った<b>「やさいのつくりかた」</b>（VirtualVegetablePlant）。
      第I部の11章はほとんど共通の内容なので、どちらから読んでもかまいません。
      料理でしか出てこない話は第II部にまとめてあります。
    </div>
  </div>
</section>

<section class="chapter" id="chapters" style="--ch:var(--p-koge)">
  <div class="chapter-head">
    <div class="chnum" style="font-size:15px">第I部<small style="opacity:.7">PART I</small></div>
    <div>
      <h2>1皿をつくる（00〜11）</h2>
      <p class="sub">1本の .js ファイルを、上から順にほどいていく構成</p>
    </div>
  </div>
  <div class="body" style="max-width:none">
    <div class="hub">
${cards(part1)}
    </div>
  </div>
</section>

<section class="chapter" id="chapters2" style="--ch:var(--p-sauce)">
  <div class="chapter-head">
    <div class="chnum" style="font-size:15px">第II部<small style="opacity:.7">PART II</small></div>
    <div>
      <h2>火が通ったものをつくる（12〜17）</h2>
      <p class="sub">野菜では出てこなかった、料理だけの6つの難所</p>
    </div>
  </div>
  <div class="body">
    <p>
      第I部の11章は、ファイルの構成（CONFIG → Rng → Noise → Mesh utils → Fields → TextureLab → 本体 …）に
      そのまま対応していました。並びは野菜編ともほとんど同じです。
      違いが出るのはここからで、料理には<b>火が通っていて、たれが掛かっていて、
      柔らかくて、粒が集まっていて、切ってある</b>。
      第II部は、層ではなく「料理だから必要になったこと」で立てた6章です。
    </p>
  </div>
  <div class="body" style="max-width:none">
    <div class="hub">
${cards(part2)}
    </div>
  </div>
</section>

<section class="chapter" id="refs" style="--ch:var(--p-karaage)">
  <div class="chapter-head">
    <div class="chnum" style="font-size:15px">資料<small style="opacity:.7">REFERENCE</small></div>
    <div>
      <h2>13本を引く</h2>
      <p class="sub">ファイルから逆に読みたいとき</p>
    </div>
  </div>
  <div class="body" style="max-width:none">
    <div class="hub">
      <a class="hubcard" href="zukan.html" style="--ch:var(--p-koge)">
        <span class="no">13<span style="opacity:.55;margin-left:8px">FILES</span></span>
        <h3>どのファイルで、何が学べるか</h3>
        <p>13本それぞれの「そこでしか出てこない技術」の一覧。カードから、その場で動かせます。</p>
      </a>
      <a class="hubcard" href="view.html" style="--ch:var(--p-karaage)">
        <span class="no">SRC<span style="opacity:.55;margin-left:8px">SOURCE</span></span>
        <h3>サンプルのソースを読む</h3>
        <p>13本の .js をその場で表示。コピーすれば、そのまま Playground に貼れます。</p>
      </a>
      <a class="hubcard" href="terms.html" style="--ch:var(--p-choco)">
        <span class="no">用語<span style="opacity:.55;margin-left:8px">GLOSSARY</span></span>
        <h3>コードに出てくる言葉</h3>
        <p>法線、UV、巻き順、ORM、メイラード……最初の1周で引っかかる言葉だけ。検索できます。</p>
      </a>
    </div>
  </div>
</section>

</div>
</main>`;

  return shell({
    title: SITE + " — コードで料理をつくる技術ノート",
    desc: "Babylon.js で料理を手続き的に生成する13本のサンプルを、中学生・高校生向けに解説する学習ポータル",
    current: "index.html",
    main: main
  });
}

/* ---------------------------------------------------------------
   図鑑 / ソースビューア / 用語集 / 実行ページ
   --------------------------------------------------------------- */
function zukanPage() {
  const main = `<main id="top" class="page">
<div class="wrap" style="--ch:var(--p-koge)">
  <p class="crumbs"><a href="index.html">目次</a><span class="sep">/</span>図鑑</p>
<section class="chapter" id="zukan" style="--ch:var(--p-koge)">
  <div class="chapter-head">
    <div class="chnum">13<small>FILES</small></div>
    <div>
      <h2>どのファイルで、何が学べるか</h2>
      <p class="sub">13本それぞれに、そこでしか出てこない技術がある</p>
    </div>
  </div>
  <div class="body" style="max-width:none">
    <p style="max-width:70ch">
      写真は<b>実際に動かした結果</b>です。1枚も画像を読み込まず、
      すべてその場で計算して描かれています。
      <b>写真を押すと、そのサンプルがこのサイトの中で動きます</b>
      （形も模様もその場で作るので、出てくるまで数秒〜十数秒かかります）。
      左の色帯は、そのファイルのコードに実際に書かれている色。
      同じ枠組みなのに、担当する「難所」が1本ずつ違います。
    </p>
  </div>
  <div class="catalog" id="catalog"></div>
</section>
  <div class="pager">
    <a class="prev" href="ch17.html"><span class="dir">← まえの章</span><span class="ttl">17 「似ているのに別物」を作り分ける</span></a>
    <a class="next" href="view.html"><span class="dir">つぎへ →</span><span class="ttl">SRC サンプルのソースを読む</span></a>
  </div>
</div>
</main>`;
  return shell({
    title: "どのファイルで、何が学べるか — " + SITE,
    desc: "13本の一覧と、それぞれの難所",
    current: "zukan.html",
    // tools/shoot.js が書き出したサムネイル一覧。無ければカードだけ出る
    head: '<script src="assets/thumbs/thumbs.js" defer></script>\n',
    main: main
  });
}

function viewPage() {
  const main = `<main id="top" class="page">
<div class="wrap" style="--ch:var(--p-karaage)">
  <p class="crumbs"><a href="index.html">目次</a><span class="sep">/</span>ソースを読む</p>
<section class="chapter" id="view" style="--ch:var(--p-karaage)">
  <div class="chapter-head">
    <div class="chnum" style="font-size:13px">src<small style="opacity:.7">SOURCE</small></div>
    <div>
      <h2>サンプルのソースを読む</h2>
      <p class="sub">13本の .js を、そのまま表示します</p>
    </div>
  </div>
  <div class="body" style="max-width:none">
    <p style="max-width:70ch">
      読みたいファイルを選んでください。行番号つきで全文が出ます。
      <b>「コードをコピー」</b>を押せばファイルまるごとがクリップボードに入るので、
      そのまま <a href="https://playground.babylonjs.com/" target="_blank" rel="noopener">Babylon.js Playground</a>
      に貼れば動きます（→ <a href="start.html">00 まず動かしてみる</a>）。
      行番号はコピーに含まれません。
    </p>

    <div class="filechips" id="viewChips"></div>

    <div class="viewer">
      <div class="viewer-bar">
        <b id="viewTitle">—</b>
        <span class="d" id="viewDesc"></span>
        <span class="meta" id="viewMeta"></span>
        <button class="chip" type="button" id="viewCopy">コードをコピー</button>
        <a id="viewPlay" href="play.html">▶ 動かす</a>
        <a id="viewRaw" href="#" target="_blank" rel="noopener">別のタブで開く ↗</a>
      </div>
      <div class="codewrap" id="viewWrap">
        <pre class="gutter" id="viewGutter" aria-hidden="true"></pre>
        <pre class="code"><code id="viewCode"></code></pre>
      </div>
    </div>

    <div class="body" style="margin-top:34px">
      <h3>どこを読めばいいか</h3>
      <p>
        どのファイルも、先頭に「構成」というコメントがあります。
        並びはだいたい共通なので、番号とこのサイトの章を対応させておきます。
      </p>
      <table>
        <tr><th>ファイル内の番号</th><th>中身</th><th>対応する章</th></tr>
        <tr><td>0. CONFIG</td><td>種類プリセット。焼き加減や寸法の数値</td><td><a href="ch01.html">01 手続き生成</a> / <a href="ch17.html">17 差分</a></td></tr>
        <tr><td>1. Rng</td><td>シード付き擬似乱数</td><td><a href="ch02.html">02 乱数</a></td></tr>
        <tr><td>2. Noise</td><td>値ノイズ / 周期ノイズ / fBm / セルノイズ</td><td><a href="ch03.html">03 ノイズ</a></td></tr>
        <tr><td>3. Mesh utils</td><td>巻き順の判定・法線の溶接・掃引</td><td><a href="ch05.html">05 面と法線</a> / <a href="ch10.html">10 曲がり</a></td></tr>
        <tr><td>4. Fields / Section / Shape</td><td>断面のテーブル、外形、焼き色の場、垂れの輪郭</td><td><a href="ch04.html">04 かたち</a> / <a href="ch12.html">12 焼き色</a></td></tr>
        <tr><td>5. TextureLab</td><td>アルベド・ORM・法線・厚みの生成</td><td><a href="ch06.html">06 テクスチャ</a> / <a href="ch13.html">13 たれ</a> / <a href="ch14.html">14 透け</a></td></tr>
        <tr><td>6〜7. 本体 / トッピング</td><td>その料理そのものの組み立てと、上に乗るもの</td><td><a href="ch09.html">09 部品</a> / <a href="ch15.html">15 粒</a></td></tr>
        <tr><td>7〜8. 皿 / 板 / トレイ</td><td>器と、その上への配置</td><td><a href="ch08.html">08 物理</a> / <a href="ch16.html">16 潰れ</a></td></tr>
        <tr><td>8〜9. Scene</td><td>光・影・露出・被写界深度</td><td><a href="ch11.html">11 光</a></td></tr>
        <tr><td>9〜10. GUI</td><td>右下のスライダー</td><td>—</td></tr>
      </table>
      <div class="note">
        <b>コメントの【対策】を探してみてください。</b>
        これは「一度失敗して直した記録」です。なぜその数値なのか、なぜその順番なのかが、
        たいていそこに書いてあります。このサイトの各章にある「つまずきポイント」は、
        ほとんどがここから拾ってきたものです。
        焼き魚（サンマ）.js のように、修正の履歴が10項目そのまま残っているファイルもあります。
      </div>
    </div>
  </div>
</section>
  <div class="pager">
    <a class="prev" href="zukan.html"><span class="dir">← まえへ</span><span class="ttl">13 どのファイルで、何が学べるか</span></a>
    <a class="next" href="terms.html"><span class="dir">つぎへ →</span><span class="ttl">用語 コードに出てくる言葉</span></a>
  </div>
</div>
</main>`;
  return shell({ title: "サンプルのソースを読む — " + SITE, desc: "13本の .js を行番号つきで表示します", current: "view.html", main: main });
}

/* 用語。左が語、右が意味。labs.js が絞り込みを付ける */
const TERMS = [
  ["メッシュ", "頂点と三角形でできた立体そのもの。"],
  ["頂点 / positions", "点の座標。x,y,z の3つずつ一列に並べる。"],
  ["indices", "どの点とどの点で三角形を作るかの番号表。"],
  ["法線 / normal", "面がどちらを向いているかの矢印。明るさを決める（<a href=\"ch05.html\">05章</a>）。"],
  ["巻き順", "三角形の頂点を並べる向き。表裏を決める。裏返ると立体が消える。"],
  ["溶接 / weld", "同じ場所にある頂点の法線を平均して揃えること。つなぎ目の線が消える。"],
  ["UV", "立体の表面と画像の座標の対応。u=横、v=縦（<a href=\"ch06.html\">06章</a>）。"],
  ["掃引 / sweep", "断面を軸に沿って並べてつなぎ、立体にすること（<a href=\"ch10.html\">10章</a>）。"],
  ["スパイン / 軸", "掃引するときの背骨になる曲線。ウィンナーの曲がりはこれ。"],
  ["プロファイル / 断面", "形の横顔。半径や高さの表（<a href=\"ch04.html\">04章</a>）。"],
  ["回転体", "断面を軸のまわりに1周させて作る立体。団子・茶碗・クッキー。"],
  ["スーパー楕円", "指数 n で丸から四角まで連続に変わる輪郭。チョコの外形に使う。"],
  ["SDF", "その点が形の内か外か、境界からどれだけ離れているかを返す関数。トーストの輪郭。"],
  ["シード", "乱数の出発点になる整数。同じなら同じ結果（<a href=\"ch02.html\">02章</a>）。"],
  ["擬似乱数", "計算で作る、規則があるのに規則が見えない数列。mulberry32 を使っている。"],
  ["ノイズ", "となり合う値がなめらかにつながる乱数。自然な模様のもと（<a href=\"ch03.html\">03章</a>）。"],
  ["fBm / オクターブ", "細かさを半分ずつにしたノイズを重ねる手法。枚数をオクターブという。"],
  ["セルノイズ", "空間を細胞状に区切るノイズ。クッキーの割れ目に使う。"],
  ["アルベド", "影も光沢もない、素の色。"],
  ["ORM", "陰り・粗さ・金属度を R,G,B に詰めた1枚の画像。"],
  ["粗さ / roughness", "表面のざらつき。0 で鏡、1 で完全なつや消し。"],
  ["PBR", "現実の光の法則に沿った質感の表し方（<a href=\"ch07.html\">07章</a>）。"],
  ["クリアコート", "表面にかかった透明な膜。たれ・水の膜・チョコの艶。"],
  ["SSS / subSurface", "光が中に入って散る現象。薄い部分が透ける（<a href=\"ch14.html\">14章</a>）。"],
  ["thickness テクスチャ", "その点の厚みを焼いておいた画像。透け具合を決める。"],
  ["sheen", "布のように、縁がふわっと光る反射。かつお節や大根おろし。"],
  ["iridescence / 虹彩", "薄い膜の干渉で出る虹色。秋刀魚の銀は色素ではなくこれ。"],
  ["法線マップ", "細かい凹凸を、頂点を増やさず法線だけで表す画像。"],
  ["視差 / parallax", "法線マップより一歩進んで、見る角度で凹凸がずれて見える手法。"],
  ["メイラード反応", "焼き色がつく化学反応。熱が届いた所ほど濃い（<a href=\"ch12.html\">12章</a>）。"],
  ["吸収 / extinction", "透明なものを光が通るとき、距離に応じて減る量。たれの色を決める（<a href=\"ch13.html\">13章</a>）。"],
  ["AO / アンビエントオクルージョン", "狭い所や谷が暗くなる効果。"],
  ["SSAO", "画面上で隣り合う面から AO を推定する後処理。細かい谷には効かない。"],
  ["焼き込み / bake", "実行時に計算せず、あらかじめ求めてテクスチャや頂点色に入れておくこと。"],
  ["インスタンス", "同じ形を1個だけ作り、位置・向き・色を配って何百個も描く仕組み（<a href=\"ch09.html\">09章</a>）。"],
  ["頂点カラー", "頂点そのものが持つ色。唐揚げの揚げ色はこれで焼いてある。"],
  ["smin", "なめらかな最小値。角を作らずに2つの形をつなぐ（<a href=\"ch16.html\">16章</a>）。"],
  ["凸包 / convex hull", "でっぱりだけを包んだ袋のような形。物理の当たり判定に使う。"],
  ["Havok", "Babylon.js が使う物理エンジンの名前（<a href=\"ch08.html\">08章</a>）。"],
  ["緩和 / relaxation", "重なりを少しずつ押し離す反復計算。物理を使わない配置に使う。"],
  ["IBL", "まわりの環境そのものを光として当てる方法（<a href=\"ch11.html\">11章</a>）。"],
  ["露出 / exposure", "画面全体の明るさ。カメラの露出と同じ意味。"],
  ["トーンマッピング", "1 を超えた明るさを、切り落とさずになめらかに畳む変換。ACES を使う。"],
  ["被写界深度", "ピントの合う範囲。単位が m で計算されるので cm 系では 1000 を掛ける。"],
  ["Playground", "ブラウザ上で Babylon.js のコードを試せる公式サイト。"]
];

function termsPage() {
  const rows = TERMS.map((t) => "      <tr><td>" + t[0] + "</td><td>" + t[1] + "</td></tr>").join("\n");
  const main = `<main id="top" class="page">
<div class="wrap" style="--ch:var(--p-choco)">
  <p class="crumbs"><a href="index.html">目次</a><span class="sep">/</span>用語集</p>
<section class="chapter" id="terms" style="--ch:var(--p-choco)">
  <div class="chapter-head">
    <div class="chnum">用語<small>GLOSSARY</small></div>
    <div>
      <h2>コードに出てくる言葉</h2>
      <p class="sub">最初の1周で引っかかりやすいものだけ</p>
    </div>
  </div>
  <div class="body">
    <input type="search" class="termsearch" id="termFilter" placeholder="言葉で絞り込む（例：法線、シード、焼き）">
    <table id="termTable">
      <tr><th>語</th><th>意味</th></tr>
${rows}
    </table>
    <div class="note">
      ここに無い言葉は、たいていサンプルのコメントに説明があります。
      <a href="view.html">ソースを読む</a>のページで、その語を含む行を探してみてください。
    </div>
  </div>
</section>
  <div class="pager">
    <a class="prev" href="view.html"><span class="dir">← まえへ</span><span class="ttl">SRC サンプルのソースを読む</span></a>
    <a class="next" href="index.html"><span class="dir">つぎへ →</span><span class="ttl">目次へ戻る</span></a>
  </div>
</div>
</main>`;
  return shell({ title: "コードに出てくる言葉 — " + SITE, desc: "用語集", current: "terms.html", main: main });
}

function playPage() {
  const main = `<main id="top" class="page">
<div class="wrap" style="--ch:var(--p-kitsune)">
  <p class="crumbs"><a href="index.html">目次</a><span class="sep">/</span><a href="zukan.html">図鑑</a><span class="sep">/</span>実行</p>
  <section class="chapter" id="play" style="--ch:var(--p-kitsune);padding-top:26px">
    <div class="chapter-head">
      <div class="chnum" style="font-size:13px">RUN<small style="opacity:.7">PLAY</small></div>
      <div>
        <h2 id="playTitle">—</h2>
        <p class="sub">このページで、サンプルがそのまま動いています</p>
      </div>
    </div>
    <div class="body" style="max-width:none">
      <div class="playbar">
        <span id="playState">準備中…</span>
        <a id="playSrc" href="view.html">ソースを読む →</a>
        <a id="playRaw" href="#" target="_blank" rel="noopener">.js を直接開く ↗</a>
        <a href="zukan.html">図鑑へ戻る</a>
      </div>
      <div class="playstage" id="playStage">
        <canvas id="playCanvas" touch-action="none"></canvas>
      </div>
      <p class="hint" style="margin-top:10px">
        3Dモデルも写真も読み込んでいません。このページを開いた瞬間に、
        座標も焼き色も計算で作られています。1024×1024 のテクスチャを何枚も焼くので、
        出てくるまで十数秒かかることがあります。
        右下のつまみで種類や焼き加減を変えると、その場で作り直されます。
      </p>
    </div>
  </section>
</div>
</main>`;
  return shell({
    title: "サンプルを動かす — " + SITE,
    desc: "選んだサンプルをその場で実行します",
    current: "zukan.html",
    head: '<script src="assets/play.js" defer></script>\n',
    main: main
  });
}

/* ---------------------------------------------------------------
   ビューア用の複製（assets/src/*.src.js）
   file:// で開いたときは fetch が使えないので、
   同じ中身を JS の文字列として持つ控えを作っておく。
   --------------------------------------------------------------- */
function buildSrc() {
  const outDir = path.join(ROOT, "assets", "src");
  fs.mkdirSync(outDir, { recursive: true });

  const samples = fs.readdirSync(SAMPLES)
    .filter((f) => f.endsWith(".js"))
    .sort();

  // 前回の残り（消したサンプルの控え）を掃除する
  fs.readdirSync(outDir).forEach((f) => {
    if (f.endsWith(".src.js") && samples.indexOf(f.replace(/\.src\.js$/, ".js")) < 0) {
      fs.unlinkSync(path.join(outDir, f));
    }
  });

  samples.forEach((f) => {
    const text = fs.readFileSync(path.join(SAMPLES, f), "utf8");
    const body =
      "/* tools/build.js が作った複製。手で直さないこと（元は ../../samples/" + f + "） */\n" +
      "window.__SRC = window.__SRC || {};\n" +
      "window.__SRC[" + JSON.stringify(f) + "] = " + JSON.stringify(text) + ";\n";
    fs.writeFileSync(path.join(outDir, f.replace(/\.js$/, ".src.js")), body);
  });
  return samples;
}

/* ---------------------------------------------------------------
   実行
   --------------------------------------------------------------- */
function write(file, html) {
  fs.writeFileSync(path.join(ROOT, file), html);
  console.log("  " + file);
}

console.log("ページを書き出します:");
write("index.html", indexPage());
chapters.forEach((p, i) => write(p.file, chapterPage(p, i)));
write("zukan.html", zukanPage());
write("view.html", viewPage());
write("terms.html", termsPage());
write("play.html", playPage());

console.log("ビューア用の複製を作ります:");
const samples = buildSrc();
console.log("  assets/src/*.src.js … " + samples.length + " 本");

console.log("\n完了。" + (chapters.length + 5) + " ページ / サンプル " + samples.length + " 本");
