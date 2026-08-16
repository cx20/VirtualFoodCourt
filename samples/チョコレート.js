// =====================================================================
//  Photoreal Chocolates  /  写実的なチョコレート      BUILD: choco-B
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  choco-A からの修正（Inspector のデバッグ表示）:
//    ・GUI 専用カメラ（layerMask 分離）の副作用で、Playground の Inspector の
//      デバッグ機能が壊れていた問題を修復。activeCameras を 2 台にすると、
//      Babylon の各機能が「activeCameras の末尾＝描画の基準カメラ」と
//      見なす所で全部 guiCam を拾ってしまう:
//        ・UtilityLayerRenderer → Physics Helper が何も出ない／ギズモがずれる
//        ・EffectLayer          → 選択ハイライトが全カメラパスで合成される
//        ・scene.activeCamera   → scene.pick() のレイが guiCam 基準になり、
//                                 Scene Explorer の Picker が当たらない
//      基準カメラを明示して 3 系統とも直した（「9. GUI」の bindDebugCamera）。
//      このシーンは自前でも PhysicsViewer を立てている（デバッグの
//      「当たり判定」ボタン）ので、そちらも同時に直る
//
//  構成:
//    0. CONFIG      … 種類プリセット（ダーク円盤 / ミルクドーム / トリュフ /
//                     角プラリネ / ホワイト雫 / ハート / 貝殻 / ナッツ）
//    1. Rng         … シード付き擬似乱数
//    2. Noise       … 2D値ノイズ / 周期ノイズ / セルノイズ
//    3. Mesh utils  … 巻き順の自動判定・法線の溶接・掃引
//    4. Shape       … 外形（スーパー楕円・ハート）× 縦断面（赤道式）
//    5. TextureLab  … 艶・ブルーム・ドリズル・櫛目・ココア掛け、スレート
//    6. Bonbon      … 1メッシュ＋トッピング
//    7. Board       … スレートの板
//    8. Scene / 物理（Havok で1粒ずつ落とす）
//    9. GUI
//   10. Debug       … 単体表示・外形/断面ガイド・法線・当たり判定
//
//  実物の要点（クッキーとは光学的にほぼ真逆）:
//    ・テンパリングされたチョコは「鏡」。型の面をそのまま写し取るので、
//      粗さは 0.10〜0.20 しかない。クッキーの感覚で 0.8 を入れると
//      一瞬で泥団子になる
//    ・艶の正体は素地の反射ではなくカカオバターの層。クリアコートで
//      層として乗せないと、粗さを下げても「濡れた石」にしかならない
//    ・薄い縁と稜線は透ける。特にミルクとホワイトは赤みを帯びた透過が
//      出る。これが無いとプラスチックの成形品になる
//    ・型抜きと手掛けは別物。型抜きは稜線が立ち、底が平らで、抜き勾配が
//      あり、底の縁に流れ出しのわずかな段が残る。手掛けは面が流れ、
//      底に裾（足）が広がり、天面にフォークの跡が残る
//    ・底面は型やシートに接していた面なので、天面より必ず鈍い。
//      ここを同じ艶にすると、どちらが上か分からない置物になる
//    ・ブルーム（白い粉ふき）はくぼみと底から出る。ごく薄く入れると
//      「本物っぽさ」が跳ね上がるが、入れすぎると古い在庫になる
//    ・ココア掛けのトリュフだけは例外で、粗さ 0.9 の完全なマット。
//      同じ材質設定を使い回すと、粉が乗っているように見えない
//
//  クッキー版との実装上の違い:
//    ・断面を「赤道」を境にした上下2本のスーパー楕円で作る。指数ひとつで
//      尖り（nUp<1）・ドーム（=2）・平天（>4）まで連続に振れるので、
//      雫も球も角プラリネも同じ関数で出せる
//    ・細かい起伏はほとんど無い。チョコは硝子質なので、法線マップに
//      生地の肌理を入れると一気に安っぽくなる。入れるのは櫛目・
//      ドリズル・ココアの粒・型の合わせ目だけ
// =====================================================================

