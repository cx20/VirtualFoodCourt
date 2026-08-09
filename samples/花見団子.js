// =====================================================================
//  Photoreal Dango  /  写実的な団子（三色団子・みたらし団子・焼き団子）
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  実物の要点（ここを外すと「色つきの球に棒」になる）:
//    ・団子は球ではない。串の方向に押しつぶされ、隣と接する両端が平らな面になる
//      （直径3.0cm に対し串方向は約2.4cm。接触面の直径は約1.2cm）
//    ・串の入口は生地が引き込まれてすり鉢状にへこむ。ここが平らだと刺さって見える
//    ・団子は串の中心に乗っていない。わずかに偏心し、手で丸めた低周波の凹凸がある
//    ・隣どうしは「めり込む」のではなく、平らな面が触れて細い影の線ができる
//    ・上新粉の生地は透ける。透過を切ると石膏か消しゴムに見える
//    ・串は丸棒ではなく平たい竹（幅3.2mm×厚1.5mm）。先端は削がれて尖る
//    ・みたらしのたれは「色」ではなく「層」。上から掛けて下へ流れ、
//      団子の隙間に溜まり、最下部で玉になって垂れる。厚みは形にも出る
//    ・焼き目は等高線状のグラデーションではなく、輪郭の崩れた斑（まだら）
//
//  v2（dango-B）でのみたらしの作り直し:
//    ・たれは「色」ではなく「透明な層」。飴色を albedo に塗ると、光沢の無い
//      茶色い卵になる。クリアコートの着色（吸収）で持たせると、薄い所は
//      淡い琥珀、厚い所は黒に近い赤褐色へ自然に分かれる
//    ・たれは全面を覆わない。流れ落ちて止まった線から下は白い生地が出る
//    ・液体の面は生地の肌理を埋めて平らになる。たれの上を粗いままにしない
//
//  サクランボ版から引き継いだもの:
//    ・法線マップの V の符号は (yd - yu)。Babylon の接空間は V が下向き
//    ・影は ESM ではなく PCF + forceBackFacesOnly（ESM の自己遮蔽が痣になる）
//    ・テクスチャに anisotropicFilteringLevel = 16
//    ・被写界深度の錯乱円は「1単位 = 1m」で計算される。ピントは radius×1000
// =====================================================================

