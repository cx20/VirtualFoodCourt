// =====================================================================
//  Photoreal Karaage  /  写実的な鶏のから揚げ
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  構成:
//    0. CONFIG      … 寸法・盛り付け・品目プリセット
//    1. Rng / util  … シード付き擬似乱数（再現性の担保）
//    2. Noise       … 3D値ノイズ（形状用）/ 2D周期ノイズ（タイリング текс用）
//    3. Mesh utils  … キューブ球・グリッド面・回転体（巻き順は実行時に自動判定）
//    4. TextureLab  … 衣の粒立ち / ORM / 法線 / 布のチェック柄を手続き生成
//    5. Karaage     … から揚げ1個（形状 + 揚げ色を頂点カラーに焼く）
//    6. Tableware   … 黒皿 / レモンのくし切り / テーブルクロス
//    7. Plating     … 山積み（球パッキングの落下解決）
//    8. Scene / GUI
//
//  実物の要点（ここを外すと「岩」や「パン」になる）:
//    ・輪郭は球ではない。肉塊の歪み（低周波）＋衣のダマ（中周波）＋
//      はがれかけた薄片（高周波）＋ざらつき（超高周波）の4帯域で出来ている
//    ・揚げ色は形状と相関する。出っ張り＝濃いあめ色、くぼみ＝淡いきつね色。
//      無相関のテクスチャを貼ると「柄の付いた布」に見える
//    ・衣の裂け目からは下味の付いた肉が覗く。ここだけ赤茶色
//    ・照りは油。全面均一ではなく、くぼみに溜まって局所的に滑らかになる
//    ・1個ずつ揚げ色が違う。全部同じ色だと量産品に見える
// =====================================================================

