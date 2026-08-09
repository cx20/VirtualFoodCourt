// =====================================================================
//  Photoreal Bowl of Rice  /  写実的な「ごはん」（茶碗一杯）
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  米粒.js（1粒の造形とマテリアルの検証台）の続き。
//  茶碗一杯の説得力は
//      (a) 1粒の造形  (b) 1粒のマテリアル  (c) 粒間の暗がり
//  の3つで決まる。(a)(b) は前段で詰めた。ここは (c) が主題になる。
//
//  構成:
//    0. CONFIG        … ごはんの状態プリセット / 器プリセット / 寸法
//    1. Rng           … シード付き擬似乱数
//    2. Noise         … 周期2D値ノイズ（テクスチャ）/ 3D値ノイズ（形状）
//    3. TextureLab    … 米の 法線 / ORM / クリアコート / 厚み
//    4. GrainGeometry … 米粒の掃引メッシュ
//    5. GrainAssets   … 米のPBRマテリアル
//    6. BowlLab       … 釉薬のテクスチャ（窯変・貫入・鉄点・口縁の抜け）
//    7. Bowl          … 茶碗の回転体（高台つき）。手びねりの歪みを持たせる
//    8. Mound         … 盛りの形（ごはんの表面）とその法線
//    9. Grains        … 約1400粒の配置 + 擬似AOのインスタンスカラー焼き込み
//   10. Scene / GUI   … 木のテーブル / IBL / 湯気 / ACES
//
//  ここでの最重要事項:
//  「粒間の暗がり」は SSAO では出ない。SSAOが拾えるのは画面空間で
//   隣接している面の陰りだけで、ごはんの谷は深さ数ミリ・幅数ミリの
//   密集した溝なので、半径を合わせると今度は粒の輪郭が全部汚れる。
//   ここでは各粒の「近傍の最高点からどれだけ沈んでいるか」を配置時に
//   計算し、インスタンスカラーへ焼き込む。追加コストはゼロ、
//   しかも粒の形に沿って正確に暗くなる。
//   GUIの「粒間の暗がり」スライダーを0にすると、これが無い場合の
//   のっぺりした発泡スチロールの塊が見られる。
// =====================================================================

