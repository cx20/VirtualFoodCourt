// =====================================================================
//  Photoreal Ramen  /  写実的な「ラーメン」
//  Babylon.js Playground 用（JavaScriptモードへ全文貼り付け）
//  build: ramen-2026-09-22-d
//
//  天ぷらそば（tensoba-2026-09-21-e）からの派生。麺の芯線 → 緩和 → 掃引、
//  半透明のスープと頂点色の深さ減衰、箸でつかんだ束はそのまま流用し、
//  器・スープ・具をラーメン用に作り直した。
//
//  ラーメンがラーメンに見えるかどうかは、次の5点でほぼ決まる。
//
//    (a) 麺の色。かん水で黄色く、しかも透ける。うどんの乳白でも
//        そばの灰褐色でもない。透光の色味も黄へ寄せる。
//    (b) スープ面の油。醤油も塩も、表面には香味油が大小の円で浮く。
//        平らな半透明面だけだと「色のついた水」になる。油滴は小さな
//        凸レンズとして張り、環境の映り込みで円く光らせる。
//    (c) 器。口径 21cm の白磁で、見込みが広く壁がまっすぐ立ち上がる。
//        そば丼の寸法を拡大するだけだと深すぎて「どんぶり飯」になる。
//    (d) チャーシュー。巻いたバラ肉の渦（脂の白い帯）と、縁の焼き色。
//        渦が無いと「ハムの丸切り」になる。
//    (e) 味玉。黄身が中心ほど濃く、縁で一段明るい。切り口の縁だけ
//        漬けだれが白身にしみる。
//
//  構成:
//    0. CONFIG     … 麺 / スープ / 器 / テーブル / 具の色と寸法（単位 cm）
//    1. Rng / 2. Noise / 3. Utils / 4. TexLab
//    5. Bowl       … ラーメン丼の回転体と白磁・雷紋のテクスチャ
//    5c. Table     … 板張りの卓
//    6. Strands    … 麺の芯線（層ごとのウォーカー → 位置ベース緩和）
//    7. Sweep      … 角丸断面の掃引（ちぢれは掃引直前に波を足す）
//    8. NoodleTex  … 麺の表面
//   10. Soup       … スープ面 / 香味油の油滴 / 麺の暗がり
//   11. Sundry     … 箸 / 箸置き / 刻みねぎ
//   11b. Toppings  … チャーシュー / 味玉 / メンマ / 海苔 ★
//   12. Scene / 13. GUI
// =====================================================================

