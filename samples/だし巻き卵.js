// =====================================================================
//  Photoreal Tamagoyaki  /  写実的な玉子焼き（だし巻き・厚焼き・板前風）
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  実物の要点（ここを外すと「黄色い直方体」になる）:
//    ・玉子焼きは箱ではない。鍋の中で「巻いた」ものなので、
//      断面は渦（スパイラル）。同心円でも横縞でもない
//    ・渦の中心は断面の中心にない。巻き始めが下・手前に寄る
//    ・層と層の間には隙間が空く。丸い気泡ではなく、層に沿って
//      長く伸びた紡錘形の空洞。ここが断面の「らしさ」の八割
//    ・だし巻きは汁を含む。切り口は濡れて光り、空洞に汁が溜まる。
//      艶を消すと蒸しパンかカステラに見える
//    ・表面の平行な溝は焼き目ではなく巻きすの痕。軸に対して直角に走る
//    ・鍋に当たった面（底）だけが焼けている。上面はほとんど焼けていない
//    ・卵は光を通す。透過を切ると発泡スチロールの黄色になる
//    ・切り口は完全な平面ではない。柔らかいので包丁を抜いた後に少し膨らむ
//
//  ハウススタイルから引き継いだもの:
//    ・法線マップの V の符号は (yd - yu)。ただし成立条件は
//      「(dP/du, dP/dv, N) が右手系であること」。切り口（キャップ）は
//      放っておくと左手系になるので、-Z 側は u を反転して揃える
//    ・UV は必ず実寸（cm）比で切る。断面の周長 11cm を長さ 2.6cm と
//      同じピクセル数に押し込むと、肌理が一方向に伸びて樽に見える
//    ・角度等分ではなく弧長等分でリングを刻む。角丸長方形を角度で
//      刻むと、平らな辺だけ頂点が疎になって稜線がカクつく
//    ・影は ESM ではなく PCF + forceBackFacesOnly
//    ・テクスチャは焼き直さない。変種を数セットだけ焼いて使い回す
//    ・被写界深度の錯乱円は「1単位 = 1m」で計算される。ピントは radius×1000
// =====================================================================

