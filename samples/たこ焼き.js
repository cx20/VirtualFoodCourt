// =====================================================================
//  Photoreal Takoyaki  /  写実的なたこ焼き      BUILD: tako-G
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  tako-F からの修正（Inspector のデバッグ表示）:
//    ・GUI 専用カメラ（layerMask 分離）の副作用で、Playground の Inspector の
//      デバッグ機能が壊れていた問題を修復。activeCameras を 2 台にすると、
//      Babylon の各機能が「activeCameras の末尾＝描画の基準カメラ」と
//      見なす所で全部 guiCam を拾ってしまう:
//        ・UtilityLayerRenderer → Physics Helper が何も出ない／ギズモがずれる
//        ・EffectLayer          → 選択ハイライトが全カメラパスで合成される
//        ・scene.activeCamera   → scene.pick() のレイが guiCam 基準になり、
//                                 Scene Explorer の Picker が当たらない
//      基準カメラを明示して 3 系統とも直した（「GUI」の bindDebugCamera）。
//      合わせて、版の表記がヘッダと BUILD 定数で食い違っていたのを一本化
//
//  構成:
//    0. CONFIG      … プリセット（定番 / 全部のせ / 焦がし / 塩）と舟皿
//    1. Rng         … シード付き擬似乱数
//    2. Noise       … 3D値ノイズ / 2D周期ノイズ
//    3. Mesh utils  … 巻き順の自動判定・法線の溶接・掃引
//    4. Fields      … 球面方向の場 / 焼き色 / ソースの垂れの輪郭
//    5. TextureLab  … 生地・ソース・木のアルベド / ORM / 法線
//    6. Pattern     … 形状 + テクスチャ（4種のアトラス）
//    7. Takoyaki    … 生地玉 + ソース + 青のり + マヨ + かつお節
//    8. Tray        … 経木の舟皿 + 板の間 / 配置の緩和
//    9. Scene / GUI
//
//  これまでの野菜・果物との決定的な違い（ここを外すとミートボールになる）:
//
//    ・「球」ではない。半球の型に流して竹串で回すので、
//      下半分は型の写しでほぼ正確な半球、上半分は生地を折り込んだ
//      不定形になる。全体を等方に歪ませた瞬間に肉団子になる
//
//    ・焼き色は幾何と相関する。鉄板に当たった凸部が濃く、
//      折り込みの溝とくぼみが淡い。無相関のノイズを乗せると
//      「焼けた球」ではなく「汚れた球」に見える
//
//    ・ソースは絵ではなく実体。垂れの輪郭・縁の厚み・たまりの膨らみが
//      シルエットに出て初めてソースになる。アルベドに茶色を描くと、
//      ハイライトが玉全体で一様のままなので印刷したように見える
//
//    ・そのソースの艶にはムラが要る。均一な鏡面はプラスチックの成型品。
//      乾きかけた縁はざらつき、たまりだけが鏡になる
//
//    ・青のりは板ポリゴンで置く。テクスチャに緑の点を描いても、
//      1mm の粒はミップマップで溶けて「緑がかった靄」になる。
//      粉を「ふりかけた」ように見せられるのは実体のかけらだけ
//
//    ・物理で落とさない。ほぼ球なので転がってソースが横を向く。
//      舟皿への詰め方は決定論的な緩和（重なり解消 + 高さ場への着地）で
//      作り、傾きは 15°までに抑える。他の野菜と違い、
//      この食べ物は「上下」が意味を持つ
//
//  テクスチャと形状の対応について:
//    焼き色は幾何と相関させたいので、形状パラメータもテクスチャと同じ
//    「柄」の種から決める。4柄を 2x2 のアトラスに焼き、8個には
//    大きさ・向き・傾きで個体差を付ける。全個体ぶんのテクスチャを
//    焼くと 1024² x 3枚 x 8 で数十秒かかる
//
//  法線マップについて（きゅうり版・ジャガイモ版と同じ落とし穴）:
//    高さ場から法線を焼くとき、v 方向は (hd - hu)。(hu - hd) は
//    「V が上を向く」OpenGL 系の規約で、Babylon の接空間は V が下向き
// =====================================================================

