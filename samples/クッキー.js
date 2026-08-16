// =====================================================================
//  Photoreal Cookies  /  写実的なクッキー      BUILD: cookie-A3
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  cookie-A2 からの修正（Inspector のデバッグ表示）:
//    ・GUI 専用カメラ（layerMask 分離）の副作用で、Playground の Inspector の
//      デバッグ機能が壊れていた問題を修復。activeCameras を 2 台にすると、
//      Babylon の各機能が「activeCameras の末尾＝描画の基準カメラ」と
//      見なす所で全部 guiCam を拾ってしまう:
//        ・UtilityLayerRenderer → Physics Helper が何も出ない／ギズモがずれる
//        ・EffectLayer          → 選択ハイライトが全カメラパスで合成される
//        ・scene.activeCamera   → scene.pick() のレイが guiCam 基準になり、
//                                 Scene Explorer の Picker が当たらない
//      基準カメラを明示して 3 系統とも直した（「9. GUI」の bindDebugCamera）
//
//  cookie-A からの修正（クラッカーの不具合）:
//    ・巻き順の判定を1頂点の内積から全頂点の総和（重心基準）へ
//    ・反りの正規化を R² から「その方向の外形半径」へ
//    ・気泡の膨れ（blister）のしきい値を fbm の実分布に合わせる
//    ・cracker の warp / dockPitch / dockR を調整
//
//  構成:
//    0. CONFIG      … 種類プリセット（サブレ / 市松 / うずまき / チョコチップ /
//                     型押しビスケット / クラッカー / 絞り出し）と皿・物理
//    1. Rng         … シード付き擬似乱数
//    2. Noise       … 2D値ノイズ / 周期ノイズ / セルノイズ（割れ目用）
//    3. Mesh utils  … 巻き順の自動判定・法線の溶接・掃引
//    4. Section     … 断面（上面→縁→底面）と外形。丸・角丸四角・長方形・菊型
//    5. TextureLab  … 焼き色・割れ・型押し・ピケ穴・砂糖粒、リネンと釉薬
//    6. Cookie      … 円盤系（1メッシュ）＋ チョコチップ / 絞り出し系（螺旋掃引）
//    7. Plate       … 玉縁の皿
//    8. Scene / 物理（Havok で1枚ずつ落とす）
//    9. GUI
//
//  実物の要点（ここを外すと「茶色い円柱」になる）:
//    ・縁は直角ではない。生地が広がって縁が丸く膨らみ、最大径は側面の
//      中ほどに来る。底は平らで、接地しているのは外周寄りのリング
//    ・焼き色は一様ではない。縁・高いところ・底が濃く、型押しの凹部は
//      熱が回らないので白く残る。ここが逆だと一気に嘘になる
//    ・ドロップ系は表面が割れる。割れ目の中は焼けていない生地なので
//      周囲より「明るい」。暗い線で描くと焦げた溝になる
//    ・表面は多孔質。砂糖粒と気泡跡（ピンホール）があり、鏡面反射は
//      弱く広い。クリアコートを付けてよいのはチョコとジャムだけ
//    ・クッキーは冷めるときに反る。全部を平らに置くとタイルに見える
//    ・ピケ穴は貫通しない。窪みの周りがわずかに盛り上がる
//    ・絞り出しは「筋」が主役。星口金の谷には焼き色が入らず、山だけ濃い
//
//  他の野菜/果物との違い:
//    ・工業製品なので個体差が小さい。形の乱数を野菜と同じ幅で振ると
//      「手びねりの粘土」になる。乱数は外形 ±6%、厚み ±10% までに抑え、
//      代わりに焼きムラと反りで単調さを消す
//    ・皮も果肉も無い。表と裏で別の材質にする必要がないので、
//      上面・縁・底面を1枚の閉じた回転体で作り、UVの v で塗り分ける
//    ・型押しや格子は 0.3mm ほどしかない。頂点で出すとモアレるので
//      幾何は低周波（反り・うねり）だけ、細かい起伏は法線マップに回す
// =====================================================================

