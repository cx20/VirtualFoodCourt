/* =====================================================================
 *  たべもののつくりかた — 第I部（00〜11章）の本文
 *
 *  tools/build.js から読み込まれる。HTML を直接手で直しても
 *  build.js を走らせると消えるので、文章はここを直すこと。
 *
 *  1ページぶんの形:
 *    file   … 出力するファイル名
 *    no     … 章番号（左上の四角に出る）
 *    tag    … その下の小さい英字
 *    nav    … ヘッダのナビに出る短い名前
 *    color  … site.css の顔料名（--p-XXX の XXX）
 *    title  … 見出し
 *    sub    … 見出しの下の1行
 *    recap  … 章のはじめの「3行まとめ」
 *    html   … 本文（<div class="body"> の中身）
 *    tryIt  … 章のおわりの「やってみよう」
 * ===================================================================== */

module.exports = [

/* ==================================================================
   00 まず動かしてみる
   ================================================================== */
{
  file: "start.html", no: "00", tag: "START", nav: "00 はじめ", color: "kitsune",
  title: "まず動かしてみる",
  sub: "読む前に、動かす。5分で終わります",
  crumb: "はじめに",
  recap: [
    "この13本は、<b>ブラウザだけ</b>で動きます。インストールは何も要りません。",
    "Babylon.js Playground という公式サイトに、ファイルの中身を<b>まるごと貼って実行</b>するだけです。",
    "先に動かして、数字をひとつ壊してみる。<b>説明を読むのはそのあと</b>のほうが、ずっと早く分かります。"
  ],
  html: `
    <p>
      このプロジェクトの .js ファイルは、ふつうの Web ページに読み込んで使うものではありません。
      <b>Babylon.js Playground</b>（バビロン・ジェイエス・プレイグラウンド）という、
      ブラウザの中で3Dのプログラムを書いて即座に実行できる公式サイトのための形になっています。
    </p>
    <div class="note">
      <b>いきなり動かしたいだけなら。</b>
      <a href="zukan.html">図鑑</a>の写真を押すと、このサイトの中でそのまま動きます。
      貼り付けの手順を踏むのは、<b>数字を書き換えて遊びたくなってから</b>で十分です。
    </div>

    <ol class="steps">
      <li>
        <h3>Playground を開く</h3>
        <p><a href="https://playground.babylonjs.com/" target="_blank" rel="noopener">playground.babylonjs.com</a>
        をブラウザで開きます。左が入力欄、右が3Dの画面です。
        パソコンのほうがやりやすいですが、スマホでも動きます。</p>
      </li>
      <li>
        <h3>もとから入っているコードを全部消す</h3>
        <p>左側をクリックして、<code>Ctrl</code>+<code>A</code>（Mac は <code>⌘</code>+<code>A</code>）で全選択 → <code>Delete</code>。
        まっさらにしてから貼るのがコツです。混ざると動きません。</p>
      </li>
      <li>
        <h3><b>トースト.js</b> の中身を全部コピーして貼る</h3>
        <p>最初の1本は <b>トースト.js</b> がおすすめです。13本のなかでいちばん構造が素直で、
        「四角い板の上面に、す（気泡）を彫って、焼き色を塗る」だけでできています。
        <a href="view.html?f=%E3%83%88%E3%83%BC%E3%82%B9%E3%83%88.js">ソースを読む</a>のページに
        「コードをコピー」ボタンがあるので、それを押して Playground の左側に貼り付けます。</p>
      </li>
      <li>
        <h3>実行する</h3>
        <p>上の <b>Run</b> ボタン（または <code>Alt</code>+<code>Enter</code>）。
        数秒〜十数秒待つと、皿の上にトーストが出てきます。
        右下にスライダーが出るので、動かしてみてください。</p>
        <div class="trap">
          <span class="label">うまくいかないとき</span>
          <p><b>真っ黒のまま／なかなか出てこない</b> — このプロジェクトは模様を画像として読み込まず、
          実行するたびに <b>1ピクセルずつ計算して描いて</b>います。1024×1024 を何枚も焼くので、
          出るまでに十数秒かかるサンプルがあります（たこ焼きとチョコレートが特に長い）。まず待ってみてください。</p>
          <p><b>エラーが出る</b> — 貼り付けたときに古いコードが残っていないか確認してください。
          物理エンジン（Havok）を使うサンプルは、その読み込みにも数秒かかります。</p>
          <p><b>動きがカクカクする</b> — 3Dの計算をパソコンが全部やっています。
          ブラウザの他のタブを閉じると軽くなります。</p>
        </div>
      </li>
      <li>
        <h3>数字をひとつ、わざと壊す</h3>
        <p>ファイルの上のほうにある <code>PRESETS</code> の中から <code>bake</code>（焼き加減）や
        <code>thickness</code>（厚み）を探して、思いきり大きな値に書き換えて Run。
        <b>どの数字が何に効くかは、壊すといちばん早く分かります。</b>
        壊してしまっても、もう一度コピーして貼り直せば元どおりです。</p>
      </li>
      <li>
        <h3>中身を覗いてみる（Inspector）</h3>
        <p>Playground の右上にある <b>Inspector</b> を開くと、いま動いているシーンの中身が全部見えます。
        左の <b>Scene Explorer</b> がメッシュ・材質・テクスチャの一覧、右がその設定です。
        <b>照準のボタン（Picker）</b>を押してから画面の料理をクリックすると、
        いま押したものがツリーのどれなのかを教えてくれます。</p>
        <p>ここで値を触ると、コードを書き換えなくてもその場で結果が変わります。
        「この茶色はどのテクスチャなのか」「この面はどのメッシュなのか」を確かめるのに、
        いちばん手っ取り早い道具です。</p>
      </li>
      <li>
        <h3>次の1本へ</h3>
        <p>トーストの次は <b>花見団子.js</b>（球を潰して串に刺す）、
        <b>クッキー.js</b>（皿に落として積む）あたりが読みやすい順です。
        <b>たこ焼き.js</b> と <b>ご飯.js</b> は分量が多いので後回しでかまいません。</p>
      </li>
    </ol>

    <h3>13本は、こんな料理です</h3>
    <p>
      主食（ごはん・トースト）、おかず（唐揚げ・焼き魚・ウィンナー）、粉もの（たこ焼き）、
      甘いもの（クッキー・チョコレート・団子）、そして寿司。
      わざと種類を散らしてあります。<b>作り方が全部ちがうから</b>です。
      一覧は<a href="zukan.html">図鑑</a>にあります。
    </p>`,
  tryIt: [
    "トースト.js を Playground で動かし、右下の「焼き加減」を端から端まで動かしてみる。",
    "焼き加減を変えたとき、色以外に何が変わるか（艶・耳の張り）を観察して1行で書く。",
    "図鑑から好きな料理を3つ選んで、このサイトの中で動かしてみる。",
    "13本のファイルの先頭のコメントだけを読み比べて、共通する見出しを探す。"
  ]
},

/* ==================================================================
   01 手続き的生成
   ================================================================== */
{
  file: "ch01.html", no: "01", tag: "CONFIG", nav: "01 生成", color: "koge",
  title: "「作る」と「読み込む」はどう違うのか",
  sub: "procedural generation — 手続き的生成",
  crumb: "第01章",
  recap: [
    "ふつうの3Dは、誰かが作った<b>モデルファイルを読み込んで</b>表示します。",
    "このプロジェクトは逆で、<b>実行した瞬間に座標も模様も計算で作ります</b>。これを手続き的生成といいます。",
    "だから1個ずつ形が違い、焼き加減をあとから変えられ、しかもデータが軽い。"
  ],
  html: `
    <p>
      ゲームや映画に出てくる料理の3Dは、ふつう誰かが専用ソフトで作ったモデルファイルを読み込んで表示します。
      ファイルの中には「頂点1番は(3.2, 1.1, 0.4)」といった座標が何万個も保存されていて、
      表面の模様も写真として一緒に入っています。プログラムはそれを並べて画面に出すだけです。
    </p>
    <p>
      このプロジェクトは逆のことをしています。ファイルも写真も読まず、
      <b>プログラムを実行した瞬間に座標を計算で作り、模様も1ピクセルずつ計算で描く</b>。
      これを手続き的生成（プロシージャル生成）と呼びます。
      食べ物と相性がよく、いいことが3つあります。
    </p>
    <ul>
      <li><b>1個も同じにならない</b> — 数値を少し揺らすだけで、形の違う個体がいくらでも出てきます。
      たこ焼き8個が全部同じ形だと、その瞬間に嘘に見えます。</li>
      <li><b>あとから変えられる</b> — 「もう少し焼く」がスライダー1本で通ります。
      写真を貼る方式なら、焼き加減の数だけ写真を用意することになります。</li>
      <li><b>軽い</b> — 13本ぜんぶ合わせて 1.3MB ほどのテキストだけです。
      モデルファイルも、模様の写真も、1枚もありません。</li>
    </ul>
    <p>
      その代わり、形や色を言葉ではなく<b>数式で説明できないと作れません</b>。
      「たこ焼きってどんな形?」に
      「下半分は型の写しでほぼ正確な半球、上半分は生地を折り込んだ不定形」と
      答えられるかどうかが勝負になります。だからこのプロジェクトのコードは、
      コメントの半分が食べ物の観察記録です。
    </p>

    <h3>ほとんどのファイルが、同じ9層でできている</h3>
    <p>
      トーストもクッキーも秋刀魚も、ファイルの構造はほとんど同じです。上から順に読めば、
      どの料理でも同じ場所に同じ役割のコードがあります。
      このサイトの第I部（01〜11章）は、この層に対応させてあります。
    </p>
    <figure>
<pre><span class="c">// 構成:
//    0. CONFIG      … プリセット（定番 / 全部のせ / 焦がし / 塩）と舟皿
//    1. Rng         … シード付き擬似乱数
//    2. Noise       … 3D値ノイズ / 2D周期ノイズ
//    3. Mesh utils  … 巻き順の自動判定・法線の溶接・掃引
//    4. Fields      … 球面方向の場 / 焼き色 / ソースの垂れの輪郭
//    5. TextureLab  … 生地・ソース・木のアルベド / ORM / 法線
//    6. Pattern     … 形状 + テクスチャ（4種のアトラス）
//    7. Takoyaki    … 生地玉 + ソース + 青のり + マヨ + かつお節
//    8. Tray        … 経木の舟皿 + 板の間 / 配置の緩和
//    9. Scene / GUI</span></pre>
      <figcaption>たこ焼き.js の冒頭。料理名のところが入れ替わるだけで、13本ともこの並び</figcaption>
    </figure>
    <p>
      層の順番には理由があります。<b>下の層は上の層を知らなくても動く</b>ように積んであるからです。
      乱数（1）はノイズ（2）を知らないし、ノイズは形（4）を知らない。
      だから途中の1層だけ差し替えれば、別の料理になります。
      それを実際にやったのが<a href="ch17.html">17章</a>です。
    </p>

    <div class="trap">
      <span class="label">野菜のときと変わったところ</span>
      <p>この教材には姉妹編（<b>やさいのつくりかた</b>）があり、そちらでは
      <b>4. Profile</b>（横顔の折れ線）が形の中心にありました。
      料理では、そこが <b>4. Fields</b> や <b>4. Section</b> という名前に変わっているファイルが多い。
      野菜は「軸のまわりに回せば作れる」ものが多いのに対し、
      料理は<b>切ってあったり、潰してあったり、垂れていたり</b>して、
      回転体ではないものが増えるためです。</p>
    </div>

    <h3>「焼く」という工程が、そのままコードにある</h3>
    <p>
      野菜と料理のいちばん大きな違いはここです。料理には<b>火が通っている</b>。
      その結果として、表面の色が場所ごとに違い、水分が飛び、艶が出て、形が変わる。
      13本のうち9本は、焼いたり揚げたりしたものです。その9本には例外なく
      <code>bake</code>（焼き加減）・<code>heat</code>（熱の回り）・<code>char</code>（焦げ）
      という名前の変数があります。
      焼き色は最後に上から塗る飾りではなく、<b>形と一緒に決まるもの</b>です。
      それを扱うのが<a href="ch12.html">12章</a>です。
    </p>
    <div class="note">
      <b>読む順番のおすすめ。</b>
      最初の1本は<b>トースト.js</b>がいちばん素直です（四角い板に、す（気泡）を彫るだけ）。
      次に<b>花見団子.js</b>、慣れたら<b>クッキー.js</b>。
      <b>たこ焼き.js</b>と<b>ご飯.js</b>と<b>焼き魚（サンマ）.js</b>は分量が多いので後回しでかまいません。
    </div>`,
  tryIt: [
    "トースト.js の先頭のコメント（構成 0〜9）を読んで、他のファイルにも同じ並びがあるか確かめる。",
    "手続き的生成のいいところ3つを、自分の言葉で1行ずつ書いてみる。",
    "13本のファイルを検索して、bake / heat / char という語がどのファイルに出てくるか調べ、「焼いた料理」と一致するか確かめる。",
    "身のまわりの食べ物で「数式で説明できそうな形」を3つ探す（例：バウムクーヘン、マカロニ、板チョコ）。"
  ]
},

/* ==================================================================
   02 乱数
   ================================================================== */
{
  file: "ch02.html", no: "02", tag: "Rng", nav: "02 乱数", color: "wiener",
  title: "同じ種からは、同じ料理ができる",
  sub: "seeded pseudo random — シード付き擬似乱数",
  crumb: "第02章",
  recap: [
    "全13本とも <code>Math.random()</code> を使っていません。代わりに<b>自分で乱数を書いて</b>います。",
    "「種（シード）」という整数をひとつ渡すと、<b>何度実行しても同じ並びの数</b>が出てきます。",
    "同じ形が二度と作れないと、直すことも、比べることもできないからです。"
  ],
  html: `
    <p>
      ウィンナーを8本焼くとします。8本とも同じ太さ・同じ曲がり・同じ焼きムラなら、
      それは工場の製品ではなくコピー＆ペーストに見えます。だから乱数で揺らします。
      ここまではふつうです。問題はその次で、<b>ふつうの乱数だと二度と同じ8本が作れません</b>。
    </p>
    <p>
      3本目だけ焼き色が変で直したい。ところが Run するたびに全部変わるので、
      直したのか、たまたま別の個体が出ただけなのか分かりません。
      だからこのプロジェクトは <code>Math.random()</code> を1回も使わず、
      <b>種を渡すと毎回同じ数列を返す乱数</b>を自分で書いています。
    </p>
    <figure>
<pre><span class="c">// 1. Rng : シード付き擬似乱数（mulberry32）</span>
<span class="k">const</span> Rng = (seed) =&gt; {
    <span class="k">let</span> s = seed &gt;&gt;&gt; <span class="n">0</span>;
    <span class="k">return</span> () =&gt; {
        s = (s + <span class="n">0x6D2B79F5</span>) | <span class="n">0</span>;
        <span class="k">let</span> t = Math.imul(s ^ (s &gt;&gt;&gt; <span class="n">15</span>), <span class="n">1</span> | s);
        t = (t + Math.imul(t ^ (t &gt;&gt;&gt; <span class="n">7</span>), <span class="n">61</span> | t)) ^ t;
        <span class="k">return</span> ((t ^ (t &gt;&gt;&gt; <span class="n">14</span>)) &gt;&gt;&gt; <span class="n">0</span>) / <span class="n">4294967296</span>;
    };
};</pre>
      <figcaption>13本すべてに、ほぼこの形で入っている。名前は mulberry32</figcaption>
    </figure>
    <p>
      中身は「かき混ぜて、上の桁と下の桁をぶつけて、また混ぜる」だけです。
      規則はあるのに、出てくる数の並びに規則が見えない。だから<b>擬似</b>乱数といいます。
      大事なのは仕組みより性質のほうで、<b>入れた種が同じなら、出てくる数列も同じ</b>。
      これが「同じ料理をもう一度作れる」ということです。
    </p>

    <div class="lab" id="lab02">
      <p class="lab-title">実験 — 種を変える / 種を固定したまま作り直す</p>
      <div class="lab-cols side">
        <div class="controls">
          <div class="ctrl">
            <label for="seedRange">種（シード）<span class="v" id="seedRangeV">7</span></label>
            <input type="range" id="seedRange" min="1" max="60" step="1" value="7">
          </div>
          <div class="chips" id="seedFn">
            <button class="chip" type="button" data-v="rng" aria-pressed="true">Rng(種)</button>
            <button class="chip" type="button" data-v="rand">Math.random()</button>
          </div>
          <button class="chip" type="button" id="seedRedraw">もう一度、同じ設定で作る</button>
          <div class="readout" id="seedOut">—</div>
        </div>
        <canvas id="seedCanvas" width="640" height="330" aria-label="種を変えるとウィンナー8本の個体差が変わる"></canvas>
      </div>
      <p class="hint">
        ウィンナー8本の長さ・太さ・曲がり・焼きムラを、乱数から作っています。
        「もう一度作る」を押したとき、Rng なら同じ8本、Math.random() なら毎回別の8本になります。
      </p>
    </div>

    <h3>種は、1個ではなく何個も要る</h3>
    <p>
      実際のコードでは、種をひとつだけ持つのではなく<b>用途ごとに分けて</b>います。
      たこ焼き.js なら、生地の形の乱数・焼きムラの乱数・ソースの垂れの乱数が別々の種から出ます。
      分けておかないと、「ソースの量を変えたら生地の形まで変わってしまった」ということが起きるからです。
    </p>
    <figure>
<pre><span class="c">// 個体ごとに種をずらす。同じ列でも i が違えば別の個体になる</span>
<span class="k">const</span> rnd  = Rng(seed + i * <span class="n">1013</span>);      <span class="c">// 形</span>
<span class="k">const</span> rndB = Rng(seed + i * <span class="n">1013</span> + <span class="n">77</span>); <span class="c">// 焼き色</span></pre>
      <figcaption>種に「ずらす数」を足して枝分かれさせる。13本に共通のやり方</figcaption>
    </figure>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>種を足し算だけで作ると、ぶつかることがあります。</b>
      <code>seed + i</code> と <code>seed + j + 1</code> のような作り方をすると、
      別々のはずの個体がたまたま同じ種になり、双子が生まれます。
      掛ける数を大きめの素数（1013 や 9176 など）にしておくのはそのためです。</p>
    </div>

    <h3>正規分布のほうが「らしい」ことがある</h3>
    <p>
      <code>rnd()</code> は 0〜1 のあいだを平らに出します。長さを ±10% 振りたいときはこれでよいのですが、
      「たいていは真ん中くらい、たまに極端」という揺れ方をさせたいときは、
      平らな乱数だと極端なものが多すぎます。そこで <b>ガウス（正規分布）</b>を使います。
      クッキーの反りや、団子の練りむらがこれです。
    </p>
    <figure>
<pre><span class="c">// Box-Muller 法。平らな乱数2つから、釣鐘型の乱数を作る</span>
<span class="k">const</span> gauss = (m, sd) =&gt;
    m + sd * Math.sqrt(<span class="n">-2</span> * Math.log(Math.max(<span class="n">1e-9</span>, rnd())))
          * Math.cos(<span class="n">6.28318</span> * rnd());</pre>
      <figcaption>クッキー.js の反り、月見団子.js の練りむらはこちらを使う</figcaption>
    </figure>`,
  tryIt: [
    "上の実験で種を 7 から 8 に変え、8本すべてが変わることを確かめる。",
    "Math.random() に切り替えて「もう一度作る」を3回押し、毎回変わることを確かめる。",
    "ウィンナー.js を開いて Rng という語を検索し、何か所で新しい乱数を作っているか数える。",
    "「同じ種なら同じ結果」でないと困る場面を、料理以外で3つ考えてみる。"
  ]
},

/* ==================================================================
   03 ノイズ
   ================================================================== */
{
  file: "ch03.html", no: "03", tag: "Noise", nav: "03 ノイズ", color: "cookie",
  title: "焼きムラは、なめらかな乱数でできている",
  sub: "value noise / fBm — 値ノイズと重ね合わせ",
  crumb: "第03章",
  recap: [
    "ふつうの乱数は<b>となりと無関係</b>なので、そのまま模様にすると砂嵐になります。",
    "格子の点にだけ乱数を置いて、あいだをなめらかにつなぐ。これが<b>値ノイズ</b>です。",
    "細かさを半分ずつにして何枚も重ねると（<b>fBm</b>）、焼きムラや生地の肌理になります。"
  ],
  html: `
    <p>
      トーストの焼き色を、1ピクセルごとに <code>rnd()</code> で決めたらどうなるか。
      白と茶色の点が入り乱れた砂嵐になります。実物の焼きムラは、
      <b>濃いところの隣はだいたい濃い</b>。となり合う値がつながっていないといけません。
    </p>
    <p>
      そこで、まず大きな格子を用意し、<b>格子の交点にだけ乱数を置きます</b>。
      あいだの場所は、四隅の値を混ぜて求める。ただの直線で混ぜると格子が四角く見えてしまうので、
      混ぜ具合を <code>t·t·(3−2t)</code> というなめらかな曲線（スムーズステップ）に通します。
      これで、格子の形が見えない、なめらかな乱数の面ができます。
    </p>
    <figure>
<pre><span class="c">// 2. Noise : 2D値ノイズ</span>
<span class="k">const</span> v2 = (x, y, seed) =&gt; {
    <span class="k">const</span> xi = Math.floor(x), yi = Math.floor(y);
    <span class="k">const</span> xf = x - xi,        yf = y - yi;
    <span class="c">// 直線ではなく S 字で混ぜる。格子の目が見えなくなる</span>
    <span class="k">const</span> u = xf * xf * (<span class="n">3</span> - <span class="n">2</span> * xf);
    <span class="k">const</span> v = yf * yf * (<span class="n">3</span> - <span class="n">2</span> * yf);
    <span class="k">const</span> a = h2(xi, yi, seed),     b = h2(xi + <span class="n">1</span>, yi, seed);
    <span class="k">const</span> c = h2(xi, yi + <span class="n">1</span>, seed), d = h2(xi + <span class="n">1</span>, yi + <span class="n">1</span>, seed);
    <span class="k">return</span> mix(mix(a, b, u), mix(c, d, u), v);
};</pre>
      <figcaption>13本すべてに、ほぼこの形で入っている</figcaption>
    </figure>

    <h3>1枚では足りない。だから重ねる</h3>
    <p>
      値ノイズを1枚だけ使うと、雲のようにぼんやりしたムラにしかなりません。
      実物の焼きムラは、<b>大きな濃淡の中に細かい斑があって、その中にもっと細かい粒がある</b>。
      そこで、細かさを2倍にして高さを半分にしたものを何枚も足します。
      これを <b>fBm</b>（fractional Brownian motion／非整数ブラウン運動）と呼びます。
      枚数のことを<b>オクターブ</b>といいます。
    </p>
    <figure>
<pre><span class="k">const</span> fbm = (x, y, seed, oct) =&gt; {
    <span class="k">let</span> s = <span class="n">0</span>, a = <span class="n">0.5</span>, f = <span class="n">1</span>, n = <span class="n">0</span>;
    <span class="k">for</span> (<span class="k">let</span> o = <span class="n">0</span>; o &lt; oct; o++) {
        s += a * v2(x * f, y * f, seed + o * <span class="n">131</span>);
        n += a;
        f *= <span class="n">2</span>;    <span class="c">// 細かさは2倍</span>
        a *= <span class="n">0.5</span>;  <span class="c">// 効き目は半分</span>
    }
    <span class="k">return</span> s / n;
};</pre>
      <figcaption>オクターブを増やすほど細かい粒が乗る。4〜6枚でだいたい足りる</figcaption>
    </figure>

    <div class="lab" id="lab03">
      <p class="lab-title">実験 — オクターブを重ねる</p>
      <div class="lab-cols side">
        <div class="controls">
          <div class="ctrl">
            <label for="noiseScale">大きさ（格子の粗さ）<span class="v" id="noiseScaleV">4.0</span></label>
            <input type="range" id="noiseScale" min="1" max="14" step="0.5" value="4">
          </div>
          <div class="ctrl">
            <label for="noiseOct">オクターブ（重ねる枚数）<span class="v" id="noiseOctV">1</span></label>
            <input type="range" id="noiseOct" min="1" max="6" step="1" value="1">
          </div>
          <div class="ctrl">
            <label for="noiseGain">減り方（次の枚の効き目）<span class="v" id="noiseGainV">0.50</span></label>
            <input type="range" id="noiseGain" min="0.2" max="0.85" step="0.01" value="0.5">
          </div>
          <div class="chips" id="noiseUse">
            <button class="chip" type="button" data-v="raw" aria-pressed="true">生の値</button>
            <button class="chip" type="button" data-v="bake">焼き色にする</button>
            <button class="chip" type="button" data-v="pore">す（気泡）にする</button>
          </div>
        </div>
        <canvas id="noiseCanvas" width="640" height="330" aria-label="ノイズのオクターブを重ねる実験"></canvas>
      </div>
      <p class="hint">
        左が乱数そのもの（となりと無関係）、右が値ノイズ。
        「焼き色にする」を押すと、同じノイズがトーストの焼きムラに化けます。
      </p>
    </div>

    <h3>ぐるっと一周してつながるノイズ</h3>
    <p>
      ウィンナーや秋刀魚のように<b>筒の表面に模様を巻く</b>とき、
      ふつうのノイズを使うと、一周して戻ってきたところで模様が切れて縦の線が入ります。
      そこで、横方向（u）だけ格子の番号を周期で折り返した専用のノイズを使います。
      13本のうち筒状のものには、必ずこの <code>v2u</code> が入っています。
    </p>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>fBm の平均は 0.5 のあたりに集まります。</b>
      オクターブを重ねるほど、極端な値（0 に近い／1 に近い）は出にくくなります。
      「しきい値 0.8 以上を焦げにする」と書いたのに焦げが1点も出ない、というのはこれが原因です。
      焼き魚（サンマ）.js には、しきい値を実際の分布に合わせ直した記録が残っています。</p>
    </div>`,
  tryIt: [
    "オクターブを1から6まで動かし、どこから「焼きムラらしく」見えるか決める。",
    "減り方を 0.85 にすると何が起きるか観察する（細かい粒が消えないので砂っぽくなる）。",
    "「焼き色にする」で、大きさを 1 と 14 にしたときの見え方の違いを言葉にする。",
    "トースト.js の中で fbm を呼んでいる箇所を全部探し、それぞれ何に使っているか書き出す。"
  ]
},

/* ==================================================================
   04 かたち
   ================================================================== */
{
  file: "ch04.html", no: "04", tag: "Shape", nav: "04 かたち", color: "sakura",
  title: "断面を1枚描けば、立体になる",
  sub: "profile / section — 断面と外形",
  crumb: "第04章",
  recap: [
    "団子も茶碗もクッキーも、<b>横顔の折れ線を1本</b>描いて、軸のまわりに回すだけで作れます。",
    "回すのではなく<b>外形と縦断面を掛け合わせる</b>やり方もあります。チョコレートがそれです。",
    "料理では「回せば作れる」ものが野菜より少ない。そこが野菜編との一番の違いです。"
  ],
  html: `
    <p>
      団子を作りたいとします。3Dの球を置いて潰す、ではありません。
      まず紙に<b>縦に切った断面の右半分</b>を描きます。下から上へ、
      中心からの距離（半径）が場所ごとにいくつになるかを並べた表です。
      これを軸のまわりに1周ぶん回せば、立体ができます。これを<b>回転体</b>といいます。
    </p>
    <figure>
<pre><span class="c">// 4. Section : 茶碗の断面（ご飯.js）
//    t は下から上、r は中心からの距離。単位は cm</span>
<span class="k">const</span> PROFILE = [
    { t: <span class="n">0.00</span>, r: <span class="n">1.75</span> },   <span class="c">// 高台の底</span>
    { t: <span class="n">0.10</span>, r: <span class="n">1.72</span> },
    { t: <span class="n">0.16</span>, r: <span class="n">2.30</span> },   <span class="c">// 高台から胴へ立ち上がる</span>
    { t: <span class="n">0.45</span>, r: <span class="n">4.60</span> },
    { t: <span class="n">0.80</span>, r: <span class="n">5.90</span> },
    { t: <span class="n">1.00</span>, r: <span class="n">6.15</span> }    <span class="c">// 口縁</span>
];</pre>
      <figcaption>点は10個前後で足りる。あいだはなめらかな曲線で補う</figcaption>
    </figure>
    <p>
      点と点のあいだは直線でつなぐと角ばるので、<b>Catmull-Rom スプライン</b>という曲線で補います。
      「4つの点を見て、真ん中の2点のあいだをなめらかに通る」曲線です。
      これで、10個の数字から曲面ができます。
    </p>

    <div class="lab" id="lab04">
      <p class="lab-title">実験 — 断面を引っぱると、立体が変わる</p>
      <div class="lab-cols two">
        <div>
          <canvas id="profCanvas" width="330" height="330" aria-label="断面の制御点をドラッグして形を変える"></canvas>
          <p class="hint">白い点を左右にドラッグ。これが半径の表です。</p>
        </div>
        <div>
          <canvas id="revCanvas" width="330" height="330" aria-label="断面を回転させた立体のプレビュー"></canvas>
          <p class="hint">その断面を1周ぶん回した結果。</p>
        </div>
      </div>
      <div class="chips" id="profPreset" style="margin-top:14px">
        <button class="chip" type="button" data-v="dango" aria-pressed="true">団子</button>
        <button class="chip" type="button" data-v="bowl">茶碗</button>
        <button class="chip" type="button" data-v="cookie">クッキー</button>
        <button class="chip" type="button" data-v="tako">たこ焼き</button>
      </div>
      <div class="ctrl" style="margin-top:12px;max-width:320px">
        <label for="profBump">手のあとの凹凸<span class="v" id="profBumpV">0.10</span></label>
        <input type="range" id="profBump" min="0" max="0.4" step="0.01" value="0.1">
      </div>
      <p class="hint">
        凹凸を 0 にすると工業製品、上げすぎると手びねりの粘土になります。
        料理ごとに「ちょうどよい」量が違うのが面白いところです。
      </p>
    </div>

    <h3>回転体では作れないものがある</h3>
    <p>
      チョコレートのボンボンは、上から見ると丸や四角やハート、横から見るとドームです。
      これは回転体ではありません。チョコレート.js は
      <b>外形（上から見た輪郭）</b>と<b>縦断面（横から見た形）</b>を別々に定義して、掛け合わせています。
    </p>
    <figure>
<pre><span class="c">// 4. Shape : 外形（スーパー楕円）× 縦断面（赤道式）</span>
<span class="c">// 上から見た輪郭。n を上げると四角に、下げると星形に近づく</span>
<span class="k">const</span> outline = (a) =&gt; <span class="n">1</span> / Math.pow(
    Math.pow(Math.abs(Math.cos(a)), n) + Math.pow(Math.abs(Math.sin(a)), n),
    <span class="n">1</span> / n);
<span class="c">// 高さ v での「赤道からの縮み」。1 なら外形そのまま</span>
<span class="k">const</span> shrink = (v) =&gt; Math.sqrt(Math.max(<span class="n">0</span>, <span class="n">1</span> - v * v));
<span class="k">const</span> radius = (a, v) =&gt; outline(a) * shrink(v);</pre>
      <figcaption>チョコレート.js のやり方。輪郭と断面を掛けるだけで、丸も角丸四角もハートも作れる</figcaption>
    </figure>
    <p>
      さらに、まったく回らないものもあります。トーストは<b>四角い板</b>ですし、
      鮭の切り身は<b>包丁で切った断面と皮</b>でできています。
      これらは「上から見た輪郭を関数で書き、その中を格子で埋める」という作り方をします。
      形の作り方は、料理の作られ方についてきます。
    </p>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>断面の両端は、きちんと 0 まで絞ってください。</b>
      団子の上下を半径 0.2 で止めると、そこが穴になって中が見えます。
      回転体には自動でフタが付かないからです。</p>
      <p><b>同じ高さに半径を2つ置けません。</b>
      「t → r」の表は、ひとつの高さにひとつの半径しか持てません。
      茶碗の口縁のように<b>外へ張り出してから下に折り返す</b>形は、
      (t, r) の2列ではなく (r, y) の2列で持つ必要があります。
      ご飯.js の茶碗がそうなっています。</p>
    </div>`,
  tryIt: [
    "「団子」の真ん中の点を外へ引っぱって、たこ焼きに近づけてみる。",
    "「茶碗」のいちばん上の点を内側へ入れて、壺にしてみる。",
    "凹凸を 0.4 にしたとき、どの料理なら許せてどれが嘘に見えるか決める。",
    "チョコレート.js の n（スーパー楕円の指数）を探し、値を変えると外形がどう変わるか予想する。"
  ]
},

/* ==================================================================
   05 面と法線
   ================================================================== */
{
  file: "ch05.html", no: "05", tag: "Mesh", nav: "05 面", color: "yomogi",
  title: "三角形の向きと、面の傾き",
  sub: "winding order / normals — 巻き順と法線",
  crumb: "第05章",
  recap: [
    "3Dモデルの正体は、<b>座標の配列</b>と<b>三角形の番号表</b>の2つだけです。",
    "三角形には表と裏があり、頂点を並べる向き（<b>巻き順</b>）で決まります。裏返ると消えます。",
    "面がどちらを向いているかの矢印を<b>法線</b>といい、明るさはこれだけで決まります。"
  ],
  html: `
    <p>
      04章で作った断面を、実際に立体にします。やることは2つだけです。
      <b>点を並べる</b>ことと、<b>どの3点で三角形を張るかを番号で書く</b>こと。
      Babylon.js では前者を <code>positions</code>、後者を <code>indices</code> と呼びます。
    </p>
    <figure>
<pre><span class="c">// 断面を N 段 × M 分割で回して、格子状に点を並べる</span>
<span class="k">for</span> (<span class="k">let</span> i = <span class="n">0</span>; i &lt; N; i++) {
    <span class="k">const</span> t = i / (N - <span class="n">1</span>);
    <span class="k">for</span> (<span class="k">let</span> j = <span class="n">0</span>; j &lt;= M; j++) {
        <span class="k">const</span> a = j / M * TAU;
        <span class="k">const</span> r = radius(t, a);
        positions.push(r * Math.cos(a), yAt(t), r * Math.sin(a));
        uvs.push(j / M, t);
    }
}</pre>
      <figcaption>j が M で終わらず M まで回るのは、継ぎ目の列を2重に持つため（06章で効いてくる）</figcaption>
    </figure>

    <h3>巻き順 — 裏返ると、立体が消える</h3>
    <p>
      三角形には表と裏があります。どちらが表かは、<b>3つの頂点を並べた向き</b>で決まります。
      外から見て反時計回りなら表。3Dの世界では、裏側の面は描くのを省略します
      （見えないところを描いても無駄なので）。だから<b>間違えると立体がまるごと消えます</b>。
      正確には、内側だけが見えて、風船の内壁を見ているような妙な絵になります。
    </p>
    <p>
      13本のサンプルは、この間違いを<b>実行時に自分で検出して直します</b>。
      作った直後にすべての面の法線を合計し、重心から外へ向いているかを調べる。
      向いていなければ番号表を入れ替える。「気をつける」ではなく「測って直す」という方針です。
    </p>
    <figure>
<pre><span class="c">// 3. Mesh utils : 巻き順の自動判定</span>
<span class="c">// 【対策】1頂点で判定すると、たまたま凹んだ所に当たって全体が裏返る。
//         全頂点ぶんの内積の総和で決める（クッキー.js の修正記録より）</span>
<span class="k">let</span> dot = <span class="n">0</span>;
<span class="k">for</span> (<span class="k">let</span> k = <span class="n">0</span>; k &lt; nv; k++) {
    dot += nx[k] * (px[k] - cx) + ny[k] * (py[k] - cy) + nz[k] * (pz[k] - cz);
}
<span class="k">if</span> (dot &lt; <span class="n">0</span>) flipIndices(indices);</pre>
      <figcaption>クッキー.js の cookie-A → A2 で直った箇所。1点で決めるとクラッカーが裏返っていた</figcaption>
    </figure>

    <h3>法線 — 明るさは、これだけで決まる</h3>
    <p>
      面がどちらを向いているかを表す矢印が<b>法線</b>です。
      光の向きとの角度で明るさが決まるので、
      <b>形は正しいのに法線が変だと、料理が金属や紙に見えます</b>。
    </p>
    <p>
      法線には2通りの出し方があります。三角形ごとに1本持つ（フラット）と、
      頂点ごとに、その頂点を囲む面の平均を持つ（スムーズ）。
      団子はスムーズ、板チョコの角はフラットであってほしい。
      料理によって、また同じ料理でも場所によって使い分けます。
    </p>

    <div class="lab" id="lab05">
      <p class="lab-title">実験 — 巻き順と法線を切り替える</p>
      <div class="lab-cols side">
        <div class="controls">
          <div class="chips" id="meshMode">
            <button class="chip" type="button" data-v="solid" aria-pressed="true">ふつうに描く</button>
            <button class="chip" type="button" data-v="wire">面の格子</button>
            <button class="chip" type="button" data-v="normal">法線の向き</button>
            <button class="chip" type="button" data-v="facing">表と裏</button>
          </div>
          <label class="switch"><input type="checkbox" id="meshSmooth" checked>法線をなめらかにする</label>
          <label class="switch"><input type="checkbox" id="meshFlip">巻き順を裏返す</label>
          <div class="ctrl">
            <label for="meshN">段の数<span class="v" id="meshNV">40</span></label>
            <input type="range" id="meshN" min="5" max="64" step="1" value="40">
          </div>
          <div class="ctrl">
            <label for="meshM">分割数<span class="v" id="meshMV">40</span></label>
            <input type="range" id="meshM" min="4" max="64" step="1" value="40">
          </div>
        </div>
        <canvas id="meshCanvas" width="640" height="360" aria-label="団子のメッシュを巻き順・法線・分割数で切り替える"></canvas>
      </div>
      <p class="hint">
        「表と裏」では、裏を向いた面が赤くなります。「巻き順を裏返す」を押すと全部赤くなり、
        ふつうに描いたときは中身が透けて見えます。
      </p>
    </div>

    <h3>法線を「溶接」する</h3>
    <p>
      いくつかの部品をくっつけて1つの料理にすると、つなぎ目に線が入ることがあります。
      同じ場所に頂点が2つあり、それぞれが別の法線を持っているからです。
      そこで、<b>ごく近い頂点どうしの法線を平均して揃える</b>処理を入れます。これを溶接といいます。
      13本すべてに <code>weldNormals</code> という関数が入っているのはそのためです。
    </p>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>分割数を上げれば良くなるわけではありません。</b>
      上の実験で分割数を 64 にしても、団子はほとんど変わりません。
      逆に細かくしすぎると、法線マップ（06章）で作った細かい凹凸と干渉してモアレます。
      クッキー.js には「型押しや格子は 0.3mm しかないので、幾何は低周波だけ、
      細かい起伏は法線マップに回す」と書いてあります。</p>
    </div>`,
  tryIt: [
    "「表と裏」に切り替えてから「巻き順を裏返す」を押し、色がどう変わるか見る。",
    "分割数を 4 まで下げて、団子が何角形になるか数える。",
    "「法線をなめらかにする」を切って、同じ形でも印象がどれだけ変わるか観察する。",
    "クッキー.js の中で「巻き順」という語を検索し、なぜ実測しているのか読む。"
  ]
},

/* ==================================================================
   06 テクスチャ
   ================================================================== */
{
  file: "ch06.html", no: "06", tag: "Texture", nav: "06 模様", color: "kitsune",
  title: "模様も、その場で描く",
  sub: "procedural texture — UV とテクスチャ生成",
  crumb: "第06章",
  recap: [
    "立体の表面と画像を対応づける座標を <b>UV</b> といいます。u が横、v が縦。",
    "このプロジェクトは画像を1枚も読み込まず、<b>1ピクセルずつ計算して描いて</b>います。",
    "描くのは色（アルベド）だけではありません。<b>光り方</b>と<b>凹凸</b>も別の画像として描きます。"
  ],
  html: `
    <p>
      立体ができたら、表面に模様を貼ります。そのために、
      立体の表面のどの点が画像のどの点に対応するかを決めておきます。これが <b>UV</b> です。
      回転体なら簡単で、<b>u は一周した角度、v は下から上への位置</b>にすればよい。
      05章で <code>uvs.push(j / M, t)</code> と書いていたのがそれです。
    </p>
    <p>
      次に画像を用意します。ふつうは写真を読み込みますが、このプロジェクトは
      <code>RawTexture</code> という「生の数値の配列」を作って、
      <b>1ピクセルずつ色を計算して詰めます</b>。トーストの焼き色なら、
      その位置のノイズを見て、焼けていれば茶色、焼けていなければ白、というふうに。
    </p>
    <figure>
<pre><span class="c">// 5. TextureLab : 焼き色を1ピクセルずつ描く（トースト.js の考え方）</span>
<span class="k">const</span> data = <span class="k">new</span> Uint8Array(S * S * <span class="n">4</span>);
<span class="k">for</span> (<span class="k">let</span> y = <span class="n">0</span>; y &lt; S; y++) <span class="k">for</span> (<span class="k">let</span> x = <span class="n">0</span>; x &lt; S; x++) {
    <span class="k">const</span> u = x / S, v = y / S;
    <span class="k">const</span> n = fbm(u * <span class="n">6</span>, v * <span class="n">6</span>, <span class="n">21</span>, <span class="n">5</span>);        <span class="c">// 焼きムラ</span>
    <span class="k">const</span> heat = clamp(bake * <span class="n">1.4</span> + (n - <span class="n">0.5</span>) * <span class="n">0.6</span>, <span class="n">0</span>, <span class="n">1</span>);
    <span class="k">const</span> c = heat &lt; <span class="n">0.5</span> ? mix3(CRUMB, CBR1, heat * <span class="n">2</span>)
                        : mix3(CBR1,  CBR3, heat * <span class="n">2</span> - <span class="n">1</span>);
    <span class="k">const</span> i = (y * S + x) * <span class="n">4</span>;
    data[i] = c[<span class="n">0</span>] * <span class="n">255</span>; data[i+<span class="n">1</span>] = c[<span class="n">1</span>] * <span class="n">255</span>;
    data[i+<span class="n">2</span>] = c[<span class="n">2</span>] * <span class="n">255</span>; data[i+<span class="n">3</span>] = <span class="n">255</span>;
}</pre>
      <figcaption>1024×1024 なら100万回まわる。実行に数秒かかるのはこのため</figcaption>
    </figure>

    <h3>1枚では足りない。3枚要る</h3>
    <p>
      色の画像（<b>アルベド</b>）だけを貼っても、まだ紙に印刷したように見えます。
      同じトーストでも、白いところはざらついて光を散らし、焦げたところは少し光る。
      その差を伝えるのが2枚目の <b>ORM</b> です。
      R に陰り（AO）、G に粗さ（Roughness）、B に金属度（Metallic）を詰めた1枚の画像で、
      3つの情報を3つの色チャンネルに同居させています。
    </p>
    <p>
      3枚目が<b>法線マップ</b>。細かい凹凸を、頂点を増やさずに表現します。
      本当は平らなのに、法線だけを傾けて「でこぼこしている」と光に嘘をつく。
      トーストの気泡の縁も、クッキーの型押しも、これでやっています。
    </p>

    <div class="lab" id="lab06">
      <p class="lab-title">実験 — 3枚の画像を描き分ける</p>
      <div class="lab-cols side">
        <div class="controls">
          <div class="chips" id="texMap">
            <button class="chip" type="button" data-v="albedo" aria-pressed="true">色（アルベド）</button>
            <button class="chip" type="button" data-v="rough">粗さ（ORM の G）</button>
            <button class="chip" type="button" data-v="normal">凹凸（法線マップ）</button>
          </div>
          <div class="ctrl">
            <label for="texBake">焼き加減<span class="v" id="texBakeV">0.45</span></label>
            <input type="range" id="texBake" min="0" max="1" step="0.01" value="0.45">
          </div>
          <div class="ctrl">
            <label for="texPore">す（気泡）の多さ<span class="v" id="texPoreV">0.50</span></label>
            <input type="range" id="texPore" min="0" max="1" step="0.01" value="0.5">
          </div>
          <label class="switch"><input type="checkbox" id="texApplyOn" checked>立体に貼ってみる</label>
        </div>
        <canvas id="texCanvas" width="640" height="340" aria-label="トーストのテクスチャ3枚と、それを貼った立体"></canvas>
      </div>
      <p class="hint">
        左が焼いている画像そのもの、右がそれを貼った結果。
        「粗さ」の画像は、白いほどざらざら（光らない）という意味です。
      </p>
    </div>

    <h3>継ぎ目をなくす</h3>
    <p>
      筒に模様を巻くと、一周して戻ったところで模様がぶつかります。
      03章で出てきた「u 方向に折り返すノイズ」はこのためのものです。
      さらに、05章で分割の列を M+1 本にしていたのも同じ理由で、
      <b>u=0 の頂点と u=1 の頂点を別々に持たせないと、継ぎ目の面で模様が逆走します</b>。
    </p>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>法線マップの上下の符号は、環境によって逆です。</b>
      高さの画像から法線を作るとき、縦方向の差を <code>(hd - hu)</code> と書くか
      <code>(hu - hd)</code> と書くかで、凸が凹に化けます。
      Babylon.js は V が下向きなので前者。13本のうち5本のコメントに、
      この符号を間違えて直した記録が残っています。</p>
      <p><b>1mm の粒は、テクスチャでは描けません。</b>
      たこ焼きの青のりを緑の点として描くと、遠くから見たときミップマップで溶けて
      「緑がかった靄」になります。たこ焼き.js が青のりを板ポリゴンの実体として置いているのは、
      それが理由です（→ <a href="ch09.html">09章</a>）。</p>
    </div>`,
  tryIt: [
    "焼き加減を 0 から 1 まで動かし、3枚の画像がそれぞれどう変わるか見比べる。",
    "「粗さ」だけを見て、焦げた部分と白い部分のどちらが明るいか確かめ、その理由を考える。",
    "「立体に貼ってみる」を切り、画像だけを見たときに何の模様か分かるか試す。",
    "トースト.js の TextureLab を開き、1枚のテクスチャに何色が混ぜられているか数える。"
  ]
},

/* ==================================================================
   07 質感（PBR）
   ================================================================== */
{
  file: "ch07.html", no: "07", tag: "PBR", nav: "07 質感", color: "choco",
  title: "「照り」「ぬれ」「粉っぽさ」を数値で言う",
  sub: "physically based rendering — 物理ベースの質感",
  crumb: "第07章",
  recap: [
    "PBR では、質感を<b>粗さ</b>・<b>金属度</b>・<b>透け</b>などの数値の組で表します。",
    "食べ物でいちばん効くのは<b>粗さ</b>と、上に乗った透明な膜（<b>クリアコート</b>）です。",
    "「おいしそう」は、たいてい<b>膜の艶</b>と<b>光の通り</b>の2つで決まります。"
  ],
  html: `
    <p>
      同じ形の団子でも、艶があれば茹でたて、粉をふいていれば時間が経っている。
      その差を、絵ではなく<b>数値</b>で言えるようにしたのが PBR です。
      色（アルベド）とは別に、次のような数値を面ごとに持たせます。
    </p>
    <table>
      <tr><th>数値</th><th>意味</th><th>この13本での使いどころ</th></tr>
      <tr><td>roughness</td><td>表面のざらつき。0 で鏡、1 で完全につや消し</td><td>ほぼ全部。焼けた所とそうでない所で必ず変える</td></tr>
      <tr><td>metallic</td><td>金属かどうか。食べ物はふつう 0</td><td>秋刀魚の銀でも 0.22 までしか上げない</td></tr>
      <tr><td>clearCoat</td><td>上に乗った透明な膜。ワックスや水の膜</td><td>たれ・ソース・米の水膜・チョコの艶</td></tr>
      <tr><td>subSurface</td><td>光が中に入って散る。厚みで色が変わる</td><td>団子・赤身・大根おろし・米</td></tr>
      <tr><td>sheen</td><td>布のような、縁がふわっと光る反射</td><td>かつお節・大根おろし・衣</td></tr>
      <tr><td>iridescence</td><td>薄い膜の干渉で出る虹色</td><td>秋刀魚の銀（構造色）</td></tr>
    </table>

    <div class="lab" id="lab07">
      <p class="lab-title">実験 — 粗さ・膜・透けを動かす</p>
      <div class="lab-cols side">
        <div class="controls">
          <div class="chips" id="pbrPreset">
            <button class="chip" type="button" data-v="dango" aria-pressed="true">団子</button>
            <button class="chip" type="button" data-v="choco">チョコ</button>
            <button class="chip" type="button" data-v="wiener">ウィンナー</button>
            <button class="chip" type="button" data-v="rice">ごはん</button>
          </div>
          <div class="ctrl">
            <label for="pbrRough">粗さ roughness<span class="v" id="pbrRoughV">0.40</span></label>
            <input type="range" id="pbrRough" min="0.03" max="1" step="0.01" value="0.4">
          </div>
          <div class="ctrl">
            <label for="pbrCoat">膜の強さ clearCoat<span class="v" id="pbrCoatV">0.30</span></label>
            <input type="range" id="pbrCoat" min="0" max="1" step="0.01" value="0.3">
          </div>
          <div class="ctrl">
            <label for="pbrSss">透け subSurface<span class="v" id="pbrSssV">0.20</span></label>
            <input type="range" id="pbrSss" min="0" max="1" step="0.01" value="0.2">
          </div>
          <div class="readout" id="pbrOut">—</div>
        </div>
        <canvas id="pbrCanvas" width="640" height="360" aria-label="粗さ・クリアコート・透けを変える実験"></canvas>
      </div>
      <p class="hint">
        粗さを 0.05 まで下げると、どの料理もプラスチックの成型品になります。
        食べ物の艶は「鋭い」のではなく「広くにじむ」ものです。
      </p>
    </div>

    <h3>粗さは、一様であってはいけない</h3>
    <p>
      いちばんよくある失敗が、粗さを1つの数値で決めてしまうことです。
      たこ焼き.js のコメントにこうあります。
      <b>「均一な鏡面はプラスチックの成型品。乾きかけた縁はざらつき、たまりだけが鏡になる」</b>。
      ソースの艶にムラを入れて初めてソースに見える。
      だから粗さは1つの数値ではなく、06章で作った<b>1枚の画像</b>として持たせます。
    </p>

    <h3>クリアコートは、掛け算で効く</h3>
    <p>
      クリアコートは「下地の上に透明な膜を1枚のせる」機能です。
      強さ（intensity）と、その膜自体の粗さ（roughness）を別々に持ちます。
      ここで初心者が必ずはまるのが、<b>強さを上げると下地まで一緒に明るくなる</b>ことです。
      膜が反射した光と、下地から返ってきた光が足し算されるためで、
      黒いチョコレートに強い膜をかけると、真っ黒なのに白く光る妙なものになります。
    </p>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>粗さ 0.055 は車の塗装の値です。</b>
      ご飯.js に、米粒の水膜をこの値にしたときの記録が残っています。
      「この鋭さだと1粒に1つ小さな鏡ができ、白い錠剤が並んでいるように見える。
      炊飯米の水膜はもっと広くにじんだ照りになる」。実測ではなく<b>見え方</b>で決めています。</p>
      <p><b>metallic を上げてはいけません。</b>
      秋刀魚の銀色は色素ではなく、グアニンの結晶による構造色（薄膜干渉）です。
      metallic を上げると「魚の形をしたスプーン」になります。
      焼き魚（サンマ）.js は metallic を 0.42 から 0.22 に落とし、
      代わりに iridescence（虹彩）を使うように直した経緯が書かれています。</p>
    </div>`,
  tryIt: [
    "「チョコ」を選び、粗さを 0.03 にして、食べ物に見えるかどうか判定する。",
    "「団子」で透けを 0 にすると何に見えるか、言葉にしてみる（石膏か消しゴム）。",
    "膜の強さを上げたとき、下地の色が変わって見えるかどうか確かめる。",
    "焼き魚（サンマ）.js で iridescence を検索し、なぜ metallic ではないのか読む。"
  ]
},

/* ==================================================================
   08 物理
   ================================================================== */
{
  file: "ch08.html", no: "08", tag: "Havok", nav: "08 物理", color: "karaage",
  title: "盛り付けは、手で置かない",
  sub: "physics — 落として積むという設計",
  crumb: "第08章",
  recap: [
    "皿の上の位置を1個ずつ手で書くと、必ず「並べた」ように見えます。",
    "そこで<b>上から落として、重力と摩擦に任せます</b>。物理エンジンは Havok。",
    "ただし13本のうち何本かは、あえて物理を使いません。<b>転がってはいけない料理</b>があるからです。"
  ],
  html: `
    <p>
      唐揚げを皿に山盛りにしたい。座標を手で書くと、どうやっても不自然になります。
      隙間が均等すぎるか、めり込むか、どちらかです。実物の山は、
      <b>落ちたものが下のものに引っかかって、たまたまそこで止まった</b>結果できています。
    </p>
    <p>
      だから、そのとおりにします。皿を置いて、重力を設定して、上から1個ずつ落とす。
      あとは物理エンジンが勝手に積んでくれます。書くのは「何を、どこから、どんな向きで落とすか」だけです。
    </p>
    <figure>
<pre><span class="c">// 8. Scene / 物理（クッキー.js）</span>
<span class="k">const</span> hk = <span class="k">await</span> HavokPhysics();
scene.enablePhysics(<span class="k">new</span> V3(<span class="n">0</span>, <span class="n">-620</span>, <span class="n">0</span>), <span class="k">new</span> BABYLON.HavokPlugin(<span class="k">true</span>, hk));

<span class="c">// 【対策】単位が cm なので重力は 981 相当。ただし Havok の接触許容量は
//         絶対値で決まっているため、実重力だと震える。620 で安定域に入る</span>
<span class="k">new</span> BABYLON.PhysicsAggregate(cookie, BABYLON.PhysicsShapeType.CONVEX_HULL,
    { mass: <span class="n">6</span>, friction: <span class="n">0.55</span>, restitution: <span class="n">0.04</span> }, scene);</pre>
      <figcaption>ウィンナー.js とクッキー.js に共通の設定。単位を cm にすると重力の値まで変わる</figcaption>
    </figure>

    <div class="lab" id="lab08">
      <p class="lab-title">実験 — 落として積む（唐揚げの山）</p>
      <div class="lab-cols side">
        <div class="controls">
          <div class="ctrl">
            <label for="dropCount">個数<span class="v" id="dropCountV">18</span></label>
            <input type="range" id="dropCount" min="4" max="40" step="1" value="18">
          </div>
          <div class="ctrl">
            <label for="dropFric">摩擦<span class="v" id="dropFricV">0.55</span></label>
            <input type="range" id="dropFric" min="0" max="1" step="0.01" value="0.55">
          </div>
          <div class="ctrl">
            <label for="dropRest">跳ね返り<span class="v" id="dropRestV">0.04</span></label>
            <input type="range" id="dropRest" min="0" max="0.8" step="0.01" value="0.04">
          </div>
          <button class="chip" type="button" id="dropRun">もう一度 落とす</button>
          <div class="readout" id="dropOut">—</div>
        </div>
        <canvas id="dropCanvas" width="640" height="360" aria-label="唐揚げを皿に落として積む実験"></canvas>
      </div>
      <p class="hint">
        断面（横から見た2D）での実験です。摩擦を 0 にすると全部が皿の縁まで流れて平らになり、
        1 に近づけると落ちた場所でそのまま止まって、不自然に高い塔ができます。
      </p>
    </div>

    <h3>当たり判定は、見た目のとおりでなくてよい</h3>
    <p>
      物理エンジンは、見た目の形をそのまま使うと重すぎます。
      そこで、当たり判定だけ簡単な形に置き換えます。クッキーやチョコは<b>凸包</b>
      （でっぱりだけを包んだ袋のような形）で十分です。
    </p>
    <p>
      ところがウィンナーは凸包では駄目でした。弓なりに曲がった胴を凸包で包むと、
      内側の窪みが埋まってバナナの内側が板になります。
      その状態で隣と重ねると、見た目では触れていないのに不自然に浮く。
      ウィンナー.js は<b>カプセルを何個か並べたもの</b>を当たり判定にしています。
    </p>

    <h3>あえて物理を使わない</h3>
    <p>
      たこ焼きは、ほぼ球です。物理で落とすと転がります。転がると、
      <b>せっかく上面に掛けたソースが横や下を向きます</b>。これは料理として成立しません。
      だから、たこ焼き.js は物理を使いません。代わりに、
    </p>
    <ul>
      <li>重なっている2個を、離れる方向に少しずつ押す（何度もくり返す）</li>
      <li>舟皿の底の高さの場に着地させる</li>
      <li>傾きは 15°までに制限する</li>
    </ul>
    <p>
      という<b>決定論的な緩和</b>で配置しています。他の料理と違って、
      この食べ物は「上下」が意味を持つからです。
      同じ考え方は、月見団子（15個を規則正しく積む）や、
      お寿司（3貫を板に並べる）でも使われています。
    </p>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>物理の結果は毎回変わります。</b>
      02章で「同じ種なら同じ結果」を守ってきたのに、
      物理を挟んだ瞬間に再現性が消えます（計算の順番が実行ごとに揺れるため）。
      だから物理を使うサンプルは、落とす順番・初期位置・初速をすべて種から決めて、
      揺れる余地を最小にしています。それでも完全には一致しません。</p>
    </div>`,
  tryIt: [
    "摩擦を 0 にして落とし、山ではなく1層になることを確かめる。",
    "跳ね返りを 0.8 にすると何が起きるか予想してから試す。",
    "個数を 40 にして、いちばん上の1個がどこで止まるか3回見比べる。",
    "たこ焼き.js で「緩和」または「重なり」を検索し、物理を使わない理由を読む。"
  ]
},

/* ==================================================================
   09 部品
   ================================================================== */
{
  file: "ch09.html", no: "09", tag: "Parts", nav: "09 部品", color: "sauce",
  title: "部品を作って、たくさん並べる",
  sub: "instancing / scattering — 実体としてのトッピング",
  crumb: "第09章",
  recap: [
    "青のり・かつお節・砂糖粒・ごま。<b>絵に描くと消えます</b>。実体として置く必要があります。",
    "同じ部品を何百個も置くときは<b>インスタンス</b>を使い、1個ぶんの形を使い回します。",
    "置いたあとに<b>重なりをほぐす</b>。均等に並べると、ふりかけたようには見えません。"
  ],
  html: `
    <p>
      たこ焼きの上に青のりをかけます。テクスチャに緑の点を描けばよさそうですが、
      これは失敗します。1mm の粒は、少し離れるとミップマップ（縮小版の画像）で溶けて
      <b>緑がかった靄</b>になります。粉を「ふりかけた」ように見せられるのは、実体のかけらだけです。
    </p>
    <p>
      そこで、板ポリゴン（四角い板を1枚）を青のりの形に切り抜いて、何百枚も撒きます。
      同じことを、かつお節（薄く曲がった板）、砂糖粒（小さな多面体）、
      ごま、チョコチップ（小さな円錐）でもやっています。
    </p>

    <h3>インスタンス — 形は1個ぶんだけ作る</h3>
    <p>
      500枚の板を1枚ずつ作ると、頂点の配列も500個ぶん要ります。
      そこで、形は1個だけ作り、<b>位置・向き・大きさ・色だけを500個ぶん持つ</b>。
      これがインスタンスです。GPU 側は「同じ形を、行列を差し替えながら500回描く」だけになります。
    </p>
    <figure>
<pre><span class="c">// 1枚だけ作って、あとは行列で配る</span>
<span class="k">const</span> flake = makeFlakeMesh(scene);
flake.thinInstanceSetBuffer(<span class="s">"matrix"</span>, matrices, <span class="n">16</span>);
<span class="c">// 個体ごとの色は、頂点色ではなくインスタンスの色として渡す</span>
flake.thinInstanceSetBuffer(<span class="s">"color"</span>, colors, <span class="n">4</span>);</pre>
      <figcaption>ご飯.js は約1400粒の米をこの方法で置いている（→ <a href="ch15.html">15章</a>）</figcaption>
    </figure>

    <div class="lab" id="lab09">
      <p class="lab-title">実験 — トッピングを撒いて、重なりをほぐす</p>
      <div class="lab-cols side">
        <div class="controls">
          <div class="ctrl">
            <label for="scatterN">枚数<span class="v" id="scatterNV">90</span></label>
            <input type="range" id="scatterN" min="10" max="260" step="5" value="90">
          </div>
          <div class="ctrl">
            <label for="scatterIter">ほぐす回数<span class="v" id="scatterIterV">0</span></label>
            <input type="range" id="scatterIter" min="0" max="30" step="1" value="0">
          </div>
          <div class="chips" id="scatterMode">
            <button class="chip" type="button" data-v="random" aria-pressed="true">乱数で撒く</button>
            <button class="chip" type="button" data-v="grid">格子に並べる</button>
          </div>
          <div class="readout" id="scatterOut">—</div>
        </div>
        <canvas id="scatterCanvas" width="640" height="360" aria-label="トッピングを撒いて重なりをほぐす実験"></canvas>
      </div>
      <p class="hint">
        「格子に並べる」は、重なりがゼロなのに一目で嘘と分かります。
        乱数で撒いてから少しだけほぐす、が実物に近い落としどころです。
      </p>
    </div>

    <h3>重なりをほぐす</h3>
    <p>
      乱数で撒くと、必ず何枚かが同じ場所に重なります。重なった2枚は、
      光の当たり方が同じになるので<b>1枚の濃い染みに見えます</b>。
      そこで、近すぎる組を見つけて、離れる方向に少しずつ動かす操作を何回かくり返します。
    </p>
    <p>
      ここで大事なのは<b>やりすぎないこと</b>です。ほぐしきると格子になり、
      「ふりかけた」ではなく「並べた」に戻ってしまいます。
      上の実験でほぐす回数を 30 まで上げると、それが見えます。
    </p>

    <h3>粒を、模様ではなく実体で作る判断</h3>
    <p>
      どこまでを実体で作り、どこからをテクスチャで済ませるか。
      13本のサンプルは、だいたい次の基準で分けています。
    </p>
    <table>
      <tr><th>大きさ</th><th>やり方</th><th>例</th></tr>
      <tr><td>数 mm 以上</td><td>実体のメッシュ。シルエットに出る</td><td>米粒・チョコチップ・レモン・大根おろし</td></tr>
      <tr><td>1〜3mm</td><td>板ポリゴン（かけら）。輪郭は要るが厚みは要らない</td><td>青のり・かつお節・大葉</td></tr>
      <tr><td>1mm 未満</td><td>法線マップとアルベド。凹凸だけ嘘をつく</td><td>衣の粒立ち・砂糖の細粒・す（気泡）の底</td></tr>
    </table>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>板ポリゴンは、裏から見ると消えます。</b>
      片面しか描かない設定のままだと、撒いたかけらの半分が見えなくなります。
      両面描画（<code>backFaceCulling = false</code>）にするか、
      裏返っているものを作るときに向きを揃えます。</p>
      <p><b>影を落とす対象に入れると、一気に重くなります。</b>
      500枚のかけら全部に影を計算させる必要はありません。
      大きいものだけ影を持たせ、小さいかけらは外します。</p>
      <p><b>同じ名前で何個も作ると、あとで自分が困ります。</b>
      ウィンナー4本を全部 <code>"wiener"</code> という名前で作っていたことがありました。
      画面は正しく出るので気づきません。ところが Playground の
      <b>Inspector で3本目をクリックすると、2本目が選ばれます</b>。
      Babylon.js は <code>new BABYLON.Mesh(name)</code> のときに
      <b><code>id</code> にも同じ値を入れる</b>ので、名前が同じなら id まで同じになり、
      Inspector が id で引き当てるときに取り違えるためです。</p>
      <p>厄介なのは、<b>名前だけ直しても直らない</b>ことです。
      あとから <code>mesh.name</code> を変えても <code>id</code> は元のまま残ります。
      13本のサンプルは「name を変えたら id も必ず併せて変える」を規約にしました。
      同じ部品を何百個も並べる章なので、いちばん踏みやすい落とし穴です。</p>
    </div>`,
  tryIt: [
    "枚数を 260 にして、ほぐす回数 0 と 10 を見比べる。",
    "「格子に並べる」に切り替え、なぜ嘘に見えるのか1行で書く。",
    "ほぐす回数を 30 にして、格子とどれくらい似てくるか観察する。",
    "たこ焼き.js で「青のり」を検索し、何枚撒いているか調べる。"
  ]
},

/* ==================================================================
   10 曲がり
   ================================================================== */
{
  file: "ch10.html", no: "10", tag: "Sweep", nav: "10 曲がり", color: "salmon",
  title: "曲がったものを作る",
  sub: "sweep along a spine — 軸に沿った掃引",
  crumb: "第10章",
  recap: [
    "ウィンナーも秋刀魚も、まっすぐではありません。ゆるく<b>弓なり</b>に曲がっています。",
    "回転体では作れないので、先に<b>軸（背骨）</b>を決め、断面を軸に垂直に置いていきます。",
    "軸に垂直な向きを取り違えると、断面がねじれて<b>メビウスの輪</b>になります。"
  ],
  html: `
    <p>
      ウィンナーを回転体で作ると、まっすぐな棒になります。実物はまっすぐではありません。
      ケーシングに詰めるときの押し具合で、ゆるく弓なりに曲がり、太さも長手方向に ±4% ほどうねります。
      これが無いと、オレンジ色の棒にしか見えません。
    </p>
    <p>
      そこで作り方を変えます。まず<b>軸（スパイン）</b>を1本決めます。
      次に、軸上の各点で「そこでの断面」を作り、<b>軸に垂直な平面の上に</b>置きます。
      これを軸に沿って何十枚も並べ、隣どうしをつなげば立体になります。これを<b>掃引</b>といいます。
    </p>
    <figure>
<pre><span class="c">// 3. Mesh utils : 掃引（ウィンナー.js / 焼き魚（サンマ）.js に共通）</span>
<span class="k">for</span> (<span class="k">let</span> i = <span class="n">0</span>; i &lt;= NS; i++) {
    <span class="k">const</span> u = i / NS;
    <span class="k">const</span> c = spine(u);           <span class="c">// 軸の上の点</span>
    <span class="k">const</span> T = normalize(dSpine(u)); <span class="c">// 進行方向（接線）</span>
    <span class="k">const</span> N = normalize(cross(T, UP));
    <span class="k">const</span> B = cross(N, T);         <span class="c">// この2本が断面の平面をつくる</span>
    <span class="k">for</span> (<span class="k">let</span> j = <span class="n">0</span>; j &lt;= NC; j++) {
        <span class="k">const</span> a = j / NC * TAU;
        <span class="k">const</span> r = section(u, a);
        push(c + N * (r * Math.cos(a)) + B * (r * Math.sin(a)));
    }
}</pre>
      <figcaption>断面は円とは限らない。秋刀魚は「横倒しにした平たい楕円」</figcaption>
    </figure>

    <div class="lab" id="lab10">
      <p class="lab-title">実験 — 軸を曲げて、断面を並べる</p>
      <div class="lab-cols side">
        <div class="controls">
          <div class="chips" id="sweepShape">
            <button class="chip" type="button" data-v="wiener" aria-pressed="true">ウィンナー</button>
            <button class="chip" type="button" data-v="sanma">秋刀魚</button>
          </div>
          <div class="ctrl">
            <label for="sweepBend">曲がり<span class="v" id="sweepBendV">0.06</span></label>
            <input type="range" id="sweepBend" min="0" max="0.30" step="0.005" value="0.06">
          </div>
          <div class="ctrl">
            <label for="sweepPlump">太さのうねり<span class="v" id="sweepPlumpV">0.06</span></label>
            <input type="range" id="sweepPlump" min="0" max="0.25" step="0.005" value="0.06">
          </div>
          <div class="ctrl">
            <label for="sweepFlat">断面のひらたさ<span class="v" id="sweepFlatV">1.00</span></label>
            <input type="range" id="sweepFlat" min="0.35" max="1" step="0.01" value="1">
          </div>
          <label class="switch"><input type="checkbox" id="sweepRing">断面の輪を描く</label>
        </div>
        <canvas id="sweepCanvas" width="640" height="360" aria-label="軸を曲げて断面を掃引する実験"></canvas>
      </div>
      <p class="hint">
        「断面の輪を描く」を押すと、軸に垂直な平面が何枚も並んでいるのが見えます。
        秋刀魚は断面のひらたさを 0.6 くらいにすると、それらしくなります。
      </p>
    </div>

    <h3>両端は、半球ではない</h3>
    <p>
      掃引で作った筒の両端を、そのまま半球で閉じたくなります。ウィンナーではこれが失敗します。
      実物の端には<b>ケーシングをねじって留めた結び目</b>があり、そこへ向かって放射状のひだが収束しています。
      ウィンナー.js のコメントに「この数mmが最も『らしさ』を出す」とあります。
      全体の 3% に満たない部分に、いちばん手間がかかっています。
    </p>

    <h3>体型のピークをどこに置くか</h3>
    <p>
      秋刀魚は全長 30cm に対して体高 4cm。極端に細長い魚です。
      焼き魚（サンマ）.js の修正記録には、
      <b>「体高のピークが u=0.30 にあり、頭が全長の1/3に見えていた。実写は鰓蓋直後 u≒0.22」</b>
      とあります。0.30 を 0.22 にずらしただけで、別の魚が秋刀魚になる。
      掃引で作る形は、<b>軸方向のどこに何を置くか</b>がほとんどすべてです。
    </p>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>断面の向きは、勝手に決まってくれません。</b>
      軸に垂直な平面は無数の回り方ができます。上のコードのように
      「毎回 UP との外積で決める」やり方は簡単ですが、
      軸が真上を向いた瞬間に外積が 0 になって破綻します。
      軸が大きく曲がる形では、前の断面の向きを引き継ぐ方法（平行移動枠）を使います。</p>
    </div>`,
  tryIt: [
    "曲がりを 0 にして、ウィンナーが何に見えるか判定する。",
    "太さのうねりを 0.25 にすると何に見えるか（ひょうたん）を確かめる。",
    "「秋刀魚」で断面のひらたさを 1.00 のままにすると、どんな魚に見えるか。",
    "ウィンナー.js で「結び目」を検索し、端の処理に何行使っているか数える。"
  ]
},

/* ==================================================================
   11 光
   ================================================================== */
{
  file: "ch11.html", no: "11", tag: "Scene", nav: "11 光", color: "sanma",
  title: "見せ方を決める（光と露出）",
  sub: "IBL / exposure / tone mapping — 環境光と露出",
  crumb: "第11章",
  recap: [
    "同じ料理でも、光の当て方で<b>別物になります</b>。形と同じくらい重要です。",
    "点の光源だけでは足りません。<b>まわりの環境そのものを光として</b>当てます（IBL）。",
    "明るすぎる部分をどう畳むか（<b>トーンマッピング</b>）で、料理か写真の失敗かが分かれます。"
  ],
  html: `
    <p>
      ここまでで形も模様も質感もできました。それでも、光の設定を間違えると、
      作ったものは食品サンプルに見えます。逆に、光がよければ多少の粗は隠れます。
      13本のサンプルは、シーンの設定にほぼ同じ手を使っています。
    </p>
    <ul>
      <li><b>環境光（IBL）</b> — 空や壁からの光を1枚の環境マップとして与える。
      食べ物は反射がやわらかいので、点光源だけだと影が黒く潰れます。</li>
      <li><b>キーライト</b> — 主役の1灯。斜め上、やや後ろから当てると、
      料理の輪郭が光って立体的になります（逆光ぎみ）。</li>
      <li><b>影</b> — ESM ではなく PCF ＋ <code>forceBackFacesOnly</code>。
      団子のように丸いものは、ESM だと自己遮蔽が痣のような黒い斑になります。</li>
      <li><b>SSAO2</b> — 物と物の接するところに薄い陰りを入れる。接地感が出ます。</li>
      <li><b>露出とトーンマッピング</b> — ACES というフィルム風の曲線で、
      明るい部分をなめらかに畳みます。</li>
    </ul>

    <div class="lab" id="lab11">
      <p class="lab-title">実験 — 露出とトーンマッピング</p>
      <div class="lab-cols side">
        <div class="controls">
          <div class="ctrl">
            <label for="sceneExpo">露出<span class="v" id="sceneExpoV">1.00</span></label>
            <input type="range" id="sceneExpo" min="0.3" max="2.6" step="0.02" value="1">
          </div>
          <div class="ctrl">
            <label for="sceneAmb">環境光の強さ<span class="v" id="sceneAmbV">1.00</span></label>
            <input type="range" id="sceneAmb" min="0" max="2.2" step="0.02" value="1">
          </div>
          <div class="ctrl">
            <label for="sceneKey">キーライトの向き<span class="v" id="sceneKeyV">-40°</span></label>
            <input type="range" id="sceneKey" min="-140" max="140" step="1" value="-40">
          </div>
          <label class="switch"><input type="checkbox" id="sceneTone" checked>トーンマッピングを使う</label>
          <div class="readout" id="sceneOut">—</div>
        </div>
        <canvas id="sceneCanvas" width="640" height="360" aria-label="露出とトーンマッピングを変える実験"></canvas>
      </div>
      <p class="hint">
        トーンマッピングを切って露出を上げると、明るいところが真っ白に貼り付きます。
        入れておくと、白くなる手前で色が残り続けます。
      </p>
    </div>

    <h3>トーンマッピングは「明るさの畳み方」</h3>
    <p>
      計算で出た明るさは 1 を超えます。画面は 1 までしか出せません。
      1 を超えたぶんを単純に切り落とすと、<b>ハイライトが真っ白な板になります</b>。
      料理でこれをやると、たれの照りが「白いシール」に見えます。
    </p>
    <p>
      そこで、切り落とすかわりになめらかに畳みます。
      <code>x / (1 + x)</code> のような曲線を通すと、どれだけ明るくても 1 を超えず、
      しかも色が残ります。実際のサンプルは ACES という、
      映画用に作られた曲線を使っています。
    </p>

    <h3>逆光は、食べ物の常套手段</h3>
    <p>
      料理写真が斜め後ろから光を当てるのには理由があります。
      <b>光が食材を通り抜けるところが見えるから</b>です。
      赤身の縁が赤く抜け、団子の輪郭が白く光り、大根おろしがふわっと浮く。
      これは 07章の subSurface と 14章の透けと直結しています。
      光の向きを変えるだけで、同じ材質が別物に見えます。上の実験で確かめてください。
    </p>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>被写界深度（ぼけ）の単位は m です。</b>
      このプロジェクトは 1 unit = 1 cm で書かれています。
      ところが Babylon.js の被写界深度は「1 unit = 1 m」でぼけの大きさを計算するので、
      ピント位置に <code>radius × 1000</code> を渡す必要があります。
      団子シリーズ4本すべてのコメントに、この注意が書かれています。</p>
      <p><b>環境光を上げれば明るくなる、ではありません。</b>
      上げすぎると影が消え、平べったい絵になります。
      「明るさが足りない」と感じたときに触るのは、たいてい露出のほうです。</p>
    </div>

    <h3>ポストプロセスは、GUI にも掛かってしまう</h3>
    <p>
      Bloom（にじみ）や被写界深度（ぼけ）は、<b>描き終えた絵の全体</b>に掛ける処理です。
      だから何もしないと、右下のスライダーまで一緒ににじんでボケます。
      13本のサンプルは最初、これを避けるために<b>GUI 専用のカメラをもう1台立てて</b>、
      <code>layerMask</code> で描き分けていました。
    </p>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>カメラを2台にすると、思わぬところが壊れます。</b>
      Babylon.js のいくつかの機能は「<code>activeCameras</code> のいちばん最後＝いま描いている基準のカメラ」
      と考えて動きます。GUI 用のカメラを足すと、それが最後になるので、
      <b>Playground の Inspector が3つまとめて動かなくなりました</b>。
      物理の当たり判定の表示（Physics Helper）が出ない。選択の枠がずれる。
      そして <code>scene.pick()</code> の光線が GUI カメラから飛ぶので、
      <b>画面をクリックしても違うものが選ばれる</b>。</p>
      <p><b>直し方は「カメラを増やさない」でした。</b>
      GUI を載せているレイヤーに <code>applyPostProcess = false</code> を付けると、
      そのレイヤーだけポストプロセスの<b>あと</b>で合成されます。
      カメラ1台のままで、UI にだけ Bloom とぼけが掛からない。
      ほとんどのサンプルは今この形になっています。</p>
    </div>
    <div class="note">
      <b>ここで覚えておきたいこと。</b>
      「見た目のための工夫」が、まったく関係なさそうな機能を壊すことがあります。
      しかも壊れ方が「Inspector でクリックしても違うものが選ばれる」なので、
      光の設定を疑うことはまずありません。
      <b>おかしいと思ったら、まず自分が足したものを1つずつ外してみる</b>のが近道です。
    </div>`,
  tryIt: [
    "トーンマッピングを切り、露出を 2.6 にして、ハイライトがどうなるか見る。",
    "キーライトを真正面（0°）にして、立体感がどれだけ失われるか確かめる。",
    "環境光を 0 にして、影が黒く潰れることを確かめる。",
    "花見団子.js で「被写界深度」を検索し、なぜ 1000 を掛けるのか読む。"
  ]
}

];
