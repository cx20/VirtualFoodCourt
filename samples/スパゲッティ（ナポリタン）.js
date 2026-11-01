// =====================================================================
//  Photoreal Napolitan  /  写実的な「ナポリタン」
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//  build: napolitan-2026-10-04-a
//
//  構成:
//    0. CONFIG      … ソース / 皿 / クロス / 具 のプリセットと寸法
//    1. Rng / Noise / Mesh utils / TexLab
//    2. Plate       … 深めのパスタ皿（回転体・弧長 UV・縁の線）
//    3. Mound       … 盛りの外形（包絡面）と、隙間を埋める「芯」
//    4. Toppings    … ウィンナー / ピーマン / 玉ねぎ / マッシュルーム ★
//    5. Fork        … フォーク（巻き取った麺の芯）
//    6. Strands     … 麺の経路（盛りの上を歩く／フォークに巻く）★
//    7. Relax       … 麺どうし・具との押し合い（位置ベースの緩和）★
//    8. Pasta mesh  … 管の掃引 / 頂点カラー（ソースのむら × 遮蔽）
//    9. Scene       … クロス / IBL / 3灯 / 影
//   10. Build / GUI
//
//  実物の要点（ここを外すと「オレンジ色の毛糸玉」になる）:
//    ・麺は1本ずつ独立した管で、盛りは「麺の山」であって「麺柄の山」ではない。
//      輪郭のぎざぎざ、表面に浮いた輪、隙間の暗がり——どれも本数で出る
//    ・ただし全部を管にすると数十万本要る。見えるのは上の2〜3層だけなので、
//      その下は暗い「芯」で塞ぐ。隙間から覗くのは芯の暗がり＝奥行きになる
//    ・麺は交差する。交差で互いにめり込むと一瞬で CG に見えるので、
//      置いたあとで押し合わせて（位置ベースの緩和）上下を決める
//    ・ナポリタンのソースは「かかって」いない。炒めて麺に絡んでいる。
//      麺そのものが橙で、濃く絡んだ所は赤く、薄い所は黄色く抜ける。
//      ミートソースのように上に溜まった赤い層は無い
//    ・具は麺の上に乗るのではなく、半分埋まって麺がかぶさる
//    ・油とケチャップの照りで、麺の稜線に沿って細いハイライトが無数に走る
// =====================================================================

