// 牛丼 — all geometry, surface maps and studio reflections are generated in code.
// 牛丼 — gyudon-2026-10-26-i
// つゆを吸って濃くなった牛バラ・薄く透けた玉ねぎ・湯気。Babylon.js Playground 用。
// Tsuyu coefficients are artistic parameters, not measured material properties.
// The bowl decoration is an original procedural pattern (no logos / trademarks).

var createScene = function () {
    const MM = 0.1;

    // ---- つゆ（割下）--------------------------------------------------
    // 色と吸収係数は美術的な近似値。写真の牛肉（明るい所 sRGB 0.62,0.42,0.26 /
    // 溝 0.24,0.12,0.04）に合うよう、膜の σ を上げて「つゆを吸って濃くなった肉」にする。
    // 【対策】σ を下げて肉の素の色で勝負すると、乾いたフレークに見える。
    //         牛丼の濃さは肉の色ではなく、肉を覆う琥珀色のつゆの膜が作っている
    const SAUCES = {
        teiban: {
            label: "定番",
            sigma: [0.95, 2.05, 3.90],
            haze: [0.560, 0.350, 0.160], hazeK: 0.140,
            film: 0.050, pool: 0.170, drain: 4.0,
            rough: 0.100, coat: 0.96, oil: 0.60,
            riceSoak: 0.55, riceSpread: 0.85      // ご飯へのつゆの染み
        },
        tsuyudaku: {
            label: "つゆだく",
            sigma: [0.95, 2.05, 3.90],
            haze: [0.560, 0.350, 0.160], hazeK: 0.150,
            film: 0.066, pool: 0.230, drain: 5.0,
            rough: 0.075, coat: 1.00, oil: 0.75,
            riceSoak: 0.95, riceSpread: 2.30
        },
        tsuyunuki: {
            label: "つゆ少なめ",
            sigma: [0.95, 2.05, 3.90],
            haze: [0.560, 0.350, 0.160], hazeK: 0.120,
            film: 0.036, pool: 0.110, drain: 3.0,
            rough: 0.135, coat: 0.85, oil: 0.40,
            riceSoak: 0.22, riceSpread: 0.40
        }
    };

    // ---- 丼 -----------------------------------------------------------
    // 【対策】写真2の丼にはチェーン店の商標（紋章）が入っている。器の柄は
    //         写真の雰囲気（内側の山形帯・外側の色絵の窓絵）だけを借りた
    //         オリジナルの手続き模様にして、紋章は描かない
    const SARAS = {
        iroe: {
            label: "色絵の丼", deco: "iroe",
            albedo: [0.905, 0.900, 0.880], rough: 0.12,
            speck: 0.05, coat: 0.98, coatRough: 0.045
        },
        sometsuke: {
            label: "染付の丼", deco: "sometsuke",
            albedo: [0.898, 0.898, 0.884], rough: 0.12,
            speck: 0.08, coat: 0.98, coatRough: 0.050
        },
        hakuji: {
            label: "白磁の丼", deco: "none",
            albedo: [0.905, 0.902, 0.890], rough: 0.11,
            speck: 0.04, coat: 0.98, coatRough: 0.040
        }
    };

    const FILLS = {
        nami: { label: "並盛", meat: 64, onion: 18, pileR: 6.80 },
        oomori: { label: "大盛（具多め）", meat: 84, onion: 19, pileR: 6.80 },
        tamanegi: { label: "玉ねぎ多め", meat: 56, onion: 26, pileR: 6.70 }
    };

    const TABLES = {
        nuno: { label: "藍の布マット" },
        shiraki: { label: "白木の卓" }
    };

    const GLOBAL = {
        // 丼（口径 16.6cm / 高さ 8.6cm の並丼）
        rimY: 8.60,        // 口縁の高さ
        yFloor: 1.70,      // 見込みの中心
        rIn: 8.00,         // 口縁の内半径
        rimLip: 0.30,      // 口縁の丸みの幅（＝口縁の肉厚）
        rFootOut: 3.60,    // 高台の外半径
        rFootIn: 3.00,     // 高台の内半径
        footH: 0.80,       // 高台の高さ
        yUnder: 1.05,      // 底裏
        wallBase: 0.50,    // 腰の肉厚
        sides: 240,
        wobble: 1.0,
        shinogiDepth: 0,
        saraTex: 1024,     // 絵付けの解像度（外周 53cm / 1024 ≒ 0.5mm）

        // ご飯
        riceDrop: 1.60,    // 口縁から何 cm 下でご飯が器に接するか
        // 【対策】盛りを水平にすると「型に詰めたご飯」になり、堅く見える。
        //         しゃもじでよそったご飯は中央がふっくら高く、しゃもじの跡の
        //         大きなうねりがあり、輪郭には粒の先端が突き出して毛羽立っている
        ricePeak: 1.00,    // 中央の盛り上がり [cm]
        riceLump: 0.30,    // しゃもじの跡のうねり [cm]
        riceLift: 0.30,    // 塊の上に乗って浮いている粒の高さ [cm]
        riceLiftRatio: 0.32,// そのような粒の割合
        riceLoose: 0.42,   // 面に沿わず大きく起き上がる粒の割合
        riceN: 2600,       // 見えている所に置く粒の数

        // 具（高さ場）
        pileAt: [0.30, 0.00],
        pileGrid: 256,
        pileHalf: 8.40,
        liftQuantile: 0.42,
        settle: 0.200,
        tryPos: 9,
        pileR: 6.00,
        pileDome: 0.20,

        pocketR: [0.30, 0.62, 1.05],
        pocketDirs: 12,
        pocketRise: 0.14,

        beniAt: [-1.2, 3.2],     // 紅しょうがを乗せる位置 [手前, 右]

        useSSAO: true,
        useDOF: false,
        dofFStop: 2.8,
        dofRatio: 0.066,
        guiOwnCamera: false
    };

    // 丼の見込み（内側）の断面。腰で丸く、口へ向かってほぼ垂直に立ち上がる
    const DON_R = [0.00, 1.60, 3.00, 4.20, 5.20, 6.00, 6.65, 7.15, 7.55, 7.82, 8.00];
    const DON_Y = [1.70, 1.73, 1.86, 2.14, 2.60, 3.22, 3.98, 4.86, 5.90, 7.15, 8.60];

    const START_SAUCE = "teiban";
    const START_SARA = "iroe";
    const START_FILL = "nami";
    const START_TABLE = "shiraki";
    const START_SEED = 20261024;

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;
    const GOLD = 2.39996323;

    const DIR_D = [0.4169, -0.9090];
    const DIR_R = [0.9090, 0.4169];
    const placeXZ = (fr) => [DIR_D[0] * fr[0] + DIR_R[0] * fr[1], DIR_D[1] * fr[0] + DIR_R[1] * fr[1]];

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

    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const s2l = (c) => (c <= 0.04045) ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const l2s = (v) => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;
    const col3 = (a) => new BABYLON.Color3(s2l(a[0]), s2l(a[1]), s2l(a[2]));

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

    let _uid = 0;
    function named(mesh, base) {
        const u = base + "#" + (++_uid);
        mesh.name = u;
        mesh.id = u;
        return mesh;
    }

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

    function shiftY(positions, nV, dy) {
        for (let i = 0; i < nV; i++) positions[i * 3 + 1] += dy;
    }

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

    function makeMesh(name, positions, indices, normals, uvs, colors, scene, updatable) {
        const mesh = named(new BABYLON.Mesh(name, scene), name);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals;
        if (uvs) vd.uvs = uvs;
        if (colors) vd.colors = colors;
        vd.applyToMesh(mesh, !!updatable);
        mesh.hasVertexAlpha = false;
        mesh.tris = indices.length / 3;
        return mesh;
    }

    const TexLab = {
        _tex(name, w, h, fill, scene, linear, clampV) {
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
            if (linear) dt.gammaSpace = false;
            dt.anisotropicFilteringLevel = 16;
            return dt;
        },
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
        normalFromHeight(name, N, H, strength, scene, clampV) {
            return this._tex(name, N, N, (d) => {
                for (let y = 0; y < N; y++) {
                    const yu = ((y - 1 + N) % N) * N, yd = ((y + 1) % N) * N, yc = y * N;
                    for (let x = 0; x < N; x++) {
                        const xl = H[yc + ((x - 1 + N) % N)], xr = H[yc + ((x + 1) % N)];
                        const hu = H[yu + x], hd = H[yd + x];
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

    function finalizeOff(positions, indices, offs) {
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        let dot = 0;
        for (let i = 0; i < positions.length; i++) dot += normals[i] * offs[i];
        if (dot < 0) {
            for (let i = 0; i < indices.length; i += 3) {
                const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t;
            }
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        return normals;
    }

    let _sara = null;
    function saraCurves(G) {
        if (_sara) return _sara;
        const ys = DON_Y.slice();
        const f = monoSpline(DON_R, ys);
        const rimY = ys[ys.length - 1];
        const NI = 240;
        const inR = new Float64Array(NI + 1), inY = new Float64Array(NI + 1);
        for (let i = 0; i <= NI; i++) { inR[i] = G.rIn * i / NI; inY[i] = f(inR[i]); }
        const outR = new Float64Array(NI + 1), outY = new Float64Array(NI + 1);
        for (let i = 0; i <= NI; i++) {
            const a = Math.max(0, i - 1), b = Math.min(NI, i + 1);
            const dy = (inY[b] - inY[a]) / Math.max(1e-9, inR[b] - inR[a]);
            const L = Math.hypot(1, dy);
            const t = mix(G.wallBase, G.rimLip, smooth(G.yFloor + 0.15, rimY, inY[i]));
            const w = smooth(rimY - 0.45, rimY, inY[i]);
            const nr = (dy / L) * (1 - w) + w, ny = (-1 / L) * (1 - w);
            outR[i] = inR[i] + t * nr; outY[i] = inY[i] + t * ny;
        }
        let iStop = 0;
        while (iStop < NI && outR[iStop] < G.rFootOut) iStop++;
        _sara = { inR, inY, outR, outY, NI, iStop, f, rimY };
        return _sara;
    }

    function saraProfile(G) {
        const W = saraCurves(G), NI = W.NI;
        const P = [];
        const push = (r, y, k) => P.push({ r: r, y: y, k: k });
        for (let i = 0; i <= NI; i += 2) push(W.inR[i], W.inY[i], 0);
        const cx = G.rIn + G.rimLip * 0.5, rr = G.rimLip * 0.5;
        const rimIndex = P.length + 5;
        for (let i = 1; i <= 12; i++) {
            const a = Math.PI * (1 - i / 12);
            push(cx + rr * Math.cos(a), W.rimY + rr * Math.sin(a), 1);
        }
        for (let i = NI - 2; i >= W.iStop; i -= 2) push(W.outR[i], W.outY[i], 2);
        const yK = W.outY[W.iStop];
        push(G.rFootOut, mix(yK, G.footH, 0.5), 2);
        push(G.rFootOut - 0.02, G.footH * 0.55, 2);
        push(G.rFootOut - 0.06, 0.05, 3);
        push(G.rFootOut - 0.15, 0.0, 3);
        push(G.rFootIn + 0.07, 0.0, 3);
        push(G.rFootIn, 0.05, 3);
        push(G.rFootIn, G.footH * 0.75, 3);
        push(G.rFootIn - 0.06, G.yUnder - 0.03, 3);
        for (let i = 1; i <= 20; i++) {
            const u = 1 - i / 20;
            push((G.rFootIn - 0.06) * u, G.yUnder - 0.03 + 0.03 * (1 - Math.pow(u, 1.7)), 3);
        }
        return { P: P, rimIndex: rimIndex };
    }

    function profileTable(G) {
        const { P, rimIndex } = saraProfile(G);
        const N = P.length;
        const arc = new Float32Array(N);
        for (let i = 1; i < N; i++) arc[i] = arc[i - 1] + Math.hypot(P[i].r - P[i - 1].r, P[i].y - P[i - 1].y);
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
    function innerRadiusAt(G, y) {
        const W = saraCurves(G), NI = W.NI;
        if (y <= W.inY[0]) return 0;
        if (y >= W.inY[NI]) return G.rIn;
        let lo = 0, hi = NI;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (W.inY[m] <= y) lo = m; else hi = m; }
        const d = W.inY[hi] - W.inY[lo];
        return W.inR[lo] + (W.inR[hi] - W.inR[lo]) * (d > 1e-12 ? (y - W.inY[lo]) / d : 0);
    }
    function innerYAt(G, r) {
        return saraCurves(G).f(clamp(r, 0, G.rIn));
    }

    function shinogiDy(G, sp, r, th) {
        if (!sp.shinogi) return 0;
        const mask = smooth(8.9, 9.9, r) * (1 - 0.55 * smooth(G.rIn - 0.10, G.rIn + 0.20, r));
        if (mask <= 0) return 0;
        const g = Math.pow(0.5 + 0.5 * Math.cos(sp.shinogi * th), 6);   // 細い溝
        return -G.shinogiDepth * g * mask;
    }

    function buildSara(scene, G, sp, mat, rng) {
        const { P, rimIndex } = saraProfile(G);
        const N = P.length;
        const M = sp.shinogi ? Math.max(G.sides, sp.shinogi * 10) : G.sides;
        const arc = new Float32Array(N);
        for (let i = 1; i < N; i++) arc[i] = arc[i - 1] + Math.hypot(P[i].r - P[i - 1].r, P[i].y - P[i - 1].y);
        const total = arc[N - 1] || 1;
        const ph = [rng.range(0, 9), rng.range(0, 9), rng.range(0, 9), rng.range(0, 9)];
        const W = saraCurves(G);
        const nV = N * (M + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array((N - 1) * M * 6);
        let vo = 0;
        for (let i = 0; i < N; i++) {
            const p = P[i];
            const mask = smooth(W.rimY - 1.2, W.rimY, p.y);
            for (let j = 0; j <= M; j++) {
                const th = (j % M) / M * TAU;
                const wob = 1 + G.wobble * (0.0026 * Math.sin(3 * th + ph[0]) + 0.0016 * Math.sin(5 * th + ph[1]));
                const dyw = G.wobble * mask * (0.020 * Math.sin(2 * th + ph[2]) + 0.010 * Math.sin(3 * th + ph[3]));
                const r = p.r * wob;
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = r * Math.cos(th);
                positions[p3 + 1] = p.y + dyw + (p.k <= 2 ? shinogiDy(G, sp, p.r, th) : 0);
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
        const normals = finalize(positions, indices, new V3(0, W.rimY - 1.0, 0), rimIndex * (M + 1), false);
        weldNormals(positions, normals);
        const mesh = makeMesh("sara", positions, indices, normals, uvs, null, scene);
        mesh.material = mat;
        mesh.receiveShadows = true;
        return mesh;
    }

    // ---- 丼の絵付け ----------------------------------------------------
    // 色は sRGB。呉須（コバルト）の藍は釉の下に沈むので縁がにじみ、
    // 上絵（赤・黄）は釉の上にのるのでわずかに盛り上がる
    const INK = {
        blue: [0.110, 0.200, 0.520],
        wash: [0.430, 0.530, 0.790],      // 濃み（薄い藍の塗り）
        red: [0.770, 0.230, 0.160],
        yel: [0.880, 0.740, 0.250]
    };
    const fr = (x) => x - Math.floor(x);
    const band = (d, w, aa) => 1 - smooth(w, w + aa, Math.abs(d));

    function donPainter(G, sp, seed) {
        const W = saraCurves(G);
        const yFootTop = W.outY[W.iStop];
        const P = { r: 0, g: 0, b: 0, a: 0, en: 0 };
        const put = (c, a, en) => {
            if (!(a > 0.001)) return;
            a = Math.min(1, a);
            P.r += (c[0] - P.r) * a; P.g += (c[1] - P.g) * a; P.b += (c[2] - P.b) * a;
            P.a = 1 - (1 - P.a) * (1 - a);
            if (en) P.en = Math.max(P.en, a);
        };

        // 内側の帯（口縁のすぐ下）
        function inner(y, th) {
            const yTop = G.rimY - 0.28, yBot = G.rimY - 1.30;
            if (y < yBot - 0.30) return;
            put(INK.blue, band(y - yTop, 0.020, 0.012));
            put(INK.blue, band(y - yBot, 0.032, 0.012));
            put(INK.blue, band(y - (yBot - 0.15), 0.013, 0.010));
            if (y <= yBot + 0.04 || y >= yTop - 0.04) return;
            const b = (yTop - y) / (yTop - yBot);
            if (sp.deco === "iroe") {
                // 山形（ジグザグ）の線が 3 本
                const u = th / TAU * 44;
                const tri = Math.abs(fr(u) - 0.5) * 2;
                const q = b * 2.6 + tri * 0.90;
                const di = Math.abs(q - Math.round(q));
                put(INK.blue, 1 - smooth(0.070, 0.105, di));
            } else {
                // 藍地に白抜きの菱
                const u = th / TAU * 64, v = b * 1.3;
                const fu = fr(u) - 0.5, fv = fr(v) - 0.5;
                const d = Math.abs(fu) + Math.abs(fv);
                const white = 1 - smooth(0.28, 0.33, d);
                put(INK.blue, 1 - white);
                put(INK.blue, (1 - smooth(0.06, 0.09, d)) * 0.92);
            }
        }

        // 外側の窓絵 / 唐草
        function outer(r, y, th) {
            const yHi = G.rimY - 0.55, yLo = yFootTop + 0.30;
            put(INK.blue, band(y - yHi, 0.032, 0.012));
            put(INK.blue, band(y - (yHi - 0.14), 0.013, 0.010));
            put(INK.blue, band(y - yLo, 0.032, 0.012));
            put(INK.blue, band(y - (yLo + 0.14), 0.013, 0.010));
            if (y <= yLo + 0.20 || y >= yHi - 0.20) return;
            if (sp.deco === "iroe") {
                const Np = 6;
                const pu = th / TAU * Np + 0.25;
                const pi = ((Math.floor(pu) % Np) + Np) % Np;
                const pw = TAU * r / Np, sx = fr(pu) * pw;
                const edge = Math.min(sx, pw - sx);
                put(INK.blue, band(edge, 0.030, 0.012));
                const y0 = yLo + 0.30, y1 = yHi - 0.30;
                if (edge < 0.22 || y < y0 || y > y1) return;
                const t = pi % 3;
                if (t === 0) {
                    // 藍地に黄の格子（斜め）
                    put(INK.blue, 0.97);
                    const a1 = (sx + y) / 0.62, b1 = (sx - y) / 0.62;
                    const la = Math.abs(a1 - Math.round(a1)), lb = Math.abs(b1 - Math.round(b1));
                    put(INK.yel, Math.max(1 - smooth(0.035, 0.065, la), 1 - smooth(0.035, 0.065, lb)) * 0.95, 1);
                    const a2 = a1 + 0.17, b2 = b1 + 0.17;
                    const la2 = Math.abs(a2 - Math.round(a2)), lb2 = Math.abs(b2 - Math.round(b2));
                    put(INK.yel, Math.max(1 - smooth(0.018, 0.040, la2), 1 - smooth(0.018, 0.040, lb2)) * 0.80, 1);
                } else if (t === 1) {
                    // 白地に赤の格子縞
                    const gx = sx / 0.48, gy = y / 0.48;
                    const lx = Math.abs(gx - Math.round(gx)), ly = Math.abs(gy - Math.round(gy));
                    const lx2 = Math.abs(gx + 0.20 - Math.round(gx + 0.20)), ly2 = Math.abs(gy + 0.20 - Math.round(gy + 0.20));
                    const l1 = Math.max(1 - smooth(0.045, 0.075, lx), 1 - smooth(0.045, 0.075, ly));
                    const l2 = Math.max(1 - smooth(0.020, 0.045, lx2), 1 - smooth(0.020, 0.045, ly2));
                    put(INK.red, Math.max(l1, l2 * 0.85), 1);
                } else {
                    // 白地に藍の桜（輪郭）を散らす
                    const cs = 1.25;
                    const gi = Math.floor(sx / cs), gj = Math.floor(y / cs);
                    for (let dj = -1; dj <= 1; dj++) {
                        for (let di = -1; di <= 1; di++) {
                            const ci = gi + di, cj = gj + dj;
                            const h1 = Noise._h2(ci, cj, seed + 11 + pi), h2 = Noise._h2(ci, cj, seed + 17 + pi);
                            const h3 = Noise._h2(ci, cj, seed + 23 + pi);
                            const cx = (ci + 0.5 + (h1 - 0.5) * 0.45) * cs, cy = (cj + 0.5 + (h2 - 0.5) * 0.45) * cs;
                            const R = 0.30 + 0.14 * h3;
                            const dx = sx - cx, dy = y - cy, d = Math.hypot(dx, dy);
                            if (d > R * 1.2) continue;
                            const ang = Math.atan2(dy, dx) + h1 * 6.0;
                            const shape = R * (0.62 + 0.38 * Math.pow(Math.abs(Math.cos(2.5 * ang)), 0.55));
                            put(INK.blue, band(d - shape, 0.018, 0.012));
                            put(INK.wash, (1 - smooth(shape * 0.55, shape * 0.75, d)) * 0.35);
                            put(INK.blue, 1 - smooth(0.035, 0.055, d));
                        }
                    }
                }
            } else if (sp.deco === "sometsuke") {
                const yS = yLo + 0.95;
                put(INK.blue, band(y - yS, 0.022, 0.010));
                if (y < yS - 0.04) {
                    // 青海波
                    const s = th * r, w = 0.62, h = 0.26, R = w * 0.5;
                    const j0 = Math.floor((y - yLo) / h);
                    for (let jj = j0 - 3; jj <= j0; jj++) {
                        if (jj < 0) continue;
                        const cy = yLo + jj * h;
                        if (y < cy) continue;
                        const off = (jj & 1) * w * 0.5;
                        const cx = Math.round((s - off) / w) * w + off;
                        const d = Math.hypot(s - cx, y - cy);
                        if (d >= R) continue;
                        const rl = Math.abs(d - Math.round(d / 0.10) * 0.10);
                        put(INK.blue, 1 - smooth(0.010, 0.020, rl));
                        break;
                    }
                } else if (y > yS + 0.04) {
                    // 唐草: 1 本の蔓と、そのまわりの巻きひげ・葉
                    const yc = mix(yS, yHi, 0.5) + (yHi - yS) * 0.26 * Math.sin(th * 7 + 0.6);
                    const dv = y - yc;
                    put(INK.blue, band(dv, 0.040, 0.014));
                    const n = Noise.fbm2u(th / TAU * 28, y * 1.6, 28, seed + 5, 3);
                    const near = 1 - smooth(0.35, 0.95, Math.abs(dv));
                    put(INK.wash, smooth(0.60, 0.65, n) * near * 0.85);
                    put(INK.blue, (1 - smooth(0.010, 0.022, Math.abs(n - 0.5))) * near);
                }
            }
        }

        return function (k, r, y, th, base) {
            P.r = base[0]; P.g = base[1]; P.b = base[2]; P.a = 0; P.en = 0;
            if (sp.deco === "none") return P;
            if (k === 0) inner(y, th);
            else if (k === 2) outer(r, y, th);
            else if (k === 3 && r > G.rFootOut - 0.14 && y > 0.06) {
                put(INK.blue, band(y - 0.30, 0.028, 0.010));
                put(INK.blue, band(y - 0.48, 0.012, 0.010));
            }
            return P;
        };
    }

    function saraTextures(scene, G, sp, seed) {
        const N = Math.max(64, Math.round(G.saraTex) || 512);
        const n2 = N * N;
        const tab = profileTable(G);
        const rowR = new Float32Array(N), rowY = new Float32Array(N), rowK = new Uint8Array(N);
        for (let y = 0; y < N; y++) {
            const s = profileAt(tab, (y + 0.5) / N);
            rowR[y] = s.r; rowY[y] = s.y; rowK[y] = s.k;
        }
        const paintAt = donPainter(G, sp, seed);
        const col = new Float32Array(n2 * 3), ink = new Float32Array(n2), enam = new Float32Array(n2);
        const spot = new Float32Array(n2), lathe = new Float32Array(n2);
        const A = sp.albedo;
        for (let y = 0; y < N; y++) {
            const wy = rowY[y], rr = rowR[y], k = rowK[y];
            const lz = 0.5 + 0.5 * Math.sin((rr + wy * 0.5) / 0.13 * Math.PI);
            for (let x = 0; x < N; x++) {
                const i = y * N + x;
                const th = (x + 0.5) / N * TAU;
                const wx = rr * Math.cos(th), wz = rr * Math.sin(th);
                const gs = 46.0;
                const gi = Math.floor(wx * gs), gj = Math.floor(wy * gs), gk = Math.floor(wz * gs);
                const h = Noise._h3(gi, gj, gk, seed + 811);
                let s = 0;
                if (h > 0.9955) {
                    const d = Math.hypot(wx - (gi + 0.5) / gs, wy - (gj + 0.5) / gs, wz - (gk + 0.5) / gs) * gs;
                    s = 1 - smooth(0.18, 0.46, d);
                }
                spot[i] = s;
                lathe[i] = lz * (0.6 + 0.4 * Noise.fbm2u(x / N * 7, rr * 0.8, 7, seed + 131, 2));
                const P = paintAt(k, rr, wy, th, A);
                // 呉須のにじみ: 濃さがわずかにむらになる
                const bleed = 0.86 + 0.14 * Noise.fbm2u(x / N * 90, wy * 9, 90, seed + 41, 2);
                const a = P.a * bleed;
                const t = P.a > 1e-4 ? a / P.a : 1;
                col[i * 3] = A[0] + (P.r - A[0]) * t;
                col[i * 3 + 1] = A[1] + (P.g - A[1]) * t;
                col[i * 3 + 2] = A[2] + (P.b - A[2]) * t;
                ink[i] = a; enam[i] = P.en;
            }
        }
        const albedo = TexLab._tex("saraA", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                let c0 = col[i * 3], c1 = col[i * 3 + 1], c2 = col[i * 3 + 2];
                const sp2 = spot[i] * sp.speck;
                c0 += (0.328 - c0) * sp2; c1 += (0.318 - c1) * sp2; c2 += (0.330 - c2) * sp2;
                const lt = lathe[i] * 0.35;
                c0 *= 1 - 0.025 * lt; c1 *= 1 - 0.025 * lt; c2 *= 1 - 0.020 * lt;
                const k = i * 4;
                d[k] = clamp(c0, 0, 1) * 255; d[k + 1] = clamp(c1, 0, 1) * 255;
                d[k + 2] = clamp(c2, 0, 1) * 255; d[k + 3] = 255;
            }
        }, scene, false, true);
        const orm = TexLab._tex("saraO", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const ro = clamp(sp.rough + 0.10 * spot[i] + 0.035 * lathe[i] + 0.06 * enam[i], 0.03, 0.96);
                const k = i * 4;
                d[k] = 255; d[k + 1] = ro * 255; d[k + 2] = 0; d[k + 3] = 255;
            }
        }, scene, true, true);
        const H = new Float32Array(n2);
        for (let i = 0; i < n2; i++) H[i] = clamp(0.5 - 0.30 * lathe[i] - 0.10 * spot[i] + 0.22 * enam[i], 0, 1);
        const normal = TexLab.normalFromHeight("saraN", N, H, 1.0, scene, true);
        const coat = TexLab._tex("saraC", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const w = clamp(0.90 + 0.10 * lathe[i] - 0.35 * spot[i] - 0.10 * enam[i], 0, 1);
                const r2 = clamp(0.42 + 0.24 * lathe[i] + 0.20 * enam[i], 0, 1);
                const k = i * 4;
                d[k] = w * 255; d[k + 1] = r2 * 255; d[k + 2] = 0; d[k + 3] = 255;
            }
        }, scene, true, true);
        return { albedo, orm, normal, coat };
    }

    function saraMaterial(scene, G, sp, name, seed) {
        const t = saraTextures(scene, G, sp, seed);
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = t.albedo;
        m.metallic = 0.0;
        m.roughness = 1.0;
        m.metallicTexture = t.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = t.normal;
        m.bumpTexture.level = 0.50;
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = t.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        m.clearCoat.intensity = sp.coat;
        m.clearCoat.roughness = sp.coatRough;
        m.clearCoat.indexOfRefraction = 1.52;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.12;
        m.subSurface.tintColor = col3([0.92, 0.92, 0.94]);
        m.subSurface.minimumThickness = 0.02;
        m.subSurface.maximumThickness = 0.40;
        m.texs = [t.albedo, t.orm, t.normal, t.coat];
        return m;
    }

    function sweepInto(acc, path, ups, sec, caps, colorFn) {
        const n = path.length;
        const K = sec(0).length;
        const base = acc.nV;
        const T = [], Nn = [], Bb = [];
        let prevN = null;
        for (let i = 0; i < n; i++) {
            const a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
            let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
            const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
            let ux, uy, uz;
            if (ups) { ux = ups[i][0]; uy = ups[i][1]; uz = ups[i][2]; }
            else if (prevN) { ux = prevN[0]; uy = prevN[1]; uz = prevN[2]; }
            else { ux = 0; uy = 1; uz = 0; if (Math.abs(ty) > 0.95) { ux = 1; uy = 0; } }
            const d = ux * tx + uy * ty + uz * tz;
            let nx = ux - d * tx, ny = uy - d * ty, nz = uz - d * tz;
            let nl = Math.hypot(nx, ny, nz);
            if (nl < 1e-6) {           // 上向きが接線と平行。前の法線を使う
                if (prevN) { nx = prevN[0]; ny = prevN[1]; nz = prevN[2]; }
                else { nx = 1; ny = 0; nz = 0; }
                nl = Math.hypot(nx, ny, nz) || 1;
            }
            nx /= nl; ny /= nl; nz /= nl;
            const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
            T.push([tx, ty, tz]); Nn.push([nx, ny, nz]); Bb.push([bx, by, bz]);
            prevN = [nx, ny, nz];
        }
        for (let i = 0; i < n; i++) {
            const s = sec(i), p = path[i], N = Nn[i], B = Bb[i];
            for (let k = 0; k < K; k++) {
                const a = s[k][0], b = s[k][1];
                acc.pos.push(p[0] + B[0] * a + N[0] * b, p[1] + B[1] * a + N[1] * b, p[2] + B[2] * a + N[2] * b);
                const ol = Math.hypot(a, b) || 1;
                acc.off.push((B[0] * a + N[0] * b) / ol, (B[1] * a + N[1] * b) / ol, (B[2] * a + N[2] * b) / ol);
                if (colorFn) { const c = colorFn(i / Math.max(1, n - 1), k, K); acc.col.push(c[0], c[1], c[2]); }
                acc.uv.push(k / K, i / Math.max(1, n - 1));
            }
        }
        for (let i = 0; i < n - 1; i++) {
            for (let k = 0; k < K; k++) {
                const a = base + i * K + k, b = base + i * K + (k + 1) % K;
                const c = a + K, d = b + K;
                acc.idx.push(a, c, b, b, c, d);
            }
        }
        acc.nV += n * K;
        if (caps) {
            for (let e = 0; e < 2; e++) {
                const i = e ? n - 1 : 0, p = path[i], t = T[i], sg = e ? 1 : -1;
                const ci = acc.nV;
                acc.pos.push(p[0], p[1], p[2]);
                acc.off.push(t[0] * sg, t[1] * sg, t[2] * sg);
                if (colorFn) { const c = colorFn(e, -1, K); acc.col.push(c[0], c[1], c[2]); }
                acc.uv.push(0.5, e);
                acc.nV++;
                const fb = acc.nV;
                const ring = base + i * K;
                for (let k = 0; k < K; k++) {
                    const q = ring + k;
                    acc.pos.push(acc.pos[q * 3], acc.pos[q * 3 + 1], acc.pos[q * 3 + 2]);
                    acc.off.push(t[0] * sg, t[1] * sg, t[2] * sg);
                    if (colorFn) { const c = colorFn(e, -1, K); acc.col.push(c[0], c[1], c[2]); }
                    acc.uv.push(0.5, e);
                }
                acc.nV += K;
                for (let k = 0; k < K; k++) {
                    const a = fb + k, b = fb + (k + 1) % K;
                    if (e) acc.idx.push(ci, a, b); else acc.idx.push(ci, b, a);
                }
            }
        }
    }
    function newAcc() { return { nV: 0, pos: [], off: [], col: [], uv: [], idx: [] }; }
    function roundRect(ha, hb, rr, nc) {
        const pts = [];
        rr = Math.min(rr, ha * 0.98, hb * 0.98);
        const cs = [[ha - rr, hb - rr, 0], [-(ha - rr), hb - rr, 1], [-(ha - rr), -(hb - rr), 2], [ha - rr, -(hb - rr), 3]];
        for (const c of cs) {
            for (let j = 0; j <= nc; j++) {
                const a = (c[2] + j / nc) * Math.PI * 0.5;
                pts.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
            }
        }
        return pts;
    }

    // ---- 牛肉（牛丼用のバラ薄切り）-------------------------------------
    // 写真の牛肉: 明るい所 sRGB(0.62,0.42,0.26)、溝 (0.24,0.12,0.04)。
    // 【対策】生姜焼きの豚より小さく、よく縮れていて、灰色がかった茶色。
    //         焼き色ではなく「煮た」色なので sear/deep の差は小さくし、
    //         白い脂（バラのさし）を多めに入れる。濃さはつゆの膜で出す
    const BEEF = {
        label: "牛バラ薄切り",
        size: 1.62,
        thick: 0.095,
        // 【対策】素の色を写真の明るさに合わせると、膜が乗って二重に暗くなる。
        //         素の色は写真より一段明るい「煮た牛肉」の灰茶色にし、濃さは膜に任せる
        lean: [0.700, 0.505, 0.360],
        sear: [0.560, 0.380, 0.250],
        deep: [0.470, 0.300, 0.185],
        fat: [0.880, 0.760, 0.590],
        fatSear: [0.790, 0.640, 0.460],
        fatAmt: 0.36,
        capProb: 0.40,
        rough: 0.50, coat: 0.92, coatRough: 0.10,
        trans: 0.16, thick3: 0.16,
        transTint: [0.62, 0.30, 0.16],
        wetBody: 1.10, wetSear: 1.30, wetFat: 0.60,
        bump: 0.50
    };

    // Thin simmered belly slices: closed crumpled sheets with longitudinal fat seams.
    // Dimensions are centimetres; both faces share the same cooked colour (no searing).
    function buildBeefSheet(sc, q, cx, cz, seed) {
        const M = BEEF, rng = new Rng(seed >>> 0);
        const NU = 44, NV = 18, per = (NU + 1) * (NV + 1), nV = per * 2;
        const positions = new Float32Array(nV * 3), offs = new Float32Array(nV * 3);
        const base = new Float32Array(nV * 3), wet = new Float32Array(nV);
        const uvs = new Float32Array(nV * 2), idx = [];
        const length = rng.range(1.0, 1.55), width = rng.range(.55, .82);
        const phase = rng.range(0, TAU), folds = rng.range(1.2, 2.4);
        // 【対策】振幅が小さいと平らな切れ端が敷き詰まってフレークに見える。
        //         鍋の中で縮れた薄切りは大きくうねり、片端が内へ巻き込んでいる
        const amplitude = rng.range(.11, .19), curl = rng.range(-.16, .18);
        const tuck = rng.next() < .50 ? rng.range(.22, .48) * (rng.next() < .5 ? -1 : 1) : 0;
        const fatSide = rng.next() < .5 ? -1 : 1, tint = rng.range(-.035,.035);
        function surface(u,v) {
            const edge = Math.pow(Math.abs(v), 2.5);
            const taper = .68 + .32 * Math.pow(Math.max(0,1-u*u), .35);
            const rag = 1 + .11 * Math.sin(u*21+phase) + .055 * Math.sin(u*39-phase);
            const x = length * (u*.82 + .065*Math.sin(u*7+phase));
            const z = width * v * taper * rag + .09*Math.sin(u*5+phase);
            const h = amplitude * Math.sin(u*folds*Math.PI + v*1.5+phase)
                + .04*Math.sin(u*11-v*3+phase)
                + edge * (.045*Math.sin(u*18+phase) + curl)
                + .04*Math.sin(v*7+u*5) + .045*u*u
                + .028*Math.sin(u*27+v*9+phase*2) + .018*Math.sin(v*23-u*13+phase)
                + tuck * Math.pow(Math.max(0, Math.abs(u) - .45), 2) * (u > 0 ? 1 : .35);
            return [x,h,z];
        }
        function fatAt(u,v) {
            const noise = Noise.fbm2(u*5+12,v*3+7,seed+21,2);
            const seam = v + .18*Math.sin(u*7+phase) + .15*(noise-.5);
            const band = 1-smooth(.07,.17,Math.abs(seam-.28*fatSide));
            const edge = smooth(.70,.94,v*fatSide+.12*Math.sin(u*9+phase));
            const fine = (1-smooth(.035,.09,Math.abs(seam+.50*fatSide)))*.65;
            return clamp(Math.max(band,edge,fine)*(.50+.50*noise),0,1);
        }
        for(let side=0;side<2;side++) for(let i=0;i<=NU;i++) for(let j=0;j<=NV;j++) {
            const u=i/NU*2-1, v=j/NV*2-1, p=surface(u,v), e=.001;
            const a=surface(u+e,v), b=surface(u,v+e);
            const ax=a[0]-p[0], ay=a[1]-p[1], az=a[2]-p[2];
            const bx=b[0]-p[0], by=b[1]-p[1], bz=b[2]-p[2];
            let nx=az*by-ay*bz, ny=ax*bz-az*bx, nz=ay*bx-ax*by;
            const nl=Math.hypot(nx,ny,nz)||1; nx/=nl; ny/=nl; nz/=nl;
            const k=side*per+i*(NV+1)+j, o=k*3, fat=fatAt(u,v);
            const sign=side?-1:1, half=M.thick/M.size*(.42+.14*fat);
            // 上面（火が通ってつゆに浸かった側）は少し濃い
            const faceK = side ? 1.0 : 0.90;
            positions[o]=p[0]+nx*half*sign; positions[o+1]=p[1]+ny*half*sign; positions[o+2]=p[2]+nz*half*sign;
            offs[o]=nx*sign; offs[o+1]=ny*sign; offs[o+2]=nz*sign;
            const variation=Noise.fbm2(u*3+8,v*4+2,seed+31,3);
            let c=mix3(M.lean,M.sear,smooth(.22,.82,variation)*.65);
            const fc=mix3(M.fat,M.fatSear,smooth(.25,.85,variation)*.45);
            c=mix3(c,fc,fat);
            for(let d=0;d<3;d++) base[o+d]=clamp((c[d]+tint*(1-fat))*(fat>.5?1:faceK),0,1);
            wet[k]=mix(M.wetBody,M.wetFat,fat);
            uvs[k*2]=(u+1)*.85; uvs[k*2+1]=(v+1)*.65;
        }
        for(let s=0;s<2;s++) for(let i=0;i<NU;i++) for(let j=0;j<NV;j++) {
            const a=s*per+i*(NV+1)+j,b=a+NV+1;
            if(s===0)idx.push(a,a+1,b,a+1,b+1,b); else idx.push(a,b,a+1,a+1,b,b+1);
        }
        function close(a,b){idx.push(a,b,a+per,b,b+per,a+per);}
        for(let i=0;i<NU;i++){close(i*(NV+1),(i+1)*(NV+1));close((i+1)*(NV+1)+NV,i*(NV+1)+NV);}
        for(let j=0;j<NV;j++){close(j+1,j);close(NU*(NV+1)+j,NU*(NV+1)+j+1);}
        const indices=new Uint32Array(idx), normals=finalizeOff(positions,indices,offs);
        applyPose(positions,normals,nV,q,M.size*sc,cx,cz);
        return {kind:'meat',seed,spec:M,nV,positions,indices,normals,uvs,base,wet,drape:0};
    }

    function beefNormalTex(scene) {
        const N = 512, n2 = N * N, H = new Float32Array(n2);
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const u = x / N, v = y / N;
                const fib = Noise.fbm2p(u * 6, v * 48, 6, 48, 501, 3);
                const wr = Noise.fbm2p(u * 9, v * 9, 9, 9, 517, 3);
                const gr = Noise.fbm2p(u * 64, v * 64, 64, 64, 523, 1);
                H[y * N + x] = clamp(0.5 + (fib - 0.5) * 0.55 + (wr - 0.5) * 0.70 + (gr - 0.5) * 0.18, 0, 1);
            }
        }
        return TexLab.normalFromHeight("beefN", N, H, 7.0, scene, false);
    }

    // ---- 玉ねぎ（牛丼: つゆで煮たくし切り）-----------------------------
    // 写真の玉ねぎ: (0.90,0.75,0.45)〜(0.92,0.80,0.55)。炒めた飴色より淡く、
    // 透き通っていて、肉より厚くぷっくりしている
    // 生姜焼き.js の玉ねぎをそのまま使う（飴色・薄い層・両端が尖って焼け色、
    // drape で山に沿って垂れる）。牛丼用の平たい版は廃止
    const ONION = {
        label: "玉ねぎ",
        // 写真1・3の測色（ハイライトを除いた中央値、皿の白で正規化）
        // 【対策】乳白（0.905,0.855,0.735）だと生の玉ねぎかエリンギに見える。
        //         炒めてタレを吸った玉ねぎは飴色で、写真1の実測は
        //         (0.80,0.60,0.37)〜(0.84,0.66,0.48)。白いのは切り口の細胞だけ
        body: [0.865, 0.690, 0.445],             // 層の面（飴色）
        deep: [0.700, 0.470, 0.240],             // 厚い所・重なりの奥
        cut: [0.930, 0.840, 0.660],              // 包丁の切り口
        gold: [0.760, 0.470, 0.210],             // 焼けた端（濃い飴色）
        rough: 0.24, coat: 1.00, coatRough: 0.045,
        trans: 0.92, thick3: 0.30,
        transTint: [0.96, 0.66, 0.30],           // 透過光は飴色に染まる
        see: 0.38,                               // 下の肉が透けて見える強さ
        seeTint: [1.00, 0.80, 0.52],
        // 【対策】肉と同じだけタレを絡めると、膜のムラが橙のまだらになる。
        //         飴色は素の色で出し、タレは薄い膜として乗せる
        wetBody: 0.45, wetCut: 0.65, wetTip: 1.10
    };

    // 曲面に沿った断面。a: 幅方向（周方向）、b: 厚み方向（外向き）。
    // 幅方向は層の球面に合わせて反らせる（sag = a²/2ρ）
    function onionSection(hw, ht, rho, nE) {
        const pts = [], kind = [];
        const rr = Math.min(ht * 0.95, hw * 0.3), nc = 3;
        const sag = (a) => -(a * a) / (2 * Math.max(0.3, rho));
        // 外の面: +hw → -hw
        for (let j = 0; j <= nE; j++) {
            const a = mix(hw - rr, -(hw - rr), j / nE);
            pts.push([a, ht + sag(a)]); kind.push(0);
        }
        // 左の切り口（丸め）
        for (let j = 1; j < nc * 2; j++) {
            const ang = Math.PI * 0.5 + j / (nc * 2) * Math.PI;
            const a = -(hw - rr) + Math.cos(ang) * rr;
            pts.push([a, Math.sin(ang) * ht + sag(-(hw - rr))]); kind.push(1);
        }
        // 内の面: -hw → +hw
        for (let j = 0; j <= nE; j++) {
            const a = mix(-(hw - rr), hw - rr, j / nE);
            pts.push([a, -ht + sag(a)]); kind.push(2);
        }
        // 右の切り口
        for (let j = 1; j < nc * 2; j++) {
            const ang = -Math.PI * 0.5 + j / (nc * 2) * Math.PI;
            const a = (hw - rr) + Math.cos(ang) * rr;
            pts.push([a, Math.sin(ang) * ht + sag(hw - rr)]); kind.push(1);
        }
        return { pts, kind };
    }

    function buildOnionStrip(sc, q, cx, cz, seed) {
        const O = ONION, rng = new Rng(seed >>> 0);
        // 層の赤道半径と扁平率。外側の層ほど大きく厚い
        const R0 = rng.range(1.90, 3.10) * sc;
        const flat = rng.range(0.80, 0.92);
        const tw = rng.range(0.17, 0.27);               // くし切りの半角 [rad]
        // 経線の範囲。根元と芽の側は切り落とされているので極までは届かない
        const brk = rng.next();
        let psi0 = rng.range(0.10, 0.32), psi1 = Math.PI - rng.range(0.10, 0.32);
        if (brk < 0.30) {                               // 途中で折れた短い片
            if (rng.next() < 0.5) psi1 = rng.range(1.55, 2.2); else psi0 = rng.range(0.95, 1.6);
        }
        // 剥がれずに付いている層の数
        // 【対策】生姜焼きでは「剥がれずにくっついた層」を 2〜3 枚入れ子で置いて
        //         いたが、牛丼ではつゆで煮て層がばらけるので、どの片も 1 層だけ。
        //         2 層にすると、わずかにずれた 2 枚が並んで「重なって見える」
        const nLay = 1;
        const NL = 40, nE = 6;
        const nSeed = seed + 313;
        const acc = newAcc();
        const kindArr = [], tArr = [];
        // 火が通ってしなる: 経線のうねりとわずかなねじれ
        const wob = rng.range(0.02, 0.06), ph = rng.range(0, TAU);
        const bowZ = rng.gauss(0, 0.10);
        for (let L = 0; L < nLay; L++) {
            const ht = rng.range(0.065, 0.095);          // 層の厚みの半分（≒1.5mm 厚。火が通って薄くなる）
            const R = R0 - L * (ht * 2 + 0.02);           // 内側の層はすぐ内に入れ子
            const H = R * flat;
            // 内側の層ほど少し短く、ずれる
            const p0 = psi0 + L * rng.range(0.02, 0.14), p1 = psi1 - L * rng.range(0.02, 0.14);
            const path = [], ups = [], rhos = [];
            for (let i = 0; i < NL; i++) {
                const t = i / (NL - 1);
                const psi = mix(p0, p1, t);
                const w = 1 + wob * Math.sin(psi * 2.7 + ph);
                const rho = R * Math.sin(psi) * w;
                const y = H * Math.cos(psi);
                const z = bowZ * Math.sin(Math.PI * t) * R * 0.2;
                path.push([rho, y, z]);
                // 外向き＝楕円の法線
                const nx = Math.sin(psi) / R, ny = Math.cos(psi) / H;
                const nl = Math.hypot(nx, ny);
                ups.push([nx / nl, ny / nl, 0]);
                rhos.push(Math.max(0.35, rho));
            }
            const secs = [];
            let kinds = null;
            for (let i = 0; i < NL; i++) {
                const t = i / (NL - 1);
                // 幅は ρ·tw。極へ向かって細るが、切り落とした端は尖りきらない
                // 【対策】ρ·tw だけだと、切り落とした端が四角い板の小口になる。
                //         写真の片は両端が葉の先のように尖っているので、端で絞る
                const taper = 0.22 + 0.78 * Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 0.55);
                const hw = Math.max(0.05, rhos[i] * tw * taper);
                // 端は焼けて縮み、薄くなる
                const e = Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 0.30);
                const s = onionSection(hw, ht * (0.55 + 0.45 * e), rhos[i], nE);
                secs.push(s.pts); kinds = s.kind;
            }
            const K = kinds.length;
            sweepInto(acc, path, ups, (i) => secs[i], 1, (t, k) => {
                const kd = k < 0 ? 1 : kinds[k];
                kindArr.push(kd); tArr.push(t);
                // 長手の筋（層の維管束）と、層ごとの濃淡
                const ak = k < 0 ? 0 : k / K;
                const vein = Noise.v2(ak * 23 + L * 7, t * 2.0, nSeed + 5);
                const sh = Noise.fbm2(t * 4 + L * 3, ak * 3, nSeed + 9, 2);
                let c;
                if (kd === 1) c = O.cut;
                else {
                    // 外の面は乳白、内の面（重なりの奥）は向こうが透けて少し沈む
                    // 【対策】筋が弱いと「乳白の板」になる。煮えた玉ねぎは、白く濁った
                    //         細胞の帯と、透き通って下が沈んで見える帯が交互に走る
                    c = mix3(O.body, O.deep, (kd === 2 ? 0.25 : 0.06) + 0.22 * smooth(0.50, 0.85, sh));
                    c = mix3(c, O.deep, (1 - smooth(0.15, 0.45, vein)) * 0.40);
                    c = mix3(c, O.cut, smooth(0.60, 0.88, vein) * 0.55);
                }
                // 両端と縁は焼けて金色
                const tip = 1 - smooth(0.0, 0.16 + 0.10 * sh, Math.min(t, 1 - t));
                c = mix3(c, O.gold, tip * (0.55 + 0.35 * sh));
                return c;
            });
        }
        const nV = acc.nV;
        const positions = new Float32Array(acc.pos);
        const offs = new Float32Array(acc.off);
        // 【対策】経線は y 軸（玉ねぎの芯）に沿って立っているので、そのまま
        //         置くと縁で立つ。弦を x に、ふくらみを y に回して寝かせる。
        //         x と y の入れ替えは鏡映なので、巻き順は finalizeOff に任せる
        //         （offs も同じ変換を受けるので判定はそのまま正しい）
        const cave = rng.next() < 0.40 ? -1 : 1;       // 4 割は伏せた舟形
        const squash = rng.range(0.50, 0.85);          // 火が通って反りが緩む
        for (let i = 0; i < nV; i++) {
            const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
            positions[i * 3] = y; positions[i * 3 + 1] = x * squash * cave; positions[i * 3 + 2] = z * cave;
            const ox = offs[i * 3], oy = offs[i * 3 + 1], oz = offs[i * 3 + 2];
            offs[i * 3] = oy; offs[i * 3 + 1] = ox * cave; offs[i * 3 + 2] = oz * cave;
        }
        const indices = new Uint32Array(acc.idx);
        const normals = finalizeOff(positions, indices, offs);
        const base = new Float32Array(acc.col);
        const wet = new Float32Array(nV);
        for (let i = 0; i < nV; i++) {
            const tip = 1 - smooth(0.0, 0.18, Math.min(tArr[i], 1 - tArr[i]));
            wet[i] = mix(kindArr[i] === 1 ? O.wetCut : O.wetBody, O.wetTip, tip);
        }
        let mx = 0, my = 0, mz = 0;
        for (let i = 0; i < nV; i++) { mx += positions[i * 3]; my += positions[i * 3 + 1]; mz += positions[i * 3 + 2]; }
        mx /= nV; my /= nV; mz /= nV;
        for (let i = 0; i < nV; i++) { positions[i * 3] -= mx; positions[i * 3 + 1] -= my; positions[i * 3 + 2] -= mz; }
        applyPose(positions, normals, nV, q, 1.0, cx, cz);
        return {
            kind: "onion", seed, spec: O, nV, positions, indices, normals,
            // 【対策】drape 0.75 は生姜焼きの平らな豚肉の上での値。牛丼の縮れた牛肉の
            //         上で同じだけ垂らすと、片が凹凸に引き伸ばされて溶けたように歪む
            uvs: new Float32Array(acc.uv), base, wet, drape: 0.22, seeThrough: true, rigid: true
        };
    }

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
            this.occ = new Uint8Array(m);
            // 硬い具（玉ねぎ）の上面。これだけは沈み込みを許さない
            this.hard = new Float32Array(m).fill(-1e9);
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

        probe(pos, idx, ox, oz, G, rigid) {
            const sc = this.scratch, n = this.n;
            const touched = [];
            this._raster(pos, idx, ox, oz, (k, y) => {
                if (sc[k] > 1e8) touched.push(k);
                if (y < sc[k]) sc[k] = y;
            });
            if (!touched.length) return { dy: 0, cells: 0 };
            let dFloor = -1e9;
            const need = new Float64Array(touched.length);
            for (let i = 0; i < touched.length; i++) {
                const k = touched[i];
                const b = sc[k];
                need[i] = this.topY[k] - b;
                const f = this.floor[k] - b;
                if (f > dFloor) dFloor = f;
            }
            // 【対策】玉ねぎの上面（hard）を置き場所全体で下回らない、という
            //         制約にすると、肉 1 枚が玉ねぎの最高点まで持ち上がって
            //         宙に浮く。ここでは沈み込みを許し、貫通は liftHard で
            //         局所的に直す。硬い具（玉ねぎ）自身は最大値で置く
            need.sort();
            const q = rigid ? 0.92 : G.liftQuantile;   // 硬い具も少しは肉のあいだに沈む
            const qi = clamp(Math.floor(need.length * q), 0, need.length - 1);
            const dPile = need[qi] - (rigid ? 0.0 : G.settle);
            for (const k of touched) sc[k] = 1e9;         // 触った所だけ戻す
            return { dy: Math.max(dFloor, dPile), cells: touched.length };
        }

        deposit(pos, idx, base, mark, hard) {
            this._raster(pos, idx, 0, 0, (k, y, l0, l1, l2, i0, i1, i2) => {
                if (mark) this.occ[k] = 1;
                if (hard && y > this.hard[k]) this.hard[k] = y;
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

        buildDistance() {
            const n = this.n, m = n * n, cell = this.cell;
            const D = new Float32Array(m).fill(1e9);
            for (let i = 0; i < m; i++) if (this.occ[i]) D[i] = 0;
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
                out.y = -1e9; out.fy = -1e9; out.r = out.g = out.b = 0; out.d = 1e8; return out;
            }
            const tx = fx - ix, tz = fz - iz;
            const k00 = iz * n + ix, k10 = k00 + 1, k01 = k00 + n, k11 = k01 + 1;
            const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
            out.y = Math.max(Math.max(this.topY[k00], this.topY[k10]),
                Math.max(this.topY[k01], this.topY[k11]));
            out.fy = this.floor[k00] * w00 + this.floor[k10] * w10
                + this.floor[k01] * w01 + this.floor[k11] * w11;
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

        drape(pos, idx, nV, k, clear, R) {
            R = R || 5;
            const n = this.n;
            let gx0 = n, gx1 = -1, gz0 = n, gz1 = -1;
            for (let i = 0; i < nV; i++) {
                const gx = Math.round(this._gx(pos[i * 3])), gz = Math.round(this._gx(pos[i * 3 + 2]));
                if (gx < gx0) gx0 = gx; if (gx > gx1) gx1 = gx; if (gz < gz0) gz0 = gz; if (gz > gz1) gz1 = gz;
            }
            gx0 = Math.max(0, gx0 - 1); gz0 = Math.max(0, gz0 - 1);
            gx1 = Math.min(n - 1, gx1 + 1); gz1 = Math.min(n - 1, gz1 + 1);
            const w = gx1 - gx0 + 1, h = gz1 - gz0 + 1;
            if (w <= 0 || h <= 0) return;
            const minY = new Float32Array(w * h).fill(1e9);
            this._raster(pos, idx, 0, 0, (kk, y) => {
                const x = kk % n - gx0, z = ((kk / n) | 0) - gz0;
                if (x < 0 || z < 0 || x >= w || z >= h) return;
                const j = z * w + x; if (y < minY[j]) minY[j] = y;
            });
            let D = new Float32Array(w * h), V = new Float32Array(w * h);
            for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
                const j = z * w + x;
                if (minY[j] > 1e8) continue;
                V[j] = 1;
                // 【対策】高い支えから大きく垂れる所を一度に下げると、頂点が
                //         真下へ動くだけなので肉が縦に引き伸ばされ、溶けた飴に
                //         なる。1 回で下げる量に上限を置き、浮きの大半だけ詰める
                D[j] = Math.min(0.60, Math.max(0, minY[j] - this.topY[(z + gz0) * n + x + gx0] - clear));
            }
            const filt = (src, rad, useMin) => {
                const out = new Float32Array(w * h);
                for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
                    let s = 0, c = 0, mn = 1e9;
                    for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
                        const xx = x + dx, zz = z + dz;
                        if (xx < 0 || zz < 0 || xx >= w || zz >= h) continue;
                        const j = zz * w + xx; if (!V[j]) continue;
                        s += src[j]; c++; if (src[j] < mn) mn = src[j];
                    }
                    out[z * w + x] = c ? (useMin ? mn : s / c) : 0;
                }
                return out;
            };
            // 最小値とぼかしは同じ半径にすること（ぼかしが広いと保証が崩れる）
            D = filt(D, R, true);
            for (let pass = 0; pass < 2; pass++) D = filt(D, R, false);
            let sum = 0, cnt = 0;
            for (let j = 0; j < w * h; j++) if (V[j]) { sum += D[j]; cnt++; }
            for (let i = 0; i < nV; i++) {
                const x = Math.round(this._gx(pos[i * 3])) - gx0, z = Math.round(this._gx(pos[i * 3 + 2])) - gz0;
                if (x < 0 || z < 0 || x >= w || z >= h) continue;
                pos[i * 3 + 1] -= D[z * w + x] * k;
            }
            return cnt ? sum / cnt * k : 0;
        }

        // 硬い具（玉ねぎ）を貫いた所だけを押し上げる。
        // 【対策】全部の具を相手にすると、押し上げが連鎖して山が塔になる。
        //         相手を玉ねぎの上面（hard）だけに絞れば、押し上げ量は玉ねぎの
        //         反りの高さ（数 mm）で頭打ちになる。最大値フィルタ → 同半径の
        //         ぼかし、の順なので、ぼかした後も必要量を下回らない
        liftHard(pos, idx, nV, clear) {
            const n = this.n, R = 4;
            let gx0 = n, gx1 = -1, gz0 = n, gz1 = -1;
            for (let i = 0; i < nV; i++) {
                const gx = Math.round(this._gx(pos[i * 3])), gz = Math.round(this._gx(pos[i * 3 + 2]));
                if (gx < gx0) gx0 = gx; if (gx > gx1) gx1 = gx; if (gz < gz0) gz0 = gz; if (gz > gz1) gz1 = gz;
            }
            gx0 = Math.max(0, gx0 - R); gz0 = Math.max(0, gz0 - R);
            gx1 = Math.min(n - 1, gx1 + R); gz1 = Math.min(n - 1, gz1 + R);
            const w = gx1 - gx0 + 1, h = gz1 - gz0 + 1;
            if (w <= 0 || h <= 0) return 0;
            const minY = new Float32Array(w * h).fill(1e9);
            this._raster(pos, idx, 0, 0, (kk, y) => {
                const x = kk % n - gx0, z = ((kk / n) | 0) - gz0;
                if (x < 0 || z < 0 || x >= w || z >= h) return;
                const j = z * w + x; if (y < minY[j]) minY[j] = y;
            });
            let U = new Float32Array(w * h), any = 0;
            for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
                const j = z * w + x, hv = this.hard[(z + gz0) * n + x + gx0];
                if (minY[j] > 1e8 || hv < -1e8) continue;
                U[j] = Math.max(0, hv + clear - minY[j]);
                if (U[j] > any) any = U[j];
            }
            if (any <= 0) return 0;
            const filt = (src, useMax) => {
                const out = new Float32Array(w * h);
                for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
                    let s2 = 0, c = 0, mx = 0;
                    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
                        const xx = x + dx, zz = z + dz;
                        if (xx < 0 || zz < 0 || xx >= w || zz >= h) continue;
                        const v = src[zz * w + xx]; s2 += v; c++; if (v > mx) mx = v;
                    }
                    out[z * w + x] = useMax ? mx : s2 / c;
                }
                return out;
            };
            U = filt(filt(U, true), false);
            for (let i = 0; i < nV; i++) {
                const x = Math.round(this._gx(pos[i * 3])) - gx0, z = Math.round(this._gx(pos[i * 3 + 2])) - gz0;
                if (x < 0 || z < 0 || x >= w || z >= h) continue;
                pos[i * 3 + 1] += U[z * w + x];
            }
            return any;
        }

        // 置いた具の下のすき間の平均 [cm]（浮きの検査用）
        gapOf(pos, idx) {
            const n = this.n, m = new Map();
            this._raster(pos, idx, 0, 0, (kk, y) => { const v = m.get(kk); if (v === undefined || y < v) m.set(kk, y); });
            let s2 = 0, c = 0;
            for (const [kk, y] of m) { s2 += Math.max(0, y - this.topY[kk]); c++; }
            return c ? s2 / c : 0;
        }

        distAt(x, z) {
            const n = this.n;
            const fx = this._gx(x), fz = this._gx(z);
            const ix = Math.floor(fx), iz = Math.floor(fz);
            if (!this.dist || ix < 0 || iz < 0 || ix >= n - 1 || iz >= n - 1) return 1e8;
            const tx = fx - ix, tz = fz - iz, k = iz * n + ix, D = this.dist;
            return mix(mix(D[k], D[k + 1], tx), mix(D[k + n], D[k + n + 1], tx), tz);
        }
    }

    function fitInsidePlate(pos, nV, G, margin) {
        for (let pass = 0; pass < 12; pass++) {
            let worst = 0, wx = 0, wz = 0;
            for (let i = 0; i < nV; i++) {
                const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
                const r = Math.hypot(x, z);
                if (r < 1e-6) continue;
                const over = r - (innerRadiusAt(G, y) - margin);
                if (over > worst) { worst = over; wx = x / r; wz = z / r; }
            }
            if (worst <= 1e-4) return pass;
            for (let i = 0; i < nV; i++) { pos[i * 3] -= wx * worst; pos[i * 3 + 2] -= wz * worst; }
        }
        return 12;
    }

    function dropPiece(field, piece, G, rng, cx, cz, spread, mc) {
        const pos = piece.positions, idx = piece.indices, nV = piece.nV;
        let rLocal = 0;
        for (let i = 0; i < nV; i++) {
            const dx = pos[i * 3] - cx, dz = pos[i * 3 + 2] - cz;
            rLocal = Math.max(rLocal, dx * dx + dz * dz);
        }
        rLocal = Math.sqrt(rLocal);
        let bestDy = 1e9, bestOx = 0, bestOz = 0, found = false;
        for (let t = 0; t < G.tryPos; t++) {
            const a = rng.range(0, TAU), rr = rng.range(0, spread);
            const ox = t === 0 ? 0 : Math.cos(a) * rr;
            const oz = t === 0 ? 0 : Math.sin(a) * rr;
            if (t > 0 && Math.hypot(cx + ox - mc[0], cz + oz - mc[1]) + rLocal * 0.5 > G.pileR + 0.6) continue;
            const p = field.probe(pos, idx, ox, oz, G, piece.rigid);
            if (!p.cells) continue;
            if (p.dy < bestDy) { bestDy = p.dy; bestOx = ox; bestOz = oz; found = true; }
        }
        if (!found) {
            const p = field.probe(pos, idx, 0, 0, G, piece.rigid);
            bestDy = p.cells ? p.dy : 0; bestOx = 0; bestOz = 0;
        }
        for (let i = 0; i < nV; i++) {
            pos[i * 3] += bestOx; pos[i * 3 + 1] += bestDy; pos[i * 3 + 2] += bestOz;
        }
        const moved = fitInsidePlate(pos, nV, G, 0.22);
        if (moved > 0) {
            const p2 = field.probe(pos, idx, 0, 0, G, piece.rigid);
            if (p2.cells) shiftY(pos, nV, p2.dy);
            fitInsidePlate(pos, nV, G, 0.22);
        }
        // 垂らす。drape は「最小値フィルタ → ぼかし」なので、どのセルでも
        // 元のすき間以上には下げない＝下の具を貫かない
        // 【対策】垂らしを 1 回・0.8 倍で止めると、玉ねぎや肉の稜線に
        //         引っかかった所のすき間が数 mm〜1cm 残って浮いて見える。
        //         すき間が 0.3mm を切るまで繰り返す（毎回下の具は貫かない）
        if (piece.drape) {
            // 半径を大→小に絞る: 最初に大きく寝かせ（引き伸ばしを防ぐ）、
            // 最後に支えのきわまで寄せる
            for (const R of [6, 4, 3, 2]) field.drape(pos, idx, nV, piece.drape, 0.03, R);
        }
        // 玉ねぎを貫いた所だけ押し上げる
        // Preserve slice thickness and curls; avoid vertex-wise stretching over onion layers.
        if (piece.drape) {
            BABYLON.VertexData.ComputeNormals(pos, idx, piece.normals);
            if (piece.welds) for (const r of piece.welds) weldRange(pos, piece.normals, r[0], r[1]);
        }
        if (typeof __GAP !== "undefined") __GAP.push([piece.kind, field.gapOf(pos, idx)]);
        // 透ける具は、真下にある物の色とすき間を覚えておく（膜を焼くときに使う）
        if (piece.seeThrough) {
            const und = new Float32Array(nV * 4), smp = {};
            for (let i = 0; i < nV; i++) {
                field.sample(pos[i * 3], pos[i * 3 + 2], smp);
                const has = smp.y > smp.fy + 0.004 && (smp.r + smp.g + smp.b) > 0.01;
                und[i * 4] = smp.r; und[i * 4 + 1] = smp.g; und[i * 4 + 2] = smp.b;
                und[i * 4 + 3] = has ? Math.max(0, pos[i * 3 + 1] - smp.y) : 1e3;
            }
            piece.under = und;
        }
        field.deposit(pos, idx, piece.base, true, piece.rigid);
        return bestDy;
    }

    const GLAZE = { soak: 0.16, poolK: 0.85, hazeMix: 0.50 };

    function bakeGlaze(piece, field, sauce, poolY, G, live) {
        const nV = piece.nV, pos = piece.positions, nor = piece.normals;
        const bs = piece.base, wt = piece.wet;
        if (!piece.colors) piece.colors = new Float32Array(nV * 4).fill(1);
        const colors = piece.colors;
        const rd = live.reduce;
        const s0 = sauce.sigma[0] * rd, s1 = sauce.sigma[1] * rd, s2 = sauce.sigma[2] * rd;
        const H0 = s2l(sauce.haze[0]), H1 = s2l(sauce.haze[1]), H2 = s2l(sauce.haze[2]);
        const film = sauce.film * live.wetAmt, pool = sauce.pool * live.wetAmt;
        const drain = sauce.drain, soak = GLAZE.soak;
        for (let i = 0; i < nV; i++) {
            const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
            const ny = nor[i * 3 + 1];
            const h = Math.max(0, y - poolY);
            const drainF = Math.exp(-h / drain);
            const gravF = 0.45 + 0.55 * (ny * 0.5 + 0.5);
            const pk = field ? field.pocket(x, y, z, G) : 0;
            const mn = Noise.fbm3(x * 1.5, y * 1.5, z * 1.5, 4441, 3);
            const mott = 0.30 + 1.50 * smooth(0.28, 0.72, mn);
            let t = wt[i] * mott * (film * drainF * gravF + pool * GLAZE.poolK * pk * (0.45 + 0.55 * drainF));
            if (h <= 0) t = Math.min(t + 0.05, pool * 1.6);
            t = clamp(t, 0, 0.6);
            const p = 1 + soak * wt[i];
            let lr = s2l(clamp(Math.pow(clamp(bs[i * 3], 0, 1), p), 0, 1));
            let lg = s2l(clamp(Math.pow(clamp(bs[i * 3 + 1], 0, 1), p), 0, 1));
            let lb = s2l(clamp(Math.pow(clamp(bs[i * 3 + 2], 0, 1), p), 0, 1));
            const tr = Math.exp(-s0 * 2 * t), tg = Math.exp(-s1 * 2 * t), tb = Math.exp(-s2 * 2 * t);
            lr *= tr; lg *= tg; lb *= tb;
            const hz = (1 - tg) * sauce.hazeK * GLAZE.hazeMix;
            lr += (H0 - lr) * hz; lg += (H1 - lg) * hz; lb += (H2 - lb) * hz;
            // ★ 透けて見える下地。飴色に透き通った玉ねぎは、真下の肉の色を
            //   自分の色で染めて返す。肉の上に乗った所だけ（すき間 4mm まで）
            if (piece.under) {
                const u = piece.under, gap = u[i * 4 + 3];
                const k = piece.spec.see * (1 - smooth(0.0, 0.40, gap)) * smooth(-0.2, 0.5, ny);
                if (k > 0) {
                    // 下の肉もタレを着ているので、素の色より暗く赤い
                    const T = piece.spec.seeTint;
                    const ur = s2l(u[i * 4]) * 0.62 * T[0], ug = s2l(u[i * 4 + 1]) * 0.50 * T[1], ub = s2l(u[i * 4 + 2]) * 0.38 * T[2];
                    lr += (ur * 1.6 - lr) * k; lg += (ug * 1.6 - lg) * k; lb += (ub * 1.6 - lb) * k;
                }
            }
            const o = i * 4;
            colors[o] = lr; colors[o + 1] = lg; colors[o + 2] = lb; colors[o + 3] = 1;
        }
        return colors;
    }

    function pieceMaterial(scene, S, name, sauce, live, bump) {
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0.0;
        m.roughness = S.rough;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = clamp(S.coat * sauce.coat * live.gloss, 0, 1);
        m.clearCoat.roughness = clamp(mix(S.coatRough, sauce.rough, 0.55) / Math.max(0.2, live.gloss), 0.01, 0.7);
        m.clearCoat.indexOfRefraction = 1.42;
        if (bump) {
            m.albedoTexture = beefDetail;
            m.bumpTexture = bump;
            m.bumpTexture.level = S.bump || 0.4;
            m.clearCoat.bumpTexture = bump;
        }
        if(!bump){m.bumpTexture=onionBump;m.bumpTexture.level=.45;m.clearCoat.bumpTexture=null;}
        const sub = m.subSurface;
        sub.isTranslucencyEnabled = true;
        sub.translucencyIntensity = clamp(S.trans * live.trans, 0, 0.95);
        sub.tintColor = col3(S.transTint);
        sub.minimumThickness = 0.02;
        sub.maximumThickness = (S.thick3 !== undefined ? S.thick3 : 0.2);
        m.spec = S;
        return m;
    }

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


    function woodSet(scene, name, size, seed, opt) {
        const N = Math.max(64, Math.round(size) || 512), n2 = N * N;
        const ring = new Float32Array(n2), fine = new Float32Array(n2), knot = new Float32Array(n2);
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

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.032, 0.030, 0.028, 1);

    // Analytic studio cubemap: warm ceiling, window and softbox. No image assets.
    const envSize = 128, envFaces = [];
    const directions = [(u,v)=>[1,-v,-u],(u,v)=>[-1,-v,u],(u,v)=>[u,1,v],
        (u,v)=>[u,-1,-v],(u,v)=>[u,-v,1],(u,v)=>[-u,-v,-1]];
    for (let f=0; f<6; f++) {
        const data = new Float32Array(envSize*envSize*4);
        for (let y=0;y<envSize;y++) for (let x=0;x<envSize;x++) {
            const d=directions[f](2*(x+.5)/envSize-1,2*(y+.5)/envSize-1);
            const len=Math.hypot(...d); const [dx,dy,dz]=d.map(v=>v/len);
            const sky=.17+.32*Math.max(0,dy);
            const window=Math.exp(-Math.pow((dx+.48)/.29,8)-Math.pow((dy-.66)/.30,8)-Math.pow((dz+.54)/.55,8))*5.0;
            const card=Math.exp(-Math.pow((dx-.72)/.17,6)-Math.pow((dy-.40)/.30,6)-Math.pow((dz-.30)/.56,6))*2.2;
            const o=4*(y*envSize+x);
            data[o]=sky+window+card; data[o+1]=sky*.94+window*.98+card*.91;
            data[o+2]=sky*.82+window+card*.78; data[o+3]=1;
        }
        envFaces.push(data);
    }
    const env=new BABYLON.RawCubeTexture(scene,envFaces,envSize,BABYLON.Constants.TEXTUREFORMAT_RGBA,
        BABYLON.Constants.TEXTURETYPE_FLOAT,true,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    env.name="Code-generated studio"; env.gammaSpace=false;
    // A low-frequency diffuse approximation; specular uses the generated cube mipmaps.
    const irradiance=new BABYLON.SphericalPolynomial();
    for(const axis of ["xx","yy","zz"]) irradiance[axis].set(.40,.38,.34);
    env.sphericalPolynomial=irradiance;
    scene.environmentTexture=env; scene.environmentIntensity=.75;

    // =================================================================
    //  ご飯
    // =================================================================
    // 【対策】牛丼のご飯は具の下にほとんど隠れる。見えるのは器の内壁との
    //         あいだの幅 1〜2cm の輪だけなので、粒は輪の中にだけ置き、
    //         具の下は「つゆを吸った下地」の面 1 枚で済ませる。
    //         具の下にまで粒を置くと、薄い肉の下から粒の頭が突き抜ける
    const RICE_Y0 = GLOBAL.rimY - GLOBAL.riceDrop;
    // つゆを吸いきったご飯の色の倍率（リニア）。白飯 sRGB(0.95,0.94,0.90) が
    // 写真の染みた所 (0.78,0.56,0.32) になる比
    const TSUYU_L = [0.640, 0.315, 0.107];

    let _riceR = 0;
    function riceRadius() {
        if (!_riceR) _riceR = innerRadiusAt(GLOBAL, RICE_Y0);
        return _riceR;
    }

    function riceY(x, z) {
        const R = riceRadius();
        const u = clamp(Math.hypot(x, z) / R, 0, 1);
        // 肩の落ちたドーム（指数 1.0）。半球にすると仏飯になる
        const dome = GLOBAL.ricePeak * Math.max(0, 1 - u * u);
        // 縁ではうねりを消して器から浮かないようにする
        const fade = 1 - smooth(0.80, 1.0, u);
        const lump = ((Noise.fbm2(x * 0.50 + 31, z * 0.50 + 17, 777, 2) - 0.5) * 2.0
            + (Noise.v2(x * 1.3 + 7, z * 1.3 + 3, 791) - 0.5) * 1.1) * GLOBAL.riceLump * fade;
        return RICE_Y0 + dome + lump;
    }
    function riceN(x, z) {
        const e = 0.07;
        const dx = (riceY(x + e, z) - riceY(x - e, z)) / (2 * e);
        const dz = (riceY(x, z + e) - riceY(x, z - e)) / (2 * e);
        const n = new V3(-dx, 1, -dz); n.normalize();
        return n;
    }

    function buildGrainMesh(scene) {
        const NT = 10, NS = 8, L = 0.56, hw = 0.142, hh = 0.110;
        const nV = (NT + 1) * (NS + 1);
        const positions = new Float32Array(nV * 3), uvs = new Float32Array(nV * 2);
        const idx = [];
        let vo = 0;
        for (let i = 0; i <= NT; i++) {
            const t = i / NT;
            const pr = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(2 * t - 1), 2.7)), 0.48);
            const x = L * (t - 0.5);
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                positions[vo * 3] = x;
                positions[vo * 3 + 1] = hh * pr * Math.sin(th);
                positions[vo * 3 + 2] = hw * pr * Math.cos(th);
                uvs[vo * 2] = j / NS; uvs[vo * 2 + 1] = t;
                vo++;
            }
        }
        for (let i = 0; i < NT; i++) {
            for (let j = 0; j < NS; j++) {
                const a = i * (NS + 1) + j, b = a + 1, c = a + NS + 1, d = c + 1;
                idx.push(a, c, b, b, c, d);
            }
        }
        const indices = new Uint32Array(idx);
        const normals = finalize(positions, indices, new V3(0, 0, 0), 0, true);
        weldNormals(positions, normals);
        return makeMesh("riceGrain", positions, indices, normals, uvs, null, scene);
    }

    function riceMaterials(scene) {
        const g = new BABYLON.PBRMaterial("riceMat", scene);
        g.albedoColor = col3([0.960, 0.950, 0.925]);
        g.metallic = 0; g.roughness = 0.34;
        // 炊きたての水膜。にじんだ広い照りにする（鋭いと白い錠剤に見える）
        g.clearCoat.isEnabled = true;
        g.clearCoat.intensity = 0.72;
        g.clearCoat.roughness = 0.15;
        g.clearCoat.indexOfRefraction = 1.33;
        g.subSurface.isTranslucencyEnabled = true;
        g.subSurface.translucencyIntensity = 0.28;
        g.subSurface.tintColor = col3([0.99, 0.95, 0.88]);
        g.subSurface.minimumThickness = 0.01;
        g.subSurface.maximumThickness = 0.25;
        const b = new BABYLON.PBRMaterial("riceBodyMat", scene);
        b.albedoColor = new BABYLON.Color3(1, 1, 1);
        b.metallic = 0; b.roughness = 0.78;
        return { grain: g, body: b };
    }

    // つゆの染み。具の縁から距離 d の所でどれだけ吸っているか → 色の倍率
    function stainInto(field, sauce, x, z, out) {
        const d = field.distAt(x, z);
        const n = Noise.fbm2(x * 1.3 + 4, z * 1.3 + 9, 919, 2);
        const reach = Math.max(0.05, sauce.riceSpread * (0.55 + 0.9 * n) * Math.max(0.2, live.wetAmt));
        let s = sauce.riceSoak * Math.min(1.6, live.wetAmt) * (1 - smooth(0.0, reach, d));
        s = clamp(s, 0, 1) * live.reduce;
        out[0] = Math.pow(TSUYU_L[0], s); out[1] = Math.pow(TSUYU_L[1], s); out[2] = Math.pow(TSUYU_L[2], s);
        return out;
    }

    function buildRice(st, scene, mats) {
        const G = GLOBAL, R = riceRadius(), field = st.field;
        const rng = new Rng((currentSeed ^ 0x51CE) >>> 0);
        const rMin = 0, rMax = R - 0.10;
        const grains = [];
        const mtx = [];
        const M = new BABYLON.Matrix(), Q = BABYLON.Quaternion;
        // 具が無いときは見える面積が約 1.8 倍になるので、粒の数も増やす
        const nTarget = Math.round(G.riceN * (1 + 0.8 * (1 - Math.min(1, st.pieces.length / 60))));
        // 【対策】1 粒ずつ独立に撒くと統計的に均一な絨毯になる。実物のご飯は
        //         数粒がくっついた塊と、そのあいだの空隙でできている。
        //         3 粒ずつ同じ中心のまわりに寄せて置く
        const upV = new V3(0, 1, 0);
        let ccx = 0, ccz = 0, cleft = 0;
        for (let tries = 0; tries < nTarget * 4 && grains.length < nTarget; tries++) {
            if (cleft <= 0) {
                const rc = Math.sqrt(mix(rMin * rMin, rMax * rMax, rng.next())), ac = rng.range(0, TAU);
                ccx = Math.cos(ac) * rc; ccz = Math.sin(ac) * rc; cleft = 3;
            }
            cleft--;
            const oa = rng.range(0, TAU), od = rng.range(0, 0.34);
            let x = ccx + Math.cos(oa) * od, z = ccz + Math.sin(oa) * od;
            let r = Math.hypot(x, z);
            if (r > rMax) { x *= rMax / r; z *= rMax / r; r = rMax; }
            const a = Math.atan2(z, x);
            const y0 = riceY(x, z);
            if (field.topAt(x, z) > y0 + 0.05) continue;          // 具の下
            let hidden = false;
            for (let k = 0; k < 4; k++) {
                const b = a + k * Math.PI * 0.5;
                if (field.topAt(x + Math.cos(b) * 0.10, z + Math.sin(b) * 0.10) > y0 + 0.12) { hidden = true; break; }
            }
            if (hidden) continue;
            // 【対策】全粒を面ぴったりに置くとモザイクのように敷き詰まる。
            //         ふっくらしたご飯は、塊の上に乗って浮いている粒が 3 割ある
            const t = rng.next();
            const sink = t < G.riceLiftRatio
                ? -G.riceLift * (t / G.riceLiftRatio)
                : 0.22 * Math.pow((t - G.riceLiftRatio) / (1 - G.riceLiftRatio), 1.9);
            const y = y0 + 0.04 - sink;
            // 姿勢: 盛りの法線に寝かせ、面内で回し、少数だけ大きく起こす。
            // 【対策】向きを完全にランダムにすると立った粒だらけになり、
            //         炒ったように硬く見える。大半は寝ていて、少数の立った粒が
            //         輪郭の毛羽立ちを作る
            const nrm = riceN(x, z);
            const axis = V3.Cross(upV, nrm);
            const len = axis.length();
            const qTilt0 = (len < 1e-5) ? Q.Identity()
                : Q.RotationAxis(axis.scale(1 / len), Math.asin(clamp(len, -1, 1)));
            const spin = Q.RotationAxis(nrm, rng.range(0, TAU));
            let rv = new V3(rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1));
            if (rv.lengthSquared() < 1e-8) rv = new V3(1, 0, 0);
            rv.normalize();
            const loose = rng.next() < G.riceLoose;
            const q = Q.RotationAxis(rv, rng.gauss(0, loose ? 1.15 : 0.26)).multiply(spin.multiply(qTilt0));
            const broken = rng.next() < 0.14;
            const s = new V3(broken ? rng.range(0.6, 0.8) : rng.range(0.92, 1.08), rng.range(0.94, 1.06), rng.range(0.94, 1.06));
            BABYLON.Matrix.ComposeToRef(s, q, new V3(x, y, z), M);
            const off = mtx.length;
            for (let k = 0; k < 16; k++) mtx.push(M.m[k]);
            // 粒間の暗がり: 沈んだ粒ほど暗い。器の内壁ぎわも暗い
            let ao = 1 - 0.30 * clamp((sink + G.riceLift) / (G.riceLift + 0.22), 0, 1);
            ao *= 1 - 0.18 * smooth(rMax - 1.0, rMax + 0.1, r);
            grains.push({ x, z, ao });
        }
        const mesh = buildGrainMesh(scene);
        mesh.material = mats.grain;
        mesh.receiveShadows = true;
        const col = new Float32Array(grains.length * 4);
        if (grains.length) {
            mesh.thinInstanceSetBuffer("matrix", new Float32Array(mtx), 16, true);
            mesh.thinInstanceSetBuffer("color", col, 4, false);
        } else mesh.setEnabled(false);
        mesh.tris = mesh.getTotalIndices() / 3 * grains.length;
        st.rice = { mesh, grains, col };

        // 下地（粒のすき間から見える所と、具の下の面）
        const NR = 44, NS = 160, RB = R + 0.06;
        const nV = (NR + 1) * (NS + 1);
        const pos = new Float32Array(nV * 3), uvs = new Float32Array(nV * 2), ao = new Float32Array(nV);
        let vo = 0;
        for (let i = 0; i <= NR; i++) {
            const rr = RB * Math.sqrt(i / NR);
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                const x = rr * Math.cos(th), z = rr * Math.sin(th);
                const xr = Math.min(rr, R) * Math.cos(th), zr = Math.min(rr, R) * Math.sin(th);
                const bump = (Noise.v2(x * 3.2 + 5, z * 3.2 + 9, 811) - 0.5) * 2 * 0.045;
                pos[vo * 3] = x; pos[vo * 3 + 1] = riceY(xr, zr) - 0.16 + bump; pos[vo * 3 + 2] = z;
                uvs[vo * 2] = j / NS; uvs[vo * 2 + 1] = i / NR;
                ao[vo] = 1 - 0.20 * smooth(R - 1.0, R, rr);
                vo++;
            }
        }
        const idx = [];
        for (let i = 0; i < NR; i++) {
            for (let j = 0; j < NS; j++) {
                const a = i * (NS + 1) + j, b = a + 1, c = a + NS + 1, d = c + 1;
                idx.push(a, c, b, b, c, d);
            }
        }
        const indices = new Uint32Array(idx);
        let normals = new Float32Array(pos.length);
        BABYLON.VertexData.ComputeNormals(pos, indices, normals);
        let up = 0;
        for (let i = 1; i < normals.length; i += 3) up += normals[i];
        if (up < 0) {
            for (let k = 0; k < indices.length; k += 3) { const t = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = t; }
            normals = new Float32Array(pos.length);
            BABYLON.VertexData.ComputeNormals(pos, indices, normals);
        }
        weldNormals(pos, normals);
        const bcol = new Float32Array(nV * 4).fill(1);
        const body = makeMesh("riceBody", pos, indices, normals, uvs, bcol, scene, true);
        body.material = mats.body;
        body.receiveShadows = true;
        st.riceBody = { mesh: body, pos, ao, col: bcol, nV };
        riceRecolor(st);
    }

    function riceRecolor(st) {
        if (!st || !st.rice) return;
        const sauce = SAUCES[currentSauce], f = [1, 1, 1];
        const R = st.rice;
        for (let i = 0; i < R.grains.length; i++) {
            const g = R.grains[i];
            stainInto(st.field, sauce, g.x, g.z, f);
            // 【対策】遮蔽ぶんを一様に引くと谷が中性グレーになり、陶器のビーズに
            //         見える。米は半透明なので、谷に落ちた光は隣の粒を通って
            //         黄色みを帯びて戻る。暗いほど青を落とし、赤は持ち上げる
            const w = 1 - g.ao;
            R.col[i * 4] = g.ao * (1 + 0.10 * w) * f[0]; R.col[i * 4 + 1] = g.ao * (1 - 0.02 * w) * f[1];
            R.col[i * 4 + 2] = g.ao * (1 - 0.30 * w) * f[2]; R.col[i * 4 + 3] = 1;
        }
        if (R.grains.length) R.mesh.thinInstanceBufferUpdated("color");
        const B = st.riceBody;
        // 【対策】下地を (0.80,0.78,0.70) にすると青が 12% 落ちて黄土色の灰になり、
        //         粒のすき間から見えるたびに「灰色のご飯」になる。カレー.js と同じく
        //         粒のアルベド (0.958,0.947,0.928) の 0.86 倍、色相はほぼ白のまま
        const base = [s2l(0.958 * 0.86), s2l(0.947 * 0.85), s2l(0.928 * 0.84)];
        for (let i = 0; i < B.nV; i++) {
            const x = B.pos[i * 3], z = B.pos[i * 3 + 2];
            stainInto(st.field, sauce, x, z, f);
            // 具の下・具と具のすき間から覗く所は、つゆが溜まって暗い
            const under = 1 - smooth(0.0, 0.35, st.field.distAt(x, z));
            const k = B.ao[i] * (1 - 0.40 * under);
            B.col[i * 4] = base[0] * k * f[0]; B.col[i * 4 + 1] = base[1] * k * f[1];
            B.col[i * 4 + 2] = base[2] * k * f[2]; B.col[i * 4 + 3] = 1;
        }
        B.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, B.col, false, false);
    }

    // =================================================================
    //  紅しょうが（細い千切りを具の上に一山）
    // =================================================================
    const BENI = { col: [0.880, 0.150, 0.200], pale: [0.950, 0.430, 0.440] };

    function buildBeni(field, seed) {
        const acc = newAcc();
        const c = placeXZ(GLOBAL.beniAt);
        const N = 110;
        for (let s = 0; s < N; s++) {
            const r = new Rng((seed + s * 7919) >>> 0);
            const a = r.range(0, TAU), rr = Math.sqrt(r.next()) * 1.10;
            let x = c[0] + Math.cos(a) * rr, z = c[1] + Math.sin(a) * rr;
            let ph = r.range(0, TAU);
            const kap = r.gauss(0, 1.8);
            const L = r.range(0.9, 2.2), ds = 0.09, n = Math.ceil(L / ds);
            const lay = s / N;
            const path = [], ups = [];
            for (let i = 0; i <= n; i++) {
                const dc = Math.hypot(x - c[0], z - c[1]) / 1.4;
                let top = field.topAt(x, z);
                for (let k = 0; k < 5; k++) {
                    const b = k / 5 * TAU;
                    top = Math.max(top, field.topAt(x + Math.cos(b) * 0.07, z + Math.sin(b) * 0.07));
                }
                const y = top + 0.035 + lay * 0.40 * Math.max(0, 1 - dc * dc) + 0.04 * Math.sin(i * 0.9 + s);
                path.push([x, y, z]); ups.push([0, 1, 0]);
                ph += kap * ds + r.gauss(0, 0.08);
                x += Math.cos(ph) * ds; z += Math.sin(ph) * ds;
            }
            const hw = r.range(0.045, 0.070), ht = r.range(0.016, 0.024);
            const tw = r.gauss(0, 0.6), tone = r.range(-0.06, 0.06);
            sweepInto(acc, path, ups, (i) => {
                const ang = tw * i / n, ca = Math.cos(ang), sa = Math.sin(ang);
                return [[hw * ca, hw * sa], [-ht * sa, ht * ca], [-hw * ca, -hw * sa], [ht * sa, -ht * ca]];
            }, 1, (t, k) => {
                const e = 1 - smooth(0, 0.12, Math.min(t, 1 - t));
                const cc = mix3(BENI.col, BENI.pale, clamp(e * 0.5 + ((k === 0 || k === 2) ? 0.10 : 0) + tone, 0, 1));
                return cc;
            });
        }
        const positions = new Float32Array(acc.pos);
        const indices = new Uint32Array(acc.idx);
        const normals = finalizeOff(positions, indices, new Float32Array(acc.off));
        const colors = new Float32Array(acc.nV * 4);
        for (let i = 0; i < acc.nV; i++) {
            colors[i * 4] = s2l(clamp(acc.col[i * 3], 0, 1));
            colors[i * 4 + 1] = s2l(clamp(acc.col[i * 3 + 1], 0, 1));
            colors[i * 4 + 2] = s2l(clamp(acc.col[i * 3 + 2], 0, 1));
            colors[i * 4 + 3] = 1;
        }
        return { positions, indices, normals, colors, uvs: new Float32Array(acc.uv) };
    }

    function beniMaterial(scene) {
        const m = new BABYLON.PBRMaterial("beniMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0; m.roughness = 0.34;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.90;
        m.clearCoat.roughness = 0.08;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.55;
        m.subSurface.tintColor = col3([0.95, 0.15, 0.18]);
        m.subSurface.minimumThickness = 0.01;
        m.subSurface.maximumThickness = 0.08;
        return m;
    }

    // =================================================================
    //  盛り付け
    // =================================================================
    function buildComposition(G, fill, seed) {
        const R = riceRadius();
        const field = new Field(G.pileGrid, G.pileHalf, (x, z) => {
            const r = Math.hypot(x, z);
            if (r >= G.rIn - 0.02) return 40;
            if (r < R) return riceY(x, z);
            return innerYAt(G, r);                 // ご飯より外は丼の内壁
        });
        const mc = placeXZ(G.pileAt);
        const total = fill.meat + fill.onion;
        const order = [];
        let nOn = 0, nMt = 0;
        for (let i = 0; i < total; i++) {
            // 玉ねぎを各層に分散させ、肉の間に混ぜる。
            const want = Math.round(fill.onion * Math.pow((i + 0.5) / total, 1.35));
            // 【対策】肉を使い切ったあとの端数まで "meat" に落ちると、牛肉 OFF でも
            //         2 枚だけ肉が出る。残っている種類だけから選ぶ
            if ((nOn < want && nOn < fill.onion) || nMt >= fill.meat) { order.push("onion"); nOn++; }
            else { order.push("meat"); nMt++; }
        }
        const pieces = [];
        for (let i = 0; i < order.length; i++) {
            const kind = order[i];
            const sd = (seed ^ 0x5A17) + i * 7919;
            const r2 = new Rng(sd);
            const Q = BABYLON.Quaternion;
            let q;
            if (kind === "meat") {
                q = Q.RotationYawPitchRoll(r2.range(0, TAU), r2.gauss(0, 0.17),
                    r2.gauss(0, 0.17) + (r2.next() < 0.25 ? Math.PI : 0));
            } else {
                const edge = r2.next() < 0.04;
                q = Q.RotationYawPitchRoll(r2.range(0, TAU),
                    edge ? 0.9 + r2.gauss(0, 0.20) : r2.gauss(0, 0.22), r2.gauss(0, 0.22));
            }
            const a = GOLD * i + r2.range(-0.35, 0.35);
            const frac = i / Math.max(1, order.length - 1);
            const rr = G.pileR * Math.sqrt(((i % 31) + 0.5) / 31) * r2.range(0.78, 1.02);
            const cx = mc[0] + Math.cos(a) * rr, cz = mc[1] + Math.sin(a) * rr;
            const sc = kind === "meat" ? r2.range(0.82, 1.16) : r2.range(0.80, 1.02);
            const p = kind === "meat" ? buildBeefSheet(sc, q, cx, cz, sd) : buildOnionStrip(sc, q, cx, cz, sd);
            const bb = bounds(p.positions, p.nV);
            shiftY(p.positions, p.nV, RICE_Y0 - bb.y0);
            dropPiece(field, p, G, r2, cx, cz, kind === "meat" ? 0.45 : 0.65, mc);
            pieces.push(p);
        }
        field.buildDistance();
        return { field, pieces, mc };
    }

    const camTarget = placeXZ([0.0, 0.0]);
    const camera = new BABYLON.ArcRotateCamera("cam", -1.14, 0.98, 57,
        new V3(camTarget[0], 4.6, camTarget[1]), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 4;
    camera.fov = 0.352;
    camera.minZ = 0.5;
    camera.maxZ = 2500;
    camera.lowerRadiusLimit = 36;
    camera.upperRadiusLimit = 190;
    camera.upperBetaLimit = 1.44;
    camera.lowerBetaLimit = 0.15;
    camera.panningSensibility = 110;
    const fitCamera = () => { const a = engine.getRenderWidth() / engine.getRenderHeight(); camera.fov = a < 1.2 ? 2 * Math.atan(Math.tan(.352 / 2) * 1.2 / a) : .352; };
    fitCamera(); const resizeObserver = engine.onResizeObservable.add(fitCamera);
    scene.onDisposeObservable.add(() => engine.onResizeObservable.remove(resizeObserver));
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.44, -0.92, 0.50).normalize(), scene);
    key.position = new V3(18, 40, -20);
    key.intensity = 2.35;
    key.diffuse = new BABYLON.Color3(1.0, 0.972, 0.932);
    key.autoUpdateExtends = false;
    key.orthoLeft = -27; key.orthoRight = 27;
    key.orthoBottom = -27; key.orthoTop = 27;
    key.shadowMinZ = 1; key.shadowMaxZ = 110;

    const kick1 = new BABYLON.DirectionalLight("kick1", new V3(0.58, -0.34, -1.0).normalize(), scene);
    kick1.intensity = 0.25;
    kick1.diffuse = new BABYLON.Color3(0.052, 0.050, 0.046);
    kick1.specular = new BABYLON.Color3(1.0, 0.965, 0.905);
    const kick2 = new BABYLON.DirectionalLight("kick2", new V3(-0.86, -0.52, -0.40).normalize(), scene);
    kick2.intensity = 0.16;
    kick2.diffuse = new BABYLON.Color3(0.040, 0.038, 0.036);
    kick2.specular = new BABYLON.Color3(0.92, 0.94, 1.0);

    const fill = new BABYLON.HemisphericLight("fill", new V3(-0.2, 1, -0.35), scene);
    // 【対策】白飯が灰色に見える本当の原因は照明比（ごはん.js rice-H の知見）。
    //         キー 2.6 / 半球 0.34 では影側に光が回らず、白い被写体は必ず灰色に写る。
    //         カレー.js と同じ key/fill ≒ 4 まで半球光（＝レフ板）を上げる
    fill.intensity = 0.58;
    fill.diffuse = new BABYLON.Color3(0.97, 0.975, 1.0);
    fill.groundColor = new BABYLON.Color3(0.33, 0.30, 0.27);
    fill.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.useContactHardeningShadow = true; sg.contactHardeningLightSizeUVRatio = 0.055;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0030;
    sg.normalBias = 0.010;
    sg.setDarkness(0.12);

    // ---- 卓: 藍の布マット / 白木 ----------------------------------------
    // 【対策】布を木目の色替えで作ると「青い板」になる。織物の見分けは
    //         (a) 細い畝（うね）が一定ピッチで並ぶ (b) 畝ごとに糸の色が
    //         少しずつ違う (c) 横糸の目が細かく交互に出る、の 3 つ
    function fabricSet(scene, N) {
        const n2 = N * N, ribs = 40;
        const H = new Float32Array(n2), A = new Float32Array(n2 * 3);
        const DARK = [0.235, 0.285, 0.395], MID = [0.410, 0.470, 0.575], LIGHT = [0.585, 0.635, 0.720];
        for (let y = 0; y < N; y++) {
            const rb = y / N * ribs, ri = Math.floor(rb), f = rb - ri;
            const prof = Math.pow(Math.sin(Math.PI * f), 0.6);
            const h = Noise._h2(ri, 3, 77), hb = Noise._h2(Math.floor(ri / 5), 9, 79);
            let tone = h < 0.30 ? DARK : (h < 0.78 ? MID : LIGHT);
            tone = mix3(tone, MID, 0.25 + 0.25 * hb);
            for (let x = 0; x < N; x++) {
                const i = y * N + x;
                const w = 0.5 + 0.5 * Math.sin(x / N * TAU * 160 + (ri & 1) * Math.PI);
                const slub = Noise.fbm2p(x / N * 24, y / N * 6, 24, 6, 83, 2);
                const k = (0.80 + 0.20 * prof) * (0.95 + 0.05 * w) * (0.92 + 0.16 * slub);
                A[i * 3] = tone[0] * k; A[i * 3 + 1] = tone[1] * k; A[i * 3 + 2] = tone[2] * k;
                H[i] = prof * 0.75 + w * 0.12;
            }
        }
        const albedo = TexLab._tex("fabricA", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                d[i * 4] = clamp(A[i * 3], 0, 1) * 255; d[i * 4 + 1] = clamp(A[i * 3 + 1], 0, 1) * 255;
                d[i * 4 + 2] = clamp(A[i * 3 + 2], 0, 1) * 255; d[i * 4 + 3] = 255;
            }
        }, scene, false, false);
        const normal = TexLab.normalFromHeight("fabricN", N, H, 2.2, scene, false);
        return { albedo, normal };
    }

    const fabric = fabricSet(scene, 512);
    const fabricMat = new BABYLON.PBRMaterial("fabricMat", scene);
    fabricMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    fabricMat.albedoTexture = fabric.albedo;
    fabricMat.bumpTexture = fabric.normal;
    fabricMat.bumpTexture.level = 0.8;
    fabricMat.metallic = 0.0;
    fabricMat.roughness = 0.88;
    fabricMat.sheen.isEnabled = true;
    fabricMat.sheen.intensity = 0.35;
    fabricMat.sheen.color = col3([0.70, 0.76, 0.86]);
    for (const t of [fabric.albedo, fabric.normal]) { t.uScale = 40; t.vScale = 40; }

    const tableWood = woodSet(scene, "table", 640, 7717, {
        base: [0.930, 0.860, 0.760], grain: [0.850, 0.750, 0.630],
        dark: [0.760, 0.640, 0.510],
        rings: 40.0, wave: 1.4, sharp: 2.3, knot: 0.12, rough: 0.50, bump: 0.5,
        across: true
    });
    const woodMat = new BABYLON.PBRMaterial("woodMat", scene);
    woodMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    woodMat.albedoTexture = tableWood.albedo;
    woodMat.metallic = 0.0;
    woodMat.roughness = 1.0;
    woodMat.metallicTexture = tableWood.orm;
    woodMat.useRoughnessFromMetallicTextureGreen = true;
    woodMat.useMetallnessFromMetallicTextureBlue = true;
    woodMat.bumpTexture = tableWood.normal;
    woodMat.bumpTexture.level = 0.20;
    woodMat.clearCoat.isEnabled = true;
    woodMat.clearCoat.intensity = 0.18;
    woodMat.clearCoat.roughness = 0.38;
    for (const t of [tableWood.albedo, tableWood.orm, tableWood.normal]) { t.uScale = 8; t.vScale = 8; }

    const table = BABYLON.MeshBuilder.CreateGround("table", { width: 400, height: 400 }, scene);
    named(table, "table");
    table.receiveShadows = true;
    let currentTable = START_TABLE;
    function setTable(k) {
        currentTable = k;
        table.material = k === "nuno" ? fabricMat : woodMat;
    }
    setTable(START_TABLE);

    // ---- 箸（朱塗り）と箸置き（染付） --------------------------------------
    const sundryRng = new Rng(0x7A11CE);
    const chopMat = new BABYLON.PBRMaterial("chopMat", scene);
    chopMat.albedoColor = col3([0.600, 0.075, 0.090]);
    chopMat.metallic = 0.0; chopMat.roughness = 0.42;
    chopMat.clearCoat.isEnabled = true;
    chopMat.clearCoat.intensity = 1.0;
    chopMat.clearCoat.roughness = 0.10;

    const restTex = TexLab._tex("restA", 256, 256, (d) => {
        for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
            const u = x / 256, v = y / 256;
            // 矢羽根を思わせる藍の山形
            const s = fr(u * 5 + Math.abs(fr(v * 3) - 0.5) * 1.2);
            const m = (1 - smooth(0.26, 0.32, Math.abs(s - 0.5))) * (0.85 + 0.15 * Noise.fbm2p(u * 16, v * 16, 16, 16, 61, 2));
            const c = mix3([0.915, 0.915, 0.905], INK.blue, m);
            const k = (y * 256 + x) * 4;
            d[k] = c[0] * 255; d[k + 1] = c[1] * 255; d[k + 2] = c[2] * 255; d[k + 3] = 255;
        }
    }, scene, false, false);
    const restMat = new BABYLON.PBRMaterial("restMat", scene);
    restMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    restMat.albedoTexture = restTex;
    restMat.metallic = 0.0; restMat.roughness = 0.20;
    restMat.clearCoat.isEnabled = true;
    restMat.clearCoat.intensity = 0.95;
    restMat.clearCoat.roughness = 0.05;

    const CHOP_LEN = 22.0, CHOP_R = 0.275;
    const restW = 3.2, restD = 1.40, restH = 1.30, restDip = 0.42;
    const rp = placeXZ([13.4, -8.6]);
    const restPos = { x: rp[0], y: restH * 0.5, z: rp[1] };
    const contact = new V3(restPos.x, restH - restDip + 0.17, restPos.z);
    const awayXZ = new V3(DIR_R[0] - 0.04 * DIR_D[0], 0, DIR_R[1] - 0.04 * DIR_D[1]).normalize();
    const buttY = CHOP_R * 1.30;
    const OVERHANG = CHOP_LEN * 0.120;
    const dropY = contact.y - buttY;
    const runXZ = Math.sqrt(Math.max(0, Math.pow(CHOP_LEN - OVERHANG, 2) - dropY * dropY));
    const butt = new V3(contact.x + awayXZ.x * runXZ, buttY, contact.z + awayXZ.z * runXZ);
    const cdir = butt.subtract(contact); const dlen = cdir.length(); cdir.scaleInPlace(1 / dlen);
    const tip = contact.subtract(cdir.scale(CHOP_LEN - dlen));
    const perp = BABYLON.Vector3.Cross(cdir, new V3(0, 1, 0)).normalize();
    const chopsticks = [];
    for (let i = 0; i < 2; i++) {
        const o = perp.scale((i === 0 ? -1 : 1) * 0.30);
        const c = buildChopstick(scene, "chopstick", sundryRng, butt.add(o), tip.add(o.scale(0.80)));
        c.material = chopMat;
        c.receiveShadows = true;
        chopsticks.push(c);
    }
    const rest = buildRest(scene, restW, restH, restD, 0.30, restDip, restPos, Math.atan2(-perp.z, perp.x));
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
        g.addColorStop(0.45, "rgba(255,255,255,0.45)");
        g.addColorStop(1.0, "rgba(255,255,255,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
        dt.update(); dt.hasAlpha = true;
        return dt;
    })();
    const mcXZ = placeXZ(GLOBAL.pileAt);
    // ごはん.js（rice-H）の湯気と同じ設定。大きな膜を重ねるのではなく、
    // 小さな粒がまっすぐ細く立ち上がる「筋の湯気」。
    // 【対策】粒を 4cm 台まで大きくすると、白い霧が丼を覆ってしまい
    //         「湯気」ではなく「もや」になる。発生範囲も山の中央付近に絞る
    const steam = new BABYLON.ParticleSystem("steam", 400, scene);
    steam.particleTexture = steamTex;
    steam.emitter = new V3(mcXZ[0], 10.2, mcXZ[1]);
    steam.minEmitBox = new V3(-1.8, -0.3, -1.8);
    steam.maxEmitBox = new V3(1.8, 0.2, 1.8);
    // 【対策】加算合成にすると湯気が発光して見える。湯気は光っていない
    steam.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    steam.color1 = new BABYLON.Color4(1, 1, 1, 0.055);
    steam.color2 = new BABYLON.Color4(0.95, 0.95, 0.95, 0.028);
    steam.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    steam.minSize = 0.6; steam.maxSize = 2.1;
    steam.minLifeTime = 1.8; steam.maxLifeTime = 3.4;
    steam.emitRate = 90;
    steam.gravity = new V3(0, 1.1, 0);
    steam.direction1 = new V3(-0.35, 1.4, -0.35);
    steam.direction2 = new V3(0.35, 2.4, 0.35);
    steam.minAngularSpeed = -0.5; steam.maxAngularSpeed = 0.5;
    steam.minEmitPower = 0.4; steam.maxEmitPower = 1.0;
    steam.updateSpeed = 0.012;

    // ---- 具のマテリアル用テクスチャ ------------------------------------
    const saraMatCache = {};
    const pieceMats = {};
    const beefBump = beefNormalTex(scene);
    const beefDetail = TexLab._tex("cooked-fibers", 512, 512, (d) => {
        for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
            const fib = Noise.fbm2p(x / 512 * 9, y / 512 * 125, 9, 125, 823, 3);
            const pores = Noise.fbm2p(x / 512 * 90, y / 512 * 90, 90, 90, 941, 2);
            const n = .93 + .045 * fib + .025 * pores; const k = (y * 512 + x) * 4;
            d[k] = 255 * n; d[k + 1] = 255 * n; d[k + 2] = 255 * n; d[k + 3] = 255;
        }
    }, scene, false, false);
    const onionHeight = new Float32Array(256 * 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) onionHeight[y * 256 + x] = .5 + .11 * Math.sin(x / 256 * TAU * 24 + Math.sin(y / 256 * TAU) * .5) + .07 * Noise.fbm2p(x / 256 * 32, y / 256 * 6, 32, 6, 714, 2);
    const onionBump = TexLab.normalFromHeight("onion-cell-fibers", 256, onionHeight, 2.4, scene, false); onionBump.level = .35;
    const riceMats = riceMaterials(scene);
    const beniMat = beniMaterial(scene);

    let currentSauce = START_SAUCE, currentSara = START_SARA, currentFill = START_FILL;
    let currentSeed = START_SEED >>> 0;
    let withBeni = false;
    let withMeat = true, withOnion = true;   // 具の表示。両方 OFF でご飯だけになる
    let setMeatUI = () => {}, setOnionUI = () => {};
    let state = null;
    let onRebuilt = null;
    let ssao = null;
    let glazeDirty = false;

    const live = { reduce: 1.0, wetAmt: 1.0, gloss: 0.95, trans: 1.0 };

    function getSaraMat(k) {
        if (!saraMatCache[k]) saraMatCache[k] = saraMaterial(scene, GLOBAL, SARAS[k], "saraMat_" + k, 4001 + k.length * 37);
        return saraMatCache[k];
    }
    function rebuildPieceMats(sauce) {
        for (const k in pieceMats) { pieceMats[k].dispose(false, false); delete pieceMats[k]; }
        pieceMats.meat = pieceMaterial(scene, BEEF, "mat_meat", sauce, live, beefBump);
        pieceMats.onion = pieceMaterial(scene, ONION, "mat_onion", sauce, live, null);
    }
    function applyLive() {
        const sauce = SAUCES[currentSauce];
        for (const k in pieceMats) {
            const m = pieceMats[k], S = m.spec;
            m.clearCoat.intensity = clamp(S.coat * sauce.coat * live.gloss, 0, 1);
            m.clearCoat.roughness = clamp(mix(S.coatRough, sauce.rough, 0.55) / Math.max(0.2, live.gloss), 0.01, 0.7);
            m.subSurface.translucencyIntensity = clamp(S.trans * live.trans, 0, 0.95);
        }
    }

    function disposeFood(st) {
        if (!st) return;
        for (const m of (st.meshes || [])) m.dispose();
        if (st.beni) st.beni.dispose();
        if (st.rice) st.rice.mesh.dispose();
        if (st.riceBody) st.riceBody.mesh.dispose();
        st.meshes = []; st.pieces = []; st.beni = null; st.rice = null; st.riceBody = null;
    }

    function buildFood(seed) {
        const fill0 = FILLS[currentFill], sauce = SAUCES[currentSauce];
        GLOBAL.pileR = fill0.pileR;
        // 【対策】具のメッシュを隠すだけだと、具の下に粒を置いていないご飯の
        //         下地（つゆ色に焼いた面）がむき出しになる。具なしで盛り直せば
        //         ご飯の粒が丼いっぱいに並び、つゆの染みも入らない
        const fill = Object.assign({}, fill0, {
            meat: withMeat ? fill0.meat : 0,
            onion: withOnion ? fill0.onion : 0
        });
        const now = () => (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
        const t0 = now();
        const comp = buildComposition(GLOBAL, fill, seed);
        const t1 = now();
        const meshes = [];
        for (const p of comp.pieces) {
            bakeGlaze(p, comp.field, sauce, RICE_Y0, GLOBAL, live);
            const mesh = makeMesh(p.kind, p.positions, p.indices, p.normals, p.uvs, p.colors, scene, true);
            mesh.material = pieceMats[p.kind];
            sg.addShadowCaster(mesh, true);
            mesh.receiveShadows = true;
            p.mesh = mesh;
            meshes.push(mesh);
        }
        const st = { pieces: comp.pieces, meshes, field: comp.field, mc: comp.mc, ms: Math.round(t1 - t0) };
        if (withBeni) {
            const bn = buildBeni(comp.field, (seed ^ 0xBE21) >>> 0);
            const m = makeMesh("beniShoga", bn.positions, bn.indices, bn.normals, bn.uvs, bn.colors, scene);
            m.material = beniMat; m.receiveShadows = true; sg.addShadowCaster(m, true);
            st.beni = m;
        }
        const t2 = now();
        buildRice(st, scene, riceMats);
        st.msRice = Math.round(now() - t2);
        return st;
    }

    function redrawGlaze() {
        if (!state) return;
        const sauce = SAUCES[currentSauce];
        for (const p of state.pieces) {
            bakeGlaze(p, state.field, sauce, RICE_Y0, GLOBAL, live);
            if (p.mesh) p.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, p.colors, false, false);
        }
        riceRecolor(state);
    }

    function build(full) {
        const sauce = SAUCES[currentSauce];
        rebuildPieceMats(sauce);
        if (full || !state) {
            const sara = state ? state.sara : null;
            disposeFood(state);
            state = buildFood(currentSeed);
            state.sara = sara;
        } else {
            for (const p of state.pieces) p.mesh.material = pieceMats[p.kind];
            redrawGlaze();
        }
        if (!state.sara) {
            state.sara = buildSara(scene, GLOBAL, SARAS[currentSara], getSaraMat(currentSara), new Rng(0xB0117));
            sg.addShadowCaster(state.sara, true);
        }
        applyLive();
        if (onRebuilt) onRebuilt(state);
    }

    function setSara(k) {
        currentSara = k;
        state.sara.material = getSaraMat(k);
        if (onRebuilt) onRebuilt(state);
    }

    build(true);

    if (GLOBAL.useSSAO) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.65;
        ssao.totalStrength = 0.32;
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
    dp.bloomWeight = 0.035;
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
    ip.exposure = 1.15;
    ip.contrast = 1.02;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 0.45;
    ip.vignetteCameraFov = 0.72;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    scene.onBeforeRenderObservable.add(() => {
        if (dp.depthOfFieldEnabled) {
            const focus = camera.radius * 1000;
            dp.depthOfField.focusDistance = focus;
            dp.depthOfField.focalLength = focus * GLOBAL.dofRatio;
        }
        if (glazeDirty) { glazeDirty = false; redrawGlaze(); }
    });

    // =================================================================
    //  GUI
    // =================================================================
    let refreshUI = () => {}, toggleControls = () => {};
    if (BABYLON.GUI) {
    const GUI_MASK = 0x20000000;
    let guiCam = null;

    function bindDebugCamera(sc, mainCam) {
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
    const fitUI = () => { ui.idealWidth = Math.max(430, engine.getRenderWidth()); }; fitUI();
    const uiResize = engine.onResizeObservable.add(fitUI);
    scene.onDisposeObservable.add(() => engine.onResizeObservable.remove(uiResize));
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
    card.isVisible = false;
    const toggle = BABYLON.GUI.Button.CreateSimpleButton("settingsToggle", "調整");
    toggle.width = "78px"; toggle.height = "36px"; toggle.color = "#f6eddb"; toggle.fontSize = "16px"; toggle.textBlock.fontSize = "16px";
    toggle.background = "#3b352de6"; toggle.cornerRadius = 18; toggle.thickness = 0;
    toggle.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    toggle.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    toggle.top = "22px"; toggle.left = "-22px"; ui.addControl(toggle);
    toggle.onPointerUpObservable.add(() => { card.isVisible = !card.isVisible; });

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

    addLabel("GYUDON / 牛丼", 11, COL.sub, "30px");

    const sauceBtns = {}, saraBtns = {}, fillBtns = {}, tableBtns = {};
    function highlight() {
        for (const k in sauceBtns) sauceBtns[k].background = (k === currentSauce) ? COL.active : COL.idle;
        for (const k in saraBtns) saraBtns[k].background = (k === currentSara) ? COL.active : COL.idle;
        for (const k in fillBtns) fillBtns[k].background = (k === currentFill) ? COL.active : COL.idle;
        for (const k in tableBtns) tableBtns[k].background = (k === currentTable) ? COL.active : COL.idle;
    }

    addLabel("つゆ", 13, COL.accent, "22px");
    for (const k of Object.keys(SAUCES)) {
        sauceBtns[k] = addButton("s_" + k, SAUCES[k].label, () => { currentSauce = k; build(false); highlight(); });
    }
    addLabel("盛り", 13, COL.accent, "22px");
    for (const k of Object.keys(FILLS)) {
        fillBtns[k] = addButton("f_" + k, FILLS[k].label, () => { currentFill = k; build(true); highlight(); });
    }
    addLabel("丼", 13, COL.accent, "22px");
    for (const k of Object.keys(SARAS)) {
        saraBtns[k] = addButton("h_" + k, SARAS[k].label, () => { setSara(k); highlight(); });
    }
    addLabel("卓", 13, COL.accent, "22px");
    for (const k of Object.keys(TABLES)) {
        tableBtns[k] = addButton("t_" + k, TABLES[k].label, () => { setTable(k); highlight(); });
    }

    addSpacer();
    addButton("reseed", "盛り直す", () => {
        currentSeed = (currentSeed * 1664525 + 1013904223) >>> 0;
        build(true);
    });

    // 具の表示切り替え。両方 OFF にすると、ご飯だけが丼いっぱいに盛られた状態になる
    const meatBtn = addButton("meat", "牛肉: ON", () => setMeatUI(!withMeat));
    setMeatUI = (v) => {
        withMeat = !!v;
        meatBtn.textBlock.text = "牛肉: " + (withMeat ? "ON" : "OFF");
        meatBtn.background = withMeat ? COL.active : COL.idle;
        build(true);
    };
    meatBtn.background = COL.active;
    const onionBtn = addButton("onion", "玉ねぎ: ON", () => setOnionUI(!withOnion));
    setOnionUI = (v) => {
        withOnion = !!v;
        onionBtn.textBlock.text = "玉ねぎ: " + (withOnion ? "ON" : "OFF");
        onionBtn.background = withOnion ? COL.active : COL.idle;
        build(true);
    };
    onionBtn.background = COL.active;

    const beniBtn = addButton("beni", "紅しょうが: OFF", () => {
        withBeni = !withBeni;
        beniBtn.textBlock.text = "紅しょうが: " + (withBeni ? "ON" : "OFF");
        beniBtn.background = withBeni ? COL.active : COL.idle;
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
    const sRed = addSlider("つゆの濃さ", 0.15, 2.40, live.reduce, f2, (v) => { live.reduce = v; glazeDirty = true; });
    const sWet = addSlider("つゆの絡み ×", 0.0, 2.50, live.wetAmt, f2, (v) => { live.wetAmt = v; glazeDirty = true; });
    const sGloss = addSlider("照り ×", 0.20, 2.00, live.gloss, f2, (v) => { live.gloss = v; applyLive(); });
    const sTrans = addSlider("肉と玉ねぎの透光 ×", 0, 2.00, live.trans, f2, (v) => { live.trans = v; applyLive(); });

    addSpacer();
    const dofBtn = addButton("dof", "被写界深度: OFF", () => {
        GLOBAL.useDOF = !GLOBAL.useDOF;
        dp.depthOfFieldEnabled = GLOBAL.useDOF;
        dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
        dofBtn.textBlock.text = "被写界深度: " + (GLOBAL.useDOF ? "ON" : "OFF");
    });
    dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
    addSlider("ぼけ量", 0.01, 0.20, GLOBAL.dofRatio, f2, (v) => { GLOBAL.dofRatio = v; });
    addSlider("F値", 1.2, 11.0, GLOBAL.dofFStop, (v) => v.toFixed(1), (v) => { dp.depthOfField.fStop = v; });

    highlight();

    onRebuilt = (st) => {
        sRed.slider.value = live.reduce;
        sWet.slider.value = live.wetAmt;
        sGloss.slider.value = live.gloss;
        sTrans.slider.value = live.trans;
    };
    onRebuilt(state);

    function stats() {
        let nMeat = 0, nOn = 0;
        let tri = (state.sara ? state.sara.tris : 0) + state.riceBody.mesh.tris + state.rice.mesh.tris;
        for (const p of state.pieces) { tri += p.mesh.tris; if (p.kind === "meat") nMeat++; else nOn++; }
        if (state.beni) tri += state.beni.tris;
        for (const m of sundry) tri += m.tris;
        return { meat: nMeat, onion: nOn, grains: state.rice.grains.length, tris: tri, seed: currentSeed,
            platingMs: state.ms, riceMs: state.msRice };
    }
    console.log("[Gyudon] build gyudon-2026-10-26-i", stats());

    refreshUI = highlight; toggleControls = v => { card.isVisible = v; };
    }
    scene.onDisposeObservable.add(() => {
        for (const k in saraMatCache) {
            const m = saraMatCache[k];
            if (m.texs) for (const t of m.texs) t.dispose();
            m.dispose(true, false);
        }
        beefBump.dispose(); beefDetail.dispose(); onionBump.dispose(); env.dispose();
        fabric.albedo.dispose(); fabric.normal.dispose(); restTex.dispose();
        for (const t2 in tableWood) tableWood[t2].dispose();
        steamTex.dispose();
    });

    scene.metadata = { gyudon: {
        resetCamera() { camera.setTarget(new V3(camTarget[0],4.6,camTarget[1])); camera.alpha=-1.14; camera.beta=0.98; camera.radius=57; },
        setBowl(k) { if(SARAS[k]){setSara(k);refreshUI();} },
        setSauce(k) { if(SAUCES[k]){currentSauce=k;build(false);refreshUI();} },
        setFill(k) { if(FILLS[k]){currentFill=k;build(true);refreshUI();} },
        setTable(k) { if(TABLES[k]){setTable(k);refreshUI();} },
        replate() { currentSeed=(currentSeed*1664525+1013904223)>>>0;build(true); },
        setControls(v) { toggleControls(v); },
        setBeni(v) { withBeni=!!v;build(true); },
        setMeat(v) { setMeatUI(v); },
        setOnion(v) { setOnionUI(v); },
        riceOnly() { withOnion = false; withBeni = false; setMeatUI(false); setOnionUI(false); },
        setSteam(v) { if(v)steam.start();else steam.stop(); },
        stats() {return {meat:state.pieces.filter(p=>p.kind==='meat').length,onion:state.pieces.filter(p=>p.kind==='onion').length,seed:currentSeed};}
    }};
    return scene;
};

export default createScene;