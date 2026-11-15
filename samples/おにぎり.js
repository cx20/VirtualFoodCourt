// =====================================================================
//  Photoreal Onigiri  /  写実的な「おにぎり」（三角むすび）
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  ごはん.js / お寿司.js の続き。米粒そのものの造形・マテリアル・
//  「粒間の暗がり」の焼き込みは前段で詰め切ったので、そのまま流用する。
//  新しいのは次の3つ。
//
//   (1) 三角むすびの形
//       おにぎりは「三角柱」ではない。角丸の三角形を断面に持ち、
//       面も辺も全部ふくらんだ座布団型。角柱を丸めるのではなく、
//       角丸三角形 × 超だ円の掃引で最初から丸い形を作る。
//
//   (2) 海苔
//       海苔は板ではなく、米に貼りついた 0.1mm の膜。
//       ・米の凹凸に沿って波打つ。平らな板を巻くと折り紙になる
//       ・逆光で暗緑色に透ける。不透明な黒にすると炭の板になる
//       ・端は米から少し浮いて反る
//
//   (3) 海苔に隠れる粒
//       海苔の下の粒は見えない。そのまま置くと膜を突き抜けて
//       「海苔から米が生えている」状態になるので、被覆率から
//       沈み込みを決め、完全に隠れる粒は最初から作らない。
//
//  構成:
//    0. CONFIG        … ごはんの種類 / 海苔 / おにぎりの寸法
//    1. Rng           … シード付き擬似乱数
//    2. Noise         … 周期2D値ノイズ / 3D値ノイズ
//    3. TextureLab    … 米の 法線 / ORM / クリアコート / 厚み
//    4. GrainGeometry … 米粒の掃引メッシュ
//    5. GrainAssets   … 米のPBRマテリアル
//    6. Shape         … 角丸三角形 × 超だ円 = おにぎりの形
//    7. Body          … 粒のすき間を埋める下地
//    8. Grains        … 粒の配置 / 擬似AO / 焦げと色ムラ
//    9. NoriLab       … 海苔のテクスチャ
//   10. Nori          … 海苔の巻き付けメッシュ
//   11. Board         … 木の台
//   12. Scene / GUI
// =====================================================================

