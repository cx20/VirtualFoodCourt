// =====================================================================
//  Photoreal Grilled Pacific Saury  /  写実的な秋刀魚の塩焼き（一尾）
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）  BUILD: sanma-B
//
//  BUILD A → B の変更（実写との差を面積比の順に潰した）:
//    1. 焼き色の面積比      … heat の底上げを 0.62 → 0.10、wash に天井 0.62。
//                             実写は銀白が7割。A では可視面のほぼ全域が
//                             きつね色になり、豹柄／錆びた鉄板に見えていた
//    2. ノイズ周波数        … コメントの意図（大域3〜6cm / 斑1.2cm）と
//                             実際の周期が食い違っていたので合わせた。
//                             とくに焼き斑が u 方向に細かすぎて縦に裂けていた
//    3. iridescence         … 銀はグアニン板の薄膜干渉。metallic を上げるのは
//                             間違いで、上げるほどスプーンになる。
//                             metallic を 0.42 → 0.22 に落として虹色層で置換
//    4. 目                  … 瞳が眼球の内側 0.02r に埋没して見えていなかった。
//                             併せて眼窩の窪みと黒い環を追加
//    5. 体型                … 体高のピークが u=0.30 にあり頭が全長の1/3に
//                             見えていた。実写は鰓蓋直後 u≒0.22。尾柄も細く
//    6. ヒレ                … 小離鰭が rays 4 × notch 0.09 で鋸歯になっていた。
//                             色も濃すぎ。縁をアルファテストでほつれさせる
//    7. 飾り包丁            … 3本の細線 → X字1組。テクスチャだけでなく
//                             ジオメトリで 1mm 彫り、身の白を見せる
//    8. 塩と白濁            … 塩の閾値を下げ、焼けて浮いた皮の白濁層を追加
//    9. 構図                … fov 0.52 はパースが強く頭が肥大。望遠寄りへ。
//                             接地影と SSAO 半径も 30cm スケールに合わせる
//   10. 付け合わせ          … 大根おろしとすだち。これが「秋刀魚の塩焼き」を
//                             成立させる記号
//
//  構成:
//    0. CONFIG      … サイズプリセットと焼き加減・盛り付け
//    1. Rng         … シード付き擬似乱数
//    2. Noise       … 2D値ノイズ / u方向に折り返す2Dノイズ / fBm
//    3. Mesh utils  … 巻き順の自動判定・法線の溶接・掃引・ドーム・円板
//    4. Fields      … 体型プロファイル・断面・頭部・尾柄・反り
//    5. TextureLab  … 体表を1枚に焼く（アルベド / ORM / 法線 / 虹彩 / CC）
//    6. Sanma       … 体メッシュ + 各ヒレ + 目
//    7. Garnish     … 大根おろし / すだち
//    8. Table       … 長角皿（秋刀魚皿）/ 木のテーブル
//    9. Scene       … IBL / ライト / 影 / SSAO2 / トーンマッピング
//   10. GUI
//
//  実物の要点:
//
//  ・全長 30cm 前後に対し体高 4cm・体幅 2.5cm。極端に細長い。
//    体高:体幅 ≒ 1.6:1 の側扁で、断面は横倒しにすると平たい楕円
//
//  ・頭部は全長の 12% ほどを占める細い嘴状。下顎がわずかに前へ出る。
//    目は大きく、頭部の上寄り。加熱で白濁する
//
//  ・背は青黒、体側は金属光沢のある銀青、腹は白銀。この背腹方向の
//    グラデーションが見た目のほぼすべてを決める
//
//  ・銀色は色素ではなくグアニンの結晶による構造色。薄膜干渉なので
//    metallic ではなく iridescence で表す。metallic を上げると
//    「魚の形をしたスプーン」になる
//
//  ・小離鰭（しょうりき）が背腹に5〜6枚ずつ並ぶ。サンマの識別点
//
//  ・焼き目は「点在する丸い斑」。全面を覆わせてはいけない
//
//  法線マップについて:
//    ・高さ場から法線を焼くとき、v 方向は (yd - yu) にすること。
//      (yu - yd) は「V が上を向く」OpenGL 系の規約で、Babylon の接空間は
//      V が下向き。混ぜると u方向は正・v方向は逆というねじれた法線になる
// =====================================================================

