// Tempura Moriawase — round plate for Babylon.js Playground (JavaScript)
// Paste this entire file into the JavaScript editor and press Run.
// Compact round ceramic plate, central mound, shrimp leaning over vegetables.
// Plating is solved by Havok: every piece is dropped one at a time and frozen
// once it stops moving, so nothing floats or leans at an impossible angle.
// CFG near the top controls ingredients, physics, SSAO and depth of field.
// No external models required. Environment uses Babylon CDN, physics uses Havok.

var createScene = async function () {
    const MM = 0.1;

    const KOROMO_PALE = [1.000, 0.913, 0.660];   // 花の先。ほとんど白い
    const KOROMO_BASE = [0.995, 0.805, 0.415];
    const KOROMO_DEEP = [0.925, 0.700, 0.335];   // 衣の谷
    const KOROMO_BURN = [0.790, 0.480, 0.160];   // 縁の焦げぎわ

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

    const SHISO_TOP = [0.333, 0.494, 0.145];
    const SHISO_VEIN = [0.502, 0.612, 0.310];
    const SHISO_BACK = [0.545, 0.647, 0.392];

    const SHISHI_SKIN = [0.318, 0.510, 0.157];
    const SHISHI_PALE = [0.545, 0.702, 0.278];
    const SHISHI_STEM = [0.412, 0.522, 0.212];

    const NASU_SKIN = [0.235, 0.145, 0.322];
    const NASU_GLOSS = [0.430, 0.330, 0.545];
    const NASU_FLESH = [0.930, 0.902, 0.835];
    const NASU_EDGE = [0.760, 0.700, 0.760];

    const KABO_SKIN = [0.168, 0.255, 0.140];
    const KABO_MID = [0.455, 0.545, 0.235];
    const KABO_FLESH = [0.945, 0.655, 0.180];

    const SARA = {
        seiji: {
            label: "青磁の丸皿",
            body: [0.720, 0.775, 0.685],
            deep: [0.530, 0.635, 0.545],
            speck: [0.360, 0.405, 0.285],
            speckAmt: 0.12,
            rough: 0.34,
            coat: 0.38
        },
        kuro: {
            label: "黒の丸皿",
            body: [0.242, 0.232, 0.222],
            deep: [0.168, 0.162, 0.158],
            speck: [0.470, 0.442, 0.400],   // 黒釉に散る鉄の斑
            speckAmt: 0.06,
            rough: 0.255,
            coat: 0.86
        },
        shiro: {
            label: "白の丸皿",
            body: [0.886, 0.872, 0.838],
            deep: [0.792, 0.775, 0.735],
            speck: [0.430, 0.380, 0.330],
            speckAmt: 0.10,
            rough: 0.185,
            coat: 0.94
        },
        ame: {
            label: "飴釉の丸皿",
            body: [0.432, 0.272, 0.138],
            deep: [0.318, 0.185, 0.090],
            speck: [0.600, 0.430, 0.240],
            speckAmt: 0.25,
            rough: 0.215,
            coat: 0.90
        }
    };

    const PLATE = {
        halfX: 8.0,        // 丸皿の半径（cm）
        halfZ: 8.0,        // halfX と同じ値で円形
        pow: 2.0,       // 角の丸み（超だ円の指数。大きいほど角ばる）
        wellY: 1.06,      // 見込み（料理が乗る面）の高さ = footH + thick
        wellIn: 0.760,     // 見込みの平らな範囲（外形に対する比）
        rimY: 2.02,      // 口縁の高さ
        rimOut: 0.995,     // 口縁の位置
        thick: 0.51,      // 肉厚
        footIn: 0.52,      // 高台の内側
        footOut: 0.70,      // 高台の外側
        footH: 0.55       // 高台の高さ（接地面から底裏まで）
    };

    const KAISHI = {
        halfX: 4.4, halfZ: 5.0,
        fold: 0.55,        // 手前の折り返しの幅に対する比
        yaw: -0.24
    };

    const CFG = {
        sara: "seiji",
        ebi: 2,        // えび天の本数（0〜3）
        shiso: true,
        shishito: 2,        // ししとうの本数（0〜3）
        nasu: true,     // なすの扇切り
        kabocha: true,     // かぼちゃ
        kaishi: true,     // 懐紙
        tsuyu: false,     // 天つゆの小鉢
        cloth: true,
        physics: true,     // Havok で1個ずつ落として盛り付ける
        seed: 20260916,
        texSize: 1024,
        ssao: false,
        dof: false,
        dofRatio: 0.040,
        dofFStop: 4.5,
        guiOwnCamera: false
    };

    // 物理（Havok）で盛り付けるときの定数。SKILL.md 5章の実測値に合わせてある
    const PHYS = {
        gravity: 620,      // cm 系。981 では接触許容量が実質1/100になり震える
        step: 1 / 120,     // 固定タイムステップ
        interval: 0.24,    // 1個ずつ落とす間隔 s
        gap: 1.10,         // 直下の物からどれだけ上で放すか cm
        shrink: 0.97,      // 凸包を内側に寄せる係数
        settleV: 1.4,      // 静止判定（速度 cm/s）
        settleW: 1.4,      // 同（角速度 rad/s）
        settleHold: 0.40,  // これだけ静止が続いたら固定 s
        timeout: 6.0,      // 最後の投入からの打ち切り s
        friction: 0.88,    // 衣どうしはよく止まる
        restitution: 0.02  // 揚げ物は跳ねない
    };

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

        hash2(xi, yi) {
            return this.p[(this.p[xi & 255] + (yi & 255)) & 511] / 255;
        }
        hash3(xi, yi, zi) {
            const a = this.p[(this.p[(this.p[xi & 255] + (yi & 255)) & 511] + (zi & 255)) & 511];
            return a / 255;
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

    const TAU = Math.PI * 2;
    const V3 = BABYLON.Vector3;
    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    const smoothstep = (e0, e1, x) => {
        const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t);
    };
    const mix = (a, b, t) => a + (b - a) * t;
    const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const l2s = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    const lin3 = (c) => [s2l(c[0]), s2l(c[1]), s2l(c[2])];

    const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const vcross = (a, b) => [
        a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
    ];
    const vlen = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    const vnorm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

    let __uid = 0;
    const named = (mesh, base) => {
        const nm = base + "_" + (__uid++);
        mesh.name = nm; mesh.id = nm;
        return mesh;
    };

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
        vd.positions = g.positions;
        vd.indices = g.indices;
        vd.normals = g.normals;
        if (g.uvs) vd.uvs = g.uvs;
        if (g.colors) vd.colors = g.colors;
        vd.applyToMesh(m, false);
        m.hasVertexAlpha = false;
        named(m, name);
        return m;
    }

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

    const TexLab = {
        make(name, size, scene, fill, opts) {
            const S = Math.max(8, Math.round(size) || 512);
            const o = opts || {};
            const t = new BABYLON.DynamicTexture(name, { width: S, height: S }, scene, true,
                BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
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

    function frames(pts, n) {
        const T = new Float64Array(n * 3), U = new Float64Array(n * 3), Vv = new Float64Array(n * 3);
        for (let i = 0; i < n; i++) {
            const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
            let tx = pts[b * 3] - pts[a * 3], ty = pts[b * 3 + 1] - pts[a * 3 + 1], tz = pts[b * 3 + 2] - pts[a * 3 + 2];
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
            Vv[i * 3] = ty * uz - tz * uy;
            Vv[i * 3 + 1] = tz * ux - tx * uz;
            Vv[i * 3 + 2] = tx * uy - ty * ux;
        }
        return { T: T, U: U, V: Vv };
    }

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

    function plateR(phi) {
        const ca = Math.abs(Math.cos(phi)), sa = Math.abs(Math.sin(phi));
        const p = PLATE.pow;
        return Math.pow(Math.pow(ca / PLATE.halfX, p) + Math.pow(sa / PLATE.halfZ, p), -1 / p);
    }

    function plateProfile() {
        const P = [];
        const push = (r, y, k) => P.push({ r: r, y: y, k: k });
        push(0.000, PLATE.wellY - 0.04, 0);
        push(0.300, PLATE.wellY - 0.03, 0);
        push(0.560, PLATE.wellY - 0.01, 0);
        push(PLATE.wellIn, PLATE.wellY, 0);
        push(0.812, PLATE.wellY + 0.20, 0);
        push(0.878, PLATE.wellY + 0.52, 0);
        push(0.936, PLATE.wellY + 0.82, 0);
        push(0.972, PLATE.rimY - 0.16, 1);
        push(PLATE.rimOut, PLATE.rimY - 0.02, 1);
        push(1.008, PLATE.rimY, 1);
        push(1.017, PLATE.rimY - 0.08, 1);
        push(1.020, PLATE.rimY - 0.22, 1);
        push(1.012, PLATE.rimY - 0.55, 2);
        push(0.978, PLATE.wellY + 0.62, 2);
        push(0.930, PLATE.wellY + 0.22, 2);
        push(0.862, PLATE.wellY - 0.14, 2);
        push(PLATE.footOut + 0.06, PLATE.wellY - PLATE.thick + 0.06, 2);
        push(PLATE.footOut, PLATE.footH, 3);
        push(PLATE.footOut - 0.006, 0.030, 3);
        push(PLATE.footOut - 0.020, 0.000, 3);
        push(PLATE.footIn + 0.020, 0.000, 3);
        push(PLATE.footIn + 0.006, 0.030, 3);
        push(PLATE.footIn, PLATE.footH, 3);
        for (let i = 1; i <= 10; i++) {
            const u = 1 - i / 10;
            push(PLATE.footIn * u, PLATE.footH + 0.10 * (1 - Math.pow(u, 1.6)), 3);
        }
        return P;
    }

    function sweepProfile(name, scene, P, radiusFn, M, wob, colFn) {
        const N = P.length;
        const arc = new Float32Array(N);
        for (let i = 1; i < N; i++) {
            arc[i] = arc[i - 1] + Math.hypot((P[i].r - P[i - 1].r) * PLATE.halfX, P[i].y - P[i - 1].y);
        }
        const total = arc[N - 1] || 1;
        const nV = N * (M + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const colors = colFn ? new Float32Array(nV * 4) : null;
        const indices = new Uint32Array((N - 1) * M * 6);
        let vo = 0;
        for (let i = 0; i < N; i++) {
            const p = P[i];
            for (let j = 0; j <= M; j++) {
                const th = (j % M) / M * TAU;
                const R = radiusFn(th) * p.r;
                const w = wob ? (1 + 0.0035 * Math.sin(3 * th + 1.1) + 0.0022 * Math.sin(5 * th + 2.3)) : 1;
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = R * w * Math.cos(th);
                positions[p3 + 1] = p.y + (wob ? 0.018 * Math.sin(2 * th + 0.7) * smoothstep(0.6, 1.0, p.r) : 0);
                positions[p3 + 2] = R * w * Math.sin(th);
                uvs[p2] = j / M; uvs[p2 + 1] = arc[i] / total;
                if (colFn) {
                    const c = colFn(p, th);
                    colors[vo * 4] = c[0]; colors[vo * 4 + 1] = c[1];
                    colors[vo * 4 + 2] = c[2]; colors[vo * 4 + 3] = 1;
                }
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
        orientOutward(positions, indices, normals, 0, P[0].y * 0.5, 0);
        weldNormals(positions, normals);
        const mesh = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals; vd.uvs = uvs;
        if (colors) vd.colors = colors;
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        named(mesh, name);
        mesh.receiveShadows = true;
        mesh.tris = io / 3;
        return mesh;
    }

    function buildPlate(scene, mat) {
        const m = sweepProfile("plate", scene, plateProfile(), plateR, 224, true, null);
        m.material = mat;
        return m;
    }

    function plateTextures(scene, sp, seed) {
        const S = Math.max(256, Math.round(CFG.texSize * 0.75)), s2 = S * S;
        const nz = new Noise(seed);
        const glaze = new Float32Array(s2), speck = new Float32Array(s2), craze = new Float32Array(s2);
        for (let y = 0; y < S; y++) {
            const v = y / S;
            for (let x = 0; x < S; x++) {
                const u = x / S, k = y * S + x;
                glaze[k] = nz.fbm2(u * 9, v * 9, 3, 9, 9);
                const fine = nz.fbm2(u * 46 + 7, v * 46 + 3, 2, 46, 46);
                const dot = nz.n2(u * 210 + 5, v * 210 + 9, 210, 210);
                speck[k] = smoothstep(0.70, 0.88, dot) * (0.35 + 0.65 * fine) * sp.speckAmt;
                const c = nz.fbm2(u * 22 + 31, v * 22 + 17, 2, 22, 22) - 0.5;
                craze[k] = (1 - smoothstep(0, 0.020, Math.abs(c))) * 0.6;
            }
        }
        const BODY = lin3(sp.body), DEEP = lin3(sp.deep), SPK = lin3(sp.speck);
        const albedo = TexLab.make("plateA", S, scene, (d) => {
            for (let k = 0; k < s2; k++) {
                const g = smoothstep(0.30, 0.78, glaze[k]);
                let r = mix(DEEP[0], BODY[0], g), gg = mix(DEEP[1], BODY[1], g), b = mix(DEEP[2], BODY[2], g);
                const s = speck[k];
                if (s > 0.001) { r = mix(r, SPK[0], s); gg = mix(gg, SPK[1], s); b = mix(b, SPK[2], s); }
                const cz = craze[k] * 0.12;
                r *= 1 - cz; gg *= 1 - cz * 1.05; b *= 1 - cz * 1.1;
                putRGB(d, k * 4, l2s(r), l2s(gg), l2s(b));
            }
        }, {});
        const orm = TexLab.orm("plateO", S, scene, (x, y, SS, o) => {
            const k = y * SS + x;
            o[0] = clamp(1 - 0.22 * craze[k] - 0.10 * speck[k], 0, 1);
            o[1] = clamp(sp.rough + 0.14 * (1 - glaze[k]) + 0.10 * speck[k], 0.05, 0.95);
            o[2] = 0;
        }, {});
        const H = new Float32Array(s2);
        for (let k = 0; k < s2; k++) {
            H[k] = clamp(0.5 + (glaze[k] - 0.5) * 0.35 - craze[k] * 0.35 - speck[k] * 0.20, 0, 1);
        }
        const normal = TexLab.normalFromHeight("plateN", S, scene, H, 0.0012, {});
        return { albedo: albedo, orm: orm, normal: normal };
    }

    function plateMaterial(scene, sp, name, seed) {
        const t = plateTextures(scene, sp, seed);
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = t.albedo;
        m.metallic = 0.0; m.roughness = 1.0;
        m.metallicTexture = t.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = t.normal;
        m.bumpTexture.level = 0.55;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = sp.coat;
        m.clearCoat.roughness = 0.075;
        m.clearCoat.indexOfRefraction = 1.52;
        m.texs = [t.albedo, t.orm, t.normal];
        return m;
    }

    function plateSurfaceY(x, z) {
        const r = Math.hypot(x, z) / PLATE.halfX;
        const profile = plateProfile();
        for (let i = 1; i < 12; i++) {
            if (r <= profile[i].r) {
                const a = profile[i - 1], b = profile[i];
                return mix(a.y, b.y, clamp((r - a.r) / (b.r - a.r), 0, 1));
            }
        }
        return PLATE.rimY;
    }

    function buildKaishi(scene, mat, rng) {
        const NU = 40, NV = 30;
        const g = new Geo();
        const W = lin3([0.955, 0.945, 0.920]);
        const Wd = lin3([0.880, 0.868, 0.842]);
        const ph = rng.range(0, 20);
        const nz = new Noise(0x4A15);
        function sheet(hx, hz, y0, foldAt, lift, tone) {
            const rows = [];
            for (let i = 0; i <= NU; i++) {
                const tu = i / NU * 2 - 1;
                const row = [];
                for (let j = 0; j <= NV; j++) {
                    const tv = j / NV * 2 - 1;
                    const f = smoothstep(foldAt - 0.04, foldAt + 0.04, tv);
                    let y = y0 + f * lift;
                    y += 0.035 * (tu * tu + tv * tv) + 0.020 * Math.sin(tu * 3.1 + ph)
                        * Math.cos(tv * 2.3 + ph);
                    const edge = Math.max(Math.abs(tu), Math.abs(tv));
                    y += 0.030 * smoothstep(0.86, 1.0, edge) * Math.sin(tu * 9 + tv * 7 + ph);
                    y = Math.max(y, plateSurfaceY(tu * hx, tv * hz) + 0.045);
                    const c = (nz.fbm2(i / NU * 6, j / NV * 6, 2, 6, 6) - 0.5) * 0.06;
                    const k = 1 + c - f * 0.02;
                    row.push(g.vert([tu * hx, y, tv * hz], i / NU, j / NV,
                        [W[0] * k * tone, W[1] * k * tone, W[2] * k * tone]));
                }
                rows.push(row);
            }
            const back = [];
            for (let i = 0; i <= NU; i++) {
                const row = [];
                for (let j = 0; j <= NV; j++) {
                    const k = rows[i][j] * 3;
                    row.push(g.vert([g.pos[k], g.pos[k + 1] - 0.022, g.pos[k + 2]], i / NU, j / NV, Wd));
                }
                back.push(row);
            }
            for (let i = 0; i < NU; i++) {
                for (let j = 0; j < NV; j++) {
                    g.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
                    g.quad(back[i][j], back[i + 1][j], back[i + 1][j + 1], back[i][j + 1]);
                }
                g.quad(rows[i][0], rows[i + 1][0], back[i + 1][0], back[i][0]);
                g.quad(rows[i][NV], back[i][NV], back[i + 1][NV], rows[i + 1][NV]);
            }
            for (let j = 0; j < NV; j++) {
                g.quad(rows[0][j], back[0][j], back[0][j + 1], rows[0][j + 1]);
                g.quad(rows[NU][j], rows[NU][j + 1], back[NU][j + 1], back[NU][j]);
            }
        }
        sheet(KAISHI.halfX, KAISHI.halfZ, PLATE.wellY + 0.03, 0.20, 0.055, 1.0);
        const geo = g.finish(null);
        const m = toMesh("kaishi", geo, scene);
        m.tris = geo.indices.length / 3;
        m.material = mat;
        m.receiveShadows = true;
        m.rotation.y = KAISHI.yaw;
        return m;
    }

    function paperTextures(scene, seed) {
        const S = 512, s2 = S * S;
        const nz = new Noise(seed);
        const H = new Float32Array(s2);
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const u = x / S, v = y / S;
                const f1 = nz.fbm2(u * 120, v * 14, 2, 120, 14);
                const f2 = nz.fbm2(u * 16 + 5, v * 130 + 3, 2, 16, 130);
                H[y * S + x] = clamp(0.5 + (f1 - 0.5) * 0.55 + (f2 - 0.5) * 0.45, 0, 1);
            }
        }
        const albedo = TexLab.make("paperA", S, scene, (d) => {
            for (let k = 0; k < s2; k++) {
                const w = 0.93 + 0.07 * H[k];
                putRGB(d, k * 4, w, w * 0.998, w * 0.988);
            }
        }, {});
        const orm = TexLab.orm("paperO", S, scene, (x, y, SS, o) => {
            const k = y * SS + x;
            o[0] = clamp(0.80 + 0.20 * H[k], 0, 1);
            o[1] = clamp(0.90 - 0.12 * H[k], 0.3, 1);
            o[2] = 0;
        }, {});
        const normal = TexLab.normalFromHeight("paperN", S, scene, H, 0.0022, {});
        return { albedo: albedo, orm: orm, normal: normal };
    }

    function kobachiProfile() {
        const P = [];
        const push = (r, y, k) => P.push({ r: r, y: y, k: k });
        push(0.000, 0.62, 0); push(0.32, 0.64, 0); push(0.58, 0.78, 0);
        push(0.78, 1.10, 0); push(0.92, 1.66, 0); push(0.985, 2.24, 0);
        push(1.000, 2.44, 1); push(1.018, 2.46, 1); push(1.030, 2.38, 1);
        push(1.028, 2.02, 2); push(0.985, 1.42, 2); push(0.905, 0.86, 2);
        push(0.80, 0.42, 2); push(0.62, 0.22, 2);
        push(0.46, 0.20, 3); push(0.45, 0.02, 3); push(0.43, 0.00, 3);
        push(0.31, 0.00, 3); push(0.295, 0.03, 3); push(0.295, 0.24, 3);
        for (let i = 1; i <= 6; i++) { const u = 1 - i / 6; push(0.295 * u, 0.24 + 0.06 * (1 - u), 3); }
        return P;
    }

    function buildKobachi(scene, mat, R) {
        const m = sweepProfile("kobachi", scene, kobachiProfile(), () => R, 96, true, null);
        m.material = mat;
        return m;
    }

    function buildTentsuyu(scene, R, y) {
        const g = new Geo();
        const NR = 12, NS = 72;
        const DEEP = lin3([0.255, 0.130, 0.032]);
        const WALL = lin3([0.420, 0.238, 0.075]);
        const rows = [];
        for (let i = 0; i <= NR; i++) {
            const t = i / NR, rr = R * (Math.sqrt(t) * 0.5 + t * 0.5);
            const row = [];
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                const w = smoothstep(0.80, 1.0, t);
                const c = [mix(DEEP[0], WALL[0], w), mix(DEEP[1], WALL[1], w), mix(DEEP[2], WALL[2], w)];
                row.push(g.vert([rr * Math.cos(th), y + w * 0.035, rr * Math.sin(th)],
                    j / NS, t, c));
            }
            rows.push(row);
        }
        for (let i = 0; i < NR; i++) {
            for (let j = 0; j < NS; j++) {
                g.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
            }
        }
        const geo = g.finish(null);
        const m = toMesh("tentsuyu", geo, scene);
        m.tris = geo.indices.length / 3;
        return m;
    }

    function face(g, a, b, c, d) { g.quad(a, b, c, d); }

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

    function crispyFlake(g, lf, rng, width, length, base, pale) {
        const K = 9, phase = rng.range(0, TAU), angle = rng.range(0, TAU);
        const ringA = [], ringB = [];
        const turn = (x, y, z) => lf.at(x * Math.cos(angle) - y * Math.sin(angle),
            x * Math.sin(angle) + y * Math.cos(angle), z);
        const center = turn(0, 0.025, length * 0.50);
        const ca = g.vert(center, 0.5, 0.5, pale);
        const cb = g.vert(turn(0, 0.003, length * 0.50), 0.5, 0.5, base);
        for (let i = 0; i < K; i++) {
            const a = i / K * TAU, r = rng.range(0.73, 1.24);
            const x = Math.cos(a) * width * r;
            const z = (0.5 + Math.sin(a) * 0.58 * r) * length;
            const y = 0.040 * Math.sin(a * 3 + phase) + 0.12 * z * z / Math.max(length, 0.01);
            const c = base.map((v, k) => mix(v, pale[k], rng.range(0.4, 0.95)));
            ringA.push(g.vert(turn(x, y + 0.017, z), 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, c));
            ringB.push(g.vert(turn(x, y - 0.017, z), 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, base));
        }
        const first = g.idx.length;
        for (let i = 0; i < K; i++) {
            const j = (i + 1) % K;
            g.tri(ca, ringA[i], ringA[j]); g.tri(cb, ringB[j], ringB[i]);
            g.quad(ringA[i], ringB[i], ringB[j], ringA[j]);
        }
        let score = 0;
        for (let t = first; t < g.idx.length; t += 3) {
            const a = g.idx[t] * 3, b = g.idx[t + 1] * 3, c = g.idx[t + 2] * 3;
            const ab = [g.pos[a] - g.pos[b], g.pos[a + 1] - g.pos[b + 1], g.pos[a + 2] - g.pos[b + 2]];
            const cbv = [g.pos[c] - g.pos[b], g.pos[c + 1] - g.pos[b + 1], g.pos[c + 2] - g.pos[b + 2]];
            const n = vcross(ab, cbv);
            score += vdot(n, [g.pos[a] - center[0], g.pos[a + 1] - center[1], g.pos[a + 2] - center[2]]);
        }
        if (score < 0) for (let t = first; t < g.idx.length; t += 3) {
            const b = g.idx[t + 1]; g.idx[t + 1] = g.idx[t + 2]; g.idx[t + 2] = b;
        }
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

    function ebiSeamCoord(u, w) {
        const curve = Math.sqrt(w * w + 0.018) - Math.sqrt(0.018);
        return (u + EBI.segCurve * (curve - 0.42)
            + 0.005 * Math.sin(u * 19 + w * 4)) * EBI.segs;
    }
    function ebiProf(u, a, b, c) {
        return (u < 0.42) ? mix(a, b, smoothstep(0, 0.42, u)) : mix(b, c, smoothstep(0.42, 1, u));
    }
    function ebiEnd(u) {
        const eh = 0.055, et = 0.075;
        if (u < eh) return Math.sqrt(Math.max(0, 1 - Math.pow(1 - u / eh, 2)));
        if (u > 1 - et) return Math.sqrt(Math.max(0, 1 - Math.pow((u - (1 - et)) / et, 2)));
        return 1;
    }
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

    // 物理の当たり判定用。表示メッシュではなく、衣の厚みを足した滑らかな筒の点群を返す
    function ebiHullPoints(sc, bend) {
        const L = EBI.len * sc, pts = [];
        const RINGS = 12, SEG = 8, pad = EBI.koromo * 0.80 * sc;
        for (let i = 0; i < RINGS; i++) {
            const t = i / (RINGS - 1);
            const u = clamp(0.03 + 0.94 * t, 0, 1);
            const z = L * (1 - t);
            const y = Math.sin(Math.PI * t) * (1 - 0.55 * t) * bend;
            const er = ebiEnd(u);
            const hw = EBI.wid * 0.5 * ebiProf(u, EBI.widHead, EBI.widMid, EBI.widTail) * er * sc + pad;
            const hu = EBI.hgt * (1 - EBI.bellyRatio)
                * ebiProf(u, EBI.hgtHead, EBI.hgtMid, EBI.hgtTail) * er * sc + pad;
            const hd = EBI.hgt * EBI.bellyRatio
                * ebiProf(u, EBI.hgtHead, EBI.hgtMid, EBI.hgtTail) * er * sc + pad;
            for (let j = 0; j < SEG; j++) {
                const th = j / SEG * TAU;
                const c = Math.cos(th), s = Math.sin(th);
                pts.push([hw * c, y + (s >= 0 ? hu : hd) * s, z]);
            }
        }
        return pts;
    }

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

    function ebiTextures(scene, seed) {
        const S = Math.max(256, Math.round(CFG.texSize * 0.5)), s2 = S * S;
        const nz = new Noise(seed);
        const np = EBI_COL;
        const F = new Float32Array(s2 * 4);
        for (let y = 0; y < S; y++) {
            const v = y / S;
            const w = Math.cos(-Math.PI / 2 + v * TAU);
            const up = Math.sin(-Math.PI / 2 + v * TAU);     // 腹 -1 〜 背 +1
            const aw = Math.abs(w);
            for (let x = 0; x < S; x++) {
                const u = x / S;
                const sc = ebiSeamCoord(u, clamp(w, -1.2, 1.2));
                const f = sc - Math.floor(sc);
                const dl = Math.min(f, 1 - f);
                const core = Math.exp(-Math.pow(dl / 0.048, 2)) * (1 - 0.30 * aw);
                const spread = (f < 0.5) ? 0.40 : 0.20;
                const feather = Math.exp(-Math.pow(dl / spread, 1.5));
                const st = nz.fbm2(u * 62 + 5, v * 7 + 3, 2, 0, 7);
                const cloud = nz.fbm2(u * 19 + 2, v * 31 + 8, 3, 0, 31);
                const vein = feather * (0.26 + 1.15 * smoothstep(0.18, 0.56, st)) * (0.58 + 0.65 * cloud);
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

    function buildShisoTen(gl, g, rng, nz, opt) {
        const NU = 70, NV = 28;
        const L = opt.len === undefined ? 7.2 : opt.len;
        const W = opt.wid === undefined ? 2.55 : opt.wid;
        const TH = 0.05;
        const lf = localFrame(opt.base, opt.fwd, opt.up || [0, 1, 0]);
        const TOP = lin3(SHISO_TOP), VEIN = lin3(SHISO_VEIN), BACK = lin3(SHISO_BACK);
        const KB = lin3(KOROMO_BASE), KP = lin3(KOROMO_PALE);
        const ph = rng.range(0, 30);

        const NORM = Math.pow(0.40, 0.50) * Math.pow(0.60, 0.75);
        function halfW(u) {
            if (u <= 0 || u >= 1) return 0;
            let w = Math.pow(u, 0.50) * Math.pow(1 - u, 0.75) / NORM;
            w *= 1 + 0.11 * Math.cos(u * 92 + 1.3) * Math.sin(Math.PI * u);
            return w * W;
        }
        function leafY(u, vr) {
            const av = Math.abs(vr);
            let y = -0.13 * W * Math.pow(av, 1.7) + 0.035 * Math.sin(u * 60 + av * 12);
            y += 0.022 * L * Math.sin(u * 5.2 + ph) * (0.3 + 0.7 * u);  // 長手のうねり
            y += 0.020 * W * Math.exp(-Math.pow(av * 7, 2));     // 主脈のふくらみ
            return y;
        }
        function vein(u, vr) {
            const av = Math.abs(vr);
            const mid = Math.exp(-Math.pow(av * 34, 2));          // 主脈
            const lat = Math.pow(Math.abs(Math.cos((u - av * 0.40) * 25)), 42) * (1 - mid);
            return clamp(mid + lat * 0.8, 0, 1);
        }
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
                const y = leafY(u, vr) + vein(u, vr) * 0.022;
                const ve = vein(u, vr), ko = koromoAt(u, vr);
                let cr = mix(TOP[0], VEIN[0], ve * 0.85);
                let cg = mix(TOP[1], VEIN[1], ve * 0.85);
                let cb = mix(TOP[2], VEIN[2], ve * 0.85);
                cr = mix(cr, KP[0], ko * 0.55); cg = mix(cg, KP[1], ko * 0.55); cb = mix(cb, KP[2], ko * 0.55);
                rt.push(gl.vert(lf.at(ls, y + TH, u * L), j / NV, u, [cr, cg, cb]));
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
            face(gl, top[i][0], top[i + 1][0], bot[i + 1][0], bot[i][0]);
            face(gl, top[i][NV], bot[i][NV], bot[i + 1][NV], top[i + 1][NV]);
        }

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

    function sweepGrid(pts, N, NA, secFn, rollRng) {
        const W = NA + 1;
        const fr = frames(pts, N + 1);
        const roll = flatRoll(fr, N + 1, 0.90, 0.04, rollRng || new Rng(11));
        const BP = new Float64Array((N + 1) * W * 3);
        const BN = new Float64Array((N + 1) * W * 3);
        for (let i = 0; i <= N; i++) {
            const u = i / N;
            const px = pts[i * 3], py = pts[i * 3 + 1], pz = pts[i * 3 + 2];
            const ca = Math.cos(roll[i]), sa = Math.sin(roll[i]);
            for (let j = 0; j <= NA; j++) {
                const s = secFn(u, j % NA, NA);
                const ox = s[0] * ca - s[1] * sa, oy = s[0] * sa + s[1] * ca;
                const k = (i * W + j) * 3;
                BP[k] = px + fr.U[i * 3] * ox + fr.V[i * 3] * oy;
                BP[k + 1] = py + fr.U[i * 3 + 1] * ox + fr.V[i * 3 + 1] * oy;
                BP[k + 2] = pz + fr.U[i * 3 + 2] * ox + fr.V[i * 3 + 2] * oy;
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
                let nx = ty * sz - tz * sy, ny = tz * sx - tx * sz, nz2 = tx * sy - ty * sx;
                const l = Math.hypot(nx, ny, nz2) || 1;
                const k = (i * W + j) * 3;
                const rx = BP[k] - pts[i * 3], ry = BP[k + 1] - pts[i * 3 + 1], rz = BP[k + 2] - pts[i * 3 + 2];
                const sgn = (nx * rx + ny * ry + nz2 * rz) < 0 ? -1 : 1;
                BN[k] = nx / l * sgn; BN[k + 1] = ny / l * sgn; BN[k + 2] = nz2 / l * sgn;
            }
        }
        return { BP: BP, BN: BN, N: N, NA: NA, W: W, pts: pts };
    }

    function emitGrid(g, gr, colFn, capA, capB) {
        const { BP, BN, N, NA, W, pts } = gr;
        const rows = [];
        for (let i = 0; i <= N; i++) {
            const u = i / N, row = [];
            for (let j = 0; j <= NA; j++) {
                const k = (i * W + j) * 3;
                row.push(g.vert([BP[k], BP[k + 1], BP[k + 2]], j / NA, u,
                    colFn(u, j / NA, [BN[k], BN[k + 1], BN[k + 2]])));
            }
            rows.push(row);
        }
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < NA; j++) face(g, rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
        }
        function ringMean(i) {
            let x = 0, y = 0, z = 0;
            for (let j = 0; j < NA; j++) {
                const k = (i * W + j) * 3; x += BP[k]; y += BP[k + 1]; z += BP[k + 2];
            }
            return [x / NA, y / NA, z / NA];
        }
        if (capA !== false) {
            const c0 = g.vert(ringMean(0), 0.5, 0, colFn(0, 0.5, [0, -1, 0]));
            for (let j = 0; j < NA; j++) g.tri(c0, rows[0][j], rows[0][j + 1]);
        }
        if (capB !== false) {
            const c1 = g.vert(ringMean(N), 0.5, 1, colFn(1, 0.5, [0, 1, 0]));
            for (let j = 0; j < NA; j++) g.tri(c1, rows[N][j + 1], rows[N][j]);
        }
        return rows;
    }

    function koromoShell(gK, gr, rng, nz, opt) {
        const { BP, BN, N, NA, W } = gr;
        const PALE = lin3(KOROMO_PALE), BASE = lin3(KOROMO_BASE), DEEP = lin3(KOROMO_DEEP);
        const th0 = opt.thick, cover = opt.cover;
        const KT = new Float32Array((N + 1) * W);
        for (let i = 0; i <= N; i++) {
            const u = i / N;
            for (let j = 0; j <= NA; j++) {
                const cv = cover(u, (j % NA) / NA);
                if (cv <= 0) { KT[i * W + j] = 0; continue; }
                const k = (i * W + j) * 3;
                const l1 = nz.fbm3(BP[k] * 1.9, BP[k + 1] * 1.9, BP[k + 2] * 1.9, 3) - 0.5;
                const l2 = nz.fbm3(BP[k] * 5.2 + 7, BP[k + 1] * 5.2, BP[k + 2] * 5.2, 2) - 0.5;
                KT[i * W + j] = th0 * cv * (1 + l1 * 1.15 + l2 * 0.85) + 0.012;
            }
        }
        const useK = new Uint8Array((N + 1) * W);
        const LIM = 0.02;
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < NA; j++) {
                if (KT[i * W + j] < LIM || KT[(i + 1) * W + j] < LIM
                    || KT[(i + 1) * W + j + 1] < LIM || KT[i * W + j + 1] < LIM) continue;
                useK[i * W + j] = useK[(i + 1) * W + j] = 1;
                useK[(i + 1) * W + j + 1] = useK[i * W + j + 1] = 1;
            }
        }
        const rows = [];
        for (let i = 0; i <= N; i++) {
            const row = [];
            for (let j = 0; j <= NA; j++) {
                if (!useK[i * W + j]) { row.push(-1); continue; }
                const k = (i * W + j) * 3, t = KT[i * W + j];
                const ct = clamp(0.38 + (t / th0 - 0.85) * 0.78, 0, 1);
                let r, g2, b2;
                if (ct > 0.5) {
                    const w = (ct - 0.5) * 2;
                    r = mix(BASE[0], PALE[0], w); g2 = mix(BASE[1], PALE[1], w); b2 = mix(BASE[2], PALE[2], w);
                } else {
                    const w = ct * 2;
                    r = mix(DEEP[0], BASE[0], w); g2 = mix(DEEP[1], BASE[1], w); b2 = mix(DEEP[2], BASE[2], w);
                }
                row.push(gK.vert([BP[k] + BN[k] * t, BP[k + 1] + BN[k + 1] * t, BP[k + 2] + BN[k + 2] * t],
                    j / NA * 2.0, i / N * 3.0, [r, g2, b2]));
            }
            rows.push(row);
        }
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < NA; j++) {
                const a = rows[i][j], b = rows[i + 1][j], c = rows[i + 1][j + 1], d = rows[i][j + 1];
                if (a < 0 || b < 0 || c < 0 || d < 0) continue;
                face(gK, a, b, c, d);
            }
        }
        const NF = opt.flakes || 0;
        for (let f = 0; f < NF; f++) {
            const i = Math.round(mix(0.03, 0.97, rng.next()) * N);
            const j = rng.int(NA);
            const t = KT[i * W + j];
            if (t < th0 * 0.55) continue;
            const k = (i * W + j) * 3;
            const c = [BP[k] + BN[k] * t, BP[k + 1] + BN[k + 1] * t, BP[k + 2] + BN[k + 2] * t];
            if (BN[k + 1] < -0.30) continue;
            if (opt.floorY !== undefined && c[1] < opt.floorY + 0.15) continue;
            const lf = localFrame(c, [BN[k], BN[k + 1], BN[k + 2]], [0, 1, 0]);
            const size = rng.next();
            if (size < 0.22) {
                const r = rng.range(0.05, 0.15);
                blob(gK, lf, [r, r * rng.range(0.6, 1.2), r], false, r * 0.35, BASE, PALE);
            } else {
                crispyFlake(gK, lf, rng, rng.range(0.09, 0.22), rng.range(0.10, 0.34), BASE, PALE);
            }
        }
        return KT;
    }

    function lineSpine(o, dir, len, N, bendUp, bendSide) {
        const d = vnorm(dir);
        let side = vnorm(vcross([0, 1, 0], d));
        if (vlen(vcross([0, 1, 0], d)) < 1e-4) side = [1, 0, 0];
        const up = vnorm(vcross(d, side));
        const pts = new Float64Array((N + 1) * 3);
        for (let i = 0; i <= N; i++) {
            const t = i / N, s = Math.sin(Math.PI * t);
            const bu = s * (bendUp || 0), bs = s * (bendSide || 0);
            pts[i * 3] = o[0] + d[0] * len * t + up[0] * bu + side[0] * bs;
            pts[i * 3 + 1] = o[1] + d[1] * len * t + up[1] * bu + side[1] * bs;
            pts[i * 3 + 2] = o[2] + d[2] * len * t + up[2] * bu + side[2] * bs;
        }
        return pts;
    }

    function buildShishito(gV, gK, rng, nz, opt) {
        const N = 40, NA = 24;
        const L = opt.len === undefined ? 5.6 : opt.len;
        const R = opt.r === undefined ? 0.62 : opt.r;
        const pts = lineSpine(opt.at, opt.dir, L, N, opt.bendUp || 0.22, opt.bendSide || 0.32);
        const SKIN = lin3(SHISHI_SKIN), PALE = lin3(SHISHI_PALE), STEM = lin3(SHISHI_STEM);
        const ph = rng.range(0, 30);
        function prof(u) {
            const a = 0.42 + 0.58 * Math.sin(Math.PI * clamp(0.22 + 0.72 * u, 0, 1));
            return a * (1 - 0.30 * smoothstep(0.80, 1.0, u));
        }
        const gr = sweepGrid(pts, N, NA, (u, j, NAA) => {
            const th = j / NAA * TAU;
            const groove = 1 - 0.085 * Math.pow(Math.max(0, Math.cos(th * 3 + 0.6)), 3);
            const wob = 1 + 0.055 * (nz.n3(Math.cos(th) * 1.6 + ph, Math.sin(th) * 1.6, u * 6) - 0.5) * 2;
            const r = R * prof(u) * groove * wob;
            return [Math.cos(th) * r, Math.sin(th) * r * 0.92];
        }, new Rng(opt.seed || 3));
        emitGrid(gV, gr, (u, v, n) => {
            const up = clamp(n[1], 0, 1);
            const mott = nz.fbm2(u * 9 + 3, v * 5 + 7, 3, 0, 5);
            let t = clamp(0.35 + up * 0.45 + (mott - 0.5) * 0.6, 0, 1);
            t = mix(t, 0.85, smoothstep(0.12, 0.0, u));
            return [mix(SKIN[0], PALE[0], t), mix(SKIN[1], PALE[1], t), mix(SKIN[2], PALE[2], t)];
        });
        koromoShell(gK, gr, rng, nz, {
            thick: 0.105,
            flakes: 26, floorY: opt.floorY,
            cover: (u, v) => {
                const n = nz.fbm2(u * 6 + 11, v * 4 + 3, 3, 0, 4);
                const hem = smoothstep(0.10, 0.20, u);
                return clamp(hem * (smoothstep(0.35, 0.72, n) * 0.85 + 0.30), 0, 1);
            }
        });
        {
            const g = gV;
            const base = [pts[0], pts[1], pts[2]];
            const d0 = vnorm([pts[0] - pts[3], pts[1] - pts[4], pts[2] - pts[5]]);
            const lf = localFrame(base, d0, [0, 1, 0]);
            const NC = 30;
            const ring = [], top = [];
            for (let j = 0; j <= NC; j++) {
                const th = (j % NC) / NC * TAU;
                const star = 1 + 0.30 * Math.cos(th * 5);
                ring.push(g.vert(lf.at(Math.cos(th) * R * 0.62 * star, Math.sin(th) * R * 0.62 * star, 0.02),
                    j / NC, 0, STEM));
                top.push(g.vert(lf.at(Math.cos(th) * R * 0.34, Math.sin(th) * R * 0.34, 0.30),
                    j / NC, 1, [STEM[0] * 1.1, STEM[1] * 1.1, STEM[2] * 1.05]));
            }
            for (let j = 0; j < NC; j++) face(g, ring[j], top[j], top[j + 1], ring[j + 1]);
            const st = [], se = [];
            for (let j = 0; j <= 10; j++) {
                const th = (j % 10) / 10 * TAU;
                st.push(g.vert(lf.at(Math.cos(th) * 0.085, Math.sin(th) * 0.085, 0.30), j / 10, 0, STEM));
                se.push(g.vert(lf.at(Math.cos(th) * 0.065, Math.sin(th) * 0.065, 0.92), j / 10, 1, STEM));
            }
            for (let j = 0; j < 10; j++) face(g, st[j], se[j], se[j + 1], st[j + 1]);
            const cap = g.vert(lf.at(0, 0, 0.94), 0.5, 1, STEM);
            for (let j = 0; j < 10; j++) g.tri(cap, se[j + 1], se[j]);
        }
        return { tip: [pts[N * 3], pts[N * 3 + 1], pts[N * 3 + 2]] };
    }

    function buildNasu(gV, gK, rng, nz, opt) {
        const SLICES = opt.slices === undefined ? 5 : opt.slices;
        const N = 26, NA = 20;
        const L = opt.len === undefined ? 4.6 : opt.len;
        const RW = opt.wid === undefined ? 1.55 : opt.wid;   // 茄子の半径
        const SKIN = lin3(NASU_SKIN), GLOSS = lin3(NASU_GLOSS);
        const FLESH = lin3(NASU_FLESH), EDGE = lin3(NASU_EDGE);
        const spread = opt.spread === undefined ? 0.30 : opt.spread;
        const dir = vnorm(opt.dir);
        const side = vnorm(vcross([0, 1, 0], dir));
        const half = (SLICES - 1) / 2;
        for (let s = 0; s < SLICES; s++) {
            const k = (s - half);
            const ang = k * spread;
            const d2 = vnorm([dir[0] * Math.cos(ang) + side[0] * Math.sin(ang),
            dir[1] * Math.cos(ang) + side[1] * Math.sin(ang),
            dir[2] * Math.cos(ang) + side[2] * Math.sin(ang)]);
            const pts = lineSpine(opt.at, d2, L, N, 0.10, 0);
            for (let i = 0; i <= N; i++) {
                const t = i / N, w = 1 - smoothstep(0.0, 0.42, t);
                const bx = opt.at[0] + dir[0] * L * t, by = opt.at[1] + dir[1] * L * t,
                    bz = opt.at[2] + dir[2] * L * t;
                pts[i * 3] = mix(pts[i * 3], bx, w);
                pts[i * 3 + 1] = mix(pts[i * 3 + 1], by, w);
                pts[i * 3 + 2] = mix(pts[i * 3 + 2], bz, w);
            }
            const hw = RW * 0.38;                           // 短冊の半幅
            const hh = RW * 0.28;                           // 同じく半分の厚み
            const gr = sweepGrid(pts, N, NA, (u, j, NAA) => {
                const th = j / NAA * TAU;
                const taper = 1 - 0.22 * smoothstep(0.55, 1.0, u);
                const ca = Math.abs(Math.cos(th)), sa = Math.abs(Math.sin(th));
                const p = 3.4;                                // 角の丸い長方形
                const rr = 1 / Math.pow(Math.pow(ca, p) + Math.pow(sa, p), 1 / p);
                return [Math.cos(th) * rr * hw * taper, Math.sin(th) * rr * hh * taper];
            }, new Rng((opt.seed || 5) + s * 13));
            emitGrid(gV, gr, (u, v, n) => {
                const up = n[1];
                const skin = smoothstep(0.30, 0.80, up);
                const mott = nz.fbm2(u * 7 + s * 3, v * 5 + 2, 3, 0, 5);
                const gl = smoothstep(0.55, 0.95, up) * (0.35 + 0.5 * mott);
                let r = mix(FLESH[0], SKIN[0], skin), g2 = mix(FLESH[1], SKIN[1], skin),
                    b2 = mix(FLESH[2], SKIN[2], skin);
                r = mix(r, GLOSS[0], gl * 0.55); g2 = mix(g2, GLOSS[1], gl * 0.55); b2 = mix(b2, GLOSS[2], gl * 0.55);
                const rim = (1 - Math.abs(skin - 0.5) * 2) * 0.55;
                r = mix(r, EDGE[0], rim); g2 = mix(g2, EDGE[1], rim); b2 = mix(b2, EDGE[2], rim);
                return [r, g2, b2];
            });
            koromoShell(gK, gr, rng, nz, {
                thick: 0.115,
                flakes: 16, floorY: opt.floorY,
                cover: (u, v) => {
                    const n = nz.fbm2(u * 5 + s * 7, v * 4 + 5, 3, 0, 4);
                    const hem = smoothstep(0.16, 0.30, u);
                    return clamp(hem * (smoothstep(0.30, 0.70, n) * 0.9 + 0.28), 0, 1);
                }
            });
        }
        {
            const g = gV;
            const lf = localFrame(opt.at, vmul(dir, -1), [0, 1, 0]);
            const NC = 22, ring = [], top = [];
            const CAL = lin3([0.290, 0.392, 0.180]);
            for (let j = 0; j <= NC; j++) {
                const th = (j % NC) / NC * TAU;
                const star = 1 + 0.18 * Math.cos(th * 5);
                ring.push(g.vert(lf.at(Math.cos(th) * RW * 0.62 * star, Math.sin(th) * RW * 0.30 * star, -0.26),
                    j / NC, 0, CAL));
                top.push(g.vert(lf.at(Math.cos(th) * RW * 0.26, Math.sin(th) * RW * 0.16, 0.40),
                    j / NC, 1, [CAL[0] * 1.15, CAL[1] * 1.15, CAL[2] * 1.1]));
            }
            for (let j = 0; j < NC; j++) face(g, ring[j], top[j], top[j + 1], ring[j + 1]);
            const cap = g.vert(lf.at(0, 0, 0.44), 0.5, 1, CAL);
            for (let j = 0; j < NC; j++) g.tri(cap, top[j + 1], top[j]);
        }
    }

    function buildKabocha(gV, gK, rng, nz, opt) {
        const N = 16, NA = 64;
        const TH = opt.thick === undefined ? 0.95 : opt.thick;   // 切り身の厚み
        const RO = opt.rOut === undefined ? 4.10 : opt.rOut;     // 皮の側の半径
        const RI = opt.rIn === undefined ? 2.05 : opt.rIn;       // わたの側
        const SPAN = opt.span === undefined ? 0.62 : opt.span;   // 扇の開き（片側 rad）
        const SKIN = lin3(KABO_SKIN), MID = lin3(KABO_MID), FLESH = lin3(KABO_FLESH);

        const outline = [];
        {
            const raw = [];
            const NS = 40;
            for (let i = 0; i <= NS; i++) {           // 外周（皮）
                const a = -SPAN + 2 * SPAN * i / NS;
                raw.push([Math.sin(a) * RO, Math.cos(a) * RO, 0]);   // 3要素目 = 切り口らしさ
            }
            for (let i = 0; i <= 10; i++) {           // 端（切り口）
                const t = i / 10;
                raw.push([mix(Math.sin(SPAN) * RO, Math.sin(SPAN * 0.92) * RI, t),
                mix(Math.cos(SPAN) * RO, Math.cos(SPAN * 0.92) * RI, t), 1]);
            }
            for (let i = 0; i <= 16; i++) {           // わたの側（へこむ）
                const a = SPAN * 0.92 - 2 * SPAN * 0.92 * i / 16;
                const r = RI * (1 - 0.14 * Math.cos(a / SPAN * Math.PI * 0.5));
                raw.push([Math.sin(a) * r, Math.cos(a) * r, 1]);
            }
            for (let i = 1; i < 10; i++) {            // 反対の端
                const t = i / 10;
                raw.push([mix(Math.sin(-SPAN * 0.92) * RI, Math.sin(-SPAN) * RO, t),
                mix(Math.cos(-SPAN * 0.92) * RI, Math.cos(-SPAN) * RO, t), 1]);
            }
            const arc = [0];
            for (let i = 1; i < raw.length; i++) {
                arc.push(arc[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]));
            }
            const tot = arc[arc.length - 1];
            for (let j = 0; j < NA; j++) {
                const s = tot * j / NA;
                let i = 1; while (i < arc.length - 1 && arc[i] < s) i++;
                const t = (s - arc[i - 1]) / Math.max(1e-6, arc[i] - arc[i - 1]);
                outline.push([mix(raw[i - 1][0], raw[i][0], t), mix(raw[i - 1][1], raw[i][1], t),
                mix(raw[i - 1][2], raw[i][2], t)]);
            }
            outline.reverse();
            let mx = 0, my = 0;
            for (const o of outline) { mx += o[0]; my += o[1]; }
            mx /= outline.length; my /= outline.length;
            for (const o of outline) { o[0] -= mx; o[1] -= my; }
        }
        const cutSm = new Float32Array(NA);
        for (let j = 0; j < NA; j++) {
            let s = 0;
            for (let k = -3; k <= 3; k++) s += outline[(j + k + NA) % NA][2];
            cutSm[j] = s / 7;
        }
        const c = opt.at;
        const d = vnorm(opt.dir);
        const pts = lineSpine([c[0] - d[0] * TH * 0.5, c[1] - d[1] * TH * 0.5, c[2] - d[2] * TH * 0.5],
            d, TH, N, 0, 0);
        const gr = sweepGrid(pts, N, NA, (u, j, NAA) => {
            const o = outline[j % outline.length];
            const e = Math.min(smoothstep(0, 0.10, u), smoothstep(1, 0.90, u));
            const k = 0.86 + 0.14 * e;
            return [o[0] * k, o[1] * k];
        }, new Rng(opt.seed || 7));
        emitGrid(gV, gr, (u, v, n) => {
            const t = cutSm[Math.round(v * NA) % NA];   // 1 = 切り口, 0 = 皮
            const mott = nz.fbm2(u * 6 + 3, v * 12 + 5, 3, 0, 12);
            const r0 = mix(SKIN[0], MID[0], smoothstep(0.0, 0.35, t));
            const g0 = mix(SKIN[1], MID[1], smoothstep(0.0, 0.35, t));
            const b0 = mix(SKIN[2], MID[2], smoothstep(0.0, 0.35, t));
            const w = smoothstep(0.30, 0.75, t);
            let r = mix(r0, FLESH[0], w), g2 = mix(g0, FLESH[1], w), b2 = mix(b0, FLESH[2], w);
            const k = 0.88 + 0.24 * mott;
            return [r * k, g2 * k, b2 * k];
        });
        koromoShell(gK, gr, rng, nz, {
            thick: 0.135,
            flakes: 22, floorY: opt.floorY,
            cover: (u, v) => {
                const n = nz.fbm2(u * 4 + 9, v * 6 + 1, 3, 0, 6);
                return clamp(smoothstep(0.32, 0.72, n) * 0.85 + 0.35, 0, 1);
            }
        });
    }

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
                const cw = Math.cos(clamp((fx - 0.5) / (0.5 * kw), -1, 1) * Math.PI * 0.5);
                const cf = Math.cos(clamp((fy - 0.5) / (0.5 * kf), -1, 1) * Math.PI * 0.5);
                const warpTop = ((i + j) & 1) === 0;
                const hw = cw * kw, hf = cf * kf;
                const h = warpTop ? 0.35 + 0.60 * hw + 0.10 * hf : 0.35 + 0.60 * hf + 0.10 * hw;
                const k = y * S + x;
                H[k] = clamp(h, 0, 1);
                W[k] = warpTop ? kw : kf;
            }
        }
        const wrinkle = new Float32Array(s2);
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                wrinkle[y * S + x] = nz.fbm2(x / S * 4, y / S * 4, 3, 4, 4) - 0.5;
            }
        }
        const BASE = [0.905, 0.868, 0.782];        // 参考写真の実測値そのもの
        const albedo = TexLab.make("clothA", S, scene, (d) => {
            for (let k = 0; k < s2; k++) {
                const t = 0.86 + 0.20 * W[k] + wrinkle[k] * 0.10;
                const sh = 0.72 + 0.34 * H[k];      // 織りの谷は糸の影で沈む
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

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.040, 0.038, 0.035, 1);

    // ---- Havok ----------------------------------------------------------
    // 第1引数 false = _useDeltaForWorldStep。可変ステップだと接触が毎フレーム
    // 解けたり食い込んだりして震えるので、固定ステップにする
    let hk = null;
    try {
        if (typeof HavokPhysics === "function" && BABYLON.HavokPlugin) {
            const havok = await HavokPhysics();
            hk = new BABYLON.HavokPlugin(false, havok);
            scene.enablePhysics(new BABYLON.Vector3(0, -PHYS.gravity, 0), hk);
            if (hk.setTimeStep) hk.setTimeStep(PHYS.step);
        }
    } catch (e) {
        console.warn("[Tenmori] Havok の初期化に失敗。解析的な配置に落とします", e);
        hk = null;
    }
    const hasPhysics = () => !!(hk && scene.getPhysicsEngine());

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.65;
    env.lodGenerationOffset = 0.20;

    const camera = new BABYLON.ArcRotateCamera("cam", -2.02, 1.02, 36, new V3(0, 2.2, 0), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 3.5;
    camera.fov = 0.44;
    camera.minZ = 10.0;
    camera.maxZ = 300;
    camera.lowerRadiusLimit = 22;
    camera.upperRadiusLimit = 190;
    camera.upperBetaLimit = 1.50;
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.36, -0.96, 0.42).normalize(), scene);
    key.position = new V3(16, 34, -18);
    key.intensity = 3.0;
    key.diffuse = new BABYLON.Color3(1.0, 0.978, 0.945);
    key.autoUpdateExtends = false;
    key.orthoLeft = -26; key.orthoRight = 26;
    key.orthoBottom = -26; key.orthoTop = 26;
    key.shadowMinZ = 1; key.shadowMaxZ = 90;

    const kick = new BABYLON.DirectionalLight("kick", new V3(0.58, -0.30, -1.0).normalize(), scene);
    kick.intensity = 0.80;
    kick.diffuse = new BABYLON.Color3(0.055, 0.052, 0.048);
    kick.specular = new BABYLON.Color3(1.0, 0.97, 0.92);

    const fill = new BABYLON.HemisphericLight("fill", new V3(-0.25, 1, -0.30), scene);
    fill.intensity = 0.36;
    fill.diffuse = new BABYLON.Color3(0.97, 0.975, 1.0);
    fill.groundColor = new BABYLON.Color3(0.34, 0.31, 0.27);
    fill.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0030;
    sg.normalBias = 0.010;
    sg.setDarkness(0.18);

    const clothTex = clothTextures(scene, 4517);
    const cloth = BABYLON.MeshBuilder.CreateGround("cloth", { width: 240, height: 240 }, scene);
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
    for (const t of [clothTex.albedo, clothTex.orm, clothTex.normal]) { t.uScale = 86; t.vScale = 86; }
    cloth.material = clothMat;
    cloth.receiveShadows = true;

    const VF = [Math.cos(camera.alpha + Math.PI), Math.sin(camera.alpha + Math.PI)];
    const VR = [VF[1], -VF[0]];
    const PLATE_YAW = -Math.atan2(VR[1], VR[0]);
    function spot(f, r) { return [VF[0] * f + VR[0] * r, VF[1] * f + VR[1] * r]; }
    const TOP_Y = PLATE.wellY + 0.10;                 // 懐紙の上面
    function onPlate(f, r, dy) {
        const p = spot(f, r);
        return [p[0], TOP_Y + (dy || 0), p[1]];
    }
    function dirOf(df, dr, dy) {
        return vnorm([VF[0] * df + VR[0] * dr, dy, VF[1] * df + VR[1] * dr]);
    }

    const KOBACHI_R = 3.75;          // 口径 7.5cm の猪口
    const KOBACHI_GAP = 1.60;        // 皿との隙間 cm
    function kobachiSpot(df, dr) {
        const l = Math.hypot(df, dr) || 1;
        const uf = df / l, ur = dr / l;
        const rim = plateR(Math.atan2(uf, ur)) * 1.020;   // 口縁がいちばん外
        return spot(uf * (rim + KOBACHI_R * 1.03 + KOBACHI_GAP),
            ur * (rim + KOBACHI_R * 1.03 + KOBACHI_GAP));
    }

    // ---- 物理まわりのヘルパ ------------------------------------------------

    // ローカル +Z を fwd に向ける姿勢。up は面の向きを決める補助、roll は軸まわりの回転
    function quatFrom(fwd, upHint, roll) {
        const f = vnorm(fwd);
        let u = vnorm(upHint || [0, 1, 0]);
        if (Math.abs(vdot(f, u)) > 0.999) u = (Math.abs(f[1]) > 0.9) ? [0, 0, 1] : [0, 1, 0];
        let s = vnorm(vcross(u, f));       // ローカル +X の行き先
        let v = vnorm(vcross(f, s));       // ローカル +Y の行き先
        if (roll) {
            const c = Math.cos(roll), sn = Math.sin(roll);
            const s2 = vadd(vmul(s, c), vmul(v, sn));
            const v2 = vadd(vmul(v, c), vmul(s, -sn));
            s = s2; v = v2;
        }
        const m = BABYLON.Matrix.FromValues(
            s[0], s[1], s[2], 0,
            v[0], v[1], v[2], 0,
            f[0], f[1], f[2], 0,
            0, 0, 0, 1);
        return BABYLON.Quaternion.FromRotationMatrix(m);
    }

    // 表示メッシュをそのまま凸包に渡すと、ほぼ同一平面の面が大量にできて
    // 接触マニフォールドが毎ステップ飛び移る。間引いた点群から作る
    function hullPointsFromGeo(g, maxPts) {
        const n = g.pos.length / 3;
        const step = Math.max(1, Math.ceil(n / (maxPts || 280)));
        const pts = [];
        for (let i = 0; i < n; i += step) pts.push([g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]]);
        return pts;
    }

    // 凸包は元の凹みをまたいで張られるので、重心方向へ少し縮めて内側に置く
    function hullShape(name, pts, shrink) {
        const n = pts.length;
        let cx = 0, cy = 0, cz = 0;
        for (const p of pts) { cx += p[0]; cy += p[1]; cz += p[2]; }
        cx /= n; cy /= n; cz /= n;
        const k = shrink === undefined ? PHYS.shrink : shrink;
        const pos = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            pos[i * 3] = cx + (pts[i][0] - cx) * k;
            pos[i * 3 + 1] = cy + (pts[i][1] - cy) * k;
            pos[i * 3 + 2] = cz + (pts[i][2] - cz) * k;
        }
        const idx = [];
        for (let i = 1; i < n - 1; i++) idx.push(0, i, i + 1);   // 凸包を取るだけなので位相は任意
        const m = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = idx; vd.normals = new Float32Array(n * 3);
        vd.applyToMesh(m, false);
        named(m, name);
        m.isVisible = false;
        const shape = new BABYLON.PhysicsShapeConvexHull(m, scene);
        shape.material = { friction: PHYS.friction, restitution: PHYS.restitution };
        m.dispose();
        return shape;
    }

    function staticBody(mesh, friction) {
        if (!hasPhysics()) return null;
        const shape = new BABYLON.PhysicsShapeMesh(mesh, scene);
        shape.material = { friction: friction === undefined ? 0.80 : friction, restitution: 0.02 };
        const body = new BABYLON.PhysicsBody(mesh, BABYLON.PhysicsMotionType.STATIC, false, scene);
        body.shape = shape;
        return body;
    }

    const plateMatCache = {};
    let koromoMat = null, koromoTex = null;
    let ebiBodyMat = null, ebiBodyTex = null, ebiTailMat = null, ebiTailTex = null;
    let shisoMat = null, vegMat = null, paperMat = null, paperTex = null, tsuyuMat = null;

    function getPlateMat(k) {
        if (!plateMatCache[k]) {
            plateMatCache[k] = plateMaterial(scene, SARA[k], "plateMat_" + k, 9001 + k.length * 71);
        }
        return plateMatCache[k];
    }
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
    function getEbiTailMat() {
        if (ebiTailMat) return ebiTailMat;
        ebiTailTex = ebiTailTexture(scene, CFG.seed ^ 0x11AC);
        const m = new BABYLON.PBRMaterial("ebiTailMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = ebiTailTex;
        m.metallic = 0; m.roughness = 0.24;
        m.backFaceCulling = false;
        m.twoSidedLighting = true;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.35;
        m.clearCoat.roughness = 0.16;
        m.clearCoat.indexOfRefraction = 1.36;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.22;
        m.subSurface.tintColor = new BABYLON.Color3(s2l(EBI_COL.tailPale[0]), s2l(EBI_COL.tailPale[1]), s2l(EBI_COL.tailPale[2]));
        m.subSurface.minimumThickness = 0.01;
        m.subSurface.maximumThickness = EBI.fanTh * 1.4;
        ebiTailMat = m;
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
    function getVegMat() {
        if (vegMat) return vegMat;
        const m = new BABYLON.PBRMaterial("vegMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0; m.roughness = 0.46;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.72;
        m.clearCoat.roughness = 0.17;
        m.clearCoat.indexOfRefraction = 1.42;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.24;
        m.subSurface.tintColor = new BABYLON.Color3(s2l(0.72), s2l(0.78), s2l(0.44));
        m.subSurface.minimumThickness = 0.05;
        m.subSurface.maximumThickness = 0.55;
        vegMat = m;
        return m;
    }
    function getPaperMat() {
        if (paperMat) return paperMat;
        paperTex = paperTextures(scene, 0x9A17);
        const m = new BABYLON.PBRMaterial("paperMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0; m.roughness = 1.0;
        m.albedoTexture = paperTex.albedo;
        m.metallicTexture = paperTex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.bumpTexture = paperTex.normal;
        m.bumpTexture.level = 0.55;
        for (const t of [paperTex.albedo, paperTex.orm, paperTex.normal]) { t.uScale = 3; t.vScale = 2.2; }
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.42;
        m.subSurface.tintColor = new BABYLON.Color3(1, 0.985, 0.95);
        m.subSurface.minimumThickness = 0.01;
        m.subSurface.maximumThickness = 0.05;
        paperMat = m;
        return m;
    }
    function getTsuyuMat() {
        if (tsuyuMat) return tsuyuMat;
        const m = new BABYLON.PBRMaterial("tsuyuMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0; m.roughness = 0.14;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.95;
        m.clearCoat.roughness = 0.045;
        m.clearCoat.indexOfRefraction = 1.34;
        tsuyuMat = m;
        return m;
    }

    let state = null, onRebuilt = null, ssao = null;

    // 盛り付けの進行状態。1個ずつ落として、静止したら固定する
    const plating = {
        active: false, done: true, mode: "—",
        t: 0, next: 0, queue: [], live: [], calm: 0, sinceLast: 0, ms: 0, t0: 0
    };

    function meshOfGeo(g, name, matFn, parent) {
        if (!g.idx.length) return null;
        const geo = g.finish(null);
        const m = toMesh(name, geo, scene);
        m.tris = geo.indices.length / 3;
        m.material = matFn();
        m.receiveShadows = true;
        m.parent = parent;
        sg.addShadowCaster(m, true);
        return m;
    }

    // 盛り付けの設計図。f = 奥方向, r = 右方向（カメラ基準・cm）
    // fwd = 個体のローカル +Z を向ける方向（df, dr, dy）、roll = 軸まわりの回転
    // ここで決めるのは「どこへ、どの向きで放すか」だけ。高さと最終的な傾きは物理が解く
    function pieceSpecs() {
        const L = [];
        if (CFG.shiso) {
            L.push({ kind: "shiso", f: 2.05, r: 0.10, fwd: [-0.62, -0.74, 0.26], roll: 0 });
        }
        if (CFG.kabocha) {
            L.push({ kind: "kabocha", f: 1.35, r: -2.35, fwd: [-0.26, -0.06, 0.96], roll: 2.60 });
        }
        if (CFG.nasu) {
            L.push({ kind: "nasu", f: 2.05, r: 1.05, fwd: [-0.58, 0.78, 0.24], roll: 0 });
        }
        const nShi = clamp(Math.round(CFG.shishito), 0, 3);
        const SHI = [
            { f: -2.60, r: -2.30, fwd: [0.74, 0.60, 0.30], len: 3.8, seed: 3 },
            { f: -1.45, r: 2.45, fwd: [0.56, -0.78, 0.30], len: 3.6, seed: 9 },
            { f: -3.15, r: 0.35, fwd: [0.88, 0.36, 0.30], len: 3.3, seed: 17 }
        ];
        for (let i = 0; i < nShi; i++) L.push(Object.assign({ kind: "shishito", roll: 0 }, SHI[i]));
        const nEbi = clamp(Math.round(CFG.ebi), 0, 3);
        const EB = [
            { f: 3.05, r: 0.60, fwd: [-0.90, -0.24, -0.36], s: 1.00, seed: 7919 },
            { f: 2.90, r: 2.00, fwd: [-0.90, -0.10, -0.42], s: 0.97, seed: 15838 },
            { f: 3.30, r: -0.85, fwd: [-0.92, -0.20, -0.32], s: 0.92, seed: 23757 }
        ];
        for (let i = 0; i < nEbi; i++) L.push(Object.assign({ kind: "ebi", roll: 0 }, EB[i]));
        return L;
    }

    // 1個ぶんの造形。すべてローカル座標（原点 = つけ根、+Z = 伸びる向き、+Y = 上）で作り、
    // 位置と姿勢は TransformNode 側で与える。こうしないと剛体として動かせない
    function buildPiece(spec, rng, nz, seed) {
        const gK = new Geo(), gB = new Geo(), gT = new Geo(), gL = new Geo(), gV = new Geo();
        let hullPts = null;
        if (spec.kind === "ebi") {
            const s = spec.s === undefined ? 1 : spec.s;
            buildEbiten(gK, gB, gT, rng, nz, {
                tail: [0, 0, 0], head: [0, 0, EBI.len * s], scale: s,
                tailDir: vnorm([0, 0.85, -1]), tailBend: 0.72,
                bend: 0.22, flakes: 850, seed: (seed ^ spec.seed) >>> 0
            });
            hullPts = ebiHullPoints(s, 0.22);      // 尾の扇は当たり判定に入れない
        } else if (spec.kind === "shiso") {
            buildShisoTen(gL, gK, rng, nz, {
                base: [0, 0, 0], fwd: [0, 0, 1], up: [0, 1, 0],
                len: 4.8, wid: 1.85, flakes: 30
            });
            hullPts = hullPointsFromGeo(gL, 220);
        } else if (spec.kind === "shishito") {
            buildShishito(gV, gK, rng, nz, {
                at: [0, 0, 0], dir: [0, 0, 1], len: spec.len, r: 0.60, seed: spec.seed
            });
            hullPts = hullPointsFromGeo(gV, 220);
        } else if (spec.kind === "nasu") {
            buildNasu(gV, gK, rng, nz, {
                at: [0, 0, 0], dir: [0, 0, 1], len: 3.8, wid: 1.45,
                slices: 5, spread: 0.23, seed: 23
            });
            hullPts = hullPointsFromGeo(gV, 300);
        } else if (spec.kind === "kabocha") {
            buildKabocha(gV, gK, rng, nz, {
                at: [0, 0, 0], dir: [0, 0, 1], rOut: 3.40, rIn: 1.35,
                span: 0.78, thick: 0.82, seed: 31
            });
            hullPts = hullPointsFromGeo(gV, 300);
        }

        const root = new BABYLON.TransformNode("piece_" + spec.kind + "_" + (__uid++), scene);
        root.rotationQuaternion = quatFrom(dirOf(spec.fwd[0], spec.fwd[1], spec.fwd[2]),
            spec.up || [0, 1, 0], spec.roll || 0);
        const p = spot(spec.f, spec.r);
        root.position.set(p[0], 0, p[1]);

        const meshes = [];
        const add = (g, nm, matFn) => {
            const m = meshOfGeo(g, nm, matFn, root);
            if (m) meshes.push(m);
        };
        add(gK, "koromo", getKoromoMat);
        add(gB, "ebiBody", getEbiBodyMat);
        add(gT, "ebiTail", getEbiTailMat);
        add(gL, "shiso", getShisoMat);
        add(gV, "veg", getVegMat);
        let tris = 0;
        for (const m of meshes) tris += m.tris;
        return { kind: spec.kind, root: root, meshes: meshes, hullPts: hullPts, tris: tris, body: null, shape: null };
    }

    function buildFood(seed) {
        const t0 = performance.now();
        const rng = new Rng(seed ^ 0x7E4A);
        const nz = new Noise(seed ^ 0x2F71);
        const pieces = [];
        for (const spec of pieceSpecs()) pieces.push(buildPiece(spec, rng, nz, seed));
        return { pieces: pieces, ms: performance.now() - t0 };
    }

    // ---- 落として盛る ------------------------------------------------------

    // メッシュの境界箱は回転すると実際よりかなり大きく出るので、
    // 当たり判定に使う代理点（数百点）をワールドに移してから測る
    const _bv = new BABYLON.Vector3();
    function pieceBounds(p) {
        p.root.computeWorldMatrix(true);
        let mn = null, mx = null;
        if (p.hullPts && p.hullPts.length) {
            const M = p.root.getWorldMatrix();
            for (const q of p.hullPts) {
                BABYLON.Vector3.TransformCoordinatesFromFloatsToRef(q[0], q[1], q[2], M, _bv);
                if (!mn) { mn = _bv.clone(); mx = _bv.clone(); }
                else { mn.minimizeInPlace(_bv); mx.maximizeInPlace(_bv); }
            }
            return { min: mn, max: mx };
        }
        for (const m of p.meshes) {
            m.computeWorldMatrix(true);
            const bb = m.getBoundingInfo().boundingBox;
            if (!mn) { mn = bb.minimumWorld.clone(); mx = bb.maximumWorld.clone(); }
            else { mn.minimizeInPlace(bb.minimumWorld); mx.maximizeInPlace(bb.maximumWorld); }
        }
        if (!mn) { mn = p.root.position.clone(); mx = p.root.position.clone(); }
        return { min: mn, max: mx };
    }

    // 投入高さは山全体の頂点ではなく、水平方向に重なっている物だけを見る。
    // 全体の頂点を基準にすると、端に添える物まで山の高さぶん持ち上がってしまう
    function placePiece(p, gap, cap) {
        p.root.position.y = 0;
        p.root.computeWorldMatrix(true);
        const b = pieceBounds(p);
        const floor = plateSurfaceY(p.root.position.x, p.root.position.z) + (CFG.kaishi ? 0.10 : 0.02);
        let base = floor;
        for (const q of plating.live) {
            const qb = pieceBounds(q);
            if (qb.max.x < b.min.x || qb.min.x > b.max.x) continue;
            if (qb.max.z < b.min.z || qb.min.z > b.max.z) continue;
            base = Math.max(base, qb.max.y);
        }
        // 手置きでは重なりの積み上がりが際限なく伸びるので頭打ちにする
        if (cap !== undefined) base = Math.min(base, floor + cap);
        p.root.position.y = base + gap - b.min.y;
        p.root.computeWorldMatrix(true);
    }

    function spawnPiece(p) {
        for (const m of p.meshes) m.setEnabled(true);
        placePiece(p, PHYS.gap);
        if (!hasPhysics() || !p.hullPts) { plating.live.push(p); return; }
        p.shape = hullShape("col_" + p.kind, p.hullPts);
        // 質量は形状から密度1で自動計算させる。食材の密度はほぼ水なのでこれで合う
        p.body = new BABYLON.PhysicsBody(p.root, BABYLON.PhysicsMotionType.DYNAMIC, false, scene);
        p.body.shape = p.shape;
        p.body.setLinearDamping(0.15);
        p.body.setAngularDamping(0.90);
        p.body.disablePreStep = true;     // 毎フレームの書き戻しによる往復を止める
        plating.live.push(p);
    }

    function freezePlating() {
        for (const p of plating.live) {
            if (p.body) { try { p.body.dispose(); } catch (e) { } p.body = null; }
            if (p.shape) { try { p.shape.dispose(); } catch (e) { } p.shape = null; }
            const q = p.root.rotationQuaternion;
            if (q) {                       // Inspector v2 の例外を避けるため Euler に焼く
                p.root.rotationQuaternion = null;
                p.root.rotation = q.toEulerAngles();
            }
        }
        plating.active = false;
        plating.done = true;
        plating.ms = performance.now() - plating.t0;
        if (onRebuilt) onRebuilt(state);
    }

    function startPlating(pieces) {
        plating.queue = pieces.slice();
        plating.live = [];
        plating.t = 0; plating.next = 0; plating.calm = 0; plating.sinceLast = 0;
        plating.t0 = performance.now();
        for (const p of pieces) for (const m of p.meshes) m.setEnabled(false);
        if (!hasPhysics() || !CFG.physics) {
            // フォールバック: 直下の物の上へ順に置くだけ。空の皿を出すよりまし
            plating.mode = hasPhysics() ? "手置き" : "手置き（Havok なし）";
            while (plating.queue.length) {
                const p = plating.queue.shift();
                for (const m of p.meshes) m.setEnabled(true);
                placePiece(p, 0.02, 1.20);
                plating.live.push(p);
            }
            plating.active = false; plating.done = true;
            plating.ms = performance.now() - plating.t0;
            return;
        }
        plating.mode = "Havok";
        plating.active = true; plating.done = false;
    }

    scene.onBeforeRenderObservable.add(() => {
        if (!plating.active) return;
        // Havok は固定ステップで回しているので、経過はフレーム数で数える
        const dt = PHYS.step;
        plating.t += dt;
        while (plating.queue.length && plating.t >= plating.next) {
            spawnPiece(plating.queue.shift());
            plating.next += PHYS.interval;      // 同時に生成すると弾け飛ぶ
            plating.sinceLast = 0;
        }
        if (plating.queue.length) return;
        plating.sinceLast += dt;
        let calm = true;
        for (const p of plating.live) {
            if (!p.body) continue;
            const v = p.body.getLinearVelocity(), w = p.body.getAngularVelocity();
            if (v.length() > PHYS.settleV || w.length() > PHYS.settleW) { calm = false; break; }
        }
        plating.calm = calm ? plating.calm + dt : 0;
        // 微振動で静止判定が通らないことがあるのでタイムアウトも置く
        if (plating.calm >= PHYS.settleHold || plating.sinceLast >= PHYS.timeout) freezePlating();
    });

    function disposeFood(st) {
        if (!st) return;
        plating.active = false; plating.done = true;
        plating.queue = []; plating.live = [];
        if (st.pieces) {
            for (const p of st.pieces) {
                if (p.body) { try { p.body.dispose(); } catch (e) { } p.body = null; }
                if (p.shape) { try { p.shape.dispose(); } catch (e) { } p.shape = null; }
                for (const m of p.meshes) m.dispose();
                p.root.dispose();
            }
            st.pieces = null;
        }
        if (st.kaishiBody) { try { st.kaishiBody.dispose(); } catch (e) { } st.kaishiBody = null; }
        if (st.kaishi) { st.kaishi.dispose(); st.kaishi = null; }
    }

    function ensureTable(st) {
        if (!hasPhysics() || st.tableCol) return;
        // 薄いコライダーはすり抜けられるので、テーブルは厚い箱で作る
        const box = BABYLON.MeshBuilder.CreateBox("tableCol", { width: 200, height: 4, depth: 200 }, scene);
        named(box, "tableCol");
        box.position.y = -2;
        box.isVisible = false;
        st.tableCol = box;
        st.tableBody = new BABYLON.PhysicsAggregate(box, BABYLON.PhysicsShapeType.BOX,
            { mass: 0, friction: 0.80, restitution: 0.01 }, scene);
    }

    function build(full) {
        const t0 = performance.now();
        state = state || {};
        ensureTable(state);
        if (!state.plate) {
            state.plate = buildPlate(scene, getPlateMat(CFG.sara));
            state.plate.rotation.y = PLATE_YAW;
            sg.addShadowCaster(state.plate, true);
            state.plateBody = staticBody(state.plate, 0.70);
        }
        state.plate.material = getPlateMat(CFG.sara);
        if (!state.kobachi) {
            const p = kobachiSpot(0.95, 1.00);          // 皿の奥右のはす向かい
            state.kobachi = buildKobachi(scene, getPlateMat(CFG.sara), KOBACHI_R);
            state.kobachi.position.set(p[0], 0, p[1]);
            sg.addShadowCaster(state.kobachi, true);
            state.tsuyu = buildTentsuyu(scene, KOBACHI_R * 0.93, 1.92);
            state.tsuyu.material = getTsuyuMat();
            state.tsuyu.parent = state.kobachi;
            state.tsuyu.position.set(0, 0, 0);
        }
        state.kobachi.material = getPlateMat(CFG.sara);
        state.kobachi.setEnabled(CFG.tsuyu);
        state.tsuyu.setEnabled(CFG.tsuyu);

        if (full) {
            disposeFood(state);
            if (CFG.kaishi) {
                state.kaishi = buildKaishi(scene, getPaperMat(), new Rng(CFG.seed ^ 0x1A2B));
                state.kaishi.rotation.y = PLATE_YAW + KAISHI.yaw;
                sg.addShadowCaster(state.kaishi, true);
                state.kaishiBody = staticBody(state.kaishi, 0.85);
            }
            const c = buildFood(CFG.seed);
            state.pieces = c.pieces;
            state.foodMs = c.ms;
            startPlating(state.pieces);
        }
        state.buildMs = performance.now() - t0;
        if (onRebuilt) onRebuilt(state);
    }

    build(true);

    if (CFG.ssao) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.60;
        ssao.totalStrength = 0.14;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 220;
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
    ip.exposure = 1.08;
    ip.contrast = 1.02;
    ip.vignetteEnabled = false;

    scene.onBeforeRenderObservable.add(() => {
        if (!dp.depthOfFieldEnabled) return;
        const focus = camera.radius * 1000;
        dp.depthOfField.focusDistance = focus;
        dp.depthOfField.focalLength = focus * CFG.dofRatio;
    });

    const GUI_MASK = 0x20000000;
    if (CFG.guiOwnCamera) {
        const guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene);
        guiCam.layerMask = GUI_MASK;
        scene.activeCameras = [camera, guiCam];
        scene.onAfterRenderObservable.add(() => { scene.activeCamera = camera; });
        scene.cameraToUseForPointers = camera;
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
    card.isVisible = false;
    ui.addControl(card);

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
    sv.thickness = 0; sv.barSize = 10; sv.barColor = COL.edge;
    sv.barBackground = "rgba(0,0,0,0)"; sv.wheelPrecision = 0.02;
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
    function addToggle(name, label, get, set) {
        const b = addButton(name, label + ": " + (get() ? "ON" : "OFF"), () => {
            set(!get());
            b.textBlock.text = label + ": " + (get() ? "ON" : "OFF");
            b.background = get() ? COL.active : COL.idle;
            build(true);
        });
        b.background = get() ? COL.active : COL.idle;
        return b;
    }
    function addCount(name, label, unit, max, get, set) {
        const txt = () => label + ": " + (get() ? get() + unit : "なし");
        const b = addButton(name, txt(), () => {
            set((get() + 1) % (max + 1));
            b.textBlock.text = txt();
            b.background = get() ? COL.active : COL.idle;
            build(true);
        });
        b.background = get() ? COL.active : COL.idle;
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

    addLabel("TEMPURA / 天ぷらの盛り合わせ", 11, COL.sub, "30px");

    const saraBtns = {};
    function highlight() {
        for (const k in saraBtns) saraBtns[k].background = (k === CFG.sara) ? COL.active : COL.idle;
    }
    addLabel("器", 13, COL.accent, "22px");
    for (const k of Object.keys(SARA)) {
        saraBtns[k] = addButton("s_" + k, SARA[k].label, () => {
            CFG.sara = k;
            state.plate.material = getPlateMat(k);
            state.kobachi.material = getPlateMat(k);
            highlight();
        });
    }
    highlight();

    addSpacer();
    addLabel("具", 13, COL.accent, "22px");
    addCount("ebi", "えび天", "本", 3, () => CFG.ebi, (v) => { CFG.ebi = v; });
    addCount("shishito", "ししとう", "本", 3, () => CFG.shishito, (v) => { CFG.shishito = v; });
    addToggle("shiso", "大葉", () => CFG.shiso, (v) => { CFG.shiso = v; });
    addToggle("nasu", "なすの扇切り", () => CFG.nasu, (v) => { CFG.nasu = v; });
    addToggle("kabocha", "かぼちゃ", () => CFG.kabocha, (v) => { CFG.kabocha = v; });
    addToggle("kaishi", "懐紙", () => CFG.kaishi, (v) => { CFG.kaishi = v; });

    addSpacer();
    addLabel("盛り付け", 13, COL.accent, "22px");
    const physBtn = addButton("phys", "物理で盛る: " + (CFG.physics ? "ON" : "OFF"), () => {
        CFG.physics = !CFG.physics;
        physBtn.textBlock.text = "物理で盛る: " + (CFG.physics ? "ON" : "OFF");
        physBtn.background = CFG.physics ? COL.active : COL.idle;
        build(true);
    });
    physBtn.background = CFG.physics ? COL.active : COL.idle;
    if (!hasPhysics()) physBtn.textBlock.text = "物理で盛る: Havok なし";

    addButton("redrop", "盛り直す", () => {
        if (!state.pieces) return;
        startPlating(state.pieces);
    });

    addSpacer();
    const tsuyuBtn = addButton("tsuyu", "天つゆ: " + (CFG.tsuyu ? "ON" : "OFF"), () => {
        CFG.tsuyu = !CFG.tsuyu;
        state.kobachi.setEnabled(CFG.tsuyu);
        state.tsuyu.setEnabled(CFG.tsuyu);
        tsuyuBtn.textBlock.text = "天つゆ: " + (CFG.tsuyu ? "ON" : "OFF");
        tsuyuBtn.background = CFG.tsuyu ? COL.active : COL.idle;
    });
    tsuyuBtn.background = CFG.tsuyu ? COL.active : COL.idle;

    addButton("reseed", "揚げ直す", () => {
        CFG.seed = (CFG.seed * 1664525 + 1013904223) >>> 0;
        build(true);
    });

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
    const dofBtn = addButton("dof", "被写界深度: " + (CFG.dof ? "ON" : "OFF"), () => {
        CFG.dof = !CFG.dof;
        dp.depthOfFieldEnabled = CFG.dof;
        dofBtn.background = CFG.dof ? COL.active : COL.idle;
        dofBtn.textBlock.text = "被写界深度: " + (CFG.dof ? "ON" : "OFF");
    });
    dofBtn.background = CFG.dof ? COL.active : COL.idle;
    addSlider("ぼけ量", 0.01, 0.20, CFG.dofRatio, f2, (v) => { CFG.dofRatio = v; });
    addSlider("F値", 1.2, 11.0, CFG.dofFStop, (v) => v.toFixed(1), (v) => { dp.depthOfField.fStop = v; });

    const info = addLabel("", 12, COL.sub, "98px");
    onRebuilt = (st) => {
        let tri = 0;
        for (const k of ["plate", "kobachi", "tsuyu", "kaishi"]) {
            if (st[k] && st[k].tris) tri += st[k].tris;
        }
        if (st.pieces) for (const p of st.pieces) tri += p.tris;
        info.text = "丸皿 直径 " + (PLATE.halfX * 2).toFixed(0) + "cm"
            + " / えび " + CFG.ebi + "本（身 " + EBI.len.toFixed(1) + "cm）\n"
            + tri.toLocaleString() + " tri / " + (st.pieces ? st.pieces.length : 0) + " 個\n"
            + "盛り付け " + plating.mode + " "
            + (plating.done ? (plating.ms || 0).toFixed(0) + "ms で静止" : "落下中…") + "\n"
            + "造形 " + (st.foodMs || 0).toFixed(0) + "ms / 全体 " + st.buildMs.toFixed(0) + "ms\n"
            + "seed: " + CFG.seed;
    };
    onRebuilt(state);
    scene.onBeforeRenderObservable.add(() => {
        if (plating.active && onRebuilt) onRebuilt(state);
    });

    console.log("[Tenmori] build tenmori-2026-09-20-havok",
        "| ebi=" + CFG.ebi, "| physics=" + (hasPhysics() && CFG.physics), "| ms=" + state.buildMs.toFixed(0));

    scene.onDisposeObservable.add(() => {
        for (const k in plateMatCache) {
            const m = plateMatCache[k];
            if (m.texs) for (const t of m.texs) t.dispose();
            m.dispose(true, false);
        }
        for (const s of [clothTex, koromoTex, ebiBodyTex, paperTex]) {
            if (s) for (const t in s) s[t].dispose();
        }
        if (ebiTailTex) ebiTailTex.dispose();
    });

    return scene;
};

export default createScene;