// 生姜焼き — all geometry, surface maps and studio reflections are generated in code.
// Adapted from the supplied scene. Babylon.js 8.32.0. Paste into Playground.
// Sauce coefficients are artistic parameters, not measured material properties.

var createScene = function () {
    const MM = 0.1;

    const SAUCES = {
        teiban: {
            label: "定番（甘辛）",
            sigma: [2.00, 5.20, 12.50],
            haze: [0.585, 0.330, 0.118], hazeK: 0.150,
            film: 0.050,                   // 肉の表面の膜 [cm]
            pool: 0.150,                   // 隙間に溜まった所の膜 [cm]
            drain: 6.0,                    // 膜が薄くなる高さの減衰長 [cm]
            depth: 0.085,                  // 皿に流れた溜まりの深さ [cm]
            spread: 1.00,                  // 溜まりの広がり ×
            rough: 0.115, coat: 0.95, oil: 0.55
        },
        koime: {
            label: "濃いめ（照り強め）",
            sigma: [2.65, 6.70, 15.20],
            haze: [0.520, 0.262, 0.082], hazeK: 0.110,
            film: 0.052, pool: 0.150, drain: 7.0, depth: 0.090, spread: 0.60,
            rough: 0.088, coat: 0.99, oil: 0.62
        },
        assari: {
            label: "あっさり（生姜多め）",
            sigma: [1.30, 3.30, 8.40],
            haze: [0.680, 0.500, 0.252], hazeK: 0.280,
            film: 0.040, pool: 0.120, drain: 5.0, depth: 0.120, spread: 0.80,
            rough: 0.150, coat: 0.86, oil: 0.40
        }
    };

    const SARAS = {
        white: {
            label: "白い洋皿",
            albedo: [0.900, 0.895, 0.876], rough: 0.10,
            speck: 0.04, craze: 0.0, brush: 0, shinogi: 0,
            coat: 0.98, coatRough: 0.045, rim: null
        },
        kurobuchi: {
            label: "黒釉の陶器",
            albedo: [0.235, 0.244, 0.230], rough: 0.48,
            speck: 0.55, craze: 0.09, brush: 0, shinogi: 0,
            coat: 0.38, coatRough: 0.24,
            rim: { col: [0.63, 0.52, 0.36], from: 0.004, soft: 0.002 }
        },
        shinogi: {
            label: "鎬の平皿",
            albedo: [0.862, 0.838, 0.792], rough: 0.24,
            speck: 0.20, craze: 0.05, brush: 0, shinogi: 64,
            coat: 0.86, coatRough: 0.115, rim: null
        }
    };

    const FILLS = {
        teiban: { label: "玉ねぎ入り", meat: 34, onion: 22 },
        niku: { label: "肉だけ", meat: 42, onion: 0 },
        tamanegi: { label: "玉ねぎ多め", meat: 28, onion: 40 }
    };

    const GLOBAL = {
        yFloor: 0.80,      // 見込みの中心の高さ
        rIn: 12.25,        // 口縁の内半径
        rimLip: 0.34,      // 口縁の丸みの幅
        rFootOut: 7.60,    // 高台の外半径
        rFootIn: 7.00,     // 高台の内半径
        footH: 0.30,       // 高台の高さ
        yUnder: 0.40,      // 底裏（底の厚み 0.40cm）
        wallBase: 0.42,    // 見込みの肉厚
        wallRim: 0.30,     // 口縁近くの肉厚
        sides: 240,        // 周方向分割（鎬のときは自動で増やす）
        wobble: 1.0,
        shinogiDepth: 0.055,
        saraTex: 768,

        meatAt: [3.20, -1.00],   // [手前, 右] [cm]（トマトの置き場を空ける）
        cabAt: [-4.40, 0.90],
        cabRu: 6.00, cabRv: 3.90, cabH: 4.90,
        cabN: 1800,              // 千切りの本数
        tomatoN: 3,

        pileGrid: 380,     // 0.067cm/セル
        pileHalf: 12.70,
        liftQuantile: 0.60,
        settle: 0.120,
        tryPos: 12,
        pileR: 7.00,             // 写真の一人前（豚 200g 前後）に合わせて広げた
        pileDome: 0.35,

        poolTex: 512,
        poolCell: 0.085,   // 溜まりメッシュの格子 [cm]
        ripple: 0.004,

        pocketR: [0.30, 0.62, 1.05],
        pocketDirs: 12,
        pocketRise: 0.14,

        useSSAO: true,
        useDOF: false,
        dofFStop: 2.8,
        dofRatio: 0.066,
        guiOwnCamera: false
    };

    const SARA_R = [0.00, 2.50, 5.00, 7.00, 8.30, 9.30, 10.20, 10.90, 11.50, 11.95, 12.25];
    const SARA_DY = [0.000, 0.005, 0.020, 0.070, 0.150, 0.280, 0.480, 0.740, 1.040, 1.340, 1.550];

    const START_SAUCE = "koime";
    const START_SARA = "kurobuchi";
    const START_FILL = "teiban";
    const START_SEED = 20261007;

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
        const ys = SARA_DY.map((d) => G.yFloor + d);
        const f = monoSpline(SARA_R, ys);
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

    function saraTextures(scene, G, sp, seed) {
        const N = Math.max(64, Math.round(G.saraTex) || 512);
        const n2 = N * N;
        const tab = profileTable(G);
        const rowR = new Float32Array(N), rowY = new Float32Array(N);
        const rowK = new Uint8Array(N), rowV = new Float32Array(N);
        for (let y = 0; y < N; y++) {
            const v = (y + 0.5) / N;
            const s = profileAt(tab, v);
            rowR[y] = s.r; rowY[y] = s.y; rowK[y] = s.k; rowV[y] = v;
        }
        const cosT = new Float32Array(N), sinT = new Float32Array(N);
        for (let x = 0; x < N; x++) {
            const th = (x + 0.5) / N * TAU;
            cosT[x] = Math.cos(th); sinT[x] = Math.sin(th);
        }
        const CELL = 0.70;
        function craze(wx, wy, wz) {
            const u = Math.atan2(wz, wx) * Math.hypot(wx, wz) / CELL;
            const v = (Math.hypot(wx, wz) + wy) / CELL;
            const ui = Math.floor(u), vi = Math.floor(v);
            let f1 = 1e9, f2 = 1e9;
            for (let dj = -2; dj <= 2; dj++) {
                for (let di = -2; di <= 2; di++) {
                    const gi = ui + di, gj = vi + dj;
                    const px = gi + Noise._h2(gi, gj, seed + 601), py = gj + Noise._h2(gi, gj, seed + 607);
                    const d = Math.hypot(px - u, py - v);
                    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
                }
            }
            return f2 - f1;
        }
        const NB = 56;
        function brushAt(r, th, k) {
            if (!sp.brush || k !== 0 || r < 8.4 || r > 12.0) return 0;
            const s = th / TAU * NB;
            const li = Math.floor(s + 0.5);
            const jit = (Noise._h2(li, 3, seed + 41) - 0.5) * 0.36;
            const d = Math.abs(s - li - jit) * TAU * r / NB;            // 線からの距離 [cm]
            const wid = 0.030 + 0.030 * Noise._h2(li, 5, seed + 43);
            const r0 = 8.6 + 0.9 * Noise._h2(li, 7, seed + 47), r1 = 11.2 + 0.7 * Noise._h2(li, 9, seed + 53);
            const along = smooth(r0, r0 + 0.5, r) * (1 - smooth(r1 - 0.4, r1, r));
            const dry = 0.45 + 0.55 * Noise.fbm2(li * 7.1, r * 3.2, seed + 59, 2);
            return (1 - smooth(wid * 0.5, wid, d)) * along * dry;
        }
        const spot = new Float32Array(n2), crz = new Float32Array(n2), lathe = new Float32Array(n2);
        const brs = new Float32Array(n2);
        for (let y = 0; y < N; y++) {
            const wy = rowY[y], rr = rowR[y];
            const lz = 0.5 + 0.5 * Math.sin((rr + wy * 0.5) / 0.13 * Math.PI);
            for (let x = 0; x < N; x++) {
                const i = y * N + x;
                const wx = rr * cosT[x], wz = rr * sinT[x];
                const gs = 46.0;
                const gi = Math.floor(wx * gs), gj = Math.floor(wy * gs), gk = Math.floor(wz * gs);
                const h = Noise._h3(gi, gj, gk, seed + 811);
                let s = 0;
                if (h > 0.9955) {
                    const d = Math.hypot(wx - (gi + 0.5) / gs, wy - (gj + 0.5) / gs, wz - (gk + 0.5) / gs) * gs;
                    s = 1 - smooth(0.18, 0.46, d);
                }
                spot[i] = s;
                crz[i] = sp.craze > 0 ? 1 - smooth(0.0, 0.050, craze(wx, wy, wz)) : 0;
                lathe[i] = lz * (0.6 + 0.4 * Noise.fbm2u(x / N * 7, rr * 0.8, 7, seed + 131, 2));
                brs[i] = brushAt(rr, (x + 0.5) / N * TAU, rowK[y]);
            }
        }
        const A = sp.albedo;
        const albedo = TexLab._tex("saraA", N, N, (d) => {
            for (let y = 0; y < N; y++) {
                const v = rowV[y];
                let rimW = 0;
                if (sp.rim) {
                    const v0 = tab.vRim - sp.rim.from;
                    rimW = smooth(v0 - sp.rim.soft, v0 + sp.rim.soft, v);
                }
                for (let x = 0; x < N; x++) {
                    const i = y * N + x;
                    const grain=Noise.fbm2u(x/N*37,y/N*60,37,2981,3);
                    const factor=sp.rough>.4?.75+grain*.5:1;
                    let c = [A[0]*factor, A[1]*factor, A[2]*factor];
                    c = mix3(c, [0.328, 0.318, 0.330], spot[i] * sp.speck);
                    c = mix3(c, [c[0] * 0.76, c[1] * 0.72, c[2] * 0.68], crz[i] * sp.craze);
                    c = mix3(c, [c[0] * 0.975, c[1] * 0.975, c[2] * 0.980], lathe[i] * 0.35);
                    c = mix3(c, [0.395, 0.440, 0.470], brs[i] * sp.brush);
                    if (rimW > 0) {
                        const rc = mix3(sp.rim.col, [sp.rim.col[0] * 1.25, sp.rim.col[1] * 1.22, sp.rim.col[2] * 1.18],
                            lathe[i] * 0.6 + spot[i] * 0.4);
                        c = mix3(c, rc, rimW);
                    }
                    const k = i * 4;
                    d[k] = clamp(c[0], 0, 1) * 255; d[k + 1] = clamp(c[1], 0, 1) * 255;
                    d[k + 2] = clamp(c[2], 0, 1) * 255; d[k + 3] = 255;
                }
            }
        }, scene, false, true);
        const orm = TexLab._tex("saraO", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const ro = clamp(sp.rough + 0.20 * crz[i] * sp.craze + 0.10 * spot[i] + 0.035 * lathe[i], 0.03, 0.96);
                const k = i * 4;
                d[k] = 255; d[k + 1] = ro * 255; d[k + 2] = 0; d[k + 3] = 255;
            }
        }, scene, true, true);
        const H = new Float32Array(n2);
        for (let i = 0; i < n2; i++) H[i] = clamp(0.5 - 0.30 * lathe[i] - 0.10 * spot[i] - 0.03 * crz[i], 0, 1);
        const normal = TexLab.normalFromHeight("saraN", N, H, 1.0, scene, true);
        const coat = TexLab._tex("saraC", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const w = clamp(0.90 + 0.10 * lathe[i] - 0.35 * spot[i], 0, 1);
                const r2 = clamp(0.42 + 0.30 * crz[i] * sp.craze + 0.24 * lathe[i], 0, 1);
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

    const PORKS = {
        loin: {
            label: "豚ロース薄切り",
            size: 2.60,                            // 代表半長 [cm]（長さ 7cm 前後）
            thick: 0.14,
            // 【対策】焼き色を濃くすると、タレの膜（σ が大きい）と掛け算になって
            //         全体がこげ茶の照り焼きになる。写真の豚は淡いピンクベージュで、
            //         タレの色は膜のムラとして斑に乗っているだけ
            lean: [0.880, 0.745, 0.640],           // 火の通った赤身
            sear: [0.775, 0.590, 0.430],           // 焼き色
            deep: [0.620, 0.420, 0.270],           // 縁の焼け
            fat: [0.935, 0.885, 0.790],
            fatSear: [0.835, 0.690, 0.500],
            fatAmt: 0.30,                          // さし（こま切れ混じり）
            capProb: 0.70,                         // 脂身の帯がある確率
            rough: 0.46, coat: 0.95, coatRough: 0.10,
            trans: 0.16, thick3: 0.20,
            transTint: [0.78, 0.44, 0.30],
            wetBody: 1.18, wetSear: 1.40, wetFat: 0.92,
            bump: 0.85
        }
    };

    function buildPorkSheet(sc, q, cx, cz, seed) {
        const M = PORKS.loin, rng = new Rng(seed >>> 0);
        const NR = 28, NA = 84;
        const nSeed = seed + 991;
        const A = rng.range(1.25, 1.65), Bz = rng.range(0.52, 0.76);
        const outR = (a) => 1 + 0.22 * (Noise.fbm2u(a / TAU * 5, 0.5, 5, nSeed + 1, 3) - 0.5) * 2
            + 0.10 * (Noise.fbm2u(a / TAU * 13, 1.5, 13, nSeed + 2, 2) - 0.5) * 2;
        const foldA = rng.range(0, TAU), foldK = rng.range(1.4, 2.6);
        const amp = rng.range(0.10, 0.22);
        const crum = (x, z) => {
            const u = x * Math.cos(foldA) + z * Math.sin(foldA);
            let h = Math.sin(u * foldK) * amp;
            h += (Noise.fbm2(x * 2.1 + 5, z * 2.1 + 9, nSeed + 7, 3) - 0.5) * amp * 1.2;
            h += (Noise.fbm2(x * 6.0 + 1, z * 6.0 + 3, nSeed + 11, 2) - 0.5) * amp * 0.45;
            return h;
        };
        const rufN = 5 + rng.int(5), rufPh = rng.range(0, TAU), rufAmp = rng.range(0.022, 0.055);
        const fb = rng.range(-0.35, 0.35);                     // 長軸からの傾き
        const fold = rng.next() < 0.55 ? {
            u0: rng.range(0.10, 0.50) * A, rb: rng.range(0.07, 0.16),
            am: rng.range(2.55, 3.10), sg: rng.next() < 0.72 ? 1 : -1
        } : null;
        const curl = rng.next() < 0.50 ? {
            u0: rng.range(0.50, 0.85) * A, rb: rng.range(0.12, 0.25),
            am: rng.range(0.35, 0.85), sg: rng.next() < 0.6 ? 1 : -1
        } : null;
        const cfb = Math.cos(fb), sfb = Math.sin(fb);
        function bend(s, h, F, out) {
            const H = h * F.sg;
            const a = Math.min(s / F.rb, F.am);
            let du = (F.rb - H) * Math.sin(a), dy = F.rb - (F.rb - H) * Math.cos(a);
            if (s > F.rb * F.am) {
                const rest = s - F.rb * F.am;
                du += rest * Math.cos(F.am); dy += rest * Math.sin(F.am);
            }
            out[0] = du; out[1] = dy * F.sg;
        }
        const bt = [0, 0];
        const fatCap = rng.next() < M.capProb, capSide = rng.next() < 0.5 ? 1 : -1;
        const mid = (rho, a, out) => {
            const R = outR(a) * rho;
            const x = A * R * Math.cos(a), z = Bz * R * Math.sin(a);
            const eg = 1 - 0.35 * smooth(0.72, 1.0, rho);
            let h = crum(x, z) * eg;
            h += Math.sin(a * rufN + rufPh) * rufAmp * smooth(0.62, 1.0, rho);
            let u = x * cfb + z * sfb;
            const w = -x * sfb + z * cfb;
            let y = h;
            if (fold && u > fold.u0) { bend(u - fold.u0, h, fold, bt); u = fold.u0 + bt[0]; y = bt[1]; }
            else if (curl && u < -curl.u0) { bend(-u - curl.u0, h, curl, bt); u = -curl.u0 - bt[0]; y = bt[1]; }
            out[0] = u * cfb - w * sfb; out[1] = y; out[2] = u * sfb + w * cfb;
        };

        const per = (NR + 1) * (NA + 1);
        const nV = per * 2;
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const offs = new Float32Array(nV * 3);
        const base = new Float32Array(nV * 3);
        const wet = new Float32Array(nV);
        const idx = [];
        const p0 = [0, 0, 0], pu = [0, 0, 0], pv = [0, 0, 0];
        const H = M.thick / M.size * 0.5;
        const eps = 0.010;
        const fibA = rng.range(-0.3, 0.3) + Math.PI * 0.5;     // 繊維は短辺方向
        const uvK = M.size * 0.45;
        for (let side = 0; side < 2; side++) {
            const sgn = side ? -1 : 1;
            for (let i = 0; i <= NR; i++) {
                const rho = i / NR;
                for (let j = 0; j <= NA; j++) {
                    const a = (j % NA) / NA * TAU;
                    mid(rho, a, p0);
                    const r2 = Math.max(eps, rho);
                    mid(r2 + eps, a, pu);
                    mid(r2, a + eps, pv);
                    const ux = pu[0] - p0[0], uy = pu[1] - p0[1], uz = pu[2] - p0[2];
                    const vx = pv[0] - p0[0], vy = pv[1] - p0[1], vz = pv[2] - p0[2];
                    let nx = -(uy * vz - uz * vy), ny = -(uz * vx - ux * vz), nz = -(ux * vy - uy * vx);
                    let l = Math.hypot(nx, ny, nz) || 1;
                    nx /= l; ny /= l; nz /= l;
                    if (i === 0) {
                        const d = 0.004;
                        const hx = (crum(d, 0) - crum(-d, 0)) / (2 * d);
                        const hz = (crum(0, d) - crum(0, -d)) / (2 * d);
                        nx = -hx; ny = 1; nz = -hz;
                        l = Math.hypot(nx, ny, nz) || 1;
                        nx /= l; ny /= l; nz /= l;
                    }
                    const vo = side * per + i * (NA + 1) + j;
                    const p3 = vo * 3, p2 = vo * 2;
                    positions[p3] = p0[0] + nx * H * sgn;
                    positions[p3 + 1] = p0[1] + ny * H * sgn;
                    positions[p3 + 2] = p0[2] + nz * H * sgn;
                    offs[p3] = nx * sgn; offs[p3 + 1] = ny * sgn; offs[p3 + 2] = nz * sgn;
                    const R = outR(a) * rho;
                    const x0 = A * R * Math.cos(a), z0 = Bz * R * Math.sin(a);
                    const fx = x0 * Math.cos(fibA) + z0 * Math.sin(fibA);
                    const fz = -x0 * Math.sin(fibA) + z0 * Math.cos(fibA);
                    uvs[p2] = fx * uvK + (seed % 97) * 0.013; uvs[p2 + 1] = fz * uvK;
                    const zn = (z0 / Math.max(1e-3, Bz)) * capSide;
                    const capN = (Noise.fbm2(x0 * 1.8 + 3, 7.0, nSeed + 17, 2) - 0.5) * 0.30;
                    const cap = fatCap ? smooth(0.58, 0.74, zn + capN) : 0;
                    const marb = Noise.fbm2(fz * 6.5 + 3, fx * 1.2 + 8, nSeed + 21, 3);
                    const fat = clamp(Math.max(cap, smooth(0.64, 0.80, marb) * M.fatAmt), 0, 1);
                    const heat = Noise.fbm2(x0 * 2.8 + side * 13, z0 * 2.8, nSeed + 31, 3);
                    const spot = smooth(0.50, 0.72, heat);
                    let c = mix3(M.lean, M.sear, clamp(spot * 1.05, 0, 1) * 0.85);
                    c = mix3(c, M.deep, smooth(0.80, 1.0, rho) * 0.55);
                    const crest = fold ? smooth(0.0, 0.35, (x0 * cfb + z0 * sfb) - fold.u0) * (1 - smooth(0.35, 1.0, (x0 * cfb + z0 * sfb) - fold.u0)) : 0;
                    c = mix3(c, M.sear, crest * 0.55);
                    const fc = mix3(M.fat, M.fatSear, clamp(spot * 0.8 + smooth(0.85, 1.0, rho) * 0.4, 0, 1));
                    c = mix3(c, fc, fat);
                    base[p3] = c[0]; base[p3 + 1] = c[1]; base[p3 + 2] = c[2];
                    wet[vo] = mix(mix(M.wetBody, M.wetSear, spot), M.wetFat, fat);
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
        for (let j = 0; j < NA; j++) {
            const a = NR * (NA + 1) + j, b = per + NR * (NA + 1) + j;
            idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
        const indices = new Uint32Array(idx);
        const normals = finalizeOff(positions, indices, offs);
        weldRange(positions, normals, 0, per);
        weldRange(positions, normals, per, nV);
        applyPose(positions, normals, nV, q, M.size * sc, cx, cz);
        return {
            kind: "meat", seed, spec: M, nV, positions, indices, normals, uvs, base, wet,
            drape: 0.80, welds: [[0, per], [per, nV]]
        };
    }

    function porkNormalTex(scene) {
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
        return TexLab.normalFromHeight("porkN", N, H, 7.0, scene, false);
    }

    // ---- 玉ねぎ（くし切りの層）----------------------------------------
    // 【対策】幅 5〜8mm の帯を円弧に沿って掃引すると、黄色いリボンか
    //         乾いた竹の皮の削りくずに見える。参考写真の玉ねぎは
    //           ・くし切りの「層ひとつぶん」で、上下の極へ向かって細る
    //             三日月形（幅は赤道で 1.2〜2cm、両端は尖る）
    //           ・層の内外の面は玉ねぎの球面そのもので、幅方向にも反っている
    //           ・2〜3 枚が入れ子のまま剥がれきらずに付いていることが多い
    //           ・真珠のような半透明の白で、端と縁だけ焼けて金色
    //           ・長手（極から極）に細い筋が走り、照りが強い
    //         そこで、扁平な回転楕円体の殻を経線に沿って切り出し、
    //         くし切りの半角 tw で両側を落とした立体として作る。
    //         幅は ρ(ψ)·tw なので、極へ向かって自然に細って尖る
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
        const nLay = rng.next() < 0.45 ? 1 : (rng.next() < 0.65 ? 2 : 3);
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
            uvs: new Float32Array(acc.uv), base, wet, drape: 0.75, seeThrough: true, rigid: true
        };
    }

    const CABBAGE = {
        pale: [0.965, 0.970, 0.770],             // 芯に近い白い部分
        green: [0.755, 0.865, 0.380],            // 外葉側の淡い緑
        vein: [0.950, 0.955, 0.880],             // 葉脈（太く白い）
        rough: 0.62, coat: 0.12, coatRough: 0.30,
        trans: 0.62, transTint: [0.82, 0.95, 0.62]
    };

    function makeCabEnv(G, seed) {
        const c = placeXZ(G.cabAt);
        const Ru = G.cabRu, Rv = G.cabRv, Hh = G.cabH;
        return {
            cx: c[0], cz: c[1],
            q(x, z) {
                const dx = x - c[0], dz = z - c[1];
                const u = (dx * DIR_R[0] + dz * DIR_R[1]) / Ru;
                const v = -(dx * DIR_D[0] + dz * DIR_D[1]) / Rv;   // 奥が +
                return u * u + v * v;
            },
            h(x, z) {
                const qq = this.q(x, z);
                if (qq >= 1) return 0;
                const dx = x - c[0], dz = z - c[1];
                const v = -(dx * DIR_D[0] + dz * DIR_D[1]) / Rv;
                let h = Hh * Math.pow(1 - qq, 0.80) * (1 - 0.10 * v);
                h *= 1 + 0.16 * (Noise.fbm2(x * 0.55 + 3, z * 0.55 + 1, seed + 3, 3) - 0.5) * 2;
                h += 0.35 * (Noise.fbm2(x * 1.6, z * 1.6, seed + 7, 2) - 0.5) * smooth(0, 0.5, 1 - qq);
                return Math.max(0, h);
            }
        };
    }

    function buildCabbage(G, env, seed, extraFloor) {
        const C = CABBAGE, rng = new Rng(seed >>> 0);
        const acc = newAcc();
        const floorAt = (x, z) => innerYAt(G, Math.hypot(x, z));
        const N = G.cabN | 0;
        const nrm = [0, 0, 0];
        function envN(x, z, f) {
            const d = 0.06;
            const hx = (env.h(x + d, z) - env.h(x - d, z)) / (2 * d) * f;
            const hz = (env.h(x, z + d) - env.h(x, z - d)) / (2 * d) * f;
            const l = Math.hypot(hx, 1, hz);
            nrm[0] = -hx / l; nrm[1] = 1 / l; nrm[2] = -hz / l;
            return nrm;
        }
        for (let s = 0; s < N; s++) {
            const r = new Rng((seed + s * 7919) >>> 0);
            const f = .28+.72*Math.pow(r.next(),.45);
            const vein = r.next() < 0.08;
            const a0 = r.range(0, TAU), rr0 = Math.sqrt(r.next()) * 0.95;
            const u0 = Math.cos(a0) * rr0 * G.cabRu, v0 = Math.sin(a0) * rr0 * G.cabRv;
            let x = env.cx + DIR_R[0] * u0 - DIR_D[0] * v0;
            let z = env.cz + DIR_R[1] * u0 - DIR_D[1] * v0;
            let ph = r.range(0, TAU);
            const kap = r.gauss(0, 1.45);
            const L = r.range(2.3, 5.2);
            const ds = 0.16;
            const nSeg = Math.min(45, Math.max(12, Math.ceil(L / ds)));
            const arch = r.next() < 0.35 ? r.range(0.22, 0.95) * f : r.range(0, 0.08);
            const jy = r.range(0, 9);
            const localHeight=env.h(x,z);
            const path = [], ups = [];
            for (let i = 0; i <= nSeg; i++) {
                const t = i / nSeg;
                const qq = env.q(x, z);
                if (i > 2 && qq > 1.20) break;            // 皿へこぼれすぎたら切る
                const fl = floorAt(x, z);
                const hE = env.h(x, z);
                let y = fl + f * mix(localHeight,hE,.56) + arch * Math.sin(Math.PI * t) + .12*Math.sin(t*11+jy)
                    + 0.06 * (Noise.v2(t * 4 + jy, s * 0.37, seed + 11) - 0.5);
                y = Math.max(y, fl + 0.03);
                path.push([x, y, z]);
                const n = envN(x, z, f);
                ups.push([n[0], n[1], n[2]]);
                ph += kap * ds + Math.sin(t*8+jy)*.12 + r.gauss(0, 0.035);
                x += Math.cos(ph) * ds; z += Math.sin(ph) * ds;
            }
            if (path.length < 4) continue;
            const hw = vein ? r.range(0.055, 0.085) : r.range(0.06, 0.11);
            const ht = vein ? r.range(0.028, 0.040) : r.range(0.014, 0.020);
            const tw0 = r.gauss(0, 0.45), tw1 = r.gauss(0, 1.2);
            const nP = path.length;
            const secAt = (i) => {
                const t = i / Math.max(1, nP - 1);
                const ang = tw0 + tw1 * t;
                const ca = Math.cos(ang), sa = Math.sin(ang);
                const w = hw * (0.80 + 0.20 * Math.sin(Math.PI * t));
                return [[w * ca, w * sa], [-ht * sa, ht * ca], [-w * ca, -w * sa], [ht * sa, -ht * ca]];
            };
            const g0 = vein ? 0 : Math.pow(r.next(), 1.7) * 0.85;
            const gEnd = r.next() < 0.4 ? r.range(0.1, 0.45) : 0;
            const dirE = r.next() < 0.5;
            const ao = mix(0.64, 1.0, Math.pow(f, 1.4));
            const lean = r.range(0.96, 1.03);
            sweepInto(acc, path, ups, secAt, 0, (t, k) => {
                const gg = clamp(g0 + gEnd * (dirE ? t : 1 - t), 0, 1);
                let c = vein ? C.vein : mix3(C.pale, C.green, gg);
                if (k === 0 || k === 2) c = mix3(c, [1, 1, 0.94], 0.15);
                const k2 = ao * (path[Math.round(t * (nP - 1))][1] < extraFloor ? 0.85 : 1);
                return [c[0] * k2 * lean, c[1] * k2, c[2] * k2 / lean];
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
        return { positions, indices, normals, colors, uvs: new Float32Array(acc.uv), nV: acc.nV };
    }

    function cabbageMaterial(scene) {
        const C = CABBAGE;
        const m = new BABYLON.PBRMaterial("cabbageMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0.0;
        m.roughness = C.rough;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = C.coat;
        m.clearCoat.roughness = C.coatRough;
        m.clearCoat.indexOfRefraction = 1.33;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = C.trans;
        m.subSurface.tintColor = col3(C.transTint);
        m.subSurface.minimumThickness = 0.01;
        m.subSurface.maximumThickness = 0.10;
        return m;
    }

    const TOMATO = {
        red: [0.735, 0.072, 0.034],
        shoulder: [0.800, 0.200, 0.075],
        scar: [0.560, 0.440, 0.140],
        leaf: [0.205, 0.390, 0.110],
        leafTip: [0.300, 0.400, 0.150],
        stem: [0.300, 0.455, 0.160]
    };

    function buildTomato(G, seed, px, py, pz, yaw, tilt) {
        const T = TOMATO, rng = new Rng(seed >>> 0);
        const R = rng.range(1.28, 1.45);
        const flat = rng.range(0.88, 0.94);
        const NLa = 40, NLo = 72;
        const nV = (NLa + 1) * (NLo + 1);
        const positions = new Float32Array(nV * 3), uvs = new Float32Array(nV * 2);
        const colors = new Float32Array(nV * 4);
        const idx = [];
        const nSeed = seed + 71;
        const lobeN = 4 + rng.int(3), lobePh = rng.range(0, TAU);
        let vo = 0;
        for (let i = 0; i <= NLa; i++) {
            const psi = i / NLa * Math.PI;             // 0 = ヘタ側
            for (let j = 0; j <= NLo; j++) {
                const th = (j % NLo) / NLo * TAU;
                const s = Math.sin(psi), c = Math.cos(psi);
                let rr = R * (1 + 0.012 * Math.cos(lobeN * th + lobePh) * s
                    + 0.018 * (Noise.v3(Math.cos(th) * 1.3, c * 1.3, Math.sin(th) * 1.3, nSeed) - 0.5));
                let y = R * flat * c;
                const dimp = Math.pow(1 - smooth(0.0, 0.62, psi), 2.0);
                y -= dimp * R * 0.16;
                rr *= 1 - 0.10 * dimp;
                y += Math.pow(1 - smooth(0.0, 0.45, Math.PI - psi), 2) * R * 0.05;
                const p3 = vo * 3;
                positions[p3] = rr * s * Math.cos(th); positions[p3 + 1] = y; positions[p3 + 2] = rr * s * Math.sin(th);
                uvs[vo * 2] = j / NLo; uvs[vo * 2 + 1] = i / NLa;
                const streak = Math.pow(0.5 + 0.5 * Math.cos(th * 11 + 3 * Noise.v2(psi * 3, th, nSeed + 3)), 3)
                    * (1 - smooth(0.25, 0.95, psi));
                let col = mix3(T.red, T.shoulder, streak * 0.42 + (1 - smooth(0.0, 0.7, psi)) * 0.20);
                col = mix3(col, T.scar, 1 - smooth(0.06, 0.16, psi));
                const mot = Noise.fbm3(positions[p3] * 3, y * 3, positions[p3 + 2] * 3, nSeed + 9, 2) - 0.5;
                col = mix3(col, [col[0] * 0.92, col[1] * 0.85, col[2] * 0.85], clamp(0.5 + mot * 2, 0, 1) * 0.35);
                colors[vo * 4] = s2l(col[0]); colors[vo * 4 + 1] = s2l(col[1]); colors[vo * 4 + 2] = s2l(col[2]); colors[vo * 4 + 3] = 1;
                vo++;
            }
        }
        for (let i = 0; i < NLa; i++) {
            for (let j = 0; j < NLo; j++) {
                const a = i * (NLo + 1) + j, b = a + 1, c = a + NLo + 1, d = c + 1;
                idx.push(a, c, b, b, c, d);
            }
        }
        const indices = new Uint32Array(idx);
        const normals = finalize(positions, indices, new V3(0, 0, 0), 0, true);
        weldNormals(positions, normals);
        const yTop = R * flat - R * 0.16;

        const acc = newAcc();
        const nLeaf = 5 + rng.int(2);
        const ph0 = rng.range(0, TAU);
        const surfY = (rho) => {
            const psi = Math.asin(clamp(rho / R, 0, 1));
            const dimp = Math.pow(1 - smooth(0.0, 0.62, psi), 2.0);
            return R * flat * Math.cos(psi) - dimp * R * 0.16;
        };
        for (let k = 0; k < nLeaf; k++) {
            const a = ph0 + k / nLeaf * TAU + rng.gauss(0, 0.12);
            const len = rng.range(0.85, 1.35);
            const lift = rng.range(0.10, 0.45);     // 先のめくれ
            const sway = rng.gauss(0, 0.25);
            const path = [], ups = [];
            const NP = 14;
            for (let i = 0; i < NP; i++) {
                const t = i / (NP - 1);
                const rho = 0.06 + t * len;
                const aa = a + sway * t * t;
                const y0 = surfY(Math.min(rho, R * 0.98)) + 0.035;
                const y = y0 + lift * Math.pow(t, 2.6) + 0.05 * (1 - t);
                path.push([Math.cos(aa) * rho, y, Math.sin(aa) * rho]);
                ups.push([0, 1, 0]);
            }
            sweepInto(acc, path, ups, (i) => {
                const t = i / (NP - 1);
                const w = mix(0.11, 0.018, Math.pow(t, 0.8)) * (1 + 0.4 * Math.sin(Math.PI * t * 0.8));
                const h = 0.022 * (1 - 0.5 * t);
                return [[w, 0], [w * 0.4, h], [-w * 0.4, h], [-w, 0], [-w * 0.4, -h], [w * 0.4, -h]];
            }, 1, (t) => mix3(T.leaf, T.leafTip, smooth(0.6, 1.0, t)));
        }
        {
            const path = [], NP = 10;
            const sl = rng.range(0.45, 0.80), bx = rng.gauss(0, 0.25), bz = rng.gauss(0, 0.25);
            for (let i = 0; i < NP; i++) {
                const t = i / (NP - 1);
                path.push([bx * t * t * sl, yTop + 0.02 + t * sl, bz * t * t * sl]);
            }
            const ring = [];
            for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; ring.push([Math.cos(a), Math.sin(a)]); }
            sweepInto(acc, path, null, (i) => {
                const t = i / (NP - 1), r = mix(0.10, 0.075, t) * (i === 0 ? 1.4 : 1);
                return ring.map((p) => [p[0] * r, p[1] * r]);
            }, 1, () => T.stem);
        }
        const cpos = new Float32Array(acc.pos), cidx = new Uint32Array(acc.idx);
        const cnor = finalizeOff(cpos, cidx, new Float32Array(acc.off));
        const ccol = new Float32Array(acc.nV * 4);
        for (let i = 0; i < acc.nV; i++) {
            ccol[i * 4] = s2l(acc.col[i * 3]); ccol[i * 4 + 1] = s2l(acc.col[i * 3 + 1]);
            ccol[i * 4 + 2] = s2l(acc.col[i * 3 + 2]); ccol[i * 4 + 3] = 1;
        }
        const q = BABYLON.Quaternion.RotationYawPitchRoll(yaw, tilt, 0);
        const yOff = R * flat;       // 実の底を (px, py, pz) に
        applyPose(positions, normals, nV, q, 1.0, px, pz);
        shiftY(positions, nV, py + yOff);
        applyPose(cpos, cnor, acc.nV, q, 1.0, px, pz);
        shiftY(cpos, acc.nV, py + yOff);
        return {
            R: R, H: R * flat * 2,
            body: { positions, indices, normals, uvs, colors, nV },
            calyx: { positions: cpos, indices: cidx, normals: cnor, uvs: new Float32Array(acc.uv), colors: ccol, nV: acc.nV }
        };
    }

    function tomatoMaterials(scene) {
        const b = new BABYLON.PBRMaterial("tomatoMat", scene);
        b.albedoColor = new BABYLON.Color3(1, 1, 1);
        b.metallic = 0; b.roughness = 0.34;
        b.clearCoat.isEnabled = true;
        b.clearCoat.intensity = 1.0;
        b.clearCoat.roughness = 0.065;
        b.clearCoat.indexOfRefraction = 1.45;
        b.subSurface.isTranslucencyEnabled = true;
        b.subSurface.translucencyIntensity = 0.48;
        b.subSurface.tintColor = col3([0.95, 0.20, 0.08]);
        b.subSurface.minimumThickness = 0.05;
        b.subSurface.maximumThickness = 1.2;
        const c = new BABYLON.PBRMaterial("calyxMat", scene);
        c.albedoColor = new BABYLON.Color3(1, 1, 1);
        c.metallic = 0; c.roughness = 0.58;
        c.subSurface.isTranslucencyEnabled = true;
        c.subSurface.translucencyIntensity = 0.30;
        c.subSurface.tintColor = col3([0.55, 0.85, 0.30]);
        c.subSurface.minimumThickness = 0.01;
        c.subSurface.maximumThickness = 0.08;
        return { body: b, calyx: c };
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
            const q = rigid ? 1.0 : G.liftQuantile;
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
        const moved = fitInsidePlate(pos, nV, G, 0.35);
        if (moved > 0) {
            const p2 = field.probe(pos, idx, 0, 0, G, piece.rigid);
            if (p2.cells) shiftY(pos, nV, p2.dy);
            fitInsidePlate(pos, nV, G, 0.35);
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
        field.liftHard(pos, idx, nV, 0.02);
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

    const GLAZE = { soak: 0.22, poolK: 1.00, hazeMix: 0.60 };

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
            m.albedoTexture = porkDetail;
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

    function buildComposition(G, fill, seed, env, withTomato) {
        const field = new Field(G.pileGrid, G.pileHalf, (x, z) => {
            const r = Math.hypot(x, z);
            if (r > G.rIn) return 40;
            const hc = env.h(x, z);
            return innerYAt(G, r) + (hc > 0 ? hc * 0.60 + 0.05 : 0);
        });
        const tomatoes = [];
        if (withTomato) {
            const tr = new Rng((seed ^ 0x70A7) >>> 0);
            // 皿の右の縁寄り（キャベツの山の外、口縁の立ち上がりの手前）
            const tc = placeXZ([-0.6, 8.7]);
            const placed = [];
            for (let k = 0; k < G.tomatoN; k++) {
                let best = null;
                for (let t = 0; t < 60 && !best; t++) {
                    // 【対策】縁の近くは狭く、円の中でランダムに探すと 3 個目の置き場が
                    //         無くなる。皿の中心から見た角度で縁に沿って弧状に並べる
                    const base = Math.atan2(tc[1], tc[0]);
                    const ang = base + (k - (G.tomatoN - 1) * 0.5) * 0.335 + tr.gauss(0, 0.04 + t * 0.004);
                    const rad = tr.range(8.35, 9.25) - t * 0.02;
                    const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad;
                    if (Math.hypot(x, z) > G.rIn - 1.9) continue;
                    let ok = true;
                    for (const p of placed) if (Math.hypot(p[0] - x, p[1] - z) < 2.80) { ok = false; break; }
                    if (ok) best = [x, z];
                }
                if (!best) continue;
                placed.push(best);
                let py = -1e9;
                for (let s = 0; s < 9; s++) {
                    const a = s / 9 * TAU, rr = s ? 0.75 : 0;
                    const x = best[0] + Math.cos(a) * rr, z = best[1] + Math.sin(a) * rr;
                    py = Math.max(py, innerYAt(G, Math.hypot(x, z)) + env.h(x, z) * 0.70);
                }
                const tm = buildTomato(G, (seed + 4099 * (k + 1)) >>> 0, best[0], py - 0.04, best[1],
                    tr.range(0, TAU), tr.gauss(0, 0.30));
                field.deposit(tm.body.positions, tm.body.indices, null, false);
                tomatoes.push(tm);
            }
        }
        const mc = placeXZ(G.meatAt);
        const total = fill.meat + fill.onion;
        const order = [];
        let nOn = 0;
        for (let i = 0; i < total; i++) {
            // 【対策】均等に挟むと、大きい肉に覆われてほとんど見えなくなる。写真の
            //         玉ねぎは肉の上にも乗っているので、後半（上の層）に寄せる
            const want = Math.round(fill.onion * Math.pow((i + 0.5) / total, 1.6));
            if (nOn < want && nOn < fill.onion) { order.push("onion"); nOn++; }
            else order.push("meat");
        }
        const pieces = [];
        for (let i = 0; i < order.length; i++) {
            const kind = order[i];
            const sd = (seed ^ 0x5A17) + i * 7919;
            const r2 = new Rng(sd);
            const Q = BABYLON.Quaternion;
            let q;
            if (kind === "meat") {
                q = Q.RotationYawPitchRoll(r2.range(0, TAU), r2.gauss(0, 0.32),
                    r2.gauss(0, 0.32) + (r2.next() < 0.25 ? Math.PI : 0));
            } else {
                // 三日月は寝た状態で作ってあるので、傾きは小さく。1 割だけ肉に立てかかる
                const edge = r2.next() < 0.10;
                q = Q.RotationYawPitchRoll(r2.range(0, TAU),
                    edge ? 0.9 + r2.gauss(0, 0.20) : r2.gauss(0, 0.22), r2.gauss(0, 0.22));
            }
            const a = GOLD * i + r2.range(-0.35, 0.35);
            const frac = i / Math.max(1, order.length - 1);
            const rr = G.pileR * Math.sqrt(mix(0.02, 1.0, Math.pow(frac, 1 - G.pileDome))) * r2.range(0.78, 1.02);
            let cx = mc[0] + Math.cos(a) * rr, cz = mc[1] + Math.sin(a) * rr;
            for (let it = 0; it < 20 && env.q(cx, cz) < 0.85; it++) {
                cx = mix(cx, mc[0], 0.12); cz = mix(cz, mc[1], 0.12);
            }
            const sc = r2.range(0.86, 1.14);
            const p = kind === "meat" ? buildPorkSheet(sc, q, cx, cz, sd) : buildOnionStrip(sc, q, cx, cz, sd);
            const bb = bounds(p.positions, p.nV);
            shiftY(p.positions, p.nV, G.yFloor - bb.y0);
            dropPiece(field, p, G, r2, cx, cz, kind === "meat" ? 1.0 : 1.3, mc);
            pieces.push(p);
        }
        field.buildDistance();
        return { field, pieces, tomatoes, mc };
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


    function makePoolMask(G, sauce, field, seed) {
        const sp = sauce.spread;
        return (x, z) => {
            const d = field.distAt(x, z);
            const n = Noise.fbm2(x * 0.42 + 5, z * 0.42 + 1, seed, 3);
            const r0 = sp * (0.05 + 1.45 * Math.pow(n, 1.9));
            let m = 1 - smooth(r0, r0 + 0.22, d);
            const r = Math.hypot(x, z);
            m *= 1 - smooth(G.rIn - 2.2, G.rIn - 1.0, r);
            return m;
        };
    }

    function poolFields(G, field, sauce, saraAlbedo, seed, mask) {
        const N = Math.max(64, Math.round(G.poolTex) || 512), n2 = N * N;
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
        const n = field.n;
        for (let iz = 0; iz < n; iz++) {
            for (let ix = 0; ix < n; ix++) {
                if (!field.occ[iz * n + ix]) continue;
                const x = field._wx(ix), z = field._wx(iz);
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
            }
        }
        const mg = 2.4 * sauce.spread + 0.4;
        const cx = (x0 + x1) * 0.5, cz = (z0 + z1) * 0.5;
        const half = Math.max(x1 - x0, z1 - z0) * 0.5 + mg;
        const F = {
            N, half, cx, cz, mask,
            m: new Float32Array(n2), dep: new Float32Array(n2),
            objR: new Float32Array(n2), objG: new Float32Array(n2), objB: new Float32Array(n2),
            near: new Float32Array(n2), oil: new Float32Array(n2), oilRim: new Float32Array(n2),
            mottle: new Float32Array(n2), ginger: new Float32Array(n2), ripple: new Float32Array(n2)
        };
        const rng = new Rng(seed >>> 0);
        const drops = [];
        const nd = 26 + rng.int(20);
        for (let i = 0; i < nd; i++) {
            drops.push({
                x: cx + rng.range(-half, half), z: cz + rng.range(-half, half),
                r: rng.range(0.04, 0.20)
            });
        }
        const BW = [s2l(saraAlbedo[0]), s2l(saraAlbedo[1]), s2l(saraAlbedo[2])];
        for (let py = 0; py < N; py++) {
            const z = cz + ((py + 0.5) / N * 2 - 1) * half;
            for (let px = 0; px < N; px++) {
                const x = cx + ((px + 0.5) / N * 2 - 1) * half;
                const k = py * N + px;
                const m = mask(x, z);
                F.m[k] = m;
                F.dep[k] = sauce.depth * Math.sqrt(m);
                F.objR[k] = BW[0]; F.objG[k] = BW[1]; F.objB[k] = BW[2];
                F.near[k] = field.distAt(x, z);
                const m1 = Noise.fbm2(x * 0.9 + 3, z * 0.9 + 7, seed + 11, 3) - 0.5;
                const m2 = Noise.fbm2(x * 3.6 + 13, z * 3.6 + 2, seed + 29, 2) - 0.5;
                F.mottle[k] = clamp(0.5 + m1 * 1.1 + m2 * 0.6, 0, 1);
                const gs = 9.0;
                const gi = Math.floor(x * gs), gj = Math.floor(z * gs);
                let g = 0;
                const h = Noise._h2(gi, gj, seed + 61);
                if (h > 0.955) {
                    const ga = Noise._h2(gi, gj, seed + 67) * Math.PI;
                    const ux = x * gs - (gi + 0.5), uz = z * gs - (gj + 0.5);
                    const a1 = ux * Math.cos(ga) + uz * Math.sin(ga), a2 = -ux * Math.sin(ga) + uz * Math.cos(ga);
                    g = 1 - smooth(0.6, 1.0, Math.hypot(a1 / 0.42, a2 / 0.10));
                }
                F.ginger[k] = g * m;
                let oi = 0, orim = 0;
                for (const dp of drops) {
                    const lim = dp.r * 1.25;
                    const ax = x - dp.x; if (ax > lim || ax < -lim) continue;
                    const az = z - dp.z; if (az > lim || az < -lim) continue;
                    const dd = Math.hypot(ax, az);
                    if (dd > lim) continue;
                    oi = Math.max(oi, 1 - smooth(dp.r * 0.72, dp.r, dd));
                    orim = Math.max(orim, 1 - smooth(0.0, dp.r * 0.18, Math.abs(dd - dp.r * 0.87)));
                }
                F.oil[k] = oi * smooth(0.3, 0.7, m); F.oilRim[k] = orim * smooth(0.3, 0.7, m);
                F.ripple[k] = Noise.fbm2p(px / N * 8, py / N * 8, 8, 8, seed + 97, 3) - 0.5;
            }
        }
        return F;
    }

    function poolAlbedoFill(d, N, F, sauce, live) {
        const rd = live.reduce;
        const s0 = sauce.sigma[0] * rd, s1 = sauce.sigma[1] * rd, s2 = sauce.sigma[2] * rd;
        const H0 = s2l(sauce.haze[0]), H1 = s2l(sauce.haze[1]), H2 = s2l(sauce.haze[2]);
        const G0 = s2l(0.820), G1 = s2l(0.690), G2 = s2l(0.360);
        const hk = sauce.hazeK, kOil = sauce.oil;
        const n2 = N * N;
        for (let k = 0; k < n2; k++) {
            const dep = F.dep[k];
            const tr = Math.exp(-s0 * 2 * dep), tg = Math.exp(-s1 * 2 * dep), tb = Math.exp(-s2 * 2 * dep);
            let r = F.objR[k] * tr, g = F.objG[k] * tg, b = F.objB[k] * tb;
            const hz = (1 - tg) * hk * (0.70 + 0.60 * F.mottle[k]);
            r += (H0 - r) * hz; g += (H1 - g) * hz; b += (H2 - b) * hz;
            const nd = F.near[k];
            let sh = nd / 0.30; sh = sh < 0 ? 0 : (sh > 1 ? 1 : sh);
            sh = 1 - sh * sh * (3 - 2 * sh);
            if (sh > 0) { const w = sh * 0.50; r += (r * 0.55 - r) * w; g += (g * 0.52 - g) * w; b += (b * 0.50 - b) * w; }
            const gn = F.ginger[k] * 0.75;
            if (gn > 0) { r += (G0 * 0.8 - r) * gn; g += (G1 * 0.8 - g) * gn; b += (G2 * 0.8 - b) * gn; }
            const ol = F.oil[k] * kOil * 0.40;
            if (ol > 0) { r += (r * 1.12 + 0.004 - r) * ol; g += (g * 1.07 - g) * ol; b += (b * 0.92 - b) * ol; }
            const o = k * 4;
            d[o] = l2sFast(r) * 255; d[o + 1] = l2sFast(g) * 255; d[o + 2] = l2sFast(b) * 255; d[o + 3] = 255;
        }
    }

    function poolTextures(scene, G, F, sauce, live) {
        const N = F.N, n2 = N * N;
        const albedo = TexLab._tex("poolA", N, N, (d) => poolAlbedoFill(d, N, F, sauce, live), scene, false, true);
        albedo.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        const coat = TexLab._tex("poolC", N, N, (d) => {
            for (let k = 0; k < n2; k++) {
                const oil = F.oil[k] * sauce.oil;
                const cov = clamp(0.55 + 0.45 * smooth(0.0, 0.35, F.m[k]) + 0.10 * oil, 0, 1);
                let ro = sauce.rough * (1 - 0.40 * oil) + 0.10 * (1 - smooth(0.0, 0.4, F.m[k]));
                ro += (1 - smooth(0.0, 0.14, F.near[k])) * 0.10;
                const o = k * 4;
                d[o] = cov * 255; d[o + 1] = clamp(ro, 0.02, 0.9) * 255; d[o + 2] = 0; d[o + 3] = 255;
            }
        }, scene, true, true);
        coat.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        const orm = TexLab._tex("poolO", N, N, (d) => {
            for (let k = 0; k < n2; k++) {
                const ao = clamp(1 - 0.45 * (1 - smooth(0.0, 0.30, F.near[k])), 0.25, 1);
                const o = k * 4;
                d[o] = ao * 255; d[o + 1] = 0.55 * 255; d[o + 2] = 0; d[o + 3] = 255;
            }
        }, scene, true, true);
        orm.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        const H = new Float32Array(n2);
        for (let k = 0; k < n2; k++) {
            H[k] = clamp(0.5 + F.ripple[k] * 0.4 + F.oilRim[k] * 0.26 * sauce.oil - F.oil[k] * sauce.oil * 0.07, 0, 1);
        }
        const ripple = TexLab.normalFromHeight("poolN", N, H, 1.0, scene, false);
        return { albedo, coat, orm, ripple };
    }

    function poolMaterial(scene, tex, sauce, live, name) {
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = tex.albedo;
        m.metallic = 0.0;
        m.roughness = 1.0;
        m.metallicTexture = tex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = tex.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        m.clearCoat.intensity = 1.0;
        m.clearCoat.roughness = clamp(sauce.rough / Math.max(0.2, live.gloss), 0.01, 0.6);
        m.clearCoat.indexOfRefraction = 1.42;
        m.clearCoat.bumpTexture = tex.ripple;
        m.clearCoat.bumpTexture.level = 0.30;
        tex.ripple.uScale = 2.0; tex.ripple.vScale = 2.0;
        return m;
    }

    function buildPoolSurface(scene, G, F, mat, sauce) {
        const cell = G.poolCell;
        const n = Math.max(8, Math.ceil(F.half * 2 / cell)) + 1;
        const step = F.half * 2 / (n - 1);
        const positions = new Float32Array(n * n * 3), uvs = new Float32Array(n * n * 2);
        const mv = new Float32Array(n * n);
        for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
                const x = F.cx - F.half + i * step, z = F.cz - F.half + j * step;
                const k = j * n + i;
                const m = F.mask(x, z);
                mv[k] = m;
                const fl = innerYAt(G, Math.hypot(x, z));
                const rp = Noise.fbm2(x * 3.0, z * 3.0, 707, 2) - 0.5;
                const y = fl + 0.006 + sauce.depth * Math.sqrt(m) + rp * G.ripple * m
                    - 0.07 * (1 - smooth(0.0, 0.15, m));
                positions[k * 3] = x; positions[k * 3 + 1] = y; positions[k * 3 + 2] = z;
                uvs[k * 2] = (x - F.cx) / F.half * 0.5 + 0.5;
                uvs[k * 2 + 1] = (z - F.cz) / F.half * 0.5 + 0.5;
            }
        }
        const idx = [];
        for (let j = 0; j < n - 1; j++) {
            for (let i = 0; i < n - 1; i++) {
                const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
                if (mv[a] <= 0.002 && mv[b] <= 0.002 && mv[c] <= 0.002 && mv[d] <= 0.002) continue;
                idx.push(a, b, c, b, d, c);
            }
        }
        const indices = new Uint32Array(idx.length ? idx : [0, 0, 0]);
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        let up = 0;
        for (let i = 1; i < normals.length; i += 3) up += normals[i];
        if (up < 0) {
            for (let k = 0; k < indices.length; k += 3) { const t = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = t; }
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        const mesh = makeMesh("tarePool", positions, indices, normals, uvs, null, scene);
        mesh.material = mat;
        mesh.receiveShadows = true;
        return mesh;
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

    const camTarget = placeXZ([-0.6, 0.6]);
    const camera = new BABYLON.ArcRotateCamera("cam", -1.14, 0.98, 78,
        new V3(camTarget[0], 2.4, camTarget[1]), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 4;
    camera.fov = 0.352;
    camera.minZ = 0.5;
    camera.maxZ = 2500;
    camera.lowerRadiusLimit = 43;
    camera.upperRadiusLimit = 190;
    camera.upperBetaLimit = 1.44;
    camera.lowerBetaLimit = 0.15;
    camera.panningSensibility = 110;
    const fitCamera=()=>{const a=engine.getRenderWidth()/engine.getRenderHeight();camera.fov=a<1.2?2*Math.atan(Math.tan(.352/2)*1.2/a):.352;};
    fitCamera();const resizeObserver=engine.onResizeObservable.add(fitCamera);
    scene.onDisposeObservable.add(()=>engine.onResizeObservable.remove(resizeObserver));
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.44, -0.92, 0.50).normalize(), scene);
    key.position = new V3(18, 34, -20);
    key.intensity = 3.0;
    key.diffuse = new BABYLON.Color3(1.0, 0.972, 0.932);
    key.autoUpdateExtends = false;
    key.orthoLeft = -27; key.orthoRight = 27;
    key.orthoBottom = -27; key.orthoTop = 27;
    key.shadowMinZ = 1; key.shadowMaxZ = 95;

    const kick1 = new BABYLON.DirectionalLight("kick1", new V3(0.58, -0.34, -1.0).normalize(), scene);
    kick1.intensity = 0.65;
    kick1.diffuse = new BABYLON.Color3(0.052, 0.050, 0.046);
    kick1.specular = new BABYLON.Color3(1.0, 0.965, 0.905);
    const kick2 = new BABYLON.DirectionalLight("kick2", new V3(-0.86, -0.52, -0.40).normalize(), scene);
    kick2.intensity = 0.42;
    kick2.diffuse = new BABYLON.Color3(0.040, 0.038, 0.036);
    kick2.specular = new BABYLON.Color3(0.92, 0.94, 1.0);

    const fill = new BABYLON.HemisphericLight("fill", new V3(-0.2, 1, -0.35), scene);
    fill.intensity = 0.20;
    fill.diffuse = new BABYLON.Color3(0.97, 0.975, 1.0);
    fill.groundColor = new BABYLON.Color3(0.33, 0.30, 0.27);
    fill.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0030;
    sg.normalBias = 0.010;
    sg.setDarkness(0.12);

    const tableWood = woodSet(scene, "table", 640, 7717, {
        base: [0.640, 0.498, 0.355], grain: [0.565, 0.426, 0.293],
        dark: [0.392, 0.270, 0.185],
        rings: 95.0, wave: 1.0, sharp: 2.3, knot: 0.30, rough: 0.46, bump: 0.7,
        across: true
    });
    const table = BABYLON.MeshBuilder.CreateGround("table", { width: 2000, height: 2000 }, scene);
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
    tableMat.clearCoat.intensity = 0.20;
    tableMat.clearCoat.roughness = 0.36;
    for (const t of [tableWood.albedo, tableWood.orm, tableWood.normal]) { t.uScale = 40; t.vScale = 40; }
    table.material = tableMat;
    table.receiveShadows = true;

    const sundryRng = new Rng(0x7A11CE);
    const chopWood = woodSet(scene, "chop", 256, 3331, {
        base: [0.760, 0.620, 0.470], grain: [0.640, 0.500, 0.360],
        dark: [0.520, 0.390, 0.270],
        rings: 30.0, wave: 1.5, sharp: 1.9, knot: 0.10, rough: 0.48, bump: 0.6
    });
    const chopMat = new BABYLON.PBRMaterial("chopMat", scene);
    chopMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    chopMat.albedoTexture = chopWood.albedo;
    chopMat.metallic = 0.0; chopMat.roughness = 1.0;
    chopMat.metallicTexture = chopWood.orm;
    chopMat.useRoughnessFromMetallicTextureGreen = true;
    chopMat.bumpTexture = chopWood.normal;
    chopMat.bumpTexture.level = 0.35;
    chopMat.clearCoat.isEnabled = true;
    chopMat.clearCoat.intensity = 0.25;
    chopMat.clearCoat.roughness = 0.35;

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

    const CHOP_LEN = 22.0, CHOP_R = 0.275;
    const restW = 4.05, restD = 1.66, restH = 1.48, restDip = 0.50;
    const rp = placeXZ([15.0, -5.2]);
    const restPos = { x: rp[0], y: restH * 0.5, z: rp[1] };
    const contact = new V3(restPos.x, restH - restDip + 0.17, restPos.z);
    const awayXZ = new V3(DIR_R[0] - 0.10 * DIR_D[0], 0, DIR_R[1] - 0.10 * DIR_D[1]).normalize();
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
        const o = perp.scale((i === 0 ? -1 : 1) * 0.30);
        const c = buildChopstick(scene, "chopstick", sundryRng, butt.add(o), tip.add(o.scale(0.80)));
        c.material = chopMat;
        c.receiveShadows = true;
        chopsticks.push(c);
    }
    const rest = buildRest(scene, restW, restH, restD, 0.16, restDip, restPos, Math.atan2(-perp.z, perp.x));
    rest.material = restMat;
    rest.receiveShadows = true;
    const sundry = chopsticks.concat([rest]);
    for (const m of sundry) sg.addShadowCaster(m, true);

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
    const mcXZ = placeXZ(GLOBAL.meatAt);
    const steam = new BABYLON.ParticleSystem("steam", 400, scene);
    steam.particleTexture = steamTex;
    steam.emitter = new V3(mcXZ[0], 4.6, mcXZ[1]);
    steam.minEmitBox = new V3(-3.4, -0.4, -3.4);
    steam.maxEmitBox = new V3(3.4, 0.4, 3.4);
    steam.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    steam.color1 = new BABYLON.Color4(1, 1, 1, 0.040);
    steam.color2 = new BABYLON.Color4(0.95, 0.95, 0.96, 0.018);
    steam.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    steam.minSize = 1.0; steam.maxSize = 3.2;
    steam.minLifeTime = 2.0; steam.maxLifeTime = 3.6;
    steam.emitRate = 80;
    steam.gravity = new V3(0.25, 1.3, 0);
    steam.direction1 = new V3(-0.35, 1.5, -0.35);
    steam.direction2 = new V3(0.45, 2.6, 0.35);
    steam.minAngularSpeed = -0.45; steam.maxAngularSpeed = 0.45;
    steam.minEmitPower = 0.35; steam.maxEmitPower = 0.95;
    steam.updateSpeed = 0.012;

    const saraMatCache = {};
    const pieceMats = {};
    const porkBump = porkNormalTex(scene);
    const porkDetail=TexLab._tex("cooked-fibers",512,512,(d)=>{
        for(let y=0;y<512;y++)for(let x=0;x<512;x++){
            const fib=Noise.fbm2p(x/512*9,y/512*125,9,125,823,3);
            const pores=Noise.fbm2p(x/512*90,y/512*90,90,90,941,2);
            const n=.77+.20*fib+.07*pores; const k=(y*512+x)*4;
            d[k]=255*n;d[k+1]=255*n;d[k+2]=255*n;d[k+3]=255;
        }
    },scene,false,false);
    const onionHeight=new Float32Array(256*256);
    for(let y=0;y<256;y++)for(let x=0;x<256;x++)onionHeight[y*256+x]=.5+.11*Math.sin(x/256*TAU*24+Math.sin(y/256*TAU)*.5)+.07*Noise.fbm2p(x/256*32,y/256*6,32,6,714,2);
    const onionBump=TexLab.normalFromHeight("onion-cell-fibers",256,onionHeight,2.4,scene,false);onionBump.level=.35;
    const gingerMat=new BABYLON.PBRMaterial("grated ginger",scene);
    gingerMat.albedoColor=col3([.79,.61,.32]);gingerMat.metallic=0;gingerMat.roughness=.48;
    gingerMat.clearCoat.isEnabled=true;gingerMat.clearCoat.intensity=.55;gingerMat.clearCoat.roughness=.22;
    const cabMat = cabbageMaterial(scene);
    const tomMats = tomatoMaterials(scene);

    let currentSauce = START_SAUCE, currentSara = START_SARA, currentFill = START_FILL;
    let currentSeed = START_SEED >>> 0;
    let withTomato = true;
    let state = null;
    let onRebuilt = null;
    let ssao = null;
    let glazeDirty = false, poolDirty = false;

    const live = { reduce: 0.72, wetAmt: 0.70, gloss: 0.85, trans: 1.0 };

    function getSaraMat(k) {
        if (!saraMatCache[k]) saraMatCache[k] = saraMaterial(scene, GLOBAL, SARAS[k], "saraMat_" + k, 4001 + k.length * 37);
        return saraMatCache[k];
    }
    function rebuildPieceMats(sauce) {
        for (const k in pieceMats) { pieceMats[k].dispose(false, false); delete pieceMats[k]; }
        pieceMats.meat = pieceMaterial(scene, PORKS.loin, "mat_meat", sauce, live, porkBump);
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
        if (state && state.poolMat) {
            state.poolMat.clearCoat.roughness = clamp(sauce.rough / Math.max(0.2, live.gloss), 0.01, 0.6);
        }
    }
    function poolY() { return GLOBAL.yFloor + SAUCES[currentSauce].depth; }

    function disposePool(st) {
        if (!st) return;
        if (st.pool) { st.pool.dispose(); st.pool = null; }
        if (st.poolMat) { st.poolMat.dispose(false, false); st.poolMat = null; }
        if (st.poolTex) { for (const k in st.poolTex) st.poolTex[k].dispose(); st.poolTex = null; }
    }
    function disposeFood(st) {
        if (!st) return;
        for (const m of (st.meshes || [])) m.dispose();
        for (const m of (st.tomMeshes || [])) m.dispose();
        if (st.cabbage) st.cabbage.dispose();
        st.meshes = []; st.tomMeshes = []; st.pieces = []; st.cabbage = null;
    }

    function buildFood(seed) {
        const fill = FILLS[currentFill], sauce = SAUCES[currentSauce];
        const now = () => (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
        const t0 = now();
        const cenv = makeCabEnv(GLOBAL, (seed ^ 0xCAB) >>> 0);
        const comp = buildComposition(GLOBAL, fill, seed, cenv, withTomato);
        const t1 = now();
        const meshes = [];
        const py = poolY();
        for (const p of comp.pieces) {
            bakeGlaze(p, comp.field, sauce, py, GLOBAL, live);
            const mesh = makeMesh(p.kind, p.positions, p.indices, p.normals, p.uvs, p.colors, scene, true);
            mesh.material = pieceMats[p.kind];
            sg.addShadowCaster(mesh, true);
            mesh.receiveShadows = true;
            p.mesh = mesh;
            meshes.push(mesh);
        }
        const ginger=BABYLON.MeshBuilder.CreateIcoSphere("ginger",{radius:1,subdivisions:1},scene);
        ginger.material=gingerMat;ginger.receiveShadows=true;
        const matrices=[],grng=new Rng(seed^91017);
        for(const p of comp.pieces){if(p.kind!=="meat")continue;
            for(let n=0;n<42;n++){
                const i=grng.int(p.nV),k=i*3,x=p.positions[k],y=p.positions[k+1],z=p.positions[k+2];
                if(p.normals[k+1]<.35 || Math.abs(comp.field.topAt(x,z)-y)>.10)continue;
                const s=grng.range(.022,.065);
                const matrix=BABYLON.Matrix.Compose(new V3(s,s*.48,s*1.7),BABYLON.Quaternion.RotationYawPitchRoll(grng.range(0,TAU),0,0),new V3(x,y+.018,z));
                matrices.push(...matrix.m);
            }
        }
        if(matrices.length)ginger.thinInstanceSetBuffer("matrix",new Float32Array(matrices),16,true);else ginger.setEnabled(false);
        ginger.tris=ginger.getTotalIndices()/3*(matrices.length/16);meshes.push(ginger);
        const cb = buildCabbage(GLOBAL, cenv, (seed ^ 0x51CE) >>> 0, GLOBAL.yFloor + 0.25);
        const cabbage = makeMesh("cabbage", cb.positions, cb.indices, cb.normals, cb.uvs, cb.colors, scene);
        cabbage.material = cabMat;
        cabbage.receiveShadows = true;
        sg.addShadowCaster(cabbage, true);
        const t2 = now();
        const tomMeshes = [];
        for (const tm of comp.tomatoes) {
            const b = makeMesh("tomato", tm.body.positions, tm.body.indices, tm.body.normals, tm.body.uvs, tm.body.colors, scene);
            b.material = tomMats.body; b.receiveShadows = true; sg.addShadowCaster(b, true);
            const c = makeMesh("calyx", tm.calyx.positions, tm.calyx.indices, tm.calyx.normals, tm.calyx.uvs, tm.calyx.colors, scene);
            c.material = tomMats.calyx; c.receiveShadows = true; sg.addShadowCaster(c, true);
            tomMeshes.push(b, c);
        }
        return {
            pieces: comp.pieces, meshes, field: comp.field, mc: comp.mc, cabbage, cabTris: cb.indices.length / 3,
            tomMeshes, ms: Math.round(t1 - t0), msCab: Math.round(t2 - t1)
        };
    }

    function buildPool(st) {
        const sauce = SAUCES[currentSauce], sp = SARAS[currentSara];
        const mask = makePoolMask(GLOBAL, sauce, st.field, (currentSeed ^ 0x7A4E) >>> 0);
        st.F = poolFields(GLOBAL, st.field, sauce, sp.albedo, (currentSeed ^ 0x1B0A) >>> 0, mask);
        st.poolTex = poolTextures(scene, GLOBAL, st.F, sauce, live);
        st.poolMat = poolMaterial(scene, st.poolTex, sauce, live, "poolMat");
        st.pool = buildPoolSurface(scene, GLOBAL, st.F, st.poolMat, sauce);
    }

    function redrawGlaze() {
        if (!state) return;
        const sauce = SAUCES[currentSauce], py = poolY();
        for (const p of state.pieces) {
            bakeGlaze(p, state.field, sauce, py, GLOBAL, live);
            if (p.mesh) p.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, p.colors, false, false);
        }
    }
    function redrawPool() {
        if (!state || !state.poolTex) return;
        const dt = state.poolTex.albedo, N = state.F.N;
        const ctx = dt.getContext();
        const img = ctx.createImageData(N, N);
        poolAlbedoFill(img.data, N, state.F, SAUCES[currentSauce], live);
        ctx.putImageData(img, 0, 0);
        dt.update(false);
    }

    function build(full) {
        const sauce = SAUCES[currentSauce];
        rebuildPieceMats(sauce);
        disposePool(state);
        if (full) {
            const sara = state ? state.sara : null;
            disposeFood(state);
            state = buildFood(currentSeed);
            state.sara = sara;
        } else {
            for (const p of state.pieces) p.mesh.material = pieceMats[p.kind];
            redrawGlaze();
        }
        buildPool(state);
        if (!state.sara) {
            state.sara = buildSara(scene, GLOBAL, SARAS[currentSara], getSaraMat(currentSara), new Rng(0xB0117));
            sg.addShadowCaster(state.sara, true);
        }
        applyLive();
        if (onRebuilt) onRebuilt(state);
    }

    function setSara(k) {
        const changed = SARAS[k].shinogi !== SARAS[currentSara].shinogi;
        currentSara = k;
        if (changed && state.sara) { state.sara.dispose(); state.sara = null; }
        if (!state.sara) {
            state.sara = buildSara(scene, GLOBAL, SARAS[k], getSaraMat(k), new Rng(0xB0117));
            sg.addShadowCaster(state.sara, true);
        } else state.sara.material = getSaraMat(k);
        disposePool(state);
        buildPool(state);
        applyLive();
        if (onRebuilt) onRebuilt(state);
    }

    build(true);

    if (GLOBAL.useSSAO) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 1.20;
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
    ip.exposure = 1.15;
    ip.contrast = 1.12;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.30;
    ip.vignetteCameraFov = 0.72;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    let tclock = 0;
    scene.onBeforeRenderObservable.add(() => {
        if (dp.depthOfFieldEnabled) {
            const focus = camera.radius * 1000;
            dp.depthOfField.focusDistance = focus;
            dp.depthOfField.focalLength = focus * GLOBAL.dofRatio;
        }

        if (glazeDirty) { glazeDirty = false; redrawGlaze(); }
        if (poolDirty) { poolDirty = false; redrawPool(); }
    });

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
    const fitUI=()=>{ui.idealWidth=Math.max(430,engine.getRenderWidth());};fitUI();
    const uiResize=engine.onResizeObservable.add(fitUI);
    scene.onDisposeObservable.add(()=>engine.onResizeObservable.remove(uiResize));
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
    card.isVisible=false;
    const toggle=BABYLON.GUI.Button.CreateSimpleButton("settingsToggle","調整");
    toggle.width="78px";toggle.height="36px";toggle.color="#f6eddb";toggle.fontSize="16px";toggle.textBlock.fontSize="16px";
    toggle.background="#3b352de6";toggle.cornerRadius=18;toggle.thickness=0;
    toggle.horizontalAlignment=BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    toggle.verticalAlignment=BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    toggle.top="22px";toggle.left="-22px";ui.addControl(toggle);
    toggle.onPointerUpObservable.add(()=>{card.isVisible=!card.isVisible;});

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

    addLabel("SHOGAYAKI / 豚の生姜焼き", 11, COL.sub, "30px");

    const sauceBtns = {}, saraBtns = {}, fillBtns = {};
    function highlight() {
        for (const k in sauceBtns) sauceBtns[k].background = (k === currentSauce) ? COL.active : COL.idle;
        for (const k in saraBtns) saraBtns[k].background = (k === currentSara) ? COL.active : COL.idle;
        for (const k in fillBtns) fillBtns[k].background = (k === currentFill) ? COL.active : COL.idle;
    }

    addLabel("タレ", 13, COL.accent, "22px");
    for (const k of Object.keys(SAUCES)) {
        sauceBtns[k] = addButton("s_" + k, SAUCES[k].label, () => {
            currentSauce = k; build(false); highlight(); updateSigmaInfo();
        });
    }
    addLabel("皿", 13, COL.accent, "22px");
    for (const k of Object.keys(SARAS)) {
        saraBtns[k] = addButton("h_" + k, SARAS[k].label, () => { setSara(k); highlight(); });
    }
    addLabel("盛り", 13, COL.accent, "22px");
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

    const tomBtn = addButton("tomato", "ミニトマト: ON", () => {
        withTomato = !withTomato;
        tomBtn.textBlock.text = "ミニトマト: " + (withTomato ? "ON" : "OFF");
        tomBtn.background = withTomato ? COL.active : COL.idle;
        build(true);
    });
    tomBtn.background = COL.active;

    const steamBtn = addButton("steam", "湯気: ON", () => setSteam(!steam.isStarted()));
    function setSteam(on) {
        if (on) steam.start(); else steam.stop();
        steamBtn.textBlock.text = "湯気: " + (on ? "ON" : "OFF");
        steamBtn.background = on ? COL.active : COL.idle;
    }
    setSteam(false);

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
    const sRed = addSlider("タレの濃さ", 0.15, 2.40, live.reduce, f2, (v) => {
        live.reduce = v; glazeDirty = true; poolDirty = true; updateSigmaInfo();
    });
    const sigmaInfo = addLabel("", 11, COL.sub, "1px");sigmaInfo.isVisible=false;
    function updateSigmaInfo() {
        const s = SAUCES[currentSauce].sigma, r = live.reduce;
        const t = SAUCES[currentSauce].film * live.wetAmt;
        const tr = [0, 1, 2].map((i) => Math.exp(-s[i] * r * 2 * t));
        sigmaInfo.text = "  σ=[" + s.map((x) => (x * r).toFixed(2)).join(", ") + "] /cm\n"
            + "  膜 " + (t * 10).toFixed(2) + "mm の透過率 ["
            + tr.map((x) => x.toFixed(2)).join(", ") + "]";
    }

    const sWet = addSlider("タレの絡み ×", 0.0, 2.50, live.wetAmt, f2, (v) => {
        live.wetAmt = v; glazeDirty = true; updateSigmaInfo();
    });
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

    const info = addLabel("", 12, COL.sub, "1px");info.isVisible=false;
    highlight();
    updateSigmaInfo();

    onRebuilt = (st) => {
        sRed.slider.value = live.reduce;
        sWet.slider.value = live.wetAmt;
        sGloss.slider.value = live.gloss;
        sTrans.slider.value = live.trans;
        let nMeat = 0, nOn = 0;
        let tri = (st.sara ? st.sara.tris : 0) + (st.pool ? st.pool.tris : 0) + (st.cabbage ? st.cabbage.tris : 0);
        for (const p of st.pieces) { tri += p.mesh.tris; if (p.kind === "meat") nMeat++; else nOn++; }
        for (const m of st.tomMeshes) tri += m.tris;
        for (const m of sundry) tri += m.tris;
        info.text = "豚 " + nMeat + " / 玉ねぎ " + nOn + " / トマト " + (st.tomMeshes.length / 2)
            + " / キャベツ " + GLOBAL.cabN + "本\n"
            + tri.toLocaleString() + " tri / 溜まり " + st.F.N + "² / 高さ場 " + GLOBAL.pileGrid + "²\n"
            + "盛り " + st.ms + "ms  キャベツ " + st.msCab + "ms\n"
            + "seed: " + currentSeed;
    };
    onRebuilt(state);

    console.log("[Shogayaki] build shogayaki-procedural-2026-10-07-g",
        "| pieces=" + state.pieces.length, "| cabbage tri=" + state.cabTris,
        "| plating=" + state.ms + "ms", "| cabbage=" + state.msCab + "ms", "| seed=" + currentSeed);

    scene.onDisposeObservable.add(() => {
        for (const k in saraMatCache) {
            const m = saraMatCache[k];
            if (m.texs) for (const t of m.texs) t.dispose();
            m.dispose(true, false);
        }
        if (state && state.poolTex) for (const t of Object.keys(state.poolTex)) state.poolTex[t].dispose();
        porkBump.dispose();porkDetail.dispose();onionBump.dispose();env.dispose();
        for (const s2 of [tableWood, chopWood, restWood]) for (const t2 in s2) s2[t2].dispose();
        steamTex.dispose();
    });

    scene.metadata = { shogayaki: {
        resetCamera() { camera.setTarget(new V3(camTarget[0],2.4,camTarget[1])); camera.alpha=-1.14;camera.beta=.98;camera.radius=78; },
        setPlate: setSara,
        setSauce(k) { if(!SAUCES[k]) return;currentSauce=k;build(false);highlight();updateSigmaInfo(); },
        replate() {currentSeed=(currentSeed*1664525+1013904223)>>>0;build(true);},
        setControls(v) {card.isVisible=v;},
        toggleRotation() {camera.useAutoRotationBehavior=!camera.useAutoRotationBehavior;if(camera.autoRotationBehavior)camera.autoRotationBehavior.idleRotationSpeed=.07;},
        stats() {return {pieces:state.pieces.length,meshes:scene.meshes.length,vertices:scene.getTotalVertices(),seed:currentSeed};}
    }};
    return scene;
};

export default createScene;