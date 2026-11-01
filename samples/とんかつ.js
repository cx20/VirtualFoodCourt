// =====================================================================
//  Photoreal Tonkatsu  /  写実的なとんかつ（ロースかつ・6切れ）
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//  build: tonkatsu-2026-08-12-x
//
//  構成:
//    0. CONFIG      … 寸法・盛り付け・表示プリセット
//    1. Rng / util  … シード付き擬似乱数（再現性の担保）
//    2. Noise       … 3D値ノイズ（形状用）/ 2D周期ノイズ（タイリング用）
//    3. Mesh utils  … グリッド面 / 回転体 / キューブ球（巻き順は実行時に自動判定）
//    4. TextureLab  … パン粉 / 皿 / 木のテーブル を手続き生成
//    5. Cutlet      … カツ1切れ（掃引本体 + 切断面のキャップ）
//    6. Cabbage     … 千切りキャベツ（1本ずつ掃引して1メッシュに合成）
//    7. Sauce       … 高さ場 → 円錐膨張 → リボン掃引
//    8. Tableware   … 皿 / 木のテーブル / からし
//    9. Plating     … 扇状に倒した並べ方（解析配置）
//   10. Scene / GUI
//
//  実物の要点（ここを外すと「茶色い直方体」になる）:
//    ・断面が主役。パン粉の層（外は濃く内は白い）→ バッターの細い線 →
//      脂の白い帯 →  肉、という4層が 3〜4mm の中に詰まっている
//    ・パン粉は「粒」ではなく「薄い板」。伸びた破片が寝ながら重なっている。
//      等方的なノイズで凹凸を付けると、から揚げか岩にしかならない
//    ・揚げ色は凹凸と相関する。出っ張った破片の先だけ濃い。
//      無相関のテクスチャを貼ると「柄の付いた布」に見える
//    ・切り口は包丁が通った面なので平ら。衣の縁だけが数mm ぎざぎざ
//    ・キャベツは白が主役。緑を強くすると芝生に見える。
//      1本1本が薄いので、透過光で縁が光る
//    ・ソースは溝を埋めて渡る。表面をそのままなぞらせると千切れて見える
//
//  物理（Havok）は使っていません。倒した扇は接触が面と面で、
//  ソルバに任せると必ず崩れるか震えます。接触条件を解いて解析的に置きます
//
//  -x での変更点:
//    GUI 専用カメラ（layerMask 分離）の副作用で壊れていた Inspector の
//    デバッグ機能を修復した。Physics Helper（UtilityLayerRenderer）、
//    選択ハイライト（EffectLayer）、Scene Explorer の Picker（scene.pick）
//    の 3 系統。詳細は「10. GUI」の bindDebugCamera を参照
// =====================================================================