var createScene = function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    // 単位系: 1 unit = 1 cm。米粒は mm で書きたいので変換定数を持つ
    const MM = 0.1;

    // ---- ごはんの状態 ------------------------------------------------
    const PRESETS = {
        // 炊きたて: 膨らんで角が取れ、表面が水の膜で覆われる。透光が最大
        hot: {
            label: "炊きたて",
            lengthMM: 5.60, widthMM: 2.85, heightMM: 2.20,
            albedo: [0.952, 0.932, 0.878],
            baseRough: 0.30,
            // 【対策】粗さ 0.055 は車の塗装の値。この鋭さだと1粒に1つ
            //         小さな鏡ができ、白い錠剤が並んでいるように見える。
            //         炊飯米の水膜はもっと広くにじんだ照りになる。
            coatIntensity: 0.78, coatRough: 0.14,
            translucency: 0.45,              // 拡散のうち透過に回す比率（0〜1）
            tint: [0.99, 0.965, 0.925],
            crackAmount: 0.00,               // 糊化して割れ目は完全にふさがる
            puff: 0.055,
            grooveDepth: 0.020,
            endSwell: 0.055,
            bumpLevel: 0.20,
            wetMottle: 0.38,
            steam: true,
            moundPeak: 2.55,                 // ふっくら盛る
            grainSink: [0.00, 0.26]
        },
        // 冷や飯: 水の膜が乾き、デンプンが老化して白く不透明になる
        cold: {
            label: "冷や飯",
            lengthMM: 5.40, widthMM: 2.75, heightMM: 2.10,
            albedo: [0.938, 0.925, 0.888],
            baseRough: 0.44,
            coatIntensity: 0.32, coatRough: 0.26,
            translucency: 0.18,
            tint: [0.97, 0.95, 0.93],
            crackAmount: 0.10,
            puff: 0.050,
            grooveDepth: 0.028,
            endSwell: 0.030,
            bumpLevel: 0.26,
            wetMottle: 0.55,
            steam: false,
            moundPeak: 2.05,                 // 締まって盛りが低くなる
            grainSink: [0.00, 0.30]
        }
    };

    // ---- 器（釉薬）---------------------------------------------------
    // 色はすべて sRGB。アルベドはテクスチャに焼くので、そのまま書ける
    const BOWLS = {
        ame: {
            label: "飴釉",
            base: [0.30, 0.175, 0.085],
            mottle: 0.42,                    // 窯変のムラの強さ
            rough: 0.20, coat: 0.95, coatRough: 0.055,
            speck: 0.15,
            rimLight: 0.60,                  // 口縁で釉が薄くなって明るく抜ける
            rimTint: [0.66, 0.50, 0.33],
            crazing: 0.0                     // 貫入
        },
        kohiki: {
            label: "粉引",
            base: [0.865, 0.840, 0.785],
            mottle: 0.22,
            rough: 0.52, coat: 0.30, coatRough: 0.26,
            speck: 0.75,                     // 鉄点
            rimLight: 0.30,
            rimTint: [0.52, 0.42, 0.34],
            crazing: 0.35
        },
        kuro: {
            label: "黒マット",
            base: [0.115, 0.108, 0.115],
            mottle: 0.30,
            rough: 0.62, coat: 0.18, coatRough: 0.40,
            speck: 0.25,
            rimLight: 0.40,
            rimTint: [0.42, 0.36, 0.31],
            crazing: 0.0
        }
    };

    // ---- 茶碗の寸法（実寸 cm）----------------------------------------
    // 一般的な飯茶碗: 口径 11.5cm / 高さ 6cm / 高台径 5cm
    const BOWL_GEO = {
        rimY: 6.00,        // 口縁の高さ
        rIn: 5.45,         // 口縁の内径
        rOut: 5.70,        // 口縁の外径
        yFloor: 0.95,      // 見込み（内側の底）
        cIn: 1.90,         // 内側の立ち上がりの曲率（大きいほど底が平ら）
        cOut: 1.75,        // 外側
        rFootOut: 2.45,    // 高台の外径
        rFootIn: 1.95,     // 高台の内径
        yFootTop: 0.90,    // 高台の付け根
        sides: 128,        // 周方向の分割
        wobble: 1.0        // 手びねりの歪み
    };

    // ---- 状態によらない共通設定 ---------------------------------------
    const GLOBAL = {
        // 米粒
        grainRings: 18,       // 1粒の分割（長さ方向）
        grainSides: 16,       //             （周方向）
        grainCount: 2500,     // 表層だけ作る。中身は riceBody が埋める
        grainVariants: 6,     // 形のバリエーション
        texNormal: 512,
        texOther: 256,
        sizeSd: 0.055,
        bend: 0.030,
        asym: 0.86,
        // 【対策】以前 3.0 で「落花生」に見えたのは腹溝が深すぎたのが主因で、
        //         胴の平行さ自体ではなかった。溝を浅くした今は、写真どおり
        //         「胴が平行で両端が急に丸く落ちる」形が正しい。
        //         2.4 まで下げると紡錘形になり、麦やパスタに見える。
        //         逆に 3.2 まで上げると胴が完全な円柱になり、両端だけ急に
        //         丸い「カプセル錠剤」の形になる。実物はなだらかに細る。
        endPow: 2.7,
        endRound: 0.48,
        tipTaper: 0.13,       // 先端側の細り
        sectionP: 2.05,

        // 盛り
        riceEdgeDrop: 0.72,   // 器の縁から何cm下でごはんが器に接するか
        moundLump: 0.42,      // しゃもじの跡のような大きなうねり
        // 【対策】ここを大きく取ると、器の内壁との間に粒のない輪ができ、
        //         そこだけ下地がむき出しになる。実物の米は壁に押しつけられている。
        grainMargin: 0.18,    // 粒の中心を器の内壁からどれだけ離すか
        // 【対策】写真のごはんは、輪郭に粒の先端が突き出して毛羽立っている。
        //         盛りの面に沿って寝かせた粒だけだと、輪郭がなめらかな
        //         ドームの曲線になり、そこで一気に嘘になる。
        //         突き出す粒を「多く・高く・急な角度で」置くこと。
        grainLift: 0.30,      // 塊の上に乗って浮いている粒の高さ
        grainLiftRatio: 0.34, // そのような粒の割合
        clusterSize: 3,       // 何粒ずつ塊で置くか

        // 粒間の暗がり（本題）
        aoFloor: 0.52,        // いちばん深い谷の明るさ
        // 【対策】ここを粒の沈み込みの幅より大きくすると、どの粒もほぼ
        //         最高点と同じ高さになり、暗がりがまったく出ない。
        //         grainSink の幅とそろえること。
        aoDepth: 0.42,        // 近傍最高点から何cm沈むと最も暗くなるか
        aoWall: 0.34,         // 器の内壁ぎわの追加の暗さ
        aoStrength: 1.0,      // GUIスライダーの初期値

        bowlTex: 512,
        useSSAO: true,

        // 被写界深度
        useDOF: true,
        // 【対策】Babylon の錯乱円は「シーン単位 × 1000 = mm」で計算される。
        //         focalLength を固定値（例 105mm）にすると、focusDistance が
        //         21000mm（＝カメラ半径21cm）に対して桁違いに小さく、
        //         被写界深度が数十メートルになって何もボケない。
        //         focalLength を focusDistance の一定比 K にすると focus が
        //         約分され、寄っても引いてもボケ量が一定になる。
        dofRatio: 0.055,
        dofFStop: 2.6
    };

    const START_STATE = "hot";
    const START_BOWL = "ame";
    const START_SEED = 20260806;

    function buildConfig(key, bowlKey, seed) {
        const cfg = Object.assign({}, GLOBAL, PRESETS[key], BOWL_GEO);
        cfg.state = key;
        cfg.bowl = Object.assign({}, BOWLS[bowlKey]);
        cfg.bowlKey = bowlKey;
        cfg.seed = seed >>> 0;
        // ごはんが器に接する高さと、そこでの器の内径
        cfg.riceEdgeY = cfg.rimY - cfg.riceEdgeDrop;
        cfg.riceR = cfg.rIn * Math.pow(
            Math.max(0, (cfg.riceEdgeY - cfg.yFloor) / (cfg.rimY - cfg.yFloor)), 1 / cfg.cIn);
        // 盛りの頂点をわずかに片寄せる（seedごとに向きが変わる）
        const r0 = new Rng(cfg.seed ^ 0x0A51);
        const a0 = r0.range(0, Math.PI * 2), d0 = r0.range(0.10, 0.55);
        cfg.moundOffX = Math.cos(a0) * d0;
        cfg.moundOffZ = Math.sin(a0) * d0;
        return cfg;
    }

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
    // 角度差（周方向の最短距離）
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
        // 3D値ノイズ。形状のゆらぎに使う。
        // 【対策】周方向を u で与えると継ぎ目に段差が出る。
        //         (cosθ, sinθ, t) の3次元で引けば継ぎ目は原理的に発生しない。
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
        }
    };

    // =================================================================
    // 3. TextureLab
    //    UVの取り方: u = 周方向（テクスチャX / 周期的）, v = 長さ方向（テクスチャY）
    //    実寸で周長 ≒ 10mm、長さ ≒ 6.6mm。正方テクスチャでほぼ等方になる
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

        // 胴割れ（横断する割れ目）の線分を先に決める。
        // 【対策】v一定の線を全周に引くと「タイヤの溝」になる。
        //         実物の胴割れは腹側から入って途中で止まる。弧の長さを限定する。
        _cracks(rng, amount) {
            // 【対策】5本も入れると、全周に等間隔の切り込みが並んで
            //         「包丁で切れ目を入れたパン」になる。実物の胴割れは
            //         髪の毛ほどの幅で、精米では1粒に1本あるかどうか。
            const n = Math.round(mix(0, 2.4, clamp(amount, 0, 1)));
            const out = [];
            for (let i = 0; i < n; i++) {
                out.push({
                    v: rng.range(0.16, 0.84),
                    u0: rng.next(),
                    arc: rng.range(0.16, 0.42),      // 周方向にどこまで走るか（0..1）
                    tilt: rng.range(-0.10, 0.10),    // 完全な水平にしない
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
                // 端（極付近）はUVが潰れるので効果をフェードする
                const poleFade = smooth(0, 0.10, v) * (1 - smooth(0.90, 1.0, v));
                for (let x = 0; x < size; x++) {
                    const u = x / size;
                    // (a) デンプン粒の肌理。高周波のみ。低周波を混ぜるとシワになる
                    // 【対策】水の膜のハイライトが1粒に1つの大きな塊になるのは、
                    //         表面が滑らかすぎるから。実物のツヤは小さく鋭い点が
                    //         無数に散ったもの。高周波側に重みを寄せて割る。
                    let e = Noise.fbm2(u * P * 6.5, v * P * 6.5, P * 6.5, seed, 2) * 0.34
                        + Noise.fbm2(u * P * 14, v * P * 14, P * 14, seed + 77, 1) * 0.36
                        + Noise.fbm2(u * P * 28, v * P * 28, P * 28, seed + 151, 1) * 0.30;
                    e = (e - 0.5) * 0.17;
                    // (b) 長さ方向の弱い筋。
                    // 【対策】0.05 も入れると周方向に十数本の畝ができ、
                    //         繊維を巻いたような「まゆ」に見える。うっすらで十分。
                    e += 0.012 * Math.sin(u * TAU * 11 + Noise.value2(v * 3, 0, 3, seed + 5) * 6);
                    // (c) 炊いた粒は端がふくれて細かいシワが出る
                    // 【対策】この帯を v=0,1 に寄せすぎると、下の poleFade で
                    //         きれいに消される。フェードの内側に置く。
                    const endW = smooth(0.62, 0.86, v) + (1 - smooth(0.14, 0.38, v));
                    e += cfg.endSwell * 2.2 * endW
                        * (Noise.fbm2(u * P * 9, v * P * 9, P * 9, seed + 313, 2) - 0.5);
                    // (d) 胴割れ
                    for (let ci = 0; ci < cracks.length; ci++) {
                        const c = cracks[ci];
                        let du = u - c.u0;
                        du -= Math.round(du);                 // -0.5..0.5 に折り返す
                        const half = c.arc * 0.5;
                        if (Math.abs(du) >= half) continue;
                        const dv = v - (c.v + c.tilt * du);
                        const along = 1 - Math.pow(Math.abs(du) / half, 2);   // 端で消える
                        e -= c.d * 0.26 * along * Math.exp(-(dv * dv) / (c.w * c.w));
                    }
                    h[y * size + x] = e * poleFade;
                }
            }
            return h;
        },

        // 法線マップ。
        // 【対策】G成分の符号は (上 - 下)。ここを逆にすると、
        //         割れ目が「盛り上がった土手」に見えて一発で嘘になる。
        //         他の野菜ファイルと同じ規約に揃えてある。
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
        // 割れ目は暗く、かつ粗くする（水が入って光る場合はクリアコート側で戻す）
        ormMap(scene, size, hSmall, cfg, seed) {
            const P = 5;
            return this._canvas("riceORM", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    const v = y / S;
                    for (let x = 0; x < S; x++) {
                        const k = y * S + x, u = x / S;
                        const e = hSmall[k];
                        const cav = clamp(-e * 3.2, 0, 1);              // へこみ量
                        const n = Noise.fbm2(u * P, v * P, P, seed, 3);
                        const ao = clamp(0.97 - 0.28 * cav - 0.04 * (1 - n), 0, 1);
                        const rough = clamp(cfg.baseRough * (0.88 + 0.30 * n) + 0.22 * cav, 0.05, 1);
                        const i = k * 4;
                        d[i] = ao * 255; d[i + 1] = rough * 255; d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // クリアコート = 表面の水の膜。R=強度 / G=粗さ
        // 【対策】膜を完全に均一にすると、粒全体が1個の宝石のように光る。
        //         実物は雲状のムラがあり、乾いた斑ができる。
        //         炊きたて(wetMottle小)は薄いムラ、冷や飯(大)ははっきりした乾き斑。
        coatMap(scene, size, cfg, seed) {
            const P = 4;
            return this._canvas("riceCoat", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    const v = y / S;
                    for (let x = 0; x < S; x++) {
                        const u = x / S;
                        const cloud = Noise.fbm2(u * P, v * P * 0.8, P, seed, 3);
                        const fine = Noise.fbm2(u * P * 3.5, v * P * 3.0, P * 3.5, seed + 61, 2);
                        // 乾き斑: しきい値を超えたところだけ膜が切れる
                        const dry = smooth(0.52, 0.78, cloud) * cfg.wetMottle;
                        // R/G ともに「そのまま使える絶対値」を焼く。
                        // マテリアル側のスカラーは 1.0 にしておき、スライダーは倍率として効かせる
                        const inten = clamp(cfg.coatIntensity * (1 - 0.85 * dry) * (0.86 + 0.20 * fine), 0, 1);
                        const rough = clamp(cfg.coatRough * (0.85 + 0.45 * fine) + 0.30 * dry, 0.02, 1);
                        const i = (y * S + x) * 4;
                        d[i] = inten * 255; d[i + 1] = rough * 255; d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // 厚みマップ（subSurface の R チャンネル）。
        // 端と縁は薄い → そこだけ強く透ける。これが無いと粒全体が均一に光り、
        // 「乳白の飴」ではなく「光る白い豆」になる。
        thicknessMap(scene, size, profFn, seed) {
            return this._canvas("riceThick", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    const v = y / S;
                    const t = clamp(profFn(v), 0, 1);        // 長さ方向の太さ
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
    // 4. GrainGeometry
    // =================================================================
    // 長さ方向のプロファイル（0=胚芽側 → 1=先端、戻り値は最大半径に対する比）
    // 【対策】単純なだ円体にすると、細長い豆にしかならない。
    //         米粒は「胴が長く、両端が急に丸まる」カプセル寄りの形。
    //         endPow で胴の平行度、endRound で端の丸まり方を分けて持つ。
    function profileAt(t, cfg) {
        const s = clamp(t, 0, 1);
        const u = Math.pow(s, cfg.asym);              // 太い位置を胚芽側へ
        const e = 1 - Math.pow(Math.abs(2 * u - 1), cfg.endPow);
        let r = Math.pow(Math.max(0, e), cfg.endRound);
        r *= 1 - cfg.tipTaper * smooth(0.45, 1.0, s); // 先端側だけ細らせる
        return r;
    }

    function buildGrainVertexData(cfg, seed, nT, nS) {
        const rng = new Rng(seed);
        // 個体差（同じ品種でも1粒ずつ違う）
        const kL = rng.gauss(1, cfg.sizeSd);
        const kW = rng.gauss(1, cfg.sizeSd * 1.25);
        const kH = rng.gauss(1, cfg.sizeSd * 1.25);
        const L = cfg.lengthMM * MM * clamp(kL, 0.82, 1.18);
        const halfWmax = cfg.widthMM * MM * 0.5 * clamp(kW, 0.82, 1.18);
        const halfHmax = cfg.heightMM * MM * 0.5 * clamp(kH, 0.82, 1.18);
        const bend = cfg.bend * L * rng.range(0.5, 1.5);
        const ventral = -Math.PI / 2;                  // 腹側 = -Y
        const nseed = (seed + 991) >>> 0;
        const ph = rng.range(0, 20);

        // 胚芽の欠け: 胚芽側の端、腹寄りに1か所
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
            // 反り: 中央を背側(+Y)へ持ち上げる → 腹側が凹になる
            const spineY = bend * (1 - Math.pow(2 * t - 1, 2));
            const x = L * (t - 0.5);
            // 端のふくらみ（炊いた粒）
            const swell = 1 + cfg.endSwell * (smooth(0.78, 1.0, t) + (1 - smooth(0.0, 0.22, t)));

            for (let j = 0; j <= nS; j++) {
                const th = (j % nS) / nS * TAU;
                const cth = Math.cos(th), sth = Math.sin(th);
                let r = rho[j] * pr * swell;

                // (a) 腹溝: 腹側に長さ方向の浅い谷
                const dv = angDist(th, ventral);
                const groove = cfg.grooveDepth * Math.exp(-Math.pow(dv / 0.52, 2))
                    * Math.pow(Math.sin(Math.PI * t), 0.45);
                r -= groove;

                // (b) 胚芽の欠け: 一点をえぐる
                const dg = angDist(th, germPhi);
                const dt2 = (t - germT) / 0.070;
                r -= germDepth * Math.exp(-dt2 * dt2) * Math.exp(-Math.pow(dg / 0.85, 2));

                // (c) 膨らみのゆらぎ（3Dノイズなので継ぎ目が出ない）
                // 【対策】低周波のゆらぎ1本だけだと、なめらかなカプセルにしか
                //         ならない。実物の炊飯米は膨らんだ胴とへこみが同居した
                //         不整形。2階層にして輪郭を崩す。
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

        // 【対策】掃引の巻き順は、断面をどちら回りに取ったかで簡単に裏返る。
        //         裏返ると背面カリングで粒が消えるか、内側だけが見える。
        //         胴のいちばん太いリングの θ=0（+Z側）の法線が外を向いているかで
        //         判定し、違っていたら三角形の向きを入れ替えて焼き直す。
        {
            const pi = Math.round(nT * 0.45) * (nS + 1);   // θ=0 の頂点
            if (normals[pi * 3 + 2] < 0) {
                for (let k = 0; k < indices.length; k += 3) {
                    const tmp = indices[k + 1];
                    indices[k + 1] = indices[k + 2];
                    indices[k + 2] = tmp;
                }
                BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            }
        }

        // 【対策】UVのために周方向の最初と最後を二重に持っているので、
        //         そのままだと継ぎ目に1本の陰の線が出る。法線を足して溶接する。
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

        // 接地させるために、ローカル座標での上下端を測っておく。
        // 【対策】回転後のAABBから求めると、8隅を変換した保守的な箱になり、
        //         倍率14倍では数ミリ浮いて接地影が離れる。実測値を持たせる。
        let minY = Infinity, maxY = -Infinity;
        for (let i = 1; i < positions.length; i += 3) {
            const y = positions[i];
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }

        const vd = new BABYLON.VertexData();
        vd.positions = positions;
        vd.normals = normals;
        vd.uvs = uvs;
        vd.colors = colors;
        vd.indices = indices;
        // 【対策】info に vd を入れるとメッシュが生きているあいだ
        //         巨大な型付き配列が解放されない。数値だけを持たせる。
        const info = { L, halfWmax, halfHmax, minY, maxY, tris: nT * nS * 2, verts: nV };
        return { vd, info };
    }

    // =================================================================
    // 5. GrainFactory : テクスチャ + マテリアル + メッシュ
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
        // 【対策】subSurface の厚みはワールド単位。拡大表示した粒に実寸用の
        //         厚みを与えると「相対的に薄い」ことになり、透けすぎて幽霊になる。
        //         逆に実寸の粒に拡大用の厚みを渡すと、まったく透けない白い米になる。
        //         倍率ごとにマテリアルを分けるのが唯一の正解。
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
            pbr.bumpTexture.level = 1.0;         // 強さは焼く段階で入れてある

            // --- 表面の水の膜。米の艶はこれが本体
            pbr.clearCoat.isEnabled = true;
            // 【対策】clearCoat の intensity / roughness は、テクスチャを指定すると
            //         「スカラー × テクスチャ値」で効く。絶対値はテクスチャ側に
            //         焼いてあるので、スカラーは 1.0 が既定。
            //         GUIのスライダーはこのスカラー＝倍率を触る。
            pbr.clearCoat.intensity = 1.0;       // 実値はcoatMapのR
            pbr.clearCoat.roughness = 1.0;       //              G
            pbr.clearCoat.texture = this.texCoat;
            pbr.clearCoat.useRoughnessFromMainTexture = true;
            // 【対策】既定のIORは1.5（樹脂のコート）。米にのっているのは水なので
            //         1.33 にする。反射率が下がって「濡れている」側に寄る。
            if ("indexOfRefraction" in pbr.clearCoat) pbr.clearCoat.indexOfRefraction = 1.33;

            // --- 透過（糊化したデンプンの散乱）
            const sub = pbr.subSurface;
            sub.isTranslucencyEnabled = true;
            sub.tintColor = col3(cfg.tint);
            // 【対策】Babylon 8 以降、translucencyIntensity は「透けを足す強さ」ではなく
            //         「拡散反射と拡散透過の配分比」になっている。シェーダ側は
            //             info.diffuse = computeDiffuseLighting(...) * (1.0 - translucencyIntensity)
            //         かつ IBL も finalIrradiance *= (1.0 - translucencyIntensity)。
            //         したがって
            //           ・1.0 を超えると拡散が負になり、鏡面だけの黒い玉になる
            //           ・1.0 ちょうどで拡散反射が完全に消える
            //         有効範囲は 0〜1。白い被写体では 0.5 を超えるだけでかなり暗い。
            //         7系の挙動に戻したいときは sub.legacyTranslucency = true。
            sub.translucencyIntensity = clamp(cfg.translucency, 0, 0.95);
            sub.thicknessTexture = this.texThick;
            // 【対策】glTF流のチャンネル配置だと厚みはGに入る。既定はRだが、
            //         バージョンによって初期値が違うので明示しておく。
            if ("useGltfStyleTextures" in sub) sub.useGltfStyleTextures = false;
            sub.useMaskFromThicknessTexture = false;
            const H = cfg.heightMM * MM * scale;
            sub.minimumThickness = H * 0.06;
            sub.maximumThickness = H * 0.95;
            sub.tintColorAtDistance = H * 1.25;
            // 【対策】屈折は入れない。米は透明体ではなく散乱体なので、
            //         屈折を足すと途端に「ガラスの米」になる。
            sub.isRefractionEnabled = false;

            this.mats.push(pbr);
            return pbr;
        }

        dispose() {
            for (const m of this.mats) m.dispose(true, false);
            this.mats.length = 0;
            // 【対策】マテリアルだけ捨ててテクスチャを残すと、状態を切り替える
            //         たびにVRAMが増え続ける。4枚とも明示的に破棄する。
            for (const t of [this.texNormal, this.texORM, this.texCoat, this.texThick]) t.dispose();
        }
    }

    function makeMesh(name, scene, cfg, seed, nT, nS, mat, scale, instanced) {
        const g = buildGrainVertexData(cfg, seed, nT, nS);
        const m = new BABYLON.Mesh(name, scene);
        g.vd.applyToMesh(m, false);
        // 【対策】インスタンス色を使うため、素メッシュにも白の頂点カラーを持たせる。
        //         こうしないと VERTEXCOLOR の define が立たず色が反映されない。
        m.hasVertexAlpha = false;              // trueだと透明パスに落ちて描画順が壊れる
        // 【対策】インスタンスを作らないメッシュに registerInstancedBuffer すると、
        //         要素数0のバッファができて環境によっては警告が出る。使う側だけ登録する。
        if (instanced) {
            m.registerInstancedBuffer("color", 4);
            m.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
        }
        m.material = mat;
        m.scaling.setAll(scale);
        m.receiveShadows = true;
        m.info = g.info;
        return m;
    }

    // =================================================================
    // 6. BowlLab : 釉薬のテクスチャ
    //    UV: u = 周方向, v = 断面に沿った弧長（＝口縁が v の特定値に来る）
    // =================================================================
    const BowlLab = {
        _canvas: TextureLab._canvas,

        // 鉄点（粉引の黒い点）。粗い格子ごとに1点、確率で出す
        _speck(x, y, S, seed, amount) {
            if (amount <= 0) return 0;
            const CS = 14;
            const ci = Math.floor(x / CS), cj = Math.floor(y / CS);
            const h3 = Noise._h2(ci, cj, seed + 307);
            if (h3 > 0.30 * amount) return 0;
            const h1 = Noise._h2(ci, cj, seed + 101), h2 = Noise._h2(ci, cj, seed + 211);
            const px = (ci + h1) * CS, py = (cj + h2) * CS;
            const rad = 1.0 + 2.2 * h1;
            const d = Math.hypot(x - px, y - py);
            return 1 - smooth(rad * 0.45, rad, d);
        },

        // アルベド: 窯変のムラ + 口縁の抜け + 鉄点 + 貫入
        // 【対策】色をマテリアルのalbedoColorで持ち、テクスチャをグレースケールの
        //         乗算にすると、口縁だけ色相を変える（釉が薄く抜けて土色になる）
        //         ことができない。色そのものをsRGBで焼いてalbedoColorは白にする。
        albedo(scene, size, bp, vRim, seed) {
            return this._canvas("bowlAlbedo", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    const v = y / S;
                    for (let x = 0; x < S; x++) {
                        const u = x / S;
                        const m1 = Noise.fbm2(u * 6, v * 6, 6, seed, 4);
                        const m2 = Noise.fbm2(u * 20, v * 20, 20, seed + 7, 2);
                        let k = 1 - bp.mottle * (0.60 * (1 - m1) + 0.40 * (1 - m2));
                        // 貫入（釉のひび）。細い線を2方向に走らせる
                        if (bp.crazing > 0) {
                            const w = Noise.fbm2(u * 5, v * 5, 5, seed + 51, 3);
                            const l1 = Math.abs(Math.sin((u * 13 + w * 4) * Math.PI));
                            const l2 = Math.abs(Math.sin((v * 19 - w * 5) * Math.PI));
                            const cr = clamp((1 - smooth(0, 0.030, l1)) + (1 - smooth(0, 0.026, l2)), 0, 1);
                            k *= 1 - 0.20 * bp.crazing * cr;
                        }
                        k *= 1 - 0.62 * this._speck(x, y, S, seed, bp.speck);

                        let r = bp.base[0] * k, g = bp.base[1] * k, b = bp.base[2] * k;
                        // 口縁: 釉が流れて薄くなり、土の色が透ける
                        const band = Math.exp(-Math.pow((v - vRim) / 0.020, 2));
                        const rl = clamp(bp.rimLight * band * (0.55 + 0.45 * m2), 0, 1);
                        r = mix(r, bp.rimTint[0], rl);
                        g = mix(g, bp.rimTint[1], rl);
                        b = mix(b, bp.rimTint[2], rl);

                        const i = (y * S + x) * 4;
                        d[i] = clamp(r, 0, 1) * 255;
                        d[i + 1] = clamp(g, 0, 1) * 255;
                        d[i + 2] = clamp(b, 0, 1) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        orm(scene, size, bp, vRim, seed) {
            return this._canvas("bowlORM", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    const v = y / S;
                    for (let x = 0; x < S; x++) {
                        const u = x / S;
                        const n = Noise.fbm2(u * 7, v * 7, 7, seed + 13, 3);
                        const band = Math.exp(-Math.pow((v - vRim) / 0.020, 2));
                        // 口縁は釉が薄い＝ざらつく
                        const rough = clamp(bp.rough * (0.85 + 0.30 * n) + 0.30 * band, 0.04, 1);
                        const ao = clamp(0.97 - 0.06 * (1 - n), 0, 1);
                        const i = (y * S + x) * 4;
                        d[i] = ao * 255; d[i + 1] = rough * 255; d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // 法線: ろくろ目（水平の細い段）+ 土の粒 + 鉄点の凹み
        normal(scene, size, bp, seed) {
            const h = new Float32Array(size * size);
            for (let y = 0; y < size; y++) {
                const v = y / size;
                for (let x = 0; x < size; x++) {
                    const u = x / size;
                    const w = Noise.fbm2(u * 4, v * 4, 4, seed + 3, 2);
                    // ろくろ目: v方向に細かい段。周方向にゆっくりうねる
                    let e = 0.10 * Math.sin((v * 190 + w * 2.4) * Math.PI * 2);
                    e += 0.045 * Math.sin((v * 41 + w * 1.2) * Math.PI * 2);
                    e += (Noise.fbm2(u * 40, v * 40, 40, seed + 9, 2) - 0.5) * 0.22;
                    e -= 0.55 * this._speck(x, y, size, seed, bp.speck);
                    h[y * size + x] = e;
                }
            }
            return TextureLab.normalMap(scene, size, h, 0.28);
        }
    };

    // =================================================================
    // 7. Bowl : 茶碗（回転体・高台つき）
    // =================================================================
    function bowlProfile(G) {
        const P = [];
        // 見込み（内側）: 中心 → 口縁
        for (let i = 0; i <= 46; i++) {
            const u = i / 46;
            P.push({ r: G.rIn * u, y: G.yFloor + (G.rimY - G.yFloor) * Math.pow(u, G.cIn) });
        }
        // 口縁の丸み（半円）
        const cx = (G.rIn + G.rOut) * 0.5, rr = (G.rOut - G.rIn) * 0.5;
        const rimIndex = P.length + 4;
        for (let i = 1; i <= 10; i++) {
            const a = Math.PI * (1 - i / 10);
            P.push({ r: cx + rr * Math.cos(a), y: G.rimY + rr * Math.sin(a) });
        }
        // 外側: 口縁 → 高台の付け根
        const outStart = P.length;
        for (let i = 1; i <= 42; i++) {
            const u = 1 - i / 42;
            P.push({
                r: G.rFootOut + (G.rOut - G.rFootOut) * u,
                y: G.yFootTop + (G.rimY - G.yFootTop) * Math.pow(u, G.cOut)
            });
        }
        const probeIndex = outStart + 12;      // 外壁の中ほど（巻き順の判定に使う）
        // 高台の外側 → 接地面 → 内側
        P.push({ r: G.rFootOut + 0.012, y: 0.42 });
        P.push({ r: G.rFootOut, y: 0.09 });
        P.push({ r: G.rFootOut - 0.045, y: 0.0 });
        P.push({ r: G.rFootIn + 0.055, y: 0.0 });
        P.push({ r: G.rFootIn, y: 0.065 });
        P.push({ r: G.rFootIn, y: 0.30 });
        P.push({ r: G.rFootIn, y: 0.52 });
        // 底裏
        for (let i = 1; i <= 20; i++) {
            const u = 1 - i / 20;
            P.push({ r: G.rFootIn * u, y: 0.62 - 0.10 * Math.pow(u, 1.6) });
        }
        return { P, rimIndex, probeIndex };
    }

    function buildBowl(scene, cfg, mat, rng) {
        const { P, rimIndex, probeIndex } = bowlProfile(cfg);
        const N = P.length, M = cfg.sides;

        // 弧長（UVのv）
        const arc = new Float32Array(N);
        for (let i = 1; i < N; i++) {
            arc[i] = arc[i - 1] + Math.hypot(P[i].r - P[i - 1].r, P[i].y - P[i - 1].y);
        }
        const total = arc[N - 1] || 1;
        const vRim = arc[rimIndex] / total;

        const ph = [rng.range(0, 9), rng.range(0, 9), rng.range(0, 9), rng.range(0, 9)];
        const nV = N * (M + 1);
        const positions = new Float32Array(nV * 3);
        const normals = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array((N - 1) * M * 6);

        let vo = 0;
        for (let i = 0; i < N; i++) {
            const p = P[i];
            // 【対策】口縁だけを歪ませると器がねじれて見える。内外の同じ高さを
            //         いっしょに動かすことで、肉厚を保ったまま口が波打つ。
            const mask = smooth(3.4, 5.9, p.y);
            for (let j = 0; j <= M; j++) {
                const th = (j % M) / M * TAU;
                const wob = 1 + cfg.wobble * (0.0048 * Math.sin(3 * th + ph[0])
                    + 0.0030 * Math.sin(5 * th + ph[1]));
                const dy = cfg.wobble * mask * (0.030 * Math.sin(2 * th + ph[2])
                    + 0.017 * Math.sin(3 * th + ph[3]));
                const r = p.r * wob;
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = r * Math.cos(th);
                positions[p3 + 1] = p.y + dy;
                positions[p3 + 2] = r * Math.sin(th);
                uvs[p2] = j / M;
                uvs[p2 + 1] = arc[i] / total;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < N - 1; i++) {
            for (let j = 0; j < M; j++) {
                const a = i * (M + 1) + j, b = a + 1, c = a + (M + 1), d = c + 1;
                indices[io++] = a; indices[io++] = c; indices[io++] = b;
                indices[io++] = b; indices[io++] = c; indices[io++] = d;
            }
        }
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        // 巻き順の自動判定: 外壁 θ=0 の法線は +X を向くはず
        {
            const pi = probeIndex * (M + 1);
            if (normals[pi * 3] < 0) {
                for (let k = 0; k < indices.length; k += 3) {
                    const t = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = t;
                }
                BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            }
        }
        // 継ぎ目の法線を溶接
        for (let i = 0; i < N; i++) {
            const a = (i * (M + 1)) * 3, b = (i * (M + 1) + M) * 3;
            let nx = normals[a] + normals[b], ny = normals[a + 1] + normals[b + 1],
                nz = normals[a + 2] + normals[b + 2];
            const l = Math.hypot(nx, ny, nz) || 1;
            nx /= l; ny /= l; nz /= l;
            normals[a] = normals[b] = nx;
            normals[a + 1] = normals[b + 1] = ny;
            normals[a + 2] = normals[b + 2] = nz;
        }

        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.normals = normals; vd.uvs = uvs; vd.indices = indices;
        const mesh = new BABYLON.Mesh("bowl", scene);
        vd.applyToMesh(mesh, false);
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.vRim = vRim;
        mesh.tris = (N - 1) * M * 2;
        return mesh;
    }

    function bowlMaterial(scene, cfg, name) {
        const bp = cfg.bowl, S = cfg.bowlTex;
        // vRim は profile から先に求めておく（テクスチャを焼くのに必要）
        const { P, rimIndex } = bowlProfile(cfg);
        let acc = 0, at = 0;
        for (let i = 1; i < P.length; i++) {
            const d = Math.hypot(P[i].r - P[i - 1].r, P[i].y - P[i - 1].y);
            acc += d;
            if (i === rimIndex) at = acc;
        }
        const vRim = at / (acc || 1);

        const pbr = new BABYLON.PBRMaterial(name, scene);
        const texA = BowlLab.albedo(scene, S, bp, vRim, 4001);
        const texO = BowlLab.orm(scene, S, bp, vRim, 4001);
        const texN = BowlLab.normal(scene, S, bp, 4001);
        // 【対策】色はテクスチャにsRGBで焼いてあるので albedoColor は白。
        //         ここに色を入れると二重掛けになって沈む。
        pbr.albedoColor = new BABYLON.Color3(1, 1, 1);
        pbr.albedoTexture = texA;
        pbr.metallic = 0.0;
        pbr.roughness = 1.0;
        pbr.metallicTexture = texO;
        pbr.useAmbientOcclusionFromMetallicTextureRed = true;
        pbr.useRoughnessFromMetallicTextureGreen = true;
        pbr.useMetallnessFromMetallicTextureBlue = true;
        pbr.bumpTexture = texN;
        pbr.bumpTexture.level = 1.0;
        // 釉薬はガラス層。米の水膜(1.33)と違い IOR は 1.5 のまま
        pbr.clearCoat.isEnabled = true;
        pbr.clearCoat.intensity = bp.coat;
        pbr.clearCoat.roughness = bp.coatRough;
        pbr.texs = [texA, texO, texN];
        return pbr;
    }

    // =================================================================
    // 8. Mound : 盛りの形
    // =================================================================
    function moundY(x, z, cfg) {
        // 【対策】山を器の中心に真っ直ぐ立てると、それだけで「型で抜いた」印象になる。
        //         しゃもじでよそったごはんの頂点は必ずどこかへ片寄っている。
        const dx = x - cfg.moundOffX, dz = z - cfg.moundOffZ;
        const r = Math.hypot(dx, dz);
        const u = clamp(r / cfg.riceR, 0, 1);
        // 【対策】指数を小さくすると肩が張って半球になり、器の縁に「ボール」が
        //         載った状態＝仏飯（お供え）になる。1.0 前後だと肩が落ちて、
        //         縁ぎわでごはんが器の内側に収まる。写真はどれもこの形。
        const dome = cfg.moundPeak * Math.pow(Math.max(0, 1 - u * u), 1.00);
        // 【対策】完全なドームにすると「型で抜いたゼリー」になる。
        //         しゃもじでよそったごはんは大きく波打っている。
        //         ただし縁ではうねりを消さないと器から浮く。
        const fade = 1 - smooth(0.80, 1.0, u);
        const sd = cfg.seed ^ 0x77;
        // 大きなうねり（しゃもじの塊）と、その半分の大きさのうねりを重ねる。
        // 1オクターブだけだと、なめらかな丘が1つできるだけで質感にならない。
        const lump = ((Noise.value3(x * 0.50 + 31, z * 0.50 + 17, 5.3, sd) - 0.5) * 2.0
            + (Noise.value3(x * 1.30 + 7, z * 1.30 + 3, 2.1, sd + 91) - 0.5) * 1.1)
            * cfg.moundLump * fade;
        return cfg.riceEdgeY + dome + lump;
    }
    function moundN(x, z, cfg) {
        const e = 0.07;
        const dx = (moundY(x + e, z, cfg) - moundY(x - e, z, cfg)) / (2 * e);
        const dz = (moundY(x, z + e, cfg) - moundY(x, z - e, cfg)) / (2 * e);
        const n = new V3(-dx, 1, -dz);
        n.normalize();
        return n;
    }

    // 粒のすき間から器の内側が見えないように、盛りの形そのものを1枚張る。
    // 【対策】これが無いと、粒と粒のあいだから黒い穴が見えて「まばらに
    //         米を貼りつけた飾り」になる。実物は下に米が詰まっている。
    function buildRiceBody(scene, cfg, mat) {
        const NR = 64, NS = 144, R = cfg.riceR * 1.04;
        const sd = (cfg.seed ^ 0x33AB) >>> 0;
        const nV = (NR + 1) * (NS + 1);
        const positions = new Float32Array(nV * 3);
        const normals = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const colors = new Float32Array(nV * 4);
        const indices = new Uint32Array(NR * NS * 6);
        let vo = 0;
        for (let i = 0; i <= NR; i++) {
            const u = i / NR, r = R * u;
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                const x = r * Math.cos(th), z = r * Math.sin(th);
                const p3 = vo * 3, p2 = vo * 2, p4 = vo * 4;
                positions[p3] = x;
                // 【対策】下地を数学的になめらかな面にすると、粒のすき間から
                //         見えた瞬間に「水面」になる。実際にそこにあるのは
                //         押し合った米の塊なので、粒と同じくらいの凹凸を持たせる。
                const bump = (Noise.value3(x * 2.4 + 5, z * 2.4 + 9, 1.7, sd) - 0.5) * 2 * 0.085
                    + (Noise.value3(x * 6.0 + 2, z * 6.0 + 4, 3.3, sd + 29) - 0.5) * 2 * 0.040;
                positions[p3 + 1] = moundY(x, z, cfg) - 0.18 + bump;
                positions[p3 + 2] = z;
                uvs[p2] = j / NS * 6; uvs[p2 + 1] = u * 6;
                // 下地は「粒の底」なので暗い。縁に近いほどさらに暗い
                const k = 0.38 * (1 - 0.30 * smooth(0.55, 1.0, u));
                colors[p4] = k * 1.06; colors[p4 + 1] = k * 0.98; colors[p4 + 2] = k * 0.78; colors[p4 + 3] = 1;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < NR; i++) {
            for (let j = 0; j < NS; j++) {
                const a = i * (NS + 1) + j, b = a + 1, c = a + (NS + 1), d = c + 1;
                indices[io++] = a; indices[io++] = c; indices[io++] = b;
                indices[io++] = b; indices[io++] = c; indices[io++] = d;
            }
        }
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        if (normals[(NR * (NS + 1)) * 3 + 1] < 0) {
            for (let k = 0; k < indices.length; k += 3) {
                const t = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = t;
            }
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.normals = normals; vd.uvs = uvs;
        vd.colors = colors; vd.indices = indices;
        const mesh = new BABYLON.Mesh("riceBody", scene);
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.tris = NR * NS * 2;
        return mesh;
    }

    // =================================================================
    // 9. Grains : 配置と「粒間の暗がり」の焼き込み
    // =================================================================
    function placeGrains(cfg, rng) {
        // 塊の中心は、粒ごとの乱数とは別の系列から引く（同じ塊の粒で共有する）
        const cseed = (cfg.seed ^ 0x51ED) >>> 0;
        const _cc = new Map();
        const rngC = (ci) => {
            let r = _cc.get(ci);
            if (!r) { r = new Rng((cseed + ci * 2654435761) >>> 0); _cc.set(ci, r); }
            return r;
        };
        const n = cfg.grainCount;
        const Rmax = cfg.riceR - cfg.grainMargin;
        const out = [];
        // 【対策】1粒ずつ独立に撒くと、統計的に均一な絨毯になる。実物のごはんは
        //         数粒がくっついた塊と、そのあいだの空隙でできている。
        //         種を撒いて、その周りへ数粒ずつ寄せる。
        const CS = Math.max(1, cfg.clusterSize | 0);
        const cn = Math.ceil(n / CS);
        for (let i = 0; i < n; i++) {
            const ci = (i / CS) | 0;
            const rc0 = rngC(ci);
            // 半径は面積等分の数列から、角度は完全な乱数。
            // （両方を黄金角で決めると渦巻き模様が見える）
            // 【対策】sqrt は円板を面積等分する。ところが盛りは外側ほど傾いていて
            //         実面積が大きく、しかも横から見ると外周が最も広く見える。
            //         指数を 0.5 より小さくして、外周へ粒を寄せる。
            const rc = Rmax * Math.pow((ci + 0.5) / cn, 0.42) * rc0.range(0.90, 1.10);
            const thc = rc0.range(0, TAU);
            const off = rng.range(0, 0.34), oa = rng.range(0, TAU);
            let x = rc * Math.cos(thc) + Math.cos(oa) * off;
            let z = rc * Math.sin(thc) + Math.sin(oa) * off;
            const rr = Math.hypot(x, z) || 1;
            if (rr > Rmax) { const k = Rmax / rr; x *= k; z *= k; }
            const r = Math.hypot(x, z);
            // 【対策】全粒を面ぴったりに置くと、モザイクを貼ったように
            //         隙間なく敷き詰まって「型に詰めたごはん」になる。
            //         ふっくらしたごはんは、塊の上に乗って浮いている粒がある。
            const g0 = cfg.grainSink[0], g1 = cfg.grainSink[1];
            const t = rng.next();
            const sink = (t < cfg.grainLiftRatio)
                ? -cfg.grainLift * (t / cfg.grainLiftRatio)          // 浮いた粒
                : g0 + (g1 - g0) * Math.pow((t - cfg.grainLiftRatio)
                    / (1 - cfg.grainLiftRatio), 1.9);
            out.push({ x, z, r, y: moundY(x, z, cfg) - sink });
        }
        return out;
    }

    // ---- 本題: 擬似AO ------------------------------------------------
    // 各粒が「近傍の最高点からどれだけ沈んでいるか」を求め、
    // それをインスタンスカラーに焼く。描画時のコストはゼロ。
    // 【対策】SSAOでこれを出そうとすると、半径を谷の幅（数mm）に合わせる
    //         ことになり、今度は粒の輪郭すべてに黒い縁がついて汚れる。
    //         幾何的に分かっている情報は、配置の段階で焼くほうが正確で速い。
    function bakeAO(pts, cfg) {
        const cell = 0.36, OFF = 4096;
        const key = (i, j) => (i + OFF) * 100003 + (j + OFF);
        // 【対策】素の高さで近傍最高点を取ると、盛りの斜面そのものの傾きを
        //         「沈み込み」として拾ってしまい、山の外側半分が丸ごと暗くなる。
        //         盛りの面からの差（残差）に直してから比べること。
        const top = new Map();
        for (const p of pts) {
            p.res = p.y - moundY(p.x, p.z, cfg);
            const i = Math.floor(p.x / cell), j = Math.floor(p.z / cell);
            const k = key(i, j);
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
            let ao = clamp(1 - (m - p.res) / cfg.aoDepth, 0, 1);
            ao = cfg.aoFloor + (1 - cfg.aoFloor) * Math.pow(ao, 0.75);
            // 器の内壁ぎわは、壁に空が遮られてさらに暗い
            const wall = smooth(cfg.riceR * 0.66, cfg.riceR, p.r);
            ao *= 1 - cfg.aoWall * wall;
            p.ao = ao;
        }
        return pts;
    }

    // 【対策】遮蔽ぶんを一様に引くと、谷は必ず中性グレーになる。ところが
    //         米粒はほぼ半透明なので、谷に落ちた光は隣の粒を何度も通り抜け、
    //         黄色みを帯びて戻ってくる。実物の写真では、谷は「暗い」より
    //         「クリーム色に濁っている」に近い。
    //         暗くするほど青を強く落とし、赤はほとんど落とさないこと。
    //         灰色のままだと、どれだけ形を作り込んでも陶器のビーズに見える。
    function aoColor(ao, strength) {
        const v = clamp(1 - (1 - ao) * strength, 0.02, 1);
        const w = 1 - v;                      // 暗さ 0..1
        return new BABYLON.Color4(
            v * (1 + 0.10 * w),               // 赤はむしろ持ち上げる
            v * (1 - 0.02 * w),
            v * (1 - 0.30 * w), 1);
    }

    function buildGrains(scene, cfg, mat, rng) {
        const variants = [];
        for (let vi = 0; vi < cfg.grainVariants; vi++) {
            variants.push(makeMesh("grain" + vi, scene, cfg, (cfg.seed + vi * 1013) >>> 0,
                cfg.grainRings, cfg.grainSides, mat, 1, true));
        }
        const pts = bakeAO(placeGrains(cfg, rng), cfg);
        const used = new Set();
        const nodes = [];
        const up = new V3(0, 1, 0);
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const variant = variants[i % variants.length];
            let node;
            if (!used.has(variant)) { used.add(variant); node = variant; }
            else node = variant.createInstance("g" + i);

            node.position.set(p.x, p.y, p.z);

            // 姿勢: 盛りの法線に寝かせ、面内でランダムに回し、さらに崩す
            const nrm = moundN(p.x, p.z, cfg);
            const axis = V3.Cross(up, nrm);
            const len = axis.length();
            let q = (len < 1e-5)
                ? BABYLON.Quaternion.Identity()
                : BABYLON.Quaternion.RotationAxis(axis.scale(1 / len), Math.asin(clamp(len, -1, 1)));
            const spin = BABYLON.Quaternion.RotationAxis(nrm, rng.range(0, TAU));
            let rv = new V3(rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1));
            if (rv.lengthSquared() < 1e-8) rv = new V3(1, 0, 0);
            rv.normalize();
            // 【対策】全粒を同じばらつきで寝かせると整列して見える。
            //         大半は寝かせ、一部だけ大きく起こす。この「少数の立った粒」が
            //         ふっくら感の正体で、これが無いと表面が舗装になる。
            const loose = rng.next() < 0.42;
            const tilt = BABYLON.Quaternion.RotationAxis(rv, rng.gauss(0, loose ? 1.15 : 0.26));
            node.rotationQuaternion = tilt.multiply(spin.multiply(q));

            // 同じメッシュの使い回しを隠す、軸ごとに違う倍率
            // 【対策】全粒が同じ縦横比だと整った工業製品に見える。実物には
            //         必ず折れた粒・短い粒が混ざっていて、これが1割強ある。
            const broken = rng.next() < 0.16;
            node.scaling.set(
                broken ? rng.range(0.60, 0.80) : rng.range(0.92, 1.08),
                rng.range(0.94, 1.06), rng.range(0.94, 1.06));
            node.instancedBuffers.color = aoColor(p.ao, cfg.aoStrength);
            nodes.push(node);
        }
        return { variants, nodes, pts };
    }

    // =================================================================
    // 10. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.030, 0.028, 0.026, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.72;

    const camera = new BABYLON.ArcRotateCamera("cam", -1.05, 1.06, 21, new V3(0, 3.7, 0), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 10;
    // 【対策】ポストプロセスを通すとシーンは深度つきのRTへ描かれる。
    //         minZ 0.05 / maxZ 既定(10000) のままだと深度の分解能が
    //         足りず、深く重なった粒どうしが勝ったり負けたりする。
    camera.minZ = 1.5;
    camera.maxZ = 200;
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 90;
    camera.upperBetaLimit = 1.52;   // テーブルの下へ潜らせない
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.48, -0.92, 0.44).normalize(), scene);
    key.position = new V3(16, 30, -14);
    key.intensity = 2.8;
    key.diffuse = new BABYLON.Color3(1.0, 0.972, 0.930);
    // 【対策】平行光の影の範囲は、既定だとキャスター（器と盛り）の
    //         バウンディングボックスにぴったり合わせられる。すると影の落ちる先
    //         （テーブル）が範囲外になり、影が直線でぶつ切りになる。
    //         正射影の範囲を手で切って、落ちる先まで含める。
    key.autoUpdateExtends = false;
    key.orthoLeft = -16; key.orthoRight = 16;
    key.orthoBottom = -16; key.orthoTop = 16;
    key.shadowMinZ = 1; key.shadowMaxZ = 70;

    const back = new BABYLON.DirectionalLight("back", new V3(0.42, -0.26, -1.0).normalize(), scene);
    back.intensity = 1.7;
    back.diffuse = new BABYLON.Color3(1.0, 0.93, 0.84);
    back.specular = new BABYLON.Color3(0.55, 0.55, 0.55);

    const fill = new BABYLON.HemisphericLight("fill", new V3(0, 1, 0), scene);
    fill.intensity = 0.12;

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.004;
    sg.normalBias = 0.014;
    sg.setDarkness(0.32);          // 屋内の影は真っ黒にならない

    // ---- 木のテーブル -------------------------------------------------
    function woodTexture(size) {
        return TextureLab._canvas("wood", size, (d, S) => {
            const LIGHT = [0.62, 0.44, 0.27], DARK = [0.36, 0.23, 0.13];
            for (let y = 0; y < S; y++) {
                const v = y / S;
                for (let x = 0; x < S; x++) {
                    const u = x / S;
                    // 板目: 長手方向に引き伸ばしたノイズで年輪を歪ませる
                    const w = Noise.fbm2(u * 2.0, v * 14.0, 16, 21, 4);
                    const ring = 0.5 + 0.5 * Math.sin((w * 9 + v * 2.5) * Math.PI * 2);
                    const pore = Noise.fbm2(u * 60, v * 12, 60, 33, 2);
                    let k = Math.pow(ring, 1.7) * 0.85 + 0.15 * pore;
                    const i = (y * S + x) * 4;
                    d[i] = mix(DARK[0], LIGHT[0], k) * 255;
                    d[i + 1] = mix(DARK[1], LIGHT[1], k) * 255;
                    d[i + 2] = mix(DARK[2], LIGHT[2], k) * 255;
                    d[i + 3] = 255;
                }
            }
        }, scene);
    }
    const table = BABYLON.MeshBuilder.CreateGround("table", { width: 200, height: 200 }, scene);
    const tableMat = new BABYLON.PBRMaterial("tableMat", scene);
    const woodTex = woodTexture(512);
    woodTex.uScale = 26; woodTex.vScale = 26;
    tableMat.albedoTexture = woodTex;
    tableMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    tableMat.metallic = 0.0;
    tableMat.roughness = 0.48;
    tableMat.clearCoat.isEnabled = true;
    tableMat.clearCoat.intensity = 0.28;
    tableMat.clearCoat.roughness = 0.30;
    table.material = tableMat;
    table.receiveShadows = true;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.14;
    ip.contrast = 1.24;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 2.6;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    // ---- 湯気 ---------------------------------------------------------
    function steamTexture() {
        const dt = new BABYLON.DynamicTexture("steamTex", { width: 128, height: 128 }, scene, true);
        const ctx = dt.getContext();
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0.0, "rgba(255,255,255,1)");
        g.addColorStop(0.45, "rgba(255,255,255,0.45)");
        g.addColorStop(1.0, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        dt.update();
        dt.hasAlpha = true;
        return dt;
    }
    const steamTex = steamTexture();
    const steam = new BABYLON.ParticleSystem("steam", 400, scene);
    steam.particleTexture = steamTex;
    steam.emitter = new V3(0, 7.6, 0);
    steam.minEmitBox = new V3(-1.5, -0.3, -1.5);
    steam.maxEmitBox = new V3(1.5, 0.2, 1.5);
    // 【対策】加算合成にすると湯気が発光して見える。湯気は光っていない。
    steam.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    steam.color1 = new BABYLON.Color4(1, 1, 1, 0.055);
    steam.color2 = new BABYLON.Color4(0.95, 0.95, 0.95, 0.028);
    steam.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    steam.minSize = 0.6; steam.maxSize = 2.1;
    steam.minLifeTime = 1.8; steam.maxLifeTime = 3.4;
    steam.emitRate = 90;
    steam.gravity = new V3(0, 1.1, 0);
    steam.direction1 = new V3(-0.35, 1.4, -0.35);
    steam.direction2 = new V3(0.35, 2.4, 0.35);
    steam.minAngularSpeed = -0.5; steam.maxAngularSpeed = 0.5;
    steam.minEmitPower = 0.4; steam.maxEmitPower = 1.0;
    steam.updateSpeed = 0.012;

    // =================================================================
    //  組み立て / 差し替え
    // =================================================================
    let state = null;              // { cfg, assets, bowlMat, bowl, body, grains }
    const riceCache = {};          // 状態 → GrainAssets
    const bowlMatCache = {};       // 器 → PBRMaterial
    let ssao = null;
    let onRebuilt = null;

    function disposeScene(st) {
        if (!st) return;
        const srcs = new Set(st.grains.variants);
        for (const n of st.grains.nodes) if (!srcs.has(n)) n.dispose();
        for (const m of st.grains.variants) m.dispose();
        st.body.dispose();
        st.bowl.dispose();
    }

    function build(stateKey, bowlKey, seed) {
        if (state) { disposeScene(state); state = null; }

        const cfg = buildConfig(stateKey, bowlKey, seed);

        let assets = riceCache[stateKey];
        if (!assets) {
            assets = new GrainAssets(scene, buildConfig(stateKey, bowlKey, 20260101));
            assets.mat = assets.makeMaterial("riceMat_" + stateKey, 1);
            // 【対策】下地に粒と同じマテリアルを貼ると、クリアコート（水の膜）が
            //         なめらかな面の上でそのまま鏡面になり、白い水がたまって
            //         見える。下地は「谷の底の影」なので、艶も透光も要らない。
            const bm = new BABYLON.PBRMaterial("riceBodyMat_" + stateKey, scene);
            bm.albedoColor = col3(PRESETS[stateKey].albedo);
            bm.metallic = 0.0;
            bm.roughness = 0.85;
            bm.clearCoat.isEnabled = false;
            bm.subSurface.isTranslucencyEnabled = false;
            assets.bodyMat = bm;
            assets.mats.push(bm);   // dispose のために登録（スライダーは効かない）
            riceCache[stateKey] = assets;
        }
        let bmat = bowlMatCache[bowlKey];
        if (!bmat) {
            bmat = bowlMaterial(scene, cfg, "bowlMat_" + bowlKey);
            bowlMatCache[bowlKey] = bmat;
        }

        const rng = new Rng((seed ^ 0x2F17) >>> 0);
        const bowl = buildBowl(scene, cfg, bmat, new Rng((seed ^ 0x9E11) >>> 0));
        const body = buildRiceBody(scene, cfg, assets.bodyMat);
        const grains = buildGrains(scene, cfg, assets.mat, rng);

        state = { cfg, assets, bowlMat: bmat, bowl, body, grains };

        // 【対策】1400粒をシャドウマップにも描くと頂点数が倍になる。
        //         粒どうしの落ち影は擬似AOとSSAOで足りているので、
        //         キャスターは器と盛りの下地だけにする。
        const smap = sg.getShadowMap();
        if (smap && smap.renderList) smap.renderList.length = 0;
        sg.addShadowCaster(bowl, true);
        sg.addShadowCaster(body, true);

        steam.emitter = new V3(0, cfg.riceEdgeY + cfg.moundPeak + 0.2, 0);
        applyLive();
        if (onRebuilt) onRebuilt(state);

        // 暗がりが効いているかは数値で確認できる。平均が0.9を超えていたら
        // aoDepth が粒の沈み込みより広すぎて、ほぼ効いていない
        let aMin = 1, aSum = 0;
        for (const p of grains.pts) { aSum += p.ao; if (p.ao < aMin) aMin = p.ao; }
        console.log("[Rice]", cfg.label, "/", cfg.bowl.label,
            "/ AO min/mean =", aMin.toFixed(3), (aSum / grains.pts.length).toFixed(3),
            "/ grains =", cfg.grainCount,
            "/ tris =", cfg.grainCount * grains.variants[0].info.tris + body.tris + bowl.tris,
            "/ seed =", cfg.seed);
        return state;
    }

    // ---- GUIから触る値 ------------------------------------------------
    const live = {
        translucency: PRESETS[START_STATE].translucency,
        coat: 1.0, bump: 1.0, ao: GLOBAL.aoStrength
    };
    let lastStateKey = null;

    function applyLive() {
        if (!state) return;
        for (const mat of state.assets.mats) {
            mat.subSurface.translucencyIntensity = clamp(live.translucency, 0, 0.95);
            mat.clearCoat.intensity = live.coat;
            if (mat.bumpTexture) mat.bumpTexture.level = live.bump;
        }
        const pts = state.grains.pts, nodes = state.grains.nodes;
        for (let i = 0; i < nodes.length; i++) {
            nodes[i].instancedBuffers.color = aoColor(pts[i].ao, live.ao);
        }
    }

    let currentState = START_STATE, currentBowl = START_BOWL, currentSeed = START_SEED;
    build(currentState, currentBowl, currentSeed);
    lastStateKey = currentState;

    if (GLOBAL.useSSAO) {
        // 擬似AOは粒どうしの関係、SSAOは器と盛りの境目のような大きい陰り担当
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        // 【対策】半径を粒の幅（約0.3cm）に近づけると、粒という粒の輪郭に
        //         黒い縁がついて全体が汚れる。粒どうしの陰りは擬似AOの担当。
        //         SSAOは器と盛りの境目のような、大きい陰りだけを拾わせる。
        ssao.radius = 1.30;
        ssao.totalStrength = 0.55;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 160;
        ssao.minZAspect = 0.25;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.90;
    dp.bloomWeight = 0.14;
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
        // ピントは常にカメラの注視点（＝茶碗の中心）に置く
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
        idle: "#2c2a26", active: "#7a6034", edge: "#4b473f",
        text: "#f2ece0", sub: "#a9a293", accent: "#e6d4ab"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "248px";
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
    panel.width = "216px";
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
        b.height = "32px"; b.paddingBottom = "5px";
        b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 14;
        b.onPointerUpObservable.add(onClick);
        panel.addControl(b);
        return b;
    }
    function addSlider(labelText, min, max, value, onChange) {
        const lb = addLabel(labelText + "  " + value.toFixed(2), 13, COL.accent, "22px");
        const s = new BABYLON.GUI.Slider(labelText);
        s.minimum = min; s.maximum = max; s.value = value;
        s.height = "18px"; s.width = "208px"; s.paddingBottom = "8px";
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

    addLabel("BOWL OF RICE / ごはん", 11, COL.sub, "18px");

    const stateBtns = {}, bowlBtns = {};
    function highlight() {
        for (const k in stateBtns) stateBtns[k].background = (k === currentState) ? COL.active : COL.idle;
        for (const k in bowlBtns) bowlBtns[k].background = (k === currentBowl) ? COL.active : COL.idle;
    }
    function rebuild() {
        const changed = (currentState !== lastStateKey);
        // 状態が変わったときだけスライダーを既定へ戻す（同じ状態の盛り直しでは保つ）
        if (currentState !== lastStateKey) {
            live.translucency = PRESETS[currentState].translucency;
            live.coat = 1.0; live.bump = 1.0; live.ao = GLOBAL.aoStrength;
            lastStateKey = currentState;
        }
        build(currentState, currentBowl, currentSeed);
        highlight();
        // 【対策】湯気は状態に属する性質（冷や飯は湯気が立たない）。
        //         ただし状態が変わったときだけ追従させる。同じ状態で
        //         よそい直すたびに戻すと、手で切った設定が消えてしまう。
        if (changed) setSteam(PRESETS[currentState].steam);
    }

    addLabel("ごはん", 13, COL.accent, "22px");
    for (const k of Object.keys(PRESETS)) {
        stateBtns[k] = addButton("s_" + k, PRESETS[k].label, () => { currentState = k; rebuild(); });
    }
    addLabel("器", 13, COL.accent, "22px");
    for (const k of Object.keys(BOWLS)) {
        bowlBtns[k] = addButton("b_" + k, BOWLS[k].label, () => { currentBowl = k; rebuild(); });
    }
    highlight();

    addSpacer();
    addButton("reseed", "よそい直す", () => {
        currentSeed = (currentSeed * 1664525 + 1013904223) >>> 0;
        rebuild();
    });
    const steamBtn = addButton("steam", "湯気: ON", () => setSteam(!steam.isStarted()));
    function setSteam(on) {
        if (on) steam.start(); else steam.stop();
        steamBtn.textBlock.text = "湯気: " + (on ? "ON" : "OFF");
        steamBtn.background = on ? COL.active : COL.idle;
    }
    setSteam(PRESETS[START_STATE].steam);

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
    // ここが本題のスライダー。0にすると擬似AO無しの状態が見られる
    const sAO = addSlider("粒間の暗がり", 0, 1.6, live.ao, (v) => { live.ao = v; applyLive(); });
    const sT = addSlider("透光", 0, 1.0, live.translucency, (v) => { live.translucency = v; applyLive(); });
    const sC = addSlider("水膜の強さ ×", 0, 2.0, live.coat, (v) => { live.coat = v; applyLive(); });
    const sB = addSlider("肌理の強さ ×", 0, 2.0, live.bump, (v) => { live.bump = v; applyLive(); });

    addSpacer();
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        GLOBAL.useDOF = !GLOBAL.useDOF;
        dp.depthOfFieldEnabled = GLOBAL.useDOF;
        dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
        dofBtn.textBlock.text = "被写界深度: " + (GLOBAL.useDOF ? "ON" : "OFF");
    });
    dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
    // ぼけ量 = 焦点距離 / ピント距離。大きいほど背景と手前が溶ける
    addSlider("ぼけ量", 0.01, 0.16, GLOBAL.dofRatio, (v) => { GLOBAL.dofRatio = v; });
    addSlider("F値", 1.2, 11.0, GLOBAL.dofFStop, (v) => { dp.depthOfField.fStop = v; });

    const info = addLabel("", 12, COL.sub, "56px");
    onRebuilt = (st) => {
        sAO.slider.value = live.ao;
        sT.slider.value = live.translucency;
        sC.slider.value = live.coat;
        sB.slider.value = live.bump;
        const c = st.cfg;
        info.text = c.grainCount + " 粒 / "
            + (c.grainCount * st.grains.variants[0].info.tris + st.body.tris + st.bowl.tris).toLocaleString() + " tri\n"
            + "粒: " + c.lengthMM.toFixed(2) + "×" + c.widthMM.toFixed(2) + "×" + c.heightMM.toFixed(2) + "mm\n"
            + "seed: " + c.seed;
    };
    onRebuilt(state);

    scene.onDisposeObservable.add(() => {
        for (const k in riceCache) riceCache[k].dispose();
        for (const k in bowlMatCache) {
            const m = bowlMatCache[k];
            if (m.texs) for (const t of m.texs) t.dispose();
            m.dispose(true, false);
        }
        steamTex.dispose();
        woodTex.dispose();
    });

    return scene;
};

export default createScene;