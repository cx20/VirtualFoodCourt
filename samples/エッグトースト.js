// =====================================================================
//  Photoreal Toast + Fried Egg  /  写実的なトーストと目玉焼き
//                                                   BUILD: eggtoast-C
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  eggtoast-C での変更点（Inspector のデバッグ表示）:
//    ・Physics Helper が何も出ない／Scene Explorer の Picker が当たらない
//      問題の修正。原因は GUI 専用カメラで、activeCameras を 2 台にすると
//      Babylon の各機能が「activeCameras の末尾＝描画の基準カメラ」と
//      見なす所で全部 guiCam を拾ってしまう:
//        ・UtilityLayerRenderer → Physics Helper が出ない／ギズモがずれる
//        ・EffectLayer          → 選択ハイライトが全カメラパスで合成される
//        ・scene.activeCamera   → scene.pick() のレイが guiCam 基準になる
//      Babylon のレイ生成（CreatePickingRayToRef）は
//        camera → scene.activeCamera → scene.cameraToUseForPointers
//      の順に見るので、cameraToUseForPointers を設定していても
//      activeCamera が guiCam なら画面座標が原点前方 -50cm の別カメラで
//      逆投影され、まったく違う所を指す。
//      そもそもカメラを分ける必要が無かった。Layer.applyPostProcess を
//      false にすると前景レイヤーは _afterCameraPostProcessStage で
//      描かれる＝ポストプロセスの後に合成されるので、カメラ1台のまま
//      GUI だけ Bloom / DOF から外せる。guiOwnCamera の既定を false に
//      して、こちらを標準にした（true で従来のカメラ分離に戻る）
//    ・なお他のシーンで見つかった「mesh.id の重複で Picker が別の個体を
//      選ぶ」問題は、このシーンには無い。トースト・白身・黄身・皿が
//      1つずつで、メッシュ名がすべて一意だから。ただし Babylon の Node は
//      コンストラクタで id = name を入れるので、今後 目玉焼きを複数に
//      するなどして同名のメッシュを増やすときは、name と id の両方を
//      必ず一意にすること（name だけ変えても id が元のまま残る）
//    ・版名を toast- から eggtoast- に改めた。素のトースト（toast-B）と
//      系列が重なっていて、どちらの版かログから判別できなかったため
//
//  構成:
//    0. CONFIG      … 焼き加減プリセット（浅め / きつね色 / よく焼き）
//    1. Rng         … シード付き擬似乱数
//    2. Noise       … 2D値ノイズ / 周期ノイズ / 3D値ノイズ
//    3. Mesh utils  … メッシュ生成（巻き順は ComputeNormals で実測済み）
//    4. Field       … スライスの SDF / す（気泡）/ 焦げ / クラスト
//                     （形とテクスチャが参照する唯一の場）
//    5. TextureLab  … 切り口・耳・皿・クロスのアルベド / ORM / 法線
//    6. Toast       … 上面（切り口）+ 耳（周囲のクラスト）+ 底面
//    6b. FriedEgg   … 目玉焼き（白身の二段構造 + 黄身）。トーストに載る
//    7. Table       … 皿 + テーブルクロス
//    8. Scene       … IBL / ライト / 影 / SSAO2 / トーンマッピング
//    9. GUI         … 焼き加減・形・バター・表示モード（Babylon.GUI）
//
//  実物の要点（ここを外すと「茶色い板」になる）:
//    ・焼き色は面に均一に乗らない。トースターの輻射は「出っ張り」に先に
//      当たるので、ちぎれたセル壁の頂だけが色づき、す（穴）の中は白いまま。
//      写真のあの「まだらな斑点」はグラデーションではなく閾値の産物
//    ・焦げは中央が濃く、耳の内側 1〜2cm はほとんど色づかない
//    ・切り口はつるつるではない。1〜3mm の不定形なすが開き、その間の
//      セル壁は刃で毛羽立っている。すの中は暗い（AO が命）
//    ・耳（クラスト）と切り口の境目には、断面として現れた 4〜6mm の
//      золотの帯がある。ここは既に焼けているので追加の焦げは乗らない
//    ・耳の表面は切り口とは別物。すは無く、代わりに水疱と皺がある
//    ・山型食パンの上辺は円弧。角食と違い、肩に段差（切れ込み）が残る
//    ・パンは薄いセル壁の集合体なので、縁がわずかに透ける（弱い SSS）
// =====================================================================

