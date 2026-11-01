// =====================================================================
//  Photoreal Baked Donuts  /  写実的な焼きドーナツ    BUILD: donut-A1
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  構成:
//    0. CONFIG      … 種類プリセット（プレーン / チョコ / ホワイト×いちご /
//                     いちごチョコ / レモンアイシング / チョコ×ココナッツ）
//    1. Rng         … シード付き擬似乱数
//    2. Noise       … 2D/3D 値ノイズ・3Dセルノイズ・3D気泡（球冠）
//    3. Mesh utils  … 巻き順の自動判定・法線の溶接・トーラス格子・粒の集合
//    4. Profile     … 断面（閉じた輪郭）を弧長で等分割する
//    5. TextureLab  … 生地のアルベド/ORM/法線、リネン
//    6. Skin        … 生地は1組を全種で共有、グレーズは種類ごと
//    7. Donut       … 生地・グレーズ・トッピング
//    8. Plate       … 玉縁の皿
//    9. Scene / 物理（Havok。カプセル列で「穴」を残す）
//   10. GUI
//
//  実物の要点（ここを外すと「茶色いタイヤ」になる）:
//    ・焼きドーナツは1個の中に「型に接した面」と「空気に膨れた面」の
//      2種類の肌がある。前者は滑らかで色が濃く、わずかに照る。後者は
//      多孔質でざらつき、色は浅く、割れている。この差が最大の手がかりで、
//      全面を同じ肌にすると一気に樹脂の食品サンプルになる
//    ・膨れた面は平らではない。外周と内周に土手ができて中央が谷になる。
//      型の縁を越えて溢れた生地は外側の側面へ垂れ、そこに水平の筋
//      （シーム）が残る。この一本線があるかどうかで「型で焼いた」に見える
//    ・気泡は「暗い点」ではない。窪みなので陰りが入るだけで、
//      中の生地は周囲より明るい。暗い斑点で描くとカビになる
//    ・割れ目の中は焼けていない生地。周囲より明るい。暗い線で描くと
//      焦げた溝になる
//    ・穴は真円ではないし、外形もわずかに楕円。ただし工業製品なので
//      乱数の幅は野菜より遥かに狭い（外形 ±3%、厚み ±7%）
//    ・グレーズは塗料ではなく「浸けた」もの。境界は必ず1本の弦（直線）に
//      近く、縁には表面張力で溜まった玉ができ、そこだけ厚い
//    ・チョコとアイシングにはクリアコートが要るが、生地には絶対に付けない
//
//  他の焼き菓子（クッキー）との違い:
//    ・クッキーは片面ずつ違う顔をした「板」だが、ドーナツは閉じた輪。
//      断面が閉曲線なので極が無く、UV は u も v も巻き付く。
//      そのぶん「どこにも継ぎ目を作れない」＝ノイズは 3D で引く必要がある
//    ・周長は外周 22cm・穴 7cm と 3 倍違う。正方形のテクスチャを貼ると
//      気泡が外周でだけ横に伸びる。テクスチャは 2:1（u が長い）にして
//      1cm あたりのテクセル数を揃える
//    ・凸包を当たり判定にすると穴が埋まる。輪に沿ったカプセル列にすれば
//      穴が残り、ドーナツ同士が串刺しに重なる
// =====================================================================