var createScene = async function () {
    // =================================================================
    // 0. CONFIG （単位は cm）
    // =================================================================
    const PRESETS = {
        teiban: {
            label: "定番（ソース・青のり）",
            // 生地玉
            radius: 2.15,               // 直径 4.3cm。市販の型は 4.0〜4.5cm
            squash: 0.94,               // 上下がわずかに詰まる
            // 【対策】上半分の歪みと溝を強く取ると、丸みが失われて
            //         シュークリームやパン・オ・ショコラの形になる。
            //         実物のたこ焼きは「わずかに崩れた球」でしかない
            lumpBase: 0.014,            // 下半分（型の写し）の歪み
            lumpTop: 0.048,             // 上半分（折り込み側）の歪み
            lumpFine: 0.013,
            f1: 2.6, f2: 5.2,
            ringAmp: 0.014,             // 型の縁でできる継ぎ目のリング
            creaseAmp: 0.038,           // 折り込みの溝
            dimple: 0.024,              // 串で押したくぼみ
            flatBottom: 0.030,

            // 焼き色（sRGB）
            doneness: 1.12,             // 1.0 で標準。大きいほど濃い
            crustPale: [0.902, 0.792, 0.545],   // 焼けの浅い生地
            crustGold: [0.808, 0.565, 0.243],   // きつね色
            crustBrown: [0.588, 0.345, 0.129],  // 濃い焼き目
            crustChar: [0.310, 0.161, 0.063],   // 焦げ
            crustWet: [0.945, 0.855, 0.620],    // 油でぬれて明るい高台
            crustRough: 0.56,
            oil: 0.55,                  // 油の照り

            // ソース
            sauce: true,
            sauceY: 0.44,               // 覆う下端（dir.y）。小さいほど深くかかる
            dripAmp: 0.52,              // 垂れの長さ
            dripPeriod: 9,              // 一周の垂れの本数
            sauceThick: 0.032,          // 最大の厚み cm（＝0.32mm。膜であって殻ではない）
            sauceLip: 0.013,            // 縁の立ち上がり cm
            saucePool: [0.345, 0.145, 0.055],   // 光学的に厚いたまりの色
            sauceExt: [1.5, 3.2, 5.4],          // 単位厚みあたりの吸収（RGB）
            sauceGloss: 0.60,

            // 薬味
            aonori: 260, aonoriSize: 0.070,
            mayo: false, katsuo: 0
        },
        zenbu: {
            label: "全部のせ",
            radius: 2.18, squash: 0.94,
            lumpBase: 0.014, lumpTop: 0.050, lumpFine: 0.014,
            f1: 2.5, f2: 5.0,
            ringAmp: 0.015, creaseAmp: 0.040, dimple: 0.025, flatBottom: 0.030,
            doneness: 1.08,
            crustPale: [0.902, 0.792, 0.545], crustGold: [0.808, 0.565, 0.243],
            crustBrown: [0.588, 0.345, 0.129], crustChar: [0.310, 0.161, 0.063],
            crustWet: [0.945, 0.855, 0.620],
            crustRough: 0.56, oil: 0.55,
            sauce: true,
            sauceY: 0.38, dripAmp: 0.58, dripPeriod: 8,
            sauceThick: 0.036, sauceLip: 0.014,
            saucePool: [0.345, 0.145, 0.055], sauceExt: [1.7, 3.5, 5.8],
            sauceGloss: 0.62,
            aonori: 220, aonoriSize: 0.070,
            mayo: true, katsuo: 5
        },
        kogashi: {
            label: "焦がし（カリッと濃いめ）",
            radius: 2.10, squash: 0.92,
            lumpBase: 0.017, lumpTop: 0.058, lumpFine: 0.018,
            f1: 2.7, f2: 5.6,
            ringAmp: 0.019, creaseAmp: 0.046, dimple: 0.027, flatBottom: 0.034,
            doneness: 1.42,
            crustPale: [0.855, 0.710, 0.455], crustGold: [0.737, 0.463, 0.184],
            crustBrown: [0.494, 0.267, 0.094], crustChar: [0.235, 0.118, 0.047],
            crustWet: [0.910, 0.780, 0.520],
            crustRough: 0.50, oil: 0.66,
            sauce: true,
            sauceY: 0.48, dripAmp: 0.42, dripPeriod: 10,
            sauceThick: 0.028, sauceLip: 0.012,
            saucePool: [0.298, 0.118, 0.045], sauceExt: [1.9, 3.9, 6.2],
            sauceGloss: 0.56,
            aonori: 190, aonoriSize: 0.068,
            mayo: false, katsuo: 0
        },
        shio: {
            label: "塩（ソースなし）",
            radius: 2.16, squash: 0.95,
            lumpBase: 0.013, lumpTop: 0.046, lumpFine: 0.012,
            f1: 2.6, f2: 5.2,
            ringAmp: 0.013, creaseAmp: 0.036, dimple: 0.023, flatBottom: 0.028,
            doneness: 0.96,
            crustPale: [0.918, 0.816, 0.580], crustGold: [0.827, 0.596, 0.275],
            crustBrown: [0.608, 0.365, 0.145], crustChar: [0.337, 0.180, 0.075],
            crustWet: [0.957, 0.878, 0.655],
            crustRough: 0.60, oil: 0.48,
            sauce: false,
            sauceY: 0.30, dripAmp: 0.56, dripPeriod: 9,
            sauceThick: 0.032, sauceLip: 0.013,
            saucePool: [0.345, 0.145, 0.055], sauceExt: [1.5, 3.2, 5.4],
            sauceGloss: 0.60,
            aonori: 110, aonoriSize: 0.066,
            mayo: false, katsuo: 0
        }
    };

    const GLOBAL = {
        count: 8,

        // 生地玉のメッシュ
        segRing: 96,                    // 極から極
        segRound: 112,                  // 周方向
        sauceRings: 40,

        // 舟皿（経木）
        trayA: 10.2,                    // 縁の半長（X）
        trayB: 6.4,                     // 縁の半幅（Z）
        trayExp: 3.4,                   // 角の丸み。2=楕円 / 大きいほど角ばる
        trayHSide: 2.35,                // 縁の高さ（側面）
        trayHEnd: 3.90,                 // 縁の高さ（舳先。ここが高いと舟に見える）
        trayFlat: 0.54,                 // 平らな底の割合
        trayThick: 0.13,
        traySegs: 160, trayRings: 40,

        // 詰め方（決定論的な緩和）
        packIter: 260,
        packTilt: 0.26,                 // 傾きの上限（rad）約 15°

        // 大きさのばらつき
        // 【対策】同じ鉄板で焼いたものは、直径を型のくぼみが決めてしまう。
        //         個体差が出るのは生地の入れ方ぶんの数％だけで、
        //         野菜のように 2 割も振ると「別の鍋で焼いたもの」に見える。
        //         柄ごと（＝形ごと）と個体ごとの2段で効くので、
        //         合計が ±5% を超えないよう両方を小さく取る
        sizeVar: 0.020,                 // 柄ごと（4種の形の大小）
        scaleVar: 0.022,                // 個体ごと
        packPitch: 0.86,                // 初期配置の間隔（直径に対する比。1未満で少し重ねる）
        packSlide: 0.14,                // 上に乗った玉が横へ逃げる強さ
        packWallSlide: 0.10,            // 舟の斜面を下る強さ

        // 物理
        usePhysics: true,
        // 【対策】この場面の単位は cm。9.8 をそのまま入れると見かけの重力が
        //         1/100 になり、玉が水中のようにゆっくり漂って落ち着かない
        gravity: 590,
        // 【対策】実物の 22g をそのまま入れてはいけない。この場面の長さは cm
        //         なので、質量まで kg で入れると、ソルバが扱う量の桁が
        //         長さと質量で 4 桁ずれる。接触の反復が収束しきらず、
        //         12個のように段が重なった途端に細かく震え続ける。
        //         静止した配置しか要らないので、質量は 1 に正規化する
        //         （玉どうしの比が同じなら、積み方は変わらない）
        ballMass: 1.0,
        // 【対策】摩擦 0.95 は接触が「食いつく／滑る」を毎ステップ往復して
        //         振動の原因になる。濡れて止まりやすいことは減衰で表す
        ballFriction: 0.55,
        ballDamping: 0.90,
        settleSteps: 240,               // 表示前に進める最大ステップ数
        settleVel: 0.6,                 // これ以下（cm/s）になったら打ち切る
        // 【対策】静物なので、落ち着いたら剛体を捨てて完全に静止させる。
        //         剛体を残したままだと、接触が多い配置では
        //         プルプルとした微振動が原理的に止まらない
        // 【注】このため Inspector の Physics Helper には、既定では
        //       舟皿と板の間（静的）の形状しか出ない。玉の球形状も見たいときは
        //       false にすると剛体が残る（代わりに微振動する）
        freezeAfterSettle: true,

        // テクスチャ
        crustAtlas: 1024,               // 2x2 → 1柄あたり 512
        sauceAtlas: 512,                // 2x2 → 1柄あたり 256
        woodSize: 1024,
        trayTexSize: 512,
        patterns: 4,

        showTable: true,
        useSSAO: true,
        useDOF: true,
        dofRatio: 0.070,
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

    const START_PRESET = "teiban";
    const START_SEED = 20260805;
    // 【対策】ヘッダのコメントと定数で別々の版名を書いていたので、
    //         「どちらが本当の版か」が分からなくなっていた。文字列を一本化する
    const BUILD = "tako-G";

    const V3 = BABYLON.Vector3;
    const C3 = BABYLON.Color3;
    const TAU = Math.PI * 2;
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const srgb = (v) => Math.pow(clamp(v, 0, 1), 2.2);
    const unsrgb = (v) => Math.pow(clamp(v, 0, 1), 1 / 2.2);
    const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

    function buildConfig(key, seed) {
        const cfg = Object.assign({}, GLOBAL, PRESETS[key]);
        cfg.preset = key;
        cfg.seed = seed >>> 0;
        // 【対策】テクスチャは柄ごとに焼いてキャッシュするので、その種は
        //         プリセット名から決めて個体乱数から切り離す。
        //         個体の種で焼くと、GUI を触るたびに焼き直しで固まる
        let h = 2166136261;
        for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
        cfg.texSeed = (h >>> 0) % 100000;
        // 狭い画面ではアトラスを落とす。1024² の焼きは低速機で数秒かかる
        const vw = (typeof window !== "undefined" && window.innerWidth) || 1024;
        if (vw < GLOBAL.compactWidth) { cfg.crustAtlas = 512; cfg.segRing = 72; cfg.segRound = 88; }
        if (cfg.count > 10) { cfg.segRing = 80; cfg.segRound = 96; }
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
        gauss(m, sd) {
            const u = Math.max(1e-9, this.next()), v = this.next();
            return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
        }
        int(n) { return Math.floor(this.next() * n) % n; }
        pick(a) { return a[this.int(a.length)]; }
    }

    // =================================================================
    // 2. Noise
    // =================================================================
    const Noise = {
        _h3(x, y, z, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
                ^ Math.imul(z | 0, 1274126177) ^ Math.imul(seed | 0, 2166136261);
            h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
            return (h >>> 0) / 4294967295;
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
        },
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
        // x 方向だけ折り返す（一周してつながる）
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
        }
    };

    // =================================================================
    // 3. Mesh utils
    // =================================================================
    function finalize(positions, indices, center, refIndex) {
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        const k = refIndex * 3;
        const dot = normals[k] * (positions[k] - center.x)
            + normals[k + 1] * (positions[k + 1] - center.y)
            + normals[k + 2] * (positions[k + 2] - center.z);
        if (dot < 0) {
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
        // 【対策】頂点カラーを stride 4 で入れると Geometry._applyToMesh が
        //         hasVertexAlpha を立て、不透明のはずのメッシュが透明パスへ
        //         回されて描画順が崩れる。明示的に下ろす
        mesh.hasVertexAlpha = false;
        return mesh;
    }

    // リング列の掃引。両端はキャップで閉じる（生地玉・舟皿で使う）
    function sweep(name, rings, centers, uvFn, scene) {
        const N = rings.length, M = rings[0].length;
        const total = N * M + 2;
        const positions = new Float32Array(total * 3);
        const uvs = new Float32Array(total * 2);
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < M; j++) {
                const k = i * M + j, p = rings[i][j];
                positions[k * 3] = p.x; positions[k * 3 + 1] = p.y; positions[k * 3 + 2] = p.z;
                const t = uvFn(j / (M - 1), i / (N - 1));
                uvs[k * 2] = t[0]; uvs[k * 2 + 1] = t[1];
            }
        }
        const capA = N * M, capB = N * M + 1;
        positions[capA * 3] = centers[0].x; positions[capA * 3 + 1] = centers[0].y; positions[capA * 3 + 2] = centers[0].z;
        positions[capB * 3] = centers[1].x; positions[capB * 3 + 1] = centers[1].y; positions[capB * 3 + 2] = centers[1].z;
        const ta = uvFn(0.5, 0), tb = uvFn(0.5, 1);
        uvs[capA * 2] = ta[0]; uvs[capA * 2 + 1] = ta[1];
        uvs[capB * 2] = tb[0]; uvs[capB * 2 + 1] = tb[1];
        const indices = [];
        for (let i = 0; i < N - 1; i++) for (let j = 0; j < M - 1; j++) {
            const A = i * M + j, B = A + 1, C = A + M, D = C + 1;
            indices.push(A, C, B, B, C, D);
        }
        // 【対策】両端のキャップは側面と巻き順を揃える。逆だと ComputeNormals が
        //         端のリングで外向きと内向きの面法線を足し合わせて頂点法線が裏返る
        for (let j = 0; j < M - 1; j++) indices.push(capA, j, j + 1);
        const o = (N - 1) * M;
        for (let j = 0; j < M - 1; j++) indices.push(capB, o + j + 1, o + j);

        const refI = Math.floor(N / 2), refIdx = refI * M;
        const normals = finalize(positions, indices, new V3(0, 0, 0), refIdx);
        weldNormals(positions, normals);
        return makeMesh(name, positions, indices, normals, uvs, null, scene);
    }

    // 下端が開いた殻（ソース）。上だけキャップで閉じる
    // 【対策】ソースの垂れをアルファテストの切り抜きで作ると、切り抜いた
    //         境界に厚みが無く「印刷した模様」になる。境界そのものを
    //         メッシュの縁にして、縁の立ち上がりを面で持たせる
    function shell(name, rings, uvRows, topCenter, topUv, scene) {
        const N = rings.length, M = rings[0].length;
        const total = N * M + 1;
        const positions = new Float32Array(total * 3);
        const uvs = new Float32Array(total * 2);
        for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
            const k = i * M + j, p = rings[i][j];
            positions[k * 3] = p.x; positions[k * 3 + 1] = p.y; positions[k * 3 + 2] = p.z;
            uvs[k * 2] = uvRows[i][j][0]; uvs[k * 2 + 1] = uvRows[i][j][1];
        }
        const cap = N * M;
        positions[cap * 3] = topCenter.x; positions[cap * 3 + 1] = topCenter.y; positions[cap * 3 + 2] = topCenter.z;
        uvs[cap * 2] = topUv[0]; uvs[cap * 2 + 1] = topUv[1];
        const indices = [];
        for (let i = 0; i < N - 1; i++) for (let j = 0; j < M - 1; j++) {
            const A = i * M + j, B = A + 1, C = A + M, D = C + 1;
            indices.push(A, C, B, B, C, D);
        }
        const o = (N - 1) * M;
        for (let j = 0; j < M - 1; j++) indices.push(cap, o + j + 1, o + j);
        // 基準は上のほうのリング。中心（原点）から素直に外を向く
        const refIdx = (N - 2) * M;
        const normals = finalize(positions, indices, new V3(0, 0, 0), refIdx);
        weldNormals(positions, normals);
        return makeMesh(name, positions, indices, normals, uvs, null, scene);
    }

    // =================================================================
    // 4. Fields
    // =================================================================
    // UV から単位方向へ。u が周方向、v は下極(0) → 上極(1)
    // 【対策】焼き色も気泡も、UV の格子ではなくこの方向で評価する。
    //         UV で高周波ノイズを引くと極で u が一点に潰れて放射状の縞になる
    function dirAt(u, v) {
        const th = v * Math.PI, ph = u * TAU;
        const s = Math.sin(th);
        return { x: s * Math.cos(ph), y: -Math.cos(th), z: s * Math.sin(ph) };
    }
    function vForY(y) { return Math.acos(clamp(-y, -1, 1)) / Math.PI; }

    // 正規直交な補助ベクトル（折り込みの溝の方位に使う）
    function frameFor(ax, ay, az) {
        let ux, uy, uz;
        if (Math.abs(ay) < 0.9) { ux = 0; uy = 1; uz = 0; } else { ux = 1; uy = 0; uz = 0; }
        let vx = uy * az - uz * ay, vy = uz * ax - ux * az, vz = ux * ay - uy * ax;
        let l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l;
        let wx = ay * vz - az * vy, wy = az * vx - ax * vz, wz = ax * vy - ay * vx;
        l = Math.hypot(wx, wy, wz) || 1; wx /= l; wy /= l; wz /= l;
        return { ux: vx, uy: vy, uz: vz, vx: wx, vy: wy, vz: wz };
    }

    // =================================================================
    // 5. TextureLab
    // =================================================================
    const TextureLab = {
        _tex(name, w, h, fill, scene, linear, clampV) {
            const dt = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(w, h);
            fill(img.data, w, h);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = false;
            dt.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
            dt.wrapV = clampV ? BABYLON.Texture.CLAMP_ADDRESSMODE : BABYLON.Texture.WRAP_ADDRESSMODE;
            // 【対策】ORM と法線は「色」ではない。既定のまま（gammaSpace = true）
            //         にすると粗さ 0.56 が線形 0.29 として渡り、狙いよりつやつやになる
            if (linear) dt.gammaSpace = false;
            // 【対策】極では u 方向が極端に圧縮される。等方フィルタだと GPU が
            //         u 側の縮小率に合わせて高い LOD を選び、極一帯がぼやける
            dt.anisotropicFilteringLevel = 16;
            return dt;
        },

        // ---- 2x2 アトラスの走査 --------------------------------------
        // 【対策】アトラスの継ぎ目でバイリニアが隣の柄を拾わないよう、
        //         タイルの内側へ 1.5 テクセル詰めて焼き、詰めた縁は
        //         端の値を複製する（w, vv を 0..1 にクランプする）
        atlasPad(S) { return 1.5 / S; },
        atlasUV(S, p, w, v) {
            const PAD = this.atlasPad(S);
            const px = p % 2, py = (p / 2) | 0;
            return [px * 0.5 + PAD + w * (0.5 - 2 * PAD),
                    py * 0.5 + PAD + v * (0.5 - 2 * PAD)];
        },
        // 逆変換：アトラス座標 (X, Y) → { p, w, v }
        atlasLocal(S, X, Y) {
            const PAD = this.atlasPad(S), SP = 0.5 - 2 * PAD;
            const ax = (X + 0.5) / S, ay = (Y + 0.5) / S;
            const px = ax < 0.5 ? 0 : 1, py = ay < 0.5 ? 0 : 1;
            return {
                p: py * 2 + px,
                w: clamp((ax - px * 0.5 - PAD) / SP, 0, 1),
                v: clamp((ay - py * 0.5 - PAD) / SP, 0, 1)
            };
        },

        // ---- 生地の場（4柄ぶんまとめて1回で焼く）----------------------
        // 【対策】アルベド・ORM・法線を別々に計算すると、気泡と焼き目の
        //         位置がずれて「模様の上にぼんやりした汚れが乗った」ように見える
        //
        // 【対策】1024² の各テクセルで sin/cos を引くと 200万回の三角関数に
        //         なり、生成だけで1秒近く食う。タイル内の u は列だけ、
        //         v は行だけで決まるので、先に表にしておく
        crustField(S, cfg, shapes) {
            const n2 = S * S, T = S >> 1;
            const PAD = this.atlasPad(S), SP = 0.5 - 2 * PAD;
            const F = {
                bake: new Float32Array(n2),   // 焼き色 0..1
                char: new Float32Array(n2),   // 焦げ
                wet: new Float32Array(n2),    // 油でぬれた高台
                pore: new Float32Array(n2),   // 気泡の穴
                crease: new Float32Array(n2), // 折り込みの溝
                ringf: new Float32Array(n2),  // 継ぎ目のリング
                h: new Float32Array(n2)
            };
            const sd = cfg.texSeed;
            const cph = new Float64Array(T), sph = new Float64Array(T);
            const vRow = new Float64Array(T);
            for (let k = 0; k < T; k++) {
                const w = clamp(((k + 0.5) / S - PAD) / SP, 0, 1);
                const ph = w * TAU;
                cph[k] = Math.cos(ph); sph[k] = Math.sin(ph);
                vRow[k] = w;
            }
            // ノイズの周波数は単位球の座標で効く。半径 2.15cm の球で周期 L cm の
            // 模様が欲しければ K = R / L。焼きムラ 1.2cm → K≒1.8、気泡 2mm → K≒11
            const K_BAKE = 1.9, K_MOT = 4.6, K_CHAR = 8.5, K_PORE = 13.0, K_FINE = 34.0;
            const d = { x: 0, y: 0, z: 0 };
            for (let py = 0; py < 2; py++) {
                for (let ly = 0; ly < T; ly++) {
                    const th = vRow[ly] * Math.PI;
                    const st = Math.sin(th), ct = -Math.cos(th);
                    const Y = py * T + ly;
                    for (let px = 0; px < 2; px++) {
                        const sh = shapes[py * 2 + px];
                        const X0 = px * T;
                        for (let lx = 0; lx < T; lx++) {
                            d.x = st * cph[lx]; d.y = ct; d.z = st * sph[lx];
                            const i = Y * S + X0 + lx;

                            // 折り込みの溝・くぼみ・継ぎ目。ジオメトリと同じ関数を見る
                            // 【対策】溝とくぼみは同じ軸との内積を使う。別々に
                            //         acos を引くと 1024² で 100万回ぶん無駄になる
                            const ad = clamp(d.x * sh.ax + d.y * sh.ay + d.z * sh.az, -1, 1);
                            const ang = Math.acos(ad);
                            const cr = sh.creaseAt(d), dp = sh.dimpleAt(d, ang);
                            const rg = sh.ringAt(d);

                            // 焼き色の下地。鉄板に当たった凸部が濃い。
                            // 【対策】幾何と無相関のノイズだけで塗ると「汚れた球」に
                            //         なる。低周波の膨らみを直接ぶつけて相関させる
                            const bulge = clamp(sh.lumpLowAt(d), -1.2, 1.2);
                            const mot = Noise.fbm3(d.x * K_BAKE + 3, d.y * K_BAKE + 11, d.z * K_BAKE + 7, sd + 5, 2);
                            const mot2 = Noise.fbm3(d.x * K_MOT + 17, d.y * K_MOT + 2, d.z * K_MOT + 23, sd + 61, 2);
                            // 下半分は型に接していたので均一に濃く、上半分はまだらで淡い
                            const under = smooth(0.35, -0.55, d.y);
                            let bake = 0.30 + 0.42 * under + 0.15 * (mot - 0.5) * 2
                                + 0.16 * (mot2 - 0.5) * 2 + 0.22 * bulge;
                            bake -= 0.22 * cr + 0.20 * dp;
                            bake += 0.12 * rg;
                            bake = clamp(bake * cfg.doneness, 0, 1);

                            // 焦げ。しきい値を高く狭く取らないと全体が薄汚れる
                            const ch = Noise.v3(d.x * K_CHAR + 31, d.y * K_CHAR + 19, d.z * K_CHAR + 5, sd + 113);
                            const chr = smooth(0.60, 0.80, ch * 0.55 + bake * 0.45) * smooth(0.42, 0.72, bake);

                            // 気泡の穴。生地が膨らんで弾けた跡で、縁だけ濃い
                            const pn = Noise.v3(d.x * K_PORE + 9, d.y * K_PORE + 27, d.z * K_PORE + 13, sd + 211);
                            const pore = smooth(0.74, 0.93, pn);

                            // 表面の細かい粒。油を吸って光る高台
                            const fn = Noise.v3(d.x * K_FINE + 6, d.y * K_FINE + 15, d.z * K_FINE + 21, sd + 307);
                            const wet = smooth(0.44, 0.86, fn * 0.5 + mot2 * 0.5) * (0.35 + 0.65 * smooth(0.0, 0.5, d.y + 0.4));

                            F.bake[i] = bake; F.char[i] = chr; F.wet[i] = wet;
                            F.pore[i] = pore; F.crease[i] = cr; F.ringf[i] = rg;
                            // 高さ場。ジオメトリで入れた溝は法線でも軽くなぞる
                            F.h[i] = clamp(
                                0.52
                                + 0.16 * (fn - 0.5)
                                + 0.10 * (mot2 - 0.5)
                                - 0.30 * pore
                                - 0.18 * cr
                                + 0.10 * rg
                                + 0.06 * chr, 0, 1);
                        }
                    }
                }
            }
            return F;
        },

        // 焼き色の値から皮の色を出す。ソースの下地としても呼ぶので外に出す
        // 【対策】ソースの下に別の色を仮定すると、垂れの縁で下地の色が
        //         段差になって「シールを貼った」ように見える
        crustTone(cfg, bake, chr, pore) {
            const PA = cfg.crustPale, GO = cfg.crustGold, BR = cfg.crustBrown, CH = cfg.crustChar;
            let c = bake < 0.5 ? mix3(PA, GO, smooth(0.06, 0.50, bake))
                : mix3(GO, BR, smooth(0.50, 0.86, bake));
            c = mix3(c, CH, chr * 0.85);
            c = mix3(c, BR, smooth(0.0, 0.55, pore) * 0.30);
            c = mix3(c, PA, smooth(0.72, 1.0, pore) * 0.35);
            return c;
        },

        crustAlbedo(scene, S, cfg, F) {
            const PA = cfg.crustPale, GO = cfg.crustGold, BR = cfg.crustBrown;
            const CH = cfg.crustChar, WE = cfg.crustWet;
            return this._tex("takoCrustA", S, S, (d) => {
                for (let i0 = 0; i0 < S * S; i0++) {
                    const b = F.bake[i0];
                    // 淡い生地 → きつね色 → 濃い焼き目 の3段。
                    // 【対策】2色の線形補間だと必ず「くすんだ茶色の球」になる。
                    //         実物は淡黄・橙・焦茶が斑に同居している
                    let c = b < 0.5 ? mix3(PA, GO, smooth(0.06, 0.50, b))
                        : mix3(GO, BR, smooth(0.50, 0.86, b));
                    c = mix3(c, CH, F.char[i0] * 0.85);
                    // 油でぬれた高台はわずかに白っぽく明るい
                    c = mix3(c, WE, F.wet[i0] * 0.20);
                    // 気泡の穴は縁だけ濃い（穴の底は生っぽい淡色）
                    c = mix3(c, BR, smooth(0.0, 0.55, F.pore[i0]) * 0.30);
                    c = mix3(c, PA, smooth(0.72, 1.0, F.pore[i0]) * 0.35);
                    // 折り込みの溝は焼けていないので淡い
                    c = mix3(c, PA, F.crease[i0] * 0.45);
                    const i = i0 * 4;
                    d[i] = c[0] * 255; d[i + 1] = c[1] * 255; d[i + 2] = c[2] * 255; d[i + 3] = 255;
                }
            }, scene);
        },

        crustOrm(scene, S, cfg, F) {
            return this._tex("takoCrustO", S, S, (d) => {
                for (let i0 = 0; i0 < S * S; i0++) {
                    // AO：溝・気泡・継ぎ目の陰
                    const ao = clamp(1 - 0.42 * F.crease[i0] - 0.34 * F.pore[i0] * F.pore[i0]
                        - 0.10 * (1 - F.ringf[i0]) * 0, 0, 1);
                    // 粗さ：油を吸った所だけ光る。全面を磨くと食品サンプルになる
                    let ro = cfg.crustRough
                        - cfg.oil * 0.30 * F.wet[i0]
                        - 0.10 * smooth(0.55, 0.95, F.bake[i0])
                        + 0.16 * F.crease[i0]
                        + 0.10 * F.pore[i0];
                    ro = clamp(ro, 0.18, 0.92);
                    const i = i0 * 4;
                    d[i] = ao * 255; d[i + 1] = ro * 255; d[i + 2] = 0; d[i + 3] = 255;
                }
            }, scene, true);
        },

        // アトラスなので、隣接テクセルの参照はタイルの内側で折り返す
        atlasNormal(name, scene, S, hf, strength, uWrap) {
            const T = S / 2;
            return this._tex(name, S, S, (d) => {
                for (let Y = 0; Y < S; Y++) {
                    const ty = Y < T ? 0 : 1, ly = Y - ty * T;
                    for (let X = 0; X < S; X++) {
                        const tx = X < T ? 0 : 1, lx = X - tx * T;
                        const xl = tx * T + (uWrap ? (lx - 1 + T) % T : Math.max(0, lx - 1));
                        const xr = tx * T + (uWrap ? (lx + 1) % T : Math.min(T - 1, lx + 1));
                        const yu = ty * T + Math.max(0, ly - 1);
                        const yd = ty * T + Math.min(T - 1, ly + 1);
                        // タイルの上下端では接空間が不安定なので、そこだけ細く落とす
                        const vv = ly / T;
                        const k = strength * smooth(0, 0.02, vv) * (1 - smooth(0.98, 1.0, vv));
                        // 【対策】v 方向は (hd - hu)。(hu - hd) は V が上を向く
                        //         OpenGL 系の規約で、Babylon の接空間は V が下向き
                        let nx = (hf[Y * S + xl] - hf[Y * S + xr]) * k;
                        let ny = (hf[yd * S + X] - hf[yu * S + X]) * k;
                        let nz = 1;
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const i = (Y * S + X) * 4;
                        d[i] = (nx * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene, true);
        },

        // ---- ソース ---------------------------------------------------
        // v は「ソースの下端 → 上極」に張り直した座標
        sauceField(S, cfg, shapes) {
            const n2 = S * S;
            const F = {
                thick: new Float32Array(n2), wrink: new Float32Array(n2), h: new Float32Array(n2),
                ur: new Float32Array(n2), ug: new Float32Array(n2), ub: new Float32Array(n2)
            };
            const sd = cfg.texSeed + 4001, cd = cfg.texSeed;
            const K_BAKE = 1.9, K_CHAR = 8.5, K_PORE = 13.0;
            for (let Y = 0; Y < S; Y++) {
                for (let X = 0; X < S; X++) {
                    const L = this.atlasLocal(S, X, Y);
                    const sh = shapes[L.p];
                    const ph = L.w * TAU;
                    const vE = sh.sauceEdgeV(ph);
                    const vp = mix(vE, 1, L.v);
                    const d = dirAt(L.w, vp);
                    const i = Y * S + X;
                    const t = sh.sauceThickAt(d, L.v);
                    // とろみのしわ。刷毛目と、乾きかけた表面のちりめん
                    const w1 = Noise.fbm3(d.x * 7.5 + 4, d.y * 7.5 + 12, d.z * 7.5 + 2, sd + 7, 2);
                    const w2 = Noise.v3(d.x * 26 + 3, d.y * 26 + 8, d.z * 26 + 19, sd + 77);
                    F.thick[i] = t;
                    F.wrink[i] = 0.62 * w1 + 0.38 * w2;
                    F.h[i] = clamp(0.5 + 0.30 * (w1 - 0.5) + 0.16 * (w2 - 0.5) + 0.20 * (t - 0.5), 0, 1);

                    // ソースの下にある焼き色。crustField と同じ式の簡約版
                    // 【対策】ソースは薄い透明な膜で、見えている色の大半は
                    //         「下の焼き色が透けたもの」。ここを省いて濃い茶色を
                    //         塗ると、どう調整してもチョコレートがけになる
                    const bulge = clamp(sh.lumpLowAt(d), -1.2, 1.2);
                    const mot = Noise.fbm3(d.x * K_BAKE + 3, d.y * K_BAKE + 11, d.z * K_BAKE + 7, cd + 5, 2);
                    const under = smooth(0.35, -0.55, d.y);
                    let bake = clamp((0.30 + 0.42 * under + 0.15 * (mot - 0.5) * 2 + 0.22 * bulge) * cfg.doneness, 0, 1);
                    const ch = Noise.v3(d.x * K_CHAR + 31, d.y * K_CHAR + 19, d.z * K_CHAR + 5, cd + 113);
                    const chr = smooth(0.60, 0.80, ch * 0.55 + bake * 0.45) * smooth(0.42, 0.72, bake);
                    const pn = Noise.v3(d.x * K_PORE + 9, d.y * K_PORE + 27, d.z * K_PORE + 13, cd + 211);
                    const c = this.crustTone(cfg, bake, chr, smooth(0.74, 0.93, pn));
                    F.ur[i] = c[0]; F.ug[i] = c[1]; F.ub[i] = c[2];
                }
            }
            return F;
        },

        // 【対策】たこ焼きソースは「濃い茶色の塗料」ではなく「薄い色ガラス」。
        //         不透明色を塗ると必ずチョコレートがけになる。
        //         下地の焼き色に透過率を掛け、ソース自身の散乱を足す
        //         （ベール・ランベルト）。膜が薄い所は琥珀色、
        //         たまりだけが濃い赤茶になり、実物の見え方と一致する
        sauceAlbedo(scene, S, cfg, F) {
            const EX = cfg.sauceExt, PO = cfg.saucePool;
            // 散乱源（＝光学的に厚いたまりの色）は線形で持つ
            const pr = srgb(PO[0]), pg = srgb(PO[1]), pb = srgb(PO[2]);
            return this._tex("takoSauceA", S, S, (d) => {
                for (let i0 = 0; i0 < S * S; i0++) {
                    // 刷毛目は「色」ではなく「膜の厚み」の濃淡として効かせる
                    const T = clamp(F.thick[i0] * (0.72 + 0.56 * F.wrink[i0]), 0, 1.4);
                    const tr = [Math.exp(-EX[0] * T), Math.exp(-EX[1] * T), Math.exp(-EX[2] * T)];
                    const ur = srgb(F.ur[i0]), ug = srgb(F.ug[i0]), ub = srgb(F.ub[i0]);
                    const cr = ur * tr[0] + pr * (1 - tr[0]);
                    const cg = ug * tr[1] + pg * (1 - tr[1]);
                    const cb = ub * tr[2] + pb * (1 - tr[2]);
                    const i = i0 * 4;
                    d[i] = unsrgb(cr) * 255;
                    d[i + 1] = unsrgb(cg) * 255;
                    d[i + 2] = unsrgb(cb) * 255;
                    d[i + 3] = 255;
                }
            }, scene);
        },

        sauceOrm(scene, S, cfg, F) {
            return this._tex("takoSauceO", S, S, (d) => {
                for (let i0 = 0; i0 < S * S; i0++) {
                    const t = smooth(0.02, 0.55, F.thick[i0]);
                    // 【対策】艶を一様にするとプラスチックの成型品になる。
                    //         たまりだけが鏡で、薄く伸びて乾きかけた縁はざらつく
                    // 【対策】ラッカーのような一様な鏡面にすると飴細工になる。
                    //         実物は「濡れて光る」程度で、乾きかけた薄い所は曇る
                    let ro = mix(0.46, 0.15, t) + 0.12 * (F.wrink[i0] - 0.5) * 2;
                    ro = clamp(ro * (1.3 - 0.5 * cfg.sauceGloss), 0.10, 0.72);
                    const ao = clamp(1 - 0.16 * (1 - t), 0, 1);
                    const i = i0 * 4;
                    d[i] = ao * 255; d[i + 1] = ro * 255; d[i + 2] = 0; d[i + 3] = 255;
                }
            }, scene, true);
        },

        // ---- 木（舟皿・板の間）---------------------------------------
        // 経木も机も同じ関数。年輪の密度と色だけ変える
        //
        // 【対策】アルベド・ORM・法線でそれぞれノイズを引き直すと、
        //         同じ 1024² を3回走査することになって生成が3倍かかる。
        //         しかも丸め方の違いで年輪の位置がわずかにずれ、
        //         「木目の上に別の木目の影が乗った」ように見える
        woodSet(scene, size, seed, opt) {
            const N = size, n2 = N * N;
            const ring = new Float32Array(n2), fine = new Float32Array(n2);
            const knot = new Float32Array(n2), seam = new Float32Array(n2);
            for (let y = 0; y < N; y++) {
                const v = y / N;
                for (let x = 0; x < N; x++) {
                    const u = x / N, i = y * N + x;
                    // 【対策】年輪を完全な直線にすると印刷した紙になる。
                    //         低周波のうねりで木口の流れを作ってから縞を引く
                    const flow = Noise.fbm2(u * 2.6 + 3, v * 1.4 + 7, seed + 11, 3) - 0.5;
                    const t = v * opt.rings + flow * opt.wave;
                    ring[i] = Math.pow(Math.abs(Math.sin(t * Math.PI)), opt.sharp);
                    fine[i] = Noise.fbm2(u * 120 + 1, v * 380 + 5, seed + 43, 2);
                    knot[i] = Noise.fbm2(u * 3.1 + 21, v * 3.4 + 13, seed + 89, 3);
                    if (opt.planks > 0) {
                        const pv = v * opt.planks;
                        seam[i] = 1 - smooth(0.0, 0.012, Math.abs(pv - Math.round(pv)));
                    }
                }
            }
            const BASE = opt.base, GRAIN = opt.grain, DARK = opt.dark;
            const albedo = this._tex(opt.name + "A", N, N, (d) => {
                for (let i = 0; i < n2; i++) {
                    let c = mix3(BASE, GRAIN, ring[i] * 0.75 + (fine[i] - 0.5) * 0.16);
                    c = mix3(c, DARK, smooth(0.78, 0.95, knot[i]) * opt.knot);
                    if (opt.planks > 0) c = mix3(c, DARK, seam[i] * 0.65);
                    const k = i * 4;
                    d[k] = c[0] * 255; d[k + 1] = c[1] * 255; d[k + 2] = c[2] * 255; d[k + 3] = 255;
                }
            }, scene);
            const orm = this._tex(opt.name + "O", N, N, (d) => {
                for (let i = 0; i < n2; i++) {
                    // 夏目（濃い縞）は繊維が粗くて光らない
                    const ro = clamp(opt.rough + 0.10 * ring[i] + 0.06 * (fine[i] - 0.5), 0.35, 0.98);
                    const k = i * 4;
                    d[k] = 255 * (1 - 0.20 * seam[i]); d[k + 1] = ro * 255; d[k + 2] = 0; d[k + 3] = 255;
                }
            }, scene, true);
            const H = new Float32Array(n2);
            for (let i = 0; i < n2; i++) {
                H[i] = clamp(0.5 - 0.30 * ring[i] + 0.22 * (fine[i] - 0.5) - 0.35 * seam[i], 0, 1);
            }
            const normal = this._tex(opt.name + "N", N, N, (d) => {
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const xl = H[y * N + ((x - 1 + N) % N)], xr = H[y * N + ((x + 1) % N)];
                    const hu = H[((y - 1 + N) % N) * N + x], hd = H[((y + 1) % N) * N + x];
                    // 【対策】v 方向は (hd - hu)。Babylon の接空間は V が下向き
                    let nx = (xl - xr) * opt.bump, ny = (hd - hu) * opt.bump, nz = 1;
                    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                    const i = (y * N + x) * 4;
                    d[i] = (nx * 0.5 + 0.5) * 255;
                    d[i + 1] = (ny * 0.5 + 0.5) * 255;
                    d[i + 2] = (nz * 0.5 + 0.5) * 255;
                    d[i + 3] = 255;
                }
            }, scene, true);
            return { albedo, orm, normal };
        }
    };

    // =================================================================
    // 6. Pattern （柄 = 形状 + マテリアル。プリセットごとにキャッシュ）
    // =================================================================
    // 形（低周波）と焼き色は必ず相関させたいので、両方を同じ種から決める。
    // 個体差は「大きさ・向き・傾き・薬味の散らばり」で出す
    class Shape {
        constructor(cfg, p) {
            const rng = new Rng((cfg.texSeed + p * 7919 + 13) >>> 0);
            this.cfg = cfg;
            this.p = p;
            this.R = cfg.radius * rng.range(1 - cfg.sizeVar, 1 + cfg.sizeVar);
            this.squash = cfg.squash * rng.range(0.98, 1.02);
            this.nseed = rng.int(900000) + 1000;

            this.lumpBase = cfg.lumpBase * rng.range(0.8, 1.25);
            this.lumpTop = cfg.lumpTop * rng.range(0.8, 1.25);
            this.lumpFine = cfg.lumpFine * rng.range(0.7, 1.35);
            this.f1 = cfg.f1 * rng.range(0.85, 1.18);
            this.f2 = cfg.f2 * rng.range(0.85, 1.18);
            this.o1 = rng.range(0, 60); this.o2 = rng.range(0, 60); this.o3 = rng.range(0, 60);

            // 型の縁でできる継ぎ目のリング。赤道からわずかに下
            this.seamY = rng.range(-0.16, 0.02);
            this.seamW = rng.range(0.12, 0.20);
            this.ringAmp = cfg.ringAmp * rng.range(0.75, 1.3);
            this.ringSeed = rng.int(90000) + 100;

            // 竹串を刺した軸。ここに浅いくぼみが残る
            const th = rng.range(0.18, 0.52), ph = rng.range(0, TAU);
            this.ax = Math.sin(th) * Math.cos(ph);
            this.ay = Math.cos(th);
            this.az = Math.sin(th) * Math.sin(ph);
            this.fr = frameFor(this.ax, this.ay, this.az);
            this.dimpleAmp = cfg.dimple * rng.range(0.7, 1.3);

            // 折り込みの溝
            // 【対策】幅の狭いガウスを1本だけ置くと、コンパスで引いたような
            //         細い線になり、どの個体にも同じ引っかき傷が入って見える。
            //         実物は竹串で生地を寄せた跡なので、
            //           ・線ではなく幅のある浅い窪み
            //           ・途中で途切れ、深さが波打つ
            //           ・1本のこともあれば、交わる2本のこともある
            //         の3つが揃って初めて「折り込んだ跡」に見える
            // 【対策】溝が常に上極のそばにあると、Y 軸で個体を回しても
            //         見える位置が変わらない。軸を極から離して置く
            this.folds = [];
            const nf = 1 + (rng.next() < 0.55 ? 1 : 0);
            for (let i = 0; i < nf; i++) {
                const ft = rng.range(0.30, 1.00), fp = rng.range(0, TAU);
                const fx = Math.sin(ft) * Math.cos(fp);
                const fy = Math.cos(ft);
                const fz = Math.sin(ft) * Math.sin(fp);
                const R = rng.range(0.40, 0.85);          // 軸からの角半径
                const W = rng.range(0.20, 0.30);          // 幅（rad）。0.10 は傷
                const wob = rng.range(0.10, 0.20);        // 溝そのもののうねり
                // 【対策】1024² の全テクセルで atan2 とノイズを引くと重い。
                //         内積の範囲だけで大半を切り落とす（acos は不要）
                // 2.0σ まで見ると球の 7 割で atan2 とノイズを引くことになる。
                // 1.7σ で打ち切っても残差は 5% 未満（半径にして 1/100 mm）
                const band = W * 1.7 + wob;
                this.folds.push({
                    ax: fx, ay: fy, az: fz, fr: frameFor(fx, fy, fz),
                    R: R, W: W, wob: wob,
                    cMin: Math.cos(Math.min(Math.PI, R + band)),
                    cMax: Math.cos(Math.max(0, R - band)),
                    arc0: rng.range(0, TAU),
                    arcHalf: rng.range(1.0, 2.2),
                    seed: rng.int(90000) + 100,
                    amp: i === 0 ? 1.0 : rng.range(0.45, 0.80)
                });
            }
            this.creaseAmp = cfg.creaseAmp * rng.range(0.8, 1.25);

            // ソースの垂れ
            this.sauceSeed = rng.int(90000) + 100;
            this.sauceY = cfg.sauceY + rng.gauss(0, 0.05);
            this.dripAmp = cfg.dripAmp * rng.range(0.85, 1.2);
            this.dripPeriod = Math.max(5, Math.round(cfg.dripPeriod * rng.range(0.85, 1.15)));
        }

        // 球面方向の低周波ノイズ。上半分だけ大きく歪ませる
        // 【対策】全方向を等方に歪ませるとただの肉団子になる。
        //         下半分は半球の型の写しなので、ほとんど歪んでいない
        lumpAt(d) {
            const top = smooth(-0.25, 0.55, d.y);
            const n1 = Noise.fbm3(d.x * this.f1 + this.o1, d.y * this.f1 + this.o2, d.z * this.f1 + this.o3,
                this.nseed, 2) - 0.5;
            const n2 = Noise.fbm3(d.x * this.f2 + this.o2, d.y * this.f2 + this.o3, d.z * this.f2 + this.o1,
                this.nseed + 37, 2) - 0.5;
            return 1 + (this.lumpBase + this.lumpTop * top) * 2 * n1 + this.lumpFine * 2 * n2;
        }

        // 低周波の膨らみだけを -1..1 で返す。焼き色との相関に使う
        // 【対策】焼き色のためだけに lumpAt を丸ごと呼ぶと、
        //         1024² のテクセルごとに要らない高周波の1本を引くことになる
        lumpLowAt(d) {
            const n1 = Noise.fbm3(d.x * this.f1 + this.o1, d.y * this.f1 + this.o2, d.z * this.f1 + this.o3,
                this.nseed, 2) - 0.5;
            return n1 * 2;
        }

        // 型の縁の継ぎ目（ちぎれてがたつく）
        ringAt(d) {
            const g = (d.y - this.seamY) / this.seamW;
            const e = Math.exp(-g * g);
            // 高さ方向を固定して (x, z) だけで引くと、縦に流れる縞になる
            const ragged = 0.35 + 0.65 * Noise.fbm2(d.x * 6.5 + 3, d.z * 6.5 + 9, this.ringSeed, 2);
            return e * ragged;
        }

        // 折り込みの溝。各 fold の軸から角距離 R の、途切れた浅い窪み
        creaseAt(d) {
            let out = 0;
            for (let i = 0; i < this.folds.length; i++) {
                const f = this.folds[i];
                const c = clamp(d.x * f.ax + d.y * f.ay + d.z * f.az, -1, 1);
                // 内積だけで大半を切り落とす（acos もノイズも引かない）
                if (c < f.cMin || c > f.cMax) continue;
                const px = d.x - c * f.ax, py = d.y - c * f.ay, pz = d.z - c * f.az;
                const fr = f.fr;
                const a2 = Math.atan2(px * fr.vx + py * fr.vy + pz * fr.vz,
                    px * fr.ux + py * fr.uy + pz * fr.uz);
                let da = a2 - f.arc0;
                while (da > Math.PI) da -= TAU;
                while (da < -Math.PI) da += TAU;
                const arc = 1 - smooth(f.arcHalf * 0.5, f.arcHalf, Math.abs(da));
                if (arc <= 0) continue;
                // 【対策】溝の芯をきれいな円弧のまま置くと、器具で刻んだ線に
                //         見える。方位に沿って芯を揺らし、深さも途切れさせる
                const t = a2 / TAU;
                const wob = (Noise.fbm2u(t * 7, 4.3, 7, f.seed, 2) - 0.5) * 2 * f.wob;
                const bite = 0.35 + 0.65 * Noise.fbm2u(t * 11 + 3, 1.9, 11, f.seed + 17, 2);
                const g = (Math.acos(c) - f.R - wob) / f.W;
                const v = Math.exp(-g * g) * arc * bite * f.amp;
                if (v > out) out = v;
            }
            return out;
        }

        // 串で押したくぼみ（軸のまわり）
        dimpleAt(d, angIn) {
            let ang = angIn;
            if (ang === undefined) {
                ang = Math.acos(clamp(d.x * this.ax + d.y * this.ay + d.z * this.az, -1, 1));
            }
            const t = ang / 0.26;
            return Math.exp(-t * t);
        }

        radiusAt(d) {
            // 扁平した回転楕円体。型のくぼみに入っていたぶん上下が詰まる
            let r = 1 / Math.sqrt(d.x * d.x + d.z * d.z + (d.y * d.y) / (this.squash * this.squash));
            const ang = Math.acos(clamp(d.x * this.ax + d.y * this.ay + d.z * this.az, -1, 1));
            r *= this.lumpAt(d);
            r *= 1 + this.ringAmp * this.ringAt(d);
            r *= 1 - this.creaseAmp * this.creaseAt(d);
            r *= 1 - this.dimpleAmp * this.dimpleAt(d, ang);
            // 接地面はわずかに平ら
            r *= 1 - this.cfg.flatBottom * smooth(0.80, 1.0, -d.y);
            return this.R * r;
        }

        // ---- ソース ---------------------------------------------------
        // 垂れの下端。方位だけの関数にして縦に走る筋にする
        // 【対策】方位と高さの両方を含むノイズで輪郭を作ると、
        //         垂れが斜めに流れて「かかった」ではなく「塗った」に見える
        sauceEdgeY(phi) {
            const P = this.dripPeriod;
            const n = Noise.fbm2u(phi / TAU * P, 3.7, P, this.sauceSeed, 3);
            // 【対策】指数が小さいと一周ぜんぶが均等に垂れ、貝殻状の裾に
            //         なって「浸けチョコ」の輪郭そのものになる。実物は
            //         「大半は上のほうで止まり、数本だけが深く走る」
            const t = Math.pow(smooth(0.30, 0.92, n), 2.8);
            return this.sauceY - this.dripAmp * t;
        }
        sauceEdgeV(phi) { return vForY(clamp(this.sauceEdgeY(phi), -0.94, 0.94)); }

        // 厚み（0..1）。上ほど厚く、垂れの先端で表面張力の玉ができる
        // 【対策】上面を一様に厚くすると「浸けチョコ」になる。
        //         実物は刷毛でのせるので、同じ玉の上面でも濃淡が大きく、
        //         薄い所では下の焼き色がほとんどそのまま見える
        sauceThickAt(d, t) {
            const base = smooth(0.0, 0.32, t);
            const bead = 0.38 * Math.exp(-Math.pow((t - 0.10) / 0.075, 2));
            const patch = Noise.fbm3(d.x * 3.4 + 5, d.y * 3.4 + 15, d.z * 3.4 + 25,
                this.sauceSeed + 51, 2);
            const cov = smooth(0.26, 0.66, patch);
            return clamp(base * (0.14 + 0.86 * cov) + bead * (0.35 + 0.65 * cov), 0, 1);
        }

        // 【対策】光学的な厚みと形の厚みを分ける。膜が薄い所まで殻を落とすと
        //         生地の面と重なって Z ファイティングを起こす。
        //         形のほうには下限を持たせ、色だけを薄くする
        sauceOffsetAt(d, t) {
            const cfg = this.cfg;
            const g = Math.max(0.22, this.sauceThickAt(d, t));
            return cfg.sauceLip + (cfg.sauceThick - cfg.sauceLip) * g;
        }

        // 方向 d の表面（ソースを含む）までの距離。薬味を置くのに使う
        surfaceAt(d) {
            let r = this.radiusAt(d);
            if (!this.cfg.sauce) return r;
            const phi = Math.atan2(d.z, d.x);
            const vE = this.sauceEdgeV(phi < 0 ? phi + TAU : phi);
            const v = vForY(d.y);
            if (v <= vE) return r;
            const t = clamp((v - vE) / Math.max(1e-4, 1 - vE), 0, 1);
            return r + this.sauceOffsetAt(d, t);
        }
        onSauce(d) {
            if (!this.cfg.sauce) return 0;
            let phi = Math.atan2(d.z, d.x); if (phi < 0) phi += TAU;
            const vE = this.sauceEdgeV(phi);
            const v = vForY(d.y);
            return v <= vE ? 0 : clamp((v - vE) / Math.max(1e-4, 1 - vE), 0, 1);
        }
    }

    // マテリアル一式。プリセットごとにキャッシュする
    class Skin {
        constructor(scene, cfg, shapes) {
            const S = cfg.crustAtlas, SS = cfg.sauceAtlas;

            const F = TextureLab.crustField(S, cfg, shapes);
            this.crustA = TextureLab.crustAlbedo(scene, S, cfg, F);
            this.crustO = TextureLab.crustOrm(scene, S, cfg, F);
            this.crustN = TextureLab.atlasNormal("takoCrustN", scene, S, F.h, 3.2, true);

            const crust = new BABYLON.PBRMaterial("takoCrust", scene);
            crust.albedoTexture = this.crustA;
            crust.metallic = 0.0;
            crust.roughness = 1.0;                  // 実値は ORM の G
            crust.metallicTexture = this.crustO;
            crust.useAmbientOcclusionFromMetallicTextureRed = true;
            crust.useRoughnessFromMetallicTextureGreen = true;
            crust.useMetallnessFromMetallicTextureBlue = true;
            crust.bumpTexture = this.crustN;
            crust.bumpTexture.level = 1.0;
            crust.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
            // 【対策】焼けた小麦生地は光をよく透かす。ここを切ると
            //         「茶色に塗った石膏」になる。ただし強くしすぎると
            //         提灯になるので、厚みを大きめに取って弱く効かせる
            crust.subSurface.isTranslucencyEnabled = true;
            crust.subSurface.translucencyIntensity = 0.30;
            crust.subSurface.tintColor = new C3(0.92, 0.62, 0.32);
            crust.subSurface.minimumThickness = 0.6;
            crust.subSurface.maximumThickness = 2.2;
            // 【対策】クリアコートは付けない。生地の照りは油の膜で、
            //         ソースのような独立した透明層ではない。付けると
            //         焼き目の上にラップをかけたように見える
            crust.clearCoat.isEnabled = false;
            this.crust = crust;

            if (cfg.sauce) {
                const G = TextureLab.sauceField(SS, cfg, shapes);
                this.sauceA = TextureLab.sauceAlbedo(scene, SS, cfg, G);
                this.sauceO = TextureLab.sauceOrm(scene, SS, cfg, G);
                this.sauceN = TextureLab.atlasNormal("takoSauceN", scene, SS, G.h, 1.5, true);

                const sc = new BABYLON.PBRMaterial("takoSauce", scene);
                sc.albedoTexture = this.sauceA;
                sc.metallic = 0.0;
                sc.roughness = 1.0;
                sc.metallicTexture = this.sauceO;
                sc.useAmbientOcclusionFromMetallicTextureRed = true;
                sc.useRoughnessFromMetallicTextureGreen = true;
                sc.useMetallnessFromMetallicTextureBlue = true;
                sc.bumpTexture = this.sauceN;
                sc.bumpTexture.level = 0.7;
                sc.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
                // 【対策】ソースの艶は「濃い液体の上に薄い水の膜」。
                //         粗さを下げるだけでは金属質に寄る。クリアコートで
                //         白いハイライトを別の層として乗せる
                sc.clearCoat.isEnabled = true;
                sc.clearCoat.intensity = cfg.sauceGloss;
                // 【対策】0.055 は車の塗装の値。食べ物の上の水気は
                //         もっと広くにじんだハイライトになる
                sc.clearCoat.roughness = 0.11;
                sc.clearCoat.indexOfRefraction = 1.37;
                // 垂れの薄い縁が赤く透ける
                sc.subSurface.isTranslucencyEnabled = true;
                // 【対策】透過はアルベドの合成で入れてある。ここで重ねると
                //         二重に効いて、薄い所が赤く光ってしまう
                sc.subSurface.translucencyIntensity = 0.10;
                sc.subSurface.tintColor = new C3(0.55, 0.17, 0.05);
                sc.subSurface.minimumThickness = 0.2;
                sc.subSurface.maximumThickness = 1.0;
                this.sauce = sc;
            }

            // 青のり：頂点カラーで色を振る
            const ao = new BABYLON.PBRMaterial("takoAonori", scene);
            ao.albedoColor = new C3(1, 1, 1);
            ao.metallic = 0.0; ao.roughness = 0.72;
            ao.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
            ao.backFaceCulling = false;
            ao.twoSidedLighting = true;
            // 乾いた海苔は薄く、逆光でわずかに透ける
            ao.subSurface.isTranslucencyEnabled = true;
            ao.subSurface.translucencyIntensity = 0.28;
            ao.subSurface.tintColor = new C3(0.22, 0.38, 0.13);
            ao.subSurface.minimumThickness = 0.01;
            ao.subSurface.maximumThickness = 0.05;
            this.aonori = ao;

            // マヨネーズ
            const my = new BABYLON.PBRMaterial("takoMayo", scene);
            my.albedoColor = new C3(0.976, 0.949, 0.847).toLinearSpace();
            my.metallic = 0.0; my.roughness = 0.30;
            my.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
            my.subSurface.isTranslucencyEnabled = true;
            my.subSurface.translucencyIntensity = 0.55;
            my.subSurface.tintColor = new C3(0.98, 0.94, 0.80);
            my.subSurface.minimumThickness = 0.05;
            my.subSurface.maximumThickness = 0.30;
            this.mayo = my;

            // かつお節
            const kt = new BABYLON.PBRMaterial("takoKatsuo", scene);
            kt.albedoColor = new C3(0.855, 0.706, 0.596).toLinearSpace();
            kt.metallic = 0.0; kt.roughness = 0.52;
            kt.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
            kt.backFaceCulling = false;
            kt.twoSidedLighting = true;
            // 【対策】削り節の見せ場は「向こうが透ける薄さ」。
            //         不透明の茶色い板にすると木くずになる
            kt.subSurface.isTranslucencyEnabled = true;
            kt.subSurface.translucencyIntensity = 0.85;
            kt.subSurface.tintColor = new C3(0.92, 0.66, 0.50);
            kt.subSurface.minimumThickness = 0.005;
            kt.subSurface.maximumThickness = 0.02;
            this.katsuo = kt;
        }

        // 表示モード 0=通常 / 1=白クレイ（法線のみ）/ 2=法線マップそのもの
        setDebug(mode) {
            const list = [[this.crust, this.crustA, this.crustO, this.crustN]];
            if (this.sauce) list.push([this.sauce, this.sauceA, this.sauceO, this.sauceN]);
            for (const [m, A, O, N] of list) {
                if (mode === 2) {
                    m.unlit = true; m.disableLighting = true;
                    m.albedoTexture = null; m.albedoColor = new C3(0, 0, 0);
                    m.emissiveTexture = N; m.emissiveColor = new C3(1, 1, 1);
                    m.metallicTexture = null; m.bumpTexture = null;
                    m.clearCoat.isEnabled = false;
                    m.subSurface.isTranslucencyEnabled = false;
                    continue;
                }
                m.unlit = false; m.disableLighting = false;
                m.emissiveTexture = null; m.emissiveColor = new C3(0, 0, 0);
                m.bumpTexture = N;
                if (mode === 1) {
                    m.albedoTexture = null; m.albedoColor = new C3(0.78, 0.78, 0.78);
                    m.metallicTexture = null; m.roughness = 0.62;
                    m.clearCoat.isEnabled = false;
                    m.subSurface.isTranslucencyEnabled = false;
                } else {
                    m.albedoTexture = A; m.albedoColor = new C3(1, 1, 1);
                    m.metallicTexture = O; m.roughness = 1.0;
                    m.clearCoat.isEnabled = (m === this.sauce);
                    m.subSurface.isTranslucencyEnabled = true;
                }
            }
        }

        setBump(level, invY) {
            for (const m of [this.crust, this.sauce]) {
                if (!m) continue;
                if (m.bumpTexture) m.bumpTexture.level = level * (m === this.sauce ? 0.7 : 1.0);
                m.invertNormalMapY = invY;
            }
        }

        dispose() {
            for (const m of [this.crust, this.sauce, this.aonori, this.mayo, this.katsuo]) {
                if (m) m.dispose(true, false);
            }
            for (const t of [this.crustA, this.crustO, this.crustN, this.sauceA, this.sauceO, this.sauceN]) {
                if (t) t.dispose();
            }
        }
    }

    // =================================================================
    // 7. Takoyaki
    // =================================================================
    // テンプレート（柄ごとに1つ）。同じ柄の2個目以降はインスタンスにする
    class Template {
        constructor(scene, cfg, shape, skin) {
            this.scene = scene; this.cfg = cfg; this.shape = shape; this.skin = skin;
            this.body = this._buildBody();
            this.sauce = cfg.sauce ? this._buildSauce() : null;
            for (const m of [this.body, this.sauce]) if (m) m.isVisible = false;
        }

        _buildBody() {
            const cfg = this.cfg, sh = this.shape;
            const N = cfg.segRing, M = cfg.segRound, S = cfg.crustAtlas, p = sh.p;
            const rings = [], uv = [];
            // 極そのものはキャップで置くので、リングは内側へ半段ずらす
            const v0 = 0.5 / N, v1 = 1 - 0.5 / N;
            for (let i = 0; i <= N; i++) {
                const v = mix(v0, v1, i / N);
                const ring = [];
                for (let j = 0; j <= M; j++) {
                    const w = (j % M) / M;
                    const d = dirAt(w, v);
                    const r = sh.radiusAt(d);
                    ring.push(new V3(d.x * r, d.y * r, d.z * r));
                }
                rings.push(ring);
            }
            const dBot = dirAt(0, 0), dTop = dirAt(0, 1);
            const rB = sh.radiusAt(dBot), rT = sh.radiusAt(dTop);
            const centers = [new V3(0, -rB, 0), new V3(0, rT, 0)];
            const uvFn = (w, t) => TextureLab.atlasUV(S, p, w, mix(v0, v1, t));
            const mesh = sweep("takoBody" + p, rings, centers, uvFn, this.scene);
            mesh.material = this.skin.crust;
            mesh.receiveShadows = true;
            return mesh;
        }

        _buildSauce() {
            const cfg = this.cfg, sh = this.shape;
            const N = cfg.sauceRings, M = cfg.segRound, S = cfg.sauceAtlas, p = sh.p;
            const rings = [], uvRows = [];
            // i=0 … 生地の表面（縁の足元） / i=1 … 縁の立ち上がり
            // i>=2 … 上へ向かって厚みが増す
            for (let i = 0; i <= N; i++) {
                const ring = [], urow = [];
                for (let j = 0; j <= M; j++) {
                    const w = (j % M) / M, phi = w * TAU;
                    const vE = sh.sauceEdgeV(phi);
                    const tt = i <= 1 ? 0 : Math.pow((i - 1) / (N - 1), 0.85);
                    const v = mix(vE, 1 - 0.4 / N, tt);
                    const d = dirAt(w, v);
                    const rb = sh.radiusAt(d);
                    // 【対策】i=0 を生地の表面ぴったりに置くと Z ファイティングを
                    //         起こす。0.1mm だけ浮かせる（深度分解能のおよそ10倍）
                    const off = i === 0 ? 0.010 : sh.sauceOffsetAt(d, tt);
                    const r = rb + off;
                    ring.push(new V3(d.x * r, d.y * r, d.z * r));
                    urow.push(TextureLab.atlasUV(S, p, w, tt));
                }
                rings.push(ring); uvRows.push(urow);
            }
            const dTop = dirAt(0, 1);
            const rT = sh.radiusAt(dTop) + sh.sauceOffsetAt(dTop, 1);
            const mesh = shell("takoSauce" + p, rings, uvRows, new V3(0, rT, 0),
                TextureLab.atlasUV(S, p, 0.5, 1), this.scene);
            mesh.material = this.skin.sauce;
            mesh.receiveShadows = true;
            return mesh;
        }

        dispose() {
            for (const m of [this.body, this.sauce]) if (m) m.dispose();
        }
    }

    class Takoyaki {
        constructor(scene, cfg, tmpl, seed, useTemplate) {
            const rng = new Rng(seed);
            this.scene = scene; this.cfg = cfg; this.tmpl = tmpl;
            const sh = tmpl.shape;
            this.shape = sh;
            this.scale = rng.range(1 - cfg.scaleVar, 1 + cfg.scaleVar);
            this.R = sh.R * this.scale;

            // 【対策】剛体を付けるノードにスケールと傾きを載せてはいけない。
            //         Havok は形状にスケールを掛けるので半径が二重にかかるうえ、
            //         剛体が回ると傾きが上書きされてソースが横を向く。
            //         「並進だけを物理が動かす node」と
            //         「傾き・向き・大きさを持つ root」を分ける
            this.node = new BABYLON.TransformNode("tako", scene);
            this.node.rotationQuaternion = BABYLON.Quaternion.Identity();
            this.root = new BABYLON.TransformNode("takoV", scene);
            this.root.parent = this.node;
            this.parts = [];
            this.owned = [];

            if (useTemplate) {
                tmpl.body.isVisible = true;
                tmpl.body.parent = this.root;
                this.parts.push(tmpl.body);
                if (tmpl.sauce) {
                    tmpl.sauce.isVisible = true;
                    tmpl.sauce.parent = this.root;
                    this.parts.push(tmpl.sauce);
                }
            } else {
                const b = tmpl.body.createInstance("takoBodyI");
                b.parent = this.root; this.parts.push(b); this.owned.push(b);
                if (tmpl.sauce) {
                    const s = tmpl.sauce.createInstance("takoSauceI");
                    s.parent = this.root; this.parts.push(s); this.owned.push(s);
                }
            }

            // 薬味は個体ごとに散らす（テクスチャと違い、焼き直しの費用がない）
            if (cfg.aonori > 0) this._buildAonori(rng);
            if (cfg.mayo) this._buildMayo(rng);
            if (cfg.katsuo > 0) this._buildKatsuo(rng);

            this.root.scaling.setAll(this.scale);
            // 個体差は向きと傾きで出す。ソースを上に保ちたいので傾きは控えめ
            this.spin = rng.range(0, TAU);
            this.tilt = rng.range(0, cfg.packTilt);
            this.tiltDir = rng.range(0, TAU);
        }

        // ---- 青のり ----------------------------------------------------
        // 【対策】テクスチャに緑の点を描いてはいけない。1mm の粒は
        //         ミップマップで溶けて「緑がかった靄」になる。
        //         粉を「ふりかけた」ように見せられるのは実体のかけらだけ
        _buildAonori(rng) {
            const cfg = this.cfg, sh = this.shape;
            const n = cfg.aonori;
            const pos = [], idx = [], col = [];
            // 塊で降るので、まず種を撒いてその周りに散らす
            const clusters = [];
            const NC = Math.max(3, Math.round(n / 26));
            for (let c = 0; c < NC; c++) {
                let d;
                for (let k = 0; k < 24; k++) {
                    const y = rng.range(cfg.sauce ? 0.18 : -0.35, 0.98);
                    const ph = rng.range(0, TAU), s = Math.sqrt(Math.max(0, 1 - y * y));
                    d = { x: s * Math.cos(ph), y: y, z: s * Math.sin(ph) };
                    if (!cfg.sauce || sh.onSauce(d) > 0.05) break;
                }
                clusters.push(d);
            }
            let placed = 0, guard = 0;
            while (placed < n && guard++ < n * 8) {
                const c = clusters[rng.int(clusters.length)];
                // 種の周りへ角度で散らす
                const sp = rng.range(0, 0.55);
                const fr = frameFor(c.x, c.y, c.z);
                const a = rng.range(0, TAU);
                const ca = Math.cos(sp), sa = Math.sin(sp) * (0.6 + 0.4 * rng.next());
                let dx = c.x * ca + (fr.ux * Math.cos(a) + fr.vx * Math.sin(a)) * sa;
                let dy = c.y * ca + (fr.uy * Math.cos(a) + fr.vy * Math.sin(a)) * sa;
                let dz = c.z * ca + (fr.uz * Math.cos(a) + fr.vz * Math.sin(a)) * sa;
                const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
                const d = { x: dx, y: dy, z: dz };
                // 側面より下には残らない（振りかけた粉は落ちる）
                if (d.y < -0.42) continue;
                if (cfg.sauce && sh.onSauce(d) < 0.02 && rng.next() < 0.85) continue;
                const stick = cfg.sauce ? (0.25 + 0.75 * smooth(0.0, 0.25, sh.onSauce(d))) : 0.55;
                if (rng.next() > stick) continue;

                const r = sh.surfaceAt(d) + 0.004;
                const px = d.x * r, py = d.y * r, pz = d.z * r;
                const fr2 = frameFor(d.x, d.y, d.z);
                const rot = rng.range(0, TAU), cr = Math.cos(rot), sr = Math.sin(rot);
                // 接平面の直交基底を回す
                const ex = fr2.ux * cr + fr2.vx * sr, ey = fr2.uy * cr + fr2.vy * sr, ez = fr2.uz * cr + fr2.vz * sr;
                const gx = -fr2.ux * sr + fr2.vx * cr, gy = -fr2.uy * sr + fr2.vy * cr, gz = -fr2.uz * sr + fr2.vz * cr;
                // 【対策】粒がそろっていると振りかけた粉に見えない。
                //         実物は大小の差が大きく、ちぎれた薄片が混ざる
                const sz = cfg.aonoriSize * rng.range(0.35, 2.0);
                const asp = rng.range(0.35, 1.0);
                // 少し反った不定形の四角。平らな板だと全部が同時に光る
                const base = pos.length / 3;
                const K = 5;
                const g = [
                    [-0.5, -0.5 * asp, 0.0], [0.5, -0.42 * asp, 0.14],
                    [0.42, 0.5 * asp, 0.0], [-0.46, 0.44 * asp, 0.12],
                    [0.0, 0.0, -0.10]
                ];
                // 【対策】彩度の高い緑にすると製菓用のスプリンクルになる。
                //         乾いた青のりは黒に寄ったくすんだ緑で、
                //         明るく見えるのは光を透かした縁だけ
                const cg = [srgb(mix(0.085, 0.215, rng.next())),
                            srgb(mix(0.155, 0.320, rng.next())),
                            srgb(mix(0.050, 0.135, rng.next()))];
                for (let k = 0; k < K; k++) {
                    const a0 = g[k][0] * sz, b0 = g[k][1] * sz, c0 = g[k][2] * sz;
                    pos.push(px + ex * a0 + gx * b0 + d.x * c0,
                             py + ey * a0 + gy * b0 + d.y * c0,
                             pz + ez * a0 + gz * b0 + d.z * c0);
                    col.push(cg[0], cg[1], cg[2], 1);
                }
                // 中心 (base+4) を要にした扇
                idx.push(base + 4, base + 0, base + 1);
                idx.push(base + 4, base + 1, base + 2);
                idx.push(base + 4, base + 2, base + 3);
                idx.push(base + 4, base + 3, base + 0);
                placed++;
            }
            if (placed === 0) return;
            const positions = new Float32Array(pos);
            const normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, idx, normals);
            const mesh = makeMesh("aonori", positions, idx, normals, null,
                new Float32Array(col), this.scene);
            mesh.material = this.tmpl.skin.aonori;
            mesh.parent = this.root;
            this.parts.push(mesh); this.owned.push(mesh);
            this.aonoriMesh = mesh;
        }

        // ---- マヨネーズ ------------------------------------------------
        _buildMayo(rng) {
            const sh = this.shape;
            const R = sh.R;
            const a0 = rng.range(0, TAU), ca = Math.cos(a0), sa = Math.sin(a0);
            const span = R * rng.range(0.62, 0.80);
            const amp = R * rng.range(0.30, 0.42);
            const zig = 3 + rng.int(2);
            const NP = 120, MS = 10;
            const pts = [], rad = [];
            for (let i = 0; i < NP; i++) {
                const t = i / (NP - 1);
                const s = (t * 2 - 1) * span;
                // 三角波のジグザグ
                const q = t * zig;
                const tri = 2 * Math.abs(q - Math.round(q)) - 0.5;
                const w = tri * 2 * amp;
                let lx = s * ca - w * sa, lz = s * sa + w * ca;
                const hh = Math.sqrt(Math.max(0.02, R * R - lx * lx - lz * lz));
                let dx = lx, dy = hh, dz = lz;
                const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
                const rr = sh.surfaceAt({ x: dx, y: dy, z: dz });
                pts.push(new V3(dx * rr, dy * rr, dz * rr));
                // 端は細く、途中は太い。均一な太さだと針金になる
                rad.push(0.085 * (0.35 + 0.65 * Math.sin(Math.PI * clamp(t, 0, 1))));
            }
            const mesh = this._tube("mayo", pts, rad, MS);
            if (!mesh) return;
            mesh.material = this.tmpl.skin.mayo;
            mesh.parent = this.root;
            this.parts.push(mesh); this.owned.push(mesh);
            this.mayoMesh = mesh;
        }

        _tube(name, pts, rad, MS) {
            const N = pts.length;
            if (N < 3) return null;
            const total = N * (MS + 1) + 2;
            const positions = new Float32Array(total * 3);
            let prevN = null;
            for (let i = 0; i < N; i++) {
                const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N - 1, i + 1)];
                let tx = b.x - a.x, ty = b.y - a.y, tz = b.z - a.z;
                const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
                let ux, uy, uz;
                if (prevN) {
                    // 前の断面の法線を輸送する。毎回 up から作ると断面がねじれる
                    const dp = prevN.x * tx + prevN.y * ty + prevN.z * tz;
                    ux = prevN.x - tx * dp; uy = prevN.y - ty * dp; uz = prevN.z - tz * dp;
                } else {
                    ux = 0; uy = 1; uz = 0;
                    const dp = uy * ty;
                    ux -= tx * dp; uy -= ty * dp; uz -= tz * dp;
                    if (Math.hypot(ux, uy, uz) < 1e-4) { ux = 1; uy = 0; uz = 0; }
                }
                let ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
                prevN = { x: ux, y: uy, z: uz };
                const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
                for (let j = 0; j <= MS; j++) {
                    const ph = (j % MS) / MS * TAU, c = Math.cos(ph), s = Math.sin(ph);
                    const k = i * (MS + 1) + j, r = rad[i];
                    positions[k * 3] = pts[i].x + (ux * c + vx * s) * r;
                    positions[k * 3 + 1] = pts[i].y + (uy * c + vy * s) * r;
                    positions[k * 3 + 2] = pts[i].z + (uz * c + vz * s) * r;
                }
            }
            const capA = N * (MS + 1), capB = capA + 1;
            positions[capA * 3] = pts[0].x; positions[capA * 3 + 1] = pts[0].y; positions[capA * 3 + 2] = pts[0].z;
            positions[capB * 3] = pts[N - 1].x; positions[capB * 3 + 1] = pts[N - 1].y; positions[capB * 3 + 2] = pts[N - 1].z;
            const indices = [];
            const W = MS + 1;
            for (let i = 0; i < N - 1; i++) for (let j = 0; j < MS; j++) {
                const A = i * W + j, B = A + 1, C = A + W, D = C + 1;
                indices.push(A, C, B, B, C, D);
            }
            for (let j = 0; j < MS; j++) indices.push(capA, j, j + 1);
            const o = (N - 1) * W;
            for (let j = 0; j < MS; j++) indices.push(capB, o + j + 1, o + j);
            const refI = Math.floor(N / 2) * W;
            const normals = finalize(positions, indices, pts[Math.floor(N / 2)], refI);
            weldNormals(positions, normals);
            return makeMesh(name, positions, indices, normals, null, null, this.scene);
        }

        // ---- かつお節 --------------------------------------------------
        // 【対策】平らな板を寝かせると木くずになる。削り節は必ず curl して
        //         いて、片端が浮き、湯気で揺れる。浮いた端が影を落として
        //         初めて「ふわっと乗っている」ように見える
        _buildKatsuo(rng) {
            const sh = this.shape;
            const pos = [], idx = [];
            const NL = 12, NW = 5;
            for (let k = 0; k < this.cfg.katsuo; k++) {
                let d;
                for (let g = 0; g < 20; g++) {
                    const y = rng.range(0.25, 0.95);
                    const ph = rng.range(0, TAU), s = Math.sqrt(Math.max(0, 1 - y * y));
                    d = { x: s * Math.cos(ph), y: y, z: s * Math.sin(ph) };
                    if (sh.onSauce(d) > 0.15 || !this.cfg.sauce) break;
                }
                const r0 = sh.surfaceAt(d) + 0.01;
                const org = new V3(d.x * r0, d.y * r0, d.z * r0);
                const fr = frameFor(d.x, d.y, d.z);
                const a = rng.range(0, TAU), ca = Math.cos(a), sa = Math.sin(a);
                const tx = fr.ux * ca + fr.vx * sa, ty = fr.uy * ca + fr.vy * sa, tz = fr.uz * ca + fr.vz * sa;
                const bx = -fr.ux * sa + fr.vx * ca, by = -fr.uy * sa + fr.vy * ca, bz = -fr.uz * sa + fr.vz * ca;
                const L = rng.range(1.5, 2.6), W = rng.range(0.38, 0.62);
                const curl = rng.range(1.6, 3.4), lift = rng.range(0.35, 0.85);
                const base = pos.length / 3;
                for (let i = 0; i <= NL; i++) {
                    const t = i / NL;
                    // 反り返り：進むほど持ち上がって手前へ巻き込む
                    const ang = t * curl;
                    const along = L * Math.sin(ang) / Math.max(0.6, curl) * 1.4;
                    const up = lift * L * (1 - Math.cos(ang)) / Math.max(0.6, curl) * 0.8;
                    for (let j = 0; j <= NW; j++) {
                        const w = (j / NW - 0.5) * W * (1 - 0.25 * t);
                        // 幅方向にもわずかに丸まる
                        const cup = 0.30 * W * Math.pow(j / NW - 0.5, 2) * 4;
                        pos.push(org.x + tx * along + bx * w + d.x * (up + cup),
                                 org.y + ty * along + by * w + d.y * (up + cup),
                                 org.z + tz * along + bz * w + d.z * (up + cup));
                    }
                }
                for (let i = 0; i < NL; i++) for (let j = 0; j < NW; j++) {
                    const A = base + i * (NW + 1) + j, B = A + 1, C = A + NW + 1, D = C + 1;
                    idx.push(A, C, B, B, C, D);
                }
            }
            if (pos.length === 0) return;
            const positions = new Float32Array(pos);
            const normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, idx, normals);
            const mesh = makeMesh("katsuo", positions, idx, normals, null, null, this.scene);
            mesh.material = this.tmpl.skin.katsuo;
            mesh.parent = this.root;
            this.parts.push(mesh); this.owned.push(mesh);
            this.katsuoMesh = mesh;
        }

        // 【対策】剛体を付けたまま座標を書き換えると、Havok の同期は
        //         剛体 → ノードの一方向なので次のステップで元へ戻される。
        //         disablePreStep をいじって前方同期する手もあるが、
        //         「毎回そこで剛体を作り直す」ほうが状態を持たずに済む。
        //         剛体は必ずノードの座標を決めたあとに生成する
        place(x, y, z) {
            this.node.position.set(x, y, z);
            const q1 = BABYLON.Quaternion.RotationAxis(V3.Up(), this.spin);
            const ax = new V3(Math.cos(this.tiltDir), 0, Math.sin(this.tiltDir));
            const q2 = BABYLON.Quaternion.RotationAxis(ax, this.tilt);
            this.root.rotationQuaternion = q2.multiply(q1);
        }

        attachPhysics() {
            if (this.agg) return;
            this.node.computeWorldMatrix(true);
            const G = this.cfg;
            this.agg = new BABYLON.PhysicsAggregate(this.node,
                BABYLON.PhysicsShapeType.SPHERE,
                {
                    mass: G.ballMass,
                    // 【対策】メッシュは凸凹しているので、外接球で当てると
                    //         隙間だらけに見える。名目半径よりわずかに小さく取り、
                    //         見た目上は少しだけ食い込ませる
                    radius: this.R * 0.975,
                    center: V3.Zero(),
                    friction: G.ballFriction,
                    restitution: 0.0
                }, this.scene);
            // 【対策】ほぼ球なので回転を許すと転がって、ソースが横や下を向く。
            //         慣性テンソルを 0 にして並進だけ解かせる。
            //         「高い所から落とさない」のと同じくらい、これが効く
            this.agg.body.setMassProperties({ mass: G.ballMass, inertia: V3.Zero() });
            this.agg.body.setLinearDamping(G.ballDamping);
            this.agg.body.setAngularDamping(50);
        }

        // 剛体が最後に書き込んだ座標はノードに残るので、捨てても動かない
        detachPhysics() {
            if (!this.agg) return;
            this.agg.dispose();
            this.agg = null;
        }

        setPart(which, on) {
            const m = which === "aonori" ? this.aonoriMesh
                : which === "mayo" ? this.mayoMesh : this.katsuoMesh;
            if (m) m.setEnabled(on);
        }

        dispose() {
            this.detachPhysics();
            for (const m of this.owned) m.dispose();
            this.owned.length = 0;
            this.parts.length = 0;
            if (this.node) this.node.dispose();
        }
    }

    // =================================================================
    // 8. Tray （経木の舟皿）
    // =================================================================
    function trayRho(phi) {
        const ca = Math.abs(Math.cos(phi)), sa = Math.abs(Math.sin(phi)), n = GLOBAL.trayExp;
        return Math.pow(Math.pow(ca / GLOBAL.trayA, n) + Math.pow(sa / GLOBAL.trayB, n), -1 / n);
    }
    function trayH(phi) {
        const c = Math.abs(Math.cos(phi));
        return GLOBAL.trayHSide + (GLOBAL.trayHEnd - GLOBAL.trayHSide) * Math.pow(c, 3);
    }
    function trayProf(phi, s) {
        const t = clamp((s - GLOBAL.trayFlat) / (1 - GLOBAL.trayFlat), 0, 1);
        return [trayRho(phi) * s, trayH(phi) * Math.pow(t, 1.5)];
    }
    // (x, z) における内面の高さ（メッシュを持ち上げたぶんを含む）
    function trayFloorY(x, z) {
        const d = Math.hypot(x, z);
        if (d < 1e-5) return GLOBAL.trayThick;
        const phi = Math.atan2(z, x);
        const s = d / trayRho(phi);
        // 【対策】縁の外を「縁の2倍の高さ」で塞ぐと、接地判定が
        //         そこを拾った玉を 8cm も持ち上げて宙に浮かせる。
        //         外側は縁の高さで頭打ちにする
        if (s > 1) return GLOBAL.trayThick + trayH(phi);
        return GLOBAL.trayThick + trayProf(phi, s)[1];
    }

    // 【対策】薄い一枚板だと物理も陰も破綻する。内面と外面を張って
    //         縁で閉じた「厚みのある器」にしておくと、縁の断面が見えて
    //         経木らしくなる（本物は 0.5〜1mm の薄板）
    function buildTray(scene, tex) {
        const M = GLOBAL.traySegs, K = GLOBAL.trayRings, TH = GLOBAL.trayThick;
        const W = M + 1, LAY = (K + 1) * W, total = LAY * 2;
        const positions = new Float32Array(total * 3);
        const uvs = new Float32Array(total * 2);
        const US = 1 / (GLOBAL.trayA * 2.4), VS = 1 / (GLOBAL.trayB * 2.4);
        for (let i = 0; i <= K; i++) {
            const s = i / K;
            for (let j = 0; j <= M; j++) {
                const phi = (j % M) / M * TAU;
                const pr = trayProf(phi, s);
                const e = 2e-3;
                const pa = trayProf(phi, Math.max(0, s - e)), pb = trayProf(phi, Math.min(1, s + e));
                const dr = pb[0] - pa[0], dy = pb[1] - pa[1];
                const nl = Math.hypot(dr, dy) || 1;
                const nr = -dy / nl, ny = dr / nl;
                const cs = Math.cos(phi), sn = Math.sin(phi);
                const a = i * W + j, b = LAY + a;
                positions[a * 3] = pr[0] * cs; positions[a * 3 + 1] = pr[1]; positions[a * 3 + 2] = pr[0] * sn;
                const ro = pr[0] - nr * TH, yo = pr[1] - ny * TH;
                positions[b * 3] = ro * cs; positions[b * 3 + 1] = yo; positions[b * 3 + 2] = ro * sn;
                // 木目を長手（X）に走らせたいので、UV は XZ の平面投影
                uvs[a * 2] = pr[0] * cs * US + 0.5; uvs[a * 2 + 1] = pr[0] * sn * VS + 0.5;
                uvs[b * 2] = ro * cs * US + 0.5; uvs[b * 2 + 1] = ro * sn * VS + 0.5;
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
        const refI = Math.round(K * 0.85);
        const normals = finalize(positions, indices, new V3(0, GLOBAL.trayHSide * 0.35, 0), LAY + refI * W);
        weldNormals(positions, normals);
        const mesh = makeMesh("tray", positions, indices, normals, uvs, null, scene);
        // 【対策】内面 y=0 から下へ厚み TH で作ってあるので、そのまま置くと
        //         内面が机（y=0）と同一平面になり底一面が Z ファイティングする
        mesh.position.y = GLOBAL.trayThick;

        const m = new BABYLON.PBRMaterial("trayMat", scene);
        m.albedoTexture = tex.albedo;
        m.metallicTexture = tex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = tex.normal;
        // 【対策】年輪を凹凸として立てると、経木ではなく波板になる。
        //         薄く削いだ板の表面はほとんど平ら
        m.bumpTexture.level = 0.35;
        m.metallic = 0.0; m.roughness = 1.0;
        m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
        m.backFaceCulling = false;
        m.twoSidedLighting = true;
        // 経木は薄いので光を透かす。縁が明るく光るのはこのせい
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = 0.28;
        m.subSurface.tintColor = new C3(0.95, 0.82, 0.62);
        m.subSurface.minimumThickness = 0.05;
        m.subSurface.maximumThickness = 0.30;
        mesh.material = m;
        mesh.receiveShadows = true;
        return mesh;
    }

    // ---- 詰め方（決定論的な緩和）---------------------------------------
    // 【対策】ほぼ球なので Havok で落とすと転がって、ソースが横や下を向く。
    //         この食べ物は上下が意味を持つので、重なりの解消と高さ場への
    //         着地だけを解いて、傾きは 15°までに抑える
    function packBalls(items, seed) {
        const rng = new Rng(seed >>> 0);
        const n = items.length;
        const P = [];
        // 【対策】舟に入る数を無視して 2 列に並べると、12個では長辺が
        //         舟から 2cm はみ出す。あふれたぶんが縁へ押し戻されて
        //         壁を駆け上がり、宙に浮いた玉ができる。
        //         舟底に何個置けるかを先に数えて、入らないぶんは
        //         最初から上の段に置く
        const R0 = items[0].R;
        const pitch = R0 * 2 * GLOBAL.packPitch;
        const colsMax = Math.max(2, Math.floor(GLOBAL.trayA * 2 * 0.80 / pitch));
        let placed = 0, layer = 0;
        while (placed < n) {
            const cap = layer === 0 ? colsMax * 2 : Math.max(2, (colsMax - 1) * 2);
            const cnt = Math.min(n - placed, cap);
            const cols = Math.ceil(cnt / 2);
            for (let k = 0; k < cnt; k++) {
                const idx = placed + k;
                const row = k % 2, col = (k / 2) | 0;
                const x = (col - (cols - 1) / 2) * pitch + (row - 0.5) * pitch * 0.22
                    + (layer % 2) * pitch * 0.5 + rng.gauss(0, 0.16);
                const z = (row - 0.5) * pitch * 0.95 + rng.gauss(0, 0.16);
                const r = items[idx].R;
                P.push({ x: x, z: z, y: trayFloorY(x, z) + r + layer * r * 1.62, r: r, on: -1 });
            }
            placed += cnt; layer++;
        }
        // 器の高さ場に球を載せたときの中心高さ。中心と半径 0.72 の
        // 円周を数点見て、いちばん高い接触点を採る
        const floorSupport = (p) => {
            let best = trayFloorY(p.x, p.z) + p.r;
            const dd = p.r * 0.72, lift = Math.sqrt(Math.max(0, p.r * p.r - dd * dd));
            for (let k = 0; k < 8; k++) {
                const a = k / 8 * TAU;
                const y = trayFloorY(p.x + Math.cos(a) * dd, p.z + Math.sin(a) * dd) + lift;
                if (y > best) best = y;
            }
            return best;
        };
        const order = new Array(n);
        // 低いものから順に落とし、自分より下で確定済みの玉だけを支えにする
        const settleOnce = (dy) => {
            for (let i = 0; i < n; i++) order[i] = i;
            order.sort((u, v) => P[u].y - P[v].y);
            for (let k = 0; k < n; k++) {
                const p = P[order[k]];
                p.y -= dy;
                let sy = floorSupport(p);
                p.on = -1;
                for (let m = 0; m < k; m++) {
                    const q = P[order[m]];
                    const dx = p.x - q.x, dz = p.z - q.z;
                    const dh = Math.hypot(dx, dz), sr = p.r + q.r;
                    if (dh >= sr) continue;
                    const y = q.y + Math.sqrt(sr * sr - dh * dh);
                    if (y > sy) { sy = y; p.on = order[m]; }
                }
                if (p.y < sy) p.y = sy;
            }
        };
        for (let it = 0; it < GLOBAL.packIter; it++) {
            // 1) 重なりを水平に押しのける
            for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
                const a = P[i], b = P[j];
                const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
                const d3 = Math.hypot(dx, dy, dz), sr = a.r + b.r;
                if (d3 >= sr || d3 < 1e-6) continue;
                const push = (sr - d3) * 0.34;
                // 【対策】3次元でまっすぐ押し返すと、上の玉が滑り落ちて
                //         平面に散らばる。水平成分を強めて「詰まる」ようにする
                let ux = dx / d3, uy = dy / d3 * 0.35, uz = dz / d3;
                const ul = Math.hypot(ux, uy, uz) || 1;
                ux /= ul; uy /= ul; uz /= ul;
                a.x -= ux * push; a.y -= uy * push; a.z -= uz * push;
                b.x += ux * push; b.y += uy * push; b.z += uz * push;
            }
            // 2) 器の外へ出たら戻す
            for (const p of P) {
                const phi = Math.atan2(p.z, p.x);
                const lim = trayRho(phi) * 0.94 - p.r * 0.55;
                const d = Math.hypot(p.x, p.z);
                if (d > lim && d > 1e-6) {
                    const k = lim / d;
                    p.x *= k; p.z *= k;
                }
            }
            // 2.5) 舟の斜面に乗り上げた玉は下へ滑る
            // 【対策】高さ場への着地は真上へしか押し返さないので、
            //         壁に寄った玉が斜面の途中や縁の上で止まったまま、
            //         床からも他の玉からも 1cm 近く浮いて見える。
            //         勾配に沿って下りる項が要る（実物なら必ず滑り落ちる）
            for (const p of P) {
                const e = 0.25;
                const gx = (trayFloorY(p.x + e, p.z) - trayFloorY(p.x - e, p.z)) / (2 * e);
                const gz = (trayFloorY(p.x, p.z + e) - trayFloorY(p.x, p.z - e)) / (2 * e);
                p.x -= gx * GLOBAL.packWallSlide;
                p.z -= gz * GLOBAL.packWallSlide;
            }
            // 3) 低いものから順に落として、すでに確定した「下の玉」に載せる
            settleOnce(0.22);
            // 4) 玉の上に乗った玉は滑り落ちる
            // 【対策】これが無いと、重なりが解けるまで上へ積み上がるだけで
            //         4段の塔になる。実物は横へ逃げて2段までに収まる
            for (let k = 0; k < n; k++) {
                const p = P[order[k]];
                if (p.on < 0) continue;
                const q = P[p.on];
                let dx = p.x - q.x, dz = p.z - q.z;
                let dh = Math.hypot(dx, dz);
                if (dh < 1e-4) { const a = rng.range(0, TAU); dx = Math.cos(a); dz = Math.sin(a); dh = 1; }
                const slide = GLOBAL.packSlide * Math.max(0, p.y - q.y);
                p.x += dx / dh * slide; p.z += dz / dh * slide;
            }
        }
        // 【対策】最後に走るのが「横へ滑らせる」処理なので、そのままだと
        //         支えの真上から外れた玉が宙に残ったまま終わる。
        //         滑らせない着地だけを数回まわして締める
        for (let k = 0; k < 8; k++) settleOnce(1.0);

        for (let i = 0; i < n; i++) items[i].place(P[i].x, P[i].y, P[i].z);
        return P;
    }

    // =================================================================
    // 9. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.92, 0.90, 0.87, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.70;
    scene.environmentIntensity = 0.62;

    // ---- 物理エンジン（読めなければ決定論的な配置で続行）----------------
    let hkPlugin = null;
    if (GLOBAL.usePhysics) {
        try {
            if (typeof HavokPhysics === "function") {
                const havok = await HavokPhysics();
                hkPlugin = new BABYLON.HavokPlugin(true, havok);
                scene.enablePhysics(new V3(0, -GLOBAL.gravity, 0), hkPlugin);
            }
        } catch (err) {
            console.warn("[Tako] Havok を初期化できませんでした。決定論的な配置で続けます", err);
            hkPlugin = null;
        }
    }

    const camera = new BABYLON.ArcRotateCamera("cam", -1.18, 1.02, 46, new V3(0, 2.4, 0), scene);
    camera.attachControl(true);
    camera.fov = 0.52;
    camera.wheelPrecision = 8;
    // 【対策】ポストプロセスを有効にするとシーンは 16bit 深度の RT へ描かれる。
    //         minZ を 0.1 のままにすると分解能が mm 台になり、
    //         ソースと生地のように 0.1mm しか離れていない面が勝ったり負けたりする
    camera.minZ = 6;
    camera.maxZ = 300;
    camera.lowerRadiusLimit = 14;
    camera.upperRadiusLimit = 150;
    camera.lowerBetaLimit = 0.05;
    camera.upperBetaLimit = 1.50;
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.42, -0.90, 0.62).normalize(), scene);
    key.position = new V3(22, 36, -26);
    key.intensity = 2.6;
    key.diffuse = new C3(1.0, 0.975, 0.93);
    key.specular = new C3(0.55, 0.53, 0.50);
    key.autoCalcShadowZBounds = true;

    const fillL = new BABYLON.DirectionalLight("fillL", new V3(0.88, -0.38, -0.52).normalize(), scene);
    fillL.intensity = 0.95;
    fillL.diffuse = new C3(0.97, 0.965, 1.0);
    fillL.specular = new C3(0.16, 0.16, 0.16);

    // 【対策】ソースの艶は「細長い窓の映り込み」で読ませたい。
    //         点光源の丸いハイライトだけだと飴玉に見える
    const rim = new BABYLON.DirectionalLight("rim", new V3(0.10, -0.55, 0.83).normalize(), scene);
    rim.intensity = 0.55;
    rim.diffuse = new C3(1.0, 0.95, 0.88);
    rim.specular = new C3(0.9, 0.86, 0.80);

    const amb = new BABYLON.HemisphericLight("amb", new V3(0, 1, 0), scene);
    amb.intensity = 0.50;
    amb.diffuse = new C3(1, 1, 1);
    // 【対策】下からの戻り光を暖色にすると画面全体がセピアにかぶる。
    //         実物の写真はほぼニュートラル
    amb.groundColor = new C3(0.72, 0.70, 0.67);
    amb.specular = new C3(0, 0, 0);

    // 【対策】指数シャドウマップは深度を指数で近似するので、ぼかすと影が
    //         キャスター自身の明るい面へにじむ。丸い物体では楕円の暗い領域に
    //         なって焦げ目と見分けがつかない。PCF なら原理的に起きない
    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0006;
    sg.normalBias = 0.02;
    sg.darkness = 0.30;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    // 【対策】1.08 では経木の白がすぐ飛んで、陶器の皿に見える
    ip.exposure = 1.00;
    ip.contrast = 1.10;
    ip.vignetteEnabled = false;

    // 板の間
    const tableTex = TextureLab.woodSet(scene, GLOBAL.woodSize, 9001, {
        name: "table", base: [0.855, 0.663, 0.463], grain: [0.702, 0.478, 0.294],
        dark: [0.541, 0.345, 0.196],
        rings: 13, wave: 1.5, sharp: 2.4, knot: 0.45, planks: 3,
        rough: 0.66, bump: 2.2
    });
    let table = null;
    if (GLOBAL.showTable) {
        table = BABYLON.MeshBuilder.CreateBox("table", { width: 140, height: 3, depth: 140 }, scene);
        const tm = new BABYLON.PBRMaterial("tableMat", scene);
        tm.albedoTexture = tableTex.albedo;
        tm.metallicTexture = tableTex.orm;
        tm.useAmbientOcclusionFromMetallicTextureRed = true;
        tm.useRoughnessFromMetallicTextureGreen = true;
        tm.useMetallnessFromMetallicTextureBlue = true;
        tm.bumpTexture = tableTex.normal;
        tm.bumpTexture.level = 0.5;
        tm.metallic = 0.0; tm.roughness = 1.0;
        tm.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
        for (const t of [tableTex.albedo, tableTex.orm, tableTex.normal]) {
            t.uScale = 1.0; t.vScale = 1.0;
        }
        table.material = tm;
        table.receiveShadows = true;
        table.position.y = -1.52;   // 天板が y = -0.02。舟皿の外底との隙間 0.2mm
    }

    // 【対策】経木は舟皿ぶんしか映らないので 512 で足りる。
    //         平面投影で 30cm を覆って 0.6mm/テクセル、木目の細さに見合う
    const trayTex = TextureLab.woodSet(scene, GLOBAL.trayTexSize, 3301, {
        name: "kyogi", base: [0.925, 0.855, 0.694], grain: [0.812, 0.706, 0.522],
        dark: [0.667, 0.541, 0.373],
        rings: 7, wave: 0.7, sharp: 5.5, knot: 0.18, planks: 0,
        rough: 0.72, bump: 0.45
    });
    const tray = buildTray(scene, trayTex);

    if (hkPlugin) {
        // 【対策】舟は曲面の器なので、箱や凸包では底が平らにならず
        //         玉が縁で止まってしまう。三角形メッシュで当てる。
        //         内外2層の閉じた殻にしてあるので、そのまま形状に使える
        new BABYLON.PhysicsAggregate(tray, BABYLON.PhysicsShapeType.MESH,
            { mass: 0, friction: 0.80, restitution: 0.01 }, scene);
        if (table) {
            new BABYLON.PhysicsAggregate(table, BABYLON.PhysicsShapeType.BOX,
                { mass: 0, friction: 0.70, restitution: 0.01 }, scene);
        }
    }

    // =================================================================
    //  生成
    // =================================================================
    let settleUsed = 0;
    let items = [], templates = [], curPreset = START_PRESET, curSeed = START_SEED, curCfg = null;
    const skinCache = {};
    let onRebuilt = null;

    const BUMPS = [{ label: "弱", level: 0.55 }, { label: "中", level: 1.00 },
                   { label: "強", level: 1.55 }, { label: "最強", level: 2.20 }];
    let bumpIdx = 1, invY = false;
    function applyRelief() {
        for (const k in skinCache) skinCache[k].setBump(BUMPS[bumpIdx].level, invY);
    }
    const DEBUGS = ["通常", "白クレイ", "法線マップ"];
    let dbgIdx = 0;
    function applyDebug() { for (const k in skinCache) skinCache[k].setDebug(dbgIdx); }

    // 薬味の ON/OFF
    const parts = { aonori: true, mayo: true, katsuo: true };
    function applyParts() {
        for (const e of items) {
            e.setPart("aonori", parts.aonori);
            e.setPart("mayo", parts.mayo);
            e.setPart("katsuo", parts.katsuo);
        }
    }

    // 診断ライト。法線の向きを目で判定するため、ほぼ真横から当てる
    const DIAGS = ["OFF", "X方向", "Z方向"];
    let diagIdx = 0;
    const LIGHT0 = {
        dir: key.direction.clone(), keyI: key.intensity, fillI: fillL.intensity,
        rimI: rim.intensity, ambI: amb.intensity, envI: scene.environmentIntensity
    };
    function applyDiag() {
        if (diagIdx === 0) {
            key.direction = LIGHT0.dir.clone();
            key.intensity = LIGHT0.keyI; fillL.intensity = LIGHT0.fillI;
            rim.intensity = LIGHT0.rimI; amb.intensity = LIGHT0.ambI;
            scene.environmentIntensity = LIGHT0.envI;
            return;
        }
        const a = (diagIdx === 1) ? 0 : Math.PI / 2;
        key.direction = new V3(-Math.cos(a) * 0.98, -0.21, -Math.sin(a) * 0.98).normalize();
        key.intensity = 3.2;
        fillL.intensity = 0.0; rim.intensity = 0.0; amb.intensity = 0.10;
        scene.environmentIntensity = 0.06;
    }

    // 【対策】テクスチャはプリセットだけで決まる。個体差で焼き直すと
    //         GUI を触るたびに 1024² を3枚焼き直して数秒固まる
    function getSkin(cfg, shapes) {
        let s = skinCache[cfg.preset];
        if (!s) { s = new Skin(scene, cfg, shapes); skinCache[cfg.preset] = s; }
        return s;
    }

    // 表示する前に進めて静止させ、落ち着いたら剛体を捨てる。
    // Havok の内部ステップを直に叩くので、失敗しても描画は続けられるよう包む
    function settlePhysics() {
        const eng = scene.getPhysicsEngine();
        if (eng) {
            const v = new V3(0, 0, 0);
            try {
                for (let i = 0; i < GLOBAL.settleSteps; i++) {
                    eng._step(1 / 120);
                    // 8ステップに1回だけ速度を見て、止まったら打ち切る
                    if ((i & 7) === 7) {
                        let mx = 0;
                        for (const e of items) {
                            if (!e.agg) continue;
                            e.agg.body.getLinearVelocityToRef(v);
                            const sp = Math.hypot(v.x, v.y, v.z);
                            if (sp > mx) mx = sp;
                        }
                        settleUsed = i + 1;
                        if (mx < GLOBAL.settleVel) break;
                    }
                }
            } catch (err) {
                console.warn("[Tako] 物理のステップに失敗しました。緩和の結果をそのまま使います", err);
            }
        }
        // 【対策】ここで剛体を捨てる。静物なのに剛体を残しておくと、
        //         接触が多い配置（12個の二段など）では微小な貫入と押し返しが
        //         釣り合わず、いつまでもプルプル震え続ける。
        //         必要なのは「自然な配置」であって、続く運動ではない
        // 【注】このため Inspector の Physics Helper に玉の球形状は出ない。
        //       見たいときは GLOBAL.freezeAfterSettle を false にする
        if (GLOBAL.freezeAfterSettle) for (const e of items) e.detachPhysics();
    }

    function clearItems() {
        for (const e of items) e.dispose();
        for (const t of templates) t.dispose();
        items = []; templates = [];
    }

    function build(presetKey, seed) {
        clearItems();
        const cfg = buildConfig(presetKey, seed);
        curCfg = cfg;

        const shapes = [];
        for (let p = 0; p < cfg.patterns; p++) shapes.push(new Shape(cfg, p));
        const skin = getSkin(cfg, shapes);

        for (let p = 0; p < cfg.patterns; p++) templates.push(new Template(scene, cfg, shapes[p], skin));

        const used = new Array(cfg.patterns).fill(false);
        for (let i = 0; i < cfg.count; i++) {
            const p = i % cfg.patterns;
            const first = !used[p]; used[p] = true;
            items.push(new Takoyaki(scene, cfg, templates[p], (seed + i * 7919 + 3) >>> 0, first));
        }

        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        // 【対策】インスタンスをシャドウマップの描画リストへ個別に積んではいけない。
        //         Babylon は元メッシュを1つ登録すれば、その可視インスタンスを
        //         まとめて1回のインスタンス描画で焼く。個別に積むと二重に描かれる
        for (const t of templates) {
            sg.addShadowCaster(t.body, false);
            if (t.sauce) sg.addShadowCaster(t.sauce, false);
        }
        // 【対策】青のりは影を落とさせない。1mm の粒は 2048 のシャドウマップで
        //         1テクセルに満たず、影として出るのは点滅するノイズだけ。
        //         かつお節は逆に、浮いた端の影が「ふわっと乗っている」証拠になる
        for (const e of items) {
            for (const m of [e.mayoMesh, e.katsuoMesh]) if (m) sg.addShadowCaster(m, false);
        }
        sg.addShadowCaster(tray, false);

        packBalls(items, seed);
        // 【対策】剛体は「詰め方の緩和が出した、ほぼ静止した配置」から始める。
        //         高い所から落とすと、実物なら潰れる勢いでぶつかるうえ、
        //         跳ねて舟から出る。物理には最後の数ミリの接触だけ解かせる
        if (hkPlugin) {
            for (const e of items) e.attachPhysics();
            settlePhysics();
        }

        applyDebug();
        applyRelief();
        applyParts();

        camera.target.set(0, 2.4, 0);
        if (onRebuilt) onRebuilt();
        console.log("[Tako]", BUILD, "/", cfg.label, "/ seed =", cfg.seed, "/", cfg.count, "個");
    }

    build(START_PRESET, START_SEED);

    if (GLOBAL.useSSAO) {
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        // 【対策】玉どうしの隙間と、青のりの粒の際の両方を拾わせたい。
        //         半径を大きく取ると粒の際が消え、絞りすぎると玉の山が浮く
        ssao.radius = 1.05;
        ssao.totalStrength = 1.25;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 200;
        ssao.minZAspect = 0.3;
    }

    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    // 【対策】ソースの鏡面は簡単に飽和する。しきい値を下げると玉全体が
    //         にじんで湯気がかかったようになる
    dp.bloomThreshold = 0.96;
    // 【対策】0.09 だとソースのハイライトが白く溶け、
    //         濡れた照りではなく発光しているように見える
    dp.bloomWeight = 0.045;
    dp.bloomKernel = 44;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.20;
    // 【対策】Babylon の錯乱円は「シーン単位 × 1000 = mm」で計算される。
    //         focalLength を focusDistance の一定比率 K にすると focus が
    //         約分され、カメラを寄せても引いてもボケ量が変わらない
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
    //  GUI
    // =================================================================
    // 【対策】フルスクリーンGUIは既定でシーンと同じカメラで合成されるため、
    //         Bloom / 被写界深度 / シャープンが UI にも乗ってボケる。
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
        idle: "#2a1c12", active: "#8a4a1c", edge: "#4a3428",
        text: "#fbf1e4", sub: "#c9ae94", accent: "#f0b978"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "250px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(20,12,7,0.86)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "62px";
    ui.addControl(card);

    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "218px"; panel.isVertical = true;
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

    addLabel("TAKOYAKI", 11, COL.sub, "18px");
    addLabel("種類", 13, COL.accent, "22px");

    const presetBtns = {}, countBtns = {};
    function highlight() {
        for (const k in presetBtns) presetBtns[k].background = (k === curPreset) ? COL.active : COL.idle;
        for (const k in countBtns) countBtns[k].background = (+k === GLOBAL.count) ? COL.active : COL.idle;
    }
    for (const k of Object.keys(PRESETS)) {
        presetBtns[k] = addButton("p_" + k, PRESETS[k].label, () => {
            curPreset = k; build(curPreset, curSeed); highlight();
        });
    }

    addLabel("個数", 13, COL.accent, "26px");
    for (const c of [6, 8, 12]) {
        countBtns[c] = addButton("c" + c, c + " 個", () => {
            GLOBAL.count = c; build(curPreset, curSeed); highlight();
        });
    }

    const sp = new BABYLON.GUI.Rectangle();
    sp.height = "8px"; sp.thickness = 0; sp.background = "";
    panel.addControl(sp);

    addButton("repack", "詰め直す", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        packBalls(items, curSeed);
        if (hkPlugin) {
            for (const e of items) e.attachPhysics();
            settlePhysics();
        }
        if (onRebuilt) onRebuilt();
    });
    addButton("reseed", "別の個体を生成", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(curPreset, curSeed); highlight();
    });

    const aoBtn = addButton("ao", "青のり: ON", () => {
        parts.aonori = !parts.aonori; applyParts();
        aoBtn.background = parts.aonori ? COL.active : COL.idle;
        aoBtn.textBlock.text = "青のり: " + (parts.aonori ? "ON" : "OFF");
    });
    aoBtn.background = COL.active;
    const myBtn = addButton("my", "マヨ: ON", () => {
        parts.mayo = !parts.mayo; applyParts();
        myBtn.background = parts.mayo ? COL.active : COL.idle;
        myBtn.textBlock.text = "マヨ: " + (parts.mayo ? "ON" : "OFF");
    });
    myBtn.background = COL.active;
    const ktBtn = addButton("kt", "かつお節: ON", () => {
        parts.katsuo = !parts.katsuo; applyParts();
        ktBtn.background = parts.katsuo ? COL.active : COL.idle;
        ktBtn.textBlock.text = "かつお節: " + (parts.katsuo ? "ON" : "OFF");
    });
    ktBtn.background = COL.active;

    const dbgBtn = addButton("dbg", "表示: 通常", () => {
        dbgIdx = (dbgIdx + 1) % DEBUGS.length;
        applyDebug(); applyRelief();
        dbgBtn.background = dbgIdx ? COL.active : COL.idle;
        dbgBtn.textBlock.text = "表示: " + DEBUGS[dbgIdx];
    });
    const bumpBtn = addButton("bump", "凹凸: 中", () => {
        bumpIdx = (bumpIdx + 1) % BUMPS.length;
        applyRelief();
        bumpBtn.textBlock.text = "凹凸: " + BUMPS[bumpIdx].label;
    });
    const invBtn = addButton("inv", "凹凸の向き: 標準", () => {
        invY = !invY; applyRelief();
        invBtn.background = invY ? COL.active : COL.idle;
        invBtn.textBlock.text = "凹凸の向き: " + (invY ? "反転" : "標準");
    });
    let shadowOn = true;
    const shadowBtn = addButton("shadow", "影: ON", () => {
        shadowOn = !shadowOn;
        key.shadowEnabled = shadowOn;
        shadowBtn.background = shadowOn ? COL.active : COL.idle;
        shadowBtn.textBlock.text = "影: " + (shadowOn ? "ON" : "OFF");
    });
    shadowBtn.background = COL.active;
    const diagBtn = addButton("diag", "診断ライト: OFF", () => {
        diagIdx = (diagIdx + 1) % DIAGS.length;
        applyDiag();
        diagBtn.background = diagIdx ? COL.active : COL.idle;
        diagBtn.textBlock.text = "診断ライト: " + DIAGS[diagIdx];
    });
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        GLOBAL.useDOF = !GLOBAL.useDOF;
        dp.depthOfFieldEnabled = GLOBAL.useDOF;
        dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
        dofBtn.textBlock.text = "被写界深度: " + (GLOBAL.useDOF ? "ON" : "OFF");
    });
    dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
    const rotateBtn = addButton("rotate", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.07;
        rotateBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotateBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });

    const info = addLabel("", 12, COL.sub, "46px");
    onRebuilt = () => {
        if (!info || !curCfg) return;
        const e = items[0];
        if (!e) { info.text = ""; return; }
        info.text = items.length + "個 / 直径 " + (e.R * 2).toFixed(1) + "cm / "
            + (hkPlugin ? "物理 " + settleUsed + "step" : "緩和") + "\nseed: " + curSeed + "  [" + BUILD + "]";
    };
    onRebuilt();

    // ---- GUI の開閉（スマホでは初期状態で畳む）--------------------------
    // 【対策】Babylon.GUI のサイズ指定はレンダー解像度基準（≒ CSS px × DPR）。
    //         DPR 3 の端末では 34px のボタンが実質 11 CSS px になる。
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
    toggleBtn.background = "rgba(20,12,7,0.86)";
    toggleBtn.fontSize = 20;
    if (toggleBtn.textBlock) toggleBtn.textBlock.color = COL.text;
    toggleBtn.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    toggleBtn.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    toggleBtn.left = "16px"; toggleBtn.top = "16px";
    ui.addControl(toggleBtn);

    let panelOpen = !isCompact();
    function applyGuiLayout() {
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
        toggleBtn.background = panelOpen ? COL.active : "rgba(20,12,7,0.86)";
    }
    toggleBtn.onPointerUpObservable.add(() => { panelOpen = !panelOpen; applyGuiLayout(); });
    engine.onResizeObservable.add(applyGuiLayout);

    highlight();
    applyGuiLayout();

    return scene;
};

export default createScene;