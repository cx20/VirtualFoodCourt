// =====================================================================
//  おでん — Babylon.js Playground (JavaScript)
//  全文を貼り付けて Run。左上 ≡ で出汁・鍋・具の組み合わせを変更。
//  形状とテクスチャはすべて手続き生成。環境光のみ Babylon.js 公式配布 .env を使用。
//
//  構成:
//    0. CONFIG     … 出汁 / 鍋 / 具の組み合わせ
//    1. Rng/Noise  … シード付き乱数と 2D/3D 値ノイズ
//    2. Geo        … 頂点の組み立て（格子面・放射体・巻き順・法線溶接）
//    3. 具          … 大根 / 卵 / こんにゃく / ちくわ / さつま揚げ / 厚揚げ /
//                     結び昆布 / 巾着 / 牛すじ串 / ウインナー
//    4. 鍋          … 土鍋（菊の印花）/ 鋳物ホーロー鍋（鍋敷きつき）
//    5. 詰める      … 上から見た高さ場に、いちばん低く収まる所を探して置く
//    6. 出汁        … 具の染み（Beer–Lambert）と、不透明な液面に焼いた透け
//    7. Scene / GUI
//
//  ここでの最重要事項:
//  「おでんは具が出汁に沈んでいる料理」
//
//   肉じゃがは器に盛った山で、煮汁は具の表面の膜だった。おでんは逆で、
//   鍋いっぱいの出汁に具が肩まで浸かっている。見えているのは
//     (a) 出汁から頭を出した具（濡れて、水際がいちばん濃い）
//     (b) 液面越しに透けて見える、沈んだ具と鍋の底
//   の2つで、(b) を描かないと「茶色い板に具が刺さっている」絵になる。
//   液面は不透明な1枚のメッシュにして、上から見た「液面の下にある
//   いちばん高い面」の色と深さを焼き込む。深さに応じて Beer–Lambert で
//   沈めるので、浅く沈んだ大根は琥珀色に透け、具の隙間の深い所は
//   濃い出汁の色になる。
//
//   具そのものも出汁を吸って色が変わる。大根は外側から琥珀色に
//   染まり、卵は白身の表面だけが薄茶になる。これも同じ消散係数で
//   「吸った深さ」を掛けるだけで、関東風と関西風を切り替えると
//   具の色まで一緒に変わる。
// =====================================================================

