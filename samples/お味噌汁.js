// =====================================================================
//  Photoreal Miso Soup  /  写実的な「豆腐とわかめのお味噌汁」
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//  build: miso-soup-2026-08-31-e
//
//  構成:
//    0. CONFIG      … 味噌 / 器 / 具 のプリセットと寸法
//    1. Rng         … シード付き擬似乱数
//    2. Noise       … 2D/3D 値ノイズ（周期版つき）
//    3. Mesh utils  … 巻き順判定 / 法線溶接 / 一意な name+id
//    4. TexLab      … DynamicTexture 生成の土台と木のテクスチャ一式
//    5. Bowl        … 汁椀の回転体（高台つき）と3種の仕上げ
//    6. Tofu        … 賽の目豆腐（面取り + 切断面 + SSS）
//    7. Wakame      … わかめの薄膜（不規則輪郭 + 縁のフリル）
//    8. Submerge    … 上から見た「最上点バッファ」を焼く軟ラスタライザ ★
//    9. Broth       … 汁面（濁りの焼き込み / さざ波 / 油滴 / メニスカス）★
//   10. Sundry      … 箸と箸置き
//   11. Scene       … テーブル / IBL / 湯気 / ACES / DOF
//   12. GUI
//
//  ここでの最重要事項:
//  「味噌汁は濁った液体」であることをどう出すか。
//   透明な液体として屈折を解くのは、この絵では完全に無駄になる。
//   参考写真を測ると、汁の中のわかめは深さ1cmで既に地色へ8割溶けており、
//   深さ4cmの器の底はまったく見えない。つまり消散長は 1cm 弱しかない。
//
//   そこで液体そのものは作らず、
//     (a) 汁面を「不透明な1枚の面」として置き、器の内側を完全に隠す
//     (b) 沈んだ具の輪郭を、上から見た最上点バッファとして焼き
//         深さ d に対し 1 - exp(-σd) で汁色へ寄せた結果を
//         汁面のアルベドへ描き込む
//   という2段に分ける。これで透過も屈折もソートも要らないまま、
//   「水面直下のわかめがぼんやり黒く透ける」が正確に出る。
//   GUIの「汁の濁り σ」を 0 にすると澄まし汁、4 にすると濃い味噌になる。
// =====================================================================