var createScene = async function () {
    // =================================================================
    // 0. CONFIG （単位は cm）
    // =================================================================
    const CFG = {
        // --- から揚げ
        pieceCount: 10,
        pieceRadius: 1.72,
        pieceRes: 32,              // キューブ球1面あたりの分割
        uvTile: 2.2,               // 衣テクスチャのタイリング

        // --- 盛り付け
        pileX: -0.9, pileZ: 0.4,
        pileOuterR: 3.10,
        pileInnerR: 1.45,
        nestle: 0.80,              // 1.0で接するだけ。下げると食い込んで山になる

        // --- 皿
        plateOuterR: 10.35,
        plateSeg: 96,

        // --- レモン
        showLemon: true,
        lemonLength: 3.25,
        lemonRadius: 2.50,
        lemonAngleDeg: 62,

        // --- 物理（Havok）
        usePhysics: true,
        // 【対策】Havok の接触許容量・スリープ閾値は「絶対値」で、メートル系を
        //         前提に決まっている。シーンが cm 単位だと、物体の大きさに対して
        //         これらが実質1/100の厳しさになる。ここに実重力 981 を入れると
        //         1ステップあたりのめり込みが許容量を超え、押し戻され続けて
        //         プルプル震える。全体をメートル系で作り直さずに安定域へ戻す
        //         いちばん安い方法が、重力を数百まで落とすこと
        gravity: 620,              // cm/s^2（実寸どおりなら 981）
        physicsHz: 120,            // 固定タイムステップ
        hullRes: 5,                // 凸包用の代理メッシュの分割（表示用は pieceRes）
        pieceMass: 1.0,            // 全body一律なら比だけが効く。極小値は数値的に不利
        lemonMass: 0.55,
        friction: 0.85,
        restitution: 0.02,         // 揚げ物は跳ねない
        linearDamping: 0.15,
        angularDamping: 0.90,      // 揺り戻し（ロッキング）を殺す
        dropInterval: 0.22,        // 1個あたりの投入間隔（秒）
        dropClearance: 1.5,        // 真下の物からどれだけ上で放すか（cm）
        lemonClearance: 0.6,       // レモンは添えるだけなので、ごく低い位置から
        freezeWhenSettled: true,   // 静止したら STATIC にして揺れを止める
        settleSpeed: 3.0, settleSpin: 3.5, settleHold: 0.35,
        settleTimeout: 4.0,        // 静止判定が通らなくても、この秒数で打ち切る

        // --- 被写界深度（数値の意味は Scene 側のコメント参照）
        dofRatio: 0.076,           // focalLength / focusDistance。大きいほど強い
        dofFStop: 2.8,             // 小さいほど強い

        // --- テクスチャ / 描画
        crustSize: 512,
        clothSize: 512,
        showCloth: true,
        useSSAO: true,
        useDOF: true,

        // --- GUI
        compactWidth: 700,         // CSS px。これ未満はスマホ扱いで初期状態を折りたたむ
        compactMinSide: 480,
        guiMaxScale: 2.2           // 折りたたみ時のGUI拡大の上限
    };

    const START_SEED = 20260725;

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
        // ---- 3D値ノイズ（形状・頂点カラー用）
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

        // ---- 2D周期ノイズ（タイリングテクスチャ用）
        // 【対策】x方向しか折り返さないノイズでテクスチャを焼くと、
        //         上下の継ぎ目に横一文字の線が出る。両軸を折り返す
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
        }
    };

    // =================================================================
    // 3. Mesh utils
    // =================================================================
    // 【対策】巻き順の規約を決め打ちすると、片方の環境で裏返る。
    //         法線を計算してから基準点との向きで判定し、必要なら全反転する。
    //         summed = true なら1頂点のサンプルではなく全頂点の総和で判定する。
    //         代表点1個だけの判定は、その点の法線がたまたま基準方向とほぼ
    //         直交していると符号が不安定になり、部品ごとに結論が割れる
    function finalize(positions, indices, refIndex, center, summed) {
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        let dot;
        if (summed) {
            dot = 0;
            for (let i = 0, n = positions.length / 3; i < n; i++) {
                dot += normals[i * 3] * (positions[i * 3] - center.x)
                    + normals[i * 3 + 1] * (positions[i * 3 + 1] - center.y)
                    + normals[i * 3 + 2] * (positions[i * 3 + 2] - center.z);
            }
        } else {
            const i3 = refIndex * 3;
            dot = normals[i3] * (positions[i3] - center.x)
                + normals[i3 + 1] * (positions[i3 + 1] - center.y)
                + normals[i3 + 2] * (positions[i3 + 2] - center.z);
        }
        if (dot < 0) {
            for (let i = 0; i < indices.length; i += 3) {
                const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t;
            }
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        return { normals };
    }

    // 位置が一致する頂点の法線を平均する（キューブ球の面境界・回転体の継ぎ目）
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

    // 格子面（pts は row-major：(nu+1) 行 × (nv+1) 列）
    function gridMesh(name, pts, cols, nu, nv, center, scene) {
        const W = nv + 1, total = (nu + 1) * W;
        const positions = new Float32Array(total * 3);
        const uvs = new Float32Array(total * 2);
        const colors = new Float32Array(total * 4);
        for (let i = 0; i <= nu; i++) {
            for (let j = 0; j <= nv; j++) {
                const k = i * W + j, p = pts[k], c = cols[k];
                positions[k * 3] = p.x; positions[k * 3 + 1] = p.y; positions[k * 3 + 2] = p.z;
                uvs[k * 2] = j / nv; uvs[k * 2 + 1] = i / nu;
                colors[k * 4] = c[0]; colors[k * 4 + 1] = c[1]; colors[k * 4 + 2] = c[2]; colors[k * 4 + 3] = 1;
            }
        }
        const indices = [];
        for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
            const A = i * W + j, B = A + 1, C = A + W, D = C + 1;
            indices.push(A, C, B, B, C, D);
        }
        const { normals } = finalize(positions, indices, 0, center, true);
        weldNormals(positions, normals);
        const mesh = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals;
        vd.uvs = uvs; vd.colors = colors;
        vd.applyToMesh(mesh, false);
        // 【対策】頂点カラーを stride 4 で入れると Babylon が
        //         hasVertexAlpha = true にし、不透明なのに透過パスへ回される。
        //         透過パスは深度書き込みが切られるため、メッシュ単位のソートしか
        //         効かず、レモンの果皮と切断面が互いを正しく隠せなくなる
        mesh.hasVertexAlpha = false;
        return mesh;
    }

    // 回転体（profile は [{r, y}]。r は 0 より少し大きくしておく）
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
        // 最大半径のリングは法線がほぼ放射方向。ここを基準に外向き判定する
        const ref = widest * W;
        const center = new V3(0, profile[widest].y, 0);
        const { normals } = finalize(positions, indices, ref, center);
        weldNormals(positions, normals);
        const mesh = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals; vd.uvs = uvs;
        if (colors) vd.colors = colors;
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        return mesh;
    }

    // =================================================================
    // 4. TextureLab
    // =================================================================
    const TextureLab = {
        _tex(name, size, fill, scene) {
            // 【対策】createImageData / DynamicTexture は整数のサイズしか受け付けない。
            //         設定値の消し忘れなどで undefined が来ると
            //         「Value is not of type 'long'」で落ちるので、ここで畳んでおく
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

        // 衣の粒立ちの高さ場。アルベド / ORM / 法線で共有する
        // 【対策】3枚を別々のノイズで作ると、粒の位置がずれて
        //         「ざらざらの上にぼんやりした汚れが乗った」ように見える
        crustHeight(size, seed) {
            const h = new Float32Array(size * size);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const u = x / size, v = y / size;
                    const base = Noise.fbm2(u * 20, v * 20, 20, seed, 4);
                    // 粒（片栗粉のダマ）：閾値でつぶ立たせる
                    const gr = Math.pow(smooth(0.50, 0.82, Noise.fbm2(u * 44, v * 44, 44, seed + 9, 2)), 1.4);
                    const fine = Noise.fbm2(u * 96, v * 96, 96, seed + 21, 2);
                    // 【対策】最高周波を強く入れると微小面が乱反射して、
                    //         せっかくの油の照りが粉っぽくほどけてしまう
                    h[y * size + x] = clamp(base * 0.58 + gr * 0.56 + fine * 0.09, 0, 1);
                }
            }
            return h;
        },
        crustAlbedo(scene, size, hf) {
            return this._tex("crustAlbedo", size, (d, N) => {
                for (let i = 0, n = N * N; i < n; i++) {
                    const h = hf[i];
                    // ほぼ白（頂点カラーの揚げ色を殺さない）。粒の頂点だけ少し濃く焼ける
                    // 【対策】ここで明るく振ると、せっかく暗くした頂点カラーが
                    //         白茶けて戻ってしまう。1.0 を超えない範囲に抑える
                    const k = 0.80 + 0.24 * h - 0.16 * smooth(0.62, 0.95, h);
                    const j = i * 4;
                    d[j] = clamp(k * 1.02, 0, 1) * 255;
                    d[j + 1] = clamp(k * 0.985, 0, 1) * 255;
                    d[j + 2] = clamp(k * 0.94, 0, 1) * 255;
                    d[j + 3] = 255;
                }
            }, scene);
        },
        crustORM(scene, size, hf) {
            return this._tex("crustORM", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = y * N + x, j = i * 4;
                        const h = hf[i];
                        // 【対策】油の照りを全面均一にすると濡れたプラスチックになる。
                        //         油はくぼみに溜まる → 低い所ほど滑らか、粒の頂点は粗い
                        let rough = 0.20 + 0.30 * smooth(0.22, 0.78, h);
                        // さらに広い範囲の油だまり。ここが「ジューシー」の主成分
                        const pool = Noise.fbm2(u * 5, v * 5, 5, 404, 3);
                        rough = mix(rough, rough * 0.55, smooth(0.46, 0.82, pool));
                        const ao = 0.68 + 0.32 * smooth(0.15, 0.75, h);
                        d[j] = ao * 255; d[j + 1] = clamp(rough, 0.05, 1) * 255;
                        d[j + 2] = 0; d[j + 3] = 255;
                    }
                }
            }, scene);
        },

        // 油膜。R=被覆率 / G=粗さ（マテリアル側の値と乗算される）
        crustWax(scene, size, hf) {
            return this._tex("crustWax", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = y * N + x, j = i * 4;
                        const h = hf[i];
                        const pool = Noise.fbm2(u * 5, v * 5, 5, 404, 3);
                        // 低い所ほど油が溜まって被覆が厚く、かつ滑らか
                        const cover = clamp(0.66 + 0.34 * (1 - h) + 0.28 * (pool - 0.5), 0, 1);
                        const rough = clamp(0.46 + 0.54 * h - 0.30 * (pool - 0.5), 0.14, 1);
                        d[j] = cover * 255; d[j + 1] = rough * 255; d[j + 2] = 0; d[j + 3] = 255;
                    }
                }
            }, scene);
        },
        crustNormal(scene, size, hf, strength) {
            return this._tex("crustNormal", size, (d, N) => {
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

        // ---- 皿（黒マット釉の炻器）--------------------------------------
        // 高さ場を1枚作り、アルベド / ORM / 法線で共有する
        plateHeight(size, seed) {
            const h = new Float32Array(size * size);
            for (let y = 0; y < size; y++) {
                const v = y / size;
                for (let x = 0; x < size; x++) {
                    const u = x / size;
                    // ざらついた素地 + 鉄粉のような点 + かすかな轆轤目
                    const grit = Noise.fbm2(u * 60, v * 60, 60, seed, 3);
                    const spec = Math.pow(smooth(0.62, 0.90, Noise.fbm2(u * 110, v * 110, 110, seed + 7, 2)), 1.6);
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
                    // 頂点カラーに掛ける変調なので 1.0 付近。粒が立った所だけ明るい
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
            return this._tex("plateORM", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = y * N + x, j = i * 4;
                        const h = hf[i];
                        // マット釉。粒の頂点はより粗く、わずかな艶ムラを混ぜる
                        const patch = Noise.fbm2(u * 7, v * 7, 7, 91, 3);
                        const rough = clamp(0.46 + 0.30 * h + 0.14 * (patch - 0.5), 0.20, 1);
                        d[j] = 255; d[j + 1] = rough * 255; d[j + 2] = 0; d[j + 3] = 255;
                    }
                }
            }, scene);
        },
        plateNormal(scene, size, hf, strength) {
            return this._tex("plateNormal", size, (d, N) => {
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

        // テーブルクロス（チェック柄の綿）
        cloth(scene, size, seed) {
            const BASE = [0.90, 0.87, 0.82];
            const WARM = [0.72, 0.60, 0.45];
            const GRAY = [0.66, 0.66, 0.66];
            return this._tex("cloth", size, (d, N) => {
                const band = (t) => {
                    const p = (t % 1 + 1) % 1;
                    // 太い帯 / 細い帯の組み合わせ
                    const a = smooth(0.04, 0.09, p) * (1 - smooth(0.26, 0.31, p));
                    const b = smooth(0.52, 0.55, p) * (1 - smooth(0.62, 0.65, p));
                    return clamp(a * 0.9 + b * 0.55, 0, 1);
                };
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        const bu = band(u), bv = band(v);
                        let cr = BASE[0], cg = BASE[1], cb = BASE[2];
                        const w = clamp(bu + bv - bu * bv * 0.4, 0, 1);
                        const useWarm = ((u * 4) | 0) % 2 === ((v * 4) | 0) % 2;
                        const C = useWarm ? WARM : GRAY;
                        cr = mix(cr, C[0], w * 0.85); cg = mix(cg, C[1], w * 0.85); cb = mix(cb, C[2], w * 0.85);
                        // 織り目
                        const weave = 0.94 + 0.12 * Noise.fbm2(u * 120, v * 120, 120, seed, 2)
                            + 0.04 * Math.sin(u * Math.PI * 2 * N / 3);
                        d[i] = clamp(cr * weave, 0, 1) * 255;
                        d[i + 1] = clamp(cg * weave, 0, 1) * 255;
                        d[i + 2] = clamp(cb * weave, 0, 1) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
        }
    };

    // =================================================================
    //  マテリアル一式（シーンで1回だけ作ってキャッシュ）
    // =================================================================
    class Materials {
        constructor(scene, cfg) {
            const S = cfg.crustSize;
            const hf = TextureLab.crustHeight(S, 1301);
            this.crustAlbedo = TextureLab.crustAlbedo(scene, S, hf);
            this.crustORM = TextureLab.crustORM(scene, S, hf);
            this.crustNormal = TextureLab.crustNormal(scene, S, hf, 2.0);
            this.crustWax = TextureLab.crustWax(scene, S, hf);
            for (const t of [this.crustAlbedo, this.crustORM, this.crustNormal, this.crustWax]) {
                t.uScale = cfg.uvTile; t.vScale = cfg.uvTile;
            }

            // ---- 衣
            const k = new BABYLON.PBRMaterial("karaage", scene);
            k.albedoColor = new BABYLON.Color3(1, 1, 1);   // 実色は頂点カラー
            k.albedoTexture = this.crustAlbedo;
            k.metallic = 0.0;
            k.roughness = 1.0;                             // 実値は ORM の G
            k.metallicTexture = this.crustORM;
            k.useAmbientOcclusionFromMetallicTextureRed = true;
            k.useRoughnessFromMetallicTextureGreen = true;
            k.useMetallnessFromMetallicTextureBlue = true;
            k.bumpTexture = this.crustNormal;
            k.bumpTexture.level = 0.85;
            // 【対策】clearCoat の intensity / roughness はテクスチャの R / G と
            //         乗算される。一様な値だと油膜が均一になって濡れたプラスチックに
            //         見えるので、油だまりのテクスチャで散らす。
            //         実効 intensity ≒ 0.90 × 0.60〜1.0、roughness ≒ 0.34 × 0.30〜1.0。
            //         揚げ物は「濡れている」ので、リンゴのときより強めが正解。
            //         テカりすぎたら intensity を、鏡っぽかったら roughness を上げる
            k.clearCoat.isEnabled = true;
            k.clearCoat.texture = this.crustWax;
            k.clearCoat.useRoughnessFromMainTexture = true;
            k.clearCoat.intensity = 0.90;
            k.clearCoat.roughness = 0.34;
            k.clearCoat.indexOfRefraction = 1.47;
            // 衣の下の肉の透け。縁で赤みが差すとジューシーに見える
            k.subSurface.isTranslucencyEnabled = true;
            k.subSurface.tintColor = new BABYLON.Color3(0.72, 0.30, 0.15);
            k.subSurface.translucencyIntensity = 0.24;
            k.subSurface.minimumThickness = 0.6;
            k.subSurface.maximumThickness = 3.0;
            this.karaage = k;

            // ---- 皿（黒マット釉の炻器）
            const PS = 512;
            const ph = TextureLab.plateHeight(PS, 55);
            this.plateAlbedoTex = TextureLab.plateAlbedo(scene, PS, ph);
            this.plateORMTex = TextureLab.plateORM(scene, PS, ph);
            this.plateNormalTex = TextureLab.plateNormal(scene, PS, ph, 1.7);
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

            // ---- レモン
            const l = new BABYLON.PBRMaterial("lemon", scene);
            l.albedoColor = new BABYLON.Color3(1, 1, 1);   // 実色は頂点カラー
            l.metallic = 0.0;
            l.roughness = 0.30;
            l.clearCoat.isEnabled = true;
            l.clearCoat.intensity = 0.50;      // 切り口は濡れている
            l.clearCoat.roughness = 0.22;
            l.subSurface.isTranslucencyEnabled = true;
            l.subSurface.tintColor = new BABYLON.Color3(0.97, 0.86, 0.30);
            l.subSurface.translucencyIntensity = 0.58;
            l.subSurface.minimumThickness = 0.2;
            l.subSurface.maximumThickness = 2.2;
            this.lemon = l;

            // ---- クロス
            if (cfg.showCloth) {
                this.clothTex = TextureLab.cloth(scene, cfg.clothSize, 7);
                this.clothTex.uScale = 7; this.clothTex.vScale = 7;
                const c = new BABYLON.PBRMaterial("cloth", scene);
                c.albedoTexture = this.clothTex;
                c.metallic = 0.0;
                c.roughness = 0.94;
                this.cloth = c;
            }
        }
    }

    // =================================================================
    // 5. Karaage
    // =================================================================
    // キューブ球の6面。u × v の符号で各面の巻き順をそろえる
    const QUAD_FACE = [
        { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
        { n: [-1, 0, 0], u: [0, 1, 0], v: [0, 0, 1] },
        { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
        { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
        { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
        { n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0] }
    ];

    // 揚げ色のパレット（sRGB）
    // 【対策】油に濡れた面は「明るく」ではなく「暗く・彩度高く」なる。
    //         淡い色を広く置くと、いくら光沢を足しても粉を吹いたパンに見える。
    //         いちばん淡い所でもすでにきつね色、というレンジに寄せる
    const PALE = [0.84, 0.64, 0.34];   // 淡いきつね色（くぼみ・厚い衣）
    const LIGHT = [0.78, 0.47, 0.165];
    const MID = [0.67, 0.335, 0.090];  // きつね色（オレンジ寄り）
    const DARK = [0.48, 0.200, 0.055];  // あめ色（出っ張り）
    // 焦げを黒に寄せると、パンの焼き目のような硬い縞に見える
    const BURNT = [0.30, 0.120, 0.040];
    const MEAT = [0.52, 0.240, 0.125];  // 裂け目に溜まった下味（たれ）

    class Karaage {
        constructor(scene, cfg, seed, mats) {
            const rng = new Rng(seed);
            this.cfg = cfg;
            this.R = cfg.pieceRadius * rng.range(0.80, 1.18);
            // 【対策】完全な球から出発すると、どれだけノイズを足しても
            //         「ごつごつしたボール」にしかならない。肉塊は扁平
            this.sx = rng.range(0.88, 1.16);
            this.sy = rng.range(0.76, 0.96);   // 扁平にしすぎるとスコーンに見える
            this.sz = rng.range(0.88, 1.16);
            this.nseed = rng.int(900000) + 1000;
            // 個体ごとの揚げ色の差。これが無いと量産品に見える
            this.tone = rng.range(-0.13, 0.15);
            this.warm = rng.range(0.96, 1.05);
            this.mesh = this._build(scene, cfg, mats);
        }

        // 単位方向 → 半径倍率と、色付けに使うスカラー
        _surface(nx, ny, nz, out) {
            const s = this.nseed, N = Noise;
            // 低周波：肉塊そのものの歪み
            // 【対策】低周波が1帯域だと、振幅をいくら上げても「丸い塊」のまま
            //         シルエットが滑らかになる。実物は肉塊が折れて2〜3個の
            //         大きなローブに分かれている。2帯域に分けて重ねる
            const lump = N.fbm3(nx * 1.20 + 13.1, ny * 1.20 + 4.7, nz * 1.20 + 8.3, s, 3) - 0.5;
            const lobe = N.fbm3(nx * 2.15 + 7.7, ny * 2.15 + 19.3, nz * 2.15 + 11.1, s + 3, 2) - 0.5;
            // 中周波：衣のダマ。閾値でつぶすと「局所的に盛り上がった塊」になる
            const cRaw = N.fbm3(nx * 2.95 + 31.7, ny * 2.95 + 2.1, nz * 2.95 + 17.9, s + 7, 3);
            const clump = Math.pow(smooth(0.50, 0.76, cRaw), 1.10);
            // 高周波：はがれかけた薄い衣。ダマの上に乗りやすい
            const fRaw = N.fbm3(nx * 7.20 + 5.3, ny * 7.20 + 21.7, nz * 7.20 + 3.9, s + 23, 2);
            const flake = smooth(0.56, 0.80, fRaw) * (0.30 + 0.70 * clump);
            // くぼみ：衣の裂け目。深く・鋭くしないと表面がパンになる
            const crack = smooth(0.50, 0.24, N.fbm3(nx * 2.20 + 9.1, ny * 2.20 + 15.3, nz * 2.20 + 27.7, s + 41, 3));
            // 超高周波：ざらつき
            const grain = N.fbm3(nx * 16 + 3, ny * 16 + 9, nz * 16 + 21, s + 59, 2) - 0.5;

            const bump = 0.255 * clump + 0.070 * flake - 0.160 * crack + 0.032 * grain;
            out.r = Math.max(0.45, 1 + 0.40 * lump + 0.26 * lobe + bump);
            // 【対策】揚げ色は必ず変位と相関させる。無相関だと柄物の布に見える
            out.t = clamp(0.40 + bump / 0.30 + 0.45 * lump + this.tone, 0, 1);
            out.crack = crack;
            out.burn = grain + 0.5;
            return out;
        }

        _color(s, out) {
            const t = s.t;
            let r, g, b;
            if (t < 0.34) { const k = t / 0.34; r = mix(PALE[0], LIGHT[0], k); g = mix(PALE[1], LIGHT[1], k); b = mix(PALE[2], LIGHT[2], k); }
            else if (t < 0.68) { const k = (t - 0.34) / 0.34; r = mix(LIGHT[0], MID[0], k); g = mix(LIGHT[1], MID[1], k); b = mix(LIGHT[2], MID[2], k); }
            else { const k = (t - 0.68) / 0.32; r = mix(MID[0], DARK[0], k); g = mix(MID[1], DARK[1], k); b = mix(MID[2], DARK[2], k); }
            // 焦げ：出っ張りのうち、さらに一部だけ
            const burn = smooth(0.86, 1.0, t) * smooth(0.62, 0.86, s.burn) * 0.60;
            r = mix(r, BURNT[0], burn); g = mix(g, BURNT[1], burn); b = mix(b, BURNT[2], burn);
            // 衣の裂け目から覗く肉
            // 裂け目には下味が溜まって濃く濡れる
            const meat = smooth(0.45, 0.92, s.crack) * 0.70;
            r = mix(r, MEAT[0], meat); g = mix(g, MEAT[1], meat); b = mix(b, MEAT[2], meat);
            out[0] = srgb(r * this.warm);
            out[1] = srgb(g);
            out[2] = srgb(b / this.warm);
            return out;
        }

        // 凸包コライダー用の滑らかな輪郭。衣のダマ・薄片・ざらつきは落とす
        // 【対策】でこぼこの点群をそのまま凸包にすると、ほぼ同一平面の面が
        //         大量に生まれる。積み重なった状態では接触マニフォールドが
        //         毎ステップ別の面へ飛び移り、これがプルプルの主因になる。
        //         低周波成分だけの滑らかな塊にして面数を減らし、
        //         表示メッシュのわずかに内側（0.985倍）に置く
        _hullSurface(nx, ny, nz, out) {
            const s = this.nseed, N = Noise;
            const lump = N.fbm3(nx * 1.20 + 13.1, ny * 1.20 + 4.7, nz * 1.20 + 8.3, s, 3) - 0.5;
            const lobe = N.fbm3(nx * 2.15 + 7.7, ny * 2.15 + 19.3, nz * 2.15 + 11.1, s + 3, 2) - 0.5;
            const cRaw = N.fbm3(nx * 2.95 + 31.7, ny * 2.95 + 2.1, nz * 2.95 + 17.9, s + 7, 3);
            // 凸包は元の形の凹み（衣の裂け目）をまたいで張られるので、
            // 等倍だと表示面から数mmはみ出して隙間が空いて見える。少し縮める
            out.r = (1 + 0.40 * lump + 0.26 * lobe + 0.12 * smooth(0.50, 0.76, cRaw)) * 0.93;
            return out;
        }

        // 形状の生成。withAttrs=false なら位置とインデックスだけ（凸包用）
        _geometry(res, withAttrs, hull) {
            const vpf = (res + 1) * (res + 1), total = 6 * vpf;
            const positions = new Float32Array(total * 3);
            const uvs = withAttrs ? new Float32Array(total * 2) : null;
            const colors = withAttrs ? new Float32Array(total * 4) : null;
            const indices = [];
            const S = { r: 1, t: 0, crack: 0, burn: 0 }, C = [0, 0, 0];
            let far = 0, farD = -1;

            for (let f = 0; f < 6; f++) {
                const F = QUAD_FACE[f], base = f * vpf;
                const cx = F.u[1] * F.v[2] - F.u[2] * F.v[1];
                const cy = F.u[2] * F.v[0] - F.u[0] * F.v[2];
                const cz = F.u[0] * F.v[1] - F.u[1] * F.v[0];
                const hand = (cx * F.n[0] + cy * F.n[1] + cz * F.n[2]) > 0;
                for (let j = 0; j <= res; j++) {
                    const b = -1 + 2 * j / res;
                    for (let i = 0; i <= res; i++) {
                        const a = -1 + 2 * i / res;
                        let x = F.n[0] + F.u[0] * a + F.v[0] * b;
                        let y = F.n[1] + F.u[1] * a + F.v[1] * b;
                        let z = F.n[2] + F.u[2] * a + F.v[2] * b;
                        const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
                        if (hull) this._hullSurface(x, y, z, S); else this._surface(x, y, z, S);
                        const k = base + j * (res + 1) + i;
                        const px = x * this.R * S.r * this.sx;
                        const py = y * this.R * S.r * this.sy;
                        const pz = z * this.R * S.r * this.sz;
                        positions[k * 3] = px; positions[k * 3 + 1] = py; positions[k * 3 + 2] = pz;
                        if (withAttrs) {
                            uvs[k * 2] = i / res; uvs[k * 2 + 1] = j / res;
                            this._color(S, C);
                            colors[k * 4] = C[0]; colors[k * 4 + 1] = C[1];
                            colors[k * 4 + 2] = C[2]; colors[k * 4 + 3] = 1;
                        }
                        const d = px * px + py * py + pz * pz;
                        if (d > farD) { farD = d; far = k; }
                    }
                }
                for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
                    const A = base + j * (res + 1) + i, B = A + 1, Cc = A + res + 1, D = Cc + 1;
                    if (hand) indices.push(A, Cc, B, B, Cc, D);
                    else indices.push(A, B, Cc, B, D, Cc);
                }
            }
            return { positions, indices, uvs, colors, far };
        }

        _build(scene, cfg, mats) {
            const g = this._geometry(cfg.pieceRes, true, false);
            const { normals } = finalize(g.positions, g.indices, g.far, V3.Zero());
            // 【対策】キューブ球は面の境界で頂点が重複する。そのまま
            //         ComputeNormals すると継ぎ目に陰影の段差（十字の筋）が出る
            weldNormals(g.positions, normals);

            const mesh = new BABYLON.Mesh("karaage", scene);
            const vd = new BABYLON.VertexData();
            vd.positions = g.positions; vd.indices = g.indices; vd.normals = normals;
            vd.uvs = g.uvs; vd.colors = g.colors;
            vd.applyToMesh(mesh, false);
            // 頂点カラー stride 4 → hasVertexAlpha が立つ。透過パスに回ると
            // 深度書き込みが無効になり、SSAO / 深度バッファからも外れる
            mesh.hasVertexAlpha = false;
            mesh.material = mats.karaage;
            mesh.receiveShadows = true;
            return mesh;
        }

        // 凸包コライダー
        // 【対策】表示用メッシュは1個あたり6千頂点を超える。これをそのまま
        //         PhysicsShapeConvexHull に渡すと、盛り付けのたびに固まる。
        //         同じ形状関数を低解像度で評価した代理メッシュから作る
        //         （凸包なので、細かい衣の凹凸は落としても接触の挙動は変わらない）
        hullShape(scene) {
            const g = this._geometry(this.cfg.hullRes, false, true);
            const proxy = new BABYLON.Mesh("hullProxy", scene);
            const vd = new BABYLON.VertexData();
            vd.positions = g.positions; vd.indices = g.indices;
            vd.applyToMesh(proxy, false);
            const shape = new BABYLON.PhysicsShapeConvexHull(proxy, scene);
            proxy.dispose();
            return shape;
        }
    }

    // =================================================================
    // 6. Tableware
    // =================================================================
    // 皿の内側プロファイル（盛り付けの接地計算にも使う）
    const PLATE_INNER = [
        [0.004, 0.56], [1.60, 0.54], [3.20, 0.60], [4.60, 0.75],
        [5.90, 1.02], [7.10, 1.45], [8.20, 2.02], [9.20, 2.62], [10.00, 3.02]
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
        prof.push({ r: cfg.plateOuterR, y: 3.10 });     // 縁の上
        prof.push({ r: cfg.plateOuterR, y: 2.86 });     // 縁の外側
        // 外側を下って高台へ
        const outer = [[10.15, 2.45], [9.55, 1.85], [8.55, 1.20], [7.20, 0.68],
        [5.60, 0.36], [4.30, 0.20], [3.55, 0.16]];
        for (const p of outer) prof.push({ r: p[0], y: p[1] });
        prof.push({ r: 3.45, y: 0.0 });                  // 高台
        prof.push({ r: 3.05, y: 0.0 });
        prof.push({ r: 2.95, y: 0.22 });
        prof.push({ r: 1.60, y: 0.26 });
        prof.push({ r: 0.004, y: 0.28 });

        // 黒い釉薬。縁は釉が薄くなって素地の色がうっすら出る（見込みより明るい）
        const GLAZE = [0.235, 0.225, 0.232];   // sRGB。リニアでは約 0.046
        const EDGE = [0.44, 0.405, 0.375];
        const mesh = revolve("plate", prof, cfg.plateSeg, scene, {
            uScale: 6, vScale: 2.4, wobble: 0.004,
            colorFn: (i, ang) => {
                const rim = smooth(7.4, 9.6, i) * (1 - smooth(11.0, 12.6, i));
                // 窯変のムラ。周方向にも高さ方向にも変化させる
                const m = Noise.fbm3(Math.cos(ang) * 2.2, Math.sin(ang) * 2.2, i * 0.35, 5150, 3);
                const k = rim * (0.40 + 0.60 * m);
                const g = 0.86 + 0.32 * m;
                return [srgb(mix(GLAZE[0], EDGE[0], k) * g),
                        srgb(mix(GLAZE[1], EDGE[1], k) * g),
                        srgb(mix(GLAZE[2], EDGE[2], k) * g)];
            }
        });
        mesh.material = mats.plate;
        mesh.receiveShadows = true;
        return mesh;
    }

    // ---- レモンのくし切り ------------------------------------------
    const RIND = [0.93, 0.76, 0.14];
    const PITH = [0.965, 0.945, 0.855];
    const FLESH_A = [0.99, 0.93, 0.42];
    const FLESH_B = [0.90, 0.78, 0.22];
    const CORE = [0.97, 0.95, 0.80];

    function lemonColor(q, t, phi, onRind, ns) {
        let c;
        if (onRind) {
            const d = 0.92 + 0.16 * Noise.fbm3(Math.cos(phi) * 9, Math.sin(phi) * 9, t * 12, ns + 5, 2);
            c = [RIND[0] * d, RIND[1] * d, RIND[2] * d];
        } else if (q > 0.945) c = RIND;                 // 皮
        else if (q > 0.888) c = PITH;                   // 白いワタ（太いと蝋細工に見える）
        else if (q < 0.11) c = CORE;                    // 芯
        else {
            // 果肉の粒（さじょう）は放射方向に伸びる → t に細かく q に粗く
            // さじょうは放射方向に伸びる。t 方向を細かく刻んで筋を出す
            const ve = Noise.fbm3(q * 2.4, t * 34, 3.7, ns + 11, 3);
            const k = smooth(0.30, 0.74, ve);
            c = [mix(FLESH_A[0], FLESH_B[0], k), mix(FLESH_A[1], FLESH_B[1], k), mix(FLESH_A[2], FLESH_B[2], k)];
        }
        return [srgb(c[0]), srgb(c[1]), srgb(c[2])];
    }

    // 【対策】果皮と切断面×2 を別メッシュで作ると次の3つが同時に起きる:
    //   (1) 外周半径の式が食い違う。果皮だけ bump() を掛けていたため
    //       全長にわたって最大 3.5% の隙間が開いていた
    //   (2) 両端（|t| ≒ 1）に蓋が無い。ρ が 0 まで落ちないので筒抜けになる
    //   (3) 巻き順の判定が部品ごとに独立で、片方だけ裏返り得る
    //   → 裏面カリングで内側が消え、「中身の無い殻」＝皿が透けて見える。
    //   断面を1本の閉じたループ（頂点→片方の切断面→果皮の弧→もう片方の
    //   切断面→頂点）にして掃引し、1メッシュの閉じた立体として作る
    function buildLemon(scene, cfg, seed, mats) {
        const rng = new Rng(seed);
        const A = cfg.lemonLength * rng.range(0.94, 1.06);
        const R = cfg.lemonRadius * rng.range(0.94, 1.06);
        const h = cfg.lemonAngleDeg * Math.PI / 180 * 0.5;
        const NT = 34, M1 = 12, M2 = 14, M3 = 12, M = M1 + M2 + M3;
        const ns = rng.int(90000);

        // 断面半径。両端で 0 に落ちるので輪が1点に潰れ、端が自然に塞がる
        const rhoOf = (t) => Math.max(R * 0.002, R * Math.pow(Math.max(0, 1 - t * t), 0.42));
        const bumpOf = (t, phi) => 0.965 + 0.055 * Noise.fbm3(
            Math.cos(phi) * 3.2, Math.sin(phi) * 3.2, t * 4.4, ns, 2);

        const P = [], C = [];
        for (let i = 0; i <= NT; i++) {
            // ^0.42 のプロファイルは先端で傾きが急。sin で刻みを詰める
            const th = -Math.PI / 2 + Math.PI * i / NT;
            const t = Math.sin(th);
            const rho = rhoOf(t);
            for (let j = 0; j <= M; j++) {
                let phi, q, onRind;
                if (j <= M1) { phi = -h; q = j / M1; onRind = false; }
                else if (j <= M1 + M2) { phi = -h + 2 * h * (j - M1) / M2; q = 1; onRind = true; }
                else { phi = h; q = 1 - (j - M1 - M2) / M3; onRind = false; }
                // 外周半径は果皮も切断面も同じ式。ここがずれると隙間になる
                const r = rho * bumpOf(t, phi) * q;
                let y = r * Math.cos(phi), z = r * Math.sin(phi);
                if (!onRind) {
                    // 切断面はわずかに膨らむ（果肉の盛り上がり）。
                    // 稜線(q=0)と外周(q=1)、および両端では 0 になるので閉じたまま
                    const b = 0.045 * rho * Math.sin(Math.PI * q);
                    y += -Math.sin(h) * b;
                    z += (j <= M1 ? -1 : 1) * Math.cos(h) * b;
                }
                P.push(new V3(t * A, y, z));
                C.push(lemonColor(q, t, phi, onRind, ns));
            }
        }

        // 【対策】物理ボディは TransformNode ではなくメッシュに直接付ける。
        //         親子付けしたままだと、Havok が動かすのは親、描画は子…と
        //         二重に変換が掛かって位置が合わなくなる
        const mesh = gridMesh("lemon", P, C, NT, M, new V3(0, 0.45 * R, 0), scene);
        mesh.material = mats.lemon;
        mesh.receiveShadows = true;
        return { mesh, R, A, h };
    }

    function buildCloth(scene, cfg, mats) {
        if (!cfg.showCloth) return null;
        const g = BABYLON.MeshBuilder.CreateGround("cloth", { width: 160, height: 160, subdivisions: 2 }, scene);
        g.material = mats.cloth;
        g.receiveShadows = true;
        g.position.y = -0.002;
        return g;
    }

    // =================================================================
    // 7. Plating : Havok で1個ずつ落として盛り付ける
    // =================================================================
    function physMaterial(cfg) { return { friction: cfg.friction, restitution: cfg.restitution }; }

    function addStaticMeshBody(mesh, cfg, scene) {
        const shape = new BABYLON.PhysicsShapeMesh(mesh, scene);
        shape.material = physMaterial(cfg);
        const body = new BABYLON.PhysicsBody(mesh, BABYLON.PhysicsMotionType.STATIC, false, scene);
        body.shape = shape;
        return body;
    }

    function addDynamicBody(mesh, shape, mass, cfg, scene) {
        shape.material = physMaterial(cfg);
        const body = new BABYLON.PhysicsBody(mesh, BABYLON.PhysicsMotionType.DYNAMIC, false, scene);
        body.shape = shape;
        body.setMassProperties({ mass });
        // 【対策】damping は PhysicsAggregate のオプションに書いても効かない。
        //         PhysicsBody のメソッドで設定する。角速度の減衰を強めにすると
        //         皿のすり鉢面を延々と転がり続けるのを防げる
        body.setLinearDamping(cfg.linearDamping);
        body.setAngularDamping(cfg.angularDamping);
        // 【対策】毎フレーム「メッシュの姿勢 → 物理ボディ」へ書き戻すと、
        //         物理が出した結果を読み直して押し込む往復が起きる。
        //         動的ボディでは preStep を切る
        body.disablePreStep = true;
        return body;
    }

    // 物理が使えないときの保険（従来の回転楕円体による落下解決）
    function layoutFallback(pieces, lemons, cfg, seed) {
        const rng = new Rng(seed >>> 0);
        const n = pieces.length;
        const outerN = Math.min(n, Math.max(4, Math.round(n * 0.62)));
        const placed = [], a0 = rng.range(0, Math.PI * 2);
        for (let i = 0; i < n; i++) {
            const layer = i < outerN ? 0 : 1;
            const a = layer === 0
                ? a0 + i / outerN * Math.PI * 2 + rng.range(-0.26, 0.26)
                : a0 + 0.7 + (i - outerN) / Math.max(1, n - outerN) * Math.PI * 2;
            const r = (layer === 0 ? cfg.pileOuterR : cfg.pileInnerR) * rng.range(0.84, 1.14);
            const tx = Math.cos(a) * r + cfg.pileX, tz = Math.sin(a) * r + cfg.pileZ;
            const m = pieces[i].mesh;
            m.setEnabled(true);
            m.computeWorldMatrix(true);
            const bb = m.getBoundingInfo().boundingBox;
            const ext = bb.extendSizeWorld, ctr = bb.centerWorld;
            const rh = (ext.x + ext.z) * 0.5 * 0.90, hh = ext.y * 0.92;
            const floorY = plateInnerY(Math.hypot(tx, tz));
            let cy = floorY + hh;
            for (const q of placed) {
                if (q.layer >= layer) continue;
                const d = Math.hypot(tx - q.x, tz - q.z), sr = (rh + q.rh) * cfg.nestle;
                if (d < sr) cy = Math.max(cy, q.cy + (hh + q.hh) * cfg.nestle * Math.sqrt(Math.max(0, 1 - (d / sr) * (d / sr))));
            }
            cy = Math.min(cy, floorY + hh * 2.4);
            m.position.set(tx - ctr.x, cy - ctr.y, tz - ctr.z);
            placed.push({ x: tx, z: tz, cy, rh, hh, layer });
        }
        for (let i = 0; i < lemons.length; i++) {
            const L = lemons[i], a = 0.02 + i * 0.44, r = 6.05 + i * 0.62;
            L.mesh.setEnabled(true);
            L.mesh.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
            L.mesh.computeWorldMatrix(true);
            const minY = L.mesh.getBoundingInfo().boundingBox.minimumWorld.y;
            L.mesh.position.y = plateInnerY(r) - minY - 0.06;
        }
    }

    // =================================================================
    // 8. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.88, 0.87, 0.86, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    // 環境の輪郭がそのまま映り込むと、油の照りが「鏡」になる
    // 【対策】反射をぼかしすぎると、ハイライトのコントラストが消えて
    //         「艶消しの何か」になる。油の照りは環境の明暗が映り込んで初めて出る
    env.lodGenerationOffset = 0.20;
    scene.environmentIntensity = 1.00;

    const camera = new BABYLON.ArcRotateCamera("cam", -1.92, 0.86, 42, new V3(0, 2.4, 0), scene);
    camera.attachControl(true);
    camera.fov = 0.60;                     // 料理写真らしく、やや望遠
    camera.wheelPrecision = 8;
    camera.minZ = 0.1;
    // 【対策】被写界深度は深度テクスチャの値を [minZ, maxZ] で復元して使う。
    //         既定の maxZ = 10000 のままだと、40cm 前後にある被写体の深度が
    //         0.004 付近に潰れて量子化され、錯乱円がほぼ 0 になる（＝ボケない）。
    //         シーンの広がりに合わせて詰める
    camera.maxZ = 400;
    camera.lowerRadiusLimit = 14;
    camera.upperRadiusLimit = 160;
    camera.lowerBetaLimit = 0.05;
    camera.upperBetaLimit = 1.50;
    scene.cameraToUseForPointers = camera;

    // 大きめのソフトボックスを左上後方から。料理写真の基本形
    const key = new BABYLON.DirectionalLight("key", new V3(-0.42, -1.0, 0.62).normalize(), scene);
    key.position = new V3(22, 40, -30);
    key.intensity = 3.0;
    key.diffuse = new BABYLON.Color3(1.0, 0.985, 0.955);
    key.specular = new BABYLON.Color3(0.95, 0.92, 0.87);
    key.autoCalcShadowZBounds = true;

    const fillL = new BABYLON.DirectionalLight("fillL", new V3(0.85, -0.35, -0.5).normalize(), scene);
    fillL.intensity = 0.85;
    fillL.diffuse = new BABYLON.Color3(1.0, 0.95, 0.90);
    fillL.specular = new BABYLON.Color3(0.18, 0.17, 0.16);

    // 【対策】平行光源のハイライトは1点しか出ない。料理写真のような
    //         「濡れた面にいくつも走る照り」を作るには、拡散をほぼ切って
    //         鏡面だけを足す光源をもう1灯まわす
    const kick = new BABYLON.DirectionalLight("kick", new V3(-0.28, -0.80, -0.95).normalize(), scene);
    kick.intensity = 1.7;
    kick.diffuse = new BABYLON.Color3(0.06, 0.06, 0.06);
    kick.specular = new BABYLON.Color3(1.0, 0.95, 0.88);

    const amb = new BABYLON.HemisphericLight("amb", new V3(0, 1, 0), scene);
    amb.intensity = 0.20;
    amb.diffuse = new BABYLON.Color3(1, 0.98, 0.96);
    amb.groundColor = new BABYLON.Color3(0.35, 0.33, 0.31);
    amb.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.useBlurExponentialShadowMap = true;
    sg.blurKernel = 32;
    sg.depthScale = 40;
    sg.darkness = 0.36;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    ip.exposure = 1.22;      // アルベドを暗くしたぶん露出で戻す
    ip.contrast = 1.22;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.2;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    const mats = new Materials(scene, CFG);
    const clothMesh = buildCloth(scene, CFG, mats);
    const plateMesh = buildPlate(scene, CFG, mats);

    // ---- Havok の初期化 ---------------------------------------------
    // 【対策】Playground では createScene を async にして await できる。
    //         失敗したときに空の皿にならないよう、解析的な配置に落とす
    let physicsOn = false;
    if (CFG.usePhysics) {
        try {
            const havok = await HavokPhysics();
            // 【対策】HavokPlugin の第1引数は _useDeltaForWorldStep。
            //         true（既定）だとフレームのデルタ時間でそのまま積分するため、
            //         フレーム落ちのたびにステップ幅が変わり、接触が解けたり
            //         深く食い込んだりを繰り返して震える。false で固定ステップにする
            const hk = new BABYLON.HavokPlugin(false, havok);
            // 【対策】重力はシーンの単位系に合わせる。このシーンは cm なので
            //         9.81 ではなく 981。ここを間違えると 1/100 の重力になり、
            //         いつまでも揺れて静止しない
            scene.enablePhysics(new V3(0, -CFG.gravity, 0), hk);
            if (hk.setTimeStep) hk.setTimeStep(1 / CFG.physicsHz);   // 固定ステップ幅
            addStaticMeshBody(plateMesh, CFG, scene);
            // 【対策】テーブルは板ポリではなく厚みのある箱にする。
            //         薄いコライダーは高速な剛体にすり抜けられる
            if (clothMesh) {
                const tShape = new BABYLON.PhysicsShapeBox(
                    new V3(0, -2, 0), BABYLON.Quaternion.Identity(), new V3(200, 4, 200), scene);
                tShape.material = physMaterial(CFG);
                const tBody = new BABYLON.PhysicsBody(clothMesh, BABYLON.PhysicsMotionType.STATIC, false, scene);
                tBody.shape = tShape;
            }
            physicsOn = true;
        } catch (e) {
            console.warn("[Karaage] Havok を初期化できませんでした。解析的な配置にフォールバックします", e);
        }
    }

    let pieces = [], lemons = [];
    let onRebuilt = null;
    let queue = [], dropIndex = 0, dropTimer = 0, settleTimer = 0, postDropTimer = 0, frozen = false;

    function clearFood() {
        for (const it of queue) {
            if (it.body) it.body.dispose();
            if (it.shape) it.shape.dispose();
        }
        for (const p of pieces) p.mesh.dispose();
        for (const l of lemons) l.mesh.dispose();
        pieces = []; lemons = []; queue = [];
        dropIndex = 0; dropTimer = 0; settleTimer = 0; postDropTimer = 0; frozen = false;
    }

    function build(seed) {
        clearFood();
        const rng = new Rng(seed >>> 0);
        const n = CFG.pieceCount;
        const a0 = rng.range(0, Math.PI * 2);

        for (let i = 0; i < n; i++) {
            const k = new Karaage(scene, CFG, (seed + i * 7919) >>> 0, mats);
            // 【対策】物理で動かすメッシュは rotationQuaternion を使う。
            //         Euler の rotation のままだと Havok 側の姿勢と食い違う
            k.mesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
                rng.gauss(0, 0.6), rng.range(0, Math.PI * 2), rng.gauss(0, 0.6));
            // 投入位置。皿がすり鉢なので、散らして落とせば転がって山になる。
            // 黄金角で回すと少ない個数でも偏らない
            const spread = i < n * 0.6 ? 1.0 : 0.45;
            const r = CFG.pileOuterR * Math.sqrt(rng.next()) * spread;
            const a = a0 + i * 2.39996;
            queue.push({
                mesh: k.mesh, mass: CFG.pieceMass, body: null, shape: null,
                makeShape: () => k.hullShape(scene),
                x: Math.cos(a) * r + CFG.pileX, z: Math.sin(a) * r + CFG.pileZ
            });
            pieces.push(k);
        }

        if (CFG.showLemon) {
            for (let i = 0; i < 2; i++) {
                const L = buildLemon(scene, CFG, (seed + 991 * (i + 1)) >>> 0, mats);
                // 果皮(+Y)が下を向くよう X を π 付近に。あとは物理に任せる
                L.mesh.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
                    Math.PI + rng.range(-0.5, 0.5), rng.range(0, Math.PI * 2), rng.range(-0.2, 0.2));
                const a = 0.05 + i * 0.42, r = 5.7 + i * 0.55;
                queue.push({
                    mesh: L.mesh, mass: CFG.lemonMass, body: null, shape: null,
                    makeShape: () => new BABYLON.PhysicsShapeConvexHull(L.mesh, scene),
                    x: Math.cos(a) * r, z: Math.sin(a) * r,
                    clearance: CFG.lemonClearance
                });
                lemons.push(L);
            }
        }

        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        for (const p of pieces) sg.addShadowCaster(p.mesh, true);
        for (const l of lemons) sg.addShadowCaster(l.mesh, true);
        sg.addShadowCaster(plateMesh, true);

        if (physicsOn) {
            for (const it of queue) it.mesh.setEnabled(false);
            dropTimer = CFG.dropInterval;          // 1個目はすぐ落とす
        } else {
            layoutFallback(pieces, lemons, CFG, seed);
        }
        if (onRebuilt) onRebuilt();
    }

    // 投入位置の真下にある物の上端
    // 【対策】山全体の頂点を基準にすると、山の外側へ置く物（レモンなど）まで
    //         山の高さぶん持ち上げられ、皿の縁の上から落ちてくることになる。
    //         水平方向に重なっている物だけを見る
    function localTopY(x, z, rh) {
        let top = plateInnerY(Math.hypot(x, z));
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
    //         反発が一気に解放されて弾け飛ぶ。1個ずつ、山の頂点のすぐ上から放す。
    //         落下高さを稼ぐとバウンドと貫通の両方が出るので数cmに留める
    function spawnNext() {
        const it = queue[dropIndex];
        it.mesh.setEnabled(true);
        // 【対策】ローカルの最大辺を高さ代わりにすると、細長い物（レモンは
        //         長さ6.5cm・厚み2.5cm）が長辺ぶん持ち上がる。姿勢を与えてから
        //         ワールドAABBを取り、実際の最下点が接地面のすぐ上に来るよう置く
        it.mesh.position.set(it.x, 0, it.z);
        it.mesh.computeWorldMatrix(true);
        const bb0 = it.mesh.getBoundingInfo().boundingBox;
        const e = bb0.extendSizeWorld, c = bb0.centerWorld;
        const bottomOffset = c.y - e.y;                       // 原点から最下点まで
        const clearance = (it.clearance !== undefined) ? it.clearance : CFG.dropClearance;
        const y = localTopY(it.x, it.z, Math.max(e.x, e.z)) + clearance - bottomOffset;
        it.mesh.position.y = y;
        it.mesh.computeWorldMatrix(true);
        it.shape = it.makeShape();
        it.body = addDynamicBody(it.mesh, it.shape, it.mass, CFG, scene);
        dropIndex++;
    }

    scene.onBeforeRenderObservable.add(() => {
        if (!physicsOn || frozen || queue.length === 0) return;
        const dt = Math.min(0.05, scene.getEngine().getDeltaTime() / 1000);
        if (dropIndex < queue.length) {
            dropTimer += dt;
            if (dropTimer >= CFG.dropInterval) {
                dropTimer = 0; spawnNext();
                if (onRebuilt) onRebuilt();          // 表示更新は投入時だけでよい
            }
            return;
        }
        if (!CFG.freezeWhenSettled) return;
        postDropTimer += dt;
        // 【対策】静止後もソルバの残差で微振動が続き、写真としては落ち着かない。
        //         速度がしきい値を下回った状態が続いたら STATIC に固定する
        let moving = false;
        for (const it of queue) {
            if (!it.body) continue;
            if (it.body.getLinearVelocity().length() > CFG.settleSpeed ||
                it.body.getAngularVelocity().length() > CFG.settleSpin) { moving = true; break; }
        }
        settleTimer = moving ? 0 : settleTimer + dt;
        // 【対策】微振動が残って静止判定が永久に通らないことがある。
        //         最後の投入から一定時間が過ぎたら、条件に関わらず打ち切る
        if (settleTimer > CFG.settleHold || postDropTimer > CFG.settleTimeout) {
            for (const it of queue) if (it.body) it.body.setMotionType(BABYLON.PhysicsMotionType.STATIC);
            frozen = true;
            if (onRebuilt) onRebuilt();
        }
    });

    build(START_SEED);

    if (CFG.useSSAO) {
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.85;
        ssao.totalStrength = 1.15;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 160;
        ssao.minZAspect = 0.3;
    }

    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.92;
    dp.bloomWeight = 0.14;
    dp.bloomKernel = 48;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.20;
    // 【対策】Babylon の錯乱円は「シーン単位 × 1000 = mm」で計算される。
    //         このシーンは cm 単位なので、カメラ距離 42cm は内部で 42000mm、
    //         つまり「42m 先」として扱われる。ここに実カメラのつもりで
    //         focusDistance = 420 などを入れると合焦面が手前に外れ、
    //         画面全体が最大ボケになる（＝全部ぼける）。
    //
    //         coc の係数は cocPre = (lensSize / fStop) * fL / (focus - fL)。
    //         fL を focus の一定比率にすると focus が約分されて、
    //         カメラを寄せても引いてもボケ量が変わらない
    //         錯乱円の係数は cocPre = (lensSize / fStop) * fL / (focus - fL)。
    //         fL を focus の一定比率 K にすると focus が約分されて
    //         cocPre = (lensSize / fStop) * K / (1 - K) となり、
    //         カメラを寄せても引いてもボケ量が変わらない。
    //         いまの値は cocPre ≒ 1.47。背景のクロス（約80cm）で coc ≒ 0.70、
    //         皿の手前の縁で ≒ 0.35。K を 0.03 まで下げると cocPre が 0.39 に
    //         なり、見た目にはほぼボケない（前回はここが弱すぎた）
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
    // 9. GUI
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
        idle: "#2b2521", active: "#a1621f", edge: "#4a3f36",
        text: "#f6efe6", sub: "#bda893", accent: "#e8b573"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "232px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(20,15,11,0.82)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "62px";   // 開閉ボタンの下に置く
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

    addLabel("KARAAGE", 11, COL.sub, "18px");
    addLabel("個数", 13, COL.accent, "22px");

    let curSeed = START_SEED;
    const countButtons = {};
    function highlight() {
        for (const k in countButtons) countButtons[k].background = (+k === CFG.pieceCount) ? COL.active : COL.idle;
        lemonBtn.background = CFG.showLemon ? COL.active : COL.idle;
        lemonBtn.textBlock.text = "レモン: " + (CFG.showLemon ? "ON" : "OFF");
        dofBtn.background = CFG.useDOF ? COL.active : COL.idle;
        dofBtn.textBlock.text = "被写界深度: " + (CFG.useDOF ? "ON" : "OFF");
    }
    for (const c of [6, 8, 10]) {
        countButtons[c] = addButton("c" + c, c + " 個", () => {
            CFG.pieceCount = c; build(curSeed); highlight();
        });
    }

    const sp = new BABYLON.GUI.Rectangle();
    sp.height = "8px"; sp.thickness = 0; sp.background = "";
    panel.addControl(sp);

    addButton("reseed", "盛り直す（落とし直し）", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(curSeed); highlight();
    });
    const lemonBtn = addButton("lemon", "レモン: ON", () => {
        CFG.showLemon = !CFG.showLemon; build(curSeed); highlight();
    });
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        CFG.useDOF = !CFG.useDOF;
        dp.depthOfFieldEnabled = CFG.useDOF;
        highlight();
    });
    const rotateBtn = addButton("rotate", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.08;
        rotateBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotateBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });

    const info = addLabel("", 12, COL.sub, "56px");
    onRebuilt = () => {
        if (!info) return;
        let top = 0;
        for (let i = 0; i < dropIndex; i++) {
            const m = queue[i].mesh;
            top = Math.max(top, m.getBoundingInfo().boundingBox.maximumWorld.y);
        }
        const state = !physicsOn ? "物理なし"
            : (dropIndex < queue.length ? "投入中 " + dropIndex + "/" + queue.length
                : (frozen ? "静止" : "落下中"));
        info.text = state + "\n山の高さ " + Math.max(0, top).toFixed(1) + "cm\nseed: " + curSeed;
    };
    // ---- 開閉（スマホでは初期状態で畳む）-----------------------------
    // 【対策】Babylon.GUI のサイズ指定はレンダー解像度基準（≒ CSS px × DPR）。
    //         DPR 3 の端末では 34px のボタンが実質 11 CSS px になり、
    //         「邪魔なうえに押しにくい」状態になる。畳むだけでなく、
    //         開いたときは DPR 相当だけ拡大してタップできる大きさに戻す
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

    return scene;
};

export default createScene;