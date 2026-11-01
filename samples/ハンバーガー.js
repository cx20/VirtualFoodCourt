// =====================================================================
//  Photoreal Hamburger  /  写実的なハンバーガー      BUILD: burger-B / procedural studio
//  Babylon.js Playground 用（元ファイルと同じ createScene のまま差し替え可）
//
//  構成:
//    0. CONFIG      … 寸法・積み順・物理
//    1. Rng         … シード付き擬似乱数
//    2. Noise       … 2D周期ノイズ（テクスチャ）/ 3D値ノイズ（形状）
//    3. TexLab      … アルベド / ORM / 法線 を1パスで焼く
//    4. Skins       … バンズ表皮・クラム・パティ・チーズ・レタス・トマト・板
//    5. Mesh utils  … 回転体（マテリアル分割つき）/ ドレープ面 / 葉
//    6. Pieces      … 具材ごとの形状
//    7. Scene       … IBL / 影 / ACES
//    8. Assembly    … 当たり判定は代理形状。見た目は子として吊る
//
//  実物の要点（ここを外すと「色の付いた円柱の塔」になる）:
//    ・バンズは円柱ではない。上バンズは焼成で横へ張り出したドームで、
//      いちばん太いのは中央ではなく下から1/4の「腰」。底は切り口で平ら
//    ・切り口（クラム）と表皮は別物。クラムは気泡だらけで光を吸い、
//      粗さは 0.9 近い。表皮は卵液で 0.4 前後まで落ちて照る。
//      同じマテリアルで済ませると、焼く前のパン生地に見える
//    ・ゴマはテクスチャに描いてはいけない。実体として乗せる。
//      平らな楕円の絵は、カメラを回した瞬間にシールだと分かる
//    ・パティは円盤ではない。焼くと縮んで中央が持ち上がり、縁は不規則に
//      ちぎれる。焼き網の跡は「色」ではなく「押し当てて凹んだ溝」で、
//      溝の底だけが黒く、周りは一段明るいあめ色になる
//    ・チーズは板ではない。パティの熱で角から垂れる。垂れは角ほど長く、
//      縁は丸まり、生地の肌理は溶けて消えるので粗さが一段下がる
//    ・レタスは円盤ではない。縁のフリル（高周波）と葉全体の折れ（低周波）は
//      別の帯域。そして薄いので光を通す。透過を切ると緑のプラ板になる
//    ・トマトは「表面」ではなく「包丁で切った断面」。放射状の隔壁、
//      ゼリー質の子室、種、皮の直下の白い層まで入れて初めて断面に見える。
//      断面は濡れているので、果肉より子室のほうが必ず滑らか
//    ・層の間の暗がりが写実の8割。落とすときに層どうしがわずかに食い込み、
//      接触の線に影が入るように積む
//
//  積む順（元サンプルから変更）:
//    下バンズ → レタス → トマト → パティ → チーズ → 上バンズ。
//    レタスを下に敷くのは、水分がバンズへ移るのを止める実務上の理由がある。
//    チーズはパティの直後でなければ溶けないので、この2つの順は動かせない
//
//  実装上の要点:
//    ・テクスチャは起動時に手続き生成する（合計 200 万画素ほど）。
//      最初の1〜3秒はここで止まる。CFG.tex* を下げれば軽くなる
//    ・当たり判定は表示メッシュから作らない。垂れたチーズやフリルの分だけ
//      バウンディングが伸び、具材が浮いて積み上がる。単純な代理形状に
//      物理を付け、表示メッシュはその子として吊るす
//    ・法線マップの V の符号は (yd - yu)。Babylon の接空間は V が下向き
//    ・回転体の巻き順は決め打ちしない。法線を計算してから中心との向きで
//      判定し、内向きなら全反転する
//    ・回転体の継ぎ目（角度 0 と 2π）は頂点が重複する。法線を平均しないと
//      縦一文字のハイライトが出る
// =====================================================================