var createScene = async function () {
    // =================================================================
    // 0. CONFIG （単位は cm）
    // =================================================================
    const TYPES = {
        // ---- ディアマン（縁にグラニュー糖）----------------------------
        sable: {
            label: "サブレ", shape: "disc", countScale: 1.0,
            radius: 2.55, aspect: 1.0, nExp: 2.0, scallopK: 0, scallopAmp: 0,
            thickness: 0.98, dome: 0.20, rimBulge: 0.88,
            outlineJitter: 0.020, undulate: 0.55, warp: 0.55,
            crackAmt: 0.30, crackCells: 3.4, crackWidth: 0.16,
            blister: 0.0, dockPitch: 0, dockR: 0,
            emboss: "none", embossDepth: 0,
            pattern: "none",
            // 【対策】ディアマンの砂糖は側面に付く。上面に散らすと
            //         ただの粉砂糖になり、あの「ざらざらした縁」が出ない
            sugarAmt: 1.00, sugarEdge: 1.0, sugarSize: 44, sugarCol: [0.97, 0.95, 0.90],
            chips: 0,
            doughA: [0.876, 0.760, 0.545], doughB: [0.876, 0.760, 0.545],
            baked: [0.760, 0.560, 0.320], edge: [0.560, 0.352, 0.170],
            raw: [0.905, 0.822, 0.640], hole: [0.470, 0.300, 0.150],
            brownBase: 0.34, roughBase: 0.80, sss: 0.55
        },
        // ---- 市松（プレーン×ココア）----------------------------------
        checker: {
            label: "市松", shape: "disc", countScale: 1.0,
            radius: 2.35, aspect: 1.0, nExp: 5.5, scallopK: 0, scallopAmp: 0,
            thickness: 1.10, dome: 0.10, rimBulge: 0.72,
            outlineJitter: 0.014, undulate: 0.35, warp: 0.40,
            crackAmt: 0.10, crackCells: 4.0, crackWidth: 0.10,
            blister: 0.0, dockPitch: 0, dockR: 0,
            emboss: "none", embossDepth: 0,
            // 2×2 の市松。セル幅は半径そのもの
            pattern: "checker", patternCell: 2.35, patternSoft: 0.055,
            sugarAmt: 0.12, sugarEdge: 0.4, sugarSize: 52, sugarCol: [0.96, 0.94, 0.90],
            chips: 0,
            doughA: [0.878, 0.752, 0.520], doughB: [0.352, 0.234, 0.176],
            baked: [0.740, 0.540, 0.300], edge: [0.545, 0.340, 0.165],
            raw: [0.900, 0.815, 0.630], hole: [0.470, 0.300, 0.150],
            brownBase: 0.30, roughBase: 0.82, sss: 0.50
        },
        // ---- うずまき（プレーン×抹茶）--------------------------------
        swirl: {
            label: "うずまき", shape: "disc", countScale: 1.0,
            radius: 2.65, aspect: 1.0, nExp: 2.0, scallopK: 0, scallopAmp: 0,
            thickness: 0.92, dome: 0.14, rimBulge: 0.82,
            outlineJitter: 0.022, undulate: 0.45, warp: 0.50,
            crackAmt: 0.14, crackCells: 4.0, crackWidth: 0.10,
            blister: 0.0, dockPitch: 0, dockR: 0,
            emboss: "none", embossDepth: 0,
            // 【対策】2色の生地を巻いた棒を切ると、断面は必ず「二重螺旋」に
            //         なる。単一の渦にすると片方の生地が消えて縞に見える
            pattern: "swirl", patternTurns: 2.55, patternSoft: 0.030,
            sugarAmt: 0.10, sugarEdge: 0.5, sugarSize: 52, sugarCol: [0.96, 0.94, 0.90],
            chips: 0,
            doughA: [0.890, 0.790, 0.575], doughB: [0.586, 0.632, 0.352],
            baked: [0.760, 0.575, 0.335], edge: [0.575, 0.380, 0.190],
            raw: [0.910, 0.835, 0.660], hole: [0.470, 0.300, 0.150],
            brownBase: 0.26, roughBase: 0.82, sss: 0.55
        },
        // ---- チョコチップ（ドロップ）----------------------------------
        chip: {
            label: "チョコチップ", shape: "disc", countScale: 0.85,
            radius: 3.15, aspect: 1.0, nExp: 2.0, scallopK: 0, scallopAmp: 0,
            // 【対策】ドロップクッキーは「膨れる」のではなく「広がって落ちる」。
            //         dome を上げるとパンの生地のように盛り上がり、
            //         焼く前のタネをそのまま固めた饅頭になる
            thickness: 1.05, dome: 0.46, rimBulge: 0.95,
            // ドロップ生地は型で抜かない。外形の乱れが最大の手がかり。
            // ただし振りすぎると星形になるので、低周波を主にする
            outlineJitter: 0.038, undulate: 0.85, warp: 0.30,
            crackAmt: 0.85, crackCells: 2.60, crackWidth: 0.17,
            // 【対策】広がった生地は外周に同心円のさざ波を残す。
            //         これが無いと、割れ目を描いただけの平たい円盤になる
            ripple: 1.0, rippleFreq: 5.2, rippleFrom: 0.42,
            blister: 0.0, dockPitch: 0, dockR: 0,
            emboss: "none", embossDepth: 0,
            pattern: "none",
            sugarAmt: 0.16, sugarEdge: 0.2, sugarSize: 40, sugarCol: [0.97, 0.95, 0.91],
            // 【対策】チップは「大きく少なく」ではなく「小さく多く」。
            //         粒を大きくすると数を減らさざるを得ず、生地の面積が
            //         余って黒い石を置いたクッキーになる
            chips: 26, chipR: 0.220, chipRimFrac: 0.30,
            doughA: [0.878, 0.742, 0.500], doughB: [0.878, 0.742, 0.500],
            baked: [0.742, 0.522, 0.268], edge: [0.548, 0.330, 0.140],
            raw: [0.930, 0.868, 0.712], hole: [0.470, 0.300, 0.150],
            brownBase: 0.34, roughBase: 0.80, sss: 0.60
        },
        // ---- 型押しビスケット（菊型の縁＋斜め格子）--------------------
        biscuit: {
            label: "型押し", shape: "disc", countScale: 1.0,
            radius: 2.80, aspect: 1.0, scallopK: 22, scallopAmp: 0.020, nExp: 2.0,
            thickness: 0.70, dome: 0.06, rimBulge: 0.62,
            outlineJitter: 0.008, undulate: 0.28, warp: 0.45,
            crackAmt: 0.0, crackCells: 4, crackWidth: 0.1,
            blister: 0.10, dockPitch: 0, dockR: 0,
            emboss: "lattice", embossDepth: 1.0,
            embossPitch: 0.62, embossWidth: 0.30,
            embossRing: [0.78, 0.90],
            pattern: "none",
            sugarAmt: 0.0, sugarEdge: 0, sugarSize: 50, sugarCol: [0.96, 0.94, 0.90],
            chips: 0,
            doughA: [0.885, 0.775, 0.560], doughB: [0.885, 0.775, 0.560],
            baked: [0.775, 0.590, 0.345], edge: [0.600, 0.400, 0.205],
            raw: [0.908, 0.830, 0.655], hole: [0.470, 0.300, 0.150],
            brownBase: 0.38, roughBase: 0.84, sss: 0.50
        },
        // ---- クラッカー（長方形・ピケ穴・気泡）------------------------
        cracker: {
            label: "クラッカー", shape: "disc", countScale: 1.0,
            radius: 2.05, aspect: 1.60, nExp: 7.0, scallopK: 0, scallopAmp: 0,
            thickness: 0.52, dome: 0.02, rimBulge: 0.58,
            // 【修正】反りの正規化を直したぶん、warp は実効値で効くようになる。
            //         0.70 のままだとポテトチップスのように曲がる
            outlineJitter: 0.010, undulate: 0.30, warp: 0.55,
            crackAmt: 0.0, crackCells: 4, crackWidth: 0.1,
            // 【対策】クラッカーの表情はほぼ「気泡の膨れ」。これが無いと
            //         ピケ穴を開けただけの紙になる
            blister: 1.00, dockPitch: 0.86, dockR: 0.092,
            emboss: "none", embossDepth: 0,
            pattern: "none",
            // 砂糖ではなく塩。粒が大きく、数は少ない
            sugarAmt: 0.55, sugarEdge: 0.0, sugarSize: 30, sugarCol: [0.985, 0.980, 0.968],
            chips: 0,
            doughA: [0.900, 0.812, 0.610], doughB: [0.900, 0.812, 0.610],
            baked: [0.792, 0.612, 0.362], edge: [0.640, 0.435, 0.222],
            raw: [0.918, 0.848, 0.690], hole: [0.520, 0.340, 0.175],
            brownBase: 0.30, roughBase: 0.86, sss: 0.45
        },
        // ---- 絞り出し（ココア・星口金・中央にジャム）------------------
        rosette: {
            label: "絞り出し", shape: "piped", countScale: 0.9,
            radius: 2.55, thickness: 1.30,
            // 【対策】巻きどうしが必ず融合する条件は「半径方向のピッチ <
            //         縄の太さ」。断面の星は経路の枠に固定なので、水平方向は
            //         常に山（＝満径）で隣とぶつかる。
            //         ピッチ = R(1 - ropeR - coreR) / pipeTurns = 0.70cm、
            //         縄の太さ = 2・R・ropeR = 1.20cm。42% 重なり、
            //         2つの筒の交線が深さ約1mmの螺旋の溝として残る
            ropeR: 0.235, pipeTurns: 2.35, coreR: 0.120,
            starK: 8, starAmp: 0.26, ropeSquash: 0.86,
            jam: true, jamR: 0.32, jamH: 0.26,
            doughA: [0.430, 0.286, 0.212], doughB: [0.430, 0.286, 0.212],
            baked: [0.318, 0.196, 0.142], edge: [0.240, 0.140, 0.100],
            raw: [0.500, 0.352, 0.268], hole: [0.30, 0.20, 0.15],
            sugarAmt: 0.0, sugarSize: 50, sugarCol: [0.96, 0.94, 0.90],
            brownBase: 0.35, roughBase: 0.86, sss: 0.40, chips: 0
        }
    };

    // 詰め合わせのときに何をどの順で焼くか
    const ASSORT = ["chip", "checker", "rosette", "swirl", "biscuit", "sable", "cracker"];

    const GLOBAL = {
        count: 9,                  // 枚数（種類の countScale 倍される）

        // 皿
        plateRim: 13.6,            // 皿の外半径
        plateWell: 8.4,            // 平らな底の半径
        plateLip: 1.55,            // 縁の高さ
        plateThick: 0.42,
        plateSegments: 200,
        plateRings: 44,
        plateBeads: 68,            // 玉縁の数
        plateBeadAmp: 0.13,

        // --- 物理（Havok）
        // 【対策】cm 単位のシーンで実重力 981 を入れると、1ステップの
        //         めり込みが Havok の許容量を超えて震え続ける。数百に落とす
        gravity: 560,
        physicsHz: 120,
        pieceMass: 0.22,
        // 【対策】クッキーは平たいので、摩擦が低いと皿の傾斜を全部滑り落ちて
        //         縁に沿ってドーナツ状に並ぶ。焼き菓子の表面はざらざらしている
        friction: 0.92,
        restitution: 0.02,
        linearDamping: 0.24,
        angularDamping: 0.92,
        dropInterval: 0.28,
        dropClearance: 1.3,
        freezeWhenSettled: true,
        settleSpeed: 2.6, settleSpin: 2.6, settleHold: 0.40,
        settleTimeout: 8.0,

        segRound: 168,             // 円盤の周方向分割
        segAxis: 96,               // 円盤の断面方向分割
        ropeSides: 30,             // 絞り出しの断面分割
        ropeSteps: 260,            // 絞り出しの経路分割

        // 【対策】詰め合わせは7種ぶんのテクスチャを同時に持つ。1024 だと
        //         アルベド/ORM/法線 × 7 で 80MB を超える。焼き菓子の模様は
        //         高周波が少ないので 768 で足りる
        textureSize: 768,
        showGround: true,
        useSSAO: true,
        useDOF: true,
        dofRatio: 0.072,
        dofFStop: 2.6,

        // 【対策】GUI を専用カメラで合成すると UI に Bloom / DOF が乗らない
        //         代わりに Inspector のデバッグ機能が壊れる。壊れた3系統は
        //         bindDebugCamera() で直してあるが、素の挙動と比べたいときの
        //         ために摘みを残す（false にすると UI がボケる代わりに
        //         Inspector は素の状態で動く）
        guiOwnCamera: true,

        compactWidth: 700,
        compactMinSide: 480,
        guiMaxScale: 2.2
    };

    const START_MODE = "assort";
    const START_SEED = 20260805;
    const BUILD = "cookie-A3";

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const frac = (x) => x - Math.floor(x);
    const sRGB = (c) => new BABYLON.Color3(c[0], c[1], c[2]).toLinearSpace();

    // 断面パラメータ v の意味づけ（テクスチャの v と一致する）
    const V_TOP = 0.58;      // ここまでが上面
    const V_BOT = 0.80;      // ここから先が底面

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
        gauss(m, sd) {
            const u = Math.max(1e-9, this.next()), v = this.next();
            return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
        }
        int(n) { return Math.floor(this.next() * n) % n; }
    }

    // =================================================================
    // 2. Noise
    // =================================================================
    const Noise = {
        _h2(x, y, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
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
        // u 方向だけ折り返す（周方向のUVは継ぎ目が無い）
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
        // セルノイズ。f1 = 最近点、f2 = 2番目
        // 【対策】割れ目は「点の集まり」ではなく「面の境界」。f1 の閾値で
        //         作ると水玉になる。f2 - f1 が小さいところを割れ目にする
        cell2(x, y, seed) {
            const xi = Math.floor(x), yi = Math.floor(y);
            let f1 = 1e9, f2 = 1e9;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const gx = xi + dx, gy = yi + dy;
                    const jx = gx + this._h2(gx, gy, seed);
                    const jy = gy + this._h2(gx, gy, seed + 7717);
                    const ex = jx - x, ey = jy - y;
                    const d = Math.sqrt(ex * ex + ey * ey);
                    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
                }
            }
            return [f1, f2];
        }
    };

    // =================================================================
    // 3. Mesh utils
    // =================================================================
    // 【対策】巻き順の判定を「1頂点の法線と中心からの向き」で行うと、
    //         平たい個体で破綻する。基準リングは上面の外周にあるので
    //         法線はほぼ真上を向く一方、中心からの向きはほぼ真横になり、
    //         内積が 0 近傍になる。そこへ表面のうねり（0.3mm 程度）が
    //         乗ると符号がノイズで決まり、個体ごとに当たり外れが出て
    //         メッシュが裏返る。クラッカーのように dome がほぼ 0 の
    //         種類ほど確実に起きる。
    //         判定は全頂点の総和で取る。閉じた形なら「外向きの法線と
    //         重心からの向き」の内積の総和は必ず正になり、局所的な
    //         うねりでは符号が動かない
    function finalize(positions, indices) {
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        const n = positions.length / 3;
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < n; i++) {
            cx += positions[i * 3]; cy += positions[i * 3 + 1]; cz += positions[i * 3 + 2];
        }
        cx /= n; cy /= n; cz /= n;
        let acc = 0;
        for (let i = 0; i < n; i++) {
            acc += normals[i * 3] * (positions[i * 3] - cx)
                + normals[i * 3 + 1] * (positions[i * 3 + 1] - cy)
                + normals[i * 3 + 2] * (positions[i * 3 + 2] - cz);
        }
        finalize.lastScore = acc;      // 検査用に残す
        finalize.lastFlipped = acc < 0;
        if (acc < 0) {
            for (let i = 0; i < indices.length; i += 3) {
                const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t;
            }
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        return normals;
    }

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

    function makeMesh(name, positions, indices, normals, uvs, colors, scene) {
        const mesh = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals;
        if (uvs) vd.uvs = uvs;
        if (colors) vd.colors = colors;
        vd.applyToMesh(mesh, false);
        // 【対策】頂点カラーを stride 4 で入れると hasVertexAlpha が立ち、
        //         不透明なのに透過パスへ回される。透過パスは深度書き込みが
        //         切られるので、部品どうしが互いを正しく隠せなくなる
        mesh.hasVertexAlpha = false;
        return mesh;
    }

    // リング列の掃引。両端はキャップで閉じる
    function sweep(name, rings, centers, colsFn, scene) {
        const N = rings.length, M = rings[0].length;
        const total = N * M + 2;
        const positions = new Float32Array(total * 3);
        const uvs = new Float32Array(total * 2);
        const colors = colsFn ? new Float32Array(total * 4) : null;
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < M; j++) {
                const k = i * M + j, p = rings[i][j];
                positions[k * 3] = p.x; positions[k * 3 + 1] = p.y; positions[k * 3 + 2] = p.z;
                uvs[k * 2] = j / (M - 1); uvs[k * 2 + 1] = i / (N - 1);
                if (colors) {
                    const c = colsFn(i / (N - 1), j / (M - 1));
                    colors[k * 4] = c[0]; colors[k * 4 + 1] = c[1]; colors[k * 4 + 2] = c[2]; colors[k * 4 + 3] = 1;
                }
            }
        }
        const capA = N * M, capB = N * M + 1;
        positions[capA * 3] = centers[0].x; positions[capA * 3 + 1] = centers[0].y; positions[capA * 3 + 2] = centers[0].z;
        positions[capB * 3] = centers[N - 1].x; positions[capB * 3 + 1] = centers[N - 1].y; positions[capB * 3 + 2] = centers[N - 1].z;
        uvs[capA * 2] = 0.5; uvs[capA * 2 + 1] = 0;
        uvs[capB * 2] = 0.5; uvs[capB * 2 + 1] = 1;
        if (colors) {
            const a = colsFn(0, 0.5), b = colsFn(1, 0.5);
            colors[capA * 4] = a[0]; colors[capA * 4 + 1] = a[1]; colors[capA * 4 + 2] = a[2]; colors[capA * 4 + 3] = 1;
            colors[capB * 4] = b[0]; colors[capB * 4 + 1] = b[1]; colors[capB * 4 + 2] = b[2]; colors[capB * 4 + 3] = 1;
        }
        const indices = [];
        for (let i = 0; i < N - 1; i++) for (let j = 0; j < M - 1; j++) {
            const A = i * M + j, B = A + 1, C = A + M, D = C + 1;
            indices.push(A, C, B, B, C, D);
        }
        // 【対策】両端のキャップは側面と巻き順を揃える。逆だと ComputeNormals が
        //         端のリングで外向きと内向きの面法線を足し合わせて頂点法線が
        //         裏返り、個体によってメッシュ全体が反転して「中が見える」
        for (let j = 0; j < M - 1; j++) indices.push(capA, j, j + 1);
        const o = (N - 1) * M;
        for (let j = 0; j < M - 1; j++) indices.push(capB, o + j + 1, o + j);

        const normals = finalize(positions, indices);
        const score = finalize.lastScore, flipped = finalize.lastFlipped;
        weldNormals(positions, normals);
        const mesh = makeMesh(name, positions, indices, normals, uvs, colors, scene);
        mesh._windScore = score;
        mesh._windFlipped = flipped;
        return mesh;
    }

    // 幾何から焼き色を作って頂点カラーに焼き込む（絞り出し用）
    // 【対策】絞り出しの筋の焼き色は UV では決まらない。同じ u でも
    //         外周では上を向き、中心の立ち上がりでは横を向く。
    //         法線の y と高さから直接引くのが唯一破綻しない方法
    function bakeBrowning(mesh, seed, loY, hiY, deep) {
        const pos = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const nor = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);
        const n = pos.length / 3;
        const col = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
            const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
            const up = nor ? nor[i * 3 + 1] : 1;
            const face = smooth(-0.15, 0.80, up);
            const high = smooth(loY, hiY, y);
            const bake = clamp(face * (0.35 + 0.65 * high), 0, 1);
            const mott = 0.94 + 0.14 * Noise.fbm2(x * 1.7 + 5, z * 1.7 + 9, seed + 17, 3);
            const k = mix(1.10, deep, bake) * mott;
            col[i * 4] = k; col[i * 4 + 1] = k * (1 - 0.045 * bake); col[i * 4 + 2] = k * (1 - 0.095 * bake);
            col[i * 4 + 3] = 1;
        }
        mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, col, false);
        mesh.hasVertexAlpha = false;
    }

    // =================================================================
    // 4. Section / 外形
    // =================================================================
    // 断面。v=0 が上面の中心、v=1 が底面の中心。rr は外形半径に対する比、
    // yy は厚みに対する比。
    // 【対策】上面をそのまま垂直に落として底へつなぐと、縁が直角の
    //         「削り出したプラスチック板」になる。実物の生地は焼成中に
    //         広がって縁が膨らむので、最大径は側面の中ほどに来る
    function section(v, dome, rimK) {
        const drop = mix(0.10, 0.66, dome);
        const pw = mix(2.8, 1.9, dome);
        const yTopEdge = 1 - drop;
        const yBotEdge = 0.17;
        const rTop = 1 - rimK;
        if (v <= V_TOP) {
            const t = v / V_TOP;
            return { rr: rTop * t, yy: 1 - drop * Math.pow(t, pw), t: t, face: 0 };
        }
        if (v <= V_BOT) {
            const q = (v - V_TOP) / (V_BOT - V_TOP);
            const psi = Math.PI * (0.5 - q);
            const mid = (yTopEdge + yBotEdge) * 0.5, half = (yTopEdge - yBotEdge) * 0.5;
            return {
                rr: rTop + rimK * Math.cos(psi), yy: mid + half * Math.sin(psi),
                t: 1, face: 1
            };
        }
        const t = 1 - (v - V_BOT) / (1 - V_BOT);
        return { rr: rTop * t, yy: yBotEdge * smooth(0.55, 1.0, t), t: t, face: 2 };
    }

    // 【対策】縁のふくらみを「厚み全体」から決めると、ドームの強い生地で
    //         破綻する。dome=0.88 では上面が厚みの 59% ぶん落ちるので、
    //         縁として残る高さは 0.24・TH しかない。そこへ厚み基準の
    //         張り出し（0.5・TH・rimBulge）を与えると、高さの 1.7 倍も
    //         横へ出た薄いフランジになり、餃子の縁のような角が立つ。
    //         張り出しは必ず「縁自身の高さ」に比例させる
    function rimKFor(cfg, TH, R) {
        const drop = mix(0.10, 0.66, cfg.dome);
        const rimH = Math.max(0.02, 1 - drop - 0.17) * TH;
        return clamp(rimH * 0.5 * cfg.rimBulge / R, 0.008, 0.20);
    }

    // 外形（正規化半径）。丸・角丸四角・長方形・菊型を1本の式で扱う
    // 【対策】スーパー楕円の指数を上げすぎると角が立ち、抜き型ではなく
    //         包丁で切った断面になる。角丸四角は 5〜6 が上限
    function outlineBase(cfg, phi) {
        const c = Math.abs(Math.cos(phi)), s = Math.abs(Math.sin(phi));
        const n = cfg.nExp || 2;
        const a = cfg.aspect || 1;
        let r = 1 / Math.pow(Math.pow(c / a, n) + Math.pow(s, n), 1 / n);
        if (cfg.scallopK > 0) r *= 1 + cfg.scallopAmp * Math.cos(cfg.scallopK * phi);
        return r;
    }

    // =================================================================
    // 5. TextureLab
    // =================================================================
    const TextureLab = {
        _tex(name, size, fill, scene, clampV, linear) {
            size = Math.max(8, Math.round(size) || 512);
            const dt = new BABYLON.DynamicTexture(name, { width: size, height: size }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(size, size);
            fill(img.data, size);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = false;
            dt.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
            dt.wrapV = clampV ? BABYLON.Texture.CLAMP_ADDRESSMODE : BABYLON.Texture.WRAP_ADDRESSMODE;
            // 【対策】ORM と法線は「色」ではない。既定のまま（gammaSpace = true）
            //         にすると粗さ 0.80 が線形 0.61 として渡り、狙いより光る
            if (linear) dt.gammaSpace = false;
            return dt;
        },

        // 焼き色・割れ・型押し・ピケ穴・砂糖の場をまとめて1回で焼く
        // 【対策】アルベドと法線を別々に計算すると、割れ目の位置が数テクセル
        //         ずれて「模様の上にぼんやりした汚れが乗った」ように見える
        //
        // 【対策】このUVは v が断面パラメータなので、中心（v=0）付近で
        //         u 方向が極端に潰れる。UV空間でノイズを引くと放射状の筋が出る。
        //         断面の半径から (x,z) 平面へ射影した実寸座標でノイズを引けば、
        //         模様の大きさが場所によらず一定になり、継ぎ目もできない
        discFields(size, cfg) {
            const n = size * size;
            const F = {
                h: new Float32Array(n),      // 高さ（法線用）
                brown: new Float32Array(n),  // 焼き色
                crack: new Float32Array(n),  // 割れ目
                pat: new Float32Array(n),    // 生地の別（0=A, 1=B）
                sugar: new Float32Array(n),  // 砂糖 / 塩
                hole: new Float32Array(n),   // ピケ穴
                ao: new Float32Array(n)
            };
            const R = cfg.radius;
            const rimK = rimKFor(cfg, cfg.thickness, R);
            const sd = cfg.texSeed;
            const embOn = cfg.emboss === "lattice";

            for (let y = 0; y < size; y++) {
                const v = y / size;
                const S = section(v, cfg.dome, rimK);
                const topM = 1 - smooth(V_TOP - 0.055, V_TOP + 0.020, v);
                const botM = smooth(V_BOT - 0.020, V_BOT + 0.055, v);
                const rimM = clamp(1 - topM - botM, 0, 1);
                const t = S.t;
                for (let x = 0; x < size; x++) {
                    const u = x / size, i = y * size + x;
                    const phi = u * TAU;
                    const ro = outlineBase(cfg, phi) * R * S.rr;
                    const px = Math.cos(phi) * ro, pz = Math.sin(phi) * ro;

                    // ---- 生地の肌理（多孔質。全面共通）---------------
                    const grain = Noise.fbm2(px * 7.5 + 3, pz * 7.5 + 11, sd + 3, 3);
                    const fine = Noise.fbm2(px * 26 + 17, pz * 26 + 5, sd + 23, 2);
                    // 気泡跡のピンホール
                    const pinN = Noise.v2(px * 34 + 61, pz * 34 + 13, sd + 53);
                    const pin = smooth(0.905, 0.995, pinN);
                    let h = 0.56 + 0.16 * (grain - 0.5) + 0.10 * (fine - 0.5) - 0.26 * pin;

                    // ---- 気泡の膨れ（クラッカー）---------------------
                    let blis = 0;
                    if (cfg.blister > 0) {
                        const bn = Noise.fbm2(px * 1.15 + 31, pz * 1.15 + 7, sd + 41, 3);
                        // 【対策】fbm の出力は 0.5 付近に密集している。実測すると
                        //         0.80 を超えるのは面積の 1.2%、0.70 でも 8% しかない。
                        //         しきい値を素直に 0.8 に置くと膨れがほとんど出ず、
                        //         生地を伸ばしただけの板になる。分布に合わせて
                        //         0.53〜0.63 で切ると、面積の 1/4 が島として立つ
                        blis = smooth(0.53, 0.63, bn) * cfg.blister * topM;
                        h += blis * 0.42;
                    }

                    // ---- 広がりのさざ波（ドロップ生地）---------------
                    // 【対策】焼成中に外へ流れた生地は、縁の手前で何度も
                    //         止まっては押し出されるので同心円の波が残る。
                    //         真円の輪にすると年輪になるので、位相をノイズで
                    //         ゆがめて「よれた同心円」にする
                    if (cfg.ripple > 0 && topM > 0.01) {
                        const rw = Noise.fbm2(px * 1.6 + 71, pz * 1.6 + 53, sd + 29, 2) - 0.5;
                        const rp = Math.sin((t * cfg.rippleFreq + rw * 0.85) * TAU);
                        const rk = smooth(cfg.rippleFrom, cfg.rippleFrom + 0.30, t)
                            * (1 - smooth(0.93, 1.0, t)) * cfg.ripple * topM;
                        h += rp * 0.17 * rk;
                    }

                    // ---- 型押し（縁のリング＋斜め格子）---------------
                    let emb = 0, embZone = 0;
                    if (embOn && topM > 0.01) {
                        const p = cfg.embossPitch, w = cfg.embossWidth;
                        const d1 = Math.abs(frac((px + pz) / p + 0.5) - 0.5) * p;
                        const d2 = Math.abs(frac((px - pz) / p + 0.5) - 0.5) * p;
                        const bar = Math.max(1 - smooth(w * 0.25, w * 0.55, d1),
                            1 - smooth(w * 0.25, w * 0.55, d2));
                        const inner = 1 - smooth(cfg.embossRing[0] - 0.05, cfg.embossRing[0], t);
                        const ring = smooth(cfg.embossRing[0], cfg.embossRing[0] + 0.035, t)
                            * (1 - smooth(cfg.embossRing[1] - 0.035, cfg.embossRing[1], t));
                        embZone = clamp(inner + ring, 0, 1) * topM;
                        emb = clamp(bar * inner + ring, 0, 1) * topM;
                        h += (emb - 0.5 * embZone) * 0.30 * cfg.embossDepth;
                    }

                    // ---- ピケ穴 --------------------------------------
                    // 【対策】穴は貫通しない。周囲がわずかに盛り上がる。
                    //         これが無いと「黒い点を描いた板」になる
                    let hole = 0;
                    if (cfg.dockPitch > 0 && topM > 0.01 && t < 0.90) {
                        const gx = px / cfg.dockPitch, gz = pz / cfg.dockPitch;
                        const dx = (gx - Math.round(gx)) * cfg.dockPitch;
                        const dz = (gz - Math.round(gz)) * cfg.dockPitch;
                        const dd = Math.hypot(dx, dz);
                        hole = (1 - smooth(cfg.dockR * 0.45, cfg.dockR, dd)) * topM;
                        const lip = smooth(cfg.dockR, cfg.dockR * 1.5, dd)
                            * (1 - smooth(cfg.dockR * 1.5, cfg.dockR * 2.3, dd));
                        h -= hole * 0.42; h += lip * 0.08 * topM;
                    }
                    F.hole[i] = hole;

                    // ---- 割れ目（ドロップ生地）-----------------------
                    let crack = 0;
                    if (cfg.crackAmt > 0 && topM > 0.01) {
                        const wx = px + 0.55 * (Noise.fbm2(px * 1.1, pz * 1.1, sd + 7, 2) - 0.5);
                        const wz = pz + 0.55 * (Noise.fbm2(px * 1.1 + 9, pz * 1.1 + 9, sd + 7, 2) - 0.5);
                        const c = Noise.cell2(wx * cfg.crackCells, wz * cfg.crackCells, sd + 11);
                        // 中心ほど大きく割れる（ドームの張力）
                        const gate = smooth(0.92, 0.30, t) * topM * cfg.crackAmt;
                        crack = (1 - smooth(0, cfg.crackWidth, c[1] - c[0])) * gate;
                        h -= crack * 0.40;
                    }
                    F.crack[i] = crack;

                    // ---- 砂糖 / 塩 ------------------------------------
                    let sugar = 0;
                    if (cfg.sugarAmt > 0) {
                        const sn = Noise.v2(px * cfg.sugarSize + 5, pz * cfg.sugarSize + 9, sd + 77);
                        const wgt = mix(1.0, 0.20 + 0.80 * (smooth(0.70, 1.0, t) * topM + rimM),
                            cfg.sugarEdge);
                        sugar = smooth(0.90, 0.985, sn) * cfg.sugarAmt * clamp(wgt, 0, 1.4);
                        h += sugar * 0.30;
                    }
                    F.sugar[i] = clamp(sugar, 0, 1);

                    // ---- 2色生地 --------------------------------------
                    let pat = 0;
                    if (cfg.pattern === "checker") {
                        const cc = cfg.patternCell;
                        // 【対策】セル境界は原点に来なければならない。位相を
                        //         半セットずらすと外周に幅半分の帯ができて、
                        //         2×2 のはずが 3×3 のパッチワークになる
                        // 【対策】市松の境目は包丁の跡なので直線だが、焼成で
                        //         わずかに滲む。完全な階段にすると印刷に見える
                        const wu = 0.045 * (Noise.fbm2(px * 3.1, pz * 3.1, sd + 91, 2) - 0.5) * 2;
                        const wv = 0.045 * (Noise.fbm2(px * 3.1 + 13, pz * 3.1 + 7, sd + 93, 2) - 0.5) * 2;
                        const qa = px / cc + wu, qb = pz / cc + wv;
                        const a = frac(qa), b = frac(qb);
                        const ea = Math.min(a, 1 - a), eb = Math.min(b, 1 - b);
                        // 市松は「2つの座標の床の和の偶奇」
                        const odd = ((Math.floor(qa) + Math.floor(qb)) & 1) === 0 ? 0 : 1;
                        const soft = smooth(0, cfg.patternSoft, Math.min(ea, eb));
                        pat = mix(0.5, odd, soft);
                    } else if (cfg.pattern === "swirl") {
                        // 【対策】2色の生地を巻いた棒の断面は必ず二重螺旋。
                        //         位相を「角度 - 半径×巻き数」で作れば、
                        //         中心へ向かって滑らかに巻き込む
                        const rr = Math.hypot(px, pz) / R;
                        const ph = frac(phi / TAU - rr * cfg.patternTurns
                            + 0.03 * (Noise.fbm2(px * 2.4, pz * 2.4, sd + 97, 2) - 0.5));
                        const e = Math.min(Math.abs(ph - 0.5), Math.min(ph, 1 - ph));
                        const s01 = smooth(0, cfg.patternSoft, e);
                        pat = mix(0.5, ph < 0.5 ? 0 : 1, s01);
                        // 巻きの境目はわずかに沈む
                        h -= (1 - s01) * 0.06;
                    }
                    F.pat[i] = pat;

                    // ---- 焼き色 --------------------------------------
                    // 【対策】焼き色を一様に乗せると駄菓子になる。
                    //         上面は外周ほど、縁は最も濃く、底は均一に濃い。
                    //         そのうえで「高いところほど濃い」を足すと、
                    //         気泡や型押しの山が自然に色づく
                    const mott = Noise.fbm2(px * 2.1 + 41, pz * 2.1 + 29, sd + 13, 3);
                    let brown = cfg.brownBase;
                    brown += 0.52 * smooth(0.62, 1.0, t) * topM;
                    brown += 0.38 * rimM;
                    brown = mix(brown, 0.86, botM);
                    brown += 0.34 * (h - 0.56);
                    brown += 0.20 * (mott - 0.5);
                    brown += blis * 0.30;
                    // 型押しの凹部は熱が回らず白く残る（山は逆に濃い）
                    if (embZone > 0) brown += mix(-0.22, 0.16, emb) * embZone;
                    F.brown[i] = clamp(brown, 0, 1);

                    F.h[i] = clamp(h, 0, 1);
                    // AO：割れ目と穴の中、型押しの谷
                    F.ao[i] = clamp(1 - 0.42 * crack - 0.55 * hole
                        - 0.18 * (1 - F.h[i]) - 0.12 * embZone * (1 - emb), 0.10, 1);
                }
            }
            return F;
        },

        discAlbedo(scene, size, cfg, F) {
            const A = cfg.doughA, B = cfg.doughB, BK = cfg.baked, ED = cfg.edge;
            const RW = cfg.raw, SG = cfg.sugarCol, HL = cfg.hole;
            return this._tex("cookieAlbedo_" + cfg.type, size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    const rimM = clamp(1 - (1 - smooth(V_TOP - 0.055, V_TOP + 0.020, v))
                        - smooth(V_BOT - 0.020, V_BOT + 0.055, v), 0, 1);
                    for (let x = 0; x < N; x++) {
                        const i = y * N + x, o = i * 4;
                        const p = F.pat[i];
                        let cr = mix(A[0], B[0], p), cg = mix(A[1], B[1], p), cb = mix(A[2], B[2], p);
                        // 【対策】ココアや抹茶の生地は焼き色がほとんど乗らない。
                        //         プレーンと同じ量を乗せると全部同じ茶色になり、
                        //         せっかくの2色生地が消える
                        const bk = F.brown[i] * mix(1.0, 0.30, p);
                        cr = mix(cr, BK[0], bk); cg = mix(cg, BK[1], bk); cb = mix(cb, BK[2], bk);
                        const ek = smooth(0.62, 1.0, F.brown[i]) * (0.45 + 0.55 * rimM) * mix(1.0, 0.35, p);
                        cr = mix(cr, ED[0], ek); cg = mix(cg, ED[1], ek); cb = mix(cb, ED[2], ek);
                        // 割れ目の中は焼けていない生地。周囲より明るい
                        const ck = F.crack[i];
                        if (ck > 0.001) {
                            const k = smooth(0.10, 0.85, ck) * 0.85 * mix(1.0, 0.40, p);
                            cr = mix(cr, RW[0], k); cg = mix(cg, RW[1], k); cb = mix(cb, RW[2], k);
                        }
                        // ピケ穴の底は影と焦げで暗い
                        const hk = smooth(0.20, 0.90, F.hole[i]);
                        cr = mix(cr, HL[0], hk); cg = mix(cg, HL[1], hk); cb = mix(cb, HL[2], hk);
                        // 砂糖 / 塩の粒
                        const sk = smooth(0.05, 0.55, F.sugar[i]);
                        cr = mix(cr, SG[0], sk); cg = mix(cg, SG[1], sk); cb = mix(cb, SG[2], sk);
                        d[o] = clamp(cr, 0, 1) * 255;
                        d[o + 1] = clamp(cg, 0, 1) * 255;
                        d[o + 2] = clamp(cb, 0, 1) * 255;
                        d[o + 3] = 255;
                    }
                }
            }, scene, true, false);
        },

        discOrm(scene, size, cfg, F) {
            return this._tex("cookieORM_" + cfg.type, size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    const botM = smooth(V_BOT - 0.020, V_BOT + 0.055, v);
                    for (let x = 0; x < N; x++) {
                        const i = y * N + x, o = i * 4;
                        // 【対策】焼き菓子は乾いた多孔質。粗さの基準を 0.6 台まで
                        //         下げると、それだけで樹脂の食品サンプルになる
                        let rough = cfg.roughBase + 0.06 * (1 - F.h[i]);
                        rough += 0.08 * F.crack[i];              // 割れ口はさらに乾く
                        rough = mix(rough, rough + 0.05, botM);  // 底は焼き網の跡でざらつく
                        // 砂糖の粒だけは結晶なので鋭く光る
                        rough = mix(rough, 0.30, smooth(0.10, 0.70, F.sugar[i]));
                        // よく焼けたところは糖が溶けてわずかに滑らか
                        rough -= 0.10 * smooth(0.55, 1.0, F.brown[i]);
                        d[o] = clamp(F.ao[i], 0, 1) * 255;
                        d[o + 1] = clamp(rough, 0.05, 1) * 255;
                        d[o + 2] = 0; d[o + 3] = 255;
                    }
                }
            }, scene, true, true);
        },

        // 高さ場 → 法線マップ
        normal(scene, size, hf, strength, name) {
            return this._tex(name, size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    // 極ではUが潰れて放射状の筋になるので端を減衰させる
                    const vv = y / N;
                    const k = strength * smooth(0, 0.04, vv) * (1 - smooth(0.965, 1.0, vv));
                    for (let x = 0; x < N; x++) {
                        const xl = hf[y * N + ((x - 1 + N) % N)], xr = hf[y * N + ((x + 1) % N)];
                        const yu = hf[Math.max(0, y - 1) * N + x], yd = hf[Math.min(N - 1, y + 1) * N + x];
                        // 【対策】v は画像の下方向に増える。OpenGL 系の
                        //         「V が上向き」の規約のまま (yu - yd) にすると
                        //         u は正・v は逆というねじれた法線になる
                        let nx = (xl - xr) * k, ny = (yd - yu) * k, nz = 1;
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const i = (y * N + x) * 4;
                        d[i] = (nx * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene, true, true);
        },

        // 絞り出し。u が断面の角度、v が絞りの道のり
        ropeFields(size, cfg) {
            const n = size * size;
            const F = { h: new Float32Array(n), ridge: new Float32Array(n) };
            const K = cfg.starK, sd = cfg.texSeed;
            for (let y = 0; y < size; y++) {
                const v = y / size;
                for (let x = 0; x < size; x++) {
                    const u = x / size, i = y * size + x;
                    // 星口金の山（u に K 回）
                    const ridge = Math.pow(0.5 + 0.5 * Math.cos(K * u * TAU), 0.55);
                    // 生地の肌理は絞りの方向（v）に流れる
                    const grain = Noise.fbm2u(u * K * 9, v * 34, K * 9, sd + 3, 3);
                    const flow = Noise.fbm2u(u * K * 3, v * 120, K * 3, sd + 19, 2);
                    const pin = smooth(0.90, 1.0, Noise.v2u(u * 90, v * 260, 90, sd + 53));
                    F.ridge[i] = ridge;
                    F.h[i] = clamp(0.50 + 0.14 * (grain - 0.5) + 0.20 * (flow - 0.5) - 0.24 * pin, 0, 1);
                }
            }
            return F;
        },

        ropeAlbedo(scene, size, cfg, F) {
            const A = cfg.doughA, BK = cfg.baked, ED = cfg.edge, RW = cfg.raw;
            return this._tex("ropeAlbedo_" + cfg.type, size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    for (let x = 0; x < N; x++) {
                        const i = y * N + x, o = i * 4;
                        // 【対策】焼き色は「山だけ」に乗る。谷まで塗ると
                        //         絞りの筋が消えて茶色い縄になる。
                        //         実際の上下関係は頂点カラー側で掛ける
                        const rg = F.ridge[i];
                        let cr = A[0], cg = A[1], cb = A[2];
                        const bk = 0.20 + 0.62 * smooth(0.35, 1.0, rg);
                        cr = mix(cr, BK[0], bk); cg = mix(cg, BK[1], bk); cb = mix(cb, BK[2], bk);
                        const ek = smooth(0.80, 1.0, rg) * 0.45;
                        cr = mix(cr, ED[0], ek); cg = mix(cg, ED[1], ek); cb = mix(cb, ED[2], ek);
                        // 谷は生地の色が残る
                        const vk = (1 - smooth(0.05, 0.40, rg)) * 0.35;
                        cr = mix(cr, RW[0], vk); cg = mix(cg, RW[1], vk); cb = mix(cb, RW[2], vk);
                        const g = 0.90 + 0.20 * F.h[i];
                        d[o] = clamp(cr * g, 0, 1) * 255;
                        d[o + 1] = clamp(cg * g, 0, 1) * 255;
                        d[o + 2] = clamp(cb * g, 0, 1) * 255;
                        d[o + 3] = 255;
                    }
                }
            }, scene, false, false);
        },

        ropeOrm(scene, size, cfg, F) {
            return this._tex("ropeORM_" + cfg.type, size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    for (let x = 0; x < N; x++) {
                        const i = y * N + x, o = i * 4;
                        const rough = cfg.roughBase + 0.06 * (1 - F.h[i]) - 0.06 * F.ridge[i];
                        const ao = 1 - 0.45 * (1 - F.ridge[i]) - 0.14 * (1 - F.h[i]);
                        d[o] = clamp(ao, 0.10, 1) * 255;
                        d[o + 1] = clamp(rough, 0.05, 1) * 255;
                        d[o + 2] = 0; d[o + 3] = 255;
                    }
                }
            }, scene, false, true);
        },

        // リネンのクロス。u,v とも織りの周期
        // 【対策】明暗差を付けすぎると市松のタイルになる。糸の上下は
        //         色ではなく陰影の差でしかない
        linen(scene, size, seed) {
            const WARP = [0.855, 0.828, 0.790], WEFT = [0.815, 0.786, 0.748];
            return this._tex("linenAlbedo", size, (d, N) => {
                const P = 128;
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        const su = u * P, sv = v * P;
                        const fu = su - Math.floor(su), fv = sv - Math.floor(sv);
                        const over = ((Math.floor(su) + Math.floor(sv)) & 1) === 0;
                        const bu = Math.sin(Math.PI * fu), bv = Math.sin(Math.PI * fv);
                        const shade = over ? (0.90 + 0.13 * bv) : (0.80 + 0.12 * bu);
                        const slub = 0.93 + 0.14 * Noise.fbm2u(u * 220, v * 220, 220, seed, 2);
                        const stain = 0.94 + 0.12 * Noise.fbm2u(u * 5, v * 5, 5, seed + 9, 3);
                        const C = over ? WARP : WEFT;
                        d[i] = clamp(C[0] * shade * slub * stain, 0, 1) * 255;
                        d[i + 1] = clamp(C[1] * shade * slub * stain, 0, 1) * 255;
                        d[i + 2] = clamp(C[2] * shade * slub * stain, 0, 1) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene, false, false);
        }
    };

    // =================================================================
    //  マテリアル（種類ごとにキャッシュ）
    // =================================================================
    class Skin {
        constructor(scene, cfg) {
            const S = cfg.textureSize;
            const OPAQUE = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
            this.texs = [];
            this.mats = [];

            if (cfg.shape === "piped") {
                const F = TextureLab.ropeFields(Math.min(768, S), cfg);
                this.albedoTex = TextureLab.ropeAlbedo(scene, Math.min(768, S), cfg, F);
                this.ormTex = TextureLab.ropeOrm(scene, Math.min(768, S), cfg, F);
                this.normalTex = TextureLab.normal(scene, Math.min(768, S), F.h, 1.7, "ropeNormal_" + cfg.type);
            } else {
                const F = TextureLab.discFields(S, cfg);
                this.albedoTex = TextureLab.discAlbedo(scene, S, cfg, F);
                this.ormTex = TextureLab.discOrm(scene, S, cfg, F);
                this.normalTex = TextureLab.normal(scene, S, F.h, 2.6, "cookieNormal_" + cfg.type);
            }
            this.texs.push(this.albedoTex, this.ormTex, this.normalTex);
            for (const t of this.texs) t.anisotropicFilteringLevel = 8;

            // --- 生地 -----------------------------------------------
            const m = new BABYLON.PBRMaterial("cookie_" + cfg.type, scene);
            m.albedoTexture = this.albedoTex;
            m.metallic = 0.0;
            m.roughness = 1.0;                   // 実値は ORM の G
            m.metallicTexture = this.ormTex;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.bumpTexture = this.normalTex;
            m.bumpTexture.level = cfg.shape === "piped" ? 0.75 : 0.95;
            m.transparencyMode = OPAQUE;
            // 【対策】クリアコートは絶対に付けない。焼き菓子に艶を足すと
            //         一発で樹脂成型の食品サンプルになる。代わりに sheen を
            //         ごく弱く入れて、乾いた粉っぽい面が斜めから見たときだけ
            //         白く立つのを拾う
            m.sheen.isEnabled = true;
            m.sheen.intensity = 0.14;
            m.sheen.roughness = 0.65;
            m.sheen.color = new BABYLON.Color3(0.80, 0.70, 0.55);
            // 薄い縁は逆光でうっすら透ける
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.tintColor = new BABYLON.Color3(0.92, 0.72, 0.46);
            m.subSurface.translucencyIntensity = 0.14 * cfg.sss;
            m.subSurface.minimumThickness = 0.6;
            m.subSurface.maximumThickness = 3.2;
            this.dough = m;
            this.mats.push(m);

            // --- チョコ ---------------------------------------------
            if (cfg.chips > 0) {
                const c = new BABYLON.PBRMaterial("choco_" + cfg.type, scene);
                // 【対策】チョコを真っ黒にすると炭か石になる。実物は
                //         暗いが確かに赤茶で、ハイライトの周りに色が出る
                c.albedoColor = sRGB([0.205, 0.118, 0.080]);
                c.metallic = 0.0;
                c.roughness = 0.44;
                c.transparencyMode = OPAQUE;
                // 【対策】チョコだけはカカオバターの膜があるので薄い艶が要る。
                //         ただし roughness を下げて出すと「濡れた石」になるので
                //         クリアコートで層として乗せる
                c.clearCoat.isEnabled = true;
                c.clearCoat.intensity = 0.34;
                c.clearCoat.roughness = 0.26;
                this.choco = c;
                this.mats.push(c);
            }

            // --- ジャム ---------------------------------------------
            if (cfg.jam) {
                const j = new BABYLON.PBRMaterial("jam_" + cfg.type, scene);
                j.albedoColor = sRGB([0.520, 0.062, 0.058]);
                j.metallic = 0.0;
                j.roughness = 0.16;
                j.transparencyMode = OPAQUE;
                j.clearCoat.isEnabled = true;
                j.clearCoat.intensity = 0.95;
                j.clearCoat.roughness = 0.05;
                // ジャムは厚みぶんだけ確実に光を透かす。ここが無いと赤い樹脂
                j.subSurface.isTranslucencyEnabled = true;
                j.subSurface.tintColor = new BABYLON.Color3(0.90, 0.14, 0.10);
                j.subSurface.translucencyIntensity = 0.85;
                j.subSurface.minimumThickness = 0.05;
                j.subSurface.maximumThickness = 0.60;
                this.jam = j;
                this.mats.push(j);
            }
        }
        dispose() {
            for (const m of this.mats) m.dispose(true, false);
            for (const t of this.texs) t.dispose();
            this.mats.length = 0; this.texs.length = 0;
        }
    }

    // =================================================================
    // 6. Cookie
    // =================================================================
    class Cookie {
        constructor(scene, cfg, seed, skin) {
            this.scene = scene; this.cfg = cfg; this.seed = seed >>> 0;
            this.skin = skin;
            this.parts = [];
            this.root = new BABYLON.TransformNode("cookieRoot", scene);
            const rng = new Rng(this.seed);
            this.rng = rng;
            this.nseed = (this.seed % 100000) | 0;

            // 【対策】クッキーは工業製品なので個体差が小さい。野菜と同じ幅で
            //         乱数を振ると手びねりの粘土になる。外形 ±6%、厚み ±10%
            this.R = cfg.radius * rng.range(0.945, 1.055);
            this.TH = cfg.thickness * rng.range(0.92, 1.10);

            if (cfg.shape === "piped") {
                this._buildRope();
                if (cfg.jam) this._buildJam();
            } else {
                this.rimK = rimKFor(cfg, this.TH, this.R);
                // 反り：冷めるときに一方向へ持ち上がる
                this.warpAng = rng.range(0, TAU);
                this.warpAmt = cfg.warp * rng.range(0.55, 1.35);
                this.jit = cfg.outlineJitter * rng.range(0.7, 1.3);
                this.uOff = cfg.pattern === "none" && cfg.emboss === "none" && cfg.dockPitch === 0
                    ? rng.next() : (rng.int(4) * 0.25);
                this._buildDisc();
                if (cfg.chips > 0) this._buildChips();
            }
        }

        // ---- 外形と表面 -----------------------------------------------
        outlineR(phi) {
            const u = phi / TAU;
            const w = Noise.fbm2u(u * 6, 0.5, 6, this.nseed + 31, 2) - 0.5;
            const w2 = Noise.fbm2u(u * 14, 3.5, 14, this.nseed + 47, 2) - 0.5;
            return this.R * outlineBase(this.cfg, phi) * (1 + this.jit * (2.0 * w + 0.8 * w2));
        }

        // 【対策】幾何に載せるのは低周波（反り・うねり）だけ。型押しや割れ目
        //         まで頂点で出すと、周 168 分割では 1mm 級の起伏がテッセレーション
        //         に追いついてモアレる。細かい起伏は法線マップの担当
        surfaceAt(v, phi) {
            const cfg = this.cfg;
            const S = section(v, cfg.dome, this.rimK);
            const Ro = this.outlineR(phi);
            const x = Math.cos(phi) * Ro * S.rr;
            const z = Math.sin(phi) * Ro * S.rr;
            let y = this.TH * S.yy;
            if (S.face === 0 && cfg.undulate > 0) {
                const un = Noise.fbm2(x * 1.05 + 11, z * 1.05 + 7, this.nseed + 5, 3) - 0.5;
                const un2 = Noise.fbm2(x * 2.6 + 3, z * 2.6 + 19, this.nseed + 61, 2) - 0.5;
                y += this.TH * cfg.undulate * 0.16 * (1.6 * un + 0.7 * un2)
                    * (1 - smooth(0.72, 1.0, S.t));
            }
            // 反り（鞍型）。上面も底面も同じだけ持ち上がる
            // 【対策】反り量を R² で割ると、長方形の個体で破綻する。
            //         aspect 1.6 のクラッカーは長辺方向の半径が 1.74R まで
            //         伸びるので、(x/R)² が 3 を超え、狙いの3倍の反りが付く。
            //         厚み 0.52cm に対して 0.45cm も持ち上がり、ポテトチップスの
            //         ように曲がって縁が刃物のように見える。
            //         必ず「その方向の外形半径」で正規化して ±1 に収める
            const ax = this.R * (cfg.aspect || 1);
            const un = x / ax, vn = z / this.R;
            const ca = Math.cos(this.warpAng), sa = Math.sin(this.warpAng);
            const wx = un * ca + vn * sa, wz = -un * sa + vn * ca;
            y += this.warpAmt * this.TH * 0.30 * (wx * wx - wz * wz * 0.55);
            return { x, y, z };
        }

        _buildDisc() {
            const cfg = this.cfg, M = cfg.segRound, N = cfg.segAxis;
            const rings = [], centers = [];
            const mo = this.rng.range(0.94, 1.05);
            for (let i = 0; i < N; i++) {
                const v = mix(0.0035, 0.9965, i / (N - 1));
                const ring = [];
                let sy = 0;
                for (let j = 0; j <= M; j++) {
                    const phi = (j % M) / M * TAU;
                    const p = this.surfaceAt(v, phi);
                    ring.push(new V3(p.x, p.y, p.z));
                    sy += p.y;
                }
                rings.push(ring);
                centers.push(new V3(0, sy / (M + 1), 0));
            }
            // 個体ごとの焼きムラ（テクスチャは種類で共有なので、ここで崩す）
            const nseed = this.nseed;
            const cols = (vv, uu) => {
                const k = mo * (0.955 + 0.09 * Noise.fbm2u(uu * 5, vv * 3.5, 5, nseed + 71, 3));
                return [k, k * 0.998, k * 0.994];
            };
            const mesh = sweep("cookie", rings, centers, cols, this.scene);
            // 【対策】同じ種類のクッキーが全部同じ割れ方をすると、皿に並べた
            //         瞬間にコピーだとばれる。UV の u をずらして模様を回す。
            //         向きのある型（市松・格子・ピケ）は 90° 単位でしか回せない
            if (this.uOff > 0) {
                const uvs = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
                for (let i = 0; i < uvs.length; i += 2) uvs[i] = frac(uvs[i] + this.uOff);
                mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, uvs, false);
            }
            mesh.material = this.skin.dough;
            mesh.receiveShadows = true;
            this.body = mesh;
            this.parts.push(mesh);
        }

        // ---- チョコチップ ---------------------------------------------
        // 【対策】チップをテクスチャの黒い斑点で済ませると、真上から見た
        //         1枚は誤魔化せても、皿に伏せた瞬間に「印刷」だとわかる。
        //         焼成でわずかに溶けて潰れた塊として実体で置く
        _buildChips() {
            const cfg = this.cfg, rng = this.rng, list = [];
            const n = Math.round(cfg.chips * rng.range(0.8, 1.2));
            for (let c = 0; c < n; c++) {
                const rimChip = rng.next() < cfg.chipRimFrac;
                const phi = rng.range(0, TAU);
                const t = rimChip ? rng.range(0.86, 0.99) : Math.sqrt(rng.next()) * 0.86;
                const v = rimChip ? mix(V_TOP, V_TOP + 0.10, rng.next()) : t * V_TOP;
                const p = this.surfaceAt(v, phi);
                // 【対策】粒径のばらつきを大きく取ると、たまたま出た大粒が
                //         視線を全部さらって「石が刺さったクッキー」になる。
                //         市販のチップは粒が揃っている
                const r = cfg.chipR * rng.range(0.80, 1.18);
                const sph = BABYLON.MeshBuilder.CreateSphere("chip",
                    { diameter: 2, segments: 8 }, this.scene);
                const pos = sph.getVerticesData(BABYLON.VertexBuffer.PositionKind);
                const sq = rng.range(0.55, 0.80);      // 潰れ具合
                const rot = rng.range(0, TAU);
                for (let i = 0; i < pos.length; i += 3) {
                    let vx = pos[i], vy = pos[i + 1], vz = pos[i + 2];
                    // 角のとれた不定形にする。真球だとチョコボールになる
                    const d = 1 + 0.26 * (Noise.fbm2(vx * 2.2 + c * 3.7, vz * 2.2 + vy * 1.4,
                        this.nseed + 101 + c, 2) - 0.5) * 2;
                    vx *= r * d; vz *= r * d; vy *= r * sq * d;
                    const cx = vx * Math.cos(rot) - vz * Math.sin(rot);
                    const cz = vx * Math.sin(rot) + vz * Math.cos(rot);
                    pos[i] = cx; pos[i + 1] = vy; pos[i + 2] = cz;
                }
                sph.setVerticesData(BABYLON.VertexBuffer.PositionKind, pos, false);
                const nor = new Float32Array(pos.length);
                BABYLON.VertexData.ComputeNormals(pos, sph.getIndices(), nor);
                sph.setVerticesData(BABYLON.VertexBuffer.NormalKind, nor, false);
                // 生地に埋める。全部出すと上に置いただけのビーズになる
                // 【対策】チップは生地に浮かんでいるのではなく、練り込まれて
                //         上面から頭だけ出している。露出を半分以上にすると
                //         あとから貼りつけたビーズになる
                sph.position.set(p.x, p.y - r * sq * rng.range(0.35, 0.68), p.z);
                list.push(sph);
            }
            if (!list.length) return;
            const merged = BABYLON.Mesh.MergeMeshes(list, true, true, undefined, false, false);
            if (!merged) return;
            merged.name = "chips";
            merged.material = this.skin.choco;
            merged.receiveShadows = true;
            merged.parent = this.root;
            this.parts.push(merged);
        }

        // ---- 絞り出し（螺旋の掃引）------------------------------------
        ropeCenter(s) {
            const cfg = this.cfg;
            const ang = s * cfg.pipeTurns * TAU + this.pipeA0;
            const r0 = this.R * (1 - cfg.ropeR), r1 = this.R * cfg.coreR;
            const rad = mix(r0, r1, s);
            // 【対策】絞り出しは天板の上で「平らに」巻く。中心へ向かって芯線を
            //         持ち上げると、隣り合う巻きが上下にずれてあいだに穴が開き、
            //         「積み上げた縄」になる。実物で高さが変わるのは最後の
            //         一巻きが前の巻きに乗り上げるぶんだけ
            const rv = this.R * cfg.ropeR * cfg.ropeSquash;
            const y = rv * 0.88 + this.TH * 0.15 * smooth(0.58, 1.0, s);
            return new V3(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
        }

        _buildRope() {
            const cfg = this.cfg, M = cfg.ropeSides, N = cfg.ropeSteps;
            this.pipeA0 = this.rng.range(0, TAU);
            const K = cfg.starK, amp = cfg.starAmp;
            const rings = [], centers = [];
            const baseY = this.TH * 0.02;
            let topY = baseY;
            for (let i = 0; i < N; i++) {
                const s = i / (N - 1);
                const C = this.ropeCenter(s);
                const e = 1.5e-3;
                const a = this.ropeCenter(clamp(s - e, 0, 1));
                const b = this.ropeCenter(clamp(s + e, 0, 1));
                let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
                const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
                // 接線とワールドの上から断面の2軸を作る（ねじれが出ない）
                let sx = tz, sy2 = 0, sz = -tx;
                const sl = Math.hypot(sx, sy2, sz) || 1; sx /= sl; sy2 /= sl; sz /= sl;
                const ux = sy2 * tz - sz * ty, uy = sz * tx - sx * tz, uz = sx * ty - sy2 * tx;
                // 絞り始めはやや細く、絞り終わりは円錐状にとがらせる
                const taper = (1 - 0.14 * (1 - smooth(0.0, 0.055, s)))
                    * (1 - 0.92 * smooth(0.90, 1.0, s));
                const rSec = this.R * cfg.ropeR * taper;
                const ring = [];
                for (let j = 0; j <= M; j++) {
                    const al = (j % M) / M * TAU;
                    // 星口金：山と谷。谷を深くしすぎると麦わらになる
                    const star = 1 - amp + amp * Math.pow(0.5 + 0.5 * Math.cos(K * al), 0.55);
                    const wob = 1 + 0.05 * (Noise.fbm2(Math.cos(al) * 2.5,
                        s * 9 + Math.sin(al) * 2.5, this.nseed + 7, 2) - 0.5);
                    const rr = rSec * star * wob;
                    const ca = Math.cos(al) * rr, sa2 = Math.sin(al) * rr * cfg.ropeSquash;
                    let vx = C.x + sx * ca + ux * sa2;
                    let vy = C.y + sy2 * ca + uy * sa2;
                    let vz = C.z + sz * ca + uz * sa2;
                    // 【対策】絞り出しは天板に押しつけられて底が平らになる。
                    //         丸いままだと転がるし、影も点でしか落ちない
                    if (vy < baseY) vy = baseY + (vy - baseY) * 0.12;
                    if (vy > topY) topY = vy;
                    ring.push(new V3(vx, vy, vz));
                }
                rings.push(ring); centers.push(C);
            }
            this.ropeTopY = topY;
            const mesh = sweep("rosette", rings, centers, null, this.scene);
            bakeBrowning(mesh, this.nseed, baseY, topY * 0.98, 0.62);
            mesh.material = this.skin.dough;
            mesh.receiveShadows = true;
            this.body = mesh;
            this.parts.push(mesh);
        }

        _buildJam() {
            const cfg = this.cfg, rng = this.rng;
            const R = this.R * cfg.jamR * rng.range(0.85, 1.15);
            const H = this.TH * cfg.jamH;
            const M = 56, N = 26;
            // 【対策】ジャムの座面を厚みの比で決めると、絞りの高さを変えた
            //         とたんに宙に浮くか埋まる。実測した縄の頂点に乗せる
            const base = (this.ropeTopY || this.TH * 0.80) - H * 0.45;
            const rings = [], centers = [];
            const lob = rng.range(0, TAU);
            for (let i = 0; i < N; i++) {
                const v = mix(0.004, 0.996, i / (N - 1));
                // 上半分はドーム、下半分は生地に沿って広がる
                const up = v < 0.62;
                const t = up ? v / 0.62 : 1 - (v - 0.62) / 0.38;
                const ring = [];
                let sy = 0;
                for (let j = 0; j <= M; j++) {
                    const phi = (j % M) / M * TAU;
                    // ジャムは表面張力で丸まるが、輪郭は不規則に垂れる
                    // 【対策】ジャムは煮詰まって粘度が高く、落とした形のまま丸く
                    //         固まる。輪郭を大きく波打たせると溶けた飴になる
                    const wob = 1 + 0.055 * Math.cos(3 * phi + lob) + 0.030 * Math.cos(5 * phi - lob);
                    const rr = R * wob * Math.sin(t * Math.PI * 0.5);
                    const yy = up ? base + H * Math.cos(t * Math.PI * 0.5)
                        : base - H * 0.30 * Math.cos(t * Math.PI * 0.5);
                    const x = Math.cos(phi) * rr, z = Math.sin(phi) * rr;
                    ring.push(new V3(x, yy, z));
                    sy += yy;
                }
                rings.push(ring); centers.push(new V3(0, sy / (M + 1), 0));
            }
            const mesh = sweep("jam", rings, centers, null, this.scene);
            mesh.material = this.skin.jam;
            mesh.receiveShadows = true;
            this.parts.push(mesh);
        }

        // ---- 当たり判定 -----------------------------------------------
        // 【対策】クッキーはほぼ凸なので凸包で足りる。ただしメッシュ本体を
        //         そのまま渡すと 1.6万頂点から凸包を取ることになり、
        //         枚数ぶん繰り返すと生成で数秒固まる。粗い代理を作る
        hullShape() {
            const proxy = this._proxy();
            const hull = new BABYLON.PhysicsShapeConvexHull(proxy, this.scene);
            proxy.dispose();
            return hull;
        }
        _proxy() {
            if (this.cfg.shape === "piped") {
                const N = 10, M = 22;
                const rings = [], centers = [];
                // 【対策】芯線を平らにした時点で絞り出しは「円盤」であって
                //         円錐ではない。円錐の凸包のままだと上に載る個体が
                //         斜面を滑り落ちて、皿の上で団子にならない
                const top = this.ropeTopY || this.TH;
                for (let i = 0; i < N; i++) {
                    const v = i / (N - 1);
                    const rr = this.R * (1 - 0.22 * smooth(0.70, 1.0, v));
                    const yy = mix(this.TH * 0.01, top, v);
                    const ring = [];
                    for (let j = 0; j <= M; j++) {
                        const phi = (j % M) / M * TAU;
                        ring.push(new V3(Math.cos(phi) * rr, yy, Math.sin(phi) * rr));
                    }
                    rings.push(ring); centers.push(new V3(0, yy, 0));
                }
                const p = sweep("rosetteProxy", rings, centers, null, this.scene);
                p.isVisible = false;
                return p;
            }
            const N = 16, M = 26;
            const rings = [], centers = [];
            for (let i = 0; i < N; i++) {
                const v = mix(0.01, 0.99, i / (N - 1));
                const ring = [];
                let sy = 0;
                for (let j = 0; j <= M; j++) {
                    const phi = (j % M) / M * TAU;
                    const p = this.surfaceAt(v, phi);
                    ring.push(new V3(p.x, p.y, p.z));
                    sy += p.y;
                }
                rings.push(ring); centers.push(new V3(0, sy / (M + 1), 0));
            }
            const p = sweep("cookieProxy", rings, centers, null, this.scene);
            p.isVisible = false;
            return p;
        }

        get span() {
            const a = this.cfg.aspect || 1;
            return this.R * Math.max(1, a) * 2;
        }

        attach() {
            for (const m of this.parts) if (m.parent !== this.root) m.parent = this.root;
        }

        worldBounds() {
            let mnx = Infinity, mny = Infinity, mnz = Infinity;
            let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
            for (const m of this.parts) {
                m.computeWorldMatrix(true);
                const bb = m.getBoundingInfo().boundingBox;
                mnx = Math.min(mnx, bb.minimumWorld.x); mxx = Math.max(mxx, bb.maximumWorld.x);
                mny = Math.min(mny, bb.minimumWorld.y); mxy = Math.max(mxy, bb.maximumWorld.y);
                mnz = Math.min(mnz, bb.minimumWorld.z); mxz = Math.max(mxz, bb.maximumWorld.z);
            }
            return { mnx, mny, mnz, mxx, mxy, mxz };
        }

        dispose() {
            for (const m of this.parts) m.dispose();
            if (this.root) this.root.dispose();
            this.parts.length = 0;
        }
    }

    // =================================================================
    // 7. Plate （玉縁の皿）
    // =================================================================
    // 【対策】物理の当たり判定に薄い一枚板を使うと、落下速度によっては
    //         すり抜ける。表と裏を張って縁で閉じた「厚みのある器」に
    //         しておけば、静的トライメッシュでも安定して受け止められる
    function buildPlate(scene, cfg) {
        const M = cfg.plateSegments, K = cfg.plateRings;
        const TH = cfg.plateThick, RIM = cfg.plateRim, WELL = cfg.plateWell;
        const LIP = cfg.plateLip;
        const wellS = WELL / RIM;

        const prof = (s) => {
            const r = RIM * s;
            // 平らな見込み → 立ち上がり → 平たい縁 → 最後にわずかに反る
            const y = LIP * smooth(wellS, wellS + 0.30, s) * 0.88
                + LIP * 0.12 * smooth(0.92, 1.0, s);
            return [r, y];
        };
        const pn = (s) => {
            const e = 2e-3;
            const a = prof(Math.max(0, s - e)), b = prof(Math.min(1, s + e));
            const dr = b[0] - a[0], dy = b[1] - a[1];
            const l = Math.hypot(dr, dy) || 1;
            return [-dy / l, dr / l];
        };

        const W = M + 1, LAY = (K + 1) * W, total = LAY * 2;
        const positions = new Float32Array(total * 3);
        const uvs = new Float32Array(total * 2);
        for (let i = 0; i <= K; i++) {
            const s = i / K, pr = prof(s), nn = pn(s);
            const r0 = pr[0], y0 = pr[1], nr = nn[0], ny = nn[1];
            // 玉縁：外周だけ細かい波を刻む
            const beadK = smooth(0.90, 1.0, s);
            for (let j = 0; j <= M; j++) {
                const phi = (j % M) / M * TAU;
                const cs = Math.cos(phi), sn = Math.sin(phi);
                const bead = cfg.plateBeadAmp * beadK
                    * (0.5 + 0.5 * Math.cos(cfg.plateBeads * phi));
                const r = r0 + bead, y = y0 + bead * 0.35;
                const a = i * W + j, b = LAY + a;
                positions[a * 3] = r * cs; positions[a * 3 + 1] = y; positions[a * 3 + 2] = r * sn;
                const ro = r - nr * TH, yo = y - ny * TH;
                positions[b * 3] = ro * cs; positions[b * 3 + 1] = yo; positions[b * 3 + 2] = ro * sn;
                uvs[a * 2] = j / M; uvs[a * 2 + 1] = s;
                uvs[b * 2] = j / M; uvs[b * 2 + 1] = s;
            }
        }
        const indices = [];
        for (let i = 0; i < K; i++) for (let j = 0; j < M; j++) {
            const A = i * W + j, B = A + 1, C = A + W, D = C + 1;
            indices.push(A, C, B, B, C, D);
            indices.push(LAY + A, LAY + B, LAY + C, LAY + B, LAY + D, LAY + C);
        }
        for (let j = 0; j < M; j++) {
            const o0 = K * W + j, o1 = o0 + 1;
            indices.push(o0, LAY + o0, o1, o1, LAY + o0, LAY + o1);
        }
        const normals = finalize(positions, indices);
        weldNormals(positions, normals);
        const mesh = makeMesh("plate", positions, indices, normals, uvs, null, scene);
        // 【対策】この皿は「見込み y=0 から下へ厚み TH」で作ってあるので、
        //         そのまま置くと見込みが地面（y=0）と同一平面になり、
        //         底一面が Z ファイティングを起こす。裏が接するまで持ち上げる
        mesh.position.y = TH;

        const m = new BABYLON.PBRMaterial("plateMat", scene);
        // 淡い青磁。彩度を上げるとクッキーの補色になって主役を食う
        m.albedoColor = sRGB([0.735, 0.795, 0.782]);
        m.metallic = 0.0;
        m.roughness = 0.42;
        m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
        // 【対策】陶器の艶は素地の反射ではなく「釉薬の層」。roughness を
        //         下げて出すと濡れた石になる。クリアコートで層として乗せる
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.85;
        m.clearCoat.roughness = 0.075;
        m.backFaceCulling = false;
        m.twoSidedLighting = true;
        mesh.material = m;
        mesh.receiveShadows = true;
        return mesh;
    }

    // =================================================================
    // 8. Scene
    // =================================================================
    function typeConfig(typeKey) {
        const cfg = Object.assign({}, GLOBAL, TYPES[typeKey]);
        cfg.type = typeKey;
        // 【対策】テクスチャは種類単位でキャッシュするので、その種は
        //         個体乱数から切り離して種類名から決める
        let h = 2166136261;
        for (let i = 0; i < typeKey.length; i++) {
            h ^= typeKey.charCodeAt(i); h = Math.imul(h, 16777619);
        }
        cfg.texSeed = (h >>> 0) % 100000;
        const vw = (typeof window !== "undefined" && window.innerWidth) || 1024;
        if (vw < GLOBAL.compactWidth) cfg.textureSize = 448;
        return cfg;
    }

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.90, 0.885, 0.870, 1);

    let physics = false;
    try {
        const havok = await HavokPhysics();
        // 【対策】HavokPlugin の第1引数は _useDeltaForWorldStep。true（既定）だと
        //         フレームのデルタでそのまま積分するため、フレーム落ちのたびに
        //         ステップ幅が変わり、接触が解けたり深く食い込んだりで震える
        const hk = new BABYLON.HavokPlugin(false, havok);
        scene.enablePhysics(new V3(0, -GLOBAL.gravity, 0), hk);
        if (hk.setTimeStep) hk.setTimeStep(1 / GLOBAL.physicsHz);
        physics = true;
    } catch (err) {
        console.warn("[Cookie] Havok を初期化できませんでした。物理なしで並べます。", err);
    }

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.65;
    scene.environmentIntensity = 0.80;

    const camera = new BABYLON.ArcRotateCamera("cam", -1.18, 1.04, 44, new V3(0, 1.6, 0), scene);
    camera.attachControl(true);
    camera.fov = 0.56;
    camera.wheelPrecision = 8;
    // 【対策】ポストプロセスを有効にするとシーンは 16bit 深度の RT へ描かれる。
    //         minZ を 0.1 のままにすると分解能が mm 台になり、重なった
    //         クッキーの接触面が互いに勝ったり負けたりする
    camera.minZ = 5;
    camera.maxZ = 280;
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 130;
    camera.lowerBetaLimit = 0.05;
    camera.upperBetaLimit = 1.50;
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.42, -0.88, 0.58).normalize(), scene);
    key.position = new V3(18, 32, -20);
    key.intensity = 2.45;
    key.diffuse = new BABYLON.Color3(1.0, 0.982, 0.948);
    key.specular = new BABYLON.Color3(0.50, 0.48, 0.45);
    key.autoCalcShadowZBounds = true;

    const fillL = new BABYLON.DirectionalLight("fillL", new V3(0.88, -0.34, -0.52).normalize(), scene);
    fillL.intensity = 1.00;
    fillL.diffuse = new BABYLON.Color3(1.0, 0.968, 0.935);
    fillL.specular = new BABYLON.Color3(0.14, 0.135, 0.125);

    // 【対策】重なったクッキーの下は真っ暗になる。クロスからの弱い返しが
    //         無いと、下敷きになった1枚が黒い板に見える
    const bounce = new BABYLON.DirectionalLight("bounce", new V3(0.1, 1.0, 0.25).normalize(), scene);
    bounce.intensity = 0.36;
    bounce.diffuse = new BABYLON.Color3(0.98, 0.955, 0.915);
    bounce.specular = new BABYLON.Color3(0, 0, 0);

    const amb = new BABYLON.HemisphericLight("amb", new V3(0, 1, 0), scene);
    amb.intensity = 0.44;
    amb.diffuse = new BABYLON.Color3(1, 1, 1);
    amb.groundColor = new BABYLON.Color3(0.78, 0.75, 0.72);
    amb.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.useBlurExponentialShadowMap = true;
    sg.blurKernel = 32;
    sg.depthScale = 36;
    sg.darkness = 0.42;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.10;
    ip.contrast = 1.08;
    ip.vignetteEnabled = false;

    let ground = null;
    if (GLOBAL.showGround) {
        // 【対策】厚みゼロの床は当たり判定に使えない（すり抜ける）ので箱にする
        ground = BABYLON.MeshBuilder.CreateBox("ground",
            { width: 220, height: 2, depth: 220 }, scene);
        const gm = new BABYLON.PBRMaterial("groundMat", scene);
        gm.albedoTexture = TextureLab.linen(scene, 1024, 3131);
        gm.albedoTexture.uScale = 2.6; gm.albedoTexture.vScale = 2.6;
        gm.albedoTexture.anisotropicFilteringLevel = 8;
        gm.metallic = 0.0; gm.roughness = 0.92;
        gm.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
        // 布は sheen が要る。無いと紙になる
        gm.sheen.isEnabled = true;
        gm.sheen.intensity = 0.30;
        gm.sheen.roughness = 0.85;
        gm.sheen.color = new BABYLON.Color3(0.85, 0.82, 0.78);
        ground.material = gm;
        ground.receiveShadows = true;
        ground.position.y = -1.0;
        if (physics) {
            new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX,
                { mass: 0, friction: 0.80, restitution: 0.01 }, scene);
        }
    }

    const plate = buildPlate(scene, GLOBAL);
    if (physics) {
        const pShape = new BABYLON.PhysicsShapeMesh(plate, scene);
        pShape.material = { friction: 0.88, restitution: 0.0 };
        const pBody = new BABYLON.PhysicsBody(plate, BABYLON.PhysicsMotionType.STATIC, false, scene);
        pBody.shape = pShape;
    }

    // =================================================================
    //  生成と投入
    // =================================================================
    let items = [], curMode = START_MODE, curSeed = START_SEED, curCfg = null;
    const skinCache = {};
    let onRebuilt = null;
    let queue = [], dropIndex = 0, dropTimer = 0, settleTimer = 0, postDropTimer = 0, frozen = false;

    function plateInnerY(r) {
        const s = clamp(r / GLOBAL.plateRim, 0, 1);
        const wellS = GLOBAL.plateWell / GLOBAL.plateRim;
        return GLOBAL.plateThick
            + GLOBAL.plateLip * smooth(wellS, wellS + 0.30, s) * 0.88
            + GLOBAL.plateLip * 0.12 * smooth(0.92, 1.0, s);
    }

    // 【対策】山全体の頂点を基準にすると、外側へ置く物まで山の高さぶん
    //         持ち上げられ、皿の縁の上から落ちてくることになる。
    //         水平方向に重なっている物だけを見る
    function localTopY(x, z, rh) {
        let top = plateInnerY(Math.hypot(x, z));
        for (let i = 0; i < dropIndex; i++) {
            const b = queue[i].e.worldBounds();
            const cx = (b.mnx + b.mxx) * 0.5, cz = (b.mnz + b.mxz) * 0.5;
            const ex = (b.mxx - b.mnx) * 0.5, ez = (b.mxz - b.mnz) * 0.5;
            if (Math.hypot(x - cx, z - cz) < rh + Math.max(ex, ez)) top = Math.max(top, b.mxy);
        }
        return top;
    }

    function clearBodies() {
        for (const it of queue) {
            if (it.body) it.body.dispose();
            if (it.shape) {
                const ch = it.shape._childShapes;
                it.shape.dispose();
                if (ch) for (const c of ch) { try { c.dispose(); } catch (e) { } }
            }
        }
        queue = []; dropIndex = 0; dropTimer = 0;
        settleTimer = 0; postDropTimer = 0; frozen = false;
    }

    // 【対策】全部を同時に生成すると、初期状態で互いにめり込んでいるぶんの
    //         反発が一気に解放されて弾け飛ぶ。1枚ずつ、山の頂点のすぐ上から放す
    function spawnNext() {
        const it = queue[dropIndex], e = it.e;
        e.root.setEnabled(true);
        e.root.position.set(it.x, 0, it.z);
        e.root.computeWorldMatrix(true);
        const b = e.worldBounds();
        const bottomOffset = b.mny;
        const rh = Math.max(b.mxx - b.mnx, b.mxz - b.mnz) * 0.5;
        e.root.position.y = localTopY(it.x, it.z, rh) + GLOBAL.dropClearance - bottomOffset;
        e.root.computeWorldMatrix(true);

        const shape = e.hullShape();
        shape.material = { friction: GLOBAL.friction, restitution: GLOBAL.restitution };
        const body = new BABYLON.PhysicsBody(e.root, BABYLON.PhysicsMotionType.DYNAMIC, false, scene);
        body.shape = shape;
        body.setMassProperties({ mass: GLOBAL.pieceMass });
        // 【対策】damping は PhysicsAggregate のオプションに書いても効かない
        body.setLinearDamping(GLOBAL.linearDamping);
        body.setAngularDamping(GLOBAL.angularDamping);
        // 【対策】毎フレーム「ノードの姿勢 → 物理ボディ」へ書き戻すと、
        //         物理が出した結果を読み直して押し込む往復が起きる
        body.disablePreStep = true;
        it.shape = shape; it.body = body;
        dropIndex++;
    }

    function resetDrop(seed) {
        clearBodies();
        const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
        const a0 = rng.range(0, TAU);
        for (let i = 0; i < items.length; i++) {
            const e = items[i];
            // 【対策】物理で動かすノードは rotationQuaternion を使う。
            //         Euler の rotation のままだと Havok 側の姿勢と食い違う
            // 【対策】クッキーは平たいので、伏せるか仰向けるかの2択に落ち着く。
            //         全部を表向きで放すと「盛った」ではなく「並べた」になる。
            //         4枚に1枚は最初から裏返して放し、底の焼き色を見せる
            const flip = (e.cfg.shape === "piped") ? 0 : (i % 4 === 2 ? Math.PI : 0);
            e.root.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
                flip + rng.gauss(0, 0.30), rng.range(0, TAU), rng.gauss(0, 0.30));
            const r = GLOBAL.plateWell * 0.62 * Math.sqrt(rng.next());
            const a = a0 + i * 2.39996;                 // 黄金角
            queue.push({ e, x: Math.cos(a) * r, z: Math.sin(a) * r, body: null, shape: null });
            if (physics) e.root.setEnabled(false);
        }
        if (physics) {
            dropTimer = GLOBAL.dropInterval;
        } else {
            const cols = Math.ceil(Math.sqrt(items.length));
            for (let i = 0; i < items.length; i++) {
                const e = items[i], d = e.span * 1.12;
                e.root.rotationQuaternion = BABYLON.Quaternion.Identity();
                e.root.position.set(
                    ((i % cols) - (cols - 1) / 2) * d,
                    GLOBAL.plateThick,
                    (Math.floor(i / cols) - (cols - 1) / 2) * d);
            }
        }
        if (onRebuilt) onRebuilt();
    }

    function skinFor(typeKey) {
        let s = skinCache[typeKey];
        if (!s) {
            const cfg = typeConfig(typeKey);
            s = { skin: new Skin(scene, cfg), cfg };
            skinCache[typeKey] = s;
        }
        return s;
    }

    function build(modeKey, seed) {
        clearBodies();
        for (const it of items) it.dispose();
        items = [];
        const rng = new Rng((seed * 2654435761) >>> 0);

        // 種類の割り当て
        const plan = [];
        if (modeKey === "assort") {
            const total = Math.round(GLOBAL.count * 1.25);
            for (let i = 0; i < total; i++) plan.push(ASSORT[i % ASSORT.length]);
            // 同じ種類が隣り合わないよう軽く混ぜる
            for (let i = plan.length - 1; i > 0; i--) {
                const j = rng.int(i + 1);
                const t = plan[i]; plan[i] = plan[j]; plan[j] = t;
            }
        } else {
            const cfg0 = typeConfig(modeKey);
            const total = Math.max(1, Math.round(GLOBAL.count * cfg0.countScale));
            for (let i = 0; i < total; i++) plan.push(modeKey);
        }

        for (let i = 0; i < plan.length; i++) {
            const s = skinFor(plan[i]);
            const e = new Cookie(scene, s.cfg, (seed + i * 7919) >>> 0, s.skin);
            e.attach();
            items.push(e);
        }
        curCfg = items.length ? items[0].cfg : null;

        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        for (const e of items) for (const m of e.parts) sg.addShadowCaster(m, true);
        sg.addShadowCaster(plate, true);

        camera.target.set(0, GLOBAL.plateLip * 0.5, 0);
        camera.radius = GLOBAL.plateRim * 3.0;

        resetDrop(seed);
        console.log("[Cookie]", BUILD, "/", modeKey, "/ seed =", seed >>> 0, "/", items.length, "枚");
    }

    build(START_MODE, START_SEED);

    scene.onBeforeRenderObservable.add(() => {
        if (!physics || frozen || queue.length === 0) return;
        const dt = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
        if (dropIndex < queue.length) {
            dropTimer += dt;
            if (dropTimer >= GLOBAL.dropInterval) {
                dropTimer = 0; spawnNext();
                if (onRebuilt) onRebuilt();
            }
            return;
        }
        if (!GLOBAL.freezeWhenSettled) return;
        postDropTimer += dt;
        // 【対策】静止後もソルバの残差で微振動が続く。速度がしきい値を
        //         下回った状態が続いたら STATIC に固定して止める
        let moving = false;
        for (const it of queue) {
            if (!it.body) continue;
            if (it.body.getLinearVelocity().length() > GLOBAL.settleSpeed ||
                it.body.getAngularVelocity().length() > GLOBAL.settleSpin) { moving = true; break; }
        }
        settleTimer = moving ? 0 : settleTimer + dt;
        if (settleTimer > GLOBAL.settleHold || postDropTimer > GLOBAL.settleTimeout) {
            for (const it of queue) if (it.body) it.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
            frozen = true;
            if (onRebuilt) onRebuilt();
        }
    });

    if (GLOBAL.useSSAO) {
        // 【対策】重なったクッキーの接触部に影が入らないと、全部が同じ平面に
        //         貼りついて見える。割れ目やピケ穴の陰りもここが効く
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.8, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.60;
        ssao.totalStrength = 1.00;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 180;
        ssao.minZAspect = 0.22;
    }

    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.95;
    dp.bloomWeight = 0.045;
    dp.bloomKernel = 36;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.22;
    // 【対策】Babylon の錯乱円は「シーン単位 × 1000 = mm」で計算される。
    //         focalLength を focusDistance の一定比率 K にすると focus が
    //         約分され、cocPre = (lensSize / fStop) * K / (1 - K) となって
    //         カメラを寄せても引いてもボケ量が変わらない
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
    // 9. GUI
    // =================================================================
    // 【対策】フルスクリーンGUIは既定でシーンと同じカメラで合成されるため、
    //         Bloom / 被写界深度 / シャープンがUIにも乗ってボケる。
    //         GUI専用カメラを layerMask で分離する
    // 【対策】ただし activeCameras を 2 台にすると、Babylon の各機能が
    //   「activeCameras の末尾＝描画の基準カメラ」と見なす所で全部 guiCam を
    //   拾ってしまい、Inspector のデバッグ機能が 3 系統まとめて壊れる。
    //     ・UtilityLayerRenderer → Physics Helper が何も出ない／ギズモがずれる
    //     ・EffectLayer          → 選択ハイライトが全カメラパスで合成される
    //     ・scene.activeCamera   → scene.pick() のレイが guiCam 基準になり、
    //                              Scene Explorer の Picker が当たらない
    //   分離をやめれば直るが UI がボケるので、基準カメラを明示して直す
    const GUI_MASK = 0x20000000;

    function bindDebugCamera(scene, mainCam) {
        // (1) UtilityLayerRenderer（Physics Helper / ギズモ / 選択枠の土台）
        // 【対策】Inspector が内部の WeakMap に抱えていて外から触れないレイヤーも
        //   あるので、インスタンスを追わずプロトタイプごと差し替える。
        //   個別に直すと必ず取りこぼす
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
        // 【対策】layerMask では止まらない。camera を束縛するしかないが、
        //   Inspector は選択のたびに後から足してくるので、未束縛のものだけを
        //   毎フレーム拾う（通常 0〜1 枚なので費用はほぼ 0）
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

        // (3) scene.activeCamera
        // 【対策】描き終えた時点では guiCam が入ったままになる。Picker が呼ぶ
        //   scene.pick() は camera 引数なしなので、ここを毎フレーム戻す。
        //   cameraToUseForPointers は InputManager が通る経路にしか効かない
        scene.onAfterRenderObservable.add(() => {
            if (scene.activeCamera !== mainCam) scene.activeCamera = mainCam;
        });
    }

    let guiCam = null;
    if (GLOBAL.guiOwnCamera) {
        guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene);
        guiCam.layerMask = GUI_MASK;
        scene.activeCameras = [camera, guiCam];
        bindDebugCamera(scene, camera);
    } else {
        // 分離しない：Inspector は素のまま正しく動くが、UI に Bloom / DOF が乗る
        scene.activeCameras = [camera];
    }
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (ui.layer && GLOBAL.guiOwnCamera) ui.layer.layerMask = GUI_MASK;

    const COL = {
        idle: "#2b2018", active: "#9a6a34", edge: "#4d3c2c",
        text: "#f7efe3", sub: "#c8ae8d", accent: "#e6b273"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "252px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(22,15,10,0.82)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "62px";
    ui.addControl(card);

    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "220px"; panel.isVertical = true;
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
        b.height = "30px"; b.paddingBottom = "5px";
        b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 13;
        b.onPointerUpObservable.add(onClick);
        panel.addControl(b);
        return b;
    }

    addLabel("COOKIES", 11, COL.sub, "18px");
    addLabel("種類", 13, COL.accent, "22px");

    const modeBtns = {}, countBtns = {};
    function highlight() {
        for (const k in modeBtns) modeBtns[k].background = (k === curMode) ? COL.active : COL.idle;
        for (const k in countBtns) countBtns[k].background = (+k === GLOBAL.count) ? COL.active : COL.idle;
    }
    modeBtns["assort"] = addButton("m_assort", "詰め合わせ", () => {
        curMode = "assort"; build(curMode, curSeed); highlight();
    });
    for (const k of Object.keys(TYPES)) {
        modeBtns[k] = addButton("m_" + k, TYPES[k].label, () => {
            curMode = k; build(curMode, curSeed); highlight();
        });
    }

    addLabel("盛る量", 13, COL.accent, "26px");
    for (const c of [5, 9, 14]) {
        countBtns[c] = addButton("c" + c, ["少なめ", "ふつう", "多め"][[5, 9, 14].indexOf(c)], () => {
            GLOBAL.count = c; build(curMode, curSeed); highlight();
        });
    }

    const sp = new BABYLON.GUI.Rectangle();
    sp.height = "8px"; sp.thickness = 0; sp.background = "";
    panel.addControl(sp);

    addButton("drop", "盛り直す", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        resetDrop(curSeed);
    });
    addButton("reseed", "別の個体を焼く", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(curMode, curSeed); highlight();
    });
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        GLOBAL.useDOF = !GLOBAL.useDOF;
        dp.depthOfFieldEnabled = GLOBAL.useDOF;
        dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
        dofBtn.textBlock.text = "被写界深度: " + (GLOBAL.useDOF ? "ON" : "OFF");
    });
    const rotateBtn = addButton("rotate", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.08;
        rotateBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotateBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });

    const info = addLabel("", 12, COL.sub, "44px");
    onRebuilt = () => {
        if (!info) return;
        const e = items[0];
        if (!e) { info.text = ""; return; }
        const state = !physics ? "物理なし"
            : (dropIndex < queue.length ? "投入中 " + dropIndex + "/" + queue.length
                : (frozen ? "静止" : "落下中"));
        const kinds = new Set(items.map(x => x.cfg.label));
        const what = curMode === "assort" ? kinds.size + "種" : (curCfg ? curCfg.label : "");
        info.text = state + " / " + items.length + "枚 / " + what + "\n"
            + "径 " + e.span.toFixed(1) + "cm 厚 " + e.TH.toFixed(2) + "cm  seed: " + curSeed;
    };
    onRebuilt();

    // ---- GUI の開閉（スマホでは初期状態で畳む）-----------------------
    // 【対策】Babylon.GUI のサイズ指定はレンダー解像度基準（≒ CSS px × DPR）。
    //         DPR 3 の端末では 30px のボタンが実質 10 CSS px になる。
    //         畳むだけでなく、開いたときは実効DPRぶん拡大して押せる大きさに戻す
    function viewportCss() {
        const c = engine.getRenderingCanvas();
        return {
            w: (c && c.clientWidth) || window.innerWidth || 1024,
            h: (c && c.clientHeight) || window.innerHeight || 768
        };
    }
    function isCompact() {
        const v = viewportCss();
        return v.w < GLOBAL.compactWidth || Math.min(v.w, v.h) < GLOBAL.compactMinSide;
    }

    const toggleBtn = BABYLON.GUI.Button.CreateSimpleButton("guiToggle", "\u2261");
    toggleBtn.width = "38px"; toggleBtn.height = "38px";
    toggleBtn.cornerRadius = 10; toggleBtn.thickness = 1;
    toggleBtn.color = COL.edge;
    toggleBtn.background = "rgba(22,15,10,0.82)";
    toggleBtn.fontSize = 20;
    if (toggleBtn.textBlock) toggleBtn.textBlock.color = COL.text;
    toggleBtn.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    toggleBtn.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    toggleBtn.left = "16px"; toggleBtn.top = "16px";
    ui.addControl(toggleBtn);

    let panelOpen = !isCompact();
    function applyGuiLayout() {
        // scaleX/Y は既定で中心基準。transformCenter を左上にしないと画面外へずれる
        const scale = isCompact()
            ? clamp(engine.getRenderWidth() / Math.max(1, viewportCss().w), 1, GLOBAL.guiMaxScale)
            : 1;
        for (const c of [toggleBtn, card]) {
            c.transformCenterX = 0; c.transformCenterY = 0;
            c.scaleX = scale; c.scaleY = scale;
        }
        card.top = (16 + 38 * scale + 8) + "px";
        card.isVisible = panelOpen;
        if (toggleBtn.textBlock) toggleBtn.textBlock.text = panelOpen ? "\u00d7" : "\u2261";
        toggleBtn.background = panelOpen ? COL.active : "rgba(22,15,10,0.82)";
    }
    toggleBtn.onPointerUpObservable.add(() => { panelOpen = !panelOpen; applyGuiLayout(); });
    engine.onResizeObservable.add(applyGuiLayout);

    highlight();
    applyGuiLayout();

    return scene;
};

export default createScene;