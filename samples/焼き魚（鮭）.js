// =====================================================================
//  Photoreal Grilled Salted Salmon  /  写実的な焼き鮭（塩鮭の切り身）
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）   BUILD: sake-B
//
//  sake-A からの変更点（Inspector のデバッグ表示）:
//    ・Physics Helper が何も出ない／Scene Explorer の Picker が当たらない
//      問題の修正。原因は GUI 専用カメラで、activeCameras を 2 台にすると
//      Babylon の各機能が「activeCameras の末尾＝描画の基準カメラ」と
//      見なす所で全部 guiCam を拾ってしまう:
//        ・UtilityLayerRenderer → Physics Helper が出ない／ギズモがずれる
//        ・EffectLayer          → 選択ハイライトが全カメラパスで合成される
//        ・scene.activeCamera   → scene.pick() のレイが guiCam 基準になる
//      Babylon のレイ生成（CreatePickingRayToRef）は
//        camera → scene.activeCamera → scene.cameraToUseForPointers
//      の順に見るので、cameraToUseForPointers を設定していても
//      activeCamera が guiCam なら画面座標が原点前方 -50cm の別カメラで
//      逆投影され、まったく違う所を指す。
//      そもそもカメラを分ける必要が無かった。Layer.applyPostProcess を
//      false にすると前景レイヤーは _afterCameraPostProcessStage で
//      描かれる＝ポストプロセスの後に合成されるので、カメラ1台のまま
//      GUI だけ Bloom / DOF から外せる。guiOwnCamera の既定を false に
//      して、こちらを標準にした（true で従来のカメラ分離に戻る）
//    ・なお他のシーンで見つかった「mesh.id の重複で Picker が別の個体を
//      選ぶ」問題は、このシーンには無い。切り身1切れ・大根おろし1つ・
//      大葉1枚で、メッシュ名がすべて一意だから。ただし Babylon の Node は
//      コンストラクタで id = name を入れるので、今後 切り身を複数にする
//      などして同名のメッシュを増やすときは、name と id の両方を必ず
//      一意にすること（name だけ変えても id が元のまま残る）
//
//  構成:
//    0. CONFIG      … 種類プリセット（銀鮭 / 紅鮭 / トラウト）と焼き加減・献立
//    1. Rng         … シード付き擬似乱数
//    2. Noise       … 2D値ノイズ / u方向に折り返す2Dノイズ / fBm
//    3. Mesh utils  … 巻き順の自動判定・法線の溶接・掃引
//    4. Fields      … 切り身の輪郭（背〜腹）・断面・筋節の場・反り
//    5. TextureLab  … 身と皮を1枚に焼く（アルベド / ORM / 法線 / クリアコート）
//    6. Salmon      … 切り身メッシュ（皮まで含めて1メッシュ）
//    7. Table       … 皿 / 大根おろし / 大葉 / 木のテーブル
//    8. Scene       … IBL / ライト / 影 / SSAO2 / トーンマッピング
//    9. GUI
//
//  実物の要点（ここを外すと「オレンジ色のかまぼこ」になる）:
//
//  ・切り身は魚体を輪切りにしたもの。だから皿の上で上を向いている面は
//    「切り口（横断面）」であって、魚の外側ではない。表面に見える淡い筋は
//    縦縞ではなく、筋節（ミオコンマ＝筋肉の節を仕切る結合組織）を
//    輪切りにした「入れ子の弧」。皮に沿って走り、腹側で間隔が開く
//
//  ・皮は「面」ではなく長辺を走る「帯」。厚み（＝輪切りの厚さ）ぶんの
//    高さしかない。ここを面として貼ると魚が平たい板になる
//
//  ・皮と身のあいだには必ず 1〜2mm のクリーム色の脂の層がある。
//    写真で「オレンジと黒のあいだの白い線」に見えるのがこれ。
//    ここを省くと皮が身に直接塗られた模様に見える
//
//  ・皮際の中ほど（側線の高さ）に血合いの暗い帯がある。焼くと
//    赤ではなく灰褐色に転ぶ
//
//  ・腹身（片方の端）は白っぽく・脂が多く・薄い。焼くと縮んで反り上がる。
//    全体も両端が持ち上がって皿から浮く
//
//  ・切り口は筋繊維の「断面」なので、肌理は筋ではなく細かい粒に見える。
//    ここで縦筋を入れると刺身の柵の側面になってしまう
//
//  ・焼き色は一様な茶ではない。斑に入り、縁と稜で濃く、
//    白く固まったたんぱく（アルブミン）が身割れに沿って滲み出す
//
//  ・濡れた脂の艶がある。ただし全面が光ると樹脂の食品サンプルになる。
//    粗い下地（roughness 高め）＋斑なクリアコート、が実物の見え方
//
//  法線マップについて（きゅうり版・ジャガイモ版と同じ落とし穴）:
//    ・高さ場から法線を焼くとき、v 方向は (yd - yu) にすること。
//      (yu - yd) は「V が上を向く」OpenGL 系の規約で、Babylon の接空間は
//      V が下向き。混ぜると u方向は正・v方向は逆というねじれた法線になる
//
//  物理について:
//    ・この題材は「盛り付け」なので Havok は使わない。1個体を決め打ちで
//      置くほうが、皿からはみ出したり大根おろしが崩れたりしない
// =====================================================================

