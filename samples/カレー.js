// =====================================================================
//  Photoreal Curry Rice  /  写実的な「カレーライス」
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//  build: curry-rice-2026-09-03-m
//
//  構成:
//    0. CONFIG      … ルウ / 皿 / ライス / 具 のプリセットと寸法
//    1. Rng         … シード付き擬似乱数
//    2. Noise       … 2D/3D 値ノイズ（周期版つき）
//    3. Mesh utils  … 巻き順判定 / 法線溶接 / 一意な name+id
//    4. TexLab      … DynamicTexture 生成の土台と木のテクスチャ一式
//    5. Plate       … 楕円のカレー皿（一定オフセット→比例縮小のブレンド）
//    6. Rice        … 盛りの形と米粒（ご飯.js rice-H の知見を全面的に移植）★
//    7. Chunks      … じゃがいも / にんじん / 牛肉 / 福神漬け
//    8. Submerge    … 上から見た「最上点バッファ」を焼く軟ラスタライザ
//    9. Roux        … ルウ面（降伏応力の縁 / 被覆 max / 油膜 / 香辛料）
//   10. Spoon       … カレースプーン
//   11. Scene       … テーブル / IBL / 湯気 / ACES / DOF
//   12. GUI
//
//  ここでの最重要事項:
//  「カレーは水ではない」ことをどう出すか。
//
//   味噌汁は器に入った水なので、液面は水平な1枚の面でよかった。
//   カレーは平皿の上に置かれた降伏応力流体で、水平面という概念が無い。
//   参考写真を測ると、ルウの縁は羽のように薄くならず、必ず 2〜3mm の
//   丸い土手を作って止まっている。これは表面張力ではなく降伏応力による。
//
//   静止したビンガム流体の平皿上のパドルは
//       ρ g h (dh/dx) = τy      →      h = √(2 τy x / (ρ g))
//   を満たす。縁からの距離 x に対して h が √ で立ち上がるので、
//   縁で接線が垂直になる——これがあの「土手」の正体。
//   高さ場をこの式で作れば、丸い縁は勝手に出てくる。
//
//   さらに、ライスにかかった膜も、沈んだじゃがいもの盛り上がりも、
//   皿底のたまりも、すべて同じ1本の式に入る:
//
//       ルウ面 = max( 皿底 + h(d),  ライス面 + 膜,  具の上面 + 膜 )
//
//   max を取るだけで「たまり」と「膜」が自動的に切り替わる。境界の
//   場合分けは要らない。GUIの「降伏応力 τy」を 0 に寄せるとルウは
//   水になって皿一面へ薄く広がり、40 まで上げると生煮えのルウが
//   こんもり盛り上がって止まる。
//
//  -e → -f の変更点（ライスを ご飯.js(rice-H) に寄せる）:
//   ★ 照明比。key 2.70 / fill 0.19 は比が 14.2 もあった。白い被写体は
//     この比が高いと必ず灰色に見える（反射率 90% の白球でさえそうなる）。
//     露出やアルベドをいくら触っても直らない。2.20 / 0.58 へ。
//   ★ translucency 0.40 → 0.26。Babylon 8 系のこの値は「透けを足す強さ」
//     ではなく拡散反射との配分比で、diffuse *= (1 - t) が掛かる。
//     拡散の4割を捨てていた。
//   ★ 下地（riceBody）に粒と同じマテリアルを貼っていた。水の膜が
//     なめらかな一枚面の上でそのまま鏡面になり、粒のすき間が白い水に見える。
//   ★ 粒間の暗がりの底が 0.30。SSAO・ORM の AO・下地の暗さと四重に
//     掛かって盛り全体が沈んでいた。0.62 へ。
//   ・粒の形（endPow 2.30 は「麦・パスタになる」下限を割っていた）、
//     albedo の青、胴割れの向きと本数、浮いた粒の量、下地の凹凸。
//
//  -f → -g の変更点（レンダーを見ての手直し）:
//   ・ライスの下地が「灰色の素体」として粒のすき間から見えていた。
//     粒の密度を 21 → 31 粒/cm² に上げ（1粒の分割は 18×16 → 16×14 に
//     落として三角形の総数は据え置き）、沈める量を 0.52mm → 0.30mm、
//     下地のアルベドを米の 0.62 倍 → 0.86 倍にした。
//   ・ウィンナーが小さすぎた。4.1cm × 1.15cm → 5.7cm × 1.64cm。
//   ・具が少なすぎた。個数をおよそ倍にし、あわせて置き場所の棄却
//     （縁からの距離・具どうしの間隔・沈める割合）を緩めた。
//   ・スプーンが「幅広の平たいヘラ」だった。柄にくびれを入れ、
//     つぼのくぼみを 1.4mm → 10.8mm に掘り直した。
//   ・玉ねぎを、煮崩れた薄い膜から くし切りの一片へ（肉じゃが.js 由来）。
//
//  -g → -h の変更点（レンダーを見ての手直し）:
//   ・スプーンの先が尖っていた。つぼの先は半径 2cm の円弧（＝最大幅と
//     同じ半径）で丸い。テーパーで済ませると必ず木の葉になる。
//     柄の端とつぼの先で丸まり方を分けた。
//   ・福神漬けが「赤い花形」だった。周期的な波（歯車状のロブ）をやめ、
//     乱数で角を打った多角形を直線の辺で結ぶ形に。あわせて、ごはんへ
//     突き刺さって見えたのを直した（下地の高さを外周まで測り、
//     浮いた粒のぶんも足して座らせる）。
//   ・玉ねぎを飴色（炒めたもの）へ。青を 0.62 → 0.22 倍まで落とす。
//   ・水際のルウが染みた粒が、灰茶色の帯として浮いていた。ルウの地色
//     そのものへ寄せ、染まる高さの範囲も詰めた。
//
//  -h → -i の変更点（福神漬けを物理で盛る）:
//   ・福神漬けが空中に浮いていた。薄片を解析的に座らせるのは、平らな
//     下地なら簡単だが、ごはんの盛りは斜面なので破綻する。真下1点で
//     測ると山側の端が潜り、外周まで測って高いほうを採ると、片の端が
//     かすっただけでごはんの頂点の高さまで丸ごと持ち上がって浮く。
//     「面と面が当たる」という条件は1点の高さでは書けない。
//     Havok に凸包を落として解かせる形へ変えた（createScene は async に）。
//   ・あわせて、添える場所を裾（傾き 35°）から内側（22°）へ寄せた。
//     漬物の摩擦（0.92 ≒ 43°）で止まる斜面でないと、落とした先から
//     滑って皿へ流れ落ちる。
//
//  -i → -j の変更点（配置と色）:
//   ・福神漬けを皿の端へ。落とす場所をライスの裾（u≈0.99）に戻した。
//     裾は 35°で止まらないが、物理で落としているいまは止まる必要が無い。
//     滑り落ちた先の平らな見込みで、山のふもとに寄り集まって溜まる。
//   ・スプーンを手前（カメラ側 = -z）へ。画角で卓の面が切れるのは
//     z ≒ -12.5 なので、そのすこし内側の z = -11.8 に置く。
//   ・玉ねぎがまだルウより 1.6 倍明るく浮いていた。地色をルウの明るい
//     ムラと同じ明るさまで落とし、あわせて じゃがいも・肉と同じ式で
//     ルウの被膜を着せた（玉ねぎだけ膜が無かったのが、色を合わせても
//     「あとから貼りつけた別の絵」に見えた本当の理由）。
//   ・スプーンの向きを左右反対（つぼが左・柄が右）に。
//   ・福神漬けの枚数を倍に（GLOBAL.fukujinCount）。湧かせる範囲も
//     √枚数 で広げないと、細い塔になってから崩れる。
//   ・福神漬けの上に米粒が飛び出していた。下地の高さを「盛りの面 ＋
//     半粒」で見積もっていたが、大きく起こした粒はそこより 1.6mm 上に
//     出る。置いた粒の姿勢から上端を実測して格子へ焼き、それを
//     当たり判定の板の高さにした。
// =====================================================================

