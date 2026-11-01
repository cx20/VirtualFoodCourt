// =====================================================================
//  Photoreal Baguette  /  写実的なフランスパン        BUILD: baguette-2026-10-06-A
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  構成:
//    0. CONFIG      … 焼き加減プリセット / 粉の量 / 本数
//    1. Rng / Noise … シード付き乱数、3D 値ノイズ（閉曲面なので UV ではなく
//                     ワールド座標で評価して継ぎ目を消す）
//    2. LoafField   … 1本ぶんの「場」。半径・クープ（切れ目）・耳・ふくらみを
//                     返す。形とテクスチャはこれだけを参照する
//    3. TextureLab  … 場を焼いてアルベド / ORM / 法線 / クリアコートを生成
//    4. LoafMesh    … 場を掃引してチューブを張る（巻き順は実行時判定）
//    5. Tray        … 黒い天板 + 木のテーブル
//    6. Scene       … IBL / 3灯 / 影 / SSAO2 / トーンマップ / DOF
//    7. GUI
//
//  実物の要点（写真から読み取ったもの）:
//    ・バゲットは「丸い棒」ではない。断面は横に広く底が平らで、長さ方向に
//      2〜3 か所のゆるい太り・細りがある。先端は徐々に細くなり丸く終わる
//    ・クープは 5 本前後、長軸にほぼ平行で、少しずつ横にずれて重なる。
//      切れ目は中央で最も開き、両端で閉じる（紡錘形の口）
//    ・開いた口の片側だけ「耳」が立ち上がる（刃を寝かせて入れるため）。
//      耳の稜線がいちばん濃い焼き色、口の中は焼けていない淡いクラム
//    ・粉（打ち粉）は白い斑として残る。耳や焼き込んだ出っ張りには残らず、
//      くぼみ・側面・平らな所にまだらに残る。粉は完全につや消し
//    ・クラストには 1〜3mm の水疱（ブリスター）が無数にあり、これが照りの
//      粒だち。焼き色が濃いほど滑らかで艶、淡いほどざらついて粉っぽい
// =====================================================================