var createScene = function () {

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;

    // =================================================================
    // 0. CONFIG
    // =================================================================
    const CFG = {
        seed: 20260809,

        // --- 寸法（バンズ直径 3.0 を基準にした相対単位）
        bunRadius: 1.50,
        bottomBunHeight: 0.60,     // 切り口までの高さ
        topBunHeight: 1.06,        // 切り口からドーム頂点まで
        pattyRadius: 1.40,
        pattyHeight: 0.46,
        tomatoRadius: 1.35,
        tomatoHeight: 0.20,
        cheeseHalf: 1.45,
        lettuceRadius: 1.82,

        // --- ゴマ
        sesameCount: 62,

        // --- テクスチャ
        texBun: 512,
        texCrumb: 640,      // 1mm の気泡を解像するにはこれくらい要る
        texPatty: 512,
        texCheese: 384,
        texLettuce: 448,
        texTomato: 576,
        texWood: 512,

        // --- 分割
        latheSeg: 96,
        cheeseGrid: 56,
        leafRings: 30,
        leafSeg: 224,

        // --- 物理
        usePhysics: false,
        gravity: 9.8,
        physicsHz: 120,
        dropInterval: 0.62,        // 秒
        dropClearance: 0.85,       // 直前の層の天面からどれだけ上で放すか
        friction: 1.0,
        restitution: 0.0,          // 食材は跳ねない
        linearDamping: 0.55,
        angularDamping: 0.92,      // 平らな面どうしの揺り戻しを殺す
        settleSpeed: 0.10,
        settleHold: 0.35,
        settleTimeout: 3.2,

        // --- 描画
        useSSAO: true,
        exposure: 1.0,
        contrast: 1.08
    };

    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const mix = (a, b, t) => a + (b - a) * t;
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mixC = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

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
        _h2(x, y, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
            return (h >>> 0) / 4294967295;
        },
        // 【対策】x 方向しか折り返さないノイズでテクスチャを焼くと、上下の
        //         継ぎ目に横一文字の線が出る。両軸とも折り返す
        v2(x, y, px, py, seed) {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            const wr = (i, p) => { let m = i % p; if (m < 0) m += p; return m; };
            const x0 = wr(xi, px), x1 = wr(xi + 1, px), y0 = wr(yi, py), y1 = wr(yi + 1, py);
            const a = this._h2(x0, y0, seed), b = this._h2(x1, y0, seed);
            const c = this._h2(x0, y1, seed), d = this._h2(x1, y1, seed);
            const t0 = a + (b - a) * u, t1 = c + (d - c) * u;
            return t0 + (t1 - t0) * v;
        },
        fbm2(x, y, period, seed, oct) {
            let s = 0, a = 0.5, f = 1, n = 0;
            for (let o = 0; o < oct; o++) {
                s += a * this.v2(x * f, y * f, (period * f) | 0, (period * f) | 0, seed + o * 131);
                n += a; f *= 2; a *= 0.5;
            }
            return s / n;
        },
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
        }
    };

    // 気泡を切った断面。ジッター格子に「球冠」を置く
    // 【対策】パンのすを fbm の閾値で作ると、穴の底も外も平らな二段プラトーに
    //         なり、法線マップは輪郭線だけ、アルベドは白地に濃い斑点＝
    //         テラゾー（人造大理石）になる。実物のすは球状の気泡をナイフで
    //         切った断面で、ふちが急に立ち上がる椀。切る深さも気泡ごとに違う
    // 【対策】大きさの桁が違う穴を、それぞれ「疎らに」置くのが肝。
    //         確率を上げた瞬間に模様になる
    // u, v は 0..1。cells で折り返すのでテクスチャはタイリングできる
    function caps(u, v, cells, rMin, rMax, prob, seed) {
        const x = u * cells, z = v * cells;
        const gx = Math.floor(x), gz = Math.floor(z);
        let m = 0;
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                const cx = gx + dx, cz = gz + dz;
                let wx = cx % cells; if (wx < 0) wx += cells;
                let wz = cz % cells; if (wz < 0) wz += cells;
                if (Noise._h2(wx, wz, seed) > prob) continue;
                const jx = cx + 0.12 + 0.76 * Noise._h2(wx, wz, seed + 13);
                const jz = cz + 0.12 + 0.76 * Noise._h2(wx, wz, seed + 29);
                const r = mix(rMin, rMax, Noise._h2(wx, wz, seed + 41));
                const ex = x - jx, ez = z - jz;
                const d2 = ex * ex + ez * ez, r2 = r * r;
                if (d2 >= r2) continue;
                const cut = 0.30 + 0.70 * Noise._h2(wx, wz, seed + 61);   // 掠めた気泡〜真っ二つ
                const val = Math.sqrt(1 - d2 / r2) * cut;
                if (val > m) m = val;
            }
        }
        return m;
    }

    // =================================================================
    //  Scene（テクスチャ生成が scene を要求するので先に作る）
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    // 【対策】明るい背景に白いバンズを置くと輪郭が飛ぶ。少し沈んだ暖色の
    //         背景にすると、焼き色の階調がそのまま立ち上がる
    scene.clearColor = new BABYLON.Color4(0.135, 0.122, 0.112, 1.0);

    let physicsReady = false;
    if (CFG.usePhysics) {
        try {
            // 【対策】HavokPlugin の第1引数は _useDeltaForWorldStep。true だと
            //         フレーム落ちのたびにステップ幅が変わり、積んだ層が震える
            const hk = new BABYLON.HavokPlugin(false);
            scene.enablePhysics(new V3(0, -CFG.gravity, 0), hk);
            if (hk.setTimeStep) hk.setTimeStep(1 / CFG.physicsHz);
            physicsReady = true;
        } catch (err) {
            console.warn("[Burger] Havok を初期化できませんでした。静的に積みます。", err);
        }
    }

    // =================================================================
    // 3. TexLab
    // =================================================================
    const TexLab = {
        _raw(name, size, data, gamma) {
            const t = new BABYLON.RawTexture(
                data, size, size, BABYLON.Engine.TEXTUREFORMAT_RGBA, scene,
                true, false, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
            t.name = name;
            t.gammaSpace = gamma;              // ORM と法線はリニアで読ませる
            t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
            t.anisotropicFilteringLevel = 16;
            return t;
        },

        // fill(u, v, OUT) → OUT[0..2]=albedo(sRGB) / [3]=AO / [4]=roughness / [5]=height
        // 【対策】3枚を別々に回すとノイズを3回引き直すことになる。1パスで焼く
        maps(name, size, fill, normalStrength) {
            const alb = new Uint8Array(size * size * 4);
            const orm = new Uint8Array(size * size * 4);
            const H = new Float32Array(size * size);
            const OUT = [0, 0, 0, 1, 0.5, 0.5];
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const i = y * size + x;
                    OUT[0] = OUT[1] = OUT[2] = 0; OUT[3] = 1; OUT[4] = 0.5; OUT[5] = 0.5;
                    fill(x / size, y / size, OUT);
                    const o = i * 4;
                    alb[o] = clamp(OUT[0], 0, 1) * 255;
                    alb[o + 1] = clamp(OUT[1], 0, 1) * 255;
                    alb[o + 2] = clamp(OUT[2], 0, 1) * 255;
                    alb[o + 3] = 255;
                    orm[o] = clamp(OUT[3], 0, 1) * 255;       // R: AO
                    orm[o + 1] = clamp(OUT[4], 0, 1) * 255;   // G: roughness
                    orm[o + 2] = 0;                           // B: metallic
                    orm[o + 3] = 255;
                    H[i] = OUT[5];
                }
            }
            return {
                albedo: this._raw(name + "_alb", size, alb, true),
                orm: this._raw(name + "_orm", size, orm, false),
                normal: this.normal(name + "_nrm", size, H, normalStrength)
            };
        },

        normal(name, size, H, strength) {
            const d = new Uint8Array(size * size * 4);
            const at = (x, y) => H[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
                    // 【対策】Babylon の接空間は V が下向き。ここを (yu - yd) にすると
                    //         凸と凹が入れ替わり、光の来る側だけが凹んで見える
                    const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
                    const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
                    const o = (y * size + x) * 4;
                    d[o] = (dx * inv * 0.5 + 0.5) * 255;
                    d[o + 1] = (dy * inv * 0.5 + 0.5) * 255;
                    d[o + 2] = (inv * 0.5 + 0.5) * 255;
                    d[o + 3] = 255;
                }
            }
            return this._raw(name, size, d, false);
        }
    };

    // PBR マテリアルの組み立て（ORM の割り当ては毎回同じなのでまとめる）
    function pbr(name, M, opt) {
        const m = new BABYLON.PBRMaterial(name, scene);
        m.albedoTexture = M.albedo;
        m.metallicTexture = M.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureAlpha = false;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.metallic = 0.0;
        m.roughness = 1.0;                         // 実値は ORM の G
        m.bumpTexture = M.normal;
        m.bumpTexture.level = (opt && opt.bump !== undefined) ? opt.bump : 1.0;
        m.specularIntensity = (opt && opt.spec !== undefined) ? opt.spec : 1.0;
        if (opt && opt.clearCoat) {
            m.clearCoat.isEnabled = true;
            m.clearCoat.intensity = opt.clearCoat;
            m.clearCoat.roughness = (opt.clearCoatRough !== undefined) ? opt.clearCoatRough : 0.14;
            if (opt.clearCoatIOR) m.clearCoat.indexOfRefraction = opt.clearCoatIOR;
        }
        if (opt && opt.translucency) {
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.translucencyIntensity = opt.translucency;
            if (opt.tint) m.subSurface.tintColor = new BABYLON.Color3(opt.tint[0], opt.tint[1], opt.tint[2]);
        }
        if (opt && opt.twoSided) { m.backFaceCulling = false; m.twoSidedLighting = true; }
        return m;
    }

    // =================================================================
    // 4. Skins
    // =================================================================
    const SEED = CFG.seed;

    // ---- バンズの表皮 -------------------------------------------------
    // 焼き色は一様ではない。生地の起伏（低周波）に完全に相関して、
    // 出っ張りが濃く、谷が淡く残る。無相関のノイズを掛けると柄の布になる
    const bunSkin = TexLab.maps("bunCrust", CFG.texBun, (u,v,O)=>{
        const big=Noise.fbm2(u*5,v*5,5,SEED,3);
        const mid=Noise.fbm2(u*22,v*22,22,SEED+3,3);
        const fine=Noise.fbm2(u*115,v*115,115,SEED+9,2);
        const toast=smooth(.22,.82,big*.7+mid*.3);
        let c=mixC([.84,.48,.18],[.63,.285,.075],toast*.65);
        const blister=smooth(.75,.91,mid+(fine-.5)*.16);
        c=mixC(c,[.45,.20,.05],blister*.12);
        O[0]=c[0];O[1]=c[1];O[2]=c[2];O[3]=.96;
        O[4]=.36+.13*mid;O[5]=big*.18+mid*.22+fine*.30;
    },1.6);

    // ---- 切り口（クラム）---------------------------------------------
    //  写真のバンズの切り口から:
    //    ・地は白ではなく生成り（アイボリー）。純白に寄せると紙になる
    //    ・すの中と地の色差は驚くほど小さい。アルベドで濃く描くと、
    //      白地に黒い粒＝カビかテラゾーになる
    //    ・AO も実測ではほぼ真っ白。陰影は法線マップと SSAO が作る
    //    ・大きさの桁が違う穴（5mm / 2mm / 0.5mm）が、それぞれ疎らに開く
    const crumbSkin = (() => {
        const S = CFG.texCrumb;
        // テクスチャが覆う実寸（バンズ直径 3.0 単位 ≈ 10cm として）。
        // 気泡の寸法を cm で書けるように、UV へ換算する係数を持っておく
        const SPAN_CM = 10.6;
        const cm = (v) => v / SPAN_CM;              // cm → UV
        // [セル数, 半径min, 半径max, 確率, 深さ] （長さは cm）
        const PITS = [
            [8, 0.100, 0.220, 0.20, 0.150],
            [18, 0.055, 0.130, 0.34, 0.100],
            [53, 0.026, 0.058, 0.82, 0.038]
        ];
        return TexLab.maps("bunCrumb", S, (u, v, O) => {
            let pit = 0, pore = 0;
            for (let k = 0; k < PITS.length; k++) {
                const q = PITS[k];
                // 半径はセル単位（UV → セル数倍）で渡す
                const val = caps(u, v, q[0], cm(q[1]) * q[0], cm(q[2]) * q[0], q[3], SEED + 201 + k * 37);
                pit += val * cm(q[4]);
                if (val > pore) pore = val;
            }
            // 下地はなだらかでよい。実測の法線マップも意外なほど平坦だった
            const undul = Noise.fbm2(u * 24, v * 24, 24, SEED + 43, 2);
            const fine = Noise.fbm2(u * 96, v * 96, 96, SEED + 79, 1);
            const fuzz = Noise.fbm2(u * 150, v * 150, 150, SEED + 47, 1);
            const shade = Noise.fbm2(u * 44, v * 44, 44, SEED + 131, 2);

            // ---- アルベド。ほぼ一色。差は数%しか付けない
            const CRUMB = [0.948, 0.910, 0.812];
            const CRUMB2 = [0.905, 0.862, 0.752];
            const CPORE = [0.868, 0.820, 0.706];
            let c = mixC(CRUMB, CRUMB2, smooth(0.38, 0.72, shade));
            c = mixC(c, CPORE, smooth(0.10, 0.70, pore) * 0.40);

            // ---- 高さ（UV と同じ尺度。法線は size/2 で正しい勾配になる）
            let h = (undul - 0.5) * cm(0.070);
            h -= pit;
            h += ((fine - 0.5) * cm(0.040) + (fuzz - 0.5) * cm(0.024));

            O[0] = c[0]; O[1] = c[1]; O[2] = c[2];
            // 【対策】AO を濃く焼き込むと汚れた紙になる。すの陰りは
            //         法線と SSAO に任せ、ここは 2 割程度に留める
            O[3] = 1 - 0.22 * smooth(0.06, 0.80, pore);
            let rough = 0.90 + 0.10 * smooth(0.15, 0.80, pore) + 0.10 * (shade - 0.5);
            O[4] = clamp(rough, 0.05, 1);
            O[5] = h;
        }, CFG.texCrumb * 0.5);          // テクセルの実寸で微分する
    })();

    // ---- パティ（焼き面）---------------------------------------------
    // 焼き網の跡は色ではなく溝。溝の底だけ黒く、その両脇は逆に明るい
    const pattyFace = TexLab.maps("pattyFace", CFG.texPatty, (u, v, O) => {
        const grind = Noise.fbm2(u * 13, v * 13, 13, SEED + 41, 3);
        const fine = Noise.fbm2(u * 46, v * 46, 46, SEED + 47, 2);
        const fat = smooth(0.74, 0.88, Noise.fbm2(u * 26, v * 26, 26, SEED + 53, 2));
        const char = smooth(0.56, 0.86, Noise.fbm2(u * 8, v * 8, 8, SEED + 59, 3));

        const base = [0.375, 0.190, 0.090];
        const light = [0.605, 0.345, 0.165];
        let c = mixC(base, light, smooth(0.35, 0.75, grind));
        c = mixC(c, [0.700, 0.560, 0.400], fat * 0.55);          // 脂の粒
        c = mixC(c, [0.120, 0.058, 0.028], char * 0.55);

        // 焼き網の跡（2方向）。位相をノイズで崩さないと定規で引いた線になる
        const wob = (Noise.fbm2(u * 5, v * 5, 5, SEED + 61, 2) - 0.5) * 0.30;
        const b1 = 0.5 + 0.5 * Math.sin(TAU * (3 * u + 2 * v + wob));
        const b2 = 0.5 + 0.5 * Math.sin(TAU * (2 * u - 3 * v - wob));
        const bar = Math.max(smooth(0.80, 0.985, b1), smooth(0.80, 0.985, b2));
        c = mixC(c, [0.090, 0.048, 0.026], bar * 0.76);

        let h = grind * 0.55 + fine * 0.25 + fat * 0.20;
        h -= bar * 0.55;                                          // 押し当てて凹む
        O[0] = c[0]; O[1] = c[1]; O[2] = c[2];
        O[3] = (1 - bar * 0.45) * (0.62 + 0.38 * smooth(0.20, 0.70, h));
        // 照りは脂。全面均一ではなく、くぼみに溜まった所だけ滑らかになる
        O[4] = clamp(mix(0.72, 0.40, fat) + bar * 0.10 - smooth(0.55, 0.15, h) * 0.14, 0.10, 0.95);
        O[5] = clamp(h, 0, 1);
    }, 2.4);

    // ---- パティ（側面）-----------------------------------------------
    const pattySide = TexLab.maps("pattySide", CFG.texPatty >> 1, (u, v, O) => {
        const grind = Noise.fbm2(u * 10, v * 10, 10, SEED + 71, 3);
        const fine = Noise.fbm2(u * 38, v * 38, 38, SEED + 73, 2);
        const fat = smooth(0.70, 0.88, Noise.fbm2(u * 22, v * 22, 22, SEED + 79, 2));
        let c = mixC([0.400, 0.205, 0.098], [0.650, 0.385, 0.185], smooth(0.32, 0.78, grind));
        c = mixC(c, [0.735, 0.590, 0.430], fat * 0.60);
        // 挽き肉の切れ端が飛び出した所は焦げている
        c = mixC(c, [0.135, 0.068, 0.034], smooth(0.74, 0.95, fine) * 0.38);
        const h = grind * 0.5 + fine * 0.5;
        O[0] = c[0]; O[1] = c[1]; O[2] = c[2];
        O[3] = 0.58 + 0.42 * smooth(0.20, 0.75, h);
        O[4] = mix(0.78, 0.48, fat);
        O[5] = h;
    }, 3.0);

    // ---- チーズ -------------------------------------------------------
    const cheeseSkin = TexLab.maps("cheese", CFG.texCheese, (u, v, O) => {
        const mot = Noise.fbm2(u * 7, v * 7, 7, SEED + 83, 3);
        const fine = Noise.fbm2(u * 34, v * 34, 34, SEED + 89, 2);
        let c = mixC([0.960, 0.720, 0.330], [0.855, 0.505, 0.175], smooth(0.30, 0.78, mot));
        // 溶けて浮いた小さな気泡。縁が一段濃くなる
        const bub = smooth(0.80, 0.93, fine);
        c = mixC(c, [0.700, 0.380, 0.120], bub * 0.35);
        const h = mot * 0.7 + fine * 0.3;
        O[0] = c[0]; O[1] = c[1]; O[2] = c[2];
        O[3] = 0.78 + 0.22 * smooth(0.25, 0.75, h);
        // 溶けたチーズは濡れている。ここを 0.6 にすると粘土になる
        O[4] = 0.20 + 0.14 * mot;
        O[5] = h;
    }, 0.9);

    // ---- レタス -------------------------------------------------------
    // UV は u=角度 / v=中心からの距離。葉脈は中心へ収束させる
    const lettuceSkin = TexLab.maps("lettuce", CFG.texLettuce, (u, v, O) => {
        const n = Noise.fbm2(u * 9, v * 9, 9, SEED + 97, 3);
        // 芯に近いほど淡く、縁ほど濃い。これが逆だと造花になる
        const t = smooth(0.10, 0.92, v * 0.85 + n * 0.22);
        let c = mixC([0.540, 0.690, 0.220], [0.130, 0.360, 0.035], t);

        // 放射状の葉脈。太い主脈と細い側脈
        const jit = (Noise.fbm2(u * 14, v * 4, 14, SEED + 101, 2) - 0.5) * 0.55;
        const vein = Math.pow(Math.abs(Math.sin(TAU * (u * 11 + jit * 0.1))), 14);
        const vein2 = Math.pow(Math.abs(Math.sin(TAU * (u * 27 - jit * 0.1))), 22);
        const vv = clamp(vein * (1 - v * 0.25) + vein2 * 0.5 * smooth(0.15, 0.8, v), 0, 1);
        c = mixC(c, [0.830, 0.900, 0.680], vv * 0.22);

        // 葉肉のキルティング（葉脈の間が膨らむ）
        const quilt = Noise.fbm2(u * 30, v * 12, 30, SEED + 103, 2);
        const h = 0.5 + vv * 0.42 + (quilt - 0.5) * 0.30;
        O[0] = c[0]; O[1] = c[1]; O[2] = c[2];
        O[3] = 0.80 + 0.20 * h;
        O[4] = mix(0.44, 0.28, vv);      // 洗ったレタスは少し濡れて光る
        O[5] = clamp(h, 0, 1);
    }, 1.5);

    // ---- トマトの断面 --------------------------------------------------
    //  実物の断面（参考写真）から:
    //    ・切り口は皮より明るい。ピンク寄りの赤で、皮だけが濃い
    //    ・白い隔壁は子室の中で終わらず、果肉の厚みの中ほどまで伸びる。
    //      しかも「一定の太さの線」であって、中心から広がる扇ではない
    //    ・種は子室の中で壁に沿って2列に並ぶ。粒は小さく、淡い黄緑
    //    ・皮のすぐ内側に、皮より濃い細い線が1本入る
    const tomatoFlesh = (() => {
        const rng = new Rng(SEED + 211);
        const LOC = 6;                                   // 子室の数
        const seeds = [];
        for (let l = 0; l < LOC; l++) {
            const a0 = (l + 0.5) / LOC * TAU;            // 子室の中心
            for (let side = -1; side <= 1; side += 2) {  // 壁ぎわの2列
                const n = 5;
                for (let k = 0; k < n; k++) {
                    const t = (k + 0.5) / n;
                    const spread = (TAU / LOC) * 0.33;
                    const a = a0 + side * spread * (0.50 + 0.50 * t) + rng.range(-0.03, 0.03);
                    const rr = 0.24 + 0.37 * t + rng.range(-0.02, 0.02);
                    seeds.push({
                        x: Math.cos(a) * rr, y: Math.sin(a) * rr,
                        c: Math.cos(a), s: Math.sin(a), w: 0.020 + rng.range(0, 0.006)
                    });
                }
            }
        }
        const SKIN = [0.700, 0.095, 0.070];
        const RIM = [0.585, 0.080, 0.062];               // 皮のすぐ内側の濃い線
        const PERI_OUT = [0.855, 0.250, 0.190];
        const PERI_IN = [0.900, 0.415, 0.345];
        const JELLY = [0.690, 0.255, 0.100];
        const WALL = [0.930, 0.590, 0.420];

        return TexLab.maps("tomatoFlesh", CFG.texTomato, (u, v, O) => {
            const dx = (u - 0.5) * 2, dy = (v - 0.5) * 2;
            const r = Math.sqrt(dx * dx + dy * dy);
            const a = Math.atan2(dy, dx);
            const n = Noise.fbm2(u * 22, v * 22, 22, SEED + 223, 3);

            // 【対策】隔壁を smooth(cos(a*LOC)) で作ると、中心から外へ広がる
            //         扇になり、風車の絵になる。角度距離に半径を掛けて
            //         「一定の太さの線」にする
            const step = TAU / LOC;
            let ta = a % step; if (ta < 0) ta += step;
            ta = Math.min(ta, step - ta);
            const wallD = r * ta;
            let wall = 1 - smooth(0.028, 0.060 + 0.055 * r, wallD);
            wall *= 1 - smooth(0.56, 0.86, r);            // 果肉の中ほどで消える
            const core = 1 - smooth(0.07, 0.21, r);       // 中心の芯
            const pale = clamp(Math.max(wall, core) + (n - 0.5) * 0.18, 0, 1);

            let c, h, rough, ao = 1;
            if (r > 0.985) {                              // 皮（キャップ外周。ほぼ見えない）
                c = SKIN; h = 0.60; rough = 0.24;
            } else if (r > 0.955) {                       // 皮ぎわの濃い線（細い）
                c = mixC(PERI_OUT, RIM, smooth(0.955, 0.985, r));
                h = 0.58; rough = 0.27;
            } else if (r > 0.74) {                       // 果肉（果皮の厚い部分）
                const t = smooth(0.74, 0.955, r);
                const fiber = 0.5 + 0.5 * Math.sin(a * 110 + n * 7);
                c = mixC(PERI_IN, PERI_OUT, t * 0.82 + fiber * 0.14);
                h = 0.56 + fiber * 0.03; rough = 0.30;
            } else {                                      // 子室（ゼリー）
                c = mixC(JELLY,[.82,.42,.18],n); h = 0.44+(n-.5)*.12; rough = 0.17; ao = 0.94;
            }
            // 隔壁と芯。果肉の上では淡く乗せる
            const k = pale * (r > 0.74 ? 0.60 : 1.0);
            c = mixC(c, WALL, k);
            h = mix(h, 0.60, k * 0.8);
            rough = mix(rough, 0.36, k * 0.8);
            ao = mix(ao, 1.0, k);

            // 種。楕円で、周りにゼリーの縁が付く
            if (r < 0.73) {
                for (let i = 0; i < seeds.length; i++) {
                    const sd = seeds[i];
                    const ex = dx - sd.x, ey = dy - sd.y;
                    if (ex < -0.055 || ex > 0.055 || ey < -0.055 || ey > 0.055) continue;
                    const px = sd.c * ex + sd.s * ey, py = -sd.s * ex + sd.c * ey;
                    const qx = px / (sd.w * 1.5), qy = py / sd.w;
                    const q = qx * qx + qy * qy;
                    if (q < 2.6) {
                        const halo = 1 - smooth(1.0, 2.6, q);
                        c = mixC(c, [0.910, 0.800, 0.520], halo * 0.30);
                        ao *= 1 - halo * 0.10;
                    }
                    if (q < 1) {
                        const edge = smooth(0.50, 1.0, q);
                        c = mixC([0.905, 0.860, 0.545], [0.735, 0.650, 0.335], edge);
                        h = 0.70 - edge * 0.08;
                        rough = 0.26;
                    }
                }
            }
            O[0] = c[0]; O[1] = c[1]; O[2] = c[2];
            O[3] = ao; O[4] = rough; O[5] = h;
        }, 1.6);
    })();

    // ---- トマトの皮 ----------------------------------------------------
    const tomatoSkin = TexLab.maps("tomatoSkin", 384, (u, v, O) => {
        const n = Noise.fbm2(u * 9, v * 9, 9, SEED + 227, 3);
        const fine = Noise.fbm2(u * 40, v * 40, 40, SEED + 229, 2);
        // 皮目（白っぽい細点）。これが無いと均一すぎてゴムの輪になる
        const lent = smooth(0.962, 0.994, Noise.fbm2(u * 150, v * 150, 150, SEED + 231, 1));
        let c = mixC([0.760, 0.135, 0.092], [0.890, 0.270, 0.190], smooth(0.34, 0.72, n));
        c = mixC(c, [0.975, 0.860, 0.760], lent * 0.55);
        O[0] = c[0]; O[1] = c[1]; O[2] = c[2];
        O[3] = 0.94 + 0.06 * n;
        // 【対策】完熟した果皮はろう質でよく光る。ここを 0.25 まで上げると
        //         乾いた作り物になる。曇りは皮目の所だけに出す
        O[4] = 0.150 + 0.045 * (1 - n) + lent * 0.28;
        // 【対策】起伏を入れすぎると、艶が細かく割れて梅干しの皮になる。
        //         果皮は張っているので、法線はほぼ平らでよい
        O[5] = 0.5 + (fine - 0.5) * 0.22 + lent * 0.35;
    }, 0.5);

    // ---- ゴマ ----------------------------------------------------------
    const sesameSkin = TexLab.maps("sesame", 128, (u, v, O) => {
        const n = Noise.fbm2(u * 10, v * 10, 10, SEED + 233, 2);
        const c = mixC([0.935, 0.875, 0.735], [0.780, 0.660, 0.470], n);
        O[0] = c[0]; O[1] = c[1]; O[2] = c[2];
        O[3] = 1; O[4] = 0.42 + n * 0.10; O[5] = n;
    }, 0.8);

    // ---- まな板 --------------------------------------------------------
    const woodSkin=TexLab.maps("wood",CFG.texWood,(u,v,O)=>{
        const warp=Noise.fbm2(u*2,v*2,2,SEED+307,3);
        const grain=Noise.fbm2(u*5,v*95+warp*2,95,SEED+311,3);
        const ring=.5+.5*Math.sin((v*110+warp*3)*Math.PI);
        const c=mixC([.24,.145,.085],[.31,.205,.125],grain*.7+ring*.3);
        O[0]=c[0];O[1]=c[1];O[2]=c[2];O[3]=1;O[4]=.78;O[5]=grain*.16;
    },.4);

    // ---- マテリアル ----------------------------------------------------
    const matCrust = pbr("crust", bunSkin, { bump: 0.65, clearCoat: 0.16, clearCoatRough: 0.32 });
    const matCrumb = pbr("crumb", crumbSkin, { bump: 1.0, translucency: 0.25, tint: [1.00, 0.845, 0.585] });
    const matPattyFace = pbr("pattyFace", pattyFace, { bump: 1.15, clearCoat: 0.35, clearCoatRough: 0.26 });
    const matPattySide = pbr("pattySide", pattySide, { bump: 1.25, clearCoat: 0.28, clearCoatRough: 0.30 });
    const matCheese = pbr("cheeseMat", cheeseSkin, {
        bump: 0.18, clearCoat: 0.25, clearCoatRough: 0.12,
        translucency: 0.35, tint: [0.98, 0.72, 0.34], twoSided: true
    });
    const matLettuce = pbr("lettuceMat", lettuceSkin, {
        bump: 0.6, clearCoat: 0.10, clearCoatRough: 0.24,
        translucency: 0.55, tint: [0.48, 0.78, 0.30], twoSided: true
    });
    const matTomatoFlesh = pbr("tomatoFleshMat", tomatoFlesh, {
        bump: 1.0, clearCoat: 0.28, clearCoatRough: 0.16,
        translucency: 0.30, tint: [0.92, 0.46, 0.34]
    });
    // 【対策】法線の強さを上げると、艶が細かく割れて表面がざらつく。
    //         果皮の凹凸はほとんど無いので 0.2 まで落とす
    const matTomatoSkin = pbr("tomatoSkinMat", tomatoSkin, {
        bump: 0.20, clearCoat: 0.72, clearCoatRough: 0.13, clearCoatIOR: 1.46,
        translucency: 0.18, tint: [0.95, 0.20, 0.13]
    });
    const matSesame = pbr("sesameMat", sesameSkin, { bump: 0.6, clearCoat: 0.30, clearCoatRough: 0.22 });
    const matWood = pbr("woodMat", woodSkin, { bump: 1.0, clearCoat: 0.15, clearCoatRough: 0.35 });
    // 板は 11 角。1タイルのままでは年輪が家具の大きさになる
    for (const t of [woodSkin.albedo, woodSkin.orm, woodSkin.normal]) { t.uScale = 2.6; t.vScale = 2.6; }

    // =================================================================
    // 5. Mesh utils
    // =================================================================

    // 回転体。profile は中心軸まわりの断面線
    //   {r, y, mat, v, planar, smooth, w}
    //     mat    … この点から次の点までの帯に使うマテリアル名
    //     v      … 側面 UV の V 座標（planar の帯では未使用）
    //     planar … true なら真上からの平行投影 UV（切り口・天面用）
    //     smooth … 直前の帯との継ぎ目で法線を平均する（false で稜線になる）
    //     w      … 形状ノイズの効き（切り口は 0 に近く、表皮は 1）
    function buildLathe(name, profile, seg, opts) {
        if(name==='topBun'||name==='bottomBun'){
            const dense=[];
            const cat=(a,b,c,d,t)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
            for(let i=0;i<profile.length-1;i++){
                const a=profile[Math.max(0,i-1)],b=profile[i],c=profile[i+1],d=profile[Math.min(profile.length-1,i+2)];
                dense.push(b);
                if(b.mat==='crust'&&c.mat==='crust'&&c.smooth){
                    for(let j=1;j<4;j++){const t=j/4;dense.push({...b,r:Math.max(.001,cat(a.r,b.r,c.r,d.r,t)),y:cat(a.y,b.y,c.y,d.y,t),smooth:true,w:mix(b.w||1,c.w||1,t)});}
                }
            }
            dense.push(profile[profile.length-1]);profile=dense;
        }
        // 【対策】側面 UV の V は帯の「終点」でも使われる。マテリアルが切り替わる
        //         点（planar 側）に v を書き忘れると、その 1 リングだけ UV が
        //         NaN になり、帯全体が真っ黒に落ちる。欠けている分は補間で埋める
        const known = [];
        for (let i = 0; i < profile.length; i++) if (profile[i].v !== undefined) known.push(i);
        if (known.length) {
            for (let i = 0; i < profile.length; i++) {
                if (profile[i].v !== undefined) continue;
                let lo = -1, hi = -1;
                for (const k of known) { if (k < i) lo = k; else if (hi < 0) hi = k; }
                if (lo >= 0 && hi >= 0) {
                    profile[i].v = mix(profile[lo].v, profile[hi].v, (i - lo) / (hi - lo));
                } else if (lo >= 0) {
                    profile[i].v = profile[lo].v + 0.06 * (i - lo);
                } else {
                    profile[i].v = profile[hi].v - 0.06 * (hi - i);
                }
            }
        } else {
            for (let i = 0; i < profile.length; i++) profile[i].v = i / (profile.length - 1);
        }

        // 【対策】ドームに円筒 UV（u = 角度）を貼ると、頂点で全リングが 1 点に
        //         潰れるのに u だけ 0..1 に広がるため、texel が無限に細くなって
        //         極から放射状の縞が出る。極からの弧長を半径に取った極座標
        //         （方位等距離図法）にすれば、頂点でも texel 密度が保たれるうえ、
        //         角度 0/2π の UV が完全に一致するので継ぎ目も消える
        const oIdx = (opts.polarOrigin !== undefined)
            ? ((opts.polarOrigin < 0) ? profile.length + opts.polarOrigin : opts.polarOrigin) : 0;
        const segLen = (i, k) => Math.sqrt((profile[i].r - profile[k].r) ** 2 + (profile[i].y - profile[k].y) ** 2);
        profile[oIdx]._arc = 0;
        for (let i = oIdx + 1; i < profile.length; i++) profile[i]._arc = profile[i - 1]._arc + segLen(i - 1, i);
        for (let i = oIdx - 1; i >= 0; i--) profile[i]._arc = profile[i + 1]._arc + segLen(i, i + 1);
        let maxArc = 0;
        for (let i = 0; i < profile.length - 1; i++) {
            if (!profile[i].polar) continue;
            maxArc = Math.max(maxArc, profile[i]._arc, profile[i + 1]._arc);
        }
        // 展開円の直径が何タイルぶんになるか。テクスチャは周期ノイズなので
        // 1 を超えて巻いても継ぎ目は出ない
        const polarK = maxArc > 0 ? (opts.polarTiles || 1.7) * 0.5 / maxArc : 0;

        const pos = [], uvs = [], cols = [], ind = [];
        const strips = [];
        const rUV = opts.rUV || 1, uTile = opts.uTile || 1;
        const warp = opts.warp || ((x, y, z) => [x, y, z]);
        const aoFn = opts.ao || (() => 1);

        for (let s = 0; s < profile.length - 1; s++) {
            const p0 = profile[s], p1 = profile[s + 1];
            const base = pos.length / 3;
            const iStart = ind.length;
            for (let k = 0; k < 2; k++) {
                const p = k === 0 ? p0 : p1;
                const w = (p.w === undefined) ? 1 : p.w;
                for (let j = 0; j <= seg; j++) {
                    const ang = (j / seg) * TAU;
                    const q = warp(Math.cos(ang) * p.r, p.y, Math.sin(ang) * p.r, w, ang);
                    pos.push(q[0], q[1], q[2]);
                    // 【対策】平面 UV の V をそのまま振ると、上向きの面と
                    //         下向きの面で接空間の手性が逆になり、法線マップの
                    //         V が反転する。同じ気泡が片方ではへこみ、
                    //         もう片方では膨らみとして陰影が付く。
                    //         見えるのは上向きの面なので、そちらに合わせる
                    if (p0.planar) uvs.push(0.5 + q[0] / (2 * rUV), 0.5 - q[2] / (2 * rUV));
                    else if (p0.polar) {
                        const sArc = p._arc * polarK;
                        uvs.push(0.5 + Math.cos(ang) * sArc, 0.5 + Math.sin(ang) * sArc);
                    }
                    else uvs.push((j / seg) * uTile, p.v);
                    const c = aoFn(q[0], q[1], q[2]);
                    cols.push(c, c, c, 1);
                }
            }
            for (let j = 0; j < seg; j++) {
                const a = base + j, b = a + 1, c = base + seg + 1 + j, d = c + 1;
                ind.push(a, c, b, b, c, d);
            }
            strips.push({
                mat: p0.mat, iStart, iCount: ind.length - iStart,
                ringA: base, ringB: base + seg + 1, smooth: !!p0.smooth
            });
        }

        let nrm = new Float32Array(pos.length);
        BABYLON.VertexData.ComputeNormals(pos, ind, nrm);

        // 【対策】巻き順を規約で決め打ちすると、profile の向きを変えた瞬間に
        //         裏返る。法線と「中心 → 頂点」の向きの総和で判定して直す
        let cy = 0;
        for (let i = 0; i < profile.length; i++) cy += profile[i].y;
        cy /= profile.length;
        let dot = 0;
        for (let i = 0; i < pos.length; i += 3) {
            dot += nrm[i] * pos[i] + nrm[i + 1] * (pos[i + 1] - cy) + nrm[i + 2] * pos[i + 2];
        }
        if (dot < 0) {
            for (let i = 0; i < ind.length; i += 3) { const t = ind[i + 1]; ind[i + 1] = ind[i + 2]; ind[i + 2] = t; }
            nrm = new Float32Array(pos.length);
            BABYLON.VertexData.ComputeNormals(pos, ind, nrm);
        }

        const avg = (ia, ib) => {
            const a = ia * 3, b = ib * 3;
            let nx = nrm[a] + nrm[b], ny = nrm[a + 1] + nrm[b + 1], nz = nrm[a + 2] + nrm[b + 2];
            const L = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            nx /= L; ny /= L; nz /= L;
            nrm[a] = nrm[b] = nx; nrm[a + 1] = nrm[b + 1] = ny; nrm[a + 2] = nrm[b + 2] = nz;
        };
        // 【対策】角度 0 と 2π の頂点は位置が同じでも別頂点。片側の三角形しか
        //         見ていないので、平均しないと縦一文字のハイライトが走る
        for (let s = 0; s < strips.length; s++) {
            avg(strips[s].ringA, strips[s].ringA + seg);
            avg(strips[s].ringB, strips[s].ringB + seg);
        }
        // 帯どうしの継ぎ目（smooth 指定のある所だけ）
        for (let s = 1; s < strips.length; s++) {
            if (!strips[s].smooth) continue;
            for (let j = 0; j <= seg; j++) avg(strips[s - 1].ringB + j, strips[s].ringA + j);
        }

        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = ind; vd.uvs = uvs; vd.colors = cols;
        vd.normals = Array.prototype.slice.call(nrm);
        const mesh = new BABYLON.Mesh(name, scene);
        vd.applyToMesh(mesh);

        // マテリアルごとに帯をまとめて subMesh にする
        const names = [];
        for (const st of strips) if (names.indexOf(st.mat) < 0) names.push(st.mat);
        const mm = new BABYLON.MultiMaterial(name + "_mm", scene);
        mm.subMaterials = names.map((n) => opts.mats[n]);
        mesh.material = mm;
        mesh.subMeshes = [];
        const vCount = pos.length / 3;
        let s = 0;
        while (s < strips.length) {
            let e = s;
            while (e + 1 < strips.length && strips[e + 1].mat === strips[s].mat) e++;
            const iStart = strips[s].iStart;
            const iCount = strips[e].iStart + strips[e].iCount - iStart;
            new BABYLON.SubMesh(names.indexOf(strips[s].mat), 0, vCount, iStart, iCount, mesh);
            s = e + 1;
        }
        return mesh;
    }

    // 平面グリッドから「垂れた薄板」を作る（チーズ用）
    // surf(x,z) が接触面の高さ。厚みは面法線に沿って押し出す
    function buildDrape(name, half, N, surf, thickness, mat) {
        const V = (N + 1) * (N + 1);
        const pos = new Array(V * 2 * 3), uvs = new Array(V * 2 * 2);
        const idx = (i, j) => j * (N + 1) + i;
        const eps = 0.012;
        const nAt = (x, z) => {
            const hx = (surf(x + eps, z) - surf(x - eps, z)) / (2 * eps);
            const hz = (surf(x, z + eps) - surf(x, z - eps)) / (2 * eps);
            const L = Math.sqrt(hx * hx + hz * hz + 1);
            return [-hx / L, 1 / L, -hz / L];
        };
        for (let j = 0; j <= N; j++) {
            for (let i = 0; i <= N; i++) {
                const x = -half + (i / N) * 2 * half;
                const z = -half + (j / N) * 2 * half;
                const y = surf(x, z);
                const n = nAt(x, z);
                const a = idx(i, j);
                pos[a * 3] = x; pos[a * 3 + 1] = y; pos[a * 3 + 2] = z;
                pos[(V + a) * 3] = x - n[0] * thickness;
                pos[(V + a) * 3 + 1] = y - n[1] * thickness;
                pos[(V + a) * 3 + 2] = z - n[2] * thickness;
                const uu = i / N, vv = j / N;
                uvs[a * 2] = uu; uvs[a * 2 + 1] = vv;
                uvs[(V + a) * 2] = uu; uvs[(V + a) * 2 + 1] = vv;
            }
        }
        const ind = [];
        for (let j = 0; j < N; j++) {
            for (let i = 0; i < N; i++) {
                const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1);
                ind.push(a, d, c, a, c, b);                       // 上面
                ind.push(V + a, V + c, V + d, V + a, V + b, V + c); // 下面（逆巻き）
            }
        }
        // 縁（垂れた先端はここが見える）
        const border = [];
        for (let i = 0; i <= N; i++) border.push(idx(i, 0));
        for (let j = 1; j <= N; j++) border.push(idx(N, j));
        for (let i = N - 1; i >= 0; i--) border.push(idx(i, N));
        for (let j = N - 1; j >= 1; j--) border.push(idx(0, j));
        for (let k = 0; k < border.length; k++) {
            const a = border[k], b = border[(k + 1) % border.length];
            ind.push(a, V + a, V + b, a, V + b, b);
        }

        const nrm = new Float32Array(pos.length);
        BABYLON.VertexData.ComputeNormals(pos, ind, nrm);
        // 中央上面の法線は必ず上を向く。逆なら全反転
        const cIdx = idx(N >> 1, N >> 1);
        if (nrm[cIdx * 3 + 1] < 0) {
            for (let i = 0; i < ind.length; i += 3) { const t = ind[i + 1]; ind[i + 1] = ind[i + 2]; ind[i + 2] = t; }
            BABYLON.VertexData.ComputeNormals(pos, ind, nrm);
        }

        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = ind; vd.uvs = uvs;
        vd.normals = Array.prototype.slice.call(nrm);
        const mesh = new BABYLON.Mesh(name, scene);
        vd.applyToMesh(mesh);
        mesh.material = mat;
        return mesh;
    }

    // 極グリッドの薄い葉（レタス用）
    function buildLeaf(name, seed, R, mat, lift) {
        const NR = CFG.leafRings, NS = CFG.leafSeg;
        const rMax = (a) => R * (0.89 + 0.055 * Math.sin(a*9+seed) + 0.035 * Math.sin(a*23) + 0.08 * Noise.fbm3(Math.cos(a) * 2.2, 7.3, Math.sin(a) * 2.2, seed, 3));
        // 【対策】上に乗るトマトは薄い（厚み 0.2）。フリルの立ち上がりは
        //         それを軽く超えるので、放っておくと葉が断面を突き破る。
        //         振幅を一律に下げると葉が平らな円盤になるので、
        //         「トマトの真下に入る半径だけ天井を設ける」。外へ出た所は
        //         自由に立ち上がってよい（そこが見せ場でもある）
        const capR = CFG.tomatoRadius;
        const ceil = (r) => 0.045 - (lift || 0) + 0.62 * smooth(capR * 1.02, capR * 1.22, r);
        // 【対策】フリルの周波数を上げると、ただのギザギザ（折り紙の飾り）になる。
        //         実物の縁は「波長の長いうねり」＋「その上の細かい波」＋
        //         「いちばん外が下へ丸まる」の3つ。3つ目が無いと紙に見える
        const height = (x, z, rn, a) => {
            let y = 0.085 * rn * rn;                                       // 全体が皿状に反る
            y += 0.115 * Math.sin(a * 3 + 0.8) * rn * rn * rn;             // 大きな折れ（中心では効かない）
            y += 0.17 * (Noise.fbm3(x * 1.35, 0, z * 1.35, seed + 4, 3) - 0.5) * rn * rn;
            const frill = smooth(0.42, 1.0, rn);
            y += 0.195 * Math.sin(a * 12.0 + 2.2 * rn + 1.3) * frill * frill;
            y += 0.040 * Math.sin(a * 21.0 - 1.6 * rn) * frill * frill;
            y -= 0.10 * smooth(0.86, 1.0, rn);                             // 縁が下へ丸まる
            // 天井。硬く切ると平らな段になるので、越えた分を 12% に圧縮する
            const yc = ceil(Math.sqrt(x * x + z * z));
            if (y > yc) y = yc + (y - yc) * 0.12;
            return y;
        };
        const pos = [], uvs = [], ind = [];
        for (let ri = 0; ri <= NR; ri++) {
            const rn = Math.max(0.012, ri / NR);
            for (let j = 0; j <= NS; j++) {
                const a = (j / NS) * TAU;
                const r = rMax(a) * rn;
                const x = Math.cos(a) * r, z = Math.sin(a) * r;
                pos.push(x, height(x, z, rn, a), z);
                uvs.push(j / NS, rn);
            }
        }
        // 【対策】折れとフリルの合成は中心付近でも負に振れる。そのまま置くと
        //         葉の内側がバンズの切り口へ潜る。内側だけを基準に持ち上げ、
        //         外周（バンズの縁から垂れる所）は負のままにしておく
        let inner = 1e9;
        for (let ri = 0; ri <= NR; ri++) {
            if (ri / NR > 0.80) break;
            for (let j = 0; j <= NS; j++) inner = Math.min(inner, pos[(ri * (NS + 1) + j) * 3 + 1]);
        }
        if (inner < 0) {
            for (let i = 1; i < pos.length; i += 3) pos[i] -= inner;
            // 【対策】持ち上げたぶん天井を突き抜ける。シフト後にもう一度かける
            for (let i = 0; i < pos.length; i += 3) {
                const yc = ceil(Math.sqrt(pos[i] * pos[i] + pos[i + 2] * pos[i + 2]));
                if (pos[i + 1] > yc) pos[i + 1] = yc + (pos[i + 1] - yc) * 0.12;
            }
        }

        for (let ri = 0; ri < NR; ri++) {
            for (let j = 0; j < NS; j++) {
                const a = ri * (NS + 1) + j, b = a + 1, c = a + NS + 1, d = c + 1;
                ind.push(a, c, b, b, c, d);
            }
        }
        const nrm = new Float32Array(pos.length);
        BABYLON.VertexData.ComputeNormals(pos, ind, nrm);
        if (nrm[1] < 0) {
            for (let i = 0; i < ind.length; i += 3) { const t = ind[i + 1]; ind[i + 1] = ind[i + 2]; ind[i + 2] = t; }
            BABYLON.VertexData.ComputeNormals(pos, ind, nrm);
        }
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = ind; vd.uvs = uvs;
        vd.normals = Array.prototype.slice.call(nrm);
        const mesh = new BABYLON.Mesh(name, scene);
        vd.applyToMesh(mesh);
        mesh.material = mat;
        return mesh;
    }

    // =================================================================
    // 6. Pieces
    // =================================================================
    // 形状ノイズ。低周波＝生地の歪み、中周波＝焼成の膨らみ
    const bunWarp = (seed) => (x, y, z, w) => {
        const n = Noise.fbm3(x * 0.95 + 11, y * 0.95, z * 0.95, seed, 3) - 0.5;
        const m = Noise.fbm3(x * 2.7, y * 2.7 + 5, z * 2.7, seed + 3, 2) - 0.5;
        const k = 1 + (n * 0.095 + m * 0.033) * w;
        return [x * k, y + n * 0.055 * w, z * k];
    };

    const R = CFG.bunRadius;

    // ---- 下バンズ ------------------------------------------------------
    // 原点は底（y=0）。切り口は y = bottomBunHeight
    function makeBottomBun() {
        const H = CFG.bottomBunHeight;
        // 【対策】クラムの帯を肩まで回すと、切り口が和太鼓の皮のように
        //         側面へ覆いかぶさる。パンを切った断面は「刃の通った平面」
        //         だけで、そこから先は表皮。マテリアルの境界は切り口の縁に
        //         置き、そこで稜線として折る（smooth を付けない）
        // 【対策】切り口は完全な平面ではなく、中央がわずかにへこむ。
        //         縁がいちばん高く、そこに表皮の細い輪が回る
        const P = [
            { r: 0.001, y: H - 0.030, mat: "crumb", planar: true, w: 0.15 },
            { r: R * 0.40, y: H - 0.026, mat: "crumb", planar: true, smooth: true, w: 0.15 },
            { r: R * 0.72, y: H - 0.016, mat: "crumb", planar: true, smooth: true, w: 0.18 },
            { r: R * 0.90, y: H - 0.005, mat: "crumb", planar: true, smooth: true, w: 0.22 },
            { r: R * 0.955, y: H, mat: "crust", polar: true, w: 0.45 },          // 切り口の縁＝表皮の始まり
            { r: R * 0.998, y: H - 0.055, mat: "crust", polar: true, smooth: true, w: 0.8 },
            { r: R * 1.015, y: H - 0.24, mat: "crust", polar: true, smooth: true, w: 1.0 },
            { r: R * 0.995, y: H - 0.40, mat: "crust", polar: true, smooth: true, w: 1.0 },
            { r: R * 0.935, y: 0.115, mat: "crust", polar: true, smooth: true, w: 1.0 },
            { r: R * 0.800, y: 0.030, mat: "crust", polar: true, smooth: true, w: 0.8 },
            { r: R * 0.560, y: 0.002, mat: "crust", polar: true, smooth: true, w: 0.4 },
            { r: 0.001, y: 0.0, mat: "crust", polar: true, smooth: true, w: 0.2 }
        ];
        return buildLathe("bottomBun", P, CFG.latheSeg, {
            mats: { crumb: matCrumb, crust: matCrust },
            rUV: R * 1.06, polarOrigin: -1, polarTiles: 2.0, warp: bunWarp(SEED + 5),
            // 底に近いほど暗い。板との接触に細い暗がりを作る。
            // 【対策】切り口は上を向いていて環境光をまともに受けるので、
            //         そのままだと白く飛ぶ。上バンズの切り口と同じだけ落とす
            ao: (x, y) => mix(0.70, 1.0, smooth(0.0, 0.45, y))
                * (1 - 0.24 * smooth(H - 0.16, H - 0.02, y))
        });
    }

    // ---- 上バンズ ------------------------------------------------------
    // 原点は切り口（y=0）。ドームは上へ。腰は下から 1/4 の位置
    function makeTopBun() {
        const H = CFG.topBunHeight;
        const P = [
            { r: 0.001, y: H, mat: "crust", polar: true, w: 0.7 },
            { r: R * 0.14, y: H - 0.008, mat: "crust", polar: true, smooth: true, w: 0.9 },
            { r: R * 0.28, y: H - 0.034, mat: "crust", polar: true, smooth: true, w: 1.0 },
            { r: R * 0.43, y: H - 0.083, mat: "crust", polar: true, smooth: true, w: 1.0 },
            { r: R * 0.58, y: H - 0.158, mat: "crust", polar: true, smooth: true, w: 1.0 },
            { r: R * 0.72, y: H - 0.262, mat: "crust", polar: true, smooth: true, w: 1.0 },
            { r: R * 0.845, y: H - 0.400, mat: "crust", polar: true, smooth: true, w: 1.0 },
            { r: R * 0.935, y: H - 0.560, mat: "crust", polar: true, smooth: true, w: 1.0 },
            { r: R * 0.990, y: H - 0.735, mat: "crust", polar: true, smooth: true, w: 1.0 },
            { r: R * 1.005, y: H - 0.885, mat: "crust", polar: true, smooth: true, w: 1.0 },   // 腰
            { r: R * 0.995, y: 0.105, mat: "crust", polar: true, smooth: true, w: 1.0 },
            { r: R * 0.955, y: 0.030, mat: "crust", polar: true, smooth: true, w: 0.8 },
            // 【対策】切り口を真っ平らにすると、ドーム状の具材と縁でしか
            //         接せず、中央に必ず口が開く。実物のクラムは中央がへこんだ
            //         皿状で、具材の膨らみを受ける
            { r: R * 0.905, y: 0.0, mat: "crumb", planar: true, w: 0.25 },                 // 切り口の縁
            { r: R * 0.70, y: 0.030, mat: "crumb", planar: true, smooth: true, w: 0.22 },
            { r: R * 0.45, y: 0.062, mat: "crumb", planar: true, smooth: true, w: 0.20 },
            { r: R * 0.20, y: 0.084, mat: "crumb", planar: true, smooth: true, w: 0.16 },
            { r: 0.001, y: 0.090, mat: "crumb", planar: true, smooth: true, w: 0.15 }
        ];
        return buildLathe("topBun", P, CFG.latheSeg, {
            mats: { crust: matCrust, crumb: matCrumb },
            rUV: R * 1.06, polarOrigin: 0, polarTiles: 2.0, warp: bunWarp(SEED + 6),
            ao: (x, y) => mix(0.72, 1.0, smooth(-0.02, 0.55, y))
        });
    }

    // ---- ゴマ ----------------------------------------------------------
    // 表示メッシュの頂点をそのまま拾って置く。解析式で置くと、形状ノイズを
    // 掛けたあとの面から浮いたり沈んだりする
    function scatterSesame(bun) {
        const pos = bun.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const nrm = bun.getVerticesData(BABYLON.VertexBuffer.NormalKind);
        const cand = [];
        for (let i = 0; i < pos.length; i += 3) {
            if (nrm[i + 1] > 0.42 && pos[i + 1] > 0.35) cand.push(i / 3);
        }
        if (!cand.length) return [];

        const masters = [];
        for (let k = 0; k < 3; k++) {
            const m = BABYLON.MeshBuilder.CreateSphere("sesame" + k, { diameter: 1, segments: 10 }, scene);
            m.scaling = new V3(0.115, 0.045, 0.078);
            // 【対策】InstancedMesh は元メッシュの scaling を継承しない。
            //         形は頂点に焼き込んでおく。ついでに元メッシュは非表示に
            //         しない（元を隠すとインスタンスごと消える）ので、
            //         3個の元メッシュもそのまま1粒として配置する
            m.bakeCurrentTransformIntoVertices();
            const mat = matSesame.clone("sesameMat" + k);
            mat.albedoColor = new BABYLON.Color3(1, 1, 1).scale(1 - k * 0.13);
            m.material = mat;
            masters.push(m);
        }

        const rng = new Rng(SEED + 401);
        const used = [];
        const out = [];
        for (let s = 0; s < CFG.sesameCount; s++) {
            let vi = -1;
            for (let tries = 0; tries < 24; tries++) {
                const c = cand[rng.int(cand.length)];
                let ok = true;
                for (let u = 0; u < used.length; u++) {
                    const d = used[u];
                    const dx = pos[c * 3] - d[0], dy = pos[c * 3 + 1] - d[1], dz = pos[c * 3 + 2] - d[2];
                    if (dx * dx + dy * dy + dz * dz < 0.030) { ok = false; break; }
                }
                if (ok) { vi = c; break; }
            }
            if (vi < 0) continue;
            used.push([pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]]);

            const n = new V3(nrm[vi * 3], nrm[vi * 3 + 1], nrm[vi * 3 + 2]).normalize();
            const inst = (out.length < 3) ? masters[out.length] : masters[rng.int(3)].createInstance("ses" + s);
            // 半分は生地に埋まっている。全部乗せると貼り付けたように見える
            inst.position = new V3(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]).add(n.scale(-0.012));
            let axis = V3.Cross(V3.Up(), n);
            const len = axis.length();
            const q = (len < 1e-5)
                ? BABYLON.Quaternion.Identity()
                : BABYLON.Quaternion.RotationAxis(axis.scale(1 / len), Math.acos(clamp(n.y, -1, 1)));
            inst.rotationQuaternion = q.multiply(BABYLON.Quaternion.RotationAxis(V3.Up(), rng.range(0, TAU)));
            inst.parent = bun;
            out.push(inst);
        }
        return out;
    }

    // ---- パティ --------------------------------------------------------
    // 原点は底。焼き縮みで中央が持ち上がり、縁は不規則にちぎれる
    function makePatty() {
        const Rp = CFG.pattyRadius, H = CFG.pattyHeight;
        const warp = (x, y, z, w) => {
            const n = Noise.fbm3(x * 1.55, y * 1.55, z * 1.55, SEED + 11, 3) - 0.5;
            const m = Noise.fbm3(x * 5.2, y * 5.2 + 3, z * 5.2, SEED + 13, 3) - 0.5;
            const k = 1 + (n * 0.070 + m * 0.048) * w;
            return [x * k, y + (n * 0.045 + m * 0.020) * w, z * k];
        };
        const P = [
            { r: 0.001, y: H, mat: "face", planar: true, w: 0.45 },
            { r: Rp * 0.42, y: H - 0.004, mat: "face", planar: true, smooth: true, w: 0.5 },
            { r: Rp * 0.74, y: H - 0.026, mat: "face", planar: true, smooth: true, w: 0.6 },
            { r: Rp * 0.93, y: H - 0.085, mat: "face", planar: true, smooth: true, w: 0.8 },
            { r: Rp * 0.995, y: H - 0.165, mat: "side", v: 0.04, smooth: true, w: 1.0 },
            { r: Rp * 1.030, y: H - 0.260, mat: "side", v: 0.30, smooth: true, w: 1.0 },
            { r: Rp * 1.015, y: 0.115, mat: "side", v: 0.58, smooth: true, w: 1.0 },
            { r: Rp * 0.955, y: 0.030, mat: "side", v: 0.82, smooth: true, w: 0.9 },
            { r: Rp * 0.890, y: 0.0, mat: "face", planar: true, smooth: true, w: 0.5 },
            { r: Rp * 0.50, y: -0.008, mat: "face", planar: true, smooth: true, w: 0.4 },
            { r: 0.001, y: -0.012, mat: "face", planar: true, smooth: true, w: 0.3 }
        ];
        for(const p of P) if(p.v!==undefined)p.v*=.16;
        const pattyMesh=buildLathe("patty", P, CFG.latheSeg, {
            mats: { face: matPattyFace, side: matPattySide },
            rUV: Rp * 1.06, uTile: 3, warp,
            ao: (x, y) => mix(0.66, 1.0, smooth(0.0, 0.34, y))
        });
        // Seared mince fragments break the perfectly smooth silhouette.
        const rng=new Rng(SEED+701);
        const groups=[[],[],[]];
        for(let i=0;i<400;i++){
            const a=rng.range(0,TAU), y=rng.range(.07,H-.08), rr=Rp*(1.003+rng.range(-.014,.025));
            const bit=BABYLON.MeshBuilder.CreateSphere("mince",{diameter:1,segments:4},scene);
            bit.scaling.set(rng.range(.030,.075),rng.range(.018,.044),rng.range(.030,.070));
            bit.position.set(Math.cos(a)*rr,y,Math.sin(a)*rr);
            bit.rotation.set(rng.next()*3,rng.next()*3,rng.next()*3);
            groups[rng.int(3)].push(bit);
        }
        groups.forEach((meshes,k)=>{
            const merged=BABYLON.Mesh.MergeMeshes(meshes,true,true);
            const m=new BABYLON.PBRMaterial("searedMince"+k,scene);
            m.albedoColor=new BABYLON.Color3(...[[.025,.009,.004],[.065,.024,.009],[.13,.052,.018]][k]);
            m.metallic=0;m.roughness=.52-k*.055;
            merged.material=m;merged.parent=pattyMesh;
        });
        return pattyMesh;
    }

    // ---- トマト --------------------------------------------------------
    function makeTomato() {
        const Rt = CFG.tomatoRadius, H = CFG.tomatoHeight;
        // 【対策】パティと同じ感覚で肩を丸めると座布団になる。トマトは
        //         包丁で切った断面なので、天面は平ら、側面は垂直、角は
        //         ほとんど立ったまま。丸めてよいのは 0.015 くらいまで
        const warp = (x, y, z, w) => {
            const a = Math.atan2(z, x);
            const n = Noise.fbm3(x * 1.9, y * 1.9, z * 1.9, SEED + 17, 3) - 0.5;
            // 輪郭はわずかに角ばる（子室の数だけ膨らむ）。それ以外は真円に近い
            const k = 1 + (n * 0.018 + Math.sin(a * 6 + 0.6) * 0.011) * w;
            return [x * k, y, z * k];
        };
        // 【対策】側面の V を 0..1 で振ると、周長 2πR に対して高さが H しか
        //         無いのに同じ 1 タイルを割り当てることになり、テクスチャが
        //         縦に約10倍潰れる。ノイズが横へ伸びて縞に見えるのはこれ。
        //         V の幅を実寸の比に合わせる（テクスチャは周期なので巻いてよい）
        const vs = H / (Math.PI * Rt);            // uTile = 2 のときの1タイル幅で正規化
        const P = [
            { r: 0.001, y: H, mat: "flesh", planar: true, w: 0.25 },
            { r: Rt * 0.55, y: H + 0.003, mat: "flesh", planar: true, smooth: true, w: 0.30 },
            { r: Rt * 0.88, y: H + 0.001, mat: "flesh", planar: true, smooth: true, w: 0.50 },
            { r: Rt * 0.995, y: H, mat: "flesh", planar: true, smooth: true, w: 0.90 },
            // ここで折る（smooth を付けない）。包丁の角は稜線として立つ
            { r: Rt * 1.000, y: H - H * 0.055, mat: "skin", v: vs * 0.07, w: 1.0 },
            { r: Rt * 1.004, y: H * 0.62, mat: "skin", v: vs * 0.38, smooth: true, w: 1.0 },
            { r: Rt * 1.004, y: H * 0.30, mat: "skin", v: vs * 0.70, smooth: true, w: 1.0 },
            { r: Rt * 1.000, y: H * 0.055, mat: "skin", v: vs * 0.93, smooth: true, w: 1.0 },
            { r: Rt * 0.995, y: 0.0, mat: "flesh", planar: true, w: 0.90 },
            { r: Rt * 0.55, y: -0.003, mat: "flesh", planar: true, smooth: true, w: 0.30 },
            { r: 0.001, y: -0.005, mat: "flesh", planar: true, smooth: true, w: 0.25 }
        ];
        return buildLathe("tomato", P, CFG.latheSeg, {
            mats: { flesh: matTomatoFlesh, skin: matTomatoSkin },
            rUV: Rt * 1.03, uTile: 2, warp,
            ao: (x, y) => mix(0.80, 1.0, smooth(0.0, 0.06, y))
        });
    }

    // パティ天面の縦断面（頂点を 0 とした相対高さ）。makePatty の profile と同じ形。
    // チーズはこの線に沿わせる
    const PATTY_TOP = [[0, 0], [0.42, -0.004], [0.74, -0.026], [0.93, -0.085], [0.995, -0.165], [1.030, -0.262]];
    const PATTY_EDGE_Q = PATTY_TOP[PATTY_TOP.length - 1][0];
    function pattyTopRel(q) {                 // q = r / pattyRadius
        if (q <= 0) return 0;
        for (let i = 1; i < PATTY_TOP.length; i++) {
            if (q <= PATTY_TOP[i][0]) {
                const a = PATTY_TOP[i - 1], b = PATTY_TOP[i];
                return mix(a[1], b[1], (q - a[0]) / (b[0] - a[0]));
            }
        }
        return PATTY_TOP[PATTY_TOP.length - 1][1];
    }

    // ---- チーズ --------------------------------------------------------
    // 原点は「中央でパティ天面に接する点」。つまり裏面の最高点が y=0 で、
    // 表面は板厚のぶんだけ上にある
    function makeCheese() {
        const half = CFG.cheeseHalf;
        const TH = 0.042;                     // 板厚
        // 【対策】パティは形状ノイズで最大 7% ほど外へ膨らむ。チーズを公称の
        //         断面にぴったり沿わせると、その膨らんだ所だけ肉を突き抜ける。
        //         半径を割り増しして評価し、常に外側・上側を通す
        const RE = CFG.pattyRadius * 1.07;
        const edgeR = RE * PATTY_EDGE_Q;      // ここまでがパティに乗っている範囲
        const edgeY = pattyTopRel(PATTY_EDGE_Q);
        const surf = (x, z) => {
            const r = Math.sqrt(x * x + z * z);
            const q = r / RE;
            if (q <= PATTY_EDGE_Q) {
                // 【対策】板厚は面法線に沿って下へ押し出される。表面をパティに
                //         合わせると、裏面が板厚ぶん潜る。表面は板厚だけ持ち上げる
                return pattyTopRel(q) + TH + 0.008 * (Noise.fbm3(x * 3.1, 0, z * 3.1, SEED + 19, 2) - 0.5);
            }
            // 肩を越えたら垂れる。角ほど t が大きいので自然に長く垂れる
            const t = r - edgeR;
            const wob = 0.78 + 0.36 * Noise.fbm3(x * 2.0, 5, z * 2.0, SEED + 23, 3);
            return edgeY + TH - 0.30 * (1 - Math.exp(-2.8 * t)) * wob;
        };
        const mesh = buildDrape("cheese", half, CFG.cheeseGrid, surf, TH, matCheese);
        mesh.metadata = { topY: TH + 0.006 };
        return mesh;
    }

    // ---- レタス --------------------------------------------------------
    // 葉は 1 枚では隙間だらけになる。2 枚を角度違いで重ねる
    function makeLettuce() {
        const root = new BABYLON.TransformNode("lettuceRoot", scene);
        const leaves = [];
        // 【対策】1〜2枚だと隙間からバンズの切り口が抜けて見える。実物も
        //         ちぎった葉を数枚重ねている
        const a = buildLeaf("leafA", SEED + 29, CFG.lettuceRadius, matLettuce, 0.0);
        a.parent = root; a.rotation.y = 0.0; a.position.y = 0.0;
        const b = buildLeaf("leafB", SEED + 31, CFG.lettuceRadius * 0.97, matLettuce, 0.020);
        b.parent = root; b.rotation.y = 2.35; b.position.y = 0.020; b.rotation.z = 0.03;
        const c = buildLeaf("leafC", SEED + 37, CFG.lettuceRadius * 0.94, matLettuce, 0.038);
        c.parent = root; c.rotation.y = 4.40; c.position.y = 0.038; c.rotation.x = -0.03;
        leaves.push(a, b, c);
        return { root, leaves };
    }

    // =================================================================
    // 7. Scene（カメラ・光・ポスト）
    // =================================================================
    const camera = new BABYLON.ArcRotateCamera("camera", -Math.PI * 0.62, 1.25, 8.6, new V3(0, 1.15, 0), scene);
    const homeRadius=8.6*Math.max(1,.85/(engine.getRenderWidth()/engine.getRenderHeight()));
    camera.radius=homeRadius;
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 22;
    camera.lowerRadiusLimit = 4.5;
    camera.upperRadiusLimit = 26;
    camera.upperBetaLimit = 1.53;      // 板の下へ潜らせない
    camera.minZ = 0.4;
    camera.maxZ = 120;
    camera.fov = 0.62;                 // 食べ物の写真は広角では撮らない

    // Procedural studio cubemap: no HDR, photos, or downloaded textures.
    const size = 128, faces = [];
    for (let face = 0; face < 6; face++) {
        const pixels = new Uint8Array(size * size * 4);
        for (let j=0;j<size;j++) for(let i=0;i<size;i++) {
            const u=2*(i+.5)/size-1, v=2*(j+.5)/size-1;
            const dirs=[[1,-v,-u],[-1,-v,u],[u,1,v],[u,-1,-v],[u,-v,1],[-u,-v,-1]];
            const d=new V3(...dirs[face]).normalize();
            const softbox=(axis, power)=>Math.pow(Math.max(0,V3.Dot(d,axis.normalize())),power);
            const keyBox=softbox(new V3(-.7,1,-.7),24);
            const rimBox=softbox(new V3(.8,.5,1),40);
            const ambient=.11+.13*Math.max(d.y,0);
            const rgb=[ambient+.73*keyBox+.5*rimBox,ambient*.94+.68*keyBox+.46*rimBox,ambient*.85+.58*keyBox+.4*rimBox];
            const p=(j*size+i)*4;
            for(let c=0;c<3;c++) pixels[p+c]=Math.min(255,rgb[c]*255);
            pixels[p+3]=255;
        }
        faces.push(pixels);
    }
    const env=new BABYLON.RawCubeTexture(scene,faces,size,BABYLON.Engine.TEXTUREFORMAT_RGBA,BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE,true,false,BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    env.gammaSpace=false;
    const polynomial=new BABYLON.SphericalPolynomial();
    polynomial.xx.set(.30,.28,.25); polynomial.yy.set(.38,.35,.30); polynomial.zz.set(.30,.28,.25);
    env.sphericalPolynomial=polynomial;
    scene.environmentTexture=env;
    scene.environmentIntensity=.65;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.45, -1.0, 0.55).normalize(), scene);
    key.position = new V3(6, 12, -7);
    key.intensity = 2.7;
    key.diffuse = new BABYLON.Color3(1.0, 0.965, 0.915);
    // 【対策】既定の影の範囲はキャスターのバウンディングに合わせられるので、
    //         影の落ちる先（板）が範囲外になって直線でぶつ切りになる
    key.autoUpdateExtends = false;
    key.orthoLeft = -6; key.orthoRight = 6;
    key.orthoBottom = -6; key.orthoTop = 6;
    key.shadowMinZ = 1; key.shadowMaxZ = 30;

    const rim = new BABYLON.DirectionalLight("rim", new V3(0.55, -0.30, -1.0).normalize(), scene);
    rim.intensity = 1.2;
    rim.diffuse = new BABYLON.Color3(1.0, 0.90, 0.80);   // 逆光でレタスとトマトを透かす

    const fill = new BABYLON.HemisphericLight("fill", new V3(0, 1, 0), scene);
    fill.intensity = 0.16;

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0025;
    sg.normalBias = 0.016;
    sg.setDarkness(0.10);              // 屋内の影は真っ黒にならない

    // ---- まな板 --------------------------------------------------------
    const board = BABYLON.MeshBuilder.CreateBox("board", { width: 11, height: 0.5, depth: 11 }, scene);
    board.position.y = -0.25;
    board.material = matWood;
    board.receiveShadows = true;
    if (physicsReady) {
        new BABYLON.PhysicsAggregate(board, BABYLON.PhysicsShapeType.BOX,
            { mass: 0, restitution: 0.0, friction: CFG.friction }, scene);
    }

    // ---- ポストプロセス --------------------------------------------------
    if (CFG.useSSAO) {
        try {
            if (BABYLON.SSAO2RenderingPipeline && BABYLON.SSAO2RenderingPipeline.IsSupported) {
                const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1 }, [camera]);
                ssao.totalStrength = 0.65;
                ssao.radius = 0.22;                // 層の間の隙間に合わせる
                ssao.base = 0.05;
                ssao.samples = 16;
                ssao.expensiveBlur = true;
                ssao.maxZ = 22;
            }
        } catch (e) { console.warn("[Burger] SSAO を無効にしました。", e); }
    }
    const pipe = new BABYLON.DefaultRenderingPipeline("pipe", true, scene, [camera]);
    pipe.fxaaEnabled = true;
    pipe.imageProcessingEnabled = true;
    pipe.imageProcessing.toneMappingEnabled = true;
    pipe.imageProcessing.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    pipe.imageProcessing.exposure = CFG.exposure;
    pipe.imageProcessing.contrast = CFG.contrast;
    pipe.imageProcessing.vignetteEnabled = true;
    pipe.imageProcessing.vignetteWeight = 1.6;
    pipe.imageProcessing.vignetteCameraFov = 0.7;
    pipe.imageProcessing.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    // =================================================================
    // 8. Assembly
    // =================================================================
    // 【対策】当たり判定を表示メッシュから作ると、垂れたチーズやフリルの分だけ
    //         バウンディングが伸び、次の層がその空中の縁に乗って浮く。
    //         「支える板」だけを代理形状にして、表示メッシュはその子に吊るす
    const rngPlace = new Rng(SEED + 911);
    const pieces = [];
    let stackTop = 0;                  // 次の層が乗る高さ

    // 表示メッシュの実測 Y 範囲。形状ノイズを掛けたあとの値でないと、
    // 代理形状の天面と見た目の天面が数ミリずれて層の間に隙間が出る
    function meshYBounds(mesh) {
        const p = mesh.getVerticesData && mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        if (!p) return null;
        let mn = 1e9, mx = -1e9;
        for (let i = 1; i < p.length; i += 3) { if (p[i] < mn) mn = p[i]; if (p[i] > mx) mx = p[i]; }
        return { min: mn, max: mx };
    }

    function addPiece(name, visual, opt) {
        const b = meshYBounds(visual);
        const top = (opt.topY !== undefined) ? opt.topY : (b ? b.max : 0.1);
        const bot = (opt.botY !== undefined) ? opt.botY : (b ? b.min : 0);
        // 【対策】代理形状を見た目の実寸ぴったりにすると、層が一切潰れずに
        //         積み木のように乗る。実物は上の層の重さで必ず食い込むので、
        //         embed のぶんだけ代理形状を短くして下の層へ沈ませる
        const embed = opt.embed || 0;
        opt.h = Math.max(0.04, top - bot - embed);
        opt.offsetY = -(top + bot + embed) * 0.5;
        opt.support = opt.h - (opt.sink || 0);

        const proxy = (opt.shape === "box")
            ? BABYLON.MeshBuilder.CreateBox(name + "_proxy",
                { width: opt.w, height: opt.h, depth: opt.d }, scene)
            : BABYLON.MeshBuilder.CreateCylinder(name + "_proxy",
                { diameter: opt.diameter, height: opt.h, tessellation: 24 }, scene);
        proxy.isVisible = false;

        const supportY = stackTop;
        const spawnY = supportY + opt.h * 0.5 + (physicsReady ? CFG.dropClearance : 0);
        proxy.position.set(rngPlace.range(-0.035, 0.035), spawnY, rngPlace.range(-0.035, 0.035));
        proxy.rotation.y = opt.yaw !== undefined ? opt.yaw : rngPlace.range(0, TAU);
        proxy.setEnabled(false);

        // 【対策】親子付けは物理ボディを作ったあとに行う。先に子を付けると、
        //         形状生成がヒエラルキー全体のバウンディングを拾う実装に当たり、
        //         垂れたチーズの分だけ当たり判定が縦に伸びる
        visual.setEnabled(false);
        const piece = { name, proxy, visual, opt, body: null, settleT: 0, aliveT: 0, frozen: false };
        pieces.push(piece);
        stackTop = supportY + opt.support;
        return piece;
    }

    function activate(piece) {
        piece.proxy.setEnabled(true);
        piece.proxy.computeWorldMatrix(true);
        if (physicsReady) attachBody(piece);
        piece.visual.parent = piece.proxy;
        piece.visual.position.y = piece.opt.offsetY;
        piece.visual.setEnabled(true);
    }

    function attachBody(piece) {
        const agg = new BABYLON.PhysicsAggregate(piece.proxy,
            piece.opt.shape === "box" ? BABYLON.PhysicsShapeType.BOX : BABYLON.PhysicsShapeType.CYLINDER,
            { mass: piece.opt.mass, restitution: CFG.restitution, friction: CFG.friction }, scene);
        // 【対策】damping は PhysicsAggregate のオプションに書いても効かない
        agg.body.setLinearDamping(CFG.linearDamping);
        agg.body.setAngularDamping(CFG.angularDamping);
        piece.body = agg.body;
    }

    function registerVisual(mesh) {
        mesh.receiveShadows = true;
        sg.addShadowCaster(mesh, true);
    }

    // ---- 具材を組み上げる ------------------------------------------------
    const bottomBun = makeBottomBun();
    registerVisual(bottomBun);
    addPiece("bottomBun", bottomBun, {
        diameter: R * 2.02, botY: 0, mass: 1.0, yaw: 0
    });

    const lettuce = makeLettuce();
    for (const l of lettuce.leaves) registerVisual(l);
    // 葉は上下に大きく振れるが、支えているのは中央の平らな部分だけ。
    // フリルの高さを当たり判定に入れると、トマトが空中の縁に乗って浮く
    addPiece("lettuce", lettuce.root, {
        diameter: CFG.lettuceRadius * 1.70, botY: 0, topY: 0.095, mass: 0.28, embed: 0.02
    });

    const tomato = makeTomato();
    registerVisual(tomato);
    addPiece("tomato", tomato, {
        diameter: CFG.tomatoRadius * 2.0, mass: 0.55, embed: 0.05   // 葉は柔らかいので沈む
    });

    const patty = makePatty();
    registerVisual(patty);
    addPiece("patty", patty, {
        diameter: CFG.pattyRadius * 2.05, mass: 2.2, embed: 0.035
    });

    const cheese = makeCheese();
    registerVisual(cheese);
    // チーズは「垂れ」を除いた接触面だけが支持面
    addPiece("cheese", cheese, {
        shape: "box", w: CFG.cheeseHalf * 2, d: CFG.cheeseHalf * 2,
        botY: 0, topY: cheese.metadata.topY, mass: 0.30, yaw: 0.42   // 少しずらして角を見せる
    });

    const topBun = makeTopBun();
    registerVisual(topBun);
    const sesame = scatterSesame(topBun);
    // 【対策】インスタンスは元メッシュを影キャスターに入れれば付いてくる。
    //         個別に renderList へ入れる必要はない
    for (const s of sesame) if (!s.sourceMesh) sg.addShadowCaster(s);
    // 上バンズは具材を押し潰して食い込む。ここを 0 にすると宙に浮いて見える
    addPiece("topBun", topBun, {
        diameter: R * 2.02, mass: 1.1, embed: 0.13
    });

    // ---- 落として積む ----------------------------------------------------
    let dropIndex = 0, dropTimer = CFG.dropInterval;
    if (!physicsReady) {
        // 物理なしのときは設計どおりの位置に置く
        let y = 0;
        for (const p of pieces) {
            p.proxy.position.set(0, y + p.opt.h * 0.5, 0);
            activate(p);
            y += p.opt.support;
        }
        dropIndex = pieces.length;
    }

    scene.onBeforeRenderObservable.add(() => {
        const dt = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
        if (dropIndex < pieces.length) {
            dropTimer += dt;
            if (dropTimer >= CFG.dropInterval) { dropTimer = 0; activate(pieces[dropIndex]); dropIndex++; }
        }
        if (!physicsReady) return;
        // 【対策】平らな面どうしは接触が解けたり結び直したりで永久に微振動する。
        //         静止したものは STATIC にして計算から外す
        for (const p of pieces) {
            if (!p.body || p.frozen) continue;
            p.aliveT += dt;
            const v = p.body.getLinearVelocity();
            const w = p.body.getAngularVelocity();
            const still = v.length() < CFG.settleSpeed && w.length() < CFG.settleSpeed * 4;
            p.settleT = still ? p.settleT + dt : 0;
            if (p.settleT > CFG.settleHold || p.aliveT > CFG.settleTimeout) {
                try { p.body.setMotionType(BABYLON.PhysicsMotionType.STATIC); } catch (e) { }
                p.frozen = true;
            }
        }
    });

    const rest=pieces.map(p=>p.proxy.position.y);
    let spread=0, requestedSpread=0, rotating=false;
    scene.metadata={
        setSpread(value){requestedSpread=clamp(value,0,1);},
        setRotate(value){rotating=!!value;},
        reset(){requestedSpread=0; camera.alpha=-Math.PI*.62;camera.beta=1.25;camera.radius=homeRadius+spread*3.5;},
        pieces:pieces.map(p=>p.name)
    };
    scene.onBeforeRenderObservable.add(()=>{
        const dt=Math.min(.05,engine.getDeltaTime()/1000);
        const previous=spread;
        spread+=(requestedSpread-spread)*(1-Math.exp(-dt*7));
        camera.radius+=(spread-previous)*3.5;
        pieces.forEach((p,i)=>{p.proxy.position.y=rest[i]+i*spread*.55;});
        camera.target.y=1.15+spread*1.35;
        if(rotating)camera.alpha+=dt*.15;
    });
    return scene;
};

export default createScene;