var createScene = async function () {
    // =================================================================
    // 0. CONFIG （単位は cm）
    // =================================================================
    const CFG = {
        // --- カツ本体
        sliceCount: 6,
        cutletLength: 14.0,        // 元の1枚の長さ
        cutletHalfW: 4.05,         // 基準半幅（実際は木の葉形に細るので一定でない）
        cutletHalfT: 1.02,         // 半厚（= 1.72cm 厚）
        ringSeg: 192,              // 断面リングの分割
        sweepRows: 28,             // 1切れあたりの掃引方向の分割
        crustThick: 0.22,          // 衣の厚み（断面で見える帯）
        capRecess: 0.10,           // 切断面を衣の縁より何cm奥へ引っ込めるか
        showCut: true,             // 切断面の表示（切り分け診断用）
        showShadow: true,          // 影の ON/OFF（切り分け診断用）
        wireframe: false,          // 三角形の表示（切り分け診断用）
        fatThick: 0.28,            // 脂身の帯の厚み
        crustAmp: 1.00,            // パン粉の凹凸の倍率
        crustFreq: 1.55,           // 破片の細かさ（大きいほど小さい破片）
        uvTile: 3.4,               // パン粉テクスチャのタイリング（1/cm 換算前）

        // --- 盛り付け（扇）
        // 【対策】倒した扇は「送り」と「せり上がり」を独立に決められない。
        //         板の厚み thick と重なり量から接触条件を解くので、
        //         ここで指定するのは傾きと重なりの2つだけ。
        //         傾きを寝かせると重なりを保つために必ず高く積み上がる。
        //         38度前後が「断面が見える／山が高くならない」の折り合い
        // 【対策】傾きと送りは独立した定数にできない（下の解説を参照）。
        //   人間が決めたいのは「皿の上でどれだけ広げるか」だけなので、
        //   扇の全長だけを与えて、傾きと送りはそこから解く
        // 【対策】扇の全長を直接指定すると、接触条件を超えた長さも指定できて
        //   しまい、切れどうしが離れて並ぶ。指定するのは「隣にどれだけ
        //   食い込ませるか」にして、傾き・送り・全長はそこから解く
        fanOverlap: 0.18,          // 隣の切れに重なる割合（切り厚に対して）
        fanYawDeg: -7,             // 扇の軸を少し振る
        katsuX: -0.2, katsuZ: -1.5,

        // --- キャベツ
        showCabbage: true,
        shredCount: 430,
        shredSeg: 9,               // 1本の長さ方向の分割
        shredRing: 5,              // 1本の断面の分割
        moundX: 0.8, moundZ: 5.9,
        moundR: 3.80, moundH: 2.95,

        // --- ソース
        showSauce: true,
        // 【対策】半幅 0.52 / 厚み 0.30 は縦横比 3.5:1。これは液体ではなく
        //   絞り出したペーストの比率で、断面を半円にしていたこともあり
        //   マヨネーズのチューブ盛りに見えていた。実際のとんかつソースは
        //   粘度が低く、かけると 1mm 前後まで広がって落ち着く（比 15:1 前後）
        sauceHalfW: 0.74,          // リボンの半幅
        sauceThick: 0.085,         // 膜の厚み
        sauceSink: 0.17,           // 溝へ落ち込む深さ（上面）。液体は溝を渡り切らない
        sauceBridge: 0.62,         // 円錐膨張の半径（溝を渡す距離）
        sauceSlope: 1.15,          // 円錐の傾き（大きいほど溝を渡さない）
        sauceSag: 0.42,            // 溝へ垂れ下がる最大量（下面）

        // --- からし
        showKarashi: true,
        karashiX: -7.4, karashiZ: 3.5, karashiR: 0.78,

        // --- 物理（Havok）で盛り付ける
        usePhysics: true,
        // 【対策】Havok の接触許容量・スリープ閾値は「絶対値」で、メートル系を
        //   前提に決まっている。cm 単位のシーンで実重力 981 を入れると、
        //   1ステップのめり込みが許容量を超えて押し戻され続け、震える
        gravity: 620,              // cm/s^2（実寸どおりなら 981）
        physicsHz: 120,            // 固定タイムステップ
        friction: 0.88,            // 衣どうしはよく引っ掛かる
        restitution: 0.02,         // 揚げ物は跳ねない
        linearDamping: 0.22,
        angularDamping: 0.90,      // 板の揺り戻し（ロッキング）を殺す
        dropClearance: 0.10,       // 解いた姿勢から何cm上で放すか
        // 【対策】設計どおりの姿勢で放すとソルバに解く仕事が無く、
        //   定規で並べたような扇のまま止まる。少し立てて放して
        //   自分で倒れさせると、先頭は寝て後ろほど立つ不揃いが出る
        spawnLeanDeg: 11,          // わざと立てて放し、自分で倒れさせる
        settleSpeed: 0.9, settleSpin: 0.35,
        settleHold: 0.35, settleTimeout: 4.0,
        freezeWhenSettled: true,

        // --- 皿・テーブル
        plateOuterR: 12.7,
        plateSeg: 112,
        showTable: true,

        // --- 被写界深度
        dofRatio: 0.070,
        dofFStop: 2.8,

        // --- テクスチャ / 描画
        crustSize: 512,
        plateSize: 512,
        woodSize: 768,
        useSSAO: true,
        useDOF: true,

        // --- GUI
        // 【対策】GUI を専用カメラで合成すると UI に Bloom / DOF が乗らない
        //   代わりに Inspector のデバッグ機能が壊れる。壊れた3系統は
        //   bindDebugCamera() で直してあるが、素の挙動と比べたいときのために
        //   フラグを残す（false にすると UI がボケる代わりに Inspector は素）
        guiOwnCamera: true,
        compactWidth: 700,
        compactMinSide: 480,
        guiMaxScale: 2.2
    };

    const START_SEED = 20260812;

    const V3 = BABYLON.Vector3;
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const srgb = (v) => Math.pow(clamp(v, 0, 1), 2.2);   // 頂点カラーはリニア空間

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
            return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        }
        int(n) { return Math.floor(this.next() * n) % n; }
    }

    // =================================================================
    // 2. Noise
    // =================================================================
    const Noise = {
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
            return s / n;                                  // 0..1（平均0.5）
        },
        _h2(x, y, seed) {
            let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
            return (h >>> 0) / 4294967295;
        },
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
        // 【対策】パン粉は等方的な「粒」ではなく、伸びた「板」。
        //         軸を潰した値ノイズを 3 方向ぶん作って max を取ると、
        //         向きの違う細長い破片が重なった場になる。
        //         等方 fbm を閾値処理しただけでは、から揚げの粒にしかならない
        shard2(x, y, z, seed) {
            const a = this.fbm3(x * 1.05, y * 3.05, z * 3.25, seed, 2);
            const b = this.fbm3(x * 3.15, y * 3.05, z * 1.00, seed + 311, 2);
            const c = this.fbm3((x + z) * 2.20, y * 3.05, (x - z) * 0.72, seed + 733, 2);
            return Math.max(a, Math.max(b, c));
        }
    };

    // =================================================================
    // 3. Mesh utils
    // =================================================================
    // 【対策】Babylon の ComputeNormals は (v0-v1)x(v2-v1) で、右手系の
    //         外積と符号が逆。巻き順の規約を決め打ちすると環境依存で裏返る。
    //         法線を計算してから基準点との向きで判定し、必要なら全反転する
    function finalize(positions, indices, center, refNormals) {
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        let dot = 0;
        const n = positions.length / 3;
        if (refNormals) {
            for (let i = 0; i < n; i++) {
                dot += normals[i * 3] * refNormals[i * 3]
                    + normals[i * 3 + 1] * refNormals[i * 3 + 1]
                    + normals[i * 3 + 2] * refNormals[i * 3 + 2];
            }
        } else {
            for (let i = 0; i < n; i++) {
                dot += normals[i * 3] * (positions[i * 3] - center.x)
                    + normals[i * 3 + 1] * (positions[i * 3 + 1] - center.y)
                    + normals[i * 3 + 2] * (positions[i * 3 + 2] - center.z);
            }
        }
        if (dot < 0) {
            for (let i = 0; i < indices.length; i += 3) {
                const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t;
            }
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        // 【対策】掃引の端で断面が 1 点に潰れる（千切りキャベツの切り口など）と、
        //   その頂点には表と裏の面法線が同量ずつ集まって打ち消し合い、
        //   長さ 0 の法線＝真っ黒な点になる。参照法線か、無ければ
        //   重心から外向きのベクトルで置き換えて救済する
        for (let i = 0; i < n; i++) {
            const x = normals[i * 3], y = normals[i * 3 + 1], z = normals[i * 3 + 2];
            if (x * x + y * y + z * z > 1e-6) continue;
            let ax, ay, az;
            if (refNormals) {
                ax = refNormals[i * 3]; ay = refNormals[i * 3 + 1]; az = refNormals[i * 3 + 2];
            } else {
                ax = positions[i * 3] - center.x;
                ay = positions[i * 3 + 1] - center.y;
                az = positions[i * 3 + 2] - center.z;
            }
            const l = Math.hypot(ax, ay, az);
            if (l < 1e-9) { normals[i * 3 + 1] = 1; continue; }
            normals[i * 3] = ax / l; normals[i * 3 + 1] = ay / l; normals[i * 3 + 2] = az / l;
        }
        return normals;
    }

    // 位置が一致する頂点の法線を平均する（リングの継ぎ目・キューブ球の面境界）
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

    function applyVD(mesh, positions, indices, normals, uvs, colors) {
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals;
        if (uvs) vd.uvs = uvs;
        if (colors) vd.colors = colors;
        vd.applyToMesh(mesh, false);
        // 【対策】頂点カラーを stride 4 で入れると Babylon が hasVertexAlpha = true にし、
        //         不透明なのに透過パスへ回される。透過パスは深度書き込みが切られるので、
        //         衣と切断面が互いを正しく隠せなくなる
        mesh.hasVertexAlpha = false;
        return mesh;
    }

    // 格子面（pts は row-major：(nu+1) 行 × (nv+1) 列）。uvFn(i,j,k) は省略可
    function gridMesh(name, pts, cols, nu, nv, center, scene, uvFn, refN) {
        const W = nv + 1, total = (nu + 1) * W;
        const positions = new Float32Array(total * 3);
        const uvs = new Float32Array(total * 2);
        const colors = cols ? new Float32Array(total * 4) : null;
        for (let i = 0; i <= nu; i++) {
            for (let j = 0; j <= nv; j++) {
                const k = i * W + j, p = pts[k];
                positions[k * 3] = p.x; positions[k * 3 + 1] = p.y; positions[k * 3 + 2] = p.z;
                if (uvFn) { const t = uvFn(i, j, k); uvs[k * 2] = t[0]; uvs[k * 2 + 1] = t[1]; }
                else { uvs[k * 2] = j / nv; uvs[k * 2 + 1] = i / nu; }
                if (colors) {
                    const c = cols[k];
                    colors[k * 4] = c[0]; colors[k * 4 + 1] = c[1]; colors[k * 4 + 2] = c[2]; colors[k * 4 + 3] = 1;
                }
            }
        }
        const indices = [];
        for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
            const A = i * W + j, B = A + 1, C = A + W, D = C + 1;
            indices.push(A, C, B, B, C, D);
        }
        const normals = finalize(positions, indices, center, refN);
        weldNormals(positions, normals);
        const mesh = new BABYLON.Mesh(name, scene);
        return applyVD(mesh, positions, indices, normals, uvs, colors);
    }

    // 回転体（profile は [{r, y}]）
    function revolve(name, profile, seg, scene, opts) {
        opts = opts || {};
        const N = profile.length, W = seg + 1, total = N * W;
        const positions = new Float32Array(total * 3);
        const uvs = new Float32Array(total * 2);
        const colors = opts.colorFn ? new Float32Array(total * 4) : null;
        // 【対策】v を制御点の添字で刻むと、点が密な所（縁）だけテクスチャが
        //         詰まって縞に見える。弧長で正規化する
        const arc = [0];
        for (let i = 1; i < N; i++) {
            arc.push(arc[i - 1] + Math.hypot(profile[i].r - profile[i - 1].r, profile[i].y - profile[i - 1].y));
        }
        const arcTotal = Math.max(1e-6, arc[N - 1]);
        let widest = 0;
        for (let i = 0; i < N; i++) if (profile[i].r > profile[widest].r) widest = i;

        for (let i = 0; i < N; i++) {
            for (let j = 0; j <= seg; j++) {
                const ang = j / seg * Math.PI * 2, k = i * W + j;
                // 【対策】完全な真円だと縁のハイライトが定規で引いた線になり、
                //         量産のプラスチックに見える。手びねりのわずかな歪みを入れる
                const wob = opts.wobble
                    ? 1 + opts.wobble * (Math.cos(3 * ang + 0.7) * 0.6 + Math.sin(5 * ang + 2.1) * 0.4)
                    : 1;
                const r = profile[i].r * wob;
                positions[k * 3] = r * Math.cos(ang);
                positions[k * 3 + 1] = profile[i].y;
                positions[k * 3 + 2] = r * Math.sin(ang);
                uvs[k * 2] = j / seg * (opts.uScale || 1);
                uvs[k * 2 + 1] = arc[i] / arcTotal * (opts.vScale || 1);
                if (colors) {
                    const c = opts.colorFn(i, ang);
                    colors[k * 4] = c[0]; colors[k * 4 + 1] = c[1];
                    colors[k * 4 + 2] = c[2]; colors[k * 4 + 3] = 1;
                }
            }
        }
        const indices = [];
        for (let i = 0; i < N - 1; i++) for (let j = 0; j < seg; j++) {
            const A = i * W + j, B = A + 1, C = A + W, D = C + 1;
            indices.push(A, C, B, B, C, D);
        }
        const center = new V3(0, profile[widest].y, 0);
        const normals = finalize(positions, indices, center);
        weldNormals(positions, normals);
        const mesh = new BABYLON.Mesh(name, scene);
        return applyVD(mesh, positions, indices, normals, uvs, colors);
    }

    // キューブ球（からし用の小さな塊）。radFn(nx,ny,nz) が半径倍率を返す
    const QUAD_FACE = [
        { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
        { n: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
        { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
        { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
        { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
        { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] }
    ];

    function blobMesh(name, res, radFn, colorFn, scene) {
        const vpf = (res + 1) * (res + 1), total = 6 * vpf;
        const positions = new Float32Array(total * 3);
        const uvs = new Float32Array(total * 2);
        const colors = colorFn ? new Float32Array(total * 4) : null;
        const indices = [];
        for (let f = 0; f < 6; f++) {
            const F = QUAD_FACE[f], base = f * vpf;
            // u × v の符号で各面の巻き順をそろえる
            const cx = F.u[1] * F.v[2] - F.u[2] * F.v[1];
            const cy = F.u[2] * F.v[0] - F.u[0] * F.v[2];
            const cz = F.u[0] * F.v[1] - F.u[1] * F.v[0];
            const hand = (cx * F.n[0] + cy * F.n[1] + cz * F.n[2]) > 0;
            for (let j = 0; j <= res; j++) {
                const b = -1 + 2 * j / res;
                for (let i = 0; i <= res; i++) {
                    const a = -1 + 2 * i / res, k = base + j * (res + 1) + i;
                    let x = F.n[0] + F.u[0] * a + F.v[0] * b;
                    let y = F.n[1] + F.u[1] * a + F.v[1] * b;
                    let z = F.n[2] + F.u[2] * a + F.v[2] * b;
                    const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
                    const r = radFn(x, y, z);
                    positions[k * 3] = x * r; positions[k * 3 + 1] = y * r; positions[k * 3 + 2] = z * r;
                    uvs[k * 2] = (a + 1) * 0.5; uvs[k * 2 + 1] = (b + 1) * 0.5;
                    if (colors) {
                        const c = colorFn(x, y, z);
                        colors[k * 4] = c[0]; colors[k * 4 + 1] = c[1];
                        colors[k * 4 + 2] = c[2]; colors[k * 4 + 3] = 1;
                    }
                }
            }
            for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
                const A = base + j * (res + 1) + i, B = A + 1, C = A + (res + 1), D = C + 1;
                if (hand) indices.push(A, B, C, B, D, C);
                else indices.push(A, C, B, B, C, D);
            }
        }
        const normals = finalize(positions, indices, new V3(0, 0, 0));
        weldNormals(positions, normals);
        const mesh = new BABYLON.Mesh(name, scene);
        return applyVD(mesh, positions, indices, normals, uvs, colors);
    }

    // =================================================================
    // 4. TextureLab
    // =================================================================
    const TextureLab = {
        _tex(name, size, fill, scene) {
            // 【対策】createImageData / DynamicTexture は整数のサイズしか受け付けない。
            //         undefined が来ると「Value is not of type 'long'」で落ちるので畳んでおく
            size = Math.max(8, Math.round(size) || 512);
            const dt = new BABYLON.DynamicTexture(name, { width: size, height: size }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(size, size);
            fill(img.data, size);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = false;
            dt.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
            dt.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
            return dt;
        },

        // 異方 fbm（タイリングを保ったまま軸ごとに周期を変える）
        _afbm(x, y, px, py, seed, oct) {
            let s = 0, a = 0.5, f = 1, n = 0;
            for (let o = 0; o < oct; o++) {
                s += a * Noise.v2(x * f, y * f, Math.max(1, (px * f) | 0), Math.max(1, (py * f) | 0), seed + o * 131);
                n += a; f *= 2; a *= 0.5;
            }
            return s / n;
        },

        // 高さ場を1枚作り、アルベド / ORM / 法線 / 油膜で共有する
        // 【対策】3枚を別々のノイズで作ると、粒の位置がずれて
        //         「ざらざらの上にぼんやりした汚れが乗った」ように見える
        crustHeight(size, seed) {
            const h = new Float32Array(size * size);
            const A = this;
            for (let y = 0; y < size; y++) {
                const v = y / size;
                for (let x = 0; x < size; x++) {
                    const u = x / size, i = y * size + x;
                    // 伸びた破片。周期を軸で変えて板状にし、向き違いの 3 枚で max
                    const s1 = A._afbm(u * 10, v * 42, 10, 42, seed, 2);
                    const s2 = A._afbm(u * 44, v * 11, 44, 11, seed + 51, 2);
                    const s3 = A._afbm((u + v) * 26, (u - v) * 9 + 5, 26, 9, seed + 97, 2);
                    // 【対策】閾値の幅を広く取ると「丸い粒」になる。狭くして
                    //         立ち上がりを急にすると、上面が平らな板＝パン粉になる
                    const sh = Math.max(smooth(0.500, 0.552, s1),
                        Math.max(smooth(0.500, 0.552, s2), smooth(0.500, 0.552, s3)));
                    // 一回り小さい破片。輪郭をぎざぎざにするのはこの層
                    const t1 = A._afbm(u * 25, v * 96, 25, 96, seed + 131, 2);
                    const t2 = A._afbm(u * 98, v * 27, 98, 27, seed + 173, 2);
                    const sh2 = Math.max(smooth(0.505, 0.575, t1), smooth(0.505, 0.575, t2));
                    const blister = A._afbm(u * 6, v * 6, 6, 6, seed + 7, 3);   // 揚げ膨れ
                    const fine = A._afbm(u * 130, v * 130, 130, 130, seed + 23, 2);
                    h[i] = clamp(sh * 0.54 + sh2 * 0.24 + blister * 0.13 + fine * 0.09, 0, 1);
                }
            }
            return h;
        },
        crustAlbedo(scene, size, hf) {
            // ほぼ白（頂点カラーの揚げ色を殺さない）。破片の先だけ少し濃く焼ける
            return this._tex("crustAlbedo", size, (d, N) => {
                for (let i = 0, n = N * N; i < n; i++) {
                    const h = hf[i];
                    const k = 0.84 + 0.22 * h - 0.20 * smooth(0.66, 0.98, h);
                    const j = i * 4;
                    d[j] = clamp(k * 1.03, 0, 1) * 255;
                    d[j + 1] = clamp(k * 0.98, 0, 1) * 255;
                    d[j + 2] = clamp(k * 0.91, 0, 1) * 255;
                    d[j + 3] = 255;
                }
            }, scene);
        },
        crustORM(scene, size, hf) {
            const A = this;
            return this._tex("crustORM", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = y * N + x, j = i * 4;
                        const h = hf[i];
                        // 【対策】油の照りを全面均一にすると濡れたプラスチックになる。
                        //         油はくぼみに溜まる → 低い所ほど滑らか、破片の先は粗い
                        // 【対策】0.24〜0.58 では滑らかすぎる。揚げたパン粉は
                        //   実測でおおむね 0.6〜0.85 のつや消し。油だまりでも 0.5 止まり
                        let rough = 0.58 + 0.29 * smooth(0.15, 0.85, h);
                        const pool = A._afbm(u * 5, v * 5, 5, 5, 404, 3);
                        rough = mix(rough, rough * 0.78, smooth(0.44, 0.82, pool));
                        // 破片同士の隙間は光が入らない。ここの AO が効くと粒が立つ
                        const ao = 0.48 + 0.52 * smooth(0.10, 0.70, h);
                        d[j] = ao * 255; d[j + 1] = clamp(rough, 0.05, 1) * 255;
                        d[j + 2] = 0; d[j + 3] = 255;
                    }
                }
            }, scene);
        },
        // 油膜。R = 被覆率 / G = 粗さ（マテリアル側の値と乗算される）
        crustWax(scene, size, hf) {
            const A = this;
            return this._tex("crustWax", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = y * N + x, j = i * 4;
                        const h = hf[i];
                        const pool = A._afbm(u * 5, v * 5, 5, 5, 404, 3);
                        // 油はくぼみにだけ溜まる。出っ張った破片の先は乾いている
                        const cover = clamp(0.10 + 0.72 * (1 - h) + 0.34 * (pool - 0.5), 0, 1);
                        const rough = clamp(0.44 + 0.56 * h - 0.32 * (pool - 0.5), 0.14, 1);
                        d[j] = cover * 255; d[j + 1] = rough * 255; d[j + 2] = 0; d[j + 3] = 255;
                    }
                }
            }, scene);
        },
        normalFrom(scene, name, size, hf, strength) {
            return this._tex(name, size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    for (let x = 0; x < N; x++) {
                        const xl = hf[y * N + ((x - 1 + N) % N)], xr = hf[y * N + ((x + 1) % N)];
                        const yu = hf[((y - 1 + N) % N) * N + x], yd = hf[((y + 1) % N) * N + x];
                        let nx = (xl - xr) * strength, ny = (yu - yd) * strength, nz = 1;
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

        // ---- 切断面（豚ロース）------------------------------------------
        // 繊維を横に切っているので、見えるのは「束の断面」。線ではなく斑と、
        // 束を仕切る細い白い膜（筋周膜）が要る
        meatHeight(size, seed) {
            const h = new Float32Array(size * size);
            const A = this;
            for (let y = 0; y < size; y++) {
                const v = y / size;
                for (let x = 0; x < size; x++) {
                    const u = x / size, i = y * size + x;
                    // 【対策】等方な網目を主役にして明るく出すと、断面が
                    //   「白い落書き」に見える。ロースを筋に直交して切った面は
                    //     (1) 繊維の断口＝わずかに一方向へ伸びた細かい斑点
                    //     (2) それを束ねる筋膜の薄い網目
                    //   の二層で、目に付くのは (1) のほう。網目は細く淡くする
                    const cell = A._afbm(u * 26, v * 26, 26, 26, seed, 2);
                    const web = 1 - smooth(0.012, 0.055, Math.abs(cell - 0.5));
                    // 繊維の断口。周期を軸で変えて 3:1 に引き伸ばす
                    const grain = A._afbm(u * 46, v * 138, 46, 138, seed + 13, 2);
                    const mott = A._afbm(u * 9, v * 9, 9, 9, seed + 29, 3);
                    h[i] = clamp(0.46 + 0.14 * web + 0.30 * (grain - 0.5)
                        + 0.16 * (mott - 0.5), 0, 1);
                }
            }
            return h;
        },
        meatAlbedo(scene, size, hf) {
            // 網目（筋膜）だけ白っぽく、束の中はわずかに濃い
            return this._tex("meatAlbedo", size, (d, N) => {
                for (let i = 0, n = N * N; i < n; i++) {
                    const h = hf[i];
                    // 【対策】0.88 + 0.26 では白飛びして筋膜が白線になる。振幅を半分に
                    const k = 0.90 + 0.13 * smooth(0.55, 0.90, h) - 0.07 * smooth(0.45, 0.15, h);
                    const j = i * 4;
                    d[j] = clamp(k, 0, 1) * 255;
                    d[j + 1] = clamp(k * 0.985, 0, 1) * 255;
                    d[j + 2] = clamp(k * 0.975, 0, 1) * 255;
                    d[j + 3] = 255;
                }
            }, scene);
        },
        meatORM(scene, size, hf) {
            return this._tex("meatORM", size, (d, N) => {
                for (let i = 0, n = N * N; i < n; i++) {
                    const h = hf[i];
                    // 加熱した肉は「濡れているが鏡ではない」。0.30〜0.52 に収める
                    const rough = clamp(0.50 - 0.20 * smooth(0.40, 0.90, h), 0.26, 1);
                    const ao = 0.80 + 0.20 * h;
                    const j = i * 4;
                    d[j] = ao * 255; d[j + 1] = rough * 255; d[j + 2] = 0; d[j + 3] = 255;
                }
            }, scene);
        },

        // ---- ソースの表面（うっすらした波）------------------------------
        sauceHeight(size, seed) {
            const h = new Float32Array(size * size);
            const A = this;
            for (let y = 0; y < size; y++) {
                const v = y / size;
                for (let x = 0; x < size; x++) {
                    const u = x / size;
                    h[y * size + x] = clamp(
                        0.55 * A._afbm(u * 9, v * 9, 9, 9, seed, 3) +
                        0.45 * A._afbm(u * 26, v * 26, 26, 26, seed + 5, 2), 0, 1);
                }
            }
            return h;
        },

        // ---- 皿（黒マット釉の炻器）--------------------------------------
        plateHeight(size, seed) {
            const h = new Float32Array(size * size);
            const A = this;
            for (let y = 0; y < size; y++) {
                const v = y / size;
                for (let x = 0; x < size; x++) {
                    const u = x / size;
                    const grit = A._afbm(u * 60, v * 60, 60, 60, seed, 3);
                    const spec = Math.pow(smooth(0.62, 0.90, A._afbm(u * 110, v * 110, 110, 110, seed + 7, 2)), 1.6);
                    const ring = 0.5 + 0.5 * Math.sin(v * Math.PI * 2 * 26 + grit * 3.0);
                    h[y * size + x] = clamp(grit * 0.62 + spec * 0.45 + ring * 0.10, 0, 1);
                }
            }
            return h;
        },
        plateAlbedo(scene, size, hf) {
            // 【対策】「黒い皿」だからと sRGB 0.05 のような値を入れると、
            //         リニアでは 0.002 になり、実質まっ黒で形が読めなくなる。
            //         実物の黒い釉薬の反射率は 5% 程度 = sRGB では 0.25 前後
            return this._tex("plateAlbedo", size, (d, N) => {
                for (let i = 0, n = N * N; i < n; i++) {
                    const h = hf[i];
                    const k = 0.82 + 0.20 * smooth(0.30, 0.95, h);
                    const j = i * 4;
                    d[j] = clamp(k, 0, 1) * 255;
                    d[j + 1] = clamp(k * 0.99, 0, 1) * 255;
                    d[j + 2] = clamp(k * 0.99, 0, 1) * 255;
                    d[j + 3] = 255;
                }
            }, scene);
        },
        plateORM(scene, size, hf) {
            const A = this;
            return this._tex("plateORM", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = y * N + x, j = i * 4;
                        const h = hf[i];
                        const patch = A._afbm(u * 7, v * 7, 7, 7, 91, 3);
                        const rough = clamp(0.48 + 0.30 * h + 0.14 * (patch - 0.5), 0.22, 1);
                        d[j] = 255; d[j + 1] = rough * 255; d[j + 2] = 0; d[j + 3] = 255;
                    }
                }
            }, scene);
        },

        // ---- 木のテーブル ------------------------------------------------
        woodHeight(size, seed) {
            const h = new Float32Array(size * size);
            const A = this;
            for (let y = 0; y < size; y++) {
                const v = y / size;
                for (let x = 0; x < size; x++) {
                    const u = x / size, i = y * size + x;
                    // 板の継ぎ目（v 方向に 4 枚）
                    const pv = (v * 4) % 1;
                    const seam = 1 - smooth(0.0, 0.012, Math.min(pv, 1 - pv));
                    // 年輪：木口からの距離を歪ませて縞にする
                    const warp = A._afbm(u * 5, v * 22, 5, 22, seed, 3);
                    const rings = 0.5 + 0.5 * Math.sin((u * 26 + warp * 5.5 + ((v * 4) | 0) * 3.1) * Math.PI);
                    const fiber = A._afbm(u * 30, v * 150, 30, 150, seed + 11, 2);
                    h[i] = clamp(rings * 0.52 + fiber * 0.30 + 0.18 - seam * 0.9, 0, 1);
                }
            }
            return h;
        },
        woodAlbedo(scene, size, hf, seed) {
            const LIGHT = [0.745, 0.585, 0.400];
            const DARK = [0.505, 0.352, 0.208];
            const A = this;
            return this._tex("woodAlbedo", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = y * N + x, j = i * 4;
                        const h = hf[i];
                        // 板ごとに明るさを変えないと、1枚の大きな板に見える
                        const plank = 0.88 + 0.24 * Noise.v2(((v * 4) | 0) * 7 + 3, 1, 97, 97, seed);
                        const k = smooth(0.20, 0.85, h);
                        const g = plank * (0.94 + 0.12 * A._afbm(u * 12, v * 12, 12, 12, seed + 3, 2));
                        d[j] = clamp(mix(DARK[0], LIGHT[0], k) * g, 0, 1) * 255;
                        d[j + 1] = clamp(mix(DARK[1], LIGHT[1], k) * g, 0, 1) * 255;
                        d[j + 2] = clamp(mix(DARK[2], LIGHT[2], k) * g, 0, 1) * 255;
                        d[j + 3] = 255;
                    }
                }
            }, scene);
        },
        woodORM(scene, size, hf) {
            return this._tex("woodORM", size, (d, N) => {
                for (let i = 0, n = N * N; i < n; i++) {
                    const h = hf[i];
                    // 塗装したテーブル。導管（暗い所）はつや消し、平らな所は少し照る
                    const rough = clamp(0.62 - 0.24 * smooth(0.25, 0.85, h), 0.28, 1);
                    const j = i * 4;
                    d[j] = (0.86 + 0.14 * h) * 255; d[j + 1] = rough * 255;
                    d[j + 2] = 0; d[j + 3] = 255;
                }
            }, scene);
        }
    };

    // =================================================================
    //  マテリアル一式（シーンで1回だけ作ってキャッシュする）
    // 【対策】テクスチャの生成を組み立て関数の中に置くと、GUI で切れ数を
    //         変えるたびに 512x512 を 10 枚焼き直すことになる。分離しておく
    // =================================================================
    const CRUST_TEX_CM = 5.0;     // パン粉テクスチャ 1 タイルが何 cm に相当するか
    const MEAT_TEX_CM = 3.0;

    class Materials {
        constructor(scene, cfg) {
            // ---- 衣（パン粉）
            const S = cfg.crustSize;
            const hf = TextureLab.crustHeight(S, 1301);
            this.crustAlbedo = TextureLab.crustAlbedo(scene, S, hf);
            this.crustORM = TextureLab.crustORM(scene, S, hf);
            this.crustNormal = TextureLab.normalFrom(scene, "crustNormal", S, hf, 3.6);
            this.crustWax = TextureLab.crustWax(scene, S, hf);

            const k = new BABYLON.PBRMaterial("crust", scene);
            k.albedoColor = new BABYLON.Color3(1, 1, 1);   // 実色は頂点カラー
            k.albedoTexture = this.crustAlbedo;
            k.metallic = 0.0;
            k.roughness = 1.0;                              // 実値は ORM の G
            k.metallicTexture = this.crustORM;
            k.useAmbientOcclusionFromMetallicTextureRed = true;
            k.useRoughnessFromMetallicTextureGreen = true;
            k.useMetallnessFromMetallicTextureBlue = true;
            k.bumpTexture = this.crustNormal;
            k.bumpTexture.level = 1.30;
            // 【対策】clearCoat の intensity / roughness はテクスチャの R / G と
            //         乗算される。一様な値だと油膜が均一になり、濡れたプラスチックに
            //         見える。油だまりのテクスチャで散らす
            k.clearCoat.isEnabled = true;
            k.clearCoat.texture = this.crustWax;
            k.clearCoat.useRoughnessFromMainTexture = true;
            // 【対策】被覆率 0.85 / 粗さ 0.36 だと表面全体が油膜で覆われ、
            //   どれだけ粒を立てても「濡れたプラスチック」になる。
            //   揚げたてのパン粉は基本つや消しで、油はくぼみにだけ溜まる
            k.clearCoat.intensity = 0.30;
            k.clearCoat.roughness = 0.58;
            k.clearCoat.indexOfRefraction = 1.47;
            // 薄い破片は光を透かす。縁がオレンジに抜けると「揚がっている」感じが出る
            k.subSurface.isTranslucencyEnabled = true;
            k.subSurface.tintColor = new BABYLON.Color3(0.85, 0.46, 0.16);
            k.subSurface.translucencyIntensity = 0.28;
            k.subSurface.minimumThickness = 0.4;
            k.subSurface.maximumThickness = 2.4;
            this.crust = k;

            // ---- 切断面（豚ロース）
            const MS = 512;
            const mh = TextureLab.meatHeight(MS, 4409);
            this.meatAlbedoTex = TextureLab.meatAlbedo(scene, MS, mh);
            this.meatORMTex = TextureLab.meatORM(scene, MS, mh);
            this.meatNormalTex = TextureLab.normalFrom(scene, "meatNormal", MS, mh, 1.1);
            const m = new BABYLON.PBRMaterial("meat", scene);
            m.albedoColor = new BABYLON.Color3(1, 1, 1);
            m.albedoTexture = this.meatAlbedoTex;
            m.metallic = 0.0;
            m.roughness = 1.0;
            m.metallicTexture = this.meatORMTex;
            m.useAmbientOcclusionFromMetallicTextureRed = true;
            m.useRoughnessFromMetallicTextureGreen = true;
            m.useMetallnessFromMetallicTextureBlue = true;
            m.bumpTexture = this.meatNormalTex;
            m.bumpTexture.level = 0.42;
            // 切ったばかりの断面は肉汁で濡れている。ただし鏡ではない
            m.clearCoat.isEnabled = true;
            m.clearCoat.intensity = 0.34;
            m.clearCoat.roughness = 0.30;
            m.subSurface.isTranslucencyEnabled = true;
            m.subSurface.tintColor = new BABYLON.Color3(0.86, 0.52, 0.44);
            m.subSurface.translucencyIntensity = 0.20;
            m.subSurface.minimumThickness = 0.4;
            m.subSurface.maximumThickness = 2.0;
            // 【対策】切断面は「閉じた立体の中に張った一枚板」なので、
            //   巻き順がひとつでも食い違うと裏面カリングで丸ごと消える。
            //   本体（閉じた筒）は裏返っても内壁が見えて破綻が分かりにくいが、
            //   平面は消えて皿が透けて見える。両面描画にして依存を断つ
            m.backFaceCulling = false;
            // 【対策】twoSidedLighting を有効にすると、裏を向いた面はフラグメント
            //   単位で法線を反転して陰影を付ける。正しい向きの面が並ぶ中に
            //   数個だけ巻き順の違う三角形が混じると、そこだけ光源に背を向けて
            //   真っ黒に落ち、細い筋として見える。切断面は本来ほぼ平面なので、
            //   裏表で法線を切り替えず、常に表の法線で陰影を付けたほうが安全
            m.twoSidedLighting = false;
            this.meat = m;

            // ---- キャベツ
            // 【対策】千切りは 1 本 0.3mm 程度。厚みが無いので拡散だけでは
            //         必ず「白いプラ紐」になる。透過を強めに入れて、
            //         逆光側の縁が緑に抜けるようにする
            const c = new BABYLON.PBRMaterial("cabbage", scene);
            c.albedoColor = new BABYLON.Color3(1, 1, 1);   // 実色は頂点カラー
            c.metallic = 0.0;
            c.roughness = 0.42;
            c.clearCoat.isEnabled = true;
            c.clearCoat.intensity = 0.45;                  // 水気
            c.clearCoat.roughness = 0.22;
            c.subSurface.isTranslucencyEnabled = true;
            c.subSurface.tintColor = new BABYLON.Color3(0.72, 0.90, 0.46);
            c.subSurface.translucencyIntensity = 0.85;
            c.subSurface.minimumThickness = 0.02;
            c.subSurface.maximumThickness = 0.30;
            c.backFaceCulling = true;
            this.cabbage = c;

            // キャベツの山の芯（隙間から見える影）
            const cb = new BABYLON.PBRMaterial("cabbageBody", scene);
            cb.albedoColor = new BABYLON.Color3(srgb(0.42), srgb(0.46), srgb(0.31));
            cb.metallic = 0.0; cb.roughness = 0.78;
            this.cabbageBody = cb;

            // ---- とんかつソース
            const SS = 256;
            const sh = TextureLab.sauceHeight(SS, 733);
            this.sauceNormalTex = TextureLab.normalFrom(scene, "sauceNormal", SS, sh, 0.85);
            const sc = new BABYLON.PBRMaterial("sauce", scene);
            // 【対策】ソースは「黒」ではなく「非常に濃い赤茶」。真っ黒にすると
            //         穴に見える。リニアで 0.02 前後、赤に寄せる
            sc.albedoColor = new BABYLON.Color3(srgb(0.215), srgb(0.082), srgb(0.048));
            sc.metallic = 0.0;
            sc.roughness = 0.16;
            sc.bumpTexture = this.sauceNormalTex;
            sc.bumpTexture.level = 0.35;
            sc.bumpTexture.uScale = 4; sc.bumpTexture.vScale = 4;
            sc.clearCoat.isEnabled = true;
            sc.clearCoat.intensity = 0.95;
            sc.clearCoat.roughness = 0.09;
            sc.clearCoat.indexOfRefraction = 1.45;
            sc.subSurface.isTranslucencyEnabled = true;
            sc.subSurface.tintColor = new BABYLON.Color3(0.62, 0.20, 0.08);
            sc.subSurface.translucencyIntensity = 0.30;
            sc.subSurface.minimumThickness = 0.05;
            sc.subSurface.maximumThickness = 0.7;
            this.sauce = sc;

            // ---- からし
            const ka = new BABYLON.PBRMaterial("karashi", scene);
            ka.albedoColor = new BABYLON.Color3(srgb(0.905), srgb(0.700), srgb(0.115));
            ka.metallic = 0.0;
            ka.roughness = 0.30;
            ka.clearCoat.isEnabled = true;
            ka.clearCoat.intensity = 0.70;
            ka.clearCoat.roughness = 0.18;
            ka.subSurface.isTranslucencyEnabled = true;
            ka.subSurface.tintColor = new BABYLON.Color3(0.95, 0.78, 0.22);
            ka.subSurface.translucencyIntensity = 0.35;
            ka.subSurface.minimumThickness = 0.1;
            ka.subSurface.maximumThickness = 0.8;
            this.karashi = ka;

            // ---- 皿
            const PS = cfg.plateSize;
            const ph = TextureLab.plateHeight(PS, 55);
            this.plateAlbedoTex = TextureLab.plateAlbedo(scene, PS, ph);
            this.plateORMTex = TextureLab.plateORM(scene, PS, ph);
            this.plateNormalTex = TextureLab.normalFrom(scene, "plateNormal", PS, ph, 1.7);
            const p = new BABYLON.PBRMaterial("plate", scene);
            p.albedoColor = new BABYLON.Color3(1, 1, 1);   // 実色は頂点カラー
            p.albedoTexture = this.plateAlbedoTex;
            p.metallic = 0.0;
            p.roughness = 1.0;
            p.metallicTexture = this.plateORMTex;
            p.useRoughnessFromMetallicTextureGreen = true;
            p.useMetallnessFromMetallicTextureBlue = true;
            p.bumpTexture = this.plateNormalTex;
            p.bumpTexture.level = 0.55;
            this.plate = p;

            // ---- 木のテーブル
            if (cfg.showTable) {
                const WS = cfg.woodSize;
                const wh = TextureLab.woodHeight(WS, 812);
                this.woodAlbedoTex = TextureLab.woodAlbedo(scene, WS, wh, 812);
                this.woodORMTex = TextureLab.woodORM(scene, WS, wh);
                this.woodNormalTex = TextureLab.normalFrom(scene, "woodNormal", WS, wh, 0.9);
                for (const t of [this.woodAlbedoTex, this.woodORMTex, this.woodNormalTex]) {
                    t.uScale = 2.2; t.vScale = 2.2;
                }
                const w = new BABYLON.PBRMaterial("wood", scene);
                w.albedoTexture = this.woodAlbedoTex;
                w.metallic = 0.0;
                w.roughness = 1.0;
                w.metallicTexture = this.woodORMTex;
                w.useAmbientOcclusionFromMetallicTextureRed = true;
                w.useRoughnessFromMetallicTextureGreen = true;
                w.useMetallnessFromMetallicTextureBlue = true;
                w.bumpTexture = this.woodNormalTex;
                w.bumpTexture.level = 0.6;
                this.wood = w;
            }
        }
    }

    // =================================================================
    // 5. Cutlet : 1枚のロースかつを作り、包丁位置で切り分ける
    // =================================================================
    // 揚げ色（sRGB）
    // 【対策】油に濡れた面は「明るく」ではなく「暗く・彩度高く」なる。
    //         淡い色を広く置くと、いくら光沢を足しても粉を吹いたパンに見える
    // 【対策】実物のパン粉は、写真で測ると意外なほど明るい淡い金色。
    //   マホガニー寄りの茶色を主色に置くと、粒立ちがどれだけ出ていても
    //   「照りのあるハンバーグ」にしか見えない。主色をきつね色に上げ、
    //   濃い側は少数の破片の先だけに使う
    const C_PALE = [0.945, 0.855, 0.660];   // くぼみ・生のパン粉が残った所
    const C_LIGHT = [0.905, 0.720, 0.435];
    const C_MID = [0.830, 0.565, 0.265];   // きつね色（ここが主役）
    const C_DARK = [0.670, 0.385, 0.145];   // あめ色（出っ張った破片の先）
    const C_BURNT = [0.455, 0.230, 0.085];  // 焦げ。ごく一部にだけ

    // 断面の色（sRGB）
    const X_CRUST_OUT = [0.640, 0.365, 0.125];  // 衣の外側
    const X_CRUST_IN = [0.905, 0.795, 0.590];  // 衣の内側（揚がっていない白いパン粉）
    const X_CRUST_VOID = [0.505, 0.330, 0.170];  // パン粉同士の空隙
    const X_BATTER = [0.735, 0.545, 0.300];  // 小麦粉＋卵の層
    const X_FAT = [0.960, 0.930, 0.860];  // 脂身
    const X_MEAT = [0.845, 0.700, 0.632];  // 加熱した豚ロース
    const X_MEAT_D = [0.730, 0.560, 0.492];
    const X_MEAT_EDGE = [0.760, 0.575, 0.455];  // 衣に接して少し焼けた所

    function ramp3(t, a, b, c, out) {
        if (t < 0.5) { const k = t * 2; out[0] = mix(a[0], b[0], k); out[1] = mix(a[1], b[1], k); out[2] = mix(a[2], b[2], k); }
        else { const k = (t - 0.5) * 2; out[0] = mix(b[0], c[0], k); out[1] = mix(b[1], c[1], k); out[2] = mix(b[2], c[2], k); }
        return out;
    }

    class Cutlet {
        constructor(cfg, seed) {
            const rng = new Rng(seed);
            this.cfg = cfg;
            this.hL = cfg.cutletLength * 0.5;
            this.hW = cfg.cutletHalfW;
            this.hT = cfg.cutletHalfT;
            this.ns = rng.int(700000) + 1000;
            this.tone = rng.range(-0.05, 0.05);
            // 木の葉形の細り具合。1枚ごとに変える
            this.taper = rng.range(0.38, 0.50);
            this.bendZ = rng.range(-0.22, 0.22);
            this.rng = rng;
            this._buildRing();
        }

        // ---- 輪郭（上から見た形）------------------------------------
        // 【対策】(1-|p|^6)^0.35 は「幅がほぼ一定で両端だけ丸い」＝小判型。
        //   これだと何を貼ってもコロッケにしか見えない。豚ロースを一枚に
        //   開いた形は、背側が広く尾へ細る木の葉形で、いちばん張るのは
        //   端ではなく 1/3 あたり
        outlineW(p) {
            const a = clamp((p + 1) * 0.5, 0, 1);            // 0（広い側）→ 1（細い側）
            const cap = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(p), 7)), 0.30);
            const taper = 1 - this.taper * a;
            const belly = 1 + 0.13 * Math.sin(Math.PI * a);
            const wob = 1 + 0.090 * (Noise.fbm3(p * 2.4 + 11.3, 0.5, 0.5, this.ns + 3, 2) - 0.5) * 2;
            return this.hW * cap * taper * belly * wob;
        }
        outlineT(p) {
            const a = clamp((p + 1) * 0.5, 0, 1);
            const cap = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(p), 12)), 0.28);
            const taper = 1 - 0.22 * a;                      // 細い側は薄くもなる
            const wob = 1 + 0.085 * (Noise.fbm3(p * 3.1 + 4.7, 8.2, 2.3, this.ns + 9, 2) - 0.5) * 2;
            return this.hT * cap * taper * wob;
        }
        // 【対策】中心線を直線にすると、幅の変化が ±z へ均等に付いて
        //   「対称に細る紡錘」になる。実物は脂身の乗る外側の縁がほぼ直線で、
        //   細りはすべて反対側（赤身の端）に出る。中心線を幅の変化の
        //   半分ぶん逆に振って、片側だけを直線に寄せる
        centerZ(p) {
            return -(this.outlineW(p) - this.hW * 0.78) * 0.62
                + this.bendZ * (p * p - 0.34);
        }
        centerY(p) { return 0.06 * this.hT * (Noise.fbm3(p * 2.0 + 21.1, 3.3, 7.7, this.ns + 17, 2) - 0.5) * 2; }

        // ---- 断面リングの角度を弧長で等分する ------------------------
        // 【対策】φ を等分すると、幅 6.6cm・厚み 1.7cm という扁平な断面では
        //         短辺（左右の端）にばかり頂点が集まる。パン粉の凹凸が
        //         上面だけ潰れて「上はつるつる、横だけざらざら」になる
        // 断面の単位輪郭。t=0→0.5 が上面を -z→+z、0.5→1 が下面を +z→-z
        // 【対策】スーパー楕円は上下も左右も対称なので、どう転んでも
        //   「角の丸い長方形」にしかならない。豚ロースの断面は三方向とも
        //   非対称：
        //     ・下面（まな板に接していた側）は浅くて平ら
        //     ・上面は丸く盛り上がる
        //     ・脂身側（+z）は脂の帽子で鈍く、赤身の端（-z）は薄い楔
        //   x の刻みを cos で取って、両端（接線が垂直になる所）を密にする
        _sectionXY(t, out) {
            const up = t < 0.5;
            const u = up ? t * 2 : (t - 0.5) * 2;
            const x = up ? -Math.cos(Math.PI * u) : Math.cos(Math.PI * u);
            const bl = smooth(-0.25, 0.85, x);            // +z（脂側）へ 0→1
            const ax = Math.abs(x);
            let raw;
            if (up) {
                const nT = 3.0 + 3.0 * bl;                // 脂側ほど角ばる＝鈍い
                raw = Math.pow(Math.max(0, 1 - Math.pow(ax, nT)), 0.44);
            } else {
                const nB = 7.5 + 3.5 * bl;
                raw = -0.72 * Math.pow(Math.max(0, 1 - Math.pow(ax, nB)), 0.22);
            }
            out.x = x;
            out.y = (raw - 0.14) / 0.86;                  // -1..+1 に正規化
            return out;
        }

        _buildRing() {
            const M = this.cfg.ringSeg;
            const NS = 3072, W0 = this.hW, T0 = this.hT;
            const px = new Float64Array(NS + 1), py = new Float64Array(NS + 1), arc = new Float64Array(NS + 1);
            const q = { x: 0, y: 0 };
            for (let i = 0; i <= NS; i++) {
                this._sectionXY(i / NS, q);
                px[i] = W0 * q.x;
                py[i] = T0 * q.y;
                arc[i] = i === 0 ? 0 : arc[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
            }
            const total = arc[NS];
            this.perimeter = total;
            this.tPar = new Float64Array(M + 1);
            this.uArc = new Float64Array(M + 1);
            let k = 0;
            for (let j = 0; j <= M; j++) {
                const target = total * j / M;
                while (k < NS && arc[k + 1] < target) k++;
                const seg = Math.max(1e-9, arc[k + 1] - arc[k]);
                const t = clamp((target - arc[k]) / seg, 0, 1);
                this.tPar[j] = (k + t) / NS;
                this.uArc[j] = target;
            }
            // 断面の単位形状をキャッシュ（rc = 幅方向, rs = 厚み方向）
            this.rc = new Float64Array(M + 1);
            this.rs = new Float64Array(M + 1);
            for (let j = 0; j <= M; j++) {
                this._sectionXY(this.tPar[j], q);
                this.rc[j] = q.x; this.rs[j] = q.y;
            }
        }

        // ---- 変位のない基準面 ---------------------------------------
        basePoint(p, j, out) {
            const W = this.outlineW(p), T = this.outlineT(p);
            out.x = p * this.hL;
            out.y = T * this.rs[j] + this.centerY(p);
            out.z = W * this.rc[j] + this.centerZ(p);
            return out;
        }

        // ---- パン粉の凹凸 -------------------------------------------
        // 【対策】等方ノイズを閾値処理しただけでは「粒」にしかならない。
        //         伸びた破片（shard2）を主成分にし、揚げ膨れ（低周波）と
        //         破片の隙間（負の項）を重ねて初めてパン粉に見える
        crustField(x, y, z, o) {
            const s = this.ns, N = Noise, F = this.cfg.crustFreq;
            // 大きい破片（5〜8mm）
            const shard = N.shard2(x * F, y * F, z * F, s + 211);
            const fl = smooth(0.498, 0.552, shard);       // 立ち上がりを急に＝上面が平らな板
            // 【対策】ひとつの周波数だけだと、大きさの揃った鱗になる。
            //   その上に一回り小さい破片を乗せて、輪郭をぎざぎざにする
            const shard2 = N.shard2(x * F * 2.45 + 11.3, y * F * 2.45, z * F * 2.45 - 7.1, s + 617);
            const fl2 = smooth(0.505, 0.575, shard2);
            const blister = N.fbm3(x * 0.50, y * 0.50, z * 0.50, s + 41, 3) - 0.5;
            const gap = smooth(0.500, 0.300, N.fbm3(x * F * 0.95, y * F * 0.95, z * F * 0.95, s + 83, 3));
            const grain = N.fbm3(x * 11.0, y * 11.0, z * 11.0, s + 127, 2) - 0.5;
            // 【対策】焼けムラをなめらかなノイズで作ると、必ず「まだらの肉塊」になる。
            //   パン粉は破片ごとに独立して焼けるので、色は破片の単位で
            //   階段状に飛ぶ。値ノイズを量子化して破片 ID 代わりの色差を作る
            const idn = N.fbm3(x * F * 1.7 + 31.7, y * F * 1.7, z * F * 1.7 + 19.3, s + 911, 1);
            const tone = Math.floor(clamp(idn, 0, 0.999) * 6) / 5 - 0.5;
            o.d = this.cfg.crustAmp *
                (0.104 * fl + 0.058 * fl2 + 0.058 * blister - 0.074 * gap + 0.021 * grain);
            o.fl = fl; o.fl2 = fl2; o.blister = blister;
            o.gap = gap; o.grain = grain; o.tone = tone;
            return o;
        }

        // 外側の揚げ色。凹凸と必ず相関させる
        crustColor(o, ny, out) {
            // 【対策】以前は o.d（＝低周波の揚げ膨れが支配的）と blister で
            //   色を決めていたので、2cm 周期のまだら模様になっていた。
            //   破片そのもの（fl / fl2）と破片ごとの階段色（tone）を主に、
            //   揚げ膨れは味付け程度に落とす
            const t = clamp(0.20 + 0.40 * o.fl + 0.16 * o.fl2 + 0.26 * o.tone
                + 0.10 * o.blister - 0.22 * o.gap + this.tone
                - 0.14 * smooth(-0.2, -0.8, ny), 0, 1);
            let r, g, b;
            if (t < 0.36) { const k = t / 0.36; r = mix(C_PALE[0], C_LIGHT[0], k); g = mix(C_PALE[1], C_LIGHT[1], k); b = mix(C_PALE[2], C_LIGHT[2], k); }
            else if (t < 0.72) { const k = (t - 0.36) / 0.36; r = mix(C_LIGHT[0], C_MID[0], k); g = mix(C_LIGHT[1], C_MID[1], k); b = mix(C_LIGHT[2], C_MID[2], k); }
            else { const k = (t - 0.72) / 0.28; r = mix(C_MID[0], C_DARK[0], k); g = mix(C_MID[1], C_DARK[1], k); b = mix(C_MID[2], C_DARK[2], k); }
            // 焦げ：出っ張った破片のうち、さらに一部だけ
            const burn = smooth(0.88, 1.0, t) * smooth(0.62, 0.90, o.grain + 0.5) * 0.55;
            r = mix(r, C_BURNT[0], burn); g = mix(g, C_BURNT[1], burn); b = mix(b, C_BURNT[2], burn);
            // 破片の隙間は光が入らない。暗く落として粒立ちを出す
            const void_ = smooth(0.35, 0.95, o.gap) * 0.34;
            r *= (1 - void_ * 0.55); g *= (1 - void_ * 0.62); b *= (1 - void_ * 0.66);
            out[0] = srgb(r); out[1] = srgb(g); out[2] = srgb(b);
            return out;
        }

        // ---- 切断面の色（層構造）------------------------------------
        // d = 輪郭からの距離[cm]。cz/cy は断面内の位置
        cutColor(d, y, z, cUnit, out) {
            const s = this.ns, N = Noise;
            // 衣の厚みは場所でばらつく。均一だと「縁取りを描いた紙」に見える
            const ct = this.cfg.crustThick * (0.78 + 0.44 * N.fbm3(y * 3.2, z * 3.2, 5.5, s + 301, 2));
            const bt = 0.055 + 0.030 * N.fbm3(y * 4.0, z * 4.0, 11.5, s + 331, 2);
            let r, g, b;
            if (d < ct) {
                // パン粉の断面。外側 1mm ほどが濃く、内側は白いまま
                const q = clamp(d / Math.max(1e-4, ct), 0, 1);
                // 【対策】0.06〜0.55 で茶→白に振ると、帯の半分以上が
                //   生パン粉の白になり、断面の外周に太い白縁が回る。
                //   実物は断面から見ても大半がきつね色で、白いのは最内層だけ
                const brown = 1 - smooth(0.42, 0.90, q);
                const cell = N.fbm3(y * 11.0, z * 11.0, 3.1, s + 361, 3);
                const hole = smooth(0.44, 0.20, cell);       // 空隙
                r = mix(X_CRUST_IN[0], X_CRUST_OUT[0], brown);
                g = mix(X_CRUST_IN[1], X_CRUST_OUT[1], brown);
                b = mix(X_CRUST_IN[2], X_CRUST_OUT[2], brown);
                r = mix(r, X_CRUST_VOID[0], hole * 0.72);
                g = mix(g, X_CRUST_VOID[1], hole * 0.72);
                b = mix(b, X_CRUST_VOID[2], hole * 0.72);
            } else if (d < ct + bt) {
                const q = smooth(0, 1, (d - ct) / bt);
                r = mix(X_BATTER[0], X_MEAT_EDGE[0], q);
                g = mix(X_BATTER[1], X_MEAT_EDGE[1], q);
                b = mix(X_BATTER[2], X_MEAT_EDGE[2], q);
            } else {
                // 肉。繊維の束はテクスチャ側に任せ、ここは広い濃淡だけ
                const marb = N.fbm3(y * 5.5, z * 5.5, 7.7, s + 401, 3);
                const t = smooth(0.34, 0.72, marb);
                r = mix(X_MEAT_D[0], X_MEAT[0], t);
                g = mix(X_MEAT_D[1], X_MEAT[1], t);
                b = mix(X_MEAT_D[2], X_MEAT[2], t);
                // 衣に接する数 mm は熱が回って茶色い
                const edge = 1 - smooth(0, 0.30, d - ct - bt);
                r = mix(r, X_MEAT_EDGE[0], edge * 0.55);
                g = mix(g, X_MEAT_EDGE[1], edge * 0.55);
                b = mix(b, X_MEAT_EDGE[2], edge * 0.55);
            }
            // 脂身：ロースは片側の縁だけに白い帯が乗る
            // 【対策】全周に回すと「白い縁取り」になって蒲鉾に見える。
            //         cUnit（断面の +z 端に近いほど 1）で片側に限定する
            // 【対策】脂身の帽子はロースの見分け所なので、細い帯では効かない。
            //   +z 側の 1/3 ほどに、厚みのばらつく白い層としてはっきり乗せる
            const side = smooth(0.26, 0.74, cUnit);
            const fatN = N.fbm3(y * 2.2, z * 2.2, 17.3, s + 431, 2);
            const ft = this.cfg.fatThick * (0.55 + 1.35 * fatN);
            const inBand = smooth(ct - 0.02, ct + 0.05, d) * (1 - smooth(ct + ft - 0.06, ct + ft + 0.06, d));
            const fat = side * inBand * smooth(0.22, 0.46, fatN);
            r = mix(r, X_FAT[0], fat); g = mix(g, X_FAT[1], fat); b = mix(b, X_FAT[2], fat);
            out[0] = srgb(r); out[1] = srgb(g); out[2] = srgb(b);
            return out;
        }
    }

    // ---- 切断面のリングの入れ子。衣と脂身の帯に頂点を寄せてある --------
    // 【対策】外周の刻みを細かくしすぎると、リング間の距離が衣の凹凸の
    //   隣どうしの差より小さくなり、縁の四角形が局所的に裏返る。
    //   最初の一歩は凹凸の起伏より大きく取る
    const CAP_INSET = [0, 0.070, 0.125, 0.185, 0.250, 0.320, 0.398, 0.482,
        0.572, 0.665, 0.755, 0.835, 0.898, 0.945, 0.978, 1.0];

    // 掃引本体。切断位置の境界リング（変位込み）も返す
    function buildSliceBody(cutlet, cfg, i, n, xc, scene, mats) {
        const M = cfg.ringSeg, W1 = M + 1;
        const pa = -1 + 2 * i / n, pb = -1 + 2 * (i + 1) / n;
        const endLow = (i === 0), endHigh = (i === n - 1);
        const R = (endLow || endHigh) ? cfg.sweepRows + 7 : cfg.sweepRows;
        const total = (R + 1) * W1;

        // 1) 変位のない基準面
        const bx = new Float64Array(total), by = new Float64Array(total), bz = new Float64Array(total);
        const ps = new Float64Array(R + 1);
        const tmp = { x: 0, y: 0, z: 0 };
        for (let r = 0; r <= R; r++) {
            const t = r / R;
            // 【対策】丸い端（切っていない側）は 2mm の間に輪郭が消える。
            //         等間隔に刻むと、そこだけ多角形の角が立って見える
            let g = t;
            if (endLow) g = Math.pow(t, 1.9);
            else if (endHigh) g = 1 - Math.pow(1 - t, 1.9);
            const p = mix(pa, pb, g);
            ps[r] = p;
            for (let j = 0; j <= M; j++) {
                const k = r * W1 + j;
                cutlet.basePoint(p, j, tmp);
                bx[k] = tmp.x; by[k] = tmp.y; bz[k] = tmp.z;
            }
        }

        // 2) 基準面の外向き法線（中心差分）
        const nx = new Float64Array(total), ny = new Float64Array(total), nz = new Float64Array(total);
        for (let r = 0; r <= R; r++) {
            const p = ps[r], cy = cutlet.centerY(p), cz = cutlet.centerZ(p);
            const rm = Math.max(0, r - 1), rp = Math.min(R, r + 1);
            for (let j = 0; j <= M; j++) {
                // j = 0 と j = M は同じ点。折り返さず 1 つ内側を使う
                const jm = (j === 0) ? M - 1 : j - 1;
                const jp = (j === M) ? 1 : j + 1;
                const a = r * W1 + jm, b = r * W1 + jp;
                const c = rm * W1 + j, d = rp * W1 + j;
                const ax = bx[b] - bx[a], ay = by[b] - by[a], az = bz[b] - bz[a];
                const dx = bx[d] - bx[c], dy = by[d] - by[c], dz = bz[d] - bz[c];
                let vx = ay * dz - az * dy, vy = az * dx - ax * dz, vz = ax * dy - ay * dx;
                let L = Math.hypot(vx, vy, vz);
                const k = r * W1 + j;
                if (L < 1e-9) {
                    // 端がひとつの点に潰れた行。軸方向を法線にする
                    vx = (p < 0 ? -1 : 1); vy = 0; vz = 0; L = 1;
                }
                vx /= L; vy /= L; vz /= L;
                // 断面の中心から外を向かせる
                if (vx * (bx[k] - p * cutlet.hL) + vy * (by[k] - cy) + vz * (bz[k] - cz) < 0) {
                    vx = -vx; vy = -vy; vz = -vz;
                }
                nx[k] = vx; ny[k] = vy; nz[k] = vz;
            }
        }

        // 3) 変位・色・UV
        const uWrap = Math.max(1, Math.round(cutlet.perimeter / CRUST_TEX_CM));

        // 【対策】切っていない丸い端では、リングが 1 点（極）に潰れる。
        //   そこへ円筒 UV（u = 弧長, v = 長さ）を当てると、周長が 0 に
        //   近づくのに u は 0〜uWrap の全域を保ったままなので、
        //   テクスチャが極から放射状に引き伸ばされる。地球儀の極が
        //   歪むのと同じ現象で、これがあの「日輪」の正体。
        //   端の切れだけ方位等距離図法に切り替える：
        //     半径 = 極からの表面に沿った距離 / タイル寸法
        //     角度 = リング上の位置
        //   極では半径が 0 に収束するので扇が生じない。周方向の密度は
        //   極から離れるほど伸びるが、端の切れは長さ 1.5cm ほどなので
        //   1.5 倍以内に収まる
        const polar = endLow || endHigh;
        const D = new Float64Array(R + 1);
        if (polar) {
            const cen = (r) => {
                let sx = 0, sy = 0, sz = 0;
                for (let j = 0; j < M; j++) {
                    const k = r * W1 + j; sx += bx[k]; sy += by[k]; sz += bz[k];
                }
                return [sx / M, sy / M, sz / M];
            };
            const step = (r0, r1) => {
                const a0 = cen(r0), a1 = cen(r1);
                // 極付近では中心どうしの距離では足りない。リングの広がりも足す
                let e0 = 0, e1 = 0;
                for (let j = 0; j < M; j++) {
                    const k0 = r0 * W1 + j, k1 = r1 * W1 + j;
                    e0 += Math.hypot(bx[k0] - a0[0], by[k0] - a0[1], bz[k0] - a0[2]);
                    e1 += Math.hypot(bx[k1] - a1[0], by[k1] - a1[1], bz[k1] - a1[2]);
                }
                e0 /= M; e1 /= M;
                const ax = Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]);
                return Math.hypot(ax, e1 - e0);
            };
            if (endLow) {
                for (let r = 1; r <= R; r++) D[r] = D[r - 1] + step(r - 1, r);
            } else {
                for (let r = R - 1; r >= 0; r--) D[r] = D[r + 1] + step(r + 1, r);
            }
        }
        const pts = new Array(total), cols = new Array(total);
        const uvs = new Array(total);
        const o = { d: 0, fl: 0, blister: 0, gap: 0, grain: 0 }, C = [0, 0, 0];
        for (let r = 0; r <= R; r++) {
            const v = ps[r] * cutlet.hL / CRUST_TEX_CM;
            for (let j = 0; j <= M; j++) {
                const k = r * W1 + j;
                cutlet.crustField(bx[k], by[k], bz[k], o);
                const x = bx[k] + nx[k] * o.d, y = by[k] + ny[k] * o.d, z = bz[k] + nz[k] * o.d;
                pts[k] = new V3(x - xc, y, z);
                const c = cutlet.crustColor(o, ny[k], C);
                cols[k] = [c[0], c[1], c[2]];
                // 【対策】u を弧長 / 5cm でそのまま刻むと、リングの継ぎ目で
                //   u が 0 と 周長/5 に割れる。周長は 5cm の整数倍ではないので、
                //   テクスチャが一周して戻ってこず、継ぎ目に線が1本出る。
                //   これまでは継ぎ目が断面の +z 端（カメラの向こう側）にあって
                //   見えていなかっただけ。周長を整数タイルに丸めて必ず閉じる
                if (polar) {
                    const th = 2 * Math.PI * cutlet.uArc[j] / cutlet.perimeter;
                    const rad = D[r] / CRUST_TEX_CM;
                    uvs[k] = [3.17 + rad * Math.cos(th), 2.41 + rad * Math.sin(th)];
                } else {
                    uvs[k] = [cutlet.uArc[j] / cutlet.perimeter * uWrap, v];
                }
            }
        }

        const center = new V3(0, 0, cutlet.centerZ(mix(pa, pb, 0.5)));
        const mesh = gridMesh("katsuBody" + i, pts, cols, R, M, center, scene,
            (a, b, k) => uvs[k]);
        mesh.material = mats.crust;
        mesh.receiveShadows = true;

        // 境界リング（キャップと厳密に共有する）
        const ringLow = pts.slice(0, W1);
        const ringHigh = pts.slice(R * W1, R * W1 + W1);
        return { mesh, ringLow, ringHigh, pa, pb, endLow, endHigh };
    }

    // 切断面。境界は本体のリングをそのまま使い、内側へ入れ子に縮めて張る
    // 【対策】キャップを独立した式で作ると、パン粉の変位ぶんだけ外周が
    //         食い違って隙間が開く。必ず本体の頂点を共有する
    function buildSliceCap(cutlet, cfg, name, pCut, ring, xc, scene, mats) {
        const M = cfg.ringSeg, W1 = M + 1;
        const K = CAP_INSET.length - 1;
        const T = cutlet.outlineT(pCut), W = cutlet.outlineW(pCut);
        const cy = cutlet.centerY(pCut), cz = cutlet.centerZ(pCut);
        const x0 = pCut * cutlet.hL - xc;
        const total = (K + 1) * W1;
        const sgn = x0 >= 0 ? 1 : -1;
        const pts = new Array(total), cols = new Array(total);
        const C = [0, 0, 0];
        // 輪郭ポリライン（この p での実寸 cm）。色を決める「輪郭からの距離」を
        // ここから厳密に測る
        // 【対策】距離を 1 次近似 d = s * (法線と動径の内積) で求めていたが、
        //   断面の幅方向の端のすぐ内側では、壁がほぼ垂直（法線が y 方向）なのに
        //   動径はほぼ z 方向を向くので、両者が直交して内積がほぼ 0 になる。
        //   そこだけ「中心まで来ても d がまだ 0.13cm」＝衣の帯のまま、
        //   しかも relax が抜けないので凹凸を持ったまま中心へ伸びる。
        //   これが両端から中心へ走る 2 本の筋（＝ワニの口）の正体。
        //   近似はやめて、輪郭までの最短距離を実際に測る
        const oz = new Float64Array(M + 1), oy = new Float64Array(M + 1);
        for (let j = 0; j <= M; j++) {
            oz[j] = W * cutlet.rc[j]; oy[j] = T * cutlet.rs[j];
        }
        const STEP = 2;
        const distOut = (py, pz) => {
            let best = 1e18;
            for (let q = 0; q < M; q += STEP) {
                const q2 = Math.min(M, q + STEP);
                const az = oz[q], ay = oy[q];
                const ez = oz[q2] - az, ey = oy[q2] - ay;
                const ll = ez * ez + ey * ey;
                let t2 = ll > 1e-12 ? ((pz - az) * ez + (py - ay) * ey) / ll : 0;
                t2 = t2 < 0 ? 0 : (t2 > 1 ? 1 : t2);
                const dz = pz - (az + ez * t2), dy = py - (ay + ey * t2);
                const dd2 = dz * dz + dy * dy;
                if (dd2 < best) best = dd2;
            }
            return Math.sqrt(best);
        };

        // 【対策】中心へ相似縮小すると、内側のリングでは 169 点が一箇所へ
        //   集まるので、リング間隔（最大 0.35cm）に対して周方向の間隔が
        //   0.01cm まで詰まり、アスペクト比 40:1 の針状三角形が並ぶ。
        //   面としては正しくても、法線とテクスチャがそこだけ暴れて
        //   「先端から中心へ走る筋」に見える。
        //   内側ほど周方向を間引き、余った頂点は隣と完全に同一座標へ重ねる。
        //   面積ちょうど 0 の三角形はラスタライズされないので跡が残らない
        const STEPS = [1, 2, 3, 4, 6, 8, 12, 24];      // いずれも M=168 の約数
        const stepFor = (g) => {
            const want = 9.5 * (1 / K) / Math.max(g, 1e-3);
            let out = 1;
            for (const v of STEPS) if (v <= want) out = v;
            return out;
        };

        for (let k = 0; k <= K; k++) {
            const sIn = CAP_INSET[k];
            const jStep = stepFor(1 - sIn);
            for (let j0 = 0; j0 <= M; j0++) {
                const j = Math.min(M, Math.round(j0 / jStep) * jStep);
                const idx = k * W1 + j0;
                const py0 = T * cutlet.rs[j], pz0 = W * cutlet.rc[j];
                // 【対策】輪郭を法線方向へ一定量オフセットして内側のリングを作ると、
                //   凸な曲線では隣り合う法線が収束するので、曲率半径を超えた時点で
                //   面が必ず折り返す。断面の先端（曲率半径 1mm 以下）では
                //   0.1cm 入れただけで破綻し、そこに毎回同じ棘が出ていた。
                //   （軸ごとに (T-d)/(W-d) と縮める旧方式も、扁平さゆえに同じ所で折れる）
                //   幾何は「中心へ向かう相似縮小」にする。星形領域の相似縮小は
                //   原理的に折り返さない。均一な衣の帯は、色を決める距離 d の側を
                //   1次近似 d = s * proj[j] で正しく求めることで両立させる
                const g = 1 - sIn;
                const fy = cy + py0 * g;
                const fz = cz + pz0 * g;
                const d = distOut(fy - cy, fz - cz);
                // 【対策】relax はリング番号 sIn ではなく実距離 d で決める。
                //   リングの実間隔は proj に比例して 0.8〜3.4cm と 4 倍以上変わるので、
                //   番号で一律に抜くと、間隔の狭い所（上面）で
                //   「衣の凹凸の減り方 > リングの進み」となって縁が裏返る
                //   （実測：巻き順の一致率 99.7% → 99.3% に悪化した）
                //   減衰は速めに。リング間の「垂直方向」の間隔は 0.05cm ほどしか
                //   ないので、衣の凹凸（隣どうしで 0.08cm 変わる）を長く引きずると
                //   縁の四角形がそれに負けて裏返る
                const relax = 1 - smooth(0, 0.075, d);
                // d = 0 での平坦点。本体リングとの差を relax で持ち込む
                const f0y = cy + py0, f0z = cz + pz0;
                const rp = ring[j];
                // 包丁の通った面はわずかにうねる（完全な平面は工業製品に見える）
                const wob = 0.026 * (Noise.fbm3(fy * 2.6, fz * 2.6, 31.7, cutlet.ns + 511, 2) - 0.5) * 2
                    * smooth(0.08, 0.34, d);
                // 【対策】切断面を衣の縁と面一に置くと、隣の切れが 0.5mm でも
                //   食い込んだ瞬間に、この一枚板の縁が衣を突き抜けて外へ出る。
                //   断面の薄い楔（-z 端）ほど貫きやすく、そこに棘が生える。
                //   実物でも切り口は衣の出っ張りより一段奥にあるので、
                //   内側だけ包丁の向きへ引っ込めて余裕を作る
                const x = x0 + (rp.x - x0) * relax + wob
                    - sgn * cfg.capRecess * (1 - relax);
                const y = fy + (rp.y - f0y) * relax;
                const z = fz + (rp.z - f0z) * relax;
                pts[idx] = new V3(x, y, z);
                const c = cutlet.cutColor(d, y, z, cutlet.rc[j], C);
                cols[idx] = [c[0], c[1], c[2]];
            }
        }
        // 【対策】巻き順の判定を「重心から外向き」の推定に任せると、
        //   切断面のような平らな一枚板では、断面内の位置ベクトルが
        //   法線とほぼ直交していて判定材料にならない。包丁の向き（±x）は
        //   分かり切っているので、参照法線として明示的に渡す
        const refN = new Float32Array(total * 3);
        for (let k = 0; k < total; k++) refN[k * 3] = sgn;
        const center = new V3(0, cy, cz);
        const mesh = gridMesh(name, pts, cols, K, M, center, scene,
            (a, b, idx) => [pts[idx].z / MEAT_TEX_CM, pts[idx].y / MEAT_TEX_CM], refN);
        mesh.material = mats.meat;
        mesh.receiveShadows = true;
        return mesh;
    }

    function buildSlice(cutlet, cfg, i, n, scene, mats) {
        const pa = -1 + 2 * i / n, pb = -1 + 2 * (i + 1) / n;
        const xc = (pa + pb) * 0.5 * cutlet.hL;
        const body = buildSliceBody(cutlet, cfg, i, n, xc, scene, mats);
        const meshes = [body.mesh];
        if (!body.endLow) {
            meshes.push(buildSliceCap(cutlet, cfg, "katsuCapA" + i, pa, body.ringLow, xc, scene, mats));
        }
        if (!body.endHigh) {
            meshes.push(buildSliceCap(cutlet, cfg, "katsuCapB" + i, pb, body.ringHigh, xc, scene, mats));
        }
        return meshes;
    }

    // =================================================================
    // 6. Cabbage : 千切りキャベツ
    // =================================================================
    // 断面は「丸」ではなく「平たい長方形」。6 点で角を作る
    // 【対策】円柱で作ると、どれだけ細くしても白いビニール紐にしか見えない。
    //         幅 1.5mm / 厚み 0.35mm の板であることが、光り方の全てを決める
    const SHRED_SECTION = [[1, 1], [0, 1], [-1, 1], [-1, -1], [0, -1], [1, -1]];

    const CAB_WHITE = [0.960, 0.950, 0.888];
    const CAB_PALE = [0.900, 0.930, 0.752];
    const CAB_GREEN = [0.640, 0.800, 0.400];
    const CAB_DEEP = [0.415, 0.610, 0.242];

    function cabbageColor(g, out) {
        let r, gg, b;
        if (g < 0.34) { const k = g / 0.34; r = mix(CAB_WHITE[0], CAB_PALE[0], k); gg = mix(CAB_WHITE[1], CAB_PALE[1], k); b = mix(CAB_WHITE[2], CAB_PALE[2], k); }
        else if (g < 0.72) { const k = (g - 0.34) / 0.38; r = mix(CAB_PALE[0], CAB_GREEN[0], k); gg = mix(CAB_PALE[1], CAB_GREEN[1], k); b = mix(CAB_PALE[2], CAB_GREEN[2], k); }
        else { const k = (g - 0.72) / 0.28; r = mix(CAB_GREEN[0], CAB_DEEP[0], k); gg = mix(CAB_GREEN[1], CAB_DEEP[1], k); b = mix(CAB_GREEN[2], CAB_DEEP[2], k); }
        out[0] = srgb(r); out[1] = srgb(gg); out[2] = srgb(b);
        return out;
    }

    // 千切り 1 本を掃引して、共有の配列へ書き足す
    function emitShred(acc, cfg, rng, C0, dir, up, len, hw, ht, green, greenRamp, curl) {
        const S = cfg.shredSeg, Mr = SHRED_SECTION.length, W1 = Mr + 1;
        const base = acc.count;

        // 直交フレーム
        let tx = dir.x, ty = dir.y, tz = dir.z;
        let L = Math.hypot(tx, ty, tz) || 1; tx /= L; ty /= L; tz /= L;
        // up と直交化して N, B を作る
        let ux = up.x, uy = up.y, uz = up.z;
        const dp = ux * tx + uy * ty + uz * tz;
        ux -= tx * dp; uy -= ty * dp; uz -= tz * dp;
        L = Math.hypot(ux, uy, uz);
        if (L < 1e-6) { ux = 0; uy = 1; uz = 0; const d2 = uy * ty; ux -= tx * d2; uy -= ty * d2; uz -= tz * d2; L = Math.hypot(ux, uy, uz) || 1; }
        ux /= L; uy /= L; uz /= L;
        // B = T x U
        const bx = ty * uz - tz * uy, by = tz * ux - tx * uz, bz = tx * uy - ty * ux;

        // 反りとねじれ。1本ずつ違わないと「工場出荷のモール」に見える
        const c1 = curl * rng.range(-1, 1), c2 = curl * rng.range(-0.7, 0.7);
        const c3 = curl * rng.range(-0.5, 0.5);
        const tw0 = rng.range(0, Math.PI * 2), tw1 = rng.range(-1.6, 1.6);

        const C = [0, 0, 0];
        for (let r = 0; r <= S; r++) {
            // 端の 2% だけを潰して蓋にする（断面は本来まっすぐ切られている）
            let s, sc;
            if (r === 0) { s = 0; sc = 0; }
            else if (r === S) { s = 1; sc = 0; }
            else { s = 0.02 + 0.96 * (r - 1) / (S - 2); sc = 1; }
            const q = s - 0.5;
            // 中心線
            const off1 = c1 * q * q * len, off2 = c2 * q * q * q * len, off3 = c3 * q * len * 0.25;
            const cx = C0.x + tx * q * len + ux * off1 + bx * off2 + tx * off3;
            const cy = C0.y + ty * q * len + uy * off1 + by * off2 + ty * off3;
            const cz = C0.z + tz * q * len + uz * off1 + bz * off2 + tz * off3;
            // 接線（曲がりを反映）
            let dx = tx + ux * (2 * c1 * q) + bx * (3 * c2 * q * q);
            let dy = ty + uy * (2 * c1 * q) + by * (3 * c2 * q * q);
            let dz = tz + uz * (2 * c1 * q) + bz * (3 * c2 * q * q);
            L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
            // フレームを接線に合わせて直交化
            let e1x = ux, e1y = uy, e1z = uz;
            const d3 = e1x * dx + e1y * dy + e1z * dz;
            e1x -= dx * d3; e1y -= dy * d3; e1z -= dz * d3;
            L = Math.hypot(e1x, e1y, e1z) || 1; e1x /= L; e1y /= L; e1z /= L;
            const e2x = dy * e1z - dz * e1y, e2y = dz * e1x - dx * e1z, e2z = dx * e1y - dy * e1x;
            // ねじれ
            const tw = tw0 + tw1 * s;
            const ct = Math.cos(tw), st = Math.sin(tw);
            const ax = e1x * ct + e2x * st, ay = e1y * ct + e2y * st, az = e1z * ct + e2z * st;
            const nx2 = -e1x * st + e2x * ct, ny2 = -e1y * st + e2y * ct, nz2 = -e1z * st + e2z * ct;

            const g = clamp(green + greenRamp * (s - 0.5) * 2, 0, 1);
            cabbageColor(g, C);
            for (let m = 0; m <= Mr; m++) {
                const sec = SHRED_SECTION[m % Mr];
                const wu = sec[0] * hw * sc, wv = sec[1] * ht * sc;
                const k = acc.count++;
                acc.px[k] = cx + ax * wu + nx2 * wv;
                acc.py[k] = cy + ay * wu + ny2 * wv;
                acc.pz[k] = cz + az * wu + nz2 * wv;
                // 参照法線（巻き順の判定に使う）。厚み方向を主にする
                let rx = ax * sec[0] * 0.25 + nx2 * sec[1];
                let ry = ay * sec[0] * 0.25 + ny2 * sec[1];
                let rz = az * sec[0] * 0.25 + nz2 * sec[1];
                L = Math.hypot(rx, ry, rz) || 1;
                acc.rx[k] = rx / L; acc.ry[k] = ry / L; acc.rz[k] = rz / L;
                acc.cr[k] = C[0]; acc.cg[k] = C[1]; acc.cb[k] = C[2];
                acc.u[k] = m / Mr; acc.v[k] = s;
            }
        }
        for (let r = 0; r < S; r++) for (let m = 0; m < Mr; m++) {
            const A = base + r * W1 + m, B = A + 1, Cc = A + W1, D = Cc + 1;
            acc.idx.push(A, Cc, B, B, Cc, D);
        }
    }

    function buildCabbage(scene, cfg, seed, mats, floorY) {
        const rng = new Rng(seed);
        const N = cfg.shredCount, S = cfg.shredSeg, Mr = SHRED_SECTION.length;
        const perShred = (S + 1) * (Mr + 1);
        const cap = N * perShred;
        const acc = {
            count: 0, idx: [],
            px: new Float32Array(cap), py: new Float32Array(cap), pz: new Float32Array(cap),
            rx: new Float32Array(cap), ry: new Float32Array(cap), rz: new Float32Array(cap),
            cr: new Float32Array(cap), cg: new Float32Array(cap), cb: new Float32Array(cap),
            u: new Float32Array(cap), v: new Float32Array(cap)
        };

        const R = cfg.moundR, H = cfg.moundH;
        const domeY = (r) => H * Math.pow(Math.max(0, 1 - (r / R) * (r / R)), 0.72);
        const domeSlope = (r) => {                       // dy/dr
            const h = 0.01;
            return (domeY(r + h) - domeY(Math.max(0, r - h))) / (r > h ? 2 * h : h);
        };

        for (let i = 0; i < N; i++) {
            // 【対策】山を「面」だけに敷くと、必ずどこかに素通しの穴が開く。
            //         層を 3 枚重ね、深い層ほど内側に置いて隙間を塞ぐ
            const layer = i % 3;
            const rr = R * Math.pow(rng.next(), 0.52) * (1 - layer * 0.10);
            const th = rng.range(0, Math.PI * 2);
            const sy = domeY(rr), sl = domeSlope(rr);
            const depth = layer * 0.26 + rng.range(0, 0.22);

            const cx = cfg.moundX + rr * Math.cos(th);
            const cz = cfg.moundZ + rr * Math.sin(th);
            // 【対策】山の底を一定の高さにすると、皿がすり鉢なので外周で
            //         皿が山を突き抜ける。1本ずつ真下の皿の高さを引く
            const fY = floorY(cx, cz);
            let cy = fY + sy - depth;

            // 山の面の法線
            let nX = -sl * Math.cos(th), nY = 1, nZ = -sl * Math.sin(th);
            let L = Math.hypot(nX, nY, nZ); nX /= L; nY /= L; nZ /= L;
            // 面内のランダムな向き ＋ 面から少し浮かせる（ふわっと立たせる）
            const a = rng.range(0, Math.PI * 2);
            let t1x = -Math.sin(th), t1y = 0, t1z = Math.cos(th);
            const t2x = nY * t1z - nZ * t1y, t2y = nZ * t1x - nX * t1z, t2z = nX * t1y - nY * t1x;
            const lift = rng.range(-0.30, 0.45) * (1 - layer * 0.3);
            let dx = Math.cos(a) * t1x + Math.sin(a) * t2x + nX * lift;
            let dy = Math.cos(a) * t1y + Math.sin(a) * t2y + nY * lift;
            let dz = Math.cos(a) * t1z + Math.sin(a) * t2z + nZ * lift;

            // 外周では長い千切りが宙に飛び出すので短くする
            const edge = smooth(0.55, 1.0, rr / R);
            const len = rng.range(2.3, 5.4) * (1 - 0.42 * edge);
            const rib = rng.next() < 0.12;               // 芯に近い太い部分
            const hw = (rib ? rng.range(0.11, 0.17) : rng.range(0.048, 0.105));
            const ht = rng.range(0.014, 0.024) * (rib ? 1.7 : 1);
            const g0 = rib ? rng.range(0, 0.12) : Math.pow(rng.next(), 1.9);
            const gr = rng.range(-0.35, 0.55);
            const curl = rib ? rng.range(0.02, 0.10) : rng.range(0.05, 0.30);

            // 【対策】山の外周では sy がほぼ 0 なので、層の潜り込み depth と
            //   千切りの傾きぶんだけ皿の下へ突き抜ける（皿の厚みは 4mm しかない）。
            //   1本ごとに、両端のうち低い方が皿の見込みより下がらないよう持ち上げる
            const lowY = cy - Math.abs(dy) * len * 0.5 - ht - hw * 0.40;
            if (lowY < fY + 0.020) cy += (fY + 0.020) - lowY;

            emitShred(acc, cfg, rng, { x: cx, y: cy, z: cz },
                { x: dx, y: dy, z: dz }, { x: nX, y: nY, z: nZ },
                len, hw, ht, g0, gr, curl);
        }

        const n = acc.count;
        const positions = new Float32Array(n * 3);
        const refN = new Float32Array(n * 3);
        const colors = new Float32Array(n * 4);
        const uvs = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) {
            positions[i * 3] = acc.px[i]; positions[i * 3 + 1] = acc.py[i]; positions[i * 3 + 2] = acc.pz[i];
            refN[i * 3] = acc.rx[i]; refN[i * 3 + 1] = acc.ry[i]; refN[i * 3 + 2] = acc.rz[i];
            colors[i * 4] = acc.cr[i]; colors[i * 4 + 1] = acc.cg[i];
            colors[i * 4 + 2] = acc.cb[i]; colors[i * 4 + 3] = 1;
            uvs[i * 2] = acc.u[i]; uvs[i * 2 + 1] = acc.v[i];
        }
        // 【対策】千切りは 1 本ずつ向きが違うので、重心を基準にした巻き順判定が
        //         使えない。掃引フレームから解析的に出した参照法線と突き合わせる
        const normals = finalize(positions, acc.idx, null, refN);
        const mesh = new BABYLON.Mesh("cabbage", scene);
        applyVD(mesh, positions, acc.idx, normals, uvs, colors);
        mesh.material = mats.cabbage;
        mesh.receiveShadows = true;

        // 山の芯。隙間から皿が透けるのを防ぐ
        // 【対策】千切りだけで埋めようとすると本数が 3 倍要る。
        //         一段沈めた暗い塊を入れておけば、隙間は「影」として読める。
        //         回転体ではなく格子ドームにして、底を皿の断面に沿わせる
        const NR = 18, NT = 48, bodyR = R * 0.93, bodyH = H * 0.87;
        const bp = [];
        for (let i = 0; i <= NR + 1; i++) {
            const skirt = (i === NR + 1);
            const t = Math.min(1, i / NR);
            const rr2 = Math.max(0.004, bodyR * t);
            for (let j = 0; j <= NT; j++) {
                const a2 = j / NT * Math.PI * 2;
                const x = cfg.moundX + rr2 * Math.cos(a2);
                const z = cfg.moundZ + rr2 * Math.sin(a2);
                const wob = 1 + 0.06 * (Noise.fbm3(Math.cos(a2) * 2.1, t * 2.4, Math.sin(a2) * 2.1, 5511, 2) - 0.5) * 2;
                const y = floorY(x, z) + (skirt ? -0.35 : bodyH * wob * Math.pow(Math.max(0, 1 - t * t), 0.72));
                bp.push(new V3(x, y, z));
            }
        }
        const body = gridMesh("cabbageBody", bp, null, NR + 1, NT,
            new V3(cfg.moundX, floorY(cfg.moundX, cfg.moundZ), cfg.moundZ), scene);
        body.material = mats.cabbageBody;
        body.receiveShadows = true;

        return { mesh, body, domeY };
    }

    // =================================================================
    // 8. Tableware
    // =================================================================
    // 皿の内側プロファイル（盛り付けの接地計算にも使う）
    // 【対策】カツ 14cm ＋ キャベツの山という盛り付けは、皿の見込みが
    //         すり鉢だと四隅が皿にめり込む。見込みを r=9cm まで平らに寝かせ、
    //         そこから外を立ち上げる（実際の「とんかつ皿」もこの断面）
    // 【対策】カツを大きくすると四隅が皿の立ち上がりに乗ってしまう。
    //   参考写真のとんかつ皿はもっと浅く、見込みが r=11cm 過ぎまで平ら
    // 【対策】皿を大きくするとカツが相対的に小さく見える。参考写真の
    //   とんかつ皿は 25cm 前後で、見込みが縁の直前まで平らな「クープ」型。
    //   見込みが立ち上がっていると、大きなカツの四隅がそこに乗り、
    //   接地の基準（最もめり込む点）が持ち上がって中央が浮く
    const PLATE_INNER = [
        [0.004, 0.52], [5.00, 0.51], [8.50, 0.53], [10.50, 0.58],
        [11.40, 0.70], [12.00, 1.05], [12.45, 1.65]
    ];

    function plateInnerY(r) {
        const P = PLATE_INNER;
        if (r <= P[0][0]) return P[0][1];
        for (let i = 1; i < P.length; i++) {
            if (r <= P[i][0]) {
                const t = (r - P[i - 1][0]) / (P[i][0] - P[i - 1][0]);
                return mix(P[i - 1][1], P[i][1], t);
            }
        }
        return P[P.length - 1][1];
    }

    function buildPlate(scene, cfg, mats) {
        const prof = [];
        for (const p of PLATE_INNER) prof.push({ r: p[0], y: p[1] });
        prof.push({ r: cfg.plateOuterR, y: 1.95 });       // 縁の上
        prof.push({ r: cfg.plateOuterR, y: 1.74 });       // 縁の外側
        const outer = [[12.40, 1.42], [11.90, 1.02], [10.80, 0.68], [9.00, 0.42],
        [7.00, 0.26], [5.40, 0.17], [4.40, 0.14]];
        for (const p of outer) prof.push({ r: p[0], y: p[1] });
        prof.push({ r: 4.55, y: 0.0 });                    // 高台
        prof.push({ r: 4.05, y: 0.0 });
        prof.push({ r: 3.90, y: 0.26 });
        prof.push({ r: 2.10, y: 0.30 });
        prof.push({ r: 0.004, y: 0.32 });

        // 黒い釉薬。縁は釉が薄くなって素地の色がうっすら出る
        const GLAZE = [0.250, 0.242, 0.246];   // sRGB。リニアでは約 0.05
        const EDGE = [0.455, 0.425, 0.395];
        const mesh = revolve("plate", prof, cfg.plateSeg, scene, {
            uScale: 7, vScale: 2.6, wobble: 0.004,
            colorFn: (i, ang) => {
                const rim = smooth(9.4, 11.2, i) * (1 - smooth(12.2, 12.7, i));
                const m = Noise.fbm3(Math.cos(ang) * 2.2, Math.sin(ang) * 2.2, i * 0.35, 5150, 3);
                const k = rim * (0.38 + 0.62 * m);
                const g = 0.87 + 0.30 * m;
                return [srgb(mix(GLAZE[0], EDGE[0], k) * g),
                srgb(mix(GLAZE[1], EDGE[1], k) * g),
                srgb(mix(GLAZE[2], EDGE[2], k) * g)];
            }
        });
        mesh.material = mats.plate;
        mesh.receiveShadows = true;
        return mesh;
    }

    function buildTable(scene, cfg, mats) {
        if (!cfg.showTable) return null;
        const g = BABYLON.MeshBuilder.CreateGround("table", { width: 190, height: 190, subdivisions: 2 }, scene);
        g.material = mats.wood;
        g.receiveShadows = true;
        g.position.y = -0.002;
        return g;
    }

    // ---- からし ------------------------------------------------------
    function buildKarashi(scene, cfg, seed, mats) {
        const rng = new Rng(seed);
        const ns = rng.int(90000);
        const R = cfg.karashiR;
        const mesh = blobMesh("karashi", 22, (x, y, z) => {
            // 練りからしは絞り出したまま。上に小さな角が立ち、底は平ら
            let r = R * (1 + 0.20 * (Noise.fbm3(x * 2.6, y * 2.6, z * 2.6, ns, 3) - 0.5) * 2);
            r *= 1 - 0.34 * smooth(-0.25, -1.0, y);        // 底を潰す
            r *= 1 + 0.16 * smooth(0.55, 1.0, y);          // てっぺんを尖らせる
            return r;
        }, null, scene);
        mesh.material = mats.karashi;
        mesh.receiveShadows = true;
        mesh.scaling.set(1.0, 0.62, 1.0);
        const rr = Math.hypot(cfg.karashiX, cfg.karashiZ);
        mesh.position.set(cfg.karashiX, plateInnerY(rr) + R * 0.62 * 0.80, cfg.karashiZ);
        return mesh;
    }

    // =================================================================
    // 7. Sauce : 高さ場 → 円錐膨張 → リボン掃引
    // =================================================================
    // 【対策】カツの表面をそのままなぞらせると、切れ目の谷でソースが千切れて
    //         「黒い破線」になる。実物のソースは粘性で溝を渡る。
    //         頂点を格子へ落として高さ場を作り、円錐で膨張（morphological
    //         dilation）させると、渡れる幅の溝だけが塞がれる
    class HeightField {
        constructor(minX, maxX, minZ, maxZ, cell) {
            this.x0 = minX; this.z0 = minZ; this.cell = cell;
            this.nx = Math.max(2, Math.ceil((maxX - minX) / cell) + 1);
            this.nz = Math.max(2, Math.ceil((maxZ - minZ) / cell) + 1);
            this.h = new Float32Array(this.nx * this.nz).fill(-1e9);
            this.hd = null;
        }
        splat(mesh) {
            mesh.computeWorldMatrix(true);
            const pos = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            if (!pos) return;
            const wm = mesh.getWorldMatrix();
            const v = new V3(), w = new V3();
            for (let i = 0; i < pos.length; i += 3) {
                v.set(pos[i], pos[i + 1], pos[i + 2]);
                BABYLON.Vector3.TransformCoordinatesToRef(v, wm, w);
                const cx = Math.round((w.x - this.x0) / this.cell);
                const cz = Math.round((w.z - this.z0) / this.cell);
                if (cx < 0 || cz < 0 || cx >= this.nx || cz >= this.nz) continue;
                const k = cz * this.nx + cx;
                if (w.y > this.h[k]) this.h[k] = w.y;
            }
        }
        // 頂点の間隔と格子の間隔が近いと 1 マスだけ空くことがある。埋める
        fill(floorFn) {
            const { nx, nz, h } = this;
            const src = Float32Array.from(h);
            for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
                const k = z * nx + x;
                if (src[k] > -1e8) continue;
                let best = -1e9;
                for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
                    const zz = z + dz, xx = x + dx;
                    if (zz < 0 || xx < 0 || zz >= nz || xx >= nx) continue;
                    const s = src[zz * nx + xx];
                    if (s > best) best = s;
                }
                h[k] = best;
            }
            for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
                const k = z * nx + x;
                if (h[k] < -1e8) h[k] = floorFn(this.x0 + x * this.cell, this.z0 + z * this.cell);
            }
        }
        // 円錐膨張：h_d(p) = max_q ( h(q) - |p-q| * slope )
        dilate(radius, slope) {
            const { nx, nz, h, cell } = this;
            const rad = Math.max(1, Math.round(radius / cell));
            const out = new Float32Array(nx * nz);
            const pen = [];
            for (let dz = -rad; dz <= rad; dz++) {
                const row = [];
                for (let dx = -rad; dx <= rad; dx++) {
                    const d = Math.hypot(dx, dz) * cell;
                    row.push(d <= radius ? d * slope : Infinity);
                }
                pen.push(row);
            }
            for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
                let best = -1e9;
                for (let dz = -rad; dz <= rad; dz++) {
                    const zz = z + dz; if (zz < 0 || zz >= nz) continue;
                    const prow = pen[dz + rad], base = zz * nx;
                    for (let dx = -rad; dx <= rad; dx++) {
                        const p = prow[dx + rad]; if (!isFinite(p)) continue;
                        const xx = x + dx; if (xx < 0 || xx >= nx) continue;
                        const s = h[base + xx] - p;
                        if (s > best) best = s;
                    }
                }
                out[z * nx + x] = best;
            }
            this.hd = out;
        }
        _sample(arr, x, z) {
            const fx = clamp((x - this.x0) / this.cell, 0, this.nx - 1.001);
            const fz = clamp((z - this.z0) / this.cell, 0, this.nz - 1.001);
            const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
            const a = arr[iz * this.nx + ix], b = arr[iz * this.nx + ix + 1];
            const c = arr[(iz + 1) * this.nx + ix], d = arr[(iz + 1) * this.nx + ix + 1];
            return mix(mix(a, b, tx), mix(c, d, tx), tz);
        }
        actual(x, z) { return this._sample(this.h, x, z); }
        top(x, z) { return this._sample(this.hd || this.h, x, z); }
    }

    function buildSauce(scene, cfg, seed, mats, hf, fan) {
        const rng = new Rng(seed);
        const ns = rng.int(90000);
        const NS = 96, Q = 22, MQ = Q * 2;
        // 【対策】ソースの両端を設定値の送りから計算すると、物理で崩れて
        //   詰まった実際の扇からずれる。盛り付け後の実測値を受け取る
        const uA = fan.uA + rng.range(0.7, 1.4);
        const uB = fan.uB - rng.range(0.4, 1.1);
        const w0 = rng.range(-0.3, 0.5);
        const cs = Math.cos(fan.psi), sn = Math.sin(fan.psi);

        const pathW = (s) => w0 + 0.95 * (Noise.fbm3(s * 3.4 + 1.7, 5.5, 2.2, ns, 3) - 0.5) * 2
            + 0.35 * Math.sin(s * 11.0 + 1.1);
        const halfW = (s) => cfg.sauceHalfW * (0.70 + 0.62 * Noise.fbm3(s * 5.5 + 7.3, 2.2, 9.1, ns + 31, 2))
            * Math.pow(Math.max(0, Math.sin(Math.PI * s)), 0.30);
        const taperT = (s) => Math.pow(Math.max(0, Math.sin(Math.PI * s)), 0.45);

        const W1 = MQ + 1, total = (NS + 1) * W1;
        const pts = new Array(total), uvs = new Array(total);
        for (let r = 0; r <= NS; r++) {
            const s = r / NS;
            const u = mix(uA, uB, s), w = pathW(s), tt = taperT(s);
            // 溜まりでは幅が広がる。中心の真下の落ち込み量で見る
            const cxs = cfg.katsuX + u * cs + w * sn, czs = cfg.katsuZ - u * sn + w * cs;
            const dip = Math.min(cfg.sauceSink, Math.max(0, hf.top(cxs, czs) - hf.actual(cxs, czs)));
            const hw = halfW(s) * (1 + 0.85 * dip / cfg.sauceSink);
            for (let j = 0; j <= MQ; j++) {
                const isTop = j <= Q;
                const q = isTop ? (-1 + 2 * j / Q) : (1 - 2 * (j - Q) / Q);
                const wq = w + q * hw;
                const x = cfg.katsuX + u * cs + wq * sn;
                const z = cfg.katsuZ - u * sn + wq * cs;
                const hdv = hf.top(x, z), hav = hf.actual(x, z);
                // 【対策】円錐膨張した面の上をそのままなぞらせると、溝の上を
                //   完全に橋渡しして「宙を渡る棒」になる。粘度の低い液体は
                //   溝で少し落ち込み、そこで幅が広がって溜まる。
                //   落ち込みは sauceSink で頭打ちにして、途切れは防ぐ
                const sink = Math.min(cfg.sauceSink, Math.max(0, hdv - hav));
                const edge = hdv - sink * 0.75 + 0.026;
                // 【対策】断面を半円 (1-q^2)^0.5 にすると、幅を広げても
                //   中央だけ盛り上がったカマボコ型のままになる。
                //   薄い液膜の断面は「平らな天面＋縁で急に落ちるメニスカス」
                const prof = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(q), 5)), 0.40);
                const th = cfg.sauceThick * prof * tt * (1 + 1.5 * sink / cfg.sauceSink);
                const topY = edge + th;
                let y;
                if (Math.abs(q) > 0.9999 || th < 1e-6) {
                    y = topY;
                } else if (isTop) {
                    y = topY;
                } else {
                    const raw = clamp(hav + 0.018, topY - cfg.sauceSag, topY - 0.004);
                    const sag = smooth(0.98, 0.80, Math.abs(q));
                    y = topY - (topY - raw) * sag;
                }
                const k = r * W1 + j;
                pts[k] = new V3(x, y, z);
                uvs[k] = [s * 3.0, (isTop ? 0.5 + 0.5 * q : 1.5 + 0.5 * q) * 0.5];
            }
        }
        // 断面のリングは「上面を左→右、下面を右→左」。閉じた筒になっている
        const midU = mix(uA, uB, 0.5);
        const center = new V3(cfg.katsuX + midU * cs + w0 * sn,
            hf.top(cfg.katsuX + midU * cs, cfg.katsuZ - midU * sn) + cfg.sauceThick * 0.5 + 0.02,
            cfg.katsuZ - midU * sn + w0 * cs);
        const mesh = gridMesh("sauce", pts, null, NS, MQ, center, scene, (a, b, k) => uvs[k]);
        mesh.material = mats.sauce;
        mesh.receiveShadows = true;
        return mesh;
    }

    // =================================================================
    // 9. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.86, 0.845, 0.83, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    // 【対策】反射をぼかしすぎると、ハイライトのコントラストが消えて
    //         「艶消しの何か」になる。揚げ油の照りは環境の明暗が映り込んで初めて出る
    env.lodGenerationOffset = 0.18;
    scene.environmentIntensity = 1.00;

    // 【対策】扇の軸をほぼ正面から見る方位（当初 -2.62）だと、
    //         衣の上面の法線とカメラ方向の内積がほぼ 0 になり、
    //         いちばん見せたい面が真横（＝厚み 0）に潰れる。
    //         参考写真と同じく、扇の軸が画面の左右に走る方位から見る
    const camera = new BABYLON.ArcRotateCamera("cam", -1.80, 0.84, 42, new V3(0, 1.8, 0), scene);
    camera.attachControl(true);
    camera.fov = 0.56;                     // 料理写真らしく、やや望遠
    camera.wheelPrecision = 6;
    camera.minZ = 0.1;
    // 【対策】被写界深度は深度テクスチャの値を [minZ, maxZ] で復元して使う。
    //         既定の maxZ = 10000 のままだと、50cm 前後にある被写体の深度が
    //         0.005 付近に潰れて量子化され、錯乱円がほぼ 0 になる（＝ボケない）
    camera.maxZ = 450;
    camera.lowerRadiusLimit = 18;
    camera.upperRadiusLimit = 190;
    camera.lowerBetaLimit = 0.05;
    camera.upperBetaLimit = 1.50;
    scene.cameraToUseForPointers = camera;

    // 【対策】キーライトを手前（カメラ側）に置くと、パン粉の凹凸が
    //         自分の影で潰れて「茶色い板」になる。奥やや右上から当てて、
    //         破片の一枚一枚に影の足を作る。キャベツの透過も逆光でしか出ない
    const key = new BABYLON.DirectionalLight("key", new V3(-0.26, -1.0, -0.62).normalize(), scene);
    key.position = new V3(13, 47, 33);
    key.intensity = 3.1;
    key.diffuse = new BABYLON.Color3(1.0, 0.985, 0.950);
    key.specular = new BABYLON.Color3(0.95, 0.92, 0.87);
    key.autoCalcShadowZBounds = true;
    key.shadowMinZ = 1;
    key.shadowMaxZ = 90;

    const fillL = new BABYLON.DirectionalLight("fillL", new V3(0.22, -0.46, 0.86).normalize(), scene);
    fillL.intensity = 0.80;
    fillL.diffuse = new BABYLON.Color3(1.0, 0.955, 0.915);
    fillL.specular = new BABYLON.Color3(0.16, 0.15, 0.14);

    // 【対策】平行光源のハイライトは1点しか出ない。料理写真のような
    //         「濡れた面にいくつも走る照り」を作るには、拡散をほぼ切って
    //         鏡面だけを足す光源をもう1灯まわす
    const kick = new BABYLON.DirectionalLight("kick", new V3(0.88, -0.66, 0.38).normalize(), scene);
    kick.intensity = 1.6;
    kick.diffuse = new BABYLON.Color3(0.05, 0.05, 0.05);
    kick.specular = new BABYLON.Color3(1.0, 0.94, 0.86);

    const amb = new BABYLON.HemisphericLight("amb", new V3(0, 1, 0), scene);
    amb.intensity = 0.22;
    amb.diffuse = new BABYLON.Color3(1, 0.98, 0.96);
    amb.groundColor = new BABYLON.Color3(0.36, 0.34, 0.32);
    amb.specular = new BABYLON.Color3(0, 0, 0);

    // 【対策】指数シャドウマップ（ESM）＋大きなブラーは、料理のような
    //   「接地している小さな物」に向かない。深度を指数で近似するため
    //   影が物から剥がれて滲み、皿の丸みでは自己遮蔽が漏れて
    //   広いもやが乗る。深度を直接比較する PCF に変える。
    //   ライトがほぼ真下向き（-0.26,-1,-0.62）なので、bias は小さくてよい
    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.0035;
    // 【対策】法線方向のオフセットを入れないと、パン粉の斜面が
    //   自分の影で縞になる（シャドウアクネ）。凹凸 1.5mm に対して 0.1mm 程度
    sg.normalBias = 0.010;
    sg.darkness = 0.30;
    // 影の描画範囲を被写体に絞る。既定のままだとテーブル（160cm 角）まで
    // 含めて深度範囲が広がり、2048 の分解能が食われる
    sg.frustumEdgeFalloff = 0.15;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.20;
    ip.contrast = 1.20;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.2;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    const mats = new Materials(scene, CFG);
    const tableMesh = buildTable(scene, CFG, mats);
    const plateMesh = buildPlate(scene, CFG, mats);

    const floorY = (x, z) => plateInnerY(Math.hypot(x, z));

    // ---- Havok の初期化 ---------------------------------------------
    // 【対策】Playground では createScene を async にできるので await が使える。
    //   失敗しても空の皿にならないよう、解析解での配置にフォールバックする
    let physicsOn = false;
    if (CFG.usePhysics) {
        try {
            const havok = await HavokPhysics();
            // 【対策】HavokPlugin の第1引数は _useDeltaForWorldStep。true（既定）だと
            //   フレームのデルタ時間でそのまま積分するため、フレーム落ちのたびに
            //   ステップ幅が変わり、接触が解けたり深く食い込んだりして震える
            const hk = new BABYLON.HavokPlugin(false, havok);
            scene.enablePhysics(new V3(0, -CFG.gravity, 0), hk);
            if (hk.setTimeStep) hk.setTimeStep(1 / CFG.physicsHz);
            // 皿は実形状で。すり鉢のふちが効かないと、倒れた列が滑って落ちる
            const pShape = new BABYLON.PhysicsShapeMesh(plateMesh, scene);
            pShape.material = { friction: CFG.friction, restitution: CFG.restitution };
            const pBody = new BABYLON.PhysicsBody(plateMesh, BABYLON.PhysicsMotionType.STATIC, false, scene);
            pBody.shape = pShape;
            // 【対策】テーブルは板ポリではなく厚みのある箱にする。
            //   薄いコライダーは速い剛体にすり抜けられる
            if (tableMesh) {
                const tShape = new BABYLON.PhysicsShapeBox(
                    new V3(0, -3, 0), BABYLON.Quaternion.Identity(), new V3(240, 6, 240), scene);
                tShape.material = { friction: 0.9, restitution: 0.0 };
                const tBody = new BABYLON.PhysicsBody(tableMesh, BABYLON.PhysicsMotionType.STATIC, false, scene);
                tBody.shape = tShape;
            }
            physicsOn = true;
        } catch (e) {
            console.warn("[Tonkatsu] Havok を初期化できませんでした。解析解で配置します", e);
        }
    }

    // =================================================================
    //  盛り付け
    //
    //  扇の姿勢には自由度がひとつしかない
    //  -----------------------------------------------------------------
    //  厚み h の板を n 枚、送り p で並べて傾き a で倒す。このとき
    //  「どの板も底の稜線が皿に着いていて、かつ隣と面で寄りかかっている」
    //  という条件は、板の法線 n 方向の間隔がちょうど厚みに等しいこと：
    //
    //        Δ・n = p * sin(a) = h        →        a = asin(h / p)
    //
    //  つまり傾きは送りから一意に決まる。両方を定数で持つと必ず矛盾し、
    //  宙に浮くか互いにめり込む（前のビルドが浮いていたのはこれ）。
    //  人間が決めたいのは「皿の上でどれだけ広げるか」だけなので、
    //  扇の全長 fanRowLen を与えて p と a を同時に解く。
    //
    //  そのうえで実際の配置は Havok に任せる
    //  -----------------------------------------------------------------
    //  上の式は「全部が同じ角度で釣り合う」理想解でしかない。実際は
    //  先頭の1枚だけ前に支えがないので寝て、その反動で列全体が少し詰まる。
    //  この「先頭が寝て、後ろほど立つ」不揃いこそが写真のとんかつなので、
    //  理想解を初期姿勢として与えたうえで、あとはソルバに崩させる。
    //  【対策】面と面の接触マニフォールドは毎ステップ飛び移って震え続ける。
    //          そこで物理は「配置を解くためだけ」に回し、静止したら
    //          STATIC に固定して以後シミュレーションを止める（焼き付け）
    // =================================================================
    let katsuMeshes = [], sliceRoots = [], capMeshes = [];
    let cabbage = null, karashiMesh = null, sauceMesh = null;
    // 【対策】物理での盛り付けは非同期に確定するので、createScene が返る時点では
    //   まだ計測値が入っていない。undefined を .toFixed() して落ちないよう初期化する
    let stats = { verts: 0, ms: 0, top: 0 };
    let onRebuilt = null;
    let queue = [], settleTimer = 0, simTimer = 0, frozen = true, buildSeed = 0;
    let plateSeed = 0;                 // 形はそのままで盛り付けだけ振り直す

    function physMaterial() { return { friction: CFG.friction, restitution: CFG.restitution }; }
    // 当たり判定の箱の大きさ（バウンディングボックスの半径に対する倍率）。
    // 姿勢を解くときと形状を作るときで必ず同じ値を使う
    const PHYS_BOX = { x: 1.97, y: 1.86, z: 1.97 };

    function disposeAll() {
        for (const it of queue) {
            if (it.body) it.body.dispose();
            if (it.shape) it.shape.dispose();
        }
        queue = []; settleTimer = 0; simTimer = 0; frozen = true;
        const sm0 = sg.getShadowMap();
        if (sm0 && sm0.renderList) sm0.renderList.length = 0;
        for (const m of katsuMeshes) m.dispose();
        katsuMeshes = []; sliceRoots = []; capMeshes = [];
        if (cabbage) { cabbage.mesh.dispose(); cabbage.body.dispose(); cabbage = null; }
        if (karashiMesh) { karashiMesh.dispose(); karashiMesh = null; }
        if (sauceMesh) { sauceMesh.dispose(); sauceMesh = null; }
    }

    function build(seed) {
        disposeAll();
        const t0 = performance.now();
        const cutlet = new Cutlet(CFG, seed);
        const n = CFG.sliceCount;
        const rng = new Rng((seed ^ 0x9e3779b9 ^ plateSeed) >>> 0);

        const psi = CFG.fanYawDeg * Math.PI / 180;
        const cs = Math.cos(psi), sn = Math.sin(psi);
        const thick = 2 * CFG.cutletHalfT;
        const tCut = CFG.cutletLength / n;

        // 板の局所軸を n（面の法線）, e（面内・切る向き）とすると、
        // 「底が皿に着いたまま隣と面で寄りかかる」条件は
        //     Δ・n = p sin a = thick
        // で、このとき隣との重なりは
        //     Δ・e = p cos a = thick / tan a
        // 重なりを (1-overlap)*tCut に等しいと置くと傾きが決まる：
        //     tan a = thick / ((1 - overlap) * tCut)
        // 【対策】以前は全長を指定して p を決めていたが、p が大きすぎると
        //   Δ・e が tCut を超え、寄りかかるどころか離れて並ぶ。
        //   重なりから解けば、離れることが原理的に起きない
        const lean = CFG.spawnLeanDeg * Math.PI / 180;

        // ---- キャベツ・からし（物理より先に。皿の上の障害物になる）
        cabbage = buildCabbage(scene, CFG, (seed + 7717) >>> 0, mats, floorY);
        cabbage.mesh.setEnabled(CFG.showCabbage);
        cabbage.body.setEnabled(CFG.showCabbage);
        karashiMesh = buildKarashi(scene, CFG, (seed + 331) >>> 0, mats);
        karashiMesh.setEnabled(CFG.showKarashi);

        // 先にメッシュだけ作る。姿勢は当たり判定の実寸を測ってから決める
        const built = [];
        for (let i = 0; i < n; i++) built.push(buildSlice(cutlet, CFG, i, n, scene, mats));

        // 【対策】姿勢を「肉の厚み 2.04cm」で解いていたが、当たり判定の箱は
        //   衣の凹凸まで含んだバウンディングボックスなので、実際は 2.19cm ある。
        //   設計どおりに置いた瞬間から 1.5mm めり込んでいる状態になり、
        //   ソルバがそれを押し戻すために列全体を起こしてしまっていた。
        //   （5切れで傾き 41.6 度の設計が、実際には 54 度まで立っていた）
        //   姿勢は「物理が見ている厚み」で解く
        let tSum = 0;
        for (const ms of built) {
            ms[0].computeWorldMatrix(true);
            tSum += ms[0].getBoundingInfo().boundingBox.extendSize.y * PHYS_BOX.y;
        }
        const thickPhys = tSum / built.length;

        const de = Math.max(0.15, (1 - CFG.fanOverlap) * tCut);
        const alpha = Math.atan2(thickPhys, de);
        const pitch = thickPhys / Math.max(0.2, Math.sin(alpha));

        for (let i = 0; i < n; i++) {
            const meshes = built[i];
            // 【対策】1切れは 本体（衣）と切断面キャップの複数メッシュでできている。
            //   剛体はひとつなので、本体を親にしてキャップをぶら下げ、
            //   物理ボディは親メッシュにだけ付ける。物理が動かすのは親、
            //   描画は子…と二重に変換が掛かる事故をこれで避ける
            const root = meshes[0];
            for (let k = 1; k < meshes.length; k++) {
                meshes[k].parent = root;
                meshes[k].position.set(0, 0, 0);
                meshes[k].rotationQuaternion = BABYLON.Quaternion.Identity();
                meshes[k].setEnabled(CFG.showCut);
                capMeshes.push(meshes[k]);
            }
            const fx = (i - (n - 1) * 0.5) * pitch + rng.gauss(0, 0.055);
            const fw = rng.gauss(0, 0.11);              // 幅方向のずれ
            // 【対策】物理で動かすメッシュは rotationQuaternion を使う。
            //   Euler の rotation のままだと Havok 側の姿勢と食い違う
            root.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(
                psi + rng.gauss(0, 0.028),
                rng.gauss(0, 0.020),
                // 立てる分は「これから倒れる」ぶんなので、物理を使うときだけ。
                // 解析解のフォールバックでは設計どおりの角度で置く
                -(alpha + (physicsOn ? lean : 0) + rng.gauss(0, 0.060)));
            root.position.set(CFG.katsuX + fx * cs + fw * sn, 0,
                CFG.katsuZ - fx * sn + fw * cs);
            sliceRoots.push(root);
            for (const m of meshes) katsuMeshes.push(m);
        }

        groundSlices(CFG.dropClearance);

        if (physicsOn) {
            for (const root of sliceRoots) {
                const bb = root.getBoundingInfo().boundingBox;   // ローカル
                const c = bb.center, e = bb.extendSize;
                // 【対策】衣の凹凸まで含んだ凸包を作ると、面接触が
                //   「破片の先どうし」の点接触に化けて必ず滑り落ちる。
                //   衝突形状は箱でよい。厚み方向だけ少し痩せさせて、
                //   衣どうしが数mm食い込んだところで釣り合わせる
                // 【対策】当たり判定を痩せさせて衣どうしを噛み合わせると、
                //   隣の切断面（平らな一枚板）の縁が衣を突き抜け、
                //   断面の薄い楔の側に棘として顔を出す。裏面カリングを
                //   切った今はそれが外からも見えてしまうので、
                //   食い込みは、衣の凹凸（片側 1.5mm）が噛み合うぶんだけ許す。
                //   まったく許さないと、凸どうしが突っ張って隣との間に
                //   3mm の隙間が残る。切断面は capRecess で 1mm 奥にあるので、
                //   この程度の食い込みでは突き抜けない
                // 【注】PhysicsShapeBox の第3引数は「全長」。extendSize は
                //   半径なので、1.97 倍は AABB の 98.5%、y の 1.86 倍は 93% に相当する。
                //   Inspector の Physics Helper にはこの箱がそのまま出る
                const shape = new BABYLON.PhysicsShapeBox(
                    c.clone(), BABYLON.Quaternion.Identity(),
                    new V3(e.x * PHYS_BOX.x, e.y * PHYS_BOX.y, e.z * PHYS_BOX.z), scene);
                shape.material = physMaterial();
                const body = new BABYLON.PhysicsBody(root, BABYLON.PhysicsMotionType.DYNAMIC, false, scene);
                body.shape = shape;
                body.setMassProperties({ mass: 1.0 });
                // 【対策】damping は PhysicsBody のメソッドでしか効かない。
                //   角速度を強く減衰させないと、板が底の稜線で延々と揺れ続ける
                body.setLinearDamping(CFG.linearDamping);
                body.setAngularDamping(CFG.angularDamping);
                // 動的ボディで preStep を残すと、物理の結果を読み直して押し込む
                body.disablePreStep = true;
                queue.push({ root, body, shape });
            }
            // 落ちているあいだも影は出しておく（落下がわかる）
            const sm0 = sg.getShadowMap();
            if (sm0 && sm0.renderList) sm0.renderList.length = 0;
            for (const m of katsuMeshes) sg.addShadowCaster(m, true);
            if (cabbage) { sg.addShadowCaster(cabbage.mesh, true); sg.addShadowCaster(cabbage.body, true); }
            if (karashiMesh) sg.addShadowCaster(karashiMesh, true);
            sg.addShadowCaster(plateMesh, true);
            stats.verts = 0;
            for (const m of katsuMeshes) stats.verts += m.getTotalVertices();
            if (cabbage) stats.verts += cabbage.mesh.getTotalVertices();
            frozen = false; settleTimer = 0; simTimer = 0;
            buildSeed = seed;
            if (onRebuilt) onRebuilt();
        } else {
            groundSlices(0.015);
            platingDone(seed, { psi });
        }
        stats.ms = Math.round(performance.now() - t0);
    }

    // 【対策】バウンディングボックスの最下点だけを見て持ち上げると、
    //   皿の見込みが外に向かって上がっている以上、扇の四隅が皿にめり込む。
    //   さらに回転したメッシュの AABB は実体より一回り大きく膨らむので、
    //   その分だけ宙に浮く。全頂点をワールドに落として
    //   「皿の高さ − 頂点の高さ」の最大値ぶん持ち上げる
    function groundSlices(clearance) {
        let dy = -1e9;
        const tmp = new V3();
        for (const m of katsuMeshes) {
            m.computeWorldMatrix(true);
            const wm = m.getWorldMatrix();
            const pos = m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            for (let k = 0; k < pos.length; k += 3) {
                V3.TransformCoordinatesFromFloatsToRef(pos[k], pos[k + 1], pos[k + 2], wm, tmp);
                const need = floorY(tmp.x, tmp.z) - tmp.y;
                if (need > dy) dy = need;
            }
        }
        dy += clearance;
        for (const root of sliceRoots) { root.position.y += dy; root.computeWorldMatrix(true); }
        for (const m of katsuMeshes) m.computeWorldMatrix(true);
    }

    // 盛り付け確定後：カツの高さ場からソースを作り、影を張り直す
    function platingDone(seed, fan) {
        if (sauceMesh) { sauceMesh.dispose(); sauceMesh = null; }
        let bMinX = 1e9, bMaxX = -1e9, bMinZ = 1e9, bMaxZ = -1e9;
        for (const m of katsuMeshes) {
            m.computeWorldMatrix(true);
            const bb = m.getBoundingInfo().boundingBox;
            bMinX = Math.min(bMinX, bb.minimumWorld.x); bMaxX = Math.max(bMaxX, bb.maximumWorld.x);
            bMinZ = Math.min(bMinZ, bb.minimumWorld.z); bMaxZ = Math.max(bMaxZ, bb.maximumWorld.z);
        }
        const hf = new HeightField(bMinX - 1.2, bMaxX + 1.2, bMinZ - 1.2, bMaxZ + 1.2, 0.10);
        for (const m of katsuMeshes) hf.splat(m);
        hf.fill(floorY);
        hf.dilate(CFG.sauceBridge, CFG.sauceSlope);
        // 扇の軸方向の実測レンジ。崩れて詰まったぶんもここに反映される
        // 【対策】AABB の隅を射影すると、幅方向のぶんだけ長く出る。
        //   頂点を扇の軸へ落として、本当の端を測る
        const csP = Math.cos(fan.psi), snP = Math.sin(fan.psi);
        let cA = 1e9, cB = -1e9;
        const tmpU = new V3();
        for (const m of katsuMeshes) {
            const wm = m.getWorldMatrix();
            const pos = m.getVerticesData(BABYLON.VertexBuffer.PositionKind);
            for (let k = 0; k < pos.length; k += 3) {
                V3.TransformCoordinatesFromFloatsToRef(pos[k], pos[k + 1], pos[k + 2], wm, tmpU);
                const u = (tmpU.x - CFG.katsuX) * csP - (tmpU.z - CFG.katsuZ) * snP;
                if (u < cA) cA = u;
                if (u > cB) cB = u;
            }
        }
        sauceMesh = buildSauce(scene, CFG, (seed + 4093) >>> 0, mats, hf,
            { psi: fan.psi, uA: Math.min(cA, cB), uB: Math.max(cA, cB) });
        sauceMesh.setEnabled(CFG.showSauce);

        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        for (const m of katsuMeshes) sg.addShadowCaster(m, true);
        if (cabbage) { sg.addShadowCaster(cabbage.mesh, true); sg.addShadowCaster(cabbage.body, true); }
        if (karashiMesh) sg.addShadowCaster(karashiMesh, true);
        sg.addShadowCaster(sauceMesh, true);
        sg.addShadowCaster(plateMesh, true);

        stats.verts = 0;
        for (const m of katsuMeshes) stats.verts += m.getTotalVertices();
        if (cabbage) stats.verts += cabbage.mesh.getTotalVertices();
        stats.verts += sauceMesh.getTotalVertices();
        stats.top = 0;
        for (const m of katsuMeshes) stats.top = Math.max(stats.top, m.getBoundingInfo().boundingBox.maximumWorld.y);
        if (onRebuilt) onRebuilt();
    }

    // ---- 静止判定 → STATIC に焼き付け → ソースを載せる
    scene.onBeforeRenderObservable.add(() => {
        if (frozen || queue.length === 0) return;
        const dt = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
        simTimer += dt;
        let moving = false;
        for (const it of queue) {
            if (it.body.getLinearVelocity().length() > CFG.settleSpeed ||
                it.body.getAngularVelocity().length() > CFG.settleSpin) { moving = true; break; }
        }
        settleTimer = moving ? 0 : settleTimer + dt;
        // 【対策】ソルバの残差で微振動が続き、静止判定が永久に通らないことがある。
        //   一定時間で必ず打ち切る
        if (!CFG.freezeWhenSettled) return;
        if (settleTimer > CFG.settleHold || simTimer > CFG.settleTimeout) {
            for (const it of queue) it.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
            frozen = true;
            platingDone(buildSeed, { psi: CFG.fanYawDeg * Math.PI / 180 });
        }
    });

    build(START_SEED);

    if (CFG.useSSAO) {
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.60;
        ssao.totalStrength = 1.25;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 180;
        ssao.minZAspect = 0.3;
    }

    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.92;
    dp.bloomWeight = 0.13;
    dp.bloomKernel = 48;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.22;
    // 【対策】Babylon の錯乱円は「シーン単位 × 1000 = mm」で計算される。
    //         このシーンは cm 単位なので、カメラ距離 50cm は内部で「50m 先」。
    //         実カメラのつもりで focusDistance を入れると合焦面が外れて全部ぼける。
    //         cocPre = (lensSize / fStop) * fL / (focus - fL) なので、
    //         fL を focus の一定比率にすると focus が約分され、
    //         寄っても引いてもボケ量が変わらない
    dp.depthOfFieldEnabled = CFG.useDOF;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.High;
    dp.depthOfField.lensSize = 50;
    dp.depthOfField.fStop = CFG.dofFStop;
    scene.onBeforeRenderObservable.add(() => {
        if (!dp.depthOfFieldEnabled) return;
        const focus = camera.radius * 1000;
        dp.depthOfField.focusDistance = focus;
        dp.depthOfField.focalLength = focus * CFG.dofRatio;
    });

    // =================================================================
    // 10. GUI
    // =================================================================
    // 【対策】フルスクリーンGUIは既定でシーンと同じカメラで合成されるため、
    //         Bloom / 被写界深度 / シャープンがUIにも乗ってボケる。
    //         GUI専用カメラを layerMask で分離する
    // 【対策】ただし activeCameras を 2 台にすると、Babylon の各機能が
    //   「activeCameras の末尾＝描画の基準カメラ」と見なす所で全部 guiCam を
    //   拾ってしまい、Inspector のデバッグ機能が 3 系統まとめて壊れる。
    //     ・UtilityLayerRenderer → Physics Helper が何も出ない／ギズモがずれる
    //     ・EffectLayer          → 選択ハイライトが全カメラパスで合成される
    //     ・scene.activeCamera   → scene.pick() のレイが guiCam 基準になり、
    //                              Scene Explorer の Picker が当たらない
    //   分離をやめれば直るが UI がボケるので、基準カメラを明示して直す
    const GUI_MASK = 0x20000000;

    function bindDebugCamera(scene, mainCam) {
        // (1) UtilityLayerRenderer（Physics Helper / ギズモ / 選択枠の土台）
        // 【対策】Inspector が内部の WeakMap に抱えていて外から触れないレイヤーも
        //   あるので、インスタンスを追わずプロトタイプごと差し替える。
        //   個別に直すと必ず取りこぼす
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
        // 【対策】layerMask では止まらない。camera を束縛するしかないが、
        //   Inspector は選択のたびに後から足してくるので、未束縛のものだけを
        //   毎フレーム拾う（通常 0〜1 枚なので費用はほぼ 0）
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

        // (3) scene.activeCamera
        // 【対策】描き終えた時点では guiCam が入ったままになる。Picker が呼ぶ
        //   scene.pick() は camera 引数なしなので、ここを毎フレーム戻す。
        //   cameraToUseForPointers は InputManager が通る経路にしか効かない
        scene.onAfterRenderObservable.add(() => {
            if (scene.activeCamera !== mainCam) scene.activeCamera = mainCam;
        });
    }

    let guiCam = null;
    if (CFG.guiOwnCamera) {
        guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene);
        guiCam.layerMask = GUI_MASK;
        scene.activeCameras = [camera, guiCam];
        bindDebugCamera(scene, camera);
    } else {
        // 分離しない：Inspector は素のまま正しく動くが、UI に Bloom / DOF が乗る
        scene.activeCameras = [camera];
    }
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (ui.layer && CFG.guiOwnCamera) ui.layer.layerMask = GUI_MASK;

    const COL = {
        idle: "#2b2521", active: "#a1621f", edge: "#4a3f36",
        text: "#f6efe6", sub: "#bda893", accent: "#e8b573"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "236px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(20,15,11,0.82)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "62px";
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
        b.height = "34px"; b.paddingBottom = "6px";
        b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 14;
        b.onPointerUpObservable.add(onClick);
        panel.addControl(b);
        return b;
    }

    addLabel("TONKATSU", 11, COL.sub, "18px");
    addLabel("切れ数", 13, COL.accent, "22px");

    let curSeed = START_SEED;
    const countButtons = {};
    function highlight() {
        for (const k in countButtons) countButtons[k].background = (+k === CFG.sliceCount) ? COL.active : COL.idle;
        const set = (b, on, label) => {
            b.background = on ? COL.active : COL.idle;
            b.textBlock.text = label + ": " + (on ? "ON" : "OFF");
        };
        set(sauceBtn, CFG.showSauce, "ソース");
        set(cabBtn, CFG.showCabbage, "キャベツ");
        set(cutBtn, CFG.showCut, "断面");
        set(shBtn, CFG.showShadow, "影");
        set(wireBtn, CFG.wireframe, "ワイヤー");
        set(karaBtn, CFG.showKarashi, "からし");
        set(dofBtn, CFG.useDOF, "被写界深度");
    }
    for (const c of [5, 6, 7]) {
        countButtons[c] = addButton("c" + c, c + " 切れ", () => {
            CFG.sliceCount = c; build(curSeed); highlight();
        });
    }

    const sp = new BABYLON.GUI.Rectangle();
    sp.height = "8px"; sp.thickness = 0; sp.background = "";
    panel.addControl(sp);

    addButton("replate", "盛り付け直す", () => {
        plateSeed = (plateSeed * 22695477 + 12345) >>> 0;
        build(curSeed); highlight();
    });
    addButton("reseed", "揚げ直す（形を変える）", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(curSeed); highlight();
    });
    const sauceBtn = addButton("sauce", "ソース: ON", () => {
        CFG.showSauce = !CFG.showSauce;
        if (sauceMesh) sauceMesh.setEnabled(CFG.showSauce);
        highlight();
    });
    const cabBtn = addButton("cab", "キャベツ: ON", () => {
        CFG.showCabbage = !CFG.showCabbage;
        if (cabbage) { cabbage.mesh.setEnabled(CFG.showCabbage); cabbage.body.setEnabled(CFG.showCabbage); }
        highlight();
    });
    // 【対策】切り目のような不具合は「どのメッシュの持ち物か」が分からないと
    //   直せない。切断面だけ消せるようにして、切り分けを 1 クリックにする
    const cutBtn = addButton("cut", "断面: ON", () => {
        CFG.showCut = !CFG.showCut;
        for (const m of capMeshes) m.setEnabled(CFG.showCut);
        highlight();
    });
    // 【対策】面が正しいのに線に見える場合、三角形の並びを見ないと判断できない。
    //   ワイヤーフレームなら「穴なのか、細長い三角形の列なのか」が一目で分かる
    const wireBtn = addButton("wire", "ワイヤー: OFF", () => {
        CFG.wireframe = !CFG.wireframe;
        for (const k in mats) {
            const m = mats[k];
            if (m && m.getClassName && m.getClassName().indexOf("Material") >= 0) m.wireframe = CFG.wireframe;
        }
        highlight();
    });
    const shBtn = addButton("shadow", "影: ON", () => {
        CFG.showShadow = !CFG.showShadow;
        key.shadowEnabled = CFG.showShadow;
        highlight();
    });
    const karaBtn = addButton("kara", "からし: ON", () => {
        CFG.showKarashi = !CFG.showKarashi;
        if (karashiMesh) karashiMesh.setEnabled(CFG.showKarashi);
        highlight();
    });
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        CFG.useDOF = !CFG.useDOF;
        dp.depthOfFieldEnabled = CFG.useDOF;
        highlight();
    });
    const rotateBtn = addButton("rotate", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.07;
        rotateBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotateBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });

    const info = addLabel("", 12, COL.sub, "58px");
    onRebuilt = () => {
        if (!info) return;
        const v = (stats.verts || 0) / 1000, top = stats.top || 0;
        info.text = "頂点 " + v.toFixed(1) + "k / 千切り " + CFG.shredCount + "本\n"
            + (frozen ? ("扇の高さ " + top.toFixed(1) + "cm (" + (stats.ms || 0) + "ms)")
                : "盛り付け中…")
            + "\nseed: " + curSeed;
    };

    // ---- 開閉（スマホでは初期状態で畳む）-----------------------------
    // 【対策】Babylon.GUI のサイズ指定はレンダー解像度基準（≒ CSS px × DPR）。
    //         DPR 3 の端末では 34px のボタンが実質 11 CSS px になり、
    //         「邪魔なうえに押しにくい」状態になる
    function viewportCss() {
        const c = engine.getRenderingCanvas();
        return {
            w: (c && c.clientWidth) || window.innerWidth || 1024,
            h: (c && c.clientHeight) || window.innerHeight || 768
        };
    }
    function isCompact() {
        const v = viewportCss();
        return v.w < CFG.compactWidth || Math.min(v.w, v.h) < CFG.compactMinSide;
    }

    const toggleBtn = BABYLON.GUI.Button.CreateSimpleButton("guiToggle", "\u2261");
    toggleBtn.width = "38px"; toggleBtn.height = "38px";
    toggleBtn.cornerRadius = 10; toggleBtn.thickness = 1;
    toggleBtn.color = COL.edge;
    toggleBtn.background = "rgba(20,15,11,0.82)";
    toggleBtn.fontSize = 20;
    if (toggleBtn.textBlock) toggleBtn.textBlock.color = COL.text;
    toggleBtn.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    toggleBtn.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    toggleBtn.left = "16px"; toggleBtn.top = "16px";
    ui.addControl(toggleBtn);

    let panelOpen = !isCompact();

    function applyGuiLayout() {
        const compact = isCompact();
        // 【対策】scaleX/Y は既定で中心基準。transformCenter を左上にしないと、
        //         拡大したぶんだけカードが画面外へずれる
        const scale = compact
            ? clamp(engine.getRenderWidth() / Math.max(1, viewportCss().w), 1, CFG.guiMaxScale)
            : 1;
        for (const c of [toggleBtn, card]) {
            c.transformCenterX = 0; c.transformCenterY = 0;
            c.scaleX = scale; c.scaleY = scale;
        }
        toggleBtn.top = "16px";
        card.top = (16 + 38 * scale + 8) + "px";
        card.isVisible = panelOpen;
        if (toggleBtn.textBlock) toggleBtn.textBlock.text = panelOpen ? "\u00d7" : "\u2261";
        toggleBtn.background = panelOpen ? COL.active : "rgba(20,15,11,0.82)";
    }

    toggleBtn.onPointerUpObservable.add(() => {
        panelOpen = !panelOpen;
        applyGuiLayout();
    });
    engine.onResizeObservable.add(applyGuiLayout);

    onRebuilt();
    highlight();
    applyGuiLayout();

    console.log("[Tonkatsu] build tonkatsu-2026-08-12-x / physics "
        + (physicsOn ? "Havok" : "解析解")
        + " / gui " + (CFG.guiOwnCamera ? "専用カメラ(+Inspector対策)" : "共用")
        + " / " + (stats.ms || 0) + "ms");

    return scene;
};

export default createScene;