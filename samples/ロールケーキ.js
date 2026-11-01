// =====================================================================
//  Photoreal Roll Cake  /  写実的なロールケーキ
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//  build: rollcake-2026-10-03-a
//
//  実物の要点（ここを外すと「黄色い円柱に渦巻きの絵」になる）:
//    ・断面の渦巻きは「線」ではなく「シート」。厚さ 1cm 前後の生地を
//      クリームを塗って巻いたもので、生地のほうが圧倒的に厚い。
//      クリームは生地と生地の間の三日月形の帯として見える
//    ・いちばん外側の一周は円の輪郭そのもの。内側の渦がそこへ合流する
//      点でクリームは細くなって消える（三日月が片側で尖る）
//    ・焼き面（皮）は外を向いて巻く。だから焼き色の線は「外周」と
//      「内側の巻きの外面」に出る。紙に接していた面は淡い黄金色の細線
//    ・白いロール（皮むき）は外周が淡い黄色の多孔質で、焼き色が無い。
//      中心のクリームが大きく、生地の端がカギ状に食い込む
//    ・断面は真円ではない。自重で底が平らにつぶれ、少し横に広がる
//    ・切り口のスポンジは気泡の穴だらけ。クリームはナイフに引きずられて
//      下側の生地へ薄く伸びる（なすり跡）
//    ・皮はマットではなく、しっとりした半艶。断面の生地は完全なマット
//
//  構成:
//    0. CONFIG      … 3 種のプリセット（焼き目ロール / 白いロール / 1本）
//    1. Rng / Noise
//    2. Mesh utils  … 巻き順の自動判定・法線の溶接・一意な name / id
//    3. Section     … 断面の輪郭と渦巻き（テクスチャと形状で共有する）
//    4. TextureLab  … 断面・外皮・皿・ドイリー
//    5. Cake        … 断面 → 面取り → 側面 → 面取り → 断面 を 1 メッシュで
//    6. Plates      … 輪花皿（金縁）/ 角皿 / ドイリー / テーブル
//    7. Scene       … 灯・影・ポストプロセス
//    8. Build
//    9. GUI
// =====================================================================

