// =====================================================================
//  Photoreal Fried Rice  /  写実的な「チャーハン」
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//  build: chahan-2026-09-16-c
//
//  構成:
//    0. CONFIG     … 味つけ / 盛り / 器 / 具 のプリセットと寸法
//    1. Rng        … シード付き擬似乱数
//    2. Noise      … 2D/3D 値ノイズ（周期版つき）
//    3. Mesh utils … 巻き順判定 / 法線溶接 / 一意な name+id
//    4. TexLab     … DynamicTexture の土台と木のテクスチャ
//    5. Plate      … 八角皿（ソフト最大で作る丸めた正八角形）
//    6. Rice       … 盛りの形と米粒（ご飯.js rice-H / カレー.js の系譜）
//    7. Ingredients… 炒り卵 / チャーシュー / 小口ねぎ / 黒胡椒
//    8. Renge      … れんげ（中身の一すくいつき）
//    9. Scene / GUI
//
//  ここでの最重要事項:
//  「チャーハンは黄色いごはんではない」
//
//   ご飯.js の米粒をそのまま黄色くしても、出てくるのは「色を塗った白飯」に
//   しかならない。参考写真を拡大して数えると、違いは3つに集約される。
//
//   (1) 一粒ずつ色が違う。真っ白なまま残った粒、卵をまとった黄色い粒、
//       鍋肌の醤油がついた褐色の粒が隣り合っている。平均色が合っていても
//       「粒ごとの分散」が無いと、絵はただの黄色い塊になる。
//       しかも完全なランダムではなく、数cm 単位の塊（＝味の濃い所と
//       薄い所）でまとまっている。空間ノイズ 6 割 + 粒ごとの乱数 4 割。
//
//   (2) 粒の向きが揃わない。炊いたごはんは表面張力で盛りの面に沿って
//       寝るが、炒めた飯は油で剥離して一粒ずつ勝手な向きを向く。
//       ご飯.js の「面の法線に揃えてから ±0.26rad」をそのまま使うと、
//       どれだけ色を散らしてもパラパラにならない。ここは完全な乱数から
//       ごく弱く水平へ引き戻す形にする（傾き σ = 0.95rad）。
//
//   (3) 粒と粒のあいだに隙間がある。密度を下げ、浮いた粒の割合を上げ、
//       下地をはっきり暗くする。ごはんは「谷が浅くて白い」、
//       チャーハンは「谷が深くて暗い」。
//
//   逆に、共通する知見はそのまま効く:
//     ・照明比（キー ÷ 回り込み）を 2〜3 に収める。ここが開くと、
//       白く残った粒が灰色に落ちて全体が濁る（ご飯.js rice-H の結論）
//     ・translucency は「透けを足す強さ」ではなく拡散との配分比。
//       炒めて水が飛んだ米は生の炊きたてより透けないので 0.16 まで下げる
//     ・照りは全部 clearCoat（＝油膜, IOR 1.47）に持たせる。
//       roughness を下げて作ると濡れたプラスチックになる
// =====================================================================