var createScene = function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    const MM = 0.1;

    // ---- 麺のプリセット ---------------------------------------------
    // 【対策】ちぢれ麺の波を芯線に入れて緩和すると、長さ拘束で伸ばされて
    // 消える。波は緩和のあと、掃引の直前に足す（wave / waveLen）。
    const MEN = {
        chukahoso: {
            label: "中細ストレート",
            w: 1.55 * MM, h: 1.40 * MM, n: 2.45,
            len: [24, 32], twist: 0.30, flat: 0.40, wobble: 0.040,
            dens: 0.20, seg: 0.28, div: 8, puff: 1.50, uvLen: 0.52,
            wave: 0, waveLen: 1,
            sub: 0.85, tint: [0.98, 0.84, 0.50],
            col: {
                pale: [0.975, 0.880, 0.600], base: [0.940, 0.790, 0.450],
                deep: [0.820, 0.610, 0.280], cut: [0.950, 0.850, 0.600]
            }
        },
        chijire: {
            label: "中太ちぢれ",
            w: 2.10 * MM, h: 1.85 * MM, n: 2.30,
            len: [20, 28], twist: 0.35, flat: 0.45, wobble: 0.060,
            dens: 0.22, seg: 0.26, div: 8, puff: 1.38, uvLen: 0.66,
            wave: 0.070, waveLen: 1.30,
            sub: 0.75, tint: [0.98, 0.80, 0.42],
            col: {
                pale: [0.970, 0.850, 0.540], base: [0.925, 0.745, 0.390],
                deep: [0.790, 0.560, 0.230], cut: [0.940, 0.820, 0.540]
            }
        },
        gokuboso: {
            label: "極細（博多）",
            w: 1.05 * MM, h: 1.00 * MM, n: 2.20,
            len: [22, 30], twist: 0.25, flat: 0.30, wobble: 0.035,
            // 【対策】細い麺ほど同じ面積に長さが要る。充填率を落とさないと
            // 芯線が 3 万点を超えて緩和が 10 秒かかる
            dens: 0.13, seg: 0.30, div: 6, puff: 2.00, uvLen: 0.36,
            wave: 0, waveLen: 1,
            sub: 0.95, tint: [0.98, 0.92, 0.72],
            col: {
                pale: [0.975, 0.950, 0.860], base: [0.935, 0.895, 0.745],
                deep: [0.815, 0.745, 0.560], cut: [0.955, 0.930, 0.820]
            }
        }
    };

    // ---- スープのプリセット ------------------------------------------
    // sigma は RGB ごとの消散係数 [1/cm]。alphaK はスープ面の不透明度
    // （1 - exp(-alphaK)）。白濁した豚骨はほぼ不透明になる。
    const SOUP = {
        shoyu: {
            label: "醤油", deep: [0.455, 0.235, 0.070],
            sigma: [0.95, 1.55, 2.70], alphaK: 1.05, oil: 1.00, rough: 0.070, body: 0.20,
            oilCol: [0.99, 0.84, 0.44], oilAlpha: 0.42, oilSize: 1.0
        },
        shio: {
            label: "塩", deep: [0.860, 0.700, 0.400],
            sigma: [0.22, 0.36, 0.78], alphaK: 0.55, oil: 1.25, rough: 0.065, body: 0.18,
            oilCol: [0.99, 0.86, 0.48], oilAlpha: 0.42, oilSize: 1.0
        },
        tonkotsu: {
            // 【対策】白濁していても「白」ではない。参考写真の実測は明部で
            // sRGB [0.86, 0.80, 0.70]、影で [0.70, 0.63, 0.53] の灰みの生成り。
            // 不透明にしきると水面下 2〜3mm の麺が見えず、ホワイトソースになる。
            // 面は 7 割だけ覆い、沈んだ麺は深さの吸収（sigma）で早めに溶かす
            label: "豚骨（白濁）", deep: [0.800, 0.720, 0.600],
            sigma: [2.60, 2.90, 3.40], alphaK: 1.25, oil: 0.85, rough: 0.120, body: 0.36,
            // 脂は白っぽい小さな粒（乳化しきれなかった背脂）で、大きな油だまりは作らない
            oilCol: [0.97, 0.90, 0.70], oilAlpha: 0.32, oilSize: 0.55
        }
    };

    // ---- 器のプリセット（sRGB）----------------------------------------
    // 【注意】黒い器でも sRGB 0.05 は入れない。リニアで 0.002 になり形が消える
    const UTSUWA = {
        hakuji: {
            label: "白磁", inner: [0.935, 0.935, 0.915], outer: [0.930, 0.930, 0.910],
            band: null, ribs: true, rough: 0.22
        },
        aka: {
            label: "赤丼（雷紋）", inner: [0.940, 0.930, 0.900], outer: [0.660, 0.120, 0.090],
            band: [0.700, 0.130, 0.100], ribs: false, rough: 0.22
        },
        kuro: {
            label: "黒（内白）", inner: [0.930, 0.920, 0.890], outer: [0.170, 0.160, 0.155],
            band: null, ribs: false, rough: 0.20
        }
    };

    // ---- 卓 ------------------------------------------------------------
    const TABLE = {
        grey: { label: "古材（灰）", base: [0.400, 0.380, 0.355], grain: [0.215, 0.205, 0.195], rough: 0.72 },
        warm: { label: "無垢材（茶）", base: [0.680, 0.440, 0.255], grain: [0.450, 0.265, 0.135], rough: 0.55 }
    };

    // ---- 具の色（sRGB）--------------------------------------------------
    // 【対策】脂を真っ白・肉を一様なピンクにすると、コントラストが強すぎて
    // 「なると」になる。実物は脂が肉より少し明るいだけで、しかも縁から
    // たれが染みて全体が茶へ寄る。脂もたれで色づく（fat は fatIn より濃い）
    const CHASHU_STYLE = {
        shoyu: {
            label: "醤油煮",
            meat: [0.760, 0.540, 0.420], meatDeep: [0.620, 0.410, 0.300],
            fat: [0.910, 0.770, 0.590], fatIn: [0.955, 0.880, 0.760],
            tare: [0.560, 0.315, 0.165], crust: [0.400, 0.205, 0.090],
            seam: [0.300, 0.165, 0.090], tareIn: 0.75
        },
        nibuta: {
            label: "煮豚（淡）",
            meat: [0.880, 0.720, 0.680], meatDeep: [0.770, 0.590, 0.550],
            fat: [0.955, 0.910, 0.840], fatIn: [0.975, 0.950, 0.900],
            tare: [0.760, 0.560, 0.400], crust: [0.620, 0.420, 0.250],
            seam: [0.460, 0.330, 0.270], tareIn: 0.30
        }
    };
    const EGG = {
        white: [0.970, 0.950, 0.900],
        yolkCore: [0.960, 0.400, 0.055],   // 半熟の芯。いちばん濃い橙
        yolkGel: [0.985, 0.520, 0.110],
        yolkEdge: [0.995, 0.690, 0.230],   // 固まりかけた外周は一段明るい
        ajitama: { label: "味玉", outer: [0.860, 0.620, 0.360], outerDeep: [0.740, 0.480, 0.250], stain: 0.85 },
        yude: { label: "ゆで卵", outer: [0.965, 0.945, 0.890], outerDeep: [0.920, 0.890, 0.820], stain: 0.0 }
    };
    const MENMA_L = [0.890, 0.705, 0.385], MENMA_D = [0.620, 0.405, 0.165];
    const NORI_D = [0.075, 0.095, 0.075], NORI_G = [0.205, 0.290, 0.155];

    // ---- 器の寸法（cm）------------------------------------------------
    // 口径 21.4cm / 高さ 8.6cm。ラーメン丼は見込みが広く、壁がほぼ一定の
    // 勾配で立ち上がる（口縁でわずかに開く）
    const BOWL = {
        rimOuter: 10.72, rimInner: 10.30, height: 8.60,
        footR: 4.10, footH: 0.80
    };
    const IN_R = [0.00, 1.00, 2.00, 3.00, 4.00, 5.00, 6.00, 7.00, 8.00, 8.90, 9.60, 10.30];
    const IN_Y = [1.50, 1.52, 1.60, 1.80, 2.15, 2.65, 3.30, 4.15, 5.20, 6.35, 7.40, 8.60];

    // スープの水位と麺の山。ラーメンの麺はほとんどスープに沈み、
    // 水面から少しだけ背を出す。山は低く平たい
    const BROTH_Y = 7.00;
    const MOUND_TOP = 7.42;
    const MOUND_BOT = 5.65;     // これより下は作らない（暗がりの円板で隠す）

    // ---- シーン全体の設定 ---------------------------------------------
    const CFG = {
        men: "chukahoso",
        soup: "shoyu",
        utsuwa: "hakuji",
        table: "grey",
        amount: 1.0,
        turbidity: 1.0,
        chashu: 2,          // 0〜2 枚
        chashuStyle: "shoyu", // shoyu / nibuta
        egg: "ajitama",     // ajitama / yude / none
        menma: true,
        nori: 2,            // 0〜2 枚
        negi: true,
        steam: true,
        chopsticks: true,
        lift: true,         // 箸で麺をつかむ
        seed: 20260922,
        guiOwnCamera: false,
        texSize: 1024,
        relaxSteps: 80,
        ssao: true,
        dof: true,
        dofRatio: 0.036,
        dofFStop: 5.6
    };

    // =================================================================
    // 1. Rng : mulberry32
    // =================================================================
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
    }

    // =================================================================
    // 2. Noise : 値ノイズ（2D 周期版 / 3D）
    // =================================================================
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
        hash2(xi, yi) { return this.p[(this.p[xi & 255] + (yi & 255)) & 511] / 255; }
        hash3(xi, yi, zi) {
            return this.p[(this.p[(this.p[xi & 255] + (yi & 255)) & 511] + (zi & 255)) & 511] / 255;
        }
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
    // 3. Utils
    // =================================================================
    const TAU = Math.PI * 2, DEG = Math.PI / 180;
    const V3 = BABYLON.Vector3;
    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    const smoothstep = (e0, e1, x) => {
        const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t);
    };
    const mix = (a, b, t) => a + (b - a) * t;
    const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const lin3 = (c) => [s2l(c[0]), s2l(c[1]), s2l(c[2])];
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

    const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const vcross = (a, b) => [
        a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
    ];
    const vlen = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    const vnorm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

    // 【対策】同名メッシュが並ぶと Inspector が先頭だけをハイライトする
    let __uid = 0;
    const named = (mesh, base) => {
        const nm = base + "_" + (__uid++);
        mesh.name = nm; mesh.id = nm;
        return mesh;
    };

    // 【注意】Babylon の ComputeNormals と同じ (v0-v1)x(v2-v1)
    function computeNormals(pos, idx, out) {
        const n = out || new Float32Array(pos.length);
        n.fill(0);
        for (let i = 0; i < idx.length; i += 3) {
            const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
            const e1x = pos[a] - pos[b], e1y = pos[a + 1] - pos[b + 1], e1z = pos[a + 2] - pos[b + 2];
            const e2x = pos[c] - pos[b], e2y = pos[c + 1] - pos[b + 1], e2z = pos[c + 2] - pos[b + 2];
            const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
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

    function toMesh(name, g, scene) {
        const m = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = g.positions; vd.indices = g.indices; vd.normals = g.normals;
        if (g.uvs) vd.uvs = g.uvs;
        if (g.colors) vd.colors = g.colors;
        vd.applyToMesh(m, false);
        // 【対策】stride 4 の頂点カラーで透過パスへ回されるのを止める
        m.hasVertexAlpha = false;
        named(m, name);
        return m;
    }

    class Geo {
        constructor() { this.pos = []; this.idx = []; this.uv = []; this.col = []; }
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

    // --- 向きを指定して三角形を張る -------------------------------------
    // 【対策】具を1つの Geo に複数まとめると、重心基準の orientOutward は
    // 具と具の隙間に重心が落ちて半分が裏返る。三角形ごとに「外はこっち」
    // という向きを渡して、その場で巻き順を決める。
    function triW(g, a, b, c, wx, wy, wz) {
        const P = g.pos;
        const ax = P[a * 3] - P[b * 3], ay = P[a * 3 + 1] - P[b * 3 + 1], az = P[a * 3 + 2] - P[b * 3 + 2];
        const cx = P[c * 3] - P[b * 3], cy = P[c * 3 + 1] - P[b * 3 + 1], cz = P[c * 3 + 2] - P[b * 3 + 2];
        const nx = ay * cz - az * cy, ny = az * cx - ax * cz, nz = ax * cy - ay * cx;
        if (nx * wx + ny * wy + nz * wz >= 0) g.idx.push(a, b, c); else g.idx.push(a, c, b);
    }
    function quadW(g, a, b, c, d, w) { triW(g, a, b, c, w[0], w[1], w[2]); triW(g, a, c, d, w[0], w[1], w[2]); }
    // 外向き = 四角形の中心 − 基準点
    function quadC(g, a, b, c, d, C) {
        const P = g.pos;
        const mx = (P[a * 3] + P[c * 3]) * 0.5 - C[0];
        const my = (P[a * 3 + 1] + P[c * 3 + 1]) * 0.5 - C[1];
        const mz = (P[a * 3 + 2] + P[c * 3 + 2]) * 0.5 - C[2];
        triW(g, a, b, c, mx, my, mz); triW(g, a, c, d, mx, my, mz);
    }

    // 原点 o と3軸（s 横 / v 上 / f 前）を持つ局所フレーム。
    // v は up を f に直交させたもの（up が f と直交していないと傾きが減る）
    function localFrame(o, fwd, up) {
        const f = vnorm(fwd);
        let u = vnorm(up || [0, 1, 0]);
        if (Math.abs(vdot(f, u)) > 0.985) u = [1, 0, 0];
        const s = vnorm(vcross(u, f));
        const v = vnorm(vcross(f, s));
        return {
            o: o, s: s, v: v, f: f,
            at: function (ls, lv, lf) {
                return [o[0] + s[0] * ls + v[0] * lv + f[0] * lf,
                o[1] + s[1] * ls + v[1] * lv + f[1] * lf,
                o[2] + s[2] * ls + v[2] * lv + f[2] * lf];
            }
        };
    }

    // =================================================================
    // 4. TexLab
    // =================================================================
    const TexLab = {
        make(name, size, scene, fill, opts) {
            const S = Math.max(8, Math.round(size) || 512);
            const o = opts || {};
            const t = new BABYLON.DynamicTexture(name, { width: S, height: S }, scene, true,
                BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
            // 【対策】第7引数は invertY。線形として読ませたいときは gammaSpace を落とす
            if (o.linear) t.gammaSpace = false;
            const ctx = t.getContext();
            const img = ctx.createImageData(S, S);
            fill(img.data, S);
            ctx.putImageData(img, 0, 0);
            t.update(false);
            t.name = name;
            t.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
            t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
            t.anisotropicFilteringLevel = 16;
            if (o.clampV) t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
            if (o.clampU) t.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
            if (o.uScale) t.uScale = o.uScale;
            if (o.vScale) t.vScale = o.vScale;
            return t;
        },
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
    function putRGB(d, i, r, g, b) {
        d[i] = clamp(r, 0, 1) * 255;
        d[i + 1] = clamp(g, 0, 1) * 255;
        d[i + 2] = clamp(b, 0, 1) * 255;
        d[i + 3] = 255;
    }

    // =================================================================
    // 5. Bowl : ラーメン丼の回転体
    // =================================================================
    // 【対策】そば丼の寸法をそのまま拡大すると深すぎて「どんぶり飯」になる。
    // ラーメン丼は (a) 内底が広く平ら (b) 壁が一定の勾配で立つ (c) 口縁で
    // わずかに開く。制御点で直接与え、外側は等厚オフセットで作る。
    const WALL_THIN = BOWL.rimOuter - BOWL.rimInner;
    const WALL_THICK = 0.30, WALL_KNEE = 3.00, WALL_SPAN = 1.60;
    const Y_UNDER = 0.88;

    // 単調3次エルミート（Fritsch–Carlson）。Catmull-Rom は腰で行き過ぎる
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
            const w = smoothstep(BOWL.height - 0.75, BOWL.height - 0.05, inY[i]);
            const nr = (dy / L) * (1 - w) + w, ny = (-1 / L) * (1 - w);
            outR[i] = inR[i] + t * nr; outY[i] = inY[i] + t * ny;
        }
        let iStop = 0;
        while (iStop < NI && outR[iStop] < BOWL.footR) iStop++;
        _curves = { inR: inR, inY: inY, outR: outR, outY: outY, NI: NI, iStop: iStop };
        return _curves;
    }

    function innerRAt(y) {
        const W = bowlCurves(), NI = W.NI;
        if (y <= W.inY[0]) return 0;
        if (y >= W.inY[NI]) return BOWL.rimInner;
        let lo = 0, hi = NI;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (W.inY[m] <= y) lo = m; else hi = m; }
        const d = W.inY[hi] - W.inY[lo];
        return W.inR[lo] + (W.inR[hi] - W.inR[lo]) * (d > 1e-12 ? (y - W.inY[lo]) / d : 0);
    }

    // 見込み → 口縁の半円 → 外壁 → 高台 → 底裏 を1本の閉じたループで持つ
    function bowlProfile() {
        const W = bowlCurves(), NI = W.NI;
        const P = [];
        const push = (r, y, k) => P.push({ r: r, y: y, k: k });
        for (let i = 0; i <= NI; i += 4) push(W.inR[i], W.inY[i], 0);
        const cx = (BOWL.rimInner + BOWL.rimOuter) * 0.5, rr = (BOWL.rimOuter - BOWL.rimInner) * 0.5;
        for (let i = 1; i <= 10; i++) {
            const a = Math.PI * (1 - i / 10);
            push(cx + rr * Math.cos(a), BOWL.height + rr * Math.sin(a), 1);
        }
        const outStart = P.length;
        for (let i = NI - 4; i >= W.iStop; i -= 4) push(W.outR[i], W.outY[i], 2);
        const probeIndex = outStart + 6;
        const yK = W.outY[W.iStop];
        const fin = BOWL.footR - 0.62;
        push(BOWL.footR, yK - 0.05, 2);
        push(BOWL.footR - 0.010, yK * 0.62, 2);
        push(BOWL.footR - 0.030, 0.30, 2);
        push(BOWL.footR - 0.070, 0.055, 3);
        push(BOWL.footR - 0.160, 0.0, 3);
        push(fin + 0.070, 0.0, 3);
        push(fin, 0.060, 3);
        push(fin, 0.42, 3);
        push(fin, Y_UNDER - 0.12, 3);
        for (let i = 1; i <= 16; i++) {
            const u = 1 - i / 16;
            push(fin * u, Y_UNDER - 0.12 * Math.pow(u, 1.7), 3);
        }
        return { P: P, probeIndex: probeIndex };
    }

    let _ptab = null;
    function profileTable() {
        if (_ptab) return _ptab;
        const { P } = bowlProfile();
        const N = P.length;
        const arc = new Float32Array(N);
        for (let i = 1; i < N; i++) arc[i] = arc[i - 1] + Math.hypot(P[i].r - P[i - 1].r, P[i].y - P[i - 1].y);
        const total = arc[N - 1] || 1;
        for (let i = 0; i < N; i++) arc[i] /= total;
        _ptab = { P: P, arc: arc, total: total };
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

    function buildBowl(scene, rng) {
        const { P, probeIndex } = bowlProfile();
        const N = P.length, M = 200;
        const arc = new Float32Array(N);
        for (let i = 1; i < N; i++) arc[i] = arc[i - 1] + Math.hypot(P[i].r - P[i - 1].r, P[i].y - P[i - 1].y);
        const total = arc[N - 1] || 1;
        // 磁器は陶器より歪みが小さい。それでも真円にはしない
        const ph = [rng.range(0, 9), rng.range(0, 9), rng.range(0, 9)];
        const nV = N * (M + 1);
        const positions = new Float32Array(nV * 3), uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array((N - 1) * M * 6);
        let vo = 0;
        for (let i = 0; i < N; i++) {
            const p = P[i];
            const mask = smoothstep(5.0, 8.5, p.y);
            for (let j = 0; j <= M; j++) {
                const th = (j % M) / M * TAU;
                const wob = 1 + 0.0016 * Math.sin(3 * th + ph[0]) + 0.0010 * Math.sin(5 * th + ph[1]);
                const dy = mask * 0.012 * Math.sin(2 * th + ph[2]);
                const r = p.r * wob;
                positions[vo * 3] = r * Math.cos(th);
                positions[vo * 3 + 1] = p.y + dy;
                positions[vo * 3 + 2] = r * Math.sin(th);
                uvs[vo * 2] = j / M; uvs[vo * 2 + 1] = arc[i] / total;
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
        mesh.receiveShadows = true;
        mesh.tris = (N - 1) * M * 2;
        return mesh;
    }

    // =================================================================
    // 5b. 器のテクスチャ（白磁 / 外朱 / 雷紋）
    // =================================================================
    // 白磁は「白い」だけでは量産の樹脂になる。効くのは3つ。
    //   ・釉のごく弱い柚子肌（映り込みが細かく揺れる）
    //   ・外壁の挽き筋（参考写真1の横縞）
    //   ・高台の接地面だけ無釉で、素地の灰白が出る
    // 赤丼は見込みの口縁の下に雷紋の帯を描く（参考写真3）。
    // 【対策】雷紋の1コマの幅は帯の高さと同じ実寸にとる。u で等分すると
    // 周長が違う器に替えたとたんに四角が潰れる。
    function bowlTextures(scene, up, seed) {
        const N = Math.max(128, Math.round(CFG.texSize * 0.75) || 768), n2 = N * N;
        const nz = new Noise(seed);
        const rowY = new Float32Array(N), rowK = new Uint8Array(N);
        for (let y = 0; y < N; y++) {
            const s = profileAt((y + 0.5) / N);
            rowY[y] = s.y; rowK[y] = s.k;
        }
        const INNER = up.inner, OUTER = up.outer, BARE = [0.860, 0.835, 0.790];
        const bandTop = BOWL.height - 0.34, bandBot = BOWL.height - 1.30, bandH = bandTop - bandBot;
        const cells = Math.max(8, Math.round(TAU * innerRAt(bandBot + bandH * 0.5) / bandH));
        // 1コマ（a, b ∈ [0,1]）の角渦巻き。先頭の線分が隣のコマの末尾とつながる
        const SEG = [[0.00, 0.15, 0.85, 0.15], [0.85, 0.15, 0.85, 0.85], [0.85, 0.85, 0.15, 0.85],
        [0.15, 0.85, 0.15, 0.40], [0.15, 0.40, 0.60, 0.40], [0.60, 0.40, 0.60, 0.64], [0.60, 0.64, 0.38, 0.64]];
        function segD(px, py, s) {
            const ex = s[2] - s[0], ey = s[3] - s[1];
            const el = ex * ex + ey * ey;
            const t = el > 0 ? clamp(((px - s[0]) * ex + (py - s[1]) * ey) / el, 0, 1) : 0;
            return Math.hypot(px - s[0] - ex * t, py - s[1] - ey * t);
        }
        const H = new Float32Array(n2), bare = new Float32Array(n2);
        const albedo = TexLab.make("bowlA", N, scene, (d) => {
            for (let y = 0; y < N; y++) {
                const k = rowK[y], wy = rowY[y];
                for (let x = 0; x < N; x++) {
                    const i = y * N + x;
                    const mott = nz.fbm2(x / N * 40, y / N * 40, 2, 40, 0) - 0.5;
                    let c = (k <= 1) ? INNER : OUTER;
                    let r = c[0] * (1 + mott * 0.025), g = c[1] * (1 + mott * 0.025), b = c[2] * (1 + mott * 0.02);
                    if (k === 3 && wy < 0.12) {
                        bare[i] = 1;
                        r = BARE[0]; g = BARE[1]; b = BARE[2];
                    }
                    if (up.band && k === 0 && wy > bandBot - 0.35 && wy < bandTop + 0.35) {
                        let ink = 0;
                        ink = Math.max(ink, 1 - smoothstep(0.016, 0.030, Math.abs(wy - (bandTop + 0.15))));
                        ink = Math.max(ink, 1 - smoothstep(0.016, 0.030, Math.abs(wy - (bandBot - 0.15))));
                        if (wy >= bandBot && wy <= bandTop) {
                            const bb = (wy - bandBot) / bandH;
                            const aa = ((x + 0.5) / N * cells) % 1;
                            let dm = 1e9;
                            for (const s of SEG) dm = Math.min(dm, segD(aa, bb, s));
                            ink = Math.max(ink, 1 - smoothstep(0.045, 0.070, dm));
                        }
                        // 筆のかすれ。均一な赤だと印刷に見える
                        ink *= 0.80 + 0.20 * nz.fbm2(x / N * 180, y / N * 180, 2, 180, 0);
                        r = mix(r, up.band[0], ink); g = mix(g, up.band[1], ink); b = mix(b, up.band[2], ink);
                    }
                    // 高さ場: 外壁の挽き筋 + 釉の柚子肌
                    let h = 0.5 + (nz.fbm2(x / N * 160, y / N * 160, 2, 160, 0) - 0.5) * 0.05;
                    if (up.ribs && k === 2 && wy > 1.4 && wy < BOWL.height - 0.7) {
                        const rib = 0.5 + 0.5 * Math.cos(wy / 1.05 * TAU);
                        h += 0.30 * Math.pow(rib, 3);
                    }
                    H[i] = h;
                    putRGB(d, i * 4, r, g, b);
                }
            }
        }, { clampV: true });
        const orm = TexLab.orm("bowlO", N, scene, (x, y, S, o) => {
            const i = y * S + x;
            o[0] = 1; o[1] = mix(up.rough, 0.85, bare[i]); o[2] = 0;
        }, { clampV: true });
        const normal = TexLab.normalFromHeight("bowlN", N, scene, H, 0.0035, { clampV: true });
        return { albedo: albedo, orm: orm, normal: normal };
    }

    function bowlMaterial(scene, up, name, seed) {
        const t = bowlTextures(scene, up, seed);
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = t.albedo;
        m.metallic = 0.0; m.roughness = 1.0;
        m.metallicTexture = t.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = t.normal;
        m.bumpTexture.level = 0.60;
        // 磁器の釉はガラス。映り込みはクリアコートに任せる
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 1.0;
        m.clearCoat.roughness = 0.040;
        m.clearCoat.indexOfRefraction = 1.50;
        m.texs = [t.albedo, t.orm, t.normal];
        return m;
    }

    // =================================================================
    // 5c. Table : 板張りの卓
    // =================================================================
    // 【対策】木目のノイズを1枚で敷くと合板に見える。板を1枚ずつ分け、
    // 板ごとに色・木目の位相を変え、境目に溝を切る。
    function tableTextures(scene, seed, tp) {
        const S = 768, s2 = S * S, NP = 5;
        const nz = new Noise(seed);
        const tintP = [], offP = [];
        for (let p = 0; p < NP; p++) {
            tintP.push(0.84 + 0.30 * nz.hash2(p * 7 + 1, 3));
            offP.push(nz.hash2(p * 13 + 5, 9) * 40);
        }
        const H = new Float32Array(s2), K = new Float32Array(s2), SEAM = new Float32Array(s2);
        for (let y = 0; y < S; y++) {
            const v = y / S, p = Math.min(NP - 1, Math.floor(v * NP)), pv = v * NP - p;
            const seam = Math.min(1, (1 - smoothstep(0.0, 0.012, pv)) + (1 - smoothstep(0.0, 0.012, 1 - pv)));
            for (let x = 0; x < S; x++) {
                const u = x / S, i = y * S + x;
                const lo = nz.fbm2(u * 3 + offP[p], pv * 2 + p * 5, 3, 3, 0) - 0.5;
                const t = pv * 7 + lo * 2.4 + (nz.fbm2(u * 12 + offP[p], pv * 6 + p, 2, 12, 0) - 0.5) * 0.5;
                const ring = Math.pow(0.5 + 0.5 * Math.cos(t * TAU), 6);
                const streak = nz.fbm2(u * 6 + offP[p], pv * 80 + p * 11, 2, 6, 0);
                K[i] = clamp(ring * 0.55 + (streak - 0.5) * 0.7 + 0.25, 0, 1);
                SEAM[i] = seam;
                H[i] = clamp(0.5 + ring * 0.14 - (streak - 0.5) * 0.30 - seam * 0.6, 0, 1);
            }
        }
        const albedo = TexLab.make("tableA", S, scene, (d) => {
            for (let y = 0; y < S; y++) {
                const p = Math.min(NP - 1, Math.floor(y / S * NP));
                for (let x = 0; x < S; x++) {
                    const i = y * S + x, k = K[i], tn = tintP[p] * (1 - 0.72 * SEAM[i]);
                    putRGB(d, i * 4, mix(tp.base[0], tp.grain[0], k) * tn,
                        mix(tp.base[1], tp.grain[1], k) * tn, mix(tp.base[2], tp.grain[2], k) * tn);
                }
            }
        }, {});
        const orm = TexLab.orm("tableO", S, scene, (x, y, SS, o) => {
            const i = y * SS + x;
            o[0] = 1 - 0.5 * SEAM[i]; o[1] = clamp(tp.rough + 0.14 * (K[i] - 0.5), 0.2, 0.95); o[2] = 0;
        }, {});
        const normal = TexLab.normalFromHeight("tableN", S, scene, H, 0.004, {});
        return { albedo: albedo, orm: orm, normal: normal };
    }

    // =================================================================
    // 6. Strands : 麺の芯線
    // =================================================================
    // (1) 曲率を持続させたウォーカーで層ごとに芯線を撒き
    // (2) 位置ベースの緩和（長さ・曲げ・相互反発・器の内壁）で落とす
    function moundRadiusAt(y) {
        const rTop = innerRAt(BROTH_Y) - 0.30;
        const H = MOUND_TOP - (BROTH_Y - 0.10);
        if (y <= BROTH_Y - 0.10) return rTop + (BROTH_Y - 0.10 - y) * 0.15;
        const u = clamp((MOUND_TOP - y) / H, 0, 1);
        return rTop * Math.pow(u, 1 / 2.2);
    }
    function moundTopAt(r) {
        const rTop = innerRAt(BROTH_Y) - 0.30;
        const H = MOUND_TOP - (BROTH_Y - 0.10);
        if (r >= rTop) return BROTH_Y - 0.10;
        return MOUND_TOP - H * Math.pow(clamp(r / rTop, 0, 1), 2.2);
    }
    function layerLimit(y, men) {
        const wall = innerRAt(y) - men.w * 0.5 - 0.22;
        return Math.min(wall, moundRadiusAt(y));
    }

    function walkStrand(rng, men, layerY, layerH, limit, length, phase) {
        const ds = men.seg;
        const n = Math.max(8, Math.round(length / ds));
        const pts = new Float64Array(n * 3);
        // 【対策】ラーメン丼は口径が広い。そば丼と同じ曲率だと、小さな輪が
        // 並んで「ほぐしていない麺」になる。弧の半径を大きめにとる
        const kBase = (rng.next() < 0.5 ? -1 : 1) / rng.range(2.0, 4.8);
        const kMax = 1 / 1.35;
        let k = kBase * rng.range(0.4, 1.2);
        const r0 = limit * Math.sqrt(rng.next()) * 0.86;
        const a0 = rng.range(0, TAU);
        let x = Math.cos(a0) * r0, z = Math.sin(a0) * r0;
        let th = rng.range(0, TAU);
        for (let i = 0; i < n; i++) {
            const s = i * ds;
            const wob = Math.sin(s * 0.9 + phase) * 0.55 + Math.sin(s * 2.3 + phase * 1.7) * 0.30
                + Math.sin(s * 0.33 + phase * 0.5) * 0.15;
            pts[i * 3] = x; pts[i * 3 + 1] = layerY + wob * layerH * 0.38; pts[i * 3 + 2] = z;
            k += (kBase - k) * 0.035 + rng.pm(0.085);
            k = clamp(k, -kMax, kMax);
            th += k * ds;
            const r = Math.hypot(x, z);
            const w = smoothstep(limit - 1.25, limit - 0.05, r);
            if (w > 0) {
                let d = Math.atan2(-z, -x) - th;
                while (d > Math.PI) d -= TAU;
                while (d < -Math.PI) d += TAU;
                th += d * w * 0.30;
            }
            x += Math.cos(th) * ds; z += Math.sin(th) * ds;
            const rr = Math.hypot(x, z);
            if (rr > limit) { x *= limit / rr; z *= limit / rr; }
        }
        return { pts: pts, n: n };
    }

    function makeStrands(men, seed) {
        const rng = new Rng(seed);
        const layerH = men.h * 0.92;
        const strands = [];
        let total = 0;
        for (let y = MOUND_BOT + layerH * 0.5; y < MOUND_TOP; y += layerH) {
            const limit = layerLimit(y, men);
            if (limit < men.w * 1.6) continue;
            const cap = Math.PI * limit * limit * men.dens / men.w * CFG.amount;
            let put = 0, guard = 0;
            while (put < cap && guard++ < 60) {
                const len = rng.range(men.len[0], men.len[1]);
                const st = walkStrand(rng, men, y, layerH, limit, len, rng.range(0, TAU));
                st.tone = rng.pm(1.0);
                strands.push(st);
                put += len; total += len;
            }
        }
        return { strands: strands, totalLen: total };
    }

    // =================================================================
    // 6b. Relax : 位置ベースの緩和（天ぷらそばと同じ）
    // =================================================================
    function relaxStrands(list, men, opt) {
        const o = opt || {};
        const steps = o.steps || 110;
        const iters = o.iters || 4;
        const dt = 1 / 60;
        const gy = -(o.gravity === undefined ? 80 : o.gravity);
        const damp = 0.86;
        // 【対策】摩擦の無い緩和では細い麺ほど山が潰れる。接触半径を puff 倍する
        const rc = (men.h * 0.46 + men.w * 0.16) * (men.puff || 1);
        const d2min = (rc * 2) * (rc * 2);
        const ds = men.seg;

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

        const W = bowlCurves();
        const prof = [];
        for (let i = 0; i <= W.NI; i += 6) prof.push([W.inR[i], W.inY[i]]);
        prof.push([BOWL.rimInner, BOWL.height + 3]);
        const nP = prof.length;
        const tmp = [0, 0];
        function pushInside(r, y, margin) {
            let bd = 1e9, bx = 0, by = 0, bnx = 0, bny = 0;
            for (let i = 0; i < nP - 1; i++) {
                const ax = prof[i][0], ay = prof[i][1];
                const ex = prof[i + 1][0] - ax, ey = prof[i + 1][1] - ay;
                const el = ex * ex + ey * ey;
                let t = el > 1e-12 ? ((r - ax) * ex + (y - ay) * ey) / el : 0;
                t = t < 0 ? 0 : (t > 1 ? 1 : t);
                const cx = ax + ex * t, cy = ay + ey * t;
                const d = Math.hypot(r - cx, y - cy);
                if (d < bd) {
                    bd = d; bx = cx; by = cy;
                    const l = Math.hypot(ex, ey) || 1;
                    bnx = -ey / l; bny = ex / l;
                }
            }
            const s = (r - bx) * bnx + (y - by) * bny;
            if (s >= margin) { tmp[0] = r; tmp[1] = y; return tmp; }
            const k = margin - s;
            tmp[0] = r + bnx * k; tmp[1] = y + bny * k;
            return tmp;
        }

        const finish = Math.min(72, Math.max(36, Math.round(36 * nTot / 2500)));

        const cell = rc * 2.05, inv = 1 / cell;
        const G0 = Math.floor(-(BOWL.rimInner + 1.5) * inv);
        const G1 = Math.ceil((BOWL.rimInner + 1.5) * inv);
        const GY0 = Math.floor((MOUND_BOT - 1.5) * inv);
        const GY1 = Math.ceil((BOWL.height + 2.5) * inv);
        const NX = G1 - G0 + 1, NY = GY1 - GY0 + 1, NZ = NX;
        const head = new Int32Array(NX * NY * NZ);
        const next = new Int32Array(nTot);
        const gclamp = (v, hi) => (v < 0 ? 0 : (v > hi ? hi : v));
        // 【対策】丼が広いぶん格子は 20 万セルある。空のセルまで毎回舐めると
        // 反発の計算より格子の走査のほうが重くなる。埋まったセルだけ覚えておく
        const occ = new Int32Array(nTot);
        let nOcc = 0;
        function rebuild() {
            head.fill(-1);
            nOcc = 0;
            for (let i = 0; i < nTot; i++) {
                const kx = gclamp(Math.floor(P[i * 3] * inv) - G0, NX - 1);
                const ky = gclamp(Math.floor(P[i * 3 + 1] * inv) - GY0, NY - 1);
                const kz = gclamp(Math.floor(P[i * 3 + 2] * inv) - G0, NZ - 1);
                const c = (ky * NZ + kz) * NX + kx;
                if (head[c] < 0) occ[nOcc++] = c;
                next[i] = head[c]; head[c] = i;
            }
        }
        function lengthPass() {
            for (let pass = 0; pass < 2; pass++) {
                for (const s of list) {
                    const b = s.off;
                    for (let q = 0; q < s.n - 1; q++) {
                        const i = (pass === 0) ? (b + q) : (b + s.n - 2 - q);
                        const i3 = i * 3, j3 = i3 + 3;
                        const dx = P[j3] - P[i3], dy = P[j3 + 1] - P[i3 + 1], dz = P[j3 + 2] - P[i3 + 2];
                        const d = Math.hypot(dx, dy, dz) || 1e-9;
                        const c = (d - ds) / d * 0.5;
                        P[i3] += dx * c; P[i3 + 1] += dy * c; P[i3 + 2] += dz * c;
                        P[j3] -= dx * c; P[j3 + 1] -= dy * c; P[j3 + 2] -= dz * c;
                    }
                }
            }
        }
        const bendLen = 2 * ds * 0.985;
        const bendK = Math.min(0.55, 0.22 + 0.10 * (men.w / men.h - 1));
        function bendPass() {
            for (const s of list) {
                const b = s.off;
                for (let q = 0; q < s.n - 2; q++) {
                    const i3 = (b + q) * 3, j3 = i3 + 6;
                    const dx = P[j3] - P[i3], dy = P[j3 + 1] - P[i3 + 1], dz = P[j3 + 2] - P[i3 + 2];
                    const d = Math.hypot(dx, dy, dz) || 1e-9;
                    if (d >= bendLen) continue;
                    const c = (d - bendLen) / d * 0.5 * bendK;
                    P[i3] += dx * c; P[i3 + 1] += dy * c; P[i3 + 2] += dz * c;
                    P[j3] -= dx * c; P[j3 + 1] -= dy * c; P[j3 + 2] -= dz * c;
                }
            }
        }
        const OFF = [];
        for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (dz > 0 || (dz === 0 && dy > 0) || (dz === 0 && dy === 0 && dx > 0)) OFF.push([dx, dy, dz]);
        }
        let repelK = 0.85;
        function solvePair(i, j) {
            if (sid[j] === sid[i]) {
                const dl = loc[j] - loc[i];
                if (dl <= 2 && dl >= -2) return;
            }
            const i3 = i * 3, j3 = j * 3;
            const ex = P[j3] - P[i3], ey = P[j3 + 1] - P[i3 + 1], ez = P[j3 + 2] - P[i3 + 2];
            const q2 = ex * ex + ey * ey + ez * ez;
            if (q2 >= d2min || q2 < 1e-12) return;
            const d = Math.sqrt(q2);
            const c = (d - rc * 2) / d * 0.5 * repelK;
            P[i3] += ex * c; P[i3 + 1] += ey * c; P[i3 + 2] += ez * c;
            P[j3] -= ex * c; P[j3 + 1] -= ey * c; P[j3 + 2] -= ez * c;
        }
        function repelPass(k) {
            repelK = k;
            for (let q = 0; q < nOcc; q++) {
                const cc = occ[q];
                const kx = cc % NX, kz = ((cc - kx) / NX) % NZ, ky = (cc - kx - kz * NX) / (NX * NZ);
                for (let i = head[cc]; i >= 0; i = next[i]) {
                    for (let j = next[i]; j >= 0; j = next[j]) solvePair(i, j);
                    for (let o3 = 0; o3 < 13; o3++) {
                        const gx = kx + OFF[o3][0], gy2 = ky + OFF[o3][1], gz = kz + OFF[o3][2];
                        if (gx < 0 || gx >= NX || gy2 < 0 || gy2 >= NY || gz < 0 || gz >= NZ) continue;
                        for (let j = head[(gy2 * NZ + gz) * NX + gx]; j >= 0; j = next[j]) solvePair(i, j);
                    }
                }
            }
        }
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
                        if (r > 1e-6) { P[i3] = x * res[0] / r; P[i3 + 2] = z * res[0] / r; }
                        P[i3 + 1] = res[1];
                    }
                }
                if (P[i3 + 1] < floorY + rc) P[i3 + 1] = floorY + rc;
            }
        }

        for (let step = 0; step < steps; step++) {
            for (let i = 0; i < nTot; i++) {
                const i3 = i * 3;
                const vx = (P[i3] - Q[i3]) * damp;
                const vy = (P[i3 + 1] - Q[i3 + 1]) * damp + gy * dt * dt;
                const vz = (P[i3 + 2] - Q[i3 + 2]) * damp;
                Q[i3] = P[i3]; Q[i3 + 1] = P[i3 + 1]; Q[i3 + 2] = P[i3 + 2];
                P[i3] += vx; P[i3 + 1] += vy; P[i3 + 2] += vz;
            }
            rebuild();
            for (let it = 0; it < iters; it++) { lengthPass(); bendPass(); repelPass(0.85); wallPass(); }
        }
        // 仕上げの平滑化。均したあとに必ず拘束を入れ直す
        for (let pass = 0; pass < 2; pass++) {
            for (const s of list) {
                const b = s.off;
                const cp = new Float64Array(s.n * 3);
                for (let i = 0; i < s.n * 3; i++) cp[i] = P[b * 3 + i];
                for (let i = 1; i < s.n - 1; i++) {
                    for (let c = 0; c < 3; c++) {
                        P[(b + i) * 3 + c] = cp[i * 3 + c] * 0.74 + (cp[(i - 1) * 3 + c] + cp[(i + 1) * 3 + c]) * 0.13;
                    }
                }
            }
            rebuild();
            for (let it = 0; it < finish; it++) { lengthPass(); repelPass(1.0); wallPass(); }
        }
        lengthPass();

        let top = -1e9;
        for (const s of list) {
            const b = s.off;
            for (let i = 0; i < s.n * 3; i++) s.pts[i] = P[b * 3 + i];
            for (let i = 0; i < s.n; i++) if (s.pts[i * 3 + 1] > top) top = s.pts[i * 3 + 1];
        }
        return { top: top, points: nTot, rc: rc };
    }

    // =================================================================
    // 7. Sweep : 角丸断面の掃引
    // =================================================================
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

    // 回転最小フレーム（二重反射法）
    function frames(pts, n) {
        const T = new Float64Array(n * 3), U = new Float64Array(n * 3), Vv = new Float64Array(n * 3);
        for (let i = 0; i < n; i++) {
            const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
            const tx = pts[b * 3] - pts[a * 3], ty = pts[b * 3 + 1] - pts[a * 3 + 1], tz = pts[b * 3 + 2] - pts[a * 3 + 2];
            const l = Math.hypot(tx, ty, tz) || 1;
            T[i * 3] = tx / l; T[i * 3 + 1] = ty / l; T[i * 3 + 2] = tz / l;
        }
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
            Vv[i * 3] = ty * uz - tz * uy; Vv[i * 3 + 1] = tz * ux - tx * uz; Vv[i * 3 + 2] = tx * uy - ty * ux;
        }
        return { T: T, U: U, V: Vv };
    }

    // 「平らな面を水平へ」の補正角（初回は π 周期で折り返す）
    function flatRoll(fr, n, flat, twist, rng) {
        const ang = new Float64Array(n);
        let prev = 0, wind = 0, init = true;
        const ph = rng.range(0, TAU), fq = rng.range(0.10, 0.26);
        for (let i = 0; i < n; i++) {
            const tx = fr.T[i * 3], tz = fr.T[i * 3 + 2];
            let hx = -tz, hz = tx;
            const hl = Math.hypot(hx, hz);
            let a;
            if (hl < 1e-4) a = prev;
            else {
                hx /= hl; hz /= hl;
                const du = hx * fr.U[i * 3] + hz * fr.U[i * 3 + 2];
                const dv = hx * fr.V[i * 3] + hz * fr.V[i * 3 + 2];
                a = Math.atan2(dv, du);
                if (init) { init = false; wind = -Math.round(a / Math.PI) * Math.PI; }
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

    // --- ちぢれの波 ------------------------------------------------------
    // 【対策】芯線の刻み（2.6mm）のまま波を足すと、1波長に 5 点しか乗らず
    // 折れ線の針金になる。Catmull-Rom で刻みを細かくしてから波を足す。
    // 波は水平方向を主に、鉛直にも半分の周期で少しだけ入れる（ねじれた縮れ）
    function strandPath(s, men, rng) {
        if (!(men.wave > 0)) return { pts: s.pts, n: s.n, ds: men.seg };
        const up = Math.max(1, Math.ceil(men.seg / (men.waveLen / 5)));
        const n0 = s.n, n = (n0 - 1) * up + 1, S = s.pts;
        const P = new Float64Array(n * 3);
        for (let i = 0; i < n0 - 1; i++) {
            const i0 = Math.max(0, i - 1), i2 = i + 1, i3 = Math.min(n0 - 1, i + 2);
            for (let k = 0; k < up; k++) {
                const u = k / up, u2 = u * u, u3 = u2 * u;
                for (let c = 0; c < 3; c++) {
                    const p0 = S[i0 * 3 + c], p1 = S[i * 3 + c], p2 = S[i2 * 3 + c], p3 = S[i3 * 3 + c];
                    P[(i * up + k) * 3 + c] = 0.5 * (2 * p1 + (-p0 + p2) * u
                        + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
                }
            }
        }
        for (let c = 0; c < 3; c++) P[(n - 1) * 3 + c] = S[(n0 - 1) * 3 + c];
        const out = new Float64Array(n * 3);
        const ph = rng.range(0, TAU), ph2 = rng.range(0, TAU);
        const kk = TAU / (men.waveLen * rng.range(0.85, 1.15));
        let arc = 0, hx = 1, hz = 0;
        for (let i = 0; i < n; i++) {
            if (i > 0) arc += Math.hypot(P[i * 3] - P[i * 3 - 3], P[i * 3 + 1] - P[i * 3 - 2], P[i * 3 + 2] - P[i * 3 - 1]);
            const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
            const tx = P[b * 3] - P[a * 3], tz = P[b * 3 + 2] - P[a * 3 + 2];
            const l = Math.hypot(tx, tz);
            if (l > 1e-5) { hx = -tz / l; hz = tx / l; }
            const amp = men.wave * (0.75 + 0.25 * Math.sin(arc * 0.37 + ph2));
            const w1 = Math.sin(kk * arc + ph) * amp;
            out[i * 3] = P[i * 3] + hx * w1;
            out[i * 3 + 1] = P[i * 3 + 1] + Math.sin(kk * arc * 0.5 + ph2) * amp * 0.35;
            out[i * 3 + 2] = P[i * 3 + 2] + hz * w1;
        }
        return { pts: out, n: n, ds: men.seg / up };
    }

    // --- 麺1杯ぶんを1メッシュにまとめる -----------------------------------
    function buildNoodles(scene, strands, men, seed) {
        const NS = men.div || 8;
        const sec = sectionShape(NS, men.n);
        const rng = new Rng(seed ^ 0x9E37);
        const nz = new Noise(seed ^ 0x5A5A);
        const use = strands;
        if (!use.length) return null;
        const paths = use.map((s) => strandPath(s, men, new Rng(seed ^ ((s.off + 17) * 2246822519))));

        let nV = 0, nI = 0;
        for (const p of paths) { nV += p.n * (NS + 1) + 2; nI += (p.n - 1) * NS * 6 + NS * 6; }
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const colors = new Float32Array(nV * 4);
        const indices = new Uint32Array(nI);

        // 混み具合（接触の谷を暗くする）
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
                c += dens.get((gx + dx + 512) * 1048576 + (gy + dy + 512) * 1024 + (gz + dz + 512)) || 0;
            }
            return c;
        }
        // 周囲の点数は刻みで変わる。そばの刻み 0.28cm を基準に正規化する
        const occK = men.seg / 0.28;

        const MC = men.col;
        const PALE = lin3(MC.pale), BASE = lin3(MC.base), DEEP = lin3(MC.deep), CUT = lin3(MC.cut);
        const a0 = men.w * 0.5, b0 = men.h * 0.5;

        let vo = 0, io = 0;
        for (let q = 0; q < use.length; q++) {
            const s = use[q], path = paths[q], PT = path.pts, n = path.n;
            const fr = frames(PT, n);
            const roll = flatRoll(fr, n, men.flat, men.twist, new Rng(seed ^ (s.off * 2654435761)));
            const base = vo;
            const strandPh = rng.range(0, 100);
            const arcs = new Float64Array(n);
            for (let i = 1; i < n; i++) {
                arcs[i] = arcs[i - 1] + Math.hypot(PT[i * 3] - PT[i * 3 - 3], PT[i * 3 + 1] - PT[i * 3 - 2], PT[i * 3 + 2] - PT[i * 3 - 1]);
            }
            const total = arcs[n - 1];
            for (let i = 0; i < n; i++) {
                const arc = arcs[i];
                const px = PT[i * 3], py = PT[i * 3 + 1], pz = PT[i * 3 + 2];
                const sw = 1 + men.wobble * (nz.n2(arc * 1.35 + strandPh, strandPh * 0.7, 0, 0) - 0.5) * 2;
                const endT = Math.min(smoothstep(0, 1.1, arc), smoothstep(0, 1.1, total - arc));
                const shrink = mix(0.90, 1.0, endT);
                const a = a0 * sw * shrink, b = b0 * sw * shrink;
                const ca = Math.cos(roll[i]), sa = Math.sin(roll[i]);
                const lf = s.lift ? 0.45 : 1;
                const crowd = clamp((occAt(px, py, pz) * occK - 5) / 16, 0, 1) * lf;
                const high = smoothstep(MOUND_TOP - 1.5, MOUND_TOP - 0.15, py) * lf;
                for (let j = 0; j <= NS; j++) {
                    const lx = sec.cs[j] * a, ly = sec.sn[j] * b;
                    const ox = lx * ca - ly * sa, oy = lx * sa + ly * ca;
                    const p3 = vo * 3, p2 = vo * 2, p4 = vo * 4;
                    positions[p3] = px + fr.U[i * 3] * ox + fr.V[i * 3] * oy;
                    positions[p3 + 1] = py + fr.U[i * 3 + 1] * ox + fr.V[i * 3 + 1] * oy;
                    positions[p3 + 2] = pz + fr.U[i * 3 + 2] * ox + fr.V[i * 3 + 2] * oy;
                    uvs[p2] = j / NS; uvs[p2 + 1] = arc / (men.uvLen || 1.6) + strandPh;
                    const upness = (fr.U[i * 3 + 1] * ox + fr.V[i * 3 + 1] * oy) / (b || 1);
                    let t = clamp(0.5 + upness * 0.28 + high * 0.30 - crowd * 0.19 + s.tone * 0.055, 0, 1);
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
            const capA = vo, capB = vo + 1;
            for (let e = 0; e < 2; e++) {
                const i = e === 0 ? 0 : n - 1;
                positions[vo * 3] = PT[i * 3]; positions[vo * 3 + 1] = PT[i * 3 + 1]; positions[vo * 3 + 2] = PT[i * 3 + 2];
                uvs[vo * 2] = 0.5; uvs[vo * 2 + 1] = 0.5;
                colors[vo * 4] = CUT[0]; colors[vo * 4 + 1] = CUT[1]; colors[vo * 4 + 2] = CUT[2]; colors[vo * 4 + 3] = 1;
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
        // 【対策】麺の山に orientOutward を使わない（重心が麺の中に落ちる）。
        // 巻き順は掃引の時点で外向きに決め打ちしてある
        const normals = computeNormals(positions, indices);
        weldNormals(positions, normals);

        const mesh = new BABYLON.Mesh("noodles", scene);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals;
        vd.uvs = uvs; vd.colors = colors;
        vd.applyToMesh(mesh, true);
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
    // 中華麺はそばより表面が滑らかで、照りが強い。切り刃の筋と、
    // かん水で締まった表面の細かい凹凸（くぼみに水膜が溜まる）だけにする。
    function noodleTextures(scene, men, seed) {
        const S = Math.max(128, Math.round(CFG.texSize * 0.5) || 512), s2 = S * S;
        const nz = new Noise(seed);
        const H = new Float32Array(s2), pit = new Float32Array(s2), streak = new Float32Array(s2);
        for (let y = 0; y < S; y++) {
            const v = y / S;
            for (let x = 0; x < S; x++) {
                const u = x / S, i = y * S + x;
                const st = nz.fbm2(u * 26, v * 3, 3, 26, 3) - 0.5 + (nz.n2(u * 74, v * 5, 74, 5) - 0.5) * 0.45;
                streak[i] = st;
                const p = smoothstep(0.80, 0.95, nz.fbm2(u * 46 + 11, v * 46 + 7, 2, 46, 46));
                pit[i] = p;
                H[i] = clamp(0.5 + st * 0.16 - p * 0.18 + (nz.n2(u * 120, v * 120, 120, 120) - 0.5) * 0.05, 0, 1);
            }
        }
        const albedo = TexLab.make("menA", S, scene, (d) => {
            for (let i = 0; i < s2; i++) {
                const w = clamp(0.972 + streak[i] * 0.045 - pit[i] * 0.015, 0.90, 1.0);
                putRGB(d, i * 4, w, w * 0.996, w * 0.985);
            }
        }, {});
        const orm = TexLab.orm("menO", S, scene, (x, y, SS, o) => {
            const i = y * SS + x;
            o[0] = clamp(1 - pit[i] * 0.30, 0, 1);
            o[1] = clamp(0.32 - pit[i] * 0.15 + streak[i] * 0.03, 0.05, 0.9);
            o[2] = 0;
        }, {});
        const normal = TexLab.normalFromHeight("menN", S, scene, H, 0.0018, {});
        const coat = TexLab.make("menC", S, scene, (d) => {
            for (let i = 0; i < s2; i++) {
                const cov = clamp(0.78 + pit[i] * 0.22 - Math.max(0, streak[i]) * 0.20, 0, 1);
                const ro = clamp(0.100 + Math.max(0, streak[i]) * 0.26 - pit[i] * 0.08, 0.02, 0.8);
                putRGB(d, i * 4, cov, ro, 0);
            }
        }, { linear: true });
        return { albedo: albedo, orm: orm, normal: normal, coat: coat };
    }

    function noodleMaterial(scene, men, tex, name) {
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = tex.albedo;
        m.metallic = 0.0; m.roughness = 1.0;
        m.metallicTexture = tex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = tex.normal;
        m.bumpTexture.level = 0.60;
        // 照りは水膜（clearCoat）に持たせる
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = tex.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        m.clearCoat.intensity = 1.0;
        m.clearCoat.roughness = 0.110;
        m.clearCoat.indexOfRefraction = 1.335;
        // 【対策】中華麺は透ける。透光の色を黄へ振らないと、逆光で白く抜けて
        // 「うどんの細麺」になる
        m.subSurface.isTranslucencyEnabled = true;
        m.subBase = 0.46 * (men.sub === undefined ? 1 : men.sub);
        m.subSurface.translucencyIntensity = m.subBase;
        m.subSurface.tintColor = new BABYLON.Color3(s2l(men.tint[0]), s2l(men.tint[1]), s2l(men.tint[2]));
        m.subSurface.minimumThickness = men.h * 0.35;
        m.subSurface.maximumThickness = men.w * 1.05;
        m.texs = [tex.albedo, tex.orm, tex.normal, tex.coat];
        return m;
    }

    // =================================================================
    // 10. Soup : スープ面 / 香味油 / 麺の暗がり
    // =================================================================
    // スープ面は半透明の PBR 面。水中の麺は実物のメッシュを描き、
    // 水面からの深さに応じた RGB 別の吸収を頂点色へ焼く（天ぷらそばと同じ）。
    function rippleField(seed) {
        const N = 512, H = new Float32Array(N * N);
        const nz = new Noise(seed);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            H[y * N + x] = nz.fbm2(x / N * 9, y / N * 9, 3, 9, 9) - 0.5;
        }
        return { N: N, H: H };
    }

    function buildSoupSurface(scene, RF, waterR) {
        const NR = 80, NS = 180, MEN_RINGS = 4;
        const rows = NR + 1 + MEN_RINGS;
        const nV = rows * (NS + 1);
        const positions = new Float32Array(nV * 3), uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array((rows - 1) * NS * 6);
        const half = waterR + 0.35, N = RF.N;
        function rippleAt(x, z) {
            const fx = ((x / half * 0.5 + 0.5) * 2.4 % 1) * N, fz = ((z / half * 0.5 + 0.5) * 2.4 % 1) * N;
            const ix = Math.floor(fx) % N, iz = Math.floor(fz) % N;
            return RF.H[iz * N + ix];
        }
        let vo = 0;
        for (let i = 0; i < rows; i++) {
            let rr, yy;
            if (i <= NR) {
                const t = i / NR;
                rr = waterR * (Math.sqrt(t) * 0.5 + t * 0.5);
                yy = BROTH_Y;
            } else {
                // 【対策】水は器の内壁をわずかに這い上がる。直角に切ると板に見える
                const t = (i - NR) / MEN_RINGS;
                yy = BROTH_Y + 0.062 * Math.pow(t, 1.5);
                rr = innerRAt(yy) + 0.020;
            }
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                const x = rr * Math.cos(th), z = rr * Math.sin(th);
                positions[vo * 3] = x;
                positions[vo * 3 + 1] = yy + (i < NR ? rippleAt(x, z) * 0.012 : 0);
                positions[vo * 3 + 2] = z;
                uvs[vo * 2] = x / half * 0.5 + 0.5; uvs[vo * 2 + 1] = z / half * 0.5 + 0.5;
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
        const mesh = new BABYLON.Mesh("soup", scene);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals; vd.uvs = uvs;
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        named(mesh, "soup");
        mesh.receiveShadows = true;
        mesh.alphaIndex = 1;
        mesh.tris = (rows - 1) * NS * 2;
        return mesh;
    }

    // --- 香味油の油滴 -----------------------------------------------------
    // 【対策】油滴をテクスチャの円で描くと、照りが出ずに「水玉模様」になる。
    // 実物の油滴は水面に浮いた薄い凸レンズで、縁に環境が映り込んで円く光る。
    // 1個ずつ低いドームとして張り、スープより後に描く（alphaIndex）。
    // 大小の分布は対数一様にし、たまに大きな「油だまり」を混ぜる。
    function buildOil(scene, seed, amount, waterR, size) {
        const sz = size === undefined ? 1 : size;
        const rng = new Rng(seed ^ 0x0171);
        const g = new Geo();
        const N = Math.round(110 * amount);
        const clusters = [];
        for (let c = 0; c < 6; c++) {
            const a = rng.range(0, TAU), r = Math.sqrt(rng.next()) * (waterR - 2.0);
            clusters.push([Math.cos(a) * r, Math.sin(a) * r]);
        }
        const NA = 20, NRG = 4;
        const WHITE = [1, 1, 1];
        for (let k = 0; k < N; k++) {
            let x, z;
            if (rng.next() < 0.72) {
                const c = clusters[rng.int(clusters.length)];
                const a = rng.range(0, TAU), r = Math.pow(rng.next(), 0.7) * 2.2;
                x = c[0] + Math.cos(a) * r; z = c[1] + Math.sin(a) * r;
            } else {
                const a = rng.range(0, TAU), r = Math.sqrt(rng.next()) * (waterR - 0.6);
                x = Math.cos(a) * r; z = Math.sin(a) * r;
            }
            const big = rng.next() < 0.05;
            const R = (big ? rng.range(0.50, 0.85) : Math.exp(rng.range(Math.log(0.045), Math.log(0.40)))) * sz;
            if (Math.hypot(x, z) + R > waterR - 0.25) continue;
            const ex = big ? rng.range(1.0, 1.45) : rng.range(0.92, 1.10);
            const rot = rng.range(0, TAU);
            const h0 = 0.008 + 0.028 * R;
            const y0 = BROTH_Y + 0.012;
            const c0 = g.vert([x, y0 + h0, z], 0.5, 0.5, WHITE);
            const rings = [];
            for (let i = 1; i <= NRG; i++) {
                const t = i / NRG, row = [];
                for (let j = 0; j <= NA; j++) {
                    const th = (j % NA) / NA * TAU;
                    const lx = Math.cos(th) * R * t * ex, lz = Math.sin(th) * R * t / ex;
                    const px = x + lx * Math.cos(rot) - lz * Math.sin(rot);
                    const pz = z + lx * Math.sin(rot) + lz * Math.cos(rot);
                    row.push(g.vert([px, y0 + h0 * (1 - t * t), pz], 0.5, 0.5, WHITE));
                }
                rings.push(row);
            }
            for (let j = 0; j < NA; j++) triW(g, c0, rings[0][j], rings[0][j + 1], 0, 1, 0);
            for (let i = 0; i < NRG - 1; i++) {
                for (let j = 0; j < NA; j++) quadW(g, rings[i][j], rings[i + 1][j], rings[i + 1][j + 1], rings[i][j + 1], [0, 1, 0]);
            }
        }
        if (!g.idx.length) return null;
        const geo = g.finish(null);
        const m = toMesh("oil", geo, scene);
        m.alphaIndex = 2;
        m.tris = geo.indices.length / 3;
        return m;
    }

    // --- 麺の暗がり --------------------------------------------------------
    // 【対策】麺は MOUND_BOT より下に作らないので、そのままだとスープ越しに
    // 白い内底が見えて「麺が浮いている」ように見える。沈んだ麺のもつれを
    // 描いた円板を 1 枚置き、色は深さの吸収で決める（applySoup で更新）。
    function buildSoko(scene) {
        const y = MOUND_BOT - 0.12;
        const R = innerRAt(y) + 0.03;
        const disc = BABYLON.MeshBuilder.CreateDisc("soko", { radius: R, tessellation: 128 }, scene);
        named(disc, "soko");
        disc.rotation.x = Math.PI / 2;
        disc.position.y = y;
        const S = 1024;
        const dt = new BABYLON.DynamicTexture("sokoTex", { width: S, height: S }, scene, true);
        const ctx = dt.getContext();
        ctx.fillStyle = "rgb(120,120,120)";
        ctx.fillRect(0, 0, S, S);
        const rng = new Rng(0x50C0);
        const pxPerCm = S / (2 * R);
        ctx.lineCap = "round";
        for (let i = 0; i < 900; i++) {
            const cx = rng.range(0, S), cy = rng.range(0, S);
            const rr = rng.range(2.0, 5.0) * pxPerCm, a0 = rng.range(0, TAU), a1 = a0 + rng.range(0.4, 1.6);
            ctx.lineWidth = 12; ctx.strokeStyle = "rgba(60,60,60,0.55)";
            ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a1); ctx.stroke();
            ctx.lineWidth = 8; ctx.strokeStyle = "rgba(255,255,255,0.85)";
            ctx.beginPath(); ctx.arc(cx, cy, rr, a0, a1); ctx.stroke();
        }
        dt.update();
        const m = new BABYLON.PBRMaterial("sokoMat", scene);
        m.albedoTexture = dt;
        m.metallic = 0; m.roughness = 0.6;
        m.backFaceCulling = false;
        disc.material = m;
        disc.metadata = { depth: BROTH_Y - y, tex: dt };
        return disc;
    }

    // =================================================================
    // 11. Sundry : 箸 / 箸置き / ねぎ
    // =================================================================
    function woodTextures(scene, seed, opt) {
        const S = 256, s2 = S * S;
        const nz = new Noise(seed);
        const ring = new Float32Array(s2), fine = new Float32Array(s2);
        for (let y = 0; y < S; y++) {
            const v = y / S;
            for (let x = 0; x < S; x++) {
                const u = x / S, k = y * S + x;
                const lo = nz.fbm2(u * 2.2, v * 1.2, 3, 2, 1) - 0.5;
                const mi = nz.fbm2(u * 8.0, v * 4.0, 2, 8, 4) - 0.5;
                const t = u * opt.rings + (lo + mi * 0.35) * opt.wave;
                const f = t - Math.floor(t);
                const h = nz.hash2(Math.floor(t), 0);
                const w = 0.10 + 0.32 * h * h;
                let dd = Math.abs(f - 0.55); if (dd > 0.5) dd = 1 - dd;
                ring[k] = (0.2 + 0.8 * h) * (1 - smoothstep(w * 0.3, w, dd));
                fine[k] = nz.fbm2(u * 40, v * 300, 2, 40, 300);
            }
        }
        const albedo = TexLab.make("woodA", S, scene, (d) => {
            for (let k = 0; k < s2; k++) {
                const t = clamp(ring[k] * 0.8 + (fine[k] - 0.5) * 0.22, 0, 1);
                putRGB(d, k * 4, mix(opt.base[0], opt.grain[0], t), mix(opt.base[1], opt.grain[1], t), mix(opt.base[2], opt.grain[2], t));
            }
        }, {});
        const orm = TexLab.orm("woodO", S, scene, (x, y, SS, o) => {
            o[0] = 1; o[1] = clamp(opt.rough + 0.12 * ring[y * SS + x], 0.1, 0.98); o[2] = 0;
        }, {});
        const H = new Float32Array(s2);
        for (let k = 0; k < s2; k++) H[k] = clamp(0.5 - 0.3 * ring[k] + 0.2 * (fine[k] - 0.5), 0, 1);
        const normal = TexLab.normalFromHeight("woodN", S, scene, H, 0.004, {});
        return { albedo: albedo, orm: orm, normal: normal };
    }

    // 箸。長さの 2/3 まではほとんど細らず、先の 1/4 で一気に細くなる
    function buildChopstick(scene, name, rng, A, B, col) {
        const NL = 46, NS = 16;
        const g = new Geo();
        const ax = vnorm(vsub(B, A));
        let up = [0, 1, 0];
        if (Math.abs(vdot(up, ax)) > 0.97) up = [1, 0, 0];
        const e1 = vnorm(vcross(ax, up)), e2 = vnorm(vcross(e1, ax));
        const roll = rng.range(0, TAU);
        const rows = [];
        for (let i = 0; i < NL; i++) {
            const t = i / (NL - 1);
            let rad = mix(0.255, 0.082, Math.pow(t, 2.6));
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
                row.push(g.vert([c[0] + e1[0] * ox + e2[0] * oy, c[1] + e1[1] * ox + e2[1] * oy,
                c[2] + e1[2] * ox + e2[2] * oy], j / NS * 0.5, t * 7, col));
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
        const geo = g.finish([(A[0] + B[0]) * 0.5, (A[1] + B[1]) * 0.5, (A[2] + B[2]) * 0.5]);
        const m = toMesh(name, geo, scene);
        m.tris = geo.indices.length / 3;
        return m;
    }

    // 箸置き。上面を長手方向に掬って、箸が窪みに納まるようにする
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
                    const x = c0 + dx / dl * rr, z = c2 + dz / dl * rr;
                    let y = c1 + dy / dl * rr;
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

    // 刻みねぎ（小口切りの輪）。中が空き、切り口が白く、外皮だけ濃い緑
    function buildNegi(scene, count, seed, center, spread) {
        const rng = new Rng(seed);
        const NS = 14;
        const g = new Geo();
        const SKIN = lin3([0.212, 0.382, 0.145]);
        const CUT = lin3([0.762, 0.828, 0.640]);
        const INNER = lin3([0.560, 0.660, 0.470]);
        for (let c = 0; c < count; c++) {
            const ro = rng.range(0.16, 0.32);
            const ri = ro * rng.range(0.77, 0.89);
            const th = rng.range(0.065, 0.13);
            const a = rng.range(0, TAU);
            const rad = Math.sqrt(rng.next()) * spread;
            const cx = center[0] + Math.cos(a) * rad, cz = center[1] + Math.sin(a) * rad;
            const y = Math.max(BROTH_Y + 0.08, moundTopAt(Math.hypot(cx, cz)))
                + 0.10 + (1 - rad / spread) * 0.28 + rng.range(-0.02, 0.12);
            const tilt = rng.range(-0.55, 0.55), tilt2 = rng.range(-0.55, 0.55);
            const yaw = rng.range(0, TAU);
            const place = (lx, ly, lz) => {
                let x = lx, yy = ly, z = lz;
                let t = yy * Math.cos(tilt) - z * Math.sin(tilt); z = yy * Math.sin(tilt) + z * Math.cos(tilt); yy = t;
                t = x * Math.cos(tilt2) - yy * Math.sin(tilt2); yy = x * Math.sin(tilt2) + yy * Math.cos(tilt2); x = t;
                t = x * Math.cos(yaw) - z * Math.sin(yaw); z = x * Math.sin(yaw) + z * Math.cos(yaw); x = t;
                return [cx + x, y + yy, cz + z];
            };
            const C = [cx, y, cz];
            const r0 = [], r1 = [], r2 = [], r3 = [], sT = [], sB = [];
            for (let j = 0; j <= NS; j++) {
                const t = (j % NS) / NS * TAU;
                const wob = 1 + 0.10 * Math.sin(t * 3 + c);
                const co = Math.cos(t), si = Math.sin(t);
                r0.push(g.vert(place(co * ro * wob, th * 0.5, si * ro * wob), j / NS, 0, CUT));
                r1.push(g.vert(place(co * ro * wob, -th * 0.5, si * ro * wob), j / NS, 1, CUT));
                r2.push(g.vert(place(co * ri, -th * 0.5, si * ri), j / NS, 1, INNER));
                r3.push(g.vert(place(co * ri, th * 0.5, si * ri), j / NS, 0, INNER));
                sT.push(g.vert(place(co * ro * wob, th * 0.5, si * ro * wob), j / NS, 0, SKIN));
                sB.push(g.vert(place(co * ro * wob, -th * 0.5, si * ro * wob), j / NS, 1, SKIN));
            }
            const upv = vsub(place(0, 1, 0), C);
            for (let j = 0; j < NS; j++) {
                quadC(g, sT[j], sB[j], sB[j + 1], sT[j + 1], C);                     // 外皮
                quadW(g, r0[j], r0[j + 1], r3[j + 1], r3[j], upv);                   // 天の切り口
                quadW(g, r1[j], r2[j], r2[j + 1], r1[j + 1], vmul(upv, -1));         // 底の切り口
                // 内側は中心へ向ける
                const P = g.pos, a = r3[j], b = r2[j + 1];
                const m = [(P[a * 3] + P[b * 3]) * 0.5, (P[a * 3 + 1] + P[b * 3 + 1]) * 0.5, (P[a * 3 + 2] + P[b * 3 + 2]) * 0.5];
                quadW(g, r3[j], r3[j + 1], r2[j + 1], r2[j], vsub(C, m));
            }
        }
        if (!g.idx.length) return null;
        const geo = g.finish(null);
        const m = toMesh("negi", geo, scene);
        m.tris = geo.indices.length / 3;
        return m;
    }

    // =================================================================
    // 11b. Toppings : チャーシュー / 味玉 / メンマ / 海苔 ★
    // =================================================================

    // --- チャーシュー ------------------------------------------------------
    // 巻いたバラ肉を煮て輪切りにしたもの。
    // 【対策】アルキメデス螺旋に等幅の白い帯を載せると「なると」になる。
    // 実物の断面を見ると、渦は次の4点でなるとと違う。
    //   (1) 巻きは 1.5〜2 周しかなく、中心が偏っている（肉を手で巻くので）
    //   (2) 層の厚みが場所ごとに大きく違う。脂は太い所と消えかける所がある
    //   (3) 巻いた層の合わせ目がところどころ口を開け、細い暗い裂け目になる
    //       （写真の「ひび」はこれ。中心にも巻き始めの隙間がある）
    //   (4) 縁からたれが染みて、外側ほど肉も脂も茶に寄る。脂は白ではない
    // 肉には筋繊維が層に沿って走り、脂との境はぼやける。
    // 輪郭（rho）は形状とテクスチャで同じ関数を使う（焼き色の帯が縁からずれないように）
    const CH_M = 1.20;          // テクスチャの外周の余白（rho の最大 1.16 より大きく）
    function makeRho(seed) {
        const n = new Noise(seed);
        const p1 = n.hash2(3, 5) * 9, p2 = n.hash2(7, 1) * 9;
        // 巻いた肉は真円にならない。ゆるい楕円＋肉の段差でいびつにする
        return (th) => 1 + 0.085 * (n.n2(Math.cos(th) * 1.6 + p1, Math.sin(th) * 1.6 + p2, 0, 0) - 0.5) * 2
            + 0.035 * Math.sin(2 * th + p1) + 0.015 * Math.sin(5 * th + p2);
    }

    function chashuTextures(scene, rho, seed, name) {
        const S = 512, s2 = S * S;
        const nz = new Noise(seed);
        const C = CHASHU_STYLE[CFG.chashuStyle] || CHASHU_STYLE.shoyu;
        const H = new Float32Array(s2), RO = new Float32Array(s2), AO = new Float32Array(s2);
        const spin = nz.hash2(1, 2) * TAU;
        const turns = 2.3 + nz.hash2(4, 4) * 0.6;                  // 2.3〜2.9 周
        const ecx = (nz.hash2(9, 3) - 0.5) * 0.30, ecy = (nz.hash2(2, 8) - 0.5) * 0.30;
        const slitA = nz.hash2(6, 6) * Math.PI;
        const albedo = TexLab.make(name + "A", S, scene, (d) => {
            for (let y = 0; y < S; y++) {
                for (let x = 0; x < S; x++) {
                    const i = y * S + x;
                    const qx = ((x + 0.5) / S * 2 - 1) * CH_M, qy = ((y + 0.5) / S * 2 - 1) * CH_M;
                    const r = Math.hypot(qx, qy), th = Math.atan2(qy, qx);
                    const rn = r / rho(th);
                    // 渦の座標。偏心させ、低周波で歪める（手で巻いた層）
                    // 【対策】歪みが弱いと層が等間隔の螺旋に揃い、なるとに戻る
                    const wx = qx + (nz.fbm2(qx * 0.85 + 3, qy * 0.85 + 7, 3) - 0.5) * 0.50;
                    const wy = qy + (nz.fbm2(qx * 0.85 + 11, qy * 0.85 + 1, 3) - 0.5) * 0.50;
                    const px = wx - ecx * (1 - Math.min(1, rn)), py = wy - ecy * (1 - Math.min(1, rn));
                    const rs = Math.hypot(px, py), ts = Math.atan2(py, px);
                    const sp = rs * turns + (ts + spin) / TAU;
                    const k = Math.floor(sp), g = sp - k;
                    // 【対策】層に沿った座標は ψ = ts − 2πk で取る。ts や sp のままだと
                    // atan2 の切れ目（θ = ±π）で模様が一直線に食い違う
                    const psi = ts - TAU * k;
                    // 1巻き = [肉 … 脂][合わせ目]。g = 0/1 が合わせ目で、模様の不連続も
                    // そこに寄せる（実物でも層がずれる所）
                    // 脂の厚みは途切れるほど揺らす（等幅の帯はなるとの特徴）
                    const wf = 0.32 * smoothstep(0.36, 0.68, nz.fbm2(psi * 0.45 + 3.1, 11.3, 3));
                    const fat = smoothstep(1 - wf - 0.05, 1 - wf + 0.03, g) * (1 - smoothstep(0.975, 1.0, g))
                        * smoothstep(0.12, 0.24, rs);
                    // 肉の中の薄い膜・霜（途切れがち）
                    const gm = 0.38 + 0.10 * (nz.n2(psi * 0.9 + 5, 2.7, 0, 0) - 0.5) * 2;
                    const marb = (1 - smoothstep(0.006, 0.030, Math.abs(g - gm)))
                        * smoothstep(0.50, 0.72, nz.fbm2(psi * 1.8 + 21, 7.7, 2)) * 0.45;
                    // 合わせ目。ところどころ口を開けて暗い裂け目になる
                    const dg = Math.min(g, 1 - g);
                    const open = smoothstep(0.54, 0.68, nz.fbm2(psi * 1.1 + 41, 3.3, 3));
                    let seam = (1 - smoothstep(0.004, 0.020, dg)) * open * smoothstep(0.14, 0.28, rs);
                    const seamLine = (1 - smoothstep(0.0, 0.045, dg)) * smoothstep(0.14, 0.28, rs);
                    // 巻き始めの隙間（中心の短い裂け目）
                    const lx = px * Math.cos(slitA) + py * Math.sin(slitA), ly = -px * Math.sin(slitA) + py * Math.cos(slitA);
                    seam = Math.max(seam, (1 - smoothstep(0.006, 0.020, Math.abs(ly + 0.10 * lx * lx)))
                        * (1 - smoothstep(0.08, 0.20, Math.abs(lx))));
                    // 筋繊維は層に沿って長く、層を横切る向きに細かい
                    // （巻きの番号 k は切れ目で飛ぶので使わない。ψ と g だけで決める）
                    // 【対策】繊維を長い筋で描くと木目になる。煮た肉の切り口は繊維の
                    // 断面が並んだ細かいざらつきで、層に沿って少し伸びる程度
                    const fib = nz.fbm2(psi * 5.5, g * 13, 3);
                    const fib2 = nz.fbm2(qx * 38 + 7, qy * 38 + 3, 2);
                    const pore = smoothstep(0.66, 0.80, nz.fbm2(qx * 70 + 1, qy * 70 + 9, 2));
                    const tone = (nz.fbm2(psi * 0.35 + 9, g * 2.5, 2) - 0.5) * 0.45;   // 筋肉ごとの色の差
                    let col = mix3(C.meatDeep, C.meat, clamp(0.55 + tone + (fib - 0.5) * 0.7 + (fib2 - 0.5) * 0.55 - pore * 0.25, 0, 1));
                    // 脂は半透明で、下の肉色が少し透ける
                    const fatCol = mix3(mix3(C.fat, C.fatIn, smoothstep(0.95, 0.35, rn) * (0.6 + 0.4 * fib2)), col, 0.22);
                    // 皮下の脂。焼き色のすぐ内側に淡い帯が残る（巻いた外皮の層）
                    const e0 = rn + (nz.fbm2(Math.cos(th) * 3 + 2, Math.sin(th) * 3 + 8, 2) - 0.5) * 0.08;
                    const skinFat = smoothstep(0.83, 0.86, e0) * (1 - smoothstep(0.91, 0.93, e0))
                        * clamp(nz.fbm2(Math.cos(th) * 2.5 + 31, Math.sin(th) * 2.5, 2) * 1.4 - 0.2, 0, 0.8);
                    col = mix3(col, fatCol, Math.max(fat, marb, skinFat));
                    // たれの染み込み。縁から内へ、合わせ目に沿っても入る
                    const e = rn + (nz.fbm2(Math.cos(th) * 3 + 2, Math.sin(th) * 3 + 8, 2) - 0.5) * 0.08;
                    // 脂は肉よりたれを吸う
                    const soak = clamp(smoothstep(0.78, 0.97, e) * (0.70 + 0.20 * Math.max(fat, skinFat))
                        + C.tareIn * 0.30 + seamLine * open * 0.30, 0, 1);
                    col = mix3(col, mix3(col, C.tare, 0.80), soak);
                    // 縁の焼き色（外皮）。厚みは一定にしない
                    const crustW = 0.035 + 0.035 * nz.fbm2(Math.cos(th) * 4 + 5, Math.sin(th) * 4, 2);
                    // 焼き色の境はくっきり。ぼかすと縁が光って見える
                    col = mix3(col, C.crust, smoothstep(1 - crustW - 0.006, 1 - crustW + 0.006, e) * (0.85 + 0.15 * fib2));
                    col = mix3(col, C.seam, seam * 0.92);
                    H[i] = clamp(0.5 + (fib - 0.5) * 0.25 + (fib2 - 0.5) * 0.12 + Math.max(fat, skinFat) * 0.06 - seam * 0.55
                        + smoothstep(0.93, 1.0, e) * (fib2 - 0.5) * 0.3, 0, 1);
                    // 脂とたれの縁は艶、肉の切り口はしっとり、裂け目はつや消し
                    RO[i] = clamp(0.56 + pore * 0.08 - fat * 0.22 - smoothstep(0.88, 1.0, e) * 0.18 + seam * 0.3 + (fib2 - 0.5) * 0.10, 0.12, 0.95);
                    AO[i] = 1 - seam * 0.6;
                    putRGB(d, i * 4, col[0], col[1], col[2]);
                }
            }
        }, { clampU: true, clampV: true });
        const orm = TexLab.orm(name + "O", S, scene, (x, y, SS, o) => {
            const i = y * SS + x;
            o[0] = AO[i]; o[1] = RO[i]; o[2] = 0;
        }, { clampU: true, clampV: true });
        const normal = TexLab.normalFromHeight(name + "N", S, scene, H, 0.007, { clampU: true, clampV: true });
        return { albedo: albedo, orm: orm, normal: normal };
    }

    function buildChashu(g, rho, opt) {
        const lf = localFrame(opt.at, opt.fwd, opt.up);
        const RX = opt.rx, RZ = opt.rz, TH = opt.th, CV = opt.curve;
        const NR = 28, NA = 110, WHITE = [1, 1, 1];
        const bn = new Noise(opt.seed);
        const drape = (ls, lz) => -CV * (ls * ls + lz * lz * 0.45);
        function P(rn, th, top) {
            const rr = rn * rho(th);
            const qx = Math.cos(th) * rr, qy = Math.sin(th) * rr;
            const ls = qx * RX, lz = qy * RZ;
            const edge = smoothstep(0.80, 1.0, rn);
            const bump = top ? (bn.fbm2(qx * 5 + 3, qy * 5 + 1, 3) - 0.5) * 0.05 : 0;
            const lv = drape(ls, lz) + (top ? TH * 0.5 * (1 - 0.45 * edge * edge) + bump
                : -TH * 0.5 * (1 - 0.35 * edge * edge));
            return g.vert(lf.at(ls, lv, lz), qx / (2 * CH_M) + 0.5, qy / (2 * CH_M) + 0.5, WHITE);
        }
        const top = [], bot = [];
        for (let i = 1; i <= NR; i++) {
            const rt = [], rb = [];
            for (let j = 0; j <= NA; j++) {
                const th = (j % NA) / NA * TAU;
                rt.push(P(i / NR, th, true)); rb.push(P(i / NR, th, false));
            }
            top.push(rt); bot.push(rb);
        }
        const ct = g.vert(lf.at(0, drape(0, 0) + TH * 0.5, 0), 0.5, 0.5, WHITE);
        const cb = g.vert(lf.at(0, drape(0, 0) - TH * 0.5, 0), 0.5, 0.5, WHITE);
        const vUp = lf.v, vDn = vmul(lf.v, -1);
        for (let j = 0; j < NA; j++) {
            triW(g, ct, top[0][j], top[0][j + 1], vUp[0], vUp[1], vUp[2]);
            triW(g, cb, bot[0][j], bot[0][j + 1], vDn[0], vDn[1], vDn[2]);
        }
        for (let i = 0; i < NR - 1; i++) {
            for (let j = 0; j < NA; j++) {
                quadW(g, top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1], vUp);
                quadW(g, bot[i][j], bot[i + 1][j], bot[i + 1][j + 1], bot[i][j + 1], vDn);
            }
        }
        for (let j = 0; j < NA; j++) {
            const th = (j + 0.5) / NA * TAU;
            const w = vadd(vmul(lf.s, Math.cos(th) * RZ), vmul(lf.f, Math.sin(th) * RX));
            quadW(g, top[NR - 1][j], bot[NR - 1][j], bot[NR - 1][j + 1], top[NR - 1][j + 1], w);
        }
    }

    // --- 味玉（半割り）-----------------------------------------------------
    // 卵の断面は丸くない。尖った端と丸い端があり、黄身は丸い端へ寄る。
    // 黄身は3段: 半熟の芯（濃い橙）→ ゲル状（橙）→ 固まりかけた外周（明るい）。
    // 味玉は外側がたれで茶色く、切り口の縁だけ白身へしみる。
    function buildEgg(g, rng, nz, opt) {
        const lf = localFrame(opt.at, opt.fwd, opt.up);
        const a = opt.a, b = opt.b;
        const NU = 64, NP = 40, NW = 40;
        const st = EGG[opt.style] || EGG.ajitama;
        const OUT = lin3(st.outer), OUTD = lin3(st.outerDeep), WH = lin3(EGG.white);
        const YC = lin3(EGG.yolkCore), YG = lin3(EGG.yolkGel), YE = lin3(EGG.yolkEdge);
        const ph = rng.range(0, 20);
        const rad = (x) => b * Math.sqrt(Math.max(0, 1 - (x / a) * (x / a))) * (1 + 0.09 * x / a);
        const xs = [];
        for (let i = 0; i <= NU; i++) xs.push(a * Math.sin(-Math.PI / 2 + Math.PI * i / NU));
        const C = lf.at(0, -b * 0.35, 0);
        // 外側（ドーム）
        const dome = [];
        for (let i = 0; i <= NU; i++) {
            const x = xs[i], r = rad(x), row = [];
            for (let j = 0; j <= NP; j++) {
                const phi = Math.PI * j / NP;
                const m = clamp(nz.fbm2(x * 1.3 + ph, phi * 2.1 + 3, 3) * 1.4 - 0.25, 0, 1);
                row.push(g.vert(lf.at(r * Math.cos(phi), -r * Math.sin(phi), x), i / NU, j / NP, mix3(OUT, OUTD, m)));
            }
            dome.push(row);
        }
        for (let i = 0; i < NU; i++) {
            for (let j = 0; j < NP; j++) quadC(g, dome[i][j], dome[i + 1][j], dome[i + 1][j + 1], dome[i][j + 1], C);
        }
        // 切り口
        const x0 = 0.12 * a, ya = 0.54 * a, yb = 0.60 * b;
        const face = [];
        for (let i = 0; i <= NU; i++) {
            const x = xs[i], r = rad(x), row = [];
            for (let j = 0; j <= NW; j++) {
                const w = -1 + 2 * j / NW, z = w * r;
                let d = Math.hypot((x - x0) / ya, z / yb);
                d *= 1 + 0.05 * (nz.n2(Math.atan2(z, x - x0) * 1.6 + ph, 2.3, 0, 0) - 0.5) * 2;
                let col, lv;
                if (d < 1) {
                    col = mix3(YC, YG, smoothstep(0.20, 0.70, d));
                    col = mix3(col, YE, smoothstep(0.72, 0.97, d));
                    // 半熟の黄身は切り口から少し盛り上がる
                    lv = 0.10 * opt.s * Math.pow(1 - d * d, 0.7) + 0.004;
                } else {
                    col = WH;
                    const aw = Math.abs(w);
                    col = mix3(col, OUT, smoothstep(0.88, 1.0, aw) * st.stain * 0.75);
                    // 黄身のきわの白身はわずかに透けて灰がかる
                    col = mix3(col, mix3(WH, YE, 0.25), (1 - smoothstep(1.0, 1.12, d)) * 0.5);
                    lv = -0.012 * (1 - aw * aw) * (1 - smoothstep(1.0, 1.3, d));
                }
                row.push(g.vert(lf.at(z, lv, x), i / NU, j / NW, col));
            }
            face.push(row);
        }
        for (let i = 0; i < NU; i++) {
            for (let j = 0; j < NW; j++) quadW(g, face[i][j], face[i + 1][j], face[i + 1][j + 1], face[i][j + 1], lf.v);
        }
    }

    // --- メンマ ------------------------------------------------------------
    // 繊維が長手に走る、飴色で半透明の板。節の跡が横に薄く入る。
    function menmaTextures(scene, seed) {
        const S = 256, s2 = S * S;
        const nz = new Noise(seed);
        const H = new Float32Array(s2), K = new Float32Array(s2);
        for (let y = 0; y < S; y++) {
            const v = y / S;
            for (let x = 0; x < S; x++) {
                const u = x / S, i = y * S + x;
                const fib = nz.fbm2(u * 2, v * 48, 3, 2, 48);
                const fine = nz.n2(u * 6, v * 150, 6, 150);
                const nd = u * 2 + (nz.fbm2(u * 2, v * 3, 2, 2, 3) - 0.5) * 0.3;
                const node = Math.exp(-Math.pow((nd - Math.round(nd)) / 0.035, 2)) * 0.35;
                K[i] = clamp(0.55 + (fib - 0.5) * 1.5 + (fine - 0.5) * 0.45 - node, 0, 1);
                H[i] = clamp(0.5 + (fib - 0.5) * 0.5 + (fine - 0.5) * 0.25 - node * 0.5, 0, 1);
            }
        }
        const albedo = TexLab.make("menmaA", S, scene, (d) => {
            for (let i = 0; i < s2; i++) {
                const c = mix3(MENMA_D, MENMA_L, K[i]);
                putRGB(d, i * 4, c[0], c[1], c[2]);
            }
        }, {});
        const normal = TexLab.normalFromHeight("menmaN", S, scene, H, 0.006, {});
        return { albedo: albedo, normal: normal };
    }

    function buildMenma(g, rng, nz, opt) {
        const lf = localFrame(opt.at, opt.fwd, opt.up);
        const NL = 20, NW = 6, WHITE = [1, 1, 1];
        const ph = rng.range(0, 20);
        const L = opt.L, W = opt.W, T = opt.T;
        const halfW = (t) => W * 0.5 * (1 + 0.12 * (nz.n2(t * 3 + ph, ph, 0, 0) - 0.5) * 2);
        const thick = (t) => T * (0.80 + 0.40 * t);           // 根元側が厚い
        const arch = (t) => opt.bend * (1 - Math.pow((t - 0.5) * 2, 2));
        const twist = rng.pm(0.14);
        const u0 = rng.range(0, 1);
        function P(t, wn, side) {
            const ls = wn * halfW(t);
            const lv = arch(t) + side * thick(t) * 0.5 * (1 - 0.35 * wn * wn) + ls * Math.sin(twist * (t - 0.5) * 2);
            return g.vert(lf.at(ls, lv, (t - 0.5) * L), u0 + t * 0.6, 0.5 + wn * 0.18 + side * 0.01, WHITE);
        }
        const top = [], bot = [];
        for (let i = 0; i <= NL; i++) {
            const t = i / NL, rt = [], rb = [];
            for (let j = 0; j <= NW; j++) { const wn = -1 + 2 * j / NW; rt.push(P(t, wn, 1)); rb.push(P(t, wn, -1)); }
            top.push(rt); bot.push(rb);
        }
        const vD = vmul(lf.v, -1), sN = vmul(lf.s, -1), fN = vmul(lf.f, -1);
        for (let i = 0; i < NL; i++) {
            for (let j = 0; j < NW; j++) {
                quadW(g, top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1], lf.v);
                quadW(g, bot[i][j], bot[i + 1][j], bot[i + 1][j + 1], bot[i][j + 1], vD);
            }
            quadW(g, top[i][0], top[i + 1][0], bot[i + 1][0], bot[i][0], sN);
            quadW(g, top[i][NW], top[i + 1][NW], bot[i + 1][NW], bot[i][NW], lf.s);
        }
        for (let j = 0; j < NW; j++) {
            quadW(g, top[0][j], top[0][j + 1], bot[0][j + 1], bot[0][j], fN);
            quadW(g, top[NL][j], top[NL][j + 1], bot[NL][j + 1], bot[NL][j], lf.f);
        }
    }

    // --- 海苔 --------------------------------------------------------------
    // 丼の奥で口縁に立てかける。下の 3 割はスープに浸かる。
    // 【対策】平らな板のまま立てかけると、左右の角が口縁の手前で内壁を
    // 突き抜ける。紙のしなりとして、器の丸みに沿うよう横方向に反らせる。
    function noriTextures(scene, seed) {
        const S = 512, s2 = S * S;
        const nz = new Noise(seed);
        const H = new Float32Array(s2), K = new Float32Array(s2);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const u = x / S, v = y / S, i = y * S + x;
            const base = nz.fbm2(u * 6, v * 6, 3, 6, 6);
            const fib = nz.fbm2(u * 40, v * 40, 2, 40, 40);
            const dots = smoothstep(0.70, 0.86, nz.fbm2(u * 90 + 3, v * 90 + 5, 2, 90, 90));
            K[i] = clamp(smoothstep(0.50, 0.80, base * 0.6 + fib * 0.4) * 0.75 + dots * 0.55, 0, 1);
            H[i] = clamp(0.5 + (fib - 0.5) * 0.6 + dots * 0.25, 0, 1);
        }
        const albedo = TexLab.make("noriA", S, scene, (d) => {
            for (let i = 0; i < s2; i++) { const c = mix3(NORI_D, NORI_G, K[i]); putRGB(d, i * 4, c[0], c[1], c[2]); }
        }, {});
        const orm = TexLab.orm("noriO", S, scene, (x, y, SS, o) => {
            const i = y * SS + x;
            o[0] = 1; o[1] = clamp(0.46 + (1 - K[i]) * 0.10 + (H[i] - 0.5) * 0.3, 0.2, 0.9); o[2] = 0;
        }, {});
        const normal = TexLab.normalFromHeight("noriN", S, scene, H, 0.006, {});
        return { albedo: albedo, orm: orm, normal: normal };
    }

    function buildNori(g, rng, opt) {
        const lf = opt.frame;
        const W = opt.W, H = opt.H, F0 = opt.f0, Rb = opt.bendR;
        const NU = 30, NV = 64, WHITE = [1, 1, 1];
        const ph = rng.range(0, 20), ph2 = rng.range(0, 20);
        // 【対策】紙を平面（＋横の反り）で立てかけるだけだと、口縁の半円を
        // 斜めに横切る所で縁が紙を突き抜け、白い磁器が海苔の上に顔を出す。
        // とくに 2 枚目は奥へずらしたぶん確実に刺さる。
        // 各頂点について「口縁の管」と「見込みの内壁」からの隙間を測り、
        // 足りなければ +v（器の内側・上）へ持ち上げる。持ち上げ量は格子の
        // 上でならして、口縁に掛かって折れる紙のなだらかなふくらみにする。
        const RC = (BOWL.rimInner + BOWL.rimOuter) * 0.5, RR = WALL_THIN * 0.5, GAP = 0.035;
        function clearance(p) {
            const r = Math.hypot(p[0], p[2]), y = p[1];
            let d = Math.hypot(r - RC, y - BOWL.height) - (RR + GAP);
            if (y < BOWL.height && r < RC) d = Math.min(d, innerRAt(y) - GAP - r);
            return d;
        }
        const base = [], lift = [];
        for (let i = 0; i <= NV; i++) {
            const lf2 = F0 + H * i / NV, rb = [], rl = [];
            for (let j = 0; j <= NU; j++) {
                const ls = -W / 2 + W * j / NU;
                // +v は器の内側（手前）。角を内側へ反らせる
                let lv = ls * ls / (2 * Rb) + opt.offV;
                lv += 0.05 * Math.sin(ls * 1.3 + ph) * Math.sin(lf2 * 0.9 + ph2);
                // 口縁を越えた先だけ外へ垂れる（口縁の手前で垂らすと縁に刺さる）
                lv -= 0.22 * smoothstep(opt.lipF + 0.8, F0 + H, lf2);
                let e = 0;
                while (e < 1.2 && clearance(lf.at(ls + opt.offS, lv + e, lf2)) < 0) e += 0.01;
                // 奥の1枚の手前に必ず来るようにする（持ち上げ量の差で交差させない）
                if (opt.under) {
                    const u = opt.under(ls + opt.offS, lf2);
                    if (u !== null) e = Math.max(e, u + 0.05 - lv);
                }
                rb.push(lv); rl.push(e);
            }
            base.push(rb); lift.push(rl);
        }
        // 持ち上げ量をならす。必要量は下回らない（ならしても刺さらない）
        const need = lift.map((r) => r.slice());
        for (let pass = 0; pass < 6; pass++) {
            const cur = lift.map((r) => r.slice());
            for (let i = 0; i <= NV; i++) for (let j = 0; j <= NU; j++) {
                let s = 0, n = 0;
                for (let di = -2; di <= 2; di++) for (let dj = -1; dj <= 1; dj++) {
                    const ii = i + di, jj = j + dj;
                    if (ii < 0 || ii > NV || jj < 0 || jj > NU) continue;
                    s += cur[ii][jj]; n++;
                }
                lift[i][j] = Math.max(need[i][j], s / n);
            }
        }
        const rows = [];
        for (let i = 0; i <= NV; i++) {
            const lf2 = F0 + H * i / NV, row = [];
            for (let j = 0; j <= NU; j++) {
                const ls = -W / 2 + W * j / NU;
                row.push(g.vert(lf.at(ls + opt.offS, base[i][j] + lift[i][j], lf2),
                    j / NU * opt.uvS + opt.uv0, i / NV * opt.uvS, WHITE));
            }
            rows.push(row);
        }
        for (let i = 0; i < NV; i++) {
            for (let j = 0; j < NU; j++) quadW(g, rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1], lf.v);
        }
        // この1枚の v を (横, 縦) で引ける関数を返す。範囲外は null
        return function (lsW, lf2) {
            const fj = (lsW - opt.offS + W / 2) / W * NU, fi = (lf2 - F0) / H * NV;
            if (fj < 0 || fj > NU || fi < 0 || fi > NV) return null;
            const j0 = Math.min(NU - 1, Math.floor(fj)), i0 = Math.min(NV - 1, Math.floor(fi));
            const tj = fj - j0, ti = fi - i0;
            const v = (i, j) => base[i][j] + lift[i][j];
            return mix(mix(v(i0, j0), v(i0, j0 + 1), tj), mix(v(i0 + 1, j0), v(i0 + 1, j0 + 1), tj), ti);
        };
    }

    // =================================================================
    // 12. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.042, 0.040, 0.036, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.55;
    env.lodGenerationOffset = 0.20;

    const waterR = innerRAt(BROTH_Y);

    // 料理写真は 85〜100mm 相当の望遠。器が大きいぶん距離を伸ばす
    const camera = new BABYLON.ArcRotateCamera("cam", -1.98, 0.95, 88, new V3(0, 5.6, 0.3), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 3.0;
    camera.fov = 0.32;
    camera.minZ = 10.0;
    camera.maxZ = 400;
    camera.lowerRadiusLimit = 34;
    camera.upperRadiusLimit = 240;
    camera.upperBetaLimit = 1.50;
    scene.cameraToUseForPointers = camera;

    // ---- 灯 ---------------------------------------------------------------
    const key = new BABYLON.DirectionalLight("key", new V3(-0.38, -0.96, 0.44).normalize(), scene);
    key.position = new V3(22, 46, -25);
    key.intensity = 2.65;
    key.diffuse = new BABYLON.Color3(1.0, 0.978, 0.945);
    key.autoUpdateExtends = false;
    key.orthoLeft = -34; key.orthoRight = 34;
    key.orthoBottom = -34; key.orthoTop = 34;
    key.shadowMinZ = 1; key.shadowMaxZ = 120;

    // 【対策】麺1本ごとに稜線へ長く走る照りは、鏡面専用の灯が無いと出ない
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
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0032;
    sg.normalBias = 0.010;
    sg.setDarkness(0.20);

    // ---- 卓 ---------------------------------------------------------------
    const table = BABYLON.MeshBuilder.CreateGround("table", { width: 240, height: 240 }, scene);
    named(table, "table");
    table.receiveShadows = true;
    const tableMatCache = {};
    function getTableMat(k) {
        if (tableMatCache[k]) return tableMatCache[k];
        const t = tableTextures(scene, 4517 + k.length * 31, TABLE[k]);
        const m = new BABYLON.PBRMaterial("tableMat_" + k, scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = t.albedo;
        m.metallic = 0; m.roughness = 1;
        m.metallicTexture = t.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = t.normal;
        m.bumpTexture.level = 0.45;
        // 板 1 枚 14cm。テクスチャ 1 枚で板 5 枚 = 70cm
        for (const tx of [t.albedo, t.orm, t.normal]) { tx.uScale = 240 / 70; tx.vScale = 240 / 70; }
        m.texs = [t.albedo, t.orm, t.normal];
        tableMatCache[k] = m;
        return m;
    }
    table.material = getTableMat(CFG.table);

    // ---- 箸と箸置き -------------------------------------------------------
    const sundryRng = new Rng(0x7A11CE);
    const woodTex = woodTextures(scene, 3331, {
        base: [0.575, 0.405, 0.238], grain: [0.352, 0.208, 0.108], rings: 26, wave: 1.4, rough: 0.34
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

    const CHOP_LEN = 22.5, CHOP_R = 0.255;
    const restW = 4.10, restD = 1.70, restH = 1.35, restDip = 0.44;
    const restPos = [15.6, restH * 0.5, 3.2];
    const contact = [restPos[0], restH - restDip + 0.16, restPos[2]];
    const awayXZ = vnorm([Math.sin(-0.38 + Math.PI * 0.5) * 0.28 + 0.10, 0, 0.99]);
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
        const o = vmul(perp, (i === 0 ? -1 : 1) * 0.30);
        const c = buildChopstick(scene, "chopstick", sundryRng, vadd(butt, o), vadd(tip, vmul(o, 0.8)), WOODC);
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
        const gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0.0, "rgba(255,255,255,1)");
        gr.addColorStop(0.45, "rgba(255,255,255,0.40)");
        gr.addColorStop(1.0, "rgba(255,255,255,0)");
        ctx.fillStyle = gr; ctx.fillRect(0, 0, 128, 128);
        dt.update(); dt.hasAlpha = true;
        return dt;
    })();
    const steam = new BABYLON.ParticleSystem("steam", 700, scene);
    steam.particleTexture = steamTex;
    steam.emitter = new V3(0, MOUND_TOP + 0.4, 0);
    steam.minEmitBox = new V3(-5.0, -0.3, -5.0);
    steam.maxEmitBox = new V3(5.0, 0.3, 5.0);
    // 【対策】加算合成にすると湯気が発光する。湯気は光っていない
    steam.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    steam.color1 = new BABYLON.Color4(1, 1, 1, 0.040);
    steam.color2 = new BABYLON.Color4(0.95, 0.95, 0.96, 0.018);
    steam.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    steam.minSize = 1.6; steam.maxSize = 5.0;
    steam.minLifeTime = 2.4; steam.maxLifeTime = 4.6;
    steam.emitRate = 110;
    steam.gravity = new V3(0.35, 1.6, 0);
    steam.direction1 = new V3(-0.35, 1.6, -0.35);
    steam.direction2 = new V3(0.45, 2.8, 0.35);
    steam.minAngularSpeed = -0.45; steam.maxAngularSpeed = 0.45;
    steam.minEmitPower = 0.35; steam.maxEmitPower = 1.0;
    steam.updateSpeed = 0.012;

    // =================================================================
    //  組み立て
    // =================================================================
    const bowlMatCache = {}, menTexCache = {}, menMatCache = {};
    let state = { toppings: [], toppingTex: [], toppingMat: [] };
    let onRebuilt = null, ssao = null;
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

    // ---- 具の置き場所 ----------------------------------------------------
    // カメラから見た奥 VF と右 VR で置く。方位角は奥 = 0°、右 = 90°
    //   海苔 30° / メンマ 76〜124° / 箸でつかむ 150° / 味玉 215°
    //   ねぎ 265°（中央寄り）/ チャーシュー 320°（2枚目は 290° 側へずらす）
    const VF = [Math.cos(camera.alpha + Math.PI), Math.sin(camera.alpha + Math.PI)];
    const VR = [VF[1], -VF[0]];
    function spot(f, r) { return [VF[0] * f + VR[0] * r, VF[1] * f + VR[1] * r]; }
    function polar(deg, R) { const t = deg * DEG; return spot(R * Math.cos(t), R * Math.sin(t)); }
    function radial(deg) { const p = polar(deg, 1); return vnorm([p[0], 0, p[1]]); }
    function tangent(deg) { const t = deg * DEG; const p = spot(-Math.sin(t), Math.cos(t)); return vnorm([p[0], 0, p[1]]); }

    // ---- 箸で麺をつかむ ------------------------------------------------
    // 束も山と同じ芯線 → 掃引の経路に載せて 1 枚のメッシュに焼く。
    // 1本を中ほどでつまみ、箸の上で折り返して両側を垂らす。
    const LIFT = {
        az: 150, R: 4.4,                  // つかむ位置（方位角 / 中心からの距離）
        gripY: BOWL.height + 3.8,         // つかむ高さ（口縁の 3.8cm 上）
        dir: [-0.18, 0.92, 0.26],         // 箸の向き（奥, 右, 上）。手元側を指す
        tipOut: 2.00,
        strands: 15,                      // つまむ本数（1本が折り返すので垂れは倍）
        spread: 0.55, thick: 0.30,
        twist: 0.90, fan: 1.25, apexLift: 0.28
    };
    // 【対策】折り返しの半径と箸の間隔は麺の断面から出す。数値で決め打つと
    // 太麺に替えたとたんに束が箸を突き抜ける
    function liftShape(men) {
        return { fold: men.w * 0.5 + 0.09, gap: men.h * 0.5 + 0.24 };
    }
    function liftBasis() {
        const g = polar(LIFT.az, LIFT.R);
        const G = [g[0], LIFT.gripY, g[1]];
        const ax = vnorm([VF[0] * LIFT.dir[0] + VR[0] * LIFT.dir[1], LIFT.dir[2],
        VF[1] * LIFT.dir[0] + VR[1] * LIFT.dir[1]]);
        const side = vnorm(vcross(ax, [0, 1, 0]));
        const up = vnorm(vcross(side, ax));
        return { G: G, ax: ax, side: side, up: up };
    }
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
            total += Math.hypot(fine[i][0] - fine[i - 1][0], fine[i][1] - fine[i - 1][1], fine[i][2] - fine[i - 1][2]);
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
    function liftStrands(men, seed) {
        const B = liftBasis();
        const SH = liftShape(men);
        const rng = new Rng((seed ^ 0x11F7A3) >>> 0);
        // 【対策】等方に広げると、垂れの下端が味玉やメンマに刺さる。
        // 具のある側（奥・左）だけ広がりを絞って手前右へ逃がす
        const off = (df, dr) => {
            const f = df > 0 ? df * 0.25 : df;
            const r = dr < 0 ? dr * 0.45 : dr;
            return [VF[0] * f + VR[0] * r, 0, VF[1] * f + VR[1] * r];
        };
        const out = [];
        const N = LIFT.strands;
        const ds = Math.min(men.seg, 0.15);
        for (let i = 0; i < N; i++) {
            const t = (N > 1 ? i / (N - 1) : 0.5) - 0.5;
            const P = vadd(vadd(B.G, vmul(B.ax, t * LIFT.spread * 2 + rng.pm(0.09))),
                vadd(vmul(B.side, rng.pm(LIFT.thick * 0.5)), vmul(B.up, rng.pm(0.04))));
            const a0 = rng.range(0, TAU);
            const legs = [];
            for (let k = 0; k < 2; k++) {
                const S = vadd(P, vmul(B.side, (k ? -1 : 1) * SH.fold));
                const ang = a0 + (k ? Math.PI : 0) + rng.pm(0.7);
                const tw = rng.pm(1) * LIFT.twist;
                const rE = LIFT.fan * rng.range(0.30, 1.0);
                const eo = off(Math.cos(ang + tw) * rE, Math.sin(ang + tw) * rE);
                const ex = S[0] + eo[0], ez = S[2] + eo[2];
                const short = rng.next() < 0.15;
                const mound = moundTopAt(Math.hypot(ex, ez));
                const eY = short ? mound + rng.range(0.25, 1.10) : Math.max(BROTH_Y - 0.55, mound - rng.range(0.20, 0.90));
                const hang = Math.max(0.8, S[1] - eY);
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
                if (short) leg.push([ex + (S[0] - ex) * 0.28 + rng.pm(0.1), eY - rng.range(0.15, 0.45), ez + (S[2] - ez) * 0.28 + rng.pm(0.1)]);
                legs.push(leg);
            }
            const apex = vadd(P, vmul(B.up, SH.fold * LIFT.apexLift));
            const ctrl = legs[0].slice().reverse().concat([apex], legs[1]);
            const path = samplePath(ctrl, ds);
            path.tone = rng.pm(1.0);
            path.off = 4096 + i * 53;
            path.lift = true;
            out.push(path);
        }
        return out;
    }

    let liftChop = null, liftChopGap = -1;
    function ensureLiftChopsticks() {
        const gap = liftShape(MEN[CFG.men]).gap;
        if (liftChop && Math.abs(gap - liftChopGap) < 1e-6) return liftChop;
        if (liftChop) { for (const m of liftChop) m.dispose(); liftChop = null; }
        liftChopGap = gap;
        const B = liftBasis();
        const rng = new Rng(0x515F7);
        liftChop = [];
        for (let i = 0; i < 2; i++) {
            const o = vmul(B.up, (i === 0 ? 1 : -1) * gap);
            const tp = vadd(vadd(B.G, vmul(B.ax, -LIFT.tipOut)), o);
            const bt = vadd(vadd(B.G, vmul(B.ax, CHOP_LEN - LIFT.tipOut)), vmul(o, 1.35));
            const c = buildChopstick(scene, "chopstickLift", rng, bt, tp, WOODC);
            c.material = woodMat;
            c.receiveShadows = true;
            sg.addShadowCaster(c, true);
            liftChop.push(c);
        }
        return liftChop;
    }
    function applyChopsticks() {
        for (const m of sundry) m.setEnabled(chopOn && !CFG.lift);
        rest.setEnabled(chopOn);
        if (chopOn && CFG.lift) { for (const m of ensureLiftChopsticks()) m.setEnabled(true); }
        else if (liftChop) { for (const m of liftChop) m.setEnabled(false); }
    }

    // ---- 麺 ---------------------------------------------------------------
    function rebuildNoodleMesh() {
        if (state.noodles) { state.noodles.dispose(); state.noodles = null; }
        const men = MEN[CFG.men];
        const lifted = (CFG.lift && chopOn) ? liftStrands(men, CFG.seed) : [];
        const t0 = performance.now();
        const m = buildNoodles(scene, state.strands.concat(lifted), men, CFG.seed);
        if (m) {
            m.material = getMenMat(CFG.men);
            m.receiveShadows = true;
            sg.addShadowCaster(m, true);
        }
        state.noodles = m;
        state.ms.mesh = performance.now() - t0;
        applySoup();
        applyChopsticks();
    }
    function rebuildNoodlesFull() {
        const men = MEN[CFG.men];
        const t0 = performance.now();
        const made = makeStrands(men, CFG.seed);
        state.relax = relaxStrands(made.strands, men, { steps: CFG.relaxSteps, iters: 3 });
        state.strands = made.strands; state.totalLen = made.totalLen;
        state.ms = { relax: performance.now() - t0 };
        rebuildNoodleMesh();
    }

    // ---- 具 ---------------------------------------------------------------
    let eggMat = null, menmaMat = null, noriMat = null, negiMat = null, menmaTex = null, noriTex = null;
    function getEggMat() {
        if (eggMat) return eggMat;
        const m = new BABYLON.PBRMaterial("eggMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0; m.roughness = 0.30;
        // ゆでた白身はしっとり光る。黄身の照りも同じ膜で出す
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.55;
        m.clearCoat.roughness = 0.12;
        m.clearCoat.indexOfRefraction = 1.36;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.30;
        m.subSurface.tintColor = new BABYLON.Color3(s2l(1.0), s2l(0.82), s2l(0.55));
        m.subSurface.minimumThickness = 0.2;
        m.subSurface.maximumThickness = 1.6;
        eggMat = m;
        return m;
    }
    function getMenmaMat() {
        if (menmaMat) return menmaMat;
        menmaTex = menmaTextures(scene, 9127);
        const m = new BABYLON.PBRMaterial("menmaMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = menmaTex.albedo;
        m.bumpTexture = menmaTex.normal;
        m.bumpTexture.level = 0.6;
        m.metallic = 0; m.roughness = 0.36;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.65;
        m.clearCoat.roughness = 0.15;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.38;
        m.subSurface.tintColor = new BABYLON.Color3(s2l(0.96), s2l(0.76), s2l(0.40));
        m.subSurface.minimumThickness = 0.1;
        m.subSurface.maximumThickness = 0.6;
        menmaMat = m;
        return m;
    }
    function getNoriMat() {
        if (noriMat) return noriMat;
        noriTex = noriTextures(scene, 6311);
        const m = new BABYLON.PBRMaterial("noriMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = noriTex.albedo;
        m.metallicTexture = noriTex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = noriTex.normal;
        m.bumpTexture.level = 0.8;
        m.metallic = 0; m.roughness = 1;
        // 【対策】薄い紙は裏から見ても見える。片面だけだと角度で消える
        m.backFaceCulling = false;
        m.twoSidedLighting = true;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.12;
        m.subSurface.tintColor = new BABYLON.Color3(s2l(0.35), s2l(0.55), s2l(0.25));
        noriMat = m;
        return m;
    }
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

    function disposeToppings() {
        for (const m of state.toppings) m.dispose();
        for (const t of state.toppingTex) t.dispose();
        for (const m of state.toppingMat) m.dispose(false, false);
        state.toppings = []; state.toppingTex = []; state.toppingMat = [];
    }
    function addTopping(g, name, mat) {
        if (!g.idx.length) return null;
        const geo = g.finish(null);
        let bad = 0;
        for (let i = 0; i < geo.positions.length; i++) if (!isFinite(geo.positions[i])) bad++;
        if (bad) console.warn("[Ramen] " + name + " に不正な頂点 " + bad);
        const m = toMesh(name, geo, scene);
        m.tris = geo.indices.length / 3;
        m.material = mat;
        m.receiveShadows = true;
        sg.addShadowCaster(m, true);
        state.toppings.push(m);
        return m;
    }

    function buildToppings() {
        disposeToppings();
        const seed = CFG.seed;
        const rng = new Rng(seed ^ 0x7E4A), nz = new Noise(seed ^ 0x2F71);

        // チャーシュー。縁（外側）が器の壁へ上がるよう、中心側へ傾ける
        const nCh = clamp(CFG.chashu | 0, 0, 2);
        if (nCh > 0) {
            const AZ = 320, R = 4.8;
            const c = polar(AZ, R), rd = radial(AZ);
            const up = vnorm([-rd[0] * 0.36, 1, -rd[2] * 0.36]);
            const fw = vnorm(vsub(rd, vmul(up, vdot(rd, up))));
            const A = [c[0], moundTopAt(R) + 0.35, c[1]];
            const lfA = localFrame(A, fw, up);
            const sgn = vdot(lfA.s, tangent(AZ)) >= 0 ? -1 : 1;     // 2枚目は味玉の側（方位角が小さい側）へ
            const list = [{ at: A, fwd: fw }];
            if (nCh > 1) {
                // 【対策】2枚目は1枚目と同じ面の族に置き、面の法線方向へだけ
                // 下げる。別々に傾けると重なった所で必ず突き抜ける
                const fw2 = vadd(vmul(fw, Math.cos(0.5)), vmul(vcross(up, fw), Math.sin(0.5)));
                list.push({ at: vadd(vadd(A, vmul(lfA.s, sgn * 2.5)), vmul(up, -0.75)), fwd: fw2 });
            }
            for (let i = 0; i < list.length; i++) {
                const sd = (seed ^ (i * 7919 + 131)) >>> 0;
                const rho = makeRho(sd);
                const tx = chashuTextures(scene, rho, sd, "chashu" + i);
                const mat = new BABYLON.PBRMaterial("chashuMat" + i, scene);
                mat.albedoColor = new BABYLON.Color3(1, 1, 1);
                mat.albedoTexture = tx.albedo;
                mat.bumpTexture = tx.normal;
                mat.bumpTexture.level = 0.65;
                mat.metallic = 0; mat.roughness = 1.0;
                mat.metallicTexture = tx.orm;
                mat.useAmbientOcclusionFromMetallicTextureRed = true;
                mat.useRoughnessFromMetallicTextureGreen = true;
                mat.useMetallnessFromMetallicTextureBlue = true;
                // たれの照り。均一にすると濡れたプラスチックになるので薄く
                mat.clearCoat.isEnabled = true;
                mat.clearCoat.intensity = 0.35;
                mat.clearCoat.roughness = 0.24;
                mat.subSurface.isTranslucencyEnabled = true;
                mat.subSurface.translucencyIntensity = 0.20;
                mat.subSurface.tintColor = new BABYLON.Color3(s2l(0.95), s2l(0.62), s2l(0.52));
                mat.subSurface.minimumThickness = 0.1;
                mat.subSurface.maximumThickness = 0.5;
                state.toppingTex.push(tx.albedo, tx.orm, tx.normal);
                state.toppingMat.push(mat);
                const g = new Geo();
                buildChashu(g, rho, { at: list[i].at, fwd: list[i].fwd, up: up, rx: 3.3, rz: 2.8, th: 0.42, curve: 0.020, seed: sd });
                addTopping(g, "chashu", mat);
            }
        }

        // 味玉。長軸を接線に寝かせ、切り口をカメラへ向けて起こす
        if (CFG.egg !== "none") {
            const AZ = 215, R = 4.3;
            const c = polar(AZ, R);
            const g = new Geo();
            const upE = vnorm([-VF[0] * 0.62, 0.80, -VF[1] * 0.62]);
            buildEgg(g, rng, nz, {
                at: [c[0], moundTopAt(R) + 0.35, c[1]], fwd: tangent(AZ), up: upE,
                a: 2.75, b: 2.10, s: 1.0, style: CFG.egg
            });
            addTopping(g, "tamago", getEggMat());
        }

        // メンマ。長手を器の中心へ向けて3本並べる
        if (CFG.menma) {
            const g = new Geo();
            [76, 100, 124].forEach((az, i) => {
                const R = 5.5 + rng.pm(0.25);
                const c = polar(az + rng.pm(3), R);
                const fw = vadd(vmul(radial(az), -1), vmul(tangent(az), rng.pm(0.18)));
                const up = vnorm([rng.pm(0.10), 1, rng.pm(0.10)]);
                buildMenma(g, rng, nz, {
                    at: [c[0], moundTopAt(R) + 0.28 + i * 0.04, c[1]], fwd: fw, up: up,
                    L: rng.range(4.0, 4.6), W: rng.range(1.15, 1.40), T: 0.34, bend: rng.range(0.08, 0.20)
                });
            });
            addTopping(g, "menma", getMenmaMat());
        }

        // 海苔。奥の口縁に立てかける
        const nNori = clamp(CFG.nori | 0, 0, 2);
        if (nNori > 0) {
            const AZ = 30;
            // 【対策】口縁の半円の頂点に掛けると、その手前で内壁を突き抜ける。
            // 半円の内側 45° の所（見込み側の肩）に接させる
            const rc = (BOWL.rimInner + BOWL.rimOuter) * 0.5, rr = WALL_THIN * 0.5;
            const b0 = polar(AZ, 6.0), c0 = polar(AZ, rc - (rr + 0.03) * Math.SQRT1_2);
            const base = [b0[0], BROTH_Y - 1.1, b0[1]];
            const lip = [c0[0], BOWL.height + (rr + 0.03) * Math.SQRT1_2, c0[1]];
            const lf = localFrame(base, vsub(lip, base), [0, 1, 0]);
            const g = new Geo();
            const sgnS = vdot(lf.s, tangent(AZ)) >= 0 ? 1 : -1;
            // 奥の1枚から作り、手前の1枚はその上に重ねる
            let under = null;
            for (let i = nNori - 1; i >= 0; i--) {
                // 2枚目は横にずらして奥へ 0.08cm 下げる（面の族を揃えて交差させない）
                under = buildNori(g, rng, {
                    frame: lf, W: 6.8, H: 9.4, f0: -0.6, bendR: 6.4, lipF: vlen(vsub(lip, base)),
                    offS: i * 1.7 * sgnS, offV: -i * 0.08, uvS: 1.0, uv0: i * 0.37, under: under
                });
            }
            addTopping(g, "nori", getNoriMat());
        }

        // ねぎ
        if (CFG.negi) {
            const m = buildNegi(scene, 40, seed ^ 0x3C3C, polar(265, 0.9), 0.95);
            if (m) {
                m.material = getNegiMat();
                m.receiveShadows = true;
                sg.addShadowCaster(m, true);
                state.toppings.push(m);
            }
        }
    }

    // ---- スープ -----------------------------------------------------------
    const RF = rippleField(0x1B0A);
    const rippleTex = (() => {
        const t = TexLab.normalFromHeight("soupN", RF.N, scene, RF.H.map((v) => clamp(0.5 + v, 0, 1)), 0.0022, {});
        t.uScale = 2.4; t.vScale = 2.4;
        return t;
    })();
    const soupMat = new BABYLON.PBRMaterial("soupMat", scene);
    soupMat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
    soupMat.metallic = 0.0;
    soupMat.roughness = 0.20;
    soupMat.clearCoat.isEnabled = true;
    soupMat.clearCoat.intensity = 0.80;
    soupMat.clearCoat.indexOfRefraction = 1.335;
    soupMat.clearCoat.bumpTexture = rippleTex;
    // 乳化のむら。白濁スープは一様な色面だと石膏に見える。対流の筋と、
    // 泡・脂の細かい粒が作る明暗を、スープ面のアルベドへ変調として掛ける。
    // 【注意】albedoTexture.level は「強さ」ではなく色の倍率。下げると暗くなる
    // だけなので使わない。平均を 0.96 付近に置き、澄んだスープでも邪魔しない幅にする
    const soupMottle = (() => {
        const S = 512, nz = new Noise(0x7070);
        const half = waterR + 0.35;
        return TexLab.make("soupMottle", S, scene, (d) => {
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
                const wx = (x / S * 2 - 1) * half, wz = (y / S * 2 - 1) * half;
                // 対流の筋（渦を巻いた低周波）
                const sw = nz.fbm2(wx * 0.35 + nz.fbm2(wx * 0.2, wz * 0.2, 2) * 2.0, wz * 0.35 + 5, 3);
                const flow = nz.fbm2(wx * 1.1 + sw * 3.0, wz * 1.1 - sw * 3.0, 3);
                // 泡と脂の粒（0.3〜1mm）
                const foam = smoothstep(0.66, 0.84, nz.fbm2(wx * 11 + 3, wz * 11 + 7, 2));
                const fleck = smoothstep(0.78, 0.92, nz.fbm2(wx * 26 + 9, wz * 26 + 1, 2));
                const v = clamp(0.965 + (flow - 0.5) * 0.12 + foam * 0.035 - fleck * 0.05, 0.80, 1.0);
                putRGB(d, (y * S + x) * 4, v, v * 0.995, v * 0.985);
            }
        }, { clampU: true, clampV: true });
    })();
    soupMat.albedoTexture = soupMottle;
    const soup = buildSoupSurface(scene, RF, waterR);
    soup.material = soupMat;

    const oilMat = new BABYLON.PBRMaterial("oilMat", scene);
    oilMat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
    oilMat.albedoColor = new BABYLON.Color3(...lin3([0.99, 0.84, 0.44]));
    oilMat.alpha = 0.42;
    oilMat.metallic = 0; oilMat.roughness = 0.03;
    oilMat.indexOfRefraction = 1.47;

    const soko = buildSoko(scene);
    soko.receiveShadows = true;

    function rebuildOil() {
        if (state.oil) { state.oil.dispose(); state.oil = null; }
        const ts = SOUP[CFG.soup];
        const m = buildOil(scene, CFG.seed, ts.oil, waterR, ts.oilSize);
        oilMat.albedoColor = new BABYLON.Color3(...lin3(ts.oilCol));
        oilMat.alpha = ts.oilAlpha;
        if (m) m.material = oilMat;
        state.oil = m;
    }

    // スープの色・濃さを、麺の頂点色 / スープ面 / 暗がりの円板へ配る
    function applySoup() {
        const ts = SOUP[CFG.soup], turb = live.turbidity, tint = lin3(ts.deep);
        if (state.noodles) {
            const data = state.noodles.metadata;
            const cols = data.dryColors.slice(), pos = data.depthPositions;
            for (let i = 0; i < pos.length / 3; i++) {
                const depth = Math.max(0, BROTH_Y - pos[i * 3 + 1]);
                if (depth <= 0) continue;
                for (let c = 0; c < 3; c++) {
                    cols[i * 4 + c] = mix(cols[i * 4 + c], tint[c], 1 - Math.exp(-ts.sigma[c] * depth * turb));
                }
            }
            state.noodles.updateVerticesData(BABYLON.VertexBuffer.ColorKind, cols);
        }
        soupMat.albedoColor = new BABYLON.Color3(tint[0], tint[1], tint[2]);
        soupMat.alpha = clamp(1 - Math.exp(-ts.alphaK * turb), 0.05, 0.985);
        soupMat.roughness = ts.body;
        soupMat.clearCoat.roughness = clamp(ts.rough * live.wet, 0.015, 0.6);
        soupMat.clearCoat.bumpTexture.level = 0.50 * live.ripple;
        const nb = lin3(MEN[CFG.men].col.deep), d = soko.metadata.depth;
        const sc = [0, 0, 0];
        for (let c = 0; c < 3; c++) sc[c] = mix(nb[c], tint[c], 1 - Math.exp(-ts.sigma[c] * d * turb)) * 0.85;
        soko.material.albedoColor = new BABYLON.Color3(sc[0], sc[1], sc[2]);
    }

    function applyLive() {
        for (const k in menMatCache) {
            const mm = menMatCache[k];
            mm.subSurface.translucencyIntensity = clamp((mm.subBase || 0.46) * live.trans, 0, 0.95);
        }
        applySoup();
    }

    function buildAll() {
        const t0 = performance.now();
        rebuildNoodlesFull();
        const t1 = performance.now();
        buildToppings();
        rebuildOil();
        state.ms.toppings = performance.now() - t1;
        applySoup();
        state.buildMs = performance.now() - t0;
        if (onRebuilt) onRebuilt(state);
    }

    state.bowl = buildBowl(scene, new Rng(0xB0117));
    state.bowl.material = getBowlMat(CFG.utsuwa);
    sg.addShadowCaster(state.bowl, true);
    buildAll();

    // =================================================================
    //  ポストプロセス
    // =================================================================
    if (CFG.ssao) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.55;
        ssao.totalStrength = 0.30;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 300;
        ssao.minZAspect = 0.25;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = false;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.10;
    dp.depthOfFieldEnabled = CFG.dof;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.High;
    dp.depthOfField.lensSize = 50;
    dp.depthOfField.fStop = CFG.dofFStop;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    // 白磁と黄色い麺は高キー。露出を上げると器の白が飛んで形が消える
    ip.exposure = 1.08;
    ip.contrast = 1.08;
    ip.vignetteEnabled = false;

    let tAcc = 0, soupDirty = false;
    scene.onBeforeRenderObservable.add(() => {
        if (dp.depthOfFieldEnabled) {
            const focus = camera.radius * 1000;
            dp.depthOfField.focusDistance = focus;
            dp.depthOfField.focalLength = focus * CFG.dofRatio;
        }
        tAcc += scene.getEngine().getDeltaTime() * 0.001;
        rippleTex.uOffset = Math.sin(tAcc * 0.10) * 0.014 + tAcc * 0.0026;
        rippleTex.vOffset = Math.cos(tAcc * 0.079) * 0.012 - tAcc * 0.0018;
        if (soupDirty) { soupDirty = false; applySoup(); }
    });

    // =================================================================
    // 13. GUI
    // =================================================================
    // 【対策】GUI 専用カメラに分けると Inspector が壊れる。既定は
    // applyPostProcess = false で GUI だけポストプロセスの外へ出す
    const GUI_MASK = 0x20000000;
    let guiCam = null;
    function bindDebugCamera(sc, mainCam) {
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
    ui.idealWidth = 1400;
    ui.renderAtIdealSize = true;

    const COL = {
        idle: "#2b2926", active: "#7d6236", edge: "#4a463e",
        text: "#f3ede1", sub: "#a8a193", accent: "#e8d6ae"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "262px"; card.height = "88%";
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(18,17,15,0.84)";
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
    showSettings.onPointerClickObservable.add(() => { card.isVisible = !card.isVisible; });
    ui.addControl(showSettings);

    const sv = new BABYLON.GUI.ScrollViewer("sv");
    sv.thickness = 0; sv.barSize = 10;
    sv.barColor = COL.edge; sv.barBackground = "rgba(0,0,0,0)";
    sv.wheelPrecision = 0.02;
    card.addControl(sv);
    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "224px"; panel.isVertical = true;
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
    // 状態を持つボタン。label() が文字、on() が点灯の判定
    function addToggle(name, label, on, onClick) {
        const b = addButton(name, label(), () => { onClick(); sync(); });
        function sync() { b.textBlock.text = label(); b.background = on() ? COL.active : COL.idle; }
        sync();
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

    addLabel("RAMEN / ラーメン", 11, COL.sub, "30px");

    const groups = {};
    function presetRow(title, table, cfgKey, apply) {
        addLabel(title, 13, COL.accent, "22px");
        groups[cfgKey] = {};
        for (const k of Object.keys(table)) {
            groups[cfgKey][k] = addButton(cfgKey + "_" + k, table[k].label, () => { CFG[cfgKey] = k; apply(k); highlight(); });
        }
    }
    function highlight() {
        for (const g in groups) for (const k in groups[g]) groups[g][k].background = (k === CFG[g]) ? COL.active : COL.idle;
    }
    presetRow("麺", MEN, "men", () => buildAll());
    presetRow("スープ", SOUP, "soup", () => { rebuildOil(); applySoup(); });
    presetRow("器", UTSUWA, "utsuwa", (k) => { state.bowl.material = getBowlMat(k); });
    presetRow("卓", TABLE, "table", (k) => { table.material = getTableMat(k); });

    addSpacer();
    addButton("reseed", "盛り直す", () => {
        CFG.seed = (CFG.seed * 1664525 + 1013904223) >>> 0;
        buildAll();
    });

    // 具のトグルは具だけ作り直す（麺の緩和はやり直さない）
    const reTop = () => { buildToppings(); if (onRebuilt) onRebuilt(state); };
    addToggle("chashu", () => "チャーシュー: " + (CFG.chashu ? CFG.chashu + "枚" : "なし"),
        () => CFG.chashu > 0, () => { CFG.chashu = (CFG.chashu + 1) % 3; reTop(); });
    addToggle("chashuStyle", () => "チャーシューの味: " + CHASHU_STYLE[CFG.chashuStyle].label,
        () => CFG.chashuStyle === "shoyu", () => { CFG.chashuStyle = CFG.chashuStyle === "shoyu" ? "nibuta" : "shoyu"; reTop(); });
    const EGG_ORDER = ["ajitama", "yude", "none"];
    addToggle("egg", () => "卵: " + (CFG.egg === "none" ? "なし" : EGG[CFG.egg].label),
        () => CFG.egg !== "none", () => { CFG.egg = EGG_ORDER[(EGG_ORDER.indexOf(CFG.egg) + 1) % 3]; reTop(); });
    addToggle("menma", () => "メンマ: " + (CFG.menma ? "ON" : "OFF"), () => CFG.menma,
        () => { CFG.menma = !CFG.menma; reTop(); });
    addToggle("nori", () => "海苔: " + (CFG.nori ? CFG.nori + "枚" : "なし"), () => CFG.nori > 0,
        () => { CFG.nori = (CFG.nori + 1) % 3; reTop(); });
    addToggle("negi", () => "ねぎ: " + (CFG.negi ? "ON" : "OFF"), () => CFG.negi,
        () => { CFG.negi = !CFG.negi; reTop(); });

    function setSteam(on) { if (on) steam.start(); else steam.stop(); CFG.steam = on; }
    setSteam(CFG.steam);
    addToggle("steam", () => "湯気: " + (CFG.steam ? "ON" : "OFF"), () => CFG.steam, () => setSteam(!CFG.steam));
    addToggle("chop", () => "箸: " + (chopOn ? "ON" : "OFF"), () => chopOn, () => {
        chopOn = !chopOn;
        if (CFG.lift) rebuildNoodleMesh(); else applyChopsticks();
    });
    addToggle("lift", () => "箸でつかむ: " + (CFG.lift ? "ON" : "OFF"), () => CFG.lift, () => {
        CFG.lift = !CFG.lift;
        rebuildNoodleMesh();
    });
    addToggle("kick", () => "照り足し: " + (kick.isEnabled() ? "ON" : "OFF"), () => kick.isEnabled(),
        () => kick.setEnabled(!kick.isEnabled()));
    addToggle("rot", () => "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF"),
        () => camera.useAutoRotationBehavior, () => {
            camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
            if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.08;
        });

    addSpacer();
    const turbInfo = addLabel("", 11, COL.sub, "34px");
    function turbText() {
        const sg2 = SOUP[CFG.soup].sigma[1] * live.turbidity;
        turbInfo.text = "  緑の消散長 " + (1 / Math.max(sg2, 1e-3)).toFixed(2)
            + "cm ／ 深さ1cmで " + Math.round((1 - Math.exp(-sg2)) * 100) + "% 溶ける";
    }
    addSlider("スープの濃さ ×", 0.05, 3.0, live.turbidity, f2, (v) => { live.turbidity = v; soupDirty = true; turbText(); });
    turbText();
    addSlider("麺の量 ×", 0.5, 1.5, CFG.amount, f2, (v) => { CFG.amount = v; });
    addLabel("  （変えたあと「盛り直す」）", 11, COL.sub, "20px");
    addSlider("麺の透光 ×", 0, 2.0, live.trans, f2, (v) => { live.trans = v; applyLive(); });
    addSlider("さざ波 ×", 0, 3.0, live.ripple, f2, (v) => { live.ripple = v; soupDirty = true; });
    addSlider("水面の粗さ ×", 0.1, 3.0, live.wet, f2, (v) => { live.wet = v; soupDirty = true; });

    addSpacer();
    addToggle("dof", () => "被写界深度: " + (CFG.dof ? "ON" : "OFF"), () => CFG.dof, () => {
        CFG.dof = !CFG.dof; dp.depthOfFieldEnabled = CFG.dof;
    });
    addSlider("ぼけ量", 0.01, 0.20, CFG.dofRatio, f2, (v) => { CFG.dofRatio = v; });
    addSlider("F値", 1.2, 11.0, CFG.dofFStop, (v) => v.toFixed(1), (v) => { dp.depthOfField.fStop = v; });

    const info = addLabel("", 12, COL.sub, "96px");
    highlight();

    onRebuilt = (st) => {
        let tri = state.bowl.tris + soup.tris + (st.noodles ? st.noodles.tris : 0) + (st.oil ? st.oil.tris : 0);
        for (const m of st.toppings) tri += m.tris || 0;
        info.text = "麺 " + st.strands.length + " 本 / 総長 " + st.totalLen.toFixed(0) + "cm\n"
            + tri.toLocaleString() + " tri\n"
            + "水面 y=" + BROTH_Y.toFixed(2) + "cm  径 " + (waterR * 2).toFixed(1) + "cm"
            + " / 山 y=" + st.relax.top.toFixed(2) + "cm\n"
            + "build " + (st.buildMs || 0).toFixed(0) + "ms  seed: " + CFG.seed;
    };
    onRebuilt(state);

    console.log("[Ramen] build ramen-2026-09-22-d",
        "| strands=" + state.strands.length,
        "| len=" + state.totalLen.toFixed(0) + "cm",
        "| pts=" + state.relax.points,
        "| top=" + state.relax.top.toFixed(2),
        "| ms=", JSON.stringify(state.ms), "| total=" + state.buildMs.toFixed(0) + "ms");

    scene.onDisposeObservable.add(() => {
        for (const c of [bowlMatCache, tableMatCache]) for (const k in c) {
            if (c[k].texs) for (const t of c[k].texs) t.dispose();
            c[k].dispose(true, false);
        }
        for (const k in menTexCache) for (const t in menTexCache[k]) menTexCache[k][t].dispose();
        for (const t in woodTex) woodTex[t].dispose();
        for (const s of [menmaTex, noriTex]) if (s) for (const t in s) s[t].dispose();
        for (const t of state.toppingTex) t.dispose();
        rippleTex.dispose(); soupMottle.dispose(); steamTex.dispose();
        if (soko.metadata && soko.metadata.tex) soko.metadata.tex.dispose();
    });

    return scene;
};

export default createScene;