// 照り焼きチキン — Babylon.js Playground (JavaScript)
// 全文を貼り付けて Run。左上 ≡ で照り・切り数・ごま・皿を変更。
// 鶏もも1枚を皮目から焼いてたれを絡め、一口大に切って皿に並べた状態。
// 形状とテクスチャはすべて手続き生成。HDR照明も含めてコード内で生成。外部画像・モデルは不要。

var createScene = async function () {
    // =================================================================
    // 0. CONFIG （単位は cm）
    // =================================================================
    const BUILD = "teriyaki-garnish-contact-2026-11-08";

    // 色は sRGB。参考写真の皮（ハイライトを避けた所）から取った値
    // hi = 水ぶくれの頂点（たれが薄い）、gold/amber = 皮の地、dark = たれが溜まった谷、burnt = 焦げ。char は焦げの量
    const PRESETS = {
        hyojun: {
            label: "標準", glaze: 0.92, char: 0.65,
            hi: [0.94, 0.61, 0.25], gold: [0.85, 0.43, 0.13], amber: [0.65, 0.26, 0.065],
            dark: [0.33, 0.095, 0.024], burnt: [0.16, 0.043, 0.015]
        },
        kotteri: {
            label: "こってり", glaze: 1.22, char: 0.70,
            hi: [0.78, 0.42, 0.13], gold: [0.62, 0.28, 0.07], amber: [0.44, 0.16, 0.04],
            dark: [0.25, 0.08, 0.02], burnt: [0.12, 0.05, 0.02]
        },
        assari: {
            label: "あっさり", glaze: 0.82, char: 0.35,
            hi: [0.92, 0.62, 0.26], gold: [0.82, 0.46, 0.14], amber: [0.64, 0.30, 0.08],
            dark: [0.40, 0.16, 0.04], burnt: [0.20, 0.08, 0.03]
        }
    };
    // 切断面と側面の肉
    const MEAT = [0.98, 0.87, 0.73];        // 火の通った内側（茶みのあるピンク）
    const SOAK = [0.86, 0.65, 0.42];        // 皮の近く、たれと肉汁が染みた所
    const FAT = [0.92, 0.84, 0.66];         // 皮の下の脂（薄い層）
    const MEAT_OUT = [0.78, 0.54, 0.36];    // 外側の肉（鍋に当たった側面）
    const SEAR = [0.58, 0.34, 0.17];        // 焼き付いた所
    const SAUCE_MEAT = [0.42, 0.17, 0.05];  // 肉の上を流れたたれ（濃い）

    const GLOBAL = {
        slices: 7,
        // 鶏もも1枚：長さ 約14、幅 約9、厚み 約2.5（薄めに開いた1枚）
        A: 6.9, B: 4.5, Tmax: 2.45,
        NT: 224,                // 断面一周の分割
        ringStep: 0.055,         // 掃引の輪の間隔（長手方向）
        texW: 1024, texH: 512,   // 皮のテクスチャ（u = 長手、v = 断面一周）。1枚で全切り身が共有する
        cutTex: 512,            // 切断面のディテール（タイル）

        // 並べ方：切り身をドミノ状に寝かせ、隣に寄りかからせる。gap は初期値で、
        // 隣への食い込みを押し出して解消したあとの間隔は接触で決まる
        gap: 0.12,
        lean: 0.29,             // 寝かせる角度（rad）
        fanR: 72,               // 扇の半径
        originX: -1.4, originZ: -0.8,

        sesame: true, sesameCount: 56,
        scallion: true, scallionCount: 16,

        plateR: 12.3, plateTexW: 2048, plateTexH: 512,

        useSSAO: true,
        useDOF: true,
        dofRatio: 0.070,
        dofFStop: 2.8,
        guiOwnCamera: false,    // true で GUI 専用カメラ（Inspector の表示が崩れる）

        compactWidth: 700,
        compactMinSide: 480,
        guiMaxScale: 2.2
    };

    const START_PRESET = "hyojun";
    const START_SEED = 20261107;

    const V3 = BABYLON.Vector3;
    const C3 = BABYLON.Color3;
    const TAU = Math.PI * 2;
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const gauss = (x, w) => Math.exp(-(x / w) * (x / w));
    const lin = (v) => Math.pow(clamp(v, 0, 1), 2.2);   // 頂点カラーはリニア
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
        // 閉じた立体の表面は 3D で評価する（UV の継ぎ目が出ない）
        v3(x, y, z, seed) {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            const xf = x - xi, yf = y - yi, zf = z - zi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
            const h = (i, j, k) => this._h3(xi + i, yi + j, zi + k, seed);
            const x00 = h(0, 0, 0) + (h(1, 0, 0) - h(0, 0, 0)) * u;
            const x10 = h(0, 1, 0) + (h(1, 1, 0) - h(0, 1, 0)) * u;
            const x01 = h(0, 0, 1) + (h(1, 0, 1) - h(0, 0, 1)) * u;
            const x11 = h(0, 1, 1) + (h(1, 1, 1) - h(0, 1, 1)) * u;
            const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
            return y0 + (y1 - y0) * w;
        },
        fbm3(x, y, z, seed, oct) {
            let s = 0, a = 0.5, f = 1, n = 0;
            for (let o = 0; o < oct; o++) { s += a * this.v3(x * f, y * f, z * f, seed + o * 131); n += a; f *= 2; a *= 0.5; }
            return s / n;
        }
    };

    function makeTex(scene, base, W, H, fill, linear) {
        W = Math.max(8, Math.round(W) || 512); H = Math.max(8, Math.round(H) || 512);
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

    // 高さ場 → 法線マップ（u 方向は x、v 方向は一周。v は閉じている）
    function bakeNormal(scene, base, W, H, hgt, kx, kyOf, wrapV) {
        return makeTex(scene, base, W, H, (d) => {
            for (let j = 0; j < H; j++) {
                const ju = wrapV ? (j - 1 + H) % H : Math.max(0, j - 1);
                const jd = wrapV ? (j + 1) % H : Math.min(H - 1, j + 1);
                for (let i = 0; i < W; i++) {
                    const il = (i - 1 + W) % W, ir = (i + 1) % W;
                    const ky = kyOf(i);
                    let nx = (hgt[j * W + il] - hgt[j * W + ir]) * kx;
                    let ny = (hgt[jd * W + i] - hgt[ju * W + i]) * ky;
                    let nz = 1;
                    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                    const o = (j * W + i) * 4;
                    d[o] = (nx * 0.5 + 0.5) * 255; d[o + 1] = (ny * 0.5 + 0.5) * 255;
                    d[o + 2] = (nz * 0.5 + 0.5) * 255; d[o + 3] = 255;
                }
            }
        }, true);
    }

    // 巻き順を実行時に判定して法線を計算（全頂点の総和で外向きか見る）
    function finishClosed(pos, idx) {
        let normals = new Float32Array(pos.length);
        BABYLON.VertexData.ComputeNormals(pos, idx, normals);
        const nv = pos.length / 3;
        let gx = 0, gy = 0, gz = 0;
        for (let i = 0; i < nv; i++) { gx += pos[i * 3]; gy += pos[i * 3 + 1]; gz += pos[i * 3 + 2]; }
        gx /= nv; gy /= nv; gz /= nv;
        let sum = 0;
        for (let i = 0; i < nv; i++) {
            sum += normals[i * 3] * (pos[i * 3] - gx) + normals[i * 3 + 1] * (pos[i * 3 + 1] - gy) + normals[i * 3 + 2] * (pos[i * 3 + 2] - gz);
        }
        if (sum < 0) {
            for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
            normals = new Float32Array(pos.length);
            BABYLON.VertexData.ComputeNormals(pos, idx, normals);
        }
        return normals;
    }
    // 同じ位置にある頂点の法線を平均（継ぎ目の筋を消す）
    function weld(normals, list) {
        let x = 0, y = 0, z = 0;
        for (const i of list) { x += normals[i * 3]; y += normals[i * 3 + 1]; z += normals[i * 3 + 2]; }
        const l = Math.hypot(x, y, z) || 1;
        for (const i of list) { normals[i * 3] = x / l; normals[i * 3 + 1] = y / l; normals[i * 3 + 2] = z / l; }
    }
    // Babylon の ComputeNormals と同じ向きの定義で三角形の法線を求める
    function triNormal(pos, a, b, c) {
        const ax = pos[a * 3] - pos[b * 3], ay = pos[a * 3 + 1] - pos[b * 3 + 1], az = pos[a * 3 + 2] - pos[b * 3 + 2];
        const cx = pos[c * 3] - pos[b * 3], cy = pos[c * 3 + 1] - pos[b * 3 + 1], cz = pos[c * 3 + 2] - pos[b * 3 + 2];
        return [ay * cz - az * cy, az * cx - ax * cz, ax * cy - ay * cx];
    }
    function flipIdx(idx) {
        for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
    }

    // =================================================================
    // 2. 鶏ももの形
    // =================================================================
    // 焼く前に開いた1枚を、皮を上にして置いた姿勢で作る：x が長手、y が上（y = 0 が鍋に当たる面）、z が幅。
    // 平面形は歪んだ楕円、厚みは中央で厚く端で薄い。断面は「平らな底 → 側面 → 皮が巻き込む丸い肩 → 上面」。
    class ThighShape {
        constructor(seed) {
            const G = GLOBAL, r = new Rng(seed);
            this.A = G.A * r.range(0.95, 1.05);
            this.B = G.B * r.range(0.94, 1.06);
            this.T = G.Tmax * r.range(0.92, 1.06);
            this.asym = r.range(-0.18, 0.18);      // どちらの端が細いか
            this.bow = r.range(-0.6, 0.6);         // 平面で見た反り
            this.tone = r.range(-0.06, 0.06);
            this.sW = r.int(90000) + 100; this.sT = r.int(90000) + 100;
            this.sB = r.int(90000) + 100; this.sE = r.int(90000) + 100;
            this.sD = r.int(90000) + 100; this.sF = r.int(90000) + 100;
            this.sM = r.int(90000) + 100; this.sP = r.int(90000) + 100;
        }
        // 平面形：x → 半幅 W
        halfW(x) {
            const q = clamp(x / this.A, -1, 1), e = Math.pow(Math.max(0, 1 - q * q), 0.55);
            const n = 1 + 0.14 * (Noise.v2(x * 0.45 + 3.1, 0.7, this.sW) - 0.5) * 2;
            return Math.max(0.15, this.B * e * (1 - this.asym * q) * n);
        }
        // 平面形：x → 中心線の z
        zc(x) {
            const q = x / this.A;
            return this.bow * q * q + 0.35 * (Noise.v2(x * 0.3, 5.5, this.sW + 7) - 0.5) * 2;
        }
        // 厚み：中央で T、端へ向かって薄く。幅方向にはなだらかなドーム
        // 筋肉の束のこぶ（2〜3cm 周期）で上面はうねる。とんかつのような一定の厚みにしない
        thick(x, z) {
            const q = clamp(x / this.A, -1, 1), W = this.halfW(x), zz = clamp((z - this.zc(x)) / W, -1, 1);
            const e = Math.sqrt(Math.max(0, 1 - q * q));
            const n = 1 + 0.10 * (Noise.fbm2(x * 0.35 + 1, z * 0.35 + 2, this.sT, 2) - 0.5) * 2;
            const lump = (Noise.fbm2(x * 0.55 + 3, z * 0.75 + 1, this.sT + 9, 2) - 0.5) * 2;
            return this.T * (0.30 + 0.70 * e) * (1 - 0.22 * zz * zz) * n * (1 + 0.50 * lump * (1 - 0.5 * zz * zz));
        }

        // 長手位置 x の断面を一周 n 等分（弧長）で返す。t_k = (k + off) / n、反時計回り（底 → 右 → 上 → 左）
        // withBump: 皮の水ぶくれと側面の凹凸を法線方向に変位させる
        loop(x, n, off, withBump) {
            const W = this.halfW(x), zc = this.zc(x);
            const Ts0 = this.thick(x, zc + 0.85 * W);
            const rt = Math.min(0.75, 0.42 * W, 0.45 * Ts0);   // 肩の丸み（皮が巻き込む）
            const rb = Math.min(0.22, 0.30 * W);              // 底の角
            const zR = zc + W, zL = zc - W;
            const TsR = this.thick(x, zR - rt), TsL = this.thick(x, zL + rt);
            const yR = TsR - rt, yL = TsL - rt;
            const pts = [];                                   // [z, y, 皮, 肩]
            const push = (z, y, s, sh) => pts.push(z, y, s, sh);
            for (let i = 0; i < 40; i++) push(mix(zL + rb, zR - rb, i / 40), 0, 0, 0);
            for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2); push(zR - rb + rb * Math.cos(a), rb + rb * Math.sin(a), 0, 0); }
            // 側面：外へ膨らむ（肉は垂直に切り立たない）。皮は肩から 0.4cm ほど下まで巻き込む
            const bulge = Math.min(0.28, 0.12 * W);
            for (let i = 0; i < 16; i++) { const y = mix(rb, yR, i / 16); push(zR + bulge * Math.sin(Math.PI * i / 16), y, smooth(yR - 0.40, yR, y), 0); }
            for (let i = 0; i < 14; i++) { const a = (i / 14) * (Math.PI / 2); push(zR - rt + rt * Math.cos(a), yR + rt * Math.sin(a), 1, Math.sin(2 * a)); }
            for (let i = 0; i < 60; i++) { const z = mix(zR - rt, zL + rt, i / 60); push(z, this.thick(x, z), 1, 0); }
            for (let i = 0; i < 14; i++) { const a = Math.PI / 2 + (i / 14) * (Math.PI / 2); push(zL + rt + rt * Math.cos(a), yL + rt * Math.sin(a), 1, Math.sin(2 * (a - Math.PI / 2))); }
            for (let i = 0; i < 16; i++) { const y = mix(yL, rb, i / 16); push(zL - bulge * Math.sin(Math.PI * i / 16), y, smooth(yL - 0.40, yL, y), 0); }
            for (let i = 0; i < 8; i++) { const a = Math.PI + (i / 8) * (Math.PI / 2); push(zL + rb + rb * Math.cos(a), rb + rb * Math.sin(a), 0, 0); }

            const m = pts.length / 4;
            const cum = new Float64Array(m + 1);
            for (let i = 0; i < m; i++) {
                const j = (i + 1) % m;
                cum[i + 1] = cum[i] + Math.hypot(pts[j * 4] - pts[i * 4], pts[j * 4 + 1] - pts[i * 4 + 1]);
            }
            const per = cum[m];
            const N1 = n + 1;
            const R = {
                n, per, W, zc,
                Z: new Float32Array(N1), Y: new Float32Array(N1), NZ: new Float32Array(N1), NY: new Float32Array(N1),
                S: new Float32Array(N1), SH: new Float32Array(N1),
                BL: new Float32Array(N1), BL2: new Float32Array(N1), WR: new Float32Array(N1)
            };
            for (let k = 0; k <= n; k++) {
                let t = (k + off) / n; t -= Math.floor(t);
                const target = t * per;
                let lo = 0, hi = m;
                while (hi - lo > 1) { const md = (lo + hi) >> 1; if (cum[md] <= target) lo = md; else hi = md; }
                const i = lo, j = (i + 1) % m;
                const a = (target - cum[i]) / ((cum[i + 1] - cum[i]) || 1e-9);
                R.Z[k] = mix(pts[i * 4], pts[j * 4], a);
                R.Y[k] = mix(pts[i * 4 + 1], pts[j * 4 + 1], a);
                R.S[k] = mix(pts[i * 4 + 2], pts[j * 4 + 2], a);
                R.SH[k] = mix(pts[i * 4 + 3], pts[j * 4 + 3], a);
            }
            // 外向き法線（反時計回りなので (dy, -dz)）
            for (let k = 0; k < n; k++) {
                const kp = (k - 1 + n) % n, kn = (k + 1) % n;
                const dz = R.Z[kn] - R.Z[kp], dy = R.Y[kn] - R.Y[kp];
                const l = Math.hypot(dz, dy) || 1;
                R.NZ[k] = dy / l; R.NY[k] = -dz / l;
            }
            R.NZ[n] = R.NZ[0]; R.NY[n] = R.NY[0];
            if (withBump) {
                for (let k = 0; k <= n; k++) {
                    const y = R.Y[k], z = R.Z[k], S = R.S[k];
                    // 水ぶくれ：焼いた皮が縮んで膨れた所。大小2段。たれはその谷に溜まる
                    const bl = smooth(0.46, 0.62, Noise.fbm3(x * 1.7, y * 1.7, z * 1.7, this.sB, 3));
                    const bl2 = smooth(0.54, 0.70, Noise.fbm3(x * 3.4 + 7, y * 3.4, z * 3.4, this.sB + 3, 2));
                    const wr = (Noise.fbm3(x * 7, y * 7, z * 7, this.sB + 5, 2) - 0.5) * 2;
                    const ms = (Noise.fbm3(x * 2.5 + 3, y * 2.5, z * 2.5, this.sB + 9, 3) - 0.5) * 2;
                    let d = S * (0.065 * bl + 0.025 * bl2 + 0.004 * wr) + (1 - S) * 0.07 * ms;
                    d *= mix(0.35, 1, smooth(-0.85, -0.45, R.NY[k]));   // 底は鍋に押し付けられて平ら寄り
                    R.BL[k] = bl; R.BL2[k] = bl2; R.WR[k] = wr;
                    R.Z[k] = z + R.NZ[k] * d;
                    R.Y[k] = Math.max(0, y + R.NY[k] * d);
                }
                R.Z[n] = R.Z[0]; R.Y[n] = R.Y[0];
            }
            return R;
        }

        // (x, z) の皮の上面（ごまを乗せる位置）
        topAt(x, z) {
            const n = 96, L = this.loop(x, n, 0, true);
            let best = -1, bd = 1e9;
            for (let k = 0; k < n; k++) {
                if (L.S[k] < 0.6 || L.NY[k] < 0.35) continue;
                const d = Math.abs(L.Z[k] - z);
                if (d < bd) { bd = d; best = k; }
            }
            return best < 0 ? null : { y: L.Y[best], z: L.Z[best], nz: L.NZ[best], ny: L.NY[best] };
        }
    }

    // =================================================================
    // 3. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.30, 0.22, 0.15, 1);

    // 写真撮影用の白いソフトボックスをHDRキューブマップとして生成。
    // 反射もコード内で生成するので外部画像・モデルのダウンロードは不要。
    async function studioEnvironment() {
        const size = 128, faces = [];
        const floatOK = engine.getCaps().textureFloat && engine.getCaps().textureFloatLinearFiltering;
        const type = floatOK ? BABYLON.Engine.TEXTURETYPE_FLOAT : BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE;
        const boxes = [
            { n: new V3(-0.55, 0.78, 0.30).normalize(), w: 0.52, h: 0.34, power: 7.0 },
            { n: new V3(0.18, 0.70, -0.70).normalize(), w: 0.22, h: 0.62, power: 4.0 },
            { n: new V3(0.85, 0.42, 0.32).normalize(), w: 0.20, h: 0.44, power: 2.2 }
        ];
        for (const b of boxes) {
            b.u = V3.Cross(b.n, V3.Up()).normalize(); b.v = V3.Cross(b.u, b.n).normalize();
        }
        for (let face = 0; face < 6; face++) {
            const data = floatOK ? new Float32Array(size * size * 4) : new Uint8Array(size * size * 4);
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                const u = 2 * (x + 0.5) / size - 1, v = 2 * (y + 0.5) / size - 1;
                const dirs = [[1,-v,-u],[-1,-v,u],[u,1,v],[u,-1,-v],[u,-v,1],[-u,-v,-1]];
                const d = new V3(...dirs[face]).normalize();
                let light = 0.10 + 0.14 * Math.max(0, d.y);
                for (const b of boxes) {
                    const f = V3.Dot(d,b.n);
                    if (f <= 0) continue;
                    const a = Math.abs(V3.Dot(d,b.u)/f), c = Math.abs(V3.Dot(d,b.v)/f);
                    light += b.power * (1-smooth(b.w*0.88,b.w,a)) * (1-smooth(b.h*0.88,b.h,c));
                }
                const i = (y*size+x)*4;
                for(let c=0;c<3;c++) data[i+c] = floatOK ? light : Math.min(1,light)*255;
                data[i+3] = floatOK ? 1 : 255;
            }
            faces.push(data);
        }
        const env = new BABYLON.RawCubeTexture(scene, faces, size, BABYLON.Engine.TEXTUREFORMAT_RGBA,
            type, true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        env.name = "procedural-studio"; env.gammaSpace = false;
        env.sphericalPolynomial = BABYLON.CubeMapToSphericalPolynomialTools.ConvertCubeMapToSphericalPolynomial({
            size, right:faces[0],left:faces[1],up:faces[2],down:faces[3],front:faces[4],back:faces[5],
            format:BABYLON.Engine.TEXTUREFORMAT_RGBA, type, gammaSpace:false
        });
        if (engine.getCaps().textureHalfFloatRender || engine.getCaps().textureFloatRender) {
            const filter = new BABYLON.HDRFiltering(engine, {quality:64});
            await filter.prefilter(env);
        }
        return env;
    }
    scene.environmentTexture = await studioEnvironment();
    scene.environmentIntensity = 0.80;

    const camera = new BABYLON.ArcRotateCamera("cam", -Math.PI / 2 + 0.38, 0.82, 22.7, new V3(0.2, 1.0, 0.65), scene);   // 斜め上から寄り、肉を手前・付け合わせを奥にまとめる
    camera.attachControl(engine.getRenderingCanvas(), true);
    camera.fov = 0.62;
    camera.wheelPrecision = 8;
    camera.minZ = 0.15;
    camera.maxZ = 400;
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 140;
    camera.upperBetaLimit = 1.48;
    camera.lowerBetaLimit = 0.12;

    // キーは左奥の上から（逆光気味。たれの照りが縁に乗る）、フィルは手前から弱く
    const key = new BABYLON.DirectionalLight("key", new V3(0.38, -0.80, -0.46).normalize(), scene);
    key.position = new V3(-20, 46, 26);
    key.intensity = 2.7;
    key.diffuse = new C3(1.0, 0.97, 0.92);
    key.specular = new C3(0.62, 0.60, 0.56);
    key.autoCalcShadowZBounds = true;

    const fill = new BABYLON.DirectionalLight("fill", new V3(-0.55, -0.55, 0.63).normalize(), scene);
    fill.intensity = 0.95;
    fill.specular = new C3(0.15, 0.15, 0.15);
    // 鏡面だけの灯。濡れた面に照りを何本も走らせる
    const kick = new BABYLON.DirectionalLight("kick", new V3(0.25, -0.60, 0.76).normalize(), scene);
    kick.intensity = 0.75;
    kick.diffuse = new C3(0.06, 0.06, 0.06);
    kick.specular = new C3(1.0, 0.96, 0.90);

    const amb = new BABYLON.HemisphericLight("amb", new V3(0, 1, 0), scene);
    amb.intensity = 0.22;
    amb.groundColor = new C3(0.62, 0.55, 0.48);
    amb.specular = new C3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.useContactHardeningShadow = true;
    sg.contactHardeningLightSizeUVRatio = 0.004;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0008;
    sg.normalBias = 0.02;
    sg.darkness = 0.20;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.08;
    ip.contrast = 1.06;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 0.5;
    ip.vignetteStretch = 0.4;

    // =================================================================
    // 4. 丸皿（粉引風の生成り色・縁が鉄釉の茶 / 白磁に手描きの黒い点）
    // =================================================================
    const PLATE_PROF = [
        // 上面（中心 → 縁）
        [0.0, 0.50], [3.0, 0.50], [5.5, 0.51], [7.0, 0.55], [8.0, 0.66], [8.8, 0.84], [9.6, 1.08],
        [10.3, 1.32], [10.9, 1.50], [11.4, 1.62], [11.85, 1.70], [12.10, 1.72],
        // 口縁
        [12.26, 1.68], [12.32, 1.58], [12.24, 1.48],
        // 裏面（縁 → 高台 → 中心）
        [11.7, 1.30], [10.8, 1.00], [9.6, 0.66], [8.4, 0.38], [7.4, 0.18], [6.5, 0.02],
        [6.4, 0.00], [5.6, 0.00], [5.5, 0.14], [0.0, 0.14]
    ];
    const PLATE_TOP_N = 12;
    function plateTop(x, z) {
        const r = Math.hypot(x, z), P = PLATE_PROF;
        if (r >= P[PLATE_TOP_N - 1][0]) return P[PLATE_TOP_N - 1][1];
        for (let i = 0; i < PLATE_TOP_N - 1; i++) {
            if (r <= P[i + 1][0]) return mix(P[i][1], P[i + 1][1], (r - P[i][0]) / (P[i + 1][0] - P[i][0] || 1e-9));
        }
        return P[PLATE_TOP_N - 1][1];
    }
    function buildPlate() {
        const NA = 288, NP = PLATE_PROF.length, row = NP;
        const cum = new Float64Array(NP);
        for (let p = 1; p < NP; p++) cum[p] = cum[p - 1] + Math.hypot(PLATE_PROF[p][0] - PLATE_PROF[p - 1][0], PLATE_PROF[p][1] - PLATE_PROF[p - 1][1]);
        const total = cum[NP - 1];
        // 上面の r → v（模様を描く位置）
        const vOfR = (r) => {
            for (let p = 0; p < PLATE_TOP_N - 1; p++) {
                if (r <= PLATE_PROF[p + 1][0]) return mix(cum[p], cum[p + 1], (r - PLATE_PROF[p][0]) / (PLATE_PROF[p + 1][0] - PLATE_PROF[p][0] || 1e-9)) / total;
            }
            return cum[PLATE_TOP_N - 1] / total;
        };
        const pos = [], uv = [], idx = [];
        for (let a = 0; a <= NA; a++) {
            const phi = a / NA * TAU;
            // わずかな歪み（手びねりの縁）
            const w = 1 + 0.004 * (Math.cos(3 * phi) * 0.6 + Math.sin(5 * phi) * 0.4);
            for (let p = 0; p < NP; p++) {
                const [r, y] = PLATE_PROF[p];
                pos.push(r * w * Math.cos(phi), y, r * w * Math.sin(phi));
                uv.push(a / NA, cum[p] / total);
            }
        }
        for (let a = 0; a < NA; a++) for (let p = 0; p < NP - 1; p++) {
            const i0 = a * row + p, i1 = i0 + 1, j0 = i0 + row, j1 = j0 + 1;
            idx.push(i0, j0, i1, i1, j0, j1);
        }
        let normals = new Float32Array(pos.length);
        BABYLON.VertexData.ComputeNormals(pos, idx, normals);
        let sy = 0;
        for (let a = 0; a < NA; a++) sy += normals[(a * row + 2) * 3 + 1];
        if (sy < 0) {
            flipIdx(idx);
            normals = new Float32Array(pos.length);
            BABYLON.VertexData.ComputeNormals(pos, idx, normals);
        }
        for (let p = 0; p < NP; p++) weld(normals, [p, NA * row + p]);
        for (const p of [0, NP - 1]) for (let a = 0; a <= NA; a++) {
            const i = a * row + p;
            normals[i * 3] = 0; normals[i * 3 + 1] = p === 0 ? 1 : -1; normals[i * 3 + 2] = 0;
        }
        const mesh = named(new BABYLON.Mesh("plate", scene), "plate");
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = idx; vd.normals = normals; vd.uvs = uv;
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        mesh.receiveShadows = true;
        return { mesh, vOfR, total };
    }
    function drawPlateTex(dt, vOfR, total, kind) {
        const W = GLOBAL.plateTexW, H = GLOBAL.plateTexH;
        const ctx = dt.getContext();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = kind === "stone" ? "#e8dfc9" : "#f3f1ea";
        ctx.fillRect(0, 0, W, H);
        if (kind === "stone") {
            // 粉引：鉄粉の小さな斑点と、縁の鉄釉（茶）。縁の境はにじませる
            const r = new Rng(4242);
            for (let i = 0; i < 3400; i++) {
                const px = r.next() * W, py = r.next() * vOfR(11.3) * H;
                const sz = 0.25 + r.next() * 0.85;
                ctx.fillStyle = r.next() < 0.5 ? "rgba(96,70,48,0.25)" : "rgba(150,120,90,0.25)";
                ctx.beginPath(); ctx.ellipse(px, py, sz, sz * 0.7, 0, 0, TAU); ctx.fill();
            }
            const y0 = vOfR(11.25) * H, y1 = vOfR(12.10) * H;
            for (let x = 0; x < W; x += 2) {
                const wob = 6 * (Noise.fbm2(x * 0.004, 0.5, 4243, 3) - 0.5) * 2;
                const grd = ctx.createLinearGradient(0, y0 + wob - 10, 0, y0 + wob + 14);
                grd.addColorStop(0, "rgba(120,78,46,0)");
                grd.addColorStop(1, "rgba(120,78,46,1)");
                ctx.fillStyle = grd;
                ctx.fillRect(x, y0 + wob - 10, 2, y1 - (y0 + wob - 10) + 40);
            }
            // 縁の茶の濃淡
            for (let i = 0; i < 400; i++) {
                const px = r.next() * W, py = y0 + 4 + r.next() * (y1 - y0 + 30);
                ctx.fillStyle = r.next() < 0.5 ? "rgba(70,40,22,0.35)" : "rgba(170,120,80,0.30)";
                ctx.beginPath(); ctx.ellipse(px, py, 2 + r.next() * 8, 1 + r.next() * 3, 0, 0, TAU); ctx.fill();
            }
        }
        if (kind === "dots") {
            // 縁に沿って手描きの黒い点。間隔も大きさも少し不揃い
            const r = new Rng(777);
            const n = 17;
            for (let i = 0; i < n; i++) {
                const a = (i + 0.5) / n + r.range(-0.012, 0.012);
                const rr = 10.9 + r.range(-0.35, 0.35), rad = 0.36 + r.range(-0.06, 0.06);
                const px = a * W, py = vOfR(rr) * H;
                const ru = rad / (TAU * rr) * W, rv = rad / total * H;
                for (const sh of [0, -W, W]) {
                    ctx.fillStyle = "rgba(38,32,28,0.93)";
                    ctx.beginPath();
                    ctx.ellipse(px + sh, py, ru * r.range(0.92, 1.08), rv * r.range(0.92, 1.08), r.range(-0.4, 0.4), 0, TAU);
                    ctx.fill();
                    // 筆の重なり
                    ctx.fillStyle = "rgba(38,32,28,0.55)";
                    ctx.beginPath();
                    ctx.ellipse(px + sh + ru * r.range(-0.25, 0.25), py + rv * r.range(-0.25, 0.25), ru * 0.8, rv * 0.8, 0, 0, TAU);
                    ctx.fill();
                }
            }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        dt.update(false);
    }
    const plateBuilt = buildPlate();
    const plate = plateBuilt.mesh;
    const plateTex = {};
    for (const kind of ["stone", "dots"]) {
        const dt = named(new BABYLON.DynamicTexture("plateTex_" + kind,
            { width: GLOBAL.plateTexW, height: GLOBAL.plateTexH }, scene, true), "plateTex");
        drawPlateTex(dt, plateBuilt.vOfR, plateBuilt.total, kind);
        dt.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
        dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        dt.anisotropicFilteringLevel = 8;
        plateTex[kind] = dt;
    }
    let curPlate = "stone";
    const plateMat = named(new BABYLON.PBRMaterial("plateGlaze", scene), "plateGlaze");
    plateMat.albedoTexture = plateTex.stone;
    plateMat.metallic = 0; plateMat.roughness = 0.22;          // 粉引は白磁より艶が鈍い
    plateMat.clearCoat.isEnabled = true;
    plateMat.clearCoat.intensity = 0.45;
    plateMat.clearCoat.roughness = 0.12;
    plate.material = plateMat;
    sg.addShadowCaster(plate, false);


    // =================================================================
    // 5. 木のテーブル
    // =================================================================
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
        for (const t of [albedo, orm]) { t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; }
        return { albedo, orm };
    }
    const tableTex = woodSet(1024, 9001, {
        name: "table", base: [0.56, 0.36, 0.20], grain: [0.44, 0.26, 0.13], dark: [0.30, 0.16, 0.08],
        rings: 12, wave: 1.6, sharp: 2.2, knot: 0.35, planks: 3, rough: 0.48
    });
    const table = named(BABYLON.MeshBuilder.CreateBox("table", { width: 180, height: 3, depth: 180 }, scene), "table");
    {
        const tm = named(new BABYLON.PBRMaterial("tableMat", scene), "tableMat");
        tm.albedoTexture = tableTex.albedo; tm.metallicTexture = tableTex.orm;
        tm.useAmbientOcclusionFromMetallicTextureRed = true;
        tm.useRoughnessFromMetallicTextureGreen = true;
        tm.useRoughnessFromMetallicTextureAlpha = false;
        tm.useMetallnessFromMetallicTextureBlue = true;
        tm.metallic = 0; tm.roughness = 1;
        tm.clearCoat.isEnabled = true;          // ニス
        tm.clearCoat.intensity = 0.35;
        tm.clearCoat.roughness = 0.30;
        table.material = tm;
        table.receiveShadows = true;
        table.position.y = -1.5;
        table.rotation.y = 0.35;
    }

    // =================================================================
    // 6. 切断面の共有テクスチャ（タイル）と材質
    // =================================================================
    // 大きな色（皮・脂・染み・たれの垂れ）は頂点カラー、細かい繊維の切り口と濡れ具合はこのタイルで足す。
    // アルベドは変調なので 1.0 を超えない
    const cutTex = (() => {
        const N = GLOBAL.cutTex, n2 = N * N;
        const stip = new Float32Array(n2), line = new Float32Array(n2), mot = new Float32Array(n2);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const u = x / N, v = y / N, i = y * N + x;
            // 繊維の切り口：細かい点々
            stip[i] = Noise.v2(u * 64, v * 64, 4101);
            // 筋肉の束の境：横方向にうねる細い線
            const bend = Noise.fbm2(u * 5, v * 3, 4103, 2);
            const st = 0.5 + 0.5 * Math.sin((v * 105 + 1.8 * bend + u * 9) * TAU);
            line[i] = Math.pow(st, 12) * (0.35 + 0.65 * stip[i]);
            mot[i] = Noise.fbm2(u * 5, v * 5, 4107, 3) - 0.5;
        }
        const albedo = makeTex(scene, "cutA", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const v = clamp(0.86 + 0.10 * stip[i] + 0.05 * mot[i] - 0.055 * line[i], 0.70, 1.0);
                const k = i * 4;
                d[k] = v * 255; d[k + 1] = v * 255 * (1 - 0.02 * line[i]); d[k + 2] = v * 255 * (1 - 0.04 * line[i]); d[k + 3] = 255;
            }
        });
        const orm = makeTex(scene, "cutO", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const ro = clamp(0.40 + 0.14 * stip[i] - 0.12 * line[i] + 0.06 * mot[i], 0.25, 0.7);
                const k = i * 4;
                d[k] = (1 - 0.18 * line[i]) * 255; d[k + 1] = ro * 255; d[k + 2] = 0; d[k + 3] = 255;
            }
        }, true);
        const hgt = new Float32Array(n2);
        for (let i = 0; i < n2; i++) hgt[i] = 0.0015 * stip[i] - 0.002 * line[i] + 0.001 * mot[i];
        const normal = bakeNormal(scene, "cutN", N, N, hgt, N / (2 * 4.5), () => N / (2 * 4.5), true);
        for (const t of [albedo, orm, normal]) { t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; }
        return { albedo, orm, normal };
    })();
    const cutMat = named(new BABYLON.PBRMaterial("cutMat", scene), "cutMat");
    cutMat.albedoTexture = cutTex.albedo;
    cutMat.metallic = 0; cutMat.roughness = 1;
    cutMat.metallicTexture = cutTex.orm;
    cutMat.useAmbientOcclusionFromMetallicTextureRed = true;
    cutMat.useRoughnessFromMetallicTextureGreen = true;
    cutMat.useRoughnessFromMetallicTextureAlpha = false;
    cutMat.useMetallnessFromMetallicTextureBlue = true;
    cutMat.bumpTexture = cutTex.normal;
    cutMat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
    // 切りたての面は肉汁で濡れている。皮ほどは光らない
    cutMat.clearCoat.isEnabled = true;
    cutMat.clearCoat.intensity = 0.30;
    cutMat.clearCoat.roughness = 0.28;
    cutMat.clearCoat.indexOfRefraction = 1.4;
    cutMat.subSurface.isTranslucencyEnabled = true;
    cutMat.subSurface.translucencyIntensity = 0.12;
    cutMat.subSurface.tintColor = new C3(1.0, 0.78, 0.70);
    cutMat.subSurface.minimumThickness = 0.1;
    cutMat.subSurface.maximumThickness = 1.5;

    // 皮の材質。テクスチャは build のたびに差し替える
    const skinMat = named(new BABYLON.PBRMaterial("skinMat", scene), "skinMat");
    skinMat.metallic = 0; skinMat.roughness = 1;
    skinMat.useAmbientOcclusionFromMetallicTextureRed = true;
    skinMat.useRoughnessFromMetallicTextureGreen = true;
    skinMat.useRoughnessFromMetallicTextureAlpha = false;
    skinMat.useMetallnessFromMetallicTextureBlue = true;
    skinMat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
    // たれの膜。一様にすると濡れたプラスチックになるのでテクスチャで散らす（R = 被覆、G = 粗さ）
    skinMat.clearCoat.isEnabled = true;
    skinMat.clearCoat.useRoughnessFromMainTexture = true;
    skinMat.clearCoat.intensity = 1.0;
    skinMat.clearCoat.roughness = 0.85;
    skinMat.clearCoat.indexOfRefraction = 1.5;
    skinMat.subSurface.isTranslucencyEnabled = true;
    skinMat.subSurface.translucencyIntensity = 0.16;
    skinMat.subSurface.tintColor = new C3(1.0, 0.70, 0.40);
    skinMat.subSurface.minimumThickness = 0.1;
    skinMat.subSurface.maximumThickness = 1.5;

    // =================================================================
    // 7. 皮のテクスチャを焼く（(x, 一周) 空間。全切り身で1枚を共有する）
    // =================================================================
    function bakeSkin(sh, cfg) {
        const W = GLOBAL.texW, H = GLOBAL.texH, n = W * H;
        const col = new Float32Array(n * 3), hgt = new Float32Array(n);
        const ao = new Float32Array(n), ro = new Float32Array(n), cc = new Float32Array(n), cr = new Float32Array(n);
        const perCol = new Float32Array(W);
        const sB = sh.sB, A = sh.A, tone = sh.tone, glz = cfg.glaze;
        for (let i = 0; i < W; i++) {
            const x = -A + (i + 0.5) / W * (2 * A);
            const L = sh.loop(x, H, 0.5, true);
            perCol[i] = L.per;
            for (let j = 0; j < H; j++) {
                const k = j * W + i;
                const y = L.Y[j], z = L.Z[j], S = L.S[j], shd = L.SH[j], bl = L.BL[j], bl2 = L.BL2[j], wr = L.WR[j];
                // ---- 皮：地は金〜あめ色。たれは水ぶくれの間の谷としわに溜まって濃い ----
                const pool = (1 - bl) * (1 - 0.5 * bl2);
                const crease = smooth(0.78, 0.94, 1 - Math.abs(2 * Noise.fbm3(x * 2.6, y * 2.6, z * 2.6, sB + 19, 3) - 1)) * (0.4 + 0.6 * pool);
                // 煮詰めたたれが長手方向に流れた筋（厚い所ほど濃く、鏡面）
                const streak = smooth(0.52, 0.74, Noise.fbm3(x * 0.55, y * 2.4, z * 2.4 + 9, sB + 23, 3));
                let lev = (0.30 + 0.10 * pool - 0.04 * bl2 + 0.012 * wr + 0.045 * crease + 0.13 * streak
                    + 0.38 * (Noise.fbm3(x * 0.38 + 4, y * 0.38, z * 0.38, sB + 21, 3) - 0.5) * 2 + tone) * glz;
                let sc = lev < 0.35 ? mix3(cfg.hi, cfg.gold, smooth(0.0, 0.35, lev))
                    : lev < 0.70 ? mix3(cfg.gold, cfg.amber, smooth(0.35, 0.70, lev))
                    : mix3(cfg.amber, cfg.dark, smooth(0.70, 1.05, lev));
                // 焦げ：鍋に強く当たった高い所に点々と
                const ch = smooth(0.49, 0.70, Noise.fbm3(x * 0.65 + 11, y * 0.65, z * 0.65, sh.sE, 3)) * (0.72 + 0.28 * bl) * cfg.char;
                sc = mix3(sc, cfg.burnt, ch);
                // 肩（縁）はカラメル化が進んで濃い
                sc = mix3(sc, cfg.dark, shd * 0.35 * glz);
                // 毛穴
                const pore = smooth(0.80, 0.92, Noise.v3(x * 14, y * 14, z * 14, sB + 27));
                sc = mix3(sc, cfg.amber, pore * 0.25);

                // ---- 側面の肉：焼き色はまだらに、上からたれがたっぷり垂れる ----
                const sear = smooth(0.42, 0.70, Noise.fbm3(x * 2.0 + 5, y * 2.0, z * 2.0, sB + 31, 2));
                let mc = mix3(MEAT_OUT, SEAR, sear * 0.5);
                const top = sh.thick(x, z);
                const drip = smooth(0.45, 0.72, Noise.v2(x * 2.4 + z * 0.9, 1.7, sh.sD)) * smooth(1.6, 0.2, top - y)
                    + 0.55 * smooth(0.75, 0.10, top - y);   // 皮のすぐ下はほぼ全面たれ
                mc = mix3(mc, SAUCE_MEAT, clamp(drip, 0, 1) * 0.8);
                mc = mix3(mc, SEAR, smooth(0.4, 0.0, y) * 0.25);

                const c = mix3(mc, sc, S);
                col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];

                // ---- 細かい凹凸（cm）。水ぶくれ自体はメッシュにある ----
                hgt[k] = S * (0.006 * (Noise.fbm3(x * 12, y * 12, z * 12, sB + 35, 2) - 0.5) * 2 - 0.006 * pore + 0.004 * bl2)
                    + (1 - S) * 0.012 * (Noise.fbm3(x * 9 + 2, y * 9, z * 9, sB + 37, 2) - 0.5) * 2;
                ao[k] = clamp(1 - 0.15 * pool * S - 0.22 * crease * S, 0.5, 1);
                ro[k] = clamp(S * (0.34 - 0.12 * pool - 0.10 * streak + 0.06 * bl + 0.15 * ch) + (1 - S) * (0.50 - 0.25 * drip), 0.12, 0.8);
                // 照り：たれは鏡面に近い。焦げと水ぶくれの頂点だけ少し乾く
                cc[k] = clamp(S * (1.0 - 0.20 * ch - 0.05 * bl) + (1 - S) * (0.35 + 0.6 * drip), 0, 1);
                cr[k] = clamp(S * (0.16 + 0.12 * bl + 0.20 * ch + 0.035 * pore - 0.025 * streak) + (1 - S) * (0.45 - 0.35 * drip), 0.03, 1);
            }
        }
        const albedo = makeTex(scene, "skinA", W, H, (d) => {
            for (let k = 0; k < n; k++) {
                const o = k * 4;
                d[o] = col[k * 3] * 255; d[o + 1] = col[k * 3 + 1] * 255; d[o + 2] = col[k * 3 + 2] * 255; d[o + 3] = 255;
            }
        });
        const orm = makeTex(scene, "skinO", W, H, (d) => {
            for (let k = 0; k < n; k++) {
                const o = k * 4;
                d[o] = ao[k] * 255; d[o + 1] = ro[k] * 255; d[o + 2] = 0; d[o + 3] = 255;
            }
        }, true);
        const coat = makeTex(scene, "skinC", W, H, (d) => {
            for (let k = 0; k < n; k++) {
                const o = k * 4;
                d[o] = cc[k] * 255; d[o + 1] = cr[k] * 255; d[o + 2] = 0; d[o + 3] = 255;
            }
        }, true);
        const normal = bakeNormal(scene, "skinN", W, H, hgt, W / (4 * A), (i) => H / (2 * Math.max(perCol[i], 0.5)), true);
        for (const t of [albedo, orm, coat, normal]) t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        return { albedo, orm, coat, normal };
    }

    // =================================================================
    // 8. 切り身（掃引した皮付きの胴 + 切断面）
    // =================================================================
    // 切断面の色：皮（たれ）→ 脂の層 → たれが染みた肉 → 中心の白い肉。たれは上から筋状に垂れる
    // 切ったあとにたれを回しかけているので、切断面の上側はたれに覆われ、下側へ筋になって流れる
    function capColor(sh, cfg, x, z, y, depth, S) {
        const skin = S * smooth(0.14, 0.05, depth);
        const fatN = Noise.v2(x * 1.5 + 2, z * 1.5, sh.sF);
        const fat = S * smooth(0.16 + 0.22 * fatN, 0.08, depth) * (1 - skin);
        const top = sh.thick(x, z);
        const soak = smooth(1.2, 0.15, depth) * (0.45 + 0.55 * S) + (1 - S) * smooth(0.4, 0.05, depth) * 0.8;
        const mot = (Noise.fbm3(x * 2.5, y * 2.5, z * 2.5, sh.sM, 2) - 0.5) * 2;
        // 繊維の束：切り口に走る濃い筋
        const bundle = smooth(0.88, 0.98, 1 - Math.abs(2 * Noise.fbm3(x * 2, y * 14, z * 3, sh.sM + 5, 2) - 1));
        let c = mix3(MEAT, SOAK, clamp(soak * 0.35 + sh.tone, 0, 1));
        c = [c[0] * (1 + 0.07 * mot - 0.035 * bundle), c[1] * (1 + 0.06 * mot - 0.045 * bundle), c[2] * (1 + 0.05 * mot - 0.045 * bundle)];
        const below = top - y;
        const flow = smooth(0.50, 0.70, Noise.v2(x * 0.8 + z * 2.3, 0.7, sh.sD));
        const sauce = clamp(0.85 * smooth(0.50, 0.06, below) + 0.7 * flow * smooth(1.0, 0.2, below), 0, 1);
        c = mix3(c, FAT, fat);
        // たれの膜は半透明：下の肉の色を残しつつ赤茶に寄せる
        c = mix3(c, [c[0] * 0.55 + 0.20, c[1] * 0.40 + 0.06, c[2] * 0.30 + 0.01], sauce * 0.9);
        c = mix3(c, SAUCE_MEAT, sauce * 0.25);
        c = mix3(c, cfg.dark, skin);
        return c;
    }

    function buildSlice(sh, cfg, i, nS) {
        const G = GLOBAL, NT = G.NT, row = NT + 1, A = sh.A;
        const w = 2 * A / nS, x0 = -A + i * w, x1 = x0 + w;
        const first = i === 0, last = i === nS - 1;
        const cx = (x0 + x1) / 2, cz = sh.zc(cx), cy = sh.thick(cx, cz) / 2;
        const node = named(new BABYLON.TransformNode("slice", scene), "slice");
        const meshes = [];

        // ---- 胴：x 方向に輪を並べる。端の切り身は先端へ向かって輪を詰め、最後の輪を1点に潰す ----
        const M = Math.max(8, Math.round(w / G.ringStep));
        const xt0 = -A + 0.03, xt1 = A - 0.03;
        const xs = [];
        for (let j = 0; j <= M; j++) {
            const s = j / M;
            xs.push(first ? x1 - (x1 - xt0) * Math.cos(s * Math.PI / 2)
                : last ? x0 + (xt1 - x0) * Math.sin(s * Math.PI / 2)
                : x0 + s * w);
        }
        const nv = (M + 1) * row;
        const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
        for (let j = 0; j <= M; j++) {
            const x = xs[j], L = sh.loop(x, NT, 0, true);
            const collapse = (first && j === 0) || (last && j === M);
            let mz = 0, my = 0;
            if (collapse) { for (let k = 0; k < NT; k++) { mz += L.Z[k]; my += L.Y[k]; } mz /= NT; my /= NT; }
            for (let k = 0; k <= NT; k++) {
                const o = j * row + k;
                pos[o * 3] = x - cx;
                pos[o * 3 + 1] = (collapse ? my : L.Y[k]) - cy;
                pos[o * 3 + 2] = (collapse ? mz : L.Z[k]) - cz;
                uv[o * 2] = (x + A) / (2 * A); uv[o * 2 + 1] = k / NT;
            }
        }
        const idx = new Uint32Array(M * NT * 6);
        let q = 0;
        for (let j = 0; j < M; j++) for (let k = 0; k < NT; k++) {
            const a = j * row + k, b = a + 1, c = a + row, d = c + 1;
            idx[q++] = a; idx[q++] = b; idx[q++] = c;
            idx[q++] = b; idx[q++] = d; idx[q++] = c;
        }
        const normals = finishClosed(pos, idx);
        for (let j = 0; j <= M; j++) weld(normals, [j * row, j * row + NT]);
        if (first) weld(normals, Array.from({ length: row }, (_, k) => k));
        if (last) weld(normals, Array.from({ length: row }, (_, k) => M * row + k));
        const body = named(new BABYLON.Mesh("sliceBody", scene), "sliceBody");
        {
            const vd = new BABYLON.VertexData();
            vd.positions = pos; vd.indices = idx; vd.normals = normals; vd.uvs = uv;
            vd.applyToMesh(body, false);
            body.hasVertexAlpha = false;
            body.material = skinMat;
            body.receiveShadows = true;
            body.parent = node;
            meshes.push(body);
        }
        // 置き場所と食い込みの計算に使う間引いた点
        const smp = [];
        for (let j = 0; j <= M; j += 2) for (let k = 0; k < NT; k += 3) {
            const o = (j * row + k) * 3;
            smp.push(pos[o], pos[o + 1], pos[o + 2]);
        }

        // ---- 切断面：輪郭から中心へ放射状の格子で埋める（縁ほど細かく、皮と脂の層が頂点で出る）----
        const buildCap = (x, sign) => {
            const L = sh.loop(x, NT, 0, true);
            let gz = 0, gy = 0;
            for (let k = 0; k < NT; k++) { gz += L.Z[k]; gy += L.Y[k]; }
            gz /= NT; gy /= NT;
            const R = 14, nvc = (R + 1) * row;
            const cp = new Float32Array(nvc * 3), cn = new Float32Array(nvc * 3), cuv = new Float32Array(nvc * 2), ccol = new Float32Array(nvc * 4);
            for (let r = 0; r <= R; r++) {
                const s = r / R;
                for (let k = 0; k <= NT; k++) {
                    const o = r * row + k;
                    const z = gz + s * (L.Z[k] - gz), y = gy + s * (L.Y[k] - gy);
                    cp[o * 3] = x - cx; cp[o * 3 + 1] = y - cy; cp[o * 3 + 2] = z - cz;
                    cn[o * 3] = sign; cn[o * 3 + 1] = 0; cn[o * 3 + 2] = 0;
                    cuv[o * 2] = z * 0.22 + 0.5; cuv[o * 2 + 1] = y * 0.22;
                    const depth = (1 - s) * Math.hypot(L.Z[k] - gz, L.Y[k] - gy);
                    const c = capColor(sh, cfg, x, z, y, depth, L.S[k]);
                    ccol[o * 4] = lin(c[0]); ccol[o * 4 + 1] = lin(c[1]); ccol[o * 4 + 2] = lin(c[2]); ccol[o * 4 + 3] = 1;
                }
            }
            const ci = [];
            for (let r = 0; r < R; r++) for (let k = 0; k < NT; k++) {
                const a = r * row + k, b = a + 1, c = a + row, d = c + 1;
                if (r > 0) ci.push(a, c, b);
                ci.push(b, c, d);
            }
            const tn = triNormal(cp, ci[ci.length - 3], ci[ci.length - 2], ci[ci.length - 1]);
            if (tn[0] * sign < 0) flipIdx(ci);
            const cap = named(new BABYLON.Mesh("sliceCut", scene), "sliceCut");
            const vd = new BABYLON.VertexData();
            vd.positions = cp; vd.indices = ci; vd.normals = cn; vd.uvs = cuv; vd.colors = ccol;
            vd.applyToMesh(cap, false);
            cap.hasVertexAlpha = false;
            cap.material = cutMat;
            cap.receiveShadows = true;
            cap.parent = node;
            meshes.push(cap);
            for (let r = R; r <= R; r++) for (let k = 0; k < NT; k += 4) {
                const o = (r * row + k) * 3;
                smp.push(cp[o], cp[o + 1], cp[o + 2]);
            }
        };
        if (!first) buildCap(x0, -1);
        if (!last) buildCap(x1, 1);

        return { node, meshes, samples: new Float32Array(smp), x0, x1, center: new V3(cx, cy, cz) };
    }

    // =================================================================
    // 9. 並べる
    // =================================================================
    // 切り身を扇状に、同じ向きへ少し寝かせて並べる。隣の中へ食い込んでいたら列の方向へ押し出し、
    // 最後に皿の上面へ載せる（物理は使わない。切り身は互いに寄りかかって止まっている）
    const _v = new V3(), _w = new V3();
    function liftOf(sl) {
        const wm = sl.node.computeWorldMatrix(true), s = sl.samples;
        let lift = -Infinity;
        for (let i = 0; i < s.length; i += 3) {
            _v.set(s[i], s[i + 1], s[i + 2]);
            V3.TransformCoordinatesToRef(_v, wm, _w);
            lift = Math.max(lift, plateTop(_w.x, _w.z) - _w.y);
        }
        return lift;
    }
    function penetration(sh, a, b) {
        const wa = a.node.computeWorldMatrix(true), inv = b.node.computeWorldMatrix(true).clone().invert();
        const s = a.samples, c = b.center;
        let pen = 0;
        for (let i = 0; i < s.length; i += 3) {
            _v.set(s[i], s[i + 1], s[i + 2]);
            V3.TransformCoordinatesToRef(_v, wa, _w);
            V3.TransformCoordinatesToRef(_w, inv, _v);
            const x = _v.x + c.x, y = _v.y + c.y, z = _v.z + c.z;
            if (x <= b.x0 || x >= b.x1 || y < 0.02) continue;
            if (y > sh.thick(x, z) - 0.02) continue;
            if (Math.abs(z - sh.zc(x)) > sh.halfW(x) - 0.05) continue;
            pen = Math.max(pen, b.x1 - x);
        }
        return pen;
    }
    function layout(sh, slices, rng) {
        const G = GLOBAL, nS = slices.length, w = 2 * sh.A / nS, p = w + G.gap, R = G.fanR;
        const ox = G.originX, oz = G.originZ;
        // 左端から順に置く。各切り身は前の切り身の位置から短いピッチで置いて（必ず食い込む）、
        // 食い込みが消えるまで列の方向へ押し出す。こうすると寄りかかって止まった間隔になる
        for (let i = 0; i < nS; i++) {
            const sl = slices[i];
            const th = (i - (nS - 1) / 2) * p / R;
            const lean = G.lean + rng.range(-0.06, 0.06);
            const yaw = th + rng.range(-0.03, 0.03);
            // 寝かせてから向きを回す（行ベクトル規約なので左から順に適用される）
            const Mt = BABYLON.Matrix.RotationZ(lean).multiply(BABYLON.Matrix.RotationY(yaw));
            sl.node.rotation = BABYLON.Quaternion.FromRotationMatrix(Mt).toEulerAngles();
            sl.dir = new V3(Math.cos(th), 0, -Math.sin(th));
            if (i === 0) { sl.node.position.set(ox, 0, oz); continue; }
            const prev = slices[i - 1].node.position;
            sl.node.position.set(prev.x + sl.dir.x * Math.max(0.6, p), 0, prev.z + sl.dir.z * Math.max(0.6, p));
            for (let it = 0; it < 14; it++) {
                const pen = penetration(sh, sl, slices[i - 1]);
                if (pen < 0.01) break;
                sl.node.position.addInPlace(sl.dir.scale(pen + 0.02));
            }
        }
        // 列の中心を皿の狙いに合わせてから載せる
        let mx = 0;
        for (const sl of slices) mx += sl.node.position.x;
        mx /= nS;
        for (const sl of slices) {
            sl.node.position.x += ox - mx;
            sl.node.position.y = 0;
            sl.node.position.y = liftOf(sl);
        }
    }

    // =================================================================
    // 10. 付け合わせ：ブロッコリー、花形にんじん、たれ溜まり、ごま、刻みねぎ
    // =================================================================
    // ---- ブロッコリーの小房（茎と枝は SDF + Surface Nets。ブロッコリー.js から移植）----
    // 株丸ごとのサンプル（broccoli-K）の作りを小房1個ぶんに縮めたもの：
    //   包絡面（扁球）の上に房ドームを置く → 枝をベジエで引く →
    //   瘤のあるドーム面に正二十面体の粒を六方最密で敷く → 隣の房からの球状 AO を頂点に焼く
    // 【対策】粒を球で作ると面数だけ10倍になる。正二十面体に「法線＝頂点方向」で十分
    // 【対策】質感を作るのは粒そのものではなく粒と粒のあいだの谷の暗さ。SSAO は 1mm の谷を
    //         解像できないので、隣のドームが張る立体角を解析的に足して頂点に焼く
    const vec = (x, y, z) => ({ x, y, z });
    const vadd = (a, b) => vec(a.x + b.x, a.y + b.y, a.z + b.z);
    const vsub = (a, b) => vec(a.x - b.x, a.y - b.y, a.z - b.z);
    const vmul = (a, k) => vec(a.x * k, a.y * k, a.z * k);
    const vdot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
    const vcross = (a, b) => vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
    const vlen = (a) => Math.hypot(a.x, a.y, a.z);
    const vnorm = (a) => { const l = vlen(a) || 1; return vec(a.x / l, a.y / l, a.z / l); };
    function basisFrom(n) {
        const a = Math.abs(n.y) < 0.90 ? vec(0, 1, 0) : vec(1, 0, 0);
        const e1 = vnorm(vcross(a, n));
        return { e1, e2: vcross(n, e1) };
    }
    const ICO = (() => {
        const g = (1 + Math.sqrt(5)) / 2;
        const raw = [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]];
        const V = raw.map((p) => vnorm(vec(p[0], p[1], p[2])));
        const F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
            [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
        return { V, F };
    })();
    // 頂点バッファ（法線は解析的に持ち、面法線と向きを合わせて巻き順を決める）
    class MeshBuf {
        constructor(maxV, maxT) {
            maxV = Math.max(64, maxV | 0); maxT = Math.max(64, maxT | 0);
            this.pos = new Float32Array(maxV * 3); this.nrm = new Float32Array(maxV * 3);
            this.col = new Float32Array(maxV * 4); this.idx = new Uint32Array(maxT * 3);
            this.nv = 0; this.nt = 0;
        }
        _growV() {
            const m = (this.pos.length / 3) * 2;
            const p = new Float32Array(m * 3); p.set(this.pos); this.pos = p;
            const n = new Float32Array(m * 3); n.set(this.nrm); this.nrm = n;
            const c = new Float32Array(m * 4); c.set(this.col); this.col = c;
        }
        _growT() { const m = (this.idx.length / 3) * 2; const a = new Uint32Array(m * 3); a.set(this.idx); this.idx = a; }
        vert(x, y, z, nx, ny, nz, r, g, b) {
            if ((this.nv + 1) * 3 > this.pos.length) this._growV();
            const i = this.nv++, p = i * 3, q = i * 4;
            this.pos[p] = x; this.pos[p + 1] = y; this.pos[p + 2] = z;
            this.nrm[p] = nx; this.nrm[p + 1] = ny; this.nrm[p + 2] = nz;
            this.col[q] = r; this.col[q + 1] = g; this.col[q + 2] = b; this.col[q + 3] = 1;
            return i;
        }
        tri(a, b, c) {
            if ((this.nt + 1) * 3 > this.idx.length) this._growT();
            const t = this.nt++ * 3;
            this.idx[t] = a; this.idx[t + 1] = b; this.idx[t + 2] = c;
        }
        quad(a, b, c, d) { this.tri(a, c, b); this.tri(b, c, d); }
        orient() {
            const P = this.pos, N = this.nrm, I = this.idx;
            for (let t = 0; t < this.nt; t++) {
                const i0 = I[t * 3] * 3, i1 = I[t * 3 + 1] * 3, i2 = I[t * 3 + 2] * 3;
                const ax = P[i0] - P[i1], ay = P[i0 + 1] - P[i1 + 1], az = P[i0 + 2] - P[i1 + 2];
                const bx = P[i2] - P[i1], by = P[i2 + 1] - P[i1 + 1], bz = P[i2 + 2] - P[i1 + 2];
                const fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx;
                const nx = N[i0] + N[i1] + N[i2], ny = N[i0 + 1] + N[i1 + 1] + N[i2 + 1], nz = N[i0 + 2] + N[i1 + 2] + N[i2 + 2];
                if (fx * nx + fy * ny + fz * nz < 0) { const a = I[t * 3 + 1]; I[t * 3 + 1] = I[t * 3 + 2]; I[t * 3 + 2] = a; }
            }
        }
        toMesh(name, mat) {
            this.orient();
            const mesh = named(new BABYLON.Mesh(name, scene), name);
            const vd = new BABYLON.VertexData();
            vd.positions = this.pos.slice(0, this.nv * 3);
            vd.normals = this.nrm.slice(0, this.nv * 3);
            vd.colors = this.col.slice(0, this.nv * 4);
            vd.indices = this.idx.slice(0, this.nt * 3);
            vd.applyToMesh(mesh, false);
            mesh.hasVertexAlpha = false;
            mesh.material = mat;
            mesh.receiveShadows = true;
            return mesh;
        }
    }
    // 掃引管（回転最小フレーム）
    function tube(buf, path, radii, sides, colFn, shapeFn, capEnd) {
        const N = path.length;
        const T = [];
        for (let i = 0; i < N; i++) T.push(vnorm(vsub(path[Math.min(N - 1, i + 1)], path[Math.max(0, i - 1)])));
        const NR = [], BR = [];
        let n0 = basisFrom(T[0]).e1;
        for (let i = 0; i < N; i++) {
            let n = vsub(n0, vmul(T[i], vdot(n0, T[i])));
            if (vlen(n) < 1e-4) n = basisFrom(T[i]).e1;
            n = vnorm(n); NR.push(n); BR.push(vcross(T[i], n)); n0 = n;
        }
        const base = buf.nv, M = sides;
        for (let i = 0; i < N; i++) {
            const c = path[i], r = radii[i], s = i / (N - 1);
            const dr = (i < N - 1 ? radii[i + 1] - radii[i] : radii[i] - radii[i - 1]);
            const ds = (i < N - 1 ? vlen(vsub(path[i + 1], path[i])) : vlen(vsub(path[i], path[i - 1]))) || 1e-4;
            const slope = dr / ds;
            for (let j = 0; j <= M; j++) {
                const phi = (j % M) / M * TAU, cs = Math.cos(phi), sn = Math.sin(phi);
                const rr = r * (shapeFn ? shapeFn(s, phi) : 1);
                const rx = NR[i].x * cs + BR[i].x * sn, ry = NR[i].y * cs + BR[i].y * sn, rz = NR[i].z * cs + BR[i].z * sn;
                const px = c.x + rx * rr, py = c.y + ry * rr, pz = c.z + rz * rr;
                const nx = rx - T[i].x * slope, ny = ry - T[i].y * slope, nz = rz - T[i].z * slope;
                const l = Math.hypot(nx, ny, nz) || 1;
                const col = colFn(s, phi, px, py, pz);
                buf.vert(px, py, pz, nx / l, ny / l, nz / l, col[0], col[1], col[2]);
            }
        }
        const W = M + 1;
        for (let i = 0; i < N - 1; i++) for (let j = 0; j < M; j++) { const A = base + i * W + j; buf.quad(A, A + 1, A + W, A + W + 1); }
        if (capEnd) {
            const c = path[N - 1], en = T[N - 1], col = colFn(1, 0, c.x, c.y, c.z);
            const ci = buf.vert(c.x, c.y, c.z, en.x, en.y, en.z, col[0], col[1], col[2]);
            const o = base + (N - 1) * W;
            for (let j = 0; j < M; j++) buf.tri(ci, o + j, o + j + 1);
        }
    }
    // 隣のドームが張る立体角の半球比を足す（頂点に焼く AO）
    function sphereAO(px, py, pz, nx, ny, nz, list, self, strength, floor) {
        let occ = 0;
        for (const d of list) {
            if (d === self) continue;
            const vx = d.c.x - px, vy = d.c.y - py, vz = d.c.z - pz;
            const dist = Math.sqrt(vx * vx + vy * vy + vz * vz);
            if (dist < 1e-4) continue;
            const nd = (vx * nx + vy * ny + vz * nz) / dist;
            if (nd <= 0) continue;
            const rr = d.R / Math.max(dist, d.R * 1.0001);
            occ += 0.5 * (1 - Math.sqrt(Math.max(0, 1 - rr * rr))) * nd;
        }
        return clamp(1 - occ * strength, floor, 1);
    }

    // ゆでたブロッコリー：生より明るい緑、果粉は落ちて水で濡れている
    const BRO = {
        // 濡れた濃緑の花蕾、付け根の黄緑、茹でた茎の淡いライム色。
        budTop: [0.23, 0.51, 0.055], budSide: [0.09, 0.32, 0.025], budDeep: [0.035, 0.175, 0.020],
        budYellow: [0.670, 0.800, 0.130], curdSkin: [0.135, 0.365, 0.035],
        branchHi: [0.55, 0.75, 0.18], branchLo: [0.38, 0.60, 0.07],
        stemHi: [0.65, 0.80, 0.31], stemLo: [0.48, 0.71, 0.16],
        budR: 0.043, budSpacing: 0.76, budAspect: 0.86, budJitter: 0.23, budCullDot: 0.55,
        domeSquash: 0.78, lumpAmp: 0.28, lumpFreq: 2.3, domeSink: 0.32,
        aoStrength: 0.90, aoFloor: 0.32, yellowAmt: 0.92
    };
    const LUMP_GAIN = 2.8, DEPS = 0.055;
    function lumpAt(dome, d) {
        return 1 + BRO.lumpAmp * (Noise.fbm3(d.x * BRO.lumpFreq + dome.ox, d.y * BRO.lumpFreq + dome.oy, d.z * BRO.lumpFreq + dome.oz, dome.nseed, 2) - 0.5) * LUMP_GAIN;
    }
    function domeSurface(dome, d) {
        const k = lumpAt(dome, d), a = dome.R * k, b = dome.R * BRO.domeSquash * k;
        // 裏側を枝先へ絞り、房の下に大きな球面が露出するのを防ぐ。
        const taper = d.z >= 0 ? 1 : 0.16 + 0.84 * Math.pow(1 + d.z, 0.8);
        const ribs = 1 + 0.055 * Math.cos(9 * Math.atan2(d.y, d.x)) * (1 - smooth(-0.8, 0.15, d.z));
        const lx = d.x * a * taper * ribs, ly = d.y * a * taper * ribs, lz = d.z * b;
        return vec(dome.c.x + dome.e1.x * lx + dome.e2.x * ly + dome.ax.x * lz,
            dome.c.y + dome.e1.y * lx + dome.e2.y * ly + dome.ax.y * lz,
            dome.c.z + dome.e1.z * lx + dome.e2.z * ly + dome.ax.z * lz);
    }
    function domePoint(dome, d) {
        const p = domeSurface(dome, d), t = basisFrom(d);
        const pa = domeSurface(dome, vnorm(vadd(d, vmul(t.e1, DEPS)))), pb = domeSurface(dome, vnorm(vadd(d, vmul(t.e2, DEPS))));
        let n = vcross(vsub(pa, p), vsub(pb, p));
        const l = vlen(n);
        if (l < 1e-9) n = vnorm(vsub(p, dome.c)); else { n = vmul(n, 1 / l); if (vdot(n, vsub(p, dome.c)) < 0) n = vmul(n, -1); }
        return { p, n };
    }
    function insideNeighbor(p, near) {
        for (const b of near) {
            const vx = p.x - b.c.x, vy = p.y - b.c.y, vz = p.z - b.c.z;
            const lx = vx * b.e1.x + vy * b.e1.y + vz * b.e1.z, ly = vx * b.e2.x + vy * b.e2.y + vz * b.e2.z, lz = vx * b.ax.x + vy * b.ax.y + vz * b.ax.z;
            const q = Math.sqrt((lx * lx + ly * ly) / (b.R * b.R) + (lz * lz) / (b.R * b.R * BRO.domeSquash * BRO.domeSquash));
            if (q > 1.20) continue;
            if (q < lumpAt(b, vnorm(vec(lx, ly, lz))) * 0.985) return true;
        }
        return false;
    }

    const curdMat = named(new BABYLON.PBRMaterial("curdMat", scene), "curdMat");
    curdMat.metallic = 0; curdMat.roughness = 0.34;
    curdMat.clearCoat.isEnabled = true;             // ゆでたあとの水膜。生の果粉の艶消しとは逆
    curdMat.clearCoat.intensity = 0.80;
    curdMat.clearCoat.roughness = 0.18;
    curdMat.clearCoat.indexOfRefraction = 1.33;
    const broStemMat = named(new BABYLON.PBRMaterial("broStemMat", scene), "broStemMat");
    broStemMat.metallic = 0; broStemMat.roughness = 0.30;
    broStemMat.clearCoat.isEnabled = true;             // 水膜。茎の表面は花蕾より乾きやすいので弱め
    broStemMat.clearCoat.intensity = 0.65;
    broStemMat.clearCoat.roughness = 0.20;
    broStemMat.clearCoat.indexOfRefraction = 1.33;
    broStemMat.subSurface.isTranslucencyEnabled = true;
    broStemMat.subSurface.tintColor = new C3(0.67, 0.84, 0.27);
    broStemMat.subSurface.translucencyIntensity = 0.32;
    broStemMat.subSurface.minimumThickness = 0.3;
    broStemMat.subSurface.maximumThickness = 1.5;

    // 小房1個。R = 頭の半径（cm）。ローカル +Y が茎 → 頭の向き
    // opt.stemH / opt.stemR は R に対する比。opt.domes は房ドームの最少数
    function buildFloret(seed, R, opt) {
        opt = opt || {};
        const rng = new Rng(seed);
        const node = named(new BABYLON.TransformNode("floret", scene), "floret");
        const H = R * (opt.stemH != null ? opt.stemH : 0.70);     // 包丁で切り分けた茎。分岐が見える長さ
        const stemR = R * (opt.stemR != null ? opt.stemR : 0.26);
        // 五つの主枝 → 不揃いな小房 → 花蕾。球面へ一様に粒を敷く構造を避ける。
        const Ry=R*0.65,CY=H+Ry;
        const domes=[], groups=[];
        let sd=seed^0x5bf03635;
        const nextSeed=()=> (sd=(Math.imul(sd,1664525)+1013904223)>>>0)%90000;
        const groupSpec=[[-0.65,0.82,0.10],[-0.34,1.12,-0.38],[0.26,1.17,-0.28],[0.72,0.87,0.12],[0.02,0.92,0.52]];
        for(let gi=0;gi<groupSpec.length;gi++) {
            const g=groupSpec[gi], c=vec(g[0]*R,H+g[1]*R*0.85,g[2]*R);
            const ax=vnorm(vec(g[0]*0.40,1,g[2]*0.40)),basis=basisFrom(ax);
            const junction=vsub(c,vmul(ax,R*0.28));
            const group={c,junction,ax,e1:basis.e1,e2:basis.e2};groups.push(group);
            const count=gi===1?4:3,spin=rng.range(0,TAU);
            for(let k=0;k<count;k++) {
                const th=spin+k/count*TAU,spread=R*rng.range(0.20,0.27);
                const offset=vadd(vmul(basis.e1,Math.cos(th)*spread),vmul(basis.e2,Math.sin(th)*spread));
                const dc=vadd(c,vadd(offset,vmul(ax,rng.range(-0.08,0.10)*R)));
                const da=vnorm(vadd(ax,vmul(offset,0.9/R))),db=basisFrom(da);
                domes.push({c:dc,R:R*rng.range(0.34,0.47),ax:da,e1:db.e1,e2:db.e2,
                    anchor:junction,group:gi,young:gi===(seed===301?3:0)?(k===1?0.92:0.45):0.02,
                    nseed:nextSeed(),ox:rng.range(0,40),oy:rng.range(0,40),oz:rng.range(0,40)});
            }
        }
        for(const dm of domes)dm.near=domes.filter(other=>other!==dm);

        // ---- 茎と枝：SDF（カプセル錐の smooth union）→ Surface Nets ----
        // 筒を別々に掃引して突き刺すと分岐の付け根に継ぎ目と貫通が出る。写真の小房は茎が枝へ
        // 滑らかにつながり、股の部分に肉が付いているので、距離場の smooth min で一体に作る。
        // 切り口は y = 0 の半空間との交差。法線は距離場の勾配（面のカクつきが出ない）
        const HI = BRO.stemHi, LO = BRO.stemLo, BH = BRO.branchHi, BL = BRO.branchLo, nseed = nextSeed();
        const path0 = [], rad0 = [];
        for (let i = 0; i <= 8; i++) {
            const s = i / 8;
            path0.push(vec(0.05 * R * Math.sin(s * 3 + 1), s * H, 0.04 * R * Math.cos(s * 2.3)));
            // ほぼ一定の太さ。上端は枝の束の中へ細って消える（太い頭から枝を生やすと瘤になる）
            rad0.push(stemR * (0.94 + 0.06 * s) * (1 - 0.04 * Math.sin(Math.PI * s)) * (1 - 0.30 * smooth(0.80, 1.0, s)));
        }
        const flat = rng.range(0, TAU);          // 断面の平たい向き
        const fx = Math.cos(flat), fz = Math.sin(flat);
        const rTop = rad0[rad0.length - 1], rEnd = stemR * 0.28;
        // 枝：茎の上面の縁寄り（その房の方角）の内側から出て、房の中心で終わる
        const branches = [];
        const branchTargets = groups.map(g=>({c:g.junction,ax:g.ax,primary:true})).concat(domes);
        for (const dm of branchTargets) {
            let hx = dm.c.x, hz = dm.c.z, hl = Math.hypot(hx, hz);
            if (hl < 1e-3) { const a = rng.range(0, TAU); hx = Math.cos(a); hz = Math.sin(a); hl = 1; }
            const top = dm.primary ? vec(path0[4].x + hx/hl*rTop*0.30, H*0.52, path0[4].z + hz/hl*rTop*0.30) : dm.anchor;
            const P3 = dm.c, L = vlen(vsub(P3, top)), dirA = vnorm(vsub(P3, top));
            // はじめはほぼ真上へ束のまま伸び、途中から房へ向かって開く
            const d0 = vnorm(vadd(vmul(vec(0, 1, 0), 0.48), vmul(dirA, 0.52)));
            const P1 = vadd(top, vmul(d0, L * 0.40)), P2 = vsub(P3, vmul(dm.ax, L * 0.30));
            const pts = [], rads = [], ns = nextSeed();
            for (let i = 0; i <= 8; i++) {
                const s = i / 8, u = 1 - s, w = Math.sin(Math.PI * s) * 0.05 * L;
                pts.push(vec(
                    u * u * u * top.x + 3 * u * u * s * P1.x + 3 * u * s * s * P2.x + s * s * s * P3.x + (Noise.v3(s * 2.3, 0.5, 0.5, ns) - 0.5) * w,
                    u * u * u * top.y + 3 * u * u * s * P1.y + 3 * u * s * s * P2.y + s * s * s * P3.y + (Noise.v3(s * 2.3, 3.5, 0.5, ns + 7) - 0.5) * w * 0.5,
                    u * u * u * top.z + 3 * u * u * s * P1.z + 3 * u * s * s * P2.z + s * s * s * P3.z + (Noise.v3(s * 2.3, 7.5, 0.5, ns + 13) - 0.5) * w));
                // 付け根は太く、房へ向かって細る。房の直下でわずかに太る（花蕾の付け根）
                rads.push(mix(stemR*(dm.primary?0.58:0.29),stemR*(dm.primary?0.31:0.13),smooth(0.05,0.95,s)));
            }
            // 距離場の評価を速くするための包含箱（遠い点では枝ごとの線分距離を飛ばす）
            const bb = { x0: 1e9, y0: 1e9, z0: 1e9, x1: -1e9, y1: -1e9, z1: -1e9 };
            for (const q of pts) { bb.x0 = Math.min(bb.x0, q.x); bb.y0 = Math.min(bb.y0, q.y); bb.z0 = Math.min(bb.z0, q.z); bb.x1 = Math.max(bb.x1, q.x); bb.y1 = Math.max(bb.y1, q.y); bb.z1 = Math.max(bb.z1, q.z); }
            branches.push({ pts, rads, bb, rmax: Math.max(...rads) });
        }
        // 線分（半径は両端で補間）までの距離
        const segDist = (px, py, pz, a, b, ra, rb) => {
            const ax = b.x - a.x, ay = b.y - a.y, az = b.z - a.z;
            const vx = px - a.x, vy = py - a.y, vz = pz - a.z;
            const l2 = ax * ax + ay * ay + az * az || 1e-9;
            const t = clamp((vx * ax + vy * ay + vz * az) / l2, 0, 1);
            const dx = vx - ax * t, dy = vy - ay * t, dz = vz - az * t;
            return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * t);
        };
        const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return mix(b, a, h) - k * h * (1 - h); };
        const kStem = 0.06 * R, kBr = 0.025 * R;
        // 距離場。which: 0 = 茎、1 = 枝 が最寄り（色分けに使う）
        function sdf(px, py, pz, out) {
            // 茎：断面を少し平たくし（flat 方向に 1.08 倍、直交方向に 0.93 倍）、浅い縦の筋
            const ox = px - path0[4].x, oz = pz - path0[4].z;
            const u = ox * fx + oz * fz, v = -ox * fz + oz * fx;
            const qx = path0[4].x + (u / 1.08) * fx - (v / 0.93) * fz, qz = path0[4].z + (u / 1.08) * fz + (v / 0.93) * fx;
            let ds = 1e9;
            for (let i = 0; i < 8; i++) ds = Math.min(ds, segDist(qx, py, qz, path0[i], path0[i + 1], rad0[i], rad0[i + 1]));
            const ang = Math.atan2(v, u);
            ds += 0.012 * R * Math.cos(5 * ang + 0.7) + 0.006 * R * Math.cos(11 * ang);
            let db = 1e9;
            for (const br of branches) {
                const b = br.bb, far = br.rmax + kStem + kBr;
                if (px < b.x0 - far || px > b.x1 + far || py < b.y0 - far || py > b.y1 + far || pz < b.z0 - far || pz > b.z1 + far) continue;
                let d = 1e9;
                for (let i = 0; i < 8; i++) d = Math.min(d, segDist(px, py, pz, br.pts[i], br.pts[i + 1], br.rads[i], br.rads[i + 1]));
                db = smin(db, d, kBr);
            }
            let d = smin(ds, db, kStem);
            d = Math.max(d, -py);                       // 切り口（下端を平らに切る）
            if (out) { out.ds = ds; out.db = db; }
            return d;
        }
        // Surface Nets
        const cell = Math.max(0.045, R * 0.032);
        const bx0 = -R * 1.15, bz0 = -R * 1.15, by0 = -cell * 1.5;
        let yTop = 0;
        for (const dm of domes) yTop = Math.max(yTop, dm.c.y + dm.R);
        const NX = Math.ceil(2.3 * R / cell) + 2, NY = Math.ceil((yTop - by0 + cell) / cell) + 2, NZ = NX;
        const field = new Float32Array(NX * NY * NZ);
        const FI = (i, j, k) => (i * NY + j) * NZ + k;
        for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) for (let k = 0; k < NZ; k++)
            field[FI(i, j, k)] = sdf(bx0 + i * cell, by0 + j * cell, bz0 + k * cell, null);
        const stem = new MeshBuf(20000, 40000);
        const vidx = new Int32Array((NX - 1) * (NY - 1) * (NZ - 1)).fill(-1);
        const CI = (i, j, k) => (i * (NY - 1) + j) * (NZ - 1) + k;
        const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
        const corner = (c) => [(c >> 2) & 1, (c >> 1) & 1, c & 1];
        const tmp = { ds: 0, db: 0 };
        const CUT_C = [0.86, 0.90, 0.66], CUT_M = [0.80, 0.88, 0.56], CUT_E = [0.66, 0.80, 0.40];
        for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NY - 1; j++) for (let k = 0; k < NZ - 1; k++) {
            const f = [];
            let mask = 0;
            for (let c = 0; c < 8; c++) {
                const [a, b, cc] = corner(c);
                const val = field[FI(i + a, j + b, k + cc)];
                f.push(val); if (val < 0) mask |= 1 << c;
            }
            if (mask === 0 || mask === 255) continue;
            let sx = 0, sy = 0, sz = 0, n = 0;
            for (const [a, b] of EDGES) {
                if ((f[a] < 0) === (f[b] < 0)) continue;
                const t = f[a] / (f[a] - f[b]);
                const ca = corner(a), cb = corner(b);
                sx += ca[0] + (cb[0] - ca[0]) * t; sy += ca[1] + (cb[1] - ca[1]) * t; sz += ca[2] + (cb[2] - ca[2]) * t; n++;
            }
            const px = bx0 + (i + sx / n) * cell, py = by0 + (j + sy / n) * cell, pz = bz0 + (k + sz / n) * cell;
            // 法線：勾配（切り口の面は -y）
            const e = cell * 0.5;
            let nx = sdf(px + e, py, pz, null) - sdf(px - e, py, pz, null);
            let ny = sdf(px, py + e, pz, null) - sdf(px, py - e, pz, null);
            let nz = sdf(px, py, pz + e, null) - sdf(px, py, pz - e, null);
            const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
            sdf(px, py, pz, tmp);
            // 色：茎（淡いライム）と枝（やや濃い黄緑）を最寄りで混ぜる。縦の繊維と薄い斑
            const bw = smooth(-kStem, kStem, tmp.ds - tmp.db);
            const fib = 0.965 + 0.070 * Noise.fbm3(px * 9, py * 1.2, pz * 9, nseed + 31, 2);
            const mot = 0.93 + 0.14 * Noise.fbm3(px * 1.9, py * 1.9, pz * 1.9, nseed, 2);
            const up = smooth(0.0, 1.0, py / Math.max(H, 1e-3));
            let col = mix3(mix3(HI, BH, 0.45 * up), mix3(BH, BL, smooth(H, yTop, py)), bw);
            col = [col[0] * fib * mot, col[1] * fib * mot, col[2] * fib * mot];
            if (ny < -0.6 && py < cell) {
                // 切り口：中心の芯は淡く、外周の皮との境に細い輪
                const rr = Math.hypot(px - path0[0].x, pz - path0[0].z) / rad0[0];
                const nn = 0.95 + 0.10 * Noise.v2(px * 6, pz * 6, nseed + 5);
                col = rr < 0.55 ? mix3(CUT_C, CUT_M, smooth(0.25, 0.55, rr)) : mix3(CUT_M, CUT_E, smooth(0.55, 0.88, rr));
                col = [col[0] * nn, col[1] * nn, col[2] * nn];
            }
            const ao = sphereAO(px, py, pz, nx, ny, nz, domes, null, BRO.aoStrength * 0.85, BRO.aoFloor + 0.06);
            vidx[CI(i, j, k)] = stem.vert(px, py, pz, nx, ny, nz, lin(col[0] * ao), lin(col[1] * ao), lin(col[2] * ao));
        }
        // 符号が変わる辺のまわりの 4 セルで四角形を張る（向きは orient() が法線で揃える）
        for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NY - 1; j++) for (let k = 0; k < NZ - 1; k++) {
            const f0 = field[FI(i, j, k)] < 0;
            if (i > 0 && j > 0 && k > 0) {
                if ((field[FI(i + 1, j, k)] < 0) !== f0) stem.quad(vidx[CI(i, j - 1, k - 1)], vidx[CI(i, j, k - 1)], vidx[CI(i, j - 1, k)], vidx[CI(i, j, k)]);
                if ((field[FI(i, j + 1, k)] < 0) !== f0) stem.quad(vidx[CI(i - 1, j, k - 1)], vidx[CI(i, j, k - 1)], vidx[CI(i - 1, j, k)], vidx[CI(i, j, k)]);
                if ((field[FI(i, j, k + 1)] < 0) !== f0) stem.quad(vidx[CI(i - 1, j - 1, k)], vidx[CI(i, j - 1, k)], vidx[CI(i - 1, j, k)], vidx[CI(i, j, k)]);
            }
        }
        const stemMesh = stem.toMesh("floretStem", broStemMat);
        stemMesh.parent = node;

        // ---- 花蕾：下地 + 粒 ----
        const rb = BRO.budR, spacing = rb * 2 * BRO.budSpacing, cellA = 0.866 * spacing * spacing;
        let est = 0;
        for (const dm of domes) est += Math.round(4 * Math.PI * dm.R * dm.R * (1 + 2 * BRO.domeSquash) / 3 / cellA);
        const curd = new MeshBuf(est * 8 + domes.length * 24 * 14, est * 14 + domes.length * 24 * 14 * 2);
        const CS = BRO.curdSkin;
        for (const dm of domes) {
            const su = 22, sv = 13, base = curd.nv;
            for (let i = 0; i <= sv; i++) {
                const th = i / sv * Math.PI, st = Math.sin(th), ct = Math.cos(th);
                for (let j = 0; j <= su; j++) {
                    const ph = (j % su) / su * TAU;
                    const pn = domePoint(dm, vec(st * Math.cos(ph), st * Math.sin(ph), ct));
                    const sk = 0.93;
                    const p = vec(dm.c.x + (pn.p.x - dm.c.x) * sk, dm.c.y + (pn.p.y - dm.c.y) * sk, dm.c.z + (pn.p.z - dm.c.z) * sk);
                    const ao = sphereAO(p.x, p.y, p.z, pn.n.x, pn.n.y, pn.n.z, dm.near, dm, BRO.aoStrength, BRO.aoFloor) * 0.94;
                    const underside = 1 - smooth(-0.10, 0.35, ct);
                    const c = mix3(CS, BRO.branchHi, underside);
                    curd.vert(p.x, p.y, p.z, pn.n.x, pn.n.y, pn.n.z, lin(c[0] * ao), lin(c[1] * ao), lin(c[2] * ao));
                }
            }
            const W = su + 1;
            for (let i = 0; i < sv; i++) for (let j = 0; j < su; j++) { const A = base + i * W + j; curd.quad(A, A + 1, A + W, A + W + 1); }
        }
        const TOP = BRO.budTop, SIDE = BRO.budSide, DEEP = BRO.budDeep, YEL = BRO.budYellow, asp = BRO.budAspect;
        const seedY = rng.int(70000);
        for (const dm of domes) {
            const M = Math.max(24, Math.round(4 * Math.PI * dm.R * dm.R * (1 + 2 * BRO.domeSquash) / 3 / cellA));
            const sp = rng.range(0, TAU);
            for (let k = 0; k < M; k++) {
                const lz = 1 - 2 * (k + 0.5) / M, lr = Math.sqrt(Math.max(0, 1 - lz * lz)), th = k * 2.3999632 + sp;
                let d = vec(lr * Math.cos(th), lr * Math.sin(th), lz);
                const jitterBasis = basisFrom(d), jitterSize = rb / dm.R * 1.10;
                d = vnorm(vadd(d, vadd(vmul(jitterBasis.e1, (rng.next()-0.5)*jitterSize),
                    vmul(jitterBasis.e2, (rng.next()-0.5)*jitterSize))));
                if (d.z < -BRO.budCullDot) continue;                 // 枝の付け根側は刈る
                const pn = domePoint(dm, d), p = pn.p;
                if (insideNeighbor(p, dm.near)) continue;
                let nv = pn.n;
                const b0 = basisFrom(nv);
                nv = vnorm(vec(nv.x + (b0.e1.x * (rng.next() - 0.5) + b0.e2.x * (rng.next() - 0.5)) * BRO.budJitter,
                    nv.y + (b0.e1.y * (rng.next() - 0.5) + b0.e2.y * (rng.next() - 0.5)) * BRO.budJitter,
                    nv.z + (b0.e1.z * (rng.next() - 0.5) + b0.e2.z * (rng.next() - 0.5)) * BRO.budJitter));
                const bb = basisFrom(nv);
                const ao = sphereAO(p.x, p.y, p.z, nv.x, nv.y, nv.z, dm.near, dm, BRO.aoStrength, BRO.aoFloor);
                const lv = lumpAt(dm, d);
                const kk = clamp((lv - 1) / (BRO.lumpAmp * LUMP_GAIN * 0.5), -1, 1);
                const e = smooth(0.16, 0.86, clamp(0.46 + 0.38 * nv.y + 0.30 * kk, 0, 1));
                let cr = mix(SIDE[0], TOP[0], e), cg = mix(SIDE[1], TOP[1], e), cb = mix(SIDE[2], TOP[2], e);
                // 花蕾の外側は濃緑、枝へつながる帯は黄緑。単なる全体の明度変更にはしない。
                const patch=Noise.fbm3(p.x*1.8,p.y*1.8,p.z*1.8,seedY,2);
                const yv=BRO.yellowAmt*clamp(dm.young*(0.65+0.35*patch)
                    + 0.16*(1-smooth(-0.2,0.2,d.z))*smooth(0.40,0.70,patch),0,1);
                cr = mix(cr, YEL[0], yv); cg = mix(cg, YEL[1], yv); cb = mix(cb, YEL[2], yv);
                const jit = 0.95 + 0.10 * rng.next();
                cr *= jit; cg *= jit; cb *= jit;
                const dr = mix(DEEP[0], cr, ao), dg = mix(DEEP[1], cg, ao), db = mix(DEEP[2], cb, ao);
                const rr = rb * lv * (0.90 + 0.48 * rng.next());
                const cxp = p.x + nv.x * rr * asp * 0.52, cyp = p.y + nv.y * rr * asp * 0.52, czp = p.z + nv.z * rr * asp * 0.52;
                const off = curd.nv;
                for (let vi = 0; vi < 12; vi++) {
                    const V = ICO.V[vi];
                    const px = cxp + (bb.e1.x * V.x + bb.e2.x * V.y) * rr + nv.x * V.z * rr * asp;
                    const py = cyp + (bb.e1.y * V.x + bb.e2.y * V.y) * rr + nv.y * V.z * rr * asp;
                    const pz = czp + (bb.e1.z * V.x + bb.e2.z * V.y) * rr + nv.z * V.z * rr * asp;
                    const gx = (bb.e1.x * V.x + bb.e2.x * V.y) * asp + nv.x * V.z, gy = (bb.e1.y * V.x + bb.e2.y * V.y) * asp + nv.y * V.z, gz = (bb.e1.z * V.x + bb.e2.z * V.y) * asp + nv.z * V.z;
                    const gl = Math.hypot(gx, gy, gz) || 1;
                    // 粒の外を向いた面は明るく、谷を向いた面は谷の色まで落とす
                    const sh = 0.70 + 0.30 * smooth(-0.55, 0.90, V.z);
                    curd.vert(px, py, pz, gx / gl, gy / gl, gz / gl, lin(mix(DEEP[0] * ao, dr, sh)), lin(mix(DEEP[1] * ao, dg, sh)), lin(mix(DEEP[2] * ao, db, sh)));
                }
                for (let fi = 0; fi < 20; fi++) { const F = ICO.F[fi]; curd.tri(off + F[0], off + F[1], off + F[2]); }
            }
        }
        const curdMesh = curd.toMesh("floretCurd", curdMat);
        curdMesh.parent = node;
        return {node,meshes:[stemMesh,curdMesh],R,H,groups:groups.length,smallFlorets:domes.length};
    }
    const garnish = [];
    // 小さめの房を奥、大きめの房を手前に傾け、根元はチキンの後ろへ差し込む。
    const FLORET_SPECS = [
        { R:1.68, tilt:0.76, yaw:-0.25, roll:0.18, seed:301, target:{x:1.15,z:4.65} },
        { R:1.96, tilt:0.98, yaw:-0.14, roll:-0.40, seed:302, target:{x:3.10,z:3.40} }
    ];
    const florets = [];
    for (const sp of FLORET_SPECS) {
        const f = buildFloret(sp.seed, sp.R, { stemH: 0.45, stemR: 0.28 });   // 根元から扇状に分岐する短い茎
        f.spec = sp;
        f.node.rotation.set(sp.tilt, 0, -0.10);
        f.node.position.set(0, 0, 8);
        for (const m of f.meshes) { sg.addShadowCaster(m, false); garnish.push(m); }
        florets.push(f);
    }

    // ---- 花形にんじん（梅型）----
    // 切り口のテクスチャは人参の切り方サンプル（ninjin-cut-B）と同じ構成：
    //   芯（木部）と皮層の二重丸（境は星形にゆがみ数 mm 滲む）・放射状の筋・導管の点・刃跡（艶で見せる）
    // 【対策】芯を一色で塗ると型で抜いたように見える。中心はさらに淡く、外へ向かって橙が差す
    const CAR = {
        coreR: 0.46,
        fleshCore: [0.97, 0.365, 0.040], fleshOuter: [0.99, 0.395, 0.035], fleshRing: [1.0, 0.505, 0.070],
        fleshVessel: [0.91, 0.33, 0.025], fleshEdge: [0.87, 0.30, 0.025]
    };
    const carrotTex = (() => {
        const N = 512, n = N * N, seed = 7313;
        const core = new Float32Array(n), ring = new Float32Array(n), ray = new Float32Array(n), vessel = new Float32Array(n), blade = new Float32Array(n), h = new Float32Array(n);
        const BA = 0.55, ca = Math.cos(BA), sa = Math.sin(BA);
        for (let y = 0; y < N; y++) {
            const ny = (y / N - 0.5) * 2;
            for (let x = 0; x < N; x++) {
                const nx = (x / N - 0.5) * 2, i = y * N + x;
                const r = Math.hypot(nx, ny), th = Math.atan2(ny, nx);
                const cw = CAR.coreR * (1 + 0.10 * (Noise.fbm2(Math.cos(th) * 2.6, Math.sin(th) * 2.6, seed + 11, 2) - 0.5)
                    + 0.055 * Math.cos(5 * th + 1.7) + 0.030 * Math.cos(7 * th - 0.6));
                core[i] = 1 - smooth(cw - 0.12, cw + 0.12, r);
                ring[i] = Math.exp(-Math.pow((r - cw) / 0.065, 2));
                ray[i] = smooth(0.48, 0.82, Noise.fbm2(Math.cos(th) * 26 + r * 0.8, Math.sin(th) * 26, seed + 17, 3)) * smooth(0.06, 0.34, r);
                vessel[i] = smooth(0.82, 0.95, Noise.fbm2(nx * 62, ny * 62, seed + 23, 2)) * (0.30 + 0.90 * Math.pow(Math.max(0, 1 - Math.abs(r - CAR.coreR) / 0.34), 2));
                const s = (nx * ca + ny * sa) * 150 + 2.2 * Noise.fbm2(nx * 3, ny * 3, seed + 29, 2), f = s - Math.floor(s);
                blade[i] = Math.pow(Math.abs(Math.sin(Math.PI * f)), 3.0) * (0.45 + 0.55 * Noise.fbm2(nx * 2.2, ny * 2.2, seed + 31, 2));
                h[i] = clamp(0.60 - 0.010 * ring[i] - 0.020 * vessel[i] - 0.003 * blade[i]
                    + 0.070 * (Noise.fbm2(nx * 90, ny * 90, seed + 37, 2) - 0.5), 0, 1);
            }
        }
        const CO = CAR.fleshCore, OU = CAR.fleshOuter, RG = CAR.fleshRing, VS = CAR.fleshVessel;
        const albedo = makeTex(scene, "carrotA", N, N, (d) => {
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const nx = (x / N - 0.5) * 2, ny = (y / N - 0.5) * 2, i = y * N + x, o = i * 4, r = Math.hypot(nx, ny);
                const k = 1 - core[i];
                let cr = mix(CO[0], OU[0], k), cg = mix(CO[1], OU[1], k), cb = mix(CO[2], OU[2], k);
                const inner = core[i] * (1 - smooth(0.0, 0.80, r / CAR.coreR));
                cr = mix(cr, mix(CO[0], 1.0, 0.05), inner * 0.20); cg = mix(cg, mix(CO[1], 0.92, 0.05), inner * 0.20); cb = mix(cb, mix(CO[2], 0.62, 0.05), inner * 0.20);
                const mot = 0.98 + 0.04 * Noise.fbm2(nx * 5, ny * 5, seed + 41, 3) + 0.015 * (Noise.v2(nx * 110, ny * 110, seed + 43) - 0.5);
                cr *= mot; cg *= mot; cb *= mot;
                const ry = ray[i] * 0.06; cr = mix(cr, CO[0] * 0.97, ry); cg = mix(cg, CO[1] * 0.97, ry); cb = mix(cb, CO[2] * 0.97, ry);
                const rk = ring[i] * 0.46; cr = mix(cr, RG[0], rk); cg = mix(cg, RG[1], rk); cb = mix(cb, RG[2], rk);
                const vk = vessel[i] * 0.10; cr = mix(cr, VS[0], vk); cg = mix(cg, VS[1], vk); cb = mix(cb, VS[2], vk);
                const bk = blade[i] * 0.008; cr = mix(cr, OU[0], bk); cg = mix(cg, OU[1], bk); cb = mix(cb, OU[2], bk);
                d[o] = clamp(cr, 0, 1) * 255; d[o + 1] = clamp(cg, 0, 1) * 255; d[o + 2] = clamp(cb, 0, 1) * 255; d[o + 3] = 255;
            }
        });
        const orm = makeTex(scene, "carrotO", N, N, (d) => {
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const nx = (x / N - 0.5) * 2, ny = (y / N - 0.5) * 2, i = y * N + x, o = i * 4;
                // 煮たにんじんの切り口：水の膜で光るが、刃跡の谷と導管の穴だけ艶を落とす
                let rough = 0.30 + 0.08 * (1 - h[i]);
                rough = mix(rough, 0.38, blade[i] * 0.10);
                rough = mix(rough, 0.43, vessel[i] * 0.4);
                rough = mix(rough, rough * 0.72, smooth(0.55, 0.92, Noise.fbm2(nx * 3.5, ny * 3.5, seed + 53, 3)));
                let ao = 1.0;
                ao = mix(ao, 0.98, ring[i] * 0.4); ao = mix(ao, 0.95, vessel[i] * 0.5); ao = mix(ao, 0.99, blade[i] * 0.10);
                d[o] = ao * 255; d[o + 1] = clamp(rough, 0.05, 1) * 255; d[o + 2] = 0; d[o + 3] = 255;
            }
        }, true);
        const hg = new Float32Array(n);
        for (let i = 0; i < n; i++) hg[i] = (h[i] - 0.6) * 0.06;
        const normal = bakeNormal(scene, "carrotN", N, N, hg, N / (2 * 3.0), () => N / (2 * 3.0), false);
        return { albedo, orm, normal };
    })();
    const carrotMat = named(new BABYLON.PBRMaterial("carrotMat", scene), "carrotMat");
    carrotMat.albedoTexture = carrotTex.albedo;
    carrotMat.metallic = 0; carrotMat.roughness = 1;
    carrotMat.metallicTexture = carrotTex.orm;
    carrotMat.useAmbientOcclusionFromMetallicTextureRed = true;
    carrotMat.useRoughnessFromMetallicTextureGreen = true;
    carrotMat.useRoughnessFromMetallicTextureAlpha = false;
    carrotMat.useMetallnessFromMetallicTextureBlue = true;
    carrotMat.bumpTexture = carrotTex.normal;
    carrotMat.bumpTexture.level = 0.65;
    carrotMat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
    carrotMat.clearCoat.isEnabled = true;
    carrotMat.clearCoat.intensity = 0.62;        // 切り口の水の膜
    carrotMat.clearCoat.roughness = 0.23;
    carrotMat.clearCoat.indexOfRefraction = 1.33;
    carrotMat.subSurface.isTranslucencyEnabled = true;
    carrotMat.subSurface.tintColor = new C3(1.0, 0.39, 0.06);
    carrotMat.subSurface.translucencyIntensity = 0.20;
    carrotMat.subSurface.minimumThickness = 0.05;
    carrotMat.subSurface.maximumThickness = 0.8;
    // 梅型：5弁。花びらは丸く、切り込みは深い。UV は断面テクスチャの円板座標（皮はむいてあるので外周 0.9 まで）
    function buildCarrotFlower(seed, R, T) {
        const rng = new Rng(seed), N = 160, rot = rng.range(0,TAU), outline = [];
        for(let i=0;i<N;i++) {
            const a=i/N*TAU, petal=0.5+0.5*Math.cos(5*(a-rot));
            const radius=R*(0.70+0.30*Math.pow(petal,0.55))
                *(1+0.008*(Noise.v2(Math.cos(a)*3,Math.sin(a)*3,seed)-0.5));
            outline.push([radius*Math.cos(a),radius*Math.sin(a)]);
        }
        const outward=outline.map((p,i)=>{
            const prev=outline[(i+N-1)%N],next=outline[(i+1)%N];
            const dx=next[0]-prev[0],dz=next[1]-prev[1],len=Math.hypot(dx,dz);
            return [dz/len,-dx/len];
        });
        // 茹でて柔らかくなった縁。約0.6mmの丸みを上下面につける。
        const bevel=Math.min(0.065,T*0.13), profile=[], rows=22;
        for(let j=0;j<=rows;j++) profile.push({s:j/rows,inset:bevel,y:T,cap:true});
        for(let j=1;j<=5;j++) {
            const a=j/5*Math.PI/2;
            profile.push({s:1,inset:bevel*(1-Math.sin(a)),y:T-bevel*(1-Math.cos(a))});
        }
        profile.push({s:1,inset:0,y:bevel});
        for(let j=1;j<=5;j++) {
            const a=j/5*Math.PI/2;
            profile.push({s:1,inset:bevel*(1-Math.cos(a)),y:bevel*(1-Math.sin(a))});
        }
        profile.push({s:0,inset:bevel,y:0});
        const pos=[],uv=[],idx=[],row=N+1,UVS=0.5/(R*1.08);
        for(const q of profile) for(let i=0;i<=N;i++) {
            const p=outline[i%N],n=outward[i%N];
            const x=(p[0]-q.inset*n[0])*q.s,z=(p[1]-q.inset*n[1])*q.s;
            const wave=q.cap ? 0.012*(1-q.s*q.s)*(Noise.fbm2(x*2,z*2,seed+23,2)-0.5) : 0;
            pos.push(x,q.y+wave,z);uv.push(x*UVS+0.5,z*UVS+0.5);
        }
        for(let j=0;j<profile.length-1;j++) for(let i=0;i<N;i++) {
            const a=j*row+i,b=a+1,c=a+row,d=c+1;
            if(j>0)idx.push(a,b,c);
            if(j<profile.length-2)idx.push(b,d,c);
        }
        const normals=finishClosed(pos,idx);
        for(let j=0;j<profile.length;j++)weld(normals,[j*row,j*row+N]);
        for(const j of [0,profile.length-1])weld(normals,Array.from({length:row},(_,i)=>j*row+i));
        const mesh=named(new BABYLON.Mesh("carrot",scene),"carrot"),vd=new BABYLON.VertexData();
        vd.positions=pos;vd.indices=idx;vd.normals=normals;vd.uvs=uv;
        vd.applyToMesh(mesh,false);mesh.hasVertexAlpha=false;
        mesh.material=carrotMat;mesh.receiveShadows=true;
        // 下面には外周だけでなく面内もサンプルする。重なった人参の支持を取りこぼさない。
        const bottomSamples=[];
        for(let j=0;j<pos.length;j+=3)if(pos[j+1]<0.07)bottomSamples.push(new V3(pos[j],pos[j+1],pos[j+2]));
        for(let r=0;r<10;r++)for(let i=0;i<N;i+=2){
            const s=r/10,p=outline[i],n=outward[i];
            bottomSamples.push(new V3((p[0]-bevel*n[0])*s,0,(p[1]-bevel*n[1])*s));
        }
        mesh.metadata={bottomSamples,outline,T,bevel};
        return mesh;
    }
    const carrots=[];
    {
        const CT = 0.55;
        const specs = [
            { x: 5.95, z: 2.30, R: 1.48, yaw: 0.3, seed: 401 },
            { x: 6.25, z: 5.15, R: 1.38, yaw: 1.1, seed: 402 },
            { x: 6.80, z: 3.65, R: 1.48, yaw: 2.0, seed: 403 }   // 2枚の下段にまたがる低い重ね盛り
        ];
        const supportSurfaces=[];
        const inside=(x,z,polygon)=>{
            let yes=false;
            for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
                const a=polygon[i],b=polygon[j];
                if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)yes=!yes;
            }
            return yes;
        };
        const supportAt=(x,z)=>{
            let h=plateTop(x,z);
            for(const s of supportSurfaces)if(inside(x,z,s.polygon))
                h=Math.max(h,s.point.y-(s.normal.x*(x-s.point.x)+s.normal.z*(z-s.point.z))/s.normal.y);
            return h;
        };
        for (const sp of specs) {
            const m = buildCarrotFlower(sp.seed, sp.R, CT);
            // 傾きを固定して持ち上げるのではなく、重心が最も低くなる接触姿勢を探す。
            // 皿と下段の人参は高さ関数で評価するため、画面の向きに依存しない。
            const samples=m.metadata.bottomSamples.filter((p,i)=>i%4===0);
            const evaluate=(pitch,roll)=>{
                const q=BABYLON.Quaternion.FromEulerAngles(pitch,sp.yaw,roll),matrix=BABYLON.Matrix.Identity();q.toRotationMatrix(matrix);
                let y=-Infinity;
                for(const p of samples){const v=V3.TransformCoordinates(p,matrix);y=Math.max(y,supportAt(sp.x+v.x,sp.z+v.z)-v.y);}
                const center=V3.TransformCoordinates(new V3(0,CT/2,0),matrix);
                return {pitch,roll,q,y,energy:y+center.y};
            };
            let best=evaluate(0,0);
            for(const step of [0.16,0.08,0.04,0.02,0.01,0.005]){
                for(let iteration=0;iteration<5;iteration++){
                    const start=best;
                    for(const a of [-1,0,1])for(const b of [-1,0,1]){
                        const pitch=start.pitch+a*step,roll=start.roll+b*step;
                        if(Math.abs(pitch)>0.50||Math.abs(roll)>0.50)continue;
                        const test=evaluate(pitch,roll);if(test.energy<best.energy-1e-6)best=test;
                    }
                    if(best===start)break;
                }
            }
            m.rotationQuaternion=best.q;m.position.set(sp.x,0,sp.z);
            const matrix=m.computeWorldMatrix(true);
            let lift=-Infinity;const witnesses=[];
            // 最終高さは省略せず、面内を含む全サンプルと実メッシュへのレイで検証。
            for(const p of m.metadata.bottomSamples){
                const v=V3.TransformCoordinates(p,matrix);let h=plateTop(v.x,v.z),owner="plate";
                if(carrots.length){
                    const ray=new BABYLON.Ray(new V3(v.x,12,v.z),new V3(0,-1,0),20);
                    const hit=scene.pickWithRay(ray,c=>carrots.includes(c));
                    if(hit?.hit&&hit.pickedPoint.y>h){h=hit.pickedPoint.y;owner=hit.pickedMesh.name;}
                }
                lift=Math.max(lift,h-v.y);witnesses.push({x:v.x,z:v.z,required:h-v.y,owner});
            }
            m.position.y=lift+0.004;const world=m.computeWorldMatrix(true);
            const contacts=witnesses.filter(p=>lift-p.required<0.035);
            m.metadata.contact={gap:0.004,points:contacts,pitch:best.pitch,roll:best.roll};
            const point=V3.TransformCoordinates(new V3(0,CT,0),world),normal=V3.TransformNormal(V3.Up(),world).normalize();
            const polygon=m.metadata.outline.map(p=>V3.TransformCoordinates(new V3(p[0],CT-m.metadata.bevel,p[1]),world));
            supportSurfaces.push({point,normal,polygon});carrots.push(m);
            sg.addShadowCaster(m, false);
            garnish.push(m);
        }
    }

    // 実際の頂点と皿の上面から接地高さを求める。
    // 大きめの球による近似接触を使わないので、浮いた隙間を作らない。
    const broccoliContactMat = new BABYLON.StandardMaterial("broccoliContact",scene);
    broccoliContactMat.disableLighting=true;
    broccoliContactMat.emissiveColor=new C3(0.025,0.033,0.012);
    broccoliContactMat.backFaceCulling=false;
    function contactShadow(f,foot) {
        if(f.contactMesh)f.contactMesh.dispose();
        if(!foot || foot.gap>0.10){f.contactMesh=null;return;}
        const p=[],n=[],col=[],indices=[],NA=48,NR=8,row=NA+1;
        for(let r=0;r<=NR;r++)for(let a=0;a<=NA;a++) {
            const s=r/NR,angle=a/NA*TAU;
            const x=foot.x+Math.cos(angle)*s*f.R*0.48,z=foot.z+Math.sin(angle)*s*f.R*0.38;
            p.push(x,plateTop(x,z)+0.009,z);n.push(0,1,0);
            col.push(1,1,1,0.36*Math.exp(-3*s*s)*(1-smooth(0.7,1,s)));
        }
        for(let r=0;r<NR;r++)for(let a=0;a<NA;a++){
            const k=r*row+a;indices.push(k,k+row,k+1,k+1,k+row,k+row+1);
        }
        const mesh=new BABYLON.Mesh("broccoliContactShadow",scene),vd=new BABYLON.VertexData();
        vd.positions=p;vd.normals=n;vd.indices=indices;vd.colors=col;vd.applyToMesh(mesh);
        mesh.hasVertexAlpha=true;mesh.isPickable=false;mesh.material=broccoliContactMat;
        f.contactMesh=mesh;
    }
    function settleFlorets(sliceList) {
        // 付け合わせは皿に載せ、肉の背後へ差し込む。上からのレイで肉や人参の
        // 上面を床とみなすと、枝の下を通れる部分まで押し上げてしまう。
        const supports=[plate];
        for(const m of supports)m.computeWorldMatrix(true);
        for(const f of florets) {
            const sp=f.spec;f.node.rotationQuaternion=null;
            f.node.rotation.set(sp.tilt,sp.yaw,sp.roll);
            f.node.position.set(sp.target.x,0,sp.target.z);
            f.node.computeWorldMatrix(true);
            let lift=-Infinity, supportName="plate";
            const bottom=new Map();
            // 横位置ごとに最も低い頂点を保存。実メッシュ形状は保ち、レイの数を抑える。
            for(const mesh of f.meshes) {
                const p=mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),world=mesh.computeWorldMatrix(true);
                for(let i=0;i<p.length;i+=3) {
                    const v=V3.TransformCoordinates(new V3(p[i],p[i+1],p[i+2]),world);
                    lift=Math.max(lift,plateTop(v.x,v.z)-v.y);
                    const key=Math.round(v.x/0.15)+","+Math.round(v.z/0.15);
                    if(!bottom.has(key)||v.y<bottom.get(key).y)bottom.set(key,v);
                }
            }
            for(const p of bottom.values()) {
                const ray=new BABYLON.Ray(new V3(p.x,25,p.z),new V3(0,-1,0),30);
                const hit=scene.pickWithRay(ray,m=>supports.includes(m));
                if(hit&&hit.hit&&hit.pickedPoint.y-p.y>lift){lift=hit.pickedPoint.y-p.y;supportName=hit.pickedMesh.name;}
            }
            f.node.position.y=lift+0.012;
            console.log("[Teriyaki] broccoli contact",f.node.name,"y",f.node.position.y.toFixed(3),supportName);
            f.node.computeWorldMatrix(true);
            // 隣の房の上側を一律の床にしない。枝の下を通る空間まで塞がないため。
            let foot=null;
            for(const m of f.meshes){
                const world=m.computeWorldMatrix(true),p=m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
                for(let i=0;i<p.length;i+=3){
                    const v=V3.TransformCoordinates(new V3(p[i],p[i+1],p[i+2]),world),gap=v.y-plateTop(v.x,v.z);
                    if(!foot||gap<foot.gap)foot={x:v.x,z:v.z,gap};
                }
            }
            f.contactClearance=foot.gap;
            contactShadow(f,foot);
        }
    }

    // ---- 刻みねぎ：小口切りの輪。外は緑、内側は白っぽい ----
    const scallionMat = named(new BABYLON.PBRMaterial("scallionMat", scene), "scallionMat");
    scallionMat.metallic = 0; scallionMat.roughness = 0.45;
    scallionMat.backFaceCulling = false;
    scallionMat.twoSidedLighting = true;
    const scallionProto = (() => {
        const OUT = [0.36, 0.62, 0.14], IN = [0.80, 0.88, 0.62];
        const ro = 0.30, ri = 0.21, h = 0.26, segs = 16, row = segs + 1;
        const pos = [], col = [], idx = [];
        const ring = (rad, y, c) => { for (let j = 0; j <= segs; j++) { const a = j / segs * TAU; pos.push(rad * Math.cos(a), y, rad * Math.sin(a)); col.push(lin(c[0]), lin(c[1]), lin(c[2]), 1); } };
        ring(ro, 0, OUT); ring(ro, h, OUT); ring(ri, h, IN); ring(ri, 0, IN);   // 外壁 → 上端 → 内壁
        for (let s2 = 0; s2 < 3; s2++) for (let j = 0; j < segs; j++) {
            const a = s2 * row + j, b2 = a + 1, c = a + row, d = c + 1;
            idx.push(a, b2, c, b2, d, c);
        }
        const P = new Float32Array(pos), I = new Uint32Array(idx), normals = new Float32Array(P.length);
        BABYLON.VertexData.ComputeNormals(P, I, normals);
        const mesh = named(new BABYLON.Mesh("scallion", scene), "scallion");
        const vd = new BABYLON.VertexData();
        vd.positions = P; vd.indices = I; vd.normals = normals; vd.colors = new Float32Array(col);
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        mesh.material = scallionMat;
        mesh.isVisible = false;
        return mesh;
    })();
    let scallions = [];
    function scatterScallion(sh, slices, rng) {
        for (const m of scallions) m.dispose();
        scallions = [];
        if (!GLOBAL.scallion) return;
        const nS = slices.length, w = 2 * sh.A / nS;
        for (let i = 0; i < GLOBAL.scallionCount; i++) {
            const x = rng.range(-sh.A * 0.7, sh.A * 0.7);
            const z = sh.zc(x) + rng.range(-0.6, 0.6) * sh.halfW(x);
            const top = sh.topAt(x, z);
            if (!top) continue;
            const si = clamp(Math.floor((x + sh.A) / w), 0, nS - 1), sl = slices[si];
            const m = scallionProto.createInstance("scallion_" + (++uid));
            m.parent = sl.node;
            m.position.set(x - sl.center.x, top.y - 0.04 - sl.center.y, top.z - sl.center.z);
            // 輪は寝たり立ったり。寝ている物が多い
            const flat = rng.next() < 0.7;
            m.rotation.set(flat ? Math.atan2(top.nz, top.ny) + rng.range(-0.25, 0.25) : rng.range(1.1, 1.6), rng.range(0, TAU), flat ? rng.range(-0.2, 0.2) : 0);
            scallions.push(m);
        }
    }

    // たれ溜まり：皿の上にうすく広がる。縁へ向かって薄く透ける（頂点アルファ）
    const poolMat = named(new BABYLON.PBRMaterial("poolMat", scene), "poolMat");
    poolMat.metallic = 0; poolMat.roughness = 0.05;
    poolMat.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
    poolMat.backFaceCulling = false;
    poolMat.environmentIntensity = 0.35;
    poolMat.clearCoat.isEnabled = true;
    poolMat.clearCoat.roughness = 0.12;
    poolMat.clearCoat.intensity = 0.45;
    let pool = null;
    function buildPool(sh) {
        if (pool) { pool.dispose(); pool = null; }
        const NR = 32, NA = 144, row = NA + 1, ox = GLOBAL.originX, oz = GLOBAL.originZ;
        const rx = sh.A * 1.18, rz = sh.B * 1.38;   // 肉の周囲に細くたれを見せ、皿の余白を残す
        const nv = (NR + 1) * row;
        const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 4), nrm = new Float32Array(nv * 3);
        const C = [0.39, 0.15, 0.035];
        for (let r = 0; r <= NR; r++) {
            const s = r / NR;
            for (let a = 0; a <= NA; a++) {
                const o = r * row + a, ang = a / NA * TAU;
                const wob = 1 + 0.22 * (Noise.fbm2(Math.cos(ang) * 1.3 + 3, Math.sin(ang) * 1.3 + 5, sh.sP, 3) - 0.5) * 2;
                const x = ox + s * rx * wob * Math.cos(ang), z = oz - 0.9 + s * rz * wob * Math.sin(ang);
                pos[o * 3] = x; pos[o * 3 + 1] = plateTop(x, z) + 0.03 + 0.03 * (1 - s); pos[o * 3 + 2] = z;
                nrm[o * 3] = 0; nrm[o * 3 + 1] = 1; nrm[o * 3 + 2] = 0;
                col[o * 4] = lin(C[0]); col[o * 4 + 1] = lin(C[1]); col[o * 4 + 2] = lin(C[2]);
                col[o * 4 + 3] = smooth(1.0, 0.94, s);
            }
        }
        const idx = [];
        for (let r = 0; r < NR; r++) for (let a = 0; a < NA; a++) {
            const i0 = r * row + a, i1 = i0 + 1, j0 = i0 + row, j1 = j0 + 1;
            if (r > 0) idx.push(i0, j0, i1);
            idx.push(i1, j0, j1);
        }
        const tn = triNormal(pos, idx[idx.length - 3], idx[idx.length - 2], idx[idx.length - 1]);
        if (tn[1] < 0) flipIdx(idx);
        pool = named(new BABYLON.Mesh("saucePool", scene), "saucePool");
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = idx; vd.normals = nrm; vd.colors = col;
        vd.applyToMesh(pool, false);
        pool.hasVertexAlpha = true;
        pool.material = poolMat;
        pool.receiveShadows = true;
    }

    // ごま（白いり胡麻）
    const sesameMat = named(new BABYLON.PBRMaterial("sesameMat", scene), "sesameMat");
    sesameMat.albedoColor = new C3(0.93, 0.87, 0.72);
    sesameMat.metallic = 0; sesameMat.roughness = 0.45;
    const sesameProto = named(BABYLON.MeshBuilder.CreateSphere("sesame", { diameterX: 0.36, diameterY: 0.14, diameterZ: 0.21, segments: 8 }, scene), "sesame");
    sesameProto.material = sesameMat;
    sesameProto.isVisible = false;          // 非表示にしてもインスタンスは描かれる（setEnabled だと消える）
    let seeds = [];
    function sprinkle(sh, slices, rng) {
        for (const s of seeds) s.dispose();
        seeds = [];
        if (!GLOBAL.sesame) return;
        const nS = slices.length, w = 2 * sh.A / nS;
        for (let i = 0; i < GLOBAL.sesameCount; i++) {
            const x = rng.range(-sh.A * 0.88, sh.A * 0.88);
            const z = sh.zc(x) + rng.range(-0.8, 0.8) * sh.halfW(x);
            const top = sh.topAt(x, z);
            if (!top) continue;
            const si = clamp(Math.floor((x + sh.A) / w), 0, nS - 1), sl = slices[si];
            const m = sesameProto.createInstance("sesame_" + (++uid));
            m.parent = sl.node;
            m.position.set(x - sl.center.x, top.y - 0.03 - sl.center.y, top.z - sl.center.z);
            // 皮の傾きに沿わせる（法線が (0, ny, nz)）
            m.rotation.set(Math.atan2(top.nz, top.ny), rng.range(0, TAU), 0);
            seeds.push(m);
        }
    }

    // =================================================================
    // 11. 生成
    // =================================================================
    let slices = [], skinTex = null, shape = null;
    let curPreset = START_PRESET, curSeed = START_SEED;
    const BUMPS = [{ label: "弱", level: 0.55 }, { label: "中", level: 1.0 }, { label: "強", level: 1.6 }];
    let bumpIdx = 1, dbgIdx = 0;
    const DEBUGS = ["通常", "白クレイ"];
    let buildMs = 0;

    function applyBump() {
        const lv = BUMPS[bumpIdx].level;
        if (skinMat.bumpTexture) skinMat.bumpTexture.level = lv;
        if (cutMat.bumpTexture) cutMat.bumpTexture.level = lv;
    }
    function applyDebug() {
        const white = dbgIdx === 1;
        const mats = [skinMat, cutMat, curdMat, broStemMat, carrotMat, scallionMat, plateMat, sesameMat];
        for (const m of mats) {
            if (!m._dbg) m._dbg = { a: m.albedoTexture, c: m.albedoColor.clone(), o: m.metallicTexture, r: m.roughness, cc: m.clearCoat.isEnabled, ss: m.subSurface.isTranslucencyEnabled };
            const d = m._dbg;
            m.albedoTexture = white ? null : d.a;
            m.albedoColor = white ? new C3(0.80, 0.80, 0.80) : d.c.clone();
            m.metallicTexture = white ? null : d.o;
            m.roughness = white ? 0.6 : d.r;
            m.clearCoat.isEnabled = white ? false : d.cc;
            m.subSurface.isTranslucencyEnabled = white ? false : d.ss;
        }
        // 頂点カラーの有無はメッシュ側のフラグで決まる
        for (const m of scene.meshes) m.useVertexColors = !white;
        if (pool) pool.setEnabled(!white);
        for(const f of florets)if(f.contactMesh)f.contactMesh.setEnabled(!white);
    }

    function build(presetKey, seed) {
        const t0 = performance.now();
        for (const s of seeds) s.dispose();
        seeds = [];
        for (const m of scallions) m.dispose();
        scallions = [];
        for (const sl of slices) { for (const m of sl.meshes) m.dispose(); sl.node.dispose(); }
        slices = [];
        if (skinTex) { for (const k in skinTex) skinTex[k].dispose(); skinTex = null; }
        const cfg = Object.assign({ key: presetKey }, PRESETS[presetKey]);
        shape = new ThighShape(seed);

        skinTex = bakeSkin(shape, cfg);
        skinMat.albedoTexture = skinTex.albedo;
        skinMat.metallicTexture = skinTex.orm;
        skinMat.bumpTexture = skinTex.normal;
        skinMat.clearCoat.texture = skinTex.coat;
        if (skinMat._dbg) { skinMat._dbg.a = skinTex.albedo; skinMat._dbg.o = skinTex.orm; }

        const sm = sg.getShadowMap();
        if (sm && sm.renderList) {
            sm.renderList.length = 0;
            sm.renderList.push(plate);
            for (const g of garnish) sm.renderList.push(g);
        }
        for (let i = 0; i < GLOBAL.slices; i++) {
            const sl = buildSlice(shape, cfg, i, GLOBAL.slices);
            slices.push(sl);
            for (const m of sl.meshes) sg.addShadowCaster(m, false);
        }
        layout(shape, slices, new Rng(seed ^ 0x2545F491));
        buildPool(shape);
        sprinkle(shape, slices, new Rng(seed ^ 0x5bd1e995));
        scatterScallion(shape, slices, new Rng(seed ^ 0x27d4eb2f));
        settleFlorets(slices);
        applyBump();
        applyDebug();
        buildMs = performance.now() - t0;
        console.log("[Teriyaki]", BUILD, "/", cfg.label, "/ seed =", seed, "/", slices.length, "切れ /",
            "もも " + (shape.A * 2).toFixed(1) + " x " + (shape.B * 2).toFixed(1) + " cm /", buildMs.toFixed(0), "ms");
    }

    build(START_PRESET, START_SEED);

    if (GLOBAL.useSSAO && BABYLON.SSAO2RenderingPipeline.IsSupported) {
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.65;
        ssao.totalStrength = 0.65;
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
    dp.bloomWeight = 0.05;
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
    // 12. GUI
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

    const COL = { idle: "#2a1c12", active: "#8a4a1c", edge: "#4a3428", text: "#fbf1e4", sub: "#c9ae94", accent: "#f0b978" };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "236px";
    card.height = "720px";
    const scroll = new BABYLON.GUI.ScrollViewer("menuScroll");
    scroll.thickness = 0; scroll.barColor = "#8a4a1c"; scroll.barSize = 6;
    scroll.wheelPrecision = 40; card.addControl(scroll);
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(20,12,7,0.86)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "62px";
    ui.addControl(card);
    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "232px"; panel.isVertical = true;
    panel.paddingLeft = "14px"; panel.paddingRight = "14px";
    panel.paddingTop = "14px"; panel.paddingBottom = "14px";
    scroll.addControl(panel);

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

    addLabel("TERIYAKI CHICKEN", 11, COL.sub, "18px");
    addLabel("照り", 13, COL.accent, "22px");
    const presetBtns = {};
    function highlight() { for (const k in presetBtns) presetBtns[k].background = (k === curPreset) ? COL.active : COL.idle; }
    for (const k of Object.keys(PRESETS)) {
        presetBtns[k] = addButton("p_" + k, PRESETS[k].label, () => { curPreset = k; build(curPreset, curSeed); highlight(); });
    }
    addLabel("切り数", 13, COL.accent, "26px");
    addRow("count", [6, 7, 8].map(v => ({ label: v + " 切れ", value: v })), v => v === GLOBAL.slices,
        v => { GLOBAL.slices = v; build(curPreset, curSeed); });
    addLabel("薬味", 13, COL.accent, "26px");
    addRow("sesame", [{ label: "ごま あり", value: true }, { label: "なし", value: false }], v => v === GLOBAL.sesame,
        v => { GLOBAL.sesame = v; if (shape) sprinkle(shape, slices, new Rng(curSeed ^ 0x5bd1e995)); applyDebug(); });
    addRow("scallion", [{ label: "ねぎ あり", value: true }, { label: "なし", value: false }], v => v === GLOBAL.scallion,
        v => { GLOBAL.scallion = v; if (shape) scatterScallion(shape, slices, new Rng(curSeed ^ 0x27d4eb2f)); applyDebug(); });
    addLabel("皿", 13, COL.accent, "26px");
    addRow("plateKind", [{ label: "粉引", value: "stone" }, { label: "水玉", value: "dots" }], v => v === curPlate,
        v => { curPlate = v; if (plateMat._dbg) plateMat._dbg.a = plateTex[curPlate]; if (dbgIdx === 0) plateMat.albedoTexture = plateTex[curPlate]; });
    addButton("reseed", "別の鶏ももを焼く", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(curPreset, curSeed);
    });
    const bumpBtn = addButton("bump", "凹凸: 中", () => {
        bumpIdx = (bumpIdx + 1) % BUMPS.length;
        applyBump();
        bumpBtn.textBlock.text = "凹凸: " + BUMPS[bumpIdx].label;
    });
    const dbgBtn = addButton("debug", "表示: 通常", () => {
        dbgIdx = (dbgIdx + 1) % DEBUGS.length;
        applyDebug();
        toggle(dbgBtn, dbgIdx !== 0, "表示: " + DEBUGS[dbgIdx]);
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
        const win = (typeof window !== "undefined") ? window : {};
        return { w: (c && c.clientWidth) || win.innerWidth || 1024, h: (c && c.clientHeight) || win.innerHeight || 768 };
    }
    function isCompact() {
        const v = viewportCss();
        return v.w < GLOBAL.compactWidth || Math.min(v.w, v.h) < GLOBAL.compactMinSide;
    }
    const toggleBtn = BABYLON.GUI.Button.CreateSimpleButton("guiToggle", "≡");
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
        camera.fov = narrow ? 0.88 : 0.62;
        const scale = isCompact() ? clamp(engine.getRenderWidth() / Math.max(1, viewportCss().w), 1, GLOBAL.guiMaxScale) : 1;
        for (const c of [toggleBtn, card]) { c.transformCenterX = 0; c.transformCenterY = 0; c.scaleX = scale; c.scaleY = scale; }
        card.top = (16 + 38 * scale + 8) + "px";
        card.height = Math.max(140, Math.min(602, (engine.getRenderHeight() - 84 * scale) / scale)) + "px";
        card.isVisible = panelOpen;
        if (toggleBtn.textBlock) toggleBtn.textBlock.text = panelOpen ? "×" : "≡";
    }
    toggleBtn.onPointerUpObservable.add(() => { panelOpen = !panelOpen; applyGuiLayout(); });
    const resizeObserver = engine.onResizeObservable.add(applyGuiLayout);
    scene.onDisposeObservable.add(() => { engine.onResizeObservable.remove(resizeObserver); });

    highlight();
    applyGuiLayout();

    scene.metadata = { build: BUILD, ui, florets, plateTop, rendering: dp, get slices() { return slices; },
        get preset() { return curPreset; }, get seed() { return curSeed; } };
    return scene;
};

export default createScene;