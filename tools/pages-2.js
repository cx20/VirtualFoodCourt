/* =====================================================================
 *  たべもののつくりかた — 第II部（12〜17章）の本文
 *
 *  第I部がファイルの層（CONFIG → Rng → Noise → …）に対応していたのに対し、
 *  こちらは「食べ物だから必要になった技術」で立てた6章。
 *  形式は pages-1.js と同じ。
 * ===================================================================== */

module.exports = [

/* ==================================================================
   12 焼き色
   ================================================================== */
{
  file: "ch12.html", no: "12", tag: "Maillard", nav: "12 焼き色", color: "kitsune",
  title: "焼き色は、形と相関している",
  sub: "browning — 焼き色は飾りではない",
  crumb: "第12章",
  recap: [
    "焼き色を無関係なノイズで塗ると、「焼けた」ではなく<b>「汚れた」</b>ように見えます。",
    "実物は、<b>鉄板に当たった凸部が濃く、折り込みの溝は淡い</b>。形と結びついています。",
    "だから形とテクスチャは、<b>同じ種・同じ場</b>から作らなければいけません。"
  ],
  html: `
    <p>
      第I部の11章は、野菜編とほとんど同じ話でした。ここからが料理の本題です。
      14本のサンプルのうち、9本には<b>火が通っています</b>。
      そして「火が通っている」の見た目は、ほぼすべて<b>焼き色</b>で決まります。
    </p>
    <p>
      焼き色を作るのは簡単に見えます。茶色のノイズを表面に乗せればよさそうです。
      ところが、それをやると失敗します。たこ焼き.js のコメントに、こうあります。
    </p>
    <div class="note">
      <b>「焼き色は幾何と相関する。鉄板に当たった凸部が濃く、折り込みの溝とくぼみが淡い。
      無相関のノイズを乗せると、『焼けた球』ではなく『汚れた球』に見える」</b>
    </div>
    <p>
      理由は物理的です。焼き色（メイラード反応）は、熱が伝わったところで進みます。
      熱源に近い出っぱりから焦げ、へこみには熱が回りません。
      だから焼き色の分布は、形のでこぼこの<b>写し</b>になります。
      形と関係ないムラを乗せると、脳は「焼けた」ではなく「別のものが付着している」と読みます。
    </p>

    <div class="lab" id="lab12">
      <p class="lab-title">実験 — 焼き色を、形と結びつける / 切り離す</p>
      <div class="lab-cols side">
        <div class="controls">
          <div class="chips" id="maillardMode">
            <button class="chip" type="button" data-v="corr" aria-pressed="true">形と相関させる</button>
            <button class="chip" type="button" data-v="noise">無関係なノイズ</button>
            <button class="chip" type="button" data-v="flat">一様に塗る</button>
          </div>
          <div class="ctrl">
            <label for="maillardAmt">焼き加減<span class="v" id="maillardAmtV">0.50</span></label>
            <input type="range" id="maillardAmt" min="0" max="1" step="0.01" value="0.5">
          </div>
          <div class="ctrl">
            <label for="maillardRelief">生地の折り込み（でこぼこ）<span class="v" id="maillardReliefV">0.55</span></label>
            <input type="range" id="maillardRelief" min="0" max="1" step="0.01" value="0.55">
          </div>
          <div class="readout" id="maillardOut">—</div>
        </div>
        <canvas id="maillardCanvas" width="640" height="360" aria-label="たこ焼きの焼き色を形と相関させる実験"></canvas>
      </div>
      <p class="hint">
        でこぼこの量は3つのモードで同じです。変えているのは「焼き色を何から決めるか」だけ。
        それでも、無関係なノイズにした瞬間に、焼けたようには見えなくなります。<br><b>立体はドラッグで回せます</b>（触ると自動回転は止まります。ダブルクリックで戻ります）。
        上から覗くと、焼き色が折り込みの尾根に沿っているかどうかがはっきりします。
      </p>
    </div>

    <h3>同じ種から、形とテクスチャの両方を作る</h3>
    <p>
      相関させるには、実装上の工夫が要ります。テクスチャを描くのはテクスチャの担当、
      形を作るのは形の担当、と分けてしまうと、この2つはもう結びつきません。
    </p>
    <p>
      たこ焼き.js は、<b>「柄」という単位</b>を導入して解決しています。
      柄の種をひとつ決めると、そこから生地の折り込みの場と、その場から作った焼き色が
      両方出てくる。8個のたこ焼きには4種類の柄を割り当て、
      大きさ・向き・傾きだけを個体ごとに変えます。
    </p>
    <figure>
<pre><span class="c">// 6. Pattern : 形状 + テクスチャ（4種のアトラス）
// 同じ patternSeed から、でこぼこの場と焼き色の両方を作る</span>
<span class="k">const</span> field = foldField(patternSeed);          <span class="c">// 折り込みの高さの場</span>
<span class="k">const</span> tex   = bakeCrust(patternSeed, field);   <span class="c">// その場から焼き色を焼く</span>

<span class="c">// 【対策】全個体ぶんのテクスチャを焼くと 1024² × 3枚 × 8個 で数十秒。
//         4柄だけ焼いて 2x2 のアトラスにまとめ、UV で切り替える</span></pre>
      <figcaption>たこ焼き.js。テクスチャを個体ごとに焼かないのは、速度のためだけではない</figcaption>
    </figure>

    <h3>焼き色は「全面を覆ってはいけない」</h3>
    <p>
      もうひとつの落とし穴が、<b>焼けている面積</b>です。
      焼き魚（サンマ）.js の修正記録の第1項目がこれです。
    </p>
    <div class="note">
      <b>「heat の底上げを 0.62 → 0.10、wash に天井 0.62。
      実写は銀白が7割。可視面のほぼ全域がきつね色になり、豹柄／錆びた鉄板に見えていた」</b>
    </div>
    <p>
      焼き目は「点在する丸い斑」であって、全体のグラデーションではありません。
      焦げの面積を1割減らすだけで、料理は一気に実物に近づきます。
      クッキーも同じで、<b>縁・高いところ・底が濃く、型押しの凹部は熱が回らないので白く残る</b>。
      ここが逆だと一気に嘘になります。
    </p>

    <h3>割れ目の中は、周囲より明るい</h3>
    <p>
      クッキーやトーストの割れ目を、暗い線で描くと焦げた溝になります。
      実物の割れ目は、<b>焼けたあとに生地が広がって裂けた跡</b>なので、
      中は焼けていない生地が露出しています。つまり周囲より<b>明るい</b>。
      焼き色を「形から決める」という原則を守ると、これも自然に出ます。
      割れ目は熱源から見て奥まっているからです。
    </p>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>焼き色は、色だけでなく粗さも変えます。</b>
      焦げた部分は炭化して光りません。ウィンナー.js には
      「炭化した黒い点だけが局所的に粗い（そこだけ光らない）」とあります。
      色の画像だけ焼き分けて ORM を一様にすると、
      焦げているのにてかてか光る、という気持ちの悪いものができます。</p>
      <p><b>油の膜は、焼き色の上に乗ります。</b>
      たこ焼きの高台は「油でぬれて明るい」（crustWet）。
      焼き色を計算したあと、そのうえに濡れの層を掛けるという順番が要ります。</p>
    </div>`,
  tryIt: [
    "3つのモードを切り替え、どれが「焼けている」に見えるか判定する。",
    "「形と相関させる」のまま、でこぼこを 0 にすると何が起きるか確かめる。",
    "焼き加減を 1.0 にして、全面が焦げると料理に見えなくなることを確かめる。",
    "クッキー.js で「割れ目」を検索し、なぜ明るいのか読む。"
  ]
},

/* ==================================================================
   13 たれ・ソース
   ================================================================== */
{
  file: "ch13.html", no: "13", tag: "Glaze", nav: "13 たれ", color: "sauce",
  title: "たれは、色ではなく層",
  sub: "absorption — 厚みが色を決める",
  crumb: "第13章",
  recap: [
    "たれを茶色い<b>色として塗る</b>と、光沢のない茶色い卵になります。",
    "実物のたれは<b>透明な層</b>で、厚いところほど濃い。色は厚みの結果です。",
    "しかも<b>実体</b>です。垂れの輪郭・縁の厚み・たまりの膨らみがシルエットに出ます。"
  ],
  html: `
    <p>
      みたらし団子を作ります。飴色のたれを、アルベド（素の色）に茶色として塗る。
      これが最初の版でした。花見団子.js の作り直しの記録に、こうあります。
    </p>
    <div class="note">
      <b>「たれは『色』ではなく『透明な層』。飴色を albedo に塗ると、光沢の無い茶色い卵になる。
      クリアコートの着色（吸収）で持たせると、薄い所は淡い琥珀、
      厚い所は黒に近い赤褐色へ自然に分かれる」</b>
    </div>
    <p>
      透明なものを光が通ると、進んだ距離に応じて吸収されます。これがランベルト・ベールの法則で、
      残る光の量は <code>exp(−吸収係数 × 厚み)</code> です。
      吸収係数を赤・緑・青で別々にすると、<b>厚みが変わるだけで色が変わります</b>。
      たこ焼きのソースなら、単位厚みあたりの吸収が RGB で <code>[1.5, 3.2, 5.4]</code>。
      青がいちばん吸われるので、薄いところは橙、厚いところは黒に近い赤褐色になります。
    </p>
    <figure>
<pre><span class="c">// 5. TextureLab : ソースの色は「塗る」のではなく「解く」</span>
<span class="k">const</span> EXT = [<span class="n">1.5</span>, <span class="n">3.2</span>, <span class="n">5.4</span>];   <span class="c">// 単位厚みあたりの吸収（RGB）</span>
<span class="k">const</span> t = thickness(u, v);       <span class="c">// その場所のソースの厚み</span>
<span class="k">for</span> (<span class="k">let</span> c = <span class="n">0</span>; c &lt; <span class="n">3</span>; c++) {
    <span class="c">// 下地の色に、通った距離ぶんの吸収を掛ける</span>
    out[c] = base[c] * Math.exp(-EXT[c] * t);
}</pre>
      <figcaption>たこ焼き.js。Babylon のクリアコート着色は薄いところで数値的に破綻するので、CPU で解いて焼く</figcaption>
    </figure>

    <div class="lab" id="lab13">
      <p class="lab-title">実験 — 塗る / 層として解く</p>
      <div class="lab-cols side">
        <div class="controls">
          <label class="switch"><input type="checkbox" id="glazePaint">アルベドに茶色を塗る（昔の版）</label>
          <div class="ctrl">
            <label for="glazeThick">たれの厚み<span class="v" id="glazeThickV">0.45</span></label>
            <input type="range" id="glazeThick" min="0" max="1" step="0.01" value="0.45">
          </div>
          <div class="ctrl">
            <label for="glazeCover">掛かる範囲<span class="v" id="glazeCoverV">0.62</span></label>
            <input type="range" id="glazeCover" min="0" max="1" step="0.01" value="0.62">
          </div>
          <label class="switch"><input type="checkbox" id="glazeBody" checked>厚みを形にも出す</label>
          <div class="readout" id="glazeOut">—</div>
        </div>
        <canvas id="glazeCanvas" width="640" height="360" aria-label="みたらしのたれを層として解く実験"></canvas>
      </div>
      <p class="hint">
        「塗る」に切り替えると、厚みを変えても色が変わりません。
        だから、いくら濃くしても「濃い茶色に塗ったもの」にしか見えなくなります。
      </p>
    </div>

    <h3>たれは全面を覆わない</h3>
    <p>
      上から掛けたたれは、下へ流れて、途中で止まります。止まった線から下は、
      白い生地が出たままです。<b>全面を覆うと、たれではなくコーティングになります</b>。
      たこ焼きのソースも同じで、垂れの輪郭がシルエットに出て初めてソースになる。
      アルベドに茶色を描くだけだと、ハイライトが玉全体で一様のままなので、印刷したように見えます。
    </p>

    <h3>液体の面は、下の肌理を埋める</h3>
    <p>
      これも見落としやすい点です。生地の表面はざらざらしていますが、
      その上をたれが流れると、<b>細かい凹凸は埋まって平らになります</b>。
      たれの上を粗いままにしておくと、たれではなく「茶色い塗装」になります。
      13章でやることは、結局この3つに集約されます。
    </p>
    <ul>
      <li>色は<b>厚みから解く</b>（吸収）</li>
      <li>厚みを<b>形にも出す</b>（縁の盛り上がり、たまりの膨らみ）</li>
      <li>たれの下の<b>粗さと法線を上書きする</b>（平らにする）</li>
    </ul>

    <h3>艶にも、ムラが要る</h3>
    <p>
      たれを一様に光らせると、プラスチックの成型品になります。
      たこ焼き.js のコメント：<b>「乾きかけた縁はざらつき、たまりだけが鏡になる」</b>。
      同じソースの中で、粗さが場所ごとに違う。
      07章で「粗さは1つの数値ではなく1枚の画像」と言ったのは、ここに効いてきます。
    </p>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>クリアコートの着色は、厚み 0 のところで壊れます。</b>
      Babylon.js のクリアコート着色は、浅い入射角と厚み 0 の組み合わせで数値的に破綻します。
      団子シリーズ4本とも、着色をエンジンに任せず<b>CPU で吸収を解いてテクスチャに焼く</b>方針をとっています。
      「エンジンの機能があるから使う」ではなく、壊れない側を選ぶ、という判断です。</p>
    </div>`,
  tryIt: [
    "「塗る」に切り替えて厚みを動かし、色が変わらないことを確かめる。",
    "層のまま厚みを 1.0 にして、いちばん厚い所が何色になるか見る。",
    "「厚みを形にも出す」を切り、シルエットの違いを見比べる。",
    "花見団子.js で「たれ」を検索し、たれが止まる線をどう決めているか読む。"
  ]
},

/* ==================================================================
   14 透け
   ================================================================== */
{
  file: "ch14.html", no: "14", tag: "Translucency", nav: "14 透け", color: "sakura",
  title: "透けないと、食べ物に見えない",
  sub: "subsurface scattering — 光が中に入って散る",
  crumb: "第14章",
  recap: [
    "団子の透けを切ると<b>石膏</b>に、赤身の透けを切ると<b>赤く塗った消しゴム</b>になります。",
    "光は表面で全部はね返るのではなく、中に入って散ってから出てきます。",
    "薄いところほど多く抜けるので、<b>厚みの情報</b>を持たせるのが要点です。"
  ],
  html: `
    <p>
      食べ物のほとんどは、多かれ少なかれ光を通します。
      上新粉の生地、白玉、マグロの赤身、大根おろし、レモン、米粒、鮭の身。
      光が表面で全部はね返るのは金属だけで、
      食べ物では<b>いったん中に入り、何度か散らばってから、別のところから出てきます</b>。
      これを subsurface scattering（表面下散乱、SSS）といいます。
    </p>
    <p>
      これが見た目にどう出るかというと、<b>逆光になったときの縁</b>です。
      光を後ろから当てると、薄い部分だけが明るく透けます。
      団子の輪郭がふわっと白く光り、赤身の縁が赤く抜ける。
      料理写真が斜め後ろから光を当てるのは、これを見せるためです（→ <a href="ch11.html">11章</a>）。
    </p>

    <div class="lab" id="lab14">
      <p class="lab-title">実験 — 透けを切る / 光を後ろへ回す</p>
      <div class="lab-cols side">
        <div class="controls">
          <div class="chips" id="sssPreset">
            <button class="chip" type="button" data-v="dango" aria-pressed="true">白玉</button>
            <button class="chip" type="button" data-v="akami">赤身</button>
            <button class="chip" type="button" data-v="rice">米粒</button>
          </div>
          <div class="ctrl">
            <label for="sssAmt">透けの強さ<span class="v" id="sssAmtV">0.45</span></label>
            <input type="range" id="sssAmt" min="0" max="1" step="0.01" value="0.45">
          </div>
          <div class="ctrl">
            <label for="sssBack">光の向き（逆光へ）<span class="v" id="sssBackV">40°</span></label>
            <input type="range" id="sssBack" min="-30" max="160" step="1" value="40">
          </div>
          <div class="readout" id="sssOut">—</div>
        </div>
        <canvas id="sssCanvas" width="640" height="360" aria-label="透けの強さと光の向きを変える実験"></canvas>
      </div>
      <p class="hint">
        透けを 0 にすると、光をどこから当てても縁が抜けません。
        白玉が石膏に、赤身が消しゴムに見えるのはそのためです。<br><b>立体はドラッグで回せます</b>（触ると自動回転は止まります。ダブルクリックで戻ります）。
        光を後ろへ回してから立体も回すと、抜けて見える向きが探せます。
      </p>
    </div>

    <h3>厚みを、どうやって知るか</h3>
    <p>
      「薄いところほど透ける」を実装するには、その点の<b>厚み</b>が必要です。
      ところが3Dの表面には厚みの情報がありません。そこで、あらかじめ計算して
      テクスチャに焼いておきます。これを thickness テクスチャといいます。
    </p>
    <figure>
<pre><span class="c">// 3. TextureLab : 厚みを焼く（ご飯.js の米粒）
// 米粒は中心が厚く、縁と両端が薄い。単純な形なら式で書ける</span>
<span class="k">const</span> th = Math.sqrt(Math.max(<span class="n">0</span>, <span class="n">1</span> - rr)) * (<span class="n">1</span> - <span class="n">0.35</span> * endFade);
mat.subSurface.thicknessTexture = bake(th);
mat.subSurface.isTranslucencyEnabled = <span class="k">true</span>;
mat.subSurface.translucencyIntensity = <span class="n">0.45</span>;</pre>
      <figcaption>形が複雑な場合は、内側へレイを飛ばして距離を測る方法もある</figcaption>
    </figure>

    <h3>散る色は、素の色とは違う</h3>
    <p>
      中を通ってきた光は、素の色そのままでは出てきません。
      赤身なら、より赤く、より暗く。白玉なら、わずかに黄味を帯びて。
      だから SSS には、アルベドとは別に<b>散乱の色（tint）</b>を持たせます。
    </p>
    <p>
      お寿司.js の赤身は、この色を <code>[0.560, 0.088, 0.098]</code>（深い深紅）に取っています。
      表面の色より濃い。「光を通すと明るくなる」のではなく、
      <b>光を通すと、その材質の色が濃く出る</b>のが正しい方向です。
    </p>

    <h3>切り身は「表面」ではなく「切り口」</h3>
    <p>
      お寿司.js のコメントに、この章と関係の深い一節があります。
    </p>
    <div class="note">
      <b>「見えているのは『表面』ではなく『包丁で切った断面』。
      模様は表面の汚れではなく、筋肉の束と脂の層が切られた切り口」</b>
    </div>
    <p>
      野菜の皮や、たこ焼きの生地は<b>外側</b>です。ところが刺身や鮭の切り身は、
      内部構造がむき出しになっています。だから模様の作り方が変わります。
      筋肉の束（筋節）が斜めに走る場を作り、それを切った断面を模様にする。
      鮭の白い筋（ミオコンマ）が「く」の字に並ぶのは、そのためです。
    </p>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>霜降りは色ではなく実体です。</b>
      アルベドに白い線を描いただけだと、印刷したステッカーになります。
      脂は肉より白く、やわらかく、<b>わずかに盛り上がって光る</b>。
      法線と粗さも一緒に変えないと霜降りになりません。</p>
      <p><b>透けを強くしすぎると、光る風船になります。</b>
      subSurface は「ぼんやり光る」ので、上げるほど良く見えがちです。
      14本のサンプルの値は、身のあるもので 0.4〜0.7（赤身 0.55 / 中トロ 0.62 / 大トロ 0.70、
      団子は白玉 0.52 / 桜 0.55 / 白 0.62、ご飯 0.45）。削り節やひれのように「透けて当然」の薄いものでも 0.85 止まりで、
      1.0 に近い値はどこにもありません。</p>
    </div>`,
  tryIt: [
    "「白玉」で透けを 0 にして、何に見えるか言葉にする。",
    "光の向きを 160°（真後ろ）にして、透けの有無を見比べる。",
    "「赤身」で透けを 1.0 にすると、どこから食べ物でなくなるか探す。",
    "お寿司.js で「透」を検索し、赤身・中トロ・大トロで値がどう違うか比べる。"
  ]
},

/* ==================================================================
   15 粒
   ================================================================== */
{
  file: "ch15.html", no: "15", tag: "Grains", nav: "15 粒", color: "gin",
  title: "粒を1400個置いて、谷を暗くする",
  sub: "baked ambient occlusion — 擬似AOの焼き込み",
  crumb: "第15章",
  recap: [
    "茶碗一杯のごはんは、<b>約1400粒</b>を1粒ずつ置いて作っています。",
    "説得力を決めるのは粒の形ではなく、<b>粒と粒のあいだの暗がり</b>です。",
    "その暗がりは <b>SSAO では出ません</b>。配置するときに計算して焼き込みます。"
  ],
  html: `
    <p>
      ごはんを描くとき、いちばん難しいのは1粒の形ではありません。
      1粒だけを取り出すと、どのやり方でもそれなりに見えます。
      難しいのは<b>集まったとき</b>で、粒間の暗がりが無いと、
      ごはんは「発泡スチロールの塊」になります。
    </p>
    <p>
      ふつう、こういう陰りは <b>SSAO</b>（画面空間アンビエントオクルージョン）という
      後処理で付けます。ところが、ご飯.js はそれを使いません。理由がコメントに書いてあります。
    </p>
    <div class="note">
      <b>「SSAO が拾えるのは画面空間で隣接している面の陰りだけで、
      ごはんの谷は深さ数ミリ・幅数ミリの密集した溝なので、
      半径を合わせると今度は粒の輪郭が全部汚れる」</b>
    </div>
    <p>
      そこで別の手を使います。粒を配置するときに、
      <b>その粒が近傍の最高点からどれだけ沈んでいるか</b>を計算し、
      その値をインスタンスの色として書き込む。沈んでいる粒ほど暗い色を持たせるわけです。
      描画時のコストはゼロで、しかも粒の形に沿って正確に暗くなります。
    </p>
    <figure>
<pre><span class="c">// 9. Grains : 配置と「粒間の暗がり」の焼き込み</span>
<span class="k">const</span> hi = neighborMaxHeight(x, z);        <span class="c">// 近傍でいちばん高い粒の頭</span>
<span class="k">const</span> sink = clamp((hi - y) / depth, <span class="n">0</span>, <span class="n">1</span>); <span class="c">// どれだけ沈んでいるか</span>
<span class="k">const</span> k = mix(<span class="n">1.0</span>, aoFloor, sink);          <span class="c">// aoFloor = いちばん深い谷の明るさ</span>
colors.push(k, k, k, <span class="n">1</span>);                    <span class="c">// インスタンスカラーへ</span></pre>
      <figcaption>ご飯.js。GUI の「粒間の暗がり」スライダーは aoFloor を動かしている</figcaption>
    </figure>

    <div class="lab" id="lab15">
      <p class="lab-title">実験 — 粒間の暗がりを、切る / 入れる</p>
      <div class="lab-cols side">
        <div class="controls">
          <div class="ctrl">
            <label for="grainN">粒の数<span class="v" id="grainNV">420</span></label>
            <input type="range" id="grainN" min="60" max="900" step="20" value="420">
          </div>
          <div class="ctrl">
            <label for="grainAo">いちばん深い谷の明るさ<span class="v" id="grainAoV">0.52</span></label>
            <input type="range" id="grainAo" min="0.1" max="1" step="0.01" value="0.52">
          </div>
          <div class="ctrl">
            <label for="grainDepth">暗がりの届く深さ<span class="v" id="grainDepthV">0.55</span></label>
            <input type="range" id="grainDepth" min="0.1" max="1.5" step="0.01" value="0.55">
          </div>
          <div class="readout" id="grainOut">—</div>
        </div>
        <canvas id="grainCanvas" width="640" height="360" aria-label="米粒の集まりと粒間の暗がりの実験"></canvas>
      </div>
      <p class="hint">
        谷の明るさを 1.0 にすると暗がりが消えます。粒の形も数も同じなのに、
        急にごはんに見えなくなるのが分かります。
      </p>
    </div>

    <h3>近傍の「最高点」を使う理由</h3>
    <p>
      沈み具合を測るとき、近傍の<b>平均</b>の高さと比べるとうまくいきません。
      ご飯.js のコメントに「最高点と同じ高さになり、暗がりがまったく出ない」という
      注意が残っています。平均と比べると、山の粒も谷の粒も同じくらいの差になってしまうからです。
      比べる相手は<b>いちばん高い粒</b>でなければいけません。
    </p>

    <h3>握ると、沈み込みが浅くなる</h3>
    <p>
      お寿司.js は、ご飯.js の米粒・マテリアル・暗がりの焼き込みを<b>そのまま流用</b>しています。
      変わるのは盛りの形（茶碗の山 → 俵）だけ……ではありません。
      酢飯は握って締めるので、<b>粒の沈み込みが浅くなります</b>。
      同じ仕組みのまま、パラメータ1つで「ふんわり」と「締まっている」を作り分けています。
      この考え方は<a href="ch17.html">17章</a>につながります。
    </p>

    <h3>1400 という数</h3>
    <p>
      茶碗一杯は実際には数千粒あります。1400 は、見た目が破綻しない下限として選ばれた数です。
      表面から見えない粒は置かないので、実際には「表面から2〜3層ぶん」だけ配置しています。
      中身は<b>盛りの形（Mound）</b>という1枚の曲面で塞いであり、粒はその上に生えています。
    </p>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>粒をランダムに置くだけでは、ごはんになりません。</b>
      向きが完全にばらばらだと「もみ殻の山」に見えます。
      実物は表面に沿って寝ている粒が多い。盛りの曲面の法線を使って、
      粒の向きをある程度そちらへ倒しています。</p>
      <p><b>インスタンスカラーは、ライティングの前に掛かります。</b>
      焼き込んだ暗さは「その粒に届く光の量」を表しているので、
      アルベドに掛けるのが正しい。あとから画面全体を暗くするのとは意味が違います。</p>
    </div>`,
  tryIt: [
    "谷の明るさを 1.0 にして、ごはんが何に見えるか判定する。",
    "粒の数を 60 まで減らして、どこから「ごはん」でなくなるか探す。",
    "暗がりの届く深さを 1.5 にして、暗すぎるとどうなるか見る。",
    "ご飯.js の GUI で「粒間の暗がり」を 0 にした画面と見比べる。"
  ]
},

/* ==================================================================
   16 接触変形
   ================================================================== */
{
  file: "ch16.html", no: "16", tag: "Contact", nav: "16 潰れ", color: "yomogi",
  title: "触れ合うと、潰れる",
  sub: "contact deformation — やわらかい物の積み方",
  crumb: "第16章",
  recap: [
    "団子を真球のまま積むと、<b>発泡スチロールの球</b>に見えます。",
    "自重と押し合いで、接するところが平らになる。下の段ほど潰れます。",
    "潰した<b>体積の行き先</b>と、接触の縁にできる<b>丸い土手</b>が、やわらかさの正体です。"
  ],
  html: `
    <p>
      月見団子は15個を三方に積みます（9 + 4 + 2）。
      球を15個並べて終わり、にはなりません。月見団子.js の冒頭にこうあります。
    </p>
    <div class="note">
      <b>「月見団子は球ではない。自重と隣どうしの押し合いで、接する所が平らになる。
      下の段ほど潰れ、上へ行くほど丸い。真球のまま積むと発泡スチロールに見える」</b>
    </div>
    <p>
      平らにするだけなら簡単です。接触面の側を切り落とせばよい。
      ところが、それだけでは<b>やせた球</b>になります。餅は非圧縮なので、
      押されて減った体積はどこかへ行かなければいけません。
      行き先は、押されていない自由な面です。つまり<b>他の方向がその分ふくらむ</b>。
    </p>
    <figure>
<pre><span class="c">// 方向ごとの半径を smin で丸める（＝縁に土手のある柔らかい接触）</span>
<span class="k">let</span> r = R;
<span class="k">for</span> (<span class="k">const</span> c of contacts) {
    <span class="k">const</span> d = dot(dir, c.n);
    <span class="k">if</span> (d &gt; <span class="n">0</span>) r = smin(r, c.dist / d, R * <span class="n">0.090</span>);  <span class="c">// なめらかな最小値</span>
}
<span class="c">// 切り取った球冠の体積ぶんだけ全体を膨らませる（餅は非圧縮）</span>
r *= Math.cbrt(<span class="n">1</span> + volumeLoss / sphereVolume);</pre>
      <figcaption>月見団子.js。smin（多項式スムーズ最小値）が「丸い土手」を作る</figcaption>
    </figure>

    <div class="lab" id="lab16">
      <p class="lab-title">実験 — 潰す / 体積を戻す / 土手をつける</p>
      <div class="lab-cols side">
        <div class="controls">
          <div class="ctrl">
            <label for="squashAmt">潰し量<span class="v" id="squashAmtV">0.30</span></label>
            <input type="range" id="squashAmt" min="0" max="0.6" step="0.01" value="0.3">
          </div>
          <label class="switch"><input type="checkbox" id="squashVol" checked>減った体積を戻す</label>
          <label class="switch"><input type="checkbox" id="squashRim" checked>接触の縁を丸める（土手）</label>
          <label class="switch"><input type="checkbox" id="squashStack" checked>下の段ほど強く潰す</label>
          <div class="readout" id="squashOut">—</div>
        </div>
        <canvas id="squashCanvas" width="640" height="360" aria-label="団子を積んで接触面で潰す実験"></canvas>
      </div>
      <p class="hint">
        3つのスイッチを全部切ると、ただの球の山になります。
        1つずつ入れていくと、どれがどれだけ効いているかが分かります。
      </p>
    </div>

    <h3>なめらかな最小値（smin）</h3>
    <p>
      接触面を作るには「球の半径」と「接触面までの距離」の小さいほうを取ればよい。
      ただし <code>Math.min</code> をそのまま使うと、境目に<b>鋭い角</b>ができます。
      実物の団子には角がありません。わずかに丸い土手ができて、そこに細い影の線が入ります。
    </p>
    <figure>
<pre><span class="c">// 多項式スムーズ最小値。k のぶんだけ、境目が丸くつながる</span>
<span class="k">const</span> smin = (a, b, k) =&gt; {
    <span class="k">const</span> h = Math.max(<span class="n">0</span>, k - Math.abs(a - b)) / k;
    <span class="k">return</span> Math.min(a, b) - h * h * k * <span class="n">0.25</span>;
};</pre>
      <figcaption>この1行が、硬い球とやわらかい餅を分ける</figcaption>
    </figure>

    <h3>串は、団子の中心を通っていない</h3>
    <p>
      花見団子は同じ問題を、別の向きで扱っています。
      串の方向に押しつぶされ、隣と接する両端が平らになる。
      直径 3.0cm に対して串方向は約 2.4cm、接触面の直径は約 1.2cm。
      さらに、
    </p>
    <ul>
      <li>串の入口は生地が引き込まれて<b>すり鉢状にへこむ</b>（平らだと刺さって見えない）</li>
      <li>団子は串の<b>中心に乗っていない</b>。わずかに偏心している</li>
      <li>隣どうしは「めり込む」のではなく、<b>平らな面が触れて細い影の線</b>ができる</li>
    </ul>
    <p>
      どれも数ミリの話です。ところが、この数ミリを入れるかどうかで、
      「色つきの球に棒」か「団子」かが決まります。
    </p>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>潰す方向を1つに決めないでください。</b>
      下の段の団子は、下から（台）・横から（隣）・上から（上の段）の3方向に押されています。
      「上下だけ潰す」と、上から見たときに真円のままなので嘘が見えます。
      月見団子.js は接触を全部集めてから、方向ごとに半径を決めています。</p>
      <p><b>体積を戻しすぎると、風船になります。</b>
      係数 0.33 は「戻しすぎない」ための値です。実際の餅は多少水分が逃げるので、
      きっちり保存するより少なめのほうが自然に見えます。</p>
    </div>`,
  tryIt: [
    "3つのスイッチを全部切って、球の山に戻してみる。",
    "「減った体積を戻す」だけを入れて、シルエットがどう変わるか見る。",
    "潰し量を 0.6 にすると、どこから餅でなくなるか探す。",
    "月見団子.js で smin を検索し、k の値がいくつになっているか調べる。"
  ]
},

/* ==================================================================
   17 差分
   ================================================================== */
{
  file: "ch17.html", no: "17", tag: "Variants", nav: "17 差分", color: "akami",
  title: "「似ているのに別物」を作り分ける",
  sub: "variants — 差分でつくるという設計",
  crumb: "第17章",
  recap: [
    "トーストとエッグトーストは、<b>同じプログラム</b>です。差分は数か所しかありません。",
    "サンマと鮭も、団子3種も、チョコ8種も同じ骨格から作られています。",
    "ただし<b>色を変えただけでは別物になりません</b>。何を変えると別物になるかが本題です。"
  ],
  html: `
    <p>
      14本のうち、いくつかは兄弟です。
    </p>
    <table>
      <tr><th>組</th><th>共有しているもの</th><th>差分</th></tr>
      <tr><td>トースト / エッグトースト</td><td>スライスの SDF・す（気泡）・耳・焦げ・皿</td><td>上面のくぼみ、卵、焼き分け</td></tr>
      <tr><td>ご飯 / お寿司</td><td>米粒の形・マテリアル・粒間の暗がり</td><td>盛りの形（山 → 俵）、締め具合、ネタ</td></tr>
      <tr><td>焼き魚（サンマ）/（鮭）</td><td>掃引・体表テクスチャ・皿・付け合わせ</td><td>一尾か切り身か、銀か橙か、筋節の場</td></tr>
      <tr><td>花見団子 / 月見団子</td><td>生地の透過・法線の規約・影・被写界深度</td><td>串か積むか、たれの有無、接触の向き</td></tr>
      <tr><td>クッキー（7種）/ チョコ（8種）</td><td>断面・焼き色・皿・物理</td><td>外形、厚み、トッピング、艶</td></tr>
    </table>
    <p>
      共有しているほうが多い。これは偶然ではなく、
      <b>01章で見た層構造がそうなっているから</b>です。
      下の層（乱数・ノイズ・メッシュの道具）は料理を知らないので、そのまま使い回せます。
    </p>

    <div class="lab" id="lab17">
      <p class="lab-title">実験 — トーストをエッグトーストにする</p>
      <div class="lab-cols side">
        <div class="controls">
          <label class="switch"><input type="checkbox" id="diffWell">上面にくぼみを彫る</label>
          <label class="switch"><input type="checkbox" id="diffEgg">卵を落とす</label>
          <label class="switch"><input type="checkbox" id="diffBake">くぼみの中だけ焼きを弱める</label>
          <label class="switch"><input type="checkbox" id="diffGloss">白身と黄身で艶を変える</label>
          <div class="readout" id="diffOut">—</div>
        </div>
        <canvas id="diffCanvas" width="640" height="360" aria-label="トーストからエッグトーストへの差分の実験"></canvas>
      </div>
      <p class="hint">
        「卵を落とす」だけを入れると、トーストの上に黄色い円が乗ります。
        4つ全部を入れて初めてエッグトーストになります。
      </p>
    </div>

    <h3>色だけを変えても、別物にはならない</h3>
    <p>
      いちばんよくある勘違いがこれです。
      サンマを橙色にしても鮭にはなりません。サンマは<b>一尾まるごとの側扁した筒</b>、
      鮭は<b>包丁で切った切り身</b>です。見えている面の成り立ちからして違います。
    </p>
    <p>
      逆に、形を変えなくても別物になる組み合わせもあります。
      ご飯とお寿司のシャリがそれで、盛りの形と締め具合という2つの数値だけで、
      「ふんわり盛った白飯」と「握って締めた酢飯」に分かれます。
    </p>

    <h3>差分にすると、直しが全部に効く</h3>
    <p>
      設計としての利点はここです。
      法線マップの V の符号を間違えていたことに気づいたとします。
      14本に同じ間違いが独立して書かれていたら、14か所直すことになります。
      実際には、団子シリーズ4本のコメントに
      <b>「法線マップの V の符号は (yd − yu)。Babylon の接空間は V が下向き」</b>
      と同じ注意が書き写されています。<b>1本で分かったことが、次の1本に持ち越されている</b>。
    </p>
    <p>
      ファイルの先頭を読み比べると、これがよく分かります。
      「団子版（dango-C）から引き継いだもの」「サクランボ版から引き継いだもの」
      「ごはん.js の続き」——14本は独立した作品ではなく、1本の連続した記録です。
    </p>

    <h3>プリセットという形の差分</h3>
    <p>
      同じファイルの中の差分が<b>プリセット</b>です。
      クッキー.js は7種類（サブレ / 市松 / うずまき / チョコチップ / 型押しビスケット /
      クラッカー / 絞り出し）を、断面と外形の数値だけで作り分けています。
    </p>
    <figure>
<pre><span class="c">// 0. CONFIG : 種類プリセット（クッキー.js）</span>
sable: {
    label: <span class="s">"サブレ"</span>, shape: <span class="s">"disc"</span>,
    radius: <span class="n">2.55</span>, thickness: <span class="n">0.98</span>, dome: <span class="n">0.20</span>, rimBulge: <span class="n">0.88</span>,
    crackAmt: <span class="n">0.30</span>, blister: <span class="n">0.0</span>, dockPitch: <span class="n">0</span>,
    emboss: <span class="s">"none"</span>, sugarAmt: <span class="n">1.00</span>
},</pre>
      <figcaption>プリセットが増えても、下の層は1行も変わらない</figcaption>
    </figure>
    <div class="trap">
      <span class="label">つまずきポイント</span>
      <p><b>乱数の幅は、料理ごとに変えなければいけません。</b>
      クッキー.js のコメント：「工業製品なので個体差が小さい。
      形の乱数を野菜と同じ幅で振ると『手びねりの粘土』になる。
      乱数は外形 ±6%、厚み ±10% までに抑え、代わりに焼きムラと反りで単調さを消す」。
      骨格を共有するということは、<b>数値の意味まで共有する</b>ことではありません。</p>
    </div>

    <h3>ここまで来たら</h3>
    <p>
      14本のうち好きな1本を選んで、<b>15本目を作ってみてください</b>。
      いちばん近いものをコピーして、CONFIG のプリセットを1つ足すところから始めます。
      おにぎり（ご飯 + 海苔）、ホットケーキ（クッキーの断面 + 焼き色）、
      餃子（掃引 + ひだ）あたりが、既存の骨格に一番近い題材です。
    </p>`,
  tryIt: [
    "上の実験を4つとも切った状態から、1つずつ入れて変化を記録する。",
    "「卵を落とす」だけを入れた状態が、なぜエッグトーストに見えないか説明する。",
    "トースト.js とエッグトースト.js を並べて開き、違う行を探す。",
    "15本目に作りたい料理を1つ決めて、14本のどれをコピー元にするか選ぶ。"
  ]
}

];
