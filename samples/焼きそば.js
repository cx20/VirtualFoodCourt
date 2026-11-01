// =====================================================================
//  Photoreal Yakisoba  /  写実的な「ソース焼きそば」
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//  build: yakisoba-2026-10-07-i
//
//  i: にんじんが宙に浮く指摘への対策。支えを、膨らませた面（具の外接矩形
//     の最高点＋裾、麺の最大値フィルタ）から、麺の実際の上面と具の正確な
//     上面（三角形の面の高さ）に替えた
//
//  h: にんじんが生のスティックに見えた（剛体の棒が山から突き出す）。
//     長さ一定のしなやかな棒として落とし、自重で垂れて麺や具に沿わせる。
//     断面は角の丸い四角、色は少し濃く油の照りと透光を強く。7.5割は麺の中
//
//  g: にんじんの千切りを「角の立った剛体の棒」に。薄板として面に沿わせると、
//     山や具の縁で縦に折れて蜘蛛・水かきのような形になっていた。支えの
//     凸包の上に乗せて、折れずに真っすぐ橋を渡す
//
//  f: 具どうし（豚肉・にんじんがキャベツ）の貫通を解消。後から置く具の
//     下面を、先に置いた具の上面より上に保つ
//
//  e: 麺が具（キャベツ・肉）を突き抜ける指摘への対策
//    ・具を置いたあと、具ごとの高さの区間を格子に書き、区間に入った麺を
//      上（具を越える）か下（具をくぐる）へ逃がしてから麺のメッシュを作る
//    ・上下は「麺 × 具」ごとに1回だけ決める（点ごとだと線分が突き抜ける）
//
//  d: 豚肉を生姜焼き（shogayaki-procedural-2026-10-07）の薄切り肉に置き換え
//    ・不規則な輪郭・しわ・縁のフリル・折れ返り・端の反りを持つ中立面を、
//      法線方向に ±0.75mm ずらして表裏を張る（厚み 1.5mm）
//    ・地色（赤身・焼き色・縁の焦げ・脂）を決めてから、ソースの膜を
//      Beer–Lambert で掛ける。バラ肉なので脂は長辺に沿った層
//    ・繊維の法線マップとアルベドの繊維むら、照りは繊維の凹凸で割る
//
//  c: 「まだいまいち」への対策（参考写真4枚目との比較）
//    ・麺の色: 描画の中央値 [0.65,0.36,0.19] は写真 [0.83,0.56,0.21] より
//      赤く暗い（G/R 0.55 vs 0.67）。黄へ寄せ、照りを強く
//    ・麺の形: 平行な束がリボン状に見えた。束を小さく、曲率を持続させて
//      半径 2〜6cm の輪を描かせる。太さ 3.2mm
//    ・盛り: 皿いっぱいの巣ではなく、皿の 2/3 に収まる山
//    ・にんじんは千切り（幅 2〜3mm）。短冊が太い棒（ソーセージ）に見えた
//    ・青のりが黒胡椒の点に見えた。明るい緑で頂に集める
//    ・豚は白い照りでしいたけに見えた。ソース色に寄せ、照りを抑える
//    ・紅しょうがは幅 3mm の千切りを山の脇に
//
//  b: 「がちがちに固まった塊」に見える指摘への対策
//    ・盛りを台地＋崖から釣鐘＋長い裾に。外周の麺は皿の上へ流す
//    ・麺の量を実寸（蒸し麺 150g ≒ 長さ 40m）に。旧版は厚さ 5mm の殻に
//      その3倍を詰めており、押し合いでフェルト状に圧縮されていた
//    ・麺を盛りの深さ全体に散らし、経路に沿って潜ったり浮いたりさせる
//    ・曲率と縮れを弱め、麺を長く。色のむらは1本の中では抑える
//    ・具は7割を麺に半分埋め、上を麺が通るようにする
//
//  トマトソースのスパゲッティ（tomato-pasta-2026-10-04-b）からの派生。
//  麺の掃引・押し合い・遮蔽はそのまま使い、焼きそばらしさを作り直した:
//    ・麺: 蒸し中華麺。太めで縮れ、長さは短い（炒めると切れる）。
//      パスタでは「縮れると焼きそばに見える」と消した波打ちを、ここでは
//      押し合いのあとに意図して足す
//    ・色: ソースを吸った琥珀色。麺ごと・数 cm ごとの濃淡と、鉄板に
//      当たった所の焦げを大きく振る（パスタでは禁じ手だった）
//    ・盛り: 渦はほとんど作らず、ゆるい山に乱雑に積む
//    ・具: 豚バラ・キャベツ・にんじんの短冊は「厚みのある薄板」として
//      麺の上面に沿わせて置く。4割は麺に半分埋め、上に重なった具は
//      下の具の上へ乗せる
//    ・紅しょうがの山と青のり
//
//  構成:
//    0. CONFIG / 1. Rng・Noise・Mesh utils・TexLab
//    2. Plate  3. Mound  4. Strands・Relax・縮れ・AO
//    5. Noodle mesh  6. 具（薄板）・紅しょうが・青のり  7. Scene  8. Build / GUI
// =====================================================================