var createScene = async function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    const MM = 0.1;     // 単位系: 1 unit = 1 cm

    // ---- ソースのプリセット（色はすべて sRGB のアルベド） ------------------
    // 参考写真の実測（ハイライトを除いた地）:
    //   明るい麺   [0.95, 0.60, 0.09]〜[0.95, 0.63, 0.25]（照明込み）
    //   影の麺     [0.58, 0.16, 0.01]〜[0.69, 0.15, 0.01]
    // 【対策】照明込みの値をそのままアルベドに入れると、露出を合わせた時点で
    //         黄色く飛ぶ。G/R と B/R の比だけ写真に合わせ、明度は 0.8 倍に置く。
    //         B を 0.20 以上にすると途端に「ミートソース」か「にんじん」になる
    const SAUCE = {
        kissa: {
            label: "喫茶店（濃いめ）",
            pale: [0.930, 0.640, 0.250],   // 絡みの薄い所（黄色く抜ける）
            base: [0.905, 0.480, 0.135],   // 標準の橙
            thick: [0.790, 0.290, 0.075],  // 濃く絡んだ所（赤）
            char: [0.430, 0.150, 0.050],   // 鉄板の焼き目（黒に寄せない）
            cover: 0.50, charAmt: 0.0, gloss: 1.00, rough: 0.36
        },
        home: {
            label: "家庭（あっさり）",
            pale: [0.940, 0.720, 0.340],
            base: [0.920, 0.570, 0.200],
            thick: [0.830, 0.380, 0.110],
            char: [0.470, 0.190, 0.070],
            cover: 0.38, charAmt: 0.0, gloss: 0.80, rough: 0.40
        },
        teppan: {
            label: "鉄板焼き（焼き目）",
            pale: [0.910, 0.600, 0.220],
            base: [0.870, 0.440, 0.120],
            thick: [0.740, 0.260, 0.070],
            char: [0.400, 0.140, 0.048],
            cover: 0.58, charAmt: 0.55, gloss: 1.15, rough: 0.33
        }
    };

    // ---- 皿のプリセット ----------------------------------------------
    const PLATES = {
        white: {
            label: "白磁",
            albedo: [0.862, 0.856, 0.842], rough: 0.10,
            band: null, line: null
        },
        orange: {
            label: "縁に橙の線",
            albedo: [0.870, 0.860, 0.838], rough: 0.10,
            band: null,
            // 外周の口縁に細い線（参考写真2）
            line: { col: [0.900, 0.520, 0.200], r0: 12.95, r1: 13.30 }
        },
        cobalt: {
            label: "呉須のリム",
            albedo: [0.858, 0.858, 0.852], rough: 0.09,
            // リム全体が濃い藍（参考写真3）。縁ほど濃く、内側でにじむ
            band: { col: [0.130, 0.215, 0.520], dark: [0.080, 0.130, 0.360], r0: 10.6, r1: 13.30, blur: 0.25 },
            line: null
        },
        gray: {
            label: "灰釉",
            // 実測 [0.765, 0.718, 0.733]（照明込み）。わずかに紫に寄った灰
            albedo: [0.690, 0.672, 0.680], rough: 0.16,
            band: null, line: null
        }
    };

    // ---- クロスのプリセット ------------------------------------------
    // stripes: [幅 cm, 色] を周期 24cm になるまで並べる
    const CLOTHS = {
        pastel: {
            label: "パステルストライプ",
            stripes: [[1.6, [0.820, 0.825, 0.790]], [2.2, [0.640, 0.775, 0.520]], [0.6, [0.820, 0.825, 0.790]],
                [1.4, [0.930, 0.870, 0.560]], [2.0, [0.820, 0.825, 0.790]], [0.5, [0.840, 0.470, 0.500]],
                [1.2, [0.820, 0.825, 0.790]], [2.0, [0.700, 0.640, 0.800]], [1.0, [0.820, 0.825, 0.790]],
                [1.8, [0.640, 0.775, 0.520]], [0.8, [0.930, 0.870, 0.560]], [1.6, [0.820, 0.825, 0.790]],
                [0.5, [0.700, 0.640, 0.800]], [2.4, [0.820, 0.825, 0.790]], [1.2, [0.880, 0.640, 0.640]],
                [2.8, [0.820, 0.825, 0.790]]],
            rough: 0.86, rib: 0.45
        },
        redline: {
            label: "赤い細線",
            stripes: [[1.05, [0.900, 0.895, 0.885]], [0.12, [0.840, 0.250, 0.250]], [0.18, [0.900, 0.895, 0.885]],
                [0.12, [0.840, 0.250, 0.250]]],
            rough: 0.84, rib: 0.35
        },
        blue: {
            label: "水色のリブ",
            stripes: [[0.30, [0.560, 0.790, 0.860]], [0.08, [0.500, 0.730, 0.810]]],
            rough: 0.82, rib: 1.0
        },
        linen: {
            label: "灰色のリネン",
            stripes: [[3.0, [0.330, 0.335, 0.335]]],
            rough: 0.90, rib: 0.30
        }
    };

    // ---- 具のプリセット ----------------------------------------------
    //   wiener: 本数, wienerCut: "diag"（斜め薄切り）/"round"（輪切り）
    //   pepper: 枚数, pepperCut: "strip"（細切り）/"ring"（輪切り）
    const TOPPINGS = {
        kissa: { label: "斜め切り（喫茶店）", wiener: 6, wienerCut: "diag", pepper: 6, pepperCut: "strip", onion: 8, mush: 0 },
        ring: { label: "輪切り＋マッシュルーム", wiener: 8, wienerCut: "round", pepper: 4, pepperCut: "ring", onion: 5, mush: 4 },
        light: { label: "具少なめ", wiener: 3, wienerCut: "diag", pepper: 3, pepperCut: "strip", onion: 5, mush: 0 },
        none: { label: "麺だけ", wiener: 0, wienerCut: "diag", pepper: 0, pepperCut: "strip", onion: 0, mush: 0 }
    };

    const GLOBAL = {
        // ---- 皿（回転体）: r = 中心からの距離, y = 高さ。テーブル面が y=0 ----
        // 直径 26.6cm の深めのパスタ皿。見込みが広く、リムは短い
        plateR: 13.30,
        rimY: 2.55,
        wellY: 0.62,          // 見込みの底（上面）
        wellR: 6.80,          // 見込みの平らな部分の半径
        wallR: 10.40,         // 壁がリムへ立ち上がりきる半径
        thick: 0.50,
        footR0: 5.60, footR1: 6.10,
        plateSectors: 192,

        // ---- 盛り ----
        cx: -0.30, cz: 0.40,  // 盛りの中心
        moundR: 8.30,         // 盛りの半径（裾まで）
        peak: 5.40,           // 見込みの底からの高さ
        coreDepth: 0.46,      // 芯の深さ（包絡面から）。これより上だけ麺を管にする

        // ---- 麺 ----
        strands: 240,         // 盛りの麺の本数
        noodleD: 2.3,         // 茹で上がりの太さ [mm]（乾麺 1.7〜1.8mm が膨らむ）
        step: 0.24,           // 経路の刻み [cm]
        sides: 8,             // 管の周方向の分割
        relaxIters: 7,

        fork: true,
        cheese: false,
        parsley: false,

        // ---- 描画 ----
        useSSAO: true,
        useDOF: true,
        dofFStop: 2.8,
        dofRatio: 0.070,
        // 【対策】GUI 専用カメラに分けると Inspector の Physics Helper / 選択
        //         ハイライト / ピッカーが壊れる。Layer.applyPostProcess = false で
        //         2台目を作らずに UI をポストプロセスの外へ出す
        guiOwnCamera: false
    };

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;

    // =================================================================
    // 1. Rng / Noise / Mesh utils / TexLab
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
    // 1次元の値ノイズ（麺の経路の曲率・ソースのむら用）
    function n1(x, seed) {
        const xi = Math.floor(x), f = x - xi, u = f * f * (3 - 2 * f);
        const a = Noise._h2(xi, 7, seed), b = Noise._h2(xi + 1, 7, seed);
        return a + (b - a) * u;
    }
    function fbm1(x, seed, oct) {
        let s = 0, a = 0.5, f = 1, n = 0;
        for (let o = 0; o < oct; o++) { s += a * n1(x * f, seed + o * 31); n += a; f *= 2; a *= 0.5; }
        return s / n;
    }

    // ---- Mesh utils ---------------------------------------------------
    // 【対策】Babylon の Node コンストラクタは id = name を入れるだけで、
    //         同名メッシュを複数作ると id が重複し、Inspector の選択が飛ぶ
    let _uid = 0;
    function named(mesh, base) {
        mesh.name = base;
        mesh.id = base + "#" + (++_uid);
        return mesh;
    }

    // 三角形ごとの巻き順を「解析的な法線」に合わせる。
    // 【対策】VertexData.ComputeNormals は (v0-v1)×(v2-v1)、つまり右手系の
    //         外積と符号が逆。表になる三角形は「右手系の外積が法線と逆を向く」。
    //         部品ごとに規約を決め打ちすると必ずどこかで裏返るので、
    //         法線を自分で持っている物は三角形単位でここを通す
    function orient(P, I, N) {
        for (let t = 0; t < I.length; t += 3) {
            const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
            const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
            const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
            const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
            const nx = N[a] + N[b] + N[c], ny = N[a + 1] + N[b + 1] + N[c + 1], nz = N[a + 2] + N[b + 2] + N[c + 2];
            if (cx * nx + cy * ny + cz * nz > 0) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; }
        }
    }

    // 位置が一致する頂点の法線を平均する。継ぎ目の筋を消す
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

    // 単調3次エルミート（Fritsch–Carlson）。皿の断面がリムで膨らまないように
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
        //         立て、不透明のはずのメッシュが透過パスへ回る（深度が書かれない）
        mesh.hasVertexAlpha = false;
        mesh.tris = indices.length / 3;
        return mesh;
    }

    // 伸びる配列（Float32Array を倍々で確保）
    class Buf {
        constructor(n, T) { this.T = T || Float32Array; this.a = new this.T(Math.max(16, n)); this.n = 0; }
        push(v) { if (this.n >= this.a.length) { const b = new this.T(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; }
        push3(x, y, z) { this.push(x); this.push(y); this.push(z); }
        out() { return this.a.subarray(0, this.n); }
    }
    // 頂点を書き溜めて1メッシュにする
    class Geo {
        constructor(est) {
            est = est || 1024;
            this.P = new Buf(est * 3); this.N = new Buf(est * 3);
            this.U = new Buf(est * 2); this.C = new Buf(est * 4);
            this.I = new Buf(est * 6, Uint32Array);
        }
        get nv() { return this.P.n / 3; }
        v(x, y, z, nx, ny, nz, u, w, c) {
            this.P.push3(x, y, z);
            const l = Math.hypot(nx, ny, nz) || 1;
            this.N.push3(nx / l, ny / l, nz / l);
            this.U.push(u); this.U.push(w);
            this.C.push(c[0]); this.C.push(c[1]); this.C.push(c[2]); this.C.push(1);
            return this.nv - 1;
        }
        t(a, b, c) { this.I.push(a); this.I.push(b); this.I.push(c); }
        q(a, b, c, d) { this.t(a, b, c); this.t(a, c, d); }
        mesh(name, scene) {
            const P = this.P.out(), N = this.N.out(), I = this.I.out();
            orient(P, I, N);
            return makeMesh(name, Array.from(P), Array.from(I), Array.from(N),
                Array.from(this.U.out()), Array.from(this.C.out()), scene);
        }
    }

    // ---- TexLab -------------------------------------------------------
    const TexLab = {
        _tex(name, w, h, fill, scene, linear, clampAll) {
            // 【対策】createImageData は整数しか受け付けない
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
            // 【対策】ORM と法線は「色」ではない。gammaSpace = true のままだと
            //         粗さが線形化されて狙いよりつやつやになる
            if (linear) dt.gammaSpace = false;
            dt.anisotropicFilteringLevel = 16;
            return dt;
        },
        // 高さ場 → 接空間法線（周期境界）
        normalFromHeight(name, W, H, Hf, strength, scene) {
            return this._tex(name, W, H, (d) => {
                for (let y = 0; y < H; y++) {
                    const yu = ((y - 1 + H) % H) * W, yd = ((y + 1) % H) * W, yc = y * W;
                    for (let x = 0; x < W; x++) {
                        const xl = Hf[yc + ((x - 1 + W) % W)], xr = Hf[yc + ((x + 1) % W)];
                        const hu = Hf[yu + x], hd = Hf[yd + x];
                        // 【対策】v 方向は (hd - hu)。Babylon の接空間は V が下向き
                        const nx = (xl - xr) * strength, ny = (hd - hu) * strength, nz = 1;
                        const l = Math.hypot(nx, ny, nz);
                        const i = (yc + x) * 4;
                        d[i] = (nx / l * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny / l * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz / l * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene, true);
        }
    };
    // sRGB パレット → 頂点カラー（リニア）
    const lin3 = (c) => [s2l(c[0]), s2l(c[1]), s2l(c[2])];

    // =================================================================
    // 2. Plate : 深めのパスタ皿（回転体）
    // =================================================================
    // 上面の断面。r = 中心からの距離。見込みは平らで、壁はゆるい S 字で
    // リムへ上がる。リムは外へ向かってわずかに登り、口縁で丸く折り返す
    const G = GLOBAL;
    const topSpline = monoSpline(
        [0, 3.0, G.wellR, 8.0, 9.3, G.wallR, 11.8, G.plateR - 0.17],
        [G.wellY, G.wellY + 0.005, G.wellY + 0.02, G.wellY + 0.36, G.wellY + 1.20, G.rimY - 0.15, G.rimY - 0.05, G.rimY]);
    function plateTopY(r) { return topSpline(Math.min(r, G.plateR - 0.17)); }
    // 皿の肉厚（鉛直方向）。リムは薄く、見込みは厚い
    function plateThick(r) { return mix(G.thick, 0.34, smooth(G.wellR, G.wallR, r)); }

    // 閉じた断面ループ: 上面（中心→外）→ 口縁 → 下面（外→内）→ 高台 → 中心
    function plateLoop() {
        const pts = [];
        const lipR = G.plateR - 0.17, lipC = G.rimY - 0.17;
        const NT = 120;
        for (let i = 0; i <= NT; i++) {
            // 【対策】r を等間隔に刻むと、壁の急斜面だけ頂点が粗くなる。
            //         縁のハイライトが折れ線に見えるので、壁に密に置く
            const t = i / NT;
            const r = lipR * (t + 0.10 * Math.sin(t * Math.PI) * Math.sin(t * TAU)) ;
            pts.push([Math.max(0, Math.min(lipR, r)), 0, 1]);   // [r, y(後で), 部位 1=上面]
        }
        for (const p of pts) p[1] = plateTopY(p[0]);
        // 口縁: 半径 0.17 の半円
        for (let i = 1; i < 12; i++) {
            const a = Math.PI / 2 - Math.PI * i / 12;
            pts.push([lipR + 0.17 * Math.cos(a), lipC + 0.17 * Math.sin(a), 2]);
        }
        // 下面（外→内）
        const NB = 60;
        for (let i = 0; i <= NB; i++) {
            const r = lipR - (lipR - (G.footR1 + 0.35)) * (i / NB);
            pts.push([r, plateTopY(r) - plateThick(r), 3]);
        }
        // 高台
        const yIn = plateTopY(G.footR0) - plateThick(G.footR0);
        pts.push([G.footR1 + 0.12, 0.10, 3]);
        pts.push([G.footR1, 0.0, 3]);
        pts.push([G.footR0 + 0.10, 0.0, 3]);
        pts.push([G.footR0, 0.08, 3]);
        pts.push([G.footR0 - 0.15, yIn, 3]);
        for (let i = 1; i <= 12; i++) {
            const r = (G.footR0 - 0.15) * (1 - i / 12);
            pts.push([r, yIn + 0.02 * (1 - (r / G.footR0) ** 2), 3]);
        }
        // 弧長
        const s = [0];
        for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        return { pts, s, L: s[s.length - 1] };
    }

    // 皿のアルベド / ORM。u = 周方向, v = 断面の弧長
    function plateTextures(scene, P, loop, seed, moundEdge) {
        const W = 1024, H = 256;
        const alb = new Float32Array(W * H * 3), rgh = new Float32Array(W * H);
        // v → (r, 部位)
        const vr = new Float32Array(H), vk = new Uint8Array(H);
        let j = 0;
        for (let y = 0; y < H; y++) {
            const sv = (y + 0.5) / H * loop.L;
            while (j < loop.s.length - 2 && loop.s[j + 1] < sv) j++;
            const t = clamp((sv - loop.s[j]) / Math.max(1e-6, loop.s[j + 1] - loop.s[j]), 0, 1);
            vr[y] = mix(loop.pts[j][0], loop.pts[j + 1][0], t);
            vk[y] = loop.pts[j][2];
        }
        const base = lin3(P.albedo);
        for (let y = 0; y < H; y++) {
            const r = vr[y], kind = vk[y];
            for (let x = 0; x < W; x++) {
                const th = (x + 0.5) / W * TAU;
                const px = r * Math.cos(th), pz = r * Math.sin(th);
                let c = base.slice();
                // 釉のむら（低周波）と鉄粉の点（高周波）
                const m = Noise.fbm2(px * 0.6 + 3, pz * 0.6, seed, 3);
                const k = 0.985 + 0.03 * (m - 0.5);
                c = [c[0] * k, c[1] * k, c[2] * k * 1.004];
                const sp = Noise.v2(px * 22, pz * 22, seed + 9);
                if (sp > 0.992) { const f = 0.55; c = [c[0] * f, c[1] * f, c[2] * f * 1.05]; }
                let rough = P.rough;
                if (P.band && kind !== 3) {
                    const B = P.band;
                    const w = smooth(B.r0 - B.blur, B.r0 + B.blur, r) * (kind === 2 ? 1 : 1);
                    // 呉須は筆の重なりで濃淡が出る
                    const dk = Noise.fbm2(px * 1.4, pz * 1.4, seed + 21, 3);
                    const bc = mix3(lin3(B.col), lin3(B.dark), clamp(0.2 + 0.9 * (dk - 0.4) + 0.5 * smooth(B.r1 - 1.2, B.r1, r), 0, 1));
                    c = mix3(c, bc, w);
                }
                if (P.line && kind !== 3) {
                    const L = P.line;
                    const w = smooth(L.r0 - 0.04, L.r0 + 0.04, r) * (kind === 1 ? 1 : (kind === 2 ? 1 : 0));
                    c = mix3(c, lin3(L.col), w);
                }
                // ソースの汚れ: 盛りの裾の外側に、薄く伸びた橙の膜
                if (kind === 1 && moundEdge) {
                    const e = moundEdge(px, pz);          // 盛りの縁からの外向き距離 [cm]
                    const n = Noise.fbm2(px * 0.9 + 11, pz * 0.9, seed + 33, 4);
                    const smear = smooth(1.1, -0.2, e) * smooth(0.48, 0.70, n);
                    if (smear > 0) {
                        // 【対策】ケチャップの膜は「赤い塗料」ではない。白い皿が
                        //         透けて見える薄い膜なので、色を乗算で落とす
                        const tint = lin3([0.96, 0.62, 0.36]);
                        c = mix3(c, [c[0] * tint[0], c[1] * tint[1], c[2] * tint[2]], smear * 0.85);
                        rough = mix(rough, 0.05, smear);
                    }
                }
                const i = y * W + x;
                alb[i * 3] = c[0]; alb[i * 3 + 1] = c[1]; alb[i * 3 + 2] = c[2];
                rgh[i] = rough;
            }
        }
        const albedo = TexLab._tex("plateAlb", W, H, (d) => {
            for (let i = 0; i < W * H; i++) {
                d[i * 4] = l2s(alb[i * 3]) * 255; d[i * 4 + 1] = l2s(alb[i * 3 + 1]) * 255;
                d[i * 4 + 2] = l2s(alb[i * 3 + 2]) * 255; d[i * 4 + 3] = 255;
            }
        }, scene, false);
        const orm = TexLab._tex("plateORM", W, H, (d) => {
            for (let i = 0; i < W * H; i++) {
                d[i * 4] = 255; d[i * 4 + 1] = rgh[i] * 255; d[i * 4 + 2] = 0; d[i * 4 + 3] = 255;
            }
        }, scene, true);
        albedo.wrapV = orm.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        return { albedo, orm };
    }

    function buildPlate(scene, P, seed, moundEdge) {
        const loop = plateLoop();
        const NS = G.plateSectors;
        const geo = new Geo(loop.pts.length * (NS + 1));
        const n = loop.pts.length;
        // 2D の外向き法線 = 接線を +90° 回したもの
        const nrm = [];
        for (let i = 0; i < n; i++) {
            const a = loop.pts[Math.max(0, i - 1)], b = loop.pts[Math.min(n - 1, i + 1)];
            let tx = b[0] - a[0], ty = b[1] - a[1];
            const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
            nrm.push([-ty, tx]);
        }
        nrm[0] = [0, 1]; nrm[n - 1] = [0, -1];
        const white = [1, 1, 1];
        for (let k = 0; k <= NS; k++) {
            const th = k / NS * TAU, c = Math.cos(th), s = Math.sin(th);
            // 【対策】完全な真円だと縁のハイライトが定規で引いた線になる。
            //         リムにだけ微小な歪みを入れる（見込みは盛りの基準なので触らない）
            const wob = 1 + 0.0035 * (Math.cos(3 * th + 0.7) * 0.6 + Math.sin(5 * th + 1.9) * 0.4);
            for (let i = 0; i < n; i++) {
                const [r, y] = loop.pts[i];
                const w = mix(1, wob, smooth(G.wallR, G.plateR, r));
                geo.v(r * w * c, y, r * w * s, nrm[i][0] * c, nrm[i][1], nrm[i][0] * s,
                    k / NS, loop.s[i] / loop.L, white);
            }
        }
        for (let k = 0; k < NS; k++) for (let i = 0; i < n - 1; i++) {
            const a = k * n + i, b = (k + 1) * n + i;
            geo.q(a, a + 1, b + 1, b);
        }
        const mesh = geo.mesh("plate", scene);
        const tex = plateTextures(scene, P, loop, seed, moundEdge);
        const m = new BABYLON.PBRMaterial("plateMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = tex.albedo;
        m.metallic = 0; m.roughness = 1;
        m.metallicTexture = tex.orm;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.useAmbientOcclusionFromMetallicTextureRed = false;
        // 釉薬の層。地の粗さとは別に、表面に薄いガラス層の鋭い反射が乗る
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.85;
        m.clearCoat.roughness = 0.06;
        mesh.material = m;
        mesh.receiveShadows = true;
        return { mesh, mat: m, tex };
    }

    // =================================================================
    // 3. Mound : 盛りの外形（包絡面）と芯
    // =================================================================
    // 盛りは「麺が積もったときの外側の面」として先に決める。麺はこの面の
    // 少し下を歩かせ、最後に押し合いで上下を整える。
    //   包絡面 y = 皿の上面(r) + 盛りの高さ(u)·(1 + 塊のうねり)
    // 盛りの高さは (1 - u²)^1.25 の釣鐘。ナポリタンはトングで寄せた丸い山で、
    // 裾は麺が流れてなだらかに皿へ落ちる。
    // 【対策】(1 - u^2.4)^0.7 のように肩を張らせると、裾が崖になって
    //         「麺で作ったケーキ」に見えた
    function makeMound(seed) {
        const rng = new Rng(seed ^ 0x4D0D);
        const ph = [rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU)];
        const tilt = [rng.range(-0.6, 0.6), rng.range(-0.6, 0.6)];   // 頂点のずれ [cm]
        const R = G.moundR, peak = G.peak;
        function radiusAt(th) {
            return R * (1 + 0.050 * Math.sin(2 * th + ph[0]) + 0.034 * Math.sin(3 * th + ph[1])
                + 0.020 * Math.sin(5 * th + ph[2]) + 0.012 * Math.sin(8 * th + ph[3]));
        }
        function local(x, z) {
            const dx = x - G.cx, dz = z - G.cz;
            const rho = Math.hypot(dx, dz), th = Math.atan2(dz, dx);
            return { rho, th, u: rho / radiusAt(th) };
        }
        function height(x, z) {
            const L = local(x, z);
            if (L.u >= 1) return 0;
            // 頂点を少しずらす（真ん中が一番高い山は人工的）
            const sx = x - G.cx - tilt[0] * (1 - L.u), sz = z - G.cz - tilt[1] * (1 - L.u);
            const u2 = Math.min(1, Math.hypot(sx, sz) / radiusAt(L.th));
            let h = peak * Math.pow(Math.max(0, 1 - u2 * u2), 1.25);
            // 盛り付けの塊。トングで寄せた山は 3〜4cm 周期でこぶになる
            const lump = Noise.fbm2(x * 0.30 + 5.1, z * 0.30 - 2.7, seed + 77, 3) - 0.5;
            h *= 1 + 0.30 * lump * (1 - L.u * 0.5);
            return Math.max(0, h);
        }
        function env(x, z) { return plateTopY(Math.hypot(x, z)) + height(x, z); }
        function normal(x, z) {
            const e = 0.12;
            const gx = (env(x + e, z) - env(x - e, z)) / (2 * e);
            const gz = (env(x, z + e) - env(x, z - e)) / (2 * e);
            const l = Math.hypot(gx, 1, gz);
            return [-gx / l, 1 / l, -gz / l];
        }
        function edge(x, z) { const L = local(x, z); return L.rho - radiusAt(L.th); }
        return { radiusAt, local, height, env, normal, edge };
    }

    // 芯: 包絡面の coreDepth 下に張った暗い面。麺の隙間から覗くのはここ
    function buildCore(scene, M, S, seed) {
        const NR = 40, NA = 168;
        const geo = new Geo((NR + 1) * (NA + 1));
        const dark = lin3(S.thick), mid = lin3(S.base);
        for (let a = 0; a <= NA; a++) {
            const th = a / NA * TAU;
            const Rt = M.radiusAt(th);
            for (let i = 0; i <= NR; i++) {
                const u = i / NR;
                const x = G.cx + Math.cos(th) * Rt * u, z = G.cz + Math.sin(th) * Rt * u;
                const e = M.env(x, z), pt = plateTopY(Math.hypot(x, z));
                // 【対策】裾で芯が皿の上に出ると、盛りの外に橙の円盤が見える。
                //         縁では皿の上面より下へ潜らせて隠す
                const y = Math.max(pt - 0.06, e - G.coreDepth) - 0.06 * smooth(0.85, 1.0, u);
                const n = Noise.fbm2(x * 1.7, z * 1.7, seed + 5, 3);
                // 奥ほど暗い。麺の隙間の底は直接光が届かない
                const k = 0.30 + 0.22 * n;
                const c = mix3(dark, mid, n);
                const nn = M.normal(x, z);
                geo.v(x, y, z, nn[0], nn[1], nn[2], u, a / NA, [c[0] * k, c[1] * k, c[2] * k]);
            }
        }
        for (let a = 0; a < NA; a++) for (let i = 0; i < NR; i++) {
            const p = a * (NR + 1) + i, q = (a + 1) * (NR + 1) + i;
            geo.q(p, p + 1, q + 1, q);
        }
        const mesh = geo.mesh("pastaCore", scene);
        const m = new BABYLON.PBRMaterial("coreMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0; m.roughness = 0.55;
        m.environmentIntensity = 0.5;
        mesh.material = m;
        mesh.receiveShadows = true;
        return mesh;
    }

    // =================================================================
    // 4. Toppings : 具
    // =================================================================
    // 具は先に置き、麺はあとから押し合いで具を避ける（かぶさる／脇を通る）。
    // そのため各具は形のほかに「符号付き距離 sdf」を持つ。
    const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const vsc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const vnorm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    // up に直交化した正規直交基底（X = 接線方向のヒント）
    function basis(up, hint) {
        const Y = vnorm(up);
        let X = vsub(hint, vsc(Y, vdot(hint, Y)));
        if (Math.hypot(X[0], X[1], X[2]) < 1e-4) X = Math.abs(Y[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
        X = vnorm(vsub(X, vsc(Y, vdot(X, Y))));
        const Z = vcross(X, Y);
        return { X, Y, Z };
    }
    // 軸 axis まわりに v を角度 a 回す（ロドリゲス）
    function rotAxis(v, axis, a) {
        const k = vnorm(axis), c = Math.cos(a), s = Math.sin(a);
        const kv = vcross(k, v), kd = vdot(k, v) * (1 - c);
        return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
    }

    // ---- 断面: 角の丸い長方形 ------------------------------------------
    // a = N 方向（厚み）, b = B 方向（幅）。curv は幅方向の反り（ピーマンの壁、
    // 玉ねぎの層は平らではなく円筒の一部）
    function secRect(ha, hb, curv, nEdge) {
        const rc = Math.min(ha, hb) * 0.92;
        const pts = [];
        const nE = nEdge || 6, nC = 5;
        const ca = ha - rc, cb = hb - rc;
        const C = [[1, 1, 0], [-1, 1, Math.PI / 2], [-1, -1, Math.PI], [1, -1, 1.5 * Math.PI]];
        // (a,b) 平面で a 軸=0°。反時計回りに4隅を回る
        for (let k = 0; k < 4; k++) {
            const [sa, sb, a0] = C[k];
            for (let i = 0; i <= nC; i++) {
                const t = a0 + (Math.PI / 2) * i / nC;
                pts.push([sa * ca + rc * Math.cos(t), sb * cb + rc * Math.sin(t)]);
            }
            // 次の隅までの直線
            const [na, nb] = C[(k + 1) % 4];
            const ea = [sa * ca + rc * Math.cos(a0 + Math.PI / 2), sb * cb + rc * Math.sin(a0 + Math.PI / 2)];
            const eb = [na * ca + rc * Math.cos(C[(k + 1) % 4][2]), nb * cb + rc * Math.sin(C[(k + 1) % 4][2])];
            // 【対策】辺の長さで分割数を変えると、断面ごとに点数が変わって
            //         掃引の輪がつながらない。短い辺も同じ数で刻む
            const m = nE;
            for (let i = 1; i < m; i++) { const t = i / m; pts.push([mix(ea[0], eb[0], t), mix(ea[1], eb[1], t)]); }
        }
        // 反り
        for (const p of pts) p[0] -= curv * p[1] * p[1];
        // 2D 法線（反時計回りなので接線を -90° 回すと外向き）
        const n = pts.length, out = [];
        for (let i = 0; i < n; i++) {
            const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
            const t = vnorm([b[0] - a[0], b[1] - a[1], 0]);
            out.push({ a: pts[i][0], b: pts[i][1], na: t[1], nb: -t[0] });
        }
        return out;
    }

    // ---- 掃引 ----------------------------------------------------------
    // path: [[x,y,z]...], ups: 各点の上向きヒント, secAt(i) → 断面,
    // col(i, s, wn) → リニア色。closed なら輪にする
    function sweep(geo, path, ups, secAt, col, closed) {
        const n = path.length;
        const fr = [];
        for (let i = 0; i < n; i++) {
            const a = closed ? path[(i - 1 + n) % n] : path[Math.max(0, i - 1)];
            const b = closed ? path[(i + 1) % n] : path[Math.min(n - 1, i + 1)];
            const T = vnorm(vsub(b, a));
            const N = vnorm(vsub(ups[i], vsc(T, vdot(ups[i], T))));
            const B = vcross(T, N);
            fr.push({ T, N, B });
        }
        const rings = [];
        let K = 0;
        for (let i = 0; i < n; i++) {
            const sec = secAt(i), f = fr[i], p = path[i];
            K = sec.length;
            const idx = [];
            for (let k = 0; k <= K; k++) {
                const s = sec[k % K];
                const wp = vadd(p, vadd(vsc(f.N, s.a), vsc(f.B, s.b)));
                const wn = vadd(vsc(f.N, s.na), vsc(f.B, s.nb));
                idx.push(geo.v(wp[0], wp[1], wp[2], wn[0], wn[1], wn[2], k / K, i / (n - 1), col(i, s, wn, f)));
            }
            rings.push(idx);
        }
        const m = closed ? n : n - 1;
        for (let i = 0; i < m; i++) {
            const A = rings[i], Br = rings[(i + 1) % n];
            for (let k = 0; k < K; k++) geo.q(A[k], A[k + 1], Br[k + 1], Br[k]);
        }
        if (!closed) {
            // 切り口の蓋（硬い稜）
            for (const [i, sgn] of [[0, -1], [n - 1, 1]]) {
                const sec = secAt(i), f = fr[i], p = path[i];
                const wn = vsc(f.T, sgn);
                const c = geo.v(p[0], p[1], p[2], wn[0], wn[1], wn[2], 0.5, 0.5, col(i, { a: 0, b: 0, cap: true }, wn, f));
                const ids = [];
                for (let k = 0; k < K; k++) {
                    const s = sec[k];
                    const wp = vadd(p, vadd(vsc(f.N, s.a), vsc(f.B, s.b)));
                    ids.push(geo.v(wp[0], wp[1], wp[2], wn[0], wn[1], wn[2], 0, 0, col(i, { a: s.a, b: s.b, cap: true }, wn, f)));
                }
                for (let k = 0; k < K; k++) geo.t(c, ids[k], ids[(k + 1) % K]);
            }
        }
        return fr;
    }

    // 掃引した具の sdf（断面を箱とみなす）
    function sweepSdf(path, fr, haAt, hbAt, closed) {
        const n = path.length;
        let c = [0, 0, 0];
        for (const p of path) c = vadd(c, p);
        c = vsc(c, 1 / n);
        let rad = 0;
        for (const p of path) rad = Math.max(rad, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
        rad += Math.max(haAt(0), hbAt(0)) + 0.1;
        const sdf = (x, y, z) => {
            let best = 1e9, bi = 0;
            for (let i = 0; i < n; i++) {
                const p = path[i];
                const d = (x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - p[2]) ** 2;
                if (d < best) { best = d; bi = i; }
            }
            const p = path[bi], f = fr[bi];
            const d = [x - p[0], y - p[1], z - p[2]];
            const a = Math.abs(vdot(d, f.N)) - haAt(bi), b = Math.abs(vdot(d, f.B)) - hbAt(bi);
            let t = -1e9;
            if (!closed && (bi === 0 || bi === n - 1)) t = vdot(d, f.T) * (bi === 0 ? -1 : 1);
            return Math.max(a, b, t);
        };
        return { c, rad, sdf };
    }

    // ---- ウィンナー ----------------------------------------------------
    // 円柱を平行な2枚の斜めの面で切った形。k = 切り口の傾き（0 なら輪切り）
    //   斜め薄切り: k ≒ 2.2 で切り口は長さ 5cm 近い楕円（参考写真2）
    //   輪切り    : k ≒ 0.25（参考写真3）
    function buildWiener(geo, o, F, k, r, halfW, seed) {
        const rng = new Rng(seed);
        const sq = Math.sqrt(1 + k * k), halfL = halfW * sq;
        const skin = [0.760, 0.300, 0.140], sear = [0.520, 0.180, 0.075];
        const meat = [0.890, 0.560, 0.440], sauce = [0.830, 0.400, 0.180], seared = [0.640, 0.290, 0.150];
        const cover = rng.range(0.30, 0.75);
        const W = (lx, ly, lz) => vadd(o, vadd(vsc(F.X, lx), vadd(vsc(F.Y, ly), vsc(F.Z, lz))));
        const Wn = (lx, ly, lz) => vadd(vsc(F.X, lx), vadd(vsc(F.Y, ly), vsc(F.Z, lz)));
        const NA = 40, NL = 9;
        const bev = 0.05 * r;
        const rAt = (th) => r * (1 + 0.018 * (Noise.v2(Math.cos(th) * 2 + 3, Math.sin(th) * 2, seed) - 0.5));
        const skinCol = (th, f) => {
            const n = Noise.fbm2(Math.cos(th) * 1.6 + f * 2.0, Math.sin(th) * 1.6 + 7, seed + 3, 3);
            const sc = Noise.fbm2(Math.cos(th) * 3.1 + f * 4.0, Math.sin(th) * 3.1 - 5, seed + 4, 3);
            // 皮の上にもソースが斑に絡む
            return lin3(mix3(mix3(skin, sear, smooth(0.45, 0.80, n) * 0.85), [0.860, 0.440, 0.190], 0.55 * smooth(0.45, 0.70, sc)));
        };
        // 側面。端の 1 段は半径を少し落として面取り（硬い稜線のままだと
        // 切り口の縁が紙を切ったように薄く見える）
        const fs = [0, 0.035, 0.12, 0.3, 0.5, 0.7, 0.88, 0.965, 1];
        const side = [];
        for (let a = 0; a <= NA; a++) {
            const th = a / NA * TAU, ct = Math.cos(th), st = Math.sin(th);
            const ra = rAt(th);
            const col = [];
            for (let j = 0; j < fs.length; j++) {
                const f = fs[j];
                const edge = (j === 0 || j === fs.length - 1) ? bev : 0;
                const rr = ra - edge;
                const ly = rr * ct, lz = rr * st;
                const lx = mix(-halfL + k * ly, halfL + k * ly, f);
                const p = W(lx, ly, lz);
                const sg = (j === 0) ? -1 : (j === fs.length - 1 ? 1 : 0);
                const nn = Wn(sg * 0.55, ct, st);
                col.push(geo.v(p[0], p[1], p[2], nn[0], nn[1], nn[2], a / NA, f, skinCol(th, f)));
            }
            side.push(col);
        }
        for (let a = 0; a < NA; a++) for (let j = 0; j < fs.length - 1; j++)
            geo.q(side[a][j], side[a][j + 1], side[a + 1][j + 1], side[a + 1][j]);
        // 切り口
        for (const sg of [-1, 1]) {
            const nn = Wn(sg, -sg * k, 0);
            const RS = [0, 0.3, 0.6, 0.82, 0.93, 1.0];
            const rings = [];
            for (let i = 0; i < RS.length; i++) {
                const ids = [];
                for (let a = 0; a <= NA; a++) {
                    const th = a / NA * TAU;
                    const rr = (rAt(th) - bev) * RS[i];
                    const ly = rr * Math.cos(th), lz = rr * Math.sin(th);
                    const lx = sg * halfL + k * ly;
                    const p = W(lx, ly, lz);
                    // 切り口の色: 肉のピンクにソースが絡み、皮の際は赤い輪
                    const n = Noise.fbm2(ly * 2.4 + sg * 9, lz * 2.4 * sq, seed + 11, 4);
                    let c = mix3(meat, sauce, clamp(cover + 0.8 * (n - 0.5), 0, 1));
                    c = mix3(c, seared, smooth(0.55, 1.0, RS[i]) * 0.7 + 0.25 * smooth(0.6, 0.85, n));
                    if (RS[i] > 0.95) c = mix3(c, skin, 0.75);
                    ids.push(geo.v(p[0], p[1], p[2], nn[0], nn[1], nn[2], 0.5 + ly * 0.2, 0.5 + lz * 0.2, lin3(c)));
                }
                rings.push(ids);
            }
            for (let i = 0; i < RS.length - 1; i++) for (let a = 0; a < NA; a++)
                geo.q(rings[i][a], rings[i + 1][a], rings[i + 1][a + 1], rings[i][a + 1]);
        }
        // sdf: 円柱 ∩ 2枚の面の間
        const sdf = (x, y, z) => {
            const d = [x - o[0], y - o[1], z - o[2]];
            const lx = vdot(d, F.X), ly = vdot(d, F.Y), lz = vdot(d, F.Z);
            const dc = Math.hypot(ly, lz) - r;
            const ds = Math.abs(lx - k * ly) / sq - halfW;
            return Math.max(dc, ds);
        };
        return { c: o, rad: Math.hypot(r * sq, halfW) + 0.2, sdf };
    }

    // ---- マッシュルームの薄切り -------------------------------------------
    // 傘＋軸のシルエット。扇の中心 (0,-0.15) から見て星形なので扇で張れる
    function mushOutline(sc) {
        const ctl = [[0.40, -1.10], [0.47, -0.45], [0.58, -0.16], [1.08, -0.12], [1.50, 0.02],
            [1.58, 0.42], [1.30, 0.86], [0.70, 1.12], [0, 1.18], [-0.70, 1.12], [-1.30, 0.86],
            [-1.58, 0.42], [-1.50, 0.02], [-1.08, -0.12], [-0.58, -0.16], [-0.47, -0.45], [-0.40, -1.10], [0, -1.16]];
        const n = ctl.length, out = [];
        const S = 6;
        for (let i = 0; i < n; i++) {
            const p0 = ctl[(i - 1 + n) % n], p1 = ctl[i], p2 = ctl[(i + 1) % n], p3 = ctl[(i + 2) % n];
            for (let s = 0; s < S; s++) {
                const t = s / S, t2 = t * t, t3 = t2 * t;
                const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
                out.push([f(p0[0], p1[0], p2[0], p3[0]) * sc, f(p0[1], p1[1], p2[1], p3[1]) * sc]);
            }
        }
        return out;
    }
    function buildMush(geo, o, F, sc, th, seed) {
        const ol = mushOutline(sc);
        const n = ol.length, ctr = [0, -0.15 * sc];
        const W = (lx, ly, lz) => vadd(o, vadd(vsc(F.X, lx), vadd(vsc(F.Z, ly), vsc(F.Y, lz))));
        const flesh = [0.860, 0.740, 0.580], sauce = [0.800, 0.520, 0.300], skin = [0.560, 0.420, 0.300];
        const colAt = (x, y, onRim) => {
            const nn = Noise.fbm2(x * 3 + seed % 97, y * 3, seed, 3);
            let c = mix3(flesh, sauce, clamp(0.35 + 0.9 * (nn - 0.5), 0, 1));
            if (onRim && y > -0.05 * sc && Math.abs(x) > 0.5 * sc * 0) c = mix3(c, skin, 0.8);
            return lin3(c);
        };
        // 面（±）
        for (const sg of [-1, 1]) {
            const nn = vsc(F.Y, sg);
            const cp = W(ctr[0], ctr[1], sg * th);
            const c = geo.v(cp[0], cp[1], cp[2], nn[0], nn[1], nn[2], 0.5, 0.5, colAt(ctr[0], ctr[1], false));
            const mid = [], rim = [];
            for (let i = 0; i < n; i++) {
                const [x, y] = ol[i];
                const mx = mix(ctr[0], x, 0.88), my = mix(ctr[1], y, 0.88);
                const pm = W(mx, my, sg * th), pr = W(x, y, sg * th);
                mid.push(geo.v(pm[0], pm[1], pm[2], nn[0], nn[1], nn[2], 0, 0, colAt(mx, my, false)));
                // 傘の縁だけ茶色い皮が線になって残る
                rim.push(geo.v(pr[0], pr[1], pr[2], nn[0], nn[1], nn[2], 0, 0, colAt(x, y, y > 0.0)));
            }
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                geo.t(c, mid[i], mid[j]);
                geo.q(mid[i], rim[i], rim[j], mid[j]);
            }
        }
        // 側面
        const ids = [];
        for (let i = 0; i <= n; i++) {
            const a = ol[(i - 1 + n) % n], p = ol[i % n], b = ol[(i + 1) % n];
            const t = vnorm([b[0] - a[0], b[1] - a[1], 0]);
            // 外向き = 接線を -90°（反時計回りの輪郭）
            const nx = t[1], ny = -t[0];
            const wn = vadd(vsc(F.X, nx), vsc(F.Z, ny));
            const pa = W(p[0], p[1], -th), pb = W(p[0], p[1], th);
            const c = colAt(p[0], p[1], p[1] > 0);
            ids.push([geo.v(pa[0], pa[1], pa[2], wn[0], wn[1], wn[2], 0, 0, c), geo.v(pb[0], pb[1], pb[2], wn[0], wn[1], wn[2], 1, 0, c)]);
        }
        for (let i = 0; i < n; i++) geo.q(ids[i][0], ids[i][1], ids[i + 1][1], ids[i + 1][0]);
        // sdf: 板 ∩ 輪郭（中心からの極座標で近似）
        const polar = new Float32Array(256);
        for (let a = 0; a < 256; a++) {
            const ang = a / 256 * TAU, dx = Math.cos(ang), dy = Math.sin(ang);
            let best = 0;
            for (let i = 0; i < n; i++) {
                const vx = ol[i][0] - ctr[0], vy = ol[i][1] - ctr[1];
                const r = Math.hypot(vx, vy);
                if ((vx * dx + vy * dy) / r > 0.995) best = Math.max(best, r);
            }
            polar[a] = best || 0.5 * sc;
        }
        const sdf = (x, y, z) => {
            const d = [x - o[0], y - o[1], z - o[2]];
            const lx = vdot(d, F.X) - ctr[0], ly = vdot(d, F.Z) - ctr[1], lz = vdot(d, F.Y);
            let ang = Math.atan2(ly, lx); if (ang < 0) ang += TAU;
            const rr = polar[Math.floor(ang / TAU * 256) & 255];
            return Math.max(Math.abs(lz) - th, Math.hypot(lx, ly) - rr);
        };
        return { c: o, rad: 1.7 * sc + 0.2, sdf };
    }

    // ---- 具をまとめて置く -----------------------------------------------
    function buildToppings(scene, M, T, seed) {
        const rng = new Rng(seed ^ 0x70991);
        const obst = [];
        const geos = { wiener: new Geo(8000), pepper: new Geo(8000), onion: new Geo(8000), mush: new Geo(4000) };
        // 置く順番: 大きい物から。位置は黄金角で回し、重なったら引き直す
        const list = [];
        for (let i = 0; i < T.wiener; i++) list.push("wiener");
        for (let i = 0; i < T.mush; i++) list.push("mush");
        for (let i = 0; i < T.pepper; i++) list.push("pepper");
        for (let i = 0; i < T.onion; i++) list.push("onion");
        const placed = [];
        const total = Math.max(1, list.length);
        const rot0 = rng.range(0, TAU);
        function pickSpot(idx, footR) {
            for (let tries = 0; tries < 40; tries++) {
                const q = (idx + 0.5 + tries * 0.37) / total;
                const rr = Math.sqrt(q % 1) * 0.80 * G.moundR * (tries > 20 ? 0.9 : 1) + rng.range(-0.6, 0.6);
                const a = rot0 + (idx + tries * 3) * 2.39996 + rng.range(-0.3, 0.3);
                const x = G.cx + Math.cos(a) * rr, z = G.cz + Math.sin(a) * rr;
                if (M.local(x, z).u > 0.82) continue;
                let ok = true;
                for (const p of placed) {
                    if (Math.hypot(p[0] - x, p[1] - z) < (p[2] + footR) * 0.62) { ok = false; break; }
                }
                if (ok || tries === 39) { placed.push([x, z, footR]); return [x, z]; }
            }
        }
        // 表面に沿った経路（ピーマン細切り・玉ねぎ）
        function surfPath(x0, z0, len, head, curv, lift, nPts) {
            const pts = [], ups = [];
            let x = x0 - Math.cos(head) * len / 2, z = z0 - Math.sin(head) * len / 2, h = head;
            // 中心合わせのため先に半分戻る（曲率は無視した近似）
            const ds = len / (nPts - 1);
            for (let i = 0; i < nPts; i++) {
                const n = M.normal(x, z);
                pts.push([x + n[0] * lift, M.env(x, z) + n[1] * lift - 0.0, z + n[2] * lift]);
                ups.push(n);
                h += curv * ds;
                x += Math.cos(h) * ds; z += Math.sin(h) * ds;
            }
            return { pts, ups };
        }
        // 【対策】細く暗い緑だと「ネギ」に見えた。幅を 6〜8mm に広げ、皮の緑を少し明るく
        const S_GREEN = [0.215, 0.430, 0.095], S_GREEN2 = [0.160, 0.350, 0.070];
        // 【対策】内側の果肉を淡い黄緑にすると、裏返った細切りが「プラスチックの棒」に見えた。
        //         炒めたピーマンは内側も半透明の濃い緑
        const P_FLESH = [0.360, 0.540, 0.170], P_CUT = [0.470, 0.620, 0.240];
        const SAUCE_T = [0.780, 0.430, 0.150];

        for (let idx = 0; idx < list.length; idx++) {
            const kind = list[idx];
            const s = seed + idx * 7919;
            if (kind === "wiener") {
                const diag = T.wienerCut === "diag";
                const r = rng.range(0.80, 0.88);
                const k = diag ? rng.range(1.6, 2.1) : rng.range(0.05, 0.30);
                const halfW = diag ? rng.range(0.30, 0.36) : rng.range(0.26, 0.32);
                const foot = diag ? r * Math.sqrt(1 + k * k) : r;
                const [x, z] = pickSpot(idx, foot);
                const n = M.normal(x, z);
                // 切り口を上に向けて寝かせる。ただし麺の山の上で平らには
                // ならないので 15〜40° 傾ける
                const tiltAx = [Math.cos(rng.range(0, TAU)), 0, Math.sin(rng.range(0, TAU))];
                // 【対策】山の斜面の法線そのままに傾けると、裾の物が立ち上がって
                //         「刺さった」ように見える。鉛直と斜面の中間に寝かせる
                const up = rotAxis(vnorm(vadd(n, [0, 1.2, 0])), tiltAx, rng.range(0.05, 0.30) * (rng.next() < 0.5 ? -1 : 1));
                const hint = [Math.cos(rng.range(0, TAU)), 0, Math.sin(rng.range(0, TAU))];
                // ウィンナーの局所系: X = 軸, Y ≒ 切り口の法線の主成分
                const Bs = basis(up, hint);
                // 切り口の法線 (∓1, ±k, 0)/√(1+k²) が up を向くよう、軸を傾ける
                const ang = Math.atan2(1, k);
                const F = { X: rotAxis(Bs.X, Bs.Z, -ang), Y: rotAxis(Bs.Y, Bs.Z, -ang), Z: Bs.Z };
                const o = [x, M.env(x, z) - 0.06, z];
                obst.push(buildWiener(geos.wiener, o, F, k, r, halfW, s));
            } else if (kind === "mush") {
                const sc = rng.range(0.72, 0.86);
                const [x, z] = pickSpot(idx, 1.4 * sc);
                const n = M.normal(x, z);
                const up = rotAxis(n, [Math.cos(rng.range(0, TAU)), 0, Math.sin(rng.range(0, TAU))], rng.range(0.15, 0.55));
                const F = basis(up, [Math.cos(rng.range(0, TAU)), 0, Math.sin(rng.range(0, TAU))]);
                const o = [x, M.env(x, z) + 0.02, z];
                obst.push(buildMush(geos.mush, o, F, sc, 0.17, s));
            } else if (kind === "pepper" && T.pepperCut === "ring") {
                const R0 = rng.range(1.75, 2.15);
                const [x, z] = pickSpot(idx, R0);
                const n = M.normal(x, z);
                const up = rotAxis(n, [Math.cos(rng.range(0, TAU)), 0, Math.sin(rng.range(0, TAU))], rng.range(0.2, 0.6));
                const F = basis(up, [1, 0, 0]);
                const o = [x, M.env(x, z) + 0.05, z];
                const lobes = rng.next() < 0.5 ? 3 : 4, lph = rng.range(0, TAU);
                const NP = 72, pts = [], ups = [];
                for (let i = 0; i < NP; i++) {
                    const a = i / NP * TAU;
                    // ピーマンの断面は 3〜4 の稜を持つ丸みのある多角形
                    const rr = R0 * (1 + 0.11 * Math.cos(lobes * a + lph) + 0.03 * Math.cos(2 * a + lph * 2));
                    pts.push(vadd(o, vadd(vsc(F.X, Math.cos(a) * rr), vsc(F.Z, Math.sin(a) * rr))));
                    ups.push(F.Y);
                }
                const ha = rng.range(0.24, 0.32), hb = 0.11;
                const sec = secRect(ha, hb, 0, 4);
                const fr = sweep(geos.pepper, pts, ups, () => sec, (i, sp, wn, f) => {
                    const out = f ? vdot(f.B, vsub(pts[i], o)) > 0 : true;
                    const isSkin = sp.cap ? false : ((sp.b > 0) === out) && Math.abs(sp.b) > hb * 0.55;
                    const nn = Noise.v2(i * 0.3, sp.a * 9, s);
                    let c = isSkin ? mix3(S_GREEN, S_GREEN2, nn) : (Math.abs(sp.a) > ha * 0.8 ? P_CUT : P_FLESH);
                    c = mix3(c, SAUCE_T, 0.18 * smooth(0.5, 0.9, Noise.v2(i * 0.15, 3, s + 5)));
                    return lin3(c);
                }, true);
                obst.push(sweepSdf(pts, fr, () => ha, () => hb, true));
            } else {
                // 細切りのピーマン / 玉ねぎ
                const isP = kind === "pepper";
                const len = isP ? rng.range(3.0, 4.4) : rng.range(2.6, 4.0);
                const [x, z] = pickSpot(idx, len * 0.45);
                const head = rng.range(0, TAU);
                const curv = isP ? (rng.next() < 0.5 ? -1 : 1) * rng.range(0.22, 0.42) : (rng.next() < 0.5 ? -1 : 1) * rng.range(0.30, 0.45);
                const ha = isP ? 0.095 : 0.055, hb = isP ? rng.range(0.30, 0.38) : rng.range(0.22, 0.32);
                const nP = 26;
                const sp = surfPath(x, z, len, head, curv, isP ? 0.0 : -0.04, nP);
                const skinUp = rng.next() < 0.8;
                // 断面は点ごとに幅を変える（玉ねぎは端が細る）
                const secs = [], wid = [];
                for (let i = 0; i < nP; i++) {
                    const t = i / (nP - 1);
                    const w = isP ? hb : hb * (0.55 + 0.45 * Math.pow(Math.sin(Math.PI * t), 0.5));
                    secs.push(secRect(ha, w, isP ? 0.55 : 0.30, 4)); wid.push(w);
                }
                const ups = skinUp ? sp.ups : sp.ups.map((u) => vsc(u, -1));
                const col = isP
                    ? (i, q, wn) => {
                        const isSkin = q.cap ? false : q.a > ha * 0.5;
                        const nn = Noise.v2(i * 0.3, q.b * 6, s);
                        let c = isSkin ? mix3(S_GREEN, S_GREEN2, nn) : (q.a < -ha * 0.5 ? P_FLESH : P_CUT);
                        c = mix3(c, SAUCE_T, 0.20 * smooth(0.45, 0.85, Noise.v2(i * 0.18, q.b * 2, s + 5)));
                        return lin3(c);
                    }
                    : (i, q, wn) => {
                        // 玉ねぎ: 透けた淡黄色にソースの橙が染みる。縁ほど濃い
                        const nn = Noise.fbm2(i * 0.25, q.b * 5, s, 3);
                        // 炒めた玉ねぎはしんなりして半透明。白く残すと「もやし」に見える
                        // 【対策】赤寄りにするとウィンナーの皮と紛れる。琥珀〜飴色の黄寄りに置く
                        let c = mix3([0.910, 0.760, 0.480], [0.870, 0.560, 0.250], clamp(0.40 + 0.9 * (nn - 0.4), 0, 1));
                        if (q.cap || Math.abs(q.b) > 0.85 * wid[i]) c = mix3(c, [0.850, 0.520, 0.230], 0.35);
                        return lin3(c);
                    };
                const fr = sweep(geos[kind], sp.pts, ups, (i) => secs[i], col, false);
                obst.push(sweepSdf(sp.pts, fr, () => ha, (i) => wid[i], false));
            }
        }
        const meshes = {};
        // 材質
        const mk = (name, rough, cc, ccr, extra) => {
            const m = new BABYLON.PBRMaterial(name, scene);
            m.albedoColor = new BABYLON.Color3(1, 1, 1);
            m.metallic = 0; m.roughness = rough;
            m.clearCoat.isEnabled = cc > 0;
            m.clearCoat.intensity = cc; m.clearCoat.roughness = ccr;
            if (extra) extra(m);
            return m;
        };
        const mats = {
            wiener: mk("wienerMat", 0.52, 0.50, 0.30, (m) => {
                // 肉の断面はわずかに光を通す（縁が赤く見える）
                m.subSurface.isTranslucencyEnabled = true;
                m.subSurface.translucencyIntensity = 0.18;
                m.subSurface.tintColor = new BABYLON.Color3(1.0, 0.35, 0.25);
                m.subSurface.minimumThickness = 0.1; m.subSurface.maximumThickness = 2.0;
            }),
            // ピーマンの皮は強いつや。粗さを下げるより clearCoat で鋭い反射を足す
            pepper: mk("pepperMat", 0.30, 0.9, 0.10),
            onion: mk("onionMat", 0.28, 0.6, 0.18, (m) => {
                m.subSurface.isTranslucencyEnabled = true;
                m.subSurface.translucencyIntensity = 0.45;
                m.subSurface.tintColor = new BABYLON.Color3(1.0, 0.75, 0.40);
                m.subSurface.minimumThickness = 0.05; m.subSurface.maximumThickness = 0.3;
            }),
            mush: mk("mushMat", 0.52, 0.35, 0.30)
        };
        for (const k in geos) {
            if (geos[k].nv === 0) continue;
            meshes[k] = geos[k].mesh("topping_" + k, scene);
            meshes[k].material = mats[k];
            meshes[k].receiveShadows = true;
        }
        return { meshes, mats, obst };
    }

    // =================================================================
    // 5. Fork : フォーク
    // =================================================================
    // 局所系: x = 先端(0) → 柄尻(19.5), y = 面の法線, z = 幅。
    // 側面から見ると歯先が反り上がり、首で下がって柄が持ち上がる
    const FORK_L = 19.5;
    const forkBend = monoSpline([0, 1.5, 3.5, 5.5, 8.0, 12.0, FORK_L], [0.50, 0.26, 0.07, 0.0, 0.12, 0.48, 1.10]);
    const TINE_Z = [-0.90, -0.30, 0.30, 0.90];
    const TINE_HB = 0.145, TINE_HA = 0.095, TINE_L = 4.30;
    const headHB = monoSpline([4.0, 4.6, 5.4, 6.2], [1.06, 0.98, 0.62, 0.40]);
    const handleHB = monoSpline([6.0, 9.0, 14.0, 17.2, 18.6, FORK_L], [0.40, 0.48, 0.70, 0.82, 0.74, 0.30]);
    const handleHA = (x) => mix(0.13, 0.19, smooth(6.0, 16.0, x)) * (x > 18.8 ? mix(1, 0.6, (x - 18.8) / 0.7) : 1);

    function forkPose(M, seed) {
        const rng = new Rng(seed ^ 0xF0F0);
        // 巻き取った麺の中心。盛りの右手前の上、頂から 3.5cm ほど持ち上げる
        const tx = G.cx + 2.0 + rng.range(-0.4, 0.4), tz = G.cz - 1.2 + rng.range(-0.4, 0.4);
        const top = M.env(G.cx, G.cz);
        const C = [tx, top + 3.4, tz];
        // 柄は右奥の上へ抜ける（参考写真3, 4）
        const X = vnorm([0.60 + rng.range(-0.08, 0.08), 0.70, 0.38 + rng.range(-0.08, 0.08)]);
        let Y = vnorm(vsub([0, 1, 0], vsc(X, vdot([0, 1, 0], X))));
        // 面を少しカメラへ倒す（巻いた麺の楕円が見えるように）
        Y = rotAxis(Y, X, rng.range(-0.55, -0.25));
        const Z = vcross(X, Y);
        const twX = 1.65;                 // 巻きの中心（先端からの距離）
        const O = vsub(C, vsc(X, twX));   // 先端
        return { O, X, Y, Z, C, twX };
    }
    const toWorld = (F, lx, ly, lz) => [F.O[0] + F.X[0] * lx + F.Y[0] * ly + F.Z[0] * lz,
        F.O[1] + F.X[1] * lx + F.Y[1] * ly + F.Z[1] * lz,
        F.O[2] + F.X[2] * lx + F.Y[2] * ly + F.Z[2] * lz];

    function buildFork(scene, F) {
        const geo = new Geo(6000);
        const w = [1, 1, 1];
        const ups = (n) => { const a = []; for (let i = 0; i < n; i++) a.push([0, 1, 0]); return a; };
        // 局所座標で掃引し、最後に姿勢を与える
        // 歯
        for (const zc of TINE_Z) {
            const n = 16, path = [];
            for (let i = 0; i < n; i++) {
                const x = TINE_L * Math.pow(i / (n - 1), 1.3) + 0.0;
                path.push([x, forkBend(x), zc * (1 - 0.04 * (1 - x / TINE_L))]);
            }
            sweep(geo, path, ups(n), (i) => {
                const t = i / (n - 1);
                // 先端は丸く細る
                const k = t < 0.08 ? mix(0.45, 1, t / 0.08) : 1;
                return secRect(TINE_HA * mix(0.75, 1, t) * k, TINE_HB * mix(0.72, 1, t) * k, 0, 3);
            }, () => w, false);
        }
        // 頭（歯の付け根から首へ）
        {
            const n = 14, path = [];
            for (let i = 0; i < n; i++) { const x = mix(3.95, 6.3, i / (n - 1)); path.push([x, forkBend(x), 0]); }
            sweep(geo, path, ups(n), (i) => secRect(0.105, headHB(path[i][0]), 0, 10), () => w, false);
        }
        // 柄
        {
            const n = 44, path = [];
            for (let i = 0; i < n; i++) { const x = mix(6.1, FORK_L, i / (n - 1)); path.push([x, forkBend(x), 0]); }
            sweep(geo, path, ups(n), (i) => {
                const x = path[i][0];
                return secRect(handleHA(x), handleHB(x), -0.05, 8);
            }, () => w, false);
        }
        const mesh = geo.mesh("fork", scene);
        mesh.rotationQuaternion = BABYLON.Quaternion.RotationQuaternionFromAxis(
            new V3(F.X[0], F.X[1], F.X[2]), new V3(F.Y[0], F.Y[1], F.Y[2]), new V3(F.Z[0], F.Z[1], F.Z[2]));
        mesh.position = new V3(F.O[0], F.O[1], F.O[2]);
        const m = new BABYLON.PBRMaterial("forkMat", scene);
        // 18-8 ステンレス。粗さ 0.05 の鏡にすると「安いクロムメッキ」になる
        m.albedoColor = new BABYLON.Color3(0.560, 0.570, 0.577);
        m.metallic = 1.0; m.roughness = 0.17;
        m.environmentIntensity = 1.5;
        mesh.material = m;
        return mesh;
    }

    // フォークの sdf（歯・頭・柄を箱の和で近似）
    function forkSdf(F) {
        const sdf = (x, y, z) => {
            const d = [x - F.O[0], y - F.O[1], z - F.O[2]];
            const lx = vdot(d, F.X), lz = vdot(d, F.Z);
            const ly = vdot(d, F.Y) - forkBend(clamp(lx, 0, FORK_L));
            let best = 1e9;
            if (lx < TINE_L + 0.5) {
                let dz = 1e9;
                for (const zc of TINE_Z) dz = Math.min(dz, Math.abs(lz - zc) - TINE_HB);
                best = Math.max(Math.abs(ly) - TINE_HA, dz, -lx, lx - TINE_L);
            }
            if (lx > 3.5 && lx < 7) best = Math.min(best, Math.max(Math.abs(ly) - 0.105, Math.abs(lz) - headHB(lx), 3.95 - lx, lx - 6.3));
            if (lx > 5.8) best = Math.min(best, Math.max(Math.abs(ly) - handleHA(lx), Math.abs(lz) - handleHB(lx), 6.1 - lx, lx - FORK_L));
            return best;
        };
        const c = toWorld(F, 3.0, 0, 0);
        return { c, rad: 4.5, sdf, fork: true };
    }

    // =================================================================
    // 6. Strands : 麺の経路
    // =================================================================
    // 盛りの麺は「包絡面の少し下」を歩かせる。歩き方は2通り:
    //   ・渦: 盛りの中心まわりの接線方向へ舵を切る。トングで寄せた山は
    //         麺が同じ向きに巻いているので、これが無いとただの乱麻になる
    //   ・乱: 曲率だけを滑らかに揺らす。渦の上に交差する麺
    // 深さ d も経路に沿って揺らす。浮いたり潜ったりすることで「編まれた」
    // 見えになる（押し合いはそのあとの Relax でやる）
    function strandR() { return G.noodleD * MM * 0.5; }

    function moundStrands(M, seed, count) {
        const R = strandR();
        const out = [];
        const g = new Rng(seed ^ 0x5A5A);
        const spin = g.next() < 0.5 ? 1 : -1;
        // 【対策】1本ずつ独立に曲率を振ると、半径 1cm 前後の細かい巻きが
        //         全面に出て「かた焼きそば」か「カダイフ」になる。実物の
        //         スパゲッティは 3〜6 本が平行に揃った束で、半径 3〜8cm の
        //         ゆるい弧を描く。束の芯の経路を1本歩かせ、束の中の麺は
        //         芯から横へずらして並べる
        let s = 0, b = 0;
        while (s < count) {
            const rng = new Rng(seed + b * 7919 + 13);
            b++;
            const u0 = Math.sqrt(rng.next()) * 0.93, a0 = rng.range(0, TAU);
            const Rt = M.radiusAt(a0);
            let x = G.cx + Math.cos(a0) * Rt * u0, z = G.cz + Math.sin(a0) * Rt * u0;
            const swirl = rng.next() < 0.62;
            const dir = rng.next() < 0.80 ? spin : -spin;
            let h = swirl ? a0 + dir * Math.PI / 2 + rng.gauss(0, 0.30) : rng.range(0, TAU);
            const L = rng.range(16, 30);
            const n = Math.max(8, Math.round(L / G.step));
            const d0 = Math.pow(rng.next(), 1.4) * (G.coreDepth - R * 1.6);
            const ko = rng.range(0, 1000), dO = rng.range(0, 1000);
            const kAmp = swirl ? rng.range(0.08, 0.22) : rng.range(0.15, 0.36);
            // 束の本数: 1〜6（2〜4 が多い）
            const m = Math.min(count - s, [1, 2, 2, 3, 3, 3, 4, 4, 5, 6][rng.int(10)]);
            // 芯の経路
            const cx = [], cz = [], hd = [], dd = [];
            for (let i = 0; i < n; i++) {
                const sArc = i * G.step;
                const L2 = M.local(x, z);
                cx.push(x); cz.push(z); hd.push(h);
                dd.push(clamp(d0 + 0.20 * (fbm1(sArc * 0.20 + dO, seed + 3, 2) - 0.5) * 2, -0.03, G.coreDepth - R));
                let k = kAmp * (fbm1(sArc * 0.12 + ko, seed + 1, 2) - 0.5) * 2;
                const tang = Math.atan2(z - G.cz, x - G.cx) + dir * Math.PI / 2;
                let want = null, gain = 0;
                if (swirl) { want = tang; gain = 0.16; }
                // 縁へ出かけたら内側へ回り込む（山の裾は弧を描いて折り返す）
                if (L2.u > 0.78) { want = tang + dir * 0.55; gain = Math.max(gain, 0.85 * smooth(0.78, 0.97, L2.u)); }
                if (want !== null) {
                    let dh = want - h;
                    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
                    k += gain * dh;
                }
                h += k * G.step;
                x += Math.cos(h) * G.step; z += Math.sin(h) * G.step;
                // 【対策】裾から外へ出した麺の端が放射状に毛羽立って見えた
                if (L2.u > 0.99) break;
            }
            const nc = cx.length;
            if (nc < 8) continue;
            const gap = 2 * R * 1.10;
            for (let j = 0; j < m; j++) {
                const rj = new Rng(seed + b * 131 + j * 977);
                const off0 = (j - (m - 1) / 2) * gap;
                // 束はところどころでほどける。端ほどずれが大きい
                const dO2 = rj.range(0, 999), amp = rj.range(0.05, 0.45);
                // 長さも揃えない（束の中で始点と終点をずらす）
                const i0 = Math.floor(rj.range(0, 0.25) * nc), i1 = nc - Math.floor(rj.range(0, 0.25) * nc);
                const pts = [];
                for (let i = i0; i < i1; i++) {
                    const t = i / (nc - 1);
                    const spread = amp * (0.35 + 0.65 * Math.abs(t - 0.5) * 2);
                    const off = off0 + spread * (fbm1(i * G.step * 0.18 + dO2, seed + 5, 2) - 0.5) * 2;
                    const px = cx[i] - Math.sin(hd[i]) * off, pz = cz[i] + Math.cos(hd[i]) * off;
                    const env = M.env(px, pz), pt = plateTopY(Math.hypot(px, pz));
                    const d = dd[i] + (j % 2) * R * 0.6;
                    pts.push(px, Math.max(pt + R, env - R - d), pz);
                }
                const np = pts.length / 3;
                if (np < 6) continue;
                out.push({ pts: Float32Array.from(pts), n: np, free: new Uint8Array(np), tone: rng.range(-0.10, 0.10) + rj.range(-0.05, 0.05), seed: seed + s * 31 });
                s++;
            }
        }
        return out;
    }

    // フォークに巻いた麺。巻き → 垂れ → 盛りへ着地 → 少し這う
    // 【対策】全部を同じ軸・同じ半径刻みで巻くと、ばねのコイルに見えた。
    //         1本ごとに巻きの面を傾け（交差させる）、半径にゆがみを入れる。
    //         巻きから離れるのは必ず下側から（重力で垂れる所）
    function twirlStrands(M, F, seed, count) {
        const R = strandR();
        const out = [];
        const g = new Rng(seed ^ 0x7417);
        // 垂れた麺が着地する場所。3か所に寄せると束になって垂れる
        const anchors = [];
        for (let k = 0; k < 3; k++) {
            const a = g.range(0, TAU), r = g.range(0.6, 2.4);
            anchors.push([F.C[0] + Math.cos(a) * r, F.C[2] + Math.sin(a) * r]);
        }
        // 局所系で見た「真下」の角度
        const dy = vdot([0, -1, 0], F.Y), dz = vdot([0, -1, 0], F.Z);
        for (let s = 0; s < count; s++) {
            const rng = new Rng(seed + 50021 + s * 104729);
            const layer = s % 7;
            const rho = 0.19 + layer * 0.13 + rng.range(0, 0.05);
            const ry = rho + 0.07, rz = rho + 0.98;     // 平たい歯を包むので楕円になる
            const thB = Math.atan2(dz / rz, dy / ry);   // 楕円上の最下点
            const xa = rng.range(0.55, 2.75);
            const pitch = rng.range(-0.30, 0.30);
            const tilt = rng.range(-0.45, 0.45), tph = rng.range(0, TAU);
            const wph = rng.range(0, TAU);
            // 始点も終点も最下点の近く。巻き数は 1〜2 周
            const th0 = thB + rng.range(-0.5, 0.5);
            const turns = Math.round(rng.range(1, 2.4)) + rng.range(-0.12, 0.12);
            const P = [];
            const per = (ry + rz) * Math.PI;
            const nh = Math.max(6, Math.round(turns * per / G.step));
            for (let i = 0; i <= nh; i++) {
                const t = i / nh, th = th0 + t * turns * TAU;
                const w = 1 + 0.07 * Math.sin(2 * th + wph);
                const lx = xa + pitch * t * turns + tilt * Math.sin(th + tph);
                P.push(toWorld(F, lx, forkBend(clamp(lx, 0, 4)) + ry * w * Math.cos(th), rz * w * Math.sin(th)));
            }
            const hang = (from, prev, back) => {
                const T = vnorm(vsub(from, prev));
                const an = anchors[rng.int(3)];
                const ang = rng.range(0, TAU), rr = rng.range(0.1, 0.7);
                const lx = an[0] + Math.cos(ang) * rr, lz = an[1] + Math.sin(ang) * rr;
                const ly = M.env(lx, lz) - R;
                const b0 = from, b1 = vadd(from, vadd(vsc(T, 0.5), [0, -0.6, 0]));
                const b3 = [lx, ly, lz], b2 = [lx + T[0] * 0.3, ly + rng.range(1.0, 1.8), lz + T[2] * 0.3];
                const len = Math.hypot(b3[0] - b0[0], b3[1] - b0[1], b3[2] - b0[2]) * 1.2;
                const nb = Math.max(6, Math.round(len / G.step));
                const seg = [];
                for (let i = 1; i <= nb; i++) {
                    const t = i / nb, u = 1 - t;
                    seg.push([u * u * u * b0[0] + 3 * u * u * t * b1[0] + 3 * u * t * t * b2[0] + t * t * t * b3[0],
                        u * u * u * b0[1] + 3 * u * u * t * b1[1] + 3 * u * t * t * b2[1] + t * t * t * b3[1],
                        u * u * u * b0[2] + 3 * u * u * t * b1[2] + 3 * u * t * t * b2[2] + t * t * t * b3[2]]);
                }
                // 着地後に盛りの上を這う
                const e = seg[seg.length - 1], e0 = seg[seg.length - 2];
                let h = Math.atan2(e[2] - e0[2], e[0] - e0[0]);
                let x = e[0], z = e[2];
                const crawl = Math.round(rng.range(3, 9) / G.step), ko = rng.range(0, 99);
                for (let i = 0; i < crawl; i++) {
                    h += 0.4 * (fbm1(i * G.step * 0.2 + ko, seed + 7, 2) - 0.5) * 2 * G.step;
                    x += Math.cos(h) * G.step; z += Math.sin(h) * G.step;
                    if (M.local(x, z).u > 0.97) break;
                    seg.push([x, Math.max(plateTopY(Math.hypot(x, z)) + R, M.env(x, z) - R - 0.03), z]);
                }
                const fl = seg.map((q, i) => i < nb ? 1 : 0);
                return back ? { seg: seg.reverse(), fl: fl.reverse() } : { seg, fl };
            };
            let pts = P.slice(), fr = P.map(() => 1);
            if (rng.next() < 0.75) {
                const tail = hang(P[P.length - 1], P[P.length - 2], false);
                pts = pts.concat(tail.seg); fr = fr.concat(tail.fl);
            }
            if (rng.next() < 0.45) {
                const head = hang(P[0], P[1], true);
                pts = head.seg.concat(pts); fr = head.fl.concat(fr);
            }
            const arr = new Float32Array(pts.length * 3);
            pts.forEach((p, i) => { arr[i * 3] = p[0]; arr[i * 3 + 1] = p[1]; arr[i * 3 + 2] = p[2]; });
            out.push({ pts: arr, n: pts.length, free: Uint8Array.from(fr), tone: rng.range(-0.10, 0.10), seed: seed + 9000 + s * 31, twirl: true, rho });
        }
        return out;
    }

    // =================================================================
    // 7. Relax : 押し合い（位置ベースの緩和）
    // =================================================================
    // 経路を置いただけでは、交差する麺が互いを貫通する。管が溶け合った
    // 交差は一目で CG に見えるので、
    //   重力で少し沈める → 麺どうし・具・フォークと押し合う → 床（芯と皿）で
    //   止める → 経路に沿ってならす
    // を数回まわして上下関係を決める。物理エンジンは使わない（数万点の
    // 細い管は剛体の組では解けない）
    function relax(strands, M, obst, iters) {
        const R = strandR(), D = 2 * R * 1.02;
        let P = 0;
        for (const s of strands) P += s.n;
        const X = new Float32Array(P), Y = new Float32Array(P), Z = new Float32Array(P);
        const sid = new Int32Array(P), pix = new Int32Array(P), fre = new Uint8Array(P);
        const first = [];
        let k = 0;
        strands.forEach((s, si) => {
            first.push(k);
            for (let i = 0; i < s.n; i++, k++) {
                X[k] = s.pts[i * 3]; Y[k] = s.pts[i * 3 + 1]; Z[k] = s.pts[i * 3 + 2];
                sid[k] = si; pix[k] = i; fre[k] = s.free[i];
            }
        });
        // 空間ハッシュ（連結リスト）
        const HB = 1 << 17, mask = HB - 1;
        const head = new Int32Array(HB), next = new Int32Array(P);
        const cs = D * 1.05;
        const key = (ix, iy, iz) => ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & mask;
        // 床: 芯の上面と皿の上面
        const floorY = new Float32Array(P);
        const refreshFloor = () => {
            for (let i = 0; i < P; i++) {
                const pt = plateTopY(Math.hypot(X[i], Z[i]));
                const h = M.height(X[i], Z[i]);
                floorY[i] = (h > 0 ? Math.max(pt, M.env(X[i], Z[i]) - G.coreDepth) : pt) + R;
            }
        };
        let pushes = 0;
        for (let it = 0; it < iters; it++) {
            // 1) 重力（巻きと垂れは除く）
            for (let i = 0; i < P; i++) if (!fre[i]) Y[i] -= 0.035;
            // 2) 麺どうし
            head.fill(-1);
            for (let i = 0; i < P; i++) {
                const h = key(Math.floor(X[i] / cs), Math.floor(Y[i] / cs), Math.floor(Z[i] / cs));
                next[i] = head[h]; head[h] = i;
            }
            for (let i = 0; i < P; i++) {
                const ix = Math.floor(X[i] / cs), iy = Math.floor(Y[i] / cs), iz = Math.floor(Z[i] / cs);
                for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
                    for (let j = head[key(ix + a, iy + b, iz + c)]; j >= 0; j = next[j]) {
                        if (j <= i) continue;
                        if (sid[j] === sid[i] && Math.abs(pix[j] - pix[i]) < 4) continue;
                        const dx = X[i] - X[j], dy = Y[i] - Y[j], dz = Z[i] - Z[j];
                        const d2 = dx * dx + dy * dy + dz * dz;
                        if (d2 >= D * D) continue;
                        const d = Math.sqrt(d2);
                        let nx, ny, nz;
                        if (d < 1e-5) { nx = 0; ny = 1; nz = 0; } else { nx = dx / d; ny = dy / d; nz = dz / d; }
                        // 【対策】ほぼ水平に並んだ点どうしを横へ押すと、麺の束が
                        //         ばらけて扇形に広がる。積み重なりは上下で解く
                        ny += (ny >= 0 ? 0.6 : -0.6);
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const corr = (D - d) * 0.5;
                        const wi = fre[i] ? 0.5 : 1, wj = fre[j] ? 0.5 : 1;
                        X[i] += nx * corr * wi; Y[i] += ny * corr * wi; Z[i] += nz * corr * wi;
                        X[j] -= nx * corr * wj; Y[j] -= ny * corr * wj; Z[j] -= nz * corr * wj;
                        pushes++;
                    }
                }
            }
            // 3) 具・フォーク
            for (const o of obst) {
                const r2 = (o.rad + R) * (o.rad + R);
                for (let i = 0; i < P; i++) {
                    const dx = X[i] - o.c[0], dy = Y[i] - o.c[1], dz = Z[i] - o.c[2];
                    if (dx * dx + dy * dy + dz * dz > r2) continue;
                    const sd = o.sdf(X[i], Y[i], Z[i]);
                    const want = R + 0.008;
                    if (sd >= want) continue;
                    const e = 0.02;
                    let gx = o.sdf(X[i] + e, Y[i], Z[i]) - o.sdf(X[i] - e, Y[i], Z[i]);
                    let gy = o.sdf(X[i], Y[i] + e, Z[i]) - o.sdf(X[i], Y[i] - e, Z[i]);
                    let gz = o.sdf(X[i], Y[i], Z[i] + e) - o.sdf(X[i], Y[i], Z[i] - e);
                    // 【対策】具の下へ押し込むと床と喧嘩して震える。盛りの麺は
                    //         「かぶさる」か「脇を通る」だけにする
                    if (!fre[i] && !o.fork && gy < 0) gy = 0;
                    const l = Math.hypot(gx, gy, gz) || 1;
                    const m = (want - sd) * (fre[i] ? 0.8 : 1);
                    X[i] += gx / l * m; Y[i] += gy / l * m; Z[i] += gz / l * m;
                }
            }
            // 4) 床
            if ((it & 1) === 0) refreshFloor();
            for (let i = 0; i < P; i++) if (!fre[i] && Y[i] < floorY[i]) Y[i] = floorY[i];
            // 5) 経路に沿ってならす（折れ角を消す）
            strands.forEach((s, si) => {
                const b = first[si];
                for (let i = 1; i < s.n - 1; i++) {
                    const q = b + i;
                    const lam = fre[q] ? 0.15 : 0.35;
                    X[q] += lam * ((X[q - 1] + X[q + 1]) * 0.5 - X[q]);
                    Y[q] += lam * ((Y[q - 1] + Y[q + 1]) * 0.5 - Y[q]);
                    Z[q] += lam * ((Z[q - 1] + Z[q + 1]) * 0.5 - Z[q]);
                }
            });
        }
        // 書き戻し
        strands.forEach((s, si) => {
            const b = first[si];
            for (let i = 0; i < s.n; i++) {
                s.pts[i * 3] = X[b + i]; s.pts[i * 3 + 1] = Y[b + i]; s.pts[i * 3 + 2] = Z[b + i];
            }
        });
        return { X, Y, Z, sid, fre, P, first, pushes };
    }

    // ---- 遮蔽 ----------------------------------------------------------
    // 麺の色の暗がりは3つの積:
    //   ・包絡面からの深さ（下の層ほど光が届かない）
    //   ・真上にかぶさっている麺の本数
    //   ・具の際（具の下や脇は暗い）
    function computeAO(st, strands, M, obst) {
        const { X, Y, Z, P, fre } = st;
        const R = strandR();
        const ao = new Float32Array(P);
        const cs = 0.42, HB = 1 << 16, mask = HB - 1;
        const head = new Int32Array(HB).fill(-1), next = new Int32Array(P);
        const key = (ix, iy, iz) => ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & mask;
        for (let i = 0; i < P; i++) {
            const h = key(Math.floor(X[i] / cs), Math.floor(Y[i] / cs), Math.floor(Z[i] / cs));
            next[i] = head[h]; head[h] = i;
        }
        for (let i = 0; i < P; i++) {
            const ix = Math.floor(X[i] / cs), iy = Math.floor(Y[i] / cs), iz = Math.floor(Z[i] / cs);
            let occ = 0;
            for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let b = 0; b <= 1; b++) {
                for (let j = head[key(ix + a, iy + b, iz + c)]; j >= 0; j = next[j]) {
                    const dy = Y[j] - Y[i];
                    if (dy < R * 0.8 || dy > 0.7) continue;
                    const dh = Math.hypot(X[j] - X[i], Z[j] - Z[i]);
                    if (dh > 0.40) continue;
                    occ += (1 - dh / 0.40) * (1 - dy / 0.7);
                }
            }
            let a = Math.exp(-0.17 * occ);
            if (!fre[i]) {
                const depth = M.env(X[i], Z[i]) - (Y[i] + R);
                a *= 1 - 0.42 * smooth(0.03, 0.45, depth);
                // 皿との接地
                const gap = Y[i] - R - plateTopY(Math.hypot(X[i], Z[i]));
                a *= mix(0.70, 1, smooth(0.0, 0.35, gap));
            }
            ao[i] = a;
        }
        // 具の際
        for (const o of obst) {
            if (o.fork) continue;
            const r2 = (o.rad + 0.6) ** 2;
            for (let i = 0; i < P; i++) {
                const dx = X[i] - o.c[0], dy = Y[i] - o.c[1], dz = Z[i] - o.c[2];
                if (dx * dx + dy * dy + dz * dz > r2) continue;
                const sd = o.sdf(X[i], Y[i], Z[i]);
                // 具より下にある麺だけ暗くする（上にかぶさった麺は明るい）
                if (Y[i] < o.c[1] + 0.1) ao[i] *= mix(0.55, 1, smooth(R, 0.55, sd));
            }
        }
        // 巻いた麺は内側の層ほど暗い
        strands.forEach((s, si) => {
            if (!s.twirl) return;
            const b = st.first[si];
            for (let i = 0; i < s.n; i++) if (fre[b + i]) ao[b + i] *= mix(0.55, 1.0, smooth(0.2, 1.05, s.rho));
        });
        return ao;
    }

    // =================================================================
    // 8. Pasta mesh : 管の掃引と色
    // =================================================================
    // 管の向きは回転最小化フレーム（二重反射法）で運ぶ。フレネ標準形だと
    // 変曲点で枠がひっくり返り、管がねじれて縞が走る
    function pastaTextures(scene, seed) {
        // u = 麺の長さ方向（4cm 周期）, v = 周方向
        const W = 512, H = 64;
        const hf = new Float32Array(W * H), coat = new Float32Array(W * H * 2);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const u = x / W, v = y / H;
            // 表面のざらつき（セモリナの粒）とソースの粒
            const g = Noise.fbm2p(u * 160, v * 16, 160, 16, seed + 1, 2);
            const lump = Noise.fbm2p(u * 24, v * 4, 24, 4, seed + 2, 3);
            hf[y * W + x] = g * 0.6 + smooth(0.55, 0.75, lump) * 0.8;
            // 油の膜は長さ方向に途切れ途切れ
            const oil = Noise.fbm2p(u * 12, v * 2, 12, 2, seed + 3, 3);
            coat[(y * W + x) * 2] = clamp(0.45 + 1.1 * (oil - 0.45), 0.25, 1);
            coat[(y * W + x) * 2 + 1] = clamp(0.95 - 1.0 * (oil - 0.4), 0.35, 1);
        }
        const normal = TexLab.normalFromHeight("pastaNrm", W, H, hf, 1.6, scene);
        const coatTex = TexLab._tex("pastaCoat", W, H, (d) => {
            for (let i = 0; i < W * H; i++) {
                d[i * 4] = coat[i * 2] * 255; d[i * 4 + 1] = coat[i * 2 + 1] * 255; d[i * 4 + 2] = 0; d[i * 4 + 3] = 255;
            }
        }, scene, true);
        return { normal, coat: coatTex };
    }

    function pastaMaterial(scene, S, tex) {
        const m = new BABYLON.PBRMaterial("pastaMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0;
        m.roughness = S.rough;
        m.bumpTexture = tex.normal;
        m.bumpTexture.level = 0.30;
        // 【対策】clearCoat を一様にすると「濡れたプラスチック」になる。
        //         油膜の途切れをテクスチャで散らす（R=被覆, G=粗さ）
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = tex.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        m.clearCoat.intensity = 0.70 * S.gloss;
        m.clearCoat.roughness = 0.26;
        m.clearCoat.indexOfRefraction = 1.47;
        // 茹でた麺は少し光を通す。逆光で縁がオレンジに光るのはこれ
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.30;
        m.subSurface.tintColor = new BABYLON.Color3(1.0, 0.55, 0.20);
        m.subSurface.minimumThickness = 0.05;
        m.subSurface.maximumThickness = 0.25;
        return m;
    }

    function strandColor(S, s, sArc, tone) {
        // ソースの絡みのむら。長さ 2〜6cm の周期で濃淡が来る
        let cov = S.cover + tone + 0.95 * (fbm1(sArc * 0.42, s.seed, 3) - 0.5);
        cov = clamp(cov, 0, 1);
        let c = cov < 0.5 ? mix3(S.pale, S.base, cov * 2) : mix3(S.base, S.thick, (cov - 0.5) * 2);
        if (S.charAmt > 0) {
            const ch = n1(sArc * 1.1 + 40, s.seed + 9);
            c = mix3(c, S.char, S.charAmt * smooth(0.74, 0.92, ch));
        }
        return lin3(c);
    }

    function buildPasta(scene, strands, st, ao, S, mat) {
        const R = strandR(), NS = G.sides;
        let nv = 0, nt = 0;
        for (const s of strands) { nv += (s.n + 4) * (NS + 1) + 2; nt += (s.n + 3) * NS * 2 + NS * 2; }
        const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = new Float32Array(nv * 4);
        const I = new Uint32Array(nt * 3);
        let v = 0, t = 0;
        const cosT = [], sinT = [];
        for (let k = 0; k <= NS; k++) { cosT.push(Math.cos(k / NS * TAU)); sinT.push(Math.sin(k / NS * TAU)); }
        const put = (x, y, z, nx, ny, nz, u, w, c, sh) => {
            P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
            N[v * 3] = nx; N[v * 3 + 1] = ny; N[v * 3 + 2] = nz;
            U[v * 2] = u; U[v * 2 + 1] = w;
            // 管の下面は隣の麺に塞がれて暗い
            const k = sh * (1 - 0.22 * Math.max(0, -ny));
            C[v * 4] = c[0] * k; C[v * 4 + 1] = c[1] * k; C[v * 4 + 2] = c[2] * k; C[v * 4 + 3] = 1;
            return v++;
        };
        strands.forEach((s, si) => {
            const n = s.n, p = s.pts, b0 = st.first[si];
            const rr = R * (1 + 0.04 * (Noise._h2(si, 3, 77) - 0.5));
            // 接線
            const T = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
                let tx = p[b * 3] - p[a * 3], ty = p[b * 3 + 1] - p[a * 3 + 1], tz = p[b * 3 + 2] - p[a * 3 + 2];
                const l = Math.hypot(tx, ty, tz) || 1;
                T[i * 3] = tx / l; T[i * 3 + 1] = ty / l; T[i * 3 + 2] = tz / l;
            }
            // 初期の法線: 接線に直交する任意の向き
            let r = Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
            let d0 = vdot(r, [T[0], T[1], T[2]]);
            r = vnorm([r[0] - T[0] * d0, r[1] - T[1] * d0, r[2] - T[2] * d0]);
            const ring = (i, nr, cx, cy, cz, rad, sArc, ext) => {
                const t = [T[i * 3], T[i * 3 + 1], T[i * 3 + 2]];
                const bb = vcross(t, nr);
                const c = strandColor(S, s, sArc, s.tone);
                const sh = ao[b0 + i];
                const base = v;
                for (let k = 0; k <= NS; k++) {
                    const nx = nr[0] * cosT[k] + bb[0] * sinT[k], ny = nr[1] * cosT[k] + bb[1] * sinT[k], nz = nr[2] * cosT[k] + bb[2] * sinT[k];
                    const ex = ext || 0;
                    const fx = nx * (1 - Math.abs(ex)) + t[0] * ex, fy = ny * (1 - Math.abs(ex)) + t[1] * ex, fz = nz * (1 - Math.abs(ex)) + t[2] * ex;
                    const l = Math.hypot(fx, fy, fz) || 1;
                    put(cx + nx * rad, cy + ny * rad, cz + nz * rad, fx / l, fy / l, fz / l, sArc / 4.0, k / NS, c, sh);
                }
                return base;
            };
            const rings = [];
            let sArc = 0;
            // 始端の蓋（少し細らせて丸める）
            {
                const tx = T[0], ty = T[1], tz = T[2];
                const ap = put(p[0] - tx * rr * 0.55, p[1] - ty * rr * 0.55, p[2] - tz * rr * 0.55, -tx, -ty, -tz, 0, 0,
                    strandColor(S, s, 0, s.tone), ao[b0]);
                rings.push({ apex: ap });
                rings.push({ base: ring(0, r, p[0] - tx * rr * 0.30, p[1] - ty * rr * 0.30, p[2] - tz * rr * 0.30, rr * 0.72, 0, -0.6) });
            }
            for (let i = 0; i < n; i++) {
                if (i > 0) {
                    // 二重反射で法線を運ぶ
                    const v1 = [p[i * 3] - p[(i - 1) * 3], p[i * 3 + 1] - p[(i - 1) * 3 + 1], p[i * 3 + 2] - p[(i - 1) * 3 + 2]];
                    const c1 = vdot(v1, v1) || 1e-9;
                    const tL = [T[(i - 1) * 3], T[(i - 1) * 3 + 1], T[(i - 1) * 3 + 2]];
                    const rL = vsub(r, vsc(v1, 2 * vdot(v1, r) / c1));
                    const tLL = vsub(tL, vsc(v1, 2 * vdot(v1, tL) / c1));
                    const t2 = [T[i * 3], T[i * 3 + 1], T[i * 3 + 2]];
                    const v2 = vsub(t2, tLL);
                    const c2 = vdot(v2, v2) || 1e-9;
                    r = vnorm(vsub(rL, vsc(v2, 2 * vdot(v2, rL) / c2)));
                    sArc += Math.sqrt(c1);
                }
                rings.push({ base: ring(i, r, p[i * 3], p[i * 3 + 1], p[i * 3 + 2], rr, sArc, 0) });
            }
            // 終端の蓋
            {
                const i = n - 1, tx = T[i * 3], ty = T[i * 3 + 1], tz = T[i * 3 + 2];
                rings.push({ base: ring(i, r, p[i * 3] + tx * rr * 0.30, p[i * 3 + 1] + ty * rr * 0.30, p[i * 3 + 2] + tz * rr * 0.30, rr * 0.72, sArc, 0.6) });
                const ap = put(p[i * 3] + tx * rr * 0.55, p[i * 3 + 1] + ty * rr * 0.55, p[i * 3 + 2] + tz * rr * 0.55, tx, ty, tz, 0, 0,
                    strandColor(S, s, sArc, s.tone), ao[b0 + i]);
                rings.push({ apex: ap });
            }
            // 面を張る
            for (let j = 1; j < rings.length - 2; j++) {
                const A = rings[j].base, B = rings[j + 1].base;
                for (let k = 0; k < NS; k++) {
                    I[t++] = A + k; I[t++] = A + k + 1; I[t++] = B + k + 1;
                    I[t++] = A + k; I[t++] = B + k + 1; I[t++] = B + k;
                }
            }
            const a0 = rings[0].apex, f0 = rings[1].base;
            for (let k = 0; k < NS; k++) { I[t++] = a0; I[t++] = f0 + k + 1; I[t++] = f0 + k; }
            const a1 = rings[rings.length - 1].apex, f1 = rings[rings.length - 2].base;
            for (let k = 0; k < NS; k++) { I[t++] = a1; I[t++] = f1 + k; I[t++] = f1 + k + 1; }
        });
        const Ps = P.subarray(0, v * 3), Ns = N.subarray(0, v * 3), Is = I.subarray(0, t);
        orient(Ps, Is, Ns);
        const mesh = named(new BABYLON.Mesh("pasta", scene), "pasta");
        const vd = new BABYLON.VertexData();
        vd.positions = Ps; vd.normals = Ns; vd.indices = Is;
        vd.uvs = U.subarray(0, v * 2); vd.colors = C.subarray(0, v * 4);
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.tris = t / 3;
        return mesh;
    }

    // ---- 粉チーズ / パセリ -----------------------------------------------
    function buildFlakes(scene, strands, st, M, kind, count, seed) {
        const rng = new Rng(seed ^ (kind === "cheese" ? 0xC4EE5E : 0x9A851E));
        const R = strandR();
        // 包絡面に近い（＝上から見える）点だけを候補にする
        const cand = [];
        for (let i = 0; i < st.P; i++) {
            if (st.fre[i]) continue;
            const depth = M.env(st.X[i], st.Z[i]) - (st.Y[i] + R);
            if (depth < 0.10 && M.local(st.X[i], st.Z[i]).u < 0.9) cand.push(i);
        }
        if (!cand.length) return null;
        let base;
        if (kind === "cheese") {
            base = BABYLON.MeshBuilder.CreateIcoSphere("cheeseBase", { radius: 0.045, subdivisions: 1, flat: true }, scene);
        } else {
            base = BABYLON.MeshBuilder.CreateDisc("parsleyBase", { radius: 0.09, tessellation: 5, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
        }
        named(base, kind === "cheese" ? "cheese" : "parsley");
        const mats = new Float32Array(count * 16);
        const q = new BABYLON.Quaternion(), mm = new BABYLON.Matrix();
        for (let c = 0; c < count; c++) {
            const i = cand[rng.int(cand.length)];
            const sc = rng.range(0.6, 1.5);
            BABYLON.Quaternion.FromEulerAnglesToRef(
                kind === "cheese" ? rng.range(0, TAU) : Math.PI / 2 + rng.range(-0.5, 0.5),
                rng.range(0, TAU), rng.range(0, TAU), q);
            BABYLON.Matrix.ComposeToRef(new V3(sc, sc * (kind === "cheese" ? rng.range(0.5, 1) : 1), sc), q,
                new V3(st.X[i] + rng.range(-0.08, 0.08), st.Y[i] + R * 0.85, st.Z[i] + rng.range(-0.08, 0.08)), mm);
            mm.copyToArray(mats, c * 16);
        }
        base.thinInstanceSetBuffer("matrix", mats, 16, true);
        const m = new BABYLON.PBRMaterial(kind + "Mat", scene);
        m.metallic = 0;
        if (kind === "cheese") { m.albedoColor = col3([0.930, 0.880, 0.720]); m.roughness = 0.85; }
        else { m.albedoColor = col3([0.180, 0.420, 0.120]); m.roughness = 0.55; m.backFaceCulling = false; }
        base.material = m;
        base.receiveShadows = true;
        return base;
    }

    // =================================================================
    // 9. Scene
    // =================================================================
    // ---- テーブルクロス --------------------------------------------------
    // 24cm 周期のタイル。縞は経糸方向に走り、平織りの凹凸を高さ場1枚で持つ。
    // 【対策】アルベドと法線を別のノイズで作ると糸の位置がずれる。高さ場を共有
    function clothTextures(scene, Cl, seed) {
        const N = 1024, PER = 24;
        let sum = 0;
        for (const s of Cl.stripes) sum += s[0];
        const rep = Math.max(1, Math.round(PER / sum)), scale = PER / (rep * sum);
        const edges = [];
        let acc = 0;
        for (let r = 0; r < rep; r++) for (const s of Cl.stripes) { edges.push([acc, acc + s[0] * scale, lin3(s[1])]); acc += s[0] * scale; }
        const H = new Float32Array(N * N), A = new Float32Array(N * N * 3);
        const pitch = PER / 240;   // 糸 0.1cm。周期内に整数本入れないと継ぎ目が出る
        for (let y = 0; y < N; y++) {
            const cy = y / N * PER;
            for (let x = 0; x < N; x++) {
                const cx = x / N * PER;
                // 縞（境目は 1px ぶんだけぼかす）
                let ci = 0;
                for (let e = 0; e < edges.length; e++) if (cx >= edges[e][0] && cx < edges[e][1]) { ci = e; break; }
                const c = edges[ci][2];
                // 平織り: 経糸と緯糸が交互に上下する
                const wx = cx / pitch, wy = cy / pitch;
                const ix = Math.floor(wx), iy = Math.floor(wy);
                const fx = wx - ix, fy = wy - iy;
                const over = ((ix + iy) & 1) === 0;
                const warp = Math.sin(Math.PI * fx), weft = Math.sin(Math.PI * fy);
                let h = over ? warp * (0.6 + 0.4 * weft) : weft * (0.6 + 0.4 * warp);
                // リブ（縞ごとの畝）
                if (Cl.rib > 0.5) h += Cl.rib * 0.9 * (0.5 + 0.5 * Math.cos(TAU * (cx - edges[ci][0]) / (edges[ci][1] - edges[ci][0]) - Math.PI));
                // 大きなしわ
                h += 2.2 * (Noise.fbm2p(cx / PER * 3, cy / PER * 3, 3, 3, seed + 5, 3) - 0.5);
                H[y * N + x] = h;
                const tn = 0.94 + 0.10 * Noise.v2p(ix * 0.7, iy * 0.7, 168, 168, seed + 1) + 0.05 * (h - 0.5);
                A[(y * N + x) * 3] = c[0] * tn; A[(y * N + x) * 3 + 1] = c[1] * tn; A[(y * N + x) * 3 + 2] = c[2] * tn;
            }
        }
        const albedo = TexLab._tex("clothAlb", N, N, (d) => {
            for (let i = 0; i < N * N; i++) {
                d[i * 4] = l2s(Math.min(1, A[i * 3])) * 255; d[i * 4 + 1] = l2s(Math.min(1, A[i * 3 + 1])) * 255;
                d[i * 4 + 2] = l2s(Math.min(1, A[i * 3 + 2])) * 255; d[i * 4 + 3] = 255;
            }
        }, scene, false);
        const normal = TexLab.normalFromHeight("clothNrm", N, N, H, 0.9, scene);
        return { albedo, normal };
    }

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.30, 0.30, 0.30, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    // 【対策】IBL の無彩色成分が全体に乗ると、麺の橙が白っぽく褪せる
    scene.environmentIntensity = 0.62;
    env.lodGenerationOffset = 0.20;

    // 料理写真は 85〜100mm 相当の望遠。距離を伸ばして fov を絞る
    const camera = new BABYLON.ArcRotateCamera("cam", -1.66, 0.96, 64, new V3(0.2, 2.6, 0.2), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 3.2;
    camera.fov = 0.36;
    // 【対策】maxZ 既定(10000) のままだと深度の分解能が足りず、
    //         細い麺の前後がちらつく。DOF の錯乱円も潰れる
    camera.minZ = 8.0;
    camera.maxZ = 320;
    camera.lowerRadiusLimit = 18;
    camera.upperRadiusLimit = 180;
    camera.upperBetaLimit = 1.48;
    scene.cameraToUseForPointers = camera;

    // ---- 灯 ----------------------------------------------------------
    // 料理写真の定石: 左奥の上からのキー（逆光気味）、反対からの弱いフィル、
    // 拡散をほぼ 0 にして鏡面だけ足すキック（麺の稜線に走る照り担当）
    const key = new BABYLON.DirectionalLight("key", new V3(0.42, -0.86, -0.36).normalize(), scene);
    key.position = new V3(-18, 36, 16);
    key.intensity = 2.75;
    key.diffuse = new BABYLON.Color3(1.0, 0.972, 0.934);
    key.autoUpdateExtends = false;
    key.orthoLeft = -24; key.orthoRight = 24;
    key.orthoBottom = -24; key.orthoTop = 24;
    key.shadowMinZ = 1; key.shadowMaxZ = 90;

    const kick = new BABYLON.DirectionalLight("kick", new V3(-0.45, -0.40, -1.0).normalize(), scene);
    kick.intensity = 1.45;
    kick.diffuse = new BABYLON.Color3(0.05, 0.048, 0.044);
    kick.specular = new BABYLON.Color3(1.0, 0.965, 0.905);

    const fill = new BABYLON.HemisphericLight("fill", new V3(0.25, 1, -0.4), scene);
    fill.intensity = 0.22;
    fill.diffuse = new BABYLON.Color3(0.98, 0.98, 1.0);
    fill.groundColor = new BABYLON.Color3(0.33, 0.30, 0.27);
    fill.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    // 【対策】ESM は cm スケールの細い麺で痣が出る。PCF のほうが早くきれい
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0030;
    sg.normalBias = 0.010;
    sg.setDarkness(0.30);

    // ---- テーブル -----------------------------------------------------
    const table = named(BABYLON.MeshBuilder.CreateGround("table", { width: 240, height: 240 }, scene), "table");
    const tableMat = new BABYLON.PBRMaterial("tableMat", scene);
    tableMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    tableMat.metallic = 0;
    // 布は光沢がなく、縁で白く毛羽立って光る（sheen）
    tableMat.sheen.isEnabled = true;
    tableMat.sheen.intensity = 0.35;
    tableMat.sheen.color = new BABYLON.Color3(1, 1, 1);
    tableMat.sheen.roughness = 0.6;
    table.material = tableMat;
    table.receiveShadows = true;
    let clothTex = null;
    function applyCloth(k, seed) {
        if (clothTex) { clothTex.albedo.dispose(); clothTex.normal.dispose(); }
        clothTex = clothTextures(scene, CLOTHS[k], seed);
        tableMat.albedoTexture = clothTex.albedo;
        tableMat.bumpTexture = clothTex.normal;
        tableMat.bumpTexture.level = 0.55;
        tableMat.roughness = CLOTHS[k].rough;
        for (const t of [clothTex.albedo, clothTex.normal]) { t.uScale = 10; t.vScale = 10; t.wAng = 0.32; }
    }

    // ---- 湯気 ---------------------------------------------------------
    function makeSteamTexture() {
        const N = 128;
        return TexLab._tex("steam", N, N, (d) => {
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
                const r = Math.hypot(u, v);
                // 【対策】単純な放射状グラデーションだと光の玉（ホタル）に見える
                const n = Noise.fbm2p(x / N * 6, y / N * 6, 6, 6, 4242, 3);
                const a = clamp((1 - smooth(0.15, 1.0, r)) * (0.35 + 0.9 * n), 0, 1);
                const i = (y * N + x) * 4;
                d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = a * 255;
            }
        }, scene, false, true);
    }
    const steamTex = makeSteamTexture();
    steamTex.hasAlpha = true;
    const steam = new BABYLON.ParticleSystem("steam", 200, scene);
    steam.particleTexture = steamTex;
    steam.emitter = new V3(G.cx, G.wellY + G.peak * 0.8, G.cz);
    steam.minEmitBox = new V3(-4.0, 0, -3.5);
    steam.maxEmitBox = new V3(4.0, 0.5, 3.5);
    steam.color1 = new BABYLON.Color4(1, 1, 1, 0.050);
    steam.color2 = new BABYLON.Color4(1, 0.985, 0.96, 0.028);
    steam.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    steam.minSize = 2.2; steam.maxSize = 7.0;
    steam.minLifeTime = 1.4; steam.maxLifeTime = 3.2;
    steam.emitRate = 36;
    steam.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    steam.gravity = new V3(0, 2.6, 0);
    steam.direction1 = new V3(-0.7, 3.2, -0.4);
    steam.direction2 = new V3(0.9, 5.0, 0.5);
    steam.minAngularSpeed = -0.5; steam.maxAngularSpeed = 0.5;
    steam.minEmitPower = 0.5; steam.maxEmitPower = 1.5;
    steam.updateSpeed = 0.012;

    // =================================================================
    // 10. Build
    // =================================================================
    let curSauce = "kissa", curPlate = "orange", curCloth = "pastel", curTop = "kissa";
    let curSeed = 0x0A9011;
    let state = null, onRebuilt = null;
    let pastaTex = null;

    function disposeState(st) {
        if (!st) return;
        // 麺の法線・油膜テクスチャは使い回すので、材質は textures を残して捨てる
        for (const m of st.meshes) if (m) {
            sg.removeShadowCaster(m);
            const mat = m.material;
            m.dispose(false, false);
            if (mat) mat.dispose(false, false);
        }
        for (const t of st.textures) if (t) t.dispose();
    }

    function build() {
        const t0 = performance.now();
        disposeState(state);
        const S = SAUCE[curSauce];
        const M = makeMound(curSeed);
        const st = { meshes: [], textures: [], t: {} };
        let tm = performance.now();
        const lap = (k) => { const n = performance.now(); st.t[k] = Math.round(n - tm); tm = n; };

        const plate = buildPlate(scene, PLATES[curPlate], curSeed, M.edge);
        st.meshes.push(plate.mesh); st.textures.push(plate.tex.albedo, plate.tex.orm);
        lap("plate");
        const core = buildCore(scene, M, S, curSeed);
        st.meshes.push(core);
        const tops = buildToppings(scene, M, TOPPINGS[curTop], curSeed);
        for (const k in tops.meshes) st.meshes.push(tops.meshes[k]);
        lap("toppings");
        const obst = tops.obst.slice();
        let F = null;
        if (G.fork) {
            F = forkPose(M, curSeed);
            const fork = buildFork(scene, F);
            st.meshes.push(fork);
            obst.push(forkSdf(F));
        }
        // 麺
        const strands = moundStrands(M, curSeed, G.strands);
        if (F) for (const s of twirlStrands(M, F, curSeed, 52)) strands.push(s);
        lap("paths");
        const rx = relax(strands, M, obst, G.relaxIters);
        lap("relax");
        const ao = computeAO(rx, strands, M, tops.obst);
        lap("ao");
        if (!pastaTex) pastaTex = pastaTextures(scene, 2718);
        const pmat = pastaMaterial(scene, S, pastaTex);
        const pasta = buildPasta(scene, strands, rx, ao, S, pmat);
        st.meshes.push(pasta);
        lap("mesh");
        if (G.cheese) st.meshes.push(buildFlakes(scene, strands, rx, M, "cheese", 900, curSeed));
        if (G.parsley) st.meshes.push(buildFlakes(scene, strands, rx, M, "parsley", 260, curSeed));

        for (const m of st.meshes) if (m && m.name !== "plate") sg.addShadowCaster(m);
        sg.addShadowCaster(plate.mesh);
        st.pasta = pasta; st.strands = strands.length; st.points = rx.P; st.pushes = rx.pushes;
        st.ms = Math.round(performance.now() - t0);
        state = st;
        if (onRebuilt) onRebuilt(st);
        return st;
    }

    // =================================================================
    //  ポストプロセス
    // =================================================================
    if (GLOBAL.useSSAO) {
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        // 【対策】半径を麺の太さまで詰めると、麺という麺に黒い縁がついて
        //         墨で描いたようになる。束と束の間の大きい陰りだけを拾わせる
        ssao.radius = 0.9;
        ssao.totalStrength = 0.55;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 240;
        ssao.minZAspect = 0.25;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.92;
    dp.bloomWeight = 0.12;
    dp.bloomKernel = 40;
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
    ip.exposure = 1.30;
    ip.contrast = 1.18;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.2;
    ip.vignetteCameraFov = 0.72;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    scene.onBeforeRenderObservable.add(() => {
        if (dp.depthOfFieldEnabled) {
            // 【対策】Babylon の錯乱円は「シーン単位 × 1000 = mm」。焦点距離を
            //         合焦距離の一定比にすると、寄っても引いてもボケ量が変わらない
            const focus = camera.radius * 1000;
            dp.depthOfField.focusDistance = focus;
            dp.depthOfField.focalLength = focus * GLOBAL.dofRatio;
        }
    });

    // =================================================================
    // 11. GUI
    // =================================================================
    // 【対策】フルスクリーン GUI に Bloom / DOF が乗らないよう、
    //         Layer.applyPostProcess = false で UI をポストプロセスの外へ出す
    const GUI_MASK = 0x20000000;
    if (GLOBAL.guiOwnCamera) {
        const guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -60), scene);
        guiCam.layerMask = GUI_MASK;
        scene.activeCameras = [camera, guiCam];
        scene.onAfterRenderObservable.add(() => { scene.activeCamera = camera; });
    } else {
        scene.activeCameras = [camera];
    }
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (ui.layer) {
        if (GLOBAL.guiOwnCamera) ui.layer.layerMask = GUI_MASK;
        else ui.layer.applyPostProcess = false;
    }
    // 【対策】GUI のサイズはレンダー解像度基準（≒ CSS px × DPR）
    ui.idealWidth = 1400;
    ui.renderAtIdealSize = true;

    const COL = { idle: "#2c2723", active: "#a5482a", edge: "#4b443c", text: "#f5ece0", sub: "#aca295", accent: "#f2b07a" };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "262px"; card.height = "90%";
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(18,16,14,0.84)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "16px";
    ui.addControl(card);
    const sv = new BABYLON.GUI.ScrollViewer("sv");
    sv.thickness = 0; sv.barSize = 10; sv.barColor = COL.edge; sv.barBackground = "rgba(0,0,0,0)";
    sv.wheelPrecision = 0.02;
    card.addControl(sv);
    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "226px"; panel.isVertical = true;
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
        b.height = "31px"; b.paddingBottom = "5px";
        b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 13;
        b.onPointerUpObservable.add(onClick);
        panel.addControl(b);
        return b;
    }
    function addSlider(labelText, min, max, value, fmt, onChange, onCommit) {
        const lb = addLabel(labelText + "  " + fmt(value), 13, COL.accent, "22px");
        const s = new BABYLON.GUI.Slider(labelText);
        s.minimum = min; s.maximum = max; s.value = value;
        s.height = "18px"; s.width = "212px"; s.paddingBottom = "8px";
        s.color = COL.accent; s.background = "#3a332b"; s.borderColor = "transparent";
        s.onValueChangedObservable.add((v) => { lb.text = labelText + "  " + fmt(v); onChange(v); });
        // 重い作り直しは指を離したときだけ
        if (onCommit) s.onPointerUpObservable.add(() => onCommit(s.value));
        panel.addControl(s);
        return s;
    }
    function addToggle(name, label, get, set) {
        const b = addButton(name, "", () => { set(!get()); paint(); });
        const paint = () => { b.textBlock.text = label + ": " + (get() ? "ON" : "OFF"); b.background = get() ? COL.active : COL.idle; };
        paint();
        return b;
    }
    const f2 = (v) => v.toFixed(2), f1 = (v) => v.toFixed(1), f0 = (v) => v.toFixed(0);

    addLabel("NAPOLITAN / ナポリタン", 11, COL.sub, "30px");
    const groups = [];
    function addGroup(title, table, get, set) {
        addLabel(title, 13, COL.accent, "22px");
        const btns = {};
        for (const k of Object.keys(table)) btns[k] = addButton(title + "_" + k, table[k].label, () => { set(k); paintAll(); });
        groups.push(() => { for (const k in btns) btns[k].background = (k === get()) ? COL.active : COL.idle; });
    }
    function paintAll() { for (const g of groups) g(); }
    addGroup("ソース", SAUCE, () => curSauce, (k) => { curSauce = k; build(); });
    addGroup("具", TOPPINGS, () => curTop, (k) => { curTop = k; build(); });
    addGroup("皿", PLATES, () => curPlate, (k) => { curPlate = k; build(); });
    addGroup("クロス", CLOTHS, () => curCloth, (k) => { curCloth = k; applyCloth(k, 31); });

    addLabel("", 6, COL.sub, "8px");
    addButton("reseed", "盛り直す", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build();
    });
    addToggle("fork", "フォークで巻く", () => G.fork, (v) => { G.fork = v; build(); });
    addToggle("cheese", "粉チーズ", () => G.cheese, (v) => { G.cheese = v; build(); });
    addToggle("parsley", "パセリ", () => G.parsley, (v) => { G.parsley = v; build(); });

    addLabel("", 6, COL.sub, "8px");
    addSlider("麺の本数", 120, 360, G.strands, f0, () => { }, (v) => { G.strands = Math.round(v); build(); });
    addSlider("麺の太さ [mm]", 1.5, 2.6, G.noodleD, f1, () => { }, (v) => { G.noodleD = v; build(); });
    addSlider("盛りの高さ [cm]", 2.5, 6.5, G.peak, f1, () => { }, (v) => { G.peak = v; build(); });
    addSlider("油の照り ×", 0, 1.6, 1.0, f2, (v) => {
        if (state && state.pasta) state.pasta.material.clearCoat.intensity = 0.70 * SAUCE[curSauce].gloss * v;
    });
    addSlider("環境光 ×", 0.10, 1.40, scene.environmentIntensity, f2, (v) => { scene.environmentIntensity = v; });
    addToggle("kick", "照り足し", () => kick.isEnabled(), (v) => kick.setEnabled(v));
    addToggle("steam", "湯気", () => steam.isStarted(), (v) => { if (v) steam.start(); else steam.stop(); });
    steam.start();
    addToggle("rot", "自動回転", () => camera.useAutoRotationBehavior, (v) => {
        camera.useAutoRotationBehavior = v;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.08;
    });
    addLabel("", 6, COL.sub, "8px");
    addToggle("dof", "被写界深度", () => dp.depthOfFieldEnabled, (v) => { dp.depthOfFieldEnabled = v; });
    addSlider("ぼけ量", 0.01, 0.20, GLOBAL.dofRatio, f2, (v) => { GLOBAL.dofRatio = v; });
    addSlider("F値", 1.2, 11.0, GLOBAL.dofFStop, f1, (v) => { dp.depthOfField.fStop = v; });
    const info = addLabel("", 12, COL.sub, "92px");

    onRebuilt = (st) => {
        let tri = 0;
        for (const m of st.meshes) if (m && m.tris) tri += m.tris;
        info.text = "麺 " + st.strands + " 本 / 経路点 " + st.points.toLocaleString() + "\n"
            + "押し合い " + st.pushes.toLocaleString() + " 回\n"
            + tri.toLocaleString() + " tri / " + st.ms + " ms\n"
            + "seed: " + curSeed;
    };

    applyCloth(curCloth, 31);
    build();
    paintAll();
    console.log("[Napolitan] build napolitan-2026-10-04-a", "| sauce=" + curSauce, "| seed=" + curSeed,
        "| " + JSON.stringify(state.t));

    scene.onDisposeObservable.add(() => {
        disposeState(state);
        if (pastaTex) { pastaTex.normal.dispose(); pastaTex.coat.dispose(); }
        if (clothTex) { clothTex.albedo.dispose(); clothTex.normal.dispose(); }
        steamTex.dispose();
    });

    return scene;
};

export default createScene;