var createScene = function () {

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;
    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    const mix = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
    const s2l = (v) => Math.pow(v, 2.2);
    console.log("[baguette] BUILD baguette-2026-10-06-A");

    // =================================================================
    // 0. CONFIG   （1 unit = 1cm）
    // =================================================================
    const PRESETS = {
        // 浅め: 全体が淡いきつね色。耳だけ色づく
        usu:     { label: "浅め",     brown: 0.16, earBrown: 0.55, mottle: 0.14 },
        // 標準: 写真のこれ。側面は淡いきつね色、上の稜と耳が深い茶
        hyojun:  { label: "標準",     brown: 0.30, earBrown: 0.80, mottle: 0.20 },
        // よく焼き: 上面がほぼ茶で、耳は焦げ寸前
        yoku:    { label: "よく焼き", brown: 0.48, earBrown: 1.00, mottle: 0.24 }
    };
    const FLOUR = {
        sukuna: { label: "少なめ", th: 0.66 },
        futsu:  { label: "ふつう", th: 0.56 },
        ooi:    { label: "多め",   th: 0.46 }
    };

    const GLOBAL = {
        // --- 1本の寸法
        length: 56.0,            // 全長
        radius: 3.25,            // 胴の基準半径（断面は横 1.10 / 縦 0.95 に歪める）
        endPow: 4.0,             // 先端の細り方（大きいほど胴が長く先端が急）
        bottomFlat: 0.78,        // 底を平らにする高さ（radius 比）
        bend: 0.55,              // 長さ方向の反り
        lumpLo: 0.26,            // 低周波のふくらみ（cm）
        lumpMid: 0.07,           // 中周波の凹凸（cm）
        // --- クープ
        cuts: 5,
        cutLen: 14.5,            // 1本の長さ（cm）
        cutLateral: 1.70,        // 始点→終点の横ずれ（cm, 頂点をまたぐ）
        cutOpen: 1.05,           // 口の最大半幅（cm）
        cutDepth: 0.60,          // 口の深さ（cm）
        earH: 0.80,              // 耳の立ち上がり（cm）
        earW: 0.72,              // 耳の幅（cm）
        // --- 分割数 / テクスチャ
        segLen: 360, segAround: 128,
        texW: 1024, texH: 320,
        compactWidth: 900,
        // --- 置き方
        count: 4,
        pitch: 7.3,              // 隣との間隔（cm）
        showTray: true,
        useSSAO: true, useDOF: true
    };

    const START = { preset: "hyojun", flour: "futsu", count: 4, seed: 20261006 };

    function buildConfig(st) {
        const cfg = Object.assign({}, GLOBAL, PRESETS[st.preset]);
        cfg.flourTh = FLOUR[st.flour].th;
        cfg.count = st.count;
        cfg.seed = st.seed >>> 0;
        const vw = (typeof window !== "undefined" && window.innerWidth) || 1280;
        if (vw < GLOBAL.compactWidth) { cfg.texW = 768; cfg.texH = 240; }
        return cfg;
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
    }

    // 3D 値ノイズ。閉じた面（筒）なので、UV ではなく表面のワールド座標で
    // 評価する。これで周方向の継ぎ目と先端の集束点に模様の破綻が出ない
    const Noise = {
        _h(x, y, z, seed) {
            let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2246822519) ^ Math.imul(seed, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177);
            return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
        },
        v3(x, y, z, seed) {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            let fx = x - xi, fy = y - yi, fz = z - zi;
            fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
            const h = this._h;
            const c00 = mix(h(xi, yi, zi, seed), h(xi + 1, yi, zi, seed), fx);
            const c10 = mix(h(xi, yi + 1, zi, seed), h(xi + 1, yi + 1, zi, seed), fx);
            const c01 = mix(h(xi, yi, zi + 1, seed), h(xi + 1, yi, zi + 1, seed), fx);
            const c11 = mix(h(xi, yi + 1, zi + 1, seed), h(xi + 1, yi + 1, zi + 1, seed), fx);
            return mix(mix(c00, c10, fy), mix(c01, c11, fy), fz) * 2 - 1;   // -1..1
        },
        fbm(x, y, z, seed, oct, lac, gain) {
            let a = 0.5, f = 1, sum = 0, norm = 0;
            for (let i = 0; i < oct; i++) {
                sum += a * this.v3(x * f, y * f, z * f, seed + i * 131);
                norm += a; a *= gain; f *= lac;
            }
            return sum / norm;
        }
    };

    // =================================================================
    // 2. LoafField
    // =================================================================
    //  座標: s ∈ [0,1] が長さ方向、phi ∈ (-π, π] が周方向（0 = 真上）。
    //  クープは「x（長さ）× w（周方向の弧長）」の平面上の線分として持つ。
    class LoafField {
        constructor(cfg, seed) {
            this.cfg = cfg;
            const rng = new Rng(seed);
            this.seed = seed;
            this.L = cfg.length * rng.range(0.95, 1.04);
            this.R0 = cfg.radius * rng.range(0.95, 1.05);
            this.endPow = cfg.endPow * rng.range(0.9, 1.1);
            this.endSkew = rng.range(-0.06, 0.06);     // 片方の先端を少し長く
            this.bend = cfg.bend * rng.range(-1, 1);
            this.lumpSeed = Math.floor(rng.next() * 1e6);
            this.texSeed = Math.floor(rng.next() * 1e6);
            // 個体差: 焼き色の濃さと赤み
            this.tone = rng.range(-0.08, 0.08);
            this.warm = rng.range(0.97, 1.04);
            // クープ: 等間隔 + 少し乱す。長軸に対して 4〜7° 傾き、横にずれて重なる
            this.cuts = [];
            const n = cfg.cuts, usable = this.L * 0.80;
            const step = usable / n;
            for (let i = 0; i < n; i++) {
                const xc = -usable / 2 + step * (i + 0.5) + rng.range(-0.6, 0.6);
                const len = cfg.cutLen * rng.range(0.90, 1.08);
                const lat = cfg.cutLateral * rng.range(0.85, 1.15);
                // 始点は上から見て右（w>0）、終点は左（w<0）。ずれの向きは全本で揃える
                const dx = len, dw = -lat;
                const ln = Math.hypot(dx, dw);
                this.cuts.push({
                    xc, wc: rng.range(-0.15, 0.15),
                    ux: dx / ln, uw: dw / ln, half: ln / 2,
                    open: cfg.cutOpen * rng.range(0.85, 1.15),
                    depth: cfg.cutDepth * rng.range(0.85, 1.15),
                    earH: cfg.earH * rng.range(0.75, 1.20),
                    earW: cfg.earW * rng.range(0.85, 1.15),
                    // 口の最大開きの位置を中央から少しずらす
                    peak: rng.range(0.42, 0.58)
                });
            }
        }

        // 先端の細り。|2s-1| が 1 で 0 に落ちる超楕円。endSkew で左右非対称
        profile(s) {
            const u = clamp((s - 0.5) * 2 * (1 + this.endSkew * Math.sign(s - 0.5)), -1, 1);
            const a = Math.abs(u);
            // 0.5 乗で先端が放物面状に丸く終わる（0.42 だと鉛筆の先になる）
            return this.R0 * Math.pow(Math.max(0, 1 - Math.pow(a, this.endPow)), 0.5);
        }

        // 1点の場。戻り値:
        //   pos(x,y,z) 表面位置 / r 半径 / bumpLo 低周波ふくらみ(-1..1)
        //   inner 口の内側マスク / innerT 口の中心からの相対位置(0=中央,1=縁)
        //   ear 耳マスク(0..1) / earTop 耳の稜線マスク / up 上向き度(-1..1)
        eval(s, phi) {
            const cfg = this.cfg;
            const x = (s - 0.5) * this.L;
            const Rp = this.profile(s);
            const cphi = Math.cos(phi), sphi = Math.sin(phi);
            // 断面: 横に広く縦に低い
            let r = Rp * (1.0 + 0.075 * Math.cos(2 * phi));
            // 低周波のふくらみ（長さ方向に 2〜3 山）と中周波の凹凸
            const px0 = x * 0.07, py0 = cphi * Rp * 0.16, pz0 = sphi * Rp * 0.16;
            const bumpLo = Noise.fbm(px0 + 7.1, py0, pz0, this.lumpSeed, 2, 2.0, 0.5);
            const bumpMid = Noise.v3(x * 0.45, cphi * Rp * 0.45, sphi * Rp * 0.45, this.lumpSeed + 77);
            // 【対策】先端（Rp→0）ではふくらみも 0 に落とす。落とさないと
            //         1点に集束するはずの先端が小さな円盤になって飛び出す
            const tipK = smooth(0.0, 1.2, Rp);
            r += (cfg.lumpLo * bumpLo * (0.6 + 0.4 * smooth(-0.2, 0.6, cphi)) + cfg.lumpMid * bumpMid) * tipK;

            // ---- クープ（x × 弧長 w の平面上で評価）
            const w = phi * this.R0;
            let dr = 0, inner = 0, innerT = 1, ear = 0, earTop = 0;
            for (const c of this.cuts) {
                const rx = x - c.xc, rw = w - c.wc;
                const along = rx * c.ux + rw * c.uw;
                const t = along / c.half * 0.5 + 0.5;           // 0..1
                if (t < -0.04 || t > 1.04) continue;
                const d = -(rx * c.uw) + rw * c.ux;              // 垂直方向（+側が耳）
                // 口の開き: 紡錘形。peak で最大、両端で閉じる
                const tt = clamp(t, 0, 1);
                const env = tt < c.peak ? Math.sin(Math.PI * 0.5 * tt / c.peak)
                                        : Math.sin(Math.PI * 0.5 * (1 - tt) / (1 - c.peak));
                const envP = Math.pow(Math.max(0, env), 0.85);
                const hw = c.open * envP;
                if (hw < 0.03) continue;
                const ad = Math.abs(d);
                // 内側マスク（縁を少しなだらかに）
                const m = 1 - smooth(hw - 0.16, hw + 0.10, ad);
                if (m > 0) {
                    // 口の底は椀形。中央が深く、縁へ向けて浅くなる
                    const q = clamp(ad / hw, 0, 1);
                    const cup = 1 - q * q * 0.6;
                    dr -= c.depth * envP * m * cup;
                    if (m > inner) { inner = m; innerT = q; }
                }
                // 耳: 口の +側の縁のすぐ外に稜線。口が開く所ほど高い。
                // 【対策】左右対称のガウスだと「土手」になる。刃で起こされた
                //         フラップなので、口側は急に立ち上がり、外側はなだらかに落ちる
                const ec = hw + c.earW * 0.45;
                const sig = d < ec ? c.earW * 0.42 : c.earW * 1.35;
                const eg = Math.exp(-Math.pow((d - ec) / sig, 2));
                const e = eg * Math.pow(envP, 1.3);
                dr += c.earH * e;
                ear = Math.max(ear, e);
                earTop = Math.max(earTop, Math.pow(eg, 2.5) * envP);
                // 反対側の縁はわずかに丸く落ちる（刃が入った側は盛り上がらない）
                const og = Math.exp(-Math.pow((d + hw + 0.25) / 0.45, 2));
                dr -= 0.09 * og * envP;
            }
            r += dr * tipK;
            r = Math.max(r, 0);

            let y = cphi * r, z = sphi * r;
            // 底を平らにする（ソフトクランプ）。天板に乗った重みで広がる
            const yf = Rp * cfg.bottomFlat;
            const e = -y - yf;
            const k = 0.30;
            // 先端（Rp→0）では平らにしない。しないと点に集束した先端が持ち上がる
            const over = k * Math.log(1 + Math.exp(Math.min(e / k, 30))) * smooth(0.0, 0.9, Rp);
            y += over * 0.90;
            // 反り
            const zb = this.bend * 4 * s * (1 - s);
            return {
                x, y, z: z + zb, r, bumpLo, bumpMid, inner, innerT, ear, earTop,
                up: cphi, s, phi
            };
        }

        // 底面の y（天板に置く高さの計算用）
        bottomY() {
            let y = 0;
            for (let i = 0; i <= 40; i++) {
                const p = this.eval(0.15 + 0.7 * i / 40, Math.PI);
                y = Math.min(y, p.y);
            }
            return y;
        }
    }

    // =================================================================
    // 3. TextureLab
    // =================================================================
    //  パレット（sRGB）。実物の写真から拾った値。
    //  【対策】濃い色を黒へ寄せない。黒にすると焦げの縞ではなく「汚れ」になる
    const PAL = {
        PALE:  [0.86, 0.71, 0.49],   // 側面の淡いきつね色
        GOLD:  [0.80, 0.56, 0.31],   // 上面の金色
        BROWN: [0.62, 0.38, 0.165],  // 稜線の茶
        DEEP:  [0.43, 0.235, 0.095], // 耳の先の濃い茶
        CRUMB: [0.91, 0.83, 0.66],   // 口の中（焼けていないクラム）
        CRUMB2:[0.80, 0.68, 0.50],   // クラムの気泡の陰
        FLOUR: [0.93, 0.90, 0.85]    // 打ち粉
    };
    function ramp(t, out) {
        // 0 → PALE → GOLD → BROWN → DEEP
        let a, b, u;
        if (t < 0.38)      { a = PAL.PALE;  b = PAL.GOLD;  u = t / 0.38; }
        else if (t < 0.72) { a = PAL.GOLD;  b = PAL.BROWN; u = (t - 0.38) / 0.34; }
        else               { a = PAL.BROWN; b = PAL.DEEP;  u = (t - 0.72) / 0.28; }
        u = clamp(u, 0, 1);
        out[0] = mix(a[0], b[0], u); out[1] = mix(a[1], b[1], u); out[2] = mix(a[2], b[2], u);
    }

    const TextureLab = {
        _dyn(name, W, H, scene) {
            W = Math.max(8, Math.round(W) || 512); H = Math.max(8, Math.round(H) || 256);
            const t = new BABYLON.DynamicTexture(name, { width: W, height: H }, scene, true);
            t.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
            t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
            t.anisotropicFilteringLevel = 8;
            return t;
        },

        // 1本ぶんの4枚（アルベド / ORM / 法線 / クリアコート）を場から焼く
        bake(field, cfg, scene, tag) {
            const W = cfg.texW, H = cfg.texH;
            const N = W * H;
            const alb = new Uint8ClampedArray(N * 4);
            const orm = new Uint8ClampedArray(N * 4);
            const cc  = new Uint8ClampedArray(N * 4);
            const hgt = new Float32Array(N);
            const col = [0, 0, 0];
            const seed = field.texSeed;
            const brownBase = cfg.brown + field.tone;
            const warm = field.warm;

            for (let j = 0; j < H; j++) {
                const v = (j + 0.5) / H;
                const phi = (v - 0.5) * TAU;
                for (let i = 0; i < W; i++) {
                    const s = (i + 0.5) / W;
                    const p = field.eval(s, phi);
                    const X = p.x, Y = p.y, Z = p.z;
                    const idx = j * W + i, o = idx * 4;

                    // ---- 焼き色（変位と相関させる: 出っ張り＝濃い、上面＝濃い）
                    const mottle = Noise.fbm(X * 0.55, Y * 0.55, Z * 0.55, seed + 11, 3, 2.1, 0.5);
                    const fineM  = Noise.v3(X * 2.2, Y * 2.2, Z * 2.2, seed + 12);
                    let b = brownBase
                          + 0.20 * p.bumpLo
                          + 0.32 * smooth(-0.1, 0.9, p.up)         // 上面ほど色づく
                          - 0.10 * smooth(-0.2, -0.95, p.up)        // 底は淡い
                          + cfg.mottle * mottle + 0.05 * fineM
                          + cfg.earBrown * (0.55 * p.ear + 0.50 * p.earTop);
                    b = clamp(b, 0, 1);
                    ramp(b, col);

                    // ---- 口の中（クラム）: 淡く、気泡の陰で暗くなる
                    const pit1 = smooth(0.30, 0.75, Noise.v3(X * 2.6, Y * 2.6, Z * 2.6, seed + 21));
                    const pit2 = smooth(0.40, 0.80, Noise.v3(X * 5.5, Y * 5.5, Z * 5.5, seed + 22));
                    const pit = clamp(0.7 * pit1 + 0.5 * pit2, 0, 1);
                    // 縁に近い所（innerT→1）は半分焼けて金色がかる
                    const crumbBrown = smooth(0.55, 1.0, p.innerT) * 0.55 + 0.12 * mottle;
                    const cr = [
                        mix(PAL.CRUMB[0], PAL.CRUMB2[0], pit), mix(PAL.CRUMB[1], PAL.CRUMB2[1], pit), mix(PAL.CRUMB[2], PAL.CRUMB2[2], pit)
                    ];
                    const inner = p.inner;
                    if (inner > 0) {
                        const cb = [0, 0, 0]; ramp(clamp(brownBase * 0.6 + crumbBrown, 0, 1), cb);
                        for (let k = 0; k < 3; k++) {
                            const cv = mix(cr[k], cb[k], crumbBrown * 0.7);
                            col[k] = mix(col[k], cv, inner);
                        }
                    }

                    // ---- 打ち粉: 広い斑 + 細かい縁。耳・濃い焼き色・口の中には残りにくい
                    const fl = Noise.fbm(X * 0.42 + 3.3, Y * 0.42, Z * 0.42, seed + 31, 3, 2.0, 0.55);
                    const flFine = Noise.v3(X * 3.4, Y * 3.4, Z * 3.4, seed + 32);
                    const flGrain = Noise.v3(X * 9.0, Y * 9.0, Z * 9.0, seed + 33);
                    let flour = smooth(cfg.flourTh - 0.16, cfg.flourTh + 0.20, fl * 0.5 + 0.5 + 0.16 * flFine + 0.03 * flGrain);
                    flour *= (0.45 + 0.55 * smooth(-0.6, 0.5, p.up));     // 底にはあまり付かない
                    flour *= (1 - 0.80 * p.ear) * (1 - 0.65 * inner);
                    flour *= (1 - 0.55 * smooth(0.55, 0.95, b));          // 焼き込んだ所は粉が焼け落ちる
                    flour = clamp(flour, 0, 1);
                    for (let k = 0; k < 3; k++) col[k] = mix(col[k], PAL.FLOUR[k], flour * 0.90);

                    // 個体差の赤み
                    col[0] *= warm; col[2] /= warm;

                    // ---- 高さ場（法線と粗さが共有する）
                    //  クラスト: 1〜3mm の水疱 + 細かい肌。口の中: 気泡の穴
                    const bl1 = smooth(0.36, 0.68, Noise.v3(X * 3.2, Y * 3.2, Z * 3.2, seed + 41));
                    const bl2 = smooth(0.44, 0.76, Noise.v3(X * 6.5, Y * 6.5, Z * 6.5, seed + 42));
                    const grain = Noise.v3(X * 14, Y * 14, Z * 14, seed + 43);
                    let h = 0.55 * bl1 + 0.35 * bl2 + 0.12 * grain;
                    h = mix(h, -0.9 * pit + 0.15 * grain, inner);
                    h += 0.10 * flGrain * flour;
                    hgt[idx] = h;

                    // ---- 粗さ: 濃い焼き色ほど滑らか、粉と口の中はつや消し
                    let rough = 0.68 - 0.24 * smooth(0.30, 0.95, b) + 0.10 * (1 - bl1);
                    rough = mix(rough, 0.90, inner);
                    rough = mix(rough, 0.98, flour);
                    const ao = 1 - 0.35 * inner * pit - 0.10 * (1 - bl1) * (1 - inner);

                    // ---- クリアコート（照りの被覆率）: 焼き込んだクラストだけ
                    const cov = (0.20 + 0.80 * smooth(0.25, 0.9, b)) * (1 - flour) * (1 - 0.85 * inner);
                    const ccr = 0.45 + 0.35 * (1 - bl1);

                    alb[o] = clamp(col[0], 0, 1) * 255; alb[o + 1] = clamp(col[1], 0, 1) * 255; alb[o + 2] = clamp(col[2], 0, 1) * 255; alb[o + 3] = 255;
                    orm[o] = clamp(ao, 0, 1) * 255; orm[o + 1] = clamp(rough, 0, 1) * 255; orm[o + 2] = 0; orm[o + 3] = 255;
                    cc[o] = clamp(cov, 0, 1) * 255; cc[o + 1] = clamp(ccr, 0, 1) * 255; cc[o + 2] = 0; cc[o + 3] = 255;
                }
            }

            // ---- 法線（中央差分。v は周方向なので折り返す、u は端でクランプ）
            const nrm = new Uint8ClampedArray(N * 4);
            // 1 texel の実寸: u 方向 L/W, v 方向 2πR0/H（cm）
            const du = field.L / W, dv = (TAU * field.R0) / H;
            const amp = 0.09;    // 高さ場 1.0 ≒ 0.9mm
            for (let j = 0; j < H; j++) {
                const jm = (j - 1 + H) % H, jp = (j + 1) % H;
                for (let i = 0; i < W; i++) {
                    const im = Math.max(0, i - 1), ip = Math.min(W - 1, i + 1);
                    const gx = (hgt[j * W + ip] - hgt[j * W + im]) * amp / (2 * du);
                    const gy = (hgt[jp * W + i] - hgt[jm * W + i]) * amp / (2 * dv);
                    let nx = -gx, ny = -gy, nz = 1;
                    const il = 1 / Math.hypot(nx, ny, nz);
                    nx *= il; ny *= il; nz *= il;
                    const o = (j * W + i) * 4;
                    nrm[o] = (nx * 0.5 + 0.5) * 255; nrm[o + 1] = (ny * 0.5 + 0.5) * 255; nrm[o + 2] = (nz * 0.5 + 0.5) * 255; nrm[o + 3] = 255;
                }
            }

            const put = (name, data, gamma) => {
                const t = this._dyn(name, W, H, scene);
                const ctx = t.getContext();
                const img = ctx.createImageData(W, H);
                img.data.set(data);
                ctx.putImageData(img, 0, 0);
                t.update(false);
                t.gammaSpace = gamma;
                return t;
            };
            return {
                albedo: put("alb_" + tag, alb, true),
                orm: put("orm_" + tag, orm, false),
                normal: put("nrm_" + tag, nrm, false),
                clear: put("cc_" + tag, cc, false)
            };
        },

        // 木目（テーブル）
        wood(scene, size, seed) {
            const W = size, H = size;
            const alb = new Uint8ClampedArray(W * H * 4);
            const orm = new Uint8ClampedArray(W * H * 4);
            for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
                const x = i / W, y = j / H;
                const warp = Noise.fbm(x * 3, y * 3, 0.3, seed, 3, 2, 0.5) * 0.15;
                const ring = Math.sin((y + warp) * 46 + 1.5 * Noise.v3(x * 8, y * 1.5, 0.7, seed + 5));
                const g = 0.5 + 0.5 * ring;
                const grain = Noise.v3(x * 90, y * 900, 0.1, seed + 9);
                const l = 0.14 + 0.07 * g + 0.02 * grain;
                const o = (j * W + i) * 4;
                alb[o] = clamp(l * 1.35, 0, 1) * 255; alb[o + 1] = clamp(l * 0.95, 0, 1) * 255; alb[o + 2] = clamp(l * 0.62, 0, 1) * 255; alb[o + 3] = 255;
                orm[o] = 255; orm[o + 1] = clamp(0.55 + 0.2 * g, 0, 1) * 255; orm[o + 2] = 0; orm[o + 3] = 255;
            }
            const mk = (name, data, gamma) => {
                const t = this._dyn(name, W, H, scene);
                t.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
                const ctx = t.getContext(); const img = ctx.createImageData(W, H);
                img.data.set(data); ctx.putImageData(img, 0, 0); t.update(false); t.gammaSpace = gamma;
                return t;
            };
            return { albedo: mk("woodAlb", alb, true), orm: mk("woodOrm", orm, false) };
        }
    };

    // =================================================================
    // 4. LoafMesh
    // =================================================================
    function weldNormals(positions, normals) {
        const map = new Map();
        const n = positions.length / 3;
        for (let i = 0; i < n; i++) {
            const k = Math.round(positions[i * 3] * 8192) + "," + Math.round(positions[i * 3 + 1] * 8192) + "," + Math.round(positions[i * 3 + 2] * 8192);
            let a = map.get(k);
            if (!a) { a = []; map.set(k, a); }
            a.push(i);
        }
        for (const a of map.values()) {
            if (a.length < 2) continue;
            let x = 0, y = 0, z = 0;
            for (const i of a) { x += normals[i * 3]; y += normals[i * 3 + 1]; z += normals[i * 3 + 2]; }
            const l = Math.hypot(x, y, z) || 1;
            x /= l; y /= l; z /= l;
            for (const i of a) { normals[i * 3] = x; normals[i * 3 + 1] = y; normals[i * 3 + 2] = z; }
        }
    }

    function buildLoafMesh(field, cfg, scene, tag) {
        const N = cfg.segLen, M = cfg.segAround;
        const positions = new Float32Array((N + 1) * (M + 1) * 3);
        const uvs = new Float32Array((N + 1) * (M + 1) * 2);
        let p = 0, q = 0;
        for (let i = 0; i <= N; i++) {
            const s = i / N;
            for (let j = 0; j <= M; j++) {
                const phi = ((j % M) / M - 0.5) * TAU;
                const r = field.eval(s, phi);
                positions[p++] = r.x; positions[p++] = r.y; positions[p++] = r.z;
                uvs[q++] = s; uvs[q++] = j / M;
            }
        }
        const idx = (flip) => {
            const out = [];
            for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
                const a = i * (M + 1) + j, b = a + 1, c = a + (M + 1), d = c + 1;
                if (flip) out.push(a, b, c, b, d, c); else out.push(a, c, b, b, c, d);
            }
            return out;
        };
        let indices = idx(false);
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        // 【対策】巻き順は決め打ちしない。全頂点で「中心軸から外へ向く」内積を
        //         足し合わせ、負なら全反転（1点判定は符号が不安定）
        let dot = 0;
        for (let i = 0; i < positions.length / 3; i++) {
            const ox = 0, oy = positions[i * 3 + 1], oz = positions[i * 3 + 2];
            dot += ox * normals[i * 3] + oy * normals[i * 3 + 1] + oz * normals[i * 3 + 2];
        }
        if (dot < 0) {
            indices = idx(true);
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        weldNormals(positions, normals);

        const mesh = new BABYLON.Mesh("loaf_" + tag, scene);
        mesh.id = "loaf_" + tag;
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = new Uint32Array(indices); vd.normals = normals; vd.uvs = uvs;
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        return mesh;
    }

    function loafMaterial(tex, scene, tag) {
        const m = new BABYLON.PBRMaterial("loafMat_" + tag, scene);
        m.albedoTexture = tex.albedo;
        m.metallicTexture = tex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.useRoughnessFromMetallicTextureAlpha = false;
        m.metallic = 1.0; m.roughness = 1.0;   // テクスチャ側の値をそのまま使う
        m.bumpTexture = tex.normal;
        m.bumpTexture.level = 1.0;
        m.invertNormalMapX = false; m.invertNormalMapY = false;
        // 照り: 焼き込んだクラストだけ薄い艶。粉と口の中は被覆 0
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = tex.clear;
        m.clearCoat.useRoughnessFromMainTexture = true;
        m.clearCoat.intensity = 0.45;
        m.clearCoat.roughness = 0.55;
        m.clearCoat.indexOfRefraction = 1.45;
        // 薄いクラムが透ける（弱い SSS）。口の中の縁に温かみが出る
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.18;
        m.subSurface.tintColor = new BABYLON.Color3(0.95, 0.72, 0.42);
        m.subSurface.minimumThickness = 0.3;
        m.subSurface.maximumThickness = 3.0;
        m.backFaceCulling = true;
        m.ambientColor = new BABYLON.Color3(0.08, 0.08, 0.08);
        return m;
    }

    // =================================================================
    // 5. Tray
    // =================================================================
    function buildTray(scene, sg) {
        const root = new BABYLON.TransformNode("trayRoot", scene);
        const TW = 64, TD = 42, lip = 1.4, rimR = 0.55;
        // 天板: 黒皮の鉄。面は少し傾いた映り込みが出るよう roughness を中程度に
        const steel = new BABYLON.PBRMaterial("trayMat", scene);
        steel.albedoColor = new BABYLON.Color3(0.24, 0.225, 0.21).toLinearSpace();
        steel.metallic = 0.85; steel.roughness = 0.42;
        steel.clearCoat.isEnabled = true; steel.clearCoat.intensity = 0.25; steel.clearCoat.roughness = 0.35;

        const base = BABYLON.MeshBuilder.CreateBox("trayBase", { width: TW, depth: TD, height: 0.35 }, scene);
        base.id = "trayBase";
        base.position.y = -0.175;
        base.material = steel; base.receiveShadows = true; base.parent = root;

        // 縁: 角丸の矩形に沿ったチューブ（巻いた縁）
        const path = [];
        const hw = TW / 2 - rimR, hd = TD / 2 - rimR, cr = 2.2;
        const corners = [[hw - cr, hd - cr, 0], [-hw + cr, hd - cr, Math.PI / 2], [-hw + cr, -hd + cr, Math.PI], [hw - cr, -hd + cr, Math.PI * 1.5]];
        for (const [cx, cz, a0] of corners) {
            for (let k = 0; k <= 8; k++) {
                const a = a0 + k / 8 * Math.PI / 2;
                path.push(new V3(cx + cr * Math.cos(a), lip - rimR, cz + cr * Math.sin(a)));
            }
        }
        path.push(path[0].clone());
        const rim = BABYLON.MeshBuilder.CreateTube("trayRim", { path, radius: rimR, tessellation: 16, cap: BABYLON.Mesh.NO_CAP }, scene);
        rim.id = "trayRim";
        rim.material = steel; rim.parent = root; rim.receiveShadows = true;
        // 縁の壁
        const wallMat = steel;
        const mkWall = (name, w, d, x, z) => {
            const b = BABYLON.MeshBuilder.CreateBox(name, { width: w, depth: d, height: lip }, scene);
            b.id = name; b.position.set(x, lip / 2, z); b.material = wallMat; b.parent = root; b.receiveShadows = true;
            return b;
        };
        mkWall("trayWallN", TW, 0.3, 0, TD / 2 - 0.15);
        mkWall("trayWallS", TW, 0.3, 0, -TD / 2 + 0.15);
        mkWall("trayWallE", 0.3, TD, TW / 2 - 0.15, 0);
        mkWall("trayWallW", 0.3, TD, -TW / 2 + 0.15, 0);
        for (const m of root.getChildMeshes()) sg.addShadowCaster(m);

        // テーブル（木）
        const table = BABYLON.MeshBuilder.CreateGround("table", { width: 220, height: 220 }, scene);
        table.id = "table";
        table.position.y = -0.36;
        const wood = TextureLab.wood(scene, 512, 9101);
        const tm = new BABYLON.PBRMaterial("tableMat", scene);
        tm.albedoTexture = wood.albedo; tm.albedoTexture.uScale = 3; tm.albedoTexture.vScale = 3;
        tm.metallicTexture = wood.orm; tm.metallicTexture.uScale = 3; tm.metallicTexture.vScale = 3;
        tm.useRoughnessFromMetallicTextureGreen = true; tm.useMetallnessFromMetallicTextureBlue = true;
        tm.useAmbientOcclusionFromMetallicTextureRed = true;
        tm.metallic = 1; tm.roughness = 1;
        table.material = tm; table.receiveShadows = true;
        return root;
    }

    // =================================================================
    // 6. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.035, 0.030, 0.027, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.2;
    scene.environmentIntensity = 0.70;
    scene.createDefaultSkybox(env, true, 1000, 0.85, false);

    const camera = new BABYLON.ArcRotateCamera("cam", -1.25, 1.02, 58, new V3(0, 2, 0), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 10;
    camera.minZ = 0.5;
    camera.maxZ = 400;           // 【対策】DOF の深度量子化を避けるため詰める
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 160;
    camera.upperBetaLimit = 1.48;
    scene.cameraToUseForPointers = camera;

    // キー: 左上後方。フィル: 反対側から弱く。キック: 拡散ほぼ 0 の鏡面だけの灯
    const key = new BABYLON.DirectionalLight("key", new V3(-0.50, -0.85, 0.42).normalize(), scene);
    key.position = new V3(30, 60, -25);
    key.intensity = 3.0;
    key.diffuse = new BABYLON.Color3(1.0, 0.95, 0.88);
    key.specular = new BABYLON.Color3(0.7, 0.66, 0.60);
    key.autoCalcShadowZBounds = true;

    const fill = new BABYLON.DirectionalLight("fill", new V3(0.70, -0.40, -0.60).normalize(), scene);
    fill.intensity = 0.9;
    fill.diffuse = new BABYLON.Color3(0.85, 0.88, 1.0);
    fill.specular = new BABYLON.Color3(0.18, 0.18, 0.18);

    const kick = new BABYLON.DirectionalLight("kick", new V3(0.25, -0.55, 0.80).normalize(), scene);
    kick.intensity = 1.6;
    kick.diffuse = new BABYLON.Color3(0.06, 0.06, 0.06);
    kick.specular = new BABYLON.Color3(1.0, 0.96, 0.90);

    const hemi = new BABYLON.HemisphericLight("hemi", new V3(0, 1, 0), scene);
    hemi.intensity = 0.22;
    hemi.specular = new BABYLON.Color3(0, 0, 0);
    hemi.groundColor = new BABYLON.Color3(0.25, 0.20, 0.16);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0012;
    sg.normalBias = 0.02;
    sg.setDarkness(0.38);

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.18;
    ip.contrast = 1.20;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.6;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    if (GLOBAL.showTray) buildTray(scene, sg);

    // ---- 生成 / 差し替え ------------------------------------------------
    const state = { cfg: null, loaves: [] };
    function disposeLoaves() {
        for (const l of state.loaves) {
            l.mesh.dispose(false, false);
            l.mat.dispose(false, true);
        }
        state.loaves = [];
    }
    function build(st) {
        const t0 = performance.now();
        disposeLoaves();
        const cfg = buildConfig(st);
        state.cfg = cfg;
        const n = cfg.count;
        const rng = new Rng(cfg.seed ^ 0x5bd1e995);
        for (let i = 0; i < n; i++) {
            const seed = (cfg.seed + i * 7919) >>> 0;
            const field = new LoafField(cfg, seed);
            const tex = TextureLab.bake(field, cfg, scene, cfg.seed + "_" + i);
            const mesh = buildLoafMesh(field, cfg, scene, cfg.seed + "_" + i);
            const mat = loafMaterial(tex, scene, cfg.seed + "_" + i);
            mesh.material = mat;
            mesh.receiveShadows = true;
            sg.addShadowCaster(mesh);
            // 置き方: 手前から奥へ並べ、少しずつ向きと位置をずらす
            const z = (i - (n - 1) / 2) * cfg.pitch + rng.range(-0.4, 0.4);
            const x = rng.range(-2.5, 2.5);
            const yaw = rng.range(-0.06, 0.06) + (i % 2 ? 0.02 : -0.02);
            mesh.rotation.y = yaw;
            mesh.position.set(x, -field.bottomY() + 0.02, z);
            state.loaves.push({ mesh, mat, tex, field });
        }
        console.log("[baguette] build " + n + " loaves in " + (performance.now() - t0).toFixed(0) + "ms");
    }

    const cur = Object.assign({}, START);
    build(cur);

    // ---- ポストプロセス ---------------------------------------------------
    let ssao = null;
    if (GLOBAL.useSSAO) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 1.6;
        ssao.totalStrength = 1.0;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 200;
        ssao.minZAspect = 0.2;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.92;
    dp.bloomWeight = 0.10;
    dp.bloomKernel = 32;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.16;
    // 【対策】錯乱円は「1単位 = 1m」換算。焦点距離を合焦距離の比率 K にすると
    //         カメラを寄せても引いてもボケ量が一定になる
    dp.depthOfFieldEnabled = !!GLOBAL.useDOF;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.Medium;
    dp.depthOfField.fStop = 2.8;
    dp.depthOfField.lensSize = 50;
    scene.onBeforeRenderObservable.add(() => {
        if (!dp.depthOfFieldEnabled) return;
        const focus = camera.radius * 1000;
        dp.depthOfField.focusDistance = focus;
        dp.depthOfField.focalLength = focus * 0.062;
    });

    // =================================================================
    // 7. GUI
    // =================================================================
    // 【対策】GUI 専用カメラは Inspector を壊すので使わない。レイヤーの
    //         applyPostProcess を切れば DOF / Bloom は UI に乗らない
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (ui.layer) ui.layer.applyPostProcess = false;

    const COL = { idle: "#2b2321", active: "#a8562a", edge: "#4c3e38", text: "#f7efe8", sub: "#c0aa9a", accent: "#efb383" };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "216px"; card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(16,12,10,0.80)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "16px";
    ui.addControl(card);
    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "188px"; panel.isVertical = true; panel.paddingTop = "12px"; panel.paddingBottom = "12px";
    card.addControl(panel);

    function addLabel(text, size, color, height) {
        const t = new BABYLON.GUI.TextBlock();
        t.text = text; t.height = height || "22px"; t.color = color || COL.text; t.fontSize = size || 13;
        t.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        panel.addControl(t); return t;
    }
    function addButton(name, text, onClick) {
        const b = BABYLON.GUI.Button.CreateSimpleButton(name, text);
        b.height = "32px"; b.paddingBottom = "5px"; b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 14;
        b.onPointerUpObservable.add(onClick);
        panel.addControl(b); return b;
    }
    function spacer(h) { const s = new BABYLON.GUI.Rectangle(); s.height = h; s.thickness = 0; s.background = ""; panel.addControl(s); }

    const groups = { preset: {}, flour: {}, count: {} };
    function highlight() {
        for (const k in groups.preset) groups.preset[k].background = (k === cur.preset) ? COL.active : COL.idle;
        for (const k in groups.flour) groups.flour[k].background = (k === cur.flour) ? COL.active : COL.idle;
        for (const k in groups.count) groups.count[k].background = (+k === cur.count) ? COL.active : COL.idle;
    }
    addLabel("BAGUETTE", 11, COL.sub, "18px");
    addLabel("焼き加減", 13, COL.accent, "22px");
    for (const k of Object.keys(PRESETS)) groups.preset[k] = addButton("p_" + k, PRESETS[k].label, () => { cur.preset = k; build(cur); highlight(); });
    spacer("6px");
    addLabel("打ち粉", 13, COL.accent, "22px");
    for (const k of Object.keys(FLOUR)) groups.flour[k] = addButton("f_" + k, FLOUR[k].label, () => { cur.flour = k; build(cur); highlight(); });
    spacer("6px");
    addLabel("本数", 13, COL.accent, "22px");
    for (const n of [1, 2, 4]) groups.count["" + n] = addButton("c_" + n, n + "本", () => { cur.count = n; build(cur); highlight(); });
    spacer("6px");
    addButton("reseed", "焼き直す（別の個体）", () => { cur.seed = (cur.seed * 1664525 + 1013904223) >>> 0; build(cur); highlight(); });
    addButton("dof", "被写界深度 ON/OFF", () => { dp.depthOfFieldEnabled = !dp.depthOfFieldEnabled; });
    highlight();

    return scene;
};

export default createScene;