var createScene = function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;

    // ---- 断面と巻きの型 ----------------------------------------------
    // a = 半幅(cm) / b = 半高(cm) / nBot,nTop = 角の立ち具合（大きいほど角張る）
    const PRESETS = {
        // 写真1相当。鍋で厚く焼いて 4 切れに。甘めで焼き色がややある
        atsuyaki: {
            label: "厚焼き玉子",
            sec: { a: 1.76, b: 1.54, nBot: 5.6, nTop: 3.1, taper: 0.07, wob: 0.022, coreY: -0.44 },
            pieceLen: 2.55, pieces: 4,
            stagger: 0.34, yaw: -0.30,        // 段違いに並べる（写真1の盛り付け）
            roll: { turns: 4.6, cx: 0.16, cy: -0.55, wobble: 0.34, voids: 30, streaks: 18 },
            makisu: 0.0,                      // 巻きすを使わない（鍋の形のまま）
            skin: {
                pale: [0.988, 0.862, 0.470], deep: [0.930, 0.700, 0.230],
                scorch: [0.815, 0.560, 0.215], char: [0.585, 0.345, 0.115],
                amount: 0.62, gloss: 0.52, panSide: 0.85
            },
            cut: {
                base: [0.972, 0.878, 0.615], pale: [0.982, 0.940, 0.815],
                line: [0.985, 0.930, 0.760], gap: [0.700, 0.548, 0.300], hole: [0.790, 0.665, 0.440],
                rim: [0.955, 0.790, 0.430], wet: 0.72
            },
            plate: "stripe", shiso: false, oroshi: true, soy: 0.0
        },
        // 写真3相当。淡くて汁気が多い。巻きすでしっかり形を付けてある
        dashimaki: {
            label: "だし巻き玉子",
            sec: { a: 2.06, b: 1.42, nBot: 6.2, nTop: 3.4, taper: 0.05, wob: 0.018, coreY: -0.42 },
            pieceLen: 4.30, pieces: 2,
            stagger: 0.10, yaw: -0.12,
            roll: { turns: 5.4, cx: 0.14, cy: -0.52, wobble: 0.38, voids: 36, streaks: 22 },
            makisu: 1.0,
            skin: {
                pale: [0.992, 0.898, 0.562], deep: [0.950, 0.762, 0.300],
                scorch: [0.870, 0.660, 0.315], char: [0.700, 0.470, 0.190],
                amount: 0.20, gloss: 0.86, panSide: 0.55
            },
            cut: {
                base: [0.978, 0.900, 0.655], pale: [0.988, 0.955, 0.855],
                line: [0.990, 0.945, 0.800], gap: [0.735, 0.588, 0.340], hole: [0.822, 0.706, 0.482],
                rim: [0.965, 0.840, 0.505], wet: 1.0
            },
            plate: "black", shiso: true, oroshi: true, soy: 0.55
        },
        // 写真2相当。太めに巻いて厚く二切れ。おろしにポン酢がかかっている
        itamae: {
            label: "板前風・厚切り",
            sec: { a: 2.26, b: 1.38, nBot: 6.6, nTop: 3.6, taper: 0.04, wob: 0.020, coreY: -0.40 },
            pieceLen: 5.20, pieces: 2,
            stagger: 0.06, yaw: -0.08,
            roll: { turns: 5.8, cx: 0.10, cy: -0.50, wobble: 0.42, voids: 38, streaks: 24 },
            makisu: 1.0,
            skin: {
                pale: [0.990, 0.880, 0.508], deep: [0.940, 0.730, 0.265],
                scorch: [0.845, 0.615, 0.265], char: [0.650, 0.420, 0.155],
                amount: 0.34, gloss: 0.78, panSide: 0.65
            },
            cut: {
                base: [0.968, 0.878, 0.605], pale: [0.982, 0.938, 0.808],
                line: [0.986, 0.928, 0.748], gap: [0.708, 0.556, 0.312], hole: [0.796, 0.672, 0.448],
                rim: [0.950, 0.795, 0.440], wet: 0.92
            },
            plate: "ruri", shiso: false, oroshi: true, soy: 0.80
        }
    };

    const GLOBAL = {
        // --- 分割
        segRound: 104,                        // 断面まわり（弧長等分）
        segLenPerCm: 26,                       // 長さ方向 1cm あたりのリング数
        capRings: 40,                          // 切り口の同心リング数
        // --- 巻きすの溝
        makisuPitch: 0.66,                     // 竹ひごの間隔(cm)
        makisuDepth: 0.042,                    // 溝の深さ(cm)
        // --- 切り口
        cutBulge: 0.055,                       // 切った後に膨らむ量(cm)
        edgeRound: 0.055,                      // 包丁の角の丸め(cm)。大きいと蒲鉾になる
        // --- テクスチャ
        skinTex: { w: 512, h: 256 },
        cutTex: 384,
        variants: 3,                           // 焼く枚数。隣の切れとは必ず変える
        // --- 描画
        useSSAO: true,
        showPlate: true,
        showTable: true
    };

    const START = { preset: "dashimaki", seed: 20260810, pieces: 0, oroshi: true, shiso: true, makisu: true };

    // =================================================================
    // 1. Rng / helpers
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
        gauss(mean, sd) {
            const u = Math.max(1e-9, this.next()), v = this.next();
            return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
        }
    }
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const frac = (x) => x - Math.floor(x);
    function hashStr(s) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
        return h >>> 0;
    }

    // =================================================================
    // 2. Noise
    // =================================================================
    const Noise = {
        _hash(x, y, seed) {
            let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177);
            return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
        },
        _value(x, y, period, seed) {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            const p = Math.max(1, period | 0);
            let x0 = xi % p; if (x0 < 0) x0 += p;
            let x1 = (xi + 1) % p; if (x1 < 0) x1 += p;
            const a = this._hash(x0, yi, seed), b = this._hash(x1, yi, seed);
            const c = this._hash(x0, yi + 1, seed), d = this._hash(x1, yi + 1, seed);
            return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
        },
        // x（＝周回する方向）だけ period で巻く。継ぎ目が出ないのはこのため
        fbm(x, y, basePeriod, seed, octaves) {
            let sum = 0, amp = 0.5, f = 1;
            for (let o = 0; o < octaves; o++) {
                sum += amp * this._value(x * f, y * f, basePeriod * f, seed + o * 131);
                f *= 2; amp *= 0.5;
            }
            return sum;
        }
    };

    // =================================================================
    // 3. Mesh : 三角形の巻き順を「焼いた法線」で確定する
    // =================================================================
    // 【対策】Babylon の VertexData.ComputeNormals は (v0-v1)×(v2-v1) を
    //         使う。これは右手系の外積と符号が逆。右手系のつもりで巻き順を
    //         導出すると全ての面の法線が内側を向き、背面カリングで手前の面が
    //         消えて、筒の内側と向こう側の切り口が見えることになる
    //         （＝玉子焼きの上に断面が浮いて見えた v1 の失敗）。
    //         規約を暗記して当てにいくのではなく、実際に焼いた法線が外を
    //         向いているかを測って、向いていなければ巻き直す。
    //         これなら Babylon 側の規約が変わっても壊れない。
    function finishMesh(name, positions, indices, uvs, colors, scene, ref) {
        const pos = (positions instanceof Float32Array) ? positions : new Float32Array(positions);
        let idx = Array.isArray(indices) ? indices : Array.from(indices);
        let nor = new Float32Array(pos.length);
        BABYLON.VertexData.ComputeNormals(pos, idx, nor);

        // 外向きかどうかの総和。閉じた形なら重心から、開いた面なら基準方向で測る
        let score = 0;
        if (ref && ref.dir) {
            for (let i = 0; i < nor.length; i += 3) {
                score += nor[i] * ref.dir[0] + nor[i + 1] * ref.dir[1] + nor[i + 2] * ref.dir[2];
            }
        } else {
            let cx = 0, cy = 0, cz = 0;
            if (ref && ref.center) { cx = ref.center[0]; cy = ref.center[1]; cz = ref.center[2]; }
            else {
                const n = pos.length / 3;
                for (let i = 0; i < pos.length; i += 3) { cx += pos[i]; cy += pos[i + 1]; cz += pos[i + 2]; }
                cx /= n; cy /= n; cz /= n;
            }
            for (let i = 0; i < pos.length; i += 3) {
                score += nor[i] * (pos[i] - cx) + nor[i + 1] * (pos[i + 1] - cy) + nor[i + 2] * (pos[i + 2] - cz);
            }
        }
        if (score < 0) {
            const f = new Array(idx.length);
            for (let t = 0; t < idx.length; t += 3) { f[t] = idx[t]; f[t + 1] = idx[t + 2]; f[t + 2] = idx[t + 1]; }
            idx = f;
            nor = new Float32Array(pos.length);
            BABYLON.VertexData.ComputeNormals(pos, idx, nor);
        }

        const mesh = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = pos;
        vd.indices = idx;
        vd.normals = nor;
        vd.uvs = (uvs instanceof Float32Array) ? uvs : new Float32Array(uvs);
        if (colors) vd.colors = (colors instanceof Float32Array) ? colors : new Float32Array(colors);
        vd.applyToMesh(mesh, false);
        return mesh;
    }

    // =================================================================
    // 4. Section : 断面の輪郭（角丸長方形）と弧長等分
    // =================================================================
    // 【対策】断面をただの角丸長方形にすると型で抜いた寒天になる。
    //         底は鍋に押しつけられて平ら、上は自由表面で丸い。
    //         指数 n を上下で変えて、同じ一本の式のまま非対称にする
    //
    // k は「外形にどれだけ近いか」（1 = 外形 / 0 = 巻きの芯）。
    // 【対策】外形と同じ角丸長方形を相似に縮めて層にすると、芯まで四角い
    //         等高線が並んで迷路の地図になる。実物の芯は小さく丸い。
    //         n と横幅を k で寄せて、外へ行くほど角が立つようにする
    function shapeR(phi, k, S) {
        const c = Math.cos(phi), s = Math.sin(phi);
        const up = 0.5 + 0.5 * s;                       // 1 が真上
        const n = mix(2.15, mix(S.nBot, S.nTop, up), k);
        const a = S.a * (1 - S.taper * up) * mix(0.78, 1.0, k);
        const b = S.b * mix(0.90, 1.0, k);
        const q = Math.pow(Math.abs(c / a), n) + Math.pow(Math.abs(s / b), n);
        let r = Math.pow(q, -1 / n);
        // 手で巻いたぶんの低周波のゆがみ（外形にだけ効かせる）
        r *= 1 + (Noise.fbm(phi / TAU * 6, 0.37, 6, S.seed | 0, 2) - 0.5) * S.wob * k;
        return r;
    }
    function outlineR(phi, S) { return shapeR(phi, 1, S); }

    // (X,Y) が何番目の等値形状に乗るか。形が t に依存するので
    // 閉じた式では解けない。自己無撞着に4回だけ回して十分収束する
    function rollT(X, Y, S) {
        let t = Math.hypot(X, Y) / outlineR(Math.atan2(Y, X), S);
        for (let it = 0; it < 4; it++) {
            const k = smooth(0.10, 0.88, clamp(t, 0, 1.3));
            const Yc = Y - S.coreY * (1 - k);           // 芯は下に沈む
            t = Math.hypot(X, Yc) / shapeR(Math.atan2(Yc, X), k, S);
        }
        return t;
    }

    // 弧長等分した phi の配列（長さ M、0..2π）
    // 【対策】角度等分だと平らな辺が疎になって、シルエットに折れ線が出る
    function arcParam(S, M) {
        const K = 2048;
        const cum = new Float64Array(K + 1);
        let x0 = outlineR(0, S), y0 = 0;
        for (let i = 1; i <= K; i++) {
            const ph = i / K * TAU, r = outlineR(ph, S);
            const x = Math.cos(ph) * r, y = Math.sin(ph) * r;
            cum[i] = cum[i - 1] + Math.hypot(x - x0, y - y0);
            x0 = x; y0 = y;
        }
        const total = cum[K];
        const phis = new Float64Array(M);
        let k = 0;
        for (let j = 0; j < M; j++) {
            const target = total * j / M;
            while (k < K && cum[k + 1] < target) k++;
            const seg = cum[k + 1] - cum[k];
            const f = seg > 1e-12 ? (target - cum[k]) / seg : 0;
            phis[j] = (k + f) / K * TAU;
        }
        return { phis, perimeter: total };
    }

    // =================================================================
    // 4. Roll : 巻きの場（断面のスパイラル）
    // =================================================================
    // g の整数境界が「層と層の境目」。frac(g) が層の中の位置。
    // 分岐（a が 1→0 に戻る所）で g はちょうど 1 だけ跳ぶので frac(g) は連続する。
    // 【対策】層を同心円にすると、バウムクーヘンかロールケーキになる。
    //         玉子焼きは一枚を巻き足していくので、必ず一本の渦でなければならない
    function gAt(a, t, L) {
        const te = Math.max(t, 0.05);
        let g = L.turns * te - a;
        // 【対策】乱れが一種類だと、ゆるく波打った等高線のままになる。
        //         大きな蛇行（巻きのずれ）と細かい寄れ（生地の伸び）は別物。
        //         両方入れて初めて、層が所々で潰れたり合流したりする
        g += (Noise.fbm(a * 3, te * 2.2, 3, L.seed, 2) - 0.5) * L.wobble * 1.15 * (0.30 + 0.95 * te);
        g += (Noise.fbm(a * 11, te * 8.0, 11, L.seed + 17, 3) - 0.5) * L.wobble * 0.60 * (0.20 + 1.00 * te);
        // 【対策】層の厚みが全部同じだと玉ねぎの輪切りになる。実物は
        //         最初の一巻きが厚く、後になるほど薄い。半径だけの関数に
        //         しておけば、層をまたいでも矛盾せずに厚みが変わる
        g += L.turns * (Noise.fbm(te * 3.2 + 0.5, 0.31, 4096, L.seed + 53, 2) - 0.5) * 0.085;
        return g;
    }

    // 層に沿って伸びる空洞／白身の筋。(a, t) 空間の楕円は
    // 実空間では層に沿った紡錘形になる。これが玉子焼きの断面の顔
    function makeBlobs(rng, L, n, opt) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const t0 = clamp(Math.pow(rng.next(), opt.tBias) * 0.94 + 0.04, 0.05, 0.96);
            const a0 = rng.next();
            const b = {
                a0, t0,
                aa: rng.range(opt.aMin, opt.aMax),
                ag: rng.range(opt.gMin, opt.gMax),
                k: rng.range(0.55, 1.0),
                seed: 3000 + i * 61
            };
            // 【対策】空洞を層の内側にぽつんと置くと、気泡の入ったカステラになる。
            //         隙間は必ず層と層の「境目」に沿って開く。境界へ吸着させる
            b.g0 = Math.round(gAt(a0, t0, L)) + rng.gauss(0, 0.09);
            out.push(b);
        }
        return out;
    }
    function blobAt(a, t, g, blobs) {
        let m = 0;
        for (const b of blobs) {
            // 【対策】g は渦の継ぎ目（a が 1→0 に戻る半直線）でちょうど 1 だけ跳ぶ。
            //         frac(g) は連続だが絶対値は連続しない。空洞を絶対 g で測ると、
            //         継ぎ目をまたいだ空洞がそこでスパッと切れて、断面に
            //         定規で引いたような矩形の段が出る（v1 の失敗）。
            //         角度を巻き戻したぶんだけ g も 1 ずらして比べる
            let da = a - b.a0, adj = 0;
            if (da > 0.5) { da -= 1; adj = 1; }
            else if (da < -0.5) { da += 1; adj = -1; }
            const dx = da / b.aa, dy = (g - b.g0 + adj) / b.ag;
            let d = Math.hypot(dx, dy);
            if (d >= 1.7) continue;
            // 【対策】きれいな楕円のままだと「描いた楕円」に見える。
            //         輪郭をノイズで崩す。崩しすぎると外周だけ三日月に残る
            d *= 0.80 + 0.38 * Noise.fbm(a * 13, t * 9, 13, b.seed, 2);
            if (d >= 1) continue;
            // 【対策】中心から外へだらだら落ちる減衰にすると、30個ぶんが
            //         重なって「もやっとした茶色い雲」になる。隙間には
            //         はっきりした中と縁がある。中央を平らにして裾で切る
            m = Math.max(m, smooth(1.0, 0.42, d) * b.k);
        }
        return clamp(m, 0, 1);
    }

    // =================================================================
    // 5. TextureLab
    // =================================================================
    const TextureLab = {
        canvas(name, w, h, fill, scene) {
            const dt = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(w, h);
            fill(img.data, w, h);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = false;
            dt.anisotropicFilteringLevel = 16;
            return dt;
        },

        // 高さ場（cm）から法線を焼く。
        // 【対策】ny は (yd - yu)。ただし成立条件は (dP/du, dP/dv, N) が右手系
        //         であること。勾配は必ず実寸(cm)で割る。ピクセルの縦横比が
        //         違うテクスチャで割らずに焼くと、凹凸が一方向だけ強く出る
        normalFrom(name, h, w, ht, dxCm, dyCm, level, wrapX, scene) {
            return this.canvas(name, w, ht, (d, W, H) => {
                const sx = level / (2 * dxCm), sy = level / (2 * dyCm);
                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        const xlI = wrapX ? ((x - 1 + W) % W) : Math.max(0, x - 1);
                        const xrI = wrapX ? ((x + 1) % W) : Math.min(W - 1, x + 1);
                        const xl = h[y * W + xlI], xr = h[y * W + xrI];
                        const yu = h[Math.max(0, y - 1) * W + x], yd = h[Math.min(H - 1, y + 1) * W + x];
                        let nx = (xl - xr) * sx, ny = (yd - yu) * sy, nz = 1;
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const i = (y * W + x) * 4;
                        d[i] = (nx * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // 円形の細かい気泡（蒸気の抜けた跡）
        pores(w, h, seed, density, radMin, radMax) {
            const m = new Float32Array(w * h);
            const r = new Rng(seed);
            const n = Math.round(w * h * density);
            for (let k = 0; k < n; k++) {
                const cx = r.next() * w, cy = r.next() * h;
                const rad = Math.max(0.8, r.range(radMin, radMax) * Math.min(w, h));
                const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(h - 1, Math.ceil(cy + rad));
                for (let y = y0; y <= y1; y++) {
                    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
                        const d = Math.hypot((x - cx) / rad, (y - cy) / rad);
                        if (d >= 1) continue;
                        const xw = ((x % w) + w) % w;
                        const wgt = Math.pow(1 - d, 0.9);
                        const i = y * w + xw;
                        if (wgt > m[i]) m[i] = wgt;
                    }
                }
            }
            return m;
        }
    };

    // =================================================================
    // 6. SkinField / CutField : 変種ごとに一度だけ計算する場
    // =================================================================
    // ---- 外側の皮 -------------------------------------------------------
    class SkinField {
        constructor(cfg, seed) {
            const W = GLOBAL.skinTex.w, H = GLOBAL.skinTex.h;
            const S = Object.assign({ seed: seed & 0xffff }, cfg.sec);
            const ap = arcParam(S, 1024);
            this.W = W; this.H = H;
            this.perimeter = ap.perimeter;
            this.length = cfg.pieceLen;
            this.seed = seed % 50000;
            // 列ごとの姿勢（真上=1 / 真下=0）を先に引いておく
            this.up = new Float32Array(W);
            this.phi = new Float32Array(W);
            for (let x = 0; x < W; x++) {
                const j = Math.floor(x / W * 1024);
                const ph = ap.phis[j];
                this.phi[x] = ph;
                this.up[x] = 0.5 + 0.5 * Math.sin(ph);
            }
            const rng = new Rng(seed ^ 0x51ab);
            this.seamU = rng.range(0.10, 0.34);      // 巻き終わりの継ぎ目（上面寄り）
            this.pore = TextureLab.pores(W, H, seed ^ 0x2f31, 0.0055, 0.0025, 0.0090);
        }
        // 巻きすの溝（軸に直角に走る）。0..1
        makisu(zc, amount) {
            if (amount <= 0) return 0;
            const p = GLOBAL.makisuPitch;
            const f = frac(zc / p);
            const d = Math.min(f, 1 - f) * 2;         // 0=溝の中心
            return smooth(0.55, 0.0, d) * amount;
        }
    }

    // ---- 切り口 ---------------------------------------------------------
    class CutField {
        constructor(cfg, seed) {
            const S = Object.assign({ seed: seed & 0xffff }, cfg.sec);
            const L = Object.assign({ seed: seed % 40000 }, cfg.roll);
            const a2 = S.a * 1.02, b2 = S.b * 1.02;   // わずかに余白を取る
            // 【対策】正方形のテクスチャに 4.1×2.8cm の断面を押し込むと、
            //         肌理も気泡も横に 1.45 倍だけ伸びる。実寸比で切る
            const W = GLOBAL.cutTex;
            const H = Math.max(64, Math.round(W * b2 / a2 / 4) * 4);
            this.W = W; this.H = H; this.S = S; this.L = L;
            this.halfW = a2; this.halfH = b2;

            const rng = new Rng(seed ^ 0x77c1);
            const voids = makeBlobs(rng, L, cfg.roll.voids,
                { tBias: 0.72, aMin: 0.040, aMax: 0.125, gMin: 0.11, gMax: 0.32 });
            const streaks = makeBlobs(rng, L, cfg.roll.streaks,
                { tBias: 0.85, aMin: 0.050, aMax: 0.180, gMin: 0.08, gMax: 0.22 });

            this.t = new Float32Array(W * H);
            this.g = new Float32Array(W * H);
            this.hole = new Float32Array(W * H);
            this.streak = new Float32Array(W * H);
            this.lineK = new Float32Array(W * H);
            for (let y = 0; y < H; y++) {
                // v は下から上（右手系を保つため）。画像は上下逆に焼かれる
                const Y = ((y + 0.5) / H - 0.5) * 2 * b2;
                for (let x = 0; x < W; x++) {
                    const X = ((x + 0.5) / W - 0.5) * 2 * a2;
                    const i = y * W + x;
                    const t = rollT(X, Y, S);
                    let a = Math.atan2(Y - L.cy, X - L.cx) / TAU; a = a - Math.floor(a);
                    const g = gAt(a, t, L);
                    this.t[i] = t; this.g[i] = g;
                    if (t > 1.06) continue;           // 外は計算しない
                    this.hole[i] = blobAt(a, t, g, voids);
                    this.streak[i] = blobAt(a, t, g, streaks);
                    // 【対策】層の境目を全周同じ濃さで引くと、印刷した等高線に
                    //         見える。実物は途中で消えたり急に濃くなったりする
                    this.lineK[i] = clamp(-0.10 + 1.60 * Noise.fbm(a * 7, t * 5, 7, L.seed + 29, 3), 0, 1);
                }
            }
            this.pore = TextureLab.pores(W, H, seed ^ 0x9d13, 0.0080, 0.0022, 0.0062);
            this.seed = seed % 50000;
        }
        // 層の境目までの距離（t 単位。断面の半径を 1 とした量）
        lineDist(i) {
            const f = frac(this.g[i]);
            return Math.min(f, 1 - f) / this.L.turns;
        }
        // 層の境目の強さ（0..1）。ORM と法線はこちらを使う
        line(i) {
            return smooth(0.016, 0.0, this.lineDist(i)) * smooth(0.03, 0.13, this.t[i]) * this.lineK[i];
        }
    }

    // =================================================================
    // 7. Maps : 場からテクスチャを焼く
    // =================================================================
    const Bake = {
        skinAlbedo(scene, cfg, F) {
            const K = cfg.skin;
            const C = F.perimeter, Lz = F.length;
            const P1 = Math.max(2, Math.round(C / 1.6)), P2 = Math.max(2, Math.round(C / 0.55));
            return TextureLab.canvas("eggSkinAlb", F.W, F.H, (d, W, H) => {
                for (let y = 0; y < H; y++) {
                    const v = y / H, zc = v * Lz;
                    for (let x = 0; x < W; x++) {
                        const u = x / W, i = (y * W + x) * 4;
                        const up = F.up[x];
                        // 卵液の濃淡。溶き残しが薄い雲になって残る
                        // 卵液の濃淡。大きな雲と細かいむらの二層。
                        // 【対策】低周波だけだと、グラデーションを掛けた樹脂になる
                        const mot = Noise.fbm(u * P1, zc / 1.6, P1, F.seed + 3, 3)
                            + (Noise.fbm(u * P2, zc / 0.55, P2, F.seed + 33, 2) - 0.5) * 0.45;
                        const kk = clamp(0.26 + 0.66 * up + (mot - 0.5) * 0.62, 0, 1);
                        let cr = mix(K.deep[0], K.pale[0], kk);
                        let cg = mix(K.deep[1], K.pale[1], kk);
                        let cb = mix(K.deep[2], K.pale[2], kk);
                        // 焼き色。鍋に当たった面（下）だけに斑で出る。
                        // 【対策】全周に均一に乗せると、色を塗った樹脂に見える
                        const pan = mix(1.0, 0.10, smooth(0.35, 0.92, up));
                        const bn = Noise.fbm(u * P1 * 0.7, zc / 2.2, Math.max(2, Math.round(P1 * 0.7)), F.seed + 21, 3);
                        let sc = smooth(0.46, 0.80, bn) * K.amount * mix(K.panSide, 1.0, 1 - up);
                        sc = clamp(sc * pan, 0, 1);
                        cr = mix(cr, K.scorch[0], sc); cg = mix(cg, K.scorch[1], sc); cb = mix(cb, K.scorch[2], sc);
                        const ch = smooth(0.72, 0.92, bn) * K.amount * pan;
                        cr = mix(cr, K.char[0], ch); cg = mix(cg, K.char[1], ch); cb = mix(cb, K.char[2], ch);
                        // 巻き終わりの継ぎ目。細い折れ線が軸方向に一本走る
                        let du = Math.abs(u - F.seamU); du = Math.min(du, 1 - du);
                        // 【対策】継ぎ目を濃い一本線で描くと、鉛筆で引いた線に見える。
                        //         実物は生地が重なった段差なので、影はごく薄い
                        const seam = smooth(0.008, 0.0, du) * (0.5 + 0.5 * Noise.fbm(u * 4, zc / 0.9, 4, F.seed + 41, 2));
                        cr = mix(cr, cr * 0.945, seam); cg = mix(cg, cg * 0.935, seam); cb = mix(cb, cb * 0.915, seam);
                        // 気泡の跡はごく淡く黄が抜ける
                        const po = F.pore[y * W + x];
                        const fine = Noise.fbm(u * P2, zc / 0.55, P2, F.seed + 61, 2);
                        const k = po * 0.30 + (fine - 0.5) * 0.10;
                        cr = clamp(cr + k * 0.05, 0, 1); cg = clamp(cg + k * 0.05, 0, 1); cb = clamp(cb + k * 0.09, 0, 1);
                        d[i] = cr * 255; d[i + 1] = cg * 255; d[i + 2] = cb * 255; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        skinOrm(scene, cfg, F, makisuAmt) {
            const K = cfg.skin;
            const C = F.perimeter, Lz = F.length;
            const P1 = Math.max(2, Math.round(C / 1.6));
            return TextureLab.canvas("eggSkinOrm", F.W, F.H, (d, W, H) => {
                for (let y = 0; y < H; y++) {
                    const v = y / H, zc = v * Lz;
                    for (let x = 0; x < W; x++) {
                        const u = x / W, i = (y * W + x) * 4;
                        const up = F.up[x];
                        const bn = Noise.fbm(u * P1 * 0.7, zc / 2.2, Math.max(2, Math.round(P1 * 0.7)), F.seed + 21, 3);
                        const sc = smooth(0.46, 0.80, bn) * K.amount * mix(1.0, 0.10, smooth(0.35, 0.92, up));
                        // だし巻きは汁で濡れている。焼けた所だけ乾いて粗い
                        let rough = mix(0.44, 0.20, K.gloss);
                        rough = mix(rough, 0.56, sc);
                        rough += 0.06 * (Noise.fbm(u * P1 * 2, zc / 0.8, P1 * 2, F.seed + 71, 2) - 0.5);
                        // 溝の底と気泡は暗く落ちる
                        const mk = F.makisu(zc, makisuAmt);
                        let ao = 1.0;
                        ao = mix(ao, 0.86, mk * (0.35 + 0.65 * up));
                        ao = mix(ao, 0.70, smooth(0.30, 0.95, F.pore[y * W + x]));
                        let du = Math.abs(u - F.seamU); du = Math.min(du, 1 - du);
                        ao = mix(ao, 0.84, smooth(0.010, 0.0, du));
                        d[i] = clamp(ao, 0, 1) * 255;
                        d[i + 1] = clamp(rough, 0.05, 1) * 255;
                        d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        skinNormal(scene, cfg, F) {
            const W = F.W, H = F.H, C = F.perimeter, Lz = F.length;
            const P1 = Math.max(2, Math.round(C / 1.1)), P2 = Math.max(2, Math.round(C / 0.35));
            const h = new Float32Array(W * H);
            for (let y = 0; y < H; y++) {
                const v = y / H, zc = v * Lz;
                for (let x = 0; x < W; x++) {
                    const u = x / W;
                    // 巻いた時に寄る皺。周方向に長く、軸方向に短い
                    const wrinkle = (Noise.fbm(u * P1, zc / 1.1, P1, F.seed + 83, 3) - 0.5) * 0.013;
                    const micro = (Noise.fbm(u * P2, zc / 0.35, P2, F.seed + 97, 2) - 0.5) * 0.0045;
                    let du = Math.abs(u - F.seamU); du = Math.min(du, 1 - du);
                    const seam = -smooth(0.010, 0.0, du) * 0.020;
                    h[y * W + x] = wrinkle + micro + seam - F.pore[y * W + x] * 0.011;
                }
            }
            return TextureLab.normalFrom("eggSkinNrm", h, W, H, C / W, Lz / H, 1.0, true, scene);
        },

        cutAlbedo(scene, cfg, F) {
            const K = cfg.cut;
            const fx = 2 * F.halfW / 0.9, fy = 2 * F.halfH / 0.9;   // 肌理 ≒ 9mm
            return TextureLab.canvas("eggCutAlb", F.W, F.H, (d, W, H) => {
                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        const i = y * W + x, o = i * 4;
                        const t = F.t[i];
                        // 地。中心ほどわずかに淡い（火の通りが緩い）
                        let cr = mix(K.pale[0], K.base[0], smooth(0.05, 0.75, t));
                        let cg = mix(K.pale[1], K.base[1], smooth(0.05, 0.75, t));
                        let cb = mix(K.pale[2], K.base[2], smooth(0.05, 0.75, t));
                        // 溶き残しの白身。層に沿って白く伸びる
                        const st = F.streak[i] * 0.45;
                        cr = mix(cr, K.pale[0], st); cg = mix(cg, K.pale[1], st); cb = mix(cb, K.pale[2], st);
                        // ざらつき
                        const gr = (Noise.fbm(x / W * fx, y / H * fy, Math.max(2, Math.round(fx)), F.seed + 11, 3) - 0.5)
                            + (Noise.fbm(x / W * fx * 3.5, y / H * fy * 3.5, Math.max(2, Math.round(fx * 3.5)), F.seed + 13, 2) - 0.5) * 0.7;
                        cr = clamp(cr + gr * 0.060, 0, 1); cg = clamp(cg + gr * 0.056, 0, 1); cb = clamp(cb + gr * 0.072, 0, 1);
                        // 層の境目。
                        // 【対策】境目を白い線一本で描くと、地色も白っぽいので
                        //         コントラストが立たず消える。実物は「隙間の影
                        //         （細い暗線）」と「その両側の膜（白い縁）」の
                        //         二層。暗線が無いと層が層に見えない
                        const lk = F.lineK[i] * smooth(0.03, 0.13, F.t[i]);
                        const dl = F.lineDist(i);
                        // 【対策】暈しを層幅の 1/4 も広げると、境目ではなく
                        //         「帯」になってソフトクリームの渦に見える。
                        //         暈しは細く、実体は暗い一本線のほうに持たせる
                        const halo = smooth(0.011, 0.002, dl) * lk;
                        const gapK = smooth(0.0070, 0.0, dl) * lk;
                        cr = mix(cr, K.line[0], halo * 0.34); cg = mix(cg, K.line[1], halo * 0.34); cb = mix(cb, K.line[2], halo * 0.34);
                        cr = mix(cr, K.gap[0], gapK * 0.92); cg = mix(cg, K.gap[1], gapK * 0.92); cb = mix(cb, K.gap[2], gapK * 0.92);
                        // 空洞。奥は暗い。縁は照り返しで明るい
                        const ho = F.hole[i];
                        const core = smooth(0.20, 0.72, ho);
                        const rimK = smooth(0.05, 0.22, ho) * (1 - core);
                        cr = mix(cr, K.hole[0], core * 0.95); cg = mix(cg, K.hole[1], core * 0.95); cb = mix(cb, K.hole[2], core * 0.95);
                        cr = mix(cr, K.pale[0], rimK * 0.42); cg = mix(cg, K.pale[1], rimK * 0.42); cb = mix(cb, K.pale[2], rimK * 0.42);
                        // 外周 1mm ほどは締まって色が濃い（外側の焼けた膜）
                        const rim = smooth(0.90, 1.00, t);
                        cr = mix(cr, K.rim[0], rim); cg = mix(cg, K.rim[1], rim); cb = mix(cb, K.rim[2], rim);
                        // 細かい気泡
                        const po = F.pore[i];
                        cr = clamp(cr - po * 0.06, 0, 1); cg = clamp(cg - po * 0.055, 0, 1); cb = clamp(cb - po * 0.035, 0, 1);
                        d[o] = cr * 255; d[o + 1] = cg * 255; d[o + 2] = cb * 255; d[o + 3] = 255;
                    }
                }
            }, scene);
        },

        cutOrm(scene, cfg, F) {
            const K = cfg.cut;
            const fx = 2 * F.halfW / 1.0;
            return TextureLab.canvas("eggCutOrm", F.W, F.H, (d, W, H) => {
                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        const i = y * W + x, o = i * 4;
                        const t = F.t[i], ho = F.hole[i], ln = F.line(i);
                        // 【対策】切り口を粗いままにするとカステラになる。
                        //         だし巻きは汁で濡れている。空洞の底はさらに濡れる
                        let rough = mix(0.44, 0.22, K.wet);
                        rough = mix(rough, mix(0.30, 0.13, K.wet), smooth(0.06, 0.55, ho));
                        rough = mix(rough, 0.46, smooth(0.92, 1.0, t));
                        rough += 0.05 * (Noise.fbm(x / W * fx, y / H * fx * F.halfH / F.halfW, Math.max(2, Math.round(fx)), F.seed + 31, 2) - 0.5);
                        let ao = 1.0;
                        ao = mix(ao, 0.26, smooth(0.06, 0.62, ho));
                        ao = mix(ao, 0.80, ln * 0.7);
                        ao = mix(ao, 0.74, smooth(0.30, 0.95, F.pore[i]));
                        d[o] = clamp(ao, 0, 1) * 255;
                        d[o + 1] = clamp(rough, 0.05, 1) * 255;
                        d[o + 2] = 0; d[o + 3] = 255;
                    }
                }
            }, scene);
        },

        cutNormal(scene, cfg, F) {
            const W = F.W, H = F.H;
            const fx = 2 * F.halfW / 0.6, fy = 2 * F.halfH / 0.6;
            const h = new Float32Array(W * H);
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const i = y * W + x;
                    const ho = F.hole[i], ln = F.line(i);
                    const gr = (Noise.fbm(x / W * fx, y / H * fy, Math.max(2, Math.round(fx)), F.seed + 51, 3) - 0.5) * 0.010;
                    h[i] = gr - smooth(0.04, 0.62, ho) * 0.045 - ln * 0.012 - F.pore[i] * 0.010;
                }
            }
            return TextureLab.normalFrom("eggCutNrm", h, W, H,
                2 * F.halfW / W, 2 * F.halfH / H, 1.0, false, scene);
        }
    };

    // =================================================================
    // 8. EggSkin : 1変種ぶんのテクスチャとマテリアル
    // =================================================================
    class EggSkin {
        constructor(scene, cfg, seed, makisuOn) {
            const sf = new SkinField(cfg, seed);
            const cf = new CutField(cfg, seed ^ 0x1234abcd);
            this.tex = [];

            const skAlb = Bake.skinAlbedo(scene, cfg, sf);
            const skOrm = Bake.skinOrm(scene, cfg, sf, makisuOn ? cfg.makisu : 0);
            const skNrm = Bake.skinNormal(scene, cfg, sf);
            const ctAlb = Bake.cutAlbedo(scene, cfg, cf);
            const ctOrm = Bake.cutOrm(scene, cfg, cf);
            const ctNrm = Bake.cutNormal(scene, cfg, cf);
            this.tex.push(skAlb, skOrm, skNrm, ctAlb, ctOrm, ctNrm);

            this.skin = this._mat(scene, "eggSkinMat", skAlb, skOrm, skNrm, {
                bump: 0.85,
                coat: mix(0.30, 0.92, cfg.skin.gloss), coatRough: mix(0.34, 0.10, cfg.skin.gloss),
                trans: 0.42, tint: [0.98, 0.86, 0.58], maxT: 2.4
            });
            this.cut = this._mat(scene, "eggCutMat", ctAlb, ctOrm, ctNrm, {
                bump: 0.90,
                coat: mix(0.34, 0.95, cfg.cut.wet), coatRough: mix(0.30, 0.09, cfg.cut.wet),
                trans: 0.55, tint: [0.99, 0.90, 0.66], maxT: 1.6
            });
            this.mats = [this.skin, this.cut];
        }
        _mat(scene, name, alb, orm, nrm, o) {
            const m = new BABYLON.PBRMaterial(name, scene);
            m.albedoTexture = alb;
            m.metallic = 0.0;
            m.roughness = 1.0;                    // 実値は ORM の G
            m.metallicTexture = orm;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.bumpTexture = nrm;
            m.bumpTexture.level = o.bump;
            // 濡れの層。だしが表面に薄く残っている
            m.clearCoat.isEnabled = true;
            m.clearCoat.intensity = o.coat;
            m.clearCoat.roughness = o.coatRough;
            m.clearCoat.indexOfRefraction = 1.35;  // ほぼ水
            m.clearCoat.isTintEnabled = false;
            // 【対策】卵は光を通す。透過を切ると発泡スチロールの黄色になる
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.tintColor = new BABYLON.Color3(o.tint[0], o.tint[1], o.tint[2]);
            m.subSurface.translucencyIntensity = o.trans;
            m.subSurface.minimumThickness = 0.25;
            m.subSurface.maximumThickness = o.maxT;
            return m;
        }
        dispose() {
            for (const m of this.mats) m.dispose(true, false);
            for (const t of this.tex) t.dispose();
        }
    }

    // =================================================================
    // 9. Piece : 玉子焼き 1切れ（側面 + 切り口）
    // =================================================================
    function buildPiece(scene, cfg, seed, skin, makisuOn) {
        const S = Object.assign({ seed: seed & 0xffff }, cfg.sec);
        const M = GLOBAL.segRound;
        const { phis, perimeter } = arcParam(S, M);
        const Lz = cfg.pieceLen, half = Lz * 0.5;
        const rng = new Rng(seed);
        const mkAmt = makisuOn ? cfg.makisu : 0;
        const mkPhase = rng.next() * GLOBAL.makisuPitch;

        // 断面の半径（角度ごと）。切れごとにわずかに違う個体差を入れる
        const baseR = new Float64Array(M);
        for (let j = 0; j < M; j++) baseR[j] = outlineR(phis[j], S);

        // ---- リングの z 位置。端は面取りのため密に刻む ----------------
        const nMid = Math.max(10, Math.round(Lz * GLOBAL.segLenPerCm));
        const nEdge = 7, E = GLOBAL.edgeRound;
        const zs = [];
        for (let k = 0; k <= nEdge; k++) zs.push(-half + E * Math.pow(k / nEdge, 1.6));
        for (let k = 1; k < nMid; k++) zs.push(-half + E + (Lz - 2 * E) * (k / nMid));
        for (let k = nEdge; k >= 0; k--) zs.push(half - E * Math.pow(k / nEdge, 1.6));
        const N = zs.length;

        // ---- 側面 -----------------------------------------------------
        const pos = new Float32Array(N * (M + 1) * 3);
        const uv = new Float32Array(N * (M + 1) * 2);
        const endScale = new Float64Array(2);
        let p = 0, q = 0;
        for (let i = 0; i < N; i++) {
            const z = zs[i];
            // 包丁の角の丸め。ごく浅く。深くすると蒲鉾になる
            const dEnd = Math.min(z + half, half - z);
            const cham = 1 - 0.055 * (1 - smooth(0, E, dEnd));
            // 巻きすの溝は軸に直角に走る。
            // 【対策】完全な等間隔・等深度で刻むとブラインドの羽根になる。
            //         竹ひごは太さが揃っていないし、巻きすは斜めに掛かる
            const zc = z + half;
            if (i === 0) endScale[0] = cham;
            if (i === N - 1) endScale[1] = cham;
            for (let j = 0; j <= M; j++) {
                const jj = j % M;
                const ph = phis[jj];
                const up = 0.5 + 0.5 * Math.sin(ph);
                // 溝の位置は周方向にわずかに蛇行する
                const skew = (Noise.fbm(jj / M * 5, 0.21, 5, (seed + 13) & 0xffff, 2) - 0.5) * 0.14;
                const zg = (zc + mkPhase + skew) / GLOBAL.makisuPitch;
                const f = frac(zg);
                const dg = Math.min(f, 1 - f) * 2;
                // 竹ひご1本ごとに深さが違う
                const depth = 0.62 + 0.76 * Noise.fbm(Math.floor(zg) * 0.37 + 0.11, 0.5, 4096, (seed + 29) & 0xffff, 2);
                const groove = smooth(0.62, 0.0, dg) * GLOBAL.makisuDepth * mkAmt * depth;
                // 長さ方向のゆるいうねり（一本の棒に見せない）
                const sag = (Noise.fbm(jj / M * 8, zc / 2.6, 8, (seed + 5) & 0xffff, 2) - 0.5) * 0.030;
                const r = baseR[jj] * cham - groove * (0.30 + 0.70 * up) + sag;
                pos[p++] = Math.cos(ph) * r;
                pos[p++] = Math.sin(ph) * r;
                pos[p++] = z;
                uv[q++] = j / M;                   // 弧長等分なので u は実寸比のまま
                uv[q++] = zc / Lz;
            }
        }
        const idx = [];
        const MM = M + 1;
        for (let i = 0; i < N - 1; i++) {
            for (let j = 0; j < M; j++) {
                const a = i * MM + j, b = a + 1, c = a + MM, dd = c + 1;
                idx.push(a, b, c, b, dd, c);       // 外向き（導出済み）
            }
        }
        const side = finishMesh("eggSide", pos, idx, uv, null, scene, { center: [0, 0, 0] });
        side.material = skin.skin;

        // ---- 切り口（両端）-------------------------------------------
        // 【対策】+Z と -Z で (dP/du, dP/dv, N) の手が逆になる。
        //         そのまま同じ法線マップを貼ると片面だけ凹凸が反転する。
        //         -Z 側は u を反転して手を揃える
        const K = GLOBAL.capRings;
        const cpos = [], cuv = [], cidx = [];
        const a2 = S.a * 1.02, b2 = S.b * 1.02;
        for (let e = 0; e < 2; e++) {
            const sign = e === 0 ? -1 : 1;
            const z0 = sign * half;
            const cham = endScale[e];
            const base = cpos.length / 3;
            // 中心点
            const bulgeC = GLOBAL.cutBulge;
            cpos.push(0, 0, z0 + sign * bulgeC);
            cuv.push(0.5, 0.5);
            for (let k = 1; k <= K; k++) {
                const t = Math.pow(k / K, 0.88);
                for (let j = 0; j < M; j++) {
                    const ph = phis[j];
                    const r = baseR[j] * cham * t;
                    const X = Math.cos(ph) * r, Y = Math.sin(ph) * r;
                    // 柔らかいので切った後にわずかに膨らむ。窪みも少し。
                    // 【対策】窪みを中心まで効かせると、扇の要で半径が0に潰れる
                    //         ところに角度方向のノイズだけが残り、切り口の
                    //         真ん中に星形の折り目が出る。中心へ向けて消す
                    const dent = (Noise.fbm(j / M * 7, t * 4, 7, (seed + 9) & 0xffff, 2) - 0.5) * 0.020
                        * smooth(0.0, 0.28, t);
                    const bl = (bulgeC * (1 - t * t) + dent * (1 - smooth(0.7, 1.0, t)));
                    cpos.push(X, Y, z0 + sign * bl);
                    const u = 0.5 + sign * X / (2 * a2);
                    const v = 0.5 + Y / (2 * b2);
                    cuv.push(u, v);
                }
            }
            const ringStart = base + 1;
            for (let j = 0; j < M; j++) {
                const j2 = (j + 1) % M;
                const A = base, B = ringStart + j, Cc = ringStart + j2;
                if (sign > 0) cidx.push(A, B, Cc); else cidx.push(A, Cc, B);
            }
            // 【対策】中心の扇と、リング間の四角で正しい巻き順が逆になる。
            //         同じ順序を流用すると切り口だけ裏返って穴に見える
            for (let k = 0; k < K - 1; k++) {
                const r0 = ringStart + k * M, r1 = ringStart + (k + 1) * M;
                for (let j = 0; j < M; j++) {
                    const j2 = (j + 1) % M;
                    const A = r0 + j, B = r0 + j2, Cc = r1 + j, D = r1 + j2;
                    if (sign > 0) cidx.push(A, Cc, B, B, Cc, D);
                    else cidx.push(A, B, Cc, B, D, Cc);
                }
            }
        }
        const cap = finishMesh("eggCut", cpos, cidx, cuv, null, scene, { center: [0, 0, 0] });
        cap.material = skin.cut;

        const root = new BABYLON.TransformNode("piece", scene);
        side.parent = root; cap.parent = root;
        return { root, parts: [side, cap], perimeter, halfH: S.b };
    }

    // =================================================================
    // 10. 大根おろし
    // =================================================================
    // 【対策】薄片だけを積むと、密度が足りず「皿にこぼれた削り屑」になる。
    //         実物は水を含んで塊になっている。まず滑らかな山を芯として作り、
    //         その表面に薄片を生やす。これで塊に見えて、輪郭だけがざらつく
    function buildOroshi(scene, seed, opt, mat) {
        const rng = new Rng(seed);
        const pos = [], idx = [], col = [], uv = [];
        const R = opt.radius, Hm = opt.height;
        // 【対策】裾の広い緩やかな山にすると、盛ったのではなく「こぼした」形に
        //         なる。おろしは水気で自立するので、肩が立った半球に近い
        const domeY = (r) => Hm * Math.pow(Math.max(0, 1 - Math.pow(clamp(r / R, 0, 1), 2.2)), 0.62);

        // ---- 芯の山 ----
        {
            const NR = 18, NA = 40;
            const base = 0;
            pos.push(0, domeY(0), 0); col.push(0.90, 0.90, 0.88, 1); uv.push(0.5, 0.5);
            for (let k = 1; k <= NR; k++) {
                const t = k / NR;
                for (let j = 0; j < NA; j++) {
                    const ph = j / NA * TAU;
                    // 手で盛った山なので、輪郭も高さもでこぼこする
                    const wob = 0.86 + 0.28 * Noise.fbm(j / NA * 6, t * 3, 6, seed & 0xffff, 3);
                    const r = R * 0.90 * t * wob;
                    const y = domeY(r) * (0.86 + 0.26 * Noise.fbm(j / NA * 8, t * 4 + 2, 8, (seed + 7) & 0xffff, 2));
                    pos.push(Math.cos(ph) * r, y, Math.sin(ph) * r);
                    const up = clamp(y / Math.max(0.001, Hm), 0, 1);
                    const sh = mix(0.74, 0.95, up);
                    const soy = opt.soy * smooth(0.30, 1.0, up);
                    col.push(clamp(mix(sh, 0.85 * sh, soy), 0, 1),
                        clamp(mix(sh, 0.64 * sh, soy), 0, 1),
                        clamp(mix(sh, 0.42 * sh, soy), 0, 1), 1);
                    uv.push(t, j / NA);
                }
            }
            const rs = base + 1;
            for (let j = 0; j < NA; j++) idx.push(base, rs + j, rs + (j + 1) % NA);
            for (let k = 0; k < NR - 1; k++) {
                const r0 = rs + k * NA, r1 = rs + (k + 1) * NA;
                for (let j = 0; j < NA; j++) {
                    const j2 = (j + 1) % NA;
                    idx.push(r0 + j, r1 + j, r0 + j2, r0 + j2, r1 + j, r1 + j2);
                }
            }
        }

        // ---- 表面の薄片 ----
        const tmp = new V3();
        for (let i = 0; i < opt.count; i++) {
            const rr = Math.pow(rng.next(), 0.55) * R * 0.92;
            const ang = rng.next() * TAU;
            // 芯の表面付近に集める。中まで詰めても見えないので無駄になる
            const cy = domeY(rr) * rng.range(0.55, 1.06) + rng.range(-0.02, 0.05);
            const cx = Math.cos(ang) * rr, cz = Math.sin(ang) * rr;
            const hx = rng.range(0.055, 0.185);    // 長さ半分
            const hy = rng.range(0.012, 0.026);    // 厚み半分
            const hz = rng.range(0.020, 0.048);    // 幅半分
            const m = BABYLON.Matrix.RotationYawPitchRoll(
                rng.next() * TAU, rng.gauss(0, 0.42), rng.next() * TAU);
            const base = pos.length / 3;
            // 上ほど明るく、根元は影と汁で沈む。醤油をかけると上が琥珀に染まる
            const upness = clamp(cy / Math.max(0.001, Hm), 0, 1);
            const soy = opt.soy * smooth(0.25, 1.0, upness) * rng.range(0.5, 1.15);
            const shade = mix(0.82, 1.0, upness) * rng.range(0.94, 1.04);
            const cr = clamp(mix(shade, 0.86 * shade, soy), 0, 1);
            const cg = clamp(mix(shade, 0.66 * shade, soy), 0, 1);
            const cb = clamp(mix(shade, 0.44 * shade, soy), 0, 1);
            for (let sIdx = 0; sIdx < 8; sIdx++) {
                const sx = (sIdx & 1) ? 1 : -1, sy = (sIdx & 2) ? 1 : -1, sz = (sIdx & 4) ? 1 : -1;
                tmp.set(
                    sx * hx * rng.range(0.80, 1.0),
                    sy * hy * rng.range(0.70, 1.0),
                    sz * hz * rng.range(0.78, 1.0));
                const w = BABYLON.Vector3.TransformCoordinates(tmp, m);
                pos.push(cx + w.x, cy + w.y, cz + w.z);
                col.push(cr, cg, cb, 1);
                uv.push((sIdx & 1) ? 1 : 0, (sIdx & 2) ? 1 : 0);
            }
            const F = [
                [0, 2, 1, 1, 2, 3], [4, 5, 6, 5, 7, 6],
                [0, 1, 4, 1, 5, 4], [2, 6, 3, 3, 6, 7],
                [0, 4, 2, 2, 4, 6], [1, 3, 5, 3, 7, 5]
            ];
            for (const f of F) for (const v of f) idx.push(base + v);
        }
        // 山と薄片で巻き向きが混ざるので、判定は山の中心を基準にする
        const mesh = finishMesh("oroshi", pos, idx, uv, col, scene, { center: [0, Hm * 0.35, 0] });
        mesh.material = mat;
        return mesh;
    }

    function oroshiMaterial(scene) {
        const m = new BABYLON.PBRMaterial("oroshiMat", scene);
        m.albedoColor = new BABYLON.Color3(0.955, 0.945, 0.920).toLinearSpace();
        m.metallic = 0.0;
        m.roughness = 0.30;
        m.backFaceCulling = false;
        m.twoSidedLighting = true;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.85;             // 水を含んでいる
        m.clearCoat.roughness = 0.12;
        m.clearCoat.indexOfRefraction = 1.33;
        // 【対策】不透明にすると発泡スチロールの粒になる。大根は光を通す
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.tintColor = new BABYLON.Color3(0.96, 0.96, 0.93);
        m.subSurface.translucencyIntensity = 0.85;
        m.subSurface.minimumThickness = 0.02;
        m.subSurface.maximumThickness = 0.35;
        return m;
    }

    // =================================================================
    // 11. 大葉
    // =================================================================
    // 葉は XZ 平面に置く。u を -x 方向に取るのは (dP/du, dP/dv, N) を
    // 右手系にするため（そうしないと葉脈が全部盛り上がって見える）
    function shisoOutline(s) {
        // s: 0=基部 1=先端。基部はハート形にくびれ、先は細く尖る
        // 【対策】鋸歯を「大きな波9つ」で作ると、葉ではなくアメーバになる。
        //         実物の鋸歯は縁の 3% ほどの細かい刻みが 18 前後
        const body = Math.pow(Math.sin(Math.PI * Math.pow(s, 0.58)), 0.72);
        const notch = 1 - 0.62 * smooth(0.12, 0.0, s);
        const tip = 1 - smooth(0.78, 1.0, s) * 0.55;
        const w = 0.5 + 0.5 * Math.cos(s * TAU * 18);
        const teeth = 1 + 0.042 * Math.pow(w, 0.6) * smooth(0.05, 0.20, s) * smooth(1.0, 0.88, s);
        return Math.max(0.0, body * notch * tip * teeth);
    }
    function buildShiso(scene, seed, len, mat) {
        const NS = 110, NQ = 52;
        const W = len * 0.42;
        const rng = new Rng(seed);
        const pos = [], uv = [], idx = [];
        for (let i = 0; i <= NS; i++) {
            const s = i / NS;
            const w = shisoOutline(s) * W;
            // 主脈に沿って谷、両縁が上へ反る（葉の断面はV字）。
            // 【対策】平らなまま置くと、緑色のシールを貼ったように見える
            const droop = -0.34 * Math.pow(s, 2.1) * len * 0.16;
            for (let j = 0; j <= NQ; j++) {
                const q = j / NQ * 2 - 1;
                const x = q * w;
                const cup = 0.30 * w * (q * q) - 0.05 * w;
                const wav = (Noise.fbm(s * 6, q * 3 + 4, 64, seed & 0xffff, 2) - 0.5) * len * 0.028;
                pos.push(x, cup + droop + wav, s * len);
                uv.push(0.5 - q * 0.5, s);
            }
        }
        const RW = NQ + 1;
        for (let i = 0; i < NS; i++) {
            for (let j = 0; j < NQ; j++) {
                const a = i * RW + j, b = a + 1, c = a + RW, d = c + 1;
                idx.push(a, c, b, b, c, d);
            }
        }
        // 葉は閉じていないので、重心ではなく「表が上を向く」ことで判定する
        const mesh = finishMesh("shiso", pos, idx, uv, null, scene, { dir: [0, 1, 0] });
        mesh.material = mat;
        mesh.rotation.y = rng.range(-0.2, 0.2);
        return mesh;
    }

    function shisoMaterial(scene, seed) {
        const N = 256;
        // 葉脈までの距離場。主脈 + 側脈
        const veins = [];
        for (let i = 0; i < 8; i++) {
            const v0 = 0.10 + i * 0.098;
            const dir = (i % 2 === 0) ? 1 : -1;
            veins.push({ v0, dir, reach: 0.40 - i * 0.028 });
        }
        function veinDist(u, v) {
            // 主脈
            let d = Math.abs(u - 0.5) * 1.0;
            for (const w of veins) {
                // 主脈から斜め前方へ伸びる直線への距離
                const du = (u - 0.5) * w.dir;
                if (du < 0) continue;
                const expect = w.v0 + du * 1.35;
                const dd = Math.abs(v - expect) * 0.55 + Math.max(0, du - w.reach) * 2.0;
                d = Math.min(d, dd);
            }
            return d;
        }
        const alb = TextureLab.canvas("shisoAlb", N, N, (d, W, H) => {
            const G1 = [0.255, 0.400, 0.140];
            const G2 = [0.395, 0.545, 0.205];
            const VN = [0.520, 0.640, 0.330];
            for (let y = 0; y < H; y++) {
                const v = y / H;
                for (let x = 0; x < W; x++) {
                    const u = x / W, i = (y * W + x) * 4;
                    const n = Noise.fbm(u * 18, v * 18, 18, seed + 5, 3);
                    let cr = mix(G1[0], G2[0], n), cg = mix(G1[1], G2[1], n), cb = mix(G1[2], G2[2], n);
                    const vd = veinDist(u, v);
                    const k = smooth(0.030, 0.004, vd);
                    cr = mix(cr, VN[0], k * 0.85); cg = mix(cg, VN[1], k * 0.85); cb = mix(cb, VN[2], k * 0.85);
                    d[i] = clamp(cr, 0, 1) * 255; d[i + 1] = clamp(cg, 0, 1) * 255;
                    d[i + 2] = clamp(cb, 0, 1) * 255; d[i + 3] = 255;
                }
            }
        }, scene);
        const h = new Float32Array(N * N);
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                const u = x / N, v = y / N;
                // 葉脈は表側では溝。間の面は膨らむ
                h[y * N + x] = -smooth(0.030, 0.004, veinDist(u, v)) * 0.030
                    + (Noise.fbm(u * 40, v * 40, 40, seed + 9, 2) - 0.5) * 0.010;
            }
        }
        const nrm = TextureLab.normalFrom("shisoNrm", h, N, N, 6 / N, 12 / N, 1.0, false, scene);
        const m = new BABYLON.PBRMaterial("shisoMat", scene);
        m.albedoTexture = alb;
        m.bumpTexture = nrm;
        m.bumpTexture.level = 0.9;
        m.metallic = 0.0;
        m.roughness = 0.44;
        m.backFaceCulling = false;
        m.twoSidedLighting = true;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.45;
        m.clearCoat.roughness = 0.22;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.tintColor = new BABYLON.Color3(0.42, 0.62, 0.24);
        m.subSurface.translucencyIntensity = 0.75;
        m.subSurface.minimumThickness = 0.02;
        m.subSurface.maximumThickness = 0.12;
        m._shisoTex = [alb, nrm];
        return m;
    }

    // =================================================================
    // 12. 器 : 外形関数 + 断面プロファイルの掃引
    // =================================================================
    // 丸皿・輪花皿・長方皿を、外形関数を差し替えるだけで一本の経路で作る
    const DISHES = {
        black: {
            label: "黒マット丸皿", rMax: 10.6, ax: 1, az: 1,
            outline: () => 1,
            color: [0.062, 0.058, 0.056], rough: 0.52, coat: 0.34, coatRough: 0.24,
            kind: "iron"
        },
        ruri: {
            label: "瑠璃輪花皿", rMax: 10.9, ax: 1, az: 1,
            outline: (ph) => 1 - 0.055 * Math.pow(Math.abs(Math.sin(ph * 5)), 0.65),
            color: [0.055, 0.115, 0.300], rough: 0.16, coat: 0.95, coatRough: 0.055,
            kind: "ruri"
        },
        stripe: {
            label: "縞の長方皿", rMax: 13.4, ax: 1.0, az: 0.575,
            outline: (ph) => {
                const n = 5.0, c = Math.cos(ph), s = Math.sin(ph);
                return Math.pow(Math.pow(Math.abs(c / 1.0), n) + Math.pow(Math.abs(s / 0.575), n), -1 / n);
            },
            color: [0.855, 0.840, 0.795], rough: 0.26, coat: 0.80, coatRough: 0.10,
            kind: "stripe"
        }
    };

    // s = 外形に対する縮尺 / y = 高さ(cm)
    const DISH_PROFILE = [
        [0.030, 1.30], [0.360, 1.30], [0.600, 1.30], [0.760, 1.40], [0.890, 1.68],
        [0.968, 1.98], [1.000, 2.10],
        [0.995, 1.96], [0.962, 1.76], [0.878, 1.44], [0.720, 1.16], [0.550, 0.99],
        [0.420, 0.90], [0.386, 0.875], [0.386, 0.030], [0.352, 0.000], [0.318, 0.000],
        [0.316, 0.560], [0.286, 0.780], [0.200, 0.855], [0.030, 0.870]
    ];
    const PLATE_TOP_Y = 1.30;

    function buildDish(scene, def, mat) {
        const M = 160, prof = DISH_PROFILE, N = prof.length;
        const pos = new Float32Array((N * (M + 1) + 2) * 3);
        const uv = new Float32Array((N * (M + 1) + 2) * 2);
        const R = def.rMax;
        let p = 0, q = 0;
        for (let i = 0; i < N; i++) {
            const s = prof[i][0], y = prof[i][1];
            for (let j = 0; j <= M; j++) {
                const ph = (j % M) / M * TAU;
                const r = R * def.outline(ph) * s;
                const x = Math.cos(ph) * r, z = Math.sin(ph) * r;
                pos[p++] = x; pos[p++] = y; pos[p++] = z;
                // 平面投影。縞は素直に x で切りたいので極座標 UV は使わない
                uv[q++] = 0.5 + x / (2 * R * def.ax);
                uv[q++] = 0.5 + z / (2 * R * def.az);
            }
        }
        const cA = N * (M + 1), cB = cA + 1;
        pos[p++] = 0; pos[p++] = prof[0][1]; pos[p++] = 0;
        pos[p++] = 0; pos[p++] = prof[N - 1][1]; pos[p++] = 0;
        uv[q++] = 0.5; uv[q++] = 0.5;
        uv[q++] = 0.5; uv[q++] = 0.5;

        const idx = [];
        const MM = M + 1;
        for (let i = 0; i < N - 1; i++) {
            for (let j = 0; j < M; j++) {
                const a = i * MM + j, b = a + 1, c = a + MM, d = c + 1;
                idx.push(a, b, c, b, d, c);
            }
        }
        for (let j = 0; j < M; j++) idx.push(cA, j + 1, j);
        const o = (N - 1) * MM;
        for (let j = 0; j < M; j++) idx.push(cB, o + j, o + j + 1);

        const mesh = finishMesh("dish", pos, idx, uv, null, scene, { center: [0, 1.05, 0] });
        mesh.material = mat;
        mesh.receiveShadows = true;
        return mesh;
    }

    function dishMaterial(scene, def, seed) {
        const N = 512;
        const C = def.color;
        const alb = TextureLab.canvas("dishAlb", N, N, (d, W, H) => {
            for (let y = 0; y < H; y++) {
                const v = y / H;
                for (let x = 0; x < W; x++) {
                    const u = x / W, i = (y * W + x) * 4;
                    let cr = C[0], cg = C[1], cb = C[2];
                    if (def.kind === "stripe") {
                        // 呉須の太縞。刷毛の始まりと終わりで濃さが変わる
                        const per = 0.132;
                        const f = frac(u / per + 0.18);
                        const wobble = (Noise.fbm(v * 7, u * 3, 7, seed + 3, 2) - 0.5) * 0.10;
                        const band = smooth(0.50 + wobble, 0.42 + wobble, Math.abs(f - 0.5) * 2);
                        const dens = 0.55 + 0.45 * Noise.fbm(u * 26, v * 5, 26, seed + 11, 3);
                        const k = band * dens;
                        cr = mix(cr, 0.255, k * 0.92); cg = mix(cg, 0.330, k * 0.92); cb = mix(cb, 0.430, k * 0.92);
                        // 素地の貫入とざらつき
                        const gr = Noise.fbm(u * 60, v * 60, 60, seed + 21, 3) - 0.5;
                        cr = clamp(cr + gr * 0.045, 0, 1); cg = clamp(cg + gr * 0.045, 0, 1); cb = clamp(cb + gr * 0.042, 0, 1);
                    } else if (def.kind === "ruri") {
                        // 瑠璃釉。溜まった所が濃く、薄い所は紫に振れる
                        const n = Noise.fbm(u * 9, v * 9, 9, seed + 5, 3);
                        const n2 = Noise.fbm(u * 30, v * 30, 30, seed + 17, 2);
                        const k = clamp(n * 0.85 + n2 * 0.25, 0, 1);
                        cr = mix(C[0] * 0.55, C[0] * 1.7, k);
                        cg = mix(C[1] * 0.55, C[1] * 1.5, k);
                        cb = mix(C[2] * 0.62, C[2] * 1.45, k);
                    } else {
                        // 鉄釉。細かい斑と、ところどころ茶色く抜ける
                        const n = Noise.fbm(u * 22, v * 22, 22, seed + 7, 3);
                        const rust = smooth(0.62, 0.86, Noise.fbm(u * 11, v * 11, 11, seed + 13, 3));
                        cr = clamp(C[0] + (n - 0.5) * 0.055 + rust * 0.085, 0, 1);
                        cg = clamp(C[1] + (n - 0.5) * 0.050 + rust * 0.058, 0, 1);
                        cb = clamp(C[2] + (n - 0.5) * 0.048 + rust * 0.030, 0, 1);
                    }
                    d[i] = cr * 255; d[i + 1] = cg * 255; d[i + 2] = cb * 255; d[i + 3] = 255;
                }
            }
        }, scene);
        const m = new BABYLON.PBRMaterial("dishMat", scene);
        m.albedoTexture = alb;
        m.metallic = 0.0;
        m.roughness = def.rough;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = def.coat;
        m.clearCoat.roughness = def.coatRough;
        m.clearCoat.indexOfRefraction = 1.52;      // 釉薬
        // 旋盤系メッシュの巻き方向を気にせず済ませる
        m.backFaceCulling = false;
        m.twoSidedLighting = true;
        m._dishTex = [alb];
        return m;
    }

    // =================================================================
    // 13. 卓（木）
    // =================================================================
    function buildTable(scene, seed) {
        const mesh = BABYLON.MeshBuilder.CreateGround("table", { width: 130, height: 130, subdivisions: 2 }, scene);
        mesh.position.y = -0.004;
        const N = 512;
        const alb = TextureLab.canvas("tableAlb", N, N, (d, W, H) => {
            const A = [0.300, 0.190, 0.115], B = [0.175, 0.100, 0.058];
            for (let y = 0; y < H; y++) {
                const v = y / H;
                for (let x = 0; x < W; x++) {
                    const u = x / W, i = (y * W + x) * 4;
                    // 年輪。u 方向に長く、v 方向に細かい
                    const warp = Noise.fbm(u * 4, v * 10, 4, seed + 3, 3) * 1.6;
                    const rings = frac(v * 9 + warp);
                    const g = smooth(0.0, 0.22, rings) * smooth(1.0, 0.72, rings);
                    const fib = Noise.fbm(u * 3, v * 150, 3, seed + 9, 2);
                    const k = clamp(0.30 + g * 0.62 + (fib - 0.5) * 0.30, 0, 1);
                    d[i] = mix(B[0], A[0], k) * 255;
                    d[i + 1] = mix(B[1], A[1], k) * 255;
                    d[i + 2] = mix(B[2], A[2], k) * 255;
                    d[i + 3] = 255;
                }
            }
        }, scene);
        alb.uScale = 2.2; alb.vScale = 2.2;
        const m = new BABYLON.PBRMaterial("tableMat", scene);
        m.albedoTexture = alb;
        m.metallic = 0.0;
        m.roughness = 0.62;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.30;
        m.clearCoat.roughness = 0.35;
        mesh.material = m;
        mesh.receiveShadows = true;
        return mesh;
    }

    // =================================================================
    // 14. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.05, 0.045, 0.042, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.15;
    scene.environmentIntensity = 0.95;
    scene.createDefaultSkybox(env, true, 1000, 0.72, false);

    // 切り口を正面に見る角度。だし巻きは断面が主役
    const camera = new BABYLON.ArcRotateCamera("cam", -Math.PI / 2 + 0.62, 1.06, 30, new V3(0, 2, 0), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 12;
    camera.minZ = 0.05;
    camera.lowerRadiusLimit = 7;
    camera.upperRadiusLimit = 140;
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.42, -0.90, 0.52).normalize(), scene);
    key.position = new V3(14, 26, -16);
    key.intensity = 2.45;
    key.diffuse = new BABYLON.Color3(1.0, 0.975, 0.935);
    key.specular = new BABYLON.Color3(0.70, 0.68, 0.64);
    key.autoCalcShadowZBounds = true;

    const rim = new BABYLON.DirectionalLight("rim", new V3(0.62, -0.34, -0.92).normalize(), scene);
    rim.intensity = 1.30;
    rim.diffuse = new BABYLON.Color3(1.0, 0.94, 0.88);
    rim.specular = new BABYLON.Color3(0.30, 0.29, 0.27);

    const fillL = new BABYLON.HemisphericLight("fill", new V3(0, 1, 0), scene);
    fillL.intensity = 0.24;
    fillL.specular = new BABYLON.Color3(0, 0, 0);

    // 【対策】影は ESM ではなく PCF。ESM の自己遮蔽は側面に痣として出る
    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.forceBackFacesOnly = true;
    sg.bias = 0.0008;
    sg.normalBias = 0.010;
    sg.setDarkness(0.40);

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.04;
    ip.contrast = 1.15;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.25;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    // =================================================================
    // 15. 生成 / 差し替え
    // =================================================================
    // 【対策】テクスチャは組み立てから切り離す。GUI を触るたびに焼き直すと
    //         ボタン1回で1秒以上固まる
    const skinCache = {};
    const dishCache = {};
    let oroshiMat = null, shisoMat = null, table = null, dish = null, dishKey = null;
    let group = null, pieces = [], garnish = [];
    let ssao = null, onRebuilt = null, state = null;

    function getSkins(presetKey, cfg, makisuOn) {
        const out = [];
        for (let i = 0; i < GLOBAL.variants; i++) {
            const k = presetKey + "|" + (makisuOn ? "m" : "-") + "|" + i;
            if (!skinCache[k]) skinCache[k] = new EggSkin(scene, cfg, hashStr(k), makisuOn);
            out.push(skinCache[k]);
        }
        return out;
    }
    function getDish(kind) {
        if (!dishCache[kind]) dishCache[kind] = dishMaterial(scene, DISHES[kind], hashStr("dish" + kind));
        return dishCache[kind];
    }
    function worldBounds(meshes) {
        let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
        for (const m of meshes) {
            m.computeWorldMatrix(true);
            const b = m.getBoundingInfo().boundingBox;
            minX = Math.min(minX, b.minimumWorld.x); maxX = Math.max(maxX, b.maximumWorld.x);
            minY = Math.min(minY, b.minimumWorld.y); maxY = Math.max(maxY, b.maximumWorld.y);
            minZ = Math.min(minZ, b.minimumWorld.z); maxZ = Math.max(maxZ, b.maximumWorld.z);
        }
        return { minX, minY, minZ, maxX, maxY, maxZ };
    }

    function build(presetKey, seed, pieceCount, opt) {
        const t0 = performance.now();
        const cfg = PRESETS[presetKey];
        const n = pieceCount || cfg.pieces;
        const rng = new Rng(seed);

        // 【対策】子を個別に消してから親も消すと二重 dispose になる。
        //         マテリアルとテクスチャは使い回すので必ず false のまま
        if (group) group.dispose(false, false);
        pieces = []; garnish = [];
        group = new BABYLON.TransformNode("plated", scene);

        const skins = getSkins(presetKey, cfg, opt.makisu);

        // ---- 切れを並べる ------------------------------------------
        // 【対策】等間隔に真っすぐ並べると陳列棚の見本になる。
        //         段違いと首振りを入れて、隣どうしを軽く寄せる
        const stepX = cfg.sec.a * 2 * 1.10;
        for (let i = 0; i < n; i++) {
            const skin = skins[i % GLOBAL.variants];
            const p = buildPiece(scene, cfg, (seed + i * 7919) >>> 0, skin, opt.makisu);
            p.root.parent = group;
            const c = i - (n - 1) / 2;
            p.root.rotation.y = cfg.yaw + rng.gauss(0, 0.075);
            p.root.rotation.z = rng.gauss(0, 0.048);
            p.root.position.set(
                c * stepX + rng.range(-0.06, 0.06),
                cfg.sec.b,
                c * cfg.pieceLen * cfg.stagger + rng.range(-0.08, 0.08)
            );
            pieces.push(p);
        }

        // ---- 薬味 ---------------------------------------------------
        const rowHalf = (n - 1) / 2 * stepX + cfg.sec.a;
        if (opt.shiso && cfg.shiso) {
            if (!shisoMat) shisoMat = shisoMaterial(scene, 4711);
            const leaf = buildShiso(scene, (seed ^ 0x3311) >>> 0, 6.6, shisoMat);
            leaf.parent = group;
            leaf.position.set(-rowHalf * 0.20, 0.05, -cfg.sec.a - 0.9);
            leaf.rotation.y = -2.60 + rng.range(-0.12, 0.12);
            leaf.rotation.x = -0.030;
            garnish.push(leaf);
        }
        if (opt.oroshi && cfg.oroshi) {
            if (!oroshiMat) oroshiMat = oroshiMaterial(scene);
            // 【対策】薄片をまばらに撒くと、山ではなく皿にこぼれた削り屑になる。
            //         おろしは水を含んで固まっているので、密に詰めて塊にする
            const mound = buildOroshi(scene, (seed ^ 0x5a5a) >>> 0, {
                radius: 1.45, height: 1.55, count: 320, soy: cfg.soy
            }, oroshiMat);
            mound.parent = group;
            // カメラは -Z 側から見る。おろしは列の右手前に置かないと切れの陰に隠れる
            mound.position.set(rowHalf + 1.55, 0.02, -cfg.pieceLen * 0.22);
            garnish.push(mound);
        }

        // ---- 器と卓 -------------------------------------------------
        if (GLOBAL.showTable && !table) table = buildTable(scene, 909);
        if (GLOBAL.showPlate) {
            if (dishKey !== cfg.plate) {
                if (dish) dish.dispose(false, false);
                dish = buildDish(scene, DISHES[cfg.plate], getDish(cfg.plate));
                dishKey = cfg.plate;
            }
        }

        // ---- 皿に載せる --------------------------------------------
        // 【対策】高さ合わせを「盛り付け全体の最下点」で取ると、大葉の反りや
        //         おろしの裾がわずかでも下に出た瞬間、玉子焼きが皿から浮く。
        //         基準は必ず玉子焼き本体。薬味はそのあと個別に着地させる
        const eggMeshes = [];
        for (const p of pieces) for (const m of p.parts) eggMeshes.push(m);
        const meshes = eggMeshes.slice();
        for (const g of garnish) meshes.push(g);

        group.position.set(0, 0, 0);
        group.computeWorldMatrix(true);
        const be = worldBounds(eggMeshes);
        const b0 = worldBounds(meshes);
        // 【対策】盛り付け全体の重心で中心を取ると、大葉が後ろに長い分だけ
        //         玉子焼きが手前へ押し出されて、主役が皿の端に寄る
        group.position.x = -(0.68 * (be.minX + be.maxX) * 0.5 + 0.32 * (b0.minX + b0.maxX) * 0.5);
        group.position.z = -(0.68 * (be.minZ + be.maxZ) * 0.5 + 0.32 * (b0.minZ + b0.maxZ) * 0.5);
        group.computeWorldMatrix(true);
        const b1 = worldBounds(meshes);

        // 【対策】切れ数を増やすと横一列が伸びて皿からはみ出す。切れを重ねて
        //         逃がすと互いにめり込む。器のほうを盛り付けに合わせて選ぶ
        //         （実際に厚焼きを5切れ並べれば、人は大きい皿を出す）
        const lim = DISHES[cfg.plate];
        let need = 0;
        for (const x of [b1.minX, b1.maxX]) {
            for (const z of [b1.minZ, b1.maxZ]) need = Math.max(need, Math.hypot(x / lim.ax, z / lim.az));
        }
        const pScale = Math.max(1, need / (lim.rMax * 0.95));
        if (dish) dish.scaling.set(pScale, pScale, pScale);
        const topY = GLOBAL.showPlate ? PLATE_TOP_Y * pScale : 0;

        group.position.y = topY - be.minY + 0.006;
        group.computeWorldMatrix(true);
        for (const g of garnish) {
            const gb = worldBounds([g]);
            if (gb.minY < topY) g.position.y += (topY - gb.minY) + 0.004;
        }
        group.computeWorldMatrix(true);
        const bb = worldBounds(meshes);

        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        for (const m of meshes) { sg.addShadowCaster(m, true); m.receiveShadows = true; }
        if (dish) sg.addShadowCaster(dish, true);

        const w = bb.maxX - bb.minX, d = bb.maxZ - bb.minZ;
        camera.target.set(0, topY + cfg.sec.b * 0.95, 0);
        camera.radius = Math.max(w, d, 12) * 1.85;
        if (ssao) ssao.radius = cfg.sec.b * 0.55;

        state = { cfg, presetKey, seed, n, opt, bounds: bb, plateScale: pScale };
        if (onRebuilt) onRebuilt(state);
        console.log("[Tamagoyaki]", cfg.label, "/ seed =", seed, "/", n, "切れ",
            "/ build", (performance.now() - t0).toFixed(0) + "ms");
        return state;
    }

    build(START.preset, START.seed, START.pieces || PRESETS[START.preset].pieces,
        { oroshi: START.oroshi, shiso: START.shiso, makisu: START.makisu });

    if (GLOBAL.useSSAO) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.8;
        ssao.totalStrength = 0.90;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 130;
        ssao.minZAspect = 0.2;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.90;
    dp.bloomWeight = 0.12;
    dp.bloomKernel = 36;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.14;
    // 【対策】錯乱円は「シーンの1単位 = 1m」として深度を換算している。
    //         ピント位置は radius×1000 のままにし、絞りで合焦幅を作る
    dp.depthOfFieldEnabled = true;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.Medium;
    dp.depthOfField.fStop = 4.6;
    dp.depthOfField.focalLength = 85;
    dp.depthOfField.focusDistance = camera.radius * 1000;
    scene.onBeforeRenderObservable.add(() => {
        if (dp.depthOfFieldEnabled) dp.depthOfField.focusDistance = camera.radius * 1000;
    });

    // =================================================================
    // 16. GUI
    // =================================================================
    // 【対策】フルスクリーン GUI は既定でシーンと同じカメラで合成されるため、
    //         Bloom / 被写界深度 / シャープンが UI にも乗ってボケる
    const GUI_MASK = 0x20000000;
    const guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene);
    guiCam.layerMask = GUI_MASK;
    scene.activeCameras = [camera, guiCam];
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (ui.layer) ui.layer.layerMask = GUI_MASK;

    const COL = {
        idle: "#2a2622", active: "#a67a2e", edge: "#4a423a",
        text: "#f7f2e8", sub: "#c0b09a", accent: "#f0cd82"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "236px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(16,13,11,0.80)";
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
        b.height = "32px"; b.paddingBottom = "5px";
        b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 14;
        b.onPointerUpObservable.add(onClick);
        panel.addControl(b);
        return b;
    }
    function spacer(h) {
        const s = new BABYLON.GUI.Rectangle();
        s.height = h; s.thickness = 0; s.background = "";
        panel.addControl(s);
    }

    let curPreset = START.preset;
    let curSeed = START.seed;
    let curPieces = PRESETS[START.preset].pieces;
    const curOpt = { oroshi: START.oroshi, shiso: START.shiso, makisu: START.makisu };

    const presetButtons = {}, pieceButtons = {};
    let oroshiBtn = null, shisoBtn = null, makisuBtn = null;
    function highlight() {
        for (const k in presetButtons) presetButtons[k].background = (k === curPreset) ? COL.active : COL.idle;
        for (const k in pieceButtons) pieceButtons[k].background = (+k === curPieces) ? COL.active : COL.idle;
        if (oroshiBtn) {
            oroshiBtn.background = curOpt.oroshi ? COL.active : COL.idle;
            oroshiBtn.textBlock.text = "大根おろし: " + (curOpt.oroshi ? "ON" : "OFF");
        }
        if (shisoBtn) {
            shisoBtn.background = curOpt.shiso ? COL.active : COL.idle;
            shisoBtn.textBlock.text = "大葉: " + (curOpt.shiso ? "ON" : "OFF");
        }
        if (makisuBtn) {
            makisuBtn.background = curOpt.makisu ? COL.active : COL.idle;
            makisuBtn.textBlock.text = "巻きすの筋: " + (curOpt.makisu ? "ON" : "OFF");
        }
    }
    const rebuild = () => build(curPreset, curSeed, curPieces, curOpt);

    addLabel("TAMAGOYAKI", 11, COL.sub, "18px");
    addLabel("種類", 13, COL.accent, "22px");
    for (const k of Object.keys(PRESETS)) {
        presetButtons[k] = addButton("p_" + k, PRESETS[k].label, () => {
            curPreset = k; curPieces = PRESETS[k].pieces;
            rebuild(); highlight();
        });
    }

    spacer("8px");
    addLabel("切れ数", 13, COL.accent, "22px");
    for (const nn of [2, 3, 4, 5]) {
        pieceButtons["" + nn] = addButton("n_" + nn, nn + "切れ", () => {
            curPieces = nn; rebuild(); highlight();
        });
    }

    spacer("8px");
    addLabel("盛り付け", 13, COL.accent, "22px");
    oroshiBtn = addButton("oroshi", "大根おろし: ON", () => {
        curOpt.oroshi = !curOpt.oroshi; rebuild(); highlight();
    });
    shisoBtn = addButton("shiso", "大葉: ON", () => {
        curOpt.shiso = !curOpt.shiso; rebuild(); highlight();
    });
    makisuBtn = addButton("makisu", "巻きすの筋: ON", () => {
        curOpt.makisu = !curOpt.makisu; rebuild(); highlight();
    });

    spacer("8px");
    addButton("reseed", "別の個体を焼く", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        rebuild(); highlight();
    });
    const rotateBtn = addButton("rotate", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.1;
        rotateBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotateBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });
    let shadowOn = true;
    const shadowBtn = addButton("shadow", "影: ON", () => {
        shadowOn = !shadowOn;
        const sm = sg.getShadowMap();
        if (sm) sm.refreshRate = shadowOn
            ? BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME : 0;
        sg.setDarkness(shadowOn ? 0.40 : 1.0);
        shadowBtn.textBlock.text = "影: " + (shadowOn ? "ON" : "OFF");
        shadowBtn.background = shadowOn ? COL.active : COL.idle;
    });
    shadowBtn.background = COL.active;
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        dp.depthOfFieldEnabled = !dp.depthOfFieldEnabled;
        dofBtn.textBlock.text = "被写界深度: " + (dp.depthOfFieldEnabled ? "ON" : "OFF");
        dofBtn.background = dp.depthOfFieldEnabled ? COL.active : COL.idle;
    });
    dofBtn.background = COL.active;

    const info = addLabel("", 12, COL.sub, "58px");
    onRebuilt = (st) => {
        if (!info || !st) return;
        const s = st.cfg.sec;
        info.text = "断面 " + (s.a * 2).toFixed(1) + " × " + (s.b * 2).toFixed(1) + " cm\n"
            + "厚さ " + st.cfg.pieceLen.toFixed(1) + " cm × " + st.n + "切れ / 巻き "
            + st.cfg.roll.turns.toFixed(1) + "重\nseed: " + st.seed;
    };
    onRebuilt(state);
    highlight();

    return scene;
};

export default createScene;