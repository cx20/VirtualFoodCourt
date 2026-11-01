// =====================================================================
//  Photoreal Choco-Banana  /  写実的なチョコバナナ
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  構成:
//    0. CONFIG      … コーティング（ミルク / ストロベリー / ミント / ホワイト / ビター）
//                     とスプレー（カラフル / チョコ / なし）のプリセット
//    1. Rng / Noise … シード付き乱数・3D 値ノイズ
//    2. Mesh utils  … 巻き順の自動判定・法線の溶接
//    3. TextureLab  … 穴あき板（合板＋穴）・割り箸の木目
//    4. Banana      … 中心線（弧）× 断面（五角気味）× コーティングの厚み
//    5. Sprinkles   … 濡れたチョコに「上から振りかけて」付いた位置だけに置く
//    6. Scene       … 屋台の穴あき台に一列に刺す
//    7. GUI / Debug
//
//  実物の要点（参考写真から）:
//    ・バナナは真っ直ぐではなく弧。しかも断面は丸ではなく、むいた実でも
//      4〜5 本のゆるい稜が残る。コーティングで稜は鈍るが消えはしない
//    ・チョコは「先端を下にして」引き上げて垂らすので、先端側ほど厚く、
//      先端に滴が溜まり、先端へ向かって縦の垂れ筋が残る
//    ・カラースプレーは全周には付かない。横にして上から振るので、
//      上を向いていた背（凸側）と片側の肩にだけ密に付き、腹（凹側）は
//      チョコの地のまま。写真でも手前下側はつやのある茶色一色
//    ・スプレーは乾く前のチョコに半分沈む。表面に置いただけにすると
//      乗っているだけの粒に見える
//    ・割り箸は根元（軸の切り口）から 5cm ほど刺さっていて、台の穴へ
//      ほぼ垂直に立つ。完全に揃えると工場製品になるので数度ずつ傾ける
// =====================================================================

