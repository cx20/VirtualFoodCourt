// =====================================================================
//  Photoreal Tempura-Soba  /  写実的な「天ぷらそば」
//  Babylon.js Playground 用（JavaScriptモードへ全文貼り付け）
//  build: tensoba-2026-09-21-e
//
//  天ぷらうどん（tenudon-2026-09-20-tempura-swap）からの派生。
//  そばがそばに見えるかどうかは、次の4点でほぼ決まる。
//
//    (a) 太さと角。そばの切り口は 1.5mm 角で、うどんの 1/3 しかない。
//        しかも切り刃で落としたままなので角が立っている（n を 3.4 まで上げる）。
//        細いぶん同じ体積に3倍の長さが要るので、充填率と刻み幅で釣り合いを取る。
//    (b) 色。そばは「茶色い麺」ではなく、灰色を含んだ淡い褐色。
//        更科は生成り、田舎は焦茶で、地色そのものがプリセットごとに違う。
//        色は麺の頂点カラーが持つので、プリセットごとに4色を持たせた。
//    (c) 星（甘皮の粒）。0.3mm ほどの黒い点が散っていないと、
//        どれだけ色を合わせても「茶色いうどん」にしか見えない。
//    (d) 透け方。そば粉は小麦より光を通さない。透光を落として、
//        色味も黄からグレー寄りへ振る。
//
//  「箸でつかむ」（CFG.lift / GUI のトグル）を入れると、箸が卓から
//  丼の上へ移り、つまんだ束が垂れる。束は山と同じ芯線 → 掃引の経路に
//  載せて1枚のメッシュに焼くので、太さも色も山のそばと揃う。
//  位置と束ね方は LIFT でまとめて調整できる。
//
//
//  この版での変更（天ぷらを「天ぷらの盛り合わせ」の造形へ差し替え）:
//    ・flatRoll の 180 度反転を修正。水平に寝た芯では必ず a = π になるので、
//      初回に π 周期で折り返さないと断面ごと裏返り、えびの背と腹が
//      入れ替わる。麺の平打ちも同じ関数を通っている。
//    ・えびの寸法を実測寄りに（身 8.50 × 1.26 × 1.08cm、衣 0.115cm）。
//      丼に合わせて個体ごとの倍率 s = 0.84 / 0.80 / 0.74 で使う。
//    ・衣の花を作り直し。粒の 85% は小さな泡で、たまに二つ玉になる。
//      下向きの面（法線の Y が -0.30 未満）と、つゆ面より下には生やさない。
//    ・頭側の衣を閉じた（輪の断面が見えていた所にふたと粒を足す）。
//    ・尾の向きは身のロールから作り、tailDir からは tailBend 以上離さない。
//
//  構成:
//    0. CONFIG     … 麺 / つゆ / 器 のプリセットと寸法（単位 cm）
//    1. Rng        … シード付き擬似乱数
//    2. Noise      … 値ノイズ（2D 周期版 / 3D）
//    3. Utils      … ベクトル / 法線計算 / 溶接 / 一意な name+id
//    4. TexLab     … DynamicTexture 生成の土台
//    5. Bowl       … どんぶりの回転体と粉引のテクスチャ
//    6. Strands    … 麺の芯線生成（層ごとのウォーカー → 位置ベース緩和）★
//    7. Sweep      … 角丸断面の掃引（回転最小フレーム + 水平補正）★
//    8. NoodleTex  … 麺のアルベド / ORM / 法線 / 水膜
//    9. Submerge   … 上から見た最上点バッファを焼く軟ラスタライザ ★
//   10. Broth      … つゆ面（RGB 別 Beer–Lambert / メニスカス / さざ波）★
//   11. Sundry     … 麻クロス / 箸 / 箸置き / 刻みねぎ
//   11b. Tempura   … えび天 / 大葉の天ぷら / 椎茸の飾り切り ★
//   12. Scene      … IBL / 3灯 / 組み立て / ACES / DOF
//   13. GUI
//
//  この絵の肝は3つ。
//
//  (a) 麺の絡み方。手で座標を置くと必ず「編んだ籠」になる。
//      曲率を持続させたウォーカーで層ごとに芯線を撒き、
//      そのあと位置ベースの緩和（重力 + 相互反発 + 長さ拘束 + 内壁）で
//      落ち着かせる。接触点で軽くつぶれ、谷ができ、端がはみ出す。
//
//  (b) つゆは半透明のPBR面。水中の麺は実際のメッシュを描き、
//      水面からの深さに応じたRGB吸収を頂点色に反映する。
//      画面を回しても、水中の麺の立体感と位置関係が保たれる。
//
//  (c) 天ぷらは「揚げ色の幅」と「花」。衣を一色で塗ると、形をどれだけ
//      作り込んでも発泡スチロールになる。花（はじけた薄い衣）が本体から
//      独立して突き出していて、その先が白く飛んでいる——これが揚げ物。
//
//  (d) 麺の照り。ゆでた麺の表面は水の膜で覆われていて、
//      ハイライトは麺1本ごとに稜線に沿って長く走る。
//      平行光1灯ではこれが1点にしか出ないので、
//      拡散をほぼ 0 にした鏡面専用の灯（キック）を必ず1つ足す。
// =====================================================================