var createScene = function () {
    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;
    const BUILD = "rollcake-2026-10-03-a";

    // =================================================================
    // 0. CONFIG （単位は cm、色は sRGB のアルベド）
    // =================================================================
    const PRESETS = {
        // ---- 1 枚目 / 3 枚目の写真：焼き目を外にした定番の 1 切れ -----
        classic: {
            label: "焼き目ロール（1切れ）", layout: "slice",
            R: 3.6, ry: 0.96, rz: 1.03, flat: 0.86, L: 3.0,
            turns: 1.40, sheetT: 0.30, rho0: 0.12, coreFill: 1.0, rhoCore: 0.045,
            skinOutCm: 0.065, skinInCm: 0.022, innerLineK: 0.45, crustCm: 0.30,
            outer: "skin", poreScale: 0.70,
            sponge: [[0.865, 0.705, 0.395], [0.905, 0.770, 0.470]],
            crust: [0.835, 0.585, 0.300],
            skin: [[0.735, 0.465, 0.270], [0.615, 0.355, 0.185], [0.500, 0.270, 0.135]],
            line: [0.800, 0.560, 0.300],
            cream: [0.940, 0.920, 0.855],
            plate: "fluted", bg: "light"
        },
        // ---- 2 枚目の写真：皮をむいた白いロール、3 切れ並べ ----------
        shiro: {
            label: "白いロール（3切れ）", layout: "row3",
            R: 3.4, ry: 0.97, rz: 1.03, flat: 0.88, L: 2.5,
            turns: 0.95, sheetT: 0.36, rho0: 0.30,
            skinOutCm: 0.0, skinInCm: 0.035, innerLineK: 0.85, crustCm: 0.10,
            outer: "sponge", poreScale: 1.05,
            sponge: [[0.895, 0.800, 0.565], [0.930, 0.850, 0.640]],
            crust: [0.900, 0.770, 0.500],
            skin: [[0.910, 0.830, 0.610], [0.880, 0.785, 0.545], [0.840, 0.720, 0.470]],
            line: [0.900, 0.610, 0.330],
            cream: [0.940, 0.935, 0.910],
            plate: "square", bg: "light"
        },
        // ---- 4 枚目の写真：1 本（ハーフ）をドイリーに ----------------
        log: {
            label: "ロール1本", layout: "log",
            R: 3.7, ry: 0.96, rz: 1.03, flat: 0.87, L: 13.0,
            turns: 2.10, sheetT: 0.23, rho0: 0.07, coreFill: 1.0, rhoCore: 0.035,
            skinOutCm: 0.060, skinInCm: 0.020, innerLineK: 0.40, crustCm: 0.28,
            outer: "skin", poreScale: 0.75,
            sponge: [[0.880, 0.735, 0.430], [0.915, 0.790, 0.500]],
            crust: [0.850, 0.610, 0.320],
            skin: [[0.760, 0.500, 0.290], [0.665, 0.410, 0.215], [0.545, 0.310, 0.155]],
            line: [0.800, 0.560, 0.300],
            cream: [0.945, 0.930, 0.880],
            plate: "doily", bg: "dark"
        }
    };
    const GLOBAL = {
        capTexSize: 1024,      // 断面テクスチャ（直径 8cm 前後に 1024px ≒ 0.08mm/px）
        sideTexWidth: 1024,    // 外皮テクスチャの周方向
        capRings: 40, columns: 192, bevel: 0.13,
        useSSAO: true,
        // 【対策】GUI 専用カメラは Inspector を壊す（SKILL 6.1）。
        //         Layer.applyPostProcess = false なら2台目を作らずに済む
        guiOwnCamera: false
    };
    const START_PRESET = "classic";
    const START_SEED = 20261003;
    console.log("[RollCake] build:", BUILD);

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
        sign() { return this.next() < 0.5 ? -1 : 1; }
    }
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const s2l = (v) => Math.pow(v, 2.2);
    // 多項式スムース min（底の平らな面と楕円の継ぎ目を丸める）
    const smin = (a, b, k) => { const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1); return mix(b, a, h) - k * h * (1 - h); };

    const Noise = {
        h2(ix, iy, seed) {
            let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1103515245);
            h ^= h >>> 16;
            return (h >>> 0) / 4294967296;
        },
        h3(ix, iy, iz, seed) {
            let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263)
                ^ Math.imul(iz | 0, 2246822519) ^ Math.imul(seed | 0, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1103515245);
            h ^= h >>> 16;
            return (h >>> 0) / 4294967296;
        },
        v2(x, y, seed) {
            const ix = Math.floor(x), iy = Math.floor(y);
            let fx = x - ix, fy = y - iy;
            fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
            const a = this.h2(ix, iy, seed), b = this.h2(ix + 1, iy, seed);
            const c = this.h2(ix, iy + 1, seed), d = this.h2(ix + 1, iy + 1, seed);
            return mix(mix(a, b, fx), mix(c, d, fx), fy);
        },
        v3(x, y, z, seed) {
            const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
            let fx = x - ix, fy = y - iy, fz = z - iz;
            fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
            const h = this.h3.bind(this);
            const x0 = mix(mix(h(ix, iy, iz, seed), h(ix + 1, iy, iz, seed), fx),
                mix(h(ix, iy + 1, iz, seed), h(ix + 1, iy + 1, iz, seed), fx), fy);
            const x1 = mix(mix(h(ix, iy, iz + 1, seed), h(ix + 1, iy, iz + 1, seed), fx),
                mix(h(ix, iy + 1, iz + 1, seed), h(ix + 1, iy + 1, iz + 1, seed), fx), fy);
            return mix(x0, x1, fz);
        },
        fbm2(x, y, oct, seed) {
            let s = 0, a = 0.5, n = 0;
            for (let o = 0; o < oct; o++) { s += a * this.v2(x, y, seed + o * 131); n += a; x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; a *= 0.5; }
            return s / n;
        },
        fbm3(x, y, z, oct, seed) {
            let s = 0, a = 0.5, n = 0;
            for (let o = 0; o < oct; o++) { s += a * this.v3(x, y, z, seed + o * 131); n += a; x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; z = z * 2.03 + 9.3; a *= 0.5; }
            return s / n;
        },
        n1(t, seed) { return this.v2(t, 0.37, seed); },
        // スポンジの気泡。ジッタ格子の最近点（2D）。0..1 の穴の深さを返す
        pores2(x, y, cell, prob, rmin, rmax, seed) {
            const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
            let v = 0;
            for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
                const ix = cx + i, iy = cy + j;
                if (this.h2(ix, iy, seed) > prob) continue;
                const px = (ix + this.h2(ix, iy, seed + 11)) * cell;
                const py = (iy + this.h2(ix, iy, seed + 23)) * cell;
                const r = mix(rmin, rmax, Math.pow(this.h2(ix, iy, seed + 37), 1.6));
                // 気泡はわずかに横長（巻くときに引き伸ばされる）
                const d = Math.hypot((x - px) * 0.85, y - py);
                if (d < r) { const w = smooth(r, r * 0.35, d); if (w > v) v = w; }
            }
            return v;
        },
        pores3(x, y, z, cell, prob, rmin, rmax, seed) {
            const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
            let v = 0;
            for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
                const ix = cx + i, iy = cy + j, iz = cz + k;
                if (this.h3(ix, iy, iz, seed) > prob) continue;
                const px = (ix + this.h3(ix, iy, iz, seed + 11)) * cell;
                const py = (iy + this.h3(ix, iy, iz, seed + 23)) * cell;
                const pz = (iz + this.h3(ix, iy, iz, seed + 31)) * cell;
                const r = mix(rmin, rmax, Math.pow(this.h3(ix, iy, iz, seed + 37), 1.6));
                const d = Math.hypot(x - px, y - py, z - pz);
                if (d < r) { const w = smooth(r, r * 0.35, d); if (w > v) v = w; }
            }
            return v;
        }
    };

    // =================================================================
    // 2. Mesh utils
    // =================================================================
    // 【対策】Babylon の Node コンストラクタは id = name を入れるだけで、
    //         同名メッシュを複数作ると id が重複し、Inspector の選択が
    //         別の物へ飛ぶ。name と id の両方を明示的に一意にする
    let _uid = 0;
    function named(obj, base) {
        _uid++;
        obj.name = base + "_" + _uid;
        obj.id = base + "#" + _uid;
        return obj;
    }

    // 位置が一致する頂点の法線を平均する（継ぎ目・極・断面と面取りの境）
    function weldNormals(positions, normals) {
        const map = new Map();
        const n = positions.length / 3;
        const keys = new Array(n);
        for (let i = 0; i < n; i++) {
            const k = Math.round(positions[i * 3] * 8192) + "," + Math.round(positions[i * 3 + 1] * 8192)
                + "," + Math.round(positions[i * 3 + 2] * 8192);
            keys[i] = k;
            let a = map.get(k);
            if (!a) { a = [0, 0, 0]; map.set(k, a); }
            a[0] += normals[i * 3]; a[1] += normals[i * 3 + 1]; a[2] += normals[i * 3 + 2];
        }
        for (let i = 0; i < n; i++) {
            const a = map.get(keys[i]);
            const l = Math.hypot(a[0], a[1], a[2]) || 1;
            normals[i * 3] = a[0] / l; normals[i * 3 + 1] = a[1] / l; normals[i * 3 + 2] = a[2] / l;
        }
    }

    // 巻き順の自動判定（全頂点の総和、SKILL 1.3）→ 法線の溶接 → メッシュ化
    function finishMesh(base, positions, indices, uvs, center, scene) {
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        let dot = 0;
        for (let i = 0; i < positions.length; i += 3) {
            dot += normals[i] * (positions[i] - center.x)
                + normals[i + 1] * (positions[i + 1] - center.y)
                + normals[i + 2] * (positions[i + 2] - center.z);
        }
        if (dot < 0) {
            for (let i = 0; i < indices.length; i += 3) {
                const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t;
            }
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        weldNormals(positions, normals);
        const mesh = named(new BABYLON.Mesh(base, scene), base);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals; vd.uvs = uvs;
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;       // SKILL 1.7
        mesh.__flipped = dot < 0;
        return mesh;
    }

    // 格子（rows × (M+1)）の三角形。bands は [r0, r1) の行範囲の配列
    function gridIndices(M, r0, r1) {
        const idx = [], W = M + 1;
        for (let i = r0; i < r1 - 1; i++) {
            for (let j = 0; j < M; j++) {
                const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
                idx.push(a, c, b, b, c, d);
            }
        }
        return idx;
    }

    function localMinY(positions) {
        let m = Infinity;
        for (let i = 1; i < positions.length; i += 3) if (positions[i] < m) m = positions[i];
        return m;
    }

    // =================================================================
    // 3. Section : 断面の輪郭と渦巻き
    // =================================================================
    // 断面は (z, y) 平面。原点は渦の中心、ロールの軸は X。
    // 渦巻きは「輪郭で正規化した半径」ρ = r / rOut(φ) の上で定義する。
    // こうすると自重で底がつぶれた形に内側の巻きも自然に沿う。
    //
    //   シートの内面   s(θ) = min(ρ0 + p·θ/2π, 1 − t)
    //   シートの外面   s(θ) + t(θ)
    //   θ ∈ [0, Θring] が渦、[Θring, Θring+2π] が外周の一周（輪郭そのもの）。
    //   外周に合流する手前でクリームの三日月が細くなって消える。
    class Section {
        constructor(cfg, seed) {
            const r = new Rng(seed);
            this.cfg = cfg;
            this.seed = seed;
            this.R = cfg.R;
            this.Ry = cfg.R * cfg.ry;
            this.Rz = cfg.R * cfg.rz;
            this.cy = this.Ry * cfg.flat;        // 中心の高さ。底がつぶれたぶん下がる
            this.kCorner = cfg.R * 0.42;         // 底の角の丸み

            // ---- 輪郭の表（φ ∈ [−π, π]） --------------------------
            const TN = 2048;
            this.TN = TN;
            this.tab = new Float32Array(TN + 1);
            const ph = [r.range(0, TAU), r.range(0, TAU), r.range(0, TAU)];
            let rmax = 0;
            for (let i = 0; i <= TN; i++) {
                const phi = -Math.PI + TAU * i / TN;
                const c = Math.cos(phi), s = Math.sin(phi);
                let re = 1 / Math.sqrt((c / this.Rz) * (c / this.Rz) + (s / this.Ry) * (s / this.Ry));
                // 手で巻いたゆらぎ（0.6% 程度）。これが無いと旋盤で挽いた棒に見える
                re *= 1 + 0.004 * Math.cos(2 * phi + ph[0]) + 0.003 * Math.cos(3 * phi + ph[1]) + 0.002 * Math.cos(5 * phi + ph[2]);
                const rf = s < -0.02 ? this.cy / (-s) : 1e3;
                const rr = smin(re, rf, this.kCorner);
                this.tab[i] = rr;
                if (rr > rmax) rmax = rr;
            }
            this.rMax = rmax;

            // ---- 渦巻き ----------------------------------------------
            this.t = cfg.sheetT;
            this.rho0 = cfg.rho0;
            this.turns = cfg.turns;
            this.p = (1 - this.t - this.rho0) / this.turns;
            this.thRing = TAU * this.turns;
            this.thEnd = this.thRing + TAU;
            this.dir = r.sign();
            // 外周への合流点（＝外側のシートの端）は底の脇に隠す
            const phiMerge = -Math.PI / 2 + this.dir * r.range(0.35, 0.75);
            this.phiS = phiMerge - this.dir * this.thRing;
            this.phiMerge = Math.atan2(Math.sin(phiMerge), Math.cos(phiMerge));
            this.thE = 0.55 * this.t / Math.max(this.rho0, 0.05);   // 内側の端の丸み（弧長 ≒ 厚さの半分）
            this.K = Math.ceil(this.turns) + 2;
            this.coreFill = cfg.coreFill || 0;
            this.rhoCore = cfg.rhoCore || 0.05;
            this.thFill = Math.PI * 0.75;
            this.thFill2 = Math.PI * 0.55;
            this.nSeed = (seed * 7 + 101) >>> 0;
            this._o = { sd: 0, dOut: 0, dIn: 0, th: 0 };
        }

        rOut(phi) {
            let f = (phi + Math.PI) / TAU * this.TN;
            f = ((f % this.TN) + this.TN) % this.TN;
            const i = Math.floor(f), a = f - i;
            return this.tab[i] * (1 - a) + this.tab[i + 1] * a;
        }

        // 外周の一周に近づくほど揺らぎを消す（輪郭は 1 に張り付く）
        _fade(th) { return smooth(this.thRing, this.thRing - 1.2, th); }
        sAt(th) {
            const w = (Noise.n1(th * 0.85, this.nSeed) - 0.5) * 0.030 * this._fade(th);
            return Math.min(this.rho0 + this.p * th / TAU + w, 1 - this.t);
        }
        tAt(th) {
            const w = 1 + (Noise.n1(th * 1.30 + 7.0, this.nSeed + 5) - 0.5) * 0.12 * this._fade(th);
            // 内側の端は切りっぱなしではなく、丸まって押しつぶされた形
            const e = Math.sqrt(clamp(th / this.thE, 0, 1));
            const tt = this.t * w * (0.15 + 0.85 * e);
            return th >= this.thRing ? this.t : tt;
        }

        // (ρ, φ) の点がシートの中か外か。sd > 0 で生地（ρ 単位）
        sample(rho, phi) {
            const o = this._o;
            let pp = this.dir * (phi - this.phiS);
            pp -= TAU * Math.floor(pp / TAU);
            let best = -1e9, bOut = 0, bIn = 0, bTh = 0;
            for (let k = 0; k <= this.K; k++) {
                const th = pp + TAU * k;
                if (th > this.thEnd + 1e-6) break;
                const si = this.sAt(th), ti = this.tAt(th);
                // 最初の一周は内側に隣が無い。生地が中心へ寄って芯を埋め、
                // 先端のまわりにだけクリームのコンマ形が残る（1 枚目の写真）
                const sIn = (th < TAU && this.coreFill > 0)
                    ? mix(si, Math.min(si, this.rhoCore), this.coreFill * smooth(0.0, this.thFill, th) * smooth(TAU, TAU - this.thFill2, th)) : si;
                let d = Math.min(rho - sIn, si + ti - rho);
                // 内側の端：θ = 0 の手前は無い。弧長で距離を落として丸める
                if (th < this.thE) d = Math.min(d, (th - this.thE * 0.05) * Math.max(si, 0.02));
                if (d > best) { best = d; bOut = si + ti - rho; bIn = rho - sIn; bTh = th; }
            }
            o.sd = best; o.dOut = bOut; o.dIn = bIn; o.th = bTh;
            return o;
        }
    }

    // =================================================================
    // 4. TextureLab
    // =================================================================
    // update(false) なので画像の行 y がそのまま v = y/N に対応する。
    // 【対策】法線マップの V の符号は (yd − yu)。Babylon の接空間は V が下向き
    const TextureLab = {
        _tex(name, w, h, fill, scene, alpha) {
            w = Math.max(8, Math.round(w) || 512); h = Math.max(8, Math.round(h) || 512);   // SKILL 2.9
            const dt = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
            named(dt, name);
            const ctx = dt.getContext();
            const img = ctx.createImageData(w, h);
            fill(img.data, w, h);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = !!alpha;
            dt.anisotropicFilteringLevel = 16;
            return dt;
        },
        // 高さ場 → 法線マップ（高さは cm、px は 1 テクセルの cm）
        _normals(H, w, h, px, gain, wrapX) {
            const out = new Uint8ClampedArray(w * h * 4);
            const at = (x, y) => {
                if (wrapX) x = (x + w) % w; else x = clamp(x, 0, w - 1);
                y = clamp(y, 0, h - 1);
                return H[y * w + x];
            };
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                let nx = (at(x - 1, y) - at(x + 1, y)) / (2 * px) * gain;
                let ny = (at(x, y + 1) - at(x, y - 1)) / (2 * px) * gain;   // (yd − yu)
                const l = Math.hypot(nx, ny, 1);
                const i = (y * w + x) * 4;
                out[i] = (nx / l * 0.5 + 0.5) * 255;
                out[i + 1] = (ny / l * 0.5 + 0.5) * 255;
                out[i + 2] = (1 / l * 0.5 + 0.5) * 255;
                out[i + 3] = 255;
            }
            return out;
        },

        // ---- 断面（切り口）。アルベド / ORM / 法線は 1 枚の高さ場を共有する（SKILL 2.6）
        cap(sec, cfg, N, seed, scene) {
            const t0 = performance.now();
            const Rm = sec.rMax * 1.03, px = 2 * Rm / N;
            const alb = new Uint8ClampedArray(N * N * 4);
            const orm = new Uint8ClampedArray(N * N * 4);
            const H = new Float32Array(N * N);
            const ps = cfg.poreScale;
            const S0 = cfg.sponge[0], S1 = cfg.sponge[1], CR = cfg.crust, CM = cfg.cream, LN = cfg.line;
            const SK = cfg.skin;
            const edgeCol = cfg.skinOutCm > 0 ? SK[1] : S0;
            const sa = seed + 11, sb = seed + 29, sc = seed + 47, sd = seed + 71;
            for (let j = 0; j < N; j++) {
                const y = -Rm + (j + 0.5) * px;
                for (let i = 0; i < N; i++) {
                    const z = -Rm + (i + 0.5) * px;
                    const q = j * N + i, o4 = q * 4;
                    // 境界は定規で引いた線にしない。低周波の歪み＋崩れた縁
                    const zz = z + (Noise.v2(z * 1.1, y * 1.1, sa) - 0.5) * 0.08 + (Noise.v2(z * 9, y * 9, sa + 1) - 0.5) * 0.026;
                    const yy = y + (Noise.v2(z * 1.1, y * 1.1, sb) - 0.5) * 0.08 + (Noise.v2(z * 9, y * 9, sb + 1) - 0.5) * 0.026;
                    const r = Math.hypot(zz, yy), phi = Math.atan2(yy, zz);
                    const Ro = sec.rOut(phi), rho = r / Ro;
                    if (rho > 1.0) {
                        // 輪郭の外。ミップマップのにじみで縁が黒くならないよう縁の色で埋める
                        alb[o4] = edgeCol[0] * 255; alb[o4 + 1] = edgeCol[1] * 255; alb[o4 + 2] = edgeCol[2] * 255; alb[o4 + 3] = 255;
                        orm[o4] = 255; orm[o4 + 1] = 0.75 * 255; orm[o4 + 2] = 0; orm[o4 + 3] = 255;
                        H[q] = 0;
                        continue;
                    }
                    const o = sec.sample(rho, phi);
                    const sdcm = o.sd * Ro, dOut = o.dOut * Ro, dIn = o.dIn * Ro;
                    const aS = smooth(-px, px, sdcm);

                    // ---- 生地 ----------------------------------------
                    const crumb = Noise.fbm2(zz * 14, yy * 14, 3, sc);
                    let col = mix3(S0, S1, smooth(0.30, 0.72, crumb));
                    // 焼き面の直下は熱が強く入って黄色が濃い
                    col = mix3(col, CR, smooth(cfg.crustCm, 0, dOut) * 0.55);
                    let ks = 0;
                    if (cfg.skinOutCm > 0) {
                        const th = cfg.skinOutCm * (0.7 + 0.6 * Noise.v2(zz * 6, yy * 6, sd));
                        ks = smooth(th + px, th - px, dOut);
                        const deep = smooth(th * 0.6, 0, dOut);
                        col = mix3(col, SK[1], ks);
                        col = mix3(col, SK[2], ks * deep * 0.6);
                    }
                    // 紙に接していた面（内面）の淡い黄金色の線
                    const ti = cfg.skinInCm * (0.6 + 0.8 * Noise.v2(zz * 5, yy * 5, sd + 3));
                    const ki = smooth(ti + px, ti - px, dIn) * cfg.innerLineK;
                    col = mix3(col, LN, ki);
                    // 気泡（2 帯域）。焼き面には無い
                    let P = Math.max(
                        Noise.pores2(zz, yy, 0.050 * ps, 0.45, 0.008 * ps, 0.020 * ps, sa + 5),
                        Noise.pores2(zz, yy, 0.140 * ps, 0.32, 0.018 * ps, 0.045 * ps, sb + 5) * 0.9
                    ) * (1 - ks);

                    // ナイフに引きずられたクリーム（上のクリームが下の生地へ）
                    let sm = 0;
                    if (aS > 0.01) {
                        const dy = 0.04 + 0.22 * Noise.v2(zz * 2.2, yy * 0.6, sc + 9);
                        const y2 = yy + dy, r2 = Math.hypot(zz, y2), ph2 = Math.atan2(y2, zz);
                        const Ro2 = sec.rOut(ph2);
                        if (r2 < Ro2) {
                            const sd2 = sec.sample(r2 / Ro2, ph2).sd * Ro2;
                            if (sd2 < 0) {
                                sm = smooth(0.52, 0.78, Noise.fbm2(zz * 3.5, yy * 1.4, 2, sc + 13))
                                    * smooth(0, 0.05, -sd2) * (1 - dy / 0.30) * 0.75;
                            }
                        }
                    }
                    col = mix3(col, CM, sm * (1 - ks));
                    P *= 1 - sm;
                    // 気泡の中は影で暗くなるが、灰色ではなく濃い黄色に寄る
                    const pk = 0.24 * P;
                    col = [col[0] * (1 - pk * 0.85), col[1] * (1 - pk), col[2] * (1 - pk * 1.35)];
                    const Hs = (Noise.fbm2(zz * 30, yy * 30, 2, sd + 7) - 0.5) * 0.006 - P * 0.022 + sm * 0.004;
                    const rs = mix(mix(0.90, 0.62, ks), 0.55, sm);

                    // ---- クリーム ------------------------------------
                    const st = Noise.v2(zz * 1.6, yy * 38, sd + 17);           // ナイフの筋（横方向）
                    const cv = 0.985 + 0.03 * (Noise.fbm2(zz * 8, yy * 8, 2, sd + 19) - 0.5);
                    const cc = [CM[0] * cv, CM[1] * cv, CM[2] * cv];
                    const Hc = -0.012 + (st - 0.5) * 0.004 + (Noise.v2(zz * 60, yy * 60, sd + 23) - 0.5) * 0.0012;
                    const rc = 0.36 + 0.14 * st;

                    const fc = mix3(cc, col, aS);
                    alb[o4] = clamp(fc[0], 0, 1) * 255; alb[o4 + 1] = clamp(fc[1], 0, 1) * 255;
                    alb[o4 + 2] = clamp(fc[2], 0, 1) * 255; alb[o4 + 3] = 255;
                    orm[o4] = mix(1, 1 - 0.55 * P, aS) * 255;
                    orm[o4 + 1] = mix(rc, rs, aS) * 255;
                    orm[o4 + 2] = 0; orm[o4 + 3] = 255;
                    H[q] = mix(Hc, Hs, aS);
                }
            }
            const nrm = this._normals(H, N, N, px, 1.0, false);
            const tag = "cap" + seed;
            const res = {
                Rm,
                alb: this._tex(tag + "Alb", N, N, (d) => d.set(alb), scene),
                orm: this._tex(tag + "Orm", N, N, (d) => d.set(orm), scene),
                nrm: this._tex(tag + "Nrm", N, N, (d) => d.set(nrm), scene),
                ms: performance.now() - t0
            };
            return res;
        },

        // ---- 外皮（側面）。ノイズは 3D 空間で評価して継ぎ目を消す
        side(sec, cfg, L, seed, scene) {
            const t0 = performance.now();
            const W = GLOBAL.sideTexWidth;
            const circ = TAU * sec.R;
            const Hh = clamp(Math.round(W * L / circ), 64, 1024);
            const alb = new Uint8ClampedArray(W * Hh * 4);
            const orm = new Uint8ClampedArray(W * Hh * 4);
            const H = new Float32Array(W * Hh);
            const SK = cfg.skin, S0 = cfg.sponge[0], S1 = cfg.sponge[1];
            const ps = cfg.poreScale;
            const a = seed + 3, b = seed + 19, c = seed + 37;
            for (let j = 0; j < Hh; j++) {
                const x = -L / 2 + L * (j + 0.5) / Hh;
                for (let i = 0; i < W; i++) {
                    const phi = -Math.PI + TAU * (i + 0.5) / W;
                    const Ro = sec.rOut(phi);
                    const py = Ro * Math.sin(phi), pz = Ro * Math.cos(phi);
                    const q = j * W + i, o4 = q * 4;
                    let col, h = 0, rough, ao = 1;
                    // 外側のシートの端（底の脇の継ぎ目）
                    let dphi = phi - sec.phiMerge;
                    dphi = Math.atan2(Math.sin(dphi), Math.cos(dphi));
                    const groove = smooth(0.07, 0.0, Math.abs(dphi) * Ro) * (0.7 + 0.3 * Noise.v3(x * 3, py, pz, c));
                    if (cfg.outer === "skin") {
                        const mott = Noise.fbm3(x * 0.55, py * 0.55, pz * 0.55, 4, a);
                        // 焼きむらは弱く広く。濃淡の斑を強くすると迷彩柄になる
                        col = mix3(SK[0], SK[1], smooth(0.20, 0.80, mott));
                        const deep = smooth(0.62, 0.86, Noise.fbm3(x * 1.2 + 5, py * 1.2, pz * 1.2, 3, b));
                        // 上面ほど焼き色が濃い（天板側が上になって焼ける）
                        const topK = smooth(-0.2, 0.9, py / Ro);
                        col = mix3(col, SK[2], deep * 0.22 + topK * 0.18);
                        const sp = 0.955 + 0.09 * Noise.v3(x * 18, py * 18, pz * 18, c);
                        const pz3 = Noise.pores3(x, py, pz, 0.09, 0.32, 0.008, 0.020, c + 5);
                        const pk = 1 - 0.28 * pz3;
                        col = [col[0] * sp * pk, col[1] * sp * pk, col[2] * sp * pk];
                        // 焼き面の細かいちりめん皺
                        const wr = 1 - Math.abs(2 * Noise.v3(x * 4, py * 9, pz * 9, c + 9) - 1);
                        h = smooth(0.78, 1.0, wr) * 0.004 - pz3 * 0.012
                            + (Noise.fbm3(x * 25, py * 25, pz * 25, 2, c + 13) - 0.5) * 0.002;
                        rough = 0.50 + 0.14 * mott + 0.10 * deep;
                        ao = 1 - 0.4 * pz3;
                    } else {
                        // 皮をむいた面：淡い黄色の多孔質
                        col = mix3(S0, S1, smooth(0.3, 0.7, Noise.fbm3(x * 12, py * 12, pz * 12, 3, a)));
                        const rem = smooth(0.70, 0.86, Noise.fbm3(x * 0.9, py * 0.9, pz * 0.9, 3, b));
                        col = mix3(col, cfg.line, rem * 0.25);
                        const P = Math.max(
                            Noise.pores3(x, py, pz, 0.065 * ps, 0.55, 0.010 * ps, 0.024 * ps, c + 5),
                            Noise.pores3(x, py, pz, 0.15 * ps, 0.30, 0.022 * ps, 0.050 * ps, c + 7) * 0.9);
                        const pk = 0.30 * P;
                        col = [col[0] * (1 - pk), col[1] * (1 - pk * 1.08), col[2] * (1 - pk * 1.2)];
                        h = -0.035 * P + (Noise.fbm3(x * 30, py * 30, pz * 30, 2, c + 13) - 0.5) * 0.006;
                        rough = 0.90; ao = 1 - 0.5 * P;
                    }
                    col = [col[0] * (1 - 0.15 * groove), col[1] * (1 - 0.15 * groove), col[2] * (1 - 0.15 * groove)];
                    h -= groove * 0.025;
                    alb[o4] = clamp(col[0], 0, 1) * 255; alb[o4 + 1] = clamp(col[1], 0, 1) * 255;
                    alb[o4 + 2] = clamp(col[2], 0, 1) * 255; alb[o4 + 3] = 255;
                    orm[o4] = ao * 255; orm[o4 + 1] = rough * 255; orm[o4 + 2] = 0; orm[o4 + 3] = 255;
                    H[q] = h;
                }
            }
            // 周方向と軸方向でテクセルの大きさが違うので、細かいほうで勾配を取る
            const px = Math.min(circ / W, L / Hh);
            const nrm = this._normals(H, W, Hh, px, 0.9, true);
            const tag = "side" + seed;
            return {
                alb: this._tex(tag + "Alb", W, Hh, (d) => d.set(alb), scene),
                orm: this._tex(tag + "Orm", W, Hh, (d) => d.set(orm), scene),
                nrm: this._tex(tag + "Nrm", W, Hh, (d) => d.set(nrm), scene),
                ms: performance.now() - t0
            };
        },

        // ---- 皿：断面の弧長 v に沿った 1 次元の帯（白磁 / 金縁）
        plateStrip(name, goldOf, scene) {
            const W = 4, Hh = 512;
            const GOLD = [1.0, 0.80, 0.42];
            const WHITE = [0.905, 0.900, 0.880];
            const alb = this._tex(name + "Alb", W, Hh, (d) => {
                for (let j = 0; j < Hh; j++) {
                    const g = goldOf((j + 0.5) / Hh);
                    const c = mix3(WHITE, GOLD, g);
                    for (let i = 0; i < W; i++) {
                        const o = (j * W + i) * 4;
                        d[o] = c[0] * 255; d[o + 1] = c[1] * 255; d[o + 2] = c[2] * 255; d[o + 3] = 255;
                    }
                }
            }, scene);
            const orm = this._tex(name + "Orm", W, Hh, (d) => {
                for (let j = 0; j < Hh; j++) {
                    const g = goldOf((j + 0.5) / Hh);
                    for (let i = 0; i < W; i++) {
                        const o = (j * W + i) * 4;
                        d[o] = 255; d[o + 1] = mix(0.16, 0.24, g) * 255; d[o + 2] = g * 255; d[o + 3] = 255;
                    }
                }
            }, scene);
            return { alb, orm };
        },

        // ---- ドイリー（レースペーパー）。透かしはアルファで抜く
        doily(N, scene) {
            const t0 = performance.now();
            const A = new Uint8ClampedArray(N * N * 4);
            const H = new Float32Array(N * N);
            for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
                const x = (i + 0.5) / N * 2 - 1, y = (j + 0.5) / N * 2 - 1;
                const r = Math.hypot(x, y), th = Math.atan2(y, x);
                let solid = 1, h = 0;
                // 外周のスカラップ
                const edge = 0.93 + 0.055 * Math.pow(Math.abs(Math.cos(th * 18)), 0.6);
                if (r > edge) solid = 0;
                // 縁の小さな丸穴の列
                {
                    const n = 108, a = th * n / TAU, f = a - Math.floor(a) - 0.5;
                    const d = Math.hypot(f * TAU * 0.885 / n, r - 0.885);
                    if (d < 0.0105) solid = 0;
                    h += smooth(0.022, 0.012, d) * 0.6;
                }
                // 菱形格子のレース帯
                if (r > 0.64 && r < 0.84) {
                    const u = th * 64 / TAU, v = (r - 0.64) / 0.20 * 4.0;
                    const fu = u - Math.floor(u) - 0.5, fv = v - Math.floor(v) - 0.5;
                    const dm = Math.abs(fu) + Math.abs(fv);
                    const rim = smooth(0.64, 0.66, r) * smooth(0.84, 0.82, r);
                    if (dm < 0.34 && rim > 0.5) solid = 0;
                    h += smooth(0.30, 0.45, dm) * 0.5;
                }
                // 花びら形の窓
                if (r > 0.53 && r < 0.62) {
                    const n = 32, a = th * n / TAU, f = a - Math.floor(a) - 0.5;
                    const pr = (r - 0.575) / 0.040;
                    if (f * f * 10 + pr * pr < 0.55 * (1 - 0.3 * pr)) solid = 0;
                }
                // 中心（お菓子が乗る所）は無地にエンボスの同心円
                if (r < 0.52) h += 0.25 * (0.5 + 0.5 * Math.cos(r * 120)) * smooth(0.40, 0.50, r);
                const o = (j * N + i) * 4;
                const c = 0.93 - 0.02 * Noise.v2(x * 40, y * 40, 7);
                A[o] = c * 255; A[o + 1] = (c - 0.005) * 255; A[o + 2] = (c - 0.02) * 255; A[o + 3] = solid * 255;
                H[j * N + i] = h * 0.01;
            }
            const nrm = this._normals(H, N, N, 23 / N, 1.0, false);
            return {
                alb: this._tex("doilyAlb", N, N, (d) => d.set(A), scene, true),
                nrm: this._tex("doilyNrm", N, N, (d) => d.set(nrm), scene),
                ms: performance.now() - t0
            };
        }
    };

    // =================================================================
    // 5. Cake : 断面 → 面取り → 側面 → 面取り → 断面 を 1 枚の格子で掃引
    // =================================================================
    // 【対策】断面と側面を別メッシュにすると、隙間・蓋の欠け・片側だけの
    //         裏返りが同時に起きる（SKILL 1.5）。1 本の閉じた輪郭として作り、
    //         材質は SubMesh で切り替える。断面の中心は極（半径 0）で閉じる
    function buildCakePiece(base, sec, cfg, L, mats, capTex, opt, scene) {
        const M = GLOBAL.columns, Nr = GLOBAL.capRings, bv = GLOBAL.bevel, NB = 6;
        const nSeg = Math.max(3, Math.ceil((L - 2 * bv) / 0.30));
        const rows = [];
        for (let i = 0; i <= Nr; i++) rows.push({ k: "cap", s: 1, rt: Math.pow(i / Nr, 0.85) });
        const sideStart = rows.length;
        for (let i = 0; i <= NB; i++) rows.push({ k: "bev", s: 1, a: (Math.PI / 2) * i / NB });
        for (let i = 1; i < nSeg; i++) rows.push({ k: "side", x: (L / 2 - bv) - (L - 2 * bv) * i / nSeg });
        for (let i = NB; i >= 0; i--) rows.push({ k: "bev", s: -1, a: (Math.PI / 2) * i / NB });
        const backStart = rows.length;
        for (let i = Nr; i >= 0; i--) rows.push({ k: "cap", s: -1, rt: Math.pow(i / Nr, 0.85) });

        const W = M + 1, nV = rows.length * W;
        const pos = new Float32Array(nV * 3), uvs = new Float32Array(nV * 2);
        const Rm = capTex.Rm;
        const ca = Math.cos(opt.rotX || 0), sa = Math.sin(opt.rotX || 0);
        const cb = Math.cos(opt.rotY || 0), sb = Math.sin(opt.rotY || 0);
        const tA = opt.tiltA || 0, tB = opt.tiltB || 0;
        const lenF = (x) => cfg.layout === "log"
            ? 1 + (Noise.n1(x * 0.35 + 3.1, sec.seed + 77) - 0.5) * 0.024 : 1;
        let p = 0, q = 0;
        for (let ri = 0; ri < rows.length; ri++) {
            const row = rows[ri];
            for (let j = 0; j <= M; j++) {
                const phi = -Math.PI + TAU * j / M;
                const c = Math.cos(phi), s = Math.sin(phi);
                const Rt = sec.rOut(phi);
                let x, r, u, v;
                if (row.k === "cap") {
                    x = row.s * L / 2;
                    r = row.rt * (Rt * lenF(x) - bv);
                    // 断面の UV は「面取り前の輪郭」で正規化した位置（テクスチャ空間）
                    u = (row.rt * Rt * c + Rm) / (2 * Rm);
                    v = (row.rt * Rt * s + Rm) / (2 * Rm);
                } else {
                    if (row.k === "bev") {
                        x = row.s * (L / 2 - bv + bv * Math.cos(row.a));
                        r = Rt * lenF(x) - bv + bv * Math.sin(row.a);
                    } else {
                        x = row.x;
                        r = Rt * lenF(x);
                    }
                    u = j / M;
                    v = (x + L / 2) / L;
                }
                let py = r * s, pz = r * c;
                // 包丁の角度のずれ：断面がわずかに斜めになる
                let px = x + (x / (L / 2)) * (tA * py + tB * pz);
                // 姿勢（X → Y の順で焼き込む）
                const y1 = py * ca - pz * sa, z1 = py * sa + pz * ca;
                const x2 = px * cb + z1 * sb, z2 = -px * sb + z1 * cb;
                pos[p++] = x2; pos[p++] = y1; pos[p++] = z2;
                uvs[q++] = u; uvs[q++] = v;
            }
        }
        const capF = gridIndices(M, 0, sideStart);
        const side = gridIndices(M, sideStart, backStart);
        const capB = gridIndices(M, backStart, rows.length);
        const indices = capF.concat(capB, side);
        const mesh = finishMesh(base, pos, indices, uvs, { x: 0, y: 0, z: 0 }, scene);
        const capLen = capF.length + capB.length;
        mesh.subMeshes = [];
        new BABYLON.SubMesh(1, 0, nV, 0, capLen, mesh);
        new BABYLON.SubMesh(0, 0, nV, capLen, side.length, mesh);
        mesh.material = mats.multi;
        mesh.__minY = localMinY(pos);
        mesh.__nTri = indices.length / 3;
        return mesh;
    }

    function makeCakeMaterials(cfg, capTex, sideTex, scene) {
        const capM = named(new BABYLON.PBRMaterial("cakeCut", scene), "cakeCut");
        capM.albedoTexture = capTex.alb;
        capM.bumpTexture = capTex.nrm;
        capM.bumpTexture.level = 1.0;
        capM.metallicTexture = capTex.orm;
        capM.useAmbientOcclusionFromMetallicTextureRed = true;
        capM.useRoughnessFromMetallicTextureGreen = true;
        capM.useMetallnessFromMetallicTextureBlue = true;
        capM.metallic = 1.0; capM.roughness = 1.0;      // テクスチャへの乗数
        // 【対策】subSurface の透過は使わない。厚み 3cm の断面が裏の灯で
        //         光って見える。断面は完全マット＋クリームだけ半艶で十分
        capM.environmentIntensity = 0.9;

        const sideM = named(new BABYLON.PBRMaterial("cakeSkin", scene), "cakeSkin");
        sideM.albedoTexture = sideTex.alb;
        sideM.bumpTexture = sideTex.nrm;
        sideM.bumpTexture.level = 1.0;
        sideM.metallicTexture = sideTex.orm;
        sideM.useAmbientOcclusionFromMetallicTextureRed = true;
        sideM.useRoughnessFromMetallicTextureGreen = true;
        sideM.useMetallnessFromMetallicTextureBlue = true;
        sideM.metallic = 1.0; sideM.roughness = 1.0;
        if (cfg.outer === "skin") {
            // 焼き面はしっとりした半艶。均一なクリアコートは濡れたプラスチックになるので弱く
            sideM.clearCoat.isEnabled = true;
            sideM.clearCoat.intensity = 0.22;
            sideM.clearCoat.roughness = 0.38;
            sideM.clearCoat.indexOfRefraction = 1.45;
        }
        const multi = named(new BABYLON.MultiMaterial("cakeMulti", scene), "cakeMulti");
        multi.subMaterials.push(sideM, capM);
        return { multi, capM, sideM };
    }

    // =================================================================
    // 6. Plates / Doily / Table
    // =================================================================
    // 輪郭 outline(t) を内側へ d だけ寄せた曲線と、さらに中心へ縮めた面で
    // 皿の断面（裏の中心 → 高台 → 縁 → 見込み → 表の中心）を一周させる
    function buildOutlinePlate(base, outline, profile, d1, wave, M, scene) {
        const W = M + 1, nR = profile.length;
        const pos = new Float32Array(nR * W * 3), uvs = new Float32Array(nR * W * 2);
        // v は弧長で刻む（SKILL 1.6）。代表として t = 0 の断面で測る
        const o0 = outline(0);
        const pt = (e, o) => {
            const qx = o.x - d1 * o.nx, qz = o.z - d1 * o.nz;
            if (e.s !== undefined) return [qx * e.s, qz * e.s];
            return [o.x - e.d * o.nx, o.z - e.d * o.nz];
        };
        const arc = [0];
        let prev = pt(profile[0], o0), prevY = profile[0].y;
        for (let i = 1; i < nR; i++) {
            const c = pt(profile[i], o0);
            arc.push(arc[i - 1] + Math.hypot(Math.hypot(c[0], c[1]) - Math.hypot(prev[0], prev[1]), profile[i].y - prevY));
            prev = c; prevY = profile[i].y;
        }
        const total = arc[nR - 1];
        let p = 0, q = 0, ySum = 0;
        for (let i = 0; i < nR; i++) {
            const e = profile[i];
            for (let j = 0; j <= M; j++) {
                const t = (j % M) / M;
                const o = outline(t);
                const c = pt(e, o);
                const y = e.y + (wave ? wave(t, e) : 0);
                pos[p++] = c[0]; pos[p++] = y; pos[p++] = c[1];
                uvs[q++] = j / M; uvs[q++] = arc[i] / total;
                ySum += y;
            }
        }
        const idx = gridIndices(M, 0, nR);
        const mesh = finishMesh(base, pos, idx, uvs, { x: 0, y: ySum / (nR * W), z: 0 }, scene);
        mesh.__arc = arc.map((a) => a / total);
        return mesh;
    }

    // 金の帯：profile の g を弧長 v で線形補間
    function goldFromProfile(profile, arcN) {
        return (v) => {
            for (let i = 1; i < profile.length; i++) {
                if (v <= arcN[i]) {
                    const a = (v - arcN[i - 1]) / Math.max(1e-6, arcN[i] - arcN[i - 1]);
                    return clamp(mix(profile[i - 1].g || 0, profile[i].g || 0, a), 0, 1);
                }
            }
            return 0;
        };
    }

    function makePlateMaterial(name, strip, scene) {
        const m = named(new BABYLON.PBRMaterial(name, scene), name);
        m.albedoTexture = strip.alb;
        m.metallicTexture = strip.orm;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.metallic = 1.0; m.roughness = 1.0;
        // 磁器の釉薬。下地の上につるりとした層
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.80;
        m.clearCoat.roughness = 0.06;
        return m;
    }

    // ---- 輪花皿（3 枚目の写真：縁が波打つ白磁に金縁） ----------------
    function buildFlutedPlate(scene) {
        const Rp = 9.2, n = 24;
        const outline = (t) => {
            const th = TAU * t;
            const R = Rp * (1 + 0.010 * Math.cos(n * th));
            return { x: R * Math.cos(th), z: R * Math.sin(th), nx: Math.cos(th), nz: Math.sin(th) };
        };
        const d1 = 4.8;
        const prof = [
            { s: 0, y: 0.12 }, { s: 1, y: 0.12 },
            { d: 4.70, y: 0.03 }, { d: 4.45, y: 0.0 }, { d: 4.15, y: 0.04 },
            { d: 2.40, y: 0.30 }, { d: 0.90, y: 0.62 }, { d: 0.25, y: 0.80 },
            { d: 0.02, y: 0.90, g: 1 }, { d: 0.03, y: 1.00, g: 1 }, { d: 0.14, y: 1.03, g: 0.6 },
            { d: 0.30, y: 0.99 }, { d: 1.00, y: 0.80 }, { d: 2.40, y: 0.46 },
            { d: 3.80, y: 0.30 }, { d: 4.80, y: 0.28 }, { s: 1, y: 0.28 }, { s: 0, y: 0.28 }
        ];
        const wave = (t, e) => e.d === undefined ? 0 : 0.14 * Math.cos(n * TAU * t) * smooth(2.8, 0.9, e.d);
        const mesh = buildOutlinePlate("plateFluted", outline, prof, d1, wave, 384, scene);
        const strip = TextureLab.plateStrip("plateFluted", goldFromProfile(prof, mesh.__arc), scene);
        mesh.material = makePlateMaterial("plateFlutedMat", strip, scene);
        mesh.receiveShadows = true;
        return { mesh, top: 0.28, extent: 6.0 };
    }

    // ---- 角皿（2 枚目の写真） ----------------------------------------
    function buildSquarePlate(scene) {
        const a = 14.5, b = 9.5, rc = 2.4;
        const sx = a - rc, sz = b - rc;
        const segs = [
            { len: sz, f: (u) => [a, u * sz, 1, 0] },
            { len: Math.PI * rc / 2, f: (u) => { const t = u * Math.PI / 2; return [sx + rc * Math.cos(t), sz + rc * Math.sin(t), Math.cos(t), Math.sin(t)]; } },
            { len: 2 * sx, f: (u) => [sx - 2 * sx * u, b, 0, 1] },
            { len: Math.PI * rc / 2, f: (u) => { const t = Math.PI / 2 + u * Math.PI / 2; return [-sx + rc * Math.cos(t), sz + rc * Math.sin(t), Math.cos(t), Math.sin(t)]; } },
            { len: 2 * sz, f: (u) => [-a, sz - 2 * sz * u, -1, 0] },
            { len: Math.PI * rc / 2, f: (u) => { const t = Math.PI + u * Math.PI / 2; return [-sx + rc * Math.cos(t), -sz + rc * Math.sin(t), Math.cos(t), Math.sin(t)]; } },
            { len: 2 * sx, f: (u) => [-sx + 2 * sx * u, -b, 0, -1] },
            { len: Math.PI * rc / 2, f: (u) => { const t = 1.5 * Math.PI + u * Math.PI / 2; return [sx + rc * Math.cos(t), -sz + rc * Math.sin(t), Math.cos(t), Math.sin(t)]; } },
            { len: sz, f: (u) => [a, -sz + u * sz, 1, 0] }
        ];
        const P = segs.reduce((s, g) => s + g.len, 0);
        const outline = (t) => {
            let L = t * P;
            for (const g of segs) {
                if (L <= g.len) { const r = g.f(L / g.len); return { x: r[0], z: r[1], nx: r[2], nz: r[3] }; }
                L -= g.len;
            }
            const r = segs[0].f(0); return { x: r[0], z: r[1], nx: r[2], nz: r[3] };
        };
        const d1 = 1.8;
        const prof = [
            { s: 0, y: 0.06 }, { s: 1, y: 0.06 },
            { d: 1.70, y: 0.0 }, { d: 1.10, y: 0.0 }, { d: 0.60, y: 0.03 },
            { d: 0.10, y: 0.16 }, { d: 0.00, y: 0.34 }, { d: 0.03, y: 0.56 },
            { d: 0.16, y: 0.67 }, { d: 0.45, y: 0.69 }, { d: 0.90, y: 0.62 },
            { d: 1.40, y: 0.585 }, { d: 1.80, y: 0.58 }, { s: 1, y: 0.58 }, { s: 0, y: 0.58 }
        ];
        const mesh = buildOutlinePlate("plateSquare", outline, prof, d1, null, 320, scene);
        const strip = TextureLab.plateStrip("plateSquare", () => 0, scene);
        mesh.material = makePlateMaterial("plateSquareMat", strip, scene);
        mesh.material.clearCoat.roughness = 0.12;     // 角皿はやや艶を抑えた釉薬
        mesh.receiveShadows = true;
        return { mesh, top: 0.58, extent: 9.0 };
    }

    // ---- ドイリー（4 枚目の写真） --------------------------------------
    function buildDoily(scene) {
        const Rd = 11.5, NR = 48, M = 192, W = M + 1;
        const pos = new Float32Array((NR + 1) * W * 3), uvs = new Float32Array((NR + 1) * W * 2);
        let p = 0, q = 0;
        for (let i = 0; i <= NR; i++) {
            const r = Rd * i / NR;
            for (let j = 0; j <= M; j++) {
                const th = TAU * j / M;
                const x = r * Math.cos(th), z = r * Math.sin(th);
                // 紙のわずかな波打ち（中心は菓子の重みで平ら）
                const y = 0.03 + 0.06 * smooth(5.5, 11.5, r) * (Noise.v2(x * 0.25, z * 0.25, 5) - 0.4);
                pos[p++] = x; pos[p++] = y; pos[p++] = z;
                uvs[q++] = (x / Rd + 1) / 2; uvs[q++] = (z / Rd + 1) / 2;
            }
        }
        const mesh = finishMesh("doily", pos, gridIndices(M, 0, NR + 1), uvs, { x: 0, y: -5, z: 0 }, scene);
        const tex = TextureLab.doily(1024, scene);
        const m = named(new BABYLON.PBRMaterial("doilyMat", scene), "doilyMat");
        m.albedoTexture = tex.alb;
        m.useAlphaFromAlbedoTexture = true;
        m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHATEST;
        m.alphaCutOff = 0.5;
        m.bumpTexture = tex.nrm;
        m.metallic = 0; m.roughness = 0.80;
        m.backFaceCulling = false;
        mesh.material = m;
        mesh.receiveShadows = true;
        return { mesh, top: 0.03, extent: 8.0 };
    }

    function buildTable(bg, scene) {
        const t = named(BABYLON.MeshBuilder.CreateDisc("table", { radius: 90, tessellation: 96 }, scene), "table");
        t.rotation.x = Math.PI / 2;
        t.position.y = -0.003;
        const m = named(new BABYLON.PBRMaterial("tableMat", scene), "tableMat");
        const c = bg === "dark" ? [0.075, 0.072, 0.075] : [0.80, 0.80, 0.80];
        m.albedoColor = new BABYLON.Color3(s2l(c[0]), s2l(c[1]), s2l(c[2]));
        m.metallic = 0; m.roughness = bg === "dark" ? 0.55 : 0.92;
        t.material = m;
        t.receiveShadows = true;
        return t;
    }

    // =================================================================
    // 7. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.80, 0.80, 0.80, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.2;              // SKILL 3.4
    scene.environmentIntensity = 0.80;

    const camera = new BABYLON.ArcRotateCamera("cam", -0.55, 0.98, 20, new V3(0, 3, 0), scene);
    named(camera, "cam");
    camera.attachControl(true);
    camera.wheelPrecision = 12;
    camera.pinchPrecision = 60;
    camera.minZ = 0.1;
    camera.maxZ = 400;                          // SKILL 4.3：深度の量子化で DOF が消えるのを防ぐ
    camera.lowerRadiusLimit = 6;
    camera.upperRadiusLimit = 120;
    camera.upperBetaLimit = 1.52;
    scene.cameraToUseForPointers = camera;

    // ---- 3 灯 + 環境（SKILL 4.1） ---------------------------------------
    // 写真はどれも窓際の柔らかい光。キーは奥の左上、フィルはカメラ側から
    const key = new BABYLON.DirectionalLight("key", new V3(14, -22, -10).normalize(), scene);
    named(key, "key");
    key.position = new V3(-14, 22, 10);
    key.intensity = 2.5;
    key.diffuse = new BABYLON.Color3(1.0, 0.975, 0.94);
    key.specular = new BABYLON.Color3(0.85, 0.83, 0.80);
    key.autoCalcShadowZBounds = true;

    const fill = new BABYLON.DirectionalLight("fill", new V3(-16, -9, 14).normalize(), scene);
    named(fill, "fill");
    fill.intensity = 1.05;
    fill.diffuse = new BABYLON.Color3(0.96, 0.97, 1.0);
    fill.specular = new BABYLON.Color3(0.18, 0.18, 0.18);

    // キック：拡散はほぼ 0、皮とクリームに照りの筋を足すだけ
    const kick = new BABYLON.DirectionalLight("kick", new V3(5, -8, 14).normalize(), scene);
    named(kick, "kick");
    kick.intensity = 1.1;
    kick.diffuse = new BABYLON.Color3(0.06, 0.06, 0.06);
    kick.specular = new BABYLON.Color3(1.0, 0.98, 0.95);

    const hemi = new BABYLON.HemisphericLight("hemi", new V3(0, 1, 0), scene);
    named(hemi, "hemi");
    hemi.intensity = 0.30;
    hemi.specular = new BABYLON.Color3(0, 0, 0);

    // 【対策】影は ESM ではなく PCF。ESM の自己遮蔽は断面に痣として出る
    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.forceBackFacesOnly = true;
    sg.bias = 0.0008;
    sg.normalBias = 0.012;
    sg.setDarkness(0.38);

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.18;
    ip.contrast = 1.12;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.2;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    // =================================================================
    // 8. Build
    // =================================================================
    let state = null;
    let onRebuilt = null;
    const ssaoRef = { p: null };

    function disposeState() {
        if (!state) return;
        for (const m of state.meshes) m.dispose(false, false);
        for (const m of state.materials) m.dispose(false, false);
        for (const t of state.textures) t.dispose();
        state.root.dispose();
        state = null;
    }

    function build(presetKey, seed) {
        disposeState();
        const t0 = performance.now();
        const cfg = Object.assign({}, GLOBAL, PRESETS[presetKey]);
        cfg.preset = presetKey; cfg.seed = seed >>> 0;
        const rng = new Rng((seed ^ 0x9E3779B9) >>> 0);
        const sec = new Section(cfg, seed >>> 0);
        const root = named(new BABYLON.TransformNode("rollRoot", scene), "rollRoot");

        const capTex = TextureLab.cap(sec, cfg, GLOBAL.capTexSize, seed >>> 0, scene);
        const sideTex = TextureLab.side(sec, cfg, cfg.L, (seed + 5) >>> 0, scene);
        const mats = makeCakeMaterials(cfg, capTex, sideTex, scene);

        // ---- 器 ------------------------------------------------------
        const table = buildTable(cfg.bg, scene);
        let plate;
        if (cfg.plate === "fluted") plate = buildFlutedPlate(scene);
        else if (cfg.plate === "square") plate = buildSquarePlate(scene);
        else plate = buildDoily(scene);
        plate.mesh.parent = root;
        const c = cfg.bg === "dark" ? [0.075, 0.072, 0.075] : [0.80, 0.80, 0.80];
        scene.clearColor = new BABYLON.Color4(s2l(c[0]) * 1.2, s2l(c[1]) * 1.2, s2l(c[2]) * 1.2, 1);

        // ---- 並べ方 --------------------------------------------------
        const pieces = [];
        if (cfg.layout === "row3") {
            // 2 枚目の写真：切り分けたまま少しずつずらして並べる
            const gap = 0.30;
            for (let k = 0; k < 3; k++) {
                pieces.push({
                    x: (1 - k) * (cfg.L + gap) + rng.range(-0.05, 0.05),
                    z: (k - 1) * 0.35 + rng.range(-0.1, 0.1),
                    rotX: rng.range(-0.05, 0.05), rotY: rng.range(-0.05, 0.05)
                });
            }
        } else {
            pieces.push({ x: 0, z: 0, rotX: rng.range(-0.04, 0.04), rotY: rng.range(-0.05, 0.05) });
        }
        const meshes = [table, plate.mesh];
        let nTri = 0;
        for (let k = 0; k < pieces.length; k++) {
            const pc = pieces[k];
            const m = buildCakePiece("rollcake" + k, sec, cfg, cfg.L, mats, capTex, {
                rotX: pc.rotX, rotY: pc.rotY,
                tiltA: rng.range(-0.025, 0.025), tiltB: rng.range(-0.02, 0.02)
            }, scene);
            m.parent = root;
            m.position.set(pc.x, plate.top - m.__minY + 0.002, pc.z);
            m.receiveShadows = true;
            meshes.push(m);
            nTri += m.__nTri;
        }
        root.rotation.y = cfg.layout === "row3" ? -0.25 : 0;

        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        for (const m of meshes) if (m !== table) sg.addShadowCaster(m, false);

        // ---- カメラ --------------------------------------------------
        const cy = plate.top + sec.cy;
        if (cfg.layout === "slice") { camera.alpha = -0.55; camera.beta = 0.98; camera.radius = 21; }
        else if (cfg.layout === "row3") { camera.alpha = -0.50; camera.beta = 0.95; camera.radius = 30; }
        else { camera.alpha = -0.80; camera.beta = 1.18; camera.radius = 30; }
        camera.target.set(0, cy * 0.85, 0);
        if (ssaoRef.p) ssaoRef.p.radius = 0.6;

        state = {
            cfg, sec, root, meshes,
            materials: [mats.multi, mats.capM, mats.sideM, plate.mesh.material, table.material],
            textures: [capTex.alb, capTex.orm, capTex.nrm, sideTex.alb, sideTex.orm, sideTex.nrm]
                .concat(plate.mesh.material.albedoTexture ? [plate.mesh.material.albedoTexture] : [])
                .concat(plate.mesh.material.metallicTexture ? [plate.mesh.material.metallicTexture] : [])
                .concat(plate.mesh.material.bumpTexture ? [plate.mesh.material.bumpTexture] : []),
            ms: performance.now() - t0, capMs: capTex.ms, sideMs: sideTex.ms, nTri
        };
        console.log("[RollCake]", cfg.label, "/ seed =", cfg.seed, "/ 巻き", cfg.turns.toFixed(2),
            "/ tris", nTri, "/ cap", capTex.ms.toFixed(0) + "ms / side", sideTex.ms.toFixed(0)
            + "ms / total", state.ms.toFixed(0) + "ms");
        if (onRebuilt) onRebuilt(state);
        return state;
    }

    build(START_PRESET, START_SEED);

    // ---- ポストプロセス ------------------------------------------------
    if (GLOBAL.useSSAO) {
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.6;
        ssao.totalStrength = 0.85;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 150;
        ssao.minZAspect = 0.2;
        ssaoRef.p = ssao;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.92;
    dp.bloomWeight = 0.10;
    dp.bloomKernel = 36;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.12;
    // 【対策】錯乱円は「シーンの 1 単位 = 1m」で計算される（SKILL 4.3）。
    //         ピント位置は radius×1000、焦点距離はその一定比率にして、
    //         寄っても引いてもボケ量が変わらないようにする
    dp.depthOfFieldEnabled = true;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.Medium;
    dp.depthOfField.lensSize = 50;
    dp.depthOfField.fStop = 2.8;
    const DOF_K = 0.055;
    scene.onBeforeRenderObservable.add(() => {
        if (!dp.depthOfFieldEnabled) return;
        const focus = camera.radius * 1000;
        dp.depthOfField.focusDistance = focus;
        dp.depthOfField.focalLength = focus * DOF_K;
    });

    // =================================================================
    // 9. GUI
    // =================================================================
    const GUI_MASK = 0x20000000;
    if (GLOBAL.guiOwnCamera) {
        const guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene);
        named(guiCam, "guiCam");
        guiCam.layerMask = GUI_MASK;
        scene.activeCameras = [camera, guiCam];
        // scene.pick() のレイが guiCam 基準にならないよう毎フレーム戻す（SKILL 6.1）
        scene.onAfterRenderObservable.add(() => { scene.activeCamera = camera; });
    } else {
        scene.activeCameras = [camera];
    }
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (ui.layer) {
        if (GLOBAL.guiOwnCamera) ui.layer.layerMask = GUI_MASK;
        else ui.layer.applyPostProcess = false;
    }
    // Babylon.GUI のサイズはレンダー解像度基準（SKILL 6.2）
    ui.idealWidth = 1400;
    ui.renderAtIdealSize = true;

    const COL = {
        idle: "#2c2722", active: "#93683a", edge: "#4c443c",
        text: "#f7f0e6", sub: "#b9aa98", accent: "#efc88f"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "236px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(20,16,13,0.80)";
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
    function spacer(h) {
        const s = new BABYLON.GUI.Rectangle();
        s.height = h; s.thickness = 0; s.background = "";
        panel.addControl(s);
    }

    addLabel("ROLL CAKE", 11, COL.sub, "18px");
    addLabel("種類", 13, COL.accent, "22px");
    let curPreset = START_PRESET, curSeed = START_SEED;
    const presetButtons = {};
    function highlight() {
        for (const k in presetButtons) presetButtons[k].background = (k === curPreset) ? COL.active : COL.idle;
    }
    for (const k of Object.keys(PRESETS)) {
        presetButtons[k] = addButton("p_" + k, PRESETS[k].label, () => {
            curPreset = k; build(curPreset, curSeed); highlight();
        });
    }
    spacer("8px");
    addButton("reseed", "別の個体を生成", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(curPreset, curSeed); highlight();
    });
    addButton("face", "断面を正面から", () => {
        camera.alpha = 0.0; camera.beta = 1.36;
        camera.radius = state.cfg.layout === "slice" ? 16 : 22;
    });
    const rotateBtn = addButton("rotate", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.12;
        rotateBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotateBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });
    let shadowOn = true;
    const shadowBtn = addButton("shadow", "影: ON", () => {
        shadowOn = !shadowOn;
        const sm = sg.getShadowMap();
        if (sm) sm.refreshRate = shadowOn ? BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME : 0;
        sg.setDarkness(shadowOn ? 0.38 : 1.0);
        shadowBtn.textBlock.text = "影: " + (shadowOn ? "ON" : "OFF");
        shadowBtn.background = shadowOn ? COL.active : COL.idle;
    });
    shadowBtn.background = COL.active;
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        dp.depthOfFieldEnabled = !dp.depthOfFieldEnabled;
        dofBtn.textBlock.text = "被写界深度: " + (dp.depthOfFieldEnabled ? "ON" : "OFF");
        dofBtn.background = dp.depthOfFieldEnabled ? COL.active : COL.idle;
    });
    dofBtn.background = COL.active;

    const info = addLabel("", 12, COL.sub, "58px");
    onRebuilt = (st) => {
        const s = st.sec;
        info.text = "径 " + (2 * s.Rz).toFixed(1) + "×" + (s.Ry + s.cy).toFixed(1) + "cm / 長さ " + st.cfg.L.toFixed(1)
            + "cm\n巻き " + st.cfg.turns.toFixed(2) + " 周 / " + (st.ms / 1000).toFixed(2) + "s\nseed: " + st.cfg.seed;
    };
    onRebuilt(state);
    highlight();

    return scene;
};

export default createScene;