var createScene = function () {
    // =================================================================
    // 0. CONFIG （単位は cm）
    // =================================================================
    const PRESETS = {
        // 銀鮭の甘塩。スーパーの切り身でいちばん見慣れた色
        ginzake: {
            label: "銀鮭（甘塩）",
            length: 15.2,          // 背〜腹の長さ（皿の上での長辺）
            width: 5.00,           // 切り口の最大幅（＝身の肉厚）
            thick: 2.35,           // 輪切りの厚さ（包丁の刻み幅）
            curl: 0.42,            // 腹身の反り（cm）。弓型＝輪郭の話なので浮かせすぎない

            // 色（sRGB）
            flesh: [0.930, 0.590, 0.420],   // 身の基調
            fleshDeep: [0.880, 0.470, 0.320],   // 濃いところ
            fleshPale: [0.965, 0.775, 0.655],   // 淡いところ
            belly: [0.968, 0.888, 0.808],   // 腹身
            comma: [0.972, 0.905, 0.828],   // 筋節（結合組織）
            albumin: [0.988, 0.968, 0.938],   // 固まったたんぱく
            blood: [0.500, 0.325, 0.285],   // 血合い（焼くと灰褐色）
            fatLine: [0.958, 0.902, 0.788],   // 皮下の脂の層
            brown: [0.782, 0.498, 0.242],   // 焼き色
            char: [0.300, 0.185, 0.120],   // 焦げ
            // 【対策】焼いた皮は青灰色ではなく茶黒。冷たい灰にすると
            //         身のオレンジと喧嘩して、皮だけ別素材に見える
            skinBase: [0.288, 0.268, 0.244],   // 皮
            skinSilver: [0.615, 0.618, 0.600],   // 銀化した部分
            skinChar: [0.118, 0.098, 0.080],   // 皮の焦げ

            commaSpace: [3.60, 4.60],  // 粗い身割れの間隔（背側→腹側, cm）
            fatMarble: 0.55,          // 脂の白い差しの量
            sss: 0.20,
            oil: 0.62                     // 脂の照り
        },
        // 紅鮭。目に見えて赤く、脂は少なめで身が締まる
        benizake: {
            label: "紅鮭（甘塩）",
            length: 14.3, width: 4.65, thick: 2.15,
            curl: 0.38,
            flesh: [0.862, 0.392, 0.248],
            fleshDeep: [0.782, 0.288, 0.176],
            fleshPale: [0.930, 0.612, 0.470],
            belly: [0.940, 0.796, 0.700],
            comma: [0.955, 0.862, 0.790],
            albumin: [0.982, 0.958, 0.925],
            blood: [0.432, 0.258, 0.228],
            fatLine: [0.940, 0.868, 0.742],
            brown: [0.735, 0.432, 0.202],
            char: [0.268, 0.158, 0.102],
            skinBase: [0.262, 0.242, 0.220],
            skinSilver: [0.568, 0.570, 0.552],
            skinChar: [0.105, 0.086, 0.070],
            commaSpace: [3.30, 4.20],
            fatMarble: 0.30, sss: 0.15, oil: 0.52
        },
        // トラウトサーモン。大ぶりで淡く、脂の差しがはっきり出る
        trout: {
            label: "トラウトサーモン",
            length: 16.4, width: 5.40, thick: 2.55,
            curl: 0.48,
            flesh: [0.955, 0.660, 0.492],
            fleshDeep: [0.912, 0.552, 0.392],
            fleshPale: [0.978, 0.828, 0.732],
            belly: [0.976, 0.918, 0.858],
            comma: [0.980, 0.930, 0.868],
            albumin: [0.990, 0.975, 0.952],
            blood: [0.545, 0.372, 0.322],
            fatLine: [0.968, 0.928, 0.832],
            brown: [0.806, 0.545, 0.298],
            char: [0.322, 0.208, 0.140],
            skinBase: [0.315, 0.295, 0.272],
            skinSilver: [0.658, 0.660, 0.645],
            skinChar: [0.130, 0.110, 0.092],
            commaSpace: [3.90, 4.90],
            fatMarble: 0.82, sss: 0.26, oil: 0.72
        }
    };

    // 焼き加減
    const GRILLS = {
        light: { label: "浅め", char: 0.48 },
        normal: { label: "ふつう", char: 1.00 },
        deep: { label: "しっかり", char: 1.62 }
    };

    const GLOBAL = {
        // --- 分割
        segmentsLength: 208,       // 背〜腹の分割
        segmentsRound: 224,        // 断面まわりの分割

        // --- テクスチャ
        textureSize: 1024,         // 周長 13cm / 全長 12.6cm ≒ 正方形なので 1:1 でよい
        bumpLevel: 1.05,

        // --- 献立
        showPlate: true,
        showOroshi: false,         // 大根おろし（既定オフ）
        showShiso: false,          // 大葉（既定オフ）
        showTable: true,

        // --- 皿（焼き魚用の長角皿）
        plateW: 27.5, plateD: 12.4, plateH: 1.20,
        plateRim: 1.45,            // 縁の幅(cm)
        plateSharp: 9.0,           // 角の立ち具合（大きいほど角ばる）
        plateCorner: 0.20,         // 角の反り上がり(cm)

        // --- 描画
        useSSAO: true,
        useDOF: true,
        dofRatio: 0.052,
        dofFStop: 2.4,

        // GUI / Inspector 対策
        // 【対策】GUI をポストプロセスから外すのに、以前はカメラを2台にして
        //         layerMask で分けていた。しかし activeCameras が2台あると
        //         scene.activeCamera が guiCam を指す瞬間ができ、Inspector の
        //         Physics Helper / ギズモ / 選択ハイライトが狂う。
        //         Layer.applyPostProcess = false なら、カメラ1台のまま
        //         GUI だけ Bloom / DOF の後に合成できる。既定はこちら。
        //         true にすると従来のカメラ分離（＋bindDebugCamera）に戻る
        guiOwnCamera: false,

        compactWidth: 700,
        compactMinSide: 480,
        guiMaxScale: 2.2
    };

    const START_CUT = "yumi";
    const START_VARIETY = "ginzake";
    const START_GRILL = "normal";
    const START_SEED = 20260806;
    const BUILD = "sake-B";

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const srgb = (v) => Math.pow(clamp(v, 0, 1), 2.2);
    const lin3 = (c) => new BABYLON.Color3(srgb(c[0]), srgb(c[1]), srgb(c[2]));

    // ---- 断面まわりのパラメータ a の意味づけ ------------------------
    // 【対策】縫い目（a=0 と a=1 が出会う線）は必ず皿に接する側へ置く。
    //         上面に置くといちばん見える場所に継ぎ目の線が走る
    // 断面は「角丸長方形」を辺ごとに固定の予算で一周する。
    // 【対策】超楕円1本で断面を作ると、どこを触っても全周がなめらかな凸に
    //         なり、切り身ではなく枕（＝ステーキ肉の塊）に見える。実物の
    //         切り身は包丁の面なので、上面はほぼ平ら・側壁はほぼ垂直で、
    //         皮と切り口の境に稜線が立つ。辺と角を明示的に作る
    // 【対策】予算を弧長比例にすると、いちばん見える上面が周長の 1/4 しか
    //         テクセルをもらえない。辺ごとに固定で配ってしまうほうが確実
    const A_B1 = 0.11;   // 底面 中央 → 皮側
    const A_C1 = 0.17;   // 皮側 下の角
    const A_W1 = 0.29;   // 皮の壁
    const A_C2 = 0.35;   // 皮側 上の角 ／ ここから切り口
    const A_T = 0.65;   // 上面（切り口）
    const A_C3 = 0.71;   // 内側 上の角
    const A_W2 = 0.83;   // 内側の壁
    const A_C4 = 0.89;   // 内側 下の角
    const RC = 0.30;     // 角の丸み（半寸法に対する比）
    const Z_FLAT = 1 - RC;   // 直線部の端の座標

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
    //  u : 背側(0) → 腹側(1)。皿の上では長辺方向
    //  a : 断面まわり(0..1)。a=0 は底面の中央（皿に接して見えない場所）
    //  ζ : 断面の横方向 (+1 = 皮の側 / -1 = 内側＝背骨のあった側)
    //  η : 断面の縦方向 (-1 = 皿に接する面 / +1 = 上を向く切り口)
    // -----------------------------------------------------------------

    // 切り方。天然鮭の切り身には「弓型」と「半月型」があり、
    // 塩焼きに回るのはふつう弓型（太い骨が片側に寄っている側）
    // 【対策】輪郭を sin と exp の組み合わせで作ると、どう調整しても
    //         左右対称の豆にしかならない。実物の弓型は
    //         「背側の塊 → くびれ → 細長い腹身」という3部構成で、
    //         中心線が S 字を描く。素直にテーブルで持つ
    //   U : 背(0) → 腹(1)
    //   W : 身の肉厚（最大値に対する比）
    //   T : 包丁の刻み幅（ほぼ一定。両端だけ落とす）
    //   Z : 中心線の位置（幅の最大値に対する比。+ が皮の側）
    const CUTS = {
        yumi: {
            label: "弓型",
            lenK: 1.00, widK: 1.00,
            U: [0.000, 0.080, 0.180, 0.300, 0.420, 0.520, 0.620, 0.700, 0.780, 0.860, 0.930, 1.000],
            W: [0.300, 0.600, 0.855, 0.960, 1.000, 0.885, 0.640, 0.435, 0.325, 0.262, 0.218, 0.175],
            T: [0.720, 0.925, 0.982, 1.000, 1.000, 0.995, 0.982, 0.962, 0.932, 0.882, 0.792, 0.560],
            Z: [-0.185, -0.135, -0.062, -0.022, 0.018, 0.052, 0.100, 0.120, 0.112, 0.082, 0.028, -0.035],
            arc: [0.38, 1.10, 1.55]        // 弧の中心（長さ / 皮からの距離 / 引き伸ばし）
        },
        hangetsu: {
            label: "半月型",
            // 【対策】「半月」を額面どおり半円にすると饅頭になる。実物は
            //         縦横比 3:1 前後の浅い弦月で、弧はかなり平たい
            lenK: 0.92, widK: 0.87,
            U: [0.000, 0.080, 0.180, 0.300, 0.420, 0.520, 0.620, 0.700, 0.780, 0.860, 0.930, 1.000],
            W: [0.300, 0.560, 0.820, 0.950, 1.000, 0.985, 0.930, 0.848, 0.720, 0.560, 0.380, 0.160],
            T: [0.740, 0.930, 0.985, 1.000, 1.000, 0.998, 0.990, 0.975, 0.950, 0.905, 0.815, 0.575],
            // 内側の縁（背骨を通した切り口）はほぼ直線。Z ≒ -0.085 + W/2 に
            // 背骨跡のわずかな膨らみを足したもの
            Z: [0.065, 0.193, 0.318, 0.375, 0.396, 0.390, 0.366, 0.330, 0.271, 0.193, 0.104, -0.005],
            arc: [0.46, 1.38, 1.60]
        }
    };

    // 断面の輪郭。上面は丸く、底面は平ら（皿に接して潰れている）
    // 【対策】上下で冪を変えても φ=0, π では |sinφ|^e が 0 に潰れるので
    //         位置は連続。接線も両側で垂直なので折れ線は出ない
    // 【対策】P_TOP を 3 台にすると上面がドーム状に張り、切り身ではなく
    //         コッペパンに見える。切り口は包丁の面なのでほぼ平ら。
    //         皮との角も立たせる
    //  a = 0 は底面の中央（皿に接して見えない場所）。そこから
    //  底 → 皮側の角 → 皮の壁 → 皮側の角 → 上面 → 内側の角 → 内側の壁
    //  → 内側の角 → 底、と一周する
    const TOP_CROWN = 0.055;      // 上面のわずかな盛り上がり
    function ringZY(a) {
        const s = Z_FLAT;
        let z, y, t;
        if (a < A_B1) { t = a / A_B1; z = t * s; y = -1; }
        else if (a < A_C1) { t = (a - A_B1) / (A_C1 - A_B1); const th = (t - 1) * Math.PI / 2; z = s + RC * Math.cos(th); y = -s + RC * Math.sin(th); }
        else if (a < A_W1) { t = (a - A_C1) / (A_W1 - A_C1); z = 1; y = -s + t * 2 * s; }
        else if (a < A_C2) { t = (a - A_W1) / (A_C2 - A_W1); const th = t * Math.PI / 2; z = s + RC * Math.cos(th); y = s + RC * Math.sin(th); }
        else if (a < A_T) { t = (a - A_C2) / (A_T - A_C2); z = s - t * 2 * s; y = 1 + TOP_CROWN * Math.sin(Math.PI * t); }
        else if (a < A_C3) { t = (a - A_T) / (A_C3 - A_T); const th = (1 + t) * Math.PI / 2; z = -s + RC * Math.cos(th); y = s + RC * Math.sin(th); }
        else if (a < A_W2) { t = (a - A_C3) / (A_W2 - A_C3); z = -1; y = s - t * 2 * s; }
        else if (a < A_C4) { t = (a - A_W2) / (A_C4 - A_W2); const th = (2 + t) * Math.PI / 2; z = -s + RC * Math.cos(th); y = -s + RC * Math.sin(th); }
        else { t = (a - A_C4) / (1 - A_C4); z = -s + t * s; y = -1; }
        return [z, y];
    }

    // 皮の帯（0..1）。皮は「底面の縁から上面の縁まで」＝壁と両角ぜんぶ。
    // 【対策】境目は包丁が入った線なので、にじませない。ぼかすと皮が
    //         身へ溶け込んで、皮の帯ではなく暗いグラデーションに見える
    function skinMaskAt(a) {
        return smooth(A_B1 - 0.007, A_B1 + 0.007, a) * (1 - smooth(A_C2 - 0.007, A_C2 + 0.007, a));
    }

    // 切り口の中での「皮際からの距離」を 0..1 で返す
    // 【対策】原点は切り口の縁。皮帯の高さ方向の中央を原点にすると、
    //         皮下の脂の層がまるごと帯の裏に隠れて一度も身の上に出ない
    function faceQAt(rz) { return clamp((Z_FLAT - rz) / (2 * Z_FLAT), 0, 1); }

    // 側壁（皮側・内側とも）の度合い
    function wallMaskAt(a) {
        return Math.max(
            smooth(A_B1, A_W1 - 0.03, a) * (1 - smooth(A_C2 - 0.03, A_C2 + 0.03, a)),
            smooth(A_T, A_W2 - 0.03, a) * (1 - smooth(A_C4 - 0.03, A_C4 + 0.03, a)));
    }
    // 上面（切り口）の度合い
    function topMaskAt(a) {
        return smooth(A_C2 - 0.05, A_C2 + 0.03, a) * (1 - smooth(A_T - 0.03, A_T + 0.05, a));
    }

    // 個体ごとの形を組み立てる
    function makeShape(cfg, seed) {
        const rng = new Rng(seed);
        const cut = CUTS[cfg.cut] || CUTS.yumi;
        const S = {
            cut: cut,
            L: cfg.length * cut.lenK * rng.range(0.955, 1.045),
            W: cfg.width * cut.widK * rng.range(0.945, 1.055),
            T: cfg.thick * rng.range(0.930, 1.070),
            sway: rng.range(0.80, 1.25),      // S 字の強さ
            curl: cfg.curl * rng.range(0.70, 1.35),
            twist: rng.range(-0.10, 0.10),
            seed: seed
        };
        // 輪郭の細かい揺れ（包丁の入り方と焼き縮みで、輪郭は定規で引いた線にならない）
        S.wob = (u, k) => (Noise.fbm2(u * 5.5 + k * 13.7, k * 7.3, seed + 101 + k * 37, 3) - 0.5);
        return S;
    }

    // 断面の寸法（cm）
    function halfWidthAt(u, S) {
        const base = tableAt(S.cut.U, S.cut.W, u) * S.W * 0.5;
        const wob = S.wob(u, 0) * 0.09 * smooth(0.05, 0.18, u) * (1 - smooth(0.93, 1.0, u));
        return Math.max(0.03, base + wob);
    }
    function halfThickAt(u, S) {
        return Math.max(0.03, tableAt(S.cut.U, S.cut.T, u) * S.T * 0.5
            + S.wob(u, 1) * 0.055 * smooth(0.05, 0.18, u) * (1 - smooth(0.93, 1.0, u)));
    }
    // 中心線の z 位置。弓型の S 字はここが決める
    function centerZAt(u, S) {
        return tableAt(S.cut.U, S.cut.Z, u) * S.W * S.sway + S.wob(u, 2) * 0.14;
    }
    // 焼き縮みによる腹身の反り
    function liftAt(u, S) {
        return S.curl * Math.pow(smooth(0.52, 1.00, u), 1.7)
            + S.curl * 0.22 * smooth(0.22, 0.00, u);
    }
    // 断面のロール（長軸まわりの傾き）。腹身がめくれる
    function rollAt(u, S) {
        return S.twist * smooth(0.0, 1.0, u) - 0.16 * Math.pow(smooth(0.62, 1.0, u), 1.8);
    }

    // 筋節（ミオコンマ）の場。
    // 皮からの距離 ψ を作り、その等高線を弧として使う。
    // 【対策】等間隔の直線にすると畳の目になる。幅 W(u) が変わるだけで
    //         等高線は自然に収束して弧になるので、余計な曲げは足さなくてよい。
    //         ただし腹側では節が斜めに寝るので、位相をゆっくりずらす
    // 【対策】ここが前版の最大の誤り。筋隔の円錐は体軸方向にかなり長く
    //         伸びているので、2cm 厚の輪切りは円錐を「皮から背骨へ向かう
    //         帯」として切る。つまり切り口に出る割れ目は
    //         「皮際からの距離の等高線（＝長辺に平行な細い縞）」ではなく
    //         「長辺を横切る、1.5〜2.5cm 間隔の 5〜6 本の線」。
    //         前版は 0.5〜0.8cm 間隔の縞を長辺方向に引いていたので、
    //         スイカの皮のような模様になっていた
    // 【対策】ψ の基準は「背からの長さ(cm)」。皮際から内側へ向かって
    //         少し斜めに寝て、さらに弓なりに反る
    // 細かい弧（ミオトーム）の中心。身の内側やや腹寄りに置く
    // 【対策】中心を身の真ん中に置くと年輪のような同心円ができる。
    //         実物は腹寄り・内側の角のあたりに中心があり、そこから背・皮の
    //         側へ広がる C 字。中心は身のわずかに外へ出す
    // 中心は切り方ごと（CUTS[].arc）に持つ
    const COMMA_SLANT = 1.15;      // 皮際 → 内側の縁で線がずれる量(cm)
    const COMMA_BOW = 0.55;        // 線のふくらみ(cm)
    function commaPhase(u, a, S, cfg) {
        const q = faceQAt(ringZY(a)[0]);               // 0=皮際, 1=内側の縁
        // 【対策】テクスチャ側の psi と一字一句そろえること。ずれると
        //         「白い線」と「彫った溝」が数ミリ離れて、身割れの横に
        //         理由のない影が走る
        const psi = u * S.L
            + COMMA_SLANT * q
            - COMMA_BOW * Math.sin(Math.PI * q)
            + 0.45 * (Noise.fbm2(q * 3.0, u * 2.2, S.seed + 211, 3) - 0.5)
            + 0.16 * (Noise.fbm2u(a * 16, u * 20, 16, cfg.texSeed + 17, 3) - 0.5)
            + 0.07 * (Noise.fbm2u(a * 40, u * 46, 40, cfg.texSeed + 19, 2) - 0.5);
        const sp = mix(cfg.commaSpace[0], cfg.commaSpace[1], u);
        return psi / sp;
    }

    // 上面（切り口）の大きな身割れ。ジオメトリで出すのはこれだけ
    // 【対策】1mm の細い溝をジオメトリで彫ると、断面 224 分割（≒0.6mm）では
    //         標本化が足りずモアレになる。細い溝は法線マップに任せ、
    //         ジオメトリは 5mm 以上の緩いうねりと大割れだけを持つ
    function macroReliefAt(u, a, S, cfg) {
        const [z] = ringZY(a);
        const up = topMaskAt(a);                       // 切り口の面だけ
        const t = commaPhase(u, a, S, cfg);
        const fr = t - Math.floor(t);
        const d = Math.min(fr, 1 - fr) * 2;            // 0=線の上, 1=節の中央
        // 3本に1本くらいが大きく割れる
        const pick = Noise.v2(Math.floor(t) * 3.31, u * 1.7, S.seed + 313);
        const big = smooth(0.58, 0.86, pick);
        const groove = (1 - smooth(0.0, 0.55, d)) * big * 0.115 * (1 - wallMaskAt(a) * 0.45);
        // 緩いうねり（身が反って波打つ）
        const swell = (Noise.fbm2(u * 4.2, (z + 1) * 2.4, S.seed + 419, 3) - 0.5) * 0.095;
        // 腹身は薄いのでよく波打つ
        const flap = (Noise.fbm2(u * 9.0, (z + 1) * 3.6, S.seed + 523, 2) - 0.5)
            * 0.10 * smooth(0.62, 1.0, u);
        return (swell + flap) * up - groove * up;
    }

    // =================================================================
    // 5. TextureLab
    // =================================================================
    const TextureLab = {
        _tex(name, size, fill, scene) {
            size = Math.max(8, Math.round(size) || 512);
            const dt = new BABYLON.DynamicTexture(name, { width: size, height: size }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(size, size);
            fill(img.data, size);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = false;
            dt.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
            dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
            dt.anisotropicFilteringLevel = 16;
            return dt;
        },

        // -------------------------------------------------------------
        //  切り身の4枚を1パスで焼く
        //  【対策】アルベド・ORM・クリアコートを別々のループで作ると、
        //          同じ fbm を3回計算するうえ、少しでも式がずれると
        //          「焼き色の位置と艶の位置が合わない」状態になる。
        //          艶は焦げの上に乗らない、というのが写実の要なので、
        //          1パスで同時に書き出して整合を保つ
        // -------------------------------------------------------------
        bakeFillet(scene, cfg, S) {
            const N = cfg.textureSize;
            const sd = cfg.texSeed;
            const FL = cfg.flesh, FD = cfg.fleshDeep, FP = cfg.fleshPale, BE = cfg.belly;
            const CM = cfg.comma, AL = cfg.albumin, BL = cfg.blood, FT = cfg.fatLine;
            const BR = cfg.brown, CH = cfg.char;
            const SB = cfg.skinBase, SS = cfg.skinSilver, SC = cfg.skinChar;
            const CHAR = cfg.charAmount;

            const albD = new Uint8ClampedArray(N * N * 4);
            const ormD = new Uint8ClampedArray(N * N * 4);
            const ccD = new Uint8ClampedArray(N * N * 4);
            const H = new Float32Array(N * N);

            // 列（＝断面まわり）ごとに変わらない量は先に出しておく
            const cZ = new Float32Array(N), cY = new Float32Array(N);
            const cSkin = new Float32Array(N), cQ = new Float32Array(N), cWall = new Float32Array(N);
            for (let x = 0; x < N; x++) {
                const r = ringZY(x / N);
                cZ[x] = r[0]; cY[x] = r[1];
                cSkin[x] = skinMaskAt(x / N);
                cQ[x] = faceQAt(r[0]);
                cWall[x] = wallMaskAt(x / N);
            }

            for (let py = 0; py < N; py++) {
                const v = py / N;                        // = u（背→腹）
                const wcm = halfWidthAt(v, S) * 2;
                const sp = mix(cfg.commaSpace[0], cfg.commaSpace[1], v);
                const belly = smooth(0.68, 0.985, v);    // 腹身
                const dorsal = smooth(0.16, 0.00, v);    // 背側の端
                // 血合いの縦方向の広がり（側線の高さ＝中ほど）
                const bloodEnv = Math.exp(-Math.pow((v - 0.52) / 0.285, 2)) * (1 - belly * 0.75);
                // 端は焼き縮んで焦げやすい
                const endChar = smooth(0.10, 0.00, v) + smooth(0.88, 1.00, v) * 1.25;
                // 【対策】sweep のキャップは中心1頂点にリング全周（UV 0→1）を
                //         張るので、断面をどれだけ小さくしても放射状のスミアが
                //         必ず出る。ただし実物の端は、背側＝皮が回り込んだ稜線、
                //         腹の先＝白い膜、でどちらも一様な面。端の数%を一様色に
                //         寄せてしまえば、そもそもスミアするものが無くなる
                const capD = smooth(0.050, 0.000, v);   // 背側の端
                const capV = smooth(0.950, 1.000, v);   // 腹の先

                for (let x = 0; x < N; x++) {
                    const u = x / N, i = py * N + x, o = i * 4;
                    const rz = cZ[x], ry = cY[x], skinM = cSkin[x], wall = cWall[x];
                    const qf = cQ[x];                    // 0=皮際 1=内側の縁
                    const dSkin = qf * wcm;              // 切り口の中での皮からの距離(cm)
                    const faceUp = smooth(-0.80, 0.80, ry);

                    // ---------------------------------------------------
                    //  身（切り口）
                    // ---------------------------------------------------
                    // 筋節。長辺を横切る 5〜6 本の割れ目（commaPhase と同式）
                    const psi = v * S.L
                        + COMMA_SLANT * qf
                        - COMMA_BOW * Math.sin(Math.PI * qf)
                        + 0.45 * (Noise.fbm2(qf * 3.0, v * 2.2, S.seed + 211, 3) - 0.5)
                        + 0.16 * (Noise.fbm2u(u * 16, v * 20, 16, sd + 17, 3) - 0.5)
                        + 0.07 * (Noise.fbm2u(u * 40, v * 46, 40, sd + 19, 2) - 0.5);
                    const t = psi / sp;
                    const fr = t - Math.floor(t);
                    const dcm = Math.min(fr, 1 - fr) * sp;
                    // 【対策】間隔を 2cm 台にしたのに線幅を 0.5mm のままにすると
                    //         広い面にヘアラインが数本走るだけになる。実物の
                    //         割れ目は 1〜2mm、その両脇が数ミリ白くほぐれる
                    const lw = 0.090 + 0.100 * Noise.fbm2(qf * 5.0, v * 9.0, S.seed + 29, 2);
                    // 【対策】全部の線を同じ濃さで引くと定規の目盛りになる。
                    //         実物は深く裂けた節と、浅い節が混じる
                    const pick = Noise.v2(Math.floor(t) * 3.31, qf * 1.7, S.seed + 313);
                    // 【対策】線を端から端まで同じ濃さで通すとコーデュロイになる。
                    //         実物の身割れは途中で消えたり、また現れたりする。
                    //         線に沿う方向＝いまは qf（幅方向）なので、そちらで揺らす
                    const brk = clamp(0.25 + 1.20 * Noise.fbm2(qf * 3.6 + v * 2.0, v * 7.0, S.seed + 331, 3), 0, 1);
                    // 【対策】割れ目は皮のきわまで届く。側壁で消すのは内側だけ、
                    //         それも弱く
                    const strong = 1.15 * smooth(0.62, 0.94, pick) * (1 - wall * 0.35) * brk;
                    const core = clamp((1 - smooth(lw * 0.35, lw, dcm)) * strong, 0, 1);
                    const halo = clamp((1 - smooth(lw, lw * 3.4, dcm)) * strong * 0.70, 0, 1);
                    // 【対策】割れ目を「白い線」で描くとシールを貼ったように見える。
                    //         実物は溝の底が暗く、その両脇が白く盛り上がっている。
                    //         芯（溝底）と唇（隆起）を別々に持つ
                    const lip = clamp((smooth(lw * 0.7, lw * 1.5, dcm) - smooth(lw * 2.2, lw * 3.6, dcm)) * strong, 0, 1);

                    // 細かい筋節（ミオトーム）の入れ子の弧。
                    // 【対策】切り口の「鮭らしさ」はほぼこれで決まる。粗い割れ目
                    //         だけだと、のっぺりした一枚の面に数本傷が入っただけ。
                    //         皮際からの距離の等高線を 3〜5mm 間隔で薄く重ねる。
                    //         幅が変わるので等高線はひとりでに収束して弧になる
                    // 【対策】等高線の基準を「皮際からの距離」にすると、長辺に
                    //         平行な直線が並ぶだけでスイカの皮になる。実物の
                    //         切り口は筋隔の円錐を輪切りにした断面なので、
                    //         身の内側にある一点を中心とした入れ子の弧になる。
                    //         中心を身の外へ少し出し、長さ方向に引き伸ばした
                    //         楕円距離を使うと、皮際では皮と平行・腹側では
                    //         回り込む、という実物の見え方になる
                    const AX = (v - S.cut.arc[0]) * S.L / S.cut.arc[2];
                    const AY = dSkin - S.cut.arc[1] * S.W;
                    const spF = mix(0.36, 0.50, v);
                    const psiF = Math.sqrt(AX * AX + AY * AY)
                        + 0.26 * (Noise.fbm2(qf * 4.5, v * 3.0, S.seed + 611, 3) - 0.5)
                        + 0.080 * (Noise.fbm2u(u * 13, v * 15, 13, sd + 617, 3) - 0.5)
                        + 0.024 * (Noise.fbm2u(u * 34, v * 38, 34, sd + 631, 2) - 0.5);
                    const tF = psiF / spF;
                    const frF = tF - Math.floor(tF);
                    const dF = Math.min(frF, 1 - frF) * spF;
                    const lwF = 0.018 + 0.016 * Noise.fbm2u(u * 18, v * 20, 18, sd + 619, 2);
                    // 【対策】等間隔で端から端まで通すとコーデュロイになる。
                    //         濃い弧・消えかけの弧を混ぜ、弧に沿っても途切れさせる
                    const fineStr = (0.15 + 1.05 * Noise.v2(Math.floor(tF) * 2.71, v * 2.1, S.seed + 623))
                        * clamp(0.25 + 1.15 * Noise.fbm2(v * 4.5 + qf * 1.5, qf * 6.0, S.seed + 637, 3), 0, 1)
                        * (1 - wall * 0.92) * (1 - skinM);
                    const fine = clamp((1 - smooth(lwF * 0.4, lwF * 1.7, dF)) * fineStr, 0, 1);
                    // 節と節のあいだはわずかに盛り上がる（キルトのような膨らみ）
                    const quilt = Math.cos(TAU * frF) * 0.5 * (1 - wall) * (1 - skinM);
                    // 【対策】粗い割れ目は実物ではせいぜい1〜2本。5本も等間隔で
                    //         入れると白いバーコードになる。間隔を広げ、
                    //         ほとんどの節では出さない


                    // 肉の濃淡。低周波のムラ + 脂の差し + 繊維断面の細かい粒
                    const tone = Noise.fbm2u(u * 7, v * 9, 7, sd + 41, 3);
                    const marble = smooth(0.54, 0.86, Noise.fbm2u(u * 26, v * 17, 26, sd + 53, 3))
                        * cfg.fatMarble * (0.45 + 0.85 * belly);
                    // 【対策】切り口は筋繊維の「断面」。縦筋ではなく細かい粒に
                    //         見える。ここで縦筋を入れると刺身の柵の側面になる
                    const grain = Noise.fbm2u(u * 40, v * 40, 40, sd + 181, 3);
                    const speck = smooth(0.68, 0.90, Noise.fbm2u(u * 62, v * 62, 62, sd + 191, 2));

                    let cr = mix(FD[0], FL[0], smooth(0.28, 0.78, tone));
                    let cg = mix(FD[1], FL[1], smooth(0.28, 0.78, tone));
                    let cb = mix(FD[2], FL[2], smooth(0.28, 0.78, tone));
                    // 内側（背骨側）と背の縁はやや淡い
                    const pale = smooth(0.58, 1.0, qf) * 0.42 + dorsal * 0.22;
                    cr = mix(cr, FP[0], pale); cg = mix(cg, FP[1], pale); cb = mix(cb, FP[2], pale);
                    // 腹身
                    cr = mix(cr, BE[0], belly * 0.74); cg = mix(cg, BE[1], belly * 0.74); cb = mix(cb, BE[2], belly * 0.74);
                    // 繊維断面の粒。一様な面にしないための細かいムラ
                    const gk = 0.945 + 0.115 * grain;
                    cr *= gk; cg *= gk; cb *= gk;
                    cr = mix(cr, FD[0], speck * 0.16); cg = mix(cg, FD[1], speck * 0.16); cb = mix(cb, FD[2], speck * 0.16);
                    // 脂の差し
                    cr = mix(cr, CM[0], marble * 0.55); cg = mix(cg, CM[1], marble * 0.55); cb = mix(cb, CM[2], marble * 0.55);
                    // 細かい弧（薄く）→ 割れ目の唇（白）→ 割れ目の芯（暗い溝底）
                    cr = mix(cr, CM[0], fine * 0.30); cg = mix(cg, CM[1], fine * 0.30); cb = mix(cb, CM[2], fine * 0.30);
                    const qk = 1 + quilt * 0.030;
                    cr *= qk; cg *= qk; cb *= qk;
                    cr = mix(cr, CM[0], halo * 0.26); cg = mix(cg, CM[1], halo * 0.26); cb = mix(cb, CM[2], halo * 0.26);
                    cr = mix(cr, AL[0], lip * 0.72); cg = mix(cg, AL[1], lip * 0.72); cb = mix(cb, AL[2], lip * 0.72);
                    cr = mix(cr, FD[0] * 0.80, core * 0.42); cg = mix(cg, FD[1] * 0.80, core * 0.42); cb = mix(cb, FD[2] * 0.80, core * 0.42);

                    // 内側（背骨のあった面）。筋節の弧は出ないが、繊維の
                    // 断面と薄い膜で細かい縦の筋が走る
                    const innerWall = wall * (1 - skinM);
                    if (innerWall > 0.001) {
                        const st = Noise.fbm2u(u * 90, v * 10, 90, sd + 233, 3);
                        const kk = mix(1.0, 0.90 + 0.22 * st, innerWall);
                        cr *= kk; cg *= kk; cb *= kk;
                        const memb = smooth(0.58, 0.88, Noise.fbm2u(u * 14, v * 9, 14, sd + 239, 3)) * innerWall;
                        cr = mix(cr, FP[0], memb * 0.35); cg = mix(cg, FP[1], memb * 0.35); cb = mix(cb, FP[2], memb * 0.35);
                    }

                    // 血合い。皮際 8mm ほどに灰褐色の帯
                    // 【対策】皮際ちょうどに置くと、この直後に塗る脂の層に
                    //         まるごと上書きされて一度も見えない。1mm ほど
                    //         内側から立ち上げる
                    const blood = clamp(smooth(0.06, 0.26, dSkin) * smooth(1.05, 0.32, dSkin) * bloodEnv
                        * (0.55 + 0.75 * Noise.fbm2u(u * 9, v * 11, 9, sd + 67, 3)), 0, 1);
                    cr = mix(cr, BL[0], blood * 0.86);
                    cg = mix(cg, BL[1], blood * 0.86);
                    cb = mix(cb, BL[2], blood * 0.86);

                    // 皮下の脂の層。写真で「オレンジと黒のあいだの白い線」
                    // 【対策】これを省くと皮が身に直接塗られた模様に見える。
                    //         幅は 1〜2mm。太くすると魚肉ソーセージになる
                    const fw = 0.10 + 0.085 * Noise.fbm2u(u * 10, v * 22, 10, sd + 71, 2);
                    const fat = clamp((1 - smooth(fw * 0.4, fw * 1.8, dSkin)) * (0.72 + 0.42 * belly), 0, 1);
                    cr = mix(cr, FT[0], fat * 0.94);
                    cg = mix(cg, FT[1], fat * 0.94);
                    cb = mix(cb, FT[2], fat * 0.94);

                    // 焼き色。斑に入り、縁と端で濃い。溝の底までは焼けない
                    const bp = Noise.fbm2u(u * 5, v * 6, 5, sd + 83, 4);
                    const bp2 = Noise.fbm2u(u * 13, v * 15, 13, sd + 97, 3);
                    let brown = smooth(0.455, 0.735, bp) * 1.05 + smooth(0.600, 0.860, bp2) * 0.42;
                    brown *= mix(0.58, 1.0, faceUp);                 // 皿側は焼き色が弱い
                    brown *= (1 - core * 0.55);                      // 割れ目の底は焼けていない
                    brown *= (1 + endChar * 0.85);
                    brown *= CHAR;
                    const bA = clamp(brown, 0, 1);
                    // 【対策】焦げをしきい値低めで散らすと、点々が汚れに見える。
                    //         焦げるのは「よく焼けた面の中でもさらに高いところ」だけ
                    const charAmt = clamp((brown - 1.02) * 1.9, 0, 1) * smooth(0.62, 0.94, bp2);
                    cr = mix(cr, BR[0], bA * 0.80);
                    cg = mix(cg, BR[1], bA * 0.80);
                    cb = mix(cb, BR[2], bA * 0.80);
                    cr = mix(cr, CH[0], charAmt * 0.72); cg = mix(cg, CH[1], charAmt * 0.72); cb = mix(cb, CH[2], charAmt * 0.72);

                    // 固まったたんぱく（アルブミン）。身割れに沿って白く滲む
                    const alb = core
                        * smooth(0.52, 0.86, Noise.fbm2u(u * 19, v * 21, 19, sd + 103, 3))
                        * (0.55 + 0.70 * belly) * (0.35 + 0.85 * faceUp);
                    cr = mix(cr, AL[0], alb * 0.95); cg = mix(cg, AL[1], alb * 0.95); cb = mix(cb, AL[2], alb * 0.95);

                    // ---------------------------------------------------
                    //  皮
                    // ---------------------------------------------------
                    // まだらな銀化 / 焦げ / 水ぶくれ
                    const sil = smooth(0.38, 0.76, Noise.fbm2u(u * 9, v * 7, 9, sd + 131, 3));
                    // 【対策】焦げのしきい値が低いと皮がほぼ全面まっ黒になり、
                    //         ナスの表面のように見える。焦げるのは一部だけ
                    const sch = clamp(smooth(0.58, 0.90, Noise.fbm2u(u * 7, v * 5, 7, sd + 149, 3)) * CHAR, 0, 1);
                    // 【対策】水ぶくれを高周波で作ると白い粉を振ったように見える。
                    //         実物は数ミリの丸い膨らみ。周波数を落として面で出す
                    const blis = smooth(0.58, 0.86, Noise.fbm2u(u * 22, v * 17, 22, sd + 163, 2));
                    // 鱗の名残。体軸方向（a＝帯の高さ）に列、背腹方向（v）に段が並ぶ。
                    // 【対策】焼き鮭の皮は「一様な黒い革」ではない。この細かい
                    //         格子が無いと、法線マップが真っ平らになって
                    //         塗装した面に見える
                    // 【対策】整った格子のまま出すと、皮が孔あき鋼板のように見える。
                    //         位置を低周波ノイズで揺らし、まだらに消す
                    const scw = (Noise.fbm2u(u * 6, v * 5, 6, sd + 173, 2) - 0.5) * 1.6;
                    const scx = u * 33 + scw, scy = v * 46 + scw * 0.7;
                    const srow = Math.floor(scy);
                    const sox = scx + (srow & 1) * 0.5;
                    const dx = sox - Math.floor(sox) - 0.5, dy = (scy - srow) - 0.5;
                    const scale = (1 - smooth(0.24, 0.46, Math.sqrt(dx * dx + dy * dy * 2.1)))
                        * smooth(0.30, 0.72, Noise.fbm2u(u * 8, v * 7, 8, sd + 179, 3));
                    let sr = mix(SB[0], SS[0], sil * 0.72);
                    let sg = mix(SB[1], SS[1], sil * 0.72);
                    let sb = mix(SB[2], SS[2], sil * 0.72);
                    sr = mix(sr, SC[0], sch * 0.88); sg = mix(sg, SC[1], sch * 0.88); sb = mix(sb, SC[2], sch * 0.88);
                    // 水ぶくれは乾いて白茶けて浮く
                    sr = mix(sr, 0.66, blis * 0.34); sg = mix(sg, 0.62, blis * 0.34); sb = mix(sb, 0.55, blis * 0.34);
                    // 鱗の縁がわずかに明るい
                    sr = mix(sr, 0.58, scale * 0.075); sg = mix(sg, 0.58, scale * 0.075); sb = mix(sb, 0.56, scale * 0.075);
                    // 細かい縮れじわ
                    const wr = Noise.fbm2u(u * 70, v * 26, 70, sd + 197, 3);
                    const wk = 0.84 + 0.34 * wr;
                    sr *= wk; sg *= wk; sb *= wk;
                    // 帯の上下の縁（切り口と接する線）はわずかに明るい
                    const sedge = 1 - smooth(0.0, 0.030, Math.min(Math.abs(u - A_B1), Math.abs(u - A_C2)));
                    sr = mix(sr, 0.50, sedge * 0.32); sg = mix(sg, 0.47, sedge * 0.32); sb = mix(sb, 0.42, sedge * 0.32);

                    // ---------------------------------------------------
                    //  合成
                    // ---------------------------------------------------
                    let R = mix(cr, sr, skinM), G = mix(cg, sg, skinM), B = mix(cb, sb, skinM);
                    // 端を一様色へ寄せる（背側＝皮、腹の先＝白い膜）
                    const skinEndR = mix(SB[0], SS[0], 0.28), skinEndG = mix(SB[1], SS[1], 0.28), skinEndB = mix(SB[2], SS[2], 0.28);
                    R = mix(R, skinEndR, capD); G = mix(G, skinEndG, capD); B = mix(B, skinEndB, capD);
                    R = mix(R, BE[0], capV); G = mix(G, BE[1], capV); B = mix(B, BE[2], capV);
                    albD[o] = R * 255; albD[o + 1] = G * 255; albD[o + 2] = B * 255; albD[o + 3] = 255;

                    // ---- 高さ場 --------------------------------------
                    let h = 0.56 + (grain - 0.5) * 0.30 - speck * 0.09;
                    h += quilt * 0.10 - fine * 0.09;         // 節ごとのふくらみと細い谷
                    h -= core * 0.44;                        // 身割れの溝は深く
                    h += lip * 0.20;                         // 溝の両脇は盛り上がる
                    h += alb * 0.24;                         // たんぱくの粒
                    h -= charAmt * 0.12;                     // 焦げは縮む
                    h += marble * 0.05;
                    const sh = 0.50 + blis * 0.30 + scale * 0.17 + (wr - 0.5) * 0.30 - sch * 0.16;
                    // 高さ場も端では平らに。ここが荒れていると法線マップが
                    // 放射状に流れ、キャップが花びらのように割れて見える
                    let hh = mix(h, sh, skinM);
                    hh = mix(hh, 0.52, Math.max(capD, capV));
                    H[i] = clamp(hh, 0, 1);

                    // ---- ORM -----------------------------------------
                    // 【対策】艶を一様にすると食品サンプルになる。実物は
                    //         「脂の乗った濡れた面」と「焼けて乾いた面」が
                    //          斑に混じる。乾きの分布は焼き色と同じ場から取る
                    let rough = mix(0.60, 0.48, belly);
                    rough = mix(rough, 0.82, bA * 0.75);                   // 焼けたところは乾く
                    rough = mix(rough, 0.90, charAmt);
                    rough = mix(rough, 0.42, marble * 0.55);               // 脂は濡れて光る
                    rough = mix(rough, 0.50, alb * 0.30);
                    const skinRough = mix(0.60, 0.88, sch) * (1 - blis * 0.22) * (1 - scale * 0.10);
                    rough = mix(rough, skinRough, skinM);
                    // 溝と皮際は光が届かない
                    let ao = 1.0;
                    ao = mix(ao, 0.70, core * 0.70);
                    ao = mix(ao, 0.84, halo * 0.30);
                    ao = mix(ao, 0.78, (1 - smooth(0.0, 0.16, dSkin)) * 0.60 * (1 - skinM));
                    const capA2 = Math.max(capD, capV);
                    rough = mix(rough, mix(0.72, 0.58, capV), capA2);
                    ao = mix(ao, 0.94, capA2);
                    ormD[o] = clamp(ao, 0, 1) * 255;
                    ormD[o + 1] = clamp(rough, 0.05, 1) * 255;
                    ormD[o + 2] = 0; ormD[o + 3] = 255;

                    // ---- クリアコート（脂の膜）------------------------
                    // 【対策】焦げの上には脂の膜が残らない。ここを一様に
                    //         かけると、焦げまでニス塗りに見える
                    const oilPatch = smooth(0.38, 0.78, Noise.fbm2u(u * 13, v * 10, 13, sd + 211, 3));
                    let cci = cfg.oil * (0.26 + 0.90 * oilPatch);
                    cci *= (0.40 + 0.80 * faceUp);
                    cci *= (1 - charAmt * 0.88);
                    cci = mix(cci, cfg.oil * 0.50 * (0.25 + 0.85 * blis), skinM);
                    let ccr = mix(0.12, 0.34, 1 - oilPatch);
                    ccr = mix(ccr, 0.30, skinM);
                    cci = mix(cci, 0.20, capA2);
                    ccr = mix(ccr, 0.28, capA2);
                    ccD[o] = clamp(cci, 0, 1) * 255;
                    ccD[o + 1] = clamp(ccr, 0.02, 1) * 255;
                    ccD[o + 2] = 0; ccD[o + 3] = 255;
                }
            }

            const albedo = this._tex("sakeAlbedo", N, (d) => d.set(albD), scene);
            const orm = this._tex("sakeORM", N, (d) => d.set(ormD), scene);
            const cc = this._tex("sakeCC", N, (d) => d.set(ccD), scene);
            const normal = this.normalFromHeight("sakeNormal", scene, N, H, 1.55);
            return { albedo, orm, cc, normal };
        },

        normalFromHeight(name, scene, N, hf, strength) {
            return this._tex(name, N, (d) => {
                for (let y = 0; y < N; y++) {
                    for (let x = 0; x < N; x++) {
                        const xl = hf[y * N + ((x - 1 + N) % N)], xr = hf[y * N + ((x + 1) % N)];
                        const yu = hf[Math.max(0, y - 1) * N + x], yd = hf[Math.min(N - 1, y + 1) * N + x];
                        // 【対策】(yu - yd) = -dh/dv は「V が上を向く」OpenGL 系の規約。
                        //         Babylon の接空間は V が下向きなので、そのままだと
                        //         u方向は正・v方向は逆というねじれた法線になる
                        let nx = (xl - xr) * strength, ny = (yd - yu) * strength, nz = 1;
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

        // -------------------------------------------------------------
        //  皿（粉引き風の白い長角皿）。タイリングして使うので上下左右に折り返す
        // -------------------------------------------------------------
        plate(scene, size, seed) {
            const H = new Float32Array(size * size);
            const tex = this._tex("plateAlbedo", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    for (let x = 0; x < N; x++) {
                        const u = x / N, v = y / N, i = y * N + x, o = i * 4;
                        // 釉のわずかなムラ
                        const mo = Noise.fbm2p(u * 6, v * 6, 6, 6, seed + 11, 4);
                        let c = 0.905 + (mo - 0.5) * 0.075;
                        // 鉄粉の点（粉引きの黒い斑）
                        const sp = Noise.v2p(u * 90, v * 90, 90, 90, seed + 23);
                        const dot = smooth(0.962, 0.995, sp);
                        c = mix(c, 0.34, dot * 0.85);
                        // 貫入（細かいひび）
                        const cr = Noise.fbm2p(u * 9, v * 9, 9, 9, seed + 37, 3);
                        const crack = 1 - smooth(0.0, 0.020, Math.abs(cr - 0.5));
                        c = mix(c, 0.72, crack * 0.28);
                        // わずかに温かい白
                        d[o] = c * 255; d[o + 1] = (c * 0.992) * 255; d[o + 2] = (c * 0.968) * 255; d[o + 3] = 255;
                        H[i] = 0.5 + (mo - 0.5) * 0.6 - dot * 0.35 - crack * 0.25;
                    }
                }
            }, scene);
            const nrm = this.normalFromHeight("plateNormal", scene, size, H, 0.55);
            const orm = this._tex("plateORM", size, (d, N) => {
                for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                    const u = x / N, v = y / N, o = (y * N + x) * 4;
                    const mo = Noise.fbm2p(u * 6, v * 6, 6, 6, seed + 11, 4);
                    const sp = Noise.v2p(u * 90, v * 90, 90, 90, seed + 23);
                    let r = 0.24 + (mo - 0.5) * 0.16;
                    r = mix(r, 0.62, smooth(0.962, 0.995, sp));   // 鉄粉のところは釉が痩せる
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
            const tex = this._tex("woodAlbedo", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    for (let x = 0; x < N; x++) {
                        const u = x / N, v = y / N, i = y * N + x, o = i * 4;
                        // 年輪は「まっすぐな縞をゆっくり歪ませたもの」
                        const warp = (Noise.fbm2p(u * 3, v * 7, 3, 7, seed + 5, 4) - 0.5) * 0.42;
                        const g = (v * 13 + warp * 6);
                        const ring = Math.abs(((g - Math.floor(g)) - 0.5) * 2);
                        let k = smooth(0.32, 0.96, ring);
                        // 導管の細い筋
                        k = clamp(k + (Noise.fbm2p(u * 5, v * 160, 5, 160, seed + 19, 2) - 0.5) * 0.30, 0, 1);
                        let cr = mix(B[0], A[0], k), cg = mix(B[1], A[1], k), cb = mix(B[2], A[2], k);
                        const knot = smooth(0.72, 0.90, Noise.fbm2p(u * 4, v * 4, 4, 4, seed + 31, 3)) * 0.8;
                        cr = mix(cr, K[0], knot); cg = mix(cg, K[1], knot); cb = mix(cb, K[2], knot);
                        d[o] = cr * 255; d[o + 1] = cg * 255; d[o + 2] = cb * 255; d[o + 3] = 255;
                        H[i] = 0.55 - k * 0.30 - knot * 0.25;
                    }
                }
            }, scene);
            const nrm = this.normalFromHeight("woodNormal", scene, size, H, 0.60);
            for (const t of [tex, nrm]) { t.wrapU = t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE; }
            return { albedo: tex, normal: nrm };
        }
    };

    // =================================================================
    // 6. Salmon
    // =================================================================
    const OPAQUE = BABYLON.PBRMaterial.PBRMATERIAL_OPAQUE;

    class Skin {
        constructor(scene, cfg) {
            this.key = cfg.variety + "|" + cfg.grill + "|" + cfg.cut;
            // 【対策】テクスチャは「品種 × 焼き加減」でだけ決める。個体乱数まで
            //         入れると、切り身を1枚作り直すたびに 1024² を4枚焼き直して
            //         GUI が数秒固まる。代表形状 Snom を使い、身割れの場も
            //         この Snom で作ってテクスチャと完全に一致させる
            this.Snom = makeShape(cfg, cfg.texSeed);
            const T = TextureLab.bakeFillet(scene, cfg, this.Snom);
            this.tex = T;

            const m = new BABYLON.PBRMaterial("sakeMat", scene);
            m.albedoTexture = T.albedo;
            m.metallic = 0.0;
            m.roughness = 1.0;                     // 実値は ORM の G
            m.metallicTexture = T.orm;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.bumpTexture = T.normal;
            m.bumpTexture.level = cfg.bumpLevel;
            m.transparencyMode = OPAQUE;
            m.useAlphaFromAlbedoTexture = false;
            // 脂の膜。強さも粗さもテクスチャ側で決めるので係数は 1
            // 【対策】クリアコートを一様にかけると、焦げまでニスを塗ったように
            //         テカる。焼き魚が食品サンプルに見える最大の原因がこれ
            m.clearCoat.isEnabled = true;
            m.clearCoat.intensity = 1.0;
            m.clearCoat.roughness = 1.0;
            m.clearCoat.texture = T.cc;
            m.clearCoat.useRoughnessFromMainTexture = true;
            m.clearCoat.indexOfRefraction = 1.42;
            // 加熱でたんぱくが固まっているので、生の刺身ほどは透けない。
            // それでも薄い腹身の縁は光を通す
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.tintColor = lin3([0.96, 0.60, 0.44]);
            m.subSurface.translucencyIntensity = cfg.sss;
            m.subSurface.minimumThickness = 0.6;
            m.subSurface.maximumThickness = 3.4;
            this.mat = m;
        }
        // 表示モード 0=通常 / 1=白クレイ（法線のみ）/ 2=法線マップそのもの
        // 【対策】法線の向きが正しいかは、アルベドを外して陰影だけにするのが
        //         いちばん確実。焼き色と身の色差に紛れて判定できない
        setDebug(mode) {
            const m = this.mat, C3 = BABYLON.Color3;
            if (mode === 2) {
                m.unlit = true; m.disableLighting = true;
                m.albedoTexture = null; m.albedoColor = new C3(0, 0, 0);
                m.emissiveTexture = this.tex.normal; m.emissiveColor = new C3(1, 1, 1);
                m.metallicTexture = null; m.bumpTexture = null;
                m.clearCoat.isEnabled = false; m.subSurface.isTranslucencyEnabled = false;
                return;
            }
            m.unlit = false; m.disableLighting = false;
            m.emissiveTexture = null; m.emissiveColor = new C3(0, 0, 0);
            m.bumpTexture = this.tex.normal;
            m.bumpTexture.level = 1.05;
            if (mode === 1) {
                m.albedoTexture = null; m.albedoColor = new C3(0.82, 0.82, 0.82);
                m.metallicTexture = null; m.metallic = 0; m.roughness = 0.75;
                m.clearCoat.isEnabled = false; m.subSurface.isTranslucencyEnabled = false;
            } else {
                m.albedoTexture = this.tex.albedo; m.albedoColor = new C3(1, 1, 1);
                m.metallicTexture = this.tex.orm; m.roughness = 1.0;
                m.clearCoat.isEnabled = true; m.subSurface.isTranslucencyEnabled = true;
            }
        }
        dispose() {
            // 【対策】DynamicTexture は材質を捨てても道連れにならない。
            //         品種を切り替えるたびに 1024² が4枚ずつ積み上がるので、
            //         明示的に捨てる
            for (const k in this.tex) if (this.tex[k]) this.tex[k].dispose();
            this.mat.dispose();
        }
    }

    class Salmon {
        constructor(scene, cfg, seed, skin) {
            const S = makeShape(cfg, seed);
            const SN = skin.Snom;                 // 身割れの場は代表形状で引く
            this.S = S;
            const NL = cfg.segmentsLength, NR = cfg.segmentsRound;
            const rings = [], centers = [];

            for (let i = 0; i < NL; i++) {
                const u = i / (NL - 1);
                const x = (u - 0.5) * S.L;
                const hw = halfWidthAt(u, S);
                const ht = halfThickAt(u, S);
                const cz = centerZAt(u, S);
                const lift = liftAt(u, S);
                const roll = rollAt(u, S);
                const cr = Math.cos(roll), sr = Math.sin(roll);

                // 断面をまず (z, y) で作る
                const zs = new Float64Array(NR), ys = new Float64Array(NR);
                for (let j = 0; j < NR; j++) {
                    const a = j / (NR - 1);
                    const r = ringZY(a);
                    zs[j] = r[0] * hw;
                    ys[j] = (r[1] + 1) * ht;      // 0 .. 2*ht
                }
                // 断面内の外向き法線を差分で出してから変位する
                // 【対策】超楕円の解析法線を使うと、上下で冪を変えている境目で
                //         向きが飛ぶ。折れ線の差分のほうが素直で安全
                const ring = new Array(NR);
                for (let j = 0; j < NR; j++) {
                    const jm = (j - 1 + (NR - 1)) % (NR - 1);
                    const jp = (j + 1) % (NR - 1);
                    let tz = zs[jp] - zs[jm], ty = ys[jp] - ys[jm];
                    const l = Math.hypot(tz, ty) || 1; tz /= l; ty /= l;
                    let nz = ty, ny = -tz;
                    // 外向きに揃える（断面の中心は (0, ht)）
                    if (nz * zs[j] + ny * (ys[j] - ht) < 0) { nz = -nz; ny = -ny; }
                    const d = macroReliefAt(u, j / (NR - 1), SN, cfg);
                    let pz = zs[j] + nz * d, pyv = ys[j] + ny * d;
                    // ロール（腹身がめくれる）
                    const dz = pz, dy = pyv - ht;
                    const rz2 = dz * cr - dy * sr, ry2 = dz * sr + dy * cr;
                    ring[j] = new V3(x, ht + ry2 + lift, cz + rz2);
                }
                rings.push(ring);
                centers.push(new V3(x, ht + lift, cz));
            }

            const mesh = sweep("sake", rings, centers, scene);
            mesh.material = skin.mat;
            mesh.receiveShadows = true;
            this.mesh = mesh;
            this.root = new BABYLON.TransformNode("sakeRoot", scene);
            mesh.parent = this.root;

            // 皿に置いたときに浮かない／めり込まないよう、最下点を 0 に合わせる
            const bb = mesh.getBoundingInfo().boundingBox;
            mesh.position.y = -bb.minimum.y;
            this.size = {
                len: bb.maximum.x - bb.minimum.x,
                wid: bb.maximum.z - bb.minimum.z,
                hgt: bb.maximum.y - bb.minimum.y
            };
        }
        dispose() { this.mesh.dispose(); this.root.dispose(); }
    }

    // =================================================================
    // 7. Table （皿・大根おろし・大葉・テーブル）
    // =================================================================
    // 焼き魚用の長角皿。輪郭は超楕円（角の丸い長方形）
    // 【対策】内側の輪郭を「中心への相似縮小」で作ると、縁の幅が寸法に
    //         比例してしまう。30 × 13.2 の長角皿では長辺の縁が短辺の
    //         2.3 倍になり、皿に見えない。半径を引いた超楕円にすれば
    //         縁の幅がほぼ一定になり、しかも角で自己交差しない
    //  ρ の並び: 見込みの中央 → 見込み → 縁 → 外周 → 縁の裏 → 高台 → 裏の中央
    // 【対策】皿を「厚い塊 + 垂直な外壁」で作るとまな板になる。実物の角皿は
    //         厚さ 4mm ほどの薄い板が縁で反り上がった形で、裏面が表面を
    //         なぞって薄いまま追従する。だから外周は「壁」ではなく
    //         「丸い口縁」で、そこから裏へすぐ回り込む
    const PLR = [0.000, 0.120, 0.240, 0.320, 0.385, 0.440, 0.475, 0.500, 0.525, 0.560, 0.625, 0.700, 0.780, 0.845, 0.910, 0.960, 1.000];
    const PLD = [1.000, 1.000, 1.000, 1.000, 0.640, 0.290, 0.090, 0.000, 0.020, 0.115, 0.330, 0.640, 1.000, 1.300, 1.480, 1.500, 1.500];
    const PLK = [0.020, 0.520, 0.880, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 1.000, 0.985, 0.880, 0.480, 0.020];
    // 【対策】素地を薄くしても、縁の立ち上がりが高いと卓面から口縁まで
    //         1.5cm を超えて厚く見える。実物の角皿は 1.2cm ほど。
    //         見込み 0.72cm / 口縁 1.20cm / 高台 0.4cm で組む
    const PLY = [0.596, 0.598, 0.607, 0.621, 0.750, 0.908, 0.979, 1.000, 0.967, 0.896, 0.738, 0.583, 0.358, 0.017, 0.117, 0.233, 0.250];
    // 角の反り上がりをどれだけ効かせるか（見込みは 0、口縁で 1）
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
                // 長角皿は四隅が持ち上がる。これが無いと平らな板に見える
                // 【対策】指数が小さいと長辺の中ほどまで持ち上がって、皿が
                //         波打ったポテトチップスに見える。四隅だけに絞る
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
        // 釉の膜。陶器は「素地の上に薄いガラスが載っている」ので
        // クリアコートで表現するのがいちばん近い
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.85;
        m.clearCoat.roughness = 0.10;
        m.clearCoat.indexOfRefraction = 1.50;
        for (const t of [skinTex.albedo, skinTex.orm, skinTex.normal]) { t.uScale = 9; t.vScale = 3; }
        mesh.material = m;
        mesh.receiveShadows = true;
        return mesh;
    }

    // 大根おろし。粒を1本ずつ実体で置く
    // 【対策】半球にノイズを掛けただけの塊は、どう塗っても「白い泡」にしか
    //         見えない。おろしは繊維の切れ端の集合なので、細長い粒を
    //         山なりに積むところまでやらないと質感が出ない
    function buildOroshi(scene, seed, R, Hgt, count) {
        const rng = new Rng(seed);
        const positions = [], indices = [], colors = [];
        const domeY = (r) => Hgt * Math.pow(Math.max(0, 1 - (r / R) * (r / R)), 0.62);
        const V = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
        const F = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [4, 5, 1, 0], [3, 2, 6, 7]];
        let placed = 0, guard = 0;
        while (placed < count && guard++ < count * 12) {
            const rr = R * Math.sqrt(rng.next()) * 0.99;
            const th = rng.range(0, TAU);
            const top = domeY(rr);
            const yy = top * rng.next();
            // 表面近くと裾だけ残す（内部の見えない粒を作らない）
            if (yy < top - 0.38 && yy > 0.20) continue;
            const cx = Math.cos(th) * rr, cz = Math.sin(th) * rr, cy = yy + 0.02;
            // 【対策】粒を大きくすると マッチ棒の山になる。おろし金の目は
            //         1mm 前後。細かくして数で押すほうが「おろし」に見える
            const L = rng.range(0.10, 0.34), W = rng.range(0.038, 0.082), T = rng.range(0.022, 0.046);
            const yaw = rng.range(0, TAU);
            const pitch = rng.gauss(0, 0.30), roll = rng.range(0, TAU);
            const cA = Math.cos(yaw), sA = Math.sin(yaw);
            const cB = Math.cos(pitch), sB = Math.sin(pitch);
            const cC = Math.cos(roll), sC = Math.sin(roll);
            // 面ごとに頂点を分ける（フラットシェーディングにする）
            for (const f of F) {
                const b2 = positions.length / 3;
                for (const vi of f) {
                    let x = V[vi][0] * L * 0.5, y = V[vi][1] * T * 0.5, z = V[vi][2] * W * 0.5;
                    // roll(X) → pitch(Z) → yaw(Y)
                    let y1 = y * cC - z * sC, z1 = y * sC + z * cC;
                    let x2 = x * cB - y1 * sB, y2 = x * sB + y1 * cB;
                    let x3 = x2 * cA - z1 * sA, z3 = x2 * sA + z1 * cA;
                    positions.push(cx + x3, cy + y2, cz + z3);
                    // 大根は真っ白ではない。ごく薄い黄緑と灰みが混じる
                    const g = rng.range(0.0, 1.0);
                    colors.push(0.955 + g * 0.035, 0.960 + g * 0.032, 0.938 + g * 0.030, 1);
                }
                indices.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3);
            }
            placed++;
        }
        const pos = new Float32Array(positions);
        const idx = new Uint32Array(indices);
        const normals = finalize(pos, idx, new V3(0, Hgt * 0.4, 0), 0);
        const mesh = makeMesh("oroshi", pos, idx, normals, null, new Float32Array(colors), scene);
        const m = new BABYLON.PBRMaterial("oroshiMat", scene);
        m.albedoColor = new BABYLON.Color3(1, 1, 1);   // 実色は頂点カラー
        m.metallic = 0.0; m.roughness = 0.40;
        m.transparencyMode = OPAQUE;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.55;
        m.clearCoat.roughness = 0.14;
        // おろしは水を含んでよく光を通す。ここを切ると発泡スチロールになる
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.tintColor = new BABYLON.Color3(0.94, 0.96, 0.90);
        m.subSurface.translucencyIntensity = 0.62;
        m.subSurface.minimumThickness = 0.02;
        m.subSurface.maximumThickness = 0.35;
        mesh.material = m;
        mesh.receiveShadows = true;
        return mesh;
    }

    // 大葉。1枚のシートを両面表示する
    function buildShiso(scene, seed, L) {
        const NS = 64, NT = 40;
        const positions = new Float32Array(NS * NT * 3);
        const uvs = new Float32Array(NS * NT * 2);
        const indices = [];
        const hwAt = (s) => {
            const base = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(s, 0.52))), 0.72);
            const tooth = 1 + 0.045 * Math.sin(s * Math.PI * 13 + 0.7);   // 鋸歯
            return base * tooth * L * 0.40;
        };
        for (let i = 0; i < NS; i++) {
            const s = i / (NS - 1);
            const hw = hwAt(s);
            for (let j = 0; j < NT; j++) {
                const t = j / (NT - 1) * 2 - 1;
                const k = i * NT + j;
                const x = (s - 0.42) * L;
                const z = t * hw;
                // 中脈に沿って谷、縁は持ち上がって波打つ
                let y = 0.22 * L * 0.09 * (t * t) + 0.020 * L * Math.sin(s * 5.2 + t * 2.1)
                    - 0.055 * L * Math.pow(smooth(0.55, 1.0, s), 2);
                y += 0.012 * L * (Noise.fbm2(s * 6, (t + 1) * 3, seed + 7, 3) - 0.5) * 2;
                positions[k * 3] = x; positions[k * 3 + 1] = y; positions[k * 3 + 2] = z;
                uvs[k * 2] = (t + 1) * 0.5; uvs[k * 2 + 1] = s;
            }
        }
        for (let i = 0; i < NS - 1; i++) for (let j = 0; j < NT - 1; j++) {
            const A = i * NT + j, B = A + 1, C = A + NT, D = C + 1;
            indices.push(A, C, B, B, C, D);
        }
        const idx = new Uint32Array(indices);
        const normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, idx, normals);
        const mesh = makeMesh("shiso", positions, idx, normals, uvs, null, scene);

        // 葉脈のテクスチャ
        const SZ = 256;
        const HF = new Float32Array(SZ * SZ);
        const alb = TextureLab._tex("shisoAlbedo", SZ, (d, N) => {
            for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
                const u = x / N, v = y / N, i = y * N + x, o = i * 4;
                const t = (u - 0.5) * 2;
                // 中脈
                const mid = 1 - smooth(0.0, 0.030, Math.abs(t) * (0.35 + 0.65 * (1 - v)));
                // 側脈（中脈から斜めに出る）
                const lat = Math.abs(((v * 9 + Math.abs(t) * 2.6) % 1) - 0.5) * 2;
                const latM = (1 - smooth(0.80, 1.0, lat)) * smooth(0.02, 0.10, Math.abs(t));
                const mott = Noise.fbm2(u * 7, v * 9, seed + 13, 3);
                let cr = mix(0.175, 0.268, mott), cg = mix(0.340, 0.462, mott), cb = mix(0.135, 0.202, mott);
                cr = mix(cr, 0.372, latM * 0.55); cg = mix(cg, 0.540, latM * 0.55); cb = mix(cb, 0.268, latM * 0.55);
                cr = mix(cr, 0.455, mid * 0.75); cg = mix(cg, 0.612, mid * 0.75); cb = mix(cb, 0.345, mid * 0.75);
                d[o] = cr * 255; d[o + 1] = cg * 255; d[o + 2] = cb * 255; d[o + 3] = 255;
                HF[i] = 0.5 - mid * 0.30 - latM * 0.16 + (mott - 0.5) * 0.22;
            }
        }, scene);
        const nrm = TextureLab.normalFromHeight("shisoNormal", scene, SZ, HF, 1.20);
        const m = new BABYLON.PBRMaterial("shisoMat", scene);
        m.albedoTexture = alb;
        m.bumpTexture = nrm; m.bumpTexture.level = 0.85;
        m.metallic = 0.0; m.roughness = 0.55;
        m.backFaceCulling = false;
        m.twoSidedLighting = true;
        m.transparencyMode = OPAQUE;
        m.clearCoat.isEnabled = true;
        m.clearCoat.intensity = 0.30;
        m.clearCoat.roughness = 0.22;
        m.subSurface.isTranslucencyEnabled = true;
        m.subSurface.tintColor = new BABYLON.Color3(0.30, 0.58, 0.22);
        m.subSurface.translucencyIntensity = 0.55;
        m.subSurface.minimumThickness = 0.01;
        m.subSurface.maximumThickness = 0.06;
        mesh.material = m;
        mesh.receiveShadows = true;
        return mesh;
    }

    // =================================================================
    // 8. Scene
    // =================================================================
    function buildConfig(varietyKey, grillKey, cutKey, seed) {
        const cfg = Object.assign({}, GLOBAL, PRESETS[varietyKey]);
        cfg.variety = varietyKey;
        cfg.grill = grillKey;
        cfg.cut = cutKey;
        cfg.charAmount = GRILLS[grillKey].char;
        cfg.seed = seed >>> 0;
        // 【対策】テクスチャは「品種 × 焼き加減」でキャッシュするので、
        //         その種は個体乱数から切り離して名前から決める
        let h = 2166136261;
        const key = varietyKey + "|" + grillKey + "|" + cutKey;
        for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
        cfg.texSeed = (h >>> 0) % 100000;
        // 狭い画面で 1024² を4枚焼くのは重すぎるうえ、表示サイズに見合わない
        const vw = (typeof window !== "undefined" && window.innerWidth) || 1024;
        if (vw < GLOBAL.compactWidth) {
            cfg.textureSize = 640;
            cfg.segmentsLength = 152; cfg.segmentsRound = 168;
        }
        return cfg;
    }

    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.885, 0.870, 0.845, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.55;
    scene.environmentIntensity = 0.78;

    const camera = new BABYLON.ArcRotateCamera("cam", -1.72, 0.90, 44, new V3(0, 2.6, 0), scene);
    camera.attachControl(true);
    camera.fov = 0.52;
    camera.wheelPrecision = 12;
    // 【対策】ポストプロセスを有効にするとシーンは 16bit 深度の RT へ描かれる。
    //         minZ を 0.1 のままにすると分解能が mm 台になり、
    //         皿と身のように接している面が互いに勝ったり負けたりする
    camera.minZ = 4;
    camera.maxZ = 400;
    camera.lowerRadiusLimit = 14;
    camera.upperRadiusLimit = 140;
    camera.lowerBetaLimit = 0.05;
    camera.upperBetaLimit = 1.50;
    camera.panningSensibility = 260;
    scene.cameraToUseForPointers = camera;

    // 朝の窓明かりを想定。斜め後ろ上からの強い主光 + 反対側からの弱い返し
    const key = new BABYLON.DirectionalLight("key", new V3(-0.42, -0.86, -0.30).normalize(), scene);
    key.position = new V3(26, 46, 20);
    key.intensity = 2.55;
    key.diffuse = new BABYLON.Color3(1.0, 0.975, 0.935);
    key.specular = new BABYLON.Color3(0.62, 0.60, 0.56);
    key.autoCalcShadowZBounds = true;

    const fill = new BABYLON.DirectionalLight("fill", new V3(0.85, -0.42, 0.42).normalize(), scene);
    fill.intensity = 0.85;
    fill.diffuse = new BABYLON.Color3(0.96, 0.965, 1.0);
    fill.specular = new BABYLON.Color3(0.16, 0.16, 0.17);

    // 【対策】白い皿からの照り返しが無いと、切り身の手前側の側面と
    //         皮の帯が真っ黒に落ちて、身が皿から生えているように見える
    const bounce = new BABYLON.DirectionalLight("bounce", new V3(0.05, 1.0, 0.15).normalize(), scene);
    bounce.intensity = 0.34;
    bounce.diffuse = new BABYLON.Color3(0.99, 0.975, 0.945);
    bounce.specular = new BABYLON.Color3(0, 0, 0);

    const amb = new BABYLON.HemisphericLight("amb", new V3(0, 1, 0), scene);
    amb.intensity = 0.36;
    amb.diffuse = new BABYLON.Color3(1, 1, 1);
    amb.groundColor = new BABYLON.Color3(0.78, 0.74, 0.68);
    amb.specular = new BABYLON.Color3(0, 0, 0);

    // 【対策】useBlurExponentialShadowMap は深度を指数関数で近似するため、
    //         ぼかすと影がキャスター自身の明るい面へにじみ出す。白い皿では
    //         それが「拭き残しのような灰色の斑」として非常に目立つ
    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.forceBackFacesOnly = true;
    sg.bias = 0.00035;
    sg.normalBias = 0.012;
    sg.darkness = 0.40;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.12;
    ip.contrast = 1.14;
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

    const WELL_Y = 0.610 * GLOBAL.plateH;      // 見込みの高さ（切り身を置く面）

    let oroshi = null, shiso = null;
    function buildGarnish() {
        if (oroshi) { oroshi.material.dispose(); oroshi.dispose(); oroshi = null; }
        if (shiso) {
            if (shiso.material.albedoTexture) shiso.material.albedoTexture.dispose();
            if (shiso.material.bumpTexture) shiso.material.bumpTexture.dispose();
            shiso.material.dispose(); shiso.dispose(); shiso = null;
        }
        if (!GLOBAL.showOroshi) return;
        if (GLOBAL.showShiso) {
            shiso = buildShiso(scene, 7777, 7.8);
            shiso.position.set(9.6, WELL_Y + 0.05, 1.05);
            shiso.rotation.y = -0.42;
            sg.addShadowCaster(shiso, true);
        }
        oroshi = buildOroshi(scene, 5150, 2.15, 1.35, 1600);
        oroshi.position.set(9.4, WELL_Y + (GLOBAL.showShiso ? 0.13 : 0.02), 0.85);
        sg.addShadowCaster(oroshi, true);
    }

    // ---- 切り身 ------------------------------------------------------
    let skin = null, fillet = null, curCfg = null;
    let curVariety = START_VARIETY, curGrill = START_GRILL, curCut = START_CUT, curSeed = START_SEED;
    let debugMode = 0, onRebuilt = null;

    function ensureSkin(cfg) {
        const k = cfg.variety + "|" + cfg.grill + "|" + cfg.cut;
        if (skin && skin.key === k) return skin;
        // 【対策】古い Skin を捨てずに差し替えると、1024² のテクスチャが
        //         4枚ずつ GPU に残り続ける。切り替えを繰り返すと落ちる
        if (skin) skin.dispose();
        skin = new Skin(scene, cfg);
        return skin;
    }

    function build(varietyKey, grillKey, cutKey, seed) {
        const cfg = buildConfig(varietyKey, grillKey, cutKey, seed);
        curCfg = cfg;
        if (fillet) { fillet.dispose(); fillet = null; }
        const sk = ensureSkin(cfg);
        sk.setDebug(debugMode);

        fillet = new Salmon(scene, cfg, seed, sk);
        // 皿の左寄りに、長辺とほぼ平行に置く。皮の帯（+z 側）は奥
        fillet.root.position.set(-0.4, WELL_Y, -0.10);
        fillet.root.rotation.y = -0.045;

        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        sg.addShadowCaster(fillet.mesh, true);
        if (plate) sg.addShadowCaster(plate, true);
        buildGarnish();

        console.log("[Sake]", BUILD, "/", cfg.label, "/", CUTS[cutKey].label, "/", GRILLS[grillKey].label,
            "/ seed =", cfg.seed, "/", fillet.size.len.toFixed(1) + "cm");
        if (onRebuilt) onRebuilt();
    }

    build(START_VARIETY, START_GRILL, START_CUT, START_SEED);

    if (GLOBAL.useSSAO) {
        // 【対策】皿も身も明るいので、接地の陰りが無いと切り身が浮いて見える。
        //         身割れの溝と、大根おろしの粒の隙間にも効く
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.85, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.55;
        ssao.totalStrength = 1.10;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 160;
        ssao.minZAspect = 0.22;
    }

    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    // 【対策】白い皿では bloom のしきい値を下げると全体がにじむ。
    //         脂のハイライトだけを拾わせる
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
    // 9. GUI
    // =================================================================
    // 【対策】フルスクリーンGUIは既定でシーンと同じカメラで合成されるため、
    //         Bloom / 被写界深度 / シャープンがUIにも乗ってボケる。
    //         GUI専用カメラを layerMask で分離する
    // 【対策】カメラを2台にすると、Babylon の各機能が「activeCameras の末尾＝
    //   描画の基準カメラ」と見なす所で全部 guiCam を拾い、Inspector の
    //   デバッグ機能が 3 系統まとめて壊れる（ヘッダの変更点を参照）。
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

    addLabel("YAKI-ZAKE", 11, COL.sub, "18px");
    addLabel("種類", 13, COL.accent, "22px");

    const varietyBtns = {}, grillBtns = {}, cutBtns = {};
    function highlight() {
        for (const k in varietyBtns) varietyBtns[k].background = (k === curVariety) ? COL.active : COL.idle;
        for (const k in grillBtns) grillBtns[k].background = (k === curGrill) ? COL.active : COL.idle;
        for (const k in cutBtns) cutBtns[k].background = (k === curCut) ? COL.active : COL.idle;
    }
    for (const k of Object.keys(PRESETS)) {
        varietyBtns[k] = addButton("v_" + k, PRESETS[k].label, () => {
            curVariety = k; build(curVariety, curGrill, curCut, curSeed); highlight();
        });
    }

    addLabel("切り方", 13, COL.accent, "26px");
    for (const k of Object.keys(CUTS)) {
        cutBtns[k] = addButton("c_" + k, CUTS[k].label, () => {
            curCut = k; build(curVariety, curGrill, curCut, curSeed); highlight();
        });
    }

    addLabel("焼き加減", 13, COL.accent, "26px");
    for (const k of Object.keys(GRILLS)) {
        grillBtns[k] = addButton("g_" + k, GRILLS[k].label, () => {
            curGrill = k; build(curVariety, curGrill, curCut, curSeed); highlight();
        });
    }

    addGap(8);
    addButton("reseed", "別の切り身", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(curVariety, curGrill, curCut, curSeed); highlight();
    });

    const garnishBtn = addButton("garnish", "薬味: OFF", () => {
        GLOBAL.showOroshi = !GLOBAL.showOroshi;
        buildGarnish();
        garnishBtn.background = GLOBAL.showOroshi ? COL.active : COL.idle;
        garnishBtn.textBlock.text = "薬味: " + (GLOBAL.showOroshi ? "ON" : "OFF");
    });
    garnishBtn.background = GLOBAL.showOroshi ? COL.active : COL.idle;

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
        info.text = curCfg.label + " / " + CUTS[curCut].label + " / " + GRILLS[curGrill].label + "\n"
            + "全長 " + s.len.toFixed(1) + "cm  幅 " + s.wid.toFixed(1)
            + "cm  厚 " + s.hgt.toFixed(1) + "cm\n"
            + "seed: " + curSeed + "  [" + BUILD + "]";
    };
    onRebuilt();

    // ---- GUI の開閉（スマホでは初期状態で畳む）-----------------------
    // 【対策】Babylon.GUI のサイズ指定はレンダー解像度基準（≒ CSS px × DPR）。
    //         DPR 3 の端末では 33px のボタンが実質 11 CSS px になる。
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