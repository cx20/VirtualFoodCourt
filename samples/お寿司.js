// =====================================================================
//  Photoreal Nigiri Sushi  /  写実的な握り寿司（まぐろ三貫）  BUILD: sushi-B
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  sushi-A からの変更点（Inspector のデバッグ表示）:
//    (a) Scene Explorer の Picker が、クリックした場所と違う所を選ぶ
//        シイタケ版で長く追いかけて特定した。原因は mesh.id の重複。
//        Babylon の Node はコンストラクタで id = name を入れるので、
//        同じ名前で作ったメッシュは id まで同じになる。Inspector は
//        拾ったメッシュを id でツリーの項目へ引き当てているとみられ、
//        同じ id が並んでいると別の個体に当たる。実測では
//          pick が返した: shiitakeCap7   → Inspector が選んだ: shiitakeCap6
//        となり、pick 自体は最初から正しいメッシュを返していた
//        （当たり位置に印を出して確認済み）。
//        このシーンは貫の親（piece0..2）と米粒の変種（g0_0 …）は
//        もともと一意だったが、
//          ・シャリの下地  … 3貫とも "shariBody"
//          ・ネタ          … 3貫とも "neta"
//          ・米粒インスタンス … 貫ごとに k を数え直すので "gi0" が3つ
//        が重複していた。いちばん選びたいネタとシャリが取り違えの対象
//        だったので、貫番号を付けて name と id の両方を一意にする。
//        name を変えたら id も必ず併せて変える、が守るべき規約になる
//    (b) Physics Helper が何も出ない／ギズモがずれる
//        GUI 専用カメラが原因。activeCameras を 2 台にすると、Babylon の
//        各機能が「activeCameras の末尾＝描画の基準カメラ」と見なす所で
//        全部 guiCam を拾う（UtilityLayerRenderer / EffectLayer /
//        scene.activeCamera）。そもそもカメラを分ける必要が無かった。
//        Layer.applyPostProcess = false にすると前景レイヤーは
//        _afterCameraPostProcessStage で描かれる＝ポストプロセスの後に
//        合成されるので、カメラ1台のまま GUI だけ Bloom / DOF から外せる。
//        guiOwnCamera の既定を false にして、こちらを標準にした
//        （true にすれば従来のカメラ分離＋bindDebugCamera に戻る）
//
//  ごはん.js の続き。シャリは「握って締めた酢飯」なので、
//  米粒の造形・マテリアル・粒間の暗がりの焼き込みはそのまま流用できる。
//  変わるのは盛りの形（茶碗の山 → 俵）だけ。
//
//  新規なのはネタのほう。切り身は野菜や米と成り立ちが違う:
//    ・見えているのは「表面」ではなく「包丁で切った断面」。
//      模様は表面の汚れではなく、筋肉の束と脂の層が切られた切り口
//    ・霜降りは色ではなく実体。脂は肉より白く、やわらかく、
//      わずかに盛り上がって光る。アルベドに白い線を描いただけだと
//      印刷したステッカーになる
//    ・赤身は光をよく透かす。逆光で縁が赤く抜けるのが生魚の証拠で、
//      ここを切ると「赤く塗った消しゴム」になる
//    ・ネタは板ではなく「垂れた布」。シャリに乗って前へ垂れ、
//      縁が下へ丸まる。平らな板を斜めに置くと折り紙になる
//
//  構成:
//    0. CONFIG        … ネタ（赤身/中トロ/大トロ）/ シャリ / 板
//    1〜5.            … ごはん.js から流用（Rng / Noise / 米のテクスチャ /
//                       米粒の掃引メッシュ / 米のPBR）
//    6. NetaLab       … まぐろの アルベド / ORM / 法線 / 厚み
//    7. Shari         … 俵の形（手で握った歪み）+ 粒の配置 + 擬似AO
//    8. Neta          … 垂れた切り身のメッシュ（上面・下面・小口）
//    9. Board         … 檜の板 + 石の台
//   10. Scene / GUI
// =====================================================================