var createScene = function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    // 単位系: 1 unit = 1 cm。麺の太さは mm で書きたいので定数を持つ
    const MM = 0.1;

    // ---- 麺のプリセット ---------------------------------------------
    // 断面は角丸の長方形（スーパー楕円 |x/a|^n + |y/b|^n = 1）。
    //   n を上げるほど角が立つ。そばの切り口は 1.5mm 角で、
    //   ゆでても 1割ほどしか膨らまず、角もほとんど落ちない。
    //   うどん（n = 2.65）の丸みをそのまま使うと、ただの細いうどんになる。
    const MEN = {
        nihachi: {
            label: "二八",
            w: 1.65 * MM,         // 断面の幅（切り刃 1.5mm ＋ ゆでた膨らみ）
            h: 1.45 * MM,         // 断面の高さ
            n: 3.40,              // 角の立ち具合。そばは角が落ちない
            len: [20, 28],        // 1本の長さの範囲
            twist: 0.35,          // 長さ方向のねじれ
            flat: 0.60,           // 平らな面を下へ向ける度合い
            wobble: 0.075,        // 長さ方向の太さのゆらぎ
            // 【対策】dens はそのまま層の被覆率になる。うどんの 0.52 を
            // そのまま使うと、太さが 1/3 なので同じ面積に3倍の長さが要り、
            // 芯線の点が 2万点を超えて緩和が 10 秒かかる。
            // そばは実物も隙間が見えるので 0.34 で釣り合う
            dens: 0.21,
            seg: 0.28,            // 芯線のサンプル間隔 [cm]
            div: 8,               // 断面の分割数
            puff: 1.52,           // 接触半径の倍率（＝山の空隙）
            uvLen: 0.62,          // v 方向の 1 周期 [cm]（＝断面の周長）
            hoshi: 0.55,          // 星（甘皮の粒）の量
            sub: 0.62,            // 透光の倍率
            tint: [0.86, 0.78, 0.60],
            col: {
                pale: [0.780, 0.735, 0.640],   // 張った稜線
                base: [0.700, 0.648, 0.548],   // 地色
                deep: [0.520, 0.470, 0.395],   // 谷・接触面（つゆが染みた所）
                cut: [0.745, 0.706, 0.620]     // 切り口（マットで淡い）
            }
        },
        sarashina: {
            label: "更科",
            w: 1.50 * MM, h: 1.30 * MM, n: 3.60,
            len: [21, 29], twist: 0.40, flat: 0.62, wobble: 0.060,
            dens: 0.20, seg: 0.28, div: 8, puff: 1.62, uvLen: 0.56,
            // 一番粉だけで打つので甘皮が入らない。星はほとんど無い
            hoshi: 0.08, sub: 1.00, tint: [0.96, 0.92, 0.80],
            col: {
                pale: [0.930, 0.912, 0.862], base: [0.880, 0.858, 0.800],
                deep: [0.700, 0.672, 0.610], cut: [0.905, 0.890, 0.840]
            }
        },
        inaka: {
            label: "田舎",
            w: 2.20 * MM, h: 1.90 * MM, n: 3.00,
            len: [17, 24], twist: 0.28, flat: 0.66, wobble: 0.090,
            dens: 0.26, seg: 0.30, div: 10, puff: 1.30, uvLen: 0.82,
            // 挽きぐるみ。星が多く、色も落ちる
            hoshi: 1.00, sub: 0.38, tint: [0.72, 0.64, 0.50],
            col: {
                pale: [0.630, 0.580, 0.500], base: [0.545, 0.495, 0.420],
                deep: [0.395, 0.352, 0.300], cut: [0.600, 0.560, 0.490]
            }
        }
    };

    // ---- つゆのプリセット --------------------------------------------
    // sigma は RGB ごとの消散係数 [1/cm]。青がいちばん強く吸われる。
    // deep は「無限に深い所の色」＝ 実質の地色。
    const TSUYU = {
        kansai: {
            label: "関西 (うすくち)",
            deep: [0.435, 0.255, 0.065],
            sigma: [0.40, 0.65, 1.25],
            mottle: 0.055,
            oil: 0.42,
            rough: 0.115
        },
        kanto: {
            label: "関東 (濃口)",
            deep: [0.430, 0.248, 0.082],
            sigma: [1.55, 2.25, 3.60],
            mottle: 0.20,
            oil: 0.55,
            rough: 0.105
        },
        sumashi: {
            label: "すまし (かけだし)",
            deep: [0.720, 0.545, 0.280],
            sigma: [0.48, 0.74, 1.45],
            mottle: 0.12,
            oil: 0.30,
            rough: 0.125
        }
    };

    // ---- 器のプリセット（sRGB）----------------------------------------
    // 【注意】「黒い縁」だからと sRGB 0.05 を入れるとリニアで 0.002 になり
    // 実質まっ黒になる。実物の鉄釉の反射率は 5% 前後 = sRGB 0.24 付近。
    const UTSUWA = {
        kohiki: {
            label: "粉引（鉄縁）",
            body: [0.898, 0.876, 0.812],   // 胎土の効いた乳白
            bodyDeep: [0.826, 0.793, 0.707],
            rim: [0.262, 0.228, 0.212],    // 縁の鉄釉
            rimWarm: [0.345, 0.268, 0.205],
            speck: 0.14,                   // 鉄粉の量
            rough: 0.455
        },
        ameyu: {
            label: "飴釉",
            body: [0.430, 0.268, 0.135], bodyDeep: [0.330, 0.192, 0.092],
            rim: [0.290, 0.212, 0.160], rimWarm: [0.395, 0.288, 0.190],
            speck: 0.35, rough: 0.235
        },
        sometsuke: {
            label: "染付",
            body: [0.858, 0.862, 0.835], bodyDeep: [0.775, 0.788, 0.782],
            rim: [0.255, 0.300, 0.420], rimWarm: [0.300, 0.360, 0.500],
            speck: 0.10, rough: 0.165
        }
    };

    // ---- 天ぷらと具の色（sRGB, 参考写真の実測）--------------------------
    // 【対策】衣を一色で塗ると、どれだけ形を作り込んでも発泡スチロールに
    // なる。実物の衣は「花（はじけた薄い衣）の先が白く、谷が濃い」という
    // 揚げ色の幅そのものが質感なので、必ず高さと色を相関させる。
    const KOROMO_PALE = [1.000, 0.913, 0.660];   // 花の先。ほとんど白い
    const KOROMO_BASE = [0.995, 0.805, 0.415];
    const KOROMO_DEEP = [0.925, 0.700, 0.335];   // 衣の谷
    const KOROMO_BURN = [0.790, 0.480, 0.160];   // 縁の焦げぎわ

    // ---- えび（衣の中身）------------------------------------------------
    // 【流用】「えびの握り」のサンプルから、節の入り方・尾扇・身の色を持って
    // きた。握りのえびは背を開いて平たく伏せてあるが、天ぷらは開かずに
    // まっすぐ伸ばすので、断面は平たいかまぼこ形ではなく丸に寄せる。
    const EBI = {
        len: 8.50,          // 身の長さ（尾を除く）
        wid: 1.26,          // いちばん太い所の幅
        hgt: 1.08,          // 同じく高さ

        widHead: 0.90, widMid: 1.00, widTail: 0.34,
        hgtHead: 0.80, hgtMid: 1.00, hgtTail: 0.40,
        pUp: 2.05,          // 背側の断面の超だ円指数（丸い）
        pDn: 2.25,          // 腹側は少し平ら（衣の中で座る）
        bellyRatio: 0.44,

        segs: 6,            // 節の数
        segGroove: 0.070,   // 節の溝の深さ（半径に対する比）
        segWidth: 0.16,     // 溝の幅
        segCurve: 0.070,    // 境目の反り（「へ」の字）
        segBulge: 0.030,    // 節ごとのふくらみ
        wob: 0.012,

        segU: 100, segA: 56, // 分割（長さ / 断面）

        fanLen: 1.52, fanWid: 0.48, fanTh: 0.025, fanCurl: 0.16,
        tailSeg: 0.56,      // 尾の手前の節

        koromo: 0.115,       // 衣の厚み cm
        hemHead: -0.12,    // 衣の裾（頭側）。負なので端まで包む
        hemTail: 0.91      // 衣の裾（尾側）。ここから先は素の身と尾が出る
    };

    // えびの身の色。握りのサンプルの「車海老」をそのまま使う
    const EBI_COL = {
        flesh: [0.962, 0.930, 0.882],   // 身の白い所
        pale: [0.980, 0.868, 0.790],
        band: [0.985, 0.400, 0.130],   // 節の縁の橙
        deep: [0.878, 0.302, 0.148],   // 背の濃い赤
        speck: [0.950, 0.450, 0.200],
        tail: [0.700, 0.255, 0.065],
        tailPale: [1.000, 0.700, 0.310],
        bandAmt: 1.00, edgeAmt: 0.92, speckAmt: 0.85,
        rough: 0.28, coat: 0.55, coatRough: 0.16,
        translucency: 0.34, tint: [0.95, 0.62, 0.50]
    };

    // 大葉。裏は白っぽく、葉脈で色が抜ける
    const SHISO_TOP = [0.333, 0.494, 0.145];
    const SHISO_VEIN = [0.502, 0.612, 0.310];
    const SHISO_BACK = [0.545, 0.647, 0.392];

    // 椎茸。傘は濃い茶、飾り切りの断面だけが明るい
    const SHIITAKE_CAP = [0.294, 0.176, 0.106];
    const SHIITAKE_EDGE = [0.478, 0.325, 0.212];
    const SHIITAKE_CUT = [0.882, 0.824, 0.678];
    const SHIITAKE_GILL = [0.784, 0.706, 0.573];

    // ---- 器の寸法（cm）------------------------------------------------
    // 口径 15.2cm / 高さ 8.0cm の中どんぶり。
    const BOWL = {
        rimOuter: 7.60,     // 口縁の外半径
        rimInner: 7.02,     // 口縁の内半径
        height: 8.00,     // 高台底から口縁まで
        footR: 3.25,     // 高台の外半径
        footH: 0.90,     // 高台の高さ
        innerFloorY: 1.72,     // 内底の高さ
        innerFloorR: 3.30,     // 内底の平らな部分の半径
        rimBandH: 0.24      // 鉄釉の縁の幅（見込み側）
    };

    // つゆの水位と、麺の山の上端
    const BROTH_Y = 6.22;
    const MOUND_TOP = 7.02;
    const MOUND_BOT = 4.15;     // これより下の麺は作らない（つゆ面に隠れる）

    // ---- シーン全体の設定 ---------------------------------------------
    const CFG = {
        men: "nihachi",
        tsuyu: "kanto",      // 天ぷらそばは濃口のかけつゆが定番
        utsuwa: "sometsuke",
        amount: 0.88,      // そばの量の倍率
        turbidity: 1.0,      // つゆの濃さ（σ の倍率）
        negi: true,     // 刻みねぎ
        ebi: 2,        // えび天の本数（0〜3）
        shiso: true,     // 大葉の天ぷら
        shiitake: true,     // 椎茸（飾り切り）
        steam: false,     // 湯気
        chopsticks: true,
        lift: true,      // 箸でそばをつかむ
        cloth: true,
        seed: 20260915,
        guiOwnCamera: false,     // 既定は false（Inspector を壊さないため）
        texSize: 1024,      // テクスチャ解像度の基準（実際は 0.75 倍で焼く）
        relaxSteps: 120,       // 緩和のステップ数
        ssao: true,
        dof: true,
        // 【対策】Babylon の錯乱円は焦点距離を合焦距離の一定比で置くと
        // coc ∝ 1/合焦距離 になる。望遠に振って距離を伸ばしたぶん、
        // 同じボケ量を保つには比を上げる必要がある
        dofRatio: 0.038,
        dofFStop: 5.6
    };

    // =================================================================
    // 1. Rng : mulberry32
    // =================================================================
    // 「盛り直す」はシードを進めるだけ。個体ごとの分岐は seed + i*素数。
    class Rng {
        constructor(seed) { this.s = (seed >>> 0) || 1; }
        next() {
            this.s = (this.s + 0x6D2B79F5) >>> 0;
            let t = this.s;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
        range(a, b) { return a + (b - a) * this.next(); }
        pm(a) { return (this.next() * 2 - 1) * a; }
        int(n) { return Math.floor(this.next() * n) % n; }
        pick(arr) { return arr[this.int(arr.length)]; }
    }

    // =================================================================
    // 2. Noise : 値ノイズ（2D 周期版 / 3D）
    // =================================================================
    // 【注意】テクスチャを焼くノイズは x 方向だけ折り返しても駄目で、
    // 上下の継ぎ目に横一文字の線が出る。wrap は必ず両軸に掛ける。
    class Noise {
        constructor(seed) {
            const r = new Rng(seed);
            this.p = new Uint8Array(512);
            const perm = new Uint8Array(256);
            for (let i = 0; i < 256; i++) perm[i] = i;
            for (let i = 255; i > 0; i--) {
                const j = r.int(i + 1);
                const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
            }
            for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
        }
        static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
        static lerp(a, b, t) { return a + (b - a) * t; }

        // 格子点の擬似乱数値 [0,1)
        hash2(xi, yi) {
            return this.p[(this.p[xi & 255] + (yi & 255)) & 511] / 255;
        }
        hash3(xi, yi, zi) {
            const a = this.p[(this.p[(this.p[xi & 255] + (yi & 255)) & 511] + (zi & 255)) & 511];
            return a / 255;
        }
        // 2D 値ノイズ。px/py に周期を渡すとタイル化する
        n2(x, y, px, py) {
            let x0 = Math.floor(x), y0 = Math.floor(y);
            const fx = Noise.fade(x - x0), fy = Noise.fade(y - y0);
            const w = (v, p) => (p ? ((v % p) + p) % p : v);
            const x1 = w(x0 + 1, px), y1 = w(y0 + 1, py);
            x0 = w(x0, px); y0 = w(y0, py);
            const a = this.hash2(x0, y0), b = this.hash2(x1, y0);
            const c = this.hash2(x0, y1), d = this.hash2(x1, y1);
            return Noise.lerp(Noise.lerp(a, b, fx), Noise.lerp(c, d, fx), fy);
        }
        n3(x, y, z) {
            const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
            const fx = Noise.fade(x - x0), fy = Noise.fade(y - y0), fz = Noise.fade(z - z0);
            const c000 = this.hash3(x0, y0, z0), c100 = this.hash3(x0 + 1, y0, z0);
            const c010 = this.hash3(x0, y0 + 1, z0), c110 = this.hash3(x0 + 1, y0 + 1, z0);
            const c001 = this.hash3(x0, y0, z0 + 1), c101 = this.hash3(x0 + 1, y0, z0 + 1);
            const c011 = this.hash3(x0, y0 + 1, z0 + 1), c111 = this.hash3(x0 + 1, y0 + 1, z0 + 1);
            const a = Noise.lerp(Noise.lerp(c000, c100, fx), Noise.lerp(c010, c110, fx), fy);
            const b = Noise.lerp(Noise.lerp(c001, c101, fx), Noise.lerp(c011, c111, fx), fy);
            return Noise.lerp(a, b, fz);
        }
        // 多帯域。写実性の大半はここで決まる（単一周波数は必ず「ごつごつ球」になる）
        fbm2(x, y, oct, px, py) {
            let s = 0, a = 0.5, f = 1;
            for (let i = 0; i < oct; i++) {
                s += a * this.n2(x * f, y * f, px ? px * f : 0, py ? py * f : 0);
                a *= 0.5; f *= 2;
            }
            return s / (1 - Math.pow(0.5, oct));
        }
        fbm3(x, y, z, oct) {
            let s = 0, a = 0.5, f = 1;
            for (let i = 0; i < oct; i++) { s += a * this.n3(x * f, y * f, z * f); a *= 0.5; f *= 2; }
            return s / (1 - Math.pow(0.5, oct));
        }
    }

    // =================================================================
    // 3. Utils : ベクトル / メッシュ
    // =================================================================
    // 【方針】芯線の生成と掃引は BABYLON の型を一切使わず、素の配列で回す。
    // 数万点の緩和ループで Vector3 を作り捨てると GC で確実に詰まるのと、
    // ヘッドレスで単体テストしたいのが理由。
    const TAU = Math.PI * 2;
    const V3 = BABYLON.Vector3;
    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    const smoothstep = (e0, e1, x) => {
        const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t);
    };
    const mix = (a, b, t) => a + (b - a) * t;
    const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const l2s = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    // sRGB の3要素配列 → リニア（頂点カラーはリニア解釈なので必ず通す）
    const lin3 = (c) => [s2l(c[0]), s2l(c[1]), s2l(c[2])];

    // --- 素の配列によるベクトル演算（[x,y,z]）--------------------------
    const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const vcross = (a, b) => [
        a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
    ];
    const vlen = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    const vnorm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

    // --- 一意な name + id ----------------------------------------------
    // 【対策】Babylon の Node は id に name をそのまま入れるだけなので、
    // 同名メッシュが並ぶと Inspector が常に先頭だけをハイライトする。
    let __uid = 0;
    const named = (mesh, base) => {
        const nm = base + "_" + (__uid++);
        mesh.name = nm; mesh.id = nm;
        return mesh;
    };

    // --- 法線計算 -------------------------------------------------------
    // 【注意】BABYLON.VertexData.ComputeNormals は (v0-v1)x(v2-v1) を使う。
    // 右手系の外積とは符号が逆なので、自前で計算するときは必ず合わせる。
    function computeNormals(pos, idx, out) {
        const n = out || new Float32Array(pos.length);
        n.fill(0);
        for (let i = 0; i < idx.length; i += 3) {
            const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
            const e1x = pos[a] - pos[b], e1y = pos[a + 1] - pos[b + 1], e1z = pos[a + 2] - pos[b + 2];
            const e2x = pos[c] - pos[b], e2y = pos[c + 1] - pos[b + 1], e2z = pos[c + 2] - pos[b + 2];
            const nx = e1y * e2z - e1z * e2y;
            const ny = e1z * e2x - e1x * e2z;
            const nz = e1x * e2y - e1y * e2x;
            n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
            n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
            n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
        }
        for (let i = 0; i < n.length; i += 3) {
            const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
            n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
        }
        return n;
    }

    // --- 継ぎ目の法線を溶接する ------------------------------------------
    // 回転体は始端と終端で頂点が重複する。そのまま ComputeNormals すると
    // 継ぎ目に縦線が出る。位置が一致する頂点の法線を平均して消す。
    function weldNormals(pos, nrm, eps) {
        const k = eps || 8192;
        const map = new Map();
        for (let i = 0; i < pos.length; i += 3) {
            const key = Math.round(pos[i] * k) + "_" + Math.round(pos[i + 1] * k) + "_" + Math.round(pos[i + 2] * k);
            let a = map.get(key);
            if (!a) { a = []; map.set(key, a); }
            a.push(i);
        }
        map.forEach((list) => {
            if (list.length < 2) return;
            let x = 0, y = 0, z = 0;
            for (const i of list) { x += nrm[i]; y += nrm[i + 1]; z += nrm[i + 2]; }
            const l = Math.hypot(x, y, z) || 1;
            x /= l; y /= l; z /= l;
            for (const i of list) { nrm[i] = x; nrm[i + 1] = y; nrm[i + 2] = z; }
        });
        return nrm;
    }

    // --- 巻き順の判定 -----------------------------------------------------
    // 【対策】規約を決め打ちすると片方の部品で裏返る。法線と「基準点 → 頂点」
    // の内積の総和で外向きかを判定し、負なら三角形の向きを全反転する。
    // 代表点1個の判定は、その点の法線が基準方向と直交していると符号が
    // 不安定になるので使わない。
    function orientOutward(pos, idx, nrm, cx, cy, cz) {
        let s = 0;
        for (let i = 0; i < pos.length; i += 3) {
            s += (pos[i] - cx) * nrm[i] + (pos[i + 1] - cy) * nrm[i + 1] + (pos[i + 2] - cz) * nrm[i + 2];
        }
        if (s >= 0) return false;
        for (let i = 0; i < idx.length; i += 3) {
            const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t;
        }
        for (let i = 0; i < nrm.length; i++) nrm[i] = -nrm[i];
        return true;
    }

    // --- VertexData → Mesh ------------------------------------------------
    function toMesh(name, g, scene) {
        const m = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = g.positions;
        vd.indices = g.indices;
        vd.normals = g.normals;
        if (g.uvs) vd.uvs = g.uvs;
        if (g.colors) vd.colors = g.colors;
        vd.applyToMesh(m, false);
        // 【対策】頂点カラーを stride 4 で入れると Babylon が hasVertexAlpha を
        // 立て、不透明なのに透過パスへ回る。透過パスは深度書き込みが切られる
        // ので、麺どうしの前後関係が壊れ SSAO からも外れる。必ず落とす。
        m.hasVertexAlpha = false;
        named(m, name);
        return m;
    }

    // --- 幾何の入れ物 --------------------------------------------------------
    class Geo {
        constructor() {
            this.pos = []; this.idx = []; this.uv = []; this.col = [];
        }
        vert(p, u, v, c) {
            const i = this.pos.length / 3;
            this.pos.push(p[0], p[1], p[2]);
            this.uv.push(u, v);
            this.col.push(c[0], c[1], c[2], 1);
            return i;
        }
        quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
        tri(a, b, c) { this.idx.push(a, b, c); }
        finish(ref) {
            const pos = new Float32Array(this.pos);
            const idx = (pos.length / 3 > 65535) ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
            const nrm = computeNormals(pos, idx);
            if (ref) orientOutward(pos, idx, nrm, ref[0], ref[1], ref[2]);
            return {
                positions: pos, indices: idx, normals: nrm,
                uvs: new Float32Array(this.uv), colors: new Float32Array(this.col)
            };
        }
    }

    // =================================================================
    // 4. TexLab : DynamicTexture 生成の土台
    // =================================================================
    // 【対策】アルベド / ORM / 法線を別々のノイズで作ると、粒の位置がずれて
    // 「ざらざらの上にぼんやりした汚れが乗った」ように見える。高さ場を
    // Float32Array で1枚だけ作り、3枚ともそれを参照する。
    const TexLab = {
        // size は必ず整数へ畳む。createImageData は long しか受け取らず、
        // 設定の消し忘れで undefined が来ると即座に落ちる。
        make(name, size, scene, fill, opts) {
            const S = Math.max(8, Math.round(size) || 512);
            const o = opts || {};
            const t = new BABYLON.DynamicTexture(name, { width: S, height: S }, scene, true,
                BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
            // 【対策】DynamicTexture の第7引数は invertY であって「線形かどうか」
            // ではない。ここに linear を渡すと ORM と法線が上下反転する。
            // 線形として読ませたいときは gammaSpace を落とすのが正しい
            // （既定の true のままだと粗さ 0.30 が線形 0.07 として渡り、
            //   狙いよりつやつやになる）。
            if (o.linear) t.gammaSpace = false;
            const ctx = t.getContext();
            const img = ctx.createImageData(S, S);
            fill(img.data, S);
            ctx.putImageData(img, 0, 0);
            t.update(false);
            t.name = name; t.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
            t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
            t.anisotropicFilteringLevel = 16;
            if (o.clampV) t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
            if (o.clampU) t.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
            if (o.uScale) t.uScale = o.uScale;
            if (o.vScale) t.vScale = o.vScale;
            return t;
        },

        // 高さ場 → 法線マップ（接空間）。strength は cm 単位の起伏に対する倍率
        normalFromHeight(name, size, scene, H, strength, opts) {
            const S = Math.max(8, Math.round(size) || 512);
            const st = (strength === undefined) ? 1.0 : strength;
            return TexLab.make(name, S, scene, (d) => {
                for (let y = 0; y < S; y++) {
                    const ym = ((y - 1) + S) % S, yp = (y + 1) % S;
                    for (let x = 0; x < S; x++) {
                        const xm = ((x - 1) + S) % S, xp = (x + 1) % S;
                        const dx = (H[y * S + xp] - H[y * S + xm]) * st * S * 0.5;
                        const dy = (H[yp * S + x] - H[ym * S + x]) * st * S * 0.5;
                        let nx = -dx, ny = -dy, nz = 1;
                        const l = Math.hypot(nx, ny, nz);
                        nx /= l; ny /= l; nz /= l;
                        const i = (y * S + x) * 4;
                        d[i] = (nx * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, Object.assign({ linear: true }, opts || {}));
        },

        // ORM: R=AO G=Roughness B=Metallic（Babylon の useRoughnessFromMetallicTextureGreen）
        orm(name, size, scene, fn, opts) {
            const S = Math.max(8, Math.round(size) || 512);
            return TexLab.make(name, S, scene, (d) => {
                const o = [0, 0, 0];
                for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
                    fn(x, y, S, o);
                    const i = (y * S + x) * 4;
                    d[i] = clamp(o[0], 0, 1) * 255;
                    d[i + 1] = clamp(o[1], 0, 1) * 255;
                    d[i + 2] = clamp(o[2], 0, 1) * 255;
                    d[i + 3] = 255;
                }
            }, Object.assign({ linear: true }, opts || {}));
        }
    };

    // アルベドの書き込み用。テクスチャは頂点カラーへの「変調」として使うので
    // 1.0 を超えない（ここで明るく振ると暗くした頂点カラーが白茶けて戻る）。
    function putRGB(d, i, r, g, b) {
        d[i] = clamp(r, 0, 1) * 255;
        d[i + 1] = clamp(g, 0, 1) * 255;
        d[i + 2] = clamp(b, 0, 1) * 255;
        d[i + 3] = 255;
    }

    // =================================================================
    // 5. Bowl : どんぶりの回転体（高台つき・口縁は鉄釉）
    // =================================================================
    // 【対策】器の断面を y = a*r^k のような冪関数1本で作ると、必ず円錐へ
    // 寄って「木のサラダボウル」になる。参考写真の丼は
    //   (a) 内底が平ら（径 6cm ほど）
    //   (b) 腰から上は一定の勾配でまっすぐ立ち上がる
    //   (c) 口縁で少しだけ外へ開く
    // という3区間でできている。制御点で直接与え、外側は等厚オフセットで作る。
    //
    // 内側の制御点（r, y）。u = r/rimInner に対する f = u^2.1 を下敷きに、
    // 底だけ平らへ寄せて手で均した値。
    const IN_R = [0.00, 0.70, 1.40, 2.11, 2.81, 3.51, 4.21, 4.91, 5.62, 6.18, 6.60, 7.02];
    const IN_Y = [1.72, 1.75, 1.90, 2.20, 2.63, 3.18, 3.89, 4.76, 5.80, 6.62, 7.24, 8.00];

    // 肉厚。口縁は薄く、腰から下で厚くなる（重心を落とすための実物の作り）
    // 【対策】口縁の肉厚をここに数値で書くと BOWL.rimOuter / rimInner と
    // ずれ、口縁の半円と壁の間に段差が出る。必ず器の寸法から導く
    const WALL_THIN = BOWL.rimOuter - BOWL.rimInner;   // 口縁の肉厚
    const WALL_THICK = 0.30;     // 腰から下で足す分
    const WALL_KNEE = 3.40;      // ここから下で厚みが増しはじめる高さ
    const WALL_SPAN = 1.60;
    const Y_UNDER = 1.02;        // 底裏の中心（内底 1.72 との差が底の厚み）

    // --- 単調3次エルミート（Fritsch–Carlson）-----------------------------
    // 【対策】Catmull-Rom は制御点の間で行き過ぎる。器の断面では
    // 「腰が一度外へ膨らんでから戻る」不自然な段になって出る。
    // 単調性が保証される補間なら、制御点を素直に並べるだけで済む。
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

    // 内外の曲線を1度だけ作って使い回す
    let _curves = null;
    function bowlCurves() {
        if (_curves) return _curves;
        const f = monoSpline(IN_R, IN_Y);
        const NI = 220;
        const inR = new Float64Array(NI + 1), inY = new Float64Array(NI + 1);
        for (let i = 0; i <= NI; i++) { inR[i] = BOWL.rimInner * i / NI; inY[i] = f(inR[i]); }
        const outR = new Float64Array(NI + 1), outY = new Float64Array(NI + 1);
        for (let i = 0; i <= NI; i++) {
            const a = Math.max(0, i - 1), b = Math.min(NI, i + 1);
            const dy = (inY[b] - inY[a]) / Math.max(1e-9, inR[b] - inR[a]);
            const L = Math.hypot(1, dy);
            const t = WALL_THIN + WALL_THICK * Math.pow(clamp((WALL_KNEE - inY[i]) / WALL_SPAN, 0, 1), 1.7);
            // 口縁の近くだけ法線を水平へ寝かせる。こうしないと口縁の丸み（半円）と
            // 外壁の出口がずれて、縁に段がつく
            const w = smoothstep(BOWL.height - 0.75, BOWL.height - 0.05, inY[i]);
            const nr = (dy / L) * (1 - w) + w, ny = (-1 / L) * (1 - w);
            outR[i] = inR[i] + t * nr; outY[i] = inY[i] + t * ny;
        }
        let iStop = 0;
        while (iStop < NI && outR[iStop] < BOWL.footR) iStop++;
        _curves = { inR: inR, inY: inY, outR: outR, outY: outY, NI: NI, iStop: iStop };
        return _curves;
    }

    // 高さ y での見込みの内半径。つゆ面の半径とメニスカスに使う
    function innerRAt(y) {
        const W = bowlCurves(), NI = W.NI;
        if (y <= W.inY[0]) return 0;
        if (y >= W.inY[NI]) return BOWL.rimInner;
        let lo = 0, hi = NI;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (W.inY[m] <= y) lo = m; else hi = m; }
        const d = W.inY[hi] - W.inY[lo];
        return W.inR[lo] + (W.inR[hi] - W.inR[lo]) * (d > 1e-12 ? (y - W.inY[lo]) / d : 0);
    }

    // 半径 r での見込みの高さ。つゆの「底までの深さ」を焼くのに要る
    function innerYAt(r) {
        const W = bowlCurves(), NI = W.NI;
        const rr = clamp(r, 0, BOWL.rimInner);
        const t = rr / BOWL.rimInner * NI;
        const i = Math.min(NI - 1, Math.floor(t));
        return mix(W.inY[i], W.inY[i + 1], t - i);
    }

    // 断面。見込みの中心から外へ一筆で回り、底裏で中心へ戻る閉じた形。
    // 【対策】見込み・外壁・底裏を別メッシュにすると、半径の式が食い違って
    // 継ぎ目に隙間が開くうえ、巻き順の判定が部品ごとに独立して片方だけ裏返る。
    // 1本の閉じたループにして掃引すれば、どちらも原理的に起きない。
    function bowlProfile() {
        const W = bowlCurves(), NI = W.NI;
        const P = [];
        const push = (r, y, k) => P.push({ r: r, y: y, k: k });
        // (1) 見込み: 中心 → 口縁の内側。innerRAt と同じ表を刻むので、
        //     つゆ面の半径とここの断面は厳密に一致する
        for (let i = 0; i <= NI; i += 4) push(W.inR[i], W.inY[i], 0);
        // (2) 口縁の丸み（半円）
        const cx = (BOWL.rimInner + BOWL.rimOuter) * 0.5, rr = (BOWL.rimOuter - BOWL.rimInner) * 0.5;
        const rimIndex = P.length + 4;
        for (let i = 1; i <= 10; i++) {
            const a = Math.PI * (1 - i / 10);
            push(cx + rr * Math.cos(a), BOWL.height + rr * Math.sin(a), 1);
        }
        // (3) 外壁: 口縁の外 → 高台の付け根
        const outStart = P.length;
        for (let i = NI - 4; i >= W.iStop; i -= 4) push(W.outR[i], W.outY[i], 2);
        const probeIndex = outStart + 6;        // 外壁の上のほう。巻き順の判定用
        const yK = W.outY[W.iStop];
        // (4) 高台。挽き出した段を経て接地面へ
        const fin = BOWL.footR - 0.62;          // 高台の内半径
        push(BOWL.footR, yK - 0.05, 2);
        push(BOWL.footR - 0.010, yK * 0.62, 2);
        push(BOWL.footR - 0.030, 0.30, 2);
        push(BOWL.footR - 0.070, 0.055, 3);
        push(BOWL.footR - 0.160, 0.0, 3);
        push(fin + 0.070, 0.0, 3);
        push(fin, 0.060, 3);
        push(fin, 0.42, 3);
        push(fin, Y_UNDER - 0.12, 3);
        // (5) 底裏。中心へ向けてわずかに持ち上がる（浅い凹み）
        for (let i = 1; i <= 16; i++) {
            const u = 1 - i / 16;
            push(fin * u, Y_UNDER - 0.12 * Math.pow(u, 1.7), 3);
        }
        return { P: P, rimIndex: rimIndex, probeIndex: probeIndex };
    }

    // 断面の弧長を正規化した表。テクスチャを焼くのに v → (r, y) が要る。
    // 【対策】制御点の添字で v を刻むと、点が密な所（口縁）だけテクスチャが
    // 詰まって縞に見える。弧長で正規化する。
    let _ptab = null;
    function profileTable() {
        if (_ptab) return _ptab;
        const { P, rimIndex } = bowlProfile();
        const N = P.length;
        const arc = new Float32Array(N);
        for (let i = 1; i < N; i++) {
            arc[i] = arc[i - 1] + Math.hypot(P[i].r - P[i - 1].r, P[i].y - P[i - 1].y);
        }
        const total = arc[N - 1] || 1;
        for (let i = 0; i < N; i++) arc[i] /= total;
        _ptab = { P: P, arc: arc, vRim: arc[rimIndex], total: total };
        return _ptab;
    }

    function profileAt(v) {
        const tab = profileTable(), arc = tab.arc, P = tab.P, N = P.length;
        const vv = clamp(v, 0, 1);
        let lo = 0, hi = N - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arc[m] <= vv) lo = m; else hi = m; }
        const span = arc[hi] - arc[lo];
        const t = span > 1e-9 ? (vv - arc[lo]) / span : 0;
        return { r: mix(P[lo].r, P[hi].r, t), y: mix(P[lo].y, P[hi].y, t), k: P[lo].k };
    }

    function buildBowl(scene, mat, rng) {
        const { P, rimIndex, probeIndex } = bowlProfile();
        const N = P.length, M = 176;
        const arc = new Float32Array(N);
        for (let i = 1; i < N; i++) {
            arc[i] = arc[i - 1] + Math.hypot(P[i].r - P[i - 1].r, P[i].y - P[i - 1].y);
        }
        const total = arc[N - 1] || 1;

        // 【対策】完全な真円だと口縁のハイライトが定規で引いた線になり、
        // 量産プラスチックに見える。内外の同じ高さをいっしょに動かすことで、
        // 肉厚を保ったまま口が波打つ（手びねりの器はこれが必ずある）
        const ph = [rng.range(0, 9), rng.range(0, 9), rng.range(0, 9), rng.range(0, 9)];
        const nV = N * (M + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array((N - 1) * M * 6);

        let vo = 0;
        for (let i = 0; i < N; i++) {
            const p = P[i];
            const mask = smoothstep(4.0, 7.9, p.y);        // 口縁だけ上下に振る
            for (let j = 0; j <= M; j++) {
                const th = (j % M) / M * TAU;
                const wob = 1 + 0.0044 * Math.sin(3 * th + ph[0]) + 0.0027 * Math.sin(5 * th + ph[1]);
                const dy = mask * (0.030 * Math.sin(2 * th + ph[2]) + 0.016 * Math.sin(3 * th + ph[3]));
                const r = p.r * wob;
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = r * Math.cos(th);
                positions[p3 + 1] = p.y + dy;
                positions[p3 + 2] = r * Math.sin(th);
                uvs[p2] = j / M;
                uvs[p2 + 1] = arc[i] / total;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < N - 1; i++) {
            for (let j = 0; j < M; j++) {
                const a = i * (M + 1) + j, b = a + 1, c = a + (M + 1), d = c + 1;
                indices[io++] = a; indices[io++] = c; indices[io++] = b;
                indices[io++] = b; indices[io++] = c; indices[io++] = d;
            }
        }
        const normals = computeNormals(positions, indices);
        orientOutward(positions, indices, normals, 0, P[probeIndex].y, 0);
        weldNormals(positions, normals);

        const mesh = new BABYLON.Mesh("bowl", scene);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals; vd.uvs = uvs;
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        named(mesh, "bowl");
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.tris = (N - 1) * M * 2;
        mesh.vRim = arc[rimIndex] / total;
        return mesh;
    }

    // =================================================================
    // 5b. 器のテクスチャ（粉引 / 鉄釉の口縁 / 土見せの高台）
    // =================================================================
    // 【対策】釉の斑や鉄粉を UV の 2D ノイズで描くと、回転体では
    // 「筒に巻いた包装紙」になり、u=0 の継ぎ目に必ず縦線が出る。
    // テクセルごとに断面表から 3D 位置を復元し、ワールド空間で場を評価する。
    // 位置が一致するので継ぎ目は原理的に発生しない。
    //
    // 参考写真の器は粉引。白化粧土を掛けた上に透明釉で、
    //   ・地は乳白だが、下の胎土が透けて黄土色の斑になる
    //   ・鉄粉が 0.5〜1.5mm の点で散る（これが「粉引らしさ」の8割）
    //   ・口縁だけ鉄釉が掛かって黒褐色の帯になる（口錆）
    //   ・高台は土見せ（無釉）でざらつき、まったく光らない
    function bowlTextures(scene, up, seed) {
        const N = Math.max(128, Math.round(CFG.texSize * 0.75) || 768), n2 = N * N;
        const nz = new Noise(seed);
        const rng = new Rng(seed ^ 0x51AE);

        // 行ごとに断面位置を引く（テクセルごとに二分探索すると重い）
        const rowR = new Float32Array(N), rowY = new Float32Array(N), rowK = new Uint8Array(N);
        for (let y = 0; y < N; y++) {
            const s = profileAt((y + 0.5) / N);
            rowR[y] = s.r; rowY[y] = s.y; rowK[y] = s.k;
        }
        const cosT = new Float32Array(N), sinT = new Float32Array(N);
        for (let x = 0; x < N; x++) {
            const th = (x + 0.5) / N * TAU;
            cosT[x] = Math.cos(th); sinT[x] = Math.sin(th);
        }

        // --- 低周波の場は粗い格子で作って引き伸ばす ---------------------
        // 【対策】768² で 3 オクターブの 3D ノイズを素直に回すと、
        // これだけで1秒を超える。斑の周期は cm 単位なので 1/4 の格子で
        // 作って双一次で伸ばしても見た目は変わらない。
        // wrapX = true なら最終列は 0 列目へ折り返すので継ぎ目も出ない。
        function coarse(step, fn) {
            const C = Math.ceil(N / step) + 1;
            const small = new Float32Array(C * C);
            for (let j = 0; j < C; j++) {
                const sy = Math.min(N - 1, j * step);
                for (let i = 0; i < C; i++) {
                    const sx = (i * step) % N;
                    small[j * C + i] = fn(sx, sy);
                }
            }
            const out = new Float32Array(n2);
            for (let y = 0; y < N; y++) {
                const fy = y / step, jy = Math.min(C - 2, Math.floor(fy)), ty = fy - jy;
                const r0 = jy * C, r1 = (jy + 1) * C;
                for (let x = 0; x < N; x++) {
                    const fx = x / step, ix = Math.min(C - 2, Math.floor(fx)), tx = fx - ix;
                    const t0 = mix(small[r0 + ix], small[r0 + ix + 1], tx);
                    const t1 = mix(small[r1 + ix], small[r1 + ix + 1], tx);
                    out[y * N + x] = mix(t0, t1, ty);
                }
            }
            return out;
        }

        // 化粧土の厚み斑。刷毛の流れ（鉛直に長い）+ 大きな溜まり
        const slip = coarse(4, (x, y) => {
            const r = rowR[y], wx = r * cosT[x], wy = rowY[y], wz = r * sinT[x];
            const flow = nz.fbm3(wx * 1.05 + 5, wy * 0.42 + 2, wz * 1.05 + 9, 3) - 0.5;
            const pool = nz.fbm3(wx * 0.36 + 21, wy * 0.30 + 13, wz * 0.36 + 3, 2) - 0.5;
            return clamp(0.5 + flow * 0.95 + pool * 0.80, 0, 1);
        });
        // 釉の溜まり（凹んだ所ほど厚く、青みが出て粗さが下がる）
        const pool = coarse(6, (x, y) => {
            const r = rowR[y], wx = r * cosT[x], wy = rowY[y], wz = r * sinT[x];
            return nz.fbm3(wx * 0.55 + 41, wy * 0.48 + 31, wz * 0.55 + 17, 2);
        });

        // --- 鉄粉 ---------------------------------------------------------
        // 【対策】閾値を切ったノイズで点を作ると、粒の大きさが全部同じになり
        // 「散らした胡椒」に見える。ワールド空間の格子1つにつき点を1個置き、
        // 格子ごとに半径と濃さを配る。粒の大小差がそのまま粉引の顔になる。
        const CELL = 0.42;                      // 格子の間隔 [cm]
        const RMAX = 0.070;                     // いちばん大きい粒の半径 [cm]
        function speckAt(wx, wy, wz) {
            // 【対策】3×3×3 の格子を素直に舐めると、768² のテクスチャで
            // 1600 万回の格子評価になり、これだけで数秒かかる。
            // 半径 RMAX の球が触れうる格子だけに絞れば、たいてい 1 個で済む。
            const x0 = Math.floor((wx - RMAX) / CELL), x1 = Math.floor((wx + RMAX) / CELL);
            const y0 = Math.floor((wy - RMAX) / CELL), y1 = Math.floor((wy + RMAX) / CELL);
            const z0 = Math.floor((wz - RMAX) / CELL), z1 = Math.floor((wz + RMAX) / CELL);
            let best = 0;
            for (let cz = z0; cz <= z1; cz++) {
                for (let cy = y0; cy <= y1; cy++) {
                    for (let cx = x0; cx <= x1; cx++) {
                        const h0 = nz.hash3(cx * 3 + 1, cy * 7 + 2, cz * 5 + 3);
                        if (h0 > 0.52) continue;                       // 半分ほどの格子は空
                        const h1 = nz.hash3(cx * 11 + 5, cy * 13 + 7, cz * 17 + 11);
                        const h2 = nz.hash3(cx * 19 + 13, cy * 23 + 3, cz * 29 + 7);
                        const h3 = nz.hash3(cx * 31 + 17, cy * 37 + 19, cz * 41 + 23);
                        const px = (cx + h1) * CELL, py = (cy + h2) * CELL, pz = (cz + h3) * CELL;
                        const d = Math.hypot(wx - px, wy - py, wz - pz);
                        // 粒径 0.25〜1.4mm。小さい粒ほど数が多くなるよう h0 を二乗で効かせる
                        const rad = 0.012 + (RMAX - 0.012) * (h0 / 0.52) * (h0 / 0.52);
                        const v = 1 - smoothstep(rad * 0.45, rad, d);
                        if (v > best) best = v * (0.55 + 0.45 * h1);
                    }
                }
            }
            return best;
        }
        const speck = new Float32Array(n2);
        const craze = new Float32Array(n2);
        for (let y = 0; y < N; y++) {
            const r = rowR[y], wy = rowY[y];
            for (let x = 0; x < N; x++) {
                const wx = r * cosT[x], wz = r * sinT[x], i = y * N + x;
                speck[i] = speckAt(wx, wy, wz) * up.speck;
                // 貫入。ノイズの等値線を細く抜くと、meandering な線になる
                const c = nz.fbm3(wx * 1.9 + 61, wy * 1.9 + 71, wz * 1.9 + 83, 2) - 0.5;
                craze[i] = (1 - smoothstep(0.0, 0.016, Math.abs(c))) * 0.7;
            }
        }

        // --- 口縁の鉄釉の帯 -------------------------------------------------
        // 【対策】断面の区分（k===1）だけで塗り分けると、境界が定規で引いた
        // 水平線になり「テープを巻いた器」に見える。実物は刷毛で掛けるので
        // 下端が数 mm 波打ち、ところどころ流れて垂れる。
        const tab = profileTable();
        const band = new Float32Array(n2);
        for (let y = 0; y < N; y++) {
            const wy = rowY[y], k = rowK[y];
            for (let x = 0; x < N; x++) {
                const i = y * N + x, th = (x + 0.5) / N * TAU;
                // 周方向に折り返すゆらぎ（円周上の 2 点を sin/cos で回して評価）
                const wob = (nz.fbm2(Math.cos(th) * 3.1 + 7, Math.sin(th) * 3.1 + 3, 3) - 0.5);
                const drip = Math.pow(clamp(nz.fbm2(Math.cos(th) * 7.4 + 21, Math.sin(th) * 7.4 + 11, 2), 0, 1), 3.2);
                // 見込み側は rimBandH、外側は少し短く垂れる
                const depth = (k === 0 ? BOWL.rimBandH : BOWL.rimBandH * 0.72)
                    * (1 + wob * 0.55) + drip * 0.55;
                const edge = BOWL.height - depth;
                let b = (k === 1) ? 1 : smoothstep(edge - 0.035, edge + 0.035, wy);
                if (k >= 2 && wy < BOWL.height - 1.4) b = 0;     // 外壁の下まで垂らさない
                if (k === 3) b = 0;
                band[i] = clamp(b, 0, 1);
            }
        }

        // --- 高台の土見せ ---------------------------------------------------
        const bare = new Float32Array(n2);
        for (let y = 0; y < N; y++) {
            const k = rowK[y], wy = rowY[y];
            // 釉は高台の少し上で止まる（釉際）。ここも真横一直線にはしない
            const v = (k === 3) ? 1 : smoothstep(1.05, 0.55, wy);
            for (let x = 0; x < N; x++) {
                const i = y * N + x, th = (x + 0.5) / N * TAU;
                const wob = (nz.fbm2(Math.cos(th) * 5.2 + 33, Math.sin(th) * 5.2 + 19, 2) - 0.5) * 0.35;
                bare[i] = clamp(v + (k === 3 ? 0 : wob * (v > 0 ? 1 : 0)), 0, 1);
            }
        }

        const BODY = up.body, DEEP = up.bodyDeep, RIM = up.rim, RIMW = up.rimWarm;
        const CLAY = [0.415, 0.352, 0.300];      // 土見せの胎土（鉄分を含む砂色）

        const albedo = TexLab.make("bowlA", N, scene, (d) => {
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    const i = y * N + x;
                    const s = slip[i];
                    // 化粧土が薄い所ほど下の胎土が透けて黄土色へ寄る
                    let r = mix(DEEP[0], BODY[0], s), g = mix(DEEP[1], BODY[1], s), b = mix(DEEP[2], BODY[2], s);
                    // 釉溜まり: わずかに青く、暗い
                    const pl = smoothstep(0.62, 0.92, pool[i]);
                    r = mix(r, r * 0.93, pl); g = mix(g, g * 0.955, pl); b = mix(b, b * 1.01, pl);
                    // 鉄粉。中心は黒に近く、周りへ薄茶のにじみが出る
                    const sp = speck[i];
                    if (sp > 0.001) {
                        const core = smoothstep(0.35, 0.85, sp);
                        const halo = sp - core * 0.55;
                        r = mix(r, 0.175, core) * (1 - halo * 0.22);
                        g = mix(g, 0.128, core) * (1 - halo * 0.26);
                        b = mix(b, 0.105, core) * (1 - halo * 0.30);
                    }
                    // 貫入は茶渋が入って細い褐色の線になる
                    const cz = craze[i] * (1 - band[i]) * 0.16;
                    r = mix(r, r * 0.80, cz); g = mix(g, g * 0.76, cz); b = mix(b, b * 0.72, cz);
                    // 口縁の鉄釉。厚い所は黒、薄い所は飴色が出る
                    const bd = band[i];
                    if (bd > 0.001) {
                        const warm = smoothstep(0.30, 0.85, slip[i]);
                        r = mix(r, mix(RIM[0], RIMW[0], warm), bd);
                        g = mix(g, mix(RIM[1], RIMW[1], warm), bd);
                        b = mix(b, mix(RIM[2], RIMW[2], warm), bd);
                    }
                    // 土見せ
                    const ba = bare[i];
                    if (ba > 0.001) {
                        const grit = 0.86 + 0.28 * slip[i];
                        r = mix(r, CLAY[0] * grit, ba);
                        g = mix(g, CLAY[1] * grit, ba);
                        b = mix(b, CLAY[2] * grit, ba);
                    }
                    putRGB(d, i * 4, r, g, b);
                }
            }
        }, { clampV: true });

        // ORM: 釉はしっとり、土見せはまったく光らない
        const orm = TexLab.orm("bowlO", N, scene, (x, y, S, o) => {
            const i = y * S + x;
            let ro = up.rough + 0.10 * (1 - slip[i]) - 0.12 * smoothstep(0.62, 0.92, pool[i]);
            ro = mix(ro, 0.235, band[i]);                 // 鉄釉は一段つやがある
            ro = mix(ro, 0.88, bare[i]);                  // 無釉はざらざら
            ro += speck[i] * 0.10;
            const ao = 1 - 0.30 * craze[i] - 0.18 * speck[i];
            o[0] = clamp(ao, 0, 1); o[1] = clamp(ro, 0.05, 0.98); o[2] = 0;
        }, { clampV: true });

        // 高さ場。起伏の主役はろくろ目（水平の細い筋）で、鉄粉はわずかに凹む
        const H = new Float32Array(n2);
        for (let y = 0; y < N; y++) {
            const wy = rowY[y];
            const lathe = 0.5 + 0.5 * Math.sin(wy / 0.085 * Math.PI);
            for (let x = 0; x < N; x++) {
                const i = y * N + x;
                H[i] = clamp(0.5 + (slip[i] - 0.5) * 0.30 - speck[i] * 0.22 - craze[i] * 0.30
                    + lathe * 0.10 * (1 - bare[i]) + bare[i] * (slip[i] - 0.5) * 0.55, 0, 1);
            }
        }
        const normal = TexLab.normalFromHeight("bowlN", N, scene, H, 0.0010, { clampV: true });

        // 透明釉の被覆（R）と粗さ（G）。土見せだけ被覆を 0 にする
        const coat = TexLab.make("bowlC", N, scene, (d) => {
            for (let i = 0; i < n2; i++) {
                const cov = clamp((1 - bare[i]) * (0.82 + 0.18 * slip[i]) - speck[i] * 0.25, 0, 1);
                const ro = clamp(0.085 + 0.10 * (1 - slip[i]) + 0.35 * bare[i] + craze[i] * 0.20, 0.02, 0.9);
                putRGB(d, i * 4, cov, ro, 0);
            }
        }, { linear: true, clampV: true });

        return { albedo: albedo, orm: orm, normal: normal, coat: coat };
    }

    function bowlMaterial(scene, up, name, seed) {
        const t = bowlTextures(scene, up, seed);
        const m = new BABYLON.PBRMaterial(name, scene);
        // 色はテクスチャに sRGB で焼いてある。ここに色を入れると二重掛けで沈む
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = t.albedo;
        m.metallic = 0.0;
        m.roughness = 1.0;
        m.metallicTexture = t.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = t.normal;
        m.bumpTexture.level = 0.75;
        // 透明釉は「色のついた素地の上に乗った無色のガラス」。
        // 均一な光沢にすると濡れたプラスチックになるので、被覆と粗さを散らす
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = t.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        m.clearCoat.intensity = 0.92;
        m.clearCoat.roughness = 0.10;
        m.clearCoat.indexOfRefraction = 1.52;
        m.texs = [t.albedo, t.orm, t.normal, t.coat];
        return m;
    }

    // =================================================================
    // 6. Strands : 麺の芯線
    // =================================================================
    // 【対策】麺の絡み方を手で書くと、どう頑張っても「編んだ籠」になる。
    // かといって完全なランダムウォークだと毛糸くずになる。
    // 実物の丼の中の麺を見ると、
    //   ・1本はほぼ一定の曲率で大きく弧を描く（茹で釜の中で丸まった名残）
    //   ・器の内壁にぶつかると内側へ巻き込む
    //   ・層になって積まれ、下の層の谷へ落ち込む
    // という3つでできている。そこで
    //   (1) 曲率を持続させたウォーカーで層ごとに芯線を撒き
    //   (2) 位置ベースの緩和（長さ・曲げ・相互反発・器の内壁）で落とす
    // という2段にする。接触点で軽くつぶれ、谷ができ、端がはみ出す。

    // 山の外形（ドーム）。中心が MOUND_TOP、つゆ面のところで半径 rTop。
    // 【対策】層を水平な円板のまま積むと、上から見たときに縁がそろって
    // 「ケーキの段」に見える。上の層ほど小さくすれば山になる。
    function moundRadiusAt(y) {
        const rTop = innerRAt(BROTH_Y) - 0.30;
        const H = MOUND_TOP - (BROTH_Y - 0.10);
        if (y <= BROTH_Y - 0.10) return rTop + (BROTH_Y - 0.10 - y) * 0.15;
        const u = clamp((MOUND_TOP - y) / H, 0, 1);
        return rTop * Math.pow(u, 1 / 2.2);
    }

    // ドームの高さ（半径 r での山の上端）。ねぎを乗せる高さに使う
    function moundTopAt(r) {
        const rTop = innerRAt(BROTH_Y) - 0.30;
        const H = MOUND_TOP - (BROTH_Y - 0.10);
        if (r >= rTop) return BROTH_Y - 0.10;
        return MOUND_TOP - H * Math.pow(clamp(r / rTop, 0, 1), 2.2);
    }

    // 層ごとの半径の上限。器の内壁と山の外形の小さいほう
    function layerLimit(y, men) {
        const wall = innerRAt(y) - men.w * 0.5 - 0.22;
        return Math.min(wall, moundRadiusAt(y));
    }

    // --- 曲率を持続させる平面ウォーカー -----------------------------------
    // κ（曲率）を OU 過程で揺らしながら積分する。κ の符号が持続するあいだは
    // 弧を描き、たまに反転して S 字になる——これが麺らしい曲がり方になる。
    function walkStrand(rng, nz, men, layerY, layerH, limit, length, phase) {
        const ds = men.seg;
        const n = Math.max(8, Math.round(length / ds));
        const pts = new Float64Array(n * 3);
        // 基準曲率。半径 1.6〜3.4cm の弧。器の半径に対してこのくらいだと
        // 「丼の中で巻いた」に見える
        const kBase = (rng.next() < 0.5 ? -1 : 1) / rng.range(1.6, 3.4);
        const kMin = -1 / 1.15, kMax = 1 / 1.15;   // 半径 1.15cm より内側には曲がれない
        let k = kBase * rng.range(0.4, 1.2);
        // 開始位置。中心寄りに偏らせる（外周から始めると壁沿いばかりになる）
        const r0 = limit * Math.sqrt(rng.next()) * 0.86;
        const a0 = rng.range(0, TAU);
        let x = Math.cos(a0) * r0, z = Math.sin(a0) * r0;
        let th = rng.range(0, TAU);
        for (let i = 0; i < n; i++) {
            const s = i * ds;
            // 高さのゆらぎ。層の厚みの 4 割まで上下する（あとで緩和が均す）
            const wob = Math.sin(s * 0.9 + phase) * 0.55 + Math.sin(s * 2.3 + phase * 1.7) * 0.30
                + Math.sin(s * 0.33 + phase * 0.5) * 0.15;
            pts[i * 3] = x;
            pts[i * 3 + 1] = layerY + wob * layerH * 0.38;
            pts[i * 3 + 2] = z;
            // κ の更新（平均回帰 + 白色雑音）
            k += (kBase - k) * 0.035 + rng.pm(0.085);
            k = clamp(k, kMin, kMax);
            th += k * ds;
            // 内壁の回避。外へ出そうになったら内向きへ舵を切る
            const r = Math.hypot(x, z);
            const w = smoothstep(limit - 1.25, limit - 0.05, r);
            if (w > 0) {
                const inward = Math.atan2(-z, -x);
                let d = inward - th;
                while (d > Math.PI) d -= TAU;
                while (d < -Math.PI) d += TAU;
                th += d * w * 0.30;
            }
            x += Math.cos(th) * ds;
            z += Math.sin(th) * ds;
            const rr = Math.hypot(x, z);
            if (rr > limit) { x *= limit / rr; z *= limit / rr; }
        }
        return { pts: pts, n: n };
    }

    // --- 芯線を撒く --------------------------------------------------------
    function makeStrands(men, seed) {
        const rng = new Rng(seed);
        const nz = new Noise(seed ^ 0x1234);
        const layerH = men.h * 0.92;              // 層の間隔。少し食い込ませて絡ませる
        const strands = [];
        let total = 0;
        for (let y = MOUND_BOT + layerH * 0.5; y < MOUND_TOP; y += layerH) {
            const limit = layerLimit(y, men);
            if (limit < men.w * 1.6) continue;
            // その層に入る麺の長さ。面積 × 充填率 ÷ 断面の幅
            const cap = Math.PI * limit * limit * men.dens / men.w * CFG.amount;
            let put = 0, guard = 0;
            while (put < cap && guard++ < 40) {
                const len = rng.range(men.len[0], men.len[1]);
                const st = walkStrand(rng, nz, men, y, layerH, limit, len, rng.range(0, TAU));
                st.tone = rng.pm(1.0);            // 個体差（焼き色ならぬ「茹で色」の差）
                st.roll = rng.range(0, TAU);
                strands.push(st);
                put += len; total += len;
            }
        }
        return { strands: strands, totalLen: total, layerH: layerH };
    }

    // =================================================================
    // 6b. Relax : 位置ベースの緩和
    // =================================================================
    // 【対策】Havok の剛体で麺を作ると、1本あたり 100 個のカプセルになり
    // 15 本で 1500 剛体。接触点は数千に達して、初期化だけで固まる。
    // 麺は「伸びない・少し曲がる・互いにめり込まない」だけなので、
    // 位置ベースの緩和（PBD）で十分。Vector3 を使わず素の配列で回す。
    function relaxStrands(list, men, opt) {
        const o = opt || {};
        const steps = o.steps || 150;
        const iters = o.iters || 4;
        const dt = 1 / 60;
        // 【対策】重力を実物どおり（980cm/s²）や 130 くらいにすると、層に積んだ
        // 山が一瞬で潰れて平たい「もり」になる。準静的に落としたいだけなので
        // 弱くしておく。強くするほど山は低く、めり込みも増える。
        const gy = -(o.gravity === undefined ? 80 : o.gravity);   // cm/s²
        const damp = o.damp === undefined ? 0.86 : o.damp;
        // 接触半径（つぶれる分だけ実寸より小さく）。
        // 【対策】この緩和には摩擦が無いので、細い麺ほど山が潰れて平たくなる。
        // そばを実寸の接触半径で落とすと、山の天端がつゆ面より下まで沈んで
        // 「丼の底に沈んだそば」になる。実物は麺どうしが引っかかって
        // 隙間を保つので、接触半径を puff 倍して空隙を持たせる
        const rc = (men.h * 0.46 + men.w * 0.16) * (men.puff === undefined ? 1 : men.puff);
        const d2min = (rc * 2) * (rc * 2);
        const ds = men.seg;

        // --- 全点を1本の配列へ並べる ---------------------------------
        let nTot = 0;
        for (const s of list) nTot += s.n;
        const P = new Float64Array(nTot * 3), Q = new Float64Array(nTot * 3);
        const sid = new Int32Array(nTot), loc = new Int32Array(nTot);
        {
            let o2 = 0;
            for (let si = 0; si < list.length; si++) {
                const s = list[si];
                for (let i = 0; i < s.n; i++) {
                    P[(o2 + i) * 3] = s.pts[i * 3];
                    P[(o2 + i) * 3 + 1] = s.pts[i * 3 + 1];
                    P[(o2 + i) * 3 + 2] = s.pts[i * 3 + 2];
                    sid[o2 + i] = si; loc[o2 + i] = i;
                }
                s.off = o2;
                o2 += s.n;
            }
            Q.set(P);
        }

        // --- 内壁の断面（r, y）を折れ線で持つ ---------------------------
        // 【対策】内壁を「半径 R(y) の円筒」として扱うと、底の近くで
        // 麺が壁をすり抜けて外へ出る。断面の折れ線に対する最近点で押し戻せば、
        // 底の丸みも口の開きも同じ式で扱える。
        const W = bowlCurves();
        const prof = [];
        for (let i = 0; i <= W.NI; i += 6) prof.push([W.inR[i], W.inY[i]]);
        prof.push([BOWL.rimInner, BOWL.height + 3]);      // 口縁から上へも壁を延ばす
        const nP = prof.length;

        // (r, y) を内側へ押し戻す。戻り値は [r, y]
        const tmp = [0, 0];
        function pushInside(r, y, margin) {
            let bd = 1e9, bx = 0, by = 0, bnx = 0, bny = 0;
            for (let i = 0; i < nP - 1; i++) {
                const ax = prof[i][0], ay = prof[i][1];
                const bx2 = prof[i + 1][0], by2 = prof[i + 1][1];
                const ex = bx2 - ax, ey = by2 - ay;
                const el = ex * ex + ey * ey;
                let t = el > 1e-12 ? ((r - ax) * ex + (y - ay) * ey) / el : 0;
                t = t < 0 ? 0 : (t > 1 ? 1 : t);
                const cx = ax + ex * t, cy = ay + ey * t;
                const dx = r - cx, dy = y - cy;
                const d = Math.hypot(dx, dy);
                if (d < bd) {
                    bd = d; bx = cx; by = cy;
                    const l = Math.hypot(ex, ey) || 1;
                    // 内向き法線（接線を +90 度回す）。底では上、壁では軸向き
                    bnx = -ey / l; bny = ex / l;
                }
            }
            const s = (r - bx) * bnx + (y - by) * bny;
            if (s >= margin) { tmp[0] = r; tmp[1] = y; return tmp; }
            const k = margin - s;
            tmp[0] = r + bnx * k; tmp[1] = y + bny * k;
            return tmp;
        }

        // 仕上げの拘束回数。ステップの外で回すので増やしても安い。
        // 【対策】ここを 3 回で切り上げると、平滑化で寄った麺どうしが直径の
        // 3〜4 割も食い込んだまま残る（36 回で 1%台まで落ちる）。
        // 細打ちは点数が倍あって収束が遅いので、点数に比例させる。
        const finish = o.finish === undefined
            ? Math.min(120, Math.max(36, Math.round(36 * nTot / 2500)))
            : o.finish;

        // --- 空間格子 ------------------------------------------------------
        // 【対策】近傍探索に Map を使うと、点 6000 × 27 近傍 × 4 反復 × 150
        // ステップで 1 億回の get になり、それだけで数秒とられる。
        // 丼の中という有限の箱なので、素直な整数格子（Int32Array）で足りる。
        const cell = rc * 2.05;
        const inv = 1 / cell;
        const G0 = Math.floor(-(BOWL.rimInner + 1.5) * inv);
        const G1 = Math.ceil((BOWL.rimInner + 1.5) * inv);
        const GY0 = Math.floor((MOUND_BOT - 1.5) * inv);
        const GY1 = Math.ceil((BOWL.height + 2.5) * inv);
        const NX = G1 - G0 + 1, NY = GY1 - GY0 + 1, NZ = NX;
        const head = new Int32Array(NX * NY * NZ);
        const next = new Int32Array(nTot);
        function gclamp(v, hi) { return v < 0 ? 0 : (v > hi ? hi : v); }
        function rebuild() {
            head.fill(-1);
            for (let i = 0; i < nTot; i++) {
                const kx = gclamp(Math.floor(P[i * 3] * inv) - G0, NX - 1);
                const ky = gclamp(Math.floor(P[i * 3 + 1] * inv) - GY0, NY - 1);
                const kz = gclamp(Math.floor(P[i * 3 + 2] * inv) - G0, NZ - 1);
                const c = (ky * NZ + kz) * NX + kx;
                next[i] = head[c]; head[c] = i;
            }
        }

        // --- 拘束を関数に切り出す（本計算と仕上げの両方で使う）--------------
        // (1) 長さ。前向き・後ろ向きの2パスで剛性を稼ぐ
        function lengthPass() {
            for (let pass = 0; pass < 2; pass++) {
                for (const s of list) {
                    const b = s.off;
                    for (let q = 0; q < s.n - 1; q++) {
                        const i = (pass === 0) ? (b + q) : (b + s.n - 2 - q);
                        const j = i + 1, i3 = i * 3, j3 = j * 3;
                        const dx = P[j3] - P[i3], dy = P[j3 + 1] - P[i3 + 1], dz = P[j3 + 2] - P[i3 + 2];
                        const d = Math.hypot(dx, dy, dz) || 1e-9;
                        const c = (d - ds) / d * 0.5;
                        const cx = dx * c, cy = dy * c, cz = dz * c;
                        P[i3] += cx; P[i3 + 1] += cy; P[i3 + 2] += cz;
                        P[j3] -= cx; P[j3 + 1] -= cy; P[j3 + 2] -= cz;
                    }
                }
            }
        }

        // (2) 曲げ。i と i+2 の距離を保つ弱い拘束。
        // 【対策】これが無いと麺が紙ひものように折れ、接触のたびに鋭角の角が
        // できて「切れた麺」に見える
        // 最小の曲がり半径は断面の幅で決まる。これより急に曲がると、
        // 掃引したときに管が自分自身を突き抜けて法線が裏返る（きしめんで顕著）
        const bendLen = 2 * ds * 0.985;
        // 【対策】曲げの拘束が弱いと、平たい麺ほど折り目で自己交差する。
        // 幅が厚みより広いほど強くする（きしめんで内向き法線が 1% → 0.1%）
        const bendK = Math.min(0.55, 0.22 + 0.10 * (men.w / men.h - 1));
        function bendPass() {
            for (const s of list) {
                const b = s.off;
                for (let q = 0; q < s.n - 2; q++) {
                    const i = b + q, j = i + 2, i3 = i * 3, j3 = j * 3;
                    const dx = P[j3] - P[i3], dy = P[j3 + 1] - P[i3 + 1], dz = P[j3 + 2] - P[i3 + 2];
                    const d = Math.hypot(dx, dy, dz) || 1e-9;
                    if (d >= bendLen) continue;
                    const c = (d - bendLen) / d * 0.5 * bendK;
                    const cx = dx * c, cy = dy * c, cz = dz * c;
                    P[i3] += cx; P[i3 + 1] += cy; P[i3 + 2] += cz;
                    P[j3] -= cx; P[j3 + 1] -= cy; P[j3 + 2] -= cz;
                }
            }
        }

        // (3) 相互反発
        // 【対策】27 近傍を素直に回すと同じ組を 2 度見ることになる。
        // 「後ろ側の 13 セル ＋ 自セル（添字が大きい相手だけ）」に絞れば、
        // 同じ結果が半分の手間で出る。
        const OFF = (function () {
            const a = [];
            for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (dz > 0 || (dz === 0 && dy > 0) || (dz === 0 && dy === 0 && dx > 0)) a.push([dx, dy, dz]);
            }
            return a;
        })();
        let repelK = 0.85;
        function solvePair(i, j) {
            if (sid[j] === sid[i]) {
                const dl = loc[j] - loc[i];
                if (dl <= 2 && dl >= -2) return;      // 自分の隣の節は当たり判定から外す
            }
            const i3 = i * 3, j3 = j * 3;
            const ex = P[j3] - P[i3], ey = P[j3 + 1] - P[i3 + 1], ez = P[j3 + 2] - P[i3 + 2];
            const q2 = ex * ex + ey * ey + ez * ez;
            if (q2 >= d2min || q2 < 1e-12) return;
            const d = Math.sqrt(q2);
            const c = (d - rc * 2) / d * 0.5 * repelK;
            const cx = ex * c, cy = ey * c, cz = ez * c;
            P[i3] += cx; P[i3 + 1] += cy; P[i3 + 2] += cz;
            P[j3] -= cx; P[j3 + 1] -= cy; P[j3 + 2] -= cz;
        }
        function repelPass(k) {
            repelK = k;
            for (let ky = 0; ky < NY; ky++) {
                for (let kz = 0; kz < NZ; kz++) {
                    const row = (ky * NZ + kz) * NX;
                    for (let kx = 0; kx < NX; kx++) {
                        for (let i = head[row + kx]; i >= 0; i = next[i]) {
                            for (let j = next[i]; j >= 0; j = next[j]) solvePair(i, j);
                            for (let o = 0; o < 13; o++) {
                                const gx = kx + OFF[o][0], gy2 = ky + OFF[o][1], gz = kz + OFF[o][2];
                                if (gx < 0 || gx >= NX || gy2 < 0 || gy2 >= NY || gz < 0 || gz >= NZ) continue;
                                for (let j = head[(gy2 * NZ + gz) * NX + gx]; j >= 0; j = next[j]) solvePair(i, j);
                            }
                        }
                    }
                }
            }
        }

        // (4) 器の内壁と、見えない床（つゆ面より下は作らない）
        // 【対策】pushInside は折れ線 30 本すべてに最近点をとるので、
        // 点 2400 × 4 反復 × 150 ステップ = 1 億回の hypot になり、緩和時間の
        // 大半をここで使う。山の内側にいる点は壁に届きようがないので、
        // 半径と高さで先に弾いてから呼ぶ（3 倍速くなる）。
        const floorY = MOUND_BOT;
        const SAFE = rc + 0.45;
        const bottomY = W.inY[0];
        function wallPass() {
            for (let i = 0; i < nTot; i++) {
                const i3 = i * 3;
                const x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
                const r = Math.hypot(x, z);
                if (y < bottomY + SAFE || y > BOWL.height || r > innerRAt(y) - SAFE) {
                    const res = pushInside(r, y, rc);
                    if (res[0] !== r || res[1] !== y) {
                        const nr = res[0], ny = res[1];
                        if (r > 1e-6) { P[i3] = x * nr / r; P[i3 + 2] = z * nr / r; }
                        P[i3 + 1] = ny;
                    }
                }
                if (P[i3 + 1] < floorY + rc) P[i3 + 1] = floorY + rc;
            }
        }

        for (let step = 0; step < steps; step++) {
            // Verlet 積分。減衰を強めに効かせて準静的に落とす
            for (let i = 0; i < nTot; i++) {
                const i3 = i * 3;
                const vx = (P[i3] - Q[i3]) * damp;
                const vy = (P[i3 + 1] - Q[i3 + 1]) * damp + gy * dt * dt;
                const vz = (P[i3 + 2] - Q[i3 + 2]) * damp;
                Q[i3] = P[i3]; Q[i3 + 1] = P[i3 + 1]; Q[i3 + 2] = P[i3 + 2];
                P[i3] += vx; P[i3 + 1] += vy; P[i3 + 2] += vz;
            }
            rebuild();
            for (let it = 0; it < iters; it++) {
                lengthPass();
                bendPass();
                repelPass(0.85);
                wallPass();
            }
        }

        // --- 仕上げの平滑化 ----------------------------------------------
        // 【対策】緩和直後の芯線は接触のたびに微小な角が残っていて、そのまま
        // 掃引すると稜線のハイライトが点線になる。ラプラシアンで均してから、
        // 長さ・反発・内壁をもう一度入れ直す。
        // 【対策】平滑化しっぱなしで終わらせないこと。均した分だけ隣の麺へ
        // 食い込み、節の長さも縮む。拘束は必ず後ろに置く。
        for (let pass = 0; pass < 2; pass++) {
            for (const s of list) {
                const b = s.off;
                const cp = new Float64Array(s.n * 3);
                for (let i = 0; i < s.n; i++) {
                    const i3 = (b + i) * 3;
                    cp[i * 3] = P[i3]; cp[i * 3 + 1] = P[i3 + 1]; cp[i * 3 + 2] = P[i3 + 2];
                }
                for (let i = 1; i < s.n - 1; i++) {
                    const i3 = (b + i) * 3;
                    for (let c = 0; c < 3; c++) {
                        P[i3 + c] = cp[i * 3 + c] * 0.74 + (cp[(i - 1) * 3 + c] + cp[(i + 1) * 3 + c]) * 0.13;
                    }
                }
            }
            rebuild();
            for (let it = 0; it < finish; it++) {
                lengthPass();
                repelPass(1.0);
                wallPass();
            }
        }
        // 反発で伸びたぶんを最後に長さだけで締める
        lengthPass();

        // --- 書き戻し ------------------------------------------------------
        let top = -1e9, lowR = 0;
        for (const s of list) {
            const b = s.off;
            for (let i = 0; i < s.n; i++) {
                const i3 = (b + i) * 3;
                s.pts[i * 3] = P[i3];
                s.pts[i * 3 + 1] = P[i3 + 1];
                s.pts[i * 3 + 2] = P[i3 + 2];
                if (P[i3 + 1] > top) top = P[i3 + 1];
                const r = Math.hypot(P[i3], P[i3 + 2]);
                if (r > lowR) lowR = r;
            }
        }
        return { top: top, maxR: lowR, points: nTot, rc: rc };
    }

    // =================================================================
    // 7. Sweep : 角丸断面の掃引
    // =================================================================
    // そばの断面は円ではない。切り刃で落とした角がほぼそのまま残るので、
    // 角丸というより「ほぼ正方形」に近い。スーパー楕円 |x/a|^n + |y/b|^n = 1 の
    // n でその角の立ち具合を持つ。断面を円にすると、どれだけ色を作り込んでも
    // 春雨にしか見えない——シルエットで決まる。
    //
    // もうひとつ効くのが断面の向き。切り出した麺は平らな面を下にして落ちる。
    // 回転最小フレーム（RMF）だけで掃引すると断面がでたらめに回り、
    // 稜線のハイライトが1本ごとにあちこちへ飛ぶ。RMF に「平らな面を
    // 水平へ向ける」補正を men.flat の割合で混ぜる。

    // 断面の形（単位断面）。角にテクセルを寄せたいので媒介変数はそのまま角度
    function sectionShape(NS, n) {
        const cs = new Float64Array(NS + 1), sn = new Float64Array(NS + 1);
        const e = 2 / n;
        for (let j = 0; j <= NS; j++) {
            const t = (j % NS) / NS * TAU;
            const c = Math.cos(t), s = Math.sin(t);
            cs[j] = Math.sign(c) * Math.pow(Math.abs(c), e);
            sn[j] = Math.sign(s) * Math.pow(Math.abs(s), e);
        }
        return { cs: cs, sn: sn };
    }

    // 芯線 → 回転最小フレーム（二重反射法）。
    // 【対策】毎点で cross(T, up) から作り直すと、接線が鉛直に近づいた所で
    // フレームが 180 度飛び、断面がねじれて裂ける。前の点から運ぶ。
    function frames(pts, n) {
        const T = new Float64Array(n * 3), U = new Float64Array(n * 3), Vv = new Float64Array(n * 3);
        for (let i = 0; i < n; i++) {
            const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
            let tx = pts[b * 3] - pts[a * 3], ty = pts[b * 3 + 1] - pts[a * 3 + 1], tz = pts[b * 3 + 2] - pts[a * 3 + 2];
            const l = Math.hypot(tx, ty, tz) || 1;
            T[i * 3] = tx / l; T[i * 3 + 1] = ty / l; T[i * 3 + 2] = tz / l;
        }
        // 初期フレーム
        let ux, uy, uz;
        {
            const tx = T[0], ty = T[1], tz = T[2];
            let ax = 0, ay = 1, az = 0;
            if (Math.abs(ty) > 0.9) { ax = 1; ay = 0; }
            ux = ay * tz - az * ty; uy = az * tx - ax * tz; uz = ax * ty - ay * tx;
            const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
        }
        for (let i = 0; i < n; i++) {
            if (i > 0) {
                // 二重反射（Wang らの RMF）
                const i0 = (i - 1) * 3, i1 = i * 3;
                const v1x = pts[i1] - pts[i0], v1y = pts[i1 + 1] - pts[i0 + 1], v1z = pts[i1 + 2] - pts[i0 + 2];
                const c1 = v1x * v1x + v1y * v1y + v1z * v1z;
                let rx = ux, ry = uy, rz = uz;
                let tx = T[i0], ty = T[i0 + 1], tz = T[i0 + 2];
                if (c1 > 1e-12) {
                    const d1 = (v1x * rx + v1y * ry + v1z * rz) * 2 / c1;
                    rx -= d1 * v1x; ry -= d1 * v1y; rz -= d1 * v1z;
                    const d2 = (v1x * tx + v1y * ty + v1z * tz) * 2 / c1;
                    tx -= d2 * v1x; ty -= d2 * v1y; tz -= d2 * v1z;
                }
                const v2x = T[i1] - tx, v2y = T[i1 + 1] - ty, v2z = T[i1 + 2] - tz;
                const c2 = v2x * v2x + v2y * v2y + v2z * v2z;
                if (c2 > 1e-12) {
                    const d3 = (v2x * rx + v2y * ry + v2z * rz) * 2 / c2;
                    rx -= d3 * v2x; ry -= d3 * v2y; rz -= d3 * v2z;
                }
                const l = Math.hypot(rx, ry, rz) || 1;
                ux = rx / l; uy = ry / l; uz = rz / l;
            }
            U[i * 3] = ux; U[i * 3 + 1] = uy; U[i * 3 + 2] = uz;
            const tx = T[i * 3], ty = T[i * 3 + 1], tz = T[i * 3 + 2];
            Vv[i * 3] = ty * uz - tz * uy;
            Vv[i * 3 + 1] = tz * ux - tx * uz;
            Vv[i * 3 + 2] = tx * uy - ty * ux;
        }
        return { T: T, U: U, V: Vv };
    }

    // 「平らな面を水平へ」の補正角。連続になるよう巻き数を追いながら解く
    function flatRoll(fr, n, flat, twist, rng) {
        const ang = new Float64Array(n);
        let prev = 0, wind = 0, init = true;
        const ph = rng.range(0, TAU), fq = rng.range(0.10, 0.26);
        for (let i = 0; i < n; i++) {
            const tx = fr.T[i * 3], ty = fr.T[i * 3 + 1], tz = fr.T[i * 3 + 2];
            let hx = -tz, hy = 0, hz = tx;
            const hl = Math.hypot(hx, hy, hz);
            let a;
            if (hl < 1e-4) {
                a = prev;                       // 接線が鉛直。前の値を引き継ぐ
            } else {
                hx /= hl; hz /= hl;
                const du = hx * fr.U[i * 3] + hy * fr.U[i * 3 + 1] + hz * fr.U[i * 3 + 2];
                const dv = hx * fr.V[i * 3] + hy * fr.V[i * 3 + 1] + hz * fr.V[i * 3 + 2];
                a = Math.atan2(dv, du);
                if (init) {
                    init = false;
                    // 断面は横軸まわりに実質対称なので π の周期で折り返せる。
                    // 水平な芯では U = -h（＝ a = π）に必ずなり、折り返さないと
                    // 断面ごと 180 度ひっくり返って背と腹が入れ替わる
                    wind = -Math.round(a / Math.PI) * Math.PI;
                }
                let d = a + wind - prev;
                while (d > Math.PI) { wind -= TAU; d -= TAU; }
                while (d < -Math.PI) { wind += TAU; d += TAU; }
                a = a + wind;
            }
            prev = a;
            ang[i] = a * flat + Math.sin(i * fq + ph) * twist;
        }
        return ang;
    }

    // --- 麺1杯ぶんを1メッシュにまとめる -----------------------------------
    // 【対策】1本ずつメッシュにすると 15〜30 個のドローコールになるうえ、
    // つゆ面との前後関係をメッシュ単位で解く場面が増える。1枚にまとめる。
    function buildNoodles(scene, strands, men, seed, cutY) {
        const NS = men.div || 16;
        const sec = sectionShape(NS, men.n);
        const rng = new Rng(seed ^ 0x9E37);
        const nz = new Noise(seed ^ 0x5A5A);

        // 使う麺（つゆ面の下に完全に沈んだものは描かない。輪郭は焼き込む）
        const use = [];
        for (const s of strands) {
            let mx = -1e9;
            for (let i = 0; i < s.n; i++) if (s.pts[i * 3 + 1] > mx) mx = s.pts[i * 3 + 1];
            if (mx > cutY) use.push(s);
        }
        if (!use.length) return null;

        let nV = 0, nI = 0;
        for (const s of use) { nV += s.n * (NS + 1) + 2; nI += (s.n - 1) * NS * 6 + NS * 6; }
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const colors = new Float32Array(nV * 4);
        const indices = new Uint32Array(nI);

        // --- 密度の場（接触の谷を暗くするのに使う）-----------------------
        // 【対策】麺の色を一様にすると、どれだけ明るくしても「白い紐の束」に
        // なる。実物は重なった谷につゆが溜まって色が乗る。
        // 芯線の点を粗い格子に数えておき、混み具合で地色を DEEP へ寄せる。
        const GC = 0.62;
        const dens = new Map();
        for (const s of strands) {
            for (let i = 0; i < s.n; i++) {
                const k = (Math.floor(s.pts[i * 3] / GC) + 512) * 1048576
                    + (Math.floor(s.pts[i * 3 + 1] / GC) + 512) * 1024
                    + (Math.floor(s.pts[i * 3 + 2] / GC) + 512);
                dens.set(k, (dens.get(k) || 0) + 1);
            }
        }
        function occAt(x, y, z) {
            const gx = Math.floor(x / GC), gy = Math.floor(y / GC), gz = Math.floor(z / GC);
            let c = 0;
            for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const k = (gx + dx + 512) * 1048576 + (gy + dy + 512) * 1024 + (gz + dz + 512);
                c += dens.get(k) || 0;
            }
            return c;
        }

        const MC = men.col;
        const PALE = lin3(MC.pale), BASE = lin3(MC.base), DEEP = lin3(MC.deep), CUT = lin3(MC.cut);
        const a0 = men.w * 0.5, b0 = men.h * 0.5;

        let vo = 0, io = 0;
        for (const s of use) {
            const n = s.n;
            const fr = frames(s.pts, n);
            const roll = flatRoll(fr, n, men.flat, men.twist, new Rng(seed ^ (s.off * 2654435761)));
            const base = vo;
            const strandPh = rng.range(0, 100);
            let arc = 0;
            for (let i = 0; i < n; i++) {
                if (i > 0) {
                    arc += Math.hypot(s.pts[i * 3] - s.pts[(i - 1) * 3],
                        s.pts[i * 3 + 1] - s.pts[(i - 1) * 3 + 1],
                        s.pts[i * 3 + 2] - s.pts[(i - 1) * 3 + 2]);
                }
                const px = s.pts[i * 3], py = s.pts[i * 3 + 1], pz = s.pts[i * 3 + 2];
                // 太さのゆらぎ（打ち粉の残りや延びムラ）。端は少しだけ細る
                const sw = 1 + men.wobble * (nz.n2(arc * 1.35 + strandPh, strandPh * 0.7, 0, 0) - 0.5) * 2;
                const endT = Math.min(smoothstep(0, 1.1, arc), smoothstep(0, 1.1, (n - 1 - i) * men.seg));
                const shrink = mix(0.90, 1.0, endT);
                const a = a0 * sw * shrink, b = b0 * sw * shrink;
                const ca = Math.cos(roll[i]), sa = Math.sin(roll[i]);
                // 混み具合 → 地色。上に出ている麺ほど白い
                const occ = occAt(px, py, pz);
                // 【対策】持ち上げた束は山の外にあるので、混み具合と高さの
                // 効きをそのまま使うと、束だけ白く飛ぶか逆に煤けて浮く。
                // どちらも半分ほどに薄める
                const lf = s.lift ? 0.45 : 1;
                const crowd = clamp((occ - 5) / 16, 0, 1) * lf;
                const high = smoothstep(MOUND_TOP - 1.5, MOUND_TOP - 0.15, py) * lf;
                for (let j = 0; j <= NS; j++) {
                    // 断面ローカル座標 → ワールド
                    const lx = sec.cs[j] * a, ly = sec.sn[j] * b;
                    const ox = lx * ca - ly * sa, oy = lx * sa + ly * ca;
                    const wx = px + fr.U[i * 3] * ox + fr.V[i * 3] * oy;
                    const wy = py + fr.U[i * 3 + 1] * ox + fr.V[i * 3 + 1] * oy;
                    const wz = pz + fr.U[i * 3 + 2] * ox + fr.V[i * 3 + 2] * oy;
                    const p3 = vo * 3, p2 = vo * 2, p4 = vo * 4;
                    positions[p3] = wx; positions[p3 + 1] = wy; positions[p3 + 2] = wz;
                    uvs[p2] = j / NS; uvs[p2 + 1] = arc / (men.uvLen || 1.6) + strandPh;
                    // 断面の「上を向いている側」は張って白く、下側は谷なので暗い
                    const upness = (fr.U[i * 3 + 1] * ox + fr.V[i * 3 + 1] * oy) / (b || 1);
                    let t = 0.5 + upness * 0.28 + high * 0.30 - crowd * 0.19 + s.tone * 0.055;
                    t = clamp(t, 0, 1);
                    let r, g, bb;
                    if (t > 0.5) {
                        const u = (t - 0.5) * 2;
                        r = mix(BASE[0], PALE[0], u); g = mix(BASE[1], PALE[1], u); bb = mix(BASE[2], PALE[2], u);
                    } else {
                        const u = t * 2;
                        r = mix(DEEP[0], BASE[0], u); g = mix(DEEP[1], BASE[1], u); bb = mix(DEEP[2], BASE[2], u);
                    }
                    colors[p4] = r; colors[p4 + 1] = g; colors[p4 + 2] = bb; colors[p4 + 3] = 1;
                    vo++;
                }
            }
            // 切り口（両端）。平らな面を張って、色はマットな淡色にする
            const capA = vo, capB = vo + 1;
            for (let e = 0; e < 2; e++) {
                const i = e === 0 ? 0 : n - 1;
                const p3 = (vo) * 3, p2 = (vo) * 2, p4 = (vo) * 4;
                positions[p3] = s.pts[i * 3];
                positions[p3 + 1] = s.pts[i * 3 + 1];
                positions[p3 + 2] = s.pts[i * 3 + 2];
                uvs[p2] = 0.5; uvs[p2 + 1] = 0.5;
                colors[p4] = CUT[0]; colors[p4 + 1] = CUT[1]; colors[p4 + 2] = CUT[2]; colors[p4 + 3] = 1;
                vo++;
            }
            for (let i = 0; i < n - 1; i++) {
                for (let j = 0; j < NS; j++) {
                    const a = base + i * (NS + 1) + j, b2 = a + 1, c = a + NS + 1, d = c + 1;
                    indices[io++] = a; indices[io++] = c; indices[io++] = b2;
                    indices[io++] = b2; indices[io++] = c; indices[io++] = d;
                }
            }
            const last = base + (n - 1) * (NS + 1);
            for (let j = 0; j < NS; j++) {
                indices[io++] = capA; indices[io++] = base + j; indices[io++] = base + j + 1;
                indices[io++] = capB; indices[io++] = last + j + 1; indices[io++] = last + j;
            }
        }

        const normals = computeNormals(positions, indices);
        // 【対策】ここで orientOutward（重心から外向きかで全体を裏返す判定）を
        // 使ってはいけない。麺の山は絡まった管の束で、重心は麺の「中」にある。
        // 総和がほぼ 0 になって裏返す・裏返さないが seed 次第で入れ替わり、
        // 半分の面が内向きのまま残る。巻き順は掃引の時点で決め打ちにする。
        // (U, V, T) は右手系。Babylon の法線計算は (a-b)×(c-b) なので、
        // 断面を j の増える向き（U→V）に回して三角形を a → c → b2 と張れば、
        // 法線は必ず芯線から外を向く。裏返し判定に頼る必要はない。
        weldNormals(positions, normals);

        const mesh = new BABYLON.Mesh("noodles", scene);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals;
        vd.uvs = uvs; vd.colors = colors;
        vd.applyToMesh(mesh, true);
        // 【対策】stride 4 の頂点カラーで hasVertexAlpha が立つと透過パスへ
        // 回され、深度書き込みが切られて麺どうしの前後が壊れる
        mesh.hasVertexAlpha = false;
        named(mesh, "noodles");
        mesh.tris = io / 3;
        mesh.strandCount = use.length;
        mesh.metadata = { dryColors: colors.slice(), depthPositions: positions };
        return mesh;
    }

    // =================================================================
    // 8. NoodleTex : 麺の表面
    // =================================================================
    // 茹で上がった麺の表面は3つでできている。
    //   (1) 切り刃の跡（長さ方向の浅い筋）
    //   (2) でんぷんが溶け出してできた薄い膜（＝つやの担当）
    //   (3) 気泡の痕と打ち粉の残り（小さなくぼみ）
    // UV は u = 断面の周（約 1.7cm）、v = 長さ 1.6cm で1周期。
    // どちらも同じ実寸に対応するので、テクセルは正方に近くなる。
    //
    // 【対策】アルベド・ORM・法線でノイズを引き直すと、粒の位置がずれて
    // 「ざらざらの上にぼんやりした汚れが乗った」ように見える。
    // 高さ場を1枚だけ作って3枚とも参照する。
    function noodleTextures(scene, men, seed) {
        const S = Math.max(128, Math.round(CFG.texSize * 0.5) || 512), s2 = S * S;
        const nz = new Noise(seed);
        const H = new Float32Array(s2);       // 高さ場（0.5 が地面）
        const pit = new Float32Array(s2);     // くぼみ（水膜が溜まる）
        const streak = new Float32Array(s2);
        const hoshi = new Float32Array(s2);   // 星（甘皮の粒）
        // 【対策】星を「閾値を切ったノイズ」で作ると、粒が 1mm 近い雲になって
        // つながり、カビの斑にしか見えない。器の鉄粉と同じで、
        // 格子1つにつき1粒を置き、格子ごとに半径と濃さを配るのが正解。
        // 格子の間隔は実寸で決める（u は断面の周 = uvLen、v も同じ長さ）ので、
        // 更科と田舎で粒の大きさがずれない
        const HC = Math.max(3, Math.round((men.uvLen || 0.62) / 0.16));
        function hoshiAt(u, v) {
            const cu = Math.floor(u * HC), cv = Math.floor(v * HC);
            let best = 0;
            for (let dv = -1; dv <= 1; dv++) {
                for (let du = -1; du <= 1; du++) {
                    const ku = cu + du, kv = cv + dv;
                    const h0 = nz.hash2(ku * 3 + 1, kv * 7 + 2);
                    if (h0 > 0.55) continue;              // 半分ほどの格子は空
                    const h1 = nz.hash2(ku * 11 + 5, kv * 13 + 7);
                    const h2 = nz.hash2(ku * 19 + 3, kv * 23 + 9);
                    const px = (ku + h1) / HC, py = (kv + h2) / HC;
                    let dx = u - px, dy = v - py;         // タイルの折り返し
                    if (dx > 0.5) dx -= 1; else if (dx < -0.5) dx += 1;
                    if (dy > 0.5) dy -= 1; else if (dy < -0.5) dy += 1;
                    const d = Math.hypot(dx, dy);
                    // 粒径 0.11〜0.38mm（直径）。小さい粒ほど数が多くなるよう二乗で効かせる
                    const q = h0 / 0.55;
                    const rad = (0.045 + 0.11 * q * q) / HC;
                    const val = 1 - smoothstep(rad * 0.70, rad, d);
                    if (val > best) best = val * (0.60 + 0.40 * h1);
                }
            }
            return best;
        }

        for (let y = 0; y < S; y++) {
            const v = y / S;
            for (let x = 0; x < S; x++) {
                const u = x / S, i = y * S + x;
                // 切り刃の筋。長さ方向（v）に伸ばすので周波数を u 側だけ上げる
                const st = nz.fbm2(u * 26, v * 3, 3, 26, 3) - 0.5
                    + (nz.n2(u * 74, v * 5, 74, 5) - 0.5) * 0.45;
                streak[i] = st;
                // 気泡の痕。閾値で粒立たせないと、ただのもやになる
                // 【対策】周波数 22 だと痕が 1〜2mm の斑になり、寄ったときに
                // 星と混じって「カビの生えた麺」に見える。実物の痕は 0.2〜0.5mm
                const bub = nz.fbm2(u * 46 + 11, v * 46 + 7, 2, 46, 46);
                const p = smoothstep(0.78, 0.94, bub);
                // 打ち粉の残りは逆に微小な盛り上がり
                const dust = smoothstep(0.76, 0.95, nz.fbm2(u * 46 + 31, v * 46 + 19, 2, 46, 46));
                pit[i] = p;
                hoshi[i] = hoshiAt(u, v);
                H[i] = clamp(0.5 + st * 0.22 - p * 0.22 + dust * 0.10 - hoshi[i] * 0.10
                    + (nz.n2(u * 120, v * 120, 120, 120) - 0.5) * 0.06, 0, 1);
            }
        }

        // アルベドは頂点カラーへの「変調」。1.0 を超えないよう 0.86〜1.0 に収める
        const albedo = TexLab.make("menA", S, scene, (d) => {
            for (let i = 0; i < s2; i++) {
                // でんぷんの膜が薄い所（筋の稜）はわずかに白く粉っぽい。
                // 【対策】気泡の痕をアルベドで 8% も暗くし、さらに青と緑だけ
                // 落とすと、寄ったときに赤茶の斑点が散って星と見分けがつかなくなる。
                // 痕は色ではなく「そこだけ水が溜まって滑らかに光る」で出す
                const w = clamp(0.968 + streak[i] * 0.050 - pit[i] * 0.018, 0.90, 1.0);
                // 星は黒ではなく焦茶。青を余計に引いて褐色へ寄せる
                const hv = hoshi[i] * men.hoshi;
                putRGB(d, i * 4, w * (1 - hv * 0.62), w * 0.998 * (1 - hv * 0.70),
                    w * 0.992 * (1 - hv * 0.80));
            }
        }, {});

        // 【対策】濡れた面は「明るく」ではなく「暗く・滑らかに」なる。
        // 粗さをくぼみと負の相関にすると、そこだけ鏡のように光って
        // 「汁をまとった麺」に見える
        const orm = TexLab.orm("menO", S, scene, (x, y, SS, o) => {
            const i = y * SS + x;
            const ro = 0.38 - pit[i] * 0.17 + streak[i] * 0.035 + hoshi[i] * men.hoshi * 0.10;
            o[0] = clamp(1 - pit[i] * 0.35 - hoshi[i] * men.hoshi * 0.12, 0, 1);
            o[1] = clamp(ro, 0.05, 0.9);
            o[2] = 0;
        }, {});

        const normal = TexLab.normalFromHeight("menN", S, scene, H, 0.0020, {});

        // 水膜: R = 被覆率（くぼみほど厚い） G = 粗さ
        const coat = TexLab.make("menC", S, scene, (d) => {
            for (let i = 0; i < s2; i++) {
                const cov = clamp(0.72 + pit[i] * 0.28 - Math.max(0, streak[i]) * 0.22, 0, 1);
                const ro = clamp(0.115 + Math.max(0, streak[i]) * 0.30 - pit[i] * 0.09, 0.02, 0.8);
                putRGB(d, i * 4, cov, ro, 0);
            }
        }, { linear: true });

        return { albedo: albedo, orm: orm, normal: normal, coat: coat };
    }

    function noodleMaterial(scene, men, tex, name) {
        const m = new BABYLON.PBRMaterial(name, scene);
        // 色は頂点カラー（リニア）に入れてある。ここへ色を足すと二重掛けで沈む
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = tex.albedo;
        m.metallic = 0.0;
        m.roughness = 1.0;
        m.metallicTexture = tex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = tex.normal;
        m.bumpTexture.level = 0.70;
        // 【対策】麺の照りを本体の粗さだけで作ると、濡れたプラスチックになる。
        // 実物は「そば粉のゲル（散乱体）」の上に「水の膜（IOR 1.33）」が
        // 乗った2層。照りは全部 clearCoat に持たせる
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = tex.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        m.clearCoat.intensity = 0.95;
        m.clearCoat.roughness = 0.125;
        m.clearCoat.indexOfRefraction = 1.335;
        // 【対策】そば粉は小麦より光を通さない。うどんの透光をそのまま使うと
        // 逆光で麺が飴のように光って、そば色が抜ける。プリセットごとに落とす
        m.subSurface.isTranslucencyEnabled = true;
        m.subBase = 0.46 * (men.sub === undefined ? 1 : men.sub);
        m.subSurface.translucencyIntensity = m.subBase;
        m.subSurface.tintColor = new BABYLON.Color3(
            s2l(men.tint[0]), s2l(men.tint[1]), s2l(men.tint[2]));
        m.subSurface.minimumThickness = men.h * 0.35;
        m.subSurface.maximumThickness = men.w * 1.05;
        m.texs = [tex.albedo, tex.orm, tex.normal, tex.coat];
        return m;
    }

    // =================================================================
    // 9. Submerge : 上から見た「最上点バッファ」★
    // =================================================================
    // 参考写真を測ると、つゆに 2cm 沈んだ麺はもう地色へ 9 割溶けている。
    // つまり消散長は 1cm 前後しかなく、つゆは実質不透明として扱ってよい。
    // 見えているのは「水面直下 1〜2cm の麺の輪郭」だけ。
    //
    // そこで屈折も透過も解かず、
    //   topY … その (x,z) でいちばん浅い物の高さ
    //   col  … そこの物の色（リニア）
    // を上から焼き、深さ d = BROTH_Y - topY から 1 - exp(-σd) でつゆ色へ
    // 寄せた結果をつゆ面のアルベドへ描き込む。透過描画もソートも要らない。
    class SubmergeMap {
        constructor(n, half) {
            this.n = n | 0;
            this.half = half;
            this.cell = (half * 2) / this.n;
            const m = this.n * this.n;
            this.topY = new Float32Array(m).fill(-1e9);
            this.cr = new Float32Array(m);
            this.cg = new Float32Array(m);
            this.cb = new Float32Array(m);
            this.dist = null;
        }
        _gx(x) { return (x + this.half) / this.cell - 0.5; }

        // --- 麺は芯線から直接焼く ---------------------------------------
        // 【対策】掃引したメッシュを三角形ラスタライズしてもよいが、
        // 完全に沈んだ麺はメッシュを作らずに済ませたい（頂点数が半分になる）。
        // 断面は「幅 rw・高さ rh の楕円」で近似できるので、
        // 線分ごとに楕円柱の上面を直接スタンプするほうが速くて正確。
        addStrand(s, rw, rh, col) {
            const n = this.n, cell = this.cell;
            for (let i = 0; i < s.n - 1; i++) {
                const ax = s.pts[i * 3], ay = s.pts[i * 3 + 1], az = s.pts[i * 3 + 2];
                const bx = s.pts[(i + 1) * 3], by = s.pts[(i + 1) * 3 + 1], bz = s.pts[(i + 1) * 3 + 2];
                const ex = bx - ax, ez = bz - az;
                const el = ex * ex + ez * ez;
                const x0 = Math.max(0, Math.floor(this._gx(Math.min(ax, bx) - rw)));
                const x1 = Math.min(n - 1, Math.ceil(this._gx(Math.max(ax, bx) + rw)));
                const z0 = Math.max(0, Math.floor(this._gx(Math.min(az, bz) - rw)));
                const z1 = Math.min(n - 1, Math.ceil(this._gx(Math.max(az, bz) + rw)));
                for (let gz = z0; gz <= z1; gz++) {
                    const wz = (gz + 0.5) * cell - this.half;
                    for (let gx = x0; gx <= x1; gx++) {
                        const wx = (gx + 0.5) * cell - this.half;
                        let t = el > 1e-12 ? ((wx - ax) * ex + (wz - az) * ez) / el : 0;
                        t = t < 0 ? 0 : (t > 1 ? 1 : t);
                        const cx = ax + ex * t, cz = az + ez * t;
                        const d = Math.hypot(wx - cx, wz - cz);
                        if (d >= rw) continue;
                        const y = (ay + (by - ay) * t) + rh * Math.sqrt(1 - (d / rw) * (d / rw));
                        const k = gz * n + gx;
                        if (y <= this.topY[k]) continue;
                        this.topY[k] = y;
                        this.cr[k] = col[0]; this.cg[k] = col[1]; this.cb[k] = col[2];
                    }
                }
            }
        }

        // --- 具（ねぎ・かまぼこ）はメッシュから焼く ----------------------
        addMesh(mesh) {
            const pos = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            const col = mesh.getVerticesData(BABYLON.VertexBuffer.ColorKind);
            const idx = mesh.getIndices();
            if (!pos || !idx) return;
            const mat = mesh.getWorldMatrix();
            const n = this.n;
            const tv = new V3();
            const wp = new Float32Array(pos.length);
            for (let i = 0; i < pos.length; i += 3) {
                tv.set(pos[i], pos[i + 1], pos[i + 2]);
                const w = BABYLON.Vector3.TransformCoordinates(tv, mat);
                wp[i] = w.x; wp[i + 1] = w.y; wp[i + 2] = w.z;
            }
            for (let t = 0; t < idx.length; t += 3) {
                const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
                const gax = this._gx(wp[i0 * 3]), gaz = this._gx(wp[i0 * 3 + 2]);
                const gbx = this._gx(wp[i1 * 3]), gbz = this._gx(wp[i1 * 3 + 2]);
                const gcx = this._gx(wp[i2 * 3]), gcz = this._gx(wp[i2 * 3 + 2]);
                const den = (gbz - gcz) * (gax - gcx) + (gcx - gbx) * (gaz - gcz);
                if (Math.abs(den) < 1e-12) continue;
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
                        const y = l0 * wp[i0 * 3 + 1] + l1 * wp[i1 * 3 + 1] + l2 * wp[i2 * 3 + 1];
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

        // 水面より上に出ている物までの距離場（メニスカスと接触の暗がり用）。
        // 2パスのチャンファ距離で十分。単位は cm
        buildDistance(waterY) {
            const n = this.n, m = n * n, cell = this.cell;
            const D = new Float32Array(m).fill(1e9);
            for (let i = 0; i < m; i++) if (this.topY[i] > waterY) D[i] = 0;
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
            const fx = this._gx(x), fz = this._gx(z);
            const ix = Math.floor(fx), iz = Math.floor(fz);
            if (ix < 0 || iz < 0 || ix >= n - 1 || iz >= n - 1) {
                out.y = -1e9; out.r = out.g = out.b = 0; out.d = 1e8; return out;
            }
            const tx = fx - ix, tz = fz - iz;
            const k00 = iz * n + ix, k10 = k00 + 1, k01 = k00 + n, k11 = k01 + 1;
            const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
            // 【対策】高さを平均すると麺の縁が斜面になってにじむ。最大を採る
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
    // 10. Broth : つゆ面
    // =================================================================
    // つゆは味噌汁と違って「透明な液体」に見える。ただし実際に屈折を解く
    // 必要はない。かけつゆの消散係数は実測で RGB それぞれ 0.85 / 1.28 / 2.30
    // [1/cm] 程度——青がいちばん強く吸われるので、深いほど赤褐色へ倒れる。
    //
    // 【対策】σ をスカラーにすると、濃くしたときに「灰色に濁ったつゆ」に
    // なる。醤油の色は「深さで色相が回る」ことが本質なので、必ず RGB 別に
    // 持つ。深さ 1cm で B は 90% 吸われるが R は 57% しか吸われない。
    //
    // 沈んだ物が無いテクセルでは「器の内底」を沈んだ物として扱う。
    // こうすると縁の近く（浅い所）は釉の乳白が透けて明るく、
    // 中央（深い所）は底が見えずに濃い——写真のつゆはこの見え方になる。
    function brothFields(mp, tsuyu, waterR, seed) {
        const N = Math.max(128, Math.round(CFG.texSize * 0.75) || 768), n2 = N * N;
        const half = mp.half;
        const nz = new Noise(seed);
        const rng = new Rng(seed ^ 0x77AA);
        const F = {
            N: N, half: half,
            mottle: new Float32Array(n2),
            dep: new Float32Array(n2),
            objR: new Float32Array(n2), objG: new Float32Array(n2), objB: new Float32Array(n2),
            near: new Float32Array(n2),
            wall: new Float32Array(n2),
            oil: new Float32Array(n2),
            oilRim: new Float32Array(n2),
            ripple: new Float32Array(n2),
            fleck: new Float32Array(n2)
        };
        // 油滴。かけつゆの表面には昆布と削り節の脂がごく薄く浮く
        const drops = [];
        const nd = 18 + rng.int(16);
        for (let i = 0; i < nd; i++) {
            const a = rng.range(0, TAU), rr = waterR * Math.sqrt(rng.next()) * 0.96;
            drops.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, r: rng.range(0.05, 0.30) });
        }
        // 器の内底の色（＝つゆ越しに透ける地）。照明が回り込まないぶん暗い
        const floorCol = lin3(UTSUWA[CFG.utsuwa].body);
        const LIT = 0.80;
        const s = { y: 0, r: 0, g: 0, b: 0, d: 0 };
        for (let py = 0; py < N; py++) {
            const z = ((py + 0.5) / N * 2 - 1) * half;
            for (let px = 0; px < N; px++) {
                const x = ((px + 0.5) / N * 2 - 1) * half;
                const k = py * N + px;
                const rr = Math.hypot(x, z);
                // 対流のムラ。単一周波数だと等高線図になるので帯域を分ける
                const m1 = nz.fbm2(x * 0.5 + 3, z * 0.5 + 7, 3) - 0.5;
                const m2 = nz.fbm2(x * 1.8 + 13, z * 1.8 + 2, 2) - 0.5;
                F.mottle[k] = clamp(0.5 + m1 * 1.0 + m2 * 0.5, 0, 1);
                // 削り節の微粉。つゆには必ず細かい粒が浮いている
                F.fleck[k] = smoothstep(0.80, 0.95, nz.fbm2(x * 52 + 9, z * 52 + 5, 2));
                // 沈んだ物。無ければ器の内底
                mp.sample(x, z, s);
                if (s.y > -1e8) {
                    F.dep[k] = Math.max(0, BROTH_Y - s.y);
                    F.objR[k] = clamp(s.r * LIT, 0, 1);
                    F.objG[k] = clamp(s.g * LIT, 0, 1);
                    F.objB[k] = clamp(s.b * LIT, 0, 1);
                } else {
                    const fy = innerYAt(Math.min(rr, BOWL.rimInner));
                    F.dep[k] = Math.max(0, BROTH_Y - fy);
                    // 器の内側は上からの光をほとんど受けない。さらに一段落とす
                    F.objR[k] = floorCol[0] * 0.62;
                    F.objG[k] = floorCol[1] * 0.62;
                    F.objB[k] = floorCol[2] * 0.62;
                }
                F.near[k] = s.d;
                F.wall[k] = smoothstep(waterR - 1.10, waterR - 0.02, rr);
                // 油滴。まず外接矩形で落とさないと、ここだけで 1600 万回の平方根になる
                let oi = 0, orim = 0;
                for (const dp of drops) {
                    const lim = dp.r * 1.25;
                    const ax = x - dp.x; if (ax > lim || ax < -lim) continue;
                    const az = z - dp.z; if (az > lim || az < -lim) continue;
                    const dd = Math.hypot(ax, az);
                    if (dd > lim) continue;
                    oi = Math.max(oi, 1 - smoothstep(dp.r * 0.72, dp.r, dd));
                    orim = Math.max(orim, 1 - smoothstep(0, dp.r * 0.16, Math.abs(dd - dp.r * 0.87)));
                }
                F.oil[k] = oi; F.oilRim[k] = orim;
                // 【対策】さざ波はタイリングして流すので、この場は周期関数だけで作る。
                // 器の縁から立つ定在波（非周期）を混ぜると継ぎ目に一直線の筋が出る
                F.ripple[k] = nz.fbm2(px / N * 9, py / N * 9, 3, 9, 9) - 0.5;
            }
        }
        F.drops = drops;
        return F;
    }

    // σ に依存する部分だけを描く。スライダーはここだけ呼び直す。
    // 【対策】配列を返す mix3 を使うと、59 万テクセル × 5 回で 300 万個の
    // 使い捨て配列が出て GC だけでスライダーがカクつく。スカラーに展開する
    // リニア → sRGB の表。1テクセルごとに pow を呼ぶと exp と同じだけ遅い
    const L2S = (function () {
        const t = new Uint8Array(2048);
        for (let i = 0; i < 2048; i++) t[i] = Math.round(l2s(i / 2047) * 255);
        return t;
    })();

    function brothAlbedoFill(d, F, ts, turb) {
        const n2 = F.N * F.N;
        // 【対策】吸収の合成は必ずリニアで行う。つゆの地色だけ sRGB のまま
        // 混ぜると、器の内底（リニアで持っている）と桁が合わず、
        // 「浅い所ほど暗い」という逆さまのつゆになる。書き込む直前に戻す。
        const DL = lin3(ts.deep);
        const D0 = DL[0], D1 = DL[1], D2 = DL[2];
        const s0 = ts.sigma[0] * turb, s1 = ts.sigma[1] * turb, s2s = ts.sigma[2] * turb;
        const mot = ts.mottle, kOil = ts.oil;
        // 【対策】exp を 59 万テクセル × 3 チャンネルぶん呼ぶと、それだけで
        // 60ms かかりスライダーが引っかかる。深さは 0〜4cm の有限区間なので
        // 表引きにする（1024 段あれば 8bit に落としたとき差は出ない）。
        const LN = 1024;
        let dmax = 0;
        for (let k = 0; k < n2; k++) if (F.dep[k] > dmax) dmax = F.dep[k];
        dmax = dmax > 1e-4 ? dmax : 1e-4;
        const lutR = new Float32Array(LN + 1), lutG = new Float32Array(LN + 1), lutB = new Float32Array(LN + 1);
        for (let i = 0; i <= LN; i++) {
            const dd = dmax * i / LN;
            lutR[i] = 1 - Math.exp(-s0 * dd);
            lutG[i] = 1 - Math.exp(-s1 * dd);
            lutB[i] = 1 - Math.exp(-s2s * dd);
        }
        const lutK = LN / dmax;
        for (let k = 0; k < n2; k++) {
            // 地色（無限に深い所の色）に対流のムラを乗せる
            const mv = (F.mottle[k] - 0.5) * mot;
            let br = D0 * (1 + mv * 0.42), bg = D1 * (1 + mv * 0.36), bb = D2 * (1 + mv * 0.28);
            // ★ Beer–Lambert。深さ d の物は 1 - exp(-σd) だけつゆ色へ溶ける
            const li = (F.dep[k] * lutK) | 0;
            const vr = lutR[li], vg = lutG[li], vb = lutB[li];
            const or2 = F.objR[k], og2 = F.objG[k], ob2 = F.objB[k];
            let r = or2 + (br - or2) * vr;
            let g = og2 + (bg - og2) * vg;
            let b = ob2 + (bb - ob2) * vb;
            // 削り節の微粉
            const fl = F.fleck[k] * 0.22;
            if (fl > 0) { r *= 1 - fl * 0.55; g *= 1 - fl * 0.50; b *= 1 - fl * 0.42; }
            // 水面から出ている麺のきわ: 内側に接触の影、外側にメニスカスの照り
            const nd = F.near[k];
            let sh = nd / 0.22; sh = sh < 0 ? 0 : (sh > 1 ? 1 : sh);
            sh = 1 - sh * sh * (3 - 2 * sh);
            if (sh > 0) {
                const w = sh * 0.28;
                r += (r * 0.58 - r) * w; g += (g * 0.55 - g) * w; b += (b * 0.52 - b) * w;
            }
            let ra = (nd - 0.05) / 0.12; ra = ra < 0 ? 0 : (ra > 1 ? 1 : ra);
            let rb = nd / 0.055; rb = rb < 0 ? 0 : (rb > 1 ? 1 : rb);
            const rim = (1 - ra * ra * (3 - 2 * ra)) * (rb * rb * (3 - 2 * rb)) * 0.75;
            if (rim > 0) {
                const tr = Math.min(1, r * 1.30 + 0.05), tg = Math.min(1, g * 1.26 + 0.04),
                    tb = Math.min(1, b * 1.22 + 0.03);
                r += (tr - r) * rim; g += (tg - g) * rim; b += (tb - b) * rim;
            }
            // 器ぎわ: 内壁が空を遮るぶん沈む
            const wl = F.wall[k] * 0.45;
            if (wl > 0) { r += (r * 0.74 - r) * wl; g += (g * 0.72 - g) * wl; b += (b * 0.70 - b) * wl; }
            // 油滴はごくわずかに黄色く濃い
            const ol = F.oil[k] * kOil * 0.40;
            if (ol > 0) {
                r += (Math.min(1, r * 1.05) - r) * ol; g += (g * 1.0 - g) * ol; b += (b * 0.92 - b) * ol;
            }
            const o = k * 4;
            d[o] = L2S[(r < 0 ? 0 : r > 1 ? 1 : r) * 2047 | 0];
            d[o + 1] = L2S[(g < 0 ? 0 : g > 1 ? 1 : g) * 2047 | 0];
            d[o + 2] = L2S[(b < 0 ? 0 : b > 1 ? 1 : b) * 2047 | 0];
            d[o + 3] = 255;
        }
    }

    function brothTextures(scene, F, ts, turb) {
        const N = F.N, n2 = N * N;
        const albedo = TexLab.make("tsuyuA", N, scene, (d) => {
            brothAlbedoFill(d, F, ts, turb);
        }, { clampU: true, clampV: true });

        // 水面の被覆と粗さ。油滴の内側だけ一段滑らかになる
        const coat = TexLab.make("tsuyuC", N, scene, (d) => {
            for (let k = 0; k < n2; k++) {
                const oil = F.oil[k] * ts.oil;
                const cov = clamp(0.90 + 0.10 * oil - 0.12 * F.fleck[k], 0, 1);
                let ro = ts.rough * (1 - 0.40 * oil) + 0.10 * F.fleck[k] + 0.05 * F.wall[k];
                ro += (1 - smoothstep(0, 0.14, F.near[k])) * 0.12;   // 麺のきわは乱れる
                putRGB(d, k * 4, cov, clamp(ro, 0.02, 0.9), 0);
            }
        }, { linear: true, clampU: true, clampV: true });

        // 拡散側の ORM。粗さは一定（散乱体）、AO だけ効かせる
        const orm = TexLab.make("tsuyuO", N, scene, (d) => {
            for (let k = 0; k < n2; k++) {
                const ao = clamp(1 - 0.18 * F.wall[k] - 0.20 * (1 - smoothstep(0, 0.24, F.near[k])), 0.22, 1);
                putRGB(d, k * 4, ao, 0.60, 0);
            }
        }, { linear: true, clampU: true, clampV: true });

        // さざ波の法線。こちらはタイリングさせてゆっくり流す
        const H = new Float32Array(n2);
        for (let k = 0; k < n2; k++) {
            H[k] = clamp(0.5 + F.ripple[k] * 0.5 + F.oilRim[k] * 0.20 * ts.oil - F.oil[k] * ts.oil * 0.05, 0, 1);
        }
        const ripple = TexLab.normalFromHeight("tsuyuN", N, scene, H, 0.0022, {});
        ripple.uScale = 2.4; ripple.vScale = 2.4;
        return { albedo: albedo, coat: coat, orm: orm, ripple: ripple };
    }

    function brothMaterial(scene, tex, ts, name) {
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoColor = new BABYLON.Color3(...lin3(ts.deep));
        m.alpha = 0.34;
        m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
        m.metallic = 0.0;
        m.roughness = 0.18;
        m.indexOfRefraction = 1.335;
        // Amber alpha surface with a thin, low-IOR water film.
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.7;
        m.clearCoat.roughness = ts.rough;
        m.clearCoat.indexOfRefraction = 1.335;
        m.clearCoat.bumpTexture = tex.ripple;
        m.clearCoat.bumpTexture.level = 0.50;
        m.texs = [tex.albedo, tex.coat, tex.orm, tex.ripple];
        return m;
    }

    // つゆ面のメッシュ。中心から水際まで刻み、最後に内壁を這い上がる数リングを足す
    function buildBrothSurface(scene, F, mat, waterR) {
        const NR = 72, NS = 160, MEN_RINGS = 4;
        const rows = NR + 1 + MEN_RINGS;
        const nV = rows * (NS + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array((rows - 1) * NS * 6);
        const half = F.half, N = F.N;

        function rippleAt(x, z) {
            const fx = (x / half * 0.5 + 0.5) * N - 0.5;
            const fz = (z / half * 0.5 + 0.5) * N - 0.5;
            const ix = clamp(Math.floor(fx), 0, N - 2), iz = clamp(Math.floor(fz), 0, N - 2);
            const tx = clamp(fx - ix, 0, 1), tz = clamp(fz - iz, 0, 1);
            const a = F.ripple[iz * N + ix], b = F.ripple[iz * N + ix + 1];
            const c = F.ripple[(iz + 1) * N + ix], d = F.ripple[(iz + 1) * N + ix + 1];
            return mix(mix(a, b, tx), mix(c, d, tx), tz);
        }

        let vo = 0;
        for (let i = 0; i < rows; i++) {
            let rr, yy;
            if (i <= NR) {
                // 面積が等しくなるように刻む（中心の三角が細くなりすぎない）
                const t = i / NR;
                rr = waterR * (Math.sqrt(t) * 0.5 + t * 0.5);
                yy = BROTH_Y;
            } else {
                // 【対策】水は器の内壁をわずかに這い上がる。ここを直角に切ると
                // 「板がはまっている」ように見える。壁の断面に沿わせ、
                // 器の中へ 0.02cm 食い込ませて隙間を殺す
                const t = (i - NR) / MEN_RINGS;
                yy = BROTH_Y + 0.062 * Math.pow(t, 1.5);
                rr = innerRAt(yy) + 0.020;
            }
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                const x = rr * Math.cos(th), z = rr * Math.sin(th);
                const p3 = vo * 3, p2 = vo * 2;
                const rr2 = Math.hypot(x, z);
                const wallW = smoothstep(waterR - 1.10, waterR - 0.02, rr2);
                const hh = rippleAt(x, z) + Math.sin(rr2 * 7.0 + 1.2) * 0.16 * wallW;
                positions[p3] = x;
                positions[p3 + 1] = yy + (i <= NR ? hh * 0.016 : 0);
                positions[p3 + 2] = z;
                // 平面投影の UV。沈んだ麺の輪郭はワールド XZ で焼いてあるので、
                // 極座標にすると中心で潰れて合わなくなる
                uvs[p2] = x / half * 0.5 + 0.5;
                uvs[p2 + 1] = z / half * 0.5 + 0.5;
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
        const normals = computeNormals(positions, indices);
        let up = 0;
        for (let i = 1; i < normals.length; i += 3) up += normals[i];
        if (up < 0) {
            for (let k = 0; k < indices.length; k += 3) {
                const t = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = t;
            }
            computeNormals(positions, indices, normals);
        }
        weldNormals(positions, normals);
        const mesh = new BABYLON.Mesh("tsuyu", scene);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals; vd.uvs = uvs;
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        named(mesh, "tsuyu");
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.tris = (rows - 1) * NS * 2;
        return mesh;
    }

    // =================================================================
    // 11. Sundry : 布 / 箸 / 箸置き / ねぎ
    // =================================================================
    // --- 麻の平織りクロス --------------------------------------------------
    // 【対策】布を「ノイズを敷いた平面」で作ると、必ず紙か砂に見える。
    // 平織りは経糸と緯糸が1本おきに上下する規則的な構造で、
    // その周期的なハイライトが「布」を布たらしめている。規則を先に作り、
    // 糸の太さのばらつき（節）をあとから乗せる。
    function clothTextures(scene, seed) {
        const S = 512, s2 = S * S;
        const TH = 26;                     // テクスチャ1枚あたりの糸の本数
        const nz = new Noise(seed);
        const H = new Float32Array(s2), W = new Float32Array(s2);
        const thick = new Float32Array(TH * 2);
        for (let i = 0; i < TH * 2; i++) thick[i] = 0.80 + 0.45 * Math.pow(nz.hash2(i * 7 + 3, i * 13 + 5), 2.2);
        for (let y = 0; y < S; y++) {
            const ty = y / S * TH;
            const j = Math.floor(ty), fy = ty - j;
            for (let x = 0; x < S; x++) {
                const tx = x / S * TH;
                const i = Math.floor(tx), fx = tx - i;
                const kw = thick[i % TH], kf = thick[TH + (j % TH)];
                // 糸の断面（かまぼこ形）。太い糸ほど高く、幅も広い
                const cw = Math.cos(clamp((fx - 0.5) / (0.5 * kw), -1, 1) * Math.PI * 0.5);
                const cf = Math.cos(clamp((fy - 0.5) / (0.5 * kf), -1, 1) * Math.PI * 0.5);
                const warpTop = ((i + j) & 1) === 0;
                const hw = cw * kw, hf = cf * kf;
                const h = warpTop ? 0.35 + 0.60 * hw + 0.10 * hf : 0.35 + 0.60 * hf + 0.10 * hw;
                const k = y * S + x;
                H[k] = clamp(h, 0, 1);
                // 糸ごとの色差（麻は1本ずつ色が違う。これが無いと紙になる）
                W[k] = warpTop ? kw : kf;
            }
        }
        // 大きなしわ（低周波）。真っ平らだとテーブルクロスに見えない
        const wrinkle = new Float32Array(s2);
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                wrinkle[y * S + x] = nz.fbm2(x / S * 4, y / S * 4, 3, 4, 4) - 0.5;
            }
        }
        const BASE = [0.740, 0.660, 0.510];        // 参考写真の実測値そのもの
        const albedo = TexLab.make("clothA", S, scene, (d) => {
            for (let k = 0; k < s2; k++) {
                const t = 0.86 + 0.20 * W[k] + wrinkle[k] * 0.10;
                const sh = 0.88 + 0.12 * H[k];      // 織りの谷は糸の影で沈む
                putRGB(d, k * 4, BASE[0] * t * sh, BASE[1] * t * sh, BASE[2] * t * sh * 0.995);
            }
        }, {});
        const orm = TexLab.orm("clothO", S, scene, (x, y, SS, o) => {
            const k = y * SS + x;
            o[0] = clamp(0.62 + 0.38 * H[k], 0, 1);
            o[1] = clamp(0.86 - 0.14 * H[k], 0.2, 1);
            o[2] = 0;
        }, {});
        const normal = TexLab.normalFromHeight("clothN", S, scene, H, 0.0016, {});
        return { albedo: albedo, orm: orm, normal: normal };
    }

    // --- 木（箸・箸置き）--------------------------------------------------
    function woodTextures(scene, seed, opt) {
        const S = 256, s2 = S * S;
        const nz = new Noise(seed);
        const ring = new Float32Array(s2), fine = new Float32Array(s2);
        for (let y = 0; y < S; y++) {
            const v = y / S;
            for (let x = 0; x < S; x++) {
                const u = x / S, k = y * S + x;
                // 年輪。1帯域だけのうねりは等間隔の波になって段ボールに見える
                const lo = nz.fbm2(u * 2.2, v * 1.2, 3, 2, 1) - 0.5;
                const mi = nz.fbm2(u * 8.0, v * 4.0, 2, 8, 4) - 0.5;
                const t = u * opt.rings + (lo + mi * 0.35) * opt.wave;
                const f = t - Math.floor(t);
                const h = nz.hash2(Math.floor(t), 0);
                const w = 0.10 + 0.32 * h * h;
                let dd = Math.abs(f - 0.55); if (dd > 0.5) dd = 1 - dd;
                ring[k] = (0.2 + 0.8 * h) * (1 - smoothstep(w * 0.3, w, dd));
                // 導管は繊維に沿う＝年輪と同じ向き。取り違えると布に見える
                fine[k] = nz.fbm2(u * 40, v * 300, 2, 40, 300);
            }
        }
        const albedo = TexLab.make("woodA", S, scene, (d) => {
            for (let k = 0; k < s2; k++) {
                const t = clamp(ring[k] * 0.8 + (fine[k] - 0.5) * 0.22, 0, 1);
                putRGB(d, k * 4,
                    mix(opt.base[0], opt.grain[0], t),
                    mix(opt.base[1], opt.grain[1], t),
                    mix(opt.base[2], opt.grain[2], t));
            }
        }, {});
        const orm = TexLab.orm("woodO", S, scene, (x, y, SS, o) => {
            const k = y * SS + x;
            o[0] = 1; o[1] = clamp(opt.rough + 0.12 * ring[k], 0.1, 0.98); o[2] = 0;
        }, {});
        const H = new Float32Array(s2);
        for (let k = 0; k < s2; k++) H[k] = clamp(0.5 - 0.3 * ring[k] + 0.2 * (fine[k] - 0.5), 0, 1);
        const normal = TexLab.normalFromHeight("woodN", S, scene, H, 0.004, {});
        return { albedo: albedo, orm: orm, normal: normal };
    }

    // --- 箸 ----------------------------------------------------------------
    // 【対策】断面を最後まで一定にすると爪楊枝か串に見える。実物の箸は
    // 長さの 2/3 まではほとんど細らず、先の 1/4 で一気に細くなる。
    // 手元は角（丸めた四角）、先は丸。写真の箸は先に滑り止めの刻みがある。
    function buildChopstick(scene, name, rng, A, B, col) {
        const NL = 46, NS = 16;
        const g = new Geo();
        const ax = vnorm(vsub(B, A));
        let up = [0, 1, 0];
        if (Math.abs(vdot(up, ax)) > 0.97) up = [1, 0, 0];
        const e1 = vnorm(vcross(ax, up));
        const e2 = vnorm(vcross(e1, ax));
        const roll = rng.range(0, TAU);
        const rows = [];
        for (let i = 0; i < NL; i++) {
            const t = i / (NL - 1);
            let rad = mix(0.255, 0.082, Math.pow(t, 2.6));
            // 滑り止めの刻み（先から 8%〜30% のあたりに 0.9mm ピッチ）
            const gv = smoothstep(0.66, 0.74, t) * (1 - smoothstep(0.90, 0.95, t));
            rad *= 1 - 0.085 * gv * (0.5 + 0.5 * Math.sin(t * 190));
            const p = mix(4.6, 2.0, smoothstep(0.30, 0.94, t));
            const c = [mix(A[0], B[0], t), mix(A[1], B[1], t), mix(A[2], B[2], t)];
            const row = [];
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU + roll;
                const ca = Math.abs(Math.cos(th)), sa = Math.abs(Math.sin(th));
                const sr = rad / Math.pow(Math.pow(ca, p) + Math.pow(sa, p), 1 / p);
                const ox = Math.cos(th) * sr, oy = Math.sin(th) * sr;
                const pos = [c[0] + e1[0] * ox + e2[0] * oy,
                c[1] + e1[1] * ox + e2[1] * oy,
                c[2] + e1[2] * ox + e2[2] * oy];
                row.push(g.vert(pos, j / NS * 0.5, t * 7, col));
            }
            rows.push(row);
        }
        const capA = g.vert(A, 0.5, 0, col), capB = g.vert(B, 0.5, 1, col);
        for (let i = 0; i < NL - 1; i++) {
            for (let j = 0; j < NS; j++) g.quad(rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
        }
        for (let j = 0; j < NS; j++) {
            g.tri(capA, rows[0][j], rows[0][j + 1]);
            g.tri(capB, rows[NL - 1][j + 1], rows[NL - 1][j]);
        }
        const mid = [(A[0] + B[0]) * 0.5, (A[1] + B[1]) * 0.5, (A[2] + B[2]) * 0.5];
        const geo = g.finish(mid);
        const m = toMesh(name, geo, scene);
        m.tris = geo.indices.length / 3;
        return m;
    }

    // --- 箸置き ------------------------------------------------------------
    // 【対策】平らな直方体にすると、箸が天端に乗っただけの木片に見える。
    // 実物は上面が長手方向に掬ってあり、箸がその窪みに納まって転がらない。
    function buildRest(scene, w, h, d2, rr, dip, pos, yaw, col) {
        const seg = 10;
        const g = new Geo();
        const hx = w * 0.5, hy = h * 0.5, hz = d2 * 0.5;
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        const F = [
            { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
            { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
            { n: [0, 0, 1], u: [-1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] }
        ];
        for (const f of F) {
            const rows = [];
            for (let iy = 0; iy <= seg; iy++) {
                const tv = iy / seg * 2 - 1, row = [];
                for (let ix = 0; ix <= seg; ix++) {
                    const tu = ix / seg * 2 - 1;
                    const qx = (f.n[0] + f.u[0] * tu + f.v[0] * tv) * hx;
                    const qy = (f.n[1] + f.u[1] * tu + f.v[1] * tv) * hy;
                    const qz = (f.n[2] + f.u[2] * tu + f.v[2] * tv) * hz;
                    const ax2 = Math.max(0, hx - rr), ay2 = Math.max(0, hy - rr), az2 = Math.max(0, hz - rr);
                    const c0 = clamp(qx, -ax2, ax2), c1 = clamp(qy, -ay2, ay2), c2 = clamp(qz, -az2, az2);
                    const dx = qx - c0, dy = qy - c1, dz = qz - c2;
                    const dl = Math.hypot(dx, dy, dz) || 1;
                    const x = c0 + dx / dl * rr;
                    let y = c1 + dy / dl * rr;
                    const z = c2 + dz / dl * rr;
                    if (dip > 0) {
                        const R = (hx * hx + dip * dip) / (2 * dip);
                        const top = (hy - dip + R) - Math.sqrt(Math.max(0, R * R - x * x));
                        y = -hy + (y + hy) * (top + hy) / (2 * hy);
                    }
                    row.push(g.vert([x * cy + z * sy + pos[0], y + pos[1], -x * sy + z * cy + pos[2]],
                        tu * 0.5 + 0.5, tv * 0.5 + 0.5, col));
                }
                rows.push(row);
            }
            for (let iy = 0; iy < seg; iy++) {
                for (let ix = 0; ix < seg; ix++) g.quad(rows[iy][ix], rows[iy + 1][ix], rows[iy + 1][ix + 1], rows[iy][ix + 1]);
            }
        }
        const geo = g.finish(pos);
        const m = toMesh("chopstickRest", geo, scene);
        m.tris = geo.indices.length / 3;
        return m;
    }

    // --- 刻みねぎ -----------------------------------------------------------
    // 小口切りの青ねぎは「輪」。中が空いていること、切り口が白く、
    // 外皮だけが濃い緑であることの2点でねぎに見える。
    function buildNegi(scene, count, seed) {
        const rng = new Rng(seed);
        const NS = 14;
        const g = new Geo();
        const SKIN = lin3([0.212, 0.382, 0.145]);
        const CUT = lin3([0.762, 0.828, 0.640]);
        const INNER = lin3([0.560, 0.660, 0.470]);
        const waterR = innerRAt(BROTH_Y);
        for (let c = 0; c < count; c++) {
            const ro = rng.range(0.17, 0.35);
            const ri = ro * rng.range(0.77, 0.89);
            const th = rng.range(0.065, 0.14);
            // 麺の山の上に落ちる。中心寄りは山が高いので浮く高さも上がる
            const a = rng.range(0, TAU);
            const rad = Math.sqrt(rng.next()) * 1.05;
            const cluster = spot(-1.85, 2.45);
            const cx = cluster[0] + Math.cos(a)*rad, cz = cluster[1] + Math.sin(a)*rad;
            const y = Math.max(BROTH_Y+0.10, moundTopAt(Math.hypot(cx,cz)))
                + 0.15 + (1-rad/1.05)*0.32 + rng.range(-0.02,0.16);
            const tilt = rng.range(-0.55, 0.55), tilt2 = rng.range(-0.55, 0.55);
            const yaw = rng.range(0, TAU);
            const place = (lx, ly, lz) => {
                // 傾け（x → z の順）→ yaw → 平行移動
                let x = lx, yy = ly, z = lz;
                let t = yy * Math.cos(tilt) - z * Math.sin(tilt); z = yy * Math.sin(tilt) + z * Math.cos(tilt); yy = t;
                t = x * Math.cos(tilt2) - yy * Math.sin(tilt2); yy = x * Math.sin(tilt2) + yy * Math.cos(tilt2); x = t;
                t = x * Math.cos(yaw) - z * Math.sin(yaw); z = x * Math.sin(yaw) + z * Math.cos(yaw); x = t;
                return [cx + x, y + yy, cz + z];
            };
            const rows = [[], [], [], []];
            for (let j = 0; j <= NS; j++) {
                const t = (j % NS) / NS * TAU;
                const wob = 1 + 0.10 * Math.sin(t * 3 + c);
                const co = Math.cos(t), si = Math.sin(t);
                rows[0].push(g.vert(place(co * ro * wob, th * 0.5, si * ro * wob), j / NS, 0, CUT));
                rows[1].push(g.vert(place(co * ro * wob, -th * 0.5, si * ro * wob), j / NS, 1, CUT));
                rows[2].push(g.vert(place(co * ri, -th * 0.5, si * ri), j / NS, 1, INNER));
                rows[3].push(g.vert(place(co * ri, th * 0.5, si * ri), j / NS, 0, INNER));
            }
            // 外周（皮）・底・内周・天面の4枚で閉じた輪にする
            const skinTop = [], skinBot = [];
            for (let j = 0; j <= NS; j++) {
                const t = (j % NS) / NS * TAU, co = Math.cos(t), si = Math.sin(t);
                const wob = 1 + 0.10 * Math.sin(t * 3 + c);
                skinTop.push(g.vert(place(co * ro * wob, th * 0.5, si * ro * wob), j / NS, 0, SKIN));
                skinBot.push(g.vert(place(co * ro * wob, -th * 0.5, si * ro * wob), j / NS, 1, SKIN));
            }
            for (let j = 0; j < NS; j++) {
                g.quad(skinTop[j], skinBot[j], skinBot[j + 1], skinTop[j + 1]);       // 外皮
                g.quad(rows[0][j], rows[0][j + 1], rows[3][j + 1], rows[3][j]);        // 天の切り口
                g.quad(rows[1][j], rows[2][j], rows[2][j + 1], rows[1][j + 1]);        // 底の切り口
                g.quad(rows[3][j], rows[3][j + 1], rows[2][j + 1], rows[2][j]);        // 内側
            }
        }
        if (!g.idx.length) return null;
        const geo = g.finish(null);
        const m = toMesh("negi", geo, scene);
        m.tris = geo.indices.length / 3;
        return m;
    }

    // =================================================================
    // 11b. Tempura : えび天 / 大葉の天ぷら / 椎茸の飾り切り ★
    // =================================================================
    // 天ぷらを「でこぼこした黄色い塊」にしないために要るのは3つ。
    //
    //  (a) 揚げ色の幅。衣を一色で塗ると、どれだけ形を作り込んでも
    //      発泡スチロールになる。実物は花（はじけた薄い衣）の先がほぼ白、
    //      衣の谷が濃い茶で、その差が 3 段ぶんある。高さと色を相関させる。
    //  (b) 花。衣の輪郭が滑らかだと「衣をまとった何か」で止まる。
    //      本体から独立した薄片がいくつも突き出していて初めて天ぷらになる。
    //  (c) 尾。えび天のシルエットは尾扇でほぼ決まる。扇は膜と筋（鰭条）の
    //      2色でできていて、膜だけが光を通す。
    //
    // 【対策】ここで作る具は1つのメッシュに複数まとめる。そのため
    // Geo.finish(ref)（重心から外向きかで全体を裏返す判定）は使えない。
    // 重心が具と具の隙間に落ちて、半分の面が裏返るため。面は最初から
    // 表向きに張り、ref には null を渡す。
    // face(): 格子 rows[i][j] を i=長手方向・j=断面の回る向きで張るときの
    // 巻き順。computeNormals が (a-b)×(c-b) なので、この順で外向きになる。
    // computeNormals は (a-b)×(c-b) なので、a=(i,j) b=(i+1,j) c=(i+1,j+1)
    // d=(i,j+1) の順に張ると法線は -Δi×Δj になる。右手系のフレームで
    // i を長手・j を反時計回りにとれば、これがそのまま外向き。
    function face(g, a, b, c, d) { g.quad(a, b, c, d); }

    // --- 衣のテクスチャ ----------------------------------------------------
    function koromoTextures(scene, seed) {
        const S = Math.max(256, Math.round(CFG.texSize * 0.5)), s2 = S * S;
        const nz = new Noise(seed);
        const H = new Float32Array(s2), B = new Float32Array(s2);
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const u = x / S * 10, v = y / S * 10;
                const a = nz.fbm2(u, v, 3, 10, 10);
                const b = nz.fbm2(u * 2.9 + 11, v * 2.9 + 5, 3, 29, 29);
                const c = nz.fbm2(u * 9.0 + 3, v * 9.0 + 7, 2, 90, 90);
                let h = a * 0.52 + b * 0.31 + c * 0.17;
                h = h < 0.52 ? h : 0.52 + (h - 0.52) * 0.72;
                const pore = smoothstep(0.65, 0.83, c);
                H[y * S + x] = clamp(h - pore * 0.19, 0, 1);
                B[y * S + x] = smoothstep(0.62, 0.86, nz.fbm2(u * 0.7 + 21, v * 0.7 + 31, 2, 7, 7));
            }
        }
        const BURN = lin3(KOROMO_BURN);
        const albedo = TexLab.make("koromoA", S, scene, (d) => {
            for (let k = 0; k < s2; k++) {
                const t = clamp((H[k] - 0.30) / 0.52, 0, 1);
                const w = mix(0.97, 1.00, t);      // 谷は濃く、花の先は白く飛ぶ
                const bn = B[k] * (1 - H[k] * 0.5) * 0.12;
                putRGB(d, k * 4,
                    w * (1 - bn * (1 - BURN[0]) * 0.9),
                    w * (1 - bn * (1 - BURN[1]) * 0.9),
                    w * (1 - bn * (1 - BURN[2]) * 0.9));
            }
        }, { uScale: 1, vScale: 1 });

        const orm = TexLab.orm("koromoO", S, scene, (x, y, SS, o) => {
            const k = y * SS + x;
            o[0] = clamp(0.97 + 0.03 * H[k], 0, 1);
            o[1] = clamp(0.46 + 0.18 * H[k], 0.18, 0.95);
            o[2] = 0;
        }, {});
        const normal = TexLab.normalFromHeight("koromoN", S, scene, H, 0.010, {});
        return { albedo: albedo, orm: orm, normal: normal };
    }

    // --- 小さな塊（花・衣の粒）------------------------------------------
    // 【対策】球を「緯度 0〜π の格子」で作ると両極でリングが1点に潰れ、
    // 面積 0 の三角形しかつながらない頂点ができる。そこだけ法線が 0 になり、
    // 天ぷらの先が真っ黒な点になって現れる。極は必ず扇で塞ぐ。
    function blob(g, lf, rad, taper, stretch, cIn, cOut) {
        const NA = 10, NB = 6;
        const rs = [];
        for (let b = 1; b < NB; b++) {
            const v = b / NB * Math.PI, sv = Math.sin(v);
            const tp = taper ? (0.45 + 0.55 * sv) : 1;
            const rr = [];
            for (let a = 0; a <= NA; a++) {
                const u = a / NA * TAU;
                rr.push(g.vert(lf.at(Math.cos(u) * sv * rad[0] * tp,
                    Math.sin(u) * sv * rad[1] * tp,
                    -Math.cos(v) * rad[2] + stretch),
                    a / NA * 1.4, b / NB * 1.4, b < NB * 0.5 ? cIn : cOut));
            }
            rs.push(rr);
        }
        const p0 = g.vert(lf.at(0, 0, -rad[2] + stretch), 0.5, 0, cIn);
        const p1 = g.vert(lf.at(0, 0, rad[2] + stretch), 0.5, 1, cOut);
        for (let b = 0; b < rs.length - 1; b++) {
            for (let a = 0; a < NA; a++) face(g, rs[b][a], rs[b + 1][a], rs[b + 1][a + 1], rs[b][a + 1]);
        }
        for (let a = 0; a < NA; a++) {
            g.tri(p0, rs[0][a + 1], rs[0][a]);
            g.tri(p1, rs[rs.length - 1][a], rs[rs.length - 1][a + 1]);
        }
    }

    // --- 局所フレーム -------------------------------------------------------
    // 原点 o と3軸（e1 横 / e2 上 / e3 前）を持つ小さな道具。
    // 具はどれも「どこかに置いて、傾けて、ひねる」だけなのでこれで足りる。
    // Closed, asymmetric crumpled batter petal. Root at local z=0.
    function crispyFlake(g, lf, rng, width, length, base, pale) {
        const K = 9, phase = rng.range(0, TAU), angle = rng.range(0, TAU);
        const ringA = [], ringB = [];
        const turn = (x,y,z) => lf.at(x*Math.cos(angle)-y*Math.sin(angle),
            x*Math.sin(angle)+y*Math.cos(angle), z);
        const center = turn(0, 0.025, length * 0.50);
        const ca = g.vert(center, 0.5, 0.5, pale);
        const cb = g.vert(turn(0, 0.003, length * 0.50), 0.5, 0.5, base);
        for (let i=0; i<K; i++) {
            const a=i/K*TAU, r=rng.range(0.73,1.24);
            const x=Math.cos(a)*width*r;
            const z=(0.5+Math.sin(a)*0.58*r)*length;
            const y=0.040*Math.sin(a*3+phase)+0.12*z*z/Math.max(length,0.01);
            const c=base.map((v,k)=>mix(v,pale[k],rng.range(0.4,0.95)));
            ringA.push(g.vert(turn(x,y+0.017,z),0.5+Math.cos(a)*0.5,0.5+Math.sin(a)*0.5,c));
            ringB.push(g.vert(turn(x,y-0.017,z),0.5+Math.cos(a)*0.5,0.5+Math.sin(a)*0.5,base));
        }
        const first=g.idx.length;
        for(let i=0;i<K;i++) {
            const j=(i+1)%K;
            g.tri(ca,ringA[i],ringA[j]);g.tri(cb,ringB[j],ringB[i]);
            g.quad(ringA[i],ringB[i],ringB[j],ringA[j]);
        }
        // Orient this connected petal independently of the other toppings.
        let score=0;
        for(let t=first;t<g.idx.length;t+=3) {
            const a=g.idx[t]*3,b=g.idx[t+1]*3,c=g.idx[t+2]*3;
            const ab=[g.pos[a]-g.pos[b],g.pos[a+1]-g.pos[b+1],g.pos[a+2]-g.pos[b+2]];
            const cbv=[g.pos[c]-g.pos[b],g.pos[c+1]-g.pos[b+1],g.pos[c+2]-g.pos[b+2]];
            const n=vcross(ab,cbv);
            score+=vdot(n,[g.pos[a]-center[0],g.pos[a+1]-center[1],g.pos[a+2]-center[2]]);
        }
        if(score<0)for(let t=first;t<g.idx.length;t+=3){const b=g.idx[t+1];g.idx[t+1]=g.idx[t+2];g.idx[t+2]=b;}
    }

    function frameAxis(o, f0, side0) {
        const f = vnorm(f0);
        const d = vdot(side0, f);
        let sx = side0[0] - f[0] * d, sy = side0[1] - f[1] * d, sz = side0[2] - f[2] * d;
        if (Math.hypot(sx, sy, sz) < 1e-5) { sx = 1; sy = 0; sz = 0; }
        const s = vnorm([sx, sy, sz]);
        const v = vnorm(vcross(f, s));      // s × v = f（右手系）
        return {
            o: o, s: s, v: v, f: f,
            at: function (ls, lv, lf) {
                return [o[0] + s[0] * ls + v[0] * lv + f[0] * lf,
                o[1] + s[1] * ls + v[1] * lv + f[1] * lf,
                o[2] + s[2] * ls + v[2] * lv + f[2] * lf];
            }
        };
    }

    function localFrame(o, fwd, up) {
        const f = vnorm(fwd);
        let u = vnorm(up || [0, 1, 0]);
        if (Math.abs(vdot(f, u)) > 0.985) u = [1, 0, 0];
        const s = vnorm(vcross(u, f));      // 横
        const v = vnorm(vcross(f, s));      // 上
        return {
            o: o, s: s, v: v, f: f,
            at: function (ls, lv, lf) {
                return [o[0] + s[0] * ls + v[0] * lv + f[0] * lf,
                o[1] + s[1] * ls + v[1] * lv + f[1] * lf,
                o[2] + s[2] * ls + v[2] * lv + f[2] * lf];
            }
        };
    }

    // =====================================================================
    // えび天
    // =====================================================================
    // 【流用】身は「えびの握り」のサンプルの作りをそのまま持ってきた。
    // えびがえびに見えるのは、丸みでも色でもなく "節" の入り方による。
    // 節の境目は胴をまっすぐ横切らず、腹側が先、背側が後ろへ回る「へ」の字を
    // 描く。seamCoord がその 1 行で、あとは溝を彫ってふくらみを足すだけ。
    //
    // 天ぷらは、その身に衣をかぶせる。衣は身の面を法線方向へ押し出した
    // 「もう1枚の面」として作る。こうすると衣が勝手にえびの形になり、
    // 尾のほうへ細くなる流れも、節のふくらみも衣ごしに残る。
    // 【対策】衣を独立した円柱で作ると、中身と関係のない棒になって
    // 「衣だけの天ぷら」に見える。必ず身の面から生やすこと。
    // 裾（衣の切れる所）は波打たせて、そこから素の身と尾を出す。

    function ebiSeamCoord(u, w) {
        const curve = Math.sqrt(w * w + 0.018) - Math.sqrt(0.018);
        return (u + EBI.segCurve * (curve - 0.42)
            + 0.005 * Math.sin(u * 19 + w * 4)) * EBI.segs;
    }
    // 頭側 a → 中 b → 尾側 c の3点をつなぐ太さの分布
    function ebiProf(u, a, b, c) {
        return (u < 0.42) ? mix(a, b, smoothstep(0, 0.42, u)) : mix(b, c, smoothstep(0.42, 1, u));
    }
    // 両端の丸め
    function ebiEnd(u) {
        const eh = 0.055, et = 0.075;
        if (u < eh) return Math.sqrt(Math.max(0, 1 - Math.pow(1 - u / eh, 2)));
        if (u > 1 - et) return Math.sqrt(Math.max(0, 1 - Math.pow((u - (1 - et)) / et, 2)));
        return 1;
    }
    // 断面上の点（局所の横・縦）と、そこの節の深さ
    const _sec = [0, 0, 0];
    function ebiSection(u, th, nz) {
        const ct = Math.cos(th), st = Math.sin(th);
        const er = ebiEnd(u);
        const sc = ebiSeamCoord(u, clamp(ct, -1, 1));
        const fr = sc - Math.floor(sc);
        const dl = Math.min(fr, 1 - fr) / EBI.segWidth;
        const seam = Math.exp(-dl * dl);
        const k = (1 - EBI.segGroove * seam) * (1 + EBI.segBulge * (1 - seam));
        const wob = 1 + EBI.wob * (nz.n3(ct * 2.2 + 3, st * 2.2 + 7, u * 5.5 + 2) - 0.5) * 2;
        const hw = EBI.wid * 0.5 * ebiProf(u, EBI.widHead, EBI.widMid, EBI.widTail) * er * k * wob;
        const hv = EBI.hgt * (st >= 0 ? (1 - EBI.bellyRatio) : EBI.bellyRatio)
            * ebiProf(u, EBI.hgtHead, EBI.hgtMid, EBI.hgtTail) * er * k * wob;
        const p = (st >= 0) ? EBI.pUp : EBI.pDn;
        _sec[0] = hw * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / p);
        _sec[1] = hv * Math.sign(st) * Math.pow(Math.abs(st), 2 / p);
        _sec[2] = seam;
        return _sec;
    }

    // --- えびの身と衣 -------------------------------------------------------
    // gB = 身 / gK = 衣 / gT = 尾
    function buildEbiten(gK, gB, gT, rng, nz, opt) {
        const N = EBI.segU, NA = EBI.segA, W = NA + 1;
        const A = opt.tail, B = opt.head;            // A = 尾のつけ根, B = 頭側の端
        const bend = opt.bend === undefined ? 0.40 : opt.bend;
        const sc = opt.scale === undefined ? 1 : opt.scale;

        const pts = new Float64Array((N + 1) * 3);
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            const b = Math.sin(Math.PI * t) * (1 - 0.55 * t) * bend;
            pts[i * 3] = mix(B[0], A[0], t);
            pts[i * 3 + 1] = mix(B[1], A[1], t) + b;
            pts[i * 3 + 2] = mix(B[2], A[2], t);
        }
        const fr = frames(pts, N + 1);
        const roll = flatRoll(fr, N + 1, 0.90, 0.05, new Rng(opt.seed || 7));

        const BP = new Float64Array((N + 1) * W * 3);
        const BN = new Float64Array((N + 1) * W * 3);
        const SEAM = new Float32Array((N + 1) * W);
        const EPS = 0.006;
        for (let i = 0; i <= N; i++) {
            const u = EPS + (1 - 2 * EPS) * i / N;
            const px = pts[i * 3], py = pts[i * 3 + 1], pz = pts[i * 3 + 2];
            const ca = Math.cos(roll[i]), sa = Math.sin(roll[i]);
            for (let j = 0; j <= NA; j++) {
                const th = -Math.PI / 2 + (j % NA) / NA * TAU;
                const s2 = ebiSection(u, th, nz);
                const lx = s2[0] * sc, ly = s2[1] * sc;
                const ox = lx * ca - ly * sa, oy = lx * sa + ly * ca;
                const k = (i * W + j) * 3;
                BP[k] = px + fr.U[i * 3] * ox + fr.V[i * 3] * oy;
                BP[k + 1] = py + fr.U[i * 3 + 1] * ox + fr.V[i * 3 + 1] * oy;
                BP[k + 2] = pz + fr.U[i * 3 + 2] * ox + fr.V[i * 3 + 2] * oy;
                SEAM[i * W + j] = s2[2];
            }
        }
        for (let i = 0; i <= N; i++) {
            for (let j = 0; j <= NA; j++) {
                const i0 = Math.max(0, i - 1), i1 = Math.min(N, i + 1);
                const j0 = (j - 1 + NA) % NA, j1 = (j + 1) % NA;
                const a = (i1 * W + j) * 3, b = (i0 * W + j) * 3;
                const c = (i * W + j1) * 3, d = (i * W + j0) * 3;
                const tx = BP[a] - BP[b], ty = BP[a + 1] - BP[b + 1], tz = BP[a + 2] - BP[b + 2];
                const sx = BP[c] - BP[d], sy = BP[c + 1] - BP[d + 1], sz = BP[c + 2] - BP[d + 2];
                let nx = ty * sz - tz * sy, ny = tz * sx - tx * sz, nzz = tx * sy - ty * sx;
                const l = Math.hypot(nx, ny, nzz) || 1;
                const k = (i * W + j) * 3;
                const rx = BP[k] - pts[i * 3], ry = BP[k + 1] - pts[i * 3 + 1], rz = BP[k + 2] - pts[i * 3 + 2];
                const sgn = (nx * rx + ny * ry + nzz * rz) < 0 ? -1 : 1;
                BN[k] = nx / l * sgn; BN[k + 1] = ny / l * sgn; BN[k + 2] = nzz / l * sgn;
            }
        }
        const WHITE = [1, 1, 1];
        const rowsB = [];
        for (let i = 0; i <= N; i++) {
            const u = i / N, row = [];
            for (let j = 0; j <= NA; j++) {
                const k = (i * W + j) * 3;
                row.push(gB.vert([BP[k], BP[k + 1], BP[k + 2]], u, j / NA, WHITE));
            }
            rowsB.push(row);
        }
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < NA; j++) face(gB, rowsB[i][j], rowsB[i + 1][j], rowsB[i + 1][j + 1], rowsB[i][j + 1]);
        }
        {   // 両端のふた。端の輪は細く絞ってあるので扇で閉じる
            const c0 = gB.vert([pts[0], pts[1], pts[2]], 0, 0.5, WHITE);
            const c1 = gB.vert([pts[N * 3], pts[N * 3 + 1], pts[N * 3 + 2]], 1, 0.5, WHITE);
            for (let j = 0; j < NA; j++) {
                gB.tri(c0, rowsB[0][j], rowsB[0][j + 1]);
                gB.tri(c1, rowsB[N][j + 1], rowsB[N][j]);
            }
        }

        const PALE = lin3(KOROMO_PALE), BASE = lin3(KOROMO_BASE), DEEP = lin3(KOROMO_DEEP);
        const hemPh = rng.range(0, 30);
        function hemT(th) { return EBI.hemTail + 0.055 * (nz.n2(Math.cos(th) * 1.7 + hemPh, Math.sin(th) * 1.7) - 0.5) * 2; }
        function hemH(th) { return EBI.hemHead + 0.045 * (nz.n2(Math.cos(th) * 1.9 + hemPh + 9, Math.sin(th) * 1.9 + 3) - 0.5) * 2; }
        const KT = new Float32Array((N + 1) * W);
        for (let i = 0; i <= N; i++) {
            const u = i / N;
            for (let j = 0; j <= NA; j++) {
                const th = -Math.PI / 2 + (j % NA) / NA * TAU;
                const h0 = hemH(th), h1 = hemT(th);
                let e = smoothstep(h0, h0 + 0.09, u) * (1 - smoothstep(h1 - 0.10, h1, u));
                if (e <= 0) { KT[i * W + j] = 0; continue; }
                const k = (i * W + j) * 3;
                const l1 = nz.fbm3(BP[k] * 1.5, BP[k + 1] * 1.5, BP[k + 2] * 1.5, 3) - 0.5;
                const l2 = nz.fbm3(BP[k] * 8.5 + 7, BP[k + 1] * 8.5, BP[k + 2] * 8.5, 2) - 0.5;
                KT[i * W + j] = EBI.koromo * sc * e * (1 + l1 * 0.75 + l2 * 1.65) + 0.015;
            }
        }
        const useK = new Uint8Array((N + 1) * W);
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < NA; j++) {
                const t0 = KT[i * W + j], t1 = KT[(i + 1) * W + j];
                const t2 = KT[(i + 1) * W + j + 1], t3 = KT[i * W + j + 1];
                if (t0 < 0.02 || t1 < 0.02 || t2 < 0.02 || t3 < 0.02) continue;
                useK[i * W + j] = useK[(i + 1) * W + j] = 1;
                useK[(i + 1) * W + j + 1] = useK[i * W + j + 1] = 1;
            }
        }
        const rowsK = [];
        for (let i = 0; i <= N; i++) {
            const row = [];
            for (let j = 0; j <= NA; j++) {
                if (!useK[i * W + j]) { row.push(-1); continue; }
                const k = (i * W + j) * 3, t = KT[i * W + j];
                const px = BP[k] + BN[k] * t, py = BP[k + 1] + BN[k + 1] * t, pz = BP[k + 2] + BN[k + 2] * t;
                const ct2 = clamp(0.74 + (t / (EBI.koromo * sc) - 1.0) * 0.28, 0.48, 0.96);
                let r, g2, b2;
                if (ct2 > 0.5) {
                    const w = (ct2 - 0.5) * 2;
                    r = mix(BASE[0], PALE[0], w); g2 = mix(BASE[1], PALE[1], w); b2 = mix(BASE[2], PALE[2], w);
                } else {
                    const w = ct2 * 2;
                    r = mix(DEEP[0], BASE[0], w); g2 = mix(DEEP[1], BASE[1], w); b2 = mix(DEEP[2], BASE[2], w);
                }
                row.push(gK.vert([px, py, pz], j / NA * 2.2, i / N * 3.2, [r, g2, b2]));
            }
            rowsK.push(row);
        }
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < NA; j++) {
                const a = rowsK[i][j], b = rowsK[i + 1][j], c = rowsK[i + 1][j + 1], d = rowsK[i][j + 1];
                if (a < 0 || b < 0 || c < 0 || d < 0) continue;
                const t0 = KT[i * W + j], t1 = KT[(i + 1) * W + j];
                const t2 = KT[(i + 1) * W + j + 1], t3 = KT[i * W + j + 1];
                if (t0 < 0.02 || t1 < 0.02 || t2 < 0.02 || t3 < 0.02) continue;
                face(gK, a, b, c, d);
            }
        }

        const NF = opt.flakes === undefined ? 300 : opt.flakes;
        for (let f = 0; f < NF; f++) {
            const i = Math.round(mix(0.035, EBI.hemTail - 0.075, rng.next()) * N);
            const j = rng.int(NA);
            if (KT[i * W + j] < 0.035) continue;
            const k = (i * W + j) * 3, t = KT[i * W + j];
            const c = [BP[k] + BN[k] * t, BP[k + 1] + BN[k + 1] * t, BP[k + 2] + BN[k + 2] * t];
            if (BN[k + 1] < -0.30) continue;
            if (opt.floorY !== undefined && c[1] < opt.floorY + 0.18) continue;
            const lf = localFrame(c, [BN[k], BN[k + 1], BN[k + 2]], [0, 1, 0]);
            const size = rng.next();
            const tint = rng.range(0.15, 0.70);
            const cBase = BASE.map((v, k) => mix(v, PALE[k], tint));
            if (size < 0.85) {
                const r = rng.range(0.060, size < 0.68 ? 0.15 : 0.22) * sc;
                blob(gK, lf, [r, r * rng.range(0.65, 1.1), r * rng.range(0.65, 1.2)], false, r * 0.14, cBase, PALE);
                if (size > 0.60) {
                    const little = localFrame(lf.at(r * 0.60, r * 0.20, r * 0.35), lf.f, lf.v);
                    blob(gK, little, [r * 0.55, r * 0.48, r * 0.60], false, 0, cBase, PALE);
                }
            } else {
                const L = rng.range(0.10, 0.24) * sc;
                const WD = rng.range(0.045, 0.11) * sc;
                crispyFlake(gK, lf, rng, WD, L, cBase, PALE);
            }
        }

        const headFrame = localFrame(B, vnorm(vsub(B, A)));
        const headColor = BASE.map((v, k) => mix(v, PALE[k], 0.60));
        const capTip = gK.vert(headFrame.at(0, 0, 0.20 * sc), 0.5, 0.5, headColor);
        for (let j = 0; j < NA; j++) {
            if (rowsK[0][j] >= 0 && rowsK[0][j + 1] >= 0)
                gK.tri(capTip, rowsK[0][j], rowsK[0][j + 1]);
        }
        blob(gK, headFrame, [0.33 * sc, 0.30 * sc, 0.20 * sc], false, 0, headColor, PALE);
        for (let q = 0; q < 12; q++) {
            const a = q / 12 * TAU;
            const dir = vnorm(vadd(vadd(vmul(headFrame.s, Math.cos(a)), vmul(headFrame.v, Math.sin(a))), vmul(headFrame.f, 0.7)));
            const lf = localFrame(headFrame.at(Math.cos(a) * 0.24 * sc, Math.sin(a) * 0.22 * sc, 0.10 * sc), dir);
            blob(gK, lf, [0.065 * sc, 0.070 * sc, 0.080 * sc], false, 0, headColor, PALE);
        }

        const T9 = vnorm([A[0] - pts[(N - 2) * 3], A[1] - pts[(N - 2) * 3 + 1],
        A[2] - pts[(N - 2) * 3 + 2]]);
        let dir = T9;
        if (opt.tailDir) {
            const want = vnorm(opt.tailDir);
            const maxA = opt.tailBend === undefined ? 0.61 : opt.tailBend;
            const dp = vdot(T9, want);
            if (dp >= Math.cos(maxA)) dir = want;
            else {
                const px = want[0] - T9[0] * dp, py = want[1] - T9[1] * dp, pz = want[2] - T9[2] * dp;
                const pl = Math.hypot(px, py, pz);
                if (pl > 1e-5) {
                    const c = Math.cos(maxA), sn = Math.sin(maxA) / pl;
                    dir = vnorm([T9[0] * c + px * sn, T9[1] * c + py * sn, T9[2] * c + pz * sn]);
                }
            }
        }
        const caN = Math.cos(roll[N]), saN = Math.sin(roll[N]);
        const lat = [fr.U[N * 3] * caN + fr.V[N * 3] * saN,
        fr.U[N * 3 + 1] * caN + fr.V[N * 3 + 1] * saN,
        fr.U[N * 3 + 2] * caN + fr.V[N * 3 + 2] * saN];
        const lfT = frameAxis(A, dir, lat);
        const NT2 = 18, NC = 12;
        function leaf(angle, len, halfW, thickness, start, side, layer, connector) {
            const d0 = Math.cos(angle), d1 = Math.sin(angle);   // 葉の伸びる向き（f, s）
            const q0 = -Math.sin(angle), q1 = Math.cos(angle);  // 幅の向き
            const rows = [];
            for (let i = 1; i < NT2; i++) {
                const t = i / NT2;
                const profile = Math.pow(Math.max(0, Math.sin(Math.PI * t)), connector ? 0.70 : 0.38)
                    * (connector ? 1 : 0.45 + 0.65 * t);
                const cf = start + d0 * len * t, cs = side + d1 * len * t;
                const cv = layer + EBI.fanCurl * t * t * sc;
                const row = [];
                for (let j = 0; j <= NC; j++) {
                    const ph = (j % NC) / NC * TAU;
                    const qq = Math.cos(ph), hh = Math.sin(ph);
                    const edge = 1 + 0.025 * Math.sin(t * 97 + angle * 12) * t * t;
                    const wd = halfW * profile * qq * edge * sc;
                    const rib = 0.010 * Math.cos(qq * 28 + t * 6) * profile * Math.abs(hh) * sc;
                    const hv = hh * (thickness * 0.5 * profile * sc + rib) + 0.025 * qq * qq * profile * sc;
                    row.push(gT.vert(lfT.at(cs * sc + q1 * wd, cv + hv, cf * sc + q0 * wd), t, j / NC, [1, 1, 1]));
                }
                rows.push(row);
            }
            const p0 = gT.vert(lfT.at(side * sc, layer, start * sc), 0, 0.5, [1, 1, 1]);
            const p1 = gT.vert(lfT.at((side + d1 * len) * sc, layer + EBI.fanCurl * sc,
                (start + d0 * len) * sc), 1, 0.5, [1, 1, 1]);
            for (let i = 0; i < rows.length - 1; i++) {
                for (let j = 0; j < NC; j++) face(gT, rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
            }
            for (let j = 0; j < NC; j++) {
                gT.tri(p0, rows[0][j], rows[0][j + 1]);
                gT.tri(p1, rows[rows.length - 1][j + 1], rows[rows.length - 1][j]);
            }
        }
        const fanStart = gT.pos.length / 3;
        leaf(0, EBI.tailSeg, 0.26, 0.20, -0.12, 0, 0, true);          // 尾節（連結）
        for (const side of [-1, 1]) {
            leaf(side * 0.45, EBI.fanLen * 0.88, EBI.fanWid * 0.55, EBI.fanTh, 0.28, side * 0.045, 0, false);
            leaf(side * 0.20, EBI.fanLen, EBI.fanWid * 0.46, EBI.fanTh, 0.28, side * 0.035, 0.025 * sc, false);
        }
        leaf(0, EBI.fanLen * 0.76, 0.12, EBI.fanTh, 0.27, 0, 0.050 * sc, false);
        return {
            top: Math.max(A[1], A[1] + dir[1] * (EBI.fanLen + EBI.tailSeg) * sc),
            dir: dir, spine: T9, tailBase: A, fanS: lfT.s, fanN: lfT.v,
            fanStart: fanStart, fanEnd: gT.pos.length / 3
        };
    }

    // --- えびの身のテクスチャ -----------------------------------------------
    // 【流用】握りのサンプルの EbiLab。u を長さ、v を断面の回りにとり、
    // 節の境目（seam）・外周（edge）・斑点（speck）の3つの場を先に焼いてから
    // アルベド / ORM / 法線に配る。3枚が同じ場を見ているので、色と凹凸と
    // つやが必ず同じ場所でそろう。
    function ebiTextures(scene, seed) {
        const S = Math.max(256, Math.round(CFG.texSize * 0.5)), s2 = S * S;
        const nz = new Noise(seed);
        const np = EBI_COL;
        const F = new Float32Array(s2 * 4);
        for (let y = 0; y < S; y++) {
            const v = y / S;
            // w は断面の横方向（節の「へ」の字を決める）、up は縦方向
            const w = Math.cos(-Math.PI / 2 + v * TAU);
            const up = Math.sin(-Math.PI / 2 + v * TAU);     // 腹 -1 〜 背 +1
            const aw = Math.abs(w);
            for (let x = 0; x < S; x++) {
                const u = x / S;
                const sc = ebiSeamCoord(u, clamp(w, -1.2, 1.2));
                const f = sc - Math.floor(sc);
                const dl = Math.min(f, 1 - f);
                // 境目そのものの細い線と、そこから片側だけへ流れる暈し
                const core = Math.exp(-Math.pow(dl / 0.048, 2)) * (1 - 0.30 * aw);
                const spread = (f < 0.5) ? 0.40 : 0.20;
                const feather = Math.exp(-Math.pow(dl / spread, 1.5));
                const st = nz.fbm2(u * 62 + 5, v * 7 + 3, 2, 0, 7);
                const cloud = nz.fbm2(u * 19 + 2, v * 31 + 8, 3, 0, 31);
                const vein = feather * (0.26 + 1.15 * smoothstep(0.18, 0.56, st)) * (0.58 + 0.65 * cloud);
                // 【改変】握りのえびは背を開いて伏せてあるので、外周（脇）が
                // いちばん赤かった。天ぷらは開かないので、赤いのは背。
                // 濃さを横方向 aw ではなく縦方向 up で配り直す。
                const edge = smoothstep(-0.30, 0.95, up) * (0.30 + 0.70 * feather);
                const midWhite = (1 - smoothstep(-1.0, -0.35, up)) * 0.40;
                const sp1 = nz.fbm2(u * 96 + 3, v * 96 + 7, 2, 0, 96);
                const sp2 = nz.fbm2(u * 30 + 9, v * 30 + 2, 2, 0, 30);
                const dot = nz.n2(u * 650, v * 650, 0, 650);
                const speck = smoothstep(0.69, 0.84, dot) * (0.35 + 0.65 * sp2)
                    + 0.17 * smoothstep(0.55, 0.82, sp1);
                const mott = nz.fbm2(u * 4 + 5, v * 4 + 1, 3, 0, 4);
                const k = (y * S + x) * 4;
                F[k] = clamp(core * 0.55 + vein * 1.85, 0, 1.6) * (1 - 0.80 * midWhite);
                F[k + 1] = edge; F[k + 2] = speck; F[k + 3] = mott;
            }
        }
        const albedo = TexLab.make("ebiA", S, scene, (d) => {
            for (let k = 0; k < s2; k++) {
                const seam = F[k * 4], edge = F[k * 4 + 1];
                const speck = F[k * 4 + 2], mott = F[k * 4 + 3];
                const t1 = clamp(seam * np.bandAmt * (0.72 + 0.5 * mott), 0, 1);
                const t2 = clamp(edge * np.edgeAmt, 0, 1);
                const t = clamp(t1 * 0.75 + t2 * 0.75 + t1 * t2 * 0.5, 0, 1.35);
                let r, g, b;
                if (t <= 1) {
                    const w2 = smoothstep(0, 1, t);
                    r = mix(np.flesh[0], np.band[0], w2);
                    g = mix(np.flesh[1], np.band[1], w2);
                    b = mix(np.flesh[2], np.band[2], w2);
                    const mid = 1 - Math.abs(t - 0.45) / 0.45;
                    if (mid > 0) {
                        r = mix(r, np.pale[0], mid * 0.35);
                        g = mix(g, np.pale[1], mid * 0.35);
                        b = mix(b, np.pale[2], mid * 0.35);
                    }
                } else {
                    const w2 = clamp(t - 1, 0, 1);
                    r = mix(np.band[0], np.deep[0], w2);
                    g = mix(np.band[1], np.deep[1], w2);
                    b = mix(np.band[2], np.deep[2], w2);
                }
                const sa = speck * np.speckAmt * (0.35 + 0.65 * clamp(t, 0, 1));
                r = mix(r, np.speck[0], sa); g = mix(g, np.speck[1], sa); b = mix(b, np.speck[2], sa);
                putRGB(d, k * 4, r, g, b);
            }
        }, {});
        const orm = TexLab.orm("ebiO", S, scene, (x, y, SS, o) => {
            const k = y * SS + x;
            const seam = F[k * 4], speck = F[k * 4 + 2], mott = F[k * 4 + 3];
            o[0] = clamp(0.99 - 0.30 * seam, 0, 1);
            o[1] = clamp(np.rough * (0.90 + 0.26 * mott) - 0.10 * seam + 0.06 * speck, 0.05, 1);
            o[2] = 0;
        }, {});
        const H = new Float32Array(s2);
        for (let k = 0; k < s2; k++) {
            H[k] = 0.5 - 0.34 * F[k * 4] + 0.05 * (F[k * 4 + 2] - 0.3) + 0.05 * (F[k * 4 + 3] - 0.5);
        }
        const normal = TexLab.normalFromHeight("ebiN", S, scene, H, 0.006, {});
        return { albedo: albedo, orm: orm, normal: normal };
    }

    // --- 尾のテクスチャ ------------------------------------------------------
    // 尾扇は付け根と鰭条の芯が濃く、膜と先が薄い。この2色の配り方だけで
    // 「殻」に見える
    function ebiTailTexture(scene, seed) {
        const S = 256;
        const nz = new Noise(seed);
        const np = EBI_COL;
        return TexLab.make("ebiTailA", S, scene, (d) => {
            for (let y = 0; y < S; y++) {
                const q = Math.cos(y / S * TAU);
                const aq = Math.abs(q);
                for (let x = 0; x < S; x++) {
                    const t = x / S;                       // 0 = 付け根, 1 = 先
                    const rib = Math.exp(-Math.pow(aq / 0.22, 2));
                    const fine = nz.fbm2(y / S * 26, t * 8, 2, 26, 0);
                    const stripe = smoothstep(0.42, 0.72, fine);
                    const dense = (1 - smoothstep(0.05, 0.85, t)) * 0.75
                        + rib * 0.55 + stripe * 0.22 - smoothstep(0.55, 1.0, aq) * 0.45;
                    const distal = smoothstep(0.65, 0.99, t) * (0.48 + 0.35 * aq);
                    const fibers = 0.10 * Math.pow(0.5 + 0.5 * Math.sin(q * 47 + t * 5), 8);
                    const k = clamp(dense * 0.65 + 0.22 + distal + fibers, 0, 1);
                    putRGB(d, (y * S + x) * 4,
                        mix(np.tailPale[0], np.tail[0], k),
                        mix(np.tailPale[1], np.tail[1], k),
                        mix(np.tailPale[2], np.tail[2], k));
                }
            }
        }, {});
    }

    // =====================================================================
    // 大葉の天ぷら
    // =====================================================================
    // 大葉は「鋸歯のある卵形」「先が尖る」「葉脈が白く抜ける」の3点で
    // 大葉に見える。天ぷらは裏だけに薄く衣がつくので、表は緑のまま、
    // 縁と裏が白い——写真もそう写っている。
    function buildShisoTen(gl, g, rng, nz, opt) {
        const NU = 70, NV = 28;
        const L = opt.len === undefined ? 7.2 : opt.len;
        const W = opt.wid === undefined ? 2.55 : opt.wid;
        const TH = 0.05;
        const lf = localFrame(opt.base, opt.fwd, opt.up || [0, 1, 0]);
        const TOP = lin3(SHISO_TOP), VEIN = lin3(SHISO_VEIN), BACK = lin3(SHISO_BACK);
        const KB = lin3(KOROMO_BASE), KP = lin3(KOROMO_PALE);
        const ph = rng.range(0, 30);

        // 半幅。u=0.40 あたりが最も広く、先は長く尖る
        const NORM = Math.pow(0.40, 0.50) * Math.pow(0.60, 0.75);
        function halfW(u) {
            if (u <= 0 || u >= 1) return 0;
            let w = Math.pow(u, 0.50) * Math.pow(1 - u, 0.75) / NORM;
            // 鋸歯。根元と先では消える
            w *= 1 + 0.11 * Math.cos(u * 92 + 1.3) * Math.sin(Math.PI * u);
            return w * W;
        }
        // 葉面の高さ（局所の上方向へのふくらみ）
        function leafY(u, vr) {
            const av = Math.abs(vr);
            let y = -0.13 * W * Math.pow(av, 1.7) + 0.035 * Math.sin(u*60+av*12);              // 縁が垂れる
            y += 0.022 * L * Math.sin(u * 5.2 + ph) * (0.3 + 0.7 * u);  // 長手のうねり
            y += 0.020 * W * Math.exp(-Math.pow(av * 7, 2));     // 主脈のふくらみ
            return y;
        }
        function vein(u, vr) {
            const av = Math.abs(vr);
            const mid = Math.exp(-Math.pow(av * 34, 2));          // 主脈
            // 側脈。主脈から斜めに出るので u - |v|*0.5 を位相に使う
            const lat = Math.pow(Math.abs(Math.cos((u - av * 0.40) * 25)), 42) * (1 - mid);
            return clamp(mid + lat * 0.8, 0, 1);
        }
        // 衣のつき方。裏から上がってきて、縁と先に多く残る
        function koromoAt(u, vr) {
            const av = Math.abs(vr);
            const n = nz.fbm2(u * 5 + 7, vr * 3 + 11, 3);
            return clamp(smoothstep(0.42, 0.80, n) * 0.55 + smoothstep(0.62, 1.0, av) * 0.85
                + smoothstep(0.80, 1.0, u) * 0.35, 0, 1);
        }

        const top = [], bot = [];
        for (let i = 0; i <= NU; i++) {
            const u = i / NU;
            const hw = halfW(u);
            const rt = [], rb = [];
            for (let j = 0; j <= NV; j++) {
                const vr = j / NV * 2 - 1;
                const ls = vr * hw;
                const y = leafY(u, vr) + vein(u, vr)*0.022;
                const ve = vein(u, vr), ko = koromoAt(u, vr);
                let cr = mix(TOP[0], VEIN[0], ve * 0.85);
                let cg = mix(TOP[1], VEIN[1], ve * 0.85);
                let cb = mix(TOP[2], VEIN[2], ve * 0.85);
                cr = mix(cr, KP[0], ko * 0.55); cg = mix(cg, KP[1], ko * 0.55); cb = mix(cb, KP[2], ko * 0.55);
                rt.push(gl.vert(lf.at(ls, y + TH, u * L), j / NV, u, [cr, cg, cb]));
                // 裏。衣が乗るので大半が衣の色
                const br = mix(BACK[0], KB[0], 0.35 + ko * 0.6);
                const bg = mix(BACK[1], KB[1], 0.35 + ko * 0.6);
                const bb = mix(BACK[2], KB[2], 0.35 + ko * 0.6);
                rb.push(gl.vert(lf.at(ls, y - TH, u * L), j / NV, u, [br, bg, bb]));
            }
            top.push(rt); bot.push(rb);
        }
        for (let i = 0; i < NU; i++) {
            for (let j = 0; j < NV; j++) {
                face(gl, top[i][j], top[i][j + 1], top[i + 1][j + 1], top[i + 1][j]);
                face(gl, bot[i][j], bot[i + 1][j], bot[i + 1][j + 1], bot[i][j + 1]);
            }
            // 縁を閉じる（薄い板の小口）
            face(gl, top[i][0], top[i + 1][0], bot[i + 1][0], bot[i][0]);
            face(gl, top[i][NV], bot[i][NV], bot[i + 1][NV], top[i + 1][NV]);
        }

        // 縁に残った衣の粒。板の輪郭が滑らかだと「緑の紙」に見える
        const NK = opt.flakes === undefined ? 22 : opt.flakes;
        for (let k = 0; k < NK; k++) {
            const u = rng.range(0.06, 0.97);
            const side = rng.next() < 0.5 ? -1 : 1;
            const hw = halfW(u);
            if (hw < 0.05) continue;
            const vr = side * rng.range(0.72, 1.0);
            const c = lf.at(vr * hw, leafY(u, vr) + rng.pm(0.04), u * L);
            const rad = rng.range(0.09, 0.22);
            blob(g, localFrame(c, [0, 1, 0], [0, 0, 1]), [rad, rad, rad * 0.62], false, 0, KP, KB);
        }
        return { tip: lf.at(0, leafY(1, 0) + TH, L) };
    }

    // =====================================================================
    // 椎茸（飾り切り）
    // =====================================================================
    // 傘の上に六方の切り込みを入れ、そこだけ果肉の白が出る。
    // 【対策】溝を「色だけ」で描くと平らなシールになる。必ず頂点を沈めて、
    // 溝の壁に当たる面をいっしょに作ること。ハイライトが割れて溝になる。
    function buildShiitake(g, rng, nz, opt) {
        const NA = 144, NR = 44;
        const R = opt.r === undefined ? 1.95 : opt.r;
        const Hc = opt.h === undefined ? 1.05 : opt.h;
        const lf = localFrame(opt.at, [0, 0, 1], [0, 1, 0]);
        const CAP = lin3(SHIITAKE_CAP), EDGE = lin3(SHIITAKE_EDGE);
        const CUT = lin3(SHIITAKE_CUT), GILL = lin3(SHIITAKE_GILL);
        const ph = rng.range(0, 20);
        const rays = 6, rot = opt.rot === undefined ? 0.4 : opt.rot;
        const cutIn = 0, cutOut = 0.77 * R, cutW = 0.15, cutD = 0.19;

        // 点 (x,z) から6本の切り込み線までの距離
        function cutDist(x, z) {
            const rr = Math.hypot(x, z);
            if (rr < 1e-6) return 0;
            let a = Math.atan2(z, x) - rot;
            const step = TAU / rays;
            a = a - Math.round(a / step) * step;       // 最寄りの光線との角度差
            // 線分 [cutIn, cutOut] への距離
            const along = rr * Math.cos(a), perp = Math.abs(rr * Math.sin(a));
            if (along < cutIn) return Math.hypot(along - cutIn, perp);
            if (along > cutOut) return Math.hypot(along - cutOut, perp);
            return perp / Math.max(0.12, 1 - along / (cutOut * 1.08));
        }
        function capY(rr) {
            const u = clamp(rr / R, 0, 1);
            // 傘のドーム。縁の 12% は下へ巻き込む
            const dome = Hc * Math.pow(1 - u * u, 0.62);
            const curl = smoothstep(0.86, 1.0, u) * Hc * 0.55;
            return dome - curl;
        }

        const rows = [];
        // 【対策】中心の輪を半径 0 で作ると頂点が全部重なり、法線が 0 の
        // 頂点ができて傘のてっぺんだけ真っ黒になる。中心は扇で塞ぐ
        for (let i = 0; i <= NR; i++) {
            const rr = R * Math.pow((i + 0.45) / (NR + 0.45), 0.85);
            const row = [];
            for (let j = 0; j <= NA; j++) {
                const th = (j % NA) / NA * TAU;
                const x = Math.cos(th) * rr, z = Math.sin(th) * rr;
                // 傘の凹凸（ひび割れではなく、ゆるいうねり）
                const bump = (nz.fbm2(x * 1.6 + ph, z * 1.6, 3) - 0.5) * 0.14;
                const cd = cutDist(x, z);
                const inCut = 1 - smoothstep(cutW * 0.55, cutW, cd);
                let y = capY(rr) + bump - cutD * inCut;
                // 色。傘は濃い茶、縁と切り口が明るい
                const mott = nz.fbm2(x * 2.4 + 5, z * 2.4 + 9, 3);
                let cr = mix(CAP[0], EDGE[0], clamp(mott * 0.9 + smoothstep(0.7, 1.0, rr / R) * 0.5, 0, 1));
                let cg = mix(CAP[1], EDGE[1], clamp(mott * 0.9 + smoothstep(0.7, 1.0, rr / R) * 0.5, 0, 1));
                let cb = mix(CAP[2], EDGE[2], clamp(mott * 0.9 + smoothstep(0.7, 1.0, rr / R) * 0.5, 0, 1));
                if (inCut > 0) {
                    const w = inCut * inCut;
                    cr = mix(cr, CUT[0], w); cg = mix(cg, CUT[1], w); cb = mix(cb, CUT[2], w);
                }
                row.push(g.vert(lf.at(x, y, z), j / NA, i / NR, [cr, cg, cb]));
            }
            rows.push(row);
        }
        for (let i = 0; i < NR; i++) {
            for (let j = 0; j < NA; j++) face(g, rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
        }
        {
            const c0 = g.vert(lf.at(0, capY(0) + (nz.fbm2(ph, ph, 3) - 0.5) * 0.14, 0), 0.5, 0, CAP);
            for (let j = 0; j < NA; j++) g.tri(c0, rows[0][j], rows[0][j + 1]);
        }
        // 裏（ひだ）。ほとんど見えないが、輪郭が閉じていないと影が抜ける
        const botY = capY(R) - 0.30;
        const bot = [];
        for (let i = 0; i <= 4; i++) {
            const rr = R * (1 - i / 4 * 0.88) * 0.99;
            const row = [];
            for (let j = 0; j <= NA; j++) {
                const th = (j % NA) / NA * TAU;
                // ひだの筋。半径方向の細かい濃淡で出す
                const gl2 = 0.78 + 0.22 * Math.cos(th * 46);
                row.push(g.vert(lf.at(Math.cos(th) * rr, botY + (1 - rr / R) * 0.18, Math.sin(th) * rr),
                    j / NA, 1 - i / 4, [GILL[0] * gl2, GILL[1] * gl2, GILL[2] * gl2]));
            }
            bot.push(row);
        }
        for (let j = 0; j < NA; j++) face(g, rows[NR][j], bot[0][j], bot[0][j + 1], rows[NR][j + 1]);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < NA; j++) face(g, bot[i][j], bot[i + 1][j], bot[i + 1][j + 1], bot[i][j + 1]);
        }
        {
            const bc = g.vert(lf.at(0, botY + 0.18, 0), 0.5, 0, GILL);
            for (let j = 0; j < NA; j++) g.tri(bc, bot[4][j + 1], bot[4][j]);
        }
        return { top: opt.at[1] + capY(0) };
    }

    // =================================================================
    // 12. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.042, 0.040, 0.036, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.50;
    // ぼかしすぎるとハイライトのコントラストが消えて「艶消しの何か」になる
    env.lodGenerationOffset = 0.20;

    const waterR = innerRAt(BROTH_Y);

    // 【対策】広角で寄ると、手前の箸が器より 13% 大きく写り、実寸どおりでも
    // 「箸が長すぎる」絵になる。料理写真は 85〜100mm 相当の望遠で撮る。
    // 距離を伸ばして fov を絞れば、写る範囲は同じまま遠近だけが寝る。
    const camera = new BABYLON.ArcRotateCamera("cam", -1.98, 0.88, 62, new V3(0, 5.0, 0.2), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 3.5;
    camera.fov = 0.32;
    // 【対策】ポストプロセスを通すとシーンは深度つきの RT へ描かれる。
    // maxZ 既定(10000) のままだと深度の分解能が足りず、つゆ面と麺の前後が
    // 勝ったり負けたりしてちらつく
    camera.minZ = 10.0;
    camera.maxZ = 300;
    camera.lowerRadiusLimit = 26;
    camera.upperRadiusLimit = 190;
    camera.upperBetaLimit = 1.52;          // 卓の下へ潜らせない
    scene.cameraToUseForPointers = camera;

    // ---- 灯: キー / キック / 環境 ----------------------------------------
    const key = new BABYLON.DirectionalLight("key", new V3(-0.38, -0.96, 0.44).normalize(), scene);
    key.position = new V3(16, 34, -18);
    key.intensity = 2.65;
    key.diffuse = new BABYLON.Color3(1.0, 0.978, 0.945);
    // 【対策】平行光の影の範囲は既定だとキャスターの AABB にぴったり合う。
    // 影の落ちる先（クロス）が範囲外になって直線でぶつ切りになる
    key.autoUpdateExtends = false;
    key.orthoLeft = -24; key.orthoRight = 24;
    key.orthoBottom = -24; key.orthoTop = 24;
    key.shadowMinZ = 1; key.shadowMaxZ = 90;

    // 【対策】平行光のハイライトは1点しか出ない。麺は1本ごとに稜線へ長く
    // 走る照りが命なので、拡散をほぼ 0 にして鏡面だけ足す灯を必ず1つ足す
    const kick = new BABYLON.DirectionalLight("kick", new V3(0.62, -0.34, -1.0).normalize(), scene);
    kick.intensity = 0.72;
    kick.diffuse = new BABYLON.Color3(0.055, 0.052, 0.048);
    kick.specular = new BABYLON.Color3(1.0, 0.97, 0.92);

    const fill = new BABYLON.HemisphericLight("fill", new V3(-0.25, 1, -0.30), scene);
    fill.intensity = 0.25;
    fill.diffuse = new BABYLON.Color3(0.97, 0.975, 1.0);
    fill.groundColor = new BABYLON.Color3(0.36, 0.33, 0.29);
    fill.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    // 【対策】ESM は柔らかいが depthScale を詰めないと痣（シャドウアクネ）が
    // 出る。cm スケールの食べ物では PCF に落としたほうが早くきれい
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0032;
    sg.normalBias = 0.010;
    sg.setDarkness(0.20);

    // ---- 卓（麻のクロス）--------------------------------------------------
    const clothTex = clothTextures(scene, 4517);
    const cloth = BABYLON.MeshBuilder.CreateGround("cloth", { width: 220, height: 220 }, scene);
    named(cloth, "cloth");
    const clothMat = new BABYLON.PBRMaterial("clothMat", scene);
    clothMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    clothMat.albedoTexture = clothTex.albedo;
    clothMat.metallic = 0.0; clothMat.roughness = 1.0;
    clothMat.metallicTexture = clothTex.orm;
    clothMat.useAmbientOcclusionFromMetallicTextureRed = true;
    clothMat.useRoughnessFromMetallicTextureGreen = true;
    clothMat.useMetallnessFromMetallicTextureBlue = true;
    clothMat.bumpTexture = clothTex.normal;
    clothMat.bumpTexture.level = 0.35;
    for (const t of [clothTex.albedo, clothTex.orm, clothTex.normal]) { t.uScale = 80; t.vScale = 80; }
    cloth.material = clothMat;
    cloth.receiveShadows = true;

    // ---- 箸と箸置き --------------------------------------------------------
    const sundryRng = new Rng(0x7A11CE);
    const woodTex = woodTextures(scene, 3331, {
        base: [0.575, 0.405, 0.238], grain: [0.352, 0.208, 0.108],
        rings: 26, wave: 1.4, rough: 0.34
    });
    const woodMat = new BABYLON.PBRMaterial("woodMat", scene);
    woodMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    woodMat.albedoTexture = woodTex.albedo;
    woodMat.metallic = 0.0; woodMat.roughness = 1.0;
    woodMat.metallicTexture = woodTex.orm;
    woodMat.useRoughnessFromMetallicTextureGreen = true;
    woodMat.bumpTexture = woodTex.normal;
    woodMat.bumpTexture.level = 0.45;
    woodMat.clearCoat.isEnabled = true;
    woodMat.clearCoat.intensity = 0.55;
    woodMat.clearCoat.roughness = 0.24;

    // 【対策】箸置きは「箸先の側」を持ち上げる道具。先が箸置きより外へ
    // はみ出して宙に浮き、手元だけが卓に着く。逆にすると「先を卓へ
    // 突き立てて手元を浮かせた」妙な置き方になる。
    const CHOP_LEN = 22.5, CHOP_R = 0.255;
    const restW = 4.10, restD = 1.70, restH = 1.35, restDip = 0.44;
    const restPos = [10.6, restH * 0.5, 2.4];
    const restYawBase = -0.38;
    const contact = [restPos[0], restH - restDip + 0.16, restPos[2]];
    // 手元は画面の手前（+z）側。箸は器と平行に近い角度で置く
    const awayXZ = [Math.sin(restYawBase + Math.PI * 0.5) * 0.28 + 0.10, 0, 0.99];
    {
        const l = Math.hypot(awayXZ[0], awayXZ[2]); awayXZ[0] /= l; awayXZ[2] /= l;
    }
    const buttY = CHOP_R * 1.30;
    const OVERHANG = CHOP_LEN * 0.145;
    const dropY = contact[1] - buttY;
    const runXZ = Math.sqrt(Math.max(0, Math.pow(CHOP_LEN - OVERHANG, 2) - dropY * dropY));
    const butt = [contact[0] + awayXZ[0] * runXZ, buttY, contact[2] + awayXZ[2] * runXZ];
    const dirV = vnorm(vsub(butt, contact));
    const dlen = vlen(vsub(butt, contact));
    const tip = vsub(contact, vmul(dirV, CHOP_LEN - dlen));
    const perp = vnorm(vcross(dirV, [0, 1, 0]));
    const WOODC = lin3([0.62, 0.45, 0.28]);
    const chopsticks = [];
    for (let i = 0; i < 2; i++) {
        // 【対策】実物の箸は2本がほぼ接して1本の帯に見える。中心間を
        // 0.66cm も空けると「細い棒が2本離れて置いてある」絵になる
        const o = vmul(perp, (i === 0 ? -1 : 1) * 0.30);
        const c = buildChopstick(scene, "chopstick", sundryRng,
            vadd(butt, o), vadd(tip, vmul(o, 0.8)), WOODC);
        c.material = woodMat;
        c.receiveShadows = true;
        chopsticks.push(c);
    }
    const rest = buildRest(scene, restW, restH, restD, 0.15, restDip, restPos,
        Math.atan2(-perp[2], perp[0]), WOODC);
    rest.material = woodMat;
    rest.receiveShadows = true;
    const sundry = chopsticks.concat([rest]);
    for (const m of sundry) sg.addShadowCaster(m, true);

    // ---- 湯気 --------------------------------------------------------------
    const steamTex = (() => {
        const dt = new BABYLON.DynamicTexture("steamTex", { width: 128, height: 128 }, scene, true);
        const ctx = dt.getContext();
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0.0, "rgba(255,255,255,1)");
        g.addColorStop(0.45, "rgba(255,255,255,0.40)");
        g.addColorStop(1.0, "rgba(255,255,255,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
        dt.update(); dt.hasAlpha = true;
        return dt;
    })();
    const steam = new BABYLON.ParticleSystem("steam", 600, scene);
    steam.particleTexture = steamTex;
    steam.emitter = new V3(0, MOUND_TOP + 0.3, 0);
    steam.minEmitBox = new V3(-2.8, -0.3, -2.8);
    steam.maxEmitBox = new V3(2.8, 0.3, 2.8);
    // 【対策】加算合成にすると湯気が発光して見える。湯気は光っていない
    steam.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    steam.color1 = new BABYLON.Color4(1, 1, 1, 0.048);
    steam.color2 = new BABYLON.Color4(0.95, 0.95, 0.96, 0.022);
    steam.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    steam.minSize = 1.1; steam.maxSize = 3.6;
    steam.minLifeTime = 2.2; steam.maxLifeTime = 4.2;
    steam.emitRate = 120;
    steam.gravity = new V3(0.30, 1.5, 0);
    steam.direction1 = new V3(-0.35, 1.6, -0.35);
    steam.direction2 = new V3(0.45, 2.8, 0.35);
    steam.minAngularSpeed = -0.45; steam.maxAngularSpeed = 0.45;
    steam.minEmitPower = 0.35; steam.maxEmitPower = 1.0;
    steam.updateSpeed = 0.012;

    // =================================================================
    //  組み立て / 差し替え
    // =================================================================
    const bowlMatCache = {};
    const menTexCache = {};
    const menMatCache = {};
    let state = null, onRebuilt = null, ssao = null;
    let chopOn = CFG.chopsticks;
    const live = { turbidity: CFG.turbidity, trans: 1.0, ripple: 1.0, wet: 1.0 };

    function getBowlMat(k) {
        if (!bowlMatCache[k]) bowlMatCache[k] = bowlMaterial(scene, UTSUWA[k], "bowlMat_" + k, 7001 + k.length * 131);
        return bowlMatCache[k];
    }
    function getMenMat(k) {
        if (!menMatCache[k]) {
            menTexCache[k] = noodleTextures(scene, MEN[k], 2203 + k.length * 97);
            menMatCache[k] = noodleMaterial(scene, MEN[k], menTexCache[k], "menMat_" + k);
        }
        return menMatCache[k];
    }

    function disposeBroth(st) {
        if (!st) return;
        if (st.broth) { st.broth.dispose(); st.broth = null; }
        if (st.brothMat) { st.brothMat.dispose(true, false); st.brothMat = null; }
        if (st.brothTex) { for (const k in st.brothTex) st.brothTex[k].dispose(); st.brothTex = null; }
    }
    function disposeFood(st) {
        if (!st) return;
        if (st.noodles) { st.noodles.dispose(); st.noodles = null; }
        if (st.negi) { st.negi.dispose(); st.negi = null; }
        for (const k of ["koromo", "ebiBody", "ebiTail", "shiso", "shiitake"]) {
            if (st[k]) { st[k].dispose(); st[k] = null; }
        }
    }

    // ---- 具の置き場所 ----------------------------------------------------
    // 【対策】具を「器の北」に並べても、カメラの方位（alpha）を変えた瞬間に
    // 全部が背中を向く。カメラから見た奥 VF と右 VR の2本で置く。
    // alpha = -1.98 なのでカメラは (-0.32, -0.73) の側にいる。
    const VF = [Math.cos(camera.alpha + Math.PI), Math.sin(camera.alpha + Math.PI)];
    const VR = [VF[1], -VF[0]];
    function spot(f, r) { return [VF[0] * f + VR[0] * r, VF[1] * f + VR[1] * r]; }
    function onMound(f, r, dy) {
        const p = spot(f, r);
        const rad = Math.hypot(p[0], p[1]);
        return [p[0], Math.max(BROTH_Y - 0.25, moundTopAt(rad)) + (dy || 0), p[1]];
    }

    // ---- 箸でそばをつかむ ------------------------------------------------
    // 【対策】持ち上げた束を「箸の先に生えた別のメッシュ」として作ると、
    // 山のそばと色も太さも揃わず、合成写真のように浮く。束も山と同じ
    // 芯線 → 掃引の経路に載せて、1枚のメッシュに焼き込む。
    //
    // 【対策】持ち上げた束は最上点バッファ（SubmergeMap）へ入れてはいけない。
    // あれは「つゆ越しに透けて見える物」を焼くための物なので、宙にある束を
    // 入れると、つゆ面に束の影絵が麺色で描かれて水面に貼りついて見える。
    const LIFT = {
        grip: [-1.85, 1.85],  // つかむ位置（カメラから見た 奥, 右）[cm]
                              // 天ぷらは奥に寄せてあるので、束は手前右へ垂らす
        gripY: 11.40,         // つかむ高さ（口縁 8.0 の 3.4cm 上）
        dir: [-0.18, 0.92, 0.26], // 箸の向き（奥, 右, 上）。手元側を指す
        tipOut: 2.00,         // つかむ点から箸先までの長さ
        gap: 0.31,            // 上下の箸の間隔（半分）。折り返しがちょうど収まる
        strands: 13,          // つまむ本数（1本が折り返すので垂れは倍）
        spread: 0.50,         // 束の幅（箸に沿う向き）[cm]
        thick: 0.30,          // 束の厚み（箸に直交する水平向き）[cm]
        fold: 0.17,           // 折り返しの半径（＝垂れる2本の間隔の半分）
        twist: 0.90,          // 垂れのねじれ [rad]
        fan: 1.05             // 垂れた下端の広がり
    };

    function liftBasis() {
        const g = spot(LIFT.grip[0], LIFT.grip[1]);
        const G = [g[0], LIFT.gripY, g[1]];
        const ax = vnorm([VF[0] * LIFT.dir[0] + VR[0] * LIFT.dir[1], LIFT.dir[2],
        VF[1] * LIFT.dir[0] + VR[1] * LIFT.dir[1]]);
        const side = vnorm(vcross(ax, [0, 1, 0]));   // 水平で箸に直交
        const up = vnorm(vcross(side, ax));          // 箸に直交して上向き
        return { G: G, ax: ax, side: side, up: up };
    }

    // Catmull-Rom を細かく刻んでから弧長で取り直す。
    // 【対策】制御点をそのまま芯線にすると、節の長さがばらついて
    // 掃引の断面が伸び縮みする。必ず等間隔に取り直す
    function samplePath(ctrl, ds) {
        const P = [ctrl[0]].concat(ctrl, [ctrl[ctrl.length - 1]]);
        const fine = [];
        for (let i = 0; i < P.length - 3; i++) {
            const p0 = P[i], p1 = P[i + 1], p2 = P[i + 2], p3 = P[i + 3];
            for (let k = 0; k < 24; k++) {
                const u = k / 24, u2 = u * u, u3 = u2 * u, q = [0, 0, 0];
                for (let c = 0; c < 3; c++) {
                    q[c] = 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * u
                        + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u2
                        + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u3);
                }
                fine.push(q);
            }
        }
        fine.push(P[P.length - 2]);
        const arc = [0];
        let total = 0;
        for (let i = 1; i < fine.length; i++) {
            total += Math.hypot(fine[i][0] - fine[i - 1][0],
                fine[i][1] - fine[i - 1][1], fine[i][2] - fine[i - 1][2]);
            arc.push(total);
        }
        const n = Math.max(6, Math.round(total / ds));
        const pts = new Float64Array((n + 1) * 3);
        let j = 0;
        for (let i = 0; i <= n; i++) {
            const want = total * i / n;
            while (j < arc.length - 2 && arc[j + 1] < want) j++;
            const d = arc[j + 1] - arc[j];
            const u = d > 1e-9 ? (want - arc[j]) / d : 0;
            for (let c = 0; c < 3; c++) pts[i * 3 + c] = fine[j][c] + (fine[j + 1][c] - fine[j][c]) * u;
        }
        return { pts: pts, n: n + 1 };
    }

    // 1本のそばを中ほどでつまみ、箸の上で折り返して両側を垂らす。
    // 【対策】つまんだ所で芯線を切ると、箸の下から短い麺が生えているだけの
    // 絵になり「そばが切れている」ように見える。実物は折り返して両側が
    // 垂れるので、芯線も「垂れ → 折り返し → 垂れ」の1本につなぐ。
    // 【対策】折り返しの半径は 2mm しかない。芯線の刻みが 2.8mm のままだと
    // 折り返しに 2 点しか乗らず、カクッと折れた針金になる。束だけ刻みを細かく取る
    function liftStrands(men, seed) {
        const B = liftBasis();
        const rng = new Rng((seed ^ 0x11F7A3) >>> 0);
        // 水平の相対位置（奥 df, 右 dr）→ ワールド。
        // 【対策】等方に広げると、シードによっては下端が奥（天ぷら）や
        // 丼の中央（えびの胴）へ垂れかかって衣を突き抜ける。
        // 食べ物のある側だけ広がりを絞り、手前右へ逃がす
        const off = (df, dr) => {
            const f = df > 0 ? df * 0.25 : df;
            const r = dr < 0 ? dr * 0.45 : dr;
            return [VF[0] * f + VR[0] * r, 0, VF[1] * f + VR[1] * r];
        };
        const out = [];
        const N = Math.max(0, Math.round(LIFT.strands));
        const ds = Math.min(men.seg, 0.15);
        for (let i = 0; i < N; i++) {
            const t = (N > 1 ? i / (N - 1) : 0.5) - 0.5;
            // つまむ点。箸の間は薄いので、箸に沿って並び厚み方向には散らない
            const P = vadd(vadd(B.G, vmul(B.ax, t * LIFT.spread * 2 + rng.pm(0.09))),
                vadd(vmul(B.side, rng.pm(LIFT.thick * 0.5)), vmul(B.up, rng.pm(0.04))));
            const a0 = rng.range(0, TAU);
            const legs = [];
            for (let k = 0; k < 2; k++) {
                // 折り返しの両足。箸に直交する向き（手前と奥）へ分かれる
                const S = vadd(P, vmul(B.side, (k ? -1 : 1) * LIFT.fold));
                const ang = a0 + (k ? Math.PI : 0) + rng.pm(0.7);
                const tw = rng.pm(1) * LIFT.twist;
                const rE = LIFT.fan * rng.range(0.30, 1.0);
                const eo = off(Math.cos(ang + tw) * rE, Math.sin(ang + tw) * rE);
                const ex = S[0] + eo[0], ez = S[2] + eo[2];
                // 下端。だいたいは山へ差し込むが、2割ほどは途中で切れて先が丸まる
                const short = rng.next() < 0.20;
                const mound = moundTopAt(Math.hypot(ex, ez));
                const eY = short ? mound + rng.range(0.25, 1.10)
                    : Math.max(BROTH_Y - 0.45, mound - rng.range(0.10, 0.80));
                const hang = Math.max(0.8, S[1] - eY);
                // 【対策】制御点を等間隔・同じ半径で置くと、ねじれても「編んだ籠」に
                // なる。半径と角度に別々の乱れを入れて、1本ずつ波打たせる
                const ring = (frac, rad, a) => {
                    const o = off(Math.cos(a) * rad, Math.sin(a) * rad);
                    return [S[0] + o[0] + rng.pm(0.10), S[1] - hang * frac, S[2] + o[2] + rng.pm(0.10)];
                };
                const leg = [S,
                    ring(0.26, rE * 0.16 + 0.04, ang + tw * 0.26),
                    ring(0.52, rE * 0.38, ang + tw * 0.52 + rng.pm(0.5)),
                    ring(0.76, rE * 0.66, ang + tw * 0.76),
                    ring(0.92, rE * 0.88, ang + tw * 0.92 + rng.pm(0.4)),
                    [ex, eY, ez]];
                // 切れた先は自重で内へ丸まる
                if (short) leg.push([ex + (S[0] - ex) * 0.28 + rng.pm(0.1),
                eY - rng.range(0.15, 0.45), ez + (S[2] - ez) * 0.28 + rng.pm(0.1)]);
                legs.push(leg);
            }
            // 片側を逆順に並べ、箸の上の折り返しを挟んでもう片側へつなぐ
            // 折り返しの頂は箸の間に収める。世界の真上ではなく、箸に直交する
            // 向き（B.up）へ少しだけ逃がす。持ち上げすぎると上の箸を突き抜ける
            const apex = vadd(P, vmul(B.up, LIFT.fold * 0.28));
            const ctrl = legs[0].slice().reverse().concat([apex], legs[1]);
            const path = samplePath(ctrl, ds);
            path.tone = rng.pm(1.0);
            path.roll = rng.range(0, TAU);
            path.off = 4096 + i * 53;      // flatRoll のシードに使われる
            path.lift = true;
            out.push(path);
        }
        return out;
    }

    let liftChop = null;
    function ensureLiftChopsticks() {
        if (liftChop) return liftChop;
        const B = liftBasis();
        const rng = new Rng(0x515F7);
        liftChop = [];
        for (let i = 0; i < 2; i++) {
            const o = vmul(B.up, (i === 0 ? 1 : -1) * LIFT.gap);
            const tip = vadd(vadd(B.G, vmul(B.ax, -LIFT.tipOut)), o);
            const butt = vadd(vadd(B.G, vmul(B.ax, CHOP_LEN - LIFT.tipOut)), vmul(o, 1.35));
            const c = buildChopstick(scene, "chopstickLift", rng, butt, tip, WOODC);
            c.material = woodMat;
            c.receiveShadows = true;
            sg.addShadowCaster(c, true);
            liftChop.push(c);
        }
        return liftChop;
    }

    // 箸の置き方。持ち上げているときは卓の箸を消し、箸置きだけ残す
    function applyChopsticks() {
        for (const m of sundry) m.setEnabled(chopOn && !CFG.lift);
        rest.setEnabled(chopOn);
        if (chopOn && CFG.lift) { for (const m of ensureLiftChopsticks()) m.setEnabled(true); }
        else if (liftChop) { for (const m of liftChop) m.setEnabled(false); }
    }

    // 束だけを作り直す。山は据え置きなので緩和をやり直さずに済む
    function rebuildNoodles() {
        if (!state || !state.strands) return;
        if (state.noodles) { state.noodles.dispose(); state.noodles = null; }
        const men = MEN[CFG.men];
        const lifted = (CFG.lift && chopOn) ? liftStrands(men, CFG.seed) : [];
        const m = buildNoodles(scene, state.strands.concat(lifted), men, CFG.seed, MOUND_BOT - 1.0);
        if (m) {
            m.material = getMenMat(CFG.men);
            m.receiveShadows = true;
            sg.addShadowCaster(m, true);
        }
        state.noodles = m;
        updateSubmergedNoodles();
        applyChopsticks();
    }

    // 麺を撒いて落とし、沈んだ輪郭を焼くところまで
    function buildFood(menKey, seed) {
        const men = MEN[menKey];
        const t0 = performance.now();
        const made = makeStrands(men, seed);
        const info = relaxStrands(made.strands, men, { steps: CFG.relaxSteps, iters: 4 });
        const t1 = performance.now();

        // 持ち上げた束は山と同じメッシュへ載せる（材質も色も揃う）
        const lifted = (CFG.lift && chopOn) ? liftStrands(men, seed) : [];
        const noodles = buildNoodles(scene, made.strands.concat(lifted), men, seed, MOUND_BOT - 1.0);
        if (noodles) {
            noodles.material = getMenMat(menKey);
            noodles.receiveShadows = true;
            sg.addShadowCaster(noodles, true);
        }
        const t2 = performance.now();

        // 上から見た最上点バッファ。麺は芯線から直接焼く（メッシュを持たない
        // 完全に沈んだ麺も、ここには正しく写る）
        const half = waterR + 0.35;
        const mp = new SubmergeMap(Math.round(CFG.texSize * 0.75), half);
        const col = lin3(men.col.base);
        for (const s of made.strands) {
            mp.addStrand(s, men.w * 0.5, men.h * 0.5, [col[0] * (1 + s.tone * 0.05), col[1] * (1 + s.tone * 0.05), col[2] * (1 + s.tone * 0.05)]);
        }
        let negi = null;
        if (CFG.negi) {
            negi = buildNegi(scene, 38, seed ^ 0x3C3C);
            if (negi) {
                negi.material = getNegiMat();
                negi.receiveShadows = true;
                sg.addShadowCaster(negi, true);
                mp.addMesh(negi);
            }
        }
        // ---- 天ぷらと具 --------------------------------------------------
        // 【対策】具は必ず最上点バッファへも焼くこと。焼かないと、つゆに
        // 浸かった衣の裾がつゆ面にまったく写らず、具だけが水面に貼りついた
        // シールに見える。
        const rngT = new Rng(seed ^ 0x7E4A);
        const nzT = new Noise(seed ^ 0x2F71);
        const gK = new Geo(), gT = new Geo(), gL = new Geo(), gS = new Geo(), gB = new Geo();
        let anyK = false, anyT = false;

        const nEbi = clamp(Math.round(CFG.ebi), 0, 3);
        // 【対策】身の設計長が 6.30 → 8.50cm になったので、s で丼に合わせる。
        // 0.84（身 7.14cm）が、口径 15cm の丼でぎりぎり内壁に触れない上限。
        // これ以上伸ばすと頭が見込みを突き抜ける（実測のすき間 0.22cm）。
        // 尾のつけ根を外（f を大きく）へ動かすと、そのぶん頭に余裕ができる。
        // d は [奥行き, 左右, 上下]。d[2] を深くすると頭がつゆに潜る
        const EBI_POS = [
            { A: onMound(1.95, -0.55, 0.62), d: [-0.88, -0.36, -0.14], up: [0.65, 0.65, 0.05], s: 0.84 },
            { A: onMound(2.50, 1.85, 0.92), d: [-0.88, -0.36, -0.14], up: [0.62, 0.72, 0.24], s: 0.80 },
            { A: onMound(1.70, 0.00, 2.70), d: [-0.88, -0.20, -0.18], up: [0.18, 1.32, 0.40], s: 0.74 }
        ];
        for (let i = 0; i < nEbi; i++) {
            const e = EBI_POS[i];
            const dw = vnorm([VF[0] * e.d[0] + VR[0] * e.d[1], e.d[2], VF[1] * e.d[0] + VR[1] * e.d[1]]);
            const L = EBI.len * e.s;
            const B = [e.A[0] + dw[0] * L, e.A[1] + dw[1] * L, e.A[2] + dw[2] * L];
            const td = [VF[0] * e.up[0] + VR[0] * e.up[2], e.up[1], VF[1] * e.up[0] + VR[1] * e.up[2]];
            buildEbiten(gK, gB, gT, rngT, nzT, {
                tail: e.A, head: B, scale: e.s, tailDir: td, tailBend: 0.72,
                // つゆ面より下には花を生やさない。汁の中に衣の粒が浮くと嘘になる
                floorY: BROTH_Y - 0.10,
                bend: 0.25, flakes: 850, seed: seed ^ (i * 7919)
            });
            anyK = anyT = true;
        }
        let shisoInfo = null;
        if (CFG.shiso) {
            const base = onMound(1.00, -2.45, -0.13);
            const fw = [VF[0] * 0.45 - VR[0] * 0.25, 0.78, VF[1] * 0.45 - VR[1] * 0.25];
            shisoInfo = buildShisoTen(gL, gK, rngT, nzT, { base: base, fwd: fw, len: 4.8, wid: 1.85, flakes: 30 });
            anyK = true;
        }
        if (CFG.shiitake) {
            // 【対策】具を器の広い所（手前）に置くと、必ずえびの胴と重なる。
            // 口径 15cm の丼に 6cm のえびを2本入れると、残るのは縁沿いの
            // 三日月形の場所だけ。椎茸はそこへ、つゆに半分沈めて置く。
            buildShiitake(gS, rngT, nzT, { at: onMound(-0.50, 3.35, -0.35), r: 1.60, h: 0.88, rot: 0.35 });
        }

        function toTopping(g2, name, mat, ref) {
            if (!g2.idx.length) return null;
            const geo = g2.finish(null);
            const m = toMesh(name, geo, scene);
            m.tris = geo.indices.length / 3;
            m.material = mat;
            m.receiveShadows = name !== "koromo";
            sg.addShadowCaster(m, true);
            mp.addMesh(m);
            return m;
        }
        const koromo = anyK ? toTopping(gK, "koromo", getKoromoMat()) : null;
        const ebiBody = anyT ? toTopping(gB, "ebiBody", getEbiBodyMat()) : null;
        const ebiTail = anyT ? toTopping(gT, "ebiTail", getEbiMat()) : null;
        const shiso = CFG.shiso ? toTopping(gL, "shiso", getShisoMat()) : null;
        const shiitake = CFG.shiitake ? toTopping(gS, "shiitake", getShiitakeMat()) : null;

        mp.buildDistance(BROTH_Y);
        const t3 = performance.now();

        const F = brothFields(mp, TSUYU[CFG.tsuyu], waterR, seed ^ 0x1B0A);
        const t4 = performance.now();
        return {
            noodles: noodles, negi: negi, mp: mp, F: F,
            koromo: koromo, ebiBody: ebiBody, ebiTail: ebiTail, shiso: shiso, shiitake: shiitake,
            shisoInfo: shisoInfo,
            strands: made.strands, totalLen: made.totalLen, relax: info,
            ms: { relax: t1 - t0, mesh: t2 - t1, bake: t3 - t2, fields: t4 - t3 }
        };
    }

    let negiMat = null;
    function getNegiMat() {
        if (negiMat) return negiMat;
        const m = new BABYLON.PBRMaterial("negiMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0; m.roughness = 0.42;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.85;
        m.clearCoat.roughness = 0.14;
        m.clearCoat.indexOfRefraction = 1.335;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.55;
        m.subSurface.tintColor = new BABYLON.Color3(s2l(0.55), s2l(0.85), s2l(0.40));
        m.subSurface.minimumThickness = 0.02;
        m.subSurface.maximumThickness = 0.16;
        negiMat = m;
        return m;
    }

    // ---- 天ぷらと具のマテリアル -------------------------------------------
    let koromoMat = null, koromoTex = null, ebiMat = null, shisoMat = null, shiitakeMat = null;
    let ebiBodyMat = null, ebiBodyTex = null, ebiTailTex = null;
    function getKoromoMat() {
        if (koromoMat) return koromoMat;
        koromoTex = koromoTextures(scene, CFG.seed ^ 0x5AC1);
        const m = new BABYLON.PBRMaterial("koromoMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = koromoTex.albedo;
        m.bumpTexture = koromoTex.normal;
        m.metallicTexture = koromoTex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useRoughnessFromMetallicTextureAlpha = false;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.metallic = 0.0; m.roughness = 1.0;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.22;
        m.clearCoat.roughness = 0.32;
        m.clearCoat.indexOfRefraction = 1.47;
        m.bumpTexture.level = 0.16;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.16;
        m.subSurface.tintColor = new BABYLON.Color3(s2l(0.99), s2l(0.86), s2l(0.55));
        m.subSurface.minimumThickness = 0.02;
        m.subSurface.maximumThickness = 0.42;
        koromoMat = m;
        return m;
    }
    // えびの身。握りのサンプルと同じ作りのテクスチャを貼る
    function getEbiBodyMat() {
        if (ebiBodyMat) return ebiBodyMat;
        ebiBodyTex = ebiTextures(scene, CFG.seed ^ 0x3B1E);
        const m = new BABYLON.PBRMaterial("ebiBodyMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = ebiBodyTex.albedo;
        m.bumpTexture = ebiBodyTex.normal;
        m.metallicTexture = ebiBodyTex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.metallic = 0.0; m.roughness = 1.0;
        // 茹で上がった身は濡れている。照りはクリアコートに持たせる
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = EBI_COL.coat;
        m.clearCoat.roughness = EBI_COL.coatRough;
        m.clearCoat.indexOfRefraction = 1.34;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = clamp(EBI_COL.translucency, 0, 0.95);
        m.subSurface.tintColor = new BABYLON.Color3(s2l(EBI_COL.tint[0]), s2l(EBI_COL.tint[1]), s2l(EBI_COL.tint[2]));
        m.subSurface.minimumThickness = EBI.hgt * 0.10;
        m.subSurface.maximumThickness = EBI.hgt * 0.85;
        ebiBodyMat = m;
        return m;
    }
    function getEbiMat() {
        if (ebiMat) return ebiMat;
        ebiTailTex = ebiTailTexture(scene, CFG.seed ^ 0x11AC);
        const m = new BABYLON.PBRMaterial("ebiMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = ebiTailTex;
        m.metallic = 0; m.roughness = 0.24;
        // 【対策】尾扇は「膜」なので裏から見ても見える。片面だけにすると
        // 角度によって扇が消える
        m.backFaceCulling = false;
        m.twoSidedLighting = true;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.35;
        m.clearCoat.roughness = 0.16;
        m.clearCoat.indexOfRefraction = 1.36;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.18;
        m.subSurface.tintColor = new BABYLON.Color3(s2l(EBI_COL.tailPale[0]), s2l(EBI_COL.tailPale[1]), s2l(EBI_COL.tailPale[2]));
        m.subSurface.minimumThickness = 0.01;
        m.subSurface.maximumThickness = EBI.fanTh * 1.4;
        ebiMat = m;
        return m;
    }
    function getShisoMat() {
        if (shisoMat) return shisoMat;
        const m = new BABYLON.PBRMaterial("shisoMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0; m.roughness = 0.73;
        m.backFaceCulling = false;
        m.twoSidedLighting = true;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.04;
        m.clearCoat.roughness = 0.26;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.10;
        m.subSurface.tintColor = new BABYLON.Color3(s2l(0.45), s2l(0.78), s2l(0.28));
        m.subSurface.minimumThickness = 0.02;
        m.subSurface.maximumThickness = 0.12;
        shisoMat = m;
        return m;
    }
    function getShiitakeMat() {
        if (shiitakeMat) return shiitakeMat;
        const m = new BABYLON.PBRMaterial("shiitakeMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0; m.roughness = 0.52;
        // つゆから上げたばかりの傘は濡れている。照りは全部コートに持たせる
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.85;
        m.clearCoat.roughness = 0.13;
        m.clearCoat.indexOfRefraction = 1.34;
        shiitakeMat = m;
        return m;
    }

    function buildBroth(st) {
        const ts = TSUYU[CFG.tsuyu];
        st.tsuyu = ts;
        st.brothTex = brothTextures(scene, st.F, ts, live.turbidity);
        st.brothMat = brothMaterial(scene, st.brothTex, ts, "tsuyuMat");
        st.brothMat.clearCoat.roughness = clamp(ts.rough * live.wet, 0.015, 0.6);
        st.brothMat.clearCoat.bumpTexture.level = 0.50 * live.ripple;
        st.broth = buildBrothSurface(scene, st.F, st.brothMat, waterR);
    }

    // σ（濃さ）だけ変える。ノイズの場は使い回すので混色をやり直すだけで済む
    let turbDirty = false;
    // Depth tint is baked into the actual noodle vertices, not the water surface.
    function updateSubmergedNoodles() {
        if(!state || !state.noodles) return;
        const mesh=state.noodles, data=mesh.metadata;
        const cols=data.dryColors.slice(), pos=data.depthPositions;
        const ts=TSUYU[CFG.tsuyu], tint=lin3(ts.deep);
        for(let i=0;i<pos.length/3;i++) {
            const depth=Math.max(0,BROTH_Y-pos[i*3+1]);
            for(let c=0;c<3;c++)cols[i*4+c]=mix(cols[i*4+c],tint[c],
                1-Math.exp(-ts.sigma[c]*depth*live.turbidity));
        }
        mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind,cols);
        if(state.brothMat) {
            state.brothMat.albedoColor = new BABYLON.Color3(...tint);
            state.brothMat.alpha = 1-Math.exp(-0.90*live.turbidity);
        }
    }

    function redrawVeil() {
        updateSubmergedNoodles();
    }

    function applyLive() {
        if (!state) return;
        for (const k in menMatCache) {
            const mm = menMatCache[k];
            mm.subSurface.translucencyIntensity = clamp((mm.subBase || 0.46) * live.trans, 0, 0.95);
        }
        if (negiMat) negiMat.subSurface.translucencyIntensity = clamp(0.55 * live.trans, 0, 0.95);
        if (state.brothMat) {
            state.brothMat.clearCoat.roughness = clamp(state.tsuyu.rough * live.wet, 0.015, 0.60);
            state.brothMat.clearCoat.bumpTexture.level = 0.50 * live.ripple;
        }
    }

    function build(full) {
        const t0 = performance.now();
        if (full) {
            disposeBroth(state);
            disposeFood(state);
            const c = buildFood(CFG.men, CFG.seed);
            state = state || {};
            state.noodles = c.noodles; state.negi = c.negi;
            state.koromo = c.koromo; state.ebiBody = c.ebiBody; state.ebiTail = c.ebiTail;
            state.shiso = c.shiso; state.shiitake = c.shiitake;
            state.mp = c.mp; state.F = c.F;
            state.strands = c.strands; state.totalLen = c.totalLen;
            state.relax = c.relax; state.ms = c.ms;
        } else {
            disposeBroth(state);
        }
        buildBroth(state);
        if (!state.bowl) {
            state.bowl = buildBowl(scene, getBowlMat(CFG.utsuwa), new Rng(0xB0117));
            sg.addShadowCaster(state.bowl, true);
        }
        state.bowl.material = getBowlMat(CFG.utsuwa);
        applyChopsticks();
        applyLive();
        updateSubmergedNoodles();
        state.buildMs = performance.now() - t0;
        if (onRebuilt) onRebuilt(state);
    }

    build(true);

    // =================================================================
    //  ポストプロセス
    // =================================================================
    if (CFG.ssao) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        // 【対策】半径を麺の太さ（0.5cm）まで詰めると、麺という麺の輪郭に
        // 黒い縁がついて全体が汚れる。麺と麺の谷くらいの大きさだけ拾わせる
        ssao.radius = 0.55;
        ssao.totalStrength = 0.30;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 220;
        ssao.minZAspect = 0.25;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = false;
    dp.bloomThreshold = 0.90;
    dp.bloomWeight = 0.12;
    dp.bloomKernel = 44;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.10;
    dp.depthOfFieldEnabled = CFG.dof;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.High;
    dp.depthOfField.lensSize = 50;
    dp.depthOfField.fStop = CFG.dofFStop;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    // 【対策】麺は sRGB 0.90 前後の高キーな被写体。露出 1.2 では ACES の肩から
    // 出て白く飛び、麺どうしの境が消える。露出は低めに置いてコントラストで戻す
    // 【対策】うどんは sRGB 0.90 前後の高キーな被写体だったが、そばの地色は
    // 0.70、田舎なら 0.55 しかない。同じ露出だと丼の中だけが沈むので
    // 1段だけ上げる（上げすぎると天ぷらの花が白く飛ぶ）
    ip.exposure = 1.18;
    ip.contrast = 1.06;
    ip.vignetteEnabled = false;
    ip.vignetteWeight = 1.30;
    ip.vignetteCameraFov = 0.72;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    let tAcc = 0;
    scene.onBeforeRenderObservable.add(() => {
        if (dp.depthOfFieldEnabled) {
            // 【対策】Babylon の錯乱円は「シーン単位 × 1000 = mm」で計算される。
            // 焦点距離を固定値にすると被写界深度が数十メートルになる。
            // 合焦距離の一定比にすれば focus が約分され、寄っても引いても
            // ボケ量が変わらない
            const focus = camera.radius * 1000;
            dp.depthOfField.focusDistance = focus;
            dp.depthOfField.focalLength = focus * CFG.dofRatio;
        }
        if (state && state.brothMat && state.brothMat.clearCoat.bumpTexture) {
            tAcc += scene.getEngine().getDeltaTime() * 0.001;
            const b = state.brothMat.clearCoat.bumpTexture;
            b.uOffset = Math.sin(tAcc * 0.10) * 0.014 + tAcc * 0.0026;
            b.vOffset = Math.cos(tAcc * 0.079) * 0.012 - tAcc * 0.0018;
        }
        if (turbDirty) { turbDirty = false; redrawVeil(); }
    });

    // =================================================================
    // 13. GUI
    // =================================================================
    // 【対策】フルスクリーン GUI を既定のままにすると Bloom / 被写界深度 /
    // シャープンが UI にも乗ってボケる。定石は layerMask で GUI 専用カメラへ
    // 分離することだが、それをやると Inspector が3系統まとめて壊れる
    // （Physics Helper / 選択ハイライト / Scene Explorer のピッカー）。
    // Layer.applyPostProcess = false なら2台目を作らずに GUI だけ
    // ポストプロセスの外へ出せるので、既定はこちら。
    const GUI_MASK = 0x20000000;
    let guiCam = null;

    function bindDebugCamera(sc, mainCam) {
        // UtilityLayerRenderer.getRenderCamera は activeCameras の末尾を直接
        // 参照する。Inspector が内部の WeakMap に抱えていて外から触れない
        // レイヤーまで一括で直すため、インスタンスではなくプロトタイプを差し替える
        const ULR = BABYLON.UtilityLayerRenderer;
        if (ULR && ULR.prototype && !ULR.prototype.__udonPatched) {
            const orig = ULR.prototype.getRenderCamera;
            ULR.prototype.getRenderCamera = function (getDefault) {
                if (this._renderCamera) return this._renderCamera;
                const s = this.originalScene || this.utilityLayerScene;
                if (s && s.__debugMainCamera) return s.__debugMainCamera;
                return orig.call(this, getDefault);
            };
            ULR.prototype.__udonPatched = true;
        }
        sc.__debugMainCamera = mainCam;
        // scene.pick() を camera 引数なしで呼ぶと createPickingRay の中で
        // scene.activeCamera が使われる。描画ループが activeCameras を順に
        // 代入するので、終わった時点では guiCam が残っている。毎フレーム戻す
        sc.onAfterRenderObservable.add(() => { sc.activeCamera = mainCam; });
        sc.cameraToUseForPointers = mainCam;
    }

    if (CFG.guiOwnCamera) {
        guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene);
        guiCam.layerMask = GUI_MASK;
        scene.activeCameras = [camera, guiCam];
        bindDebugCamera(scene, camera);
    } else {
        scene.activeCameras = [camera];
    }

    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (ui.layer) {
        if (CFG.guiOwnCamera) ui.layer.layerMask = GUI_MASK;
        else ui.layer.applyPostProcess = false;
    }
    // 【対策】Babylon.GUI のサイズ指定はレンダー解像度基準（≒ CSS px × DPR）。
    // DPR 3 の端末では 32px のボタンが実質 11 CSS px になり、
    // 「邪魔なうえに押しにくい」状態になる
    ui.idealWidth = 1400;
    ui.renderAtIdealSize = true;

    const COL = {
        idle: "#2b2926", active: "#7d6236", edge: "#4a463e",
        text: "#f3ede1", sub: "#a8a193", accent: "#e8d6ae"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "262px";
    card.height = "88%";
    card.cornerRadius = 10;
    card.thickness = 1;
    card.color = COL.edge;
    card.background = "rgba(18,17,15,0.84)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "16px";
    ui.addControl(card);
    card.isVisible = false;
    const showSettings = BABYLON.GUI.Button.CreateSimpleButton("settingsToggle", "調整パネル");
    showSettings.width = "114px"; showSettings.height = "34px";
    showSettings.color = COL.text; showSettings.background = "#38352f";
    showSettings.cornerRadius = 6; showSettings.thickness = 0;
    showSettings.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    showSettings.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    showSettings.top = "16px"; showSettings.left = "-16px";
    showSettings.onPointerClickObservable.add(()=>{card.isVisible=!card.isVisible;});
    ui.addControl(showSettings);

    const sv = new BABYLON.GUI.ScrollViewer("sv");
    sv.thickness = 0;
    sv.barSize = 10;
    sv.barColor = COL.edge;
    sv.barBackground = "rgba(0,0,0,0)";
    sv.wheelPrecision = 0.02;
    card.addControl(sv);

    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "224px";
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
        s.height = "18px"; s.width = "212px"; s.paddingBottom = "8px";
        s.color = COL.accent; s.background = "#39342c"; s.borderColor = "transparent";
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

    addLabel("TEMPURA SOBA / 天ぷらそば", 11, COL.sub, "30px");

    const menBtns = {}, tsuyuBtns = {}, utsuwaBtns = {};
    function highlight() {
        for (const k in menBtns) menBtns[k].background = (k === CFG.men) ? COL.active : COL.idle;
        for (const k in tsuyuBtns) tsuyuBtns[k].background = (k === CFG.tsuyu) ? COL.active : COL.idle;
        for (const k in utsuwaBtns) utsuwaBtns[k].background = (k === CFG.utsuwa) ? COL.active : COL.idle;
    }

    addLabel("そば", 13, COL.accent, "22px");
    for (const k of Object.keys(MEN)) {
        menBtns[k] = addButton("m_" + k, MEN[k].label, () => { CFG.men = k; build(true); highlight(); });
    }
    addLabel("つゆ", 13, COL.accent, "22px");
    for (const k of Object.keys(TSUYU)) {
        tsuyuBtns[k] = addButton("t_" + k, TSUYU[k].label, () => { CFG.tsuyu = k; build(false); highlight(); });
    }
    addLabel("器", 13, COL.accent, "22px");
    for (const k of Object.keys(UTSUWA)) {
        utsuwaBtns[k] = addButton("u_" + k, UTSUWA[k].label, () => {
            CFG.utsuwa = k;
            state.bowl.material = getBowlMat(k);
            build(false);                      // つゆ越しに透ける内底の色も変わる
            highlight();
        });
    }

    addSpacer();
    addButton("reseed", "盛り直す", () => {
        CFG.seed = (CFG.seed * 1664525 + 1013904223) >>> 0;
        build(true);
    });

    const negiBtn = addButton("negi", "ねぎ: " + (CFG.negi ? "ON" : "OFF"), () => {
        CFG.negi = !CFG.negi;
        negiBtn.textBlock.text = "ねぎ: " + (CFG.negi ? "ON" : "OFF");
        negiBtn.background = CFG.negi ? COL.active : COL.idle;
        build(true);
    });
    negiBtn.background = CFG.negi ? COL.active : COL.idle;

    // ---- 天ぷらと具 -------------------------------------------------------
    const ebiLabel = () => "えび天: " + (CFG.ebi ? CFG.ebi + "本" : "なし");
    const ebiBtn = addButton("ebi", ebiLabel(), () => {
        CFG.ebi = (CFG.ebi + 1) % 4;          // 0 → 1 → 2 → 3 → 0
        ebiBtn.textBlock.text = ebiLabel();
        ebiBtn.background = CFG.ebi ? COL.active : COL.idle;
        build(true);
    });
    ebiBtn.background = CFG.ebi ? COL.active : COL.idle;

    const shisoBtn = addButton("shiso", "大葉の天ぷら: " + (CFG.shiso ? "ON" : "OFF"), () => {
        CFG.shiso = !CFG.shiso;
        shisoBtn.textBlock.text = "大葉の天ぷら: " + (CFG.shiso ? "ON" : "OFF");
        shisoBtn.background = CFG.shiso ? COL.active : COL.idle;
        build(true);
    });
    shisoBtn.background = CFG.shiso ? COL.active : COL.idle;

    const shiitakeBtn = addButton("shiitake", "椎茸: " + (CFG.shiitake ? "ON" : "OFF"), () => {
        CFG.shiitake = !CFG.shiitake;
        shiitakeBtn.textBlock.text = "椎茸: " + (CFG.shiitake ? "ON" : "OFF");
        shiitakeBtn.background = CFG.shiitake ? COL.active : COL.idle;
        build(true);
    });
    shiitakeBtn.background = CFG.shiitake ? COL.active : COL.idle;

    const steamBtn = addButton("steam", "湯気: ON", () => setSteam(!steam.isStarted()));
    function setSteam(on) {
        if (on) steam.start(); else steam.stop();
        steamBtn.textBlock.text = "湯気: " + (on ? "ON" : "OFF");
        steamBtn.background = on ? COL.active : COL.idle;
    }
    setSteam(CFG.steam);

    const chopBtn = addButton("chop", "箸: " + (chopOn ? "ON" : "OFF"), () => {
        chopOn = !chopOn;
        // 箸を消したら、宙に浮いた束も消す
        if (CFG.lift) rebuildNoodles(); else applyChopsticks();
        chopBtn.textBlock.text = "箸: " + (chopOn ? "ON" : "OFF");
        chopBtn.background = chopOn ? COL.active : COL.idle;
    });
    chopBtn.background = chopOn ? COL.active : COL.idle;

    const liftBtn = addButton("lift", "箸でつかむ: " + (CFG.lift ? "ON" : "OFF"), () => {
        CFG.lift = !CFG.lift;
        liftBtn.textBlock.text = "箸でつかむ: " + (CFG.lift ? "ON" : "OFF");
        liftBtn.background = CFG.lift ? COL.active : COL.idle;
        rebuildNoodles();            // 山は据え置き。束の作り直しだけで済む
    });
    liftBtn.background = CFG.lift ? COL.active : COL.idle;

    const kickBtn = addButton("kick", "照り足し: ON", () => {
        kick.setEnabled(!kick.isEnabled());
        kickBtn.textBlock.text = "照り足し: " + (kick.isEnabled() ? "ON" : "OFF");
        kickBtn.background = kick.isEnabled() ? COL.active : COL.idle;
    });
    kickBtn.background = COL.active;

    const rotBtn = addButton("rot", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.08;
        rotBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });

    addSpacer();
    // ここが本題のスライダー。0 に寄せると湯のように澄み、沈んだ麺が
    // 底まで見えるようになる。上げると醤油が濃くなって水面直下しか見えない
    const sTurb = addSlider("つゆの濃さ ×", 0.05, 3.0, live.turbidity, f2, (v) => {
        live.turbidity = v; turbDirty = true;
        if (turbInfo) {
            const ts = TSUYU[CFG.tsuyu];
            const sg2 = ts.sigma[1] * v;
            turbInfo.text = "  緑の消散長 " + (1 / Math.max(sg2, 1e-3)).toFixed(2)
                + "cm ／ 深さ1cmで " + Math.round((1 - Math.exp(-sg2)) * 100) + "% 溶ける";
        }
    });
    const turbInfo = addLabel("", 11, COL.sub, "34px");
    {
        const sg2 = TSUYU[CFG.tsuyu].sigma[1] * live.turbidity;
        turbInfo.text = "  緑の消散長 " + (1 / sg2).toFixed(2)
            + "cm ／ 深さ1cmで " + Math.round((1 - Math.exp(-sg2)) * 100) + "% 溶ける";
    }

    const sAmount = addSlider("そばの量 ×", 0.5, 1.5, CFG.amount, f2, (v) => { CFG.amount = v; });
    addLabel("  （変えたあと「盛り直す」）", 11, COL.sub, "20px");
    const sTrans = addSlider("そばの透光 ×", 0, 2.0, live.trans, f2, (v) => { live.trans = v; applyLive(); });
    const sRip = addSlider("さざ波 ×", 0, 3.0, live.ripple, f2, (v) => { live.ripple = v; applyLive(); });
    const sWet = addSlider("水面の粗さ ×", 0.1, 3.0, live.wet, f2, (v) => { live.wet = v; applyLive(); });

    addSpacer();
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        CFG.dof = !CFG.dof;
        dp.depthOfFieldEnabled = CFG.dof;
        dofBtn.background = CFG.dof ? COL.active : COL.idle;
        dofBtn.textBlock.text = "被写界深度: " + (CFG.dof ? "ON" : "OFF");
    });
    dofBtn.background = CFG.dof ? COL.active : COL.idle;
    addSlider("ぼけ量", 0.01, 0.20, CFG.dofRatio, f2, (v) => { CFG.dofRatio = v; });
    addSlider("F値", 1.2, 11.0, CFG.dofFStop, (v) => v.toFixed(1), (v) => { dp.depthOfField.fStop = v; });

    const info = addLabel("", 12, COL.sub, "96px");
    highlight();

    onRebuilt = (st) => {
        sTrans.slider.value = live.trans;
        sRip.slider.value = live.ripple;
        sWet.slider.value = live.wet;
        let tri = (st.bowl ? st.bowl.tris : 0) + (st.broth ? st.broth.tris : 0)
            + (st.noodles ? st.noodles.tris : 0) + (st.negi ? st.negi.tris : 0);
        for (const k of ["koromo", "ebiBody", "ebiTail", "shiso", "shiitake"]) if (st[k]) tri += st[k].tris;
        for (const m of sundry) tri += m.tris;
        const drawn = st.noodles ? st.noodles.strandCount : 0;
        info.text = "そば " + st.strands.length + " 本 / 総長 " + st.totalLen.toFixed(0) + "cm"
            + "（水中を含む描画 " + drawn + " 本）\n"
            + tri.toLocaleString() + " tri / つゆ面 " + st.F.N + "²\n"
            + "水面 y=" + BROTH_Y.toFixed(2) + "cm  径 " + (waterR * 2).toFixed(1) + "cm"
            + " / 山 y=" + st.relax.top.toFixed(2) + "cm\n"
            + "build " + st.buildMs.toFixed(0) + "ms  seed: " + CFG.seed;
    };
    onRebuilt(state);

    console.log("[TenSoba] build tensoba-2026-09-21-e",
        "| strands=" + state.strands.length,
        "| len=" + state.totalLen.toFixed(0) + "cm",
        "| top=" + state.relax.top.toFixed(2),
        "| ms=", state.ms, "| total=" + state.buildMs.toFixed(0) + "ms");

    scene.onDisposeObservable.add(() => {
        for (const k in bowlMatCache) {
            const m = bowlMatCache[k];
            if (m.texs) for (const t of m.texs) t.dispose();
            m.dispose(true, false);
        }
        for (const k in menTexCache) for (const t in menTexCache[k]) menTexCache[k][t].dispose();
        if (state && state.brothTex) for (const t in state.brothTex) state.brothTex[t].dispose();
        for (const s of [clothTex, woodTex]) for (const t in s) s[t].dispose();
        if (koromoTex) for (const t in koromoTex) koromoTex[t].dispose();
        if (ebiBodyTex) for (const t in ebiBodyTex) ebiBodyTex[t].dispose();
        if (ebiTailTex) ebiTailTex.dispose();
        steamTex.dispose();
    });

    return scene;
};

export default createScene;