var createScene = function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    // 単位系: 1 unit = 1 cm。豆腐やわかめの厚みは mm で書きたいので定数を持つ
    const MM = 0.1;

    // ---- 味噌（汁）のプリセット --------------------------------------
    // 色はすべて sRGB。参考写真の実測:
    //   汁の明部 [0.87, 0.82, 0.70] / 中央値 [0.765, 0.745, 0.573]
    //   青が赤より 0.2 低い。味噌汁は「白」ではなく確実に黄土寄り
    const MISOS = {
        awase: {
            label: "合わせ",
            base: [0.845, 0.790, 0.628],   // 汁の地色（アルベド）
            deep: [0.700, 0.618, 0.432],   // ムラの濃い側
            pale: [0.905, 0.872, 0.762],   // ムラの淡い側
            sigma: 1.75,                   // 消散係数 [1/cm]。濁りの強さ
            mottle: 0.42,                  // 対流ムラの強さ
            oil: 0.55,                     // 表面の油滴の量
            rough: 0.155                   // 汁面の粗さ（水は滑らか）
        },
        shiro: {
            label: "白味噌",
            base: [0.902, 0.858, 0.712],
            deep: [0.792, 0.720, 0.545],
            pale: [0.945, 0.925, 0.845],
            sigma: 2.45,                   // 白味噌はよりねっとりして濁る
            mottle: 0.42,
            oil: 0.38,
            rough: 0.185
        },
        aka: {
            label: "赤味噌",
            base: [0.660, 0.548, 0.372],
            deep: [0.492, 0.372, 0.222],
            pale: [0.762, 0.668, 0.492],
            sigma: 2.10,
            mottle: 0.62,
            oil: 0.62,
            rough: 0.140
        },
        sumashi: {
            label: "澄まし（比較用）",
            base: [0.585, 0.470, 0.288],
            deep: [0.492, 0.372, 0.205],
            pale: [0.660, 0.552, 0.372],
            sigma: 0.16,                   // ほぼ透明。沈んだ具がそのまま見える
            mottle: 0.20,
            oil: 0.72,
            rough: 0.095
        }
    };

    // ---- 器 ----------------------------------------------------------
    // 参考写真の椀は木地にウレタン。外壁の実測 p10 [0.49,0.28,0.08] /
    // p50 [0.69,0.58,0.45]。これは照明込みなので、アルベドは一段落とす
    const BOWLS = {
        kiji: {
            label: "木地椀",
            base: [0.520, 0.345, 0.183],   // 春目（淡い側）
            grain: [0.298, 0.158, 0.068],  // 夏目（濃い縞）
            dark: [0.196, 0.098, 0.040],   // 節・玉杢の芯
            ringMM: 5.5,                   // 年輪の間隔 [mm]。ケヤキで 4〜7mm
            wave: 1.9,                     // 年輪のうねり
            flame: 0.55,                   // 玉杢（対向する2面だけ濃くなる）
            lathe: 0.35,                   // ろくろ目（水平の細い筋）
            grainShow: 1.0,
            rough: 0.34,
            coat: 0.92, coatRough: 0.105,  // ウレタン塗り。鏡に近い
            inTint: [0.86, 0.80, 0.74],    // 見込みは手擦れでやや白茶ける
            tint: null, filmIn: 1.0, filmRim: 1.0
        },
        kuroshitsu: {
            label: "黒漆（呂色）",
            // 【対策】黒漆だからと sRGB 0.05 を入れるとリニアで 0.002 になり
            //         形が読めない。実物の黒漆の反射率は 4〜5% = sRGB 0.23 前後
            base: [0.128, 0.124, 0.132],   // わずかに青い黒。茶に寄せると溜と紛れる
            grain: [0.106, 0.103, 0.110],
            dark: [0.082, 0.080, 0.086],
            ringMM: 6.5, wave: 1.2, flame: 0.04, lathe: 0.30,
            grainShow: 0.12,               // 黒漆は下地を完全に隠す
            rough: 0.18,
            coat: 0.99, coatRough: 0.042,  // 呂色は磨き上げた鏡面
            inTint: [1.00, 1.00, 1.00],
            tint: null, filmIn: 1.0, filmRim: 1.0
        },
        tame: {
            label: "溜塗",
            // 【対策】溜塗を「暗い赤茶の塗料」として作ると、リニアでは 0.03 しか
            //         なく clearCoat の鏡面に完全に埋もれて、黒漆と見分けが
            //         つかなくなる。溜は透漆（透明な飴色）を朱の下地に重ねた
            //         もので、色を決めているのは塗膜の厚み。
            //         アルベドは下地の朱そのものを置き、暗さは
            //         clearCoat の tint（Beer–Lambert 吸収）に持たせる。
            //         こうすると厚い所は黒く沈み、薄い所——口縁・稜・見込み・
            //         使い込んだ擦れ——で朱が抜ける、あの見え方になる
            // 【対策】下地を純度の高い朱（青がリニアで 0.006）にすると、
            //         どんな吸収を掛けても緑と青が 0 に落ちて、
            //         茶色ではなく「赤と黒だけの単色」になる。
            //         実物の溜の暗部は褐色なので、下地に少し body を持たせる
            base: [0.560, 0.245, 0.145],   // 下地の朱
            grain: [0.455, 0.170, 0.092],  // 透漆越しに木地が透ける
            dark: [0.330, 0.105, 0.052],
            ringMM: 5.8, wave: 1.7, flame: 0.45, lathe: 0.42,
            grainShow: 1.0,
            rough: 0.26,
            // 溜は呂色ほど磨き上げない。鏡面がわずかに深い
            coat: 0.97, coatRough: 0.085,
            inTint: [1.00, 0.98, 0.95],
            // 透漆の吸収。atDistance で color になる濃さ。
            // 厚み 1.0（外壁）で sRGB [0.15, 0.018, 0.004] の褐黒、
            // 0.40（見込み）で [0.35, 0.061, 0.015]、
            // 0.16（口縁の擦れ）で [0.46, 0.087, 0.025] の朱が抜ける
            tint: { color: [0.395, 0.300, 0.222], atDistance: 1.0, thick: 1.35 },
            filmIn: 0.40,                  // 見込みは薄く塗る（溜椀は内側が明るい）
            filmRim: 0.16                  // 口縁は当たって擦れ、朱が抜ける
        }
    };

    // ---- 具 -----------------------------------------------------------
    const TOFUS = {
        kinu: {
            label: "絹ごし",
            albedo: [0.928, 0.900, 0.842],  // 実測 [0.92,0.88,0.81] から照明分を戻す
            edge: 0.055,                    // 面取りの半径 [cm]
            grit: 0.22,                     // 切断面のざらつき
            crumb: 0.14,                    // 角の欠け
            rough: 0.42,
            coat: 0.46, coatRough: 0.22,    // 表面の水膜
            trans: 0.62                     // 透光。絹ごしはよく光を通す
        },
        momen: {
            label: "木綿",
            albedo: [0.918, 0.888, 0.818],
            edge: 0.075,
            grit: 0.62,                     // 布目と気泡でざらつく
            crumb: 0.34,
            rough: 0.56,
            coat: 0.30, coatRough: 0.30,
            trans: 0.34
        }
    };

    const GLOBAL = {
        // ---- 椀の寸法（三寸九分汁椀＝木目椀: 口径 11.7cm / 高さ 6.0cm）----
        rimY: 6.00,        // 口縁の高さ
        rIn: 5.59,         // 口縁の内半径
        rOut: 5.875,       // 口縁の外半径（= rIn + wallThin）
        yFloor: 1.45,      // 見込み（内側）の底
        rFootOut: 2.64,    // 高台の外半径
        rFootIn: 2.00,     // 高台の内半径
        yFootTop: 1.465,   // 外壁が高台へ落ちる高さ
        yUnder: 1.05,      // 底裏の中心（底の厚み 0.40cm）
        // 肉厚。口縁から腰までは一定に薄く、腰から下だけ厚くなる
        wallThin: 0.285,
        wallThick: 0.42,
        wallKnee: 2.60,    // ここから下で厚みが増しはじめる高さ
        wallSpan: 1.15,
        sides: 192,        // 回転体の周方向分割
        wobble: 1.0,       // 手仕事の歪み（0で完全な真円）
        bowlTex: 768,

        // ---- 汁 -----------------------------------------------------
        waterDrop: 1.15,   // 口縁から何cm下が水面か
        brothTex: 512,     // 汁面のテクスチャ。沈んだ具の輪郭を焼くので粗くできない
        brothRings: 84,    // 汁面のメッシュ分割（半径方向）
        brothSectors: 168, //                     （周方向）
        ripple: 0.013,     // さざ波の振幅 [cm]。ほぼ法線マップ側の仕事
        meniscus: 0.055,   // 器の内壁を這い上がる高さ [cm]

        // ---- 具の配置 ------------------------------------------------
        tofuCount: 4,
        tofuSize: 1.50,    // 賽の目の一辺 [cm]
        tofuSizeVar: 0.14,
        tofuEmerge: [0.20, 0.42],   // 水面から何cm出るか
        tofuSeg: 9,        // 1辺あたりの分割（面取りと切断面のざらつきに要る）
        wakameCount: 5,
        wakameR: 1.45,     // 房の代表半径 [cm]
        wakameRings: 16,
        wakameSectors: 64,
        wakameThickMM: 0.7,

        // ---- 濁りの焼き込み ------------------------------------------
        veilGrid: 512,     // 最上点バッファ。汁面テクスチャと1:1（0.20mm/セル）
        veilLit: 0.86,     // 水中の具は拡散した光しか受けないぶん暗い

        useSSAO: true,
        useDOF: true,
        // 【対策】Babylon の錯乱円は焦点距離を合焦距離の一定比で置くと
        //         coc ∝ 1/合焦距離 になる。望遠に振って距離を 27→52cm に
        //         伸ばした分、同じボケ量を保つには比を上げる必要がある
        dofRatio: 0.071,
        dofFStop: 2.8,

        // 【対策】GUI を専用カメラへ分離すると Inspector の Physics Helper /
        //         選択ハイライト / Scene Explorer のピッカーが3系統まとめて
        //         壊れる。Layer.applyPostProcess = false なら2台目を作らずに
        //         GUI だけポストプロセスの外へ出せるので、既定はこちら。
        guiOwnCamera: false
    };

    // ---- 汁椀の見込み（内側）の制御点 --------------------------------
    // 【対策】飯椀と汁椀は寸法がほとんど同じで、違いは形にしか出ない。
    //         汁椀は (a) 口が薄く外へ反る（端反り）
    //                (b) 胴が U 字に深い
    //                (c) 腰から下がほぼ円筒の高い高台になる（熱い汁を持つため）
    //         これを y = a * r^k のような冪関数で近似すると、どうしても
    //         円錐へ寄って「木のサラダボウル」に見える。参考実測（三寸九分
    //         汁椀 = 口径 11.7cm × 高さ 6.0cm）から制御点で直接与え、
    //         外側は等厚オフセットで作る
    const WAN_R = [0.00, 0.72, 1.44, 2.14, 2.80, 3.40, 3.94, 4.40, 4.80, 5.10, 5.32, 5.45, 5.59];
    const WAN_Y = [1.45, 1.47, 1.56, 1.76, 2.08, 2.52, 3.06, 3.68, 4.36, 5.04, 5.58, 5.86, 6.00];

    const START_MISO = "awase";
    const START_BOWL = "kiji";
    const START_TOFU = "kinu";
    const START_SEED = 20260831;

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
        // 【対策】x 方向だけ折り返すノイズで器のテクスチャを焼くと、
        //         上下の継ぎ目に横一文字の線は出ないが、周方向はつながる。
        //         回転体の u（周方向）専用
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
    function named(mesh, base) {
        mesh.name = base;
        mesh.id = base + "#" + (++_uid);
        return mesh;
    }

    // 巻き順の自動判定。center から refIndex 番の頂点への向きと法線の内積で見る。
    // summed = true なら全頂点の総和で判定する（格子面など形が読みにくいもの用）
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
    //         「腰が一度外へ膨らんでから戻る」不自然な段が出る。単調性が
    //         保証される補間なら、制御点を素直に並べるだけで済む
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

    // 器の内壁からはみ出した頂点を押し戻す。まず軸へ平行移動し、
    // それでも収まらないときだけ重心まわりに縮める。
    // 【対策】いきなり軸まわりに縮めると、豆腐が中心へ向かって潰れて
    //         平行四辺形になる。平行移動で済むならそのほうが形が保たれる
    function fitInside(positions, nV, limitR) {
        for (let pass = 0; pass < 6; pass++) {
            let maxR = 0;
            for (let i = 0; i < nV; i++) {
                const r = Math.hypot(positions[i * 3], positions[i * 3 + 2]);
                if (r > maxR) maxR = r;
            }
            if (maxR <= limitR) return;
            let cx = 0, cz = 0;
            for (let i = 0; i < nV; i++) { cx += positions[i * 3]; cz += positions[i * 3 + 2]; }
            cx /= nV; cz /= nV;
            const cl = Math.hypot(cx, cz), over = maxR - limitR;
            if (cl > 1e-4) {
                const step = Math.min(over, cl);
                const dx = -cx / cl * step, dz = -cz / cl * step;
                for (let i = 0; i < nV; i++) { positions[i * 3] += dx; positions[i * 3 + 2] += dz; }
            }
            let mr = 0;
            for (let i = 0; i < nV; i++) {
                const r = Math.hypot(positions[i * 3], positions[i * 3 + 2]);
                if (r > mr) mr = r;
            }
            if (mr <= limitR) return;
            let nx = 0, nz = 0;
            for (let i = 0; i < nV; i++) { nx += positions[i * 3]; nz += positions[i * 3 + 2]; }
            nx /= nV; nz /= nV;
            const k = Math.max(0.55, limitR / mr);
            for (let i = 0; i < nV; i++) {
                positions[i * 3] = nx + (positions[i * 3] - nx) * k;
                positions[i * 3 + 2] = nz + (positions[i * 3 + 2] - nz) * k;
            }
        }
    }

    // 平均高さが target になるよう鉛直に平行移動する。
    // 【対策】薄い葉を「最上点＝水面」で置くと、うねりの分だけ葉身全体が
    //         水面下へ沈み、消散長 0.6cm の汁では緑の靄にしかならない。
    //         平均を水面に合わせれば、山は水から出て濃く光り、
    //         谷はうっすら透ける——写真のわかめはこの見え方をしている
    function liftMeanTo(positions, nV, target) {
        let sum = 0;
        for (let i = 0; i < nV; i++) sum += positions[i * 3 + 1];
        const dy = target - sum / nV;
        for (let i = 0; i < nV; i++) positions[i * 3 + 1] += dy;
        return dy;
    }

    // 最上点が target になるよう鉛直に平行移動する
    function liftTo(positions, nV, target) {
        let maxY = -1e9;
        for (let i = 0; i < nV; i++) if (positions[i * 3 + 1] > maxY) maxY = positions[i * 3 + 1];
        const dy = target - maxY;
        for (let i = 0; i < nV; i++) positions[i * 3 + 1] += dy;
        return dy;
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
        //         深度書き込みが切られるので、汁面が豆腐を隠せなくなる
        mesh.hasVertexAlpha = false;
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
        // 【対策】1024² を素直に走らせると 3D ノイズの評価だけで1秒を超える。
        //         うねり・節・ろくろ目は周期が cm 単位なので、1/4 の格子で
        //         作って双一次で引き伸ばしても見た目は変わらない。
        //         wrapX = true のとき最終列は 0 列目へ折り返すので、
        //         回転体の周方向の継ぎ目は原理的に発生しない
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
        //         見えない。実物の年輪は1本ずつ幅も濃さも違う。整数の輪番号を
        //         ハッシュして、輪ごとに幅・濃さ・輪内の位置を配る
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
    // 5. Bowl : 汁椀（回転体・高台つき）
    // =================================================================
    // 見込みと外側の曲線を1度だけ作る。
    // 外側は見込みの等厚オフセット。口縁の近くだけ法線を水平へ寝かせ、
    // 口縁の丸み（半円）で内外がぴたりとつながるようにする
    let _wan = null;
    function wanCurves(G) {
        if (_wan) return _wan;
        const f = monoSpline(WAN_R, WAN_Y);
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
            const w = smooth(5.35, 6.00, inY[i]);
            const nr = (dy / L) * (1 - w) + w, ny = (-1 / L) * (1 - w);
            outR[i] = inR[i] + t * nr; outY[i] = inY[i] + t * ny;
        }
        // 外壁が高台の半径まで下りてくる添字
        let iStop = 0;
        while (iStop < NI && outR[iStop] < G.rFootOut) iStop++;
        _wan = { inR: inR, inY: inY, outR: outR, outY: outY, NI: NI, iStop: iStop };
        return _wan;
    }

    // 断面。中心（見込みの底）から外へ一筆で回り、底裏で中心へ戻る閉じた形
    function bowlProfile(G) {
        const W = wanCurves(G), NI = W.NI;
        const P = [];
        const push = (r, y, k) => P.push({ r: r, y: y, k: k });
        // (1) 見込み: 中心 → 口縁の内側。innerRadiusAt と同じ表を刻むので、
        //     水面の半径とここの断面は厳密に一致する
        for (let i = 0; i <= NI; i += 4) push(W.inR[i], W.inY[i], 0);
        // (2) 口縁の丸み（半円）。薄く反った口当たり
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
        const yK = W.outY[W.iStop];           // 高台の付け根の高さ（≒1.47）
        // (4) 高台。挽いて削り出した段を経て接地面へ
        push(G.rFootOut, yK - 0.06, 2);
        push(G.rFootOut - 0.008, yK * 0.62, 2);
        push(G.rFootOut - 0.026, 0.42, 2);
        push(G.rFootOut - 0.058, 0.075, 3);
        push(G.rFootOut - 0.140, 0.0, 3);
        push(G.rFootIn + 0.060, 0.0, 3);
        push(G.rFootIn, 0.075, 3);
        push(G.rFootIn, 0.48, 3);
        push(G.rFootIn, G.yUnder - 0.13, 3);
        // (5) 底裏。中心へ向けてわずかに持ち上がる（浅い凹み）
        for (let i = 1; i <= 20; i++) {
            const u = 1 - i / 20;
            push(G.rFootIn * u, G.yUnder - 0.13 * Math.pow(u, 1.7), 3);
        }
        return { P: P, rimIndex: rimIndex, probeIndex: probeIndex };
    }

    // 断面の弧長を正規化した表。テクスチャを焼くのに v → (r,y) が要る。
    // 【対策】制御点の添字で v を刻むと、点が密な所（口縁）だけテクスチャが
    //         詰まって縞に見える。弧長で正規化する
    function profileTable(G) {
        const { P, rimIndex } = bowlProfile(G);
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

    // 見込みの内半径（高さ y での）。水面の半径とメニスカスを出すのに使う。
    // 断面と同じ表を逆に引くので、汁面と器の内壁は厳密に一致する
    function innerRadiusAt(G, y) {
        const W = wanCurves(G), NI = W.NI;
        if (y <= W.inY[0]) return 0;
        if (y >= W.inY[NI]) return G.rIn;
        let lo = 0, hi = NI;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (W.inY[m] <= y) lo = m; else hi = m; }
        const d = W.inY[hi] - W.inY[lo];
        return W.inR[lo] + (W.inR[hi] - W.inR[lo]) * (d > 1e-12 ? (y - W.inY[lo]) / d : 0);
    }

    function buildBowl(scene, G, mat, rng) {
        const { P, rimIndex, probeIndex } = bowlProfile(G);
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

        const cosT = new Float32Array(M + 1), sinT = new Float32Array(M + 1);
        for (let j = 0; j <= M; j++) {
            const th = (j % M) / M * TAU;
            cosT[j] = Math.cos(th); sinT[j] = Math.sin(th);
        }

        let vo = 0;
        for (let i = 0; i < N; i++) {
            const p = P[i];
            const mask = smooth(3.0, 5.9, p.y);      // 口縁だけ上下に振る
            for (let j = 0; j <= M; j++) {
                const th = (j % M) / M * TAU;
                const wob = 1 + G.wobble * (0.0042 * Math.sin(3 * th + ph[0])
                    + 0.0026 * Math.sin(5 * th + ph[1]));
                const dy = G.wobble * mask * (0.026 * Math.sin(2 * th + ph[2])
                    + 0.014 * Math.sin(3 * th + ph[3]));
                const r = p.r * wob;
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = r * cosT[j];
                positions[p3 + 1] = p.y + dy;
                positions[p3 + 2] = r * sinT[j];
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

        const mesh = makeMesh("bowl", positions, indices, normals, uvs, null, scene);
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.tris = (N - 1) * M * 2;
        mesh.vRim = arc[rimIndex] / total;
        return mesh;
    }

    // ---- 木地のテクスチャ ---------------------------------------------
    // 【対策】年輪を UV 上の縞として描くと、回転体では「筒に巻いた包装紙」に
    //         なる。実物の椀は、立木の年輪（＝鉛直な同心円柱）を回転体の面で
    //         切った断面が出ている。写真の椀の縦じま／杢はこれ。
    //         そこで各テクセルの3D位置を断面テーブルから復元し、
    //         椀の軸からずれた鉛直軸まわりの円柱として年輪を評価する。
    //         u の継ぎ目は3D位置が一致するので原理的に発生しない。
    function bowlTextures(scene, G, bp, seed) {
        const N = Math.max(64, Math.round(G.bowlTex) || 512);
        const n2 = N * N;
        const tab = profileTable(G);
        const rng = new Rng(seed >>> 0);

        // 【対策】髄を椀のすぐ外（6〜9cm）に置くと、年輪の等値線が椀の面で
        //         きつい同心の弧になり、等高線図にしか見えない。
        //         実物の椀は大径木の外側から挽くので髄はずっと遠い。
        //         遠ざけると等値線がほぼ平行になり、写真どおりの縦じまになる
        const pa = rng.range(0, TAU), pd = rng.range(13.0, 21.0);
        const px = Math.cos(pa) * pd, pz = Math.sin(pa) * pd;
        const spacing = bp.ringMM * 0.1;            // 年輪の間隔 [cm]



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

        // 低周波の3つ（年輪のうねり・節・ろくろ目の強弱）は粗い格子で作る
        const STEP = 4;
        const warpF = TexLab.coarse(N, STEP, true, (x, y) => {
            const rr = rowR[y], wy = rowY[y], wx = rr * cosT[x], wz = rr * sinT[x];
            // 年輪のうねり。1帯域だけだと滑らかな等高線になるので、
            // 大きな流れ（幹の曲がり）と cm 単位のよじれを重ねる
            const lo = Noise.fbm3(wx * 0.24 + 4, wy * 0.17 + 9, wz * 0.24 + 2, seed + 17, 3) - 0.5;
            const mi2 = Noise.fbm3(wx * 0.95 + 31, wy * 0.60 + 5, wz * 0.95 + 19, seed + 23, 2) - 0.5;
            return (lo * 1.0 + mi2 * 0.42) * bp.wave;
        });
        const knot = TexLab.coarse(N, STEP, true, (x, y) => {
            const rr = rowR[y], wy = rowY[y], wx = rr * cosT[x], wz = rr * sinT[x];
            return Noise.fbm3(wx * 0.55 + 21, wy * 0.42 + 13, wz * 0.55 + 7, seed + 89, 3);
        });
        const latheN = TexLab.coarse(N, STEP, true, (x, y) => {
            const rr = rowR[y], wy = rowY[y], wx = rr * cosT[x], wz = rr * sinT[x];
            return Noise.fbm3(wx * 1.1, wy * 3.0, wz * 1.1, seed + 131, 2);
        });

        const ring = new Float32Array(n2);   // 年輪（0=春目 1=夏目）
        const fine = new Float32Array(n2);   // 導管の細かい筋
        const lathe = new Float32Array(n2);  // ろくろ目（水平の細い筋）
        for (let y = 0; y < N; y++) {
            const wy = rowY[y], rr = rowR[y];
            // ろくろ目は高さだけの関数。0.6mm ピッチで強弱を振る
            const lz = 0.5 + 0.5 * Math.sin(wy / 0.062 * Math.PI);
            for (let x = 0; x < N; x++) {
                const i = y * N + x;
                const wx = rr * cosT[x], wz = rr * sinT[x];
                const rho = Math.hypot(wx - px, wz - pz) / spacing + warpF[i];
                ring[i] = TexLab.ring(rho, seed + 211);
                // 【対策】導管は繊維（＝立木の軸 = ワールドY）に沿って走る。
                //         周波数を y 側に高く取ると横筋になり、木口面に見える。
                //         水平方向を高く、鉛直方向を低くして縦の筋にする
                fine[i] = Noise.fbm3(wx * 34.0, wy * 3.2, wz * 34.0, seed + 61, 2);
                lathe[i] = lz * (0.55 + 0.45 * latheN[i]);
            }
        }
        // 杢（玉杢）: 髄の方向に対して面が接している側だけ濃くなる
        const flame = new Float32Array(n2);
        for (let y = 0; y < N; y++) {
            const rr = rowR[y];
            for (let x = 0; x < N; x++) {
                const wx = rr * cosT[x], wz = rr * sinT[x];
                const dx = wx - px, dz = wz - pz;
                const l = Math.hypot(dx, dz) || 1;
                // 面の外向き（≒ 半径方向）と髄方向の内積。直交＝接している
                const rl = Math.hypot(wx, wz) || 1;
                const dotv = (dx / l) * (wx / rl) + (dz / l) * (wz / rl);
                flame[y * N + x] = 1 - Math.abs(dotv);
            }
        }

        // ---- 塗膜の厚み ------------------------------------------------
        // 【対策】透漆（溜塗）の色は顔料ではなく膜の厚みで決まる。
        //         一様な厚みにすると、ただの暗い赤茶＝黒漆と区別がつかない。
        //         口縁・稜・見込み・擦れで薄くなる場を作り、そこだけ
        //         下地の朱が抜けるようにする
        const film = new Float32Array(n2);
        {
            const fIn = bp.filmIn === undefined ? 1 : bp.filmIn;
            const fRim = bp.filmRim === undefined ? 1 : bp.filmRim;
            for (let y = 0; y < N; y++) {
                const k0 = rowK[y];
                // 口縁の丸みの前後も少し薄くする（帯の端で段にならないように）
                const nearRim = smooth(0.10, 0.0, Math.abs(rowY[y] - G.rimY));
                let base = 1.0;
                if (k0 === 0) base *= fIn;
                if (k0 === 1) base *= fRim;
                base *= 1 - (1 - fRim) * nearRim * 0.8;
                for (let x = 0; x < N; x++) {
                    const i = y * N + x;
                    let f = base;
                    f *= 1 - 0.20 * lathe[i];                       // ろくろ目の稜は薄い
                    f *= 1 - 0.42 * smooth(0.60, 0.90, knot[i]);    // 使い込んだ擦れ
                    f *= 0.92 + 0.16 * fine[i];
                    film[i] = clamp(f, 0.05, 1.0);
                }
            }
        }

        const BASE = bp.base, GRAIN = bp.grain, DARK = bp.dark, IN = bp.inTint;
        const GSHOW = bp.grainShow === undefined ? 1 : bp.grainShow;
        const albedo = TexLab._tex("bowlA", N, N, (d) => {
            for (let y = 0; y < N; y++) {
                const isIn = rowK[y] === 0;          // 見込みは手擦れで白茶ける
                const isRim = rowK[y] === 1;
                for (let x = 0; x < N; x++) {
                    const i = y * N + x;
                    const g = ring[i] * (0.55 + 0.45 * flame[i] * bp.flame * 2.0);
                    let c = mix3(BASE, GRAIN, clamp((g * 0.72 + (fine[i] - 0.5) * 0.34) * GSHOW, 0, 1));
                    c = mix3(c, DARK, smooth(0.80, 0.97, knot[i]) * 0.55);
                    c = mix3(c, DARK, lathe[i] * bp.lathe * 0.12);
                    if (isIn) c = [c[0] * IN[0], c[1] * IN[1], c[2] * IN[2]];
                    // 【対策】口縁の抜けを強く入れると、断面の区分がそのまま
                    //         明るい帯として出て「テープを巻いた椀」になる。
                    //         実物は当たって塗りが薄くなるだけなので、ごく浅く
                    if (isRim) c = mix3(c, [c[0] * 1.16 + 0.035, c[1] * 1.14 + 0.028, c[2] * 1.12 + 0.022], 0.30);
                    const k = i * 4;
                    d[k] = clamp(c[0], 0, 1) * 255;
                    d[k + 1] = clamp(c[1], 0, 1) * 255;
                    d[k + 2] = clamp(c[2], 0, 1) * 255;
                    d[k + 3] = 255;
                }
            }
        }, scene, false, true);

        const orm = TexLab._tex("bowlO", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                // 夏目（濃い縞）は導管が粗くて光らない
                const ro = clamp(bp.rough + 0.16 * ring[i] + 0.07 * (fine[i] - 0.5)
                    + 0.05 * lathe[i] * bp.lathe, 0.05, 0.98);
                const k = i * 4;
                d[k] = 255; d[k + 1] = ro * 255; d[k + 2] = 0; d[k + 3] = 255;
            }
        }, scene, true, true);

        // 【対策】塗り立ての椀は導管が塗膜で埋まっている。年輪を凹凸として
        //         強く立てると、漆器ではなく彫刻した木彫りになる。
        //         起伏はろくろ目が主で、年輪はごく浅く
        const H = new Float32Array(n2);
        for (let i = 0; i < n2; i++) {
            H[i] = clamp(0.5 - 0.12 * ring[i] + 0.10 * (fine[i] - 0.5) - 0.16 * lathe[i] * bp.lathe, 0, 1);
        }
        const normal = TexLab.normalFromHeight("bowlN", N, H, 2.4, scene, true);

        // 塗膜のムラ。R=被覆率 G=粗さ
        const coat = TexLab._tex("bowlC", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const w = 0.80 + 0.20 * knot[i];
                const r2 = 0.55 + 0.45 * ring[i] * 0.6 + 0.25 * lathe[i];
                const k = i * 4;
                d[k] = clamp(w, 0, 1) * 255;
                d[k + 1] = clamp(r2, 0, 1) * 255;
                d[k + 2] = 0; d[k + 3] = 255;
            }
        }, scene, true, true);

        // 透漆の厚みマップ。
        // 【対策】tintTexture の rgb は tintColor へ乗算されるので、色を両方に
        //         入れると二重掛けになって沈む。rgb は白のまま、
        //         使うのは a（厚み係数）だけにする
        const tint = bp.tint ? TexLab._tex("bowlT", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const k = i * 4;
                d[k] = 255; d[k + 1] = 255; d[k + 2] = 255;
                d[k + 3] = film[i] * 255;
            }
        }, scene, false, true) : null;

        return { albedo: albedo, orm: orm, normal: normal, coat: coat, tint: tint, vRim: tab.vRim };
    }

    function bowlMaterial(scene, G, bp, name, seed) {
        const t = bowlTextures(scene, G, bp, seed);
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
        m.bumpTexture.level = 0.85;
        // ウレタン／漆はどちらも透明な塗膜。均一にすると濡れたプラスチックになる
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = t.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        m.clearCoat.intensity = bp.coat;
        m.clearCoat.roughness = bp.coatRough;
        m.clearCoat.indexOfRefraction = 1.51;
        // 透漆（溜塗）。塗膜そのものが色ガラスなので、下の層を通る光が
        // Beer–Lambert で吸収される。膜表面の鏡面反射は無色のまま残る——
        // 「黒く沈んでいるのに縁だけ朱が抜ける」のはこの構造から出る
        if (bp.tint && t.tint) {
            m.clearCoat.isTintEnabled = true;
            m.clearCoat.tintColor = col3(bp.tint.color);
            m.clearCoat.tintColorAtDistance = bp.tint.atDistance;
            m.clearCoat.tintThickness = bp.tint.thick;
            m.clearCoat.tintTexture = t.tint;
        }
        m.texs = t.tint ? [t.albedo, t.orm, t.normal, t.coat, t.tint]
            : [t.albedo, t.orm, t.normal, t.coat];
        return m;
    }

    // =================================================================
    // 6. Tofu : 賽の目豆腐
    // =================================================================
    // 【対策】具は1個ずつ「ワールド座標のまま」作る。あとで汁面へ沈んだ
    //         輪郭を焼くとき、行列を持ち回らずに三角形をそのまま流せる。
    //         個数が10に満たないのでインスタンス化の利点は無い

    // 丸めた直方体。6面をそれぞれ格子で刻み、内側の箱への最近点から
    // 半径 rr だけ押し出す。稜も角も同じ式で丸まり、面の内部は平らなまま
    const CUBE_FACES = [
        { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
        { n: [-1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
        { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
        { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
        { n: [0, 0, 1], u: [-1, 0, 0], v: [0, 1, 0] },
        { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] }
    ];

    function buildTofu(scene, cfg, tp, seed, pose) {
        const rng = new Rng(seed >>> 0);
        const S = cfg.tofuSize * rng.range(1 - cfg.tofuSizeVar, 1 + cfg.tofuSizeVar);
        const h = S * 0.5;
        const rr = Math.min(tp.edge * rng.range(0.85, 1.25), h * 0.42);
        const a = h - rr;                       // 内側の箱の半辺
        const seg = Math.max(4, cfg.tofuSeg | 0);
        const per = (seg + 1) * (seg + 1);
        const nV = per * 6;
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const colors = new Float32Array(nV * 4);
        const indices = new Uint32Array(seg * seg * 6 * 6);

        // 姿勢（ワールドへ焼き込む）
        const cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw);
        const ct = Math.cos(pose.tiltX), st = Math.sin(pose.tiltX);
        const cz = Math.cos(pose.tiltZ), sz = Math.sin(pose.tiltZ);
        function toWorld(x, y, z) {
            // Z 傾き → X 傾き → Y 回転 の順
            let x1 = x * cz - y * sz, y1 = x * sz + y * cz, z1 = z;
            let y2 = y1 * ct - z1 * st, z2 = y1 * st + z1 * ct, x2 = x1;
            return [x2 * cy + z2 * sy + pose.x, y2 + pose.y, -x2 * sy + z2 * cy + pose.z];
        }

        // 角の欠け。実際の豆腐は掬うときに角が1〜2か所つぶれる
        const chips = [];
        const nChip = rng.int(3);
        for (let c = 0; c < nChip; c++) {
            const th = rng.range(0, TAU), ph2 = Math.acos(rng.range(-1, 1));
            chips.push({
                x: Math.sin(ph2) * Math.cos(th), y: Math.cos(ph2), z: Math.sin(ph2) * Math.sin(th),
                r: rng.range(0.22, 0.44) * S, d: rng.range(0.03, 0.10) * S * tp.crumb
            });
        }

        const A = tp.albedo;
        let vo = 0, io = 0;
        for (let f = 0; f < 6; f++) {
            const F = CUBE_FACES[f];
            const base = vo;
            const uoff = (f * 0.37) % 1, voff = (f * 0.61) % 1;
            for (let iy = 0; iy <= seg; iy++) {
                const tv = iy / seg * 2 - 1;
                for (let ix = 0; ix <= seg; ix++) {
                    const tu = ix / seg * 2 - 1;
                    // 立方体表面の点
                    const qx = F.n[0] * h + F.u[0] * tu * h + F.v[0] * tv * h;
                    const qy = F.n[1] * h + F.u[1] * tu * h + F.v[1] * tv * h;
                    const qz = F.n[2] * h + F.u[2] * tu * h + F.v[2] * tv * h;
                    // 内側の箱への最近点 → そこから rr 押し出す
                    const cx0 = clamp(qx, -a, a), cy0 = clamp(qy, -a, a), cz0 = clamp(qz, -a, a);
                    let dx = qx - cx0, dy = qy - cy0, dz = qz - cz0;
                    const dl = Math.hypot(dx, dy, dz) || 1;
                    dx /= dl; dy /= dl; dz /= dl;
                    let x = cx0 + dx * rr, y = cy0 + dy * rr, z = cz0 + dz * rr;

                    // 切断面のざらつき。多帯域で、細かい側を粗い側と相関させる
                    const n1 = Noise.fbm3(x * 3.4 + 11, y * 3.4 + 5, z * 3.4 + 17, seed + 7, 3) - 0.5;
                    const n2 = Noise.fbm3(x * 14.0, y * 14.0, z * 14.0, seed + 29, 2) - 0.5;
                    const n3 = Noise.fbm3(x * 42.0, y * 42.0, z * 42.0, seed + 47, 2) - 0.5;
                    let bump = (n1 * 0.055 + n2 * 0.030 * (0.4 + 0.6 * (n1 + 0.5))
                        + n3 * 0.012) * tp.grit;
                    // 角の欠け
                    for (const c of chips) {
                        const dd = Math.hypot(x - c.x * h, y - c.y * h, z - c.z * h);
                        bump -= c.d * smooth(c.r, c.r * 0.25, dd);
                    }
                    x += dx * bump; y += dy * bump; z += dz * bump;

                    const w = toWorld(x, y, z);
                    const p3 = vo * 3, p2 = vo * 2, p4 = vo * 4;
                    positions[p3] = w[0]; positions[p3 + 1] = w[1]; positions[p3 + 2] = w[2];
                    uvs[p2] = ((tu * 0.5 + 0.5) * (S / 1.5) + uoff);
                    uvs[p2 + 1] = ((tv * 0.5 + 0.5) * (S / 1.5) + voff);
                    // 【対策】色を変位と無相関のノイズで振ると、どれだけ細かくても
                    //         「柄の付いた布」に見える。くぼみだけ影として沈ませる
                    const shade = clamp(1 + bump / 0.045 * 0.12, 0.80, 1.06);
                    const warm = 1 + (n1 * 0.030);
                    colors[p4] = s2l(clamp(A[0] * shade * warm, 0, 1));
                    colors[p4 + 1] = s2l(clamp(A[1] * shade, 0, 1));
                    colors[p4 + 2] = s2l(clamp(A[2] * shade / warm, 0, 1));
                    colors[p4 + 3] = 1;
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
        // 水面から出る高さと、器の内壁への収まりを合わせる。
        // 支持高さは解析的にも出せるが、ざらつきと角の欠けが乗るので実測で採る
        if (pose.top !== undefined) liftTo(positions, nV, pose.top);
        if (pose.limitR) fitInside(positions, nV, pose.limitR);
        let ccx = 0, ccy = 0, ccz = 0;
        for (let i = 0; i < nV; i++) { ccx += positions[i * 3]; ccy += positions[i * 3 + 1]; ccz += positions[i * 3 + 2]; }
        const ctr = new V3(ccx / nV, ccy / nV, ccz / nV);
        const normals = finalize(positions, indices, ctr, 0, true);
        weldNormals(positions, normals);
        const mesh = makeMesh("tofu", positions, indices, normals, uvs, colors, scene);
        mesh.tris = seg * seg * 2 * 6;
        mesh.size = S;
        return mesh;
    }

    // 豆腐の肌。凝固した大豆たんぱくの微細な気泡と、包丁目のわずかな筋
    function tofuTextures(scene, tp, size, seed) {
        const N = Math.max(64, Math.round(size) || 256), n2 = N * N;
        const H = new Float32Array(n2), pore = new Float32Array(n2);
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const i = y * N + x, u = x / N * 8, v = y / N * 8;
                // 気泡。閾値を切って粒立たせないと、ただのもやになる
                const p = Noise.fbm2u(u * 6.5, v * 6.5, 52, seed + 3, 3);
                pore[i] = smooth(0.62, 0.86, p);
                const fine = Noise.fbm2u(u * 22, v * 22, 176, seed + 19, 2);
                // 包丁目: ごく浅い一方向の筋
                const knife = Math.sin((v * 30 + Noise.fbm2u(u * 3, v * 3, 24, seed + 41, 2) * 4) * Math.PI);
                H[i] = clamp(0.5 - pore[i] * 0.42 + (fine - 0.5) * 0.30 * tp.grit
                    + knife * 0.035 * tp.grit, 0, 1);
            }
        }
        const normal = TexLab.normalFromHeight("tofuN", N, H, 1.8 * (0.5 + tp.grit), scene, false);
        const orm = TexLab._tex("tofuO", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                // 気泡の底は水が溜まって滑らか、外は乾いて粗い
                const ro = clamp(tp.rough + 0.16 * (1 - pore[i]) - 0.10 * pore[i], 0.08, 0.95);
                const ao = clamp(1 - pore[i] * 0.30, 0, 1);
                const k = i * 4;
                d[k] = ao * 255; d[k + 1] = ro * 255; d[k + 2] = 0; d[k + 3] = 255;
            }
        }, scene, true, false);
        const coat = TexLab._tex("tofuC", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const k = i * 4;
                d[k] = clamp(0.45 + 0.55 * pore[i], 0, 1) * 255;   // くぼみに水が溜まる
                d[k + 1] = clamp(0.85 - 0.45 * pore[i], 0, 1) * 255;
                d[k + 2] = 0; d[k + 3] = 255;
            }
        }, scene, true, false);
        return { normal: normal, orm: orm, coat: coat };
    }

    function tofuMaterial(scene, tp, tex, name) {
        const m = new BABYLON.PBRMaterial(name, scene);
        // 色は頂点カラーが全部持っている。ここは白
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0.0;
        m.roughness = 1.0;
        m.metallicTexture = tex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = tex.normal;
        m.bumpTexture.level = 0.7;
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = tex.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        m.clearCoat.intensity = tp.coat;
        m.clearCoat.roughness = tp.coatRough;
        m.clearCoat.indexOfRefraction = 1.34;      // 表面は水の膜
        // 豆腐は光をよく通す。縁が透けて明るくなるのが「豆腐らしさ」の主成分
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = tp.trans;
        m.subSurface.tintColor = col3([0.98, 0.955, 0.905]);
        m.subSurface.minimumThickness = 0.10;
        m.subSurface.maximumThickness = 1.30;
        return m;
    }

    // =================================================================
    // 7. Wakame : わかめの葉体
    // =================================================================
    // 【対策】平らな円盤をノイズで上下させただけだと、池に浮いた葉に見える。
    //         わかめは縁の弧長が内部より長いので縁が座屈してフリルになる。
    //         振幅を半径の2乗で立ち上げ、高周波は「空間」周波数で入れる。
    //         同じ空間周波数でも外周ほど角度方向の波数が増えるので、
    //         縁だけが自然に細かく波打つ
    function buildWakame(scene, cfg, seed, pose) {
        const rng = new Rng(seed >>> 0);
        const NR = Math.max(6, cfg.wakameRings | 0), NS = Math.max(16, cfg.wakameSectors | 0);
        const R0 = cfg.wakameR * rng.range(0.72, 1.38);
        const elong = rng.range(0.28, 0.52);          // 細長さ
        const ea = rng.range(0, TAU);
        // 【対策】うねりを大きく取ると葉の大半が水面から 5mm 以上沈み、
        //         消散長 0.6cm の汁ではほとんど地色へ溶けて、緑の靄になる。
        //         実物のわかめは水面に貼りついていて、濃い葉身がはっきり見える。
        //         振幅は葉の広がりに対してずっと小さく取る
        const amp = R0 * rng.range(0.14, 0.27);       // うねりの振幅
        const curl = rng.range(-0.16, 0.16);

        const cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw);
        const ct = Math.cos(pose.tiltX), st = Math.sin(pose.tiltX);
        const cz = Math.cos(pose.tiltZ), sz = Math.sin(pose.tiltZ);
        function toWorld(x, y, z) {
            let x1 = x * cz - y * sz, y1 = x * sz + y * cz, z1 = z;
            let y2 = y1 * ct - z1 * st, z2 = y1 * st + z1 * ct, x2 = x1;
            return [x2 * cy + z2 * sy + pose.x, y2 + pose.y, -x2 * sy + z2 * cy + pose.z];
        }

        // 輪郭。円上でノイズを引けば周期性は自動的に保たれる
        const outR = new Float32Array(NS);
        for (let j = 0; j < NS; j++) {
            const ph2 = j / NS * TAU;
            const cx = Math.cos(ph2), cz2 = Math.sin(ph2);
            const lo = Noise.fbm2(cx * 1.6 + 5, cz2 * 1.6 + 3, seed + 13, 3);
            const hi = Noise.fbm2(cx * 6.5 + 9, cz2 * 6.5 + 1, seed + 37, 2);
            const el = 1 + elong * Math.cos(2 * (ph2 - ea));
            // 【対策】低周波だけで輪郭を作ると角の取れた水たまりになる。
            //         わかめは切れ込みと尖った裂片を持つので、高周波を
            //         はっきり残す（ただし刺にならないよう後でならす）
            outR[j] = R0 * el * (0.52 + 0.62 * lo + 0.32 * (hi - 0.5));
        }
        // 輪郭を軽くならす。ノイズ由来の刺は葉に見えない
        const sm = new Float32Array(NS);
        for (let j = 0; j < NS; j++) {
            sm[j] = (outR[(j - 1 + NS) % NS] + 2 * outR[j] + outR[(j + 1) % NS]) * 0.25;
        }

        const nV = (NR + 1) * (NS + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const colors = new Float32Array(nV * 4);
        const indices = new Uint32Array(NR * NS * 6);

        const DEEP = [0.055, 0.104, 0.092];   // 濃い所は青緑。純緑にすると造花になる
        const MID = [0.118, 0.200, 0.142];
        const EDGE = [0.238, 0.306, 0.190];   // 縁は薄くて光を通し、黄緑へ寄る

        let vo = 0;
        for (let i = 0; i <= NR; i++) {
            const s = i / NR;
            for (let j = 0; j <= NS; j++) {
                const jj = j % NS;
                const ph2 = jj / NS * TAU;
                const r = s * sm[jj];
                const lx = r * Math.cos(ph2), lz = r * Math.sin(ph2);
                // 振幅は縁で立ち上げる（縁の余った弧長が座屈する）
                const A = amp * (0.08 + 0.92 * Math.pow(s, 1.9));
                const big = Noise.fbm2(lx * 0.85 + 7, lz * 0.85 + 2, seed + 53, 2) - 0.5;
                const mid = Noise.fbm2(lx * 2.4 + 3, lz * 2.4 + 8, seed + 71, 2) - 0.5;
                const fri = Noise.fbm2(lx * 6.1, lz * 6.1, seed + 97, 2) - 0.5;
                let ly = A * (big * 1.15 + mid * 0.75 + fri * 0.55);
                // 全体のたわみ（葉が丸まる）
                ly += curl * r * r * 0.22;
                const w = toWorld(lx, ly, lz);
                const p3 = vo * 3, p2 = vo * 2, p4 = vo * 4;
                positions[p3] = w[0]; positions[p3 + 1] = w[1]; positions[p3 + 2] = w[2];
                uvs[p2] = j / NS * 2.0; uvs[p2 + 1] = s * 1.2;
                // 【対策】色は厚みの代理（中心=厚い、縁=薄い）と相関させる。
                //         無相関に振るとプリントした造花になる
                const th = Math.pow(s, 1.35);
                let c = mix3(DEEP, MID, smooth(0.10, 0.62, th));
                c = mix3(c, EDGE, smooth(0.62, 1.0, th));
                // 個体差と、うねりの山谷でわずかに濃淡
                const v2 = 1 + (big * 0.20 + mid * 0.14);
                colors[p4] = s2l(clamp(c[0] * v2, 0, 1));
                colors[p4 + 1] = s2l(clamp(c[1] * v2, 0, 1));
                colors[p4 + 2] = s2l(clamp(c[2] * v2, 0, 1));
                colors[p4 + 3] = 1;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < NR; i++) {
            for (let j = 0; j < NS; j++) {
                const p = i * (NS + 1) + j;
                indices[io++] = p; indices[io++] = p + NS + 1; indices[io++] = p + 1;
                indices[io++] = p + 1; indices[io++] = p + NS + 1; indices[io++] = p + NS + 2;
            }
        }
        if (pose.mid !== undefined) liftMeanTo(positions, nV, pose.mid);
        else if (pose.top !== undefined) liftTo(positions, nV, pose.top);
        if (pose.limitR) fitInside(positions, nV, pose.limitR);

        // 薄膜なので裏表がある。巻き順は「上向き」に揃えておき、
        // 描画は両面（backFaceCulling = false / twoSidedLighting）でまかなう
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
        const mesh = makeMesh("wakame", positions, indices, normals, uvs, colors, scene);
        mesh.tris = NR * NS * 2;
        mesh.reach = R0 * (1 + elong);
        return mesh;
    }

    function wakameTextures(scene, size, seed) {
        const N = Math.max(64, Math.round(size) || 256), n2 = N * N;
        const H = new Float32Array(n2), sp = new Float32Array(n2);
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const i = y * N + x, u = x / N, v = y / N;
                // 葉脈というより、乾燥時についた細かい皺と気泡の跡
                const w1 = Noise.fbm2u(u * 26, v * 34, 26, seed + 5, 3);
                const w2 = Noise.fbm2u(u * 90, v * 110, 90, seed + 23, 2);
                sp[i] = smooth(0.74, 0.92, Noise.fbm2u(u * 60, v * 60, 60, seed + 43, 2));
                H[i] = clamp(0.5 + (w1 - 0.5) * 0.60 + (w2 - 0.5) * 0.28, 0, 1);
            }
        }
        const normal = TexLab.normalFromHeight("wakameN", N, H, 1.5, scene, false);
        const orm = TexLab._tex("wakameO", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                // 濡れているので基本は滑らか。皺の谷はさらに水が乗る
                const ro = clamp(0.30 - 0.16 * H[i] + 0.10 * sp[i], 0.06, 0.70);
                const k = i * 4;
                d[k] = 255; d[k + 1] = ro * 255; d[k + 2] = 0; d[k + 3] = 255;
            }
        }, scene, true, false);
        const coat = TexLab._tex("wakameC", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const k = i * 4;
                // 水膜。谷ほど厚く、滑らかに
                d[k] = clamp(0.62 + 0.38 * (1 - H[i]), 0, 1) * 255;
                d[k + 1] = clamp(0.30 + 0.45 * H[i], 0, 1) * 255;
                d[k + 2] = 0; d[k + 3] = 255;
            }
        }, scene, true, false);
        return { normal: normal, orm: orm, coat: coat };
    }

    function wakameMaterial(scene, tex, name) {
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);   // 色は頂点カラー
        m.metallic = 0.0;
        m.roughness = 1.0;
        m.metallicTexture = tex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = tex.normal;
        m.bumpTexture.level = 0.9;
        // 【対策】薄膜を片面で描くと、めくれた部分が消えて穴が開く
        m.backFaceCulling = false;
        m.twoSidedLighting = true;
        // 濡れた海藻。照りは強いが、鏡ではない
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = tex.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        m.clearCoat.intensity = 0.88;
        m.clearCoat.roughness = 0.115;
        m.clearCoat.indexOfRefraction = 1.34;
        // 逆光で緑が透ける。これが無いと黒いビニールになる
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.52;
        m.subSurface.tintColor = col3([0.26, 0.44, 0.24]);
        m.subSurface.minimumThickness = 0.02;
        m.subSurface.maximumThickness = 0.12;
        return m;
    }

    // =================================================================
    // 8. Submerge : 上から見た「最上点バッファ」を焼く ★
    // =================================================================
    // 味噌汁の消散長は実測で 1cm を切る（深さ1cmのわかめは地色へ8割溶ける）。
    // つまり汁は不透明として扱ってよく、見えるのは水面直下 2cm だけ。
    //
    // そこで具の三角形をワールド XZ 平面へ軟ラスタライズして
    //   topY … その位置で最も浅い具の高さ
    //   col  … そこの具の色（リニア）
    // を焼く。あとは深さ d = waterY - topY から 1 - exp(-σd) で汁色へ寄せれば、
    // 「水面直下だけぼんやり透ける」が透過描画もソートも無しに出る。
    class SubmergeMap {
        constructor(n, half) {
            this.n = n | 0;
            this.half = half;                 // 覆う範囲 [-half, half]
            this.cell = (half * 2) / this.n;
            const m = this.n * this.n;
            this.topY = new Float32Array(m).fill(-1e9);
            this.cr = new Float32Array(m);
            this.cg = new Float32Array(m);
            this.cb = new Float32Array(m);
            this.dist = null;
        }
        // ワールド x → 格子座標（セル中心が整数）
        _gx(x) { return (x + this.half) / this.cell - 0.5; }
        _wx(i) { return (i + 0.5) * this.cell - this.half; }

        addMesh(mesh) {
            const pos = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            const col = mesh.getVerticesData(BABYLON.VertexBuffer.ColorKind);
            const idx = mesh.getIndices();
            if (!pos || !idx) return;
            const n = this.n, cell = this.cell;
            for (let t = 0; t < idx.length; t += 3) {
                const i0 = idx[t], i1 = idx[t + 1], i2 = idx[t + 2];
                const ax = pos[i0 * 3], ay = pos[i0 * 3 + 1], az = pos[i0 * 3 + 2];
                const bx = pos[i1 * 3], by = pos[i1 * 3 + 1], bz = pos[i1 * 3 + 2];
                const cx = pos[i2 * 3], cy2 = pos[i2 * 3 + 1], cz = pos[i2 * 3 + 2];
                const gax = this._gx(ax), gaz = this._gx(az);
                const gbx = this._gx(bx), gbz = this._gx(bz);
                const gcx = this._gx(cx), gcz = this._gx(cz);
                const den = (gbz - gcz) * (gax - gcx) + (gcx - gbx) * (gaz - gcz);
                if (Math.abs(den) < 1e-12) continue;      // 真横から見た三角形
                let x0 = Math.max(0, Math.floor(Math.min(gax, gbx, gcx)));
                let x1 = Math.min(n - 1, Math.ceil(Math.max(gax, gbx, gcx)));
                let z0 = Math.max(0, Math.floor(Math.min(gaz, gbz, gcz)));
                let z1 = Math.min(n - 1, Math.ceil(Math.max(gaz, gbz, gcz)));
                for (let gz = z0; gz <= z1; gz++) {
                    for (let gx = x0; gx <= x1; gx++) {
                        const l0 = ((gbz - gcz) * (gx - gcx) + (gcx - gbx) * (gz - gcz)) / den;
                        if (l0 < -0.001) continue;
                        const l1 = ((gcz - gaz) * (gx - gcx) + (gax - gcx) * (gz - gcz)) / den;
                        if (l1 < -0.001) continue;
                        const l2 = 1 - l0 - l1;
                        if (l2 < -0.001) continue;
                        const y = l0 * ay + l1 * by + l2 * cy2;
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

        // 水面より上に出ている具までの距離場（メニスカスと接触の暗がり用）。
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

        // 双一次で引く。範囲外は「何も沈んでいない」
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
            // 【対策】高さは平均すると具の縁が斜面になってにじむ。最大を採る
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
    // 9. Broth : 汁面
    // =================================================================
    // 汁面のテクスチャは3層。生成の重い部分（ノイズ）は1度だけ走らせて
    // Float32Array に置き、σ（濁り）だけ変えるときは混色をやり直す
    function brothFields(G, mp, waterY, waterR, seed) {
        const N = Math.max(64, Math.round(G.brothTex) || 512), n2 = N * N;
        const half = mp.half;
        const F = {
            N: N, half: half,
            mottle: new Float32Array(n2),  // 対流のムラ
            speck: new Float32Array(n2),   // 味噌の粒
            objY: new Float32Array(n2),    // 沈んだ具の最上点
            dep: new Float32Array(n2),     // その沈み深さ [cm]（具が無ければ -1）
            // 【対策】σ を動かすたびに linear→sRGB の pow を 26万回まわすと
            //         スライダーが 50ms 刻みになる。σ に依存しない量なので
            //         ここで一度だけ変換して置いておく
            objR: new Float32Array(n2), objG: new Float32Array(n2), objB: new Float32Array(n2),
            near: new Float32Array(n2),    // 水面より上の具までの距離 [cm]
            wall: new Float32Array(n2),    // 器の内壁までの近さ 0..1
            oil: new Float32Array(n2),     // 油滴の被覆
            oilRim: new Float32Array(n2),  // 油滴の縁
            ripple: new Float32Array(n2)   // さざ波の高さ場
        };
        const rng = new Rng(seed >>> 0);
        // 油滴。汁の表面に浮いた油は円形の膜になり、縁だけ細く光る
        const drops = [];
        const nd = 26 + rng.int(22);
        for (let i = 0; i < nd; i++) {
            const a = rng.range(0, TAU), rr = waterR * Math.sqrt(rng.next()) * 0.97;
            drops.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr, r: rng.range(0.055, 0.34) });
        }
        const s = { y: 0, r: 0, g: 0, b: 0, d: 0 };
        const lit = G.veilLit;
        const l2s = (v) => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
        for (let py = 0; py < N; py++) {
            const z = ((py + 0.5) / N * 2 - 1) * half;
            for (let px = 0; px < N; px++) {
                const x = ((px + 0.5) / N * 2 - 1) * half;
                const k = py * N + px;
                // 対流のムラ。単一周波数だと等高線図になるので帯域を分ける
                const m1 = Noise.fbm2(x * 0.55 + 3, z * 0.55 + 7, seed + 11, 3) - 0.5;
                const m2 = Noise.fbm2(x * 1.9 + 13, z * 1.9 + 2, seed + 29, 2) - 0.5;
                F.mottle[k] = clamp(0.5 + m1 * 1.05 + m2 * 0.55, 0, 1);
                // 味噌の粒。閾値で粒立たせないと、ただのもやになる
                const sp = Noise.fbm2(x * 46, z * 46, seed + 53, 2);
                const sp2 = Noise.fbm2(x * 118 + 5, z * 118 + 9, seed + 71, 1);
                F.speck[k] = smooth(0.68, 0.90, sp) - smooth(0.72, 0.94, sp2) * 0.7;
                // 沈んだ具
                mp.sample(x, z, s);
                F.objY[k] = s.y;
                if (s.y > -1e8) {
                    F.dep[k] = Math.max(0, waterY - s.y);
                    F.objR[k] = l2s(clamp(s.r * lit, 0, 1));
                    F.objG[k] = l2s(clamp(s.g * lit, 0, 1));
                    F.objB[k] = l2s(clamp(s.b * lit, 0, 1));
                } else {
                    F.dep[k] = -1;
                }
                F.near[k] = s.d;
                // 器の内壁ぎわ
                const rr = Math.hypot(x, z);
                F.wall[k] = smooth(waterR - 1.05, waterR - 0.02, rr);
                // 油滴
                // 【対策】全テクセルで全油滴の hypot を取ると、これだけで
                //         1600万回の平方根になる。まず外接矩形で落とす
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
                //         混ぜると、繰り返しの継ぎ目に一直線の筋が出る。
                //         定在波は汁面メッシュの変位側だけで足す
                F.ripple[k] = (Noise.fbm2p(px / N * 9, py / N * 9, 9, 9, seed + 97, 3) - 0.5);
            }
        }
        F.drops = drops;
        return F;
    }

    // σ（濁り）に依存する部分だけを描く。スライダーはここだけ呼び直す。
    // 【対策】mix3 は毎回配列を返す。26万テクセル × 5 回で 130 万個の
    //         使い捨て配列が出て、GC だけでスライダーがカクつく。ここは
    //         見た目の悪さを承知でスカラーに展開する
    function brothAlbedoFill(d, N, F, mi, waterY, sigma, lit) {
        const B0 = mi.base[0], B1 = mi.base[1], B2 = mi.base[2];
        const D0 = mi.deep[0], D1 = mi.deep[1], D2 = mi.deep[2];
        const P0 = mi.pale[0], P1 = mi.pale[1], P2 = mi.pale[2];
        const kBase = 1 - mi.mottle, kOil = mi.oil;
        const n2 = N * N;
        for (let k = 0; k < n2; k++) {
            // 地色: 対流のムラ
            const mv = F.mottle[k];
            let t = (mv - 0.20) / 0.62; t = t < 0 ? 0 : (t > 1 ? 1 : t);
            t = t * t * (3 - 2 * t);
            let r = D0 + (P0 - D0) * t, g = D1 + (P1 - D1) * t, b = D2 + (P2 - D2) * t;
            r += (B0 - r) * kBase; g += (B1 - g) * kBase; b += (B2 - b) * kBase;
            // 味噌の粒。負の側は明るい粒（気泡・豆の欠片）になる
            const sp = F.speck[k];
            r *= 1 - sp * 0.20; g *= 1 - sp * 0.22; b *= 1 - sp * 0.26;

            // ★ 沈んだ具を消散長で溶かし込む
            const dep = F.dep[k];
            if (dep >= 0) {
                const veil = 1 - Math.exp(-sigma * dep);
                const or2 = F.objR[k], og2 = F.objG[k], ob2 = F.objB[k];
                r = or2 + (r - or2) * veil;
                g = og2 + (g - og2) * veil;
                b = ob2 + (b - ob2) * veil;
            }

            // 水面から出ている具のきわ: 内側に接触の影、外側にメニスカスの照り
            const nd = F.near[k];
            let sh = nd / 0.20; sh = sh < 0 ? 0 : (sh > 1 ? 1 : sh);
            sh = 1 - sh * sh * (3 - 2 * sh);
            if (sh > 0) {
                const w = sh * 0.55;
                r += (r * 0.66 - r) * w; g += (g * 0.64 - g) * w; b += (b * 0.60 - b) * w;
            }
            let ra = (nd - 0.045) / 0.115; ra = ra < 0 ? 0 : (ra > 1 ? 1 : ra);
            let rb = nd / 0.05; rb = rb < 0 ? 0 : (rb > 1 ? 1 : rb);
            const rim = (1 - ra * ra * (3 - 2 * ra)) * (rb * rb * (3 - 2 * rb)) * 0.8;
            if (rim > 0) {
                const tr = Math.min(1, r * 1.22 + 0.06), tg = Math.min(1, g * 1.20 + 0.06),
                    tb = Math.min(1, b * 1.18 + 0.05);
                r += (tr - r) * rim; g += (tg - g) * rim; b += (tb - b) * rim;
            }
            // 器ぎわ: 内壁が空を遮るぶん沈む
            const wl = F.wall[k] * 0.55;
            if (wl > 0) {
                r += (r * 0.72 - r) * wl; g += (g * 0.70 - g) * wl; b += (b * 0.66 - b) * wl;
            }
            // 油滴はごくわずかに黄色く濃い
            const ol = F.oil[k] * kOil * 0.45;
            if (ol > 0) {
                r += (Math.min(1, r * 1.03) - r) * ol; g += (g * 0.995 - g) * ol; b += (b * 0.94 - b) * ol;
            }
            const o = k * 4;
            d[o] = (r < 0 ? 0 : r > 1 ? 1 : r) * 255;
            d[o + 1] = (g < 0 ? 0 : g > 1 ? 1 : g) * 255;
            d[o + 2] = (b < 0 ? 0 : b > 1 ? 1 : b) * 255;
            d[o + 3] = 255;
        }
    }

    function brothTextures(scene, G, F, mi, waterY, sigma) {
        const N = F.N, n2 = N * N;
        const albedo = TexLab._tex("brothA", N, N, (d) => {
            brothAlbedoFill(d, N, F, mi, waterY, sigma, G.veilLit);
        }, scene, false, true);
        albedo.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;

        // 塗膜（＝水面）の被覆と粗さ。油滴の内側だけ一段滑らかになる
        const coat = TexLab._tex("brothC", N, N, (d) => {
            for (let k = 0; k < n2; k++) {
                const oil = F.oil[k] * mi.oil;
                const cov = clamp(0.88 + 0.12 * oil - 0.10 * F.speck[k], 0, 1);
                let ro = mi.rough * (1 - 0.45 * oil) + 0.10 * F.speck[k]
                    + 0.05 * F.wall[k];
                // 具の接触ぎわは表面が乱れて光が散る
                ro += (1 - smooth(0.0, 0.13, F.near[k])) * 0.10;
                const o = k * 4;
                d[o] = cov * 255; d[o + 1] = clamp(ro, 0.02, 0.9) * 255;
                d[o + 2] = 0; d[o + 3] = 255;
            }
        }, scene, true, true);
        coat.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;

        // 拡散側の ORM。粗さは一定（散乱体なので）、AO だけ効かせる
        const orm = TexLab._tex("brothO", N, N, (d) => {
            for (let k = 0; k < n2; k++) {
                const ao = clamp(1 - 0.40 * F.wall[k] - 0.45 * (1 - smooth(0.0, 0.22, F.near[k])), 0.25, 1);
                const o = k * 4;
                d[o] = ao * 255; d[o + 1] = 0.66 * 255; d[o + 2] = 0; d[o + 3] = 255;
            }
        }, scene, true, true);
        orm.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;

        // さざ波の法線。こちらはタイリングさせてゆっくり流す
        const H = new Float32Array(n2);
        for (let k = 0; k < n2; k++) {
            H[k] = clamp(0.5 + F.ripple[k] * 0.5 + F.oilRim[k] * 0.22 * mi.oil - F.oil[k] * mi.oil * 0.06, 0, 1);
        }
        const ripple = TexLab.normalFromHeight("brothN", N, H, 1.35, scene, false);
        return { albedo: albedo, coat: coat, orm: orm, ripple: ripple };
    }

    function brothMaterial(scene, tex, mi, name) {
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = tex.albedo;
        m.metallic = 0.0;
        m.roughness = 1.0;
        m.metallicTexture = tex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        // 【対策】味噌汁は「水の面」と「散乱する中身」の2層。1枚の PBR で
        //         滑らかにすると濡れたプラスチックの板になる。
        //         中身は完全な拡散体（粗さ 0.66）にして、照りは全部
        //         clearCoat（＝水面, IOR 1.33）に持たせる
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = tex.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        m.clearCoat.intensity = 1.0;
        m.clearCoat.roughness = mi.rough;
        m.clearCoat.indexOfRefraction = 1.335;
        m.clearCoat.bumpTexture = tex.ripple;
        m.clearCoat.bumpTexture.level = 0.55;
        tex.ripple.uScale = 2.6; tex.ripple.vScale = 2.6;
        return m;
    }

    // 汁面のメッシュ。中心から水際まで刻み、最後に内壁を這い上がる数リングを足す
    function buildBrothSurface(scene, G, F, mat, waterY, waterR) {
        const NR = Math.max(16, G.brothRings | 0), NS = Math.max(24, G.brothSectors | 0);
        const MEN = 4;                                    // メニスカスのリング数
        const rows = NR + 1 + MEN;
        const nV = rows * (NS + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array((rows - 1) * NS * 6);
        const half = F.half, N = F.N;

        // さざ波の高さ場をワールド位置から引く（テクスチャと同じ場を使う）
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
                // 中心 → 水際。面積が等しくなるように刻む（中心の三角が細くなりすぎない）
                const t = i / NR;
                rr = waterR * Math.sqrt(t) * 0.5 + waterR * t * 0.5;
                yy = waterY;
            } else {
                // 【対策】水は器の内壁をわずかに這い上がる。ここを直角に切ると
                //         「板がはまっている」ように見える。壁の断面に沿わせ、
                //         器の中へ 0.02cm 食い込ませて隙間を殺す
                const t = (i - NR) / MEN;
                yy = waterY + G.meniscus * Math.pow(t, 1.5);
                rr = innerRadiusAt(G, yy) + 0.020;
            }
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                const x = rr * Math.cos(th), z = rr * Math.sin(th);
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = x;
                // 定在波（器の縁で反射した波）はここで足す。テクスチャ側へ
                //         入れるとタイリングの継ぎ目に筋が出る
                const rr2 = Math.hypot(x, z);
                const wallW = smooth(waterR - 1.05, waterR - 0.02, rr2);
                const hh = rippleAt(x, z) + Math.sin(rr2 * 7.4 + 1.2) * 0.16 * wallW;
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
        // 汁面は必ず上を向く
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
        mesh.tris = (rows - 1) * NS * 2;
        return mesh;
    }

    // =================================================================
    //  具の配置
    // =================================================================
    // 【対策】豆腐は密度 1.03、味噌汁は 1.02。ほぼ拮抗しているので実際には
    //         対流で持ち上げられ、水面すれすれで漂う。写真でも上面だけが
    //         2〜3mm 顔を出している。落として積むのではなく、
    //         「顔を出す高さ」を直接与えたほうが速く、確実に写真に近い
    function placeGu(scene, G, tp, mats, waterY, waterR, seed) {
        const rng = new Rng(seed >>> 0);
        const tofus = [], wakames = [];
        const GOLD = 2.39996323;

        // ---- わかめ: 先に置く。豆腐より広がるので場所を取る -----------
        const nw = Math.max(1, G.wakameCount | 0);
        for (let i = 0; i < nw; i++) {
            const a = GOLD * i + rng.range(-0.4, 0.4);
            const rad = waterR * 0.66 * Math.sqrt((i + 0.60) / nw) + rng.range(-0.20, 0.20);
            // 葉身の平均高さ。
            // 【対策】全部を水面に貼りつけると輪郭は出るが、深さがどこにも
            //         無いので「濁り」がまったく効かない絵になる。逆に全部を
            //         沈めると緑の靄になる。実物は数枚が水面に浮き、
            //         残りが数 mm〜1cm 下に沈んでいる。
            //         u^1.9 で「浅いほうに寄った」深さ分布を作る
            const mid = waterY + 0.07 - Math.pow(rng.next(), 2.0) * 0.78;
            // 傾きは控えめに。0.2rad 振ると半径2cmの葉の端が 4mm 沈み、
            // 消散長 0.6cm の汁では端が地色へ溶けて輪郭を失う
            const m = buildWakame(scene, G, (seed ^ 0x51ED) + i * 7919, {
                x: Math.cos(a) * rad, y: 0, z: Math.sin(a) * rad,
                yaw: rng.range(0, TAU),
                tiltX: rng.gauss(0, 0.10), tiltZ: rng.gauss(0, 0.10),
                mid: mid, limitR: waterR - 0.18
            });
            m.material = mats.wakame;
            wakames.push(m);
        }

        // ---- 豆腐 -----------------------------------------------------
        const nt = Math.max(1, G.tofuCount | 0);
        const placed = [];
        for (let i = 0; i < nt; i++) {
            const rMax = waterR - G.tofuSize * 0.85 - 0.15;
            let cx = 0, cz = 0;
            for (let tryN = 0; tryN < 40; tryN++) {
                const a = GOLD * i + rng.range(-0.7, 0.7);
                const rad = rMax * Math.sqrt(clamp((i + rng.range(0.25, 0.95)) / nt, 0, 1));
                cx = Math.cos(a) * rad; cz = Math.sin(a) * rad;
                let ok = true;
                for (const p of placed) {
                    if (Math.hypot(cx - p.x, cz - p.z) < G.tofuSize * 1.12) { ok = false; break; }
                }
                if (ok) break;
            }
            placed.push({ x: cx, z: cz });
            const top = waterY + rng.range(G.tofuEmerge[0], G.tofuEmerge[1]);
            const m = buildTofu(scene, G, tp, (seed ^ 0x2C7F) + i * 6151, {
                x: cx, y: 0, z: cz,
                yaw: rng.range(0, TAU),
                tiltX: rng.gauss(0, 0.13), tiltZ: rng.gauss(0, 0.13),
                top: top, limitR: waterR - 0.10
            });
            m.material = mats.tofu;
            tofus.push(m);
        }
        return { tofus: tofus, wakames: wakames };
    }

    // =================================================================
    // 10. Sundry : 箸と箸置き
    // =================================================================
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
            // 太さ: 手元 5.5mm 角 → 先 1.8mm。
            // 【対策】指数を 1.35 にすると中央でもう 3mm まで落ちてしまい、
            //         遠目には串か爪楊枝に見える。参考写真を器の外径で
            //         測ると、実物は長さの 2/3 あたりまでほとんど細らず、
            //         先の 1/4 で一気に細くなる。指数を 2.6 まで上げて
            //         「細りを後ろへ寄せる」
            const rad = mix(0.275, 0.090, Math.pow(t, 2.6));
            // 断面: 手元は角（p=5.0 の丸めた四角）、先は円（p=2）。
            // 角断面はシルエットが太く見えるので、これも効く
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
        const mesh = makeMesh(name, positions, indices, normals, uvs, null, scene);
        mesh.tris = io / 3;
        return mesh;
    }

    // 箸置き。
    // 【対策】平らな直方体にすると、箸が天端に乗っているだけの
    //         「ただの木片」になる。実物は上面が長手方向に掬ってあり、
    //         箸はその窪みに納まって転がらない。両端が高く残るので、
    //         真横から見ると鞍のような形になる——参考写真の形はこれ
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
                    let dx = qx - c0, dy = qy - c1, dz = qz - c2;
                    const dl = Math.hypot(dx, dy, dz) || 1;
                    const x = c0 + dx / dl * rr;
                    let y = c1 + dy / dl * rr;
                    const z = c2 + dz / dl * rr;
                    // 上面の掬い。両端でちょうど満高に戻る円弧にする
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
        const mesh = makeMesh("chopstickRest", positions, indices, normals, uvs, null, scene);
        mesh.tris = seg * seg * 2 * 6;
        return mesh;
    }

    // =================================================================
    //  木のテクスチャ（テーブル / 箸 / 箸置き）
    // =================================================================
    // 【対策】アルベド・ORM・法線でノイズを引き直すと、同じ 512² を3回走査
    //         することになるうえ、丸め方の違いで年輪の位置がわずかにずれ、
    //         「木目の上に別の木目の影が乗った」ように見える。場は1度だけ作る
    function woodSet(scene, name, size, seed, opt) {
        const N = Math.max(64, Math.round(size) || 512), n2 = N * N;
        const ring = new Float32Array(n2), fine = new Float32Array(n2), knot = new Float32Array(n2);
        for (let y = 0; y < N; y++) {
            const v = y / N;
            for (let x = 0; x < N; x++) {
                const u = x / N, i = y * N + x;
                // across = true で木目の走る向きを 90 度変える（卓は長手方向）
                const a = opt.across ? v : u, b = opt.across ? u : v;
                // 【対策】年輪を直線にすると印刷した紙になる。うねりを1帯域だけに
                //         すると、こんどは等間隔の波になって段ボールに見える。
                //         幹の曲がり（低周波）と木理のよじれ（中周波）を重ねる
                const lo = Noise.fbm2p(b * 2.4, a * 1.3, 3, 2, seed + 11, 3) - 0.5;
                const mi2 = Noise.fbm2p(b * 8.5, a * 4.2, 9, 5, seed + 19, 2) - 0.5;
                const t = a * opt.rings + (lo * 1.0 + mi2 * 0.30) * opt.wave;
                // 1本ずつ幅も濃さも違う年輪
                ring[i] = TexLab.ring(t, seed + 311);
                // 【対策】導管は繊維に沿う＝年輪の縞と同じ向きに走る。
                //         周波数を取り違えると、縞を横切る筋になって
                //         「木目の上に別の木目が乗った」布に見える
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

    // =================================================================
    // 11. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.035, 0.033, 0.030, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.80;
    // ぼかしすぎるとハイライトのコントラストが消えて「艶消しの何か」になる
    env.lodGenerationOffset = 0.20;

    const waterY = GLOBAL.rimY - GLOBAL.waterDrop;
    const waterR = innerRadiusAt(GLOBAL, waterY);

    // 【対策】広角（fov 0.62 / 距離 27cm）だと、手前に置いた箸が器より
    //         13% 大きく写り、実寸どおりでも「長すぎる」絵になる。
    //         料理写真は 85〜100mm 相当の望遠で撮る。距離を伸ばして
    //         fov を絞れば、写る範囲は同じまま遠近だけが寝る（拡大率 7%）
    const camera = new BABYLON.ArcRotateCamera("cam", -1.16, 0.99, 52, new V3(0, 2.9, -1.1), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 4;
    camera.fov = 0.334;
    // 【対策】ポストプロセスを通すとシーンは深度つきの RT へ描かれる。
    //         maxZ 既定(10000) のままだと深度の分解能が足りず、
    //         汁面と豆腐の前後が勝ったり負けたりしてちらつく
    camera.minZ = 8.0;
    camera.maxZ = 260;
    camera.lowerRadiusLimit = 22;
    camera.upperRadiusLimit = 170;
    camera.upperBetaLimit = 1.50;      // テーブルの下へ潜らせない
    scene.cameraToUseForPointers = camera;

    // ---- 灯 ----------------------------------------------------------
    // 料理写真の定石。左上後方からのキー、反対からのフィル、
    // 拡散をほぼ 0 にして鏡面だけ足すキック（濡れた面の照り担当）
    const key = new BABYLON.DirectionalLight("key", new V3(-0.42, -0.94, 0.52).normalize(), scene);
    key.position = new V3(15, 30, -18);
    key.intensity = 2.55;
    key.diffuse = new BABYLON.Color3(1.0, 0.975, 0.940);
    // 【対策】平行光の影の範囲は既定だとキャスターの AABB にぴったり合う。
    //         すると影の落ちる先（テーブル）が範囲外になり直線でぶつ切りになる
    key.autoUpdateExtends = false;
    key.orthoLeft = -20; key.orthoRight = 20;
    key.orthoBottom = -20; key.orthoTop = 20;
    key.shadowMinZ = 1; key.shadowMaxZ = 80;

    // 【対策】平行光のハイライトは1点しか出ない。濡れた面（汁の水面、
    //         わかめ、塗りの椀）に何本も走る照りを作るには、
    //         拡散をほぼ 0 にして鏡面だけ足す灯が要る
    const back = new BABYLON.DirectionalLight("back", new V3(0.55, -0.30, -1.0).normalize(), scene);
    back.intensity = 1.75;
    back.diffuse = new BABYLON.Color3(0.055, 0.052, 0.048);
    back.specular = new BABYLON.Color3(1.0, 0.97, 0.92);

    const fill = new BABYLON.HemisphericLight("fill", new V3(-0.2, 1, -0.35), scene);
    fill.intensity = 0.24;
    fill.diffuse = new BABYLON.Color3(0.98, 0.98, 1.0);
    fill.groundColor = new BABYLON.Color3(0.34, 0.31, 0.28);
    fill.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    // 【対策】ESM は柔らかいが depthScale を詰めないと痣が出る。
    //         cm スケールの食べ物では PCF に落としたほうが早くきれい
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0035;
    sg.normalBias = 0.012;
    sg.setDarkness(0.30);              // 屋内の影は真っ黒にならない

    // ---- テーブル -----------------------------------------------------
    // 【対策】年輪を 7 本／うねり 1.9 で敷くと、周期が 4cm 近い大きな波に
    //         なり、木ではなく布か砂紋に見える。実物のオーク／タモの卓は
    //         線が細く、間隔 5〜10mm でほぼ直線に走る
    const tableWood = woodSet(scene, "table", 640, 7717, {
        base: [0.762, 0.678, 0.576], grain: [0.560, 0.470, 0.392],
        dark: [0.432, 0.336, 0.262],
        rings: 21.0, wave: 1.75, sharp: 2.3, knot: 0.30, rough: 0.44, bump: 0.7,
        across: true                    // 木目を画面の横方向に走らせる
    });
    const table = BABYLON.MeshBuilder.CreateGround("table", { width: 260, height: 260 }, scene);
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
        base: [0.352, 0.208, 0.118], grain: [0.212, 0.112, 0.058],
        dark: [0.145, 0.070, 0.036],
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

    // 参考写真の箸置きは箸と同じ濃い木。白木にすると発泡スチロールに見える
    const restWood = woodSet(scene, "rest", 256, 9091, {
        base: [0.412, 0.262, 0.156], grain: [0.276, 0.158, 0.086],
        dark: [0.186, 0.098, 0.050],
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
    //         「先を卓に突き立てて手元を浮かせた」妙な置き方になる。
    //         向きも決まっていて、先は左（＝食べる人から見て左手側）。
    //         箸置きの長手は箸と直交させる
    // 参考写真（真上からの1枚）を箸置きの長辺 4.2cm で正規化すると、
    // 箸は 22.6cm。実寸としては 22.5cm で正しかったが、レンダーでは
    // 手前の箸が遠近で 13% 拡大されて写る（器まで 27.8cm / 箸まで 24.5cm）。
    // カメラを望遠寄りにして遠近を寝かせたうえで、寸法も 21.0cm
    // （女性用の標準寸）へ落とす
    const CHOP_LEN = 21.0, CHOP_R = 0.275;
    // 箸置きの寸法も参考写真から。全長の 7.7% が幅、長辺はその 2.4 倍
    const restW = 3.95, restD = 1.62, restH = 1.45, restDip = 0.48;
    const restPos = { x: -7.50, y: restH * 0.5, z: -7.75 };
    // 箸が納まるのは天端ではなく掬いの底。わずかに食い込ませて浮きを防ぐ
    const contact = new V3(restPos.x, restH - restDip + 0.17, restPos.z);
    // 手元へ向かう水平方向（+x が画面の右）
    const awayXZ = new V3(0.9915, 0, 0.1029);
    const buttY = CHOP_R * 1.30;              // 断面が丸めた四角なので角の分だけ持ち上げる
    // 【対策】箸置きを箸の 1/4 のところに置くと、真ん中で支えているように
    //         見えて落ち着かない。参考写真を測ると、実物は先端から
    //         全長の 14% ——先のすぐ近く——に置く。手元までの水平距離を
    //         そこから逆算する
    const OVERHANG = CHOP_LEN * 0.140;        // 箸置きの中心から先端まで
    const dropY = contact.y - buttY;
    const runXZ = Math.sqrt(Math.max(0, Math.pow(CHOP_LEN - OVERHANG, 2) - dropY * dropY));
    const butt = new V3(contact.x + awayXZ.x * runXZ, buttY, contact.z + awayXZ.z * runXZ);
    const dir = butt.subtract(contact); const dlen = dir.length(); dir.scaleInPlace(1 / dlen);
    const tip = contact.subtract(dir.scale(CHOP_LEN - dlen));
    const perp = BABYLON.Vector3.Cross(dir, new V3(0, 1, 0)).normalize();
    const chopsticks = [];
    for (let i = 0; i < 2; i++) {
        // 【対策】実物の箸は2本がほぼ接して1本の帯に見える。
        //         中心間を 0.66cm も空けると、隙間が箸の太さの 2/3 になり
        //         「細い棒が2本離れて置いてある」絵になる
        const o = perp.scale((i === 0 ? -1 : 1) * 0.30);
        const c = buildChopstick(scene, "chopstick", sundryRng,
            butt.add(o), tip.add(o.scale(0.80)));
        c.material = chopMat;
        c.receiveShadows = true;
        chopsticks.push(c);
    }
    const restYaw = Math.atan2(-perp.z, perp.x);
    const rest = buildRest(scene, restW, restH, restD, 0.16, restDip, restPos, restYaw);
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
    steam.emitter = new V3(0, waterY + 0.5, 0);
    steam.minEmitBox = new V3(-2.4, -0.2, -2.4);
    steam.maxEmitBox = new V3(2.4, 0.2, 2.4);
    // 【対策】加算合成にすると湯気が発光して見える。湯気は光っていない
    steam.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    steam.color1 = new BABYLON.Color4(1, 1, 1, 0.050);
    steam.color2 = new BABYLON.Color4(0.95, 0.95, 0.96, 0.024);
    steam.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    steam.minSize = 0.9; steam.maxSize = 3.0;
    steam.minLifeTime = 2.0; steam.maxLifeTime = 3.8;
    steam.emitRate = 110;
    steam.gravity = new V3(0.25, 1.3, 0);
    steam.direction1 = new V3(-0.35, 1.5, -0.35);
    steam.direction2 = new V3(0.45, 2.6, 0.35);
    steam.minAngularSpeed = -0.45; steam.maxAngularSpeed = 0.45;
    steam.minEmitPower = 0.35; steam.maxEmitPower = 0.95;
    steam.updateSpeed = 0.012;

    // =================================================================
    //  組み立て / 差し替え
    // =================================================================
    const bowlMatCache = {};      // 器 → PBRMaterial（生成が重いのでキャッシュ）
    const tofuTexCache = {};      // 豆腐 → テクスチャ一式
    const tofuMatCache = {};
    let wakameTex = null, wakameMat = null;

    let state = null;   // { bowl, tofus, wakames, broth, brothTex, brothMat, F, mp, cfgMiso }
    let onRebuilt = null;
    let ssao = null;

    const live = {
        sigma: MISOS[START_MISO].sigma,
        trans: 1.0,      // 具の透光の倍率
        ripple: 1.0,     // さざ波の強さの倍率
        wet: 1.0         // 水面の粗さの倍率
    };

    function getBowlMat(k) {
        if (!bowlMatCache[k]) bowlMatCache[k] = bowlMaterial(scene, GLOBAL, BOWLS[k], "bowlMat_" + k, 4001 + k.length * 37);
        return bowlMatCache[k];
    }
    function getTofuMat(k) {
        if (!tofuMatCache[k]) {
            tofuTexCache[k] = tofuTextures(scene, TOFUS[k], 256, 1201 + k.length * 53);
            tofuMatCache[k] = tofuMaterial(scene, TOFUS[k], tofuTexCache[k], "tofuMat_" + k);
        }
        return tofuMatCache[k];
    }
    function getWakameMat() {
        if (!wakameMat) {
            wakameTex = wakameTextures(scene, 256, 3301);
            wakameMat = wakameMaterial(scene, wakameTex, "wakameMat");
        }
        return wakameMat;
    }

    function disposeBroth(st) {
        if (!st) return;
        if (st.broth) st.broth.dispose();
        if (st.brothMat) st.brothMat.dispose(true, false);
        if (st.brothTex) for (const k in st.brothTex) st.brothTex[k].dispose();
        st.broth = null; st.brothMat = null; st.brothTex = null;
    }
    function disposeGu(st) {
        if (!st) return;
        for (const m of st.tofus || []) m.dispose();
        for (const m of st.wakames || []) m.dispose();
        st.tofus = []; st.wakames = [];
    }

    // 具を配置し、沈んだ輪郭を焼くところまで
    function buildComposition(tofuKey, seed) {
        const mats = { tofu: getTofuMat(tofuKey), wakame: getWakameMat() };
        const gu = placeGu(scene, GLOBAL, TOFUS[tofuKey], mats, waterY, waterR, seed);

        const half = waterR + 0.30;
        const mp = new SubmergeMap(GLOBAL.veilGrid, half);
        for (const m of gu.wakames) mp.addMesh(m);
        for (const m of gu.tofus) mp.addMesh(m);
        mp.buildDistance(waterY);

        const F = brothFields(GLOBAL, mp, waterY, waterR, seed ^ 0x1B0A);

        // 完全に沈んだ具は不透明な汁面の下に隠れる。焼き込みは済んでいるので
        // 描画からは外してよい（＝汁面と喧嘩する余地も無くなる）
        for (const m of gu.wakames.concat(gu.tofus)) {
            m.refreshBoundingInfo();
            const bb = m.getBoundingInfo().boundingBox;
            if (bb.maximumWorld.y < waterY - 0.004) { m.isVisible = false; m.sunk = true; }
            else { sg.addShadowCaster(m, true); m.receiveShadows = true; }
        }
        return { tofus: gu.tofus, wakames: gu.wakames, mp: mp, F: F };
    }

    function buildBroth(st, misoKey) {
        const mi = MISOS[misoKey];
        st.miso = mi;
        st.brothTex = brothTextures(scene, GLOBAL, st.F, mi, waterY, live.sigma);
        st.brothMat = brothMaterial(scene, st.brothTex, mi, "brothMat");
        st.brothMat.clearCoat.roughness = mi.rough * live.wet;
        st.brothMat.clearCoat.bumpTexture.level = 0.55 * live.ripple;
        if (!st.broth) {
            st.broth = buildBrothSurface(scene, GLOBAL, st.F, st.brothMat, waterY, waterR);
        } else {
            st.broth.material = st.brothMat;
        }
        st.broth.receiveShadows = true;
    }

    // σ（濁り）だけ変える。ノイズの場は使い回すので、混色をやり直すだけで済む
    let sigmaDirty = false;
    function redrawVeil() {
        if (!state || !state.brothTex) return;
        const dt = state.brothTex.albedo, N = state.F.N;
        const ctx = dt.getContext();
        const img = ctx.createImageData(N, N);
        brothAlbedoFill(img.data, N, state.F, state.miso, waterY, live.sigma, GLOBAL.veilLit);
        ctx.putImageData(img, 0, 0);
        dt.update(false);
    }

    function applyLive() {
        if (!state) return;
        for (const k in tofuMatCache) {
            tofuMatCache[k].subSurface.translucencyIntensity = clamp(TOFUS[k].trans * live.trans, 0, 0.95);
        }
        if (wakameMat) wakameMat.subSurface.translucencyIntensity = clamp(0.52 * live.trans, 0, 0.95);
        if (state.brothMat) {
            state.brothMat.clearCoat.roughness = clamp(state.miso.rough * live.wet, 0.015, 0.60);
            state.brothMat.clearCoat.bumpTexture.level = 0.55 * live.ripple;
        }
    }

    let currentMiso = START_MISO, currentBowl = START_BOWL, currentTofu = START_TOFU;
    let currentSeed = START_SEED >>> 0;

    function build(full) {
        if (full) {
            disposeBroth(state);
            disposeGu(state);
            if (state && state.broth) { state.broth.dispose(); state.broth = null; }
            const c = buildComposition(currentTofu, currentSeed);
            state = state || {};
            state.tofus = c.tofus; state.wakames = c.wakames;
            state.mp = c.mp; state.F = c.F; state.broth = null;
        } else {
            disposeBroth(state);
        }
        buildBroth(state, currentMiso);
        if (!state.bowl) {
            state.bowl = buildBowl(scene, GLOBAL, getBowlMat(currentBowl), new Rng(0xB0117));
            sg.addShadowCaster(state.bowl, true);
        }
        state.bowl.material = getBowlMat(currentBowl);
        applyLive();
        if (onRebuilt) onRebuilt(state);
    }

    build(true);

    // =================================================================
    //  ポストプロセス
    // =================================================================
    if (GLOBAL.useSSAO) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        // 【対策】半径を具の大きさ（1.5cm）まで詰めると、豆腐という豆腐の
        //         輪郭に黒い縁がついて全体が汚れる。器と汁面の境目のような
        //         大きい陰りだけを拾わせる
        ssao.radius = 1.15;
        ssao.totalStrength = 0.52;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 200;
        ssao.minZAspect = 0.25;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.92;
    dp.bloomWeight = 0.11;
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
    // 【対策】露出 1.22 では、いちばん明るい汁面（sRGB 0.90 前後）が
    //         ACES の肩から出て白く飛び、豆腐との境が消える。
    //         汁も豆腐も淡い高キーの被写体なので、露出は低めに置く
    ip.exposure = 1.06;
    ip.contrast = 1.16;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.35;
    ip.vignetteCameraFov = 0.72;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    // さざ波をゆっくり流す。静止画だと水に見えないので、これは効く
    let t0 = 0;
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
        if (state && state.brothMat && state.brothMat.clearCoat.bumpTexture) {
            t0 += scene.getEngine().getDeltaTime() * 0.001;
            const b = state.brothMat.clearCoat.bumpTexture;
            b.uOffset = Math.sin(t0 * 0.11) * 0.016 + t0 * 0.0032;
            b.vOffset = Math.cos(t0 * 0.083) * 0.014 - t0 * 0.0021;
        }
        if (sigmaDirty) { sigmaDirty = false; redrawVeil(); }
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
        if (ULR && ULR.prototype && !ULR.prototype.__misoPatched) {
            const orig = ULR.prototype.getRenderCamera;
            ULR.prototype.getRenderCamera = function (getDefault) {
                if (this._renderCamera) return this._renderCamera;
                const s = this.originalScene || this.utilityLayerScene;
                if (s && s.__debugMainCamera) return s.__debugMainCamera;
                return orig.call(this, getDefault);
            };
            ULR.prototype.__misoPatched = true;
        }
        sc.__debugMainCamera = mainCam;
        // scene.pick() を camera 引数なしで呼ぶと createPickingRay の中で
        // scene.activeCamera が使われる。描画ループが activeCameras を順に
        // 代入していくので、終わった時点では guiCam が残っている。毎フレーム戻す
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
        idle: "#2b2926", active: "#7d6236", edge: "#4a463e",
        text: "#f3ede1", sub: "#a8a193", accent: "#e8d6ae"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "262px";
    card.height = "86%";
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

    addLabel("MISO SOUP / 豆腐とわかめのお味噌汁", 11, COL.sub, "30px");

    const misoBtns = {}, bowlBtns = {}, tofuBtns = {};
    function highlight() {
        for (const k in misoBtns) misoBtns[k].background = (k === currentMiso) ? COL.active : COL.idle;
        for (const k in bowlBtns) bowlBtns[k].background = (k === currentBowl) ? COL.active : COL.idle;
        for (const k in tofuBtns) tofuBtns[k].background = (k === currentTofu) ? COL.active : COL.idle;
    }

    addLabel("味噌", 13, COL.accent, "22px");
    for (const k of Object.keys(MISOS)) {
        misoBtns[k] = addButton("m_" + k, MISOS[k].label, () => {
            currentMiso = k;
            live.sigma = MISOS[k].sigma;
            if (sSigma) sSigma.slider.value = live.sigma;
            build(false);
            highlight();
        });
    }
    addLabel("器", 13, COL.accent, "22px");
    for (const k of Object.keys(BOWLS)) {
        bowlBtns[k] = addButton("b_" + k, BOWLS[k].label, () => {
            currentBowl = k; state.bowl.material = getBowlMat(k); highlight();
        });
    }
    addLabel("豆腐", 13, COL.accent, "22px");
    for (const k of Object.keys(TOFUS)) {
        tofuBtns[k] = addButton("t_" + k, TOFUS[k].label, () => {
            currentTofu = k; build(true); highlight();
        });
    }

    addSpacer();
    addButton("reseed", "よそい直す", () => {
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

    const backBtn = addButton("back", "照り足し: ON", () => {
        back.setEnabled(!back.isEnabled());
        backBtn.textBlock.text = "照り足し: " + (back.isEnabled() ? "ON" : "OFF");
        backBtn.background = back.isEnabled() ? COL.active : COL.idle;
    });
    backBtn.background = COL.active;

    let chopOn = true;
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
    // ここが本題のスライダー。0 に寄せると澄まし汁になり、
    // 沈んだ豆腐とわかめが底まで見えるようになる
    const sSigma = addSlider("汁の濁り σ [1/cm]", 0.02, 4.0, live.sigma, f2, (v) => {
        live.sigma = v; sigmaDirty = true;
        if (sigmaInfo) {
            sigmaInfo.text = "  消散長 " + (1 / Math.max(v, 1e-3)).toFixed(2)
                + "cm ／ 深さ1cmで " + Math.round((1 - Math.exp(-v)) * 100) + "% 溶ける";
        }
    });
    const sigmaInfo = addLabel("", 11, COL.sub, "34px");
    sigmaInfo.text = "  消散長 " + (1 / live.sigma).toFixed(2)
        + "cm ／ 深さ1cmで " + Math.round((1 - Math.exp(-live.sigma)) * 100) + "% 溶ける";

    const sTrans = addSlider("具の透光 ×", 0, 2.0, live.trans, f2, (v) => { live.trans = v; applyLive(); });
    const sRip = addSlider("さざ波 ×", 0, 3.0, live.ripple, f2, (v) => { live.ripple = v; applyLive(); });
    const sWet = addSlider("水面の粗さ ×", 0.1, 3.0, live.wet, f2, (v) => { live.wet = v; applyLive(); });

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

    const info = addLabel("", 12, COL.sub, "72px");
    highlight();

    onRebuilt = (st) => {
        sTrans.slider.value = live.trans;
        sRip.slider.value = live.ripple;
        sWet.slider.value = live.wet;
        let tri = (st.bowl ? st.bowl.tris : 0) + (st.broth ? st.broth.tris : 0);
        let sunk = 0;
        for (const m of st.tofus) { tri += m.tris; if (m.sunk) sunk++; }
        for (const m of st.wakames) { tri += m.tris; if (m.sunk) sunk++; }
        for (const m of sundry) tri += m.tris;
        info.text = "豆腐 " + st.tofus.length + " / わかめ " + st.wakames.length
            + "（完全に沈んで汁面へ焼いたもの " + sunk + "）\n"
            + tri.toLocaleString() + " tri / 汁面 " + st.F.N + "²\n"
            + "水面 y=" + waterY.toFixed(2) + "cm  径 " + (waterR * 2).toFixed(1) + "cm\n"
            + "seed: " + currentSeed;
    };
    onRebuilt(state);

    console.log("[MisoSoup] build miso-soup-2026-08-31-e",
        "| water y=" + waterY.toFixed(3), "r=" + waterR.toFixed(3),
        "| sigma=" + live.sigma, "| seed=" + currentSeed);

    scene.onDisposeObservable.add(() => {
        for (const k in bowlMatCache) {
            const m = bowlMatCache[k];
            if (m.texs) for (const t of m.texs) t.dispose();
            m.dispose(true, false);
        }
        for (const k in tofuTexCache) for (const t2 in tofuTexCache[k]) tofuTexCache[k][t2].dispose();
        if (wakameTex) for (const t2 in wakameTex) wakameTex[t2].dispose();
        if (state && state.brothTex) for (const t2 in state.brothTex) state.brothTex[t2].dispose();
        for (const s2 of [tableWood, chopWood, restWood]) for (const t2 in s2) s2[t2].dispose();
        steamTex.dispose();
    });

    return scene;
};

export default createScene;