var createScene = async function () {
    const BUILD = "チョコバナナ-2026-10-09-d";

    // =================================================================
    // 0. CONFIG （単位は cm）
    // =================================================================
    // 色は sRGB で書き、使う直前にリニアへ変換する
    const COATS = {
        milk: {
            label: "ミルクチョコ",
            // 写真の拡散部（ハイライトを避けた所）を白で正規化して、露出ぶん戻した値
            base: [0.365, 0.200, 0.135], deep: [0.275, 0.142, 0.095],
            rough: 0.30, coat: 0.80, coatRough: 0.09, sss: 0.10,
            showThrough: 0.0
        },
        bitter: {
            label: "ビター",
            base: [0.205, 0.118, 0.085], deep: [0.150, 0.082, 0.060],
            rough: 0.27, coat: 0.85, coatRough: 0.08, sss: 0.06,
            showThrough: 0.0
        },
        pink: {
            label: "ストロベリー",
            // 【対策】パステルのコーチングは色が浅いぶん、薄い所でバナナの
            //         クリーム色が透ける。均一に塗ると発泡スチロールに見える
            base: [0.945, 0.600, 0.650], deep: [0.900, 0.505, 0.570],
            rough: 0.36, coat: 0.55, coatRough: 0.14, sss: 0.30,
            showThrough: 0.30
        },
        mint: {
            label: "ミント",
            base: [0.640, 0.850, 0.790], deep: [0.540, 0.790, 0.725],
            rough: 0.36, coat: 0.55, coatRough: 0.14, sss: 0.30,
            showThrough: 0.30
        },
        white: {
            label: "ホワイト",
            base: [0.940, 0.890, 0.780], deep: [0.900, 0.835, 0.700],
            rough: 0.34, coat: 0.60, coatRough: 0.12, sss: 0.40,
            showThrough: 0.18
        }
    };

    const SPRINKLES = {
        rainbow: {
            label: "カラフル",
            // ジミー（棒状のカラースプレー）。写真で多い順に重みを付ける
            colors: [
                [[0.965, 0.420, 0.620], 1.2],   // ピンク
                [[0.985, 0.860, 0.250], 1.1],   // 黄
                [[0.965, 0.945, 0.905], 1.0],   // 白
                [[0.985, 0.540, 0.170], 0.8],   // 橙
                [[0.420, 0.780, 0.360], 0.8],   // 黄緑
                [[0.300, 0.560, 0.930], 0.8],   // 青
                [[0.610, 0.380, 0.800], 0.7],   // 紫
                [[0.880, 0.190, 0.240], 0.7]    // 赤
            ],
            rough: 0.48
        },
        choco: {
            label: "チョコ",
            colors: [
                [[0.230, 0.130, 0.090], 1.0],
                [[0.330, 0.190, 0.120], 1.0],
                [[0.120, 0.075, 0.055], 0.6]
            ],
            rough: 0.40
        },
        none: { label: "なし", colors: [], rough: 0.5 }
    };

    // 並べ方。写真は左奥からミント3・ピンク2・ミルク7
    const LINEUPS = {
        photo: { label: "写真の並び", list: ["mint", "mint", "mint", "pink", "pink",
            "milk", "milk", "milk", "milk", "milk", "milk", "milk"] },
        milk: { label: "全部ミルク", list: ["milk"] },
        mix: { label: "いろいろ", list: ["milk", "pink", "bitter", "mint", "white", "milk"] }
    };

    const CONFIG = {
        count: 12,
        lineup: "photo",
        sprinkle: "rainbow",

        banana: {
            length: 15.0,        // 中心線の長さ（むいた実）
            radius: 1.62,        // 最大半径
            bend: 1.85,          // 中心線の曲がり（rad）。実効の曲がりはこの 0.75 倍
                                 // 【対策】0.95 では全体で 40° しか曲がらず、太いきゅうりに見えた
            maxAt: 0.54,         // 最も太い位置
            pBase: 1.75,         // 根元側の絞り（小さいほど首が細い）
            pTip: 2.70,          // 先端側の丸み（大きいほど鈍い）
            ridgeK: 5, ridgeAmp: 0.030,
            segAxis: 170, segRound: 88
        },
        coatT: 0.15,             // 平均の塗り厚
        coatVar: 0.05,           // 塗りムラ
        drip: 0.11,              // 先端側の垂れ筋
        tipDrop: 0.32,           // 先端の滴

        sprinkle_: {
            density: 11.0,        // 付着側での本数 / cm²
            len: [0.42, 0.68], dia: [0.105, 0.130],
            sink: [0.20, 0.55]   // 直径に対する沈み込み
        },

        // enter / reach: 棒が背の皮の内側を通る下と上の位置（根元からの割合）
        // inset: 背の表面からの深さ、lean: 棒の傾き
        stick: { dia: 0.56, visible: 7.0, inBoard: 1.6, enter: [0.20, 0.26], reach: [0.84, 0.89], inset: 0.55, lean: 0.22 },
        board: { w: 128, d: 56, thick: 2.4, pitch: 1.8, hole: 0.25 },
        spacingHoles: 3,         // 何穴おきに刺すか（5.4cm。2穴だと隣の実と当たる）

        textureBoard: 2048,
        useSSAO: true,
        useDOF: true, dofRatio: 0.060, dofFStop: 2.8,
        guiOwnCamera: false,     // 既定は false（Inspector のデバッグ表示を壊さない）
        compactWidth: 700, compactMinSide: 480, guiMaxScale: 2.2
    };

    const START_SEED = 20261009;

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const lin = (c) => [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)];

    // mesh.name と mesh.id を必ず一意にする（Inspector の選択が先頭に吸われるのを防ぐ）
    const _ids = {};
    function named(obj, base) {
        const n = (_ids[base] = (_ids[base] || 0) + 1);
        const nm = n === 1 ? base : base + "_" + n;
        obj.name = nm; obj.id = nm;
        return obj;
    }

    // =================================================================
    // 1. Rng / Noise
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
    }

    // 【対策】閉じた立体なので UV でノイズを引くと継ぎ目と極に筋が出る。
    //         すべて 3D 空間で評価する
    const Noise = {
        _h3(x, y, z, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263)
                ^ Math.imul(z | 0, 1440662683) ^ Math.imul(seed | 0, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
            return (h >>> 0) / 4294967295;
        },
        v3(x, y, z, seed) {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            const xf = x - xi, yf = y - yi, zf = z - zi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
            const h = this._h3.bind(this);
            const a = mix(h(xi, yi, zi, seed), h(xi + 1, yi, zi, seed), u);
            const b = mix(h(xi, yi + 1, zi, seed), h(xi + 1, yi + 1, zi, seed), u);
            const c = mix(h(xi, yi, zi + 1, seed), h(xi + 1, yi, zi + 1, seed), u);
            const d = mix(h(xi, yi + 1, zi + 1, seed), h(xi + 1, yi + 1, zi + 1, seed), u);
            return mix(mix(a, b, v), mix(c, d, v), w);
        },
        fbm3(x, y, z, seed, oct) {
            let s = 0, a = 0.5, f = 1, n = 0;
            for (let o = 0; o < oct; o++) {
                s += a * this.v3(x * f, y * f, z * f, seed + o * 131); n += a; f *= 2.03; a *= 0.5;
            }
            return s / n;
        },
        // 2D（板・棒のテクスチャ用）
        v2(x, y, seed) { return this.v3(x, y, 0.5, seed); },
        fbm2(x, y, seed, oct) { return this.fbm3(x, y, 0.5, seed, oct); }
    };

    // =================================================================
    // 2. Mesh utils
    // =================================================================
    // 【対策】巻き順は決め打ちしない。全頂点の総和で外向きか判定し、負なら反転
    function finalize(positions, indices) {
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        const n = positions.length / 3;
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < n; i++) { cx += positions[i * 3]; cy += positions[i * 3 + 1]; cz += positions[i * 3 + 2]; }
        cx /= n; cy /= n; cz /= n;
        let acc = 0;
        for (let i = 0; i < n; i++) {
            acc += normals[i * 3] * (positions[i * 3] - cx) + normals[i * 3 + 1] * (positions[i * 3 + 1] - cy)
                + normals[i * 3 + 2] * (positions[i * 3 + 2] - cz);
        }
        finalize.lastFlipped = acc < 0;
        if (acc < 0) {
            for (let i = 0; i < indices.length; i += 3) { const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t; }
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        return normals;
    }

    function weldNormals(positions, normals) {
        const map = new Map(), n = positions.length / 3;
        for (let i = 0; i < n; i++) {
            const k = Math.round(positions[i * 3] * 8192) + "," + Math.round(positions[i * 3 + 1] * 8192) + "," + Math.round(positions[i * 3 + 2] * 8192);
            let a = map.get(k); if (!a) { a = []; map.set(k, a); } a.push(i);
        }
        for (const a of map.values()) {
            if (a.length < 2) continue;
            let nx = 0, ny = 0, nz = 0;
            for (const i of a) { nx += normals[i * 3]; ny += normals[i * 3 + 1]; nz += normals[i * 3 + 2]; }
            const l = Math.hypot(nx, ny, nz) || 1;
            for (const i of a) { normals[i * 3] = nx / l; normals[i * 3 + 1] = ny / l; normals[i * 3 + 2] = nz / l; }
        }
    }

    function makeMesh(base, positions, indices, normals, uvs, colors, scene) {
        const mesh = named(new BABYLON.Mesh(base, scene), base);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals;
        if (uvs) vd.uvs = uvs;
        if (colors) vd.colors = colors;
        vd.applyToMesh(mesh, false);
        // 【対策】stride 4 の頂点カラーで hasVertexAlpha が立つと透過パスへ回される
        mesh.hasVertexAlpha = false;
        return mesh;
    }

    // =================================================================
    // 3. TextureLab
    // =================================================================
    const TextureLab = {
        _tex(base, w, h, fill, scene, linear) {
            w = Math.max(8, Math.round(w) || 512); h = Math.max(8, Math.round(h) || 512);
            const dt = new BABYLON.DynamicTexture(base, { width: w, height: h }, scene, true);
            named(dt, base);
            const ctx = dt.getContext();
            const img = ctx.createImageData(w, h);
            fill(img.data, w, h);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = false;
            if (linear) dt.gammaSpace = false;
            dt.anisotropicFilteringLevel = 8;
            return dt;
        },

        // 屋台の穴あき台（合板）。高さ場を1枚作り、アルベド / ORM / 法線で共有する
        // 【対策】穴は板の木目と別のノイズで描くと、穴だけ浮いたシールに見える。
        //         同じ高さ場から陰りも粗さも引く
        board(scene, cfg) {
            const B = cfg.board, W = cfg.textureBoard, H = Math.round(W * B.d / B.w);
            const pxPerCm = W / B.w;
            const hf = new Float32Array(W * H), hole = new Float32Array(W * H), grain = new Float32Array(W * H);
            for (let y = 0; y < H; y++) {
                const z = (y + 0.5) / pxPerCm - B.d / 2;
                for (let x = 0; x < W; x++) {
                    const wx = (x + 0.5) / pxPerCm - B.w / 2;
                    const i = y * W + x;
                    // 木目は x 方向に長く流れる（合板の表板）
                    const warp = 1.4 * (Noise.fbm2(wx * 0.035, z * 0.10, 71, 3) - 0.5);
                    const g = Noise.fbm2(wx * 0.022, (z + warp) * 1.25, 73, 4);
                    const ring = 0.5 + 0.5 * Math.sin((z + warp * 2.2) * 2.6 + g * 7.0);
                    grain[i] = clamp(0.65 * g + 0.35 * smooth(0.65, 0.98, ring), 0, 1);
                    // 穴
                    const hx = wx / B.pitch, hz = z / B.pitch;
                    const dx = (hx - Math.round(hx)) * B.pitch, dz = (hz - Math.round(hz)) * B.pitch;
                    const d = Math.hypot(dx, dz);
                    const inHole = 1 - smooth(B.hole - 0.04, B.hole + 0.02, d);
                    const chamfer = smooth(B.hole - 0.02, B.hole + 0.06, d) * (1 - smooth(B.hole + 0.06, B.hole + 0.16, d));
                    hole[i] = inHole;
                    hf[i] = 0.5 + 0.03 * (grain[i] - 0.5) - 0.45 * inHole - 0.08 * chamfer;
                }
            }
            // 写真の合板はかなり白っぽい（日差しで飛んでいる分を差し引いても）
            const PALE = [0.930, 0.835, 0.680], DARK = [0.870, 0.745, 0.565], HOLE = [0.20, 0.13, 0.08];
            const albedo = this._tex("boardAlbedo", W, H, (d) => {
                for (let i = 0; i < W * H; i++) {
                    const g = grain[i], k = smooth(0.25, 0.85, g);
                    let r = mix(PALE[0], DARK[0], k), gg = mix(PALE[1], DARK[1], k), b = mix(PALE[2], DARK[2], k);
                    // 穴の縁は手垢と削れでわずかに暗い
                    const rim = clamp((0.5 - hf[i]) * 2.5, 0, 1) * (1 - hole[i]);
                    r *= 1 - 0.25 * rim; gg *= 1 - 0.28 * rim; b *= 1 - 0.32 * rim;
                    // 穴の中は奥ほど暗い
                    const hk = hole[i];
                    r = mix(r, HOLE[0], hk); gg = mix(gg, HOLE[1], hk); b = mix(b, HOLE[2], hk);
                    d[i * 4] = r * 255; d[i * 4 + 1] = gg * 255; d[i * 4 + 2] = b * 255; d[i * 4 + 3] = 255;
                }
            }, scene, false);
            const orm = this._tex("boardORM", W, H, (d) => {
                for (let i = 0; i < W * H; i++) {
                    d[i * 4] = (1 - 0.7 * hole[i]) * 255;              // AO
                    d[i * 4 + 1] = (0.62 + 0.10 * grain[i]) * 255;      // 粗さ
                    d[i * 4 + 2] = 0; d[i * 4 + 3] = 255;
                }
            }, scene, true);
            const normal = this._normal("boardNormal", W, H, hf, 6.0, scene);
            return { albedo, orm, normal };
        },

        _normal(base, W, H, hf, k, scene) {
            return this._tex(base, W, H, (d) => {
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                    const xl = hf[y * W + Math.max(0, x - 1)], xr = hf[y * W + Math.min(W - 1, x + 1)];
                    const yu = hf[Math.max(0, y - 1) * W + x], yd = hf[Math.min(H - 1, y + 1) * W + x];
                    let nx = (xl - xr) * k, ny = (yd - yu) * k, nz = 1;
                    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                    const i = (y * W + x) * 4;
                    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
                }
            }, scene, true);
        },

        // 割り箸（白木）。繊維が軸方向に走る
        stick(scene) {
            const W = 64, H = 512;
            return this._tex("stickAlbedo", W, H, (d) => {
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                    const u = x / W, v = y / H;
                    // u は周方向で折り返す必要があるので cos/sin で引く
                    const cx = Math.cos(u * TAU) * 1.6, cz = Math.sin(u * TAU) * 1.6;
                    const fib = Noise.fbm3(cx * 3.0, v * 1.2, cz * 3.0, 91, 3);
                    const fine = Noise.fbm3(cx * 9.0, v * 6.0, cz * 9.0, 97, 2);
                    const k = 0.6 * fib + 0.4 * fine;
                    const r = mix(0.93, 0.80, k), g = mix(0.83, 0.66, k), b = mix(0.66, 0.47, k);
                    const i = (y * W + x) * 4;
                    d[i] = r * 255; d[i + 1] = g * 255; d[i + 2] = b * 255; d[i + 3] = 255;
                }
            }, scene, false);
        },

        // 背景の棚（暗めの古材）。被写界深度で大きくボケるので解像度は要らない
        backWood(scene) {
            const W = 512, H = 256;
            return this._tex("backWood", W, H, (d) => {
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
                    const g = Noise.fbm2(x * 0.004, y * 0.09, 131, 4);
                    const k = smooth(0.3, 0.8, g);
                    const i = (y * W + x) * 4;
                    d[i] = mix(0.58, 0.44, k) * 255; d[i + 1] = mix(0.50, 0.36, k) * 255; d[i + 2] = mix(0.44, 0.31, k) * 255; d[i + 3] = 255;
                }
            }, scene, false);
        }
    };

    // =================================================================
    // 4. Banana
    // =================================================================
    // 中心線は YZ 平面内の弧。根元 s=0 が原点で、接線は (0, cosφ, sinφ)。
    // φ は -bend/2 → +bend/2 と増えるので、曲率中心は +Z 側＝凹側（腹）が +Z、
    // 凸側（背）が −Z。断面の基底は B=(1,0,0) 系と N（腹向き）。
    class Banana {
        constructor(scene, coatKey, seed, sprinkleKey) {
            this.scene = scene;
            this.coatKey = coatKey;
            this.C = COATS[coatKey];
            this.seed = seed >>> 0;
            const rng = this.rng = new Rng(this.seed);
            const P = CONFIG.banana;
            this.nseed = (this.seed % 100000) | 0;

            // 個体差。バナナは1本ずつ太さも曲がりもかなり違う
            this.L = P.length * rng.range(0.90, 1.08);
            this.R = P.radius * rng.range(0.92, 1.07);
            this.bend = P.bend * rng.range(0.78, 1.18);
            this.maxAt = P.maxAt + rng.range(-0.04, 0.04);
            this.pBase = P.pBase * rng.range(0.92, 1.08);
            this.pTip = P.pTip * rng.range(0.92, 1.08);
            this.ridgePh = rng.range(0, TAU);
            this.flatPh = rng.range(0, TAU);
            this.side = rng.range(0, TAU) < Math.PI ? 1 : -1;
            this.sideBend = rng.gauss(0, 0.05);       // 横方向のわずかな曲がり
            this.coatMean = CONFIG.coatT * rng.range(0.85, 1.15);
            // 塗り厚ぶん両端を延長して丸め込む（端で半径 0 に落ちて閉じる）
            this.e0 = (this.coatMean + 0.05) / this.L;
            this.e1 = (this.coatMean + CONFIG.tipDrop * rng.range(0.7, 1.3)) / this.L;

            this.parts = [];
            this.root = named(new BABYLON.TransformNode("bananaRoot", scene), "bananaRoot");
            this._buildCenterline();
            this.sprinkleKey = sprinkleKey;
            this.plainBelow = rng.range(0.22, 0.34);
            this._buildBody();
        }

        // ---- 中心線 -----------------------------------------------------
        _buildCenterline() {
            const NS = 600, ds = 1 / NS;
            const P = new Float32Array((NS + 1) * 3), T = new Float32Array((NS + 1) * 3);
            let x = 0, y = 0, z = 0;
            for (let i = 0; i <= NS; i++) {
                const s = i / NS;
                // 【対策】一定曲率の弧だと定規で曲げたパイプに見える。実物は
                //         中ほどが最も曲がり、両端は比較的まっすぐ
                const phi = this.bend * (s - 0.5) * (1 + 0.25 * Math.cos(Math.PI * (s - 0.5) * 2)) / 1.0;
                const psi = this.sideBend * Math.sin(Math.PI * s);
                let tx = Math.sin(psi), ty = Math.cos(phi) * Math.cos(psi), tz = Math.sin(phi) * Math.cos(psi);
                const l = Math.hypot(tx, ty, tz); tx /= l; ty /= l; tz /= l;
                P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
                T[i * 3] = tx; T[i * 3 + 1] = ty; T[i * 3 + 2] = tz;
                x += tx * ds * this.L; y += ty * ds * this.L; z += tz * ds * this.L;
            }
            this._clP = P; this._clT = T; this._NS = NS;
        }

        // s は [0,1] の外（塗り厚の延長部）も受け付け、端の接線で外挿する
        frame(s) {
            const NS = this._NS, P = this._clP, T = this._clT;
            const sc = clamp(s, 0, 1), a = sc * NS;
            const i0 = Math.min(NS - 1, Math.floor(a)), f = a - i0, i1 = i0 + 1;
            let px = mix(P[i0 * 3], P[i1 * 3], f), py = mix(P[i0 * 3 + 1], P[i1 * 3 + 1], f), pz = mix(P[i0 * 3 + 2], P[i1 * 3 + 2], f);
            let tx = mix(T[i0 * 3], T[i1 * 3], f), ty = mix(T[i0 * 3 + 1], T[i1 * 3 + 1], f), tz = mix(T[i0 * 3 + 2], T[i1 * 3 + 2], f);
            let tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
            const ex = (s - sc) * this.L;
            px += tx * ex; py += ty * ex; pz += tz * ex;
            // N = X × T（腹向き）, B = T × N
            let nx = 0, ny = -tz, nz = ty;
            const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
            const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
            return { px, py, pz, tx, ty, tz, nx, ny, nz, bx, by, bz };
        }

        // 半径の形（0〜1）。u は延長込みの全長での位置
        profile(u) {
            const m = this.maxAt;
            const q = u < m ? (m - u) / m : (u - m) / (1 - m);
            const p = u < m ? this.pBase : this.pTip;
            let r = Math.pow(Math.max(0, 1 - Math.pow(q, p)), 0.5);
            // 根元は軸（果柄）の名残りで首が細い
            if (u < m) r *= 1 - 0.14 * smooth(0.55, 0.95, q);
            return r;
        }

        // 表面上の点。sx は 0〜1（延長込み）、th は周方向角
        surface(sx, th, out) {
            const s = mix(-this.e0, 1 + this.e1, sx);       // 中心線上の位置
            const F = this.frame(s);
            const env = this.profile(sx);
            const C = CONFIG, cs = Math.cos(th), sn = Math.sin(th);
            const endFade = smooth(0.0, 0.16, Math.min(sx, 1 - sx));
            const P = CONFIG.banana;
            // むいた実の稜（五角気味）と、わずかな扁平
            let r = this.R * env * (1 + P.ridgeAmp * Math.cos(P.ridgeK * th + this.ridgePh) * endFade
                + 0.035 * Math.cos(2 * th + this.flatPh) * endFade);
            // 外向き方向
            const dx = cs * F.bx + sn * F.nx, dy = cs * F.by + sn * F.ny, dz = cs * F.bz + sn * F.nz;
            // ---- 塗り厚 ---------------------------------------------------
            const bx = F.px + dx * r, by = F.py + dy * r, bz = F.pz + dz * r;
            const mott = Noise.fbm3(bx * 0.55, by * 0.55, bz * 0.55, this.nseed + 11, 3) - 0.5;
            let coat = this.coatMean + C.coatVar * 2 * mott;
            // 【対策】先端を下にして垂らすので、先端へ向かう縦筋になる。
            //         周方向を cos/sin で引けば継ぎ目なしに縦に伸びた筋が出る
            const streak = Noise.fbm3(cs * 3.4, sn * 3.4, sx * 1.3, this.nseed + 23, 2);
            const tipZone = smooth(0.42, 0.97, sx);
            const drip = C.drip * tipZone * smooth(0.50, 0.78, streak);
            coat += drip;
            // 乾く途中の細かなさざ波（照りの映り込みを揺らす）
            coat += 0.010 * (Noise.v3(bx * 5.5, by * 5.5, bz * 5.5, this.nseed + 29) - 0.5) * 2;
            // 【対策】塗り厚を一定のまま足すと端で穴が開く。包絡（√env）を掛けて
            //         端では必ず半径 0 に落とし、両極で閉じさせる
            const rt = r + (coat - this.coatMean) * Math.sqrt(env) + this.coatMean * env;
            out.x = F.px + dx * rt; out.y = F.py + dy * rt; out.z = F.pz + dz * rt;
            out.coat = coat; out.drip = drip; out.mott = mott;
            out.dx = dx; out.dy = dy; out.dz = dz;
            out.s = s;
            return out;
        }

        _buildBody() {
            const P = CONFIG.banana, N = P.segAxis, M = P.segRound;
            const W = M + 1, total = N * W;
            const pos = new Float32Array(total * 3), uvs = new Float32Array(total * 2), col = new Float32Array(total * 4);
            const C = this.C, base = lin(C.base), deep = lin(C.deep), cream = lin([0.94, 0.87, 0.64]);
            const tone = this.rng.range(0.94, 1.06);
            const o = {};
            for (let i = 0; i < N; i++) {
                // 【対策】両極は曲率が大きいので輪を詰める（等間隔だと先端が角張る）
                const t = i / (N - 1);
                const sx = 0.5 - 0.5 * Math.cos(Math.PI * t) * 0.35 + (t - 0.5) * 0.65;
                for (let j = 0; j <= M; j++) {
                    const th = (j % M) / M * TAU;
                    this.surface(sx, th, o);
                    const k = i * W + j;
                    pos[k * 3] = o.x; pos[k * 3 + 1] = o.y; pos[k * 3 + 2] = o.z;
                    uvs[k * 2] = j / M; uvs[k * 2 + 1] = sx;
                    // 色：厚い所ほど深い色。パステルは薄い所でバナナが透ける
                    const thick = smooth(0.08, 0.26, o.coat);
                    const kk = clamp(0.35 + 0.65 * thick + 0.6 * o.mott, 0, 1);
                    let r = mix(base[0], deep[0], kk * 0.7), g = mix(base[1], deep[1], kk * 0.7), b = mix(base[2], deep[2], kk * 0.7);
                    const thin = (1 - smooth(0.07, 0.15, o.coat)) * C.showThrough;
                    r = mix(r, cream[0], thin); g = mix(g, cream[1], thin); b = mix(b, cream[2], thin);
                    col[k * 4] = r * tone; col[k * 4 + 1] = g * tone; col[k * 4 + 2] = b * tone; col[k * 4 + 3] = 1;
                }
            }
            const idx = [];
            for (let i = 0; i < N - 1; i++) for (let j = 0; j < M; j++) {
                const A = i * W + j, B = A + 1, Cc = A + W, D = Cc + 1;
                idx.push(A, Cc, B, B, Cc, D);
            }
            const normals = finalize(pos, idx);
            weldNormals(pos, normals);
            const mesh = makeMesh("banana", pos, idx, normals, uvs, col, this.scene);
            mesh.material = coatMaterial(this.scene, this.coatKey);
            mesh.receiveShadows = true;
            mesh.parent = this.root;
            mesh._banana = this;
            this.body = mesh;
            this.parts.push(mesh);
        }

        // ---- スプレー -----------------------------------------------------
        // 【対策】全周に一様に撒くと「スプレーをまぶした」ではなく「柄の布」に
        //         なる。実際は横にして上から振るので、そのとき上を向いていた面
        //         （背＝凸側と片方の肩）だけに付く。付着確率を法線と振りかけ
        //         方向の内積で決めれば、写真の「手前下は地のチョコ」が自然に出る
        // dir は振りかけた向き（ローカル座標、表面から振り手へ向かう単位ベクトル）
        buildSprinkles(dir) {
            const key = this.sprinkleKey;
            const S = SPRINKLES[key], SP = CONFIG.sprinkle_, rng = this.rng;
            if (!S || !S.colors.length) return;
            const sdx = dir.x, sdy = dir.y, sdz = dir.z;

            // 面積をざっと見積もる
            const o = {}, o2 = {}, o3 = {};
            let area = 0, rmax = 0;
            const NS = 80;
            for (let i = 0; i < NS; i++) {
                const sx = (i + 0.5) / NS;
                this.surface(sx, 0, o);
                const f = this.frame(o.s);
                const rr = Math.hypot(o.x - f.px, o.y - f.py, o.z - f.pz);
                rmax = Math.max(rmax, rr);
                area += TAU * rr * (this.L * (1 + this.e0 + this.e1) / NS);
            }
            const lenTot = this.L * (1 + this.e0 + this.e1);
            const tries = Math.round(SP.density * area * 1.35);

            // 色の重み
            const cols = S.colors.map(c => lin(c[0])), wsum = S.colors.reduce((a, c) => a + c[1], 0);
            const pick = () => {
                let r = rng.next() * wsum;
                for (let i = 0; i < S.colors.length; i++) { r -= S.colors[i][1]; if (r <= 0) return cols[i]; }
                return cols[cols.length - 1];
            };

            const mats = [], colors = [];
            const xA = new V3(), yA = new V3(), zA = new V3();
            const q = new BABYLON.Quaternion(), mtx = new BABYLON.Matrix();
            for (let n = 0; n < tries; n++) {
                const sx = rng.next(), th = rng.next() * TAU;
                this.surface(sx, th, o);
                const f = this.frame(o.s);
                const rr = Math.hypot(o.x - f.px, o.y - f.py, o.z - f.pz);
                // 面積一様にする棄却（細い所ほど密にならないように）
                if (rng.next() * rmax > rr) continue;
                // 法線（中心差分）
                const e = 0.004, et = 0.01;
                this.surface(Math.min(1, sx + e), th, o2);
                this.surface(sx, th + et, o3);
                const ax = o2.x - o.x, ay = o2.y - o.y, az = o2.z - o.z;
                const cx = o3.x - o.x, cy = o3.y - o.y, cz = o3.z - o.z;
                let nx = ay * cz - az * cy, ny = az * cx - ax * cz, nz = ax * cy - ay * cx;
                const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
                if (nx * o.dx + ny * o.dy + nz * o.dz < 0) { nx = -nx; ny = -ny; nz = -nz; }
                // 付着確率
                const facing = nx * sdx + ny * sdy + nz * sdz;
                // 写真では下 3 割（刺し口のあたり）は地のチョコのまま
                const along = smooth(this.plainBelow, this.plainBelow + 0.14, sx) * (1 - 0.35 * smooth(0.93, 1.0, sx));
                const p = smooth(-0.28, 0.42, facing) * along;
                if (rng.next() > p) continue;

                // 向き：接平面上のランダム方向。わずかに起きているものも混ぜる
                let tx = rng.gauss(0, 1), ty = rng.gauss(0, 1), tz = rng.gauss(0, 1);
                const dn = tx * nx + ty * ny + tz * nz;
                tx -= dn * nx; ty -= dn * ny; tz -= dn * nz;
                const lift = rng.next() < 0.06 ? rng.range(0.35, 0.8) : rng.gauss(0, 0.10);
                tx += nx * lift; ty += ny * lift; tz += nz * lift;
                const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
                yA.set(tx, ty, tz);
                zA.set(nx, ny, nz);
                V3.CrossToRef(yA, zA, xA); xA.normalize();
                V3.CrossToRef(xA, yA, zA); zA.normalize();
                BABYLON.Quaternion.RotationQuaternionFromAxisToRef(xA, yA, zA, q);

                const len = rng.range(SP.len[0], SP.len[1]), dia = rng.range(SP.dia[0], SP.dia[1]);
                const sink = dia * rng.range(SP.sink[0], SP.sink[1]);
                const off = dia * 0.5 - sink;
                BABYLON.Matrix.ComposeToRef(new V3(dia, len, dia), q,
                    new V3(o.x + nx * off, o.y + ny * off, o.z + nz * off), mtx);
                for (let k = 0; k < 16; k++) mats.push(mtx.m[k]);
                const c = pick(), v = rng.range(0.92, 1.05);
                colors.push(c[0] * v, c[1] * v, c[2] * v, 1);
            }
            void lenTot;
            if (!mats.length) return;
            const sp = named(BABYLON.MeshBuilder.CreateCapsule("sprinkle",
                { height: 1, radius: 0.5, tessellation: 8, subdivisions: 1, capSubdivisions: 3 }, this.scene), "sprinkle");
            sp.material = sprinkleMaterial(this.scene, key);
            sp.thinInstanceSetBuffer("matrix", new Float32Array(mats), 16, true);
            sp.thinInstanceSetBuffer("color", new Float32Array(colors), 4, true);
            sp.parent = this.root;
            sp.isPickable = false;
            sp.receiveShadows = true;
            sp.thinInstanceRefreshBoundingInfo(false);
            this.sprinkles = sp;
            this.sprinkleCount = mats.length / 16;
            this.parts.push(sp);
        }

        // ---- 刺し口から棒へ垂れたチョコ ------------------------------------
        // 【対策】棒を刺したあとに浸して棒を下にして立てるので、刺し口から
        //         チョコが棒を伝って流れ落ち、途中で固まる。棒にきっちり巻いた
        //         筒ではなく、周方向で長さの違う垂れが数本あり、垂れの先が
        //         丸く溜まっている。刺し口は実と棒の間を埋める裾になる
        addDrip(E, axis, side, ratioAt) {
            const rng = this.rng, C = this.C;
            const base = lin(C.base), deep = lin(C.deep);
            const rs = CONFIG.stick.dia * 0.5;
            const yA = axis.clone();
            const zA = side.subtract(yA.scale(V3.Dot(side, yA))).normalize();
            const xA = V3.Cross(yA, zA).normalize();
            const M = 48, NT = 64;
            // 垂れの長さ（周方向）。数本の筋が長く伸びる
            const nd = 3 + Math.floor(rng.next() * 3), drips = [];
            for (let k = 0; k < nd; k++) drips.push({ c: rng.range(0, TAU), w: rng.range(0.35, 0.7), L: rng.range(1.6, 4.0) });
            const baseLen = rng.range(0.6, 1.0);
            // 刺し口の外向きに近い側（上側の面）はチョコが多く流れる
            const lenAt = (th) => {
                let L = baseLen;
                for (const d of drips) {
                    let dd = Math.abs(((th - d.c) % TAU + TAU + Math.PI) % TAU - Math.PI);
                    L = Math.max(L, baseLen + (d.L - baseLen) * Math.exp(-(dd * dd) / (d.w * d.w * 0.18)));
                }
                return L;
            };
            // 【対策】実の表面は棒に対して斜めなので、刺し口の高さは周方向で違う。
            //         一律の高さから裾を広げると、片側だけ実から浮いた筒（カフス）
            //         になる。周方向ごとに「棒の表面が実の表面と交わる位置」を
            //         求め、そこを起点に裾と垂れを付ける
            const radial = (th, r) => new V3((xA.x * Math.cos(th) + zA.x * Math.sin(th)) * r,
                (xA.y * Math.cos(th) + zA.y * Math.sin(th)) * r, (xA.z * Math.cos(th) + zA.z * Math.sin(th)) * r);
            const tS = new Float32Array(M + 1);
            for (let j = 0; j <= M; j++) {
                const th = (j % M) / M * TAU, rd = radial(th, rs);
                let ts = 0;
                for (let t = -3; t < 2; t += 0.02) {
                    const Q = E.subtract(yA.scale(t)).add(rd);
                    if (ratioAt(Q) >= 1.0) { ts = t; break; }
                }
                tS[j] = ts;
            }
            const up = 0.6;                          // 実の中へ潜り込ませる長さ
            const W = M + 1, pos = new Float32Array(NT * W * 3), col = new Float32Array(NT * W * 4);
            for (let i = 0; i < NT; i++) {
                const u = i / (NT - 1);
                for (let j = 0; j <= M; j++) {
                    const th = (j % M) / M * TAU;
                    const L = lenAt(th);
                    // 垂れの中心ほど太い筋になる
                    let dw = 0;
                    for (const d of drips) {
                        const dd = Math.abs(((th - d.c) % TAU + TAU + Math.PI) % TAU - Math.PI);
                        dw = Math.max(dw, Math.exp(-(dd * dd) / (d.w * d.w * 0.12)));
                    }
                    // 行を下端寄りに詰める（垂れの先の滴を解像する）
                    const uu = 1 - Math.pow(1 - u, 1.35);
                    const tp = mix(-up, L, uu);        // 交線から下へ（負は実の中）
                    const t = tS[j] + tp;
                    const q = clamp(tp / L, 0, 1);
                    // 薄い膜 + 垂れの筋
                    let h = (0.035 + 0.075 * dw) * Math.sqrt(Math.max(0, 1 - q * q));
                    // 交線の裾（実との間を埋める溜まり）。実の中では太く、外では速く引く
                    h += 0.30 * Math.exp(-Math.max(0, tp) / 0.16);
                    // 垂れの先の滴
                    h += 0.10 * dw * Math.exp(-Math.pow((tp - (L - 0.22)) / 0.13, 2));
                    h *= 1 + 0.25 * (Noise.v3(Math.cos(th) * 2, Math.sin(th) * 2, tp * 1.5, this.nseed + 301) - 0.5);
                    // 最下行は棒の中へ少し沈めて継ぎ目を見せない
                    const r = (i === NT - 1) ? rs * 0.94 : rs + Math.max(0, h);
                    const k = i * W + j;
                    const rd = radial(th, r);
                    pos[k * 3] = E.x - yA.x * t + rd.x; pos[k * 3 + 1] = E.y - yA.y * t + rd.y; pos[k * 3 + 2] = E.z - yA.z * t + rd.z;
                    const kk = smooth(0.02, 0.20, h);
                    col[k * 4] = mix(base[0], deep[0], kk * 0.6); col[k * 4 + 1] = mix(base[1], deep[1], kk * 0.6);
                    col[k * 4 + 2] = mix(base[2], deep[2], kk * 0.6); col[k * 4 + 3] = 1;
                }
            }
            const idx = [];
            for (let i = 0; i < NT - 1; i++) for (let j = 0; j < M; j++) {
                const A = i * W + j, B = A + 1, Cc = A + W, D = Cc + 1;
                idx.push(A, Cc, B, B, Cc, D);
            }
            // 筒なので「重心からの向き」では判定できない。棒の軸からの向きで判定する
            let normals = new Float32Array(pos.length);
            BABYLON.VertexData.ComputeNormals(pos, idx, normals);
            let acc = 0;
            for (let k = 0; k < pos.length / 3; k++) {
                const vx = pos[k * 3] - E.x, vy = pos[k * 3 + 1] - E.y, vz = pos[k * 3 + 2] - E.z;
                const al = vx * yA.x + vy * yA.y + vz * yA.z;
                acc += normals[k * 3] * (vx - yA.x * al) + normals[k * 3 + 1] * (vy - yA.y * al) + normals[k * 3 + 2] * (vz - yA.z * al);
            }
            if (acc < 0) {
                for (let k = 0; k < idx.length; k += 3) { const tt = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = tt; }
                normals = new Float32Array(pos.length);
                BABYLON.VertexData.ComputeNormals(pos, idx, normals);
            }
            weldNormals(pos, normals);
            const m = makeMesh("stickDrip", pos, idx, normals, null, col, this.scene);
            m.material = coatMaterial(this.scene, this.coatKey);
            m.parent = this.root;
            m.receiveShadows = true;
            this.parts.push(m);
        }

        dispose() {
            for (const m of this.parts) { try { m.dispose(); } catch (e) { } }
            this.parts.length = 0;
            if (this.root) this.root.dispose();
        }
    }

    // ---- マテリアル（種類ごとに共有）------------------------------------
    const matCache = {};
    function coatMaterial(scene, key) {
        if (matCache["c_" + key]) return matCache["c_" + key];
        const C = COATS[key];
        const m = named(new BABYLON.PBRMaterial("coat_" + key, scene), "coat_" + key);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);      // 色は頂点カラー
        m.metallic = 0; m.roughness = C.rough;
        // 【対策】チョコの照りはカカオバターの層。粗さを下げるだけでは濡れた石になる
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = C.coat;
        m.clearCoat.roughness = C.coatRough;
        m.clearCoat.indexOfRefraction = 1.46;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.translucencyIntensity = C.sss;
        m.subSurface.tintColor = key === "pink" ? new BABYLON.Color3(0.95, 0.45, 0.45)
            : key === "mint" ? new BABYLON.Color3(0.55, 0.9, 0.75) : new BABYLON.Color3(0.75, 0.38, 0.20);
        m.subSurface.minimumThickness = 0.3; m.subSurface.maximumThickness = 3.5;
        matCache["c_" + key] = m;
        return m;
    }
    function sprinkleMaterial(scene, key) {
        if (matCache["s_" + key]) return matCache["s_" + key];
        const m = named(new BABYLON.PBRMaterial("sprinkle_" + key, scene), "sprinkleMat_" + key);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);      // 色はインスタンスカラー
        m.metallic = 0; m.roughness = SPRINKLES[key].rough;
        // 砂糖の粒をワックスで磨いたもの。弱い照りが乗る
        m.clearCoat.isEnabled = true; m.clearCoat.intensity = 0.35; m.clearCoat.roughness = 0.25;
        matCache["s_" + key] = m;
        return m;
    }

    // =================================================================
    // 6. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    // 写真は屋外の昼。明るい暖色の背景
    scene.clearColor = new BABYLON.Color4(0.80, 0.75, 0.68, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.2;
    scene.environmentIntensity = 1.10;

    const B = CONFIG.board;
    const camera = new BABYLON.ArcRotateCamera("cam", -Math.PI / 2 + 0.62, 1.18, 64, new V3(0, 10.5, 0), scene);
    camera.attachControl(true);
    camera.fov = 0.52;
    camera.wheelPrecision = 6;
    camera.minZ = 2; camera.maxZ = 600;
    camera.lowerRadiusLimit = 10; camera.upperRadiusLimit = 220;
    camera.lowerBetaLimit = 0.15; camera.upperBetaLimit = 1.52;
    scene.cameraToUseForPointers = camera;

    // キー：左奥上からの日差し。写真では台に長い光の帯と、手前右へ落ちる棒の影
    const key = new BABYLON.DirectionalLight("key", new V3(0.55, -0.58, -0.60).normalize(), scene);
    key.position = new V3(-40, 45, 45);
    key.intensity = 3.1;
    key.diffuse = new BABYLON.Color3(1.0, 0.93, 0.82);
    key.specular = new BABYLON.Color3(1.0, 0.95, 0.86);
    key.shadowMinZ = 1; key.shadowMaxZ = 160;

    // フィル：手前右から。写真は全体に露出が高く、影側もかなり明るい
    const fill = new BABYLON.DirectionalLight("fill", new V3(-0.45, -0.35, 0.82).normalize(), scene);
    fill.intensity = 1.05;
    fill.diffuse = new BABYLON.Color3(1.0, 0.97, 0.93);
    fill.specular = new BABYLON.Color3(0.25, 0.24, 0.22);

    // キック：鏡面だけ。濡れたチョコに縦長の照りを走らせる
    const kick = new BABYLON.DirectionalLight("kick", new V3(-0.25, -0.30, 0.92).normalize(), scene);
    kick.intensity = 1.2;
    kick.diffuse = new BABYLON.Color3(0.05, 0.05, 0.05);
    kick.specular = new BABYLON.Color3(1.0, 0.97, 0.92);

    // 台からの照り返し（明るい合板なので強い）
    const amb = new BABYLON.HemisphericLight("amb", new V3(0, 1, 0), scene);
    amb.intensity = 0.32;
    amb.diffuse = new BABYLON.Color3(1, 0.98, 0.95);
    amb.groundColor = new BABYLON.Color3(0.62, 0.50, 0.36);
    amb.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0008;
    sg.normalBias = 0.02;
    sg.darkness = 0.18;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.30;
    ip.contrast = 1.10;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.2;
    ip.vignetteColor = new BABYLON.Color4(0.25, 0.18, 0.12, 0);

    // ---- 穴あき台 ------------------------------------------------------
    const boardTex = TextureLab.board(scene, CONFIG);
    const boardTop = named(BABYLON.MeshBuilder.CreateGround("boardTop", { width: B.w, height: B.d }, scene), "boardTop");
    const bm = named(new BABYLON.PBRMaterial("boardMat", scene), "boardMat");
    bm.albedoTexture = boardTex.albedo;
    bm.metallicTexture = boardTex.orm;
    bm.useAmbientOcclusionFromMetallicTextureRed = true;
    bm.useRoughnessFromMetallicTextureGreen = true;
    bm.useMetallnessFromMetallicTextureBlue = true;
    bm.metallic = 1; bm.roughness = 1;
    bm.bumpTexture = boardTex.normal;
    bm.bumpTexture.level = 1.0;
    boardTop.material = bm;
    boardTop.receiveShadows = true;

    const boardBody = named(BABYLON.MeshBuilder.CreateBox("boardBody", { width: B.w, height: B.thick, depth: B.d }, scene), "boardBody");
    boardBody.position.y = -B.thick / 2 - 0.01;
    const bbm = named(new BABYLON.PBRMaterial("boardEdgeMat", scene), "boardEdgeMat");
    bbm.albedoColor = BABYLON.Color3.FromArray([0.78, 0.62, 0.42]).toLinearSpace();
    bbm.metallic = 0; bbm.roughness = 0.7;
    boardBody.material = bbm;
    boardBody.receiveShadows = true;

    // 背景：奥の棚と壁（被写界深度で溶ける前提の大づかみ）
    const backWoodTex = TextureLab.backWood(scene);
    const shelf = named(BABYLON.MeshBuilder.CreateBox("shelf", { width: 70, height: 26, depth: 14 }, scene), "shelf");
    shelf.position.set(-6, 13 - B.thick, B.d / 2 + 12);
    const shm = named(new BABYLON.PBRMaterial("shelfMat", scene), "shelfMat");
    shm.albedoTexture = backWoodTex; shm.metallic = 0; shm.roughness = 0.8;
    shelf.material = shm;
    shelf.receiveShadows = true;
    const wall = named(BABYLON.MeshBuilder.CreatePlane("wall", { width: 400, height: 200 }, scene), "wall");
    wall.position.set(0, 60, 120);
    const wm = named(new BABYLON.PBRMaterial("wallMat", scene), "wallMat");
    wm.albedoColor = BABYLON.Color3.FromArray([0.86, 0.82, 0.76]).toLinearSpace();
    wm.metallic = 0; wm.roughness = 1; wm.backFaceCulling = false;
    wall.material = wm;
    const floor = named(BABYLON.MeshBuilder.CreateGround("table", { width: 400, height: 300 }, scene), "table");
    floor.position.y = -B.thick - 0.02;
    const fm = named(new BABYLON.PBRMaterial("tableMat", scene), "tableMat");
    fm.albedoColor = BABYLON.Color3.FromArray([0.90, 0.88, 0.85]).toLinearSpace();
    fm.metallic = 0; fm.roughness = 0.9;
    floor.material = fm;
    floor.receiveShadows = true;

    // ---- 割り箸 --------------------------------------------------------
    const stickMat = named(new BABYLON.PBRMaterial("stickMat", scene), "stickMat");
    stickMat.albedoTexture = TextureLab.stick(scene);
    stickMat.metallic = 0; stickMat.roughness = 0.72;
    stickMat.subSurface.isTranslucencyEnabled = true;
    stickMat.subSurface.translucencyIntensity = 0.25;
    stickMat.subSurface.tintColor = new BABYLON.Color3(1.0, 0.8, 0.55);

    function buildStick(len) {
        const S = CONFIG.stick;
        const m = named(BABYLON.MeshBuilder.CreateCylinder("stick",
            { height: len, diameterTop: S.dia * 0.96, diameterBottom: S.dia, tessellation: 18, subdivisions: 1 }, scene), "stick");
        m.material = stickMat;
        m.receiveShadows = true;
        return m;
    }

    // ローカルの直交基底 (x,y,z) を、ワールドの直交基底 (X,Y,Z) へ写す回転
    function frameToFrame(lx, ly, lz, wx, wy, wz) {
        const Ml = BABYLON.Matrix.Identity(), Mw = BABYLON.Matrix.Identity();
        BABYLON.Matrix.FromXYZAxesToRef(lx, ly, lz, Ml);
        BABYLON.Matrix.FromXYZAxesToRef(wx, wy, wz, Mw);
        const M = Ml.transpose().multiply(Mw);
        return BABYLON.Quaternion.FromRotationMatrix(M);
    }

    // =================================================================
    //  組み立て
    // =================================================================
    let items = [], sticks = [];
    let curSeed = START_SEED;
    const DBG = { solo: false, wire: false };

    function clearAll() {
        for (const b of items) b.dispose();
        for (const s of sticks) s.dispose();
        items = []; sticks = [];
        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
    }

    // 【対策】棒は実の端から軸に沿って刺すのではない。背（凸側）の下から2割強の
    //         側面から入れ、背の皮の内側に沿って弦のようにまっすぐ通し、上端の
    //         手前で止める。下端は棒から外れて腹側へ反り返る（添付写真）
    function place(banana, hx, hz, rng, yawBias) {
        const S = CONFIG.stick;
        // ---- ローカル（実の座標）で棒の通り道を決める --------------------
        // 【対策】添付写真の刺し方：棒は背（凸側）の表面近くの2点、下から2割強と
        //         上から1割強の位置を結ぶ弦に沿って通る。弦なので中ほどでは実の
        //         中心寄りを通り、両端では背の皮一枚内側を通る。刺し口は下端では
        //         なく背の側面で、そこから下の実（下端の2割）は棒から離れて
        //         腹側へ反り返り、宙に浮く
        const sA = rng.range(S.enter[0], S.enter[1]);
        const sB = rng.range(S.reach[0], S.reach[1]);
        const toSx = (sc) => (sc + banana.e0) / (1 + banana.e0 + banana.e1);
        const backPt = (sc, inset) => {
            const f = banana.frame(sc);
            const r = banana.R * banana.profile(toSx(sc));
            return new V3(f.px - f.nx * (r - inset), f.py - f.ny * (r - inset), f.pz - f.nz * (r - inset));
        };
        const PA = backPt(sA, S.inset), PB = backPt(sB, S.inset * 1.2);
        const lY = PB.subtract(PA).normalize();                // 棒の軸（上向き）
        const O = PA;
        // 中心線の表（最寄り点と、そこでの半径）
        const NSc = 240, cl = [];
        for (let k = 0; k <= NSc; k++) {
            const f = banana.frame(k / NSc);
            cl.push({ p: new V3(f.px, f.py, f.pz), r: banana.R * banana.profile(toSx(k / NSc)) + banana.coatMean });
        }
        const nearestCl = (Q) => {
            let best = Infinity, bc = cl[0];
            for (const c of cl) { const d = V3.DistanceSquared(Q, c.p); if (d < best) { best = d; bc = c; } }
            return { c: bc, ratio: Math.sqrt(best) / Math.max(1e-3, bc.r) };   // 1 で表面
        };
        // 下へたどって表面を抜ける点＝刺し口
        let tE = -0.5;
        for (let t = 0; t > -6; t -= 0.01) { if (nearestCl(O.add(lY.scale(t))).ratio >= 1.0) { tE = t; break; } }
        const E = O.add(lY.scale(tE));
        // 先端は PB。途中で表面へ近づきすぎる所があれば手前で止める
        let tTip = V3.Distance(PA, PB);
        for (let t = 0.5; t <= tTip; t += 0.05) {
            if (nearestCl(O.add(lY.scale(t))).ratio > 0.86) { tTip = t - 0.25; break; }
        }
        const insideLen = Math.max(2.0, tTip - tE);
        const dE = E.subtract(nearestCl(E).c.p).normalize();   // 刺し口の外向き
        // 背の向き（棒に垂直）
        const fm = banana.frame(0.5);
        let lZ = new V3(-fm.nx, -fm.ny, -fm.nz);
        lZ = lZ.subtract(lY.scale(V3.Dot(lZ, lY))).normalize();
        const lX = V3.Cross(lY, lZ).normalize();

        // ---- ワールドでの向き ----------------------------------------------
        // 棒：上が右（+X）へ傾く。写真では全部ほぼ同じ向きに傾いている
        const lean = S.lean + rng.gauss(0, 0.05);
        const sd = new V3(Math.sin(lean), Math.cos(lean), rng.gauss(0.03, 0.05)).normalize();
        // 背（刺し口側）を向ける方向：列の左やや手前。腹（凹側）は右を向き、
        // 曲がりがシルエットに出る
        const a = -1.30 + rng.gauss(0, 0.20) + (yawBias || 0);
        let cw = new V3(Math.sin(a), 0, -Math.cos(a));
        cw = cw.subtract(sd.scale(V3.Dot(cw, sd))).normalize();
        const bw = V3.Cross(sd, cw).normalize();
        banana.root.rotationQuaternion = frameToFrame(lX, lY, lZ, bw, sd, cw);

        const hole = new V3(hx, 0, hz);
        const Ew = hole.add(sd.scale(S.visible));
        const Erot = E.applyRotationQuaternion(banana.root.rotationQuaternion);
        banana.root.position.copyFrom(Ew.subtract(Erot));

        // ---- 棒 ------------------------------------------------------------
        const len = S.visible + insideLen + S.inBoard;
        const st = buildStick(len);
        const mid = hole.add(sd.scale((S.visible + insideLen - S.inBoard) / 2));
        st.position.copyFrom(mid);
        const up = new V3(0, 1, 0);
        const axis = V3.Cross(up, sd);
        const ang = Math.acos(clamp(V3.Dot(up, sd), -1, 1));
        st.rotationQuaternion = axis.length() > 1e-6
            ? BABYLON.Quaternion.RotationAxis(axis.normalize(), ang) : BABYLON.Quaternion.Identity();
        st.rotationQuaternion = st.rotationQuaternion.multiply(BABYLON.Quaternion.RotationAxis(up, rng.range(0, TAU)));
        sticks.push(st);
        sg.addShadowCaster(st, false);

        // ---- 刺し口から棒へ垂れたチョコ ------------------------------------
        banana.addDrip(E, lY, lZ, (Q) => nearestCl(Q).ratio);

        // スプレーは刺した姿勢で手前左上から振ったものとして付ける
        const dW = new V3(-0.60 + rng.gauss(0, 0.12), 0.45 + rng.gauss(0, 0.10), -0.66).normalize();
        const inv = BABYLON.Quaternion.Inverse(banana.root.rotationQuaternion);
        banana.buildSprinkles(dW.applyRotationQuaternion(inv));
        for (const m of banana.parts) sg.addShadowCaster(m, false);
    }

    function build() {
        const t0 = performance.now();
        clearAll();
        const rng = new Rng((curSeed * 2654435761) >>> 0);
        const lineup = LINEUPS[CONFIG.lineup].list;
        if (DBG.solo) {
            const b = new Banana(scene, lineup[lineup.length - 1], curSeed, CONFIG.sprinkle);
            items.push(b);
            place(b, 0, 0, rng, 0);
            camera.target.set(0, 13, 0);
            camWant = 34;
        } else {
            const n = CONFIG.count, step = CONFIG.board.pitch * CONFIG.spacingHoles;
            for (let i = 0; i < n; i++) {
                const ck = CONFIG.lineup === "photo"
                    ? lineup[Math.min(lineup.length - 1, Math.floor(i / n * lineup.length))]
                    : (lineup.length === 1 ? lineup[0] : lineup[Math.floor(rng.next() * lineup.length)]);
                const b = new Banana(scene, ck, (curSeed + i * 7919) >>> 0, CONFIG.sprinkle);
                items.push(b);
                const hx = (i - (n - 1) / 2) * step;
                place(b, hx, 0, rng, 0);
            }
            camera.target.set(0, 11, 0);
            camWant = Math.max(52, n * step * 1.15);
        }
        camWantT = 1.2;
        applyWire();
        updateInfo();
        let spr = 0; for (const b of items) spr += b.sprinkleCount || 0;
        console.log("[ChocoBanana]", BUILD, "/ seed", curSeed, "/", items.length, "本 / スプレー", spr, "粒 /",
            (performance.now() - t0).toFixed(0) + "ms");
    }

    function applyWire() {
        for (const k in matCache) matCache[k].wireframe = DBG.wire;
    }

    let camWant = 64, camWantT = 0;
    scene.onBeforeRenderObservable.add(() => {
        if (camWantT <= 0) return;
        const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
        camWantT -= dt;
        camera.radius += (camWant - camera.radius) * Math.min(1, dt * 3);
    });

    // ---- ポストプロセス --------------------------------------------------
    if (CONFIG.useSSAO) {
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.9; ssao.totalStrength = 0.9; ssao.samples = 16;
        ssao.expensiveBlur = true; ssao.maxZ = 250; ssao.minZAspect = 0.2;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.88; dp.bloomWeight = 0.12; dp.bloomKernel = 64; dp.bloomScale = 0.5;
    dp.sharpenEnabled = true; dp.sharpen.edgeAmount = 0.18;
    // 【対策】錯乱円は「シーン単位 × 1000 = mm」で計算される。焦点距離を合焦距離の
    //         一定比率にすると、寄っても引いてもボケ量が変わらない
    dp.depthOfFieldEnabled = CONFIG.useDOF;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.High;
    dp.depthOfField.lensSize = 50;
    dp.depthOfField.fStop = CONFIG.dofFStop;
    scene.onBeforeRenderObservable.add(() => {
        if (!dp.depthOfFieldEnabled) return;
        const focus = camera.radius * 1000;
        dp.depthOfField.focusDistance = focus;
        dp.depthOfField.focalLength = focus * CONFIG.dofRatio;
    });

    // =================================================================
    // 7. GUI
    // =================================================================
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (CONFIG.guiOwnCamera) {
        const GUI_MASK = 0x20000000;
        const guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene);
        guiCam.layerMask = GUI_MASK;
        scene.activeCameras = [camera, guiCam];
        if (ui.layer) ui.layer.layerMask = GUI_MASK;
        scene.onAfterRenderObservable.add(() => { scene.activeCamera = camera; });
    } else if (ui.layer) {
        // 【対策】GUI だけポストプロセス（被写界深度・ブルーム）の後に描く
        ui.layer.applyPostProcess = false;
    }

    const COL = { idle: "#2a1d16", active: "#8a5a2c", edge: "#4a3628", text: "#f6ead9", sub: "#c9ab8b", accent: "#f0b878" };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "236px"; card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(26,17,12,0.80)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "62px";
    ui.addControl(card);
    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "206px"; panel.isVertical = true;
    panel.paddingTop = "12px"; panel.paddingBottom = "12px";
    card.addControl(panel);

    function addLabel(text, size, color, height) {
        const t = new BABYLON.GUI.TextBlock();
        t.text = text; t.height = height || "22px"; t.color = color || COL.text; t.fontSize = size || 13;
        t.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        t.textWrapping = true;
        panel.addControl(t);
        return t;
    }
    function addButton(name, text, onClick) {
        const b = BABYLON.GUI.Button.CreateSimpleButton(name, text);
        b.height = "29px"; b.paddingBottom = "4px";
        b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 13;
        b.onPointerUpObservable.add(onClick);
        panel.addControl(b);
        return b;
    }

    addLabel("CHOCO BANANA", 11, COL.sub, "18px");
    addLabel("並び", 13, COL.accent, "22px");
    const lineBtns = {}, sprBtns = {}, cntBtns = {};
    function highlight() {
        for (const k in lineBtns) lineBtns[k].background = k === CONFIG.lineup ? COL.active : COL.idle;
        for (const k in sprBtns) sprBtns[k].background = k === CONFIG.sprinkle ? COL.active : COL.idle;
        for (const k in cntBtns) cntBtns[k].background = (+k === CONFIG.count) ? COL.active : COL.idle;
    }
    for (const k of Object.keys(LINEUPS)) lineBtns[k] = addButton("l_" + k, LINEUPS[k].label, () => { CONFIG.lineup = k; build(); highlight(); });
    addLabel("スプレー", 13, COL.accent, "24px");
    for (const k of Object.keys(SPRINKLES)) sprBtns[k] = addButton("s_" + k, SPRINKLES[k].label, () => { CONFIG.sprinkle = k; build(); highlight(); });
    addLabel("本数", 13, COL.accent, "24px");
    for (const c of [6, 12, 18]) cntBtns[c] = addButton("c" + c, c + " 本", () => { CONFIG.count = c; build(); highlight(); });

    const gap = new BABYLON.GUI.Rectangle(); gap.height = "8px"; gap.thickness = 0; panel.addControl(gap);
    addButton("reseed", "別の個体を作る", () => { curSeed = (curSeed * 1664525 + 1013904223) >>> 0; build(); });
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        CONFIG.useDOF = !CONFIG.useDOF; dp.depthOfFieldEnabled = CONFIG.useDOF;
        dofBtn.textBlock.text = "被写界深度: " + (CONFIG.useDOF ? "ON" : "OFF");
        dofBtn.background = CONFIG.useDOF ? COL.active : COL.idle;
    });
    dofBtn.background = COL.active;
    const rotBtn = addButton("rotate", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.08;
        rotBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });
    addLabel("デバッグ", 13, COL.accent, "24px");
    const soloBtn = addButton("solo", "1本だけ表示", () => {
        DBG.solo = !DBG.solo; soloBtn.background = DBG.solo ? COL.active : COL.idle; build();
    });
    const wireBtn = addButton("wire", "ワイヤーフレーム", () => {
        DBG.wire = !DBG.wire; wireBtn.background = DBG.wire ? COL.active : COL.idle; applyWire();
    });
    const info = addLabel("", 11, COL.sub, "40px");
    function updateInfo() {
        let spr = 0; for (const b of items) spr += b.sprinkleCount || 0;
        const b0 = items[items.length - 1];
        info.text = items.length + " 本 / スプレー " + spr + " 粒\n"
            + (b0 ? "長さ " + b0.L.toFixed(1) + "cm 太さ " + (b0.R * 2 + b0.coatMean * 2).toFixed(1) + "cm" : "")
            + "  seed " + curSeed;
    }

    // ---- 開閉（スマホでは畳む。DPR ぶん拡大して押せる大きさに）----------
    function viewportCss() {
        const c = engine.getRenderingCanvas();
        return { w: (c && c.clientWidth) || window.innerWidth || 1024, h: (c && c.clientHeight) || window.innerHeight || 768 };
    }
    function isCompact() {
        const v = viewportCss();
        return v.w < CONFIG.compactWidth || Math.min(v.w, v.h) < CONFIG.compactMinSide;
    }
    const toggleBtn = BABYLON.GUI.Button.CreateSimpleButton("guiToggle", "≡");
    toggleBtn.width = "38px"; toggleBtn.height = "38px";
    toggleBtn.cornerRadius = 10; toggleBtn.thickness = 1; toggleBtn.color = COL.edge;
    toggleBtn.background = "rgba(26,17,12,0.80)"; toggleBtn.fontSize = 20;
    if (toggleBtn.textBlock) toggleBtn.textBlock.color = COL.text;
    toggleBtn.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    toggleBtn.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    toggleBtn.left = "16px"; toggleBtn.top = "16px";
    ui.addControl(toggleBtn);
    let panelOpen = !isCompact();
    function applyGuiLayout() {
        const scale = isCompact() ? clamp(engine.getRenderWidth() / Math.max(1, viewportCss().w), 1, CONFIG.guiMaxScale) : 1;
        for (const c of [toggleBtn, card]) { c.transformCenterX = 0; c.transformCenterY = 0; c.scaleX = scale; c.scaleY = scale; }
        card.top = (16 + 38 * scale + 8) + "px";
        card.isVisible = panelOpen;
        if (toggleBtn.textBlock) toggleBtn.textBlock.text = panelOpen ? "×" : "≡";
        toggleBtn.background = panelOpen ? COL.active : "rgba(26,17,12,0.80)";
    }
    toggleBtn.onPointerUpObservable.add(() => { panelOpen = !panelOpen; applyGuiLayout(); });
    engine.onResizeObservable.add(applyGuiLayout);

    build();
    highlight();
    applyGuiLayout();
    console.log("[ChocoBanana] BUILD:", BUILD);
    return scene;
};

export default createScene;