var createScene = function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    // 単位系: 1 unit = 1 cm
    const MM = 0.1;

    // ---- 酢飯（1種類だけ）--------------------------------------------
    // 【対策】炊きたての白飯より、酢と砂糖の膜で艶が強く、色は
    //         わずかに黄みが濃い。握って締めるので粒の沈み込みは浅い。
    const RICE = {
        label: "酢飯",
        lengthMM: 5.35, widthMM: 2.80, heightMM: 2.15,
        albedo: [0.950, 0.928, 0.868],
        baseRough: 0.32,
        coatIntensity: 0.52, coatRough: 0.22,
        translucency: 0.40,
        tint: [0.99, 0.960, 0.910],
        crackAmount: 0.00,
        puff: 0.050,
        grooveDepth: 0.022,
        endSwell: 0.050,
        bumpLevel: 0.20,
        wetMottle: 0.30
    };

    // ---- ネタ（まぐろ）------------------------------------------------
    // 色はすべて sRGB。アルベドはテクスチャに焼くのでそのまま書ける
    const NETA = {
        akami: {
            label: "赤身",
            flesh: [0.560, 0.088, 0.098],       // 深い深紅
            fleshDark: [0.360, 0.048, 0.062],   // 血合い寄りの濃い部分
            fat: [0.780, 0.400, 0.360],         // 赤身の筋はごく淡い
            fatCount: 5.5,                      // 一切れを横切る筋の本数
            fatWidth: 0.015, fatStrength: 0.38,
            sasu: 0.10,                         // 細かい霜降りの点
            rough: 0.46, coat: 0.30, coatRough: 0.34,
            translucency: 0.55,
            tint: [0.90, 0.22, 0.18],
            thickMM: 6.2, lenMM: 66, widMM: 30
        },
        chutoro: {
            label: "中トロ",
            flesh: [0.842, 0.376, 0.365],
            fleshDark: [0.700, 0.235, 0.235],
            fat: [0.965, 0.855, 0.820],
            fatCount: 9.0,
            fatWidth: 0.021, fatStrength: 0.70,
            sasu: 0.42,
            rough: 0.40, coat: 0.36, coatRough: 0.30,
            translucency: 0.62,
            tint: [0.95, 0.42, 0.34],
            thickMM: 6.8, lenMM: 68, widMM: 31
        },
        otoro: {
            label: "大トロ",
            flesh: [0.918, 0.575, 0.545],
            fleshDark: [0.855, 0.430, 0.410],
            fat: [0.985, 0.940, 0.910],
            fatCount: 11.0,
            fatWidth: 0.030, fatStrength: 0.86,
            sasu: 0.72,
            rough: 0.36, coat: 0.42, coatRough: 0.28,
            translucency: 0.70,
            tint: [0.97, 0.58, 0.46],
            thickMM: 7.4, lenMM: 70, widMM: 32
        }
    };

    // ---- シャリ（俵）--------------------------------------------------
    const SHARI = {
        lenCM: 4.95,          // 長さ
        widCM: 2.52,          // 幅
        hgtCM: 2.18,          // 高さ
        // 【対策】endRound が小さいと、端が「ほぼ平らな円板」になる。
        //         その円板の中心は t=0 の極（一点に潰れる場所）なので、
        //         粒がドーナツ状にしか置けず、真ん中に穴が残る。
        //         0.5 にすると端がだ円の丸みになり、極の周りの面が小さくなる。
        // 【対策】4.2 だと胴が円柱のまま両端だけ落ちる「ブロック」になる。
        //         実物のシャリは中央がふくらんだ枕形で、端はなだらかに丸い。
        endPow: 3.6,          // 端の詰まり。大きいほど俵の胴が平行
        endRound: 0.48,       // 端の丸まり
        // 【対策】ここが角ばりの主因。2.7 は「角を丸めた四角」で、
        //         さらに接地側へ +2.4 していたので、下半分がほぼ長方形に
        //         なっていた。握ったシャリの断面はだ円に近い。
        sectionP: 2.15,       // 断面の超だ円指数。2 = だ円
        sectionBottom: 1.10,  // 接地側に足す指数（大きいほど平ら）
        bottomFlat: 0.16,     // 接地面の平らさ
        topRidge: 0.04,       // 天面のわずかな稜
        handLump: 0.042,      // 手で握った低周波の歪み
        fingerDent: 0.045,    // 側面に残る指の跡
        grainCount: 1500,     // 1貫あたりの粒数（表層のみ）
        grainSink: [0.00, 0.12],
        grainLift: 0.10,
        grainLiftRatio: 0.16,
        clusterSize: 3
    };

    // ---- ネタの垂れ方 --------------------------------------------------
    const DRAPE = {
        backX: 0.46,          // 後端の位置（シャリ長の比）
        backY: 0.86,          // 後端の高さ（シャリ高の比）
        crestX: -0.04,        // 峰の位置
        crestY: 1.04,         // 峰の高さ
        frontX: -0.66,        // 前端の位置
        frontY: 0.16,         // 前端の高さ
        // 【対策】浮いた粒の高さ（1mm）より隙間が小さいと、
        //         天面の粒がネタを突き抜けて刺さる
        gap: 0.090,           // シャリとの隙間 cm
        curl: 0.26,           // 幅方向の垂れ（縁が下がる）
        tipThin: 0.42,        // 前端での厚みの比
        wave: 0.030           // 表面のうねり
    };

    const GLOBAL = {
        pieces: 3,            // 並べる貫数
        // 【対策】ネタは前へ大きく垂れるので、全長は 6cm 近い。
        //         4.35cm 間隔だと隣の貫とネタ同士が刺さり合う
        pitchCM: 5.00,        // 貫の間隔
        grainRings: 18, grainSides: 16, grainVariants: 6,
        texNormal: 512, texOther: 256,
        netaTex: 512,
        sizeSd: 0.055, bend: 0.030, asym: 0.86,
        endPow: 2.7, endRound: 0.42, tipTaper: 0.13, sectionP: 2.05,

        // 粒間の暗がり
        aoFloor: 0.46,
        aoDepth: 0.26,
        aoDown: 0.42,         // 下を向いた粒の追加の暗さ
        aoStrength: 1.0,
        bodyBright: 0.88,     // 下地の明るさ（1.0 で米粒と同じ白さ）

        // 板
        boardLen: 24.0, boardWid: 13.0, boardHgt: 1.35, boardR: 1.1,
        boardTex: 1024,

        netaSegU: 56, netaSegV: 26,
        useSSAO: true,
        useDOF: true,
        dofRatio: 0.060,
        dofFStop: 2.4,

        // GUI / Inspector 対策
        // 【対策】GUI をポストプロセスから外すのに、以前はカメラを2台にして
        //         layerMask で分けていた。しかし activeCameras が2台あると
        //         scene.activeCamera が guiCam を指す瞬間ができ、Inspector の
        //         Physics Helper / ギズモ / 選択ハイライトが狂う。
        //         Layer.applyPostProcess = false なら、カメラ1台のまま
        //         GUI だけ Bloom / DOF の後に合成できる。既定はこちら。
        //         true にすると従来のカメラ分離（＋bindDebugCamera）に戻る
        guiOwnCamera: false
    };

    const START_NETA = "mix";     // "mix" / "akami" / "chutoro" / "otoro"
    const START_SEED = 20260806;

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;

    // 米粒の生成関数は「1つのcfgオブジェクト」を受け取る作りなので、
    // 酢飯ぶんの設定をここで1回だけ組み立てて使い回す
    function riceConfig(seed) {
        const cfg = Object.assign({}, GLOBAL, RICE);
        cfg.seed = seed >>> 0;
        return cfg;
    }

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
    // 6. NetaLab : まぐろの切り身のテクスチャ
    //    UV: u = 垂れの方向（切り身の長手）, v = 幅方向
    //    脂の筋は幅方向へ走り、長手方向に並ぶ
    // =================================================================
    const NetaLab = {
        _canvas: TextureLab._canvas,

        // 脂の筋のマスク。整数格子の線として置き、線ごとに強さを変える
        // 【対策】等間隔・等強度の縞にすると、木目のプリント生地になる。
        //         実物の筋は太さも濃さもばらばらで、途中で消える線がある。
        _fat(u, v, np, seed) {
            const warp = Noise.fbm2(u * 3.0 + 2, v * 3.0 + 7, 3, seed, 3) - 0.5;
            // 【対策】うねりを大きく取ると、線が寄り集まって太い帯になり、
            //         脂ではなく「白い絵の具の刷毛跡」に見える
            const q = u * np.fatCount + (v - 0.5) * 1.05 + warp * 0.70;
            const k = Math.round(q);
            const d = Math.abs(q - k);
            const amp = 0.30 + 0.70 * Noise._h2(k, 7, seed + 31);
            const w = np.fatWidth * (0.55 + 0.90 * Noise._h2(k, 19, seed + 53));
            // 線に沿って濃さが波打ち、ところどころ切れる
            const along = 0.35 + 0.65 * Noise.fbm2(v * 4.5 + k * 3.1, k * 1.7, 5, seed + 71, 2);
            let m = (1 - smooth(w, w * 3.2, d)) * amp * along;
            // 2本目の族（細く弱い）。大トロの網目はこの重なりでできる
            const q2 = u * np.fatCount * 1.9 - (v - 0.5) * 1.6 + warp * 0.8;
            const d2 = Math.abs(q2 - Math.round(q2));
            m += (1 - smooth(w * 0.7, w * 2.4, d2)) * 0.42
                * Noise._h2(Math.round(q2), 3, seed + 97);
            // 差し（細かい霜降りの点）
            const sp = Noise.fbm2(u * 26 + 5, v * 26 + 3, 26, seed + 131, 2);
            m += smooth(0.62, 0.86, sp) * np.sasu * 0.55;
            return clamp(m * np.fatStrength, 0, 1);
        },

        albedo(scene, S, np, seed) {
            return this._canvas("netaA", S, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N;
                        // 血合い寄りの濃い部分（低周波）
                        const deep = Noise.fbm2(u * 2.2 + 11, v * 2.2 + 4, 3, seed + 5, 3);
                        let r = mix(np.fleshDark[0], np.flesh[0], smooth(0.34, 0.72, deep));
                        let g = mix(np.fleshDark[1], np.flesh[1], smooth(0.34, 0.72, deep));
                        let b = mix(np.fleshDark[2], np.flesh[2], smooth(0.34, 0.72, deep));
                        // 繊維の筋（ごく細かい縞）。切り口の質感はここで決まる
                        const fib = Noise.fbm2(u * 90 + 1, v * 9 + 6, 90, seed + 211, 2) - 0.5;
                        const k = 1 + 0.10 * fib;
                        r *= k; g *= k; b *= k;
                        // 脂
                        const f = this._fat(u, v, np, seed);
                        r = mix(r, np.fat[0], f); g = mix(g, np.fat[1], f); b = mix(b, np.fat[2], f);
                        const i = (y * N + x) * 4;
                        d[i] = clamp(r, 0, 1) * 255;
                        d[i + 1] = clamp(g, 0, 1) * 255;
                        d[i + 2] = clamp(b, 0, 1) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        orm(scene, S, np, seed) {
            return this._canvas("netaO", S, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N;
                        const f = this._fat(u, v, np, seed);
                        const n = Noise.fbm2(u * 8 + 3, v * 8 + 9, 8, seed + 17, 2);
                        // 【対策】脂は肉より濡れて光る。ここを一様にすると、
                        //         霜降りが「白い塗料で描いた模様」になる
                        const rough = clamp(np.rough * (0.88 + 0.26 * n) - 0.16 * f, 0.06, 1);
                        const ao = clamp(0.97 - 0.06 * (1 - n), 0, 1);
                        const i = (y * N + x) * 4;
                        d[i] = ao * 255; d[i + 1] = rough * 255; d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        normal(scene, S, np, seed) {
            const h = new Float32Array(S * S);
            for (let y = 0; y < S; y++) {
                const v = y / S;
                for (let x = 0; x < S; x++) {
                    const u = x / S;
                    // 脂はわずかに盛り上がる。繊維の束は細かい畝
                    const f = this._fat(u, v, np, seed);
                    const fib = Noise.fbm2(u * 110 + 1, v * 11 + 6, 110, seed + 211, 2) - 0.5;
                    const fine = Noise.fbm2(u * 34 + 7, v * 34 + 2, 34, seed + 307, 2) - 0.5;
                    h[y * S + x] = clamp(0.5 + 0.26 * f + 0.20 * fib + 0.13 * fine, 0, 1);
                }
            }
            return TextureLab.normalMap(scene, S, h, 0.34);
        },

        // 厚み: 小口（縁）ほど薄い。逆光で縁が赤く抜けるのはここが効く
        thickness(scene, S, seed) {
            return this._canvas("netaT", S, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    const ev = smooth(0, 0.14, v) * (1 - smooth(0.86, 1, v));
                    for (let x = 0; x < N; x++) {
                        const u = x / N;
                        const eu = smooth(0, 0.06, u) * (1 - smooth(0.88, 1, u));
                        const n = Noise.fbm2(u * 5, v * 5, 5, seed + 61, 2);
                        const t = clamp(Math.pow(ev * eu, 0.7) * (0.84 + 0.26 * n), 0, 1);
                        const i = (y * N + x) * 4;
                        d[i] = t * 255; d[i + 1] = t * 255; d[i + 2] = t * 255; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        material(scene, np, key) {
            const S = GLOBAL.netaTex, seed = 7000 + key.length * 131;
            const pbr = new BABYLON.PBRMaterial("netaMat_" + key, scene);
            const texA = this.albedo(scene, S, np, seed);
            const texO = this.orm(scene, S, np, seed);
            const texN = this.normal(scene, S, np, seed);
            const texT = this.thickness(scene, S, seed);
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
            // 表面の水気。魚の切り身は「濡れた膜」であってニスではない
            pbr.clearCoat.isEnabled = true;
            pbr.clearCoat.intensity = np.coat;
            pbr.clearCoat.roughness = np.coatRough;
            if ("indexOfRefraction" in pbr.clearCoat) pbr.clearCoat.indexOfRefraction = 1.35;
            // 【対策】生の赤身は光をよく透かす。ここを切ると、
            //         どれだけ模様を描いても「赤く塗った消しゴム」になる
            const sub = pbr.subSurface;
            sub.isTranslucencyEnabled = true;
            sub.tintColor = col3(np.tint);
            sub.translucencyIntensity = clamp(np.translucency, 0, 0.95);
            sub.thicknessTexture = texT;
            if ("useGltfStyleTextures" in sub) sub.useGltfStyleTextures = false;
            sub.useMaskFromThicknessTexture = false;
            const T = np.thickMM * MM;
            sub.minimumThickness = T * 0.05;
            sub.maximumThickness = T * 1.1;
            sub.tintColorAtDistance = T * 1.4;
            sub.isRefractionEnabled = false;
            pbr.texs = [texA, texO, texN, texT];
            return pbr;
        }
    };

    // =================================================================
    // 7. Shari : 俵の形
    // =================================================================
    function shariYOffset(S) {
        return S.hgtCM * 0.5 * S.bottomFlat + 0.10 * Math.LN2;
    }

    function shariPoint(t, th, S, sd) {
        const L = S.lenCM, W = S.widCM, H = S.hgtCM;
        const u = clamp(t, 0, 1);
        const e = 1 - Math.pow(Math.abs(2 * u - 1), S.endPow);
        const pr = Math.pow(Math.max(0, e), S.endRound);
        const ct = Math.cos(th), st = Math.sin(th);
        // 【対策】断面を上下同じ超だ円にすると、俵ではなく浮き輪になる。
        //         接地側だけ指数を上げて角張らせ、天面は丸く残す
        const p = (st >= 0) ? S.sectionP : S.sectionP + S.sectionBottom;
        const ca = Math.abs(ct), sa = Math.abs(st);
        const rho = 1 / Math.pow(Math.pow(ca, p) + Math.pow(sa, p), 1 / p);
        let r = rho * pr;
        r *= 1 + S.handLump * (Noise.value3(ct * 1.9 + 11, st * 1.9 + 5, u * 3.1 + 3, sd) - 0.5) * 2;
        // 側面に残る指の跡
        r *= 1 - S.fingerDent * Math.exp(-Math.pow((u - 0.5) / 0.26, 2)) * Math.pow(ca, 3);
        const halfW = W * 0.5 * r, halfH = H * 0.5 * r;
        let y = H * 0.5 + halfH * st;
        y += S.topRidge * H * Math.exp(-Math.pow((th - Math.PI / 2) / 0.55, 2)) * pr;
        // 【対策】接地面を単純なクランプで潰すと、そこに折れ線ができる。
        //         下地に硬い稜が立ち、粒のすき間から「平らな板」として光る。
        //         ソフトプラスでなめらかに寄せる。
        const yb = H * 0.5 - H * 0.5 * pr * (1 - S.bottomFlat);
        const soft = 0.10;
        const dz = (y - yb) / soft;
        if (dz < 8) y = yb + soft * Math.log(1 + Math.exp(dz));
        // 【対策】接地面を bottomFlat ぶん切り上げているので、そのままだと
        //         俵が板から 3mm 浮く。切り上げたぶんを引いて座らせる
        return { x: L * (u - 0.5), y: y - shariYOffset(S), z: halfW * ct };
    }

    function shariNormal(t, th, S, sd) {
        const e1 = 0.005, e2 = 0.03;
        const a = shariPoint(t - e1, th, S, sd), b = shariPoint(t + e1, th, S, sd);
        const c = shariPoint(t, th - e2, S, sd), d = shariPoint(t, th + e2, S, sd);
        const Tx = b.x - a.x, Ty = b.y - a.y, Tz = b.z - a.z;
        const Bx = d.x - c.x, By = d.y - c.y, Bz = d.z - c.z;
        let nx = Ty * Bz - Tz * By, ny = Tz * Bx - Tx * Bz, nz = Tx * By - Ty * Bx;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        const p0 = shariPoint(t, th, S, sd);
        if (nx * p0.x + (ny) * (p0.y - S.hgtCM * 0.5) + nz * p0.z < 0) { nx = -nx; ny = -ny; nz = -nz; }
        return { x: nx, y: ny, z: nz };
    }

    // 粒のすき間から下が抜けないように、俵の形そのものを一回り小さく張る
    function buildShariBody(scene, S, sd, mat) {
        const NT = 52, NH = 44;
        const nV = (NT + 1) * (NH + 1);
        const positions = new Float32Array(nV * 3);
        const normals = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const colors = new Float32Array(nV * 4);
        const indices = new Uint32Array(NT * NH * 6);
        let vo = 0;
        for (let i = 0; i <= NT; i++) {
            const t = i / NT;
            for (let j = 0; j <= NH; j++) {
                const th = (j % NH) / NH * TAU;
                const p = shariPoint(t, th, S, sd), n = shariNormal(t, th, S, sd);
                const p3 = vo * 3, p2 = vo * 2, p4 = vo * 4;
                // 【対策】下地をなめらかな面のままにすると、粒のすき間から
                //         見えた瞬間に「中の素体」になる。実際にそこにあるのは
                //         押し合った米なので、粒と同じ大きさの凹凸を持たせる。
                const bp = (Noise.value3(p.x * 2.6 + 5, p.y * 2.6 + 9, p.z * 2.6 + 3, sd + 13) - 0.5) * 2 * 0.070
                    + (Noise.value3(p.x * 6.2 + 2, p.y * 6.2 + 4, p.z * 6.2 + 8, sd + 29) - 0.5) * 2 * 0.030;
                const off = 0.16 - bp;
                positions[p3] = p.x - n.x * off;
                positions[p3 + 1] = p.y - n.y * off;
                positions[p3 + 2] = p.z - n.z * off;
                uvs[p2] = j / NH * 4; uvs[p2 + 1] = t * 4;
                // 【対策】下地を暗くすると、すき間が「灰色の別の物体」として
                //         目立つ。米の白に寄せておくほうが、見えても
                //         「奥の米」として読める。全体の明るさはマテリアル側の
                //         albedoColor に出してあるので、GUIから調整できる。
                //         ここは向きによる濃淡だけを持たせる。
                const k = 0.74 + 0.26 * smooth(-0.6, 0.9, n.y);
                colors[p4] = k; colors[p4 + 1] = k * 0.985; colors[p4 + 2] = k * 0.93;
                colors[p4 + 3] = 1;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < NT; i++) {
            for (let j = 0; j < NH; j++) {
                const a = i * (NH + 1) + j, b = a + 1, c = a + (NH + 1), d = c + 1;
                indices[io++] = a; indices[io++] = c; indices[io++] = b;
                indices[io++] = b; indices[io++] = c; indices[io++] = d;
            }
        }
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        {
            // 胴の真横（θ=0, t=0.5）の法線は +Z を向くはず
            const pi = Math.round(NT * 0.5) * (NH + 1);
            if (normals[pi * 3 + 2] < 0) {
                for (let k = 0; k < indices.length; k += 3) {
                    const tmp = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = tmp;
                }
                BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            }
        }
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.normals = normals; vd.uvs = uvs;
        vd.colors = colors; vd.indices = indices;
        const mesh = new BABYLON.Mesh("shariBody", scene);
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.tris = NT * NH * 2;
        return mesh;
    }

    // 長さ方向の実面積の累積分布。ここから t を引けば、面積あたりの
    // 粒数がどこでも等しくなる。
    // 【対策】太さ prof(t) に比例して撒くと、俵の端だけ粒が 1/4 になる。
    //         端は「細る」より速く「面が寝る」ので、実面積は太さほど
    //         減らない。そこだけ下地が抜けて、中の素体が見える。
    function shariAreaCdf(S, sd) {
        const NB = 128, NA = 16;
        const cdf = new Float64Array(NB + 1);
        for (let i = 0; i < NB; i++) {
            const t = (i + 0.5) / NB;
            let a = 0;
            for (let j = 0; j < NA; j++) {
                const th = (j + 0.5) / NA * TAU;
                const p1 = shariPoint(t + 0.004, th, S, sd), p2 = shariPoint(t - 0.004, th, S, sd);
                const p3 = shariPoint(t, th + 0.05, S, sd), p4 = shariPoint(t, th - 0.05, S, sd);
                const Tx = p1.x - p2.x, Ty = p1.y - p2.y, Tz = p1.z - p2.z;
                const Bx = p3.x - p4.x, By = p3.y - p4.y, Bz = p3.z - p4.z;
                a += Math.hypot(Ty * Bz - Tz * By, Tz * Bx - Tx * Bz, Tx * By - Ty * Bx);
            }
            cdf[i + 1] = cdf[i] + a;
        }
        const tot = cdf[NB] || 1;
        for (let i = 0; i <= NB; i++) cdf[i] /= tot;
        return cdf;
    }

    function placeShariGrains(S, sd, rng) {
        const n = S.grainCount, out = [];
        const CS = Math.max(1, S.clusterSize | 0);
        const cdf = shariAreaCdf(S, sd), NB = cdf.length - 1;
        const sampleT = (u) => {
            let i = 0;
            while (i < NB && cdf[i + 1] < u) i++;
            const a = cdf[i], b = cdf[i + 1];
            const f = (b > a) ? (u - a) / (b - a) : 0.5;
            // 【対策】ここで 0.004 まででクランプすると、端に直径 5mm の
            //         粒が置けない円板が残る。極の直近まで置きにいく
            return clamp((i + f) / NB, 0.0006, 0.9994);
        };
        let tc = 0.5, thc = 0;
        for (let i = 0; i < n; i++) {
            if (i % CS === 0) {
                tc = sampleT(rng.next());
                thc = rng.range(0, TAU);
            }
            const t = clamp(tc + rng.gauss(0, 0.022), 0.008, 0.992);
            const th = thc + rng.gauss(0, 0.26);
            const p = shariPoint(t, th, S, sd), nn = shariNormal(t, th, S, sd);
            const g0 = S.grainSink[0], g1 = S.grainSink[1];
            const q = rng.next();
            let sink = (q < S.grainLiftRatio)
                ? -S.grainLift * (q / S.grainLiftRatio)
                : g0 + (g1 - g0) * Math.pow((q - S.grainLiftRatio) / (1 - S.grainLiftRatio), 1.9);
            // 【対策】天面はネタが乗って押さえられている場所。ここで粒を
            //         浮かせると、ネタを突き抜けた粒が生えているように見える
            if (nn.y > 0.45) sink = Math.max(sink, 0.012);
            // 【対策】底の粒を浮かせると板を突き抜ける。接地側も沈める側だけに
            if (nn.y < -0.45) sink = Math.max(sink, 0.020);
            out.push({
                x: p.x - nn.x * sink, y: p.y - nn.y * sink, z: p.z - nn.z * sink,
                nx: nn.x, ny: nn.y, nz: nn.z, res: -sink
            });
        }
        return out;
    }

    // 粒間の暗がり。茶碗版と同じ「近傍の最高点との差」だが、
    // 俵は高さ場ではないので格子を3次元に取る
    function bakeShariAO(pts, cfg) {
        const cell = 0.30, OFF = 512;
        const key = (i, j, k) => ((i + OFF) * 1021 + (j + OFF)) * 1021 + (k + OFF);
        const top = new Map();
        for (const p of pts) {
            const k = key(Math.floor(p.x / cell), Math.floor(p.y / cell), Math.floor(p.z / cell));
            const cur = top.get(k);
            if (cur === undefined || p.res > cur) top.set(k, p.res);
        }
        for (const p of pts) {
            const i0 = Math.floor(p.x / cell), j0 = Math.floor(p.y / cell), k0 = Math.floor(p.z / cell);
            let m = -1e9;
            for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
                const v = top.get(key(i0 + a, j0 + b, k0 + c));
                if (v !== undefined && v > m) m = v;
            }
            let ao = clamp(1 - (m - p.res) / cfg.aoDepth, 0, 1);
            ao = cfg.aoFloor + (1 - cfg.aoFloor) * Math.pow(ao, 0.75);
            // 【対策】俵は上も下も同じ形なので、これだけだと底が天面と同じ明るさに
            //         なって「宙に浮いた米の塊」に見える。下を向いた粒は暗くする
            ao *= 1 - cfg.aoDown * (1 - smooth(-0.95, 0.55, p.ny));
            p.ao = ao;
        }
        return pts;
    }

    function aoColor(ao, strength) {
        const v = clamp(1 - (1 - ao) * strength, 0.02, 1);
        const w = 1 - v;
        return new BABYLON.Color4(v * (1 + 0.10 * w), v * (1 - 0.02 * w), v * (1 - 0.30 * w), 1);
    }

    // =================================================================
    // 8. Neta : 垂れた切り身
    // =================================================================
    // 底面は「シャリの天面に沿い、前端を超えたら垂れ下がる」線
    function drapeBottom(x, S) {
        const L = S.lenCM, H = S.hgtCM;
        const t = clamp(x / L + 0.5, 0, 1);
        const e = 1 - Math.pow(Math.abs(2 * t - 1), S.endPow);
        const pr = Math.pow(Math.max(0, e), S.endRound);
        const top = H * 0.5 + H * 0.5 * pr + S.topRidge * H * pr - shariYOffset(S);
        const over = clamp((-x - L * 0.40) / (L * 0.32), 0, 1);
        const fall = Math.pow(over, 1.6) * (H * 0.55);
        return Math.max(0.055, top + DRAPE.gap - fall);
    }

    function buildNeta(scene, np, S, sd, mat) {
        const NU = GLOBAL.netaSegU, NV = GLOBAL.netaSegV;
        const L = S.lenCM;
        const x0 = DRAPE.backX * L, x1 = DRAPE.frontX * L;
        const halfW = np.widMM * MM * 0.5;
        const TH = np.thickMM * MM;

        // 中心線（底面）と、その2次元法線
        const cx = new Float64Array(NU + 1), cy = new Float64Array(NU + 1);
        const nx2 = new Float64Array(NU + 1), ny2 = new Float64Array(NU + 1);
        for (let i = 0; i <= NU; i++) {
            const s = i / NU;
            cx[i] = mix(x0, x1, s);
            cy[i] = drapeBottom(cx[i], S);
        }
        for (let i = 0; i <= NU; i++) {
            const a = Math.max(0, i - 1), b = Math.min(NU, i + 1);
            const tx = cx[b] - cx[a], ty = cy[b] - cy[a];
            const l = Math.hypot(tx, ty) || 1;
            nx2[i] = -ty / l; ny2[i] = tx / l;
            if (ny2[i] < 0) { nx2[i] = -nx2[i]; ny2[i] = -ny2[i]; }
        }

        const W = NV + 1, LAY = (NU + 1) * W;
        const nV = LAY * 2;
        const positions = new Float32Array(nV * 3);
        const normals = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = [];

        for (let i = 0; i <= NU; i++) {
            const s = i / NU;
            const wp = 1 - 0.11 * Math.pow(Math.abs(2 * s - 1), 3);
            const th = TH * mix(1, DRAPE.tipThin, smooth(0.62, 1.0, s))
                * mix(0.86, 1.0, smooth(0.0, 0.18, s));
            for (let j = 0; j <= NV; j++) {
                const w = j / NV * 2 - 1;
                const z = halfW * w * wp;
                // 幅方向の垂れ（縁が下がる）と、表面のうねり
                const curl = -DRAPE.curl * w * w;
                const wave = DRAPE.wave * (Noise.value3(s * 3.4 + 7, w * 1.9 + 2, 4.1, sd + 13) - 0.5) * 2;
                const bx = cx[i], by = cy[i] + curl + wave;
                const a = i * W + j, b = LAY + a;
                positions[a * 3] = bx; positions[a * 3 + 1] = by; positions[a * 3 + 2] = z;
                positions[b * 3] = bx + nx2[i] * th;
                positions[b * 3 + 1] = by + ny2[i] * th;
                positions[b * 3 + 2] = z;
                uvs[a * 2] = s; uvs[a * 2 + 1] = j / NV;
                uvs[b * 2] = s; uvs[b * 2 + 1] = j / NV;
            }
        }
        for (let i = 0; i < NU; i++) {
            for (let j = 0; j < NV; j++) {
                const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
                indices.push(a, c, b, b, c, d);                                  // 底面
                indices.push(LAY + a, LAY + b, LAY + c, LAY + b, LAY + d, LAY + c); // 上面
            }
        }
        // 小口（縁）を張って閉じる
        for (let i = 0; i < NU; i++) {
            const a0 = i * W, a1 = (i + 1) * W;
            indices.push(a0, LAY + a0, a1, a1, LAY + a0, LAY + a1);
            const b0 = i * W + NV, b1 = (i + 1) * W + NV;
            indices.push(b0, b1, LAY + b0, b1, LAY + b1, LAY + b0);
        }
        for (let j = 0; j < NV; j++) {
            const a0 = j, a1 = j + 1;
            indices.push(a0, a1, LAY + a0, a1, LAY + a1, LAY + a0);
            const c0 = NU * W + j, c1 = c0 + 1;
            indices.push(c0, LAY + c0, c1, c1, LAY + c0, LAY + c1);
        }
        const idx = new Uint32Array(indices);
        BABYLON.VertexData.ComputeNormals(positions, idx, normals);
        {
            // 峰の上面（s≒0.25 の中央）の法線は上を向くはず
            const pi = LAY + Math.round(NU * 0.25) * W + Math.round(NV * 0.5);
            if (normals[pi * 3 + 1] < 0) {
                for (let k = 0; k < idx.length; k += 3) {
                    const tmp = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = tmp;
                }
                BABYLON.VertexData.ComputeNormals(positions, idx, normals);
            }
        }
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.normals = normals; vd.uvs = uvs; vd.indices = idx;
        const mesh = new BABYLON.Mesh("neta", scene);
        vd.applyToMesh(mesh, false);
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.tris = idx.length / 3;
        return mesh;
    }

    // =================================================================
    // 9. Board : 檜の板 + 石の台
    // =================================================================
    function woodTexture(scene, size, pale, grain, dark, rings) {
        return TextureLab._canvas("hinoki", size, (d, S) => {
            for (let y = 0; y < S; y++) {
                const v = y / S;
                for (let x = 0; x < S; x++) {
                    const u = x / S;
                    const w = Noise.fbm2(u * 1.6, v * 11.0, 12, 21, 4);
                    const ring = 0.5 + 0.5 * Math.sin((w * 7 + v * 2.0) * Math.PI * 2);
                    const pore = Noise.fbm2(u * 70, v * 14, 70, 33, 2);
                    const k = Math.pow(ring, 2.1) * 0.80 + 0.20 * pore;
                    const kn = smooth(0.80, 0.96, Noise.fbm2(u * 3.2 + 5, v * 3.4 + 2, 4, 89, 3));
                    const i = (y * S + x) * 4;
                    d[i] = mix(mix(pale[0], grain[0], k), dark[0], kn * 0.5) * 255;
                    d[i + 1] = mix(mix(pale[1], grain[1], k), dark[1], kn * 0.5) * 255;
                    d[i + 2] = mix(mix(pale[2], grain[2], k), dark[2], kn * 0.5) * 255;
                    d[i + 3] = 255;
                }
            }
        }, scene);
    }

    // 角の丸い板。上面をわずかに面取りして、切り出した木口を見せる
    function buildBoard(scene, mat) {
        const A = GLOBAL.boardLen * 0.5, B = GLOBAL.boardWid * 0.5, H = GLOBAL.boardHgt;
        const M = 96, P = 7;
        const rho = (phi) => {
            const ca = Math.abs(Math.cos(phi)), sa = Math.abs(Math.sin(phi));
            return Math.pow(Math.pow(ca / A, P) + Math.pow(sa / B, P), -1 / P);
        };
        const rings = [
            { s: 0.965, y: 0.0 }, { s: 1.0, y: 0.10 },
            { s: 1.0, y: H - 0.12 }, { s: 0.972, y: H }
        ];
        const R = rings.length, W = M + 1;
        const nV = R * W + 2;
        const positions = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = [];
        const US = 1 / (A * 2.2), VS = 1 / (B * 2.2);
        for (let i = 0; i < R; i++) {
            for (let j = 0; j <= M; j++) {
                const phi = (j % M) / M * TAU;
                const r = rho(phi) * rings[i].s;
                const k = i * W + j;
                const px = r * Math.cos(phi), pz = r * Math.sin(phi);
                positions[k * 3] = px; positions[k * 3 + 1] = rings[i].y; positions[k * 3 + 2] = pz;
                uvs[k * 2] = px * US + 0.5; uvs[k * 2 + 1] = pz * VS + 0.5;
            }
        }
        const capT = R * W, capB = capT + 1;
        positions[capT * 3 + 1] = H; positions[capB * 3 + 1] = 0;
        uvs[capT * 2] = 0.5; uvs[capT * 2 + 1] = 0.5;
        uvs[capB * 2] = 0.5; uvs[capB * 2 + 1] = 0.5;
        for (let i = 0; i < R - 1; i++) for (let j = 0; j < M; j++) {
            const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
        const o = (R - 1) * W;
        for (let j = 0; j < M; j++) indices.push(capT, o + j, o + j + 1);
        for (let j = 0; j < M; j++) indices.push(capB, j + 1, j);
        const idx = new Uint32Array(indices);
        const normals = new Float32Array(nV * 3);
        BABYLON.VertexData.ComputeNormals(positions, idx, normals);
        if (normals[capT * 3 + 1] < 0) {
            for (let k = 0; k < idx.length; k += 3) {
                const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t;
            }
            BABYLON.VertexData.ComputeNormals(positions, idx, normals);
        }
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.normals = normals; vd.uvs = uvs; vd.indices = idx;
        const mesh = new BABYLON.Mesh("board", scene);
        vd.applyToMesh(mesh, false);
        mesh.material = mat;
        mesh.receiveShadows = true;
        return mesh;
    }

    // =================================================================
    // 10. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.022, 0.022, 0.024, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.66;

    const camera = new BABYLON.ArcRotateCamera("cam", -1.12, 1.10, 26, new V3(0, 1.7, 0), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 9;
    camera.minZ = 1.5;
    camera.maxZ = 240;
    camera.lowerRadiusLimit = 9;
    camera.upperRadiusLimit = 90;
    camera.upperBetaLimit = 1.50;
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.46, -0.90, 0.46).normalize(), scene);
    key.position = new V3(18, 32, -16);
    key.intensity = 2.7;
    key.diffuse = new BABYLON.Color3(1.0, 0.975, 0.938);
    key.autoUpdateExtends = false;
    key.orthoLeft = -20; key.orthoRight = 20;
    key.orthoBottom = -20; key.orthoTop = 20;
    key.shadowMinZ = 1; key.shadowMaxZ = 80;

    // 逆光。赤身が赤く抜けるかはこの光でしか判定できない
    const back = new BABYLON.DirectionalLight("back", new V3(0.40, -0.30, -1.0).normalize(), scene);
    back.intensity = 1.5;
    back.diffuse = new BABYLON.Color3(1.0, 0.93, 0.86);
    back.specular = new BABYLON.Color3(0.6, 0.6, 0.6);

    const fill = new BABYLON.HemisphericLight("fill", new V3(0, 1, 0), scene);
    fill.intensity = 0.12;

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.004;
    sg.normalBias = 0.012;
    sg.setDarkness(0.34);

    // 石の台
    const stoneTex = TextureLab._canvas("stone", 512, (d, S) => {
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const u = x / S, v = y / S;
            const n = Noise.fbm2(u * 9, v * 9, 9, 5, 4);
            const g = Noise.fbm2(u * 40, v * 40, 40, 71, 2);
            const k = 0.085 + 0.075 * n + 0.045 * (g - 0.5);
            const i = (y * S + x) * 4;
            d[i] = k * 255; d[i + 1] = k * 254; d[i + 2] = k * 252; d[i + 3] = 255;
        }
    }, scene);
    stoneTex.uScale = 4; stoneTex.vScale = 4;
    const ground = BABYLON.MeshBuilder.CreateGround("ground", { width: 200, height: 200 }, scene);
    const gm = new BABYLON.PBRMaterial("groundMat", scene);
    gm.albedoTexture = stoneTex;
    gm.albedoColor = new BABYLON.Color3(1, 1, 1);
    gm.metallic = 0.0;
    gm.roughness = 0.72;
    ground.material = gm;
    ground.receiveShadows = true;

    const woodTex = woodTexture(scene, GLOBAL.boardTex,
        [0.910, 0.828, 0.660], [0.800, 0.672, 0.470], [0.612, 0.470, 0.298], 7);
    const boardMat = new BABYLON.PBRMaterial("boardMat", scene);
    boardMat.albedoTexture = woodTex;
    boardMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    boardMat.metallic = 0.0;
    boardMat.roughness = 0.55;
    boardMat.clearCoat.isEnabled = true;
    boardMat.clearCoat.intensity = 0.18;
    boardMat.clearCoat.roughness = 0.36;
    const board = buildBoard(scene, boardMat);
    board.position.y = 0.0;
    sg.addShadowCaster(board, true);

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.10;
    ip.contrast = 1.26;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 2.5;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    // =================================================================
    //  組み立て
    // =================================================================
    let state = null;
    let riceAssets = null;
    const netaMatCache = {};
    let ssao = null;
    let onRebuilt = null;

    function getRiceAssets() {
        if (riceAssets) return riceAssets;
        const cfg = riceConfig(20260101);
        const a = new GrainAssets(scene, cfg);
        a.mat = a.makeMaterial("shariMat", 1);
        const bm = new BABYLON.PBRMaterial("shariBodyMat", scene);
        const ba = col3(RICE.albedo);
        bm.albedoColor = new BABYLON.Color3(ba.r * GLOBAL.bodyBright,
            ba.g * GLOBAL.bodyBright, ba.b * GLOBAL.bodyBright);
        bm.metallic = 0.0;
        bm.roughness = 0.85;
        bm.clearCoat.isEnabled = false;
        bm.subSurface.isTranslucencyEnabled = false;
        a.bodyMat = bm;
        a.mats.push(bm);
        riceAssets = a;
        return a;
    }
    function getNetaMat(k) {
        if (!netaMatCache[k]) netaMatCache[k] = NetaLab.material(scene, NETA[k], k);
        return netaMatCache[k];
    }

    function disposeAll(st) {
        if (!st) return;
        for (const pc of st.pieces) {
            const srcs = new Set(pc.variants);
            for (const nd of pc.nodes) if (!srcs.has(nd)) nd.dispose();
            for (const m of pc.variants) m.dispose();
            pc.body.dispose();
            pc.neta.dispose();
            pc.root.dispose();
        }
    }

    const ORDER = ["otoro", "chutoro", "akami"];

    function build(netaKey, seed) {
        if (state) { disposeAll(state); state = null; }
        const assets = getRiceAssets();
        const rcfg = riceConfig(seed);
        const pieces = [];
        const smap = sg.getShadowMap();
        if (smap && smap.renderList) smap.renderList.length = 0;
        sg.addShadowCaster(board, true);

        for (let i = 0; i < GLOBAL.pieces; i++) {
            const key = (netaKey === "mix") ? ORDER[i % ORDER.length] : netaKey;
            const np = NETA[key];
            const sd = (seed + i * 7919) >>> 0;
            const rng = new Rng((seed ^ (i * 2654435761)) >>> 0);

            const root = new BABYLON.TransformNode("piece" + i, scene);
            // 【対策】貫を長手方向に一直線で並べると、縦列駐車になる。
            //         実物の盛り付けは板に対して斜めに、少しずつずらして置く。
            //         斜めにするとネタの垂れが隣とぶつからず、間隔も詰められる
            const k = i - (GLOBAL.pieces - 1) / 2;
            root.position.set(k * GLOBAL.pitchCM, GLOBAL.boardHgt,
                k * -0.85 + rng.gauss(0, 0.10));
            root.rotation.y = -0.62 + rng.gauss(0, 0.06);

            const body = buildShariBody(scene, SHARI, sd, assets.bodyMat);
            body.parent = root;
            // 【対策】3貫とも "shariBody" のままだと、Inspector が拾った
            //   メッシュを別の貫へ引き当てる。Babylon の Node はコンストラクタで
            //   id = name を入れるので、name を変えただけでは id が元のまま残る。
            //   両方を一意にする
            body.name = "shariBody" + i;
            body.id = body.name;

            const variants = [];
            for (let vi = 0; vi < GLOBAL.grainVariants; vi++) {
                const m = makeMesh("g" + i + "_" + vi, scene, rcfg, (sd + vi * 1013) >>> 0,
                    GLOBAL.grainRings, GLOBAL.grainSides, assets.mat, 1, true);
                m.parent = root;
                variants.push(m);
            }
            const pts = bakeShariAO(placeShariGrains(SHARI, sd, rng), GLOBAL);
            const used = new Set();
            const nodes = [];
            const up = new V3(0, 1, 0);
            for (let k = 0; k < pts.length; k++) {
                const p = pts[k];
                const variant = variants[k % variants.length];
                let node;
                if (!used.has(variant)) { used.add(variant); node = variant; }
                else {
                    // 【対策】k は貫ごとに数え直すので、貫番号を入れないと
                    //   "gi0" が3貫ぶんできて id が重複する
                    node = variant.createInstance("gi" + i + "_" + k);
                    node.id = node.name;
                    node.parent = root;
                }
                node.position.set(p.x, p.y, p.z);
                const nrm = new V3(p.nx, p.ny, p.nz);
                const axis = V3.Cross(up, nrm);
                const len = axis.length();
                let q = (len < 1e-5)
                    ? BABYLON.Quaternion.Identity()
                    : BABYLON.Quaternion.RotationAxis(axis.scale(1 / len), Math.asin(clamp(len, -1, 1)));
                if (nrm.y < 0 && len < 1e-5) q = BABYLON.Quaternion.RotationAxis(new V3(1, 0, 0), Math.PI);
                const spin = BABYLON.Quaternion.RotationAxis(nrm, rng.range(0, TAU));
                let rv = new V3(rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1));
                if (rv.lengthSquared() < 1e-8) rv = new V3(1, 0, 0);
                rv.normalize();
                // 【対策】握って締めた米は、茶碗によそったものより粒がそろう。
                //         ここで大きく散らすと「握っていない」ように見える
                const loose = rng.next() < 0.22;
                const tilt = BABYLON.Quaternion.RotationAxis(rv, rng.gauss(0, loose ? 0.85 : 0.20));
                node.rotationQuaternion = tilt.multiply(spin.multiply(q));
                const broken = rng.next() < 0.14;
                node.scaling.set(broken ? rng.range(0.62, 0.80) : rng.range(0.92, 1.08),
                    rng.range(0.94, 1.06), rng.range(0.94, 1.06));
                node.instancedBuffers.color = aoColor(p.ao, GLOBAL.aoStrength);
                nodes.push(node);
            }

            const neta = buildNeta(scene, np, SHARI, sd, getNetaMat(key));
            neta.parent = root;
            // 【対策】ネタも3貫とも "neta" だった。いちばん選びたい部品なので、
            //   貫番号に加えてネタの種類も名前に入れておく
            neta.name = "neta" + i + "_" + key;
            neta.id = neta.name;

            // 【対策】900粒 x 3貫をシャドウマップにも描くと頂点数が倍になる。
            //         粒どうしの落ち影は擬似AOとSSAOで足りている。
            //         キャスターは俵の下地とネタだけでよい
            sg.addShadowCaster(body, false);
            sg.addShadowCaster(neta, false);

            pieces.push({ root, body, neta, variants, nodes, pts, key });
        }
        state = { pieces, netaKey, seed, assets };
        applyLive();
        if (onRebuilt) onRebuilt(state);
        const tri = state.pieces.reduce((a, p) =>
            a + p.nodes.length * p.variants[0].info.tris + p.body.tris + p.neta.tris, 0);
        console.log("[Sushi]", netaKey, "/", GLOBAL.pieces, "貫 / tris =", tri, "/ seed =", seed);
        return state;
    }

    const live = {
        ao: GLOBAL.aoStrength,
        bodyBright: GLOBAL.bodyBright,
        riceTrans: RICE.translucency,
        netaCoat: 1.0,
        netaTrans: 1.0
    };
    function applyLive() {
        if (!state) return;
        if (riceAssets && riceAssets.bodyMat) {
            const ba = col3(RICE.albedo), k = live.bodyBright;
            riceAssets.bodyMat.albedoColor = new BABYLON.Color3(ba.r * k, ba.g * k, ba.b * k);
        }
        for (const mat of state.assets.mats) {
            mat.subSurface.translucencyIntensity = clamp(live.riceTrans, 0, 0.95);
        }
        for (const k in netaMatCache) {
            const m = netaMatCache[k];
            m.clearCoat.intensity = NETA[k].coat * live.netaCoat;
            m.subSurface.translucencyIntensity = clamp(NETA[k].translucency * live.netaTrans, 0, 0.95);
        }
        for (const pc of state.pieces) {
            for (let i = 0; i < pc.nodes.length; i++) {
                pc.nodes[i].instancedBuffers.color = aoColor(pc.pts[i].ao, live.ao);
            }
        }
    }

    let curNeta = START_NETA, curSeed = START_SEED;
    build(curNeta, curSeed);

    if (GLOBAL.useSSAO) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        // 粒の幅に近づけると粒の輪郭が全部汚れる。大きい陰りだけ拾わせる
        ssao.radius = 1.20;
        ssao.totalStrength = 0.60;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 180;
        ssao.minZAspect = 0.25;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.92;
    dp.bloomWeight = 0.055;
    dp.bloomKernel = 44;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.20;
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
    // 【対策】カメラを2台にすると、Babylon の各機能が「activeCameras の末尾＝
    //   描画の基準カメラ」と見なす所で全部 guiCam を拾い、Inspector の
    //   デバッグ機能が壊れる（ヘッダの (b) を参照）。
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
        idle: "#2a1b1b", active: "#8f3a3a", edge: "#4a3636",
        text: "#f6ece8", sub: "#c3a9a3", accent: "#f0a894"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "248px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(18,12,11,0.84)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "16px";
    ui.addControl(card);
    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "216px"; panel.isVertical = true;
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
        s.color = COL.accent; s.background = "#3a2c2c"; s.borderColor = "transparent";
        s.onValueChangedObservable.add((v) => { lb.text = labelText + "  " + v.toFixed(2); onChange(v); });
        panel.addControl(s);
        return { label: lb, slider: s };
    }
    function addSpacer(h) {
        const r = new BABYLON.GUI.Rectangle();
        r.height = h || "8px"; r.thickness = 0; r.background = "";
        panel.addControl(r);
    }

    addLabel("NIGIRI SUSHI / 握り", 11, COL.sub, "18px");
    addLabel("ネタ", 13, COL.accent, "22px");

    const netaBtns = {};
    function highlight() {
        for (const k in netaBtns) netaBtns[k].background = (k === curNeta) ? COL.active : COL.idle;
    }
    function switchNeta(k) { curNeta = k; build(curNeta, curSeed); highlight(); }
    netaBtns["mix"] = addButton("n_mix", "三貫盛り", () => switchNeta("mix"));
    for (const k of Object.keys(NETA)) {
        netaBtns[k] = addButton("n_" + k, NETA[k].label, () => switchNeta(k));
    }
    highlight();

    addSpacer();
    addButton("reseed", "握り直す", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(curNeta, curSeed);
    });
    const backBtn = addButton("back", "逆光: ON", () => {
        back.setEnabled(!back.isEnabled());
        backBtn.textBlock.text = "逆光: " + (back.isEnabled() ? "ON" : "OFF");
        backBtn.background = back.isEnabled() ? COL.active : COL.idle;
    });
    backBtn.background = COL.active;
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        GLOBAL.useDOF = !GLOBAL.useDOF;
        dp.depthOfFieldEnabled = GLOBAL.useDOF;
        dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
        dofBtn.textBlock.text = "被写界深度: " + (GLOBAL.useDOF ? "ON" : "OFF");
    });
    dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
    const rotBtn = addButton("rot", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.09;
        rotBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });

    addSpacer();
    const sAO = addSlider("粒間の暗がり", 0, 1.6, live.ao, (v) => { live.ao = v; applyLive(); });
    const sBB = addSlider("下地の明るさ", 0, 1.2, live.bodyBright, (v) => { live.bodyBright = v; applyLive(); });
    const sNC = addSlider("ネタのつや ×", 0, 1.6, live.netaCoat, (v) => { live.netaCoat = v; applyLive(); });
    const sNT = addSlider("ネタの透光 ×", 0, 1.5, live.netaTrans, (v) => { live.netaTrans = v; applyLive(); });
    const sRT = addSlider("シャリの透光", 0, 0.95, live.riceTrans, (v) => { live.riceTrans = v; applyLive(); });
    addSlider("ぼけ量", 0.01, 0.16, GLOBAL.dofRatio, (v) => { GLOBAL.dofRatio = v; });
    addSlider("F値", 1.2, 11.0, GLOBAL.dofFStop, (v) => { dp.depthOfField.fStop = v; });

    const info = addLabel("", 12, COL.sub, "56px");
    onRebuilt = (st) => {
        sAO.slider.value = live.ao;
        sBB.slider.value = live.bodyBright;
        sNC.slider.value = live.netaCoat;
        sNT.slider.value = live.netaTrans;
        sRT.slider.value = live.riceTrans;
        const g = st.pieces.reduce((a, p) => a + p.nodes.length, 0);
        const tri = st.pieces.reduce((a, p) =>
            a + p.nodes.length * p.variants[0].info.tris + p.body.tris + p.neta.tris, 0);
        info.text = st.pieces.length + " 貫 / " + g + " 粒 / " + tri.toLocaleString() + " tri\n"
            + "シャリ: " + SHARI.lenCM.toFixed(1) + "×" + SHARI.widCM.toFixed(1)
            + "×" + SHARI.hgtCM.toFixed(1) + "cm\nseed: " + st.seed;
    };
    onRebuilt(state);

    scene.onDisposeObservable.add(() => {
        if (riceAssets) riceAssets.dispose();
        for (const k in netaMatCache) {
            const m = netaMatCache[k];
            if (m.texs) for (const t of m.texs) t.dispose();
            m.dispose(true, false);
        }
        stoneTex.dispose();
        woodTex.dispose();
    });

    return scene;
};

export default createScene;