var createScene = async function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    const MM = 0.1;     // 単位系: 1 unit = 1 cm

    // ---- 味のプリセット（色はすべて sRGB のアルベド） --------------------
    // 参考写真の実測（ハイライトを除く、照明込み）:
    //   麺の明部 [0.82, 0.43, 0.15] / [0.70, 0.41, 0.07]
    //   麺の影   [0.34, 0.16, 0.04]
    // 【対策】B/R が 0.1〜0.2 と低い。青を残すと茶色が灰色に褪せて
    //         「冷めた焼きそば」になる
    const SAUCE = {
        sauce: {
            label: "ソース（標準）",
            // 【対策】描画は G/R 0.55・B/R 0.29 と、写真（0.67・0.25）より赤く
            //         環境の灰色を拾っていた。G を上げ、青を抜く
            pale: [0.970, 0.790, 0.330],   // ソースが薄い所（麺の地の黄色が出る）
            base: [0.920, 0.620, 0.170],   // 標準
            thick: [0.760, 0.420, 0.090],  // よく絡んだ所
            burnt: [0.450, 0.220, 0.050],  // 鉄板の焦げ（黒に寄せない）
            cover: 0.52, vary: 0.40, char: 0.22, gloss: 1.0,
            pork: [0.520, 0.320, 0.170], porkFat: [0.820, 0.640, 0.420],
            cabTint: 0.40, smear: [0.780, 0.560, 0.380],
            glaze: { sigma: [2.00, 5.20, 12.50], haze: [0.585, 0.330, 0.118], hazeK: 0.150, film: 0.045 }
        },
        kotteri: {
            label: "濃いめ（鉄板焼き）",
            pale: [0.920, 0.680, 0.240],
            base: [0.820, 0.500, 0.120],
            thick: [0.620, 0.320, 0.070],
            burnt: [0.360, 0.160, 0.040],
            cover: 0.60, vary: 0.40, char: 0.40, gloss: 1.15,
            pork: [0.440, 0.250, 0.130], porkFat: [0.740, 0.540, 0.340],
            cabTint: 0.65, smear: [0.700, 0.470, 0.300],
            glaze: { sigma: [2.65, 6.70, 15.20], haze: [0.520, 0.262, 0.082], hazeK: 0.110, film: 0.060 }
        },
        shio: {
            label: "塩焼きそば",
            pale: [0.970, 0.880, 0.560],
            base: [0.940, 0.780, 0.420],
            thick: [0.860, 0.640, 0.290],
            burnt: [0.660, 0.430, 0.170],
            cover: 0.42, vary: 0.35, char: 0.18, gloss: 0.85,
            pork: [0.820, 0.680, 0.540], porkFat: [0.950, 0.900, 0.810],
            cabTint: 0.0, smear: [0.960, 0.900, 0.780],
            // 塩焼きそばは油の膜だけ（ほぼ無色）
            glaze: { sigma: [0.25, 0.50, 1.20], haze: [0.900, 0.840, 0.700], hazeK: 0.08, film: 0.040 }
        }
    };

    // ---- 皿のプリセット ----------------------------------------------
    const PLATES = {
        green: {
            label: "深緑の丸皿",
            // 【対策】暗い器は sRGB 0.23 を下限に（実物の釉薬の反射率 5% 前後）
            albedo: [0.240, 0.300, 0.292], rough: 0.10, cc: 0.85,
            // 口縁だけ釉が薄く、地の白が出る（参考写真2）
            line: { col: [0.780, 0.790, 0.760], r0: 12.75 }
        },
        black: {
            label: "黒い石目皿",
            albedo: [0.235, 0.232, 0.240], rough: 0.40, cc: 0.30,
            speck: true, line: null
        },
        white: {
            label: "白い皿",
            albedo: [0.862, 0.856, 0.842], rough: 0.10, cc: 0.85,
            line: null
        }
    };

    // ---- テーブルのプリセット ------------------------------------------
    const CLOTHS = {
        tweed: {
            label: "灰色のツイード",
            stripes: [[3.0, [0.420, 0.420, 0.430]]],
            rough: 0.92, rib: 0.30, tweed: true
        },
        peach: {
            label: "白に桃色の線",
            stripes: [[2.6, [0.900, 0.885, 0.860]], [0.35, [0.900, 0.640, 0.560]], [0.25, [0.900, 0.885, 0.860]],
                [0.35, [0.900, 0.640, 0.560]]],
            rough: 0.85, rib: 0.35
        },
        wood: {
            label: "白木のテーブル",
            wood: true, rough: 0.55
        }
    };

    const GLOBAL = {
        // ---- 皿（回転体）: r = 中心からの距離, y = 高さ。テーブル面が y=0 ----
        plateR: 13.00,
        rimY: 1.80,
        wellY: 0.55,
        wellR: 8.60,
        wallR: 11.00,
        thick: 0.50,
        footR0: 6.50, footR1: 7.00,
        plateSectors: 192,

        // ---- 盛り ----
        cx: 0.10, cz: 0.10,
        // 1人前（蒸し麺 150g）は直径 18cm 前後の平たい山
        // 【対策】半径 9cm に広げると皿いっぱいの平たい巣になった。
        //         写真の盛りは皿の 2/3 に収まり、こんもり高い
        moundR: 7.60,         // 裾の端まで（台地の縁ではない）
        peak: 5.00,
        // 【対策】0.5cm だと麺が全部その殻に押し込まれ、面として固まった。
        //         芯は盛りの奥の影の受け皿でしかない
        coreDepth: 2.20,

        // ---- 麺 ----
        // 【対策】旧版は 340 本 × 平均 19cm ≒ 65m を 0.5cm の殻に詰めていた。
        //         1人前（蒸し麺 150g）は太さ 2.8mm 換算で 30〜40m
        strands: 125,
        // 蒸し中華麺は 1.6〜1.8mm 角が炒めて膨らみ、写真では 2.5mm 前後に見える
        noodleD: 3.2,
        step: 0.20,
        sides: 8,
        relaxIters: 7,
        crinkle: 1.0,         // 縮れの強さ

        gu: 1.0,              // 具の量（倍率）
        beni: true,
        aonori: true,

        // ---- 描画 ----
        useSSAO: true,
        useDOF: true,
        dofFStop: 2.8,
        dofRatio: 0.070,
        // 【対策】GUI 専用カメラに分けると Inspector の Physics Helper / 選択
        //         ハイライト / ピッカーが壊れる。Layer.applyPostProcess = false で
        //         2台目を作らずに UI をポストプロセスの外へ出す
        guiOwnCamera: false
    };

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;

    // =================================================================
    // 1. Rng / Noise / Mesh utils / TexLab
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

    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    // sRGB → リニア。PBRMaterial の色と頂点カラーはリニア空間
    const s2l = (c) => (c <= 0.04045) ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const l2s = (v) => v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
    const col3 = (a) => new BABYLON.Color3(s2l(a[0]), s2l(a[1]), s2l(a[2]));
    const lin3 = (c) => [s2l(c[0]), s2l(c[1]), s2l(c[2])];

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
        //         上下の継ぎ目に横一文字の線が出る。両軸とも折り返す
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
        }
    };
    // 1次元の値ノイズ（麺の経路の曲率・色のむら用）
    function n1(x, seed) {
        const xi = Math.floor(x), f = x - xi, u = f * f * (3 - 2 * f);
        const a = Noise._h2(xi, 7, seed), b = Noise._h2(xi + 1, 7, seed);
        return a + (b - a) * u;
    }
    function fbm1(x, seed, oct) {
        let s = 0, a = 0.5, f = 1, n = 0;
        for (let o = 0; o < oct; o++) { s += a * n1(x * f, seed + o * 31); n += a; f *= 2; a *= 0.5; }
        return s / n;
    }

    // ---- Mesh utils ---------------------------------------------------
    // 【対策】Babylon の Node コンストラクタは id = name を入れるだけで、
    //         同名メッシュを複数作ると id が重複し、Inspector の選択が飛ぶ
    let _uid = 0;
    function named(mesh, base) {
        mesh.name = base;
        mesh.id = base + "#" + (++_uid);
        return mesh;
    }

    // 三角形ごとの巻き順を「解析的な法線」に合わせる。
    // 【対策】VertexData.ComputeNormals は (v0-v1)×(v2-v1)、つまり右手系の
    //         外積と符号が逆。表になる三角形は「右手系の外積が法線と逆を向く」
    function orient(P, I, N) {
        for (let t = 0; t < I.length; t += 3) {
            const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
            const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
            const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
            const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
            const nx = N[a] + N[b] + N[c], ny = N[a + 1] + N[b + 1] + N[c + 1], nz = N[a + 2] + N[b + 2] + N[c + 2];
            if (cx * nx + cy * ny + cz * nz > 0) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; }
        }
    }

    // 単調3次エルミート（Fritsch–Carlson）。皿の断面がリムで膨らまないように
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
        //         立て、不透明のはずのメッシュが透過パスへ回る（深度が書かれない）
        mesh.hasVertexAlpha = false;
        mesh.tris = indices.length / 3;
        return mesh;
    }

    class Buf {
        constructor(n, T) { this.T = T || Float32Array; this.a = new this.T(Math.max(16, n)); this.n = 0; }
        push(v) { if (this.n >= this.a.length) { const b = new this.T(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; }
        push3(x, y, z) { this.push(x); this.push(y); this.push(z); }
        out() { return this.a.subarray(0, this.n); }
    }
    class Geo {
        constructor(est) {
            est = est || 1024;
            this.P = new Buf(est * 3); this.N = new Buf(est * 3);
            this.U = new Buf(est * 2); this.C = new Buf(est * 4);
            this.I = new Buf(est * 6, Uint32Array);
        }
        get nv() { return this.P.n / 3; }
        v(x, y, z, nx, ny, nz, u, w, c) {
            this.P.push3(x, y, z);
            const l = Math.hypot(nx, ny, nz) || 1;
            this.N.push3(nx / l, ny / l, nz / l);
            this.U.push(u); this.U.push(w);
            this.C.push(c[0]); this.C.push(c[1]); this.C.push(c[2]); this.C.push(1);
            return this.nv - 1;
        }
        t(a, b, c) { this.I.push(a); this.I.push(b); this.I.push(c); }
        q(a, b, c, d) { this.t(a, b, c); this.t(a, c, d); }
        // ref 側を表にして三角形を積む（法線を持たない部品用）
        tr(a, b, c, ref) {
            const P = this.P.a;
            const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
            const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
            const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
            if (cx * ref[0] + cy * ref[1] + cz * ref[2] > 0) this.t(a, c, b); else this.t(a, b, c);
        }
        mesh(name, scene) {
            const P = this.P.out(), N = this.N.out(), I = this.I.out();
            orient(P, I, N);
            return makeMesh(name, Array.from(P), Array.from(I), Array.from(N),
                Array.from(this.U.out()), Array.from(this.C.out()), scene);
        }
        // 巻き順は tr() で決めてあるので、法線は面から計算する
        meshComputed(name, scene) {
            const P = Array.from(this.P.out()), I = Array.from(this.I.out());
            const N = new Array(P.length).fill(0);
            BABYLON.VertexData.ComputeNormals(P, I, N);
            return makeMesh(name, P, I, N, Array.from(this.U.out()), Array.from(this.C.out()), scene);
        }
    }

    const TexLab = {
        _tex(name, w, h, fill, scene, linear, clampAll) {
            // 【対策】createImageData は整数しか受け付けない
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
            // 【対策】ORM と法線は「色」ではない
            if (linear) dt.gammaSpace = false;
            dt.anisotropicFilteringLevel = 16;
            return dt;
        },
        normalFromHeight(name, W, H, Hf, strength, scene) {
            return this._tex(name, W, H, (d) => {
                for (let y = 0; y < H; y++) {
                    const yu = ((y - 1 + H) % H) * W, yd = ((y + 1) % H) * W, yc = y * W;
                    for (let x = 0; x < W; x++) {
                        const xl = Hf[yc + ((x - 1 + W) % W)], xr = Hf[yc + ((x + 1) % W)];
                        const hu = Hf[yu + x], hd = Hf[yd + x];
                        // 【対策】v 方向は (hd - hu)。Babylon の接空間は V が下向き
                        const nx = (xl - xr) * strength, ny = (hd - hu) * strength, nz = 1;
                        const l = Math.hypot(nx, ny, nz);
                        const i = (yc + x) * 4;
                        d[i] = (nx / l * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny / l * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz / l * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene, true);
        }
    };

    const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const vsc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const vnorm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

    // =================================================================
    // 2. Plate : リム皿（回転体）
    // =================================================================
    const G = GLOBAL;
    const topSpline = monoSpline(
        [0, 3.0, G.wellR, G.wellR + 0.6, mix(G.wellR, G.wallR, 0.65), G.wallR, G.plateR - 1.0, G.plateR - 0.17],
        [G.wellY, G.wellY + 0.005, G.wellY + 0.02, G.wellY + 0.12, mix(G.wellY, G.rimY - 0.15, 0.62), G.rimY - 0.15, G.rimY - 0.05, G.rimY]);
    function plateTopY(r) { return topSpline(Math.min(r, G.plateR - 0.17)); }
    function plateTopAt(x, z) { return plateTopY(Math.hypot(x, z)); }
    function plateThick(r) { return mix(G.thick, 0.34, smooth(G.wellR, G.wallR, r)); }

    // 閉じた断面ループ: 上面（中心→外）→ 口縁 → 下面（外→内）→ 高台 → 中心
    function plateLoop() {
        const pts = [];
        const lipR = G.plateR - 0.17, lipC = G.rimY - 0.17;
        const NT = 120;
        for (let i = 0; i <= NT; i++) {
            // 【対策】r を等間隔に刻むと壁の急斜面だけ粗くなり、縁のハイライトが折れ線に見える
            const t = i / NT;
            const r = lipR * (t + 0.10 * Math.sin(t * Math.PI) * Math.sin(t * TAU));
            pts.push([Math.max(0, Math.min(lipR, r)), 0, 1]);
        }
        for (const p of pts) p[1] = plateTopY(p[0]);
        for (let i = 1; i < 12; i++) {
            const a = Math.PI / 2 - Math.PI * i / 12;
            pts.push([lipR + 0.17 * Math.cos(a), lipC + 0.17 * Math.sin(a), 2]);
        }
        const NB = 60;
        for (let i = 0; i <= NB; i++) {
            const r = lipR - (lipR - (G.footR1 + 0.35)) * (i / NB);
            pts.push([r, plateTopY(r) - plateThick(r), 3]);
        }
        const yIn = plateTopY(G.footR0) - plateThick(G.footR0);
        pts.push([G.footR1 + 0.12, 0.10, 3]);
        pts.push([G.footR1, 0.0, 3]);
        pts.push([G.footR0 + 0.10, 0.0, 3]);
        pts.push([G.footR0, 0.08, 3]);
        pts.push([G.footR0 - 0.15, yIn, 3]);
        for (let i = 1; i <= 12; i++) {
            const r = (G.footR0 - 0.15) * (1 - i / 12);
            pts.push([r, yIn + 0.02 * (1 - (r / G.footR0) ** 2), 3]);
        }
        const s = [0];
        for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
        return { pts, s, L: s[s.length - 1] };
    }

    // 皿のアルベド / ORM。u = 周方向, v = 断面の弧長
    function plateTextures(scene, P, loop, seed, moundEdge, smearCol) {
        const W = 1024, H = 256;
        const alb = new Float32Array(W * H * 3), rgh = new Float32Array(W * H);
        const vr = new Float32Array(H), vk = new Uint8Array(H);
        let j = 0;
        for (let y = 0; y < H; y++) {
            const sv = (y + 0.5) / H * loop.L;
            while (j < loop.s.length - 2 && loop.s[j + 1] < sv) j++;
            const t = clamp((sv - loop.s[j]) / Math.max(1e-6, loop.s[j + 1] - loop.s[j]), 0, 1);
            vr[y] = mix(loop.pts[j][0], loop.pts[j + 1][0], t);
            vk[y] = loop.pts[j][2];
        }
        const base = lin3(P.albedo);
        const tint = lin3(smearCol);
        for (let y = 0; y < H; y++) {
            const r = vr[y], kind = vk[y];
            for (let x = 0; x < W; x++) {
                const th = (x + 0.5) / W * TAU;
                const px = r * Math.cos(th), pz = r * Math.sin(th);
                let c = base.slice();
                const m = Noise.fbm2(px * 0.6 + 3, pz * 0.6, seed, 3);
                const k = 0.985 + 0.03 * (m - 0.5);
                c = [c[0] * k, c[1] * k, c[2] * k * 1.004];
                let rough = P.rough;
                if (P.speck) {
                    // 石目: 粒の粗い斑と、ところどころ光る長石の点
                    const g = Noise.fbm2(px * 3.2, pz * 3.2, seed + 41, 3);
                    c = mul3(c, 0.80 + 0.45 * (g - 0.5) * 2 * 0.5);
                    if (Noise.v2(px * 30, pz * 30, seed + 43) > 0.985) c = mul3(c, 1.9);
                    rough = clamp(P.rough + 0.25 * (g - 0.5), 0.15, 0.7);
                } else {
                    const sp = Noise.v2(px * 22, pz * 22, seed + 9);
                    if (sp > 0.992) c = mul3(c, 0.55);
                }
                if (P.line && kind !== 3) {
                    const L = P.line;
                    c = mix3(c, lin3(L.col), smooth(L.r0 - 0.04, L.r0 + 0.04, r));
                }
                // ソースの汚れ: 盛りの裾の外側に、薄く伸びた膜
                if (kind === 1 && moundEdge) {
                    const e = moundEdge(px, pz);
                    const n = Noise.fbm2(px * 0.9 + 11, pz * 0.9, seed + 33, 4);
                    const smear = smooth(0.8, -0.2, e) * smooth(0.60, 0.76, n);
                    if (smear > 0) {
                        // 【対策】膜は「塗料」ではない。皿の色を乗算で落とす
                        c = mix3(c, [c[0] * tint[0], c[1] * tint[1], c[2] * tint[2]], smear * 0.85);
                        rough = mix(rough, 0.08, smear);
                    }
                }
                const i = y * W + x;
                alb[i * 3] = c[0]; alb[i * 3 + 1] = c[1]; alb[i * 3 + 2] = c[2];
                rgh[i] = rough;
            }
        }
        const albedo = TexLab._tex("plateAlb", W, H, (d) => {
            for (let i = 0; i < W * H; i++) {
                d[i * 4] = l2s(Math.min(1, alb[i * 3])) * 255; d[i * 4 + 1] = l2s(Math.min(1, alb[i * 3 + 1])) * 255;
                d[i * 4 + 2] = l2s(Math.min(1, alb[i * 3 + 2])) * 255; d[i * 4 + 3] = 255;
            }
        }, scene, false);
        const orm = TexLab._tex("plateORM", W, H, (d) => {
            for (let i = 0; i < W * H; i++) {
                d[i * 4] = 255; d[i * 4 + 1] = rgh[i] * 255; d[i * 4 + 2] = 0; d[i * 4 + 3] = 255;
            }
        }, scene, true);
        albedo.wrapV = orm.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        return { albedo, orm };
    }

    function buildPlate(scene, P, seed, moundEdge, smearCol) {
        const loop = plateLoop();
        const NS = G.plateSectors;
        const geo = new Geo(loop.pts.length * (NS + 1));
        const n = loop.pts.length;
        const nrm = [];
        for (let i = 0; i < n; i++) {
            const a = loop.pts[Math.max(0, i - 1)], b = loop.pts[Math.min(n - 1, i + 1)];
            let tx = b[0] - a[0], ty = b[1] - a[1];
            const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
            nrm.push([-ty, tx]);
        }
        nrm[0] = [0, 1]; nrm[n - 1] = [0, -1];
        const white = [1, 1, 1];
        for (let k = 0; k <= NS; k++) {
            const th = k / NS * TAU, c = Math.cos(th), s = Math.sin(th);
            // 【対策】完全な真円だと縁のハイライトが定規で引いた線になる
            const wob = 1 + 0.0035 * (Math.cos(3 * th + 0.7) * 0.6 + Math.sin(5 * th + 1.9) * 0.4);
            for (let i = 0; i < n; i++) {
                const [r, y] = loop.pts[i];
                const w = mix(1, wob, smooth(G.wallR, G.plateR, r));
                geo.v(r * w * c, y, r * w * s, nrm[i][0] * c, nrm[i][1], nrm[i][0] * s,
                    k / NS, loop.s[i] / loop.L, white);
            }
        }
        for (let k = 0; k < NS; k++) for (let i = 0; i < n - 1; i++) {
            const a = k * n + i, b = (k + 1) * n + i;
            geo.q(a, a + 1, b + 1, b);
        }
        const mesh = geo.mesh("plate", scene);
        const tex = plateTextures(scene, P, loop, seed, moundEdge, smearCol);
        const m = new BABYLON.PBRMaterial("plateMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = tex.albedo;
        m.metallic = 0; m.roughness = 1;
        m.metallicTexture = tex.orm;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.useAmbientOcclusionFromMetallicTextureRed = false;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = P.cc;
        m.clearCoat.roughness = P.speck ? 0.22 : 0.06;
        mesh.material = m;
        mesh.receiveShadows = true;
        return { mesh, mat: m, tex };
    }

    // =================================================================
    // 3. Mound : 盛りの外形（包絡面）と芯
    // =================================================================
    // 盛りは釣鐘で、裾は長く皿へ溶け込む。
    // 【対策】(1 - u^2.2)^0.95 の台地にすると縁が崖になり、麺を型で抜いた
    //         ケーキ（がちがちの塊）に見えた。(1 - u²)² は縁で傾きも 0 になる
    function makeMound(seed) {
        const rng = new Rng(seed ^ 0x4D0D);
        const ph = [rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU), rng.range(0, TAU)];
        const tilt = [rng.range(-0.8, 0.8), rng.range(-0.8, 0.8)];
        const R = G.moundR, peak = G.peak;
        function radiusAt(th) {
            return R * (1 + 0.050 * Math.sin(2 * th + ph[0]) + 0.040 * Math.sin(3 * th + ph[1])
                + 0.025 * Math.sin(5 * th + ph[2]) + 0.015 * Math.sin(8 * th + ph[3]));
        }
        function local(x, z) {
            const dx = x - G.cx, dz = z - G.cz;
            const rho = Math.hypot(dx, dz), th = Math.atan2(dz, dx);
            return { rho, th, u: rho / radiusAt(th) };
        }
        function height(x, z) {
            const L = local(x, z);
            if (L.u >= 1) return 0;
            const sx = x - G.cx - tilt[0] * (1 - L.u), sz = z - G.cz - tilt[1] * (1 - L.u);
            const u2 = Math.min(1, Math.hypot(sx, sz) / radiusAt(L.th));
            let h = peak * Math.pow(Math.max(0, 1 - u2 * u2), 2.0);
            // 具を挟んで積んだ山は 2〜4cm 周期でこぶになる
            const lump = Noise.fbm2(x * 0.36 + 5.1, z * 0.36 - 2.7, seed + 77, 3) - 0.5;
            h *= 1 + 0.30 * lump * (1 - L.u * 0.5);
            return Math.max(0, h);
        }
        function env(x, z) { return plateTopAt(x, z) + height(x, z); }
        function normal(x, z) {
            const e = 0.12;
            const gx = (env(x + e, z) - env(x - e, z)) / (2 * e);
            const gz = (env(x, z + e) - env(x, z - e)) / (2 * e);
            const l = Math.hypot(gx, 1, gz);
            return [-gx / l, 1 / l, -gz / l];
        }
        function edge(x, z) { const L = local(x, z); return L.rho - radiusAt(L.th); }
        return { radiusAt, local, height, env, normal, edge };
    }

    // 芯: 包絡面の coreDepth 下に張った暗い面。麺の隙間から覗くのはここ
    function buildCore(scene, M, S, seed) {
        const NR = 40, NA = 168;
        const geo = new Geo((NR + 1) * (NA + 1));
        const dark = lin3(S.burnt), mid = lin3(S.thick);
        for (let a = 0; a <= NA; a++) {
            const th = a / NA * TAU;
            const Rt = M.radiusAt(th);
            for (let i = 0; i <= NR; i++) {
                const u = i / NR;
                const x = G.cx + Math.cos(th) * Rt * u, z = G.cz + Math.sin(th) * Rt * u;
                const e = M.env(x, z), pt = plateTopAt(x, z);
                // 【対策】裾で芯が皿の上に出ると、盛りの外に茶色の円盤が見える
                const y = Math.max(pt - 0.06, e - G.coreDepth) - 0.06 * smooth(0.85, 1.0, u);
                const n = Noise.fbm2(x * 1.7, z * 1.7, seed + 5, 3);
                const k = 0.50 + 0.25 * n;
                const c = mix3(dark, mid, n);
                const nn = M.normal(x, z);
                geo.v(x, y, z, nn[0], nn[1], nn[2], u, a / NA, mul3(c, k));
            }
        }
        for (let a = 0; a < NA; a++) for (let i = 0; i < NR; i++) {
            const p = a * (NR + 1) + i, q = (a + 1) * (NR + 1) + i;
            geo.q(p, p + 1, q + 1, q);
        }
        const mesh = geo.mesh("noodleCore", scene);
        const m = new BABYLON.PBRMaterial("coreMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0; m.roughness = 0.55;
        m.environmentIntensity = 0.5;
        mesh.material = m;
        mesh.receiveShadows = true;
        return mesh;
    }

    // =================================================================
    // 4. Strands : 麺の経路
    // =================================================================
    // 焼きそばはヘラで返して皿へ移すので、きれいな渦は少ない。
    //   ・乱: 曲率を滑らかに揺らして歩く。半径 5〜12cm のゆるい弧
    //   ・渦: 3割（ヘラで寄せた所の流れ）
    // 【対策】曲率を強く・麺を短く・束を小さくすると、向きが全面でばらばらに
    //         なり、スチールウールのような絡まりに見えた
    // 深さは盛り全体に散らし、経路に沿って 6〜10cm 周期で潜ったり浮いたり
    // させる（編まれた見え。上層の一部は包絡面より上でアーチになる）
    function strandR() { return G.noodleD * MM * 0.5; }

    function moundStrands(M, seed, count) {
        const R = strandR();
        const out = [];
        const g = new Rng(seed ^ 0x5A5A);
        const spin = g.next() < 0.5 ? 1 : -1;
        let s = 0, b = 0;
        while (s < count && b < count * 4) {
            const rng = new Rng(seed + b * 7919 + 13);
            b++;
            const u0 = Math.pow(rng.next(), 0.8) * 0.95, a0 = rng.range(0, TAU);
            const Rt = M.radiusAt(a0);
            let x = G.cx + Math.cos(a0) * Rt * u0, z = G.cz + Math.sin(a0) * Rt * u0;
            const swirl = rng.next() < 0.30;
            const dir = rng.next() < 0.6 ? spin : -spin;
            let h = swirl ? a0 + dir * Math.PI / 2 + rng.gauss(0, 0.4) : rng.range(0, TAU);
            const L = rng.range(20, 36);
            const n = Math.max(8, Math.round(L / G.step));
            // 深さ: 上層に寄せつつ奥まで（奥の麺がすき間から覗く）
            const d0 = Math.pow(rng.next(), 1.15) * (G.coreDepth - 0.3);
            const dAmp = rng.range(0.25, 0.65);
            const ko = rng.range(0, 1000), dO = rng.range(0, 1000);
            // 【対策】曲率を細かく揺らすとスチールウール、弱くすると直線の束に
            //         なった。低い周波数で持続させ、半径 2〜6cm の輪を描かせる
            const kAmp = swirl ? rng.range(0.03, 0.08) : rng.range(0.35, 0.60);
            // 【対策】4〜5本の平行な束がリボンに見えた。焼きそばは1本ずつほぐれる
            const m = Math.min(count - s, [1, 1, 1, 2, 2, 2, 3][rng.int(7)]);
            const cx = [], cz = [], hd = [], dd = [];
            if (swirl) {
                const ocx = G.cx + rng.range(-0.2, 0.2) * G.moundR, ocz = G.cz + rng.range(-0.2, 0.2) * G.moundR;
                let th = a0, rho = clamp(Math.sqrt(rng.next()) * 0.9, 0.12, 0.9);
                const drift = rng.range(-0.015, 0.012);
                for (let i = 0; i < n; i++) {
                    const sArc = i * G.step;
                    const r = rho * M.radiusAt(th);
                    const px = ocx + Math.cos(th) * r, pz = ocz + Math.sin(th) * r;
                    if (Math.hypot(px, pz) > G.wallR - 0.6 || M.local(px, pz).u > 1.12) break;
                    cx.push(px); cz.push(pz);
                    dd.push(clamp(d0 + dAmp * (fbm1(sArc * 0.13 + dO, seed + 3, 2) - 0.5) * 2, -0.22, G.coreDepth));
                    th += dir * G.step / Math.max(0.6, r);
                    rho = clamp(rho + drift * G.step + 0.06 * (fbm1(sArc * 0.15 + ko, seed + 1, 2) - 0.5) * G.step, 0.06, 1.0);
                }
                for (let i = 0; i < cx.length; i++) {
                    const j0 = Math.max(0, i - 1), j1 = Math.min(cx.length - 1, i + 1);
                    hd.push(Math.atan2(cz[j1] - cz[j0], cx[j1] - cx[j0]));
                }
            } else {
                for (let i = 0; i < n; i++) {
                    const sArc = i * G.step;
                    const L2 = M.local(x, z);
                    cx.push(x); cz.push(z); hd.push(h);
                    dd.push(clamp(d0 + dAmp * (fbm1(sArc * 0.13 + dO, seed + 3, 2) - 0.5) * 2, -0.22, G.coreDepth));
                    let k = kAmp * (fbm1(sArc * 0.055 + ko, seed + 1, 2) - 0.5) * 2;
                    // 【対策】u > 0.8 で内へ戻すと外周がきっちり揃い、型抜きの輪郭に
                    //         なった。裾の外（皿の上）まで流し、皿の壁の手前でだけ戻す
                    if (L2.u > 0.88) {
                        const tang = Math.atan2(z - G.cz, x - G.cx) + dir * Math.PI / 2;
                        let dh = tang + dir * 0.9 - h;
                        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
                        k += 0.9 * smooth(0.88, 1.08, L2.u) * dh;
                    }
                    if (L2.u > 1.22) break;
                    h += k * G.step;
                    x += Math.cos(h) * G.step; z += Math.sin(h) * G.step;
                    if (Math.hypot(x, z) > G.wallR - 0.6) break;
                }
            }
            const nc = cx.length;
            if (nc < 8) continue;
            const gap = 2 * R * 1.25;
            for (let j = 0; j < m; j++) {
                const rj = new Rng(seed + b * 131 + j * 977);
                const off0 = (j - (m - 1) / 2) * gap;
                const dO2 = rj.range(0, 999), amp = rj.range(0.04, 0.22);
                const i0 = Math.floor(rj.range(0, 0.15) * nc), i1 = nc - Math.floor(rj.range(0, 0.15) * nc);
                const pts = [];
                for (let i = i0; i < i1; i++) {
                    const t = i / (nc - 1);
                    const spread = amp * (0.35 + 0.65 * Math.abs(t - 0.5) * 2);
                    const off = off0 + spread * (fbm1(i * G.step * 0.18 + dO2, seed + 5, 2) - 0.5) * 2;
                    const px = cx[i] - Math.sin(hd[i]) * off, pz = cz[i] + Math.cos(hd[i]) * off;
                    const env = M.env(px, pz), pt = plateTopAt(px, pz);
                    const d = dd[i] + (j % 2) * R * 0.6;
                    pts.push(px, Math.max(pt + R, env - R - d), pz);
                }
                const np = pts.length / 3;
                if (np < 6) continue;
                out.push({
                    pts: Float32Array.from(pts), n: np, free: new Uint8Array(np),
                    tone: rng.range(-0.22, 0.22) + rj.range(-0.06, 0.06), seed: seed + s * 31
                });
                s++;
            }
        }
        return out;
    }

    // =================================================================
    // 4b. Relax : 押し合い（位置ベースの緩和）
    // =================================================================
    function relax(strands, M, iters) {
        const R = strandR(), D = 2 * R * 1.02;
        let P = 0;
        for (const s of strands) P += s.n;
        const X = new Float32Array(P), Y = new Float32Array(P), Z = new Float32Array(P);
        const sid = new Int32Array(P), pix = new Int32Array(P), fre = new Uint8Array(P);
        const first = [];
        let k = 0;
        strands.forEach((s, si) => {
            first.push(k);
            for (let i = 0; i < s.n; i++, k++) {
                X[k] = s.pts[i * 3]; Y[k] = s.pts[i * 3 + 1]; Z[k] = s.pts[i * 3 + 2];
                sid[k] = si; pix[k] = i; fre[k] = s.free[i];
            }
        });
        const HB = 1 << 17, mask = HB - 1;
        const head = new Int32Array(HB), next = new Int32Array(P);
        const cs = D * 1.05;
        const key = (ix, iy, iz) => ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & mask;
        const floorY = new Float32Array(P);
        const refreshFloor = () => {
            for (let i = 0; i < P; i++) {
                const pt = plateTopAt(X[i], Z[i]);
                const h = M.height(X[i], Z[i]);
                floorY[i] = (h > 0 ? Math.max(pt, M.env(X[i], Z[i]) - G.coreDepth) : pt) + R;
            }
        };
        let pushes = 0;
        for (let it = 0; it < iters; it++) {
            // 重力は弱く。強いと上層のアーチが潰れ、また一枚の面に戻る
            for (let i = 0; i < P; i++) if (!fre[i]) Y[i] -= 0.02;
            head.fill(-1);
            for (let i = 0; i < P; i++) {
                const h = key(Math.floor(X[i] / cs), Math.floor(Y[i] / cs), Math.floor(Z[i] / cs));
                next[i] = head[h]; head[h] = i;
            }
            for (let i = 0; i < P; i++) {
                const ix = Math.floor(X[i] / cs), iy = Math.floor(Y[i] / cs), iz = Math.floor(Z[i] / cs);
                for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
                    for (let j = head[key(ix + a, iy + b, iz + c)]; j >= 0; j = next[j]) {
                        if (j <= i) continue;
                        if (sid[j] === sid[i] && Math.abs(pix[j] - pix[i]) < 4) continue;
                        const dx = X[i] - X[j], dy = Y[i] - Y[j], dz = Z[i] - Z[j];
                        const d2 = dx * dx + dy * dy + dz * dz;
                        if (d2 >= D * D) continue;
                        const d = Math.sqrt(d2);
                        let nx, ny, nz;
                        if (d < 1e-5) { nx = 0; ny = 1; nz = 0; } else { nx = dx / d; ny = dy / d; nz = dz / d; }
                        // 【対策】横へ押すと束がばらけて扇形に広がる。積み重なりは上下で解く
                        ny += (ny >= 0 ? 0.6 : -0.6);
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const corr = (D - d) * 0.5;
                        X[i] += nx * corr; Y[i] += ny * corr; Z[i] += nz * corr;
                        X[j] -= nx * corr; Y[j] -= ny * corr; Z[j] -= nz * corr;
                        pushes++;
                    }
                }
            }
            if ((it & 1) === 0) refreshFloor();
            for (let i = 0; i < P; i++) if (Y[i] < floorY[i]) Y[i] = floorY[i];
            strands.forEach((s, si) => {
                const b = first[si];
                for (let i = 1; i < s.n - 1; i++) {
                    const q = b + i;
                    X[q] += 0.35 * ((X[q - 1] + X[q + 1]) * 0.5 - X[q]);
                    Y[q] += 0.35 * ((Y[q - 1] + Y[q + 1]) * 0.5 - Y[q]);
                    Z[q] += 0.35 * ((Z[q - 1] + Z[q + 1]) * 0.5 - Z[q]);
                }
            });
        }
        // 押し合いが交差点ごとに作る細かい折れを一度ならす。
        // 焼きそばの縮れは、このあと crinkle() で「周期を持った波」として足す
        // （押し合いの折れのままだと、ランダムな折れ線＝針金に見える）
        for (let pass = 0; pass < 3; pass++) {
            strands.forEach((s, si) => {
                const b = first[si];
                for (let i = 2; i < s.n - 2; i++) {
                    const q = b + i;
                    const ax = (X[q - 2] + 4 * X[q - 1] + 6 * X[q] + 4 * X[q + 1] + X[q + 2]) / 16;
                    const ay = (Y[q - 2] + 4 * Y[q - 1] + 6 * Y[q] + 4 * Y[q + 1] + Y[q + 2]) / 16;
                    const az = (Z[q - 2] + 4 * Z[q - 1] + 6 * Z[q] + 4 * Z[q + 1] + Z[q + 2]) / 16;
                    X[q] += 0.6 * (ax - X[q]); Y[q] += 0.6 * (ay - Y[q]); Z[q] += 0.6 * (az - Z[q]);
                }
            });
            for (let i = 0; i < P; i++) if (Y[i] < floorY[i]) Y[i] = floorY[i];
        }
        strands.forEach((s, si) => {
            const b = first[si];
            for (let i = 0; i < s.n; i++) {
                s.pts[i * 3] = X[b + i]; s.pts[i * 3 + 1] = Y[b + i]; s.pts[i * 3 + 2] = Z[b + i];
            }
        });
        return { X, Y, Z, sid, fre, P, first, pushes };
    }

    // ---- 縮れ ----------------------------------------------------------
    // 蒸し中華麺の縮れは、炒めたあとは周期 2〜3cm のゆるい波。横（水平）と
    // 縦に別の周期で振ると、平面の波ではなく軽いらせんになる。
    // 【対策】周期 1〜1.7cm・振幅が麺の半径ほどだと、スチールウールに見えた
    // 【対策】押し合いの前に入れると、最後のならしで消えてしまう
    function crinkle(strands, rx, amt) {
        if (amt <= 0) return;
        const R = strandR();
        strands.forEach((s, si) => {
            const n = s.n, p = s.pts, b = rx.first[si];
            const h0 = Noise._h2(si, 11, 91), h1 = Noise._h2(si, 12, 91), h2 = Noise._h2(si, 13, 91);
            const lam1 = 2.0 + 1.0 * h0, lam2 = 1.7 + 0.9 * h1;
            const ph1 = h1 * TAU, ph2 = h0 * TAU;
            const amp = amt * (0.7 + 0.6 * h2);
            // 元の位置から接線を取る（ずらしながら取ると累積する）
            const src = Float32Array.from(p);
            let sArc = 0;
            for (let i = 0; i < n; i++) {
                const a = Math.max(0, i - 1), c = Math.min(n - 1, i + 1);
                const t = vnorm([src[c * 3] - src[a * 3], src[c * 3 + 1] - src[a * 3 + 1], src[c * 3 + 2] - src[a * 3 + 2]]);
                if (i > 0) sArc += Math.hypot(src[i * 3] - src[(i - 1) * 3], src[i * 3 + 1] - src[(i - 1) * 3 + 1], src[i * 3 + 2] - src[(i - 1) * 3 + 2]);
                let hz = vcross(t, [0, 1, 0]);
                if (Math.hypot(hz[0], hz[1], hz[2]) < 1e-3) hz = [1, 0, 0];
                hz = vnorm(hz);
                const vt = vcross(hz, t);
                // 周期の揺らぎ（きれいな正弦だとバネに見える）
                const w = 0.65 * Math.sin(TAU * sArc / lam1 + ph1 + 1.6 * fbm1(sArc * 0.5, 700 + si, 2))
                    + 0.35 * (fbm1(sArc * 1.4 + 50, 900 + si, 2) - 0.5) * 2;
                const e = 0.60 * Math.sin(TAU * sArc / lam2 + ph2 + 1.4 * fbm1(sArc * 0.5, 800 + si, 2));
                // 端は細って落ち着く
                const taper = smooth(0, 0.6, sArc) * smooth(0, 0.6, (n - 1 - i) * G.step);
                const ah = 0.060 * amp * w * taper, av = 0.040 * amp * e * taper;
                const x = src[i * 3] + hz[0] * ah + vt[0] * av;
                let y = src[i * 3 + 1] + hz[1] * ah + vt[1] * av;
                const z = src[i * 3 + 2] + hz[2] * ah + vt[2] * av;
                y = Math.max(y, plateTopAt(x, z) + R);
                p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
                rx.X[b + i] = x; rx.Y[b + i] = y; rx.Z[b + i] = z;
            }
        });
    }

    // ---- 遮蔽 ----------------------------------------------------------
    function computeAO(st, M) {
        const { X, Y, Z, P } = st;
        const R = strandR();
        const ao = new Float32Array(P);
        const cs = 0.42, HB = 1 << 16, mask = HB - 1;
        const head = new Int32Array(HB).fill(-1), next = new Int32Array(P);
        const key = (ix, iy, iz) => ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & mask;
        for (let i = 0; i < P; i++) {
            const h = key(Math.floor(X[i] / cs), Math.floor(Y[i] / cs), Math.floor(Z[i] / cs));
            next[i] = head[h]; head[h] = i;
        }
        for (let i = 0; i < P; i++) {
            const ix = Math.floor(X[i] / cs), iy = Math.floor(Y[i] / cs), iz = Math.floor(Z[i] / cs);
            let occ = 0;
            for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let b = 0; b <= 1; b++) {
                for (let j = head[key(ix + a, iy + b, iz + c)]; j >= 0; j = next[j]) {
                    const dy = Y[j] - Y[i];
                    if (dy < R * 0.8 || dy > 0.7) continue;
                    const dh = Math.hypot(X[j] - X[i], Z[j] - Z[i]);
                    if (dh > 0.40) continue;
                    occ += (1 - dh / 0.40) * (1 - dy / 0.7);
                }
            }
            // 【対策】影・SSAO・頂点の遮蔽が重なると盛り全体が沈む。控えめに
            let a = Math.exp(-0.08 * occ);
            const depth = M.env(X[i], Z[i]) - (Y[i] + R);
            // 奥の麺ほど暗い（すき間から覗く奥行きはこれが作る）
            a *= 1 - 0.50 * smooth(0.05, 1.6, depth);
            const gap = Y[i] - R - plateTopAt(X[i], Z[i]);
            a *= mix(0.70, 1, smooth(0.0, 0.35, gap));
            ao[i] = a;
        }
        return ao;
    }

    // ---- 麺の上面の高さ場 ------------------------------------------------
    function topField(st, M) {
        const R = strandR();
        const cs = 0.10;
        const x0 = G.cx - G.moundR * 1.25, z0 = G.cz - G.moundR * 1.25;
        const N = Math.ceil(G.moundR * 2.5 / cs);
        const H = new Float32Array(N * N).fill(-1e9);
        for (let i = 0; i < st.P; i++) {
            const ix = Math.round((st.X[i] - x0) / cs), iz = Math.round((st.Z[i] - z0) / cs);
            const y = st.Y[i] + R;
            for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
                const jx = ix + a, jz = iz + b;
                if (jx < 0 || jz < 0 || jx >= N || jz >= N) continue;
                const k = jz * N + jx;
                const yy = y - (a * a + b * b) * 0.02;
                if (yy > H[k]) H[k] = yy;
            }
        }
        for (let jz = 0; jz < N; jz++) for (let jx = 0; jx < N; jx++) {
            const k = jz * N + jx;
            const e = Math.max(M.env(x0 + jx * cs, z0 + jz * cs) - 0.6, plateTopAt(x0 + jx * cs, z0 + jz * cs));
            if (H[k] < e) H[k] = e;
        }
        return makeField(H, N, cs, x0, z0);
    }
    function makeField(B, N, cs, x0, z0) {
        const at = (x, z) => {
            const fx = clamp((x - x0) / cs, 0, N - 1.001), fz = clamp((z - z0) / cs, 0, N - 1.001);
            const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
            const a = B[iz * N + ix], b = B[iz * N + ix + 1], c = B[(iz + 1) * N + ix], d = B[(iz + 1) * N + ix + 1];
            return mix(mix(a, b, tx), mix(c, d, tx), tz);
        };
        return { at, B, N, cs, x0, z0 };
    }
    // 具を乗せる面: 麺の上面を膨らませて（最大値）からぼかす。
    // 【対策】麺の上面にそのまま沿わせると、肉が麺1本1本の凹凸を拾って
    //         波板のようになる。平均だけでぼかすと頂が削れて麺に埋まる
    function drapeField(TF, rad) {
        const N = TF.N;
        let a = Float32Array.from(TF.B), b = new Float32Array(N * N);
        const pass = (src, dst, horiz, op) => {
            for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
                let acc = op === "max" ? -1e9 : 0, w = 0;
                for (let k = -rad; k <= rad; k++) {
                    const xx = horiz ? clamp(x + k, 0, N - 1) : x, zz = horiz ? z : clamp(z + k, 0, N - 1);
                    const v = src[zz * N + xx];
                    if (op === "max") acc = Math.max(acc, v); else { acc += v; w++; }
                }
                dst[z * N + x] = op === "max" ? acc : acc / w;
            }
        };
        pass(a, b, true, "max"); pass(b, a, false, "max");
        pass(a, b, true, "avg"); pass(b, a, false, "avg");
        pass(a, b, true, "avg"); pass(b, a, false, "avg");
        return makeField(a, N, TF.cs, TF.x0, TF.z0);
    }

    // =================================================================
    // 5. Noodle mesh : 管の掃引と色
    // =================================================================
    function noodleTextures(scene, seed) {
        // u = 麺の長さ方向（4cm 周期）, v = 周方向
        const W = 512, H = 64;
        const hf = new Float32Array(W * H), coat = new Float32Array(W * H * 2);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const u = x / W, v = y / H;
            // 炒めた麺の表面: 細かいざらつきと、焦げてめくれた小さな凹凸
            const g = Noise.fbm2p(u * 160, v * 16, 160, 16, seed + 1, 2);
            const lump = Noise.fbm2p(u * 30, v * 4, 30, 4, seed + 2, 3);
            hf[y * W + x] = g * 0.7 + smooth(0.58, 0.78, lump) * 0.7;
            // 油とソースの膜は長さ方向に途切れ途切れ
            const oil = Noise.fbm2p(u * 14, v * 2, 14, 2, seed + 3, 3);
            coat[(y * W + x) * 2] = clamp(0.40 + 1.2 * (oil - 0.45), 0.20, 1);
            coat[(y * W + x) * 2 + 1] = clamp(0.95 - 1.0 * (oil - 0.4), 0.35, 1);
        }
        const normal = TexLab.normalFromHeight("noodleNrm", W, H, hf, 1.8, scene);
        const coatTex = TexLab._tex("noodleCoat", W, H, (d) => {
            for (let i = 0; i < W * H; i++) {
                d[i * 4] = coat[i * 2] * 255; d[i * 4 + 1] = coat[i * 2 + 1] * 255; d[i * 4 + 2] = 0; d[i * 4 + 3] = 255;
            }
        }, scene, true);
        return { normal, coat: coatTex };
    }

    function noodleMaterial(scene, S, tex) {
        const m = new BABYLON.PBRMaterial("noodleMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0;
        m.roughness = 0.34;
        m.bumpTexture = tex.normal;
        m.bumpTexture.level = 0.25;
        // 【対策】clearCoat を一様にすると「濡れたプラスチック」になる
        m.clearCoat.isEnabled = true;
        m.clearCoat.texture = tex.coat;
        m.clearCoat.useRoughnessFromMainTexture = true;
        // 写真の麺は1本ずつに長い照りが走る（p85 が [0.96, 0.77, 0.54]）
        m.clearCoat.intensity = 0.80 * S.gloss;
        m.clearCoat.roughness = 0.12;
        m.clearCoat.indexOfRefraction = 1.47;
        // 【対策】灰色の環境を拾って麺の赤が濁った。照りはキックの灯で作る
        m.environmentIntensity = 0.50;
        // 中華麺は少し光を通す（逆光で縁が琥珀色に光る）
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.35;
        m.subSurface.tintColor = new BABYLON.Color3(1.0, 0.62, 0.25);
        m.subSurface.minimumThickness = 0.05;
        m.subSurface.maximumThickness = 0.28;
        return m;
    }

    // 麺の色。パスタでは消した「麺ごと・数 cm ごとの大きな濃淡」が
    // 焼きそばらしさの主成分。そこへ鉄板に当たった所の短い焦げを足す
    function strandColor(S, s, sArc, tone) {
        // 【対策】1本の中で数 cm ごとに濃淡と焦げを大きく振ると、細かいざらつきに
        //         なり「1本の麺」として読めなくなった。1本の中はほぼ均一の飴色
        let cov = S.cover + S.vary * tone + 0.22 * (fbm1(sArc * 0.15, s.seed, 2) - 0.5);
        cov = clamp(cov, 0, 1);
        let c = cov < 0.5 ? mix3(S.pale, S.base, cov * 2) : mix3(S.base, S.thick, (cov - 0.5) * 2);
        const ch = smooth(0.66, 0.76, fbm1(sArc * 0.6 + 37, s.seed + 7, 2));
        c = mix3(c, S.burnt, ch * S.char);
        return lin3(c);
    }

    function buildNoodles(scene, strands, st, ao, S, mat) {
        const R = strandR(), NS = G.sides;
        let nv = 0, nt = 0;
        for (const s of strands) { nv += (s.n + 4) * (NS + 1) + 2; nt += (s.n + 3) * NS * 2 + NS * 2; }
        const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), C = new Float32Array(nv * 4);
        const I = new Uint32Array(nt * 3);
        let v = 0, t = 0;
        const cosT = [], sinT = [];
        for (let k = 0; k <= NS; k++) { cosT.push(Math.cos(k / NS * TAU)); sinT.push(Math.sin(k / NS * TAU)); }
        const put = (x, y, z, nx, ny, nz, u, w, c, sh) => {
            P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z;
            N[v * 3] = nx; N[v * 3 + 1] = ny; N[v * 3 + 2] = nz;
            U[v * 2] = u; U[v * 2 + 1] = w;
            const k = sh * (1 - 0.12 * Math.max(0, -ny));
            C[v * 4] = c[0] * k; C[v * 4 + 1] = c[1] * k; C[v * 4 + 2] = c[2] * k; C[v * 4 + 3] = 1;
            return v++;
        };
        strands.forEach((s, si) => {
            const n = s.n, p = s.pts, b0 = st.first[si];
            // 太さのばらつき（炒めて膨らみ方が違う）
            const rr = R * (1 + 0.10 * (Noise._h2(si, 3, 77) - 0.5));
            const T = new Float32Array(n * 3);
            for (let i = 0; i < n; i++) {
                const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
                let tx = p[b * 3] - p[a * 3], ty = p[b * 3 + 1] - p[a * 3 + 1], tz = p[b * 3 + 2] - p[a * 3 + 2];
                const l = Math.hypot(tx, ty, tz) || 1;
                T[i * 3] = tx / l; T[i * 3 + 1] = ty / l; T[i * 3 + 2] = tz / l;
            }
            let r = Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
            const d0 = vdot(r, [T[0], T[1], T[2]]);
            r = vnorm([r[0] - T[0] * d0, r[1] - T[1] * d0, r[2] - T[2] * d0]);
            const ring = (i, nr, cx, cy, cz, rad, sArc, ext) => {
                const tt = [T[i * 3], T[i * 3 + 1], T[i * 3 + 2]];
                const bb = vcross(tt, nr);
                const c = strandColor(S, s, sArc, s.tone);
                const sh = ao[b0 + i];
                const base = v;
                for (let k = 0; k <= NS; k++) {
                    const nx = nr[0] * cosT[k] + bb[0] * sinT[k], ny = nr[1] * cosT[k] + bb[1] * sinT[k], nz = nr[2] * cosT[k] + bb[2] * sinT[k];
                    const ex = ext || 0;
                    const fx = nx * (1 - Math.abs(ex)) + tt[0] * ex, fy = ny * (1 - Math.abs(ex)) + tt[1] * ex, fz = nz * (1 - Math.abs(ex)) + tt[2] * ex;
                    const l = Math.hypot(fx, fy, fz) || 1;
                    put(cx + nx * rad, cy + ny * rad, cz + nz * rad, fx / l, fy / l, fz / l, sArc / 4.0, k / NS, c, sh);
                }
                return base;
            };
            const rings = [];
            let sArc = 0;
            {
                const tx = T[0], ty = T[1], tz = T[2];
                const ap = put(p[0] - tx * rr * 0.55, p[1] - ty * rr * 0.55, p[2] - tz * rr * 0.55, -tx, -ty, -tz, 0, 0,
                    strandColor(S, s, 0, s.tone), ao[b0]);
                rings.push({ apex: ap });
                rings.push({ base: ring(0, r, p[0] - tx * rr * 0.30, p[1] - ty * rr * 0.30, p[2] - tz * rr * 0.30, rr * 0.72, 0, -0.6) });
            }
            for (let i = 0; i < n; i++) {
                if (i > 0) {
                    // 二重反射で法線を運ぶ（フレネ標準形は変曲点で枠が裏返る）
                    const v1 = [p[i * 3] - p[(i - 1) * 3], p[i * 3 + 1] - p[(i - 1) * 3 + 1], p[i * 3 + 2] - p[(i - 1) * 3 + 2]];
                    const c1 = vdot(v1, v1) || 1e-9;
                    const tL = [T[(i - 1) * 3], T[(i - 1) * 3 + 1], T[(i - 1) * 3 + 2]];
                    const rL = vsub(r, vsc(v1, 2 * vdot(v1, r) / c1));
                    const tLL = vsub(tL, vsc(v1, 2 * vdot(v1, tL) / c1));
                    const t2 = [T[i * 3], T[i * 3 + 1], T[i * 3 + 2]];
                    const v2 = vsub(t2, tLL);
                    const c2 = vdot(v2, v2) || 1e-9;
                    r = vnorm(vsub(rL, vsc(v2, 2 * vdot(v2, rL) / c2)));
                    sArc += Math.sqrt(c1);
                }
                rings.push({ base: ring(i, r, p[i * 3], p[i * 3 + 1], p[i * 3 + 2], rr, sArc, 0) });
            }
            {
                const i = n - 1, tx = T[i * 3], ty = T[i * 3 + 1], tz = T[i * 3 + 2];
                rings.push({ base: ring(i, r, p[i * 3] + tx * rr * 0.30, p[i * 3 + 1] + ty * rr * 0.30, p[i * 3 + 2] + tz * rr * 0.30, rr * 0.72, sArc, 0.6) });
                const ap = put(p[i * 3] + tx * rr * 0.55, p[i * 3 + 1] + ty * rr * 0.55, p[i * 3 + 2] + tz * rr * 0.55, tx, ty, tz, 0, 0,
                    strandColor(S, s, sArc, s.tone), ao[b0 + i]);
                rings.push({ apex: ap });
            }
            for (let j = 1; j < rings.length - 2; j++) {
                const A = rings[j].base, B = rings[j + 1].base;
                for (let k = 0; k < NS; k++) {
                    I[t++] = A + k; I[t++] = A + k + 1; I[t++] = B + k + 1;
                    I[t++] = A + k; I[t++] = B + k + 1; I[t++] = B + k;
                }
            }
            const a0 = rings[0].apex, f0 = rings[1].base;
            for (let k = 0; k < NS; k++) { I[t++] = a0; I[t++] = f0 + k + 1; I[t++] = f0 + k; }
            const a1 = rings[rings.length - 1].apex, f1 = rings[rings.length - 2].base;
            for (let k = 0; k < NS; k++) { I[t++] = a1; I[t++] = f1 + k; I[t++] = f1 + k + 1; }
        });
        const Ps = P.subarray(0, v * 3), Ns = N.subarray(0, v * 3), Is = I.subarray(0, t);
        orient(Ps, Is, Ns);
        const mesh = named(new BABYLON.Mesh("noodles", scene), "noodles");
        const vd = new BABYLON.VertexData();
        vd.positions = Ps; vd.normals = Ns; vd.indices = Is;
        vd.uvs = U.subarray(0, v * 2); vd.colors = C.subarray(0, v * 4);
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.tris = t / 3;
        return mesh;
    }

    // =================================================================
    // 6. 具 : 厚みのある薄板
    // =================================================================
    // 豚バラ・キャベツ・にんじんの短冊は、どれも「曲がった薄板」。
    // (u, v) ∈ [-1,1]² の格子を、楕円（豚・キャベツ）か長方形（にんじん・
    // 紅しょうが）へ写し、麺の上面に沿わせて置く。
    //   y = 面(x, z) + 沈み + 反り(u², v²) + しわ
    // 上面・下面・側面を1メッシュで閉じる（部品に分けると隙間と裏返りが出る）
    function toppingLayout(M, seed) {
        const rng = new Rng(seed ^ 0x70991);
        const amt = G.gu, out = [];
        const want = [];
        // 【対策】具を大きく・多くすると麺が見えず「肉野菜炒め」になった。
        //         写真では麺が面積の 6〜7 割を占め、具は麺の間から覗く
        for (let i = 0; i < Math.round(7 * amt); i++) want.push("pork");
        for (let i = 0; i < Math.round(9 * amt); i++) want.push("cabbage");
        for (let i = 0; i < Math.round(22 * amt); i++) want.push("carrot");
        for (let i = want.length - 1; i > 0; i--) { const j = rng.int(i + 1); const k = want[i]; want[i] = want[j]; want[j] = k; }
        for (const kind of want) {
            let it;
            if (kind === "pork") {
                // 豚バラの薄切り（4〜6cm に切って炒めると縮んでしわが寄る）
                it = { L: rng.range(3.4, 5.0), W: rng.range(1.8, 2.6), thk: 0.14, oval: true, jag: 0.26,
                    curlL: rng.range(-0.40, 0.30), curlW: rng.range(-0.10, 0.25), wrinkle: 0.26, wf: 1.25, nu: 24, nv: 14 };
            } else if (kind === "cabbage") {
                // ざく切りのキャベツ。炒めてしんなりし、ほぼ寝ている。
                // 【対策】縁を 0.85cm まで反らせた椀形は、壁のように立ち上がり、
                //         千切りがその縁に引っかかって宙に浮いた
                it = { L: rng.range(2.2, 3.6), W: rng.range(1.8, 2.8), thk: 0.11, oval: true, jag: 0.30,
                    curlL: rng.range(0.04, 0.30), curlW: rng.range(0.0, 0.20), wrinkle: 0.12, wf: 0.7, nu: 18, nv: 16 };
            } else {
                // にんじんの千切り（4〜5cm × 2〜3mm 角）。buildCarrotStick で剛体の棒として置く
                // 【対策】短冊（幅 8mm × 厚 2mm）は法線がなめらかに回って
                //         太い棒・ソーセージに見えた
                it = { L: rng.range(3.4, 5.4), W: rng.range(0.20, 0.30), thk: rng.range(0.16, 0.22), oval: false, jag: 0,
                    curlL: rng.range(-0.30, 0.25), curlW: 0, wrinkle: 0.06, wf: 1.2, nu: 14, nv: 1 };
            }
            // 千切りは麺の間に混ざるので、配置の間隔を取らない
            const rad = kind === "carrot" ? 0.3 : Math.max(it.L, it.W) * 0.42;
            let best = null;
            for (let t = 0; t < 28; t++) {
                const u = Math.sqrt(rng.next()) * 0.84, a = rng.range(0, TAU);
                const Rt = M.radiusAt(a);
                const x = G.cx + Math.cos(a) * Rt * u, z = G.cz + Math.sin(a) * Rt * u;
                let dmin = 1e9;
                for (const o of out) dmin = Math.min(dmin, Math.hypot(x - o.x, z - o.z) - o.rad - rad);
                if (!best || dmin > best.d) best = { x, z, d: dmin };
                if (dmin > -0.4 * rad) break;
            }
            it.kind = kind; it.x = best.x; it.z = best.z; it.rad = rad;
            it.yaw = rng.range(0, TAU);
            it.seed = (seed + (rng.next() * 1e6 | 0)) | 0;
            // 4割は麺に半分埋もれる（全部上に乗せると「具を後乗せ」した絵になる）
            // 【対策】具が麺の上面に貼り付くと、表面が一枚の蓋（殻）に見える。
            //         7割は麺の上層に埋め、上を麺が通るようにする
            // 千切りは麺と一緒に炒めて混ざっているので、多くは麺の中
            const sinkP = kind === "carrot" ? 0.75 : 0.70;
            it.off = rng.next() < sinkP ? rng.range(-0.50, -0.20) : rng.range(-0.14, -0.03);
            it.tone = rng.range(-0.12, 0.12);
            out.push(it);
        }
        // 埋もれた具から先に置く（上に乗る具が、その上へ重なれるように）。
        // 千切りのにんじんは最後: 真っすぐな棒の上に葉や肉がかぶさると、
        // 棒をまたいでテント状に折れた
        out.sort((a, b) => ((a.kind === "carrot") - (b.kind === "carrot")) || (a.off - b.off));
        // 紅しょうが: 頂のそばに山盛り。後から置く物ほど上の層
        if (G.beni) {
            // 写真では山の脇（手前寄り）に添える
            const a = -Math.PI / 2 + rng.range(-0.9, 0.9), u = rng.range(0.50, 0.65), Rt = M.radiusAt(a);
            const px = G.cx + Math.cos(a) * Rt * u, pz = G.cz + Math.sin(a) * Rt * u;
            const Rp = 2.0, Hp = 0.9, n = 34;
            const yaw0 = rng.range(0, TAU);
            for (let k = 0; k < n; k++) {
                const ang = rng.range(0, TAU), rr = Math.sqrt(rng.next()) * Rp * 0.55;
                // 千切りは向きがだいたい揃う（つまんで置くので）
                // 【対策】向きのばらつきが大きいと放射状の「花火」に見えた
                const yaw = yaw0 + rng.gauss(0, 0.32);
                out.push({
                    kind: "beni", x: px + Math.cos(ang) * rr, z: pz + Math.sin(ang) * rr, yaw,
                    L: rng.range(2.4, 4.0), W: rng.range(0.22, 0.32), thk: rng.range(0.12, 0.16), oval: false, jag: 0,
                    curlL: rng.range(-0.15, 0.1), curlW: 0, wrinkle: 0.05, wf: 2.0, nu: 12, nv: 1,
                    seed: (seed + 77000 + k * 131) | 0, off: 0.04, rad: 0, tone: rng.range(-0.1, 0.1),
                    pile: { px, pz, Rp, Hp, layer: k / n }
                });
            }
        }
        return out;
    }

    // ---- 具の色 ----------------------------------------------------------
    function pieceColor(it, S) {
        const sd = it.seed;
        if (it.kind === "pork") {
            return (mu, mv, top, rho) => {
                // バラ肉の脂の層は長さ方向に走る
                const n = Noise.fbm2(mu * 1.1 + (sd % 97), mv * 3.6, sd, 3);
                const fat = smooth(0.50, 0.66, n);
                let c = mix3(S.pork, S.porkFat, fat * 0.85);
                // 縁は焼けて濃い。ソースはしわの谷に溜まる
                c = mul3(c, mix(1.0, 0.72, smooth(0.70, 1.0, rho)));
                const sauce = smooth(0.55, 0.75, Noise.fbm2(mu * 2.4 + 9, mv * 2.4, sd + 5, 3));
                c = mix3(c, S.thick, sauce * 0.45);
                if (!top) c = mul3(c, 0.85);
                return mul3(c, 1 + it.tone);
            };
        }
        if (it.kind === "cabbage") {
            return (mu, mv, top, rho) => {
                // 芯（白い太い葉脈）が一本走り、縁ほど緑が濃い
                const ribD = Math.abs(mv - 0.35 * Math.sin(mu * 1.4 + (sd % 7)));
                const rib = 1 - smooth(0.06, 0.20, ribD);
                const n = Noise.fbm2(mu * 2.0 + 5, mv * 2.0, sd + 3, 3);
                let c = mix3([0.900, 0.890, 0.620], [0.700, 0.790, 0.380], clamp(smooth(0.45, 1.0, rho) * 0.8 + 0.6 * (n - 0.5), 0, 1));
                c = mix3(c, [0.930, 0.930, 0.790], rib * 0.85);
                // ソースを吸ってところどころ茶色く透ける
                const tint = smooth(0.52, 0.72, Noise.fbm2(mu * 1.6 + 2, mv * 1.6, sd + 9, 3)) * S.cabTint;
                c = mix3(c, [c[0] * 0.85, c[1] * 0.62, c[2] * 0.38], tint);
                return c;
            };
        }
        if (it.kind === "carrot") {
            return (mu, mv, top, rho) => {
                const n = Noise.v2(mu * 1.5 + (sd % 13), mv * 10, sd);
                let c = mix3([0.960, 0.480, 0.130], [0.880, 0.360, 0.080], n * 0.7 + 0.3 * smooth(0.7, 1.0, Math.abs(mv)));
                const sauce = smooth(0.6, 0.8, Noise.fbm2(mu * 2 + 3, mv * 2, sd + 4, 2)) * S.cabTint;
                c = mix3(c, mul3(c, 0.75), sauce);
                return c;
            };
        }
        // 紅しょうが
        return (mu, mv, top) => {
            const n = Noise.v2(mu * 6 + (sd % 11), mv * 3, sd);
            // 写真の紅しょうがは朱に近い赤（ピンクではない）
            let c = mix3([0.960, 0.340, 0.230], [0.880, 0.200, 0.150], n);
            return mul3(c, 1 + it.tone);
        };
    }

    // ---- 薄板の生成 --------------------------------------------------------
    function addSlab(geo, o, surf, color) {
        const NU = o.nu, NV = o.nv, cyw = Math.cos(o.yaw), syw = Math.sin(o.yaw);
        const grid = [[], []];
        let cxs = 0, czs = 0;
        for (let side = 0; side < 2; side++) {
            for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
                const u = -1 + 2 * i / NU, v = -1 + 2 * j / NV;
                let mu = u, mv = v, jit = 1;
                if (o.oval) {
                    // 正方形 → 円板の写像（角で三角形が潰れない）
                    mu = u * Math.sqrt(1 - v * v / 2); mv = v * Math.sqrt(1 - u * u / 2);
                    const ang = Math.atan2(mv, mu);
                    jit = 1 + o.jag * (Noise.fbm2(Math.cos(ang) * 1.6 + 5, Math.sin(ang) * 1.6, o.seed, 2) - 0.5) * 2 * Math.hypot(mu, mv);
                }
                const lx = mu * o.L * 0.5 * jit, lz = mv * o.W * 0.5 * jit;
                const x = o.x + lx * cyw - lz * syw, z = o.z + lx * syw + lz * cyw;
                const wr = o.wrinkle ? o.wrinkle * (Noise.fbm2(lx * o.wf + 7, lz * o.wf, o.seed + 3, 3) - 0.5) * 2 : 0;
                let y = surf(x, z) + o.off + o.curlL * mu * mu + o.curlW * mv * mv + wr;
                if (o.pile) {
                    const P = o.pile, d = Math.hypot(x - P.px, z - P.pz) / P.Rp;
                    y += P.Hp * (0.30 + 0.70 * P.layer) * Math.max(0, 1 - d * d);
                }
                y = Math.max(y, plateTopAt(x, z) + o.thk + 0.02);
                // 先に置いた具の上へ乗せる（麺には埋めてよいが、具どうしは貫通させない）
                if (o.above) y = Math.max(y, o.above(x, z) + o.thk + 0.03);
                if (side === 1) y -= o.thk;
                else { cxs += x; czs += z; }
                const rho = Math.min(1, Math.hypot(mu, mv) * (o.oval ? 1 : 0.75));
                const c = color(mu, mv, side === 0, rho);
                grid[side].push(geo.v(x, y, z, 0, side ? -1 : 1, 0, i / NU, j / NV, lin3(c)));
            }
        }
        const cnt = (NU + 1) * (NV + 1);
        cxs /= cnt; czs /= cnt;
        const id = (i, j) => j * (NU + 1) + i;
        for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
            for (let side = 0; side < 2; side++) {
                const g = grid[side], ref = side ? [0, -1, 0] : [0, 1, 0];
                const a = g[id(i, j)], b = g[id(i + 1, j)], c = g[id(i + 1, j + 1)], d = g[id(i, j + 1)];
                geo.tr(a, b, c, ref); geo.tr(a, c, d, ref);
            }
        }
        // 側面: 外周を一周
        const per = [];
        for (let i = 0; i < NU; i++) per.push(id(i, 0));
        for (let j = 0; j < NV; j++) per.push(id(NU, j));
        for (let i = NU; i > 0; i--) per.push(id(i, NV));
        for (let j = NV; j > 0; j--) per.push(id(0, j));
        const Pa = () => geo.P.a;
        for (let k = 0; k < per.length; k++) {
            const p0 = per[k], p1 = per[(k + 1) % per.length];
            const A = grid[0][p0], B = grid[0][p1], C = grid[1][p1], D = grid[1][p0];
            const P = Pa();
            const ref = [(P[A * 3] + P[B * 3]) * 0.5 - cxs, 0, (P[A * 3 + 2] + P[B * 3 + 2]) * 0.5 - czs];
            geo.tr(A, B, C, ref); geo.tr(A, C, D, ref);
        }
        return grid[0];
    }

    // 具の上面を書き込む格子。後から置く具は、ここと麺の面の高い方へ乗る
    function overlayField(TF) {
        const N = TF.N, cs = TF.cs, x0 = TF.x0, z0 = TF.z0;
        const O = new Float32Array(N * N).fill(-1e9);
        const splat = (x, y, z) => {
            const ix = Math.round((x - x0) / cs), iz = Math.round((z - z0) / cs);
            const R = 4;
            for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
                const jx = ix + a, jz = iz + b;
                if (jx < 0 || jz < 0 || jx >= N || jz >= N) continue;
                // 縁から 0.4cm かけて垂れ下がる
                const yy = y - 0.06 * Math.hypot(a, b);
                const k = jz * N + jx;
                if (yy > O[k]) O[k] = yy;
            }
        };
        const at = (x, z) => {
            const fx = clamp((x - x0) / cs, 0, N - 1.001), fz = clamp((z - z0) / cs, 0, N - 1.001);
            const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
            const a = O[iz * N + ix], b = O[iz * N + ix + 1], c = O[(iz + 1) * N + ix], d = O[(iz + 1) * N + ix + 1];
            if (a < -1e8 || b < -1e8 || c < -1e8 || d < -1e8) return Math.max(a, b, c, d);
            return mix(mix(a, b, tx), mix(c, d, tx), tz);
        };
        // 三角形ごとに、覆う格子へ三角形の最高点を書く（頂点だけだと、
        // 頂点の間隔が広い千切りや豚肉の間を、次の具がすり抜けた）
        const splatTris = (P, I, t0, t1) => {
            for (let t = t0; t < t1; t += 3) {
                let xa = 1e9, xb = -1e9, za = 1e9, zb = -1e9, yb = -1e9;
                for (let k = 0; k < 3; k++) {
                    const v = I[t + k] * 3;
                    xa = Math.min(xa, P[v]); xb = Math.max(xb, P[v]);
                    za = Math.min(za, P[v + 2]); zb = Math.max(zb, P[v + 2]);
                    yb = Math.max(yb, P[v + 1]);
                }
                // 覆う範囲の外は 0.06cm/格子 で下がる裾にする（上に乗る具が段差で
                // 垂直に折れて壁にならないよう、なだらかに覆いかぶさる）
                const ia = Math.floor((xa - x0) / cs), ib = Math.ceil((xb - x0) / cs);
                const ja = Math.floor((za - z0) / cs), jb = Math.ceil((zb - z0) / cs);
                const E = 4;
                for (let j = Math.max(0, ja - E); j <= Math.min(N - 1, jb + E); j++)
                    for (let i = Math.max(0, ia - E); i <= Math.min(N - 1, ib + E); i++) {
                        const di = i < ia ? ia - i : (i > ib ? i - ib : 0), dj = j < ja ? ja - j : (j > jb ? j - jb : 0);
                        const yy = yb - 0.06 * Math.hypot(di, dj);
                        const k = j * N + i;
                        if (yy > O[k]) O[k] = yy;
                    }
            }
        };
        // 正確な上面（三角形の面の高さそのもの。裾も、外接矩形の最大値も付けない）。
        // 【対策】千切りを splatTris の面（三角形の外接矩形の最高点＋0.4cm の裾）に
        //         乗せると、反ったキャベツの縁の高さが周りへ広がり、その上に
        //         宙吊りになった
        const EX = new Float32Array(N * N).fill(-1e9);
        const splatExact = (P, I, t0, t1) => {
            for (let t = t0; t < t1; t += 3) {
                const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
                const ax = (P[a] - x0) / cs, az = (P[a + 2] - z0) / cs;
                const bx = (P[b] - x0) / cs, bz = (P[b + 2] - z0) / cs;
                const cx = (P[c] - x0) / cs, cz = (P[c + 2] - z0) / cs;
                const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
                // 頂点のある格子にはそのまま書く（細い三角形の取りこぼし防止）
                for (const [gx, gz, y] of [[ax, az, P[a + 1]], [bx, bz, P[b + 1]], [cx, cz, P[c + 1]]]) {
                    const i = Math.round(gx), j = Math.round(gz);
                    if (i >= 0 && j >= 0 && i < N && j < N && y > EX[j * N + i]) EX[j * N + i] = y;
                }
                if (Math.abs(den) < 1e-9) continue;
                const i0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), i1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx, cx)));
                const j0 = Math.max(0, Math.floor(Math.min(az, bz, cz))), j1 = Math.min(N - 1, Math.ceil(Math.max(az, bz, cz)));
                for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                    const l0 = ((bz - cz) * (i - cx) + (cx - bx) * (j - cz)) / den;
                    const l1 = ((cz - az) * (i - cx) + (ax - cx) * (j - cz)) / den;
                    const l2 = 1 - l0 - l1;
                    if (l0 < -0.05 || l1 < -0.05 || l2 < -0.05) continue;
                    const y = l0 * P[a + 1] + l1 * P[b + 1] + l2 * P[c + 1];
                    const k = j * N + i;
                    if (y > EX[k]) EX[k] = y;
                }
            }
        };
        // 最寄りの格子4つの最大（格子1つぶんだけ控えめに高い）
        const atExact = (x, z) => {
            const fx = (x - x0) / cs, fz = (z - z0) / cs;
            const i = Math.floor(fx), j = Math.floor(fz);
            let m = -1e9;
            for (let b = 0; b <= 1; b++) for (let a = 0; a <= 1; a++) {
                const ii = i + a, jj = j + b;
                if (ii >= 0 && jj >= 0 && ii < N && jj < N) m = Math.max(m, EX[jj * N + ii]);
            }
            return m;
        };
        return { splat, at, splatTris, splatExact, atExact };
    }

    function toppingMaterial(scene, kind, S) {
        const m = new BABYLON.PBRMaterial(kind + "Mat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.metallic = 0;
        m.backFaceCulling = true;
        m.clearCoat.isEnabled = true;
        if (kind === "pork") {
            // 【対策】強い照りが白く乗り、しいたけに見えた
            m.roughness = 0.55; m.clearCoat.intensity = 0.30 * S.gloss; m.clearCoat.roughness = 0.34;
            m.environmentIntensity = 0.45;
        } else if (kind === "cabbage") {
            // 炒めたキャベツは半透明。逆光で葉が明るく抜ける
            m.roughness = 0.40; m.clearCoat.intensity = 0.45; m.clearCoat.roughness = 0.22;
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.translucencyIntensity = 0.55;
            m.subSurface.tintColor = new BABYLON.Color3(0.85, 1.0, 0.55);
            m.subSurface.minimumThickness = 0.05; m.subSurface.maximumThickness = 0.15;
        } else if (kind === "carrot") {
            // 炒めたにんじんは油で照り、生より光を通す（生は艶のないマットな橙）
            m.roughness = 0.36; m.clearCoat.intensity = 0.60; m.clearCoat.roughness = 0.18;
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.translucencyIntensity = 0.48;
            m.subSurface.tintColor = new BABYLON.Color3(1.0, 0.45, 0.10);
            m.subSurface.minimumThickness = 0.1; m.subSurface.maximumThickness = 0.25;
        } else {
            // 紅しょうが: 梅酢で濡れてつやがあり、光をよく通す
            m.roughness = 0.30; m.clearCoat.intensity = 0.70; m.clearCoat.roughness = 0.12;
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.translucencyIntensity = 0.60;
            m.subSurface.tintColor = new BABYLON.Color3(1.0, 0.25, 0.25);
            m.subSurface.minimumThickness = 0.05; m.subSurface.maximumThickness = 0.15;
        }
        return m;
    }

    // ---- 豚バラ（生姜焼きの buildPorkSheet を移植） -------------------------
    // 1枚の薄切りを「輪郭のぎざぎざ・しわ・縁のフリル・折れ返り・端の反り」を
    // 持った中立面として作り、法線方向へ ±厚みの半分だけずらして表裏を張る。
    // 色は生姜焼きと同じく「火の通った肉の地色」を先に決め、ソースの膜を
    // Beer–Lambert で掛ける（ソースで塗るのではなく、膜を透かして肉が見える）。
    // 【対策】旧版の楕円の薄板＋白い照りは、輪郭が滑らかすぎて「しいたけ」に
    //         見えた。薄切り肉は縁が縮れて不規則にちぎれ、折れ重なる
    const PORK = {
        lean: [0.805, 0.648, 0.545],           // 火の通った赤身
        sear: [0.640, 0.430, 0.292],           // 焼き色
        deep: [0.470, 0.280, 0.165],           // 縁の焦げ
        fat: [0.935, 0.885, 0.790],
        fatSear: [0.835, 0.690, 0.500],
        thick: 0.15,                           // 薄切り 1.5mm
        wetBody: 1.18, wetSear: 1.40, wetFat: 0.92
    };
    let porkTex = null;
    function porkTextures() {
        if (porkTex) return porkTex;
        const N = 512, H = new Float32Array(N * N);
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const u = x / N, v = y / N;
            const fib = Noise.fbm2p(u * 6, v * 48, 6, 48, 501, 3);
            const wr = Noise.fbm2p(u * 9, v * 9, 9, 9, 517, 3);
            const gr = Noise.fbm2p(u * 64, v * 64, 64, 64, 523, 1);
            H[y * N + x] = clamp(0.5 + (fib - 0.5) * 0.55 + (wr - 0.5) * 0.70 + (gr - 0.5) * 0.18, 0, 1);
        }
        const normal = TexLab.normalFromHeight("porkN", N, N, H, 7.0, scene);
        // 繊維の明暗（アルベドに掛ける灰色）
        const detail = TexLab._tex("porkFiber", N, N, (d) => {
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const fib = Noise.fbm2p(x / N * 9, y / N * 125, 9, 125, 823, 3);
                const pores = Noise.fbm2p(x / N * 90, y / N * 90, 90, 90, 941, 2);
                const n = 0.77 + 0.20 * fib + 0.07 * pores, k = (y * N + x) * 4;
                d[k] = d[k + 1] = d[k + 2] = Math.min(255, 255 * n); d[k + 3] = 255;
            }
        }, scene, false);
        porkTex = { normal, detail };
        return porkTex;
    }

    function porkMaterial(S) {
        const t = porkTextures();
        const m = new BABYLON.PBRMaterial("porkMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);
        m.albedoTexture = t.detail;
        m.metallic = 0; m.roughness = 0.46;
        m.bumpTexture = t.normal; m.bumpTexture.level = 0.85;
        // 照りは繊維の凹凸で細かく割る（一様な白い照りはしいたけに見える）
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = clamp(0.62 * S.gloss, 0, 1);
        m.clearCoat.roughness = 0.15;
        m.clearCoat.indexOfRefraction = 1.42;
        m.clearCoat.bumpTexture = t.normal;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.16;
        m.subSurface.tintColor = col3([0.78, 0.44, 0.30]);
        m.subSurface.minimumThickness = 0.02;
        m.subSurface.maximumThickness = 0.20;
        return m;
    }

    function weldRange(positions, normals, from, to) {
        const map = new Map();
        for (let i = from; i < to; i++) {
            const k = Math.round(positions[i * 3] * 8192) + "," + Math.round(positions[i * 3 + 1] * 8192) + "," +
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

    // acc に1枚ぶんを追加し、上面の頂点（世界座標）を返す
    function buildPorkPiece(acc, it, surf, S) {
        const M = PORK, rng = new Rng(it.seed >>> 0), nSeed = (it.seed + 991) | 0;
        const NR = 20, NA = 64;
        // 正規化した形（生姜焼きと同じ）を、長さ it.L に合わせて拡大する
        const A = rng.range(1.25, 1.65), Bz = A * (it.W / it.L) * rng.range(0.85, 1.15);
        const size = it.L * 0.5 / A;
        // 角度方向に周期的なノイズ（円周上で fbm を取る）
        const ringN = (a, f, sd) => Noise.fbm2(Math.cos(a) * f + 7, Math.sin(a) * f + 3, sd, 3);
        const outR = (a) => 1 + 0.30 * (ringN(a, 0.9, nSeed + 1) - 0.5) * 2 + 0.14 * (ringN(a, 2.6, nSeed + 2) - 0.5) * 2;
        const foldA = rng.range(0, TAU), foldK = rng.range(1.4, 2.6);
        const amp = rng.range(0.10, 0.20);
        const crum = (x, z) => {
            const u = x * Math.cos(foldA) + z * Math.sin(foldA);
            let h = Math.sin(u * foldK) * amp;
            h += (Noise.fbm2(x * 2.1 + 5, z * 2.1 + 9, nSeed + 7, 3) - 0.5) * amp * 1.2;
            h += (Noise.fbm2(x * 6.0 + 1, z * 6.0 + 3, nSeed + 11, 2) - 0.5) * amp * 0.45;
            return h;
        };
        // 縁のフリル（焼くと縁が縮んで波打つ）
        const rufN = 5 + rng.int(5), rufPh = rng.range(0, TAU), rufAmp = rng.range(0.025, 0.060);
        const fb = rng.range(-0.35, 0.35);
        // 折れ返り（ヘラで返したときに端が重なる）と端の反り
        const fold = rng.next() < 0.45 ? {
            u0: rng.range(0.15, 0.55) * A, rb: rng.range(0.07, 0.16),
            am: rng.range(2.55, 3.05), sg: rng.next() < 0.72 ? 1 : -1
        } : null;
        const curl = rng.next() < 0.55 ? {
            u0: rng.range(0.50, 0.85) * A, rb: rng.range(0.12, 0.25),
            am: rng.range(0.35, 0.85), sg: rng.next() < 0.6 ? 1 : -1
        } : null;
        const cfb = Math.cos(fb), sfb = Math.sin(fb);
        const bt = [0, 0];
        function bend(s, h, F, out) {
            const Hh = h * F.sg;
            const a = Math.min(s / F.rb, F.am);
            let du = (F.rb - Hh) * Math.sin(a), dy = F.rb - (F.rb - Hh) * Math.cos(a);
            if (s > F.rb * F.am) {
                const rest = s - F.rb * F.am;
                du += rest * Math.cos(F.am); dy += rest * Math.sin(F.am);
            }
            out[0] = du; out[1] = dy * F.sg;
        }
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
        const cy = Math.cos(it.yaw), sy = Math.sin(it.yaw);
        const lp = [0, 0, 0];
        const world = (rho, a, out) => {
            mid(rho, a, lp);
            const lx = lp[0] * size, ly = lp[1] * size, lz = lp[2] * size;
            let x = it.x + lx * cy - lz * sy, z = it.z + lx * sy + lz * cy;
            let y = surf(x, z) + it.off + ly + M.thick * 0.5;
            if (typeof wallClamp === "function") {
                const wc = wallClamp(x, y, z, 0.08);
                if (wc) { x = wc[0]; z = wc[1]; }
            }
            y = Math.max(y, plateTopAt(x, z) + M.thick + 0.02);
            if (it.above) y = Math.max(y, it.above(x, z) + M.thick * 0.5 + 0.03);
            out[0] = x; out[1] = y; out[2] = z;
        };
        const p0 = [0, 0, 0], pu = [0, 0, 0], pv = [0, 0, 0];
        const eps = 0.01;
        const nrmAt = (rho, a, out) => {
            const r2 = Math.max(eps, rho);
            world(r2, a, p0); world(r2 + eps, a, pu); world(r2, a + eps, pv);
            const ux = pu[0] - p0[0], uy = pu[1] - p0[1], uz = pu[2] - p0[2];
            const vx = pv[0] - p0[0], vy = pv[1] - p0[1], vz = pv[2] - p0[2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const l = Math.hypot(nx, ny, nz) || 1;
            out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
        };
        // 表の向き: 中心付近（折れていない所）で上を向く側
        const nc = [0, 0, 0];
        nrmAt(0.05, 0.3, nc);
        const sgn0 = nc[1] < 0 ? -1 : 1;

        const per = (NR + 1) * (NA + 1), nV = per * 2;
        const pos = new Float32Array(nV * 3), offs = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2), col = new Float32Array(nV * 4);
        const idx = [];
        const H = M.thick * 0.5;
        const fibA = rng.range(-0.3, 0.3) + Math.PI * 0.5;     // 繊維は短辺方向
        const capPh = rng.range(0, TAU), capK = rng.range(1.0, 1.6);
        const g = S.glaze;
        const s0 = g.sigma[0], s1 = g.sigma[1], s2 = g.sigma[2];
        const H0 = s2l(g.haze[0]), H1 = s2l(g.haze[1]), H2 = s2l(g.haze[2]);
        const mp = [0, 0, 0], nn = [0, 0, 0];
        const top = [];
        for (let side = 0; side < 2; side++) {
            const sgn = side ? -sgn0 : sgn0;
            for (let i = 0; i <= NR; i++) {
                const rho = i / NR;
                for (let j = 0; j <= NA; j++) {
                    const a = (j % NA) / NA * TAU;
                    world(rho, a, mp);
                    nrmAt(rho, a, nn);
                    const vo = side * per + i * (NA + 1) + j;
                    const p3 = vo * 3;
                    pos[p3] = mp[0] + nn[0] * H * sgn;
                    pos[p3 + 1] = mp[1] + nn[1] * H * sgn;
                    pos[p3 + 2] = mp[2] + nn[2] * H * sgn;
                    offs[p3] = nn[0] * sgn; offs[p3 + 1] = nn[1] * sgn; offs[p3 + 2] = nn[2] * sgn;
                    if (side === 0 && (i & 1) === 0 && (j & 1) === 0) top.push([pos[p3], pos[p3 + 1], pos[p3 + 2]]);
                    // 肉の地色（正規化した平らな座標で決める）
                    const R = outR(a) * rho;
                    const x0 = A * R * Math.cos(a), z0 = Bz * R * Math.sin(a);
                    const fx = x0 * Math.cos(fibA) + z0 * Math.sin(fibA);
                    const fz = -x0 * Math.sin(fibA) + z0 * Math.cos(fibA);
                    uvs[vo * 2] = fx * size * 0.45 + (it.seed % 97) * 0.013; uvs[vo * 2 + 1] = fz * size * 0.45;
                    // バラ肉: 長辺に沿って脂と赤身が層になる（＋さし）
                    const zn = z0 / Math.max(1e-3, Bz);
                    const bandN = (Noise.fbm2(x0 * 1.6 + 3, 7.0, nSeed + 17, 2) - 0.5) * 0.8;
                    const layer = smooth(0.40, 0.80, 0.5 + 0.5 * Math.sin((zn + bandN) * Math.PI * capK + capPh));
                    const marb = Noise.fbm2(fz * 6.5 + 3, fx * 1.2 + 8, nSeed + 21, 3);
                    const fat = clamp(Math.max(layer * 0.85, smooth(0.64, 0.80, marb) * 0.35), 0, 1);
                    const heat = Noise.fbm2(x0 * 2.8 + side * 13, z0 * 2.8, nSeed + 31, 3);
                    const spot = smooth(0.50, 0.72, heat);
                    let c = mix3(M.lean, M.sear, clamp(spot * 1.05, 0, 1) * 0.85);
                    c = mix3(c, M.deep, smooth(0.80, 1.0, rho) * 0.55);
                    if (fold) {
                        const du = (x0 * cfb + z0 * sfb) - fold.u0;
                        c = mix3(c, M.sear, smooth(0.0, 0.35, du) * (1 - smooth(0.35, 1.0, du)) * 0.55);
                    }
                    const fc = mix3(M.fat, M.fatSear, clamp(spot * 0.8 + smooth(0.85, 1.0, rho) * 0.4, 0, 1));
                    c = mix3(c, fc, fat);
                    const wet = mix(mix(M.wetBody, M.wetSear, spot), M.wetFat, fat);
                    // ソースの膜（上向きの面・しわの谷ほど厚い）
                    const gravF = 0.45 + 0.55 * (offs[p3 + 1] * 0.5 + 0.5);
                    const mn = Noise.fbm2(mp[0] * 1.5 + mp[1], mp[2] * 1.5, 4441, 3);
                    const mott = 0.30 + 1.50 * smooth(0.28, 0.72, mn);
                    const t = clamp(wet * mott * g.film * gravF, 0, 0.5);
                    const pw = 1 + 0.22 * wet;
                    let lr = s2l(Math.pow(clamp(c[0], 0, 1), pw)) * Math.exp(-s0 * 2 * t);
                    let lg = s2l(Math.pow(clamp(c[1], 0, 1), pw)) * Math.exp(-s1 * 2 * t);
                    let lb = s2l(Math.pow(clamp(c[2], 0, 1), pw)) * Math.exp(-s2 * 2 * t);
                    const hz = (1 - Math.exp(-s1 * 2 * t)) * g.hazeK * 0.6;
                    lr += (H0 - lr) * hz; lg += (H1 - lg) * hz; lb += (H2 - lb) * hz;
                    const k = 1 + it.tone;
                    col[vo * 4] = lr * k; col[vo * 4 + 1] = lg * k; col[vo * 4 + 2] = lb * k; col[vo * 4 + 3] = 1;
                }
            }
            const b = side * per;
            for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
                const p = b + i * (NA + 1) + j;
                if (side === 0) idx.push(p, p + 1, p + NA + 1, p + 1, p + NA + 2, p + NA + 1);
                else idx.push(p, p + NA + 1, p + 1, p + 1, p + NA + 1, p + NA + 2);
            }
        }
        // 縁の帯（表と裏をつなぐ）
        for (let j = 0; j < NA; j++) {
            const a = NR * (NA + 1) + j, b = per + NR * (NA + 1) + j;
            idx.push(a, a + 1, b, a + 1, b + 1, b);
        }
        // 巻き順を「ずらした向き」に合わせて、法線を面から取り直す
        const I = new Uint32Array(idx);
        let nor = new Float32Array(nV * 3);
        BABYLON.VertexData.ComputeNormals(pos, I, nor);
        let dot = 0;
        for (let i = 0; i < nV * 3; i++) dot += nor[i] * offs[i];
        if (dot < 0) {
            for (let i = 0; i < I.length; i += 3) { const t = I[i + 1]; I[i + 1] = I[i + 2]; I[i + 2] = t; }
            nor = new Float32Array(nV * 3);
            BABYLON.VertexData.ComputeNormals(pos, I, nor);
        }
        weldRange(pos, nor, 0, per);
        weldRange(pos, nor, per, nV);
        const base = acc.nV;
        for (let i = 0; i < nV * 3; i++) { acc.pos.push(pos[i]); acc.nor.push(nor[i]); }
        for (let i = 0; i < nV * 2; i++) acc.uv.push(uvs[i]);
        for (let i = 0; i < nV * 4; i++) acc.col.push(col[i]);
        for (let i = 0; i < I.length; i++) acc.idx.push(I[i] + base);
        acc.nV += nV;
        return top;
    }

    // ---- 具と麺の貫通を解く -----------------------------------------------
    // 具は「押し合いで落ち着いた麺の上面」に沿わせて置くので、麺に半分埋めた
    // 具や椀形に反ったキャベツは、麺が真ん中を突き抜ける。
    // 具を置いたあとに、具ごとの「占める高さの区間」[下面, 上面] を格子に書き、
    // 区間に入った麺の点を上か下へ逃がす（具の上を越える / 下をくぐる）。
    // 【対策】点ごとに上下を決めると、隣の点が上・下に分かれて、その間の
    //         線分が具を斜めに突き抜けた。上下は「麺 × 具」ごとに1回だけ、
    //         動かす量の合計が少ない側に決める
    function pieceGrid(TF) {
        const N = TF.N, cs = TF.cs, x0 = TF.x0, z0 = TF.z0;
        const cells = new Map();
        let pid = 0;
        // P: 頂点座標の配列, I: インデックス配列, [t0, t1): この具の三角形の範囲
        function add(P, I, t0, t1) {
            const own = new Map();
            for (let t = t0; t < t1; t += 3) {
                let xa = 1e9, xb = -1e9, za = 1e9, zb = -1e9, ya = 1e9, yb = -1e9;
                for (let k = 0; k < 3; k++) {
                    const v = I[t + k] * 3, x = P[v], y = P[v + 1], z = P[v + 2];
                    if (x < xa) xa = x; if (x > xb) xb = x; if (z < za) za = z; if (z > zb) zb = z;
                    if (y < ya) ya = y; if (y > yb) yb = y;
                }
                const i0 = Math.max(0, Math.floor((xa - x0) / cs)), i1 = Math.min(N - 1, Math.floor((xb - x0) / cs));
                const j0 = Math.max(0, Math.floor((za - z0) / cs)), j1 = Math.min(N - 1, Math.floor((zb - z0) / cs));
                for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
                    const c = j * N + i;
                    const o = own.get(c);
                    if (!o) own.set(c, [ya, yb]);
                    else { if (ya < o[0]) o[0] = ya; if (yb > o[1]) o[1] = yb; }
                }
            }
            for (const [c, o] of own) {
                let l = cells.get(c); if (!l) { l = []; cells.set(c, l); }
                l.push([o[0], o[1], pid]);
            }
            pid++;
        }
        function at(x, z) {
            const i = Math.floor((x - x0) / cs), j = Math.floor((z - z0) / cs);
            if (i < 0 || j < 0 || i >= N || j >= N) return null;
            return cells.get(j * N + i) || null;
        }
        return { add, at };
    }

    function deflectNoodles(strands, rx, PG) {
        const R = strandR(), m = 0.04;
        const { X, Y, Z, first } = rx;
        // 麺の太さぶん周りの格子も見る
        const offs = [[0, 0]];
        for (let k = 0; k < 8; k++) offs.push([Math.cos(k * TAU / 8) * R * 1.2, Math.sin(k * TAU / 8) * R * 1.2]);
        const hits = (x, z, cb) => {
            const seen = new Set();
            for (const o of offs) {
                const l = PG.at(x + o[0], z + o[1]);
                if (!l) continue;
                for (const iv of l) { if (seen.has(iv[2])) continue; seen.add(iv[2]); cb(iv); }
            }
        };
        let moved = 0;
        strands.forEach((s, si) => {
            const b = first[si], n = s.n;
            // 1) 具ごとに上下を決める（区間に入った点の、具の中心からの高さの合計）
            const vote = new Map();
            for (let i = 0; i < n; i++) {
                const q = b + i;
                hits(X[q], Z[q], (iv) => {
                    if (Y[q] < iv[0] - R - m || Y[q] > iv[1] + R + m) return;
                    // 動かす量の少ない側を選ぶ（正なら上、負なら下）。
                    // 【対策】具の中心より上なら上へ、で決めると、麺に埋めた具の
                    //         上を麺がまとめて 1cm 近く跳ね上がり、箱形の輪ができた
                    const lo = iv[0] - R - m, hi = iv[1] + R + m;
                    let v = vote.get(iv[2]) || 0;
                    v += (Y[q] - lo) - (hi - Y[q]);
                    // 下へ逃がすと皿に当たるなら、上しかない
                    if (lo < plateTopAt(X[q], Z[q]) + R) v += 1e3;
                    vote.set(iv[2], v);
                });
            }
            if (!vote.size) return;
            const Y0 = Y.slice(b, b + n);
            // 【対策】上へ逃がすのを繰り返すと、重なった具の上へ次々と乗り上げ、
            //         麺が 1cm 以上浮いた箱形の輪になった。元の高さから
            //         0.45cm 以上持ち上がるなら、その具の下をくぐらせる
            const LIFT = 0.45;
            const push = () => {
                let any = 0;
                for (let i = 0; i < n; i++) {
                    const q = b + i;
                    // 具が重なっている所で上下の決定がぶつかると行き来するので、
                    // 3回で収まらなければ下へ（下が皿なら上へ）逃がす
                    const floorQ = plateTopAt(X[q], Z[q]) + R;
                    for (let pass = 0; pass < 8; pass++) {
                        let hit = false;
                        hits(X[q], Z[q], (iv) => {
                            const lo = iv[0] - R - m, hi = iv[1] + R + m;
                            if (Y[q] <= lo || Y[q] >= hi) return;
                            const canDown = lo >= floorQ;
                            let up = (vote.get(iv[2]) || 1) >= 0;
                            if (pass >= 3 || hi - Y0[i] > LIFT) up = false;
                            if (!canDown) up = true;
                            Y[q] = up ? hi : lo; hit = true; any++;
                        });
                        if (!hit) break;
                    }
                }
                return any;
            };
            // 2) 押す → 経路に沿ってならす（具の縁でなだらかに乗り越える） → 押す
            for (let it = 0; it < 4; it++) {
                moved += push();
                for (let i = 1; i < n - 1; i++) {
                    const q = b + i;
                    Y[q] += 0.45 * ((Y[q - 1] + Y[q + 1]) * 0.5 - Y[q]);
                }
            }
            moved += push();
            for (let i = 0; i < n; i++) s.pts[i * 3 + 1] = Y[b + i];
        });
        return moved;
    }

    // ---- にんじんの千切り --------------------------------------------------
    // 2〜3mm 角・長さ 4〜5cm。炒めた千切りはしんなりして、長さは変わらずに
    // 下の物へしなだれかかる。長さ一定の柔らかい棒として「落として」置く
    // （位置ベースの紐: 重力 → 長さの拘束 → 曲げ → 支えとの接触・摩擦）。
    // 【対策】頂点ごとに下の面の高さへ合わせると、段差で縦に引き伸ばされて
    //         蜘蛛のような形になった（長さが保たれない）
    // 【対策】まっすぐな剛体の棒にすると、山の上で宙に突き出し、生のにんじんの
    //         スティックに見えた。炒めた千切りは自重で垂れて麺に沿う
    function buildCarrotStick(geo, it, support, S, onPiece) {
        const rng = new Rng(it.seed >>> 0);
        const L = it.L, hw = it.W * 0.5, ht = it.thk * 0.5;
        const NS = 18, seg = L / NS;
        const cy = Math.cos(it.yaw), sy = Math.sin(it.yaw);
        // 棒の下面の支え（幅の両側も見る）
        const supAt = (x, z, tx, tz) => {
            let h = support(x, z);
            h = Math.max(h, support(x - tz * hw, z + tx * hw), support(x + tz * hw, z - tx * hw));
            return h + ht;
        };
        const X = [], Y = [], Z = [];
        let top = -1e9;
        const bow = rng.range(-0.12, 0.12);
        for (let i = 0; i <= NS; i++) {
            const s = (i / NS - 0.5) * L, lz = bow * L * (1 - 4 * (i / NS - 0.5) ** 2);
            X.push(it.x + s * cy - lz * sy); Z.push(it.z + s * sy + lz * cy);
            top = Math.max(top, supAt(X[i], Z[i], cy, sy));
        }
        for (let i = 0; i <= NS; i++) Y.push(top + 0.4);
        const clampWall = (i) => {
            if (typeof wallClamp !== "function") return;
            const wc = wallClamp(X[i], Y[i], Z[i], hw + 0.05);
            if (wc) { X[i] = wc[0]; Z[i] = wc[1]; }
        };
        // しなやかさ（曲げの戻り）。炒め具合で少しずつ違う
        // 【対策】0.1〜0.2 だと麺の凹凸と摩擦を拾って細かく波打ち、縮れて見えた
        const kb = rng.range(0.35, 0.50);
        const px = new Float32Array(NS + 1), pz = new Float32Array(NS + 1);
        for (let iter = 0; iter < 220; iter++) {
            for (let i = 0; i <= NS; i++) { px[i] = X[i]; pz[i] = Z[i]; Y[i] -= 0.05; }
            for (let pass = 0; pass < 3; pass++) {
                // 長さの拘束（伸び縮みしない）
                for (let i = 0; i < NS; i++) {
                    const dx = X[i + 1] - X[i], dy = Y[i + 1] - Y[i], dz = Z[i + 1] - Z[i];
                    const d = Math.hypot(dx, dy, dz) || 1e-6, c = (d - seg) / d * 0.5;
                    X[i] += dx * c; Y[i] += dy * c; Z[i] += dz * c;
                    X[i + 1] -= dx * c; Y[i + 1] -= dy * c; Z[i + 1] -= dz * c;
                }
                // 曲げ（隣の中点へ寄せる）。横方向は特に強く（向きは保って垂れる）
                for (let i = 1; i < NS; i++) {
                    X[i] += 0.5 * kb * ((X[i - 1] + X[i + 1]) * 0.5 - X[i]);
                    Z[i] += 0.5 * kb * ((Z[i - 1] + Z[i + 1]) * 0.5 - Z[i]);
                    X[i] += kb * ((X[i - 1] + X[i + 1]) * 0.5 - X[i]);
                    // 【対策】縦にも同じ強さで曲げを戻すと、山や具の縁から先が
                    //         片持ちの梁のように水平に突き出して宙に浮いた。
                    //         炒めた千切りは縦にはくたっと垂れる（横の向きは保つ）
                    Y[i] += 0.06 * ((Y[i - 1] + Y[i + 1]) * 0.5 - Y[i]);
                    Z[i] += kb * ((Z[i - 1] + Z[i + 1]) * 0.5 - Z[i]);
                }
            }
            // 支えとの接触。触れている点は横へ滑らない（摩擦）
            for (let i = 0; i <= NS; i++) {
                const a = Math.max(0, i - 1), b = Math.min(NS, i + 1);
                let tx = X[b] - X[a], tz = Z[b] - Z[a];
                const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
                const h = supAt(X[i], Z[i], tx, tz);
                if (Y[i] < h) {
                    Y[i] = h;
                    // 麺の上では引っかかる（摩擦）が、肉やキャベツの上では油で滑る。
                    // 【対策】具の縁に引っかかったまま、反対の端が麺の上へ斜めに
                    //         降りる「坂」になり、宙に浮いて見えた
                    const fr = onPiece(X[i], Z[i]) ? 0.0 : 0.45;
                    X[i] = mix(X[i], px[i], fr); Z[i] = mix(Z[i], pz[i], fr);
                }
                clampWall(i);
            }
        }
        // 仕上げ: 接触の摩擦が残した細かい横揺れをならす（向きと長さはほぼ保つ）
        for (let pass = 0; pass < 4; pass++) {
            for (let i = 1; i < NS; i++) {
                X[i] += 0.5 * ((X[i - 1] + X[i + 1]) * 0.5 - X[i]);
                Z[i] += 0.5 * ((Z[i - 1] + Z[i + 1]) * 0.5 - Z[i]);
                Y[i] += 0.15 * ((Y[i - 1] + Y[i + 1]) * 0.5 - Y[i]);
            }
            for (let i = 0; i <= NS; i++) {
                const a = Math.max(0, i - 1), b = Math.min(NS, i + 1);
                let tx = X[b] - X[a], tz = Z[b] - Z[a];
                const tl = Math.hypot(tx, tz) || 1;
                Y[i] = Math.max(Y[i], supAt(X[i], Z[i], tx / tl, tz / tl));
                clampWall(i);
            }
        }
        // 断面: 角の丸い四角（炒めて角がなまる）。p が小さいほど丸い
        const NC = 12, pe = 3.2, sec = [];
        for (let k = 0; k < NC; k++) {
            const a = (k + 0.5) / NC * TAU, c = Math.cos(a), s = Math.sin(a);
            const r = 1 / Math.pow(Math.pow(Math.abs(c), pe) + Math.pow(Math.abs(s), pe), 1 / pe);
            sec.push([c * r * hw, s * r * ht]);
        }
        const secN = sec.map((p, k) => {
            const a = sec[(k + NC - 1) % NC], b = sec[(k + 1) % NC];
            const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
            return [ty / l, -tx / l];   // 反時計回りの外向き
        });
        // フレーム
        const F = [];
        let prevUp = [0, 1, 0];
        for (let i = 0; i <= NS; i++) {
            const a = Math.max(0, i - 1), b = Math.min(NS, i + 1);
            const t = vnorm([X[b] - X[a], Y[b] - Y[a], Z[b] - Z[a]]);
            let sd = vcross(t, prevUp);
            if (Math.hypot(sd[0], sd[1], sd[2]) < 1e-4) sd = vcross(t, [1, 0, 0]);
            sd = vnorm(sd);
            const up = vnorm(vcross(sd, t));
            prevUp = up;
            F.push({ c: [X[i], Y[i], Z[i]], t, sd, up });
        }
        // 色: 炒めた千切りは生より少し濃く、表面がソースで染まる
        const colAt = (u, k) => {
            const n = Noise.v2(u * 9 + (it.seed % 13), k * 0.9, it.seed);
            let c = mix3([0.930, 0.420, 0.110], [0.860, 0.330, 0.075], n * 0.6);
            const sp = smooth(0.50, 0.75, Noise.fbm2(u * 5 + 3, k * 0.5, it.seed + 4, 2)) * (0.35 + S.cabTint);
            c = mix3(c, [c[0] * 0.80, c[1] * 0.66, c[2] * 0.55], clamp(sp, 0, 1));
            return lin3(c);
        };
        const rows = [];
        for (let i = 0; i <= NS; i++) {
            const f = F[i], row = [];
            for (let k = 0; k <= NC; k++) {
                const p = sec[k % NC], n2 = secN[k % NC];
                const n = [f.sd[0] * n2[0] + f.up[0] * n2[1], f.sd[1] * n2[0] + f.up[1] * n2[1], f.sd[2] * n2[0] + f.up[2] * n2[1]];
                row.push(geo.v(f.c[0] + f.sd[0] * p[0] + f.up[0] * p[1], f.c[1] + f.sd[1] * p[0] + f.up[1] * p[1],
                    f.c[2] + f.sd[2] * p[0] + f.up[2] * p[1], n[0], n[1], n[2], i / NS, k / NC, colAt(i / NS, k)));
            }
            rows.push(row);
        }
        for (let i = 0; i < NS; i++) for (let k = 0; k < NC; k++) geo.q(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]);
        // 両端の切り口（芯が明るい）
        for (const [i, sg] of [[0, -1], [NS, 1]]) {
            const f = F[i], n = [f.t[0] * sg, f.t[1] * sg, f.t[2] * sg];
            const cc = geo.v(f.c[0], f.c[1], f.c[2], n[0], n[1], n[2], 0.5, 0.5, lin3([0.985, 0.640, 0.300]));
            const ids = sec.map((p) => geo.v(f.c[0] + f.sd[0] * p[0] + f.up[0] * p[1], f.c[1] + f.sd[1] * p[0] + f.up[1] * p[1],
                f.c[2] + f.sd[2] * p[0] + f.up[2] * p[1], n[0], n[1], n[2], 0.5, 0.5, lin3([0.940, 0.470, 0.150])));
            for (let k = 0; k < NC; k++) geo.t(cc, ids[k], ids[(k + 1) % NC]);
        }
    }

    function buildToppings(scene, items, TF, DF, S) {
        const OV = overlayField(TF);
        const geos = {};
        const porkAcc = { pos: [], nor: [], uv: [], col: [], idx: [], nV: 0 };
        const PG = pieceGrid(TF);
        for (const it of items) {
            const surf = (x, z) => Math.max(DF.at(x, z), OV.at(x, z) - (it.off < -0.1 ? 0.25 : 0) + 0.02);
            // 【対策】麺に埋めた具の高さ（surf + off）は、先に置いた具の上面より
            //         下になりうる。キャベツの真ん中を豚肉やにんじんが突き抜けた。
            //         具の下面は、先に置いた具の上面より下へは行かせない
            //         （紅しょうがは山の中で重なり合うので除く）
            if (it.kind !== "beni") it.above = (x, z) => OV.at(x, z);
            if (it.kind === "pork") {
                const t0 = porkAcc.idx.length;
                for (const p of buildPorkPiece(porkAcc, it, surf, S)) OV.splat(p[0], p[1], p[2]);
                PG.add(porkAcc.pos, porkAcc.idx, t0, porkAcc.idx.length);
                OV.splatTris(porkAcc.pos, porkAcc.idx, t0, porkAcc.idx.length);
                OV.splatExact(porkAcc.pos, porkAcc.idx, t0, porkAcc.idx.length);
                continue;
            }
            if (!geos[it.kind]) geos[it.kind] = new Geo(8192);
            const t0 = geos[it.kind].I.n;
            if (it.kind === "carrot") {
                const g = geos.carrot;
                // 支え: 麺の実際の上面（膨らませていない TF）と、具の正確な上面
                const support = (x, z) => Math.max(TF.at(x, z) + it.off,
                    OV.atExact(x, z) + 0.02, plateTopAt(x, z) + 0.02);
                // 支えが具（麺より上にある具の面）かどうか
                const onPiece = (x, z) => OV.atExact(x, z) + 0.02 >= TF.at(x, z) + it.off;
                buildCarrotStick(g, it, support, S, onPiece);
                PG.add(g.P.a, g.I.a, t0, g.I.n);
                OV.splatTris(g.P.a, g.I.a, t0, g.I.n);
                OV.splatExact(g.P.a, g.I.a, t0, g.I.n);
                continue;
            }
            const top = addSlab(geos[it.kind], it, surf, pieceColor(it, S));
            const P = geos[it.kind].P.a;
            PG.add(P, geos[it.kind].I.a, t0, geos[it.kind].I.n);
            if (it.kind !== "beni") {
                OV.splatTris(P, geos[it.kind].I.a, t0, geos[it.kind].I.n);
                OV.splatExact(P, geos[it.kind].I.a, t0, geos[it.kind].I.n);
            }
            // 紅しょうがは書き込まない（自分の山の上へ積み上がり続けるため。
            //  山の形は pile のドームで与えてある）
            if (it.kind !== "beni") for (const vi of top) OV.splat(P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]);
        }
        const meshes = [];
        if (porkAcc.nV) {
            const pm = makeMesh("pork", porkAcc.pos, porkAcc.idx, porkAcc.nor, porkAcc.uv, porkAcc.col, scene);
            pm.material = porkMaterial(S);
            pm.receiveShadows = true;
            meshes.push(pm);
        }
        for (const kind of ["cabbage", "carrot", "beni"]) {
            const g = geos[kind];
            if (!g || !g.nv) continue;
            // にんじんは面ごとの法線を持つ（角を立てる）ので、面から平均し直さない
            const mesh = kind === "carrot" ? g.mesh(kind, scene) : g.meshComputed(kind, scene);
            mesh.material = toppingMaterial(scene, kind, S);
            mesh.receiveShadows = true;
            meshes.push(mesh);
        }
        // 青のりが乗る面（麺と具の高い方）
        const topAll = (x, z) => Math.max(TF.at(x, z), OV.at(x, z));
        return { meshes, topAll, PG };
    }

    // ---- 青のり ----------------------------------------------------------
    // 盛り全体に、上からまんべんなく振る（具の上にも乗る）
    function buildAonori(scene, M, topAt, count, seed) {
        const rng = new Rng(seed ^ 0xA0A0);
        const base = BABYLON.MeshBuilder.CreateDisc("aonoriBase", { radius: 0.065, tessellation: 5, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene);
        named(base, "aonori");
        const mats = new Float32Array(count * 16);
        const q = new BABYLON.Quaternion(), mm = new BABYLON.Matrix();
        let placed = 0, guard = 0;
        while (placed < count && guard++ < count * 4) {
            // 頂に振るので中心に寄る
            const a = rng.range(0, TAU), rr = Math.min(0.8, Math.abs(rng.gauss(0, 0.30)));
            const Rt = M.radiusAt(a);
            const x = G.cx + Math.cos(a) * Rt * rr, z = G.cz + Math.sin(a) * Rt * rr;
            const sc = rng.range(0.5, 1.6);
            BABYLON.Quaternion.FromEulerAnglesToRef(Math.PI / 2 + rng.range(-0.7, 0.7), rng.range(0, TAU), rng.range(0, TAU), q);
            BABYLON.Matrix.ComposeToRef(new V3(sc * rng.range(0.6, 1.4), sc * rng.range(0.4, 1.0), sc), q,
                new V3(x, topAt(x, z) + 0.03, z), mm);
            mm.copyToArray(mats, placed * 16);
            placed++;
        }
        base.thinInstanceSetBuffer("matrix", mats.subarray(0, placed * 16), 16, true);
        const m = new BABYLON.PBRMaterial("aonoriMat", scene);
        m.metallic = 0;
        // 【対策】濃い緑は影に入ると黒い点（黒胡椒）になった。明るい緑にし、
        //         薄い欠片なので光を通す
        m.albedoColor = col3([0.330, 0.560, 0.150]);
        m.roughness = 0.70;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.6;
        m.subSurface.tintColor = new BABYLON.Color3(0.5, 1.0, 0.3);
        m.backFaceCulling = false;
        base.material = m;
        base.receiveShadows = true;
        return base;
    }

    // =================================================================
    // 7. Scene
    // =================================================================
    // ---- テーブル（布 / 白木） ------------------------------------------
    // 24cm 周期のタイル。アルベドと法線は高さ場1枚を共有する
    function clothTextures(scene, Cl, seed) {
        const N = 1024, PER = 24;
        const H = new Float32Array(N * N), A = new Float32Array(N * N * 3);
        if (Cl.wood) {
            // 白木: 板幅 12cm、木目は板ごとに位相を変えた引き伸ばしノイズ
            const light = lin3([0.830, 0.660, 0.470]), dark = lin3([0.700, 0.500, 0.320]);
            for (let y = 0; y < N; y++) {
                const cy = y / N * PER;
                for (let x = 0; x < N; x++) {
                    const cx = x / N * PER;
                    const plank = Math.floor(cy / 12);
                    const fy = cy - plank * 12;
                    const g = Noise.fbm2p(cx / PER * 2, cy / PER * 40 + plank * 7, 2, 40, seed + plank, 4);
                    const ring = 0.5 + 0.5 * Math.sin((cy / PER * 40 + 6 * g) * Math.PI * 2 / 3.3);
                    let t = clamp(0.35 * ring + 0.65 * smooth(0.35, 0.75, g), 0, 1);
                    let c = mix3(light, dark, t);
                    // 板の継ぎ目
                    const seam = Math.min(fy, 12 - fy);
                    const sk = mix(0.55, 1, smooth(0.0, 0.08, seam));
                    c = mul3(c, sk);
                    H[y * N + x] = 0.3 * t + (sk < 1 ? -2 * (1 - sk) : 0);
                    A[(y * N + x) * 3] = c[0]; A[(y * N + x) * 3 + 1] = c[1]; A[(y * N + x) * 3 + 2] = c[2];
                }
            }
        } else {
            let sum = 0;
            for (const s of Cl.stripes) sum += s[0];
            const rep = Math.max(1, Math.round(PER / sum)), scale = PER / (rep * sum);
            const edges = [];
            let acc = 0;
            for (let r = 0; r < rep; r++) for (const s of Cl.stripes) { edges.push([acc, acc + s[0] * scale, lin3(s[1])]); acc += s[0] * scale; }
            const pitch = PER / 240;   // 糸 0.1cm。周期内に整数本入れないと継ぎ目が出る
            for (let y = 0; y < N; y++) {
                const cy = y / N * PER;
                for (let x = 0; x < N; x++) {
                    const cx = x / N * PER;
                    let ci = 0;
                    for (let e = 0; e < edges.length; e++) if (cx >= edges[e][0] && cx < edges[e][1]) { ci = e; break; }
                    const c = edges[ci][2];
                    const wx = cx / pitch, wy = cy / pitch;
                    const ix = Math.floor(wx), iy = Math.floor(wy);
                    const fx = wx - ix, fy = wy - iy;
                    const over = ((ix + iy) & 1) === 0;
                    const warp = Math.sin(Math.PI * fx), weft = Math.sin(Math.PI * fy);
                    let h = over ? warp * (0.6 + 0.4 * weft) : weft * (0.6 + 0.4 * warp);
                    if (Cl.rib > 0.5) h += Cl.rib * 0.9 * (0.5 + 0.5 * Math.cos(TAU * (cx - edges[ci][0]) / (edges[ci][1] - edges[ci][0]) - Math.PI));
                    h += 2.2 * (Noise.fbm2p(cx / PER * 3, cy / PER * 3, 3, 3, seed + 5, 3) - 0.5);
                    H[y * N + x] = h;
                    let tn = 0.94 + 0.10 * Noise.v2p(ix * 0.7, iy * 0.7, 168, 168, seed + 1) + 0.05 * (h - 0.5);
                    // ツイード: 糸1本ごとに明暗の違う霜降り
                    if (Cl.tweed) tn *= 0.62 + 0.80 * Noise._h2(over ? ix : iy * 3 + 1, over ? (iy >> 1) : (ix >> 1), seed + (over ? 3 : 4));
                    A[(y * N + x) * 3] = c[0] * tn; A[(y * N + x) * 3 + 1] = c[1] * tn; A[(y * N + x) * 3 + 2] = c[2] * tn;
                }
            }
        }
        const albedo = TexLab._tex("clothAlb", N, N, (d) => {
            for (let i = 0; i < N * N; i++) {
                d[i * 4] = l2s(Math.min(1, A[i * 3])) * 255; d[i * 4 + 1] = l2s(Math.min(1, A[i * 3 + 1])) * 255;
                d[i * 4 + 2] = l2s(Math.min(1, A[i * 3 + 2])) * 255; d[i * 4 + 3] = 255;
            }
        }, scene, false);
        const normal = TexLab.normalFromHeight("clothNrm", N, N, H, Cl.wood ? 0.6 : 0.9, scene);
        return { albedo, normal };
    }

    const scene = new BABYLON.Scene(engine);
    // 参考写真の背景は暖色の木の壁
    scene.clearColor = new BABYLON.Color4(0.42, 0.33, 0.26, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.62;
    env.lodGenerationOffset = 0.20;

    // 料理写真は 85〜100mm 相当の望遠。距離を伸ばして fov を絞る
    const camera = new BABYLON.ArcRotateCamera("cam", -1.62, 0.95, 62, new V3(-2.4, 2.4, 0.2), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 3.2;
    camera.fov = 0.36;
    // 【対策】maxZ 既定(10000) のままだと深度の分解能が足りず、細い麺の前後がちらつく
    camera.minZ = 8.0;
    camera.maxZ = 320;
    camera.lowerRadiusLimit = 18;
    camera.upperRadiusLimit = 180;
    camera.upperBetaLimit = 1.48;
    scene.cameraToUseForPointers = camera;

    // ---- 灯 ----------------------------------------------------------
    const key = new BABYLON.DirectionalLight("key", new V3(0.42, -0.86, -0.36).normalize(), scene);
    key.position = new V3(-18, 36, 16);
    key.intensity = 2.75;
    key.diffuse = new BABYLON.Color3(1.0, 0.965, 0.920);
    key.autoUpdateExtends = false;
    key.orthoLeft = -24; key.orthoRight = 24;
    key.orthoBottom = -24; key.orthoTop = 24;
    key.shadowMinZ = 1; key.shadowMaxZ = 90;

    // 拡散をほぼ 0 にして鏡面だけ足す灯（麺と肉の照り担当）
    const kick = new BABYLON.DirectionalLight("kick", new V3(-0.45, -0.40, -1.0).normalize(), scene);
    kick.intensity = 1.45;
    kick.diffuse = new BABYLON.Color3(0.05, 0.048, 0.044);
    kick.specular = new BABYLON.Color3(1.0, 0.965, 0.905);

    const fill = new BABYLON.HemisphericLight("fill", new V3(0.25, 1, -0.4), scene);
    fill.intensity = 0.24;
    fill.diffuse = new BABYLON.Color3(0.98, 0.97, 0.95);
    fill.groundColor = new BABYLON.Color3(0.33, 0.30, 0.27);
    fill.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    // 【対策】ESM は cm スケールの細い麺で痣が出る。PCF のほうが早くきれい
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0030;
    sg.normalBias = 0.010;
    sg.setDarkness(0.50);

    // ---- テーブル -----------------------------------------------------
    const table = named(BABYLON.MeshBuilder.CreateGround("table", { width: 240, height: 240 }, scene), "table");
    const tableMat = new BABYLON.PBRMaterial("tableMat", scene);
    tableMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    tableMat.metallic = 0;
    tableMat.sheen.isEnabled = true;
    tableMat.sheen.color = new BABYLON.Color3(1, 1, 1);
    tableMat.sheen.roughness = 0.6;
    table.material = tableMat;
    table.receiveShadows = true;
    let clothTex = null;
    function applyCloth(k, seed) {
        if (clothTex) { clothTex.albedo.dispose(); clothTex.normal.dispose(); }
        const Cl = CLOTHS[k];
        clothTex = clothTextures(scene, Cl, seed);
        tableMat.albedoTexture = clothTex.albedo;
        tableMat.bumpTexture = clothTex.normal;
        tableMat.bumpTexture.level = Cl.wood ? 0.35 : 0.55;
        tableMat.roughness = Cl.rough;
        // 布は縁で毛羽立って白く光る。木には要らない
        tableMat.sheen.intensity = Cl.wood ? 0 : 0.35;
        const sc = Cl.wood ? 5 : 10;
        for (const t of [clothTex.albedo, clothTex.normal]) { t.uScale = sc; t.vScale = sc; t.wAng = Cl.wood ? 0.18 : 0.32; }
    }

    // ---- 湯気 ---------------------------------------------------------
    function makeSteamTexture() {
        const N = 128;
        return TexLab._tex("steam", N, N, (d) => {
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
                const r = Math.hypot(u, v);
                // 【対策】単純な放射状グラデーションだと光の玉（ホタル）に見える
                const n = Noise.fbm2p(x / N * 6, y / N * 6, 6, 6, 4242, 3);
                const a = clamp((1 - smooth(0.15, 1.0, r)) * (0.35 + 0.9 * n), 0, 1);
                const i = (y * N + x) * 4;
                d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = a * 255;
            }
        }, scene, false, true);
    }
    const steamTex = makeSteamTexture();
    steamTex.hasAlpha = true;
    const steam = new BABYLON.ParticleSystem("steam", 200, scene);
    steam.particleTexture = steamTex;
    steam.emitter = new V3(G.cx, G.wellY + G.peak * 0.8, G.cz);
    steam.minEmitBox = new V3(-4.5, 0, -4.5);
    steam.maxEmitBox = new V3(4.5, 0.5, 4.5);
    steam.color1 = new BABYLON.Color4(1, 1, 1, 0.050);
    steam.color2 = new BABYLON.Color4(1, 0.985, 0.96, 0.028);
    steam.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    steam.minSize = 2.2; steam.maxSize = 7.0;
    steam.minLifeTime = 1.4; steam.maxLifeTime = 3.2;
    steam.emitRate = 36;
    steam.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    steam.gravity = new V3(0, 2.6, 0);
    steam.direction1 = new V3(-0.7, 3.2, -0.4);
    steam.direction2 = new V3(0.9, 5.0, 0.5);
    steam.minAngularSpeed = -0.5; steam.maxAngularSpeed = 0.5;
    steam.minEmitPower = 0.5; steam.maxEmitPower = 1.5;
    steam.updateSpeed = 0.012;

    // =================================================================
    // 8. Build
    // =================================================================
    let curSauce = "sauce", curPlate = "green", curCloth = "tweed";
    let curSeed = 0x0A9011;
    let state = null, onRebuilt = null;
    let noodleTex = null;

    function disposeState(st) {
        if (!st) return;
        // 麺の法線・油膜テクスチャは使い回すので、材質は textures を残して捨てる
        for (const m of st.meshes) if (m) {
            sg.removeShadowCaster(m);
            const mat = m.material;
            m.dispose(false, false);
            if (mat) mat.dispose(false, false);
        }
        for (const t of st.textures) if (t) t.dispose();
    }

    function build() {
        const t0 = performance.now();
        disposeState(state);
        const S = SAUCE[curSauce];
        const M = makeMound(curSeed);
        const st = { meshes: [], textures: [], t: {} };
        let tm = performance.now();
        const lap = (k) => { const n = performance.now(); st.t[k] = Math.round(n - tm); tm = n; };

        const plate = buildPlate(scene, PLATES[curPlate], curSeed, M.edge, S.smear);
        st.meshes.push(plate.mesh); st.textures.push(plate.tex.albedo, plate.tex.orm);
        lap("plate");
        st.meshes.push(buildCore(scene, M, S, curSeed));
        lap("core");
        const strands = moundStrands(M, curSeed, G.strands);
        lap("paths");
        const rx = relax(strands, M, G.relaxIters);
        lap("relax");
        crinkle(strands, rx, G.crinkle);
        // 具: 落ち着いた麺の上面に沿わせる
        const TF = topField(rx, M);
        const DF = drapeField(TF, 4);
        const items = toppingLayout(M, curSeed);
        const tp = buildToppings(scene, items, TF, DF, S);
        for (const m of tp.meshes) st.meshes.push(m);
        lap("toppings");
        // 具を突き抜ける麺を、具の上か下へ逃がす（麺のメッシュはこのあと作る）
        st.deflected = deflectNoodles(strands, rx, tp.PG);
        lap("deflect");
        const ao = computeAO(rx, M);
        lap("ao");
        if (!noodleTex) noodleTex = noodleTextures(scene, 2718);
        const noodles = buildNoodles(scene, strands, rx, ao, S, noodleMaterial(scene, S, noodleTex));
        st.meshes.push(noodles);
        lap("mesh");
        if (G.aonori) st.meshes.push(buildAonori(scene, M, tp.topAll, 700, curSeed));

        for (const m of st.meshes) if (m) sg.addShadowCaster(m);
        st.noodles = noodles; st.strands = strands.length; st.points = rx.P; st.pushes = rx.pushes;
        st.items = items.length;
        st.ms = Math.round(performance.now() - t0);
        state = st;
        if (onRebuilt) onRebuilt(st);
        return st;
    }

    // =================================================================
    //  ポストプロセス
    // =================================================================
    if (GLOBAL.useSSAO) {
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        // 【対策】半径を麺の太さまで詰めると、麺という麺に黒い縁がつく
        ssao.radius = 0.9;
        ssao.totalStrength = 0.40;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 240;
        ssao.minZAspect = 0.25;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.92;
    dp.bloomWeight = 0.12;
    dp.bloomKernel = 40;
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
    ip.exposure = 1.30;
    ip.contrast = 1.18;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.2;
    ip.vignetteCameraFov = 0.72;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    scene.onBeforeRenderObservable.add(() => {
        if (dp.depthOfFieldEnabled) {
            // 【対策】Babylon の錯乱円は「シーン単位 × 1000 = mm」。焦点距離を
            //         合焦距離の一定比にすると、寄っても引いてもボケ量が変わらない
            const focus = camera.radius * 1000;
            dp.depthOfField.focusDistance = focus;
            dp.depthOfField.focalLength = focus * GLOBAL.dofRatio;
        }
    });

    // =================================================================
    //  GUI
    // =================================================================
    const GUI_MASK = 0x20000000;
    if (GLOBAL.guiOwnCamera) {
        const guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -60), scene);
        guiCam.layerMask = GUI_MASK;
        scene.activeCameras = [camera, guiCam];
        scene.onAfterRenderObservable.add(() => { scene.activeCamera = camera; });
    } else {
        scene.activeCameras = [camera];
    }
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (ui.layer) {
        if (GLOBAL.guiOwnCamera) ui.layer.layerMask = GUI_MASK;
        else ui.layer.applyPostProcess = false;
    }
    // 【対策】GUI のサイズはレンダー解像度基準（≒ CSS px × DPR）
    ui.idealWidth = 1400;
    ui.renderAtIdealSize = true;

    const COL = { idle: "#2c2723", active: "#8a4a1c", edge: "#4b443c", text: "#f5ece0", sub: "#aca295", accent: "#e9a866" };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "262px"; card.height = "90%";
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(18,16,14,0.84)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "16px";
    ui.addControl(card);
    const sv = new BABYLON.GUI.ScrollViewer("sv");
    sv.thickness = 0; sv.barSize = 10; sv.barColor = COL.edge; sv.barBackground = "rgba(0,0,0,0)";
    sv.wheelPrecision = 0.02;
    card.addControl(sv);
    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "226px"; panel.isVertical = true;
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
        b.height = "31px"; b.paddingBottom = "5px";
        b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 13;
        b.onPointerUpObservable.add(onClick);
        panel.addControl(b);
        return b;
    }
    function addSlider(labelText, min, max, value, fmt, onChange, onCommit) {
        const lb = addLabel(labelText + "  " + fmt(value), 13, COL.accent, "22px");
        const s = new BABYLON.GUI.Slider(labelText);
        s.minimum = min; s.maximum = max; s.value = value;
        s.height = "18px"; s.width = "212px"; s.paddingBottom = "8px";
        s.color = COL.accent; s.background = "#3a332b"; s.borderColor = "transparent";
        s.onValueChangedObservable.add((v) => { lb.text = labelText + "  " + fmt(v); onChange(v); });
        // 重い作り直しは指を離したときだけ
        if (onCommit) s.onPointerUpObservable.add(() => onCommit(s.value));
        panel.addControl(s);
        return s;
    }
    function addToggle(name, label, get, set) {
        const b = addButton(name, "", () => { set(!get()); paint(); });
        const paint = () => { b.textBlock.text = label + ": " + (get() ? "ON" : "OFF"); b.background = get() ? COL.active : COL.idle; };
        paint();
        return b;
    }
    const f2 = (v) => v.toFixed(2), f1 = (v) => v.toFixed(1), f0 = (v) => v.toFixed(0);

    addLabel("YAKISOBA / ソース焼きそば", 11, COL.sub, "30px");
    const groups = [];
    function addGroup(title, tbl, get, set) {
        addLabel(title, 13, COL.accent, "22px");
        const btns = {};
        for (const k of Object.keys(tbl)) btns[k] = addButton(title + "_" + k, tbl[k].label, () => { set(k); paintAll(); });
        groups.push(() => { for (const k in btns) btns[k].background = (k === get()) ? COL.active : COL.idle; });
    }
    function paintAll() { for (const g of groups) g(); }
    addGroup("味", SAUCE, () => curSauce, (k) => { curSauce = k; build(); });
    addGroup("皿", PLATES, () => curPlate, (k) => { curPlate = k; build(); });
    addGroup("テーブル", CLOTHS, () => curCloth, (k) => { curCloth = k; applyCloth(k, 31); });

    addLabel("", 6, COL.sub, "8px");
    addButton("reseed", "盛り直す", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build();
    });
    addToggle("beni", "紅しょうが", () => G.beni, (v) => { G.beni = v; build(); });
    addToggle("aonori", "青のり", () => G.aonori, (v) => { G.aonori = v; build(); });

    addLabel("", 6, COL.sub, "8px");
    addSlider("麺の本数", 80, 300, G.strands, f0, () => { }, (v) => { G.strands = Math.round(v); build(); });
    addSlider("麺の太さ [mm]", 2.0, 3.8, G.noodleD, f1, () => { }, (v) => { G.noodleD = v; build(); });
    addSlider("縮れ ×", 0, 2.0, G.crinkle, f2, () => { }, (v) => { G.crinkle = v; build(); });
    addSlider("具の量 ×", 0, 2.0, G.gu, f2, () => { }, (v) => { G.gu = v; build(); });
    addSlider("盛りの高さ [cm]", 2.5, 6.0, G.peak, f1, () => { }, (v) => { G.peak = v; build(); });
    addSlider("油の照り ×", 0, 1.6, 1.0, f2, (v) => {
        if (state && state.noodles) state.noodles.material.clearCoat.intensity = 0.60 * SAUCE[curSauce].gloss * v;
    });
    addSlider("環境光 ×", 0.10, 1.40, scene.environmentIntensity, f2, (v) => { scene.environmentIntensity = v; });
    addToggle("kick", "照り足し", () => kick.isEnabled(), (v) => kick.setEnabled(v));
    addToggle("steam", "湯気", () => steam.isStarted(), (v) => { if (v) steam.start(); else steam.stop(); });
    steam.start();
    addToggle("rot", "自動回転", () => camera.useAutoRotationBehavior, (v) => {
        camera.useAutoRotationBehavior = v;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.08;
    });
    addLabel("", 6, COL.sub, "8px");
    addToggle("dof", "被写界深度", () => dp.depthOfFieldEnabled, (v) => { dp.depthOfFieldEnabled = v; });
    addSlider("ぼけ量", 0.01, 0.20, GLOBAL.dofRatio, f2, (v) => { GLOBAL.dofRatio = v; });
    addSlider("F値", 1.2, 11.0, GLOBAL.dofFStop, f1, (v) => { dp.depthOfField.fStop = v; });
    const info = addLabel("", 12, COL.sub, "92px");

    onRebuilt = (st) => {
        let tri = 0;
        for (const m of st.meshes) if (m && m.tris) tri += m.tris;
        info.text = "麺 " + st.strands + " 本 / 経路点 " + st.points.toLocaleString() + "\n"
            + "具 " + st.items + " 切れ / 押し合い " + st.pushes.toLocaleString() + " 回\n"
            + tri.toLocaleString() + " tri / " + st.ms + " ms\n"
            + "seed: " + curSeed;
    };

    applyCloth(curCloth, 31);
    build();
    paintAll();
    console.log("[Yakisoba] build yakisoba-2026-10-07-i", "| sauce=" + curSauce, "| seed=" + curSeed,
        "| " + JSON.stringify(state.t));

    scene.onDisposeObservable.add(() => {
        disposeState(state);
        if (noodleTex) { noodleTex.normal.dispose(); noodleTex.coat.dispose(); }
        if (porkTex) { porkTex.normal.dispose(); porkTex.detail.dispose(); }
        if (clothTex) { clothTex.albedo.dispose(); clothTex.normal.dispose(); }
        steamTex.dispose();
    });

    return scene;
};

export default createScene;