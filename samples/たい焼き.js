// たい焼き — Babylon.js Playground (JavaScript)
// 全文を貼り付けて Run。左上 ≡ で焼き色・個数を変更。
// 形状と表面テクスチャは手続き生成。環境光のみ Babylon.js 公式配布 .env を使用。
// 手前の1個をクリック（または「割る」）すると胴の中ほどで割れ、生地のちぎれ面とつぶあんが見える。
// もう一度クリックするとくっつく。

var createScene = async function () {
    // =================================================================
    // 0. CONFIG （単位は cm）
    // =================================================================
    const BUILD = "taiyaki-2026-10-07-k";

    const PRESETS = {
        teiban: {
            label: "定番（きつね色）",
            doneness: 1.00,             // 焼き色の基準
            flangeW: 0.10,              // ミミの平均幅
            flangeVar: 0.9,             // ミミの幅のばらつき
            flangeHalf: 0.07,           // ミミの厚み（片側）
            burnEdge: 0.22,             // 縁の焦げ
            thinBurn: 0.16,             // 薄いヒレほど濃く
            pore: 0.80,                 // 生地の気泡
            rough: 0.68,
            // sRGB。参考写真の胴（ハイライトを避けた所）から取った値
            pale:  [0.910, 0.765, 0.525],
            gold:  [0.845, 0.615, 0.335],
            brown: [0.660, 0.410, 0.180],
            dark:  [0.440, 0.250, 0.105],
            char:  [0.255, 0.145, 0.070]
        },
        kongari: {
            label: "こんがり（香ばしい）",
            doneness: 1.32,
            flangeW: 0.06, flangeVar: 0.7, flangeHalf: 0.07,
            burnEdge: 0.38, thinBurn: 0.22, pore: 1.10, rough: 0.61,
            pale:  [0.880, 0.700, 0.450],
            gold:  [0.820, 0.560, 0.270],
            brown: [0.640, 0.380, 0.150],
            dark:  [0.420, 0.225, 0.085],
            char:  [0.235, 0.125, 0.055]
        },
        hane: {
            label: "羽根つき（薄皮のミミ）",
            doneness: 1.06,
            flangeW: 0.42, flangeVar: 1.35, flangeHalf: 0.055,
            burnEdge: 0.30, thinBurn: 0.22, pore: 0.85, rough: 0.67,
            pale:  [0.915, 0.775, 0.535],
            gold:  [0.850, 0.625, 0.345],
            brown: [0.665, 0.415, 0.185],
            dark:  [0.450, 0.255, 0.105],
            char:  [0.260, 0.150, 0.070]
        }
    };

    const GLOBAL = {
        count: 2,
        // 厚み（片側）。全体の厚みは頭で約 2.5cm、尾の付け根で約 1.4cm
        bodyHalf: 1.05,
        tailBodyHalf: 0.60,
        domeDepth: 2.3,             // 縁から何 cm 入ると最大の厚みになるか
        finHalf: 0.17,              // ヒレの厚み（片側）
        rimR: 0.10,                 // 縁の丸み
        meshStep: 0.06,             // メッシュの格子間隔
        reliefScale: 1.0,
        poreCount: 7350 * 0.5,            // 気泡の配置候補数（前版の10500から30%減）

        // 割った断面
        split: true,                // 手前の1個を「割れる」半身2つで作る
        splitTime: 1.0,             // 割れる / くっつく動きの秒数
        splitArc: 1.4,              // 割るときに持ち上がる高さ
        splitBend: 0.42,            // 割るときに断面が開く角度（rad）
        splitX: 0.55,               // 割れ目の中心（x）
        crust: 0.36,                // 上下の皮の厚み（片側）
        sideCrust: 0.62,            // 胴の縁からあんこまでの距離
        ankoBulge: 0.22,            // あんこが断面から盛り上がる量
        capRows: 40,                // 断面の縦方向の分割
        capTexW: 512, capTexH: 256,

        // ラスタ（上から見た平面）。テクスチャも同じ格子
        X0: -7.7, X1: 8.7, Z0: -5.0, Z1: 5.0,
        texW: 1024,
        sdfDiv: 4,                  // 輪郭の SDF はこの倍率で粗く焼いて補間する

        useSSAO: true,
        useDOF: false,
        dofRatio: 0.070,
        dofFStop: 2.8,
        guiOwnCamera: false,        // true で GUI 専用カメラ（Inspector の表示が崩れる）

        compactWidth: 700,
        compactMinSide: 480,
        guiMaxScale: 2.2
    };
    GLOBAL.texH = Math.round(GLOBAL.texW * (GLOBAL.Z1 - GLOBAL.Z0) / (GLOBAL.X1 - GLOBAL.X0));

    const START_PRESET = "teiban";
    const START_SEED = 20261007;

    const V3 = BABYLON.Vector3;
    const C3 = BABYLON.Color3;
    const TAU = Math.PI * 2;
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const gauss = (x, w) => Math.exp(-(x / w) * (x / w));
    let uid = 0;
    function named(obj, base) {
        const n = base + "_" + (++uid);
        obj.name = n; obj.id = n;
        return obj;
    }

    // =================================================================
    // 1. Rng / Noise
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
        int(n) { return Math.floor(this.next() * n) % n; }
    }

    const Noise = {
        _h2(x, y, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
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
        }
    };

    // =================================================================
    // 2. Outline
    // =================================================================
    // 魚の向き: x が頭(-) → 尾(+)、z が腹(-) → 背(+)。皿の上では横倒しに寝ている
    //
    const FISH_CTRL = [
        [-6.62, -0.25], [-6.35, -1.25], [-5.65, -2.30], [-4.55, -3.10], [-3.10, -3.55], [-1.40, -3.70],
        [0.30, -3.62], [1.40, -3.62], [2.45, -3.88], [3.35, -3.35], [4.10, -2.25], [4.72, -1.38],
        [5.00, -1.95], [5.85, -2.90], [7.45, -3.70], [7.82, -3.45], [7.36, -1.65], [7.00, -0.10],
        [7.36, 1.65], [7.82, 3.45], [7.55, 3.70], [5.85, 2.90], [5.00, 1.95], [4.72, 1.38],
        [4.15, 2.08], [2.80, 2.94], [1.65, 3.45], [0.80, 4.48], [-0.40, 4.56], [-1.70, 4.03], [-2.30, 3.62], [-3.90, 3.25],
        [-5.15, 2.15], [-6.05, 1.05], [-6.55, 0.40]
    ];
    const CORE_CTRL = [
        [-6.42, -0.20], [-6.08, -1.35], [-5.25, -2.42], [-3.85, -3.12], [-2.00, -3.35], [-0.10, -3.18],
        [1.70, -2.68], [3.20, -1.92], [4.40, -1.12], [5.25, -0.68], [5.55, 0.0], [5.25, 0.68],
        [4.35, 1.08], [3.10, 1.72], [1.60, 2.52], [-0.20, 3.10], [-2.10, 3.28], [-3.85, 2.95],
        [-5.12, 2.12], [-6.00, 1.05], [-6.38, 0.40]
    ];

    // 閉じた Catmull-Rom で細分。尾の先などの角も少し丸まる（型の角も丸い）
    function catmull(ctrl, sub) {
        const n = ctrl.length, out = [];
        for (let i = 0; i < n; i++) {
            const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
            for (let k = 0; k < sub; k++) {
                const t = k / sub, t2 = t * t, t3 = t2 * t;
                const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
                out.push(f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]));
            }
        }
        return new Float64Array(out);
    }

    // 多角形の符号付き距離（内側が負）
    function sdPoly(P, x, y) {
        const n = P.length / 2;
        let d = (x - P[0]) * (x - P[0]) + (y - P[1]) * (y - P[1]);
        let s = 1;
        for (let i = 0, j = n - 1; i < n; j = i, i++) {
            const vix = P[i * 2], viy = P[i * 2 + 1], vjx = P[j * 2], vjy = P[j * 2 + 1];
            const ex = vjx - vix, ey = vjy - viy, wx = x - vix, wy = y - viy;
            const h = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
            const bx = wx - ex * h, by = wy - ey * h;
            const dd = bx * bx + by * by;
            if (dd < d) d = dd;
            const c1 = y >= viy, c2 = y < vjy, c3 = ex * wy > ey * wx;
            if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
        }
        return s * Math.sqrt(d);
    }

    // 粗い格子に焼いた SDF。SDF は 1-リプシッツで滑らかなので双線形で十分
    class Grid {
        constructor(W, H, fn) {
            const G = GLOBAL;
            this.W = W; this.H = H;
            this.dx = (G.X1 - G.X0) / (W - 1); this.dz = (G.Z1 - G.Z0) / (H - 1);
            this.a = new Float32Array(W * H);
            for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                this.a[j * W + i] = fn(G.X0 + i * this.dx, G.Z0 + j * this.dz);
            }
        }
        at(x, z) {
            const fx = clamp((x - GLOBAL.X0) / this.dx, 0, this.W - 1.001);
            const fz = clamp((z - GLOBAL.Z0) / this.dz, 0, this.H - 1.001);
            const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, W = this.W, a = this.a;
            const k = j * W + i;
            return (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + W] * (1 - u) + a[k + W + 1] * u) * v;
        }
    }

    // =================================================================
    // 3. Relief （型押しの浮き彫り。高さ cm、正が盛り上がり）
    // =================================================================
    const EYE = [-4.30, 0.98];
    const GILL = [-6.30, 0.10];         // エラぶたの弧の中心
    // x: 頭(-) → 尾(+)、z: 腹(-) → 背(+)。
    // 胸びれはえらの後下方に付く。上辺を尾側へ伸ばし、下辺は扇状に広げる。
    const PECT = [-2.95, -1.65];
    const PECT_OUTLINE = catmull([
        [-3.10, -1.40], [-2.20, -1.12], [-0.30, -0.97],
        [-0.55, -1.48], [-1.12, -2.14], [-1.85, -2.70],
        [-2.47, -2.59], [-3.00, -2.05]
    ], 5);
    const PECT_RAYS = [
        [-0.37, -1.05], [-0.58, -1.43], [-0.86, -1.80],
        [-1.20, -2.16], [-1.57, -2.48], [-1.98, -2.65]
    ];

    // 鱗の格子
    const SC = { X0: -3.4, SX: 0.74, SZ: 1.02, R: 0.70, GW: 0.11, clockwiseDegrees: 25 };
    const scaleAngle = SC.clockwiseDegrees * Math.PI / 180;
    const scaleCos = Math.cos(scaleAngle), scaleSin = Math.sin(scaleAngle);
    function scaleAt(worldX, worldZ) {
        // 側面（頭が左、背が上）で模様を時計回りに30度回す。
        // 高さ場を読む座標には逆回転を掛ける。鱗の配置と後縁を一緒に回す。
        const x = worldX * scaleCos - worldZ * scaleSin;
        const z = worldX * scaleSin + worldZ * scaleCos;
        const zz = z * (1 + 0.20 * smooth(-1.0, 4.5, worldX)); // 尾に向かって鱗が詰まる
        const fi = (x - SC.X0) / SC.SX;
        const ic = Math.round(fi);
        let bi = 1e9, bj = 1e9, bd = 0, bcx = 0;
        const cand = [];
        for (let i = ic - 2; i <= ic + 1; i++) {
            const cx = SC.X0 + i * SC.SX;
            const off = (i & 1) ? SC.SZ * 0.5 : 0;
            const jc = Math.round((zz - off) / SC.SZ);
            for (let j = jc - 1; j <= jc + 1; j++) {
                const cz = j * SC.SZ + off;
                // 模様の座標内で縦長の鱗を重ね、丸い後縁を露出させる。
                const d = Math.hypot((x - cx) * 1.24, zz - cz);
                cand.push(i, j, d);
                if (d < SC.R && (i < bi || (i === bi && j < bj))) { bi = i; bj = j; bd = d; bcx = cx; }
            }
        }
        if (bi === 1e9) return 0;
        let gd = SC.R - bd;
        for (let k = 0; k < cand.length; k += 3) {
            const i = cand[k], j = cand[k + 1], d = cand[k + 2];
            const higher = i < bi || (i === bi && j < bj);
            if (higher && d >= SC.R) gd = Math.min(gd, d - SC.R);
        }
        const g = smooth(0, SC.GW, gd);
        // 後縁が持ち上がる。手前の低い所から後ろへ向けてせり上がる鋸歯状
        const s = (x - bcx) * 1.24 / SC.R;
        const prof = 0.22 + 0.78 * smooth(-0.65, 0.65, s);
        return g * prof * 2.0;
    }

    function reliefAt(x, z, dF, dC) {
        if (dF > 0.02) return 0;
        let h = 0;

        // ---- ヒレの筋 -----------------------------------------------
        const finM = smooth(-0.05, 0.22, dC) * smooth(0.0, 0.12, -dF);
        if (finM > 0) {
            let ox, oz, K;
            if (x > 4.6) { ox = 4.0; oz = 0; K = 36; }
            else if (z > 0) { ox = -3.6; oz = -1.8; K = 57; }
            else { ox = -3.4; oz = 1.6; K = 55; }
            const a = Math.atan2(z - oz, x - ox);
            const st = Math.pow(0.5 + 0.5 * Math.cos(a * K), 2.2);
            h += finM * (0.105 * st - 0.018);
        }
        // ヒレと胴の境の段差（型の刻み）
        const finExists = smooth(0.12, 0.30, dC - dF);
        h -= 0.055 * gauss(dC - 0.05, 0.06) * finExists;

        const bodyM = smooth(0.0, 0.28, -dC);
        if (bodyM <= 0) return h;

        // ---- エラぶた -----------------------------------------------
        const rg = Math.hypot(x - GILL[0], z - GILL[1]);
        h += bodyM * (0.105 * gauss(rg - 3.60, 0.10) - 0.065 * gauss(rg - 3.83, 0.065));
        h += bodyM * 0.035 * smooth(3.65, 3.30, rg);
        // 頬の弧（前鰓蓋）。下半分だけ
        h -= bodyM * 0.060 * gauss(rg - 2.80, 0.065) * smooth(1.5, 0.4, z);

        // ---- 目 -----------------------------------------------------
        const re = Math.hypot(x - EYE[0], z - EYE[1]);
        h += 0.150 * gauss(re - 0.53, 0.095);
        h -= 0.050 * gauss(re - 0.36, 0.050);
        h += 0.170 * Math.sqrt(Math.max(0, 1 - (re / 0.29) * (re / 0.29)));

        // ---- 口 -----------------------------------------------------
        {
            const ax = -6.40, az = 0.02, bx = -4.94, bz = -0.67;
            const ex = bx - ax, ez = bz - az;
            const t = clamp(((x - ax) * ex + (z - az) * ez) / (ex * ex + ez * ez), 0, 1);
            const dm = Math.hypot(x - (ax + ex * t), z - (az + ez * t));
            h -= 0.13 * gauss(dm, 0.10) * (1 - 0.35 * t);
            h += 0.09 * gauss(dm - 0.19, 0.085) * (1 - 0.5 * t);
            // 上唇のふくらみ
            h += 0.050 * gauss(Math.hypot(x + 6.15, z - 0.05), 0.30);
            h += 0.035 * gauss(Math.hypot(x + 6.05, z + 0.85), 0.28);
        }

        // ---- 胸ビレ -------------------------------------------------
        let pect = 0;
        {
            // 多角形の外形と、付け根から後縁へ走る6本の筋。
            // 鱗を同じマスクで隠すので、ひれの表面に鱗が透けない。
            if (x > -3.35 && x < 0.0 && z > -2.95 && z < -0.70) {
                const d = sdPoly(PECT_OUTLINE, x, z);
                const inside = smooth(-0.035, 0.09, -d);
                pect = smooth(-0.12, 0.06, -d);
                let rays = 0;
                for (let i = 0; i < PECT_RAYS.length; i++) {
                    const ax = PECT[0], az = PECT[1] - i * 0.045;
                    const ex = PECT_RAYS[i][0] - ax, ez = PECT_RAYS[i][1] - az;
                    const t = clamp(((x-ax)*ex + (z-az)*ez) / (ex*ex + ez*ez), 0, 1);
                    const distance = Math.hypot(x-ax-ex*t, z-az-ez*t);
                    rays = Math.max(rays, gauss(distance, 0.055) * smooth(0.05, 0.28, t));
                }
                const rim = gauss(d + 0.08, 0.06);
                h += bodyM * (inside * (0.14 + 0.11*rays + 0.075*rim)
                    - 0.035 * gauss(d - 0.025, 0.04));
            }
        }

        // ---- 鱗 -----------------------------------------------------
        const sm = smooth(0.35, 0.75, -dC) * smooth(3.92, 4.25, rg) * smooth(4.7, 4.0, x) * (1 - pect);
        if (sm > 0) h += 0.120 * sm * (scaleAt(x, z) - 0.5);

        return h;
    }

    // ---- ぼかし（分離可能な箱型を2回＝ほぼガウス）----------------------
    function boxBlur(src, W, H, r) {
        const tmp = new Float32Array(W * H), out = new Float32Array(W * H);
        const n = 2 * r + 1;
        for (let j = 0; j < H; j++) {
            let s = 0;
            for (let k = -r; k <= r; k++) s += src[j * W + clamp(k, 0, W - 1)];
            for (let i = 0; i < W; i++) {
                tmp[j * W + i] = s / n;
                s += src[j * W + Math.min(W - 1, i + r + 1)] - src[j * W + Math.max(0, i - r)];
            }
        }
        for (let i = 0; i < W; i++) {
            let s = 0;
            for (let k = -r; k <= r; k++) s += tmp[clamp(k, 0, H - 1) * W + i];
            for (let j = 0; j < H; j++) {
                out[j * W + i] = s / n;
                s += tmp[Math.min(H - 1, j + r + 1) * W + i] - tmp[Math.max(0, j - r) * W + i];
            }
        }
        return out;
    }
    const blur2 = (a, W, H, r) => boxBlur(boxBlur(a, W, H, r), W, H, r);

    // =================================================================
    // 4. Shape （プリセットで変わらないもの。全個体で共有）
    // =================================================================
    function makeTex(scene, base, W, H, fill, linear) {
        const dt = new BABYLON.DynamicTexture(base, { width: W, height: H }, scene, true);
        named(dt, base);
        const ctx = dt.getContext();
        const img = ctx.createImageData(W, H);
        fill(img.data);
        ctx.putImageData(img, 0, 0);
        dt.update(false);
        dt.hasAlpha = false;
        dt.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        if (linear) dt.gammaSpace = false;
        dt.anisotropicFilteringLevel = 8;
        return dt;
    }

    class Shape {
        constructor(scene) {
            const G = GLOBAL, W = G.texW, H = G.texH;
            this.W = W; this.H = H;
            this.dxT = (G.X1 - G.X0) / W; this.dzT = (G.Z1 - G.Z0) / H;

            const fishP = catmull(FISH_CTRL, 8), coreP = catmull(CORE_CTRL, 8);
            const cw = Math.round(W / G.sdfDiv) + 1, ch = Math.round(H / G.sdfDiv) + 1;
            this.dF = new Grid(cw, ch, (x, z) => sdPoly(fishP, x, z));
            this.dC = new Grid(cw, ch, (x, z) => sdPoly(coreP, x, z));

            // 凹凸の全帯域
            const rel = new Float32Array(W * H);
            for (let j = 0; j < H; j++) {
                const z = G.Z0 + (j + 0.5) * this.dzT;
                for (let i = 0; i < W; i++) {
                    const x = G.X0 + (i + 0.5) * this.dxT;
                    rel[j * W + i] = reliefAt(x, z, this.dF.at(x, z), this.dC.at(x, z)) * G.reliefScale;
                }
            }
            this.rel = rel;
            // メッシュに載せる低周波（格子 0.06cm では 0.12cm より細い溝は表せない）
            this.relLow = blur2(rel, W, H, 3);
            // 窪み度（AO と焼き色に使う）
            const wide = blur2(rel, W, H, 7);
            this.cav = new Float32Array(W * H);
            for (let k = 0; k < W * H; k++) this.cav[k] = Math.max(0, wide[k] - rel[k]);

            // 気泡はランダム配置の丸いくぼみ。法線と色で同じ位置を使う。
            this.pore = new Float32Array(W * H);
            this.grain = new Float32Array(W * H);
            for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                const x = G.X0 + (i + 0.5) * this.dxT;
                const z = G.Z0 + (j + 0.5) * this.dzT;
                this.grain[j * W + i] = Noise.fbm2(x * 43 + 2, z * 43 + 9, 1201, 2) - 0.5;
            }
            const poreRng = new Rng(47821);
            for (let p = 0; p < G.poreCount; p++) {
                const x = poreRng.range(G.X0, G.X1), z = poreRng.range(G.Z0, G.Z1);
                if (this.dF.at(x, z) > -0.06) continue;
                // 少数の大きな穴と、多数のごく小さな気泡。
                const radius = 0.011 + 0.059 * Math.pow(poreRng.next(), 4);
                const aspect = poreRng.range(0.65, 1.2);
                const depth = poreRng.range(0.45, 1.0) * Math.min(1.4, radius / 0.036);
                const cx = (x - G.X0) / this.dxT - 0.5;
                const cz = (z - G.Z0) / this.dzT - 0.5;
                const rx = radius / this.dxT, rz = radius * aspect / this.dzT;
                for (let j = Math.max(0, Math.floor(cz-rz)); j <= Math.min(H-1, Math.ceil(cz+rz)); j++) {
                    for (let i = Math.max(0, Math.floor(cx-rx)); i <= Math.min(W-1, Math.ceil(cx+rx)); i++) {
                        const r2 = ((i-cx)/rx)**2 + ((j-cz)/rz)**2;
                        if (r2 >= 1) continue;
                        this.pore[j*W+i] = Math.max(this.pore[j*W+i], depth * (1-r2)**1.6);
                    }
                }
            }
            this.scene = scene;
            this.normals = {};
        }

        relLowAt(x, z) {
            const W = this.W, H = this.H;
            const fx = clamp((x - GLOBAL.X0) / this.dxT - 0.5, 0, W - 1.001);
            const fz = clamp((z - GLOBAL.Z0) / this.dzT - 0.5, 0, H - 1.001);
            const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, a = this.relLow;
            const k = j * W + i;
            return (a[k] * (1 - u) + a[k + 1] * u) * (1 - v) + (a[k + W] * (1 - u) + a[k + W + 1] * u) * v;
        }

        // 法線マップ。高周波だけ（全帯域 − メッシュに載せた低周波）+ 気泡 + 肌理
        // 気泡の深さはプリセットで変わるのでキャッシュはプリセット単位
        normalTex(cfg) {
            if (this.normals[cfg.key]) return this.normals[cfg.key];
            const W = this.W, H = this.H;
            const hd = new Float32Array(W * H);
            for (let k = 0; k < W * H; k++) {
                hd[k] = (this.rel[k] - this.relLow[k]) - 0.045 * cfg.pore * this.pore[k] + 0.006 * this.grain[k];
            }
            const kx = 1 / (2 * this.dxT), kz = 1 / (2 * this.dzT);
            const tex = makeTex(this.scene, "taiyakiN_" + cfg.key, W, H, (d) => {
                for (let j = 0; j < H; j++) {
                    const ju = Math.max(0, j - 1), jd = Math.min(H - 1, j + 1);
                    for (let i = 0; i < W; i++) {
                        const il = Math.max(0, i - 1), ir = Math.min(W - 1, i + 1);
                        let nx = (hd[j * W + il] - hd[j * W + ir]) * kx;
                        let ny = (hd[jd * W + i] - hd[ju * W + i]) * kz;
                        let nz = 1;
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const o = (j * W + i) * 4;
                        d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255;
                        d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
                    }
                }
            }, true);
            this.normals[cfg.key] = tex;
            return tex;
        }

        dispose() { for (const k in this.normals) this.normals[k].dispose(); }
    }

    // 厚み（片側）。dO=外形（ミミ込み）、dF=魚、dC=胴の芯
    function halfThick(cfg, x, dO, dF, dC, relLow) {
        const G = GLOBAL;
        const e = clamp(-dO / G.rimR, 0, 1);
        const rim = Math.sqrt(1 - (1 - e) * (1 - e));
        let T = cfg.flangeHalf * rim;
        T += G.finHalf * smooth(0.0, 0.30, -dF);
        const t = clamp(-dC / G.domeDepth, 0, 1);
        const dome = Math.pow(1 - (1 - t) * (1 - t), 0.72);
        T += mix(G.bodyHalf, G.tailBodyHalf, smooth(-1.5, 5.2, x)) * dome;
        T += relLow * smooth(0, 0.15, -dF);
        return Math.max(T, cfg.flangeHalf * rim * 0.6);
    }

    // =================================================================
    // 5. Taiyaki （個体）
    // =================================================================
    class Taiyaki {
        // cut: null（丸ごと）または { side: -1 頭側 / +1 尾側, fx: z → 割れ目の x }
        // share: 同じ個体のもう片方。外皮のテクスチャとマテリアルを共有する
        constructor(scene, cfg, shape, seed, cut, share) {
            this.scene = scene; this.cfg = cfg; this.shape = shape; this.seed = seed >>> 0;
            this.cut = cut || null;
            const rng = new Rng(this.seed);
            this.fo = [rng.range(0, 50), rng.range(0, 50), rng.range(0, 50), rng.range(0, 50)];
            this.fseed = rng.int(90000) + 100;
            this.tone = rng.range(-0.06, 0.06);
            this.mseed = rng.int(90000) + 100;
            this.node = named(new BABYLON.TransformNode(cut ? (cut.side < 0 ? "taiyakiHead" : "taiyakiTail") : "taiyaki", scene), "taiyaki");
            this.node.rotationQuaternion = BABYLON.Quaternion.Identity();
            this.center = new V3(0, 0, 0);
            if (share) {
                this.albedo = share.albedo; this.orm = share.orm; this.mat = share.mat; this.ownsMat = false;
            } else {
                this._buildTextures(); this.ownsMat = true;
            }
            this._buildMesh();
        }

        // ミミの幅。型からはみ出した生地は場所によって太く、縁はぎざぎざ
        flangeW(x, z) {
            const c = this.cfg, o = this.fo;
            const lobe = Math.pow(Noise.fbm2(x * 0.65 + o[0], z * 0.65 + o[1], this.fseed, 3), 1.6) * 2.4;
            const rag = Noise.fbm2(x * 5.5 + o[2], z * 5.5 + o[3], this.fseed + 9, 2) - 0.5;
            return Math.max(0.015, c.flangeW * (0.15 + c.flangeVar * lobe) + 0.05 * rag * (0.4 + c.flangeW * 2));
        }
        outerD(x, z) { return this.shape.dF.at(x, z) - this.flangeW(x, z); }

        // ノード座標系での上面の高さ。半身は原点を中心へずらしてあるので戻し、
        // 割れて無くなった側は「無い」として返す
        heightAt(x, z) {
            const sh = this.shape;
            x += this.center.x; z += this.center.z;
            if (this.cut && (x - this.cut.fx(z)) * this.cut.side < 0) return -Infinity;
            const dF = sh.dF.at(x, z), dO = dF - this.flangeW(x, z);
            if (dO >= 0) return -Infinity;
            return halfThick(this.cfg, x, dO, dF, sh.dC.at(x, z), sh.relLowAt(x, z));
        }

        _buildTextures() {
            const sh = this.shape, cfg = this.cfg, G = GLOBAL;
            const W = sh.W, H = sh.H, n = W * H;
            const bake = new Float32Array(n), spot = new Float32Array(n);
            for (let j = 0; j < H; j++) {
                const z = G.Z0 + (j + 0.5) * sh.dzT;
                for (let i = 0; i < W; i++) {
                    const x = G.X0 + (i + 0.5) * sh.dxT;
                    const k = j * W + i;
                    const dF = sh.dF.at(x, z), dC = sh.dC.at(x, z);
                    const dO = dF - this.flangeW(x, z);
                    if (dO > 0.06) { bake[k] = 0.5; continue; }
                    const T = halfThick(cfg, x, Math.min(dO, -1e-4), dF, dC, sh.relLow[k]);
                    const mot = Noise.fbm2(x * 0.55 + 13, z * 0.55 + 5, this.mseed, 3);
                    const mot2 = Noise.fbm2(x * 2.1 + 3, z * 2.1 + 17, this.mseed + 7, 2);
                    let b = 0.40 + this.tone
                        + 0.20 * (mot - 0.5) * 2
                        + 0.09 * (mot2 - 0.5) * 2
                        + cfg.thinBurn * (1 - smooth(0.18, 0.95, T))
                        + 1.25 * clamp(sh.rel[k], -0.08, 0.16)
                        - 0.7 * Math.min(0.08, sh.cav[k])
                        + cfg.burnEdge * smooth(0.40, 0.0, -dO) * (0.5 + mot2);
                    // 尾の先と背ビレの先は鉄板の熱が回りやすい
                    b += 0.16 * smooth(5.6, 7.6, x) * smooth(-0.05, 0.4, dC);
                    // 胴の中央は厚く、熱が逃げて淡い
                    b -= 0.10 * smooth(0.6, 2.2, -dC);
                    bake[k] = clamp(b * cfg.doneness, 0, 1);
                    // 気泡の跡（濃い点）。胴の上だけ
                    spot[k] = sh.pore[k] * cfg.pore * smooth(0.02, 0.25, -dF);
                }
            }
            const P = cfg.pale, Gd = cfg.gold, B = cfg.brown, D = cfg.dark, CH = cfg.char;
            this.albedo = makeTex(this.scene, "taiyakiA", W, H, (d) => {
                for (let k = 0; k < n; k++) {
                    const b = bake[k];
                    let c = b < 0.36 ? mix3(P, Gd, smooth(0.05, 0.36, b))
                        : b < 0.68 ? mix3(Gd, B, smooth(0.36, 0.68, b))
                        : mix3(B, D, smooth(0.68, 0.98, b));
                    c = mix3(c, CH, smooth(0.86, 1.0, b) * 0.6);
                    c = mix3(c, D, clamp(spot[k], 0, 1) * 0.58);
                    const o = k * 4;
                    d[o] = c[0] * 255; d[o + 1] = c[1] * 255; d[o + 2] = c[2] * 255; d[o + 3] = 255;
                }
            });
            this.orm = makeTex(this.scene, "taiyakiO", W, H, (d) => {
                for (let k = 0; k < n; k++) {
                    const cv = sh.cav[k];
                    const ao = clamp(1 - 3.2 * cv - 0.25 * clamp(spot[k], 0, 1), 0.5, 1);
                    const ro = clamp(cfg.rough - 0.14 * smooth(0.45, 0.85, bake[k]) + 0.9 * cv
                        + 0.08 * clamp(spot[k], 0, 1), 0.28, 0.88);
                    const o = k * 4;
                    d[o] = ao * 255; d[o + 1] = ro * 255; d[o + 2] = 0; d[o + 3] = 255;
                }
            }, true);

            const m = new BABYLON.PBRMaterial("taiyakiMat", this.scene);
            named(m, "taiyakiMat");
            m.albedoTexture = this.albedo;
            m.metallic = 0; m.roughness = 1;
            m.metallicTexture = this.orm;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useRoughnessFromMetallicTextureAlpha = false;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.bumpTexture = this.shape.normalTex(cfg);
            m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
            // 焼いた小麦生地は光をよく透かす。弱く入れないと茶色い石膏になる
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.translucencyIntensity = 0.22;
            m.subSurface.tintColor = new C3(0.95, 0.66, 0.34);
            m.subSurface.minimumThickness = 0.3;
            m.subSurface.maximumThickness = 2.5;
            this.mat = m;
        }

        _buildMesh() {
            const G = GLOBAL, sh = this.shape, cfg = this.cfg, cut = this.cut;
            const st = G.meshStep;
            const nz = Math.ceil((G.Z1 - G.Z0) / st) + 1;
            // 割る場合は格子を割れ目に沿ってずらす（x' = x - fx(z)）。列 i0 がちょうど
            // 割れ目に乗るので、半身の端の辺と断面の端の辺が同じ頂点を共有して隙間ができない
            const cxf = cut ? cut.fx : (() => 0);
            let nx, i0 = -1, xs0;
            if (cut) {
                let cMin = Infinity, cMax = -Infinity;
                for (let j = 0; j < nz; j++) { const c = cxf(G.Z0 + j * st); cMin = Math.min(cMin, c); cMax = Math.max(cMax, c); }
                i0 = Math.ceil((cMax - G.X0) / st);
                xs0 = -i0 * st;
                nx = i0 + Math.ceil((G.X1 - cMin) / st) + 1;
            } else {
                nx = Math.ceil((G.X1 - G.X0) / st) + 1; xs0 = G.X0;
            }
            const N = nx * nz;
            const dO = new Float32Array(N), gxs = new Float32Array(N), gzs = new Float32Array(N);
            for (let j = 0; j < nz; j++) {
                const z = G.Z0 + j * st, c = cxf(z);
                for (let i = 0; i < nx; i++) {
                    const k = j * nx + i, x = c + xs0 + i * st;
                    gxs[k] = x; gzs[k] = z;
                    dO[k] = this.outerD(x, z);
                }
            }
            // 使う頂点（三角形のどれかの頂点が内側）を決める
            const tris = [];
            const used = new Uint8Array(N);
            const inside = (k) => dO[k] < 0;
            for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
                if (cut && (cut.side < 0 ? i >= i0 : i < i0)) continue;
                const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
                for (const t of [[a, b, d], [a, d, c]]) {
                    if (inside(t[0]) || inside(t[1]) || inside(t[2])) {
                        tris.push(t[0], t[1], t[2]);
                        used[t[0]] = used[t[1]] = used[t[2]] = 1;
                    }
                }
            }
            const map = new Int32Array(N).fill(-1);
            let nv = 0;
            for (let k = 0; k < N; k++) if (used[k]) map[k] = nv++;

            // 2枚分（上面 0..nv-1、下面 nv..2nv-1）
            const pos = new Float32Array(nv * 2 * 3), uvs = new Float32Array(nv * 2 * 2);
            const U = 1 / (G.X1 - G.X0), Vv = 1 / (G.Z1 - G.Z0);
            let maxT = 0;
            this.bottomSamples = [];
            for (let k = 0; k < N; k++) {
                const m = map[k]; if (m < 0) continue;
                const i = k % nx, j = (k / nx) | 0;
                let x = gxs[k], z = gzs[k], T = 0;
                if (dO[k] >= 0) {
                    for (let it = 0; it < 5; it++) {
                        const d = this.outerD(x, z);
                        if (Math.abs(d) < 1e-4) break;
                        const e = 0.01;
                        const gx = (this.outerD(x + e, z) - this.outerD(x - e, z)) / (2 * e);
                        const gz = (this.outerD(x, z + e) - this.outerD(x, z - e)) / (2 * e);
                        const g2 = gx * gx + gz * gz || 1;
                        x -= d * gx / g2; z -= d * gz / g2;
                    }
                    T = 0;
                } else {
                    T = halfThick(cfg, x, dO[k], sh.dF.at(x, z), sh.dC.at(x, z), sh.relLowAt(x, z));
                }
                if (T > maxT) maxT = T;
                const o = m * 3, o2 = (m + nv) * 3;
                pos[o] = x; pos[o + 1] = T; pos[o + 2] = z;
                pos[o2] = x; pos[o2 + 1] = -T; pos[o2 + 2] = z;
                const u = (x - G.X0) * U, v = (z - G.Z0) * Vv;
                uvs[m * 2] = u; uvs[m * 2 + 1] = v;
                uvs[(m + nv) * 2] = u; uvs[(m + nv) * 2 + 1] = v;
                if ((i % 3 === 0) && (j % 3 === 0)) this.bottomSamples.push(new V3(x, -T, z));
            }
            this.maxT = maxT;
            // 半身は上から見た外接矩形の中心をノードの原点にする（置き方を決めやすくする）
            if (cut) {
                let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
                for (let m = 0; m < nv; m++) {
                    x0 = Math.min(x0, pos[m * 3]); x1 = Math.max(x1, pos[m * 3]);
                    z0 = Math.min(z0, pos[m * 3 + 2]); z1 = Math.max(z1, pos[m * 3 + 2]);
                }
                this.center.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
                for (const p of this.bottomSamples) { p.x -= this.center.x; p.z -= this.center.z; }
            }
            // 割れ目の列（上面の頂点番号・位置・厚み）。断面はこの頂点に縫い合わせる
            const capRows = [];
            if (cut) {
                for (let j = 0; j < nz; j++) {
                    const k = j * nx + i0, m = map[k];
                    if (m < 0) continue;
                    const x = pos[m * 3], z = pos[m * 3 + 2];
                    capRows.push({ j, x, z, T: pos[m * 3 + 1], dC: sh.dC.at(x, z) });
                }
            }
            const idx = new Uint32Array(tris.length * 2);
            for (let t = 0; t < tris.length; t += 3) {
                const a = map[tris[t]], b = map[tris[t + 1]], c = map[tris[t + 2]];
                idx[t] = a; idx[t + 1] = b; idx[t + 2] = c;
                const o = tris.length + t;
                idx[o] = a + nv; idx[o + 1] = c + nv; idx[o + 2] = b + nv;
            }
            // 巻き順は実行時に判定（上面の法線 y の総和が正になる向き）
            let normals = new Float32Array(pos.length);
            BABYLON.VertexData.ComputeNormals(pos, idx, normals);
            let sy = 0;
            for (let m = 0; m < nv; m++) sy += normals[m * 3 + 1];
            if (sy < 0) {
                for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
                normals = new Float32Array(pos.length);
                BABYLON.VertexData.ComputeNormals(pos, idx, normals);
            }
            // 上下の縁（同じ位置の頂点）の法線を溶接
            for (let k = 0; k < N; k++) {
                const m = map[k]; if (m < 0 || dO[k] < 0) continue;
                const a = m * 3, b = (m + nv) * 3;
                let x = normals[a] + normals[b], y = normals[a + 1] + normals[b + 1], z = normals[a + 2] + normals[b + 2];
                const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
                normals[a] = normals[b] = x; normals[a + 1] = normals[b + 1] = y; normals[a + 2] = normals[b + 2] = z;
            }
            this.nv = nv; this.ntri = idx.length / 3;

            const mesh = named(new BABYLON.Mesh("taiyakiBody", this.scene), "taiyakiBody");
            const vd = new BABYLON.VertexData();
            vd.positions = pos; vd.indices = idx; vd.normals = normals; vd.uvs = uvs;
            vd.applyToMesh(mesh, false);
            mesh.hasVertexAlpha = false;
            mesh.material = this.mat;
            mesh.receiveShadows = true;
            mesh.parent = this.node;
            mesh.position.set(-this.center.x, 0, -this.center.z);
            this.mesh = mesh;
            if (cut && capRows.length > 2) this._buildCap(capRows);
        }

        // ---- 断面（生地のちぎれ面 + つぶあん）-------------------------
        // 断面は割れ目の列の各頂点から、下面 -T → 上面 +T へ縦に張った帯。
        // 端の行は半身の頂点と同じ位置なので、縁で隙間ができない
        _capSetup(rows) {
            const G = GLOBAL, rng = new Rng((this.seed * 31 + 7) >>> 0);
            this.capSeed = rng.int(90000) + 100;
            const z0 = rows[0].z, z1 = rows[rows.length - 1].z;
            this.capZ0 = z0; this.capZ1 = z1;
            this.capRowsArr = rows;
            // 小豆の粒。断面の (z, y) 平面にばらまき、z のバケットで引く
            // 【対策】粒を等間隔に並べると水玉の布になる。大小と向きを散らし、
            //         一部は重ねて「詰まった餡」に見せる
            const beans = [];
            const nB = Math.round((z1 - z0) * 2.8 * 11);
            for (let b = 0; b < nB; b++) {
                const rz = rng.range(0.15, 0.25);
                beans.push({
                    z: rng.range(z0, z1), y: rng.range(-1.3, 1.3),
                    rz, ry: rz * rng.range(0.62, 0.82), a: rng.range(0, Math.PI),
                    h: rng.range(0.06, 0.11), split: rng.next() < 0.25
                });
            }
            const BK = 0.5, nb = Math.ceil((z1 - z0) / BK) + 1;
            this.beanB = Array.from({ length: nb }, () => []);
            for (const b of beans) {
                const lo = Math.max(0, Math.floor((b.z - b.rz - z0) / BK)), hi = Math.min(nb - 1, Math.floor((b.z + b.rz - z0) / BK));
                for (let q = lo; q <= hi; q++) this.beanB[q].push(b);
            }
            this.beanBK = BK;
        }

        // 割れ目に沿った補間（x, 厚み, 胴の芯までの距離）
        _capAt(z) {
            const R = this.capRowsArr;
            let lo = 0, hi = R.length - 1;
            if (z <= R[0].z) return R[0];
            if (z >= R[hi].z) return R[hi];
            while (hi - lo > 1) { const m = (lo + hi) >> 1; if (R[m].z <= z) lo = m; else hi = m; }
            const a = R[lo], b = R[hi], t = (z - a.z) / ((b.z - a.z) || 1);
            return { x: mix(a.x, b.x, t), T: mix(a.T, b.T, t), dC: mix(a.dC, b.dC, t) };
        }

        _beanAt(z, y) {
            const q = clamp(Math.floor((z - this.capZ0) / this.beanBK), 0, this.beanB.length - 1);
            let best = 0, br = 1, split = false;
            for (const b of this.beanB[q]) {
                const dz = z - b.z, dy = y - b.y;
                const c = Math.cos(b.a), s = Math.sin(b.a);
                const u = (dz * c + dy * s) / b.rz, v = (-dz * s + dy * c) / b.ry;
                const r2 = u * u + v * v;
                if (r2 >= 1) continue;
                // 割れて中身の見える粒は頂部が平らに欠ける
                let h = b.h * Math.sqrt(1 - r2);
                if (b.split) h = Math.min(h, b.h * 0.55);
                if (h > best) { best = h; br = Math.sqrt(r2); split = b.split; }
            }
            return { h: best, r: br, split };
        }

        // 断面上の点 (z, y) の性質。h は断面から外へ出る量（cm）
        _capField(z, y, T, dC) {
            const G = GLOBAL, sd = this.capSeed;
            const crust = G.crust + 0.10 * (Noise.fbm2(z * 1.4 + 7, 3.1, sd, 2) - 0.5) * 2;
            // あんこの領域：上下の皮と胴の縁の内側
            const inner = Math.min(T - crust - Math.abs(y), -dC - G.sideCrust * (0.85 + 0.3 * Noise.fbm2(z * 0.9, 8.1, sd + 3, 2)));
            const a = smooth(-0.025, 0.035, inner);
            // ちぎれた生地：繊維が引きちぎれた粗い面と、大きめの気泡の穴
            const n1 = Noise.fbm2(z * 6.5 + 1, y * 6.5 + 4, sd + 11, 3);
            const n2 = Noise.fbm2(z * 19 + 2, y * 19 + 9, sd + 13, 2);
            const hole = smooth(0.60, 0.78, Noise.fbm2(z * 13 + 5, y * 13 + 2, sd + 17, 2));
            const hc = 0.075 * (n1 - 0.5) * 2 + 0.025 * (n2 - 0.5) * 2 - 0.05 * hole;
            let ha = 0, bean = { h: 0, r: 1, split: false };
            if (a > 0) {
                bean = this._beanAt(z, y);
                // 【対策】あんこを断面と同じ平面で終わらせると「塗った」ように見える。
                //         柔らかいので割った面から少し盛り上がり、粒が浮き出る
                ha = 0.04 + G.ankoBulge * smooth(0.0, 0.55, inner) + bean.h + 0.02 * (n1 - 0.5);
            }
            const edge = smooth(0.0, 0.10, T - Math.abs(y));
            return { h: mix(hc, ha, a) * edge, a, inner, bean, n1, n2, hole };
        }

        _buildCap(rows) {
            const G = GLOBAL, cut = this.cut, M = G.capRows;
            this._capSetup(rows);
            const out = cut.side < 0 ? 1 : -1;    // 断面の外向き（頭側の半身は +x）
            const z0 = this.capZ0, z1 = this.capZ1, zr = (z1 - z0) || 1;
            const nR = rows.length, W = M + 1;
            const pos = new Float32Array(nR * W * 3), uvs = new Float32Array(nR * W * 2);
            for (let r = 0; r < nR; r++) {
                const R = rows[r];
                for (let k = 0; k <= M; k++) {
                    // 上下の端（皮）に頂点を寄せる。皮の境目が粗い格子で鈍らないように
                    const tt = k / M, t = 0.5 - 0.5 * Math.cos(Math.PI * tt);
                    const y = -R.T + 2 * R.T * t;
                    const f = R.T > 0.02 ? this._capField(R.z, y, R.T, R.dC) : { h: 0 };
                    const o = (r * W + k) * 3;
                    pos[o] = R.x + out * f.h - this.center.x; pos[o + 1] = y; pos[o + 2] = R.z - this.center.z;
                    uvs[(r * W + k) * 2] = (R.z - z0) / zr; uvs[(r * W + k) * 2 + 1] = t;
                }
            }
            const idx = [];
            for (let r = 0; r < nR - 1; r++) {
                if (rows[r + 1].j !== rows[r].j + 1) continue;
                for (let k = 0; k < M; k++) {
                    const a = r * W + k, b = a + 1, c = a + W, d = c + 1;
                    idx.push(a, c, b, b, c, d);
                }
            }
            let normals = new Float32Array(pos.length);
            BABYLON.VertexData.ComputeNormals(pos, idx, normals);
            let sx = 0;
            for (let m = 0; m < nR * W; m++) sx += normals[m * 3] * out;
            if (sx < 0) {
                for (let t = 0; t < idx.length; t += 3) { const q = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = q; }
                normals = new Float32Array(pos.length);
                BABYLON.VertexData.ComputeNormals(pos, idx, normals);
            }
            const mesh = named(new BABYLON.Mesh("taiyakiCut", this.scene), "taiyakiCut");
            const vd = new BABYLON.VertexData();
            vd.positions = pos; vd.indices = new Uint32Array(idx); vd.normals = normals; vd.uvs = uvs;
            vd.applyToMesh(mesh, false);
            mesh.hasVertexAlpha = false;
            mesh.receiveShadows = true;
            mesh.parent = this.node;
            this.capMesh = mesh;
            this._buildCapMaterial();
            mesh.material = this.capMat;
        }

        _buildCapMaterial() {
            const G = GLOBAL, W = G.capTexW, H = G.capTexH, n = W * H;
            const z0 = this.capZ0, zr = (this.capZ1 - this.capZ0) || 1;
            const col = new Float32Array(n * 3), ro = new Float32Array(n), ao = new Float32Array(n), hd = new Float32Array(n);
            const dzs = new Float32Array(W), dys = new Float32Array(W);
            // sRGB
            const CRUMB = [0.950, 0.855, 0.630], CRUMB_D = [0.860, 0.725, 0.480];
            const SKIN = [0.760, 0.520, 0.260], STAIN = [0.560, 0.370, 0.300];
            const PASTE = [0.250, 0.108, 0.100], BEAN = [0.400, 0.158, 0.140], BEAN_IN = [0.600, 0.360, 0.280];
            for (let i = 0; i < W; i++) {
                const z = z0 + (i + 0.5) / W * zr;
                const R = this._capAt(z);
                dzs[i] = zr / W; dys[i] = 2 * Math.max(R.T, 0.05) / H;
                for (let j = 0; j < H; j++) {
                    const k = j * W + i;
                    const t = (j + 0.5) / H, y = -R.T + 2 * R.T * t;
                    if (R.T < 0.02) { col[k * 3] = SKIN[0]; col[k * 3 + 1] = SKIN[1]; col[k * 3 + 2] = SKIN[2]; ro[k] = 0.7; ao[k] = 1; continue; }
                    const f = this._capField(z, y, R.T, R.dC);
                    // 生地
                    let c = mix3(CRUMB, CRUMB_D, 0.35 * smooth(0.45, 0.8, f.n2) + 0.75 * f.hole);
                    c = mix3(c, SKIN, smooth(0.09, 0.0, R.T - Math.abs(y)));
                    // あんこの水分がしみた縁
                    c = mix3(c, STAIN, smooth(-0.12, 0.0, f.inner) * 0.65);
                    // あんこ
                    let ca = PASTE;
                    if (f.bean.h > 0) {
                        const on = smooth(0.0, 0.025, f.bean.h);
                        let cb = mix3(BEAN, PASTE, smooth(0.70, 1.0, f.bean.r) * 0.7);
                        if (f.bean.split) cb = mix3(cb, BEAN_IN, smooth(0.75, 0.45, f.bean.r) * 0.8);
                        ca = mix3(PASTE, cb, on);
                    }
                    c = mix3(c, ca, f.a);
                    col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
                    // 【対策】あんこは艶があり、生地は艶消し。同じ粗さだと泥に見える
                    ro[k] = mix(0.86 + 0.06 * f.hole, f.bean.h > 0.01 ? (f.bean.split ? 0.55 : 0.24) : 0.34, f.a);
                    ao[k] = mix(1 - 0.30 * f.hole, 1 - 0.35 * (1 - smooth(0.0, 0.04, f.bean.h)), f.a);
                    // 法線マップは細かい成分だけ（大きな凹凸はメッシュにある）
                    hd[k] = (1 - f.a) * (0.025 * (f.n2 - 0.5) - 0.035 * f.hole)
                        + f.a * 0.006 * (Noise.v2(z * 40, y * 40, this.capSeed + 29) - 0.5);
                }
            }
            this.capA = makeTex(this.scene, "taiyakiCutA", W, H, (d) => {
                for (let k = 0; k < n; k++) {
                    const o = k * 4;
                    d[o] = col[k * 3] * 255; d[o + 1] = col[k * 3 + 1] * 255; d[o + 2] = col[k * 3 + 2] * 255; d[o + 3] = 255;
                }
            });
            this.capO = makeTex(this.scene, "taiyakiCutO", W, H, (d) => {
                for (let k = 0; k < n; k++) {
                    const o = k * 4;
                    d[o] = ao[k] * 255; d[o + 1] = ro[k] * 255; d[o + 2] = 0; d[o + 3] = 255;
                }
            }, true);
            this.capN = makeTex(this.scene, "taiyakiCutN", W, H, (d) => {
                for (let j = 0; j < H; j++) {
                    const ju = Math.max(0, j - 1), jd = Math.min(H - 1, j + 1);
                    for (let i = 0; i < W; i++) {
                        const il = Math.max(0, i - 1), ir = Math.min(W - 1, i + 1);
                        let nx = (hd[j * W + il] - hd[j * W + ir]) / (2 * dzs[i]);
                        let ny = (hd[jd * W + i] - hd[ju * W + i]) / (2 * dys[i]);
                        let nz = 1;
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const o = (j * W + i) * 4;
                        d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255; d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
                    }
                }
            }, true);
            const m = named(new BABYLON.PBRMaterial("taiyakiCutMat", this.scene), "taiyakiCutMat");
            m.albedoTexture = this.capA;
            m.metallic = 0; m.roughness = 1;
            m.metallicTexture = this.capO;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useRoughnessFromMetallicTextureAlpha = false;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.bumpTexture = this.capN;
            m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
            // あんこの艶は濡れた膜。粗さを下げるだけだと金属っぽくなる
            m.clearCoat.isEnabled = true;
            m.clearCoat.intensity = 0.35;
            m.clearCoat.roughness = 0.22;
            this.capMat = m;
        }

        setDebug(mode) {
            const m = this.mat;
            if (this.capMat) {
                const c = this.capMat;
                c.albedoTexture = mode === 1 ? null : this.capA;
                c.albedoColor = mode === 1 ? new C3(0.80, 0.80, 0.80) : new C3(1, 1, 1);
                c.metallicTexture = mode === 1 ? null : this.capO;
                c.roughness = mode === 1 ? 0.6 : 1;
                c.clearCoat.isEnabled = mode !== 1;
            }
            if (mode === 1) {
                m.albedoTexture = null; m.albedoColor = new C3(0.80, 0.80, 0.80);
                m.metallicTexture = null; m.roughness = 0.6;
                m.subSurface.isTranslucencyEnabled = false;
            } else {
                m.albedoTexture = this.albedo; m.albedoColor = new C3(1, 1, 1);
                m.metallicTexture = this.orm; m.roughness = 1;
                m.subSurface.isTranslucencyEnabled = true;
            }
        }
        setBump(level, invY) {
            if (this.mat.bumpTexture) this.mat.bumpTexture.level = level;
            this.mat.invertNormalMapY = invY;
        }

        dispose() {
            this.mesh.dispose();
            if (this.capMesh) {
                this.capMesh.dispose();
                this.capMat.dispose(false, false);
                this.capA.dispose(); this.capO.dispose(); this.capN.dispose();
            }
            if (this.ownsMat) {
                this.mat.dispose(false, false);
                this.albedo.dispose(); this.orm.dispose();
            }
            this.node.dispose();
        }
    }

    // =================================================================
    // 6. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.93, 0.92, 0.90, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.25;
    scene.environmentIntensity = 0.42;

    const camera = new BABYLON.ArcRotateCamera("cam", -1.38, 0.72, 39, new V3(0.2, 1.0, 0), scene);
    camera.attachControl(engine.getRenderingCanvas(), true);
    camera.fov = 0.66;
    camera.wheelPrecision = 8;
    camera.minZ = 0.15;
    camera.maxZ = 400;
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 140;
    camera.upperBetaLimit = 1.50;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.45, -0.88, 0.55).normalize(), scene);
    key.position = new V3(24, 40, -30);
    key.intensity = 2.3;
    key.diffuse = new C3(1.0, 0.975, 0.93);
    key.specular = new C3(0.55, 0.53, 0.50);
    key.autoCalcShadowZBounds = true;

    const fill = new BABYLON.DirectionalLight("fill", new V3(0.85, -0.42, -0.45).normalize(), scene);
    fill.intensity = 0.52;
    fill.specular = new C3(0.15, 0.15, 0.15);
    const kick = new BABYLON.DirectionalLight("kick", new V3(0.15, -0.50, 0.85).normalize(), scene);
    kick.intensity = 0.65;
    kick.diffuse = new C3(0.06, 0.06, 0.06);
    kick.specular = new C3(1.0, 0.96, 0.90);

    const amb = new BABYLON.HemisphericLight("amb", new V3(0, 1, 0), scene);
    amb.intensity = 0.22;
    amb.groundColor = new C3(0.72, 0.70, 0.67);
    amb.specular = new C3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0008;
    sg.normalBias = 0.02;
    sg.darkness = 0.18;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.05;
    ip.contrast = 1.12;
    ip.vignetteEnabled = false;

    // ---- 木のテーブルと皿 --------------------------------------------------------
    function woodSet(size, seed, opt) {
        const N = size, n2 = N * N;
        const ring = new Float32Array(n2), fine = new Float32Array(n2), knot = new Float32Array(n2), seam = new Float32Array(n2);
        for (let y = 0; y < N; y++) {
            const v = y / N;
            for (let x = 0; x < N; x++) {
                const u = x / N, i = y * N + x;
                const flow = Noise.fbm2(u * 2.6 + 3, v * 1.4 + 7, seed + 11, 3) - 0.5;
                ring[i] = Math.pow(Math.abs(Math.sin((v * opt.rings + flow * opt.wave) * Math.PI)), opt.sharp);
                fine[i] = Noise.fbm2(u * 120 + 1, v * 380 + 5, seed + 43, 2);
                knot[i] = Noise.fbm2(u * 3.1 + 21, v * 3.4 + 13, seed + 89, 3);
                const pv = v * opt.planks;
                seam[i] = 1 - smooth(0.0, 0.012, Math.abs(pv - Math.round(pv)));
            }
        }
        const albedo = makeTex(scene, opt.name + "A", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                let c = mix3(opt.base, opt.grain, ring[i] * 0.75 + (fine[i] - 0.5) * 0.16);
                c = mix3(c, opt.dark, smooth(0.78, 0.95, knot[i]) * opt.knot);
                c = mix3(c, opt.dark, seam[i] * 0.65);
                const k = i * 4;
                d[k] = c[0] * 255; d[k + 1] = c[1] * 255; d[k + 2] = c[2] * 255; d[k + 3] = 255;
            }
        });
        const orm = makeTex(scene, opt.name + "O", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const ro = clamp(opt.rough + 0.10 * ring[i] + 0.06 * (fine[i] - 0.5), 0.35, 0.98);
                const k = i * 4;
                d[k] = 255 * (1 - 0.2 * seam[i]); d[k + 1] = ro * 255; d[k + 2] = 0; d[k + 3] = 255;
            }
        }, true);
        const H = new Float32Array(n2);
        for (let i = 0; i < n2; i++) H[i] = clamp(0.5 - 0.30 * ring[i] + 0.22 * (fine[i] - 0.5) - 0.35 * seam[i], 0, 1);
        const normal = makeTex(scene, opt.name + "N", N, N, (d) => {
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const xl = H[y * N + ((x - 1 + N) % N)], xr = H[y * N + ((x + 1) % N)];
                const hu = H[((y - 1 + N) % N) * N + x], hd = H[((y + 1) % N) * N + x];
                let nx = (xl - xr) * opt.bump, ny = (hd - hu) * opt.bump, nz = 1;
                const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                const i = (y * N + x) * 4;
                d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
            }
        }, true);
        for (const t of [albedo, orm, normal]) { t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; }
        return { albedo, orm, normal };
    }

    const tableTex = woodSet(1024, 9001, {
        name: "table", base: [0.62, 0.45, 0.30], grain: [0.50, 0.34, 0.21], dark: [0.36, 0.23, 0.13],
        rings: 13, wave: 1.5, sharp: 2.4, knot: 0.45, planks: 3, rough: 0.62, bump: 2.2
    });
    const table = named(BABYLON.MeshBuilder.CreateBox("table", { width: 140, height: 3, depth: 140 }, scene), "table");
    {
        const tm = named(new BABYLON.PBRMaterial("tableMat", scene), "tableMat");
        tm.albedoTexture = tableTex.albedo; tm.metallicTexture = tableTex.orm;
        tm.useAmbientOcclusionFromMetallicTextureRed = true;
        tm.useRoughnessFromMetallicTextureGreen = true;
            tm.useRoughnessFromMetallicTextureAlpha = false;
        tm.useMetallnessFromMetallicTextureBlue = true;
        tm.bumpTexture = tableTex.normal; tm.bumpTexture.level = 0.5;
        tm.metallic = 0; tm.roughness = 1;
        table.material = tm;
        table.receiveShadows = true;
        table.position.y = -1.5;
    }

    // 陶器の皿。釉薬の微細なむら
    const PAPER_Y = 0.25;
    const paper = named(BABYLON.MeshBuilder.CreateLathe("ceramicPlate", {
        shape: [[0,0.06],[10.6,0.06],[11.6,0.17],[12.35,0.52],[12.55,0.78],
                [12.53,0.90],[12.38,0.94],[12.18,0.80],[11.5,0.46],[10.5,0.25],[0,0.25]]
            .map(p => new V3(p[0],p[1],0)),
        tessellation: 160, sideOrientation: BABYLON.Mesh.DOUBLESIDE
    }, scene), "paper");
    {
        const pm = named(new BABYLON.PBRMaterial("ceramicGlaze", scene), "ceramicGlaze");
        pm.albedoColor = new C3(0.042, 0.048, 0.045);
        pm.metallic = 0; pm.roughness = 0.72;
        paper.material = pm;
        paper.receiveShadows = true;
        paper.position.y = 0; paper.scaling.x = 1.16;
        paper.rotation.y = 0.06;
    }

    // ---- 配置 ----------------------------------------------------------
    // 1個目は皿の上に置く。2個目は1個目に一部乗り上げ、反対側が皿に着くまで傾ける
    const tmpM = new BABYLON.Matrix(), tmpV = new V3();
    // pitch: 半身を断面側が持ち上がるよう、胴の丸みの上で少し転がす（局所 z 軸まわり）
    function placeOn(B, A, bx, bz, yaw, pitch) {
        let qYaw = BABYLON.Quaternion.RotationAxis(V3.Up(), yaw);
        if (pitch) qYaw = qYaw.multiply(BABYLON.Quaternion.RotationAxis(new V3(0, 0, 1), pitch));
        let invA = null, ay = 0;
        if (A) {
            A.node.computeWorldMatrix(true);
            invA = A.node.getWorldMatrix().clone().invert();
            ay = A.node.position.y;
        }
        const support = (X, Z) => {
            let s = PAPER_Y;
            if (A) {
                V3.TransformCoordinatesFromFloatsToRef(X, ay, Z, invA, tmpV);
                const h = A.heightAt(tmpV.x, tmpV.z);
                if (h > -1e8) s = Math.max(s, ay + h);
            }
            return s;
        };
        const solve = (q) => {
            BABYLON.Matrix.FromQuaternionToRef(q, tmpM);
            let lift = -Infinity;
            const offs = [];
            for (const p of B.bottomSamples) {
                const o = V3.TransformCoordinates(p, tmpM);
                offs.push(o);
                const need = support(bx + o.x, bz + o.z) - o.y;
                if (need > lift) lift = need;
            }
            let gap = Infinity;
            for (const o of offs) gap = Math.min(gap, o.y + lift - PAPER_Y);
            return { lift, gap };
        };
        let best = { q: qYaw, ...solve(qYaw) };
        if (A && best.gap > 0.03) {
            const dir = new V3(bx - A.node.position.x, 0, bz - A.node.position.z).normalize();
            const axis = V3.Cross(V3.Up(), dir).normalize();
            let found = null;
            for (const sgn of [1, -1]) {
                for (let th = 0.01; th <= 0.40; th += 0.01) {
                    const q = BABYLON.Quaternion.RotationAxis(axis, sgn * th).multiply(qYaw);
                    const r = solve(q);
                    if (!found || r.gap < found.gap - 1e-4) found = { th, q, ...r };
                    if (r.gap < 0.03) break;
                }
            }
            if (found && found.gap < best.gap) best = found;
            B.tilt = found ? found.th : 0;
        }
        B.node.rotationQuaternion = best.q;
        B.node.position.set(bx, best.lift, bz);
        B.node.computeWorldMatrix(true);
        return { solve, qYaw };
    }

    // 立てかける：B を局所軸 axis まわりに転がし、片側を A の上面に、反対側を皿に着ける。
    // 最初に両方へ接する角度を採る（それより寝かせると A にめり込み、起こすと皿から浮く）
    function leanOn(B, A, bx, bz, yaw, axis, maxAng) {
        const { solve, qYaw } = placeOn(B, A, bx, bz, yaw);
        let best = null;
        for (const sgn of [1, -1]) {
            for (let a = 0.0; a <= maxAng; a += 0.01) {
                const q = qYaw.multiply(BABYLON.Quaternion.RotationAxis(axis, sgn * a));
                const r = solve(q);
                if (r.gap < 0.03) { if (a > 0.02 && (!best || a < best.a)) best = { a, q, ...r }; break; }
            }
        }
        if (!best) return 0;
        B.node.rotationQuaternion = best.q;
        B.node.position.set(bx, best.lift, bz);
        B.node.computeWorldMatrix(true);
        return best.a;
    }

    // =================================================================
    //  生成
    // =================================================================
    let shape = null, items = [], curPreset = START_PRESET, curSeed = START_SEED;
    let onRebuilt = null;
    const BUMPS = [{ label: "弱", level: 0.55 }, { label: "中", level: 1.0 }, { label: "強", level: 1.6 }];
    let bumpIdx = 1, invY = false, dbgIdx = 0;
    const DEBUGS = ["通常", "白クレイ"];
    let buildMs = 0;

    // ---- 割れるギミック --------------------------------------------------
    // 半身2つは最初から作っておき、「くっついた姿勢」と「割れた姿勢」の間を補間する。
    // くっついた姿勢では両方の断面が同じ面で重なり、外皮の縁は同じ頂点を共有するので、
    // 外からは継ぎ目のない1個に見える
    let pieces = [], splitT = 0, splitTarget = 0, onSplitChanged = null;

    function joinedPose(ps, x, z, yaw) {
        const q = BABYLON.Quaternion.RotationAxis(V3.Up(), yaw);
        BABYLON.Matrix.FromQuaternionToRef(q, tmpM);
        let lift = -Infinity;
        const offs = ps.map(p => V3.TransformCoordinates(p.center, tmpM));
        ps.forEach((p, i) => {
            for (const s of p.bottomSamples) {
                const o = V3.TransformCoordinates(s, tmpM);
                lift = Math.max(lift, PAPER_Y - o.y - offs[i].y);
            }
        });
        return ps.map((p, i) => ({ pos: new V3(x + offs[i].x, lift, z + offs[i].z), q: q.clone() }));
    }

    const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    function applySplit() {
        const e = easeInOut(splitT), arc = Math.sin(Math.PI * e);
        for (const p of pieces) {
            const J = p.poseJoined, S = p.poseSplit;
            if (p.stay) { p.node.position.copyFrom(J.pos); p.node.rotationQuaternion = J.q.clone(); continue; }
            const pos = V3.Lerp(J.pos, S.pos, e);
            pos.y += GLOBAL.splitArc * arc;
            // 手で持ち上げてひねるように、断面側が持ち上がって開く
            const bend = BABYLON.Quaternion.RotationAxis(new V3(0, 0, 1), -p.cut.side * GLOBAL.splitBend * arc);
            p.node.position.copyFrom(pos);
            p.node.rotationQuaternion = BABYLON.Quaternion.Slerp(J.q, S.q, e).multiply(bend);
        }
    }
    scene.onBeforeRenderObservable.add(() => {
        if (!pieces.length || splitT === splitTarget) return;
        const dt = Math.min(0.05, engine.getDeltaTime() / 1000) / GLOBAL.splitTime;
        splitT = splitTarget > splitT ? Math.min(splitTarget, splitT + dt) : Math.max(splitTarget, splitT - dt);
        applySplit();
    });
    function toggleSplit() {
        if (!pieces.length) return;
        splitTarget = splitTarget > 0.5 ? 0 : 1;
        if (onSplitChanged) onSplitChanged();
    }
    // 【対策】ドラッグでカメラを回したあとに割れないよう、押して離しただけ（TAP）で判定する
    scene.onPointerObservable.add((pi) => {
        if (pi.type !== BABYLON.PointerEventTypes.POINTERTAP) return;
        const hit = scene.pick(scene.pointerX, scene.pointerY, (m) => !!(m.metadata && m.metadata.taiyakiPiece));
        if (hit && hit.hit) toggleSplit();
    });

    function build(presetKey, seed) {
        const t0 = performance.now();
        for (const e of items) e.dispose();
        items = []; pieces = [];
        if (!shape) shape = new Shape(scene);
        const cfg = Object.assign({ key: presetKey }, PRESETS[presetKey]);
        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;

        const rng = new Rng(seed);
        if (GLOBAL.split) {
            // 手前の1個（2個のときは2個目）を割る。割れ目は胴の中ほどを、少し斜めにぎざぎざに走る
            const n = GLOBAL.count;
            const whole = n === 2 ? new Taiyaki(scene, cfg, shape, (seed + 3) >>> 0) : null;
            const sseed = (seed + (n - 1) * 7919 + 3) >>> 0;
            const cr = new Rng(sseed ^ 0x5bd1e995), cs = cr.int(90000) + 100;
            const xc = GLOBAL.splitX + cr.range(-0.4, 0.4), tilt = cr.range(-0.12, 0.12);
            const fx = (z) => xc + tilt * z
                + 0.45 * (Noise.fbm2(z * 0.45 + 3.3, 1.7, cs, 3) - 0.5) * 2
                + 0.07 * (Noise.fbm2(z * 3.2 + 1.1, 5.3, cs + 5, 2) - 0.5) * 2;
            const head = new Taiyaki(scene, cfg, shape, sseed, { side: -1, fx });
            const tail = new Taiyaki(scene, cfg, shape, sseed, { side: 1, fx }, head);
            items = whole ? [whole, head, tail] : [head, tail];
            for (const e of items) {
                sg.addShadowCaster(e.mesh, false);
                if (e.capMesh) sg.addShadowCaster(e.capMesh, false);
            }
            // くっついた姿勢：1個のたい焼きとして手前に置く
            if (whole) placeOn(whole, null, -0.4, 5.6, rng.range(0.02, 0.12));
            const jx = 0.3, jz = n === 2 ? -3.4 : -0.4;
            const J = joinedPose([head, tail], jx, jz, rng.range(-0.06, 0.06));
            head.poseJoined = J[0]; tail.poseJoined = J[1];
            // 割れた姿勢：頭側（左半分）はその場に残し、尾側（右半分）を回して断面（-x）を手前へ向け、
            // 背側を左半分の上に立てかける（長手方向の軸まわりに転がし、背は左半分・腹は皿に着く）
            head.poseSplit = head.poseJoined; head.stay = true;
            head.node.position.copyFrom(J[0].pos); head.node.rotationQuaternion = J[0].q.clone();
            head.node.computeWorldMatrix(true);
            leanOn(tail, head, J[1].pos.x - 1.2, J[1].pos.z + 0.6, -1.15 + rng.range(-0.04, 0.04), new V3(1, 0, 0), 1.0);
            tail.poseSplit = { pos: tail.node.position.clone(), q: tail.node.rotationQuaternion.clone() };
            pieces = [head, tail];
            for (const p of pieces) {
                for (const m of [p.mesh, p.capMesh]) {
                    if (!m) continue;
                    m.metadata = { taiyakiPiece: true };
                    // カーソルを指の形にするだけのアクション（判定は onPointerObservable）
                    m.actionManager = new BABYLON.ActionManager(scene);
                    m.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPointerOverTrigger, () => { }));
                }
            }
            splitT = splitTarget = 0;
            applySplit();
            if (onSplitChanged) onSplitChanged();
            for (const e of items) { e.setDebug(dbgIdx); e.setBump(BUMPS[bumpIdx].level, invY); }
            buildMs = performance.now() - t0;
            if (onRebuilt) onRebuilt();
            console.log("[Taiyaki]", BUILD, "/", cfg.label, "/ 割る / seed =", seed, "/", buildMs.toFixed(0), "ms");
            return;
        }
        for (let i = 0; i < GLOBAL.count; i++) {
            const it = new Taiyaki(scene, cfg, shape, (seed + i * 7919 + 3) >>> 0);
            items.push(it);
            sg.addShadowCaster(it.mesh, false);
        }
        if (items.length === 1) {
            placeOn(items[0], null, 0.3, 0.2, rng.range(-0.12, 0.12));
        } else {
            // 参考写真のように奥の1個に、手前の1個の背ビレ側がわずかに乗る
            placeOn(items[0], null, -0.9, 2.7, rng.range(0.04, 0.14));
            placeOn(items[1], items[0], 1.0 + rng.range(-0.3, 0.3), -2.9 + rng.range(-0.2, 0.2), rng.range(-0.08, 0.04));
        }
        for (const e of items) { e.setDebug(dbgIdx); e.setBump(BUMPS[bumpIdx].level, invY); }
        buildMs = performance.now() - t0;
        if (onRebuilt) onRebuilt();
        console.log("[Taiyaki]", BUILD, "/", cfg.label, "/ seed =", seed, "/", items.length, "個 /",
            items.map(e => e.nv * 2 + "頂点").join(", "), "/", buildMs.toFixed(0), "ms");
    }

    build(START_PRESET, START_SEED);

    if (GLOBAL.useSSAO && BABYLON.SSAO2RenderingPipeline.IsSupported) {
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 1.0;
        ssao.totalStrength = 1.15;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 200;
        ssao.minZAspect = 0.3;
    }

    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.95;
    dp.bloomWeight = 0.04;
    dp.bloomKernel = 44;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.18;
    dp.depthOfFieldEnabled = GLOBAL.useDOF;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.High;
    dp.depthOfField.lensSize = 50;
    dp.depthOfField.fStop = GLOBAL.dofFStop;
    scene.onBeforeRenderObservable.add(() => {
        if (!dp.depthOfFieldEnabled) return;
        const focus = camera.radius * 1000;
        dp.depthOfField.focusDistance = focus;
        dp.depthOfField.focalLength = focus * GLOBAL.dofRatio;
    });

    // =================================================================
    //  GUI
    // =================================================================
    let ui;
    if (GLOBAL.guiOwnCamera) {
        const GUI_MASK = 0x20000000;
        const guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene);
        guiCam.layerMask = GUI_MASK;
        scene.activeCameras = [camera, guiCam];
        ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
        if (ui.layer) ui.layer.layerMask = GUI_MASK;
        scene.onAfterRenderObservable.add(() => { scene.activeCamera = camera; });
    } else {
        ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
        // ポストプロセスの後に描くので、DOF やシャープンが UI に乗らない
        if (ui.layer) ui.layer.applyPostProcess = false;
    }

    const COL = { idle: "#2a1c12", active: "#8a4a1c", edge: "#4a3428", text: "#fbf1e4", sub: "#c9ae94", accent: "#f0b978" };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "236px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(20,12,7,0.86)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "62px";
    ui.addControl(card);
    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "204px"; panel.isVertical = true;
    panel.paddingTop = "14px"; panel.paddingBottom = "14px";
    card.addControl(panel);

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
        b.height = "34px"; b.paddingBottom = "6px";
        b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 14;
        b.onPointerUpObservable.add(onClick);
        panel.addControl(b);
        return b;
    }
    function toggle(b, on, text) { b.background = on ? COL.active : COL.idle; b.textBlock.text = text; }

    addLabel("TAIYAKI", 11, COL.sub, "18px");
    addLabel("焼き方", 13, COL.accent, "22px");
    const presetBtns = {}, countBtns = {};
    function highlight() {
        for (const k in presetBtns) presetBtns[k].background = (k === curPreset) ? COL.active : COL.idle;
        for (const k in countBtns) countBtns[k].background = (+k === GLOBAL.count) ? COL.active : COL.idle;
    }
    for (const k of Object.keys(PRESETS)) {
        presetBtns[k] = addButton("p_" + k, PRESETS[k].label, () => { curPreset = k; build(curPreset, curSeed); highlight(); });
    }
    addLabel("個数", 13, COL.accent, "26px");
    for (const c of [1, 2]) {
        countBtns[c] = addButton("c" + c, c + " 個", () => { GLOBAL.count = c; build(curPreset, curSeed); highlight(); });
    }
    const splitBtn = addButton("split", "割る", toggleSplit);
    addButton("reseed", "別の個体を焼く", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(curPreset, curSeed); highlight();
    });

    const bumpBtn = addButton("bump", "凹凸: 中", () => {
        bumpIdx = (bumpIdx + 1) % BUMPS.length;
        for (const e of items) e.setBump(BUMPS[bumpIdx].level, invY);
        bumpBtn.textBlock.text = "凹凸: " + BUMPS[bumpIdx].label;
    });
    let shadowOn = true;
    const shadowBtn = addButton("shadow", "影: ON", () => {
        shadowOn = !shadowOn; key.shadowEnabled = shadowOn;
        toggle(shadowBtn, shadowOn, "影: " + (shadowOn ? "ON" : "OFF"));
    });
    shadowBtn.background = COL.active;
    const dofBtn = addButton("dof", "被写界深度: " + (GLOBAL.useDOF ? "ON" : "OFF"), () => {
        GLOBAL.useDOF = !GLOBAL.useDOF; dp.depthOfFieldEnabled = GLOBAL.useDOF;
        toggle(dofBtn, GLOBAL.useDOF, "被写界深度: " + (GLOBAL.useDOF ? "ON" : "OFF"));
    });
    dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
    const rotBtn = addButton("rotate", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.08;
        toggle(rotBtn, camera.useAutoRotationBehavior, "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF"));
    });

    // ---- GUI の開閉（狭い画面では畳む。DPR 分だけ拡大）-------------------
    function viewportCss() {
        const c = engine.getRenderingCanvas();
        return { w: (c && c.clientWidth) || window.innerWidth || 1024, h: (c && c.clientHeight) || window.innerHeight || 768 };
    }
    function isCompact() {
        const v = viewportCss();
        return v.w < GLOBAL.compactWidth || Math.min(v.w, v.h) < GLOBAL.compactMinSide;
    }
    const toggleBtn = BABYLON.GUI.Button.CreateSimpleButton("guiToggle", "\u2261");
    toggleBtn.width = "38px"; toggleBtn.height = "38px";
    toggleBtn.cornerRadius = 10; toggleBtn.thickness = 1;
    toggleBtn.color = COL.edge; toggleBtn.background = "rgba(20,12,7,0.86)";
    toggleBtn.fontSize = 20;
    if (toggleBtn.textBlock) toggleBtn.textBlock.color = COL.text;
    toggleBtn.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    toggleBtn.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    toggleBtn.left = "16px"; toggleBtn.top = "16px";
    ui.addControl(toggleBtn);
    let panelOpen = false;
    function applyGuiLayout() {
        const narrow = engine.getRenderWidth() / engine.getRenderHeight() < 1.1;
        camera.fovMode = narrow ? BABYLON.Camera.FOVMODE_HORIZONTAL_FIXED : BABYLON.Camera.FOVMODE_VERTICAL_FIXED;
        camera.fov = narrow ? 0.90 : 0.66;
        const scale = isCompact() ? clamp(engine.getRenderWidth() / Math.max(1, viewportCss().w), 1, GLOBAL.guiMaxScale) : 1;
        for (const c of [toggleBtn, card]) { c.transformCenterX = 0; c.transformCenterY = 0; c.scaleX = scale; c.scaleY = scale; }
        card.top = (16 + 38 * scale + 8) + "px";
        card.isVisible = panelOpen;
        if (toggleBtn.textBlock) toggleBtn.textBlock.text = panelOpen ? "\u00d7" : "\u2261";
    }
    toggleBtn.onPointerUpObservable.add(() => { panelOpen = !panelOpen; applyGuiLayout(); });
    const resizeObserver = engine.onResizeObservable.add(applyGuiLayout);
    scene.onDisposeObservable.add(() => {
        engine.onResizeObservable.remove(resizeObserver);
    });
    const hint = new BABYLON.GUI.TextBlock("hint");
    hint.fontSize = 15; hint.color = "#3a2614"; hint.height = "28px";
    hint.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    hint.top = "-14px";
    ui.addControl(hint);
    onSplitChanged = () => {
        const open = splitTarget > 0.5;
        if (splitBtn.textBlock) splitBtn.textBlock.text = open ? "くっつける" : "割る";
        splitBtn.background = open ? COL.active : COL.idle;
        hint.isVisible = pieces.length > 0;
        hint.text = open ? "たい焼きをクリックすると元に戻ります" : "手前のたい焼きをクリックすると割れます";
    };
    onSplitChanged();

    highlight();
    applyGuiLayout();

    return scene;
};

export default createScene;