var createScene = async function () {
    // =================================================================
    // 0. CONFIG （単位は cm）
    // =================================================================
    const TYPES = {
        plain: {
            label: "プレーン", countScale: 1.0, glaze: null
        },
        choco: {
            label: "チョコがけ", countScale: 1.0,
            glaze: {
                mode: "dip", chord: -0.55, wave: 0.30,
                color: [0.170, 0.092, 0.058], rough: 0.30,
                coat: 0.62, coatR: 0.13, thick: 0.115,
                sss: 0.0, topping: "cocoa", nTop: 34
            }
        },
        white: {
            label: "ホワイト×いちご", countScale: 1.0,
            glaze: {
                mode: "dip", chord: -0.30, wave: 0.26,
                color: [0.938, 0.898, 0.800], rough: 0.33,
                coat: 0.55, coatR: 0.16, thick: 0.122,
                sss: 0.35, topping: "berry", nTop: 26
            }
        },
        berry: {
            label: "いちごチョコ", countScale: 1.0,
            glaze: {
                mode: "dip", chord: -0.70, wave: 0.28,
                color: [0.862, 0.470, 0.500], rough: 0.31,
                coat: 0.58, coatR: 0.15, thick: 0.118,
                sss: 0.22, topping: "cocoa", nTop: 14
            }
        },
        lemon: {
            label: "レモンアイシング", countScale: 1.0,
            glaze: {
                // 【対策】アイシングは「浸けた」のではなく上から掛けたもの。
                //         全周を覆い、外側の側面へ不規則に垂れる
                mode: "top", drip: 0.075, wave: 0.34,
                color: [0.958, 0.930, 0.898], rough: 0.40,
                coat: 0.42, coatR: 0.12, thick: 0.098,
                sss: 0.55, topping: "zest", nTop: 62
            }
        },
        coco: {
            label: "チョコ×ココナッツ", countScale: 1.0,
            glaze: {
                mode: "dip", chord: -0.45, wave: 0.24,
                color: [0.188, 0.102, 0.062], rough: 0.30,
                coat: 0.60, coatR: 0.14, thick: 0.118,
                sss: 0.0, topping: "coconut", nTop: 78
            }
        }
    };

    // 詰め合わせのときの並び
    const ASSORT = ["choco", "plain", "lemon", "coco", "white", "berry"];

    // トッピングの粒
    const TOPPINGS = {
        cocoa: {   // ココアクランブル
            color: [0.238, 0.132, 0.082], rough: 0.78, coat: 0.0, sss: 0.0,
            sx: 0.115, sy: 0.075, sz: 0.095, jitter: 0.42, embed: 0.42, flake: false
        },
        berry: {   // フリーズドライのいちご
            color: [0.735, 0.115, 0.155], rough: 0.62, coat: 0.0, sss: 0.55,
            sx: 0.135, sy: 0.085, sz: 0.115, jitter: 0.46, embed: 0.38, flake: false
        },
        zest: {    // レモンの皮（すりおろし）
            color: [0.935, 0.700, 0.130], rough: 0.55, coat: 0.18, sss: 0.45,
            sx: 0.085, sy: 0.040, sz: 0.055, jitter: 0.38, embed: 0.50, flake: false
        },
        coconut: { // ココナッツロング
            color: [0.955, 0.932, 0.892], rough: 0.72, coat: 0.0, sss: 0.75,
            sx: 0.300, sy: 0.028, sz: 0.070, jitter: 0.22, embed: 0.30, flake: true
        }
    };

    const GLOBAL = {
        count: 7,                  // 個数

        // ---- ドーナツの寸法 -------------------------------------------
        // 外径 7.0cm / 穴の径 2.2cm / 高さ 2.05cm
        ringR: 2.32,               // 輪の中心が通る半径
        tubeW: 1.20,               // 断面の半幅（水平）
        tubeH: 2.05,               // 断面の高さ

        segRound: 176,             // 輪の周方向の分割
        segSect: 96,               // 断面の分割

        // 皿
        plateRim: 15.2,
        plateWell: 9.8,
        plateLip: 1.62,
        plateThick: 0.44,
        plateSegments: 200,
        plateRings: 44,
        plateBeads: 76,
        plateBeadAmp: 0.14,

        // --- 物理（Havok）
        // 【対策】cm 単位のシーンで実重力 981 を入れると、1ステップの
        //         めり込みが Havok の許容量を超えて震え続ける。数百に落とす
        gravity: 560,
        physicsHz: 120,
        pieceMass: 0.42,
        // 【対策】ドーナツは輪なので、摩擦が低いと転がって皿から落ちる
        friction: 0.90,
        restitution: 0.02,
        linearDamping: 0.22,
        angularDamping: 0.90,
        capsuleCount: 14,
        dropInterval: 0.30,
        dropClearance: 1.5,
        freezeWhenSettled: true,
        settleSpeed: 2.4, settleSpin: 2.4, settleHold: 0.45,
        settleTimeout: 9.0,

        // 【対策】周長は外周 22cm・穴 7cm。正方形のテクスチャだと
        //         1cm あたりのテクセル数が u と v で 2 倍ずれ、気泡が
        //         外周でだけ横に伸びる。u を 2 倍に取って実寸で揃える
        texW: 1024, texH: 512,

        showGround: true,
        useSSAO: true,
        useDOF: true,
        dofRatio: 0.072,
        dofFStop: 2.6,

        compactWidth: 700,
        compactMinSide: 480,
        guiMaxScale: 2.2
    };

    const START_MODE = "assort";
    const START_SEED = 20260811;
    const BUILD = "donut-A1";

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const frac = (x) => x - Math.floor(x);
    const sRGB = (c) => new BABYLON.Color3(c[0], c[1], c[2]).toLinearSpace();

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
    // 【対策】ドーナツの表面は「どこにも継ぎ目を作れない」閉曲面。
    //         UV 空間で 2D ノイズを引くと u=0 と v=0 に必ず線が出るうえ、
    //         周長が場所ごとに 3 倍違うので模様の大きさも揃わない。
    //         3D 位置から直接引けば、継ぎ目も歪みも原理的に発生しない
    const Noise = {
        _h2(x, y, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
            return (h >>> 0) / 4294967295;
        },
        _h3(x, y, z, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
                ^ Math.imul(z | 0, 1013904223) ^ Math.imul(seed | 0, 1274126177);
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
        // x 方向だけ折り返す（角度方向の 1 次元ノイズに使う）
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
        v3(x, y, z, seed) {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            const xf = x - xi, yf = y - yi, zf = z - zi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
            const c000 = this._h3(xi, yi, zi, seed), c100 = this._h3(xi + 1, yi, zi, seed);
            const c010 = this._h3(xi, yi + 1, zi, seed), c110 = this._h3(xi + 1, yi + 1, zi, seed);
            const c001 = this._h3(xi, yi, zi + 1, seed), c101 = this._h3(xi + 1, yi, zi + 1, seed);
            const c011 = this._h3(xi, yi + 1, zi + 1, seed), c111 = this._h3(xi + 1, yi + 1, zi + 1, seed);
            const x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
            const x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
            const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
            return y0 + (y1 - y0) * w;
        },
        fbm3(x, y, z, seed, oct) {
            let s = 0, a = 0.5, f = 1, n = 0;
            for (let o = 0; o < oct; o++) {
                s += a * this.v3(x * f, y * f, z * f, seed + o * 131);
                n += a; f *= 2; a *= 0.5;
            }
            return s / n;
        },
        // 3D セルノイズ。f1 = 最近点、f2 = 2番目
        // 【対策】割れ目は「点の集まり」ではなく「面の境界」。f1 の閾値で
        //         作ると水玉になる。f2 - f1 が小さいところを割れ目にする
        cell3(x, y, z, seed) {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            let f1 = 1e9, f2 = 1e9;
            for (let dz = -1; dz <= 1; dz++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const gx = xi + dx, gy = yi + dy, gz = zi + dz;
                        const jx = gx + this._h3(gx, gy, gz, seed);
                        const jy = gy + this._h3(gx, gy, gz, seed + 7717);
                        const jz = gz + this._h3(gx, gy, gz, seed + 3313);
                        const ex = jx - x, ey = jy - y, ez = jz - z;
                        const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
                        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
                    }
                }
            }
            return [f1, f2];
        },
        // 気泡。ばらけた格子の各点に半径の違う球を置き、切り口の深さを返す
        // 【対策】fbm のしきい値で気泡を作るとテラゾー（人造大理石）の模様に
        //         なる。実際の気泡は独立した球なので、球冠の深さで作るのが
        //         唯一それらしくなる方法（トーストで確認済み）
        pores3(x, y, z, seed, dens, rMin, rMax) {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            let best = -1e9, bestD = 0, bestR = 1;
            for (let dz = -1; dz <= 1; dz++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const gx = xi + dx, gy = yi + dy, gz = zi + dz;
                        const hs = this._h3(gx, gy, gz, seed + 91);
                        if (hs > dens) continue;                     // 空のセル
                        const r = mix(rMin, rMax, hs / Math.max(1e-6, dens));
                        const jx = gx + this._h3(gx, gy, gz, seed);
                        const jy = gy + this._h3(gx, gy, gz, seed + 7717);
                        const jz = gz + this._h3(gx, gy, gz, seed + 3313);
                        const ex = jx - x, ey = jy - y, ez = jz - z;
                        const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
                        // 重なった気泡は「いちばん深く抉れる方」が勝つ
                        const score = r - d;
                        if (score > best) { best = score; bestD = d; bestR = r; }
                    }
                }
            }
            if (best <= 0) return 0;
            const t = clamp(bestD / bestR, 0, 1);
            return Math.sqrt(Math.max(0, 1 - t * t));                // 球冠
        }
    };

    // =================================================================
    // 3. Mesh utils
    // =================================================================
    // 【対策】巻き順の判定を 1 頂点で行うと、うねりの乗った面で符号が
    //         ノイズで決まって個体ごとにメッシュが裏返る。全頂点の総和で
    //         取れば、閉じた形なら必ず正になる。
    //         トーラスは重心が「穴の中」＝立体の外にあるが、外周側の
    //         寄与（半径 3.5）が内周側（1.1）を上回るので符号は安定する
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

    // トーラス格子の三角形。u（i）も v（j）も巻き付くが、UV のために
    // 継ぎ目の列は複製してある
    function torusIndices(M, N) {
        const idx = [];
        const W = N + 1;
        for (let i = 0; i < M; i++) {
            for (let j = 0; j < N; j++) {
                const A = i * W + j, B = A + 1, C = A + W, D = C + 1;
                // 断面 j は「外側の赤道 → 上 → 内側 → 底」の向きに進むので
                // 外向きになるのはこちらの巻き
                idx.push(A, B, C, B, D, C);
            }
        }
        return idx;
    }

    // 粒（トッピング）をひとつのメッシュに溜め込む
    // 【対策】1粒ずつメッシュにするとドローコールが 90 個増える。
    //         かといってテクスチャの斑点で済ませると、真上から見た1個は
    //         誤魔化せても、皿に転がった瞬間に「印刷」だとわかる
    class Chunks {
        constructor() {
            this.pos = []; this.idx = []; this.col = [];
            // 低解像度の球（10 x 7）。位相は全粒で共通
            this.SU = 10; this.SV = 7;
            this.base = [];
            for (let j = 0; j <= this.SV; j++) {
                const th = j / this.SV * Math.PI;
                const st = Math.sin(th), ct = Math.cos(th);
                for (let i = 0; i <= this.SU; i++) {
                    const ph = (i % this.SU) / this.SU * TAU;
                    this.base.push([st * Math.cos(ph), ct, st * Math.sin(ph)]);
                }
            }
            this.tri = [];
            const W = this.SU + 1;
            for (let j = 0; j < this.SV; j++) {
                for (let i = 0; i < this.SU; i++) {
                    const A = j * W + i, B = A + 1, C = A + W, D = C + 1;
                    this.tri.push(A, C, B, B, C, D);
                }
            }
        }
        // center: V3 / e1,e2,e3: 正規直交基底 / s: [sx,sy,sz]（e1,e2,e3 方向）
        add(center, e1, e2, e3, s, jitter, seed, tint) {
            const off = this.pos.length / 3;
            const nb = this.base.length;
            for (let k = 0; k < nb; k++) {
                const b = this.base[k];
                const w = 1 + jitter * (Noise._h3(
                    Math.round(b[0] * 5), Math.round(b[1] * 5), Math.round(b[2] * 5), seed) - 0.5);
                const a = b[0] * s[0] * w, c = b[1] * s[1] * w, d = b[2] * s[2] * w;
                this.pos.push(
                    center.x + e1.x * a + e2.x * c + e3.x * d,
                    center.y + e1.y * a + e2.y * c + e3.y * d,
                    center.z + e1.z * a + e2.z * c + e3.z * d);
                this.col.push(tint, tint * 0.998, tint * 0.994, 1);
            }
            for (let k = 0; k < this.tri.length; k++) this.idx.push(off + this.tri[k]);
        }
        build(name, scene) {
            if (this.pos.length === 0) return null;
            const positions = new Float32Array(this.pos);
            const indices = this.idx;
            // 粒は閉じた球なので巻き順は既知。判定は掛けない
            const normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            return makeMesh(name, positions, indices, normals, null, new Float32Array(this.col), scene);
        }
    }

    // =================================================================
    // 4. Profile （断面の閉じた輪郭）
    // =================================================================
    // dr は断面の半幅に対する比（＋が外側）、dy は高さに対する比、
    // 3 番目は「膨れた面（多孔質）」らしさ。
    // 並びは 外側の赤道 → 上（膨れた面）→ 内側 → 底 → 戻る の反時計回り。
    //
    // 【対策】断面を単なる円（＝トーラス）にすると、それはドーナツでは
    //         なく浮き輪になる。焼きドーナツの断面には必ず
    //           ・型の縁を越えて溢れた跡（外側面の水平な筋）
    //           ・膨れた面の外土手 / 谷 / 内土手
    //           ・型の底に沿った平たい底
    //         の 3 つが出る。ここを省くと断面が対称になり、上下を
    //         ひっくり返しても同じに見える＝焼き物に見えなくなる
    const PROFILE_PTS = [
        [1.000, 0.494, 0.00],   // 0 外側の赤道（最大径）
        [0.996, 0.655, 0.00],   // 1 型からあふれた縁（シーム）
        [0.952, 0.792, 0.08],   // 2
        [0.856, 0.918, 0.60],   // 3 肌が切り替わる線
        [0.700, 1.000, 1.00],   // 4 外側の土手
        [0.430, 0.958, 1.00],   // 5
        [0.070, 0.930, 1.00],   // 6 谷
        [-0.300, 0.946, 1.00],  // 7
        [-0.575, 0.975, 1.00],  // 8 内側の土手
        [-0.795, 0.930, 0.72],  // 9
        [-0.928, 0.808, 0.14],  // 10
        [-1.000, 0.580, 0.00],  // 11 穴のいちばん狭いところ
        [-0.985, 0.340, 0.00],  // 12
        [-0.898, 0.155, 0.00],  // 13
        [-0.660, 0.042, 0.00],  // 14
        [-0.280, 0.004, 0.00],  // 15
        [0.180, 0.000, 0.00],   // 16 底（型の底）
        [0.580, 0.031, 0.00],   // 17
        [0.850, 0.146, 0.00],   // 18
        [0.968, 0.312, 0.00]    // 19
    ];
    const SEAM_INDEX = 1;

    class Profile {
        constructor(pts, N, W, H) {
            this.N = N;
            const K = pts.length;
            const crom = (a, b, c, d, t) => {
                const t2 = t * t, t3 = t2 * t;
                return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
            };
            // 閉じた Catmull-Rom を密にサンプル
            const S = 24;                       // 制御点あたりの細分
            const TOT = K * S;
            const sx = new Float64Array(TOT + 1), sy = new Float64Array(TOT + 1), sc = new Float64Array(TOT + 1);
            const key = new Float64Array(TOT + 1);   // どの制御点に近いか（シーム検出用）
            for (let i = 0; i < TOT; i++) {
                const seg = Math.floor(i / S), t = (i % S) / S;
                const p0 = pts[(seg - 1 + K) % K], p1 = pts[seg], p2 = pts[(seg + 1) % K], p3 = pts[(seg + 2) % K];
                sx[i] = crom(p0[0], p1[0], p2[0], p3[0], t);
                sy[i] = crom(p0[1], p1[1], p2[1], p3[1], t);
                sc[i] = clamp(crom(p0[2], p1[2], p2[2], p3[2], t), 0, 1);
                key[i] = seg + t;
            }
            sx[TOT] = sx[0]; sy[TOT] = sy[0]; sc[TOT] = sc[0]; key[TOT] = K;

            // 【対策】制御点を等分割すると、曲率の大きいところ（土手や
            //         穴の入口）だけ頂点が密になり、テクスチャの模様が
            //         そこで縦に潰れる。必ず弧長で等分割する。
            //         弧長は実寸（cm）で測る。dr と dy を正規化のまま
            //         測ると半幅 1.2cm と高さ 2.05cm の比が無視される
            const cum = new Float64Array(TOT + 1);
            for (let i = 1; i <= TOT; i++) {
                const dx = (sx[i] - sx[i - 1]) * W, dy = (sy[i] - sy[i - 1]) * H;
                cum[i] = cum[i - 1] + Math.hypot(dx, dy);
            }
            this.perimeter = cum[TOT];

            this.dr = new Float64Array(N + 1);
            this.dy = new Float64Array(N + 1);
            this.crumb = new Float64Array(N + 1);
            this.keyv = new Float64Array(N + 1);
            let cur = 0;
            for (let j = 0; j <= N; j++) {
                const target = this.perimeter * (j / N);
                while (cur < TOT && cum[cur + 1] < target) cur++;
                const seg = Math.max(1e-12, cum[cur + 1] - cum[cur]);
                const t = clamp((target - cum[cur]) / seg, 0, 1);
                this.dr[j] = mix(sx[cur], sx[cur + 1], t);
                this.dy[j] = mix(sy[cur], sy[cur + 1], t);
                this.crumb[j] = mix(sc[cur], sc[cur + 1], t);
                this.keyv[j] = mix(key[cur], key[cur + 1], t);
            }
            this.dr[N] = this.dr[0]; this.dy[N] = this.dy[0];
            this.crumb[N] = this.crumb[0]; this.keyv[N] = K;

            // 膨れた面の範囲（グレーズの帯をここから決める）
            let v0 = 0.12, v1 = 0.42;
            for (let j = 0; j < N; j++) {
                if (this.crumb[j] < 0.5 && this.crumb[j + 1] >= 0.5) v0 = j / N;
                if (this.crumb[j] >= 0.5 && this.crumb[j + 1] < 0.5) v1 = (j + 1) / N;
            }
            this.vCrumb0 = v0; this.vCrumb1 = v1;

            // シーム（あふれ縁）の v
            let vs = 0.05;
            for (let j = 0; j < N; j++) {
                if (this.keyv[j] <= SEAM_INDEX && this.keyv[j + 1] > SEAM_INDEX) { vs = (j + 0.5) / N; break; }
            }
            this.vSeam = vs;
        }
        // v ∈ [0,1) を線形補間で引く
        sample(v) {
            const N = this.N;
            let t = v - Math.floor(v);
            const f = t * N, j = Math.floor(f), a = f - j;
            const j0 = j % N, j1 = (j + 1) % N;
            return {
                dr: mix(this.dr[j0], this.dr[j1], a),
                dy: mix(this.dy[j0], this.dy[j1], a),
                crumb: mix(this.crumb[j0], this.crumb[j1], a)
            };
        }
    }

    // =================================================================
    // 5. TextureLab
    // =================================================================
    const TextureLab = {
        _tex(name, w, h, fill, scene, linear) {
            w = Math.max(8, Math.round(w) || 512);
            h = Math.max(8, Math.round(h) || 512);
            const dt = new BABYLON.DynamicTexture(name, { width: w, height: h }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(w, h);
            fill(img.data, w, h);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = false;
            // トーラスは u も v も巻き付く。どちらも WRAP
            dt.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
            dt.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
            // 【対策】ORM と法線は「色」ではない。既定のまま（gammaSpace = true）
            //         にすると粗さ 0.88 が線形 0.74 として渡り、狙いより光る
            if (linear) dt.gammaSpace = false;
            return dt;
        },

        // 生地の場（焼き色・気泡・割れ・高さ）を 1 回でまとめて焼く
        // 【対策】アルベドと法線を別々に計算すると、気泡の位置が数テクセル
        //         ずれて「模様の上にぼんやりした汚れが乗った」ように見える
        doughFields(w, h, cfg, seed) {
            const n = w * h;
            const F = {
                hgt: new Float32Array(n),
                brown: new Float32Array(n),
                pore: new Float32Array(n),
                crack: new Float32Array(n),
                crumb: new Float32Array(n),
                ao: new Float32Array(n)
            };
            const prof = cfg.profile, R0 = cfg.ringR, W = cfg.tubeW, H = cfg.tubeH;
            // 角度ごとの sin/cos は使い回す
            const cs = new Float64Array(w), sn = new Float64Array(w);
            for (let x = 0; x < w; x++) {
                const a = x / w * TAU;
                cs[x] = Math.cos(a); sn[x] = Math.sin(a);
            }
            const SP = 11.0;   // 気泡の格子（1 単位 = 0.091cm）
            const SC = 2.15;   // 割れ目の格子
            const SG = 6.0;    // 生地の肌理
            const SM = 1.05;   // 焼きムラ
            const SF = 15.0;   // 型に接した面の細かい肌理

            for (let y = 0; y < h; y++) {
                const v = y / h;
                const S = prof.sample(v);
                const crumb = S.crumb;
                const drN = S.dr, dyN = S.dy;
                const r = R0 + drN * W, py = dyN * H;
                // シーム（あふれ縁）の細い筋
                let dv = Math.abs(v - prof.vSeam); dv = Math.min(dv, 1 - dv);
                const seam = Math.exp(-Math.pow(dv / 0.014, 2));
                // 穴の中は熱が回りにくく、わずかに浅い
                const inner = smooth(0.10, 0.85, -drN);
                // 型の底に近いほど濃い
                const low = 1 - smooth(0.02, 0.58, dyN);

                for (let x = 0; x < w; x++) {
                    const i = y * w + x;
                    const px = r * cs[x], pz = r * sn[x];
                    F.crumb[i] = crumb;

                    const mott = Noise.fbm3(px * SM + 3.1, py * SM + 7.7, pz * SM + 1.3, seed + 11, 3);
                    let hgt = 0.55;
                    let pore = 0, crack = 0;

                    if (crumb > 0.015) {
                        // ---- 膨れた面：気泡と割れ目 ----------------------
                        pore = Noise.pores3(px * SP, py * SP, pz * SP, seed + 41, 0.60, 0.26, 0.66) * crumb;
                        const c = Noise.cell3(px * SC + 5, py * SC + 2, pz * SC + 9, seed + 73);
                        // 【対策】割れ目は面の境界。f1 のしきい値だと水玉になる
                        const cw = 1 - smooth(0.0, 0.095, c[1] - c[0]);
                        // 割れは内側の土手のほうに強く出る（生地が最後に裂ける場所）
                        crack = cw * crumb * mix(0.35, 1.0, smooth(0.15, 0.85, -drN)) *
                            smooth(0.30, 0.62, mott + 0.16);
                        const grain = Noise.fbm3(px * SG + 17, py * SG + 4, pz * SG + 23, seed + 5, 3);
                        hgt += 0.16 * (grain - 0.5) * crumb;
                        hgt -= 0.44 * pore;
                        hgt -= 0.30 * crack;
                    }
                    if (crumb < 0.985) {
                        // ---- 型に接した面：ほぼ平ら。ごく細かい肌理だけ ----
                        const fine = Noise.fbm3(px * SF + 31, py * SF + 13, pz * SF + 3, seed + 97, 2);
                        hgt += 0.055 * (fine - 0.5) * (1 - crumb);
                        hgt += 0.13 * seam * (1 - crumb);
                    }

                    // ---- 焼き色 ------------------------------------------
                    // 【対策】膨れた面まで型の面と同じ濃さで焼くと、断面の
                    //         2 面性が消えて全体がのっぺりした茶色になる
                    let brown = 0.34 + 0.46 * low;
                    brown -= 0.34 * crumb;
                    brown -= 0.11 * inner;
                    brown += 0.19 * (mott - 0.5);
                    brown += 0.16 * seam;
                    brown -= 0.26 * pore;          // 気泡の中は焼けていない
                    brown -= 0.50 * crack;         // 割れ目の中は生の生地
                    F.brown[i] = clamp(brown, 0, 1);

                    F.pore[i] = pore;
                    F.crack[i] = crack;
                    F.hgt[i] = clamp(hgt, 0, 1);
                    F.ao[i] = clamp(1 - 0.58 * pore - 0.42 * crack - 0.16 * (1 - F.hgt[i]), 0.10, 1);
                }
            }
            return F;
        },

        doughAlbedo(scene, w, h, F) {
            // 膨れた面の生地 / よく焼けた型の面 / いちばん濃い縁 / 生の生地
            const CRUMB = [0.906, 0.796, 0.616];
            const BAKE = [0.868, 0.618, 0.334];
            const EDGE = [0.664, 0.392, 0.170];
            const RAW = [0.948, 0.884, 0.744];
            return this._tex("donutAlbedo", w, h, (d, W2, H2) => {
                for (let i = 0; i < W2 * H2; i++) {
                    const o = i * 4, b = F.brown[i];
                    let cr = CRUMB[0], cg = CRUMB[1], cb = CRUMB[2];
                    cr = mix(cr, BAKE[0], b); cg = mix(cg, BAKE[1], b); cb = mix(cb, BAKE[2], b);
                    const ek = smooth(0.60, 1.0, b);
                    cr = mix(cr, EDGE[0], ek); cg = mix(cg, EDGE[1], ek); cb = mix(cb, EDGE[2], ek);
                    // 【対策】割れ目と気泡を暗く塗るとカビと焦げ穴になる。
                    //         中身は焼けていない生地なので周囲より明るい。
                    //         暗く見えるのは陰りのぶんで、それは AO の担当
                    const rk = clamp(0.80 * smooth(0.10, 0.85, F.crack[i]) + 0.42 * smooth(0.15, 0.90, F.pore[i]), 0, 1);
                    cr = mix(cr, RAW[0], rk); cg = mix(cg, RAW[1], rk); cb = mix(cb, RAW[2], rk);
                    d[o] = clamp(cr, 0, 1) * 255;
                    d[o + 1] = clamp(cg, 0, 1) * 255;
                    d[o + 2] = clamp(cb, 0, 1) * 255;
                    d[o + 3] = 255;
                }
            }, scene, false);
        },

        doughOrm(scene, w, h, F) {
            return this._tex("donutORM", w, h, (d, W2, H2) => {
                for (let i = 0; i < W2 * H2; i++) {
                    const o = i * 4;
                    // 【対策】この 2 面の粗さの差が焼きドーナツの正体。
                    //         型に接した面は生地が型に押しつけられて目が詰まり、
                    //         油もまわるので確かに照る。膨れた面は乾いた多孔質。
                    //         同じ粗さにすると、どちらかが樹脂かパン粉になる
                    let rough = mix(0.575, 0.900, F.crumb[i]);
                    rough += 0.055 * F.pore[i];
                    rough += 0.070 * F.crack[i];
                    rough -= 0.085 * smooth(0.58, 1.0, F.brown[i]);
                    d[o] = clamp(F.ao[i], 0, 1) * 255;
                    d[o + 1] = clamp(rough, 0.05, 1) * 255;
                    d[o + 2] = 0; d[o + 3] = 255;
                }
            }, scene, true);
        },

        // 高さ場 → 法線マップ。u も v も巻き付く
        normal(scene, w, h, hf, strength, name) {
            return this._tex(name, w, h, (d, W2, H2) => {
                for (let y = 0; y < H2; y++) {
                    const yu = ((y - 1) + H2) % H2, yd = (y + 1) % H2;
                    for (let x = 0; x < W2; x++) {
                        const xl = hf[y * W2 + ((x - 1 + W2) % W2)], xr = hf[y * W2 + ((x + 1) % W2)];
                        const hu = hf[yu * W2 + x], hd = hf[yd * W2 + x];
                        // 【対策】v は画像の下方向に増える。OpenGL 系の
                        //         「V が上向き」の規約のまま (hu - hd) にすると
                        //         u は正・v は逆というねじれた法線になる
                        let nx = (xl - xr) * strength, ny = (hd - hu) * strength, nz = 1;
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const i = (y * W2 + x) * 4;
                        d[i] = (nx * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene, true);
        },

        // リネンのクロス
        // 【対策】明暗差を付けすぎると市松のタイルになる。糸の上下は
        //         色ではなく陰影の差でしかない
        linen(scene, size, seed) {
            const WARP = [0.862, 0.842, 0.812], WEFT = [0.822, 0.800, 0.770];
            return this._tex("linenAlbedo", size, size, (d, N) => {
                const P = 128;
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        const su = u * P, sv = v * P;
                        const fu = su - Math.floor(su), fv = sv - Math.floor(sv);
                        const over = ((Math.floor(su) + Math.floor(sv)) & 1) === 0;
                        const bu = Math.sin(Math.PI * fu), bv = Math.sin(Math.PI * fv);
                        const shade = over ? (0.90 + 0.13 * bv) : (0.80 + 0.12 * bu);
                        const slub = 0.93 + 0.14 * Noise.fbm2u(u * 220, v * 220, 220, seed, 2);
                        const stain = 0.94 + 0.12 * Noise.fbm2u(u * 5, v * 5, 5, seed + 9, 3);
                        const C = over ? WARP : WEFT;
                        d[i] = clamp(C[0] * shade * slub * stain, 0, 1) * 255;
                        d[i + 1] = clamp(C[1] * shade * slub * stain, 0, 1) * 255;
                        d[i + 2] = clamp(C[2] * shade * slub * stain, 0, 1) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene, false);
        }
    };

    // =================================================================
    // 6. Skin （生地は 1 組を全種で共有、グレーズは種類ごと）
    // =================================================================
    // 【対策】6 種類ぶんの生地テクスチャを別々に焼くのは無駄でしかない。
    //         焼きドーナツの本体はどれも同じもので、違うのは掛かっている
    //         ものだけ。生地を 1 組に絞れるぶん解像度を上げられる
    class DoughSkin {
        constructor(scene, cfg) {
            const w = cfg.texW, h = cfg.texH;
            const F = TextureLab.doughFields(w, h, cfg, cfg.texSeed);
            this.albedoTex = TextureLab.doughAlbedo(scene, w, h, F);
            this.ormTex = TextureLab.doughOrm(scene, w, h, F);
            this.normalTex = TextureLab.normal(scene, w, h, F.hgt, 2.6, "donutNormal");
            this.texs = [this.albedoTex, this.ormTex, this.normalTex];
            for (const t of this.texs) t.anisotropicFilteringLevel = 8;

            const m = new BABYLON.PBRMaterial("donutDough", scene);
            m.albedoTexture = this.albedoTex;
            m.metallic = 0.0;
            m.roughness = 1.0;                   // 実値は ORM の G
            m.metallicTexture = this.ormTex;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.bumpTexture = this.normalTex;
            m.bumpTexture.level = 1.0;
            m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
            // 【対策】生地にクリアコートは絶対に付けない。焼き菓子に艶を
            //         足すと一発で樹脂成型の食品サンプルになる。代わりに
            //         sheen をごく弱く入れて、乾いた面が斜めから見たときだけ
            //         白く立つのを拾う
            m.sheen.isEnabled = true;
            m.sheen.intensity = 0.13;
            m.sheen.roughness = 0.62;
            m.sheen.color = new BABYLON.Color3(0.82, 0.72, 0.56);
            // 卵とバターの多い生地は逆光でうっすら透ける
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.tintColor = new BABYLON.Color3(0.94, 0.74, 0.48);
            m.subSurface.translucencyIntensity = 0.10;
            m.subSurface.minimumThickness = 0.8;
            m.subSurface.maximumThickness = 4.0;
            this.mat = m;
        }
        dispose() {
            this.mat.dispose(true, false);
            for (const t of this.texs) t.dispose();
        }
    }

    class GlazeSkin {
        constructor(scene, key, gz) {
            this.mats = [];
            const m = new BABYLON.PBRMaterial("glaze_" + key, scene);
            m.albedoColor = sRGB(gz.color);
            m.metallic = 0.0;
            m.roughness = gz.rough;
            m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
            // 【対策】チョコとアイシングの艶は素地の反射ではなく「表面の膜」。
            //         roughness を下げて出すと濡れた石になる。層として乗せる
            m.clearCoat.isEnabled = true;
            m.clearCoat.intensity = gz.coat;
            m.clearCoat.roughness = gz.coatR;
            if (gz.sss > 0) {
                m.subSurface.isTranslucencyEnabled = true;
                m.subSurface.tintColor = sRGB(gz.color);
                m.subSurface.translucencyIntensity = 0.45 * gz.sss;
                m.subSurface.minimumThickness = 0.02;
                m.subSurface.maximumThickness = 0.30;
            }
            this.glaze = m;
            this.mats.push(m);

            const tp = TOPPINGS[gz.topping];
            this.top = tp;
            if (tp) {
                const t = new BABYLON.PBRMaterial("topping_" + key, scene);
                t.albedoColor = sRGB(tp.color);
                t.metallic = 0.0;
                t.roughness = tp.rough;
                t.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
                if (tp.coat > 0) {
                    t.clearCoat.isEnabled = true;
                    t.clearCoat.intensity = tp.coat;
                    t.clearCoat.roughness = 0.22;
                }
                if (tp.sss > 0) {
                    // フリーズドライのいちごもココナッツも、薄いので必ず透ける。
                    // ここが無いと赤い石と白い石になる
                    t.subSurface.isTranslucencyEnabled = true;
                    t.subSurface.tintColor = sRGB(tp.color);
                    t.subSurface.translucencyIntensity = 0.80 * tp.sss;
                    t.subSurface.minimumThickness = 0.01;
                    t.subSurface.maximumThickness = 0.18;
                }
                if (tp.flake) {
                    t.sheen.isEnabled = true;
                    t.sheen.intensity = 0.30;
                    t.sheen.roughness = 0.75;
                    t.backFaceCulling = false;
                    t.twoSidedLighting = true;
                }
                this.toppingMat = t;
                this.mats.push(t);
            }
        }
        dispose() { for (const m of this.mats) m.dispose(true, false); }
    }

    // =================================================================
    // 7. Donut
    // =================================================================
    class Donut {
        constructor(scene, cfg, seed, dough, glazeSkin) {
            this.scene = scene; this.cfg = cfg; this.seed = seed >>> 0;
            this.dough = dough; this.gskin = glazeSkin;
            this.parts = [];
            this.root = new BABYLON.TransformNode("donutRoot", scene);
            const rng = new Rng(this.seed);
            this.rng = rng;
            this.nseed = (this.seed % 100000) | 0;

            // 【対策】ドーナツは型で焼いた工業製品。野菜と同じ幅で乱数を
            //         振ると手びねりの粘土になる。外形 ±3%、厚み ±7%。
            //         単調さは焼きムラと膨れ方の偏りで消す
            this.R0 = cfg.ringR * rng.range(0.975, 1.025);
            this.W = cfg.tubeW * rng.range(0.965, 1.040);
            this.H = cfg.tubeH * rng.range(0.930, 1.075);
            this.ovAmp = rng.range(0.008, 0.026);      // わずかな楕円
            this.ovAng = rng.range(0, TAU);
            this.und = rng.range(0.055, 0.115);        // 膨れた面のうねり
            this.lean = rng.range(0.20, 0.85);         // 片側だけ余計に膨れる
            this.leanAng = rng.range(0, TAU);
            this.uOff = rng.next();                    // 模様の回転
            this.glazeAng = rng.range(0, TAU);
            this.tone = rng.range(0.955, 1.045);       // 個体ごとの焼き加減

            this._buildDough();
            if (cfg.glaze) {
                this._buildGlaze();
                if (this.gskin && this.gskin.top) this._buildToppings();
            }
        }

        // 輪のゆがみ（角度だけの関数。断面の形は保つ）
        ringMod(phi) {
            const u = phi / TAU;
            const w = Noise.fbm2u(u * 5, 1.5, 5, this.nseed + 31, 2) - 0.5;
            return 1 + this.ovAmp * Math.cos(2 * (phi - this.ovAng)) + 0.020 * w;
        }

        // ---- 生地 ------------------------------------------------------
        _buildDough() {
            const cfg = this.cfg, prof = cfg.profile;
            const M = cfg.segRound, N = prof.N;
            const VW = N + 1, total = (M + 1) * VW;
            const positions = new Float32Array(total * 3);
            const uvs = new Float32Array(total * 2);
            const colors = new Float32Array(total * 4);
            const ns = this.nseed;

            for (let i = 0; i <= M; i++) {
                const phi = (i % M) / M * TAU;
                const cs = Math.cos(phi), sn = Math.sin(phi);
                const ring = this.R0 * this.ringMod(phi);
                // 片側だけ余計に膨れる（型に流す量のばらつき）
                const lean = 1 + this.lean * 0.055 * Math.cos(phi - this.leanAng);
                for (let j = 0; j <= N; j++) {
                    const jj = j % N;
                    const dr = prof.dr[jj] * this.W;
                    const crumb = prof.crumb[jj];
                    let dy = prof.dy[jj] * this.H * mix(1, lean, crumb);
                    const r = ring + dr;
                    const x = r * cs, z = r * sn;
                    // 【対策】うねりを UV で引くと u=0 に必ず縦の筋が出る。
                    //         3D 位置で引けば継ぎ目は原理的に存在しない
                    if (crumb > 0.01) {
                        const un = Noise.fbm3(x * 1.15 + 11, dy * 1.15 + 7, z * 1.15 + 3, ns + 5, 3) - 0.5;
                        const un2 = Noise.fbm3(x * 3.1 + 2, dy * 3.1 + 19, z * 3.1 + 8, ns + 61, 2) - 0.5;
                        dy += this.H * this.und * crumb * (1.5 * un + 0.6 * un2);
                    }
                    const k = i * VW + j;
                    positions[k * 3] = x; positions[k * 3 + 1] = dy; positions[k * 3 + 2] = z;
                    // 【対策】u に frac を掛けると、uOff の折り返しがメッシュの
                    //         真ん中の 1 列で起き、そこだけミップの選択が暴れて
                    //         縦線が出る。wrapU が WRAP なら 1 を超えたままでよい
                    uvs[k * 2] = i / M + this.uOff; uvs[k * 2 + 1] = j / N;
                    // 個体ごとの焼きムラ（テクスチャは共有なので、ここで崩す）
                    const t = this.tone * (0.955 + 0.09 *
                        Noise.fbm3(x * 0.55 + 21, dy * 0.55 + 5, z * 0.55 + 13, ns + 71, 3));
                    colors[k * 4] = t; colors[k * 4 + 1] = t * 0.996; colors[k * 4 + 2] = t * 0.990;
                    colors[k * 4 + 3] = 1;
                }
            }
            const indices = torusIndices(M, N);
            const normals = finalize(positions, indices);
            this.wind = finalize.lastFlipped;
            weldNormals(positions, normals);
            const mesh = makeMesh("donut", positions, indices, normals, uvs, colors, this.scene);
            mesh.material = this.dough.mat;
            mesh.receiveShadows = true;
            this.mesh = mesh;
            this.parts.push(mesh);
            // グレーズとトッピングで使い回す
            this._pos = positions; this._nor = normals; this._M = M; this._N = N;
        }

        // ---- グレーズの被り具合 -----------------------------------------
        // 【対策】グレーズを「上面に塗ったもの」として扱うと、境界が
        //         同心円になって印刷したシールに見える。実物は浸けたもの
        //         なので、境界は水平面と輪の交線＝1 本の弦になる。
        //         r・cos(φ-φ0) を閾値と比べれば、外周では深く、穴の際では
        //         浅く入る「弦」がそのまま出る
        glazeMask(i, j) {
            const cfg = this.cfg, gz = cfg.glaze, prof = cfg.profile;
            const M = this._M, N = this._N;
            const phi = (i % M) / M * TAU;
            const v = (j % N) / N;
            // 外側の赤道（v=0）をまたいで垂れられるように 0 を中心へ移す
            const w = v < 0.5 ? v : v - 1;
            const u = phi / TAU;

            let a0, a1;
            const inExt = 0.055 + 0.030 * (Noise.fbm2u(u * 6, 4.5, 6, this.nseed + 23, 2) - 0.5);
            if (gz.mode === "top") {
                // 上から掛けたアイシング。全周を覆い、外側へ不規則に垂れる
                const dn = Noise.fbm2u(u * 9, 0.5, 9, this.nseed + 43, 2);
                const drip = Math.pow(smooth(0.42, 0.96, dn), 1.6);
                a0 = prof.vCrumb0 - 0.020 - gz.drip * (0.35 + 1.8 * drip);
                a1 = prof.vCrumb1 + inExt;
            } else {
                a0 = prof.vCrumb0 - 0.062;
                a1 = prof.vCrumb1 + inExt;
            }
            a0 = Math.max(a0, -0.078);
            const e = 0.016;
            let m = smooth(a0, a0 + e, w) * (1 - smooth(a1 - e, a1, w));

            if (gz.mode === "dip") {
                const dr = prof.dr[j % N] * this.W;
                const r = this.R0 * this.ringMod(phi) + dr;
                // 境界の揺らぎ。チョコは粘るのでゆっくり、アイシングは細かい
                const wob = gz.wave * 2 * (Noise.fbm2u(u * 7, 2.5, 7, this.nseed + 87, 2) - 0.5);
                const d = r * Math.cos(phi - this.glazeAng) + wob;
                m *= smooth(gz.chord - 0.18, gz.chord + 0.18, d);
            }
            return clamp(m, 0, 1);
        }

        _buildGlaze() {
            const cfg = this.cfg, gz = cfg.glaze;
            const M = this._M, N = this._N, VW = N + 1;
            const total = (M + 1) * VW;
            const P = this._pos, NO = this._nor;
            const g = new Float32Array(total);
            for (let i = 0; i <= M; i++) {
                for (let j = 0; j <= N; j++) g[i * VW + j] = this.glazeMask(i, j);
            }

            // 使う頂点だけ詰め直す（使わない頂点を残すと境界箱が膨らむ）
            const used = new Int32Array(total).fill(-1);
            const quads = [];
            for (let i = 0; i < M; i++) {
                for (let j = 0; j < N; j++) {
                    const A = i * VW + j, B = A + 1, C = A + VW, D = C + 1;
                    if (g[A] < 0.004 && g[B] < 0.004 && g[C] < 0.004 && g[D] < 0.004) continue;
                    quads.push(A, B, C, D);
                    used[A] = 0; used[B] = 0; used[C] = 0; used[D] = 0;
                }
            }
            if (quads.length === 0) return;

            let nv = 0;
            for (let k = 0; k < total; k++) if (used[k] === 0) used[k] = nv++;
            const positions = new Float32Array(nv * 3);
            const colors = new Float32Array(nv * 4);
            const eps = 0.014, TH = gz.thick;
            const ns = this.nseed;
            for (let k = 0; k < total; k++) {
                const q = used[k]; if (q < 0) continue;
                const gg = g[k];
                const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
                // 【対策】縁を厚み 0 まで落とすと生地と同一面になって
                //         Z ファイティングで縞が出る。逆に一定の厚みで
                //         切り落とすと、断ち切った樹脂板を貼ったように見える。
                //         表面張力で溜まった「玉」を縁の少し内側に作れば、
                //         生地に着地しつつ縁が丸く見える
                const bead = smooth(0.03, 0.15, gg) * (1 - smooth(0.15, 0.44, gg));
                const rip = Noise.fbm3(x * 3.0 + 5, y * 3.0 + 12, z * 3.0 + 2, ns + 131, 3) - 0.5;
                let off = eps + TH * smooth(0.0, 0.28, gg) * (1 + 0.55 * bead) + TH * 0.26 * rip * smooth(0.10, 0.45, gg);
                positions[q * 3] = x + NO[k * 3] * off;
                positions[q * 3 + 1] = y + NO[k * 3 + 1] * off;
                positions[q * 3 + 2] = z + NO[k * 3 + 2] * off;
                // 濃淡。厚いところほど濃く見える（透けが減る）
                const mo = 0.955 + 0.085 * Noise.fbm3(x * 1.6 + 3, y * 1.6 + 9, z * 1.6 + 7, ns + 149, 3);
                const c = mo * mix(1.06, 0.98, smooth(0.05, 0.55, gg));
                colors[q * 4] = c; colors[q * 4 + 1] = c * 0.998; colors[q * 4 + 2] = c * 0.995;
                colors[q * 4 + 3] = 1;
            }
            const indices = [];
            for (let k = 0; k < quads.length; k += 4) {
                const A = used[quads[k]], B = used[quads[k + 1]], C = used[quads[k + 2]], D = used[quads[k + 3]];
                // 【対策】ここで巻き順を判定し直すと、開いた面なので
                //         個体によって裏返る。生地で確定した向きに揃える
                if (this.wind) indices.push(A, C, B, B, C, D);
                else indices.push(A, B, C, B, D, C);
            }
            const normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            weldNormals(positions, normals);
            const mesh = makeMesh("glaze", positions, indices, normals, null, colors, this.scene);
            mesh.material = this.gskin.glaze;
            mesh.receiveShadows = true;
            this.glazeMesh = mesh;
            this.parts.push(mesh);
            this._glazeMask = g;
            this._glazePos = positions;
            this._glazeUsed = used;
            this._glazeNor = normals;
        }

        // ---- トッピング -------------------------------------------------
        _buildToppings() {
            const gz = this.cfg.glaze, tp = this.gskin.top;
            if (!this._glazeMask) return;
            const M = this._M, N = this._N, VW = N + 1;
            const g = this._glazeMask, used = this._glazeUsed;
            const P = this._glazePos, NO = this._glazeNor;
            const rng = this.rng;
            const want = Math.round(gz.nTop * rng.range(0.85, 1.15));
            const chunks = new Chunks();
            const placed = [];
            const minD = tp.flake ? 0.22 : 0.20;
            let tries = 0;
            const scale = Math.max(this.W, this.H) / Math.max(this.cfg.tubeW, this.cfg.tubeH);

            while (placed.length < want && tries < want * 60) {
                tries++;
                const i = rng.int(M), j = rng.int(N);
                const k = i * VW + j;
                if (g[k] < 0.62) continue;
                const q = used[k]; if (q < 0) continue;
                const px = P[q * 3], py = P[q * 3 + 1], pz = P[q * 3 + 2];
                let ok = true;
                for (const p of placed) {
                    if ((p[0] - px) ** 2 + (p[1] - py) ** 2 + (p[2] - pz) ** 2 < minD * minD) { ok = false; break; }
                }
                if (!ok) continue;
                placed.push([px, py, pz]);

                // 面の法線を上向きの基底にして、接平面内で自由に回す
                const n = new V3(NO[q * 3], NO[q * 3 + 1], NO[q * 3 + 2]).normalize();
                let ref = Math.abs(n.y) > 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0);
                let e1 = V3.Cross(ref, n).normalize();
                let e3 = V3.Cross(n, e1).normalize();
                const a = rng.range(0, TAU), ca = Math.cos(a), sa = Math.sin(a);
                const f1 = e1.scale(ca).add(e3.scale(sa));
                const f3 = e1.scale(-sa).add(e3.scale(ca));
                // 粒は面に寝るが、完全に平らではない
                const tilt = tp.flake ? rng.gauss(0, 0.22) : rng.gauss(0, 0.42);
                const ct = Math.cos(tilt), st = Math.sin(tilt);
                const b2 = n.scale(ct).add(f3.scale(st));
                const b3 = f3.scale(ct).add(n.scale(-st));

                const s = rng.range(0.78, 1.28) * scale;
                const sx = tp.sx * s, sy = tp.sy * s, sz = tp.sz * s;
                // 【対策】粒を面の上にきれいに載せると、乾いてから振りかけた
                //         ように見える。実際は固まる前のグレーズに沈むので、
                //         半分近く埋まっている
                const emb = sy * (1 - tp.embed * 2);
                const c = new V3(px + n.x * emb, py + n.y * emb, pz + n.z * emb);
                chunks.add(c, f1, b2, b3, [sx, sy, sz], tp.jitter,
                    (this.nseed + placed.length * 7919) >>> 0, rng.range(0.86, 1.14));
            }
            const mesh = chunks.build("topping", this.scene);
            if (!mesh) return;
            mesh.material = this.gskin.toppingMat;
            mesh.receiveShadows = true;
            this.parts.push(mesh);
        }

        // ---- 当たり判定 -------------------------------------------------
        // 【対策】凸包にすると穴が埋まり、ただの円盤になる。重なったときに
        //         見えない肉で浮くうえ、ドーナツ同士が串刺しに絡む一番の
        //         見どころが消える。輪に沿ったカプセル列なら穴が残る
        colliderShape() {
            const cfg = this.cfg, K = cfg.capsuleCount;
            const container = new BABYLON.PhysicsShapeContainer(this.scene);
            const parts = [];
            const yC = cfg.profile.dy[0] * this.H;
            const r = Math.min(this.W, this.H * 0.5) * 0.97;
            for (let i = 0; i < K; i++) {
                const a0 = i / K * TAU, a1 = (i + 1) / K * TAU;
                const R = this.R0 * this.ringMod((a0 + a1) * 0.5);
                const p0 = new V3(Math.cos(a0) * R, yC, Math.sin(a0) * R);
                const p1 = new V3(Math.cos(a1) * R, yC, Math.sin(a1) * R);
                const cap = new BABYLON.PhysicsShapeCapsule(p0, p1, r, this.scene);
                cap.material = { friction: cfg.friction, restitution: cfg.restitution };
                container.addChild(cap);
                parts.push(cap);
            }
            container.__parts = parts;
            return container;
        }

        get span() { return (this.R0 + this.W) * 2; }

        attach() {
            for (const m of this.parts) if (m.parent !== this.root) m.parent = this.root;
        }

        worldBounds() {
            let mnx = Infinity, mny = Infinity, mnz = Infinity;
            let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
            for (const m of this.parts) {
                m.computeWorldMatrix(true);
                const bb = m.getBoundingInfo().boundingBox;
                mnx = Math.min(mnx, bb.minimumWorld.x); mxx = Math.max(mxx, bb.maximumWorld.x);
                mny = Math.min(mny, bb.minimumWorld.y); mxy = Math.max(mxy, bb.maximumWorld.y);
                mnz = Math.min(mnz, bb.minimumWorld.z); mxz = Math.max(mxz, bb.maximumWorld.z);
            }
            return { mnx, mny, mnz, mxx, mxy, mxz };
        }

        dispose() {
            for (const m of this.parts) m.dispose();
            if (this.root) this.root.dispose();
            this.parts.length = 0;
        }
    }

    // =================================================================
    // 8. Plate （玉縁の皿）
    // =================================================================
    // 【対策】物理の当たり判定に薄い一枚板を使うと、落下速度によっては
    //         すり抜ける。表と裏を張って縁で閉じた「厚みのある器」に
    //         しておけば、静的トライメッシュでも安定して受け止められる
    function buildPlate(scene, cfg) {
        const M = cfg.plateSegments, K = cfg.plateRings;
        const TH = cfg.plateThick, RIM = cfg.plateRim, WELL = cfg.plateWell;
        const LIP = cfg.plateLip;
        const wellS = WELL / RIM;

        const prof = (s) => {
            const r = RIM * s;
            const y = LIP * smooth(wellS, wellS + 0.30, s) * 0.88
                + LIP * 0.12 * smooth(0.92, 1.0, s);
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
            const beadK = smooth(0.90, 1.0, s);
            for (let j = 0; j <= M; j++) {
                const phi = (j % M) / M * TAU;
                const cs = Math.cos(phi), sn = Math.sin(phi);
                const bead = cfg.plateBeadAmp * beadK * (0.5 + 0.5 * Math.cos(cfg.plateBeads * phi));
                const r = r0 + bead, y = y0 + bead * 0.35;
                const a = i * W + j, b = LAY + a;
                positions[a * 3] = r * cs; positions[a * 3 + 1] = y; positions[a * 3 + 2] = r * sn;
                const ro = r - nr * TH, yo = y - ny * TH;
                positions[b * 3] = ro * cs; positions[b * 3 + 1] = yo; positions[b * 3 + 2] = ro * sn;
                uvs[a * 2] = j / M; uvs[a * 2 + 1] = s;
                uvs[b * 2] = j / M; uvs[b * 2 + 1] = s;
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
        const mesh = makeMesh("plate", positions, indices, normals, uvs, null, scene);
        // 【対策】この皿は「見込み y=0 から下へ厚み TH」で作ってあるので、
        //         そのまま置くと見込みが地面（y=0）と同一平面になり、
        //         底一面が Z ファイティングを起こす。裏が接するまで持ち上げる
        mesh.position.y = TH;

        const m = new BABYLON.PBRMaterial("plateMat", scene);
        // 少し青みのある灰白。彩度を上げるとドーナツの補色になって主役を食う
        m.albedoColor = sRGB([0.780, 0.790, 0.788]);
        m.metallic = 0.0;
        m.roughness = 0.44;
        m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
        // 【対策】陶器の艶は素地の反射ではなく「釉薬の層」。roughness を
        //         下げて出すと濡れた石になる。クリアコートで層として乗せる
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.72;
        m.clearCoat.roughness = 0.095;
        m.backFaceCulling = false;
        m.twoSidedLighting = true;
        mesh.material = m;
        mesh.receiveShadows = true;
        return mesh;
    }

    // =================================================================
    // 9. Scene
    // =================================================================
    const baseCfg = Object.assign({}, GLOBAL);
    {
        const vw = (typeof window !== "undefined" && window.innerWidth) || 1024;
        if (vw < GLOBAL.compactWidth) { baseCfg.texW = 640; baseCfg.texH = 320; }
    }
    baseCfg.profile = new Profile(PROFILE_PTS, GLOBAL.segSect, GLOBAL.tubeW, GLOBAL.tubeH);
    baseCfg.texSeed = 40917;

    function typeConfig(typeKey) {
        const cfg = Object.assign({}, baseCfg, TYPES[typeKey]);
        cfg.type = typeKey;
        return cfg;
    }

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.895, 0.885, 0.872, 1);

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
        console.warn("[Donut] Havok を初期化できませんでした。物理なしで並べます。", err);
    }

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.65;
    scene.environmentIntensity = 0.82;

    const camera = new BABYLON.ArcRotateCamera("cam", -1.12, 1.02, 44, new V3(0, 1.8, 0), scene);
    camera.attachControl(true);
    camera.fov = 0.56;
    camera.wheelPrecision = 8;
    // 【対策】ポストプロセスを有効にするとシーンは 16bit 深度の RT へ描かれる。
    //         minZ を 0.1 のままにすると分解能が mm 台になり、グレーズと生地の
    //         0.2mm の隙間が互いに勝ったり負けたりして縞が出る
    camera.minZ = 5;
    camera.maxZ = 280;
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 130;
    camera.lowerBetaLimit = 0.05;
    camera.upperBetaLimit = 1.50;
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.42, -0.88, 0.58).normalize(), scene);
    key.position = new V3(18, 32, -20);
    key.intensity = 2.40;
    key.diffuse = new BABYLON.Color3(1.0, 0.982, 0.948);
    key.specular = new BABYLON.Color3(0.55, 0.53, 0.50);
    key.autoCalcShadowZBounds = true;

    const fillL = new BABYLON.DirectionalLight("fillL", new V3(0.88, -0.34, -0.52).normalize(), scene);
    fillL.intensity = 1.00;
    fillL.diffuse = new BABYLON.Color3(1.0, 0.968, 0.935);
    fillL.specular = new BABYLON.Color3(0.16, 0.155, 0.145);

    // 【対策】重なったドーナツの下と穴の中は真っ暗になる。クロスからの
    //         弱い返しが無いと、下敷きの1個が黒い輪に見える
    const bounce = new BABYLON.DirectionalLight("bounce", new V3(0.1, 1.0, 0.25).normalize(), scene);
    bounce.intensity = 0.38;
    bounce.diffuse = new BABYLON.Color3(0.98, 0.958, 0.920);
    bounce.specular = new BABYLON.Color3(0, 0, 0);

    const amb = new BABYLON.HemisphericLight("amb", new V3(0, 1, 0), scene);
    amb.intensity = 0.42;
    amb.diffuse = new BABYLON.Color3(1, 1, 1);
    amb.groundColor = new BABYLON.Color3(0.78, 0.76, 0.73);
    amb.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.useBlurExponentialShadowMap = true;
    sg.blurKernel = 32;
    sg.depthScale = 36;
    sg.darkness = 0.40;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.10;
    ip.contrast = 1.08;
    ip.vignetteEnabled = false;

    let ground = null;
    if (GLOBAL.showGround) {
        // 【対策】厚みゼロの床は当たり判定に使えない（すり抜ける）ので箱にする
        ground = BABYLON.MeshBuilder.CreateBox("ground",
            { width: 220, height: 2, depth: 220 }, scene);
        const gm = new BABYLON.PBRMaterial("groundMat", scene);
        gm.albedoTexture = TextureLab.linen(scene, 1024, 3131);
        gm.albedoTexture.uScale = 2.6; gm.albedoTexture.vScale = 2.6;
        gm.albedoTexture.anisotropicFilteringLevel = 8;
        gm.metallic = 0.0; gm.roughness = 0.92;
        gm.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;
        // 布は sheen が要る。無いと紙になる
        gm.sheen.isEnabled = true;
        gm.sheen.intensity = 0.30;
        gm.sheen.roughness = 0.85;
        gm.sheen.color = new BABYLON.Color3(0.86, 0.845, 0.815);
        ground.material = gm;
        ground.receiveShadows = true;
        ground.position.y = -1.0;
        if (physics) {
            new BABYLON.PhysicsAggregate(ground, BABYLON.PhysicsShapeType.BOX,
                { mass: 0, friction: 0.80, restitution: 0.01 }, scene);
        }
    }

    const plate = buildPlate(scene, GLOBAL);
    if (physics) {
        const pShape = new BABYLON.PhysicsShapeMesh(plate, scene);
        pShape.material = { friction: 0.88, restitution: 0.0 };
        const pBody = new BABYLON.PhysicsBody(plate, BABYLON.PhysicsMotionType.STATIC, false, scene);
        pBody.shape = pShape;
    }

    // =================================================================
    //  生成と投入
    // =================================================================
    // 【対策】生地のテクスチャは全種で共有。組み立てのたびに焼き直すと
    //         ボタンを押すたびに 1 秒固まる
    const doughSkin = new DoughSkin(scene, baseCfg);
    const glazeCache = {};
    function glazeFor(typeKey) {
        if (!TYPES[typeKey].glaze) return null;
        let s = glazeCache[typeKey];
        if (!s) { s = new GlazeSkin(scene, typeKey, TYPES[typeKey].glaze); glazeCache[typeKey] = s; }
        return s;
    }

    let items = [], curMode = START_MODE, curSeed = START_SEED;
    let onRebuilt = null;
    let queue = [], dropIndex = 0, dropTimer = 0, settleTimer = 0, postDropTimer = 0, frozen = false;

    function plateInnerY(r) {
        const s = clamp(r / GLOBAL.plateRim, 0, 1);
        const wellS = GLOBAL.plateWell / GLOBAL.plateRim;
        return GLOBAL.plateThick
            + GLOBAL.plateLip * smooth(wellS, wellS + 0.30, s) * 0.88
            + GLOBAL.plateLip * 0.12 * smooth(0.92, 1.0, s);
    }

    // 【対策】山全体の頂点を基準にすると、外側へ置く物まで山の高さぶん
    //         持ち上げられ、皿の縁の上から落ちてくることになる。
    //         水平方向に重なっている物だけを見る
    function localTopY(x, z, rh) {
        let top = plateInnerY(Math.hypot(x, z));
        for (let i = 0; i < dropIndex; i++) {
            const b = queue[i].e.worldBounds();
            const cx = (b.mnx + b.mxx) * 0.5, cz = (b.mnz + b.mxz) * 0.5;
            const ex = (b.mxx - b.mnx) * 0.5, ez = (b.mxz - b.mnz) * 0.5;
            if (Math.hypot(x - cx, z - cz) < rh + Math.max(ex, ez)) top = Math.max(top, b.mxy);
        }
        return top;
    }

    function clearBodies() {
        for (const it of queue) {
            if (it.body) it.body.dispose();
            if (it.shape) {
                const ch = it.shape.__parts;
                it.shape.dispose();
                if (ch) for (const c of ch) { try { c.dispose(); } catch (e) { } }
            }
        }
        queue = []; dropIndex = 0; dropTimer = 0;
        settleTimer = 0; postDropTimer = 0; frozen = false;
    }

    // 【対策】全部を同時に生成すると、初期状態で互いにめり込んでいるぶんの
    //         反発が一気に解放されて弾け飛ぶ。1個ずつ、山の頂点のすぐ上から放す
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

        const shape = e.colliderShape();
        const body = new BABYLON.PhysicsBody(e.root, BABYLON.PhysicsMotionType.DYNAMIC, false, scene);
        body.shape = shape;
        body.setMassProperties({ mass: GLOBAL.pieceMass });
        // 【対策】damping は PhysicsAggregate のオプションに書いても効かない
        body.setLinearDamping(GLOBAL.linearDamping);
        body.setAngularDamping(GLOBAL.angularDamping);
        // 【対策】毎フレーム「ノードの姿勢 → 物理ボディ」へ書き戻すと、
        //         物理が出した結果を読み直して押し込む往復が起きる
        body.disablePreStep = true;
        it.shape = shape; it.body = body;
        dropIndex++;
    }

    function resetDrop(seed) {
        clearBodies();
        const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
        const a0 = rng.range(0, TAU);
        for (let i = 0; i < items.length; i++) {
            const e = items[i];
            // 【対策】物理で動かすノードは rotationQuaternion を使う。
            //         Euler の rotation のままだと Havok 側の姿勢と食い違う
            // 【対策】ドーナツは転がるので、全部を水平に放すと綺麗に平積みに
            //         なって「並べた」に見える。1/6 は大きく傾けて放すと、
            //         立てかかったり穴に嵌ったりが起きる。
            //         ただし裏返してよいのはプレーンだけ。グレーズを伏せると
            //         せっかく掛けたものが全部見えなくなる
            const flip = (!e.cfg.glaze && i % 3 === 1) ? Math.PI : 0;
            const steep = (i % 6 === 4) ? rng.range(0.7, 1.25) : 0;
            e.root.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
                flip + steep + rng.gauss(0, 0.26), rng.range(0, TAU), rng.gauss(0, 0.26));
            const r = GLOBAL.plateWell * 0.50 * Math.sqrt(rng.next());
            const a = a0 + i * 2.39996;                 // 黄金角
            queue.push({ e, x: Math.cos(a) * r, z: Math.sin(a) * r, body: null, shape: null });
            if (physics) e.root.setEnabled(false);
        }
        if (physics) {
            dropTimer = GLOBAL.dropInterval;
        } else {
            const cols = Math.ceil(Math.sqrt(items.length));
            for (let i = 0; i < items.length; i++) {
                const e = items[i], d = e.span * 1.10;
                e.root.rotationQuaternion = BABYLON.Quaternion.Identity();
                e.root.position.set(
                    ((i % cols) - (cols - 1) / 2) * d,
                    GLOBAL.plateThick,
                    (Math.floor(i / cols) - (cols - 1) / 2) * d);
            }
        }
        if (onRebuilt) onRebuilt();
    }

    function build(modeKey, seed) {
        clearBodies();
        for (const it of items) it.dispose();
        items = [];
        const rng = new Rng((seed * 2654435761) >>> 0);

        const plan = [];
        if (modeKey === "assort") {
            for (let i = 0; i < GLOBAL.count; i++) plan.push(ASSORT[i % ASSORT.length]);
            for (let i = plan.length - 1; i > 0; i--) {
                const j = rng.int(i + 1);
                const t = plan[i]; plan[i] = plan[j]; plan[j] = t;
            }
        } else {
            for (let i = 0; i < GLOBAL.count; i++) plan.push(modeKey);
        }

        for (let i = 0; i < plan.length; i++) {
            const cfg = typeConfig(plan[i]);
            const e = new Donut(scene, cfg, (seed + i * 7919) >>> 0, doughSkin, glazeFor(plan[i]));
            e.attach();
            items.push(e);
        }

        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        for (const e of items) for (const m of e.parts) sg.addShadowCaster(m, true);
        sg.addShadowCaster(plate, true);

        camera.target.set(0, GLOBAL.plateLip * 0.6, 0);
        camera.radius = GLOBAL.plateRim * 2.75;

        resetDrop(seed);
        console.log("[Donut]", BUILD, "/", modeKey, "/ seed =", seed >>> 0, "/", items.length, "個");
    }

    build(START_MODE, START_SEED);

    scene.onBeforeRenderObservable.add(() => {
        if (!physics || frozen || queue.length === 0) return;
        const dt = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
        if (dropIndex < queue.length) {
            dropTimer += dt;
            if (dropTimer >= GLOBAL.dropInterval) {
                dropTimer = 0; spawnNext();
                if (onRebuilt) onRebuilt();
            }
            return;
        }
        if (!GLOBAL.freezeWhenSettled) return;
        postDropTimer += dt;
        // 【対策】静止後もソルバの残差で微振動が続く。速度がしきい値を
        //         下回った状態が続いたら STATIC に固定して止める
        let moving = false;
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
        // 【対策】穴の中と重なった接触部に影が入らないと、全部が同じ平面に
        //         貼りついて見える。気泡と割れ目の陰りもここが効く
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.8, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.62;
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
    dp.bloomThreshold = 0.94;
    dp.bloomWeight = 0.050;
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
        idle: "#2b2018", active: "#a06a2e", edge: "#4d3c2c",
        text: "#f7efe3", sub: "#c8ae8d", accent: "#e6b273"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "256px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(22,15,10,0.82)";
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
        b.height = "30px"; b.paddingBottom = "5px";
        b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 13;
        b.onPointerUpObservable.add(onClick);
        panel.addControl(b);
        return b;
    }

    addLabel("BAKED DONUTS", 11, COL.sub, "18px");
    addLabel("種類", 13, COL.accent, "22px");

    const modeBtns = {}, countBtns = {};
    function highlight() {
        for (const k in modeBtns) modeBtns[k].background = (k === curMode) ? COL.active : COL.idle;
        for (const k in countBtns) countBtns[k].background = (+k === GLOBAL.count) ? COL.active : COL.idle;
    }
    modeBtns["assort"] = addButton("m_assort", "詰め合わせ", () => {
        curMode = "assort"; build(curMode, curSeed); highlight();
    });
    for (const k of Object.keys(TYPES)) {
        modeBtns[k] = addButton("m_" + k, TYPES[k].label, () => {
            curMode = k; build(curMode, curSeed); highlight();
        });
    }

    addLabel("盛る量", 13, COL.accent, "26px");
    const COUNTS = [4, 7, 11];
    for (let ci = 0; ci < COUNTS.length; ci++) {
        const c = COUNTS[ci];
        countBtns[c] = addButton("c" + c, ["少なめ", "ふつう", "多め"][ci], () => {
            GLOBAL.count = c; build(curMode, curSeed); highlight();
        });
    }

    const sp = new BABYLON.GUI.Rectangle();
    sp.height = "8px"; sp.thickness = 0; sp.background = "";
    panel.addControl(sp);

    addButton("drop", "盛り直す", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        resetDrop(curSeed);
    });
    addButton("reseed", "別の個体を焼く", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(curMode, curSeed); highlight();
    });
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

    const info = addLabel("", 12, COL.sub, "46px");
    onRebuilt = () => {
        if (!info) return;
        const e = items[0];
        if (!e) { info.text = ""; return; }
        const state = !physics ? "物理なし"
            : (dropIndex < queue.length ? "投入中 " + dropIndex + "/" + queue.length
                : (frozen ? "静止" : "落下中"));
        const kinds = new Set(items.map(x => x.cfg.label));
        const what = curMode === "assort" ? kinds.size + "種" : TYPES[curMode].label;
        info.text = state + " / " + items.length + "個 / " + what + "\n"
            + "外径 " + ((e.R0 + e.W) * 2).toFixed(1) + "cm 高さ " + e.H.toFixed(2)
            + "cm  seed: " + curSeed;
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