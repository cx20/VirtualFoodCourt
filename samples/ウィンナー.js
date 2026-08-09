// =====================================================================
//  Photoreal Wiener  /  写実的なウィンナー（あらびき・赤ウィンナー・ハーブ）
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  実物の要点（ここを外すと「オレンジ色の棒」になる）:
//    ・まっすぐではない。ゆるく弓なりに曲がり、太さも一定ではない
//      （詰め方のむらで長手方向に ±4% うねる）
//    ・両端は半球ではない。ケーシングをねじって留めた「結び目」があり、
//      そこへ向かって放射状のひだが収束する。この数mmが最も「らしさ」を出す
//    ・焼き色は等高線状のグラデーションではなく斑。焼けた濃い所と、
//      焼けずに残った淡いピンクの所がまだらに同居する
//    ・粗挽きは脂の白い粒と黒胡椒がケーシング越しに透けて見える
//    ・脂の膜で強く光るが、ハイライトは点ではなく「稜に沿って長く伸びる筋」
//    ・炭化した黒い点だけが局所的に粗い（そこだけ光らない）
//
//  v4（wiener-D）で Havok の落下を追加:
//    ・コライダーは凸包ではなくカプセル列。弓なりの胴を凸包で包むと内側の
//      窪みが埋まり、隣と重なるとき不自然に浮く
//    ・単位が cm なので重力は 981 相当。ただし Havok の接触許容量は絶対値で
//      決まっているため、実重力だと震える。620 まで落として安定域へ入れる
//
//  団子版（dango-C）から引き継いだもの:
//    ・色の層は「塗る」のではなく、透過や吸収を CPU で解いてテクスチャへ焼く
//      （Babylon のクリアコート着色は浅い入射角と厚み0で数値的に破綻する）
//    ・法線マップの V の符号は (yd - yu)
//    ・影は ESM ではなく PCF + forceBackFacesOnly
//    ・被写界深度の錯乱円は「1単位 = 1m」で計算される。ピントは radius×1000
// =====================================================================