var createScene = function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    // 生地（色と質感）。同じ形でも粉と餡が違えば別物に見える
    const DOUGH = {
        // 桜（食紅）。焼かないので角が立たず、しっとり
        pink: {
            label: "桜",
            base: [0.955, 0.615, 0.680],
            deep: [0.870, 0.430, 0.520],      // 濃く出るむらの色
            fleck: null,
            roughness: 0.44, sheen: 0.34,
            translucency: 0.55, tint: [0.95, 0.55, 0.58]
        },
        // 白（上新粉のまま）。純白ではなく黄味のある生成り
        white: {
            label: "白",
            base: [0.955, 0.930, 0.860],
            deep: [0.870, 0.830, 0.740],
            fleck: null,
            roughness: 0.46, sheen: 0.32,
            translucency: 0.62, tint: [0.95, 0.86, 0.72]
        },
        // よもぎ（抹茶）。乾いた葉の粒が点として残る
        green: {
            label: "よもぎ",
            base: [0.560, 0.655, 0.330],
            deep: [0.430, 0.520, 0.240],
            fleck: [0.300, 0.360, 0.160],
            roughness: 0.50, sheen: 0.30,
            translucency: 0.42, tint: [0.62, 0.68, 0.35]
        },
        // ゆでたての白玉。みたらしの下地。実物のたれの下は白い
        mochi: {
            label: "白玉",
            base: [0.945, 0.925, 0.878],
            deep: [0.868, 0.842, 0.788],
            fleck: null,
            roughness: 0.36, sheen: 0.42,
            // 【対策】透過を強くしすぎると、たれのいちばん濃い所まで内側から
            //         光って灰色に浮き、飴の深みが消える
            translucency: 0.52, tint: [0.96, 0.90, 0.80]
        },
        // 焼き団子の地。軽く焼けて黄味が強い
        plain: {
            label: "素",
            base: [0.905, 0.845, 0.680],
            deep: [0.800, 0.720, 0.545],
            fleck: null,
            roughness: 0.48, sheen: 0.30,
            translucency: 0.50, tint: [0.92, 0.80, 0.62]
        }
    };

    const PRESETS = {
        // 三色団子（花見団子）。串先から 桜→白→よもぎ の順。串は先へ突き抜ける
        sanshoku: {
            label: "三色団子",
            order: ["pink", "white", "green"],
            ballRadius: 1.50, axialSquash: 0.99, gap: 0.035,
            glaze: 0.0, scorch: 0.0,
            stickThrough: 1.15,               // 先へ出る長さ(cm)。0で内側で止まる
            wet: 0.55                         // 蒸したての濡れ艶
        },
        // みたらし団子。たれが厚く、焼き目がたれの下に透ける
        mitarashi: {
            label: "みたらし団子",
            order: ["mochi", "mochi", "mochi", "mochi"],
            ballRadius: 1.46, axialSquash: 0.98, gap: 0.030,
            glaze: 1.0, scorch: 0.42,
            stickThrough: 0.0,
            wet: 1.0
        },
        // 焼き団子（醤油）。焦げが強く、たれは薄くて艶だけ残る
        yaki: {
            label: "焼き団子",
            order: ["plain", "plain", "plain"],
            ballRadius: 1.52, axialSquash: 0.98, gap: 0.032,
            glaze: 0.34, scorch: 1.0,
            stickThrough: 0.9,
            wet: 0.75
        }
    };

    const GLOBAL = {
        // --- 分割
        segmentsMeridian: 140,
        segmentsRound: 112,
        // --- 串
        stickHalfW: 0.175,                    // 幅 3.5mm
        stickHalfT: 0.085,                    // 厚 1.7mm
        stickHandle: 5.6,                     // 手で持つ側の長さ(cm)
        stickSegments: 64,
        stickSides: 24,
        // --- テクスチャ
        textureSize: 256,
        // 【対策】団子ごとに焼くと GUI 操作のたびに1秒近く固まる。
        //         変種を6セットだけ焼いて串をまたいで使い回す（隣は必ず別セット）
        skinVariants: 6,
        // --- 描画
        useSSAO: true,
        showPlate: true
    };

    const START_PRESET = "sanshoku";
    const START_SEED = 20260801;
    const START_STICKS = 3;

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
        gauss(mean, sd) {
            const u = Math.max(1e-9, this.next()), v = this.next();
            return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
        }
    }
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;

    // =================================================================
    // 2. Geo : リング列から掃引メッシュを作る
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

            // 側面が外向きか。リングの半径がいちばん大きい行で判定する
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
                const okOrder = facesToward(capA, 0, 1, b.x, b.y, b.z);
                for (let j = 0; j < M - 1; j++) {
                    if (okOrder) indices.push(capA, j, j + 1); else indices.push(capA, j + 1, j);
                }
            }
            if (capEnd) {
                const o = (N - 1) * M;
                const f = { x: centers[N - 1].x - centers[N - 2].x, y: centers[N - 1].y - centers[N - 2].y, z: centers[N - 1].z - centers[N - 2].z };
                const okOrder = facesToward(capB, o, o + 1, f.x, f.y, f.z);
                for (let j = 0; j < M - 1; j++) {
                    if (okOrder) indices.push(capB, o + j, o + j + 1); else indices.push(capB, o + j + 1, o + j);
                }
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

        ring(center, M, radiusOf) {
            const pts = [];
            for (let j = 0; j <= M; j++) {
                const phi = (j % M) / M * TAU;
                const rr = radiusOf(phi);
                const a = j / M * TAU;
                pts.push(new V3(center.x + Math.cos(a) * rr, center.y, center.z + Math.sin(a) * rr));
            }
            return pts;
        }
    };

    // =================================================================
    // 3. Shape : 団子の断面
    //   ・y は 0(下の面) 〜 1(上の面)。串の軸方向
    //   ・超楕円 r = (1 - |2y-1|^p)^(1/q) の p,q で「極の平らさ」を作る。
    //     p を上げるほど極が平ら＝隣に押しつけられた接触面になる
    //   ・t → y は cos イージング。両端に分割を寄せて接触面を潰さない
    // =================================================================
    const Shape = {
        // 球を両端で切り落とし、切り口の角を丸めた形。
        // 【対策】v2 は超楕円 (1-|2y-1|^p)^(1/q) の指数で極を平らにしていたが、
        //         この指数は赤道の丸みまで同時に潰すので、串に刺さった「樽」になった。
        //         輪郭は球の弧のまま、端だけを平面＋隅丸（フィレット）で切る。
        //         cut = 切り落とす深さ / fillet = 角の丸めの半径（いずれも R 基準）
        make(o) {
            const end = (cut, rho) => {
                const k = 1 - 2 * cut;                       // 切り口の位置（u 座標）
                // 平面に接し、球に内接する円。中心は (rc, -(k-rho))
                const rc = Math.sqrt(Math.max(1e-6, (1 - rho) * (1 - rho) - (k - rho) * (k - rho)));
                const phi = Math.asin(clamp(-(k - rho) / (1 - rho), -1, 1));  // 球側の接点の角度
                return { k, rho, rc, phi };
            };
            const A = end(o.cutA, o.filletA), B = end(o.cutB, o.filletB);
            // 分割の配分。円弧長そのままだと隅丸に2本しかリングが来ず角が折れる
            const segs = [
                { kind: 0, w: A.rc * 0.5 },
                { kind: 1, w: A.rho * (A.phi + Math.PI / 2) * 6.0 },
                { kind: 2, w: (-B.phi - A.phi) * 1.0 },
                { kind: 3, w: B.rho * (B.phi + Math.PI / 2) * 6.0 },
                { kind: 4, w: B.rc * 0.5 }
            ];
            let tot = 0;
            for (const g of segs) { g.w = Math.max(1e-5, g.w); tot += g.w; }
            return { A, B, segs, tot, o };
        },

        at(t, P) {
            let s = clamp(t, 0, 1) * P.tot, i = 0;
            while (i < P.segs.length - 1 && s > P.segs[i].w) { s -= P.segs[i].w; i++; }
            const seg = P.segs[i], f = clamp(s / seg.w, 0, 1);
            let r, u;
            if (seg.kind === 0) { r = P.A.rc * f; u = -P.A.k; }                    // 下の接触面
            else if (seg.kind === 1) {                                            // 下の隅丸
                const a = mix(-Math.PI / 2, P.A.phi, f);
                r = P.A.rc + P.A.rho * Math.cos(a);
                u = -(P.A.k - P.A.rho) + P.A.rho * Math.sin(a);
            } else if (seg.kind === 2) {                                          // 球の弧
                const a = mix(P.A.phi, -P.B.phi, f);
                r = Math.cos(a); u = Math.sin(a);
            } else if (seg.kind === 3) {                                          // 上の隅丸
                const a = mix(-P.B.phi, Math.PI / 2, f);
                r = P.B.rc + P.B.rho * Math.cos(a);
                u = (P.B.k - P.B.rho) + P.B.rho * Math.sin(a);
            } else { r = P.B.rc * (1 - f); u = P.B.k; }                           // 上の接触面
            // 串の入口のすり鉢。生地が引き込まれてへこむ。
            // 【対策】ここを平らにすると、串が刺さっているのではなく貫通した板に見える
            const crater = (u < 0 ? P.o.craterA : P.o.craterB) * Math.exp(-Math.pow(r / 0.34, 2));
            return { r, y: (u + 1) * 0.5 + (u < 0 ? crater : -crater) };
        }
    };

    // =================================================================
    // 4. Noise / Fields
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
        // x（＝u）方向だけ period で巻く。継ぎ目が出ないのはこのため
        fbm(x, y, basePeriod, seed, octaves) {
            let sum = 0, amp = 0.5, f = 1;
            for (let o = 0; o < octaves; o++) {
                sum += amp * this._value(x * f, y * f, basePeriod * f, seed + o * 131);
                f *= 2; amp *= 0.5;
            }
            return sum;
        }
    };

    // ---- みたらしのたれ -------------------------------------------------
    // 厚み 0..1.6 を返す。u=0.5 が「真下」になるよう串の姿勢を固定してある。
    // 【対策】たれを albedo の色だけで表現すると、オレンジに塗った団子にしか
    //         見えない。厚みを形（半径）にも出すと、隙間の溜まりと下端の玉が
    //         シルエットに現れて「掛かっている」ように見える
    const Glaze = {
        // 厚み 0..1.8 を返す。u=0.5 が「真下」になるよう串の姿勢を固定してある。
        // 【対策】旧版は「下ほど厚い」だけだった。実物のたれは流れ落ちる途中で
        //         止まり、その線から下は白い生地が出る。線を波打たせ、舌状に
        //         垂れた所だけ下まで届かせると、一気に「掛かっている」ように見える
        at(u, v, g) {
            if (!g || g.amount <= 0) return 0;
            const down = -Math.cos(u * TAU);                  // -1 が真上 / +1 が真下
            const line = 0.20 + 0.85 * Noise.fbm(u * 4, v * 2.4, 4, g.seed, 2);
            const tongue = smooth(0.60, 0.88, Noise.fbm(u * 3, v * 9, 3, g.seed + 3, 2)) * 0.55;
            // 団子どうしの隙間は袋になっていて、たれが溜まって一周する。
            // 実物でいちばん濃い「輪」はここ
            const crev = smooth(0.30, 0.11, v) + smooth(0.70, 0.89, v);
            const edge = clamp(line + tongue + crev * 0.80, -0.9, 1.8);
            const cover = smooth(edge + 0.10, edge - 0.07, down);
            if (cover <= 0) return 0;
            // 上から下へ流れるほど溜まり、止まる縁の直前で玉になる
            const flow = smooth(-1.05, edge, down);
            let t = 0.26 + 0.34 * flow + 0.46 * Math.pow(flow, 3.0);
            // 【対策】流れる向きは串の軸ではなく円周方向。筋は v 方向に細かく
            //         u 方向には長い。逆にすると縞が軸に巻きついて樽に見える
            t *= 0.72 + 0.56 * Noise.fbm(u * 2.5, v * 15, 3, g.seed + 7, 2);
            t += 0.60 * crev * (0.5 + 0.5 * smooth(-0.8, 1.0, down));
            t *= cover;
            // 接触面は薄い
            t *= smooth(0.0, 0.055, v) * (1 - smooth(0.945, 1.0, v));
            return clamp(t * g.amount, 0, 1.8);
        },
        MAX: 1.8,
        // たれが乗っているか（0..1）。強度・粗さ・肌理の抑制に使う
        coverAt(u, v, g) { return smooth(0.0, 0.10, this.at(u, v, g)); }
    };

    // ---- 焼き目 ---------------------------------------------------------
    // 串を回しながら焼くので、焦げは赤道付近（v≒0.5）に斑で散る
    function makeScorch(rng, amount) {
        if (amount <= 0) return [];
        const blobs = [];
        const n = 2 + rng.int(3);
        for (let i = 0; i < n; i++) {
            blobs.push({
                u: rng.next(),
                v: clamp(0.5 + rng.gauss(0, 0.13), 0.22, 0.78),
                ru: rng.range(0.045, 0.105),
                rv: rng.range(0.038, 0.088),
                k: rng.range(0.55, 1.0) * amount,
                seed: 100 + i * 37
            });
        }
        return blobs;
    }
    function scorchAt(u, v, blobs) {
        let m = 0;
        for (const b of blobs) {
            let du = Math.abs(u - b.u); du = Math.min(du, 1 - du);
            const dx = du / b.ru, dy = (v - b.v) / b.rv;
            let d = Math.hypot(dx, dy);
            if (d >= 1.6) continue;
            // 【対策】真円のフェードだと「塗った丸」になるので輪郭をノイズで崩す。
            //         ただし崩しすぎると斑の外周だけが三日月状に残り、
            //         団子に爪で引っ掻いたような弧が並ぶ（v1 の失敗）
            d *= 0.86 + 0.28 * Noise.fbm(u * 9, v * 7, 9, b.seed, 2);
            if (d >= 1) continue;
            m = Math.max(m, Math.pow(1 - d, 1.5) * b.k);
        }
        return clamp(m, 0, 1);
    }

    // =================================================================
    // 5. TextureLab
    // =================================================================
    const TextureLab = {
        _canvasTexture(name, size, fill, scene) {
            const dt = new BABYLON.DynamicTexture(name, { width: size, height: size }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(size, size);
            fill(img.data, size);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = false;
            dt.anisotropicFilteringLevel = 16;
            return dt;
        },

        // 蒸したときの気泡と、打ち粉の粒
        poreMask(size, seed) {
            const m = new Float32Array(size * size);
            const r = new Rng(seed);
            const n = Math.round(size * size * 0.006);
            for (let k = 0; k < n; k++) {
                const cx = r.next() * size, cy = r.range(0.04, 0.96) * size;
                const rad = Math.max(0.7, r.range(0.0018, 0.0055) * size);
                const x0 = Math.floor(cx - rad), x1 = Math.ceil(cx + rad);
                const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(size - 1, Math.ceil(cy + rad));
                for (let y = y0; y <= y1; y++) {
                    for (let x = x0; x <= x1; x++) {
                        const d = Math.hypot((x - cx) / rad, (y - cy) / rad);
                        if (d >= 1) continue;
                        const w = Math.pow(1 - d, 0.9);
                        const xw = ((x % size) + size) % size;
                        const i = y * size + xw;
                        if (w > m[i]) m[i] = w;
                    }
                }
            }
            return m;
        },

        albedo(scene, size, dough, sk) {
            const B = dough.base, D = dough.deep, F = dough.fleck;
            const DUST = [0.96, 0.94, 0.90];                  // 打ち粉／乾いた接触面
            const TARE = [0.60, 0.235, 0.045];                // 単位厚みを通した後の色
            const TARE_PATH = 2.4;                            // 最大厚みでの光路長
            const CHAR1 = [0.30, 0.17, 0.085];                // 焼き目のふち
            const CHAR2 = [0.055, 0.042, 0.038];              // 焦げの芯
            return this._canvasTexture("dangoAlbedo", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    // 接触面は乾いて白っぽい（隣に押しつけられて水分が抜ける）
                    const faceK = smooth(0.085, 0.0, v) + smooth(0.915, 1.0, v);
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        // 手で丸めた生地の大きなむら
                        const mott = smooth(0.35, 0.72, Noise.fbm(u * 5, v * 4, 5, sk.seed + 3, 3));
                        let cr = mix(B[0], D[0], mott * 0.55);
                        let cg = mix(B[1], D[1], mott * 0.55);
                        let cb = mix(B[2], D[2], mott * 0.55);
                        // よもぎ／抹茶の粒
                        if (F) {
                            const fk = smooth(0.70, 0.88, Noise.fbm(u * 80, v * 64, 80, sk.seed + 17, 2));
                            cr = mix(cr, F[0], fk * 0.75); cg = mix(cg, F[1], fk * 0.75); cb = mix(cb, F[2], fk * 0.75);
                        }
                        // 気泡はほんのり暗い
                        const pore = sk.pores[y * N + x];
                        const pk = smooth(0.35, 0.95, pore) * 0.16;
                        cr *= 1 - pk; cg *= 1 - pk; cb *= 1 - pk;
                        // 乾いた接触面
                        if (faceK > 0) {
                            const w = faceK * 0.42;
                            cr = mix(cr, DUST[0], w); cg = mix(cg, DUST[1], w); cb = mix(cb, DUST[2], w);
                        }
                        // 焼き目（たれの下に入る層）
                        const sc = scorchAt(u, v, sk.scorch);
                        if (sc > 0) {
                            const edge = smooth(0.05, 0.55, sc);
                            const core = smooth(0.55, 0.95, sc);
                            cr = mix(cr, CHAR1[0], edge); cg = mix(cg, CHAR1[1], edge); cb = mix(cb, CHAR1[2], edge);
                            cr = mix(cr, CHAR2[0], core); cg = mix(cg, CHAR2[1], core); cb = mix(cb, CHAR2[2], core);
                        }
                        // たれの色は「塗る」のではなく「透かす」。厚みぶんの吸収
                        // （ランベルト・ベール則）を CPU で解いて下地に掛ける。
                        // 【対策】v2 はこれを Babylon のクリアコート着色に任せたが、
                        //         あの実装は光路長を (1/NdotL + 1/NdotV) で伸ばすため
                        //         下面のように光に対して浅い角度の面で発散し、
                        //         さらに厚み0の素の生地では 0×∞ = NaN になって真っ黒になる。
                        //         ここで解けば角度に依存せず、白い所は白のまま残る
                        const T = Glaze.at(u, v, sk.glaze);
                        if (T > 0) {
                            const th = (T / Glaze.MAX) * TARE_PATH;
                            cr *= Math.pow(TARE[0], th);
                            cg *= Math.pow(TARE[1], th);
                            cb *= Math.pow(TARE[2], th);
                            // たれ自体のわずかな濁り。これが無いといちばん厚い所が
                            // 沈んで穴に見える
                            const haze = 0.055 * smooth(0.25, 1.2, T);
                            cr += haze * 0.90; cg += haze * 0.42; cb += haze * 0.16;
                        }
                        d[i] = clamp(cr, 0, 1) * 255;
                        d[i + 1] = clamp(cg, 0, 1) * 255;
                        d[i + 2] = clamp(cb, 0, 1) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        orm(scene, size, dough, sk) {
            return this._canvasTexture("dangoORM", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    const faceK = smooth(0.085, 0.0, v) + smooth(0.915, 1.0, v);
                    const crevK = smooth(0.26, 0.06, v) + smooth(0.74, 0.94, v);
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        let rough = dough.roughness * (0.90 + 0.24 * Noise.fbm(u * 10, v * 8, 10, sk.seed + 5, 2));
                        let ao = 1.0;
                        rough = mix(rough, 0.72, faceK * 0.8);            // 乾いた面はつや消し
                        rough = mix(rough, 0.62, scorchAt(u, v, sk.scorch)); // 焦げは粗い
                        // 光沢はクリアコート側で作るので、ここは下地の粗さだけ。
                        // たれを吸った生地は少し滑らかになる
                        rough = mix(rough, 0.30, Glaze.coverAt(u, v, sk.glaze));
                        // 隣との隙間は光が回り込まない
                        ao = mix(ao, 0.42, crevK);
                        ao = mix(ao, 0.72, smooth(0.35, 0.95, sk.pores[y * N + x]));
                        d[i] = clamp(ao, 0, 1) * 255;
                        d[i + 1] = clamp(rough, 0.04, 1) * 255;
                        d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // 【対策】法線の V は (yd - yu)。Babylon の接空間は V が下向きなので
        //         OpenGL 系の (yu - yd) で焼くと気泡が突起になる
        normal(scene, size, dough, sk) {
            const h = new Float32Array(size * size);
            for (let y = 0; y < size; y++) {
                const v = y / size;
                for (let x = 0; x < size; x++) {
                    const u = x / size;
                    // 【対策】液体は面を埋めて平らにする。たれの上にも生地の肌理が
                    //         残っていると、艶をいくら上げても「茶色く塗った団子」に戻る
                    const cov = Glaze.coverAt(u, v, sk.glaze);
                    const grain = Noise.fbm(u * 46, v * 38, 46, sk.seed + 61, 2) * 0.55 * (1 - 0.88 * cov);
                    const micro = Noise.fbm(u * 120, v * 96, 120, sk.seed + 71, 2) * 0.22 * (1 - 0.92 * cov);
                    // たれの大きな形（隙間の溜まり・垂れの玉）は頂点側で作ってある。
                    // ここは流れの細かい波だけ。円周方向へ流れるので v に細かい
                    const ripple = (Noise.fbm(u * 2.5, v * 22, 3, sk.seed + 81, 2) - 0.5) * 0.13 * cov;
                    h[y * size + x] = grain + micro + ripple - sk.pores[y * size + x] * 0.45 * (1 - 0.85 * cov);
                }
            }
            return this._canvasTexture("dangoNormal", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const vv = y / N;
                    const poleFade = smooth(0, 0.06, vv) * (1 - smooth(0.94, 1.0, vv));
                    const k = 0.80 * poleFade;
                    for (let x = 0; x < N; x++) {
                        const xl = h[y * N + ((x - 1 + N) % N)], xr = h[y * N + ((x + 1) % N)];
                        const yu = h[Math.max(0, y - 1) * N + x], yd = h[Math.min(N - 1, y + 1) * N + x];
                        let nx = (xl - xr) * k, ny = (yd - yu) * k, nz = 1;
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const i = (y * N + x) * 4;
                        d[i] = (nx * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // ---- たれの層 ------------------------------------------------------
        // クリアコート本体: R = 強度（被覆）/ G = 粗さ
        coat(scene, size, sk) {
            return this._canvasTexture("dangoCoat", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        const cov = Glaze.coverAt(u, v, sk.glaze);
                        // 素の白玉にもゆでたての濡れ艶が少しある
                        const inten = mix(0.26, 1.0, cov);
                        let rough = mix(0.92, 0.17, cov);
                        // 流れの跡でハイライトがわずかに割れる。完全に均一だと
                        // 吹き付け塗装のように見える
                        rough += 0.09 * (Noise.fbm(u * 2.5, v * 18, 3, sk.seed + 13, 2) - 0.5) * cov;
                        d[i] = clamp(inten, 0, 1) * 255;
                        d[i + 1] = clamp(rough, 0.05, 1) * 255;
                        d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },
        // ---- 竹串（全体で1組だけ焼く）------------------------------------
        bamboo(scene, size, seed) {
            const alb = this._canvasTexture("stickAlbedo", size, (d, N) => {
                const PALE = [0.855, 0.760, 0.545];
                const DARK = [0.560, 0.440, 0.255];
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        // 竹は繊維が軸方向に走る。u 方向に細かく v 方向に長い
                        const fib = Noise.fbm(u * 34, v * 2.0, 34, seed, 3);
                        const streak = smooth(0.42, 0.78, Noise.fbm(u * 12, v * 1.4, 12, seed + 5, 2));
                        let cr = mix(PALE[0], DARK[0], streak * 0.55 + fib * 0.22);
                        let cg = mix(PALE[1], DARK[1], streak * 0.55 + fib * 0.22);
                        let cb = mix(PALE[2], DARK[2], streak * 0.55 + fib * 0.22);
                        d[i] = clamp(cr, 0, 1) * 255;
                        d[i + 1] = clamp(cg, 0, 1) * 255;
                        d[i + 2] = clamp(cb, 0, 1) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
            const h = new Float32Array(size * size);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const u = x / size, v = y / size;
                    h[y * size + x] = Noise.fbm(u * 40, v * 2.2, 40, seed + 3, 3) * 0.9
                        + Noise.fbm(u * 96, v * 40, 96, seed + 21, 2) * 0.2;
                }
            }
            const nrm = this._canvasTexture("stickNormal", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    for (let x = 0; x < N; x++) {
                        const xl = h[y * N + ((x - 1 + N) % N)], xr = h[y * N + ((x + 1) % N)];
                        const yu = h[Math.max(0, y - 1) * N + x], yd = h[Math.min(N - 1, y + 1) * N + x];
                        let nx = (xl - xr) * 2.0, ny = (yd - yu) * 2.0, nz = 1;
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const i = (y * N + x) * 4;
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
    // 6. DangoSkin : 団子1個ぶんのテクスチャとマテリアル（変種単位でキャッシュ）
    // =================================================================
    class DangoSkin {
        constructor(scene, cfg, doughKey, variantSeed) {
            const dough = DOUGH[doughKey];
            const rng = new Rng(variantSeed);
            const S = cfg.textureSize;
            this.dough = dough;
            this.seed = (variantSeed % 60000) | 0;
            this.pores = TextureLab.poreMask(S, variantSeed ^ 0x5bf03635);
            this.scorch = makeScorch(rng, cfg.scorch);
            this.glaze = cfg.glaze > 0
                ? { amount: cfg.glaze * rng.range(0.86, 1.14), seed: (variantSeed % 40000) + 11 }
                : null;

            this.albedoTex = TextureLab.albedo(scene, S, dough, this);
            this.ormTex = TextureLab.orm(scene, S, dough, this);
            this.normalTex = TextureLab.normal(scene, S, dough, this);

            const pbr = new BABYLON.PBRMaterial("dangoMat", scene);
            pbr.albedoTexture = this.albedoTex;
            pbr.metallic = 0.0;
            pbr.roughness = 1.0;                  // 実値は ORM の G
            pbr.metallicTexture = this.ormTex;
            pbr.useAmbientOcclusionFromMetallicTextureRed = true;
            pbr.useRoughnessFromMetallicTextureGreen = true;
            pbr.useMetallnessFromMetallicTextureBlue = true;
            pbr.bumpTexture = this.normalTex;
            pbr.bumpTexture.level = 0.55;
            pbr.clearCoat.isEnabled = true;
            if (this.glaze) {
                this.coatTex = TextureLab.coat(scene, S, this);
                pbr.clearCoat.intensity = 1.0;            // 実値はテクスチャの R
                pbr.clearCoat.roughness = 0.32;           // 実値はテクスチャの G と乗算
                pbr.clearCoat.texture = this.coatTex;     // 実効粗さ ≒ 0.055（たれ）/ 0.29（素）
                pbr.clearCoat.useRoughnessFromMainTexture = true;
                pbr.clearCoat.indexOfRefraction = 1.46;   // 糖蜜。水より高い
                // 【対策】クリアコートの着色（isTintEnabled）は使わない。
                //         あの実装は光路長を (1/NdotL + 1/NdotV) で伸ばすので、
                //         下面や縁のように光に対して浅い角度の面で吸収が発散し、
                //         厚み0の素の生地では 0×∞ = NaN になって真っ黒に落ちる。
                //         色はテクスチャ側（albedo）で解き、ここは無色の艶だけ
                pbr.clearCoat.isTintEnabled = false;
            } else {
                // 蒸したての濡れ艶だけ
                pbr.clearCoat.intensity = dough.sheen * cfg.wet;
                pbr.clearCoat.roughness = 0.55;
                pbr.clearCoat.indexOfRefraction = 1.40;
            }
            // 【対策】上新粉の生地は光を通す。透過を切ると石膏か消しゴムに見える。
            //         3cm の球なので厚みも実寸に近い値を入れる
            pbr.subSurface.isTranslucencyEnabled = true;
            pbr.subSurface.tintColor = new BABYLON.Color3(dough.tint[0], dough.tint[1], dough.tint[2]);
            pbr.subSurface.translucencyIntensity = dough.translucency;
            pbr.subSurface.minimumThickness = 0.3;
            pbr.subSurface.maximumThickness = 2.2;
            this.mat = pbr;
        }
        dispose() {
            this.mat.dispose(true, false);
            this.albedoTex.dispose(); this.ormTex.dispose(); this.normalTex.dispose();
            if (this.coatTex) this.coatTex.dispose();
        }
    }

    // =================================================================
    // 7. Dango / Skewer
    // =================================================================
    class Dango {
        constructor(scene, cfg, seed, skin, o) {
            this.scene = scene; this.cfg = cfg; this.skin = skin;
            const rng = new Rng(seed);
            this.R = cfg.ballRadius * rng.range(0.945, 1.055);
            // u∈[-1,1]（球の直径）を y∈[0,1] に写しているので H = 2R が等方
            this.H = 2 * this.R * cfg.axialSquash * rng.range(0.985, 1.015);
            this.prof = Shape.make({
                cutA: o.cutA, cutB: o.cutB,
                filletA: o.filletA, filletB: o.filletB,
                craterA: o.craterA * rng.range(0.8, 1.25),
                craterB: o.craterB * rng.range(0.8, 1.25)
            });
            // 手で丸めた低周波の凹凸（真球だと3Dソフトの球に見える）
            this.a1 = rng.range(0.014, 0.032); this.p1 = rng.range(0, TAU);
            this.a2 = rng.range(0.008, 0.020); this.p2 = rng.range(0, TAU);
            this.a3 = rng.range(0.004, 0.011); this.p3 = rng.range(0, TAU);
            // 串の中心からのずれ。実物は必ずどちらかへ寄っている
            const off = rng.range(0.03, 0.085) * this.R, oa = rng.range(0, TAU);
            this.ox = Math.cos(oa) * off; this.oz = Math.sin(oa) * off;
            this.glazeMax = 0.026 * this.R;   // 最大の膨らみ ≒ 0.7mm
            this._build();
        }

        lumps(t, phi) {
            const b = Math.sin(Math.PI * t);
            return 1 + this.a1 * Math.cos(phi - this.p1) * b
                + this.a2 * Math.cos(2 * phi - this.p2) * Math.sin(Math.PI * t * 1.3)
                + this.a3 * Math.cos(3 * phi - this.p3 + t * 3.0) * b;
        }

        radiusAt(t, phi) {
            const s = Shape.at(t, this.prof);
            let r = s.r * this.R * this.lumps(t, phi);
            // たれの厚みを半径に足す（テクスチャと同じ場を使う）
            if (this.skin.glaze) r += Glaze.at(phi / TAU, t, this.skin.glaze) * this.glazeMax;
            return r;
        }

        _build() {
            const N = this.cfg.segmentsMeridian, M = this.cfg.segmentsRound;
            const rings = [], centers = [];
            for (let i = 0; i <= N; i++) {
                const t = i / N;
                const s = Shape.at(t, this.prof);
                // 偏心は胴で最大、串の通る両端では小さい（穴は串に沿うため）
                const w = 0.22 + 0.78 * Math.sin(Math.PI * t);
                const c = new V3(this.ox * w, s.y * this.H, this.oz * w);
                rings.push(Geo.ring(c, M, (phi) => Math.max(0.004, this.radiusAt(t, phi))));
                centers.push(c);
                if (i === 0) { this.yMin = c.y; this.yMax = c.y; }
                else { this.yMin = Math.min(this.yMin, c.y); this.yMax = Math.max(this.yMax, c.y); }
            }
            const mesh = Geo.build("dango", rings, centers, true, true, this.scene);
            mesh.material = this.skin.mat;
            mesh.receiveShadows = true;
            this.mesh = mesh;
        }
        dispose() { this.mesh.dispose(); }
    }

    class Skewer {
        constructor(scene, cfg, seed, skins, stickMat) {
            this.scene = scene; this.cfg = cfg;
            const rng = new Rng(seed);
            this.root = new BABYLON.TransformNode("skewer", scene);
            this.parts = [];
            this.dangos = [];

            const n = cfg.order.length;
            let cursor = 0;
            for (let i = 0; i < n; i++) {
                const skin = skins[i];
                // 端の団子の外側は隣がいないので丸い。内側どうしは押し合って平ら
                const isFirst = i === 0, isLast = i === n - 1;
                const d = new Dango(scene, cfg, (seed + i * 8191) >>> 0, skin, {
                    // 隣と押し合う面は深く切って角も鋭く、自由端は浅く大きく丸める
                    cutA: isFirst ? 0.012 : 0.055, filletA: isFirst ? 0.30 : 0.12,
                    cutB: isLast ? 0.012 : 0.055, filletB: isLast ? 0.30 : 0.12,
                    craterA: 0.045, craterB: 0.045
                });
                d.mesh.parent = this.root;
                // 【対策】間隔を H で決めると、すり鉢のぶん接触面が引っ込んでいる
                //         ので 1.5mm の隙間が開く。実測した表面の端どうしを
                //         突き合わせる。0.3mm だけ離すのは Z ファイティング避けで、
                //         この細い隙間がそのまま影の線になって「別々の団子」に見える
                d.mesh.position.y = cursor - d.yMin;
                cursor = d.mesh.position.y + d.yMax + cfg.gap;
                this.dangos.push(d);
                this.parts.push(d.mesh);
            }
            this.topY = cursor - cfg.gap;

            this._buildStick(rng, stickMat);
        }

        _buildStick(rng, stickMat) {
            const cfg = this.cfg, K = cfg.stickSegments, M = cfg.stickSides;
            const y0 = -cfg.stickHandle;
            const y1 = this.topY - (cfg.stickThrough > 0 ? -cfg.stickThrough : this.dangos[this.dangos.length - 1].H * 0.30);
            const L = y1 - y0;
            const rings = [], centers = [];
            const bendA = rng.range(0, TAU), bend = rng.range(0.0, 0.012);
            for (let k = 0; k <= K; k++) {
                const s = k / K;
                const yy = y0 + L * s;
                // 竹は完全にまっすぐではない。ごくわずかに反る
                const bx = Math.cos(bendA) * bend * L * Math.sin(Math.PI * s);
                const bz = Math.sin(bendA) * bend * L * Math.sin(Math.PI * s);
                // 手元から先へ緩く細る
                const taper = 1 - 0.16 * s;
                let hw = cfg.stickHalfW * taper, ht = cfg.stickHalfT * taper;
                // 先端は削がれて尖る（見えるのは三色団子のときだけ）
                const tip = smooth(0.90, 1.0, s);
                hw *= 1 - 0.92 * tip; ht *= 1 - 0.92 * tip;
                // 手元の切り口も面取りする
                const btm = 1 - 0.55 * smooth(0.012, 0.0, s);
                hw *= btm; ht *= btm;
                const c = new V3(bx, yy, bz);
                rings.push(Geo.ring(c, M, (phi) => {
                    // 角の丸い長方形（超楕円）。丸棒にすると割り箸に見えない
                    const cx = Math.abs(Math.cos(phi)) / Math.max(1e-5, hw);
                    const cz = Math.abs(Math.sin(phi)) / Math.max(1e-5, ht);
                    return Math.max(0.002, 1 / Math.pow(Math.pow(cx, 3.4) + Math.pow(cz, 3.4), 1 / 3.4));
                }));
                centers.push(c);
            }
            const mesh = Geo.build("stick", rings, centers, true, true, this.scene);
            mesh.material = stickMat;
            mesh.receiveShadows = true;
            mesh.parent = this.root;
            this.stick = mesh;
            this.parts.push(mesh);
        }

        dispose() {
            for (const d of this.dangos) d.dispose();
            this.stick.dispose();
            this.root.dispose();
        }
    }

    // =================================================================
    // 8. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.05, 0.045, 0.05, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    // 【対策】果実のときは映り込みをぼかしてガラス玉化を防いだが、飴の層は逆。
    //         周囲がはっきり映るのが正しい（実物の写真にも窓の形が映っている）
    env.lodGenerationOffset = 0.18;
    scene.environmentIntensity = 0.92;
    scene.createDefaultSkybox(env, true, 1000, 0.74, false);

    const camera = new BABYLON.ArcRotateCamera("cam", -1.02, 1.10, 26, new V3(0, 0, 0), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 16;
    camera.minZ = 0.05;
    camera.lowerRadiusLimit = 6;
    camera.upperRadiusLimit = 120;
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.5, -0.92, 0.5).normalize(), scene);
    key.position = new V3(12, 22, -12);
    key.intensity = 2.5;
    key.diffuse = new BABYLON.Color3(1.0, 0.97, 0.93);
    key.specular = new BABYLON.Color3(0.72, 0.70, 0.66);
    key.autoCalcShadowZBounds = true;

    const rim = new BABYLON.DirectionalLight("rim", new V3(0.6, -0.30, -0.95).normalize(), scene);
    rim.intensity = 1.35;
    rim.diffuse = new BABYLON.Color3(1.0, 0.93, 0.88);
    rim.specular = new BABYLON.Color3(0.28, 0.27, 0.26);

    const fill = new BABYLON.HemisphericLight("fill", new V3(0, 1, 0), scene);
    fill.intensity = 0.22;
    fill.specular = new BABYLON.Color3(0, 0, 0);

    // 【対策】影は ESM ではなく PCF。ESM の自己遮蔽は団子の胴に痣として出る
    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.forceBackFacesOnly = true;
    sg.bias = 0.0009;
    sg.normalBias = 0.010;
    sg.setDarkness(0.42);

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.02;
    ip.contrast = 1.16;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.3;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    // ---- 皿と敷き面 --------------------------------------------------
    let plate = null, plateTopY = 0, table = null;
    function ensurePlate() {
        if (!GLOBAL.showPlate || plate) return;
        // 内側の平ら → 縁 → 裏 → 高台、と一周する断面を回転させる
        // 【対策】見込み（内側）を皿なりに傾けると、団子が中心で沈み縁で浮く。
        //         団子が載る範囲は水平にしておく
        const prof = [
            new V3(0.00, 0.30, 0), new V3(5.80, 0.30, 0), new V3(7.50, 0.38, 0),
            new V3(8.55, 0.74, 0), new V3(8.90, 0.70, 0), new V3(8.60, 0.54, 0),
            new V3(7.90, 0.18, 0), new V3(4.10, 0.06, 0), new V3(3.65, 0.00, 0),
            new V3(3.35, 0.00, 0), new V3(3.20, 0.13, 0), new V3(0.00, 0.15, 0)
        ];
        plate = BABYLON.MeshBuilder.CreateLathe("plate", { shape: prof, tessellation: 128 }, scene);
        const pm = new BABYLON.PBRMaterial("plateMat", scene);
        pm.albedoColor = new BABYLON.Color3(0.845, 0.835, 0.780).toLinearSpace();
        pm.metallic = 0.0;
        pm.roughness = 0.30;
        // 磁器の釉薬。下地は少し粗く、その上につるりとした層が乗っている
        pm.clearCoat.isEnabled = true;
        pm.clearCoat.intensity = 0.75;
        pm.clearCoat.roughness = 0.10;
        // 【対策】旋盤の巻き方向は Babylon 側の実装依存。両面表示にすると
        //         面が二重になって影がざらつくので、片面のまま二面ライティングで逃がす
        pm.backFaceCulling = false;
        pm.twoSidedLighting = true;
        plate.material = pm;
        plate.receiveShadows = true;
        plateTopY = 0.30;

        table = BABYLON.MeshBuilder.CreateDisc("table", { radius: 60, tessellation: 64 }, scene);
        table.rotation.x = Math.PI / 2;
        const tm = new BABYLON.PBRMaterial("tableMat", scene);
        tm.albedoColor = new BABYLON.Color3(0.185, 0.170, 0.160).toLinearSpace();
        tm.metallic = 0.0; tm.roughness = 0.95;
        table.material = tm;
        table.receiveShadows = true;
        table.position.y = -0.002;
    }

    // =================================================================
    // 9. 生成 / 差し替え
    // =================================================================
    let state = null;
    const skinCache = {};
    let stickMat = null, stickTex = null;
    let ssao = null;
    let onRebuilt = null;

    function getStickMat() {
        if (stickMat) return stickMat;
        stickTex = TextureLab.bamboo(scene, 256, 8123);
        const m = new BABYLON.PBRMaterial("stickMat", scene);
        m.albedoTexture = stickTex.alb;
        m.bumpTexture = stickTex.nrm;
        m.bumpTexture.level = 0.7;
        m.metallic = 0.0;
        m.roughness = 0.62;                    // 竹は光らせない。光ると爪楊枝の CG に見える
        stickMat = m;
        return m;
    }

    function hashStr(s) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
        return h >>> 0;
    }
    function getSkin(presetKey, cfg, doughKey, variant) {
        const k = presetKey + "|" + doughKey + "|" + variant;
        // 【対策】種を「文字数」などで作ると white / green / plain が衝突して
        //         色違いの同じ模様になる。文字列ハッシュで散らす
        if (!skinCache[k]) skinCache[k] = new DangoSkin(scene, cfg, doughKey, hashStr(k));
        return skinCache[k];
    }

    function worldBounds(meshes) {
        const o = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
        for (const m of meshes) {
            m.computeWorldMatrix(true);
            const bb = m.getBoundingInfo().boundingBox;
            o.minX = Math.min(o.minX, bb.minimumWorld.x); o.maxX = Math.max(o.maxX, bb.maximumWorld.x);
            o.minY = Math.min(o.minY, bb.minimumWorld.y); o.maxY = Math.max(o.maxY, bb.maximumWorld.y);
            o.minZ = Math.min(o.minZ, bb.minimumWorld.z); o.maxZ = Math.max(o.maxZ, bb.maximumWorld.z);
        }
        return o;
    }

    function build(presetKey, seed, sticks) {
        if (state) { for (const s of state.skewers) s.dispose(); state.group.dispose(); state = null; }
        const cfg = Object.assign({}, GLOBAL, PRESETS[presetKey]);
        cfg.preset = presetKey; cfg.seed = seed >>> 0;

        const t0 = performance.now();
        const rng = new Rng((cfg.seed ^ 0x9E3779B9) >>> 0);
        const group = new BABYLON.TransformNode("dangoGroup", scene);
        const mat = getStickMat();
        const skewers = [];
        const n = cfg.order.length;

        for (let s = 0; s < sticks; s++) {
            // 隣の串と同じテクスチャが並ばないよう、変種を通し番号で配る
            const skins = [];
            for (let i = 0; i < n; i++) {
                const variant = (s * n + i) % cfg.skinVariants;
                skins.push(getSkin(presetKey, cfg, cfg.order[i], variant));
            }
            const sk = new Skewer(scene, cfg, (cfg.seed + s * 104729) >>> 0, skins, mat);
            sk.root.parent = group;

            // 【対策】串の姿勢は自由に回してはいけない。たれの場は「ローカル -X が
            //         真下」を前提に焼いてあるので、ロールは +90° に固定する。
            //         見た目のばらつきは水平面内の振り（Y 回転）と位置で作る
            sk.root.rotation.z = Math.PI / 2;
            sk.root.rotation.y = rng.gauss(0, 0.055);
            const pitch = (s - (sticks - 1) / 2);
            sk.root.position.set(
                rng.range(-0.25, 0.25),
                0,
                pitch * cfg.ballRadius * 2.06 + rng.range(-0.06, 0.06)
            );
            skewers.push(sk);
        }

        const meshes = [];
        for (const s of skewers) for (const m of s.parts) meshes.push(m);

        ensurePlate();
        const bb = worldBounds(meshes);
        // 皿の内側に載せる
        group.position.y = (GLOBAL.showPlate ? plateTopY : 0) - bb.minY + 0.004;
        group.position.x = -(bb.minX + bb.maxX) * 0.5;
        group.position.z = -(bb.minZ + bb.maxZ) * 0.5;

        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        for (const m of meshes) sg.addShadowCaster(m, true);
        if (plate) sg.addShadowCaster(plate, true);

        const w = bb.maxX - bb.minX, d = bb.maxZ - bb.minZ;
        camera.target.set(0, plateTopY + cfg.ballRadius * 0.9, 0);
        camera.radius = Math.max(w, d, 14) * 1.75;
        if (ssao) ssao.radius = cfg.ballRadius * 0.42;

        state = { cfg, skewers, group, bounds: bb, sticks };
        if (onRebuilt) onRebuilt(state);
        console.log("[Dango]", cfg.label, "/ seed =", cfg.seed, "/ 串", sticks, "本 ×", n, "個",
            "/ build", (performance.now() - t0).toFixed(0) + "ms");
        return state;
    }

    build(START_PRESET, START_SEED, START_STICKS);

    if (GLOBAL.useSSAO) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = state.cfg.ballRadius * 0.42;
        ssao.totalStrength = 0.95;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 120;
        ssao.minZAspect = 0.2;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.92;
    dp.bloomWeight = 0.11;
    dp.bloomKernel = 36;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.13;
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
        idle: "#2a2426", active: "#8c5a34", edge: "#4a4042",
        text: "#f6f0ea", sub: "#bdaa9c", accent: "#e8bb8a"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "232px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(16,13,12,0.80)";
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

    addLabel("DANGO", 11, COL.sub, "18px");
    addLabel("種類", 13, COL.accent, "22px");

    let curPreset = START_PRESET, curSeed = START_SEED, curSticks = START_STICKS;
    const presetButtons = {}, stickButtons = {};
    function highlight() {
        for (const k in presetButtons) presetButtons[k].background = (k === curPreset) ? COL.active : COL.idle;
        for (const k in stickButtons) stickButtons[k].background = (+k === curSticks) ? COL.active : COL.idle;
    }
    for (const k of Object.keys(PRESETS)) {
        presetButtons[k] = addButton("p_" + k, PRESETS[k].label, () => {
            curPreset = k; build(curPreset, curSeed, curSticks); highlight();
        });
    }

    spacer("8px");
    addLabel("串の本数", 13, COL.accent, "22px");
    for (const n of [1, 2, 3]) {
        stickButtons["" + n] = addButton("s_" + n, n + "本", () => {
            curSticks = n; build(curPreset, curSeed, curSticks); highlight();
        });
    }

    spacer("8px");
    addButton("reseed", "別の個体を生成", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(curPreset, curSeed, curSticks); highlight();
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
        sg.setDarkness(shadowOn ? 0.42 : 1.0);
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

    const info = addLabel("", 12, COL.sub, "56px");
    onRebuilt = (st) => {
        if (!info) return;
        const d0 = st.skewers[0].dangos[0];
        info.text = "団子 径" + (d0.R * 2).toFixed(2) + "cm / 串方向"
            + (d0.yMax - d0.yMin).toFixed(2) + "cm\n" + st.cfg.order.length + "個 × " + st.sticks + "本\nseed: " + st.cfg.seed;
    };
    onRebuilt(state);
    highlight();

    return scene;
};

export default createScene;