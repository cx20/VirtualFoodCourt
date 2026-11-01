// 焼き餃子 — Babylon.js Playground (JavaScript)
// 全文を貼り付けて Run。左上 ≡ で焼き色・個数・皿・背景を変更。
// 形状とテクスチャはすべて手続き生成。環境光のみ Babylon.js 公式配布 .env を使用。

var createScene = async function () {
    // =================================================================
    // 0. CONFIG （単位は cm）
    // =================================================================
    const BUILD = "gyoza-photo-study-1";

    // 色は sRGB。参考写真の焼き面・皮（ハイライトを避けた所）から取った値
    const PRESETS = {
        hodoyoi: {
            label: "ほどよい焼き色",
            doneness: 1.00,     // 焼き色の基準
            reach: 0.30,        // 底面からどの高さまで焼き色が回るか（cm）
            spot: 0.55,         // 焦げの点
            lace: 0.45,         // 焼き面の網目
            rough: 0.50,
            skin:  [0.925, 0.885, 0.775],
            edge:  [0.905, 0.770, 0.500],
            gold:  [0.950, 0.650, 0.260],
            brown: [0.800, 0.430, 0.135],
            dark:  [0.470, 0.250, 0.100],
            char:  [0.270, 0.140, 0.070]
        },
        kongari: {
            label: "こんがり",
            doneness: 1.28, reach: 0.38, spot: 0.80, lace: 0.60, rough: 0.46,
            skin:  [0.920, 0.875, 0.760],
            edge:  [0.890, 0.735, 0.450],
            gold:  [0.840, 0.560, 0.250],
            brown: [0.660, 0.380, 0.140],
            dark:  [0.430, 0.220, 0.085],
            char:  [0.240, 0.120, 0.055]
        },
        usuyaki: {
            label: "うす焼き",
            doneness: 0.74, reach: 0.22, spot: 0.30, lace: 0.30, rough: 0.52,
            skin:  [0.930, 0.895, 0.790],
            edge:  [0.920, 0.800, 0.560],
            gold:  [0.880, 0.660, 0.360],
            brown: [0.740, 0.480, 0.220],
            dark:  [0.520, 0.300, 0.130],
            char:  [0.300, 0.165, 0.080]
        }
    };

    const GLOBAL = {
        count: 6,
        // 1個の寸法（焼くときの姿勢）。長さ 8.6、底の幅 3.1、高さ 1.9 + 閉じ目 0.3
        length: 8.6,
        bow: 1.55,              // 三日月の反り（中央が手前へ出る量）
        halfW: 1.80,
        height: 1.90,
        fin: 0.30,              // 閉じ目（ひだを寄せた耳）の高さ
        finT: 0.085,            // 閉じ目の厚み（片側）
        pleatAmp: 0.32,         // ひだの深さ
        pleatSlant: 0.35,       // ひだが斜めに流れる量
        NU: 168, NT: 128,       // メッシュの分割（長手 × 断面一周）
        texW: 768, texH: 384,   // 1個あたりのテクスチャ（u = 長手、v = 断面一周）

        // 並べ方
        spacing: 2.50,          // 隣との間隔
        roll: 0.30,             // 焼き面を左へ傾ける量（rad）
        rowYaw: -0.06,
        turn: 0.12,             // 1個ずつの向き：ひだ側を手前（カメラ側）へ回す量

        // 楕円皿（見込みの楕円の半径。縁は外へ一定幅で広がる）
        wellA: 11.2, wellB: 7.4,
        plateTexW: 4096, plateTexH: 512,

        // 物理（Havok）。単位が cm なので重力は実寸の 981 ではなく安定域の 620
        usePhysics: false,
        gravity: 620,
        timeStep: 1 / 120,
        dropLift: 0.6,          // 解析で求めた置き場所から、どれだけ上で放すか
        dropInterval: 0.25,     // 1個ずつ放す間隔（物理時間の秒）
        settleTimeout: 4.0,     // 最後の1個を放してから、これを過ぎたら固定する
        hullShrink: 0.96,       // 凸包は凹みをまたいで張られるので少し内側へ（高さ方向は縮めない）

        useSSAO: true,
        useDOF: false,
        dofRatio: 0.070,
        dofFStop: 2.8,
        guiOwnCamera: false,    // true で GUI 専用カメラ（Inspector の表示が崩れる）

        compactWidth: 700,
        compactMinSide: 480,
        guiMaxScale: 2.2
    };

    const START_PRESET = "hodoyoi";
    const START_SEED = 20261014;

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
        // 閉じた立体の表面に使うので 3D で評価する（UV の継ぎ目が出ない）
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

    // 閉じた Catmull-Rom で細分（[s, y] の配列 → 平坦な Float64Array）
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

    // =================================================================
    // 2. 餃子の形
    // =================================================================
    // 焼くときの姿勢で作る：x が長手、y が上（y = 0 の平らな底が焼き面）、
    // z が手前（ひだを寄せた側）。断面は底の平らな「しずく形」で、頂点に閉じ目が立つ。
    //
    // 【対策】ひだを寄せた側は皮が余るぶん外へ張り出し、反対側は短い。
    //         だから三日月はひだ側が外周（凸）になる。逆に反らすと柏餅に見える
    const PROF_FRONT = [[0.00, 0.000], [0.42, 0.000], [0.76, 0.015], [0.94, 0.090], [1.00, 0.250],
        [0.96, 0.440], [0.82, 0.620], [0.60, 0.780], [0.34, 0.900], [0.12, 0.975]];
    const PROF_BACK = [[-0.14, 0.975], [-0.38, 0.890], [-0.64, 0.740], [-0.86, 0.530],
        [-0.97, 0.310], [-0.96, 0.130], [-0.80, 0.025], [-0.44, 0.000]];

    class GyozaShape {
        constructor(seed) {
            const G = GLOBAL, r = new Rng(seed);
            this.L = G.length * r.range(0.94, 1.06);
            this.bow = G.bow * r.range(0.80, 1.20);
            this.Wm = G.halfW * r.range(0.94, 1.06);
            this.Hm = G.height * r.range(0.92, 1.07);
            this.Fm = G.fin * r.range(0.80, 1.20);
            this.skew = r.range(-0.07, 0.07);       // 片方の端が太い
            this.nPleat = 5 + r.int(3);              // ひだの数 5〜7
            this.pu0 = r.range(0.13, 0.18);
            this.pu1 = r.range(0.82, 0.87);
            this.sA = r.int(90000) + 100;
            this.sP = r.int(90000) + 100;
            this.sL = r.int(90000) + 100;
        }

        dims(u) {
            const e = Math.max(0, Math.sin(Math.PI * u) * (1 + this.skew * (2 * u - 1)));
            const wn = 1 + 0.06 * (Noise.v2(u * 5.0, 1.3, this.sA) - 0.5) * 2;
            const hn = 1 + 0.06 * (Noise.v2(u * 4.0, 7.1, this.sA + 3) - 0.5) * 2;
            const W = (0.10 + (this.Wm - 0.10) * Math.pow(e, 0.55)) * wn;
            const H = (0.30 + (this.Hm - 0.30) * Math.pow(e, 0.62)) * hn;
            const F = this.Fm * Math.pow(e, 0.35);
            return { e, W, H, F };
        }
        pleatMask(u) {
            return smooth(this.pu0 - 0.05, this.pu0 + 0.04, u) * smooth(this.pu1 + 0.05, this.pu1 - 0.04, u);
        }
        // ひだの位相。閉じ目から下へ行くほど斜めに流れる。間隔は手で包んだぶん不揃い
        phase(u, drop) {
            let q = (u - this.pu0) / (this.pu1 - this.pu0);
            q += 0.035 * (Noise.v2(u * 7, 3.3, this.sP) - 0.5) * 2;
            return q * this.nPleat + GLOBAL.pleatSlant * drop;
        }
        // 重ねた皮の段差：ゆっくり盛り上がり、折り返しで急に落ちる
        fold(p) {
            const f = p - Math.floor(p);
            return smooth(0, 0.72, f) * (1 - smooth(0.78, 1.0, f));
        }

        // 長手パラメータ u の断面を一周 n 等分（弧長）で返す。t_k = (k + off) / n
        ringAt(u, n, off, lumps) {
            const G = GLOBAL;
            const { e, W, H, F } = this.dims(u);
            const pm = this.pleatMask(u);
            const ph0 = this.phase(u, 0);
            const wave = pm * Math.sin(TAU * ph0);
            const f0 = pm * (this.fold(ph0) - 0.5);
            const sr = -0.03 * W + 0.04 * wave;
            const ft = G.finT * (0.45 + 0.55 * e);
            const Ht = H * 0.975, Ft = F * (1 + 0.45 * f0);
            const ctrl = [];
            for (const p of PROF_FRONT) ctrl.push([p[0] * W, p[1] * H]);
            // 閉じ目。ひだの所で波打ち、高さも揃わない
            ctrl.push([sr + ft, Ht + 0.04 * F], [sr + 0.8 * ft + 0.02 * wave, Ht + 0.55 * Ft],
                [sr + 0.3 * ft + 0.035 * wave, Ht + Ft], [sr - 0.3 * ft + 0.035 * wave, Ht + Ft],
                [sr - 0.8 * ft + 0.02 * wave, Ht + 0.55 * Ft], [sr - ft, Ht + 0.04 * F]);
            for (const p of PROF_BACK) ctrl.push([p[0] * W, p[1] * H]);
            const P = catmull(ctrl, 6), m = P.length / 2;
            const cum = new Float64Array(m + 1);
            for (let i = 0; i < m; i++) {
                const j = (i + 1) % m;
                cum[i + 1] = cum[i] + Math.hypot(P[j * 2] - P[i * 2], P[j * 2 + 1] - P[i * 2 + 1]);
            }
            const per = cum[m];

            // 三日月の中心線（xz 平面）と横方向
            const cx = (u - 0.5) * this.L, cz = this.bow * (1 - (2 * u - 1) * (2 * u - 1));
            const tx = this.L, tz = -4 * this.bow * (2 * u - 1), tl = Math.hypot(tx, tz);
            const lx = -tz / tl, lz = tx / tl;

            const N1 = n + 1;
            const R = {
                n, per, W, H, Ht, sr, pm, cx, cz, lx, lz,
                X: new Float32Array(N1), Y: new Float32Array(N1), Z: new Float32Array(N1),
                S: new Float32Array(N1), NY: new Float32Array(N1),
                FO: new Float32Array(N1), FM: new Float32Array(N1)
            };
            for (let k = 0; k <= n; k++) {
                let t = (k + off) / n; t -= Math.floor(t);
                const target = t * per;
                let lo = 0, hi = m;
                while (hi - lo > 1) { const md = (lo + hi) >> 1; if (cum[md] <= target) lo = md; else hi = md; }
                const i = lo, j = (i + 1) % m;
                const a = (target - cum[i]) / ((cum[i + 1] - cum[i]) || 1e-9);
                const dx = P[j * 2] - P[i * 2], dy = P[j * 2 + 1] - P[i * 2 + 1];
                let s = P[i * 2] + dx * a, y = Math.max(0, P[i * 2 + 1] + dy * a);
                const dl = Math.hypot(dx, dy) || 1;
                const nx = dy / dl, ny = -dx / dl;      // 反時計回りの一周なので外向き

                // ---- ひだ（手前の側面の上半分）----
                const yr = clamp(y / H, 0, 1.3);
                let fm = pm * smooth(sr - 0.02, sr + 0.30 * W, s) * smooth(0.12, 0.70, yr);
                fm *= smooth(Ht + 0.02, Ht - 0.06, y);  // 閉じ目そのものは制御点で波打たせた
                const fo = this.fold(this.phase(u, 1 - yr));
                let d = G.pleatAmp * fm * (fo - 0.45);
                // ---- 具の詰まりによるでこぼこ（底面と閉じ目には出さない）----
                if (lumps) {
                    const wx = cx + lx * s, wz = cz + lz * s;
                    d += 0.065 * (Noise.fbm3(wx * 0.9, y * 0.9, wz * 0.9, this.sL, 3) - 0.5) * 2
                        * smooth(0.10, 0.45, yr) * smooth(Ht + 0.02, Ht - 0.12, y);
                }
                s += nx * d; y = Math.max(0, y + ny * d);
                R.S[k] = s; R.Y[k] = y; R.NY[k] = ny;
                R.X[k] = cx + lx * s; R.Z[k] = cz + lz * s;
                R.FO[k] = fo; R.FM[k] = fm;
            }
            return R;
        }
    }

    // =================================================================
    // 3. Gyoza （個体）
    // =================================================================
    class Gyoza {
        constructor(scene, cfg, seed) {
            this.scene = scene; this.cfg = cfg; this.seed = seed >>> 0;
            const rng = new Rng(this.seed * 7 + 11);
            this.shape = new GyozaShape(this.seed);
            this.tone = rng.range(-0.07, 0.07);
            this.sB = rng.int(90000) + 100;
            this.node = named(new BABYLON.TransformNode("gyoza", scene), "gyoza");
            this.node.rotationQuaternion = BABYLON.Quaternion.Identity();
            this._buildTextures();
            this._buildMesh();
            this.body = null; this.hull = null;
        }

        // 衝突形状：同じ形状関数を低解像度（具のでこぼこ無し）で評価した凸包。
        // 表示用（2万頂点）から作ると重く、ほぼ同一平面の面が増えて接触が震える
        makeHull(scene) {
            if (this.hull) return this.hull;
            const sh = this.shape, NU = 20, NT = 18, pts = [];
            for (let r = 0; r < NU; r++) {
                const u = 0.5 - 0.5 * Math.cos(Math.PI * r / (NU - 1));
                const R = sh.ringAt(u, NT, 0, false);
                for (let k = 0; k < NT; k++) pts.push(R.X[k], R.Y[k], R.Z[k]);
            }
            let cx = 0, cy = 0, cz = 0;
            const m = pts.length / 3;
            for (let i = 0; i < m; i++) { cx += pts[i * 3]; cy += pts[i * 3 + 1]; cz += pts[i * 3 + 2]; }
            cx /= m; cy /= m; cz /= m;
            const k = GLOBAL.hullShrink;
            for (let i = 0; i < m; i++) {
                pts[i * 3] = cx + (pts[i * 3] - cx) * k;
                pts[i * 3 + 2] = cz + (pts[i * 3 + 2] - cz) * k;
            }
            const idx = [];
            for (let i = 0; i + 2 < m; i += 3) idx.push(i, i + 1, i + 2);
            const proxy = new BABYLON.Mesh("gyozaProxy", scene);
            const vd = new BABYLON.VertexData();
            vd.positions = pts; vd.indices = idx;
            vd.applyToMesh(proxy, false);
            this.hull = new BABYLON.PhysicsShapeConvexHull(proxy, scene);
            this.hull.material = { friction: 0.75, restitution: 0.02 };
            proxy.dispose();
            return this.hull;
        }

        // 解析で求めた姿勢へ戻す（dy だけ持ち上げる）
        resetPose(dy) {
            const p = this.pose;
            this.node.rotationQuaternion = BABYLON.Quaternion.FromRotationMatrix(p.M);
            this.node.rotation.set(0, 0, 0);
            this.node.position.set(p.bx, p.lift + dy, p.bz);
            this.node.computeWorldMatrix(true);
        }

        release(scene) {
            this.resetPose(GLOBAL.dropLift);
            this.node.setEnabled(true);
            const body = new BABYLON.PhysicsBody(this.node, BABYLON.PhysicsMotionType.DYNAMIC, false, scene);
            body.shape = this.makeHull(scene);
            body.setMassProperties({ mass: 1 });
            body.setLinearDamping(0.15);
            body.setAngularDamping(0.90);
            body.disablePreStep = true;
            this.body = body;
        }

        // 静止後は物理から外し、姿勢を Euler に焼く（Inspector v2 の例外を避ける）。
        // 【対策】Havok の接触許容量は絶対値（m 前提）なので、cm のシーンでは表示面が皿へ
        //         1〜2mm 沈んだまま止まる。最後に皿の上面との食い込みぶんだけ持ち上げる
        freeze(topAt) {
            if (this.body) { this.body.dispose(); this.body = null; }
            const q = this.node.rotationQuaternion;
            if (q) { this.node.rotation = q.toEulerAngles(); this.node.rotationQuaternion = null; }
            const wm = this.node.computeWorldMatrix(true).m, p = this.pos;
            let pen = 0;
            for (let i = 0; i < p.length; i += 6) {
                const x = p[i], y = p[i + 1], z = p[i + 2];
                const wx = x * wm[0] + y * wm[4] + z * wm[8] + wm[12];
                const wy = x * wm[1] + y * wm[5] + z * wm[9] + wm[13];
                const wz = x * wm[2] + y * wm[6] + z * wm[10] + wm[14];
                pen = Math.max(pen, topAt(wx, wz) - wy);
            }
            this.node.position.y += pen;
            this.node.computeWorldMatrix(true);
            return pen;
        }

        _buildMesh() {
            const G = GLOBAL, NU = G.NU, NT = G.NT, row = NT + 1, sh = this.shape;
            const nv = NU * row;
            const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
            for (let r = 0; r < NU; r++) {
                // 先端ほど輪を詰める（端の丸みを粗い段で削らない）
                const u = 0.5 - 0.5 * Math.cos(Math.PI * r / (NU - 1));
                const R = sh.ringAt(u, NT, 0, true);
                for (let k = 0; k <= NT; k++) {
                    const o = r * row + k;
                    pos[o * 3] = R.X[k]; pos[o * 3 + 1] = R.Y[k]; pos[o * 3 + 2] = R.Z[k];
                    uv[o * 2] = u; uv[o * 2 + 1] = k / NT;
                }
            }
            // 両端の輪を1点に潰して閉じる（皮を貼り合わせた先端）
            for (const [r, rn, u] of [[0, 1, 0], [NU - 1, NU - 2, 1]]) {
                let mx = 0, my = 0, mz = 0;
                for (let k = 0; k < NT; k++) { const o = (rn * row + k) * 3; mx += pos[o]; my += pos[o + 1]; mz += pos[o + 2]; }
                mx /= NT; my /= NT; mz /= NT;
                const tx = sh.L, tz = -4 * sh.bow * (2 * u - 1), tl = Math.hypot(tx, tz), sg = u < 0.5 ? -1 : 1;
                for (let k = 0; k <= NT; k++) {
                    const o = (r * row + k) * 3;
                    pos[o] = mx + sg * 0.10 * tx / tl; pos[o + 1] = my; pos[o + 2] = mz + sg * 0.10 * tz / tl;
                }
            }
            const idx = new Uint32Array((NU - 1) * NT * 6);
            let q = 0;
            for (let r = 0; r < NU - 1; r++) for (let k = 0; k < NT; k++) {
                const a = r * row + k, b = a + 1, c = a + row, d = c + 1;
                idx[q++] = a; idx[q++] = b; idx[q++] = c;
                idx[q++] = b; idx[q++] = d; idx[q++] = c;
            }
            // 巻き順は実行時に判定（全頂点の総和で外向きか）
            let normals = new Float32Array(pos.length);
            BABYLON.VertexData.ComputeNormals(pos, idx, normals);
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
            // 継ぎ目（一周の始端と終端）と、先端の1点に潰した輪の法線を溶接
            const avg = (list) => {
                let x = 0, y = 0, z = 0;
                for (const i of list) { x += normals[i * 3]; y += normals[i * 3 + 1]; z += normals[i * 3 + 2]; }
                const l = Math.hypot(x, y, z) || 1;
                for (const i of list) { normals[i * 3] = x / l; normals[i * 3 + 1] = y / l; normals[i * 3 + 2] = z / l; }
            };
            for (let r = 1; r < NU - 1; r++) avg([r * row, r * row + NT]);
            for (const r of [0, NU - 1]) avg(Array.from({ length: row }, (_, k) => r * row + k));

            const mesh = named(new BABYLON.Mesh("gyozaBody", this.scene), "gyozaBody");
            const vd = new BABYLON.VertexData();
            vd.positions = pos; vd.indices = idx; vd.normals = normals; vd.uvs = uv;
            vd.applyToMesh(mesh, false);
            mesh.hasVertexAlpha = false;
            mesh.material = this.mat;
            mesh.receiveShadows = true;
            mesh.parent = this.node;
            this.mesh = mesh;
            this.pos = pos; this.nv = nv;
            // 置き場所の計算に使う間引いた点
            const smp = [];
            for (let r = 0; r < NU; r += 3) for (let k = 0; k < NT; k += 2) {
                const o = (r * row + k) * 3;
                smp.push(pos[o], pos[o + 1], pos[o + 2]);
            }
            this.samples = new Float32Array(smp);
        }

        // テクスチャは (u, t) 空間で焼く。各テクセルは形状関数から 3D 位置を引き、
        // 焼き色・凹凸・照りを同じ位置のノイズから決める（色と形を相関させる）
        _buildTextures() {
            const G = GLOBAL, cfg = this.cfg, sh = this.shape;
            const W = G.texW, H = G.texH, n = W * H;
            const col = new Float32Array(n * 3), hgt = new Float32Array(n);
            const ao = new Float32Array(n), ro = new Float32Array(n), cc = new Float32Array(n), cr = new Float32Array(n);
            const perCol = new Float32Array(W);
            const sB = this.sB;
            const FILL = [0.660, 0.655, 0.520], NIRA = [0.560, 0.620, 0.420], SKIN_HI = [0.950, 0.925, 0.845];
            for (let i = 0; i < W; i++) {
                const u = (i + 0.5) / W;
                const R = sh.ringAt(u, H, 0.5, false);
                perCol[i] = R.per;
                for (let j = 0; j < H; j++) {
                    const k = j * W + i;
                    const x = R.X[j], y = R.Y[j], z = R.Z[j], s = R.S[j], ny = R.NY[j];
                    // ---- 焼き面：鍋に当たった平らな底。縁は不揃いに回り込む ----
                    const en = Noise.fbm3(x * 1.6, y * 1.6, z * 1.6, sB, 3) - 0.5;
                    const b0 = smooth(cfg.reach, 0.02, y + 0.16 * en) * smooth(0.35, -0.45, ny);
                    const centr = 1 - clamp(Math.abs(s) / R.W, 0, 1);
                    const m1 = Noise.fbm3(x * 0.55 + 3, y * 0.55, z * 0.55, sB + 5, 3) - 0.5;
                    const m2 = Noise.fbm3(x * 2.2, y * 2.2 + 1, z * 2.2, sB + 7, 2) - 0.5;
                    const rid = 1 - Math.abs(2 * Noise.fbm3(x * 3.2, y * 3.2, z * 3.2 + 5, sB + 9, 3) - 1);
                    const sp = smooth(0.84, 0.90, Noise.v3(x * 11, y * 11, z * 11, sB + 13));
                    const bl = smooth(0.58, 0.92, Noise.v3(x * 5.5 + 2, y * 5.5, z * 5.5, sB + 17));
                    const hot = smooth(0.56, 0.76, Noise.fbm3(x * 1.25 + 12, y * 1.25, z * 1.25, sB + 101, 2));
                    const pores = Noise.v3(x * 29, y * 29, z * 29, sB + 103);
                    const lev = (0.29 + 0.22 * centr * b0 + 0.8 * m1 + 0.30 * m2 + this.tone) * cfg.doneness;
                    let bc = lev < 0.30 ? mix3(cfg.edge, cfg.gold, smooth(0.0, 0.30, lev))
                        : lev < 0.60 ? mix3(cfg.gold, cfg.brown, smooth(0.30, 0.60, lev))
                        : mix3(cfg.brown, cfg.dark, smooth(0.60, 0.92, lev));
                    bc = mix3(bc, cfg.char, smooth(0.85, 1.05, lev) * 0.55);
                    // 澱粉の網目（濃い筋）と焦げの点。網目の内側の泡は明るく
                    bc = mix3(bc, cfg.dark, smooth(0.84, 0.97, rid) * cfg.lace * 0.45);
                    bc = mix3(bc, cfg.char, Math.max(sp * 0.9, hot * 0.95) * cfg.spot);
                    bc = mix3(bc, cfg.edge, smooth(0.68, 0.86, pores) * 0.28);
                    bc = mix3(bc, cfg.dark, smooth(0.63, 0.82, pores) * 0.26);
                    bc = mix3(bc, cfg.gold, bl * 0.35 * (1 - sp));

                    // ---- 蒸された皮：半透明で、薄い所は具の色が透ける ----
                    let sc = cfg.skin;
                    sc = mix3(sc, FILL, smooth(0.52, 0.74, Noise.fbm3(x * 1.8, y * 1.8, z * 1.8 + 9, sB + 21, 3)) * 0.30);
                    sc = mix3(sc, NIRA, smooth(0.84, 0.92, Noise.v3(x * 6.5, y * 6.5, z * 6.5, sB + 23)) * 0.22);
                    // 閉じ目まわりは皮が重なって白く厚い
                    sc = mix3(sc, SKIN_HI, smooth(0.80, 0.98, y / R.H) * 0.6);
                    // ひだの谷は影ではなく皮の重なりで少し濃い
                    sc = mix3(sc, mix3(cfg.skin, FILL, 0.5), R.FM[j] * (1 - R.FO[j]) * 0.35);

                    const bm = smooth(0.0, 0.55, b0);
                    let c = mix3(sc, bc, bm);
                    // 焼き面の縁のきつね色の帯
                    c = mix3(c, cfg.edge, smooth(0.0, 0.22, b0) * (1 - smooth(0.30, 0.70, b0)) * 0.55);
                    col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];

                    // ---- 細かい凹凸（cm）。大きな形はメッシュにある ----
                    const m3 = Noise.fbm3(x * 7, y * 7, z * 7, sB + 29, 2) - 0.5;
                    hgt[k] = b0 * (0.034 * m3 + 0.012 * rid * cfg.lace + 0.022 * bl - 0.010 * sp + 0.012 * (pores - 0.5))
                        + (1 - b0) * 0.006 * (Noise.fbm3(x * 8, y * 8, z * 8, sB + 31, 2) - 0.5);

                    ao[k] = clamp(1 - 0.42 * R.FM[j] * (1 - R.FO[j]) - 0.25 * gauss(y - R.Ht, 0.10) * smooth(0.5, 0.9, y / R.H), 0.45, 1);
                    ro[k] = clamp(mix(0.39 + 0.08 * m2, cfg.rough - 0.12 + 0.10 * rid + 0.14 * hot, bm), 0.30, 0.80);
                    // 照り（clearCoat）：焼き面は油、皮は蒸気の湿り
                    cc[k] = clamp(mix(0.32, 0.95 - 0.30 * sp, bm), 0, 1);
                    cr[k] = clamp(mix(0.85, 0.45 + 0.4 * (m2 + 0.5), bm), 0.2, 1);
                }
            }
            const sc = this.scene;
            this.albedo = makeTex(sc, "gyozaA", W, H, (d) => {
                for (let k = 0; k < n; k++) {
                    const o = k * 4;
                    d[o] = col[k * 3] * 255; d[o + 1] = col[k * 3 + 1] * 255; d[o + 2] = col[k * 3 + 2] * 255; d[o + 3] = 255;
                }
            });
            this.orm = makeTex(sc, "gyozaO", W, H, (d) => {
                for (let k = 0; k < n; k++) {
                    const o = k * 4;
                    d[o] = ao[k] * 255; d[o + 1] = ro[k] * 255; d[o + 2] = 0; d[o + 3] = 255;
                }
            }, true);
            this.coat = makeTex(sc, "gyozaC", W, H, (d) => {
                for (let k = 0; k < n; k++) {
                    const o = k * 4;
                    d[o] = cc[k] * 255; d[o + 1] = cr[k] * 255; d[o + 2] = 0; d[o + 3] = 255;
                }
            }, true);
            const kx = W / (2 * sh.L);
            this.normal = makeTex(sc, "gyozaN", W, H, (d) => {
                for (let j = 0; j < H; j++) {
                    const ju = (j - 1 + H) % H, jd = (j + 1) % H;   // 断面は一周つながっている
                    for (let i = 0; i < W; i++) {
                        const il = Math.max(0, i - 1), ir = Math.min(W - 1, i + 1);
                        const ky = H / (2 * Math.max(perCol[i], 0.5));
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
            for (const t of [this.albedo, this.orm, this.coat, this.normal]) t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;

            const m = named(new BABYLON.PBRMaterial("gyozaMat", sc), "gyozaMat");
            m.albedoTexture = this.albedo;
            m.metallic = 0; m.roughness = 1;
            m.metallicTexture = this.orm;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useRoughnessFromMetallicTextureAlpha = false;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.bumpTexture = this.normal;
            m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
            // 焼き面の油。一様にすると濡れたプラスチックになるのでテクスチャで散らす
            m.clearCoat.isEnabled = true;
            m.clearCoat.texture = this.coat;
            m.clearCoat.useRoughnessFromMainTexture = true;
            m.clearCoat.intensity = 0.65;
            m.clearCoat.roughness = 0.36;
            m.clearCoat.indexOfRefraction = 1.47;
            // 蒸した皮は薄く、光を透かす。入れないと白い粘土になる
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.translucencyIntensity = 0.18;
            m.subSurface.tintColor = new C3(0.97, 0.84, 0.60);
            m.subSurface.minimumThickness = 0.08;
            m.subSurface.maximumThickness = 1.2;
            this.mat = m;
        }

        setDebug(mode) {
            const m = this.mat;
            if (mode === 1) {
                m.albedoTexture = null; m.albedoColor = new C3(0.80, 0.80, 0.80);
                m.metallicTexture = null; m.roughness = 0.6;
                m.clearCoat.isEnabled = false;
                m.subSurface.isTranslucencyEnabled = false;
            } else {
                m.albedoTexture = this.albedo; m.albedoColor = new C3(1, 1, 1);
                m.metallicTexture = this.orm; m.roughness = 1;
                m.clearCoat.isEnabled = true;
                m.subSurface.isTranslucencyEnabled = true;
            }
        }
        setBump(level) { if (this.mat.bumpTexture) this.mat.bumpTexture.level = level; }

        dispose() {
            if (this.body) { this.body.dispose(); this.body = null; }
            if (this.hull) { this.hull.dispose(); this.hull = null; }
            this.mesh.dispose();
            this.mat.dispose(false, false);
            this.albedo.dispose(); this.orm.dispose(); this.coat.dispose(); this.normal.dispose();
            this.node.dispose();
        }
    }

    // =================================================================
    // 4. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.98, 0.80, 0.10, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.22;
    scene.environmentIntensity = 0.65;

    const camera = new BABYLON.ArcRotateCamera("cam", -1.30, 0.76, 33, new V3(-0.4, 1.2, -0.6), scene);
    camera.attachControl(engine.getRenderingCanvas(), true);
    camera.fov = 0.66;
    camera.wheelPrecision = 8;
    camera.minZ = 0.15;
    camera.maxZ = 400;
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 140;
    camera.upperBetaLimit = 1.48;

    const key = new BABYLON.DirectionalLight("key", new V3(0.42, -0.86, 0.30).normalize(), scene);
    key.position = new V3(-24, 44, -16);
    key.intensity = 2.8;
    key.diffuse = new C3(1.0, 0.975, 0.93);
    key.specular = new C3(0.60, 0.58, 0.55);
    key.autoCalcShadowZBounds = true;

    const fill = new BABYLON.DirectionalLight("fill", new V3(-0.75, -0.50, 0.40).normalize(), scene);
    fill.intensity = 0.55;
    fill.specular = new C3(0.15, 0.15, 0.15);
    // 鏡面だけの灯。焼き面の油の照りを何本も走らせる
    const kick = new BABYLON.DirectionalLight("kick", new V3(-0.10, -0.55, 0.83).normalize(), scene);
    kick.intensity = 0.70;
    kick.diffuse = new C3(0.06, 0.06, 0.06);
    kick.specular = new C3(1.0, 0.96, 0.90);

    const amb = new BABYLON.HemisphericLight("amb", new V3(0, 1, 0), scene);
    amb.intensity = 0.22;
    amb.groundColor = new C3(0.72, 0.70, 0.67);
    amb.specular = new C3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.useContactHardeningShadow = true;
    sg.contactHardeningLightSizeUVRatio = 0.06;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0008;
    sg.normalBias = 0.02;
    sg.darkness = 0.22;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.05;
    ip.contrast = 1.08;
    ip.vignetteEnabled = false;

    // =================================================================
    // 5. 楕円皿
    // =================================================================
    // 見込みは楕円、縁はその楕円の法線方向へ一定幅で広がる（縮尺で楕円にすると
    // 長手側だけ縁が太くなる）。断面は (d, y, v)：d は見込みの縁からの距離
    const PLATE_PROF = [
        // 上面（中心 → 縁）
        [-99, 0.50, 0.000], [-2.0, 0.50, 0.060], [-0.8, 0.50, 0.100], [-0.2, 0.55, 0.130],
        [0.3, 0.70, 0.1600], [0.8, 0.94, 0.2000], [1.4, 1.17, 0.3600], [2.0, 1.38, 0.5200],
        [2.55, 1.54, 0.6667], [2.85, 1.62, 0.7467],
        // 口縁
        [3.0, 1.63, 0.780], [3.09, 1.57, 0.810], [3.10, 1.48, 0.830], [3.0, 1.40, 0.850],
        // 裏面（縁 → 高台 → 中心）
        [2.0, 1.02, 0.900], [0.8, 0.58, 0.940], [-0.4, 0.32, 0.960],
        [-0.7, 0.00, 0.970], [-1.3, 0.00, 0.980], [-1.4, 0.24, 0.990], [-99, 0.24, 1.000]
    ];
    const PLATE_TOP_N = 10;               // 上面の点数（支持面の高さに使う）
    const RIM_MID = 1.7;                  // 雷紋の帯の中心（d）
    const vOfD = (d) => 0.20 + (d - 0.8) * 0.2667;

    function plateProfileTop(d) {
        const P = PLATE_PROF;
        if (d <= P[1][0]) return P[0][1];
        for (let i = 1; i < PLATE_TOP_N - 1; i++) {
            if (d <= P[i + 1][0]) return mix(P[i][1], P[i + 1][1], (d - P[i][0]) / (P[i + 1][0] - P[i][0]));
        }
        return P[PLATE_TOP_N - 1][1];
    }
    // 見込みの楕円から外への距離（近似）
    function plateD(x, z) {
        const A = GLOBAL.wellA, B = GLOBAL.wellB;
        const rho = Math.sqrt((x / A) * (x / A) + (z / B) * (z / B));
        if (rho < 1e-6) return -B;
        const gx = x / (A * A * rho), gz = z / (B * B * rho);
        return (rho - 1) / Math.hypot(gx, gz);
    }
    let plateY = 0;
    const plateTop = (x, z) => plateY + plateProfileTop(plateD(x, z));

    function buildPlateMesh() {
        const A = GLOBAL.wellA, B = GLOBAL.wellB, NA = 320, NP = PLATE_PROF.length, row = NP;
        // u は縁の中ほど（RIM_MID）での周長で刻む。模様が長手側で間延びしない
        const cumU = new Float64Array(NA + 1);
        const ptAt = (phi, d) => {
            const ex = A * Math.cos(phi), ez = B * Math.sin(phi);
            if (d < 0) { const f = Math.max(0, 1 + d / B); return [ex * f, ez * f]; }
            const nx = B * Math.cos(phi), nz = A * Math.sin(phi), l = Math.hypot(nx, nz);
            return [ex + nx / l * d, ez + nz / l * d];
        };
        for (let a = 0; a < NA; a++) {
            const p0 = ptAt(a / NA * TAU, RIM_MID), p1 = ptAt((a + 1) / NA * TAU, RIM_MID);
            cumU[a + 1] = cumU[a] + Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        }
        const perim = cumU[NA];
        const pos = [], uv = [], idx = [];
        for (let a = 0; a <= NA; a++) {
            const phi = a / NA * TAU;
            for (let p = 0; p < NP; p++) {
                const [d, y, v] = PLATE_PROF[p];
                const q = ptAt(phi, d);
                // わずかな歪み（手作りの縁）
                const w = 1 + 0.003 * (Math.cos(3 * phi) * 0.6 + Math.sin(5 * phi) * 0.4) * (d > 0 ? 1 : 0);
                pos.push(q[0] * w, y, q[1] * w);
                uv.push(cumU[a] / perim, v);
            }
        }
        for (let a = 0; a < NA; a++) for (let p = 0; p < NP - 1; p++) {
            const i0 = a * row + p, i1 = i0 + 1, j0 = i0 + row, j1 = j0 + 1;
            idx.push(i0, j0, i1, i1, j0, j1);
        }
        let normals = new Float32Array(pos.length);
        BABYLON.VertexData.ComputeNormals(pos, idx, normals);
        // 上面の中心付近の法線が上を向く巻き順にする
        let sy = 0;
        for (let a = 0; a < NA; a++) sy += normals[(a * row + 2) * 3 + 1];
        if (sy < 0) {
            for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
            normals = new Float32Array(pos.length);
            BABYLON.VertexData.ComputeNormals(pos, idx, normals);
        }
        // 継ぎ目と中心の法線を溶接
        for (let p = 0; p < NP; p++) {
            const a0 = p, a1 = NA * row + p;
            let x = normals[a0 * 3] + normals[a1 * 3], y = normals[a0 * 3 + 1] + normals[a1 * 3 + 1], z = normals[a0 * 3 + 2] + normals[a1 * 3 + 2];
            const l = Math.hypot(x, y, z) || 1;
            normals[a0 * 3] = normals[a1 * 3] = x / l; normals[a0 * 3 + 1] = normals[a1 * 3 + 1] = y / l; normals[a0 * 3 + 2] = normals[a1 * 3 + 2] = z / l;
        }
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
        return { mesh, perim };
    }

    // 中華皿の絵付け：口縁の赤線と、雷紋の帯（4か所に瑞鳥と瑞雲を入れる）
    function drawPlateTex(dt, perim, chinese) {
        const W = GLOBAL.plateTexW, H = GLOBAL.plateTexH;
        const ctx = dt.getContext();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#f7f6f2";
        ctx.fillRect(0, 0, W, H);
        if (!chinese) { dt.update(false); return; }
        const RED = "#c8231c";
        // 口縁の赤線（上面の外寄り → 縁を回って裏へ少し）
        ctx.fillStyle = RED;
        ctx.fillRect(0, vOfD(2.70) * H, W, (0.840 - vOfD(2.70)) * H);
        // 帯の座標系：x = 周長方向 cm、y = d（cm）
        const kx = W / perim, ky = 0.2667 * H, y0 = (0.20 - 0.8 * 0.2667) * H;
        const withWrap = (U, w, fn) => {
            for (const sh of [0, -perim, perim]) {
                if (U + sh + w < 0 || U + sh - w > perim) continue;
                ctx.setTransform(kx, 0, 0, ky, (U + sh) * kx, y0);
                fn();
            }
        };
        const S = 1.18, c = S / 5;
        const spiral = () => {
            // 内へ巻く角渦巻き（線の間隔を一定にする長さの列 s, s, s-c, s-c, ...）
            ctx.beginPath();
            let x = 0, y = RIM_MID + S / 2;
            ctx.moveTo(x, y);
            const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
            for (let k = 0; ; k++) {
                const ln = S - Math.floor(k / 2) * c;
                if (ln < c * 1.4) break;
                x += dirs[k % 4][0] * ln; y += dirs[k % 4][1] * ln;
                ctx.lineTo(x, y);
            }
            ctx.stroke();
        };
        ctx.strokeStyle = RED; ctx.lineCap = "square"; ctx.lineJoin = "miter";
        const gap = 6.4, pitch = S + 0.42;
        for (let g = 0; g < 4; g++) {
            const a0 = g * perim / 4 + gap / 2, a1 = (g + 1) * perim / 4 - gap / 2;
            const nT = Math.floor((a1 - a0 + 0.42) / pitch);
            const start = (a0 + a1) / 2 - (nT * pitch - 0.42) / 2;
            for (let t = 0; t < nT; t++) {
                withWrap(start + t * pitch, S, () => { ctx.lineWidth = c * 0.62; spiral(); });
            }
            // 帯の上下の細線
            withWrap(a0 - 0.2, a1 - a0 + 0.4, () => {
                ctx.fillStyle = RED;
                ctx.fillRect(0, RIM_MID - S / 2 - 0.20, a1 - a0 + 0.4, 0.06);
                ctx.fillRect(0, RIM_MID + S / 2 + 0.14, a1 - a0 + 0.4, 0.06);
            });
        }
        // 帯の切れ目の絵：瑞鳥（長手の端）と瑞雲（手前と奥）
        const bird = () => {
            const cols = ["#e2589a", "#f0be2c", "#3c8ed6", "#36a052", "#9a58cf"];
            ctx.lineCap = "round";
            for (let i = 0; i < 5; i++) {
                ctx.strokeStyle = cols[i]; ctx.lineWidth = 0.10;
                ctx.beginPath();
                ctx.moveTo(-0.6, RIM_MID + 0.02 * i);
                ctx.bezierCurveTo(0.4, RIM_MID - 0.55 + 0.10 * i, 1.4, RIM_MID - 0.25 + 0.12 * i, 2.6, RIM_MID - 0.42 + 0.20 * i);
                ctx.stroke();
            }
            ctx.fillStyle = "#e86aa6";
            ctx.beginPath(); ctx.ellipse(-1.15, RIM_MID + 0.05, 0.62, 0.26, -0.15, 0, TAU); ctx.fill();
            ctx.fillStyle = "#36a052";
            ctx.beginPath(); ctx.ellipse(-1.05, RIM_MID - 0.22, 0.48, 0.15, -0.5, 0, TAU); ctx.fill();
            ctx.fillStyle = "#f0be2c";
            ctx.beginPath(); ctx.arc(-1.85, RIM_MID - 0.12, 0.13, 0, TAU); ctx.fill();
            ctx.strokeStyle = "#c8231c"; ctx.lineWidth = 0.06;
            ctx.beginPath(); ctx.moveTo(-1.95, RIM_MID - 0.22); ctx.quadraticCurveTo(-2.3, RIM_MID - 0.55, -2.0, RIM_MID - 0.6); ctx.stroke();
        };
        const cloud = () => {
            const cols = ["#3c8ed6", "#36a052", "#f0be2c", "#e2589a"];
            ctx.lineCap = "round";
            for (let i = 0; i < 4; i++) {
                ctx.strokeStyle = cols[i]; ctx.lineWidth = 0.11;
                const ox = -1.9 + i * 1.25, r = 0.28;
                ctx.beginPath();
                ctx.arc(ox, RIM_MID, r, Math.PI * 0.2, Math.PI * 1.9);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(ox + r * 0.9, RIM_MID + 0.12);
                ctx.bezierCurveTo(ox + 0.6, RIM_MID + 0.45, ox + 0.9, RIM_MID - 0.35, ox + 1.25 - r, RIM_MID);
                ctx.stroke();
            }
        };
        for (let g = 0; g < 4; g++) withWrap(g * perim / 4, 3.2, (g % 2 === 0) ? bird : cloud);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        dt.update(false);
    }

    const plateBuilt = buildPlateMesh();
    const plate = plateBuilt.mesh;
    const plateTex = {};
    for (const kind of ["chuka", "white"]) {
        const dt = named(new BABYLON.DynamicTexture("plateTex_" + kind,
            { width: GLOBAL.plateTexW, height: GLOBAL.plateTexH }, scene, true), "plateTex");
        drawPlateTex(dt, plateBuilt.perim, kind === "chuka");
        dt.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
        dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        dt.anisotropicFilteringLevel = 8;
        plateTex[kind] = dt;
    }
    const plateMat = named(new BABYLON.PBRMaterial("plateGlaze", scene), "plateGlaze");
    plateMat.albedoTexture = plateTex.chuka;
    plateMat.metallic = 0; plateMat.roughness = 0.10;
    plateMat.clearCoat.isEnabled = true;
    plateMat.clearCoat.intensity = 0.5;
    plateMat.clearCoat.roughness = 0.05;
    plate.material = plateMat;
    sg.addShadowCaster(plate, false);

    // =================================================================
    // 6. 背景（黄色のスタジオ / 木のテーブルと編みのランチョンマット）
    // =================================================================
    const backdrop = (() => {
        const path = (x) => {
            const pts = [];
            for (let zz = -160; zz < 40; zz += 10) pts.push(new V3(x, 0, zz));
            for (let a = 0; a <= 12; a++) {
                const t = -Math.PI / 2 + a / 12 * Math.PI / 2;
                pts.push(new V3(x, 40 + 40 * Math.sin(t), 40 + 40 * Math.cos(t)));
            }
            pts.push(new V3(x, 200, 80));
            return pts;
        };
        const m = named(BABYLON.MeshBuilder.CreateRibbon("backdrop", {
            pathArray: [path(-200), path(200)], sideOrientation: BABYLON.Mesh.DOUBLESIDE
        }, scene), "backdrop");
        const bm = named(new BABYLON.PBRMaterial("backdropMat", scene), "backdropMat");
        bm.albedoColor = new C3(1.0, 0.60, 0.015);
        bm.metallic = 0; bm.roughness = 0.92;
        bm.environmentIntensity = 0.6;
        m.material = bm;
        m.receiveShadows = true;
        m.position.y = -0.01;
        return m;
    })();

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

    // 編みのランチョンマット：3本ずつ束ねた平たい帯を、縦横交互に組む（網代編み）
    function weaveSet(N) {
        const BL = 4, STR = 3, n2 = N * N;
        const hgt = new Float32Array(n2), colv = new Float32Array(n2);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const bx = x / N * BL, by = y / N * BL;
            const ix = Math.floor(bx), iy = Math.floor(by), fx = bx - ix, fy = by - iy;
            const horiz = ((ix + iy) & 1) === 0;
            const across = horiz ? fy : fx, along = horiz ? fx : fy;
            const sc = across * STR, si = Math.floor(sc), sf = sc - si;
            // 帯の断面は丸みのある平たい形、束の端（隣の束の下へ潜る所）で沈む
            const prof = Math.pow(Math.sin(Math.PI * sf), 0.35);
            const dip = smooth(0.0, 0.10, along) * smooth(1.0, 0.90, along);
            const fib = Noise.fbm2(horiz ? x * 0.02 : x * 0.6, horiz ? y * 0.6 : y * 0.02, 7700 + si * 13, 3);
            hgt[y * N + x] = prof * (0.55 + 0.45 * dip) + 0.10 * (fib - 0.5);
            colv[y * N + x] = 0.80 + 0.20 * prof * dip + 0.25 * (fib - 0.5)
                + 0.06 * (Noise.v2(ix * 3 + si, iy * 5, 7811) - 0.5);
        }
        const BASE = [0.455, 0.335, 0.300];
        const albedo = makeTex(scene, "matA", N, N, (d) => {
            for (let i = 0; i < n2; i++) {
                const k = i * 4, v = clamp(colv[i], 0, 1.1);
                d[k] = clamp(BASE[0] * v, 0, 1) * 255; d[k + 1] = clamp(BASE[1] * v, 0, 1) * 255;
                d[k + 2] = clamp(BASE[2] * v, 0, 1) * 255; d[k + 3] = 255;
            }
        });
        const normal = makeTex(scene, "matN", N, N, (d) => {
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const xl = hgt[y * N + ((x - 1 + N) % N)], xr = hgt[y * N + ((x + 1) % N)];
                const hu = hgt[((y - 1 + N) % N) * N + x], hd = hgt[((y + 1) % N) * N + x];
                let nx = (xl - xr) * 3.0, ny = (hd - hu) * 3.0, nz = 1;
                const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                const i = (y * N + x) * 4;
                d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
            }
        }, true);
        for (const t of [albedo, normal]) { t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; t.uScale = t.vScale = 3.2; }
        return { albedo, normal };
    }

    const MAT_T = 0.25;
    const tableTex = woodSet(1024, 9001, {
        name: "table", base: [0.86, 0.72, 0.55], grain: [0.78, 0.62, 0.45], dark: [0.62, 0.46, 0.31],
        rings: 11, wave: 1.4, sharp: 2.4, knot: 0.30, planks: 3, rough: 0.55
    });
    const table = named(BABYLON.MeshBuilder.CreateBox("table", { width: 160, height: 3, depth: 160 }, scene), "table");
    {
        const tm = named(new BABYLON.PBRMaterial("tableMat", scene), "tableMat");
        tm.albedoTexture = tableTex.albedo; tm.metallicTexture = tableTex.orm;
        tm.useAmbientOcclusionFromMetallicTextureRed = true;
        tm.useRoughnessFromMetallicTextureGreen = true;
        tm.useRoughnessFromMetallicTextureAlpha = false;
        tm.useMetallnessFromMetallicTextureBlue = true;
        tm.metallic = 0; tm.roughness = 1;
        table.material = tm;
        table.receiveShadows = true;
        table.position.y = -1.5;
    }
    const weave = weaveSet(1024);
    const placemat = named(BABYLON.MeshBuilder.CreateBox("placemat", { width: 46, height: MAT_T, depth: 34 }, scene), "placemat");
    {
        const mm = named(new BABYLON.PBRMaterial("placematMat", scene), "placematMat");
        mm.albedoTexture = weave.albedo; mm.bumpTexture = weave.normal;
        mm.metallic = 0; mm.roughness = 0.80;
        placemat.material = mm;
        placemat.receiveShadows = true;
        placemat.position.set(0, MAT_T / 2, 2);
        placemat.rotation.y = -0.05;
    }

    let curBg = "yellow", curPlate = "chuka";
    function applyBackground() {
        const y = curBg === "yellow";
        backdrop.setEnabled(y);
        table.setEnabled(!y);
        placemat.setEnabled(!y);
        scene.clearColor = y ? new BABYLON.Color4(0.98, 0.80, 0.10, 1) : new BABYLON.Color4(0.93, 0.90, 0.85, 1);
        plateY = y ? 0 : MAT_T;
        plate.position.y = plateY;
        if (typeof setPlateBody === "function" && hk) setPlateBody();
    }
    function applyPlate() { plateMat.albedoTexture = plateTex[curPlate]; }

    // =================================================================
    // 7. 並べる
    // =================================================================
    // 右から順に置く。焼き面を上へ向け（閉じ目は下）、長手の軸まわりに左へ傾ける。
    // 2個目からは、ひだのある右側を右隣の焼き面の左端に重ね、反対側が皿に着く傾きを探す
    // 【対策】左から置くと右隣が左隣の高い側（ひだ側）に乗り、1個ごとに階段状に浮く
    class HeightGrid {
        constructor(x0, x1, z0, z1, cell) {
            this.x0 = x0; this.z0 = z0; this.cell = cell;
            this.W = Math.ceil((x1 - x0) / cell); this.H = Math.ceil((z1 - z0) / cell);
            this.a = new Float32Array(this.W * this.H);
            this.clear();
        }
        clear() { this.a.fill(-1e9); }
        idx(x, z) {
            const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
            return (i < 0 || j < 0 || i >= this.W || j >= this.H) ? -1 : j * this.W + i;
        }
        at(x, z) { const k = this.idx(x, z); return k < 0 ? -1e9 : this.a[k]; }
        stamp(x, y, z) { const k = this.idx(x, z); if (k >= 0 && y > this.a[k]) this.a[k] = y; }
        dilate() {
            const W = this.W, H = this.H, src = this.a.slice();
            for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
                let m = src[j * W + i];
                for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) m = Math.max(m, src[(j + dj) * W + i + di]);
                this.a[j * W + i] = m;
            }
        }
    }
    const grid = new HeightGrid(-22, 22, -16, 16, 0.10);

    // 焼く姿勢 → 盛り付けの基準姿勢：長手 x → 奥 z、上 y → 下（焼き面が上）、手前 z → 右 x
    const M0 = BABYLON.Matrix.FromValues(0, 0, 1, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
    function poseMatrix(roll, yaw) {
        return M0.multiply(BABYLON.Matrix.RotationZ(roll)).multiply(BABYLON.Matrix.RotationY(yaw));
    }
    function solvePose(g, M, bx, bz) {
        const m = M.m, s = g.samples;
        let liftPlate = -Infinity, liftAll = -Infinity;
        for (let i = 0; i < s.length; i += 3) {
            const x = s[i], y = s[i + 1], z = s[i + 2];
            const wx = bx + x * m[0] + y * m[4] + z * m[8];
            const wy = x * m[1] + y * m[5] + z * m[9];
            const wz = bz + x * m[2] + y * m[6] + z * m[10];
            const pt = plateTop(wx, wz);
            if (pt - wy > liftPlate) liftPlate = pt - wy;
            const sup = Math.max(pt, grid.at(wx, wz));
            if (sup - wy > liftAll) liftAll = sup - wy;
        }
        return { lift: liftAll, gap: liftAll - liftPlate };
    }
    function stampGyoza(g, M, bx, by, bz) {
        const m = M.m, p = g.pos;
        for (let i = 0; i < p.length; i += 3) {
            const x = p[i], y = p[i + 1], z = p[i + 2];
            grid.stamp(bx + x * m[0] + y * m[4] + z * m[8], by + x * m[1] + y * m[5] + z * m[9], bz + x * m[2] + y * m[6] + z * m[10]);
        }
        grid.dilate();
    }
    // 写真のように一列に盛る。各個体の実際の頂点で皿との接地を計算する。
    function placeRow(list, rng) {
        grid.clear();
        const spacing = list.length === 7 ? 3.12 : 3.35;
        for (let i = 0; i < list.length; i++) {
            const g = list[i];
            const M = poseMatrix(GLOBAL.roll + rng.range(-0.04, 0.04), GLOBAL.rowYaw + GLOBAL.turn + rng.range(-0.025, 0.025));
            const bx = (i - (list.length - 1) / 2) * spacing - 1.0;
            const bz = -0.35 + rng.range(-0.12, 0.12);
            const res = solvePose(g, M, bx, bz);
            g.pose = { M, bx, bz, lift: res.lift };
            g.resetPose(0);
        }
    }

    // =================================================================
    // 7b. 物理で落として盛る
    // =================================================================
    // 解析の置き場所はあくまで初期値。右端から1個ずつ少し上で放し、Havok に接触を解かせる。
    // 全部が静止したら（または時間切れで）物理から外して固定する
    let hk = null, plateAgg = null, drop = null, onDropChanged = null;
    if (GLOBAL.usePhysics) {
        try {
            const havok = await HavokPhysics();
            hk = new BABYLON.HavokPlugin(false, havok);     // 固定タイムステップ
            scene.enablePhysics(new V3(0, -GLOBAL.gravity, 0), hk);
            if (hk.setTimeStep) hk.setTimeStep(GLOBAL.timeStep);
        } catch (e) {
            console.warn("[Gyoza] Havok の初期化に失敗。解析的な配置のまま表示します", e);
            hk = null;
        }
    }
    function setPlateBody() {
        if (!hk) return;
        if (plateAgg) plateAgg.dispose();
        plate.computeWorldMatrix(true);
        plateAgg = new BABYLON.PhysicsAggregate(plate, BABYLON.PhysicsShapeType.MESH,
            { mass: 0, friction: 0.8, restitution: 0.02 }, scene);
    }
    function startDrop(list) {
        if (!hk) { for (const g of list) { g.resetPose(0); g.node.setEnabled(true); } return; }
        for (const g of list) { if (g.body) { g.body.dispose(); g.body = null; } g.resetPose(0); g.node.setEnabled(false); }
        const order = [];
        for (let i = list.length - 1; i >= 0; i--) order.push(list[i]);
        drop = { order, next: 0, timer: 0, since: 0, calm: 0 };
        if (onDropChanged) onDropChanged();
    }
    function finishDrop() {
        if (!drop) return;
        for (const g of drop.order) { if (!g.node.isEnabled()) g.release(scene); g.freeze(plateTop); }
        drop = null;
        if (onDropChanged) onDropChanged();
    }
    scene.onBeforeRenderObservable.add(() => {
        if (!drop) return;
        const dt = GLOBAL.timeStep;   // 物理と同じ時間で数える
        drop.timer -= dt;
        if (drop.next < drop.order.length) {
            if (drop.timer <= 0) {
                drop.order[drop.next++].release(scene);
                drop.timer = GLOBAL.dropInterval;
            }
            return;
        }
        drop.since += dt;
        let calm = true;
        for (const g of drop.order) {
            if (!g.body) continue;
            const v = g.body.getLinearVelocity(), w = g.body.getAngularVelocity();
            if (v.length() > 0.6 || w.length() > 0.25) { calm = false; break; }
        }
        drop.calm = calm ? drop.calm + dt : 0;
        if (drop.calm > 0.5 || drop.since > GLOBAL.settleTimeout) finishDrop();
    });

    // =================================================================
    // 8. 生成
    // =================================================================
    let items = [], curPreset = START_PRESET, curSeed = START_SEED;
    const BUMPS = [{ label: "弱", level: 0.55 }, { label: "中", level: 1.0 }, { label: "強", level: 1.6 }];
    let bumpIdx = 1, dbgIdx = 0;
    const DEBUGS = ["通常", "白クレイ"];
    let buildMs = 0;

    function build(presetKey, seed) {
        const t0 = performance.now();
        drop = null;
        for (const e of items) e.dispose();
        items = [];
        const cfg = Object.assign({ key: presetKey }, PRESETS[presetKey]);
        applyBackground();
        const sm = sg.getShadowMap();
        if (sm && sm.renderList) { sm.renderList.length = 0; sm.renderList.push(plate); }
        for (let i = 0; i < GLOBAL.count; i++) {
            const g = new Gyoza(scene, cfg, (seed + i * 7919 + 3) >>> 0);
            items.push(g);
            sg.addShadowCaster(g.mesh, false);
        }
        placeRow(items, new Rng(seed ^ 0x2545F491));
        for (const e of items) { e.setDebug(dbgIdx); e.setBump(BUMPS[bumpIdx].level); }
        startDrop(items);
        buildMs = performance.now() - t0;
        console.log("[Gyoza]", BUILD, "/", cfg.label, "/ seed =", seed, "/", items.length, "個 /",
            items.map(e => e.shape.nPleat + "ひだ").join(", "), "/", buildMs.toFixed(0), "ms");
    }

    applyPlate();
    build(START_PRESET, START_SEED);

    if (GLOBAL.useSSAO && BABYLON.SSAO2RenderingPipeline.IsSupported) {
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 1.0;
        ssao.totalStrength = 1.1;
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
        const focus = camera.radius * 10; // このシーンの 1 単位 = 1 cm。DOF は mm。
        dp.depthOfField.focusDistance = focus;
        dp.depthOfField.focalLength = focus * GLOBAL.dofRatio;
    });

    // =================================================================
    // 9. GUI
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

    addLabel("GYOZA", 11, COL.sub, "18px");
    addLabel("焼き色", 13, COL.accent, "22px");
    const presetBtns = {};
    function highlight() { for (const k in presetBtns) presetBtns[k].background = (k === curPreset) ? COL.active : COL.idle; }
    for (const k of Object.keys(PRESETS)) {
        presetBtns[k] = addButton("p_" + k, PRESETS[k].label, () => { curPreset = k; build(curPreset, curSeed); highlight(); });
    }
    addLabel("個数", 13, COL.accent, "26px");
    addRow("count", [5, 6, 7].map(v => ({ label: v + " 個", value: v })), v => v === GLOBAL.count,
        v => { GLOBAL.count = v; build(curPreset, curSeed); });
    addLabel("皿", 13, COL.accent, "26px");
    addRow("plateKind", [{ label: "中華皿", value: "chuka" }, { label: "白い皿", value: "white" }], v => v === curPlate,
        v => { curPlate = v; applyPlate(); });
    addLabel("背景", 13, COL.accent, "26px");
    addRow("bg", [{ label: "黄色", value: "yellow" }, { label: "マット", value: "mat" }], v => v === curBg,
        v => { curBg = v; build(curPreset, curSeed); });
    const redropBtn = addButton("redrop", "盛り直す", () => { if (items.length) { placeRow(items, new Rng(curSeed ^ 0x2545F491)); startDrop(items); } });
    onDropChanged = () => { redropBtn.textBlock.text = drop ? "盛り付け中…" : (hk ? "盛り直す" : "盛り直す（物理なし）"); };
    onDropChanged();
    addButton("reseed", "別の餃子を焼く", () => {
        curSeed = (Math.imul(curSeed, 1664525) + 1013904223) >>> 0;
        build(curPreset, curSeed);
    });
    const bumpBtn = addButton("bump", "凹凸: 中", () => {
        bumpIdx = (bumpIdx + 1) % BUMPS.length;
        for (const e of items) e.setBump(BUMPS[bumpIdx].level);
        bumpBtn.textBlock.text = "凹凸: " + BUMPS[bumpIdx].label;
    });
    const dbgBtn = addButton("debug", "表示: 通常", () => {
        dbgIdx = (dbgIdx + 1) % DEBUGS.length;
        for (const e of items) e.setDebug(dbgIdx);
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
        camera.fov = narrow ? 1.00 : 0.78;
        const scale = isCompact() ? clamp(engine.getRenderWidth() / Math.max(1, viewportCss().w), 1, GLOBAL.guiMaxScale) : 1;
        for (const c of [toggleBtn, card]) { c.transformCenterX = 0; c.transformCenterY = 0; c.scaleX = scale; c.scaleY = scale; }
        card.top = (16 + 38 * scale + 8) + "px";
        card.isVisible = panelOpen;
        if (toggleBtn.textBlock) toggleBtn.textBlock.text = panelOpen ? "\u00d7" : "\u2261";
    }
    toggleBtn.onPointerUpObservable.add(() => { panelOpen = !panelOpen; applyGuiLayout(); });
    const resizeObserver = engine.onResizeObservable.add(applyGuiLayout);
    scene.onDisposeObservable.add(() => { engine.onResizeObservable.remove(resizeObserver); });

    highlight();
    applyGuiLayout();

    return scene;
};

export default createScene;