// Ebi Fry (エビフライ) — panko-breaded deep-fried prawns for Babylon.js Playground
// Paste this entire file into the JavaScript editor and press Run.
// White round plate, shredded cabbage mound, lemon wedge, cherry tomato, tartar sauce.
// The prawns are dropped one at a time by Havok and frozen once they stop moving,
// so they lean on the cabbage and on each other at plausible angles.
// Colours are measured from reference photographs (specular removed, white balanced).
// CFG near the top controls the garnish, physics, SSAO and depth of field.
// No external models required. Environment uses Babylon CDN, physics uses Havok.

var createScene = async function () {

    // ---- 実測した色（sRGB）------------------------------------------------
    // 参考写真4枚からパン粉の面を抜き出し、鏡面を落として輝度の分位ごとに平均した値。
    // 「いちばん淡い所でもうきつね色」のレンジに寄せてある（淡い色を広く置くと
    // 粉を吹いたパンに見える）
    const PANKO_PALE = [0.955, 0.790, 0.520];   // 立った破片の先。ここだけ明るい
    const PANKO_LIGHT = [0.930, 0.660, 0.330];
    const PANKO_MID = [0.830, 0.510, 0.205];   // きつね色。面積のいちばん多い色
    const PANKO_DARK = [0.620, 0.340, 0.115];   // あめ色。出っ張りと破片の際
    const PANKO_BURN = [0.400, 0.195, 0.062];   // 焦げぎわ。黒に寄せない

    const EBI = {
        len: 9.20,          // 衣の中の身の長さ（尾を除く）cm
        wid: 1.66,          // いちばん太い所の幅
        hgt: 1.42,          // 同じく高さ

        widHead: 0.84, widMid: 1.00, widTail: 0.42,
        hgtHead: 0.78, hgtMid: 1.00, hgtTail: 0.46,
        pUp: 2.15,          // 背側の断面の超だ円指数
        pDn: 2.40,          // 腹側。筋切りして伸ばすので平たい
        bellyRatio: 0.46,

        segs: 6,            // 節の数
        segGroove: 0.050,   // 節の溝の深さ（半径比）。伸ばしてあるので浅い
        segWidth: 0.17,
        segCurve: 0.050,
        segBulge: 0.022,
        wob: 0.012,

        segU: 88, segA: 48, // 分割（長さ / 断面）

        fanLen: 2.25, fanWid: 0.54, fanTh: 0.030, fanCurl: 0.18,
        tailSeg: 0.62,      // 尾の手前の節（ここは衣がつかない）

        panko: 0.335,       // パン粉衣の厚み cm。天ぷらの衣の3倍ある
        hemHead: -0.10,     // 衣の裾（頭側）。負なので端を巻き込む
        hemTail: 0.930      // 衣の裾（尾側）。ここから先は素の身と尾が出る
    };

    const EBI_COL = {
        flesh: [0.958, 0.922, 0.870],   // 身の白い所
        pale: [0.978, 0.858, 0.778],
        band: [0.930, 0.352, 0.105],   // 節の縁の橙（揚げて締まった色）
        deep: [0.735, 0.205, 0.055],   // 背の濃い赤
        speck: [0.880, 0.390, 0.150],
        tail: [0.600, 0.190, 0.035],   // 尾。実測 [0.44,0.13,0.02] 付近に落ちる
        tailPale: [0.950, 0.620, 0.260],
        bandAmt: 1.00, edgeAmt: 0.92, speckAmt: 0.85,
        rough: 0.30, coat: 0.48, coatRough: 0.18,
        translucency: 0.26, tint: [0.95, 0.62, 0.50]
    };

    // 千切りキャベツ。芯に近いほど白く、葉の縁ほど緑
    const CAB_CORE = [0.938, 0.930, 0.868];
    const CAB_PALE = [0.862, 0.888, 0.665];
    const CAB_GREEN = [0.585, 0.742, 0.348];
    const CAB_DEEP = [0.392, 0.548, 0.228];

    const LEMON = {
        rind: [0.935, 0.775, 0.155],
        rindDeep: [0.760, 0.590, 0.090],
        pith: [0.962, 0.940, 0.848],
        flesh: [0.958, 0.838, 0.425],
        fleshPale: [0.975, 0.910, 0.620],
        wall: [0.965, 0.905, 0.688],
        core: [0.955, 0.925, 0.780]
    };

    const TOMATO = {
        skin: [0.762, 0.128, 0.052],
        deep: [0.545, 0.062, 0.028],
        warm: [0.852, 0.300, 0.088],
        calyx: [0.318, 0.452, 0.152],
        stem: [0.395, 0.505, 0.212]
    };

    const TARTAR = {
        body: [0.935, 0.898, 0.795],
        shade: [0.822, 0.762, 0.628],
        pickle: [0.575, 0.652, 0.322],
        yolk: [0.945, 0.812, 0.362],
        herb: [0.300, 0.442, 0.185],
        onion: [0.968, 0.958, 0.912]
    };

    const SARA = {
        shiro: {
            label: "白の丸皿",
            body: [0.886, 0.872, 0.838],
            deep: [0.792, 0.775, 0.735],
            speck: [0.430, 0.380, 0.330],
            speckAmt: 0.10, rough: 0.185, coat: 0.94
        },
        nyuhaku: {
            label: "乳白の粉引",
            body: [0.852, 0.832, 0.782],
            deep: [0.742, 0.718, 0.662],
            speck: [0.455, 0.415, 0.360],
            speckAmt: 0.22, rough: 0.420, coat: 0.30
        },
        seiji: {
            label: "青磁の丸皿",
            body: [0.720, 0.775, 0.685],
            deep: [0.530, 0.635, 0.545],
            speck: [0.360, 0.405, 0.285],
            speckAmt: 0.12, rough: 0.34, coat: 0.38
        },
        kon: {
            label: "紺縁の洋皿",
            body: [0.868, 0.858, 0.832],
            deep: [0.225, 0.268, 0.392],
            speck: [0.380, 0.400, 0.470],
            speckAmt: 0.08, rough: 0.165, coat: 0.96
        }
    };

    const PLATE = {
        halfX: 11.6,       // 丸皿の半径 cm（直径 23cm。洋食屋のエビフライ皿）
        halfZ: 11.6,
        pow: 2.0,
        wellY: 1.22,       // 見込み（料理が乗る面）の高さ
        wellIn: 0.730,     // 見込みの平らな範囲（外形に対する比）
        rimY: 2.30,        // 口縁の高さ
        rimOut: 0.995,
        thick: 0.58,
        footIn: 0.44,
        footOut: 0.62,
        footH: 0.62,
        flutes: 46,        // 口縁の鎬（放射のしのぎ）の本数
        fluteAmt: 0.0075   // その深さ（半径比）
    };

    const CFG = {
        sara: "shiro",
        ebi: 5,        // エビフライの本数（1〜5）
        cabbage: true,     // 千切りキャベツ
        lemon: true,     // レモンのくし切り
        tomato: true,     // プチトマト
        tartar: true,     // タルタルソース
        flute: true,     // 皿の鎬
        cloth: true,
        physics: true,     // Havok で1本ずつ落として盛り付ける
        panko: 820,        // 1本あたりの立ったパン粉の数
        cabCount: 340,        // キャベツの本数
        seed: 20260920,
        texSize: 1024,
        ssao: false,
        dof: false,
        dofRatio: 0.045,
        dofFStop: 4.0,
        guiOwnCamera: false
    };

    // 物理（Havok）で盛り付けるときの定数。SKILL.md 5章の実測値に合わせてある
    const PHYS = {
        gravity: 620,      // cm 系。981 では接触許容量が実質1/100になり震える
        step: 1 / 120,     // 固定タイムステップ
        interval: 0.26,    // 1本ずつ落とす間隔 s
        gap: 1.20,         // 直下の物からどれだけ上で放すか cm
        shrink: 0.965,     // 凸包を内側に寄せる係数
        settleV: 1.4,      // 静止判定（速度 cm/s）
        settleW: 1.4,      // 同（角速度 rad/s）
        settleHold: 0.40,  // これだけ静止が続いたら固定 s
        timeout: 6.5,      // 最後の投入からの打ち切り s
        friction: 0.92,    // パン粉どうしはよく止まる
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

        hash2(xi, yi) { return this.p[(this.p[xi & 255] + (yi & 255)) & 511] / 255; }
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

    let __uid = 0;
    const named = (mesh, base) => {
        const nm = base + "_" + (__uid++);
        mesh.name = nm; mesh.id = nm;          // id が重複すると Inspector が別物を掴む
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

    // 回転体の始端と終端など、位置が一致する頂点の法線を平均する。
    // これを忘れると継ぎ目に縦の筋が出る
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

    // 巻き順を決め打ちしない。全頂点の総和で外向きか判定し、負なら反転する
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
        m.hasVertexAlpha = false;     // 頂点カラー stride 4 で透過パスへ回されるのを防ぐ
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
        // 直前に積んだ三角形群の巻き順を、基準点から見て外向きになるよう揃える
        fixFrom(first, cx, cy, cz) {
            let s = 0;
            for (let t = first; t < this.idx.length; t += 3) {
                const a = this.idx[t] * 3, b = this.idx[t + 1] * 3, c = this.idx[t + 2] * 3;
                const e1 = [this.pos[a] - this.pos[b], this.pos[a + 1] - this.pos[b + 1], this.pos[a + 2] - this.pos[b + 2]];
                const e2 = [this.pos[c] - this.pos[b], this.pos[c + 1] - this.pos[b + 1], this.pos[c + 2] - this.pos[b + 2]];
                const n = vcross(e1, e2);
                s += vdot(n, [this.pos[a] - cx, this.pos[a + 1] - cy, this.pos[a + 2] - cz]);
            }
            if (s >= 0) return;
            for (let t = first; t < this.idx.length; t += 3) {
                const b = this.idx[t + 1]; this.idx[t + 1] = this.idx[t + 2]; this.idx[t + 2] = b;
            }
        }
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
            const S = Math.max(8, Math.round(size) || 512);   // createImageData は整数のみ
            const o = opts || {};
            const t = new BABYLON.DynamicTexture(name, { width: S, height: S }, scene, true,
                BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
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

    // 芯線に沿った回転最小化フレーム（二重反射法）
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

    // 断面の上下を水平に保つ回転角。折り返さないと背と腹が入れ替わる
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

    function face(g, a, b, c, d) { g.quad(a, b, c, d); }

    // 小さなふくらみ。衣のダマや尾のつけ根の塊に使う
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

    // 立ったパン粉の破片。いびつな多角形の薄板を、面から少し浮かせて傾けて置く。
    // 天ぷらの衣の「泡」と違い、パン粉は角のある板が刺さって見えるのが特徴
    function pankoFlake(g, lf, rng, hw, hl, th, cTop, cBot) {
        const K = 7;
        const first = g.idx.length;
        const curl = rng.range(-0.55, 0.55);
        const ph = rng.range(0, TAU);
        const ring = [];
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < K; i++) {
            const a = i / K * TAU + rng.pm(0.18);
            const r = rng.range(0.68, 1.30);
            const x = Math.cos(a) * hw * r;
            const y = Math.sin(a) * hl * r;
            const z = curl * (y * y) / Math.max(hl, 0.01) + 0.018 * Math.sin(a * 3 + ph);
            ring.push([x, y, z]);
            cx += x; cy += y; cz += z;
        }
        cx /= K; cy /= K; cz /= K;
        const top = [], bot = [];
        for (let i = 0; i < K; i++) {
            const p = ring[i];
            top.push(g.vert(lf.at(p[0], p[1], p[2] + th), i / K, 1, cTop));
            bot.push(g.vert(lf.at(p[0], p[1], p[2] - th), i / K, 0, cBot));
        }
        const ct = g.vert(lf.at(cx, cy, cz + th * 1.25), 0.5, 1, cTop);
        const cb = g.vert(lf.at(cx, cy, cz - th), 0.5, 0, cBot);
        for (let i = 0; i < K; i++) {
            const j = (i + 1) % K;
            g.tri(ct, top[i], top[j]);
            g.tri(cb, bot[j], bot[i]);
            g.quad(top[i], bot[i], bot[j], top[j]);
        }
        const c = lf.at(cx, cy, cz);
        g.fixFrom(first, c[0], c[1], c[2]);
    }

    // 芯線に断面を掃引して格子（位置と法線）を作る。表示にも衣の土台にも使う
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
        gridNormals(BP, BN, N, NA, pts);
        return { BP: BP, BN: BN, N: N, NA: NA, W: W, pts: pts };
    }

    function gridNormals(BP, BN, N, NA, pts) {
        const W = NA + 1;
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
    }

    function emitGrid(g, gr, colFn, capA, capB) {
        const BP = gr.BP, BN = gr.BN, N = gr.N, NA = gr.NA, W = gr.W;
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

    // ---- 皿 ---------------------------------------------------------------

    // 口縁だけ鎬（しのぎ）を入れる。見込みは平らなまま
    function plateR(phi, p) {
        const ca = Math.abs(Math.cos(phi)), sa = Math.abs(Math.sin(phi));
        const pw = PLATE.pow;
        let r = Math.pow(Math.pow(ca / PLATE.halfX, pw) + Math.pow(sa / PLATE.halfZ, pw), -1 / pw);
        if (CFG.flute && p) {
            const w = smoothstep(0.76, 0.96, p.r);
            r *= 1 - PLATE.fluteAmt * w * (0.5 - 0.5 * Math.cos(PLATE.flutes * phi));
        }
        return r;
    }

    function plateProfile() {
        const P = [];
        const push = (r, y, k) => P.push({ r: r, y: y, k: k });
        push(0.000, PLATE.wellY - 0.05, 0);
        push(0.300, PLATE.wellY - 0.04, 0);
        push(0.560, PLATE.wellY - 0.015, 0);
        push(PLATE.wellIn, PLATE.wellY, 0);
        push(0.800, PLATE.wellY + 0.22, 0);
        push(0.868, PLATE.wellY + 0.54, 0);
        push(0.930, PLATE.wellY + 0.84, 0);
        push(0.970, PLATE.rimY - 0.18, 1);
        push(PLATE.rimOut, PLATE.rimY - 0.03, 1);
        push(1.008, PLATE.rimY, 1);
        push(1.017, PLATE.rimY - 0.09, 1);
        push(1.020, PLATE.rimY - 0.24, 1);
        push(1.012, PLATE.rimY - 0.60, 2);
        push(0.974, PLATE.wellY + 0.66, 2);
        push(0.922, PLATE.wellY + 0.24, 2);
        push(0.850, PLATE.wellY - 0.16, 2);
        push(PLATE.footOut + 0.06, PLATE.wellY - PLATE.thick + 0.06, 2);
        push(PLATE.footOut, PLATE.footH, 3);
        push(PLATE.footOut - 0.006, 0.030, 3);
        push(PLATE.footOut - 0.020, 0.000, 3);
        push(PLATE.footIn + 0.020, 0.000, 3);
        push(PLATE.footIn + 0.006, 0.030, 3);
        push(PLATE.footIn, PLATE.footH, 3);
        for (let i = 1; i <= 10; i++) {
            const u = 1 - i / 10;
            push(PLATE.footIn * u, PLATE.footH + 0.12 * (1 - Math.pow(u, 1.6)), 3);
        }
        return P;
    }

    // 回転体。v は弧長で刻む（添字刻みだと縁だけテクスチャが詰まる）
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
                const R = radiusFn(th, p) * p.r;
                // 完全な真円だと縁のハイライトが定規の線になる。手びねりの歪みを足す
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
        const m = sweepProfile("plate", scene, plateProfile(), plateR, 256, true, null);
        m.material = mat;
        return m;
    }

    const PROF_CACHE = plateProfile();
    function plateSurfaceY(x, z) {
        const r = Math.hypot(x, z) / PLATE.halfX;
        for (let i = 1; i < PROF_CACHE.length; i++) {
            if (PROF_CACHE[i].k !== 0 && PROF_CACHE[i].k !== 1) break;
            if (r <= PROF_CACHE[i].r) {
                const a = PROF_CACHE[i - 1], b = PROF_CACHE[i];
                return mix(a.y, b.y, clamp((r - a.r) / (b.r - a.r), 0, 1));
            }
        }
        return PLATE.rimY;
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
        m.clearCoat.roughness = 0.070;
        m.clearCoat.indexOfRefraction = 1.52;
        m.texs = [t.albedo, t.orm, t.normal];
        return m;
    }

    // ---- 卓 ---------------------------------------------------------------

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
        const BASE = [0.905, 0.868, 0.782];
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
        return { albedo: albedo, orm: orm, normal: normal, uv: 86, bump: 0.35, rough: 1.0 };
    }

    // 板の卓。参考写真2枚が木のテーブルなので、切り替えられるようにしてある
    function woodTextures(scene, seed) {
        const S = 512, s2 = S * S;
        const nz = new Noise(seed);
        const H = new Float32Array(s2), G = new Float32Array(s2), J = new Float32Array(s2);
        const PLANK = 5;                      // テクスチャ1枚あたりの板の枚数
        for (let y = 0; y < S; y++) {
            const v = y / S;
            for (let x = 0; x < S; x++) {
                const u = x / S, k = y * S + x;
                const pi = Math.floor(v * PLANK);
                const pv = v * PLANK - pi;
                const off = nz.hash2(pi * 31 + 7, pi * 17 + 3);     // 板ごとに木目をずらす
                // 年輪は長手方向に引き伸ばした縞。うねりは低周波ノイズで与える
                const warp = (nz.fbm2(u * 3 + off * 10, v * 9, 3, 0, 0) - 0.5) * 0.55;
                const ring = Math.abs(Math.sin((u * 3.1 + warp + off * 4) * Math.PI * 4.2));
                const grain = Math.pow(ring, 0.35);
                const fine = nz.fbm2(u * 160, v * 26 + off * 20, 2, 0, 0);
                const gap = 1 - smoothstep(0.0, 0.035, pv) * smoothstep(1.0, 0.965, pv);
                G[k] = clamp(grain * 0.78 + fine * 0.22, 0, 1);
                J[k] = gap;
                H[k] = clamp(0.58 + (G[k] - 0.5) * 0.5 - gap * 0.85, 0, 1);
            }
        }
        const DARK = lin3([0.268, 0.160, 0.088]);
        const MIDW = lin3([0.455, 0.298, 0.170]);
        const LITE = lin3([0.585, 0.412, 0.248]);
        const albedo = TexLab.make("woodA", S, scene, (d) => {
            for (let k = 0; k < s2; k++) {
                const t = G[k];
                let r, g, b;
                if (t < 0.5) { const w = t * 2; r = mix(DARK[0], MIDW[0], w); g = mix(DARK[1], MIDW[1], w); b = mix(DARK[2], MIDW[2], w); }
                else { const w = (t - 0.5) * 2; r = mix(MIDW[0], LITE[0], w); g = mix(MIDW[1], LITE[1], w); b = mix(MIDW[2], LITE[2], w); }
                const j = 1 - J[k] * 0.82;
                putRGB(d, k * 4, l2s(r * j), l2s(g * j), l2s(b * j));
            }
        }, {});
        const orm = TexLab.orm("woodO", S, scene, (x, y, SS, o) => {
            const k = y * SS + x;
            o[0] = clamp(1 - 0.45 * J[k], 0, 1);
            o[1] = clamp(0.42 + 0.26 * (1 - G[k]) + 0.25 * J[k], 0.1, 1);
            o[2] = 0;
        }, {});
        const normal = TexLab.normalFromHeight("woodN", S, scene, H, 0.0035, {});
        return { albedo: albedo, orm: orm, normal: normal, uv: 6, bump: 0.60, rough: 1.0 };
    }

    // ---- エビフライ本体 -----------------------------------------------------

    // 節の位置。腹側（w<0）ほど手前にずれて「へ」の字になる
    function ebiSeamCoord(u, w) {
        const curve = Math.sqrt(w * w + 0.018) - Math.sqrt(0.018);
        return (u + EBI.segCurve * (curve - 0.42) + 0.005 * Math.sin(u * 19 + w * 4)) * EBI.segs;
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

    // 物理の当たり判定用。表示メッシュではなく、衣の厚みを足した滑らかな筒の点群を返す。
    // でこぼこをそのまま凸包にすると同一平面の面が増えて接触が毎ステップ飛ぶ
    function ebiHullPoints(sc, bend) {
        const L = EBI.len * sc, pts = [];
        const RINGS = 13, SEG = 8, pad = EBI.panko * 0.72 * sc;
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

    const PANKO_RAMP = [lin3(PANKO_BURN), lin3(PANKO_DARK), lin3(PANKO_MID),
    lin3(PANKO_LIGHT), lin3(PANKO_PALE)];
    // t: 0 = 焦げぎわ、0.5 付近 = きつね色、1 = 立った破片の先
    function pankoRamp(t) {
        const x = clamp(t, 0, 1) * (PANKO_RAMP.length - 1);
        const i = Math.min(PANKO_RAMP.length - 2, Math.floor(x));
        return mix3(PANKO_RAMP[i], PANKO_RAMP[i + 1], x - i);
    }

    // 1本ぶん。すべてローカル座標（原点 = 尾のつけ根、+Z = 頭の向き、+Y = 上）で作る。
    // 位置と姿勢は TransformNode 側で与えないと剛体として動かせない
    function buildEbiFry(gC, gB, gT, rng, nz, opt) {
        const N = EBI.segU, NA = EBI.segA, W = NA + 1;
        const A = opt.tail, B = opt.head;            // A = 尾のつけ根, B = 頭側の端
        const bend = opt.bend === undefined ? 0.14 : opt.bend;
        const sc = opt.scale === undefined ? 1 : opt.scale;
        const tone = opt.tone === undefined ? 0 : opt.tone;   // 1本ごとの揚げ色の差

        const pts = new Float64Array((N + 1) * 3);
        for (let i = 0; i <= N; i++) {
            const t = i / N;
            // 筋切りして伸ばしてあるのでほぼ直線。わずかに背側へ反る
            const b = Math.sin(Math.PI * t) * (1 - 0.35 * t) * bend;
            pts[i * 3] = mix(B[0], A[0], t);
            pts[i * 3 + 1] = mix(B[1], A[1], t) + b;
            pts[i * 3 + 2] = mix(B[2], A[2], t);
        }
        const fr = frames(pts, N + 1);
        const roll = flatRoll(fr, N + 1, 0.90, 0.04, new Rng(opt.seed || 7));

        const BP = new Float64Array((N + 1) * W * 3);
        const BN = new Float64Array((N + 1) * W * 3);
        const EPS = 0.010;                 // 端を1点に潰さない。潰すと頭の蓋が張れない
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
            }
        }
        gridNormals(BP, BN, N, NA, pts);

        // 身。衣に隠れて尾の手前しか見えないが、そこがいちばん目を引く
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
        {   // 両端のふた
            const c0 = gB.vert([pts[0], pts[1], pts[2]], 0, 0.5, WHITE);
            const c1 = gB.vert([pts[N * 3], pts[N * 3 + 1], pts[N * 3 + 2]], 1, 0.5, WHITE);
            for (let j = 0; j < NA; j++) {
                gB.tri(c0, rowsB[0][j], rowsB[0][j + 1]);
                gB.tri(c1, rowsB[N][j + 1], rowsB[N][j]);
            }
        }

        // ---- パン粉の衣 ----
        // 厚みを多帯域ノイズで決め、その厚みから色を決める（色を形と相関させる）
        const th0 = EBI.panko * sc;
        const hemPh = rng.range(0, 30);
        const hemT = (th) => EBI.hemTail + 0.040 * (nz.n2(Math.cos(th) * 1.7 + hemPh, Math.sin(th) * 1.7) - 0.5) * 2;
        const hemH = (th) => EBI.hemHead + 0.045 * (nz.n2(Math.cos(th) * 1.9 + hemPh + 9, Math.sin(th) * 1.9 + 3) - 0.5) * 2;
        const KT = new Float32Array((N + 1) * W);
        const CT = new Float32Array((N + 1) * W);
        for (let i = 0; i <= N; i++) {
            const u = i / N;
            for (let j = 0; j <= NA; j++) {
                const th = -Math.PI / 2 + (j % NA) / NA * TAU;
                const h0 = hemH(th), h1 = hemT(th);
                const e = smoothstep(h0, h0 + 0.07, u) * (1 - smoothstep(h1 - 0.075, h1, u));
                if (e <= 0.001) { KT[i * W + j] = 0; continue; }
                const k = (i * W + j) * 3;
                const x = BP[k], y = BP[k + 1], z = BP[k + 2];
                const lowA = nz.fbm3(x * 0.55, y * 0.55, z * 0.55, 3) - 0.5;    // 衣全体のうねり
                const lowB = nz.fbm3(x * 1.25 + 7, y * 1.25, z * 1.25, 3) - 0.5;  // 2〜3個の大きな塊
                const cl = smoothstep(0.50, 0.78, nz.fbm3(x * 2.8 + 3, y * 2.8, z * 2.8, 2)); // パン粉のダマ
                const hi = (nz.fbm3(x * 6.6 + 11, y * 6.6, z * 6.6, 2) - 0.5)
                    * (0.30 + 0.70 * cl);                                   // ダマの上の薄片
                const crk = 1 - smoothstep(0, 0.050,
                    Math.abs(nz.fbm3(x * 1.9 + 21, y * 1.9, z * 1.9, 2) - 0.5));   // 衣の裂け目
                const bump = lowA * 0.95 + lowB * 0.62 + cl * 0.50 + hi * 0.50 - crk * 0.42;
                KT[i * W + j] = th0 * e * (1 + bump) + 0.020;
                // 出っ張った破片は光を拾って明るく、谷は油がたまって濃い
                CT[i * W + j] = clamp(0.46 + bump * 0.60 + cl * 0.14 - crk * 0.18 + tone, 0, 1);
            }
        }
        const useK = new Uint8Array((N + 1) * W);
        const LIM = 0.024;
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < NA; j++) {
                if (KT[i * W + j] < LIM || KT[(i + 1) * W + j] < LIM
                    || KT[(i + 1) * W + j + 1] < LIM || KT[i * W + j + 1] < LIM) continue;
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
                const c = pankoRamp(CT[i * W + j]);
                row.push(gC.vert([BP[k] + BN[k] * t, BP[k + 1] + BN[k + 1] * t, BP[k + 2] + BN[k + 2] * t],
                    j / NA * 3.0, i / N * 5.0, c));
            }
            rowsK.push(row);
        }
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < NA; j++) {
                const a = rowsK[i][j], b = rowsK[i + 1][j], c = rowsK[i + 1][j + 1], d = rowsK[i][j + 1];
                if (a < 0 || b < 0 || c < 0 || d < 0) continue;
                face(gC, a, b, c, d);
            }
        }

        // 頭側の蓋。切り口の丸い端をパン粉で覆う
        const headFrame = localFrame(B, vnorm(vsub(B, A)));
        const capCol = pankoRamp(clamp(0.52 + tone, 0, 1));
        const capTip = gC.vert(headFrame.at(0, 0, 0.16 * sc), 0.5, 0.5, capCol);
        for (let j = 0; j < NA; j++) {
            if (rowsK[0][j] >= 0 && rowsK[0][j + 1] >= 0) gC.tri(capTip, rowsK[0][j], rowsK[0][j + 1]);
        }
        blob(gC, headFrame, [EBI.wid * 0.46 * sc, EBI.hgt * 0.44 * sc, 0.26 * sc], false, 0,
            pankoRamp(clamp(0.40 + tone, 0, 1)), capCol);

        // ---- 立ったパン粉 ----
        // 面から拾った法線を少し傾けて、角のある薄板を刺す。これがエビフライらしさの主成分
        const NF = opt.flakes === undefined ? 420 : opt.flakes;
        for (let f = 0; f < NF; f++) {
            const i = Math.round(mix(0.010, EBI.hemTail - 0.045, rng.next()) * N);
            const j = rng.int(NA);
            const t = KT[i * W + j];
            if (t < th0 * 0.42) continue;
            const k = (i * W + j) * 3;
            const n = [BN[k], BN[k + 1], BN[k + 2]];
            if (n[1] < -0.45) continue;                  // 皿に接する裏側は省く
            const c = [BP[k] + n[0] * t * 0.92, BP[k + 1] + n[1] * t * 0.92, BP[k + 2] + n[2] * t * 0.92];
            if (opt.floorY !== undefined && c[1] < opt.floorY + 0.16) continue;
            // 接線方向へ倒して、片側の角が浮くようにする
            const tanA = rng.range(0, TAU), tilt = rng.range(0.15, 0.85);
            const base = localFrame(c, n, [0, 1, 0]);
            const dir = vnorm(vadd(n, vadd(vmul(base.s, Math.cos(tanA) * tilt),
                vmul(base.v, Math.sin(tanA) * tilt))));
            const lf = localFrame(c, dir, [0, 1, 0]);
            const big = rng.next() < 0.14;               // 1割は大きくはねた破片
            const hl = rng.range(0.13, big ? 0.40 : 0.26) * sc;
            const hw = hl * rng.range(0.42, 0.85);
            const cTop = pankoRamp(clamp(rng.range(0.64, 0.96) + tone, 0, 1));
            const cBot = pankoRamp(clamp(rng.range(0.26, 0.50) + tone, 0, 1));
            pankoFlake(gC, lf, rng, hw, hl, rng.range(0.022, 0.040) * sc, cTop, cBot);
        }

        // ---- 尾 ----
        const T9 = vnorm([A[0] - pts[(N - 2) * 3], A[1] - pts[(N - 2) * 3 + 1], A[2] - pts[(N - 2) * 3 + 2]]);
        let dir = T9;
        if (opt.tailDir) {
            const want = vnorm(opt.tailDir);
            const maxA = opt.tailBend === undefined ? 0.45 : opt.tailBend;
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
        leaf(0, EBI.tailSeg, 0.28, 0.22, -0.14, 0, 0, true);          // 尾節（連結）
        for (const side of [-1, 1]) {
            leaf(side * 0.46, EBI.fanLen * 0.86, EBI.fanWid * 0.55, EBI.fanTh, 0.30, side * 0.045, 0, false);
            leaf(side * 0.21, EBI.fanLen, EBI.fanWid * 0.46, EBI.fanTh, 0.30, side * 0.035, 0.025 * sc, false);
        }
        leaf(0, EBI.fanLen * 0.78, 0.12, EBI.fanTh, 0.29, 0, 0.050 * sc, false);

        return {
            dir: dir, tailBase: A,
            tip: lfT.at(0, EBI.fanCurl * sc, (0.30 + EBI.fanLen) * sc)
        };
    }

    // ---- テクスチャ ---------------------------------------------------------

    // パン粉の粒。高さ場を1枚作り、アルベド / ORM / 法線が同じものを参照する
    function pankoTextures(scene, seed) {
        const S = Math.max(256, Math.round(CFG.texSize * 0.5)), s2 = S * S;
        const nz = new Noise(seed);
        const H = new Float32Array(s2), B = new Float32Array(s2);
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const u = x / S * 8, v = y / S * 8;
                const a = nz.fbm2(u * 1.6, v * 1.6, 3, 13, 13);          // 粒の集まり
                const b = nz.n2(u * 5.5 + 11, v * 5.5 + 5, 44, 44);        // 粒そのもの
                const c = nz.fbm2(u * 14 + 3, v * 14 + 7, 2, 112, 112);   // ざらつき
                // 粒は閾値で切って立たせる。そのまま足すと波打つだけで「パン粉」にならない
                const grain = smoothstep(0.42, 0.72, b) * (0.55 + 0.45 * a);
                const pit = smoothstep(0.62, 0.86, c);
                H[y * S + x] = clamp(0.30 + grain * 0.62 + (c - 0.5) * 0.18 - pit * 0.14, 0, 1);
                B[y * S + x] = smoothstep(0.60, 0.88, nz.fbm2(u * 0.8 + 21, v * 0.8 + 31, 2, 6, 6));
            }
        }
        const BURN = lin3(PANKO_BURN);
        const albedo = TexLab.make("pankoA", S, scene, (d) => {
            for (let k = 0; k < s2; k++) {
                // 頂点カラーに掛ける変調なので 1.0 を超えない
                const w = mix(0.80, 1.00, H[k]);
                const bn = B[k] * (1 - H[k] * 0.55) * 0.20;
                putRGB(d, k * 4,
                    w * (1 - bn * (1 - BURN[0])),
                    w * (1 - bn * (1 - BURN[1])),
                    w * (1 - bn * (1 - BURN[2])));
            }
        }, {});
        const orm = TexLab.orm("pankoO", S, scene, (x, y, SS, o) => {
            const k = y * SS + x;
            o[0] = clamp(0.92 + 0.08 * H[k], 0, 1);
            o[1] = clamp(0.30 + 0.30 * H[k], 0.15, 0.95);   // くぼみほど油がたまって滑らか
            o[2] = 0;
        }, {});
        const normal = TexLab.normalFromHeight("pankoN", S, scene, H, 0.020, {});
        return { albedo: albedo, orm: orm, normal: normal };
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

    // ---- 千切りキャベツ -----------------------------------------------------
    // 山の内部は見えないので、殻（表面付近）にだけ置く。中身まで作ると三角が倍になる

    function buildCabbage(g, rng, nz, opt) {
        // er / ef = カメラ基準の右・奥。山は皿の幅いっぱいに横長にしたいので
        // 世界軸ではなくこの2軸で楕円体を作る
        const at = opt.at, er = opt.er, ef = opt.ef;
        const rx = opt.rr, rz = opt.rf, h = opt.h;
        const CORE = lin3(CAB_CORE), PALE = lin3(CAB_PALE);
        const GREEN = lin3(CAB_GREEN), DEEP = lin3(CAB_DEEP);
        const N = 8, NA = 6;
        let tris = 0;
        for (let c = 0; c < opt.count; c++) {
            const th = rng.range(0, TAU);
            const ph = Math.acos(rng.range(0.03, 1.0));        // 上半球だけ
            const rf = rng.range(0.78, 1.02);
            const sp = Math.sin(ph), cp = Math.cos(ph);
            const X = rx * rf * sp * Math.cos(th), Z = rz * rf * sp * Math.sin(th), Y = h * rf * cp;
            const P = [at[0] + er[0] * X + ef[0] * Z, at[1] + Y, at[2] + er[2] * X + ef[2] * Z];
            const n = vnorm([er[0] * X / (rx * rx) + ef[0] * Z / (rz * rz),
            Y / (h * h),
            er[2] * X / (rx * rx) + ef[2] * Z / (rz * rz)]);
            const base = localFrame(P, n, [0, 1, 0]);
            const a = rng.range(0, TAU);
            // 接平面内の向き。わずかに外へ倒す（内向きだと山に刺さって見えなくなる）
            const dir = vnorm(vadd(vadd(vmul(base.s, Math.cos(a)), vmul(base.v, Math.sin(a))),
                vmul(n, rng.range(-0.10, 0.22))));
            const len = rng.range(2.4, 5.0);
            const o = [P[0] - dir[0] * len * 0.5, P[1] - dir[1] * len * 0.5, P[2] - dir[2] * len * 0.5];
            const pts = lineSpine(o, dir, len, N, rng.pm(0.55), rng.pm(0.75));
            const RMAX = opt.rMax === undefined ? 9.6 : opt.rMax;
            for (let i = 0; i <= N; i++) {
                // 口縁まで届かせない。1本でもはみ出すと皿の外に散らかって見える
                const rr2 = Math.hypot(pts[i * 3], pts[i * 3 + 2]);
                if (rr2 > RMAX) { const k = RMAX / rr2; pts[i * 3] *= k; pts[i * 3 + 2] *= k; }
                const fy = plateSurfaceY(pts[i * 3], pts[i * 3 + 2]) + 0.055;
                if (pts[i * 3 + 1] < fy) pts[i * 3 + 1] = fy;      // 皿にめり込ませない
            }
            const halfW = rng.range(0.065, 0.130);
            const halfT = 0.016;
            const tw0 = rng.range(0, TAU), tw1 = rng.pm(2.4);
            const gr = sweepGrid(pts, N, NA, (u, j, NAA) => {
                const ang = tw0 + tw1 * u;
                const t2 = j / NAA * TAU;
                const ca = Math.abs(Math.cos(t2)), sa = Math.abs(Math.sin(t2));
                const p = 4.5;                                  // 角の丸い長方形
                const rr = 1 / Math.pow(Math.pow(ca, p) + Math.pow(sa, p), 1 / p);
                const taper = 1 - 0.20 * Math.abs(u - 0.5) * 2;
                const x = Math.cos(t2) * rr * halfW * taper, y = Math.sin(t2) * rr * halfT;
                return [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)];
            }, new Rng(1013 + c * 37));
            const greenAt = rng.next();                          // 葉の縁がどちら側に来るか
            const greenAmt = Math.pow(rng.next(), 1.6);          // 大半は芯寄りの白
            const first = g.idx.length;
            emitGrid(g, gr, (u, v, nn) => {
                const d = 1 - Math.abs(u - greenAt);
                const t = clamp((d - 0.45) / 0.55, 0, 1) * greenAmt;
                const fine = nz.fbm2(u * 7 + c, v * 3 + 1, 2, 0, 3) - 0.5;
                let col = mix3(CORE, PALE, clamp(0.35 + t * 1.3 + fine * 0.5, 0, 1));
                if (t > 0.45) col = mix3(col, GREEN, clamp((t - 0.45) / 0.55, 0, 1));
                if (t > 0.88) col = mix3(col, DEEP, clamp((t - 0.88) / 0.12, 0, 1) * 0.5);
                return col;
            });
            tris += (g.idx.length - first) / 3;
        }
        return { tris: tris };
    }

    // ---- レモンのくし切り ---------------------------------------------------
    // 果皮と切断面を別メッシュにすると隙間が開き、片方だけ裏返る。
    // 1本の閉じた立体として作り、両端は R→0 で自然に塞ぐ

    function buildLemon(g, rng, nz, opt) {
        const lf = localFrame(opt.at, opt.axis, opt.up || [0, 1, 0]);
        const L = opt.len, R = opt.rad, span = opt.span;
        const NT = 30, NA = 18, NR = 9;
        const RIND = lin3(LEMON.rind), RIND2 = lin3(LEMON.rindDeep), PITH = lin3(LEMON.pith);
        const FLESH = lin3(LEMON.flesh), FPALE = lin3(LEMON.fleshPale);
        const WALL = lin3(LEMON.wall), CORE = lin3(LEMON.core);
        const ph = rng.range(0, 20);

        function radAt(t, a) {
            // 両端がすぼまるレモン形。皮の凹凸（油胞）は法線マップではなく形で入れる
            const s = Math.pow(Math.max(0, 1 - Math.pow(2 * t - 1, 2)), 0.42);
            const pit = nz.fbm2(a * 2.2 + ph, t * 9, 2, 0, 0) - 0.5;
            const dot = nz.n2(a * 7 + 3, t * 30 + 5, 0, 0) - 0.5;
            return R * s * (1 + pit * 0.030 + dot * 0.035);
        }
        function zAt(t) { return (t - 0.5) * L; }
        function skinPoint(t, a) {
            const r = radAt(t, a);
            return lf.at(r * Math.sin(a), -r * Math.cos(a), zAt(t));
        }
        function skinColor(t, a) {
            const m = nz.fbm2(a * 3 + 7, t * 11 + 2, 3, 0, 0);
            const dot = smoothstep(0.55, 0.85, nz.n2(a * 9 + 1, t * 38 + 9, 0, 0));
            let c = mix3(RIND2, RIND, clamp(0.35 + m * 0.9, 0, 1));
            c = mix3(c, RIND2, dot * 0.35);                  // 油胞のくぼみ
            const end = 1 - smoothstep(0.86, 1.0, Math.abs(2 * t - 1));
            return mix3(mix3(c, PITH, 0.35), c, end);
        }
        // 切断面。芯（q=0）から皮（q=1）へ、果肉 → わた → 果皮の順
        function cutColor(t, q) {
            const ves = Math.pow(Math.abs(Math.sin(t * 46 + q * 3.5 + ph)), 6);   // 砂じょう
            const grain = nz.fbm2(q * 6 + 2, t * 26 + 4, 2, 0, 0);
            if (q > 0.945) return mix3(RIND2, RIND, 0.55);
            if (q > 0.862) return mix3(PITH, RIND2, smoothstep(0.862, 0.945, q) * 0.30);
            let c = mix3(FLESH, FPALE, clamp(grain * 0.9 + ves * 0.5, 0, 1));
            c = mix3(c, WALL, smoothstep(0.80, 0.862, q) * 0.85);   // じょうのうの膜
            c = mix3(c, CORE, (1 - smoothstep(0.0, 0.14, q)) * 0.80); // 中心の芯
            return c;
        }
        const first = g.idx.length;
        // 皮
        const skin = [];
        for (let i = 0; i <= NT; i++) {
            const t = i / NT, row = [];
            for (let j = 0; j <= NA; j++) {
                const a = -span + 2 * span * j / NA;
                row.push(g.vert(skinPoint(t, a), j / NA, t, skinColor(t, a)));
            }
            skin.push(row);
        }
        for (let i = 0; i < NT; i++) {
            for (let j = 0; j < NA; j++) face(g, skin[i][j], skin[i][j + 1], skin[i + 1][j + 1], skin[i + 1][j]);
        }
        // 切断面 2枚。q = 0 が芯、1 が皮
        for (const sgn of [-1, 1]) {
            const a = sgn * span;
            const nx = Math.cos(a) * sgn, ny = Math.sin(a) * sgn;   // 面の法線（s, v 成分）
            const rows = [];
            for (let i = 0; i <= NT; i++) {
                const t = i / NT, row = [];
                const r = radAt(t, a);
                for (let k = 0; k <= NR; k++) {
                    const q = k / NR;
                    // 果汁を含んでふくらむ。まったいらだと切ったばかりに見えない
                    const bul = 0.030 * R * Math.sin(Math.PI * q) * Math.sin(Math.PI * t);
                    const rr = q * r;
                    row.push(g.vert(lf.at(rr * Math.sin(a) + nx * bul, -rr * Math.cos(a) + ny * bul, zAt(t)),
                        q, t, cutColor(t, q)));
                }
                rows.push(row);
            }
            // 2枚の切断面は外向きが逆を向くので、片方は四角形の回り方も逆にする。
            // そろえないと fixFrom の全体反転では片面だけ裏返ったままになる
            for (let i = 0; i < NT; i++) {
                for (let k = 0; k < NR; k++) {
                    if (sgn > 0) face(g, rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1]);
                    else face(g, rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]);
                }
            }
        }
        g.fixFrom(first, opt.at[0], opt.at[1] - R * 0.45, opt.at[2]);
        return { tris: (g.idx.length - first) / 3 };
    }

    // ---- プチトマト ---------------------------------------------------------

    function buildTomato(g, rng, nz, opt) {
        const at = opt.at, R = opt.r;
        const NU = 44, NV = 30;
        const SKIN = lin3(TOMATO.skin), DEEP = lin3(TOMATO.deep), WARM = lin3(TOMATO.warm);
        const CAL = lin3(TOMATO.calyx), STEM = lin3(TOMATO.stem);
        const ph = rng.range(0, 20);
        const first = g.idx.length;
        const rows = [];
        for (let i = 0; i <= NV; i++) {
            const v = i / NV, pv = v * Math.PI;
            const row = [];
            for (let j = 0; j <= NU; j++) {
                const th = (j % NU) / NU * TAU;
                const lobe = 1 + 0.016 * Math.cos(th * 5 + 0.4);        // ゆるい稜
                const wob = 1 + 0.012 * (nz.n3(Math.cos(th) * 1.4, Math.sin(th) * 1.4, v * 3) - 0.5) * 2;
                // へたの側はくぼむ
                const dip = 1 - 0.13 * Math.exp(-Math.pow((pv) / 0.34, 2));
                const r = R * lobe * wob * dip;
                const x = r * Math.sin(pv) * Math.cos(th);
                const y = R * 0.88 * Math.cos(pv) * dip;
                const z = r * Math.sin(pv) * Math.sin(th);
                const up = Math.cos(pv);
                const mott = nz.fbm2(th / TAU * 6 + ph, v * 6, 3, 6, 0);
                let c = mix3(SKIN, WARM, clamp(0.25 + mott * 0.7 - up * 0.25, 0, 1));
                c = mix3(c, DEEP, clamp(0.30 + up * 0.55, 0, 1) * 0.55);   // へた寄りは濃い
                c = mix3(c, WARM, smoothstep(0.35, -0.9, up) * 0.35);      // 尻は橙寄り
                row.push(g.vert([at[0] + x, at[1] + y, at[2] + z], j / NU, v, c));
            }
            rows.push(row);
        }
        for (let i = 0; i < NV; i++) {
            for (let j = 0; j < NU; j++) face(g, rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
        }
        g.fixFrom(first, at[0], at[1], at[2]);

        // へた（5枚の萼片）と軸
        const top = [at[0], at[1] + R * 0.88 * 0.90, at[2]];
        for (let s = 0; s < 5; s++) {
            const a = s / 5 * TAU + rng.pm(0.12);
            const dir = vnorm([Math.cos(a), 0.42 + rng.pm(0.12), Math.sin(a)]);
            const lf = localFrame(top, dir, [0, 1, 0]);
            const f2 = g.idx.length;
            const NLA = 8, ring = [];
            const len = R * 0.86, wid = R * 0.20;
            for (let i = 0; i <= NLA; i++) {
                const t = i / NLA;
                const w = wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.08)), 0.7) * (1 - t * 0.55);
                const drop = -0.30 * R * t * t;                 // 先が下へ垂れる
                ring.push([g.vert(lf.at(-w, drop + 0.012 * R, len * t), 0, t, CAL),
                g.vert(lf.at(w, drop + 0.012 * R, len * t), 1, t, CAL),
                g.vert(lf.at(-w * 0.9, drop - 0.012 * R, len * t), 0, t, mix3(CAL, STEM, 0.5)),
                g.vert(lf.at(w * 0.9, drop - 0.012 * R, len * t), 1, t, mix3(CAL, STEM, 0.5))]);
            }
            for (let i = 0; i < NLA; i++) {
                const a0 = ring[i], a1 = ring[i + 1];
                face(g, a0[0], a0[1], a1[1], a1[0]);
                face(g, a0[2], a1[2], a1[3], a0[3]);
                face(g, a0[0], a1[0], a1[2], a0[2]);
                face(g, a0[1], a0[3], a1[3], a1[1]);
            }
            g.fixFrom(f2, top[0], top[1] - R * 0.2, top[2]);
        }
        {   // 軸
            const f2 = g.idx.length;
            const lf = localFrame(top, [0, 1, 0], [1, 0, 0]);
            const NC = 10, r0 = R * 0.085, ringA = [], ringB = [];
            for (let j = 0; j <= NC; j++) {
                const a = (j % NC) / NC * TAU;
                ringA.push(g.vert(lf.at(Math.cos(a) * r0, Math.sin(a) * r0, -R * 0.04), j / NC, 0, STEM));
                ringB.push(g.vert(lf.at(Math.cos(a) * r0 * 0.8, Math.sin(a) * r0 * 0.8, R * 0.30), j / NC, 1, mix3(STEM, CAL, 0.4)));
            }
            for (let j = 0; j < NC; j++) face(g, ringA[j], ringB[j], ringB[j + 1], ringA[j + 1]);
            const cap = g.vert(lf.at(0, 0, R * 0.31), 0.5, 1, STEM);
            for (let j = 0; j < NC; j++) g.tri(cap, ringB[j], ringB[j + 1]);
            g.fixFrom(f2, top[0], top[1], top[2]);
        }
        return { tris: (g.idx.length - first) / 3 };
    }

    // ---- タルタルソース -----------------------------------------------------

    function buildTartar(g, rng, nz, opt) {
        const at = opt.at, R = opt.r, H = opt.h;
        const NR = 22, NS = 64;
        const BODY = lin3(TARTAR.body), SHADE = lin3(TARTAR.shade);
        const PICKLE = lin3(TARTAR.pickle), YOLK = lin3(TARTAR.yolk);
        const HERB = lin3(TARTAR.herb), ONION = lin3(TARTAR.onion);
        const ph = rng.range(0, 20);
        const yaw = opt.yaw || 0;
        const first = g.idx.length;
        const rows = [];
        for (let i = 0; i <= NR; i++) {
            const q = i / NR, row = [];
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                // 縁は垂れて広がり、上は匙ですくった尾根が残る
                const edge = 1 + 0.16 * (nz.n2(Math.cos(th) * 2 + ph, Math.sin(th) * 2, 0, 0) - 0.5) * 2;
                const ridge = 0.10 * Math.cos((th - yaw) * 2) * smoothstep(0.75, 0.1, q);
                const rr = R * q * edge;
                const x = rr * Math.cos(th), z = rr * Math.sin(th);
                const lump = (nz.fbm3(x * 1.6 + 5, 0.7, z * 1.6, 3) - 0.5) * 0.30;
                let y = H * Math.pow(Math.max(0, 1 - Math.pow(q, 3.2)), 0.55) * (1 + lump + ridge);
                y = Math.max(y, 0.02);
                const base = plateSurfaceY(at[0] + x, at[2] + z) + 0.02;
                // 具の粒。白身・玉ねぎ・ピクルス・パセリが表面に見える
                const sp = nz.n3(x * 9 + 3, y * 9, z * 9 + 7);
                const sp2 = nz.n3(x * 14 + 21, y * 14, z * 14 + 2);
                let c = mix3(SHADE, BODY, clamp(0.30 + y / H * 0.9, 0, 1));
                if (sp > 0.80) c = mix3(c, ONION, (sp - 0.80) / 0.20 * 0.85);
                else if (sp < 0.22) c = mix3(c, YOLK, (0.22 - sp) / 0.22 * 0.70);
                if (sp2 > 0.86) c = mix3(c, PICKLE, (sp2 - 0.86) / 0.14 * 0.80);
                else if (sp2 < 0.10) c = mix3(c, HERB, (0.10 - sp2) / 0.10 * 0.75);
                row.push(g.vert([at[0] + x, base + y, at[2] + z], q, j / NS, c));
            }
            rows.push(row);
        }
        for (let i = 0; i < NR; i++) {
            for (let j = 0; j < NS; j++) face(g, rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
        }
        g.fixFrom(first, at[0], at[1] - H, at[2]);
        return { tris: (g.idx.length - first) / 3 };
    }

    // ---- シーン -------------------------------------------------------------

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.042, 0.039, 0.036, 1);

    // 第1引数 false = _useDeltaForWorldStep。可変ステップだと接触が毎フレーム
    // 解けたり食い込んだりして震える
    let hk = null;
    try {
        if (typeof HavokPhysics === "function" && BABYLON.HavokPlugin) {
            const havok = await HavokPhysics();
            hk = new BABYLON.HavokPlugin(false, havok);
            scene.enablePhysics(new BABYLON.Vector3(0, -PHYS.gravity, 0), hk);
            if (hk.setTimeStep) hk.setTimeStep(PHYS.step);
        }
    } catch (e) {
        console.warn("[EbiFry] Havok の初期化に失敗。手置きに落とします", e);
        hk = null;
    }
    const hasPhysics = () => !!(hk && scene.getPhysicsEngine());

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.70;
    env.lodGenerationOffset = 0.20;     // ぼかしすぎると油の照りが消える

    const camera = new BABYLON.ArcRotateCamera("cam", -2.04, 1.06, 46, new V3(0, 2.6, 0), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 2.6;
    camera.fov = 0.44;
    camera.minZ = 12.0;
    camera.maxZ = 260;                  // 既定の 10000 のままだと深度が潰れて DOF が効かない
    camera.lowerRadiusLimit = 26;
    camera.upperRadiusLimit = 210;
    camera.upperBetaLimit = 1.52;
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.36, -0.96, 0.42).normalize(), scene);
    key.position = new V3(20, 40, -22);
    key.intensity = 3.0;
    key.diffuse = new BABYLON.Color3(1.0, 0.978, 0.945);
    key.autoUpdateExtends = false;
    key.orthoLeft = -32; key.orthoRight = 32;
    key.orthoBottom = -32; key.orthoTop = 32;
    key.shadowMinZ = 1; key.shadowMaxZ = 110;

    // 拡散をほぼ 0 にして鏡面だけ足す灯。濡れた面に走る照りはこれでしか出ない
    const kick = new BABYLON.DirectionalLight("kick", new V3(0.58, -0.30, -1.0).normalize(), scene);
    kick.intensity = 0.85;
    kick.diffuse = new BABYLON.Color3(0.055, 0.052, 0.048);
    kick.specular = new BABYLON.Color3(1.0, 0.97, 0.92);

    const fill = new BABYLON.HemisphericLight("fill", new V3(-0.25, 1, -0.30), scene);
    fill.intensity = 0.34;
    fill.diffuse = new BABYLON.Color3(0.97, 0.975, 1.0);
    fill.groundColor = new BABYLON.Color3(0.34, 0.31, 0.27);
    fill.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0030;
    sg.normalBias = 0.010;
    sg.setDarkness(0.20);

    const tableTex = CFG.cloth ? clothTextures(scene, 4517) : woodTextures(scene, 8821);
    const table = BABYLON.MeshBuilder.CreateGround("table", { width: 240, height: 240 }, scene);
    named(table, "table");
    const tableMat = new BABYLON.PBRMaterial("tableMat", scene);
    tableMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    tableMat.albedoTexture = tableTex.albedo;
    tableMat.metallic = 0.0; tableMat.roughness = tableTex.rough;
    tableMat.metallicTexture = tableTex.orm;
    tableMat.useAmbientOcclusionFromMetallicTextureRed = true;
    tableMat.useRoughnessFromMetallicTextureGreen = true;
    tableMat.useMetallnessFromMetallicTextureBlue = true;
    tableMat.bumpTexture = tableTex.normal;
    tableMat.bumpTexture.level = tableTex.bump;
    for (const t of [tableTex.albedo, tableTex.orm, tableTex.normal]) {
        t.uScale = tableTex.uv; t.vScale = tableTex.uv;
    }
    table.material = tableMat;
    table.receiveShadows = true;

    // 盛り付けの座標系。カメラの向きを基準に「奥（f）」「右（r）」で置く
    const VF = [Math.cos(camera.alpha + Math.PI), Math.sin(camera.alpha + Math.PI)];
    const VR = [VF[1], -VF[0]];
    const PLATE_YAW = -Math.atan2(VR[1], VR[0]);
    function spot(f, r) { return [VF[0] * f + VR[0] * r, VF[1] * f + VR[1] * r]; }
    function dirOf(df, dr, dy) {
        return vnorm([VF[0] * df + VR[0] * dr, dy, VF[1] * df + VR[1] * dr]);
    }
    function onPlate(f, r, dy) {
        const p = spot(f, r);
        return [p[0], plateSurfaceY(p[0], p[1]) + (dy || 0), p[1]];
    }

    // ---- 物理まわりのヘルパ --------------------------------------------------

    // ローカル +Z を fwd に向ける姿勢
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

    // 凸包は重心方向へ少し縮めて内側に置く。等倍だと表示面からはみ出して隙間が見える
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

    // ---- マテリアル ---------------------------------------------------------

    const plateMatCache = {};
    let pankoMat = null, pankoTex = null;
    let ebiBodyMat = null, ebiBodyTex = null, ebiTailMat = null, ebiTailTex = null;
    let cabMat = null, lemonMat = null, tomatoMat = null, tartarMat = null;

    function getPlateMat(k) {
        if (!plateMatCache[k]) {
            plateMatCache[k] = plateMaterial(scene, SARA[k], "plateMat_" + k, 9001 + k.length * 71);
        }
        return plateMatCache[k];
    }
    function getPankoMat() {
        if (pankoMat) return pankoMat;
        pankoTex = pankoTextures(scene, CFG.seed ^ 0x5AC1);
        const m = new BABYLON.PBRMaterial("pankoMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = pankoTex.albedo;
        m.bumpTexture = pankoTex.normal;
        m.metallicTexture = pankoTex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.metallic = 0.0; m.roughness = 1.0;
        m.bumpTexture.level = 0.62;
        // 油の照り。均一だと濡れたプラスチックになるので控えめに、粗さで散らす
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.38;
        m.clearCoat.roughness = 0.30;
        m.clearCoat.indexOfRefraction = 1.47;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.13;
        m.subSurface.tintColor = new BABYLON.Color3(s2l(0.99), s2l(0.80), s2l(0.48));
        m.subSurface.minimumThickness = 0.02;
        m.subSurface.maximumThickness = 0.40;
        pankoMat = m;
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
        m.metallic = 0; m.roughness = 0.26;
        m.backFaceCulling = false;
        m.twoSidedLighting = true;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.40;
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
    function getCabbageMat() {
        if (cabMat) return cabMat;
        const m = new BABYLON.PBRMaterial("cabMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0; m.roughness = 0.44;
        m.backFaceCulling = false;
        m.twoSidedLighting = true;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.30;
        m.clearCoat.roughness = 0.22;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.40;   // 薄い葉は光を透かす
        m.subSurface.tintColor = new BABYLON.Color3(s2l(0.72), s2l(0.86), s2l(0.48));
        m.subSurface.minimumThickness = 0.01;
        m.subSurface.maximumThickness = 0.06;
        cabMat = m;
        return m;
    }
    function getLemonMat() {
        if (lemonMat) return lemonMat;
        const m = new BABYLON.PBRMaterial("lemonMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0; m.roughness = 0.38;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.55;
        m.clearCoat.roughness = 0.14;
        m.clearCoat.indexOfRefraction = 1.42;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.48;
        m.subSurface.tintColor = new BABYLON.Color3(s2l(0.97), s2l(0.82), s2l(0.34));
        m.subSurface.minimumThickness = 0.05;
        m.subSurface.maximumThickness = 1.20;
        lemonMat = m;
        return m;
    }
    function getTomatoMat() {
        if (tomatoMat) return tomatoMat;
        const m = new BABYLON.PBRMaterial("tomatoMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0; m.roughness = 0.22;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.92;
        m.clearCoat.roughness = 0.055;
        m.clearCoat.indexOfRefraction = 1.45;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.22;
        m.subSurface.tintColor = new BABYLON.Color3(s2l(0.90), s2l(0.22), s2l(0.10));
        m.subSurface.minimumThickness = 0.08;
        m.subSurface.maximumThickness = 0.90;
        tomatoMat = m;
        return m;
    }
    function getTartarMat() {
        if (tartarMat) return tartarMat;
        const m = new BABYLON.PBRMaterial("tartarMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0; m.roughness = 0.40;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.34;
        m.clearCoat.roughness = 0.20;
        m.clearCoat.indexOfRefraction = 1.44;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.30;
        m.subSurface.tintColor = new BABYLON.Color3(s2l(0.98), s2l(0.94), s2l(0.80));
        m.subSurface.minimumThickness = 0.02;
        m.subSurface.maximumThickness = 0.28;
        tartarMat = m;
        return m;
    }

    // ---- 組み立て -----------------------------------------------------------

    let state = null, onRebuilt = null, ssao = null;

    // 盛り付けの進行状態。1本ずつ落として、静止したら固定する
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
        if (parent) m.parent = parent;
        sg.addShadowCaster(m, true);
        return m;
    }

    // 盛り付けの設計図。f = 奥方向, r = 右方向（カメラ基準・cm）
    // fwd = 個体のローカル +Z（頭の向き）を向ける方向（df, dr, dy）
    // ここで決めるのは「どこへ、どの向きで放すか」だけ。高さと最終的な傾きは物理が解く
    // 頭側をわずかに内へ寄せた扇。外へ開くと付け合わせの上に乗り上げる
    const EBI_SPECS = [
        { f: 4.05, r: 0.10, fwd: [-0.995, -0.02, -0.28], s: 1.00, bend: 0.16, seed: 7919 },
        { f: 4.45, r: -3.15, fwd: [-0.988, 0.13, -0.25], s: 0.97, bend: 0.20, seed: 15838 },
        { f: 4.45, r: 3.30, fwd: [-0.988, -0.12, -0.25], s: 0.98, bend: 0.12, seed: 23757 },
        { f: 5.45, r: -5.95, fwd: [-0.960, 0.26, -0.18], s: 0.94, bend: 0.24, seed: 31676 },
        { f: 5.40, r: 6.05, fwd: [-0.960, -0.25, -0.18], s: 0.95, bend: 0.10, seed: 39595 }
    ];
    function pieceSpecs() {
        const n = clamp(Math.round(CFG.ebi), 1, 5);
        const L = [];
        // 奥（＝いちばん上に見える）ものから落とすと、手前の本が上に重なって自然に開く
        for (let i = 0; i < n; i++) L.push(EBI_SPECS[i]);
        return L;
    }

    // 1本ぶんの造形
    function buildPiece(spec, rng, nz, seed) {
        const gC = new Geo(), gB = new Geo(), gT = new Geo();
        const s = spec.s === undefined ? 1 : spec.s;
        buildEbiFry(gC, gB, gT, rng, nz, {
            tail: [0, 0, 0], head: [0, 0, EBI.len * s], scale: s,
            tailDir: vnorm([0, 0.78, -1]), tailBend: 0.58,
            bend: spec.bend, flakes: Math.round(CFG.panko * s),
            tone: rng.pm(0.11),               // 1本ごとの揚げ色の差。同じ色だと量産品に見える
            seed: (seed ^ spec.seed) >>> 0
        });
        const hullPts = ebiHullPoints(s, spec.bend);   // 尾の扇は当たり判定に入れない

        const root = new BABYLON.TransformNode("ebifry_" + (__uid++), scene);
        root.rotationQuaternion = quatFrom(dirOf(spec.fwd[0], spec.fwd[1], spec.fwd[2]), [0, 1, 0], 0);
        const p = spot(spec.f, spec.r);
        root.position.set(p[0], 0, p[1]);

        const meshes = [];
        const add = (g, nm, matFn) => {
            const m = meshOfGeo(g, nm, matFn, root);
            if (m) meshes.push(m);
        };
        add(gC, "panko", getPankoMat);
        add(gB, "ebiBody", getEbiBodyMat);
        add(gT, "ebiTail", getEbiTailMat);
        let tris = 0;
        for (const m of meshes) tris += m.tris;
        return { root: root, meshes: meshes, hullPts: hullPts, tris: tris, body: null, shape: null };
    }

    function buildFood(seed) {
        const t0 = performance.now();
        const rng = new Rng(seed ^ 0x7E4A);
        const nz = new Noise(seed ^ 0x2F71);
        const pieces = [];
        for (const spec of pieceSpecs()) pieces.push(buildPiece(spec, rng, nz, seed));
        return { pieces: pieces, ms: performance.now() - t0 };
    }

    // ---- 付け合わせ ---------------------------------------------------------

    const CAB = { f: 5.05, r: 0.40, rr: 5.10, rf: 2.80, h: 2.75 };

    // 付け合わせの定位置。エビの通り道（奥→手前の扇）を避けて手前の弧に並べる
    const GARN = {
        lemon: { f: -5.75, r: 2.00, ax: [0.00, 1.00, 0.02], len: 5.00, rad: 2.15 },
        tomato: { f: -0.75, r: 6.25, rad: 1.45 },
        tartar: { f: -3.50, r: -4.75, rad: 1.95, h: 1.15 }
    };

    // 付け合わせの当たりは楕円体で近似する。実形状で当てても得るものがない割に高い。
    // 同じ楕円体を「物理の静止体」と「手置きの接地高さ」の両方に使い、
    // 表示形状と当たりがずれてエビがめり込むのを防ぐ
    function garnishVol(c, ax, hx, hy, hz) {
        const e3 = vnorm(ax);
        let up = [0, 1, 0];
        if (Math.abs(vdot(e3, up)) > 0.999) up = [0, 0, 1];
        const e1 = vnorm(vcross(up, e3));      // 横
        const e2 = vnorm(vcross(e3, e1));      // 上
        const f = (d) => {
            const a = vdot(d, e1) / hx, b = vdot(d, e2) / hy, g = vdot(d, e3) / hz;
            return a * a + b * b + g * g;
        };
        let far = 0;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
            const px = c[0] + e1[0] * hx * sx + e2[0] * hy * sy + e3[0] * hz * sz;
            const pz = c[2] + e1[2] * hx * sx + e2[2] * hy * sy + e3[2] * hz * sz;
            far = Math.max(far, Math.hypot(px, pz));
        }
        return {
            c: c, e1: e1, e2: e2, e3: e3, h: [hx, hy, hz],
            rmin: Math.min(hx, hy, hz), far: far,
            q: (x, y, z) => f([x - c[0], y - c[1], z - c[2]]),
            // 水平位置 (x,z) で楕円体の上端を返す。二次方程式を y について解くだけ
            top: (x, z) => {
                const u = [x - c[0], 0, z - c[2]], w = [0, 1, 0];
                const A = f(w);
                const B = (vdot(u, e1) * e1[1] / (hx * hx) + vdot(u, e2) * e2[1] / (hy * hy)
                    + vdot(u, e3) * e3[1] / (hz * hz));
                const C = f(u) - 1;
                const D = B * B - A * C;
                if (D <= 0) return -1e9;
                return c[1] + (-B + Math.sqrt(D)) / A;
            }
        };
    }

    function addGarnishCollider(st, name, v) {
        v.tag = name.replace(/Col$/, "");
        st.vols.push(v);
        if (!hasPhysics()) return;
        const col = BABYLON.MeshBuilder.CreateSphere(name, {
            diameterX: v.h[0] * 2, diameterY: v.h[1] * 2, diameterZ: v.h[2] * 2, segments: 12
        }, scene);
        named(col, name);
        col.rotationQuaternion = quatFrom(v.e3, [0, 1, 0], 0);
        col.position.set(v.c[0], v.c[1], v.c[2]);
        col.isVisible = false;
        st.cols.push(col);
        st.colBodies.push(staticBody(col, 0.90));
    }

    function buildGarnish(st, seed) {
        const rng = new Rng(seed ^ 0x51C3);
        const nz = new Noise(seed ^ 0x0D71);
        const er = [VR[0], 0, VR[1]], ef = [VF[0], 0, VF[1]];
        st.garnish = [];
        st.cabTop = null;
        st.vols = []; st.cols = []; st.colBodies = [];
        st.cabVol = null; st.lateDone = false; st.lateMark = null;

        if (CFG.cabbage) {
            const p = spot(CAB.f, CAB.r);
            const at = [p[0], plateSurfaceY(p[0], p[1]) + 0.04, p[1]];
            const g = new Geo();
            buildCabbage(g, rng, nz, {
                at: at, er: er, ef: ef, rr: CAB.rr, rf: CAB.rf, h: CAB.h,
                count: Math.round(CFG.cabCount)
            });
            const m = meshOfGeo(g, "cabbage", getCabbageMat, null);
            st.garnish.push(m);
            // 山の高さを返す関数。エビを落とす高さの計算に使う
            st.cabTop = (x, z) => {
                const dx = x - at[0], dz = z - at[2];
                const X = dx * er[0] + dz * er[2], Z = dx * ef[0] + dz * ef[2];
                const q = Math.pow(X / CAB.rr, 2) + Math.pow(Z / CAB.rf, 2);
                if (q >= 1) return -1e9;
                return at[1] + CAB.h * Math.sqrt(1 - q);
            };
            st.cabVol = garnishVol([at[0], at[1], at[2]], ef,
                CAB.rr * 0.97, CAB.h * 0.96, CAB.rf * 0.97);
            if (hasPhysics()) {
                // 見えない楕円体でエビを受ける。キャベツ1本1本に当たりをつけるのは無駄
                const col = BABYLON.MeshBuilder.CreateSphere("cabCol", {
                    diameterX: CAB.rr * 1.94, diameterY: CAB.h * 1.92, diameterZ: CAB.rf * 1.94,
                    segments: 12
                }, scene);
                named(col, "cabCol");
                col.rotationQuaternion = quatFrom(ef, [0, 1, 0], 0);
                col.position.set(at[0], at[1], at[2]);
                col.isVisible = false;
                st.cabCol = col;
                st.cabColBody = staticBody(col, 0.95);
            }
        }
        if (CFG.tartar) {
            const G = GARN.tartar, p = spot(G.f, G.r);
            const at = [p[0], plateSurfaceY(p[0], p[1]), p[1]];
            const g = new Geo();
            buildTartar(g, rng, nz, { at: at, r: G.rad, h: G.h, yaw: 0.6 });
            st.garnish.push(meshOfGeo(g, "tartar", getTartarMat, null));
            addGarnishCollider(st, "tartarCol",
                garnishVol([at[0], at[1], at[2]], [0, 0, 1], G.rad, G.h, G.rad));
        }
        let tris = 0;
        for (const m of st.garnish) if (m) tris += m.tris;
        st.garnishTris = tris;
    }

    // ---- 盛り付けたあとに置く付け合わせ（レモン・プチトマト） ----------------

    // エビがどこで止まるかは物理任せなので、位置を決め打ちにするとぶつかる。
    // 盛り終わってから、実際に空いている場所を探して置く
    // 代理点（凸包用の13×8点）は粗すぎて、立ったパン粉や尾の扇を取りこぼす。
    // 衣と尾の頂点そのものを格子に焼いて「塞がっている升目」の地図を作る
    const OCC = {
        cell: 0.30, lo: -11.4, yLo: 0.0,
        n: Math.ceil(22.8 / 0.30), ny: Math.ceil(11.0 / 0.30)
    };
    function occupancy(st) {
        const g = new Uint8Array(OCC.n * OCC.n * OCC.ny);
        const put = (x, y, z) => {
            const i = Math.floor((x - OCC.lo) / OCC.cell);
            const k = Math.floor((z - OCC.lo) / OCC.cell);
            const j = Math.floor((y - OCC.yLo) / OCC.cell);
            if (i < 0 || k < 0 || j < 0 || i >= OCC.n || k >= OCC.n || j >= OCC.ny) return;
            g[(j * OCC.n + k) * OCC.n + i] = 1;
        };
        for (const p of (st.pieces || [])) {
            p.root.computeWorldMatrix(true);
            for (const m of p.meshes) {
                m.computeWorldMatrix(true);
                const M = m.getWorldMatrix();
                const P = m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
                if (!P) continue;
                for (let i = 0; i < P.length; i += 3) {
                    BABYLON.Vector3.TransformCoordinatesFromFloatsToRef(P[i], P[i + 1], P[i + 2], M, _bv);
                    put(_bv.x, _bv.y, _bv.z);
                }
            }
        }
        // 楕円体で持っている物（タルタル・キャベツの山）は中身ごと塗る
        const fill = (v) => {
            if (!v) return;
            const h = Math.max(v.h[0], v.h[1], v.h[2]);
            for (let x = v.c[0] - h; x <= v.c[0] + h; x += OCC.cell) {
                for (let z = v.c[2] - h; z <= v.c[2] + h; z += OCC.cell) {
                    for (let y = Math.max(OCC.yLo, v.c[1] - h); y <= v.c[1] + h; y += OCC.cell) {
                        if (v.q(x, y, z) <= 1) put(x, y, z);
                    }
                }
            }
        };
        for (const v of st.vols) fill(v);
        fill(st.cabVol);
        return g;
    }

    // want = ほしい余裕 cm。升目の中心で測るので、対角の半分ぶん厳しくしておく
    const OCC_SLOP = 0.5 * OCC.cell * Math.sqrt(3);
    function clearanceAt(g, v, stop) {
        const h = Math.max(v.h[0], v.h[1], v.h[2]) + 1.0;
        const i0 = Math.max(0, Math.floor((v.c[0] - h - OCC.lo) / OCC.cell));
        const i1 = Math.min(OCC.n - 1, Math.ceil((v.c[0] + h - OCC.lo) / OCC.cell));
        const k0 = Math.max(0, Math.floor((v.c[2] - h - OCC.lo) / OCC.cell));
        const k1 = Math.min(OCC.n - 1, Math.ceil((v.c[2] + h - OCC.lo) / OCC.cell));
        const j0 = Math.max(0, Math.floor((v.c[1] - h - OCC.yLo) / OCC.cell));
        const j1 = Math.min(OCC.ny - 1, Math.ceil((v.c[1] + h - OCC.yLo) / OCC.cell));
        let worst = 1e9;
        for (let j = j0; j <= j1; j++) {
            const y = OCC.yLo + (j + 0.5) * OCC.cell;
            for (let k = k0; k <= k1; k++) {
                const z = OCC.lo + (k + 0.5) * OCC.cell;
                const row = (j * OCC.n + k) * OCC.n;
                for (let i = i0; i <= i1; i++) {
                    if (!g[row + i]) continue;
                    const x = OCC.lo + (i + 0.5) * OCC.cell;
                    const d = (Math.sqrt(v.q(x, y, z)) - 1) * v.rmin - OCC_SLOP;
                    if (d < worst) { worst = d; if (worst < stop) return worst; }
                }
            }
        }
        return worst;
    }

    // 総当たりは升目走査が効くとはいえ数が多い。まず真上から見た占有図の
    // 距離変換で「明らかに近すぎる」候補を弾いてから、立体で測る
    function column2D(g) {
        const N = OCC.n, d = new Float32Array(N * N);
        for (let k = 0; k < N; k++) {
            for (let i = 0; i < N; i++) {
                let hit = 0;
                for (let j = 0; j < OCC.ny; j++) { if (g[(j * N + k) * N + i]) { hit = 1; break; } }
                d[k * N + i] = hit ? 0 : 1e9;
            }
        }
        const c = OCC.cell, dg = c * 1.4142;
        for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) {
            let v = d[k * N + i];
            if (k > 0) { v = Math.min(v, d[(k - 1) * N + i] + c); if (i > 0) v = Math.min(v, d[(k - 1) * N + i - 1] + dg); if (i < N - 1) v = Math.min(v, d[(k - 1) * N + i + 1] + dg); }
            if (i > 0) v = Math.min(v, d[k * N + i - 1] + c);
            d[k * N + i] = v;
        }
        for (let k = N - 1; k >= 0; k--) for (let i = N - 1; i >= 0; i--) {
            let v = d[k * N + i];
            if (k < N - 1) { v = Math.min(v, d[(k + 1) * N + i] + c); if (i > 0) v = Math.min(v, d[(k + 1) * N + i - 1] + dg); if (i < N - 1) v = Math.min(v, d[(k + 1) * N + i + 1] + dg); }
            if (i < N - 1) v = Math.min(v, d[k * N + i + 1] + c);
            d[k * N + i] = v;
        }
        return d;
    }

    // want に届く場所が無ければ loose で呼び直す。そのときは余裕だけを最大化する
    function findSpot(g, make, angs, want, loose) {
        let best = null;
        const d2 = column2D(g);
        const at2 = (x, z) => {
            const i = Math.floor((x - OCC.lo) / OCC.cell), k = Math.floor((z - OCC.lo) / OCC.cell);
            if (i < 0 || k < 0 || i >= OCC.n || k >= OCC.n) return 0;
            return d2[k * OCC.n + i];
        };
        for (let f = -8.4; f <= 3.3; f += 0.25) {
            for (let r = -8.4; r <= 8.4; r += 0.25) {
                for (const a of angs) {
                    const v = make(f, r, a);
                    if (v.far > 8.55) continue;
                    // 真上から見て中心が塞がっていれば、立体で測るまでもない。
                    // 高さ方向は潰れた図なので、絞りは中心だけに留める（浅く弾きすぎない）
                    if (at2(v.c[0], v.c[2]) < want) continue;
                    const c = clearanceAt(g, v, want);
                    if (c < want) continue;
                    // 余裕はほどほどでよい。それより手前（＝見える側）を優先する
                    const sc = loose ? c : (Math.min(c, 1.0) * 0.8 - f * 0.55);
                    if (!best || sc > best.sc) best = { sc: sc, v: v, f: f, r: r, a: a, clear: c };
                }
            }
        }
        return best;
    }

    // 盛り直すときは、あとから置いた物も一度どけて置き直す
    function disposeLateGarnish(st) {
        const k = st && st.lateMark;
        if (!k) return;
        for (let i = k.b; i < st.colBodies.length; i++) {
            try { st.colBodies[i] && st.colBodies[i].dispose(); } catch (e) { }
        }
        for (let i = k.c; i < st.cols.length; i++) st.cols[i].dispose();
        for (let i = k.g; i < st.garnish.length; i++) if (st.garnish[i]) st.garnish[i].dispose();
        // 配列が作り直されていることがあるので、伸ばす方向には触らない
        st.colBodies.length = Math.min(k.b, st.colBodies.length);
        st.cols.length = Math.min(k.c, st.cols.length);
        st.garnish.length = Math.min(k.g, st.garnish.length);
        st.vols.length = Math.min(k.v, st.vols.length);
        st.lateMark = null; st.lateDone = false;
    }

    function buildLateGarnish(st, seed) {
        if (st.lateDone) return;
        st.lateDone = true;
        st.lateMark = {
            g: st.garnish.length, v: st.vols.length,
            c: st.cols.length, b: st.colBodies.length
        };
        if (!CFG.lemon && !CFG.tomato) return;
        const rng = new Rng(seed ^ 0x2A17);
        const nz = new Noise(seed ^ 0x6B3D);
        const occ = occupancy(st);

        if (CFG.lemon) {
            const G = GARN.lemon, R = G.rad;
            const mk = (f, r, a) => {
                const p = spot(f, r);
                const at = [p[0], plateSurfaceY(p[0], p[1]) + R * 0.94, p[1]];
                const ax = dirOf(Math.cos(a), Math.sin(a), 0.02);
                // くし形は芯（at）が上、丸い皮が下。当たりの中心は半径ぶん下がる
                const v = garnishVol([at[0], at[1] - R * 0.56, at[2]], ax,
                    R * 0.56, R * 0.60, G.len * 0.47);
                v.at = at; v.ax = ax;
                return v;
            };
            const angs = [];
            for (let a = 0; a < Math.PI; a += Math.PI / 12) angs.push(a);
            const hit = findSpot(occ, mk, angs, 0.22)
                || findSpot(occ, mk, angs, -99, true)
                || { v: mk(G.f, G.r, Math.atan2(G.ax[1], G.ax[0])) };
            const v = hit.v;
            const g = new Geo();
            buildLemon(g, rng, nz, {
                at: v.at, axis: v.ax, up: [0, 1, 0], len: G.len, rad: R, span: 0.52
            });
            st.garnish.push(meshOfGeo(g, "lemon", getLemonMat, null));
            addGarnishCollider(st, "lemonCol", v);
            {                                    // 置いたレモンも升目に焼く。次（トマト）がよける
                const h = Math.max(v.h[0], v.h[1], v.h[2]);
                for (let x = v.c[0] - h; x <= v.c[0] + h; x += OCC.cell) {
                    for (let z = v.c[2] - h; z <= v.c[2] + h; z += OCC.cell) {
                        for (let y = Math.max(0, v.c[1] - h); y <= v.c[1] + h; y += OCC.cell) {
                            if (v.q(x, y, z) > 1) continue;
                            const i = Math.floor((x - OCC.lo) / OCC.cell);
                            const k = Math.floor((z - OCC.lo) / OCC.cell);
                            const j = Math.floor((y - OCC.yLo) / OCC.cell);
                            if (i < 0 || k < 0 || j < 0 || i >= OCC.n || k >= OCC.n || j >= OCC.ny) continue;
                            occ[(j * OCC.n + k) * OCC.n + i] = 1;
                        }
                    }
                }
            }
        }
        if (CFG.tomato) {
            const G = GARN.tomato, R = G.rad;
            const mk = (f, r) => {
                const p = spot(f, r);
                const at = [p[0], plateSurfaceY(p[0], p[1]) + R * 0.84, p[1]];
                const v = garnishVol(at, [0, 0, 1], R * 1.01, R * 0.98, R * 1.01);
                v.at = at;
                return v;
            };
            const hit = findSpot(occ, mk, [0], 0.22)
                || findSpot(occ, mk, [0], -99, true)
                || { v: mk(G.f, G.r) };
            const v = hit.v;
            const g = new Geo();
            buildTomato(g, rng, nz, { at: v.at, r: R });
            st.garnish.push(meshOfGeo(g, "tomato", getTomatoMat, null));
            addGarnishCollider(st, "tomatoCol", v);
        }
        let tris = 0;
        for (const m of st.garnish) if (m) tris += m.tris;
        st.garnishTris = tris;
    }

    // ---- 落として盛る -------------------------------------------------------

    // メッシュの境界箱は回転すると実際よりかなり大きく出るので、
    // 当たり判定に使う代理点をワールドに移してから測る
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

    function groundY(x, z) {
        let y = plateSurfaceY(x, z);
        if (state && state.cabTop) y = Math.max(y, state.cabTop(x, z));
        if (state && state.vols) {
            for (const v of state.vols) { const t = v.top(x, z); if (t > y) y = t; }
        }
        return y;
    }

    // 投入高さは山全体の頂点ではなく、水平方向に重なっている物だけを見る。
    // 全体の頂点を基準にすると、端に添える物まで山の高さぶん持ち上がる
    function placePiece(p, gap, cap) {
        p.root.position.y = 0;
        p.root.computeWorldMatrix(true);
        const b = pieceBounds(p);
        let floor = groundY(p.root.position.x, p.root.position.z);
        // 代理点の真下をなめて、いちばん高い接地面を拾う。
        // キャベツの山にまたがる物は、山の高さから放さないと初期状態でめり込む
        if (p.hullPts) {
            const M = p.root.getWorldMatrix();
            for (let i = 0; i < p.hullPts.length; i += 4) {
                const q = p.hullPts[i];
                BABYLON.Vector3.TransformCoordinatesFromFloatsToRef(q[0], q[1], q[2], M, _bv);
                floor = Math.max(floor, groundY(_bv.x, _bv.z));
            }
        }
        let base = floor;
        for (const q of plating.live) {
            const qb = pieceBounds(q);
            if (qb.max.x < b.min.x || qb.min.x > b.max.x) continue;
            if (qb.max.z < b.min.z || qb.min.z > b.max.z) continue;
            base = Math.max(base, qb.max.y);
        }
        if (cap !== undefined) base = Math.min(base, floor + cap);
        p.root.position.y = base + gap - b.min.y;
        p.root.computeWorldMatrix(true);
    }

    function spawnPiece(p) {
        for (const m of p.meshes) m.setEnabled(true);
        placePiece(p, PHYS.gap);
        if (!hasPhysics() || !p.hullPts) { plating.live.push(p); return; }
        p.shape = hullShape("col_ebifry", p.hullPts);
        // 質量は形状から密度1で自動計算させる。食材の密度はほぼ水なのでこれで合う
        p.body = new BABYLON.PhysicsBody(p.root, BABYLON.PhysicsMotionType.DYNAMIC, false, scene);
        p.body.shape = p.shape;
        p.body.setLinearDamping(0.16);
        p.body.setAngularDamping(0.92);
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
        buildLateGarnish(state, CFG.seed);     // 空いた場所を見てからレモンとトマトを置く
        plating.ms = performance.now() - plating.t0;
        if (onRebuilt) onRebuilt(state);
    }

    function startPlating(pieces) {
        disposeLateGarnish(state);
        plating.queue = pieces.slice();
        plating.live = [];
        plating.t = 0; plating.next = 0; plating.calm = 0; plating.sinceLast = 0;
        plating.t0 = performance.now();
        for (const p of pieces) {
            for (const m of p.meshes) m.setEnabled(false);
            if (p.root.rotationQuaternion === null) {
                p.root.rotationQuaternion = BABYLON.Quaternion.FromEulerVector(p.root.rotation);
                p.root.rotation.set(0, 0, 0);
            }
        }
        if (!hasPhysics() || !CFG.physics) {
            // フォールバック: 直下の物の上へ順に置くだけ。空の皿を出すよりまし
            plating.mode = hasPhysics() ? "手置き" : "手置き（Havok なし）";
            while (plating.queue.length) {
                const p = plating.queue.shift();
                for (const m of p.meshes) m.setEnabled(true);
                placePiece(p, 0.02, 1.40);
                plating.live.push(p);
            }
            plating.active = false; plating.done = true;
            buildLateGarnish(state, CFG.seed);
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
        if (st.garnish) {
            for (const m of st.garnish) if (m) m.dispose();
            st.garnish = null;
        }
        if (st.cabColBody) { try { st.cabColBody.dispose(); } catch (e) { } st.cabColBody = null; }
        if (st.cabCol) { st.cabCol.dispose(); st.cabCol = null; }
        if (st.colBodies) { for (const b of st.colBodies) { try { b && b.dispose(); } catch (e) { } } }
        if (st.cols) { for (const m of st.cols) m.dispose(); }
        st.cols = []; st.colBodies = []; st.vols = [];
        st.cabTop = null;
    }

    function ensureTable(st) {
        if (!hasPhysics() || st.tableCol) return;
        // 薄いコライダーはすり抜けられるので、卓は厚い箱で作る
        const box = BABYLON.MeshBuilder.CreateBox("tableCol", { width: 220, height: 4, depth: 220 }, scene);
        named(box, "tableCol");
        box.position.y = -2;
        box.isVisible = false;
        st.tableCol = box;
        st.tableBody = new BABYLON.PhysicsAggregate(box, BABYLON.PhysicsShapeType.BOX,
            { mass: 0, friction: 0.80, restitution: 0.01 }, scene);
    }

    function rebuildPlate(st) {
        if (st.plateBody) { try { st.plateBody.dispose(); } catch (e) { } st.plateBody = null; }
        if (st.plate) { st.plate.dispose(); st.plate = null; }
        st.plate = buildPlate(scene, getPlateMat(CFG.sara));
        st.plate.rotation.y = PLATE_YAW;
        sg.addShadowCaster(st.plate, true);
        st.plateBody = staticBody(st.plate, 0.70);
    }

    function build(full) {
        const t0 = performance.now();
        state = state || {};
        ensureTable(state);
        if (!state.plate) rebuildPlate(state);
        state.plate.material = getPlateMat(CFG.sara);

        if (full) {
            disposeFood(state);
            buildGarnish(state, CFG.seed);
            const c = buildFood(CFG.seed);
            state.pieces = c.pieces;
            state.foodMs = c.ms;
            startPlating(state.pieces);
        }
        state.buildMs = performance.now() - t0;
        scene.__ebifry = state;          // 検証スクリプトから覗くための口
        if (onRebuilt) onRebuilt(state);
    }

    build(true);

    // ---- ポストプロセス -----------------------------------------------------

    if (CFG.ssao) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.70;
        ssao.totalStrength = 0.16;
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
    dp.sharpen.edgeAmount = 0.12;
    dp.depthOfFieldEnabled = CFG.dof;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.High;
    dp.depthOfField.lensSize = 50;
    dp.depthOfField.fStop = CFG.dofFStop;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.10;
    ip.contrast = 1.04;
    ip.vignetteEnabled = false;

    // 錯乱円は「シーン単位 × 1000 = mm」で計算される。cm 系なので合焦距離も ×1000。
    // 焦点距離を合焦距離の一定比にすると、寄っても引いてもボケ量が変わらない
    scene.onBeforeRenderObservable.add(() => {
        if (!dp.depthOfFieldEnabled) return;
        const focus = camera.radius * 1000;
        dp.depthOfField.focusDistance = focus;
        dp.depthOfField.focalLength = focus * CFG.dofRatio;
    });

    // ---- GUI ---------------------------------------------------------------

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
        else ui.layer.applyPostProcess = false;   // 専用カメラなしで UI をボケから守る
    }
    ui.idealWidth = 1400;
    ui.renderAtIdealSize = true;

    const COL = {
        idle: "#2b2926", active: "#7d5a30", edge: "#4a463e",
        text: "#f3ede1", sub: "#a8a193", accent: "#e8c99a"
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
    function addToggle(name, label, get, set, after) {
        const b = addButton(name, label + ": " + (get() ? "ON" : "OFF"), () => {
            set(!get());
            b.textBlock.text = label + ": " + (get() ? "ON" : "OFF");
            b.background = get() ? COL.active : COL.idle;
            if (after) after(); else build(true);
        });
        b.background = get() ? COL.active : COL.idle;
        return b;
    }
    function addCount(name, label, unit, min, max, get, set) {
        const txt = () => label + ": " + get() + unit;
        const b = addButton(name, txt(), () => {
            set(get() >= max ? min : get() + 1);
            b.textBlock.text = txt();
            build(true);
        });
        b.background = COL.active;
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

    addLabel("EBI FRY / エビフライ", 11, COL.sub, "30px");

    const saraBtns = {};
    function highlight() {
        for (const k in saraBtns) saraBtns[k].background = (k === CFG.sara) ? COL.active : COL.idle;
    }
    addLabel("器", 13, COL.accent, "22px");
    for (const k of Object.keys(SARA)) {
        saraBtns[k] = addButton("s_" + k, SARA[k].label, () => {
            CFG.sara = k;
            state.plate.material = getPlateMat(k);
            highlight();
        });
    }
    highlight();
    addToggle("flute", "皿の鎬", () => CFG.flute, (v) => { CFG.flute = v; }, () => {
        rebuildPlate(state);              // 形が変わるので皿だけ作り直す
        if (onRebuilt) onRebuilt(state);
    });

    addSpacer();
    addLabel("盛り", 13, COL.accent, "22px");
    addCount("ebi", "エビフライ", "本", 1, 5, () => CFG.ebi, (v) => { CFG.ebi = v; });
    addToggle("cabbage", "千切りキャベツ", () => CFG.cabbage, (v) => { CFG.cabbage = v; });
    addToggle("lemon", "レモン", () => CFG.lemon, (v) => { CFG.lemon = v; });
    addToggle("tomato", "プチトマト", () => CFG.tomato, (v) => { CFG.tomato = v; });
    addToggle("tartar", "タルタル", () => CFG.tartar, (v) => { CFG.tartar = v; });

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
    addButton("reseed", "揚げ直す", () => {
        CFG.seed = (CFG.seed * 1664525 + 1013904223) >>> 0;
        build(true);
    });

    addSpacer();
    const tableTexHolder = { t: tableTex };
    const tableBtn = addButton("table", "卓: " + (CFG.cloth ? "布" : "板"), () => {
        CFG.cloth = !CFG.cloth;
        const old = tableTexHolder.t;
        const nt = CFG.cloth ? clothTextures(scene, 4517) : woodTextures(scene, 8821);
        tableMat.albedoTexture = nt.albedo;
        tableMat.metallicTexture = nt.orm;
        tableMat.bumpTexture = nt.normal;
        tableMat.bumpTexture.level = nt.bump;
        tableMat.roughness = nt.rough;
        for (const t of [nt.albedo, nt.orm, nt.normal]) { t.uScale = nt.uv; t.vScale = nt.uv; }
        tableTexHolder.t = nt;
        for (const k of ["albedo", "orm", "normal"]) old[k].dispose();
        tableBtn.textBlock.text = "卓: " + (CFG.cloth ? "布" : "板");
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

    const info = addLabel("", 12, COL.sub, "112px");
    onRebuilt = (st) => {
        let tri = 0;
        if (st.plate && st.plate.tris) tri += st.plate.tris;
        tri += st.garnishTris || 0;
        if (st.pieces) for (const p of st.pieces) tri += p.tris;
        const n = st.pieces ? st.pieces.length : 0;
        info.text = "丸皿 直径 " + (PLATE.halfX * 2).toFixed(0) + "cm"
            + " / エビフライ " + n + "本\n"
            + "身 " + EBI.len.toFixed(1) + "cm・衣 " + (EBI.panko * 10).toFixed(1) + "mm\n"
            + tri.toLocaleString() + " tri\n"
            + "盛り付け " + plating.mode + " "
            + (plating.done ? (plating.ms || 0).toFixed(0) + "ms で静止" : "落下中…") + "\n"
            + "造形 " + (st.foodMs || 0).toFixed(0) + "ms / 全体 " + (st.buildMs || 0).toFixed(0) + "ms\n"
            + "seed: " + CFG.seed;
    };
    onRebuilt(state);
    scene.onBeforeRenderObservable.add(() => {
        if (plating.active && onRebuilt) onRebuilt(state);
    });

    console.log("[EbiFry] build ebifry-2026-09-21-d",
        "| ebi=" + CFG.ebi, "| physics=" + (hasPhysics() && CFG.physics),
        "| ms=" + state.buildMs.toFixed(0));

    scene.onDisposeObservable.add(() => {
        for (const k in plateMatCache) {
            const m = plateMatCache[k];
            if (m.texs) for (const t of m.texs) t.dispose();
            m.dispose(true, false);
        }
        for (const s of [tableTexHolder.t, pankoTex, ebiBodyTex]) {
            if (s) for (const t of [s.albedo, s.orm, s.normal]) { if (t) t.dispose(); }
        }
        if (ebiTailTex) ebiTailTex.dispose();
    });

    return scene;
};

export default createScene;