var createScene = function () {

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;
    const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
    const mix = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
    const srgb = (r, g, b) => new BABYLON.Color3(r, g, b).toLinearSpace();

    // =================================================================
    // 0. CONFIG
    // =================================================================
    //  1 unit = 1cm。6枚切り＝厚さ 2.0cm、幅 12.4cm、皿は直径 24cm。
    const PRESETS = {
        // 浅め: 斑点がまばらで、白い部分が主役
        usu: {
            label: "浅め",
            brownTh: 0.700,        // 焼き色が始まる drive の値
            brownSpan: 0.620,      // 大局の勾配の緩さ
            crustDeep: 0.26,       // 耳の焼き込み
            crumbTint: 0.10        // 切り口全体にうっすら乗る温かみ
        },
        // きつね色: 写真のこれ。斑点が全面に散り、まだ地の白が見える
        kitsune: {
            label: "きつね色",
            brownTh: 0.400,
            brownSpan: 0.560,
            crustDeep: 0.48,
            crumbTint: 0.24
        },
        // よく焼き: 斑点がつながって面になり、濃い芯が出る
        yoku: {
            label: "よく焼き",
            brownTh: 0.100,
            brownSpan: 0.680,
            crustDeep: 0.78,
            crumbTint: 0.42
        }
    };

    const GLOBAL = {
        // --- スライス
        halfW: 6.02,             // 左右の半幅
        thickness: 2.00,         // 6枚切り
        edgeRoll: 0.085,         // 切り口と耳の間の丸み（大きいと座布団になる）
        cornerR: 0.45,           // 角の丸み
        bodyBack: -5.70,         // 胴の下辺（皿の手前側）
        bodyFront: 3.30,         // 胴の上辺（山の付け根）
        domeX: -0.30, domeZ: 1.05, domeR: 5.60,   // 山（山型のときだけ）
        shoulderK: 0.95,         // 肩のなじませ（0 だと段差が刃物のように立つ）
        outlineWobble: 0.055,    // 輪郭のゆらぎ（型どおりの矩形にしない）
        sideBulge: 0.0035,       // 耳の中ほどのふくらみ
        crustW: 0.30,            // 切り口に現れる耳の断面の幅
        // --- す。「大きさの違う穴を、それぞれ疎らに」開ける
        // 【対策】ここまで4種類の作り方を試して全部外した。
        //   閾値fbm  → 穴の底も外も平らな二段プラトー（真っ平ら）
        //   高周波ノイズ → 等方の砂嵐（紙やすり）
        //   球冠を密に撒く → プチプチ（気泡緩衝材）
        //   Worley の網目 → ワニ革（大きさの揃ったモザイク）
        //   共通の失敗は「一様な模様で面を埋めた」こと。実物のクラムは
        //   大部分がなだらかで、そこに大きさの桁が違う穴がまばらに開く。
        //   各段の確率を低く保つのが肝で、上げた瞬間に模様になる
        pits: [
            // [セル間隔, 半径min, 半径max, 確率, 深さ]
            [1.30, 0.100, 0.220, 0.20, 0.150],
            [0.58, 0.055, 0.130, 0.34, 0.100],
            // 【対策】この段が「焦げの面に抜ける淡い穴」を作る。密度を
            //         上げても、深さを浅く保てばプチプチにはならない
            [0.200, 0.026, 0.058, 0.80, 0.038]
        ],
        // --- 法線マップの Y の符号（規約が環境で反転することがある）
        normalFlipY: false,
        // --- 分割数
        segAngular: 512, segRadial: 76, segBottom: 26, segSide: 14,
        // --- テクスチャ
        texCrumb: 1280, texCrust: 512, texPlate: 512, texCloth: 512,
        compactWidth: 900,
        // --- 形とバター
        shape: "kaku",           // "yama" = 山型 / "kaku" = 角食
        butter: false,
        // --- GUI / Inspector 対策
        // 【対策】GUI をポストプロセスから外すのに、以前はカメラを2台にして
        //         layerMask で分けていた。しかし activeCameras が2台あると
        //         scene.activeCamera が guiCam を指す瞬間ができ、Inspector の
        //         Physics Helper / ギズモ / 選択ハイライトが狂う。
        //         Layer.applyPostProcess = false なら、カメラ1台のまま
        //         GUI だけ Bloom / DOF の後に合成できる。既定はこちら。
        //         true にすると従来のカメラ分離（＋bindDebugCamera）に戻る
        guiOwnCamera: false,

        // --- 食卓
        showPlate: true, showCloth: true,
        plateR: 12.00,
        // --- 描画
        useSSAO: true, useDOF: true
    };

    const START_PRESET = "kitsune";
    const START_SEED = 20260804;

    function buildConfig(presetKey, seed, shape, butter, flipY) {
        const cfg = Object.assign({}, GLOBAL, PRESETS[presetKey]);
        cfg.preset = presetKey;
        cfg.shape = shape || GLOBAL.shape;
        cfg.butter = !!butter;
        cfg.normalFlipY = !!flipY;
        cfg.seed = seed >>> 0;
        cfg.fieldSeed = (cfg.seed ^ 0x9e3779b9) >>> 0;
        // 【対策】1024×1024 を毎回焼くと 1〜2 秒かかる。狭い画面では
        //         表示サイズに見合わないので落とす
        const vw = (typeof window !== "undefined" && window.innerWidth) || 1280;
        if (vw < GLOBAL.compactWidth) cfg.texCrumb = 768;
        return cfg;
    }


    // =================================================================
    // 0b. CONFIG（目玉焼き）
    // =================================================================
    //  【対策】鍋の上の目玉焼きをそのまま載せると、白身が 12cm あって
    //          12.4cm のトーストからはみ出す。白身だけを一回り小さくし、
    //          黄身は実寸（約4cm）のまま残す。ここを一緒に縮めると
    //          「小さいトーストに小さい卵」になって食品サンプルに見える
    const EGG_PRESETS = {
        hanjuku: {
            label: "半熟",
            yolkFilm: 0.00, yolkWet: 1.00,
            yolkTop: [0.998, 0.845, 0.330],
            yolkMid: [0.980, 0.700, 0.170],
            yolkRim: [0.905, 0.535, 0.095],
            yolkSSS: 0.62, yolkRough: 0.24, yolkBulge: 1.00,
            brown: 0.30, ragged: 0.85, curl: 0.00,
            wet: 1.00, sss: 1.00, bubble: 1.00, whiteWarm: 0.30
        },
        katayaki: {
            label: "固焼き",
            yolkFilm: 0.38, yolkWet: 0.55,
            yolkTop: [0.985, 0.820, 0.375],
            yolkMid: [0.955, 0.685, 0.235],
            yolkRim: [0.875, 0.530, 0.150],
            yolkSSS: 0.28, yolkRough: 0.40, yolkBulge: 0.92,
            brown: 0.62, ragged: 1.00, curl: 0.16,
            wet: 0.72, sss: 0.74, bubble: 0.92, whiteWarm: 0.55
        },
        karikari: {
            label: "カリカリ",
            yolkFilm: 0.52, yolkWet: 0.38,
            yolkTop: [0.960, 0.795, 0.410],
            yolkMid: [0.925, 0.665, 0.290],
            yolkRim: [0.830, 0.510, 0.195],
            yolkSSS: 0.18, yolkRough: 0.50, yolkBulge: 0.84,
            brown: 1.00, ragged: 1.35, curl: 0.42,
            wet: 0.52, sss: 0.58, bubble: 1.25, whiteWarm: 0.85
        }
    };

    const EGG_GLOBAL = {
        whiteRadius: 4.80,       // 差し渡し 約9.6cm（トースト 12.4cm に収まる）
        edgeMin: 0.045, thinH: 0.200,
        // 【対策】鍋の上の値をそのまま持ってくると、白身が高さ 1.3cm の
        //         ドームになって「肉まん」に見える。あれは差し渡し 12cm に
        //         広がった白身の数値で、9.6cm に縮めた分だけ丘も低くする。
        //         実物の目玉焼きは全高 1.5cm ほどしかない
        moundH: 0.550, moundR: 2.95, moundSoft: 1.35, moundPow: 1.15,
        collar: 0.120, bubbleDepth: 0.072,
        yolkRX: 2.06, yolkRZ: 1.96, yolkRY: 0.80,
        yolkX: 0.35, yolkZ: -0.25, yolkY: 0.88,
        moundX: 0.05, moundZ: 0.30,
        segAngular: 512, segRadial: 80,
        yolkSegU: 120, yolkSegV: 84,
        texWhite: 768, texYolk: 512,
        // 底をパンの表面へどれだけ沈めるか（隙間の影を消す）
        sink: 0.030,
        show: true
    };
    const START_EGG = "hanjuku";

    function buildEggConfig(presetKey, seed, flipY) {
        const cfg = Object.assign({}, EGG_GLOBAL, EGG_PRESETS[presetKey]);
        cfg.preset = presetKey;
        cfg.normalFlipY = !!flipY;
        cfg.seed = seed >>> 0;
        cfg.fieldSeed = (cfg.seed ^ 0x5bd1e995) >>> 0;
        return cfg;
    }

    // =================================================================
    // 1. Rng
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

    // =================================================================
    // 2. Noise
    // =================================================================
    const Noise = {
        h2(x, y, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
            return (h >>> 0) / 4294967295;
        },
        h3(x, y, z, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
                ^ Math.imul(z | 0, 1274126177) ^ Math.imul(seed | 0, 2166136261);
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
        // u 方向だけ折り返す（耳の UV は u が周方向で継ぎ目が無い）
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
        // u,v 両方向に折り返す（クロスや皿のようにタイリングするテクスチャ用）
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
        // 気泡を切った断面。ジッター格子に「球冠」を置く
        // 【対策】パンのすをノイズの閾値で作ると、一様な粒状ノイズになって
        //         法線マップが砂嵐になる。実物のすは球状の気泡をナイフで
        //         切った断面で、ふちが急に立ち上がる椀。切る深さも気泡ごとに
        //         違う（掠めただけのものから真っ二つのものまで）
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
        // --- 3D 値ノイズ（黄身の卵黄膜に使う）
        // 【対策】球面 UV の u を周波数に使うと、極で全ての u が 1 点に
        //         収束して模様が放射状の星になる。黄身は真上から見るので
        //         その「ヒトデ」が絵の中央に居座る。ノイズは球面上の
        //         3D 位置で引く必要があり、そのために 3D 版がいる
        h3(x, y, z, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
                ^ Math.imul(z | 0, 1274126177) ^ Math.imul(seed | 0, 2166136261);
            h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
            return (h >>> 0) / 4294967295;
        },
        v3(x, y, z, seed) {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            const xf = x - xi, yf = y - yi, zf = z - zi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
            const H = this.h3;
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
            for (let o = 0; o < oct; o++) {
                s += a * this.v3(x * f, y * f, z * f, seed + o * 137);
                n += a; f *= 2; a *= 0.5;
            }
            return s / n;
        },
        // 泡（目玉焼きの白身）。ジッター格子に椀を置く
        // 【対策】セルノイズの f1 をそのまま閾値にすると、泡が互いに接して
        //         「泡の膜」になる。セルごとに存在確率と半径を持たせ、
        //         半径の外は完全に 0 にすると、疎らに散った独立した泡になる
        bubble(x, z, cell, rMin, rMax, prob, seed) {
            const inv = 1 / cell;
            const gx = Math.floor(x * inv), gz = Math.floor(z * inv);
            let m = 0;
            for (let dz = -1; dz <= 1; dz++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const cx = gx + dx, cz = gz + dz;
                    if (this.h2(cx, cz, seed) > prob) continue;
                    const jx = (cx + 0.15 + 0.70 * this.h2(cx, cz, seed + 13)) * cell;
                    const jz = (cz + 0.15 + 0.70 * this.h2(cx, cz, seed + 29)) * cell;
                    const r = mix(rMin, rMax, this.h2(cx, cz, seed + 41));
                    const ex = x - jx, ez = z - jz;
                    const d = Math.sqrt(ex * ex + ez * ez);
                    if (d >= r) continue;
                    const q = 1 - d / r;
                    const b = q * q * (3 - 2 * q);
                    if (b > m) m = b;
                }
            }
            return m;
        },
        // 水疱（耳の表面）。ジッター格子に椀を置く
        blister(x, y, cell, rMin, rMax, prob, seed) {
            const inv = 1 / cell;
            const gx = Math.floor(x * inv), gy = Math.floor(y * inv);
            let m = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const cx = gx + dx, cy = gy + dy;
                    if (this.h2(cx, cy, seed) > prob) continue;
                    const jx = (cx + 0.15 + 0.70 * this.h2(cx, cy, seed + 13)) * cell;
                    const jy = (cy + 0.15 + 0.70 * this.h2(cx, cy, seed + 29)) * cell;
                    const r = mix(rMin, rMax, this.h2(cx, cy, seed + 41));
                    const ex = x - jx, ey = y - jy;
                    const d = Math.sqrt(ex * ex + ey * ey);
                    if (d >= r) continue;
                    const q = 1 - d / r;
                    const b = q * q * (3 - 2 * q);
                    if (b > m) m = b;
                }
            }
            return m;
        }
    };

    // =================================================================
    // 3. Mesh utils
    //  巻き順は BABYLON.VertexData.ComputeNormals で実測して決めた:
    //    ・上向きのファン        … (中心, j, j+1)
    //    ・上向きのリング四角形  … (内j, 外j, 内j+1) + (内j+1, 外j, 外j+1)
    //    ・下向きはその逆        … (中心, j+1, j) / (内j, 内j+1, 外j) + ...
    //    ・外向きの側面バンド    … (上j, 下j, 上j+1) + (上j+1, 下j, 下j+1)
    // =================================================================
    function makeMesh(name, positions, indices, uvs, scene) {
        const mesh = new BABYLON.Mesh(name, scene);
        const normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices;
        vd.normals = normals; vd.uvs = uvs;
        vd.applyToMesh(mesh, false);
        // 【対策】頂点カラーを stride 4 で入れると hasVertexAlpha が立ち、
        //         不透明なのに透過パスへ回されて深度書き込みが切られる
        mesh.hasVertexAlpha = false;
        // 【対策】接線は入れない。Babylon は接線属性が無いときだけ画面空間の
        //         微分から接線基底を組む。プロジェクト共通の法線マップ規約
        //         （ny = 下 - 上）はその基底に合わせてある
        return mesh;
    }

    // =================================================================
    // 4. Field : スライスの場（形とテクスチャで共有する唯一の真実）
    // =================================================================
    class Field {
        constructor(cfg) {
            this.cfg = cfg;
            const sd = cfg.fieldSeed;

            // --- 輪郭を極座標のテーブルに落とす
            // 【対策】輪郭は SDF（符号付き距離）で定義する。極座標の R(θ) だけで
            //         持つと「縁からの距離」が放射方向の距離になり、角では
            //         斜めに測ってしまう。耳の帯が角だけ太くなって額縁になる
            const K = 2048;
            this.K = K;
            this.RTab = new Float32Array(K);
            this.ATab = new Float32Array(K);      // 周長（耳の UV 用）
            let rMax = 0;
            for (let i = 0; i < K; i++) {
                const a = TAU * i / K;
                const cx = Math.cos(a), cz = Math.sin(a);
                // 二分法。外側は必ず正、原点は必ず負
                let lo = 0, hi = 14;
                for (let k = 0; k < 28; k++) {
                    const m = (lo + hi) * 0.5;
                    if (this.sdf(m * cx, m * cz) < 0) lo = m; else hi = m;
                }
                this.RTab[i] = lo;
                if (lo > rMax) rMax = lo;
            }
            this.rMax = rMax;
            // 【対策】平面 UV の範囲を「中心からの最大半径」で取ると、
            //         正方形に近い形では角までの距離が基準になり、
            //         テクスチャの 4 隅を大きく捨てることになる。
            //         実測で 76px/cm しか出ず、細かい肌理が 7 テクセルを
            //         切って法線がちらついていた。外接矩形で取り直す
            let ax = 0, az = 0;
            for (let i = 0; i < K; i++) {
                const a = TAU * i / K, r = this.RTab[i];
                ax = Math.max(ax, Math.abs(r * Math.cos(a)));
                az = Math.max(az, Math.abs(r * Math.sin(a)));
            }
            this.halfExtent = Math.max(ax, az);
            // 【対策】ATab[(i+1)%K] と書くと、最後の一周ぶんが ATab[0] を
            //         周長で上書きしてしまい、耳の UV が継ぎ目で飛ぶ
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

            this.S = {
                d: 0, pore: 0, relief: 0, crust: 0, brown: 0,
                h: 0, hMacro: 0, hot: 0
            };
        }

        // 角丸長方形の符号付き距離
        _roundRect(x, z, bx, bz, r) {
            const qx = Math.abs(x) - bx + r, qz = Math.abs(z) - bz + r;
            const ax = Math.max(qx, 0), az = Math.max(qz, 0);
            return Math.hypot(ax, az) + Math.min(Math.max(qx, qz), 0) - r;
        }

        // 【対策】山と胴を min() でつなぐと、肩に刃物のような切れ込みが立つ。
        //         実物の山型は肩に段差はあるが丸い。多項式スムーズ min を使う
        _smin(a, b, k) {
            const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
            return mix(b, a, h) - k * h * (1 - h);
        }

        sdf(x, z) {
            const cfg = this.cfg, sd = cfg.fieldSeed;
            let d;
            if (cfg.shape === "yama") {
                const zc = (cfg.bodyBack + cfg.bodyFront) * 0.5;
                const bz = (cfg.bodyFront - cfg.bodyBack) * 0.5;
                d = this._roundRect(x, z - zc, cfg.halfW, bz, cfg.cornerR);
                const dd = Math.hypot(x - cfg.domeX, z - cfg.domeZ) - cfg.domeR;
                d = this._smin(d, dd, cfg.shoulderK);
            } else {
                // 角食: 天面も胴と同じ高さ。ほぼ正方形で角だけ丸い
                const zTop = 5.90, zc = (cfg.bodyBack + zTop) * 0.5;
                d = this._roundRect(x, z - zc, cfg.halfW, (zTop - cfg.bodyBack) * 0.5, cfg.cornerR * 1.25);
            }
            // 型から出たパンは定規どおりではない。輪郭をゆるく揺らす
            d -= (Noise.fbm2(x * 0.32 + 40, z * 0.32 + 70, sd + 11, 3) - 0.5) * 2 * cfg.outlineWobble;
            d -= (Noise.fbm2(x * 1.15 + 5, z * 1.15 + 9, sd + 23, 2) - 0.5) * 2 * cfg.outlineWobble * 0.30;
            return d;
        }

        tab(arr, a) {
            const K = this.K;
            let f = a * K / TAU; f -= Math.floor(f / K) * K;
            const i0 = Math.floor(f) % K, i1 = (i0 + 1) % K, w = f - Math.floor(f);
            let v0 = arr[i0], v1 = arr[i1];
            if (arr === this.ATab && v1 < v0) v1 += this.perimeter;   // 一周の折り返し
            return v0 + (v1 - v0) * w;
        }

        outlineAt(a) { return this.tab(this.RTab, a); }
        arcAt(a) { return this.tab(this.ATab, a); }

        // 切り口（上面）の場
        sample(x, z) {
            const cfg = this.cfg, sd = cfg.fieldSeed, S = this.S;
            const dist = -this.sdf(x, z);          // 内側で正、輪郭で 0
            S.d = dist;

            // --- す。格子の規則性を消すため座標を低周波で歪めておく
            const wx = x + (Noise.fbm2(x * 1.8 + 300, z * 1.8 + 40, sd + 301, 2) - 0.5) * 0.22;
            const wz = z + (Noise.fbm2(x * 1.8 + 90, z * 1.8 + 210, sd + 303, 2) - 0.5) * 0.22;
            let pitH = 0, pore = 0;
            for (let k = 0; k < cfg.pits.length; k++) {
                const q = cfg.pits[k];
                const v = Noise.cap(wx, wz, q[0], q[1], q[2], q[3], sd + 201 + k * 37);
                pitH += v * q[4];
                if (v > pore) pore = v;
            }

            // --- 耳の断面（切り口の縁に現れる帯）
            // 【対策】幅を定数にすると、額縁を貼ったように一定の帯になる。
            //         実物の耳の厚みは場所で 2 倍近く違う
            const cw = cfg.crustW * (0.72 + 0.62 * Noise.fbm2(x * 0.55 + 77, z * 0.55 + 23, sd + 173, 3));
            const crust = smooth(cw, cw * 0.28, dist);
            S.crust = crust;
            S.pore = pore * (1 - crust);           // 耳の中にすは開かない

            // --- 刃でちぎれたセル壁の毛羽。焼き色を決めるのは実質これ
            // 【対策】fbm の生値は 0.5 付近に固まっていて分散が小さい。
            //         そのまま閾値を取ると「ほぼ全部焦げる」か「全く焦げない」
            //         の二択になる。smoothstep で 0〜1 に伸ばしてから使う
            // 【対策】粒の周波数が低いと、焼き色が 4〜5mm の島になって
            //         迷彩服の模様に見える。写真の粒は 0.5〜1.5mm しかない
            const fine = Noise.fbm2(x * 9.0 + 5, z * 9.0 + 15, sd + 71, 1);
            const clump = Noise.fbm2(x * 1.6 + 31, z * 1.6 + 7, sd + 73, 2);
            const grain = smooth(0.30, 0.70, fine) * 0.72 + smooth(0.32, 0.68, clump) * 0.28;

            // --- 高さ
            // 【対策】スライスは平らではない。焼くと水分が抜けて全体が
            //         わずかに反り、耳のきわが持ち上がる
            const warp = (Noise.fbm2(x * 0.20 + 55, z * 0.20 + 31, sd + 83, 2) - 0.5) * 0.11;
            const lipUp = smooth(1.9, 0.25, dist) * 0.055;
            let h = cfg.thickness + warp + lipUp;
            // 【対策】くぼみの深さを smoothstep の出力で作ると、穴の底も
            //         まわりも完全に平らな二段プラトーになる。法線マップは
            //         ふちの線だけになり、白クレイ表示にすると
            //         「つるつるの板」であることが一目で分かる（平均勾配 8.6°）。
            //         深さは閾値ではなく生のノイズから連続に作り、
            //         さらにセル壁そのもののうねりを全面に入れる
            // 【対策】メッシュはこの細かさを解像できない。上面の格子は
            //         約 0.8mm 間隔なのに、セル壁の最短波長は 1.25mm しかない。
            //         同じ高さ場をメッシュにも使うと頂点ごとに棘が立つ。
            //         粗い起伏（hMacro）と細部（h）を分ける
            S.hMacro = h;

            // 【対策】高周波ノイズを重ねて凹凸を稼ぐと、法線マップが
            //         等方的な砂嵐になり「紙やすり」に見える。凹凸の主役は
            //         個々の気泡の断面（cap）で、ノイズはその間を埋める
            //         ゆるいうねりだけに留める
            const solid = 1 - crust;
            // 【対策】下地は「なだらか」でよい。実測スキャンの法線マップも
            //         AO マップも意外なほど平坦だった。凹凸を張り切ると、
            //         何を作っても模様が主役になって食品に見えなくなる
            const undul = Noise.fbm2(x * 2.2 + 12, z * 2.2 + 66, sd + 43, 2);
            const fuzz = Noise.fbm2(x * 14.0 + 9, z * 14.0 + 31, sd + 79, 1);
            h += (undul - 0.5) * 0.070 * solid;
            h -= pitH * solid;
            // 穴の外はなだらかだが、刃でちぎれた繊維でごく浅く毛羽立つ
            h += ((fine - 0.5) * 0.040 + (fuzz - 0.5) * 0.024) * solid;
            S.h = h;

            // --- 焼き色の駆動量
            // 【対策】ここがトーストの核心。トースターの輻射は面ではなく
            //         「出っ張り」に当たる。だから焦げはグラデーションではなく、
            //         セル壁の頂だけが色づいた斑点として現れる。
            //         すの中（wall = 0）は最後まで白いまま残る
            const wall = 1 - 0.22 * smooth(0.10, 0.70, S.pore);
            S.relief = wall * grain;

            // --- トースターの当たり。中央が強く、耳ぎわ 2cm は色づかない
            const blotch = Noise.fbm2(x * 0.34 + 12, z * 0.34 + 44, sd + 97, 3);
            const hot = clamp(smooth(0.05, 2.60, dist) * (0.50 + 0.88 * blotch), 0, 1.25);
            S.hot = hot;

            // 【対策】スキャンのベースカラーと自作を並べて初めて分かったが、
            //         明暗の構造が反転していた。実物は「連続した焦げ色の面」に
            //         「焼けていない淡い穴」が抜けている。自作は逆で、
            //         「淡い地」に「焦げの粒」を撒いていた。だから密度を
            //         どう調整しても迷彩やテラゾーにしかならなかった。
            //         焼き色は大局（hot）だけで決め、粒は ±20% の変調に落とす。
            //         穴を淡く抜くのはアルベド側の仕事（下の pk）
            const drive = hot * wall;
            S.brown = clamp((drive - cfg.brownTh) / cfg.brownSpan, 0, 1)
                * (0.82 + 0.36 * grain) * (1 - crust);

            return S;
        }
    }


    // =================================================================
    // 4b. EggField : 目玉焼きの白身の場
    //   ・輪郭は円ではない。大きな裂片が数個あり、その縁がさらにちぎれる
    //   ・厚みは二段。黄身のまわりの「濃厚卵白」が丘をつくり、外へ
    //     「水様卵白」の薄いシート（2〜3mm）が広がる
    //   ・黄身の際で白身がわずかに盛り上がる（カラー）
    // =================================================================
    class EggField {
        constructor(cfg) {
            this.cfg = cfg;
            const sd = cfg.fieldSeed;
            const K = 2048;
            this.K = K;

            // 【対策】円をノイズで揺らしただけだと「もこもこした円」になる。
            //         実物の白身は落ちた瞬間の流れで大きな裂片に分かれる
            const flow = Noise.h2(7, 11, sd) * TAU;
            this.RTab = new Float32Array(K);
            let rMax = 0;
            for (let i = 0; i < K; i++) {
                const a = i / K;
                // 【対策】値ノイズは格子点で微分が 0 になるので、少ない
                //         オクターブだと円弧が並んで角の丸い多角形に見える
                let b = 1
                    + (Noise.fbm2u(a * 3, 0.7, 3, sd + 11, 3) - 0.5) * 0.42
                    + (Noise.fbm2u(a * 7, 2.3, 7, sd + 29, 3) - 0.5) * 0.20
                    + (Noise.fbm2u(a * 17, 4.1, 17, sd + 47, 2) - 0.5) * 0.10 * cfg.ragged
                    + (Noise.fbm2u(a * 41, 6.7, 41, sd + 59, 1) - 0.5) * 0.045 * cfg.ragged;
                b *= 1 + 0.085 * Math.cos(TAU * a - flow);
                const r = cfg.whiteRadius * clamp(b, 0.52, 1.46);
                this.RTab[i] = r;
                if (r > rMax) rMax = r;
            }
            this.rMax = rMax;

            // 丘（濃厚卵白）の輪郭。黄身から少しずれた中心を持つ
            this.MTab = new Float32Array(K);
            for (let i = 0; i < K; i++) {
                const a = i / K;
                const b = 1
                    + (Noise.fbm2u(a * 4, 1.3, 4, sd + 71, 2) - 0.5) * 0.50
                    + (Noise.fbm2u(a * 11, 3.7, 11, sd + 83, 2) - 0.5) * 0.22;
                this.MTab[i] = cfg.moundR * clamp(b, 0.55, 1.45);
            }

            // 【対策】全周を均等に焦がすと「縁取りのある円盤」になる
            this.HotTab = new Float32Array(K);
            for (let i = 0; i < K; i++) {
                const a = i / K;
                this.HotTab[i] = clamp(
                    Noise.fbm2u(a * 4, 0.9, 4, sd + 151, 2) * 0.78
                    + Noise.fbm2u(a * 13, 5.5, 13, sd + 167, 2) * 0.30, 0, 1);
            }

            this.S = { t: 0, h: 0, thick: 0, dome: 0, brown: 0, bub: 0 };
        }

        tab(arr, a) {
            const K = this.K;
            let f = a * K; f -= Math.floor(f / K) * K;
            const i0 = Math.floor(f) % K, i1 = (i0 + 1) % K, w = f - Math.floor(f);
            return arr[i0] + (arr[i1] - arr[i0]) * w;
        }
        outlineAt(a) { return this.tab(this.RTab, a); }

        // 【対策】白身の輪郭はノイズで毎回大きさが変わるので、半径を固定値で
        //         決め打ちすると seed によってはパンからはみ出す。薄い縁が
        //         宙に浮いて「浮いた膜」に見えるので、必ずパンの内側に収める。
        //         形は変えずに全体を一律に縮めるだけにする（部分的に潰すと
        //         輪郭のちぎれ具合が壊れる）
        fitInside(sdf, ox, oz, cs, sn, margin) {
            const K = this.K;
            let k = 1;
            for (let i = 0; i < K; i += 4) {
                const a = TAU * i / K, dx = Math.cos(a), dz = Math.sin(a);
                // パンの内側にある最大の距離を二分法で求める
                let lo = 0, hi = 12;
                for (let n = 0; n < 22; n++) {
                    const m = (lo + hi) * 0.5;
                    const ex = m * dx, ez = m * dz;
                    if (-sdf(ox + ex * cs + ez * sn, oz - ex * sn + ez * cs) > margin) lo = m; else hi = m;
                }
                const s = lo / Math.max(1e-6, this.RTab[i]);
                if (s < k) k = s;
            }
            if (k >= 1) return 1;
            let rMax = 0;
            for (let i = 0; i < K; i++) { this.RTab[i] *= k; rMax = Math.max(rMax, this.RTab[i]); }
            this.rMax = rMax;
            for (let i = 0; i < K; i++) this.MTab[i] *= k;
            const c = this.cfg;
            c.moundX *= k; c.moundZ *= k;
            c.yolkX *= k; c.yolkZ *= k;
            return k;
        }

        sample(x, z) {
            const cfg = this.cfg, sd = cfg.fieldSeed, S = this.S;
            const r = Math.hypot(x, z);
            const a = Math.atan2(z, x) / TAU + 0.5;
            const t = r / this.tab(this.RTab, a);
            S.t = t;

            // --- 丘
            // 【対策】smoothstep で丘を作ると内側が 1 で飽和し、平らな頂と
            //         まっすぐな斜面＝円錐台になる。実物はドーム
            const mx = x - cfg.moundX, mz = z - cfg.moundZ;
            const md = Math.hypot(mx, mz);
            const ma = Math.atan2(mz, mx) / TAU + 0.5;
            const outer = this.tab(this.MTab, ma) + cfg.moundSoft * 0.5;
            const dome = Math.pow(clamp(1 - (md / outer) * (md / outer), 0, 1), cfg.moundPow);
            const thick = smooth(0.03, 0.60, dome);
            S.thick = thick; S.dome = dome;

            // --- 気泡（薄いシートに多い）
            const bMask = smooth(0.32, 0.78, Noise.fbm2(x * 0.30 + 17, z * 0.30 + 31, sd + 191, 2));
            let bub = Noise.bubble(x, z, 1.35, 0.115, 0.290, 0.34, sd + 201);
            bub = Math.max(bub, Noise.bubble(x, z, 0.58, 0.050, 0.130, 0.42, sd + 233) * 0.75);
            bub = Math.max(bub, Noise.bubble(x, z, 0.29, 0.026, 0.062, 0.38, sd + 257) * 0.50);
            bub *= (0.25 + 0.75 * bMask) * (0.35 + 0.80 * (1 - thick)) * cfg.bubble;
            S.bub = clamp(bub, 0, 1);

            // --- 高さ
            let h = cfg.edgeMin;
            h += cfg.thinH * (1 - smooth(0.52, 0.995, t));
            h += cfg.moundH * dome;
            const yx = (x - cfg.yolkX) / cfg.yolkRX, yz = (z - cfg.yolkZ) / cfg.yolkRZ;
            const cl = (Math.sqrt(yx * yx + yz * yz) - 1.06) / 0.30;
            h += cfg.collar * Math.exp(-cl * cl);
            h += (Noise.fbm2(x * 0.42 + 50, z * 0.42 + 50, sd + 101, 3) - 0.5) * 0.17 * (0.28 + 0.9 * thick);
            h -= S.bub * cfg.bubbleDepth;
            // 【対策】この時点の厚みが焦げを決める。めくれは焦げた「結果」なので、
            //         それを含む高さで判定すると「よく焦げた縁ほど焦げない」逆転が起きる
            const hBase = h;
            const hot = this.tab(this.HotTab, a);
            h += cfg.curl * smooth(0.87, 1.0, t) * (0.30 + 0.70 * hot);
            S.h = Math.max(h, cfg.edgeMin * 0.30);

            // --- 焦げ。決め手は「厚み」
            let br = smooth(0.66, 0.98, t);
            br *= smooth(0.20, 0.75, hot);
            br *= smooth(0.26, 0.06, hBase);
            br *= smooth(0.30, 0.62, Noise.fbm2(x * 1.9, z * 1.9, sd + 271, 3));
            S.brown = clamp(br * cfg.brown * 1.35, 0, 1);
            return S;
        }
    }

    // =================================================================
    // 5. TextureLab
    // =================================================================
    const TextureLab = {
        _tex(name, size, fill, scene, linear, clampMode) {
            size = Math.max(8, Math.round(size) || 512);
            const dt = new BABYLON.DynamicTexture(name, { width: size, height: size }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(size, size);
            fill(img.data, size);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = false;
            const mode = clampMode ? BABYLON.Texture.CLAMP_ADDRESSMODE : BABYLON.Texture.WRAP_ADDRESSMODE;
            dt.wrapU = mode; dt.wrapV = mode;
            dt.anisotropicFilteringLevel = 8;
            // 【対策】ORM と法線は「色」ではない。既定（gammaSpace = true）だと
            //         粗さ 0.72 が線形 0.49 として渡り、狙いよりつやつやになる
            if (linear) dt.gammaSpace = false;
            return dt;
        },
        fromBuffer(name, buf, size, scene, linear, clampMode) {
            return this._tex(name, size, (d) => d.set(buf), scene, linear, clampMode);
        },
        // 【対策】v 方向の符号は (下 - 上)。逆にすると u だけ正で v が逆という
        //         ねじれた法線になり、真上からの照明では気付けない
        normalFrom(name, H, size, strength, scene, clampMode, flipY) {
            const sy = flipY ? -1 : 1;
            return this._tex(name, size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const yu = clampMode ? Math.max(0, y - 1) : (y - 1 + N) % N;
                    const yd = clampMode ? Math.min(N - 1, y + 1) : (y + 1) % N;
                    for (let x = 0; x < N; x++) {
                        const xl = clampMode ? Math.max(0, x - 1) : (x - 1 + N) % N;
                        const xr = clampMode ? Math.min(N - 1, x + 1) : (x + 1) % N;
                        let nx = (H[y * N + xl] - H[y * N + xr]) * strength;
                        let ny = (H[yd * N + x] - H[yu * N + x]) * strength * sy;
                        let nz = 1;
                        const l = Math.hypot(nx, ny, nz) || 1;
                        nx /= l; ny /= l; nz /= l;
                        const o = (y * N + x) * 4;
                        d[o] = (nx * 0.5 + 0.5) * 255;
                        d[o + 1] = (ny * 0.5 + 0.5) * 255;
                        d[o + 2] = (nz * 0.5 + 0.5) * 255;
                        d[o + 3] = 255;
                    }
                }
            }, scene, true, clampMode);
        }
    };

    // -----------------------------------------------------------------
    //  切り口（真上からの平面投影。Field と同じ空間）
    // -----------------------------------------------------------------
    class CrumbSkin {
        constructor(scene, cfg, field) {
            const N = cfg.texCrumb;
            const half = field.halfExtent * 1.03;
            this.half = half;
            const sd = cfg.fieldSeed;

            const H = new Float32Array(N * N);
            const A = new Uint8ClampedArray(N * N * 4);
            const O = new Uint8ClampedArray(N * N * 4);

            // 色（sRGB 0..1）
            // 【対策】写真のトーストは「クリーム地に淡い金色の粒」で、
            //         コントラストは驚くほど低い。濃い茶色を使うと、
            //         焼き色ではなく焦げ付きか汚れに見える
            // 【対策】切り口の地を純白に近づけると、焼き色が乗らない部分が
            //         紙になる。食パンのクラムは元から生成り（アイボリー）
            const CRUMB = [0.948, 0.910, 0.812];   // 白い部分（純白ではない）
            const CRUMB2 = [0.905, 0.862, 0.752];  // す壁の陰り寄り
            const CPORE = [0.930, 0.888, 0.775];   // すの内側（焼けていないクラム）
            const CBR1 = [0.945, 0.848, 0.638];    // 焼き始め（淡い金）
            const CBR2 = [0.878, 0.608, 0.325];    // きつね色
            const CBR3 = [0.762, 0.452, 0.208];    // 濃く焼けた芯
            const CCRU1 = [0.910, 0.790, 0.575];   // 耳の断面（内側寄り）
            const CCRU2 = [0.845, 0.660, 0.420];   // 耳の断面（外寄り）
            const CBUT = [0.985, 0.845, 0.430];    // バター

            for (let y = 0; y < N; y++) {
                const wz = (y / (N - 1) - 0.5) * 2 * half;
                for (let x = 0; x < N; x++) {
                    const wx = (x / (N - 1) - 0.5) * 2 * half;
                    const i = y * N + x, o = i * 4;

                    // 【対策】輪郭の外まで場を評価すると生成時間が3割増える。
                    //         外側は「平らな耳の色」で埋めれば、メッシュ最外周を
                    //         バイリニアが拾っても段差にならない
                    if (field.sdf(wx, wz) > 0.06) {
                        H[i] = cfg.thickness;
                        A[o] = CCRU2[0] * 255; A[o + 1] = CCRU2[1] * 255; A[o + 2] = CCRU2[2] * 255; A[o + 3] = 255;
                        O[o] = 255; O[o + 1] = 0.55 * 255; O[o + 2] = 0; O[o + 3] = 255;
                        continue;
                    }

                    const S = field.sample(wx, wz);
                    H[i] = S.h;

                    // ---- アルベド
                    // 地の白。す壁の向きで微妙に沈む
                    const shade = Noise.fbm2(wx * 4.2, wz * 4.2, sd + 131, 2);
                    let cr = mix(CRUMB[0], CRUMB2[0], smooth(0.38, 0.72, shade));
                    let cg = mix(CRUMB[1], CRUMB2[1], smooth(0.38, 0.72, shade));
                    let cb = mix(CRUMB[2], CRUMB2[2], smooth(0.38, 0.72, shade));
                    const pk = smooth(0.12, 0.66, S.pore);
                    // 焼き色は 3 段のランプを連続に通す
                    const b = S.brown;
                    const t1 = smooth(0.00, 0.42, b);
                    cr = mix(cr, CBR1[0], t1); cg = mix(cg, CBR1[1], t1); cb = mix(cb, CBR1[2], t1);
                    const t2 = smooth(0.34, 0.78, b);
                    cr = mix(cr, CBR2[0], t2); cg = mix(cg, CBR2[1], t2); cb = mix(cb, CBR2[2], t2);
                    const t3 = smooth(0.74, 1.00, b);
                    cr = mix(cr, CBR3[0], t3 * 0.80); cg = mix(cg, CBR3[1], t3 * 0.80); cb = mix(cb, CBR3[2], t3 * 0.80);
                    // 【対策】ここが要。焦げた面に、輻射の当たらなかった
                    //         穴の内側を淡く抜く。スキャンの「レース状」の
                    //         見えかたは、茶色の網ではなく淡い穴が抜けた結果
                    const pale = 0.78 * pk * (1 - S.crust);
                    cr = mix(cr, CPORE[0], pale);
                    cg = mix(cg, CPORE[1], pale);
                    cb = mix(cb, CPORE[2], pale);
                    // 耳の断面
                    const c1 = smooth(0.02, 0.55, S.crust), c2 = smooth(0.45, 1.00, S.crust);
                    cr = mix(cr, CCRU1[0], c1); cg = mix(cg, CCRU1[1], c1); cb = mix(cb, CCRU1[2], c1);
                    cr = mix(cr, CCRU2[0], c2 * (0.35 + 0.65 * cfg.crustDeep));
                    cg = mix(cg, CCRU2[1], c2 * (0.35 + 0.65 * cfg.crustDeep));
                    cb = mix(cb, CCRU2[2], c2 * (0.35 + 0.65 * cfg.crustDeep));

                    // バター: すの中と低い所に溜まり、頂には残らない
                    let butter = 0;
                    if (cfg.butter) {
                        const pool = Noise.fbm2(wx * 0.9 + 61, wz * 0.9 + 17, sd + 149, 3);
                        butter = clamp(smooth(0.30, 0.72, pool) * (0.35 + 0.85 * pk), 0, 1) * (1 - S.crust);
                        cr = mix(cr, CBUT[0], butter * 0.42);
                        cg = mix(cg, CBUT[1], butter * 0.42);
                        cb = mix(cb, CBUT[2], butter * 0.42);
                    }

                    A[o] = cr * 255; A[o + 1] = cg * 255; A[o + 2] = cb * 255; A[o + 3] = 255;

                    // ---- ORM (R=AO, G=Roughness, B=Metallic)
                    // 【対策】実測したスキャンの AO マップはほぼ真っ白だった。
                    //         パンの陰影は AO テクスチャではなく、法線と
                    //         スクリーン空間 AO（SSAO）が作っている。
                    //         ここを濃く焼き込むと、汚れた紙になる
                    let ao = 1.0 - 0.14 * smooth(0.06, 0.80, S.pore);
                    ao -= 0.05 * smooth(0.20, 0.95, S.crust);
                    // 【対策】逆に粗さマップは情報量が多い。一定値に近いと
                    //         全面が同じ質感になり、のっぺりする
                    let rough = 0.88;                         // パンはほぼ完全拡散
                    rough -= 0.16 * smooth(0.10, 0.90, S.brown);   // 焼けた所は締まる
                    rough -= 0.14 * smooth(0.15, 1.00, S.crust);
                    rough += 0.13 * smooth(0.15, 0.80, S.pore);    // すの底は毛羽立つ
                    rough -= 0.45 * butter;
                    rough += 0.16 * (shade - 0.5);
                    O[o] = clamp(ao, 0, 1) * 255;
                    O[o + 1] = clamp(rough, 0.05, 1) * 255;
                    O[o + 2] = 0; O[o + 3] = 255;
                }
            }

            this.albedo = TextureLab.fromBuffer("crumbAlbedo", A, N, scene, false, true);
            this.orm = TextureLab.fromBuffer("crumbORM", O, N, scene, true, true);
            // 【対策】高さ場は cm 単位。テクセル1つあたりの実寸で微分しないと
            //         解像度を変えるたびに凹凸の強さが変わる
            const texel = (2 * half) / N;
            this.normal = TextureLab.normalFrom("crumbNormal", H, N, 1.00 / texel, scene, true, cfg.normalFlipY);
            this.height = H;
        }

        dispose() {
            for (const t of [this.albedo, this.orm, this.normal]) if (t) t.dispose();
            this.height = null;
        }
    }

    // -----------------------------------------------------------------
    //  耳（クラスト）。UV = (周長, 厚み方向)。u だけ折り返す
    // -----------------------------------------------------------------
    class CrustSkin {
        constructor(scene, cfg, field) {
            const N = cfg.texCrust, sd = (cfg.fieldSeed ^ 0x2545f491) >>> 0;
            const A = new Uint8ClampedArray(N * N * 4);
            const O = new Uint8ClampedArray(N * N * 4);
            const H = new Float32Array(N * N);
            const PU = 24;                        // u 方向の折り返し周期

            // 【対策】実測したスキャンの耳は驚くほど淡い。彩度の高い橙で
            //         塗ると、パンではなく塗装した樹脂になる
            const C_MID = [0.885, 0.715, 0.485];  // 耳の地
            const C_DARK = [0.760, 0.545, 0.320]; // 焼き込み
            const C_LIGHT = [0.930, 0.815, 0.640];// 水疱の頂・粉
            const C_PALE = [0.945, 0.885, 0.775]; // 底のきわ（型に接して白い）

            for (let y = 0; y < N; y++) {
                const v = y / (N - 1);            // 0 = 切り口側（上）, 1 = 底側
                for (let x = 0; x < N; x++) {
                    const u = x / N;
                    const i = y * N + x, o = i * 4;

                    // 大きなムラ（窯の当たり）
                    const mott = Noise.fbm2u(u * PU, v * 8, PU, sd + 7, 3);
                    let t = smooth(0.30, 0.78, mott);
                    let cr = mix(C_MID[0], C_DARK[0], t * (0.35 + 0.65 * cfg.crustDeep));
                    let cg = mix(C_MID[1], C_DARK[1], t * (0.35 + 0.65 * cfg.crustDeep));
                    let cb = mix(C_MID[2], C_DARK[2], t * (0.35 + 0.65 * cfg.crustDeep));

                    // 水疱（発酵ガスが皮の下で膨らんだ痕）
                    // 【対策】ここが無いと耳が「茶色いビニールテープ」になる
                    const bl = Noise.blister(u * PU, v * 8, 0.62, 0.10, 0.26, 0.40, sd + 31);
                    const bl2 = Noise.blister(u * PU, v * 8, 0.26, 0.04, 0.10, 0.34, sd + 53);
                    const blis = clamp(bl + bl2 * 0.6, 0, 1);
                    // 【対策】水疱の頂を明るく塗ると、耳一面に白い点が散って
                    //         「粉をふいた作り物」になる。凹凸は法線に任せる
                    cr = mix(cr, C_LIGHT[0], smooth(0.35, 0.98, blis) * 0.09);
                    cg = mix(cg, C_LIGHT[1], smooth(0.35, 0.98, blis) * 0.09);
                    cb = mix(cb, C_LIGHT[2], smooth(0.35, 0.98, blis) * 0.09);

                    // 細かい皺
                    const wr = Noise.fbm2u(u * PU * 2, v * 22, PU * 2, sd + 71, 2);
                    const k = (wr - 0.5) * 0.10;
                    cr = clamp(cr + k, 0, 1); cg = clamp(cg + k * 0.9, 0, 1); cb = clamp(cb + k * 0.8, 0, 1);

                    // 【対策】耳を上下一様に塗ると帯になる。トースターに面した
                    //         切り口側のきわだけ余分に焼ける
                    const scorch = smooth(0.24, 0.00, v) * (0.30 + 0.70 * cfg.crustDeep);
                    cr = mix(cr, C_DARK[0], scorch * 0.55);
                    cg = mix(cg, C_DARK[1], scorch * 0.55);
                    cb = mix(cb, C_DARK[2], scorch * 0.55);
                    // 底のきわは型に接していて白っぽい
                    const pale = smooth(0.86, 1.00, v);
                    cr = mix(cr, C_PALE[0], pale * 0.55);
                    cg = mix(cg, C_PALE[1], pale * 0.55);
                    cb = mix(cb, C_PALE[2], pale * 0.55);

                    A[o] = cr * 255; A[o + 1] = cg * 255; A[o + 2] = cb * 255; A[o + 3] = 255;
                    H[i] = blis * 0.62 + wr * 0.28 + mott * 0.10;

                    let rough = 0.62 - 0.14 * smooth(0.30, 0.95, blis) + 0.10 * (mott - 0.5);
                    let ao = 1 - 0.22 * (1 - smooth(0.05, 0.60, blis));
                    O[o] = clamp(ao, 0, 1) * 255;
                    O[o + 1] = clamp(rough, 0.08, 1) * 255;
                    O[o + 2] = 0; O[o + 3] = 255;
                }
            }

            this.albedo = TextureLab.fromBuffer("crustAlbedo", A, N, scene, false, false);
            this.orm = TextureLab.fromBuffer("crustORM", O, N, scene, true, false);
            this.normal = TextureLab.normalFrom("crustNormal", H, N, 1.3, scene, false, cfg.normalFlipY);
        }

        dispose() {
            for (const t of [this.albedo, this.orm, this.normal]) if (t) t.dispose();
        }
    }


    // -----------------------------------------------------------------
    //  目玉焼き 白身のテクスチャ（真上からの平面投影。EggField と同じ空間）
    // -----------------------------------------------------------------
    class EggWhiteSkin {
        constructor(scene, cfg, field) {
            const N = cfg.texWhite;
            const half = field.rMax * 1.04;
            this.half = half;
            const sd = cfg.fieldSeed;

            const H = new Float32Array(N * N);
            const A = new Uint8ClampedArray(N * N * 4);
            const O = new Uint8ClampedArray(N * N * 4);
            const T = new Uint8ClampedArray(N * N * 4);

            const CTHICK = [0.988, 0.978, 0.958];   // 丘の上：温かいクリーム
            const CTHIN = [0.958, 0.950, 0.930];    // 薄いところ：わずかに青灰
            // 【対策】鍋の上なら「下の黒が透けて青灰」だが、トーストの上では
            //         透けるのはきつね色のパン。ここを灰色のままにすると
            //         白身の薄い部分だけ冷たく浮く
            const CWET = [0.880, 0.820, 0.700];
            const CWARM = [0.980, 0.930, 0.800];
            const CBR1 = [0.760, 0.520, 0.245];
            const CBR2 = [0.400, 0.215, 0.085];

            for (let y = 0; y < N; y++) {
                const wz = (y / (N - 1) - 0.5) * 2 * half;
                for (let x = 0; x < N; x++) {
                    const wx = (x / (N - 1) - 0.5) * 2 * half;
                    const i = y * N + x, o = i * 4;

                    const rr = Math.hypot(wx, wz);
                    const aa = Math.atan2(wz, wx) / TAU + 0.5;
                    if (rr > field.outlineAt(aa) * 1.04) {
                        H[i] = cfg.edgeMin;
                        A[o] = CTHIN[0] * 255; A[o + 1] = CTHIN[1] * 255; A[o + 2] = CTHIN[2] * 255; A[o + 3] = 255;
                        O[o] = 255; O[o + 1] = 0.40 * 255; O[o + 2] = 0; O[o + 3] = 255;
                        T[o] = 8; T[o + 1] = 8; T[o + 2] = 8; T[o + 3] = 255;
                        continue;
                    }

                    const S = field.sample(wx, wz);
                    H[i] = S.h;

                    const op = smooth(0.02, 0.34, S.h);
                    let cr = mix(CTHIN[0], CTHICK[0], smooth(0.10, 0.85, S.thick));
                    let cg = mix(CTHIN[1], CTHICK[1], smooth(0.10, 0.85, S.thick));
                    let cb = mix(CTHIN[2], CTHICK[2], smooth(0.10, 0.85, S.thick));
                    const trans = 1 - op;
                    cr = mix(cr, CWET[0], trans * 0.40);
                    cg = mix(cg, CWET[1], trans * 0.40);
                    cb = mix(cb, CWET[2], trans * 0.40);
                    const warm = smooth(0.45, 1.0, S.t) * cfg.whiteWarm;
                    cr = mix(cr, CWARM[0], warm * 0.30);
                    cg = mix(cg, CWARM[1], warm * 0.30);
                    cb = mix(cb, CWARM[2], warm * 0.30);
                    const mott = 0.955 + 0.090 * Noise.fbm2(wx * 1.15 + 3, wz * 1.15 + 9, sd + 311, 3);
                    cr *= mott; cg *= mott; cb *= mott;
                    // 【対策】泡の暗い芯と白い環を強く描くとクレーターになる。
                    //         実物の泡は色ではほとんど見えず、陰影で見えている
                    const bIn = smooth(0.30, 0.95, S.bub);
                    const bRim = smooth(0.10, 0.30, S.bub) * (1 - smooth(0.34, 0.62, S.bub));
                    cr = mix(cr, cr * 0.80, bIn * 0.35);
                    cg = mix(cg, cg * 0.81, bIn * 0.35);
                    cb = mix(cb, cb * 0.84, bIn * 0.35);
                    cr = mix(cr, 0.995, bRim * 0.16);
                    cg = mix(cg, 0.995, bRim * 0.16);
                    cb = mix(cb, 0.990, bRim * 0.16);
                    const b1 = smooth(0.06, 0.52, S.brown);
                    const b2 = smooth(0.48, 1.00, S.brown);
                    cr = mix(cr, CBR1[0], b1); cg = mix(cg, CBR1[1], b1); cb = mix(cb, CBR1[2], b1);
                    cr = mix(cr, CBR2[0], b2); cg = mix(cg, CBR2[1], b2); cb = mix(cb, CBR2[2], b2);
                    A[o] = cr * 255; A[o + 1] = cg * 255; A[o + 2] = cb * 255; A[o + 3] = 255;

                    // 【対策】濡れた面をベースの粗さだけで表すと白いプラスチックに
                    //         なる。ベースは粗いまま、艶はクリアコートで乗せる
                    let rough = 0.36;
                    rough -= 0.10 * smooth(0.15, 0.90, S.thick);
                    rough += 0.10 * smooth(0.20, 0.85, S.bub);
                    rough += 0.30 * smooth(0.15, 0.95, S.brown);
                    rough += 0.05 * (Noise.fbm2(wx * 3.1, wz * 3.1, sd + 331, 2) - 0.5);
                    let ao = 1.0;
                    ao -= 0.28 * smooth(0.12, 0.85, S.bub);
                    ao -= 0.18 * smooth(1.10, 0.55, S.t + S.thick);
                    O[o] = clamp(ao, 0, 1) * 255;
                    O[o + 1] = clamp(rough, 0.03, 1) * 255;
                    O[o + 2] = 0; O[o + 3] = 255;

                    const th = clamp(S.h / 1.35, 0, 1) * 255;
                    T[o] = th; T[o + 1] = th; T[o + 2] = th; T[o + 3] = 255;
                }
            }

            this.albedo = TextureLab.fromBuffer("eggWhiteAlbedo", A, N, scene, false, true);
            this.orm = TextureLab.fromBuffer("eggWhiteORM", O, N, scene, true, true);
            this.thickness = TextureLab.fromBuffer("eggWhiteThickness", T, N, scene, true, true);
            const texel = (2 * half) / N;
            this.normal = TextureLab.normalFrom("eggWhiteNormal", H, N, 0.9 / texel, scene, true, cfg.normalFlipY);
        }
        dispose() {
            for (const t of [this.albedo, this.orm, this.thickness, this.normal]) if (t) t.dispose();
        }
    }

    // -----------------------------------------------------------------
    //  黄身のテクスチャ
    //  【対策】球面UVの u を周波数に使うと、極で全ての u が1点に収束して
    //          模様が放射状の星になる。黄身は真上から見るものなので、その
    //          「ヒトデ」が絵の中央に居座る。ノイズは球面上の 3D 位置で引く
    // -----------------------------------------------------------------
    class EggYolkSkin {
        constructor(scene, cfg) {
            const N = cfg.texYolk, sd = (cfg.fieldSeed ^ 0x5bf03635) >>> 0;
            const TOP = cfg.yolkTop, MID = cfg.yolkMid, RIM = cfg.yolkRim;
            const A = new Uint8ClampedArray(N * N * 4);
            const O = new Uint8ClampedArray(N * N * 4);
            const H = new Float32Array(N * N);

            for (let y = 0; y < N; y++) {
                const v = y / (N - 1);
                const th = v * Math.PI, st = Math.sin(th), ct = Math.cos(th);
                for (let x = 0; x < N; x++) {
                    const u = x / N, ph = u * TAU;
                    const i = y * N + x, o = i * 4;
                    const dx = st * Math.cos(ph), dy = ct, dz = st * Math.sin(ph);

                    let t = smooth(0.00, 0.42, v);
                    let cr = mix(TOP[0], MID[0], t), cg = mix(TOP[1], MID[1], t), cb = mix(TOP[2], MID[2], t);
                    t = smooth(0.40, 0.86, v);
                    cr = mix(cr, RIM[0], t); cg = mix(cg, RIM[1], t); cb = mix(cb, RIM[2], t);

                    const sp = Noise.fbm3(dx * 3, dy * 3, dz * 3, sd + 17, 2);
                    const k = (sp - 0.5) * 0.13;
                    cr = clamp(cr + k * 0.8, 0, 1); cg = clamp(cg + k, 0, 1); cb = clamp(cb + k * 1.5, 0, 1);
                    const dot = Noise.fbm3(dx * 8, dy * 8, dz * 8, sd + 43, 1);
                    const dk = smooth(0.78, 0.95, dot) * 0.16;
                    cr = mix(cr, RIM[0] * 0.86, dk); cg = mix(cg, RIM[1] * 0.80, dk); cb = mix(cb, RIM[2] * 0.74, dk);

                    // 【対策】加熱で回り込む白い膜を均一に乗せると濁った球になる。
                    //         実際は際から中心へ向かってまだらに侵食する
                    if (cfg.yolkFilm > 0.001) {
                        const fm = Noise.fbm3(dx * 1.6, dy * 1.6, dz * 1.6, sd + 71, 3);
                        let f = smooth(0.30, 0.92, v) * 0.85 + 0.28;
                        f *= smooth(0.62 - cfg.yolkFilm * 0.45, 0.95 - cfg.yolkFilm * 0.40, fm);
                        f = clamp(f * cfg.yolkFilm * 1.5, 0, 0.92);
                        cr = mix(cr, 0.955, f); cg = mix(cg, 0.935, f); cb = mix(cb, 0.890, f);
                        H[i] += f * 0.35;
                    }
                    A[o] = cr * 255; A[o + 1] = cg * 255; A[o + 2] = cb * 255; A[o + 3] = 255;

                    const wr = Noise.fbm3(dx * 2.5, dy * 2.5, dz * 2.5, sd + 97, 3);
                    H[i] += wr * 0.55 + Noise.fbm3(dx * 10, dy * 10, dz * 10, sd + 113, 1) * 0.20;

                    let rough = cfg.yolkRough + 0.10 * smooth(0.55, 1.0, v) + 0.06 * (wr - 0.5);
                    const ao = 1 - 0.20 * smooth(0.70, 1.0, v);
                    O[o] = clamp(ao, 0, 1) * 255;
                    O[o + 1] = clamp(rough, 0.03, 1) * 255;
                    O[o + 2] = 0; O[o + 3] = 255;
                }
            }
            this.albedo = TextureLab.fromBuffer("yolkAlbedo", A, N, scene, false, false);
            this.orm = TextureLab.fromBuffer("yolkORM", O, N, scene, true, false);
            this.normal = TextureLab.normalFrom("yolkNormal", H, N, 1.6, scene, false, cfg.normalFlipY);
        }
        dispose() {
            for (const t of [this.albedo, this.orm, this.normal]) if (t) t.dispose();
        }
    }

    // -----------------------------------------------------------------
    //  皿（白磁）とテーブルクロス（麻）
    // -----------------------------------------------------------------
    class TableSkin {
        constructor(scene, cfg) {
            // --- 白磁: ほぼ無地。釉薬のうねりだけを法線で入れる
            const NP = cfg.texPlate, sp = 4242;
            const HP = new Float32Array(NP * NP);
            const OP = new Uint8ClampedArray(NP * NP * 4);
            for (let y = 0; y < NP; y++) {
                for (let x = 0; x < NP; x++) {
                    const u = x / NP, v = y / NP, i = y * NP + x, o = i * 4;
                    const glaze = Noise.fbm2uv(u * 8, v * 8, 8, 8, sp + 3, 3);
                    const spec = Noise.fbm2uv(u * 48, v * 48, 48, 48, sp + 9, 1);
                    HP[i] = glaze * 0.85 + spec * 0.15;
                    // 【対策】釉薬は完全な鏡ではない。粗さを 0 にすると
                    //         環境マップがそのまま映って金属の皿になる
                    const rough = clamp(0.085 + 0.045 * (glaze - 0.5) + 0.02 * (spec - 0.5), 0.03, 0.4);
                    OP[o] = 255; OP[o + 1] = rough * 255; OP[o + 2] = 0; OP[o + 3] = 255;
                }
            }
            this.plateORM = TextureLab.fromBuffer("plateORM", OP, NP, scene, true, false);
            this.plateNormal = TextureLab.normalFrom("plateNormal", HP, NP, 0.30, scene, false);

            // --- 麻のクロス: 縦横の糸を交互に
            const NC = cfg.texCloth, sc = 777;
            const AC = new Uint8ClampedArray(NC * NC * 4);
            const OC = new Uint8ClampedArray(NC * NC * 4);
            const HC = new Float32Array(NC * NC);
            const TH = 34;                       // 1タイルあたりの糸の本数
            for (let y = 0; y < NC; y++) {
                for (let x = 0; x < NC; x++) {
                    const u = x / NC, v = y / NC, i = y * NC + x, o = i * 4;
                    // 平織り: 縦糸と横糸が交互に上に来る
                    const fu = u * TH, fv = v * TH;
                    const cu = Math.abs(Math.sin(Math.PI * fu)), cv = Math.abs(Math.sin(Math.PI * fv));
                    const over = ((Math.floor(fu) + Math.floor(fv)) & 1) === 0;
                    const h = over ? cu * 0.95 + cv * 0.25 : cv * 0.95 + cu * 0.25;
                    const slub = Noise.fbm2uv(u * TH * 0.5, v * TH * 0.5, (TH * 0.5) | 0, (TH * 0.5) | 0, sc + 11, 3);
                    HC[i] = h * 0.82 + slub * 0.18;
                    const base = 0.615 + 0.075 * (slub - 0.5) * 2;
                    const lit = base * (0.72 + 0.34 * h);
                    AC[o] = clamp(lit, 0, 1) * 255;
                    AC[o + 1] = clamp(lit * 0.965, 0, 1) * 255;
                    AC[o + 2] = clamp(lit * 0.905, 0, 1) * 255;
                    AC[o + 3] = 255;
                    OC[o] = clamp(0.72 + 0.28 * h, 0, 1) * 255;
                    OC[o + 1] = clamp(0.90 - 0.08 * h, 0.05, 1) * 255;
                    OC[o + 2] = 0; OC[o + 3] = 255;
                }
            }
            this.clothAlbedo = TextureLab.fromBuffer("clothAlbedo", AC, NC, scene, false, false);
            this.clothORM = TextureLab.fromBuffer("clothORM", OC, NC, scene, true, false);
            this.clothNormal = TextureLab.normalFrom("clothNormal", HC, NC, 1.5, scene, false);
        }

        dispose() {
            for (const t of [this.plateORM, this.plateNormal,
            this.clothAlbedo, this.clothORM, this.clothNormal]) if (t) t.dispose();
        }
    }

    // =================================================================
    // 6. Toast
    // =================================================================
    class Toast {
        constructor(scene, cfg, field, skinC, skinR) {
            this.scene = scene; this.cfg = cfg; this.field = field;
            this.parts = [];
            this.root = new BABYLON.TransformNode("toastRoot", scene);
            this.crumbMat = this._crumbMat(skinC);
            this.crustMat = this._crustMat(skinR);
            this._top(skinC);
            this._side(field);
            this._bottom(skinC);
            for (const m of this.parts) m.parent = this.root;
        }

        _crumbMat(skin) {
            const cfg = this.cfg;
            const m = new BABYLON.PBRMaterial("crumbMat", this.scene);
            m.albedoTexture = skin.albedo;
            m.metallicTexture = skin.orm;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.metallic = 0.0;
            m.bumpTexture = skin.normal;
            m.bumpTexture.level = 1.0;
            // 【対策】パンは薄いセル壁の集合体で、実際にかなり光を通す。
            //         透過を切ると発泡スチロールの板になる。ただし
            //         厚み 2cm なので効くのは縁だけ
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.tintColor = srgb(1.00, 0.845, 0.585);
            m.subSurface.translucencyIntensity = 0.30;
            m.subSurface.minimumThickness = 0.60;
            m.subSurface.maximumThickness = 2.40;
            m._ccWanted = !!cfg.butter;
            if (cfg.butter) {
                // 溶けたバターの膜。全面ではなく、テクスチャの粗さで濃淡が出る
                m.clearCoat.isEnabled = true;
                m.clearCoat.intensity = 0.45;
                m.clearCoat.roughness = 0.22;
                m.clearCoat.indexOfRefraction = 1.46;
            }
            return m;
        }

        _crustMat(skin) {
            const m = new BABYLON.PBRMaterial("crustMat", this.scene);
            m.albedoTexture = skin.albedo;
            m.metallicTexture = skin.orm;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.metallic = 0.0;
            m.bumpTexture = skin.normal;
            m.bumpTexture.level = 0.60;
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.tintColor = srgb(1.00, 0.640, 0.290);
            m.subSurface.translucencyIntensity = 0.22;
            m.subSurface.minimumThickness = 0.80;
            m.subSurface.maximumThickness = 2.60;
            return m;
        }

        // 上面（切り口）。外周は耳へ丸く落ちる
        _top(skin) {
            const cfg = this.cfg, F = this.field, scene = this.scene;
            const M = cfg.segAngular, Nr = cfg.segRadial;
            const half = skin.half, invUV = 1 / (2 * half);
            const cr = cfg.edgeRoll;

            const total = 1 + Nr * M;
            const pos = new Float32Array(total * 3);
            const uvs = new Float32Array(total * 2);
            const setP = (k, x, y, z) => {
                pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
                uvs[k * 2] = x * invUV + 0.5; uvs[k * 2 + 1] = z * invUV + 0.5;
            };

            const yAt = (x, z) => {
                const S = F.sample(x, z);
                // 【対策】縁の丸めは「輪郭からの垂直距離」で作る。放射方向の
                //         距離で作ると、角だけ丸みが太くなって座布団になる
                const e = clamp(S.d / cr, 0, 1);
                const quarter = 1 - Math.sqrt(Math.max(0, 1 - (1 - e) * (1 - e)));
                // 【対策】輪郭上では高さ場のゆらぎも消して基準面へ収束させる。
                //         そうしないと最外周が耳の上端（厚み - 丸み）と一致せず、
                //         切り口と耳の間に 1mm 弱の隙間が周回する
                const hs = mix(cfg.thickness, S.hMacro, smooth(0, 1, e));
                return hs - cr * quarter;
            };

            setP(0, 0, yAt(0, 0), 0);
            // 【対策】等間隔に刻むと、細部と丸みのある外周が足りない
            const tOf = (i) => Math.pow(i / Nr, 0.78);
            const COS = new Float32Array(M), SIN = new Float32Array(M);
            for (let j = 0; j < M; j++) { const a = TAU * j / M; COS[j] = Math.cos(a); SIN[j] = Math.sin(a); }

            for (let i = 1; i <= Nr; i++) {
                const t = tOf(i);
                for (let j = 0; j < M; j++) {
                    const r = t * F.outlineAt(TAU * j / M);
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
            const mesh = makeMesh("toastTop", pos, new Uint32Array(idx), uvs, scene);
            mesh.material = this.crumbMat;
            mesh.receiveShadows = true;
            this.parts.push(mesh);
            this.topRing = { M };
        }

        // 耳（周囲のクラスト）。切り口の丸みの下端から底の丸みの上端まで
        _side(F) {
            const cfg = this.cfg, scene = this.scene;
            const M = cfg.segAngular, NV = cfg.segSide, cr = cfg.edgeRoll;
            const yHi = cfg.thickness - cr, yLo = cr;
            const total = (NV + 1) * (M + 1);
            const pos = new Float32Array(total * 3);
            const uvs = new Float32Array(total * 2);
            const tileU = 1 / 8.0, tileV = 1 / (cfg.thickness * 1.35);

            for (let i = 0; i <= NV; i++) {
                const v = i / NV;
                // 【対策】まっすぐな壁にすると押し出しの箱になる。焼いたパンの
                //         側面は中ほどがふくらむ
                const bulge = 1 + cfg.sideBulge * Math.sin(Math.PI * v) * 4;
                for (let j = 0; j <= M; j++) {
                    const a = TAU * (j % M) / M;
                    const R = F.outlineAt(a) * bulge;
                    const k = i * (M + 1) + j;
                    // 【対策】上下端を内側へ寄せると、上面・底面の丸めの
                    //         下端と半径が合わず、周囲一周に口が開く。
                    //         ふくらみは sin(πv) なので端では必ず 1 に戻る
                    pos[k * 3] = R * Math.cos(a);
                    pos[k * 3 + 1] = mix(yHi, yLo, v);
                    pos[k * 3 + 2] = R * Math.sin(a);
                    uvs[k * 2] = F.arcAt(a) * tileU;
                    uvs[k * 2 + 1] = v * cfg.thickness * tileV;
                }
                // 継ぎ目の重複頂点だけ UV を一周ぶん進める
                uvs[(i * (M + 1) + M) * 2] = F.perimeter * tileU;
            }

            const idx = [];
            for (let i = 0; i < NV; i++) {
                for (let j = 0; j < M; j++) {
                    const a = i * (M + 1) + j, b = a + 1;
                    const c = a + (M + 1), d = c + 1;
                    idx.push(a, c, b, b, c, d);       // 外向き
                }
            }
            const mesh = makeMesh("toastSide", pos, new Uint32Array(idx), uvs, scene);
            mesh.material = this.crustMat;
            mesh.receiveShadows = true;
            this.parts.push(mesh);
        }

        // 底面（切り口。皿に接するので焼き色は見えないが、縁が回り込む）
        _bottom(skin) {
            const cfg = this.cfg, F = this.field, scene = this.scene;
            const M = cfg.segAngular, Nr = cfg.segBottom, cr = cfg.edgeRoll;
            const half = skin.half, invUV = 1 / (2 * half);

            const total = 1 + Nr * M;
            const pos = new Float32Array(total * 3);
            const uvs = new Float32Array(total * 2);
            const setP = (k, x, y, z) => {
                pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
                // 底は見えないが、上面と同じ模様が裏返しに出ると気付かれる
                uvs[k * 2] = -x * invUV + 0.5; uvs[k * 2 + 1] = z * invUV + 0.5;
            };
            const yAt = (x, z) => {
                const d = -F.sdf(x, z);
                const e = clamp(d / cr, 0, 1);
                const rise = cr * (1 - Math.sqrt(Math.max(0, 1 - (1 - e) * (1 - e))));
                const dent = (Noise.fbm2(x * 1.6 + 90, z * 1.6 + 12, cfg.fieldSeed + 211, 3) - 0.5) * 0.055;
                return rise + dent * smooth(0.2, 1.2, d);
            };

            setP(0, 0, yAt(0, 0), 0);
            const tOf = (i) => Math.pow(i / Nr, 0.72);
            for (let i = 1; i <= Nr; i++) {
                const t = tOf(i);
                for (let j = 0; j < M; j++) {
                    const a = TAU * j / M;
                    const r = t * F.outlineAt(a);
                    const x = r * Math.cos(a), z = r * Math.sin(a);
                    setP(1 + (i - 1) * M + j, x, yAt(x, z), z);
                }
            }
            const idx = [];
            // 下向き（上面の逆）
            for (let j = 0; j < M; j++) idx.push(0, 1 + (j + 1) % M, 1 + j);
            for (let i = 1; i < Nr; i++) {
                const r0 = 1 + (i - 1) * M, r1 = 1 + i * M;
                for (let j = 0; j < M; j++) {
                    const jn = (j + 1) % M;
                    idx.push(r0 + j, r0 + jn, r1 + j, r0 + jn, r1 + jn, r1 + j);
                }
            }
            const mesh = makeMesh("toastBottom", pos, new Uint32Array(idx), uvs, scene);
            mesh.material = this.crumbMat;
            this.parts.push(mesh);
        }

        bounds() {
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
            for (const m of this.parts) {
                m.computeWorldMatrix(true);
                const bb = m.getBoundingInfo().boundingBox;
                minX = Math.min(minX, bb.minimumWorld.x); maxX = Math.max(maxX, bb.maximumWorld.x);
                minY = Math.min(minY, bb.minimumWorld.y); maxY = Math.max(maxY, bb.maximumWorld.y);
                minZ = Math.min(minZ, bb.minimumWorld.z); maxZ = Math.max(maxZ, bb.maximumWorld.z);
            }
            return { minX, maxX, minY, maxY, minZ, maxZ };
        }

        dispose() {
            for (const m of this.parts) m.dispose();
            this.parts.length = 0;
            if (this.crumbMat) this.crumbMat.dispose();
            if (this.crustMat) this.crustMat.dispose();
            if (this.root) this.root.dispose();
        }
    }


    // =================================================================
    // 6b. FriedEgg : 白身（上面 + こば + 底面）+ 黄身
    // =================================================================
    class FriedEgg {
        // baseAt(x, z) … この卵のローカル座標におけるトースト上面の高さ。
        // 【対策】トーストの上面は ±0.5mm うねっている。白身の底を平らな
        //         円板のままにすると、高い所では下から突き抜け、低い所では
        //         浮いて隙間が出る。底をパンの表面に沿わせる
        constructor(scene, cfg, field, skinW, skinY, baseAt) {
            this.scene = scene; this.cfg = cfg; this.field = field;
            this.baseAt = baseAt || (() => 0);
            this.parts = [];
            this.root = new BABYLON.TransformNode("eggRoot", scene);
            this.whiteMat = this._whiteMat(skinW);
            this.yolkMat = this._yolkMat(skinY);
            this.white = this._buildWhite(skinW);
            this.yolk = this._buildYolk();
            for (const m of this.parts) m.parent = this.root;
        }

        _buildWhite(skin) {
            const cfg = this.cfg, F = this.field, scene = this.scene;
            const M = cfg.segAngular, Nr = cfg.segRadial;
            const half = skin.half, invUV = 1 / (2 * half);
            const base = (x, z) => this.baseAt(x, z) - cfg.sink;   // 少し沈める

            const nTop = 1 + Nr * M;
            const iRimT = nTop, iRimB = nTop + M, iBotC = nTop + 2 * M, iBot = iBotC + 1;
            const total = iBot + M;
            const pos = new Float32Array(total * 3);
            const uvs = new Float32Array(total * 2);
            const setP = (k, x, y, z) => {
                pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
                uvs[k * 2] = x * invUV + 0.5; uvs[k * 2 + 1] = z * invUV + 0.5;
            };
            setP(0, 0, base(0, 0) + F.sample(0, 0).h, 0);

            // 【対策】半径方向を等間隔で刻むと、細部の多い外周が足りない
            const tOf = (i) => Math.pow(i / Nr, 0.80);
            const COS = new Float32Array(M), SIN = new Float32Array(M);
            for (let j = 0; j < M; j++) { const a = TAU * j / M; COS[j] = Math.cos(a); SIN[j] = Math.sin(a); }

            for (let i = 1; i <= Nr; i++) {
                const t = tOf(i);
                for (let j = 0; j < M; j++) {
                    const r = t * F.outlineAt(j / M);
                    const x = r * COS[j], z = r * SIN[j];
                    setP(1 + (i - 1) * M + j, x, base(x, z) + F.sample(x, z).h, z);
                }
            }
            for (let j = 0; j < M; j++) {
                const k = 1 + (Nr - 1) * M + j;
                const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2];
                const yb = base(x, z);
                setP(iRimT + j, x, y, z);
                setP(iRimB + j, x, yb, z);
                setP(iBot + j, x, yb, z);
            }
            setP(iBotC, 0, base(0, 0), 0);

            const idx = [];
            for (let j = 0; j < M; j++) idx.push(0, 1 + j, 1 + (j + 1) % M);
            for (let i = 1; i < Nr; i++) {
                const r0 = 1 + (i - 1) * M, r1 = 1 + i * M;
                for (let j = 0; j < M; j++) {
                    const jn = (j + 1) % M;
                    idx.push(r0 + j, r1 + j, r0 + jn, r0 + jn, r1 + j, r1 + jn);
                }
            }
            for (let j = 0; j < M; j++) {                    // こば（外向き）
                const jn = (j + 1) % M;
                idx.push(iRimT + j, iRimB + j, iRimT + jn, iRimT + jn, iRimB + j, iRimB + jn);
            }
            for (let j = 0; j < M; j++) idx.push(iBotC, iBot + (j + 1) % M, iBot + j);

            const mesh = makeMesh("eggWhite", pos, new Uint32Array(idx), uvs, scene);
            mesh.material = this.whiteMat;
            mesh.receiveShadows = true;
            this.parts.push(mesh);
            return mesh;
        }

        _whiteMat(skin) {
            const cfg = this.cfg;
            const m = new BABYLON.PBRMaterial("eggWhiteMat", this.scene);
            m.albedoTexture = skin.albedo;
            m.metallicTexture = skin.orm;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.metallic = 0.0;
            m.bumpTexture = skin.normal;
            m.bumpTexture.level = 1.0;
            // 【対策】卵白は牛乳と同じ多重散乱体。透過を切ると石膏になり、
            //         薄い縁が「白い紙」に見える。ただし強くしすぎると
            //         下の色まで拾って茶色い半透明シートになる
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.tintColor = srgb(1.00, 0.965, 0.920);
            m.subSurface.translucencyIntensity = 0.68 * cfg.sss;
            m.subSurface.thicknessTexture = skin.thickness;
            m.subSurface.minimumThickness = 0.02;
            m.subSurface.maximumThickness = 1.25;
            // 【対策】濡れた表面は「粗さ 0」ではなく「粗い面の上の薄い水膜」。
            //         ハイライトが2段になって初めて濡れて見える
            m.clearCoat.isEnabled = true;
            // 【対策】クリアコートを強くしすぎると、白身が「透明なゼリー」に
            //         なる。濡れてはいるが水膜は薄く、下地の肌理は見える
            m.clearCoat.intensity = 0.72 * cfg.wet;
            m.clearCoat.roughness = 0.130;
            m.clearCoat.indexOfRefraction = 1.34;
            return m;
        }

        _buildYolk() {
            const cfg = this.cfg, scene = this.scene;
            const NU = cfg.yolkSegU, NV = cfg.yolkSegV;
            const sd = (cfg.fieldSeed ^ 0x27d4eb2f) >>> 0;
            const total = (NV + 1) * (NU + 1);
            const pos = new Float32Array(total * 3);
            const uvs = new Float32Array(total * 2);
            // 張りが弱いほど上面が平たい。下半分は白身に丸く沈むので潰さない
            const flat = 0.10 + 0.22 * (1 - cfg.yolkBulge);

            for (let iv = 0; iv <= NV; iv++) {
                const v = iv / NV, th = v * Math.PI;
                const st = Math.sin(th), ct = Math.cos(th);
                for (let iu = 0; iu <= NU; iu++) {
                    const u = iu / NU, ph = u * TAU;
                    const ux = st * Math.cos(ph), uy = ct, uz = st * Math.sin(ph);
                    // 卵黄膜のうねり（3D なので継ぎ目が出ない）
                    const n1 = Noise.fbm3(ux * 1.9 + 11, uy * 1.9 + 5, uz * 1.9 + 23, sd, 3) - 0.5;
                    const n2 = Noise.fbm3(ux * 5.5, uy * 5.5, uz * 5.5, sd + 61, 2) - 0.5;
                    const rr = 1 + n1 * 0.055 * cfg.yolkBulge + n2 * 0.016;
                    const up = Math.max(0, uy);
                    const k = iv * (NU + 1) + iu;
                    pos[k * 3] = cfg.yolkRX * rr * ux;
                    pos[k * 3 + 1] = cfg.yolkRY * rr * uy * (1 - flat * up * up);
                    pos[k * 3 + 2] = cfg.yolkRZ * rr * uz;
                    uvs[k * 2] = u; uvs[k * 2 + 1] = v;
                }
            }
            const idx = [];
            for (let iv = 0; iv < NV; iv++) {
                for (let iu = 0; iu < NU; iu++) {
                    const a = iv * (NU + 1) + iu, b = a + 1;
                    const c = a + (NU + 1), d = c + 1;
                    idx.push(a, c, b, b, c, d);   // 外向き
                }
            }
            const mesh = makeMesh("eggYolk", pos, new Uint32Array(idx), uvs, scene);
            mesh.position.set(cfg.yolkX, this.baseAt(cfg.yolkX, cfg.yolkZ) - cfg.sink + cfg.yolkY, cfg.yolkZ);
            mesh.rotation.z = 0.045; mesh.rotation.x = -0.03;   // 水平だと工業製品に見える
            mesh.material = this.yolkMat;
            mesh.receiveShadows = true;
            this.parts.push(mesh);
            return mesh;
        }

        _yolkMat(skin) {
            const cfg = this.cfg;
            const m = new BABYLON.PBRMaterial("eggYolkMat", this.scene);
            m.albedoTexture = skin.albedo;
            m.metallicTexture = skin.orm;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.metallic = 0.0;
            m.bumpTexture = skin.normal;
            m.bumpTexture.level = 0.55;
            // 【対策】黄身は濃い懸濁液で外周が光を通す。透過を切ると
            //         「橙色のゴムボール」になる
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.tintColor = srgb(1.00, 0.470, 0.070);
            m.subSurface.translucencyIntensity = cfg.yolkSSS;
            m.subSurface.minimumThickness = 0.30;
            m.subSurface.maximumThickness = 2.10;
            m.clearCoat.isEnabled = true;
            // 【対策】艶が鋭すぎると飴細工になる。半熟の黄身の表面は
            //         濡れてはいるが鏡ではない
            m.clearCoat.intensity = 0.80 * cfg.yolkWet;
            m.clearCoat.roughness = 0.105;
            m.clearCoat.indexOfRefraction = 1.35;
            return m;
        }

        dispose() {
            for (const m of this.parts) m.dispose();
            this.parts.length = 0;
            if (this.whiteMat) this.whiteMat.dispose();
            if (this.yolkMat) this.yolkMat.dispose();
            if (this.root) this.root.dispose();
        }
    }

    // =================================================================
    // 7. Table : 皿 + クロス
    // =================================================================
    class Table {
        constructor(scene, cfg, skin) {
            this.scene = scene; this.cfg = cfg;
            this.parts = [];
            this.casters = [];      // 影を落とす部品（クロスは受けるだけ）
            this.root = new BABYLON.TransformNode("tableRoot", scene);
            this.mats = [];

            if (cfg.showPlate) this._plate(skin);
            if (cfg.showCloth) this._cloth(skin);
            for (const m of this.parts) m.parent = this.root;
        }

        _plate(skin) {
            const cfg = this.cfg, scene = this.scene;
            const TH = 0.34;
            // --- 内側の断面（見込み → リム）
            const inner = [];
            inner.push([0, 0]);
            const R1 = cfg.plateR;
            for (let i = 1; i <= 40; i++) {
                const s = i / 40, r = R1 * s;
                // 見込みは平ら、外へ向かってなだらかに立ち上がる
                const y = 1.45 * smooth(0.52, 1.0, s) + 0.045 * smooth(0.0, 0.55, s);
                inner.push([r, y]);
            }
            // --- 外側 = 内側を板厚ぶんオフセット
            // 【対策】内側だけで皿を作ると、低い角度から見たとき手前のリムが
            //         裏面カリングで消えて向こう側が透ける
            const outward = (k) => {
                const a = inner[Math.max(0, k - 1)], b = inner[Math.min(inner.length - 1, k + 1)];
                const dr = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dr, dy) || 1;
                return [dy / L, -dr / L];
            };
            const outer = inner.map((p, k) => {
                const n = outward(k);
                return [p[0] + TH * n[0], p[1] + TH * n[1]];
            });
            // --- リムの巻き（内の端から外の端へ半円）
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
            // 高台（底の輪）を省いて平らに閉じる
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
            pm.albedoColor = srgb(0.955, 0.955, 0.950);
            pm.metallicTexture = skin.plateORM;
            pm.useAmbientOcclusionFromMetallicTextureRed = true;
            pm.useRoughnessFromMetallicTextureGreen = true;
            pm.useMetallnessFromMetallicTextureBlue = true;
            pm.metallic = 0.0;
            pm.bumpTexture = skin.plateNormal;
            pm.bumpTexture.level = 0.30;
            // 【対策】白磁は釉薬の下に不透明な素地がある。透過を入れないと
            //         プラスチックの皿になる
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

        _cloth(skin) {
            const scene = this.scene;
            const mesh = BABYLON.MeshBuilder.CreateGround("cloth", { width: 120, height: 120, subdivisions: 2 }, scene);
            mesh.position.y = -0.36;
            const cm = new BABYLON.PBRMaterial("clothMat", scene);
            cm.albedoTexture = skin.clothAlbedo;
            cm.metallicTexture = skin.clothORM;
            cm.useAmbientOcclusionFromMetallicTextureRed = true;
            cm.useRoughnessFromMetallicTextureGreen = true;
            cm.useMetallnessFromMetallicTextureBlue = true;
            cm.metallic = 0.0;
            cm.bumpTexture = skin.clothNormal;
            cm.bumpTexture.level = 0.9;
            for (const t of [cm.albedoTexture, cm.metallicTexture, cm.bumpTexture]) {
                t.uScale = 16; t.vScale = 16;
            }
            mesh.material = cm;
            mesh.receiveShadows = true;
            this.mats.push(cm);
            this.parts.push(mesh);
        }

        dispose() {
            for (const m of this.parts) m.dispose();
            for (const m of this.mats) m.dispose();
            this.parts.length = 0; this.mats.length = 0;
            if (this.root) this.root.dispose();
        }
    }

    // =================================================================
    // 8. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.045, 0.045, 0.048, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    // 【対策】環境マップが鮮明なままだと、白磁に建物の輪郭がそのまま映る
    env.lodGenerationOffset = 0.50;
    scene.environmentIntensity = 0.80;
    scene.createDefaultSkybox(env, true, 1000, 0.60, false);

    const camera = new BABYLON.ArcRotateCamera("cam", -1.62, 0.90, 33, new V3(0, 1.7, 0), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 8;
    camera.minZ = 0.05;
    camera.lowerRadiusLimit = 9;
    camera.upperRadiusLimit = 160;
    camera.upperBetaLimit = 1.42;
    camera.fov = 0.52;
    scene.cameraToUseForPointers = camera;

    // 【対策】食品写真の照明は「大きく柔らかい面光源」。平行光源をそのまま
    //         強く当てると、耳の水疱に硬い点ハイライトが並んで金属に見える
    const key = new BABYLON.DirectionalLight("key", new V3(-0.38, -0.98, 0.62).normalize(), scene);
    key.position = new V3(14, 30, -18);
    key.intensity = 2.15;
    key.diffuse = new BABYLON.Color3(1.0, 0.985, 0.955);
    key.specular = new BABYLON.Color3(0.28, 0.27, 0.26);
    key.autoCalcShadowZBounds = true;

    const rim = new BABYLON.DirectionalLight("rim", new V3(0.72, -0.45, -0.88).normalize(), scene);
    rim.intensity = 0.95;
    rim.diffuse = new BABYLON.Color3(1.0, 0.94, 0.88);
    rim.specular = new BABYLON.Color3(0.16, 0.155, 0.15);

    const fill = new BABYLON.HemisphericLight("fill", new V3(0, 1, 0), scene);
    fill.intensity = 0.26;
    fill.diffuse = new BABYLON.Color3(0.93, 0.95, 1.0);
    fill.groundColor = new BABYLON.Color3(0.24, 0.22, 0.20);
    fill.specular = new BABYLON.Color3(0, 0, 0);

    // 【対策】法線マップの v 成分の検証用。既定の照明は全部「上から」で
    //         トーストは寝ているので、v 方向の凹凸が陰影にほとんど出ない
    const diag = new BABYLON.DirectionalLight("diag", new V3(0.05, -0.12, 0.99).normalize(), scene);
    diag.intensity = 0;

    const sg = new BABYLON.ShadowGenerator(1024, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0022;
    sg.normalBias = 0.020;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.14;
    ip.contrast = 1.10;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.3;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    // =================================================================
    //  生成 / 差し替え
    // =================================================================
    let state = null, tableSkin = null, table = null, ssao = null, onRebuilt = null;
    let viewMode = 0;

    function applyViewMode(mode) {
        if (!state) return;
        const pairs = [[state.toast.crumbMat, state.skinC], [state.toast.crustMat, state.skinR]];
        if (state.egg) {
            pairs.push([state.egg.whiteMat, state.skinEW], [state.egg.yolkMat, state.skinEY]);
        }
        for (const [m, s] of pairs) {
            if (mode === 0) {
                m.albedoTexture = s.albedo;
                m.albedoColor = new BABYLON.Color3(1, 1, 1);
                m.metallicTexture = s.orm;
                m.metallic = 0.0; m.roughness = null;
                m.bumpTexture = s.normal;
                m.emissiveTexture = null;
                m.emissiveColor = new BABYLON.Color3(0, 0, 0);
                m.subSurface.isTranslucencyEnabled = true;
                if (m.clearCoat) m.clearCoat.isEnabled = m._ccWanted === true;
            } else if (mode === 1) {
                // 白クレイ: 形とすの立体感だけを見る
                m.albedoTexture = null;
                m.albedoColor = srgb(0.80, 0.80, 0.80);
                m.metallicTexture = null;
                m.metallic = 0.0; m.roughness = 0.72;
                m.bumpTexture = s.normal;
                m.emissiveTexture = null;
                m.emissiveColor = new BABYLON.Color3(0, 0, 0);
                m.subSurface.isTranslucencyEnabled = false;
                if (m.clearCoat) m.clearCoat.isEnabled = false;
            } else {
                m.albedoTexture = null;
                m.albedoColor = new BABYLON.Color3(0, 0, 0);
                m.metallicTexture = null;
                m.metallic = 0.0; m.roughness = 1.0;
                m.bumpTexture = null;
                m.emissiveTexture = s.normal;
                m.emissiveColor = new BABYLON.Color3(1, 1, 1);
                m.subSurface.isTranslucencyEnabled = false;
                if (m.clearCoat) m.clearCoat.isEnabled = false;
            }
        }
        if (table) table.root.setEnabled(mode === 0);
    }

    function build(presetKey, seed, shape, butter, flipY, eggOn, eggPreset) {
        // 【対策】テクスチャを捨てずに作り替えると、切り替えのたびに
        //         GPU 上のテクスチャが積み上がる。形もテクスチャも seed と
        //         焼き加減に依存するのでキャッシュは効かない。必ず dispose する
        if (state) {
            state.toast.dispose();
            state.skinC.dispose();
            state.skinR.dispose();
            if (state.egg) { state.egg.dispose(); state.skinEW.dispose(); state.skinEY.dispose(); }
            state = null;
        }

        const cfg = buildConfig(presetKey, seed, shape, butter, flipY);
        const t0 = performance.now();
        const field = new Field(cfg);
        const skinC = new CrumbSkin(scene, cfg, field);
        const skinR = new CrustSkin(scene, cfg, field);
        const toast = new Toast(scene, cfg, field, skinC, skinR);

        // --- 目玉焼き
        let egg = null, skinEW = null, skinEY = null, eggCfg = null;
        if (eggOn) {
            eggCfg = buildEggConfig(eggPreset, seed, flipY);
            const ef = new EggField(eggCfg);
            // 置き場所を先に決める。白身の底はここで決まる姿勢のまま
            // トーストの高さ場を引くので、卵→パンの座標変換が必要になる
            const r = new Rng((seed ^ 0x7feb352d) >>> 0);
            const ox = r.range(-0.28, 0.28), oz = 0.10 + r.range(-0.28, 0.28);
            const ry = r.range(0, TAU), cs = Math.cos(ry), sn = Math.sin(ry);
            // パンからはみ出さない大きさへ寄せる（必要なときだけ縮む）
            const fit = ef.fitInside((tx, tz) => field.sdf(tx, tz), ox, oz, cs, sn, 0.28);
            const baseAt = (ex, ez) =>
                field.sample(ox + ex * cs + ez * sn, oz - ex * sn + ez * cs).hMacro;
            skinEW = new EggWhiteSkin(scene, eggCfg, ef);
            skinEY = new EggYolkSkin(scene, eggCfg);
            egg = new FriedEgg(scene, eggCfg, ef, skinEW, skinEY, baseAt);
            eggCfg.fit = fit;
            // トーストの root に親子付けして向きも一緒に回す
            egg.root.parent = toast.root;
            egg.root.position.set(ox, 0, oz);
            egg.root.rotation.y = ry;
            // クリアコートは通常表示のときだけ（白クレイ/法線では切る）
            egg.whiteMat._ccWanted = true;
            egg.yolkMat._ccWanted = true;
        }

        if (!table) {
            tableSkin = new TableSkin(scene, cfg);
            table = new Table(scene, cfg, tableSkin);
        }

        // 【対策】影を落とすのをトーストだけにすると、シャドウマップに
        //         皿が入らない。皿は遮蔽物として扱われないので、トーストの
        //         影が皿を突き抜けてクロスに落ちる。皿も caster に入れる
        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        for (const m of toast.parts) sg.addShadowCaster(m, true);
        if (egg) for (const m of egg.parts) sg.addShadowCaster(m, true);
        if (table) for (const m of table.casters) sg.addShadowCaster(m, true);

        // 皿の中心に置き、少し斜めに構える（真正面は工業製品に見える）
        const bb0 = toast.bounds();
        toast.root.position.x = -(bb0.minX + bb0.maxX) * 0.5;
        toast.root.position.z = -(bb0.minZ + bb0.maxZ) * 0.5;
        toast.root.rotation.y = 0.10;
        const bb = toast.bounds();

        state = {
            cfg, field, skinC, skinR, toast, egg, eggCfg, skinEW, skinEY,
            bounds: bb, ms: performance.now() - t0
        };
        applyViewMode(viewMode);
        if (onRebuilt) onRebuilt(state);

        // 【対策】素のトースト版と同じ "[Toast]" だと、コンソールを見ても
        //         どちらのシーンのログか分からない。タグを分ける
        console.log("[EggToast] eggtoast-C /", cfg.label, "/", cfg.shape,
            egg ? "/ 目玉焼き " + eggCfg.label : "/ 卵なし", "/ seed =", cfg.seed,
            "/", (bb.maxX - bb.minX).toFixed(1) + "×" + (bb.maxZ - bb.minZ).toFixed(1)
            + "×" + (bb.maxY - bb.minY).toFixed(2) + "cm",
            "/", state.ms.toFixed(0) + "ms");
        return state;
    }

    build(START_PRESET, START_SEED, GLOBAL.shape, GLOBAL.butter, GLOBAL.normalFlipY,
        EGG_GLOBAL.show, START_EGG);

    if (GLOBAL.useSSAO) {
        // 【対策】すの中の陰りが無いと、法線マップで凹んで見えていても
        //         パンがただの印刷物になる。半径は「すの直径」に合わせる
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.42;
        ssao.totalStrength = 1.15;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 140;
        ssao.minZAspect = 0.20;
    }

    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    // 【対策】パンは自ら光らない。ブルームを効かせると白い部分が発光して
    //         安っぽくなる。皿のハイライトだけを拾う閾値にする
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.96;
    dp.bloomWeight = 0.08;
    dp.bloomKernel = 40;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.16;
    dp.depthOfFieldEnabled = GLOBAL.useDOF;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.Medium;
    dp.depthOfField.fStop = 6.0;
    dp.depthOfField.focalLength = 85;
    dp.depthOfField.focusDistance = camera.radius * 1000;
    scene.onBeforeRenderObservable.add(() => {
        if (dp.depthOfFieldEnabled) dp.depthOfField.focusDistance = camera.radius * 1000;
    });

    // =================================================================
    // 9. GUI
    // =================================================================
    // 【対策】フルスクリーンGUIは既定でシーンと同じカメラで合成されるため、
    //         Bloom / 被写界深度 / シャープンがUIにも乗ってボケる。
    //         GUI専用カメラを layerMask で分離する
    // 【対策】カメラを2台にすると、Babylon の各機能が「activeCameras の末尾＝
    //   描画の基準カメラ」と見なす所で全部 guiCam を拾い、Inspector の
    //   デバッグ機能が 3 系統まとめて壊れる（ヘッダの変更点を参照）。
    //   既定ではカメラを分けず、GUI だけポストプロセスの後に合成する
    const GUI_MASK = 0x20000000;

    // guiOwnCamera = true（従来方式）にしたときだけ使う。基準カメラを明示して
    // 壊れた 3 系統を直す
    function bindDebugCamera(scene, mainCam) {
        // (1) UtilityLayerRenderer（Physics Helper / ギズモ / 選択枠の土台）
        // 【対策】Inspector が内部の WeakMap に抱えていて外から触れないレイヤーも
        //   あるので、インスタンスを追わずプロトタイプごと差し替える
        const ULR = BABYLON.UtilityLayerRenderer;
        if (ULR) {
            if (!ULR.prototype.__foodCamPatch) {
                ULR.__foodCamTable = new WeakMap();
                const orig = ULR.prototype.getRenderCamera;
                ULR.prototype.getRenderCamera = function (getRigParentIfPossible) {
                    if (!this._renderCamera) {
                        const cam = ULR.__foodCamTable.get(this.originalScene);
                        if (cam) {
                            return (getRigParentIfPossible && cam.isRigCamera)
                                ? cam.rigParent : cam;
                        }
                    }
                    return orig.call(this, getRigParentIfPossible);
                };
                ULR.prototype.__foodCamPatch = true;
            }
            ULR.__foodCamTable.set(scene, mainCam);
        }

        // (2) EffectLayer（GlowLayer / HighlightLayer / 選択のアウトライン）
        // 【対策】layerMask では止まらない。Inspector は選択のたびに後から
        //   足してくるので、未束縛のものだけを毎フレーム拾う
        scene.onBeforeRenderObservable.add(() => {
            const ls = scene.effectLayers;
            if (!ls) return;
            for (let i = 0; i < ls.length; i++) {
                const l = ls[i];
                if (l.__foodCamBound) continue;
                l.__foodCamBound = true;
                if (l._effectLayerOptions) l._effectLayerOptions.camera = mainCam;
                if (l._mainTexture) l._mainTexture.activeCamera = mainCam;
            }
        });

        // (3) scene.activeCamera を描画後とポインタ処理の直前に戻す
        const back = () => {
            if (scene.activeCamera !== mainCam) scene.activeCamera = mainCam;
        };
        scene.onAfterRenderObservable.add(back);
        scene.onPrePointerObservable.add(back);
    }

    let guiCam = null;
    if (GLOBAL.guiOwnCamera) {
        guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene);
        guiCam.layerMask = GUI_MASK;
        scene.activeCameras = [camera, guiCam];
        bindDebugCamera(scene, camera);
    } else {
        // カメラは1台のまま。activeCamera が主カメラ以外を指す瞬間が無いので、
        // Inspector のデバッグ機能は何も細工せずに正しく動く
        scene.activeCameras = [camera];
    }
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (ui.layer) {
        if (GLOBAL.guiOwnCamera) {
            ui.layer.layerMask = GUI_MASK;
        } else {
            // 【対策】前景レイヤーの applyPostProcess を false にすると、
            //   Babylon はそのレイヤーを _afterCameraPostProcessStage で描く。
            //   つまり Bloom などを掛け終わった後に GUI を重ねるので、
            //   カメラを分けなくても UI はボケない
            ui.layer.applyPostProcess = false;
        }
    }

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

    addLabel("TOAST", 11, COL.sub, "18px");
    addLabel("焼き加減", 13, COL.accent, "22px");

    let curPreset = START_PRESET, curSeed = START_SEED;
    let curShape = GLOBAL.shape, curButter = GLOBAL.butter, curFlipY = GLOBAL.normalFlipY;
    let curEggOn = EGG_GLOBAL.show, curEgg = START_EGG;
    const EGG_KEYS = Object.keys(EGG_PRESETS);
    const rebuild = () => build(curPreset, curSeed, curShape, curButter, curFlipY, curEggOn, curEgg);

    const presetButtons = {};
    function highlight() {
        for (const k in presetButtons) presetButtons[k].background = (k === curPreset) ? COL.active : COL.idle;
        shapeBtn.textBlock.text = "形: " + (curShape === "yama" ? "山型" : "角食");
        butterBtn.textBlock.text = "バター: " + (curButter ? "ON" : "OFF");
        butterBtn.background = curButter ? COL.active : COL.idle;
        flipBtn.textBlock.text = "法線 Y: " + (curFlipY ? "反転" : "標準");
        flipBtn.background = curFlipY ? COL.active : COL.idle;
        eggBtn.textBlock.text = "目玉焼き: " + (curEggOn ? "ON" : "OFF");
        eggBtn.background = curEggOn ? COL.active : COL.idle;
        eggPreBtn.textBlock.text = "卵: " + EGG_PRESETS[curEgg].label;
        eggPreBtn.isEnabled = curEggOn;
        eggPreBtn.alpha = curEggOn ? 1.0 : 0.45;
    }
    for (const k of Object.keys(PRESETS)) {
        presetButtons[k] = addButton("p_" + k, PRESETS[k].label, () => {
            curPreset = k; rebuild(); highlight();
        });
    }

    addSpacer();
    const shapeBtn = addButton("shape", "形: 角食", () => {
        curShape = (curShape === "yama") ? "kaku" : "yama";
        rebuild(); highlight();
    });
    const butterBtn = addButton("butter", "バター: OFF", () => {
        curButter = !curButter; rebuild(); highlight();
    });
    addSpacer();
    addLabel("目玉焼き", 13, COL.accent, "22px");
    const eggBtn = addButton("egg", "目玉焼き: ON", () => {
        curEggOn = !curEggOn; rebuild(); highlight();
    });
    const eggPreBtn = addButton("eggPre", "卵: 半熟", () => {
        if (!curEggOn) return;
        curEgg = EGG_KEYS[(EGG_KEYS.indexOf(curEgg) + 1) % EGG_KEYS.length];
        rebuild(); highlight();
    });

    addSpacer();
    addButton("reseed", "別の一枚を焼く", () => {
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
        key.intensity = on ? 0.45 : 2.15;
        diagBtn.textBlock.text = "診断ライト: " + (on ? "ON" : "OFF");
        diagBtn.background = on ? COL.active : COL.idle;
    });
    // 【対策】接線基底の組み方は環境で変わりうるので、法線マップの Y の
    //         符号は現物を見て決めるしかない。すが「へこんで」見える方が正
    const flipBtn = addButton("flipY", "法線 Y: 標準", () => {
        curFlipY = !curFlipY; rebuild(); highlight();
    });
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
            + (st.egg ? "卵 " + (st.eggCfg.whiteRadius * 2 * st.eggCfg.fit).toFixed(1) + " cm / " : "")
            + "生成 " + st.ms.toFixed(0) + " ms\nseed: " + st.cfg.seed;
    };
    onRebuilt(state);
    highlight();

    return scene;
};

export default createScene;