var createScene = async function () {
    // =================================================================
    // 0. CONFIG （単位は cm）
    // =================================================================
    // 断面パラメータの意味:
    //   hEq   … 最大径（赤道）が来る高さ比。型抜きは底寄り(0.1)、球は中央(0.5)
    //   nUp   … 赤道より上の形。<1 で尖る、2 でドーム、>4 で平天
    //   nDn   … 赤道より下の形。2 で球、>6 で垂直の壁＋直角の底
    //   rBase … 接地面の半径比。型抜きはほぼ 1、球は小さい
    //   draft … 抜き勾配。上へ行くほど細くなる割合
    const TYPES = {
        // ---- ダークの円盤（型押しのリリーフ）--------------------------
        dark: {
            label: "ダーク円盤", countScale: 1.0,
            form: "super", radius: 1.58, aspect: 1.0, nExp: 2.0,
            scallopK: 0, scallopAmp: 0,
            height: 0.92, hEq: 0.13, nUp: 6.0, nDn: 7.0, rBase: 0.985, draft: 0.055,
            outlineJitter: 0.004, wobble: 0.0, foot: 0.0, twist: 0.0,
            fluteK: 0, fluteAmp: 0,
            comb: "rings", combPitch: 0.13, combDepth: 0.30, combRing: [0.72, 0.90],
            drizzle: 0, dust: 0, speckle: 0.0, bloom: 0.10, moldLip: 1.0,
            nuts: 0,
            base: [0.226, 0.130, 0.088], deep: [0.120, 0.062, 0.042],
            dzCol: [0.905, 0.845, 0.690], dustCol: [0.300, 0.196, 0.146],
            speckCol: [0.105, 0.060, 0.045],
            roughBase: 0.135, coat: 0.90, coatRough: 0.045, sss: 0.10
        },
        // ---- ミルクのドーム（手掛け）----------------------------------
        milk: {
            label: "ミルクドーム", countScale: 1.0,
            form: "super", radius: 1.50, aspect: 1.0, nExp: 2.0,
            scallopK: 0, scallopAmp: 0,
            height: 1.55, hEq: 0.34, nUp: 2.05, nDn: 2.45, rBase: 0.52, draft: 0.0,
            // 手掛けは表面が流れる。回転体のままだと工業製品に見える
            outlineJitter: 0.016, wobble: 0.030, foot: 0.10, twist: 0.0,
            fluteK: 0, fluteAmp: 0,
            comb: "none", combPitch: 0.2, combDepth: 0, combRing: [0.7, 0.9],
            drizzle: 0, dust: 0, speckle: 0.0, bloom: 0.08, moldLip: 0.0,
            forkMark: 1.0,
            nuts: 0,
            base: [0.418, 0.256, 0.156], deep: [0.238, 0.136, 0.086],
            dzCol: [0.905, 0.845, 0.690], dustCol: [0.300, 0.196, 0.146],
            speckCol: [0.150, 0.085, 0.060],
            roughBase: 0.165, coat: 0.85, coatRough: 0.060, sss: 0.32
        },
        // ---- ココア掛けのトリュフ（唯一のマット）----------------------
        truffle: {
            label: "トリュフ", countScale: 0.95,
            form: "super", radius: 1.42, aspect: 1.0, nExp: 2.0,
            scallopK: 0, scallopAmp: 0,
            height: 2.45, hEq: 0.47, nUp: 2.0, nDn: 2.15, rBase: 0.34, draft: 0.0,
            outlineJitter: 0.024, wobble: 0.040, foot: 0.05, twist: 0.0,
            fluteK: 0, fluteAmp: 0,
            comb: "none", combPitch: 0.2, combDepth: 0, combRing: [0.7, 0.9],
            drizzle: 0, dust: 1.0, speckle: 0.0, bloom: 0.0, moldLip: 0.0,
            nuts: 0,
            base: [0.196, 0.116, 0.084], deep: [0.110, 0.062, 0.046],
            dzCol: [0.905, 0.845, 0.690], dustCol: [0.322, 0.212, 0.160],
            speckCol: [0.120, 0.070, 0.052],
            // 【対策】ここだけクリアコートを切る。粉が乗った面に艶があると
            //         「濡れたココア」になり、粉らしさが完全に消える
            roughBase: 0.90, coat: 0.0, coatRough: 0.3, sss: 0.06
        },
        // ---- 角プラリネ（型抜き・天面に櫛目）--------------------------
        praline: {
            label: "角プラリネ", countScale: 1.0,
            form: "super", radius: 1.34, aspect: 1.0, nExp: 5.0,
            scallopK: 0, scallopAmp: 0,
            height: 1.22, hEq: 0.09, nUp: 5.5, nDn: 8.0, rBase: 0.99, draft: 0.075,
            outlineJitter: 0.003, wobble: 0.0, foot: 0.0, twist: 0.0,
            fluteK: 0, fluteAmp: 0,
            comb: "lines", combPitch: 0.115, combDepth: 0.34, combAngle: 0.34,
            combRing: [0.80, 0.94],
            drizzle: 0, dust: 0, speckle: 0.0, bloom: 0.09, moldLip: 1.0,
            nuts: 0,
            base: [0.238, 0.140, 0.094], deep: [0.126, 0.068, 0.046],
            dzCol: [0.905, 0.845, 0.690], dustCol: [0.300, 0.196, 0.146],
            speckCol: [0.110, 0.062, 0.046],
            roughBase: 0.130, coat: 0.92, coatRough: 0.040, sss: 0.12
        },
        // ---- ホワイトの雫（ダークのドリズル）--------------------------
        white: {
            label: "ホワイト雫", countScale: 1.0,
            form: "super", radius: 1.34, aspect: 1.18, nExp: 2.2,
            scallopK: 0, scallopAmp: 0,
            // nUp < 1 にすると天が尖る。雫やキス型はこれ一発で出る
            height: 1.95, hEq: 0.24, nUp: 1.05, nDn: 3.2, rBase: 0.62, draft: 0.0,
            outlineJitter: 0.014, wobble: 0.022, foot: 0.09, twist: 0.55,
            fluteK: 0, fluteAmp: 0,
            comb: "none", combPitch: 0.2, combDepth: 0, combRing: [0.7, 0.9],
            drizzle: 1.0, dzPitch: 0.46, dzWidth: 0.115, dzAngle: 1.02, dzRough: 0.20,
            dust: 0, speckle: 0.0, bloom: 0.05, moldLip: 0.0,
            nuts: 0,
            base: [0.900, 0.828, 0.652], deep: [0.700, 0.612, 0.442],
            dzCol: [0.215, 0.122, 0.082], dustCol: [0.300, 0.196, 0.146],
            speckCol: [0.500, 0.420, 0.300],
            // 【対策】ホワイトはカカオ分が無いぶん透過が強い。SSS を
            //         ダークと同じにすると、白いプラスチックの塊になる
            roughBase: 0.150, coat: 0.88, coatRough: 0.050, sss: 0.85
        },
        // ---- ハート（ミルク・粉ふきの斑点）----------------------------
        heart: {
            label: "ハート", countScale: 1.0,
            form: "heart", radius: 1.62, aspect: 1.0, nExp: 2.0,
            scallopK: 0, scallopAmp: 0,
            height: 1.12, hEq: 0.12, nUp: 3.6, nDn: 7.0, rBase: 0.98, draft: 0.060,
            outlineJitter: 0.004, wobble: 0.0, foot: 0.0, twist: 0.0,
            fluteK: 0, fluteAmp: 0,
            comb: "none", combPitch: 0.2, combDepth: 0, combRing: [0.7, 0.9],
            drizzle: 0, dust: 0, speckle: 1.0, bloom: 0.12, moldLip: 1.0,
            nuts: 0,
            base: [0.402, 0.248, 0.152], deep: [0.226, 0.130, 0.082],
            dzCol: [0.905, 0.845, 0.690], dustCol: [0.300, 0.196, 0.146],
            speckCol: [0.148, 0.086, 0.062],
            roughBase: 0.150, coat: 0.88, coatRough: 0.050, sss: 0.30
        },
        // ---- 貝殻（縦の溝）--------------------------------------------
        shell: {
            label: "貝殻", countScale: 1.0,
            form: "super", radius: 1.56, aspect: 1.12, nExp: 2.3,
            scallopK: 0, scallopAmp: 0,
            height: 1.18, hEq: 0.26, nUp: 2.7, nDn: 4.6, rBase: 0.66, draft: 0.0,
            outlineJitter: 0.006, wobble: 0.0, foot: 0.0, twist: 0.0,
            // 【対策】溝は 1mm 級だが、稜線がシルエットに出ないと貝に見えない。
            //         ここだけは法線マップではなく頂点で出す。周 168 分割に
            //         対して 13 本なら 1本 13 分割で、モアレも起きない
            fluteK: 13, fluteAmp: 0.055,
            comb: "none", combPitch: 0.2, combDepth: 0, combRing: [0.7, 0.9],
            drizzle: 0, dust: 0, speckle: 0.0, bloom: 0.10, moldLip: 1.0,
            nuts: 0,
            base: [0.372, 0.226, 0.140], deep: [0.206, 0.118, 0.074],
            dzCol: [0.905, 0.845, 0.690], dustCol: [0.300, 0.196, 0.146],
            speckCol: [0.140, 0.080, 0.058],
            roughBase: 0.140, coat: 0.90, coatRough: 0.045, sss: 0.28
        },
        // ---- ナッツクラスター -----------------------------------------
        nut: {
            label: "ナッツ", countScale: 0.95,
            form: "super", radius: 1.52, aspect: 1.05, nExp: 2.0,
            scallopK: 0, scallopAmp: 0,
            height: 1.30, hEq: 0.30, nUp: 2.3, nDn: 2.9, rBase: 0.60, draft: 0.0,
            outlineJitter: 0.030, wobble: 0.055, foot: 0.14, twist: 0.0,
            fluteK: 0, fluteAmp: 0,
            comb: "none", combPitch: 0.2, combDepth: 0, combRing: [0.7, 0.9],
            drizzle: 0, dust: 0, speckle: 0.0, bloom: 0.07, moldLip: 0.0,
            nuts: 9, nutR: 0.26,
            base: [0.234, 0.138, 0.094], deep: [0.126, 0.070, 0.048],
            dzCol: [0.905, 0.845, 0.690], dustCol: [0.300, 0.196, 0.146],
            speckCol: [0.110, 0.062, 0.046],
            roughBase: 0.185, coat: 0.82, coatRough: 0.075, sss: 0.16
        }
    };

    const ASSORT = ["dark", "milk", "white", "praline", "truffle", "heart", "shell", "nut"];

    const GLOBAL = {
        count: 12,

        // スレートの板
        boardRim: 9.8,
        boardWell: 6.4,
        boardLip: 0.42,
        boardThick: 0.85,
        boardSegments: 180,
        boardRings: 36,
        boardChip: 0.10,           // 縁の欠け

        // --- 物理（Havok）
        // 【対策】cm 単位のシーンで実重力 981 を入れると、1ステップの
        //         めり込みが Havok の許容量を超えて震え続ける。数百に落とす
        gravity: 560,
        physicsHz: 120,
        pieceMass: 0.13,
        // 【対策】チョコは表面が硬く滑る。摩擦をクッキー並みに上げると
        //         接触した瞬間に張り付いて、山が崩れず塔のまま止まる
        friction: 0.58,
        restitution: 0.06,
        linearDamping: 0.20,
        angularDamping: 0.80,
        dropInterval: 0.26,
        dropClearance: 1.1,
        maxPieces: 320,
        // 【対策】板の見込みは狭い。増やしたぶんは卓上へ流れるので、
        //         見えない土手で受け止めて敷き詰めさせる
        tableRim: 34,
        freezeWhenSettled: true,
        settleSpeed: 2.6, settleSpin: 2.6, settleHold: 0.40,
        settleTimeout: 8.0,

        segRound: 168,
        segAxis: 96,

        // 【対策】チョコは硝子質で高周波の情報が少ない。クッキーと同じ
        //         1024 は無駄で、8種ぶん抱えるとVRAMだけ食う
        textureSize: 640,
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
    const BUILD = "choco-B";

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const frac = (x) => x - Math.floor(x);
    const sRGB = (c) => new BABYLON.Color3(c[0], c[1], c[2]).toLinearSpace();

    // 断面パラメータ v は「表面上の距離」に比例する（4章で弧長等分する）。
    // 赤道と底縁が v のどこに来るかは形ごとに違うので、境界は表から読む

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
        finalize.lastScore = acc;      // デバッグ表示用に残す
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
    // 4. Shape （外形 × 縦断面）
    // =================================================================
    // 断面は「赤道」を境に上下2本のスーパー楕円で作る。
    //   上: rr = s,                yy = hEq + (1-hEq)(1 - s^nUp)^(1/nUp)
    //   下: rr = mix(rBase,1,...), yy = hEq(1 - s)
    // 【対策】形ごとに別々の断面表を持つと、種類を足すたびに表が増えて
    //         調整が破綻する。指数ひとつで尖り(nUp<1)・ドーム(=2)・
    //         平天(>4)まで連続に振れるので、雫も球も角プラリネも
    //         同じ関数から出せる
    // 【対策】この式を「半径 s」で媒介変数化したまま等間隔に刻むと、
    //         垂直な側面が v のごく一部に潰れる。実測すると円盤型で
    //         隣り合うリング間の yy が 0.33 も跳んでいた。側面は
    //         r が一定のまま y だけ動く区間なので、r を進行方向に
    //         とる限り絶対に解像できない。実寸の弧長で等分し直す。
    //         テクスチャの v もこれで「表面上の距離」に比例するようになり、
    //         天面だけ緻密で側面がスカスカ、という偏りも同時に消える
    function profileTable(P) {
        if (P._prof) return P._prof;
        const R = P.radius, H = P.height, SN = 2400;
        const pts = [];
        // 頂点 → 赤道
        for (let i = 0; i <= SN; i++) {
            const s = i / SN;
            const a = Math.pow(Math.max(0, 1 - Math.pow(s, P.nUp)), 1 / P.nUp);
            const yy = P.hEq + (1 - P.hEq) * a;
            const up = (yy - P.hEq) / Math.max(1e-3, 1 - P.hEq);
            // 抜き勾配（型から抜くために上ほどわずかに細い）
            pts.push({ rr: s * (1 - P.draft * up), yy: yy, t: s, face: 0, w: 1.25 });
        }
        // 赤道 → 底縁
        for (let i = 1; i <= SN; i++) {
            const s = i / SN;
            const a = Math.pow(Math.max(0, 1 - Math.pow(s, P.nDn)), 1 / P.nDn);
            pts.push({ rr: mix(P.rBase, 1, a), yy: P.hEq * (1 - s), t: 1, face: 1, w: 1.0 });
        }
        // 底面（外 → 中心）。ほぼ見えない面なので重みを落として v を節約する
        for (let i = 1; i <= 500; i++) {
            const s = 1 - i / 500;
            pts.push({ rr: P.rBase * s, yy: 0.006 * (1 - s * s), t: s, face: 2, w: 0.45 });
        }
        const cum = [0];
        for (let i = 1; i < pts.length; i++) {
            const dx = (pts[i].rr - pts[i - 1].rr) * R;
            const dy = (pts[i].yy - pts[i - 1].yy) * H;
            cum.push(cum[i - 1] + Math.hypot(dx, dy) * pts[i].w);
        }
        const total = cum[cum.length - 1] || 1;
        const M = 1024;
        const tab = new Float32Array(M * 3);
        const face = new Uint8Array(M);
        let j = 0, vEq = 0.5, vBot = 0.8;
        for (let k = 0; k < M; k++) {
            const target = k / (M - 1) * total;
            while (j < cum.length - 2 && cum[j + 1] < target) j++;
            const c0 = cum[j], c1 = cum[j + 1];
            const f = c1 > c0 ? clamp((target - c0) / (c1 - c0), 0, 1) : 0;
            const a = pts[j], b = pts[j + 1];
            tab[k * 3] = mix(a.rr, b.rr, f);
            tab[k * 3 + 1] = mix(a.yy, b.yy, f);
            tab[k * 3 + 2] = mix(a.t, b.t, f);
            face[k] = a.face;
            if (k > 0) {
                if (face[k - 1] === 0 && a.face === 1) vEq = k / (M - 1);
                if (face[k - 1] === 1 && a.face === 2) vBot = k / (M - 1);
            }
        }
        P._prof = { tab: tab, face: face, M: M, vEq: vEq, vBot: vBot };
        return P._prof;
    }

    function section(v, P) {
        const pr = profileTable(P);
        const a = clamp(v, 0, 1) * (pr.M - 1);
        const i0 = Math.floor(a), i1 = Math.min(pr.M - 1, i0 + 1), f = a - i0;
        return {
            rr: mix(pr.tab[i0 * 3], pr.tab[i1 * 3], f),
            yy: mix(pr.tab[i0 * 3 + 1], pr.tab[i1 * 3 + 1], f),
            t: mix(pr.tab[i0 * 3 + 2], pr.tab[i1 * 3 + 2], f),
            face: pr.face[i0]
        };
    }

    // ハートの輪郭。
    // 【対策】ハートは陰関数なので φ から半径を直接は解けない。毎回
    //         反復で解くのは論外なので、媒介変数表示を一度だけ極座標の
    //         表に焼き直して線形補間する
    const HEART = (() => {
        const N = 2048, M = 512, pts = [];
        for (let i = 0; i < N; i++) {
            const t = i / N * TAU;
            const x = 16 * Math.pow(Math.sin(t), 3);
            const z = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
            pts.push([x, z]);
        }
        let cz = 0;
        for (const p of pts) cz += p[1];
        cz /= N;
        let mx = 0;
        for (const p of pts) { p[1] -= cz; mx = Math.max(mx, Math.hypot(p[0], p[1])); }
        const tab = new Float32Array(M);
        for (const p of pts) {
            let a = Math.atan2(p[1], p[0]);
            if (a < 0) a += TAU;
            const k = Math.floor(a / TAU * M) % M;
            tab[k] = Math.max(tab[k], Math.hypot(p[0], p[1]) / mx);
        }
        for (let pass = 0; pass < 4; pass++)
            for (let k = 0; k < M; k++)
                if (tab[k] === 0) tab[k] = Math.max(tab[(k + M - 1) % M], tab[(k + 1) % M]);
        return tab;
    })();

    function heartR(phi) {
        const M = HEART.length;
        const a = ((phi % TAU) + TAU) % TAU / TAU * M;
        const i0 = Math.floor(a) % M, i1 = (i0 + 1) % M, f = a - Math.floor(a);
        return mix(HEART[i0], HEART[i1], f);
    }

    // 外形（正規化半径）
    function outlineBase(cfg, phi) {
        if (cfg.form === "heart") return heartR(phi - Math.PI / 2);
        const c = Math.abs(Math.cos(phi)), s = Math.abs(Math.sin(phi));
        const n = cfg.nExp || 2, a = cfg.aspect || 1;
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
            //         にすると粗さ 0.14 が線形 0.018 として渡り、鏡どころか
            //         金属のような一点の光しか返さなくなる
            if (linear) dt.gammaSpace = false;
            return dt;
        },

        // 艶・櫛目・ドリズル・ココア・合わせ目をまとめて1回で焼く
        //
        // 【対策】このUVは v が断面パラメータなので、天面の中心付近で u 方向が
        //         極端に潰れる。UV空間でノイズを引くと放射状の筋が出るので、
        //         断面の半径から実寸の (x, y, z) に射影してから引く
        //
        // 【対策】クッキーの感覚で生地の肌理を入れてはいけない。チョコは
        //         硝子質なので、微細な凹凸を入れた瞬間に「型から抜いた樹脂」に
        //         見える。高さ場に入れるのは、意図して付けた造作だけにする
        fields(size, cfg) {
            const n = size * size;
            const F = {
                h: new Float32Array(n),
                comb: new Float32Array(n),
                dz: new Float32Array(n),
                dust: new Float32Array(n),
                speck: new Float32Array(n),
                bloom: new Float32Array(n),
                ao: new Float32Array(n)
            };
            const R = cfg.radius, H = cfg.height, sd = cfg.texSeed;
            const PR = profileTable(cfg), VEQ = PR.vEq, VBO = PR.vBot;
            const ca = Math.cos(cfg.combAngle || 0), sa = Math.sin(cfg.combAngle || 0);
            const dca = Math.cos(cfg.dzAngle || 0), dsa = Math.sin(cfg.dzAngle || 0);

            for (let y = 0; y < size; y++) {
                const v = y / size;
                const S = section(v, cfg);
                const topM = 1 - smooth(VEQ - 0.07, VEQ + 0.02, v);
                const botM = smooth(VBO - 0.02, VBO + 0.07, v);
                const t = S.t;
                for (let x = 0; x < size; x++) {
                    const u = x / size, i = y * size + x;
                    const phiE = u * TAU + (cfg.twist || 0) * S.yy;
                    const ro = outlineBase(cfg, phiE) * R * S.rr;
                    const px = Math.cos(phiE) * ro, pz = Math.sin(phiE) * ro, py = S.yy * H;

                    // ---- 基準面。ここはほぼ平坦でよい ----------------
                    let h = 0.50;
                    const flow = Noise.fbm2(px * 1.9 + 3, pz * 1.9 + py * 2.6 + 11, sd + 3, 3);
                    h += 0.030 * (flow - 0.5);

                    // ---- 型の合わせ目（底縁の流れ出し）---------------
                    // 【対策】型抜きのチョコは、型の口いっぱいに流した跡が
                    //         底の縁にわずかな段として残る。ここが無いと
                    //         上下どちらから見ても同じ「削り出し」に見える
                    if (cfg.moldLip > 0) {
                        const lip = smooth(VBO - 0.045, VBO - 0.008, v)
                            * (1 - smooth(VBO - 0.008, VBO + 0.030, v));
                        h += lip * 0.16 * cfg.moldLip;
                    }

                    // ---- 天面の造作（同心リング / 平行の櫛目）--------
                    let comb = 0;
                    if (cfg.comb !== "none" && topM > 0.01) {
                        let w;
                        if (cfg.comb === "rings") {
                            w = 0.5 + 0.5 * Math.cos((t * R / cfg.combPitch) * TAU);
                        } else {
                            w = 0.5 + 0.5 * Math.cos(((px * ca + pz * sa) / cfg.combPitch) * TAU);
                        }
                        // 内側の造作は縁の手前で止め、外周に一段高い額縁を置く
                        const inner = 1 - smooth(cfg.combRing[0] - 0.06, cfg.combRing[0], t);
                        const band = smooth(cfg.combRing[0], cfg.combRing[0] + 0.04, t)
                            * (1 - smooth(cfg.combRing[1] - 0.04, cfg.combRing[1], t));
                        comb = clamp(smooth(0.30, 0.72, w) * inner + band, 0, 1) * topM;
                        h += (comb - 0.5 * clamp(inner + band, 0, 1) * topM) * cfg.combDepth;
                    }
                    F.comb[i] = comb;

                    // ---- ドリズル（上から線を掛ける）-----------------
                    // 【対策】ドリズルは天面だけに乗るのではなく、側面を
                    //         垂れて流れる。天面で切ると帽子をかぶせたようになる
                    let dz = 0;
                    if (cfg.drizzle > 0) {
                        const wob = 0.30 * (Noise.fbm2(px * 1.5 + 41, pz * 1.5 + py * 2.2, sd + 31, 2) - 0.5) * 2;
                        const q = (px * dca + pz * dsa) / cfg.dzPitch + wob;
                        const e = Math.abs(frac(q) - 0.5);
                        // 線の太さは一定ではない。手で振った跡は途中で細る
                        const thin = 0.62 + 0.76 * Noise.fbm2(px * 2.3 + 7, pz * 2.3 + py * 3.1, sd + 37, 2);
                        const band = 1 - smooth(cfg.dzWidth * 0.45 * thin, cfg.dzWidth * thin, e);
                        const gate = smooth(cfg.hEq * 0.35, cfg.hEq * 1.15, S.yy);
                        dz = band * gate * cfg.drizzle;
                        h += dz * 0.24;
                    }
                    F.dz[i] = dz;

                    // ---- ココア掛け -----------------------------------
                    let dust = 0;
                    if (cfg.dust > 0) {
                        const gran = Noise.fbm2(px * 30 + 5, pz * 30 + py * 34 + 9, sd + 61, 2);
                        const cover = 0.80 + 0.20 * Noise.fbm2(px * 4 + 21, pz * 4 + py * 5, sd + 67, 2);
                        // 接地面は粉が落ちる
                        dust = cfg.dust * cover * (1 - 0.65 * botM);
                        h += (gran - 0.5) * 0.30 * dust;
                    }
                    F.dust[i] = dust;

                    // ---- 斑点（カカオの粒・バニラ）--------------------
                    let speck = 0;
                    if (cfg.speckle > 0) {
                        const s1 = Noise.v2(px * 26 + 13, pz * 26 + py * 31 + 5, sd + 53);
                        speck = smooth(0.945, 0.995, s1) * cfg.speckle * (1 - botM);
                        h -= speck * 0.10;
                    }
                    F.speck[i] = speck;

                    // ---- ブルーム（白い粉ふき）------------------------
                    // 【対策】くぼみと底から出る。全面に均等に乗せると
                    //         ただ色あせただけの安いチョコになる
                    let bloom = 0;
                    if (cfg.bloom > 0) {
                        const bl = Noise.fbm2(px * 3.4 + 71, pz * 3.4 + py * 4.2 + 29, sd + 43, 3);
                        bloom = cfg.bloom * smooth(0.46, 0.86, bl)
                            * (0.35 + 0.65 * botM + 0.5 * (1 - clamp(h * 2, 0, 1)));
                    }
                    F.bloom[i] = clamp(bloom, 0, 1);

                    // ---- 手掛けのフォークの跡 -------------------------
                    if (cfg.forkMark > 0 && topM > 0.2) {
                        const sw = Math.sin((u * TAU * 3 + (1 - t) * 5.5)) * 0.5 + 0.5;
                        const gate = (1 - smooth(0.10, 0.55, t)) * topM;
                        h += (sw - 0.5) * 0.16 * gate * cfg.forkMark;
                    }

                    F.h[i] = clamp(h, 0, 1);
                    F.ao[i] = clamp(1 - 0.30 * (1 - F.h[i]) - 0.22 * (1 - comb) * (comb > 0 ? 1 : 0)
                        - 0.25 * speck, 0.15, 1);
                }
            }
            return F;
        },

        albedo(scene, size, cfg, F) {
            const B = cfg.base, D = cfg.deep, DZ = cfg.dzCol;
            const DU = cfg.dustCol, SP = cfg.speckCol;
            const BLOOM = [0.760, 0.706, 0.640];
            return this._tex("chocAlbedo_" + cfg.type, size, (d, N) => {
                const VBO = profileTable(cfg).vBot;
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    const botM = smooth(VBO - 0.02, VBO + 0.07, v);
                    for (let x = 0; x < N; x++) {
                        const i = y * N + x, o = i * 4;
                        // 高いところは光を受けて明るく、谷は素地の濃い色が出る
                        const k = smooth(0.36, 0.66, F.h[i]);
                        let cr = mix(D[0], B[0], k), cg = mix(D[1], B[1], k), cb = mix(D[2], B[2], k);
                        // 【対策】底は型やシートに接していた面。天面と同じ色艶に
                        //         すると、どちらが上か分からない置物になる
                        const bk = botM * 0.35;
                        cr = mix(cr, D[0] * 1.28, bk); cg = mix(cg, D[1] * 1.28, bk); cb = mix(cb, D[2] * 1.30, bk);
                        // 斑点
                        const sk = smooth(0.10, 0.80, F.speck[i]);
                        cr = mix(cr, SP[0], sk); cg = mix(cg, SP[1], sk); cb = mix(cb, SP[2], sk);
                        // ドリズル
                        const zk = smooth(0.15, 0.75, F.dz[i]);
                        cr = mix(cr, DZ[0], zk); cg = mix(cg, DZ[1], zk); cb = mix(cb, DZ[2], zk);
                        // ココア掛け
                        const uk = smooth(0.05, 0.55, F.dust[i]);
                        cr = mix(cr, DU[0], uk); cg = mix(cg, DU[1], uk); cb = mix(cb, DU[2], uk);
                        // ブルーム
                        const mk = F.bloom[i] * 0.55;
                        cr = mix(cr, BLOOM[0], mk); cg = mix(cg, BLOOM[1], mk); cb = mix(cb, BLOOM[2], mk);
                        d[o] = clamp(cr, 0, 1) * 255;
                        d[o + 1] = clamp(cg, 0, 1) * 255;
                        d[o + 2] = clamp(cb, 0, 1) * 255;
                        d[o + 3] = 255;
                    }
                }
            }, scene, true, false);
        },

        orm(scene, size, cfg, F) {
            return this._tex("chocORM_" + cfg.type, size, (d, N) => {
                const VBO = profileTable(cfg).vBot;
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    const botM = smooth(VBO - 0.02, VBO + 0.07, v);
                    for (let x = 0; x < N; x++) {
                        const i = y * N + x, o = i * 4;
                        let rough = cfg.roughBase;
                        // 【対策】底は必ず鈍い。ここを同じ艶にすると全方向から
                        //         同じに見えて、置かれている感じが消える
                        rough = mix(rough, Math.max(rough, 0.52), botM);
                        rough = mix(rough, 0.93, smooth(0.05, 0.55, F.dust[i]));
                        if (cfg.drizzle > 0) rough = mix(rough, cfg.dzRough, smooth(0.15, 0.75, F.dz[i]));
                        rough += 0.30 * F.bloom[i];
                        rough += 0.18 * smooth(0.10, 0.80, F.speck[i]);
                        d[o] = clamp(F.ao[i], 0, 1) * 255;
                        d[o + 1] = clamp(rough, 0.03, 1) * 255;
                        d[o + 2] = 0; d[o + 3] = 255;
                    }
                }
            }, scene, true, true);
        },

        // 高さ場 → 法線マップ
        normal(scene, size, hf, strength, name) {
            return this._tex(name, size, (d, N) => {
                for (let y = 0; y < N; y++) {
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

        // スレート（粘板岩）。板と卓上に使う
        // 【対策】暗いだけの面にすると、チョコの黒と同化して輪郭が消える。
        //         層状の筋と細かい斑を入れて、少しだけ明度を持たせる
        slate(scene, size, seed) {
            return this._tex("slateAlbedo", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        const layer = Noise.fbm2u(u * 3.2, v * 26, 3, seed, 4);
                        const grit = Noise.fbm2u(u * 190, v * 190, 190, seed + 11, 2);
                        const patch = Noise.fbm2u(u * 6, v * 6, 6, seed + 23, 3);
                        let g = 0.128 + 0.070 * (layer - 0.5) + 0.050 * (grit - 0.5)
                            + 0.045 * (patch - 0.5);
                        const spark = smooth(0.972, 0.998, grit) * 0.35;
                        const r = g * 1.02 + spark, gg = g * 1.00 + spark, b = g * 1.06 + spark;
                        d[i] = clamp(r, 0, 1) * 255;
                        d[i + 1] = clamp(gg, 0, 1) * 255;
                        d[i + 2] = clamp(b, 0, 1) * 255;
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

            const F = TextureLab.fields(S, cfg);
            this.albedoTex = TextureLab.albedo(scene, S, cfg, F);
            this.ormTex = TextureLab.orm(scene, S, cfg, F);
            this.normalTex = TextureLab.normal(scene, S, F.h, 2.0, "chocNormal_" + cfg.type);
            this.texs.push(this.albedoTex, this.ormTex, this.normalTex);
            for (const t of this.texs) t.anisotropicFilteringLevel = 8;

            const m = new BABYLON.PBRMaterial("choc_" + cfg.type, scene);
            m.albedoTexture = this.albedoTex;
            m.metallic = 0.0;
            m.roughness = 1.0;                   // 実値は ORM の G
            m.metallicTexture = this.ormTex;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.bumpTexture = this.normalTex;
            m.bumpTexture.level = 0.85;
            m.transparencyMode = OPAQUE;
            // 【対策】艶の正体は素地の反射ではなくカカオバターの層。
            //         粗さを下げるだけで出そうとすると「濡れた石」になる。
            //         層として乗せて初めてチョコの照りになる
            if (cfg.coat > 0) {
                m.clearCoat.isEnabled = true;
                m.clearCoat.intensity = cfg.coat;
                m.clearCoat.roughness = cfg.coatRough;
                m.clearCoat.indexOfRefraction = 1.46;
            }
            // 稜線と薄い縁の透過。ミルクとホワイトほど強い
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.tintColor = new BABYLON.Color3(0.72, 0.34, 0.18);
            m.subSurface.translucencyIntensity = 0.30 * cfg.sss;
            m.subSurface.minimumThickness = 0.4;
            m.subSurface.maximumThickness = 2.6;
            this.choc = m;
            this.mats.push(m);

            if (cfg.nuts > 0) {
                const nm = new BABYLON.PBRMaterial("nut_" + cfg.type, scene);
                nm.albedoColor = sRGB([0.520, 0.372, 0.222]);
                nm.metallic = 0.0;
                nm.roughness = 0.58;
                nm.transparencyMode = OPAQUE;
                // ローストしたナッツは油が浮いて弱い照りが出る
                nm.clearCoat.isEnabled = true;
                nm.clearCoat.intensity = 0.25;
                nm.clearCoat.roughness = 0.35;
                this.nut = nm;
                this.mats.push(nm);
            }
        }
        dispose() {
            for (const m of this.mats) m.dispose(true, false);
            for (const t of this.texs) t.dispose();
            this.mats.length = 0; this.texs.length = 0;
        }
    }

    // =================================================================
    // 6. Bonbon
    // =================================================================
    class Bonbon {
        constructor(scene, cfg, seed, skin) {
            this.scene = scene; this.cfg = cfg; this.seed = seed >>> 0;
            this.skin = skin;
            this.parts = [];
            this.root = new BABYLON.TransformNode("bonbonRoot", scene);
            const rng = new Rng(this.seed);
            this.rng = rng;
            this.nseed = (this.seed % 100000) | 0;

            // 【対策】型抜きのチョコは工業製品なので個体差がほぼ無い。
            //         野菜と同じ幅で乱数を振ると手びねりになる。
            //         手掛け（wobble > 0）のものだけ振れ幅を広げる
            const hand = cfg.wobble > 0 ? 1 : 0;
            this.R = cfg.radius * rng.range(1 - 0.015 - 0.045 * hand, 1 + 0.015 + 0.045 * hand);
            this.H = cfg.height * rng.range(1 - 0.02 - 0.06 * hand, 1 + 0.02 + 0.06 * hand);
            this.TH = this.H;                 // 情報表示・分裂の高さに使う
            this.jit = cfg.outlineJitter * rng.range(0.7, 1.3);
            this.wob = cfg.wobble * rng.range(0.7, 1.3);
            this.uOff = (cfg.comb === "lines" || cfg.drizzle > 0 || cfg.form === "heart")
                ? 0 : rng.next();

            this._buildBody();
            if (cfg.nuts > 0) this._buildNuts();
        }

        // 外形。手掛けのものは周方向と高さの両方でうねらせる
        outlineR(phi, yy) {
            const u = phi / TAU;
            let k = 1;
            if (this.jit > 0) {
                const w = Noise.fbm2u(u * 5, 0.5, 5, this.nseed + 31, 2) - 0.5;
                k += this.jit * 2.0 * w;
            }
            if (this.wob > 0) {
                // 【対策】回転体のままだと、手掛けのはずが旋盤で挽いた駒に見える。
                //         高さ方向にもうねりを入れて回転対称性を壊す
                const w2 = Noise.fbm2u(u * 4, yy * 3.2 + 7, 4, this.nseed + 47, 3) - 0.5;
                k += this.wob * 2.0 * w2;
            }
            return this.R * outlineBase(this.cfg, phi) * k;
        }

        surfaceAt(v, phi) {
            const cfg = this.cfg;
            const S = section(v, cfg);
            // ねじれ（雫の先端がねじれる）
            const phiE = phi + (cfg.twist || 0) * S.yy;
            let ro = this.outlineR(phiE, S.yy);
            // 溝（貝殻）。頂点で出さないと稜線がシルエットに出ない
            if (cfg.fluteK > 0) {
                ro *= 1 + cfg.fluteAmp * Math.cos(cfg.fluteK * phiE)
                    * smooth(0.12, 0.85, S.rr);
            }
            // 裾（手掛けのチョコが底で広がる）
            if (cfg.foot > 0) {
                const f = 1 - smooth(0, 0.10, S.yy);
                ro *= 1 + cfg.foot * f * f;
            }
            const x = Math.cos(phiE) * ro * S.rr;
            const z = Math.sin(phiE) * ro * S.rr;
            const y = this.H * S.yy;
            return { x, y, z };
        }

        _buildBody() {
            const cfg = this.cfg, M = cfg.segRound, N = cfg.segAxis;
            const rings = [], centers = [];
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
            // 個体ごとの色ムラ。テクスチャは種類で共有なので、ここで少し崩す
            const nseed = this.nseed, mo = this.rng.range(0.96, 1.04);
            const cols = (vv, uu) => {
                const k = mo * (0.975 + 0.05 * Noise.fbm2u(uu * 4, vv * 3, 4, nseed + 71, 3));
                return [k, k, k];
            };
            const mesh = sweep("bonbon", rings, centers, cols, this.scene);
            // 【対策】同じ種類が全部同じ向きに造作を持つと、並べた瞬間に
            //         コピーだと分かる。向きの無い造作だけ UV を回す
            if (this.uOff > 0) {
                const uvs = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
                for (let i = 0; i < uvs.length; i += 2) uvs[i] = frac(uvs[i] + this.uOff);
                mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, uvs, false);
            }
            mesh.material = this.skin.choc;
            mesh.receiveShadows = true;
            this.body = mesh;
            this.parts.push(mesh);
        }

        // ---- ナッツ ---------------------------------------------------
        // 【対策】ナッツをテクスチャの模様で済ませると、真上からは誤魔化せても
        //         横から見た瞬間に平らだと分かる。角のある塊として実体で置く
        _buildNuts() {
            const cfg = this.cfg, rng = this.rng, list = [];
            const n = Math.round(cfg.nuts * rng.range(0.8, 1.2));
            for (let c = 0; c < n; c++) {
                const phi = rng.range(0, TAU);
                const vEq = profileTable(cfg).vEq;
                const v = clamp(rng.range(0.06, 0.92) * vEq, 0.02, vEq * 0.96);
                const p = this.surfaceAt(v, phi);
                const r = cfg.nutR * rng.range(0.75, 1.25);
                const box = BABYLON.MeshBuilder.CreateSphere("nut",
                    { diameter: 2, segments: 6 }, this.scene);   // 分割を落として角を残す
                const pos = box.getVerticesData(BABYLON.VertexBuffer.PositionKind);
                const sq = rng.range(0.55, 0.85);
                const rot = rng.range(0, TAU);
                for (let i = 0; i < pos.length; i += 3) {
                    let vx = pos[i], vy = pos[i + 1], vz = pos[i + 2];
                    const d = 1 + 0.34 * (Noise.fbm2(vx * 2.4 + c * 4.1, vz * 2.4 + vy * 1.7,
                        this.nseed + 131 + c, 2) - 0.5) * 2;
                    vx *= r * d; vz *= r * d; vy *= r * sq * d;
                    const cx = vx * Math.cos(rot) - vz * Math.sin(rot);
                    const cz = vx * Math.sin(rot) + vz * Math.cos(rot);
                    pos[i] = cx; pos[i + 1] = vy; pos[i + 2] = cz;
                }
                box.setVerticesData(BABYLON.VertexBuffer.PositionKind, pos, false);
                const nor = new Float32Array(pos.length);
                BABYLON.VertexData.ComputeNormals(pos, box.getIndices(), nor);
                box.setVerticesData(BABYLON.VertexBuffer.NormalKind, nor, false);
                // チョコに半分沈める
                box.position.set(p.x * 0.94, p.y - r * sq * rng.range(0.30, 0.60), p.z * 0.94);
                list.push(box);
            }
            if (!list.length) return;
            const merged = BABYLON.Mesh.MergeMeshes(list, true, true, undefined, false, false);
            if (!merged) return;
            merged.name = "nuts";
            merged.material = this.skin.nut;
            merged.receiveShadows = true;
            merged.parent = this.root;
            this.parts.push(merged);
        }

        // ---- 当たり判定 -----------------------------------------------
        // 【対策】ボンボンはほぼ凸なので凸包で足りる。ただしメッシュ本体を
        //         そのまま渡すと 1.6万頂点から凸包を取ることになり、
        //         倍増のたびに数百ミリ秒固まる。粗い代理を一度だけ作って共有する
        hullShape() {
            if (!this._shape) {
                const proxy = this._proxy();
                this._shape = new BABYLON.PhysicsShapeConvexHull(proxy, this.scene);
                proxy.dispose();
            }
            return this._shape;
        }
        _proxy() {
            const N = 18, M = 26;
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
            const p = sweep("bonbonProxy", rings, centers, null, this.scene);
            p.isVisible = false;
            return p;
        }

        get span() {
            const a = this.cfg.aspect || 1;
            return this.R * Math.max(1, a) * 2;
        }

        attach() {
            for (const m of this.parts) {
                if (m.parent !== this.root) m.parent = this.root;
                m._pieceType = this.cfg.type;    // クリック判定用のタグ
            }
        }

        worldBounds() { return boundsOf(this.parts); }

        dispose() {
            for (const m of this.parts) { try { m.dispose(); } catch (e) { } }
            if (this._shape) { try { this._shape.dispose(); } catch (e) { } this._shape = null; }
            if (this.root) this.root.dispose();
            this.parts.length = 0;
        }
    }

    function boundsOf(parts) {
        let mnx = Infinity, mny = Infinity, mnz = Infinity;
        let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
        for (const m of parts) {
            m.computeWorldMatrix(true);
            const bb = m.getBoundingInfo().boundingBox;
            mnx = Math.min(mnx, bb.minimumWorld.x); mxx = Math.max(mxx, bb.maximumWorld.x);
            mny = Math.min(mny, bb.minimumWorld.y); mxy = Math.max(mxy, bb.maximumWorld.y);
            mnz = Math.min(mnz, bb.minimumWorld.z); mxz = Math.max(mxz, bb.maximumWorld.z);
        }
        return { mnx, mny, mnz, mxx, mxy, mxz };
    }

    // 【対策】倍増を素直に「もう一粒作る」で実装すると、1クリックごとに
    //         頂点1.6万×個数ぶんのバッファが増え、3〜4回で確保が追いつかない。
    //         コピーは原本と完全に同一なのだから頂点バッファは共有してよい。
    //         InstancedMesh なら描画も1ドローにまとまる
    class BonbonCopy {
        constructor(src) {
            const base = src.origin || src;
            this.origin = base;
            this.cfg = base.cfg; this.scene = base.scene;
            this.R = base.R; this.TH = base.TH; this.H = base.H;
            this.isCopy = true;
            this.root = new BABYLON.TransformNode("bonbonCopy", base.scene);
            this.parts = [];
            for (const m of base.parts) {
                const inst = m.createInstance(m.name + "_c");
                inst.parent = this.root;
                inst.position.copyFrom(m.position);
                inst.rotation.copyFrom(m.rotation);
                inst.scaling.copyFrom(m.scaling);
                inst._pieceType = this.cfg.type;
                this.parts.push(inst);
            }
        }
        get span() { return this.origin.span; }
        hullShape() { return this.origin.hullShape(); }
        worldBounds() { return boundsOf(this.parts); }
        attach() { }
        dispose() {
            for (const m of this.parts) { try { m.dispose(); } catch (e) { } }
            if (this.root) { try { this.root.dispose(); } catch (e) { } }
            this.parts.length = 0;
        }
    }

    // =================================================================
    // 7. Board （スレートの板）
    // =================================================================
    // 【対策】物理の当たり判定に薄い一枚板を使うと、落下速度によっては
    //         すり抜ける。表と裏を張って縁で閉じた「厚みのある器」に
    //         しておけば、静的トライメッシュでも安定して受け止められる
    function buildBoard(scene, cfg) {
        const M = cfg.boardSegments, K = cfg.boardRings;
        const TH = cfg.boardThick, RIM = cfg.boardRim, WELL = cfg.boardWell;
        const LIP = cfg.boardLip;
        const wellS = WELL / RIM;

        const prof = (s) => {
            const r = RIM * s;
            const y = LIP * smooth(wellS, wellS + 0.34, s);
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
            const edgeK = smooth(0.86, 1.0, s);
            for (let j = 0; j <= M; j++) {
                const phi = (j % M) / M * TAU;
                const cs = Math.cos(phi), sn = Math.sin(phi);
                // 【対策】石の縁を真円にすると、樹脂で成型した皿に見える。
                //         割った縁は不規則に欠ける
                const chip = cfg.boardChip * edgeK
                    * (Noise.fbm2u(phi / TAU * 22, 0.5, 22, 771, 3) - 0.5) * 2;
                const r = r0 + chip * RIM * 0.06, y = y0;
                const a = i * W + j, b = LAY + a;
                positions[a * 3] = r * cs; positions[a * 3 + 1] = y; positions[a * 3 + 2] = r * sn;
                const ro = r - nr * TH, yo = y - ny * TH;
                positions[b * 3] = ro * cs; positions[b * 3 + 1] = yo; positions[b * 3 + 2] = ro * sn;
                uvs[a * 2] = j / M * 2; uvs[a * 2 + 1] = s * 2;
                uvs[b * 2] = j / M * 2; uvs[b * 2 + 1] = s * 2;
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
        const mesh = makeMesh("board", positions, indices, normals, uvs, null, scene);
        // 【対策】この板は「見込み y=0 から下へ厚み TH」で作ってあるので、
        //         そのまま置くと見込みが地面（y=0）と同一平面になり、
        //         底一面が Z ファイティングを起こす。裏が接するまで持ち上げる
        mesh.position.y = TH;

        const m = new BABYLON.PBRMaterial("boardMat", scene);
        m.albedoTexture = TextureLab.slate(scene, 768, 4271);
        m.albedoTexture.anisotropicFilteringLevel = 8;
        m.metallic = 0.0;
        m.roughness = 0.52;
        m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
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
    // 【対策】明るい背景に置くと、暗いチョコが影として沈んで形が読めない。
    //         参考写真がどれも黒い石の上なのは偶然ではなく、暗い背景でこそ
    //         カカオバターの照りが線として立つ
    scene.clearColor = new BABYLON.Color4(0.105, 0.100, 0.098, 1);

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
        console.warn("[Choco] Havok を初期化できませんでした。物理なしで並べます。", err);
    }

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.65;
    // 【対策】チョコの見た目はほぼ「何を映しているか」で決まる。
    //         環境の強度を落とすと、粗さをいくら下げても黒い塊にしかならない
    scene.environmentIntensity = 1.05;

    const camera = new BABYLON.ArcRotateCamera("cam", -1.18, 1.04, 44, new V3(0, 1.6, 0), scene);
    camera.attachControl(true);
    camera.fov = 0.56;
    camera.wheelPrecision = 8;
    // 【対策】ポストプロセスを有効にするとシーンは 16bit 深度の RT へ描かれる。
    //         minZ を 0.1 のままにすると分解能が mm 台になり、重なった
    //         チョコの接触面が互いに勝ったり負けたりする
    camera.minZ = 5;
    camera.maxZ = 460;
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 230;
    camera.lowerBetaLimit = 0.05;
    camera.upperBetaLimit = 1.50;
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.42, -0.88, 0.58).normalize(), scene);
    key.position = new V3(18, 32, -20);
    key.intensity = 2.05;
    key.diffuse = new BABYLON.Color3(1.0, 0.982, 0.948);
    key.specular = new BABYLON.Color3(1.00, 0.96, 0.90);
    key.autoCalcShadowZBounds = true;

    const fillL = new BABYLON.DirectionalLight("fillL", new V3(0.88, -0.34, -0.52).normalize(), scene);
    fillL.intensity = 1.00;
    fillL.diffuse = new BABYLON.Color3(1.0, 0.968, 0.935);
    fillL.specular = new BABYLON.Color3(0.45, 0.43, 0.40);

    // 【対策】重なったチョコの下は完全に潰れる。台からの弱い返しが
    //         無いと、下敷きになった1粒が輪郭ごと消える
    const bounce = new BABYLON.DirectionalLight("bounce", new V3(0.1, 1.0, 0.25).normalize(), scene);
    bounce.intensity = 0.20;
    bounce.diffuse = new BABYLON.Color3(0.98, 0.955, 0.915);
    bounce.specular = new BABYLON.Color3(0, 0, 0);

    const amb = new BABYLON.HemisphericLight("amb", new V3(0, 1, 0), scene);
    amb.intensity = 0.22;
    amb.diffuse = new BABYLON.Color3(1, 1, 1);
    amb.groundColor = new BABYLON.Color3(0.16, 0.15, 0.15);
    amb.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.useBlurExponentialShadowMap = true;
    sg.blurKernel = 32;
    sg.depthScale = 36;
    sg.darkness = 0.42;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.16;
    ip.contrast = 1.14;
    ip.vignetteEnabled = false;

    let ground = null;
    if (GLOBAL.showGround) {
        // 【対策】厚みゼロの床は当たり判定に使えない（すり抜ける）ので箱にする
        ground = BABYLON.MeshBuilder.CreateBox("ground",
            { width: 220, height: 2, depth: 220 }, scene);
        const gm = new BABYLON.PBRMaterial("groundMat", scene);
        gm.albedoTexture = TextureLab.slate(scene, 1024, 3131);
        gm.albedoTexture.uScale = 5.0; gm.albedoTexture.vScale = 5.0;
        gm.albedoTexture.anisotropicFilteringLevel = 8;
        gm.metallic = 0.0; gm.roughness = 0.62;
        gm.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
        ground.material = gm;
        ground.receiveShadows = true;
        ground.position.y = -1.0;
        if (physics) {
            new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX,
                { mass: 0, friction: 0.80, restitution: 0.01 }, scene);
        }
    }

    // 【対策】土手を見せると「檻に入れたチョコ」になる。物理だけ置いて
    //         描画は切る。敷き詰まった状態では縁まで見えないので支障はない
    if (physics) {
        const fence = BABYLON.MeshBuilder.CreateTorus("fence",
            { diameter: GLOBAL.tableRim * 2, thickness: 7, tessellation: 56 }, scene);
        fence.position.y = 2.4;
        fence.isVisible = false;
        fence.isPickable = false;
        const fShape = new BABYLON.PhysicsShapeMesh(fence, scene);
        fShape.material = { friction: 0.7, restitution: 0.0 };
        const fBody = new BABYLON.PhysicsBody(fence, BABYLON.PhysicsMotionType.STATIC, false, scene);
        fBody.shape = fShape;
    }

    const board = buildBoard(scene, GLOBAL);
    if (physics) {
        const pShape = new BABYLON.PhysicsShapeMesh(board, scene);
        pShape.material = { friction: 0.88, restitution: 0.0 };
        const pBody = new BABYLON.PhysicsBody(board, BABYLON.PhysicsMotionType.STATIC, false, scene);
        pBody.shape = pShape;
    }

    // =================================================================
    //  生成と投入
    // =================================================================
    let items = [], curMode = START_MODE, curSeed = START_SEED, curCfg = null;
    const skinCache = {};
    let onRebuilt = null;
    let queue = [], dropIndex = 0, dropTimer = 0, settleTimer = 0, postDropTimer = 0, frozen = false;

    function boardInnerY(r) {
        // 【対策】板の外まで縁の高さを返すと、卓上に落とす個体まで
        //         2cm 浮いた位置から放たれて、着地のたびに跳ねる
        if (r > GLOBAL.boardRim) return 0;
        const s = clamp(r / GLOBAL.boardRim, 0, 1);
        const wellS = GLOBAL.boardWell / GLOBAL.boardRim;
        return GLOBAL.boardThick + GLOBAL.boardLip * smooth(wellS, wellS + 0.34, s);
    }

    // 【対策】山全体の頂点を基準にすると、外側へ置く物まで山の高さぶん
    //         持ち上げられ、皿の縁の上から落ちてくることになる。
    //         水平方向に重なっている物だけを見る
    function localTopY(x, z, rh, limit) {
        let top = boardInnerY(Math.hypot(x, z));
        // 【対策】数百粒になると、1粒落とすたびに全粒のワールド行列を
        //         再計算することになる。まずノードの座標だけで足切りする
        const upTo = (limit === undefined) ? dropIndex : limit;
        for (let i = 0; i < upTo; i++) {
            const q = queue[i], pp = q.e.root.position;
            const reach = rh + q.e.span * 0.62;
            const dx = x - pp.x, dz = z - pp.z;
            if (dx * dx + dz * dz > reach * reach) continue;
            const b = q.e.worldBounds();
            const cx = (b.mnx + b.mxx) * 0.5, cz = (b.mnz + b.mxz) * 0.5;
            const ex = (b.mxx - b.mnx) * 0.5, ez = (b.mxz - b.mnz) * 0.5;
            if (Math.hypot(x - cx, z - cz) < rh + Math.max(ex, ez)) top = Math.max(top, b.mxy);
        }
        return top;
    }

    function clearBodies() {
        // 【対策】シェイプは複数のコピーで共有しているので、ボディごとに
        //         破棄すると2粒目以降で解放済みハンドルを触って落ちる。
        //         シェイプの寿命は原本の Bonbon が持つ
        for (const it of queue) if (it.body) { try { it.body.dispose(); } catch (e) { } }
        // 【対策】分裂の途中で作り直すと、剛体を持たない個体が items に
        //         残って永久に浮く。行き先へ瞬時に送って通常の投入に合流させる
        for (const sp of splits) {
            sp.copy.root.position.copyFrom(sp.to);
            sp.copy.root.scaling.setAll(1);
        }
        splits.length = 0;
        queue = []; dropIndex = 0; dropTimer = 0;
        settleTimer = 0; postDropTimer = 0; frozen = false;
    }

    function attachBody(e, rngLocal) {
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
        void rngLocal;
        return body;
    }

    // 【対策】全部を同時に生成すると、初期状態で互いにめり込んでいるぶんの
    //         反発が一気に解放されて弾け飛ぶ。1粒ずつ、山の頂点のすぐ上から放す
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

        it.body = attachBody(e);
        dropIndex++;
    }

    function resetDrop(seed) {
        clearBodies();
        const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
        const a0 = rng.range(0, TAU);
        // 【対策】撒く範囲を板の中だけに固定すると、300粒を一点に
        //         積むことになって塔が建つ。粒数の平方根で広げる
        const spread = Math.min(GLOBAL.tableRim - 6,
            GLOBAL.boardWell * 0.62 * Math.sqrt(Math.max(1, items.length) / 9));
        for (let i = 0; i < items.length; i++) {
            const e = items[i];
            // 【対策】物理で動かすノードは rotationQuaternion を使う。
            //         Euler の rotation のままだと Havok 側の姿勢と食い違う
            // 【対策】ボンボンは底が平らで重心が低いので、放り込めばほぼ
            //         起き上がる。全部を正立で放すと整列した売り場になるので、
            //         6粒に1粒は伏せて放し、型に接していた底面を見せる
            const flip = (i % 6 === 4) ? Math.PI : 0;
            e.root.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
                flip + rng.gauss(0, 0.30), rng.range(0, TAU), rng.gauss(0, 0.30));
            const r = spread * Math.sqrt(rng.next());
            const a = a0 + i * 2.39996;                 // 黄金角
            queue.push({ e, x: Math.cos(a) * r, z: Math.sin(a) * r, body: null, shape: null });
            if (physics) e.root.setEnabled(false);
        }
        // 【対策】倍増で山が高くなると refitCamera が注視点を持ち上げる。
        //         その値をここで戻さないと、種類を選び直したあとも注視点が
        //         宙に残り、器が画面の下に沈んで「遠くを見ている」状態になる。
        //         半径は build で入れ直されるので気づきにくい
        camTgtY = GLOBAL.boardLip * 0.5;
        // 画角の基準は器の寸法で決める。定数を直に足すと、器の大きさが
        // 違うシーンへ持っていったときに合わなくなる
        camWant = clamp((spread + GLOBAL.boardWell) * 2.30, GLOBAL.boardRim * 2.6, 210);
        camWantT = 1.8;
        if (physics) {
            dropTimer = GLOBAL.dropInterval;
        } else {
            const cols = Math.ceil(Math.sqrt(items.length));
            for (let i = 0; i < items.length; i++) {
                const e = items[i], d = e.span * 1.12;
                e.root.rotationQuaternion = BABYLON.Quaternion.Identity();
                e.root.position.set(
                    ((i % cols) - (cols - 1) / 2) * d,
                    GLOBAL.boardThick,
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
        // 【対策】原本を先に捨てるとインスタンスが連鎖で消え、あとから
        //         コピー側が破棄済みノードを触る。コピーから順に捨てる
        for (const it of items) if (it.isCopy) it.dispose();
        for (const it of items) if (!it.isCopy) it.dispose();
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
            const e = new Bonbon(scene, s.cfg, (seed + i * 7919) >>> 0, s.skin);
            e.attach();
            items.push(e);
        }
        curCfg = items.length ? items[0].cfg : null;

        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        // 【対策】インスタンスは元メッシュがシャドウマップの描画リストに
        //         入っていれば一緒に描かれる。コピーを個別に登録すると
        //         同じジオメトリを何度も描いてシャドウパスだけ重くなる
        for (const e of items) if (!e.isCopy) for (const m of e.parts) sg.addShadowCaster(m, true);
        sg.addShadowCaster(board, true);

        camera.target.set(0, GLOBAL.boardLip * 0.5, 0);
        camera.radius = GLOBAL.boardRim * 2.6;

        resetDrop(seed);
        console.log("[Choco]", BUILD, "/", modeKey, "/ seed =", seed >>> 0, "/", items.length, "粒");
    }

    // =================================================================
    //  バイバイン：クリックした種類だけを毎回2倍にする
    // =================================================================
    const dblRng = new Rng(0x51ED270B);
    let toast = null, toastTimer = 0;

    function say(text) {
        console.log("[Choco]", text);
        if (toast) {
            toast.text = text;
            if (toast.isVisibleProxy) toast.isVisibleProxy.isVisible = true;
            toastTimer = 2.4;
        }
    }

    // 【対策】コピーを原本と同じ場所に「物理付き」で出すと、完全に重なった
    //         2つの剛体をソルバが最短で引き離そうとして、次の1ステップで
    //         互いを弾き飛ばす。数十粒が一斉にやると板ごと吹き飛ぶ。
    //         そこで分裂の瞬間だけ物理を外し、原本の位置から横へ押し出す
    //         アニメーションで重なりを解いてから、改めて剛体にする
    const splits = [];
    const SPLIT_DUR = 0.26;

    function spawnCopy(srcEntry) {
        const src = srcEntry.e;
        const copy = new BonbonCopy(src);
        items.push(copy);

        const p0 = src.root.position;
        // 【対策】分裂先は真上。上げ幅は「原本の実際の背丈」で決める。
        //         厚みの定数で決めると、絞り出しのように背の高い個体や
        //         斜めに刺さっている個体で、コピーが原本にめり込んだまま
        //         剛体化して弾け飛ぶ
        const bb = srcEntry.e.worldBounds();
        // 【対策】上げ幅に余裕を掛けると、増えるたびに隙間が積算されて
        //         スカスカの塔になる。必要なのは「原本の真上に接する」高さ
        //         だけなので、境界箱の高さそのものを使う。傾いて寝ている
        //         個体でも境界箱の高さは実効的な背丈以上あるので、
        //         これで必ず抜ける（+0.03 は接触判定の余裕）
        const rise = (bb.mxy - bb.mny) + 0.03;
        // 完全な垂直に積むと綺麗な柱が建つ。わずかにずらして自然に崩す
        const jit = src.span * 0.06;
        const nx2 = p0.x + dblRng.gauss(0, jit);
        const nz2 = p0.z + dblRng.gauss(0, jit);
        const outward = Math.atan2(nz2 - p0.z, nx2 - p0.x);
        // 【対策】重なって積まれている個体を一斉に分裂させると、下の個体の
        //         コピーが上の個体のコピーと同じ高さに湧く。今回の分裂で
        //         すでに予約された場所を見て、さらに上へ避ける
        let ty = p0.y + rise;
        const reach = src.span * 0.55;
        for (const sp of splits) {
            const dx = nx2 - sp.to.x, dz = nz2 - sp.to.z;
            if (dx * dx + dz * dz > reach * reach) continue;
            ty = Math.max(ty, sp.to.y + sp.rise);
        }

        const q0 = src.root.rotationQuaternion
            ? src.root.rotationQuaternion.clone() : BABYLON.Quaternion.Identity();
        copy.root.rotationQuaternion = q0.multiply(
            BABYLON.Quaternion.FromEulerAngles(
                dblRng.gauss(0, 0.10), dblRng.range(0, TAU), dblRng.gauss(0, 0.10)));
        copy.root.position.copyFrom(p0);
        // 【対策】原寸のまま同じ場所に出すと、分裂ではなく「一瞬ちらついて
        //         隣に現れた」ようにしか見えない。小さく湧いて膨らませると
        //         原本から分かれて出てきたように読める
        copy.root.scaling.setAll(0.78);
        copy.root.computeWorldMatrix(true);

        // 分かれた反動で原本がわずかに沈む。cm 単位・質量 0.22 のシーンなので
        // 力積 0.05 では速度差 0.2cm/s にしかならず、何も起きたように見えない
        if (srcEntry.body) {
            try {
                srcEntry.body.applyImpulse(
                    new V3(dblRng.gauss(0, 0.20), -0.35, dblRng.gauss(0, 0.20)),
                    src.root.absolutePosition);
            } catch (e) { }
        }

        splits.push({
            copy: copy,
            from: new V3(p0.x, p0.y, p0.z),
            to: new V3(nx2, ty, nz2),
            rise: rise,
            hop: 0,
            dir: outward,
            t: 0
        });
    }

    // 分裂アニメの更新。終わったものから剛体にして列へ入れる
    function updateSplits(dt) {
        for (let i = splits.length - 1; i >= 0; i--) {
            const sp = splits[i];
            sp.t += dt / SPLIT_DUR;
            const u = clamp(sp.t, 0, 1);
            const e = u * u * (3 - 2 * u);
            const r = sp.copy.root;
            r.position.set(
                mix(sp.from.x, sp.to.x, e),
                mix(sp.from.y, sp.to.y, e) + Math.sin(Math.PI * u) * sp.hop,
                mix(sp.from.z, sp.to.z, e));
            r.scaling.setAll(mix(0.78, 1.0, e));
            if (u < 1) continue;

            // 【対策】剛体を作る瞬間にスケールが 1 でないと、Havok は
            //         その縮尺で凸包を焼き込む。共有シェイプが縮んで
            //         見た目より小さい当たり判定になる
            r.scaling.setAll(1);
            r.computeWorldMatrix(true);
            const body = attachBody(sp.copy);
            try {
                // 【対策】上向きの初速を残すと、増えるたびに天井知らずで
                //         跳ね上がる。ここは素直に落として積ませる
                body.setLinearVelocity(new V3(
                    dblRng.gauss(0, 0.7), -0.8, dblRng.gauss(0, 0.7)));
            } catch (e2) { }
            queue.push({ e: sp.copy, x: r.position.x, z: r.position.z, body: body });
            dropIndex++;   // すでに投入済みとして数える
            splits.splice(i, 1);
            if (splits.length === 0) { refitCamera(); if (onRebuilt) onRebuilt(); }
        }
    }

    function wakeAll() {
        for (const it of queue) {
            if (!it.body) continue;
            try { it.body.setMotionType(BABYLON.PhysicsMotionType.DYNAMIC); } catch (e) { }
        }
        frozen = false; settleTimer = 0; postDropTimer = 0;
    }

    function doubleType(typeKey) {
        if (!physics) { say("物理が無効なので増やせません"); return; }
        // まだ落下中の粒があると、倍増と投入が重なって山が崩れる
        if (dropIndex < queue.length || splits.length) { say("分裂中です"); return; }
        const label = (TYPES[typeKey] && TYPES[typeKey].label) || typeKey;
        const targets = queue.filter(it => it.body && it.e.cfg.type === typeKey);
        if (!targets.length) return;
        // 【対策】2倍は3回で8倍、7回で128倍になる。上限を切らないと
        //         物理ステップが先に破綻して、増える前に固まる
        const room = GLOBAL.maxPieces - queue.length;
        if (room <= 0) { say("これ以上は増やせません（上限 " + GLOBAL.maxPieces + "粒）"); return; }
        const n = Math.min(targets.length, room);
        wakeAll();
        for (let i = 0; i < n; i++) spawnCopy(targets[i]);
        say(label + " ×2 → " + (targets.length + n) + "粒"
            + (n < targets.length ? "（上限で頭打ち）" : ""));
        if (onRebuilt) onRebuilt();
    }

    function doubleAll() {
        if (!physics) { say("物理が無効なので増やせません"); return; }
        if (dropIndex < queue.length || splits.length) { say("分裂中です"); return; }
        const targets = queue.filter(it => it.body);
        const room = GLOBAL.maxPieces - queue.length;
        if (room <= 0) { say("これ以上は増やせません（上限 " + GLOBAL.maxPieces + "粒）"); return; }
        const n = Math.min(targets.length, room);
        wakeAll();
        for (let i = 0; i < n; i++) spawnCopy(targets[i]);
        say("全種 ×2 → " + (targets.length + n) + "粒"
            + (n < targets.length ? "（上限で頭打ち）" : ""));
        if (onRebuilt) onRebuilt();
    }

    // 【対策】粒数が増えると群れが板からはみ出す。画角を固定したままだと
    //         増えた実感がなく、端が切れているだけに見える。広がりに合わせて引く
    let camWant = 0, camWantT = 0, camTgtY = GLOBAL.boardLip * 0.5;
    function refitCamera() {
        let rmax = GLOBAL.boardRim, ymax = 0;
        for (const it of queue) {
            const pp = it.e.root.position;
            rmax = Math.max(rmax, Math.hypot(pp.x, pp.z) + it.e.span * 0.5);
            ymax = Math.max(ymax, pp.y);
        }
        // 【対策】上へ積む方式にすると山が高くなる。注視点を床に置いたままだと
        //         てっぺんが画面外へ出るし、引くだけでは山が画面の上端に寄る
        camWant = clamp(Math.max(rmax * 2.35, ymax * 3.4), GLOBAL.boardRim * 2.6, 210);
        camTgtY = clamp(ymax * 0.45, GLOBAL.boardLip * 0.5, 40);
        camWantT = 1.6;
    }

    // 【対策】POINTERDOWN で拾うと、カメラを回そうとしただけで増える。
    //         POINTERTAP なら「動かさずに離した」ときだけ来る
    scene.onPointerObservable.add((pi) => {
        if (pi.type !== BABYLON.PointerEventTypes.POINTERTAP) return;
        if (pi.event && pi.event.button !== 0) return;
        const pick = pi.pickInfo || scene.pick(scene.pointerX, scene.pointerY);
        if (!pick || !pick.hit || !pick.pickedMesh) return;
        if (DBG.solo) return;              // 検査中は増やさない
        const t = pick.pickedMesh._pieceType;
        if (t) doubleType(t);
    });

    build(START_MODE, START_SEED);

    scene.onBeforeRenderObservable.add(() => {
        const dtc = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
        if (camWantT > 0) {
            camWantT -= dtc;
            const k = Math.min(1, dtc * 2.4);
            camera.radius += (camWant - camera.radius) * k;
            camera.target.y += (camTgtY - camera.target.y) * k;
        }
        if (physics && splits.length) updateSplits(dtc);
        if (!physics || frozen || queue.length === 0) return;
        const dt = dtc;
        if (dropIndex < queue.length) {
            // 【対策】倍増後は数百粒になる。1粒 0.26 秒のままだと盛り直しに
            //         90 秒かかる。粒数に応じて間隔を詰め、さらに束で落とす
            const iv = queue.length > 24
                ? Math.max(0.035, GLOBAL.dropInterval * 24 / queue.length)
                : GLOBAL.dropInterval;
            const batch = queue.length > 48 ? Math.ceil(queue.length / 48) : 1;
            dropTimer += dt;
            if (dropTimer >= iv) {
                dropTimer = 0;
                for (let k = 0; k < batch && dropIndex < queue.length; k++) spawnNext();
                if (onRebuilt) onRebuilt();
            }
            return;
        }
        if (!GLOBAL.freezeWhenSettled) return;
        postDropTimer += dt;
        // 【対策】静止後もソルバの残差で微振動が続く。速度がしきい値を
        //         下回った状態が続いたら STATIC に固定して止める
        // 分裂アニメ中は静止判定に入れない（固めると途中で止まる）
        let moving = splits.length > 0;
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
        // 【対策】重なったチョコの接触部に影が入らないと、全部が同じ平面に
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
    // 10. Debug  （形が疑わしいときは、まず単体を大きく出して実測する）
    // =================================================================
    const DBG = { solo: false, wire: false, normals: false, guide: true, hull: false, back: false };
    let soloPiece = null, guideMeshes = [], normalMesh = null, physViewer = null;
    let dbgBackMat = null, dbgText = null;

    function clearGuides() {
        for (const m of guideMeshes) m.dispose();
        guideMeshes = [];
        if (normalMesh) { normalMesh.dispose(); normalMesh = null; }
    }

    function line(pts, col, name) {
        const m = BABYLON.MeshBuilder.CreateLines(name || "guide", { points: pts }, scene);
        m.color = col;
        m.isPickable = false;
        m.renderingGroupId = 1;   // チョコの上に必ず描く
        guideMeshes.push(m);
        return m;
    }

    // 外形・断面・目盛りを実寸で引く。
    // 【対策】「形が変」を目視だけで詰めると、法線マップの陰影や被写界深度の
    //         ボケを形の問題と取り違える。設計上の断面と実際のメッシュを
    //         同じ空間に重ねれば、どちらがずれているのか一度で分かる
    function buildGuides(e) {
        clearGuides();
        if (!DBG.guide || !e) return;
        const cfg = e.cfg;
        const yRim = e.H * cfg.hEq;          // 最大径が来る高さ＝赤道

        // 最大径の輪郭（黄）と、その真下への投影（暗い黄）
        const loop = [], proj = [];
        for (let i = 0; i <= 240; i++) {
            const phi = i / 240 * TAU, ro = e.outlineR(phi, cfg.hEq);
            loop.push(new V3(Math.cos(phi) * ro, yRim, Math.sin(phi) * ro));
            proj.push(new V3(Math.cos(phi) * ro, 0.002, Math.sin(phi) * ro));
        }
        line(loop, new BABYLON.Color3(1.0, 0.85, 0.15), "outline");
        line(proj, new BABYLON.Color3(0.45, 0.38, 0.06), "outlineProj");

        // 断面（水色）。4方向を引くと、外形の異方性が断面に効いているか見える
        for (let k = 0; k < 4; k++) {
            const phi = k * Math.PI / 2, pts = [];
            for (let i = 0; i <= 140; i++) {
                const v = mix(0.0035, 0.9965, i / 140);
                const q = e.surfaceAt(v, phi);
                pts.push(new V3(q.x, q.y, q.z));
            }
            line(pts, new BABYLON.Color3(0.25, 0.9, 1.0), "sec" + k);
        }

        // 1cm 目盛り（赤=X, 青=Z）
        const half = Math.ceil(e.span * 0.5) + 1;
        for (let i = -half; i <= half; i++) {
            const h = (i % 5 === 0) ? 0.35 : 0.16;
            line([new V3(i, 0.003, -h), new V3(i, 0.003, h)],
                new BABYLON.Color3(0.85, 0.25, 0.25));
            line([new V3(-h, 0.003, i), new V3(h, 0.003, i)],
                new BABYLON.Color3(0.25, 0.45, 0.9));
        }
    }

    // 頂点法線を線で出す。裏返りや法線マップの符号を見るときに使う
    function buildNormals(e) {
        if (normalMesh) { normalMesh.dispose(); normalMesh = null; }
        if (!DBG.normals || !e || !e.body) return;
        const pos = e.body.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const nor = e.body.getVerticesData(BABYLON.VertexBuffer.NormalKind);
        if (!pos || !nor) return;
        const n = pos.length / 3, step = Math.max(1, Math.floor(n / 1400));
        const L = Math.max(0.08, e.H * 0.22), lines = [], cols = [];
        const cA = new BABYLON.Color4(0.2, 1.0, 0.5, 1), cB = new BABYLON.Color4(1.0, 0.3, 0.1, 1);
        for (let i = 0; i < n; i += step) {
            const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
            const nx = nor[i * 3], ny = nor[i * 3 + 1], nz = nor[i * 3 + 2];
            lines.push([new V3(x, y, z), new V3(x + nx * L, y + ny * L, z + nz * L)]);
            // 重心から見て内向きの法線だけ赤で出す（裏返りが一目で分かる）
            const inward = (nx * x + ny * (y - e.H * 0.5) + nz * z) < 0;
            cols.push([inward ? cB : cA, inward ? cB : cA]);
        }
        normalMesh = BABYLON.MeshBuilder.CreateLineSystem("normals",
            { lines: lines, colors: cols }, scene);
        normalMesh.isPickable = false;
        normalMesh.renderingGroupId = 1;
    }

    function applyWire() {
        for (const k in skinCache) for (const m of skinCache[k].skin.mats) m.wireframe = DBG.wire;
    }

    // 【対策】巻き順の確認を陰影で判断すると、法線マップと環境光に
    //         引きずられて当てにならない。裏面だけを無条件に発光させれば、
    //         裏返っている面がピンクの塊としてそのまま見える
    function applyBack() {
        if (DBG.back && !dbgBackMat) {
            dbgBackMat = new BABYLON.StandardMaterial("dbgBack", scene);
            dbgBackMat.emissiveColor = new BABYLON.Color3(1.0, 0.1, 0.55);
            dbgBackMat.diffuseColor = BABYLON.Color3.Black();
            dbgBackMat.disableLighting = true;
            dbgBackMat.backFaceCulling = true;
            dbgBackMat.sideOrientation = BABYLON.Material.ClockWiseSideOrientation;
        }
        for (const e of items) {
            if (e.isCopy) continue;
            for (const m of e.parts) {
                if (DBG.back) {
                    if (!m._origMat) m._origMat = m.material;
                    m.material = dbgBackMat;
                } else if (m._origMat) {
                    m.material = m._origMat; m._origMat = null;
                }
            }
        }
    }

    // 【対策】この PhysicsViewer も UtilityLayerRenderer の上に描かれる。
    //   GUI 専用カメラを分離したままだと、Inspector の Physics Helper と
    //   同じ理由で何も出ない。bindDebugCamera() が両方まとめて直す
    function applyHull() {
        if (!DBG.hull) {
            if (physViewer) { try { physViewer.dispose(); } catch (e) { } physViewer = null; }
            return;
        }
        try {
            physViewer = new BABYLON.Debug.PhysicsViewer(scene);
            for (const it of queue) if (it.body) physViewer.showBody(it.body);
        } catch (e) { console.warn("[Choco] PhysicsViewer を使えません", e); }
    }

    function dbgReport(e) {
        if (!e) return "";
        const cfg = e.cfg;
        let rmin = Infinity, rmax = 0;
        for (let i = 0; i < 360; i++) {
            const r = e.outlineR(i / 360 * TAU, cfg.hEq) / e.R;
            rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
        }
        // 接地半径と赤道半径の比。1 に近いほど型抜き、小さいほど手掛けの球
        const foot = cfg.rBase;
        e.root.computeWorldMatrix(true);
        const b = e.worldBounds();
        const mesh = e.body;
        const nv = mesh ? mesh.getTotalVertices() : 0;
        const nf = mesh ? (mesh.getTotalIndices() / 3) : 0;
        return cfg.label + "  [" + cfg.type + "]\n"
            + "外形 " + cfg.form + " R=" + e.R.toFixed(2)
            + " aspect=" + (cfg.aspect || 1) + " n=" + (cfg.nExp || 2)
            + "  半径比 " + rmin.toFixed(2) + "〜" + rmax.toFixed(2) + "\n"
            + "断面 hEq=" + cfg.hEq + " nUp=" + cfg.nUp + " nDn=" + cfg.nDn
            + " rBase=" + foot + " draft=" + cfg.draft + "\n"
            + "設計 " + (e.R * (cfg.aspect || 1) * rmax * 2).toFixed(2)
            + " × " + (e.R * rmax * 2).toFixed(2) + " × " + e.H.toFixed(3) + " cm\n"
            + "実測 " + (b.mxx - b.mnx).toFixed(2) + " × " + (b.mxz - b.mnz).toFixed(2)
            + " × " + (b.mxy - b.mny).toFixed(3) + " cm\n"
            + "艶 粗さ " + cfg.roughBase.toFixed(3) + " / コート " + cfg.coat.toFixed(2)
            + " / SSS " + cfg.sss.toFixed(2) + "\n"
            + "頂点 " + nv + " / 面 " + nf
            + "  巻き順スコア " + (mesh && mesh._windScore !== undefined
                ? mesh._windScore.toFixed(0) + (mesh._windFlipped ? "（反転を修正）" : "") : "-");
    }

    // 単体表示。物理を止めて原点に1粒だけ置く
    function buildSolo(typeKey, seed) {
        clearBodies();
        for (const it of items) if (it.isCopy) it.dispose();
        for (const it of items) if (!it.isCopy) it.dispose();
        items = [];
        clearGuides();

        const key = (typeKey === "assort") ? ASSORT[0] : typeKey;
        const sk = skinFor(key);
        const e = new Bonbon(scene, sk.cfg, seed >>> 0, sk.skin);
        e.attach();
        e.root.position.set(0, 0, 0);
        e.root.rotationQuaternion = BABYLON.Quaternion.Identity();
        e.root.setEnabled(true);
        items.push(e);
        soloPiece = e;
        curCfg = e.cfg;

        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        for (const m of e.parts) sg.addShadowCaster(m, true);

        buildGuides(e);
        buildNormals(e);
        applyWire();
        applyBack();

        camera.target.set(0, e.H * 0.5, 0);
        camWant = e.span * 2.6; camTgtY = e.H * 0.5; camWantT = 1.6;
        console.log("[Choco/DEBUG]\n" + dbgReport(e));
        if (onRebuilt) onRebuilt();
    }

    function rebuildCurrent() {
        if (DBG.solo) buildSolo(curMode, curSeed);
        else { soloPiece = null; clearGuides(); build(curMode, curSeed); applyWire(); applyBack(); }
    }

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
    //                              （このシーンの「当たり判定」ボタンも同じ）
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
        //   cameraToUseForPointers は InputManager が通る経路にしか効かない。
        //   このシーンは「チョコをクリックで倍増」でも scene.pick を使うので、
        //   ここが戻っていないとクリック判定そのものが外れる
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
        idle: "#241a15", active: "#8a5a2c", edge: "#463428",
        text: "#f3e7d8", sub: "#bfa285", accent: "#dda86a"
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

    addLabel("CHOCOLATES", 11, COL.sub, "18px");
    addLabel("チョコをクリックすると、その種類だけ2倍に増えます。", 11, COL.sub, "32px");
    addLabel("種類", 13, COL.accent, "22px");

    const modeBtns = {}, countBtns = {};
    function highlight() {
        for (const k in modeBtns) modeBtns[k].background = (k === curMode) ? COL.active : COL.idle;
        for (const k in countBtns) countBtns[k].background = (+k === GLOBAL.count) ? COL.active : COL.idle;
    }
    modeBtns["assort"] = addButton("m_assort", "詰め合わせ", () => {
        curMode = "assort"; rebuildCurrent(); highlight();
    });
    for (const k of Object.keys(TYPES)) {
        modeBtns[k] = addButton("m_" + k, TYPES[k].label, () => {
            curMode = k; rebuildCurrent(); highlight();
        });
    }

    addLabel("盛る量", 13, COL.accent, "26px");
    for (const c of [5, 9, 14]) {
        countBtns[c] = addButton("c" + c, ["少なめ", "ふつう", "多め"][[5, 9, 14].indexOf(c)], () => {
            GLOBAL.count = c; rebuildCurrent(); highlight();
        });
    }

    const sp = new BABYLON.GUI.Rectangle();
    sp.height = "8px"; sp.thickness = 0; sp.background = "";
    panel.addControl(sp);

    addButton("dblall", "全種を2倍", () => { doubleAll(); });
    addButton("drop", "盛り直す", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        resetDrop(curSeed);
    });
    addButton("reseed", "別の個体を作る", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        rebuildCurrent(); highlight();
    });
    addButton("refit", "画角を合わせる", () => { refitCamera(); });
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

    // 倍増の結果を知らせる帯（画面上部）
    const toastRect = new BABYLON.GUI.Rectangle("toast");
    toastRect.height = "34px"; toastRect.width = "340px";
    toastRect.cornerRadius = 8; toastRect.thickness = 1;
    toastRect.color = COL.edge; toastRect.background = "rgba(22,15,10,0.86)";
    toastRect.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
    toastRect.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    toastRect.top = "18px";
    toastRect.isVisible = false;
    ui.addControl(toastRect);
    toast = new BABYLON.GUI.TextBlock();
    toast.color = COL.accent; toast.fontSize = 14;
    toastRect.addControl(toast);
    toast.isVisibleProxy = toastRect;
    scene.onBeforeRenderObservable.add(() => {
        if (toastTimer <= 0) return;
        toastTimer -= Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
        if (toastTimer <= 0) toastRect.isVisible = false;
    });

    addLabel("デバッグ", 13, COL.accent, "26px");
    const dbgBtns = {};
    function dbgBtn(id, label, fn) {
        const b = addButton("dbg_" + id, label, () => {
            fn();
            b.background = DBG[id] ? COL.active : COL.idle;
            if (onRebuilt) onRebuilt();
        });
        dbgBtns[id] = b;
        b.background = DBG[id] ? COL.active : COL.idle;
        return b;
    }
    dbgBtn("solo", "単体表示", () => { DBG.solo = !DBG.solo; rebuildCurrent(); });
    dbgBtn("wire", "ワイヤーフレーム", () => { DBG.wire = !DBG.wire; applyWire(); });
    dbgBtn("guide", "外形・断面ガイド", () => {
        DBG.guide = !DBG.guide; buildGuides(soloPiece);
    });
    dbgBtn("normals", "頂点法線", () => {
        DBG.normals = !DBG.normals; buildNormals(soloPiece);
    });
    dbgBtn("back", "裏面チェック", () => { DBG.back = !DBG.back; applyBack(); });
    dbgBtn("hull", "当たり判定", () => { DBG.hull = !DBG.hull; applyHull(); });

    // 実測値の読み出し（単体表示のときだけ出す）
    const dbgRect = new BABYLON.GUI.Rectangle("dbgRect");
    dbgRect.width = "372px"; dbgRect.adaptHeightToChildren = true;
    dbgRect.cornerRadius = 8; dbgRect.thickness = 1;
    dbgRect.color = COL.edge; dbgRect.background = "rgba(12,20,16,0.86)";
    dbgRect.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    dbgRect.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    dbgRect.left = "-16px"; dbgRect.top = "-16px";
    dbgRect.isVisible = false;
    ui.addControl(dbgRect);
    dbgText = new BABYLON.GUI.TextBlock();
    dbgText.text = ""; dbgText.color = "#9fe8c0"; dbgText.fontSize = 12;
    dbgText.fontFamily = "monospace";
    dbgText.textWrapping = true;
    dbgText.resizeToFit = true;
    dbgText.paddingTop = "10px"; dbgText.paddingBottom = "10px";
    dbgText.paddingLeft = "12px"; dbgText.paddingRight = "12px";
    dbgText.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    dbgRect.addControl(dbgText);
    dbgText.hostRect = dbgRect;

    const info = addLabel("", 12, COL.sub, "44px");
    onRebuilt = () => {
        if (dbgText && dbgText.hostRect) {
            if (DBG.solo && soloPiece) {
                dbgText.text = dbgReport(soloPiece);
                dbgText.hostRect.isVisible = true;
            } else {
                dbgText.hostRect.isVisible = false;
            }
        }
        if (!info) return;
        const e = items[0];
        if (!e) { info.text = ""; return; }
        const state = !physics ? "物理なし"
            : (dropIndex < queue.length ? "投入中 " + dropIndex + "/" + queue.length
                : (frozen ? "静止" : "落下中"));
        const kinds = new Set(items.map(x => x.cfg.label));
        const what = curMode === "assort" ? kinds.size + "種" : (curCfg ? curCfg.label : "");
        info.text = state + " / " + items.length + "粒（上限 " + GLOBAL.maxPieces + "） / " + what + "\n"
            + "径 " + e.span.toFixed(1) + "cm 高 " + e.H.toFixed(2) + "cm  seed: " + curSeed;
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