var createScene = async function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    const PRESETS = {
        // あらびきポーク: 焼き色が濃く、脂の粒と胡椒が透ける
        arabiki: {
            label: "あらびき",
            radius: 1.01, length: 9.90,
            bend: 0.055, plump: 0.062,
            // 【対策】v1 は地色が生の肌色で、そこへ焼き色を混ぜる設計だった。
            //         焼いたウィンナーは「全面が焼けている」のが標準で、
            //         焼きの浅い所すらオレンジ。ピンクは残らない
            pale: [0.865, 0.520, 0.290],       // 焼きの浅い所（それでも橙）
            cook: [0.800, 0.395, 0.155],       // 標準の焼き色
            char: [0.560, 0.245, 0.095],       // 濃く焼けた斑
            burn: [0.300, 0.135, 0.065],       // 炭化した点
            cookAmount: 0.80, paleAmount: 0.38,
            pepper: 0.85, fat: 0.75, herb: 0.0,
            splitChance: 0.55,
            casingRough: 0.30, grease: 0.95
        },
        // 赤ウィンナー: 着色された明るい朱色。ケーシングが張っていて表面が滑らか
        aka: {
            label: "赤ウィンナー",
            radius: 0.94, length: 9.00,
            bend: 0.070, plump: 0.045,
            pale: [0.910, 0.460, 0.225],
            cook: [0.880, 0.330, 0.125],
            char: [0.660, 0.235, 0.090],
            burn: [0.340, 0.115, 0.055],
            cookAmount: 0.52, paleAmount: 0.30,
            pepper: 0.0, fat: 0.20, herb: 0.0,
            splitChance: 0.15,
            casingRough: 0.24, grease: 1.0
        },
        // ハーブ: 焼き色が浅く、緑のハーブと胡椒の粒が全面に散る
        herb: {
            label: "ハーブ",
            radius: 0.99, length: 9.55,
            bend: 0.045, plump: 0.068,
            pale: [0.860, 0.600, 0.375],
            cook: [0.775, 0.470, 0.235],
            char: [0.520, 0.265, 0.125],
            burn: [0.280, 0.140, 0.075],
            cookAmount: 0.68, paleAmount: 0.45,
            pepper: 1.0, fat: 0.55, herb: 0.9,
            splitChance: 0.30,
            casingRough: 0.34, grease: 0.85
        }
    };

    const GLOBAL = {
        // --- 分割
        segmentsLength: 240,
        segmentsRound: 72,
        // --- 先端
        // 胴の輪郭（超楕円）。指数を下げるほど紡錘形になる
        spindleP: 2.1, spindleQ: 2.3,
        tipPinch: 0.34,                // 先端の絞り
        tipPinchLen: 0.065,            // 絞りが効く範囲（全長比）
        pleatCount: 11,                // 先端へ収束するひだの本数
        // --- テクスチャ（周方向 × 長手方向）
        texW: 256, texH: 512,   // 周6cm / 長さ11.6cm でテクセルがほぼ等方
        skinVariants: 3,
        // --- 物理（Havok）
        usePhysics: true,
        // 【対策】Havok の接触許容量・スリープ閾値は「絶対値」で、メートル系を
        //         前提に決まっている。シーンが cm 単位だとこれらが実質1/100の
        //         厳しさになり、実重力 981 では1ステップのめり込みが許容量を
        //         超えて押し戻され続け、プルプル震える。全体をメートル系へ
        //         作り直さずに安定域へ戻すいちばん安い方法が重力を落とすこと
        gravity: 620,                  // cm/s^2（実寸どおりなら 981）
        physicsHz: 120,                // 固定タイムステップ
        capsuleCount: 6,               // コライダーのカプセル本数
        capsuleShrink: 0.95,           // 表示メッシュのわずかに内側へ
        pieceMass: 1.0,
        friction: 0.78,
        restitution: 0.0,              // 焼けたウィンナーは跳ねない
        linearDamping: 0.38,
        angularDamping: 0.88,          // 転がり続けるのを止める
        dropInterval: 0.40,            // 1本あたりの投入間隔（物理時間の秒）
        // 【対策】落差を詰めすぎると、速度が Havok の非アクティブ化の閾値を
        //         一度も超えないまま「静止した」と判定され、空中で固まる。
        //         閾値は絶対値（メートル系前提）なので cm 系では相対的に厳しい。
        //         落差を戻したうえで、投入時に下向きの初速を与えて必ず起こす
        dropClearance: 1.6,            // 真下の物からどれだけ上で放すか（cm）
        dropSpeed: 30,                 // 投入時の下向き初速（cm/s）
        maxSpeed: 140,                 // 落下速度の上限（cm/s）。すり抜け防止
        contactLift: 0.12,             // コライダーが細いぶん接地面を持ち上げる（cm）
        laneGap: 1.85,                 // 投入位置を横へずらす間隔（半径の倍数）
        maxPileY: 9.0,                 // 投入位置の上限（鉄板の面から cm）
        airborneTol: 6.0,              // これ以上浮いていたら「静止」と見なさない
        freezeWhenSettled: true,
        settleSpeed: 4.0, settleSpin: 5.0, settleHold: 0.35,
        dropMaxWait: 2.2,              // 前の1本が落ち着くのを待つ上限（秒）
        settleTimeout: 3.2,

        // --- デバッグ
        debug: true,
        debugEvery: 30,                // 何フレームごとに一覧を出すか
        debugProbe: true,              // ワールドが実際に進んでいるかの検査球

        // --- 描画
        useSSAO: true,
        showPan: true
    };

    const START_PRESET = "arabiki";
    const START_SEED = 20260802;
    const START_COUNT = 4;

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;

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
        gauss(m, sd) {
            const u = Math.max(1e-9, this.next()), v = this.next();
            return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
        }
    }
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const wrapU = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 1 - d); };

    // =================================================================
    // 2. Geo
    // =================================================================
    const Geo = {
        build(name, rings, centers, capStart, capEnd, scene) {
            const N = rings.length, M = rings[0].length;
            const positions = new Float32Array(N * M * 3 + 6);
            const uvs = new Float32Array(N * M * 2 + 4);
            let p = 0, q = 0;
            for (let i = 0; i < N; i++) {
                const ring = rings[i], v = i / (N - 1);
                for (let j = 0; j < M; j++) {
                    positions[p++] = ring[j].x; positions[p++] = ring[j].y; positions[p++] = ring[j].z;
                    uvs[q++] = j / (M - 1); uvs[q++] = v;
                }
            }
            const capA = N * M, capB = N * M + 1;
            positions[p++] = centers[0].x; positions[p++] = centers[0].y; positions[p++] = centers[0].z;
            positions[p++] = centers[N - 1].x; positions[p++] = centers[N - 1].y; positions[p++] = centers[N - 1].z;
            uvs[q++] = 0.5; uvs[q++] = 0.0;
            uvs[q++] = 0.5; uvs[q++] = 1.0;

            const sideIndices = (flip) => {
                const idx = [];
                for (let i = 0; i < N - 1; i++) {
                    for (let j = 0; j < M - 1; j++) {
                        const a = i * M + j, b = a + 1, c = a + M, d = c + 1;
                        if (flip) idx.push(a, b, c, b, d, c);
                        else idx.push(a, c, b, b, c, d);
                    }
                }
                return idx;
            };
            const facesToward = (ia, ib, ic, dx, dy, dz) => {
                const ax = positions[ia * 3], ay = positions[ia * 3 + 1], az = positions[ia * 3 + 2];
                const e1x = positions[ib * 3] - ax, e1y = positions[ib * 3 + 1] - ay, e1z = positions[ib * 3 + 2] - az;
                const e2x = positions[ic * 3] - ax, e2y = positions[ic * 3 + 1] - ay, e2z = positions[ic * 3 + 2] - az;
                const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
                return nx * dx + ny * dy + nz * dz > 0;
            };

            let indices = sideIndices(false);
            let normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);

            let mi = Math.floor(N / 2), best = -1;
            for (let i = 1; i < N - 1; i++) {
                const d = Math.hypot(rings[i][0].x - centers[i].x, rings[i][0].y - centers[i].y, rings[i][0].z - centers[i].z);
                if (d > best) { best = d; mi = i; }
            }
            const mj = Math.floor(M / 4);
            const vi = mi * M + mj, cc = centers[mi];
            const ox = positions[vi * 3] - cc.x, oy = positions[vi * 3 + 1] - cc.y, oz = positions[vi * 3 + 2] - cc.z;
            const dot = ox * normals[vi * 3] + oy * normals[vi * 3 + 1] + oz * normals[vi * 3 + 2];
            if (dot < 0) indices = sideIndices(true);

            // 【対策】キャップの巻き順は側面の flip と一致しない。同じフラグを
            //         流用すると、側面が正しいときキャップが裏返って穴に見える
            if (capStart) {
                const b = { x: centers[0].x - centers[1].x, y: centers[0].y - centers[1].y, z: centers[0].z - centers[1].z };
                const ok = facesToward(capA, 0, 1, b.x, b.y, b.z);
                for (let j = 0; j < M - 1; j++) { if (ok) indices.push(capA, j, j + 1); else indices.push(capA, j + 1, j); }
            }
            if (capEnd) {
                const o = (N - 1) * M;
                const f = { x: centers[N - 1].x - centers[N - 2].x, y: centers[N - 1].y - centers[N - 2].y, z: centers[N - 1].z - centers[N - 2].z };
                const ok = facesToward(capB, o, o + 1, f.x, f.y, f.z);
                for (let j = 0; j < M - 1; j++) { if (ok) indices.push(capB, o + j, o + j + 1); else indices.push(capB, o + j + 1, o + j); }
            }
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);

            const mesh = new BABYLON.Mesh(name, scene);
            const vd = new BABYLON.VertexData();
            vd.positions = positions; vd.indices = indices;
            vd.normals = normals; vd.uvs = uvs;
            vd.applyToMesh(mesh, false);
            return mesh;
        },

        ring(center, outer, side, M, radiusOf) {
            const pts = [];
            for (let j = 0; j <= M; j++) {
                const phi = (j % M) / M * TAU;
                const rr = radiusOf(phi);
                const a = j / M * TAU, ca = Math.cos(a), sa = Math.sin(a);
                pts.push(new V3(
                    center.x + (outer.x * ca + side.x * sa) * rr,
                    center.y + (outer.y * ca + side.y * sa) * rr,
                    center.z + (outer.z * ca + side.z * sa) * rr
                ));
            }
            return pts;
        },

        // 【対策】各点で「上ベクトルとの外積」から断面の基底を作ると、接線が
        //         鉛直に近づいた所で基底が暴れて筒がねじれる。ひとつ前の基底を
        //         接線に直交する平面へ射影して運ぶ（平行移動フレーム）
        tube(points, M, radiusOf) {
            const n = points.length, rings = [], centers = [];
            let nrm = null;
            for (let i = 0; i < n; i++) {
                const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
                let t = b.subtract(a);
                if (t.lengthSquared() < 1e-12) t = new V3(0, 1, 0);
                t.normalize();
                if (!nrm) {
                    const ref = Math.abs(t.y) > 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0);
                    nrm = V3.Cross(t, ref).normalize();
                } else {
                    nrm = nrm.subtract(t.scale(V3.Dot(nrm, t)));
                    if (nrm.lengthSquared() < 1e-10) {
                        const ref = Math.abs(t.y) > 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0);
                        nrm = V3.Cross(t, ref);
                    }
                    nrm.normalize();
                }
                const bin = V3.Cross(t, nrm).normalize();
                const s = i / (n - 1);
                rings.push(this.ring(points[i], nrm, bin, M, (phi) => radiusOf(s, phi)));
                centers.push(points[i]);
            }
            return { rings, centers };
        }
    };

    // =================================================================
    // 3. Noise
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
        // x（＝周方向 u）だけ period で巻く。継ぎ目が出ないのはこのため
        fbm(x, y, basePeriod, seed, octaves) {
            let sum = 0, amp = 0.5, f = 1;
            for (let o = 0; o < octaves; o++) {
                sum += amp * this._value(x * f, y * f, basePeriod * f, seed + o * 131);
                f *= 2; amp *= 0.5;
            }
            return sum;
        },

        // 【対策】fbm の出力は 0..1 に一様分布しない。実測すると
        //         2オクターブで 平均0.403 / 標準偏差0.133（最大でも0.72）、
        //         3オクターブで 平均0.467 / 標準偏差0.134（最大0.81）。
        //         つまり smooth(0.86, 0.96, fbm) のような閾値は一度も発火しない。
        //         v1 で焼き目・炭化・胡椒・脂の粒が全部出ず、生っぽい肌色の
        //         ソーセージになっていたのはこれが原因だった。
        //         正規分布の CDF で一様化し、閾値をそのまま「面積比」として読む
        _M: [0, 0.285, 0.403, 0.467, 0.498],
        _S: [1, 0.113, 0.133, 0.134, 0.134],
        fbmN(x, y, basePeriod, seed, octaves) {
            const o = Math.min(4, Math.max(1, octaves | 0));
            const z = (this.fbm(x, y, basePeriod, seed, o) - this._M[o]) / this._S[o];
            return clamp(0.5 * (1 + Math.tanh(0.7988 * z * (1 + 0.04417 * z * z))), 0, 1);
        }
    };

    // 焼け具合の場（0=焼けていない … 1=炭）。
    // アルベド・粗さ・脂の膜・法線がすべて同じ場を参照する。
    // 【対策】層ごとに別のノイズを引くと、焼き目の位置と「そこだけ光らない」
    //         位置がずれて、色を塗っただけに見える
    const Cook = {
        at(u, v, sk) {
            // 【対策】斑が大きいと、長手方向に伸びた帯になって焼き縞に見える。
            //         細かく散らす
            return Noise.fbmN(u * 5, v * 12, 5, sk.seed + 3, 3) * 0.70
                + Noise.fbmN(u * 13, v * 28, 13, sk.seed + 7, 2) * 0.30;
        },
        // 【対策】閾値は「B の実測分布」に対して決める。この場は中央値0.317・
        //         p85=0.563 で、0.5 を中心にはしていない。0.86 などにすると
        //         炭化が一度も出ない
        burn(B) { return smooth(0.70, 0.92, B); }
    };

    // =================================================================
    // 4. Form : 太さの場（頂点とテクスチャで共有する）
    //   ・t は「リングの通し番号」。長手方向の位置 s(t) とは別物で、
    //     テクスチャの v ＝ t。形の特徴は全部 t で書き、位置だけ s(t) を使う
    // =================================================================
    const Form = {
        // 【対策】t を等間隔に置くと、太さが急に変わる先端でリングが足りず
        //         結び目が多角形になる。両端に寄せて中央を粗くする
        sOf(t) { return t - 0.55 / TAU * Math.sin(TAU * t); },
        // 逆写像（コライダーは長さで刻みたいので必要）。単調なので二分法で十分
        tOfS(v) {
            let lo = 0, hi = 1;
            for (let k = 0; k < 22; k++) { const m = (lo + hi) * 0.5; if (this.sOf(m) < v) lo = m; else hi = m; }
            return (lo + hi) * 0.5;
        },

        // 胴の輪郭（0..1）。
        // 【対策】v3〜v9 は「full径のまま端まで来て、最後だけドームで閉じる」形
        //         だったので、端が切り落とした管に見え、全体としてチクワの
        //         印象になっていた。実物は中央がいちばん太く、両端へ向かって
        //         全長の1/4ほどをかけてなだらかに細る紡錘形。
        //         先端からの太さを実測で比べると：
        //           旧 0.2R:29% 0.5R:88% 1.0R:99%（＝ほぼ円柱）
        //           新 0.2R:38% 0.5R:64% 1.0R:81%（実物の目安 42/62/80）
        //         95%径に達する距離も 0.61R → 2.42R（目安2.5R）になる
        body(t, g) {
            const a = Math.abs(2 * clamp(t, 0, 1) - 1);
            const r = Math.pow(Math.max(0, 1 - Math.pow(a, g.spindleP)), 1 / g.spindleQ);
            // 先端はケーシングをねじって留めた跡が残り、丸く絞られる
            const e = Math.min(t, 1 - t) / g.tipPinchLen;
            return r * (1 - g.tipPinch * Math.exp(-Math.pow(e, 1.6)));
        }
    };

    // =================================================================
    // 5. TextureLab
    // =================================================================
    const TextureLab = {
        _tex(name, w, h, fill, scene) {
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

        // 縦に裂けた所（焼けて中身が少し覗く）。全体の割れ目は1本で十分
        splitAt(u, v, sp) {
            if (!sp) return 0;
            const wob = (Noise.fbm(0.31, v * 5.5, 3, sp.seed, 2) - 0.5) * 0.06;
            const d = wrapU(u, sp.u + wob) / sp.w;
            if (d >= 1) return 0;
            const along = smooth(sp.v0, sp.v0 + 0.10, v) * (1 - smooth(sp.v1 - 0.10, sp.v1, v));
            return Math.pow(1 - d, 1.3) * along;
        },

        albedo(scene, w, h, cfg, sk) {
            const PALE = cfg.pale, COOK = cfg.cook, CHAR = cfg.char, BURN = cfg.burn;
            const FAT = [0.905, 0.845, 0.760];
            const PEP = [0.115, 0.095, 0.080];
            const HERB = [0.255, 0.330, 0.150];
            const MEAT = [0.760, 0.480, 0.420];        // 裂け目から覗く中身
            const TIEC = [0.330, 0.175, 0.095];        // 結び目は必ず濃く焼ける
            return this._tex("wienerAlbedo", w, h, (d, W, H) => {
                for (let y = 0; y < H; y++) {
                    const v = y / H;
                    // 【対策】端の焦げを広く強く入れると、ひだの星と重なって
                    //         「焼けた傘」になる。結び目のごく近くだけ
                    const tieK = smooth(0.030, 0.0, v) + smooth(0.970, 1.0, v);
                    for (let x = 0; x < W; x++) {
                        const u = x / W, i = (y * W + x) * 4;
                        // 焼き色は「連続した焼け具合の場」から作る。等高線状の
                        // グラデーションにするとエアブラシで塗った棒になる
                        const B = Cook.at(u, v, sk);
                        const cookK = smooth(0.0, 0.18, B);
                        let cr = mix(PALE[0], COOK[0], cookK);
                        let cg = mix(PALE[1], COOK[1], cookK);
                        let cb = mix(PALE[2], COOK[2], cookK);
                        // 濃く焼けた斑（実測で面積の28%）
                        const charK = smooth(0.30, 0.62, B) * cfg.cookAmount;
                        cr = mix(cr, CHAR[0], charK); cg = mix(cg, CHAR[1], charK); cb = mix(cb, CHAR[2], charK);
                        // 炭化した点（実測で面積の2.4%）
                        const burnK = Cook.burn(B);
                        cr = mix(cr, BURN[0], burnK); cg = mix(cg, BURN[1], burnK); cb = mix(cb, BURN[2], burnK);
                        // 焼きの浅い所（フライパンに当たらなかった面）
                        // 【対策】焼きの浅い所を広く淡く出すと、白い地に橙が乗った
                        //         チクワの二色に見える。実物のウィンナーは
                        //         全体が橙で、淡い所も橙のまま
                        const paleK = smooth(0.62, 0.92, Noise.fbmN(u * 4, v * 8, 4, sk.seed + 11, 2))
                            * cfg.paleAmount * (1 - burnK);
                        cr = mix(cr, PALE[0], paleK * 0.75); cg = mix(cg, PALE[1], paleK * 0.75); cb = mix(cb, PALE[2], paleK * 0.75);
                        // ケーシング越しに透ける脂の粒・胡椒・ハーブ
                        if (cfg.fat > 0) {
                            const f = smooth(0.88, 0.965, Noise.fbmN(u * 26, v * 60, 26, sk.seed + 41, 2)) * cfg.fat * (1 - charK * 0.7);
                            cr = mix(cr, FAT[0], f * 0.55); cg = mix(cg, FAT[1], f * 0.55); cb = mix(cb, FAT[2], f * 0.55);
                        }
                        if (cfg.pepper > 0) {
                            const p = smooth(0.945, 0.985, Noise.fbmN(u * 60, v * 150, 60, sk.seed + 53, 2)) * cfg.pepper;
                            cr = mix(cr, PEP[0], p * 0.80); cg = mix(cg, PEP[1], p * 0.80); cb = mix(cb, PEP[2], p * 0.80);
                        }
                        if (cfg.herb > 0) {
                            const g = smooth(0.930, 0.982, Noise.fbmN(u * 44, v * 110, 44, sk.seed + 61, 2)) * cfg.herb;
                            cr = mix(cr, HERB[0], g * 0.75); cg = mix(cg, HERB[1], g * 0.75); cb = mix(cb, HERB[2], g * 0.75);
                        }
                        // 縦の繊維（ケーシングの目）
                        // 【対策】周方向に細かく長手方向に長い＝画面上は「縦の縞」。
                        //         0.085 は強すぎてチクワの焼き縞に見えていた
                        const fib = (Noise.fbmN(u * 34, v * 5.0, 34, sk.seed + 71, 2) - 0.5) * 0.030;
                        cr = clamp(cr + fib, 0, 1); cg = clamp(cg + fib * 0.8, 0, 1); cb = clamp(cb + fib * 0.6, 0, 1);
                        // 裂け目：縁は濃く焼け、内側は淡い肉色
                        const sp = this.splitAt(u, v, sk.split);
                        if (sp > 0) {
                            const lip = smooth(0.05, 0.45, sp) * (1 - smooth(0.45, 0.75, sp));
                            cr = mix(cr, CHAR[0], lip * 0.7); cg = mix(cg, CHAR[1], lip * 0.7); cb = mix(cb, CHAR[2], lip * 0.7);
                            const core = smooth(0.50, 0.85, sp);
                            cr = mix(cr, MEAT[0], core); cg = mix(cg, MEAT[1], core); cb = mix(cb, MEAT[2], core);
                        }
                        // 結び目は火が回りやすく必ず濃い
                        if (tieK > 0) {
                            const wgt = tieK * 0.62 * (0.55 + 0.45 * Noise.fbmN(u * 8, v * 30, 8, sk.seed + 83, 2));
                            cr = mix(cr, TIEC[0], wgt); cg = mix(cg, TIEC[1], wgt); cb = mix(cb, TIEC[2], wgt);
                        }
                        d[i] = clamp(cr, 0, 1) * 255;
                        d[i + 1] = clamp(cg, 0, 1) * 255;
                        d[i + 2] = clamp(cb, 0, 1) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        orm(scene, w, h, cfg, sk) {
            return this._tex("wienerORM", w, h, (d, W, H) => {
                for (let y = 0; y < H; y++) {
                    const v = y / H;
                    const tieK = smooth(0.06, 0.0, v) + smooth(0.94, 1.0, v);
                    for (let x = 0; x < W; x++) {
                        const u = x / W, i = (y * W + x) * 4;
                        let rough = cfg.casingRough * (0.85 + 0.32 * Noise.fbmN(u * 9, v * 20, 9, sk.seed + 5, 2));
                        let ao = 1.0;
                        // 【対策】炭化した点まで同じに光ると、全体がラップを掛けた
                        //         プラスチックに見える。焦げだけは明確に粗くする
                        const burnK = Cook.burn(Cook.at(u, v, sk));
                        rough = mix(rough, 0.78, burnK);
                        rough = mix(rough, 0.70, tieK * 0.8);
                        const sp = this.splitAt(u, v, sk.split);
                        rough = mix(rough, 0.62, smooth(0.45, 0.85, sp));
                        ao = mix(ao, 0.55, smooth(0.30, 0.90, sp));
                        ao = mix(ao, 0.62, tieK);
                        d[i] = clamp(ao, 0, 1) * 255;
                        d[i + 1] = clamp(rough, 0.04, 1) * 255;
                        d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // 脂の膜。R = 強度 / G = 粗さ（マテリアル側の値と乗算）
        grease(scene, w, h, cfg, sk) {
            return this._tex("wienerCoat", w, h, (d, W, H) => {
                for (let y = 0; y < H; y++) {
                    const v = y / H;
                    const tieK = smooth(0.06, 0.0, v) + smooth(0.94, 1.0, v);
                    for (let x = 0; x < W; x++) {
                        const u = x / W, i = (y * W + x) * 4;
                        // 膜は均一ではなく、まだらに薄い所がある
                        const film = Noise.fbmN(u * 5, v * 12, 5, sk.seed + 97, 3);
                        const burnK = Cook.burn(Cook.at(u, v, sk));
                        let inten = (0.74 + 0.26 * film) * cfg.grease * (1 - 0.80 * burnK) * (1 - 0.55 * tieK);
                        // 【対策】実効粗さ 0.14〜0.34 では照りが鈍く「茹でた」に見える。
                        //         焼き上がりの脂の膜はもっと鋭い（実効 0.08〜0.17）
                        let rough = 0.26 + 0.24 * (1 - film) + 0.55 * burnK;
                        d[i] = clamp(inten, 0, 1) * 255;
                        d[i + 1] = clamp(rough, 0.05, 1) * 255;
                        d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // 【対策】法線の V は (yd - yu)。Babylon の接空間は V が下向きなので
        //         OpenGL 系の (yu - yd) で焼くと皺が凸凹反転する
        normal(scene, w, h, cfg, sk) {
            const H0 = new Float32Array(w * h);
            for (let y = 0; y < h; y++) {
                const v = y / h;
                for (let x = 0; x < w; x++) {
                    const u = x / w;
                    // ケーシングの縦皺：周方向に細かく、長手方向に長い
                    // 同じ理由で皺も短くする（v の周期を上げる）
                    const wrinkle = Noise.fbmN(u * 30, v * 7, 30, sk.seed + 13, 3) * 0.55;
                    const grain = Noise.fbmN(u * 70, v * 90, 70, sk.seed + 17, 2) * 0.30;
                    const burnK = Cook.burn(Cook.at(u, v, sk));
                    const sp = this.splitAt(u, v, sk.split);
                    H0[y * w + x] = wrinkle + grain + burnK * 0.35 - smooth(0.35, 0.95, sp) * 1.15;
                }
            }
            return this._tex("wienerNormal", w, h, (d, W, H) => {
                for (let y = 0; y < H; y++) {
                    const vv = y / H;
                    const fade = smooth(0, 0.03, vv) * (1 - smooth(0.97, 1.0, vv));
                    const k = 0.85 * fade;
                    for (let x = 0; x < W; x++) {
                        const xl = H0[y * W + ((x - 1 + W) % W)], xr = H0[y * W + ((x + 1) % W)];
                        const yu = H0[Math.max(0, y - 1) * W + x], yd = H0[Math.min(H - 1, y + 1) * W + x];
                        let nx = (xl - xr) * k, ny = (yd - yu) * k, nz = 1;
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

        // 鉄板（1枚だけ焼いて使い回す）
        iron(scene, size, seed) {
            const alb = this._tex("panAlbedo", size, size, (d, W, H) => {
                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        const u = x / W, v = y / H, i = (y * W + x) * 4;
                        const cast = Noise.fbm(u * 22, v * 22, 22, seed, 3);
                        const worn = Noise.fbm(u * 6, v * 6, 6, seed + 7, 2);
                        const c = 0.030 + 0.045 * cast + 0.020 * worn;
                        d[i] = c * 255; d[i + 1] = c * 0.96 * 255; d[i + 2] = c * 0.92 * 255; d[i + 3] = 255;
                    }
                }
            }, scene);
            const hh = new Float32Array(size * size);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const u = x / size, v = y / size;
                    hh[y * size + x] = Noise.fbm(u * 40, v * 40, 40, seed + 3, 3) * 0.8
                        + Noise.fbm(u * 110, v * 110, 110, seed + 9, 2) * 0.3;
                }
            }
            const nrm = this._tex("panNormal", size, size, (d, W, H) => {
                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        const xl = hh[y * W + ((x - 1 + W) % W)], xr = hh[y * W + ((x + 1) % W)];
                        const yu = hh[Math.max(0, y - 1) * W + x], yd = hh[Math.min(H - 1, y + 1) * W + x];
                        let nx = (xl - xr) * 1.6, ny = (yd - yu) * 1.6, nz = 1;
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const i = (y * W + x) * 4;
                        d[i] = (nx * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
            return { alb, nrm };
        }
    };

    // =================================================================
    // 6. WienerSkin : 変種単位のテクスチャとマテリアル
    // =================================================================
    class WienerSkin {
        constructor(scene, cfg, variantSeed) {
            const rng = new Rng(variantSeed);
            this.seed = (variantSeed % 60000) | 0;
            this.split = rng.next() < cfg.splitChance ? {
                u: rng.next(), w: rng.range(0.020, 0.045),
                v0: rng.range(0.12, 0.34), v1: rng.range(0.60, 0.86),
                seed: (variantSeed % 9000) + 7
            } : null;

            const W = cfg.texW, H = cfg.texH;
            this.albedoTex = TextureLab.albedo(scene, W, H, cfg, this);
            this.ormTex = TextureLab.orm(scene, W, H, cfg, this);
            this.coatTex = TextureLab.grease(scene, W, H, cfg, this);
            this.normalTex = TextureLab.normal(scene, W, H, cfg, this);

            const pbr = new BABYLON.PBRMaterial("wienerMat", scene);
            pbr.albedoTexture = this.albedoTex;
            pbr.metallic = 0.0;
            pbr.roughness = 1.0;                  // 実値は ORM の G
            pbr.metallicTexture = this.ormTex;
            pbr.useAmbientOcclusionFromMetallicTextureRed = true;
            pbr.useRoughnessFromMetallicTextureGreen = true;
            pbr.useMetallnessFromMetallicTextureBlue = true;
            pbr.bumpTexture = this.normalTex;
            pbr.bumpTexture.level = 0.85;
            // 脂の膜。実効粗さ ≒ 0.32 × 0.26〜0.55 = 0.08〜0.17。
            // 焼き上がりのハイライトは点ではなく稜に沿った長い筋になる
            pbr.clearCoat.isEnabled = true;
            pbr.clearCoat.intensity = 1.0;        // 実値はテクスチャの R
            pbr.clearCoat.roughness = 0.32;
            pbr.clearCoat.texture = this.coatTex;
            pbr.clearCoat.useRoughnessFromMainTexture = true;
            pbr.clearCoat.indexOfRefraction = 1.44;
            // 挽き肉は光を通す。縁がわずかに赤く抜ける
            pbr.subSurface.isTranslucencyEnabled = true;
            pbr.subSurface.tintColor = new BABYLON.Color3(0.72, 0.30, 0.24);
            pbr.subSurface.translucencyIntensity = 0.22;
            pbr.subSurface.minimumThickness = 0.4;
            pbr.subSurface.maximumThickness = 1.8;
            this.mat = pbr;
        }
        dispose() {
            this.mat.dispose(true, false);
            this.albedoTex.dispose(); this.ormTex.dispose();
            this.coatTex.dispose(); this.normalTex.dispose();
        }
    }

    // =================================================================
    // 7. Wiener
    // =================================================================
    class Wiener {
        constructor(scene, cfg, seed, skin) {
            this.scene = scene; this.cfg = cfg; this.skin = skin;
            const rng = new Rng(seed);
            this.R = cfg.radius * rng.range(0.93, 1.07);
            this.L = cfg.length * rng.range(0.92, 1.08);
            // 弓なりの向きと大きさ。まっすぐな個体は無い
            // 【対策】曲がりの大小がばらつきすぎると、隣どうしが 1cm 以上
            //         食い込む。並べる前提なので振れ幅を抑える
            this.bendA = cfg.bend * rng.range(0.60, 1.15) * this.L;
            this.bendB = cfg.bend * rng.range(0.10, 0.45) * this.L;
            this.bendPhase = rng.range(0, TAU);
            this.plump = cfg.plump * rng.range(0.7, 1.35);
            this.plumpSeed = 200 + rng.int(900);
            this.pleatPhase = rng.range(0, TAU);
            this.twist = rng.range(-2.4, 2.4);
            this.oval = rng.range(0.010, 0.030);
            this.ovalPhase = rng.range(0, TAU);
            this.wrinkleSeed = 400 + rng.int(900);
            this.mesh = null;
            this._build();
        }

        radiusAt(t, phi) {
            const g = this.cfg;
            // 胴と、両端の結び目
            let r = Form.body(t, g) * this.R;
            // 詰め方のむらで太さが長手方向にうねる
            r *= 1 + this.plump * (Noise.fbmN(0.37, t * 5.0, 3, this.plumpSeed, 3) - 0.5) * 2;
            // 断面はわずかに楕円
            r *= 1 + this.oval * Math.cos(2 * (phi - this.ovalPhase));
            // ケーシングの皺（周方向に細かく長手方向に長い）と、浅いくぼみ
            r *= 1 + 0.016 * (Noise.fbmN(phi / TAU * 20, t * 9, 20, this.wrinkleSeed, 2) - 0.5) * 2
                + 0.018 * (Noise.fbmN(phi / TAU * 6, t * 13, 6, this.wrinkleSeed + 17, 2) - 0.5) * 2;
            // 結び目へ収束するひだ。
            // 【対策】v2 は「先端で最大・16%の範囲・深さ11%」だったので、
            //         端面いっぱいに放射状の星が出て、ねじり飴の包み紙になった。
            //         実物のひだは結び目の少し手前だけに浅く出る。先端そのものは
            //         滑らかなドームなので、t=0 では振幅を 0 に戻す
            const band = (x) => smooth(0.0, 0.030, x) * (1 - smooth(0.055, 0.130, x));
            const near = Math.max(band(t), band(1 - t));
            if (near > 0) {
                const spin = this.twist * (t < 0.5 ? (0.13 - t) : (t - 0.87));
                r *= 1 - 0.060 * near * (0.5 + 0.5 * Math.cos(g.pleatCount * phi + this.pleatPhase + spin * 6));
            }
            // 【対策】結び目を別の輪郭として max で足していたが、端が紡錘形に
            //         なると常に胴の内側に埋もれ、逆に「管の口に栓をした」ような
            //         段差を作っていた。絞りとひだだけで表現する
            return Math.max(0.004, r);
        }

        // 背骨（局所 Y 軸）。
        // 【対策】原点を端に置くと、物理で回すときの見た目の基準が先端になり、
        //         落下の姿勢が直感と合わない。中央原点にしておく
        spineAtS(s) {
            const c = Math.sin(Math.PI * s);
            return new V3(
                this.bendB * c * Math.sin(this.bendPhase) * 0.35,
                (s - 0.5) * this.L,
                this.bendA * c + this.bendB * Math.sin(TAU * s + this.bendPhase) * 0.5
            );
        }
        spineAt(t) { return this.spineAtS(Form.sOf(t)); }

        // コライダー。
        // 【対策】凸包にすると弓なりの内側の窪みが埋まり、隣と重なるときに
        //         見えない肉で浮く。さらに結び目のタグが1本の尖った角として
        //         残り、そこを支点にいつまでも揺れる。背骨に沿ったカプセル列に
        //         すれば、曲がりも丸い断面もそのまま表現できて面数も増えない
        colliderShape(scene) {
            const g = this.cfg, K = g.capsuleCount;
            const container = new BABYLON.PhysicsShapeContainer(scene);
            const parts = [];
            // 【対策】カプセルの端は半球なので、区間を「リングの通し番号 t」で
            //         刻むと端のカプセルの半球が実物の先端より 6〜7mm も外へ
            //         はみ出し、見えないバンパーを付けたまま並ぶことになる。
            //         長さ（弧長）で刻み、端点を先端から半径ぶん内側に置くと、
            //         半球がちょうどドームに重なる
            // 端が細くなったぶん、カプセルの端点を先端寄りへ（実測で
            //   0.8R/L・6本が最良：はみ出し0.84mm / 包み過ぎ1.88mm / 端の差-0.23mm）
            const sA = clamp(0.8 * this.R / this.L, 0.03, 0.20);
            for (let i = 0; i < K; i++) {
                const s0 = mix(sA, 1 - sA, i / K), s1 = mix(sA, 1 - sA, (i + 1) / K);
                let r = 0;
                for (let k = 0; k <= 6; k++) r += this.radiusAt(Form.tOfS(mix(s0, s1, k / 6)), 0);
                r = r / 7 * g.capsuleShrink;
                const cap = new BABYLON.PhysicsShapeCapsule(this.spineAtS(s0), this.spineAtS(s1), r, scene);
                cap.material = { friction: g.friction, restitution: g.restitution };
                container.addChild(cap);
                parts.push(cap);
            }
            container.__parts = parts;      // 破棄用（子は自動では解放されない）
            return container;
        }

        // 慣性主モーメント（質量1あたり）。円柱で近似すれば十分
        //   長軸まわり  I = R^2 / 2
        //   横軸まわり  I = (3R^2 + L^2) / 12
        inertiaPerMass() {
            const R = this.R, L = this.L;
            return new V3((3 * R * R + L * L) / 12, R * R / 2, (3 * R * R + L * L) / 12);
        }

        _build() {
            const g = this.cfg, K = g.segmentsLength, M = g.segmentsRound;
            const pts = [];
            for (let i = 0; i <= K; i++) pts.push(this.spineAt(i / K));
            const tb = Geo.tube(pts, M, (t, phi) => this.radiusAt(t, phi));
            const mesh = Geo.build("wiener", tb.rings, tb.centers, true, true, this.scene);
            mesh.material = this.skin.mat;
            mesh.receiveShadows = true;
            this.mesh = mesh;
        }
        dispose() { if (this.mesh) this.mesh.dispose(); }
    }

    // =================================================================
    // 8. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.035, 0.032, 0.030, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.30;
    scene.environmentIntensity = 0.76;
    scene.createDefaultSkybox(env, true, 1000, 0.80, false);

    const camera = new BABYLON.ArcRotateCamera("cam", -1.06, 1.06, 34, new V3(0, 0, 0), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 14;
    camera.minZ = 0.05;
    camera.lowerRadiusLimit = 8;
    camera.upperRadiusLimit = 140;
    scene.cameraToUseForPointers = camera;

    // 【対策】平行光源のハイライトは「点」になる。実物の照りは稜に沿って
    //         長く伸びた筋なので、環境の映り込みで作り specular は控えめにする
    const key = new BABYLON.DirectionalLight("key", new V3(-0.45, -0.90, 0.55).normalize(), scene);
    key.position = new V3(12, 24, -14);
    key.intensity = 2.6;
    key.diffuse = new BABYLON.Color3(1.0, 0.96, 0.90);
    key.specular = new BABYLON.Color3(0.62, 0.60, 0.56);
    key.autoCalcShadowZBounds = true;

    const rim = new BABYLON.DirectionalLight("rim", new V3(0.65, -0.28, -0.90).normalize(), scene);
    rim.intensity = 1.5;
    rim.diffuse = new BABYLON.Color3(1.0, 0.90, 0.82);
    rim.specular = new BABYLON.Color3(0.30, 0.28, 0.26);

    const fill = new BABYLON.HemisphericLight("fill", new V3(0, 1, 0), scene);
    fill.intensity = 0.20;
    fill.specular = new BABYLON.Color3(0, 0, 0);

    // 【対策】影は ESM ではなく PCF。ESM の自己遮蔽は皺に痣として出る
    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.forceBackFacesOnly = true;
    sg.bias = 0.0010;
    sg.normalBias = 0.012;
    sg.setDarkness(0.40);

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.05;
    ip.contrast = 1.16;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.4;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    // ---- 鉄板と台 ----------------------------------------------------
    let pan = null, panTopY = 0, table = null, ironTex = null;
    function ensurePan() {
        if (!GLOBAL.showPan || pan) return;
        // 見込みは水平に。傾けるとウィンナーが中心で沈み縁で浮く
        const prof = [
            new V3(0.00, 0.55, 0), new V3(7.60, 0.55, 0), new V3(9.60, 0.72, 0),
            new V3(10.60, 1.42, 0), new V3(11.00, 1.36, 0), new V3(10.55, 1.02, 0),
            new V3(9.90, 0.34, 0), new V3(5.20, 0.12, 0), new V3(4.60, 0.00, 0),
            new V3(4.20, 0.00, 0), new V3(3.95, 0.22, 0), new V3(0.00, 0.26, 0)
        ];
        pan = BABYLON.MeshBuilder.CreateLathe("pan", { shape: prof, tessellation: 128 }, scene);
        ironTex = TextureLab.iron(scene, 512, 3307);
        // 【対策】旋盤の UV は u が周方向なので、色テクスチャを貼ると
        //         中心へ収束する同心円の縞（レコード盤）になる。
        //         色は一様にして、細かい鋳肌は法線だけで出す
        ironTex.nrm.uScale = 5; ironTex.nrm.vScale = 2;
        const pm = new BABYLON.PBRMaterial("panMat", scene);
        pm.albedoColor = new BABYLON.Color3(0.052, 0.049, 0.047).toLinearSpace();
        pm.bumpTexture = ironTex.nrm;
        pm.bumpTexture.level = 0.55;
        pm.metallic = 0.0;                 // 黒皮の鋳鉄。金属反射ではなく油の照り
        pm.roughness = 0.50;
        pm.clearCoat.isEnabled = true;
        pm.clearCoat.intensity = 0.35;
        pm.clearCoat.roughness = 0.30;
        // 【対策】旋盤メッシュの巻き方向は実装依存。両面表示にすると面が二重に
        //         なって影がざらつくので、片面のまま二面ライティングで逃がす
        pm.backFaceCulling = false;
        pm.twoSidedLighting = true;
        pan.material = pm;
        pan.receiveShadows = true;
        panTopY = 0.55;

        table = BABYLON.MeshBuilder.CreateDisc("table", { radius: 70, tessellation: 64 }, scene);
        table.rotation.x = Math.PI / 2;
        const tm = new BABYLON.PBRMaterial("tableMat", scene);
        tm.albedoColor = new BABYLON.Color3(0.145, 0.105, 0.075).toLinearSpace();
        tm.metallic = 0.0; tm.roughness = 0.72;
        table.material = tm;
        table.receiveShadows = true;
        table.position.y = -0.002;
    }

    // 鉄板の見込みの高さ（投入位置の基準に使う）
    const PAN_INNER = [[0.0, 0.55], [7.60, 0.55], [9.60, 0.72], [10.60, 1.42]];
    function panInnerY(r) {
        if (!GLOBAL.showPan) return 0;
        const P = PAN_INNER;
        if (r <= P[0][0]) return P[0][1];
        for (let i = 1; i < P.length; i++) {
            if (r <= P[i][0]) {
                const t = (r - P[i - 1][0]) / (P[i][0] - P[i - 1][0]);
                return mix(P[i - 1][1], P[i][1], t);
            }
        }
        return P[P.length - 1][1];
    }

    // =================================================================
    // 9. 物理 / 生成 / 差し替え
    // =================================================================
    let state = null;
    const skinCache = {};
    let ssao = null, onRebuilt = null, framed = false;

    function hashStr(s) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
        return h >>> 0;
    }
    function getSkin(presetKey, cfg, variant) {
        const k = presetKey + "|" + variant;
        if (!skinCache[k]) skinCache[k] = new WienerSkin(scene, cfg, hashStr(k));
        return skinCache[k];
    }
    function meshBounds(m) {
        m.computeWorldMatrix(true);
        return m.getBoundingInfo().boundingBox;
    }

    // ---- Havok -------------------------------------------------------
    function physMat(cfg) { return { friction: cfg.friction, restitution: cfg.restitution }; }

    function addStaticMeshBody(mesh, cfg) {
        const shape = new BABYLON.PhysicsShapeMesh(mesh, scene);
        shape.material = physMat(cfg);
        const body = new BABYLON.PhysicsBody(mesh, BABYLON.PhysicsMotionType.STATIC, false, scene);
        body.shape = shape;
        return body;
    }
    function addDynamicBody(mesh, shape, mass, cfg, inertia) {
        shape.material = physMat(cfg);
        const body = new BABYLON.PhysicsBody(mesh, BABYLON.PhysicsMotionType.DYNAMIC, false, scene);
        body.shape = shape;
        // 【対策】setMassProperties に mass だけ渡すと、慣性テンソルは既定値
        //         （各軸1）で上書きされる。長さ9.6cm・太さ2.2cm の棒の実際の
        //         慣性は 長軸まわり0.61 / 横軸まわり7.98（mass=1, cm系）で、
        //         横軸が13倍も違う。既定値のままだと横倒しの回転が異常に軽くなり、
        //         接触のたびにプロペラのように回る。1本目は皿へ平らに落ちるだけ
        //         なので露見せず、2本目以降で積み上がると一気に破綻する。
        //         中心・慣性・向きまで明示して渡す
        body.setMassProperties({
            mass,
            centerOfMass: V3.Zero(),          // 背骨の中央が原点
            inertia: inertia,
            inertiaOrientation: BABYLON.Quaternion.Identity()
        });
        // 【対策】damping は PhysicsAggregate のオプションでは効かない。
        //         PhysicsBody のメソッドで設定する
        body.setLinearDamping(cfg.linearDamping);
        body.setAngularDamping(cfg.angularDamping);
        // 【対策】スリープに落ちると空中でも止まる。静止の判定はこちらで
        //         持っていて、落ち着いたら STATIC に固定するので、
        //         シミュレーション中は常時アクティブにしておく
        //         （API の無いバージョンでは初速に頼る）
        const AC = BABYLON.PhysicsActivationControl;
        if (AC) {
            const plugin = scene.getPhysicsEngine && scene.getPhysicsEngine()
                ? scene.getPhysicsEngine().getPhysicsPlugin() : null;
            if (body.setActivationControl) body.setActivationControl(AC.ALWAYS_ACTIVE);
            else if (plugin && plugin.setActivationControl) plugin.setActivationControl(body, AC.ALWAYS_ACTIVE);
        }
        // 【対策】毎フレーム「メッシュの姿勢 → ボディ」へ書き戻すと、物理が出した
        //         結果を読み直して押し込む往復が起きる。動的ボディでは切る
        body.disablePreStep = true;
        return body;
    }

    // ---- デバッグ出力 --------------------------------------------------
    const DBG = {
        on: GLOBAL.debug, frame: 0,
        log(...a) { if (this.on) console.log("%c[W]", "color:#e8a", ...a); },
        warn(...a) { if (this.on) console.warn("[W]", ...a); },
        err(...a) { console.error("[W]", ...a); },
        n(v, d) { return (v === undefined || v === null || isNaN(v)) ? "-" : (+v).toFixed(d === undefined ? 2 : d); },
        v(v, d) { return v ? "(" + this.n(v.x, d) + "," + this.n(v.y, d) + "," + this.n(v.z, d) + ")" : "-"; },
        motion(b) {
            try {
                const m = b.getMotionType();
                return m === BABYLON.PhysicsMotionType.DYNAMIC ? "DYNAMIC"
                    : m === BABYLON.PhysicsMotionType.STATIC ? "STATIC" : "ANIMATED(" + m + ")";
            } catch (e) { return "?"; }
        },
        mass(b) {
            try {
                const mp = b.getMassProperties();
                return "m=" + this.n(mp.mass, 3) + " I=" + this.v(mp.inertia, 2) + " com=" + this.v(mp.centerOfMass, 2);
            } catch (e) { return "取得できず(" + e.message + ")"; }
        }
    };

    let probe = null;               // 検査球（宣言は初期化ブロックより前に置く）
    ensurePan();
    let physicsOn = false;
    if (GLOBAL.usePhysics) {
        try {
            const havok = await HavokPhysics();
            // 【対策】HavokPlugin の第1引数は _useDeltaForWorldStep。true（既定）だと
            //         フレームのデルタ時間でそのまま積分するため、フレーム落ちの
            //         たびにステップ幅が変わり、接触が解けたり深く食い込んだりを
            //         繰り返して震える。false にして固定ステップにする
            const hk = new BABYLON.HavokPlugin(false, havok);
            scene.enablePhysics(new V3(0, -GLOBAL.gravity, 0), hk);
            if (hk.setTimeStep) hk.setTimeStep(1 / GLOBAL.physicsHz);
            const pe = scene.getPhysicsEngine();
            DBG.log("=== 物理の初期化 ===");
            DBG.log("プラグイン:", pe.getPhysicsPluginName ? pe.getPhysicsPluginName() : "?",
                "／ 重力:", DBG.v(pe.gravity), "／ タイムステップ:", DBG.n(pe.getTimeStep && pe.getTimeStep(), 4));
            DBG.log("setTimeStep:", typeof hk.setTimeStep,
                "／ PhysicsActivationControl:", !!BABYLON.PhysicsActivationControl,
                "／ PhysicsBody.setActivationControl:", typeof BABYLON.PhysicsBody.prototype.setActivationControl,
                "／ plugin.setActivationControl:", typeof hk.setActivationControl);
            // 【対策】鉄板の当たり判定に三角形メッシュ（2838枚）を使うと、
            //         見込みが中心へ収束する扇状の三角形になっているため、
            //         その内部の稜線に接触点が引っかかって延々と揺れ続ける
            //         （実測で速度が 500 フレーム経っても 3〜5cm/s から下がらない）。
            //         見込みは平面なので、解析形状（円柱＋縁の柵）に置き換える。
            //         メッシュは見た目専用にする
            if (pan) {
                DBG.log("鉄板は見た目専用（当たり判定は円柱＋柵の解析形状）／ 面 y=" + DBG.n(panTopY));
            }
            // 【対策】table は CreateDisc を rotation.x = π/2 で寝かせたメッシュ。
            //         ここへ箱の形状を付けると、箱もその回転を受けて
            //         「厚み4cm の水平な床」が「z = -4〜0・y = ±150 の縦の壁」に化ける。
            //         実際この壁の中へ落ちた個体だけが空中で止まっていた
            //         （壁の外に落ちた個体は正常に着地していた）。
            //         物理用のノードは回転させず、専用の TransformNode に付ける
            const floorNode = new BABYLON.TransformNode("floorBody", scene);
            floorNode.rotationQuaternion = BABYLON.Quaternion.Identity();
            const tShape = new BABYLON.PhysicsShapeBox(
                new V3(0, -5, 0), BABYLON.Quaternion.Identity(), new V3(400, 10, 400), scene);
            tShape.material = physMat(GLOBAL);
            const tBody = new BABYLON.PhysicsBody(floorNode, BABYLON.PhysicsMotionType.STATIC, false, scene);
            tBody.shape = tShape;
            DBG.log("床の静的ボディ: y -10〜0 の水平な箱（メッシュの回転を受けない専用ノード）");

            // 【対策】鉄板の殻は見込み 0.55 / 裏 0.26 で厚さ約3mm しかない。
            //         終端速度（このシーンでは 200cm/s ＝ 1ステップ1.7cm）で
            //         落ちてきた個体は三角形メッシュをすり抜ける。
            //         見込みの真下に厚い円柱を1本仕込んで裏打ちする
            const plugNode = new BABYLON.TransformNode("panPlug", scene);
            plugNode.rotationQuaternion = BABYLON.Quaternion.Identity();
            // 【対策】コライダーは表示メッシュより 5% 細いので、そのままだと
            //         見た目が 1〜2mm 沈む。円柱の上端を少し持ち上げて相殺する
            const plugTop = panTopY + GLOBAL.contactLift;
            const plugShapes = new BABYLON.PhysicsShapeContainer(scene);
            const plugParts = [];
            const plug = new BABYLON.PhysicsShapeCylinder(
                new V3(0, plugTop - 9, 0), new V3(0, plugTop, 0), 8.6, scene);
            plug.material = physMat(GLOBAL);
            plugShapes.addChild(plug); plugParts.push(plug);
            // 縁の柵。転がり出た個体を鉄板の上に留める（見えている縁の内側に置く）
            const FN = 24, FR = 10.4;
            for (let i = 0; i < FN; i++) {
                const a = i / FN * TAU;
                const b = new BABYLON.PhysicsShapeBox(
                    new V3(Math.cos(a) * FR, plugTop + 1.4, Math.sin(a) * FR),
                    BABYLON.Quaternion.FromEulerAngles(0, -a, 0),
                    new V3(1.6, 2.8, TAU * FR / FN * 1.35), scene);
                b.material = physMat(GLOBAL);
                plugShapes.addChild(b); plugParts.push(b);
            }
            const plugBody = new BABYLON.PhysicsBody(plugNode, BABYLON.PhysicsMotionType.STATIC, false, scene);
            plugBody.shape = plugShapes;
            DBG.log("鉄板の当たり判定: 半径8.6cm・上端 y=" + DBG.n(plugTop) + " の円柱 ＋ 柵" + FN + "枚（内側 r="
                + DBG.n(FR - 0.8) + "）");
            physicsOn = true;
            // 【診断】ワールドが本当に進んでいるかを見るための検査球。
            //         これが落ちなければ「そもそもステップしていない」、
            //         落ちるのにウィンナーが止まるなら「剛体側の問題」と切り分く
            if (GLOBAL.debugProbe && GLOBAL.debug) {
                const pm = BABYLON.MeshBuilder.CreateSphere("probe", { diameter: 1.0, segments: 6 }, scene);
                pm.isVisible = false;
                pm.position.set(24, 14, 24);
                pm.rotationQuaternion = BABYLON.Quaternion.Identity();
                const ps = new BABYLON.PhysicsShapeSphere(V3.Zero(), 0.5, scene);
                const pb = new BABYLON.PhysicsBody(pm, BABYLON.PhysicsMotionType.DYNAMIC, false, scene);
                pb.shape = ps;
                probe = { mesh: pm, body: pb, y0: 14, logged: 0 };
                DBG.log("検査球を投入 y=14（重力だけで落ちるはず）", DBG.mass(pb));
            }
        } catch (e) {
            console.warn("[Wiener] Havok を初期化できませんでした。並べる配置にフォールバックします", e);
        }
    }

    // ---- 物理を使わないときの配置（従来どおり並べる）--------------------
    function layoutFallback(wieners, cfg, seed) {
        const rng = new Rng(seed >>> 0);
        const count = wieners.length;
        const onTop = count >= 4 ? 1 : 0, lower = count - onTop;
        for (let i = 0; i < count; i++) {
            const m = wieners[i].mesh;
            m.setEnabled(true);
            m.rotationQuaternion = null;
            m.rotation.z = Math.PI / 2;
            m.rotation.x = rng.range(-0.35, 0.35);
            if (i < lower) {
                const k = i - (lower - 1) / 2;
                m.rotation.y = k * rng.range(0.10, 0.20) + rng.gauss(0, 0.05);
                m.position.set(rng.range(-0.5, 0.5), 0, k * cfg.radius * 2.50 + rng.range(-0.10, 0.10));
            } else {
                m.rotation.y = rng.range(0.42, 0.72) * (rng.next() < 0.5 ? -1 : 1);
                m.position.set(rng.range(-1.2, 1.2), 0, rng.range(-0.6, 0.6));
            }
            const bb = meshBounds(m);
            m.position.y += ((i < lower) ? panTopY : panTopY + cfg.radius * 1.75) - bb.minimumWorld.y;
        }
    }

    // ---- 投入キュー ----------------------------------------------------
    let queue = [], dropIndex = 0, dropTimer = 0, postDropTimer = 0, frozen = false;

    function clearAll() {
        for (const it of queue) {
            if (it.body) it.body.dispose();
            if (it.shape) {
                if (it.shape.__parts) for (const c of it.shape.__parts) c.dispose();
                it.shape.dispose();
            }
        }
        if (state) for (const w of state.wieners) w.dispose();
        queue = []; dropIndex = 0; dropTimer = 0; postDropTimer = 0; frozen = false;
        state = null;
    }

    // 投入位置の真下にある物の上端。
    // 【対策】山全体の頂点を基準にすると、外側へ置く物まで山の高さぶん
    //         持ち上げられ、鉄板の縁の上から落ちてくることになる。
    //         水平方向に重なっている物だけを見る
    function localTopY(x, z, rh) {
        let top = panInnerY(Math.hypot(x, z));
        for (let i = 0; i < dropIndex; i++) {
            const m = queue[i].mesh;
            m.computeWorldMatrix(true);
            const bb = m.getBoundingInfo().boundingBox;
            const c = bb.centerWorld, e = bb.extendSizeWorld;
            if (Math.hypot(x - c.x, z - c.z) < rh + Math.max(e.x, e.z)) {
                top = Math.max(top, bb.maximumWorld.y);
            }
        }
        return top;
    }

    // 【対策】全部を同時に生成すると、初期状態で互いにめり込んでいるぶんの
    //         反発が一気に解放されて弾け飛ぶ。1本ずつ、真下の物のすぐ上から放す。
    //         落下高さを稼ぐとバウンドと貫通の両方が出るので数cmに留める
    function spawnNext() {
        const it = queue[dropIndex];
        const idx = dropIndex;
        it.mesh.setEnabled(true);
        it.mesh.position.set(it.x, 0, it.z);
        it.mesh.computeWorldMatrix(true);
        const bb = it.mesh.getBoundingInfo().boundingBox;
        const e = bb.extendSizeWorld, c = bb.centerWorld;
        const bottomOffset = c.y - e.y;                  // 原点から最下点まで
        // 【対策】どれか1本が空中で止まると、次はその上に置かれ、以降が
        //         塔のように積み上がって取り返しがつかなくなる。上限で止める
        const top = Math.min(localTopY(it.x, it.z, Math.max(e.x, e.z)), panTopY + GLOBAL.maxPileY);
        it.mesh.position.y = top + GLOBAL.dropClearance - bottomOffset;
        it.mesh.computeWorldMatrix(true);
        it.shape = it.makeShape();
        it.body = addDynamicBody(it.mesh, it.shape, GLOBAL.pieceMass, GLOBAL,
            it.inertia.scale(GLOBAL.pieceMass));
        // 【対策】生成直後の剛体は速度ゼロ。落差が小さいと閾値を超える前に
        //         スリープ判定へ入り、そのまま空中で固まる。初速を与えて起こす
        it.body.setLinearVelocity(new V3(0, -GLOBAL.dropSpeed, 0));
        it.body.setAngularVelocity(V3.Zero());
        it._lastY = it.mesh.getBoundingInfo().boundingBox.minimumWorld.y;
        it._stuck = 0;
        DBG.log("投入 #" + idx,
            "位置 (" + DBG.n(it.x) + "," + DBG.n(it.mesh.position.y) + "," + DBG.n(it.z) + ")",
            "／ 下端 y=" + DBG.n(it._lastY), "（真下の上端 " + DBG.n(top) + " + 落差 " + DBG.n(GLOBAL.dropClearance) + "）",
            "／ カプセル " + (it.shape.__parts ? it.shape.__parts.length : "?") + "本",
            "／ " + DBG.motion(it.body), "／ " + DBG.mass(it.body),
            "／ 初速 " + DBG.v(it.body.getLinearVelocity()));
        dropIndex++;
    }

    function build(presetKey, seed, count) {
        clearAll();
        const cfg = Object.assign({}, GLOBAL, PRESETS[presetKey]);
        cfg.preset = presetKey; cfg.seed = seed >>> 0;

        const t0 = performance.now();
        const rng = new Rng((cfg.seed ^ 0x9E3779B9) >>> 0);
        const wieners = [];
        const a0 = rng.range(0, TAU);

        for (let i = 0; i < count; i++) {
            const skin = getSkin(presetKey, cfg, i % cfg.skinVariants);
            const w = new Wiener(scene, cfg, (cfg.seed + i * 104729) >>> 0, skin);
            wieners.push(w);
            // 【対策】物理で動かすメッシュは rotationQuaternion を使う。
            //         Euler の rotation のままだと Havok 側の姿勢と食い違う
            //         （寝かせるのは Z 回りに 90°。あとは落下に任せる）
            // 向きも「だいたい揃えて少しばらす」。真横を向くと隣と交差する
            w.mesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
                rng.gauss(0, 0.22), a0 + rng.gauss(0, 0.30), Math.PI / 2 + rng.gauss(0, 0.18));
            // 【対策】半径1.9cm に撒いていたが、ウィンナーは長さ9cm・太さ2.1cm。
            //         全員が同じ場所へ落ちて深く食い込み、ソルバが押し合いを
            //         解き続けて永久に揺れていた（実測で投入位置の間隔が
            //         1.2〜3.3cm しかなく、太さを下回る組が2組あった）。
            //         軸と直交する向きへ1本ずつずらして落とす
            const lane = (i - (count - 1) / 2) * cfg.radius * cfg.laneGap;
            const px = rng.range(-0.7, 0.7) + Math.sin(a0) * 0.3;
            const pz = lane + rng.range(-0.25, 0.25);
            w.mesh.position.set(px, 0, pz);
            queue.push({
                mesh: w.mesh,
                makeShape: () => w.colliderShape(scene),
                inertia: w.inertiaPerMass(),
                body: null, shape: null, quiet: 0, fixed: false,
                x: px, z: pz
            });
        }

        const meshes = wieners.map(w => w.mesh);
        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        for (const m of meshes) sg.addShadowCaster(m, true);
        if (pan) sg.addShadowCaster(pan, true);

        if (physicsOn) {
            for (const m of meshes) m.setEnabled(false);
            dropTimer = GLOBAL.dropInterval;             // 1本目はすぐ落とす
        } else {
            layoutFallback(wieners, cfg, cfg.seed);
        }

        camera.target.set(0, panTopY + cfg.radius * 1.0, 0);
        if (!framed) { camera.radius = 30; framed = true; }
        if (ssao) ssao.radius = cfg.radius * 0.55;

        state = { cfg, wieners, count };
        if (onRebuilt) onRebuilt(state);
        DBG.log("=== 生成 ===", cfg.label, "seed=" + cfg.seed, count + "本",
            "／ 物理", physicsOn ? "ON" : "OFF",
            "／ 太さ " + DBG.n(wieners[0].R * 2) + "cm 長さ " + DBG.n(wieners[0].L) + "cm",
            "／ 慣性(質量1) " + DBG.v(wieners[0].inertiaPerMass(), 3),
            "／ build " + (performance.now() - t0).toFixed(0) + "ms");
        DBG.log("設定: 重力 " + GLOBAL.gravity + " / " + GLOBAL.physicsHz + "Hz / 落差 "
            + GLOBAL.dropClearance + "cm / 初速 " + GLOBAL.dropSpeed + "cm/s / 間隔 "
            + GLOBAL.dropInterval + "s / 浮き許容 " + GLOBAL.airborneTol + "cm");
        // コンソールから触れるようにしておく（__w.dump() で現在の状態）
        window.__w = {
            queue, get dropIndex() { return dropIndex; }, probe, GLOBAL, scene,
            dump: () => dumpBodies("手動"),
            wake: () => { for (const it of queue) if (it.body) it.body.setLinearVelocity(new V3(0, -30, 0)); },
            state: () => ({ physicsOn, frozen, dropIndex, total: queue.length })
        };
        return state;
    }

    // 【対策】それでも空中で固まる個体が出たときの保険。浮いたまま速度が
    //         ほぼ 0 の物を見つけたら、下向きの初速を与えて起こし直す
    function wakeStuck() {
        for (let i = 0; i < dropIndex; i++) {
            const it = queue[i];
            if (!it.body) continue;
            it.mesh.computeWorldMatrix(true);
            const y = it.mesh.getBoundingInfo().boundingBox.minimumWorld.y;
            const dy = (it._lastY === undefined) ? 0 : y - it._lastY;
            it._lastY = y;
            const lv = it.body.getLinearVelocity();
            const v = lv.length();
            // 【対策】1ステップの移動量が薄い形状の厚みを超えるとすり抜ける。
            //         このシーンの終端速度は約200cm/s（1ステップ1.7cm）なので頭を押さえる
            if (v > GLOBAL.maxSpeed) it.body.setLinearVelocity(lv.scale(GLOBAL.maxSpeed / v));
            const air = y > panTopY + GLOBAL.airborneTol;

            // 【診断】「浮いたまま動いていない」個体を数える。原因の切り分けは
            //   速度あり + 動かない → 剛体は動いているのにメッシュが追随していない（同期）
            //   速度なし          → 眠っているか、力が加わっていない
            if (air && Math.abs(dy) < 0.004) it._stuck = (it._stuck || 0) + 1; else it._stuck = 0;
            if (it._stuck === 30 && !it._reported) {
                it._reported = true;
                DBG.warn("空中で停止 #" + i,
                    "下端 y=" + DBG.n(y) + "（浮 " + DBG.n(y - panTopY) + "cm）",
                    "／ 速度 " + DBG.n(v) + " cm/s", "／ 角速度 " + DBG.n(it.body.getAngularVelocity().length()),
                    "／ " + DBG.motion(it.body), "／ " + DBG.mass(it.body));
                DBG.warn("  推定原因:", v > 5
                    ? "剛体は動いているのにメッシュが追随していない（body→mesh の同期）"
                    : "剛体の速度がゼロ（スリープ、または重力が効いていない）");
                if (probe) {
                    probe.mesh.computeWorldMatrix(true);
                    DBG.warn("  参考: 検査球の落下量 " + DBG.n(probe.y0 - probe.mesh.position.y, 3) + "cm");
                }
                dumpBodies("  同時刻の全体");
            }
            if (air && v <= 1.0) it.body.setLinearVelocity(new V3(0, -GLOBAL.dropSpeed * 0.6, 0));
        }
    }

    // 【診断】1行にまとめた現在の状態。y は下端、v は速度、w は角速度
    function dumpBodies(tag) {
        if (!DBG.on) return;
        const rows = [];
        for (let i = 0; i < dropIndex; i++) {
            const it = queue[i];
            if (!it.body) continue;
            it.mesh.computeWorldMatrix(true);
            const y = it.mesh.getBoundingInfo().boundingBox.minimumWorld.y;
            const v = it.body.getLinearVelocity(), w = it.body.getAngularVelocity();
            rows.push("#" + i + " y=" + DBG.n(y) + " (浮" + DBG.n(y - panTopY) + ")"
                + " v=" + DBG.n(v.length()) + " w=" + DBG.n(w.length())
                + " " + DBG.motion(it.body));
        }
        DBG.log(tag, "|", rows.join("  |  "));
    }

    function physicsTick() {
        if (!physicsOn || frozen || queue.length === 0) return;
        DBG.frame++;
        // 検査球：ワールドが実際に進んでいるか
        if (probe && probe.logged < 6 && DBG.frame % 20 === 0) {
            probe.mesh.computeWorldMatrix(true);
            const y = probe.mesh.position.y, v = probe.body.getLinearVelocity();
            DBG.log("検査球 frame=" + DBG.frame, "y=" + DBG.n(y, 3),
                "落下量=" + DBG.n(probe.y0 - y, 3) + "cm", "v=" + DBG.v(v, 1),
                (probe.y0 - y < 0.01 ? "→ ワールドが進んでいない可能性" : "→ ワールドは進んでいる"));
            probe.logged++;
        }
        if (DBG.on && DBG.frame % GLOBAL.debugEvery === 0) dumpBodies("状態 f=" + DBG.frame);
        // 【対策】HavokPlugin(false, ...) は1フレームにつき固定幅で1回だけ進む。
        //         投入間隔を実時間で計ると、60fps では物理時間が実時間の半分しか
        //         進まないので、体感で倍の速さで次が降ってくる。前の1本が
        //         落ち着く前に次が乗るため、積むほど暴れる。
        //         タイマーも物理のステップ幅で刻む
        const dt = 1 / GLOBAL.physicsHz;
        wakeStuck();
        if (dropIndex < queue.length) {
            dropTimer += dt;
            // 【対策】固定間隔だけで投入すると、前の1本がまだ跳ねている山の上へ
            //         次を落とすことになり、積むほど乱れが増幅する。
            //         直前の1本が落ち着くまで待つ（待ちすぎないよう上限つき）
            const prev = dropIndex > 0 ? queue[dropIndex - 1].body : null;
            const busy = prev && dropTimer < GLOBAL.dropMaxWait &&
                (prev.getLinearVelocity().length() > GLOBAL.settleSpeed * 1.6 ||
                    prev.getAngularVelocity().length() > GLOBAL.settleSpin * 1.6);
            if (dropTimer >= GLOBAL.dropInterval && !busy) {
                dropTimer = 0;
                try { spawnNext(); }
                catch (e) { DBG.err("投入で例外 #" + dropIndex, e); dropIndex++; }
                if (onRebuilt) onRebuilt(state);
            } else if (busy && DBG.frame % 90 === 0) {
                DBG.log("投入待ち #" + dropIndex, "前の1本が動いている",
                    "v=" + DBG.n(prev.getLinearVelocity().length()),
                    "w=" + DBG.n(prev.getAngularVelocity().length()),
                    "待ち " + DBG.n(dropTimer) + "s / 上限 " + GLOBAL.dropMaxWait + "s");
            }
            return;
        }
        if (!GLOBAL.freezeWhenSettled) return;
        postDropTimer += dt;
        // 【対策】「全員が同時に静かになったら一括で固定」だと、1本でも揺れ続ける
        //         個体がいる限り永久に固定されない（実測で500フレーム経っても
        //         1本が 3〜5cm/s のまま残っていた）。落ち着いた個体から順に
        //         1本ずつ STATIC にする。固定された個体はそのまま土台になり、
        //         残りの揺れも吸収されて収束が早くなる
        let remaining = 0;
        for (const it of queue) {
            if (!it.body || it.fixed) continue;
            remaining++;
            const v = it.body.getLinearVelocity().length();
            const w = it.body.getAngularVelocity().length();
            it.mesh.computeWorldMatrix(true);
            const grounded = it.mesh.getBoundingInfo().boundingBox.minimumWorld.y
                < panTopY + GLOBAL.airborneTol;
            it.quiet = (v < GLOBAL.settleSpeed && w < GLOBAL.settleSpin && grounded)
                ? it.quiet + dt : 0;
            if (it.quiet > GLOBAL.settleHold || postDropTimer > GLOBAL.settleTimeout) {
                it.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
                it.fixed = true; remaining--;
                DBG.log("固定 #" + queue.indexOf(it),
                    "静止 " + DBG.n(it.quiet) + "s / v=" + DBG.n(v) + " w=" + DBG.n(w)
                    + (postDropTimer > GLOBAL.settleTimeout ? "（打ち切り）" : ""));
            }
        }
        if (remaining === 0) {
            frozen = true;
            dumpBodies("全て固定");
            DBG.log("整定まで " + DBG.n(postDropTimer) + "s（物理時間）");
            if (onRebuilt) onRebuilt(state);
        }
    }

    // 【診断】物理ループで例外が出ると、そのフレーム以降の処理（次の投入など）が
    //         静かに止まる。握りつぶさず、最初の5回だけ内容を出す
    let tickErrors = 0;
    scene.onBeforeRenderObservable.add(() => {
        try { physicsTick(); }
        catch (e) {
            if (tickErrors++ < 5) DBG.err("物理ループで例外 (frame " + DBG.frame + ")", e);
        }
    });

    build(START_PRESET, START_SEED, START_COUNT);

    if (GLOBAL.useSSAO) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = state.cfg.radius * 0.55;
        ssao.totalStrength = 0.92;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 140;
        ssao.minZAspect = 0.2;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.90;
    dp.bloomWeight = 0.13;
    dp.bloomKernel = 36;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.14;
    // 【対策】錯乱円は「シーンの1単位 = 1m」として深度を mm 換算している。
    //         ピント位置は radius×1000 のままにし、焦点距離と絞りで
    //         合焦幅（カメラ距離の 0.8〜1.3 倍）を作る
    dp.depthOfFieldEnabled = true;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.Medium;
    dp.depthOfField.fStop = 4.2;
    dp.depthOfField.focalLength = 85;
    dp.depthOfField.focusDistance = camera.radius * 1000;
    scene.onBeforeRenderObservable.add(() => {
        if (dp.depthOfFieldEnabled) dp.depthOfField.focusDistance = camera.radius * 1000;
    });

    // =================================================================
    // 10. GUI
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
        idle: "#2b2321", active: "#a8562a", edge: "#4c3e38",
        text: "#f7efe8", sub: "#c0aa9a", accent: "#efb383"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "232px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(16,12,10,0.80)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "16px";
    ui.addControl(card);

    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "200px"; panel.isVertical = true;
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
    function spacer(h) {
        const s = new BABYLON.GUI.Rectangle();
        s.height = h; s.thickness = 0; s.background = "";
        panel.addControl(s);
    }

    addLabel("WIENER", 11, COL.sub, "18px");
    addLabel("種類", 13, COL.accent, "22px");

    let curPreset = START_PRESET, curSeed = START_SEED, curCount = START_COUNT;
    const presetButtons = {}, countButtons = {};
    function highlight() {
        for (const k in presetButtons) presetButtons[k].background = (k === curPreset) ? COL.active : COL.idle;
        for (const k in countButtons) countButtons[k].background = (+k === curCount) ? COL.active : COL.idle;
    }
    for (const k of Object.keys(PRESETS)) {
        presetButtons[k] = addButton("p_" + k, PRESETS[k].label, () => {
            curPreset = k; build(curPreset, curSeed, curCount); highlight();
        });
    }

    spacer("8px");
    addLabel("本数", 13, COL.accent, "22px");
    for (const n of [3, 4, 5]) {
        countButtons["" + n] = addButton("c_" + n, n + "本", () => {
            curCount = n; build(curPreset, curSeed, curCount); highlight();
        });
    }

    spacer("8px");
    addButton("reseed", "盛り直す（落とし直し）", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(curPreset, curSeed, curCount); highlight();
    });
    addButton("dbg", "状態をログ出力", () => {
        DBG.on = true;
        DBG.log("--- 手動ダンプ ---", JSON.stringify(window.__w.state()));
        dumpBodies("手動");
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

    const info = addLabel("", 12, COL.sub, "62px");
    onRebuilt = (st) => {
        if (!info) return;
        const w0 = st.wieners[0];
        let splits = 0, top = 0;
        for (const w of st.wieners) if (w.skin.split) splits++;
        for (let i = 0; i < dropIndex; i++) {
            const m = queue[i].mesh;
            m.computeWorldMatrix(true);
            top = Math.max(top, m.getBoundingInfo().boundingBox.maximumWorld.y);
        }
        const phase = !physicsOn ? "物理なし"
            : (dropIndex < queue.length ? "投入中 " + dropIndex + "/" + queue.length
                : (frozen ? "静止" : "落下中"));
        info.text = "太さ " + (w0.R * 2).toFixed(2) + "cm / 長さ " + w0.L.toFixed(1) + "cm\n"
            + st.count + "本（裂け目 " + splits + "本）／" + phase + "\n"
            + "山の高さ " + Math.max(0, top - panTopY).toFixed(1) + "cm　seed: " + st.cfg.seed;
    };
    onRebuilt(state);
    highlight();

    return scene;
};

export default createScene;