var createScene = function () {
    // =================================================================
    // 0. CONFIG （単位は cm）
    // =================================================================
    const PRESETS = {
        ooba: {
            label: "大羽（150g級）",
            length: 27.5,          // 吻端 → 尾柄の末端
            depth: 4.15,           // 体高（皿の上での横幅）
            width: 2.60,           // 体幅（皿の上での高さ）
            tailLen: 2.70,
            // 色（sRGB）
            back: [0.078, 0.142, 0.150],   // 背（青黒）
            backHi: [0.168, 0.282, 0.278],   // 背の明るいところ
            flank: [0.605, 0.665, 0.700],   // 体側（銀青）
            flankHi: [0.815, 0.848, 0.862],   // 体側の光るところ
            belly: [0.882, 0.868, 0.822],   // 腹（白銀）
            golden: [0.758, 0.606, 0.372],   // きつね色（下地）
            brown: [0.398, 0.268, 0.146],   // 濃い焼き斑
            char: [0.128, 0.098, 0.078],   // 焦げ
            burst: [0.905, 0.848, 0.742],   // 破れて覗く身
            // 【6】ヒレは焼けても体色に近い灰褐色。A の [0.268,...] は濃すぎて
            //      シルエットだけが黒く浮き、厚紙を挿したように見えていた
            fin: [0.420, 0.372, 0.322],
            finAmber: [0.585, 0.442, 0.252],
            jaw: [0.760, 0.588, 0.230],
            // 【3】虹彩層に置き換えたので metallic は大きく下げる
            metal: 0.22,
            irid: 0.68,          // 構造色の強さ
            oil: 0.58
        },
        chuuba: {
            label: "中羽（110g級）",
            length: 25.0, depth: 3.70, width: 2.30, tailLen: 2.45,
            back: [0.088, 0.155, 0.164], backHi: [0.180, 0.296, 0.292],
            flank: [0.632, 0.688, 0.720], flankHi: [0.838, 0.865, 0.878],
            belly: [0.892, 0.878, 0.834],
            golden: [0.748, 0.596, 0.362], brown: [0.386, 0.256, 0.138], char: [0.118, 0.090, 0.072],
            burst: [0.912, 0.858, 0.755], fin: [0.410, 0.362, 0.315], finAmber: [0.568, 0.428, 0.242],
            jaw: [0.742, 0.570, 0.218],
            metal: 0.24, irid: 0.72, oil: 0.52
        },
        koba: {
            label: "小羽（80g級）",
            length: 22.5, depth: 3.30, width: 2.05, tailLen: 2.20,
            back: [0.098, 0.168, 0.178], backHi: [0.194, 0.312, 0.308],
            flank: [0.655, 0.708, 0.738], flankHi: [0.852, 0.876, 0.888],
            belly: [0.900, 0.886, 0.845],
            golden: [0.738, 0.585, 0.352], brown: [0.375, 0.248, 0.132], char: [0.112, 0.086, 0.070],
            burst: [0.918, 0.865, 0.765], fin: [0.402, 0.355, 0.308], finAmber: [0.552, 0.415, 0.235],
            jaw: [0.728, 0.556, 0.208],
            metal: 0.26, irid: 0.76, oil: 0.46
        }
    };

    // 焼き加減
    const GRILLS = {
        light: { label: "浅め", char: 0.55 },
        normal: { label: "ふつう", char: 1.00 },
        deep: { label: "しっかり", char: 1.55 }
    };

    const GLOBAL = {
        // --- 分割
        segmentsLength: 300,       // 体軸方向（細長いので多めに要る）
        segmentsRound: 104,        // 断面まわり

        // --- テクスチャ（周長 ≒ 11cm / 全長 ≒ 28cm なので縦長に取る）
        texW: 512, texH: 2048,
        bumpLevel: 1.55,

        // --- 盛り付け
        showPlate: true,
        showTable: true,
        showGarnish: true,         // 【10】大根おろし・すだち
        kazariBocho: true,         // 【7】飾り包丁（X字）

        // --- 皿（秋刀魚皿）
        // 【9】A の 34 × 12.6 は大きすぎて魚が痩せて見えた。幅を詰めると
        //      同じ魚が太く見える
        plateW: 33.0, plateD: 12.2, plateH: 1.22,
        plateRim: 1.40,
        plateSharp: 9.0,
        plateCorner: 0.20,

        // --- 描画
        useSSAO: true,
        useDOF: true,
        dofRatio: 0.048,
        dofFStop: 2.8,

        compactWidth: 700,
        compactMinSide: 480,
        guiMaxScale: 2.2
    };

    const START_VARIETY = "ooba";
    const START_GRILL = "normal";
    const START_SEED = 20260808;
    const BUILD = "sanma-B";

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const srgb = (v) => Math.pow(clamp(v, 0, 1), 2.2);
    const lin3 = (c) => new BABYLON.Color3(srgb(c[0]), srgb(c[1]), srgb(c[2]));

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
        // x 方向だけ折り返す。断面まわりで継ぎ目を作らないために要る
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
        // 両方向に折り返す。タイリングするテクスチャ用（皿・木目）
        v2p(x, y, px, py, seed) {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            const P = Math.max(1, px | 0), Q = Math.max(1, py | 0);
            let x0 = xi % P; if (x0 < 0) x0 += P;
            let x1 = (xi + 1) % P; if (x1 < 0) x1 += P;
            let y0 = yi % Q; if (y0 < 0) y0 += Q;
            let y1 = (yi + 1) % Q; if (y1 < 0) y1 += Q;
            const a = this._h2(x0, y0, seed), b = this._h2(x1, y0, seed);
            const c = this._h2(x0, y1, seed), d = this._h2(x1, y1, seed);
            const t0 = a + (b - a) * u, t1 = c + (d - c) * u;
            return t0 + (t1 - t0) * v;
        },
        fbm2p(x, y, px, py, seed, oct) {
            let s = 0, a = 0.5, f = 1, n = 0;
            for (let o = 0; o < oct; o++) {
                s += a * this.v2p(x * f, y * f, (px * f) | 0, (py * f) | 0, seed + o * 131);
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
        // 【対策】頂点カラーを stride 4 で入れると hasVertexAlpha が立ち、
        //         不透明なのに透過パスへ回される。透過パスは深度書き込みが
        //         切られるので、部品どうしが互いを正しく隠せなくなる
        mesh.hasVertexAlpha = false;
        return mesh;
    }

    // リング列の掃引。両端はキャップで閉じる。
    // UV は x = 断面まわり（j）、y = 掃引方向（i）
    function sweep(name, rings, centers, scene) {
        const N = rings.length, M = rings[0].length;
        const total = N * M + 2;
        const positions = new Float32Array(total * 3);
        const uvs = new Float32Array(total * 2);
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < M; j++) {
                const k = i * M + j, p = rings[i][j];
                positions[k * 3] = p.x; positions[k * 3 + 1] = p.y; positions[k * 3 + 2] = p.z;
                uvs[k * 2] = j / (M - 1); uvs[k * 2 + 1] = i / (N - 1);
            }
        }
        const capA = N * M, capB = N * M + 1;
        positions[capA * 3] = centers[0].x; positions[capA * 3 + 1] = centers[0].y; positions[capA * 3 + 2] = centers[0].z;
        positions[capB * 3] = centers[N - 1].x; positions[capB * 3 + 1] = centers[N - 1].y; positions[capB * 3 + 2] = centers[N - 1].z;
        uvs[capA * 2] = 0.5; uvs[capA * 2 + 1] = 0;
        uvs[capB * 2] = 0.5; uvs[capB * 2 + 1] = 1;
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

        // 【対策】判定の基準は端ではなく中央のリング。断面が大きく法線が
        //         素直に外を向いており、個体によらず安定する
        const refI = Math.floor(N / 2), refIdx = refI * M;
        const normals = finalize(positions, indices, centers[refI], refIdx);
        weldNormals(positions, normals);
        return makeMesh(name, positions, indices, normals, uvs, null, scene);
    }

    // 【10】付け合わせ用。底 y=0 の凸ドーム。ノイズで縁を崩す
    function buildDome(name, scene, R, H, seed, segU, segV, rough) {
        const rings = [], centers = [];
        const rg = rough === undefined ? 0.28 : rough;
        for (let i = 0; i <= segV; i++) {
            const t = i / segV;                       // 0=底の縁 1=頂
            const th = t * Math.PI * 0.5;
            const rr = R * Math.cos(th), yy = H * Math.sin(th);
            // 【対策】頂点（t=1）では rr=0 なので、ノイズを残すと
            //         リング全周が同じ (x,z)=0 のまま y だけ散らばり、
            //         法線が定まらない縦の刺になる。極でゼロへ落とす
            const fade = 1 - Math.pow(t, 4);
            const ring = new Array(segU + 1);
            for (let j = 0; j <= segU; j++) {
                const ph = (j / segU) * TAU;
                const n = (Noise.fbm2u((j / segU) * 11, t * 6, 11, seed, 3) - 0.5) * fade;
                const k = 1 + rg * n;
                ring[j] = new V3(Math.cos(ph) * rr * k, yy * (1 + rg * 0.7 * n), Math.sin(ph) * rr * k);
            }
            rings.push(ring); centers.push(new V3(0, yy, 0));
        }
        return sweep(name, rings, centers, scene);
    }

    // 【10】すだちの切り口。中心から放射状に UV を張った円板
    function buildDisc(name, scene, R, segU, y, seed) {
        const total = segU + 2;
        const positions = new Float32Array(total * 3);
        const uvs = new Float32Array(total * 2);
        positions[0] = 0; positions[1] = y; positions[2] = 0;
        uvs[0] = 0.5; uvs[1] = 0.5;
        for (let j = 0; j <= segU; j++) {
            const ph = (j / segU) * TAU;
            const n = 1 + 0.03 * (Noise.fbm2u((j / segU) * 9, 0.5, 9, seed, 2) - 0.5);
            const k = j + 1;
            positions[k * 3] = Math.cos(ph) * R * n;
            positions[k * 3 + 1] = y;
            positions[k * 3 + 2] = Math.sin(ph) * R * n;
            uvs[k * 2] = 0.5 + 0.5 * Math.cos(ph) * n;
            uvs[k * 2 + 1] = 0.5 + 0.5 * Math.sin(ph) * n;
        }
        const indices = [];
        // 【対策】Babylon の ComputeNormals は面法線を (P1-P2)×(P3-P2) で
        //         求める。これは標準的な右手系の外積と符号が逆なので、
        //         右手系のつもりで巻くと法線が真下を向いて面が消える
        for (let j = 0; j < segU; j++) indices.push(0, j + 1, j + 2);
        const idx = new Uint32Array(indices);
        const normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, idx, normals);
        return makeMesh(name, positions, idx, normals, uvs, null, scene);
    }

    function catmull(p0, p1, p2, p3, t) {
        const t2 = t * t, t3 = t2 * t;
        return 0.5 * ((2 * p1) + (-p0 + p2) * t
            + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
            + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    }
    // 【対策】制御点の1列目に u を書きながら添字を等間隔とみなして補間すると、
    //         書いた位置と実際の形が食い違う。u で区間を引いてから補間する
    function tableAt(U, A, u) {
        const n = U.length;
        u = clamp(u, 0, 1);
        let i = 1;
        while (i < n - 1 && U[i] < u) i++;
        const u0 = U[i - 1], u1 = U[i];
        const t = (u1 > u0) ? (u - u0) / (u1 - u0) : 0;
        const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 1);
        return catmull(A[a], A[i - 1], A[i], A[b], t);
    }

    // =================================================================
    // 4. Fields
    // =================================================================
    //  u : 吻端(0) → 尾柄の末端(1)。皿の上では長辺方向（+x）
    //  a : 断面まわり(0..1)。a=0 は皿に接する底、0.25 が背、0.5 が上（体側）、
    //      0.75 が腹。縫い目は皿に接して見えない底に置く
    //  z : 背腹方向（+ が背）。皿の上では横方向
    //  y : 左右方向。皿の上では高さ（横倒しだから）
    //
    //  ※ TextureLab.bakeBody では軸の名前が入れ替わる（v=体軸 / u=断面まわり）。
    //     これは掃引の UV 規約（x=断面まわり, y=掃引方向）に従っているため
    // -----------------------------------------------------------------

    // 目の位置。造形（窪み）とテクスチャ（黒い環）で共有する
    const EYE_U = 0.113;    // 体軸方向
    const EYE_A = 0.448;    // 断面まわり（ほぼ真上＝体側の中央）
    // 【対策】UV は体軸 27.5cm・断面まわり（頭部では周長わずか 4.4cm）を
    //         それぞれ 0..1 に正規化しているので、同じ 0.5cm でも
    //         正規化長は 6 倍違う。両方に同じ値を使うと眼窩が縦長に潰れ、
    //         しかも眼球より小さくなって黒い環が中に隠れる
    // 【対策】UV は体軸 27.5cm・断面まわり（頭部の周長は 6.5cm しかない）を
    //         それぞれ 0..1 に正規化しているので、同じ 0.6cm でも
    //         正規化長は 4 倍以上違う。両方に同じ値を入れると眼窩が潰れる
    const EYE_RU = 0.0222;  // 眼窩の半径（体軸方向 ≒ 0.61cm）
    const EYE_RA = 0.094;   // 眼窩の半径（断面まわり ≒ 0.61cm）

    // 飾り包丁（X字）。交点は体の中央よりわずかに前
    const CUT_V = 0.470;
    const CUT_SLOPE = 0.27;

    // 【対策】体高（背腹）を皿の上での高さと取り違えると、魚が立った状態に
    //         なる。横倒しなので 体高 → 横幅 / 体幅 → 高さ
    const BU = [0.000, 0.030, 0.060, 0.095, 0.130, 0.175, 0.225, 0.300, 0.390, 0.480, 0.570, 0.665, 0.760, 0.850, 0.920, 0.965, 1.000];
    // 【対策】線画から体高を実測して置き直した。B の初版は u=0.030 の時点で
    //         すでに体高の 19%（実測 8%）あり、嘴がくさび形に太っていた。
    //         これが「口が大きく開いている」ように見える主因。
    //         サンマの吻は先端 3cm がほぼ 1mm 厚の細い嘴で、体高が立ち上がる
    //         のは鰓蓋を過ぎてから。最大体高は u≒0.39 で、B 初版の 0.25 より
    //         かなり後ろ。後半も実測どおり長く絞る
    //   実測(体高/最大):  0.030→0.08  0.060→0.19  0.095→0.35  0.130→0.50
    //                     0.175→0.68  0.225→0.86  0.300→0.97  0.390→1.00
    //                     0.480→0.97  0.684→0.74  0.835→0.41  1.000→0.18
    //
    // 【対策】頭部（u ≦ 0.30）を実写写真の実測から作り直したことがあるが、
    //         これは誤りだった。参照した写真はまな板の上で頭を持ち上げた
    //         角度で撮られており、頭部が短縮して写っている。そこから
    //         換算すると目の位置の体高が最大体高の 28% になってしまう。
    //         輪郭を直線近似したときの R^2 が 0.986 と高かったのは、
    //         短縮した頭部の中だけを測っていたからで、直線に見えたのは
    //         偶然にすぎない。
    //         実際のサンマの頭は「体高/u」が 6.3 → 4.3 と減っていく凸曲線で、
    //         嘴の付け根で素早く立ち上がってから鰓蓋にかけて寝る。
    //         一定勾配の円錐にすると、嘴だけが長い針になって
    //         「胴に串を刺した魚」になる
    // 【対策】吻端そのものは針ではない。両顎とも先端に 3mm × 1.4mm ほどの
    //         厚みがあるので、先頭の制御点をゼロ近くまで絞らないこと
    // 【対策】u=0.57〜0.85 が実測より最大 0.11 痩せていると、胴の後半が
    //         早く細るせいで背の盛り上がりが前へ寄り、猫背に見える
    //   体高/u:  0.030→6.33  0.060→6.00  0.095→5.74  0.175→5.07
    //            0.225→4.32  0.300→3.32
    const BD = [0.075, 0.190, 0.360, 0.545, 0.720, 0.888, 0.972, 0.996, 1.000, 0.988, 0.945, 0.858, 0.712, 0.458, 0.302, 0.226, 0.180];
    // 体幅（左右）。嘴は体高よりさらに細く絞るが、先端は潰さない
    const BW = [0.055, 0.145, 0.275, 0.425, 0.580, 0.748, 0.888, 0.958, 0.990, 1.000, 0.975, 0.905, 0.775, 0.510, 0.330, 0.240, 0.168];
    // 中心線の背腹方向のずれ（体高の最大値に対する比）。
    // 【対策】吻端を体高の 8.8%（0.37cm）も腹側へ落としていたため、
    //         頭が下を向き、その反動で背が盛り上がって見えていた。
    //         線画で中心線を測ると、頭から尾まで最大深さの 8% 以内、
    //         つまりほぼ一直線。ずれはごくわずかに留める
    const BZ = [-0.022, -0.019, -0.016, -0.012, -0.008, -0.004, 0.000, 0.002, 0.003, 0.003, 0.002, 0.000, -0.003, -0.007, -0.011, -0.014, -0.017];

    // 断面。横倒しの楕円。背側はやや尖り、腹は丸く、底は皿に接して潰れる
    function ringZY(a) {
        const phi = (a + 0.75) * TAU;              // a=0 → 底の中央
        const z = Math.cos(phi);
        let y = Math.sin(phi);
        const dor = Math.max(0, z), ven = Math.max(0, -z);
        // 【対策】単純な楕円のままだと背の稜が出ず、ソーセージに見える
        y *= (1 - 0.24 * dor * dor) * (1 - 0.05 * ven * ven);
        if (y < 0) y = -Math.pow(-y, 0.80);        // 皿に接して下がわずかに潰れる
        return [z, y];
    }

    // 部位マスク（テクスチャ・造形の両方で使う）
    const dorsalAt = (z) => smooth(0.10, 0.92, z);   // 背
    const ventralAt = (z) => smooth(-0.05, -0.88, z);  // 腹
    const flankAt = (y) => smooth(-0.20, 0.75, y);   // 上を向く体側

    // 【7】飾り包丁の場。体軸 u × 断面まわり a で X 字を引く。
    //      テクスチャと造形で同じ式を使うので、色と溝がずれない
    function cutAt(u, a, kazari) {
        if (!kazari) return 0;
        let c = 0;
        for (let k = 0; k < 2; k++) {
            const sg = k ? -1 : 1;
            const d0 = Math.abs((u - CUT_V) - sg * CUT_SLOPE * (a - 0.5));
            const m = (1 - smooth(0.0030, 0.0092, d0))
                * (1 - smooth(0.105, 0.205, Math.abs(a - 0.5)));
            if (m > c) c = m;
        }
        return c;
    }

    function makeShape(cfg, seed) {
        const rng = new Rng(seed);
        const S = {
            L: cfg.length * rng.range(0.96, 1.04),
            D: cfg.depth * rng.range(0.95, 1.05),
            W: cfg.width * rng.range(0.94, 1.06),
            tail: cfg.tailLen * rng.range(0.93, 1.07),
            bend: rng.range(-1.0, 1.0) * 0.55, // 焼き縮みによる緩い反り
            arch: rng.range(0.55, 1.25),
            kazari: !!cfg.kazariBocho,
            seed: seed
        };
        S.wob = (u, k) => (Noise.fbm2(u * 7.5 + k * 13.7, k * 7.3, seed + 101 + k * 37, 3) - 0.5);
        return S;
    }

    function halfDepthAt(u, S) {
        return Math.max(0.02, tableAt(BU, BD, u) * S.D * 0.5
            + S.wob(u, 0) * 0.045 * smooth(0.04, 0.16, u) * (1 - smooth(0.94, 1.0, u)));
    }
    function halfWidthAt(u, S) {
        return Math.max(0.015, tableAt(BU, BW, u) * S.W * 0.5
            + S.wob(u, 1) * 0.030 * smooth(0.04, 0.16, u) * (1 - smooth(0.94, 1.0, u)));
    }
    // 背腹方向の中心線。頭の下がりと、焼き縮みによる緩い S 字
    // 【対策】反りに sin(πu)·sin(1.6πu) を使うと、u≒0.40 で正のこぶ・
    //         u>0.625 で負のくぼみという S 字になり、振幅 1.9 と相まって
    //         中心線が最大 0.87cm も動いていた。背の輪郭を両端の弦から測ると
    //         膨らみが 1.06cm（実測 0.42cm）で、これが猫背の正体。
    //         振幅を 1/3 に落とし、こぶの位置が固定されない素直な弧に置き換える。
    //         結果、膨らみは 0.42〜0.46cm に収まり実測と一致する
    function centerZAt(u, S) {
        return tableAt(BU, BZ, u) * S.D
            + S.bend * (0.13 * Math.sin(Math.PI * u) + 0.07 * Math.sin(TAU * u))
            + S.wob(u, 2) * 0.10;
    }
    // 皿からの浮き。頭と尾がわずかに持ち上がる
    function liftAt(u, S) {
        return S.arch * (0.16 * Math.pow(smooth(0.30, 0.00, u), 1.4)
            + 0.20 * Math.pow(smooth(0.72, 1.00, u), 1.6));
    }

    // 体表の低周波な起伏。細かい鱗・水ぶくれは法線マップに任せる
    // 【対策】1〜2mm の水ぶくれをジオメトリで彫ると、断面 104 分割
    //         （≒1mm）では標本化が足りずモアレになる
    function reliefAt(u, a, S) {
        const [z, y] = ringZY(a);
        const flank = flankAt(y);
        // 【5】鰓蓋のふち。A の 0.055 では段が読み取れず、頭と胴が
        //      なめらかにつながって長い円錐に見えていた
        // 【対策】鰓蓋を「線1本」で表していたので頭と胴の境が読めず、
        //         吻から胴まで切れ目のない楔＝カジキの吻に見えていた。
        //         実物の鰓蓋は体表に重なる板で、後縁が自由縁として浮く。
        //         後縁は中ほどでいちばん後ろへ張り出し、背腹では前へ寄る
        const opB = 0.205 - 0.040 * z * z;
        const oper = smooth(0.134, 0.152, u) * (1 - smooth(opB - 0.005, opB, u));
        const gill = oper * 0.062
            + (1 - smooth(0.0, 0.014, Math.abs(u - opB))) * 0.052 * (1 - dorsalAt(z) * 0.30);
        // 下顎が上顎より突き出る。嘴が細くなったぶん量も控える
        const jaw = smooth(0.050, 0.004, u) * ventralAt(z) * 0.026;
        // 腹の膨らみ（内臓のあるあたり）
        const bulge = smooth(0.22, 0.36, u) * (1 - smooth(0.46, 0.62, u))
            * ventralAt(z) * 0.085;
        // 焼き縮みのうねり
        const swell = (Noise.fbm2(u * 16, (z + 1) * 2.2, S.seed + 419, 3) - 0.5) * 0.075
            * smooth(0.16, 0.28, u);
        // 【対策】しわを法線マップだけで表すと、横から見たときの輪郭が
        //         つるりと滑らかなままで、樹脂の筒に見える。焼き縮みの畝は
        //         0.4mm ほどあるのでジオメトリで持たせる。畝は皮が縮む向き＝
        //         体軸に直交して走るので、u に細かく z に粗いノイズを使う
        const body = smooth(0.13, 0.24, u) * (1 - smooth(0.94, 1.0, u));
        const w1 = Noise.fbm2(u * 62, (z + 1) * 4.5, S.seed + 521, 3);
        const ridge1 = 1 - Math.abs(w1 * 2 - 1);                 // 尾根状にする
        const w2 = Noise.fbm2(u * 27, (z + 1) * 9.5, S.seed + 577, 3);
        const ridge2 = 1 - Math.abs(w2 * 2 - 1);
        // 【対策】細かい畝だけではシルエットに出ない。実物は皮が縮んで
        //         1cm 間隔ほどの蛇腹状のひだになる。体を巻く向きに長く伸ばす
        const w3 = Noise.fbm2(u * 21, (z + 1) * 1.5, S.seed + 601, 2);
        const fold = 1 - Math.abs(w3 * 2 - 1);
        const wrinkle = ((ridge1 - 0.46) * 0.050 + (ridge2 - 0.46) * 0.072
            + (fold - 0.50) * 0.145) * body;

        // 【4】眼窩。実物の目は骨の窪みに嵌まっている。窪みが無いと
        //      白い楕円を体表に貼り付けただけに見える
        const dEy = Math.hypot((u - EYE_U) / EYE_RU, (a - EYE_A) / EYE_RA);
        const socket = -0.085 * (1 - smooth(0.50, 1.15, dEy));

        // 【7】飾り包丁を実際に彫る。テクスチャの陰影だけでは、
        //      斜めから見たときにテープを貼ったようにしか見えない
        const cut = -cutAt(u, a, S.kazari) * 0.115;

        return gill + jaw + bulge + swell * flank + wrinkle + socket + cut;
    }

    // =================================================================
    // 5. TextureLab
    // =================================================================
    const TextureLab = {
        _tex(name, w, h, fill, scene, alpha) {
            w = Math.max(8, Math.round(w) || 512);
            h = Math.max(8, Math.round(h) || 512);
            const dt = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(w, h);
            fill(img.data, w, h);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = !!alpha;
            dt.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
            dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
            dt.anisotropicFilteringLevel = 16;
            return dt;
        },

        normalFromHeight(name, scene, W, H, hf, strength) {
            return this._tex(name, W, H, (d) => {
                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        const xl = hf[y * W + ((x - 1 + W) % W)], xr = hf[y * W + ((x + 1) % W)];
                        const yu = hf[Math.max(0, y - 1) * W + x], yd = hf[Math.min(H - 1, y + 1) * W + x];
                        // 【対策】(yu - yd) = -dh/dv は「V が上を向く」OpenGL 系の規約。
                        //         Babylon の接空間は V が下向きなので、そのままだと
                        //         u方向は正・v方向は逆というねじれた法線になる
                        let nx = (xl - xr) * strength, ny = (yd - yu) * strength, nz = 1;
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

        // -------------------------------------------------------------
        //  体表の5枚を1パスで焼く
        //  albedo / ORM / 虹彩 / クリアコート / 高さ場（→法線）
        // -------------------------------------------------------------
        bakeBody(scene, cfg, S) {
            const W = cfg.texW, H = cfg.texH, sd = cfg.texSeed;
            const BK = cfg.back, BH = cfg.backHi, FL = cfg.flank, FH = cfg.flankHi;
            const BE = cfg.belly, BR = cfg.brown, CH = cfg.char, BU2 = cfg.burst, JW = cfg.jaw;
            const GD = cfg.golden;
            const CHAR = cfg.charAmount;

            const albD = new Uint8ClampedArray(W * H * 4);
            const ormD = new Uint8ClampedArray(W * H * 4);
            const ccD = new Uint8ClampedArray(W * H * 4);
            const irD = new Uint8ClampedArray(W * H * 4);
            const HF = new Float32Array(W * H);

            // 列（＝断面まわり）ごとに変わらない量
            const cZ = new Float32Array(W), cY = new Float32Array(W);
            for (let x = 0; x < W; x++) { const r = ringZY(x / W); cZ[x] = r[0]; cY[x] = r[1]; }

            for (let py = 0; py < H; py++) {
                const v = py / H;                             // 体軸方向
                const head = smooth(0.215, 0.062, v);         // 頭部
                const snout = smooth(0.075, 0.010, v);        // 吻
                const tailA = smooth(0.760, 0.985, v);        // 尾柄
                // 【対策】掃引のキャップは中心1頂点にリング全周を張るので、
                //         そこだけ一様色にしないと放射状のスミアが出る
                const capA = smooth(0.014, 0.000, v);
                const capB = smooth(0.992, 1.000, v);

                for (let x = 0; x < W; x++) {
                    const u = x / W, i = py * W + x, o = i * 4;   // u は断面まわり
                    const rz = cZ[x], ry = cY[x];
                    const dor = dorsalAt(rz), ven = ventralAt(rz), flank = flankAt(ry);

                    // ---------------------------------------------------
                    //  下地：背腹方向のグラデーション
                    // 【対策】ここが見た目のほぼすべて。均一な銀色にすると
                    //         「魚の形をした金属」になる
                    // ---------------------------------------------------
                    const mott = Noise.fbm2u(u * 7, v * 26, 7, sd + 41, 4);
                    let cr = FL[0], cg = FL[1], cb = FL[2];
                    // 体側の光る帯（側線のすぐ上）
                    // 帯のすぐ下を走る銀の輝き。帯の下端が上がったぶん一緒に上げる
                    const shine = (1 - smooth(0.0, 0.42, Math.abs(rz - 0.16)))
                        * (0.45 + 0.75 * Noise.fbm2u(u * 5, v * 14, 5, sd + 47, 3));
                    const shineC = clamp(shine, 0, 1);
                    cr = mix(cr, FH[0], shineC * 0.72);
                    cg = mix(cg, FH[1], shineC * 0.72);
                    cb = mix(cb, FH[2], shineC * 0.72);
                    // 背
                    // 【対策】背の黒は「稜の細い線」ではなく体側の上 1/3 を覆う。
                    //         しかも銀との境目はぼんやりしたグラデーションではなく、
                    //         側線のすぐ上で波打ちながら切り替わる
                    // 【対策】帯の下端が rz=0.02（体高の中央）まで下りており、
                    //         皿の上で見える幅が全幅の 33%。実写を測ると
                    //         背側 24% しかない。帯の中心を rz≒0.48 に上げる
                    const bwob = (Noise.fbm2u(u * 4, v * 22, 4, sd + 43, 3) - 0.5) * 0.30
                        + (Noise.fbm2u(u * 9, v * 64, 9, sd + 44, 2) - 0.5) * 0.11;
                    const bk = smooth(0.36 + bwob, 0.60 + bwob, rz);
                    const mk = smooth(0.42, 0.86, mott) * 0.62;
                    let br0 = mix(BK[0], BH[0], mk);
                    let bg0 = mix(BK[1], BH[1], mk);
                    let bb0 = mix(BK[2], BH[2], mk);
                    cr = mix(cr, br0, bk); cg = mix(cg, bg0, bk); cb = mix(cb, bb0, bk);
                    // 腹
                    const bl = smooth(-0.42, -0.88, rz);
                    cr = mix(cr, BE[0], bl * 0.85); cg = mix(cg, BE[1], bl * 0.85); cb = mix(cb, BE[2], bl * 0.85);

                    // 鱗の名残。ほとんど剥がれているのでごく薄く
                    const scx = u * 46, scy = v * 150;
                    const srow = Math.floor(scy);
                    const sox = scx + (srow & 1) * 0.5;
                    const dx = sox - Math.floor(sox) - 0.5, dy = (scy - srow) - 0.5;
                    const scale = (1 - smooth(0.22, 0.46, Math.sqrt(dx * dx + dy * dy * 2.4)))
                        * smooth(0.34, 0.74, Noise.fbm2u(u * 9, v * 20, 9, sd + 53, 3));
                    cr = mix(cr, 0.86, scale * 0.045); cg = mix(cg, 0.88, scale * 0.045); cb = mix(cb, 0.90, scale * 0.045);

                    // 側線
                    const ll = 1 - smooth(0.0, 0.040, Math.abs(rz + 0.02)
                        - 0.020 * (Noise.fbm2u(u * 3, v * 30, 3, sd + 59, 2) - 0.5));
                    cr *= (1 - ll * 0.10); cg *= (1 - ll * 0.09); cb *= (1 - ll * 0.07);

                    // ---------------------------------------------------
                    //  頭部
                    // ---------------------------------------------------
                    // 【対策】頭全体を一様な灰青に振ると、吻端から鰓蓋まで
                    //         切れ目のない楔になり、カジキの吻に見える。
                    //         実物の顔は3つの面でできている:
                    //           ・頭頂と吻の上面 … 緑青の暗い面
                    //           ・頬と鰓蓋       … 明るい銀白の板。頭と胴を区切る
                    //           ・下顎と鰓膜     … 白く、先端だけ黄色
                    //         この銀白の板と、その後縁の線が顔らしさの正体
                    let oper = 0;
                    if (v < 0.245) {
                        const opWob = 0.0030 * (Noise.fbm2u(u * 5, v * 12, 5, sd + 191, 2) - 0.5);
                        const opB = 0.205 - 0.040 * rz * rz + opWob;   // 鰓蓋の後縁
                        const opF = 0.134 - 0.014 * rz * rz;           // 前鰓蓋骨の前縁
                        // 【対策】鰓蓋の銀白板を断面の全周に塗っていたため、
                        //         背の黒帯が鰓の上だけ銀色に消えていた。
                        //         実物の鰓蓋は頬から下の範囲にしかなく、
                        //         頭の上面は黒帯がそのまま吻端まで続く
                        const opTop = 1 - smooth(0.30, 0.56, rz);
                        oper = smooth(opF, opF + 0.013, v) * (1 - smooth(opB - 0.005, opB, v)) * opTop;

                        // 頭頂と吻の上面は暗いまま。鰓蓋の板にも背側にも灰青を乗せない
                        // 【対策】灰青へ 0.35 混ぜると、頭の上の黒帯が 0.078 → 0.178 まで
                        //         持ち上がって胴の帯と色が繋がらない
                        const hk = head * 0.72 * (1 - oper * 0.88) * (1 - smooth(0.24, 0.56, rz) * 0.92);
                        cr = mix(cr, mix(cr, 0.48, 0.35), hk);
                        cg = mix(cg, mix(cg, 0.52, 0.35), hk);
                        cb = mix(cb, mix(cb, 0.55, 0.35), hk);

                        // 頬と鰓蓋の銀白板。主鰓蓋骨の放射状の筋を薄く入れる
                        const opRay = 1 - Math.abs(((((rz * 3.2 + v * 26 + 8) % 1) + 1) % 1) * 2 - 1);
                        const opK = 0.955 - 0.070 * opRay;
                        cr = mix(cr, 0.878 * opK, oper * 0.88);
                        cg = mix(cg, 0.892 * opK, oper * 0.88);
                        cb = mix(cb, 0.902 * opK, oper * 0.88);

                        // 後縁の線。ここで頭と胴が切れる
                        const opEdge = 1 - smooth(0.0, 0.0060, Math.abs(v - opB));
                        cr = mix(cr, 0.205, opEdge * 0.74);
                        cg = mix(cg, 0.228, opEdge * 0.74);
                        cb = mix(cb, 0.252, opEdge * 0.74);
                        // 前鰓蓋骨の稜（目のうしろから下へ走る）
                        const preOp = (1 - smooth(0.0, 0.0052, Math.abs(v - (opF + 0.026))))
                            * smooth(0.20, -0.60, rz);
                        cr = mix(cr, 0.42, preOp * 0.42);
                        cg = mix(cg, 0.45, preOp * 0.42);
                        cb = mix(cb, 0.48, preOp * 0.42);

                        // 鰓膜。鰓蓋の下の腹側。焼けて赤褐色に締まる
                        const memb = oper * smooth(-0.28, -0.86, rz);
                        cr = mix(cr, 0.392, memb * 0.72);
                        cg = mix(cg, 0.262, memb * 0.72);
                        cb = mix(cb, 0.205, memb * 0.72);

                        // 吻。上顎は暗いまま、下顎側は白銀
                        const beak = smooth(0.100, 0.022, v);
                        const bkw = beak * ventralAt(rz) * 0.64;
                        cr = mix(cr, 0.905, bkw); cg = mix(cg, 0.912, bkw); cb = mix(cb, 0.905, bkw);

                        // 【対策】口角は嘴の付け根（v≒0.072）までで、そこから
                        //         後ろへは開かない。幅の広い帯を長く引くと、
                        //         体長の 1/8 に渡って口が裂けているように見える
                        const mouth = (1 - smooth(0.0, 0.022, Math.abs(rz + 0.04)))
                            * smooth(0.074, 0.048, v);
                        cr = mix(cr, 0.12, mouth * 0.85);
                        cg = mix(cg, 0.11, mouth * 0.85);
                        cb = mix(cb, 0.11, mouth * 0.85);
                    }
                    // 下顎の先だけ黄色い
                    const jaw = snout * smooth(0.20, -0.55, rz) * smooth(0.019, 0.002, v);
                    cr = mix(cr, JW[0], jaw * 0.92); cg = mix(cg, JW[1], jaw * 0.92); cb = mix(cb, JW[2], jaw * 0.92);

                    // 【4】眼窩の黒い環。ここでは v が体軸、u が断面まわり
                    const dEye = Math.hypot((v - EYE_U) / EYE_RU, (u - EYE_A) / EYE_RA);
                    const eyeRim = (1 - smooth(1.06, 1.42, dEye)) * smooth(0.62, 0.98, dEye);
                    const eyeIn = 1 - smooth(0.30, 0.92, dEye);
                    cr = mix(cr, 0.085, eyeRim * 0.88); cg = mix(cg, 0.078, eyeRim * 0.88); cb = mix(cb, 0.075, eyeRim * 0.88);
                    cr = mix(cr, 0.20, eyeIn * 0.70); cg = mix(cg, 0.19, eyeIn * 0.70); cb = mix(cb, 0.19, eyeIn * 0.70);

                    // 尾柄の後方は黄色みを帯びる（北海道立総合研究機構の記載）
                    const ped = smooth(0.855, 0.985, v) * (0.45 + 0.55 * flank);
                    cr = mix(cr, 0.795, ped * 0.34); cg = mix(cg, 0.712, ped * 0.34); cb = mix(cb, 0.372, ped * 0.34);

                    // ---------------------------------------------------
                    //  焼き色
                    // ---------------------------------------------------
                    // 【2】ノイズの周期をコメントの意図に合わせる。
                    //      周長 11cm / 全長 28cm なので
                    //        大域 3.5cm → u*3,  v*8
                    //        水ぶくれ   → u*30, v*108（0.37 / 0.26cm）
                    //        焦げの粒   → u*74, v*262
                    //      A では region が 2.2 × 1.4cm、spotN が 0.6 × 1.3cm で
                    //      斑が円にならず縦に裂けていた
                    // 【対策】焼き目は鱗の列に沿って斜めに流れる。素直に u,v で
                    //         ノイズを引くと、体軸に平行な縞にしか見えない
                    const wu = u + 0.075 * Math.sin(v * 9.0 + 1.7) + 0.028 * Math.sin(v * 26.0);
                    const region = Noise.fbm2u(wu * 3, v * 8, 3, sd + 79, 4);
                    const cell = Noise.fbm2u(wu * 30, v * 108, 30, sd + 83, 3);
                    const grain = Noise.fbm2u(wu * 74, v * 262, 74, sd + 97, 2);

                    // 【1】火の当たり具合。
                    //
                    // 【対策】しきい値は fBm の実際の分布に合わせて置くこと。
                    //         正規化した fBm は平均 0.5 に集中し、標準偏差は
                    //           2オクターブ 0.149 / 3オクターブ 0.131 / 4オクターブ 0.122
                    //         しかない。0.44〜0.86 のような広い区間を渡すと、
                    //         典型値では smoothstep が 0.05〜0.15 しか返さず
                    //         焼き色が全滅する（B の初版がこれだった）。
                    //         逆に 0.26〜0.80 のような低い区間だと全面が焼ける。
                    //         区間の中心は 0.50〜0.55、幅は ±1〜2σ が目安
                    let heat = (0.28 + 0.60 * dor + 0.32 * flank) * CHAR
                        * (0.40 + 1.05 * smooth(0.42, 0.64, region));
                    // 実物の焼き秋刀魚は頭がほぼ白銀のまま残る
                    heat *= (1 - head * 0.85);
                    heat = clamp(heat, 0, 1.35);

                    // 【1】下地のきつね色には天井を設ける。銀を 3 割は残す
                    const washN = 0.46 * region + 0.36 * cell + 0.18 * grain;
                    const wash = clamp(heat * (0.22 + 0.72 * smooth(0.44, 0.62, washN)), 0, 0.72);
                    const hueN = Noise.fbm2u(wu * 12, v * 44, 12, sd + 101, 3);

                    const gk = 0.88 + 0.24 * hueN;
                    cr = mix(cr, clamp(GD[0] * gk, 0, 1), wash * 0.78);
                    cg = mix(cg, clamp(GD[1] * gk, 0, 1), wash * 0.78);
                    cb = mix(cb, clamp(GD[2] * gk, 0, 1), wash * 0.78);

                    // 【8】焼けて白濁し、浮いて剥がれかけた皮。
                    //      実写の「白さ」は塩だけではなく、この皮膜が半分を占める。
                    //      きつね色の上に乗るので、wash のあと・斑の前に置く
                    const filmN = Noise.fbm2u(wu * 4, v * 13, 4, sd + 173, 3);
                    // 3オクターブ σ=0.131。0.545 が +0.34σ なので約 4 割に出る
                    const film = smooth(0.545, 0.700, filmN) * (0.35 + 0.75 * flank)
                        * (1 - head * 0.35) * (1 - wash * 0.5);
                    cr = mix(cr, 0.932, film * 0.55); cg = mix(cg, 0.926, film * 0.55); cb = mix(cb, 0.906, film * 0.55);

                    // 中層：焼き斑
                    // 【1】【2】斑の面積を閾値で決める。spotF の σ は 0.111 なので
                    //      0.612 = +1.0σ ≒ 面積 16%（浅く焼けたところ）
                    //      0.505 = -0.05σ ≒ 面積 46%（よく焼けたところ）
                    //      周期も等方に近づけ、実物どおり直径 1.2cm のほぼ真円にする
                    const spotN = Noise.fbm2u(wu * 9, v * 23, 9, sd + 401, 2);
                    const spotF = spotN * 0.72 + cell * 0.21 + grain * 0.07;
                    const sTh = mix(0.612, 0.505, clamp(heat / 1.35, 0, 1));
                    const spot = smooth(sTh, sTh + 0.070, spotF);
                    const depth = clamp((spotF - sTh) / 0.155, 0, 1);

                    // 浅い＝金茶 / 中＝茶 / 深い＝焦げ茶
                    const dk = 0.86 + 0.30 * hueN;
                    let tr, tg, tb;
                    if (depth < 0.5) {
                        const q2 = depth * 2;
                        tr = mix(GD[0] * 0.86, BR[0] * 1.40, q2);
                        tg = mix(GD[1] * 0.80, BR[1] * 1.36, q2);
                        tb = mix(GD[2] * 0.74, BR[2] * 1.30, q2);
                    } else {
                        const q2 = (depth - 0.5) * 2;
                        tr = mix(BR[0] * 1.40, BR[0] * 0.52, q2);
                        tg = mix(BR[1] * 1.36, BR[1] * 0.50, q2);
                        tb = mix(BR[2] * 1.30, BR[2] * 0.48, q2);
                    }
                    cr = mix(cr, clamp(tr * dk, 0, 1), spot * 0.90);
                    cg = mix(cg, clamp(tg * dk, 0, 1), spot * 0.90);
                    cb = mix(cb, clamp(tb * dk, 0, 1), spot * 0.90);

                    // 最上層：炭化した細かい点。斑の深いところに散る
                    // σ=0.091 の場に対し 0.560 = +0.66σ。斑の内側にだけ黒い粒が散る
                    const charAmt = clamp(smooth(0.560, 0.760, grain * 0.45 + spotF * 0.55)
                        * spot * (0.25 + 1.00 * depth), 0, 1);
                    cr = mix(cr, CH[0], charAmt * 0.86);
                    cg = mix(cg, CH[1], charAmt * 0.86);
                    cb = mix(cb, CH[2], charAmt * 0.86);

                    const bA = wash;
                    const blister = spot;

                    // 【1】背の稜の炭化。A ではここも背の全長を覆っており、
                    //      青黒が完全に消えていた。region で強く絞る
                    const ridge = clamp(smooth(0.62, 0.94, rz)
                        * smooth(0.455, 0.575, region) * CHAR * 0.85, 0, 1);
                    cr = mix(cr, CH[0] * 0.72, ridge * 0.80);
                    cg = mix(cg, CH[1] * 0.72, ridge * 0.80);
                    cb = mix(cb, CH[2] * 0.72, ridge * 0.80);

                    // 皮が破れて身が覗く
                    // 0.685 = +1.4σ、さらに grain で絞るので数か所しか出ない
                    const burst = smooth(0.685, 0.760, cell) * smooth(0.600, 0.700, grain) * flank * (1 - head);
                    cr = mix(cr, BU2[0], burst * 0.85); cg = mix(cg, BU2[1], burst * 0.85); cb = mix(cb, BU2[2], burst * 0.85);

                    // 【8】塩。A の閾値 0.845〜0.955 では一部にしか出ず、
                    //      実写の粉を吹いた白さが再現できていなかった
                    // 【対策】u*46 / v*150 では粒が 2.4mm × 1.9mm もあり、
                    //         白い斑点が麻疹のように浮いていた。塩の結晶は
                    //         0.5mm 前後で、大半は溶けて白い霞になる
                    const salt = smooth(0.715, 0.900, Noise.fbm2u(u * 92, v * 300, 92, sd + 131, 2))
                        * (0.55 + 0.75 * bl + 0.60 * head) * (1 - charAmt * 0.7);
                    const saltA = clamp(salt, 0, 1);
                    cr = mix(cr, 0.985, saltA * 0.78); cg = mix(cg, 0.985, saltA * 0.78); cb = mix(cb, 0.975, saltA * 0.78);

                    // ---------------------------------------------------
                    //  【7】飾り包丁（X字）。造形と同じ式を使う
                    // ---------------------------------------------------
                    const cutN = 0.0035 * (Noise.fbm2(u * 8, v * 40, sd + 149, 2) - 0.5);
                    const cut = cutAt(v + cutN, u, cfg.kazariBocho);
                    // 溝の芯は身の白、縁は火が回って濃い
                    const cutCore = Math.pow(cut, 1.6), cutEdge = cut * (1 - cutCore);
                    cr = mix(cr, BU2[0] * 0.97, cutCore * 0.82);
                    cg = mix(cg, BU2[1] * 0.97, cutCore * 0.82);
                    cb = mix(cb, BU2[2] * 0.97, cutCore * 0.82);
                    cr = mix(cr, BR[0] * 1.05, cutEdge * 0.45);
                    cg = mix(cg, BR[1] * 1.05, cutEdge * 0.45);
                    cb = mix(cb, BR[2] * 1.05, cutEdge * 0.45);

                    // ---------------------------------------------------
                    //  端を一様色へ（キャップのスミア対策）
                    // ---------------------------------------------------
                    cr = mix(cr, 0.40, capA); cg = mix(cg, 0.42, capA); cb = mix(cb, 0.44, capA);
                    cr = mix(cr, 0.52, capB); cg = mix(cg, 0.54, capB); cb = mix(cb, 0.55, capB);

                    albD[o] = cr * 255; albD[o + 1] = cg * 255; albD[o + 2] = cb * 255; albD[o + 3] = 255;

                    // ---- 高さ場 --------------------------------------
                    // 【対策】焦げを凹ませていたが逆。カリカリの焦げは皮が
                    //         盛り上がって固まり、そこに細かいひびが入る
                    const wrN = Noise.fbm2u(u * 11, v * 118, 11, sd + 307, 2);
                    const wrinkleT = (1 - Math.abs(wrN * 2 - 1));            // 焼き縮みの畝
                    const crN = Noise.fbm2u(u * 52, v * 186, 52, sd + 311, 2);
                    const crack = 1 - smooth(0.0, 0.075, Math.abs(crN - 0.5));  // 焦げのひび
                    let h = 0.50 + (grain - 0.5) * 0.30 + scale * 0.08;
                    h += (wrinkleT - 0.45) * 0.42;               // 皮全体が縮んで畝立つ
                    h += blister * 0.22;                         // 水ぶくれは膨らむ
                    h += charAmt * 0.24;                         // 焦げは固まって盛り上がり
                    h += film * 0.10;                            // 浮いた皮膜
                    // 【対策】ひびを全面に入れると、焼けていない銀の面まで
                    //         干からびた革になる。ひび割れるのは焼けた皮だけ
                    h -= crack * (0.06 + 0.78 * clamp(0.35 * wash + 0.80 * charAmt, 0, 1));
                    h -= ridge * 0.06;
                    h -= burst * 0.20;                           // 破れは凹む
                    h += saltA * 0.22;
                    // 【7】溝はジオメトリでも彫るので、法線側は縁を立てる分だけ
                    h -= cutCore * 0.34;
                    h += cutEdge * 0.10;
                    h += oper * 0.10;                            // 鰓蓋の板は一段高い
                    h -= (1 - smooth(0.0, 0.009, Math.abs(v - (0.205 - 0.040 * rz * rz)))) * 0.24;
                    h -= eyeIn * 0.30; h += eyeRim * 0.10;       // 【4】眼窩
                    h = mix(h, 0.52, Math.max(capA, capB));
                    HF[i] = clamp(h, 0, 1);

                    // ---- ORM -----------------------------------------
                    let rough = mix(0.32, 0.44, dor);
                    rough = mix(rough, 0.28, bl * 0.6);
                    rough = mix(rough, 0.74, bA * 0.92);
                    rough = mix(rough, 0.86, spot * 0.8);
                    rough = mix(rough, 0.94, crack * (0.20 + 0.75 * clamp(wash * 0.5 + charAmt, 0, 1)));
                    rough = mix(rough, 0.93, charAmt);
                    rough = mix(rough, 0.90, ridge);
                    rough = mix(rough, 0.80, burst);
                    rough = mix(rough, 0.62, head * 0.5);
                    rough = mix(rough, 0.21, oper * 0.90);       // 鰓蓋は磨いた銀の板
                    rough = mix(rough, 0.66, film * 0.55);       // 【8】白濁した膜は艶が無い
                    rough = mix(rough, 0.88, cutCore * 0.8);
                    // 【3】metallic は虹彩層に譲って控えめに。
                    //      A の 0.42 は「魚の形をしたスプーン」の主因だった
                    let metal = cfg.metal * (1 - bA * 0.94) * (1 - charAmt) * (1 - ridge * 0.9)
                        * (1 - head * 0.65 * (1 - oper)) * (1 - film * 0.75)
                        * (0.55 + 0.60 * shineC + 0.85 * oper);
                    let ao = 1.0;
                    ao = mix(ao, 0.55, cutCore * 0.9);
                    ao = mix(ao, 0.80, burst * 0.5);
                    ao = mix(ao, 0.82, (1 - smooth(0.0, 0.012, Math.abs(v - (0.205 - 0.040 * rz * rz)))) * 0.70);
                    ao = mix(ao, 0.62, eyeIn * 0.75);
                    ormD[o] = clamp(ao, 0, 1) * 255;
                    ormD[o + 1] = clamp(rough, 0.05, 1) * 255;
                    ormD[o + 2] = clamp(metal, 0, 1) * 255;
                    ormD[o + 3] = 255;

                    // ---- 【3】虹彩（グアニン板の薄膜干渉）--------------
                    //  R = 強さ / G = 膜厚
                    //  焼けた面・焦げ・頭・剥がれた皮膜では消える。
                    //  残るのは銀のままの体側だけ
                    const iriI = clamp((1 - wash * 1.5) * (1 - charAmt) * (1 - ridge)
                        * (1 - film * 0.85) * (1 - head * 0.70 * (1 - oper))
                        * (0.25 + 0.90 * flank + 0.55 * oper) * (0.45 + 0.75 * shineC), 0, 1);
                    // 膜厚は背で厚く（青紫）、腹で薄く（金）。低周波のムラを足す
                    const iriT = clamp(0.28 + 0.34 * dor + 0.42 * Noise.fbm2u(u * 6, v * 18, 6, sd + 167, 3), 0, 1);
                    irD[o] = iriI * 255; irD[o + 1] = iriT * 255; irD[o + 2] = 0; irD[o + 3] = 255;

                    // ---- クリアコート（脂と水分の膜）------------------
                    // 【対策】焼けて乾いた面に脂の膜は残らない。
                    //         膜が残るのは、脂の溜まる窪みだけ
                    const oilPatch = smooth(0.52, 0.86, Noise.fbm2u(u * 11, v * 34, 11, sd + 211, 3));
                    let cci = cfg.oil * (0.10 + 0.95 * oilPatch) * (0.35 + 0.85 * flank);
                    cci *= (1 - charAmt * 0.95) * (1 - wash * 0.62) * (1 - crack * 0.5) * (1 - film * 0.6);
                    cci = mix(cci, cfg.oil * 0.30, Math.max(capA, capB));
                    let ccr = mix(0.12, 0.32, 1 - oilPatch);
                    ccD[o] = clamp(cci, 0, 1) * 255;
                    ccD[o + 1] = clamp(ccr, 0.02, 1) * 255;
                    ccD[o + 2] = 0; ccD[o + 3] = 255;
                }
            }

            const albedo = this._tex("sanmaAlbedo", W, H, (d) => d.set(albD), scene);
            const orm = this._tex("sanmaORM", W, H, (d) => d.set(ormD), scene);
            const cc = this._tex("sanmaCC", W, H, (d) => d.set(ccD), scene);
            const irid = this._tex("sanmaIrid", W, H, (d) => d.set(irD), scene);
            const normal = this.normalFromHeight("sanmaNormal", scene, W, H, HF, 1.85);
            return { albedo, orm, cc, irid, normal };
        },

        // -------------------------------------------------------------
        //  ヒレ。条はジオメトリ側で作るので、ここは根元→先の変化だけ
        // 【6】アルファを持たせて外縁をほつれさせる。焼けたヒレの先は
        //      膜が焦げて抜け落ち、鰭条だけが残る
        // -------------------------------------------------------------
        fin(scene, cfg, seed) {
            const N = 256;
            const HF = new Float32Array(N * N);
            const F = cfg.fin, CH = cfg.char, AM = cfg.finAmber;
            const alb = this._tex("finAlbedo", N, N, (d) => {
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const s = x / N, t = y / N, i2 = y * N + x, o = i2 * 4;
                    // 根元は脂を吸って飴色に透け、先へ行くほど乾いて焦げる
                    const am = 1 - smooth(0.02, 0.42, t);
                    let cr = mix(F[0], AM[0], am * 0.75);
                    let cg = mix(F[1], AM[1], am * 0.75);
                    let cb = mix(F[2], AM[2], am * 0.75);
                    // 焼き縮みの皺（条に直交する向き）
                    const wr = Noise.fbm2(s * 40, t * 7, seed + 3, 3);
                    const wk = 0.84 + 0.34 * wr;
                    cr *= wk; cg *= wk; cb *= wk;
                    // 縁から焦げる。先端はほぼ黒
                    const edge = smooth(0.40, 0.98, t) * (0.55 + 0.85 * Noise.fbm2(s * 11, t * 5, seed + 13, 3));
                    const ch = clamp(edge * cfg.charAmount, 0, 1);
                    cr = mix(cr, CH[0], ch * 0.92); cg = mix(cg, CH[1], ch * 0.92); cb = mix(cb, CH[2], ch * 0.92);
                    // 【6】外縁のほつれ。アルファテストで抜く
                    const rag = Noise.fbm2(s * 26, t * 6, seed + 29, 3);
                    const a = 1 - smooth(0.80 + 0.15 * rag, 1.02, t);
                    d[o] = cr * 255; d[o + 1] = cg * 255; d[o + 2] = cb * 255;
                    d[o + 3] = clamp(a, 0, 1) * 255;
                    HF[i2] = 0.5 + (wr - 0.5) * 0.30 - ch * 0.16;
                }
            }, scene, true);
            const nrm = this.normalFromHeight("finNormal", scene, N, N, HF, 0.9);
            return { albedo: alb, normal: nrm };
        },

        // -------------------------------------------------------------
        //  目。加熱で白濁した水晶体・その縁の暗い環・強膜
        // 【対策】焼き魚の目に黒目は無い。水晶体のタンパク質が 60℃ 前後で
        //         凝固して不透明な乳白色になり、瞳孔は完全に消える。
        //         黒い球を置くと「生の魚の顔」になってしまう。
        //         暗く見えるのは水晶体の縁の細い環だけなので、
        //         球ひとつに極角（v）で環を焼き込む
        //
        //  v は buildSphere の掃引方向＝極角。v=0 が真上（水晶体の中心）
        //    0.00〜0.17  水晶体（この範囲は lens 球が上から覆う）
        //    0.17〜0.27  縁の暗い環
        //    0.27〜0.45  強膜。白濁して黄味を帯びる
        //    0.45〜      眼窩に隠れる。暗く落とす
        // -------------------------------------------------------------
        eye(scene, size, seed) {
            const LENS = [0.862, 0.826, 0.712];   // 凝固した水晶体
            const RING = [0.142, 0.108, 0.082];   // 縁の環
            const SCL = [0.905, 0.892, 0.852];   // 強膜
            const DEEP = [0.322, 0.272, 0.228];   // 眼窩の奥
            const HE = new Float32Array(size * size);
            const alb = this._tex("eyeAlbedo", size, size, (d, N) => {
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const u = x / N, v = y / N, i = y * N + x, o = i * 4;
                    // 環はきれいな真円ではなく、加熱で歪む
                    const wob = (Noise.fbm2u(u * 6, v * 9, 6, seed + 5, 3) - 0.5) * 0.030;
                    const vv = v + wob;
                    let cr = LENS[0], cg = LENS[1], cb = LENS[2];
                    // 水晶体の芯はわずかに灰緑
                    const core = 1 - smooth(0.00, 0.13, vv);
                    cr = mix(cr, 0.742, core * 0.55); cg = mix(cg, 0.748, core * 0.55); cb = mix(cb, 0.688, core * 0.55);
                    const ring = smooth(0.165, 0.205, vv) * (1 - smooth(0.250, 0.292, vv));
                    cr = mix(cr, RING[0], ring * 0.92); cg = mix(cg, RING[1], ring * 0.92); cb = mix(cb, RING[2], ring * 0.92);
                    const scl = smooth(0.280, 0.330, vv);
                    cr = mix(cr, SCL[0], scl); cg = mix(cg, SCL[1], scl); cb = mix(cb, SCL[2], scl);
                    const deep = smooth(0.430, 0.560, vv);
                    cr = mix(cr, DEEP[0], deep); cg = mix(cg, DEEP[1], deep); cb = mix(cb, DEEP[2], deep);
                    // 白濁のムラ
                    const mo = Noise.fbm2u(u * 11, v * 16, 11, seed + 13, 3);
                    const mk = 0.92 + 0.17 * mo;
                    cr *= mk; cg *= mk; cb *= mk;
                    d[o] = clamp(cr, 0, 1) * 255; d[o + 1] = clamp(cg, 0, 1) * 255;
                    d[o + 2] = clamp(cb, 0, 1) * 255; d[o + 3] = 255;
                    HE[i] = 0.5 + (mo - 0.5) * 0.35 - ring * 0.45 - deep * 0.25;
                }
            }, scene);
            const nrm = this.normalFromHeight("eyeNormal", scene, size, size, HE, 0.85);
            return { albedo: alb, normal: nrm };
        },

        // -------------------------------------------------------------
        //  皿（粉引き風の長角皿）。タイリングして使う
        // 【9】純白 0.905 は CG っぽい。実物の和皿は生成りで、黄味が残る
        // -------------------------------------------------------------
        plate(scene, size, seed) {
            const H = new Float32Array(size * size);
            const tex = this._tex("plateAlbedo", size, size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    for (let x = 0; x < N; x++) {
                        const u = x / N, v = y / N, i = y * N + x, o = i * 4;
                        const mo = Noise.fbm2p(u * 6, v * 6, 6, 6, seed + 11, 4);
                        let c = 0.878 + (mo - 0.5) * 0.085;
                        const sp = Noise.v2p(u * 90, v * 90, 90, 90, seed + 23);
                        const dot = smooth(0.958, 0.995, sp);
                        c = mix(c, 0.34, dot * 0.85);
                        const cr = Noise.fbm2p(u * 9, v * 9, 9, 9, seed + 37, 3);
                        const crack = 1 - smooth(0.0, 0.020, Math.abs(cr - 0.5));
                        c = mix(c, 0.70, crack * 0.28);
                        // 生成り。青を落として黄味を残す
                        d[o] = c * 255; d[o + 1] = (c * 0.982) * 255; d[o + 2] = (c * 0.936) * 255; d[o + 3] = 255;
                        H[i] = 0.5 + (mo - 0.5) * 0.6 - dot * 0.35 - crack * 0.25;
                    }
                }
            }, scene);
            const nrm = this.normalFromHeight("plateNormal", scene, size, size, H, 0.55);
            const orm = this._tex("plateORM", size, size, (d, N) => {
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const u = x / N, v = y / N, o = (y * N + x) * 4;
                    const mo = Noise.fbm2p(u * 6, v * 6, 6, 6, seed + 11, 4);
                    const sp = Noise.v2p(u * 90, v * 90, 90, 90, seed + 23);
                    let r = 0.26 + (mo - 0.5) * 0.18;
                    r = mix(r, 0.64, smooth(0.958, 0.995, sp));
                    d[o] = 255; d[o + 1] = clamp(r, 0.04, 1) * 255; d[o + 2] = 0; d[o + 3] = 255;
                }
            }, scene);
            for (const t of [tex, nrm, orm]) { t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; }
            return { albedo: tex, normal: nrm, orm };
        },

        // -------------------------------------------------------------
        //  テーブル（木）
        // -------------------------------------------------------------
        wood(scene, size, seed) {
            const H = new Float32Array(size * size);
            const A = [0.472, 0.318, 0.196], B = [0.752, 0.578, 0.398], K = [0.318, 0.202, 0.122];
            const tex = this._tex("woodAlbedo", size, size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    for (let x = 0; x < N; x++) {
                        const u = x / N, v = y / N, i = y * N + x, o = i * 4;
                        const warp = (Noise.fbm2p(u * 3, v * 7, 3, 7, seed + 5, 4) - 0.5) * 0.42;
                        const g = (v * 13 + warp * 6);
                        const ring = Math.abs(((g - Math.floor(g)) - 0.5) * 2);
                        let k = smooth(0.32, 0.96, ring);
                        k = clamp(k + (Noise.fbm2p(u * 5, v * 160, 5, 160, seed + 19, 2) - 0.5) * 0.30, 0, 1);
                        let cr = mix(B[0], A[0], k), cg = mix(B[1], A[1], k), cb = mix(B[2], A[2], k);
                        const knot = smooth(0.72, 0.90, Noise.fbm2p(u * 4, v * 4, 4, 4, seed + 31, 3)) * 0.8;
                        cr = mix(cr, K[0], knot); cg = mix(cg, K[1], knot); cb = mix(cb, K[2], knot);
                        d[o] = cr * 255; d[o + 1] = cg * 255; d[o + 2] = cb * 255; d[o + 3] = 255;
                        H[i] = 0.55 - k * 0.30 - knot * 0.25;
                    }
                }
            }, scene);
            const nrm = this.normalFromHeight("woodNormal", scene, size, size, H, 0.60);
            for (const t of [tex, nrm]) { t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; }
            return { albedo: tex, normal: nrm };
        },

        // -------------------------------------------------------------
        //  【10】すだち。外皮（油胞の窪み）と切り口（放射状の砂じょう）
        // -------------------------------------------------------------
        sudachi(scene, size, seed) {
            // 【対策】飽和した緑にするとゴム毬になる。実物のすだちは黄味寄りで、
            //         果点のぶん明度のムラが大きい
            const RG = [0.392, 0.520, 0.222], RD = [0.258, 0.372, 0.142];
            const HR = new Float32Array(size * size);
            const rindA = this._tex("sudachiRindA", size, size, (d, N) => {
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const u = x / N, v = y / N, i = y * N + x, o = i * 4;
                    const mo = Noise.fbm2u(u * 9, v * 7, 9, seed + 3, 4);
                    let cr = mix(RD[0], RG[0], mo), cg = mix(RD[1], RG[1], mo), cb = mix(RD[2], RG[2], mo);
                    // 油胞。細かい窪みが一面に並ぶ。これが無いとゴムボールになる
                    const g = Noise.v2u(u * 64, v * 46, 64, seed + 7);
                    const pit = smooth(0.62, 0.96, g);
                    cr = mix(cr, cr * 0.72, pit * 0.7); cg = mix(cg, cg * 0.78, pit * 0.7); cb = mix(cb, cb * 0.70, pit * 0.7);
                    d[o] = cr * 255; d[o + 1] = cg * 255; d[o + 2] = cb * 255; d[o + 3] = 255;
                    HR[i] = 0.55 + (mo - 0.5) * 0.25 - pit * 0.55;
                }
            }, scene);
            const rindN = this.normalFromHeight("sudachiRindN", scene, size, size, HR, 1.10);

            const HF = new Float32Array(size * size);
            const fleshA = this._tex("sudachiFleshA", size, size, (d, N) => {
                const SEG = 9;
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const u = x / N, v = y / N, i = y * N + x, o = i * 4;
                    const dx = u - 0.5, dy = v - 0.5;
                    const rr = Math.hypot(dx, dy) * 2;
                    const ang = Math.atan2(dy, dx);
                    // じょうのう（房）の位置。膜が放射状に走る
                    const sa = ((ang / TAU) * SEG + 100) % 1;
                    const memb = 1 - smooth(0.0, 0.050, Math.min(sa, 1 - sa));
                    // 砂じょう（果汁の粒）。半径方向に細長い
                    const ves = Noise.fbm2(ang * 26, rr * 34, seed + 11, 3);
                    let c0 = [0.878, 0.905, 0.712];                 // 果肉
                    let cr = c0[0] * (0.86 + 0.28 * ves);
                    let cg = c0[1] * (0.88 + 0.24 * ves);
                    let cb = c0[2] * (0.82 + 0.32 * ves);
                    // 膜と中心の芯は白い
                    cr = mix(cr, 0.965, memb * 0.80); cg = mix(cg, 0.968, memb * 0.80); cb = mix(cb, 0.930, memb * 0.80);
                    const core = 1 - smooth(0.05, 0.16, rr);
                    cr = mix(cr, 0.955, core * 0.9); cg = mix(cg, 0.958, core * 0.9); cb = mix(cb, 0.918, core * 0.9);
                    // アルベド（白いワタ）→ 外皮（緑）
                    const alb0 = smooth(0.78, 0.90, rr);
                    cr = mix(cr, 0.930, alb0); cg = mix(cg, 0.932, alb0); cb = mix(cb, 0.888, alb0);
                    const rind = smooth(0.945, 0.995, rr);
                    cr = mix(cr, RG[0], rind); cg = mix(cg, RG[1], rind); cb = mix(cb, RG[2], rind);
                    d[o] = cr * 255; d[o + 1] = cg * 255; d[o + 2] = cb * 255; d[o + 3] = 255;
                    HF[i] = 0.5 + (ves - 0.5) * 0.55 - memb * 0.30 + core * 0.10 + alb0 * 0.18;
                }
            }, scene);
            const fleshN = this.normalFromHeight("sudachiFleshN", scene, size, size, HF, 1.30);
            for (const t of [rindA, rindN, fleshA, fleshN]) { t.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE; }
            return { rindA, rindN, fleshA, fleshN };
        }
    };

    // =================================================================
    // 6. Sanma
    // =================================================================
    const OPAQUE = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
    const ALPHATEST = BABYLON.PBRMaterial.PBRMATERIAL_ALPHATEST;

    class Skin {
        constructor(scene, cfg) {
            this.key = cfg.variety + "|" + cfg.grill + "|" + (cfg.kazariBocho ? "k" : "-");
            this.Snom = makeShape(cfg, cfg.texSeed);
            const T = TextureLab.bakeBody(scene, cfg, this.Snom);
            const F = TextureLab.fin(scene, cfg, cfg.texSeed + 777);
            const E = TextureLab.eye(scene, 256, cfg.texSeed + 911);
            this.tex = {
                albedo: T.albedo, orm: T.orm, cc: T.cc, irid: T.irid, normal: T.normal,
                finA: F.albedo, finN: F.normal, eyeA: E.albedo, eyeN: E.normal
            };

            const m = new BABYLON.PBRMaterial("sanmaMat", scene);
            m.albedoTexture = T.albedo;
            m.metallic = 1.0;                      // 実値は ORM の B
            m.roughness = 1.0;                     // 実値は ORM の G
            m.metallicTexture = T.orm;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.bumpTexture = T.normal;
            m.bumpTexture.level = cfg.bumpLevel;
            m.transparencyMode = OPAQUE;
            // 脂と水分の膜
            m.clearCoat.isEnabled = true;
            m.clearCoat.intensity = 1.0;
            m.clearCoat.roughness = 1.0;
            m.clearCoat.texture = T.cc;
            m.clearCoat.useRoughnessFromMainTexture = true;
            m.clearCoat.indexOfRefraction = 1.40;
            // 【3】グアニン板の構造色。薄膜干渉なので iridescence が本来の道具。
            //      metallic を上げて銀を出そうとすると必ずスプーンになる
            this.hasIrid = !!m.iridescence;
            if (this.hasIrid) {
                m.iridescence.isEnabled = true;
                m.iridescence.intensity = cfg.irid;
                m.iridescence.indexOfRefraction = 1.33;
                m.iridescence.minimumThickness = 180;   // nm
                m.iridescence.maximumThickness = 520;
                m.iridescence.texture = T.irid;         // R = 強さ
                m.iridescence.thicknessTexture = T.irid; // G = 膜厚
            } else {
                console.warn("[Sanma] iridescence 非対応の Babylon です。metallic で代用します");
                m.metallic = 1.0;
            }
            this.mat = m;

            const fm = new BABYLON.PBRMaterial("finMat", scene);
            fm.albedoTexture = F.albedo;
            fm.bumpTexture = F.normal; fm.bumpTexture.level = 0.9;
            fm.metallic = 0.0; fm.roughness = 0.58;
            fm.backFaceCulling = false;
            fm.twoSidedLighting = true;
            // 【6】外縁をアルファテストで抜く。ALPHABLEND ではなく ALPHATEST に
            //      するのは、透過パスへ回すと深度書き込みが切れて、
            //      ヒレどうし・ヒレと体が互いを隠せなくなるため
            fm.transparencyMode = ALPHATEST;
            fm.useAlphaFromAlbedoTexture = true;
            fm.alphaCutOff = 0.45;
            fm.subSurface.isTranslucencyEnabled = true;
            fm.subSurface.tintColor = lin3([0.72, 0.52, 0.28]);
            fm.subSurface.translucencyIntensity = 0.78;
            fm.subSurface.minimumThickness = 0.01;
            fm.subSurface.maximumThickness = 0.06;
            this.finMat = fm;

            // 加熱で白濁した目（強膜と縁の環）
            const em = new BABYLON.PBRMaterial("eyeMat", scene);
            em.albedoTexture = E.albedo;
            em.bumpTexture = E.normal; em.bumpTexture.level = 0.85;
            em.metallic = 0.0; em.roughness = 0.34;
            em.transparencyMode = OPAQUE;
            // 焼けた目は乾いて艶が引く。生の魚のような鏡面にしない
            em.clearCoat.isEnabled = true;
            em.clearCoat.intensity = 0.42;
            em.clearCoat.roughness = 0.20;
            em.subSurface.isTranslucencyEnabled = true;
            em.subSurface.tintColor = new BABYLON.Color3(0.85, 0.82, 0.74);
            em.subSurface.translucencyIntensity = 0.45;
            em.subSurface.minimumThickness = 0.05;
            em.subSurface.maximumThickness = 0.5;
            this.eyeMat = em;

            // 【対策】水晶体。黒目ではない。60℃ 前後でタンパク質が凝固して
            //         不透明な乳白色の玉になり、わずかに盛り上がる。
            //         強い透過を残すとゆで卵の白身になるので、透けは弱く、
            //         代わりに内部散乱の色を温かく振る
            const pm = new BABYLON.PBRMaterial("lensMat", scene);
            pm.albedoColor = lin3([0.878, 0.845, 0.742]);
            pm.metallic = 0.0; pm.roughness = 0.38;
            pm.transparencyMode = OPAQUE;
            pm.clearCoat.isEnabled = true;
            pm.clearCoat.intensity = 0.55;
            pm.clearCoat.roughness = 0.16;
            pm.subSurface.isTranslucencyEnabled = true;
            pm.subSurface.tintColor = new BABYLON.Color3(0.88, 0.82, 0.66);
            pm.subSurface.translucencyIntensity = 0.38;
            pm.subSurface.minimumThickness = 0.05;
            pm.subSurface.maximumThickness = 0.30;
            this.pupilMat = pm;
        }
        setDebug(mode) {
            const m = this.mat, C3 = BABYLON.Color3;
            if (mode === 2) {
                m.unlit = true; m.albedoTexture = null; m.albedoColor = new C3(0, 0, 0);
                m.emissiveTexture = this.tex.normal; m.emissiveColor = new C3(1, 1, 1);
                m.metallicTexture = null; m.bumpTexture = null;
                m.clearCoat.isEnabled = false;
                if (this.hasIrid) m.iridescence.isEnabled = false;
                return;
            }
            m.unlit = false;
            m.emissiveTexture = null; m.emissiveColor = new C3(0, 0, 0);
            m.bumpTexture = this.tex.normal; m.bumpTexture.level = 1.1;
            if (mode === 1) {
                m.albedoTexture = null; m.albedoColor = new C3(0.82, 0.82, 0.82);
                m.metallicTexture = null; m.metallic = 0; m.roughness = 0.72;
                m.clearCoat.isEnabled = false;
                if (this.hasIrid) m.iridescence.isEnabled = false;
            } else {
                m.albedoTexture = this.tex.albedo; m.albedoColor = new C3(1, 1, 1);
                m.metallicTexture = this.tex.orm; m.roughness = 1.0; m.metallic = 1.0;
                m.clearCoat.isEnabled = true;
                if (this.hasIrid) m.iridescence.isEnabled = true;
            }
        }
        dispose() {
            // 【対策】DynamicTexture は材質を捨てても道連れにならない。
            //         プリセットを切り替えるたびに積み上がるので明示的に捨てる
            for (const k in this.tex) if (this.tex[k]) this.tex[k].dispose();
            this.mat.dispose(); this.finMat.dispose();
            this.eyeMat.dispose(); this.pupilMat.dispose();
        }
    }

    // ヒレ。基部の線に沿って外へ張り出す薄い面
    // 【対策】三角形の板にテクスチャで条（すじ）を描いても、厚紙を切って
    //         挿したようにしか見えない。実物のヒレは硬い鰭条のあいだに膜が
    //         張った構造なので、外縁の波形と条の畝はジオメトリで持たせる
    function buildFin(name, scene, opt) {
        const rays = opt.rays || 10;
        const NS = opt.ns || (rays * 4), NT = opt.nt || 10;
        const notch = opt.notch !== undefined ? opt.notch : 0.16;   // 外縁の切れ込み
        const ridge = opt.ridge !== undefined ? opt.ridge : 0.035;  // 鰭条の畝(cm)
        const rake = opt.rake || 0;                                 // 後ろへの寝かせ
        const positions = new Float32Array((NS + 1) * (NT + 1) * 3);
        const uvs = new Float32Array((NS + 1) * (NT + 1) * 2);
        const indices = [];
        for (let i = 0; i <= NS; i++) {
            const s = i / NS;
            const b = opt.base(s);
            // 鰭条の位置（中心で 1、膜の中央で 0）
            const rp = s * rays;
            const tri = 1 - Math.abs((rp - Math.floor(rp)) * 2 - 1);
            const sp = opt.span(s) * (1 - notch * (1 - tri));
            const spread = opt.spread ? opt.spread(s) : 0;
            for (let j2 = 0; j2 <= NT; j2++) {
                const t = j2 / NT, k = i * (NT + 1) + j2;
                const rip = (Noise.fbm2(s * 9 + opt.seed * 0.31, t * 4, opt.seed, 3) - 0.5) * 0.09 * t;
                // 先へ行くほど畝が立ち、膜は垂れる
                const corr = (tri - 0.40) * ridge * Math.pow(t, 0.7);
                positions[k * 3] = b.x + opt.out[0] * sp * t + rake * sp * t;
                positions[k * 3 + 1] = opt.y(s, t) + rip + corr;
                positions[k * 3 + 2] = b.z + opt.out[1] * sp * t + spread * t;
                uvs[k * 2] = s; uvs[k * 2 + 1] = t;
            }
        }
        for (let i = 0; i < NS; i++) for (let j2 = 0; j2 < NT; j2++) {
            const A = i * (NT + 1) + j2, B = A + 1, C = A + NT + 1, D = C + 1;
            indices.push(A, C, B, B, C, D);
        }
        const idx = new Uint32Array(indices);
        const normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, idx, normals);
        return makeMesh(name, positions, idx, normals, uvs, null, scene);
    }

    // 目に使う球。掃引と同じ経路で作るので巻き順の心配がない
    function buildSphere(name, scene, rx, ry, segU, segV) {
        const rings = [], centers = [];
        for (let i = 0; i <= segV; i++) {
            const th = (i / segV) * Math.PI;
            const y = Math.cos(th) * ry, r = Math.sin(th) * rx;
            const ring = new Array(segU + 1);
            for (let j = 0; j <= segU; j++) {
                const ph = (j / segU) * TAU;
                ring[j] = new V3(Math.cos(ph) * r, y, Math.sin(ph) * r);
            }
            rings.push(ring);
            centers.push(new V3(0, y, 0));
        }
        return sweep(name, rings, centers, scene);
    }

    class Sanma {
        constructor(scene, cfg, seed, skin) {
            const S = makeShape(cfg, seed);
            this.S = S;
            const NL = cfg.segmentsLength, NR = cfg.segmentsRound;
            const root = new BABYLON.TransformNode("sanmaRoot", scene);
            this.root = root;
            this.parts = [];

            // 断面のプリ計算
            const rz = new Float64Array(NR), ryv = new Float64Array(NR);
            for (let j = 0; j < NR; j++) { const r = ringZY(j / (NR - 1)); rz[j] = r[0]; ryv[j] = r[1]; }

            const rings = [], centers = [];
            for (let i = 0; i < NL; i++) {
                const u = i / (NL - 1);
                const x = u * S.L;
                const hd = halfDepthAt(u, S), hw = halfWidthAt(u, S);
                const cz = centerZAt(u, S);
                const cy = hw + liftAt(u, S);
                const zs = new Float64Array(NR), ys = new Float64Array(NR);
                for (let j = 0; j < NR; j++) { zs[j] = rz[j] * hd; ys[j] = ryv[j] * hw; }
                const ring = new Array(NR);
                for (let j = 0; j < NR; j++) {
                    const jm = (j - 1 + (NR - 1)) % (NR - 1), jp = (j + 1) % (NR - 1);
                    let tz = zs[jp] - zs[jm], ty = ys[jp] - ys[jm];
                    const l = Math.hypot(tz, ty) || 1; tz /= l; ty /= l;
                    let nz = ty, ny = -tz;
                    if (nz * zs[j] + ny * ys[j] < 0) { nz = -nz; ny = -ny; }
                    const d = reliefAt(u, j / (NR - 1), S);
                    ring[j] = new V3(x, cy + ys[j] + ny * d, cz + zs[j] + nz * d);
                }
                rings.push(ring);
                centers.push(new V3(x, cy, cz));
            }
            const body = sweep("sanmaBody", rings, centers, scene);
            body.material = skin.mat;
            body.receiveShadows = true;
            body.parent = root;
            this.body = body;
            this.parts.push(body);

            // ---- 各部の位置を引く関数 ---------------------------------
            const midY = (u) => halfWidthAt(u, S) + liftAt(u, S);

            const addFin = (name, u0, u1, sgn, spanFn, o) => {
                o = o || {};
                const f = buildFin(name, scene, {
                    rays: o.rays || 10, nt: o.nt || 9, notch: o.notch, ridge: o.ridge,
                    rake: o.rake || 0, seed: (seed % 900) + name.length * 7,
                    // 【対策】基部を体表ちょうどに置くと、隆起の分だけ隙間が開いて
                    //         ヒレが浮いて見える。少し内側へ埋める
                    base: (s2) => { const u = mix(u0, u1, s2); return { x: u * S.L, z: centerZAt(u, S) + sgn * halfDepthAt(u, S) * 0.90 }; },
                    out: [0, sgn],
                    span: spanFn,
                    // 【対策】先端の高さを絶対値（皿の面）で指定すると、
                    //         全長 0.5cm の小離鰭が 0.7cm も下がって、体から
                    //         ぶら下がった旗になる。体の高さに対する比で下ろす
                    y: (s2, t) => {
                        const u = mix(u0, u1, s2);
                        const my = midY(u);
                        return mix(my, Math.max(0.12, my * (o.droop !== undefined ? o.droop : 0.45)),
                            Math.pow(t, 1.35));
                    }
                });
                f.material = skin.finMat; f.parent = root; f.receiveShadows = true;
                this.parts.push(f);
            };

            // 背びれ / しりびれ。
            // 【対策】位置を線画から実測して置き直した。B 初版は背びれが
            //         u=0.655 と体の真ん中寄りにあり、小離鰭が 0.784 から
            //         始まって背中の後ろ半分が鋸の刃になっていた。
            //         実測は 背びれ 0.779〜0.853 / しりびれ 0.743〜0.838 で、
            //         小離鰭はそのさらに後ろ
            // 【対策】塩焼きのひれは開かない。焼くと膜のコラーゲンが縮んで
            //         鰭条どうしが寄り、体に貼り付いて畳まれる。実写でも
            //         背びれ・しりびれは輪郭にわずかな出っ張りとしてしか
            //         見えない。張り出しを 1.42 → 0.68 に落とし、
            //         後ろへ強く寝かせる（rake 0.55 → 1.05）
            addFin("finDorsal", 0.779, 0.853, 1,
                (s2) => 0.14 + 0.68 * Math.pow(1 - s2, 1.75), { rays: 11, rake: 1.05, notch: 0.045, droop: 0.66 });
            addFin("finAnal", 0.743, 0.838, -1,
                (s2) => 0.12 + 0.58 * Math.pow(1 - s2, 1.75), { rays: 10, rake: 1.05, notch: 0.045, droop: 0.66 });

            // 胸びれ。
            // 【対策】腹の縁ではなく体側の中ほど（側線のやや下）に付く。
            //         腹の縁から真下へ生やすと、翼を広げた魚になる。
            // 【対策】さらに、先端の高さを「基部の高さ × 0.74」で決めていたため、
            //         先端が体表より 0.37cm 内側に潜り、画面に一度も出ていなかった。
            //         ひれは体表をなぞる面なので、
            //           ・断面パラメータ a を t とともに進めて腹側へ回り込ませ
            //           ・高さは「その位置の体表 + わずかな浮き」で決め
            //           ・後方へ伸びるぶん体が太くなるので、u も進めて評価する
            //         の3点を守らないと必ず埋まるか浮きすぎる
            const uP0 = 0.212, uP1 = 0.248;
            const aP0 = 0.588, aP1 = 0.700;                 // 基部 → 先端（腹側へ）
            const pU = (s2) => mix(uP0, uP1, s2);
            const pSpan = (s2) => 0.34 + 0.98 * Math.pow(1 - s2, 1.20);
            const rP0 = ringZY(aP0), rP1 = ringZY(aP1);
            const pect = buildFin("finPect", scene, {
                rays: 9, nt: 8, notch: 0.040, ridge: 0.016, rake: 1.0,
                seed: (seed % 500) + 61,
                base: (s2) => {
                    const u = pU(s2);
                    return { x: u * S.L, z: centerZAt(u, S) + rP0[0] * halfDepthAt(u, S) };
                },
                out: [0, 0],                                 // 後方への伸びは rake が担う
                span: pSpan,
                spread: (s2) => (rP1[0] - rP0[0]) * halfDepthAt(pU(s2), S),
                y: (s2, t) => {
                    // ひれの先が乗っている体の位置（後方へ進んだぶん太い）
                    const uE = clamp(pU(s2) + pSpan(s2) * t / S.L, 0, 1);
                    const hw = halfWidthAt(uE, S);
                    const r = ringZY(mix(aP0, aP1, t));
                    return hw + liftAt(uE, S) + r[1] * hw + 0.060 + 0.090 * t;
                }
            });
            pect.material = skin.finMat; pect.parent = root; pect.receiveShadows = true;
            this.parts.push(pect);

            // 小離鰭。サンマの識別点（背に5〜6個、腹に6〜7個）
            for (let k = 0; k < 5; k++) {
                const u0 = 0.878 + k * 0.0216;
                addFin("finletD" + k, u0, u0 + 0.019, 1,
                    (s2) => 0.06 + (0.30 - k * 0.030) * Math.pow(1 - s2, 0.80),
                    { rays: 3, nt: 5, rake: 0.95, notch: 0.018, ridge: 0.009, droop: 0.88 });
            }
            for (let k = 0; k < 6; k++) {
                const u0 = 0.855 + k * 0.0220;
                addFin("finletV" + k, u0, u0 + 0.018, -1,
                    (s2) => 0.05 + (0.26 - k * 0.026) * Math.pow(1 - s2, 0.80),
                    { rays: 3, nt: 5, rake: 0.95, notch: 0.018, ridge: 0.009, droop: 0.88 });
            }

            // 尾びれ。
            // 【対策】実測すると 尾長 2.6cm・開き（上葉端〜下葉端）3.4cm・
            //         叉の深さは尾長の 50%。B 初版は 尾長 3.4cm・開き 2.2cm・
            //         叉 70% で、細い二又のフォークになっていた。
            //         短く・広く開き・叉を浅くすると、実物の三角の二葉になる
            const hdT = halfDepthAt(1, S), czT = centerZAt(1, S), cyT = midY(1);
            const tailFin = buildFin("finTail", scene, {
                rays: 15, nt: 12, notch: 0.040, ridge: 0.044, seed: (seed % 700) + 5,
                base: (s) => ({ x: S.L - 0.05, z: czT + (s * 2 - 1) * hdT * 0.88 }),
                out: [1, 0],
                span: (s) => S.tail * (0.50 + 0.50 * Math.pow(Math.abs(s * 2 - 1), 1.35)),
                spread: (s) => (s * 2 - 1) * 1.75,
                y: (s, t) => mix(cyT, Math.max(0.12, cyT * 0.62), Math.pow(t, 1.2))
            });
            tailFin.material = skin.finMat; tailFin.parent = root; tailFin.receiveShadows = true;
            this.parts.push(tailFin);

            // ---- 目 ---------------------------------------------------
            const uE = EYE_U, aE = EYE_A;
            const rE = ringZY(aE);
            const hdE = halfDepthAt(uE, S), hwE = halfWidthAt(uE, S);
            const ex = uE * S.L;
            const ez = centerZAt(uE, S) + rE[0] * hdE;
            const ey = hwE + liftAt(uE, S) + rE[1] * hwE;
            // 頭が太くなったぶん目も大きくなる。実物のサンマは
            // 目の直径が、目の位置の体高の 4 割強を占める
            const rad = Math.min(0.56, Math.max(0.34, hdE * 0.42));
            const eye = buildSphere("eye", scene, rad, rad * 0.58, 32, 20);
            eye.position.set(ex, ey - rad * 0.24, ez);
            eye.material = skin.eyeMat; eye.parent = root;
            this.parts.push(eye);
            // 【4】水晶体。眼球の外接半径が 0.52rad になるのは v≒0.17 なので、
            //      テクスチャの環（v 0.17〜0.27）がちょうど水晶体の外側に来る。
            //      赤道は眼球の内側に収まり、頭だけが 0.04rad 突き出る
            const lens = buildSphere("lens", scene, rad * 0.52, rad * 0.32, 24, 14);
            lens.position.set(ex, ey + rad * 0.06, ez);
            lens.material = skin.pupilMat; lens.parent = root;
            this.parts.push(lens);

            // 皿に置いたときに浮かない／めり込まないよう、最下点を 0 に合わせる
            let minY = 1e9, minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
            for (const p of this.parts) {
                const bb = p.getBoundingInfo().boundingBox;
                minY = Math.min(minY, bb.minimum.y + p.position.y);
                minX = Math.min(minX, bb.minimum.x + p.position.x);
                maxX = Math.max(maxX, bb.maximum.x + p.position.x);
                minZ = Math.min(minZ, bb.minimum.z + p.position.z);
                maxZ = Math.max(maxZ, bb.maximum.z + p.position.z);
            }
            for (const p of this.parts) p.position.y -= minY;
            root.position.x = -(minX + maxX) * 0.5;
            this.size = { len: maxX - minX, wid: maxZ - minZ };
        }
        dispose() {
            for (const p of this.parts) p.dispose();
            this.root.dispose();
        }
    }

    // =================================================================
    // 7. Garnish （大根おろし / すだち）
    // =================================================================
    // 【10】実写の秋刀魚の塩焼きは、必ず大根おろしとすだちが添えられている。
    //       この2つが「魚のCG」を「料理の写真」に変える。ドームひとつで
    //       済ませると寒天の塊になるので、千切りを1本ずつ立体で置く
    function buildOroshi(scene, opt) {
        const rng = new Rng(opt.seed);
        const R = opt.r, H = opt.h, N = opt.count || 260;
        const pos = [], idx = [];
        let base = 0;
        // 立方体の 12 三角形（頂点番号 = x + 2y + 4z の符号ビット）
        // Babylon の左手系規約に合わせて巻く（上記 buildDisc のコメント参照）
        const FACES = [
            [3, 2, 0], [1, 3, 0], [7, 5, 4], [6, 7, 4],
            [5, 1, 0], [4, 5, 0], [7, 6, 2], [3, 7, 2],
            [6, 4, 0], [2, 6, 0], [7, 3, 1], [5, 7, 1]
        ];
        for (let s = 0; s < N; s++) {
            // 【対策】ドームの内側いっぱいに、長い千切りを全方向へ向けて
            //         撒くと、放射状に棘の突き出たポップコーンの塊になる。
            //         実物の大根おろしは水を含んで低く広がり、繊維は
            //         ほぼ水平に寝て互いに重なる。表層だけに、短く、
            //         寝かせて置く
            const a = rng.next() * TAU;
            const rr = R * Math.sqrt(rng.next());
            const domeH = H * Math.sqrt(Math.max(0, 1 - (rr / R) * (rr / R)));
            const py = domeH * (0.58 + 0.42 * rng.next());
            const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
            const th = rng.next() * TAU, ph = rng.range(-0.26, 0.26);
            const L = rng.range(0.20, 0.42), Wd = rng.range(0.038, 0.072), Th = rng.range(0.026, 0.052);
            const ax = new V3(Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph));
            const up = Math.abs(ax.y) > 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0);
            const bx = V3.Cross(up, ax).normalize();
            const by = V3.Cross(ax, bx).normalize();
            for (let c = 0; c < 8; c++) {
                const sx = (c & 1) ? 1 : -1, sy = (c & 2) ? 1 : -1, sz = (c & 4) ? 1 : -1;
                pos.push(
                    px + ax.x * L * 0.5 * sx + bx.x * Wd * sy + by.x * Th * sz,
                    py + ax.y * L * 0.5 * sx + bx.y * Wd * sy + by.y * Th * sz,
                    pz + ax.z * L * 0.5 * sx + bx.z * Wd * sy + by.z * Th * sz);
            }
            for (const f of FACES) idx.push(base + f[0], base + f[1], base + f[2]);
            base += 8;
        }
        const positions = new Float32Array(pos);
        const indices = new Uint32Array(idx);
        const normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        return makeMesh(opt.name, positions, indices, normals, null, null, scene);
    }

    function buildGarnish(scene, G, seed) {
        const root = new BABYLON.TransformNode("garnish", scene);
        const meshes = [];
        const mats = [];
        const texs = [];

        // ---- 大根おろし ------------------------------------------------
        // 千切りだけだと下が透けて空洞に見えるので、低いドームを内側に敷く
        const mound = buildDome("oroshiMound", scene, 2.05, 0.74, seed + 3, 44, 16, 0.30);
        const shreds = buildOroshi(scene, { name: "oroshiShred", r: 2.20, h: 0.86, seed: seed + 11, count: 520 });
        const om = new BABYLON.PBRMaterial("oroshiMat", scene);
        om.albedoColor = lin3([0.918, 0.926, 0.902]);
        om.metallic = 0.0; om.roughness = 0.52;
        om.backFaceCulling = false;
        om.twoSidedLighting = true;
        om.transparencyMode = OPAQUE;
        // 大根おろしは水を含んでいる。透けと弱い艶が無いと発泡スチロールになる
        om.subSurface.isTranslucencyEnabled = true;
        om.subSurface.tintColor = new BABYLON.Color3(0.92, 0.94, 0.90);
        om.subSurface.translucencyIntensity = 0.65;
        om.subSurface.minimumThickness = 0.02;
        om.subSurface.maximumThickness = 0.35;
        om.clearCoat.isEnabled = true;
        om.clearCoat.intensity = 0.30;
        om.clearCoat.roughness = 0.20;
        mound.material = om; shreds.material = om;
        mats.push(om);
        for (const m of [mound, shreds]) { m.parent = root; m.receiveShadows = true; meshes.push(m); }
        mound.position.set(G.oroshiX, 0, G.oroshiZ);
        shreds.position.set(G.oroshiX, 0, G.oroshiZ);

        // ---- すだち（半割り）------------------------------------------
        const ST = TextureLab.sudachi(scene, 512, seed + 29);
        texs.push(ST.rindA, ST.rindN, ST.fleshA, ST.fleshN);
        // 半割りのすだちは真球ではない。切り口側がわずかに平たい
        const R = 1.48, yc = R * 0.78;
        // 【対策】切り口を上に向けたいので、ドームを x 軸まわりに180°回す。
        //         scaling.y = -1 で反転すると巻き順まで裏返って面が消える
        const rind = buildDome("sudachiRind", scene, R, yc, seed + 31, 52, 20, 0.042);
        rind.rotation.x = Math.PI;
        rind.position.set(G.sudachiX, yc, G.sudachiZ);
        const rm = new BABYLON.PBRMaterial("sudachiRindMat", scene);
        rm.albedoTexture = ST.rindA;
        rm.bumpTexture = ST.rindN; rm.bumpTexture.level = 1.25;
        rm.metallic = 0.0; rm.roughness = 0.44;
        rm.transparencyMode = OPAQUE;
        rm.clearCoat.isEnabled = true;
        rm.clearCoat.intensity = 0.55;
        rm.clearCoat.roughness = 0.20;
        rind.material = rm; rind.parent = root; rind.receiveShadows = true;
        meshes.push(rind); mats.push(rm);

        const flesh = buildDisc("sudachiFlesh", scene, R * 1.01, 64, 0, seed + 37);
        flesh.position.set(G.sudachiX, yc + 0.05, G.sudachiZ);
        const fm2 = new BABYLON.PBRMaterial("sudachiFleshMat", scene);
        fm2.albedoTexture = ST.fleshA;
        fm2.bumpTexture = ST.fleshN; fm2.bumpTexture.level = 1.05;
        fm2.metallic = 0.0; fm2.roughness = 0.22;
        fm2.transparencyMode = OPAQUE;
        // 果汁の粒。濡れた艶と透けが無いと、緑の縁取りをした白い円板になる
        fm2.clearCoat.isEnabled = true;
        fm2.clearCoat.intensity = 0.85;
        fm2.clearCoat.roughness = 0.08;
        fm2.subSurface.isTranslucencyEnabled = true;
        fm2.subSurface.tintColor = new BABYLON.Color3(0.86, 0.92, 0.62);
        fm2.subSurface.translucencyIntensity = 0.60;
        fm2.subSurface.minimumThickness = 0.05;
        fm2.subSurface.maximumThickness = 0.6;
        flesh.material = fm2; flesh.parent = root; flesh.receiveShadows = true;
        meshes.push(flesh); mats.push(fm2);

        return {
            root, meshes,
            setEnabled(v) { for (const m of meshes) m.setEnabled(v); },
            dispose() {
                for (const m of meshes) m.dispose();
                for (const m of mats) m.dispose();
                for (const t of texs) t.dispose();
                root.dispose();
            }
        };
    }

    // =================================================================
    // 8. Table （皿・テーブル）
    // =================================================================
    // 焼き魚用の長角皿。輪郭は超楕円（角の丸い長方形）
    //  ρ の並び: 見込みの中央 → 見込み → 縁 → 外周 → 縁の裏 → 高台 → 裏の中央
    const PLR = [0.000, 0.120, 0.240, 0.320, 0.385, 0.440, 0.475, 0.500, 0.525, 0.560, 0.625, 0.700, 0.780, 0.845, 0.910, 0.960, 1.000];
    const PLD = [1.000, 1.000, 1.000, 1.000, 0.640, 0.290, 0.090, 0.000, 0.020, 0.115, 0.330, 0.640, 1.000, 1.300, 1.480, 1.500, 1.500];
    const PLK = [0.020, 0.520, 0.880, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 0.985, 0.880, 0.480, 0.020];
    const PLY = [0.596, 0.598, 0.607, 0.621, 0.750, 0.908, 0.979, 1.000, 0.967, 0.896, 0.738, 0.583, 0.358, 0.017, 0.117, 0.233, 0.250];
    const PLC = [0.000, 0.020, 0.120, 0.260, 0.560, 0.850, 0.970, 1.000, 1.000, 0.960, 0.840, 0.640, 0.360, 0.150, 0.060, 0.010, 0.000];

    function buildPlate(scene, G, skinTex) {
        const NR = 288, NL = 128;
        const e = 2 / G.plateSharp;
        const A0 = G.plateW * 0.5, B0 = G.plateD * 0.5;
        const rings = [], centers = [];
        for (let i = 0; i < NL; i++) {
            const rho = i / (NL - 1);
            const d = tableAt(PLR, PLD, rho) * G.plateRim;
            const k = tableAt(PLR, PLK, rho);
            const y = tableAt(PLR, PLY, rho) * G.plateH;
            const cAmt = tableAt(PLR, PLC, rho) * G.plateCorner;
            const A = Math.max(0.06, A0 - d) * k;
            const B = Math.max(0.06, B0 - d) * k;
            const ring = new Array(NR);
            for (let j = 0; j < NR; j++) {
                const phi = (j / (NR - 1)) * TAU;
                const c = Math.cos(phi), sn = Math.sin(phi);
                // 長角皿は四隅が持ち上がる。指数が小さいと長辺の中ほどまで
                // 持ち上がって、皿が波打ったポテトチップスに見える
                const corner = Math.pow(Math.abs(Math.sin(2 * phi)), 7.0);
                ring[j] = new V3(
                    (c >= 0 ? 1 : -1) * Math.pow(Math.abs(c), e) * A,
                    y + cAmt * corner,
                    (sn >= 0 ? 1 : -1) * Math.pow(Math.abs(sn), e) * B);
            }
            rings.push(ring);
            centers.push(new V3(0, y, 0));
        }
        const mesh = sweep("plate", rings, centers, scene);
        const m = new BABYLON.PBRMaterial("plateMat", scene);
        m.albedoTexture = skinTex.albedo;
        m.metallicTexture = skinTex.orm;
        m.useAmbientOcclusionFromMetallicTextureRed = true;
        m.useRoughnessFromMetallicTextureGreen = true;
        m.useMetallnessFromMetallicTextureBlue = true;
        m.bumpTexture = skinTex.normal;
        m.bumpTexture.level = 0.45;
        m.metallic = 0.0; m.roughness = 1.0;
        m.transparencyMode = OPAQUE;
        // 釉の膜。陶器は「素地の上に薄いガラスが載っている」
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.85;
        m.clearCoat.roughness = 0.10;
        m.clearCoat.indexOfRefraction = 1.50;
        for (const t of [skinTex.albedo, skinTex.orm, skinTex.normal]) { t.uScale = 11; t.vScale = 3; }
        mesh.material = m;
        mesh.receiveShadows = true;
        return mesh;
    }

    // =================================================================
    // 9. Scene
    // =================================================================
    function buildConfig(varietyKey, grillKey, seed) {
        const cfg = Object.assign({}, GLOBAL, PRESETS[varietyKey]);
        cfg.variety = varietyKey;
        cfg.grill = grillKey;
        cfg.charAmount = GRILLS[grillKey].char;
        cfg.seed = seed >>> 0;
        // テクスチャは「品種 × 焼き加減 × 飾り包丁」でキャッシュするので、
        // その種は個体乱数から切り離して名前から決める
        let h = 2166136261;
        const key = varietyKey + "|" + grillKey + "|" + (GLOBAL.kazariBocho ? "k" : "-");
        for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
        cfg.texSeed = (h >>> 0) % 100000;
        cfg.kazariBocho = GLOBAL.kazariBocho;
        const vw = (typeof window !== "undefined" && window.innerWidth) || 1024;
        if (vw < GLOBAL.compactWidth) {
            cfg.texW = 384; cfg.texH = 1280;
            cfg.segmentsLength = 220; cfg.segmentsRound = 80;
        }
        return cfg;
    }

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.885, 0.870, 0.845, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.55;
    scene.environmentIntensity = 0.72;

    // 【9】A の fov 0.52 / radius 44 はパースが強く、手前の頭が肥大していた。
    //      料理写真は 85〜100mm 相当の望遠寄り。距離を取って画角を狭める
    const compactStart = ((typeof window !== "undefined" && window.innerWidth) || 1024) < GLOBAL.compactWidth;
    const camera = new BABYLON.ArcRotateCamera("cam", -1.72, 0.86,
        compactStart ? 84 : 68, new V3(0, 1.9, 0), scene);
    camera.attachControl(true);
    camera.fov = 0.36;
    camera.wheelPrecision = 8;
    // 【対策】ポストプロセスを有効にするとシーンは 16bit 深度の RT へ描かれる。
    //         minZ を 0.1 のままにすると分解能が mm 台になり、
    //         皿と身のように接している面が互いに勝ったり負けたりする
    camera.minZ = 6;
    camera.maxZ = 400;
    camera.lowerRadiusLimit = 26;
    camera.upperRadiusLimit = 200;
    camera.lowerBetaLimit = 0.05;
    camera.upperBetaLimit = 1.50;
    camera.panningSensibility = 200;
    scene.cameraToUseForPointers = camera;

    // 朝の窓明かりを想定。斜め後ろ上からの強い主光 + 反対側からの弱い返し
    const key = new BABYLON.DirectionalLight("key", new V3(-0.42, -0.86, -0.30).normalize(), scene);
    key.position = new V3(26, 46, 20);
    key.intensity = 2.30;
    key.diffuse = new BABYLON.Color3(1.0, 0.975, 0.935);
    key.specular = new BABYLON.Color3(0.62, 0.60, 0.56);
    key.autoCalcShadowZBounds = true;

    const fill = new BABYLON.DirectionalLight("fill", new V3(0.85, -0.42, 0.42).normalize(), scene);
    fill.intensity = 0.85;
    fill.diffuse = new BABYLON.Color3(0.96, 0.965, 1.0);
    fill.specular = new BABYLON.Color3(0.16, 0.16, 0.17);

    // 【対策】白い皿からの照り返しが無いと、魚の手前側の側面が真っ黒に
    //         落ちて、身が皿から生えているように見える
    const bounce = new BABYLON.DirectionalLight("bounce", new V3(0.05, 1.0, 0.15).normalize(), scene);
    bounce.intensity = 0.34;
    bounce.diffuse = new BABYLON.Color3(0.99, 0.975, 0.945);
    bounce.specular = new BABYLON.Color3(0, 0, 0);

    const amb = new BABYLON.HemisphericLight("amb", new V3(0, 1, 0), scene);
    amb.intensity = 0.34;
    amb.diffuse = new BABYLON.Color3(1, 1, 1);
    amb.groundColor = new BABYLON.Color3(0.78, 0.74, 0.68);
    amb.specular = new BABYLON.Color3(0, 0, 0);

    // 【対策】useBlurExponentialShadowMap は深度を指数関数で近似するため、
    //         ぼかすと影がキャスター自身の明るい面へにじみ出す
    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.forceBackFacesOnly = true;
    sg.bias = 0.00035;
    sg.normalBias = 0.012;
    // 【9】A の 0.40 では接地の影が薄く、魚が皿から浮いて見えていた
    sg.darkness = 0.25;
    sg.transparencyShadow = true;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.02;
    ip.contrast = 1.18;
    ip.vignetteEnabled = false;

    // ---- テーブル ----------------------------------------------------
    let table = null;
    if (GLOBAL.showTable) {
        const wt = TextureLab.wood(scene, 1024, 4242);
        table = BABYLON.MeshBuilder.CreateBox("table", { width: 200, height: 3, depth: 200 }, scene);
        const tm = new BABYLON.PBRMaterial("tableMat", scene);
        tm.albedoTexture = wt.albedo;
        tm.bumpTexture = wt.normal; tm.bumpTexture.level = 0.60;
        tm.metallic = 0.0; tm.roughness = 0.46;
        tm.transparencyMode = OPAQUE;
        tm.clearCoat.isEnabled = true;
        tm.clearCoat.intensity = 0.35;
        tm.clearCoat.roughness = 0.22;
        for (const t of [wt.albedo, wt.normal]) { t.uScale = 2.4; t.vScale = 2.4; }
        table.material = tm;
        table.receiveShadows = true;
        table.position.y = -1.5;
    }

    // ---- 皿と献立 ----------------------------------------------------
    const plateTex = GLOBAL.showPlate ? TextureLab.plate(scene, 512, 9091) : null;
    const plate = GLOBAL.showPlate ? buildPlate(scene, GLOBAL, plateTex) : null;
    if (plate) sg.addShadowCaster(plate, true);

    const WELL_Y = 0.605 * GLOBAL.plateH;      // 見込みの高さ（魚を置く面）

    // ---- 付け合わせ --------------------------------------------------
    // 尾のうしろに大根おろし、頭のうしろにすだち。実写の定型
    // 見込みの半奥行きは 12.2/2 - 1.40 = 4.70cm。はみ出すと縁に乗り上げる
    GLOBAL.oroshiX = 11.9; GLOBAL.oroshiZ = 2.35;
    GLOBAL.sudachiX = -12.0; GLOBAL.sudachiZ = 2.60;
    const garnish = buildGarnish(scene, GLOBAL, 20260808);
    garnish.root.position.y = WELL_Y;
    for (const m of garnish.meshes) sg.addShadowCaster(m, true);
    garnish.setEnabled(GLOBAL.showGarnish);

    // ---- 秋刀魚 ------------------------------------------------------
    let skin = null, fillet = null, curCfg = null;
    let curVariety = START_VARIETY, curGrill = START_GRILL, curSeed = START_SEED;
    let debugMode = 0, onRebuilt = null;

    function ensureSkin(cfg) {
        const k = cfg.variety + "|" + cfg.grill + "|" + (cfg.kazariBocho ? "k" : "-");
        if (skin && skin.key === k) return skin;
        // 【対策】古い Skin を捨てずに差し替えると、テクスチャが5枚ずつ
        //         GPU に残り続ける。切り替えを繰り返すと落ちる
        if (skin) skin.dispose();
        skin = new Skin(scene, cfg);
        return skin;
    }

    function build(varietyKey, grillKey, seed) {
        const cfg = buildConfig(varietyKey, grillKey, seed);
        curCfg = cfg;
        if (fillet) { fillet.dispose(); fillet = null; }
        const sk = ensureSkin(cfg);
        sk.setDebug(debugMode);

        fillet = new Sanma(scene, cfg, seed, sk);
        // 皿のやや手前に、長辺とほぼ平行に置く
        fillet.root.position.y = WELL_Y;
        fillet.root.position.z = -1.35;
        fillet.root.rotation.y = -0.020;

        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        for (const p of fillet.parts) sg.addShadowCaster(p, true);
        if (plate) sg.addShadowCaster(plate, true);
        if (GLOBAL.showGarnish) for (const m of garnish.meshes) sg.addShadowCaster(m, true);

        console.log("[Sanma]", BUILD, "/", cfg.label, "/", GRILLS[grillKey].label,
            "/ seed =", cfg.seed, "/", fillet.size.len.toFixed(1) + "cm");
        if (onRebuilt) onRebuilt();
    }

    build(START_VARIETY, START_GRILL, START_SEED);

    if (GLOBAL.useSSAO) {
        // 【9】radius 0.55 は 30cm スケールの被写体に対して小さすぎ、
        //      接地の陰りがほとんど出ていなかった
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.85, blurRatio: 1.0 }, [camera]);
        ssao.radius = 1.20;
        ssao.totalStrength = 1.25;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 200;
        ssao.minZAspect = 0.22;
    }

    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    // 白い皿では bloom のしきい値を下げると全体がにじむ。脂の照りだけ拾う
    dp.bloomThreshold = 0.96;
    dp.bloomWeight = 0.10;
    dp.bloomKernel = 34;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.24;
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
    // 10. GUI
    // =================================================================
    // 【対策】フルスクリーンGUIは既定でシーンと同じカメラで合成されるため、
    //         Bloom / 被写界深度 / シャープンがUIにも乗ってボケる。
    //         GUI専用カメラを layerMask で分離する
    const GUI_MASK = 0x20000000;
    const guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene);
    guiCam.layerMask = GUI_MASK;
    scene.activeCameras = [camera, guiCam];
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (ui.layer) ui.layer.layerMask = GUI_MASK;

    const COL = {
        idle: "#2a1d16", active: "#a4562a", edge: "#4d3a2c",
        text: "#fbf3ea", sub: "#d3bda9", accent: "#f0a86a"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "256px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(22,14,10,0.84)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "62px";
    ui.addControl(card);

    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "224px"; panel.isVertical = true;
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
        b.height = "33px"; b.paddingBottom = "6px";
        b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 14;
        b.onPointerUpObservable.add(onClick);
        panel.addControl(b);
        return b;
    }
    function addGap(h) {
        const sp = new BABYLON.GUI.Rectangle();
        sp.height = (h || 8) + "px"; sp.thickness = 0; sp.background = "";
        panel.addControl(sp);
    }

    addLabel("SANMA", 11, COL.sub, "18px");
    addLabel("サイズ", 13, COL.accent, "22px");

    const varietyBtns = {}, grillBtns = {};
    function highlight() {
        for (const k in varietyBtns) varietyBtns[k].background = (k === curVariety) ? COL.active : COL.idle;
        for (const k in grillBtns) grillBtns[k].background = (k === curGrill) ? COL.active : COL.idle;
    }
    for (const k of Object.keys(PRESETS)) {
        varietyBtns[k] = addButton("v_" + k, PRESETS[k].label, () => {
            curVariety = k; build(curVariety, curGrill, curSeed); highlight();
        });
    }

    addLabel("焼き加減", 13, COL.accent, "26px");
    for (const k of Object.keys(GRILLS)) {
        grillBtns[k] = addButton("g_" + k, GRILLS[k].label, () => {
            curGrill = k; build(curVariety, curGrill, curSeed); highlight();
        });
    }

    addGap(8);
    addButton("reseed", "別の一尾", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(curVariety, curGrill, curSeed); highlight();
    });

    const kbBtn = addButton("kb", "飾り包丁: ON", () => {
        GLOBAL.kazariBocho = !GLOBAL.kazariBocho;
        build(curVariety, curGrill, curSeed);
        kbBtn.background = GLOBAL.kazariBocho ? COL.active : COL.idle;
        kbBtn.textBlock.text = "飾り包丁: " + (GLOBAL.kazariBocho ? "ON" : "OFF");
    });
    kbBtn.background = GLOBAL.kazariBocho ? COL.active : COL.idle;

    const gnBtn = addButton("garnish", "付け合わせ: ON", () => {
        GLOBAL.showGarnish = !GLOBAL.showGarnish;
        garnish.setEnabled(GLOBAL.showGarnish);
        build(curVariety, curGrill, curSeed);
        gnBtn.background = GLOBAL.showGarnish ? COL.active : COL.idle;
        gnBtn.textBlock.text = "付け合わせ: " + (GLOBAL.showGarnish ? "ON" : "OFF");
    });
    gnBtn.background = GLOBAL.showGarnish ? COL.active : COL.idle;

    // 【対策】法線の向きが正しいかは、色を外して陰影だけにするのが
    //         いちばん確実。焼き色と身の色差に紛れて判定できない
    const DBG = ["通常", "白クレイ", "法線マップ"];
    const debugBtn = addButton("debug", "表示: 通常", () => {
        debugMode = (debugMode + 1) % 3;
        if (skin) skin.setDebug(debugMode);
        debugBtn.textBlock.text = "表示: " + DBG[debugMode];
        debugBtn.background = debugMode ? COL.active : COL.idle;
    });

    let shadowOn = true;
    const shadowBtn = addButton("shadow", "影: ON", () => {
        shadowOn = !shadowOn;
        key.shadowEnabled = shadowOn;
        shadowBtn.background = shadowOn ? COL.active : COL.idle;
        shadowBtn.textBlock.text = "影: " + (shadowOn ? "ON" : "OFF");
    });
    shadowBtn.background = COL.active;

    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        GLOBAL.useDOF = !GLOBAL.useDOF;
        dp.depthOfFieldEnabled = GLOBAL.useDOF;
        dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
        dofBtn.textBlock.text = "被写界深度: " + (GLOBAL.useDOF ? "ON" : "OFF");
    });
    dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;

    const rotateBtn = addButton("rotate", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.06;
        rotateBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotateBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });

    const info = addLabel("", 12, COL.sub, "46px");
    onRebuilt = () => {
        if (!info || !fillet || !curCfg) return;
        const s = fillet.size;
        info.text = curCfg.label + " / " + GRILLS[curGrill].label + "\n"
            + "全長 " + s.len.toFixed(1) + "cm  幅 " + s.wid.toFixed(1) + "cm\n"
            + "seed: " + curSeed + "  [" + BUILD + "]";
    };
    onRebuilt();

    // ---- GUI の開閉（スマホでは初期状態で畳む）-----------------------
    // 【対策】Babylon.GUI のサイズ指定はレンダー解像度基準（≒ CSS px × DPR）。
    //         DPR 3 の端末では 33px のボタンが実質 11 CSS px になる
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
    toggleBtn.background = "rgba(22,14,10,0.84)";
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
        toggleBtn.background = panelOpen ? COL.active : "rgba(22,14,10,0.84)";
    }
    toggleBtn.onPointerUpObservable.add(() => { panelOpen = !panelOpen; applyGuiLayout(); });
    engine.onResizeObservable.add(applyGuiLayout);

    highlight();
    applyGuiLayout();

    return scene;
};

export default createScene;