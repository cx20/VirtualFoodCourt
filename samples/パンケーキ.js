// Pancakes / syrup-E : 添付サンプルのシロップ改良版
// Babylon.js 9.26.0 で確認。1 unit = 1 cm。
// 天面は吸収を焼き込む近似、垂れ・皿・糸は背景 RTT + PBR 屈折。
// 物理流体ソルバーではなく、既存の形状と注ぐ演出を利用しています。

var createScene = function () {

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;
    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    const mix = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
    const srgb = (r, g, b) => new BABYLON.Color3(r, g, b).toLinearSpace();

    const PRESETS = {
        usu: {
            label: "浅め",
            rimPale: 1.62,       // 縁の淡い環の幅（cm）
            bakeGain: 0.72,      // 焼き色の総量
            deepMix: 0.20,       // いちばん濃い色の混ざり
            lipDeep: 0.42        // 側面の上下の帯の濃さ
        },
        kitsune: {
            label: "きつね色",
            rimPale: 0.78,
            bakeGain: 1.00,
            deepMix: 0.34,
            lipDeep: 0.62
        },
        yoku: {
            label: "よく焼き",
            rimPale: 0.62,
            bakeGain: 1.30,
            deepMix: 0.86,
            lipDeep: 0.86
        }
    };

    const BUTTER_STEPS = [
        { label: "なし", on: false, melt: 0 },
        { label: "かたい", on: true, melt: 0.14 },
        { label: "溶けかけ", on: true, melt: 0.56 },
        { label: "とろとろ", on: true, melt: 0.92 }
    ];

    const BUILD = "pancake-syrup-E-2026-09-12";

    const CAM_ALPHA = -1.06;

    const DROP = {
        on: true,
        clearance: 3.2,          // 直前の天面からどれだけ上で放すか（cm）
        hz: 120,
        friction: 0.92,
        restitution: 0.0,        // 生地は跳ねない
        linDamp: 0.90,
        angDamp: 0.95,
        settleSpeed: 0.55,       // cm/s
        settleHold: 0.30,
        settleTimeout: 2.6,
        butterFall: 0.42,        // バターが落ちる時間（秒）
        syrupSlow: 1.35,
        tStream: 0.70,           // 糸がバターへ届くまで（自由落下なので加速）
        tSpread: 1.70,           // 天面の舌が縁まで広がるまで（減速する冪則）
        tRun: 2.00,              // 側面を伝って落ちきるまで（終端速度＝ほぼ等速）
        tPool: 1.15,             // 皿の水たまりが広がるまで（強く減速）
        tTail: 0.75,             // 注ぎ終わってから糸が消えるまで
        gap: 0.22,               // 前の一枚が落ち着いてから次を放すまで
        log: true                // 進行をコンソールへ出す
    };

    const GLOBAL = {
        radius: 5.55,
        thickness: 1.70,
        edgeRoll: 0.30,          // 天面が側面へ落ちる丸み
        sideBulge: 0.019,        // 側面中ほどのふくらみ（写真は 7〜8%）
        domeH: 0.30,             // 中央の盛り上がり
        outlineWobble: 0.115,    // 輪郭のゆらぎ（お玉で落とした生地は真円にならない）
        pitsSide: [
            [0.72, 0.055, 0.140, 0.22, 0.105],
            [0.30, 0.030, 0.068, 0.30, 0.055],
            [0.13, 0.014, 0.030, 0.52, 0.024]
        ],
        pitsTop: [
            [0.46, 0.030, 0.085, 0.16, 0.042],
            [0.22, 0.022, 0.050, 0.34, 0.020]
        ],
        stack: 3,                // 1〜5
        sink: 0.075,             // 上の一枚が下へ沈み込む量
        butterStep: 2,
        syrup: true,
        syrupIOR: 1.47,          // 見た目を調整する屈折率
        syrupDensity: 1.6,       // 吸収の濃さ（実測値ではない調整倍率）
        syrupRefractionSize: 1024, // 背景の透過用 RTT 解像度
        syrupMaxThickness: 1.2,  // UV2 の 0..1 に記録する最大厚み cm
        pour: false,             // 上から注ぐ糸
        showPlate: true, showTable: true,
        plateR: 12.40,
        segAngular: 320, segTop: 52, segBottom: 18, segSide: 12,
        texTop: 1024, texSideW: 1024, texButter: 256, texPlate: 512, texWood: 512,
        compactWidth: 900,
        normalFlipY: false,
        useSSAO: true, useDOF: true, drop: DROP.on
    };

    const START_PRESET = "kitsune";
    const START_SEED = 20260811;

    function buildConfig(presetKey, seed, stack, butterStep, syrup, pour, flipY) {
        const cfg = Object.assign({}, GLOBAL, PRESETS[presetKey]);
        cfg.preset = presetKey;
        cfg.stack = clamp(stack | 0, 1, 5);
        cfg.butterStep = clamp(butterStep | 0, 0, BUTTER_STEPS.length - 1);
        cfg.butter = BUTTER_STEPS[cfg.butterStep].on;
        cfg.melt = BUTTER_STEPS[cfg.butterStep].melt;
        cfg.syrup = !!syrup;
        cfg.pour = !!pour && !!syrup;
        cfg.normalFlipY = !!flipY;
        cfg.seed = seed >>> 0;
        cfg.fieldSeed = (cfg.seed ^ 0x9e3779b9) >>> 0;
        const vw = (typeof window !== "undefined" && window.innerWidth) || 1280;
        if (vw < GLOBAL.compactWidth) { cfg.texTop = 768; cfg.texSideW = 768; }
        return cfg;
    }

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
        h2(x, y, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
            return (h >>> 0) / 4294967295;
        },
        v2(x, y, seed) {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            const a = this.h2(xi, yi, seed), b = this.h2(xi + 1, yi, seed);
            const c = this.h2(xi, yi + 1, seed), d = this.h2(xi + 1, yi + 1, seed);
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
            const a = this.h2(x0, yi, seed), b = this.h2(x1, yi, seed);
            const c = this.h2(x0, yi + 1, seed), d = this.h2(x1, yi + 1, seed);
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
        v2uv(x, y, px, py, seed) {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            const p = Math.max(1, px | 0), q = Math.max(1, py | 0);
            let x0 = xi % p; if (x0 < 0) x0 += p;
            let x1 = (xi + 1) % p; if (x1 < 0) x1 += p;
            let y0 = yi % q; if (y0 < 0) y0 += q;
            let y1 = (yi + 1) % q; if (y1 < 0) y1 += q;
            const a = this.h2(x0, y0, seed), b = this.h2(x1, y0, seed);
            const c = this.h2(x0, y1, seed), d = this.h2(x1, y1, seed);
            const t0 = a + (b - a) * u, t1 = c + (d - c) * u;
            return t0 + (t1 - t0) * v;
        },
        fbm2uv(x, y, px, py, seed, oct) {
            let s = 0, a = 0.5, f = 1, n = 0;
            for (let o = 0; o < oct; o++) {
                s += a * this.v2uv(x * f, y * f, (px * f) | 0, (py * f) | 0, seed + o * 131);
                n += a; f *= 2; a *= 0.5;
            }
            return s / n;
        },
        fbmAngle(a, k, seed, oct) {
            return this.fbm2(Math.cos(a) * k + 31.7, Math.sin(a) * k + 12.3, seed, oct);
        },
        cap(x, z, cell, rMin, rMax, prob, seed) {
            const inv = 1 / cell;
            const gx = Math.floor(x * inv), gz = Math.floor(z * inv);
            let m = 0;
            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const cx = gx + dx, cz = gz + dz;
                    if (this.h2(cx, cz, seed) > prob) continue;
                    const jx = (cx + 0.12 + 0.76 * this.h2(cx, cz, seed + 13)) * cell;
                    const jz = (cz + 0.12 + 0.76 * this.h2(cx, cz, seed + 29)) * cell;
                    const r = mix(rMin, rMax, this.h2(cx, cz, seed + 41));
                    const ex = x - jx, ez = z - jz;
                    const d2 = ex * ex + ez * ez, r2 = r * r;
                    if (d2 >= r2) continue;
                    const cut = 0.30 + 0.70 * this.h2(cx, cz, seed + 61);
                    const v = Math.sqrt(1 - d2 / r2) * cut;
                    if (v > m) m = v;
                }
            }
            return m;
        },
        capU(x, z, cell, rMin, rMax, prob, seed, periodX) {
            const P = Math.max(1, Math.round(periodX / cell));
            const ce = periodX / P, inv = 1 / ce;
            const gx = Math.floor(x * inv), gz = Math.floor(z * inv);
            let m = 0;
            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const cx = gx + dx, cz = gz + dz;
                    let hx = cx % P; if (hx < 0) hx += P;
                    if (this.h2(hx, cz, seed) > prob) continue;
                    const jx = (cx + 0.12 + 0.76 * this.h2(hx, cz, seed + 13)) * ce;
                    const jz = (cz + 0.12 + 0.76 * this.h2(hx, cz, seed + 29)) * ce;
                    const r = mix(rMin, rMax, this.h2(hx, cz, seed + 41));
                    const ex = x - jx, ez = z - jz;
                    const d2 = ex * ex + ez * ez, r2 = r * r;
                    if (d2 >= r2) continue;
                    const cut = 0.34 + 0.66 * this.h2(hx, cz, seed + 61);
                    const v = Math.sqrt(1 - d2 / r2) * cut;
                    if (v > m) m = v;
                }
            }
            return m;
        }
    };

    function makeMesh(name, positions, indices, uvs, scene, colors) {
        const mesh = new BABYLON.Mesh(name, scene);
        const normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices;
        vd.normals = normals; vd.uvs = uvs;
        if (colors) vd.colors = colors;
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        return mesh;
    }

    function buildSolid(o) {
        const scene = o.scene, M = o.M, cr = o.cr;
        const parts = [];
        const COS = new Float32Array(M), SIN = new Float32Array(M);
        for (let j = 0; j < M; j++) { const a = TAU * j / M; COS[j] = Math.cos(a); SIN[j] = Math.sin(a); }

        {
            const Nr = o.Nr;
            const total = 1 + Nr * M;
            const pos = new Float32Array(total * 3);
            const uvs = new Float32Array(total * 2);
            const setP = (k, x, y, z) => {
                pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
                const uv = o.uvTop(x, z);
                uvs[k * 2] = uv[0]; uvs[k * 2 + 1] = uv[1];
            };
            const yAt = (x, z) => {
                const d = o.dist(x, z);
                const e = clamp(d / cr, 0, 1);
                const quarter = 1 - Math.sqrt(Math.max(0, 1 - (1 - e) * (1 - e)));
                const hs = mix(o.hRim, o.hTop(x, z, d), smooth(0, 1, e));
                return hs - cr * quarter;
            };
            setP(0, 0, yAt(0, 0), 0);
            const tOf = (i) => Math.pow(i / Nr, 0.74);
            for (let i = 1; i <= Nr; i++) {
                const t = tOf(i);
                for (let j = 0; j < M; j++) {
                    const r = t * o.R(TAU * j / M);
                    const x = r * COS[j], z = r * SIN[j];
                    setP(1 + (i - 1) * M + j, x, yAt(x, z), z);
                }
            }
            const idx = [];
            for (let j = 0; j < M; j++) idx.push(0, 1 + j, 1 + (j + 1) % M);
            for (let i = 1; i < Nr; i++) {
                const r0 = 1 + (i - 1) * M, r1 = 1 + i * M;
                for (let j = 0; j < M; j++) {
                    const jn = (j + 1) % M;
                    idx.push(r0 + j, r1 + j, r0 + jn, r0 + jn, r1 + j, r1 + jn);
                }
            }
            const mesh = makeMesh(o.name + "Top", pos, new Uint32Array(idx), uvs, scene);
            mesh.material = o.matTop;
            mesh.receiveShadows = true;
            parts.push(mesh);
        }

        {
            const NV = o.NV;
            const yHi = o.hRim - cr, yLo = o.hBotRim + cr;
            const total = (NV + 1) * (M + 1);
            const pos = new Float32Array(total * 3);
            const uvs = new Float32Array(total * 2);
            for (let i = 0; i <= NV; i++) {
                const v = i / NV;
                const bulge = 1 + o.bulge * Math.sin(Math.PI * v) * 4;
                for (let j = 0; j <= M; j++) {
                    const a = TAU * (j % M) / M;
                    const R = o.R(a) * bulge;
                    const k = i * (M + 1) + j;
                    pos[k * 3] = R * Math.cos(a);
                    pos[k * 3 + 1] = mix(yHi, yLo, v);
                    pos[k * 3 + 2] = R * Math.sin(a);
                    const uv = o.uvSide(a, o.arc(a), v);
                    uvs[k * 2] = uv[0]; uvs[k * 2 + 1] = uv[1];
                }
                const uvEnd = o.uvSide(TAU, o.perimeter, v);
                uvs[(i * (M + 1) + M) * 2] = uvEnd[0];
            }
            const idx = [];
            for (let i = 0; i < NV; i++) {
                for (let j = 0; j < M; j++) {
                    const a = i * (M + 1) + j, b = a + 1;
                    const c = a + (M + 1), d = c + 1;
                    idx.push(a, c, b, b, c, d);       // 外向き
                }
            }
            const mesh = makeMesh(o.name + "Side", pos, new Uint32Array(idx), uvs, scene);
            mesh.material = o.matSide;
            mesh.receiveShadows = true;
            parts.push(mesh);
        }

        {
            const Nb = o.Nb;
            const total = 1 + Nb * M;
            const pos = new Float32Array(total * 3);
            const uvs = new Float32Array(total * 2);
            const setP = (k, x, y, z) => {
                pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
                const uv = o.uvBot(x, z);
                uvs[k * 2] = uv[0]; uvs[k * 2 + 1] = uv[1];
            };
            const yAt = (x, z) => {
                const d = o.dist(x, z);
                const e = clamp(d / cr, 0, 1);
                const rise = cr * (1 - Math.sqrt(Math.max(0, 1 - (1 - e) * (1 - e))));
                return o.hBot(x, z, d) + rise;
            };
            setP(0, 0, yAt(0, 0), 0);
            const tOf = (i) => Math.pow(i / Nb, 0.74);
            for (let i = 1; i <= Nb; i++) {
                const t = tOf(i);
                for (let j = 0; j < M; j++) {
                    const r = t * o.R(TAU * j / M);
                    const x = r * COS[j], z = r * SIN[j];
                    setP(1 + (i - 1) * M + j, x, yAt(x, z), z);
                }
            }
            const idx = [];
            for (let j = 0; j < M; j++) idx.push(0, 1 + (j + 1) % M, 1 + j);
            for (let i = 1; i < Nb; i++) {
                const r0 = 1 + (i - 1) * M, r1 = 1 + i * M;
                for (let j = 0; j < M; j++) {
                    const jn = (j + 1) % M;
                    idx.push(r0 + j, r0 + jn, r1 + j, r0 + jn, r1 + jn, r1 + j);
                }
            }
            const mesh = makeMesh(o.name + "Bottom", pos, new Uint32Array(idx), uvs, scene);
            mesh.material = o.matBot;
            parts.push(mesh);
        }

        return parts;
    }

    class Field {
        constructor(cfg) {
            this.cfg = cfg;

            const K = 1536;
            this.K = K;
            this.RTab = new Float32Array(K);
            this.ATab = new Float32Array(K);      // 周長（側面の UV 用）
            let rMax = 0;
            for (let i = 0; i < K; i++) {
                const a = TAU * i / K;
                const cx = Math.cos(a), cz = Math.sin(a);
                let lo = 0, hi = cfg.radius * 2.2;
                for (let k = 0; k < 26; k++) {
                    const m = (lo + hi) * 0.5;
                    if (this.sdf(m * cx, m * cz) < 0) lo = m; else hi = m;
                }
                this.RTab[i] = lo;
                if (lo > rMax) rMax = lo;
            }
            this.rMax = rMax;
            this.halfExtent = rMax;
            let acc = 0;
            this.ATab[0] = 0;
            for (let i = 0; i < K; i++) {
                const a0 = TAU * i / K, a1 = TAU * (i + 1) / K;
                const r0 = this.RTab[i], r1 = this.RTab[(i + 1) % K];
                acc += Math.hypot(r1 * Math.cos(a1) - r0 * Math.cos(a0),
                    r1 * Math.sin(a1) - r0 * Math.sin(a0));
                if (i + 1 < K) this.ATab[i + 1] = acc;
            }
            this.perimeter = acc;

            this.S = { d: 0, pore: 0, h: 0, hMacro: 0, bake: 0 };
        }

        sdf(x, z) {
            const cfg = this.cfg, sd = cfg.fieldSeed;
            const ex = 1.012, ez = 0.988;
            let d = Math.hypot(x * ex, z * ez) - cfg.radius;
            d -= (Noise.fbm2(x * 0.21 + 40, z * 0.21 + 70, sd + 11, 3) - 0.5) * 2 * cfg.outlineWobble;
            d -= (Noise.fbm2(x * 0.62 + 5, z * 0.62 + 9, sd + 23, 2) - 0.5) * 2 * cfg.outlineWobble * 0.45;
            d -= (Noise.fbm2(x * 1.90 + 61, z * 1.90 + 3, sd + 37, 1) - 0.5) * 2 * cfg.outlineWobble * 0.14;
            return d;
        }

        dist(x, z) { return -this.sdf(x, z); }

        tab(arr, a) {
            const K = this.K;
            let f = a * K / TAU; f -= Math.floor(f / K) * K;
            const i0 = Math.floor(f) % K, i1 = (i0 + 1) % K, w = f - Math.floor(f);
            let v0 = arr[i0], v1 = arr[i1];
            if (arr === this.ATab && v1 < v0) v1 += this.perimeter;
            return v0 + (v1 - v0) * w;
        }
        outlineAt(a) { return this.tab(this.RTab, a); }
        arcAt(a) { return this.tab(this.ATab, a); }

        macroAt(x, z, dIn) {
            const cfg = this.cfg, sd = cfg.fieldSeed;
            const d = (dIn === undefined) ? this.dist(x, z) : dIn;
            const t = clamp(d / cfg.radius, 0, 1);
            let h = cfg.thickness + cfg.domeH * smooth(0.0, 0.58, t);
            h += (Noise.fbm2(x * 0.34 + 55, z * 0.34 + 31, sd + 83, 2) - 0.5) * 0.115;
            h += (Noise.fbm2(x * 0.95 + 17, z * 0.95 + 88, sd + 89, 1) - 0.5) * 0.048;
            return h;
        }

        sample(x, z, dIn) {
            const cfg = this.cfg, sd = cfg.fieldSeed, S = this.S;
            const dist = (dIn === undefined) ? this.dist(x, z) : dIn;
            S.d = dist;

            const wx = x + (Noise.fbm2(x * 1.7 + 300, z * 1.7 + 40, sd + 301, 2) - 0.5) * 0.20;
            const wz = z + (Noise.fbm2(x * 1.7 + 90, z * 1.7 + 210, sd + 303, 2) - 0.5) * 0.20;
            let pitH = 0, pore = 0;
            for (let k = 0; k < cfg.pitsTop.length; k++) {
                const q = cfg.pitsTop[k];
                const v = Noise.cap(wx, wz, q[0], q[1], q[2], q[3], sd + 201 + k * 37);
                pitH += v * q[4];
                if (v > pore) pore = v;
            }

            const rimN = Noise.fbm2(x * 0.30 + 12, z * 0.30 + 44, sd + 97, 3);
            const rimN2 = Noise.fbm2(x * 0.85 + 71, z * 0.85 + 5, sd + 103, 2);
            const rim = cfg.rimPale * (0.52 + 0.98 * rimN) * (0.86 + 0.28 * rimN2);
            const contact = smooth(0.02, rim, dist);

            const pan = Noise.fbm2(x * 0.26 + 210, z * 0.26 + 133, sd + 107, 2);
            const macroBake = contact * (0.80 + 0.42 * pan);

            const fine = Noise.fbm2(x * 5.2 + 5, z * 5.2 + 15, sd + 71, 2);
            const speck = 0.86 + 0.28 * smooth(0.32, 0.70, fine);
            const poreShade = 1 - 0.30 * smooth(0.14, 0.72, pore);
            S.pore = pore;
            S.bake = clamp(macroBake * speck * poreShade * cfg.bakeGain, 0, 1.30);

            const hMacro = this.macroAt(x, z, dist);
            S.hMacro = hMacro;
            let h = hMacro;
            const undul = Noise.fbm2(x * 2.4 + 12, z * 2.4 + 66, sd + 43, 2);
            const fuzz = Noise.fbm2(x * 11.0 + 9, z * 11.0 + 31, sd + 79, 1);
            h += (undul - 0.5) * 0.050;
            h -= pitH;
            h += ((fine - 0.5) * 0.022 + (fuzz - 0.5) * 0.014);
            S.h = h;
            return S;
        }
    }

    class Garnish {
        constructor(cfg, field) {
            this.cfg = cfg; this.field = field;
            const sd = (cfg.fieldSeed ^ 0x5bd1e995) >>> 0;
            this.sd = sd;
            const rng = new Rng(sd);

            const ba = rng.range(0, TAU);
            const br = cfg.radius * rng.range(0.05, 0.16);
            this.bx = Math.cos(ba) * br;
            this.bz = Math.sin(ba) * br;
            this.bRot = rng.range(0, TAU);
            this.bHalf = 0.86;

            this.pMelt = cfg.melt;
            this.pR = this.bHalf * (1.22 + 1.05 * cfg.melt);
            this.pH = 0.030 + 0.055 * cfg.melt;

            this.flow = CAM_ALPHA + rng.range(-0.60, 0.60);
            this.flowW = rng.range(0.58, 0.78);   // 舌の広がり（rad。縁で 65〜90°）

            this.sx = this.bx * 0.55 + Math.cos(this.flow) * cfg.radius * 0.10;
            this.sz = this.bz * 0.55 + Math.sin(this.flow) * cfg.radius * 0.10;
            this.sR = cfg.radius * 0.32;
            this.sH = 0.042;                    // 膜の厚み（cm）
            this.beadH = 0.052;                 // 表面張力の土手
            this.beadW = 0.135;

            const off = [rng.range(-0.40, -0.10), rng.range(0.10, 0.40)];
            if (rng.range(0, 1) < 0.5) { const t0 = off[0]; off[0] = off[1]; off[1] = t0; }
            this.drips = [];
            for (let i = 0; i < 2; i++) {
                this.drips.push({
                    a: this.flow + off[i] * this.flowW,
                    long: (i === 0),             // こちらが皿まで届く
                    w: rng.range(0.20, 0.34),    // 幅（cm）
                    t: rng.range(0.115, 0.165),  // 厚み（cm）
                    drift: rng.range(-0.09, 0.09),
                    len: (i === 0) ? 1.0 : rng.range(0.40, 0.72),
                    seed: (sd + 977 * (i + 1)) >>> 0
                });
            }

            {
                const R = this.field.outlineAt(this.flow);
                const tx = R * Math.cos(this.flow), tz = R * Math.sin(this.flow);
                this.flowA = Math.atan2(tz - this.sz, tx - this.sx);  // 塊の中心から見た向き
                this.flowL = Math.hypot(tx - this.sx, tz - this.sz);  // 縁までの距離
            }

            const KA = 1024;
            this.KA = KA;
            this.sRTab = new Float32Array(KA);
            this.sBTab = new Float32Array(KA);   // 腕を含まない、溜まりだけの輪郭
            this.pRTab = new Float32Array(KA);
            for (let i = 0; i < KA; i++) {
                const a = TAU * i / KA;
                this.sRTab[i] = this._syrupR(a);
                this.sBTab[i] = this._syrupR(a, true);
                this.pRTab[i] = this.pR * (0.74 + 0.56 * Noise.fbmAngle(a, 2.6, sd + 41, 3));
            }
        }

        _syrupR(a, baseOnly) {
            if (!this.cfg.syrup) return -1;
            const sd = this.sd;
            let r = this.sR * (0.66 + 0.66 * Noise.fbmAngle(a, 2.1, sd + 5, 3));
            r *= (0.88 + 0.24 * Noise.fbmAngle(a, 5.3, sd + 9, 2));
            if (baseOnly) return r;
            let da = a - this.flowA;
            da -= Math.round(da / TAU) * TAU;
            const w = this.flowW * (0.80 + 0.40 * Noise.fbmAngle(a, 3.7, this.sd + 41, 2));
            const g = 1 - smooth(0.60, 1.0, Math.abs(da) / w);
            const L = this.flowL * (1.06 + 0.08 * (Noise.fbmAngle(a, 2.3, this.sd + 57, 2) - 0.5));
            r = Math.max(r, mix(r, L, clamp(g, 0, 1) * 0.99));
            return r;
        }
        _tabAt(arr, a) {
            const K = this.KA;
            let f = a * K / TAU; f -= Math.floor(f / K) * K;
            const i0 = Math.floor(f) % K, i1 = (i0 + 1) % K, w = f - Math.floor(f);
            return arr[i0] + (arr[i1] - arr[i0]) * w;
        }

        at(x, z, out, dGiven) {
            const cfg = this.cfg, sd = this.sd;
            out.film = 0; out.bead = 0; out.pool = 0;

            const dIn = (dGiven === undefined) ? this.field.dist(x, z) : dGiven;
            const inside = smooth(-0.02, 0.12, dIn);

            if (cfg.butter && cfg.melt > 0.02) {
                const ex = x - this.bx, ez = z - this.bz;
                const ea = Math.atan2(ez, ex), ed = Math.hypot(ex, ez);
                const pr = this._tabAt(this.pRTab, ea);
                const s = pr - ed;                       // 内側で正
                out.pool = this.pH * smooth(-0.02, 0.26, s) * inside;
                out.pool *= 0.75 + 0.55 * (1 - smooth(0.35, 0.75, Noise.fbm2(x * 1.4 + 3, z * 1.4 + 7, sd + 47, 2)));
            }

            if (cfg.syrup) {
                const ex = x - this.sx, ez = z - this.sz;
                const ea = Math.atan2(ez, ex), ed = Math.hypot(ex, ez);
                const sr = this._tabAt(this.sRTab, ea);
                const s = sr - ed;                       // 内側で正
                let f = this.sH * smooth(-0.06, 0.55, s);
                f *= mix(1.0, 0.40, smooth(0.05, 1.10, ed - this._tabAt(this.sBTab, ea)));
                const low = 1 - smooth(0.30, 0.78, Noise.fbm2(x * 1.15 + 21, z * 1.15 + 44, sd + 61, 3));
                f *= 0.78 + 0.44 * low;
                f *= 0.88 + 0.24 * Noise.fbm2(x * 2.6 + 9, z * 2.6 + 63, sd + 67, 2);
                out.film = f * inside;
                const b = this.beadH * Math.exp(-((s - 0.055) * (s - 0.055)) / (2 * this.beadW * this.beadW));
                out.bead = b * smooth(-0.10, 0.06, s) * inside;
            }
            return out;
        }

        prepare(half, N) {
            this.gHalf = half; this.gN = N;
            const F = new Float32Array(N * N), B = new Float32Array(N * N), P = new Float32Array(N * N);
            const o = { film: 0, bead: 0, pool: 0 };
            for (let y = 0; y < N; y++) {
                const wz = (y / (N - 1) - 0.5) * 2 * half;
                for (let x = 0; x < N; x++) {
                    const wx = (x / (N - 1) - 0.5) * 2 * half;
                    this.at(wx, wz, o);
                    const i = y * N + x;
                    F[i] = o.film; B[i] = o.bead; P[i] = o.pool;
                }
            }
            this.gF = F; this.gB = B; this.gP = P;
        }

        lookup(x, z, out) {
            const N = this.gN, h = this.gHalf;
            const fx = clamp((x / (2 * h) + 0.5) * (N - 1), 0, N - 1.001);
            const fy = clamp((z / (2 * h) + 0.5) * (N - 1), 0, N - 1.001);
            const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0;
            const i00 = y0 * N + x0, i10 = i00 + 1, i01 = i00 + N, i11 = i01 + 1;
            const bl = (A) => mix(mix(A[i00], A[i10], tx), mix(A[i01], A[i11], tx), ty);
            out.film = bl(this.gF); out.bead = bl(this.gB); out.pool = bl(this.gP);
            return out;
        }
    }

    const TextureLab = {
        _tex(name, w, h, fill, scene, linear, clampMode) {
            w = Math.max(8, Math.round(w) || 512);
            h = Math.max(8, Math.round(h) || 512);
            const dt = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(w, h);
            fill(img.data, w, h);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = false;
            const mode = clampMode ? BABYLON.Texture.CLAMP_ADDRESSMODE : BABYLON.Texture.WRAP_ADDRESSMODE;
            dt.wrapU = mode; dt.wrapV = mode;
            dt.anisotropicFilteringLevel = 16;
            if (linear) dt.gammaSpace = false;
            return dt;
        },
        fromBuffer(name, buf, w, h, scene, linear, clampMode) {
            return this._tex(name, w, h, (d) => d.set(buf), scene, linear, clampMode);
        },
        normalFrom(name, H, w, h, sx, sz, scene, clampMode, flipY) {
            const sy = flipY ? -1 : 1;
            return this._tex(name, w, h, (d, W, Hh) => {
                for (let y = 0; y < Hh; y++) {
                    const yu = clampMode ? Math.max(0, y - 1) : (y - 1 + Hh) % Hh;
                    const yd = clampMode ? Math.min(Hh - 1, y + 1) : (y + 1) % Hh;
                    for (let x = 0; x < W; x++) {
                        const xl = clampMode ? Math.max(0, x - 1) : (x - 1 + W) % W;
                        const xr = clampMode ? Math.min(W - 1, x + 1) : (x + 1) % W;
                        let nx = (H[y * W + xl] - H[y * W + xr]) * sx;
                        let ny = (H[yd * W + x] - H[yu * W + x]) * sz * sy;
                        let nz = 1;
                        const l = Math.hypot(nx, ny, nz) || 1;
                        nx /= l; ny /= l; nz /= l;
                        const o = (y * W + x) * 4;
                        d[o] = (nx * 0.5 + 0.5) * 255;
                        d[o + 1] = (ny * 0.5 + 0.5) * 255;
                        d[o + 2] = (nz * 0.5 + 0.5) * 255;
                        d[o + 3] = 255;
                    }
                }
            }, scene, true, clampMode);
        }
    };

    const C_PALE = [0.972, 0.888, 0.560];   // 肩の生成り
    const C_PALE2 = [0.953, 0.800, 0.372];  // その内側
    const C_GOLD = [0.929, 0.671, 0.216];   // 写真 #eeab38
    const C_AMBER = [0.831, 0.526, 0.086];
    const C_DEEP = [0.643, 0.322, 0.010];   // 写真 #a35100
    const C_CHAR = [0.470, 0.228, 0.022];

    const SYR_T560 = 0.38;
    const SYR_SIG = (function () {
        const a560 = -Math.log(SYR_T560) / Math.LN10;   // 1cm あたりの吸光度
        return [610, 550, 465].map(function (lam) {
            return Math.LN10 * a560 * Math.exp(-(lam - 560) / 52);
        });
    })();                                     // ≒ [0.37, 1.17, 6.01] / cm

    function absorb(c, path) {
        return [c[0] * Math.exp(-path * SYR_SIG[0]),
                c[1] * Math.exp(-path * SYR_SIG[1]),
                c[2] * Math.exp(-path * SYR_SIG[2])];
    }

    function filmOver(sub, t) {
        const wet = mix(1.0, 0.64, smooth(0, 0.014, t));
        return sub.map((v, k) => v * wet * Math.exp(-3 * t * SYR_SIG[k] * GLOBAL.syrupDensity));
    }
    const toLinear = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const toSRGB = v => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    const BUT_SIG = [0.55, 1.05, 3.10];
    const BUT_SCAT = [0.985, 0.880, 0.475];

    class TopSkin {
        constructor(scene, cfg, field, garnish) {
            const N = cfg.texTop;
            const half = field.halfExtent * 1.03;
            this.half = half;
            const sd = cfg.fieldSeed;

            const H = new Float32Array(N * N);
            const A = new Uint8ClampedArray(N * N * 4);
            const O = new Uint8ClampedArray(N * N * 4);
            const Hd = new Float32Array(N * N);        // かける前
            const Ad = new Uint8ClampedArray(N * N * 4);
            const Od = new Uint8ClampedArray(N * N * 4);
            const g = { film: 0, bead: 0, pool: 0 };
            garnish.prepare(half, Math.max(128, N >> 1));

            for (let y = 0; y < N; y++) {
                const wz = (y / (N - 1) - 0.5) * 2 * half;
                for (let x = 0; x < N; x++) {
                    const wx = (x / (N - 1) - 0.5) * 2 * half;
                    const i = y * N + x, o = i * 4;

                    const sdv = field.sdf(wx, wz);
                    if (sdv > 0.05) {
                        H[i] = Hd[i] = cfg.thickness;
                        A[o] = Ad[o] = C_PALE[0] * 255; A[o + 1] = Ad[o + 1] = C_PALE[1] * 255;
                        A[o + 2] = Ad[o + 2] = C_PALE[2] * 255; A[o + 3] = Ad[o + 3] = 255;
                        O[o] = Od[o] = 255; O[o + 1] = Od[o + 1] = 0.72 * 255;
                        O[o + 2] = Od[o + 2] = 0; O[o + 3] = Od[o + 3] = 255;
                        continue;
                    }

                    const S = field.sample(wx, wz, -sdv);
                    garnish.lookup(wx, wz, g);

                    const b = S.bake;
                    let cr = C_PALE[0], cg = C_PALE[1], cb = C_PALE[2];
                    const t1 = smooth(0.02, 0.30, b);
                    cr = mix(cr, C_PALE2[0], t1); cg = mix(cg, C_PALE2[1], t1); cb = mix(cb, C_PALE2[2], t1);
                    const t2 = smooth(0.16, 0.56, b);
                    cr = mix(cr, C_GOLD[0], t2); cg = mix(cg, C_GOLD[1], t2); cb = mix(cb, C_GOLD[2], t2);
                    const t3 = smooth(0.42, 0.86, b);
                    cr = mix(cr, C_AMBER[0], t3); cg = mix(cg, C_AMBER[1], t3); cb = mix(cb, C_AMBER[2], t3);
                    const t4 = smooth(0.74, 1.16, b) * cfg.deepMix;
                    cr = mix(cr, C_DEEP[0], t4); cg = mix(cg, C_DEEP[1], t4); cb = mix(cb, C_DEEP[2], t4);
                    const t5 = smooth(1.02, 1.30, b) * cfg.deepMix * 0.7;
                    cr = mix(cr, C_CHAR[0], t5); cg = mix(cg, C_CHAR[1], t5); cb = mix(cb, C_CHAR[2], t5);

                    const pk = smooth(0.16, 0.72, S.pore);
                    const pale = 0.42 * pk * smooth(0.10, 0.55, b);
                    cr = mix(cr, C_PALE2[0], pale); cg = mix(cg, C_PALE2[1], pale); cb = mix(cb, C_PALE2[2], pale);

                    let ao = 1.0 - 0.10 * pk - 0.04 * smooth(0.10, 0.90, b);
                    let rough = 0.755;
                    rough -= 0.13 * smooth(0.14, 0.92, b);      // 焼けた面は締まる
                    rough += 0.09 * pk;                          // 気泡の底は毛羽立つ
                    rough += 0.10 * (Noise.fbm2(wx * 3.6, wz * 3.6, sd + 151, 2) - 0.5);

                    Ad[o] = cr * 255; Ad[o + 1] = cg * 255; Ad[o + 2] = cb * 255; Ad[o + 3] = 255;
                    Od[o] = clamp(ao, 0, 1) * 255;
                    Od[o + 1] = clamp(rough, 0.04, 1) * 255;
                    Od[o + 2] = 0; Od[o + 3] = 255;
                    Hd[i] = S.h;

                    cr = toLinear(cr); cg = toLinear(cg); cb = toLinear(cb);
                    if (g.pool > 0.0005) {
                        const tR = Math.exp(-g.pool * BUT_SIG[0]);
                        const tG = Math.exp(-g.pool * BUT_SIG[1]);
                        const tB = Math.exp(-g.pool * BUT_SIG[2]);
                        cr = cr * tR + BUT_SCAT[0] * (1 - tR);
                        cg = cg * tG + BUT_SCAT[1] * (1 - tG);
                        cb = cb * tB + BUT_SCAT[2] * (1 - tB);
                        const w = smooth(0.002, 0.030, g.pool);
                        rough = mix(rough, 0.115, w);
                        ao = mix(ao, 1.0, w * 0.6);
                    }

                    if (g.film > 0.0005) {
                        const f = filmOver([cr, cg, cb], g.film);
                        cr = f[0]; cg = f[1]; cb = f[2];
                        const w = smooth(0.0008, 0.010, g.film);
                        rough = mix(rough, 0.045, w);
                        ao = mix(ao, 1.0, w * 0.75);
                    }
                    if (g.bead > 0.002) {
                        const k = smooth(0.004, 0.045, g.bead);
                        cr = mix(cr, cr * 0.80, k); cg = mix(cg, cg * 0.74, k); cb = mix(cb, cb * 0.66, k);
                        rough = mix(rough, 0.055, k);
                    }

                    rough = mix(1.0, rough, smooth(0.0002, 0.005, g.film + g.bead + g.pool));
                    A[o] = toSRGB(cr) * 255; A[o + 1] = toSRGB(cg) * 255; A[o + 2] = toSRGB(cb) * 255; A[o + 3] = 255;
                    O[o] = clamp(ao, 0, 1) * 255;
                    O[o + 1] = clamp(rough, 0.04, 1) * 255;
                    O[o + 2] = 0; O[o + 3] = 255;

                    const flat = smooth(0.002, 0.018, g.film + g.pool);
                    H[i] = mix(S.h, S.hMacro, flat) + g.film + g.pool + g.bead;
                }
            }

            const texel = (2 * half) / N;
            this.albedo = TextureLab.fromBuffer("panTopA", A, N, N, scene, false, true);
            this.orm = TextureLab.fromBuffer("panTopO", O, N, N, scene, true, true);
            this.normal = TextureLab.normalFrom("panTopN", H, N, N, 1 / texel, 1 / texel, scene, true, cfg.normalFlipY);
            this.dryAlbedo = TextureLab.fromBuffer("panTopAd", Ad, N, N, scene, false, true);
            this.dryORM = TextureLab.fromBuffer("panTopOd", Od, N, N, scene, true, true);
            this.dryNormal = TextureLab.normalFrom("panTopNd", Hd, N, N, 1 / texel, 1 / texel, scene, true, cfg.normalFlipY);
            this.height = H;
        }
        dispose() {
            for (const t of [this.albedo, this.orm, this.normal,
                             this.dryAlbedo, this.dryORM, this.dryNormal]) if (t) t.dispose();
            this.height = null;
        }
    }

    class SideSkin {
        constructor(scene, cfg, field) {
            const P = field.perimeter;
            const tiles = Math.max(1, Math.round(P / 5.8));
            const TA = P / tiles;                    // 1 タイルの周方向の実寸(cm)
            const TH = cfg.thickness - 2 * cfg.edgeRoll;   // 帯の高さ(cm)
            this.tileArc = TA; this.tileH = TH;

            const W = cfg.texSideW;
            const Hh = Math.max(48, Math.round(W * TH / TA / 8) * 8);
            const sd = (cfg.fieldSeed ^ 0x2545f491) >>> 0;
            const NU = 6;                            // 折り返し周期（整数）
            const UCM = TA / NU;                     // 1 ノイズ単位の実寸(cm)

            const A = new Uint8ClampedArray(W * Hh * 4);
            const O = new Uint8ClampedArray(W * Hh * 4);
            const HF = new Float32Array(W * Hh);

            const CR_MID = [0.945, 0.780, 0.312];
            const CR_SH = [0.868, 0.688, 0.278];
            const CR_PO = [0.796, 0.614, 0.226];
            const CR_LIP = [0.792, 0.522, 0.086];
            const CR_LIP2 = [0.608, 0.330, 0.028];

            for (let y = 0; y < Hh; y++) {
                const v = y / (Hh - 1);
                const vc = v * TH;                   // cm
                const ny = vc / UCM;
                for (let x = 0; x < W; x++) {
                    const u = x / W;
                    const uc = u * TA;               // cm
                    const nx = u * NU;
                    const i = y * W + x, o = i * 4;

                    let pit = 0, pore = 0;
                    for (let k = 0; k < cfg.pitsSide.length; k++) {
                        const q = cfg.pitsSide[k];
                        const c = Noise.capU(uc, vc, q[0], q[1], q[2], q[3], sd + 401 + k * 37, TA);
                        pit += c * q[4];
                        if (c > pore) pore = c;
                    }
                    const layer = Noise.fbm2u(nx, ny * 3.1, NU, sd + 13, 3);
                    const layer2 = Noise.fbm2u(nx * 2, ny * 7.4, NU * 2, sd + 19, 2);
                    const grain = Noise.fbm2u(nx * 4, ny * 12.0, NU * 4, sd + 29, 2);

                    const lipW = 0.115 * (0.60 + 0.85 * Noise.fbm2u(nx, 3.3, NU, sd + 31, 2));
                    const lipT = smooth(lipW, 0.0, vc);
                    const lipB = smooth(lipW * 1.25, 0.0, TH - vc);
                    const lip = clamp(lipT + lipB, 0, 1);

                    let cr = CR_MID[0], cg = CR_MID[1], cb = CR_MID[2];
                    const sh = smooth(0.34, 0.74, layer) * 0.70 + smooth(0.36, 0.70, layer2) * 0.30;
                    cr = mix(cr, CR_SH[0], sh * 0.62); cg = mix(cg, CR_SH[1], sh * 0.62); cb = mix(cb, CR_SH[2], sh * 0.62);
                    const pk = smooth(0.10, 0.68, pore);
                    cr = mix(cr, CR_PO[0], pk * 0.55); cg = mix(cg, CR_PO[1], pk * 0.55); cb = mix(cb, CR_PO[2], pk * 0.55);
                    const gk = (grain - 0.5) * 0.055;
                    cr = clamp(cr + gk, 0, 1); cg = clamp(cg + gk * 0.92, 0, 1); cb = clamp(cb + gk * 0.80, 0, 1);
                    const l1 = smooth(0.05, 0.62, lip) * cfg.lipDeep;
                    cr = mix(cr, CR_LIP[0], l1); cg = mix(cg, CR_LIP[1], l1); cb = mix(cb, CR_LIP[2], l1);
                    const l2 = smooth(0.55, 1.00, lip) * cfg.lipDeep * 0.72;
                    cr = mix(cr, CR_LIP2[0], l2); cg = mix(cg, CR_LIP2[1], l2); cb = mix(cb, CR_LIP2[2], l2);

                    A[o] = cr * 255; A[o + 1] = cg * 255; A[o + 2] = cb * 255; A[o + 3] = 255;

                    let ao = 1 - 0.20 * pk - 0.06 * sh;
                    let rough = 0.845 - 0.14 * smooth(0.20, 0.95, lip) + 0.09 * pk + 0.07 * (layer - 0.5);
                    O[o] = clamp(ao, 0, 1) * 255;
                    O[o + 1] = clamp(rough, 0.06, 1) * 255;
                    O[o + 2] = 0; O[o + 3] = 255;

                    let h = 0;
                    h -= pit;
                    h += (layer - 0.5) * 0.055 + (layer2 - 0.5) * 0.026 + (grain - 0.5) * 0.012;
                    h -= smooth(0.10, 0.80, lip) * 0.030;
                    HF[i] = h;
                }
            }

            this.albedo = TextureLab.fromBuffer("panSideA", A, W, Hh, scene, false, false);
            this.orm = TextureLab.fromBuffer("panSideO", O, W, Hh, scene, true, false);
            const tx = W / TA, tz = Hh / TH;         // px per cm
            this.normal = TextureLab.normalFrom("panSideN", HF, W, Hh, tx, tz, scene, false, cfg.normalFlipY);
        }
        dispose() { for (const t of [this.albedo, this.orm, this.normal]) if (t) t.dispose(); }
    }

    class ButterSkin {
        constructor(scene, cfg) {
            const N = cfg.texButter, sd = (cfg.fieldSeed ^ 0x7f4a7c15) >>> 0;
            const melt = cfg.melt;
            const A = new Uint8ClampedArray(N * N * 4);
            const O = new Uint8ClampedArray(N * N * 4);
            const H = new Float32Array(N * N);
            const CB = [0.992, 0.886, 0.478];   // 写真 #ecd674 / #f4d06f
            const CB2 = [0.966, 0.808, 0.330];
            const CB3 = [1.000, 0.962, 0.760];

            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    const u = x / N, v = y / N, i = y * N + x, o = i * 4;
                    const wob = (Noise.fbm2uv(u * 5, v * 5, 5, 5, sd + 3, 2) - 0.5) * 0.10;
                    const line = Math.abs(Math.sin((v + wob) * Math.PI * 26));
                    const ridge = Math.pow(line, 0.55);
                    const grit = Noise.fbm2uv(u * 22, v * 22, 22, 22, sd + 7, 2);
                    const keep = 1 - smooth(0.10, 0.75, melt);
                    H[i] = (ridge * 0.62 + grit * 0.38) * keep + grit * 0.22 * (1 - keep);

                    let cr = CB[0], cg = CB[1], cb = CB[2];
                    const t = smooth(0.30, 0.85, grit);
                    cr = mix(cr, CB2[0], t * 0.34); cg = mix(cg, CB2[1], t * 0.34); cb = mix(cb, CB2[2], t * 0.34);
                    cr = mix(cr, CB3[0], ridge * 0.16 * keep);
                    cg = mix(cg, CB3[1], ridge * 0.16 * keep);
                    cb = mix(cb, CB3[2], ridge * 0.16 * keep);
                    A[o] = cr * 255; A[o + 1] = cg * 255; A[o + 2] = cb * 255; A[o + 3] = 255;
                    const rough = mix(0.42 - 0.10 * ridge, 0.105, smooth(0.05, 0.80, melt)) + 0.06 * (grit - 0.5);
                    O[o] = (1 - 0.10 * (1 - ridge)) * 255;
                    O[o + 1] = clamp(rough, 0.05, 1) * 255;
                    O[o + 2] = 0; O[o + 3] = 255;
                }
            }
            this.albedo = TextureLab.fromBuffer("butA", A, N, N, scene, false, false);
            this.orm = TextureLab.fromBuffer("butO", O, N, N, scene, true, false);
            this.normal = TextureLab.normalFrom("butN", H, N, N, 1.5 * (1 - 0.5 * melt), 1.5 * (1 - 0.5 * melt), scene, false, cfg.normalFlipY);
        }
        dispose() { for (const t of [this.albedo, this.orm, this.normal]) if (t) t.dispose(); }
    }

    class TableSkin {
        constructor(scene, cfg) {
            const NP = cfg.texPlate, sp = 4242;
            const HP = new Float32Array(NP * NP);
            const OP = new Uint8ClampedArray(NP * NP * 4);
            for (let y = 0; y < NP; y++) {
                for (let x = 0; x < NP; x++) {
                    const u = x / NP, v = y / NP, i = y * NP + x, o = i * 4;
                    const glaze = Noise.fbm2uv(u * 8, v * 8, 8, 8, sp + 3, 3);
                    const spec = Noise.fbm2uv(u * 48, v * 48, 48, 48, sp + 9, 1);
                    HP[i] = glaze * 0.85 + spec * 0.15;
                    const rough = clamp(0.085 + 0.045 * (glaze - 0.5) + 0.02 * (spec - 0.5), 0.03, 0.4);
                    OP[o] = 255; OP[o + 1] = rough * 255; OP[o + 2] = 0; OP[o + 3] = 255;
                }
            }
            this.plateORM = TextureLab.fromBuffer("plateO", OP, NP, NP, scene, true, false);
            this.plateNormal = TextureLab.normalFrom("plateN", HP, NP, NP, 0.30, 0.30, scene, false);

            const NW = cfg.texWood, sw = 913;
            const AW = new Uint8ClampedArray(NW * NW * 4);
            const OW = new Uint8ClampedArray(NW * NW * 4);
            const HW = new Float32Array(NW * NW);
            const TILE = 40, PW = 8;
            const W_LT = [0.612, 0.428, 0.268];
            const W_DK = [0.372, 0.230, 0.132];
            const W_GP = [0.268, 0.158, 0.092];   // 導管
            for (let y = 0; y < NW; y++) {
                const wv = (y / NW) * TILE;              // 板を横切る方向
                const plank = Math.floor(wv / PW);
                const inP = wv - plank * PW;
                for (let x = 0; x < NW; x++) {
                    const wu = (x / NW) * TILE;          // 木目に沿う方向
                    const i = y * NW + x, o = i * 4;
                    const ps = sw + plank * 137;
                    const c0 = 1.4 + 5.2 * Noise.h2(plank, 7, sw + 11);
                    const freq = 1.05 + 0.85 * Noise.h2(plank, 13, sw + 17);
                    const warp = (Noise.fbm2uv(wu * 0.10, wv * 1.05, 4, 42, ps + 3, 3) - 0.5) * 2.6;
                    const g = Math.abs(inP - c0) * freq + warp;
                    const ring = g - Math.floor(g);
                    let t = smooth(0.58, 0.96, ring) * 0.82 + smooth(0.0, 0.30, ring) * 0.18;
                    const fib = Noise.fbm2uv(wu * 1.6, wv * 26, 64, 1040, ps + 9, 2);
                    t = clamp(t * (0.82 + 0.36 * fib), 0, 1);
                    let cr = mix(W_LT[0], W_DK[0], t);
                    let cg = mix(W_LT[1], W_DK[1], t);
                    let cb = mix(W_LT[2], W_DK[2], t);
                    const por = Noise.fbm2uv(wu * 3.2, wv * 40, 128, 1600, ps + 21, 1);
                    const pore = smooth(0.80, 0.97, por);
                    cr = mix(cr, W_GP[0], pore * 0.55); cg = mix(cg, W_GP[1], pore * 0.55); cb = mix(cb, W_GP[2], pore * 0.55);
                    const seam = smooth(0.20, 0.0, Math.min(inP, PW - inP));
                    cr = mix(cr, 0.115, seam); cg = mix(cg, 0.080, seam); cb = mix(cb, 0.055, seam);

                    AW[o] = cr * 255; AW[o + 1] = cg * 255; AW[o + 2] = cb * 255; AW[o + 3] = 255;
                    HW[i] = (1 - t) * 0.35 - pore * 0.55 - seam * 1.6 + fib * 0.10;
                    OW[o] = (1 - 0.18 * pore - 0.30 * seam) * 255;
                    OW[o + 1] = clamp(0.38 + 0.30 * pore + 0.10 * t, 0.10, 1) * 255;
                    OW[o + 2] = 0; OW[o + 3] = 255;
                }
            }
            this.woodAlbedo = TextureLab.fromBuffer("woodA", AW, NW, NW, scene, false, false);
            this.woodORM = TextureLab.fromBuffer("woodO", OW, NW, NW, scene, true, false);
            this.woodNormal = TextureLab.normalFrom("woodN", HW, NW, NW, 1.1, 1.1, scene, false);
        }
        dispose() {
            for (const t of [this.plateORM, this.plateNormal,
            this.woodAlbedo, this.woodORM, this.woodNormal]) if (t) t.dispose();
        }
    }

    class SyrupSkin {
        constructor(scene, cfg) {
            const N = 256, sd = (cfg.fieldSeed ^ 0x3c6ef372) >>> 0;
            const O = new Uint8ClampedArray(N * N * 4);
            const H = new Float32Array(N * N);
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    const u = x / N, v = y / N, i = y * N + x, o = i * 4;
                    const flow = Noise.fbm2uv(u * 6, v * 1.6, 6, 2, sd + 3, 3);
                    const fine = Noise.fbm2uv(u * 20, v * 5, 20, 5, sd + 11, 2);
                    H[i] = flow * 0.80 + fine * 0.20;
                    const rough = clamp(0.034 + 0.026 * (flow - 0.5) + 0.010 * (fine - 0.5), 0.018, 0.075);
                    O[o] = 255; O[o + 1] = rough * 255; O[o + 2] = 0; O[o + 3] = 255;
                }
            }
            this.orm = TextureLab.fromBuffer("syrO", O, N, N, scene, true, false);
            this.normal = TextureLab.normalFrom("syrN", H, N, N, 0.16, 0.16, scene, false, cfg.normalFlipY);
        }
        dispose() { for (const t of [this.orm, this.normal]) if (t) t.dispose(); }
    }

    class Stack {
        constructor(scene, cfg, field, skinTop, skinSide) {
            this.scene = scene; this.cfg = cfg; this.field = field;
            this.parts = []; this.nodes = [];
            this.root = new BABYLON.TransformNode("stackRoot", scene);

            this.matTop = this._mat("panTopMat", skinTop, 1.0);
            this.matSide = this._mat("panSideMat", skinSide, 0.85);
            this.matBot = this._mat("panBotMat", skinTop, 1.0);
            this.matBot.backFaceCulling = false;
            this.matHero = this._mat("panHeroMat", skinTop, 1.0);
            this.matHero.reflectionTexture = syrupStudio;
            this.matHero.useRoughnessFromMetallicTextureAlpha = false;

            const half = skinTop.half, invUV = 1 / (2 * half);
            const F = field;
            const sdB = (cfg.fieldSeed ^ 0x517cc1b7) >>> 0;

            const proto = buildSolid({
                scene: scene, name: "pancake",
                M: cfg.segAngular, Nr: cfg.segTop, Nb: cfg.segBottom, NV: cfg.segSide,
                cr: cfg.edgeRoll, bulge: cfg.sideBulge,
                hRim: cfg.thickness, hBotRim: 0,
                perimeter: F.perimeter,
                R: (a) => F.outlineAt(a),
                arc: (a) => F.arcAt(a),
                dist: (x, z) => F.dist(x, z),
                hTop: (x, z, d) => F.macroAt(x, z, d),
                hBot: (x, z, d) => (Noise.fbm2(x * 1.5 + 90, z * 1.5 + 12, sdB, 3) - 0.5) * 0.055 * smooth(0.15, 1.10, d),
                uvTop: (x, z) => [x * invUV + 0.5, z * invUV + 0.5],
                uvBot: (x, z) => [-x * invUV + 0.5, z * invUV + 0.5],
                uvSide: (a, arc, v) => [arc / skinSide.tileArc, v],
                matTop: this.matTop, matSide: this.matSide, matBot: this.matBot
            });

            const N = cfg.stack;
            const rng = new Rng((cfg.seed ^ 0x1a2b3c4d) >>> 0);
            this.pcs = [];
            for (let i = 0; i < N; i++) {
                const isTop = (i === N - 1);
                this.pcs.push({
                    y0: 0,
                    sxz: isTop ? 1 : rng.range(0.952, 1.032),
                    sy: isTop ? 1 : rng.range(0.900, 1.060),
                    ry: isTop ? 0 : rng.range(0, TAU),
                    ox: isTop ? 0 : rng.range(-0.15, 0.15),
                    oz: isTop ? 0 : rng.range(-0.15, 0.15)
                });
            }
            let yc = 0;
            for (let i = 0; i < N; i++) {
                this.pcs[i].y0 = yc;
                yc += cfg.thickness * this.pcs[i].sy - cfg.sink;
            }

            for (let i = 0; i < N; i++) {
                const p = this.pcs[i];
                const node = new BABYLON.TransformNode("pan" + i, scene);
                node.parent = this.root;
                node.position.set(p.ox, p.y0, p.oz);
                node.rotation.y = p.ry;
                node.scaling.set(p.sxz, p.sy, p.sxz);
                const meshes = (i === N - 1) ? proto : proto.map((m) => m.clone(m.name + "_" + i));
                for (const m of meshes) {
                    m.parent = node; this.parts.push(m);
                    if (i === N - 1 && /Top$/.test(m.name)) m.material = this.matHero;
                }
                this.nodes.push(node);
                p.node = node;
            }
            this.topNode = this.nodes[N - 1];
            this.topP = this.pcs[N - 1];
            this.drop = null;
        }

        prepareDrop(scene, cfg) {
            const N = this.pcs.length, D = [];
            const rng = new Rng((cfg.seed ^ 0x7f4a7c15) >>> 0);
            for (let i = 0; i < N; i++) {
                const p = this.pcs[i];
                const h = cfg.thickness * p.sy - cfg.sink;
                const proxy = BABYLON.MeshBuilder.CreateCylinder("panProxy" + i, {
                    diameter: cfg.radius * 2 * p.sxz * 0.985, height: h, tessellation: 20
                }, scene);
                proxy.isVisible = false;
                proxy.setEnabled(false);
                proxy.position.set(rng.range(-0.35, 0.35), 0, rng.range(-0.35, 0.35));
                proxy.rotationQuaternion = BABYLON.Quaternion.RotationAxis(V3.Up(), p.ry);
                D.push({
                    i: i, proxy: proxy, h: h, body: null,
                    settleT: 0, aliveT: 0, frozen: false, live: false, settled: false
                });
                this.nodes[i].setEnabled(false);
            }
            this.drop = D;
            this.root.position.set(0, 0, 0);
            return D;
        }

        readbackDrop() {
            if (!this.drop) return;
            for (const d of this.drop) {
                const p = this.pcs[d.i], q = d.proxy.rotationQuaternion;
                p.ox = d.proxy.position.x;
                p.oz = d.proxy.position.z;
                p.y0 = d.proxy.position.y - d.h * 0.5;
                p.ry = q ? Math.atan2(2 * (q.w * q.y + q.x * q.z),
                    1 - 2 * (q.y * q.y + q.z * q.z)) : 0;
                const node = this.nodes[d.i];
                node.parent = this.root;
                node.position.set(p.ox, p.y0, p.oz);
                node.rotation.y = p.ry;
                node.rotationQuaternion = null;
                node.scaling.set(p.sxz, p.sy, p.sxz);
            }
            this.topP = this.pcs[this.pcs.length - 1];
        }

        _mat(name, skin, bump) {
            const m = new BABYLON.PBRMaterial(name, this.scene);
            m.albedoTexture = skin.albedo;
            m.metallicTexture = skin.orm;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.metallic = 0.0;
            m.bumpTexture = skin.normal;
            m.bumpTexture.level = bump;
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.tintColor = srgb(1.00, 0.815, 0.510);
            m.subSurface.translucencyIntensity = 0.20;
            m.subSurface.minimumThickness = 0.45;
            m.subSurface.maximumThickness = 1.90;
            return m;
        }

        radiusAt(phi, y) {
            const cfg = this.cfg, F = this.field, cr = cfg.edgeRoll;
            let best = -1;
            for (const p of this.pcs) {
                const yl = (y - p.y0) / p.sy;
                if (yl < -0.02 || yl > cfg.thickness + 0.02) continue;
                const dT = cfg.thickness - yl, dB = yl;
                let inset = 0;
                if (dT < cr) { const q = 1 - dT / cr; inset = cr * (1 - Math.sqrt(Math.max(0, 1 - q * q))); }
                if (dB < cr) { const q = 1 - dB / cr; inset = Math.max(inset, cr * (1 - Math.sqrt(Math.max(0, 1 - q * q)))); }
                const v = clamp((cfg.thickness - cr - yl) / Math.max(1e-4, cfg.thickness - 2 * cr), 0, 1);
                const bul = 1 + cfg.sideBulge * Math.sin(Math.PI * v) * 4;
                let R = (F.outlineAt(phi + p.ry) * bul - inset) * p.sxz;
                R += p.ox * Math.cos(phi) + p.oz * Math.sin(phi);
                if (R > best) best = R;
            }
            return best;
        }

        topY() { return this.topP.y0 + this.cfg.thickness * this.topP.sy; }

        bounds() {
            const cfg = this.cfg;
            if (this._hTop === undefined) {
                const F = this.field, R = cfg.radius;
                let h = cfg.thickness;
                for (let i = 0; i <= 18; i++) {
                    for (let j = 0; j <= 18; j++) {
                        const x = mix(-R, R, i / 18), z = mix(-R, R, j / 18);
                        const d = F.dist(x, z);
                        if (d < 0.02) continue;
                        const v = F.macroAt(x, z, d);
                        if (v > h) h = v;
                    }
                }
                this._hTop = h;
            }
            let minY = Infinity, maxY = -Infinity;
            for (const p of this.pcs) {
                minY = Math.min(minY, p.y0);
                maxY = Math.max(maxY, p.y0 + this._hTop * p.sy);
            }
            const M = 180, K = 14;
            let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (let j = 0; j < M; j++) {
                const phi = TAU * j / M;
                let R = -1;
                for (let k = 0; k <= K; k++) {
                    const r = this.radiusAt(phi, mix(minY, maxY, k / K));
                    if (r > R) R = r;
                }
                if (R < 0) continue;
                const x = R * Math.cos(phi), z = R * Math.sin(phi);
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            }
            if (minX === Infinity) { minX = maxX = minZ = maxZ = 0; }
            const P = this.root.position;
            return {
                minX: minX + P.x, maxX: maxX + P.x,
                minY: minY + P.y, maxY: maxY + P.y,
                minZ: minZ + P.z, maxZ: maxZ + P.z
            };
        }

        dispose() {
            if (this.drop) {
                for (const d of this.drop) {
                    if (d.body) { try { d.body.dispose(); } catch (e) { } }
                    d.proxy.dispose();
                }
                this.drop = null;
            }
            for (const m of this.parts) m.dispose();
            this.parts.length = 0;
            for (const n of this.nodes) n.dispose();
            this.nodes.length = 0;
            for (const m of [this.matTop, this.matSide, this.matBot, this.matHero]) if (m) m.dispose();
            if (this.root) this.root.dispose();
        }
    }

    class Butter {
        constructor(scene, cfg, field, garnish, skin) {
            this.scene = scene; this.cfg = cfg;
            this.parts = [];
            const melt = cfg.melt;
            const sdB = (cfg.fieldSeed ^ 0x2c1b3a59) >>> 0;

            const BX = 1.06, BZ = 0.82;                    // 切り分けた一片
            const Hb = 0.92 * (1 - 0.34 * melt);
            const topRoll = 0.070 + 0.30 * melt;
            const botRoll = Math.min(0.055 + 0.18 * melt, (0.92 * (1 - 0.34 * melt) - topRoll) * 0.70);
            const cTop = 0.080 + 0.34 * melt;
            const cBot = 0.170 + 0.62 * melt;
            const slump = 0.070 + 0.30 * melt;
            const wobA = 0.018 + 0.070 * melt;

            const rr = (x, z, bx, bz, r) => {
                const qx = Math.abs(x) - bx + r, qz = Math.abs(z) - bz + r;
                const ax = Math.max(qx, 0), az = Math.max(qz, 0);
                return Math.hypot(ax, az) + Math.min(Math.max(qx, qz), 0) - r;
            };
            const sec = (v) => {
                const s = 1 + slump * Math.pow(v, 1.9);
                const bx = BX * s, bz = BZ * s;
                let c = mix(cTop, cBot, v);
                c = Math.min(c, Math.min(bx, bz) * 0.94);
                return [bx, bz, c];
            };
            const sdf = (x, z, v) => {
                const S = sec(v);
                let d = rr(x, z, S[0], S[1], S[2]);
                d -= (Noise.fbm2(x * 2.3 + 11, z * 2.3 + 29, sdB, 3) - 0.5) * 2 * wobA;
                return d;
            };
            const Rat = (a, v) => {
                const cx = Math.cos(a), cz = Math.sin(a);
                let lo = 0, hi = 4.0;
                for (let k = 0; k < 24; k++) {
                    const m = (lo + hi) * 0.5;
                    if (sdf(m * cx, m * cz, v) < 0) lo = m; else hi = m;
                }
                return lo;
            };

            const M = 128, NV = 14, Nr = 22, Nb = 10;
            const yHi = Hb - topRoll, yLo = botRoll;
            const uvS = 1 / (2 * BX * (1 + slump) * 1.05);
            const uvT = (x, z) => [x * uvS + 0.5, z * uvS * (BX / BZ) * 0.72 + 0.5];

            const mat = new BABYLON.PBRMaterial("butterMat", scene);
            mat.albedoTexture = skin.albedo;
            mat.metallicTexture = skin.orm;
            mat.useAmbientOcclusionFromMetallicTextureRed = true;
            mat.useRoughnessFromMetallicTextureGreen = true;
            mat.useMetallnessFromMetallicTextureBlue = true;
            mat.metallic = 0.0;
            mat.bumpTexture = skin.normal;
            mat.bumpTexture.level = 0.85;
            mat.subSurface.isTranslucencyEnabled = true;
            mat.subSurface.tintColor = srgb(1.00, 0.885, 0.470);
            mat.subSurface.translucencyIntensity = 0.72;
            mat.subSurface.minimumThickness = 0.12;
            mat.subSurface.maximumThickness = 0.90;
            if (melt > 0.05) {
                mat.clearCoat.isEnabled = true;
                mat.clearCoat.intensity = 0.30 + 0.55 * melt;
                mat.clearCoat.roughness = mix(0.20, 0.055, melt);
                mat.clearCoat.indexOfRefraction = 1.46;
            }
            this.mat = mat;

            const COS = new Float32Array(M), SIN = new Float32Array(M);
            for (let j = 0; j < M; j++) { const a = TAU * j / M; COS[j] = Math.cos(a); SIN[j] = Math.sin(a); }

            {
                const total = 1 + Nr * M;
                const pos = new Float32Array(total * 3), uvs = new Float32Array(total * 2);
                const yAt = (x, z) => {
                    const d = -sdf(x, z, 0);
                    const e = clamp(d / topRoll, 0, 1);
                    const q = 1 - Math.sqrt(Math.max(0, 1 - (1 - e) * (1 - e)));
                    const crown = 0.026 * (1 - melt) * smooth(0, 0.55, d) - 0.085 * melt * smooth(0.04, 0.70, d);
                    const hs = mix(Hb, Hb + crown, smooth(0, 1, e));
                    return hs - topRoll * q;
                };
                const setP = (k, x, y, z) => {
                    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
                    const uv = uvT(x, z); uvs[k * 2] = uv[0]; uvs[k * 2 + 1] = uv[1];
                };
                setP(0, 0, yAt(0, 0), 0);
                for (let i = 1; i <= Nr; i++) {
                    const t = Math.pow(i / Nr, 0.72);
                    for (let j = 0; j < M; j++) {
                        const r = t * Rat(TAU * j / M, 0);
                        const x = r * COS[j], z = r * SIN[j];
                        setP(1 + (i - 1) * M + j, x, yAt(x, z), z);
                    }
                }
                const idx = [];
                for (let j = 0; j < M; j++) idx.push(0, 1 + j, 1 + (j + 1) % M);
                for (let i = 1; i < Nr; i++) {
                    const r0 = 1 + (i - 1) * M, r1 = 1 + i * M;
                    for (let j = 0; j < M; j++) {
                        const jn = (j + 1) % M;
                        idx.push(r0 + j, r1 + j, r0 + jn, r0 + jn, r1 + j, r1 + jn);
                    }
                }
                const mesh = makeMesh("butterTop", pos, new Uint32Array(idx), uvs, scene);
                mesh.material = mat; mesh.receiveShadows = true;
                this.parts.push(mesh);
            }

            {
                const total = (NV + 1) * (M + 1);
                const pos = new Float32Array(total * 3), uvs = new Float32Array(total * 2);
                for (let i = 0; i <= NV; i++) {
                    const v = i / NV;
                    for (let j = 0; j <= M; j++) {
                        const jj = j % M, a = TAU * jj / M;
                        const R = Rat(a, v);
                        const k = i * (M + 1) + j;
                        pos[k * 3] = R * Math.cos(a);
                        pos[k * 3 + 1] = mix(yHi, yLo, v);
                        pos[k * 3 + 2] = R * Math.sin(a);
                        uvs[k * 2] = (j / M) * 3.0; uvs[k * 2 + 1] = v * 0.9;
                    }
                }
                const idx = [];
                for (let i = 0; i < NV; i++) {
                    for (let j = 0; j < M; j++) {
                        const a = i * (M + 1) + j, b = a + 1, c = a + (M + 1), d = c + 1;
                        idx.push(a, c, b, b, c, d);
                    }
                }
                const mesh = makeMesh("butterSide", pos, new Uint32Array(idx), uvs, scene);
                mesh.material = mat; mesh.receiveShadows = true;
                this.parts.push(mesh);
            }

            {
                const total = 1 + Nb * M;
                const pos = new Float32Array(total * 3), uvs = new Float32Array(total * 2);
                const yAt = (x, z) => {
                    const d = -sdf(x, z, 1);
                    const e = clamp(d / botRoll, 0, 1);
                    return botRoll * (1 - Math.sqrt(Math.max(0, 1 - (1 - e) * (1 - e))));
                };
                const setP = (k, x, y, z) => {
                    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
                    const uv = uvT(-x, z); uvs[k * 2] = uv[0]; uvs[k * 2 + 1] = uv[1];
                };
                setP(0, 0, yAt(0, 0), 0);
                for (let i = 1; i <= Nb; i++) {
                    const t = Math.pow(i / Nb, 0.72);
                    for (let j = 0; j < M; j++) {
                        const r = t * Rat(TAU * j / M, 1);
                        const x = r * COS[j], z = r * SIN[j];
                        setP(1 + (i - 1) * M + j, x, yAt(x, z), z);
                    }
                }
                const idx = [];
                for (let j = 0; j < M; j++) idx.push(0, 1 + (j + 1) % M, 1 + j);
                for (let i = 1; i < Nb; i++) {
                    const r0 = 1 + (i - 1) * M, r1 = 1 + i * M;
                    for (let j = 0; j < M; j++) {
                        const jn = (j + 1) % M;
                        idx.push(r0 + j, r0 + jn, r1 + j, r0 + jn, r1 + jn, r1 + j);
                    }
                }
                const mesh = makeMesh("butterBottom", pos, new Uint32Array(idx), uvs, scene);
                mesh.material = mat;
                this.parts.push(mesh);
            }

            const sink = 0.035 + 0.20 * melt;
            const surf = field.macroAt(garnish.bx, garnish.bz);
            this.node = new BABYLON.TransformNode("butterRoot", scene);
            this.node.position.set(garnish.bx, surf - sink, garnish.bz);
            this.node.rotation.y = garnish.bRot;
            this.node.rotation.x = 0.045;
            this.node.rotation.z = -0.030;
            for (const m of this.parts) m.parent = this.node;
        }

        dispose() {
            for (const m of this.parts) m.dispose();
            this.parts.length = 0;
            if (this.mat) this.mat.dispose();
            if (this.node) this.node.dispose();
        }
    }

    function plateSurfaceY(r, cfg) {
        const s = clamp(r / cfg.plateR, 0, 1);
        return 1.35 * smooth(0.55, 1.0, s) + 0.045 * smooth(0.0, 0.58, s) - 0.02;
    }

    class Syrup {
        constructor(scene, cfg, field, garnish, stack, skin) {
            this.scene = scene; this.cfg = cfg;
            this.parts = [];
            this.drips = []; this.pool = null; this.stream = null;
            this.root = new BABYLON.TransformNode("syrupRoot", scene);

            const m = new BABYLON.PBRMaterial("syrupMat", scene);
            m.albedoColor = BABYLON.Color3.White();
            m.metallic = 0;
            m.roughness = 1;
            m.metallicTexture = skin.orm;
            m.useRoughnessFromMetallicTextureAlpha = false;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.bumpTexture = skin.normal;
            m.bumpTexture.level = 0.12;
            m.enableSpecularAntiAliasing = true;
            m.reflectionTexture = syrupStudio;
            m.subSurface.isTranslucencyEnabled = false;
            m.clearCoat.isEnabled = false;
            m.subSurface.isRefractionEnabled = true;
            m.subSurface.refractionIntensity = 1;
            m.subSurface.indexOfRefraction = cfg.syrupIOR;
            m.subSurface.volumeIndexOfRefraction = cfg.syrupIOR;
            m.subSurface.useThicknessAsDepth = true;
            m.subSurface.useAlbedoToTintRefraction = false;
            m.subSurface.tintColor = new BABYLON.Color3(
                ...SYR_SIG.map(v => Math.exp(-v * cfg.syrupDensity * 2)));
            m.subSurface.tintColorAtDistance = 1; // 1 unit = 1 cm
            m.subSurface.minimumThickness = 0;
            m.subSurface.maximumThickness = cfg.syrupMaxThickness;
            m.subSurface.useGltfStyleTextures = false;
            m.subSurface.useMaskFromThicknessTexture = false;
            const ramp = new Uint8Array(256 * 4);
            for (let i = 0; i < 256; i++) {
                ramp[i * 4] = i; ramp[i * 4 + 1] = i;
                ramp[i * 4 + 2] = i; ramp[i * 4 + 3] = 255;
            }
            this.thicknessTexture = BABYLON.RawTexture.CreateRGBATexture(ramp, 256, 1, scene, false, false,
                BABYLON.Texture.BILINEAR_SAMPLINGMODE);
            this.thicknessTexture.gammaSpace = false;
            this.thicknessTexture.coordinatesIndex = 1;
            this.thicknessTexture.wrapU = this.thicknessTexture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
            m.subSurface.thicknessTexture = this.thicknessTexture;
            const rt = new BABYLON.RenderTargetTexture('syrupOpaqueScene', cfg.syrupRefractionSize,
                scene, true, true, BABYLON.Engine.TEXTURETYPE_HALF_FLOAT);
            rt.activeCamera = camera;
            rt.gammaSpace = false;
            rt.disableImageProcessing = true;
            rt.clearColor = scene.clearColor.clone();
            rt.lodGenerationScale = 1;
            rt.lodGenerationOffset = -4;
            rt.samples = 2;
            rt.renderParticles = false;
            rt.renderListPredicate = mesh => !this.parts.includes(mesh) && mesh.isVisible
                && mesh.isEnabled() && mesh.layerMask !== 0x20000000;
            let savedIntensity;
            rt.onBeforeBindObservable.add(() => {
                savedIntensity = scene.environmentIntensity;
                scene.environmentIntensity = 1;
            });
            rt.onAfterUnbindObservable.add(() => { scene.environmentIntensity = savedIntensity; });
            this.refractionTarget = rt;
            m.subSurface.refractionTexture = rt;
            this.mat = m;

            for (const d of garnish.drips) this._drip(d, cfg, field, stack, m);
            this._pool(cfg, garnish, stack, m);
            if (cfg.pour || cfg.pourAnim) this._pour(cfg, field, garnish, stack, m);
            for (const p of this.parts) p.parent = this.root;
        }

        _drip(d, cfg, field, stack, mat) {
            const NT = 64, NS = 13;
            const top = stack.topP;
            const SLOPE = 0.28;          // 半径 cm / 高さ cm
            const KN = 8, KD = 0.065;
            const envAt = (ph, yy) => {
                let m = -1;
                for (let k = -KN; k <= KN; k++) {
                    const dy = k * KD;
                    const r = stack.radiusAt(ph, yy + dy);
                    if (r < 0) continue;
                    const v = r - Math.abs(dy) * SLOPE;
                    if (v > m) m = v;
                }
                return m;
            };
            const yStart = top.y0 + (cfg.thickness - 0.10) * top.sy;
            const w0 = Noise.fbm2(3, 7.1, d.seed, 3) - 0.5;
            let rFoot = stack.radiusAt(d.a, cfg.thickness * 0.55);
            if (rFoot < 0) rFoot = cfg.radius;
            const rootP = stack.root.position;
            const yFloor = 0.02 + Math.max(0, plateSurfaceY(Math.hypot(
                rootP.x + rFoot * Math.cos(d.a),
                rootP.z + rFoot * Math.sin(d.a)), cfg));
            const yEnd = yStart - d.len * (yStart - yFloor);
            const span = Math.max(0.3, yStart - yEnd);
            const YN = 200, yLo = yEnd - 0.7, yHi = yStart + 0.7;
            const AN = 4, aHalf = 0.26;
            const dTab = new Float32Array((AN + 1) * (YN + 1));
            const fTab = new Float32Array((AN + 1) * (YN + 1));
            for (let ia = 0; ia <= AN; ia++) {
                const aa = d.a + (ia / AN * 2 - 1) * aHalf;
                for (let k = 0; k <= YN; k++) {
                    const yy = mix(yLo, yHi, k / YN);
                    const rc = stack.radiusAt(aa, yy), e = envAt(aa, yy);
                    const v = (rc < 0 || e < 0) ? 0 : Math.max(0, e - rc);
                    dTab[ia * (YN + 1) + k] = v;
                    fTab[ia * (YN + 1) + k] = smooth(0.02, 0.30, v);
                }
            }
            const tab2 = (T, aa, yy) => {
                let da = (aa - d.a); da -= Math.round(da / TAU) * TAU;
                const ua = clamp((da / aHalf * 0.5 + 0.5), 0, 1) * AN;
                const a0 = Math.min(AN - 1, ua | 0), fa = ua - a0;
                const uy = clamp((yy - yLo) / (yHi - yLo), 0, 1) * YN;
                const y0 = Math.min(YN - 1, uy | 0), fy = uy - y0;
                const r0 = mix(T[a0 * (YN + 1) + y0], T[a0 * (YN + 1) + y0 + 1], fy);
                const r1 = mix(T[(a0 + 1) * (YN + 1) + y0], T[(a0 + 1) * (YN + 1) + y0 + 1], fy);
                return mix(r0, r1, fa);
            };
            const tabAt = (T, yy) => tab2(T, d.a, yy);
            const total = (NT + 1) * (NS + 1);
            const pos = new Float32Array(total * 3);
            const uvs = new Float32Array(total * 2);
            const col = new Float32Array(total * 4);
            col.fill(1);
            const thicknessUV = new Float32Array(total * 2);
            const area = new Float32Array(NT + 1);   // 行ごとの断面積（送り込む量）
            const SUB = [0.747, 0.489, 0.067];

            for (let i = 0; i <= NT; i++) {
                const t = i / NT;
                const y = mix(yStart, yEnd, Math.pow(t, 0.92));
                const wob = (Noise.fbm2(t * 2.6 + 3, 7.1, d.seed, 3) - 0.5) - w0;
                const phi = d.a + d.drift * 2 * wob * smooth(0.0, 0.22, t);
                let rC = stack.radiusAt(phi, y);
                if (rC < 0) rC = cfg.radius;

                let hang = 0, hw = 0;
                for (let k = -4; k <= 14; k++) {
                    const dy = k * 0.05;
                    const w = dy >= 0 ? Math.exp(-dy / 0.30) : Math.exp(dy / 0.09);
                    hang += tabAt(fTab, y + dy) * w; hw += w;
                }
                hang /= hw;

                let prof = 1 - 0.30 * t;
                prof *= 1 + 0.18 * smooth(0.12, 0.0, t);   // 縁を出た所は舌に太る
                prof *= 0.80 + 0.42 * Noise.fbm2(t * 2.9 + 5, 2.3, d.seed + 7, 2);
                prof *= 1 + 0.75 * hang * hang;            // 溝にぶら下がる玉
                const tip = d.long ? 0
                    : Math.exp(-Math.pow((t - 0.88) * span / 0.20, 2));
                if (!d.long) {
                    prof *= 1 + 1.75 * tip * clamp(span / 2.6, 0.55, 1.0);
                    prof *= Math.sqrt(smooth(1.0, 1.0 - 0.14 / span, t));
                } else {
                    prof *= 1 + 0.55 * smooth(0.72, 1.0, t); // 皿へ注ぎ込む足元
                }
                const lip = smooth(0.0, 0.16, t);
                let wid = d.w * prof * (1 + 0.30 * hang) * (1 + 0.34 * (1 - lip));
                let thk = d.t * prof * (1 + 0.45 * hang) * (0.14 + 0.86 * lip);
                area[i] = wid * thk + tabAt(dTab, y) * wid * 0.55;
                const bulb = clamp(hang * hang * 0.95 + tip, 0, 1);
                const rd = Math.sqrt(wid * thk) * 1.06;
                wid = mix(wid, rd, bulb);
                thk = mix(thk, rd, bulb);
                const ha = wid / Math.max(0.6, rC);

                for (let j = 0; j <= NS; j++) {
                    const th = (j / NS - 0.5) * Math.PI;
                    const s = Math.sin(th), cs = Math.cos(th);
                    const ph = phi + s * ha;
                    let rBase = stack.radiusAt(ph, y);
                    if (rBase < 0) rBase = rC;
                    const edge = Math.abs(s);
                    const fill = tab2(dTab, ph, y) * (1 - edge * edge * edge)
                               * (0.22 + 0.78 * lip);
                    const rs = rBase + fill;
                    const b = thk * cs + 0.014;
                    const R = rs + b;
                    const k = i * (NS + 1) + j;
                    pos[k * 3] = R * Math.cos(ph);
                    pos[k * 3 + 1] = y;
                    pos[k * 3 + 2] = R * Math.sin(ph);
                    uvs[k * 2] = (s * 0.5 + 0.5) * 0.55;
                    uvs[k * 2 + 1] = t * 3.2;
                    const depth = Math.max(0.003, b + fill);
                    thicknessUV[k * 2] = (0.5 + 255 * clamp(depth / cfg.syrupMaxThickness, 0, 1)) / 256;
                    thicknessUV[k * 2 + 1] = 0.5;
                }
            }
            {
                const off = new Float32Array(total), pp = new Float32Array(total);
                const bs = new Float32Array(total);
                for (let k = 0; k < total; k++) {
                    pp[k] = Math.atan2(pos[k * 3 + 2], pos[k * 3]);
                    let b0 = stack.radiusAt(pp[k], pos[k * 3 + 1]);
                    if (b0 < 0) b0 = cfg.radius;
                    bs[k] = b0;
                    off[k] = Math.hypot(pos[k * 3], pos[k * 3 + 2]) - b0;
                }
                const tmp = new Float32Array(total);
                for (let pass = 0; pass < 2; pass++) {
                    tmp.set(off);
                    for (let i = 1; i < NT; i++) {
                        for (let j = 0; j <= NS; j++) {
                            const k = i * (NS + 1) + j, u = k - (NS + 1), w = k + (NS + 1);
                            off[k] = 0.25 * tmp[u] + 0.5 * tmp[k] + 0.25 * tmp[w];
                        }
                    }
                }
                for (let k = 0; k < total; k++) {
                    const R = bs[k] + Math.max(0.010, off[k]);
                    pos[k * 3] = R * Math.cos(pp[k]);
                    pos[k * 3 + 2] = R * Math.sin(pp[k]);
                }
            }
            const idx = [];
            for (let i = 0; i < NT; i++) {
                for (let j = 0; j < NS; j++) {
                    const a = i * (NS + 1) + j, b = a + 1, c = a + (NS + 1), dd = c + 1;
                    idx.push(a, c, b, b, c, dd);
                }
            }
            const mesh = makeMesh("drip", pos, new Uint32Array(idx), uvs, this.scene, col);
            mesh.setVerticesData(BABYLON.VertexBuffer.UV2Kind, thicknessUV);
            const cum = new Float32Array(NT + 1);
            let acc = 0;
            for (let i = 0; i <= NT; i++) { acc += Math.max(1e-6, area[i]); cum[i] = acc; }
            for (let i = 0; i <= NT; i++) cum[i] /= acc;
            mesh.__cum = cum;
            this.drips.push(mesh);
            mesh.material = mat; mesh.receiveShadows = true;
            this.parts.push(mesh);
        }

        _pool(cfg, garnish, stack, mat) {
            const sd = (garnish.sd + 1301) >>> 0;
            const a0 = garnish.drips[0].a;
            let Rf = stack.radiusAt(a0, cfg.thickness * 0.55);
            if (Rf < 0) Rf = cfg.radius;
            const cx = Math.cos(a0) * (Rf + 0.12);
            const cz = Math.sin(a0) * (Rf + 0.12);
            const M = 192, Nr = 32, Rp0 = 2.50;
            const poolH = 0.260, beadH = 0.075;
            const rootP = stack.root.position;
            const pYAt = (x, z) => plateSurfaceY(
                Math.hypot(rootP.x + x, rootP.z + z), cfg);
            const pYc = pYAt(cx, cz);
            const yW = pYc + poolH * 0.90;
            let rClip = cfg.plateR;
            {
                let lo = 0, hi = cfg.plateR;
                for (let k = 0; k < 24; k++) {
                    const m = (lo + hi) * 0.5;
                    if (plateSurfaceY(m, cfg) < yW) lo = m; else hi = m;
                }
                rClip = Math.max(1.0, lo - 0.06);
            }
            const Cx = rootP.x + cx, Cz = rootP.z + cz;
            const clipAt = (a) => {
                const cd = Cx * Math.cos(a) + Cz * Math.sin(a);
                const disc = cd * cd + rClip * rClip - (Cx * Cx + Cz * Cz);
                return disc <= 0 ? 0.25 : (-cd + Math.sqrt(disc));
            };
            const Rp = (a) => {
                const outline = Rp0 * (0.84 + 0.10 * Math.sin(a * 3 + a0)
                    + 0.045 * Math.cos(a * 5 - a0));
                return Math.max(0.30, Math.min(clipAt(a), outline));
            };

            const total = 1 + Nr * M;
            const pos = new Float32Array(total * 3);
            const uvs = new Float32Array(total * 2);
            const col = new Float32Array(total * 4);
            col.fill(1);
            const thicknessUV = new Float32Array(total * 2);
            const SUB = [0.907, 0.905, 0.898];
            const hAt = (s, x, z) => {
                const bead = beadH * Math.exp(-Math.pow((s - 0.10) / 0.090, 2)) * smooth(0.0, 0.055, s);
                const plateY = pYAt(x, z);
                const body = Math.max(0, yW - plateY) * smooth(0.0, 0.42, s);
                return plateY + 0.006 + bead + body;
            };
            const setP = (k, x, y, z) => {
                pos[k * 3] = x - cx; pos[k * 3 + 1] = y - pYc; pos[k * 3 + 2] = z - cz;
                uvs[k * 2] = x * 0.22 + 0.5; uvs[k * 2 + 1] = z * 0.22 + 0.5;
                const depth = Math.max(0.003, y - pYAt(x, z));
                thicknessUV[k * 2] = (0.5 + 255 * clamp(depth / cfg.syrupMaxThickness, 0, 1)) / 256;
                thicknessUV[k * 2 + 1] = 0.5;
            };
            setP(0, cx, hAt(Rp(0), cx, cz), cz);
            for (let i = 1; i <= Nr; i++) {
                const t = Math.pow(i / Nr, 0.80);
                for (let j = 0; j < M; j++) {
                    const a = TAU * j / M, R = Rp(a);
                    const r = t * R, s = R - r;
                    const x = cx + r * Math.cos(a), z = cz + r * Math.sin(a);
                    setP(1 + (i - 1) * M + j, x, hAt(s, x, z), z);
                }
            }
            const idx = [];
            for (let j = 0; j < M; j++) idx.push(0, 1 + j, 1 + (j + 1) % M);
            for (let i = 1; i < Nr; i++) {
                const r0 = 1 + (i - 1) * M, r1 = 1 + i * M;
                for (let j = 0; j < M; j++) {
                    const jn = (j + 1) % M;
                    idx.push(r0 + j, r1 + j, r0 + jn, r0 + jn, r1 + j, r1 + jn);
                }
            }
            const mesh = makeMesh("syrupPool", pos, new Uint32Array(idx), uvs, this.scene, col);
            mesh.setVerticesData(BABYLON.VertexBuffer.UV2Kind, thicknessUV);
            mesh.position.set(cx, pYc, cz);
            this.pool = mesh;
            mesh.material = mat; mesh.receiveShadows = true;
            this.parts.push(mesh);
        }

        _pour(cfg, field, garnish, stack, mat) {
            const NT = 70, M = 16;
            const sd = (garnish.sd + 4441) >>> 0;
            const top = stack.topP;
            const x0 = top.ox + garnish.sx, z0 = top.oz + garnish.sz;
            const yTop = 15.0;
            const yBot = top.y0 + field.macroAt(garnish.sx, garnish.sz) + (cfg.butter ? 0.42 : 0.05);
            const r0 = 0.115, v0 = 62, g = 981;

            const total = (NT + 1) * (M + 1);
            const pos = new Float32Array(total * 3);
            const uvs = new Float32Array(total * 2);
            const col = new Float32Array(total * 4);
            col.fill(1);
            const thicknessUV = new Float32Array(total * 2);
            const SUB = [0.50, 0.48, 0.44];
            for (let i = 0; i <= NT; i++) {
                const t = i / NT;
                const y = mix(yTop, yBot, t);
                const fall = Math.max(0, yTop - y);
                const v = Math.sqrt(v0 * v0 + 2 * g * fall);
                let r = r0 * Math.sqrt(v0 / v);
                r *= 1 + 0.10 * (Noise.fbm2(t * 9.0, 3.3, sd, 2) - 0.5);
                const dx = x0 + (1 - t) * (-0.30 + 0.10 * (Noise.fbm2(t * 3.1, 11.0, sd + 5, 3) - 0.5));
                const dz = z0 + (1 - t) * (0.16 + 0.10 * (Noise.fbm2(t * 3.1, 41.0, sd + 9, 3) - 0.5));
                for (let j = 0; j <= M; j++) {
                    const a = TAU * (j % M) / M, k = i * (M + 1) + j;
                    pos[k * 3] = dx + r * Math.cos(a);
                    pos[k * 3 + 1] = y;
                    pos[k * 3 + 2] = dz + r * Math.sin(a);
                    uvs[k * 2] = (j / M) * 0.6; uvs[k * 2 + 1] = t * 6.0;
                    thicknessUV[k * 2] = (0.5 + 255 * clamp(1.6 * r / cfg.syrupMaxThickness, 0, 1)) / 256;
                    thicknessUV[k * 2 + 1] = 0.5;
                }
            }
            const idx = [];
            for (let i = 0; i < NT; i++) {
                for (let j = 0; j < M; j++) {
                    const a = i * (M + 1) + j, b = a + 1, c = a + (M + 1), d = c + 1;
                    idx.push(a, c, b, b, c, d);
                }
            }
            const mesh = makeMesh("pourStream", pos, new Uint32Array(idx), uvs, this.scene, col);
            mesh.setVerticesData(BABYLON.VertexBuffer.UV2Kind, thicknessUV);
            this.stream = mesh;
            mesh.material = mat;
            this.parts.push(mesh);
        }

        dispose() {
            for (const p of this.parts) p.dispose();
            this.parts.length = 0;
            if (this.mat) this.mat.dispose();
            if (this.refractionTarget) this.refractionTarget.dispose();
            if (this.thicknessTexture) this.thicknessTexture.dispose();
            if (this.root) this.root.dispose();
        }
    }

    class Table {
        constructor(scene, cfg, skin) {
            this.scene = scene; this.cfg = cfg;
            this.parts = []; this.casters = []; this.mats = [];
            this.root = new BABYLON.TransformNode("tableRoot", scene);
            if (cfg.showPlate) this._plate(skin);
            if (cfg.showTable) this._wood(skin);
            for (const m of this.parts) m.parent = this.root;
        }

        _plate(skin) {
            const cfg = this.cfg, scene = this.scene;
            const TH = 0.34;
            const inner = [];
            inner.push([0, 0]);
            const R1 = cfg.plateR;
            for (let i = 1; i <= 40; i++) {
                const s = i / 40, r = R1 * s;
                inner.push([r, plateSurfaceY(r, cfg) + 0.02]);
            }
            const outward = (k) => {
                const a = inner[Math.max(0, k - 1)], b = inner[Math.min(inner.length - 1, k + 1)];
                const dr = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dr, dy) || 1;
                return [dy / L, -dr / L];
            };
            const outer = inner.map((p, k) => {
                const n = outward(k);
                return [p[0] + TH * n[0], p[1] + TH * n[1]];
            });
            const tip = inner[inner.length - 1], tipOut = outer[outer.length - 1];
            const cx = (tip[0] + tipOut[0]) * 0.5, cy = (tip[1] + tipOut[1]) * 0.5;
            const v0x = tip[0] - cx, v0y = tip[1] - cy;
            const roll = [];
            for (let i = 1; i < 12; i++) {
                const a = (i / 12) * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
                roll.push([cx + v0x * ca + v0y * sa, cy - v0x * sa + v0y * ca]);
            }
            const prof = inner.slice();
            for (const q of roll) prof.push(q);
            for (let k = outer.length - 1; k >= 1; k--) prof.push(outer[k]);
            prof.push([0, outer[0][1]]);

            const NP = prof.length, M = 168, tile = 1 / 6.0;
            const total = NP * (M + 1);
            const pos = new Float32Array(total * 3);
            const uvs = new Float32Array(total * 2);
            const arc = new Float32Array(NP);
            for (let i = 1; i < NP; i++) {
                arc[i] = arc[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]);
            }
            const circ = TAU * R1 * 0.5;
            for (let i = 0; i < NP; i++) {
                const r = prof[i][0], y = prof[i][1];
                for (let j = 0; j <= M; j++) {
                    const a = TAU * j / M, k = i * (M + 1) + j;
                    pos[k * 3] = r * Math.cos(a); pos[k * 3 + 1] = y - 0.02; pos[k * 3 + 2] = r * Math.sin(a);
                    uvs[k * 2] = (j / M) * circ * tile;
                    uvs[k * 2 + 1] = arc[i] * tile;
                }
            }
            const idx = [];
            for (let i = 0; i < NP - 1; i++) {
                for (let j = 0; j < M; j++) {
                    const a = i * (M + 1) + j, b = a + 1, c = a + (M + 1), d = c + 1;
                    idx.push(a, c, b, b, c, d);
                }
            }
            const mesh = makeMesh("plate", pos, new Uint32Array(idx), uvs, scene);
            const pm = new BABYLON.PBRMaterial("plateMat", scene);
            pm.albedoColor = srgb(0.958, 0.956, 0.948);
            pm.metallicTexture = skin.plateORM;
            pm.useAmbientOcclusionFromMetallicTextureRed = true;
            pm.useRoughnessFromMetallicTextureGreen = true;
            pm.useMetallnessFromMetallicTextureBlue = true;
            pm.metallic = 0.0;
            pm.bumpTexture = skin.plateNormal;
            pm.bumpTexture.level = 0.30;
            pm.subSurface.isTranslucencyEnabled = true;
            pm.subSurface.tintColor = srgb(0.98, 0.98, 1.00);
            pm.subSurface.translucencyIntensity = 0.16;
            pm.subSurface.minimumThickness = 0.30;
            pm.subSurface.maximumThickness = 0.90;
            mesh.material = pm;
            mesh.receiveShadows = true;
            this.mats.push(pm);
            this.parts.push(mesh);
            this.casters.push(mesh);
        }

        _wood(skin) {
            const scene = this.scene;
            const mesh = BABYLON.MeshBuilder.CreateGround("wood", { width: 160, height: 160, subdivisions: 2 }, scene);
            mesh.position.y = -0.40;
            const wm = new BABYLON.PBRMaterial("woodMat", scene);
            wm.albedoTexture = skin.woodAlbedo;
            wm.metallicTexture = skin.woodORM;
            wm.useAmbientOcclusionFromMetallicTextureRed = true;
            wm.useRoughnessFromMetallicTextureGreen = true;
            wm.useMetallnessFromMetallicTextureBlue = true;
            wm.metallic = 0.0;
            wm.bumpTexture = skin.woodNormal;
            wm.bumpTexture.level = 0.75;
            for (const t of [wm.albedoTexture, wm.metallicTexture, wm.bumpTexture]) {
                t.uScale = 4; t.vScale = 4;
            }
            mesh.material = wm;
            mesh.receiveShadows = true;
            this.mats.push(wm);
            this.parts.push(mesh);
        }

        dispose() {
            for (const m of this.parts) m.dispose();
            for (const m of this.mats) m.dispose();
            this.parts.length = 0; this.mats.length = 0;
            if (this.root) this.root.dispose();
        }
    }

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.052, 0.046, 0.042, 1);

    let physicsOK = false;
    if (DROP.on) {
        try {
            const hk = new BABYLON.HavokPlugin(false);
            scene.enablePhysics(new V3(0, -980, 0), hk);
            if (hk.setTimeStep) hk.setTimeStep(1 / DROP.hz);
            physicsOK = true;
        } catch (e) {
            console.warn("[Pancake] Havok を初期化できませんでした。そのまま組み上げます。", e);
        }
    }

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.45;
    scene.environmentIntensity = 0.82;
    scene.createDefaultSkybox(env, true, 1000, 0.58, false);

    const syrupStudio = (() => {
        const n = 128, faces = [];
        const boxes = [
            { dir: new V3(-0.45, 0.75, 0.55).normalize(), w: 0.48, h: 0.68, gain: 1.0 },
            { dir: new V3(0.75, 0.42, -0.45).normalize(), w: 0.16, h: 0.60, gain: 0.6 }
        ];
        for (const b of boxes) {
            b.u = V3.Cross(new V3(0, 1, 0), b.dir).normalize();
            b.v = V3.Cross(b.dir, b.u).normalize();
        }
        for (let f = 0; f < 6; f++) {
            const pixels = new Uint8Array(n * n * 4);
            for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
                const u = 2 * (x + 0.5) / n - 1, v = 2 * (y + 0.5) / n - 1;
                const dirs = [[1,-v,-u],[-1,-v,u],[u,1,v],[u,-1,-v],[u,-v,1],[-u,-v,-1]];
                const d = new V3(...dirs[f]).normalize();
                let light = 0.035 + 0.045 * Math.max(0, d.y);
                for (const b of boxes) {
                    const front = V3.Dot(d, b.dir);
                    if (front <= 0) continue;
                    const px = Math.abs(V3.Dot(d, b.u) / front), py = Math.abs(V3.Dot(d, b.v) / front);
                    light += b.gain * (1 - smooth(b.w * 0.88, b.w, px)) * (1 - smooth(b.h * 0.88, b.h, py));
                }
                const i = (y * n + x) * 4;
                pixels[i] = clamp(light, 0, 1) * 255;
                pixels[i + 1] = clamp(light * 0.97, 0, 1) * 255;
                pixels[i + 2] = clamp(light * 0.91, 0, 1) * 255;
                pixels[i + 3] = 255;
            }
            faces.push(pixels);
        }
        const tex = new BABYLON.RawCubeTexture(scene, faces, n, BABYLON.Engine.TEXTUREFORMAT_RGBA,
            BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        tex.name = 'Syrup studio windows';
        tex.gammaSpace = false; tex.level = 2.5;
        const copyIrradiance = () => {
            const src = env.sphericalPolynomial;
            if (!src) return;
            const p = new BABYLON.SphericalPolynomial();
            for (const k of ['x','y','z','xx','yy','zz','xy','yz','zx']) p[k].copyFrom(src[k]).scaleInPlace(1 / tex.level);
            tex.sphericalPolynomial = p;
        };
        if (env.isReady()) copyIrradiance(); else env.onLoadObservable.addOnce(copyIrradiance);
        scene.onDisposeObservable.add(() => tex.dispose());
        return tex;
    })();
    const camera = new BABYLON.ArcRotateCamera("cam", CAM_ALPHA, 1.12, 26, new V3(0, 2.30, 0), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 10;
    camera.minZ = 0.05;
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 140;
    camera.upperBetaLimit = 1.50;
    camera.fov = 0.52;
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.42, -0.95, 0.58).normalize(), scene);
    key.position = new V3(15, 30, -18);
    key.intensity = 2.10;
    key.diffuse = new BABYLON.Color3(1.0, 0.978, 0.938);
    key.specular = new BABYLON.Color3(0.34, 0.32, 0.30);
    key.autoCalcShadowZBounds = true;

    const rim = new BABYLON.DirectionalLight("rim", new V3(0.68, -0.38, -0.92).normalize(), scene);
    rim.intensity = 1.05;
    rim.diffuse = new BABYLON.Color3(1.0, 0.925, 0.845);
    rim.specular = new BABYLON.Color3(0.22, 0.20, 0.18);

    const fill = new BABYLON.HemisphericLight("fill", new V3(0, 1, 0), scene);
    fill.intensity = 0.26;
    fill.diffuse = new BABYLON.Color3(0.93, 0.95, 1.0);
    fill.groundColor = new BABYLON.Color3(0.26, 0.22, 0.18);
    fill.specular = new BABYLON.Color3(0, 0, 0);

    const diag = new BABYLON.DirectionalLight("diag", new V3(0.05, -0.14, 0.99).normalize(), scene);
    diag.intensity = 0;

    const sg = new BABYLON.ShadowGenerator(1024, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.forceBackFacesOnly = true;
    sg.bias = 0.0020;
    sg.normalBias = 0.018;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.16;
    ip.contrast = 1.15;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.25;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    let state = null, tableSkin = null, table = null, ssao = null, onRebuilt = null;
    let floor = null, floorBody = null;
    let viewMode = 0;

    function saveLook(m) {
        if (m._look) return;
        m._look = {
            cc: m.clearCoat.isEnabled, ccI: m.clearCoat.intensity, ccR: m.clearCoat.roughness,
            refract: m.subSurface.isRefractionEnabled, ss: m.subSurface.isTranslucencyEnabled, albedo: m.albedoColor.clone()
        };
    }
    function applyViewMode(mode) {
        if (!state) return;
        const kt = state.skinTop;
        const dry = kt.dryAlbedo
            ? { albedo: kt.dryAlbedo, orm: kt.dryORM, normal: kt.dryNormal }
            : kt;
        const heroSet = state.wet ? kt : dry;
        const syrupWet = state.wet && state.cfg.syrup;
        state.stack.matHero.reflectionTexture = syrupWet ? syrupStudio : null;
        state.stack.matHero.useRoughnessFromMetallicTextureAlpha = !syrupWet;
        const pairs = [
            [state.stack.matTop, dry],
            [state.stack.matSide, state.skinSide],
            [state.stack.matBot, dry],
            [state.stack.matHero, heroSet]
        ];
        if (state.butter) pairs.push([state.butter.mat, state.skinBut]);
        if (state.syrup) pairs.push([state.syrup.mat, state.skinSyr]);
        for (const [m, s] of pairs) {
            saveLook(m);
            const L = m._look;
            if (mode === 0) {
                m.albedoTexture = s.albedo || null;
                m.albedoColor = L.albedo;
                if (state.syrup) for (const q of state.syrup.parts) q.useVertexColors = true;
                m.metallicTexture = s.orm;
                m.metallic = 0.0; m.roughness = null;
                m.bumpTexture = s.normal;
                m.emissiveTexture = null;
                m.emissiveColor = new BABYLON.Color3(0, 0, 0);
                m.subSurface.isTranslucencyEnabled = L.ss;
                m.subSurface.isRefractionEnabled = L.refract;
                m.clearCoat.isEnabled = L.cc;
                m.clearCoat.intensity = L.ccI; m.clearCoat.roughness = L.ccR;
            } else if (mode === 1) {
                m.albedoTexture = null;
                m.albedoColor = srgb(0.80, 0.80, 0.80);
                if (state.syrup) for (const q of state.syrup.parts) q.useVertexColors = false;
                m.metallicTexture = null;
                m.metallic = 0.0; m.roughness = 0.72;
                m.bumpTexture = s.normal;
                m.emissiveTexture = null;
                m.emissiveColor = new BABYLON.Color3(0, 0, 0);
                m.subSurface.isTranslucencyEnabled = false;
                m.subSurface.isRefractionEnabled = false;
                m.clearCoat.isEnabled = false;
            } else {
                m.albedoTexture = null;
                m.albedoColor = new BABYLON.Color3(0, 0, 0);
                m.metallicTexture = null;
                m.metallic = 0.0; m.roughness = 1.0;
                m.bumpTexture = null;
                m.emissiveTexture = s.normal;
                m.emissiveColor = new BABYLON.Color3(1, 1, 1);
                m.subSurface.isTranslucencyEnabled = false;
                m.subSurface.isRefractionEnabled = false;
                m.clearCoat.isEnabled = false;
            }
        }
        if (table) table.root.setEnabled(mode === 0);
    }

    let seq = null;

    function reveal(mesh, frac) {
        if (!mesh || !mesh.subMeshes || !mesh.subMeshes.length) return;
        const sm = mesh.subMeshes[0];
        if (sm.__all === undefined) sm.__all = sm.indexCount;
        let k = clamp(frac, 0, 1);
        const cum = mesh.__cum;
        if (cum) {
            let lo = 0, hi = cum.length - 1;
            while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < k) lo = m + 1; else hi = m; }
            k = lo / (cum.length - 1);
        }
        sm.indexCount = Math.floor(sm.__all * k / 3) * 3;
        mesh.setEnabled(sm.indexCount > 0);
    }

    function revealSweep(mesh, coord) {
        if (!mesh || !mesh.subMeshes || !mesh.subMeshes.length) return;
        const sm = mesh.subMeshes[0];
        if (sm.__all === undefined) sm.__all = sm.indexCount;
        const P = mesh.__proj;
        if (!P) return;
        let lo = 0, hi = P.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (P[m] <= coord) lo = m + 1; else hi = m; }
        sm.indexCount = Math.min(sm.__all, lo * 3);
        mesh.setEnabled(sm.indexCount > 0);
    }

    function say(mark, msg) {
        if (!DROP.log || !seq) return;
        const t = seq.t.toFixed(2).padStart(5);
        console.log("[" + t + "s] " + mark + " " + msg);
    }
    const deg = (r) => (r * 180 / Math.PI).toFixed(0) + "°";

    function startDrop(st) {
        seq = {
            phase: "drop", t: 0, next: 0, idx: 0,
            top: 0.0,                    // 次の一枚を放す高さ（皿の上面 = y=0）
            butterT: 0, pourT: 0, wet: false, done: {}
        };
        const c = st.cfg;
        say("▼", "落として積む（" + c.stack + "枚 / " + c.label
            + " / バター" + (c.butter ? "あり" : "なし")
            + " / シロップ" + (c.syrup ? "あり" : "なし") + "）");
    }

    function dropRelease(st) {
        const S = st.stack, cfg = st.cfg;
        const d = S.drop[seq.idx];
        d.proxy.position.y = seq.top + d.h * 0.5 + DROP.clearance;
        d.proxy.setEnabled(true);
        d.proxy.computeWorldMatrix(true);
        S.nodes[d.i].parent = d.proxy;
        S.nodes[d.i].position.set(0, -d.h * 0.5, 0);
        S.nodes[d.i].rotation.set(0, 0, 0);
        S.nodes[d.i].setEnabled(true);
        try {
            const agg = new BABYLON.PhysicsAggregate(d.proxy, BABYLON.PhysicsShapeType.CYLINDER,
                { mass: 1.0, restitution: DROP.restitution, friction: DROP.friction }, scene);
            d.body = agg.body;
            d.body.setLinearDamping(DROP.linDamp);
            d.body.setAngularDamping(DROP.angDamp);
            const isTop = (d.i === S.pcs.length - 1);
            d.body.setMassProperties({
                mass: 1.0,
                inertia: isTop ? new V3(0, 0, 0) : new V3(0, 0.6, 0),
                centerOfMass: new V3(0, 0, 0)
            });
        } catch (e) { d.body = null; }
        d.live = true;
        seq.next = DROP.gap;
        say("  ", (seq.idx + 1) + "枚目を放す      高さ " + d.proxy.position.y.toFixed(2)
            + "cm（直前の天面 " + seq.top.toFixed(2) + "cm ＋ " + DROP.clearance + "cm）");
        seq.top += d.h;
        seq.idx++;
    }

    function finishStack(st) {
        const S = st.stack, cfg = st.cfg;
        for (const d of S.drop) {
            if (!d.body) continue;
            try { d.body.setMotionType(BABYLON.PhysicsMotionType.STATIC); } catch (e) { }
            d.frozen = true;
        }
        S.readbackDrop();
        const bb0 = S.bounds();
        S.root.position.x -= (bb0.minX + bb0.maxX) * 0.5;
        S.root.position.z -= (bb0.minZ + bb0.maxZ) * 0.5;
        st.bounds = S.bounds();
        camera.target.y = (st.bounds.maxY - st.bounds.minY) * 0.48;
    }

    function makeButter(st) {
        const cfg = st.cfg;
        if (!cfg.butter) return null;
        const b = new Butter(scene, cfg, st.field, st.garnish, st.skinBut);
        b.node.parent = st.stack.topNode;
        st.butter = b;
        b.baseY = b.node.position.y;
        for (const m of b.parts) sg.addShadowCaster(m, true);
        return b;
    }

    function makeSyrup(st) {
        const cfg = st.cfg;
        if (!cfg.syrup) return null;
        const y = new Syrup(scene, cfg, st.field, st.garnish, st.stack, st.skinSyr);
        y.root.parent = st.stack.root;
        st.syrup = y;
        for (const m of y.drips) reveal(m, 0);
        if (y.stream) reveal(y.stream, 0);
        if (y.pool) y.pool.setEnabled(false);
        return y;
    }

    function makeTongue(st) {
        const S = st.stack, g = st.garnish, k = st.skinTop;
        if (!k.dryAlbedo) return null;
        let src = null;
        for (const m of S.parts) {
            if (m.parent === S.topNode && /Top$/.test(m.name)) { src = m; break; }
        }
        if (!src) return null;
        const clone = src.clone(src.name + "_tongue");
        clone.parent = S.topNode;
        clone.makeGeometryUnique();

        const fx = Math.cos(g.flow), fz = Math.sin(g.flow);
        const ind = clone.getIndices();
        const pv = clone.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const nTri = (ind.length / 3) | 0;
        const proj = new Float32Array(nTri);
        for (let t = 0; t < nTri; t++) {
            const a = ind[t * 3], b = ind[t * 3 + 1], c = ind[t * 3 + 2];
            proj[t] = ((pv[a * 3] + pv[b * 3] + pv[c * 3]) * fx
                     + (pv[a * 3 + 2] + pv[b * 3 + 2] + pv[c * 3 + 2]) * fz) / 3;
        }
        const ord = Array.from({ length: nTri }, (_, i) => i)
            .sort((i, j) => proj[i] - proj[j]);
        const ni = new Uint32Array(ind.length);
        const sp = new Float32Array(nTri);
        for (let q = 0; q < nTri; q++) {
            const t = ord[q];
            ni[q * 3] = ind[t * 3]; ni[q * 3 + 1] = ind[t * 3 + 1]; ni[q * 3 + 2] = ind[t * 3 + 2];
            sp[q] = proj[t];
        }
        clone.setIndices(ni);
        clone.__proj = sp;

        const mat = new BABYLON.PBRMaterial("tongueMat", scene);
        mat.reflectionTexture = syrupStudio;
        mat.useRoughnessFromMetallicTextureAlpha = false;
        mat.albedoTexture = k.albedo;
        mat.metallicTexture = k.orm;
        mat.useAmbientOcclusionFromMetallicTextureRed = true;
        mat.useRoughnessFromMetallicTextureGreen = true;
        mat.useMetallnessFromMetallicTextureBlue = true;
        mat.metallic = 0.0; mat.roughness = 1.0;
        mat.bumpTexture = k.normal;
        mat.zOffset = -4;                     // 同じ面の取り合いに勝たせる
        clone.material = mat;
        clone.isPickable = false;
        seq.tongue = clone; seq.tongueMat = mat;

        seq.spread0 = g.sx * fx + g.sz * fz - g.sR * 0.55;
        seq.spread1 = st.cfg.radius * 1.30;

        revealSweep(clone, -1e9);
        return clone;
    }

    function wetTop(st) {
        st.wet = true;
        applyViewMode(viewMode);
    }

    function stepSequence(dt) {
        if (!seq || !state || !state.dropping) return;
        const st = state, S = st.stack, cfg = st.cfg;
        seq.t += dt;

        if (seq.phase === "drop") {
            if (seq.idx < S.drop.length) {
                const prev = seq.idx > 0 ? S.drop[seq.idx - 1] : null;
                if (!prev) dropRelease(st);
                else if (prev.settled) {
                    seq.next -= dt;
                    if (seq.next <= 0) dropRelease(st);
                }
            }
            let allDone = (seq.idx >= S.drop.length);
            for (const d of S.drop) {
                if (!d.live || d.frozen) continue;
                d.aliveT += dt;
                if (d.proxy.position.y < -8) {
                    d.proxy.position.set(0, seq.top + d.h * 0.5, 0);
                    if (d.body) {
                        d.body.setLinearVelocity(new V3(0, 0, 0));
                        d.body.setAngularVelocity(new V3(0, 0, 0));
                    }
                    d.settleT = DROP.settleHold;
                    d.aliveT = DROP.settleTimeout;
                }
                if (d.body) {
                    const v = d.body.getLinearVelocity(), w = d.body.getAngularVelocity();
                    if (Math.abs(w.x) > 1e-4 || Math.abs(w.z) > 1e-4)
                        d.body.setAngularVelocity(new V3(0, w.y, 0));
                    const still = v.length() < DROP.settleSpeed && Math.abs(w.y) < DROP.settleSpeed * 4;
                    d.settleT = still ? d.settleT + dt : 0;
                    const rest = (d.settleT >= DROP.settleHold) || (d.aliveT >= DROP.settleTimeout);
                    if (!rest) allDone = false;
                    else if (!d.settled) {
                        d.settled = true;
                        const q = d.proxy.rotationQuaternion;
                        const ry = q ? Math.atan2(2 * (q.w * q.y + q.x * q.z),
                            1 - 2 * (q.y * q.y + q.z * q.z)) : 0;
                        say("  ", (d.i + 1) + "枚目 着地       底 y=" + (d.proxy.position.y - d.h * 0.5).toFixed(2)
                            + "cm  ずれ (" + d.proxy.position.x.toFixed(2) + ", " + d.proxy.position.z.toFixed(2)
                            + ")  回転 " + deg(ry)
                            + "  " + (d.settleT >= DROP.settleHold ? "静止" : "打ち切り"));
                    }
                }
            }
            if (allDone) {
                finishStack(st);
                const b = st.bounds;
                say("■", "積み上がり        " + (b.maxX - b.minX).toFixed(1) + "×"
                    + (b.maxZ - b.minZ).toFixed(1) + "×" + (b.maxY - b.minY).toFixed(2) + "cm"
                    + "  各段の底 " + S.pcs.map(q => q.y0.toFixed(2)).join(" / "));
                seq.phase = "butter";
                seq.butterT = 0;
                makeButter(st);
                if (st.butter) {
                    st.butter.node.setEnabled(true);
                    say("▼", "バターを落とす    定位置 y=" + st.butter.baseY.toFixed(2) + "cm から 4.2cm 上");
                } else {
                    say("▼", "バターなし");
                }
            }
            return;
        }

        if (seq.phase === "butter") {
            seq.butterT += dt;
            const u = clamp(seq.butterT / DROP.butterFall, 0, 1);
            if (st.butter) {
                const h = 4.2 * (1 - u) * (1 - u);
                st.butter.node.position.y = st.butter.baseY + h;
                const sq = 1 - 0.22 * Math.exp(-Math.pow((u - 1.0) / 0.10, 2));
                st.butter.node.scaling.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
            }
            if (u >= 1) {
                if (st.butter) {
                    st.butter.node.position.y = st.butter.baseY;
                    st.butter.node.scaling.set(1, 1, 1);
                }
                if (st.butter) say("  ", "バター着地      （縦 0.78 倍まで潰れて戻る）");
                if (!st.cfg.syrup) {
                    wetTop(st);
                    say("■", "シロップなし。完了");
                    seq.phase = "done";
                    if (onRebuilt) onRebuilt(st);
                    return;
                }
                const k = DROP.syrupSlow;
                seq.T = {
                    tStream: DROP.tStream * k, tSpread: DROP.tSpread * k,
                    tRun: DROP.tRun * k, tPool: DROP.tPool * k, tTail: DROP.tTail * k
                };
                say("▼", "シロップを注ぐ    粘り ×" + k.toFixed(1)
                    + "（注ぎ " + (seq.T.tStream + seq.T.tSpread + seq.T.tRun
                        + seq.T.tPool + seq.T.tTail).toFixed(1) + "秒）");
                seq.phase = "pour";
                seq.pourT = 0;
                seq.poolK = 0;
                makeSyrup(st);
                makeTongue(st);
            }
            return;
        }

        if (seq.phase === "pour") {
            seq.pourT += dt;
            const T = seq.T;
            let t = seq.pourT;

            const u0 = clamp(t / T.tStream, 0, 1);
            if (st.syrup.stream) reveal(st.syrup.stream, u0 * u0);
            if (!seq.done.s0) { seq.done.s0 = 1; say("  ", "① 糸が下りる"); }
            if (u0 >= 1 && !seq.done.s1) {
                seq.done.s1 = 1;
                say("  ", "② 糸がバターへ届く → 天面に広がりはじめる"
                    + "（向き " + deg(st.garnish.flow) + "）");
            }

            const u1 = clamp((t - T.tStream) / T.tSpread, 0, 1);
            const e1 = Math.pow(u1, 0.55);
            if (seq.tongue) revealSweep(seq.tongue, mix(seq.spread0, seq.spread1, e1));
            if (u1 >= 1 && !seq.wet) {
                say("  ", "③ 舌が縁へ到達 → 焼き込んだ膜へ渡し、重ねた薄皮を破棄");
                wetTop(st); seq.wet = true;
                if (seq.tongue) { seq.tongue.dispose(); seq.tongue = null; }
                if (seq.tongueMat) { seq.tongueMat.dispose(); seq.tongueMat = null; }
            }

            const u2 = clamp((t - T.tStream - T.tSpread) / T.tRun, 0, 1);
            const e2 = u2 * (0.82 + 0.18 * u2);
            for (const m of st.syrup.drips) reveal(m, e2);
            if (u2 > 0 && !seq.done.s2) {
                seq.done.s2 = 1;
                say("  ", "④ 縁を越えて側面を伝う（筋 " + st.syrup.drips.length + "本）");
            }

            const u3 = clamp((t - T.tStream - T.tSpread - T.tRun) / T.tPool, 0, 1);
            seq.poolK = Math.pow(u3, 0.45);
            if (u3 > 0 && !seq.done.s3) { seq.done.s3 = 1; say("  ", "⑤ 皿へ届く → 水たまりが広がる"); }
            if (u3 >= 1 && !seq.done.s4) { seq.done.s4 = 1; say("  ", "⑥ 広がり終わり。糸を止める"); }
            if (st.syrup && st.syrup.pool) {
                const k = Math.max(0.02, seq.poolK);
                st.syrup.pool.scaling.set(k, Math.pow(k, 0.45), k);
                st.syrup.pool.setEnabled(u3 > 0.001);
            }

            if (t > T.tStream + T.tSpread + T.tRun + T.tPool + T.tTail) {
                if (seq.tongue) { seq.tongue.dispose(); seq.tongue = null; }
                if (seq.tongueMat) { seq.tongueMat.dispose(); seq.tongueMat = null; }
                if (st.syrup) {
                    for (const m of st.syrup.drips) reveal(m, 1);
                    if (st.syrup.stream) st.syrup.stream.setEnabled(false);
                    if (st.syrup.pool) {
                        st.syrup.pool.scaling.set(1, 1, 1);
                        st.syrup.pool.setEnabled(true);
                    }
                }
                seq.phase = "done";
                applyViewMode(viewMode);
                say("■", "完了              注ぎ " + t.toFixed(2) + "s / 全体 " + seq.t.toFixed(2) + "s");
                if (st.syrup) {
                    const y = st.syrup;
                    const pct = (m) => {
                        if (!m || !m.subMeshes || !m.subMeshes.length) return "?";
                        const sm = m.subMeshes[0];
                        const a = (sm.__all === undefined) ? sm.indexCount : sm.__all;
                        return a ? Math.round(sm.indexCount / a * 100) + "%" : "?";
                    };
                    say("  ", "最終確認         垂れ " + y.drips.map(pct).join(" / ")
                        + "  水たまり " + (y.pool
                            ? (y.pool.isEnabled() ? "表示 " : "非表示 ") + y.pool.scaling.x.toFixed(2) + "倍"
                            : "なし")
                        + "  糸 " + (y.stream ? (y.stream.isEnabled() ? "表示" : "止めた") : "なし")
                        + "  薄皮 " + (seq.tongue ? "残存" : "破棄"));
                }
                if (onRebuilt) onRebuilt(st);
            }
            return;
        }
    }

    globalThis.__seqProbe = () => ({ seq: seq, state: state });

    function build(presetKey, seed, stack, butterStep, syrup, pour, flipY) {
        if (state) {
            if (state.syrup) state.syrup.dispose();
            if (state.butter) state.butter.dispose();
            state.stack.dispose();
            state.skinTop.dispose();
            state.skinSide.dispose();
            if (state.skinBut) state.skinBut.dispose();
            if (state.skinSyr) state.skinSyr.dispose();
            state = null;
        }

        const cfg = buildConfig(presetKey, seed, stack, butterStep, syrup, pour, flipY);
        const t0 = performance.now();
        const field = new Field(cfg);
        const garnish = new Garnish(cfg, field);
        const skinTop = new TopSkin(scene, cfg, field, garnish);
        const skinSide = new SideSkin(scene, cfg, field);
        const skinBut = cfg.butter ? new ButterSkin(scene, cfg) : null;
        const skinSyr = cfg.syrup ? new SyrupSkin(scene, cfg) : null;

        const st = new Stack(scene, cfg, field, skinTop, skinSide);

        const dropping = physicsOK && GLOBAL.drop;
        cfg.pourAnim = dropping && cfg.syrup;
        if (dropping) {
            st.prepareDrop(scene, cfg);
        } else {
            const bb0 = st.bounds();
            st.root.position.x = -(bb0.minX + bb0.maxX) * 0.5;
            st.root.position.z = -(bb0.minZ + bb0.maxZ) * 0.5;
        }

        let butter = null, syr = null;
        if (!dropping) {
            if (cfg.butter) {
                butter = new Butter(scene, cfg, field, garnish, skinBut);
                butter.node.parent = st.topNode;
            }
            if (cfg.syrup) {
                syr = new Syrup(scene, cfg, field, garnish, st, skinSyr);
                syr.root.parent = st.root;
            }
        }

        if (!table) {
            tableSkin = new TableSkin(scene, cfg);
            table = new Table(scene, cfg, tableSkin);
        }
        if (physicsOK && !floorBody) {
            floor = BABYLON.MeshBuilder.CreateCylinder("plateFloor", {
                diameter: cfg.plateR * 1.24, height: 2.0, tessellation: 28
            }, scene);
            floor.isVisible = false;
            floor.position.y = -1.0;
            try {
                const agg = new BABYLON.PhysicsAggregate(floor, BABYLON.PhysicsShapeType.CYLINDER,
                    { mass: 0, restitution: 0.0, friction: DROP.friction }, scene);
                floorBody = agg.body;
            } catch (e) {
                console.warn("[Pancake] 皿の当たり判定を作れませんでした。", e);
            }
        }

        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        for (const m of st.parts) sg.addShadowCaster(m, true);
        if (butter) for (const m of butter.parts) sg.addShadowCaster(m, true);
        if (table) for (const m of table.casters) sg.addShadowCaster(m, true);

        const bb = st.bounds();
        camera.target.y = (bb.maxY - bb.minY) * 0.48;

        state = {
            cfg, field, garnish, skinTop, skinSide, skinBut, skinSyr,
            stack: st, butter, syrup: syr, bounds: bb, ms: performance.now() - t0,
            dropping: dropping,
            wet: !dropping
        };
        applyViewMode(viewMode);
        if (onRebuilt) onRebuilt(state);

        console.log("[Pancake]", BUILD, "/", cfg.label, "/", cfg.stack + "枚 / seed =", cfg.seed,
            "/", (bb.maxX - bb.minX).toFixed(1) + "×" + (bb.maxZ - bb.minZ).toFixed(1)
            + "×" + (bb.maxY - bb.minY).toFixed(2) + "cm",
            "/", state.ms.toFixed(0) + "ms");
        if (dropping) startDrop(state);
        return state;
    }

    build(START_PRESET, START_SEED, GLOBAL.stack, GLOBAL.butterStep, GLOBAL.syrup, GLOBAL.pour, GLOBAL.normalFlipY);

    if (GLOBAL.useSSAO) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.42;
        ssao.totalStrength = 1.10;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 140;
        ssao.minZAspect = 0.20;
    }

    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.92;
    dp.bloomWeight = 0.13;
    dp.bloomKernel = 42;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.16;
    dp.depthOfFieldEnabled = GLOBAL.useDOF;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.Medium;
    dp.depthOfField.fStop = 5.0;
    dp.depthOfField.focalLength = 90;
    dp.depthOfField.focusDistance = camera.radius * 1000;
    scene.onBeforeRenderObservable.add(() => {
        if (dp.depthOfFieldEnabled) dp.depthOfField.focusDistance = camera.radius * 1000;
        stepSequence(Math.min(0.05, scene.getEngine().getDeltaTime() / 1000));
    });

    const GUI_MASK = 0x20000000;
    const guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene);
    guiCam.layerMask = GUI_MASK;
    scene.activeCameras = [camera, guiCam];
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (ui.layer) ui.layer.layerMask = GUI_MASK;

    const COL = {
        idle: "#2b2520", active: "#a06a24", edge: "#4c4238",
        text: "#f7f0e4", sub: "#bcac95", accent: "#e8b45c"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "236px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(17,13,10,0.82)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "16px";
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
    function addSpacer(h) {
        const sp = new BABYLON.GUI.Rectangle();
        sp.height = h || "8px"; sp.thickness = 0; sp.background = "";
        panel.addControl(sp);
    }

    addLabel("PANCAKES", 11, COL.sub, "18px");
    addLabel("焼き加減", 13, COL.accent, "22px");

    let curPreset = START_PRESET, curSeed = START_SEED;
    let curStack = GLOBAL.stack, curButter = GLOBAL.butterStep;
    let curSyrup = GLOBAL.syrup, curPour = GLOBAL.pour, curFlipY = GLOBAL.normalFlipY;
    const rebuild = () => build(curPreset, curSeed, curStack, curButter, curSyrup, curPour, curFlipY);

    const presetButtons = {};
    function highlight() {
        for (const k in presetButtons) presetButtons[k].background = (k === curPreset) ? COL.active : COL.idle;
        stackBtn.textBlock.text = "枚数: " + curStack + " 枚";
        butterBtn.textBlock.text = "バター: " + BUTTER_STEPS[curButter].label;
        butterBtn.background = curButter > 0 ? COL.active : COL.idle;
        syrupBtn.textBlock.text = "シロップ: " + (curSyrup ? "ON" : "OFF");
        syrupBtn.background = curSyrup ? COL.active : COL.idle;
        pourBtn.textBlock.text = "注ぐ: " + (curPour ? "ON" : "OFF");
        pourBtn.background = curPour ? COL.active : COL.idle;
        flipBtn.textBlock.text = "法線 Y: " + (curFlipY ? "反転" : "標準");
        flipBtn.background = curFlipY ? COL.active : COL.idle;
    }
    for (const k of Object.keys(PRESETS)) {
        presetButtons[k] = addButton("p_" + k, PRESETS[k].label, () => {
            curPreset = k; rebuild(); highlight();
        });
    }

    addSpacer();
    const stackBtn = addButton("stack", "枚数: 3 枚", () => {
        curStack = curStack >= 5 ? 1 : curStack + 1;
        rebuild(); highlight();
    });
    const butterBtn = addButton("butter", "バター: 溶けかけ", () => {
        curButter = (curButter + 1) % BUTTER_STEPS.length;
        rebuild(); highlight();
    });
    const syrupBtn = addButton("syrup", "シロップ: ON", () => {
        curSyrup = !curSyrup; if (!curSyrup) curPour = false;
        rebuild(); highlight();
    });
    const pourBtn = addButton("pour", "注ぐ: OFF", () => {
        curPour = !curPour; if (curPour) curSyrup = true;
        rebuild(); highlight();
    });
    addButton("reseed", "別の一皿を焼く", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        rebuild(); highlight();
    });

    addSpacer();
    addLabel("表示", 13, COL.accent, "22px");
    const MODES = ["通常", "白クレイ", "法線マップ"];
    const modeBtn = addButton("mode", "表示: " + MODES[0], () => {
        viewMode = (viewMode + 1) % 3;
        applyViewMode(viewMode);
        modeBtn.textBlock.text = "表示: " + MODES[viewMode];
        modeBtn.background = viewMode === 0 ? COL.idle : COL.active;
    });
    const diagBtn = addButton("diag", "診断ライト: OFF", () => {
        const on = diag.intensity === 0;
        diag.intensity = on ? 2.2 : 0;
        key.intensity = on ? 0.45 : 2.10;
        diagBtn.textBlock.text = "診断ライト: " + (on ? "ON" : "OFF");
        diagBtn.background = on ? COL.active : COL.idle;
    });
    const flipBtn = addButton("flipY", "法線 Y: 標準", () => {
        curFlipY = !curFlipY; rebuild(); highlight();
    });
    const dropBtn = addButton("drop", "落として積む: " + (GLOBAL.drop ? "ON" : "OFF"), () => {
        GLOBAL.drop = !GLOBAL.drop;
        dropBtn.textBlock.text = "落として積む: " + (GLOBAL.drop ? "ON" : "OFF");
        dropBtn.background = GLOBAL.drop ? COL.active : COL.idle;
        rebuild();
    });
    dropBtn.background = GLOBAL.drop ? COL.active : COL.idle;
    if (!physicsOK) {
        dropBtn.textBlock.text = "落として積む: 使用不可";
        dropBtn.isEnabled = false;
        dropBtn.alpha = 0.45;
    }
    const rotBtn = addButton("rotate", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.08;
        rotBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });

    const info = addLabel("", 12, COL.sub, "68px");
    onRebuilt = (st) => {
        if (!info) return;
        const bb = st.bounds;
        info.text = (bb.maxX - bb.minX).toFixed(1) + " × " + (bb.maxZ - bb.minZ).toFixed(1)
            + " × " + (bb.maxY - bb.minY).toFixed(2) + " cm\n"
            + "生成 " + st.ms.toFixed(0) + " ms\nseed: " + st.cfg.seed;
    };
    onRebuilt(state);
    highlight();

    return scene;
};

export default createScene;