// 【変更】福神漬けの盛り付けを Havok に渡したので、HavokPhysics() を
//         待つ必要がある。Playground は async な createScene をそのまま
//         受け付ける
var createScene = async function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    // 単位系: 1 unit = 1 cm。米粒や皮の厚みは mm で書きたいので定数を持つ
    const MM = 0.1;

    // ---- ルウのプリセット --------------------------------------------
    // 色はすべて sRGB。参考写真の実測（ハイライトを除いた地の部分）:
    //   明部 [0.545, 0.318, 0.140] / 中央値 [0.402, 0.198, 0.078]
    //   暗部 [0.212, 0.092, 0.034]
    // 【対策】カレーを「茶色」だと思って G と B を揃えると、たちまち
    //         味噌かデミグラスになる。実物は B が R の 1/5 しかない。
    //         赤と黄の間のかなり彩度の高い色で、暗くしても濁らせない
    const ROUX = {
        pork: {
            label: "ポーク（家庭）",
            // 実測（参照写真4枚をサンプル）: 中間色 sRGB(0.50〜0.68, 0.26〜0.38,
            // 0.00〜0.14)。G/R が 0.55 前後、B/R が 0.12 前後で、青がほとんど
            // 無い橙褐色。青を上げると途端に「デミグラス」になる
            base: [0.455, 0.250, 0.062],   // 地色（アルベド）
            deep: [0.272, 0.122, 0.034],   // ムラの濃い側（暗部ほど赤へ寄る）
            pale: [0.606, 0.360, 0.098],   // ムラの淡い側
            sigma: 6.0,                    // 消散係数 [1/cm]（沈んだ具の見え方）
            sigmaBed: 34.0,                // 輸送消散 [1/cm]（皿が透ける薄さ）
            tauY: 16.0,                    // 降伏応力 [Pa]
            pool: 0.95,                    // たまりの最大深さ [cm]
            film: 0.135,                   // 被覆膜の厚さ [cm]
            rough: 0.415,                  // 表面（＝clearCoat）の粗さ
            oil: 1.00,                     // 油膜の量
            spice: 0.85,                   // 香辛料の粒立ち
            skin: 0.30                     // 冷めかけの膜（つやが落ちる）
        },
        beef: {
            label: "ビーフ（欧風）",
            base: [0.292, 0.142, 0.054],
            deep: [0.162, 0.068, 0.026],
            pale: [0.438, 0.242, 0.092],
            sigma: 9.5, sigmaBed: 48.0, tauY: 22.0, pool: 1.05, film: 0.155,
            rough: 0.345, oil: 1.25, spice: 0.45, skin: 0.20
        },
        keema: {
            label: "キーマ",
            base: [0.488, 0.256, 0.062],
            deep: [0.308, 0.132, 0.032],
            pale: [0.630, 0.372, 0.100],
            sigma: 12.0, sigmaBed: 56.0, tauY: 34.0, pool: 0.80, film: 0.180,
            rough: 0.520, oil: 0.70, spice: 1.35, skin: 0.45
        },
        soup: {
            label: "スープカレー",
            base: [0.502, 0.278, 0.078],
            deep: [0.342, 0.160, 0.044],
            pale: [0.648, 0.398, 0.128],
            // 【対策】τy を 0 にすると h = √(0) = 0 で膜が消え、ルウが
            //         まるごと無くなる。スープでも縁は 1mm 立つので下限を置く
            sigma: 3.2, sigmaBed: 18.0, tauY: 2.4, pool: 1.25, film: 0.055,
            rough: 0.205, oil: 1.55, spice: 0.60, skin: 0.05
        }
    };

    // ---- 皿のプリセット ----------------------------------------------
    const PLATES = {
        white: {
            label: "白磁",
            albedo: [0.855, 0.848, 0.832], rough: 0.115,
            // 【対策】真っ白（0.93）にすると、露出を合わせた時点でリムが
            //         飛んでカレーとの境が消える。業務用の白磁は実測 0.85 前後
            speck: 0.12, crazeAmt: 0.10, rimBand: null
        },
        cobalt: {
            label: "呉須の線",
            albedo: [0.838, 0.836, 0.826], rough: 0.105,
            speck: 0.10, crazeAmt: 0.14,
            rimBand: { col: [0.126, 0.196, 0.392], at: 0.68, w: 0.20, blur: 0.35 }
        },
        amber: {
            label: "飴釉",
            // 実物の飴釉は暗いが、sRGB 0.10 まで落とすとリニアで 0.010 になり
            // 形が読めなくなる。反射率 8% ≒ sRGB 0.31 が下限
            albedo: [0.352, 0.238, 0.148], rough: 0.145,
            speck: 0.30, crazeAmt: 0.34, rimBand: null
        }
    };

    // ---- 具のプリセット ----------------------------------------------
    const CHUNKS = {
        // 玉ねぎの枚数が多いのは、大半が沈んでメッシュにならないから。
        // 沈んだ玉ねぎはルウ面のアルベドへ淡い影として焼かれるだけで、
        // 三角形は 1 枚も増えない。実物のカレーで面がのっぺりしないのは
        // ほぼこの「溶けかけの玉ねぎ」のせい
        // 【対策】芋3・人参4・牛4 では、沈める分（3割）と置き場所の
        //         棄却を引いたあと皿に顔を出すのが5〜6個しかなく、
        //         「具の入っていないカレー」に見える。実物の一皿には
        //         野菜と肉で15〜20個は入っている。数を倍に増やし、
        //         あわせて棄却の条件も緩める（placeChunks を参照）
        standard: {
            label: "定番（芋・人参・牛）",
            potato: 6, carrot: 7, meat: 8, onion: 14, wiener: 0
        },
        veg: { label: "野菜多め", potato: 8, carrot: 10, meat: 3, onion: 20, wiener: 0 },
        meat: { label: "肉多め", potato: 4, carrot: 4, meat: 14, onion: 10, wiener: 0 },
        wiener: { label: "ウィンナー入り", potato: 5, carrot: 6, meat: 4, onion: 12, wiener: 5 },
        none: { label: "具なし", potato: 0, carrot: 0, meat: 0, onion: 0, wiener: 0 }
    };

    // ---- 皿の断面 -----------------------------------------------------
    // D = 外周からの内向き距離 [cm]、y = 高さ [cm]（テーブル面が y=0）
    // 直径 26cm × 19.5cm の楕円皿。カレー皿は縁が広く、見込みが浅い
    const GLOBAL = {
        plateA: 13.00,        // 長半径
        plateB: 9.75,         // 短半径
        plateN: 2.35,         // 超楕円の指数（2 = 楕円、大きいほど角ばる）
        plateSectors: 224,    // 周方向の分割
        // 一定オフセット → 比例縮小へ切り替える D の範囲。
        // 【対策】ここを見込みの斜面に重ねると、短軸側だけ斜面が半分の幅に
        //         なって「潰れた皿」に見える。切り替えは必ず平らな見込みの
        //         底の上でやる（平面なら等高線の間隔が変わっても見えない）
        plateDmax: 10.50,     // 等高線が1点へ潰れる D（＝内向きパラメータの上限）
        blendD0: 3.90,
        blendD1: 6.40,

        rimY: 3.05,           // リムの高さ
        wellY: 1.02,          // 見込みの底
        wallD: 3.55,          // 見込みの底が始まる D
        rimInnerD: 1.95,      // リムの内側の端
        edgeD: 0.26,          // 縁の丸めが始まる D
        thick: 0.56,          // 皿の肉厚
        footOutD: 4.30, footInD: 5.10,   // 高台（外 17.3cm / 内 15.8cm）
        footY: 0.00,

        // ---- ライス ----
        riceCX: -3.30, riceCZ: 0.00,     // 盛りの中心（皿の左寄り）
        riceAX: 6.55, riceAZ: 5.35,      // 盛りの半径（長／短）
        ricePeak: 2.55,                  // 見込みの底からの高さ
        riceLump: 0.150,                 // しゃもじのうねり
        riceScoop: 0.115,                // 盛り付けの筋（しゃもじの背の跡）
        // 【対策】21粒/cm² では粒のすき間から下地が見えて「灰色の素体」に
        //         なる。下地を明るくするだけだと今度は谷が消えて平らな
        //         白い塊になるので、まず粒を増やすのが正しい直し方。
        //         1粒あたりの分割を 18×16 → 16×14 に落として、
        //         三角形の総数はほぼ据え置きにする
        grainDensity: 31.0,              // 粒の面密度 [粒/cm²]
        grainVariants: 8,
        grainRings: 16, grainSides: 14,

        // ---- ルウ ----
        pourCX: 4.30, pourCZ: 0.10,      // かけた中心
        pourWobble: 0.115,               // 縁の不規則さ
        climbY: 2.05,                    // ルウがライスを登りきる高さ [cm]（絶対値）
        rouxRings: 84, rouxSectors: 200,
        rouxTex: 640,
        subGrid: 320,                    // 最上点バッファの解像度
        drain: 0.62,                     // 具から流れ落ちる膜の減衰長 [cm]

        fukujin: true,                   // 福神漬け
        fukujinPhysics: true,            // 福神漬けを Havok で落として盛る
        fukujinCount: 44,                // 落とす薄片の枚数（±12 で振れる）
        spoon: true,

        // ---- 描画 ----
        useSSAO: true,
        useDOF: true,
        dofFStop: 2.8,
        dofRatio: 0.072,
        // 【対策】GUI 専用カメラに分ければ UI はボケなくなるが、Inspector の
        //         Physics Helper / 選択ハイライト / ピッカーが3系統まとめて
        //         壊れる。Layer.applyPostProcess = false なら2台目を作らずに
        //         済むので、既定はこちら
        guiOwnCamera: false
    };

    // 物性値。GUI から触るのは τy だけだが、式の出どころを残しておく
    const RHO = 1050;         // ルウの密度 [kg/m³]
    const GRAV = 9.81;        // [m/s²]

    // ---- 福神漬けの盛り付け（物理）------------------------------------
    // 【対策】薄片を解析的に座らせるのは、平らな下地なら簡単だが、
    //         ごはんの盛りは斜面なので破綻する。真下1点で測ると山側の端が
    //         潜り、外周まで測って高いほうを採ると、片の端がかすっただけで
    //         ごはんの頂点の高さまで丸ごと持ち上がって空中に浮く（実際に出た）。
    //         「面と面が当たる」という条件は 1 点の高さでは書けない。
    //         凸包を落として当たり判定に解かせるのが唯一まっとうな解
    const FK_PHYS = {
        gravity: -981,        // cm/s²（長さの単位が cm なので 9.81 m/s² = 981）
        dt: 1 / 120,
        wave: 5, waveSteps: 28,   // 一度に落とす枚数と、そのあと進めるステップ
        finalSteps: 260,
        dropGap: 0.70,        // 積み上がった高さから何cm 上で湧かせるか
        mass: 0.0016,
        // 【対策】漬物は濡れていて、ごはんの粒に食い込んで止まる。
        //         摩擦 0.5 だと 20°の斜面でも滑り落ちて皿へ流れる
        friction: 0.92, restitution: 0.0, lin: 0.60, ang: 0.85,
        colliderR: 4.2,       // 当たり判定を作る範囲（福神漬けの中心から）[cm]
        colliderN: 40
    };

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;

    // =================================================================
    // 1. Rng : mulberry32
    // =================================================================
    class Rng {
        constructor(seed) { this.s = seed >>> 0; }
        next() {
            this.s = (this.s + 0x6D2B79F5) | 0;
            let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
        range(a, b) { return a + (b - a) * this.next(); }
        gauss(mean, sd) {
            const u = Math.max(1e-9, this.next()), v = this.next();
            return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
        }
        int(n) { return Math.floor(this.next() * n) % n; }
    }

    // ---- 小物 --------------------------------------------------------
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    // sRGB → リニア。PBRMaterial の色と頂点カラーはリニア空間
    const s2l = (c) => (c <= 0.04045) ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const l2s = (v) => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    const col3 = (a) => new BABYLON.Color3(s2l(a[0]), s2l(a[1]), s2l(a[2]));

    // =================================================================
    // 2. Noise
    // =================================================================
    const Noise = {
        _h2(x, y, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
            return (h >>> 0) / 4294967295;
        },
        _h3(x, y, z, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
                ^ Math.imul(z | 0, 1274126177) ^ Math.imul(seed | 0, 2166136261);
            h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
            return (h >>> 0) / 4294967295;
        },
        v2(x, y, seed) {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            const a = this._h2(xi, yi, seed), b = this._h2(xi + 1, yi, seed);
            const c = this._h2(xi, yi + 1, seed), d = this._h2(xi + 1, yi + 1, seed);
            const t0 = a + (b - a) * u, t1 = c + (d - c) * u;
            return t0 + (t1 - t0) * v;
        },
        fbm2(x, y, seed, oct) {
            let s = 0, a = 0.5, f = 1, n = 0;
            for (let o = 0; o < oct; o++) { s += a * this.v2(x * f, y * f, seed + o * 131); n += a; f *= 2; a *= 0.5; }
            return s / n;
        },
        // 【対策】x 方向しか折り返さないノイズでタイリング用テクスチャを焼くと、
        //         上下の継ぎ目に横一文字の線が出る。両軸とも折り返す
        v2p(x, y, px, py, seed) {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            const p = Math.max(1, px | 0), q = Math.max(1, py | 0);
            let x0 = xi % p; if (x0 < 0) x0 += p;
            let x1 = (xi + 1) % p; if (x1 < 0) x1 += p;
            let y0 = yi % q; if (y0 < 0) y0 += q;
            let y1 = (yi + 1) % q; if (y1 < 0) y1 += q;
            const a = this._h2(x0, y0, seed), b = this._h2(x1, y0, seed);
            const c = this._h2(x0, y1, seed), d = this._h2(x1, y1, seed);
            const t0 = a + (b - a) * u, t1 = c + (d - c) * u;
            return t0 + (t1 - t0) * v;
        },
        fbm2p(x, y, px, py, seed, oct) {
            let s = 0, a = 0.5, f = 1, n = 0;
            for (let o = 0; o < oct; o++) {
                s += a * this.v2p(x * f, y * f, (px * f) | 0, (py * f) | 0, seed + o * 131);
                n += a; f *= 2; a *= 0.5;
            }
            return s / n;
        },
        // 周方向（u）だけ折り返す。回転体・楕円皿のリム用
        v2u(x, y, px, seed) {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            const p = Math.max(1, px | 0);
            let x0 = xi % p; if (x0 < 0) x0 += p;
            let x1 = (xi + 1) % p; if (x1 < 0) x1 += p;
            const a = this._h2(x0, yi, seed), b = this._h2(x1, yi, seed);
            const c = this._h2(x0, yi + 1, seed), d = this._h2(x1, yi + 1, seed);
            const t0 = a + (b - a) * u, t1 = c + (d - c) * u;
            return t0 + (t1 - t0) * v;
        },
        fbm2u(x, y, period, seed, oct) {
            let s = 0, a = 0.5, f = 1, n = 0;
            for (let o = 0; o < oct; o++) {
                s += a * this.v2u(x * f, y * f, (period * f) | 0, seed + o * 131);
                n += a; f *= 2; a *= 0.5;
            }
            return s / n;
        },
        v3(x, y, z, seed) {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            const xf = x - xi, yf = y - yi, zf = z - zi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
            const H = this._h3;
            const c000 = H(xi, yi, zi, seed), c100 = H(xi + 1, yi, zi, seed);
            const c010 = H(xi, yi + 1, zi, seed), c110 = H(xi + 1, yi + 1, zi, seed);
            const c001 = H(xi, yi, zi + 1, seed), c101 = H(xi + 1, yi, zi + 1, seed);
            const c011 = H(xi, yi + 1, zi + 1, seed), c111 = H(xi + 1, yi + 1, zi + 1, seed);
            const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
            const x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
            const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
            return y0 + (y1 - y0) * w;
        },
        fbm3(x, y, z, seed, oct) {
            let s = 0, a = 0.5, f = 1, n = 0;
            for (let o = 0; o < oct; o++) { s += a * this.v3(x * f, y * f, z * f, seed + o * 137); n += a; f *= 2; a *= 0.5; }
            return s / n;
        }
    };

    // =================================================================
    // 3. Mesh utils
    // =================================================================
    // 【対策】Babylon の Node コンストラクタは id = name を入れるだけで、
    //         同名メッシュを複数作ると id が重複する。Inspector の
    //         Scene Explorer は id でツリーを引くので、選択が別の物へ飛ぶ。
    //         name と id の両方を明示的に一意にする
    let _uid = 0;
    function named(mesh, base) {
        mesh.name = base;
        mesh.id = base + "#" + (++_uid);
        return mesh;
    }

    // 角度の最短差
    function angDist(a, b) {
        let d = Math.abs(a - b) % TAU;
        return d > Math.PI ? TAU - d : d;
    }

    // 巻き順の自動判定。center から refIndex 番の頂点への向きと法線の内積で見る。
    // 【対策】VertexData.ComputeNormals は (v0-v1)×(v2-v1) で、右手系の
    //         外積とは符号が逆になる。規約を決め打ちすると必ずどこかで裏返る。
    //         summed = true なら全頂点の総和で判定する（形が読みにくいもの用）
    function finalize(positions, indices, center, refIndex, summed) {
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        let dot = 0;
        if (summed) {
            for (let i = 0; i < positions.length; i += 3) {
                dot += normals[i] * (positions[i] - center.x)
                    + normals[i + 1] * (positions[i + 1] - center.y)
                    + normals[i + 2] * (positions[i + 2] - center.z);
            }
        } else {
            const k = refIndex * 3;
            dot = normals[k] * (positions[k] - center.x)
                + normals[k + 1] * (positions[k + 1] - center.y)
                + normals[k + 2] * (positions[k + 2] - center.z);
        }
        if (dot < 0) {
            for (let i = 0; i < indices.length; i += 3) {
                const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t;
            }
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        return normals;
    }

    // 位置が一致する頂点の法線を平均する。継ぎ目の十字の筋を消す
    function weldNormals(positions, normals) {
        const map = new Map();
        const n = positions.length / 3;
        for (let i = 0; i < n; i++) {
            const k = Math.round(positions[i * 3] * 8192) + "," +
                Math.round(positions[i * 3 + 1] * 8192) + "," +
                Math.round(positions[i * 3 + 2] * 8192);
            let a = map.get(k); if (!a) { a = []; map.set(k, a); }
            a.push(i);
        }
        for (const a of map.values()) {
            if (a.length < 2) continue;
            let nx = 0, ny = 0, nz = 0;
            for (const i of a) { nx += normals[i * 3]; ny += normals[i * 3 + 1]; nz += normals[i * 3 + 2]; }
            const l = Math.hypot(nx, ny, nz) || 1;
            for (const i of a) { normals[i * 3] = nx / l; normals[i * 3 + 1] = ny / l; normals[i * 3 + 2] = nz / l; }
        }
    }

    // 単調3次エルミート（Fritsch–Carlson）。
    // 【対策】Catmull-Rom は制御点の間で行き過ぎることがあり、皿の断面では
    //         「リムが一度外へ膨らんでから戻る」不自然な段が出る
    function monoSpline(xs, ys) {
        const n = xs.length;
        const d = new Float64Array(n - 1), m = new Float64Array(n);
        for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
        m[0] = d[0]; m[n - 1] = d[n - 2];
        for (let i = 1; i < n - 1; i++) m[i] = (d[i - 1] * d[i] <= 0) ? 0 : (d[i - 1] + d[i]) * 0.5;
        for (let i = 0; i < n - 1; i++) {
            if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
            const a = m[i] / d[i], b = m[i + 1] / d[i], q = a * a + b * b;
            if (q > 9) { const t = 3 / Math.sqrt(q); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
        }
        return function (x) {
            if (x <= xs[0]) return ys[0];
            if (x >= xs[n - 1]) return ys[n - 1];
            let lo = 0, hi = n - 1;
            while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
            const h = xs[hi] - xs[lo], t = (x - xs[lo]) / h, t2 = t * t, t3 = t2 * t;
            return ys[lo] * (2 * t3 - 3 * t2 + 1) + m[lo] * h * (t3 - 2 * t2 + t)
                + ys[hi] * (-2 * t3 + 3 * t2) + m[hi] * h * (t3 - t2);
        };
    }

    function makeMesh(name, positions, indices, normals, uvs, colors, scene) {
        const mesh = named(new BABYLON.Mesh(name, scene), name);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals;
        if (uvs) vd.uvs = uvs;
        if (colors) vd.colors = colors;
        vd.applyToMesh(mesh, false);
        // 【対策】頂点カラーを stride 4 で入れると Babylon が hasVertexAlpha を
        //         立て、不透明のはずのメッシュが透過パスへ回る。透過パスは
        //         深度書き込みが切られるので、ルウ面がじゃがいもを隠せなくなる
        mesh.hasVertexAlpha = false;
        mesh.tris = indices.length / 3;
        return mesh;
    }

    // 最上点が target になるよう鉛直に平行移動する
    function liftTo(positions, nV, target) {
        let maxY = -1e9;
        for (let i = 0; i < nV; i++) if (positions[i * 3 + 1] > maxY) maxY = positions[i * 3 + 1];
        const dy = target - maxY;
        for (let i = 0; i < nV; i++) positions[i * 3 + 1] += dy;
        return dy;
    }

    // 頂点群の最下点
    function minY(positions, nV) {
        let m = 1e9;
        for (let i = 0; i < nV; i++) if (positions[i * 3 + 1] < m) m = positions[i * 3 + 1];
        return m;
    }

    // =================================================================
    // 4. TexLab : DynamicTexture 生成の土台
    // =================================================================
    const TexLab = {
        _tex(name, w, h, fill, scene, linear, clampAll) {
            // 【対策】createImageData は整数しか受け付けない。設定の消し忘れで
            //         undefined が来ると "Value is not of type 'long'" で落ちる
            w = Math.max(8, Math.round(w) || 512);
            h = Math.max(8, Math.round(h) || 512);
            const dt = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(w, h);
            fill(img.data, w, h);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = false;
            dt.wrapU = clampAll ? BABYLON.Texture.CLAMP_ADDRESSMODE : BABYLON.Texture.WRAP_ADDRESSMODE;
            dt.wrapV = clampAll ? BABYLON.Texture.CLAMP_ADDRESSMODE : BABYLON.Texture.WRAP_ADDRESSMODE;
            // 【対策】ORM と法線は「色」ではない。既定の gammaSpace = true のままだと
            //         粗さ 0.26 が線形 0.06 として渡り、狙いよりつやつやになる
            if (linear) dt.gammaSpace = false;
            dt.anisotropicFilteringLevel = 16;
            return dt;
        },
        // 【対策】1024² を素直に走らせると 3D ノイズの評価だけで1秒を超える。
        //         うねり・節・ろくろ目は周期が cm 単位なので、1/4 の格子で
        //         作って双一次で引き伸ばしても見た目は変わらない
        coarse(N, step, wrapX, fn) {
            const C = Math.ceil(N / step) + 1;
            const small = new Float32Array(C * C);
            for (let j = 0; j < C; j++) {
                const sy = Math.min(N - 1, j * step);
                for (let i = 0; i < C; i++) {
                    const sx = wrapX ? ((i * step) % N) : Math.min(N - 1, i * step);
                    small[j * C + i] = fn(sx, sy);
                }
            }
            const out = new Float32Array(N * N);
            for (let y = 0; y < N; y++) {
                const fy = y / step;
                const jy = Math.min(C - 2, Math.floor(fy)), ty = fy - jy;
                const r0 = jy * C, r1 = (jy + 1) * C;
                for (let x = 0; x < N; x++) {
                    const fx = x / step;
                    const ix = Math.min(C - 2, Math.floor(fx)), tx = fx - ix;
                    const a0 = small[r0 + ix], b0 = small[r0 + ix + 1];
                    const a1 = small[r1 + ix], b1 = small[r1 + ix + 1];
                    const t0 = a0 + (b0 - a0) * tx, t1 = a1 + (b1 - a1) * tx;
                    out[y * N + x] = t0 + (t1 - t0) * ty;
                }
            }
            return out;
        },
        // 年輪1本ぶんの濃さ。
        // 【対策】|sin(ρπ)|^k の縞は等間隔・等強度になり、段ボールの筋にしか
        //         見えない。整数の輪番号をハッシュして、輪ごとに幅・濃さを配る
        ring(rho, seed) {
            const n = Math.floor(rho), f = rho - n;
            const h1 = Noise._h2(n, 0, seed), h2 = Noise._h2(n, 1, seed), h3 = Noise._h2(n, 2, seed);
            const w = 0.09 + 0.30 * h2 * h2;
            const c = 0.16 + 0.84 * h1 * h1;
            const p = 0.55 + 0.35 * h3;
            let d = Math.abs(f - p); if (d > 0.5) d = 1 - d;
            return c * (1 - smooth(w * 0.30, w, d));
        },
        // 高さ場 → 接空間法線。周期境界で参照する
        normalFromHeight(name, N, H, strength, scene, clampAll) {
            return this._tex(name, N, N, (d) => {
                for (let y = 0; y < N; y++) {
                    const yu = ((y - 1 + N) % N) * N, yd = ((y + 1) % N) * N, yc = y * N;
                    for (let x = 0; x < N; x++) {
                        const xl = H[yc + ((x - 1 + N) % N)], xr = H[yc + ((x + 1) % N)];
                        const hu = H[yu + x], hd = H[yd + x];
                        // 【対策】v 方向は (hd - hu)。Babylon の接空間は V が下向き
                        let nx = (xl - xr) * strength, ny = (hd - hu) * strength, nz = 1;
                        const l = Math.hypot(nx, ny, nz);
                        const i = (yc + x) * 4;
                        d[i] = (nx / l * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny / l * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz / l * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene, true, clampAll);
        }
    };

    // ---- 木のテクスチャ一式（テーブル用） -----------------------------
    // 【対策】アルベド・ORM・法線でノイズを引き直すと、同じ 640² を3回走査
    //         することになり、しかも粒の位置がずれて「ざらざらの上に
    //         ぼんやりした汚れが乗った」ように見える。高さ場を1枚作って共有する
    function woodSet(scene, tag, N, seed, o) {
        N = Math.max(64, Math.round(N) || 512);
        const n2 = N * N;
        const grain = new Float32Array(n2);   // 年輪の濃さ 0..1
        const fine = new Float32Array(n2);    // 導管の細い筋
        const wave = TexLab.coarse(N, 4, true, (x, y) => {
            const u = x / N, v = y / N;
            return Noise.fbm2p(u * 3.1, v * 3.1, 4, 4, seed + 7, 3);
        });
        const knot = TexLab.coarse(N, 4, true, (x, y) => {
            const u = x / N, v = y / N;
            return Noise.fbm2p(u * 2.0, v * 2.0, 2, 2, seed + 41, 2);
        });
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const k = y * N + x;
                // across = 木目を画面の横方向に走らせる
                const a = o.across ? (y / N) : (x / N);
                const b = o.across ? (x / N) : (y / N);
                const rho = (a + (wave[k] - 0.5) * o.wave * 0.30
                    + (knot[k] - 0.5) * o.knot * 0.55) * o.rings;
                grain[k] = Math.pow(TexLab.ring(rho, seed + 13), o.sharp * 0.5);
                fine[k] = Noise.fbm2p(b * 8 + 3, a * 210, 8, 210, seed + 61, 2);
            }
        }
        const H = new Float32Array(n2);
        for (let k = 0; k < n2; k++) H[k] = clamp(0.5 - grain[k] * 0.42 + (fine[k] - 0.5) * 0.16, 0, 1);

        const albedo = TexLab._tex(tag + "A", N, N, (d) => {
            for (let k = 0; k < n2; k++) {
                const g = grain[k], f = (fine[k] - 0.5);
                let c = mix3(o.base, o.grain, clamp(g * 1.15, 0, 1));
                c = mix3(c, o.dark, clamp((g - 0.55) * 1.8, 0, 1) * 0.7);
                const w = 1 + f * 0.10;
                const i = k * 4;
                d[i] = clamp(c[0] * w, 0, 1) * 255;
                d[i + 1] = clamp(c[1] * w, 0, 1) * 255;
                d[i + 2] = clamp(c[2] * w, 0, 1) * 255;
                d[i + 3] = 255;
            }
        }, scene, false, false);

        const orm = TexLab._tex(tag + "O", N, N, (d) => {
            for (let k = 0; k < n2; k++) {
                const g = grain[k];
                // 導管（濃い年輪）は塗料を吸って粗い
                const ro = clamp(o.rough + g * 0.20 + (fine[k] - 0.5) * 0.06, 0.05, 0.95);
                const i = k * 4;
                d[i] = clamp(1 - g * 0.16, 0, 1) * 255;
                d[i + 1] = ro * 255; d[i + 2] = 0; d[i + 3] = 255;
            }
        }, scene, true, false);

        const normal = TexLab.normalFromHeight(tag + "N", N, H, o.bump * 2.2, scene, false);
        return { albedo, orm, normal };
    }

    // =================================================================
    // 5. Plate : 楕円のカレー皿
    // =================================================================
    // これまでの器はすべて回転体だった。カレー皿は楕円で、しかも
    // リムの幅が全周で一定でなければならない。この2つは素朴には両立しない。
    //
    //   (a) 等高線を比例縮小する（R = R0 * s）と、リム幅が R0 に比例して
    //       変わる。長軸 13cm / 短軸 9.75cm の皿ではリム幅が 1.33 倍違い、
    //       「丸皿を引き伸ばした型抜き」に見える
    //   (b) 等高線を内向きに一定距離オフセットするとリム幅は一定になるが、
    //       短軸側が先に潰れて中心へ到達できず、見込みの底が張れない
    //
    // そこで両者をブレンドする。要点は【切り替えを平らな場所でやる】こと。
    // 見込みの底は平面なので、そこで等高線の間隔が変わっても絵には出ない。
    // 斜面に重ねると短軸側だけ斜面が半分の幅になって即座に破綻する。
    //
    //   R(θ, D) = R0(θ) - D * mix( 1, R0(θ)/Dmax, φ(D) )
    //   φ(D) = smoothstep(blendD0, blendD1, D)
    //
    // φ=0 で一定オフセット、φ=1 で D=Dmax の1点へ収束する比例縮小。
    // ブレンド幅が狭すぎると mix の変化率が勝って R が途中で増加に転じ、
    // 等高線が自己交差する。単調性の条件は
    //   m(D) > D * κ * φ'(D)      ( κ = 1 - Rmin/Dmax )
    // Dmax を長半径より少し大きい 10.5 に取ると κ = 0.071 まで下がり、
    // 幅 2.5cm のブレンドで余裕をもって単調になる（検証済み）。
    function seRadius(th, G) {
        const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
        return Math.pow(Math.pow(c / G.plateA, G.plateN)
            + Math.pow(s / G.plateB, G.plateN), -1 / G.plateN);
    }
    function contourR(th, D, G) {
        const r0 = seRadius(th, G);
        const phi = smooth(G.blendD0, G.blendD1, D);
        return r0 - D * (1 - phi * (1 - r0 / G.plateDmax));
    }
    // 逆問題: (x,z) がどの D の等高線に乗っているか。R は D について
    // 単調減少なので二分法で確実に解ける
    function contourD(x, z, G) {
        const r = Math.hypot(x, z);
        if (r < 1e-6) return G.plateDmax;
        const th = Math.atan2(z, x);
        if (r >= contourR(th, 0, G)) return 0;
        let lo = 0, hi = G.plateDmax;
        for (let i = 0; i < 30; i++) {
            const mid = (lo + hi) * 0.5;
            if (contourR(th, mid, G) > r) lo = mid; else hi = mid;
        }
        return (lo + hi) * 0.5;
    }

    // ---- 断面 ---------------------------------------------------------
    // 上面は単調3次エルミートで滑らかに、裏面は高台の角を出すため折れ線で持つ
    function plateProfiles(G) {
        const rim = G.rimY, well = G.wellY, th = G.thick;
        const edgeY = rim - th * 0.5;          // 外縁の丸めの中心
        const topD = [0, 0.09, G.edgeD, 0.55, 1.10, G.rimInnerD, 2.35, 2.72,
            3.10, 3.38, G.wallD, 4.10, 5.20, 7.00, G.plateDmax];
        const topY = [edgeY, rim - 0.085, rim, rim - 0.006, rim - 0.020, rim - 0.105,
            rim - 0.44, rim - 0.92,
            well + 0.52, well + 0.185, well + 0.030, well + 0.002, well, well, well];
        const top = monoSpline(topD, topY);

        // 裏面（D は 0 → Dmax）。高台は角を落として 3 点で作る
        const uY = well - th;                  // 見込みの裏
        const bot = [
            [0, edgeY],
            [0.085, rim - th + 0.055], [G.edgeD, rim - th], [0.62, rim - th - 0.012],
            [G.rimInnerD, rim - th - 0.055],
            [2.45, rim - th - 0.42], [3.05, well - th + 0.44], [G.wallD, well - th + 0.055],
            [4.05, uY + 0.004],
            // 高台。外壁 → 底 → 内壁
            [G.footOutD - 0.10, uY], [G.footOutD, uY - 0.14],
            [G.footOutD + 0.11, G.footY + 0.055], [G.footOutD + 0.20, G.footY],
            [G.footInD - 0.20, G.footY], [G.footInD - 0.09, G.footY + 0.055],
            [G.footInD, uY - 0.14], [G.footInD + 0.10, uY],
            [6.20, uY + 0.030], [8.00, uY + 0.055], [G.plateDmax, uY + 0.062]
        ];
        return { top: top, topD: topD, bot: bot, edgeY: edgeY };
    }

    // 断面ループ（中心・上 → 外縁 → 中心・裏）を D の列として作る。
    // 【対策】等分に刻むと、平らな見込みに大量の帯が並ぶ一方で、
    //         リムの丸めと見込みの立ち上がりが数枚で済まされて角ばる。
    //         曲率の大きいところだけ細かく刻む
    function plateLoop(G) {
        const P = plateProfiles(G);
        const topDs = [];
        // 中心 → 見込み → 立ち上がり → リム → 外縁（D が減る向き）
        const coarse = [G.plateDmax, 9.4, 8.3, 7.2, 6.3, 5.5, 4.8, 4.35, 4.05, 3.80, G.wallD];
        for (const d of coarse) topDs.push(d);
        for (let d = 3.44; d > G.rimInnerD; d -= 0.11) topDs.push(d);
        topDs.push(G.rimInnerD);
        for (let d = 1.80; d > G.edgeD; d -= 0.16) topDs.push(d);
        for (let d = G.edgeD; d > 0.0001; d -= 0.035) topDs.push(d);
        topDs.push(0);

        const loop = [];
        for (const d of topDs) loop.push({ D: d, y: P.top(d), top: true });
        // 裏面（D が増える向き）。折れ線を細分する
        const bot = P.bot;
        for (let i = 0; i < bot.length - 1; i++) {
            const a = bot[i], b = bot[i + 1];
            const seg = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.16));
            for (let k = 1; k <= seg; k++) {
                const t = k / seg;
                loop.push({ D: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, top: false });
            }
        }
        // 弧長で v を刻む。
        // 【対策】ループの添字で v を刻むと、点が密なリムの丸めだけ
        //         テクスチャが詰まって縞に見える（SKILL 1.6）
        let acc = 0;
        loop[0].v = 0;
        for (let i = 1; i < loop.length; i++) {
            acc += Math.hypot(loop[i].D - loop[i - 1].D, loop[i].y - loop[i - 1].y);
            loop[i].v = acc;
        }
        for (const p of loop) p.v /= acc;
        return loop;
    }

    // ---- 釉薬のテクスチャ ---------------------------------------------
    // u = 周方向（折り返す）、v = 断面の弧長
    function plateGlaze(scene, G, pr, loop, seed) {
        const N = 768, M = 512, n2 = N * M;
        // v → D の対応表（リムの線を D で指定できるようにする）
        const vD = new Float32Array(M);
        for (let j = 0; j < M; j++) {
            const v = (j + 0.5) / M;
            let lo = 0, hi = loop.length - 1;
            while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (loop[mid].v <= v) lo = mid; else hi = mid; }
            const t = (v - loop[lo].v) / Math.max(1e-9, loop[hi].v - loop[lo].v);
            vD[j] = loop[lo].D + (loop[hi].D - loop[lo].D) * t;
            // 裏面側は D を負で持ち、リムの線が裏に回り込まないようにする
            if (!loop[lo].top) vD[j] = -vD[j];
        }
        const speck = new Float32Array(n2);
        const craze = new Float32Array(n2);
        const swell = new Float32Array(n2);
        const rng = new Rng(seed >>> 0);
        // 貫入（釉薬のひび）。
        // 【対策】ノイズの等高線をそのまま線にすると、地図の等高線のように
        //         平行に何本も走って布地に見える。数十本の折れ線を
        //         別々に引いて、線ごとに長さも濃さも変える
        const lines = [];
        const nl = 34 + rng.int(20);
        for (let i = 0; i < nl; i++) {
            const u0 = rng.next(), v0 = rng.range(0.02, 0.52);
            const a0 = rng.range(0, TAU), len = rng.range(0.04, 0.30);
            const pts = [[u0, v0]];
            let a = a0;
            const steps = 5 + rng.int(7);
            for (let k = 0; k < steps; k++) {
                a += rng.gauss(0, 0.55);
                const u = pts[k][0] + Math.cos(a) * len / steps * 0.7;
                const v = clamp(pts[k][1] + Math.sin(a) * len / steps, 0.0, 0.56);
                pts.push([u, v]);
            }
            lines.push({ pts: pts, w: rng.range(0.0009, 0.0026), c: rng.range(0.35, 1.0) });
        }
        for (let j = 0; j < M; j++) {
            const v = (j + 0.5) / M;
            for (let i = 0; i < N; i++) {
                const u = (i + 0.5) / N, k = j * N + i;
                // 鉄点（原料の鉄分が焼成で浮いた粒）。閾値で粒立たせる
                const sp = Noise.fbm2u(u * 210, v * 150, 210, seed + 17, 2);
                speck[k] = smooth(0.80, 0.955, sp);
                // ろくろ／型の微妙なうねり。真円だと量産プラスチックに見える
                swell[k] = (Noise.fbm2u(u * 7, v * 4 + 3, 7, seed + 41, 3) - 0.5);
            }
        }
        // 貫入を塗る。
        // 【対策】全テクセル × 全折れ線で距離を測ると 768×512×約440 で
        //         1.7 億回になり、この関数だけで 7 秒かかっていた（実測）。
        //         線は幅 1〜3 テクセルしかないので、テクセル側から線を
        //         探すのではなく、線の側から影響範囲の矩形だけを塗る。
        //         出る絵は同じで、500 倍速い
        for (const L of lines) {
            const R = L.w * 3;
            for (let s = 0; s < L.pts.length - 1; s++) {
                const ax = L.pts[s][0], ay = L.pts[s][1];
                let dbu = L.pts[s + 1][0] - ax; dbu -= Math.round(dbu);
                const dbv = L.pts[s + 1][1] - ay;
                const ll = dbu * dbu + dbv * dbv;
                if (ll < 1e-9) continue;
                const vLo = Math.min(ay, ay + dbv) - R, vHi = Math.max(ay, ay + dbv) + R;
                const uLo = Math.min(ax, ax + dbu) - R, uHi = Math.max(ax, ax + dbu) + R;
                const j0 = Math.max(0, Math.floor(vLo * M - 0.5));
                const j1 = Math.min(M - 1, Math.ceil(vHi * M - 0.5));
                const i0 = Math.floor(uLo * N - 0.5), i1 = Math.ceil(uHi * N - 0.5);
                for (let j = j0; j <= j1; j++) {
                    const dv = (j + 0.5) / M - ay;
                    for (let ii = i0; ii <= i1; ii++) {
                        // u は周期。負や N 以上は巻き戻す
                        const i = ((ii % N) + N) % N;
                        let du = (i + 0.5) / N - ax; du -= Math.round(du);
                        const t = clamp((du * dbu + dv * dbv) / ll, 0, 1);
                        const px = du - dbu * t, py = dv - dbv * t;
                        const d = Math.hypot(px, py);
                        if (d >= R) continue;
                        const c = L.c * (1 - smooth(L.w * 0.4, L.w * 2.2, d));
                        const k = j * N + i;
                        if (c > craze[k]) craze[k] = c;
                    }
                }
            }
        }
        const bandOf = (j) => {
            if (!pr.rimBand) return 0;
            const D = vD[j];
            if (D < 0) return 0;
            const b = pr.rimBand;
            // リムの上面の内寄りに1本。at は rimInnerD からの比率
            const c = G.edgeD + (G.rimInnerD - G.edgeD) * b.at;
            const d = Math.abs(D - c);
            return 1 - smooth(b.w * 0.5 * (1 - b.blur), b.w * 0.5 * (1 + b.blur), d);
        };
        const albedo = TexLab._tex("plateA", N, M, (d) => {
            for (let j = 0; j < M; j++) {
                const bd = bandOf(j);
                for (let i = 0; i < N; i++) {
                    const k = j * N + i;
                    let c = pr.albedo.slice();
                    // 鉄点は暗く、わずかに赤い
                    const sp = speck[k] * pr.speck;
                    c = mix3(c, [c[0] * 0.52, c[1] * 0.44, c[2] * 0.40], sp);
                    // 貫入は釉薬の割れ目に汚れが入って茶色い線になる
                    const cz = craze[k] * pr.crazeAmt;
                    c = mix3(c, [c[0] * 0.60, c[1] * 0.53, c[2] * 0.47], cz);
                    // 呉須の線。にじみを持たせる
                    if (bd > 0) {
                        const b = pr.rimBand;
                        const jitter = 1 + swell[k] * 0.35;
                        c = mix3(c, b.col, clamp(bd * jitter, 0, 1));
                    }
                    const o = k * 4;
                    d[o] = clamp(c[0], 0, 1) * 255;
                    d[o + 1] = clamp(c[1], 0, 1) * 255;
                    d[o + 2] = clamp(c[2], 0, 1) * 255;
                    d[o + 3] = 255;
                }
            }
        }, scene, false, false);
        albedo.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

        const orm = TexLab._tex("plateO", N, M, (d) => {
            for (let j = 0; j < M; j++) {
                const bd = bandOf(j);
                for (let i = 0; i < N; i++) {
                    const k = j * N + i;
                    // 【対策】釉薬の粗さを一定にすると、どの角度から見ても
                    //         同じ強さで光る「塗ったプラスチック」になる。
                    //         貫入の線と鉄点だけ局所的に粗くする
                    let ro = pr.rough + craze[k] * 0.16 + speck[k] * 0.10
                        + Math.abs(swell[k]) * 0.05;
                    // 呉須は釉下彩なので、上の透明釉のぶん少しだけ滑らか
                    ro -= bd * 0.02;
                    const o = k * 4;
                    d[o] = clamp(1 - craze[k] * 0.10, 0, 1) * 255;
                    d[o + 1] = clamp(ro, 0.03, 0.9) * 255;
                    d[o + 2] = 0; d[o + 3] = 255;
                }
            }
        }, scene, true, false);
        orm.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

        const H = new Float32Array(n2);
        for (let k = 0; k < n2; k++) {
            H[k] = clamp(0.5 + swell[k] * 0.30 - craze[k] * 0.42 + speck[k] * 0.16, 0, 1);
        }
        const normal = TexLab.normalFromHeight("plateN", N, H, 0.75, scene, false);
        return { albedo, orm, normal };
    }

    function plateMaterial(scene, G, pr, loop, seed) {
        const tex = plateGlaze(scene, G, pr, loop, seed);
        const m = new BABYLON.PBRMaterial("plateMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = tex.albedo;
        m.metallic = 0.0;
        m.roughness = 1.0;
        m.metallicTexture = tex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = tex.normal;
        m.bumpTexture.level = 0.45;
        // 【対策】磁器の照りは「素地の拡散」と「透明釉の鏡面」の2層。
        //         1枚の PBR で粗さを下げると、白い金属板になる
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.92;
        m.clearCoat.roughness = pr.rough * 0.55;
        m.clearCoat.indexOfRefraction = 1.51;
        m.texs = [tex.albedo, tex.orm, tex.normal];
        return m;
    }

    // ---- メッシュ ------------------------------------------------------
    function buildPlate(scene, G, mat, seed) {
        const loop = plateLoop(G);
        const NS = Math.max(48, G.plateSectors | 0);
        const rows = loop.length;
        const nV = rows * (NS + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array((rows - 1) * NS * 6);
        const sd = (seed ^ 0x5A17) >>> 0;

        let vo = 0;
        for (let i = 0; i < rows; i++) {
            const L = loop[i];
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                let r = contourR(th, L.D, G);
                // 【対策】完全な楕円だとリムのハイライトが定規で引いた線になり、
                //         量産プラスチックに見える。手作りの皿には
                //         コンマ数 mm の周期的な歪みが必ずある
                const w = 0.0035 * (1 - smooth(0.55, 0.95, L.D / G.plateDmax));
                r *= 1 + w * (Math.cos(3 * th + 0.7) * 0.6 + Math.sin(5 * th) * 0.4);
                const y = L.y + Math.sin(2 * th + 1.3) * 0.010
                    * (1 - smooth(0.3, 0.9, L.D / G.plateDmax));
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = r * Math.cos(th);
                positions[p3 + 1] = y;
                positions[p3 + 2] = r * Math.sin(th);
                uvs[p2] = j / NS;
                uvs[p2 + 1] = L.v;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < rows - 1; i++) {
            for (let j = 0; j < NS; j++) {
                const p = i * (NS + 1) + j;
                indices[io++] = p; indices[io++] = p + 1; indices[io++] = p + NS + 1;
                indices[io++] = p + 1; indices[io++] = p + NS + 2; indices[io++] = p + NS + 1;
            }
        }
        // 【対策】皿は「上から見える面」と「裏面」が同じ向きを向いていないので
        //         代表点1個の内積では符号が不安定になる。全頂点の総和で見る
        const center = new V3(0, (G.rimY + G.footY) * 0.5, 0);
        const normals = finalize(positions, indices, center, 0, true);
        weldNormals(positions, normals);
        const mesh = makeMesh("plate", positions, indices, normals, uvs, null, scene);
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.loop = loop;
        return mesh;
    }

    // =================================================================
    // 6. Rice : 盛りの形と米粒  ★ ご飯.js(rice-H) の知見を移植
    // =================================================================
    // ご飯.js（茶碗一杯）の造形を平皿へ移す。茶碗との違いは2つ。
    //   (a) 盛りが楕円のドームになる（皿の半分に寄せる）
    //   (b) しゃもじの背でならした筋が入る。カレーライスのライスは
    //       茶碗のごはんと違って必ず「押さえてある」
    const RICE = {
        lengthMM: 5.55, widthMM: 2.90, heightMM: 2.24,
        // 【対策】ご飯.js の実測より。青を 0.878 まで落とすとクリーム色になり、
        //         暗部の色ずれと合わさって黄土色に濁る。0.868 はそれより下だった。
        //         炊きたての白飯は写真で見るとほぼ新雪で、わずかに暖かい程度
        albedo: [0.958, 0.947, 0.928],
        // 【対策】endPow を 2.4 まで下げると紡錘形になって麦やパスタに見える。
        //         2.30 はその下限を割っていた。3.2 まで上げると胴が円柱になり
        //         カプセル錠剤になるので、2.7 前後が米の形
        asym: 0.88, endPow: 2.68, endRound: 0.48, tipTaper: 0.125,
        // 【対策】断面の超楕円 p を 2.55 まで上げると角の立った四角い断面になり、
        //         「切った餅」に寄る。炊いた米の断面は 2.0〜2.1
        sectionP: 2.10, bend: 0.038, sizeSd: 0.070,
        puff: 0.055, grooveDepth: 0.021, endSwell: 0.055,
        // 【対策】炊きたては糊化して胴割れがほぼ完全にふさがる。カレーの
        //         ライスは常に炊きたてなので、ここはほぼ 0 でよい
        crackAmount: 0.02, bumpLevel: 0.21,
        baseRough: 0.305, coatIntensity: 0.76, coatRough: 0.145,
        wetMottle: 0.30,                    // 水の膜が切れて乾いた斑の量
        // ★【対策】Babylon 8 系の subSurface.translucencyIntensity は
        //   「透けを足す強さ」ではなく「拡散反射と拡散透過の配分比」。
        //       info.diffuse = computeDiffuseLighting(...) * (1 - t)
        //   かつ IBL の irradiance にも同じ係数が掛かる。0.40 では拡散の
        //   4 割を捨てており、捨てたぶんが戻るのは粒の裏から光が来たときだけ。
        //   白い被写体では 0.30 が上限で、それを超えると白飯ではなく
        //   灰色の塊になる。切り分けたいときは 0 にすれば一発で分かる
        translucency: 0.26, tint: [0.99, 0.975, 0.950],
        // 谷の暗さ。0.30 まで落とすと SSAO・ORM の AO・下地の暗さと
        // 四重に掛かって、盛り全体のトーンが沈む
        aoFloor: 0.62, aoDepth: 0.40
    };

    // 長さ方向のプロファイル（0=胚芽側 → 1=先端、最大半径に対する比）
    // 【対策】単純なだ円体にすると細長い豆にしかならない。米粒は
    //         「胴が長く、両端が急に丸まる」カプセル寄りの形
    function profileAt(t, cfg) {
        const s = clamp(t, 0, 1);
        const u = Math.pow(s, cfg.asym);
        const e = 1 - Math.pow(Math.abs(2 * u - 1), cfg.endPow);
        let r = Math.pow(Math.max(0, e), cfg.endRound);
        r *= 1 - cfg.tipTaper * smooth(0.45, 1.0, s);
        return r;
    }

    function buildGrainVertexData(cfg, seed, nT, nS) {
        const rng = new Rng(seed);
        const kL = rng.gauss(1, cfg.sizeSd);
        const kW = rng.gauss(1, cfg.sizeSd * 1.25);
        const kH = rng.gauss(1, cfg.sizeSd * 1.25);
        const L = cfg.lengthMM * MM * clamp(kL, 0.82, 1.18);
        const halfW = cfg.widthMM * MM * 0.5 * clamp(kW, 0.82, 1.18);
        const halfH = cfg.heightMM * MM * 0.5 * clamp(kH, 0.82, 1.18);
        const bend = cfg.bend * L * rng.range(0.5, 1.5);
        const ventral = -Math.PI / 2;
        const nseed = (seed + 991) >>> 0;
        const ph = rng.range(0, 20);
        const germT = rng.range(0.06, 0.11);
        const germPhi = ventral + rng.range(-0.55, 0.55);
        const germDepth = rng.range(0.07, 0.13);

        const nV = (nT + 1) * (nS + 1);
        const positions = new Float32Array(nV * 3);
        const normals = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array(nT * nS * 6);

        // 断面の超だ円（角の丸い四角に寄せると「米」らしくなる）
        const p = cfg.sectionP;
        const rho = new Float32Array(nS + 1);
        for (let j = 0; j <= nS; j++) {
            const th = (j % nS) / nS * TAU;
            const ca = Math.abs(Math.cos(th)), sa = Math.abs(Math.sin(th));
            rho[j] = 1 / Math.pow(Math.pow(ca, p) + Math.pow(sa, p), 1 / p);
        }

        let vo = 0;
        for (let i = 0; i <= nT; i++) {
            const t = i / nT;
            const pr = profileAt(t, cfg);
            const spineY = bend * (1 - Math.pow(2 * t - 1, 2));
            const x = L * (t - 0.5);
            const swell = 1 + cfg.endSwell * (smooth(0.78, 1.0, t) + (1 - smooth(0.0, 0.22, t)));
            for (let j = 0; j <= nS; j++) {
                const th = (j % nS) / nS * TAU;
                const cth = Math.cos(th), sth = Math.sin(th);
                let r = rho[j] * pr * swell;
                // (a) 腹溝
                const dv = angDist(th, ventral);
                r -= cfg.grooveDepth * Math.exp(-Math.pow(dv / 0.52, 2))
                    * Math.pow(Math.sin(Math.PI * t), 0.45);
                // (b) 胚芽の欠け
                const dg = angDist(th, germPhi);
                const dt2 = (t - germT) / 0.070;
                r -= germDepth * Math.exp(-dt2 * dt2) * Math.exp(-Math.pow(dg / 0.85, 2));
                // (c) 膨らみのゆらぎ。1階層だと滑らかなカプセルにしかならない
                const pf = (Noise.v3(cth * 2.1 + ph, sth * 2.1 + ph, t * 3.4 + ph, nseed) - 0.5) * 2;
                const pf2 = (Noise.v3(cth * 5.4 + ph, sth * 5.4 + ph, t * 8.2 + ph, nseed + 7) - 0.5) * 2;
                r *= 1 + cfg.puff * (pf + 0.55 * pf2);
                r = Math.max(0, r);
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = x;
                positions[p3 + 1] = spineY + halfH * r * sth;
                positions[p3 + 2] = halfW * r * cth;
                uvs[p2] = j / nS; uvs[p2 + 1] = t;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < nT; i++) {
            for (let j = 0; j < nS; j++) {
                const a = i * (nS + 1) + j, b = a + 1, c = a + (nS + 1), d = c + 1;
                indices[io++] = a; indices[io++] = c; indices[io++] = b;
                indices[io++] = b; indices[io++] = c; indices[io++] = d;
            }
        }
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        // 【対策】掃引の巻き順は断面をどちら回りに取ったかで簡単に裏返る。
        //         胴のいちばん太いリングの θ=0（+Z側）で判定する
        {
            const pi = Math.round(nT * 0.45) * (nS + 1);
            if (normals[pi * 3 + 2] < 0) {
                for (let k = 0; k < indices.length; k += 3) {
                    const tmp = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = tmp;
                }
                BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            }
        }
        // 周方向の継ぎ目を溶接する
        for (let i = 0; i <= nT; i++) {
            const a = (i * (nS + 1)) * 3, b = (i * (nS + 1) + nS) * 3;
            let nx = normals[a] + normals[b], ny = normals[a + 1] + normals[b + 1];
            let nz = normals[a + 2] + normals[b + 2];
            const l = Math.hypot(nx, ny, nz) || 1;
            normals[a] = normals[b] = nx / l;
            normals[a + 1] = normals[b + 1] = ny / l;
            normals[a + 2] = normals[b + 2] = nz / l;
        }
        let lo = Infinity, hi = -Infinity;
        for (let i = 1; i < positions.length; i += 3) {
            if (positions[i] < lo) lo = positions[i];
            if (positions[i] > hi) hi = positions[i];
        }
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.normals = normals; vd.uvs = uvs; vd.indices = indices;
        // 【対策】info に vd を入れると、メッシュが生きているあいだ巨大な
        //         型付き配列が解放されない。数値だけ持たせる
        return { vd: vd, info: { L, halfW, halfH, minY: lo, maxY: hi, tris: nT * nS * 2 } };
    }

    // ---- 米粒のテクスチャ ---------------------------------------------
    // 【対策】アルベド・ORM・法線を別々のノイズで作ると、粒の位置がずれて
    //         「ざらざらの上にぼんやりした汚れが乗った」ように見える。
    //         高さ場を1枚焼いて3枚すべてがそれを参照する（SKILL 2.6）
    function riceHeight(N, seed, cfg) {
        const H = new Float32Array(N * N);
        // ---- 胴割れ ------------------------------------------------------
        // 【対策】UV に任意の向きの線分を置くと、v（＝長さ）方向へ走った割れ目が
        //         「米粒を縦に裂いたもの」になる。実物の胴割れは必ず粒を横断する
        //         ので、v をほぼ一定に保ち、u 方向の弧の長さだけ振る。
        //         ただし v 一定の線を全周に引くと今度はタイヤの溝になるので、
        //         arc の外では消し、端ほど浅くする
        const rng = new Rng((seed + 77) >>> 0);
        const amt = clamp(cfg.crackAmount, 0, 1);
        const cracks = [];
        for (let i = 0, nc = Math.round(2.4 * amt); i < nc; i++) {
            cracks.push({
                v: rng.range(0.16, 0.84), u0: rng.next(),
                arc: rng.range(0.16, 0.42),      // 周方向にどこまで走るか
                tilt: rng.range(-0.10, 0.10),    // 完全な水平にはしない
                w: rng.range(0.0016, 0.0032),
                d: rng.range(0.55, 1.0) * amt
            });
        }
        for (let y = 0; y < N; y++) {
            const v = y / N;
            // 【対策】v=0/1 は掃引の両端＝UV が潰れる極。ここに肌理を出すと、
            //         数テクセルへ圧縮された模様が芯のように固まって見える
            const poleFade = smooth(0, 0.10, v) * (1 - smooth(0.90, 1.0, v));
            for (let x = 0; x < N; x++) {
                const u = x / N, k = y * N + x;
                // でんぷんの粒状感。両軸とも折り返して継ぎ目を殺す（SKILL 2.7）
                let e = Noise.fbm2p(u * 34, v * 34, 34, 34, seed + 3, 3) * 0.34
                    + Noise.fbm2p(u * 96, v * 96, 96, 96, seed + 19, 2) * 0.36
                    + Noise.fbm2p(u * 210, v * 210, 210, 210, seed + 37, 1) * 0.30;
                e -= 0.5;
                // 長さ方向の弱い筋
                e += 0.035 * Math.sin(u * TAU * 11
                    + Noise.fbm2p(v * 3, 0.5, 3, 1, seed + 5, 1) * 6);
                // 炊いた粒は端がふくれて細かいしわが出る
                const endW = smooth(0.62, 0.86, v) + (1 - smooth(0.14, 0.38, v));
                e += cfg.endSwell * 10 * endW
                    * (Noise.fbm2p(u * 72, v * 72, 72, 72, seed + 313, 2) - 0.5);
                // 胴割れ
                for (const c of cracks) {
                    let du = u - c.u0; du -= Math.round(du);
                    const half = c.arc * 0.5;
                    if (Math.abs(du) >= half) continue;
                    const dv = v - (c.v + c.tilt * du);
                    const along = 1 - Math.pow(Math.abs(du) / half, 2);   // 端で消える
                    e -= c.d * 0.26 * along * Math.exp(-(dv * dv) / (c.w * c.w));
                }
                H[k] = clamp(0.5 + e * poleFade, 0, 1);
            }
        }
        return H;
    }
    // 【注意】ご飯.js の同じ式は基準ノイズを * 0.17 してから使っている。
    //   あちらの normalMap は勾配に level * S * 0.06 を掛けるのに対し、
    //   こちらの TexLab.normalFromHeight は高さ場の差分をそのまま使うので、
    //   係数をそのまま持ってくると法線がほぼ平らになる。上の版は
    //   「H の分布は平均 0.5・標準偏差 0.13 前後に保ち、割れ目と端のしわだけを
    //   足す」形へ振り直してある。ORM とクリアコートが同じ H を参照している
    //   ので、ここの振幅を変えると粗さの出方も動く

    function riceTextures(scene, cfg, seed) {
        const SN = 512, SO = 256;
        const hBig = riceHeight(SN, seed, cfg);
        const hSmall = riceHeight(SO, seed, cfg);
        const normal = TexLab.normalFromHeight("riceN", SN, hBig, cfg.bumpLevel * 6.0, scene, false);
        const orm = TexLab._tex("riceO", SO, SO, (d) => {
            for (let k = 0; k < SO * SO; k++) {
                const h = hSmall[k];
                // 【対策】水や油はくぼみに溜まる。粗さを高さと正の相関にする。
                //         逆にすると出っ張りだけ光る金平糖になる（SKILL 3.2）
                const ro = clamp(cfg.baseRough * (0.62 + 0.62 * smooth(0.25, 0.80, h)), 0.05, 0.95);
                const o = k * 4;
                d[o] = clamp(0.72 + 0.28 * h, 0, 1) * 255;
                d[o + 1] = ro * 255; d[o + 2] = 0; d[o + 3] = 255;
            }
        }, scene, true, false);
        const coat = TexLab._tex("riceC", SO, SO, (d) => {
            for (let y = 0; y < SO; y++) {
                const v = y / SO;
                for (let x = 0; x < SO; x++) {
                    const k = y * SO + x, u = x / SO;
                    const h = hSmall[k];
                    // 【対策】水の膜を粒の全面に一様に張ると、1粒ごとに小さな
                    //         鏡ができて白い錠剤が並んでいるように見える。
                    //         実物は乾いて膜が切れた斑があり、そこだけ粗い
                    const cloud = Noise.fbm2p(u * 4, v * 3, 4, 3, seed + 811, 3);
                    const fine = Noise.fbm2p(u * 14, v * 12, 14, 12, seed + 827, 2);
                    const dry = smooth(0.52, 0.78, cloud) * (cfg.wetMottle || 0);
                    // 水の膜はくぼみほど厚く、そこだけ滑らかになる
                    const cov = clamp(cfg.coatIntensity * (1.12 - 0.34 * h)
                        * (1 - 0.85 * dry), 0, 1);
                    const ro = clamp(cfg.coatRough * (0.68 + 0.85 * h)
                        * (0.90 + 0.20 * fine) + 0.30 * dry, 0.02, 0.85);
                    const o = k * 4;
                    d[o] = cov * 255; d[o + 1] = ro * 255; d[o + 2] = 0; d[o + 3] = 255;
                }
            }
        }, scene, true, false);
        // 厚み（subSurface 用）。v = 長さ方向なので profileAt がそのまま使える
        const thick = TexLab._tex("riceT", 64, 64, (d) => {
            for (let y = 0; y < 64; y++) {
                const t = profileAt((y + 0.5) / 64, cfg);
                for (let x = 0; x < 64; x++) {
                    const o = (y * 64 + x) * 4;
                    const v = clamp(t, 0, 1) * 255;
                    d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255;
                }
            }
        }, scene, true, false);
        return { normal, orm, coat, thick };
    }

    function riceMaterial(scene, cfg, tex, name, curryTint) {
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoColor = col3(cfg.albedo);
        m.metallic = 0.0;
        m.roughness = 1.0;                  // 実値は ORM の G
        m.metallicTexture = tex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = tex.normal;
        m.bumpTexture.level = 1.0;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 1.0;        // 実値は coat の R
        m.clearCoat.roughness = 1.0;        //             G
        m.clearCoat.texture = tex.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        // 米にのっているのは水なので IOR は 1.33。樹脂の 1.5 だと反射が強すぎる
        m.clearCoat.indexOfRefraction = 1.33;
        const sub = m.subSurface;
        sub.isTranslucencyEnabled = true;
        sub.translucencyIntensity = clamp(cfg.translucency, 0, 0.95);
        sub.tintColor = col3(cfg.tint);
        sub.thicknessTexture = tex.thick;
        sub.useMaskFromThicknessTexture = false;
        if ("useGltfStyleTextures" in sub) sub.useGltfStyleTextures = false;
        // 【対策】厚みを固定値で持つと粒の実寸と噛み合わない。粒の高さ
        //         （2.24mm）を基準にする。0.030cm では薄すぎて、透光を
        //         下げたぶんが「透けない」側へ丸ごと出てしまう
        const TH = cfg.heightMM * MM;
        sub.minimumThickness = TH * 0.06;
        sub.maximumThickness = TH * 0.95;
        sub.tintColorAtDistance = TH * 1.25;
        // 【対策】屈折は入れない。米は透明体ではなく散乱体なので、
        //         屈折を足すと途端に「ガラスの米」になる
        sub.isRefractionEnabled = false;
        if (curryTint) {
            // ルウが染みた粒。albedo を落とすだけでなく、水の膜を
            // 「油の膜」に置き換える（IOR が上がり、照りが強く黄色くなる）
            m.clearCoat.indexOfRefraction = 1.46;
            sub.translucencyIntensity = cfg.translucency * 0.35;
        }
        m.texs = [];
        return m;
    }

    // ---- 盛りの形 ------------------------------------------------------
    // 【対策】山を皿の中心に立てると「型で抜いた」印象になる。しゃもじで
    //         よそったライスは必ずどこかへ片寄り、背でならした筋が残る
    function moundY(x, z, G, seed) {
        const dx = (x - G.riceCX) / G.riceAX, dz = (z - G.riceCZ) / G.riceAZ;
        const u = Math.hypot(dx, dz);
        if (u >= 1) return -1e9;
        // 【対策】指数を小さくすると肩が張って半球になり、皿にボールが
        //         載った状態になる。1.05 前後だと肩が落ちて皿へ馴染む
        const dome = G.ricePeak * Math.pow(Math.max(0, 1 - u * u), 1.05);
        const fade = 1 - smooth(0.78, 1.0, u);
        const sd = (seed ^ 0x77) >>> 0;
        // 大きなうねり（しゃもじの塊）と、その半分の大きさのうねり
        const lump = ((Noise.v3(x * 0.52 + 31, z * 0.52 + 17, 5.3, sd) - 0.5) * 2.0
            + (Noise.v3(x * 1.34 + 7, z * 1.34 + 3, 2.1, sd + 91) - 0.5) * 1.1)
            * G.riceLump * fade;
        // しゃもじの背でならした筋。中心から放射方向に浅い谷が数本
        const ang = Math.atan2(z - G.riceCZ, x - G.riceCX);
        const scoop = Math.cos(ang * 4.0 + 0.7) * Math.cos(ang * 2.0 - 0.3)
            * G.riceScoop * smooth(0.15, 0.62, u) * fade;
        return G.wellY + dome + lump + scoop;
    }
    function moundN(x, z, G, seed) {
        const e = 0.08;
        const c = moundY(x, z, G, seed);
        if (c < -1e8) return new V3(0, 1, 0);
        const gx = (moundY(x + e, z, G, seed) - moundY(x - e, z, G, seed)) / (2 * e);
        const gz = (moundY(x, z + e, G, seed) - moundY(x, z - e, G, seed)) / (2 * e);
        // 端では moundY が -1e9 を返すので、そのときは中心差分を捨てる
        const n = new V3(
            Math.abs(gx) > 100 ? 0 : -gx, 1,
            Math.abs(gz) > 100 ? 0 : -gz);
        n.normalize();
        return n;
    }

    // 粒のすき間から皿が見えないように、盛りの形そのものを1枚張る。
    // 【対策】これが無いと粒と粒のあいだから白い穴が見えて
    //         「まばらに米を貼りつけた飾り」になる
    function buildRiceBody(scene, G, seed, mat) {
        const NR = 56, NS = 168;
        const sd = (seed ^ 0x33AB) >>> 0;
        const nV = (NR + 1) * (NS + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array(NR * NS * 6);
        let vo = 0;
        for (let i = 0; i <= NR; i++) {
            // 【対策】盛りの本体は粒より一段深く沈めておく。面ぴったりだと
            //         粒のすき間が「明るい地面」になって、暗がりが出ない
            const u = i / NR;
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                const x = G.riceCX + G.riceAX * u * 0.998 * Math.cos(th);
                const z = G.riceCZ + G.riceAZ * u * 0.998 * Math.sin(th);
                let y = moundY(x, z, G, seed);
                if (y < -1e8) y = G.wellY;
                // 【対策】下地を数学的になめらかな面にすると、粒のすき間から
                //         見えた瞬間に「水面」になる。粒と同じ凹凸を持たせる
                const bump = (Noise.v3(x * 2.4 + 5, z * 2.4 + 9, 1.7, sd) - 0.5) * 2 * 0.085
                    + (Noise.v3(x * 6.0 + 2, z * 6.0 + 4, 3.3, sd + 29) - 0.5) * 2 * 0.040;
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = x;
                // 【対策】0.52mm 沈めると、粒の直径（2.2mm）に対して
                //         谷が深くなりすぎ、下地の見える面積が増える。
                //         粒を増やしたぶん、沈めるのは 0.3mm でよい
                positions[p3 + 1] = Math.max(G.wellY - 0.002, y - 0.030 + bump);
                positions[p3 + 2] = z;
                uvs[p2] = j / NS * 6; uvs[p2 + 1] = u * 6;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < NR; i++) {
            for (let j = 0; j < NS; j++) {
                const p = i * (NS + 1) + j;
                indices[io++] = p; indices[io++] = p + 1; indices[io++] = p + NS + 1;
                indices[io++] = p + 1; indices[io++] = p + NS + 2; indices[io++] = p + NS + 1;
            }
        }
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        let up = 0;
        for (let i = 1; i < normals.length; i += 3) up += normals[i];
        if (up < 0) {
            for (let k = 0; k < indices.length; k += 3) {
                const t = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = t;
            }
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        weldNormals(positions, normals);
        const mesh = makeMesh("riceBody", positions, indices, normals, uvs, null, scene);
        mesh.material = mat;
        mesh.receiveShadows = true;
        return mesh;
    }

    // ---- 粒の配置 ------------------------------------------------------
    function placeGrains(G, seed) {
        const rng = new Rng((seed ^ 0x51ED) >>> 0);
        // 【対策】粒数を定数で持つと、盛りの寸法を変えたときに密度が変わって
        //         「まばら」か「団子」になる。面密度から出す（SKILL の粒系の項）
        const area = Math.PI * G.riceAX * G.riceAZ * 1.22;   // ドームのぶん 1.22 倍
        const n = Math.round(area * G.grainDensity);
        const out = [];
        // 【対策】1粒ずつ独立に撒くと統計的に均一な絨毯になる。実物のごはんは
        //         数粒がくっついた塊と、そのあいだの空隙でできている
        const CS = 3;
        const cn = Math.ceil(n / CS);
        const _cc = new Map();
        const rngC = (ci) => {
            let r = _cc.get(ci);
            if (!r) { r = new Rng((seed + 0x9E37 + ci * 2654435761) >>> 0); _cc.set(ci, r); }
            return r;
        };
        for (let i = 0; i < n; i++) {
            const ci = (i / CS) | 0;
            const rc0 = rngC(ci);
            // 【対策】sqrt は円板を面積等分するが、盛りは外側ほど傾いていて
            //         実面積が大きく、横から見ると外周が最も広く見える。
            //         指数を 0.5 より小さくして外周へ粒を寄せる
            const uc = Math.pow((ci + 0.5) / cn, 0.43) * rc0.range(0.90, 1.09);
            const thc = rc0.range(0, TAU);
            const off = rng.range(0, 0.30), oa = rng.range(0, TAU);
            let x = G.riceCX + G.riceAX * uc * Math.cos(thc) + Math.cos(oa) * off;
            let z = G.riceCZ + G.riceAZ * uc * Math.sin(thc) + Math.sin(oa) * off;
            // はみ出したら楕円の内側へ押し戻す
            let dx = (x - G.riceCX) / G.riceAX, dz = (z - G.riceCZ) / G.riceAZ;
            const u = Math.hypot(dx, dz);
            if (u > 0.985) {
                const k = 0.985 / u;
                x = G.riceCX + (x - G.riceCX) * k; z = G.riceCZ + (z - G.riceCZ) * k;
                dx *= k; dz *= k;
            }
            // 【対策】全粒を面ぴったりに置くと、モザイクを貼ったように隙間なく
            //         敷き詰まって「型に詰めたごはん」になる。ふっくらした
            //         ごはんは、塊の上に乗って浮いている粒がある。
            // 【対策】浮かせる粒が 0.55mm・全体の 2 割しかないと、輪郭が
            //         なめらかなドームの曲線になって一気に嘘になる。カレーの
            //         ライスはしゃもじで押さえてあるので ご飯.js（3mm・34%）
            //         ほどは要らないが、その中間までは上げる
            const t = rng.next(), LR = 0.28, LIFT = 0.16;
            const sink = (t < LR) ? -LIFT * (t / LR)
                : 0.012 + 0.115 * Math.pow((t - LR) / (1 - LR), 1.9);
            const my = moundY(x, z, G, seed);
            out.push({ x: x, z: z, u: Math.hypot(dx, dz), y: my - sink });
        }
        return out;
    }

    // ---- 粒間の暗がり ---------------------------------------------------
    // 【対策】これは SSAO では出ない。SSAO が拾えるのは画面空間で隣接した
    //         面の陰りだけで、ごはんの谷は深さ数ミリ・幅数ミリの密集した溝。
    //         半径を合わせると今度は粒の輪郭が全部汚れる。
    //         配置の段階で幾何的に焼けば、描画時のコストはゼロで正確
    function bakeAO(pts, G, seed) {
        const cell = 0.36, OFF = 4096;
        const key = (i, j) => (i + OFF) * 100003 + (j + OFF);
        // 【対策】素の高さで近傍最高点を取ると、盛りの斜面そのものの傾きを
        //         「沈み込み」として拾い、山の外側半分が丸ごと暗くなる。
        //         盛りの面からの差（残差）に直してから比べること
        const top = new Map();
        for (const p of pts) {
            p.res = p.y - moundY(p.x, p.z, G, seed);
            const k = key(Math.floor(p.x / cell), Math.floor(p.z / cell));
            const cur = top.get(k);
            if (cur === undefined || p.res > cur) top.set(k, p.res);
        }
        for (const p of pts) {
            const i0 = Math.floor(p.x / cell), j0 = Math.floor(p.z / cell);
            let m = -1e9;
            for (let di = -1; di <= 1; di++) {
                for (let dj = -1; dj <= 1; dj++) {
                    const v = top.get(key(i0 + di, j0 + dj));
                    if (v !== undefined && v > m) m = v;
                }
            }
            // 【対策】ここを深く取ると、SSAO・ORM の AO・下地の暗さと
            //         四重に掛かって盛り全体が沈む。谷の底は 0.62 で足りる
            let ao = clamp(1 - (m - p.res) / RICE.aoDepth, 0, 1);
            ao = RICE.aoFloor + (1 - RICE.aoFloor) * Math.pow(ao, 0.75);
            // 盛りの裾は皿の内壁に空を遮られてさらに暗い
            ao *= 1 - 0.22 * smooth(0.72, 1.0, p.u);
            p.ao = ao;
        }
        return pts;
    }

    // =================================================================
    // 7. Chunks : 具
    // =================================================================
    // じゃがいも・にんじん・肉はどれも「棒や球を何枚かの平面で切ったもの」で、
    // 煮込みで角が丸まっている。個別に作らず、支持関数のソフト最小で統一する。
    //
    //   方向 v に対する半径を
    //     ellipsoid : r_e(v) = 1/√((vx/ax)² + (vy/ay)² + (vz/az)²)
    //     切断面     : r_p(v) = d/(v·n)          (v·n > 0 のときだけ)
    //   として、softmin_k(r_e, r_p...) を取る。
    //
    // 【対策】球と平面を線形補間で混ぜると、平面であるべき切断面まで
    //         丸くなって「石鹸」になる。ソフト最小なら、面の中心では
    //         平面がそのまま残り、稜線の近傍だけが丸まる。丸めの幅 k は
    //         煮込み時間そのもので、じゃがいもは大きく、肉は小さい
    function softmin(vals, k) {
        let m = Infinity;
        for (const v of vals) if (v < m) m = v;
        if (!isFinite(m)) return 1e9;
        let s = 0;
        for (const v of vals) { if (isFinite(v)) s += Math.exp(-(v - m) / k); }
        return m - k * Math.log(Math.max(1e-12, s));
    }

    // 乱切りの正体。
    // 【対策】にんじんを楕円体にして両端を切ると、切り口へ向かって
    //         側面が細っていくので「小石」になる。実物の乱切りは
    //         「太さの変わらない棒を、転がしながら斜めに切ったもの」で、
    //         側面は円柱のまま、切り口だけが斜めの楕円になる。
    //         方向 v に対する円柱の支持半径は R/√(vx²+vy²) なので、
    //         これを平面とソフト最小にすれば、そのままの形が出る。
    //         最後に長さ方向へわずかな先細りを掛けて根の向きを出す
    //
    // spec: { axes:[ax,ay,az] または cylR, planes:[{n:[..],d}], k, bands, seed }
    function buildBlob(spec, nP, nT) {
        const ax = spec.axes[0], ay = spec.axes[1], az = spec.axes[2];
        const cylR = spec.cylR || 0;
        const planes = spec.planes || [];
        const k = spec.k;
        const sd = spec.seed >>> 0;
        const nV = (nP + 1) * (nT + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const cut = new Float32Array(nV);      // 切断面らしさ 0..1
        const bump = new Float32Array(nV);     // ノイズ量（色に相関させる）
        const indices = new Uint32Array(nP * nT * 6);
        let vo = 0;
        for (let i = 0; i <= nP; i++) {
            const phi = i / nP * Math.PI;
            const sp = Math.sin(phi), cp = Math.cos(phi);
            for (let j = 0; j <= nT; j++) {
                const th = (j % nT) / nT * TAU;
                const vx = sp * Math.cos(th), vy = cp, vz = sp * Math.sin(th);
                let re;
                if (cylR > 0) {
                    // 円柱（軸は y）。
                    // 【対策】軸を z にすると、球面パラメータの極（±y）が
                    //         円柱の側面に来てしまい、肝心の切り口（±z）が
                    //         格子の 2 列だけで表現される。切り口が
                    //         ガタガタの多角形になるので、軸を極に合わせる。
                    //         極方向は無限大になるので上限を置く
                    const rad = Math.sqrt(vx * vx + vz * vz);
                    re = Math.min(cylR * 40, cylR / Math.max(1e-4, rad));
                } else {
                    re = 1 / Math.sqrt((vx / ax) ** 2 + (vy / ay) ** 2 + (vz / az) ** 2);
                }
                const list = [re];
                let best = 0;
                for (const pl of planes) {
                    const dn = vx * pl.n[0] + vy * pl.n[1] + vz * pl.n[2];
                    if (dn > 1e-4) {
                        const rp = pl.d / dn;
                        list.push(rp);
                        if (rp < re) best = Math.max(best, 1 - clamp((rp - re * 0.55) / (re * 0.45), 0, 1));
                    }
                }
                let r = softmin(list, k);
                // 表面の凹凸。3Dノイズなので継ぎ目が出ない
                let b = 0;
                for (const bd of (spec.bands || [])) {
                    b += (Noise.v3(vx * bd.f + 11, vy * bd.f + 5, vz * bd.f + 3, sd + (bd.f * 17 | 0)) - 0.5) * 2 * bd.a;
                }
                // 【対策】切断面にも同じ強さでノイズを乗せると、包丁で切った面が
                //         月面になる。切断面ではノイズを 1/4 に落とす
                const cutW = clamp(best, 0, 1);
                r *= 1 + b * (1 - 0.75 * cutW);
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = r * vx; positions[p3 + 1] = r * vy; positions[p3 + 2] = r * vz;
                uvs[p2] = j / nT; uvs[p2 + 1] = i / nP;
                cut[vo] = cutW; bump[vo] = b;
                vo++;
            }
        }
        // 長さ方向のわずかな先細り（円柱のときだけ）。
        // 法線を出す前に掛けないと、円柱の法線のまま円錐の面に貼られる
        if (spec.taper) {
            let y0 = 1e9, y1 = -1e9;
            for (let v = 0; v < nV; v++) { const y = positions[v * 3 + 1]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
            const span = Math.max(1e-6, y1 - y0);
            for (let v = 0; v < nV; v++) {
                const t = (positions[v * 3 + 1] - y0) / span;
                const sc = 1 - spec.taper * (t - 0.5);
                positions[v * 3] *= sc; positions[v * 3 + 2] *= sc;
            }
        }
        let io = 0;
        for (let i = 0; i < nP; i++) {
            for (let j = 0; j < nT; j++) {
                const p = i * (nT + 1) + j;
                indices[io++] = p; indices[io++] = p + 1; indices[io++] = p + nT + 1;
                indices[io++] = p + 1; indices[io++] = p + nT + 2; indices[io++] = p + nT + 1;
            }
        }
        const normals = finalize(positions, indices, new V3(0, 0, 0), 0, true);
        weldNormals(positions, normals);
        return { positions, indices, normals, uvs, cut, bump, nV };
    }


    // ---- ウィンナー -------------------------------------------------------
    // 【対策】「両端が半球の円柱」で作るとチクワになる。実物の要点は3つで、
    //         どれを外しても橙色の棒にしかならない:
    //           ・まっすぐではない。ゆるく弓なりで、詰め方のむらで太さが
    //             長手方向に ±5% うねる
    //           ・両端は半球ではない。中央がいちばん太い紡錘形で、
    //             ケーシングをねじって留めた跡へ放射状のひだが収束する。
    //             この数mmがいちばん「らしさ」を出す
    //           ・焼き色は等高線状のグラデーションではなく斑。濃く焼けた所と
    //             焼けずに残った浅い所がまだらに同居する
    //         （ウィンナー.js の知見をカレー向けに縮めて移植）
    const WIENER = {
        nRing: 76, nSide: 26,
        spindleP: 2.1, spindleQ: 2.3,          // 胴の輪郭（超楕円）
        tipPinch: 0.34, tipPinchLen: 0.070,    // 結び目の絞り
        pleatCount: 11,                        // 先端へ収束するひだの本数
        pale: [0.876, 0.548, 0.318],           // 焼きの浅い所（それでも橙）
        cook: [0.812, 0.408, 0.162],           // 標準の焼き色
        char: [0.566, 0.250, 0.098],           // 濃く焼けた斑
        burn: [0.306, 0.138, 0.066],           // 炭化した点
        // 面積比。ウィンナー.js の実測（濃い斑 28% / 炭化 2.4%）に合わせる
        charArea: 0.30, burnArea: 0.035, paleArea: 0.24
    };

    // 半長 = 1 の局所座標で作る（長軸は y。CHUNK_SPEC.size で cm へ）
    function makeWienerGeom(seed) {
        const W = WIENER, rng = new Rng(seed >>> 0);
        const NR = W.nRing, NS = W.nSide;
        const nV = (NR + 1) * (NS + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const cut = new Float32Array(nV);
        const bump = new Float32Array(nV);
        const field = new Float32Array(nV);       // 焼け具合（生の値）
        const indices = new Uint32Array(NR * NS * 6);
        // 半長 1 に対する太さ。長さ/太さ の比が 3.4 前後だとウィンナーらしい。
        // 【対策】0.245 のままで長さだけ伸ばすと、比が 5.6 になって
        //         「細い棒」＝キャンドルに見える。太さも一緒に上げる
        const R = 0.288 * rng.range(0.93, 1.07);
        const bendA = rng.range(0.035, 0.085), bendPh = rng.range(0, TAU);
        const plump = 0.055 * rng.range(0.7, 1.4), plumpSeed = 200 + rng.int(900);
        const oval = rng.range(0.012, 0.032), ovalPh = rng.range(0, TAU);
        const twist = rng.range(-2.4, 2.4), pleatPh = rng.range(0, TAU);
        const wSeed = 400 + rng.int(900), cSeed = 700 + rng.int(900);

        // 【対策】リングを等間隔に置くと、太さが急に変わる先端で分割が足りず
        //         結び目が多角形になる。両端へ寄せて中央を粗くする
        const sOf = (t) => t - 0.55 / TAU * Math.sin(TAU * t);
        // 紡錘形。中央がいちばん太く、両端へ全長の 1/4 ほどかけて細る
        const bodyR = (t) => {
            const a = Math.abs(2 * clamp(t, 0, 1) - 1);
            const r = Math.pow(Math.max(0, 1 - Math.pow(a, W.spindleP)), 1 / W.spindleQ);
            const e = Math.min(t, 1 - t) / W.tipPinchLen;
            return r * (1 - W.tipPinch * Math.exp(-Math.pow(e, 1.6)));
        };
        // 背骨。長軸は y、弓なりは x/z へ
        const spineX = (s) => bendA * Math.sin(Math.PI * s) * Math.sin(bendPh);
        const spineZ = (s) => bendA * Math.sin(Math.PI * s) * Math.cos(bendPh);
        const band = (x) => smooth(0.0, 0.030, x) * (1 - smooth(0.055, 0.130, x));

        let vo = 0;
        for (let i = 0; i <= NR; i++) {
            const t = i / NR, s = sOf(t);
            const cxp = spineX(s), cyp = (s - 0.5) * 2, czp = spineZ(s);
            // 接線（前後差分）
            const sa2 = Math.min(1, s + 1e-3), sb2 = Math.max(0, s - 1e-3);
            let tx = spineX(sa2) - spineX(sb2), ty = (sa2 - sb2) * 2, tz = spineZ(sa2) - spineZ(sb2);
            const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
            // 【対策】上ベクトルとの外積で断面の基底を作ると、接線が鉛直に
            //         近い所で基底が暴れて筒がねじれる。ここは長軸が y で
            //         弓なりも緩いので、接線が z を向くことは無い。z 基準なら安定
            let a1x = ty * 1 - tz * 0, a1y = tz * 0 - tx * 1, a1z = tx * 0 - ty * 0;
            const l1 = Math.hypot(a1x, a1y, a1z) || 1; a1x /= l1; a1y /= l1; a1z /= l1;
            let a2x = ty * a1z - tz * a1y, a2y = tz * a1x - tx * a1z, a2z = tx * a1y - ty * a1x;
            const l2 = Math.hypot(a2x, a2y, a2z) || 1; a2x /= l2; a2y /= l2; a2z /= l2;
            let rr = bodyR(t) * R;
            // 詰め方のむらで太さがうねる
            rr *= 1 + plump * (Noise.fbm2(0.37, t * 5.0, plumpSeed, 3) - 0.5) * 2;
            const near = Math.max(band(t), band(1 - t));
            const spin = twist * (t < 0.5 ? (0.13 - t) : (t - 0.87));
            for (let j = 0; j <= NS; j++) {
                const phi = (j % NS) / NS * TAU;
                const u = j / NS;
                let r = rr * (1 + oval * Math.cos(2 * (phi - ovalPh)));
                // ケーシングの皺。周方向に細かく長手方向に長い（＝縦皺）
                r *= 1 + 0.020 * (Noise.fbm2u(u * 20, t * 9, 20, wSeed, 2) - 0.5) * 2;
                // 結び目へ収束するひだ。
                // 【対策】先端そのものを最大にすると端面いっぱいに星が出て
                //         ねじり飴の包み紙になる。結び目の少し手前だけ浅く
                if (near > 0) {
                    r *= 1 - 0.060 * near
                        * (0.5 + 0.5 * Math.cos(W.pleatCount * phi + pleatPh + spin * 6));
                }
                const p3 = vo * 3, p2 = vo * 2;
                const cp = Math.cos(phi), sp2 = Math.sin(phi);
                positions[p3] = cxp + (a1x * cp + a2x * sp2) * r;
                positions[p3 + 1] = cyp + (a1y * cp + a2y * sp2) * r;
                positions[p3 + 2] = czp + (a1z * cp + a2z * sp2) * r;
                uvs[p2] = u; uvs[p2 + 1] = t;
                // 焼け具合の場。
                // 【対策】斑が大きいと長手方向へ伸びた帯になって焼き縞に見える
                field[vo] = Noise.fbm2u(u * 5, t * 12, 5, cSeed, 3) * 0.70
                    + Noise.fbm2u(u * 13, t * 28, 13, cSeed + 7, 2) * 0.30;
                bump[vo] = (Noise.fbm2u(u * 9, t * 20, 9, wSeed + 31, 2) - 0.5) * 0.055;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < NR; i++) {
            for (let j = 0; j < NS; j++) {
                const p = i * (NS + 1) + j;
                indices[io++] = p; indices[io++] = p + 1; indices[io++] = p + NS + 1;
                indices[io++] = p + 1; indices[io++] = p + NS + 2; indices[io++] = p + NS + 1;
            }
        }
        const normals = finalize(positions, indices, new V3(0, 0, 0), Math.floor(nV / 2), true);
        weldNormals(positions, normals);

        // ---- 焼き色を頂点へ焼く ------------------------------------------
        // 【対策】fbm の出力は 0..1 に一様分布しない。ウィンナー.js での実測では
        //         3オクターブで平均 0.467・標準偏差 0.134（最大 0.81）しかなく、
        //         smooth(0.86, 0.96, fbm) のような閾値は一度も発火しない。
        //         あちらは正規分布の CDF で近似していたが、ここは頂点が
        //         2000 個しかないので、順位でそのまま一様化してしまえる。
        //         こうすると「濃い斑 30%・炭化 3.5%」が面積比として厳密に出る
        const order = new Int32Array(nV);
        for (let i = 0; i < nV; i++) order[i] = i;
        const fa = Array.from(order).sort((a, b) => field[a] - field[b]);
        const rank = new Float32Array(nV);
        for (let k = 0; k < nV; k++) rank[fa[k]] = k / Math.max(1, nV - 1);

        const baseCol = new Float32Array(nV * 3);
        for (let i = 0; i < nV; i++) {
            const B = rank[i];
            const t = positions[i * 3 + 1] * 0.5 + 0.5;   // 0..1（長手方向）
            // 標準の焼き色を地に、浅い所・濃い斑・炭化を面積比で重ねる
            let c = mix3(W.pale, W.cook, smooth(0.0, 0.30, B));
            const charK = smooth(1 - W.charArea, 1 - W.charArea * 0.25, B);
            c = mix3(c, W.char, charK);
            const burnK = smooth(1 - W.burnArea, 1 - W.burnArea * 0.2, B);
            c = mix3(c, W.burn, burnK);
            // 焼きの浅い所（フライパンに当たらなかった面）
            const paleK = smooth(W.paleArea, W.paleArea * 0.25, B) * (1 - burnK);
            c = mix3(c, W.pale, paleK * 0.7);
            // 結び目は火が回りやすく必ず濃い
            const tie = smooth(0.045, 0.0, t) + smooth(0.955, 1.0, t);
            if (tie > 0) c = mix3(c, [0.336, 0.180, 0.098], tie * 0.60);
            baseCol[i * 3] = c[0]; baseCol[i * 3 + 1] = c[1]; baseCol[i * 3 + 2] = c[2];
        }
        return { positions, indices, normals, uvs, cut, bump, baseCol, nV };
    }

    // ---- 具のプロファイル ------------------------------------------------
    // 色はすべて sRGB。参考写真の実測値
    const CHUNK_SPEC = {
        potato: {
            label: "じゃがいも",
            size: 1.28,                            // 代表半径 [cm]
            // 煮くずれかけの男爵。カレーの色が染みるので純粋な黄ではない
            // 実測: 明るい面 sRGB(0.91, 0.72, 0.26)。カレーの中のじゃがいもは
            // ターメリックが染みるので、ふかし芋より青がずっと低い
            body: [0.868, 0.708, 0.336],
            cutCol: [0.910, 0.780, 0.436],         // 切断面は明るく粉っぽい
            deep: [0.716, 0.522, 0.196],
            rough: 0.63, coat: 0.38, coatRough: 0.42,
            trans: 0.16, thick: 0.22,
            transTint: [0.882, 0.700, 0.286],   // 透けた光は粉っぽい黄
            // 【対策】k=0.145 だと切り口まで丸まって「石鹸」になり、
            //         乱切りに見えない。煮くずれで角は落ちるが、面そのものは
            //         最後まで残る。丸めは稜線だけに効く幅まで詰める
            k: 0.072,
            axes: [1.00, 0.90, 0.96], nPlane: 5, planeD: [0.54, 0.80],
            bands: [{ f: 1.7, a: 0.055 }, { f: 4.1, a: 0.030 }, { f: 11.0, a: 0.013 }],
            nP: 22, nT: 34
        },
        carrot: {
            label: "にんじん",
            size: 1.02,
            body: [0.840, 0.392, 0.124],
            cutCol: [0.882, 0.470, 0.176],
            deep: [0.622, 0.234, 0.066],
            core: [0.896, 0.586, 0.278],           // 芯（木部）は淡い
            rough: 0.40, coat: 0.48, coatRough: 0.34,
            trans: 0.42, thick: 0.30,
            transTint: [0.800, 0.222, 0.046],   // 逆光のにんじんは真っ赤に透ける
            k: 0.048,                              // 乱切りの稜線は立っている
            // 側面は太さの変わらない円柱。切り口は斜めの2枚
            // 乱切りの比率は「長さ ≒ 太さの 1.6 倍」。棒が細長いまま残ると
            // 拍子木切りに、短すぎると輪切りになる
            axes: [0.80, 1.10, 0.80], cylR: 0.80, taper: 0.14, layDown: true,
            nPlane: 2, planeD: [0.62, 0.88],
            bands: [{ f: 2.6, a: 0.024 }, { f: 8.0, a: 0.012 }],
            nP: 22, nT: 34
        },
        wiener: {
            label: "ウィンナー",
            // 半長 = 1 の局所形状を作るので、size は「半分の長さ」[cm]。
            // 【対策】4.1cm × 1.15cm は皿（26cm）に対して小さすぎ、
            //         じゃがいも（差し渡し 2.6cm）より細いので豆に見える。
            //         市販のウィンナーは 5.5〜6cm × 1.5〜1.7cm
            size: 2.85,                            // 全長 5.7cm / 太さ 1.64cm
            // 置き場所を決めるときにルウの縁から空ける距離の係数。
            // 【対策】ウィンナーは寝そべるので、半長ぶんの余裕を要求すると
            //         ルウの真ん中にしか置けなくなり、数を増やしても入らない
            placeK: 0.52,
            body: [0.812, 0.408, 0.162],
            cutCol: [0.876, 0.548, 0.318],
            deep: [0.566, 0.250, 0.098],
            // 脂の膜で強く照る。ハイライトは点ではなく稜に沿った長い筋になる
            rough: 0.34, coat: 0.86, coatRough: 0.19,
            trans: 0.20, thick: 0.24,
            transTint: [0.720, 0.300, 0.240],   // 挽き肉は縁がわずかに赤く抜ける
            // 【対策】寝かせる角度のばらつきが ±0.30rad だと、実測で 46° 立った
            //         個体が出た。乱切りの野菜は転がるが、ウィンナーは
            //         ルウの上に寝そべる。振れ幅を詰める
            layDown: true, laySd: 0.10,
            // 【対策】沈める処理は「接地したまま縦に潰す」ので、
            //         ソーセージだと潰れた形が不自然になる（実測 1.15→0.79cm）。
            //         丸ごと沈めても見えないだけなので、常に顔を出させる
            neverSunk: true,
            nPlane: 0, k: 0.1, axes: [1, 1, 1], planeD: [1, 1], bands: [],
            nP: 0, nT: 0
        },
        meat: {
            label: "牛肉",
            size: 1.05,
            // 実測: ルウを着た牛肉の明部は sRGB(0.60, 0.40, 0.22) 付近まで
            // 上がる。地色を落としすぎると「炭」になるので少し持ち上げる
            body: [0.412, 0.222, 0.118],
            cutCol: [0.480, 0.278, 0.156],
            deep: [0.238, 0.114, 0.062],
            rough: 0.52, coat: 0.46, coatRough: 0.36,
            trans: 0.10, thick: 0.20,
            transTint: [0.430, 0.128, 0.062],
            k: 0.058,                              // 繊維が残るので角は立つ
            axes: [1.00, 0.58, 0.86], nPlane: 3, planeD: [0.44, 0.68],
            bands: [{ f: 2.2, a: 0.075 }, { f: 5.5, a: 0.040 }, { f: 15.0, a: 0.020 }],
            nP: 20, nT: 32
        }
    };

    // 具1個ぶんのメッシュ。ワールド座標のまま作る（あとでルウ面へ焼くため）
    // 【対策】ローカルで作って親へぶら下げると、最上点バッファを取るときに
    //         毎回ワールド行列を掛ける必要が出て、しかも取りこぼす
    function makeChunk(kind, cx, cy, cz, sc, rot, seed) {
        const S = CHUNK_SPEC[kind];
        const rng = new Rng(seed >>> 0);
        // 切断面をランダムな向きに配る。
        // 【対策】平面をランダムに置くと、たまたま2枚が近い向きになって
        //         薄い破片ができる。黄金角で回して最低限ばらけさせる
        const planes = [];
        for (let i = 0; i < S.nPlane; i++) {
            let n;
            if (kind === "carrot") {
                // 乱切り: 棒を転がしながら斜めに切る。
                // 【対策】2枚の切り口の方位が揃うと、ただの平行四辺形の
                //         輪切りになる。乱切りが乱切りに見えるのは、
                //         転がすぶん方位が 90〜150° ずれているから。
                //         1枚目の方位を覚えて、2枚目をそこからずらす
                const s = i === 0 ? 1 : -1;
                const a = rng.range(0.38, 0.80);
                const b = (i === 0) ? rng.range(0, TAU)
                    : planes[0].az + rng.range(1.55, 2.65) * (rng.next() < 0.5 ? 1 : -1);
                n = [Math.sin(a) * Math.cos(b), s * Math.cos(a), Math.sin(a) * Math.sin(b)];
                const l0 = Math.hypot(n[0], n[1], n[2]) || 1;
                planes.push({ n: [n[0] / l0, n[1] / l0, n[2] / l0], az: b,
                    d: rng.range(S.planeD[0], S.planeD[1]) });
                continue;
            } else {
                const ga = i * 2.39996 + rng.range(0, 0.9);
                const el = rng.range(-0.85, 0.85);
                const cl = Math.sqrt(Math.max(0, 1 - el * el));
                n = [cl * Math.cos(ga), el, cl * Math.sin(ga)];
            }
            const l = Math.hypot(n[0], n[1], n[2]) || 1;
            planes.push({ n: [n[0] / l, n[1] / l, n[2] / l], d: rng.range(S.planeD[0], S.planeD[1]) });
        }
        const g = (kind === "wiener")
            ? makeWienerGeom(seed)
            : buildBlob({
                axes: S.axes, cylR: S.cylR, taper: S.taper,
                planes: planes, k: S.k, bands: S.bands, seed: seed
            }, S.nP, S.nT);

        const q = rot;
        const m = BABYLON.Matrix.Identity();
        BABYLON.Matrix.FromQuaternionToRef(q, m);
        const P = g.positions, N = g.normals, nV = g.nV;
        const colors = new Float32Array(nV * 4).fill(1);
        const tv = new V3(), tn = new V3();
        const scl = S.size * sc;
        // 一旦ワールドへ移し、最下点を測ってから座らせる
        for (let i = 0; i < nV; i++) {
            tv.set(P[i * 3] * scl, P[i * 3 + 1] * scl, P[i * 3 + 2] * scl);
            V3.TransformCoordinatesToRef(tv, m, tv);
            P[i * 3] = tv.x + cx; P[i * 3 + 1] = tv.y + cy; P[i * 3 + 2] = tv.z + cz;
            tn.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
            V3.TransformNormalToRef(tn, m, tn);
            N[i * 3] = tn.x; N[i * 3 + 1] = tn.y; N[i * 3 + 2] = tn.z;
        }
        return { g, colors, S, kind, seed };
    }

    // 具の頂点カラーを焼く。ルウの被膜はここで入る。
    // 【対策】カレーの具は「上面だけ地の色、それ以外はルウ色」ではない。
    //         引き上げた直後の膜がゆっくり流れ落ちるので、上面の高いところから
    //         順に地の色が出てくる。液面からの高さの指数減衰で表せる:
    //             被覆率 = exp(-(y - 液面) / drain)
    //         drain はルウの粘度そのもの。0.6cm 前後で写真と合う
    function bakeChunkColor(ch, poolY, roux, G, seedShift) {
        const { g, colors, S } = ch;
        const nV = g.nV;
        const rng = new Rng((ch.seed ^ 0x3C0A) >>> 0);
        const tone = rng.range(-0.06, 0.06);
        const warm = rng.range(0.97, 1.04);
        // ルウ色（リニアで混ぜる）
        const R0 = s2l(roux.base[0]), R1 = s2l(roux.base[1]), R2 = s2l(roux.base[2]);
        const D0 = s2l(roux.deep[0]), D1 = s2l(roux.deep[1]), D2 = s2l(roux.deep[2]);
        for (let i = 0; i < nV; i++) {
            const x = g.positions[i * 3], y = g.positions[i * 3 + 1], z = g.positions[i * 3 + 2];
            const ny = g.normals[i * 3 + 1];
            const cutW = g.cut[i], b = g.bump[i];
            // 【対策】ウィンナーの焼き色は「出っ張り／くぼみ」では決まらず、
            //         鉄板のどこに当たったかで決まる斑なので、
            //         幾何を作るときに頂点へ焼いてある。あればそれを使う
            let c;
            if (g.baseCol) {
                c = [g.baseCol[i * 3], g.baseCol[i * 3 + 1], g.baseCol[i * 3 + 2]];
                c = mix3(c, S.deep, clamp(0.5 + b / 0.09 + tone, 0, 1) * 0.18);
            } else {
                // 地の色。出っ張りは煮汁が当たって濃く、くぼみは淡い（SKILL 2.1）
                c = mix3(S.body, S.deep, clamp(0.5 + b / 0.09 + tone, 0, 1) * 0.6);
                c = mix3(c, S.cutCol, cutW * 0.75);
            }
            if (S.core) {
                // 【対策】にんじんの芯（木部）は切断面の中央にだけ見える。
                //         切断面らしさ cutW と、面の中心らしさ（ノイズが
                //         小さいところ＝平らなところ）の積で出す
                const coreW = cutW * cutW * (1 - smooth(0.010, 0.045, Math.abs(b)));
                c = mix3(c, S.core, coreW * 0.55);
            }
            c = [c[0] * warm, c[1], c[2] / warm];
            let lr = s2l(clamp(c[0], 0, 1)), lg = s2l(clamp(c[1], 0, 1)), lb = s2l(clamp(c[2], 0, 1));
            // ルウの被膜
            const h = Math.max(0, y - poolY);
            let cov = Math.exp(-h / G.drain);
            // 【対策】上を向いた面ほど膜が薄い（重力で落ちる）。法線の y を
            //         使って傾ける。これが無いと球全体が均一に濡れて団子になる
            cov *= 0.55 + 0.45 * (1 - clamp(ny, 0, 1));
            // 流れ落ちる筋。垂直方向に伸びたノイズ
            const drip = Noise.fbm3(x * 3.4, y * 0.9, z * 3.4, (ch.seed + 501) >>> 0, 3);
            cov = clamp(cov * (0.72 + 0.62 * drip), 0, 1);
            if (h <= 0) cov = 1;
            const rr2 = mix(R0, D0, 1 - clamp(drip, 0, 1) * 0.7);
            const gg2 = mix(R1, D1, 1 - clamp(drip, 0, 1) * 0.7);
            const bb2 = mix(R2, D2, 1 - clamp(drip, 0, 1) * 0.7);
            lr = mix(lr, rr2, cov); lg = mix(lg, gg2, cov); lb = mix(lb, bb2, cov);
            const o = i * 4;
            colors[o] = lr; colors[o + 1] = lg; colors[o + 2] = lb; colors[o + 3] = 1;
        }
        return colors;
    }

    function chunkMaterial(scene, S, name) {
        const m = new BABYLON.PBRMaterial(name, scene);
        // 色は全部頂点カラーで持つので、アルベドは白
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0.0;
        m.roughness = S.rough;
        // 【対策】ルウをかぶった具の照りを roughness で作ると、地の出ている
        //         上面まで一緒に光ってプラスチックになる。照りは clearCoat
        //         （＝ルウの油膜, IOR 1.47）へ全部持たせる
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = S.coat;
        m.clearCoat.roughness = S.coatRough;
        m.clearCoat.indexOfRefraction = 1.47;
        const sub = m.subSurface;
        sub.isTranslucencyEnabled = true;
        sub.translucencyIntensity = S.trans;
        // 【対策】tintColor を既定（白）のままにすると、透過した光が
        //         そのまま白として乗る。にんじんの透過率は 0.42 もあるので、
        //         実測でリニア 0.10 ぶんの無彩色が具の上に足され、
        //         橙のはずのにんじんが sRGB(0.74, 0.42, 0.36) の
        //         サーモンピンクになっていた。透過光は具の中を通るので、
        //         必ずその具の色に染まる
        sub.tintColor = col3(S.transTint);
        sub.minimumThickness = 0.05;
        sub.maximumThickness = S.thick;
        return m;
    }

    // ---- 玉ねぎ（くし切り）------------------------------------------------
    // 【対策】以前の玉ねぎは「煮崩れて薄い膜になったもの」で、だ円体の
    //         一部を切り取った薄いシェルだった。長時間煮るカレーでは
    //         それも正しいが、厚み 0.5mm の帯なのでルウの中でほとんど
    //         見えず、具の数を増やしても画に出てこない。
    //         肉じゃが.js のくし切りを持ってきて、形の残った一片にする。
    //
    //         くし切り = 扁平な回転楕円体を、極を通る2枚の半平面で切り出した
    //         「みかんの房」。この立体には性質がひとつあって、切断面
    //         （軸を含む鉛直半平面）は必ず平面になる。そこに現れる皮の層は
    //         半径方向の比率 t が一定の曲線——つまり相似に縮小した半楕円——
    //         として並ぶ。層を「同心円」で描くと球の断面になってしまうので、
    //         かならず t（相似比）で刻む
    const ONION = {
        size: 1.58,                 // 玉ねぎの赤道半径 [cm]
        flat: 0.80,                 // 極方向の扁平率
        // 【対策】カレーの玉ねぎは、ルウを作る前に飴色になるまで炒めてある。
        //         煮ただけのクリーム色（G/R 0.89・B/R 0.62）だと、茶色い
        //         ルウの中で「生っぽい白い塊」として浮く。飴色は
        //         メイラード反応の色で、実測すると G/R 0.60・B/R 0.22 まで
        //         落ちる。青をここまで落とさないと飴色にはならない
        // 【対策】飴色にはしたが、まだルウ（地色 sRGB 0.455/0.250/0.062）
        //         より 1.6 倍明るく、皿の上で「クリーム色の欠片」として
        //         浮いていた。ルウの中で 20 分煮た玉ねぎは、飴色に炒めた
        //         うえからルウが染みているので、明るいほうのルウのムラ
        //         （pale = 0.606/0.360/0.098）とほぼ同じ明るさになる
        body: [0.616, 0.364, 0.116],
        layer: [0.418, 0.208, 0.054],   // 層の境目（焦げとルウが入って濃い）
        edge: [0.722, 0.472, 0.192],    // 縁は薄くて光が抜ける
        deep: [0.318, 0.150, 0.038],
        nPsi: 24, nTh: 12, nRad: 12
    };

    // 一部の頂点だけ法線を溶接する。
    // 【対策】くし切りは包丁の切り口が「稜線として立っている」ことが形の
    //         決め手になる。全体に weldNormals を掛けると切り口まで丸まって、
    //         煮えすぎたはんぺんに見える。極（縮退した点）だけ溶接する
    function weldRange(positions, normals, from, to) {
        const map = new Map();
        for (let i = from; i < to; i++) {
            const k = Math.round(positions[i * 3] * 8192) + "," +
                Math.round(positions[i * 3 + 1] * 8192) + "," +
                Math.round(positions[i * 3 + 2] * 8192);
            let a = map.get(k); if (!a) { a = []; map.set(k, a); }
            a.push(i);
        }
        for (const a of map.values()) {
            if (a.length < 2) continue;
            let nx = 0, ny = 0, nz = 0;
            for (const i of a) { nx += normals[i * 3]; ny += normals[i * 3 + 1]; nz += normals[i * 3 + 2]; }
            const l = Math.hypot(nx, ny, nz) || 1;
            for (const i of a) { normals[i * 3] = nx / l; normals[i * 3 + 1] = ny / l; normals[i * 3 + 2] = nz / l; }
        }
    }

    function makeOnionGeom(cx, cy, cz, sc, rot, seed) {
        const O = ONION, rng = new Rng(seed >>> 0);
        const NP = O.nPsi, NT = O.nTh, NS = O.nRad;
        // 【対策】「煮えた房は外側ほど開く」を方位角を t で広げる形で
        //         入れると、切り口が平面ではなく線織面になってねじれる。
        //         包丁は平面しか作らない。開きは半角そのもので出し、
        //         切り口は y 軸を含む半平面に厳密に載せる
        const half = rng.range(0.32, 0.52);          // 房の半角 [rad]
        const th0 = -half, th1 = half;
        const H = O.flat * rng.range(0.90, 1.08);    // 極半径
        const nSeed = seed + 77;
        // 層の境目。外ほど厚い（実物の鱗片は外側が厚い）
        const nLay = 5 + rng.int(3);
        const lay = [];
        { let t = 1.0; for (let i = 0; i < nLay; i++) { lay.push(t); t *= rng.range(0.70, 0.84); } }
        // 赤道半径の向き依存のゆらぎ（玉ねぎは真球ではない）
        const Rof = (psi, th) => {
            const s = Math.sin(psi);
            let r = 1 + 0.045 * (Noise.v3(Math.cos(th) * 1.7, Math.cos(psi) * 1.9,
                Math.sin(th) * 1.7, nSeed) - 0.5) * 2;
            r *= 1 - 0.070 * Math.pow(Math.abs(Math.cos(psi)), 5);   // 根元と芽はへこむ
            return r * s;
        };
        const grooveAt = (t) => {
            let g = 0;
            for (const L of lay) g = Math.max(g, 1 - smooth(0, 0.030, Math.abs(t - L)));
            return g;
        };
        const nOuter = (NP + 1) * (NT + 1);
        const nFace = (NP + 1) * (NS + 1);
        const nV = nOuter + nFace * 2;
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const colors = new Float32Array(nV * 4).fill(1);
        const idx = [];
        const tmp = [0, 0, 0];
        // 房の点。t=1 が外周、t=0 が軸
        function pt(psi, thN, t, out) {
            const rho = Rof(psi, thN) * t;
            // 【対策】層の溝の深さを極でも一定にすると、軸へ集まるはずの
            //         頂点が溝ぶんだけ散って中心に微小な棘が立ち、法線が
            //         壊れる。極では溝を閉じる
            const gr = grooveAt(t) * 0.012 * Math.sin(psi);
            out[0] = (rho - gr) * Math.cos(thN);
            out[1] = H * Math.cos(psi) * (1 - gr * 0.4);
            out[2] = (rho - gr) * Math.sin(thN);
        }
        const setCol = (v, c) => {
            const o = v * 4;
            colors[o] = s2l(clamp(c[0], 0, 1));
            colors[o + 1] = s2l(clamp(c[1], 0, 1));
            colors[o + 2] = s2l(clamp(c[2], 0, 1));
        };
        let vo = 0;
        // (a) 外周の面
        for (let i = 0; i <= NP; i++) {
            const psi = i / NP * Math.PI;
            for (let j = 0; j <= NT; j++) {
                const thN = mix(th0, th1, j / NT);
                pt(psi, thN, 1.0, tmp);
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = tmp[0]; positions[p3 + 1] = tmp[1]; positions[p3 + 2] = tmp[2];
                uvs[p2] = j / NT; uvs[p2 + 1] = i / NP;
                const sh = Noise.fbm3(tmp[0] * 3.1, tmp[1] * 3.1, tmp[2] * 3.1, nSeed + 5, 2) - 0.5;
                setCol(vo, mix3(O.body, O.deep, clamp(0.5 + sh * 1.6, 0, 1) * 0.42));
                vo++;
            }
        }
        for (let i = 0; i < NP; i++) {
            for (let j = 0; j < NT; j++) {
                const p = i * (NT + 1) + j;
                idx.push(p, p + 1, p + NT + 1, p + 1, p + NT + 2, p + NT + 1);
            }
        }
        const outerEnd = vo;
        // (b) 切断面 ×2。t=0 が軸、t=1 が外周
        for (let side = 0; side < 2; side++) {
            const thN = side ? th1 : th0;
            const b0 = vo;
            for (let i = 0; i <= NP; i++) {
                const psi = i / NP * Math.PI;
                for (let s = 0; s <= NS; s++) {
                    // 【対策】t を等間隔に刻むと、外側の薄い層が1マスに
                    //         2本入って潰れる。外側を密に刻む
                    const t = Math.pow(s / NS, 0.72);
                    pt(psi, thN, t, tmp);
                    const p3 = vo * 3, p2 = vo * 2;
                    positions[p3] = tmp[0]; positions[p3 + 1] = tmp[1]; positions[p3 + 2] = tmp[2];
                    uvs[p2] = t; uvs[p2 + 1] = i / NP;
                    const gr = grooveAt(t);
                    let c = mix3(O.body, O.layer, gr * 0.75);
                    const eg = smooth(0.86, 1.0, t) * 0.55
                        + smooth(0.90, 1.0, Math.abs(Math.cos(psi))) * 0.45;
                    c = mix3(c, O.edge, clamp(eg, 0, 1) * 0.55);
                    setCol(vo, c);
                    vo++;
                }
            }
            for (let i = 0; i < NP; i++) {
                for (let s = 0; s < NS; s++) {
                    const p = b0 + i * (NS + 1) + s;
                    // 【対策】外周の面は th0 側の境界を i+1→i、th1 側を
                    //         i→i+1 の向きで走る。切断面はその逆向きで
                    //         張らないと巻きが揃わず、切り口だけ法線が内を向く
                    if (side === 0) idx.push(p, p + 1, p + NS + 1, p + 1, p + NS + 2, p + NS + 1);
                    else idx.push(p, p + NS + 1, p + 1, p + 1, p + NS + 1, p + NS + 2);
                }
            }
        }
        const indices = new Uint32Array(idx);
        const normals = finalize(positions, indices, new V3(0, 0, 0), 0, true);
        weldRange(positions, normals, 0, outerEnd);
        weldRange(positions, normals, outerEnd, outerEnd + nFace);
        weldRange(positions, normals, outerEnd + nFace, nV);
        // 姿勢と位置。ワールド座標のまま返す（最上点バッファへ焼くため）
        const m = BABYLON.Matrix.Identity();
        BABYLON.Matrix.FromQuaternionToRef(rot, m);
        const tv = new V3(), tn = new V3();
        const scl = O.size * sc;
        let top = -1e9;
        for (let i = 0; i < nV; i++) {
            tv.set(positions[i * 3] * scl, positions[i * 3 + 1] * scl, positions[i * 3 + 2] * scl);
            V3.TransformCoordinatesToRef(tv, m, tv);
            positions[i * 3] = tv.x + cx;
            positions[i * 3 + 1] = tv.y + cy;
            positions[i * 3 + 2] = tv.z + cz;
            if (positions[i * 3 + 1] > top) top = positions[i * 3 + 1];
            tn.set(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
            V3.TransformNormalToRef(tn, m, tn);
            const l = Math.hypot(tn.x, tn.y, tn.z) || 1;
            normals[i * 3] = tn.x / l; normals[i * 3 + 1] = tn.y / l; normals[i * 3 + 2] = tn.z / l;
        }
        return { positions, indices, normals, uvs, colors, nV, top, x: cx, z: cz };
    }

    function onionMesh(scene, g, mat) {
        const mesh = makeMesh("onion", g.positions, g.indices, g.normals, g.uvs, g.colors, scene);
        mesh.material = mat;
        return mesh;
    }

    // 玉ねぎにルウの膜を着せる。
    // 【対策】じゃがいもや肉は bakeChunkColor でルウの被膜を着せているのに、
    //         玉ねぎだけ自前の色をそのまま出していた。同じルウに浸かって
    //         いるのに1種類だけ膜が無いので、どれだけ色を合わせても
    //         「あとから貼りつけた別の絵」に見える。同じ式で着せる:
    //             被覆率 = exp(-(y - 液面) / drain)
    //         これで、液面から出ている頂だけ地の飴色が覗き、あとは
    //         ルウ色へなじむ
    function coatOnion(g, poolY, roux, G, seed) {
        const R0 = s2l(roux.base[0]), R1 = s2l(roux.base[1]), R2 = s2l(roux.base[2]);
        const D0 = s2l(roux.deep[0]), D1 = s2l(roux.deep[1]), D2 = s2l(roux.deep[2]);
        for (let i = 0; i < g.nV; i++) {
            const x = g.positions[i * 3], y = g.positions[i * 3 + 1], z = g.positions[i * 3 + 2];
            const ny = g.normals[i * 3 + 1];
            const h = Math.max(0, y - poolY);
            let cov = Math.exp(-h / G.drain);
            // 上を向いた面ほど膜が薄い（重力で落ちる）
            cov *= 0.55 + 0.45 * (1 - clamp(ny, 0, 1));
            const drip = Noise.fbm3(x * 3.4, y * 0.9, z * 3.4, (seed + 501) >>> 0, 3);
            cov = clamp(cov * (0.72 + 0.62 * drip), 0, 1);
            if (h <= 0) cov = 1;
            const t = 1 - clamp(drip, 0, 1) * 0.7;
            const rr = mix(R0, D0, t), gg = mix(R1, D1, t), bb = mix(R2, D2, t);
            const o = i * 4;
            g.colors[o] = mix(g.colors[o], rr, cov);
            g.colors[o + 1] = mix(g.colors[o + 1], gg, cov);
            g.colors[o + 2] = mix(g.colors[o + 2], bb, cov);
        }
    }

    function onionMaterial(scene) {
        const m = new BABYLON.PBRMaterial("onionMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0.0; m.roughness = 0.34;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.85;
        m.clearCoat.roughness = 0.16;
        m.clearCoat.indexOfRefraction = 1.45;
        // 煮えた玉ねぎは光を通すが、【対策】0.78 は厚み 0.5mm の膜だった
        //         ときの値。中身の詰まったくし切りに同じ値を与えると、
        //         拡散の8割を透過へ回すことになって発光した寒天に見える
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.46;
        // 透過光は玉ねぎの中を通るので、必ず飴色に染まる
        m.subSurface.tintColor = col3([0.74, 0.42, 0.14]);
        m.subSurface.minimumThickness = 0.01;
        m.subSurface.maximumThickness = 0.10;
        m.backFaceCulling = true;
        return m;
    }

    // ---- 福神漬け -------------------------------------------------------
    // 【対策】歯車状に波打った円盤（放射状の山と谷を cos(a*lobes) で作る）に
    //         していたが、あれは実物ではなく「赤い花形の飾り」だった。
    //         参考写真を見ると福神漬けは
    //           ・大根・れんこん・なす・きゅうり・しその実を刻んだもので、
    //             1片ずつ形が違う。円形の要素はどこにも無い
    //           ・包丁で切ってあるので輪郭は直線の辺でできた多角形。
    //             周期的な波は出ない
    //           ・厚さ 1mm 前後の薄片で、漬かってわずかに反っている
    //           ・色は朱色に近い赤橙。暗赤色にすると干した唐辛子になる
    //         なので、乱数で角を打った不定形の多角形を薄く押し出す。
    //         周期関数をやめただけで、花形は消える
    const FUKUJIN = {
        lit: [0.892, 0.302, 0.156],    // 光の当たった面
        mid: [0.762, 0.208, 0.108],    // 地の色
        deep: [0.512, 0.116, 0.068],   // 影の側・漬け汁の溜まった所
        cut: [0.606, 0.152, 0.092],    // 厚みの断面
        dark: [0.238, 0.088, 0.062]    // 昆布・なす・しその実の黒っぽい欠片
    };

    // 1片ぶんの薄片を「原点まわりのローカル座標」で作り、メッシュの
    // position / rotationQuaternion で置く。
    // 【対策】以前は頂点をワールド座標で焼いていたが、そうすると物理へ
    //         渡したあと姿勢を反映する先が無い。物理に載せるものは
    //         かならずローカルで作り、変換はノードに持たせる
    function buildFukujinFlake(scene, seed, mat) {
        const rng = new Rng(seed >>> 0);
        const NC = 4 + rng.int(3);              // 角の数
        const NT = NC * 6;                      // 1辺を6分割して直線を保つ
        const R = rng.range(0.28, 0.50);        // 差し渡し 5〜10mm
        const th = rng.range(0.055, 0.095);     // 厚み [cm]
        // 角の位置。等分した区画の中で振ると、最低限の間隔が保証される
        const P = [];
        for (let c = 0; c < NC; c++) {
            const a = (c + rng.range(0.15, 0.85)) / NC * TAU;
            const r = R * rng.range(0.60, 1.18);
            P.push([r * Math.cos(a), r * Math.sin(a)]);
        }
        // 角と角のあいだを直線で結んで標本化する。
        // 【対策】半径を角度の関数（r(θ)）で持つと、どう乱数を入れても
        //         「丸から少し歪んだ形」にしかならない。辺を直線で
        //         引くことが、包丁で切った形に見えるかどうかを決める
        const ring = [];
        for (let j = 0; j < NT; j++) {
            const t = j / NT * NC, k = Math.floor(t), f = t - k;
            const a2 = P[k % NC], b2 = P[(k + 1) % NC];
            ring.push([a2[0] + (b2[0] - a2[0]) * f, a2[1] + (b2[1] - a2[1]) * f]);
        }
        // 角をほんの少しだけ落とす（漬かった大根の角は立っていない）
        for (let pass = 0; pass < 2; pass++) {
            const src = ring.map((q) => [q[0], q[1]]);
            for (let j = 0; j < NT; j++) {
                const a2 = src[(j - 1 + NT) % NT], b2 = src[j], c2 = src[(j + 1) % NT];
                ring[j][0] = b2[0] * 0.72 + (a2[0] + c2[0]) * 0.14;
                ring[j][1] = b2[1] * 0.72 + (a2[1] + c2[1]) * 0.14;
            }
        }
        // 反り。漬かった薄片は平らではなく、片側へゆるく丸まる
        const curlA = rng.range(-0.22, 0.22), curlPh = rng.range(0, TAU);
        const curlB = rng.range(0.10, 0.42);
        const bendY = (x, z) => {
            const u = x * Math.cos(curlPh) + z * Math.sin(curlPh);
            const v = -x * Math.sin(curlPh) + z * Math.cos(curlPh);
            return curlA * u + curlB * (u * u - v * v * 0.35);
        };
        // 片ごとの色。1割ほどは昆布やなすの黒っぽい欠片
        const isDark = rng.next() < 0.12;
        const tone = rng.range(0, 1);
        const face = isDark ? FUKUJIN.dark
            : mix3(FUKUJIN.mid, FUKUJIN.lit, tone * tone);
        const edge = isDark
            ? [FUKUJIN.dark[0] * 0.7, FUKUJIN.dark[1] * 0.7, FUKUJIN.dark[2] * 0.7]
            : mix3(FUKUJIN.cut, FUKUJIN.deep, 0.4);

        const nVv = (NT + 1) * 4;
        const positions = new Float32Array(nVv * 3);
        const uvs = new Float32Array(nVv * 2);
        const colors = new Float32Array(nVv * 4).fill(1);
        const indices = [];
        let vo = 0;
        for (let lay = 0; lay < 2; lay++) {
            const yy = (lay ? 0.5 : -0.5) * th;
            for (let ringI = 0; ringI < 2; ringI++) {
                const k = ringI ? 1 : 0.0;   // 0 = 中心、1 = 外周
                for (let j = 0; j <= NT; j++) {
                    const q = ring[j % NT];
                    const lx = q[0] * k, lz = q[1] * k;
                    const p3 = vo * 3, p2 = vo * 2;
                    positions[p3] = lx;
                    positions[p3 + 1] = yy + bendY(lx, lz);
                    positions[p3 + 2] = lz;
                    uvs[p2] = j / NT; uvs[p2 + 1] = k;
                    // 面は地の色。外周のリングは厚みの断面と共有して
                    // いるので、切り口の色を混ぜて縁を締める
                    const c = mix3(mix3(face, FUKUJIN.deep, k * 0.30), edge, k * 0.45);
                    const o = vo * 4;
                    colors[o] = s2l(c[0]); colors[o + 1] = s2l(c[1]); colors[o + 2] = s2l(c[2]);
                    vo++;
                }
            }
        }
        const S = NT + 1;
        for (let lay = 0; lay < 2; lay++) {
            const b2 = lay * S * 2;
            for (let j = 0; j < NT; j++) {
                if (lay === 0) indices.push(b2 + j, b2 + j + 1, b2 + S + j,
                    b2 + j + 1, b2 + S + j + 1, b2 + S + j);
                else indices.push(b2 + j, b2 + S + j, b2 + j + 1,
                    b2 + j + 1, b2 + S + j, b2 + S + j + 1);
            }
        }
        // 側面（厚みの断面）。外周のリングをそのまま使う
        for (let j = 0; j < NT; j++) {
            const a2 = S + j, b2 = S * 3 + j;
            indices.push(a2, b2, a2 + 1, a2 + 1, b2, b2 + 1);
        }
        const idx = new Uint32Array(indices);
        const normals = finalize(positions, idx, new V3(0, 0, 0), 0, true);
        weldNormals(positions, normals);
        const mesh = makeMesh("fukujin", positions, idx, normals, uvs, colors, scene);
        mesh.material = mat;
        return { mesh: mesh, positions: positions, nV: nVv, R: R };
    }

    // 姿勢 q を掛けたときの最下点（ローカル）。物理を使わないときの
    // 座らせ量に要る
    function lowestUnder(f, q) {
        const m = BABYLON.Matrix.Identity();
        BABYLON.Matrix.FromQuaternionToRef(q, m);
        const tv = new V3();
        let lo = 1e9;
        for (let i = 0; i < f.nV; i++) {
            tv.set(f.positions[i * 3], f.positions[i * 3 + 1], f.positions[i * 3 + 2]);
            V3.TransformCoordinatesToRef(tv, m, tv);
            if (tv.y < lo) lo = tv.y;
        }
        return lo;
    }

    // 福神漬けを落とすための当たり判定。ごはんの盛りと皿の上面を、
    // 添えるあたりだけ切り出した板として作る。
    // 【対策】厚みゼロの一枚殻に凸包を落とすと、すり抜けたときに戻る先が
    //         無い。下へ 2cm 押し出して閉じた立体にする
    function buildFukujinCollider(scene, cx, cz, seatFn, R, N) {
        const per = (N + 1) * (N + 1);
        const pos = new Float32Array(per * 2 * 3);
        const idx = [];
        for (let side = 0; side < 2; side++) {
            for (let j = 0; j <= N; j++) {
                const z = cz + (j / N * 2 - 1) * R;
                for (let i = 0; i <= N; i++) {
                    const x = cx + (i / N * 2 - 1) * R;
                    const o = (side * per + j * (N + 1) + i) * 3;
                    pos[o] = x;
                    pos[o + 1] = seatFn(x, z) - (side ? 2.0 : 0);
                    pos[o + 2] = z;
                }
            }
        }
        for (let side = 0; side < 2; side++) {
            const b = side * per;
            for (let j = 0; j < N; j++) {
                for (let i = 0; i < N; i++) {
                    const p = b + j * (N + 1) + i;
                    if (side === 0) idx.push(p, p + N + 1, p + 1, p + 1, p + N + 1, p + N + 2);
                    else idx.push(p, p + 1, p + N + 1, p + 1, p + N + 2, p + N + 1);
                }
            }
        }
        // 縁を綴じる
        for (let i = 0; i < N; i++) {
            const a0 = i, b0 = per + i;
            idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1);
            const a1 = N * (N + 1) + i, b1 = per + N * (N + 1) + i;
            idx.push(a1, a1 + 1, b1, a1 + 1, b1 + 1, b1);
            const a2 = i * (N + 1), b2 = per + i * (N + 1);
            idx.push(a2, a2 + N + 1, b2, a2 + N + 1, b2 + N + 1, b2);
            const a3 = i * (N + 1) + N, b3 = per + i * (N + 1) + N;
            idx.push(a3, b3, a3 + N + 1, a3 + N + 1, b3, b3 + N + 1);
        }
        const m = named(new BABYLON.Mesh("fukujinCollider", scene), "fukujinCollider");
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = idx;
        const nr = new Float32Array(pos.length);
        BABYLON.VertexData.ComputeNormals(pos, idx, nr);
        vd.normals = nr;
        vd.applyToMesh(m, false);
        m.isVisible = false;
        m.isPickable = false;
        const ag = new BABYLON.PhysicsAggregate(m, BABYLON.PhysicsShapeType.MESH,
            { mass: 0, friction: FK_PHYS.friction, restitution: 0 }, scene);
        return { mesh: m, aggregate: ag };
    }

    // 波ごとに落として静定させる。
    // 【対策】全部いっぺんに湧かせると、同じ場所に 25 枚が重なった状態から
    //         始まるので、はじけ飛んで皿じゅうに散る。少しずつ落として積む
    function settleFukujin(scene, flakes, seatTop) {
        const eng = scene.getPhysicsEngine();
        if (!eng) return;
        const P = FK_PHYS;
        let top = seatTop;
        const liveF = [];
        for (let w = 0; w < flakes.length; w += P.wave) {
            for (let k = w; k < Math.min(flakes.length, w + P.wave); k++) {
                const f = flakes[k];
                // 同じ高さに並べると湧いた瞬間に噛み合う。少しずらす
                f.mesh.position.y = top + P.dropGap + (k - w) * 0.30;
                f.mesh.computeWorldMatrix(true);
                f.agg = new BABYLON.PhysicsAggregate(f.mesh,
                    BABYLON.PhysicsShapeType.CONVEX_HULL,
                    { mass: P.mass, friction: P.friction, restitution: P.restitution }, scene);
                f.agg.body.setLinearDamping(P.lin);
                f.agg.body.setAngularDamping(P.ang);
                liveF.push(f);
            }
            for (let st2 = 0; st2 < P.waveSteps; st2++) eng._step(P.dt);
            // 積み上がっている高さ。次に落とす片の湧き位置になる
            top = seatTop;
            for (const f of liveF) {
                f.mesh.computeWorldMatrix(true);
                const y = f.mesh.getBoundingInfo().boundingBox.maximumWorld.y;
                if (y > top) top = y;
            }
        }
        for (let st2 = 0; st2 < P.finalSteps; st2++) eng._step(P.dt);
        for (const f of liveF) {
            f.mesh.computeWorldMatrix(true);
            if (f.agg) { f.agg.dispose(); f.agg = null; }
        }
    }

    // 福神漬け一式。seatFn は下地（皿またはごはんの粒の上面）の高さ
    function buildFukujin(scene, cx, cz, seatFn, seed, mat, G, inWell, usePhysics) {
        const rng = new Rng(seed >>> 0);
        const n = (G && G.fukujinCount ? G.fukujinCount : 44) + rng.int(12);
        const flakes = [];
        for (let i = 0; i < n; i++) {
            const f = buildFukujinFlake(scene, (seed + i * 7717) >>> 0, mat);
            // 【対策】物理で落とすなら、置き場所は「湧かせる場所」でよく、
            //         きれいに散らす必要はない。むしろ狭い範囲へ落として
            //         山にしたほうが、実物の「小さく盛った福神漬け」になる。
            // 【対策】ただし枚数を倍にすると、同じ半径のままでは細い塔に
            //         なってから崩れる。湧かせる範囲も √枚数 で広げる
            const ga = i * 2.39996;
            const spread = 0.62 * Math.sqrt(n / 24);
            const rr = spread * Math.sqrt((i + 0.6) / n);
            const px = cx + Math.cos(ga) * rr + rng.gauss(0, 0.06);
            const pz = cz + Math.sin(ga) * rr + rng.gauss(0, 0.06);
            // 片の外接円ごと平らな見込みの中に収まらないものは捨てる
            if (inWell && !inWell(px, pz, f.R * 1.10)) { f.mesh.dispose(); continue; }
            const q = usePhysics
                ? BABYLON.Quaternion.RotationYawPitchRoll(
                    rng.range(0, TAU), rng.gauss(0, 0.55), rng.gauss(0, 0.55))
                : BABYLON.Quaternion.RotationYawPitchRoll(
                    rng.range(0, TAU), rng.gauss(0, 0.22), rng.gauss(0, 0.22));
            f.mesh.rotationQuaternion = q;
            // 物理を使わないときの座らせ量。姿勢を掛けた実測の最下点を
            // 下地へ合わせる（傾けたぶんの持ち上げを式で見積もると必ず足りない）
            const seat = seatFn(px, pz);
            f.mesh.position.set(px, seat + 0.010 - lowestUnder(f, q), pz);
            flakes.push(f);
        }
        return flakes;
    }

    function fukujinMaterial(scene) {
        const m = new BABYLON.PBRMaterial("fukujinMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0.0; m.roughness = 0.32;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.94;
        m.clearCoat.roughness = 0.115;   // 漬け汁でよく濡れている
        m.clearCoat.indexOfRefraction = 1.36;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.30;
        m.subSurface.tintColor = col3([0.78, 0.24, 0.14]);
        m.subSurface.minimumThickness = 0.01;
        m.subSurface.maximumThickness = 0.08;
        return m;
    }

    // =================================================================
    // 8. Submerge : 上から見た「最上点バッファ」を焼く
    // =================================================================
    // カレーの消散長は実測で 2mm を切る。つまりルウは完全に不透明として
    // 扱ってよく、沈んだ具の情報は「色」ではなく「盛り上がり」で伝わる。
    //
    // そこで具の三角形をワールド XZ 平面へ軟ラスタライズして
    //   topY … その位置で最も浅い具の高さ
    //   col  … そこの具の色（リニア）
    // を焼く。topY はルウ面の高さ場へ max で入り（＝盛り上がり）、
    // col は深さ d に対する 1 - exp(-σd) でルウ色へ寄せてアルベドに入る。
    // 透過描画もソートも要らないまま「水面直下だけぼんやり透ける」が出る。
    class SubmergeMap {
        constructor(n, minX, maxX, minZ, maxZ) {
            this.n = n | 0;
            this.minX = minX; this.minZ = minZ;
            this.spanX = maxX - minX; this.spanZ = maxZ - minZ;
            this.cellX = this.spanX / this.n;
            this.cellZ = this.spanZ / this.n;
            const m = this.n * this.n;
            this.topY = new Float32Array(m).fill(-1e9);
            this.cr = new Float32Array(m);
            this.cg = new Float32Array(m);
            this.cb = new Float32Array(m);
            this.dist = null;
        }
        _gx(x) { return (x - this.minX) / this.cellX - 0.5; }
        _gz(z) { return (z - this.minZ) / this.cellZ - 0.5; }

        // pos / col / idx を直接受ける（メッシュ化前でも焼けるように）
        addGeom(pos, col, idx) {
            if (!pos || !idx) return;
            const n = this.n;
            for (let t = 0; t < idx.length; t += 3) {
                const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
                const ay = pos[i0 * 3 + 1], by = pos[i1 * 3 + 1], cy = pos[i2 * 3 + 1];
                const gax = this._gx(pos[i0 * 3]), gaz = this._gz(pos[i0 * 3 + 2]);
                const gbx = this._gx(pos[i1 * 3]), gbz = this._gz(pos[i1 * 3 + 2]);
                const gcx = this._gx(pos[i2 * 3]), gcz = this._gz(pos[i2 * 3 + 2]);
                const den = (gbz - gcz) * (gax - gcx) + (gcx - gbx) * (gaz - gcz);
                if (Math.abs(den) < 1e-12) continue;      // 真横から見た三角形
                const x0 = Math.max(0, Math.floor(Math.min(gax, gbx, gcx)));
                const x1 = Math.min(n - 1, Math.ceil(Math.max(gax, gbx, gcx)));
                const z0 = Math.max(0, Math.floor(Math.min(gaz, gbz, gcz)));
                const z1 = Math.min(n - 1, Math.ceil(Math.max(gaz, gbz, gcz)));
                for (let gz = z0; gz <= z1; gz++) {
                    for (let gx = x0; gx <= x1; gx++) {
                        const l0 = ((gbz - gcz) * (gx - gcx) + (gcx - gbx) * (gz - gcz)) / den;
                        if (l0 < -0.001) continue;
                        const l1 = ((gcz - gaz) * (gx - gcx) + (gax - gcx) * (gz - gcz)) / den;
                        if (l1 < -0.001) continue;
                        const l2 = 1 - l0 - l1;
                        if (l2 < -0.001) continue;
                        const y = l0 * ay + l1 * by + l2 * cy;
                        const k = gz * n + gx;
                        if (y <= this.topY[k]) continue;
                        this.topY[k] = y;
                        if (col) {
                            this.cr[k] = l0 * col[i0 * 4] + l1 * col[i1 * 4] + l2 * col[i2 * 4];
                            this.cg[k] = l0 * col[i0 * 4 + 1] + l1 * col[i1 * 4 + 1] + l2 * col[i2 * 4 + 1];
                            this.cb[k] = l0 * col[i0 * 4 + 2] + l1 * col[i1 * 4 + 2] + l2 * col[i2 * 4 + 2];
                        } else {
                            this.cr[k] = this.cg[k] = this.cb[k] = 0.5;
                        }
                    }
                }
            }
        }
        addMesh(mesh) {
            this.addGeom(mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),
                mesh.getVerticesData(BABYLON.VertexBuffer.ColorKind), mesh.getIndices());
        }

        // 「ルウ面より上に出ている物」までの距離場。
        // メニスカスと接触の暗がりに使う。2パスのチャンファ距離で十分
        buildDistance(surfFn) {
            const n = this.n, m = n * n;
            const cell = (this.cellX + this.cellZ) * 0.5;
            const D = new Float32Array(m).fill(1e9);
            for (let z = 0; z < n; z++) {
                for (let x = 0; x < n; x++) {
                    const k = z * n + x;
                    if (this.topY[k] < -1e8) continue;
                    const wx = this.minX + (x + 0.5) * this.cellX;
                    const wz = this.minZ + (z + 0.5) * this.cellZ;
                    if (this.topY[k] > surfFn(wx, wz)) D[k] = 0;
                }
            }
            const d1 = 1, d2 = Math.SQRT2;
            for (let z = 0; z < n; z++) {
                for (let x = 0; x < n; x++) {
                    const k = z * n + x; let v = D[k];
                    if (x > 0) v = Math.min(v, D[k - 1] + d1);
                    if (z > 0) v = Math.min(v, D[k - n] + d1);
                    if (x > 0 && z > 0) v = Math.min(v, D[k - n - 1] + d2);
                    if (x < n - 1 && z > 0) v = Math.min(v, D[k - n + 1] + d2);
                    D[k] = v;
                }
            }
            for (let z = n - 1; z >= 0; z--) {
                for (let x = n - 1; x >= 0; x--) {
                    const k = z * n + x; let v = D[k];
                    if (x < n - 1) v = Math.min(v, D[k + 1] + d1);
                    if (z < n - 1) v = Math.min(v, D[k + n] + d1);
                    if (x < n - 1 && z < n - 1) v = Math.min(v, D[k + n + 1] + d2);
                    if (x > 0 && z < n - 1) v = Math.min(v, D[k + n - 1] + d2);
                    D[k] = v;
                }
            }
            for (let i = 0; i < m; i++) D[i] = Math.min(D[i], 1e8) * cell;
            this.dist = D;
            return D;
        }

        sample(x, z, out) {
            const n = this.n;
            const fx = this._gx(x), fz = this._gz(z);
            const ix = Math.floor(fx), iz = Math.floor(fz);
            if (ix < 0 || iz < 0 || ix >= n - 1 || iz >= n - 1) {
                out.y = -1e9; out.r = out.g = out.b = 0; out.d = 1e8; return out;
            }
            const tx = fx - ix, tz = fz - iz;
            const k00 = iz * n + ix, k10 = k00 + 1, k01 = k00 + n, k11 = k01 + 1;
            const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
            // 【対策】高さを平均すると具の縁が斜面になってにじむ。最大を採る
            out.y = Math.max(Math.max(this.topY[k00], this.topY[k10]),
                Math.max(this.topY[k01], this.topY[k11]));
            out.r = this.cr[k00] * w00 + this.cr[k10] * w10 + this.cr[k01] * w01 + this.cr[k11] * w11;
            out.g = this.cg[k00] * w00 + this.cg[k10] * w10 + this.cg[k01] * w01 + this.cg[k11] * w11;
            out.b = this.cb[k00] * w00 + this.cb[k10] * w10 + this.cb[k01] * w01 + this.cb[k11] * w11;
            out.d = this.dist
                ? this.dist[k00] * w00 + this.dist[k10] * w10 + this.dist[k01] * w01 + this.dist[k11] * w11
                : 1e8;
            return out;
        }
    }

    // =================================================================
    // 9. Roux : ルウ面
    // =================================================================
    // 静止したビンガム流体（降伏応力 τy）の平皿上のパドルは
    //     ρ g h (dh/dx) = τy    →    h = √( 2 τy x / (ρ g) )
    // を満たす。縁からの距離 x に対して h が √ で立ち上がるので、
    // 縁で接線が垂直になる。カレーの縁があの丸い土手になる理由がこれ。
    //
    // cm 単位へ直すと（x, h は cm、τy は Pa、ρ は kg/m³）
    //     h[cm] = √( 200 τy x[cm] / (ρ g) )
    // τy=16Pa なら縁から 1mm で 1.8mm、3cm で深さ 9.5mm に達して頭打ちになる。
    // 実測写真とよく合う。
    function yieldH(d, tauY) {
        if (d <= 0) return 0;
        return Math.sqrt(200 * Math.max(0.05, tauY) * d / (RHO * GRAV));
    }

    // ---- ルウの縁 -------------------------------------------------------
    // かけた中心 C からの放射状の半径 rb(φ) で持つ。
    // 【対策】ルウの領域を格子のマスクで持つと、境界がギザギザになるか、
    //         等高線抽出（マーチングスクエア）が要る。カレーは1か所から
    //         かけるので C について星形になる。放射関数で持てば、
    //         メッシュは縁から内側へリングを刻むだけで済み、縁が正確に出る。
    //
    //   rb(φ) = min( 皿の内壁まで, ライスを登りきるところ ) × ゆらぎ
    function buildRouxBoundary(G, seed, plateTopY, NS) {
        const rb = new Float32Array(NS);
        const ext = new Float32Array(NS);       // 引きずった薄い部分の長さ
        const rng = new Rng((seed ^ 0x2B0A) >>> 0);
        const wallLimitY = G.wellY + 0.58;      // 皿の立ち上がりをどこまで登るか
        for (let j = 0; j < NS; j++) {
            const th = j / NS * TAU;
            const cs = Math.cos(th), sn = Math.sin(th);
            let r = 0.35;
            const step = 0.035;
            for (; r < 14; r += step) {
                const x = G.pourCX + cs * r, z = G.pourCZ + sn * r;
                if (plateTopY(x, z) > wallLimitY) break;
                const my = moundY(x, z, G, seed);
                if (my > -1e8 && my > G.climbY) break;
            }
            // ゆらぎ。1周期だけだと楕円のままなので帯域を分ける
            const w = (Noise.fbm2(cs * 2.1 + 7, sn * 2.1 + 3, seed + 61, 3) - 0.5) * 2.0
                + (Noise.fbm2(cs * 5.3 + 1, sn * 5.3 + 9, seed + 83, 2) - 0.5) * 0.9;
            rb[j] = Math.max(0.5, r * (1 + w * G.pourWobble));
            // 引きずり（お玉を引いた跡）。数か所だけ、外へ薄く伸びる
            const s = Noise.fbm2(cs * 3.4 + 21, sn * 3.4 + 11, seed + 137, 2);
            ext[j] = Math.pow(Math.max(0, s - 0.60) / 0.40, 2.0) * 0.85;
        }
        // 【対策】ノイズをそのまま乗せると、隣り合う角度で 5mm 単位に
        //         跳ねてノコギリになる。周期を保ったまま3点で均す
        for (let pass = 0; pass < 2; pass++) {
            const t = rb.slice();
            for (let j = 0; j < NS; j++) {
                rb[j] = (t[(j - 1 + NS) % NS] + t[j] * 2 + t[(j + 1) % NS]) * 0.25;
            }
        }
        // 角度から引く（メッシュの分割数と境界テーブルの分割数は別物）
        const B = { rb, ext, NS };
        B.at = function (th) {
            let t = th / TAU; t -= Math.floor(t);
            const f = t * NS, i0 = Math.floor(f) % NS, i1 = (i0 + 1) % NS, w = f - Math.floor(f);
            return { rb: rb[i0] * (1 - w) + rb[i1] * w, ext: ext[i0] * (1 - w) + ext[i1] * w };
        };
        return B;
    }

    // ルウ面の高さ。この1本の式が「たまり」「ライスにかかった膜」
    // 「沈んだ具の盛り上がり」をすべて生む
    function makeSurfFn(G, B, seed, plateTopY, ro, mpSunk) {
        const s = { y: 0, r: 0, g: 0, b: 0, d: 0 };
        const NS = B.NS;
        // (x,z) → 縁からの距離 d [cm]（C からの放射で測る）
        function distOf(x, z) {
            const dx = x - G.pourCX, dz = z - G.pourCZ;
            const r = Math.hypot(dx, dz);
            const th = Math.atan2(dz, dx);
            const a = B.at(th);
            return { d: a.rb + a.ext - r, ext: a.ext, rb: a.rb, r: r };
        }
        function heightOf(dd, ee) {
            // 引きずった部分は厚みが立たない。薄い膜のまま外へ伸びる
            const eff = Math.max(0, dd - ee);
            return Math.min(ro.pool, yieldH(eff, ro.tauY)) + 0.012;
        }
        // ★ ドロっと感の正体は「表面が水平にならないこと」。
        // 【対策】降伏応力流体は、注いだあと自分の重さでは平らに戻れない。
        //         お玉で寄せたうねりも、具の周りに寄った盛り上がりも、
        //         そのままの形で止まる。解析解 h(d) だけだと完全に滑らかな
        //         鏡面になり、鏡面反射が1枚の大きなシートになって
        //         「水たまり」に見える。低周波の起伏を足すと、
        //         同じ光でもハイライトが細かく割れて粘りが出る。
        //         厚いところほど大きく揺れる（薄い縁は土手の形が支配的）
        function lumpAt(x, z) {
            return (Noise.fbm2(x * 0.42 + 5, z * 0.42 + 11, seed + 211, 3) - 0.5) * 0.150
                + (Noise.fbm2(x * 1.15 + 3, z * 1.15 + 7, seed + 227, 2) - 0.5) * 0.062
                // 【対策】最上位を細かくしすぎると、ルウ面の刻み（約 2mm）で
                //         表せずにちらつく。1 オクターブに留める
                + (Noise.fbm2(x * 1.90 + 19, z * 1.90 + 2, seed + 239, 1) - 0.5) * 0.022;
        }
        function surfY(x, z) {
            const q = distOf(x, z);
            if (q.d <= 0) return -1e9;
            const h0 = heightOf(q.d, q.ext);
            // 起伏は厚い所だけ。縁では 0 に落として土手の形を壊さない
            const h = h0 + lumpAt(x, z) * smooth(0.06, 0.42, h0);
            let y = plateTopY(x, z) + h;
            const my = moundY(x, z, G, seed);
            // ライスにかかった膜。膜厚は h で頭打ちにする
            if (my > -1e8) y = Math.max(y, my + Math.min(h, ro.film));
            if (mpSunk) {
                mpSunk.sample(x, z, s);
                if (s.y > -1e8) y = Math.max(y, s.y + Math.min(h, ro.film));
            }
            return y;
        }
        surfY.distOf = distOf;
        surfY.heightOf = heightOf;
        surfY.lumpAt = lumpAt;
        surfY.plateY = plateTopY;
        return surfY;
    }

    // ---- テクスチャの場 --------------------------------------------------
    // 重いノイズは1度だけ走らせて Float32Array に置き、σ や τy を動かすときは
    // 混色だけやり直す
    function rouxFields(G, B, seed, surfY, plateTopY, mpSunk, mpOut, box, ro) {
        const N = Math.max(64, Math.round(G.rouxTex) || 512), n2 = N * N;
        const F = {
            N: N, box: box,
            mottle: new Float32Array(n2),  // 混ぜムラ
            spice: new Float32Array(n2),   // 香辛料の粒
            gold: new Float32Array(n2),    // ターメリックの明るい粒
            oil: new Float32Array(n2),     // 浮いた油
            skin: new Float32Array(n2),    // 冷めかけの膜（しわ）
            thin: new Float32Array(n2),    // 層の厚み [cm]
            dep: new Float32Array(n2),     // 沈んだ具の深さ [cm]（無ければ -1）
            // 【対策】σ を動かすたびに linear→sRGB の pow を 40万回まわすと
            //         スライダーが 60ms 刻みになる。σ に依存しない量なので
            //         ここで一度だけ変換して置く
            objR: new Float32Array(n2), objG: new Float32Array(n2), objB: new Float32Array(n2),
            near: new Float32Array(n2),    // ルウ面より上に出ている物までの距離 [cm]
            inside: new Uint8Array(n2)
        };
        const s = { y: 0, r: 0, g: 0, b: 0, d: 0 };
        const sd = seed >>> 0;
        for (let py = 0; py < N; py++) {
            const z = box.minZ + (py + 0.5) / N * (box.maxZ - box.minZ);
            for (let px = 0; px < N; px++) {
                const x = box.minX + (px + 0.5) / N * (box.maxX - box.minX);
                const k = py * N + px;
                const q = surfY.distOf(x, z);
                if (q.d <= 0) { F.dep[k] = -1; F.near[k] = 1e8; continue; }
                F.inside[k] = 1;
                const y = surfY(x, z);
                F.thin[k] = Math.max(0.004, y - plateTopY(x, z));
                // 混ぜムラ。かけた中心のまわりに渦を巻く
                const ang = Math.atan2(z - G.pourCZ, x - G.pourCX);
                const rr = Math.hypot(x - G.pourCX, z - G.pourCZ);
                const swirl = ang + rr * 0.42;
                const m1 = Noise.fbm2(Math.cos(swirl) * rr * 0.62 + 3,
                    Math.sin(swirl) * rr * 0.62 + 7, sd + 11, 3) - 0.5;
                const m2 = Noise.fbm2(x * 2.3 + 13, z * 2.3 + 2, sd + 29, 2) - 0.5;
                F.mottle[k] = clamp(0.5 + m1 * 1.15 + m2 * 0.50, 0, 1);
                // 香辛料。閾値で粒立たせないと、ただのもやになる
                const sp = Noise.fbm2(x * 52, z * 52, sd + 53, 2);
                F.spice[k] = smooth(0.70, 0.92, sp);
                const gd = Noise.fbm2(x * 88 + 5, z * 88 + 9, sd + 71, 1);
                F.gold[k] = smooth(0.86, 0.975, gd);
                // 浮いた油。
                // 【対策】味噌汁のように円い油滴を散らすとカレーにならない。
                //         カレーの油は面で浮いて、いびつな島になる。
                //         低周波ノイズを閾値で切って島にする
                const on = Noise.fbm2(x * 0.78 + 31, z * 0.78 + 17, sd + 97, 3);
                const on2 = Noise.fbm2(x * 2.4 + 5, z * 2.4 + 23, sd + 113, 2);
                F.oil[k] = clamp(smooth(0.52, 0.70, on * 0.72 + on2 * 0.28), 0, 1);
                // 冷めかけの膜のしわ。流れの止まった内側ほど強い
                const sk = Noise.fbm2(x * 6.5 + 41, z * 6.5 + 19, sd + 131, 3);
                F.skin[k] = clamp((sk - 0.42) * 2.0, 0, 1) * smooth(0.5, 2.2, q.d);
                // 沈んだ具
                if (mpSunk) {
                    mpSunk.sample(x, z, s);
                    if (s.y > -1e8) {
                        F.dep[k] = Math.max(0, y - s.y);
                        F.objR[k] = clamp(s.r, 0, 1);
                        F.objG[k] = clamp(s.g, 0, 1);
                        F.objB[k] = clamp(s.b, 0, 1);
                    } else F.dep[k] = -1;
                } else F.dep[k] = -1;
                F.near[k] = mpOut ? (mpOut.sample(x, z, s), s.d) : 1e8;
            }
        }
        return F;
    }

    // σ（濁り）と皿の色に依存する部分だけを描く。スライダーはここだけ呼び直す。
    // 【対策】mix3 は毎回配列を返す。40万テクセル × 5 回で 200 万個の
    //         使い捨て配列が出て、GC だけでスライダーがカクつく。
    //         見た目の悪さを承知でスカラーに展開する
    function rouxAlbedoFill(d, N, F, ro, sigma, plateAlb) {
        const B0 = ro.base[0], B1 = ro.base[1], B2 = ro.base[2];
        const D0 = ro.deep[0], D1 = ro.deep[1], D2 = ro.deep[2];
        const P0 = ro.pale[0], P1 = ro.pale[1], P2 = ro.pale[2];
        // 【対策】薄い層の下から皿が透ける効果。単純な Beer–Lambert では
        //         「吸収するだけの色ガラス」になり、実物のように白茶けない。
        //         2 流束（Kubelka–Munk）の考え方で、無限厚の反射率 R∞ と
        //         皿の反射率のあいだを exp(-2 σb h) で補間する。
        //         σb は散乱を含む輸送消散で、見た目の濁り σ よりずっと大きい
        const sb = ro.sigmaBed;
        const U0 = plateAlb[0] * 0.90, U1 = plateAlb[1] * 0.86, U2 = plateAlb[2] * 0.80;
        const n2 = N * N;
        for (let k = 0; k < n2; k++) {
            const o = k * 4;
            if (!F.inside[k]) { d[o] = 0; d[o + 1] = 0; d[o + 2] = 0; d[o + 3] = 255; continue; }
            // 地色: 混ぜムラ
            const mv = F.mottle[k];
            let t = (mv - 0.22) / 0.60; t = t < 0 ? 0 : (t > 1 ? 1 : t);
            t = t * t * (3 - 2 * t);
            let r = D0 + (P0 - D0) * t, g = D1 + (P1 - D1) * t, b = D2 + (P2 - D2) * t;
            r += (B0 - r) * 0.42; g += (B1 - g) * 0.42; b += (B2 - b) * 0.42;
            // 香辛料。黒っぽい粒と、ターメリックの明るい粒
            const sp = F.spice[k] * ro.spice;
            r *= 1 - sp * 0.26; g *= 1 - sp * 0.30; b *= 1 - sp * 0.30;
            const gl = F.gold[k] * ro.spice;
            if (gl > 0) {
                r += (Math.min(1, r * 1.55 + 0.10) - r) * gl;
                g += (Math.min(1, g * 1.85 + 0.10) - g) * gl;
                b += (Math.min(1, b * 1.30) - b) * gl;
            }

            // ★ 沈んだ具を消散長で溶かし込む
            const dep = F.dep[k];
            if (dep >= 0) {
                const veil = 1 - Math.exp(-sigma * dep);
                const or2 = F.objR[k], og2 = F.objG[k], ob2 = F.objB[k];
                r = or2 + (r - or2) * veil;
                g = og2 + (g - og2) * veil;
                b = ob2 + (b - ob2) * veil;
            }

            // ★ 薄い縁: 下の皿が透けて白茶ける（引きずった跡がこれで出る）
            const h = F.thin[k];
            const tr = Math.exp(-2 * sb * h);
            if (tr > 0.004) {
                r += (U0 - r) * tr; g += (U1 - g) * tr; b += (U2 - b) * tr;
            }

            // ルウ面から出ている物のきわ: 内側に接触の影、外側にメニスカスの照り
            const nd = F.near[k];
            let sh = nd / 0.24; sh = sh < 0 ? 0 : (sh > 1 ? 1 : sh);
            sh = 1 - sh * sh * (3 - 2 * sh);
            if (sh > 0) {
                const w = sh * 0.60;
                r += (r * 0.58 - r) * w; g += (g * 0.55 - g) * w; b += (b * 0.52 - b) * w;
            }
            let ra = (nd - 0.055) / 0.125; ra = ra < 0 ? 0 : (ra > 1 ? 1 : ra);
            let rb2 = nd / 0.055; rb2 = rb2 < 0 ? 0 : (rb2 > 1 ? 1 : rb2);
            const rim = (1 - ra * ra * (3 - 2 * ra)) * (rb2 * rb2 * (3 - 2 * rb2)) * 0.75;
            if (rim > 0) {
                const tr2 = Math.min(1, r * 1.30 + 0.05), tg2 = Math.min(1, g * 1.34 + 0.04),
                    tb2 = Math.min(1, b * 1.26 + 0.03);
                r += (tr2 - r) * rim; g += (tg2 - g) * rim; b += (tb2 - b) * rim;
            }
            // 油の島はわずかに濃く赤い（油に色素が溶けている）
            const ol = F.oil[k] * ro.oil * 0.30;
            if (ol > 0) {
                r += (Math.min(1, r * 1.10) - r) * ol; g += (g * 0.96 - g) * ol; b += (b * 0.86 - b) * ol;
            }
            d[o] = (r < 0 ? 0 : r > 1 ? 1 : r) * 255;
            d[o + 1] = (g < 0 ? 0 : g > 1 ? 1 : g) * 255;
            d[o + 2] = (b < 0 ? 0 : b > 1 ? 1 : b) * 255;
            d[o + 3] = 255;
        }
    }

    // 塗膜（＝油膜）の被覆と粗さ。
    // 【対策】カレーの照りは全部この層。拡散側を滑らかにすると
    //         「濡れたチョコレート」になる（SKILL 3.1）。
    //         GUI から粗さだけ動かせるよう、アルベドと同じく関数へ切り出す
    function rouxCoatFill(d, N, F, ro, rough) {
        const n2 = N * N;
        for (let k = 0; k < n2; k++) {
            const oil = F.oil[k] * ro.oil;
            // 【対策】被覆を 0.72〜1.0 で敷くと面全体が一枚のニスになり、
            //         鏡面が途切れずに広がって水面に見える。
            //         実物で照るのは浮いた油の島だけで、あいだは
            //         ざらついた粘体。下地を落として島の差を大きくする
            const cov = clamp(0.34 + 0.44 * oil - 0.26 * F.skin[k] * ro.skin, 0, 1);
            let rgh = rough * (1 - 0.38 * oil)
                + 0.16 * F.spice[k] * ro.spice
                + 0.26 * F.skin[k] * ro.skin;
            // 具の接触ぎわは表面が乱れて光が散る
            rgh += (1 - smooth(0.0, 0.15, F.near[k])) * 0.12;
            const o = k * 4;
            d[o] = cov * 255; d[o + 1] = clamp(rgh, 0.02, 0.92) * 255;
            d[o + 2] = 0; d[o + 3] = 255;
        }
    }

    function rouxTextures(scene, G, F, ro, sigma, plateAlb) {
        const N = F.N, n2 = N * N;
        const albedo = TexLab._tex("rouxA", N, N, (d) => {
            rouxAlbedoFill(d, N, F, ro, sigma, plateAlb);
        }, scene, false, true);

        // 塗膜（＝油膜）の被覆と粗さ。
        // 【対策】カレーの照りは全部この層。拡散側を滑らかにすると
        //         「濡れたチョコレート」になる（SKILL 3.1）
        const coat = TexLab._tex("rouxC", N, N, (d) => {
            rouxCoatFill(d, N, F, ro, ro.rough);
        }, scene, true, true);

        // 拡散側の ORM。粗さは一定（散乱体なので）、AO だけ効かせる
        const orm = TexLab._tex("rouxO", N, N, (d) => {
            for (let k = 0; k < n2; k++) {
                const ao = clamp(1 - 0.50 * (1 - smooth(0.0, 0.26, F.near[k])), 0.22, 1);
                const o = k * 4;
                d[o] = ao * 255; d[o + 1] = 0.70 * 255; d[o + 2] = 0; d[o + 3] = 255;
            }
        }, scene, true, true);

        // 法線。しわと粒だけ。
        // 【対策】さざ波を入れると水面になる。カレーは動かない
        const H = new Float32Array(n2);
        for (let k = 0; k < n2; k++) {
            H[k] = clamp(0.5 + F.skin[k] * ro.skin * 0.42
                + (F.spice[k] - 0.5) * 0.10 * ro.spice
                - F.oil[k] * ro.oil * 0.06, 0, 1);
        }
        const normal = TexLab.normalFromHeight("rouxN", N, H, 1.55, scene, true);
        return { albedo, coat, orm, normal };
    }

    function rouxMaterial(scene, tex, ro, name) {
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = tex.albedo;
        m.metallic = 0.0;
        m.roughness = 1.0;
        m.metallicTexture = tex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = tex.normal;
        m.bumpTexture.level = 0.95;
        // 【対策】ルウは「油膜」と「散乱する中身」の2層。1枚の PBR で
        //         滑らかにすると濡れたプラスチックの板になる。
        //         中身は完全な拡散体（粗さ 0.70）にして、
        //         照りは全部 clearCoat（＝油, IOR 1.47）に持たせる
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = tex.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        // 【対策】intensity 1.0 だと油膜が「ガラス板」になる。
        //         カレーの照りは強いが、輪郭のはっきりした映り込みは出ない
        m.clearCoat.intensity = 0.62;
        m.clearCoat.roughness = ro.rough;
        m.clearCoat.indexOfRefraction = 1.47;
        return m;
    }

    // ---- メッシュ ---------------------------------------------------------
    // 縁から内側へリングを刻む。
    // 【対策】等間隔に刻むと、高さが √d で立ち上がる縁のところだけ
    //         段が見える。t = (i/NR)² で刻むと h ∝ √(rb·t) ∝ i/NR となり、
    //         高さの刻みが等間隔になる。縁が最も細かくなる
    function buildRouxSurface(scene, G, B, surfY, mat, box) {
        const NR = Math.max(24, G.rouxRings | 0);
        const NS = Math.max(48, G.rouxSectors | 0);
        const rows = NR + 1;
        const nV = rows * (NS + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array((rows - 1) * NS * 6);
        const spanX = box.maxX - box.minX, spanZ = box.maxZ - box.minZ;
        let vo = 0;
        for (let i = 0; i < rows; i++) {
            const t = Math.pow(i / NR, 2.0);
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                // 【対策】B.rb をメッシュの分割番号で直に引くと、境界テーブルの
                //         分割数と違うぶんだけ角度がずれ、縁が別の方向の
                //         半径で切られる。必ず角度から引く
                const a = B.at(th);
                // 【対策】いちばん外のリング(t=0)は縁の真上に来る。そこは
                //         d=0 なので surfY が「ルウの外」を返し、予備の高さへ
                //         落ちる。予備が G.wellY（見込みの底）だったため、
                //         皿が立ち上がっている所では頂点が皿の内側へ潜り、
                //         下向きの牙になって皿の側面を突き破っていた。
                //         (1) 縁を 10μm だけ内側へ寄せて必ず d>0 にする
                //         (2) 予備の高さも真下の皿に合わせる
                const rOut = a.rb + a.ext - 1e-3;
                const r = rOut * (1 - t);
                const x = G.pourCX + r * Math.cos(th);
                const z = G.pourCZ + r * Math.sin(th);
                let y = surfY(x, z);
                if (y < -1e8) y = (surfY.plateY ? surfY.plateY(x, z) : G.wellY) + 0.012;
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = x; positions[p3 + 1] = y; positions[p3 + 2] = z;
                // 平面投影の UV。沈んだ具の輪郭をワールド XZ で焼いてあるので、
                // 極座標にすると中心で潰れて合わなくなる
                uvs[p2] = (x - box.minX) / spanX;
                uvs[p2 + 1] = (z - box.minZ) / spanZ;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < rows - 1; i++) {
            for (let j = 0; j < NS; j++) {
                const p = i * (NS + 1) + j;
                indices[io++] = p; indices[io++] = p + 1; indices[io++] = p + NS + 1;
                indices[io++] = p + 1; indices[io++] = p + NS + 2; indices[io++] = p + NS + 1;
            }
        }
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        let up = 0;
        for (let i = 1; i < normals.length; i += 3) up += normals[i];
        if (up < 0) {
            for (let k = 0; k < indices.length; k += 3) {
                const t = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = t;
            }
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        weldNormals(positions, normals);
        const mesh = makeMesh("roux", positions, indices, normals, uvs, null, scene);
        mesh.material = mat;
        mesh.receiveShadows = true;
        return mesh;
    }

    // =================================================================
    // 10. Spoon : カレースプーン
    // =================================================================
    // 【対策】断面を円のまま掃引すると針金になる。カレースプーンの柄は
    //         「厚みのある平たい板」で、根元へ向かって断面が丸へ近づく。
    //         丸めた長方形 → 円 を連続的に変える掃引にする
    function buildSpoon(scene, ox, oz, ang, mat, seed) {
        const rng = new Rng(seed >>> 0);
        const NT = 132, NS = 26;
        const L = 19.4;                       // 全長 [cm]
        // s: 0 = 柄の端、1 = すくう部分の先。すべて実寸 [cm]
        //
        // 【対策】前の版は柄の半幅が 0.62cm（＝幅 1.24cm）で全長にわたって
        //         ほぼ一定、厚みも 0.44cm あった。これは「幅の広い平たい板」
        //         そのもので、どう色を付けてもヘラかバターナイフに見える。
        //         実物のカレースプーンを測ると
        //           ・柄は幅 1.0〜1.2cm・厚み 0.25〜0.32cm で、首（つぼの
        //             付け根）に向かっていちど細くなる。この「くびれ」が
        //             スプーンをスプーンに見せている当のもの
        //           ・つぼは幅 4.0cm・長さ 6.5cm の卵形で、深さが 1cm 以上ある
        //         とくに深さが要る。前の版はくぼみを厚みの 1.55 倍
        //         （＝1.4mm）しか掘っていなかったので、皿ではなく板だった
        // 【対策】両端を同じ関数で丸めると、つぼの先が「柄の端と同じ形」に
        //         なる。実物のスプーンは柄の端と先で丸まり方がまるで違う。
        //         柄の端は半径 5mm ほどで急に閉じるが、つぼの先は半径 2cm の
        //         円弧——つまり つぼの最大幅と同じ半径——で丸い。ここを
        //         テーパーで済ませると必ず「尖った木の葉」になる
        const capA = (s) => (s >= 0.030) ? 1
            : Math.sqrt(Math.max(0, 1 - Math.pow(1 - s / 0.030, 2)));
        // 半幅。0.897 から先は半径 2.0cm の円弧（＝つぼの先の丸み）で、
        // w = 2.0 * √(1 - ((s-0.897)/0.103)²) を標本化して置いてある
        const sw = monoSpline(
            [0, 0.06, 0.16, 0.30, 0.46, 0.58, 0.645, 0.70, 0.76, 0.83,
                0.897, 0.925, 0.95, 0.972, 0.987, 1.0],
            [0.52, 0.58, 0.60, 0.52, 0.43, 0.365, 0.36, 0.60, 1.15, 1.72,
                2.00, 1.94, 1.72, 1.38, 0.95, 0.02]);
        // 半厚。柄は厚く、つぼは 1.5mm 厚の薄い殻
        const st = monoSpline([0, 0.18, 0.42, 0.60, 0.68, 0.78, 0.90, 1.0],
            [0.155, 0.140, 0.115, 0.100, 0.088, 0.074, 0.066, 0.056]);
        // 断面の角ばり（p が大きいほど長方形）。柄は角、つぼは丸
        const sp = monoSpline([0, 0.30, 0.56, 0.66, 0.76, 1.0], [3.0, 4.0, 3.4, 2.5, 2.1, 2.0]);
        // ★ つぼのくぼみの深さ [cm]。断面ごと下へたわませる
        const sdep = monoSpline([0, 0.62, 0.68, 0.76, 0.86, 0.94, 1.0],
            [0, 0, 0.18, 0.72, 1.08, 0.76, 0.10]);
        // 中心線。柄の端が卓に着き、首で持ち上がって、つぼの縁がまた着く
        const sy = monoSpline([0, 0.22, 0.46, 0.62, 0.74, 0.86, 1.0],
            [0.20, 0.31, 0.52, 0.80, 1.06, 1.20, 1.20]);
        const nV = (NT + 1) * (NS + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array(NT * NS * 6);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        let vo = 0;
        for (let i = 0; i <= NT; i++) {
            const s = i / NT;
            // 【対策】両端の断面を閉じずに掃くと、柄の端とつぼの先に穴が空く。
            //         柄の端は capA でリングごと1点へ縮退させる。つぼの先は
            //         幅がすでに円弧で 0 へ向かっているので、厚みだけを
            //         幅に連動させて落とす（幅 0 に厚みだけ残ると、先端が
            //         「薄い板を立てた刃」になって尖って見える）
            const wRaw = sw(s), k = capA(s);
            const tk = clamp(wRaw / 0.42, 0, 1);
            const w = Math.max(1e-4, wRaw * k);
            const t = Math.max(1e-4, st(s) * k * tk);
            const p = sp(s), dep = sdep(s) * k * tk;
            const cx = (s - 0.5) * L, cy = sy(s);
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                const cth = Math.cos(th), sth = Math.sin(th);
                const rho = 1 / Math.pow(Math.pow(Math.abs(cth), p) + Math.pow(Math.abs(sth), p), 1 / p);
                const lz = rho * cth * w;
                // ★ 断面ごと下へたわませる。縁（|lz| = w）は動かさないので、
                //   厚みを保ったまま「縁が立った皿」になる。上面だけ押し
                //   下げるやり方だと、つぼの底が厚くなって鋳物に見える
                const u = clamp(Math.abs(lz) / w, 0, 1);
                const ly = rho * sth * t - dep * (1 - u * u);
                const x = cx, y = cy + ly, z = lz;
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = ox + x * ca - z * sa;
                positions[p3 + 1] = y;
                positions[p3 + 2] = oz + x * sa + z * ca;
                uvs[p2] = j / NS; uvs[p2 + 1] = s;
                vo++;
            }
        }
        // 【対策】中心線とくぼみの深さを別々に決めているので、つぼの底が
        //         卓へ 0.5mm ほど潜る組み合わせが出る。式で見積もらず、
        //         実測の最下点を卓の上へ座らせ直す
        {
            let lo = 1e9;
            for (let v = 0; v < nV; v++) lo = Math.min(lo, positions[v * 3 + 1]);
            const dy = 0.012 - lo;
            for (let v = 0; v < nV; v++) positions[v * 3 + 1] += dy;
        }
        let io = 0;
        for (let i = 0; i < NT; i++) {
            for (let j = 0; j < NS; j++) {
                const a = i * (NS + 1) + j;
                indices[io++] = a; indices[io++] = a + NS + 1; indices[io++] = a + 1;
                indices[io++] = a + 1; indices[io++] = a + NS + 1; indices[io++] = a + NS + 2;
            }
        }
        const normals = finalize(positions, indices, new V3(ox, 0.4, oz), 0, true);
        weldNormals(positions, normals);
        const mesh = makeMesh("spoon", positions, indices, normals, uvs, null, scene);
        mesh.material = mat;
        mesh.receiveShadows = true;
        return mesh;
    }

    function spoonMaterial(scene) {
        const m = new BABYLON.PBRMaterial("spoonMat", scene);
        // 18-8 ステンレスの実測反射率。金属なので albedo が鏡の色になる。
        // 【対策】無彩色のままだと、環境マップの空をそのまま映して青い
        //         プラスチックに見える。ステンレスはわずかに暖色へ寄る
        m.albedoColor = new BABYLON.Color3(0.582, 0.576, 0.562);
        m.metallic = 1.0;
        // 【対策】粗さ 0.05 の完全な鏡にすると、環境マップの解像度が
        //         そのまま出て「安いクロムメッキ」になる。食器の
        //         ステンレスはヘアライン仕上げでもう少し曇っている。
        //         0.155 でも空の青がべたりと乗るので、もう一段落とす
        m.roughness = 0.215;
        m.environmentIntensity = 0.92;
        return m;
    }

    // ---- 湯気 -----------------------------------------------------------
    function makeSteamTexture(scene) {
        const N = 128;
        return TexLab._tex("steam", N, N, (d) => {
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
                    const r = Math.hypot(u, v);
                    // 【対策】単純な放射状グラデーションだと、粒が丸い光の玉に
                    //         見えてホタルになる。ノイズで輪郭を崩す
                    const n = Noise.fbm2p(x / N * 6, y / N * 6, 6, 6, 4242, 3);
                    const a = clamp((1 - smooth(0.15, 1.0, r)) * (0.35 + 0.9 * n), 0, 1);
                    const i = (y * N + x) * 4;
                    d[i] = 255; d[i + 1] = 255; d[i + 2] = 255;
                    d[i + 3] = a * 255;
                }
            }
        }, scene, false, true);
    }

    // =================================================================
    // 11. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.034, 0.031, 0.028, 1);

    // ---- Havok（福神漬けの盛り付けだけに使う）--------------------------
    // 【対策】physicsEnabled を切らないと、Babylon がレンダーループでも
    //         ワールドを進めてしまう。こちらは決まった回数だけ手で進めたい
    //         （そうしないと同じシードでも描画レート次第で盛りが変わる）
    let havokReady = false;
    try {
        if (typeof HavokPhysics === "function") {
            const hk = await HavokPhysics();
            scene.enablePhysics(new V3(0, FK_PHYS.gravity, 0),
                new BABYLON.HavokPlugin(true, hk));
            scene.physicsEnabled = false;
            havokReady = true;
        }
    } catch (e) {
        console.warn("[CurryRice] Havok が使えないので、福神漬けは解析解で座らせる", e);
    }

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    // 【対策】0.82 だと IBL の無彩色成分が全体へ乗り、実測で
    //         リニア 0.10 ぶんの白が足されていた。具も皿もルウも
    //         青が持ち上がって彩度が落ちる。料理写真の見えに寄せて絞る。
    //         ただし絞りすぎると白飯の回り込みが足りなくなるので、
    //         ライスを rice-H に合わせたぶんだけ少し戻す
    scene.environmentIntensity = 0.70;
    // ぼかしすぎるとハイライトのコントラストが消えて「艶消しの何か」になる
    env.lodGenerationOffset = 0.20;

    // 【対策】広角（fov 0.62）だと、手前のスプーンが皿より 13% 大きく写り、
    //         実寸どおりでも「長すぎる」絵になる。料理写真は 85〜100mm 相当の
    //         望遠で撮る。距離を伸ばして fov を絞れば、写る範囲は同じまま
    //         遠近だけが寝る
    const camera = new BABYLON.ArcRotateCamera("cam", -1.42, 0.90, 62, new V3(0.4, 1.8, 0), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 3.2;
    camera.fov = 0.345;
    // 【対策】ポストプロセスを通すとシーンは深度つきの RT へ描かれる。
    //         maxZ 既定(10000) のままだと深度の分解能が足りず、
    //         ルウ面と具の前後が勝ったり負けたりしてちらつく
    camera.minZ = 10.0;
    camera.maxZ = 300;
    camera.lowerRadiusLimit = 26;
    camera.upperRadiusLimit = 190;
    camera.upperBetaLimit = 1.50;      // テーブルの下へ潜らせない
    scene.cameraToUseForPointers = camera;

    // ---- 灯 ----------------------------------------------------------
    // 料理写真の定石。左上後方からのキー、反対からのフィル、
    // 拡散をほぼ 0 にして鏡面だけ足すキック（濡れた面の照り担当）
    const key = new BABYLON.DirectionalLight("key", new V3(-0.40, -0.95, 0.48).normalize(), scene);
    key.position = new V3(16, 34, -20);
    // ★【対策】白飯が灰色に見えるとき、疑うのは露出ではなく照明比
    //   （キー ÷ 回り込み）。ここが 14 もあると、反射率 90% の白でさえ
    //   影側が中間調まで落ちる。露出で持ち上げるとキー正面が先に飽和して
    //   階調が消えるので、比だけを下げる（ご飯.js rice-H の結論）
    key.intensity = 2.20;
    key.diffuse = new BABYLON.Color3(1.0, 0.972, 0.934);
    // 【対策】平行光の影の範囲は既定だとキャスターの AABB にぴったり合う。
    //         すると影の落ちる先（テーブル）が範囲外になり直線でぶつ切りになる
    key.autoUpdateExtends = false;
    key.orthoLeft = -26; key.orthoRight = 26;
    key.orthoBottom = -26; key.orthoTop = 26;
    key.shadowMinZ = 1; key.shadowMaxZ = 90;

    // 【対策】平行光のハイライトは1点しか出ない。カレーの油膜に何本も走る
    //         照りを作るには、拡散をほぼ 0 にして鏡面だけ足す灯が要る
    const back = new BABYLON.DirectionalLight("back", new V3(0.58, -0.34, -1.0).normalize(), scene);
    back.intensity = 1.55;
    back.diffuse = new BABYLON.Color3(0.052, 0.048, 0.044);
    back.specular = new BABYLON.Color3(1.0, 0.965, 0.905);

    // ★【対策】これがレフ板。白い被写体の影側を持ち上げるのはここだけ。
    //   0.19 では回り込みがまったく足りない。また青みを残すと白飯が
    //   冷たい灰色へ寄るので、わずかに暖色にする
    const fill = new BABYLON.HemisphericLight("fill", new V3(-0.2, 1, -0.35), scene);
    fill.intensity = 0.58;                 // key/fill = 3.8
    fill.diffuse = new BABYLON.Color3(1.0, 0.985, 0.960);
    fill.groundColor = new BABYLON.Color3(0.33, 0.30, 0.27);
    fill.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    // 【対策】ESM は柔らかいが depthScale を詰めないと痣が出る。
    //         cm スケールの食べ物では PCF に落としたほうが早くきれい
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0035;
    sg.normalBias = 0.012;
    // 【対策】照明比を下げたので、影も浅くなるのが物理的に正しい。
    //         0.30 のままだと影だけが取り残されて硬く見える
    sg.setDarkness(0.38);              // 屋内の影は真っ黒にならない

    // ---- テーブル -----------------------------------------------------
    // 【対策】年輪を 7 本／うねり 1.9 で敷くと、周期が 4cm 近い大きな波に
    //         なり、木ではなく布か砂紋に見える。実物のオーク／タモの卓は
    //         線が細く、間隔 5〜10mm でほぼ直線に走る
    const tableWood = woodSet(scene, "table", 640, 7717, {
        base: [0.748, 0.662, 0.558], grain: [0.548, 0.456, 0.378],
        dark: [0.418, 0.322, 0.250],
        rings: 22.0, wave: 1.70, sharp: 2.3, knot: 0.30, rough: 0.44, bump: 0.7,
        across: true
    });
    const table = BABYLON.MeshBuilder.CreateGround("table", { width: 300, height: 300 }, scene);
    named(table, "table");
    const tableMat = new BABYLON.PBRMaterial("tableMat", scene);
    tableMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    tableMat.albedoTexture = tableWood.albedo;
    tableMat.metallic = 0.0;
    tableMat.roughness = 1.0;
    tableMat.metallicTexture = tableWood.orm;
    tableMat.useRoughnessFromMetallicTextureGreen = true;
    tableMat.useMetallnessFromMetallicTextureBlue = true;
    tableMat.bumpTexture = tableWood.normal;
    tableMat.bumpTexture.level = 0.26;
    tableMat.clearCoat.isEnabled = true;
    tableMat.clearCoat.intensity = 0.22;
    tableMat.clearCoat.roughness = 0.34;
    for (const t of [tableWood.albedo, tableWood.orm, tableWood.normal]) { t.uScale = 10; t.vScale = 10; }
    table.material = tableMat;
    table.receiveShadows = true;

    // ---- 湯気 ---------------------------------------------------------
    const steamTex = makeSteamTexture(scene);
    const steam = new BABYLON.ParticleSystem("steam", 260, scene);
    steam.particleTexture = steamTex;
    steam.emitter = new V3(GLOBAL.pourCX * 0.5, GLOBAL.wellY + 1.6, GLOBAL.pourCZ);
    steam.minEmitBox = new V3(-4.2, 0, -3.4);
    steam.maxEmitBox = new V3(4.2, 0.4, 3.4);
    steam.color1 = new BABYLON.Color4(1, 1, 1, 0.055);
    steam.color2 = new BABYLON.Color4(1, 0.985, 0.96, 0.030);
    steam.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    steam.minSize = 2.4; steam.maxSize = 7.5;
    steam.minLifeTime = 1.5; steam.maxLifeTime = 3.4;
    steam.emitRate = 44;
    steam.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    steam.gravity = new V3(0, 2.6, 0);
    steam.direction1 = new V3(-0.7, 3.2, -0.4);
    steam.direction2 = new V3(0.9, 5.0, 0.5);
    steam.minAngularSpeed = -0.5; steam.maxAngularSpeed = 0.5;
    steam.minEmitPower = 0.5; steam.maxEmitPower = 1.5;
    steam.updateSpeed = 0.012;

    // =================================================================
    //  組み立て / 差し替え
    // =================================================================
    let currentRoux = "pork", currentPlate = "white", currentChunk = "standard";
    let currentSeed = 0xCA881E;
    let state = null;
    let onRebuilt = null;
    let albedoDirty = false;

    const live = {
        sigma: ROUX.pork.sigma,
        tauY: ROUX.pork.tauY,
        pool: ROUX.pork.pool,
        film: ROUX.pork.film,
        oil: ROUX.pork.oil,
        rough: ROUX.pork.rough,
        ao: 1.0,
        stain: 1.0,
        grain: 1.0
    };

    // ---- 皿の上面の高さ（高速版） ----------------------------------------
    // 【対策】contourD を素直に二分法で解くと 640² のテクスチャ生成だけで
    //         1200 万回の pow が走る。φ=0 と φ=1 の領域では解析的に解けるので、
    //         ブレンド帯（幅 2.5cm）に入ったときだけ 16 回の二分法に落とす
    const SE_N = 2048;
    const seTab = new Float32Array(SE_N + 1);
    for (let i = 0; i <= SE_N; i++) seTab[i] = seRadius(i / SE_N * TAU, GLOBAL);
    function seFast(th) {
        let t = th / TAU; t -= Math.floor(t);
        const f = t * SE_N, i = f | 0;
        return seTab[i] + (seTab[i + 1] - seTab[i]) * (f - i);
    }
    function contourDFast(x, z) {
        const G = GLOBAL;
        const r = Math.hypot(x, z);
        if (r < 1e-6) return G.plateDmax;
        const r0 = seFast(Math.atan2(z, x));
        if (r >= r0) return 0;
        // φ=0 の領域（一定オフセット）
        const d0 = r0 - r;
        if (d0 <= G.blendD0) return d0;
        // φ=1 の領域（比例縮小）
        const d1 = G.plateDmax * (1 - r / r0);
        if (d1 >= G.blendD1) return d1;
        // ブレンド帯だけ二分法
        let lo = G.blendD0, hi = G.blendD1;
        for (let i = 0; i < 18; i++) {
            const m = (lo + hi) * 0.5;
            const phi = smooth(G.blendD0, G.blendD1, m);
            if (r0 - m * (1 - phi * (1 - r0 / G.plateDmax)) > r) lo = m; else hi = m;
        }
        return (lo + hi) * 0.5;
    }
    const plateProf = plateProfiles(GLOBAL);
    function plateTopY(x, z) { return plateProf.top(contourDFast(x, z)); }

    // 平らな見込み（＝立ち上がりより内側）に、半径 rad ごと収まるか。
    // 皿の壁へ乗り上げた物は、壁の内側の面を突き抜けて外から見える
    function inWell(x, z, rad) {
        const G = GLOBAL;
        if (contourDFast(x, z) < G.wallD + 0.10) return false;
        // 8 方向で外周も見る（中心だけだと縁に半分かかった駒を通す）
        for (let a = 0; a < 8; a++) {
            const th = a / 8 * TAU;
            if (contourDFast(x + Math.cos(th) * rad, z + Math.sin(th) * rad) < G.wallD + 0.02) return false;
        }
        return true;
    }

    // ---- 具の配置 --------------------------------------------------------
    // 【対策】ルウの中で具を等間隔に並べると盛り付けサンプルになる。
    //         かけたときに転がるので、中心から外へ向かって偏り、
    //         いくつかは互いにもたれかかる。黄金角＋棄却で散らす
    function placeChunks(G, ro, surf0, seed, mix) {
        const rng = new Rng((seed ^ 0x71C0) >>> 0);
        const list = [];
        const kinds = [];
        for (let i = 0; i < mix.potato; i++) kinds.push("potato");
        for (let i = 0; i < mix.carrot; i++) kinds.push("carrot");
        for (let i = 0; i < mix.meat; i++) kinds.push("meat");
        for (let i = 0; i < (mix.wiener || 0); i++) kinds.push("wiener");
        // 大きいものから置く（あとから小さいものが隙間に入る）
        kinds.sort((a, b) => CHUNK_SPEC[b].size - CHUNK_SPEC[a].size);
        const placed = [];
        for (let i = 0; i < kinds.length; i++) {
            const kind = kinds[i];
            const S = CHUNK_SPEC[kind];
            // 【対策】3割ほどは完全に沈める。沈んだ具はルウ面へ「盛り上がり」と
            //         「うっすらした色」として焼かれる。これが無いと
            //         「具が全部きれいに顔を出した見本写真」になる
            // 【対策】沈める割合が 3 割あると、増やした具の 3 割が
            //         そのままルウ面へ焼かれて見えない。2 割に落とす
            const sunk = !CHUNK_SPEC[kind].neverSunk && rng.next() < 0.20;
            const sc = sunk ? rng.range(0.52, 0.78) : rng.range(0.86, 1.14);
            let cx = 0, cz = 0, ok = false;
            for (let tryN = 0; tryN < 90 && !ok; tryN++) {
                const th = (i * 2.39996 + rng.range(-0.55, 0.55)) % TAU;
                const q0 = surf0.distOf(G.pourCX + Math.cos(th), G.pourCZ + Math.sin(th));
                const rb = q0.rb;
                const rr = rb * Math.sqrt(rng.range(0.02, 0.90));
                cx = G.pourCX + Math.cos(th) * rr;
                cz = G.pourCZ + Math.sin(th) * rr;
                // 縁からの距離が足りないと具が皿へはみ出す
                const q = surf0.distOf(cx, cz);
                if (q.d < S.size * sc * (S.placeK !== undefined ? S.placeK : 0.80)) continue;
                // ライスの上には乗せない
                const my = moundY(cx, cz, G, seed);
                if (my > -1e8 && my > G.wellY + 0.25) continue;
                ok = true;
                // 【対策】0.80 だと具が必ず間隔をあけて並び、数を増やしても
                //         「等間隔に配置された見本」になる。実物は互いに
                //         もたれかかって寄り集まる。半径の和の 6 割まで許す
                for (const p of placed) {
                    const need = (p.rad + S.size * sc) * 0.58;
                    if (Math.hypot(cx - p.x, cz - p.z) < need) { ok = false; break; }
                }
            }
            if (!ok) continue;
            placed.push({ x: cx, z: cz, rad: S.size * sc });
            // 姿勢。にんじんと肉は寝かせる（立った具は転がって落ちる）
            let q;
            if (kind === "carrot" || kind === "meat" || kind === "wiener") {
                const spin = BABYLON.Quaternion.RotationAxis(new V3(0, 1, 0), rng.range(0, TAU));
                // 【対策】にんじんは長軸を y で作ってある（切り口を球面
                //         パラメータの極に合わせるため）。そのまま置くと
                //         皿の上に棒が立つ。90°倒してから寝かせる
                const base = CHUNK_SPEC[kind].layDown ? Math.PI * 0.5 : 0;
                const sd = CHUNK_SPEC[kind].laySd || 0.30;
                const lay = BABYLON.Quaternion.RotationAxis(new V3(1, 0, 0), base + rng.gauss(0, sd));
                q = spin.multiply(lay);
            } else {
                q = BABYLON.Quaternion.RotationYawPitchRoll(
                    rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU));
            }
            const ch = makeChunk(kind, cx, 0, cz, sc, q, (seed + i * 7919) >>> 0);
            // 接地。
            // 【対策】ローカルの最大辺で持ち上げると、細長いにんじんが
            //         長辺ぶん浮いて宙に浮く。ワールドの実測最下点を使う
            const lo = minY(ch.g.positions, ch.g.nV);
            const floor = plateTopY(cx, cz);
            let dy = floor + 0.015 - lo;
            const top0 = (() => { let m = -1e9; for (let v = 0; v < ch.g.nV; v++) { const y = ch.g.positions[v * 3 + 1] + dy; if (y > m) m = y; } return m; })();
            const sy = surf0(cx, cz);
            for (let v = 0; v < ch.g.nV; v++) ch.g.positions[v * 3 + 1] += dy;
            if (sunk) {
                // 沈めたい: 上面がルウ面の数 mm 下に来るまで下げる。
                // 【対策】そのまま平行移動で下げると、ルウの浅い所に来た具が
                //         皿の底を突き抜ける（実測で最大 5.8mm めり込んでいた）。
                //         煮えた具は底に着いたまま「潰れて低くなる」ものなので、
                //         接地点を固定して縦だけ縮める。これなら底を割らない。
                const want = sy - rng.range(0.04, 0.26);
                const baseY = floor + 0.015;
                if (top0 > want) {
                    const k = clamp((want - baseY) / Math.max(1e-4, top0 - baseY), 0.42, 1);
                    if (k < 0.999) {
                        const N = ch.g.normals;
                        for (let v = 0; v < ch.g.nV; v++) {
                            const iy = v * 3 + 1;
                            ch.g.positions[iy] = baseY + (ch.g.positions[iy] - baseY) * k;
                            // 縦に縮めた面の法線は 1/k で立つ
                            const nx = N[v * 3], ny = N[iy] / k, nz = N[v * 3 + 2];
                            const L = Math.hypot(nx, ny, nz) || 1;
                            N[v * 3] = nx / L; N[iy] = ny / L; N[v * 3 + 2] = nz / L;
                        }
                    }
                }
            }
            let mx = -1e9;
            for (let v = 0; v < ch.g.nV; v++) if (ch.g.positions[v * 3 + 1] > mx) mx = ch.g.positions[v * 3 + 1];
            ch.x = cx; ch.z = cz; ch.top = mx;
            ch.sunk = mx < sy + 0.02;
            bakeChunkColor(ch, sy, ro, G, i);
            list.push(ch);
        }
        return list;
    }

    // ---- インスタンスカラー ------------------------------------------------
    function aoColor(ao, strength, stain, stainAmt) {
        const v = clamp(1 - (1 - ao) * strength, 0.02, 1);
        const w = 1 - v;                    // 暗さ 0..1
        // 【対策】暗がりを灰色で作ると、ごはんの谷が「白黒写真の影」になる。
        //         実物は光が隣の粒を通り抜けて黄色みを帯びて戻るので、
        //         暗いところほど強く暖色へ振る（一定の色かけでは効かない）。
        //         ただし青を 0.30 も落とすと黄土色まで転ぶので 0.16 が上限
        let r = v * (1 + 0.06 * w), g = v * (1 - 0.02 * w), b = v * (1 - 0.16 * w);
        if (stain > 0) {
            // 【対策】(0.34, 0.17, 0.07) を白い米に掛けると、線形で
            //         (0.31, 0.15, 0.06) ＝ sRGB (0.59, 0.42, 0.28) の
            //         明るいベージュになる。ルウの地色は線形
            //         (0.17, 0.05, 0.005) なので、染みた粒だけが 2 倍明るく、
            //         しかも青が 12 倍残る。境目に灰茶色の帯として浮いていた。
            //         ルウの地色そのものへ寄せる（わずかに明るいのは、
            //         粒に乗っているのが厚み 1mm 弱の膜だから）
            const t = clamp(stain * stainAmt, 0, 1);
            r *= mix(1, 0.215, t); g *= mix(1, 0.082, t); b *= mix(1, 0.018, t);
        }
        return new BABYLON.Color4(r, g, b, 1);
    }

    function disposeState(st) {
        if (!st) return;
        for (const m of st.meshes) if (m) m.dispose(false, false);
        for (const m of st.mats) if (m) {
            if (m.texs) for (const t of m.texs) t.dispose();
            m.dispose(true, false);
        }
        if (st.rouxTex) for (const k in st.rouxTex) st.rouxTex[k].dispose();
    }

    const grainTexCache = {};
    function getGrainTex() {
        if (!grainTexCache.t) grainTexCache.t = riceTextures(scene, RICE, 0x9911);
        return grainTexCache.t;
    }

    let buildNo = 0;
    function build() {
        const G = GLOBAL;
        buildNo++;
        const seed = currentSeed >>> 0;
        const pr = PLATES[currentPlate];
        const mixCfg = CHUNKS[currentChunk];
        const base = ROUX[currentRoux];
        // GUI で触った値を重ねる
        const ro = Object.assign({}, base, {
            sigma: live.sigma, tauY: live.tauY, pool: live.pool,
            film: live.film, oil: live.oil, rough: live.rough
        });
        const meshes = [], mats = [];
        disposeState(state);

        // 1. 皿
        const loop = plateLoop(G);
        const plateMat = plateMaterial(scene, G, pr, loop, seed ^ 0x1A);
        const plate = buildPlate(scene, G, plateMat, seed);
        meshes.push(plate); mats.push(plateMat);
        sg.addShadowCaster(plate);

        // 2. ライスの本体
        const gtex = getGrainTex();
        // 【対策】下地に粒と同じマテリアルを貼ると、クリアコート（水の膜）が
        //         なめらかな面の上でそのまま鏡面になり、粒のすき間に白い水が
        //         たまって見える。下地は「谷の底の影」なので、艶も透光も要らない
        // 【対策】0.62 倍まで落とすと、粒のすき間から覗いた下地が
        //         「灰色の素体」としてはっきり見える（実測 sRGB 0.59）。
        //         下地は谷の底なので暗いのが正しいが、それは影で作るもので、
        //         アルベドで作ると色まで灰色に転ぶ。米の色のまま
        //         0.86 倍に留め、暗さは粒間の暗がりと影に任せる
        const bodyMat = new BABYLON.PBRMaterial("riceBodyMat", scene);
        bodyMat.albedoColor = col3([RICE.albedo[0] * 0.86,
                                    RICE.albedo[1] * 0.85,
                                    RICE.albedo[2] * 0.82]);
        bodyMat.metallic = 0.0;
        bodyMat.roughness = 0.85;
        bodyMat.clearCoat.isEnabled = false;
        bodyMat.subSurface.isTranslucencyEnabled = false;
        const body = buildRiceBody(scene, G, seed, bodyMat);
        meshes.push(body); mats.push(bodyMat);
        sg.addShadowCaster(body);

        // 3. ルウの縁 → 仮のルウ面（具を含まない）
        const B = buildRouxBoundary(G, seed, plateTopY, 512);
        const surf0 = makeSurfFn(G, B, seed, plateTopY, ro, null);

        // 4. 具を置く
        const chunkMats = {};
        for (const k in CHUNK_SPEC) {
            chunkMats[k] = chunkMaterial(scene, CHUNK_SPEC[k], k + "Mat");
            mats.push(chunkMats[k]);
        }
        const chunks = placeChunks(G, ro, surf0, seed, mixCfg);

        // 4b. 玉ねぎ。じゃがいもと同じ扱いにするため、幾何だけ先に作る。
        //     大半は煮えて沈んでいて、たまに一切れが顔を出す
        const onions = [];
        {
            const orng = new Rng((seed ^ 0x0417) >>> 0);
            for (let i = 0; i < mixCfg.onion; i++) {
                const th = orng.range(0, TAU);
                const q0 = surf0.distOf(G.pourCX + Math.cos(th), G.pourCZ + Math.sin(th));
                const rr = q0.rb * Math.sqrt(orng.range(0.05, 0.80));
                const ox = G.pourCX + Math.cos(th) * rr, oz = G.pourCZ + Math.sin(th) * rr;
                if (surf0.distOf(ox, oz).d < 0.6) continue;
                const sy = surf0(ox, oz);
                // 【対策】全部を「ルウ面のすぐ下」に置くと、うねりのぶんだけ
                //         あちこちで貫いて茶色い帯になる。3枚に1枚だけ
                //         顔を出させ、残りははっきり沈めて面へ焼く。
                // 【対策】と書いたが、これは逆だった。σ=6/cm では 2mm 沈むと
                //         7割がルウに食われ、写る面積も 1cm² に満たないので
                //         沈めた玉ねぎは事実上いないのと同じになる（実測）。
                //         参考写真でも玉ねぎは「半分顔を出した平たい帯」として
                //         はっきり見えている。潰して平たくしたので、
                //         顔を出させても以前のような茶色い帯にはならない。
                // 【対策】中心の高さで沈む／出るを決めると、玉ねぎは
                //         湾曲した皮なので上端が中心より 5mm も上に来て、
                //         沈めたはずのものが顔を出す。まず作って上端を測り、
                //         上端がルウ面のどこに来るかで置き直す
                const shows = orng.next() < 0.76;
                // 【対策】傾きを ±0.4/±0.5 rad 振ると、1.5cm の帯が端で
                //         7mm も落ちる。σ=6/cm では 2mm 沈んだだけで
                //         見えなくなるので、沈めた玉ねぎは上端の稜線しか
                //         写らず、実質いないのと同じだった（実測で
                //         1枚あたり 0.14cm² しか写っていなかった）。
                //         煮えた玉ねぎはルウの中でほぼ水平に浮くので、
                //         傾きを抑えて面ごと浅いところに置く
                // 【対策】くし切りは極を通る2枚の平面で切った房なので、
                //         軸（y）を立てたまま置くと上から見て円弧にしか
                //         見えない。軸を寝かせると切り口が横を向いて、
                //         層の縞と厚みが両方見える。これが「玉ねぎだ」と
                //         分かる決め手
                const q = BABYLON.Quaternion.RotationYawPitchRoll(
                    orng.range(0, TAU), Math.PI * 0.5 + orng.gauss(0, 0.42),
                    orng.range(0, TAU));
                const g = makeOnionGeom(ox, 0, oz, orng.range(0.62, 1.00), q,
                    (seed + i * 613) >>> 0);
                // 沈める深さを 6〜22mm 取ると σ=6/cm の消散で消えるので、
                // 上端で 0.6〜2.2mm に留める
                // 【対策】薄い帯だったころは上端を 0.2〜1.1mm 出すだけで
                //         じゅうぶんだったが、くし切りは厚みがあるので
                //         それでは稜線しか出ず、ルウの染みにしか見えない
                const wantTop = shows ? sy + orng.range(0.10, 0.52)
                    : sy - orng.range(0.04, 0.16);
                {
                    const dy0 = wantTop - g.top;
                    for (let v = 0; v < g.nV; v++) g.positions[v * 3 + 1] += dy0;
                    g.top += dy0;
                }
                // 皿へめり込ませない
                const floor = plateTopY(ox, oz) + 0.02;
                let lo = 1e9;
                for (let v = 0; v < g.nV; v++) lo = Math.min(lo, g.positions[v * 3 + 1]);
                if (lo < floor) {
                    const dy = floor - lo;
                    for (let v = 0; v < g.nV; v++) g.positions[v * 3 + 1] += dy;
                    g.top += dy;
                }
                // ルウの膜を着せる（じゃがいも・肉と同じ式）
                coatOnion(g, sy, ro, G, (seed + i * 613) >>> 0);
                g.sunk = g.top < sy - 0.02;
                onions.push(g);
            }
        }

        // 5. 沈んだ具だけの最上点バッファ → 最終のルウ面
        let bMinX = 1e9, bMaxX = -1e9, bMinZ = 1e9, bMaxZ = -1e9;
        for (let j = 0; j < B.NS; j++) {
            const th = j / B.NS * TAU, r = B.rb[j] + B.ext[j];
            const x = G.pourCX + Math.cos(th) * r, z = G.pourCZ + Math.sin(th) * r;
            if (x < bMinX) bMinX = x; if (x > bMaxX) bMaxX = x;
            if (z < bMinZ) bMinZ = z; if (z > bMaxZ) bMaxZ = z;
        }
        const pad = 0.6;
        const box = { minX: bMinX - pad, maxX: bMaxX + pad, minZ: bMinZ - pad, maxZ: bMaxZ + pad };
        const mpSunk = new SubmergeMap(G.subGrid, box.minX, box.maxX, box.minZ, box.maxZ);
        for (const ch of chunks) if (ch.sunk) mpSunk.addGeom(ch.g.positions, ch.colors, ch.g.indices);
        for (const on of onions) if (on.sunk) mpSunk.addGeom(on.positions, on.colors, on.indices);
        const surfY = makeSurfFn(G, B, seed, plateTopY, ro, mpSunk);

        // 6. 顔を出している物までの距離場（メニスカスと接触の暗がり）。
        //    ライスもルウ面から出ているので、ここへ入れる
        const mpOut = new SubmergeMap(G.subGrid, box.minX, box.maxX, box.minZ, box.maxZ);
        for (const ch of chunks) if (!ch.sunk) mpOut.addGeom(ch.g.positions, ch.colors, ch.g.indices);
        for (const on of onions) if (!on.sunk) mpOut.addGeom(on.positions, on.colors, on.indices);
        mpOut.addMesh(body);
        mpOut.buildDistance(surfY);

        // 7. ルウ面
        const F = rouxFields(G, B, seed, surfY, plateTopY, mpSunk, mpOut, box, ro);
        const rouxTex = rouxTextures(scene, G, F, ro, ro.sigma, pr.albedo);
        const rouxMat = rouxMaterial(scene, rouxTex, ro, "rouxMat");
        const roux = buildRouxSurface(scene, G, B, surfY, rouxMat, box);
        meshes.push(roux); mats.push(rouxMat);
        sg.addShadowCaster(roux);

        // 8. 顔を出している具だけメッシュ化する。
        //    沈んだ具はルウ面へ焼いてあるので、描いても1ピクセルも見えない
        let chunkTris = 0, shown = 0;
        for (const ch of chunks) {
            if (ch.sunk) continue;
            const m = makeMesh(ch.kind, ch.g.positions, ch.g.indices, ch.g.normals,
                ch.g.uvs, ch.colors, scene);
            m.material = chunkMats[ch.kind];
            m.receiveShadows = true;
            sg.addShadowCaster(m);
            meshes.push(m); chunkTris += m.tris; shown++;
        }

        // 9. 玉ねぎ。沈んだものはルウ面へ焼いてあるので、描くのは出ている分だけ
        let onShown = 0;
        if (onions.some((o) => !o.sunk)) {
            const onMat = onionMaterial(scene); mats.push(onMat);
            for (const on of onions) {
                if (on.sunk) continue;
                const m = onionMesh(scene, on, onMat);
                meshes.push(m); chunkTris += m.tris; sg.addShadowCaster(m);
                onShown++;
            }
        }

        // 10. 米粒。ルウに沈んだ粒は描かない
        const grainMat = riceMaterial(scene, RICE, gtex, "grainMat", false);
        mats.push(grainMat);
        const pts = bakeAO(placeGrains(G, seed), G, seed);
        const variants = [];
        for (let vi = 0; vi < G.grainVariants; vi++) {
            const gv = buildGrainVertexData(RICE, (seed + vi * 1013) >>> 0, G.grainRings, G.grainSides);
            const m = named(new BABYLON.Mesh("grain" + vi, scene), "grain" + vi);
            gv.vd.applyToMesh(m, false);
            m.hasVertexAlpha = false;
            m.material = grainMat;
            m.tris = gv.info.tris;
            // 【対策】インスタンスを作らないメッシュに registerInstancedBuffer すると
            //         描画時に色が渡らず真っ黒になる。必ず親にも既定値を入れる
            m.registerInstancedBuffer("color", 4);
            m.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
            m.isVisible = false;                 // 親は隠してインスタンスだけ出す
            variants.push(m);
            meshes.push(m);
        }
        const rng2 = new Rng((seed ^ 0x2C3D) >>> 0);
        const up = new V3(0, 1, 0);
        const nodes = [];
        let culled = 0;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const sy = surfY(p.x, p.z);
            let stain = 0;
            if (sy > -1e8) {
                // ルウ面より下の粒は完全に隠れる。描かない
                if (p.y + 0.085 < sy) { culled++; continue; }
                // 水際の粒はルウが染みる。上へ行くほど地の色へ戻る
                // 【対策】0.80cm で線形に抜くと、水際から 8mm ぶんの粒が
                //         中途半端に染まった帯になる。実物は数mmで切り替わり、
                //         その上は白いまま。裾を長く取って立ち上がりを急にする
                stain = 1 - smooth(0.0, 0.95, p.y - sy);
                stain = Math.pow(stain, 1.35);
            }
            const variant = variants[i % variants.length];
            // 【対策】インスタンス名を "g"+i だけにすると、盛り直すたびに
            //         同じ id が生えて Scene Explorer の Picker が過去の
            //         個体へ当たる（Node は id = name を既定にするため）。
            //         組み立て回数を混ぜて、作り直しても一意にする
            const node = variant.createInstance("g" + buildNo + "_" + i);
            node.position.set(p.x, p.y, p.z);
            const nrm = moundN(p.x, p.z, G, seed);
            const axis = V3.Cross(up, nrm);
            const len = axis.length();
            let q = (len < 1e-5) ? BABYLON.Quaternion.Identity()
                : BABYLON.Quaternion.RotationAxis(axis.scale(1 / len), Math.asin(clamp(len, -1, 1)));
            const spin = BABYLON.Quaternion.RotationAxis(nrm, rng2.range(0, TAU));
            let rv = new V3(rng2.gauss(0, 1), rng2.gauss(0, 1), rng2.gauss(0, 1));
            if (rv.lengthSquared() < 1e-8) rv = new V3(1, 0, 0);
            rv.normalize();
            // 【対策】全粒を同じばらつきで寝かせると整列して見える。大半は
            //         寝かせ、一部だけ大きく起こす。この「少数の立った粒」が
            //         ふっくら感の正体で、これが無いと表面が舗装になる
            const loose = rng2.next() < 0.40;
            const tilt = BABYLON.Quaternion.RotationAxis(rv, rng2.gauss(0, loose ? 1.10 : 0.26));
            node.rotationQuaternion = tilt.multiply(spin.multiply(q));
            const broken = rng2.next() < 0.15;
            node.scaling.set(
                broken ? rng2.range(0.60, 0.80) : rng2.range(0.92, 1.08),
                rng2.range(0.94, 1.06), rng2.range(0.94, 1.06));
            node.instancedBuffers.color = aoColor(p.ao, live.ao, stain, live.stain);
            p.stain = stain;
            p.node = node;
            nodes.push(node);
        }

        // 10b. 米粒の上端の格子。
        // 【対策】福神漬けを座らせる下地を「盛りの面 ＋ 半粒」で見積もって
        //         いたが、これでは足りない。粒は面から最大 1.6mm 浮いて
        //         いるうえ（placeGrains の LIFT）、大きく起こした粒は
        //         中心から 2.8mm も上へ出る。実測すると、いちばん高い粒は
        //         見積もりより 1.6mm 上にあり、そのぶん福神漬けを突き抜けて
        //         「漬物の上に米粒が乗っている」絵になっていた（実際に出た）。
        //         式で見積もらず、置いた粒の姿勢から上端を出して格子へ焼く
        const GT_CELL = 0.22, GT_OFF = 4096;
        const GT_KEY = (i, j) => (i + GT_OFF) * 100003 + (j + GT_OFF);
        const grainTop = new Map();
        {
            const m4 = BABYLON.Matrix.Identity();
            const hx = RICE.lengthMM * MM * 0.5;   // 局所 x = 長さ
            const hy = RICE.heightMM * MM * 0.5;   //      y = 高さ
            const hz = RICE.widthMM * MM * 0.5;    //      z = 幅
            for (const nd of nodes) {
                BABYLON.Matrix.FromQuaternionToRef(nd.rotationQuaternion, m4);
                const sc2 = nd.scaling, M = m4.m;
                // 回転した直方体の上端 = Σ |M(y行, j)| × 半径_j
                // （Babylon の行列は y' = x·m[1] + y·m[5] + z·m[9] + m[13]）
                const rise = Math.abs(M[1]) * hx * sc2.x
                    + Math.abs(M[5]) * hy * sc2.y
                    + Math.abs(M[9]) * hz * sc2.z;
                const top = nd.position.y + rise;
                const k = GT_KEY(Math.floor(nd.position.x / GT_CELL),
                    Math.floor(nd.position.z / GT_CELL));
                const cur = grainTop.get(k);
                if (cur === undefined || top > cur) grainTop.set(k, top);
            }
        }
        // 3×3 の近傍を見る。粒の差し渡し（約 5.5mm）は格子1マスより広い
        const grainTopAt = (x, z) => {
            const i0 = Math.floor(x / GT_CELL), j0 = Math.floor(z / GT_CELL);
            let m = -1e9;
            for (let di = -1; di <= 1; di++) {
                for (let dj = -1; dj <= 1; dj++) {
                    const v = grainTop.get(GT_KEY(i0 + di, j0 + dj));
                    if (v !== undefined && v > m) m = v;
                }
            }
            return m;
        };

        // 11. 福神漬け
        const fkMeshes = [];
        if (G.fukujin) {
            const fkMat = fukujinMaterial(scene); mats.push(fkMat);
            // ライスの手前側、皿の端へ添える。
            // 【対策】皿の縁側（z = -riceAZ - 1.55）に置いていたが、
            //         そこは平らな見込みの外＝立ち上がりの上だった。
            // 【対策】次に盛りの内側（u≈0.46）へ寄せた。斜面が 22°で
            //         止まりはするが、参考写真の福神漬けは「ごはんの山の上」
            //         ではなく「ごはんと皿の境目」に、皿の縁へ寄せて
            //         こんもり置いてある。
            //         そこで落とす場所をライスの裾（u≈0.99）へ戻す。
            //         裾は 35°の斜面で止まらないが、物理で落としている
            //         いまは止まる必要が無い——滑り落ちた先が平らな見込みで、
            //         山のふもとに寄り集まって溜まるのが正しい姿。
            //         当たり判定の板（半径 4.2cm）が皿の立ち上がりまで
            //         覆っているので、外へは流れ出さない
            const fx = G.riceCX - 3.15, fz = -4.45;
            // 下にあるのが皿でもライスでも、その上へ座らせる。
            // 粒がある所は実測の上端（10b）、無い所は皿の上面
            const seatY = (x, z) => {
                const py = plateTopY(x, z);
                const gt = grainTopAt(x, z);
                return (gt > -1e8 && gt > py) ? gt + 0.008 : py;
            };
            const usePhys = !!(G.fukujinPhysics && havokReady && scene.getPhysicsEngine());
            const flakes = buildFukujin(scene, fx, fz, seatY,
                (seed ^ 0x5F1E) >>> 0, fkMat, G, inWell, usePhys);
            if (usePhys) {
                // 当たり判定はこの1回のためだけに作って、静定したら捨てる
                const col = buildFukujinCollider(scene, fx, fz, seatY,
                    FK_PHYS.colliderR, FK_PHYS.colliderN);
                settleFukujin(scene, flakes, seatY(fx, fz));
                col.aggregate.dispose();
                col.mesh.dispose();
            }
            for (const f of flakes) {
                fkMeshes.push(f.mesh); meshes.push(f.mesh); sg.addShadowCaster(f.mesh);
            }
        }

        // 12. スプーン
        let spoon = null;
        if (G.spoon) {
            const spMat = spoonMaterial(scene); mats.push(spMat);
            // 【対策】z = +12.6 は画面の奥。配膳は手前（カメラ側 ＝ -z）。
            //         画角（fov 0.345 / beta 0.90 / radius 62）で卓の面が
            //         切れるのは z ≒ -12.5 なので、そのすこし内側に置く。
            //         向きは π 回して、つぼを左・柄を右にする。
            //         スプーンは長軸について左右対称なので、鏡映ではなく
            //         鉛直軸まわりの 180° 回転で足りる（鏡映で作ると
            //         三角形の巻き順が全部裏返って法線が内を向く）
            spoon = buildSpoon(scene, 2.6, -11.8, Math.PI + 0.06, spMat, seed);
            meshes.push(spoon); sg.addShadowCaster(spoon);
        }

        state = {
            meshes, mats, plate, body, roux, rouxTex, rouxMat, F, B, box,
            chunks, onions, onShown, variants, nodes, pts, surfY, ro, pr, fkMeshes, spoon,
            chunkTris, shown, culled, sunk: chunks.filter(c => c.sunk).length
        };
        if (onRebuilt) onRebuilt(state);
        return state;
    }

    // σ / 皿の色だけを描き直す（メッシュは触らない）
    function redrawAlbedo() {
        if (!state) return;
        const st = state;
        const tex = st.rouxTex.albedo;
        const ctx = tex.getContext();
        const N = st.F.N;
        const img = ctx.createImageData(N, N);
        rouxAlbedoFill(img.data, N, st.F, st.ro, live.sigma, st.pr.albedo);
        ctx.putImageData(img, 0, 0);
        tex.update(false);
    }

    // 塗膜（つや）だけ描き直す。ルウ面のジオメトリはそのまま
    function redrawCoat() {
        if (!state) return;
        const st = state;
        const tex = st.rouxTex.coat;
        const ctx = tex.getContext();
        const N = st.F.N;
        const img = ctx.createImageData(N, N);
        rouxCoatFill(img.data, N, st.F, st.ro, live.rough);
        ctx.putImageData(img, 0, 0);
        tex.update(false);
    }

    // 粒のインスタンスカラーだけ描き直す
    function applyGrainColor() {
        if (!state) return;
        // 【対策】pts と nodes の添字は一致しない（沈んだ粒を間引いてある）。
        //         点側にノードを持たせておかないと、1粒ずつ色がずれる
        for (const p of state.pts) {
            if (!p.node) continue;
            p.node.instancedBuffers.color = aoColor(p.ao, live.ao, p.stain, live.stain);
        }
    }

    // =================================================================
    //  ポストプロセス
    // =================================================================
    let ssao = null;
    if (GLOBAL.useSSAO) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        // 【対策】半径を具の大きさ（2cm）まで詰めると、じゃがいもという
        //         じゃがいもの輪郭に黒い縁がついて全体が汚れる。皿とルウ面の
        //         境目のような大きい陰りだけを拾わせる
        ssao.radius = 1.30;
        // 【対策】回り込みを増やしたので、SSAO を強く残すとそこだけ辻褄が
        //         合わなくなる（ごはんの暗がりの四重掛けの一角）
        ssao.totalStrength = 0.34;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 240;
        ssao.minZAspect = 0.25;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.90;
    dp.bloomWeight = 0.13;
    dp.bloomKernel = 44;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.17;
    dp.depthOfFieldEnabled = GLOBAL.useDOF;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.High;
    dp.depthOfField.lensSize = 50;
    dp.depthOfField.fStop = GLOBAL.dofFStop;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    // 【対策】カレーは暗く、ライスと白磁は明るい。両方を1枚に収めるので
    //         露出を上げるとライスが飛び、下げるとルウが黒く潰れる。
    //         露出は控えめにしてコントラストで締める。
    // 【対策】ただし回り込みを増やしたぶんをコントラストで締め直すと
    //         元の木阿弥（白飯がまた灰色へ戻る）。締めるのはビネットに任せる
    ip.exposure = 1.10;
    ip.contrast = 1.12;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.30;
    ip.vignetteCameraFov = 0.72;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    scene.onBeforeRenderObservable.add(() => {
        if (dp.depthOfFieldEnabled) {
            // 【対策】Babylon の錯乱円は「シーン単位 × 1000 = mm」で計算される。
            //         focalLength を固定値にすると被写界深度が数十メートルになる。
            //         合焦距離の一定比にすると focus が約分され、寄っても引いても
            //         ボケ量が変わらない
            const focus = camera.radius * 1000;
            dp.depthOfField.focusDistance = focus;
            dp.depthOfField.focalLength = focus * GLOBAL.dofRatio;
        }
        if (albedoDirty) { albedoDirty = false; redrawAlbedo(); }
    });

    // =================================================================
    // 12. GUI
    // =================================================================
    // 【対策】フルスクリーン GUI を既定のままにすると Bloom / 被写界深度 /
    //         シャープンが UI にも乗ってボケる。定石は layerMask で GUI 専用
    //         カメラへ分離することだが、それをやると Inspector が3系統
    //         まとめて壊れる（Physics Helper / 選択ハイライト / ピッカー）。
    //         Layer.applyPostProcess = false なら2台目のカメラを作らずに
    //         GUI だけポストプロセスの外へ出せる。既定はこちら
    const GUI_MASK = 0x20000000;
    let guiCam = null;

    function bindDebugCamera(sc, mainCam) {
        // UtilityLayerRenderer.getRenderCamera は activeCameras の末尾を直接
        // 参照する。Inspector が内部の WeakMap に抱えていて外から触れない
        // レイヤー（Scene Explorer の選択枠など）まで一括で直すため、
        // インスタンスではなくプロトタイプを差し替える
        const ULR = BABYLON.UtilityLayerRenderer;
        if (ULR && ULR.prototype && !ULR.prototype.__curryPatched) {
            const orig = ULR.prototype.getRenderCamera;
            ULR.prototype.getRenderCamera = function (getDefault) {
                if (this._renderCamera) return this._renderCamera;
                const s = this.originalScene || this.utilityLayerScene;
                if (s && s.__debugMainCamera) return s.__debugMainCamera;
                return orig.call(this, getDefault);
            };
            ULR.prototype.__curryPatched = true;
        }
        sc.__debugMainCamera = mainCam;
        // scene.pick() を camera 引数なしで呼ぶと createPickingRay の中で
        // scene.activeCamera が使われる。描画ループが activeCameras を順に
        // 代入していくので、終わった時点では guiCam が残っている。毎フレーム戻す
        sc.onAfterRenderObservable.add(() => { sc.activeCamera = mainCam; });
        sc.cameraToUseForPointers = mainCam;
    }

    if (GLOBAL.guiOwnCamera) {
        guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -60), scene);
        guiCam.layerMask = GUI_MASK;
        scene.activeCameras = [camera, guiCam];
        bindDebugCamera(scene, camera);
    } else {
        scene.activeCameras = [camera];
    }

    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (ui.layer) {
        if (GLOBAL.guiOwnCamera) ui.layer.layerMask = GUI_MASK;
        else ui.layer.applyPostProcess = false;
    }
    // 【対策】Babylon.GUI のサイズ指定はレンダー解像度基準（≒ CSS px × DPR）。
    //         DPR 3 の端末では 32px のボタンが実質 11 CSS px になり、
    //         「邪魔なうえに押しにくい」状態になる
    ui.idealWidth = 1400;
    ui.renderAtIdealSize = true;

    const COL = {
        idle: "#2c2723", active: "#8a5a26", edge: "#4b443c",
        text: "#f5ece0", sub: "#aca295", accent: "#f0c48a"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "266px";
    card.height = "88%";
    card.cornerRadius = 10;
    card.thickness = 1;
    card.color = COL.edge;
    card.background = "rgba(18,16,14,0.85)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "16px";
    ui.addControl(card);

    const sv = new BABYLON.GUI.ScrollViewer("sv");
    sv.thickness = 0;
    sv.barSize = 10;
    sv.barColor = COL.edge;
    sv.barBackground = "rgba(0,0,0,0)";
    sv.wheelPrecision = 0.02;
    card.addControl(sv);

    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "228px";
    panel.isVertical = true;
    panel.paddingTop = "12px"; panel.paddingBottom = "16px";
    sv.addControl(panel);

    function addLabel(text, size, color, height) {
        const t = new BABYLON.GUI.TextBlock();
        t.text = text; t.height = height || "22px";
        t.color = color || COL.text; t.fontSize = size || 13;
        t.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        t.textWrapping = true;
        panel.addControl(t);
        return t;
    }
    function addButton(name, text, onClick) {
        const b = BABYLON.GUI.Button.CreateSimpleButton(name, text);
        b.height = "32px"; b.paddingBottom = "5px";
        b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 14;
        b.onPointerUpObservable.add(onClick);
        panel.addControl(b);
        return b;
    }
    function addSlider(labelText, min, max, value, fmt, onChange) {
        const lb = addLabel(labelText + "  " + fmt(value), 13, COL.accent, "22px");
        const s = new BABYLON.GUI.Slider(labelText);
        s.minimum = min; s.maximum = max; s.value = value;
        s.height = "18px"; s.width = "214px"; s.paddingBottom = "8px";
        s.color = COL.accent; s.background = "#3a332b"; s.borderColor = "transparent";
        s.onValueChangedObservable.add((v) => { lb.text = labelText + "  " + fmt(v); onChange(v); });
        panel.addControl(s);
        return { label: lb, slider: s };
    }
    function addSpacer(h) {
        const r = new BABYLON.GUI.Rectangle();
        r.height = h || "8px"; r.thickness = 0; r.background = "";
        panel.addControl(r);
    }
    const f2 = (v) => v.toFixed(2);
    const f1 = (v) => v.toFixed(1);

    addLabel("CURRY RICE / カレーライス", 11, COL.sub, "30px");

    const rouxBtns = {}, plateBtns = {}, chunkBtns = {};
    function highlight() {
        for (const k in rouxBtns) rouxBtns[k].background = (k === currentRoux) ? COL.active : COL.idle;
        for (const k in plateBtns) plateBtns[k].background = (k === currentPlate) ? COL.active : COL.idle;
        for (const k in chunkBtns) chunkBtns[k].background = (k === currentChunk) ? COL.active : COL.idle;
    }

    addLabel("ルウ", 13, COL.accent, "22px");
    for (const k of Object.keys(ROUX)) {
        rouxBtns[k] = addButton("r_" + k, ROUX[k].label, () => {
            currentRoux = k;
            const b = ROUX[k];
            live.sigma = b.sigma; live.tauY = b.tauY;
            live.pool = b.pool; live.film = b.film; live.oil = b.oil;
            live.rough = b.rough;
            if (sSigma) sSigma.slider.value = live.sigma;
            if (sTau) sTau.slider.value = live.tauY;
            if (sPool) sPool.slider.value = live.pool;
            if (sRough) sRough.slider.value = live.rough;
            build(); highlight();
        });
    }
    addLabel("皿", 13, COL.accent, "22px");
    for (const k of Object.keys(PLATES)) {
        plateBtns[k] = addButton("p_" + k, PLATES[k].label, () => {
            currentPlate = k; build(); highlight();
        });
    }
    addLabel("具", 13, COL.accent, "22px");
    for (const k of Object.keys(CHUNKS)) {
        chunkBtns[k] = addButton("c_" + k, CHUNKS[k].label, () => {
            currentChunk = k; build(); highlight();
        });
    }

    addSpacer();
    addButton("reseed", "よそい直す", () => {
        currentSeed = (currentSeed * 1664525 + 1013904223) >>> 0;
        build();
    });

    addSpacer();
    // ここが本題のスライダー。0 に寄せるとルウは水になって皿一面へ薄く広がり、
    // 40 まで上げると生煮えのルウがこんもり盛り上がって止まる
    const sTau = addSlider("降伏応力 τy [Pa]", 0.5, 45, live.tauY, f1, (v) => {
        live.tauY = v; build();
        if (tauInfo) tauInfo.text = tauText();
    });
    function tauText() {
        const bead = yieldH(0.10, live.tauY);
        const reach = live.pool * live.pool * RHO * GRAV / (200 * Math.max(0.05, live.tauY));
        return "  縁の土手 " + (bead * 10).toFixed(1) + "mm ／ 深さ "
            + (live.pool * 10).toFixed(0) + "mm に届くまで " + reach.toFixed(1) + "cm";
    }
    const tauInfo = addLabel(tauText(), 11, COL.sub, "34px");

    const sPool = addSlider("たまりの深さ [cm]", 0.3, 1.8, live.pool, f2, (v) => {
        live.pool = v; build();
        if (tauInfo) tauInfo.text = tauText();
    });

    const sSigma = addSlider("ルウの濁り σ [1/cm]", 0.2, 16, live.sigma, f2, (v) => {
        live.sigma = v; albedoDirty = true;
        if (sigmaInfo) {
            sigmaInfo.text = "  消散長 " + (10 / Math.max(v, 1e-3)).toFixed(1)
                + "mm ／ 深さ 3mm で " + Math.round((1 - Math.exp(-v * 0.3)) * 100) + "% 溶ける";
        }
    });
    const sigmaInfo = addLabel("  消散長 " + (10 / live.sigma).toFixed(1)
        + "mm ／ 深さ 3mm で " + Math.round((1 - Math.exp(-live.sigma * 0.3)) * 100) + "% 溶ける",
        11, COL.sub, "34px");

    addSlider("被膜の厚さ [cm]", 0.02, 0.40, live.film, f2, (v) => { live.film = v; build(); });
    addSlider("油膜 ×", 0, 2.2, live.oil, f2, (v) => { live.oil = v; build(); });
    // 【対策】ルウが「水面」に見えるかどうかは、ほぼこの1本で決まる。
    //         低いほど鏡のように映り込み、高いほど粘って見える。
    //         塗膜のテクスチャだけ描き直すので、その場で切り替わる
    const sRough = addSlider("つやの粗さ（とろみ）", 0.05, 0.75, live.rough, f2, (v) => {
        live.rough = v;
        if (state) state.ro.rough = v;
        redrawCoat();
    });

    addSpacer();
    addSlider("粒間の暗がり ×", 0, 2.0, live.ao, f2, (v) => { live.ao = v; applyGrainColor(); });
    addSlider("ルウの染み ×", 0, 2.0, live.stain, f2, (v) => { live.stain = v; applyGrainColor(); });

    addSpacer();
    // ★ ご飯.js（rice-H）の結論。白飯が灰色に見えるとき、疑うのは露出でも
    //   アルベドでもなく、キー ÷ 回り込み の比。ここだけは絵を見ながら
    //   詰められるようにしておく（ルウと皿も一緒に動くので、ルウが眠く
    //   見えたら最初に戻すのもここ）
    addLabel("照明", 13, COL.accent, "22px");
    const lightInfo = addLabel("", 11, COL.sub, "34px");
    function updateLightInfo() {
        lightInfo.text = "  照明比 key/fill = "
            + (key.intensity / Math.max(1e-6, fill.intensity)).toFixed(2)
            + "（白飯が灰色なら 2〜4 が目安）";
    }
    updateLightInfo();
    addSlider("キーライト", 0.5, 4.0, key.intensity, f2, (v) => {
        key.intensity = v; updateLightInfo();
    });
    addSlider("回り込み（レフ板）", 0.0, 1.6, fill.intensity, f2, (v) => {
        fill.intensity = v; updateLightInfo();
    });

    addSpacer();
    const steamBtn = addButton("steam", "湯気: ON", () => setSteam(!steam.isStarted()));
    function setSteam(on) {
        if (on) steam.start(); else steam.stop();
        steamBtn.textBlock.text = "湯気: " + (on ? "ON" : "OFF");
        steamBtn.background = on ? COL.active : COL.idle;
    }
    setSteam(true);

    // 【対策】IBL の無彩色成分は全部の材質へ等しく乗るので、少し多いだけで
    //         シーン全体の彩度が落ちる。絵を見ながら詰められるよう出しておく
    addSlider("環境光 ×", 0.10, 1.40, scene.environmentIntensity, f2, (v) => {
        scene.environmentIntensity = v;
    });

    const backBtn = addButton("back", "照り足し: ON", () => {
        back.setEnabled(!back.isEnabled());
        backBtn.textBlock.text = "照り足し: " + (back.isEnabled() ? "ON" : "OFF");
        backBtn.background = back.isEnabled() ? COL.active : COL.idle;
    });
    backBtn.background = COL.active;

    const fkBtn = addButton("fk", "福神漬け: ON", () => {
        GLOBAL.fukujin = !GLOBAL.fukujin;
        for (const m of state.fkMeshes) m.setEnabled(GLOBAL.fukujin);
        if (GLOBAL.fukujin && state.fkMeshes.length === 0) build();
        fkBtn.textBlock.text = "福神漬け: " + (GLOBAL.fukujin ? "ON" : "OFF");
        fkBtn.background = GLOBAL.fukujin ? COL.active : COL.idle;
    });
    fkBtn.background = COL.active;

    const spBtn = addButton("sp", "スプーン: ON", () => {
        GLOBAL.spoon = !GLOBAL.spoon;
        if (state.spoon) state.spoon.setEnabled(GLOBAL.spoon);
        else if (GLOBAL.spoon) build();
        spBtn.textBlock.text = "スプーン: " + (GLOBAL.spoon ? "ON" : "OFF");
        spBtn.background = GLOBAL.spoon ? COL.active : COL.idle;
    });
    spBtn.background = COL.active;

    const rotBtn = addButton("rot", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.08;
        rotBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });

    addSpacer();
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        GLOBAL.useDOF = !GLOBAL.useDOF;
        dp.depthOfFieldEnabled = GLOBAL.useDOF;
        dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
        dofBtn.textBlock.text = "被写界深度: " + (GLOBAL.useDOF ? "ON" : "OFF");
    });
    dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
    addSlider("ぼけ量", 0.01, 0.20, GLOBAL.dofRatio, f2, (v) => { GLOBAL.dofRatio = v; });
    addSlider("F値", 1.2, 11.0, GLOBAL.dofFStop, f1, (v) => { dp.depthOfField.fStop = v; });

    const info = addLabel("", 12, COL.sub, "110px");

    onRebuilt = (st) => {
        let tri = st.plate.tris + st.body.tris + st.roux.tris + st.chunkTris;
        tri += st.nodes.length * st.variants[0].tris;
        if (st.spoon) tri += st.spoon.tris;
        for (const m of st.fkMeshes) tri += m.tris;
        info.text = "米 " + st.nodes.length + " 粒（ルウに沈んで消したもの "
            + st.culled + "）\n"
            + "具 " + st.shown + " 個（沈めてルウ面へ焼いたもの " + st.sunk + "）\n"
            + tri.toLocaleString() + " tri / ルウ面 " + st.F.N + "²\n"
            + "照明比 key/fill: "
            + (key.intensity / Math.max(1e-6, fill.intensity)).toFixed(2) + "\n"
            + "seed: " + currentSeed;
    };

    build();
    highlight();

    console.log("[CurryRice] build curry-rice-2026-09-03-m",
        "| tauY=" + live.tauY, "| sigma=" + live.sigma,
        "| pool=" + live.pool,
        "| key/fill=" + (key.intensity / fill.intensity).toFixed(2),
        "| seed=" + currentSeed);

    scene.onDisposeObservable.add(() => {
        disposeState(state);
        if (grainTexCache.t) for (const k in grainTexCache.t) grainTexCache.t[k].dispose();
        for (const s2 of [tableWood]) for (const t2 in s2) s2[t2].dispose();
        steamTex.dispose();
    });

    return scene;
};

export default createScene;