var createScene = function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    // 単位系: 1 unit = 1 cm。米粒とねぎは mm で書きたいので定数を持つ
    const MM = 0.1;

    // ---- 粒の色のパレット（sRGB）--------------------------------------
    // 参考写真の実測（ハイライトを避けて地の部分をサンプル）。
    // 【対策】いちばん濃い粒を焦げ茶（0.35 付近）まで落とすと、粒が
    //         「黒ごま」に見えて汚れになる。醤油の色は思ったより明るい
    const TONE = {
        white: [0.930, 0.902, 0.842],   // 調味料のついていない粒
        pale: [0.912, 0.826, 0.638],   // 油と卵で薄く色づいた粒
        mid: [0.848, 0.700, 0.424],   // 標準。チャーハンの平均色
        deep: [0.724, 0.512, 0.246],   // 醤油の絡んだ粒
        char: [0.576, 0.376, 0.168],   // 鍋肌で焼けた粒
        egg: [0.958, 0.806, 0.318]    // 卵をまとった粒（黄が強い）
    };

    // ---- 味つけのプリセット -------------------------------------------
    //  season   : 粒の色づきの平均（0 = 白飯、1 = 真っ黒に近い醤油）
    //  seasonSd : そのばらつき。★ここが「パラパラ」の見た目を決める本丸
    //  eggMix   : 卵をまとった黄色い粒の割合
    const STYLES = {
        shio: {
            label: "塩チャーハン",
            season: 0.30, seasonSd: 0.26, eggMix: 0.16,
            egg: 26, pork: 8, negi: 150, pepper: 80,
            oil: 0.86, garlic: 0.30
        },
        shoyu: {
            label: "醤油チャーハン",
            season: 0.54, seasonSd: 0.28, eggMix: 0.14,
            egg: 22, pork: 20, negi: 120, pepper: 95,
            oil: 0.94, garlic: 0.45
        },
        tamago: {
            label: "卵チャーハン",
            season: 0.34, seasonSd: 0.22, eggMix: 0.44,
            egg: 44, pork: 4, negi: 96, pepper: 60,
            oil: 0.88, garlic: 0.22
        },
        chashu: {
            label: "チャーシュー",
            season: 0.46, seasonSd: 0.27, eggMix: 0.18,
            egg: 18, pork: 34, negi: 110, pepper: 85,
            oil: 0.98, garlic: 0.40
        }
    };

    // ---- 盛り ---------------------------------------------------------
    // 【対策】チャーハンの盛りは2種類しかない。中華鍋から放り込んだ
    //         「山盛り」と、茶碗で抜いた「型抜きドーム」。前者は肩が落ちて
    //         裾が崩れ、後者は肩が張って裾が急に切れる。同じ式の指数だけで
    //         切り替えようとすると、どちらつかずのプリンになる
    const MOUNDS = {
        heap: {
            label: "山盛り",
            peak: 3.55, ax: 6.75, az: 6.75,
            pw: 0.92, pq: 1.00,      // dome = peak * (1 - u^pw*2)^pq 相当
            lump: 0.46,              // お玉の塊
            edge: 0.34,              // 裾の崩れ（粒が転がり落ちた分）
            grainLift: 0.26, liftRatio: 0.46
        },
        mold: {
            label: "型抜き",
            peak: 3.90, ax: 6.10, az: 6.10,
            pw: 2.30, pq: 0.58,      // 上が丸く、裾で急に落ちる（＝茶碗の形）
            lump: 0.16,
            edge: 0.16,
            grainLift: 0.20, liftRatio: 0.38
        }
    };

    // ---- 器（八角皿）--------------------------------------------------
    // 【対策】黒い器のアルベドを sRGB 0.05 にすると、リニアで 0.002 に
    //         なって形がまったく読めない。実物の黒釉の反射率は 5% 前後、
    //         sRGB では 0.23〜0.26。暗くしたぶんは露出で戻す（SKILL 2.4）
    const PLATES = {
        kuro: {
            label: "黒八角皿",
            albedo: [0.152, 0.146, 0.142], rough: 0.155,
            speck: 0.22, crazeAmt: 0.05, rimBand: null,
            // 黒マットの釉は完全な鏡ではない。薄い透明層が乗っている程度
            coat: 0.78, coatK: 0.75
        },
        haku: {
            label: "白磁八角鉢",
            albedo: [0.852, 0.846, 0.830], rough: 0.105,
            speck: 0.10, crazeAmt: 0.12, rimBand: null,
            coat: 0.94, coatK: 0.52
        },
        gosu: {
            label: "呉須の線",
            albedo: [0.836, 0.834, 0.822], rough: 0.108,
            speck: 0.12, crazeAmt: 0.16,
            rimBand: { col: [0.122, 0.190, 0.386], at: 0.62, w: 0.22, blur: 0.35 },
            coat: 0.94, coatK: 0.52
        }
    };

    // ---- 皿の寸法（実寸 cm）------------------------------------------
    // 対辺 22cm の八角鉢。リム幅 1.6cm、見込みの底は卓から 1.05cm
    const GLOBAL = {
        plateR: 11.00,      // 辺の中心までの距離（＝対辺 22cm の半分）
        // 【対策】角の丸めをソフト最大の温度で作る。β を 16 まで下げると
        //         角が落ちて「丸皿を8角に寄せたもの」になり、40 を超えると
        //         角が刃物のように立って陶器に見えない
        plateBeta: 34.0,
        plateSectors: 256,
        plateDmax: 9.20,    // 等高線が1点へ潰れる内向き距離
        blendD0: 3.60, blendD1: 5.60,

        rimY: 3.20,         // リムの高さ
        wellY: 1.05,        // 見込みの底
        wallD: 3.30,        // 見込みの底が始まる内向き距離
        rimInnerD: 1.60,    // リムの内側の端
        edgeD: 0.24,        // 縁の丸めが始まる所
        thick: 0.52,        // 肉厚
        footOutD: 4.20, footInD: 5.00,
        footY: 0.00,

        // ---- 米粒 ----
        // 【対策】ご飯.js は 31粒/cm²。同じ密度で炒飯を作ると、粒が
        //         肩を寄せ合って「黄色く染めた白飯」になる。炒めた飯は
        //         一粒ずつ離れていて、下の暗がりが見える。24 まで落とし、
        //         そのぶん下地を暗くして谷を作る
        grainDensity: 24.0,
        grainVariants: 8,
        grainRings: 14, grainSides: 12,

        // ---- 描画 ----
        useSSAO: true,
        useDOF: true,
        dofFStop: 2.9,
        dofRatio: 0.070,
        // 【対策】GUI 専用カメラに分けると UI はボケなくなるが、Inspector の
        //         Physics Helper / 選択ハイライト / ピッカーが3系統まとめて
        //         壊れる。Layer.applyPostProcess = false なら2台目は要らない
        guiOwnCamera: false,
        renge: true,        // れんげ
        rengeRice: true     // れんげに一すくい盛る
    };

    // ---- 米粒の形と質感 ------------------------------------------------
    // 【対策】炒めた米は水分が飛んで、炊きたてより一回り小さく締まる。
    //         ご飯.js の 5.55×2.90×2.24mm をそのまま使うと、粒が太って
    //         「餅米」に寄る
    const RICE = {
        lengthMM: 5.40, widthMM: 2.76, heightMM: 2.12,
        // 地のアルベドは白飯のまま。色は1粒ずつインスタンスカラーで掛ける。
        // 【対策】ここを黄色くしてはいけない。そうすると白く残った粒を
        //         作れなくなり（1.0 を超える掛け算が要る）、粒ごとの
        //         分散という最大の手がかりが消える
        albedo: [0.958, 0.947, 0.928],
        asym: 0.88, endPow: 2.68, endRound: 0.48, tipTaper: 0.130,
        sectionP: 2.10, bend: 0.042, sizeSd: 0.075,
        puff: 0.058, grooveDepth: 0.022, endSwell: 0.052,
        // 炒めると表面が乾いて胴割れが出る（炊きたてはふさがっている）
        crackAmount: 0.30, bumpLevel: 0.26,
        // 【対策】粗さを下げて照りを作ると、粒が「プラスチックの飾り」に
        //         なる。炒飯の照りは全部 clearCoat（油膜）が持つ
        baseRough: 0.380, coatIntensity: 0.88, coatRough: 0.115,
        wetMottle: 0.22,
        // 【対策】Babylon 8 系の translucencyIntensity は拡散との配分比で、
        //         diffuse *= (1 - t) が掛かる。炒めた米は水が抜けて散乱体に
        //         近づくので、炊きたての 0.26 より下げる
        translucency: 0.16, tint: [0.99, 0.955, 0.890],
        // 谷の暗さ。ご飯より深く落とす（粒が離れていて奥が見えるため）
        aoFloor: 0.50, aoDepth: 0.36
    };

    // ---- 具 ------------------------------------------------------------
    // 色はすべて sRGB。参考写真の実測値
    const EGG = {
        label: "炒り卵",
        lit: [0.968, 0.822, 0.330],   // 光の当たった面
        mid: [0.928, 0.726, 0.222],   // 地の色
        deep: [0.812, 0.566, 0.132],  // 影・裏側
        brown: [0.706, 0.430, 0.142], // 鍋肌で焼けた縁
        rMin: 0.36, rMax: 0.92, thick: 0.115, curl: 0.55, puff: 0.22
    };
    const PORK = {
        label: "チャーシュー",
        lit: [0.828, 0.612, 0.510],
        mid: [0.736, 0.478, 0.386],
        deep: [0.548, 0.312, 0.250],
        brown: [0.452, 0.230, 0.164],  // 焼けた縁と脂身の境
        fat: [0.902, 0.842, 0.772],   // 脂身
        rMin: 0.42, rMax: 0.88, thick: 0.155, curl: 0.35, puff: 0.10
    };
    const NEGI = {
        label: "小口ねぎ",
        // 【対策】ねぎを一色の緑にすると、プラスチックの輪ゴムになる。
        //         小口切りは「濃い外皮 / 薄い果肉 / 白っぽい切り口」の
        //         3色が同時に見えるから、ねぎに見える
        skin: [0.286, 0.512, 0.176],
        flesh: [0.626, 0.792, 0.404],
        cut: [0.792, 0.888, 0.612],
        rOut: [0.20, 0.31],    // 外半径 [cm]
        rIn: [0.52, 0.74],     // 内半径の比
        h: [0.10, 0.20]        // 厚み（＝小口の幅）
    };
    const PEPPER = { col: [0.176, 0.130, 0.098], r: [0.026, 0.050] };

    const START = { style: "shoyu", mound: "heap", plate: "kuro", seed: 0xC4A11 };

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;

    // =================================================================
    // 1. Rng : mulberry32
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
        gauss(mean, sd) {
            const u = Math.max(1e-9, this.next()), v = this.next();
            return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
        }
        int(n) { return Math.floor(this.next() * n) % n; }
    }

    // ---- 小物 --------------------------------------------------------
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    // sRGB → リニア。PBRMaterial の色と頂点カラーはリニア空間（SKILL 2.3）
    const s2l = (c) => (c <= 0.04045) ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const col3 = (a) => new BABYLON.Color3(s2l(a[0]), s2l(a[1]), s2l(a[2]));

    // =================================================================
    // 2. Noise
    // =================================================================
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
        // 【対策】x 方向しか折り返さないノイズでタイリング用テクスチャを焼くと、
        //         上下の継ぎ目に横一文字の線が出る（SKILL 2.7）。両軸とも折り返す
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
        // 周方向（u）だけ折り返す。回転体・八角皿のリム用
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

    // =================================================================
    // 3. Mesh utils
    // =================================================================
    // 【対策】Babylon の Node コンストラクタは id = name を入れるだけなので、
    //         同名メッシュを複数作ると id が重複し、Inspector の Scene
    //         Explorer が常に最初の1個を選ぶ。両方を一意にする（SKILL 6）
    let _uid = 0;
    function named(mesh, base) {
        mesh.name = base;
        mesh.id = base + "#" + (++_uid);
        return mesh;
    }

    function angDist(a, b) {
        const d = Math.abs(a - b) % TAU;
        return d > Math.PI ? TAU - d : d;
    }

    // 巻き順の自動判定（SKILL 1.3）。
    // 【対策】VertexData.ComputeNormals は (v0-v1)×(v2-v1) で、右手系の外積と
    //         符号が逆。規約を決め打ちすると必ずどこかで裏返る。
    //         形が読みにくいものは全頂点の総和で判定する（summed = true）
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

    // 位置が一致する頂点の法線を平均する。継ぎ目の十字の筋を消す（SKILL 1.4）
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

    // 単調3次エルミート（Fritsch–Carlson）。
    // 【対策】Catmull-Rom は制御点の間で行き過ぎ、皿の断面では「リムが
    //         一度外へ膨らんでから戻る」不自然な段が出る
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

    function makeMesh(name, positions, indices, normals, uvs, colors, scene) {
        const mesh = named(new BABYLON.Mesh(name, scene), name);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals;
        if (uvs) vd.uvs = uvs;
        if (colors) vd.colors = colors;
        vd.applyToMesh(mesh, false);
        // 【対策】頂点カラーを stride 4 で入れると Babylon が hasVertexAlpha を
        //         立て、不透明のはずのメッシュが透過パスへ回る。透過パスは
        //         深度書き込みが切られるので、器と具の前後関係が壊れる（SKILL 1.7）
        mesh.hasVertexAlpha = false;
        mesh.tris = indices.length / 3;
        return mesh;
    }

    // 姿勢 q を掛けた頂点群の最下点／最上点（ローカル）
    function extremaUnder(positions, nV, q) {
        const m = BABYLON.Matrix.Identity();
        BABYLON.Matrix.FromQuaternionToRef(q, m);
        const tv = new V3();
        let lo = 1e9, hi = -1e9, rad = 0;
        for (let i = 0; i < nV; i++) {
            tv.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
            V3.TransformCoordinatesToRef(tv, m, tv);
            if (tv.y < lo) lo = tv.y;
            if (tv.y > hi) hi = tv.y;
            const r = Math.hypot(tv.x, tv.z);
            if (r > rad) rad = r;
        }
        return { lo: lo, hi: hi, rad: rad };
    }

    // =================================================================
    // 4. TexLab : DynamicTexture 生成の土台
    // =================================================================
    const TexLab = {
        _tex(name, w, h, fill, scene, linear, clampAll) {
            // 【対策】createImageData は整数しか受け付けない。設定の消し忘れで
            //         undefined が来ると "Value is not of type 'long'" で落ちる
            w = Math.max(8, Math.round(w) || 512);
            h = Math.max(8, Math.round(h) || 512);
            const dt = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(w, h);
            fill(img.data, w, h);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = false;
            dt.wrapU = clampAll ? BABYLON.Texture.CLAMP_ADDRESSMODE : BABYLON.Texture.WRAP_ADDRESSMODE;
            dt.wrapV = clampAll ? BABYLON.Texture.CLAMP_ADDRESSMODE : BABYLON.Texture.WRAP_ADDRESSMODE;
            // 【対策】ORM と法線は「色」ではない。既定の gammaSpace = true の
            //         ままだと粗さ 0.26 が線形 0.06 として渡り、狙いより光る
            if (linear) dt.gammaSpace = false;
            dt.anisotropicFilteringLevel = 16;
            return dt;
        },
        // 【対策】うねり・節は周期が cm 単位なので、1/4 の格子で作って
        //         双一次で引き伸ばしても見た目は変わらない。素直に 1024² を
        //         走らせると 3D ノイズの評価だけで1秒を超える
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
        // 年輪1本ぶんの濃さ。
        // 【対策】|sin(ρπ)|^k の縞は等間隔・等強度になり、段ボールの筋にしか
        //         見えない。整数の輪番号をハッシュして幅・濃さを1本ずつ配る
        ring(rho, seed) {
            const n = Math.floor(rho), f = rho - n;
            const h1 = Noise._h2(n, 0, seed), h2 = Noise._h2(n, 1, seed), h3 = Noise._h2(n, 2, seed);
            const w = 0.09 + 0.30 * h2 * h2;
            const c = 0.16 + 0.84 * h1 * h1;
            const p = 0.55 + 0.35 * h3;
            let d = Math.abs(f - p); if (d > 0.5) d = 1 - d;
            return c * (1 - smooth(w * 0.30, w, d));
        },
        // 高さ場 → 接空間法線。周期境界で参照する
        normalFromHeight(name, N, H, strength, scene, clampAll) {
            return this._tex(name, N, N, (d) => {
                for (let y = 0; y < N; y++) {
                    const yu = ((y - 1 + N) % N) * N, yd = ((y + 1) % N) * N, yc = y * N;
                    for (let x = 0; x < N; x++) {
                        const xl = H[yc + ((x - 1 + N) % N)], xr = H[yc + ((x + 1) % N)];
                        const hu = H[yu + x], hd = H[yd + x];
                        // 【対策】v 方向は (hd - hu)。Babylon の接空間は V が下向き
                        let nx = (xl - xr) * strength, ny = (hd - hu) * strength, nz = 1;
                        const l = Math.hypot(nx, ny, nz);
                        const i = (yc + x) * 4;
                        d[i] = (nx / l * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny / l * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz / l * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene, true, clampAll);
        }
    };

    // ---- 木のテクスチャ一式（テーブル用）-------------------------------
    // 【対策】アルベド・ORM・法線でノイズを引き直すと、同じ解像度を3回
    //         走査するうえ粒の位置がずれて「ざらざらの上にぼんやりした汚れが
    //         乗った」ように見える。高さ場を1枚作って共有する（SKILL 2.6）
    function woodSet(scene, tag, N, seed, o) {
        N = Math.max(64, Math.round(N) || 512);
        const n2 = N * N;
        const grain = new Float32Array(n2);
        const fine = new Float32Array(n2);
        const wave = TexLab.coarse(N, 4, true, (x, y) => {
            return Noise.fbm2p(x / N * 3.1, y / N * 3.1, 4, 4, seed + 7, 3);
        });
        const knot = TexLab.coarse(N, 4, true, (x, y) => {
            return Noise.fbm2p(x / N * 2.0, y / N * 2.0, 2, 2, seed + 41, 2);
        });
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const k = y * N + x;
                const a = o.across ? (y / N) : (x / N);
                const b = o.across ? (x / N) : (y / N);
                const rho = (a + (wave[k] - 0.5) * o.wave * 0.30
                    + (knot[k] - 0.5) * o.knot * 0.55) * o.rings;
                grain[k] = Math.pow(TexLab.ring(rho, seed + 13), o.sharp * 0.5);
                fine[k] = Noise.fbm2p(b * 8 + 3, a * 210, 8, 210, seed + 61, 2);
            }
        }
        const H = new Float32Array(n2);
        for (let k = 0; k < n2; k++) H[k] = clamp(0.5 - grain[k] * 0.42 + (fine[k] - 0.5) * 0.16, 0, 1);

        const albedo = TexLab._tex(tag + "A", N, N, (d) => {
            for (let k = 0; k < n2; k++) {
                const g = grain[k], f = (fine[k] - 0.5);
                let c = mix3(o.base, o.grain, clamp(g * 1.15, 0, 1));
                c = mix3(c, o.dark, clamp((g - 0.55) * 1.8, 0, 1) * 0.7);
                const w = 1 + f * 0.10;
                const i = k * 4;
                d[i] = clamp(c[0] * w, 0, 1) * 255;
                d[i + 1] = clamp(c[1] * w, 0, 1) * 255;
                d[i + 2] = clamp(c[2] * w, 0, 1) * 255;
                d[i + 3] = 255;
            }
        }, scene, false, false);

        const orm = TexLab._tex(tag + "O", N, N, (d) => {
            for (let k = 0; k < n2; k++) {
                const g = grain[k];
                const ro = clamp(o.rough + g * 0.20 + (fine[k] - 0.5) * 0.06, 0.05, 0.95);
                const i = k * 4;
                d[i] = clamp(1 - g * 0.16, 0, 1) * 255;
                d[i + 1] = ro * 255; d[i + 2] = 0; d[i + 3] = 255;
            }
        }, scene, true, false);

        const normal = TexLab.normalFromHeight(tag + "N", N, H, o.bump * 2.2, scene, false);
        return { albedo, orm, normal };
    }

    // =================================================================
    // 5. Plate : 八角皿
    // =================================================================
    // 八角形は「8枚の半平面の共通部分」なので、方向 θ に対する支持半径は
    //     r(θ) = R / max_k cos(θ - kπ/4)
    // で書ける。ただし max をそのまま使うと角が刃物のように立って、
    // 焼き物に見えない。実物の八角皿は角に必ず 3〜5mm の丸みがある。
    //
    // 【対策】max を log-sum-exp のソフト最大に置き換える。温度 β が
    //   丸めの半径そのものになるので、角だけ連続的に落ちる。
    //   円弧を継ぎ足す方法だと、接線の連続を手で合わせる羽目になるうえ、
    //   内向きオフセット（下の contourR）を掛けたときに破綻する
    function octRaw(th) {
        let s = 0;
        for (let k = 0; k < 8; k++) {
            const c = Math.cos(th - k * Math.PI * 0.25);
            if (c > 0) s += Math.exp(GLOBAL.plateBeta * (c - 1));
        }
        const d = 1 + Math.log(Math.max(1e-9, s)) / GLOBAL.plateBeta;
        return GLOBAL.plateR / Math.max(0.30, d);
    }
    // 角度 → 外周半径の表。皿のテクスチャ生成で何十万回引くので畳んでおく
    const SE_N = 2048;
    const seTab = new Float32Array(SE_N + 1);
    for (let i = 0; i <= SE_N; i++) seTab[i] = octRaw(i / SE_N * TAU);
    function seFast(th) {
        let t = th / TAU; t -= Math.floor(t);
        const f = t * SE_N, i = f | 0;
        return seTab[i] + (seTab[i + 1] - seTab[i]) * (f - i);
    }

    // 等高線。外周から内向きに D だけ入った所の半径。
    //   R(θ, D) = r0 - D * mix( 1, r0/Dmax, φ(D) )
    // φ=0 で一定オフセット（＝リム幅が全周で一定）、φ=1 で D=Dmax の1点へ
    // 収束する比例縮小。八角形は r0 が 1.00〜1.08 倍しか振れないので、
    // ブレンドは中心付近だけで足りる。
    // 【対策】切り替えは必ず「平らな見込みの上」でやる。斜面に重ねると
    //   角の側だけ斜面の幅が変わって、皿がねじれて見える
    function contourR(th, D) {
        const r0 = seFast(th);
        const phi = smooth(GLOBAL.blendD0, GLOBAL.blendD1, D);
        return r0 - D * (1 - phi * (1 - r0 / GLOBAL.plateDmax));
    }
    // 逆問題。R は D について単調減少なので、解析で解ける2領域を先に
    // 片づけ、ブレンド帯に入ったときだけ二分法に落とす
    function contourD(x, z) {
        const r = Math.hypot(x, z);
        if (r < 1e-6) return GLOBAL.plateDmax;
        const r0 = seFast(Math.atan2(z, x));
        if (r >= r0) return 0;
        const d0 = r0 - r;
        if (d0 <= GLOBAL.blendD0) return d0;
        const d1 = GLOBAL.plateDmax * (1 - r / r0);
        if (d1 >= GLOBAL.blendD1) return d1;
        let lo = GLOBAL.blendD0, hi = GLOBAL.blendD1;
        for (let i = 0; i < 18; i++) {
            const m = (lo + hi) * 0.5;
            const phi = smooth(GLOBAL.blendD0, GLOBAL.blendD1, m);
            if (r0 - m * (1 - phi * (1 - r0 / GLOBAL.plateDmax)) > r) lo = m; else hi = m;
        }
        return (lo + hi) * 0.5;
    }

    // ---- 断面 ---------------------------------------------------------
    function plateProfiles() {
        const G = GLOBAL;
        const rim = G.rimY, well = G.wellY, th = G.thick;
        const edgeY = rim - th * 0.5;
        const topD = [0, 0.09, G.edgeD, 0.50, 1.00, G.rimInnerD, 2.10, 2.55,
            2.95, 3.15, G.wallD, 3.90, 5.00, 7.00, G.plateDmax];
        const topY = [edgeY, rim - 0.080, rim, rim - 0.010, rim - 0.055, rim - 0.175,
            rim - 0.620, rim - 1.060,
            well + 0.560, well + 0.205, well + 0.032, well + 0.003, well, well, well];
        const top = monoSpline(topD, topY);
        const uY = well - th;
        const bot = [
            [0, edgeY],
            [0.085, rim - th + 0.050], [G.edgeD, rim - th], [0.60, rim - th - 0.012],
            [G.rimInnerD, rim - th - 0.050],
            [2.20, rim - th - 0.56], [2.90, well - th + 0.46], [G.wallD, well - th + 0.050],
            [3.90, uY + 0.004],
            [G.footOutD - 0.10, uY], [G.footOutD, uY - 0.13],
            [G.footOutD + 0.11, G.footY + 0.050], [G.footOutD + 0.20, G.footY],
            [G.footInD - 0.20, G.footY], [G.footInD - 0.09, G.footY + 0.050],
            [G.footInD, uY - 0.13], [G.footInD + 0.10, uY],
            [6.20, uY + 0.028], [7.80, uY + 0.050], [G.plateDmax, uY + 0.058]
        ];
        return { top: top, bot: bot, edgeY: edgeY };
    }

    // 断面ループ（中心・上 → 外縁 → 中心・裏）を D の列として作る。
    // 【対策】等分に刻むと、平らな見込みに大量の帯が並ぶ一方で、リムの
    //         丸めと立ち上がりが数枚で済まされて角ばる。曲率の大きい所を細かく
    function plateLoop() {
        const G = GLOBAL;
        const P = plateProfiles();
        const topDs = [];
        const coarse = [G.plateDmax, 8.4, 7.4, 6.4, 5.6, 4.9, 4.4, 4.10, 3.85, 3.60, G.wallD];
        for (const d of coarse) topDs.push(d);
        for (let d = 3.24; d > G.rimInnerD; d -= 0.10) topDs.push(d);
        topDs.push(G.rimInnerD);
        for (let d = 1.50; d > G.edgeD; d -= 0.14) topDs.push(d);
        for (let d = G.edgeD; d > 0.0001; d -= 0.032) topDs.push(d);
        topDs.push(0);

        const loop = [];
        for (const d of topDs) loop.push({ D: d, y: P.top(d), top: true });
        const bot = P.bot;
        for (let i = 0; i < bot.length - 1; i++) {
            const a = bot[i], b = bot[i + 1];
            const seg = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.16));
            for (let k = 1; k <= seg; k++) {
                const t = k / seg;
                loop.push({ D: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, top: false });
            }
        }
        // 【対策】ループの添字で v を刻むと、点が密なリムの丸めだけ
        //         テクスチャが詰まって縞に見える。弧長で刻む（SKILL 1.6）
        let acc = 0;
        loop[0].v = 0;
        for (let i = 1; i < loop.length; i++) {
            acc += Math.hypot(loop[i].D - loop[i - 1].D, loop[i].y - loop[i - 1].y);
            loop[i].v = acc;
        }
        for (const p of loop) p.v /= acc;
        return loop;
    }

    // ---- 釉薬のテクスチャ ---------------------------------------------
    // u = 周方向（折り返す）、v = 断面の弧長
    function plateGlaze(scene, pr, loop, seed) {
        const G = GLOBAL;
        const N = 640, M = 448, n2 = N * M;
        const vD = new Float32Array(M);
        for (let j = 0; j < M; j++) {
            const v = (j + 0.5) / M;
            let lo = 0, hi = loop.length - 1;
            while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (loop[mid].v <= v) lo = mid; else hi = mid; }
            const t = (v - loop[lo].v) / Math.max(1e-9, loop[hi].v - loop[lo].v);
            vD[j] = loop[lo].D + (loop[hi].D - loop[lo].D) * t;
            if (!loop[lo].top) vD[j] = -vD[j];     // 裏面は負で持つ
        }
        const speck = new Float32Array(n2);
        const craze = new Float32Array(n2);
        const swell = new Float32Array(n2);
        const rng = new Rng(seed >>> 0);
        // 貫入。
        // 【対策】ノイズの等高線を線にすると、地図の等高線のように平行に
        //         何本も走って布地に見える。折れ線を1本ずつ別々に引く
        const lines = [];
        const nl = 26 + rng.int(18);
        for (let i = 0; i < nl; i++) {
            const u0 = rng.next(), v0 = rng.range(0.02, 0.52);
            const a0 = rng.range(0, TAU), len = rng.range(0.04, 0.28);
            const pts = [[u0, v0]];
            let a = a0;
            const steps = 5 + rng.int(7);
            for (let k = 0; k < steps; k++) {
                a += rng.gauss(0, 0.55);
                const u = pts[k][0] + Math.cos(a) * len / steps * 0.7;
                const v = clamp(pts[k][1] + Math.sin(a) * len / steps, 0.0, 0.56);
                pts.push([u, v]);
            }
            lines.push({ pts: pts, w: rng.range(0.0009, 0.0026), c: rng.range(0.35, 1.0) });
        }
        for (let j = 0; j < M; j++) {
            const v = (j + 0.5) / M;
            for (let i = 0; i < N; i++) {
                const u = (i + 0.5) / N, k = j * N + i;
                const sp = Noise.fbm2u(u * 190, v * 140, 190, seed + 17, 2);
                speck[k] = smooth(0.80, 0.955, sp);
                // ろくろ／型の微妙なうねり。真円だと量産プラスチックに見える
                swell[k] = (Noise.fbm2u(u * 7, v * 4 + 3, 7, seed + 41, 3) - 0.5);
            }
        }
        // 【対策】全テクセル × 全折れ線で距離を測ると 1.6 億回になり、
        //         この関数だけで数秒かかる。線は幅 1〜3 テクセルしかないので、
        //         線の側から影響範囲の矩形だけを塗る。出る絵は同じ
        for (const L of lines) {
            const R = L.w * 3;
            for (let s = 0; s < L.pts.length - 1; s++) {
                const ax = L.pts[s][0], ay = L.pts[s][1];
                let dbu = L.pts[s + 1][0] - ax; dbu -= Math.round(dbu);
                const dbv = L.pts[s + 1][1] - ay;
                const ll = dbu * dbu + dbv * dbv;
                if (ll < 1e-9) continue;
                const vLo = Math.min(ay, ay + dbv) - R, vHi = Math.max(ay, ay + dbv) + R;
                const uLo = Math.min(ax, ax + dbu) - R, uHi = Math.max(ax, ax + dbu) + R;
                const j0 = Math.max(0, Math.floor(vLo * M - 0.5));
                const j1 = Math.min(M - 1, Math.ceil(vHi * M - 0.5));
                const i0 = Math.floor(uLo * N - 0.5), i1 = Math.ceil(uHi * N - 0.5);
                for (let j = j0; j <= j1; j++) {
                    const dv = (j + 0.5) / M - ay;
                    for (let ii = i0; ii <= i1; ii++) {
                        const i = ((ii % N) + N) % N;
                        let du = (i + 0.5) / N - ax; du -= Math.round(du);
                        const t = clamp((du * dbu + dv * dbv) / ll, 0, 1);
                        const px = du - dbu * t, py = dv - dbv * t;
                        const d = Math.hypot(px, py);
                        if (d >= R) continue;
                        const c = L.c * (1 - smooth(L.w * 0.4, L.w * 2.2, d));
                        const k = j * N + i;
                        if (c > craze[k]) craze[k] = c;
                    }
                }
            }
        }
        const bandOf = (j) => {
            if (!pr.rimBand) return 0;
            const D = vD[j];
            if (D < 0) return 0;
            const b = pr.rimBand;
            const c = G.edgeD + (G.rimInnerD - G.edgeD) * b.at;
            const d = Math.abs(D - c);
            return 1 - smooth(b.w * 0.5 * (1 - b.blur), b.w * 0.5 * (1 + b.blur), d);
        };
        const albedo = TexLab._tex("plateA", N, M, (d) => {
            for (let j = 0; j < M; j++) {
                const bd = bandOf(j);
                for (let i = 0; i < N; i++) {
                    const k = j * N + i;
                    let c = pr.albedo.slice();
                    const sp = speck[k] * pr.speck;
                    c = mix3(c, [c[0] * 0.52, c[1] * 0.46, c[2] * 0.42], sp);
                    const cz = craze[k] * pr.crazeAmt;
                    c = mix3(c, [c[0] * 0.62, c[1] * 0.56, c[2] * 0.50], cz);
                    if (bd > 0) {
                        const jitter = 1 + swell[k] * 0.35;
                        c = mix3(c, pr.rimBand.col, clamp(bd * jitter, 0, 1));
                    }
                    const o = k * 4;
                    d[o] = clamp(c[0], 0, 1) * 255;
                    d[o + 1] = clamp(c[1], 0, 1) * 255;
                    d[o + 2] = clamp(c[2], 0, 1) * 255;
                    d[o + 3] = 255;
                }
            }
        }, scene, false, false);
        albedo.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

        const orm = TexLab._tex("plateO", N, M, (d) => {
            for (let j = 0; j < M; j++) {
                const bd = bandOf(j);
                for (let i = 0; i < N; i++) {
                    const k = j * N + i;
                    // 【対策】釉薬の粗さを一定にすると、どの角度から見ても同じ
                    //         強さで光る「塗ったプラスチック」になる。貫入の線と
                    //         鉄点だけ局所的に粗くする
                    let ro = pr.rough + craze[k] * 0.16 + speck[k] * 0.10
                        + Math.abs(swell[k]) * 0.05 - bd * 0.02;
                    const o = k * 4;
                    d[o] = clamp(1 - craze[k] * 0.10, 0, 1) * 255;
                    d[o + 1] = clamp(ro, 0.03, 0.9) * 255;
                    d[o + 2] = 0; d[o + 3] = 255;
                }
            }
        }, scene, true, false);
        orm.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;

        const H = new Float32Array(n2);
        for (let k = 0; k < n2; k++) {
            H[k] = clamp(0.5 + swell[k] * 0.30 - craze[k] * 0.42 + speck[k] * 0.16, 0, 1);
        }
        const normal = TexLab.normalFromHeight("plateN", N, H, 0.75, scene, false);
        return { albedo, orm, normal };
    }

    function plateMaterial(scene, pr, loop, seed) {
        const tex = plateGlaze(scene, pr, loop, seed);
        const m = new BABYLON.PBRMaterial("plateMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = tex.albedo;
        m.metallic = 0.0;
        m.roughness = 1.0;
        m.metallicTexture = tex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = tex.normal;
        m.bumpTexture.level = 0.45;
        // 【対策】磁器の照りは「素地の拡散」と「透明釉の鏡面」の2層。
        //         1枚の PBR で粗さを下げると、白い金属板になる
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = pr.coat;
        m.clearCoat.roughness = pr.rough * pr.coatK;
        m.clearCoat.indexOfRefraction = 1.51;
        m.texs = [tex.albedo, tex.orm, tex.normal];
        return m;
    }

    function buildPlate(scene, mat, seed) {
        const G = GLOBAL;
        const loop = plateLoop();
        const NS = Math.max(64, G.plateSectors | 0);
        const rows = loop.length;
        const nV = rows * (NS + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array((rows - 1) * NS * 6);

        let vo = 0;
        for (let i = 0; i < rows; i++) {
            const L = loop[i];
            // 【対策】八角形は r0 が角と辺で 8% 違うので、D = Dmax の等高線は
            //         1点に潰れず、角の側に半径 7mm ほどの穴が残る。いちばん
            //         内側の行だけ半径 0 に潰す。そこは平らな見込みなので、
            //         扇形の三角形は同一平面に載って絵には出ない
            const collapse = (L.D >= G.plateDmax - 1e-6);
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                let r = collapse ? 0 : contourR(th, L.D);
                // 【対策】完全な直線の辺だとリムのハイライトが定規で引いた線に
                //         なり、量産プラスチックに見える。手仕事の皿には
                //         コンマ数 mm の周期的な歪みが必ずある（SKILL 1.6）
                const w = 0.0035 * (1 - smooth(0.55, 0.95, L.D / G.plateDmax));
                r *= 1 + w * (Math.cos(3 * th + 0.7) * 0.6 + Math.sin(5 * th) * 0.4);
                const y = L.y + Math.sin(2 * th + 1.3) * 0.010
                    * (1 - smooth(0.3, 0.9, L.D / G.plateDmax));
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = r * Math.cos(th);
                positions[p3 + 1] = y;
                positions[p3 + 2] = r * Math.sin(th);
                uvs[p2] = j / NS;
                uvs[p2 + 1] = L.v;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < rows - 1; i++) {
            for (let j = 0; j < NS; j++) {
                const p = i * (NS + 1) + j;
                indices[io++] = p; indices[io++] = p + 1; indices[io++] = p + NS + 1;
                indices[io++] = p + 1; indices[io++] = p + NS + 2; indices[io++] = p + NS + 1;
            }
        }
        // 【対策】皿は「上から見える面」と「裏面」が同じ向きを向いていないので、
        //         代表点1個の内積では符号が不安定。全頂点の総和で見る（SKILL 1.3）
        const center = new V3(0, (G.rimY + G.footY) * 0.5, 0);
        const normals = finalize(positions, indices, center, 0, true);
        weldNormals(positions, normals);
        const mesh = makeMesh("plate", positions, indices, normals, uvs, null, scene);
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.loop = loop;
        return mesh;
    }

    const plateProf = plateProfiles();
    function plateTopY(x, z) { return plateProf.top(contourD(x, z)); }

    // =================================================================
    // 6. Rice : 米粒と盛り
    // =================================================================
    // 長さ方向のプロファイル（0 = 胚芽側 → 1 = 先端、最大半径に対する比）。
    // 【対策】単純なだ円体にすると細長い豆にしかならない。米粒は「胴が長く、
    //         両端が急に丸まる」カプセル寄りの形。endPow を 2.4 まで下げると
    //         紡錘形になって麦やパスタに、3.2 まで上げると胴が円柱になって
    //         カプセル錠剤に見える
    function profileAt(t, cfg) {
        const s = clamp(t, 0, 1);
        const u = Math.pow(s, cfg.asym);
        const e = 1 - Math.pow(Math.abs(2 * u - 1), cfg.endPow);
        let r = Math.pow(Math.max(0, e), cfg.endRound);
        r *= 1 - cfg.tipTaper * smooth(0.45, 1.0, s);
        return r;
    }

    function buildGrainVertexData(cfg, seed, nT, nS) {
        const rng = new Rng(seed);
        const kL = rng.gauss(1, cfg.sizeSd);
        const kW = rng.gauss(1, cfg.sizeSd * 1.25);
        const kH = rng.gauss(1, cfg.sizeSd * 1.25);
        const L = cfg.lengthMM * MM * clamp(kL, 0.80, 1.20);
        const halfW = cfg.widthMM * MM * 0.5 * clamp(kW, 0.80, 1.20);
        const halfH = cfg.heightMM * MM * 0.5 * clamp(kH, 0.80, 1.20);
        const bend = cfg.bend * L * rng.range(0.5, 1.5);
        const ventral = -Math.PI / 2;
        const nseed = (seed + 991) >>> 0;
        const ph = rng.range(0, 20);
        const germT = rng.range(0.06, 0.11);
        const germPhi = ventral + rng.range(-0.55, 0.55);
        const germDepth = rng.range(0.07, 0.13);

        const nV = (nT + 1) * (nS + 1);
        const positions = new Float32Array(nV * 3);
        const normals = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array(nT * nS * 6);

        // 断面の超だ円（角の丸い四角に寄せると「米」らしくなる）。
        // 【対策】p を 2.55 まで上げると角の立った四角い断面になり「切った餅」
        //         に寄る。炊いた米の断面は 2.0〜2.1
        const p = cfg.sectionP;
        const rho = new Float32Array(nS + 1);
        for (let j = 0; j <= nS; j++) {
            const th = (j % nS) / nS * TAU;
            const ca = Math.abs(Math.cos(th)), sa = Math.abs(Math.sin(th));
            rho[j] = 1 / Math.pow(Math.pow(ca, p) + Math.pow(sa, p), 1 / p);
        }

        let vo = 0;
        for (let i = 0; i <= nT; i++) {
            const t = i / nT;
            const pr = profileAt(t, cfg);
            const spineY = bend * (1 - Math.pow(2 * t - 1, 2));
            const x = L * (t - 0.5);
            const swell = 1 + cfg.endSwell * (smooth(0.78, 1.0, t) + (1 - smooth(0.0, 0.22, t)));
            for (let j = 0; j <= nS; j++) {
                const th = (j % nS) / nS * TAU;
                const cth = Math.cos(th), sth = Math.sin(th);
                let r = rho[j] * pr * swell;
                // (a) 腹溝
                const dv = angDist(th, ventral);
                r -= cfg.grooveDepth * Math.exp(-Math.pow(dv / 0.52, 2))
                    * Math.pow(Math.sin(Math.PI * t), 0.45);
                // (b) 胚芽の欠け
                const dg = angDist(th, germPhi);
                const dt2 = (t - germT) / 0.070;
                r -= germDepth * Math.exp(-dt2 * dt2) * Math.exp(-Math.pow(dg / 0.85, 2));
                // (c) 膨らみのゆらぎ。1階層だと滑らかなカプセルにしかならない。
                //     3D ノイズで引いているので継ぎ目は原理的に出ない
                const pf = (Noise.v3(cth * 2.1 + ph, sth * 2.1 + ph, t * 3.4 + ph, nseed) - 0.5) * 2;
                const pf2 = (Noise.v3(cth * 5.4 + ph, sth * 5.4 + ph, t * 8.2 + ph, nseed + 7) - 0.5) * 2;
                r *= 1 + cfg.puff * (pf + 0.55 * pf2);
                r = Math.max(0, r);
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = x;
                positions[p3 + 1] = spineY + halfH * r * sth;
                positions[p3 + 2] = halfW * r * cth;
                uvs[p2] = j / nS; uvs[p2 + 1] = t;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < nT; i++) {
            for (let j = 0; j < nS; j++) {
                const a = i * (nS + 1) + j, b = a + 1, c = a + (nS + 1), d = c + 1;
                indices[io++] = a; indices[io++] = c; indices[io++] = b;
                indices[io++] = b; indices[io++] = c; indices[io++] = d;
            }
        }
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        // 【対策】掃引の巻き順は断面をどちら回りに取ったかで簡単に裏返る。
        //         胴のいちばん太いリングの θ=0（+Z 側）で判定する
        {
            const pi = Math.round(nT * 0.45) * (nS + 1);
            if (normals[pi * 3 + 2] < 0) {
                for (let k = 0; k < indices.length; k += 3) {
                    const tmp = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = tmp;
                }
                BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            }
        }
        // 周方向の継ぎ目を溶接する
        for (let i = 0; i <= nT; i++) {
            const a = (i * (nS + 1)) * 3, b = (i * (nS + 1) + nS) * 3;
            let nx = normals[a] + normals[b], ny = normals[a + 1] + normals[b + 1];
            let nz = normals[a + 2] + normals[b + 2];
            const l = Math.hypot(nx, ny, nz) || 1;
            normals[a] = normals[b] = nx / l;
            normals[a + 1] = normals[b + 1] = ny / l;
            normals[a + 2] = normals[b + 2] = nz / l;
        }
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.normals = normals; vd.uvs = uvs; vd.indices = indices;
        // 【対策】info に vd を入れると、メッシュが生きているあいだ巨大な
        //         型付き配列が解放されない。数値だけ持たせる
        return { vd: vd, info: { L: L, halfW: halfW, halfH: halfH, tris: nT * nS * 2 } };
    }

    // ---- 米粒のテクスチャ ---------------------------------------------
    // 【対策】アルベド・ORM・法線を別々のノイズで作ると、粒の位置がずれて
    //         「ざらざらの上にぼんやりした汚れが乗った」ように見える。
    //         高さ場を1枚焼いて3枚すべてがそれを参照する（SKILL 2.6）
    function riceHeight(N, seed, cfg) {
        const H = new Float32Array(N * N);
        // 胴割れ。
        // 【対策】UV に任意の向きの線分を置くと、v（＝長さ）方向へ走った割れ目が
        //         「米粒を縦に裂いたもの」になる。実物の胴割れは必ず粒を横断する。
        //         ただし v 一定の線を全周に引くとタイヤの溝になるので、arc の
        //         外では消し、端ほど浅くする。炒飯は水が飛ぶぶん炊きたてより
        //         割れが出やすい
        const rng = new Rng((seed + 77) >>> 0);
        const amt = clamp(cfg.crackAmount, 0, 1);
        const cracks = [];
        for (let i = 0, nc = Math.round(2.6 * amt); i < nc; i++) {
            cracks.push({
                v: rng.range(0.16, 0.84), u0: rng.next(),
                arc: rng.range(0.16, 0.42), tilt: rng.range(-0.10, 0.10),
                w: rng.range(0.0016, 0.0032), d: rng.range(0.55, 1.0) * amt
            });
        }
        for (let y = 0; y < N; y++) {
            const v = y / N;
            // 【対策】v=0/1 は掃引の両端＝UV が潰れる極。ここに肌理を出すと、
            //         数テクセルへ圧縮された模様が芯のように固まって見える
            const poleFade = smooth(0, 0.10, v) * (1 - smooth(0.90, 1.0, v));
            for (let x = 0; x < N; x++) {
                const u = x / N, k = y * N + x;
                let e = Noise.fbm2p(u * 34, v * 34, 34, 34, seed + 3, 3) * 0.34
                    + Noise.fbm2p(u * 96, v * 96, 96, 96, seed + 19, 2) * 0.36
                    + Noise.fbm2p(u * 210, v * 210, 210, 210, seed + 37, 1) * 0.30;
                e -= 0.5;
                e += 0.035 * Math.sin(u * TAU * 11
                    + Noise.fbm2p(v * 3, 0.5, 3, 1, seed + 5, 1) * 6);
                const endW = smooth(0.62, 0.86, v) + (1 - smooth(0.14, 0.38, v));
                e += cfg.endSwell * 10 * endW
                    * (Noise.fbm2p(u * 72, v * 72, 72, 72, seed + 313, 2) - 0.5);
                for (const c of cracks) {
                    let du = u - c.u0; du -= Math.round(du);
                    const half = c.arc * 0.5;
                    if (Math.abs(du) >= half) continue;
                    const dv = v - (c.v + c.tilt * du);
                    const along = 1 - Math.pow(Math.abs(du) / half, 2);
                    e -= c.d * 0.26 * along * Math.exp(-(dv * dv) / (c.w * c.w));
                }
                H[k] = clamp(0.5 + e * poleFade, 0, 1);
            }
        }
        return H;
    }

    function riceTextures(scene, cfg, seed) {
        const SN = 512, SO = 256;
        const hBig = riceHeight(SN, seed, cfg);
        const hSmall = riceHeight(SO, seed, cfg);
        const normal = TexLab.normalFromHeight("riceN", SN, hBig, cfg.bumpLevel * 6.0, scene, false);
        const orm = TexLab._tex("riceO", SO, SO, (d) => {
            for (let k = 0; k < SO * SO; k++) {
                const h = hSmall[k];
                // 【対策】油はくぼみに溜まる。粗さを高さと正の相関にする。
                //         逆にすると出っ張りだけ光る金平糖になる（SKILL 3.2）
                const ro = clamp(cfg.baseRough * (0.62 + 0.62 * smooth(0.25, 0.80, h)), 0.05, 0.95);
                const o = k * 4;
                d[o] = clamp(0.72 + 0.28 * h, 0, 1) * 255;
                d[o + 1] = ro * 255; d[o + 2] = 0; d[o + 3] = 255;
            }
        }, scene, true, false);
        const coat = TexLab._tex("riceC", SO, SO, (d) => {
            for (let y = 0; y < SO; y++) {
                const v = y / SO;
                for (let x = 0; x < SO; x++) {
                    const k = y * SO + x, u = x / SO;
                    const h = hSmall[k];
                    // 【対策】油膜を粒の全面に一様に張ると、1粒ごとに小さな鏡が
                    //         できて白い錠剤が並んでいるように見える。実物は
                    //         膜の切れた斑があり、そこだけ粗い（SKILL 3.1）
                    const cloud = Noise.fbm2p(u * 4, v * 3, 4, 3, seed + 811, 3);
                    const fine = Noise.fbm2p(u * 14, v * 12, 14, 12, seed + 827, 2);
                    const dry = smooth(0.52, 0.78, cloud) * (cfg.wetMottle || 0);
                    const cov = clamp(cfg.coatIntensity * (1.12 - 0.34 * h) * (1 - 0.85 * dry), 0, 1);
                    const ro = clamp(cfg.coatRough * (0.68 + 0.85 * h)
                        * (0.90 + 0.20 * fine) + 0.30 * dry, 0.02, 0.85);
                    const o = k * 4;
                    d[o] = cov * 255; d[o + 1] = ro * 255; d[o + 2] = 0; d[o + 3] = 255;
                }
            }
        }, scene, true, false);
        const thick = TexLab._tex("riceT", 64, 64, (d) => {
            for (let y = 0; y < 64; y++) {
                const t = profileAt((y + 0.5) / 64, cfg);
                for (let x = 0; x < 64; x++) {
                    const o = (y * 64 + x) * 4;
                    const v = clamp(t, 0, 1) * 255;
                    d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255;
                }
            }
        }, scene, true, false);
        return { normal, orm, coat, thick };
    }

    function riceMaterial(scene, cfg, tex, name) {
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoColor = col3(cfg.albedo);
        m.metallic = 0.0;
        m.roughness = 1.0;                  // 実値は ORM の G
        m.metallicTexture = tex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = tex.normal;
        m.bumpTexture.level = 1.0;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 1.0;        // 実値は coat の R
        m.clearCoat.roughness = 1.0;        //              G
        m.clearCoat.texture = tex.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        // 【対策】炒飯の粒にのっているのは水ではなく油。IOR は 1.33 ではなく
        //         1.47。ここが照りの強さの差になる
        m.clearCoat.indexOfRefraction = 1.47;
        const sub = m.subSurface;
        sub.isTranslucencyEnabled = true;
        sub.translucencyIntensity = clamp(cfg.translucency, 0, 0.95);
        sub.tintColor = col3(cfg.tint);
        sub.thicknessTexture = tex.thick;
        sub.useMaskFromThicknessTexture = false;
        if ("useGltfStyleTextures" in sub) sub.useGltfStyleTextures = false;
        const TH = cfg.heightMM * MM;
        sub.minimumThickness = TH * 0.06;
        sub.maximumThickness = TH * 0.95;
        sub.tintColorAtDistance = TH * 1.25;
        // 【対策】屈折は入れない。米は透明体ではなく散乱体なので、屈折を足すと
        //         途端に「ガラスの米」になる
        sub.isRefractionEnabled = false;
        return m;
    }

    // ---- 盛りの形 ------------------------------------------------------
    function moundY(x, z, M, seed) {
        const dx = x / M.ax, dz = z / M.az;
        const u = Math.hypot(dx, dz);
        if (u >= 1) return -1e9;
        const dome = M.peak * Math.pow(Math.max(0, 1 - Math.pow(u, 2 * M.pw)), M.pq);
        const fade = 1 - smooth(0.80, 1.0, u);
        const sd = (seed ^ 0x77) >>> 0;
        // お玉の塊。大小2帯域で入れないと、なめらかなドームのままになる
        const lump = ((Noise.v3(x * 0.46 + 31, z * 0.46 + 17, 5.3, sd) - 0.5) * 2.0
            + (Noise.v3(x * 1.28 + 7, z * 1.28 + 3, 2.1, sd + 91) - 0.5) * 1.1)
            * M.lump * fade;
        // 【対策】裾をきれいな楕円で終わらせると、型から出したゼリーになる。
        //         炒飯の裾は粒が転がり落ちて必ず不揃いに崩れている
        const edge = (Noise.v3(x * 0.95 + 5, z * 0.95 + 13, 7.7, sd + 211) - 0.5) * 2
            * M.edge * smooth(0.45, 0.98, u);
        // 【対策】裾の崩れ（edge）は負にも振れるので、そのままだと盛りの面が
        //         皿の見込みより下へ潜る。下地メッシュが皿の底と同じ高さで
        //         重なって Z ファイティングを起こし、裾が虫食いにちらつく
        return Math.max(GLOBAL.wellY + 0.10, GLOBAL.wellY + dome + lump + edge);
    }
    function moundN(x, z, M, seed) {
        const e = 0.09;
        const c = moundY(x, z, M, seed);
        if (c < -1e8) return new V3(0, 1, 0);
        const gx = (moundY(x + e, z, M, seed) - moundY(x - e, z, M, seed)) / (2 * e);
        const gz = (moundY(x, z + e, M, seed) - moundY(x, z - e, M, seed)) / (2 * e);
        const n = new V3(Math.abs(gx) > 100 ? 0 : -gx, 1, Math.abs(gz) > 100 ? 0 : -gz);
        n.normalize();
        return n;
    }

    // 粒のすき間から皿が見えないように、盛りの形そのものを1枚張る。
    // 【対策】これが無いと粒と粒のあいだから黒い穴が見えて「まばらに米を
    //         貼りつけた飾り」になる。ただしチャーハンでは、ごはんと違って
    //         この下地をはっきり暗くする。粒が離れているぶん谷が深く、
    //         奥まで光が届かないのが正しい
    function buildRiceBody(scene, M, seed, mat) {
        const NR = 52, NS = 152;
        const sd = (seed ^ 0x33AB) >>> 0;
        const nV = (NR + 1) * (NS + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array(NR * NS * 6);
        let vo = 0;
        for (let i = 0; i <= NR; i++) {
            const u = i / NR;
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                const x = M.ax * u * 0.997 * Math.cos(th);
                const z = M.az * u * 0.997 * Math.sin(th);
                let y = moundY(x, z, M, seed);
                if (y < -1e8) y = GLOBAL.wellY;
                // 【対策】下地を数学的になめらかな面にすると、粒のすき間から
                //         見えた瞬間に「塗った面」になる。粒と同じ凹凸を持たせる
                const bump = (Noise.v3(x * 2.4 + 5, z * 2.4 + 9, 1.7, sd) - 0.5) * 2 * 0.085
                    + (Noise.v3(x * 6.0 + 2, z * 6.0 + 4, 3.3, sd + 29) - 0.5) * 2 * 0.045;
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = x;
                positions[p3 + 1] = Math.max(GLOBAL.wellY + 0.012, y - 0.090 + bump);
                positions[p3 + 2] = z;
                uvs[p2] = j / NS * 6; uvs[p2 + 1] = u * 6;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < NR; i++) {
            for (let j = 0; j < NS; j++) {
                const p = i * (NS + 1) + j;
                indices[io++] = p; indices[io++] = p + 1; indices[io++] = p + NS + 1;
                indices[io++] = p + 1; indices[io++] = p + NS + 2; indices[io++] = p + NS + 1;
            }
        }
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        let up = 0;
        for (let i = 1; i < normals.length; i += 3) up += normals[i];
        if (up < 0) {
            for (let k = 0; k < indices.length; k += 3) {
                const t = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = t;
            }
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        weldNormals(positions, normals);
        const mesh = makeMesh("riceBody", positions, indices, normals, uvs, null, scene);
        mesh.material = mat;
        mesh.receiveShadows = true;
        return mesh;
    }

    // ---- 粒の配置 ------------------------------------------------------
    function placeGrains(M, ST, seed) {
        const rng = new Rng((seed ^ 0x51ED) >>> 0);
        // 【対策】粒数を定数で持つと、盛りの寸法を変えたときに密度が変わって
        //         「まばら」か「団子」になる。面密度から出す
        const area = Math.PI * M.ax * M.az * 1.25;
        const n = Math.round(area * GLOBAL.grainDensity);
        const out = [];
        for (let i = 0; i < n; i++) {
            // 【対策】ごはんは数粒がくっついた塊で置くのが正しいが、炒飯で
            //         塊にすると「べちゃっとした失敗作」になる。1粒ずつ独立に
            //         撒いてよい数少ない料理
            // 【対策】sqrt は円板を面積等分するが、盛りは外側ほど傾いていて
            //         実面積が大きく、横から見ると外周が最も広く見える。
            //         指数を 0.5 より小さくして外周へ寄せる
            const uc = Math.pow((i + 0.5) / n, 0.44) * rng.range(0.90, 1.09);
            const thc = rng.range(0, TAU);
            let x = M.ax * uc * Math.cos(thc);
            let z = M.az * uc * Math.sin(thc);
            let dx = x / M.ax, dz = z / M.az;
            const u = Math.hypot(dx, dz);
            if (u > 0.988) { const k = 0.988 / u; x *= k; z *= k; dx *= k; dz *= k; }
            // 【対策】全粒を面ぴったりに置くと、モザイクを貼ったように隙間なく
            //         敷き詰まって「型に詰めたごはん」になる。チャーハンでは
            //         浮いた粒の割合をごはん（34%）よりさらに上げる。これが
            //         「パラパラ」の輪郭を作る
            const t = rng.next(), LR = M.liftRatio, LIFT = M.grainLift;
            const sink = (t < LR) ? -LIFT * Math.pow(t / LR, 0.8)
                : 0.010 + 0.150 * Math.pow((t - LR) / (1 - LR), 1.7);
            out.push({
                x: x, z: z, u: Math.hypot(dx, dz),
                y: Math.max(GLOBAL.wellY + 0.02, moundY(x, z, M, seed) - sink)
            });
        }
        return out;
    }

    // ---- 粒間の暗がり ---------------------------------------------------
    // 【対策】これは SSAO では出ない。SSAO が拾えるのは画面空間で隣接した面の
    //         陰りだけで、粒の谷は深さ数ミリ・幅数ミリの密集した溝。半径を
    //         合わせると今度は粒の輪郭が全部汚れる。配置の段階で幾何的に
    //         焼けば、描画時のコストはゼロで正確
    function bakeAO(pts, M, seed) {
        const cell = 0.36, OFF = 4096;
        const key = (i, j) => (i + OFF) * 100003 + (j + OFF);
        // 【対策】素の高さで近傍最高点を取ると、盛りの斜面そのものの傾きを
        //         「沈み込み」として拾い、山の外側半分が丸ごと暗くなる。
        //         盛りの面からの差（残差）に直してから比べる
        const top = new Map();
        for (const p of pts) {
            p.res = p.y - moundY(p.x, p.z, M, seed);
            const k = key(Math.floor(p.x / cell), Math.floor(p.z / cell));
            const cur = top.get(k);
            if (cur === undefined || p.res > cur) top.set(k, p.res);
        }
        for (const p of pts) {
            const i0 = Math.floor(p.x / cell), j0 = Math.floor(p.z / cell);
            let m = -1e9;
            for (let di = -1; di <= 1; di++) {
                for (let dj = -1; dj <= 1; dj++) {
                    const v = top.get(key(i0 + di, j0 + dj));
                    if (v !== undefined && v > m) m = v;
                }
            }
            let ao = clamp(1 - (m - p.res) / RICE.aoDepth, 0, 1);
            ao = RICE.aoFloor + (1 - RICE.aoFloor) * Math.pow(ao, 0.75);
            // 盛りの裾は器の内壁に空を遮られてさらに暗い
            ao *= 1 - 0.20 * smooth(0.74, 1.0, p.u);
            p.ao = ao;
        }
        return pts;
    }

    // ---- 粒ごとの色 -----------------------------------------------------
    // ★ ここがチャーハンの本体。
    // 【対策】マテリアルのアルベドを黄色くして済ませると、出てくるのは
    //         「黄色く塗った白飯」。実物は一粒ずつ色が違い、しかもその違いが
    //         数cm 単位の塊としてまとまっている（お玉で混ぜたときの、味の
    //         濃い所と薄い所）。空間ノイズ 6 割 + 粒ごとの乱数 4 割で作る
    function tintRamp(t) {
        if (t < 0.30) return mix3(TONE.white, TONE.pale, t / 0.30);
        if (t < 0.58) return mix3(TONE.pale, TONE.mid, (t - 0.30) / 0.28);
        if (t < 0.82) return mix3(TONE.mid, TONE.deep, (t - 0.58) / 0.24);
        return mix3(TONE.deep, TONE.char, (t - 0.82) / 0.18);
    }
    function bakeGrainTint(pts, ST, seed) {
        const rng = new Rng((seed ^ 0x7A11) >>> 0);
        for (const p of pts) {
            const cl = Noise.fbm2(p.x * 0.72 + 11, p.z * 0.72 + 7, (seed + 401) >>> 0, 3);
            const rn = rng.next();
            let t = ST.season + ((cl - 0.5) * 1.55 + (rn - 0.5) * 1.15) * ST.seasonSd;
            t = clamp(t, 0, 1);
            let c = tintRamp(t);
            // 卵をまとった粒。黄が強く、明度は落ちない
            const eggR = rng.next(), eggK = rng.range(0.55, 0.95);
            if (eggR < ST.eggMix) c = mix3(c, TONE.egg, eggK);
            // 鍋肌に当たって焼けた粒（少数だが、これがあると「炒めた」感が出る）
            const charR = rng.next(), charK = rng.range(0.3, 0.7);
            if (charR < 0.035) c = mix3(c, TONE.char, charK);
            // 【対策】乱数の引き値を捨てると、味の濃さを GUI で動かすたびに
            //         全部の粒を作り直す羽目になる（＝スライダーが数秒固まる）。
            //         引いた値を持たせておけば、色だけ焼き直せば済む
            p.cl = cl; p.rn = rn;
            p.eggR = eggR; p.eggK = eggK;
            p.charR = charR; p.charK = charK;
            p.tint = c;
            p.t = t;
        }
        return pts;
    }

    // 米のマテリアルのアルベド（白飯）に対する倍率としてインスタンスカラーを作る。
    // 【対策】頂点／インスタンスカラーはリニア空間で解釈される。sRGB の比を
    //         そのまま入れると、色づいた粒だけ明るく浮く（SKILL 2.3）
    const BASE_L = [s2l(RICE.albedo[0]), s2l(RICE.albedo[1]), s2l(RICE.albedo[2])];
    function grainColor(tint, ao, aoStrength, tintStrength) {
        const v = clamp(1 - (1 - ao) * aoStrength, 0.02, 1);
        const w = 1 - v;
        // 【対策】遮蔽ぶんを一様に引くと、谷は必ず中性グレーになる。米粒は
        //         半透明なので、谷に落ちた光は隣の粒を通り抜けて黄色みを
        //         帯びて戻る。ただし青を 0.30 も落とすと黄土色まで転ぶ
        const kr = v * (1 + 0.06 * w), kg = v * (1 - 0.02 * w), kb = v * (1 - 0.18 * w);
        const r = mix(1, s2l(tint[0]) / BASE_L[0], tintStrength);
        const g = mix(1, s2l(tint[1]) / BASE_L[1], tintStrength);
        const b = mix(1, s2l(tint[2]) / BASE_L[2], tintStrength);
        return new BABYLON.Color4(clamp(r * kr, 0, 2), clamp(g * kg, 0, 2), clamp(b * kb, 0, 2), 1);
    }

    // =================================================================
    // 7. Ingredients : 炒り卵 / チャーシュー / 小口ねぎ / 黒胡椒
    // =================================================================
    // 炒り卵もチャーシューも「不定形の薄片」で、違うのは厚み・反り・色だけ。
    // 1つの薄片ビルダにまとめる。
    //
    // 【対策】薄片の輪郭を r(θ) の関数（＝角度ごとの半径）で作ると、どう
    //   乱数を入れても「丸から少し歪んだ形」にしかならない。炒り卵は
    //   鍋の中でちぎれた膜なので、輪郭は直線と鋭い角でできている。
    //   乱数で角を打ち、角と角のあいだを直線で結ぶこと。この一点だけで
    //   「花形の飾り」と「ちぎれた卵」が分かれる
    function buildFlakeGeom(P, seed) {
        const rng = new Rng(seed >>> 0);
        const NC = 5 + rng.int(4);              // 角の数
        const NT = NC * 6;                      // 1辺を6分割して直線を保つ
        const R = rng.range(P.rMin, P.rMax);
        const th = P.thick * rng.range(0.80, 1.30);
        const corner = [];
        for (let c = 0; c < NC; c++) {
            // 等分した区画の中で振ると、角どうしの最低限の間隔が保証される
            const a = (c + rng.range(0.15, 0.85)) / NC * TAU;
            const r = R * rng.range(0.58, 1.15);
            corner.push([r * Math.cos(a), r * Math.sin(a)]);
        }
        const ring = [];
        for (let j = 0; j < NT; j++) {
            const t = j / NT * NC, k = Math.floor(t), f = t - k;
            const a = corner[k % NC], b = corner[(k + 1) % NC];
            ring.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
        }
        // 角をほんの少しだけ落とす（火が通った縁は完全には尖らない）
        for (let pass = 0; pass < 2; pass++) {
            const src = ring.map((q) => [q[0], q[1]]);
            for (let j = 0; j < NT; j++) {
                const a = src[(j - 1 + NT) % NT], b = src[j], c = src[(j + 1) % NT];
                ring[j][0] = b[0] * 0.74 + (a[0] + c[0]) * 0.13;
                ring[j][1] = b[1] * 0.74 + (a[1] + c[1]) * 0.13;
            }
        }
        // 反り。鍋肌で焼けた膜は平らではなく、片側へゆるく丸まる
        const curlPh = rng.range(0, TAU);
        const curlA = rng.range(-1, 1) * P.curl * 0.30;
        const curlB = rng.range(0.25, 1.0) * P.curl * 0.55;
        const bendY = (x, z) => {
            const u = x * Math.cos(curlPh) + z * Math.sin(curlPh);
            const v = -x * Math.sin(curlPh) + z * Math.cos(curlPh);
            return curlA * u + curlB * (u * u - v * v * 0.35);
        };
        const pSeed = (seed + 313) >>> 0;
        // 卵はふくらむ（気泡）、肉はふくらまない
        const puffAt = (x, z) => P.puff * R
            * (Noise.v3(x * 3.4 + 7, z * 3.4 + 3, 1.7, pSeed) - 0.5) * 2;

        const ks = [0.0, 0.58, 1.0];            // 内側 → 外周
        const S = NT + 1;
        const nV = S * ks.length * 2;
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const colors = new Float32Array(nV * 4).fill(1);
        const idx = [];
        // 焼け具合。1枚ごとに、また1枚の中でも縁ほど焼ける
        const burn = rng.range(0.15, 0.85);
        let vo = 0;
        for (let lay = 0; lay < 2; lay++) {          // 0 = 裏、1 = 表
            const sgn = lay ? 1 : -1;
            for (let ri = 0; ri < ks.length; ri++) {
                const k = ks[ri];
                for (let j = 0; j <= NT; j++) {
                    const q = ring[j % NT];
                    const lx = q[0] * k, lz = q[1] * k;
                    const pf = puffAt(lx, lz) * (1 - k * k) * (lay ? 1 : 0.35);
                    const p3 = vo * 3, p2 = vo * 2;
                    positions[p3] = lx;
                    positions[p3 + 1] = bendY(lx, lz) + sgn * (th * 0.5 + pf);
                    positions[p3 + 2] = lz;
                    uvs[p2] = j / NT; uvs[p2 + 1] = k;
                    // 【対策】色を高さと無相関のノイズで振ると、柄の付いた布に
                    //         見える。焼き色は必ず形（＝縁とふくらみ）と
                    //         相関させる（SKILL 2.1）
                    let c = mix3(P.mid, P.lit, clamp(0.5 + pf / (0.28 * R + 1e-6), 0, 1)
                        * (lay ? 1 : 0.25));
                    c = mix3(c, P.deep, (1 - lay) * 0.45);
                    c = mix3(c, P.brown, smooth(0.55, 1.0, k) * burn);
                    if (P.fat) {
                        // チャーシューの脂身。片の一方に寄って帯になる
                        const fw = smooth(0.25, 0.85,
                            Noise.v3(lx * 2.2 + 31, lz * 2.2 + 11, 3.3, pSeed + 71));
                        c = mix3(c, P.fat, fw * 0.55 * (1 - smooth(0.7, 1.0, k)));
                    }
                    const o = vo * 4;
                    colors[o] = s2l(clamp(c[0], 0, 1));
                    colors[o + 1] = s2l(clamp(c[1], 0, 1));
                    colors[o + 2] = s2l(clamp(c[2], 0, 1));
                    vo++;
                }
            }
        }
        // 面を張る。
        // 【対策】上面・下面・側面で巻き順の規約が食い違うと、finalize が
        //         全体を反転しても片面だけ内を向いたままになる。右手系で
        //         外向きに統一してから finalize に渡す（SKILL 1.3 / 1.5）
        const base = (lay, ri) => (lay * ks.length + ri) * S;
        for (let ri = 0; ri < ks.length - 1; ri++) {
            const t0 = base(1, ri), t1 = base(1, ri + 1);
            const b0 = base(0, ri), b1 = base(0, ri + 1);
            for (let j = 0; j < NT; j++) {
                // 表（法線 +y）
                idx.push(t0 + j, t0 + j + 1, t1 + j);
                idx.push(t0 + j + 1, t1 + j + 1, t1 + j);
                // 裏（法線 -y）＝ 表の逆巻き
                idx.push(b0 + j, b1 + j, b0 + j + 1);
                idx.push(b0 + j + 1, b1 + j, b1 + j + 1);
            }
        }
        {   // 側面（厚みの断面）。外周のリングをそのまま使う
            const T = base(1, ks.length - 1), B = base(0, ks.length - 1);
            for (let j = 0; j < NT; j++) {
                idx.push(T + j, T + j + 1, B + j);
                idx.push(T + j + 1, B + j + 1, B + j);
            }
        }
        const indices = new Uint32Array(idx);
        const normals = finalize(positions, indices, new V3(0, 0, 0), 0, true);
        weldNormals(positions, normals);
        return { positions, indices, normals, uvs, colors, nV, R };
    }

    function flakeMaterial(scene, name, coat, coatRough, trans, tint) {
        const m = new BABYLON.PBRMaterial(name, scene);
        // 色は全部頂点カラーで持つので、アルベドは白（SKILL 2.8）
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0.0;
        m.roughness = 0.46;
        // 【対策】具の照りを roughness で作ると、地の出ている面まで一緒に
        //         光ってプラスチックになる。照りは油膜（clearCoat, IOR 1.47）へ
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = coat;
        m.clearCoat.roughness = coatRough;
        m.clearCoat.indexOfRefraction = 1.47;
        const sub = m.subSurface;
        sub.isTranslucencyEnabled = true;
        sub.translucencyIntensity = trans;
        // 【対策】tintColor を既定（白）のままにすると、透過した光がそのまま
        //         白として乗り、黄色いはずの卵がクリーム色に転ぶ。透過光は
        //         必ずその具の色に染まる
        sub.tintColor = col3(tint);
        sub.minimumThickness = 0.01;
        sub.maximumThickness = 0.09;
        return m;
    }

    // ---- 小口ねぎ -------------------------------------------------------
    // 【対策】ねぎを1色の緑の円盤にすると、輪ゴムか抹茶の粒に見える。
    //   小口切りは筒を輪切りにしたものなので、必ず穴が空いていて、
    //   「濃い外皮 / 淡い果肉 / さらに淡い切り口」の3色が同時に見える。
    //   穴を省くと、どれだけ色を作り込んでも平たい緑の点にしかならない
    function buildNegiGeom(seed) {
        const rng = new Rng(seed >>> 0);
        const NT = 22;
        const ro = rng.range(NEGI.rOut[0], NEGI.rOut[1]);
        const ri = ro * rng.range(NEGI.rIn[0], NEGI.rIn[1]);
        const h = rng.range(NEGI.h[0], NEGI.h[1]);
        // 切り口はきれいな真円ではない。包丁で押されて少し潰れる
        const ovA = rng.range(0.85, 1.0), ovPh = rng.range(0, TAU);
        const S = NT + 1;
        const nV = S * 4;                       // 外上 / 外下 / 内上 / 内下
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const colors = new Float32Array(nV * 4).fill(1);
        const idx = [];
        // 個体差。白根に近い片は淡く、葉先に近い片は濃い
        const green = rng.range(0.25, 1.0);
        const skin = mix3(NEGI.flesh, NEGI.skin, green);
        const flesh = mix3(NEGI.cut, NEGI.flesh, green * 0.8);
        const setC = (v, c) => {
            const o = v * 4;
            colors[o] = s2l(clamp(c[0], 0, 1));
            colors[o + 1] = s2l(clamp(c[1], 0, 1));
            colors[o + 2] = s2l(clamp(c[2], 0, 1));
        };
        let vo = 0;
        const rings = [
            { r: 1.0, y: 1, col: skin }, { r: 1.0, y: -1, col: skin },
            { r: 0.0, y: 1, col: flesh }, { r: 0.0, y: -1, col: flesh }
        ];
        for (const R of rings) {
            for (let j = 0; j <= NT; j++) {
                const a = (j % NT) / NT * TAU;
                const sq = 1 + (ovA - 1) * Math.pow(Math.cos(a - ovPh), 2);
                const rr = mix(ri, ro, R.r) * sq
                    * (1 + 0.05 * (Noise.v2(Math.cos(a) * 3, Math.sin(a) * 3, seed + 5) - 0.5));
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = rr * Math.cos(a);
                positions[p3 + 1] = R.y * h * 0.5;
                positions[p3 + 2] = rr * Math.sin(a);
                uvs[p2] = j / NT; uvs[p2 + 1] = R.r;
                // 切り口は外周が濃く、内側へ向かって淡くなる
                setC(vo, R.r > 0.5 ? R.col : mix3(NEGI.cut, R.col, 0.45));
                vo++;
            }
        }
        const OT = 0, OB = S, IT = S * 2, IB = S * 3;
        for (let j = 0; j < NT; j++) {
            // 外壁（外向き）
            idx.push(OT + j, OT + j + 1, OB + j);
            idx.push(OT + j + 1, OB + j + 1, OB + j);
            // 内壁（内向き ＝ 外壁の逆巻き）
            idx.push(IT + j, IB + j, IT + j + 1);
            idx.push(IT + j + 1, IB + j, IB + j + 1);
            // 上の切り口（+y）
            idx.push(IT + j, IT + j + 1, OT + j);
            idx.push(IT + j + 1, OT + j + 1, OT + j);
            // 下の切り口（-y）
            idx.push(IB + j, OB + j, IB + j + 1);
            idx.push(IB + j + 1, OB + j, OB + j + 1);
        }
        const indices = new Uint32Array(idx);
        // 【対策】筒は内壁が中心を向いているので、代表点1個の内積では
        //         符号が決まらない。総和で判定する（外壁の面積が勝つ）
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        let dot = 0;
        for (let i = 0; i < positions.length; i += 3) {
            dot += normals[i] * positions[i] + normals[i + 2] * positions[i + 2];
        }
        if (dot < 0) {
            for (let i = 0; i < indices.length; i += 3) {
                const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t;
            }
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        return { positions, indices, normals, uvs, colors, nV, R: ro, h: h };
    }

    function negiMaterial(scene) {
        const m = new BABYLON.PBRMaterial("negiMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0.0;
        m.roughness = 0.42;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.72;
        m.clearCoat.roughness = 0.20;
        m.clearCoat.indexOfRefraction = 1.42;
        // 生のねぎは薄いので端が光を通す
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.34;
        m.subSurface.tintColor = col3([0.42, 0.72, 0.26]);
        m.subSurface.minimumThickness = 0.005;
        m.subSurface.maximumThickness = 0.05;
        return m;
    }

    function pepperMaterial(scene) {
        const m = new BABYLON.PBRMaterial("pepperMat", scene);
        m.albedoColor = col3(PEPPER.col);
        m.metallic = 0.0;
        m.roughness = 0.58;
        return m;
    }

    // =================================================================
    // 8. Renge : れんげ
    // =================================================================
    // 【対策】断面を円のまま掃引すると針金になる。れんげの柄は「厚みのある
    //   平たい板」で、つぼへ向かって断面が丸へ近づく。丸めた長方形 → 円を
    //   連続的に変える掃引にする。
    // 【対策】つぼの深さを厚みの数倍しか掘らないと、皿にしか見えない。
    //   実物のれんげは差し渡し 3.9cm に対して深さ 1.2cm ある。カレーの
    //   スプーンより明らかに深い椀形で、そこが中華の匙らしさになる
    function buildRenge(scene, ox, oz, ang, mat, seed) {
        const NT = 120, NS = 26;
        const L = 13.6;
        // s: 0 = 柄の端、1 = つぼの先
        // 【対策】両端を同じ関数で丸めると、つぼの先が柄の端と同じ形になる。
        //   柄の端は半径 5mm ほどで急に閉じるが、つぼの先は最大幅と同じ
        //   半径の円弧で丸い。テーパーで済ませると必ず木の葉になる
        const capA = (s) => (s >= 0.028) ? 1
            : Math.sqrt(Math.max(0, 1 - Math.pow(1 - s / 0.028, 2)));
        const sw = monoSpline(
            [0, 0.08, 0.22, 0.38, 0.50, 0.58, 0.66, 0.74, 0.82, 0.90, 0.955, 1.0],
            [0.46, 0.54, 0.58, 0.60, 0.68, 1.00, 1.46, 1.80, 1.95, 1.80, 1.30, 0.04]);
        const st = monoSpline([0, 0.22, 0.44, 0.56, 0.68, 0.82, 1.0],
            [0.235, 0.215, 0.185, 0.145, 0.098, 0.080, 0.070]);
        const sp = monoSpline([0, 0.30, 0.52, 0.64, 0.78, 1.0], [3.2, 3.6, 3.0, 2.4, 2.05, 2.0]);
        // つぼのくぼみ
        const sdep = monoSpline([0, 0.50, 0.58, 0.68, 0.80, 0.92, 1.0],
            [0, 0, 0.20, 0.82, 1.28, 1.06, 0.18]);
        // 中心線。柄の端が持ち上がり、つぼが卓に着く
        const sy = monoSpline([0, 0.20, 0.40, 0.56, 0.70, 0.86, 1.0],
            [2.38, 2.06, 1.74, 1.47, 1.36, 1.33, 1.33]);
        const nV = (NT + 1) * (NS + 1);
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array(NT * NS * 6);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        let vo = 0;
        for (let i = 0; i <= NT; i++) {
            const s = i / NT;
            const wRaw = sw(s), k = capA(s);
            const tk = clamp(wRaw / 0.40, 0, 1);
            const w = Math.max(1e-4, wRaw * k);
            const t = Math.max(1e-4, st(s) * k * tk);
            const p = sp(s), dep = sdep(s) * k * tk;
            const cx = (s - 0.5) * L, cy = sy(s);
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                const cth = Math.cos(th), sth = Math.sin(th);
                const rho = 1 / Math.pow(Math.pow(Math.abs(cth), p) + Math.pow(Math.abs(sth), p), 1 / p);
                const lz = rho * cth * w;
                // 断面ごと下へたわませる。縁（|lz| = w）は動かさないので、
                // 厚みを保ったまま「縁が立った椀」になる。上面だけ押し下げる
                // やり方だと、つぼの底が厚くなって鋳物に見える
                const u = clamp(Math.abs(lz) / w, 0, 1);
                const ly = rho * sth * t - dep * (1 - u * u);
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = ox + cx * ca - lz * sa;
                positions[p3 + 1] = cy + ly;
                positions[p3 + 2] = oz + cx * sa + lz * ca;
                uvs[p2] = j / NS; uvs[p2 + 1] = s;
                vo++;
            }
        }
        // 【対策】中心線とくぼみの深さを別々に決めているので、つぼの底が卓へ
        //         潜る組み合わせが出る。式で見積もらず、実測の最下点を卓の上へ
        //         座らせ直す
        let lo = 1e9;
        for (let v = 0; v < nV; v++) lo = Math.min(lo, positions[v * 3 + 1]);
        const dy = 0.012 - lo;
        for (let v = 0; v < nV; v++) positions[v * 3 + 1] += dy;
        let io = 0;
        for (let i = 0; i < NT; i++) {
            for (let j = 0; j < NS; j++) {
                const a = i * (NS + 1) + j;
                indices[io++] = a; indices[io++] = a + NS + 1; indices[io++] = a + 1;
                indices[io++] = a + 1; indices[io++] = a + NS + 1; indices[io++] = a + NS + 2;
            }
        }
        const normals = finalize(positions, indices, new V3(ox, 0.9, oz), 0, true);
        weldNormals(positions, normals);
        const mesh = makeMesh("renge", positions, indices, normals, uvs, null, scene);
        mesh.material = mat;
        mesh.receiveShadows = true;
        // つぼの中に一すくい盛るための情報。
        // 【対策】「底の高さ」と「半径」だけ渡すと、椀形のつぼに平らな床を
        //         仮定することになり、縁の近くの粒が殻へめり込む。内側の面
        //         そのもの（断面のたわみを含む）を関数で渡す
        const sBowl = 0.82;
        const cxB = (sBowl - 0.5) * L;
        mesh.bowl = {
            ox: ox, oz: oz, ang: ang, L: L, sC: sBowl,
            x: ox + cxB * ca, z: oz + cxB * sa,
            floor: sy(sBowl) + st(sBowl) - sdep(sBowl) + dy,
            rim: sy(sBowl) + dy,
            width: (s) => sw(s),
            // 局所 (s, u = |lz| / 半幅) に対するつぼの内側の高さ
            innerY: (s, u) => sy(s) + st(s) * Math.sqrt(Math.max(0, 1 - u * u))
                - sdep(s) * (1 - u * u) + dy
        };
        return mesh;
    }

    function porcelainMaterial(scene, name, albedo) {
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoColor = col3(albedo);
        m.metallic = 0.0;
        m.roughness = 0.42;
        // 【対策】磁器を1枚の PBR で滑らかにすると白い金属板になる。
        //         素地の拡散の上に透明釉の鏡面を重ねる（SKILL 3.1）
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.95;
        m.clearCoat.roughness = 0.055;
        m.clearCoat.indexOfRefraction = 1.51;
        return m;
    }

    // =================================================================
    // 9. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.032, 0.029, 0.026, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    // 【対策】IBL の無彩色成分は全部の材質へ等しく乗るので、少し多いだけで
    //         シーン全体の彩度が落ちる。ただし絞りすぎると白く残った粒の
    //         回り込みが足りなくなって灰色に転ぶ
    scene.environmentIntensity = 0.78;
    // 【対策】ぼかしすぎるとハイライトのコントラストが消えて「艶消しの何か」に
    //         なる。油の照りは環境の明暗が映り込んで初めて出る（SKILL 3.4）
    env.lodGenerationOffset = 0.20;

    // 【対策】広角だと手前のれんげが皿より大きく写り、実寸どおりでも
    //         「長すぎる」絵になる。料理写真は 85〜100mm 相当の望遠で撮る。
    //         距離を伸ばして fov を絞れば、写る範囲は同じまま遠近だけが寝る
    // 【対策】注視点を皿の中心に置くと、手前に添えたれんげが画面の下で
    //         切れる（16:9 で実測 |y| = 1.02）。注視点を手前へ 3.6cm ずらすと、
    //         皿の大きさをほとんど変えずに全部が収まる（同 0.85）
    const camera = new BABYLON.ArcRotateCamera("cam", -1.28, 0.94, 64, new V3(0, 2.3, -3.6), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 3.0;
    camera.fov = 0.360;
    // 【対策】ポストプロセスを通すとシーンは深度つきの RT へ描かれる。
    //         maxZ 既定(10000) のままだと深度の分解能が足りず、粒と具の
    //         前後が勝ったり負けたりしてちらつく（SKILL 4.3）
    camera.minZ = 8.0;
    camera.maxZ = 300;
    camera.lowerRadiusLimit = 22;
    camera.upperRadiusLimit = 190;
    camera.upperBetaLimit = 1.50;      // テーブルの下へ潜らせない
    scene.cameraToUseForPointers = camera;

    // ---- 灯 ----------------------------------------------------------
    const key = new BABYLON.DirectionalLight("key", new V3(-0.42, -0.95, 0.46).normalize(), scene);
    key.position = new V3(16, 34, -20);
    // ★【対策】白く残った粒が灰色に見えるとき、疑うのは露出ではなく照明比
    //   （キー ÷ 回り込み）。ここが開くと、反射率 90% の白でさえ影側が
    //   中間調まで落ちる。露出で持ち上げるとキー正面が先に飽和して階調が
    //   消えるので、比だけを下げる（ご飯.js rice-H の結論）
    key.intensity = 2.05;
    key.diffuse = new BABYLON.Color3(1.0, 0.974, 0.936);
    // 【対策】平行光の影の範囲は既定だとキャスターの AABB にぴったり合う。
    //         すると影の落ちる先（テーブル）が範囲外になり直線でぶつ切りになる
    key.autoUpdateExtends = false;
    key.orthoLeft = -26; key.orthoRight = 26;
    key.orthoBottom = -26; key.orthoTop = 26;
    key.shadowMinZ = 1; key.shadowMaxZ = 90;

    // 【対策】平行光のハイライトは1点しか出ない。油をまとった粒に何百と
    //         散る照りを作るには、拡散をほぼ 0 にして鏡面だけ足す灯が要る
    //         （SKILL 4.1 のキック）
    const kick = new BABYLON.DirectionalLight("kick", new V3(0.56, -0.36, -1.0).normalize(), scene);
    kick.intensity = 1.60;
    kick.diffuse = new BABYLON.Color3(0.050, 0.046, 0.042);
    kick.specular = new BABYLON.Color3(1.0, 0.968, 0.912);

    // ★ これがレフ板。白い粒の影側を持ち上げるのはここだけ
    const fill = new BABYLON.HemisphericLight("fill", new V3(-0.2, 1, -0.35), scene);
    fill.intensity = 0.78;                 // key/fill = 2.6
    fill.diffuse = new BABYLON.Color3(1.0, 0.988, 0.962);
    fill.groundColor = new BABYLON.Color3(0.30, 0.27, 0.24);
    fill.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    // 【対策】ESM は柔らかいが depthScale を詰めないと痣が出る。cm スケールの
    //         食べ物では PCF に落としたほうが早くきれい（SKILL 4.4）
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0035;
    sg.normalBias = 0.012;
    sg.setDarkness(0.38);

    // ---- テーブル -----------------------------------------------------
    // 【対策】年輪を数本／うねり大で敷くと、周期が数cm の大きな波になり、
    //         木ではなく布か砂紋に見える。実物の卓は線が細く、間隔 5〜10mm で
    //         ほぼ直線に走る
    const tableWood = woodSet(scene, "table", 640, 4177, {
        base: [0.442, 0.330, 0.240], grain: [0.318, 0.222, 0.154],
        dark: [0.222, 0.146, 0.098],
        rings: 24.0, wave: 1.60, sharp: 2.4, knot: 0.32, rough: 0.46, bump: 0.75,
        across: true
    });
    const table = BABYLON.MeshBuilder.CreateGround("table", { width: 320, height: 320 }, scene);
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
    tableMat.bumpTexture.level = 0.28;
    tableMat.clearCoat.isEnabled = true;
    tableMat.clearCoat.intensity = 0.24;
    tableMat.clearCoat.roughness = 0.32;
    for (const t of [tableWood.albedo, tableWood.orm, tableWood.normal]) { t.uScale = 9; t.vScale = 9; }
    table.material = tableMat;
    table.receiveShadows = true;

    // ---- 湯気 ---------------------------------------------------------
    function makeSteamTexture() {
        const N = 128;
        return TexLab._tex("steam", N, N, (d) => {
            for (let y = 0; y < N; y++) {
                for (let x = 0; x < N; x++) {
                    const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
                    const r = Math.hypot(u, v);
                    // 【対策】単純な放射状グラデーションだと、粒が丸い光の玉に
                    //         見えてホタルになる。ノイズで輪郭を崩す
                    const n = Noise.fbm2p(x / N * 6, y / N * 6, 6, 6, 4242, 3);
                    const a = clamp((1 - smooth(0.15, 1.0, r)) * (0.35 + 0.9 * n), 0, 1);
                    const i = (y * N + x) * 4;
                    d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = a * 255;
                }
            }
        }, scene, false, true);
    }
    const steamTex = makeSteamTexture();
    const steam = new BABYLON.ParticleSystem("steam", 240, scene);
    steam.particleTexture = steamTex;
    steam.emitter = new V3(0, GLOBAL.wellY + 3.4, 0);
    steam.minEmitBox = new V3(-3.2, 0, -3.2);
    steam.maxEmitBox = new V3(3.2, 0.4, 3.2);
    // 【対策】加算合成にすると湯気が発光して見える。湯気は光っていない
    steam.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    steam.color1 = new BABYLON.Color4(1, 1, 1, 0.050);
    steam.color2 = new BABYLON.Color4(1, 0.985, 0.96, 0.026);
    steam.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    steam.minSize = 2.2; steam.maxSize = 7.0;
    steam.minLifeTime = 1.4; steam.maxLifeTime = 3.2;
    steam.emitRate = 42;
    steam.gravity = new V3(0, 2.6, 0);
    steam.direction1 = new V3(-0.7, 3.2, -0.4);
    steam.direction2 = new V3(0.9, 5.0, 0.5);
    steam.minAngularSpeed = -0.5; steam.maxAngularSpeed = 0.5;
    steam.minEmitPower = 0.5; steam.maxEmitPower = 1.5;
    steam.updateSpeed = 0.012;

    // =================================================================
    //  組み立て / 差し替え
    // =================================================================
    let currentStyle = START.style, currentMound = START.mound,
        currentPlate = START.plate, currentSeed = START.seed >>> 0;
    let state = null, onRebuilt = null, buildNo = 0;

    const live = {
        season: STYLES[START.style].season,
        seasonSd: STYLES[START.style].seasonSd,
        eggMix: STYLES[START.style].eggMix,
        tint: 1.0,          // 粒の色づきの強さ（0 で白飯に戻る＝切り分け用）
        ao: 1.0,
        oil: 1.0
    };

    // テクスチャの作り直しは重いので、米と皿はキャッシュする
    const grainTexCache = {};
    function getGrainTex() {
        if (!grainTexCache.t) grainTexCache.t = riceTextures(scene, RICE, 0x9911);
        return grainTexCache.t;
    }
    const plateMatCache = {};
    function getPlateMat(k) {
        if (!plateMatCache[k]) plateMatCache[k] = plateMaterial(scene, PLATES[k], plateLoop(), 4001);
        return plateMatCache[k];
    }

    function disposeState(st) {
        if (!st) return;
        for (const n of st.instances) n.dispose();
        for (const m of st.meshes) if (m) m.dispose(false, false);
        for (const m of st.mats) if (m) m.dispose(true, false);
    }

    function build() {
        buildNo++;
        const seed = currentSeed >>> 0;
        const M = MOUNDS[currentMound];
        const ST = Object.assign({}, STYLES[currentStyle], {
            season: live.season, seasonSd: live.seasonSd, eggMix: live.eggMix
        });
        const meshes = [], mats = [], instances = [];
        disposeState(state);
        state = null;
        // 【対策】renderList を空にしてから足し直さないと、炒め直すたびに
        //         過去のメッシュが残り、消えたはずの物の影が落ちる
        const smap = sg.getShadowMap();
        if (smap && smap.renderList) smap.renderList.length = 0;

        // ---- 1. 皿 -----------------------------------------------------
        const plateMat = getPlateMat(currentPlate);
        const plate = buildPlate(scene, plateMat, seed);
        meshes.push(plate);

        // ---- 2. 盛りの下地 ----------------------------------------------
        // 【対策】下地に粒と同じマテリアルを貼ると、油膜がなめらかな一枚面の
        //         上でそのまま鏡面になり、粒のすき間が「濡れた床」に見える。
        //         下地は谷の底なので、艶も透光も要らない。ごはんでは 0.86 倍に
        //         留めるのが正解だったが、チャーハンは粒が離れていて奥が
        //         深いので、はっきり落として谷を作る
        const bodyMat = new BABYLON.PBRMaterial("riceBodyMat", scene);
        bodyMat.albedoColor = col3([
            TONE.mid[0] * 0.44, TONE.mid[1] * 0.40, TONE.mid[2] * 0.36]);
        bodyMat.metallic = 0.0;
        bodyMat.roughness = 0.88;
        bodyMat.clearCoat.isEnabled = false;
        bodyMat.subSurface.isTranslucencyEnabled = false;
        const body = buildRiceBody(scene, M, seed, bodyMat);
        meshes.push(body); mats.push(bodyMat);
        sg.addShadowCaster(body);
        sg.addShadowCaster(plate);

        // ---- 3. 炒り卵とチャーシュー ------------------------------------
        // 【対策】具を粒の上に「置く」と、必ず下から粒が突き刺さって
        //         「ごはんに刺さった卵」になる。福神漬け（カレー.js）で
        //         踏んだのと同じ罠。ここでは具を先に決め、その足もとの粒を
        //         間引く。物理を回さずに、具が飯の中へ埋まっている絵が出る
        const eggMat = flakeMaterial(scene, "eggMat", 0.66, 0.26, 0.40, [0.94, 0.72, 0.24]);
        const porkMat = flakeMaterial(scene, "porkMat", 0.80, 0.21, 0.26, [0.72, 0.34, 0.26]);
        mats.push(eggMat, porkMat);
        const discs = [];
        const prng = new Rng((seed ^ 0x3E66) >>> 0);
        const pieceKinds = [];
        for (let i = 0; i < ST.egg; i++) pieceKinds.push("egg");
        for (let i = 0; i < ST.pork; i++) pieceKinds.push("pork");
        let pieceTris = 0;
        for (let i = 0; i < pieceKinds.length; i++) {
            const kind = pieceKinds[i];
            const P = (kind === "egg") ? EGG : PORK;
            // 黄金角で回すと、少ない個数でも偏らない
            const th = (i * 2.39996 + prng.range(-0.4, 0.4)) % TAU;
            const u = Math.pow(prng.range(0.02, 1.0), 0.52) * 0.93;
            const x = M.ax * u * Math.cos(th), z = M.az * u * Math.sin(th);
            const my = moundY(x, z, M, seed);
            if (my < -1e8) continue;
            const g = buildFlakeGeom(P, (seed + i * 7919) >>> 0);
            // 姿勢: 盛りの面に沿わせてから大きめに振る。
            // 【対策】具まで水平に置くと、炒めたのではなく「並べた」絵になる
            const nrm = moundN(x, z, M, seed);
            const axis = V3.Cross(new V3(0, 1, 0), nrm);
            const len = axis.length();
            let q = (len < 1e-5) ? BABYLON.Quaternion.Identity()
                : BABYLON.Quaternion.RotationAxis(axis.scale(1 / len), Math.asin(clamp(len, -1, 1)));
            const spin = BABYLON.Quaternion.RotationAxis(nrm, prng.range(0, TAU));
            let rv = new V3(prng.gauss(0, 1), prng.gauss(0, 1), prng.gauss(0, 1));
            if (rv.lengthSquared() < 1e-8) rv = new V3(1, 0, 0);
            rv.normalize();
            const tilt = BABYLON.Quaternion.RotationAxis(rv, prng.gauss(0, 0.52));
            q = tilt.multiply(spin.multiply(q));
            const ex = extremaUnder(g.positions, g.nV, q);
            // 粒の層（＝盛りの面から最大 grainLift だけ上）のどこへ埋めるか
            const sink = prng.range(-0.10, 0.34);
            const bottom = my + 0.10 - sink;
            const mesh = makeMesh(kind, g.positions, g.indices, g.normals, g.uvs, g.colors, scene);
            mesh.material = (kind === "egg") ? eggMat : porkMat;
            mesh.rotationQuaternion = q;
            mesh.position.set(x, bottom - ex.lo, z);
            mesh.receiveShadows = true;
            sg.addShadowCaster(mesh);
            meshes.push(mesh);
            pieceTris += mesh.tris;
            // 【対策】間引く半径を外接円そのものにすると、多角形の凹んだ所に
            //         粒のない空白ができて下地が覗く。0.82 倍に詰めて、
            //         多少の突き刺さりは許すほうが絵としては正しい
            discs.push({ x: x, z: z, r: ex.rad * 0.82, y: bottom - 0.05 });
        }

        // ---- 4. 米粒 -----------------------------------------------------
        const gtex = getGrainTex();
        const grainMat = riceMaterial(scene, RICE, gtex, "grainMat");
        grainMat.clearCoat.intensity = live.oil;
        mats.push(grainMat);
        const pts = bakeGrainTint(bakeAO(placeGrains(M, ST, seed), M, seed), ST, seed);
        const variants = [];
        for (let vi = 0; vi < GLOBAL.grainVariants; vi++) {
            const gv = buildGrainVertexData(RICE, (seed + vi * 1013) >>> 0,
                GLOBAL.grainRings, GLOBAL.grainSides);
            const m = named(new BABYLON.Mesh("grain" + vi, scene), "grain" + vi);
            gv.vd.applyToMesh(m, false);
            m.hasVertexAlpha = false;
            m.material = grainMat;
            m.tris = gv.info.tris;
            // 【対策】インスタンスを作るメッシュに registerInstancedBuffer した
            //         うえで、親自身にも既定値を入れておくこと。入れないと
            //         描画時に色が渡らず真っ黒になる
            m.registerInstancedBuffer("color", 4);
            m.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
            m.isVisible = false;                 // 親は隠してインスタンスだけ出す
            variants.push(m);
            meshes.push(m);
        }
        const rng2 = new Rng((seed ^ 0x2C3D) >>> 0);
        const nodes = [];
        let culled = 0;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            let hide = false;
            for (const d of discs) {
                if (p.y > d.y && (p.x - d.x) * (p.x - d.x) + (p.z - d.z) * (p.z - d.z) < d.r * d.r) {
                    hide = true; break;
                }
            }
            if (hide) { culled++; continue; }
            const variant = variants[i % variants.length];
            // 【対策】インスタンス名を "g"+i だけにすると、炒め直すたびに同じ id が
            //         生えて Scene Explorer の Picker が過去の個体へ当たる
            const node = variant.createInstance("g" + buildNo + "_" + i);
            node.position.set(p.x, p.y, p.z);
            // ★【対策】ここがパラパラの本体。炊いたごはんは表面張力で盛りの面に
            //   沿って寝るので「法線に揃えて ±0.26rad」でよかったが、炒めた飯は
            //   油で一粒ずつ剥離していて、向きに相関が無い。完全な乱数から
            //   ごく弱く水平へ引き戻す形にする。ここを揃えると、色をどれだけ
            //   散らしてもパラパラにならない
            const nrm = moundN(p.x, p.z, M, seed);
            const spin = BABYLON.Quaternion.RotationAxis(nrm, rng2.range(0, TAU));
            let rv = new V3(rng2.gauss(0, 1), rng2.gauss(0, 1), rng2.gauss(0, 1));
            if (rv.lengthSquared() < 1e-8) rv = new V3(1, 0, 0);
            rv.normalize();
            const tilt = BABYLON.Quaternion.RotationAxis(rv, rng2.gauss(0, 0.95));
            node.rotationQuaternion = tilt.multiply(spin);
            // 【対策】全粒が同じ縦横比だと整った工業製品に見える。炒めると
            //         砕けた粒も混じる
            const broken = rng2.next() < 0.14;
            node.scaling.set(
                broken ? rng2.range(0.58, 0.80) : rng2.range(0.92, 1.08),
                rng2.range(0.94, 1.06), rng2.range(0.94, 1.06));
            node.instancedBuffers.color = grainColor(p.tint, p.ao, live.ao, live.tint);
            p.node = node;
            nodes.push(node);
            instances.push(node);
        }

        // ---- 5. 粒の上端の格子 -------------------------------------------
        // 【対策】ねぎと胡椒を「盛りの面 ＋ 半粒」で座らせると必ず沈む。
        //         粒は面から最大 grainLift だけ浮いているうえ、大きく起こした
        //         粒は中心から 2.8mm 上へ出る。式で見積もらず、置いた粒の姿勢から
        //         上端を実測して格子へ焼く（カレー.js で踏んだ罠）
        const GT_CELL = 0.30, GT_OFF = 4096;
        const GT_KEY = (i, j) => (i + GT_OFF) * 100003 + (j + GT_OFF);
        const grainTop = new Map();
        {
            const m4 = BABYLON.Matrix.Identity();
            const hx = RICE.lengthMM * MM * 0.5;
            const hy = RICE.heightMM * MM * 0.5;
            const hz = RICE.widthMM * MM * 0.5;
            for (const nd of nodes) {
                BABYLON.Matrix.FromQuaternionToRef(nd.rotationQuaternion, m4);
                const sc = nd.scaling, Mm = m4.m;
                // 回転した直方体の上端 = Σ |M(y行, j)| × 半径_j
                const rise = Math.abs(Mm[1]) * hx * sc.x
                    + Math.abs(Mm[5]) * hy * sc.y
                    + Math.abs(Mm[9]) * hz * sc.z;
                const top = nd.position.y + rise;
                const k = GT_KEY(Math.floor(nd.position.x / GT_CELL),
                    Math.floor(nd.position.z / GT_CELL));
                const cur = grainTop.get(k);
                if (cur === undefined || top > cur) grainTop.set(k, top);
            }
        }
        // 【対策】近傍 3×3 を一律に見ると、±0.7cm 先に立った1粒の高さまで
        //         ねぎが持ち上がって宙に浮く。見るのは「その片が実際に
        //         かぶさる範囲」だけにする。格子は粒の中心しか持っていないので、
        //         半粒ぶん（0.12cm）だけ広げて引く
        // 【対策2】範囲を絞ってもなお浮いた。格子は 0.30cm 角で、各マスに
        //         入った粒の「最も高い1粒」しか持っていない。その最大値を
        //         さらに範囲内で最大で引くと、1cm² の中で一番立っている粒の
        //         てっぺんへ座らせることになる（＝必ず浮く）。分位点で引き、
        //         周りの粒に埋もれる高さへ落とす
        const GT_TMP = [];
        const grainTopIn = (x, z, rad, q) => {
            const R = rad + 0.12;
            const i0 = Math.floor((x - R) / GT_CELL), i1 = Math.floor((x + R) / GT_CELL);
            const j0 = Math.floor((z - R) / GT_CELL), j1 = Math.floor((z + R) / GT_CELL);
            GT_TMP.length = 0;
            let m = -1e9;
            for (let i = i0; i <= i1; i++) {
                for (let j = j0; j <= j1; j++) {
                    const v = grainTop.get(GT_KEY(i, j));
                    if (v === undefined) continue;
                    if (v > m) m = v;
                    GT_TMP.push(v);
                }
            }
            if (GT_TMP.length === 0) return -1e9;
            if (q === undefined || q >= 1 || GT_TMP.length < 3) return m;
            GT_TMP.sort((a, b) => a - b);
            const k = Math.min(GT_TMP.length - 1,
                Math.max(0, Math.round(q * (GT_TMP.length - 1))));
            return GT_TMP[k];
        };

        // ---- 6. 小口ねぎ -------------------------------------------------
        const negiMat = negiMaterial(scene); mats.push(negiMat);
        const negiVars = [];
        for (let vi = 0; vi < 10; vi++) {
            const g = buildNegiGeom((seed + vi * 3517) >>> 0);
            const m = makeMesh("negi" + vi, g.positions, g.indices, g.normals, g.uvs, g.colors, scene);
            m.material = negiMat;
            m.isVisible = false;
            m.geom = g;
            negiVars.push(m); meshes.push(m);
        }
        const nrng = new Rng((seed ^ 0x9E17) >>> 0);
        let negiShown = 0;
        for (let i = 0; i < ST.negi; i++) {
            // 【対策】ねぎを全体へ均一に散らすと「ふりかけ」になる。実物は
            //         天盛り（山の上へこんもり）＋ 混ぜ込みで、割合はおよそ半々
            const onTop = nrng.next() < 0.46;
            let x, z;
            if (onTop) {
                const a = nrng.range(0, TAU), r = 1.55 * Math.sqrt(nrng.next());
                x = Math.cos(a) * r; z = Math.sin(a) * r;
            } else {
                const a = nrng.range(0, TAU), u = Math.pow(nrng.next(), 0.5) * 0.92;
                x = M.ax * u * Math.cos(a); z = M.az * u * Math.sin(a);
            }
            const v = negiVars[nrng.int(negiVars.length)];
            // 【対策】輪の軸を鉛直に固定したまま撒くと、45°ある山の斜面では
            //         輪の片側が飯へ食い込み、反対側が大きく浮く。斜面の法線
            //         へ寝かせてから、ばらつきを足す（振れも 0.85→0.42rad へ）
            const nrm = moundN(x, z, M, seed);
            let qs;
            {
                const ax = new V3(nrm.z, 0, -nrm.x);   // (0,1,0) × n
                const sl = Math.hypot(ax.x, ax.z);
                if (sl < 1e-6) qs = BABYLON.Quaternion.Identity();
                else {
                    ax.x /= sl; ax.z /= sl;
                    qs = BABYLON.Quaternion.RotationAxis(ax,
                        Math.acos(clamp(nrm.y, -1, 1)));
                }
            }
            const q = BABYLON.Quaternion.RotationYawPitchRoll(
                nrng.range(0, TAU), nrng.gauss(0, 0.42), nrng.gauss(0, 0.42))
                .multiply(qs);
            // 【対策】傾けたぶんの持ち上げを式で見積もると必ず足りず、
            //         ねぎが粒に食い込む。姿勢を掛けた実測の最下点を、
            //         粒の上端へ合わせる（カレー.js の福神漬けと同じ罠）
            const sc = nrng.range(0.85, 1.18);
            const ex = extremaUnder(v.geom.positions, v.geom.nV, q);
            // 【対策】見るのは「その片の真下」だけ。ex.rad まで広げると、
            //         0.5cm 先に立った1粒のてっぺんへ持ち上がって浮く。
            //         さらに半粒ぶん（0.06cm）沈める：小口ねぎは飯の上に
            //         「載る」のではなく、粒の間に「挟まる」
            const gt = grainTopIn(x, z, 0.10);
            if (gt < -1e8) continue;
            const node = v.createInstance("n" + buildNo + "_" + i);
            node.rotationQuaternion = q;
            node.position.set(x, gt - 0.06 - ex.lo * sc, z);
            node.scaling.setAll(sc);
            instances.push(node);
            negiShown++;
        }

        // ---- 7. 黒胡椒 ---------------------------------------------------
        const pepMat = pepperMaterial(scene); mats.push(pepMat);
        const pepSrc = BABYLON.MeshBuilder.CreateSphere("pepper",
            { diameter: 0.085, segments: 5 }, scene);
        named(pepSrc, "pepper");
        pepSrc.material = pepMat;
        pepSrc.isVisible = false;
        meshes.push(pepSrc);
        const perng = new Rng((seed ^ 0x51A7) >>> 0);
        for (let i = 0; i < ST.pepper; i++) {
            const a = perng.range(0, TAU), u = Math.pow(perng.next(), 0.45) * 0.95;
            const x = M.ax * u * Math.cos(a), z = M.az * u * Math.sin(a);
            const gt = grainTopIn(x, z, 0.05, 0.6);
            if (gt < -1e8) continue;
            const node = pepSrc.createInstance("p" + buildNo + "_" + i);
            node.position.set(x, gt - 0.01, z);
            node.scaling.set(perng.range(0.6, 1.5), perng.range(0.5, 1.2), perng.range(0.6, 1.5));
            instances.push(node);
        }

        // ---- 8. れんげ ---------------------------------------------------
        let renge = null;
        if (GLOBAL.renge) {
            const rMat = porcelainMaterial(scene, "rengeMat", [0.868, 0.864, 0.852]);
            mats.push(rMat);
            // 【対策】皿は八角なので、外周は辺で 11.0cm・角で 11.7cm ある。
            //         丸皿のつもりで 12cm の所へ置くと、角の1枚だけが
            //         れんげへ食い込む。軸までの最短距離で見て余裕を取る
            // 向きは画面の左右で反転（柄が右、つぼが左）。カメラの右方向
            // (0.9580, 0, 0.2867) を法線とする鉛直面で、位置と軸を鏡映した値。
            // れんげは長軸まわりに左右対称なので、鏡像は回転で表せる
            renge = buildRenge(scene, 0.5945, -14.6980, -2.8600, rMat, seed);
            meshes.push(renge); sg.addShadowCaster(renge);
            if (GLOBAL.rengeRice) {
                const B = renge.bowl;
                const ca = Math.cos(B.ang), sa = Math.sin(B.ang);
                const cxB = (B.sC - 0.5) * B.L;
                // つぼは長円なので、盛りも軸方向に長い楕円にする
                const AX = 2.10, AZ = 1.62, PEAK = 1.75;
                const n = Math.round(Math.PI * AX * AZ * 1.3 * GLOBAL.grainDensity * 0.95);
                const srng = new Rng((seed ^ 0x77A3) >>> 0);
                const spts = [];
                // 粒の半径（ローカル）。姿勢を掛けた実寸はこれ以下に収まる
                const gHX = RICE.lengthMM * MM * 0.5;
                const gHY = RICE.heightMM * MM * 0.5;
                const gHZ = RICE.widthMM * MM * 0.5;
                // 【対策】粒の「中心」だけを内側の面より上に置いていたので、
                //         椀形の壁ぎわで粒の端が殻を突き抜け、れんげの外側へ
                //         白い飯粒がはみ出していた。中心ではなく、粒が占める
                //         範囲そのものを見る：足もと（半径 rH）の内面のうち
                //         最も高い所を拾い、そこへ粒の下端（rV）を乗せる
                const innerMaxUnder = (lx, lz, rH) => {
                    let m = -1e9;
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dz = -1; dz <= 1; dz++) {
                            const ax = lx + dx * rH, az = lz + dz * rH;
                            const ss = ax / B.L + 0.5;
                            const ww = B.width(ss);
                            if (!(ww > 0.06)) return 1e9;   // つぼの外／先端の外
                            const uu2 = Math.abs(az) / ww;
                            if (uu2 > 1.0) return 1e9;      // 側壁の外
                            const v = B.innerY(ss, uu2);
                            if (v > m) m = v;
                        }
                    }
                    return m;
                };
                const m4s = BABYLON.Matrix.Identity();
                for (let i = 0; i < n; i++) {
                    const ur = Math.pow((i + 0.5) / n, 0.45) * srng.range(0.90, 1.04);
                    const a = srng.range(0, TAU);
                    const lx = cxB + AX * ur * Math.cos(a), lz = AZ * ur * Math.sin(a);
                    const s = lx / B.L + 0.5;
                    const w = B.width(s);
                    // 【対策】つぼの先は幅が 0 へ絞れている。楕円で撒いた点を
                    //         そのまま使うと、先端の外へ粒がこぼれる
                    if (w < 0.30) continue;
                    const uu = Math.abs(lz) / w;
                    if (uu > 0.86) continue;
                    // 姿勢を先に決める。突き抜けの余裕は姿勢で変わるため
                    let rv = new V3(srng.gauss(0, 1), srng.gauss(0, 1), srng.gauss(0, 1));
                    if (rv.lengthSquared() < 1e-8) rv = new V3(1, 0, 0);
                    rv.normalize();
                    const gq = BABYLON.Quaternion.RotationAxis(rv, srng.gauss(0, 0.95));
                    const gsc = srng.range(0.92, 1.06);
                    BABYLON.Matrix.FromQuaternionToRef(gq, m4s);
                    const Mm = m4s.m;
                    // 回転した直方体の、鉛直方向と水平方向の半径
                    const rV = (Math.abs(Mm[1]) * gHX + Math.abs(Mm[5]) * gHY
                        + Math.abs(Mm[9]) * gHZ) * gsc;
                    const rHx = (Math.abs(Mm[0]) * gHX + Math.abs(Mm[4]) * gHY
                        + Math.abs(Mm[8]) * gHZ) * gsc;
                    const rHz = (Math.abs(Mm[2]) * gHX + Math.abs(Mm[6]) * gHY
                        + Math.abs(Mm[10]) * gHZ) * gsc;
                    const rH = Math.max(rHx, rHz);
                    const inner = innerMaxUnder(lx, lz, rH);
                    if (inner > 1e8) continue;              // 足もとが殻の外へ出る
                    const dome = B.floor + PEAK * Math.pow(Math.max(0, 1 - ur * ur), 0.85);
                    // 殻へ乗せる（沈めない）。縁の近くでは内側の面が上がって
                    // くるので、そちらが勝つ（＝縁に沿って盛り上がる）
                    const y = Math.max(inner + rV + 0.012, dome - srng.range(0, 0.09));
                    spts.push({
                        x: B.ox + lx * ca - lz * sa, z: B.oz + lx * sa + lz * ca, y: y,
                        ao: 0.70 + 0.30 * (1 - ur), u: ur, spoon: true, q: gq, sc: gsc
                    });
                }
                bakeGrainTint(spts, ST, (seed ^ 0x1234) >>> 0);
                for (let i = 0; i < spts.length; i++) {
                    const p = spts[i];
                    const variant = variants[i % variants.length];
                    const node = variant.createInstance("sg" + buildNo + "_" + i);
                    node.position.set(p.x, p.y, p.z);
                    node.rotationQuaternion = p.q;
                    node.scaling.setAll(p.sc);
                    node.instancedBuffers.color = grainColor(p.tint, p.ao, live.ao, live.tint);
                    p.node = node;
                    instances.push(node);
                    pts.push(p);          // 色スライダーで一緒に動かす
                }
            }
        }

        state = {
            meshes, mats, instances, plate, body, variants, nodes, pts,
            M, ST, culled, pieceTris, negiShown, grainMat
        };
        if (onRebuilt) onRebuilt(state);
        return state;
    }

    // 粒の色だけ焼き直す（メッシュには触らない）。
    // 味の濃さ・ばらつき・卵のからみ・暗がりは、これで実時間に切り替わる
    function applyGrainColor(retint) {
        if (!state) return;
        if (retint) {
            const ST = { season: live.season, seasonSd: live.seasonSd, eggMix: live.eggMix };
            for (const p of state.pts) {
                let t = ST.season + ((p.cl - 0.5) * 1.55 + (p.rn - 0.5) * 1.15) * ST.seasonSd;
                t = clamp(t, 0, 1);
                let c = tintRamp(t);
                if (p.eggR < ST.eggMix) c = mix3(c, TONE.egg, p.eggK);
                if (p.charR < 0.035) c = mix3(c, TONE.char, p.charK);
                p.tint = c; p.t = t;
            }
        }
        for (const p of state.pts) {
            if (!p.node) continue;
            p.node.instancedBuffers.color = grainColor(p.tint, p.ao, live.ao, live.tint);
        }
    }

    // =================================================================
    //  ポストプロセス
    // =================================================================
    let ssao = null;
    if (GLOBAL.useSSAO) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        // 【対策】半径を粒の幅（約0.3cm）に近づけると、粒という粒の輪郭に
        //         黒い縁がついて全体が汚れる。粒どうしの陰りは焼いた擬似AOの
        //         担当で、SSAO は皿と盛りの境目のような大きい陰りだけを拾う
        ssao.radius = 1.25;
        ssao.totalStrength = 0.32;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 240;
        ssao.minZAspect = 0.25;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.90;
    dp.bloomWeight = 0.13;
    dp.bloomKernel = 44;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.18;
    dp.depthOfFieldEnabled = GLOBAL.useDOF;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.High;
    dp.depthOfField.lensSize = 50;
    dp.depthOfField.fStop = GLOBAL.dofFStop;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    // 【対策】黒い器と白く残った粒を1枚に収めるので、露出を上げると粒が飛び、
    //         下げると器が潰れる。露出は控えめにして、締めるのはビネットに任せる
    //         （コントラストで締めると白い粒がまた灰色へ戻る）
    ip.exposure = 1.14;
    ip.contrast = 1.06;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.25;
    ip.vignetteCameraFov = 0.72;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    scene.onBeforeRenderObservable.add(() => {
        if (!dp.depthOfFieldEnabled) return;
        // 【対策】Babylon の錯乱円は「シーン単位 × 1000 = mm」で計算される。
        //         focalLength を合焦距離の一定比にすると focus が約分され、
        //         寄っても引いてもボケ量が変わらない（SKILL 4.3）
        const focus = camera.radius * 1000;
        dp.depthOfField.focusDistance = focus;
        dp.depthOfField.focalLength = focus * GLOBAL.dofRatio;
    });

    // =================================================================
    // 10. GUI
    // =================================================================
    // 【対策】フルスクリーン GUI を既定のままにすると Bloom / 被写界深度 /
    //         シャープンが UI にも乗ってボケる。定石は layerMask で GUI 専用
    //         カメラへ分けることだが、それをやると Inspector が3系統まとめて
    //         壊れる（Physics Helper / 選択ハイライト / ピッカー）。
    //         Layer.applyPostProcess = false なら2台目を作らずに済む（SKILL 6.1）
    const GUI_MASK = 0x20000000;
    let guiCam = null;

    function bindDebugCamera(sc, mainCam) {
        const ULR = BABYLON.UtilityLayerRenderer;
        if (ULR && ULR.prototype && !ULR.prototype.__chahanPatched) {
            const orig = ULR.prototype.getRenderCamera;
            ULR.prototype.getRenderCamera = function (getDefault) {
                if (this._renderCamera) return this._renderCamera;
                const s = this.originalScene || this.utilityLayerScene;
                if (s && s.__debugMainCamera) return s.__debugMainCamera;
                return orig.call(this, getDefault);
            };
            ULR.prototype.__chahanPatched = true;
        }
        sc.__debugMainCamera = mainCam;
        // 【対策】scene.pick() を camera 引数なしで呼ぶと createPickingRay の
        //         中で scene.activeCamera が使われる。描画ループが
        //         activeCameras を順に代入するので、終わった時点では guiCam が
        //         残っている。毎フレーム戻す
        sc.onAfterRenderObservable.add(() => { sc.activeCamera = mainCam; });
        sc.cameraToUseForPointers = mainCam;
    }

    if (GLOBAL.guiOwnCamera) {
        guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -60), scene);
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
    // 【対策】Babylon.GUI のサイズ指定はレンダー解像度基準（≒ CSS px × DPR）。
    //         DPR 3 の端末では 32px のボタンが実質 11 CSS px になる（SKILL 6.2）
    ui.idealWidth = 1400;
    ui.renderAtIdealSize = true;

    const COL = {
        idle: "#2b2723", active: "#8a5e22", edge: "#4a443b",
        text: "#f5ecdf", sub: "#aaa093", accent: "#f2c684"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "268px";
    card.height = "90%";
    card.cornerRadius = 10;
    card.thickness = 1;
    card.color = COL.edge;
    card.background = "rgba(18,16,14,0.85)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "16px";
    ui.addControl(card);

    const sv = new BABYLON.GUI.ScrollViewer("sv");
    sv.thickness = 0;
    sv.barSize = 10;
    sv.barColor = COL.edge;
    sv.barBackground = "rgba(0,0,0,0)";
    sv.wheelPrecision = 0.02;
    card.addControl(sv);

    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "230px";
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
        s.color = COL.accent; s.background = "#3a332b"; s.borderColor = "transparent";
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
    const f1 = (v) => v.toFixed(1);

    addLabel("FRIED RICE / チャーハン", 11, COL.sub, "26px");

    const styleBtns = {}, moundBtns = {}, plateBtns = {};
    function highlight() {
        for (const k in styleBtns) styleBtns[k].background = (k === currentStyle) ? COL.active : COL.idle;
        for (const k in moundBtns) moundBtns[k].background = (k === currentMound) ? COL.active : COL.idle;
        for (const k in plateBtns) plateBtns[k].background = (k === currentPlate) ? COL.active : COL.idle;
    }

    let sSeason = null, sSd = null, sEgg = null;
    addLabel("味つけ", 13, COL.accent, "22px");
    for (const k of Object.keys(STYLES)) {
        styleBtns[k] = addButton("s_" + k, STYLES[k].label, () => {
            currentStyle = k;
            live.season = STYLES[k].season;
            live.seasonSd = STYLES[k].seasonSd;
            live.eggMix = STYLES[k].eggMix;
            if (sSeason) sSeason.slider.value = live.season;
            if (sSd) sSd.slider.value = live.seasonSd;
            if (sEgg) sEgg.slider.value = live.eggMix;
            build(); highlight();
        });
    }
    addLabel("盛り", 13, COL.accent, "22px");
    for (const k of Object.keys(MOUNDS)) {
        moundBtns[k] = addButton("m_" + k, MOUNDS[k].label, () => {
            currentMound = k; build(); highlight();
        });
    }
    addLabel("器", 13, COL.accent, "22px");
    for (const k of Object.keys(PLATES)) {
        plateBtns[k] = addButton("p_" + k, PLATES[k].label, () => {
            currentPlate = k; build(); highlight();
        });
    }

    addSpacer();
    addButton("reseed", "炒め直す", () => {
        currentSeed = (currentSeed * 1664525 + 1013904223) >>> 0;
        build();
    });

    addSpacer();
    // ★ ここがこのシーンの本題のスライダー。
    //   「粒ごとの色のばらつき」を 0 にすると、平均色はそのままなのに
    //   一瞬で「黄色く塗った白飯」になる。チャーハンをチャーハンに
    //   見せているのが何なのかが、これで一目で分かる
    addLabel("粒の色", 13, COL.accent, "22px");
    sSeason = addSlider("味の濃さ", 0.0, 1.0, live.season, f2, (v) => {
        live.season = v; applyGrainColor(true);
    });
    sSd = addSlider("粒ごとのばらつき", 0.0, 0.55, live.seasonSd, f2, (v) => {
        live.seasonSd = v; applyGrainColor(true);
    });
    sEgg = addSlider("卵のからみ", 0.0, 0.80, live.eggMix, f2, (v) => {
        live.eggMix = v; applyGrainColor(true);
    });
    // 0 にすると米のアルベドそのまま＝白飯。切り分け用
    addSlider("色づきの強さ ×", 0.0, 1.30, live.tint, f2, (v) => {
        live.tint = v; applyGrainColor(false);
    });
    addSlider("粒間の暗がり ×", 0.0, 2.0, live.ao, f2, (v) => {
        live.ao = v; applyGrainColor(false);
    });
    // 【対策】照りは clearCoat（油膜）が持っている。ここを 0 にすると
    //         炒めていない飯になり、上げるとギトギトの炒飯になる
    addSlider("油のつや ×", 0.0, 1.60, live.oil, f2, (v) => {
        live.oil = v;
        if (state && state.grainMat) state.grainMat.clearCoat.intensity = v;
    });

    addSpacer();
    addLabel("照明", 13, COL.accent, "22px");
    const lightInfo = addLabel("", 11, COL.sub, "34px");
    function updateLightInfo() {
        lightInfo.text = "  照明比 key/fill = "
            + (key.intensity / Math.max(1e-6, fill.intensity)).toFixed(2)
            + "（白い粒が灰色なら 2〜3 が目安）";
    }
    updateLightInfo();
    addSlider("キーライト", 0.5, 4.0, key.intensity, f2, (v) => {
        key.intensity = v; updateLightInfo();
    });
    addSlider("回り込み（レフ板）", 0.0, 1.6, fill.intensity, f2, (v) => {
        fill.intensity = v; updateLightInfo();
    });
    addSlider("露出", 0.6, 1.8, ip.exposure, f2, (v) => { ip.exposure = v; });
    addSlider("環境光 ×", 0.10, 1.40, scene.environmentIntensity, f2, (v) => {
        scene.environmentIntensity = v;
    });

    addSpacer();
    const steamBtn = addButton("steam", "湯気: ON", () => setSteam(!steam.isStarted()));
    function setSteam(on) {
        if (on) steam.start(); else steam.stop();
        steamBtn.textBlock.text = "湯気: " + (on ? "ON" : "OFF");
        steamBtn.background = on ? COL.active : COL.idle;
    }
    setSteam(true);

    const kickBtn = addButton("kick", "照り足し: ON", () => {
        kick.setEnabled(!kick.isEnabled());
        kickBtn.textBlock.text = "照り足し: " + (kick.isEnabled() ? "ON" : "OFF");
        kickBtn.background = kick.isEnabled() ? COL.active : COL.idle;
    });
    kickBtn.background = COL.active;

    const rengeBtn = addButton("renge", "れんげ: ON", () => {
        GLOBAL.renge = !GLOBAL.renge;
        rengeBtn.textBlock.text = "れんげ: " + (GLOBAL.renge ? "ON" : "OFF");
        rengeBtn.background = GLOBAL.renge ? COL.active : COL.idle;
        build();
    });
    rengeBtn.background = COL.active;

    const rotBtn = addButton("rot", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.08;
        rotBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });

    addSpacer();
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        GLOBAL.useDOF = !GLOBAL.useDOF;
        dp.depthOfFieldEnabled = GLOBAL.useDOF;
        dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
        dofBtn.textBlock.text = "被写界深度: " + (GLOBAL.useDOF ? "ON" : "OFF");
    });
    dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
    addSlider("ぼけ量", 0.01, 0.20, GLOBAL.dofRatio, f2, (v) => { GLOBAL.dofRatio = v; });
    addSlider("F値", 1.2, 11.0, GLOBAL.dofFStop, f1, (v) => { dp.depthOfField.fStop = v; });

    const info = addLabel("", 12, COL.sub, "96px");
    onRebuilt = (st) => {
        let tri = st.plate.tris + st.body.tris + st.pieceTris;
        tri += st.nodes.length * st.variants[0].tris;
        info.text = "米 " + st.nodes.length + " 粒（具に埋めて消したもの "
            + st.culled + "）\n"
            + "ねぎ " + st.negiShown + " 片 / " + st.ST.egg + " 卵 / " + st.ST.pork + " 肉\n"
            + tri.toLocaleString() + " tri\n"
            + "照明比 key/fill: "
            + (key.intensity / Math.max(1e-6, fill.intensity)).toFixed(2) + "\n"
            + "seed: " + currentSeed;
    };

    build();
    highlight();

    console.log("[Chahan] build chahan-2026-09-16-c",
        "| style=" + currentStyle, "| mound=" + currentMound,
        "| 粒 =" + (state ? state.nodes.length : 0),
        "| key/fill=" + (key.intensity / fill.intensity).toFixed(2),
        "| seed=" + currentSeed);

    scene.onDisposeObservable.add(() => {
        disposeState(state);
        if (grainTexCache.t) for (const k in grainTexCache.t) grainTexCache.t[k].dispose();
        for (const k in plateMatCache) {
            const m = plateMatCache[k];
            if (m.texs) for (const t of m.texs) t.dispose();
            m.dispose(true, false);
        }
        for (const t of [tableWood.albedo, tableWood.orm, tableWood.normal]) t.dispose();
        steamTex.dispose();
    });

    return scene;
};

export default createScene;