var createScene = function () {
    // =================================================================
    // 0. CONFIG （単位は cm）
    // =================================================================
    const BUILD = "oden-2026-10-14-a";

    // ---- 出汁 ---------------------------------------------------------
    // sigma は消散係数 [1/cm]（光が出汁を往復するので深さの 2 倍を掛ける）。
    // 参考写真2（土鍋）の見込みの縁、深さ 3cm ほどの所が sRGB(0.45,0.25,0.10)。
    // 釉の地色（リニア 0.38）から逆算すると関東風は σ ≒ [0.20, 0.42, 0.85]。
    // 写真4（関西風）は同じ深さでも器の白が透けて淡い黄色に見えるので約 1/3
    const DASHI = {
        kanto: {
            label: "関東風（濃口）",
            sigma: [0.200, 0.420, 0.850],
            haze: [0.560, 0.320, 0.110],     // 出汁そのものの濁りの色（sRGB）
            hazeK: 0.40,
            soakK: 1.00,                     // 具が吸った出汁の濃さ
            film: 0.030,                     // 頭を出した具の表面に残る膜 [cm]
            pool: 0.120,                     // 具と具の隙間に溜まる膜 [cm]
            drain: 0.80,                     // 膜が薄くなる高さの減衰長 [cm]
            rough: 0.060,
            level: 0.00                      // 液面の高さの補正 [cm]
        },
        kansai: {
            label: "関西風（薄口）",
            sigma: [0.070, 0.140, 0.320],
            // 関西風は澄んだ淡い金色。濁りを多くすると白濁した豚骨スープになる
            haze: [0.780, 0.600, 0.300],
            hazeK: 0.20,
            soakK: 0.55,
            film: 0.026, pool: 0.100, drain: 0.95,
            rough: 0.055,
            level: 0.35                      // 関西風は出汁を多めに張る
        }
    };

    // ---- 具の組み合わせ ------------------------------------------------
    const SETS = {
        teiban: {
            label: "定番",
            items: { gyusuji: 1, daikon: 3, atsuage: 2, satsuma: 2, konnyaku: 2, egg: 3, chikuwa: 2, kinchaku: 1, kombu: 2 }
        },
        gudakusan: {
            label: "具だくさん",
            items: { gyusuji: 2, daikon: 3, atsuage: 2, satsuma: 3, konnyaku: 2, egg: 3, chikuwa: 2, kinchaku: 2, kombu: 2, wiener: 3 }
        },
        sappari: {
            label: "大根と卵",
            items: { daikon: 5, egg: 4, kombu: 3, konnyaku: 2 }
        }
    };

    const GLOBAL = {
        cell: 0.10,            // 詰めるための高さ場のセル [cm]
        candidates: 60,        // 1個あたりに試す置き場所の数（各3回ずらして試す）
        settle: 0.035,         // 置いたあと沈める量 [cm]（ほぼ接するだけ）
        wallMargin: 0.06,
        brothTex: 768,
        brothRings: 64, brothSectors: 192,
        meniscus: 0.07,
        ripple: 0.010,
        potTexW: 4096, potTexH: 1024,
        useSSAO: true,
        useDOF: false,
        dofRatio: 0.070,
        dofFStop: 2.8,
        guiOwnCamera: false,   // true で GUI 専用カメラ（Inspector の表示が崩れる）
        compactWidth: 700,
        compactMinSide: 480,
        guiMaxScale: 2.2
    };

    const START_DASHI = "kanto";
    const START_POT = "donabe";
    const START_SET = "teiban";
    const START_SEED = 20261014;

    const V3 = BABYLON.Vector3;
    const C3 = BABYLON.Color3;
    const TAU = Math.PI * 2;
    const GOLD = 2.39996323;
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / ((e1 - e0) || 1e-9), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    // sRGB ⇔ リニア。頂点カラーと PBR の色はリニア
    const s2l = (c) => (c <= 0.04045) ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const l2s = (v) => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
    const col3 = (a) => new C3(s2l(a[0]), s2l(a[1]), s2l(a[2]));
    const now = () => (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

    // 【対策】同名メッシュを複数作ると id が重複し、Inspector が別の物を掴む。
    //         name と id の両方を一意にする
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
        gauss(m, sd) {
            const u = Math.max(1e-9, this.next()), v = this.next();
            return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
        }
    }

    const Noise = {
        _h2(x, y, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
            return (h >>> 0) / 4294967295;
        },
        _h3(x, y, z, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
                ^ Math.imul(z | 0, 1440662683) ^ Math.imul(seed | 0, 1274126177);
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
        // 【対策】タイリングさせるテクスチャは両軸とも折り返す（片軸だと継ぎ目に線）
        v2p(x, y, px, py, seed) {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            const p = Math.max(1, px | 0), q = Math.max(1, py | 0);
            const w = (a, m) => ((a % m) + m) % m;
            const x0 = w(xi, p), x1 = w(xi + 1, p), y0 = w(yi, q), y1 = w(yi + 1, q);
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
        // 閉じた立体の表面は 3D で評価する（UV の継ぎ目が出ない）
        v3(x, y, z, seed) {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            const xf = x - xi, yf = y - yi, zf = z - zi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
            const H = (i, j, k) => this._h3(xi + i, yi + j, zi + k, seed);
            const x00 = H(0, 0, 0) + (H(1, 0, 0) - H(0, 0, 0)) * u;
            const x10 = H(0, 1, 0) + (H(1, 1, 0) - H(0, 1, 0)) * u;
            const x01 = H(0, 0, 1) + (H(1, 0, 1) - H(0, 0, 1)) * u;
            const x11 = H(0, 1, 1) + (H(1, 1, 1) - H(0, 1, 1)) * u;
            const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
            return y0 + (y1 - y0) * w;
        },
        fbm3(x, y, z, seed, oct) {
            let s = 0, a = 0.5, f = 1, n = 0;
            for (let o = 0; o < oct; o++) { s += a * this.v3(x * f, y * f, z * f, seed + o * 137); n += a; f *= 2; a *= 0.5; }
            return s / n;
        },
        // 細かい点（ごま・ひじき・鉄粉）。3D の格子のうち当たったセルだけ丸く落とす
        // 【対策】fbm の閾値で点を出すと、もやの塊になって「汚れ」に見える
        dots(x, y, z, freq, density, size, seed) {
            const gx = x * freq, gy = y * freq, gz = z * freq;
            const xi = Math.floor(gx), yi = Math.floor(gy), zi = Math.floor(gz);
            let best = 0;
            for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const cx = xi + dx, cy = yi + dy, cz = zi + dz;
                if (this._h3(cx, cy, cz, seed) > density) continue;
                const px = cx + this._h3(cx, cy, cz, seed + 1), py = cy + this._h3(cx, cy, cz, seed + 2), pz = cz + this._h3(cx, cy, cz, seed + 3);
                const d = Math.hypot(gx - px, gy - py, gz - pz);
                const r = size * (0.6 + 0.8 * this._h3(cx, cy, cz, seed + 4));
                best = Math.max(best, 1 - smooth(r * 0.55, r, d));
            }
            return best;
        },
        // セル状の凹凸（揚げ物の泡の跡）。F1 を返す
        cell(x, y, z, freq, seed) {
            const gx = x * freq, gy = y * freq, gz = z * freq;
            const xi = Math.floor(gx), yi = Math.floor(gy), zi = Math.floor(gz);
            let f1 = 9;
            for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const cx = xi + dx, cy = yi + dy, cz = zi + dz;
                const px = cx + this._h3(cx, cy, cz, seed), py = cy + this._h3(cx, cy, cz, seed + 1), pz = cz + this._h3(cx, cy, cz, seed + 2);
                const d = Math.hypot(gx - px, gy - py, gz - pz);
                if (d < f1) f1 = d;
            }
            return f1;
        }
    };

    // 制御点を Catmull-Rom で細分（開いた曲線、各要素は配列）
    function catmullOpen(ctrl, sub) {
        const n = ctrl.length, out = [], dim = ctrl[0].length;
        for (let i = 0; i < n - 1; i++) {
            const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n - 1, i + 2)];
            for (let k = 0; k < sub; k++) {
                const t = k / sub, t2 = t * t, t3 = t2 * t, q = [];
                for (let d = 0; d < dim; d++) {
                    q.push(0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2
                        + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3));
                }
                out.push(q);
            }
        }
        out.push(ctrl[n - 1].slice());
        return out;
    }
    // 折れ線を弧長で n 等分しなおす（制御点の疎密でテクスチャや格子が詰まらない）
    function resample(pts, n) {
        const m = pts.length, cum = [0];
        for (let i = 1; i < m; i++) {
            let d = 0;
            for (let k = 0; k < pts[i].length; k++) d += (pts[i][k] - pts[i - 1][k]) ** 2;
            cum.push(cum[i - 1] + Math.sqrt(d));
        }
        const L = cum[m - 1], out = [];
        let j = 0;
        for (let i = 0; i <= n; i++) {
            const s = L * i / n;
            while (j < m - 2 && cum[j + 1] < s) j++;
            const t = clamp((s - cum[j]) / ((cum[j + 1] - cum[j]) || 1e-9), 0, 1);
            out.push(pts[j].map((v, k) => mix(v, pts[j + 1][k], t)));
        }
        out.L = L;
        return out;
    }
    function softmin(vals, k) {
        let m = Infinity;
        for (const v of vals) if (v < m) m = v;
        let s = 0;
        for (const v of vals) s += Math.exp(-(v - m) / k);
        return m - k * Math.log(s);
    }

    // =================================================================
    // 2. Geo : 頂点の組み立て
    // =================================================================
    // 1個の具を、いくつかの「閉じた面」の寄せ集めとして作る。各頂点は
    //   P : 位置
    //   C : 生の色（sRGB。出汁を吸う前）
    //   W : 膜の付きやすさ（くぼみ・切り口ほど大きい）
    //   S : 出汁の染み込みやすさ（吸った深さの倍率）
    // を持つ。色は後で出汁の消散係数を掛けて頂点カラーに焼く
    class Geo {
        constructor() { this.P = []; this.C = []; this.W = []; this.S = []; this.T = []; this.I = []; }
        get nV() { return this.P.length / 3; }
        vert(p, c, w, s, tag) {
            this.P.push(p[0], p[1], p[2]);
            this.C.push(c[0], c[1], c[2]);
            this.W.push(w === undefined ? 1 : w);
            this.S.push(s === undefined ? 1 : s);
            this.T.push(tag || 0);
        }
        // 【対策】巻き順を決め打ちにすると、部品や面ごとに裏返る。
        //         閉じた面なら Σ n·(p − 重心) > 0 が外向き（発散定理）。
        //         部品ごとに判定するので、串と肉のように中身の違う物を
        //         1個にまとめても片方だけ裏返ることがない
        orient(v0, i0) {
            const nv = this.nV - v0, P = this.P, I = this.I;
            if (nv <= 0) return;
            const pos = new Float32Array(nv * 3);
            for (let i = 0; i < nv * 3; i++) pos[i] = P[v0 * 3 + i];
            const idx = new Uint32Array(I.length - i0);
            for (let i = 0; i < idx.length; i++) idx[i] = I[i0 + i] - v0;
            const nor = new Float32Array(nv * 3);
            BABYLON.VertexData.ComputeNormals(pos, idx, nor);
            let cx = 0, cy = 0, cz = 0;
            for (let i = 0; i < nv; i++) { cx += pos[i * 3]; cy += pos[i * 3 + 1]; cz += pos[i * 3 + 2]; }
            cx /= nv; cy /= nv; cz /= nv;
            let s = 0;
            for (let i = 0; i < nv; i++) {
                s += nor[i * 3] * (pos[i * 3] - cx) + nor[i * 3 + 1] * (pos[i * 3 + 1] - cy) + nor[i * 3 + 2] * (pos[i * 3 + 2] - cz);
            }
            if (s < 0) {
                for (let t = i0; t < I.length; t += 3) { const a = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = a; }
            }
        }
        append(g, tagOffset) {
            const v0 = this.nV;
            for (let i = 0; i < g.P.length; i++) this.P.push(g.P[i]);
            for (let i = 0; i < g.C.length; i++) this.C.push(g.C[i]);
            for (let i = 0; i < g.W.length; i++) { this.W.push(g.W[i]); this.S.push(g.S[i]); this.T.push(g.T[i] + (tagOffset || 0)); }
            for (let i = 0; i < g.I.length; i++) this.I.push(g.I[i] + v0);
        }
        transform(m) {
            const P = this.P, v = new V3();
            for (let i = 0; i < P.length; i += 3) {
                v.set(P[i], P[i + 1], P[i + 2]);
                V3.TransformCoordinatesToRef(v, m, v);
                P[i] = v.x; P[i + 1] = v.y; P[i + 2] = v.z;
            }
            return this;
        }
    }

    // 格子面。fn(u, v) → { p, c, w, s }。u 方向に nI、v 方向に nJ 分割。
    // 継ぎ目と極の頂点は重複したまま作り、法線だけ後で溶接する
    function gridSurface(geo, nI, nJ, fn, tag) {
        const v0 = geo.nV, i0 = geo.I.length;
        for (let i = 0; i <= nI; i++) {
            for (let j = 0; j <= nJ; j++) {
                const r = fn(i / nI, j / nJ);
                geo.vert(r.p, r.c, r.w, r.s, tag);
            }
        }
        const row = nJ + 1;
        for (let i = 0; i < nI; i++) {
            for (let j = 0; j < nJ; j++) {
                const a = v0 + i * row + j, b = a + 1, c = a + row, d = c + 1;
                geo.I.push(a, b, c, b, d, c);
            }
        }
        geo.orient(v0, i0);
    }

    // 放射体：中心から見て星形の立体（凸な塊、楕円体、角を落とした箱）。
    // キューブ球の6面を格子で張り、方向 d ごとに fn(d) が半径と色を返す。
    // ext で方向を引き伸ばすと、細長い物でも面の格子が均等に近くなる
    const CUBE_FACES = [
        { n: [1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] }, { n: [-1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
        { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] }, { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
        { n: [0, 0, 1], u: [-1, 0, 0], v: [0, 1, 0] }, { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] }
    ];
    function radialSolid(geo, N, ext, fn, tag) {
        const v0 = geo.nV, i0 = geo.I.length;
        const d = [0, 0, 0];
        for (const F of CUBE_FACES) {
            const base = geo.nV;
            for (let i = 0; i <= N; i++) {
                const a = -1 + 2 * i / N;
                for (let j = 0; j <= N; j++) {
                    const b = -1 + 2 * j / N;
                    // 【対策】キューブの格子をそのまま正規化すると面の中央が粗く、
                    //         角が密になる。tan で角度を等分してから投影する
                    const ta = Math.tan(a * Math.PI / 4), tb = Math.tan(b * Math.PI / 4);
                    let x = (F.n[0] + F.u[0] * ta + F.v[0] * tb) * ext[0];
                    let y = (F.n[1] + F.u[1] * ta + F.v[1] * tb) * ext[1];
                    let z = (F.n[2] + F.u[2] * ta + F.v[2] * tb) * ext[2];
                    const l = Math.hypot(x, y, z);
                    d[0] = x / l; d[1] = y / l; d[2] = z / l;
                    const r = fn(d);
                    geo.vert([d[0] * r.r, d[1] * r.r, d[2] * r.r], r.c, r.w, r.s, tag);
                }
            }
            const row = N + 1;
            for (let i = 0; i < N; i++) {
                for (let j = 0; j < N; j++) {
                    const a = base + i * row + j, b = a + 1, c = a + row, dd = c + 1;
                    geo.I.push(a, b, c, b, dd, c);
                }
            }
            // 面ごとに u×v と n の向きが違う。ここで揃えてから全体を判定する
            const cr = [F.u[1] * F.v[2] - F.u[2] * F.v[1], F.u[2] * F.v[0] - F.u[0] * F.v[2], F.u[0] * F.v[1] - F.u[1] * F.v[0]];
            if (cr[0] * F.n[0] + cr[1] * F.n[1] + cr[2] * F.n[2] < 0) {
                for (let t = geo.I.length - N * N * 6; t < geo.I.length; t += 3) {
                    const s = geo.I[t + 1]; geo.I[t + 1] = geo.I[t + 2]; geo.I[t + 2] = s;
                }
            }
        }
        geo.orient(v0, i0);
    }

    // 凸多面体（平面の集合）を角を落として、方向 d での半径を返す。
    // 【対策】平面と球を線形補間すると平らな切り口まで丸くなって石鹸になる。
    //         ソフト最小なら面の中央は平面のまま、稜線の近くだけが丸まる
    function polyRadius(d, planes, k) {
        const list = [];
        for (const pl of planes) {
            const dn = d[0] * pl.n[0] + d[1] * pl.n[1] + d[2] * pl.n[2];
            if (dn > 1e-4) list.push(pl.d / dn);
        }
        return list.length ? softmin(list, k) : 10;
    }

    // 位置が一致する頂点の法線を平均する。継ぎ目の十字の筋を消す
    function weldNormals(P, N) {
        const map = new Map();
        const n = P.length / 3;
        for (let i = 0; i < n; i++) {
            const k = Math.round(P[i * 3] * 4096) + "," + Math.round(P[i * 3 + 1] * 4096) + "," + Math.round(P[i * 3 + 2] * 4096);
            let a = map.get(k); if (!a) { a = []; map.set(k, a); }
            a.push(i);
        }
        for (const a of map.values()) {
            if (a.length < 2) continue;
            let x = 0, y = 0, z = 0;
            for (const i of a) { x += N[i * 3]; y += N[i * 3 + 1]; z += N[i * 3 + 2]; }
            const l = Math.hypot(x, y, z) || 1;
            for (const i of a) { N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l; }
        }
    }

    // Geo → 型付き配列。法線はここで初めて計算する（姿勢を与えた後）
    function bake(geo) {
        const P = new Float32Array(geo.P), I = new Uint32Array(geo.I);
        const N = new Float32Array(P.length);
        BABYLON.VertexData.ComputeNormals(P, I, N);
        weldNormals(P, N);
        return {
            P, I, N, nV: P.length / 3,
            C: new Float32Array(geo.C), W: new Float32Array(geo.W), S: new Float32Array(geo.S),
            T: new Uint8Array(geo.T)
        };
    }

    // 回転最小化フレーム（double reflection）。紐や帯を掃引するときに使う。
    // 【対策】上ベクトルとの外積で断面の基底を作ると、接線が鉛直に近い所で
    //         基底が 180° 飛んで帯がねじれる
    function rmf(path) {
        const n = path.length, T = [], R = [];
        for (let i = 0; i < n; i++) {
            const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
            const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            const l = Math.hypot(t[0], t[1], t[2]) || 1;
            T.push([t[0] / l, t[1] / l, t[2] / l]);
        }
        {
            const t = T[0];
            let u = [0, 1, 0];
            if (Math.abs(t[1]) > 0.9) u = [1, 0, 0];
            const d = u[0] * t[0] + u[1] * t[1] + u[2] * t[2];
            const r = [u[0] - d * t[0], u[1] - d * t[1], u[2] - d * t[2]];
            const l = Math.hypot(r[0], r[1], r[2]);
            R.push([r[0] / l, r[1] / l, r[2] / l]);
        }
        for (let i = 1; i < n; i++) {
            const p0 = path[i - 1], p1 = path[i], t0 = T[i - 1], t1 = T[i], r0 = R[i - 1];
            const v1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
            const c1 = v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2];
            if (c1 < 1e-16) { R.push(r0.slice()); continue; }
            const dr = (v1[0] * r0[0] + v1[1] * r0[1] + v1[2] * r0[2]) * 2 / c1;
            const rL = [r0[0] - dr * v1[0], r0[1] - dr * v1[1], r0[2] - dr * v1[2]];
            const dt = (v1[0] * t0[0] + v1[1] * t0[1] + v1[2] * t0[2]) * 2 / c1;
            const tL = [t0[0] - dt * v1[0], t0[1] - dt * v1[1], t0[2] - dt * v1[2]];
            const v2 = [t1[0] - tL[0], t1[1] - tL[1], t1[2] - tL[2]];
            const c2 = v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2];
            let r = rL;
            if (c2 > 1e-16) {
                const d2 = (v2[0] * rL[0] + v2[1] * rL[1] + v2[2] * rL[2]) * 2 / c2;
                r = [rL[0] - d2 * v2[0], rL[1] - d2 * v2[1], rL[2] - d2 * v2[2]];
            }
            const dd = r[0] * t1[0] + r[1] * t1[1] + r[2] * t1[2];
            r = [r[0] - dd * t1[0], r[1] - dd * t1[1], r[2] - dd * t1[2]];
            const l = Math.hypot(r[0], r[1], r[2]) || 1;
            R.push([r[0] / l, r[1] / l, r[2] / l]);
        }
        const B = T.map((t, i) => {
            const r = R[i];
            return [t[1] * r[2] - t[2] * r[1], t[2] * r[0] - t[0] * r[2], t[0] * r[1] - t[1] * r[0]];
        });
        return { T, R, B };
    }

    // 回転体。prof は [r, y, …] の列（下の極 → 上の極）。
    // fn(i, θ, pt) が { r, y, c, w, s } を返す（方位による変形や色はここで）
    function revolve(geo, prof, nA, fn, tag) {
        const nI = prof.length - 1;
        gridSurface(geo, nI, nA, (u, v) => {
            const i = Math.round(u * nI), th = v * TAU;
            const q = fn(i, th, prof[i], u);
            return { p: [q.r * Math.cos(th), q.y, q.r * Math.sin(th)], c: q.c, w: q.w, s: q.s };
        }, tag);
    }

    // =================================================================
    // 3. 具
    // =================================================================
    // どの具も builder(seed, q) → Geo。q は解像度だけを変える（1 = 表示用、
    // 0.2 前後 = 置き場所探し用）。形は seed だけで決まるので、粗いものと
    // 細かいものは同じ形になる。
    // 色はすべて「出汁を吸う前」の sRGB。染みは後で出汁ごとに掛ける。
    // 【対策】写真から拾った色をそのまま入れると、その上に出汁の染みと膜が
    //         重なって二重に暗くなり、全部が焦げ茶に沈む
    const res = (n, q, lo) => Math.max(lo || 4, Math.round(n * q));

    // 折れ線の角を半径 rf で丸める（二次ベジェで近似）
    function fillet(pts, rfs, segs) {
        const out = [pts[0]];
        for (let i = 1; i < pts.length - 1; i++) {
            const rf = Array.isArray(rfs) ? rfs[i] : rfs;
            const A = pts[i - 1], B = pts[i], C = pts[i + 1];
            if (!rf) { out.push(B); continue; }
            const la = Math.hypot(A[0] - B[0], A[1] - B[1]), lc = Math.hypot(C[0] - B[0], C[1] - B[1]);
            const t = Math.min(rf, la * 0.45, lc * 0.45);
            const P1 = [B[0] + (A[0] - B[0]) / la * t, B[1] + (A[1] - B[1]) / la * t];
            const P2 = [B[0] + (C[0] - B[0]) / lc * t, B[1] + (C[1] - B[1]) / lc * t];
            for (let k = 0; k <= segs; k++) {
                const s = k / segs, a = (1 - s) * (1 - s), b = 2 * s * (1 - s), c = s * s;
                out.push([a * P1[0] + b * B[0] + c * P2[0], a * P1[1] + b * B[1] + c * P2[1]]);
            }
        }
        out.push(pts[pts.length - 1]);
        return out;
    }

    // ---- 大根 -----------------------------------------------------------
    // 【対策】円柱に面取りを付けただけだと「白いかまぼこ」になる。大根を
    //         大根に見せるのは (a) 切り口の放射状の繊維と、皮のすぐ内側の
    //         維管束の輪、(b) 包丁で剥いた側面の細い面（ファセット）、
    //         (c) 外側から染みて中心ほど淡い琥珀色、の3つ
    function buildDaikon(seed, q) {
        const r = new Rng(seed);
        const R = r.range(3.25, 3.70), H = r.range(2.5, 3.1), ch = r.range(0.35, 0.55);
        const sd = (seed % 9973) + 17;
        const nFacet = 11 + r.int(5), facetPh = r.range(0, TAU), ell = r.range(-0.03, 0.03), ellPh = r.range(0, TAU);
        let prof = [[0, 0], [R - ch, 0], [R, ch * 0.9], [R, H - ch * 0.9], [R - ch, H], [0, H]];
        prof = fillet(prof, [0, 0.10, 0.10, 0.10, 0.10, 0], 4);
        prof = resample(prof, res(96, q, 10));
        const geo = new Geo();
        const RAW = [0.915, 0.905, 0.845], RING = [0.800, 0.810, 0.700], SIDE = [0.900, 0.890, 0.820];
        revolve(geo, prof, res(176, q, 12), (i, th, pt) => {
            let rr = pt[0], y = pt[1];
            const side = smooth(R - ch * 0.6, R - 0.02, rr);           // 側面らしさ
            const face = 1 - side;
            // 断面が真円でない（楕円気味＋剥いた面）
            const facet = Math.cos(Math.PI / nFacet) / Math.cos(((th - facetPh) % (TAU / nFacet) + TAU / nFacet) % (TAU / nFacet) - Math.PI / nFacet);
            const shape = (1 + ell * Math.cos(2 * (th - ellPh))) * mix(1, facet, 0.55)
                * (1 + 0.012 * (Noise.v2(th * 3, 0.5, sd) - 0.5) * 2);
            rr *= shape;
            const x = rr * Math.cos(th), z = rr * Math.sin(th);
            // 切り口は少しうねる（煮えて繊維が浮く）
            const top = y > H * 0.5 ? 1 : 0;
            y += face * (top ? 1 : -1) * 0.035 * (Noise.fbm2(x * 0.7 + 3, z * 0.7 + top * 9, sd + 3, 3) - 0.5) * 2;
            // ---- 色 ----------------------------------------------------
            const rn = clamp(pt[0] / R, 0, 1);
            const fib = Noise.fbm2(th * 16, rn * 5 + top * 7, sd + 11, 3);           // 放射状の繊維
            const vfib = Noise.fbm2(th * 30, y * 0.8, sd + 13, 2);                  // 側面の縦の筋
            let c = mix3(RAW, mix3(RAW, RING, 0.45), smooth(0.45, 0.85, fib) * face);
            // 維管束の輪（皮のすぐ内側）。煮えると透き通って少し暗い
            const ring = Math.exp(-Math.pow((rn - 0.90) / 0.025, 2)) * face;
            c = mix3(c, RING, ring * 0.65);
            // 芯は白く不透明、外ほど透ける
            c = mix3(c, [0.94, 0.93, 0.89], (1 - smooth(0.0, 0.35, rn)) * face * 0.5);
            c = mix3(c, SIDE, side);
            c = mix3(c, RING, side * smooth(0.55, 0.8, vfib) * 0.35);
            // 染み：外側からしみるので中心ほど淡い。斑も入れる
            const blot = Noise.fbm3(x * 0.6, y * 0.6, z * 0.6, sd + 21, 3);
            const s = (0.95 + 0.55 * smooth(0.25, 1.0, rn) + 0.15 * side) * (0.80 + 0.45 * blot);
            return { r: rr, y, c, w: 1.0 - 0.2 * side, s };
        });
        return geo;
    }

    // ---- ゆで卵 -----------------------------------------------------------
    // 【対策】楕円体の卵は「白い石」に見える。卵は片側がわずかに太い。
    //         染みは均一ではなく、鍋の中で他の具に当たっていた所が淡い
    function buildEgg(seed, q) {
        const r = new Rng(seed);
        const Rm = r.range(1.95, 2.15), hL = Rm * r.range(1.28, 1.36), k = r.range(0.05, 0.09);
        const sd = (seed % 9973) + 31;
        const n = res(72, q, 8);
        const prof = [];
        for (let i = 0; i <= n; i++) {
            const ph = i / n * Math.PI;
            prof.push([Rm * Math.sin(ph) * (1 - k * Math.cos(ph)), -hL * Math.cos(ph)]);
        }
        const geo = new Geo();
        revolve(geo, prof, res(112, q, 10), (i, th, pt) => {
            const x = pt[0] * Math.cos(th), z = pt[0] * Math.sin(th), y = pt[1];
            const bump = 1 + 0.010 * (Noise.fbm3(x * 0.9, y * 0.9, z * 0.9, sd, 3) - 0.5) * 2;
            const blot = Noise.fbm3(x * 0.55 + 4, y * 0.55, z * 0.55, sd + 7, 3);
            // 白身はわずかに青白く、ところどころ黄味
            const c = mix3([0.965, 0.958, 0.930], [0.955, 0.935, 0.880], smooth(0.4, 0.8, blot));
            return { r: pt[0] * bump, y: y * bump, c, w: 0.75, s: 0.75 + 0.55 * blot };
        });
        return geo;
    }

    // ---- こんにゃく（三角） --------------------------------------------
    // 【対策】灰色の三角柱は「消しゴム」。こんにゃくらしさは
    //         (a) 表裏の格子状の隠し包丁（味をしみさせる切れ目）
    //         (b) 海藻粉の黒い点
    //         (c) 切れ目の溝にだけ出汁が溜まって濃い
    //         の3つ。溝は幾何で彫るので、表示用の格子は細かくする
    function buildKonnyaku(seed, q) {
        const r = new Rng(seed);
        const Lg = r.range(5.8, 6.8), T = r.range(1.45, 1.85), sd = (seed % 9973) + 41;
        const pitch = r.range(0.70, 0.90), gW = 0.055, gD = r.range(0.07, 0.10), gRot = r.range(-0.08, 0.08);
        // 直角二等辺三角形。重心を原点に置く
        const cx = Lg / 3, cy = Lg / 3;
        const tri = [[-cx, -cy], [Lg - cx, -cy], [-cx, Lg - cy]];
        const planes = [];
        for (let i = 0; i < 3; i++) {
            const a = tri[i], b = tri[(i + 1) % 3];
            let nx = b[1] - a[1], ny = -(b[0] - a[0]);
            const l = Math.hypot(nx, ny); nx /= l; ny /= l;
            const d = nx * a[0] + ny * a[1];
            if (d < 0) { nx = -nx; ny = -ny; }
            planes.push({ n: [nx, ny, 0], d: Math.abs(d) });
        }
        planes.push({ n: [0, 0, 1], d: T / 2 }, { n: [0, 0, -1], d: T / 2 });
        const geo = new Geo();
        const ca = Math.cos(Math.PI / 4 + gRot), sa = Math.sin(Math.PI / 4 + gRot);
        radialSolid(geo, res(104, q, 6), [Lg * 0.45, Lg * 0.45, T * 0.5], (d) => {
            let rr = polyRadius(d, planes, 0.085);
            const x = d[0] * rr, y = d[1] * rr, z = d[2] * rr;
            // 隠し包丁：表裏の大きな面だけ。斜めの格子
            const onFace = smooth(T / 2 - 0.22, T / 2 - 0.06, Math.abs(z));
            let g = 0;
            if (onFace > 0) {
                const a = (x * ca + y * sa) / pitch, b = (-x * sa + y * ca) / pitch;
                const da = Math.abs(a - Math.round(a)) * pitch, db = Math.abs(b - Math.round(b)) * pitch;
                g = Math.max(1 - smooth(0, gW, da), 1 - smooth(0, gW, db)) * onFace;
                // 溝の縁が少しささくれる
                g *= 0.75 + 0.5 * Noise.v3(x * 6, y * 6, z * 6, sd);
                rr -= g * gD / Math.max(0.35, Math.abs(d[2]));
            }
            const sp = Noise.dots(x, y, z, 11.0, 0.10, 0.40, sd + 5);
            const mott = Noise.fbm3(x * 0.8, y * 0.8, z * 0.8, sd + 9, 3);
            // 煮えたこんにゃくは灰色に少し茶が入った半透明。黒く塗ると板チョコになる
            let c = mix3([0.600, 0.575, 0.545], [0.540, 0.515, 0.490], mott);
            c = mix3(c, [0.220, 0.205, 0.195], sp * 0.80);
            c = mix3(c, [0.50, 0.47, 0.44], g * 0.4);
            return { r: rr, c, w: 1.0 + 2.0 * g, s: 0.45 + 0.9 * g };
        });
        return geo;
    }

    // ---- ちくわ（斜め切りの半分） ---------------------------------------
    // 焼き目の付いた筒。片端はもとの丸い端、もう片端は斜めの切り口
    function buildChikuwa(seed, q) {
        const r = new Rng(seed);
        const Ro = r.range(1.35, 1.60), Ri = Ro * r.range(0.40, 0.48), L = r.range(5.8, 7.0);
        const tanA = Math.tan(r.range(0.55, 0.85)), sd = (seed % 9973) + 51, burnTh = r.range(0, TAU);
        // 断面（r, 軸方向の長さ）を一周する閉じたループ
        let loop = [[Ro, L * 0.5], [Ro, L], [Ri, L], [Ri, 0], [Ro, 0], [Ro, L * 0.5]];
        loop = fillet(loop, [0, 0.14, 0.08, 0.20, 0.38, 0], 5);
        loop = resample(loop, res(128, q, 12));
        const geo = new Geo();
        const SKIN = [0.790, 0.540, 0.270], BURN = [0.580, 0.340, 0.140], PALE = [0.880, 0.730, 0.480];
        const MEAT = [0.950, 0.925, 0.850];
        gridSurface(geo, loop.length - 1, res(96, q, 10), (u, v) => {
            const i = Math.round(u * (loop.length - 1)), th = v * TAU;
            let rr = loop[i][0], ya = loop[i][1];
            const outer = smooth(Ri + (Ro - Ri) * 0.75, Ro - 0.02, rr) * smooth(0.02, 0.3, ya) ;
            const outerAll = smooth(Ri + (Ro - Ri) * 0.7, Ro - 0.01, rr);
            const inner = 1 - smooth(Ri + 0.01, Ri + (Ro - Ri) * 0.25, rr);
            const cut = smooth(L - 0.25, L - 0.02, ya) * (1 - outer) * (1 - inner);
            // 表面のざらつき
            let x = rr * Math.cos(th), z = rr * Math.sin(th);
            const bump = Noise.fbm3(x * 4, ya * 4, z * 4, sd, 3) - 0.5;
            rr += outerAll * 0.010 * bump * 2 + outerAll * 0.04 * (Noise.fbm3(x * 0.9, ya * 0.9, z * 0.9, sd + 3, 2) - 0.5);
            x = rr * Math.cos(th); z = rr * Math.sin(th);
            // 斜めの切り口は軸方向に比例してずれる（壁は直線のまま）
            const y = -L * 0.5 + ya + tanA * x * (ya / L);
            // ---- 色 ----
            const ang = Math.cos(th - burnTh);
            const burnN = Noise.fbm3(x * 1.6, ya * 1.2, z * 1.6, sd + 7, 3);
            // 焼き目はほぼ一周。網に当たらなかった細い筋だけが淡い
            const burn = 1 - smooth(0.80, 0.97, -ang + (burnN - 0.5) * 0.4);
            let c = mix3(PALE, SKIN, burn);
            // 焼き目の濃い所は、大きな斑と、網目のようにつながった筋
            const vein = 1 - Math.abs(2 * Noise.fbm3(x * 1.1, ya * 0.7, z * 1.1, sd + 9, 3) - 1);
            c = mix3(c, BURN, smooth(0.55, 0.85, burnN) * burn * 0.70);
            c = mix3(c, BURN, smooth(0.80, 0.95, vein) * burn * 0.45);
            c = mix3(MEAT, c, outerAll);
            const s = mix(1.15, 0.45, outerAll);
            return { p: [x, y, z], c, w: 1.0 + 0.7 * inner + 0.3 * cut, s };
        });
        return geo;
    }

    // ---- さつま揚げ（丸天） ----------------------------------------------
    function buildSatsuma(seed, q) {
        const r = new Rng(seed);
        const R = r.range(3.1, 3.6), h0 = r.range(0.50, 0.62), sd = (seed % 9973) + 61;
        const geo = new Geo();
        // 【対策】濃淡の差を大きく取るとサラミやピザに見える。揚げ色はほぼ一様で、
        //         縁が少し濃いだけ。差は細かい泡の跡で付ける
        const MID = [0.640, 0.450, 0.240], DARK = [0.500, 0.330, 0.150], LIGHT = [0.740, 0.560, 0.330];
        radialSolid(geo, res(64, q, 6), [R, h0, R], (d) => {
            const rho = Math.hypot(d[0], d[2]) || 1e-6, th = Math.atan2(d[2], d[0]);
            const Rt = R * (1 + 0.035 * Math.sin(3 * th + sd) + 0.05 * (Noise.v2(Math.cos(th) * 1.5 + 3, Math.sin(th) * 1.5, sd) - 0.5));
            const rc = Rt / rho;
            const xr = Math.min(1, (h0 / Math.max(1e-4, Math.abs(d[1]))) * rho / Rt);
            const h = h0 * (1 + 0.18 * (1 - xr * xr));                     // 中央がふくらむ
            const rt = h / Math.max(1e-4, Math.abs(d[1]));
            let rr = softmin([rc, rt], 0.32);
            const x = d[0] * rr, y = d[1] * rr, z = d[2] * rr;
            // 揚げた面：小さな泡の跡と、大きなうねり
            const cl = Noise.cell(x, y, z, 3.2, sd + 3);
            const pit = 1 - smooth(0.0, 0.42, cl);
            const lump = Noise.fbm3(x * 0.8, y * 0.8, z * 0.8, sd + 5, 3) - 0.5;
            rr += 0.07 * lump - 0.03 * pit;
            const t = Noise.fbm3(x * 1.3 + 5, y * 1.3, z * 1.3, sd + 7, 3);
            const edge = smooth(0.55, 0.95, rho);
            let c = mix3(LIGHT, MID, smooth(0.30, 0.60, t + 0.25 * edge));
            c = mix3(c, DARK, smooth(0.55, 0.85, t + 0.20 * edge) * 0.55);
            c = mix3(c, DARK, pit * 0.45);
            return { r: rr, c, w: 1.0 + 0.6 * pit, s: 0.45 };
        });
        return geo;
    }

    // ---- 厚揚げ -------------------------------------------------------------
    // 大きな厚揚げを4つに切った1切れ：揚げた皮の面と、白い豆腐の切り口が2面
    function buildAtsuage(seed, q) {
        const r = new Rng(seed);
        const a = [r.range(2.7, 3.1), r.range(1.25, 1.50), r.range(1.75, 2.05)], sd = (seed % 9973) + 71;
        const planes = [
            { n: [1, 0, 0], d: a[0] }, { n: [-1, 0, 0], d: a[0] }, { n: [0, 1, 0], d: a[1] },
            { n: [0, -1, 0], d: a[1] }, { n: [0, 0, 1], d: a[2] }, { n: [0, 0, -1], d: a[2] }
        ];
        const geo = new Geo();
        const SKIN = [0.830, 0.600, 0.300], SKIN_D = [0.640, 0.410, 0.170], TOFU = [0.935, 0.905, 0.800];
        radialSolid(geo, res(64, q, 6), a, (d) => {
            let rr = polyRadius(d, planes, 0.20);
            const x = d[0] * rr, y = d[1] * rr, z = d[2] * rr;
            // どの面に居るか
            const fx = Math.abs(x) / a[0], fy = Math.abs(y) / a[1], fz = Math.abs(z) / a[2];
            const cutX = x > 0 ? smooth(0.80, 0.97, fx) : 0;          // +x と −z が包丁の切り口
            const cutZ = z < 0 ? smooth(0.80, 0.97, fz) : 0;
            // 切り口でも縁の 1.5mm は揚げた皮
            const rimX = cutX * (smooth(a[1] - 0.22, a[1] - 0.10, Math.abs(y)) + smooth(a[2] - 0.22, a[2] - 0.10, Math.abs(z)));
            const rimZ = cutZ * (smooth(a[1] - 0.22, a[1] - 0.10, Math.abs(y)) + smooth(a[0] - 0.22, a[0] - 0.10, Math.abs(x)));
            const cut = clamp(Math.max(cutX - rimX, cutZ - rimZ), 0, 1);
            const skin = 1 - cut;
            const cl = Noise.cell(x, y, z, 4.5, sd);
            const bub = 1 - smooth(0.0, 0.40, cl);
            const wr = Noise.fbm3(x * 1.4, y * 1.4, z * 1.4, sd + 3, 3) - 0.5;
            const pore = Noise.dots(x, y, z, 10, 0.30, 0.40, sd + 5);
            rr += skin * (0.030 * wr * 2 - 0.022 * bub) - cut * 0.012 * pore + cut * 0.010 * (Noise.fbm3(x * 3, y * 3, z * 3, sd + 7, 2) - 0.5);
            const t = Noise.fbm3(x * 1.1, y * 1.1, z * 1.1, sd + 9, 3);
            let c = mix3(SKIN, SKIN_D, smooth(0.45, 0.80, t) * 0.8 + bub * 0.15);
            c = mix3(c, TOFU, cut);
            c = mix3(c, [0.86, 0.82, 0.70], cut * pore * 0.6);
            return { r: rr, c, w: 1.0 + 0.4 * cut, s: mix(0.35, 1.35, cut) };
        });
        return geo;
    }

    // ---- 結び昆布 ---------------------------------------------------------
    // 【対策】紐を本当に結ぶと、幅 2.5cm の帯は結び目で必ず自分を貫いて
    //         破れた紙になる。実物を見ると、結び目は「ひだの寄った塊」で、
    //         左右に平たい帯（羽）が出ている。羽 2 枚・結び目の塊・
    //         塊を巻く帯の3つで作る
    function buildKombu(seed, q) {
        const r = new Rng(seed);
        const sd = (seed % 9973) + 81, wMax = r.range(1.05, 1.30), Lw = r.range(3.6, 4.4);
        const geo = new Geo();
        const DARK = [0.190, 0.215, 0.105], OLIVE = [0.300, 0.330, 0.140], EDGE = [0.360, 0.380, 0.160];
        const ribbon = (path, wFn, th, tag) => {
            const P = resample(catmullOpen(path, 8), res(110, q, 10));
            const F = rmf(P), n = P.length - 1;
            gridSurface(geo, n, res(20, q, 6), (u, v) => {
                const i = Math.round(u * n), ph = v * TAU;
                const p = P[i], R = F.R[i], B = F.B[i];
                // 両端は幅も厚みも 0 へ落として閉じる（開いた筒だと端に穴が空く）
                const endF = Math.sqrt(smooth(0, 0.035, u) * smooth(1, 0.965, u));
                const w = wFn(u) * endF, cp = Math.cos(ph), sp = Math.sin(ph);
                const edge = Math.abs(cp);
                // 縁が波打つ（昆布の耳）
                const wave = (0.07 * Math.sin(u * P.L / 1.6 * TAU + cp * 1.2 + sd) + 0.03 * Math.sin(u * P.L / 0.7 * TAU + sd * 2))
                    * Math.pow(edge, 3) * smooth(0.0, 0.08, Math.min(u, 1 - u));
                const a = w * cp, b = (th * sp + wave) * endF;
                const x = p[0] + B[0] * a + R[0] * b, y = p[1] + B[1] * a + R[1] * b, z = p[2] + B[2] * a + R[2] * b;
                const m = Noise.fbm3(x * 1.2, y * 1.2, z * 1.2, sd + 3, 3);
                let c = mix3(DARK, OLIVE, smooth(0.35, 0.75, m));
                c = mix3(c, EDGE, Math.pow(edge, 6) * 0.7);
                return { p: [x, y, z], c, w: 1.2, s: 0.10 };
            }, tag);
        };
        // 羽（左右）。少し反って、先が持ち上がる
        const curl = r.range(0.15, 0.45);
        for (const sg of [-1, 1]) {
            const ang = sg > 0 ? r.range(-0.25, 0.25) : Math.PI + r.range(-0.25, 0.25);
            const dx = Math.cos(ang), dz = Math.sin(ang);
            const path = [];
            for (let k = 0; k <= 5; k++) {
                const s = 0.4 + k / 5 * Lw;
                path.push([dx * s + 0.10 * Math.sin(k * 1.7 + sd) * -dz, curl * Math.pow(k / 5, 2) + 0.05 * Math.sin(k + sd),
                    dz * s + 0.10 * Math.sin(k * 1.7 + sd) * dx]);
            }
            ribbon(path, (u) => wMax * (0.55 + 0.45 * smooth(0.0, 0.35, u)), 0.055, 0);
        }
        // 結び目の塊：ひだの寄った楕円体
        const kn = [r.range(0.95, 1.15), r.range(0.70, 0.85), r.range(0.90, 1.05)];
        radialSolid(geo, res(30, q, 4), kn, (d) => {
            const th = Math.atan2(d[2], d[0]);
            let rr = 1 / Math.hypot(d[0] / kn[0], d[1] / kn[1], d[2] / kn[2]);
            const fold = Math.sin(th * 5 + d[1] * 4 + sd) * 0.10 + (Noise.fbm3(d[0] * 2, d[1] * 2, d[2] * 2, sd + 7, 3) - 0.5) * 0.25;
            rr *= 1 + fold;
            const m = Noise.fbm3(d[0] * 3, d[1] * 3, d[2] * 3, sd + 9, 2);
            return { r: rr, c: mix3(DARK, OLIVE, smooth(0.3, 0.8, m) * 0.8), w: 1.5, s: 0.1 };
        });
        // 塊を斜めに巻く帯
        const tilt = r.range(0.5, 0.9), path = [];
        for (let k = 0; k <= 12; k++) {
            const a = -0.3 + k / 12 * (TAU * 0.92);
            const x = Math.cos(a) * (kn[0] + 0.05), y0 = Math.sin(a) * (kn[1] + 0.05);
            path.push([x * Math.cos(tilt) * 0.55, y0, x * Math.sin(tilt) * 0.55 + Math.sin(a) * 0.15]);
        }
        ribbon(path, (u) => 0.55, 0.07, 0);
        return geo;
    }

    // ---- 巾着（餅入り） ---------------------------------------------------
    // 油揚げの袋。上をかんぴょうで縛り、口がひだになって開く
    function buildKinchaku(seed, q) {
        const r = new Rng(seed);
        const sd = (seed % 9973) + 91, Rb = r.range(2.25, 2.55), Hb = r.range(1.85, 2.15);
        const yN = Hb * 1.02, rN = r.range(0.40, 0.52);
        let prof = [[0, -Hb], [Rb * 0.55, -Hb * 0.95], [Rb * 0.88, -Hb * 0.68], [Rb, -Hb * 0.20], [Rb * 0.97, Hb * 0.22],
            [Rb * 0.78, Hb * 0.62], [Rb * 0.45, Hb * 0.88], [rN, yN], [rN + 0.12, yN + 0.22], [rN + 0.55, yN + 0.55],
            [rN + 0.85, yN + 0.85], [rN + 0.70, yN + 0.98], [rN + 0.28, yN + 0.80], [0, yN + 0.70]];
        prof = resample(catmullOpen(prof, 6), res(120, q, 10));
        const geo = new Geo();
        const AGE = [0.860, 0.640, 0.330], AGE_D = [0.690, 0.470, 0.200];
        revolve(geo, prof, res(120, q, 10), (i, th, pt, u) => {
            let rr = pt[0], y = pt[1];
            const flare = smooth(yN + 0.05, yN + 0.5, y);
            const gather = smooth(-0.2 * Hb, yN, y) * (1 - flare);
            // 口のひだ
            // 【対策】単一周波数のひだは菊の花の形になる。油揚げの口は不揃いに
            //         寄ってつぶれるので、周波数を混ぜ、振幅も方位で変える
            const amp = 0.35 + 1.1 * Noise.v2(Math.cos(th) * 1.4 + 2, Math.sin(th) * 1.4, sd + 13);
            const ph = 6 * th + 3.0 * (Noise.v2(Math.cos(th) * 2, Math.sin(th) * 2, sd) - 0.5);
            const ruf = Math.sin(ph) * 0.55 + Math.sin(13 * th + 1.7 + 2 * amp) * 0.30 + (Noise.v2(th * 5, y * 3, sd + 15) - 0.5) * 0.5;
            rr *= (1 + flare * 0.16 * amp * ruf) * (1 - 0.30 * flare * (1 - amp * 0.6));
            y += flare * (0.12 * amp * Math.sin(ph + 1.1) - 0.30 * (1 - Math.min(1, amp)));
            // 縛った所へ寄るしわ
            rr += gather * 0.10 * Math.sin(13 * th + 2.0 * Noise.v2(th * 3, y, sd + 3)) * smooth(0, 0.4, rr);
            rr *= 1 + 0.03 * (Noise.fbm3(Math.cos(th) * 2, y * 1.3, Math.sin(th) * 2, sd + 5, 3) - 0.5) * 2;
            const x = rr * Math.cos(th), z = rr * Math.sin(th);
            const m = Noise.fbm3(x * 1.1, y * 1.1, z * 1.1, sd + 7, 3);
            let c = mix3(AGE, AGE_D, smooth(0.45, 0.80, m));
            c = mix3(c, [0.90, 0.74, 0.46], flare * 0.35);
            c = mix3(c, AGE_D, Noise.dots(x, y, z, 7, 0.3, 0.5, sd + 9) * 0.3);
            return { r: Math.max(0, rr), y, c, w: 1.0 + 0.5 * gather, s: 0.55 };
        });
        // かんぴょうの帯
        const nB = res(64, q, 8);
        gridSurface(geo, nB, res(16, q, 6), (u, v) => {
            const a = u * TAU, ph = v * TAU;
            const cr = rN + 0.10 + 0.05 * Math.cos(ph), cy = yN + 0.06 + 0.05 * Math.sin(2 * a) + 0.17 * Math.sin(ph);
            const f = Noise.v2(a * 20, ph, sd + 11);
            return {
                p: [Math.cos(a) * cr, cy, Math.sin(a) * cr],
                c: mix3([0.80, 0.63, 0.36], [0.70, 0.52, 0.27], f), w: 1.2, s: 0.8
            };
        });
        // 結び目の小さなこぶ
        const kx = Math.cos(0.6) * (rN + 0.18), kz = Math.sin(0.6) * (rN + 0.18);
        const sub = new Geo();
        radialSolid(sub, res(12, q, 3), [0.22, 0.20, 0.22], (d) => ({
            r: 0.22 * (1 + 0.15 * Math.sin(d[0] * 7 + d[1] * 5)), c: [0.76, 0.58, 0.31], w: 1.2, s: 0.8
        }));
        sub.transform(BABYLON.Matrix.Translation(kx, yN + 0.06, kz));
        geo.append(sub);
        return geo;
    }

    // ---- 牛すじ串 -----------------------------------------------------------
    // 串は x 軸。T=1 の頂点が串（置き場所の計算では除く）
    function buildGyusuji(seed, q) {
        const r = new Rng(seed);
        const sd = (seed % 9973) + 101;
        const geo = new Geo();
        const GEL = [0.720, 0.580, 0.400], MEAT = [0.480, 0.290, 0.150], FAT = [0.860, 0.780, 0.620];
        const xs = [-2.5, -0.35, 1.85];
        for (let k = 0; k < 3; k++) {
            const sub = new Geo();
            const e = [r.range(0.95, 1.20), r.range(0.95, 1.25), r.range(0.85, 1.10)];
            const s2 = sd + k * 17;
            radialSolid(sub, res(34, q, 4), e, (d) => {
                let rr = 1 / Math.hypot(d[0] / e[0], d[1] / e[1], d[2] / e[2]);
                rr *= 1 + 0.18 * (Noise.fbm3(d[0] * 1.4 + k, d[1] * 1.4, d[2] * 1.4, s2, 3) - 0.5) * 2
                    + 0.06 * (Noise.fbm3(d[0] * 4, d[1] * 4, d[2] * 4, s2 + 3, 2) - 0.5) * 2;
                const x = d[0] * rr, y = d[1] * rr, z = d[2] * rr;
                const band = Noise.fbm3(x * 1.4 + 3, y * 0.7, z * 1.4, s2 + 5, 3);
                let c = mix3(GEL, MEAT, smooth(0.50, 0.70, band));
                c = mix3(c, FAT, smooth(0.70, 0.85, Noise.fbm3(x * 2, y * 2, z * 2, s2 + 7, 2)) * 0.5);
                return { r: rr, c, w: 1.2, s: 0.7 };
            });
            sub.transform(BABYLON.Matrix.RotationYawPitchRoll(r.range(0, TAU), r.range(-0.4, 0.4), r.range(-0.4, 0.4))
                .multiply(BABYLON.Matrix.Translation(xs[k], 0, 0)));
            geo.append(sub);
        }
        // 竹串：先が尖り、持ち手は平らに切ってある
        const x0 = -3.55, x1 = 11.0, rs = 0.135;
        gridSurface(geo, res(64, q, 6), res(12, q, 6), (u, v) => {
            const x = mix(x0, x1, u), ph = v * TAU;
            const tip = smooth(0, 0.07, u), end = u > 0.995 ? 0 : 1;
            const rr = rs * tip * end;
            const fib = Noise.v2(ph * 3, x * 6, sd + 9);
            const wet = smooth(4.0, 2.5, x);
            let c = mix3([0.880, 0.780, 0.560], [0.780, 0.660, 0.440], fib);
            c = mix3(c, [0.640, 0.470, 0.260], wet * 0.7);
            return { p: [x, rr * Math.cos(ph), rr * Math.sin(ph) * 0.8], c, w: 0.4, s: 0.3 };
        }, 1);
        return geo;
    }

    // ---- ウインナー ---------------------------------------------------------
    function buildWiener(seed, q) {
        const r = new Rng(seed);
        const R = r.range(0.95, 1.10), L = r.range(5.4, 6.6), h = L / 2 - R, sd = (seed % 9973) + 111;
        const bend = r.range(0.10, 0.25);
        const geo = new Geo();
        radialSolid(geo, res(40, q, 4), [L / 2, R, R], (d) => {
            const ax = Math.abs(d[0]), rho = Math.hypot(d[1], d[2]);
            let t = rho > 1e-6 ? R / rho : 1e9;
            if (t * ax > h) t = h * ax + Math.sqrt(Math.max(0, h * h * ax * ax - h * h + R * R));
            const x = d[0] * t;
            const endW = smooth(h - 0.3, h + R * 0.6, Math.abs(x));
            // 両端のねじれじわ
            const tw = endW * 0.04 * Math.sin(Math.atan2(d[2], d[1]) * 7 + Math.abs(x) * 6);
            t *= 1 + tw / R + 0.01 * (Noise.fbm3(d[0] * 3, d[1] * 3, d[2] * 3, sd, 2) - 0.5);
            const m = Noise.fbm3(d[0] * 2 + 3, d[1] * 2, d[2] * 2, sd + 3, 3);
            let c = mix3([0.700, 0.400, 0.260], [0.600, 0.330, 0.200], smooth(0.4, 0.8, m));
            c = mix3(c, [0.82, 0.52, 0.36], endW * 0.4);
            return { r: t, c, w: 0.7, s: 0.25 };
        });
        // 少し反らせる
        for (let i = 0; i < geo.P.length; i += 3) {
            const x = geo.P[i] / (L / 2);
            geo.P[i + 1] += bend * (x * x - 0.33);
        }
        return geo;
    }

    // ---- 種類の表 ------------------------------------------------------------
    // poses は「置いたときの基本姿勢」。重みつきで1つ選び、ヨーと小さな傾きを足す。
    // mat は種類ごとの PBR の値（照りは出汁の膜＝clearCoat が担う）
    const RX = (a) => BABYLON.Quaternion.RotationAxis(new V3(1, 0, 0), a);
    const RZ = (a) => BABYLON.Quaternion.RotationAxis(new V3(0, 0, 1), a);
    const QI = () => BABYLON.Quaternion.Identity();
    const KINDS = {
        daikon: {
            label: "大根", build: buildDaikon, order: 1,
            poses: [[0.62, QI()], [0.38, RX(Math.PI / 2)]], tilt: 0.25,
            mat: { rough: 0.30, coat: 0.70, coatRough: 0.10, trans: 0.45, tint: [0.88, 0.58, 0.22], thick: 0.9 }
        },
        egg: {
            label: "卵", build: buildEgg, order: 4,
            poses: [[1, RZ(Math.PI / 2)]], tilt: 0.30,
            mat: { rough: 0.30, coat: 0.80, coatRough: 0.07, trans: 0.30, tint: [0.98, 0.90, 0.75], thick: 0.6 }
        },
        konnyaku: {
            label: "こんにゃく", build: buildKonnyaku, order: 3,
            poses: [[0.5, RX(Math.PI / 2)], [0.5, RZ(-Math.PI * 0.75)]], tilt: 0.35,
            mat: { rough: 0.28, coat: 0.90, coatRough: 0.06, trans: 0.35, tint: [0.55, 0.50, 0.44], thick: 0.5 }
        },
        chikuwa: {
            label: "ちくわ", build: buildChikuwa, order: 4,
            poses: [[0.55, RZ(Math.PI / 2)], [0.45, QI()]], tilt: 0.30,
            mat: { rough: 0.48, coat: 0.70, coatRough: 0.14, trans: 0.12, tint: [0.90, 0.70, 0.45], thick: 0.4 }
        },
        satsuma: {
            label: "さつま揚げ", build: buildSatsuma, order: 2,
            poses: [[0.6, QI()], [0.4, RX(1.05)]], tilt: 0.45,
            mat: { rough: 0.55, coat: 0.65, coatRough: 0.16, trans: 0, tint: [0.80, 0.55, 0.30], thick: 0.4 }
        },
        atsuage: {
            label: "厚揚げ", build: buildAtsuage, order: 2,
            poses: [[0.6, QI()], [0.4, RX(Math.PI / 2)]], tilt: 0.25,
            mat: { rough: 0.55, coat: 0.65, coatRough: 0.15, trans: 0.05, tint: [0.92, 0.80, 0.55], thick: 0.5 }
        },
        kombu: {
            label: "結び昆布", build: buildKombu, order: 5,
            poses: [[0.5, QI()], [0.5, RX(Math.PI / 2)]], tilt: 0.35,
            mat: { rough: 0.30, coat: 0.95, coatRough: 0.05, trans: 0.55, tint: [0.30, 0.40, 0.12], thick: 0.15 }
        },
        kinchaku: {
            label: "巾着", build: buildKinchaku, order: 3,
            poses: [[1, QI()]], tilt: 0.25,
            mat: { rough: 0.55, coat: 0.70, coatRough: 0.14, trans: 0.10, tint: [0.90, 0.70, 0.40], thick: 0.4 }
        },
        gyusuji: {
            label: "牛すじ", build: buildGyusuji, order: 0, skewer: true,
            poses: [[1, QI()]], tilt: 0,
            mat: { rough: 0.32, coat: 0.85, coatRough: 0.08, trans: 0.35, tint: [0.80, 0.55, 0.35], thick: 0.6 }
        },
        wiener: {
            label: "ウインナー", build: buildWiener, order: 5,
            poses: [[1, QI()]], tilt: 0.25,
            mat: { rough: 0.25, coat: 0.85, coatRough: 0.06, trans: 0.22, tint: [0.85, 0.35, 0.22], thick: 0.4 }
        }
    };

    // =================================================================
    // 4. 鍋
    // =================================================================
    // 見込み（内側）の曲線を1本決め、外側はその等厚オフセット、口縁は半円で
    // つなぐ。高台・底裏を足して一周する閉じた断面を回転させる。
    // 見込みの曲線はそのまま「具を置く床」と「液面の半径」にも使うので、
    // 鍋の形と盛り付け・液面が食い違うことがない
    const POTS = {
        donabe: {
            label: "土鍋",
            // 参考写真2：口径 23cm ほどの浅めの土鍋。灰緑の釉、腰に白い菊の印花
            // 口径 25cm（八寸）。具を 15〜20 個入れても底が見えないくらいの浅鍋
            inner: [[0, 1.50], [3.6, 1.52], [6.2, 1.64], [8.1, 2.05], [9.6, 2.90], [10.8, 4.10], [11.6, 5.55], [12.1, 6.80], [12.3, 7.55]],
            thick: 0.95, footOut: 8.9, footIn: 7.0, base: 0, scale: 1.0,
            glaze: [0.640, 0.665, 0.570]
        },
        iron: {
            label: "鋳物ホーロー鍋",
            // 参考写真1：黒いホーローの丸鍋（内径 20cm）。編んだ鍋敷きの上
            inner: [[0, 0.55], [8.6, 0.55], [11.0, 0.55], [11.0, 9.4]],
            innerFillet: [0, 0, 1.9, 0],
            thick: 0.55, footOut: 10.9, footIn: 9.9, base: 1.05, scale: 1.0,
            glaze: [0.160, 0.160, 0.170]
        }
    };

    function potProfile(spec) {
        let inner = spec.inner.map((p) => p.slice());
        if (spec.innerFillet) inner = fillet(inner, spec.innerFillet, 8);
        else inner = catmullOpen(inner, 8);
        inner = resample(inner, 140);
        const t = spec.thick;
        // 外側：見込みの法線方向（器の肉の側）へ t だけずらす
        const outer = [];
        for (let i = 0; i < inner.length; i++) {
            const a = inner[Math.max(0, i - 1)], b = inner[Math.min(inner.length - 1, i + 1)];
            let dr = b[0] - a[0], dy = b[1] - a[1];
            const l = Math.hypot(dr, dy) || 1; dr /= l; dy /= l;
            outer.push([inner[i][0] + dy * t, inner[i][1] - dr * t]);
        }
        const top = inner[inner.length - 1], otop = outer[outer.length - 1];
        const P = [];      // [r, y, zone]  zone: 0=見込み 1=口縁 2=外側 3=高台・底
        for (const p of inner) P.push([p[0], p[1], 0]);
        // 口縁：見込みの上端と外側の上端を半円でつなぐ
        const cx = (top[0] + otop[0]) / 2, cy = (top[1] + otop[1]) / 2;
        const rr = Math.hypot(otop[0] - top[0], otop[1] - top[1]) / 2;
        const a0 = Math.atan2(top[1] - cy, top[0] - cx);
        for (let k = 1; k < 16; k++) {
            const a = a0 - k / 16 * Math.PI;
            P.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a), 1]);
        }
        // 外側：口縁 → 高台の外径まで
        for (let i = outer.length - 1; i >= 0; i--) {
            if (outer[i][0] < spec.footOut) break;
            P.push([outer[i][0], outer[i][1], 2]);
        }
        const yK = P[P.length - 1][1];
        // 高台
        const fo = spec.footOut, fi = spec.footIn;
        P.push([fo - 0.05, yK * 0.5, 3], [fo - 0.18, 0.06, 3], [fo - 0.35, 0.0, 3], [fi + 0.2, 0.0, 3], [fi, 0.08, 3],
            [fi - 0.1, Math.min(yK, 0.35), 3]);
        for (let k = 1; k <= 8; k++) {
            const u = 1 - k / 8;
            P.push([(fi - 0.1) * u, Math.min(yK, 0.35) + 0.12 * (1 - u * u), 3]);
        }
        // 弧長（テクスチャの v）
        const arc = [0];
        for (let i = 1; i < P.length; i++) arc.push(arc[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
        const L = arc[arc.length - 1];
        return { P, v: arc.map((a) => a / L), inner, L, rimTop: cy + rr, rimR: top[0], outerR: otop[0] };
    }

    // 見込みの高さ（半径 r での）と、高さ y での内半径
    function makePotShape(spec, prof) {
        const inr = prof.inner, n = inr.length, base = spec.base;
        const rMax = inr[n - 1][0];
        return {
            floorY(r) {
                if (r >= rMax - 0.02) return 60;
                for (let i = 1; i < n; i++) {
                    if (inr[i][0] >= r && inr[i][0] > inr[i - 1][0] + 1e-6) {
                        const t = (r - inr[i - 1][0]) / (inr[i][0] - inr[i - 1][0]);
                        return base + mix(inr[i - 1][1], inr[i][1], t);
                    }
                }
                return 60;
            },
            innerR(y) {
                y -= base;
                if (y <= inr[0][1]) return 0;
                for (let i = 1; i < n; i++) {
                    if (inr[i][1] >= y) {
                        const d = inr[i][1] - inr[i - 1][1];
                        return d < 1e-6 ? inr[i][0] : mix(inr[i - 1][0], inr[i][0], (y - inr[i - 1][1]) / d);
                    }
                }
                return rMax;
            },
            rimY: base + inr[n - 1][1], rimTop: base + prof.rimTop, rimR: prof.rimR, outerR: prof.outerR,
            floor0: base + inr[0][1], base
        };
    }

    // ---- 器の絵付け ----------------------------------------------------------
    // u = 周方向、v = 断面の弧長。印花は周長を cm で測って描くので、
    // 高さによって間延びしない
    function paintPot(key, prof, W, H, seed) {
        const can = (typeof OffscreenCanvas !== "undefined") ? new OffscreenCanvas(W, H) : document.createElement("canvas");
        can.width = W; can.height = H;
        const ctx = can.getContext("2d");
        const P = prof.P, V = prof.v;
        const vAtY = (zone, y) => {      // その帯で、高さ y に当たる v
            let best = 0, bd = 1e9;
            for (let i = 0; i < P.length; i++) if (P[i][2] === zone && Math.abs(P[i][1] - y) < bd) { bd = Math.abs(P[i][1] - y); best = V[i]; }
            return best;
        };
        const vRim0 = V[P.findIndex((p) => p[2] === 1)], vOut0 = V[P.findIndex((p) => p[2] === 2)];
        const vFoot = V[P.findIndex((p) => p[2] === 3)];
        const hex = (c) => "rgb(" + Math.round(c[0] * 255) + "," + Math.round(c[1] * 255) + "," + Math.round(c[2] * 255) + ")";
        const rough = new Float32Array(H);
        if (key === "donabe") {
            const GL = [0.660, 0.690, 0.590], BAND = [0.420, 0.410, 0.355], CLAY = [0.430, 0.345, 0.270];
            ctx.fillStyle = hex(GL); ctx.fillRect(0, 0, W, H);
            // 見込みの底は釉が溜まって緑が深い
            const vf = vAtY(0, 2.4);
            const g = ctx.createLinearGradient(0, 0, 0, vf * H);
            g.addColorStop(0, "rgba(96,122,92,0.55)"); g.addColorStop(1, "rgba(96,122,92,0)");
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, vf * H);
            // 口縁は釉が薄く、土の色が透ける
            ctx.fillStyle = "rgba(150,120,90,0.55)";
            ctx.fillRect(0, (vRim0 + 0.004) * H, W, (vOut0 - vRim0 - 0.006) * H);
            // 腰の帯（化粧の地）と菊の印花
            const vB0 = vAtY(2, 4.3), vB1 = vAtY(2, 1.75);
            ctx.fillStyle = hex(BAND); ctx.fillRect(0, vB0 * H, W, (vB1 - vB0) * H);
            ctx.fillStyle = "rgba(235,232,220,0.85)";
            ctx.fillRect(0, (vB0 - 0.0035) * H, W, 0.0025 * H);
            const yMid = 3.0;
            let iMid = 0, bd = 1e9;
            for (let i = 0; i < P.length; i++) if (P[i][2] === 2 && Math.abs(P[i][1] - yMid) < bd) { bd = Math.abs(P[i][1] - yMid); iMid = i; }
            const per = TAU * P[iMid][0], kx = W / per, ky = H / prof.L, vy = V[iMid] * H;
            const n = Math.round(per / 2.55);
            for (let k = 0; k < n; k++) {
                const cxp = (k + 0.5) / n * W;
                ctx.save();
                ctx.translate(cxp, vy); ctx.scale(kx, ky);
                // 菊：16 弁の花弁と芯。印を押して白土を埋めた（三島手）
                ctx.fillStyle = "rgba(238,236,226,0.92)";
                for (let p = 0; p < 16; p++) {
                    const a = p / 16 * TAU;
                    ctx.beginPath();
                    ctx.ellipse(Math.cos(a) * 0.48, Math.sin(a) * 0.48, 0.30, 0.10, a, 0, TAU);
                    ctx.fill();
                }
                ctx.fillStyle = hex(BAND);
                ctx.beginPath(); ctx.arc(0, 0, 0.22, 0, TAU); ctx.fill();
                ctx.fillStyle = "rgba(238,236,226,0.92)";
                ctx.beginPath(); ctx.arc(0, 0, 0.12, 0, TAU); ctx.fill();
                ctx.restore();
            }
            // 高台まわりは無釉の土
            const vC = vAtY(2, 1.55);
            ctx.fillStyle = hex(CLAY); ctx.fillRect(0, vC * H, W, H - vC * H);
            for (let y = 0; y < H; y++) {
                const v = (y + 0.5) / H;
                rough[y] = v < vB0 ? 0.16 : v < vB1 ? 0.30 : v < vC ? 0.40 : 0.85;
            }
        } else {
            const IN = [0.150, 0.150, 0.160], OUT = [0.120, 0.120, 0.130], IRON = [0.330, 0.320, 0.310];
            ctx.fillStyle = hex(IN); ctx.fillRect(0, 0, W, vRim0 * H);
            ctx.fillStyle = hex(IRON); ctx.fillRect(0, vRim0 * H, W, (vOut0 - vRim0) * H + 1);
            ctx.fillStyle = hex(OUT); ctx.fillRect(0, vOut0 * H, W, (vFoot - vOut0) * H);
            ctx.fillStyle = hex(IRON); ctx.fillRect(0, vFoot * H, W, H - vFoot * H);
            for (let y = 0; y < H; y++) {
                const v = (y + 0.5) / H;
                rough[y] = v < vRim0 ? 0.62 : v < vOut0 ? 0.55 : v < vFoot ? 0.16 : 0.70;
            }
        }
        // 釉の斑点（鉄粉・ピンホール）と、ろくろ目のむら。画素ごとに足す
        const img = ctx.getImageData(0, 0, W, H), d = img.data;
        for (let y = 0; y < H; y++) {
            const v = y / H;
            for (let x = 0; x < W; x++) {
                const o = (y * W + x) * 4;
                const h = Noise._h2(x, y, seed);
                let k = 1 + 0.035 * (Noise.fbm2p(x / W * 64, v * 16, 64, 16, seed + 3, 3) - 0.5);
                if (h > 0.9985) k *= 0.55;                     // 鉄粉
                else if (h < 0.0008) k *= 1.25;                // ピンホール
                d[o] = Math.min(255, d[o] * k); d[o + 1] = Math.min(255, d[o + 1] * k); d[o + 2] = Math.min(255, d[o + 2] * k);
            }
        }
        ctx.putImageData(img, 0, 0);
        return { canvas: can, rough };
    }

    function buildPot(scene, key, seed) {
        const spec = POTS[key];
        const prof = potProfile(spec);
        const shape = makePotShape(spec, prof);
        const P = prof.P, NA = 256, row = NA + 1;
        const pos = [], uv = [], idx = [];
        for (let i = 0; i < P.length; i++) {
            for (let j = 0; j <= NA; j++) {
                const th = (j % NA) / NA * TAU;
                // 手仕事の歪み（口縁だけ上下にも振る）。鋳物は機械仕上げなので無し
                const wob = key === "donabe" ? 1 + 0.003 * Math.sin(3 * th + 1) + 0.002 * Math.sin(5 * th + 2) : 1;
                const dy = key === "donabe" ? smooth(5.5, 7.5, P[i][1]) * 0.05 * Math.sin(2 * th + 0.7) : 0;
                pos.push(P[i][0] * wob * Math.cos(th), P[i][1] + dy + spec.base, P[i][0] * wob * Math.sin(th));
                uv.push(j / NA, prof.v[i]);
            }
        }
        for (let i = 0; i < P.length - 1; i++) for (let j = 0; j < NA; j++) {
            const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
            idx.push(a, c, b, b, c, d);
        }
        // 巻き順：見込みの中ほどの法線が上を向くこと
        let N = new Float32Array(pos.length);
        BABYLON.VertexData.ComputeNormals(pos, idx, N);
        if (N[(10 * row) * 3 + 1] < 0) {
            for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
            N = new Float32Array(pos.length);
            BABYLON.VertexData.ComputeNormals(pos, idx, N);
        }
        weldNormals(pos, N);
        const mesh = named(new BABYLON.Mesh("pot", scene), "pot");
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = idx; vd.normals = N; vd.uvs = uv;
        vd.applyToMesh(mesh, false);
        mesh.receiveShadows = true;

        const W = GLOBAL.potTexW, H = GLOBAL.potTexH;
        const painted = paintPot(key, prof, W, H, seed);
        const tex = named(new BABYLON.DynamicTexture("potTex", { width: W, height: H }, scene, true), "potTex");
        tex.getContext().drawImage(painted.canvas, 0, 0);
        tex.update(false);
        tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE; tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        tex.anisotropicFilteringLevel = 8;
        const orm = makeTex(scene, "potORM", 4, H, (d) => {
            for (let y = 0; y < H; y++) for (let x = 0; x < 4; x++) {
                const o = (y * 4 + x) * 4;
                d[o] = 255; d[o + 1] = painted.rough[y] * 255; d[o + 2] = 0; d[o + 3] = 255;
            }
        }, true);
        const m = named(new BABYLON.PBRMaterial("potMat", scene), "potMat");
        m.albedoTexture = tex;
        m.metallic = 0; m.roughness = 1;
        m.metallicTexture = orm;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = key === "donabe" ? 0.55 : 0.75;
        m.clearCoat.roughness = key === "donabe" ? 0.10 : 0.08;
        mesh.material = m;

        const extras = [];
        if (key === "donabe") {
            // 取っ手（耳）：口縁の下に左右ひとつずつ
            for (const sg of [-1, 1]) {
                const g = new Geo();
                const e = [1.05, 0.55, 1.85];
                radialSolid(g, 20, e, (d) => {
                    const pl = [{ n: [1, 0, 0], d: e[0] }, { n: [-1, 0, 0], d: e[0] }, { n: [0, 1, 0], d: e[1] }, { n: [0, -1, 0], d: e[1] },
                        { n: [0, 0, 1], d: e[2] }, { n: [0, 0, -1], d: e[2] }];
                    return { r: polyRadius(d, pl, 0.30), c: spec.glaze };
                });
                g.transform(BABYLON.Matrix.Translation(sg * (prof.outerR + 0.55), spec.base + 6.75, 0));
                extras.push(g);
            }
        } else {
            // 輪の取っ手（水平）。端は鍋の壁に埋める
            for (const sg of [-1, 1]) {
                const g = new Geo(), Rm = 1.55, rt = 0.40, cxp = sg * (prof.outerR - 0.15);
                gridSurface(g, 40, 16, (u, v) => {
                    const a = -Math.PI * 0.62 + u * Math.PI * 1.24, ph = v * TAU;
                    const cx2 = cxp + sg * Math.cos(a) * Rm * 1.05, cz2 = Math.sin(a) * Rm;
                    const nx = sg * Math.cos(a), nz = Math.sin(a);
                    return { p: [cx2 + nx * rt * Math.cos(ph), spec.base + 8.55 + rt * Math.sin(ph) * 1.15, cz2 + nz * rt * Math.cos(ph)], c: spec.glaze };
                });
                extras.push(g);
            }
            // 鍋敷き：稲わらを渦巻きに編んだ円座
            const g = new Geo(), Rt = 13.6, Ht = 1.0;
            let tp = [[0, 0], [Rt - 0.5, 0], [Rt, Ht * 0.5], [Rt - 0.5, Ht], [0, Ht]];
            tp = resample(fillet(tp, [0, 0.3, 0.3, 0.3, 0], 5), 120);
            const STRAW = [0.780, 0.640, 0.400], STRAW_D = [0.560, 0.430, 0.240];
            revolve(g, tp, 480, (i, th, pt) => {
                const r0 = pt[0];
                const turn = r0 / 0.62 + th / TAU;
                const coil = Math.abs(Math.sin(Math.PI * turn));
                const top = pt[1] > Ht * 0.5 ? 1 : 0;
                const twist = Math.sin(th * r0 * 2.2 + turn * 4.0);
                const y = pt[1] + top * (0.14 * Math.sqrt(coil) - 0.07 + 0.02 * twist) * smooth(0.5, 1.5, r0);
                const f = Noise.v2(th * r0 * 6, r0 * 3, seed + 3);
                let c = mix3(STRAW_D, STRAW, 0.35 + 0.65 * Math.sqrt(coil));
                c = mix3(c, STRAW_D, smooth(0.6, 0.9, f) * 0.4);
                c = mix3(c, [0.88, 0.76, 0.52], smooth(0.4, 1, twist) * 0.15);
                return { r: r0, y, c };
            });
            extras.push(g);
        }
        const extraMeshes = [];
        extras.forEach((g, k) => {
            const b = bake(g);
            const em = named(new BABYLON.Mesh(k < 2 ? "potHandle" : "trivet", scene), k < 2 ? "potHandle" : "trivet");
            const vd2 = new BABYLON.VertexData();
            const cols = new Float32Array(b.nV * 4);
            for (let i = 0; i < b.nV; i++) {
                cols[i * 4] = s2l(b.C[i * 3]); cols[i * 4 + 1] = s2l(b.C[i * 3 + 1]); cols[i * 4 + 2] = s2l(b.C[i * 3 + 2]); cols[i * 4 + 3] = 1;
            }
            vd2.positions = b.P; vd2.indices = b.I; vd2.normals = b.N; vd2.colors = cols;
            vd2.applyToMesh(em, false);
            em.hasVertexAlpha = false;
            const mm = named(new BABYLON.PBRMaterial("potExtraMat", scene), "potExtraMat");
            mm.metallic = 0;
            if (k < 2) {
                mm.roughness = key === "donabe" ? 0.18 : 0.16;
                mm.clearCoat.isEnabled = true; mm.clearCoat.intensity = 0.6; mm.clearCoat.roughness = 0.1;
            } else {
                mm.roughness = 0.85;
            }
            em.material = mm;
            em.receiveShadows = true;
            extraMeshes.push(em);
        });
        return {
            key, spec, prof, shape, mesh, extras: extraMeshes, tex, orm, mat: m,
            dispose() {
                mesh.dispose(); m.dispose(); tex.dispose(); orm.dispose();
                for (const e of extraMeshes) { if (e.material) e.material.dispose(); e.dispose(); }
            }
        };
    }

    function makeTex(scene, base, W, H, fill, linear) {
        W = Math.max(4, Math.round(W) || 512); H = Math.max(4, Math.round(H) || 512);
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
        // 【対策】ORM と法線は「色」ではない。gammaSpace のままだと粗さが狙いよりつやつやになる
        if (linear) dt.gammaSpace = false;
        dt.anisotropicFilteringLevel = 8;
        return dt;
    }

    // =================================================================
    // 5. 詰める：上から見た高さ場
    // =================================================================
    // 【対策】餃子では Havok で落としたが、おでんは鍋いっぱいに具を詰める
    //         料理で、20 個以上の凸包が互いに押し合うと震えが止まらない。
    //         しかも具の大半は出汁の下に沈むので、物理の細かな正しさより
    //         「どの具も浮かず、めり込まず、詰まって見える」ほうが効く。
    //         そこで、上から見た最上点の高さ場を1枚持ち、具を1個ずつ
    //         「いちばん低く収まる姿勢と場所」へ置く。重心が低い所を
    //         選ぶのは、物理で落として転がしたときの結果と同じ向きになる
    function raster(P, I, half, cell, n, cb, filter) {
        const g = (v) => (v + half) / cell - 0.5;
        for (let t = 0; t < I.length; t += 3) {
            const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2];
            if (filter && !filter(i0, i1, i2)) continue;
            const ax = g(P[i0 * 3]), az = g(P[i0 * 3 + 2]), bx = g(P[i1 * 3]), bz = g(P[i1 * 3 + 2]), cx = g(P[i2 * 3]), cz = g(P[i2 * 3 + 2]);
            const ay = P[i0 * 3 + 1], by = P[i1 * 3 + 1], cy = P[i2 * 3 + 1];
            const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
            const x0 = Math.max(0, Math.ceil(Math.min(ax, bx, cx))), x1 = Math.min(n - 1, Math.floor(Math.max(ax, bx, cx)));
            const z0 = Math.max(0, Math.ceil(Math.min(az, bz, cz))), z1 = Math.min(n - 1, Math.floor(Math.max(az, bz, cz)));
            if (Math.abs(den) < 1e-9) {
                // 真横から見た三角形：頂点だけ打っておく（薄い物の縁が抜けないように）
                for (const [px, pz, py, ii] of [[ax, az, ay, i0], [bx, bz, by, i1], [cx, cz, cy, i2]]) {
                    const ix = Math.round(px), iz = Math.round(pz);
                    if (ix >= 0 && iz >= 0 && ix < n && iz < n) cb(iz * n + ix, py, 1, 0, 0, ii, ii, ii);
                }
                continue;
            }
            for (let z = z0; z <= z1; z++) {
                for (let x = x0; x <= x1; x++) {
                    const l0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den;
                    if (l0 < -1e-4) continue;
                    const l1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den;
                    if (l1 < -1e-4) continue;
                    const l2 = 1 - l0 - l1;
                    if (l2 < -1e-4) continue;
                    cb(z * n + x, l0 * ay + l1 * by + l2 * cy, l0, l1, l2, i0, i1, i2);
                }
            }
        }
    }

    class Field {
        constructor(half, cell, floorFn) {
            this.half = half; this.cell = cell;
            this.n = Math.ceil(2 * half / cell);
            const n = this.n;
            this.floor = new Float32Array(n * n);
            this.top = new Float32Array(n * n);
            for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
                const k = z * n + x;
                this.floor[k] = floorFn(Math.hypot(this.wx(x), this.wx(z)));
                this.top[k] = this.floor[k];
            }
        }
        wx(i) { return (i + 0.5) * this.cell - this.half; }
        ci(x) { return Math.round((x + this.half) / this.cell - 0.5); }
        deposit(P, I) {
            const top = this.top;
            raster(P, I, this.half, this.cell, this.n, (k, y) => { if (y > top[k]) top[k] = y; });
        }
        topAt(x, z) {
            const i = this.ci(x), j = this.ci(z), n = this.n;
            if (i < 0 || j < 0 || i >= n || j >= n) return -1e9;
            return this.top[j * n + i];
        }
        // 隙間らしさ：まわりに自分より高い物がどれだけあるか（膜が溜まる）
        pocket(x, y, z) {
            const R = [0.30, 0.65, 1.10];
            let acc = 0, ws = 0;
            for (let ri = 0; ri < R.length; ri++) {
                const w = 1 / (1 + ri * 1.2);
                let hit = 0;
                for (let d = 0; d < 10; d++) {
                    const a = (d + 0.5) / 10 * TAU + ri * 0.37;
                    const ty = this.topAt(x + Math.cos(a) * R[ri], z + Math.sin(a) * R[ri]);
                    if (ty > -1e8 && ty < 50) hit += smooth(0, 0.18, ty - y);
                }
                acc += hit / 10 * w; ws += w;
            }
            return acc / ws;
        }
    }

    // 粗い形を姿勢 M で回し、原点セル基準の「底の高さ」の疎な表にする
    function bottomMap(geoB, M, cell, skip) {
        const P = new Float32Array(geoB.P.length), v = new V3();
        for (let i = 0; i < P.length; i += 3) {
            v.set(geoB.P[i], geoB.P[i + 1], geoB.P[i + 2]);
            V3.TransformCoordinatesToRef(v, M, v);
            P[i] = v.x; P[i + 1] = v.y; P[i + 2] = v.z;
        }
        let r = 0;
        for (let i = 0; i < P.length; i += 3) if (!skip || !skip[i / 3]) r = Math.max(r, Math.abs(P[i]), Math.abs(P[i + 2]));
        const half = Math.ceil(r / cell + 2) * cell, n = Math.round(2 * half / cell);
        const lo = new Float32Array(n * n).fill(1e9);
        raster(P, geoB.I, half, cell, n, (k, y) => { if (y < lo[k]) lo[k] = y; },
            skip ? (a, b, c) => !(skip[a] || skip[b] || skip[c]) : null);
        const di = [], dj = [], ly = [];
        const c0 = Math.round(half / cell - 0.5);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
            const k = j * n + i;
            if (lo[k] < 1e8) { di.push(i - c0); dj.push(j - c0); ly.push(lo[k]); }
        }
        // 壁の判定と重心に使う点（間引いた頂点）
        const pts = [];
        const step = Math.max(1, Math.floor(P.length / 3 / 500));
        let cy = 0, cnt = 0, ty = -1e9;
        for (let i = 0; i < P.length / 3; i += step) {
            if (skip && skip[i]) continue;
            pts.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
            cy += P[i * 3 + 1]; cnt++;
            if (P[i * 3 + 1] > ty) ty = P[i * 3 + 1];
        }
        // 串の持ち手の端（ローカル x = 11）
        const he = V3.TransformCoordinates(new V3(11, 0, 0), M);
        return { di: new Int16Array(di), dj: new Int16Array(dj), ly: new Float32Array(ly), pts, cy: cy / Math.max(1, cnt), ty, rXZ: r, P, hx: he.x, hy: he.y, hz: he.z };
    }

    // 置ける最小の持ち上げ量。範囲外を踏んだら置けない
    function probe(field, bm, ci, cj) {
        const n = field.n, top = field.top;
        let need = -1e9;
        for (let k = 0; k < bm.ly.length; k++) {
            const i = ci + bm.di[k], j = cj + bm.dj[k];
            if (i < 0 || j < 0 || i >= n || j >= n) return null;
            const d = top[j * n + i] - bm.ly[k];
            if (d > need) need = d;
        }
        return need;
    }

    // 鍋の内側に収まっているか。見込みは半径の関数 y = floorY(r) なので、
    // 「その半径での見込みより上にあるか」を見れば底も壁も一度に判定できる。
    // 【対策】高さ y での内半径 innerR(y) と比べると、置いたあと沈めた分だけ
    //         見込みの底より下になった点で内半径が 0 になり、底に置ける候補が
    //         全部はじかれて、具が壁の斜面に引っかかって宙に浮いた
    function wallOK(pot, pts, ox, oy, oz) {
        const S = pot.shape, m = GLOBAL.wallMargin;
        for (let i = 0; i < pts.length; i += 3) {
            const x = pts[i] + ox, y = pts[i + 1] + oy, z = pts[i + 2] + oz;
            const r = Math.hypot(x, z);
            if (r > S.rimR - m) return false;
            // 斜面ではセル幅ぶん低く見えるので、許容は少し広めに取る
            if (y < S.floorY(r) - GLOBAL.settle - 0.16) return false;
        }
        return true;
    }

    function segDist(px, py, pz, a, b) {
        const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2];
        const t = clamp(((px - a[0]) * vx + (py - a[1]) * vy + (pz - a[2]) * vz) / (vx * vx + vy * vy + vz * vz), 0, 1);
        return Math.hypot(px - a[0] - vx * t, py - a[1] - vy * t, pz - a[2] - vz * t);
    }

    function pickPose(kind, rng) {
        const K = KINDS[kind];
        let s = rng.next() * K.poses.reduce((a, p) => a + p[0], 0), base = K.poses[0][1];
        for (const p of K.poses) { s -= p[0]; if (s <= 0) { base = p[1]; break; } }
        const yaw = BABYLON.Quaternion.RotationAxis(new V3(0, 1, 0), rng.range(0, TAU));
        const ta = rng.range(0, TAU);
        const tilt = BABYLON.Quaternion.RotationAxis(new V3(Math.cos(ta), 0, Math.sin(ta)), Math.abs(rng.gauss(0, K.tilt)));
        return tilt.multiply(yaw).multiply(base);
    }
    const qMat = (q) => { const m = BABYLON.Matrix.Identity(); BABYLON.Matrix.FromQuaternionToRef(q, m); return m; };

    // 具を全部置く。返すのは [{ kind, M（姿勢＋位置）, seed }]
    function plan(pot, setKey, seed) {
        const S = pot.shape, rng = new Rng(seed ^ 0x0DE7);
        const half = S.rimR + 1.2, cell = GLOBAL.cell;
        const field = new Field(half, cell, (r) => S.floorY(r));
        const list = [];
        const items = SETS[setKey].items;
        for (const k of Object.keys(items)) for (let i = 0; i < items[k]; i++) list.push({ kind: k, key: KINDS[k].order + rng.range(0, 1.6) });
        list.sort((a, b) => a.key - b.key);
        const skewers = [];
        const out = [];
        list.forEach((it, idx) => {
            const K = KINDS[it.kind], sd = (seed + idx * 7919 + 13) >>> 0;
            const coarse = K.build(sd, 0.22);
            // 串の持ち手側（肉より外）は床に置かないので、底の計算から外す
            const skip = K.skewer ? Uint8Array.from(coarse.T, (t, i) => (t === 1 && coarse.P[i * 3] > 0) ? 1 : 0) : null;
            let best = null;
            const rej = { probe: 0, wall: 0, skew: 0, rim: 0, ok: 0 };
            const tryPose = (q, ci, cj, bm) => {
                const need = probe(field, bm, ci, cj);
                if (need === null) { rej.probe++; return; }
                const ox = field.wx(ci), oz = field.wx(cj), oy = need - GLOBAL.settle;
                if (!wallOK(pot, bm.pts, ox, oy, oz)) { rej.wall++; return; }
                // 串の通り道には置かない
                for (const sk of skewers) {
                    for (let i = 0; i < bm.pts.length; i += 3) {
                        if (segDist(bm.pts[i] + ox, bm.pts[i + 1] + oy, bm.pts[i + 2] + oz, sk[0], sk[1]) < 0.45) { rej.skew++; return; }
                    }
                }
                // 重心が低いほど良い。口縁より上へはみ出す置き方は嫌う
                let score = oy + bm.cy + 0.6 * Math.max(0, oy + bm.ty - (S.rimY + 0.3));
                if (K.skewer) {
                    // 串は口縁の上を越えること。越えない姿勢は捨てる
                    let ok = true;
                    for (let i = 0; i < bm.P.length; i += 3) {
                        if (!skip[i / 3]) continue;
                        const x = bm.P[i] + ox, y = bm.P[i + 1] + oy, z = bm.P[i + 2] + oz, r = Math.hypot(x, z);
                        if (r > S.rimR - 0.5 && r < S.outerR + 0.8 && y < S.rimTop + 0.30) { ok = false; break; }
                    }
                    // 持ち手の端は必ず口縁の外・上にあること（内側へ倒れた串を除く）
                    const ex = bm.hx + ox, ey = bm.hy + oy, ez = bm.hz + oz;
                    if (Math.hypot(ex, ez) < S.rimR + 0.8 || ey < S.rimTop + 0.5) ok = false;
                    if (!ok) { rej.rim++; return; }
                }
                rej.ok++;
                if (!best || score < best.score) best = { score, q, ox, oy, oz };
            };
            if (K.skewer) {
                // 串は外へ向けて斜めに立てる。肉は鍋の縁寄り
                for (let t = 0; t < 40; t++) {
                    const phi = rng.range(0, TAU), e = rng.range(0.50, 0.95);
                    const q = BABYLON.Quaternion.RotationAxis(new V3(0, 1, 0), -phi)
                        .multiply(BABYLON.Quaternion.RotationAxis(new V3(0, 0, 1), e));
                    const bm = bottomMap(coarse, qMat(q), cell, skip);
                    const rc = rng.range(0.30, 0.62) * S.rimR;
                    tryPose(q, field.ci(Math.cos(phi) * rc), field.ci(Math.sin(phi) * rc), bm);
                }
            } else {
                // (a) 置き場所を先に決め、その下の面（鍋の斜面や、先に置いた具の
                //     背中）の傾きに沿わせた姿勢で試す。
                // 【対策】姿勢を場所と無関係に決めると、平らな姿勢の具が鍋の斜面で
                //         外側の縁だけで接して浮き、重心が高くなるので選ばれない。
                //         結果、具が真ん中に積み上がって、鍋の周りががら空きになった
                const Rm = S.rimR - 1.0;
                const up = new V3(0, 1, 0), nrm = new V3(), qa = new BABYLON.Quaternion();
                for (let c = 0; c < GLOBAL.candidates; c++) {
                    const a = rng.range(0, TAU), rr = Rm * Math.sqrt(rng.next());
                    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = 1.2;
                    const gx = (field.topAt(x + h, z) - field.topAt(x - h, z)) / (2 * h);
                    const gz = (field.topAt(x, z + h) - field.topAt(x, z - h)) / (2 * h);
                    const f = rng.range(0.55, 1.0);
                    nrm.set(-gx * f, 1, -gz * f);
                    if (!isFinite(nrm.x + nrm.z) || Math.abs(gx) > 3 || Math.abs(gz) > 3) continue;
                    nrm.normalize();
                    BABYLON.Quaternion.FromUnitVectorsToRef(up, nrm, qa);
                    const q = qa.multiply(pickPose(it.kind, rng));
                    const bm = bottomMap(coarse, qMat(q), cell, null);
                    for (let j = 0; j < 3; j++) {
                        const jx = j ? rng.range(-0.6, 0.6) : 0, jz = j ? rng.range(-0.6, 0.6) : 0;
                        tryPose(q, field.ci(x + jx), field.ci(z + jz), bm);
                    }
                }
            }
            if (!best) {
                // どこにも入らない（鍋が満杯）。この具は諦める
                console.warn("[Oden] 入りきらない具:", it.kind, JSON.stringify(rej));
                return;
            }
            const M = qMat(best.q).multiply(BABYLON.Matrix.Translation(best.ox, best.oy, best.oz));
            const placed = { kind: it.kind, seed: sd, M };
            // 粗い形で高さ場へ焼く（次の具はこの上に乗る）
            const g2 = K.build(sd, 0.40);
            g2.transform(M);
            const P = new Float32Array(g2.P), I = new Uint32Array(g2.I);
            field.deposit(P, I);
            if (K.skewer) {
                const a = V3.TransformCoordinates(new V3(-1.5, 0, 0), M), b = V3.TransformCoordinates(new V3(11, 0, 0), M);
                skewers.push([[a.x, a.y, a.z], [b.x, b.y, b.z]]);
            }
            out.push(placed);
        });
        return { field, placed: out };
    }

    // =================================================================
    // 6. 出汁
    // =================================================================
    // 具の色は2段で決める。
    //   (1) 染み：具の表層が出汁を吸った分。c = c_raw · exp(−σ · d_soak)
    //       d_soak は具ごと・場所ごとの「吸った深さ」（頂点の S × 1.5cm）
    //   (2) 膜：出汁から頭を出した面に残る薄い出汁。c ← c · exp(−σ · 2t)
    //       t は 液面からの高さ・面の向き・隙間らしさ の積
    // どちらも同じ σ を使うので、関東風／関西風を切り替えると、液面の色と
    // 具の染みと濡れ方が一緒に変わる
    function bakePiece(pc, field, dashi, brothY) {
        const n = pc.nV, P = pc.P, N = pc.N, C = pc.C, W = pc.W, S = pc.S;
        const sg = dashi.sigma, k = dashi.soakK * 1.5;
        const H0 = s2l(dashi.haze[0]), H1 = s2l(dashi.haze[1]), H2 = s2l(dashi.haze[2]);
        const col = pc.col || (pc.col = new Float32Array(n * 4));
        const und = pc.und || (pc.und = new Float32Array(n * 3));
        for (let i = 0; i < n; i++) {
            const d = S[i] * k;
            let r = s2l(C[i * 3]) * Math.exp(-sg[0] * d);
            let g = s2l(C[i * 3 + 1]) * Math.exp(-sg[1] * d);
            let b = s2l(C[i * 3 + 2]) * Math.exp(-sg[2] * d);
            und[i * 3] = r; und[i * 3 + 1] = g; und[i * 3 + 2] = b;
            const y = P[i * 3 + 1], h = y - brothY;
            if (h > -0.02) {
                const dr = Math.exp(-Math.max(0, h) / dashi.drain);
                const grav = 0.45 + 0.55 * (N[i * 3 + 1] * 0.5 + 0.5);
                const pk = field.pocket(P[i * 3], y, P[i * 3 + 2]);
                // 水際の 2〜3mm は出汁が這い上がって特に濃い
                const men = Math.exp(-Math.max(0, h) / 0.25) * 0.05;
                const t = clamp(W[i] * (dashi.film * dr * grav + dashi.pool * pk * (0.4 + 0.6 * dr)) + men, 0, 0.6);
                const tr = Math.exp(-sg[0] * 2 * t), tg = Math.exp(-sg[1] * 2 * t), tb = Math.exp(-sg[2] * 2 * t);
                r *= tr; g *= tg; b *= tb;
                const hz = (1 - tg) * dashi.hazeK * 0.5;
                r += (H0 - r) * hz; g += (H1 - g) * hz; b += (H2 - b) * hz;
            }
            col[i * 4] = r; col[i * 4 + 1] = g; col[i * 4 + 2] = b; col[i * 4 + 3] = 1;
        }
        return col;
    }

    // ---- 液面に焼く「下にある物」 ---------------------------------------
    // 上から見て、液面より下にあるいちばん高い面の高さと色。無ければ鍋の見込み
    function brothFields(pot, pieces, brothY, half, N, seed) {
        const S = pot.shape, n2 = N * N, cell = 2 * half / N;
        const F = {
            N, half,
            underY: new Float32Array(n2).fill(-1e9), topY: new Float32Array(n2).fill(-1e9),
            r: new Float32Array(n2), g: new Float32Array(n2), b: new Float32Array(n2),
            near: new Float32Array(n2), wall: new Float32Array(n2), mottle: new Float32Array(n2), ripple: new Float32Array(n2)
        };
        // 【対策】沈んだ具の色をそのまま焼くと、液面に貼ったシールのように平たい。
        //         液中でも上から光は来るので、面の向き（上を向くほど明るい）で陰を付ける
        for (const pc of pieces) {
            const U = pc.und, NN = pc.N;
            raster(pc.P, pc.I, half, cell, N, (k, y, l0, l1, l2, i0, i1, i2) => {
                if (y > F.topY[k]) F.topY[k] = y;
                if (y <= brothY && y > F.underY[k]) {
                    F.underY[k] = y;
                    const ny = l0 * NN[i0 * 3 + 1] + l1 * NN[i1 * 3 + 1] + l2 * NN[i2 * 3 + 1];
                    const sh = 0.45 + 0.55 * clamp(ny, 0, 1);
                    F.r[k] = (l0 * U[i0 * 3] + l1 * U[i1 * 3] + l2 * U[i2 * 3]) * sh;
                    F.g[k] = (l0 * U[i0 * 3 + 1] + l1 * U[i1 * 3 + 1] + l2 * U[i2 * 3 + 1]) * sh;
                    F.b[k] = (l0 * U[i0 * 3 + 2] + l1 * U[i1 * 3 + 2] + l2 * U[i2 * 3 + 2]) * sh;
                }
            });
        }
        const GL = pot.spec.glaze.map(s2l);
        const brothR = S.innerR(brothY);
        // 液面より上に出ている物までの距離（接触の暗がりと水際の照り）
        const D = new Float32Array(n2).fill(1e9);
        for (let k = 0; k < n2; k++) if (F.topY[k] > brothY) D[k] = 0;
        for (let pass = 0; pass < 2; pass++) {
            const fw = pass === 0;
            for (let zz = 0; zz < N; zz++) {
                const z = fw ? zz : N - 1 - zz;
                for (let xx = 0; xx < N; xx++) {
                    const x = fw ? xx : N - 1 - xx, k = z * N + x;
                    let v = D[k];
                    const sx = fw ? -1 : 1;
                    if (x + sx >= 0 && x + sx < N) v = Math.min(v, D[k + sx] + 1);
                    if (z + sx >= 0 && z + sx < N) v = Math.min(v, D[k + sx * N] + 1);
                    if (x + sx >= 0 && x + sx < N && z + sx >= 0 && z + sx < N) v = Math.min(v, D[k + sx * N + sx] + 1.4142);
                    if (x - sx >= 0 && x - sx < N && z + sx >= 0 && z + sx < N) v = Math.min(v, D[k + sx * N - sx] + 1.4142);
                    D[k] = v;
                }
            }
        }
        for (let pz = 0; pz < N; pz++) {
            const z = (pz + 0.5) * cell - half;
            for (let px = 0; px < N; px++) {
                const x = (px + 0.5) * cell - half, k = pz * N + px, rr = Math.hypot(x, z);
                F.near[k] = Math.min(D[k], 1e6) * cell;
                const fy = S.floorY(Math.min(rr, S.rimR - 0.03));
                if (F.underY[k] < fy) {
                    // 下に具が無い：鍋の見込み。壁ぎわは鍋自身の影で暗い
                    F.underY[k] = fy;
                    const sh = 1 - 0.35 * smooth(brothR - 2.0, brothR, rr);
                    F.r[k] = GL[0] * sh; F.g[k] = GL[1] * sh; F.b[k] = GL[2] * sh;
                }
                F.wall[k] = smooth(brothR - 1.2, brothR - 0.02, rr);
                const m1 = Noise.fbm2(x * 0.55 + 3, z * 0.55 + 7, seed + 11, 3) - 0.5;
                const m2 = Noise.fbm2(x * 2.2 + 13, z * 2.2 + 2, seed + 29, 2) - 0.5;
                F.mottle[k] = clamp(0.5 + m1 * 1.0 + m2 * 0.45, 0, 1);
                F.ripple[k] = Noise.fbm2p(px / N * 10, pz / N * 10, 10, 10, seed + 97, 3) - 0.5;
            }
        }
        // 【対策】液中の具をそのまま焼くと、輪郭がくっきりした「液面に貼った
        //         シール」になる。実際は液面のゆらぎと濁りで、深いほどぼやける。
        //         ぼかした版を作り、深さに応じて混ぜる
        {
            const tmp = new Float32Array(n2), R = 4;
            for (const ch of ["r", "g", "b"]) {
                const src = F[ch], dst = new Float32Array(n2);
                for (let z = 0; z < N; z++) {
                    let acc = 0;
                    for (let x = -R; x <= R; x++) acc += src[z * N + clamp(x, 0, N - 1)];
                    for (let x = 0; x < N; x++) {
                        tmp[z * N + x] = acc / (2 * R + 1);
                        acc += src[z * N + Math.min(N - 1, x + R + 1)] - src[z * N + Math.max(0, x - R)];
                    }
                }
                for (let x = 0; x < N; x++) {
                    let acc = 0;
                    for (let z = -R; z <= R; z++) acc += tmp[clamp(z, 0, N - 1) * N + x];
                    for (let z = 0; z < N; z++) {
                        dst[z * N + x] = acc / (2 * R + 1);
                        acc += tmp[Math.min(N - 1, z + R + 1) * N + x] - tmp[Math.max(0, z - R) * N + x];
                    }
                }
                for (let k = 0; k < n2; k++) {
                    const w = 0.35 + 0.65 * smooth(0.2, 2.5, brothY - F.underY[k]);
                    src[k] = mix(src[k], dst[k], w);
                }
            }
        }
        F.brothR = brothR;
        return F;
    }

    function brothAlbedo(d, F, dashi, brothY) {
        const sg = dashi.sigma, n2 = F.N * F.N;
        const H0 = s2l(dashi.haze[0]), H1 = s2l(dashi.haze[1]), H2 = s2l(dashi.haze[2]);
        for (let k = 0; k < n2; k++) {
            const dep = clamp(brothY - F.underY[k], 0, 12);
            // ★ Beer–Lambert：下の色が出汁を往復して戻ってくる
            const tr = Math.exp(-sg[0] * 2 * dep), tg = Math.exp(-sg[1] * 2 * dep), tb = Math.exp(-sg[2] * 2 * dep);
            // 液中の物は、液面で一度屈折した拡散光しか受けないぶん暗い
            let r = F.r[k] * tr * 0.86, g = F.g[k] * tg * 0.86, b = F.b[k] * tb * 0.86;
            // 濁り（でんぷん・練り物の油・削り節の細かい粉）。深いほど乗る
            // 浅い所でも少しは濁る（液面直下の具がくっきり見えすぎない）
            const hz = Math.min(1, (1 - tg + 0.12) * dashi.hazeK * (0.75 + 0.5 * F.mottle[k]));
            r += (H0 - r) * hz; g += (H1 - g) * hz; b += (H2 - b) * hz;
            // 頭を出した具のきわ：すぐ内側は接触の影、少し外は液面が持ち上がって明るい
            const nd = F.near[k];
            const sh = 1 - smooth(0, 0.25, nd);
            r *= 1 - 0.45 * sh; g *= 1 - 0.47 * sh; b *= 1 - 0.50 * sh;
            const rim = smooth(0.0, 0.05, nd) * (1 - smooth(0.05, 0.18, nd)) * 0.6;
            r *= 1 + 0.30 * rim; g *= 1 + 0.26 * rim; b *= 1 + 0.20 * rim;
            const wl = F.wall[k] * 0.45;
            r *= 1 - 0.30 * wl; g *= 1 - 0.32 * wl; b *= 1 - 0.36 * wl;
            const o = k * 4;
            d[o] = clamp(l2s(r), 0, 1) * 255; d[o + 1] = clamp(l2s(g), 0, 1) * 255; d[o + 2] = clamp(l2s(b), 0, 1) * 255; d[o + 3] = 255;
        }
    }

    function buildBroth(scene, pot, F, dashi, brothY) {
        const S = pot.shape, N = F.N, n2 = N * N, half = F.half;
        const albedo = makeTex(scene, "brothA", N, N, (d) => brothAlbedo(d, F, dashi, brothY));
        const coat = makeTex(scene, "brothC", N, N, (d) => {
            for (let k = 0; k < n2; k++) {
                let ro = dashi.rough + 0.05 * F.wall[k] + (1 - smooth(0, 0.14, F.near[k])) * 0.10;
                const o = k * 4;
                d[o] = 255; d[o + 1] = clamp(ro, 0.02, 0.9) * 255; d[o + 2] = 0; d[o + 3] = 255;
            }
        }, true);
        const orm = makeTex(scene, "brothO", N, N, (d) => {
            for (let k = 0; k < n2; k++) {
                const ao = clamp(1 - 0.40 * F.wall[k] - 0.45 * (1 - smooth(0, 0.25, F.near[k])), 0.25, 1);
                const o = k * 4;
                d[o] = ao * 255; d[o + 1] = 0.6 * 255; d[o + 2] = 0; d[o + 3] = 255;
            }
        }, true);
        // さざ波の法線（タイリングさせて流す）
        const ripple = makeTex(scene, "brothN", N, N, (d) => {
            const R = F.ripple;
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const xl = R[y * N + (x - 1 + N) % N], xr = R[y * N + (x + 1) % N];
                const yu = R[((y - 1 + N) % N) * N + x], yd = R[((y + 1) % N) * N + x];
                let nx = (xl - xr) * 3.0, ny = (yd - yu) * 3.0, nz = 1;
                const l = Math.hypot(nx, ny, nz);
                const o = (y * N + x) * 4;
                d[o] = (nx / l * 0.5 + 0.5) * 255; d[o + 1] = (ny / l * 0.5 + 0.5) * 255; d[o + 2] = (nz / l * 0.5 + 0.5) * 255; d[o + 3] = 255;
            }
        }, true);
        ripple.wrapU = ripple.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        ripple.uScale = ripple.vScale = 2.0;

        const m = named(new BABYLON.PBRMaterial("brothMat", scene), "brothMat");
        m.albedoTexture = albedo;
        m.metallic = 0; m.roughness = 1;
        m.metallicTexture = orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        // 【対策】液面を1枚の滑らかな PBR にすると濡れたプラスチックの板になる。
        //         下地は拡散だけにして、照りは全部 clearCoat（＝水面, IOR 1.34）へ
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        m.clearCoat.intensity = 1.0;
        m.clearCoat.roughness = 1.0;
        m.clearCoat.indexOfRefraction = 1.34;
        m.clearCoat.bumpTexture = ripple;
        m.clearCoat.bumpTexture.level = 0.45;

        // 液面：中心から水際まで、最後に内壁を這い上がる数リング
        const brothR = S.innerR(brothY), NR = GLOBAL.brothRings, NS = GLOBAL.brothSectors, MEN = 4;
        const rows = NR + 1 + MEN, pos = [], uv = [], idx = [];
        for (let i = 0; i < rows; i++) {
            let rr, yy;
            if (i <= NR) { const t = i / NR; rr = brothR * (Math.sqrt(t) * 0.5 + t * 0.5); yy = brothY; }
            else {
                const t = (i - NR) / MEN;
                yy = brothY + GLOBAL.meniscus * Math.pow(t, 1.5);
                rr = S.innerR(yy) + 0.02;
            }
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU, x = rr * Math.cos(th), z = rr * Math.sin(th);
                const rp = F.ripple[clamp(Math.round((z + half) / (2 * half) * N - 0.5), 0, N - 1) * N + clamp(Math.round((x + half) / (2 * half) * N - 0.5), 0, N - 1)];
                pos.push(x, yy + (i <= NR ? rp * GLOBAL.ripple : 0), z);
                uv.push(x / half * 0.5 + 0.5, z / half * 0.5 + 0.5);
            }
        }
        for (let i = 0; i < rows - 1; i++) for (let j = 0; j < NS; j++) {
            const p = i * (NS + 1) + j;
            idx.push(p, p + 1, p + NS + 1, p + 1, p + NS + 2, p + NS + 1);
        }
        let nor = new Float32Array(pos.length);
        BABYLON.VertexData.ComputeNormals(pos, idx, nor);
        let up = 0;
        for (let i = 1; i < nor.length; i += 3) up += nor[i];
        if (up < 0) {
            for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
            nor = new Float32Array(pos.length);
            BABYLON.VertexData.ComputeNormals(pos, idx, nor);
        }
        weldNormals(pos, nor);
        const mesh = named(new BABYLON.Mesh("broth", scene), "broth");
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = idx; vd.normals = nor; vd.uvs = uv;
        vd.applyToMesh(mesh, false);
        mesh.material = m;
        mesh.receiveShadows = true;
        return {
            mesh, mat: m, tex: [albedo, coat, orm, ripple], brothR,
            dispose() { mesh.dispose(); m.dispose(); for (const t of [albedo, coat, orm, ripple]) t.dispose(); }
        };
    }

    // =================================================================
    // 7. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.86, 0.83, 0.79, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.2;
    scene.environmentIntensity = 0.60;

    const camera = new BABYLON.ArcRotateCamera("cam", -Math.PI / 2 + 0.12, 0.78, 50, new V3(0, 4.0, 0.6), scene);
    camera.attachControl(engine.getRenderingCanvas(), true);
    camera.fov = 0.58;
    camera.wheelPrecision = 6;
    camera.minZ = 0.5;
    camera.maxZ = 400;
    camera.lowerRadiusLimit = 18;
    camera.upperRadiusLimit = 150;
    camera.upperBetaLimit = 1.42;

    // 料理写真の定番：奥から差す主光。濡れた具の縁と液面に照りが走る
    const key = new BABYLON.DirectionalLight("key", new V3(0.30, -0.80, -0.52).normalize(), scene);
    key.position = new V3(-18, 48, 32);
    key.intensity = 2.6;
    key.diffuse = new C3(1.0, 0.965, 0.92);
    key.specular = new C3(0.70, 0.68, 0.64);
    key.autoUpdateExtends = false;
    key.orthoLeft = -26; key.orthoRight = 26; key.orthoBottom = -26; key.orthoTop = 26;
    key.shadowMinZ = 1; key.shadowMaxZ = 120;

    const fill = new BABYLON.DirectionalLight("fill", new V3(-0.45, -0.55, 0.70).normalize(), scene);
    fill.intensity = 0.55;
    fill.specular = new C3(0.10, 0.10, 0.10);
    // 鏡面だけの灯（拡散はほぼ 0）。濡れた面の照りを何本も走らせる
    const kick1 = new BABYLON.DirectionalLight("kick1", new V3(-0.55, -0.40, -0.73).normalize(), scene);
    kick1.intensity = 1.25;
    kick1.diffuse = new C3(0.04, 0.04, 0.04);
    kick1.specular = new C3(1.0, 0.96, 0.90);
    const kick2 = new BABYLON.DirectionalLight("kick2", new V3(0.75, -0.45, -0.48).normalize(), scene);
    kick2.intensity = 0.80;
    kick2.diffuse = new C3(0.03, 0.03, 0.03);
    kick2.specular = new C3(0.92, 0.94, 1.0);
    const amb = new BABYLON.HemisphericLight("amb", new V3(0, 1, 0), scene);
    amb.intensity = 0.24;
    amb.groundColor = new C3(0.55, 0.48, 0.40);
    amb.specular = new C3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0012;
    sg.normalBias = 0.02;
    sg.darkness = 0.30;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.10;
    ip.contrast = 1.15;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.2;
    ip.vignetteCameraFov = 0.8;

    // ---- テーブル（明るい木） ---------------------------------------------
    const tableTex = (() => {
        const Nw = 1024, n2 = Nw * Nw, sd = 9001;
        const ring = new Float32Array(n2), fine = new Float32Array(n2), seam = new Float32Array(n2);
        for (let y = 0; y < Nw; y++) {
            const v = y / Nw;
            for (let x = 0; x < Nw; x++) {
                const u = x / Nw, i = y * Nw + x;
                const flow = Noise.fbm2p(u * 3, v * 2, 3, 2, sd + 11, 3) - 0.5;
                ring[i] = Math.pow(Math.abs(Math.sin((v * 14 + flow * 1.6) * Math.PI)), 2.2);
                fine[i] = Noise.fbm2p(u * 160, v * 24, 160, 24, sd + 43, 2);
                const pv = v * 4;
                seam[i] = 1 - smooth(0.0, 0.010, Math.abs(pv - Math.round(pv)));
            }
        }
        const BASE = [0.850, 0.720, 0.560], GRAIN = [0.760, 0.610, 0.440], DARK = [0.560, 0.410, 0.280];
        const albedo = makeTex(scene, "tableA", Nw, Nw, (d) => {
            for (let i = 0; i < n2; i++) {
                let c = mix3(BASE, GRAIN, clamp(ring[i] * 0.7 + (fine[i] - 0.5) * 0.25, 0, 1));
                c = mix3(c, DARK, seam[i] * 0.7);
                const k = i * 4;
                d[k] = c[0] * 255; d[k + 1] = c[1] * 255; d[k + 2] = c[2] * 255; d[k + 3] = 255;
            }
        });
        const orm = makeTex(scene, "tableO", Nw, Nw, (d) => {
            for (let i = 0; i < n2; i++) {
                const k = i * 4;
                d[k] = 255 * (1 - 0.3 * seam[i]); d[k + 1] = clamp(0.50 + 0.12 * ring[i] + 0.1 * (fine[i] - 0.5), 0, 1) * 255; d[k + 2] = 0; d[k + 3] = 255;
            }
        }, true);
        for (const t of [albedo, orm]) { t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; t.uScale = t.vScale = 3; }
        return { albedo, orm };
    })();
    const table = named(BABYLON.MeshBuilder.CreateGround("table", { width: 240, height: 240 }, scene), "table");
    {
        const tm = named(new BABYLON.PBRMaterial("tableMat", scene), "tableMat");
        tm.albedoTexture = tableTex.albedo; tm.metallicTexture = tableTex.orm;
        tm.useAmbientOcclusionFromMetallicTextureRed = true;
        tm.useRoughnessFromMetallicTextureGreen = true;
        tm.useMetallnessFromMetallicTextureBlue = true;
        tm.metallic = 0; tm.roughness = 1;
        table.material = tm;
        table.receiveShadows = true;
        table.rotation.y = 0.08;
    }

    // ---- 湯気 ---------------------------------------------------------------
    const steamTex = (() => {
        const dt = named(new BABYLON.DynamicTexture("steamTex", { width: 128, height: 128 }, scene, true), "steamTex");
        const ctx = dt.getContext();
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0.0, "rgba(255,255,255,1)");
        g.addColorStop(0.45, "rgba(255,255,255,0.42)");
        g.addColorStop(1.0, "rgba(255,255,255,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
        dt.update(); dt.hasAlpha = true;
        return dt;
    })();
    const steam = new BABYLON.ParticleSystem("steam", 600, scene);
    steam.particleTexture = steamTex;
    steam.emitter = new V3(0, 7, 0);
    steam.minEmitBox = new V3(-6, -0.2, -6);
    steam.maxEmitBox = new V3(6, 0.2, 6);
    // 【対策】加算合成にすると湯気が発光して見える。湯気は光っていない
    steam.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    steam.color1 = new BABYLON.Color4(1, 1, 1, 0.050);
    steam.color2 = new BABYLON.Color4(0.95, 0.95, 0.96, 0.024);
    steam.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    steam.minSize = 1.6; steam.maxSize = 4.6;
    steam.minLifeTime = 2.2; steam.maxLifeTime = 4.2;
    steam.emitRate = 120;
    steam.gravity = new V3(0.3, 1.4, 0);
    steam.direction1 = new V3(-0.4, 1.6, -0.4);
    steam.direction2 = new V3(0.5, 2.8, 0.4);
    steam.minAngularSpeed = -0.4; steam.maxAngularSpeed = 0.4;
    steam.minEmitPower = 0.35; steam.maxEmitPower = 0.95;
    steam.updateSpeed = 0.012;

    // =================================================================
    //  組み立て
    // =================================================================
    let curDashi = START_DASHI, curPot = START_POT, curSet = START_SET, curSeed = START_SEED;
    let pot = null, plateRes = null, pieces = [], broth = null, brothY = 0, dbgIdx = 0;
    const kindMats = {};
    let stats = "";

    function kindMat(kind) {
        if (kindMats[kind]) return kindMats[kind];
        const k = KINDS[kind].mat;
        const m = named(new BABYLON.PBRMaterial("mat_" + kind, scene), "mat_" + kind);
        m.albedoColor = new C3(1, 1, 1);
        m.metallic = 0; m.roughness = k.rough;
        // 照りは出汁の膜。具そのものの粗さとは別に clearCoat で持つ
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = k.coat;
        m.clearCoat.roughness = k.coatRough;
        m.clearCoat.indexOfRefraction = 1.34;
        // 【対策】透過光の色を既定の白のままにすると、大根や卵が白く発光する。
        //         透過光は具の中を通るので、必ずその具の色に染まる
        m.subSurface.isTranslucencyEnabled = k.trans > 0;
        m.subSurface.translucencyIntensity = k.trans;
        m.subSurface.tintColor = col3(k.tint);
        if ("useAlbedoToTintTranslucency" in m.subSurface) m.subSurface.useAlbedoToTintTranslucency = true;
        m.subSurface.minimumThickness = 0.05;
        m.subSurface.maximumThickness = k.thick;
        kindMats[kind] = m;
        return m;
    }

    function disposePieces() {
        for (const pc of pieces) if (pc.mesh) pc.mesh.dispose();
        pieces = [];
    }

    function computeBrothY() {
        const S = pot.shape, D = DASHI[curDashi];
        // 出汁は口縁の 1.5cm 下まで張る。ただし具の半分くらいは頭を出す高さまで
        const tops = pieces.map((p) => p.top).sort((a, b) => a - b);
        const q = tops.length ? tops[Math.floor(tops.length * 0.30)] : S.floor0 + 4;
        return clamp(Math.min(S.rimY - 1.5, q - 0.7) + D.level, S.floor0 + 2.2, S.rimY - 1.0);
    }

    function applyDashi() {
        const D = DASHI[curDashi];
        brothY = computeBrothY();
        for (const pc of pieces) {
            bakePiece(pc, plateRes.field, D, brothY);
            pc.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, pc.col, false, false);
            // 完全に沈んだ具は液面のテクスチャに焼いてあるので描かない
            pc.mesh.isVisible = pc.top > brothY + 0.01;
        }
        if (broth) broth.dispose();
        const half = plateRes.field.half;
        const F = brothFields(pot, pieces, brothY, half, GLOBAL.brothTex, (curSeed ^ 0x1B0A) >>> 0);
        broth = buildBroth(scene, pot, F, D, brothY);
        steam.emitter = new V3(0, brothY + 0.5, 0);
        const r = broth.brothR * 0.62;
        steam.minEmitBox = new V3(-r, -0.2, -r); steam.maxEmitBox = new V3(r, 0.2, r);
        applyDebug();
    }

    function build(full) {
        const t0 = now();
        if (full || !pot || pot.key !== curPot) {
            if (pot) pot.dispose();
            pot = buildPot(scene, curPot, 4001);
            camera.target = new V3(0, pot.shape.base + 3.6, 0.6);
        }
        disposePieces();
        const t1 = now();
        plateRes = plan(pot, curSet, curSeed);
        const t2 = now();
        for (const pl of plateRes.placed) {
            const geo = KINDS[pl.kind].build(pl.seed, 1.0);
            geo.transform(pl.M);
            const pc = bake(geo);
            pc.kind = pl.kind;
            let top = -1e9;
            for (let i = 1; i < pc.P.length; i += 3) top = Math.max(top, pc.P[i]);
            pc.top = top;
            const mesh = named(new BABYLON.Mesh(pl.kind, scene), pl.kind);
            const vd = new BABYLON.VertexData();
            vd.positions = pc.P; vd.indices = pc.I; vd.normals = pc.N;
            vd.colors = new Float32Array(pc.nV * 4).fill(1);
            vd.applyToMesh(mesh, true);
            // 【対策】頂点カラーを stride 4 で入れると hasVertexAlpha が立ち、
            //         透過パスへ回されて液面との前後関係が壊れる
            mesh.hasVertexAlpha = false;
            mesh.material = kindMat(pl.kind);
            mesh.receiveShadows = true;
            pc.mesh = mesh;
            pieces.push(pc);
        }
        const t3 = now();
        applyDashi();
        const t4 = now();
        // 影：鍋と、頭を出している具
        const sm = sg.getShadowMap();
        if (sm && sm.renderList) {
            sm.renderList.length = 0;
            sm.renderList.push(pot.mesh, ...pot.extras);
            for (const pc of pieces) sm.renderList.push(pc.mesh);
        }
        const cnt = {};
        for (const pc of pieces) cnt[pc.kind] = (cnt[pc.kind] || 0) + 1;
        let verts = 0;
        for (const pc of pieces) verts += pc.nV;
        stats = Object.keys(cnt).map((k) => KINDS[k].label + cnt[k]).join(" ") + "\n"
            + (verts / 1000).toFixed(0) + "k 頂点 / 出汁 y=" + brothY.toFixed(1) + "cm\n"
            + "配置 " + (t2 - t1).toFixed(0) + "ms / 具 " + (t3 - t2).toFixed(0) + "ms / 出汁 " + (t4 - t3).toFixed(0) + "ms";
        console.log("[Oden]", BUILD, "/", POTS[curPot].label, "/", DASHI[curDashi].label, "/", SETS[curSet].label,
            "/ seed =", curSeed, "/", pieces.length, "個 /", stats.replace(/\n/g, " / "));
        if (onBuilt) onBuilt();
    }

    function applyDebug() {
        for (const pc of pieces) {
            pc.mesh.useVertexColors = dbgIdx !== 1;
        }
        if (broth) broth.mesh.isVisible = dbgIdx !== 2;
        for (const pc of pieces) pc.mesh.isVisible = dbgIdx === 2 ? true : pc.top > brothY + 0.01;
    }

    let onBuilt = null;
    build(true);

    // ---- ポストプロセス ------------------------------------------------------
    if (GLOBAL.useSSAO && BABYLON.SSAO2RenderingPipeline.IsSupported) {
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 1.2;
        ssao.totalStrength = 0.8;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 200;
        ssao.minZAspect = 0.3;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.92;
    dp.bloomWeight = 0.06;
    dp.bloomKernel = 44;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.15;
    dp.depthOfFieldEnabled = GLOBAL.useDOF;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.High;
    dp.depthOfField.lensSize = 50;
    dp.depthOfField.fStop = GLOBAL.dofFStop;
    let tclock = 0;
    scene.onBeforeRenderObservable.add(() => {
        if (dp.depthOfFieldEnabled) {
            // Babylon の錯乱円は「シーン単位 × 1000 = mm」。焦点距離を合焦距離の一定比にする
            const focus = camera.radius * 1000;
            dp.depthOfField.focusDistance = focus;
            dp.depthOfField.focalLength = focus * GLOBAL.dofRatio;
        }
        if (broth && broth.mat.clearCoat.bumpTexture) {
            tclock += scene.getEngine().getDeltaTime() * 0.001;
            const b = broth.mat.clearCoat.bumpTexture;
            b.uOffset = Math.sin(tclock * 0.13) * 0.012 + tclock * 0.003;
            b.vOffset = Math.cos(tclock * 0.09) * 0.010 - tclock * 0.002;
        }
    });

    // =================================================================
    // 8. GUI
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
        if (ui.layer) ui.layer.applyPostProcess = false;
    }

    const COL = { idle: "#2b2118", active: "#8a5a26", edge: "#4a3a2c", text: "#fbf1e4", sub: "#c9b096", accent: "#f0c27a" };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "236px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(22,15,9,0.86)";
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
    function addRow(name, opts, isOn, onPick) {
        const g = new BABYLON.GUI.Grid(name);
        g.height = "34px"; g.paddingBottom = "6px";
        const btns = [];
        opts.forEach((o, i) => {
            g.addColumnDefinition(1 / opts.length);
            const b = BABYLON.GUI.Button.CreateSimpleButton(name + i, o.label);
            b.color = COL.text; b.cornerRadius = 6; b.thickness = 0; b.fontSize = 13;
            b.paddingLeft = i ? "3px" : "0px"; b.paddingRight = i < opts.length - 1 ? "3px" : "0px";
            b.onPointerUpObservable.add(() => { onPick(o.value); refresh(); });
            g.addControl(b, 0, i);
            btns.push([b, o.value]);
        });
        const refresh = () => { for (const [b, v] of btns) b.background = isOn(v) ? COL.active : COL.idle; };
        panel.addControl(g);
        refresh();
        return refresh;
    }
    function toggle(b, on, text) { b.background = on ? COL.active : COL.idle; b.textBlock.text = text; }

    addLabel("ODEN / おでん", 11, COL.sub, "18px");
    addLabel("出汁", 13, COL.accent, "22px");
    addRow("dashi", Object.keys(DASHI).map((k) => ({ label: DASHI[k].label.replace(/（.*）/, ""), value: k })), (v) => v === curDashi,
        (v) => { curDashi = v; applyDashi(); if (onBuilt) onBuilt(); });
    addLabel("鍋", 13, COL.accent, "26px");
    addRow("pot", [{ label: "土鍋", value: "donabe" }, { label: "鋳物鍋", value: "iron" }], (v) => v === curPot,
        (v) => { curPot = v; build(true); });
    addLabel("具", 13, COL.accent, "26px");
    const setBtns = {};
    function highlightSets() { for (const k in setBtns) setBtns[k].background = (k === curSet) ? COL.active : COL.idle; }
    for (const k of Object.keys(SETS)) {
        setBtns[k] = addButton("set_" + k, SETS[k].label, () => { curSet = k; build(false); highlightSets(); });
    }
    addButton("reseed", "盛り直す", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(false);
    });
    const DEBUGS = ["通常", "白クレイ", "出汁を抜く"];
    const dbgBtn = addButton("debug", "表示: 通常", () => {
        dbgIdx = (dbgIdx + 1) % DEBUGS.length;
        applyDebug();
        toggle(dbgBtn, dbgIdx !== 0, "表示: " + DEBUGS[dbgIdx]);
    });
    const steamBtn = addButton("steam", "湯気: ON", () => setSteam(!steam.isStarted()));
    function setSteam(on) { if (on) steam.start(); else steam.stop(); toggle(steamBtn, on, "湯気: " + (on ? "ON" : "OFF")); }
    setSteam(true);
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
    const info = addLabel("", 11, COL.sub, "80px");
    info.textWrapping = true;
    onBuilt = () => { info.text = stats; highlightSets(); };
    onBuilt();

    // ---- GUI の開閉（狭い画面では畳む。DPR 分だけ拡大）-------------------
    function viewportCss() {
        const c = engine.getRenderingCanvas();
        return { w: (c && c.clientWidth) || window.innerWidth || 1024, h: (c && c.clientHeight) || window.innerHeight || 768 };
    }
    function isCompact() {
        const v = viewportCss();
        return v.w < GLOBAL.compactWidth || Math.min(v.w, v.h) < GLOBAL.compactMinSide;
    }
    const toggleBtn = BABYLON.GUI.Button.CreateSimpleButton("guiToggle", "≡");
    toggleBtn.width = "38px"; toggleBtn.height = "38px";
    toggleBtn.cornerRadius = 10; toggleBtn.thickness = 1;
    toggleBtn.color = COL.edge; toggleBtn.background = "rgba(22,15,9,0.86)";
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
        camera.fov = narrow ? 0.85 : 0.58;
        const scale = isCompact() ? clamp(engine.getRenderWidth() / Math.max(1, viewportCss().w), 1, GLOBAL.guiMaxScale) : 1;
        for (const c of [toggleBtn, card]) { c.transformCenterX = 0; c.transformCenterY = 0; c.scaleX = scale; c.scaleY = scale; }
        card.top = (16 + 38 * scale + 8) + "px";
        card.isVisible = panelOpen;
        if (toggleBtn.textBlock) toggleBtn.textBlock.text = panelOpen ? "×" : "≡";
    }
    toggleBtn.onPointerUpObservable.add(() => { panelOpen = !panelOpen; applyGuiLayout(); });
    const resizeObserver = engine.onResizeObservable.add(applyGuiLayout);
    scene.onDisposeObservable.add(() => { engine.onResizeObservable.remove(resizeObserver); });
    applyGuiLayout();

    // コンソールから切り替える口（例: scene.metadata.oden.set({ pot: "iron", dashi: "kansai" })）
    scene.metadata = scene.metadata || {};
    scene.metadata.oden = {
        set(o) {
            if (o.dashi) curDashi = o.dashi;
            if (o.set) curSet = o.set;
            if (o.seed) curSeed = o.seed >>> 0;
            if (o.pot && o.pot !== curPot) { curPot = o.pot; build(true); }
            else if (o.set || o.seed) build(false);
            else applyDashi();
            if (o.debug !== undefined) { dbgIdx = o.debug; applyDebug(); }
            return stats;
        }
    };

    return scene;
};

export default createScene;