var createScene = function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    // 単位系: 1 unit = 1 cm。米粒だけ mm で書きたいので変換定数を持つ
    const MM = 0.1;

    // ---- ごはんの種類 -------------------------------------------------
    const RICE = {
        // 塩むすび: 炊きたての白米を握ったもの。写真の主役
        shio: {
            label: "塩むすび",
            lengthMM: 5.55, widthMM: 2.82, heightMM: 2.18,
            albedo: [0.950, 0.930, 0.876],
            baseRough: 0.33,
            // 【対策】握った米は茶碗のごはんより表面の水が飛んでいる。
            //         炊きたてと同じ 0.78 にすると全体が濡れて光り、
            //         「握った直後にラップから出した」状態になる。
            coatIntensity: 0.60, coatRough: 0.18,
            translucency: 0.42,
            tint: [0.99, 0.965, 0.925],
            crackAmount: 0.00,
            puff: 0.052, grooveDepth: 0.020, endSwell: 0.052,
            bumpLevel: 0.20, wetMottle: 0.34,
            // 握りは「締める」ので沈みは浅い。ただし手でふんわり握った
            // おにぎりは、寿司のシャリよりは粒が立っている
            grainSink: [0.00, 0.16], grainLift: 0.16, grainLiftRatio: 0.26,
            tintJitter: 0.030,     // 粒ごとの色のばらつき
            char: 0.0,             // 焦げ
            glaze: 1.0,            // 照りの倍率
            bodyBright: 0.90,
            defaultNori: "pari"
        },
        // 玄米: ぬか層が残っているので褐色。糊化が浅く透光がほとんど無い
        genmai: {
            label: "玄米",
            lengthMM: 5.30, widthMM: 2.90, heightMM: 2.30,
            albedo: [0.700, 0.578, 0.412],
            baseRough: 0.54,
            coatIntensity: 0.26, coatRough: 0.32,
            // 【対策】白米と同じ透光にすると、ぬか層の下で光が回って
            //         「あめ色のビーズ」になる。玄米はほとんど透けない。
            translucency: 0.13,
            tint: [0.86, 0.70, 0.48],
            crackAmount: 0.14,
            puff: 0.046, grooveDepth: 0.030, endSwell: 0.028,
            bumpLevel: 0.32, wetMottle: 0.58,
            grainSink: [0.00, 0.14], grainLift: 0.14, grainLiftRatio: 0.22,
            // 【対策】玄米の説得力はここ。ぬかの残り方が粒ごとに違うので、
            //         実物は白っぽい粒と茶色い粒がはっきり混ざる。
            //         色を揃えると「木彫りの米」になる。
            tintJitter: 0.105,
            char: 0.0,
            glaze: 0.85,
            bodyBright: 0.86,
            defaultNori: "pari"
        },
        // 焼きおにぎり: 醤油を塗って網で焼いたもの。海苔は巻かない
        yaki: {
            label: "焼きおにぎり",
            lengthMM: 5.45, widthMM: 2.86, heightMM: 2.16,
            albedo: [0.925, 0.868, 0.740],
            baseRough: 0.36,
            coatIntensity: 0.72, coatRough: 0.15,
            translucency: 0.24,
            tint: [0.96, 0.86, 0.66],
            crackAmount: 0.05,
            puff: 0.050, grooveDepth: 0.022, endSwell: 0.040,
            bumpLevel: 0.24, wetMottle: 0.26,
            // 【対策】焼く前に強く握って締めてあるので、粒はほとんど立たない。
            //         浮いた粒を残すと、網の上で崩れなかった理由が無くなる。
            grainSink: [0.02, 0.20], grainLift: 0.07, grainLiftRatio: 0.10,
            tintJitter: 0.045,
            char: 1.0,
            // 醤油のたれは乾いても膜として残り、面全体が一枚の照りになる
            glaze: 1.85,
            bodyBright: 0.72,
            // 【対策】下地を白いままにすると、粒のすき間から生米の色が
            //         のぞいて「表面だけ塗った」ように見える
            bodyTint: [0.615, 0.410, 0.190],
            defaultNori: "none"
        }
    };

    // ---- 焦げ（焼きおにぎり用）----------------------------------------
    // 【対策】焦げをアルベドの一様な茶色でやると、醤油に浸けた
    //         スポンジになる。実物は「網に当たった面だけ」が濃く、
    //         稜と角はきつね色、へこみは白いまま。面の向きで決めること。
    const CHAR = {
        gold: [0.86, 0.62, 0.30],     // きつね色
        deep: [0.44, 0.215, 0.092],   // 焦げ
        faceLo: 0.30, faceHi: 0.90,   // |nz| のしきい値（面に当たった度合い）
        mottle: 0.85                  // 焦げムラの強さ
    };

    // ---- 海苔 ---------------------------------------------------------
    // 色はすべて sRGB。アルベドはテクスチャに焼くのでそのまま書ける
    const NORI = {
        pari: {
            label: "パリパリ",
            base: [0.072, 0.086, 0.062],   // ほぼ黒。わずかに緑
            green: [0.150, 0.185, 0.088],  // 薄い所に出る緑
            fiber: 0.62,                   // 繊維のコントラスト
            thinSpot: 0.42,                // 薄い斑の量
            rough: 0.58,
            coat: 0.30, coatRough: 0.28,   // 焼き海苔のかすかな艶
            translucency: 0.34,
            tint: [0.28, 0.42, 0.14],      // 透けたときの色
            wrinkle: 0.055,                // 膜のうねり
            edgeCurl: 0.13,                // 端の反り
            gap: 0.075                     // 米からの浮き cm
        },
        shittori: {
            label: "しっとり",
            // 【対策】湿気を吸った海苔は「色が濃くなる」のではなく
            //         「表面が平らになって反射が増える」。アルベドを
            //         真っ黒にすると、ただの黒い紙になる。
            base: [0.058, 0.070, 0.052],
            green: [0.115, 0.148, 0.072],
            fiber: 0.42,
            thinSpot: 0.26,
            rough: 0.40,
            coat: 0.72, coatRough: 0.14,
            translucency: 0.26,
            tint: [0.22, 0.34, 0.12],
            wrinkle: 0.028,
            edgeCurl: 0.05,
            gap: 0.055
        },
        none: { label: "なし" }
    };

    // ---- おにぎりの寸法（実寸 cm）--------------------------------------
    const SHAPE = {
        baseW: 7.30,        // 底辺の幅
        hgt: 6.70,          // 高さ（底辺 → 頂点）
        thick: 3.55,        // 厚み
        // 【対策】角を丸めない三角柱にすると、どれだけ米を貼っても
        //         「握った」に見えない。手で握ると角から先に潰れる。
        //         この指数が角の鋭さ。大きいほど尖る（∞ で真の三角形）。
        triSharp: 5.0,
        // 【対策】この2つを 2.0（＝だ円体）にすると座布団ではなく
        //         レンズになり、三角形の「面」が消える。3.2〜3.6 で
        //         平らな面と丸い稜が同居する。6 まで上げると角柱に戻る。
        faceP: 3.30,        // 周方向の超だ円指数（＝稜の丸み）
        edgeQ: 3.15,        // 厚み方向の超だ円指数（＝面の平らさ）
        handLump: 0.028,    // 手の跡（低周波の歪み）
        palmDent: 0.055,    // 手のひらが当たった面中央のへこみ
        bottomFlat: 0.022,  // 接地して潰れた底辺
        seg: { psi: 56, phi: 132 }
    };

    // ---- 状態によらない共通設定 ----------------------------------------
    const GLOBAL = {
        pieces: 2,            // 並べる個数
        pitchCM: 7.70,        // 個数が2以上のときの間隔

        // 米粒
        grainRings: 14,
        grainSides: 13,
        // 【対策】粒数を固定値で持つと、寸法をいじった瞬間に密度が変わって
        //         下地が透ける。お寿司.js のシャリは表面積 36.1cm² に
        //         1500粒 ＝ 41.5粒/cm² で、あの密度でようやく下地が隠れる。
        //         おにぎりは表面積が約 108cm² もあるので、同じ「粒数」で
        //         考えると 1/3 の密度になり、面の真ん中に素体が露出する。
        //         粒数ではなく「面積あたりの密度」で持つこと。
        grainPerCm2: 42,
        grainCountMax: 6000,  // 1個あたりの上限（描画負荷の歯止め）
        grainVariants: 6,
        texNormal: 512,
        texOther: 256,
        sizeSd: 0.055,
        bend: 0.030,
        asym: 0.86,
        endPow: 2.7,
        endRound: 0.48,
        tipTaper: 0.13,
        sectionP: 2.05,
        clusterSize: 3,

        // 粒間の暗がり
        aoFloor: 0.44,
        // 【対策】ここを粒の沈み込みの幅（grainSink）より大きく取ると、
        //         どの粒も近傍最高点と同じ高さ扱いになって暗がりが出ない。
        aoDepth: 0.28,
        aoDown: 0.46,         // 下を向いた粒の追加の暗さ
        aoStrength: 1.0,

        // 海苔
        noriHalfW: 1.92,      // 幅の半分（底辺方向）cm
        noriAlphaEnd: 2.02,   // 巻き上げる角度 rad（0 = 真下）
        noriSegX: 46,
        noriSegA: 74,
        noriTex: 1024,

        // 台
        boardLen: 26.0, boardWid: 15.0, boardHgt: 1.20,
        boardTex: 1024,
        // 板テクスチャ1タイルの実寸。板の対角より大きく取れば継ぎ目が出ない
        boardTileCM: 32.0,

        useSSAO: true,
        useDOF: true,
        dofRatio: 0.058,
        dofFStop: 2.6
    };

    const START_RICE = "shio";
    const START_SEED = 20260810;

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
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    // sRGB → リニア。PBRMaterial.albedoColor はリニア空間なので必ず通す
    const s2l = (c) => (c <= 0.04045) ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const col3 = (a) => new BABYLON.Color3(s2l(a[0]), s2l(a[1]), s2l(a[2]));
    function angDist(a, b) {
        let d = Math.abs(a - b) % TAU;
        if (d > Math.PI) d = TAU - d;
        return d;
    }

    // =================================================================
    // 2. Noise
    // =================================================================
    const Noise = {
        _h2(x, y, seed) {
            let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177);
            return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
        },
        _h3(x, y, z, seed) {
            let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
                ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177);
            return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
        },
        // X方向だけ周期的な2D値ノイズ（周方向UVの継ぎ目を消すため）
        value2(x, y, period, seed) {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            const p = period | 0;
            let x0 = xi % p; if (x0 < 0) x0 += p;
            let x1 = (xi + 1) % p; if (x1 < 0) x1 += p;
            const a = this._h2(x0, yi, seed), b = this._h2(x1, yi, seed);
            const c = this._h2(x0, yi + 1, seed), d = this._h2(x1, yi + 1, seed);
            return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
        },
        fbm2(x, y, period, seed, oct) {
            let sum = 0, amp = 0.5, f = 1;
            for (let o = 0; o < oct; o++) {
                sum += amp * this.value2(x * f, y * f, period * f, seed + o * 131);
                f *= 2; amp *= 0.5;
            }
            return sum;
        },
        // 3D値ノイズ。形状のゆらぎに使う（継ぎ目が原理的に出ない）
        value3(x, y, z, seed) {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            const xf = x - xi, yf = y - yi, zf = z - zi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
            const H = this._h3.bind(this);
            const c000 = H(xi, yi, zi, seed), c100 = H(xi + 1, yi, zi, seed);
            const c010 = H(xi, yi + 1, zi, seed), c110 = H(xi + 1, yi + 1, zi, seed);
            const c001 = H(xi, yi, zi + 1, seed), c101 = H(xi + 1, yi, zi + 1, seed);
            const c011 = H(xi, yi + 1, zi + 1, seed), c111 = H(xi + 1, yi + 1, zi + 1, seed);
            const x00 = mix(c000, c100, u), x10 = mix(c010, c110, u);
            const x01 = mix(c001, c101, u), x11 = mix(c011, c111, u);
            return mix(mix(x00, x10, v), mix(x01, x11, v), w);
        },
        fbm3(x, y, z, seed, oct) {
            let sum = 0, amp = 0.5, f = 1;
            for (let o = 0; o < oct; o++) {
                sum += amp * this.value3(x * f, y * f, z * f, seed + o * 131);
                f *= 2; amp *= 0.5;
            }
            return sum;
        }
    };

    // =================================================================
    // 3. TextureLab : 米粒のテクスチャ
    //    UV: u = 周方向（周期的） / v = 長さ方向
    // =================================================================
    const TextureLab = {
        _canvas(name, size, fill, scene) {
            const dt = new BABYLON.DynamicTexture(name, { width: size, height: size }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(size, size);
            fill(img.data, size);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = false;
            return dt;
        },

        // 胴割れ。腹側から入って途中で止まる短い弧にする
        _cracks(rng, amount) {
            const n = Math.round(mix(0, 2.4, clamp(amount, 0, 1)));
            const out = [];
            for (let i = 0; i < n; i++) {
                out.push({
                    v: rng.range(0.16, 0.84),
                    u0: rng.next(),
                    arc: rng.range(0.16, 0.42),
                    tilt: rng.range(-0.10, 0.10),
                    w: rng.range(0.0016, 0.0032),
                    d: rng.range(0.55, 1.0) * clamp(amount, 0, 1.2)
                });
            }
            return out;
        },

        // 高さ場（法線マップとAOの元）
        _height(size, seed, cfg, cracks) {
            const P = 8;
            const h = new Float32Array(size * size);
            for (let y = 0; y < size; y++) {
                const v = y / size;
                const poleFade = smooth(0, 0.10, v) * (1 - smooth(0.90, 1.0, v));
                for (let x = 0; x < size; x++) {
                    const u = x / size;
                    // (a) デンプン粒の肌理。高周波側に重みを寄せる。
                    //     なめらかにすると水膜のハイライトが1粒に1つの
                    //     大きな塊になり、白い錠剤に見える
                    let e = Noise.fbm2(u * P * 6.5, v * P * 6.5, P * 6.5, seed, 2) * 0.34
                        + Noise.fbm2(u * P * 14, v * P * 14, P * 14, seed + 77, 1) * 0.36
                        + Noise.fbm2(u * P * 28, v * P * 28, P * 28, seed + 151, 1) * 0.30;
                    e = (e - 0.5) * 0.17;
                    // (b) 長さ方向の弱い筋。強くすると「まゆ」に見える
                    e += 0.012 * Math.sin(u * TAU * 11 + Noise.value2(v * 3, 0, 3, seed + 5) * 6);
                    // (c) 炊いた粒は端がふくれて細かいシワが出る
                    const endW = smooth(0.62, 0.86, v) + (1 - smooth(0.14, 0.38, v));
                    e += cfg.endSwell * 2.2 * endW
                        * (Noise.fbm2(u * P * 9, v * P * 9, P * 9, seed + 313, 2) - 0.5);
                    // (d) 胴割れ
                    for (let ci = 0; ci < cracks.length; ci++) {
                        const c = cracks[ci];
                        let du = u - c.u0;
                        du -= Math.round(du);
                        const half = c.arc * 0.5;
                        if (Math.abs(du) >= half) continue;
                        const dv = v - (c.v + c.tilt * du);
                        const along = 1 - Math.pow(Math.abs(du) / half, 2);
                        e -= c.d * 0.26 * along * Math.exp(-(dv * dv) / (c.w * c.w));
                    }
                    h[y * size + x] = e * poleFade;
                }
            }
            return h;
        },

        // 法線マップ。G成分の符号は (上 - 下)。
        // 逆にすると割れ目が「盛り上がった土手」に見えて一発で嘘になる
        normalMap(scene, size, h, level) {
            return this._canvas("riceNormal", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    for (let x = 0; x < S; x++) {
                        const xl = h[y * S + ((x - 1 + S) % S)], xr = h[y * S + ((x + 1) % S)];
                        const yu = h[Math.max(0, y - 1) * S + x], yd = h[Math.min(S - 1, y + 1) * S + x];
                        let nx = (xl - xr) * level * S * 0.06;
                        let ny = (yu - yd) * level * S * 0.06;
                        let nz = 1;
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const i = (y * S + x) * 4;
                        d[i] = (nx * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // ORM (R=AO, G=Roughness, B=Metallic)
        ormMap(scene, size, hSmall, cfg, seed) {
            const P = 5;
            return this._canvas("riceORM", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    const v = y / S;
                    for (let x = 0; x < S; x++) {
                        const k = y * S + x, u = x / S;
                        const e = hSmall[k];
                        const cav = clamp(-e * 3.2, 0, 1);
                        const n = Noise.fbm2(u * P, v * P, P, seed, 3);
                        const ao = clamp(0.97 - 0.28 * cav - 0.04 * (1 - n), 0, 1);
                        const rough = clamp(cfg.baseRough * (0.88 + 0.30 * n) + 0.22 * cav, 0.05, 1);
                        const i = k * 4;
                        d[i] = ao * 255; d[i + 1] = rough * 255; d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // クリアコート = 表面の水（または醤油だれ）の膜。R=強度 / G=粗さ
        coatMap(scene, size, cfg, seed) {
            const P = 4;
            return this._canvas("riceCoat", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    const v = y / S;
                    for (let x = 0; x < S; x++) {
                        const u = x / S;
                        const cloud = Noise.fbm2(u * P, v * P * 0.8, P, seed, 3);
                        const fine = Noise.fbm2(u * P * 3.5, v * P * 3.0, P * 3.5, seed + 61, 2);
                        const dry = smooth(0.52, 0.78, cloud) * cfg.wetMottle;
                        const inten = clamp(cfg.coatIntensity * (1 - 0.85 * dry) * (0.86 + 0.20 * fine), 0, 1);
                        const rough = clamp(cfg.coatRough * (0.85 + 0.45 * fine) + 0.30 * dry, 0.02, 1);
                        const i = (y * S + x) * 4;
                        d[i] = inten * 255; d[i + 1] = rough * 255; d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // 厚みマップ（subSurface の R）。端と縁は薄い＝そこだけ強く透ける
        thicknessMap(scene, size, profFn, seed) {
            return this._canvas("riceThick", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    const v = y / S;
                    const t = clamp(profFn(v), 0, 1);
                    for (let x = 0; x < S; x++) {
                        const u = x / S;
                        const n = Noise.fbm2(u * 4, v * 4, 4, seed, 2);
                        const th = clamp(Math.pow(t, 0.75) * (0.86 + 0.24 * n), 0, 1);
                        const i = (y * S + x) * 4;
                        d[i] = th * 255; d[i + 1] = th * 255; d[i + 2] = th * 255; d[i + 3] = 255;
                    }
                }
            }, scene);
        }
    };

    // =================================================================
    // 4. GrainGeometry : 米粒の掃引メッシュ
    // =================================================================
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
        const L = cfg.lengthMM * MM * clamp(kL, 0.82, 1.18);
        const halfWmax = cfg.widthMM * MM * 0.5 * clamp(kW, 0.82, 1.18);
        const halfHmax = cfg.heightMM * MM * 0.5 * clamp(kH, 0.82, 1.18);
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
        const colors = new Float32Array(nV * 4).fill(1);
        const indices = new Uint32Array(nT * nS * 6);

        // 断面の超だ円（角の丸い四角に寄せると「米」らしくなる）
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
                const groove = cfg.grooveDepth * Math.exp(-Math.pow(dv / 0.52, 2))
                    * Math.pow(Math.sin(Math.PI * t), 0.45);
                r -= groove;

                // (b) 胚芽の欠け
                const dg = angDist(th, germPhi);
                const dt2 = (t - germT) / 0.070;
                r -= germDepth * Math.exp(-dt2 * dt2) * Math.exp(-Math.pow(dg / 0.85, 2));

                // (c) 膨らみのゆらぎ。2階層にして輪郭を崩す
                const puff = (Noise.value3(cth * 2.1 + ph, sth * 2.1 + ph, t * 3.4 + ph, nseed) - 0.5) * 2;
                const puff2 = (Noise.value3(cth * 5.4 + ph, sth * 5.4 + ph, t * 8.2 + ph, nseed + 7) - 0.5) * 2;
                r *= 1 + cfg.puff * (puff + 0.55 * puff2);
                r = Math.max(0, r);

                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = x;
                positions[p3 + 1] = spineY + halfHmax * r * sth;
                positions[p3 + 2] = halfWmax * r * cth;
                uvs[p2] = j / nS;
                uvs[p2 + 1] = t;
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

        // 巻き順は断面をどちら回りに取ったかで簡単に裏返る。実測で判定する
        {
            const pi = Math.round(nT * 0.45) * (nS + 1);
            if (normals[pi * 3 + 2] < 0) {
                for (let k = 0; k < indices.length; k += 3) {
                    const tmp = indices[k + 1];
                    indices[k + 1] = indices[k + 2];
                    indices[k + 2] = tmp;
                }
                BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            }
        }

        // 周方向の継ぎ目を法線の加算で溶接する
        for (let i = 0; i <= nT; i++) {
            const a = (i * (nS + 1)) * 3, b = (i * (nS + 1) + nS) * 3;
            let nx = normals[a] + normals[b];
            let ny = normals[a + 1] + normals[b + 1];
            let nz = normals[a + 2] + normals[b + 2];
            const l = Math.hypot(nx, ny, nz) || 1;
            nx /= l; ny /= l; nz /= l;
            normals[a] = normals[b] = nx;
            normals[a + 1] = normals[b + 1] = ny;
            normals[a + 2] = normals[b + 2] = nz;
        }

        const vd = new BABYLON.VertexData();
        vd.positions = positions;
        vd.normals = normals;
        vd.uvs = uvs;
        vd.colors = colors;
        vd.indices = indices;
        return { vd, info: { L, halfWmax, halfHmax, tris: nT * nS * 2, verts: nV } };
    }

    // =================================================================
    // 5. GrainAssets : 米のテクスチャとPBRマテリアル
    // =================================================================
    class GrainAssets {
        constructor(scene, cfg) {
            this.scene = scene;
            this.cfg = cfg;
            const rng = new Rng(cfg.seed ^ 0x5A5A);
            const SN = cfg.texNormal, SO = cfg.texOther;

            const cracks = TextureLab._cracks(rng, cfg.crackAmount);
            const hBig = TextureLab._height(SN, 1234, cfg, cracks);
            const hSmall = TextureLab._height(SO, 1234, cfg, cracks);

            this.texNormal = TextureLab.normalMap(scene, SN, hBig, cfg.bumpLevel);
            this.texORM = TextureLab.ormMap(scene, SO, hSmall, cfg, 500);
            this.texCoat = TextureLab.coatMap(scene, SO, cfg, 811);
            this.texThick = TextureLab.thicknessMap(scene, SO, (v) => profileAt(v, cfg), 1607);
            this.mats = [];
        }

        // scale: このマテリアルを貼るメッシュのワールド倍率。
        // subSurface の厚みはワールド単位なので、倍率ごとに分ける必要がある
        makeMaterial(name, scale) {
            const cfg = this.cfg;
            const pbr = new BABYLON.PBRMaterial(name, this.scene);
            pbr.albedoColor = col3(cfg.albedo);
            pbr.metallic = 0.0;
            pbr.roughness = 1.0;                 // 実値はORMのGチャンネル
            pbr.metallicTexture = this.texORM;
            pbr.useAmbientOcclusionFromMetallicTextureRed = true;
            pbr.useRoughnessFromMetallicTextureGreen = true;
            pbr.useMetallnessFromMetallicTextureBlue = true;

            pbr.bumpTexture = this.texNormal;
            pbr.bumpTexture.level = 1.0;

            // --- 表面の膜。米の艶はこれが本体
            pbr.clearCoat.isEnabled = true;
            pbr.clearCoat.intensity = cfg.glaze;   // 実値はcoatMapのR × ここ
            pbr.clearCoat.roughness = 1.0;
            pbr.clearCoat.texture = this.texCoat;
            pbr.clearCoat.useRoughnessFromMainTexture = true;
            // 既定のIORは1.5（樹脂）。水は1.33。醤油だれは糖分で少し高い
            if ("indexOfRefraction" in pbr.clearCoat) {
                pbr.clearCoat.indexOfRefraction = (cfg.char > 0) ? 1.42 : 1.33;
            }

            // --- 透過（糊化したデンプンの散乱）
            const sub = pbr.subSurface;
            sub.isTranslucencyEnabled = true;
            sub.tintColor = col3(cfg.tint);
            // 【対策】Babylon 8 以降 translucencyIntensity は「拡散反射と
            //         拡散透過の配分比」。1.0 で拡散が完全に消えるので
            //         有効範囲は 0〜1。白い被写体では 0.5 でもかなり暗い
            sub.translucencyIntensity = clamp(cfg.translucency, 0, 0.95);
            sub.thicknessTexture = this.texThick;
            if ("useGltfStyleTextures" in sub) sub.useGltfStyleTextures = false;
            sub.useMaskFromThicknessTexture = false;
            const H = cfg.heightMM * MM * scale;
            sub.minimumThickness = H * 0.06;
            sub.maximumThickness = H * 0.95;
            sub.tintColorAtDistance = H * 1.25;
            // 屈折は入れない。米は透明体ではなく散乱体
            sub.isRefractionEnabled = false;

            this.mats.push(pbr);
            return pbr;
        }

        dispose() {
            for (const m of this.mats) m.dispose(true, false);
            this.mats.length = 0;
            for (const t of [this.texNormal, this.texORM, this.texCoat, this.texThick]) t.dispose();
        }
    }

    function makeGrainMesh(name, scene, cfg, seed, nT, nS, mat, scale) {
        const g = buildGrainVertexData(cfg, seed, nT, nS);
        const m = new BABYLON.Mesh(name, scene);
        g.vd.applyToMesh(m, false);
        m.hasVertexAlpha = false;
        m.registerInstancedBuffer("color", 4);
        m.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
        m.material = mat;
        m.scaling.setAll(scale);
        m.receiveShadows = true;
        m.info = g.info;
        return m;
    }

    // =================================================================
    // 6. Shape : おにぎりの形
    //
    //  断面（正面から見た三角形）は「角丸の正三角形」。
    //  【対策】三角柱の角を面取りしても おにぎり にはならない。
    //          手で握ると角から先に潰れるので、角の丸みは
    //          辺の直線性より先に効く。ここでは
    //              R(φ) = 1 / ( Σ max(0, u·nᵢ)^k )^(1/k)
    //          という支持関数のソフト最大で角丸三角形を作る。
    //          k→∞ で真の三角形、k を下げると角だけが丸くなり、
    //          辺は数学的に直線のまま残る（ここが円との混合と違う）。
    //
    //  厚み方向は超だ円で掃引する。指数を上げると面が平らになり、
    //  下げるとレンズになる。3前後で「平らな面 + 丸い稜」が同居する。
    // =================================================================
    const TRI_N = [
        [0, -1],                                   // 底辺
        [Math.cos(Math.PI / 6), 0.5],              // 右上の辺
        [-Math.cos(Math.PI / 6), 0.5]              // 左上の辺
    ];

    function triRadial(phi, sharp) {
        const cx = Math.cos(phi), cy = Math.sin(phi);
        let s = 0;
        for (let i = 0; i < 3; i++) {
            const d = cx * TRI_N[i][0] + cy * TRI_N[i][1];
            if (d > 0) s += Math.pow(d, sharp);
        }
        return (s > 1e-9) ? 1 / Math.pow(s, 1 / sharp) : 1;
    }

    // 表面の点。ψ = -π/2（裏面）→ 0（外周の稜）→ +π/2（表面）
    // 戻り値はローカル座標（接地補正はしていない。root 側で座らせる）
    function shapePoint(psi, phi, C) {
        const cs = Math.max(0, Math.cos(psi)), sn = Math.sin(psi);
        const kr = Math.pow(cs, 2 / C.faceP);
        const az = Math.pow(Math.abs(sn), 2 / C.edgeQ);
        const kz = (sn < 0) ? -az : az;
        const R = triRadial(phi, C.triSharp);
        let x = C.sx * R * Math.cos(phi) * kr;
        let y = C.sy * R * Math.sin(phi) * kr;
        let z = C.halfT * kz;

        // (a) 手の跡。中心からの一様な伸縮なので継ぎ目も自己交差も出ない
        const sd = C.sd;
        const lump = 1 + C.handLump * (
            (Noise.value3(x * 0.85 + 11, y * 0.85 + 5, z * 0.85 + 3, sd) - 0.5) * 2
            + (Noise.value3(x * 2.10 + 7, y * 2.10 + 2, z * 2.10 + 9, sd + 91) - 0.5) * 1.1);
        x *= lump; y *= lump; z *= lump;

        // (b) 手のひらが当たった面の中央は、わずかにへこむ。
        // 【対策】ここを 0 にすると面が完全な凸のドームになり、
        //         「押した」跡が消えて型で抜いたゼリーに見える。
        z *= 1 - C.palmDent * Math.exp(-Math.pow(kr / 0.50, 2));

        // (c) 接地して潰れた底辺。
        // 【対策】単純なクランプで潰すとそこに折れ線ができ、
        //         粒のすき間から「平らな板」として光る。ソフトプラスで寄せる。
        const yFloor = -C.sy * (1 - C.bottomFlat);
        const soft = 0.11;
        const t = (y - yFloor) / soft;
        if (t < 8) y = yFloor + soft * Math.log(1 + Math.exp(t));

        return { x, y, z };
    }

    function shapeNormal(psi, phi, C) {
        const H = Math.PI / 2 - 1e-4;
        const e1 = 0.014, e2 = 0.022;
        const a = shapePoint(clamp(psi - e1, -H, H), phi, C);
        const b = shapePoint(clamp(psi + e1, -H, H), phi, C);
        const c = shapePoint(psi, phi - e2, C);
        const d = shapePoint(psi, phi + e2, C);
        const Tx = b.x - a.x, Ty = b.y - a.y, Tz = b.z - a.z;
        const Bx = d.x - c.x, By = d.y - c.y, Bz = d.z - c.z;
        let nx = Ty * Bz - Tz * By, ny = Tz * Bx - Tx * Bz, nz = Tx * By - Ty * Bx;
        const l = Math.hypot(nx, ny, nz);
        if (l < 1e-12) return { x: 0, y: 0, z: (psi >= 0 ? 1 : -1) };
        nx /= l; ny /= l; nz /= l;
        // 外向きに揃える（この形は原点まわりで星型なので位置ベクトルで判定できる）
        const p0 = shapePoint(psi, phi, C);
        if (nx * p0.x + ny * p0.y + nz * p0.z < 0) { nx = -nx; ny = -ny; nz = -nz; }
        return { x: nx, y: ny, z: nz };
    }

    // 未変形の形のゲージ関数。1 で表面、1未満で内側。海苔の巻き付けに使う
    function gauge0(x, y, z, C) {
        const xn = x / C.sx, yn = y / C.sy;
        const r = Math.hypot(xn, yn);
        const kr = (r < 1e-9) ? 0 : r / triRadial(Math.atan2(yn, xn), C.triSharp);
        return Math.pow(kr, C.faceP) + Math.pow(Math.abs(z) / C.halfT, C.edgeQ);
    }

    // 海苔の下かどうか。α = 0 が真下、±π/2 が表裏の面の高さ半ば。
    // 戻り値は「海苔の切り口からどれだけ内側か」を cm 相当で表した余裕。
    // 負なら海苔の外。
    // 【対策】幅方向と巻き方向の被覆率を掛け合わせると、海苔の四隅の
    //         内側で積が小さくなり、そこだけ「海苔の下なのに被覆率が低い」
    //         と誤判定される。粒が沈まず、四隅から米が突き出る。
    //         2方向の余裕の「小さいほう」を取ること（積ではなく min）。
    function noriMargin(x, y, z, C) {
        if (!C.noriOn) return -1;
        const a = Math.abs(Math.atan2(z, -y));
        const dx = C.noriHalfW - Math.abs(x);
        const da = (C.noriAlphaEnd - a) * 1.9;   // rad → おおよその cm
        return Math.min(dx, da);
    }

    function buildShapeConfig(seed) {
        const C = Object.assign({}, SHAPE);
        C.seed = seed >>> 0;
        C.sd = (seed ^ 0x3C1A) >>> 0;
        C.noriHalfW = GLOBAL.noriHalfW;
        C.noriAlphaEnd = GLOBAL.noriAlphaEnd;
        C.noriOn = false;

        // 単位形の外接寸法を測って、指定した実寸に合わせる倍率を作る。
        // 【対策】角丸のぶん外接寸法は理論値より小さい。理論値で割ると
        //         指定より一回り小さいおにぎりができる。実測すること。
        let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        const N = 1440;
        for (let i = 0; i < N; i++) {
            const phi = i / N * TAU;
            const R = triRadial(phi, C.triSharp);
            const x = R * Math.cos(phi), y = R * Math.sin(phi);
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        C.sx = C.baseW / (maxX - minX);
        C.sy = C.hgt / (maxY - minY);
        C.halfT = C.thick * 0.5;

        // 面積で重み付けした (ψ, φ) の累積分布。粒を面積あたり等density で撒く。
        // 【対策】ψ を一様に撒くと、極（＝三角形の面の中央）に粒が集中して
        //         中央だけ二重三重に重なり、外周の稜がすかすかになる。
        const NP = 64, NF = 96;
        const dpsi = Math.PI / NP, dphi = TAU / NF;
        const cdf = new Float64Array(NP * NF + 1);
        let k = 0;
        for (let i = 0; i < NP; i++) {
            const psi = -Math.PI / 2 + (i + 0.5) * dpsi;
            for (let j = 0; j < NF; j++) {
                const phi = (j + 0.5) * dphi;
                const a = shapePoint(psi - dpsi * 0.5, phi, C);
                const b = shapePoint(psi + dpsi * 0.5, phi, C);
                const c = shapePoint(psi, phi - dphi * 0.5, C);
                const d = shapePoint(psi, phi + dphi * 0.5, C);
                const Tx = b.x - a.x, Ty = b.y - a.y, Tz = b.z - a.z;
                const Bx = d.x - c.x, By = d.y - c.y, Bz = d.z - c.z;
                const ar = Math.hypot(Ty * Bz - Tz * By, Tz * Bx - Tx * Bz, Tx * By - Ty * Bx);
                cdf[k + 1] = cdf[k] + ar;
                k++;
            }
        }
        C.area = cdf[NP * NF];
        const tot = C.area || 1;
        for (let i = 0; i <= NP * NF; i++) cdf[i] /= tot;
        C.cdf = cdf; C.cdfNP = NP; C.cdfNF = NF;
        C.dpsi = dpsi; C.dphi = dphi;
        return C;
    }

    // =================================================================
    // 7. Body : 粒のすき間から中が抜けないように張る下地
    // =================================================================
    function buildBody(scene, C, mat) {
        const NP = C.seg.psi, NF = C.seg.phi;
        const nV = (NP + 1) * (NF + 1);
        const positions = new Float32Array(nV * 3);
        const normals = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const colors = new Float32Array(nV * 4);
        const indices = new Uint32Array(NP * NF * 6);
        let vo = 0;
        for (let i = 0; i <= NP; i++) {
            const psi = -Math.PI / 2 + i / NP * Math.PI;
            for (let j = 0; j <= NF; j++) {
                const phi = (j % NF) / NF * TAU;
                const p = shapePoint(psi, phi, C);
                const n = shapeNormal(psi, phi, C);
                // 【対策】下地をなめらかな面のままにすると、粒のすき間から
                //         見えた瞬間に「中の素体」になる。実際にそこにあるのは
                //         押し合った米なので、粒と同じ大きさの凹凸を持たせる。
                const bp = (Noise.value3(p.x * 2.6 + 5, p.y * 2.6 + 9, p.z * 2.6 + 3, C.sd + 13) - 0.5) * 2 * 0.070
                    + (Noise.value3(p.x * 6.2 + 2, p.y * 6.2 + 4, p.z * 6.2 + 8, C.sd + 29) - 0.5) * 2 * 0.030;
                // 【対策】下地を浅く置くと、粒のすき間が「明るい白い面」に
                //         なって目立つ。粒の厚みの半分より深く沈めて、
                //         すき間が谷の影として読めるようにする。
                const off = 0.175 - bp;
                const p3 = vo * 3, p2 = vo * 2, p4 = vo * 4;
                positions[p3] = p.x - n.x * off;
                positions[p3 + 1] = p.y - n.y * off;
                positions[p3 + 2] = p.z - n.z * off;
                uvs[p2] = j / NF * 5; uvs[p2 + 1] = i / NP * 5;
                // 【対策】下地を灰色に落とすと、すき間が「別の物体」として
                //         目立つ。米の白に寄せておくほうが「奥の米」として読める。
                //         向きによる濃淡だけを持たせ、全体の明るさは
                //         マテリアルの albedoColor 側に出す。
                const kk = 0.72 + 0.28 * smooth(-0.7, 0.9, n.y);
                colors[p4] = kk; colors[p4 + 1] = kk * 0.985; colors[p4 + 2] = kk * 0.93;
                colors[p4 + 3] = 1;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < NP; i++) {
            for (let j = 0; j < NF; j++) {
                const a = i * (NF + 1) + j, b = a + 1, c = a + (NF + 1), d = c + 1;
                indices[io++] = a; indices[io++] = c; indices[io++] = b;
                indices[io++] = b; indices[io++] = c; indices[io++] = d;
            }
        }
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        {
            // ψ=0, φ=0 は外周の右端。法線は +X 側を向いているはず
            const pi = Math.round(NP * 0.5) * (NF + 1);
            if (normals[pi * 3] < 0) {
                for (let t = 0; t < indices.length; t += 3) {
                    const tmp = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = tmp;
                }
                BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            }
        }
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.normals = normals; vd.uvs = uvs;
        vd.colors = colors; vd.indices = indices;
        const mesh = new BABYLON.Mesh("onigiriBody", scene);
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.tris = NP * NF * 2;
        return mesh;
    }

    // =================================================================
    // 8. Grains : 配置 / 擬似AO / 焦げと色ムラ
    // =================================================================
    function placeGrains(C, P, rng) {
        const cdf = C.cdf, NF = C.cdfNF, NC = cdf.length - 1;
        const n = Math.min(GLOBAL.grainCountMax,
            Math.round(C.area * GLOBAL.grainPerCm2));
        const CS = Math.max(1, GLOBAL.clusterSize | 0);
        const out = [];
        const H = Math.PI / 2 - 0.020;

        const pickCell = (u) => {
            let lo = 0, hi = NC;
            while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m + 1] <= u) lo = m + 1; else hi = m; }
            return lo;
        };

        let cpsi = 0, cphi = 0, sPsi = 0.1, sPhi = 0.1;
        for (let i = 0; i < n; i++) {
            if (i % CS === 0) {
                // 塊の種を面積等分で引く。
                // 【対策】1粒ずつ独立に撒くと統計的に均一な絨毯になる。
                //         実物は数粒がくっついた塊と、そのあいだの空隙でできている。
                const cell = pickCell(rng.next());
                cpsi = clamp(-Math.PI / 2 + ((cell / NF | 0) + rng.next()) * C.dpsi, -H, H);
                cphi = ((cell % NF) + rng.next()) * C.dphi;
                // 塊のばらつきは「世界の cm」で決める。
                // 【対策】ψ/φ に一定の分散を与えると、極の近くだけ
                //         塊が原寸の何倍にも広がって粒が散り散りになる。
                const a = shapePoint(cpsi - 0.01, cphi, C), b = shapePoint(cpsi + 0.01, cphi, C);
                const c = shapePoint(cpsi, cphi - 0.02, C), d = shapePoint(cpsi, cphi + 0.02, C);
                const mPsi = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.02;
                const mPhi = Math.hypot(d.x - c.x, d.y - c.y, d.z - c.z) / 0.04;
                sPsi = 0.30 / Math.max(0.25, mPsi);
                sPhi = 0.30 / Math.max(0.25, mPhi);
            }
            const psi = clamp(cpsi + rng.gauss(0, sPsi), -H, H);
            const phi = cphi + rng.gauss(0, sPhi);

            const p = shapePoint(psi, phi, C);
            const nn = shapeNormal(psi, phi, C);

            // 沈み込み。一部の粒は塊の上に乗って浮いている
            const g0 = P.grainSink[0], g1 = P.grainSink[1];
            const q = rng.next();
            let sink = (q < P.grainLiftRatio)
                ? -P.grainLift * (q / P.grainLiftRatio)
                : g0 + (g1 - g0) * Math.pow((q - P.grainLiftRatio) / (1 - P.grainLiftRatio), 1.9);
            // 【対策】接地する底辺で粒を浮かせると、台を突き抜けて刺さる
            if (nn.y < -0.55) sink = Math.max(sink, 0.030);

            // 海苔の下。
            // 【対策】そのまま置くと膜を突き抜けて「海苔から米が生えて」しまう。
            //         完全に隠れる粒は最初から作らない（そのぶん軽くなる）。
            const mg = noriMargin(p.x, p.y, p.z, C);
            if (mg > 0.22) continue;                 // 完全に隠れる
            if (mg > -0.02) sink = Math.max(sink, C.noriGap + 0.095);

            out.push({
                x: p.x - nn.x * sink, y: p.y - nn.y * sink, z: p.z - nn.z * sink,
                nx: nn.x, ny: nn.y, nz: nn.z, res: -sink
            });
        }
        return out;
    }

    // ---- 粒間の暗がり --------------------------------------------------
    // 各粒が「近傍の最高点からどれだけ沈んでいるか」をインスタンスカラーに焼く。
    // 【対策】SSAOでこれを出そうとすると、半径を谷の幅（数mm）に合わせることになり、
    //         今度は粒の輪郭すべてに黒い縁がついて汚れる。幾何的に分かっている
    //         情報は、配置の段階で焼くほうが正確で速い（描画コストはゼロ）。
    function bakeAO(pts) {
        const cell = 0.30, OFF = 512;
        const key = (i, j, k) => ((i + OFF) * 1021 + (j + OFF)) * 1021 + (k + OFF);
        const top = new Map();
        for (const p of pts) {
            const kk = key(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell));
            const cur = top.get(kk);
            if (cur === undefined || p.res > cur) top.set(kk, p.res);
        }
        for (const p of pts) {
            const i0 = Math.floor(p.x / cell), j0 = Math.floor(p.y / cell), k0 = Math.floor(p.z / cell);
            let m = -1e9;
            for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
                const v = top.get(key(i0 + a, j0 + b, k0 + c));
                if (v !== undefined && v > m) m = v;
            }
            let ao = clamp(1 - (m - p.res) / GLOBAL.aoDepth, 0, 1);
            ao = GLOBAL.aoFloor + (1 - GLOBAL.aoFloor) * Math.pow(ao, 0.75);
            // 【対策】おにぎりは上も下も同じ形なので、これだけだと底が天面と
            //         同じ明るさになって「宙に浮いた米の塊」に見える。
            //         下を向いた粒は空が遮られているぶん暗くする。
            // 【対策】しきい値の上端を 0.6 にすると、正面の三角の面（ny≒0）まで
            //         15%暗くなり、主役の面が濁る。0.15 まで下げると
            //         「真下を向いた粒だけ」が暗くなる。
            ao *= 1 - GLOBAL.aoDown * (1 - smooth(-0.95, 0.15, p.ny));
            p.ao = ao;
        }
        return pts;
    }

    // 焦げ量。網に当たった「面」だけが濃く、稜と角はきつね色に残る
    function charAmount(p, P, C) {
        if (P.char <= 0) return 0;
        const face = smooth(CHAR.faceLo, CHAR.faceHi, Math.abs(p.nz));
        const m = Noise.fbm3(p.x * 0.95 + 3, p.y * 0.95 + 7, p.z * 0.95 + 2, (C.sd + 555) >>> 0, 3);
        const mot = clamp(0.5 + (m - 0.5) * 2.6 * CHAR.mottle, 0, 1);
        return clamp(P.char * face * (0.28 + 1.05 * mot), 0, 1);
    }

    // 【対策】遮蔽ぶんを一様に引くと、谷は必ず中性グレーになる。ところが米粒は
    //         ほぼ半透明なので、谷に落ちた光は隣の粒を何度も通り抜け、黄色みを
    //         帯びて戻ってくる。写真の谷は「暗い」より「クリーム色に濁っている」。
    //         灰色のままだと、どれだけ形を作り込んでも陶器のビーズに見える。
    function grainColor(p, strength) {
        const v = clamp(1 - (1 - p.ao) * strength, 0.02, 1);
        const w = 1 - v;
        let r = v * (1 + 0.10 * w);
        let g = v * (1 - 0.02 * w);
        let b = v * (1 - 0.30 * w);
        // 粒ごとの色ムラ（玄米はぬかの残り方が粒ごとに違う）
        r *= p.t0; g *= p.t1; b *= p.t2;
        // 焦げ
        if (p.cr !== undefined) { r *= p.cr; g *= p.cg; b *= p.cb; }
        return new BABYLON.Color4(r, g, b, 1);
    }

    // =================================================================
    // 9. NoriLab : 海苔のテクスチャ
    //
    //  海苔は「黒い紙」ではない。刻んだ海藻を漉いて干した繊維の膜で、
    //  ・繊維の向きが2方向に絡んでいる
    //  ・漉きムラで厚い所と薄い所があり、薄い所だけ緑が抜けて見える
    //  ・光を通す（逆光で暗緑色に光る）
    //  この3つが無いと、どれだけ暗い色を置いても炭の板になる。
    // =================================================================
    const NoriLab = {
        _canvas: TextureLab._canvas,

        // 繊維の高さ場。法線・ORM・アルベドで共有する
        _fields(S, N, seed) {
            const fib = new Float32Array(S * S);
            const patch = new Float32Array(S * S);
            for (let y = 0; y < S; y++) {
                const v = y / S;
                for (let x = 0; x < S; x++) {
                    const u = x / S;
                    // 【対策】1方向に伸ばしたノイズだけだと、髪を梳かした
                    //         ような縞になる。海苔は繊維が絡んでいるので、
                    //         向きの違う層を重ねて格子を消す。
                    const f1 = Noise.fbm2(u * 5, v * 40, 40, seed, 3);
                    const f2 = Noise.fbm2(u * 36, v * 6, 36, seed + 41, 3);
                    const f3 = Noise.fbm2(u * 19, v * 19, 19, seed + 83, 2);
                    fib[y * S + x] = 0.40 * f1 + 0.36 * f2 + 0.24 * f3;
                    patch[y * S + x] = Noise.fbm2(u * 3, v * 3, 3, seed + 7, 3);
                }
            }
            return { fib, patch };
        },

        // 薄い所（＝光が抜ける所）の量。0..1
        _thin(fib, patch, N) {
            return clamp((smooth(0.47, 0.82, patch) * 0.72
                + smooth(0.60, 0.88, fib) * 0.55) * N.thinSpot, 0, 1);
        },

        albedo(scene, S, N, seed, F) {
            return this._canvas("noriAlb", S, (d, SS) => {
                for (let y = 0; y < SS; y++) {
                    for (let x = 0; x < SS; x++) {
                        const k = y * SS + x;
                        const fib = F.fib[k], patch = F.patch[k];
                        const thin = this._thin(fib, patch, N);
                        // 基本は黒に近い。薄い所だけ緑が出る
                        let r = mix(N.base[0], N.green[0], thin);
                        let g = mix(N.base[1], N.green[1], thin);
                        let b = mix(N.base[2], N.green[2], thin);
                        // 繊維の明暗。
                        // 【対策】ここを上げすぎると「苔むした岩」になる。
                        //         海苔の繊維は太さ 0.1mm 前後で、離れて見ると
                        //         色ではなく艶のちらつきとして効く。
                        const kk = 1 + N.fiber * (fib - 0.5) * 1.35;
                        r *= kk; g *= kk; b *= kk;
                        // ごくまれに混じる白っぽい繊維
                        const sp = Noise._h2(Math.floor(x / 5), Math.floor(y / 5), seed + 911);
                        if (sp > 0.9975) { r += 0.20; g += 0.22; b += 0.16; }
                        const i = k * 4;
                        d[i] = clamp(r, 0, 1) * 255;
                        d[i + 1] = clamp(g, 0, 1) * 255;
                        d[i + 2] = clamp(b, 0, 1) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        normal(scene, S, N, F, level) {
            const h = new Float32Array(S * S);
            for (let k = 0; k < S * S; k++) h[k] = (F.fib[k] - 0.5) * 0.55 + (F.patch[k] - 0.5) * 0.25;
            return this._canvas("noriNrm", S, (d, SS) => {
                for (let y = 0; y < SS; y++) {
                    for (let x = 0; x < SS; x++) {
                        const xl = h[y * SS + ((x - 1 + SS) % SS)], xr = h[y * SS + ((x + 1) % SS)];
                        const yu = h[((y - 1 + SS) % SS) * SS + x], yd = h[((y + 1) % SS) * SS + x];
                        let nx = (xl - xr) * level * SS * 0.05;
                        let ny = (yu - yd) * level * SS * 0.05;
                        let nz = 1;
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const i = (y * SS + x) * 4;
                        d[i] = (nx * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        orm(scene, S, N, F) {
            return this._canvas("noriORM", S, (d, SS) => {
                for (let y = 0; y < SS; y++) {
                    for (let x = 0; x < SS; x++) {
                        const k = y * SS + x;
                        const fib = F.fib[k];
                        // 繊維が浮いている所は粗く、漉かれて平らな所は滑らか
                        const rough = clamp(N.rough * (0.80 + 0.55 * fib), 0.05, 1);
                        const ao = clamp(0.94 - 0.16 * (1 - fib), 0, 1);
                        const i = k * 4;
                        d[i] = ao * 255; d[i + 1] = rough * 255; d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // 厚みマップ。薄い所ほど光が抜ける = 値が小さい
        thickness(scene, S, N, F) {
            return this._canvas("noriThk", S, (d, SS) => {
                for (let y = 0; y < SS; y++) {
                    for (let x = 0; x < SS; x++) {
                        const k = y * SS + x;
                        const thin = NoriLab._thin(F.fib[k], F.patch[k], N);
                        const t = clamp(1 - thin * 0.85, 0.06, 1);
                        const i = k * 4;
                        d[i] = t * 255; d[i + 1] = t * 255; d[i + 2] = t * 255; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        material(scene, N, seed, name) {
            const S = GLOBAL.noriTex;
            const F = this._fields(S, N, seed);
            const texA = this.albedo(scene, S, N, seed, F);
            const texN = this.normal(scene, S, N, F, 1.0);
            const texO = this.orm(scene, S, N, F);
            const texT = this.thickness(scene, S, N, F);
            for (const t of [texA, texN, texO, texT]) {
                t.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
                t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
            }
            const m = new BABYLON.PBRMaterial(name, scene);
            m.albedoTexture = texA;
            m.albedoColor = new BABYLON.Color3(1, 1, 1);
            m.metallic = 0.0;
            m.roughness = 1.0;
            m.metallicTexture = texO;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.bumpTexture = texN;
            m.bumpTexture.level = 1.0;
            m.clearCoat.isEnabled = true;
            m.clearCoat.intensity = N.coat;
            m.clearCoat.roughness = N.coatRough;
            if ("indexOfRefraction" in m.clearCoat) m.clearCoat.indexOfRefraction = 1.40;
            // 【対策】海苔は 0.1mm の膜。透過を切ると、逆光でも真っ黒の
            //         シルエットのままになり、そこだけ穴が開いたように見える。
            const sub = m.subSurface;
            sub.isTranslucencyEnabled = true;
            sub.tintColor = col3(N.tint);
            sub.translucencyIntensity = clamp(N.translucency, 0, 0.95);
            sub.thicknessTexture = texT;
            if ("useGltfStyleTextures" in sub) sub.useGltfStyleTextures = false;
            sub.minimumThickness = 0.004;
            sub.maximumThickness = 0.022;
            sub.tintColorAtDistance = 0.030;
            sub.isRefractionEnabled = false;
            // 巻いた海苔は裏も見える（端の反りの内側）
            m.backFaceCulling = false;
            m.twoSidedLighting = true;
            m.texs = [texA, texN, texO, texT];
            return m;
        }
    };

    // =================================================================
    // 10. Nori : 巻き付けメッシュ
    //
    //  (x, α) で張る。α は「真下から測った巻き上げ角」。
    //  未変形の形へレイを飛ばして交点を求め、そこから (ψ, φ) に直して
    //  変形後の表面と法線を得る。こうすると、手の跡でおにぎりが歪んでも
    //  海苔は必ず表面に貼りつく。
    // =================================================================
    function noriParam(x0, alpha, C) {
        const dy = -Math.cos(alpha), dz = Math.sin(alpha);
        let lo = 0, hi = 3 * (C.sy + C.halfT);
        for (let it = 0; it < 30; it++) {
            const t = (lo + hi) * 0.5;
            if (gauge0(x0, t * dy, t * dz, C) < 1) lo = t; else hi = t;
        }
        const t = (lo + hi) * 0.5;
        const y = t * dy, z = t * dz;
        const xn = x0 / C.sx, yn = y / C.sy;
        const phi = Math.atan2(yn, xn);
        const r = Math.hypot(xn, yn);
        const kr = (r < 1e-9) ? 0 : r / triRadial(phi, C.triSharp);
        const c2 = Math.pow(clamp(kr, 0, 1), C.faceP);
        const s2 = Math.pow(clamp(Math.abs(z) / C.halfT, 0, 1), C.edgeQ);
        const sq = Math.sqrt(Math.max(0, s2)) * (z < 0 ? -1 : 1);
        const psi = Math.atan2(sq, Math.sqrt(Math.max(1e-12, c2)));
        return { psi, phi };
    }

    function buildNori(scene, C, N, mat) {
        const NX = GLOBAL.noriSegX, NA = GLOBAL.noriSegA;
        const HW = C.noriHalfW, AE = C.noriAlphaEnd;
        const nV = (NX + 1) * (NA + 1);
        const positions = new Float32Array(nV * 3);
        const normals = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array(NX * NA * 6);
        const TEXCM = 11.0;      // テクスチャ1タイルが何cmにあたるか
        const sd = (C.sd + 0x5E11) >>> 0;

        // 先に (i, j) の表面点を全部求め、行ごとの弧長を積む
        const P = new Array(nV);
        for (let i = 0; i <= NX; i++) {
            // 【対策】切り口を完全な直線にすると、機械で打ち抜いたラベルに
            //         見える。手で切った海苔の端はごくわずかに波打つ。
            const fx = (i / NX - 0.5) * 2;
            const x0 = HW * fx;
            for (let j = 0; j <= NA; j++) {
                const al = (j / NA - 0.5) * 2 * AE;
                const q = noriParam(x0, al, C);
                const p = shapePoint(q.psi, q.phi, C);
                const n = shapeNormal(q.psi, q.phi, C);
                P[i * (NA + 1) + j] = { p, n, al, x0 };
            }
        }

        let vo = 0;
        for (let i = 0; i <= NX; i++) {
            // 行ごとの弧長（v 座標）
            let arc = 0;
            const arcs = new Float64Array(NA + 1);
            for (let j = 1; j <= NA; j++) {
                const a = P[i * (NA + 1) + j - 1].p, b = P[i * (NA + 1) + j].p;
                arc += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
                arcs[j] = arc;
            }
            for (let j = 0; j <= NA; j++) {
                const e = P[i * (NA + 1) + j];
                const p = e.p, n = e.n;
                // 米の粒に沿った膜のうねり
                const w = (Noise.fbm3(p.x * 3.1 + 2, p.y * 3.1 + 7, p.z * 3.1 + 5, sd, 3) - 0.5) * 2 * N.wrinkle;
                // 【対策】端まで米にぴったり貼りつけると、海苔が塗装に見える。
                //         実物は切り口の 2〜3mm が必ず浮いて反っている。
                const eu = smooth(AE - 0.34, AE + 0.01, Math.abs(e.al));
                const ex = smooth(HW - 0.40, HW + 0.01, Math.abs(e.x0));
                const off = N.gap + w + N.edgeCurl * (eu * eu + 0.55 * ex * ex);
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = p.x + n.x * off;
                positions[p3 + 1] = p.y + n.y * off;
                positions[p3 + 2] = p.z + n.z * off;
                uvs[p2] = 0.5 + e.x0 / TEXCM;
                uvs[p2 + 1] = arcs[j] / TEXCM;
                vo++;
            }
        }

        let io = 0;
        for (let i = 0; i < NX; i++) {
            for (let j = 0; j < NA; j++) {
                const a = i * (NA + 1) + j, b = a + 1, c = a + (NA + 1), d = c + 1;
                indices[io++] = a; indices[io++] = c; indices[io++] = b;
                indices[io++] = b; indices[io++] = c; indices[io++] = d;
            }
        }
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        {
            // 巻きの真下（α=0 付近）の法線は下を向いているはず
            const pi = Math.round(NX * 0.5) * (NA + 1) + Math.round(NA * 0.5);
            if (normals[pi * 3 + 1] > 0) {
                for (let t = 0; t < indices.length; t += 3) {
                    const tmp = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = tmp;
                }
                BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            }
        }
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.normals = normals; vd.uvs = uvs; vd.indices = indices;
        const mesh = new BABYLON.Mesh("nori", scene);
        vd.applyToMesh(mesh, false);
        // 接地の実測に使う（回転後の最下点を頂点から直接求めるため）
        mesh.posArr = positions;
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.tris = NX * NA * 2;
        return mesh;
    }

    // =================================================================
    // 11. Board : 木の台
    // =================================================================
    // 角丸の板。超だ円体の指数を上げて「角の丸い直方体」にする。
    //
    //  UVの取り方が肝。
    //  【対策】表面の (x, z) をそのまま平面投影すると、天面は正しいが
    //          小口（丸めた側面）で x も z もほとんど変化しないので、
    //          UVが1点に潰れて木目が縦方向へ流れる。板の縁だけ
    //          絵の具を垂らしたような筋になる。
    //  【対策】かといって (ω, η) をそのままUVにすると、極（天面の中心）で
    //          UVが1点に集まり、天面に放射状のピンウィールが出る。
    //          天面の中心から測った「表面に沿った距離」を半径に、
    //          断面の外向きを方位に取る＝方位等距離図法で開く。
    //          天面ではこれが厳密に平面投影と一致し、小口はそのまま外へ
    //          展開されるので、木目が縁を回り込んで途切れない。
    //  【対策】さらに U と V を hx / hz で別々に割ると、板の縦横比のぶん
    //          木目が引き伸ばされる。cm をそのまま UV に使い、
    //          1タイル = tileCM とすること（uScale/vScale は 1 のまま）。
    function buildSlab(scene, name, hx, hy, hz, pXZ, pY, segU, segV, mat, tileCM) {
        const nV = (segV + 1) * (segU + 1);
        const positions = new Float32Array(nV * 3);
        const normals = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const colors = new Float32Array(nV * 4);
        const indices = new Uint32Array(segV * segU * 6);
        const sg = (v) => (v < 0 ? -1 : 1);

        // 断面の外周方向（列ごとに一定）
        const ex = new Float64Array(segU + 1), ez = new Float64Array(segU + 1);
        for (let j = 0; j <= segU; j++) {
            const om = (j % segU) / segU * TAU;
            const co = Math.cos(om), so = Math.sin(om);
            const ux = hx * sg(co) * Math.pow(Math.abs(co), pXZ);
            const uz = hz * sg(so) * Math.pow(Math.abs(so), pXZ);
            const d = Math.hypot(ux, uz) || 1;
            ex[j] = ux / d; ez[j] = uz / d;
        }

        let vo = 0;
        for (let i = 0; i <= segV; i++) {
            const eta = -Math.PI / 2 + i / segV * Math.PI;
            const ce = Math.cos(eta), se = Math.sin(eta);
            const cy = sg(se) * Math.pow(Math.abs(se), pY);
            const cr = Math.pow(Math.max(0, ce), pY);
            for (let j = 0; j <= segU; j++) {
                const om = (j % segU) / segU * TAU;
                const co = Math.cos(om), so = Math.sin(om);
                const x = hx * cr * sg(co) * Math.pow(Math.abs(co), pXZ);
                const z = hz * cr * sg(so) * Math.pow(Math.abs(so), pXZ);
                const y = hy * cy;
                const p3 = vo * 3, p4 = vo * 4;
                positions[p3] = x; positions[p3 + 1] = y; positions[p3 + 2] = z;
                // 木口（側面）はわずかに濃い
                const k = 1 - 0.22 * (1 - smooth(0.55, 0.98, Math.abs(cy)));
                colors[p4] = k; colors[p4 + 1] = k; colors[p4 + 2] = k; colors[p4 + 3] = 1;
                vo++;
            }
        }

        // 天面の極から表面に沿った距離を列ごとに積み、方位等距離でUVを張る
        for (let j = 0; j <= segU; j++) {
            let arc = 0;
            for (let i = segV; i >= 0; i--) {
                const a = (i * (segU + 1) + j) * 3;
                if (i < segV) {
                    const b = ((i + 1) * (segU + 1) + j) * 3;
                    arc += Math.hypot(positions[b] - positions[a],
                        positions[b + 1] - positions[a + 1],
                        positions[b + 2] - positions[a + 2]);
                }
                const p2 = (i * (segU + 1) + j) * 2;
                uvs[p2] = 0.5 + ex[j] * arc / tileCM;
                uvs[p2 + 1] = 0.5 + ez[j] * arc / tileCM;
            }
        }
        let io = 0;
        for (let i = 0; i < segV; i++) {
            for (let j = 0; j < segU; j++) {
                const a = i * (segU + 1) + j, b = a + 1, c = a + (segU + 1), d = c + 1;
                indices[io++] = a; indices[io++] = c; indices[io++] = b;
                indices[io++] = b; indices[io++] = c; indices[io++] = d;
            }
        }
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        {
            const pi = Math.round(segV * 0.5) * (segU + 1);
            if (normals[pi * 3] < 0) {
                for (let t = 0; t < indices.length; t += 3) {
                    const tmp = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = tmp;
                }
                BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            }
        }
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.normals = normals; vd.uvs = uvs;
        vd.colors = colors; vd.indices = indices;
        const mesh = new BABYLON.Mesh(name, scene);
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.tris = segV * segU * 2;
        return mesh;
    }

    // =================================================================
    // 12. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.032, 0.029, 0.026, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.74;

    const camera = new BABYLON.ArcRotateCamera("cam", 1.30, 1.14, 30, new V3(0, 3.5, 0), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 8;
    // 【対策】ポストプロセスを通すとシーンは深度つきのRTへ描かれる。
    //         minZ 既定のままだと深度の分解能が足りず、深く重なった粒どうしが
    //         描画順で勝ったり負けたりしてちらつく。
    camera.minZ = 2.0;
    camera.maxZ = 240;
    camera.lowerRadiusLimit = 11;
    camera.upperRadiusLimit = 110;
    camera.upperBetaLimit = 1.53;
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.46, -0.90, 0.46).normalize(), scene);
    key.position = new V3(18, 34, -18);
    key.intensity = 2.9;
    key.diffuse = new BABYLON.Color3(1.0, 0.972, 0.930);
    // 【対策】平行光の影の範囲は既定だとキャスターのAABBに合わせられる。
    //         すると影の落ちる先（台とテーブル）が範囲外になり、影が
    //         直線でぶつ切りになる。正射影の範囲を手で切る。
    key.autoUpdateExtends = false;
    key.orthoLeft = -20; key.orthoRight = 20;
    key.orthoBottom = -20; key.orthoTop = 20;
    key.shadowMinZ = 1; key.shadowMaxZ = 80;

    const back = new BABYLON.DirectionalLight("back", new V3(0.40, -0.30, -1.0).normalize(), scene);
    back.intensity = 1.8;
    back.diffuse = new BABYLON.Color3(1.0, 0.93, 0.84);
    back.specular = new BABYLON.Color3(0.55, 0.55, 0.55);

    const fill = new BABYLON.HemisphericLight("fill", new V3(0, 1, 0), scene);
    fill.intensity = 0.13;

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.004;
    sg.normalBias = 0.014;
    sg.setDarkness(0.30);

    // ---- 木 -----------------------------------------------------------
    // 年輪は u 方向（＝板の長手方向）に走る。
    //
    //  【対策】年輪の位相にノイズを大きく掛けると、そのノイズの最上位
    //          オクターブがそのまま年輪の本数を増やしてしまい、髪の毛の
    //          ような細線が全面に走る。位相を揺らすノイズは低周波・低振幅に
    //          留め、本数は v の係数だけで決めること。
    //  【対策】正弦波をそのまま濃淡にすると、明暗が同じ幅の縞になり、
    //          木ではなく段ボールか砂の風紋に見える。実際の年輪は
    //          「広い春材（淡い）＋ 細い秋材（濃い）」の繰り返しで、
    //          しかも1本ごとに幅も濃さも違う。年輪の通し番号をハッシュして
    //          1本ずつ性格を変えること。ここが板らしさの大半を決める。
    function woodTexture(name, size, LIGHT, DARK, O) {
        return TextureLab._canvas(name, size, (d, S) => {
            for (let y = 0; y < S; y++) {
                const v = y / S;
                for (let x = 0; x < S; x++) {
                    const u = x / S;
                    // 板目のアーチ（低周波のうねり）
                    const warp = (Noise.fbm2(u * O.warpU, v * O.warpV, O.warpU, O.seed, 3) - 0.5) * 2;
                    const phase = v * O.lines + warp * O.wave + 64;
                    const idx = Math.floor(phase), frac = phase - idx;
                    // 年輪ごとの個性
                    const hd = Noise._h2(idx & 1023, 3, O.seed + 201);   // 濃さ
                    const hw = Noise._h2(idx & 1023, 9, O.seed + 307);   // 秋材の幅
                    const lw = 0.09 + 0.17 * hw;
                    // 秋材: 年輪の終わり側に寄った細く濃い帯。
                    // 次の年輪の頭で明るさが跳ね返るのが、木の年輪の見え方
                    const late = smooth(1 - lw, 1 - lw * 0.12, frac);
                    // 春材のなかのゆるい濃度勾配
                    const early = 0.10 * frac;
                    // 繊維・導管。年輪と同じ向きに細く走る
                    const fiber = Noise.fbm2(u * 5, v * O.lines * 4.0, 5, O.seed + 33, 3);
                    let k = 1 - (0.46 + 0.40 * hd) * late - early - 0.20 * (1 - fiber);
                    k = clamp(k, 0, 1);
                    const i = (y * S + x) * 4;
                    d[i] = mix(DARK[0], LIGHT[0], k) * 255;
                    d[i + 1] = mix(DARK[1], LIGHT[1], k) * 255;
                    d[i + 2] = mix(DARK[2], LIGHT[2], k) * 255;
                    d[i + 3] = 255;
                }
            }
        }, scene);
    }

    const table = BABYLON.MeshBuilder.CreateGround("table", { width: 240, height: 240 }, scene);
    const tableMat = new BABYLON.PBRMaterial("tableMat", scene);
    // 1タイル = 240/30 = 8cm。年輪 11 本なので 7mm 間隔
    const woodTex = woodTexture("wood", 512, [0.60, 0.42, 0.25], [0.33, 0.21, 0.115],
        { lines: 11, wave: 1.9, warpU: 2.2, warpV: 2.6, seed: 21 });
    woodTex.uScale = 30; woodTex.vScale = 30;
    tableMat.albedoTexture = woodTex;
    tableMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    tableMat.metallic = 0.0;
    tableMat.roughness = 0.50;
    tableMat.clearCoat.isEnabled = true;
    tableMat.clearCoat.intensity = 0.26;
    tableMat.clearCoat.roughness = 0.32;
    table.material = tableMat;
    table.receiveShadows = true;

    // 台（檜のまな板）。白木なので明るく、年輪は細かい
    const boardMat = new BABYLON.PBRMaterial("boardMat", scene);
    // 1タイル = boardTileCM。板（26cm）が1タイルに収まるので継ぎ目が出ない。
    // 年輪 34 本 = 9mm 間隔
    const boardTex = woodTexture("boardWood", GLOBAL.boardTex,
        [0.855, 0.752, 0.575], [0.655, 0.512, 0.330],
        { lines: 30, wave: 4.6, warpU: 2.0, warpV: 2.4, seed: 137 });
    boardTex.uScale = 1.0; boardTex.vScale = 1.0;
    boardMat.albedoTexture = boardTex;
    boardMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    boardMat.metallic = 0.0;
    boardMat.roughness = 0.52;
    boardMat.clearCoat.isEnabled = true;
    boardMat.clearCoat.intensity = 0.16;
    boardMat.clearCoat.roughness = 0.42;
    const board = buildSlab(scene, "board",
        GLOBAL.boardLen * 0.5, GLOBAL.boardHgt * 0.5, GLOBAL.boardWid * 0.5,
        0.20, 0.24, 96, 40, boardMat, GLOBAL.boardTileCM);
    board.position.y = GLOBAL.boardHgt * 0.5;
    board.receiveShadows = true;
    const BOARD_TOP = GLOBAL.boardHgt;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.12;
    ip.contrast = 1.22;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 2.5;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    // =================================================================
    //  組み立て / 差し替え
    // =================================================================
    let state = null;
    const riceCache = {};        // 種類 → GrainAssets（テクスチャは使い回す）
    const noriMatCache = {};     // 海苔 → PBRMaterial
    let ssao = null;
    let onRebuilt = null;

    function riceConfig(riceKey, seed) {
        const cfg = Object.assign({}, GLOBAL, RICE[riceKey]);
        cfg.seed = seed >>> 0;
        return cfg;
    }

    function getAssets(riceKey) {
        let a = riceCache[riceKey];
        if (a) return a;
        const P = RICE[riceKey];
        a = new GrainAssets(scene, riceConfig(riceKey, 20260101));
        a.mat = a.makeMaterial("riceMat_" + riceKey, 1);
        // 【対策】下地に粒と同じマテリアルを貼ると、クリアコート（水の膜）が
        //         なめらかな面の上でそのまま鏡面になり、白い水がたまって見える。
        //         下地は「谷の底」なので、艶も透光も要らない。
        const bm = new BABYLON.PBRMaterial("bodyMat_" + riceKey, scene);
        const bb = P.bodyBright, ba = P.bodyTint || P.albedo;
        bm.albedoColor = new BABYLON.Color3(
            s2l(ba[0]) * bb, s2l(ba[1]) * bb, s2l(ba[2]) * bb);
        bm.metallic = 0.0;
        bm.roughness = 0.86;
        bm.clearCoat.isEnabled = false;
        bm.subSurface.isTranslucencyEnabled = false;
        a.bodyMat = bm;
        a.mats.push(bm);
        riceCache[riceKey] = a;
        return a;
    }

    function getNoriMat(noriKey) {
        if (noriKey === "none") return null;
        let m = noriMatCache[noriKey];
        if (!m) {
            m = NoriLab.material(scene, NORI[noriKey], 4801, "noriMat_" + noriKey);
            noriMatCache[noriKey] = m;
        }
        return m;
    }

    function disposePieces(st) {
        if (!st) return;
        for (const pc of st.pieces) {
            const srcs = new Set(pc.variants);
            for (const n of pc.nodes) if (!srcs.has(n)) n.dispose();
            for (const m of pc.variants) m.dispose();
            pc.body.dispose();
            if (pc.nori) pc.nori.dispose();
            pc.root.dispose();
        }
    }

    function build(riceKey, noriKey, seed, count) {
        if (state) { disposePieces(state); state = null; }

        const P = RICE[riceKey];
        const N = (noriKey === "none") ? null : NORI[noriKey];
        const assets = getAssets(riceKey);
        const noriMat = getNoriMat(noriKey);
        const rcfg = riceConfig(riceKey, seed);
        const pieces = [];

        const smap = sg.getShadowMap();
        if (smap && smap.renderList) smap.renderList.length = 0;
        sg.addShadowCaster(board, false);

        for (let i = 0; i < count; i++) {
            const sd = (seed + i * 7919) >>> 0;
            const rng = new Rng((seed ^ (i * 2654435761)) >>> 0);

            const C = buildShapeConfig(sd);
            C.noriOn = !!N;
            C.noriGap = N ? N.gap : 0;

            const root = new BABYLON.TransformNode("piece" + i, scene);
            const k = i - (count - 1) / 2;
            // 【対策】真横一列に正対させて並べると、陳列棚の見本になる。
            //         写真の盛り付けは必ず奥へずらして、少しずつ向きを振ってある。
            root.position.x = k * GLOBAL.pitchCM + rng.gauss(0, 0.16);
            root.position.z = k * -2.70 + rng.gauss(0, 0.22);
            const yaw = k * 0.20 + rng.gauss(0, 0.07);
            // 少しだけ後ろへもたれさせると、上からの光で三角の面が起きる
            const pitch = -0.115 + rng.gauss(0, 0.025);
            const roll = rng.gauss(0, 0.045);
            const quat = BABYLON.Quaternion.RotationYawPitchRoll(yaw, pitch, roll);
            root.rotationQuaternion = quat;

            // 接地の実測に使う回転行列。位置は中身を作ってから決める
            const rot = new BABYLON.Matrix();
            BABYLON.Matrix.FromQuaternionToRef(quat, rot);

            const body = buildBody(scene, C, assets.bodyMat);
            body.parent = root;

            const variants = [];
            for (let vi = 0; vi < GLOBAL.grainVariants; vi++) {
                const m = makeGrainMesh("g" + i + "_" + vi, scene, rcfg,
                    (sd + vi * 1013) >>> 0, GLOBAL.grainRings, GLOBAL.grainSides, assets.mat, 1);
                m.parent = root;
                variants.push(m);
            }

            const pts = bakeAO(placeGrains(C, P, rng));
            const used = new Set();
            const nodes = [];
            const up = new V3(0, 1, 0);
            for (let t = 0; t < pts.length; t++) {
                const p = pts[t];
                const variant = variants[t % variants.length];
                let node;
                if (!used.has(variant)) { used.add(variant); node = variant; }
                else { node = variant.createInstance("gi" + i + "_" + t); node.parent = root; }
                node.position.set(p.x, p.y, p.z);

                // 姿勢: 表面の法線に寝かせ、面内でランダムに回し、さらに崩す
                const nrm = new V3(p.nx, p.ny, p.nz);
                const axis = V3.Cross(up, nrm);
                const len = axis.length();
                let q = (len < 1e-5)
                    ? BABYLON.Quaternion.Identity()
                    : BABYLON.Quaternion.RotationAxis(axis.scale(1 / len), Math.asin(clamp(len, -1, 1)));
                if (len < 1e-5 && nrm.y < 0) q = BABYLON.Quaternion.RotationAxis(new V3(1, 0, 0), Math.PI);
                const spin = BABYLON.Quaternion.RotationAxis(nrm, rng.range(0, TAU));
                let rv = new V3(rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1));
                if (rv.lengthSquared() < 1e-8) rv = new V3(1, 0, 0);
                rv.normalize();
                // 【対策】握った米は茶碗によそったものより粒がそろう。ここで
                //         大きく散らすと「握っていない」ように見える。逆に
                //         全部そろえると発泡スチロールの塊になる。
                const loose = rng.next() < 0.26;
                const tilt = BABYLON.Quaternion.RotationAxis(rv, rng.gauss(0, loose ? 0.90 : 0.22));
                node.rotationQuaternion = tilt.multiply(spin.multiply(q));

                const broken = rng.next() < 0.15;
                node.scaling.set(broken ? rng.range(0.60, 0.80) : rng.range(0.92, 1.08),
                    rng.range(0.94, 1.06), rng.range(0.94, 1.06));

                // 粒ごとの色ムラ（玄米はぬかの残り方で粒ごとに色が違う）
                const j = clamp(rng.gauss(0, P.tintJitter), -0.30, 0.30);
                p.t0 = clamp(1 + j * 0.75, 0.35, 1.25);
                p.t1 = clamp(1 + j * 0.95, 0.35, 1.25);
                p.t2 = clamp(1 + j * 1.35, 0.30, 1.30);

                // 焦げ（焼きおにぎり）。目標の sRGB 色との比を掛け率にする。
                // 【対策】焦げ色をそのまま線形の掛け率にすると、sRGB で
                //         見込んだ濃さの倍以上暗くなって炭になる。
                if (P.char > 0) {
                    const c = charAmount(p, P, C);
                    const t1 = smooth(0.02, 0.42, c), t2 = smooth(0.42, 1.0, c);
                    const bl = [s2l(P.albedo[0]), s2l(P.albedo[1]), s2l(P.albedo[2])];
                    const gl = [s2l(CHAR.gold[0]), s2l(CHAR.gold[1]), s2l(CHAR.gold[2])];
                    const dl = [s2l(CHAR.deep[0]), s2l(CHAR.deep[1]), s2l(CHAR.deep[2])];
                    const mulc = (n) => {
                        const a = mix(1, gl[n] / bl[n], t1);
                        return mix(a, dl[n] / bl[n], t2);
                    };
                    p.cr = mulc(0); p.cg = mulc(1); p.cb = mulc(2);
                }

                node.instancedBuffers.color = grainColor(p, GLOBAL.aoStrength);
                nodes.push(node);
            }

            let nori = null;
            if (N) {
                nori = buildNori(scene, C, N, noriMat);
                nori.parent = root;
                sg.addShadowCaster(nori, false);
            }

            // ---- 接地 ----------------------------------------------------
            // 【対策】下地の表面を測って座らせると、下地より外にある物が
            //         そのぶん台にめり込む。とくに海苔は底辺を巻いていて
            //         いちばん低いので、切り口が板に刺さって見える。
            //         実際に置かれている物（粒の実位置と海苔の頂点）から
            //         回転後の最下点を測ること。
            // 【対策】AABB から求めるのも駄目で、8隅を変換した保守的な箱に
            //         なり、数ミリ浮いて接地影が離れる。
            let yLow = 1e9;
            const probe = (x, y, z, margin) => {
                const w = BABYLON.Vector3.TransformCoordinates(new V3(x, y, z), rot);
                if (w.y - margin < yLow) yLow = w.y - margin;
            };
            // 粒は中心を持っているので、半分の厚み（約1mm）を見込む
            const GH = P.heightMM * MM * 0.55;
            for (const p of pts) probe(p.x, p.y, p.z, GH);
            if (nori) {
                const a = nori.posArr;
                for (let t = 0; t < a.length; t += 3) probe(a[t], a[t + 1], a[t + 2], 0);
            }
            // わずかに沈めて、接地点が線ではなく面で当たるようにする
            root.position.y = BOARD_TOP - yLow - 0.012;

            // 【対策】数千粒をシャドウマップにも描くと頂点数が倍になる。
            //         粒どうしの落ち影は擬似AOとSSAOで足りている。
            //         キャスターは下地と海苔と台だけでよい。
            sg.addShadowCaster(body, false);

            pieces.push({ root, C, body, nori, variants, nodes, pts });
        }

        state = { pieces, riceKey, noriKey, seed, count, assets, noriMat };
        applyLive();
        if (onRebuilt) onRebuilt(state);

        let aMin = 1, aSum = 0, aN = 0, tri = 0;
        for (const pc of pieces) {
            for (const p of pc.pts) { aSum += p.ao; aN++; if (p.ao < aMin) aMin = p.ao; }
            tri += pc.nodes.length * pc.variants[0].info.tris + pc.body.tris + (pc.nori ? pc.nori.tris : 0);
        }
        console.log("[Onigiri]", P.label, "/", (N ? N.label : "海苔なし"),
            "/", count, "個 / 粒 =", aN,
            "/ AO min-mean =", aMin.toFixed(3), (aSum / Math.max(1, aN)).toFixed(3),
            "/ tris =", tri, "/ seed =", seed);
        return state;
    }

    // ---- GUIから触る値 -------------------------------------------------
    const live = {
        translucency: RICE[START_RICE].translucency,
        coat: 1.0, bump: 1.0, ao: GLOBAL.aoStrength, noriCoat: 1.0
    };
    let lastRiceKey = null;

    function applyLive() {
        if (!state) return;
        const P = RICE[state.riceKey];
        for (const mat of state.assets.mats) {
            mat.subSurface.translucencyIntensity = clamp(live.translucency, 0, 0.95);
            mat.clearCoat.intensity = live.coat * P.glaze;
            if (mat.bumpTexture) mat.bumpTexture.level = live.bump;
        }
        if (state.noriMat) {
            state.noriMat.clearCoat.intensity = live.noriCoat * NORI[state.noriKey].coat;
        }
        for (const pc of state.pieces) {
            for (let i = 0; i < pc.nodes.length; i++) {
                pc.nodes[i].instancedBuffers.color = grainColor(pc.pts[i], live.ao);
            }
        }
    }

    let currentRice = START_RICE;
    let currentNori = RICE[START_RICE].defaultNori;
    let currentSeed = START_SEED;
    let currentCount = GLOBAL.pieces;
    build(currentRice, currentNori, currentSeed, currentCount);
    lastRiceKey = currentRice;

    if (GLOBAL.useSSAO) {
        // 擬似AOは粒どうしの関係、SSAOは海苔ぎわや台との境目のような
        // 大きい陰りの担当
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        // 【対策】半径を粒の幅（約0.3cm）に近づけると、粒という粒の輪郭に
        //         黒い縁がついて全体が汚れる。粒どうしの陰りは擬似AOの担当。
        ssao.radius = 1.20;
        ssao.totalStrength = 0.52;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 180;
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
    // 【対策】Babylon の錯乱円は「シーン単位 × 1000 = mm」で計算される。
    //         focalLength を固定値にすると focusDistance に対して桁が合わず、
    //         被写界深度が数十メートルになって何もボケない。
    //         focalLength を focusDistance の一定比にすると focus が約分され、
    //         寄っても引いてもボケ量が一定になる。
    scene.onBeforeRenderObservable.add(() => {
        if (!dp.depthOfFieldEnabled) return;
        const focus = camera.radius * 1000;
        dp.depthOfField.focusDistance = focus;
        dp.depthOfField.focalLength = focus * GLOBAL.dofRatio;
    });

    // =================================================================
    //  GUI
    // =================================================================
    const GUI_MASK = 0x20000000;
    const guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene);
    guiCam.layerMask = GUI_MASK;
    scene.activeCameras = [camera, guiCam];

    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (ui.layer) ui.layer.layerMask = GUI_MASK;

    const COL = {
        idle: "#2c2a26", active: "#6f6a3a", edge: "#4b473f",
        text: "#f2ece0", sub: "#a9a293", accent: "#e2dcb6"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "252px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10;
    card.thickness = 1;
    card.color = COL.edge;
    card.background = "rgba(18,17,15,0.82)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "16px";
    ui.addControl(card);

    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "220px";
    panel.isVertical = true;
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
        b.height = "31px"; b.paddingBottom = "5px";
        b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 14;
        b.onPointerUpObservable.add(onClick);
        panel.addControl(b);
        return b;
    }
    function addRow(items) {
        const row = new BABYLON.GUI.StackPanel();
        row.isVertical = false;
        row.height = "36px";
        row.width = "212px";
        panel.addControl(row);
        const out = [];
        for (const it of items) {
            const b = BABYLON.GUI.Button.CreateSimpleButton("r_" + it.label, it.label);
            b.width = (212 / items.length - 4) + "px";
            b.height = "30px";
            b.paddingRight = "4px";
            b.color = COL.text; b.background = COL.idle;
            b.cornerRadius = 6; b.thickness = 0; b.fontSize = 13;
            b.onPointerUpObservable.add(it.onClick);
            row.addControl(b);
            out.push(b);
        }
        return out;
    }
    function addSlider(labelText, min, max, value, onChange) {
        const lb = addLabel(labelText + "  " + value.toFixed(2), 13, COL.accent, "22px");
        const s = new BABYLON.GUI.Slider(labelText);
        s.minimum = min; s.maximum = max; s.value = value;
        s.height = "18px"; s.width = "210px"; s.paddingBottom = "8px";
        s.color = COL.accent; s.background = "#3a352c"; s.borderColor = "transparent";
        s.onValueChangedObservable.add((v) => { lb.text = labelText + "  " + v.toFixed(2); onChange(v); });
        panel.addControl(s);
        return { label: lb, slider: s };
    }
    function addSpacer(h) {
        const r = new BABYLON.GUI.Rectangle();
        r.height = h || "8px"; r.thickness = 0; r.background = "";
        panel.addControl(r);
    }

    addLabel("ONIGIRI / おにぎり", 11, COL.sub, "18px");

    const riceBtns = {}, noriBtns = {}, countBtns = [];
    function highlight() {
        for (const k in riceBtns) riceBtns[k].background = (k === currentRice) ? COL.active : COL.idle;
        for (const k in noriBtns) noriBtns[k].background = (k === currentNori) ? COL.active : COL.idle;
        for (let i = 0; i < countBtns.length; i++) {
            countBtns[i].background = (i + 1 === currentCount) ? COL.active : COL.idle;
        }
    }
    function rebuild() {
        const changed = (currentRice !== lastRiceKey);
        if (changed) {
            // 種類が変わったときだけスライダーを既定へ戻す
            live.translucency = RICE[currentRice].translucency;
            live.coat = 1.0; live.bump = 1.0; live.ao = GLOBAL.aoStrength;
            // 焼きおにぎりは海苔を巻かない。ただし手で切った設定は
            // 同じ種類のあいだは保つ
            currentNori = RICE[currentRice].defaultNori;
            lastRiceKey = currentRice;
        }
        build(currentRice, currentNori, currentSeed, currentCount);
        highlight();
    }

    addLabel("ごはん", 13, COL.accent, "22px");
    for (const k of Object.keys(RICE)) {
        riceBtns[k] = addButton("r_" + k, RICE[k].label, () => { currentRice = k; rebuild(); });
    }
    addLabel("海苔", 13, COL.accent, "22px");
    for (const k of ["pari", "shittori", "none"]) {
        noriBtns[k] = addButton("n_" + k, NORI[k].label, () => { currentNori = k; rebuild(); });
    }
    addLabel("個数", 13, COL.accent, "22px");
    const cb = addRow([
        { label: "1", onClick: () => { currentCount = 1; rebuild(); } },
        { label: "2", onClick: () => { currentCount = 2; rebuild(); } },
        { label: "3", onClick: () => { currentCount = 3; rebuild(); } }
    ]);
    countBtns.push(cb[0], cb[1], cb[2]);
    highlight();

    addSpacer();
    addButton("reseed", "握り直す", () => {
        currentSeed = (currentSeed * 1664525 + 1013904223) >>> 0;
        rebuild();
    });
    const backBtn = addButton("back", "逆光: ON", () => {
        back.setEnabled(!back.isEnabled());
        backBtn.textBlock.text = "逆光: " + (back.isEnabled() ? "ON" : "OFF");
        backBtn.background = back.isEnabled() ? COL.active : COL.idle;
    });
    backBtn.background = COL.active;
    const rotBtn = addButton("rot", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.09;
        rotBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });

    addSpacer();
    // 0 にすると擬似AO無しの「発泡スチロールの塊」が見られる
    const sAO = addSlider("粒間の暗がり", 0, 1.6, live.ao, (v) => { live.ao = v; applyLive(); });
    const sT = addSlider("透光", 0, 0.95, live.translucency, (v) => { live.translucency = v; applyLive(); });
    const sC = addSlider("米の照り ×", 0, 2.0, live.coat, (v) => { live.coat = v; applyLive(); });
    const sB = addSlider("肌理の強さ ×", 0, 2.0, live.bump, (v) => { live.bump = v; applyLive(); });
    const sN = addSlider("海苔の艶 ×", 0, 2.0, live.noriCoat, (v) => { live.noriCoat = v; applyLive(); });

    addSpacer();
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        GLOBAL.useDOF = !GLOBAL.useDOF;
        dp.depthOfFieldEnabled = GLOBAL.useDOF;
        dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
        dofBtn.textBlock.text = "被写界深度: " + (GLOBAL.useDOF ? "ON" : "OFF");
    });
    dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
    addSlider("ぼけ量", 0.01, 0.16, GLOBAL.dofRatio, (v) => { GLOBAL.dofRatio = v; });
    addSlider("F値", 1.2, 11.0, GLOBAL.dofFStop, (v) => { dp.depthOfField.fStop = v; });

    const info = addLabel("", 12, COL.sub, "58px");
    onRebuilt = (st) => {
        sAO.slider.value = live.ao;
        sT.slider.value = live.translucency;
        sC.slider.value = live.coat;
        sB.slider.value = live.bump;
        sN.slider.value = live.noriCoat;
        let n = 0, tri = 0;
        for (const pc of st.pieces) {
            n += pc.nodes.length;
            tri += pc.nodes.length * pc.variants[0].info.tris
                + pc.body.tris + (pc.nori ? pc.nori.tris : 0);
        }
        const C0 = st.pieces[0].C;
        info.text = n + " 粒 / " + tri.toLocaleString() + " tri\n"
            + "1個 " + C0.baseW.toFixed(1) + "×" + C0.hgt.toFixed(1) + "×" + C0.thick.toFixed(1) + "cm\n"
            + "seed: " + st.seed;
    };
    onRebuilt(state);

    scene.onDisposeObservable.add(() => {
        for (const k in riceCache) riceCache[k].dispose();
        for (const k in noriMatCache) {
            const m = noriMatCache[k];
            if (m.texs) for (const t of m.texs) t.dispose();
            m.dispose(true, false);
        }
        woodTex.dispose();
        boardTex.dispose();
    });

    return scene;
};

export default createScene;