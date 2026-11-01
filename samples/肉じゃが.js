// =====================================================================
//  Photoreal Nikujaga  /  写実的な「肉じゃが」
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//  build: nikujaga-2026-09-01-q
//
//  構成:
//    0. CONFIG      … 煮汁 / 器 / 具 のプリセットと寸法
//    1. Rng         … シード付き擬似乱数
//    2. Noise       … 2D/3D 値ノイズ（周期版つき）
//    3. Mesh utils  … 巻き順判定 / 法線溶接 / 一意な name+id
//    4. TexLab      … DynamicTexture 生成の土台
//    5. Hachi       … 白磁の鉢（輪花つき）
//    6. Chunks      … じゃがいも / にんじん / 玉ねぎのくし切り / 牛肉の薄切り / いんげん
//    7. Shirataki   … しらたき（絡んだ紐の束）★
//    8. Pile        … 高さ場に落として盛る（物理を使わない山）★
//    9. Glaze       … 煮汁の膜 ★★
//   10. Broth       … 煮汁の溜まり（透明・浅い）
//   11. Scene       … テーブル / IBL / 湯気 / ACES / DOF
//   12. GUI
//
//  ここでの最重要事項:
//  「カレーは不透明な塗料、肉じゃがは透明なニス」
//
//   カレー.js ではルウを不透明として扱い、具の色を被覆率で
//   ルウ色へ寄せていた（cov=1 で完全にルウ色）。同じことを肉じゃがで
//   やると、じゃがいもも人参も牛肉も全部おなじ醤油色の団子になる。
//
//   参考写真3枚を測ると、答えははっきりしている。器の白（リニア
//   [0.361,0.361,0.287]）の上にある煮汁の溜まり（リニア
//   [0.095,0.030,0.007]）から、深さ 0.9cm の往復として消散係数を
//   逆算すると
//
//       σ = [0.74, 1.39, 2.10] /cm       （B/R = 2.84）
//
//   青は赤の3倍近く吸われるが、赤はほとんど素通りする。つまり煮汁は
//   「茶色い絵の具」ではなく「琥珀色のガラス」で、下の色は消えない。
//   だから写真の肉じゃがは、じゃがいもが黄色いまま・人参が橙のまま・
//   しらたきが白いままで、それでいて全部が濃く・暖かく・照っている。
//
//   実装は Beer–Lambert 1本で足りる。頂点ごとに膜の厚み t を決めて
//
//       c_out = c_base * exp(-σ * 2t)         （光は膜を往復する）
//
//   を掛けるだけ。あとは t をどう決めるかで、
//
//       ・液面からの高さ（垂れ落ちる）
//       ・上を向いた面ほど薄い（重力）
//       ・まわりに高いものがあるほど厚い（隙間に溜まる）★
//
//   の3つを掛ける。3番目が肝で、これが無いと山全体が均一に濡れた
//   プラスチックになる。具の隙間だけが濃い琥珀に沈むのが、写真の
//   肉じゃがを肉じゃがに見せている当のものだった。GUI の「煮詰め」を
//   0.3 まで下げると σ が下がって出汁で炊いた薄味の色になり、
//   2.5 まで上げると照りっ照りの飴色になる。
// =====================================================================

// 【変更】盛り付けを Havok に渡したので、HavokPhysics() を待つ必要がある。
//         Playground は async な createScene をそのまま受け付ける
var createScene = async function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    // 単位系: 1 unit = 1 cm。膜の厚みや薄切りは mm で書きたいので定数を持つ
    const MM = 0.1;

    // ---- 煮汁のプリセット --------------------------------------------
    // sigma は消散係数 [1/cm]。参考写真3枚から逆算した実測値がそのまま
    // 「定番」になっている。他は煮詰め具合を振っただけ
    const SAUCES = {
        teiban: {
            label: "定番（甘辛）",
            sigma: [0.740, 1.390, 2.100],  // ★実測（器の白と溜まりの比から）
            // 散乱成分。煮汁は澄んでいるが完全な透明ではなく、
            // でんぷんと脂で薄く濁る。これが無いと溜まりが黒い穴になる
            haze: [0.365, 0.196, 0.072],   // 散乱光の色（sRGB）
            hazeK: 0.115,                  // 散乱の強さ
            film: 0.038,                   // 露出面の膜の厚み [cm]
            pool: 0.190,                   // 隙間に溜まった所の厚み [cm]
            drain: 1.35,                   // 膜が薄くなる高さの減衰長 [cm]
            depth: 1.75,                   // 器の底からの汁の深さ [cm]
            rough: 0.108,                  // 膜（＝clearCoat）の粗さ
            coat: 0.48,                    // 膜の被覆
            oil: 0.85                      // 液面に浮いた脂の量
        },
        usukuchi: {
            label: "関西風（薄口）",
            // 薄口醤油は色が淡いぶん塩分が高い。色だけ抜いて濃度は据え置き
            sigma: [0.400, 0.790, 1.290],
            haze: [0.472, 0.312, 0.140], hazeK: 0.135,
            film: 0.032, pool: 0.165, drain: 1.55, depth: 1.95,
            rough: 0.098, coat: 0.94, oil: 0.62
        },
        kozume: {
            label: "煮詰め（照り強）",
            // 煮汁が飛んで糖が煮詰まった状態。膜が厚くなり、粗さが落ちる
            sigma: [1.240, 2.320, 3.560],
            haze: [0.286, 0.138, 0.046], hazeK: 0.090,
            film: 0.068, pool: 0.285, drain: 0.92, depth: 0.85,
            rough: 0.072, coat: 1.00, oil: 1.15
        },
        shirudaku: {
            label: "汁だく",
            sigma: [0.560, 1.060, 1.620],
            haze: [0.402, 0.232, 0.096], hazeK: 0.145,
            film: 0.026, pool: 0.135, drain: 1.85, depth: 2.55,
            rough: 0.088, coat: 0.90, oil: 0.70
        }
    };

    // ---- 器のプリセット ----------------------------------------------
    // 参考写真の器はどれも白い鉢。実測（写真3のリム）は sRGB 0.635 だが
    // これは影の側なので、アルベドとしては 0.84 前後
    const HACHIS = {
        hakuji: {
            label: "白磁",
            albedo: [0.848, 0.842, 0.822], rough: 0.118,
            speck: 0.10, craze: 0.12, rinka: 0,
            coat: 0.98, coatRough: 0.055, rim: null
        },
        rinka: {
            label: "白磁（輪花）",
            // 参考写真2の菊型鉢。外周だけを花弁状に刻む
            albedo: [0.856, 0.850, 0.834], rough: 0.108,
            speck: 0.08, craze: 0.10, rinka: 16,
            coat: 0.98, coatRough: 0.050, rim: null
        },
        kohiki: {
            label: "粉引",
            // 化粧土のかかった半艶。白いが青が落ちて暖かい
            albedo: [0.812, 0.780, 0.712], rough: 0.235,
            speck: 0.42, craze: 0.34, rinka: 0,
            coat: 0.72, coatRough: 0.165,
            rim: { col: [0.402, 0.318, 0.238], at: 0.985, w: 0.05, blur: 0.55 }
        },
        ame: {
            label: "飴釉",
            // 【対策】飴釉は暗いが sRGB 0.10 まで落とすとリニアで 0.010 になり
            //         形が読めない。実物の反射率 8% ≒ sRGB 0.31 が下限
            albedo: [0.362, 0.246, 0.152], rough: 0.132,
            speck: 0.28, craze: 0.30, rinka: 0,
            coat: 0.99, coatRough: 0.062,
            rim: { col: [0.612, 0.470, 0.302], at: 0.995, w: 0.045, blur: 0.7 }
        },
        oribe: {
            label: "織部",
            albedo: [0.322, 0.412, 0.268], rough: 0.145,
            speck: 0.32, craze: 0.46, rinka: 0,
            coat: 0.99, coatRough: 0.070, rim: null
        }
    };

    // ---- 具の構成 -----------------------------------------------------
    const FILLS = {
        teiban: {
            label: "定番",
            potato: 8, carrot: 6, onion: 8, meat: 18, bean: 7, shirataki: 5,
            meatKind: "beef"
        },
        niku: {
            label: "肉多め",
            potato: 6, carrot: 4, onion: 7, meat: 24, bean: 5, shirataki: 2,
            meatKind: "beef"
        },
        yasai: {
            label: "野菜多め",
            potato: 9, carrot: 9, onion: 10, meat: 7, bean: 11, shirataki: 3,
            meatKind: "beef"
        },
        ito: {
            label: "しらたき多め",
            potato: 6, carrot: 5, onion: 7, meat: 10, bean: 6, shirataki: 6,
            meatKind: "beef"
        },
        itoOnly: {
            // 部材確認用。器にしらたきだけを盛る
            label: "しらたきだけ（部材確認）", inspect: true,
            potato: 0, carrot: 0, onion: 0, meat: 0, bean: 0, shirataki: 7,
            meatKind: "pork"
        },
        nikuOnly: {
            // 部材を1種ずつ詰めるための確認用。器に肉だけを盛る
            label: "豚こま切れだけ（部材確認）", inspect: true,
            potato: 0, carrot: 0, onion: 0, meat: 30, bean: 0, shirataki: 0,
            meatKind: "pork"
        },
        buta: {
            // 東日本の「豚じゃが」。肉の色だけ差し替える
            label: "豚じゃが",
            potato: 8, carrot: 6, onion: 8, meat: 20, bean: 7, shirataki: 3,
            meatKind: "pork"
        }
    };

    const GLOBAL = {
        // ---- 鉢の寸法（盛鉢: 口径 16.2cm / 高さ 5.6cm）----------------
        rimY: 5.60,        // 口縁の高さ
        rIn: 8.10,         // 口縁の内半径
        rOut: 8.42,        // 口縁の外半径
        yFloor: 1.55,      // 見込み（内側）の底
        rFootOut: 3.85,    // 高台の外半径
        rFootIn: 3.05,     // 高台の内半径
        yUnder: 1.05,      // 底裏の中心（底の厚み 0.50cm）
        wallThin: 0.320,   // 口縁の肉厚
        wallThick: 0.36,   // 腰から下で増える分
        wallKnee: 3.10,
        wallSpan: 1.35,
        sides: 200,        // 回転体の周方向分割
        wobble: 1.0,       // 手仕事の歪み（0で完全な真円）
        rinkaDepth: 0.115, // 輪花の切れ込み [cm]
        hachiTex: 768,

        // ---- 盛り（高さ場） ------------------------------------------
        pileGrid: 260,     // 高さ場の解像度。0.065cm/セル
        pileHalf: 8.45,    // 覆う範囲 [-half, half]
        // 【対策】必要な持ち上げ量を「覆ったセルの最大値」で取ると、
        //         隣の芋の頂点にセル1個かすっただけで肉が丸ごと宙へ浮く。
        //         煮えた具は多少めり込むので、分位で取って少し沈める
        //         煮えた具は角が取れて互いに食い込むので、分位は
        //         0.93 だと「かすっただけで上に乗る」に近く、山が塔になる
        liftQuantile: 0.70,
        settle: 0.130,     // 置いたあと沈める量 [cm]
        tryPos: 12,        // 候補位置をいくつ試して低い所を選ぶか
        spread: 2.60,      // 候補を散らす半径 [cm]
        pileR: 7.00,       // 盛りが広がる半径 [cm]
        pileDome: 0.42,    // 中心を高く積む度合い（0で平ら）

        // ---- 煮汁 ----------------------------------------------------
        brothTex: 512,     // 液面のテクスチャ。沈んだ具の輪郭を焼くので粗くできない
        brothRings: 72,
        brothSectors: 176,
        ripple: 0.009,     // さざ波の振幅 [cm]
        meniscus: 0.062,   // 器の内壁を這い上がる高さ [cm]
        veilLit: 0.82,     // 液中の具は拡散光しか受けないぶん暗い

        // ---- 膜（★ここが本題） ---------------------------------------
        // 隙間の判定に使う水平距離 [cm]。具の代表寸法（2.5cm）の
        // 半分あたりを見ると、接している所だけが拾える
        pocketR: [0.34, 0.68, 1.12],
        pocketDirs: 12,
        pocketRise: 0.16,  // 「自分より高い」と見なす高さの差 [cm]

        // ---- 描画 ----------------------------------------------------
        useSSAO: true,
        useDOF: true,
        dofFStop: 2.8,
        dofRatio: 0.070,
        // 【対策】GUI 専用カメラに分ければ UI はボケなくなるが、Inspector の
        //         Physics Helper / 選択ハイライト / ピッカーが3系統まとめて
        //         壊れる。Layer.applyPostProcess = false なら2台目を作らずに
        //         済むので、既定はこちら
        guiOwnCamera: false
    };

    // ---- 鉢の見込み（内側）の制御点 ----------------------------------
    // 【対策】汁椀の曲線をそのまま拡大すると、口がすぼまった「大きい椀」に
    //         なる。参考写真の鉢は逆で、腰から上でいちど立ち上がってから
    //         口縁の 1cm ぶんだけ外へ開く。dr/dy が口へ向かって
    //         0.68 → 1.02 → 1.80 と増えるように制御点を置く
    // 【対策】最初は五寸鉢（口径16.2 × 高さ7.0）の断面にしていたが、
    //         中心から口縁まで一様に立ち上がる円錐なので「見込み」が
    //         ほとんど無く、具は直径9cmの小さな井戸に溜まって、外側と
    //         上に白い壁だけが残る。参考写真の器はどちらも盛鉢で、
    //         平らな見込みが半径5cm近くまで続いてから壁が立つ。
    //         高さも 7.0 は深すぎるので 5.6 に下げ、そのぶん見込みを広げる
    // 断面は口縁から逆に積分して起こした。壁の傾き dr/dy を口縁で 1.25、
    // 腰で 0.78、見込みで 0.52 と与えると、平らな見込みが半径 5.2cm まで
    // 続いてから壁が立ち、口縁へ向けて開く盛鉢になる
    const HACHI_R = [0.00, 1.20, 2.40, 3.60, 4.60, 5.21, 5.47, 5.87, 6.38, 6.92, 7.50, 7.85, 8.10];
    const HACHI_Y = [1.55, 1.57, 1.64, 1.76, 1.96, 2.20, 2.70, 3.30, 3.95, 4.55, 5.10, 5.38, 5.60];

    const START_SAUCE = "teiban";
    const START_HACHI = "hakuji";
    const START_FILL = "teiban";
    const START_SEED = 20260901;

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;
    const GOLD = 2.39996323;

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
        pick(arr) { return arr[this.int(arr.length)]; }
    }

    // ---- 小物 --------------------------------------------------------
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    // sRGB → リニア。PBRMaterial の色と頂点カラーはリニア空間
    const s2l = (c) => (c <= 0.04045) ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const l2s = (v) => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
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
        // 回転体の u（周方向）だけ折り返す
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
    // 【対策】Babylon の Node は id = name を既定にするので、同じ名前で
    //         31 個の具を作ると Inspector の Scene Explorer が id で
    //         ツリーを引くときに別の具を掴む。id だけ一意にしても
    //         ツリー表示は「potato」が 4 行並んでどれがどれか分からない
    //         ままなので、name と id の両方を一意にして揃える
    function named(mesh, base) {
        const u = base + "#" + (++_uid);
        mesh.name = u;
        mesh.id = u;
        return mesh;
    }

    // 巻き順の自動判定。center から refIndex 番の頂点への向きと法線の内積で見る。
    // summed = true なら全頂点の総和で判定する（形が読みにくいもの用）
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
    // 【対策】Catmull-Rom は制御点の間で行き過ぎることがあり、器の断面では
    //         「腰が一度外へ膨らんでから戻る」不自然な段が出る
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

    // 全頂点を鉛直に平行移動する
    function shiftY(positions, nV, dy) {
        for (let i = 0; i < nV; i++) positions[i * 3 + 1] += dy;
    }

    // AABB
    function bounds(positions, nV) {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
        for (let i = 0; i < nV; i++) {
            const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
        return { x0, x1, y0, y1, z0, z1 };
    }

    // updatable = true にすると頂点バッファを後から書き換えられる。
    // 煮詰めスライダーは幾何を作り直さずに色だけ焼き直すので、具には必要
    function makeMesh(name, positions, indices, normals, uvs, colors, scene, updatable) {
        const mesh = named(new BABYLON.Mesh(name, scene), name);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals;
        if (uvs) vd.uvs = uvs;
        if (colors) vd.colors = colors;
        vd.applyToMesh(mesh, !!updatable);
        // 【対策】頂点カラーを stride 4 で入れると Babylon が hasVertexAlpha を
        //         立て、不透明のはずのメッシュが透過パスへ回る。透過パスは
        //         深度書き込みが切られるので、液面が具を隠せなくなる
        mesh.hasVertexAlpha = false;
        mesh.tris = indices.length / 3;
        return mesh;
    }

    // =================================================================
    // 4. TexLab : DynamicTexture 生成の土台
    // =================================================================
    const TexLab = {
        _tex(name, w, h, fill, scene, linear, clampV) {
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
            dt.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
            dt.wrapV = clampV ? BABYLON.Texture.CLAMP_ADDRESSMODE : BABYLON.Texture.WRAP_ADDRESSMODE;
            // 【対策】ORM と法線は「色」ではない。既定の gammaSpace = true のままだと
            //         粗さ 0.34 が線形 0.10 として渡り、狙いよりつやつやになる
            if (linear) dt.gammaSpace = false;
            dt.anisotropicFilteringLevel = 16;
            return dt;
        },
        // 低周波の場は 1/step の格子で作って双一次で引き伸ばす。
        // wrapX = true のとき最終列は 0 列目へ折り返すので、回転体の
        // 周方向の継ぎ目は原理的に発生しない
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
        // 高さ場 → 接空間法線。周期境界で参照する
        normalFromHeight(name, N, H, strength, scene, clampV) {
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
            }, scene, true, clampV);
        }
    };

    // =================================================================
    // 5. Hachi : 鉢（回転体・高台つき・輪花対応）
    // =================================================================
    // 見込みと外側の曲線を1度だけ作る。外側は見込みの等厚オフセット。
    // 口縁の近くだけ法線を水平へ寝かせ、口縁の丸み（半円）で内外が
    // ぴたりとつながるようにする
    let _hachi = null;
    function hachiCurves(G) {
        if (_hachi) return _hachi;
        const f = monoSpline(HACHI_R, HACHI_Y);
        const NI = 240;
        const inR = new Float64Array(NI + 1), inY = new Float64Array(NI + 1);
        for (let i = 0; i <= NI; i++) { inR[i] = G.rIn * i / NI; inY[i] = f(inR[i]); }
        const outR = new Float64Array(NI + 1), outY = new Float64Array(NI + 1);
        for (let i = 0; i <= NI; i++) {
            const a = Math.max(0, i - 1), b = Math.min(NI, i + 1);
            const dy = (inY[b] - inY[a]) / Math.max(1e-9, inR[b] - inR[a]);
            const L = Math.hypot(1, dy);
            const t = G.wallThin + G.wallThick
                * Math.pow(clamp((G.wallKnee - inY[i]) / G.wallSpan, 0, 1), 1.7);
            const w = smooth(6.20, 7.00, inY[i]);
            const nr = (dy / L) * (1 - w) + w, ny = (-1 / L) * (1 - w);
            outR[i] = inR[i] + t * nr; outY[i] = inY[i] + t * ny;
        }
        // 外壁が高台の半径まで下りてくる添字
        let iStop = 0;
        while (iStop < NI && outR[iStop] < G.rFootOut) iStop++;
        _hachi = { inR: inR, inY: inY, outR: outR, outY: outY, NI: NI, iStop: iStop, f: f };
        return _hachi;
    }

    // 断面。中心（見込みの底）から外へ一筆で回り、底裏で中心へ戻る閉じた形。
    // k は部位のタグ: 0=見込み 1=口縁 2=外壁 3=高台/底裏
    function hachiProfile(G) {
        const W = hachiCurves(G), NI = W.NI;
        const P = [];
        const push = (r, y, k) => P.push({ r: r, y: y, k: k });
        // (1) 見込み: 中心 → 口縁の内側。innerRadiusAt と同じ表を刻むので、
        //     液面の半径とここの断面は厳密に一致する
        for (let i = 0; i <= NI; i += 4) push(W.inR[i], W.inY[i], 0);
        // (2) 口縁の丸み（半円）
        const cx = (G.rIn + G.rOut) * 0.5, rr = (G.rOut - G.rIn) * 0.5;
        const rimIndex = P.length + 5;
        for (let i = 1; i <= 12; i++) {
            const a = Math.PI * (1 - i / 12);
            push(cx + rr * Math.cos(a), G.rimY + rr * Math.sin(a), 1);
        }
        // (3) 外壁: 口縁の外 → 高台の付け根
        const outStart = P.length;
        for (let i = NI - 4; i >= W.iStop; i -= 4) push(W.outR[i], W.outY[i], 2);
        const probeIndex = outStart + 8;      // 外壁の上のほう。巻き順の判定に使う
        const yK = W.outY[W.iStop];
        // (4) 高台。削り出した段を経て接地面へ
        push(G.rFootOut, yK - 0.08, 2);
        push(G.rFootOut - 0.010, yK * 0.58, 2);
        push(G.rFootOut - 0.032, 0.46, 2);
        push(G.rFootOut - 0.070, 0.085, 3);
        push(G.rFootOut - 0.165, 0.0, 3);
        push(G.rFootIn + 0.075, 0.0, 3);
        push(G.rFootIn, 0.085, 3);
        push(G.rFootIn, 0.52, 3);
        push(G.rFootIn, G.yUnder - 0.15, 3);
        // (5) 底裏。中心へ向けてわずかに持ち上がる（浅い凹み）
        for (let i = 1; i <= 20; i++) {
            const u = 1 - i / 20;
            push(G.rFootIn * u, G.yUnder - 0.15 * Math.pow(u, 1.7), 3);
        }
        return { P: P, rimIndex: rimIndex, probeIndex: probeIndex };
    }

    // 断面の弧長を正規化した表。テクスチャを焼くのに v → (r,y) が要る。
    // 【対策】制御点の添字で v を刻むと、点が密な所（口縁）だけテクスチャが
    //         詰まって縞に見える。弧長で正規化する
    function profileTable(G) {
        const { P, rimIndex } = hachiProfile(G);
        const N = P.length;
        const arc = new Float32Array(N);
        for (let i = 1; i < N; i++) {
            arc[i] = arc[i - 1] + Math.hypot(P[i].r - P[i - 1].r, P[i].y - P[i - 1].y);
        }
        const total = arc[N - 1] || 1;
        for (let i = 0; i < N; i++) arc[i] /= total;
        return { P: P, arc: arc, vRim: arc[rimIndex], total: total };
    }

    function profileAt(tab, v) {
        const arc = tab.arc, P = tab.P, N = P.length;
        v = clamp(v, 0, 1);
        let lo = 0, hi = N - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arc[m] <= v) lo = m; else hi = m; }
        const span = arc[hi] - arc[lo];
        const t = span > 1e-9 ? (v - arc[lo]) / span : 0;
        return { r: mix(P[lo].r, P[hi].r, t), y: mix(P[lo].y, P[hi].y, t), k: P[lo].k };
    }

    // 見込みの内半径（高さ y での）。液面の半径とメニスカスを出すのに使う
    function innerRadiusAt(G, y) {
        const W = hachiCurves(G), NI = W.NI;
        if (y <= W.inY[0]) return 0;
        if (y >= W.inY[NI]) return G.rIn;
        let lo = 0, hi = NI;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (W.inY[m] <= y) lo = m; else hi = m; }
        const d = W.inY[hi] - W.inY[lo];
        return W.inR[lo] + (W.inR[hi] - W.inR[lo]) * (d > 1e-12 ? (y - W.inY[lo]) / d : 0);
    }

    // 見込みの高さ（半径 r での）。盛りの高さ場の初期値に使う
    function innerYAt(G, r) {
        const W = hachiCurves(G);
        return W.f(clamp(r, 0, G.rIn));
    }

    // 輪花（菊型）の変形。外周だけ花弁状に刻む。
    // 【対策】切れ込みを全高に効かせると、底までひだの入った「型抜きの
    //         プラスチック容器」になる。実物の輪花は口縁から腰までで、
    //         見込みの底は真円のまま。マスクで高さを切る
    function rinkaMod(G, hp, y, th, k) {
        if (!hp.rinka) return { dr: 0, dy: 0 };
        const n = hp.rinka | 0;
        const w = smooth(3.10, 5.60, y);                 // 腰から上だけ
        if (w <= 0) return { dr: 0, dy: 0 };
        const lobe = 0.5 - 0.5 * Math.cos(n * th);       // 0=稜 1=谷
        // 稜と谷で肉厚を変えないよう、内外を同じだけ動かす
        const dr = -G.rinkaDepth * w * lobe;
        // 口縁も谷でわずかに下がる。ここが平らだと「筒に溝を彫った」ものになる
        const dy = (k === 1 ? -1 : -smooth(5.90, 6.95, y)) * G.rinkaDepth * 0.42 * lobe;
        return { dr: dr, dy: dy };
    }

    function buildHachi(scene, G, hp, mat, rng) {
        const { P, rimIndex, probeIndex } = hachiProfile(G);
        const N = P.length, M = G.sides;
        const arc = new Float32Array(N);
        for (let i = 1; i < N; i++) {
            arc[i] = arc[i - 1] + Math.hypot(P[i].r - P[i - 1].r, P[i].y - P[i - 1].y);
        }
        const total = arc[N - 1] || 1;

        // 【対策】完全な真円だと口縁のハイライトが定規で引いた線になり、
        //         量産プラスチックに見える。内外の同じ高さをいっしょに
        //         動かすことで、肉厚を保ったまま口が波打つ
        const ph = [rng.range(0, 9), rng.range(0, 9), rng.range(0, 9), rng.range(0, 9)];
        const nV = N * (M + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array((N - 1) * M * 6);

        let vo = 0;
        for (let i = 0; i < N; i++) {
            const p = P[i];
            const mask = smooth(3.4, 6.9, p.y);      // 口縁だけ上下に振る
            for (let j = 0; j <= M; j++) {
                const th = (j % M) / M * TAU;
                const wob = 1 + G.wobble * (0.0038 * Math.sin(3 * th + ph[0])
                    + 0.0024 * Math.sin(5 * th + ph[1]));
                const dyw = G.wobble * mask * (0.024 * Math.sin(2 * th + ph[2])
                    + 0.013 * Math.sin(3 * th + ph[3]));
                const rk = rinkaMod(G, hp, p.y, th, p.k);
                const r = Math.max(0, p.r * wob + rk.dr);
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = r * Math.cos(th);
                positions[p3 + 1] = p.y + dyw + rk.dy;
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
        // 外壁 θ=0 の法線は +X を向くはず
        const normals = finalize(positions, indices, new V3(0, P[probeIndex].y, 0), probeIndex * (M + 1), false);
        weldNormals(positions, normals);

        const mesh = makeMesh("hachi", positions, indices, normals, uvs, null, scene);
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.vRim = arc[rimIndex] / total;
        return mesh;
    }

    // ---- 磁器のテクスチャ ---------------------------------------------
    // 【対策】白磁を「真っ白＋つるつる」で済ませると、器がレンダーの
    //         背景と同じ質感になって料理だけが浮く。実物の磁器には
    //         (a) 鉄粉の点（釉薬の下に沈んだ黒い点）
    //         (b) 貫入（釉薬のひび。網目状に走る）
    //         (c) ろくろ目（水平の浅いうねり）
    //         が必ずある。どれも 1% 未満のコントラストだが、無いと
    //         「3DCG の白いボウル」の顔になる
    function hachiTextures(scene, G, hp, seed) {
        const N = Math.max(64, Math.round(G.hachiTex) || 512);
        const n2 = N * N;
        const tab = profileTable(G);
        const rng = new Rng(seed >>> 0);

        // 行ごとに断面位置を引く（テクセルごとに二分探索すると重い）
        const rowR = new Float32Array(N), rowY = new Float32Array(N);
        const rowK = new Uint8Array(N);
        for (let y = 0; y < N; y++) {
            const s = profileAt(tab, (y + 0.5) / N);
            rowR[y] = s.r; rowY[y] = s.y; rowK[y] = s.k;
        }
        const cosT = new Float32Array(N), sinT = new Float32Array(N);
        for (let x = 0; x < N; x++) {
            const th = (x + 0.5) / N * TAU;
            cosT[x] = Math.cos(th); sinT[x] = Math.sin(th);
        }

        // 貫入。Worley の F2−F1（2番目に近い種と最も近い種の距離差）が
        // 0 に近いところ＝2つの領域の境界に線が出る。
        // 【対策】格子そのものの周期でジッタすると、亀裂が升目状に並んで
        //         金網に見える。種の位置は大きくばらつかせ、探索は 5×5 まで広げる
        const CELL = 0.62;                  // 貫入の目の粗さ [cm]
        function craze(wx, wy, wz) {
            // 器の面上の2Dパラメータ（周方向の弧長と断面の弧長）で見る。
            // ワールド 3D で取ると、口縁の内外で亀裂が向かい合ってしまう
            const u = Math.atan2(wz, wx) * Math.hypot(wx, wz) / CELL;
            const v = wy / CELL;
            const ui = Math.floor(u), vi = Math.floor(v);
            let f1 = 1e9, f2 = 1e9;
            for (let dj = -2; dj <= 2; dj++) {
                for (let di = -2; di <= 2; di++) {
                    const gi = ui + di, gj = vi + dj;
                    const hx = Noise._h2(gi, gj, seed + 601);
                    const hy = Noise._h2(gi, gj, seed + 607);
                    const px = gi + hx, py = gj + hy;
                    const d = Math.hypot(px - u, py - v);
                    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
                }
            }
            return f2 - f1;
        }

        const spot = new Float32Array(n2);   // 鉄粉
        const crz = new Float32Array(n2);    // 貫入
        const lathe = new Float32Array(n2);  // ろくろ目
        for (let y = 0; y < N; y++) {
            const wy = rowY[y], rr = rowR[y];
            // ろくろ目は高さだけの関数。1.1mm ピッチ
            const lz = 0.5 + 0.5 * Math.sin(wy / 0.11 * Math.PI);
            for (let x = 0; x < N; x++) {
                const i = y * N + x;
                const wx = rr * cosT[x], wz = rr * sinT[x];
                // 【対策】鉄粉を fbm の閾値で出すと、もやの塊になって「汚れ」に
                //         見える。点は点として出したいので、細かい格子の
                //         ハッシュを直接使い、当たったセルだけ丸く落とす
                const gs = 46.0;
                const gi = Math.floor(wx * gs), gj = Math.floor(wy * gs), gk = Math.floor(wz * gs);
                const h = Noise._h3(gi, gj, gk, seed + 811);
                let sp = 0;
                if (h > 0.9955) {
                    const cxp = (gi + 0.5) / gs, cyp = (gj + 0.5) / gs, czp = (gk + 0.5) / gs;
                    const d = Math.hypot(wx - cxp, wy - cyp, wz - czp) * gs;
                    sp = 1 - smooth(0.18, 0.46, d);
                }
                spot[i] = sp;
                crz[i] = 1 - smooth(0.0, 0.055, craze(wx, wy, wz));
                lathe[i] = lz * (0.6 + 0.4 * Noise.fbm2u(x / N * 7, wy * 1.4, 7, seed + 131, 2));
            }
        }

        const A = hp.albedo, SPK = hp.speck, CRZ = hp.craze;
        const albedo = TexLab._tex("hachiA", N, N, (d) => {
            for (let y = 0; y < N; y++) {
                const isIn = rowK[y] === 0;
                for (let x = 0; x < N; x++) {
                    const i = y * N + x;
                    let c = [A[0], A[1], A[2]];
                    // 鉄粉は釉の下なので、青みの残る灰色
                    c = mix3(c, [0.328, 0.318, 0.330], spot[i] * SPK);
                    // 貫入は茶色く染まる（使ううちに茶渋が入る）
                    c = mix3(c, [c[0] * 0.74, c[1] * 0.70, c[2] * 0.66], crz[i] * CRZ);
                    // ろくろ目はごく浅い明暗
                    c = mix3(c, [c[0] * 0.975, c[1] * 0.975, c[2] * 0.980], lathe[i] * 0.35);
                    if (isIn) { c = [c[0] * 0.995, c[1] * 0.996, c[2] * 1.000]; }
                    // 口縁の帯（縁錆など）
                    if (hp.rim) {
                        const v = (y + 0.5) / N;
                        const b = 1 - smooth(0, hp.rim.w, Math.abs(v - tab.vRim * hp.rim.at));
                        c = mix3(c, hp.rim.col, Math.pow(b, hp.rim.blur));
                    }
                    const k = i * 4;
                    d[k] = clamp(c[0], 0, 1) * 255;
                    d[k + 1] = clamp(c[1], 0, 1) * 255;
                    d[k + 2] = clamp(c[2], 0, 1) * 255;
                    d[k + 3] = 255;
                }
            }
        }, scene, false, true);

        const orm = TexLab._tex("hachiO", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const ro = clamp(hp.rough + 0.22 * crz[i] * CRZ + 0.10 * spot[i]
                    + 0.035 * lathe[i], 0.03, 0.96);
                const k = i * 4;
                d[k] = 255; d[k + 1] = ro * 255; d[k + 2] = 0; d[k + 3] = 255;
            }
        }, scene, true, true);

        // 起伏はろくろ目が主。貫入は釉の中の割れなので表面には出ない
        const H = new Float32Array(n2);
        for (let i = 0; i < n2; i++) {
            H[i] = clamp(0.5 - 0.30 * lathe[i] - 0.10 * spot[i] - 0.04 * crz[i], 0, 1);
        }
        const normal = TexLab.normalFromHeight("hachiN", N, H, 1.15, scene, true);

        // 釉のムラ。R=被覆率 G=粗さ
        const coat = TexLab._tex("hachiC", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const w = clamp(0.90 + 0.10 * lathe[i] - 0.35 * spot[i], 0, 1);
                const r2 = clamp(0.42 + 0.30 * crz[i] * CRZ + 0.24 * lathe[i], 0, 1);
                const k = i * 4;
                d[k] = w * 255; d[k + 1] = r2 * 255; d[k + 2] = 0; d[k + 3] = 255;
            }
        }, scene, true, true);

        return { albedo: albedo, orm: orm, normal: normal, coat: coat, vRim: tab.vRim };
    }

    function hachiMaterial(scene, G, hp, name, seed) {
        const t = hachiTextures(scene, G, hp, seed);
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
        m.bumpTexture.level = 0.55;
        // 釉薬は透明なガラス層。素地と釉を1枚の PBR で表すと磁器に見えない
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = t.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        m.clearCoat.intensity = hp.coat;
        m.clearCoat.roughness = hp.coatRough;
        m.clearCoat.indexOfRefraction = 1.52;
        // 【対策】磁器は薄い所（口縁）で光を通す。これが無いと縁が
        //         紙のように硬く切れて、陶器ではなく塗った金属に見える
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.16;
        m.subSurface.tintColor = col3([0.90, 0.92, 0.96]);
        m.subSurface.minimumThickness = 0.02;
        m.subSurface.maximumThickness = 0.32;
        m.texs = [t.albedo, t.orm, t.normal, t.coat];
        return m;
    }

    // =================================================================
    // 6. Chunks : 具
    // =================================================================
    // じゃがいも・にんじんは「棒や球を何枚かの平面で切ったもの」で、
    // 煮込みで角が丸まっている。個別に作らず、支持関数のソフト最小で統一する。
    //
    //   方向 v に対する半径を
    //     ellipsoid : r_e(v) = 1/√((vx/ax)² + (vy/ay)² + (vz/az)²)
    //     切断面     : r_p(v) = d/(v·n)          (v·n > 0 のときだけ)
    //   として、softmin_k(r_e, r_p...) を取る。
    //
    // 【対策】球と平面を線形補間で混ぜると、平面であるべき切断面まで
    //         丸くなって「石鹸」になる。ソフト最小なら、面の中心では
    //         平面がそのまま残り、稜線の近傍だけが丸まる。
    //         丸めの幅 k は煮込み時間そのもの。肉じゃがのじゃがいもは
    //         カレーの倍以上ある（k=0.072 → 0.118）。理由は2つで、
    //         (a) 煮くずれ防止に最初から面取りしてある
    //         (b) 落とし蓋の下で 20 分ぶつかり合って角が落ちる
    function softmin(vals, k) {
        let m = Infinity;
        for (const v of vals) if (v < m) m = v;
        if (!isFinite(m)) return 1e9;
        let s = 0;
        for (const v of vals) { if (isFinite(v)) s += Math.exp(-(v - m) / k); }
        return m - k * Math.log(Math.max(1e-12, s));
    }

    // 一部の頂点だけ法線を溶接する。
    // 【対策】玉ねぎのくし切りや牛肉の薄切りは、包丁の切り口が
    //         「稜線として立っている」ことが形の決め手になる。
    //         全体に weldNormals を掛けると切り口まで丸まって、
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

    // 姿勢クォータニオン → 行列。全部品で共通に使う
    function applyPose(positions, normals, nV, q, scale, cx, cz) {
        const m = BABYLON.Matrix.Identity();
        BABYLON.Matrix.FromQuaternionToRef(q, m);
        const tv = new V3(), tn = new V3();
        for (let i = 0; i < nV; i++) {
            tv.set(positions[i * 3] * scale, positions[i * 3 + 1] * scale, positions[i * 3 + 2] * scale);
            V3.TransformCoordinatesToRef(tv, m, tv);
            positions[i * 3] = tv.x + cx; positions[i * 3 + 1] = tv.y; positions[i * 3 + 2] = tv.z + cz;
            tn.set(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
            V3.TransformNormalToRef(tn, m, tn);
            const l = Math.hypot(tn.x, tn.y, tn.z) || 1;
            normals[i * 3] = tn.x / l; normals[i * 3 + 1] = tn.y / l; normals[i * 3 + 2] = tn.z / l;
        }
    }

    // ---- 塊（じゃがいも / にんじん）-----------------------------------
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
                    //         円柱の側面に来てしまい、肝心の切り口が
                    //         格子の 2 列だけで表現される。軸を極に合わせる
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

    // ---- 具のプロファイル ------------------------------------------------
    // 色はすべて sRGB。参考写真3枚の実測から、煮汁の膜のぶんを
    // Beer–Lambert で割り戻した「素の色」を置く。
    // 【対策】写真から拾った色をそのままアルベドに入れると、この上に
    //         さらに膜を掛けるので二重に暗くなり、全部が焦げ茶に沈む
    const CHUNK_SPEC = {
        potato: {
            label: "じゃがいも",
            // 【対策】2.03 は差し渡し 4cm 前後。器の口径 16.2cm に対して
            //         大きすぎて、盛りの半分をじゃがいもが占めていた。
            //         一口大（2.8〜3.2cm）に落として個数で補う
            size: 1.58,                            // 代表半径 [cm]
            // 実測（写真3, 膜込み）sRGB(0.886, 0.765, 0.510) を
            // exp(-2σt), t=0.038 で割り戻すと (0.909, 0.804, 0.552)
            // 【対策】最初の実測はハイライトを含む所を測っていて、
            //         鏡面の白が混ざったぶん青が持ち上がっていた。
            //         鏡面を避けて測り直すと、煮含めたじゃがいもは
            //         linear で B/R = 0.05〜0.10 の琥珀。前は 0.28 あった
            body: [0.982, 0.826, 0.315],
            cutCol: [0.936, 0.831, 0.363],         // 面取り・煮くずれた所は粉っぽい
            deep: [0.832, 0.636, 0.188],
            rough: 0.62, coat: 0.60, coatRough: 0.058,
            trans: 0.20, thick: 0.30,
            transTint: [0.960, 0.720, 0.240],
            wetBody: 1.00, wetCut: 1.48,           // 断面は多孔質でよく吸う
            k: 0.118,                              // ★面取り＋煮込みで角が落ちる
            // 【対策】切断面の距離を 0.60〜0.86 で振ると、4 枚に切られた
            //         結果の体積が 2 倍近く動く。じゃがいも 5 個ぶんでも
            //         打ち消し合わず、盛りの総量がシードごとに
            //         184〜249cm³ と揺れて山の高さが安定しない
            axes: [1.00, 0.88, 0.95], nPlane: 4, planeD: [0.70, 0.86],
            bands: [{ f: 1.6, a: 0.048 }, { f: 3.8, a: 0.026 }, { f: 10.0, a: 0.011 }],
            nP: 24, nT: 36
        },
        carrot: {
            label: "にんじん",
            size: 1.25,
            // にんじんは写真でも青がほとんど無い（linear で B/R < 0.04）。
            // 前の値は赤が暗く青が残っていたので、赤ピーマンに見えていた
            body: [0.957, 0.425, 0.045],
            cutCol: [0.894, 0.457, 0.062],
            deep: [0.712, 0.254, 0.018],
            core: [0.902, 0.563, 0.098],           // 芯（木部）は淡い
            rough: 0.38, coat: 0.64, coatRough: 0.048,
            trans: 0.44, thick: 0.32,
            transTint: [0.880, 0.226, 0.030],   // 逆光のにんじんは真っ赤に透ける
            wetBody: 0.88, wetCut: 1.12,        // 緻密で吸わない
            k: 0.052,                              // 乱切りの稜線は立っている
            axes: [0.80, 1.10, 0.80], cylR: 0.80, taper: 0.14, layDown: true,
            nPlane: 2, planeD: [0.62, 0.90],
            bands: [{ f: 2.6, a: 0.022 }, { f: 8.0, a: 0.011 }],
            nP: 22, nT: 34
        }
    };

    // 塊1個。ローカルで作り、姿勢と位置を与えて返す
    function makeBlobPiece(kind, sc, q, cx, cz, seed) {
        const S = CHUNK_SPEC[kind];
        const rng = new Rng(seed >>> 0);
        // 切断面をランダムな向きに配る。
        // 【対策】平面をランダムに置くと、たまたま2枚が近い向きになって
        //         薄い破片ができる。黄金角で回して最低限ばらけさせる
        const planes = [];
        for (let i = 0; i < S.nPlane; i++) {
            if (kind === "carrot") {
                // 乱切り: 棒を転がしながら斜めに切る。
                // 【対策】2枚の切り口の方位が揃うと、ただの平行四辺形の
                //         輪切りになる。1枚目の方位を覚えて2枚目をずらす
                const s = i === 0 ? 1 : -1;
                const a = rng.range(0.38, 0.80);
                const b = (i === 0) ? rng.range(0, TAU)
                    : planes[0].az + rng.range(1.55, 2.65) * (rng.next() < 0.5 ? 1 : -1);
                const n = [Math.sin(a) * Math.cos(b), s * Math.cos(a), Math.sin(a) * Math.sin(b)];
                const l0 = Math.hypot(n[0], n[1], n[2]) || 1;
                planes.push({
                    n: [n[0] / l0, n[1] / l0, n[2] / l0], az: b,
                    d: rng.range(S.planeD[0], S.planeD[1])
                });
                continue;
            }
            const ga = i * GOLD + rng.range(0, 0.9);
            const el = rng.range(-0.85, 0.85);
            const cl = Math.sqrt(Math.max(0, 1 - el * el));
            const n = [cl * Math.cos(ga), el, cl * Math.sin(ga)];
            const l = Math.hypot(n[0], n[1], n[2]) || 1;
            planes.push({ n: [n[0] / l, n[1] / l, n[2] / l], d: rng.range(S.planeD[0], S.planeD[1]) });
        }
        // 【対策】じゃがいもを全部きれいな形にすると、缶詰の新じゃがに見える。
        //         肉じゃがの芋は 3 個に 1 個は角が崩れているので、
        //         個体ごとに高周波の振幅を持ち上げる
        const crumble = (kind === "potato" && rng.next() < 0.38) ? rng.range(1.6, 2.6) : 1.0;
        const bands = S.bands.map((b, i) => ({ f: b.f, a: b.a * (i === 0 ? 1 : crumble) }));

        const g = buildBlob({
            axes: S.axes, cylR: S.cylR, taper: S.taper,
            planes: planes, k: S.k * (kind === "potato" ? rng.range(0.85, 1.15) : 1),
            bands: bands, seed: seed
        }, S.nP, S.nT);

        // ---- 素の色と「膜の付きやすさ」を頂点へ焼く --------------------
        const nV = g.nV;
        const base = new Float32Array(nV * 3);
        const wet = new Float32Array(nV);
        const cr = new Rng((seed ^ 0x3C0A) >>> 0);
        const tone = cr.range(-0.055, 0.055);
        const warm = cr.range(0.975, 1.03);
        for (let i = 0; i < nV; i++) {
            const cutW = g.cut[i], b = g.bump[i];
            // 出っ張りは煮汁が当たって濃く、くぼみは淡い（SKILL 2.1）
            let c = mix3(S.body, S.deep, clamp(0.5 + b / 0.085 + tone, 0, 1) * 0.55);
            c = mix3(c, S.cutCol, cutW * 0.72);
            if (S.core) {
                // 【対策】にんじんの芯（木部）は切断面の中央にだけ見える。
                //         切断面らしさ cutW と、面の中心らしさ（ノイズが
                //         小さいところ＝平らなところ）の積で出す
                const coreW = cutW * cutW * (1 - smooth(0.010, 0.045, Math.abs(b)));
                c = mix3(c, S.core, coreW * 0.55);
            }
            c = [c[0] * warm, c[1], c[2] / warm];
            base[i * 3] = c[0]; base[i * 3 + 1] = c[1]; base[i * 3 + 2] = c[2];
            wet[i] = mix(S.wetBody, S.wetCut, cutW);
        }
        applyPose(g.positions, g.normals, nV, q, S.size * sc, cx, cz);
        return {
            kind: kind, seed: seed, spec: S, nV: nV,
            positions: g.positions, indices: g.indices, normals: g.normals,
            uvs: g.uvs, base: base, wet: wet
        };
    }

    // ---- 玉ねぎのくし切り ------------------------------------------------
    // 【対策】カレー.js の玉ねぎは「煮崩れて薄い膜になったもの」で、
    //         これは長時間煮るカレー特有の姿。肉じゃがの玉ねぎは
    //         20 分しか煮ないので、くし切りの形が残ったまま透き通る。
    //         写真3では 3cm 近い大きな一片が丸ごと写っている。
    //
    //         くし切り = 扁平な回転楕円体を、極を通る2枚の半平面で
    //         切り出した「みかんの房」。この立体には性質がひとつあって、
    //         切断面（軸を含む鉛直半平面）は必ず平面になる。
    //         そこに現れる皮の層は、半径方向の比率 t が一定の曲線
    //         ——つまり相似に縮小した半楕円——として並ぶ。
    //         層を「同心円」で描くと球の断面になってしまうので、
    //         かならず t（相似比）で刻む
    const ONION = {
        label: "玉ねぎ",
        size: 1.91,                              // 赤道半径 [cm]
        flat: 0.80,                              // 極方向の扁平率
        // 【対策】反復で合わせると R と G が両方 0.98 で頭打ちになり、
        //         G/R = 1.00 の無彩色に振れる。煮えた玉ねぎは飴色に寄った
        //         クリームなので、明るさは少し譲って色味を残す
        body: [0.962, 0.868, 0.632],
        layer: [0.880, 0.742, 0.462],            // 層の境目（煮汁が入って濃い）
        edge: [0.972, 0.930, 0.752],             // 縁は薄くて光が抜ける
        deep: [0.796, 0.652, 0.386],
        rough: 0.30, coat: 0.66, coatRough: 0.044,
        trans: 0.72, thick: 0.24,
        transTint: [0.96, 0.84, 0.56],
        wetBody: 1.15, wetCut: 1.38,
        nPsi: 30, nTh: 16, nRad: 14
    };

    function buildOnionWedge(sc, q, cx, cz, seed) {
        const O = ONION, rng = new Rng(seed >>> 0);
        const NP = O.nPsi, NT = O.nTh, NS = O.nRad;
        // 【対策】「煮えた房は外側ほど開く」を方位角を t で広げる形
        //         （th = thN * (1 + fan*t)）で入れると、切り口が
        //         平面ではなく線織面になって 0.3mm ねじれる。包丁は
        //         平面しか作らない。開きは半角そのものと層の溝で出し、
        //         切り口は y 軸を含む半平面に厳密に載せる
        const half = rng.range(0.34, 0.52);          // 房の半角 [rad]（≒39〜60°）
        const thMid = 0;
        const th0 = thMid - half, th1 = thMid + half;
        const H = O.flat * rng.range(0.90, 1.08);    // 極半径
        const nSeed = seed + 77;
        // 層の境目。外ほど厚い（実物の鱗片は外側が厚い）
        const nLay = 6 + rng.int(3);
        const lay = [];
        { let t = 1.0; for (let i = 0; i < nLay; i++) { lay.push(t); t *= rng.range(0.70, 0.84); } }

        // 赤道半径の向き依存のゆらぎ（玉ねぎは真球ではない）
        const Rof = (psi, th) => {
            const s = Math.sin(psi);
            let r = 1 + 0.045 * (Noise.v3(Math.cos(th) * 1.7, Math.cos(psi) * 1.9, Math.sin(th) * 1.7, nSeed) - 0.5) * 2;
            // 根元と芽の側はわずかにへこむ
            r *= 1 - 0.070 * Math.pow(Math.abs(Math.cos(psi)), 5);
            return r * s;
        };
        // 層の溝。t が境目に近いほど 1
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
        const base = new Float32Array(nV * 3);
        const wet = new Float32Array(nV);
        const idx = [];

        // 房の点。t=1 が外周、t=0 が軸
        function pt(psi, thN, t, out) {
            const th = thN;                          // ← 方位角は t に依らない＝切り口は平面
            const rho = Rof(psi, th) * t;
            // 層の溝ぶんだけ内へ引く。
            // 【対策】溝の深さを極でも一定にすると、軸へ集まるはずの
            //         頂点が溝ぶんだけ散って中心に微小な棘が立ち、
            //         法線が壊れる。極では溝を閉じる
            const gr = grooveAt(t) * 0.012 * Math.sin(psi);
            out[0] = (rho - gr) * Math.cos(th);
            out[1] = H * Math.cos(psi) * (1 - gr * 0.4);
            out[2] = (rho - gr) * Math.sin(th);
        }

        const tmp = [0, 0, 0];
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
                // 外周は皮に近い層。うっすら黄色い
                const sh = Noise.fbm3(tmp[0] * 3.1, tmp[1] * 3.1, tmp[2] * 3.1, nSeed + 5, 2) - 0.5;
                const c = mix3(O.body, O.deep, clamp(0.5 + sh * 1.6, 0, 1) * 0.42);
                base[p3] = c[0]; base[p3 + 1] = c[1]; base[p3 + 2] = c[2];
                wet[vo] = O.wetBody;
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

        // (b) 切断面 ×2。s=0 が軸、s=1 が外周
        for (let side = 0; side < 2; side++) {
            const thN = side ? th1 : th0;
            const b0 = vo;
            for (let i = 0; i <= NP; i++) {
                const psi = i / NP * Math.PI;
                for (let s = 0; s <= NS; s++) {
                    // 【対策】t を等間隔に刻むと、外側の薄い層が 1 マスに
                    //         2 本入って潰れる。層の位置が格子に乗るよう
                    //         外側を密に刻む
                    const t = Math.pow(s / NS, 0.72);
                    pt(psi, thN, t, tmp);
                    const p3 = vo * 3, p2 = vo * 2;
                    positions[p3] = tmp[0]; positions[p3 + 1] = tmp[1]; positions[p3 + 2] = tmp[2];
                    uvs[p2] = t; uvs[p2 + 1] = i / NP;
                    // 層の縞。境目は煮汁が入って濃く、層の中ほどは淡い
                    const gr = grooveAt(t);
                    let c = mix3(O.body, O.layer, gr * 0.75);
                    // 縁（外周と極の近く）は薄くて明るい
                    const eg = smooth(0.86, 1.0, t) * 0.55
                        + smooth(0.90, 1.0, Math.abs(Math.cos(psi))) * 0.45;
                    c = mix3(c, O.edge, clamp(eg, 0, 1) * 0.55);
                    base[p3] = c[0]; base[p3 + 1] = c[1]; base[p3 + 2] = c[2];
                    wet[vo] = mix(O.wetCut, O.wetCut * 1.18, gr);
                    vo++;
                }
            }
            for (let i = 0; i < NP; i++) {
                for (let s = 0; s < NS; s++) {
                    const p = b0 + i * (NS + 1) + s;
                    // 【対策】外周の面は th0 側の境界を i+1→i、th1 側を
                    //         i→i+1 の向きで走る。切断面はその逆向きで
                    //         張らないと、稜線 30 本ぶんの巻きが揃わず
                    //         切り口だけ法線が内を向く（軸で出会う 2 枚は
                    //         互いに逆向きのままなので、両方入れ替える）
                    if (side === 0) idx.push(p, p + 1, p + NS + 1, p + 1, p + NS + 2, p + NS + 1);
                    else idx.push(p, p + NS + 1, p + 1, p + 1, p + NS + 1, p + NS + 2);
                }
            }
        }

        const indices = new Uint32Array(idx);
        const normals = finalize(positions, indices, new V3(0, 0, 0), 0, true);
        // 【対策】全体に weldNormals を掛けると切り口の稜線が丸まって
        //         「はんぺん」になる。外周の面の極（NT+1 個の頂点が
        //         1点に縮退している所）だけを溶接する
        weldRange(positions, normals, 0, outerEnd);
        // 切断面も極（psi=0, PI）で NS+1 個が 1 点に縮退している。
        // 面ごとに分けて溶接すれば、軸で出会う 2 枚の稜線は保たれる
        weldRange(positions, normals, outerEnd, outerEnd + nFace);
        weldRange(positions, normals, outerEnd + nFace, nV);
        applyPose(positions, normals, nV, q, O.size * sc, cx, cz);
        return {
            kind: "onion", seed: seed, spec: O, nV: nV,
            positions, indices, normals, uvs, base, wet
        };
    }

    // ---- さやいんげん ----------------------------------------------------
    // 【対策】円柱を緑に塗ると「抹茶のスティック」になる。いんげんの
    //         見分けが付くのは (a) 断面が円ではなく縦長の楕円
    //         (b) 中の豆が透けて等間隔のふくらみとして出る
    //         (c) 斜め切りの切り口が淡い黄緑で、そこだけ光が抜ける
    //         の3点。とくに (c) が無いとただの緑の棒になる
    const BEAN = {
        label: "さやいんげん",
        size: 1.75,                    // 半長 [cm]（＝全長 3.5cm）
        rad: 0.235,                    // 太さ [cm]
        // 【対策】明るい黄緑は生のさやの色。20分煮た絹さやは青が抜けて
        //         暗いオリーブになる（写真Aは sRGB 0.11/0.10/0.02）
        body: [0.354, 0.514, 0.052],
        lit: [0.469, 0.655, 0.092],    // 張りのある面
        deep: [0.197, 0.300, 0.024],   // 影の側／煮汁の染みた所
        cutCol: [0.780, 0.881, 0.212], // 斜め切りの断面
        seed_: [0.612, 0.734, 0.148],  // 中の豆
        rough: 0.36, coat: 0.60, coatRough: 0.050,
        trans: 0.58, thick: 0.16,
        transTint: [0.34, 0.58, 0.06],
        wetBody: 0.58,                 // 蝋質の皮。煮汁をはじく
        wetCut: 1.30,
        nRing: 26, nSide: 16
    };

    function buildBean(sc, q, cx, cz, seed) {
        const B = BEAN, rng = new Rng(seed >>> 0);
        const NR = B.nRing, NS = B.nSide;
        const bendA = rng.range(0.06, 0.20), bendPh = rng.range(0, TAU);
        const R = B.rad / B.size * rng.range(0.92, 1.10);   // 半長=1 の局所寸法へ
        const flat = rng.range(0.72, 0.84);                 // 断面の扁平（縦長）
        const nBeans = 3 + rng.int(2);
        const beanPh = rng.range(0, 1);
        // 斜め切り。両端で向きが違う（転がしながら切るので）
        const slope0 = rng.range(0.35, 0.85), az0 = rng.range(0, TAU);
        const slope1 = rng.range(0.35, 0.85), az1 = az0 + rng.range(1.2, 2.6);
        const nSeed = seed + 313;

        const nBody = (NR + 1) * (NS + 1);
        const nV = nBody + 2;                                // ＋両端の中心
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const base = new Float32Array(nV * 3);
        const wet = new Float32Array(nV);
        const idx = [];

        let vo = 0;
        for (let i = 0; i <= NR; i++) {
            const t = i / NR;
            // 背骨（ゆるく弓なり）。長軸は y
            const cxp = bendA * Math.sin(Math.PI * t) * Math.cos(bendPh);
            const czp = bendA * Math.sin(Math.PI * t) * Math.sin(bendPh);
            // 豆のふくらみ。等間隔に並ぶ
            const pod = 1 + 0.085 * Math.cos(TAU * (t * nBeans + beanPh));
            for (let j = 0; j <= NS; j++) {
                const phi = (j % NS) / NS * TAU;
                const cp = Math.cos(phi), sp = Math.sin(phi);
                let r = R * pod * (1 + 0.028 * (Noise.v2(t * 9, phi * 2.2, nSeed) - 0.5) * 2);
                // 断面は縦長の楕円。さらに背側に稜（すじ）が1本
                const ex = r * flat, ez = r;
                const ridge = 1 + 0.055 * Math.exp(-Math.pow((Math.cos(phi) - 1) * 2.2, 2));
                // 斜め切りぶん、リングを長手方向にずらす
                const cut0 = slope0 * (Math.cos(phi) * Math.cos(az0) + Math.sin(phi) * Math.sin(az0)) * R;
                const cut1 = slope1 * (Math.cos(phi) * Math.cos(az1) + Math.sin(phi) * Math.sin(az1)) * R;
                const yBase = (t - 0.5) * 2;
                const y = yBase + (1 - t) * cut0 - t * cut1;
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = cxp + ex * cp * ridge;
                positions[p3 + 1] = y;
                positions[p3 + 2] = czp + ez * sp * ridge;
                uvs[p2] = j / NS; uvs[p2 + 1] = t;
                // 色。稜（すじ）は明るく、腹は濃い。煮え具合の斑も入れる
                const mott = Noise.fbm2u(j / NS * 6, t * 11, 6, nSeed + 3, 3);
                let c = mix3(B.deep, B.lit, clamp(0.35 + mott * 0.95, 0, 1));
                c = mix3(c, B.body, 0.42);
                // 豆のふくらみの頂上は張って明るい
                c = mix3(c, B.lit, smooth(1.03, 1.085, pod) * 0.35);
                base[p3] = c[0]; base[p3 + 1] = c[1]; base[p3 + 2] = c[2];
                wet[vo] = B.wetBody;
                vo++;
            }
        }
        for (let i = 0; i < NR; i++) {
            for (let j = 0; j < NS; j++) {
                const p = i * (NS + 1) + j;
                idx.push(p, p + 1, p + NS + 1, p + 1, p + NS + 2, p + NS + 1);
            }
        }
        // 両端の切り口（斜めの楕円）を中心で扇状に閉じる
        const capA = vo, capB = vo + 1;
        for (const [ci, row] of [[capA, 0], [capB, NR]]) {
            let sx = 0, sy = 0, sz = 0;
            for (let j = 0; j < NS; j++) {
                const p = row * (NS + 1) + j;
                sx += positions[p * 3]; sy += positions[p * 3 + 1]; sz += positions[p * 3 + 2];
            }
            positions[ci * 3] = sx / NS; positions[ci * 3 + 1] = sy / NS; positions[ci * 3 + 2] = sz / NS;
            uvs[ci * 2] = 0.5; uvs[ci * 2 + 1] = row === 0 ? 0 : 1;
            base[ci * 3] = B.cutCol[0]; base[ci * 3 + 1] = B.cutCol[1]; base[ci * 3 + 2] = B.cutCol[2];
            wet[ci] = B.wetCut;
            for (let j = 0; j < NS; j++) {
                // 【対策】胴は row 0 を j→j+1、row NR を j+1→j の向きで
                //         走る。扇はその逆向きで張らないと巻きが揃わず、
                //         斜め切りの切り口だけ法線が内を向く
                const p = row * (NS + 1) + j;
                if (row === 0) idx.push(ci, p + 1, p); else idx.push(ci, p, p + 1);
            }
        }
        // 【対策】切り口を1色で塗ると「切ったマカロニ」になる。実物は
        //         さやの縁だけが緑で、中の豆と綿は淡い黄緑。
        //         切り口のリングは中心へ向かって色を抜く
        for (const row of [0, NR]) {
            for (let j = 0; j <= NS; j++) {
                const p = row * (NS + 1) + j;
                const c = mix3([base[p * 3], base[p * 3 + 1], base[p * 3 + 2]], B.cutCol, 0.62);
                base[p * 3] = c[0]; base[p * 3 + 1] = c[1]; base[p * 3 + 2] = c[2];
                wet[p] = mix(B.wetBody, B.wetCut, 0.7);
            }
        }
        const indices = new Uint32Array(idx);
        const normals = finalize(positions, indices, new V3(0, 0, 0), 0, true);
        weldNormals(positions, normals);
        applyPose(positions, normals, nV, q, B.size * sc, cx, cz);
        return {
            kind: "bean", seed: seed, spec: B, nV: nV,
            positions, indices, normals, uvs, base, wet
        };
    }

    // ---- 牛肉の薄切り ----------------------------------------------------
    // 【対策】カレー.js の肉は角切りの塊だった。肉じゃがの肉は
    //         厚さ 1.5mm の薄切りで、鍋の中でくしゃっと畳まれている。
    //         これを塊で作ると、どう色を付けても「レバー」になる。
    //         薄い面をしわくちゃにするのが唯一の解。要点は3つ:
    //           ・輪郭が不定形（包丁で引いたのではなく、スライサーの
    //             切り落とし。丸くも四角くもない）
    //           ・折り目は1本の大きな山と、その上に乗る細かいしわ
    //           ・脂とすじが繊維方向に white な筋として走る。
    //             これが無いと均一な茶色い紙になる
    const MEATS = {
        beef: {
            label: "牛薄切り",
            // 【対策】4cm 角のシートを 8 枚積むと、投影面積だけで 88cm² に
            //         なり、盛りの footprint（半径 6cm＝113cm²）をほぼ
            //         1 枚の層で埋めてしまう。鍋の中の薄切り肉は
            //         平らに広がらず小さく縮れて丸まるので、3.2cm 角に
            // 帯にしたぶん代表半径を下げる。長辺 ≒ 2*size*A*outR ≒ 6.5cm、
            // 短辺 ≒ 2.5cm。巻くと 3cm 前後の塊になる
            size: 1.20,                            // 代表半径 [cm]
            thick: 0.145,
            // 【対策】これは生〜レアの牛肉の色で、煮汁の膜を掛けると
            //         ほぼ黒（器の白比 0.08）に潰れて椎茸に見えていた。
            //         20分煮た薄切り牛は赤みが飛んだ淡い灰褐色で、
            //         写真では器の白比 0.28〜0.79 とかなり明るい
            // 【対策】較正の反復が全フィールドを一様な倍率で動かしたので、
            //         赤身 [0.814,0.731,0.549] と脂 [0.902,0.862,0.742] が
            //         ほぼ同じ色になっていた。さしを描いても見えない。
            //         平均は写真に合っていたが、見た目を決めるのは
            //         脂の白と赤身の差のほう
            body: [0.740, 0.545, 0.430],           // 火の通った赤身
            sear: [0.430, 0.290, 0.205],           // 火の当たった濃い所
            raw: [0.700, 0.430, 0.395],            // 火の通りきらない断面
            fat: [0.945, 0.905, 0.790],            // 脂・すじ
            fatAmt: 0.42,
            searAmt: 0.55,                         // 焼き色の強さ
            rough: 0.48, coat: 0.58, coatRough: 0.055,
            trans: 0.14, thick3: 0.14,
            transTint: [0.52, 0.26, 0.15],
            wetBody: 0.96, wetFat: 0.62            // 繊維の隙間によく溜まる
        },
        pork: {
            label: "豚こま切れ",
            koma: true,
            size: 1.02, thick: 0.170,
            // 【対策】桃色に寄せすぎて生肉に見えていた。煮えた豚は
            //         ミオグロビンが変性しきっているので赤みは残らず、
            //         灰色がかった淡い茶褐色になる（写真2〜5）。
            //         脂と赤身の差も、生の こま切れ ほど大きくない
            //         実測すると写真の豚は G/R=0.43〜0.56, B/R=0.13〜0.25。
            //         灰色へ寄せすぎると今度は生煮えの豚に見えるので、
            //         緑を 0.82 倍・青を 0.61 倍して琥珀側へ戻す
            body: [0.792, 0.622, 0.470],
            sear: [0.560, 0.394, 0.276],
            raw: [0.800, 0.588, 0.456],
            fat: [0.898, 0.784, 0.627],
            // 【対策】0.86 + 縁 0.42 では面の大半が白くなり、脂身の塊に
            //         見えていた。煮上がると脂は溶けて縮み、白い所は
            //         写真でも 2 割ほど
            fatAmt: 0.46,
            // 【対策】肉じゃがの肉は煮ているだけで焼き目は付かない。
            //         焼き色を平均 37% も混ぜていたので、干し肉のような
            //         濃い斑になっていた。豚はほとんど焼けない
            searAmt: 0.18,
            // 【対策】長辺に沿った白い層は豚バラ薄切りの構造で、こま切れ
            //         には当てはまらない。端材なので脂は縁や折れ目に
            //         かたまりで付く。帯は弱めて、塊のさしを主にする
            fatBand: 1.5, fatBandMix: 0.30,
            fatEdge: 0.16,                         // 縁に脂が寄る
            rough: 0.44, coat: 0.60, coatRough: 0.052,
            // 【対策】透光が強いと蝋のように見える。煮えた肉は
            //         生ほど光を通さない
            trans: 0.09, thick3: 0.16,
            transTint: [0.60, 0.28, 0.22],
            wetBody: 0.90, wetFat: 0.58
        }
    };

    // grid を渡すと、中面を手続き的な縮れではなく「静定後の布の質点」から
    // 作る。位相（極座標グリッド）は描画メッシュと共通なので、双一次補間で
    // 5x12 の質点から 16x40 の中面へそのまま持ち上がる。
    // grid のときは座標がすでにワールド cm なので applyPose は掛けない
    // 薄切り肉の「形の素」。布の初期形状と描画メッシュで同じ乱数列を
    // 使いたいので切り出してある
    function meatShape(kind, seed) {
        const M = MEATS[kind];
        const rng = new Rng(seed >>> 0);
        const nSeed = seed + 991;
        // こま切れは整形された薄切りではなく端材なので、1枚ごとに
        // 縦横比も輪郭の乱れも大きく振れる
        const K = M.koma ? 1 : 0;
        // 【対策】1.05 : 0.62 はほぼ円板で、焼き上がると干し椎茸に見える。
        //         薄切り肉は「細長い帯」で、煮ると縮んで丸まる
        // 【対策】1.90〜2.60 : 0.72〜0.98 だと全部が同じ細長い帯になり、
        //         スライサーで整えた薄切りに見える。こま切れは大きさも
        //         形もばらばらで、正方形に近い塊も細い切れ端も混ざる
        const A = K ? rng.range(1.05, 2.75) : rng.range(1.90, 2.60);
        const Bz = K ? rng.range(0.60, 1.30) : rng.range(0.72, 0.98);
        // 輪郭。スライサーの切り落としなので、円でも四角でもない
        const oA = K ? 0.46 : 0.30, oB = K ? 0.26 : 0.14;
        const outR = (a) => 1 + oA * (Noise.fbm2u(a / TAU * 5, 0.5, 5, nSeed + 1, 3) - 0.5) * 2
            + oB * (Noise.fbm2u(a / TAU * 11, 1.5, 11, nSeed + 2, 2) - 0.5) * 2;
        // 折り目。大きな山ひとつ＋細かいしわ
        const foldA = rng.range(0, TAU), foldK = rng.range(1.6, 2.8);
        // 【対策】こま切れ化で 0.34〜0.56 まで上げたが、1枚が 3cm に
        //         縮んだので相対的には倍以上になっていた
        const amp = K ? rng.range(0.26, 0.40) : rng.range(0.24, 0.40);   // 縮れの高さ
        const fibA = rng.range(0, Math.PI);        // 繊維の向き
        const crum = (x, z) => {
            const u = x * Math.cos(foldA) + z * Math.sin(foldA);
            let h = Math.sin(u * foldK) * amp;                        // 大きな折り
            h += (Noise.fbm2(x * 2.3 + 5, z * 2.3 + 9, nSeed + 7, 3) - 0.5) * amp * 0.90;
            h += (Noise.fbm2(x * 6.4 + 1, z * 6.4 + 3, nSeed + 11, 2) - 0.5) * amp * 0.34;
            return h;
        };
        // 布に載せる細かい皺。質点 5x12 を 16x40 へ補間すると大きな
        // ドレープしか残らず、面が油粘土のように滑らかになる。
        // 細部だけは手続きで足す（物理で出そうとすると質点が10倍要る）
        // 【対策】振幅 amp*0.30 では、6.5cm の帯に 1mm の起伏しか出ず、
        //         表面が蝋のように滑らかで湯葉に見える。実物の薄切り肉は
        //         繊維の束で 2〜3mm の凹凸がある
        // 【対策】amp*0.95 + amp*0.44 は、3cm のこま切れに 4mm の高周波
        //         変位を掛ける。棘だらけの面が自分に影を落として、黒い
        //         点々が散った「汚れた肉」になっていた。繊維の凹凸は
        //         せいぜい 1mm 程度でよい
        const fine = (x, z) => (Noise.fbm2(x * 5.2 + 21, z * 5.2 + 13, nSeed + 23, 3) - 0.5)
            * amp * 0.34
            + (Noise.fbm2(x * 11.0 + 7, z * 11.0 + 31, nSeed + 29, 2) - 0.5) * amp * 0.14;
        // 丸まり。加熱で縮んだ帯は短軸まわりに巻く
        // 【対策】0.75 だと長辺 3.7 に対して 286度、つまり一巻き以上して
        //         帯が自分に食い込む。半巻きまでに留める
        // こま切れは薄くて小さいぶんよく縮れる
        const curlR = K ? rng.range(0.95, 2.20) : rng.range(1.30, 2.80);
        const curlT = rng.range(-0.55, 0.55) * (K ? 1.9 : 1.0);   // 縁のねじれ
        return { rng: rng, nSeed: nSeed, A: A, Bz: Bz, outR: outR, crum: crum,
            fine: fine, amp: amp, fibA: fibA, curlR: curlR, curlT: curlT };
    }

    // 布の初期形状。
    // 【対策】平らな円板の質点を落とすと、輪郭が真円のまま残って
    //         「スライサーの切り落とし」の不揃いさが消える。しかも
    //         完全な平面は板のまま落ちて皺が生まれない。描画と同じ
    //         outR / crum で最初から縮れた不定形を作っておく
    function meatSeedGrid(kind, sc, seed, NR, NA, cx, cz, y0) {
        const M = MEATS[kind], SH = meatShape(kind, seed);
        const s = M.size * sc;
        const out = new Float32Array((NR + 1) * NA * 3);
        for (let i = 0; i <= NR; i++) {
            for (let j = 0; j < NA; j++) {
                const rho = i / NR, a = j / NA * TAU;
                const R = SH.outR(a) * rho;
                const x = SH.A * R * Math.cos(a), z = SH.Bz * R * Math.sin(a);
                const eg = 1 - 0.45 * smooth(0.72, 1.0, rho);
                let px = x, py = SH.crum(x, z) * eg, pz = z;
                // 【対策】平らな帯のまま落とすと、鍋から上げた直後の
                //         「縮んで巻いた」姿にならない。距離拘束だけの布は
                //         曲げ剛性を持たないので、丸まりは初期形状で
                //         与えるしかない。短軸まわりに巻いてから落とす
                const th = px / SH.curlR;
                px = SH.curlR * Math.sin(th);
                py += SH.curlR * (1 - Math.cos(th));
                // 縁は逆にめくれる
                py += pz * pz * SH.curlT;
                const o = (i * NA + j) * 3;
                out[o] = cx + px * s;
                out[o + 1] = y0 + py * s;
                out[o + 2] = cz + pz * s;
            }
        }
        return out;
    }

    function buildMeatSheet(kind, sc, q, cx, cz, seed, grid) {
        const M = MEATS[kind];
        const SH = meatShape(kind, seed);
        const rng = SH.rng, nSeed = SH.nSeed;
        const NR = 16, NA = 40;                    // 半径方向 / 周方向
        const A = SH.A, Bz = SH.Bz, outR = SH.outR, crum = SH.crum;
        const amp = SH.amp, fibA = SH.fibA;
        // ---- 静定後の質点グリッドからの中面 ---------------------------
        const gRing = grid ? grid.nRing : 0, gSide = grid ? grid.nSide : 0;
        const gp = grid ? grid.pos : null;
        const gridMid = (rho, a, out) => {
            const fi = clamp(rho, 0, 1) * gRing;
            let fj = a / TAU * gSide;
            fj -= Math.floor(fj / gSide) * gSide;
            const i0 = Math.min(Math.floor(fi), gRing - 1), ti = fi - i0;
            const j0 = Math.floor(fj), tj = fj - j0;
            const j1 = (j0 + 1) % gSide;
            const A0 = (i0 * gSide + j0) * 3, A1 = (i0 * gSide + j1) * 3;
            const B0 = ((i0 + 1) * gSide + j0) * 3, B1 = ((i0 + 1) * gSide + j1) * 3;
            for (let c = 0; c < 3; c++) {
                out[c] = (gp[A0 + c] * (1 - tj) + gp[A1 + c] * tj) * (1 - ti)
                    + (gp[B0 + c] * (1 - tj) + gp[B1 + c] * tj) * ti;
            }
        };
        // 粗いグリッドの面法線。細かい皺をこの向きへ足す
        const gA = [0, 0, 0], gB = [0, 0, 0];
        const gridMidFine = (rho, a, out) => {
            gridMid(rho, a, out);
            const d = 0.02;
            gridMid(Math.min(1, rho + d), a, gA);
            gridMid(rho, a + d, gB);
            const ux = gA[0] - out[0], uy = gA[1] - out[1], uz = gA[2] - out[2];
            const vx = gB[0] - out[0], vy = gB[1] - out[1], vz = gB[2] - out[2];
            let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const l = Math.hypot(nx, ny, nz);
            if (l < 1e-9) return;
            nx /= l; ny /= l; nz /= l;
            // 手続きの皺は元の平面座標で引く。縁は落ち着かせる
            const R = outR(a) * rho, x = A * R * Math.cos(a), z = Bz * R * Math.sin(a);
            const eg = 1 - 0.55 * smooth(0.70, 1.0, rho);
            const w = SH.fine(x, z) * eg * M.size;
            out[0] += nx * w; out[1] += ny * w; out[2] += nz * w;
        };

        // 中面の点
        const procMid = (rho, a, out) => {
            const R = outR(a) * rho;
            const x = A * R * Math.cos(a), z = Bz * R * Math.sin(a);
            // 【対策】縁まで同じ振幅でしわを入れると、輪郭が波打ちすぎて
            //         「破れた葉」になる。縁はいくらか落ち着かせる
            const eg = 1 - 0.45 * smooth(0.72, 1.0, rho);
            out[0] = x; out[1] = crum(x, z) * eg; out[2] = z;
        };
        const mid = grid ? gridMidFine : procMid;

        const per = (NR + 1) * (NA + 1);
        const nV = per * 2;                        // 表 / 裏
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const base = new Float32Array(nV * 3);
        const wet = new Float32Array(nV);
        const idx = [];
        const p0 = [0, 0, 0], pu = [0, 0, 0], pv = [0, 0, 0];
        // grid のときは座標がワールドなので厚みもワールドで取る
        const H = grid ? M.thick * 0.5 : M.thick / M.size * 0.5;
        // 【対策】布の質点は半径 r の球なので、中面は接触面から r だけ
        //         浮いた所に静定する。肉の厚みの半分は H しかないので、
        //         そのままだと肉が (r - H) だけ宙に浮く。中面を法線の
        //         逆へずらして相殺する（質点を細くするとすり抜ける）
        const OFF = grid ? Math.max(0, grid.particleR - H) : 0;
        const eps = 0.012;

        for (let side = 0; side < 2; side++) {
            const sgn = side ? -1 : 1;
            for (let i = 0; i <= NR; i++) {
                const rho = i / NR;
                for (let j = 0; j <= NA; j++) {
                    const a = (j % NA) / NA * TAU;
                    mid(rho, a, p0);
                    // 中面の法線を差分で。ρ=0 は縮退するので少し外へずらす
                    const r2 = Math.max(eps, rho);
                    mid(r2 + eps, a, pu);
                    mid(r2, a + eps, pv);
                    const ux = pu[0] - p0[0], uy = pu[1] - p0[1], uz = pu[2] - p0[2];
                    const vx = pv[0] - p0[0], vy = pv[1] - p0[1], vz = pv[2] - p0[2];
                    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
                    let l = Math.hypot(nx, ny, nz) || 1;
                    nx /= l; ny /= l; nz /= l;
                    // 【対策】ρ=0 では中面の点が全方位で一致するのに、
                    //         法線だけを ρ=eps の差分で取ると方位ごとに
                    //         ばらつき、押し出した頂点が半径 0.3mm の
                    //         小さなリングに散る。表裏それぞれの中心に
                    //         ピンホールが空く（境界辺 80 本の正体）。
                    //         中心では中面 y=crum(x,z) の勾配から
                    //         方位に依らない法線を取る
                    if (i === 0) {
                        const d = 0.004;
                        const hx = (crum(d, 0) - crum(-d, 0)) / (2 * d);
                        const hz = (crum(0, d) - crum(0, -d)) / (2 * d);
                        nx = -hx; ny = 1; nz = -hz;
                        l = Math.hypot(nx, ny, nz) || 1;
                        nx /= l; ny /= l; nz /= l;
                    }
                    if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }   // 表を上に揃える
                    const vo = side * per + i * (NA + 1) + j;
                    const p3 = vo * 3, p2 = vo * 2;
                    const d = H * sgn - OFF;
                    positions[p3] = p0[0] + nx * d;
                    positions[p3 + 1] = p0[1] + ny * d;
                    positions[p3 + 2] = p0[2] + nz * d;
                    uvs[p2] = j / NA; uvs[p2 + 1] = rho;
                    // ---- 色 --------------------------------------------
                    // 【対策】ここは p0 を使っていたが、布モードでは p0 が
                    //         ワールド座標 [cm] になる。ローカル（|p|≒1）の
                    //         つもりで引いていたノイズが数倍の周波数になり、
                    //         さしも焼き色も細かい粒に潰れて一様なベージュへ
                    //         均されていた。色は肉の「素材座標」で決まる
                    //         ものなので、丸まる前の平らな面で引く
                    const lR = outR(a) * rho;
                    const lx = A * lR * Math.cos(a), lz = Bz * lR * Math.sin(a);
                    const lh = crum(lx, lz);                // 折り目の高さ（ローカル）
                    // 繊維に沿った座標。脂とすじはこれに直交する縞になる
                    const fx = lx * Math.cos(fibA) + lz * Math.sin(fibA);
                    const fz = -lx * Math.sin(fibA) + lz * Math.cos(fibA);
                    // 【対策】脂を等間隔の縞で描くと、生地にプリントした
                    //         ストライプに見える。実物のさしは長さも太さも
                    //         まちまちで、途中で切れて再開する。
                    //         繊維方向に引き伸ばしたノイズを閾値で切る
                    // 【対策】豚バラの脂は「ばらけたさし」ではなく、長辺に
                    //         沿って走る白い層。等方なノイズでは出ないので、
                    //         短辺方向の低周波を重ねて帯にする
                    const bandF = M.fatBand || 0;
                    const band = bandF > 0
                        ? Math.pow(0.5 + 0.5 * Math.cos(fz * bandF * Math.PI
                            + Noise.fbm2(fx * 0.9, 4.5, nSeed + 41, 2) * 3.0), 1.6)
                        : 0;
                    const marb0 = Noise.fbm2(fz * 7.2 + 3, fx * 1.15 + 8, nSeed + 21, 3);
                    const marb = bandF > 0 ? mix(marb0, band, M.fatBandMix !== undefined ? M.fatBandMix : 0.62) : marb0;
                    // 【対策】閾値が 0.62〜0.80 だと、さしが細い線に痩せて
                    //         遠目には消える。写真の薄切り肉は脂の白と
                    //         赤身のコントラストがはっきり出るので、
                    //         もっと広く太く取る
                    // 【対策】0.52〜0.74 のなだらかな閾値では、脂が赤身へ
                    //         溶け込んで灰色の霞になる。こま切れの脂は
                    //         境界のはっきりした白い塊
                    let fat = smooth(0.50, 0.63, marb) * M.fatAmt;
                    // 端材の切り口は脂側に当たることが多い
                    if (M.fatEdge) fat = Math.min(1, fat + smooth(0.80, 1.0, rho) * M.fatEdge);
                    // 火の当たり。表側（上を向いた面）ほど焼けている
                    const heat = Noise.fbm2(lx * 2.6, lz * 2.6, nSeed + 31, 3);
                    const sa = (M.searAmt !== undefined ? M.searAmt : 0.85);
                    let c = mix3(M.body, M.sear,
                        clamp(heat * 1.25 - 0.18, 0, 1) * (side ? sa * 0.6 : sa));
                    // 縁は火が回って濃い
                    c = mix3(c, M.sear, smooth(0.86, 1.0, rho) * sa * 0.55);
                    // 折り目の谷は蒸されて赤いまま
                    c = mix3(c, M.raw, clamp(-lh / (amp * 0.9), 0, 1) * 0.34);
                    c = mix3(c, M.fat, fat);
                    base[p3] = c[0]; base[p3 + 1] = c[1]; base[p3 + 2] = c[2];
                    wet[vo] = mix(M.wetBody, M.wetFat, fat / Math.max(1e-3, M.fatAmt));
                }
            }
            const b = side * per;
            for (let i = 0; i < NR; i++) {
                for (let j = 0; j < NA; j++) {
                    const p = b + i * (NA + 1) + j;
                    if (side === 0) idx.push(p, p + 1, p + NA + 1, p + 1, p + NA + 2, p + NA + 1);
                    else idx.push(p, p + NA + 1, p + 1, p + 1, p + NA + 1, p + NA + 2);
                }
            }
        }
        // 縁を綴じる（厚みの断面）
        // 【対策】表の外周は a[j+1]→a[j]、裏の外周は b[j]→b[j+1] の向きで
        //         走っている。縁の帯はその逆向きを持たなければならず、
        //         (a,b,a+1) と綴じると 80 本の辺が同じ向きで二重になる。
        //         閉じてはいるが巻きが揃わないので、縁だけ法線が裏返って
        //         切り口が黒く沈む
        for (let j = 0; j < NA; j++) {
            const a = NR * (NA + 1) + j, b = per + NR * (NA + 1) + j;
            idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
        const indices = new Uint32Array(idx);
        const normals = finalize(positions, indices, new V3(0, 0, 0), 0, true);
        // 表と裏は別の頂点なので、溶接しても稜線は保たれる（縁だけは
        // 位置が違うので混ざらない）。ρ=0 の縮退だけが対象になる
        weldRange(positions, normals, 0, per);
        weldRange(positions, normals, per, nV);
        if (!grid) applyPose(positions, normals, nV, q, M.size * sc, cx, cz);
        return {
            kind: "meat", seed: seed, spec: M, nV: nV,
            positions, indices, normals, uvs, base, wet
        };
    }

    // =================================================================
    // 7. Shirataki : しらたき ★
    // =================================================================
    // 【対策】糸こんにゃくを「白いスパゲッティ」として作ると、ゆでた
    //         うどんにしかならない。写真を見ると違いは曲率にある。
    //         パスタは自重で垂れて曲率半径 3〜5cm の緩い弧を描くが、
    //         しらたきは押し出し成形で巻きぐせが付いていて、
    //         0.5〜1.5cm でくるくると巻き戻る。鍋に入れても解けない。
    //         だから「絡んだ毬（まり）」に見える。
    //
    //         この巻きぐせは、進行方向をある軸のまわりに一定の角速度で
    //         回し続けることで出せる。軸を 3D ノイズでゆっくり動かすと
    //         巻きの向きが変わり、平面的なコイルにならずに立体的に絡む。
    //
    //         もうひとつの落とし穴が断面の基底。上ベクトルとの外積で
    //         作ると、接線が鉛直に近いところで基底が 180° 飛んで
    //         紐がねじれ、そこだけ稜が走って針金に見える。
    //         回転最小化フレーム（double reflection 法）で運ぶ。
    //         これは前のフレームを次の接平面へ2回鏡映するだけで、
    //         三角関数も特異点も出てこない
    const SHIRATAKI = {
        label: "しらたき",
        rad: 0.078,                     // 紐の半径 [cm]（太さ 1.6mm）
        oval: 1.28,                     // 断面の扁平（口金の形）
        ds: 0.20,                       // 弧長の刻み [cm]
        len: 24.0,                      // 1本の長さ [cm]
        nSide: 8,
        strands: [5, 8],                // 束あたりの本数
        curl: [0.46, 1.10],             // 巻きの曲率半径 [cm]。束を広げたぶん強めた
        rx: 2.25, ry: 0.58, rz: 1.80,   // 束の広がり [cm]
        // 生のしらたきは灰白色だが、肉じゃがのものは煮汁を吸って
        // 淡い琥珀になる。素の色としては白のまま置き、色は膜に任せる
        // 【対策】生のしらたきの灰白色をそのまま置いて「色は膜に任せる」と
        //         書いていたが、wet=0.62 では膜が薄すぎて灰色のまま残り、
        //         器の白比 0.85 / B/R 0.60 の白い塊になっていた。
        //         写真のしらたきは煮汁を吸い切って B/R 0.07 の琥珀
        // 【対策】写真A（濃い煮汁の肉じゃが）の染まりきったしらたきに
        //         合わせたので、器の白比 0.55 / G/R 0.28 と暗く赤すぎた。
        //         実測すると写真のしらたきは白比 0.68〜1.00、G/R 0.38〜0.48。
        //         表面が滑って煮汁が乗らないぶん、具の中でいちばん淡い
        body: [0.869, 0.643, 0.360],
        fleck: [0.760, 0.556, 0.318],   // こんにゃく粉の粒
        rough: 0.24,
        coat: 0.72, coatRough: 0.038,   // つるつる。ハイライトが線で走る
        trans: 0.86, thick: 0.16,       // 半透明。逆光で光を通す
        transTint: [0.93, 0.78, 0.52],  // 透過光は身の色に染まる。淡い飴色
        wet: 0.46                       // 表面がすべるので膜は薄い。
        // ただし絡んだ隙間の pocket が高いので、結果として濃く染まる
    };

    // 回転最小化フレーム（Wang らの double reflection）。
    // 直前のフレーム (t0, r0) と、点 p0 → p1・接線 t1 から r1 を得る
    function rmfStep(p0, t0, r0, p1, t1, out) {
        const v1x = p1[0] - p0[0], v1y = p1[1] - p0[1], v1z = p1[2] - p0[2];
        const c1 = v1x * v1x + v1y * v1y + v1z * v1z;
        if (c1 < 1e-16) { out[0] = r0[0]; out[1] = r0[1]; out[2] = r0[2]; return; }
        const dr = (v1x * r0[0] + v1y * r0[1] + v1z * r0[2]) * 2 / c1;
        const rLx = r0[0] - dr * v1x, rLy = r0[1] - dr * v1y, rLz = r0[2] - dr * v1z;
        const dt = (v1x * t0[0] + v1y * t0[1] + v1z * t0[2]) * 2 / c1;
        const tLx = t0[0] - dt * v1x, tLy = t0[1] - dt * v1y, tLz = t0[2] - dt * v1z;
        const v2x = t1[0] - tLx, v2y = t1[1] - tLy, v2z = t1[2] - tLz;
        const c2 = v2x * v2x + v2y * v2y + v2z * v2z;
        if (c2 < 1e-16) { out[0] = rLx; out[1] = rLy; out[2] = rLz; return; }
        const d2 = (v2x * rLx + v2y * rLy + v2z * rLz) * 2 / c2;
        let ox = rLx - d2 * v2x, oy = rLy - d2 * v2y, oz = rLz - d2 * v2z;
        // 接線成分を落として正規化（数値誤差の蓄積を止める）
        const dot = ox * t1[0] + oy * t1[1] + oz * t1[2];
        ox -= dot * t1[0]; oy -= dot * t1[1]; oz -= dot * t1[2];
        const l = Math.hypot(ox, oy, oz) || 1;
        out[0] = ox / l; out[1] = oy / l; out[2] = oz / l;
    }

    // 1本ぶんの背骨。束の楕円体に閉じ込めながら巻きぐせで進ませる
    function shirataStrand(S, rng, nSeed, k) {
        const N = Math.max(8, Math.round(S.len / S.ds));
        const pts = new Float64Array((N + 1) * 3);
        // 出発点は束の中の適当な場所
        let px = rng.gauss(0, S.rx * 0.42);
        let py = rng.gauss(0, S.ry * 0.45);
        let pz = rng.gauss(0, S.rz * 0.42);
        let dx = rng.range(-1, 1), dy = rng.range(-0.35, 0.35), dz = rng.range(-1, 1);
        { const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l; }
        // 巻きの強さ。曲率半径 R に対して 1ステップの回転角は ds/R
        const R = rng.range(S.curl[0], S.curl[1]);
        const kappa = S.ds / R;
        for (let i = 0; i <= N; i++) {
            pts[i * 3] = px; pts[i * 3 + 1] = py; pts[i * 3 + 2] = pz;
            if (i === N) break;
            // ---- 巻きぐせ: ゆっくり向きの変わる軸まわりに回す ----------
            const t = i * S.ds;
            let ax = Noise.v3(t * 0.42 + 3, k * 5.1, 11, nSeed) - 0.5;
            let ay = Noise.v3(t * 0.42 + 9, k * 5.1, 23, nSeed) - 0.5;
            let az = Noise.v3(t * 0.42 + 5, k * 5.1, 37, nSeed) - 0.5;
            {
                // 軸は進行方向と直交する成分だけが効く。あらかじめ直交化
                const d = ax * dx + ay * dy + az * dz;
                ax -= d * dx; ay -= d * dy; az -= d * dz;
                const l = Math.hypot(ax, ay, az);
                if (l < 1e-6) { ax = -dz; ay = 0; az = dx; }
                else { ax /= l; ay /= l; az /= l; }
            }
            // ロドリゲス（軸 a ⊥ d なので d·a = 0 の項が落ちる）
            const ca = Math.cos(kappa), sa = Math.sin(kappa);
            const cx2 = ay * dz - az * dy, cy2 = az * dx - ax * dz, cz2 = ax * dy - ay * dx;
            dx = dx * ca + cx2 * sa; dy = dy * ca + cy2 * sa; dz = dz * ca + cz2 * sa;
            // ---- 閉じ込め: 束からはみ出したら中心へ向ける ---------------
            // 【対策】復元力の重みを 0.55 で頭打ちにすると、巻きの回転が
            //         毎ステップ向きを外へ戻すので釣り合ってしまい、紐が
            //         じわじわ逃げて束が倍の大きさ（φ9cm）に膨らむ。
            //         重みは 1 まで伸ばし、外へ出たら必ず引き返させる
            const q = Math.hypot(px / S.rx, py / S.ry, pz / S.rz);
            if (q > 0.80) {
                const u = clamp((q - 0.80) / 0.30, 0, 1);
                const w = u * u * (0.30 + 0.65 * u);
                let bx = -px / (S.rx * S.rx), by = -py / (S.ry * S.ry), bz = -pz / (S.rz * S.rz);
                const l = Math.hypot(bx, by, bz) || 1; bx /= l; by /= l; bz /= l;
                dx = mix(dx, bx, w); dy = mix(dy, by, w); dz = mix(dz, bz, w);
            }
            // 【対策】閉じ込めの復元力を鉛直にも同じだけ掛けると、
            //         束が球になって「毛糸玉」に見える。しらたきは
            //         鍋の中で平たく広がるので、y だけ強く潰す
            dy *= 0.72;
            const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
            px += dx * S.ds; py += dy * S.ds; pz += dz * S.ds;
        }
        return { pts, N };
    }

    // 折れ線を等弧長で貼り直す。物理の質点は 0.8cm 間隔なので、
    // そのまま掃くと管が角張る。Catmull-Rom で S.ds まで細かくする
    function resamplePath(src, ds) {
        const n = src.length / 3;
        const at = (i, c) => src[Math.max(0, Math.min(n - 1, i)) * 3 + c];
        const fine = [];
        const SUB = 8;
        for (let i = 0; i < n - 1; i++) {
            for (let u = 0; u < SUB; u++) {
                const t = u / SUB, t2 = t * t, t3 = t2 * t;
                for (let c = 0; c < 3; c++) {
                    const p0 = at(i - 1, c), p1 = at(i, c), p2 = at(i + 1, c), p3 = at(i + 2, c);
                    fine.push(0.5 * ((2 * p1) + (-p0 + p2) * t
                        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                        + (-p0 + 3 * p1 - 3 * p2 + p3) * t3));
                }
            }
        }
        for (let c = 0; c < 3; c++) fine.push(at(n - 1, c));
        // 等弧長で拾い直す
        const out = [fine[0], fine[1], fine[2]];
        let acc = 0;
        for (let i = 1; i < fine.length / 3; i++) {
            const dx = fine[i * 3] - fine[(i - 1) * 3];
            const dy = fine[i * 3 + 1] - fine[(i - 1) * 3 + 1];
            const dz = fine[i * 3 + 2] - fine[(i - 1) * 3 + 2];
            acc += Math.hypot(dx, dy, dz);
            while (acc >= ds) {
                const back = (acc - ds) / Math.max(Math.hypot(dx, dy, dz), 1e-9);
                out.push(fine[i * 3] - dx * back, fine[i * 3 + 1] - dy * back,
                    fine[i * 3 + 2] - dz * back);
                acc -= ds;
            }
        }
        const m = out.length / 3;
        return { N: m - 1, pts: Float32Array.from(out) };
    }

    // paths を渡すと、巻きぐせのモデルではなく静定後の紐の芯線に沿って
    // 管を掃く。座標はワールド cm なので applyPose は掛けない
    function buildShirataki(sc, q, cx, cz, seed, paths) {
        const S = SHIRATAKI, rng = new Rng(seed >>> 0);
        const nStr = paths ? paths.length
            : S.strands[0] + rng.int(S.strands[1] - S.strands[0] + 1);
        const NS = S.nSide;
        const strands = [];
        let nV = 0, nI = 0;
        for (let k = 0; k < nStr; k++) {
            const st = paths ? resamplePath(paths[k], S.ds)
                : shirataStrand(S, rng, seed + 401 + k * 17, k);
            strands.push(st);
            nV += (st.N + 1) * (NS + 1) + 2;
            nI += st.N * NS * 6 + NS * 6;
        }
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const base = new Float32Array(nV * 3);
        const wet = new Float32Array(nV);
        const indices = new Uint32Array(nI);
        let vo = 0, io = 0;

        const t0 = [0, 0, 0], t1 = [0, 0, 0], r0 = [0, 0, 0], r1 = [0, 0, 0];
        const pA = [0, 0, 0], pB = [0, 0, 0];
        for (let k = 0; k < nStr; k++) {
            const st = strands[k], N = st.N, P = st.pts;
            const base0 = vo;
            // 【対策】背骨は最初から cm で作っている（ds も rx も cm）のに、
            //         applyPose に S.rx * sc を渡すと寸法が二重に掛かり、
            //         束が φ4.1cm → φ8.0cm に膨らんで鉢からあふれる。
            //         紐の太さもここで rx で割って辻褄を合わせていた
            const rr0 = S.rad * rng.range(0.88, 1.12) * (paths ? 1 : 1);   // [cm]
            const twist = rng.range(-0.9, 0.9);
            const cSeed = seed + 700 + k * 31;
            // 初期フレーム
            {
                t0[0] = P[3] - P[0]; t0[1] = P[4] - P[1]; t0[2] = P[5] - P[2];
                const l = Math.hypot(t0[0], t0[1], t0[2]) || 1;
                t0[0] /= l; t0[1] /= l; t0[2] /= l;
                // 接線と平行でない適当なベクトルから直交成分を取る
                let ux = 0, uy = 1, uz = 0;
                if (Math.abs(t0[1]) > 0.9) { ux = 1; uy = 0; }
                const d = ux * t0[0] + uy * t0[1] + uz * t0[2];
                r0[0] = ux - d * t0[0]; r0[1] = uy - d * t0[1]; r0[2] = uz - d * t0[2];
                const l2 = Math.hypot(r0[0], r0[1], r0[2]) || 1;
                r0[0] /= l2; r0[1] /= l2; r0[2] /= l2;
            }
            for (let i = 0; i <= N; i++) {
                const a = Math.max(0, i - 1), b = Math.min(N, i + 1);
                t1[0] = P[b * 3] - P[a * 3];
                t1[1] = P[b * 3 + 1] - P[a * 3 + 1];
                t1[2] = P[b * 3 + 2] - P[a * 3 + 2];
                const l = Math.hypot(t1[0], t1[1], t1[2]) || 1;
                t1[0] /= l; t1[1] /= l; t1[2] /= l;
                if (i === 0) { r1[0] = r0[0]; r1[1] = r0[1]; r1[2] = r0[2]; }
                else {
                    pA[0] = P[(i - 1) * 3]; pA[1] = P[(i - 1) * 3 + 1]; pA[2] = P[(i - 1) * 3 + 2];
                    pB[0] = P[i * 3]; pB[1] = P[i * 3 + 1]; pB[2] = P[i * 3 + 2];
                    rmfStep(pA, t0, r0, pB, t1, r1);
                }
                // 第2基底
                const sx = t1[1] * r1[2] - t1[2] * r1[1];
                const sy = t1[2] * r1[0] - t1[0] * r1[2];
                const sz = t1[0] * r1[1] - t1[1] * r1[0];
                const u = i / N;
                // 端は少し細る（切り口が丸く見える）
                const endT = Math.min(smooth(0, 0.018, u), smooth(0, 0.018, 1 - u));
                let rad = rr0 * (0.30 + 0.70 * endT);
                // 押し出しの太さむら
                rad *= 1 + 0.10 * (Noise.v2(u * 40, k * 3.3, cSeed) - 0.5) * 2;
                const roll = twist * u * TAU;
                for (let j = 0; j <= NS; j++) {
                    const phi = (j % NS) / NS * TAU + roll;
                    const ca = Math.cos(phi) * S.oval, sa2 = Math.sin(phi);
                    const p3 = vo * 3, p2 = vo * 2;
                    positions[p3] = P[i * 3] + (r1[0] * ca + sx * sa2) * rad;
                    positions[p3 + 1] = P[i * 3 + 1] + (r1[1] * ca + sy * sa2) * rad;
                    positions[p3 + 2] = P[i * 3 + 2] + (r1[2] * ca + sz * sa2) * rad;
                    uvs[p2] = j / NS; uvs[p2 + 1] = u * S.len;
                    // こんにゃく粉の粒。白一色だと消しゴムに見える
                    const fl = Noise.fbm2u(j / NS * 4, u * 90, 4, cSeed + 5, 2);
                    const c = mix3(S.body, S.fleck, smooth(0.62, 0.86, fl) * 0.55);
                    base[p3] = c[0]; base[p3 + 1] = c[1]; base[p3 + 2] = c[2];
                    wet[vo] = S.wet;
                    vo++;
                }
                t0[0] = t1[0]; t0[1] = t1[1]; t0[2] = t1[2];
                r0[0] = r1[0]; r0[1] = r1[1]; r0[2] = r1[2];
            }
            for (let i = 0; i < N; i++) {
                for (let j = 0; j < NS; j++) {
                    const p = base0 + i * (NS + 1) + j;
                    indices[io++] = p; indices[io++] = p + 1; indices[io++] = p + NS + 1;
                    indices[io++] = p + 1; indices[io++] = p + NS + 2; indices[io++] = p + NS + 1;
                }
            }
            // 両端を閉じる
            const capA = vo, capB = vo + 1;
            for (const [ci, row] of [[capA, 0], [capB, N]]) {
                positions[ci * 3] = P[row * 3];
                positions[ci * 3 + 1] = P[row * 3 + 1];
                positions[ci * 3 + 2] = P[row * 3 + 2];
                uvs[ci * 2] = 0.5; uvs[ci * 2 + 1] = row === 0 ? 0 : S.len;
                base[ci * 3] = S.body[0]; base[ci * 3 + 1] = S.body[1]; base[ci * 3 + 2] = S.body[2];
                wet[ci] = S.wet;
                for (let j = 0; j < NS; j++) {
                    // 【対策】いんげんと同じ間違い。胴の巻きに対して扇が
                    //         逆向きだと、切り口の丸だけ内を向く
                    const p = base0 + row * (NS + 1) + j;
                    if (row === 0) { indices[io++] = ci; indices[io++] = p + 1; indices[io++] = p; }
                    else { indices[io++] = ci; indices[io++] = p; indices[io++] = p + 1; }
                }
            }
            vo += 2;
        }
        const normals = finalize(positions, indices, new V3(0, 0, 0), 0, true);
        weldNormals(positions, normals);
        if (!paths) applyPose(positions, normals, nV, q, sc, cx, cz);   // 背骨はすでに cm
        return {
            kind: "shirataki", seed: seed, spec: S, nV: nV,
            positions, indices, normals, uvs, base, wet
        };
    }

    // =================================================================
    // 8. Pile : 高さ場に落として盛る ★
    // =================================================================
    // 【対策】から揚げ.js は Havok で1個ずつ落として山を作っていた。
    //         肉じゃがでそれをやると2つ詰む。
    //           ・しらたきは長さ 24cm の紐で、凸包を取ると束がまるごと
    //             卵形の塊になる。紐と紐の隙間が消えるので、あの
    //             「絡んだ隙間から煮汁が覗く」画が原理的に作れない
    //           ・薄切り肉は厚さ 1.5mm。凸包にすると厚み 6mm の座布団に
    //             なり、めり込みの許容量（絶対値）と喧嘩して震え出す
    //
    //         そこで物理を捨てて、高さ場に落とす。上から見た最上点
    //         バッファを1枚持ち、次の具を置くときにその真下の高さを
    //         見て、必要なぶんだけ持ち上げる。剛体の回転が無いぶん
    //         山の崩れ方の説得力は落ちるが、
    //           ・任意の形が扱える（紐でも紙でもよい）
    //           ・決定的（同じシードなら必ず同じ盛り）
    //           ・速い（30個で 200ms 弱）
    //         という3つが手に入る。そして同じバッファが、そのまま
    //         「膜の溜まりやすさ」と「液面の下に何があるか」に使える
    class Field {
        constructor(n, half, floorFn) {
            this.n = n | 0;
            this.half = half;
            this.cell = (half * 2) / this.n;
            const m = this.n * this.n;
            this.floor = new Float32Array(m);
            this.topY = new Float32Array(m);
            this.cr = new Float32Array(m);
            this.cg = new Float32Array(m);
            this.cb = new Float32Array(m);
            this.scratch = new Float32Array(m).fill(1e9);
            this.dist = null;
            for (let z = 0; z < this.n; z++) {
                const wz = this._wx(z);
                for (let x = 0; x < this.n; x++) {
                    const k = z * this.n + x;
                    this.floor[k] = floorFn(this._wx(x), wz);
                    this.topY[k] = this.floor[k];
                }
            }
        }
        _gx(x) { return (x + this.half) / this.cell - 0.5; }
        _wx(i) { return (i + 0.5) * this.cell - this.half; }

        // 三角形を XZ へ軟ラスタライズする共通ループ。
        // cb(k, y, l0, l1, l2, i0, i1, i2) を各セルで呼ぶ
        _raster(pos, idx, ox, oz, cb) {
            const n = this.n;
            for (let t = 0; t < idx.length; t += 3) {
                const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
                const ay = pos[i0 * 3 + 1], by = pos[i1 * 3 + 1], cy = pos[i2 * 3 + 1];
                const gax = this._gx(pos[i0 * 3] + ox), gaz = this._gx(pos[i0 * 3 + 2] + oz);
                const gbx = this._gx(pos[i1 * 3] + ox), gbz = this._gx(pos[i1 * 3 + 2] + oz);
                const gcx = this._gx(pos[i2 * 3] + ox), gcz = this._gx(pos[i2 * 3 + 2] + oz);
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
                        cb(gz * n + gx, l0 * ay + l1 * by + l2 * cy, l0, l1, l2, i0, i1, i2);
                    }
                }
            }
        }

        // 静定後の具を高さ場へ焼き付ける。膜の pocket と液面の下地は
        // ここで作った topY / 色をそのまま使う。
        // 【対策】以前はこのクラスが当たり判定も兼ねていて、持ち上げ量を
        //         分位 0.74 で取っていた。つまり覆ったセルの 26% は
        //         意図的にめり込ませていて、薄い肉が芋の側面に刺さる。
        //         当たり判定は Havok に渡し、ここは走査変換だけにする
        deposit(pos, idx, base) {
            this._raster(pos, idx, 0, 0, (k, y, l0, l1, l2, i0, i1, i2) => {
                if (y <= this.topY[k]) return;
                this.topY[k] = y;
                if (base) {
                    this.cr[k] = l0 * base[i0 * 3] + l1 * base[i1 * 3] + l2 * base[i2 * 3];
                    this.cg[k] = l0 * base[i0 * 3 + 1] + l1 * base[i1 * 3 + 1] + l2 * base[i2 * 3 + 1];
                    this.cb[k] = l0 * base[i0 * 3 + 2] + l1 * base[i1 * 3 + 2] + l2 * base[i2 * 3 + 2];
                }
            });
        }

        topAt(x, z) {
            const n = this.n;
            const ix = Math.round(this._gx(x)), iz = Math.round(this._gx(z));
            if (ix < 0 || iz < 0 || ix >= n || iz >= n) return -1e9;
            return this.topY[iz * n + ix];
        }

        // ★ 隙間らしさ。まわりに自分より高いものがどれだけあるか。
        // 【対策】「上を向いているか」だけで膜の厚みを決めると、山全体が
        //         均一に濡れたプラスチックになる。写真の肉じゃがで
        //         いちばん濃い琥珀に沈んでいるのは具と具の接点で、
        //         そこは向きではなく「囲まれているか」で決まっている
        pocket(x, y, z, G) {
            const R = G.pocketR, D = G.pocketDirs;
            let acc = 0, wsum = 0;
            for (let ri = 0; ri < R.length; ri++) {
                const r = R[ri];
                const w = 1 / (1 + ri * 1.15);          // 近いほど効く
                let hit = 0;
                for (let d = 0; d < D; d++) {
                    const a = (d + 0.5) / D * TAU + ri * 0.37;
                    const ty = this.topAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
                    if (ty < -1e8) continue;
                    hit += smooth(0, G.pocketRise, ty - y);
                }
                acc += (hit / D) * w; wsum += w;
            }
            return wsum > 0 ? clamp(acc / wsum, 0, 1) : 0;
        }

        // 液面より上に出ている具までの距離場（メニスカスと接触の暗がり用）。
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

        // 双一次で引く。範囲外は「何も無い」
        sample(x, z, out) {
            const n = this.n;
            const fx = this._gx(x), fz = this._gx(z);
            const ix = Math.floor(fx), iz = Math.floor(fz);
            if (ix < 0 || iz < 0 || ix >= n - 1 || iz >= n - 1) {
                out.y = -1e9; out.fy = -1e9; out.r = out.g = out.b = 0; out.d = 1e8; return out;
            }
            const tx = fx - ix, tz = fz - iz;
            const k00 = iz * n + ix, k10 = k00 + 1, k01 = k00 + n, k11 = k01 + 1;
            const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
            // 【対策】高さは平均すると具の縁が斜面になってにじむ。最大を採る
            out.y = Math.max(Math.max(this.topY[k00], this.topY[k10]),
                Math.max(this.topY[k01], this.topY[k11]));
            out.fy = this.floor[k00] * w00 + this.floor[k10] * w10
                + this.floor[k01] * w01 + this.floor[k11] * w11;
            // 【対策】高さは最大を採るのに色だけ 4 セルを素直に補間すると、
            //         具の footprint の縁で「高さは具・色は未書き込みの 0」
            //         という組み合わせが生まれ、沈んだ具のまわりに黒い縁が
            //         出る。最大高さを与えたセルと同じ高さ帯だけで混ぜる
            const ks0 = k00, ks1 = k10, ks2 = k01, ks3 = k11;
            let cw = 0, ar = 0, ag = 0, ab = 0;
            const lim = out.y - 0.02;
            if (this.topY[ks0] >= lim) { cw += w00; ar += this.cr[ks0] * w00; ag += this.cg[ks0] * w00; ab += this.cb[ks0] * w00; }
            if (this.topY[ks1] >= lim) { cw += w10; ar += this.cr[ks1] * w10; ag += this.cg[ks1] * w10; ab += this.cb[ks1] * w10; }
            if (this.topY[ks2] >= lim) { cw += w01; ar += this.cr[ks2] * w01; ag += this.cg[ks2] * w01; ab += this.cb[ks2] * w01; }
            if (this.topY[ks3] >= lim) { cw += w11; ar += this.cr[ks3] * w11; ag += this.cg[ks3] * w11; ab += this.cb[ks3] * w11; }
            if (cw > 1e-6) { out.r = ar / cw; out.g = ag / cw; out.b = ab / cw; }
            else { out.r = 0; out.g = 0; out.b = 0; }
            out.d = this.dist
                ? this.dist[k00] * w00 + this.dist[k10] * w10 + this.dist[k01] * w01 + this.dist[k11] * w11
                : 1e8;
            return out;
        }
    }

    // =================================================================
    //  物理盛り付け（Havok）
    // =================================================================
    // 【なぜ物理にしたか】
    //   高さ場は「セルごとの最上点」しか持たない 2.5D 近似なので、
    //   ・具が別の具の“横”に寄りかかる
    //   ・薄い肉が塊の上に垂れて谷を埋める
    //   ・しらたきが隙間へ落ち込む
    //   のどれも表現できない。実測でも、剛体シートのままだと肉が
    //   じゃがいもの側面へ刺さった。
    //
    // 【形ごとの当て方】
    //   塊（芋・人参・玉ねぎ・いんげん）… 凸包。面取りした塊も
    //       乱切りも房も凸なので凸包で誤差が出ない
    //   薄切り肉 … 質点 + 距離拘束の布。厚さ 1.45mm を剛体にすると
    //       凸包が座布団になって震えるが、布なら本物どおり皺になる
    //   しらたき … 質点鎖（1次元の布）。凸包を取ると束が卵形に潰れて
    //       隙間が消えるが、鎖なら紐のまま絡む
    //
    // 【ヘッドレスでの実測（Babylon 9 + Havok、凸包26 + 布14枚1134点）】
    //   器の面へのめり込み 塊 0.38mm / 質点 1.6mm（＝質点の半径ちょうど）
    //   器の内半径からのはみ出し 0.00mm、逸脱した質点 0/1134
    //   1000 step で 5.8ms/step
    const PHYS = {
        gravity: -981,          // cm/s^2（長さの単位が cm なので 9.81 m/s^2 = 981）
        dt: 1 / 120,
        // 波ごとの刻み。全部いっぺんに落とすと塔になってから崩れるので、
        // 少しずつ落として積む
        waveChunk: 5, waveChunkSteps: 42,
        waveSheet: 4, waveSheetSteps: 80,
        waveRope: 1, waveRopeSteps: 70,
        finalSteps: 170,
        // 【対策】12 だと 1 波（42 ステップ）で 4 コマしか描かれず、
        //         盛り付けの様子が飛び飛びになる。物理そのものが
        //         15ms/step 掛かるので、3 なら 20fps 前後で見られる
        stepsPerFrame: 3,       // 1 フレームで進める物理ステップ数

        // 【対策】落下高さを積み上げ式にしないと、26 個目は器の底から
        //         25cm 上に湧いて、着地速度で器のメッシュを抜ける
        dropGap: 1.2,

        chunk: { mass: 0.020, friction: 0.48, restitution: 0.0, lin: 0.40, ang: 0.55 },
        cloth: {
            nRing: 5, nSide: 12,     // 61 質点。描画は 16 x 40 なので補間で持ち上げる
            mass: 0.0007, friction: 0.62, lin: 0.55, ang: 1.0,
            // 【対策】質点の半径が間隔の半分以上あると、隣どうしが常時
            //         接触して布が硬直する。0.42 は経験的な上限
            radiusRatio: 0.44
        },
        rope: {
            ds: 0.80,                // 質点の間隔 [cm]
            mass: 0.0009, friction: 0.55, lin: 0.50, ang: 1.0,
            // 【対策】0.90 だと質点の半径が 0.7mm しかなく、落下 1 ステップ
            //         の移動量（4mm）より桁で小さい。紐は当たり判定を
            //         すり抜けるので、見た目の太さより太く取る
            radiusRatio: 1.70        // 紐の太さに対する質点の半径
        },
        // 器のコライダーは描画用（5万三角形）ではなく専用の低ポリを作る
        bowlSeg: 56
    };

    const MASK = { FOOD: 0x01, BOWL: 0x02 };

    function setMask(shape, me, hit) {
        shape.filterMembershipMask = me;
        shape.filterCollideMask = hit;
    }

    // 器の当たり判定。見込みの回転体を外へ 0.6cm 押し出した閉じた殻。
    // 【対策】厚みゼロの一枚殻に重い凸包を落とすと、すり抜けたときに
    //         戻る先が無い。閉じていれば押し戻される
    function buildBowlCollider(scene, G) {
        // 【対策】厚み 1.2cm では、壁が 45度に立つ r=6cm 付近で質点が
        //         殻を貫通して外へ抜けた（実測 1.07cm 沈む）。質点は
        //         半径 1.3mm と小さく、布 20 枚ぶんの拘束に押されると
        //         1 ステップで殻を越える。素地の側は見えないので厚く取る
        const NA = PHYS.bowlSeg, NP = 40, T = 3.0;
        const pos = [], idx = [];
        const ring = [];
        for (let i = 0; i <= NP; i++) {
            const r = G.rIn * i / NP;
            ring.push([r, innerYAt(G, r)]);
        }
        // 内側の面と、それを外へずらした面
        for (let side = 0; side < 2; side++) {
            for (let i = 0; i <= NP; i++) {
                const r0 = ring[i][0], y0 = ring[i][1];
                let dr = 0, dy = -1;
                if (i > 0 && i < NP) {
                    const tx = ring[i + 1][0] - ring[i - 1][0];
                    const ty = ring[i + 1][1] - ring[i - 1][1];
                    const l = Math.hypot(tx, ty) || 1;
                    dr = ty / l; dy = -tx / l;      // 内向き法線の逆＝外向き
                }
                // 【対策】符号を逆にすると厚みが器の内側へ付き、2枚の面が
                //         中心付近で交差して裏返った立体になる。Havok は
                //         そこで押し戻す向きを決められず、質点が 1cm も
                //         沈んだ。(dr, dy) は具から見て外向き＝素地の側
                const r = r0 + dr * T * side, y = y0 + dy * T * side;
                for (let j = 0; j <= NA; j++) {
                    const a = j / NA * TAU;
                    pos.push(Math.max(r, 0) * Math.cos(a), y, Math.max(r, 0) * Math.sin(a));
                }
            }
        }
        const per = (NP + 1) * (NA + 1);
        for (let side = 0; side < 2; side++) {
            const b = side * per;
            for (let i = 0; i < NP; i++) {
                for (let j = 0; j < NA; j++) {
                    const p = b + i * (NA + 1) + j;
                    if (side === 0) idx.push(p, p + 1, p + NA + 1, p + 1, p + NA + 2, p + NA + 1);
                    else idx.push(p, p + NA + 1, p + 1, p + 1, p + NA + 1, p + NA + 2);
                }
            }
        }
        // 口縁で内外を綴じる
        for (let j = 0; j < NA; j++) {
            const a = NP * (NA + 1) + j, b = per + NP * (NA + 1) + j;
            idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
        const m = named(new BABYLON.Mesh("bowlCollider", scene), "bowlCollider");
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = idx;
        vd.normals = new Array(pos.length).fill(0);
        BABYLON.VertexData.ComputeNormals(pos, idx, vd.normals);
        vd.applyToMesh(m, false);
        m.isVisible = false;
        const ag = new BABYLON.PhysicsAggregate(m, BABYLON.PhysicsShapeType.MESH,
            { mass: 0, friction: 0.55, restitution: 0 }, scene);
        setMask(ag.shape, MASK.BOWL, MASK.FOOD);
        return { mesh: m, aggregate: ag, tris: idx.length / 3 };
    }

    // 盛り付け一式。波ごとに落として、静定したら位置を回収する
    class Plating {
        constructor(scene, G) {
            this.scene = scene;
            this.G = G;
            this.chunks = [];       // { piece, mesh, aggregate }
            this.sheets = [];       // { piece, nodes, nRing, nSide }
            this.ropes = [];        // { piece, strands: [[node...]] }
            this.jobs = [];
            this.done = 0;
            this.total = 0;
            this.top = G.yFloor;
            this.bowl = buildBowlCollider(scene, G);
            this._v = new BABYLON.Vector3();
            this._q = new BABYLON.Quaternion();
        }

        // 積み上がっている高さ。次に落とす具の湧き位置になる
        refreshTop() {
            let t = this.G.yFloor;
            for (const c of this.chunks) {
                c.mesh.computeWorldMatrix(true);
                const bb = c.mesh.getBoundingInfo().boundingBox;
                if (bb.maximumWorld.y > t) t = bb.maximumWorld.y;
            }
            for (const s of this.sheets) {
                for (const n of s.nodes) if (n.tn.position.y > t) t = n.tn.position.y;
            }
            for (const r of this.ropes) {
                for (const st of r.strands) {
                    for (const n of st) if (n.tn.position.y > t) t = n.tn.position.y;
                }
            }
            this.top = t;
            return t;
        }

        // 湧かせる高さ。
        // 【対策】山の頂点だけで決めると、器が外へ向かって上がっていく分を
        //         見ていない。半径 2.2cm のしらたきの束を外側に置くと、
        //         端が「その場所の見込み」より下に湧く＝素地の中から
        //         出発することになり、弾かれて器の外へ抜ける（実測で
        //         底より 3cm 下）。自分が届く範囲の見込みの高さも見る
        spawnY(cx, cz, reach) {
            const G = this.G;
            const rr = Math.min(Math.hypot(cx, cz) + reach, G.rIn);
            return Math.max(this.top, innerYAt(G, rr)) + PHYS.dropGap;
        }

        // 質点ひとつを器の見込みより上へ持ち上げる。
        // 【対策】剛体は湧く高さを「届く範囲の見込み」に合わせるしかないが、
        //         そうすると中央の落下距離が伸びて着地が速くなり、今度は
        //         速度でめり込む（肉で 5.6mm → 10.0mm に悪化した）。
        //         布と紐は変形できるので、湧く時点で器の面に沿わせる。
        //         外周だけが持ち上がり、中央は低いまま＝落下距離が短い
        clearBowl(x, y, z, clearance) {
            const G = this.G;
            const r = Math.min(Math.hypot(x, z), G.rIn);
            return Math.max(y, innerYAt(G, r) + clearance);
        }

        _particleShape(radius, friction) {
            const sh = new BABYLON.PhysicsShapeSphere(BABYLON.Vector3.Zero(), radius, this.scene);
            sh.material = { friction: friction, restitution: 0.0 };
            setMask(sh, MASK.FOOD, MASK.FOOD | MASK.BOWL);
            return sh;
        }

        _node(name, x, y, z, shape, cfg) {
            const tn = new BABYLON.TransformNode(name, this.scene);
            tn.position.set(x, y, z);
            const body = new BABYLON.PhysicsBody(tn,
                BABYLON.PhysicsMotionType.DYNAMIC, false, this.scene);
            body.shape = shape;
            body.setMassProperties({ mass: cfg.mass, inertia: BABYLON.Vector3.Zero() });
            body.setLinearDamping(cfg.lin);
            body.setAngularDamping(cfg.ang);
            return { tn: tn, body: body };
        }

        _link(a, b) {
            const d = BABYLON.Vector3.Distance(a.tn.position, b.tn.position);
            const c = new BABYLON.DistanceConstraint(d, this.scene);
            a.body.addConstraint(b.body, c);
        }

        // ---- 塊: 凸包 ------------------------------------------------
        addChunk(piece, cx, cz) {
            const name = piece.kind + "_body#" + (++_uid);
            const m = named(new BABYLON.Mesh(name, this.scene), name);
            const vd = new BABYLON.VertexData();
            vd.positions = piece.positions.slice();
            vd.indices = Array.from(piece.indices);
            vd.normals = piece.normals.slice();
            vd.applyToMesh(m, false);
            m.isVisible = true;                 // 静定中はこれが見えている
            m.material = this._previewMat(piece.kind);
            // 具の座標は原点まわりで作ってあるので、湧き位置は position で与える
            let reach = 0;
            for (let i = 0; i < piece.nV; i++) {
                const d = Math.hypot(piece.positions[i * 3], piece.positions[i * 3 + 2]);
                if (d > reach) reach = d;
            }
            m.position.set(cx, this.spawnY(cx, cz, reach), cz);
            const c = PHYS.chunk;
            const ag = new BABYLON.PhysicsAggregate(m, BABYLON.PhysicsShapeType.CONVEX_HULL,
                { mass: c.mass, friction: c.friction, restitution: c.restitution }, this.scene);
            setMask(ag.shape, MASK.FOOD, MASK.FOOD | MASK.BOWL);
            ag.body.setLinearDamping(c.lin);
            ag.body.setAngularDamping(c.ang);
            this.chunks.push({ piece: piece, mesh: m, aggregate: ag });
        }

        // ---- 薄切り肉: 布 --------------------------------------------
        // 描画メッシュと同じ極座標の位相で質点を置くので、静定後は
        // 双一次補間で 16 x 40 の中面へそのまま持ち上げられる
        addSheet(desc, cx, cz, radius, seedPos) {
            const cfg = PHYS.cloth;
            const NR = cfg.nRing, NA = cfg.nSide;
            const pitch = radius / NR;
            const shape = this._particleShape(pitch * cfg.radiusRatio, cfg.friction);
            let reach = radius;
            if (seedPos) {
                for (let i = 0; i < seedPos.length; i += 3) {
                    const d = Math.hypot(seedPos[i] - cx, seedPos[i + 2] - cz);
                    if (d > reach) reach = d;
                }
            }
            const y0 = this.top + PHYS.dropGap;
            const clr = pitch * cfg.radiusRatio + 0.06;
            const nodes = [];
            for (let i = 0; i <= NR; i++) {
                for (let j = 0; j < NA; j++) {
                    const o = (i * NA + j) * 3;
                    let px, py, pz;
                    if (seedPos) {
                        px = seedPos[o]; pz = seedPos[o + 2];
                        py = this.clearBowl(px, y0 + seedPos[o + 1], pz, clr);
                    } else {
                        // i=0 は中心の 1 点。同じ位置に NA 個置くと拘束が潰れる
                        const rr = i === 0 ? pitch * 0.12 : radius * (i / NR);
                        const a = j / NA * TAU;
                        px = cx + Math.cos(a) * rr; pz = cz + Math.sin(a) * rr;
                        py = this.clearBowl(px, y0, pz, clr);
                    }
                    nodes.push(this._node("meat_n#" + (++_uid), px, py, pz, shape, cfg));
                }
            }
            const at = (i, j) => nodes[i * NA + ((j % NA) + NA) % NA];
            for (let i = 0; i <= NR; i++) {
                for (let j = 0; j < NA; j++) {
                    this._link(at(i, j), at(i, j + 1));             // 円周
                    if (i < NR) {
                        this._link(at(i, j), at(i + 1, j));         // 半径
                        this._link(at(i, j), at(i + 1, j + 1));     // 斜め
                        this._link(at(i, j + 1), at(i + 1, j));
                    }
                    // 【対策】隣どうしの拘束だけの布は曲げ剛性がゼロで、
                    //         初期形状で巻いても着地の瞬間に平らへ開く。
                    //         2つ隣を結ぶと「巻いた状態での距離」が固定され、
                    //         伸びなくなる。鎖帷子ではなく煮えた肉なので、
                    //         このくらいの腰は持っていてよい
                    if (i < NR - 1) this._link(at(i, j), at(i + 2, j));
                    this._link(at(i, j), at(i, j + 2));
                }
            }
            this.sheets.push({
                desc: desc, nodes: nodes, nRing: NR, nSide: NA,
                radius: radius, particleR: pitch * cfg.radiusRatio
            });
        }

        // ---- しらたき: 質点鎖 ----------------------------------------
        // 巻きぐせを付けた初期形状で湧かせて、絡み方は物理に任せる
        addRope(desc, strandPts, tubeR, cx, cz) {
            const cfg = PHYS.rope;
            const shape = this._particleShape(tubeR * cfg.radiusRatio, cfg.friction);
            let reach = 0;
            for (const pts of strandPts) {
                for (let i = 0; i < pts.length; i += 3) {
                    const d = Math.hypot(pts[i], pts[i + 2]);
                    if (d > reach) reach = d;
                }
            }
            const y0 = this.top + PHYS.dropGap;
            const clr = tubeR * cfg.radiusRatio + 0.06;
            const strands = [];
            for (const pts of strandPts) {
                const chain = [];
                for (let i = 0; i < pts.length / 3; i++) {
                    const px = cx + pts[i * 3], pz = cz + pts[i * 3 + 2];
                    chain.push(this._node("shirataki_n#" + (++_uid),
                        px, this.clearBowl(px, y0 + pts[i * 3 + 1], pz, clr), pz, shape, cfg));
                }
                for (let i = 0; i < chain.length - 1; i++) this._link(chain[i], chain[i + 1]);
                strands.push(chain);
            }
            this.ropes.push({ desc: desc, strands: strands });
        }

        // ---- 静定 ------------------------------------------------------
        step(n) {
            const eng = this.scene.getPhysicsEngine();
            for (let i = 0; i < n; i++) eng._step(PHYS.dt);
        }

        // 静定後、剛体は姿勢を頂点へ焼き込み、物理は捨てる
        harvestChunks() {
            const m4 = BABYLON.Matrix.Identity();
            const v = this._v;
            for (const c of this.chunks) {
                c.mesh.computeWorldMatrix(true);
                m4.copyFrom(c.mesh.getWorldMatrix());
                const p = c.piece.positions, nr = c.piece.normals;
                for (let i = 0; i < c.piece.nV; i++) {
                    v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
                    BABYLON.Vector3.TransformCoordinatesToRef(v, m4, v);
                    p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z;
                    v.set(nr[i * 3], nr[i * 3 + 1], nr[i * 3 + 2]);
                    BABYLON.Vector3.TransformNormalToRef(v, m4, v);
                    const l = Math.hypot(v.x, v.y, v.z) || 1;
                    nr[i * 3] = v.x / l; nr[i * 3 + 1] = v.y / l; nr[i * 3 + 2] = v.z / l;
                }
                c.aggregate.dispose();
                c.mesh.dispose();
            }
        }

        // 布の質点を取り出す。中面を作るのは呼び出し側
        harvestSheets() {
            for (const s of this.sheets) {
                const NR = s.nRing, NA = s.nSide;
                const out = new Float32Array((NR + 1) * NA * 3);
                for (let i = 0; i < s.nodes.length; i++) {
                    const p = s.nodes[i].tn.position;
                    out[i * 3] = p.x; out[i * 3 + 1] = p.y; out[i * 3 + 2] = p.z;
                }
                s.grid = out;
                for (const n of s.nodes) { n.body.dispose(); n.tn.dispose(); }
            }
        }

        harvestRopes() {
            for (const r of this.ropes) {
                r.paths = r.strands.map((chain) => {
                    const out = new Float32Array(chain.length * 3);
                    for (let i = 0; i < chain.length; i++) {
                        const p = chain[i].tn.position;
                        out[i * 3] = p.x; out[i * 3 + 1] = p.y; out[i * 3 + 2] = p.z;
                    }
                    return out;
                });
                for (const chain of r.strands) {
                    for (const n of chain) { n.body.dispose(); n.tn.dispose(); }
                }
            }
        }

        // ---- 静定中の見た目 -------------------------------------------
        // 【対策】塊は isVisible=false で当たり判定だけに使い、布と紐は
        //         TransformNode なので表示物が無い。つまり静定中の器は
        //         空っぽで、9 秒待たされた末に完成品が唐突に現れる。
        //         鍋から掬って盛る過程が見えたほうが分かりやすい
        _previewMat(kind) {
            if (!this._pmats) this._pmats = {};
            if (this._pmats[kind]) return this._pmats[kind];
            const COL = {
                potato: [0.982, 0.826, 0.315], carrot: [0.957, 0.425, 0.045],
                onion: [0.962, 0.868, 0.632], bean: [0.354, 0.514, 0.052],
                meat: [0.792, 0.622, 0.470], shirataki: [0.869, 0.643, 0.360]
            };
            const c = COL[kind] || [0.8, 0.8, 0.8];
            const m = new BABYLON.PBRMaterial("previewMat_" + kind, this.scene);
            m.albedoColor = new BABYLON.Color3(s2l(c[0]), s2l(c[1]), s2l(c[2]));
            m.metallic = 0.0; m.roughness = 0.55;
            m.backFaceCulling = false;
            this._pmats[kind] = m;
            return m;
        }

        _sheetPreview(sh) {
            const NR = sh.nRing, NA = sh.nSide;
            const pos = new Float32Array((NR + 1) * NA * 3);
            const idx = [];
            for (let i = 0; i < NR; i++) {
                for (let j = 0; j < NA; j++) {
                    const a = i * NA + j, b = i * NA + (j + 1) % NA;
                    const c = (i + 1) * NA + j, d = (i + 1) * NA + (j + 1) % NA;
                    idx.push(a, c, b, b, c, d);
                }
            }
            const name = "preview_meat#" + (++_uid);
            const m = named(new BABYLON.Mesh(name, this.scene), name);
            const vd = new BABYLON.VertexData();
            vd.positions = pos; vd.indices = idx;
            vd.normals = new Float32Array(pos.length);
            vd.applyToMesh(m, true);
            m.material = this._previewMat("meat");
            sh.preview = m; sh.previewPos = pos; sh.previewIdx = idx;
        }

        _ropePreview(rp) {
            const lines = rp.strands.map((ch) => ch.map(() => BABYLON.Vector3.Zero()));
            const m = BABYLON.MeshBuilder.CreateLineSystem("preview_shirataki#" + (++_uid),
                { lines: lines, updatable: true }, this.scene);
            m.color = new BABYLON.Color3(0.72, 0.52, 0.30);
            rp.preview = m; rp.previewLines = lines;
        }

        // 質点の今の位置を表示物へ写す。毎フレーム呼ぶ
        syncPreview() {
            for (const sh of this.sheets) {
                if (!sh.preview) this._sheetPreview(sh);
                const p = sh.previewPos;
                for (let i = 0; i < sh.nodes.length; i++) {
                    const q = sh.nodes[i].tn.position;
                    p[i * 3] = q.x; p[i * 3 + 1] = q.y; p[i * 3 + 2] = q.z;
                }
                const nr = new Float32Array(p.length);
                BABYLON.VertexData.ComputeNormals(p, sh.previewIdx, nr);
                sh.preview.updateVerticesData(BABYLON.VertexBuffer.PositionKind, p, false, false);
                sh.preview.updateVerticesData(BABYLON.VertexBuffer.NormalKind, nr, false, false);
                sh.preview.refreshBoundingInfo();
            }
            for (const rp of this.ropes) {
                if (!rp.preview) this._ropePreview(rp);
                for (let k = 0; k < rp.strands.length; k++) {
                    const ch = rp.strands[k], ln = rp.previewLines[k];
                    for (let i = 0; i < ch.length; i++) ln[i].copyFrom(ch[i].tn.position);
                }
                BABYLON.MeshBuilder.CreateLineSystem(rp.preview.name,
                    { lines: rp.previewLines, instance: rp.preview }, this.scene);
            }
        }

        // 静定が終わったら表示物を片付ける。本物のメッシュに差し替わる
        clearPreview() {
            for (const sh of this.sheets) if (sh.preview) { sh.preview.dispose(); sh.preview = null; }
            for (const rp of this.ropes) if (rp.preview) { rp.preview.dispose(); rp.preview = null; }
            if (this._pmats) for (const k in this._pmats) this._pmats[k].dispose();
            this._pmats = null;
        }

        dispose() {
            this.clearPreview();
            if (this.bowl) {
                this.bowl.aggregate.dispose();
                this.bowl.mesh.dispose();
                this.bowl = null;
            }
        }
    }

    // =================================================================
    // 9. Glaze : 煮汁の膜 ★★
    // =================================================================
    // ここが肉じゃがの全部。
    //
    // カレー.js は「被覆率 cov でルウ色へ寄せる」という混色でルウを
    // 表していた。ルウは消散長 2mm を切る不透明体なので、それで正しい。
    // 肉じゃがの煮汁は違う。実測の σ = [0.74, 1.39, 2.10] /cm は
    // 赤の消散長が 1.35cm もあるという意味で、0.4mm の膜など素通りする。
    // 混色でやると、じゃがいもも人参もしらたきも同じ醤油色になる。
    //
    // 正しいのは Beer–Lambert。膜の厚み t に対して光は往復するので
    //
    //     c_out = c_base * exp(-σ * 2t)
    //
    // t = 0.038cm なら透過率は [0.945, 0.900, 0.852]。青だけ 15% 削れる
    // ——つまり「わずかに黄色く濃くなる」だけで、下の色は残る。
    // 一方、具と具の接点で t = 0.19cm まで溜まると [0.755, 0.590, 0.450]
    // になり、はっきり琥珀へ沈む。この差が写真の見え方そのものだった。
    //
    // 膜の厚みは3つの積で決める:
    //   1. 液面からの高さ h        … exp(-h/drain)。垂れ落ちる
    //   2. 面の向き ny             … 上を向くほど厚い（重力）
    //   3. まわりの高さ（pocket）★ … 囲まれているほど厚い
    // 3 が肝。これが無いと山全体が均一に濡れて、濡れたプラスチックになる。
    //
    // もうひとつ、膜とは別に「具が煮汁を吸っている」という効果がある。
    // 濡れた多孔質は乾いたときより暗く・彩度が高く見える（内部散乱の
    // 光路が伸びて吸収が増えるため）。これは膜の透過とは別物なので、
    // アルベドの冪で表す: c_soak = c^(1 + soak). じゃがいもの断面が
    // ふかし芋より濃い黄色になるのはこれ
    const GLAZE = {
        // 【対策】吸い込みをアルベドの冪 c^(1+soak) で表すと、全チャンネルが
        //         いっしょに暗くなる。写真の煮含めたじゃがいもは赤が
        //         器の白より明るいくらいで、落ちているのは青と緑だけ。
        //         冪ではなく「煮汁が表面から染み込んだ深さ」として
        //         Beer–Lambert の光路長に足す。こうすれば σ の比の
        //         とおりに青から先に落ちて、赤はほとんど残る
        soakT: 0.062,    // 煮汁が染み込んだ深さ [cm]
        subK: 1.00,      // 液面より下は沈んだ深さをそのまま光路に足す
        poolK: 1.00,     // pocket が膜の厚みへ効く倍率
        hazeMix: 0.55    // 膜の中の散乱（脂とでんぷん）の混ざり具合
    };

    // 1個ぶんの頂点カラーを焼く。live.reduce（煮詰め）で呼び直す
    function bakeGlaze(piece, field, sauce, brothY, G, live) {
        const nV = piece.nV, pos = piece.positions, nor = piece.normals;
        const bs = piece.base, wt = piece.wet;
        if (!piece.colors) piece.colors = new Float32Array(nV * 4).fill(1);
        const colors = piece.colors;
        const rd = live.reduce;
        const s0 = sauce.sigma[0] * rd, s1 = sauce.sigma[1] * rd, s2 = sauce.sigma[2] * rd;
        const H0 = s2l(sauce.haze[0]), H1 = s2l(sauce.haze[1]), H2 = s2l(sauce.haze[2]);
        const film = sauce.film * live.wetAmt, pool = sauce.pool * live.wetAmt;
        const drain = sauce.drain;
        const soakT = GLAZE.soakT;
        for (let i = 0; i < nV; i++) {
            const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
            const ny = nor[i * 3 + 1];
            // ---- 1. 液面からの高さ -------------------------------------
            const h = Math.max(0, y - brothY);
            const drainF = Math.exp(-h / drain);
            // ---- 2. 面の向き（重力で流れ落ちる）------------------------
            const gravF = 0.40 + 0.60 * (ny * 0.5 + 0.5);
            // ---- 3. 隙間らしさ ★ ---------------------------------------
            const pk = field ? field.pocket(x, y, z, G) : 0;
            let t = wt[i] * (film * drainF * gravF
                + pool * GLAZE.poolK * pk * (0.35 + 0.65 * drainF));
            // 液面より下は膜ではなく汁そのもの。厚みの上限を置いて
            // 真っ黒に落ちるのを防ぐ（そこは液面テクスチャが上から覆う）
            // 【対策】液面より下を pool の 1.6 倍で頭打ちにしていたのは、
            //         具を液面へ焼き込んでいたときの名残。3D で見せる以上、
            //         沈んだ深さぶんの光路をそのまま与えるのが正しい。
            //         深いほど琥珀に沈んで、水中にあることが色で分かる
            if (h <= 0) t = t + (brothY - y) * GLAZE.subK;
            // 表面から染み込んだぶん。膜と違って流れ落ちないので
            // 向きにも高さにも依らず、その具の吸いやすさだけで決まる
            t = clamp(t + soakT * wt[i], 0, 0.9);

            let lr = s2l(clamp(bs[i * 3], 0, 1));
            let lg = s2l(clamp(bs[i * 3 + 1], 0, 1));
            let lb = s2l(clamp(bs[i * 3 + 2], 0, 1));

            // ---- 膜の透過（Beer–Lambert, 往復なので 2t）★ --------------
            const tr = Math.exp(-s0 * 2 * t), tg = Math.exp(-s1 * 2 * t), tb = Math.exp(-s2 * 2 * t);
            lr *= tr; lg *= tg; lb *= tb;
            // 膜そのものの散乱。厚い所ほど白濁して見える（脂とでんぷん）
            const hz = (1 - tg) * sauce.hazeK * GLAZE.hazeMix;
            lr = lr + (H0 - lr) * hz;
            lg = lg + (H1 - lg) * hz;
            lb = lb + (H2 - lb) * hz;

            const o = i * 4;
            colors[o] = lr; colors[o + 1] = lg; colors[o + 2] = lb; colors[o + 3] = 1;
        }
        return colors;
    }

    // 具のマテリアル。1 種類につき1枚。
    // 【対策】膜の厚みは頂点ごとに違うが、粗さを頂点ごとに変える口が
    //         PBRMaterial には無い（頂点カラーは RGB を色に使い切る）。
    //         個体ごとにテクスチャを焼けばできるが、写真を測ると
    //         ハイライトの粗さは山のどこでもほとんど同じで、
    //         目に見えて違うのは色のほうだった。粗さは種類ごとの
    //         一定値に置き、膜の厚みは色だけに効かせる
    function pieceMaterial(scene, S, name, sauce, live) {
        const m = new BABYLON.PBRMaterial(name, scene);
        // 色は全部頂点カラーで持つので、アルベドは白
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0.0;
        m.roughness = S.rough;
        // 【対策】照りを roughness で作ると、地の出ている面まで一緒に
        //         光ってプラスチックになる。照りは全部 clearCoat
        //         （＝煮汁の膜。糖を含むので IOR は水より高い 1.40）へ
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = clamp(S.coat * sauce.coat * live.gloss, 0, 1);
        m.clearCoat.roughness = clamp(mix(S.coatRough, sauce.rough, 0.55) / Math.max(0.2, live.gloss), 0.01, 0.7);
        m.clearCoat.indexOfRefraction = 1.40;
        const sub = m.subSurface;
        sub.isTranslucencyEnabled = true;
        sub.translucencyIntensity = clamp(S.trans * live.trans, 0, 0.95);
        // 【対策】tintColor を既定（白）のままにすると、透過した光が
        //         そのまま白として乗る。しらたきは透過率 0.86 もあるので、
        //         無彩色が上に足されて「発光する白い紐」になる。
        //         透過光は具の中を通るので、必ずその具の色に染まる
        sub.tintColor = col3(S.transTint);
        sub.minimumThickness = 0.02;
        sub.maximumThickness = (S.thick3 !== undefined ? S.thick3 : S.thick);
        m.spec = S;
        return m;
    }

    // =================================================================
    //  盛り付け
    // =================================================================
    // 【対策】鍋の中の順番（下から 芋・玉ねぎ → 肉 → しらたき）で
    //         そのまま積むと、いちばん見せたいじゃがいもが全部
    //         山の底に埋まる。実際の器は「鍋から掬った断面」なので、
    //         芋が上にも下にも居る。層ではなく、大きいものから
    //         順に落として隙間を小さいもので埋めるほうが写真に近い
    function poseFor(kind, rng) {
        const Q = BABYLON.Quaternion;
        switch (kind) {
            case "carrot":
            case "bean":
                // 長い軸（y）を寝かせる。転がるので少しは立つ
                return Q.RotationYawPitchRoll(rng.range(0, TAU),
                    Math.PI * 0.5 + rng.gauss(0, 0.32), rng.range(0, TAU));
            case "onion":
                // くし切りは平らな面を下にして落ち着く
                return Q.RotationYawPitchRoll(rng.range(0, TAU),
                    Math.PI * 0.5 + rng.gauss(0, 0.42), rng.range(0, TAU));
            case "meat":
                // 薄切りは寝る。ただし山の斜面に沿ってかなり傾く
                return Q.RotationYawPitchRoll(rng.range(0, TAU),
                    rng.gauss(0, 0.42), rng.gauss(0, 0.42));
            case "shirataki":
                return Q.RotationYawPitchRoll(rng.range(0, TAU),
                    rng.gauss(0, 0.22), rng.gauss(0, 0.22));
            default:
                return Q.RotationYawPitchRoll(rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU));
        }
    }

    // 【変更】盛り付けを Havok に渡した。高さ場は「セルごとの最上点」しか
    //         持たないので、具が別の具の横に寄りかかることも、薄い肉が
    //         塊の上へ垂れて谷を埋めることも表現できず、実測でも肉が
    //         じゃがいもの側面へ刺さっていた。Field は当たり判定をやめ、
    //         静定後の走査変換（膜の pocket と液面の下地）だけを担う。
    //         onWave はブラウザへ制御を返すためのフック
    // 置き場所を決めるための、種類ごとのおおよその外接半径 [cm]
    function pieceRadius(kind, fill, sc) {
        if (kind === "potato") return CHUNK_SPEC.potato.size * sc * 1.05;
        if (kind === "carrot") return CHUNK_SPEC.carrot.size * sc * 1.55;
        if (kind === "onion") return ONION.size * sc * 1.00;
        if (kind === "bean") return BEAN.size * 1.12;
        // 肉は outR の最大 1.44 と縦横比 A の最大 1.35 が効く
        // 帯は巻いてから落ちるので、平らな外接半径の 6 割ほどに収まる
        if (kind === "meat") return MEATS[fill.meatKind].size * sc * 1.46 * 2.75 * 0.62;
        return SHIRATAKI.rx * 1.14 * 1.15;
    }

    async function buildComposition(scene, G, fill, seed, onWave) {
        const rng = new Rng(seed >>> 0);
        const field = new Field(G.pileGrid, G.pileHalf, (x, z) => {
            const r = Math.hypot(x, z);
            // 器の外側は「置けない高さ」にして、はみ出しを弾く
            return r > G.rIn ? 40 : innerYAt(G, r);
        });

        // 投入する順番のリストを作る。
        // 【対策】種類ごとにまとめて落とすと、地層のように色が分かれる。
        //         大きさで大まかに順序を付けつつ、種類は混ぜる
        const order = [];
        const push = (k, n) => { for (let i = 0; i < n; i++) order.push(k); };
        const order0Len = () => order.length;
        // 【対策】以前は「肉 → にんじん・じゃがいも」の順で落としていた。
        //         あとから落ちる塊は重い凸包なので、先に置いた軽い布と紐を
        //         そのまま押し込んで下敷きにする。実際の鍋も、掬うときに
        //         上へ来るのは肉・しらたき・絹さやのほう。
        //         重い塊を先に置いて土台にし、軽いものを後から載せる
        push("onion", Math.ceil(fill.onion * 0.55));
        push("potato", Math.ceil(fill.potato * 0.60));
        push("carrot", Math.ceil(fill.carrot * 0.55));
        // しらたきは一部だけ下へ。全部を上に載せると布団のように覆う
        push("shirataki", Math.floor(fill.shirataki * 0.35));
        push("onion", Math.floor(fill.onion * 0.45));
        push("potato", Math.floor(fill.potato * 0.40));
        push("carrot", Math.floor(fill.carrot * 0.45));
        // ここから上に見せたいもの
        push("meat", Math.ceil(fill.meat * 0.55));
        push("shirataki", fill.shirataki - Math.floor(fill.shirataki * 0.35));
        push("meat", Math.floor(fill.meat * 0.45));
        push("bean", fill.bean);

        const plating = new Plating(scene, G);
        // 【対策】1 波ぶんをまとめて回すと、その間ブラウザに制御が戻らず
        //         コマが飛ぶ。少しずつ進めて毎回描かせる
        let doneSteps = 0;
        const totalSteps = Math.ceil(order0Len() / PHYS.waveChunk) * PHYS.waveChunkSteps
            + PHYS.finalSteps;
        async function runSteps(n) {
            for (let k = 0; k < n; k += PHYS.stepsPerFrame) {
                plating.step(Math.min(PHYS.stepsPerFrame, n - k));
                doneSteps += Math.min(PHYS.stepsPerFrame, n - k);
                plating.syncPreview();
                if (onWave) await onWave(Math.min(0.99, doneSteps / totalSteps * 0.92));
            }
        }
        const pieces = [];
        let gi = 0;
        for (let i = 0; i < order.length; i++) {
            const kind = order[i];
            const sd = (seed ^ 0x5A17) + i * 7919;
            const r2 = new Rng(sd);
            const q = poseFor(kind, r2);
            // 投入位置は黄金角で回す。少ない個数でも偏らない。
            // 【対策】半径を √(i/n) で振ると外周から埋まって「土手」になる。
            //         中心を高く積みたいので、序盤ほど内側へ寄せる
            const sc = r2.range(0.89, 1.11);
            const r2seedRadius = sc;
            const a = GOLD * gi + r2.range(-0.35, 0.35);
            const frac = i / Math.max(1, order.length - 1);
            // 【対策】半径を frac の冪で直に振ると、r に一様＝面積では
            //         中心へ密になり、外周 2cm が空いたまま中央だけ
            //         3 層に積み上がる。順番は中心から（土手を作らない）
            //         ままで、半径は √ を通して面積で等分する
            const rr = G.pileR * Math.sqrt(mix(0.02, 1.0, Math.pow(frac, 1 - G.pileDome)))
                * r2.range(0.80, 1.04);
            gi++;
            // 【対策】高さ場版の fitInsideBowl を消したまま、収まり判定を
            //         置き換えていなかった。肉のシートは outR で最大
            //         1.44 倍まで伸びるので、pileR=7.0 に置くと外周が
            //         r=10.2 に達して口縁の外へ落ちる。種類ごとの外接
            //         半径で置き場所を器の中へ引き戻す
            const pr = pieceRadius(kind, fill, sc, r2seedRadius);
            const rMax = Math.max(0, G.rIn - pr - 0.35);
            const rr2 = Math.min(rr, rMax);
            const cx = Math.cos(a) * rr2, cz = Math.sin(a) * rr2;

            // 【対策】0.84〜1.16 は体積では 0.59〜1.56 倍にあたり、
            //         じゃがいも 1 個が 15〜28cm³ とばらつく。5 個でも
            //         打ち消し合わず、盛りの総量がシードごとに
            //         190〜280cm³ と揺れて山の高さが安定しない

            if (kind === "potato" || kind === "carrot" || kind === "onion" || kind === "bean") {
                // 塊は凸包。原点まわりで作り、置き場所は剛体の position で与える
                let p;
                if (kind === "potato" || kind === "carrot") p = makeBlobPiece(kind, sc, q, 0, 0, sd);
                else if (kind === "onion") p = buildOnionWedge(sc, q, 0, 0, sd);
                else p = buildBean(r2.range(0.88, 1.12), q, 0, 0, sd);
                p.kind = kind;
                plating.addChunk(p, cx, cz);
                pieces.push(p);
            } else if (kind === "meat") {
                // 薄切り肉は布。形は物理が決めるので、ここでは半径だけ渡す
                const M = MEATS[fill.meatKind];
                const cl = PHYS.cloth;
                // 【対策】こま切れは端材なので、1枚ごとの大小が塊肉の比では
                //         ない。0.89〜1.11 だと全部同じ大きさに見える
                const msc = M.koma ? sc * r2.range(0.62, 1.42) : sc;
                const seedPos = meatSeedGrid(fill.meatKind, msc, sd,
                    cl.nRing, cl.nSide, cx, cz, 0);
                plating.addSheet({ kind: kind, sub: fill.meatKind, sc: msc, q: q, seed: sd },
                    cx, cz, M.size * msc, seedPos);
            } else {
                // しらたきは質点鎖。巻きぐせを付けた初期形状で湧かせて、
                // 絡み方は物理に任せる
                const S = SHIRATAKI, rs = new Rng(sd >>> 0), rsc = r2.range(0.90, 1.14);
                const nStr = S.strands[0] + rs.int(S.strands[1] - S.strands[0] + 1);
                const paths = [];
                for (let k = 0; k < nStr; k++) {
                    const st = shirataStrand(S, rs, sd + 401 + k * 17, k);
                    // 物理の質点は 0.8cm 間隔。描画の 0.2cm 刻みは細かすぎる
                    const every = Math.max(1, Math.round(PHYS.rope.ds / S.ds));
                    const out = [];
                    for (let t = 0; t <= st.N; t += every) {
                        out.push(st.pts[t * 3] * rsc, st.pts[t * 3 + 1] * rsc, st.pts[t * 3 + 2] * rsc);
                    }
                    paths.push(Float32Array.from(out));
                }
                plating.addRope({ kind: kind, sc: rsc, q: q, seed: sd },
                    paths, S.rad * rsc, cx, cz);
            }

            // 波ごとに落とす。全部いっぺんに湧かせると塔になってから崩れる
            if ((i + 1) % PHYS.waveChunk === 0 || i === order.length - 1) {
                await runSteps(PHYS.waveChunkSteps);
                plating.refreshTop();
            }
        }

        // ---- 静定 --------------------------------------------------------
        await runSteps(PHYS.finalSteps);
        plating.clearPreview();

        // ---- 静定後の位置から幾何を作り直す ------------------------------
        plating.harvestChunks();     // 剛体は姿勢を頂点へ焼き込む
        plating.harvestSheets();
        plating.harvestRopes();

        for (const sh of plating.sheets) {
            const d = sh.desc;
            const p = buildMeatSheet(d.sub, d.sc, d.q, 0, 0, d.seed, {
                nRing: sh.nRing, nSide: sh.nSide, pos: sh.grid, particleR: sh.particleR
            });
            p.kind = "meat";
            pieces.push(p);
        }
        for (const rp of plating.ropes) {
            const d = rp.desc;
            const p = buildShirataki(d.sc, d.q, 0, 0, d.seed, rp.paths);
            p.kind = "shirataki";
            pieces.push(p);
        }
        plating.dispose();

        // ---- 高さ場へ焼き付ける（膜の pocket と液面の下地に使う）----------
        for (const p of pieces) field.deposit(p.positions, p.indices, p.base);

        return { field: field, pieces: pieces, plating: plating };
    }

    // =================================================================
    // 10. Broth : 煮汁の液面
    // =================================================================
    // 【対策】味噌汁は不透明な散乱体だったので、液面のアルベドは
    //         「汁の地色＋沈んだ具のうっすら」でよかった。煮汁は
    //         澄んでいるので、器の白が底から透けて見えるところまで
    //         描かないと「黒い水たまり」になる。器の内側の高さを
    //         高さ場に持たせてあるので、具が無い所は器の色を使う
    function brothFields(G, field, sauce, brothY, brothR, bowlAlbedo, seed) {
        const N = Math.max(64, Math.round(G.brothTex) || 512), n2 = N * N;
        const half = field.half;
        const F = {
            N: N, half: half,
            mottle: new Float32Array(n2),   // 脂とアクのムラ
            dep: new Float32Array(n2),      // 液面から下地までの深さ [cm]
            objR: new Float32Array(n2), objG: new Float32Array(n2), objB: new Float32Array(n2),
            near: new Float32Array(n2),     // 液面より上の具までの距離 [cm]
            sub: new Float32Array(n2),      // 液面の下に具が居るか（0/1）
            wall: new Float32Array(n2),     // 器の内壁までの近さ 0..1
            oil: new Float32Array(n2),      // 脂の玉の被覆
            oilRim: new Float32Array(n2),   // 脂の玉の縁
            ripple: new Float32Array(n2)
        };
        const rng = new Rng(seed >>> 0);
        // 脂の玉。煮汁の表面に浮いた牛脂は円形の膜になり、縁だけ細く光る。
        // 【対策】味噌汁より数を減らし、粒を大きくする。牛脂は融点が高く、
        //         冷めかけると小さい玉どうしがくっついて大きな輪になる
        const drops = [];
        const nd = 16 + rng.int(14);
        for (let i = 0; i < nd; i++) {
            const a = rng.range(0, TAU), rr = brothR * Math.sqrt(rng.next()) * 0.97;
            drops.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, r: rng.range(0.10, 0.52) });
        }
        const BW = [s2l(bowlAlbedo[0]), s2l(bowlAlbedo[1]), s2l(bowlAlbedo[2])];
        const s = { y: 0, fy: 0, r: 0, g: 0, b: 0, d: 0 };
        const lit = G.veilLit;
        for (let py = 0; py < N; py++) {
            const z = ((py + 0.5) / N * 2 - 1) * half;
            for (let px = 0; px < N; px++) {
                const x = ((px + 0.5) / N * 2 - 1) * half;
                const k = py * N + px;
                // 対流とアクのムラ。単一周波数だと等高線図になるので帯域を分ける
                const m1 = Noise.fbm2(x * 0.62 + 3, z * 0.62 + 7, seed + 11, 3) - 0.5;
                const m2 = Noise.fbm2(x * 2.4 + 13, z * 2.4 + 2, seed + 29, 2) - 0.5;
                F.mottle[k] = clamp(0.5 + m1 * 1.05 + m2 * 0.50, 0, 1);
                // 下地: 沈んだ具があればその色、無ければ器の内側
                field.sample(x, z, s);
                let underY = Math.max(s.y, s.fy);
                // 【対策】高さ場の外では sample が -1e9 を返す。そのまま
                //         引くと深さが 1e9 cm になり、Beer–Lambert が
                //         真っ黒に潰れて液面の縁に黒い環が出る。
                //         器の外は見込みの高さで打ち切り、深さは器の
                //         いちばん深い所（= sauce.depth）で頭を止める
                if (underY < -1e8) {
                    underY = innerYAt(G, Math.min(Math.hypot(x, z), G.rIn));
                }
                F.dep[k] = clamp(brothY - underY, 0, sauce.depth);
                if (s.y > s.fy + 0.004 && s.y > -1e8) {
                    // 【対策】沈んだ具の色をここへ焼き込み、具のメッシュは
                    //         非表示にしていた。だから水面下の具が「印刷された
                    //         絵」に見えるし、そのシルエットは高さ場の
                    //         0.65mm セルで量子化されてギザギザになる。
                    //         具は 3D のまま見せ、液面はその上を通す膜にする。
                    //         ここでは「下に具が居るか」だけを記録する
                    F.sub[k] = 1;
                    const sh0 = 1 - 0.32 * smooth(brothR - 1.6, brothR, Math.hypot(x, z));
                    F.objR[k] = BW[0] * sh0; F.objG[k] = BW[1] * sh0; F.objB[k] = BW[2] * sh0;
                } else {
                    // 器の見込み。壁ぎわは自分の影が落ちて暗い
                    const sh = 1 - 0.32 * smooth(brothR - 1.6, brothR, Math.hypot(x, z));
                    F.objR[k] = BW[0] * sh; F.objG[k] = BW[1] * sh; F.objB[k] = BW[2] * sh;
                }
                F.near[k] = s.d;
                const rr = Math.hypot(x, z);
                F.wall[k] = smooth(brothR - 1.15, brothR - 0.02, rr);
                // 脂の玉。
                // 【対策】全テクセルで全部の玉の hypot を取ると、これだけで
                //         数百万回の平方根になる。まず外接矩形で落とす
                let oi = 0, orim = 0;
                for (const dp of drops) {
                    const lim = dp.r * 1.25;
                    const ax = x - dp.x; if (ax > lim || ax < -lim) continue;
                    const az = z - dp.z; if (az > lim || az < -lim) continue;
                    const dd = Math.hypot(ax, az);
                    if (dd > lim) continue;
                    oi = Math.max(oi, 1 - smooth(dp.r * 0.72, dp.r, dd));
                    orim = Math.max(orim, 1 - smooth(0.0, dp.r * 0.16, Math.abs(dd - dp.r * 0.87)));
                }
                F.oil[k] = oi; F.oilRim[k] = orim;
                // 【対策】さざ波の法線はタイリングさせて流すので、この場は
                //         周期関数だけで作る。器の縁から立つ定在波（非周期）を
                //         混ぜると、繰り返しの継ぎ目に一直線の筋が出る
                F.ripple[k] = (Noise.fbm2p(px / N * 8, py / N * 8, 8, 8, seed + 97, 3) - 0.5);
            }
        }
        F.drops = drops;
        // 【対策】下敷きの有無をそのまま透明度にすると、高さ場のセルの
        //         形がそのまま階段状に出る。分離型のぼかしを1回かけて、
        //         具の輪郭を柔らかい傾斜に変える
        {
            const R = 3, tmp = new Float32Array(n2), w = 1 / (2 * R + 1);
            for (let y = 0; y < N; y++) {
                let acc = 0;
                for (let x = -R; x <= R; x++) acc += F.sub[y * N + clamp(x, 0, N - 1)];
                for (let x = 0; x < N; x++) {
                    tmp[y * N + x] = acc * w;
                    acc += F.sub[y * N + clamp(x + R + 1, 0, N - 1)]
                        - F.sub[y * N + clamp(x - R, 0, N - 1)];
                }
            }
            for (let x = 0; x < N; x++) {
                let acc = 0;
                for (let y = -R; y <= R; y++) acc += tmp[clamp(y, 0, N - 1) * N + x];
                for (let y = 0; y < N; y++) {
                    F.sub[y * N + x] = acc * w;
                    acc += tmp[clamp(y + R + 1, 0, N - 1) * N + x]
                        - tmp[clamp(y - R, 0, N - 1) * N + x];
                }
            }
        }
        return F;
    }

    // リニア → sRGB の引き表。
    // 【対策】σ を動かすたびに 26 万テクセル × 3 チャンネルの pow を
    //         回すとスライダーが 40ms 刻みになる。l2s は単調なので
    //         1024 段の表と線形補間で十分（誤差 < 1/255）
    const L2S = (() => {
        const M = 1025, t = new Float32Array(M);
        for (let i = 0; i < M; i++) t[i] = l2s(i / (M - 1));
        return t;
    })();
    function l2sFast(v) {
        if (v <= 0) return 0;
        if (v >= 1) return 1;
        const f = v * 1024, i = f | 0, k = f - i;
        return L2S[i] + (L2S[i + 1] - L2S[i]) * k;
    }

    // σ（煮詰め）に依存する部分だけを描く。スライダーはここだけ呼び直す。
    // 【対策】mix3 は毎回配列を返す。26 万テクセル × 5 回で 130 万個の
    //         使い捨て配列が出て、GC だけでスライダーがカクつく。
    //         見た目の悪さを承知でスカラーに展開する
    function brothAlbedoFill(d, N, F, sauce, live) {
        const rd = live.reduce;
        const s0 = sauce.sigma[0] * rd, s1 = sauce.sigma[1] * rd, s2 = sauce.sigma[2] * rd;
        const H0 = s2l(sauce.haze[0]), H1 = s2l(sauce.haze[1]), H2 = s2l(sauce.haze[2]);
        const hk = sauce.hazeK, kOil = sauce.oil;
        const n2 = N * N;
        for (let k = 0; k < n2; k++) {
            const dep = F.dep[k];
            // ★ Beer–Lambert。下地の色が煮汁を往復して戻ってくる
            const tr = Math.exp(-s0 * 2 * dep);
            const tg = Math.exp(-s1 * 2 * dep);
            const tb = Math.exp(-s2 * 2 * dep);
            let r = F.objR[k] * tr, g = F.objG[k] * tg, b = F.objB[k] * tb;
            // 散乱（アク・脂・でんぷん）。深いほど白濁が乗る
            const mv = F.mottle[k];
            const hz = (1 - tg) * hk * (0.72 + 0.56 * mv);
            r += (H0 - r) * hz; g += (H1 - g) * hz; b += (H2 - b) * hz;

            // 液面から出ている具のきわ: 内側に接触の影、外側にメニスカスの照り
            const nd = F.near[k];
            let sh = nd / 0.22; sh = sh < 0 ? 0 : (sh > 1 ? 1 : sh);
            sh = 1 - sh * sh * (3 - 2 * sh);
            if (sh > 0) {
                const w = sh * 0.58;
                r += (r * 0.60 - r) * w; g += (g * 0.58 - g) * w; b += (b * 0.55 - b) * w;
            }
            let ra = (nd - 0.050) / 0.120; ra = ra < 0 ? 0 : (ra > 1 ? 1 : ra);
            let rb = nd / 0.05; rb = rb < 0 ? 0 : (rb > 1 ? 1 : rb);
            const rim = (1 - ra * ra * (3 - 2 * ra)) * (rb * rb * (3 - 2 * rb)) * 0.85;
            if (rim > 0) {
                const tr2 = r * 1.30 + 0.010, tg2 = g * 1.28 + 0.008, tb2 = b * 1.26 + 0.006;
                r += (tr2 - r) * rim; g += (tg2 - g) * rim; b += (tb2 - b) * rim;
            }
            // 器ぎわ: 内壁が空を遮るぶん沈む
            const wl = F.wall[k] * 0.52;
            if (wl > 0) {
                r += (r * 0.70 - r) * wl; g += (g * 0.68 - g) * wl; b += (b * 0.64 - b) * wl;
            }
            // 脂の玉はわずかに黄色く明るい（牛脂は液面より薄い膜）
            const ol = F.oil[k] * kOil * 0.42;
            if (ol > 0) {
                r += (r * 1.10 + 0.004 - r) * ol; g += (g * 1.06 - g) * ol; b += (b * 0.92 - b) * ol;
            }
            const o = k * 4;
            d[o] = l2sFast(r) * 255;
            d[o + 1] = l2sFast(g) * 255;
            d[o + 2] = l2sFast(b) * 255;
            // 【対策】下に具が居る所は液面を通す。全部不透明のままだと、
            //         3D の具が液面テクスチャに隠れて結局見えない。
            //         少し残すのは、水面の照りと脂の玉を保つため
            d[o + 3] = (1 - F.sub[k] * 0.86) * 255;
        }
    }

    function brothTextures(scene, G, F, sauce, live) {
        const N = F.N, n2 = N * N;
        const albedo = TexLab._tex("brothA", N, N, (d) => {
            brothAlbedoFill(d, N, F, sauce, live);
        }, scene, false, true);
        albedo.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;

        // 膜（＝液面）の被覆と粗さ。脂の玉の内側だけ一段滑らかになる
        const coat = TexLab._tex("brothC", N, N, (d) => {
            for (let k = 0; k < n2; k++) {
                const oil = F.oil[k] * sauce.oil;
                const cov = clamp(0.90 + 0.10 * oil, 0, 1);
                let ro = sauce.rough * (1 - 0.40 * oil) + 0.05 * F.wall[k];
                // 具の接触ぎわは表面が乱れて光が散る
                ro += (1 - smooth(0.0, 0.14, F.near[k])) * 0.11;
                const o = k * 4;
                d[o] = cov * 255; d[o + 1] = clamp(ro, 0.02, 0.9) * 255;
                d[o + 2] = 0; d[o + 3] = 255;
            }
        }, scene, true, true);
        coat.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;

        const orm = TexLab._tex("brothO", N, N, (d) => {
            for (let k = 0; k < n2; k++) {
                const ao = clamp(1 - 0.42 * F.wall[k] - 0.48 * (1 - smooth(0.0, 0.24, F.near[k])), 0.22, 1);
                const o = k * 4;
                d[o] = ao * 255; d[o + 1] = 0.60 * 255; d[o + 2] = 0; d[o + 3] = 255;
            }
        }, scene, true, true);
        orm.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;

        // さざ波の法線。こちらはタイリングさせてゆっくり流す
        const H = new Float32Array(n2);
        for (let k = 0; k < n2; k++) {
            H[k] = clamp(0.5 + F.ripple[k] * 0.5 + F.oilRim[k] * 0.26 * sauce.oil
                - F.oil[k] * sauce.oil * 0.07, 0, 1);
        }
        const ripple = TexLab.normalFromHeight("brothN", N, H, 1.25, scene, false);
        return { albedo: albedo, coat: coat, orm: orm, ripple: ripple };
    }

    function brothMaterial(scene, tex, sauce, live, name) {
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = tex.albedo;
        tex.albedo.hasAlpha = true;
        m.useAlphaFromAlbedoTexture = true;
        m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
        m.separateCullingPass = true;
        m.metallic = 0.0;
        m.roughness = 1.0;
        m.metallicTexture = tex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        // 【対策】煮汁は「水の面」と「その下の景色」の2層。1枚の PBR で
        //         滑らかにすると濡れたプラスチックの板になる。
        //         下地は完全な拡散体にして、照りは全部 clearCoat
        //         （＝液面, 糖を含むので IOR 1.37）に持たせる
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = tex.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        m.clearCoat.intensity = 1.0;
        m.clearCoat.roughness = clamp(sauce.rough / Math.max(0.2, live.gloss), 0.01, 0.6);
        m.clearCoat.indexOfRefraction = 1.372;
        m.clearCoat.bumpTexture = tex.ripple;
        m.clearCoat.bumpTexture.level = 0.50 * live.ripple;
        tex.ripple.uScale = 2.2; tex.ripple.vScale = 2.2;
        return m;
    }

    // 液面のメッシュ。中心から水際まで刻み、最後に内壁を這い上がる数リングを足す
    function buildBrothSurface(scene, G, F, mat, brothY, brothR) {
        const NR = Math.max(16, G.brothRings | 0), NS = Math.max(24, G.brothSectors | 0);
        const MEN = 4;                                    // メニスカスのリング数
        const rows = NR + 1 + MEN;
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
                // 中心 → 水際。面積が等しくなるように刻む
                const t = i / NR;
                rr = brothR * Math.sqrt(t) * 0.5 + brothR * t * 0.5;
                yy = brothY;
            } else {
                // 【対策】水は器の内壁をわずかに這い上がる。ここを直角に
                //         切ると「板がはまっている」ように見える。壁の断面に
                //         沿わせ、器の中へ 0.02cm 食い込ませて隙間を殺す
                const t = (i - NR) / MEN;
                yy = brothY + G.meniscus * Math.pow(t, 1.5);
                rr = innerRadiusAt(G, yy) + 0.020;
            }
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                const x = rr * Math.cos(th), z = rr * Math.sin(th);
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = x;
                const rr2 = Math.hypot(x, z);
                const wallW = smooth(brothR - 1.15, brothR - 0.02, rr2);
                const hh = rippleAt(x, z) + Math.sin(rr2 * 8.1 + 1.2) * 0.15 * wallW;
                positions[p3 + 1] = yy + (i <= NR ? hh * G.ripple : 0);
                positions[p3 + 2] = z;
                // 平面投影の UV。沈んだ具の輪郭がワールド XZ で焼いてあるので、
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
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        // 液面は必ず上を向く
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
        const mesh = makeMesh("broth", positions, indices, normals, uvs, null, scene);
        mesh.material = mat;
        mesh.receiveShadows = true;
        return mesh;
    }

    // =================================================================
    //  木のテクスチャ（テーブル / 箸 / 箸置き）
    // =================================================================
    // 【対策】アルベド・ORM・法線でノイズを引き直すと、同じ 512² を3回
    //         走査するうえ、丸め方の違いで年輪の位置がわずかにずれ、
    //         「木目の上に別の木目の影が乗った」ように見える。場は1度だけ作る
    function woodSet(scene, name, size, seed, opt) {
        const N = Math.max(64, Math.round(size) || 512), n2 = N * N;
        const ring = new Float32Array(n2), fine = new Float32Array(n2), knot = new Float32Array(n2);
        // 年輪1本ぶんの濃さ。
        // 【対策】|sin(ρπ)|^k の縞は等間隔・等強度になり、段ボールの筋にしか
        //         見えない。整数の輪番号をハッシュして、輪ごとに幅・濃さ・
        //         輪内の位置を配る
        const ringAt = (rho, sd) => {
            const n = Math.floor(rho), f = rho - n;
            const h1 = Noise._h2(n, 0, sd), h2 = Noise._h2(n, 1, sd), h3 = Noise._h2(n, 2, sd);
            const w = 0.09 + 0.30 * h2 * h2;
            const c = 0.16 + 0.84 * h1 * h1;
            const p = 0.55 + 0.35 * h3;
            let d = Math.abs(f - p); if (d > 0.5) d = 1 - d;
            return c * (1 - smooth(w * 0.30, w, d));
        };
        for (let y = 0; y < N; y++) {
            const v = y / N;
            for (let x = 0; x < N; x++) {
                const u = x / N, i = y * N + x;
                const a = opt.across ? v : u, b = opt.across ? u : v;
                // 【対策】年輪を直線にすると印刷した紙になる。うねりを1帯域
                //         だけにすると等間隔の波になって段ボールに見える。
                //         幹の曲がり（低周波）と木理のよじれ（中周波）を重ねる
                const lo = Noise.fbm2p(b * 2.4, a * 1.3, 3, 2, seed + 11, 3) - 0.5;
                const mi2 = Noise.fbm2p(b * 8.5, a * 4.2, 9, 5, seed + 19, 2) - 0.5;
                const t = a * opt.rings + (lo * 1.0 + mi2 * 0.30) * opt.wave;
                ring[i] = ringAt(t, seed + 311);
                fine[i] = Noise.fbm2p(b * 55, a * 300, 55, 300, seed + 43, 2);
                knot[i] = Noise.fbm2p(b * 3.4, a * 3.1, 4, 3, seed + 89, 3);
            }
        }
        const BASE = opt.base, GRAIN = opt.grain, DARK = opt.dark;
        const albedo = TexLab._tex(name + "A", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                let c = mix3(BASE, GRAIN, clamp(ring[i] * 0.78 + (fine[i] - 0.5) * 0.20, 0, 1));
                c = mix3(c, DARK, smooth(0.80, 0.96, knot[i]) * opt.knot);
                const k = i * 4;
                d[k] = clamp(c[0], 0, 1) * 255; d[k + 1] = clamp(c[1], 0, 1) * 255;
                d[k + 2] = clamp(c[2], 0, 1) * 255; d[k + 3] = 255;
            }
        }, scene, false, false);
        const orm = TexLab._tex(name + "O", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const ro = clamp(opt.rough + 0.11 * ring[i] + 0.06 * (fine[i] - 0.5), 0.10, 0.98);
                const k = i * 4;
                d[k] = 255; d[k + 1] = ro * 255; d[k + 2] = 0; d[k + 3] = 255;
            }
        }, scene, true, false);
        const H = new Float32Array(n2);
        for (let i = 0; i < n2; i++) H[i] = clamp(0.5 - 0.26 * ring[i] + 0.20 * (fine[i] - 0.5), 0, 1);
        const normal = TexLab.normalFromHeight(name + "N", N, H, opt.bump, scene, false);
        return { albedo: albedo, orm: orm, normal: normal };
    }

    // ---- 箸 ------------------------------------------------------------
    // 断面を「丸めた四角 → 円」へ連続的に変えながら掃引する。
    // 実物の塗り箸は持ち手が角、先が丸。ここを一定にすると爪楊枝に見える
    function buildChopstick(scene, name, rng, A, B) {
        const NL = 30, NS = 18;
        const nV = NL * (NS + 1) + 2;
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array(((NL - 1) * NS * 2 + NS * 2) * 3);
        const ax = new V3(B.x - A.x, B.y - A.y, B.z - A.z);
        const L = ax.length(); ax.scaleInPlace(1 / L);
        let up = new V3(0, 1, 0);
        if (Math.abs(BABYLON.Vector3.Dot(up, ax)) > 0.98) up = new V3(1, 0, 0);
        const e1 = BABYLON.Vector3.Cross(ax, up).normalize();
        const e2 = BABYLON.Vector3.Cross(e1, ax).normalize();
        const roll = rng.range(0, TAU);
        let vo = 0;
        for (let i = 0; i < NL; i++) {
            const t = i / (NL - 1);
            // 【対策】細りの指数を 1.35 にすると中央でもう 3mm まで落ちて、
            //         遠目には串に見える。実物は 2/3 あたりまでほとんど
            //         細らず、先の 1/4 で一気に細くなる
            const rad = mix(0.275, 0.090, Math.pow(t, 2.6));
            const p = mix(5.0, 2.0, smooth(0.30, 0.94, t));
            const cx = A.x + (B.x - A.x) * t, cy = A.y + (B.y - A.y) * t, cz = A.z + (B.z - A.z) * t;
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU + roll;
                const ca = Math.abs(Math.cos(th)), sa = Math.abs(Math.sin(th));
                const sr = rad / Math.pow(Math.pow(ca, p) + Math.pow(sa, p), 1 / p);
                const ox = Math.cos(th) * sr, oy = Math.sin(th) * sr;
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = cx + e1.x * ox + e2.x * oy;
                positions[p3 + 1] = cy + e1.y * ox + e2.y * oy;
                positions[p3 + 2] = cz + e1.z * ox + e2.z * oy;
                uvs[p2] = j / NS * 0.5; uvs[p2 + 1] = t * 8;
                vo++;
            }
        }
        const capA = vo, capB = vo + 1;
        positions[capA * 3] = A.x; positions[capA * 3 + 1] = A.y; positions[capA * 3 + 2] = A.z;
        positions[capB * 3] = B.x; positions[capB * 3 + 1] = B.y; positions[capB * 3 + 2] = B.z;
        vo += 2;
        let io = 0;
        for (let i = 0; i < NL - 1; i++) {
            for (let j = 0; j < NS; j++) {
                const a = i * (NS + 1) + j, b = a + 1, c = a + NS + 1, d = c + 1;
                indices[io++] = a; indices[io++] = c; indices[io++] = b;
                indices[io++] = b; indices[io++] = c; indices[io++] = d;
            }
        }
        for (let j = 0; j < NS; j++) {
            indices[io++] = capA; indices[io++] = j; indices[io++] = j + 1;
            const base = (NL - 1) * (NS + 1);
            indices[io++] = capB; indices[io++] = base + j + 1; indices[io++] = base + j;
        }
        const ctr = new V3((A.x + B.x) * 0.5, (A.y + B.y) * 0.5, (A.z + B.z) * 0.5);
        const normals = finalize(positions, indices, ctr, 0, true);
        weldNormals(positions, normals);
        return makeMesh(name, positions, indices, normals, uvs, null, scene);
    }

    // 箸置き。
    // 【対策】平らな直方体にすると、箸が天端に乗っているだけの「木片」に
    //         なる。実物は上面が長手方向に掬ってあり、箸はその窪みに
    //         納まって転がらない。真横から見ると鞍のような形になる
    const CUBE_FACES = [
        { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
        { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
        { n: [0, 0, 1], u: [-1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] }
    ];
    function buildRest(scene, w, h, d2, rr, dip, pos, yaw) {
        const seg = 12, per = (seg + 1) * (seg + 1), nV = per * 6;
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array(seg * seg * 6 * 6);
        const hx = w * 0.5, hy = h * 0.5, hz = d2 * 0.5;
        const cy = Math.cos(yaw), sy = Math.sin(yaw);
        let vo = 0, io = 0;
        for (let f = 0; f < 6; f++) {
            const F = CUBE_FACES[f], base = vo;
            for (let iy = 0; iy <= seg; iy++) {
                const tv = iy / seg * 2 - 1;
                for (let ix = 0; ix <= seg; ix++) {
                    const tu = ix / seg * 2 - 1;
                    const qx = (F.n[0] + F.u[0] * tu + F.v[0] * tv) * hx;
                    const qy = (F.n[1] + F.u[1] * tu + F.v[1] * tv) * hy;
                    const qz = (F.n[2] + F.u[2] * tu + F.v[2] * tv) * hz;
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
                    const p3 = vo * 3, p2 = vo * 2;
                    positions[p3] = x * cy + z * sy + pos.x;
                    positions[p3 + 1] = y + pos.y;
                    positions[p3 + 2] = -x * sy + z * cy + pos.z;
                    uvs[p2] = (tu * 0.5 + 0.5) * 0.6; uvs[p2 + 1] = (tv * 0.5 + 0.5) * 0.6;
                    vo++;
                }
            }
            for (let iy = 0; iy < seg; iy++) {
                for (let ix = 0; ix < seg; ix++) {
                    const p = base + iy * (seg + 1) + ix;
                    indices[io++] = p; indices[io++] = p + seg + 1; indices[io++] = p + 1;
                    indices[io++] = p + 1; indices[io++] = p + seg + 1; indices[io++] = p + seg + 2;
                }
            }
        }
        const normals = finalize(positions, indices, new V3(pos.x, pos.y, pos.z), 0, true);
        weldNormals(positions, normals);
        return makeMesh("chopstickRest", positions, indices, normals, uvs, null, scene);
    }

    // =================================================================
    // 11. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.032, 0.030, 0.028, 1);

    // ---- Havok（盛り付け用）------------------------------------------
    // 【対策】physicsEnabled を切らないと、Babylon がレンダーループでも
    //         ワールドを進めてしまう。こちらは波ごとに決まった回数だけ
    //         手で進めたいので、自動ステップは止めて全部 _step() で回す。
    //         そうしないと同じシードでも描画レート次第で盛りが変わる
    const hk = await HavokPhysics();
    scene.enablePhysics(new BABYLON.Vector3(0, PHYS.gravity, 0),
        new BABYLON.HavokPlugin(true, hk));
    scene.physicsEnabled = false;

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    // 【対策】レンダーの実測から、具の画素は「アルベド + 器の白の 0.34 倍の
    //         無彩色」になっていた。目標の青の総量が 0.08 倍なので、
    //         アルベドをどう変えても届かない。加算の正体は clearCoat が
    //         環境を面全体で映していること。膜の被覆と環境の強さを
    //         下げて、照りを「面全体の艶」から「小さく強い点」へ寄せる
    scene.environmentIntensity = 0.52;
    // ぼかしすぎるとハイライトのコントラストが消えて「艶消しの何か」になる。
    // 煮汁の照りは環境の明暗が映り込んで初めて出る
    env.lodGenerationOffset = 0.18;

    // 【対策】広角だと手前の箸が器より大きく写り、実寸どおりでも
    //         「長すぎる」絵になる。料理写真は 85〜100mm 相当の望遠。
    //         距離を伸ばして fov を絞れば、写る範囲は同じまま遠近が寝る
    const camera = new BABYLON.ArcRotateCamera("cam", -1.14, 0.97, 48, new V3(0, 3.55, -0.7), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 4;
    camera.fov = 0.352;
    // 【対策】ポストプロセスを通すとシーンは深度つきの RT へ描かれる。
    //         maxZ 既定(10000) のままだと深度の分解能が足りず、
    //         液面と具の前後が勝ったり負けたりしてちらつく
    camera.minZ = 8.0;
    camera.maxZ = 260;
    camera.lowerRadiusLimit = 20;
    camera.upperRadiusLimit = 170;
    camera.upperBetaLimit = 1.50;      // テーブルの下へ潜らせない
    scene.cameraToUseForPointers = camera;

    // ---- 灯 ----------------------------------------------------------
    const key = new BABYLON.DirectionalLight("key", new V3(-0.44, -0.92, 0.50).normalize(), scene);
    key.position = new V3(16, 32, -18);
    key.intensity = 2.62;
    key.diffuse = new BABYLON.Color3(1.0, 0.972, 0.932);
    // 【対策】平行光の影の範囲は既定だとキャスターの AABB にぴったり合う。
    //         すると影の落ちる先（テーブル）が範囲外になり直線でぶつ切りになる
    key.autoUpdateExtends = false;
    key.orthoLeft = -22; key.orthoRight = 22;
    key.orthoBottom = -22; key.orthoTop = 22;
    key.shadowMinZ = 1; key.shadowMaxZ = 90;

    // 【対策】平行光のハイライトは1点しか出ない。煮汁の膜に何本も走る
    //         照りを作るには、拡散をほぼ 0 にして鏡面だけ足す灯が要る。
    //         肉じゃがは面の向きがばらばらな山なので、味噌汁の1灯では
    //         山の半分にしかハイライトが乗らなかった。方位を変えて2灯置く
    const kick1 = new BABYLON.DirectionalLight("kick1", new V3(0.58, -0.34, -1.0).normalize(), scene);
    kick1.intensity = 1.72;
    kick1.diffuse = new BABYLON.Color3(0.052, 0.050, 0.046);
    kick1.specular = new BABYLON.Color3(1.0, 0.965, 0.905);

    const kick2 = new BABYLON.DirectionalLight("kick2", new V3(-0.86, -0.52, -0.40).normalize(), scene);
    kick2.intensity = 0.50;   // 3灯ぶんの鏡面が重なって面全体が白く浮いていた
    kick2.diffuse = new BABYLON.Color3(0.040, 0.038, 0.036);
    kick2.specular = new BABYLON.Color3(0.92, 0.94, 1.0);

    const fill = new BABYLON.HemisphericLight("fill", new V3(-0.2, 1, -0.35), scene);
    fill.intensity = 0.235;
    fill.diffuse = new BABYLON.Color3(0.97, 0.975, 1.0);
    fill.groundColor = new BABYLON.Color3(0.33, 0.30, 0.27);
    fill.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    // 【対策】ESM は柔らかいが depthScale を詰めないと痣が出る。
    //         cm スケールの食べ物では PCF に落としたほうが早くきれい
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0032;
    sg.normalBias = 0.011;
    sg.setDarkness(0.28);

    // ---- テーブル -----------------------------------------------------
    const tableWood = woodSet(scene, "table", 640, 7717, {
        base: [0.748, 0.664, 0.562], grain: [0.548, 0.458, 0.380],
        dark: [0.420, 0.326, 0.254],
        rings: 21.0, wave: 1.75, sharp: 2.3, knot: 0.30, rough: 0.44, bump: 0.7,
        across: true
    });
    const table = BABYLON.MeshBuilder.CreateGround("table", { width: 280, height: 280 }, scene);
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
    for (const t of [tableWood.albedo, tableWood.orm, tableWood.normal]) { t.uScale = 9; t.vScale = 9; }
    table.material = tableMat;
    table.receiveShadows = true;

    // ---- 箸と箸置き ---------------------------------------------------
    const sundryRng = new Rng(0x7A11CE);
    const chopWood = woodSet(scene, "chop", 256, 3331, {
        base: [0.348, 0.204, 0.116], grain: [0.208, 0.110, 0.056],
        dark: [0.142, 0.068, 0.035],
        rings: 30.0, wave: 1.5, sharp: 1.9, knot: 0.15, rough: 0.30, bump: 0.9
    });
    const chopMat = new BABYLON.PBRMaterial("chopMat", scene);
    chopMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    chopMat.albedoTexture = chopWood.albedo;
    chopMat.metallic = 0.0; chopMat.roughness = 1.0;
    chopMat.metallicTexture = chopWood.orm;
    chopMat.useRoughnessFromMetallicTextureGreen = true;
    chopMat.bumpTexture = chopWood.normal;
    chopMat.bumpTexture.level = 0.4;
    chopMat.clearCoat.isEnabled = true;
    chopMat.clearCoat.intensity = 0.72;
    chopMat.clearCoat.roughness = 0.20;

    const restWood = woodSet(scene, "rest", 256, 9091, {
        base: [0.408, 0.258, 0.152], grain: [0.272, 0.154, 0.084],
        dark: [0.182, 0.096, 0.048],
        rings: 12.0, wave: 1.6, sharp: 1.8, knot: 0.22, rough: 0.40, bump: 1.0
    });
    const restMat = new BABYLON.PBRMaterial("restMat", scene);
    restMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    restMat.albedoTexture = restWood.albedo;
    restMat.metallic = 0.0; restMat.roughness = 1.0;
    restMat.metallicTexture = restWood.orm;
    restMat.useRoughnessFromMetallicTextureGreen = true;
    restMat.bumpTexture = restWood.normal;
    restMat.bumpTexture.level = 0.6;
    restMat.clearCoat.isEnabled = true;
    restMat.clearCoat.intensity = 0.62;
    restMat.clearCoat.roughness = 0.22;

    // 【対策】箸置きは「箸先の側」を持ち上げる道具。先が箸置きより外へ
    //         はみ出して宙に浮き、手元だけが卓に着く。ここを逆にすると
    //         「先を卓に突き立てて手元を浮かせた」妙な置き方になる
    const CHOP_LEN = 22.0, CHOP_R = 0.275;
    const restW = 4.05, restD = 1.66, restH = 1.48, restDip = 0.50;
    const restPos = { x: -9.60, y: restH * 0.5, z: -9.30 };
    const contact = new V3(restPos.x, restH - restDip + 0.17, restPos.z);
    const awayXZ = new V3(0.9915, 0, 0.1029);
    const buttY = CHOP_R * 1.30;
    const OVERHANG = CHOP_LEN * 0.140;
    const dropY = contact.y - buttY;
    const runXZ = Math.sqrt(Math.max(0, Math.pow(CHOP_LEN - OVERHANG, 2) - dropY * dropY));
    const butt = new V3(contact.x + awayXZ.x * runXZ, buttY, contact.z + awayXZ.z * runXZ);
    const cdir = butt.subtract(contact); const dlen = cdir.length(); cdir.scaleInPlace(1 / dlen);
    const tip = contact.subtract(cdir.scale(CHOP_LEN - dlen));
    const perp = BABYLON.Vector3.Cross(cdir, new V3(0, 1, 0)).normalize();
    const chopsticks = [];
    for (let i = 0; i < 2; i++) {
        // 【対策】実物の箸は2本がほぼ接して1本の帯に見える。中心間を
        //         0.66cm も空けると「細い棒が2本離れて置いてある」絵になる
        const o = perp.scale((i === 0 ? -1 : 1) * 0.30);
        const c = buildChopstick(scene, "chopstick", sundryRng, butt.add(o), tip.add(o.scale(0.80)));
        c.material = chopMat;
        c.receiveShadows = true;
        chopsticks.push(c);
    }
    const rest = buildRest(scene, restW, restH, restD, 0.16, restDip, restPos,
        Math.atan2(-perp.z, perp.x));
    rest.material = restMat;
    rest.receiveShadows = true;
    const sundry = chopsticks.concat([rest]);
    for (const m of sundry) sg.addShadowCaster(m, true);

    // ---- 湯気 ---------------------------------------------------------
    const steamTex = (() => {
        const dt = new BABYLON.DynamicTexture("steamTex", { width: 128, height: 128 }, scene, true);
        const ctx = dt.getContext();
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0.0, "rgba(255,255,255,1)");
        g.addColorStop(0.45, "rgba(255,255,255,0.42)");
        g.addColorStop(1.0, "rgba(255,255,255,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
        dt.update(); dt.hasAlpha = true;
        return dt;
    })();
    const steam = new BABYLON.ParticleSystem("steam", 500, scene);
    steam.particleTexture = steamTex;
    steam.emitter = new V3(0, 5.6, 0);
    steam.minEmitBox = new V3(-3.0, -0.2, -3.0);
    steam.maxEmitBox = new V3(3.0, 0.2, 3.0);
    // 【対策】加算合成にすると湯気が発光して見える。湯気は光っていない
    steam.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    steam.color1 = new BABYLON.Color4(1, 1, 1, 0.048);
    steam.color2 = new BABYLON.Color4(0.95, 0.95, 0.96, 0.022);
    steam.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    steam.minSize = 1.0; steam.maxSize = 3.2;
    steam.minLifeTime = 2.0; steam.maxLifeTime = 3.8;
    steam.emitRate = 105;
    steam.gravity = new V3(0.25, 1.3, 0);
    steam.direction1 = new V3(-0.35, 1.5, -0.35);
    steam.direction2 = new V3(0.45, 2.6, 0.35);
    steam.minAngularSpeed = -0.45; steam.maxAngularSpeed = 0.45;
    steam.minEmitPower = 0.35; steam.maxEmitPower = 0.95;
    steam.updateSpeed = 0.012;

    // =================================================================
    //  組み立て / 差し替え
    // =================================================================
    const hachiMatCache = {};    // 器 → PBRMaterial（生成が重いのでキャッシュ）
    const pieceMats = {};        // 具の種類 → PBRMaterial

    let currentSauce = START_SAUCE, currentHachi = START_HACHI, currentFill = START_FILL;
    let currentSeed = START_SEED >>> 0;
    let state = null;
    let onRebuilt = null;
    // 【部材確認】煮汁を切れるようにする。液面には深さ 1.75cm ぶんの
    //             Beer–Lambert が掛かるので、山の低い盛り（肉だけなど）は
    //             具の大半が液面の下に入って真っ黒な円盤に見える。
    //             部材の形を見るときは邪魔なので外せるようにした
    let brothOn = !FILLS[START_FILL].inspect;
    let ssao = null;
    let glazeDirty = false, brothDirty = false;

    const live = {
        reduce: 1.0,     // 煮詰め（σ の倍率）★
        wetAmt: 1.0,     // 膜の量（厚みの倍率）
        gloss: 1.0,      // 照り（clearCoat の強さ）
        trans: 1.0,      // 具の透光
        ripple: 1.0      // さざ波
    };

    function specOf(kind, fill) {
        if (kind === "potato" || kind === "carrot") return CHUNK_SPEC[kind];
        if (kind === "onion") return ONION;
        if (kind === "bean") return BEAN;
        if (kind === "meat") return MEATS[fill.meatKind];
        return SHIRATAKI;
    }

    function getHachiMat(k) {
        if (!hachiMatCache[k]) {
            hachiMatCache[k] = hachiMaterial(scene, GLOBAL, HACHIS[k], "hachiMat_" + k, 4001 + k.length * 37);
        }
        return hachiMatCache[k];
    }

    function rebuildPieceMats(sauce, fill) {
        for (const k in pieceMats) { pieceMats[k].dispose(true, false); delete pieceMats[k]; }
        const kinds = ["potato", "carrot", "onion", "bean", "meat", "shirataki"];
        for (const k of kinds) {
            pieceMats[k] = pieceMaterial(scene, specOf(k, fill), "mat_" + k, sauce, live);
        }
    }

    function applyLive() {
        const sauce = SAUCES[currentSauce];
        for (const k in pieceMats) {
            const m = pieceMats[k], S = m.spec;
            m.clearCoat.intensity = clamp(S.coat * sauce.coat * live.gloss, 0, 1);
            m.clearCoat.roughness = clamp(mix(S.coatRough, sauce.rough, 0.55)
                / Math.max(0.2, live.gloss), 0.01, 0.7);
            m.subSurface.translucencyIntensity = clamp(S.trans * live.trans, 0, 0.95);
        }
        if (state && state.brothMat) {
            state.brothMat.clearCoat.roughness =
                clamp(sauce.rough / Math.max(0.2, live.gloss), 0.01, 0.6);
            if (state.brothMat.clearCoat.bumpTexture) {
                state.brothMat.clearCoat.bumpTexture.level = 0.50 * live.ripple;
            }
        }
    }

    function disposeBroth(st) {
        if (!st) return;
        if (st.broth) { st.broth.dispose(); st.broth = null; }
        if (st.brothMat) { st.brothMat.dispose(true, false); st.brothMat = null; }
        if (st.brothTex) { for (const k in st.brothTex) st.brothTex[k].dispose(); st.brothTex = null; }
    }
    function disposePieces(st) {
        if (!st || !st.meshes) return;
        for (const m of st.meshes) m.dispose();
        st.meshes = []; st.pieces = [];
    }

    // 具を作って落とし、膜を焼き、メッシュにする
    async function buildFood(seed, onWave) {
        const fill = FILLS[currentFill], sauce = SAUCES[currentSauce];
        // 【対策】煮汁を切っても液面の高さだけ残すと、bakeGlaze は
        //         「液面より下＝汁に浸かっている」と判断して膜を
        //         pool の 1.6 倍まで盛る。具が一様に濃く沈むので、
        //         煮汁が無いときは液面を見込みの底へ落とす
        const brothY = brothOn ? GLOBAL.yFloor + sauce.depth : GLOBAL.yFloor;
        const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
        const comp = await buildComposition(scene, GLOBAL, fill, seed, onWave);
        const t1 = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
        comp.field.buildDistance(brothY);
        const meshes = [];
        for (const p of comp.pieces) {
            bakeGlaze(p, comp.field, sauce, brothY, GLOBAL, live);
            const mesh = makeMesh(p.kind, p.positions, p.indices, p.normals, p.uvs, p.colors, scene, true);
            mesh.material = pieceMats[p.kind];
            p.mesh = mesh;
            // 完全に液面の下に沈んだものは、不透明な液面テクスチャへ
            // 焼き込み済みなので描画から外してよい
            mesh.refreshBoundingInfo();
            const bb = mesh.getBoundingInfo().boundingBox;
            // 【変更】完全に沈んだ具も 3D のまま見せる。液面が半透明に
            //         なったので、水を通して見える
            mesh.sunk = brothOn && bb.maximumWorld.y < brothY - 0.004;
            // 沈んだ具は影を落とさない（水中なので輪郭の影は出ない）
            if (!mesh.sunk) { sg.addShadowCaster(mesh, true); mesh.receiveShadows = true; }
            meshes.push(mesh);
        }
        return {
            pieces: comp.pieces, meshes: meshes, field: comp.field,
            brothY: brothY, ms: Math.round(t1 - t0)
        };
    }

    function buildBroth(st) {
        if (!brothOn) { st.brothR = innerRadiusAt(GLOBAL, st.brothY); return; }
        const sauce = SAUCES[currentSauce], hp = HACHIS[currentHachi];
        const brothR = innerRadiusAt(GLOBAL, st.brothY);
        st.brothR = brothR;
        st.F = brothFields(GLOBAL, st.field, sauce, st.brothY, brothR, hp.albedo,
            (currentSeed ^ 0x1B0A) >>> 0);
        st.brothTex = brothTextures(scene, GLOBAL, st.F, sauce, live);
        st.brothMat = brothMaterial(scene, st.brothTex, sauce, live, "brothMat");
        st.broth = buildBrothSurface(scene, GLOBAL, st.F, st.brothMat, st.brothY, brothR);
    }

    // 煮詰め（σ）や膜の量を変えたときは、幾何はそのままで色だけ焼き直す
    function redrawGlaze() {
        if (!state) return;
        const sauce = SAUCES[currentSauce];
        for (const p of state.pieces) {
            bakeGlaze(p, state.field, sauce, state.brothY, GLOBAL, live);
            if (p.mesh) p.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, p.colors, false, false);
        }
    }
    function redrawBroth() {
        if (!state || !state.brothTex) return;
        const dt = state.brothTex.albedo, N = state.F.N;
        const ctx = dt.getContext();
        const img = ctx.createImageData(N, N);
        brothAlbedoFill(img.data, N, state.F, SAUCES[currentSauce], live);
        ctx.putImageData(img, 0, 0);
        dt.update(false);
    }

    let busy = false;
    let progLabel = null;
    // 【対策】器は state と一緒に作っていたので、静定（約10秒）が終わって
    //         から現れていた。落ちてくる具を受け止める器が無いまま
    //         待つことになるので、盛り付けを始める前に出しておく。
    //         器そのものは盛りの内容に依らないので、作り直す必要も無い
    let hachiMesh = null;
    function ensureHachi() {
        if (!hachiMesh) {
            hachiMesh = buildHachi(scene, GLOBAL, HACHIS[currentHachi],
                getHachiMat(currentHachi), new Rng(0xB0117));
            sg.addShadowCaster(hachiMesh, true);
        }
        return hachiMesh;
    }
    // 静定の途中でブラウザへ制御を返す。返さないと数秒間タブが固まる
    const nextFrame = () => new Promise((res) => {
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => res());
        else setTimeout(res, 0);
    });
    const onWave = async (t) => {
        if (progLabel) {
            progLabel.text = "鍋から盛り付け中… " + Math.round(t * 100) + "%";
            progLabel.isVisible = true;
        }
        await nextFrame();
    };
    async function build(full) {
        // 【対策】静定に数秒かかるので、終わる前にプリセットを押されると
        //         物理世界が二重に走って具が二人前になる
        if (busy) return;
        busy = true;
        try {
        const fill = FILLS[currentFill], sauce = SAUCES[currentSauce];
        ensureHachi();          // 静定を待たずに器だけ先に出す
        if (full || !pieceMats.potato || pieceMats.meat.spec !== MEATS[fill.meatKind]) {
            rebuildPieceMats(sauce, fill);
        }
        disposeBroth(state);
        if (full) {
            disposePieces(state);
            const st = await buildFood(currentSeed, onWave);
            st.hachi = hachiMesh;
            state = st;
        } else {
            // 煮汁だけ差し替え: 液面の高さが変わるので膜も焼き直す
            state.brothY = brothOn ? GLOBAL.yFloor + sauce.depth : GLOBAL.yFloor;
            state.field.buildDistance(state.brothY);
            for (const p of state.pieces) {
                bakeGlaze(p, state.field, sauce, state.brothY, GLOBAL, live);
                if (p.mesh) p.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, p.colors, false, false);
                if (p.mesh) {
                    const bb = p.mesh.getBoundingInfo().boundingBox;
                    p.mesh.sunk = brothOn && bb.maximumWorld.y < state.brothY - 0.004;
                }
            }
        }
        buildBroth(state);
        state.hachi = ensureHachi();
        applyLive();
        if (onRebuilt) onRebuilt(state);
        } finally {
            busy = false;
            if (progLabel) progLabel.isVisible = false;
        }
    }

    // 器の形（輪花の有無）が変わるときはメッシュごと作り直す
    function setHachi(k) {
        const changed = (HACHIS[k].rinka !== HACHIS[currentHachi].rinka);
        currentHachi = k;
        if (changed && hachiMesh) { hachiMesh.dispose(); hachiMesh = null; }
        if (!hachiMesh) {
            state.hachi = ensureHachi();
        } else {
            state.hachi = hachiMesh;
            hachiMesh.material = getHachiMat(k);
        }
        // 器の色は液面の下地になるので、液面も焼き直す
        disposeBroth(state);
        buildBroth(state);
        applyLive();
        if (onRebuilt) onRebuilt(state);
    }

    build(true);   // async。初回の静定はこの中で進む

    // =================================================================
    //  ポストプロセス
    // =================================================================
    if (GLOBAL.useSSAO) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        // 【対策】半径を具の大きさ（2.5cm）まで詰めると、じゃがいもという
        //         じゃがいもの輪郭に黒い縁がついて全体が汚れる。しかも
        //         膜の pocket と二重になって隙間が真っ黒に潰れる。
        //         器と山の境目のような大きい陰りだけを拾わせる
        ssao.radius = 1.30;
        ssao.totalStrength = 0.44;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 200;
        ssao.minZAspect = 0.25;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.90;
    dp.bloomWeight = 0.13;
    dp.bloomKernel = 42;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.16;
    dp.depthOfFieldEnabled = GLOBAL.useDOF;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.High;
    dp.depthOfField.lensSize = 50;
    dp.depthOfField.fStop = GLOBAL.dofFStop;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    // 【対策】煮汁の膜は鏡面が強いので、露出を味噌汁と同じ 1.06 にすると
    //         ハイライトが ACES の肩から出て、山の上半分が白く溶ける。
    //         器の白（sRGB 0.85）が飛ばない範囲まで落とす
    ip.exposure = 1.02;
    ip.contrast = 1.20;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.30;
    ip.vignetteCameraFov = 0.72;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    let tclock = 0;
    scene.onBeforeRenderObservable.add(() => {
        if (dp.depthOfFieldEnabled) {
            // 【対策】Babylon の錯乱円は「シーン単位 × 1000 = mm」で計算される。
            //         focalLength を固定値にすると被写界深度が数十メートルになる。
            //         合焦距離の一定比にすると focus が約分され、寄っても
            //         引いてもボケ量が変わらない
            const focus = camera.radius * 1000;
            dp.depthOfField.focusDistance = focus;
            dp.depthOfField.focalLength = focus * GLOBAL.dofRatio;
        }
        if (state && state.brothMat && state.brothMat.clearCoat.bumpTexture) {
            tclock += scene.getEngine().getDeltaTime() * 0.001;
            const b = state.brothMat.clearCoat.bumpTexture;
            b.uOffset = Math.sin(tclock * 0.10) * 0.014 + tclock * 0.0026;
            b.vOffset = Math.cos(tclock * 0.078) * 0.012 - tclock * 0.0018;
        }
        // 【対策】スライダーの onValueChanged で直に焼き直すと、ドラッグ中に
        //         同じフレームで何度も呼ばれて固まる。フラグに畳んで
        //         フレームに1回だけ実行する
        if (glazeDirty) { glazeDirty = false; redrawGlaze(); }
        if (brothDirty) { brothDirty = false; redrawBroth(); }
    });

    // =================================================================
    // 12. GUI
    // =================================================================
    // 【対策】フルスクリーン GUI を既定のままにすると Bloom / 被写界深度 /
    //         シャープンが UI にも乗ってボケる。定石は layerMask で GUI
    //         専用カメラへ分離することだが、それをやると Inspector が
    //         3系統まとめて壊れる（Physics Helper / 選択ハイライト /
    //         ピッカー）。Layer.applyPostProcess = false なら2台目の
    //         カメラを作らずに GUI だけポストプロセスの外へ出せる
    const GUI_MASK = 0x20000000;
    let guiCam = null;

    function bindDebugCamera(sc, mainCam) {
        // UtilityLayerRenderer.getRenderCamera は activeCameras の末尾を
        // 直接参照する。Inspector が内部の WeakMap に抱えていて外から
        // 触れないレイヤー（Scene Explorer の選択枠など）まで一括で
        // 直すため、インスタンスではなくプロトタイプを差し替える
        const ULR = BABYLON.UtilityLayerRenderer;
        if (ULR && ULR.prototype && !ULR.prototype.__njPatched) {
            const orig = ULR.prototype.getRenderCamera;
            ULR.prototype.getRenderCamera = function (getDefault) {
                if (this._renderCamera) return this._renderCamera;
                const s = this.originalScene || this.utilityLayerScene;
                if (s && s.__debugMainCamera) return s.__debugMainCamera;
                return orig.call(this, getDefault);
            };
            ULR.prototype.__njPatched = true;
        }
        sc.__debugMainCamera = mainCam;
        // scene.pick() を camera 引数なしで呼ぶと createPickingRay の中で
        // scene.activeCamera が使われる。描画ループが activeCameras を
        // 順に代入していくので、終わった時点では guiCam が残っている
        sc.onAfterRenderObservable.add(() => { sc.activeCamera = mainCam; });
        sc.cameraToUseForPointers = mainCam;
    }

    if (GLOBAL.guiOwnCamera) {
        guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene);
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
        idle: "#2b2926", active: "#7d5a2e", edge: "#4a463e",
        text: "#f3ede1", sub: "#a8a193", accent: "#e8cfa2"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "268px";
    card.height = "88%";
    card.cornerRadius = 10;
    card.thickness = 1;
    card.color = COL.edge;
    card.background = "rgba(18,17,15,0.84)";
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

    // 静定の進捗。物理が走っている数秒だけ出る
    progLabel = addLabel("", 14, "#ffd9a0", "24px");
    progLabel.isVisible = false;
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
        s.height = "18px"; s.width = "216px"; s.paddingBottom = "8px";
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

    addLabel("NIKUJAGA / 肉じゃが", 11, COL.sub, "30px");

    const sauceBtns = {}, hachiBtns = {}, fillBtns = {};
    function highlight() {
        for (const k in sauceBtns) sauceBtns[k].background = (k === currentSauce) ? COL.active : COL.idle;
        for (const k in hachiBtns) hachiBtns[k].background = (k === currentHachi) ? COL.active : COL.idle;
        for (const k in fillBtns) fillBtns[k].background = (k === currentFill) ? COL.active : COL.idle;
    }

    addLabel("煮汁", 13, COL.accent, "22px");
    for (const k of Object.keys(SAUCES)) {
        sauceBtns[k] = addButton("s_" + k, SAUCES[k].label, () => {
            currentSauce = k; build(false); highlight(); updateSigmaInfo();
        });
    }
    addLabel("器", 13, COL.accent, "22px");
    for (const k of Object.keys(HACHIS)) {
        hachiBtns[k] = addButton("h_" + k, HACHIS[k].label, () => { setHachi(k); highlight(); });
    }
    addLabel("具", 13, COL.accent, "22px");
    for (const k of Object.keys(FILLS)) {
        fillBtns[k] = addButton("f_" + k, FILLS[k].label, () => {
            currentFill = k; build(true); highlight();
        });
    }

    addSpacer();
    addButton("reseed", "盛り直す", () => {
        currentSeed = (currentSeed * 1664525 + 1013904223) >>> 0;
        build(true);
    });

    const steamBtn = addButton("steam", "湯気: ON", () => setSteam(!steam.isStarted()));
    function setSteam(on) {
        if (on) steam.start(); else steam.stop();
        steamBtn.textBlock.text = "湯気: " + (on ? "ON" : "OFF");
        steamBtn.background = on ? COL.active : COL.idle;
    }
    setSteam(true);

    const kickBtn = addButton("kick", "照り足しの灯: ON", () => {
        const on = !kick1.isEnabled();
        kick1.setEnabled(on); kick2.setEnabled(on);
        kickBtn.textBlock.text = "照り足しの灯: " + (on ? "ON" : "OFF");
        kickBtn.background = on ? COL.active : COL.idle;
    });
    kickBtn.background = COL.active;

    let chopOn = true;
    const brothBtn = addButton("brothTgl", "煮汁: " + (brothOn ? "ON" : "OFF"), () => {
        brothOn = !brothOn;
        brothBtn.textBlock.text = "煮汁: " + (brothOn ? "ON" : "OFF");
        build(true);
    });
    const chopBtn = addButton("chop", "箸: ON", () => {
        chopOn = !chopOn;
        for (const m of sundry) m.setEnabled(chopOn);
        chopBtn.textBlock.text = "箸: " + (chopOn ? "ON" : "OFF");
        chopBtn.background = chopOn ? COL.active : COL.idle;
    });
    chopBtn.background = COL.active;

    const rotBtn = addButton("rot", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.08;
        rotBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });

    addSpacer();
    // ★ここが本題のスライダー。0.3 まで下げると煮汁がほぼ水になって
    //   具が素の色で並び、2.5 まで上げると照りっ照りの飴色になる
    const sRed = addSlider("煮詰め（消散係数 ×）", 0.15, 2.60, live.reduce, f2, (v) => {
        live.reduce = v; glazeDirty = true; brothDirty = true; updateSigmaInfo();
    });
    const sigmaInfo = addLabel("", 11, COL.sub, "48px");
    function updateSigmaInfo() {
        const s = SAUCES[currentSauce].sigma, r = live.reduce;
        const t = SAUCES[currentSauce].film * live.wetAmt;
        const tr = [0, 1, 2].map((i) => Math.exp(-s[i] * r * 2 * t));
        sigmaInfo.text = "  σ=[" + s.map((x) => (x * r).toFixed(2)).join(", ") + "] /cm\n"
            + "  膜 " + (t * 10).toFixed(2) + "mm の透過率 ["
            + tr.map((x) => x.toFixed(2)).join(", ") + "]";
    }

    const sWet = addSlider("膜の量 ×", 0.0, 2.50, live.wetAmt, f2, (v) => {
        live.wetAmt = v; glazeDirty = true; updateSigmaInfo();
    });
    const sGloss = addSlider("照り ×", 0.20, 2.00, live.gloss, f2, (v) => { live.gloss = v; applyLive(); });
    const sTrans = addSlider("具の透光 ×", 0, 2.00, live.trans, f2, (v) => { live.trans = v; applyLive(); });
    const sRip = addSlider("さざ波 ×", 0, 3.00, live.ripple, f2, (v) => { live.ripple = v; applyLive(); });

    addSpacer();
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        GLOBAL.useDOF = !GLOBAL.useDOF;
        dp.depthOfFieldEnabled = GLOBAL.useDOF;
        dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
        dofBtn.textBlock.text = "被写界深度: " + (GLOBAL.useDOF ? "ON" : "OFF");
    });
    dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
    addSlider("ぼけ量", 0.01, 0.20, GLOBAL.dofRatio, f2, (v) => { GLOBAL.dofRatio = v; });
    addSlider("F値", 1.2, 11.0, GLOBAL.dofFStop, (v) => v.toFixed(1), (v) => { dp.depthOfField.fStop = v; });

    const info = addLabel("", 12, COL.sub, "86px");
    highlight();
    updateSigmaInfo();

    // 【対策】盛り付けが非同期になったので、GUI を組む時点ではまだ
    //         state が無い。静定が終わったときに改めて呼ばれる
    onRebuilt = (st) => {
        if (!st) return;
        sRed.slider.value = live.reduce;
        sWet.slider.value = live.wetAmt;
        sGloss.slider.value = live.gloss;
        sTrans.slider.value = live.trans;
        sRip.slider.value = live.ripple;
        const cnt = {};
        let tri = (st.hachi ? st.hachi.tris : 0) + (st.broth ? st.broth.tris : 0);
        let sunk = 0;
        for (const m of st.meshes) { tri += m.tris; if (m.sunk) sunk++; cnt[m.name] = (cnt[m.name] || 0) + 1; }
        for (const m of sundry) tri += m.tris;
        const LAB = {
            potato: "芋", carrot: "人参", onion: "玉ねぎ",
            meat: "肉", bean: "いんげん", shirataki: "しらたき"
        };
        const parts = Object.keys(LAB).filter((k) => cnt[k]).map((k) => LAB[k] + cnt[k]);
        info.text = parts.join(" / ") + "\n"
            + "（完全に沈んで液面へ焼いたもの " + sunk + "）\n"
            + tri.toLocaleString() + " tri / 液面 " + (st.F ? st.F.N + "²" : "OFF") + " / 高さ場 " + GLOBAL.pileGrid + "²\n"
            + "煮汁 y=" + st.brothY.toFixed(2) + "cm  径 " + (st.brothR * 2).toFixed(1) + "cm"
            + "  盛り " + st.ms + "ms\n"
            + "seed: " + currentSeed;
    };
    onRebuilt(state);   // まだ静定中なら state は null。終わったら再度呼ばれる

    // 【対策】盛り付けが非同期になったので、createScene を抜ける時点では
    //         まだ静定中。ログは組み上がったときに出す
    let logged = false;
    const prevRebuilt = onRebuilt;
    onRebuilt = (st) => {
        prevRebuilt(st);
        if (!st || logged) return;
        logged = true;
        console.log("[Nikujaga] build nikujaga-2026-09-01-q",
            "| broth y=" + st.brothY.toFixed(3), "r=" + st.brothR.toFixed(3),
            "| sigma×" + live.reduce, "| pieces=" + st.pieces.length,
            "| plating=" + st.ms.toFixed(0) + "ms", "| seed=" + currentSeed);
    };

    scene.onDisposeObservable.add(() => {
        for (const k in hachiMatCache) {
            const m = hachiMatCache[k];
            if (m.texs) for (const t of m.texs) t.dispose();
            m.dispose(true, false);
        }
        if (state && state.brothTex) for (const t of Object.keys(state.brothTex)) state.brothTex[t].dispose();
        for (const s2 of [tableWood, chopWood, restWood]) for (const t2 in s2) s2[t2].dispose();
        steamTex.dispose();
    });

    return scene;
};

export default createScene;