// =====================================================================
//  Photoreal Korokke  /  写実的なコロッケ
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  構成:
//    0. CONFIG      … 寸法・盛り付け・表示の切り替え
//    1. Rng / util  … シード付き擬似乱数（再現性の担保）
//    2. Noise       … 3D値ノイズ（形状用）/ 2D周期ノイズ（タイリングテクスチャ用）
//    3. Mesh utils  … 巻き順の実行時判定・法線の溶接・格子面・回転体
//    3b. 流用       … エビフライ（ebifry-2026-09-21-d）のパン粉の衣・
//                     千切りキャベツ・プチトマトをそのまま使う
//    4. TextureLab  … 白磁の皿、木のテーブル
//    5. Korokke     … 小判型のコロッケ1個（割った断面つきも同じ関数で作る）
//                     衣の厚み・色・立ったパン粉はエビフライと同じ式
//    6. Sauce       … 上にかけるソース（コロッケの形状関数に沿わせる）
//    9. Tableware   … 白い丸皿 / 木のテーブル
//   10. Scene       … 灯り・盛り付け（解析的な配置）・ポストプロセス
//   11. GUI
//
//  実物の要点（参考写真から）:
//    ・形は小判型。上面はゆるい丘、底は揚げ鍋で押されてやや平ら、側面は丸い
//    ・パン粉の衣は「粒」ではなく「薄い破片」。輪郭からトゲのように飛び出し、
//      これが無いと衣を付けたハンバーグに見える
//    ・色は唐揚げより明るいきつね色。破片の先端ほど揚がって赤みが強く、
//      破片のすき間（奥）は淡い黄金色
//    ・割った断面はじゃがいもの淡いベージュに、ひき肉の茶色と玉ねぎの粒。
//      縁に 2〜3mm の衣の層、そのすぐ内側が少し黄色く火が通っている
//    ・照りは唐揚げほど強くない。パン粉は油を吸って「しっとり光る」程度
// =====================================================================

var createScene = async function () {
    const BUILD_ID = "コロッケ-2026-09-22-b";
    console.log("[Korokke] build " + BUILD_ID);

    // =================================================================
    // 0. CONFIG （単位は cm）
    // =================================================================
    const CFG = {
        // --- コロッケ（小判型）
        croqLength: 8.2,           // 長径
        croqWidth: 6.3,            // 短径
        croqThickTop: 1.58,        // 中心から上面まで
        croqThickBot: 1.22,        // 中心から底まで（底は平ら寄り）
        croqRes: 64,               // キューブ球1面あたりの分割
        uvTile: 3.0,               // パン粉テクスチャのタイリング
        panko: 0.30,               // パン粉衣の厚み cm（エビフライは 0.335）
        pankoDensity: 17,          // 立ったパン粉の密度（枚/cm²。エビフライ 820枚/本 相当）
        wholeCount: 2,             // 丸ごとの個数
        showCut: true,             // 割った1個（断面を見せる）

        // --- 付け合わせ
        showCabbage: true,
        cabCount: 340,             // キャベツの本数（エビフライと同じ）
        showTomato: true,
        tomatoCount: 2,            // プチトマト
        tomatoRadius: 1.45,

        // --- ソース
        showSauce: false,

        // --- 皿
        plateOuterR: 13.3,
        plateSeg: 128,

        // --- 被写界深度（数値の意味は Scene 側のコメント参照）
        dofRatio: 0.070,
        dofFStop: 2.8,

        // --- テクスチャ / 描画
        crustSize: 512,
        woodSize: 1024,
        useSSAO: true,
        useDOF: true,
        guiOwnCamera: false,       // true で GUI を専用カメラに分離（Inspector 系が壊れる）

        // --- GUI
        compactWidth: 700,
        compactMinSide: 480,
        guiMaxScale: 2.2
    };

    const START_SEED = 20260922;

    const V3 = BABYLON.Vector3;
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    const mix3 = (A, B, t) => [mix(A[0], B[0], t), mix(A[1], B[1], t), mix(A[2], B[2], t)];
    const srgb = (v) => Math.pow(clamp(v, 0, 1), 2.2);   // 頂点カラーはリニア空間

    // 【対策】mesh.id が重複すると Inspector が常に先頭のメッシュを
    //         ハイライトする。name と id の両方を一意にする
    let _uid = 0;
    function named(obj, name) {
        const id = name + "#" + (++_uid);
        obj.name = id; obj.id = id;
        return obj;
    }

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
        pm(a) { return (this.next() * 2 - 1) * a; }
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
            return s / n;
        },
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
    //         法線を計算してから向きを判定し、必要なら全反転する。
    //         center の渡し方で判定方法を選ぶ:
    //           null     … 閉じた立体。符号付き体積で判定する（基準点に依存しない）
    //                      皿のように薄くて広い形は、1点からの向きでは
    //                      上面の法線が基準点の「下」を向いて誤判定する
    //           Vector3  … 基準点からの向きの総和（開いた面用）
    //           function … 頂点ごとの基準点（細い帯の束など）
    function finalize(positions, indices, center) {
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        const P = positions;
        let flip = false;
        if (center === null || center === undefined) {
            // Σ c·(p1-p0)×(p2-p0) = 6V（右手系の巻きで外向きなら正）
            let vol = 0, agree = 0;
            for (let t = 0; t < indices.length; t += 3) {
                const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
                const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
                const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
                const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
                vol += P[a] * cx + P[a + 1] * cy + P[a + 2] * cz;
                // 【対策】Babylon の ComputeNormals は右手系の外積と逆符号。
                //         決め打ちせず、得られた頂点法線と外積の向きを照合する
                agree += normals[a] * cx + normals[a + 1] * cy + normals[a + 2] * cz;
            }
            // 外積が外向き(vol>0)で法線も外積側(agree>0) → 外向き。
            // 両方負でも外向き。符号が食い違うときだけ内向き
            flip = (vol > 0) !== (agree > 0);
        } else {
            const fn = (typeof center === "function") ? center : () => center;
            let dot = 0;
            for (let i = 0, n = P.length / 3; i < n; i++) {
                const c = fn(i);
                dot += normals[i * 3] * (P[i * 3] - c.x)
                    + normals[i * 3 + 1] * (P[i * 3 + 1] - c.y)
                    + normals[i * 3 + 2] * (P[i * 3 + 2] - c.z);
            }
            flip = dot < 0;
        }
        if (flip) {
            for (let i = 0; i < indices.length; i += 3) {
                const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t;
            }
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        return normals;
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

    // 頂点データ → メッシュ。hasVertexAlpha を必ず落とす
    function makeMesh(name, scene, positions, indices, normals, uvs, colors) {
        const mesh = named(new BABYLON.Mesh(name, scene), name);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals;
        if (uvs) vd.uvs = uvs;
        if (colors) vd.colors = colors;
        vd.applyToMesh(mesh, false);
        // 【対策】頂点カラーを stride 4 で入れると Babylon が hasVertexAlpha = true
        //         にし、不透明なのに透過パスへ回される。透過パスは深度書き込みが
        //         切られるため、前後関係が壊れ、SSAO / 深度バッファからも外れる
        mesh.hasVertexAlpha = false;
        return mesh;
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
        const normals = finalize(positions, indices, center);
        weldNormals(positions, normals);
        return makeMesh(name, scene, positions, indices, normals, uvs, colors);
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
        for (let i = 0; i < N; i++) {
            for (let j = 0; j <= seg; j++) {
                const ang = j / seg * Math.PI * 2, k = i * W + j;
                // 【対策】完全な真円だと縁のハイライトが定規で引いた線になり、
                //         量産のプラスチックに見える。ごくわずかな歪みを入れる
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
                    const c = opts.colorFn(i, ang, profile[i]);
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
        // 皿は薄くて広い閉曲面。1点基準では誤判定するので体積で判定する
        const normals = finalize(positions, indices, null);
        weldNormals(positions, normals);
        return makeMesh(name, scene, positions, indices, normals, uvs, colors);
    }

    // =================================================================
    // 3b. エビフライ（ebifry-2026-09-21-d）からの流用
    //     パン粉の衣（色のランプ・立ったパン粉・テクスチャ）、千切りキャベツ、
    //     プチトマトはそちらの実装をそのまま使う。
    //     名前の衝突だけ直した（Noise → PNoise。こちらの Noise は形状用に残す）
    // =================================================================
    const TAU = Math.PI * 2;
    const smoothstep = (e0, e1, x) => {
        const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t);
    };
    const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const l2s = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
    const lin3 = (c) => [s2l(c[0]), s2l(c[1]), s2l(c[2])];
    const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const vcross = (a, b) => [
        a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
    ];
    const vlen = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    const vnorm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

    class PNoise {
        constructor(seed) {
            const r = new Rng(seed);
            this.p = new Uint8Array(512);
            const perm = new Uint8Array(256);
            for (let i = 0; i < 256; i++) perm[i] = i;
            for (let i = 255; i > 0; i--) {
                const j = r.int(i + 1);
                const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
            }
            for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
        }
        static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
        static lerp(a, b, t) { return a + (b - a) * t; }
        hash2(xi, yi) { return this.p[(this.p[xi & 255] + (yi & 255)) & 511] / 255; }
        hash3(xi, yi, zi) {
            const a = this.p[(this.p[(this.p[xi & 255] + (yi & 255)) & 511] + (zi & 255)) & 511];
            return a / 255;
        }
        n2(x, y, px, py) {
            let x0 = Math.floor(x), y0 = Math.floor(y);
            const fx = PNoise.fade(x - x0), fy = PNoise.fade(y - y0);
            const w = (v, p) => (p ? ((v % p) + p) % p : v);
            const x1 = w(x0 + 1, px), y1 = w(y0 + 1, py);
            x0 = w(x0, px); y0 = w(y0, py);
            const a = this.hash2(x0, y0), b = this.hash2(x1, y0);
            const c = this.hash2(x0, y1), d = this.hash2(x1, y1);
            return PNoise.lerp(PNoise.lerp(a, b, fx), PNoise.lerp(c, d, fx), fy);
        }
        n3(x, y, z) {
            const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
            const fx = PNoise.fade(x - x0), fy = PNoise.fade(y - y0), fz = PNoise.fade(z - z0);
            const c000 = this.hash3(x0, y0, z0), c100 = this.hash3(x0 + 1, y0, z0);
            const c010 = this.hash3(x0, y0 + 1, z0), c110 = this.hash3(x0 + 1, y0 + 1, z0);
            const c001 = this.hash3(x0, y0, z0 + 1), c101 = this.hash3(x0 + 1, y0, z0 + 1);
            const c011 = this.hash3(x0, y0 + 1, z0 + 1), c111 = this.hash3(x0 + 1, y0 + 1, z0 + 1);
            const a = PNoise.lerp(PNoise.lerp(c000, c100, fx), PNoise.lerp(c010, c110, fx), fy);
            const b = PNoise.lerp(PNoise.lerp(c001, c101, fx), PNoise.lerp(c011, c111, fx), fy);
            return PNoise.lerp(a, b, fz);
        }
        fbm2(x, y, oct, px, py) {
            let s = 0, a = 0.5, f = 1;
            for (let i = 0; i < oct; i++) {
                s += a * this.n2(x * f, y * f, px ? px * f : 0, py ? py * f : 0);
                a *= 0.5; f *= 2;
            }
            return s / (1 - Math.pow(0.5, oct));
        }
        fbm3(x, y, z, oct) {
            let s = 0, a = 0.5, f = 1;
            for (let i = 0; i < oct; i++) { s += a * this.n3(x * f, y * f, z * f); a *= 0.5; f *= 2; }
            return s / (1 - Math.pow(0.5, oct));
        }
    }

    function computeNormals(pos, idx, out) {
        const n = out || new Float32Array(pos.length);
        n.fill(0);
        for (let i = 0; i < idx.length; i += 3) {
            const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
            const e1x = pos[a] - pos[b], e1y = pos[a + 1] - pos[b + 1], e1z = pos[a + 2] - pos[b + 2];
            const e2x = pos[c] - pos[b], e2y = pos[c + 1] - pos[b + 1], e2z = pos[c + 2] - pos[b + 2];
            const nx = e1y * e2z - e1z * e2y;
            const ny = e1z * e2x - e1x * e2z;
            const nz = e1x * e2y - e1y * e2x;
            n[a] += nx; n[a + 1] += ny; n[a + 2] += nz;
            n[b] += nx; n[b + 1] += ny; n[b + 2] += nz;
            n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
        }
        for (let i = 0; i < n.length; i += 3) {
            const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
            n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
        }
        return n;
    }

    function toMesh(name, g, scene) {
        const m = new BABYLON.Mesh(name, scene);
        const vd = new BABYLON.VertexData();
        vd.positions = g.positions;
        vd.indices = g.indices;
        vd.normals = g.normals;
        if (g.uvs) vd.uvs = g.uvs;
        if (g.colors) vd.colors = g.colors;
        vd.applyToMesh(m, false);
        m.hasVertexAlpha = false;     // 頂点カラー stride 4 で透過パスへ回されるのを防ぐ
        named(m, name);
        return m;
    }

    class Geo {
        constructor() { this.pos = []; this.idx = []; this.uv = []; this.col = []; }
        vert(p, u, v, c) {
            const i = this.pos.length / 3;
            this.pos.push(p[0], p[1], p[2]);
            this.uv.push(u, v);
            this.col.push(c[0], c[1], c[2], 1);
            return i;
        }
        quad(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }
        tri(a, b, c) { this.idx.push(a, b, c); }
        // 直前に積んだ三角形群の巻き順を、基準点から見て外向きになるよう揃える
        fixFrom(first, cx, cy, cz) {
            let s = 0;
            for (let t = first; t < this.idx.length; t += 3) {
                const a = this.idx[t] * 3, b = this.idx[t + 1] * 3, c = this.idx[t + 2] * 3;
                const e1 = [this.pos[a] - this.pos[b], this.pos[a + 1] - this.pos[b + 1], this.pos[a + 2] - this.pos[b + 2]];
                const e2 = [this.pos[c] - this.pos[b], this.pos[c + 1] - this.pos[b + 1], this.pos[c + 2] - this.pos[b + 2]];
                const n = vcross(e1, e2);
                s += vdot(n, [this.pos[a] - cx, this.pos[a + 1] - cy, this.pos[a + 2] - cz]);
            }
            if (s >= 0) return;
            for (let t = first; t < this.idx.length; t += 3) {
                const b = this.idx[t + 1]; this.idx[t + 1] = this.idx[t + 2]; this.idx[t + 2] = b;
            }
        }
        finish() {
            const pos = new Float32Array(this.pos);
            const idx = (pos.length / 3 > 65535) ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
            const nrm = computeNormals(pos, idx);
            return {
                positions: pos, indices: idx, normals: nrm,
                uvs: new Float32Array(this.uv), colors: new Float32Array(this.col)
            };
        }
    }

    const TexLab = {
        make(name, size, scene, fill, opts) {
            const S = Math.max(8, Math.round(size) || 512);   // createImageData は整数のみ
            const o = opts || {};
            const t = new BABYLON.DynamicTexture(name, { width: S, height: S }, scene, true,
                BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
            if (o.linear) t.gammaSpace = false;
            const ctx = t.getContext();
            const img = ctx.createImageData(S, S);
            fill(img.data, S);
            ctx.putImageData(img, 0, 0);
            t.update(false);
            t.name = name;
            t.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
            t.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
            t.anisotropicFilteringLevel = 16;
            return t;
        },
        normalFromHeight(name, size, scene, H, strength, opts) {
            const S = Math.max(8, Math.round(size) || 512);
            const st = (strength === undefined) ? 1.0 : strength;
            return TexLab.make(name, S, scene, (d) => {
                for (let y = 0; y < S; y++) {
                    const ym = ((y - 1) + S) % S, yp = (y + 1) % S;
                    for (let x = 0; x < S; x++) {
                        const xm = ((x - 1) + S) % S, xp = (x + 1) % S;
                        const dx = (H[y * S + xp] - H[y * S + xm]) * st * S * 0.5;
                        const dy = (H[yp * S + x] - H[ym * S + x]) * st * S * 0.5;
                        let nx = -dx, ny = -dy, nz = 1;
                        const l = Math.hypot(nx, ny, nz);
                        nx /= l; ny /= l; nz /= l;
                        const i = (y * S + x) * 4;
                        d[i] = (nx * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, Object.assign({ linear: true }, opts || {}));
        },
        orm(name, size, scene, fn, opts) {
            const S = Math.max(8, Math.round(size) || 512);
            return TexLab.make(name, S, scene, (d) => {
                const o = [0, 0, 0];
                for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
                    fn(x, y, S, o);
                    const i = (y * S + x) * 4;
                    d[i] = clamp(o[0], 0, 1) * 255;
                    d[i + 1] = clamp(o[1], 0, 1) * 255;
                    d[i + 2] = clamp(o[2], 0, 1) * 255;
                    d[i + 3] = 255;
                }
            }, Object.assign({ linear: true }, opts || {}));
        }
    };

    function putRGB(d, i, r, g, b) {
        d[i] = clamp(r, 0, 1) * 255;
        d[i + 1] = clamp(g, 0, 1) * 255;
        d[i + 2] = clamp(b, 0, 1) * 255;
        d[i + 3] = 255;
    }

    // 芯線に沿った回転最小化フレーム（二重反射法）
    function frames(pts, n) {
        const T = new Float64Array(n * 3), U = new Float64Array(n * 3), Vv = new Float64Array(n * 3);
        for (let i = 0; i < n; i++) {
            const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
            let tx = pts[b * 3] - pts[a * 3], ty = pts[b * 3 + 1] - pts[a * 3 + 1], tz = pts[b * 3 + 2] - pts[a * 3 + 2];
            const l = Math.hypot(tx, ty, tz) || 1;
            T[i * 3] = tx / l; T[i * 3 + 1] = ty / l; T[i * 3 + 2] = tz / l;
        }
        let ux, uy, uz;
        {
            const tx = T[0], ty = T[1], tz = T[2];
            let ax = 0, ay = 1, az = 0;
            if (Math.abs(ty) > 0.9) { ax = 1; ay = 0; }
            ux = ay * tz - az * ty; uy = az * tx - ax * tz; uz = ax * ty - ay * tx;
            const l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
        }
        for (let i = 0; i < n; i++) {
            if (i > 0) {
                const i0 = (i - 1) * 3, i1 = i * 3;
                const v1x = pts[i1] - pts[i0], v1y = pts[i1 + 1] - pts[i0 + 1], v1z = pts[i1 + 2] - pts[i0 + 2];
                const c1 = v1x * v1x + v1y * v1y + v1z * v1z;
                let rx = ux, ry = uy, rz = uz;
                let tx = T[i0], ty = T[i0 + 1], tz = T[i0 + 2];
                if (c1 > 1e-12) {
                    const d1 = (v1x * rx + v1y * ry + v1z * rz) * 2 / c1;
                    rx -= d1 * v1x; ry -= d1 * v1y; rz -= d1 * v1z;
                    const d2 = (v1x * tx + v1y * ty + v1z * tz) * 2 / c1;
                    tx -= d2 * v1x; ty -= d2 * v1y; tz -= d2 * v1z;
                }
                const v2x = T[i1] - tx, v2y = T[i1 + 1] - ty, v2z = T[i1 + 2] - tz;
                const c2 = v2x * v2x + v2y * v2y + v2z * v2z;
                if (c2 > 1e-12) {
                    const d3 = (v2x * rx + v2y * ry + v2z * rz) * 2 / c2;
                    rx -= d3 * v2x; ry -= d3 * v2y; rz -= d3 * v2z;
                }
                const l = Math.hypot(rx, ry, rz) || 1;
                ux = rx / l; uy = ry / l; uz = rz / l;
            }
            U[i * 3] = ux; U[i * 3 + 1] = uy; U[i * 3 + 2] = uz;
            const tx = T[i * 3], ty = T[i * 3 + 1], tz = T[i * 3 + 2];
            Vv[i * 3] = ty * uz - tz * uy;
            Vv[i * 3 + 1] = tz * ux - tx * uz;
            Vv[i * 3 + 2] = tx * uy - ty * ux;
        }
        return { T: T, U: U, V: Vv };
    }

    // 断面の上下を水平に保つ回転角。折り返さないと背と腹が入れ替わる
    function flatRoll(fr, n, flat, twist, rng) {
        const ang = new Float64Array(n);
        let prev = 0, wind = 0, init = true;
        const ph = rng.range(0, TAU), fq = rng.range(0.10, 0.26);
        for (let i = 0; i < n; i++) {
            const tx = fr.T[i * 3], tz = fr.T[i * 3 + 2];
            let hx = -tz, hy = 0, hz = tx;
            const hl = Math.hypot(hx, hy, hz);
            let a;
            if (hl < 1e-4) {
                a = prev;
            } else {
                hx /= hl; hz /= hl;
                const du = hx * fr.U[i * 3] + hy * fr.U[i * 3 + 1] + hz * fr.U[i * 3 + 2];
                const dv = hx * fr.V[i * 3] + hy * fr.V[i * 3 + 1] + hz * fr.V[i * 3 + 2];
                a = Math.atan2(dv, du);
                if (init) { init = false; wind = -Math.round(a / Math.PI) * Math.PI; }
                let d = a + wind - prev;
                while (d > Math.PI) { wind -= TAU; d -= TAU; }
                while (d < -Math.PI) { wind += TAU; d += TAU; }
                a = a + wind;
            }
            prev = a;
            ang[i] = a * flat + Math.sin(i * fq + ph) * twist;
        }
        return ang;
    }

    function localFrame(o, fwd, up) {
        const f = vnorm(fwd);
        let u = vnorm(up || [0, 1, 0]);
        if (Math.abs(vdot(f, u)) > 0.985) u = [1, 0, 0];
        const s = vnorm(vcross(u, f));      // 横
        const v = vnorm(vcross(f, s));      // 上
        return {
            o: o, s: s, v: v, f: f,
            at: function (ls, lv, lf) {
                return [o[0] + s[0] * ls + v[0] * lv + f[0] * lf,
                o[1] + s[1] * ls + v[1] * lv + f[1] * lf,
                o[2] + s[2] * ls + v[2] * lv + f[2] * lf];
            }
        };
    }

    function face(g, a, b, c, d) { g.quad(a, b, c, d); }

    // 立ったパン粉の破片。いびつな多角形の薄板を、面から少し浮かせて傾けて置く。
    // 天ぷらの衣の「泡」と違い、パン粉は角のある板が刺さって見えるのが特徴
    function pankoFlake(g, lf, rng, hw, hl, th, cTop, cBot) {
        const K = 7;
        const first = g.idx.length;
        const curl = rng.range(-0.55, 0.55);
        const ph = rng.range(0, TAU);
        const ring = [];
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < K; i++) {
            const a = i / K * TAU + rng.pm(0.18);
            const r = rng.range(0.68, 1.30);
            const x = Math.cos(a) * hw * r;
            const y = Math.sin(a) * hl * r;
            const z = curl * (y * y) / Math.max(hl, 0.01) + 0.018 * Math.sin(a * 3 + ph);
            ring.push([x, y, z]);
            cx += x; cy += y; cz += z;
        }
        cx /= K; cy /= K; cz /= K;
        const top = [], bot = [];
        for (let i = 0; i < K; i++) {
            const p = ring[i];
            top.push(g.vert(lf.at(p[0], p[1], p[2] + th), i / K, 1, cTop));
            bot.push(g.vert(lf.at(p[0], p[1], p[2] - th), i / K, 0, cBot));
        }
        const ct = g.vert(lf.at(cx, cy, cz + th * 1.25), 0.5, 1, cTop);
        const cb = g.vert(lf.at(cx, cy, cz - th), 0.5, 0, cBot);
        for (let i = 0; i < K; i++) {
            const j = (i + 1) % K;
            g.tri(ct, top[i], top[j]);
            g.tri(cb, bot[j], bot[i]);
            g.quad(top[i], bot[i], bot[j], top[j]);
        }
        const c = lf.at(cx, cy, cz);
        g.fixFrom(first, c[0], c[1], c[2]);
    }

    // 芯線に断面を掃引して格子（位置と法線）を作る
    function sweepGrid(pts, N, NA, secFn, rollRng) {
        const W = NA + 1;
        const fr = frames(pts, N + 1);
        const roll = flatRoll(fr, N + 1, 0.90, 0.04, rollRng || new Rng(11));
        const BP = new Float64Array((N + 1) * W * 3);
        const BN = new Float64Array((N + 1) * W * 3);
        for (let i = 0; i <= N; i++) {
            const u = i / N;
            const px = pts[i * 3], py = pts[i * 3 + 1], pz = pts[i * 3 + 2];
            const ca = Math.cos(roll[i]), sa = Math.sin(roll[i]);
            for (let j = 0; j <= NA; j++) {
                const s = secFn(u, j % NA, NA);
                const ox = s[0] * ca - s[1] * sa, oy = s[0] * sa + s[1] * ca;
                const k = (i * W + j) * 3;
                BP[k] = px + fr.U[i * 3] * ox + fr.V[i * 3] * oy;
                BP[k + 1] = py + fr.U[i * 3 + 1] * ox + fr.V[i * 3 + 1] * oy;
                BP[k + 2] = pz + fr.U[i * 3 + 2] * ox + fr.V[i * 3 + 2] * oy;
            }
        }
        gridNormals(BP, BN, N, NA, pts);
        return { BP: BP, BN: BN, N: N, NA: NA, W: W, pts: pts };
    }

    function gridNormals(BP, BN, N, NA, pts) {
        const W = NA + 1;
        for (let i = 0; i <= N; i++) {
            for (let j = 0; j <= NA; j++) {
                const i0 = Math.max(0, i - 1), i1 = Math.min(N, i + 1);
                const j0 = (j - 1 + NA) % NA, j1 = (j + 1) % NA;
                const a = (i1 * W + j) * 3, b = (i0 * W + j) * 3;
                const c = (i * W + j1) * 3, d = (i * W + j0) * 3;
                const tx = BP[a] - BP[b], ty = BP[a + 1] - BP[b + 1], tz = BP[a + 2] - BP[b + 2];
                const sx = BP[c] - BP[d], sy = BP[c + 1] - BP[d + 1], sz = BP[c + 2] - BP[d + 2];
                let nx = ty * sz - tz * sy, ny = tz * sx - tx * sz, nz2 = tx * sy - ty * sx;
                const l = Math.hypot(nx, ny, nz2) || 1;
                const k = (i * W + j) * 3;
                const rx = BP[k] - pts[i * 3], ry = BP[k + 1] - pts[i * 3 + 1], rz = BP[k + 2] - pts[i * 3 + 2];
                const sgn = (nx * rx + ny * ry + nz2 * rz) < 0 ? -1 : 1;
                BN[k] = nx / l * sgn; BN[k + 1] = ny / l * sgn; BN[k + 2] = nz2 / l * sgn;
            }
        }
    }

    function emitGrid(g, gr, colFn, capA, capB) {
        const BP = gr.BP, BN = gr.BN, N = gr.N, NA = gr.NA, W = gr.W;
        const rows = [];
        for (let i = 0; i <= N; i++) {
            const u = i / N, row = [];
            for (let j = 0; j <= NA; j++) {
                const k = (i * W + j) * 3;
                row.push(g.vert([BP[k], BP[k + 1], BP[k + 2]], j / NA, u,
                    colFn(u, j / NA, [BN[k], BN[k + 1], BN[k + 2]])));
            }
            rows.push(row);
        }
        for (let i = 0; i < N; i++) {
            for (let j = 0; j < NA; j++) face(g, rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1]);
        }
        function ringMean(i) {
            let x = 0, y = 0, z = 0;
            for (let j = 0; j < NA; j++) {
                const k = (i * W + j) * 3; x += BP[k]; y += BP[k + 1]; z += BP[k + 2];
            }
            return [x / NA, y / NA, z / NA];
        }
        if (capA !== false) {
            const c0 = g.vert(ringMean(0), 0.5, 0, colFn(0, 0.5, [0, -1, 0]));
            for (let j = 0; j < NA; j++) g.tri(c0, rows[0][j], rows[0][j + 1]);
        }
        if (capB !== false) {
            const c1 = g.vert(ringMean(N), 0.5, 1, colFn(1, 0.5, [0, 1, 0]));
            for (let j = 0; j < NA; j++) g.tri(c1, rows[N][j + 1], rows[N][j]);
        }
        return rows;
    }

    function lineSpine(o, dir, len, N, bendUp, bendSide) {
        const d = vnorm(dir);
        let side = vnorm(vcross([0, 1, 0], d));
        if (vlen(vcross([0, 1, 0], d)) < 1e-4) side = [1, 0, 0];
        const up = vnorm(vcross(d, side));
        const pts = new Float64Array((N + 1) * 3);
        for (let i = 0; i <= N; i++) {
            const t = i / N, s = Math.sin(Math.PI * t);
            const bu = s * (bendUp || 0), bs = s * (bendSide || 0);
            pts[i * 3] = o[0] + d[0] * len * t + up[0] * bu + side[0] * bs;
            pts[i * 3 + 1] = o[1] + d[1] * len * t + up[1] * bu + side[1] * bs;
            pts[i * 3 + 2] = o[2] + d[2] * len * t + up[2] * bu + side[2] * bs;
        }
        return pts;
    }

    // ---- パン粉（色・テクスチャ）--------------------------------------------
    // 参考写真からパン粉の面を抜き出し、鏡面を落として輝度の分位ごとに平均した値（sRGB）
    const PANKO_PALE = [0.955, 0.790, 0.520];   // 立った破片の先。ここだけ明るい
    const PANKO_LIGHT = [0.930, 0.660, 0.330];
    const PANKO_MID = [0.830, 0.510, 0.205];   // きつね色。面積のいちばん多い色
    const PANKO_DARK = [0.620, 0.340, 0.115];   // あめ色。出っ張りと破片の際
    const PANKO_BURN = [0.400, 0.195, 0.062];   // 焦げぎわ。黒に寄せない

    const PANKO_RAMP = [lin3(PANKO_BURN), lin3(PANKO_DARK), lin3(PANKO_MID),
    lin3(PANKO_LIGHT), lin3(PANKO_PALE)];
    // t: 0 = 焦げぎわ、0.5 付近 = きつね色、1 = 立った破片の先（戻り値はリニア）
    function pankoRamp(t) {
        const x = clamp(t, 0, 1) * (PANKO_RAMP.length - 1);
        const i = Math.min(PANKO_RAMP.length - 2, Math.floor(x));
        return mix3(PANKO_RAMP[i], PANKO_RAMP[i + 1], x - i);
    }

    // パン粉の粒。高さ場を1枚作り、アルベド / ORM / 法線が同じものを参照する
    function pankoTextures(scene, seed, size) {
        const S = Math.max(256, Math.round(size) || 512), s2 = S * S;
        const nz = new PNoise(seed);
        const H = new Float32Array(s2), B = new Float32Array(s2);
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                const u = x / S * 8, v = y / S * 8;
                const a = nz.fbm2(u * 1.6, v * 1.6, 3, 13, 13);
                const b = nz.n2(u * 5.5 + 11, v * 5.5 + 5, 44, 44);
                const c = nz.fbm2(u * 14 + 3, v * 14 + 7, 2, 112, 112);
                const grain = smoothstep(0.42, 0.72, b) * (0.55 + 0.45 * a);
                const pit = smoothstep(0.62, 0.86, c);
                H[y * S + x] = clamp(0.30 + grain * 0.62 + (c - 0.5) * 0.18 - pit * 0.14, 0, 1);
                B[y * S + x] = smoothstep(0.60, 0.88, nz.fbm2(u * 0.8 + 21, v * 0.8 + 31, 2, 6, 6));
            }
        }
        const BURN = lin3(PANKO_BURN);
        const albedo = TexLab.make("pankoA", S, scene, (d) => {
            for (let k = 0; k < s2; k++) {
                const w = mix(0.80, 1.00, H[k]);
                const bn = B[k] * (1 - H[k] * 0.55) * 0.20;
                putRGB(d, k * 4,
                    w * (1 - bn * (1 - BURN[0])),
                    w * (1 - bn * (1 - BURN[1])),
                    w * (1 - bn * (1 - BURN[2])));
            }
        }, {});
        const orm = TexLab.orm("pankoO", S, scene, (x, y, SS, o) => {
            const k = y * SS + x;
            o[0] = clamp(0.92 + 0.08 * H[k], 0, 1);
            o[1] = clamp(0.30 + 0.30 * H[k], 0.15, 0.95);   // くぼみほど油がたまって滑らか
            o[2] = 0;
        }, {});
        const normal = TexLab.normalFromHeight("pankoN", S, scene, H, 0.020, {});
        return { albedo: albedo, orm: orm, normal: normal };
    }

    // ---- 千切りキャベツ -----------------------------------------------------
    // 芯に近いほど白く、葉の縁ほど緑。山の内部は見えないので殻（表面付近）にだけ置く
    const CAB_CORE = [0.938, 0.930, 0.868];
    const CAB_PALE = [0.862, 0.888, 0.665];
    const CAB_GREEN = [0.585, 0.742, 0.348];
    const CAB_DEEP = [0.392, 0.548, 0.228];

    function buildCabbage(g, rng, nz, opt) {
        // er / ef = カメラ基準の右・奥。山は横長にしたいので世界軸ではなくこの2軸で作る
        const at = opt.at, er = opt.er, ef = opt.ef;
        const rx = opt.rr, rz = opt.rf, h = opt.h;
        const CORE = lin3(CAB_CORE), PALE = lin3(CAB_PALE);
        const GREEN = lin3(CAB_GREEN), DEEP = lin3(CAB_DEEP);
        const N = 8, NA = 6;
        let tris = 0;
        for (let c = 0; c < opt.count; c++) {
            const th = rng.range(0, TAU);
            const ph = Math.acos(rng.range(0.03, 1.0));        // 上半球だけ
            const rf = rng.range(0.78, 1.02);
            const sp = Math.sin(ph), cp = Math.cos(ph);
            const X = rx * rf * sp * Math.cos(th), Z = rz * rf * sp * Math.sin(th), Y = h * rf * cp;
            const P = [at[0] + er[0] * X + ef[0] * Z, at[1] + Y, at[2] + er[2] * X + ef[2] * Z];
            const n = vnorm([er[0] * X / (rx * rx) + ef[0] * Z / (rz * rz),
            Y / (h * h),
            er[2] * X / (rx * rx) + ef[2] * Z / (rz * rz)]);
            const base = localFrame(P, n, [0, 1, 0]);
            const a = rng.range(0, TAU);
            const dir = vnorm(vadd(vadd(vmul(base.s, Math.cos(a)), vmul(base.v, Math.sin(a))),
                vmul(n, rng.range(-0.10, 0.22))));
            const len = rng.range(2.4, 5.0);
            const o = [P[0] - dir[0] * len * 0.5, P[1] - dir[1] * len * 0.5, P[2] - dir[2] * len * 0.5];
            const pts = lineSpine(o, dir, len, N, rng.pm(0.55), rng.pm(0.75));
            const RMAX = opt.rMax === undefined ? 9.6 : opt.rMax;
            for (let i = 0; i <= N; i++) {
                const rr2 = Math.hypot(pts[i * 3], pts[i * 3 + 2]);
                if (rr2 > RMAX) { const k = RMAX / rr2; pts[i * 3] *= k; pts[i * 3 + 2] *= k; }
                const fy = plateSurfaceY(pts[i * 3], pts[i * 3 + 2]) + 0.055;
                if (pts[i * 3 + 1] < fy) pts[i * 3 + 1] = fy;      // 皿にめり込ませない
            }
            const halfW = rng.range(0.065, 0.130);
            const halfT = 0.016;
            const tw0 = rng.range(0, TAU), tw1 = rng.pm(2.4);
            const gr = sweepGrid(pts, N, NA, (u, j, NAA) => {
                const ang = tw0 + tw1 * u;
                const t2 = j / NAA * TAU;
                const ca = Math.abs(Math.cos(t2)), sa = Math.abs(Math.sin(t2));
                const p = 4.5;                                  // 角の丸い長方形
                const rr = 1 / Math.pow(Math.pow(ca, p) + Math.pow(sa, p), 1 / p);
                const taper = 1 - 0.20 * Math.abs(u - 0.5) * 2;
                const x = Math.cos(t2) * rr * halfW * taper, y = Math.sin(t2) * rr * halfT;
                return [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)];
            }, new Rng(1013 + c * 37));
            const greenAt = rng.next();
            const greenAmt = Math.pow(rng.next(), 1.6);          // 大半は芯寄りの白
            const first = g.idx.length;
            emitGrid(g, gr, (u, v) => {
                const d = 1 - Math.abs(u - greenAt);
                const t = clamp((d - 0.45) / 0.55, 0, 1) * greenAmt;
                const fine = nz.fbm2(u * 7 + c, v * 3 + 1, 2, 0, 3) - 0.5;
                let col = mix3(CORE, PALE, clamp(0.35 + t * 1.3 + fine * 0.5, 0, 1));
                if (t > 0.45) col = mix3(col, GREEN, clamp((t - 0.45) / 0.55, 0, 1));
                if (t > 0.88) col = mix3(col, DEEP, clamp((t - 0.88) / 0.12, 0, 1) * 0.5);
                return col;
            });
            tris += (g.idx.length - first) / 3;
        }
        return { tris: tris };
    }

    // ---- プチトマト ---------------------------------------------------------
    const TOMATO = {
        skin: [0.762, 0.128, 0.052],
        deep: [0.545, 0.062, 0.028],
        warm: [0.852, 0.300, 0.088],
        calyx: [0.318, 0.452, 0.152],
        stem: [0.395, 0.505, 0.212]
    };

    function buildTomato(g, rng, nz, opt) {
        const at = opt.at, R = opt.r;
        const NU = 44, NV = 30;
        const SKIN = lin3(TOMATO.skin), DEEP = lin3(TOMATO.deep), WARM = lin3(TOMATO.warm);
        const CAL = lin3(TOMATO.calyx), STEM = lin3(TOMATO.stem);
        const ph = rng.range(0, 20);
        const first = g.idx.length;
        const rows = [];
        for (let i = 0; i <= NV; i++) {
            const v = i / NV, pv = v * Math.PI;
            const row = [];
            for (let j = 0; j <= NU; j++) {
                const th = (j % NU) / NU * TAU;
                const lobe = 1 + 0.016 * Math.cos(th * 5 + 0.4);        // ゆるい稜
                const wob = 1 + 0.012 * (nz.n3(Math.cos(th) * 1.4, Math.sin(th) * 1.4, v * 3) - 0.5) * 2;
                const dip = 1 - 0.13 * Math.exp(-Math.pow((pv) / 0.34, 2));   // へたの側はくぼむ
                const r = R * lobe * wob * dip;
                const x = r * Math.sin(pv) * Math.cos(th);
                const y = R * 0.88 * Math.cos(pv) * dip;
                const z = r * Math.sin(pv) * Math.sin(th);
                const up = Math.cos(pv);
                const mott = nz.fbm2(th / TAU * 6 + ph, v * 6, 3, 6, 0);
                let c = mix3(SKIN, WARM, clamp(0.25 + mott * 0.7 - up * 0.25, 0, 1));
                c = mix3(c, DEEP, clamp(0.30 + up * 0.55, 0, 1) * 0.55);   // へた寄りは濃い
                c = mix3(c, WARM, smoothstep(0.35, -0.9, up) * 0.35);      // 尻は橙寄り
                row.push(g.vert([at[0] + x, at[1] + y, at[2] + z], j / NU, v, c));
            }
            rows.push(row);
        }
        for (let i = 0; i < NV; i++) {
            for (let j = 0; j < NU; j++) face(g, rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
        }
        g.fixFrom(first, at[0], at[1], at[2]);

        // へた（5枚の萼片）と軸
        const top = [at[0], at[1] + R * 0.88 * 0.90, at[2]];
        for (let s = 0; s < 5; s++) {
            const a = s / 5 * TAU + rng.pm(0.12);
            const dir = vnorm([Math.cos(a), 0.42 + rng.pm(0.12), Math.sin(a)]);
            const lf = localFrame(top, dir, [0, 1, 0]);
            const f2 = g.idx.length;
            const NLA = 8, ring = [];
            const len = R * 0.86, wid = R * 0.20;
            for (let i = 0; i <= NLA; i++) {
                const t = i / NLA;
                const w = wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.08)), 0.7) * (1 - t * 0.55);
                const drop = -0.30 * R * t * t;                 // 先が下へ垂れる
                ring.push([g.vert(lf.at(-w, drop + 0.012 * R, len * t), 0, t, CAL),
                g.vert(lf.at(w, drop + 0.012 * R, len * t), 1, t, CAL),
                g.vert(lf.at(-w * 0.9, drop - 0.012 * R, len * t), 0, t, mix3(CAL, STEM, 0.5)),
                g.vert(lf.at(w * 0.9, drop - 0.012 * R, len * t), 1, t, mix3(CAL, STEM, 0.5))]);
            }
            for (let i = 0; i < NLA; i++) {
                const a0 = ring[i], a1 = ring[i + 1];
                face(g, a0[0], a0[1], a1[1], a1[0]);
                face(g, a0[2], a1[2], a1[3], a0[3]);
                face(g, a0[0], a1[0], a1[2], a0[2]);
                face(g, a0[1], a0[3], a1[3], a1[1]);
            }
            g.fixFrom(f2, top[0], top[1] - R * 0.2, top[2]);
        }
        {   // 軸
            const f2 = g.idx.length;
            const lf = localFrame(top, [0, 1, 0], [1, 0, 0]);
            const NC = 10, r0 = R * 0.085, ringA = [], ringB = [];
            for (let j = 0; j <= NC; j++) {
                const a = (j % NC) / NC * TAU;
                ringA.push(g.vert(lf.at(Math.cos(a) * r0, Math.sin(a) * r0, -R * 0.04), j / NC, 0, STEM));
                ringB.push(g.vert(lf.at(Math.cos(a) * r0 * 0.8, Math.sin(a) * r0 * 0.8, R * 0.30), j / NC, 1, mix3(STEM, CAL, 0.4)));
            }
            for (let j = 0; j < NC; j++) face(g, ringA[j], ringB[j], ringB[j + 1], ringA[j + 1]);
            const cap = g.vert(lf.at(0, 0, R * 0.31), 0.5, 1, STEM);
            for (let j = 0; j < NC; j++) g.tri(cap, ringB[j], ringB[j + 1]);
            g.fixFrom(f2, top[0], top[1], top[2]);
        }
        return { tris: (g.idx.length - first) / 3 };
    }

    // =================================================================
    // 4. TextureLab
    // =================================================================
    // 周期ノイズ（軸ごとに周期が違う版。木目のように一方向に伸びた模様用）
    function fbm2a(x, y, px, py, seed, oct) {
        let s = 0, a = 0.5, f = 1, n = 0;
        for (let o = 0; o < oct; o++) {
            s += a * Noise.v2(x * f, y * f, (px * f) | 0, (py * f) | 0, seed + o * 131);
            n += a; f *= 2; a *= 0.5;
        }
        return s / n;
    }

    const TextureLab = {
        _tex(name, size, fill, scene) {
            // 【対策】createImageData / DynamicTexture は整数のサイズしか受け付けない。
            //         undefined が来ると「Value is not of type 'long'」で落ちる
            size = Math.max(8, Math.round(size) || 512);
            const dt = new BABYLON.DynamicTexture(name, { width: size, height: size }, scene, true);
            named(dt, name);
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

        _normalFromHeight(name, scene, size, hf, strength) {
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

        // ---- 白磁の皿：ごく弱い釉のうねり（ゆず肌）----------------------
        glazeHeight(size, seed) {
            const h = new Float32Array(size * size);
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                const u = x / size, v = y / size;
                h[y * size + x] = Noise.fbm2(u * 24, v * 24, 24, seed, 3);
            }
            return h;
        },

        // ---- 木のテーブル（板目のオーク）--------------------------------
        woodHeight(size, seed) {
            const N = size, h = new Float32Array(N * N);
            const PLANKS = 5;
            for (let y = 0; y < N; y++) {
                const v = y / N;
                const pv = v * PLANKS, pi = Math.floor(pv), pf = pv - pi;
                for (let x = 0; x < N; x++) {
                    const u = x / N;
                    // 板ごとに木目の位置をずらす
                    const off = Noise._h2(pi, 0, seed) * 7.0;
                    const warp = fbm2a(u * 3, v * 3, 3, 3, seed + pi * 13, 3);
                    const ring = 0.5 + 0.5 * Math.sin(2 * Math.PI * (pf * 5.0 + off + warp * 2.6));
                    const fibre = fbm2a(u * 6, v * 160, 6, 160, seed + 5, 2);
                    // 板の継ぎ目
                    const gap = smooth(0.0, 0.006, pf) * smooth(0.0, 0.006, 1 - pf);
                    h[y * N + x] = clamp((0.55 + 0.25 * ring + 0.20 * fibre) * (0.35 + 0.65 * gap), 0, 1);
                }
            }
            return h;
        },
        woodAlbedo(scene, size, hf, seed) {
            const LIGHT = [0.66, 0.50, 0.35], DARK = [0.47, 0.33, 0.21];
            return this._tex("woodAlbedo", size, (d, N) => {
                const PLANKS = 5;
                for (let y = 0; y < N; y++) {
                    const pi = Math.floor(y / N * PLANKS);
                    const tone = 0.92 + 0.16 * Noise._h2(pi, 3, seed);
                    for (let x = 0; x < N; x++) {
                        const i = y * N + x, j = i * 4;
                        const h = hf[i];
                        const k = smooth(0.30, 0.95, h);
                        const c = mix3(DARK, LIGHT, k);
                        d[j] = clamp(c[0] * tone, 0, 1) * 255;
                        d[j + 1] = clamp(c[1] * tone, 0, 1) * 255;
                        d[j + 2] = clamp(c[2] * tone, 0, 1) * 255;
                        d[j + 3] = 255;
                    }
                }
            }, scene);
        },
        woodORM(scene, size, hf) {
            return this._tex("woodORM", size, (d, N) => {
                for (let i = 0, n = N * N; i < n; i++) {
                    const h = hf[i], j = i * 4;
                    // オイル仕上げ。導管（暗い所）ほど粗い
                    const rough = clamp(0.42 + 0.30 * (1 - h), 0.2, 1);
                    d[j] = (0.7 + 0.3 * h) * 255; d[j + 1] = rough * 255; d[j + 2] = 0; d[j + 3] = 255;
                }
            }, scene);
        }
    };

    // =================================================================
    //  マテリアル一式（シーンで1回だけ作る。盛り直しでは作り直さない）
    // =================================================================
    class Materials {
        constructor(scene, cfg) {
            // ---- 衣（パン粉）+ 断面（中身）。エビフライの pankoMat をそのまま流用
            //      実色は頂点カラー（pankoRamp）。テクスチャは粒の明暗・粗さ・法線だけ
            this.pankoTex = pankoTextures(scene, START_SEED ^ 0x5AC1, cfg.crustSize);
            for (const t of [this.pankoTex.albedo, this.pankoTex.orm, this.pankoTex.normal]) {
                t.uScale = cfg.uvTile; t.vScale = cfg.uvTile;
            }
            const k = named(new BABYLON.PBRMaterial("pankoMat", scene), "pankoMat");
            k.albedoColor = new BABYLON.Color3(1, 1, 1);
            k.albedoTexture = this.pankoTex.albedo;
            k.bumpTexture = this.pankoTex.normal;
            k.metallicTexture = this.pankoTex.orm;
            k.useAmbientOcclusionFromMetallicTextureRed = true;
            k.useRoughnessFromMetallicTextureGreen = true;
            k.useMetallnessFromMetallicTextureBlue = true;
            k.metallic = 0.0; k.roughness = 1.0;
            k.bumpTexture.level = 0.62;
            // 油の照り。均一だと濡れたプラスチックになるので控えめに、粗さで散らす
            k.clearCoat.isEnabled = true;
            k.clearCoat.intensity = 0.38;
            k.clearCoat.roughness = 0.30;
            k.clearCoat.indexOfRefraction = 1.47;
            k.subSurface.isTranslucencyEnabled = true;
            k.subSurface.translucencyIntensity = 0.13;
            k.subSurface.tintColor = new BABYLON.Color3(s2l(0.99), s2l(0.80), s2l(0.48));
            k.subSurface.minimumThickness = 0.02;
            k.subSurface.maximumThickness = 0.40;
            this.korokke = k;

            // ---- ソース（とんかつソース）
            const s = named(new BABYLON.PBRMaterial("sauce", scene), "sauce");
            s.albedoColor = new BABYLON.Color3(srgb(0.20), srgb(0.075), srgb(0.035));
            s.metallic = 0.0;
            s.roughness = 0.22;
            s.clearCoat.isEnabled = true;
            s.clearCoat.intensity = 1.0;
            s.clearCoat.roughness = 0.05;
            s.clearCoat.indexOfRefraction = 1.45;
            this.sauce = s;

            // ---- 千切りキャベツ（エビフライの cabMat）
            const c = named(new BABYLON.PBRMaterial("cabMat", scene), "cabMat");
            c.albedoColor = new BABYLON.Color3(1, 1, 1);
            c.metallic = 0; c.roughness = 0.44;
            c.backFaceCulling = false;
            c.twoSidedLighting = true;
            c.clearCoat.isEnabled = true;
            c.clearCoat.intensity = 0.30;
            c.clearCoat.roughness = 0.22;
            c.subSurface.isTranslucencyEnabled = true;
            c.subSurface.translucencyIntensity = 0.40;   // 薄い葉は光を透かす
            c.subSurface.tintColor = new BABYLON.Color3(s2l(0.72), s2l(0.86), s2l(0.48));
            c.subSurface.minimumThickness = 0.01;
            c.subSurface.maximumThickness = 0.06;
            this.cabbage = c;

            // ---- プチトマト（エビフライの tomatoMat）
            const t = named(new BABYLON.PBRMaterial("tomatoMat", scene), "tomatoMat");
            t.albedoColor = new BABYLON.Color3(1, 1, 1);
            t.metallic = 0; t.roughness = 0.22;
            t.clearCoat.isEnabled = true;
            t.clearCoat.intensity = 0.92;
            t.clearCoat.roughness = 0.055;
            t.clearCoat.indexOfRefraction = 1.45;
            t.subSurface.isTranslucencyEnabled = true;
            t.subSurface.translucencyIntensity = 0.22;
            t.subSurface.tintColor = new BABYLON.Color3(s2l(0.90), s2l(0.22), s2l(0.10));
            t.subSurface.minimumThickness = 0.08;
            t.subSurface.maximumThickness = 0.90;
            this.tomato = t;

            // ---- 皿（白磁）。実色は頂点カラー
            const gh = TextureLab.glazeHeight(256, 55);
            this.glazeNormal = TextureLab._normalFromHeight("glazeNormal", scene, 256, gh, 0.9);
            // 皿の UV は revolve 側で (10, 3) 倍に刻んである。ここで重ねて掛けない
            const p = named(new BABYLON.PBRMaterial("plate", scene), "plate");
            p.albedoColor = new BABYLON.Color3(1, 1, 1);
            p.metallic = 0.0;
            p.roughness = 0.30;                     // 素地（釉の下）
            p.bumpTexture = this.glazeNormal;
            p.bumpTexture.level = 0.25;
            // 釉のガラス層。鏡面はこちらが担う
            p.clearCoat.isEnabled = true;
            p.clearCoat.intensity = 1.0;
            p.clearCoat.roughness = 0.05;
            p.clearCoat.indexOfRefraction = 1.52;
            this.plate = p;

            // ---- テーブル（木）
            const WS = cfg.woodSize;
            const wh = TextureLab.woodHeight(WS, 77);
            this.woodAlbedo = TextureLab.woodAlbedo(scene, WS, wh, 77);
            this.woodORM = TextureLab.woodORM(scene, WS, wh);
            this.woodNormal = TextureLab._normalFromHeight("woodNormal", scene, WS, wh, 1.4);
            for (const tx of [this.woodAlbedo, this.woodORM, this.woodNormal]) { tx.uScale = 1.6; tx.vScale = 1.6; }
            const w = named(new BABYLON.PBRMaterial("wood", scene), "wood");
            w.albedoTexture = this.woodAlbedo;
            w.metallic = 0.0;
            w.roughness = 1.0;
            w.metallicTexture = this.woodORM;
            w.useAmbientOcclusionFromMetallicTextureRed = true;
            w.useRoughnessFromMetallicTextureGreen = true;
            w.useMetallnessFromMetallicTextureBlue = true;
            w.bumpTexture = this.woodNormal;
            w.bumpTexture.level = 0.5;
            this.wood = w;
        }
    }

    // =================================================================
    // 5. Korokke
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

    // 揚げ色はエビフライの PANKO_* / pankoRamp（3b 流用）をそのまま使う
    // 断面
    const FILL_EDGE = [0.92, 0.76, 0.44];    // 衣のすぐ内側。火が通って黄色い
    const POTATO = [0.93, 0.84, 0.64];       // マッシュしたじゃがいも
    const POTATO_B = [0.88, 0.77, 0.56];
    const MEAT = [0.62, 0.43, 0.30];         // ひき肉（灰色に寄せると生焼けに見える）
    const ONION = [0.95, 0.89, 0.68];        // 玉ねぎ（少し透ける）

    class Korokke {
        // cut: null（丸ごと）/ { c: 切断面の x, side: +1 で x<=c を残す, -1 で x>=c を残す }
        constructor(scene, cfg, seed, mats, cut) {
            const rng = new Rng(seed);
            this.cfg = cfg;
            this.cut = cut || null;
            this.a = cfg.croqLength * 0.5 * rng.range(0.94, 1.06);
            this.b = cfg.croqWidth * 0.5 * rng.range(0.93, 1.05);
            this.cT = cfg.croqThickTop * rng.range(0.92, 1.08);
            this.cB = cfg.croqThickBot * rng.range(0.94, 1.06);
            // 上面は丸み（小さい指数）、底は平ら寄り（大きい指数）
            this.mT = rng.range(2.2, 2.6);
            this.mB = rng.range(3.4, 4.0);
            this.egg = rng.range(-0.05, 0.05);  // 片側がわずかに太い（手で丸めた形）
            this.nseed = rng.int(900000) + 1000;
            this.pnz = new PNoise(this.nseed ^ 0x2F71);      // 衣の式（エビフライと同じノイズ）
            // 1個ごとの揚げ色の差。同じ色だと量産品に見える（エビフライと同じ幅）
            this.tone = rng.pm(0.11);
            this.flakeSeed = rng.int(900000) + 7;
            this.mesh = this._build(scene, cfg, mats);
        }

        // 滑らかな芯の形（パン粉を付ける前のタネ）。方向 → 中心からの距離
        // 【対策】楕円体から出発すると、どうノイズを足しても「揚げたパン」になる。
        //         小判型は「上が丘・側面が丸い・底が平ら」の超楕円体。
        //         上下で指数を変え、境目は ny で滑らかに補間して稜線を作らない
        _base(nx, ny, nz) {
            const k = smooth(-0.3, 0.3, ny);
            const c = mix(this.cB, this.cT, k), m = mix(this.mB, this.mT, k);
            const A = Math.hypot(nx / this.a, nz / this.b), B = Math.abs(ny) / c;
            let t0 = Math.pow(Math.pow(A, m) + Math.pow(B, m), -1 / m);
            // 手でまとめた歪み（方向空間の低周波。凸性を崩さない程度に弱く）
            const lump = Noise.fbm3(nx * 1.1 + 13.1, ny * 1.1 + 4.7, nz * 1.1 + 8.3, this.nseed, 3) - 0.5;
            t0 *= 1 + 0.06 * lump + this.egg * nx;
            return t0;
        }

        // 表示面（パン粉つき）。out.r = 方向に沿った距離、out.ct = 揚げ色（pankoRamp の t）
        // 【流用】衣の厚みと色はエビフライの式そのもの。厚みを多帯域ノイズで決め、
        //         その厚みから色を決める（色を形と相関させる）
        _surface(nx, ny, nz, out) {
            const nzz = this.pnz;
            const t0 = this._base(nx, ny, nz);
            const x = nx * t0, y = ny * t0, z = nz * t0;          // cm
            // タネの凸凹（じゃがいもをまとめたうねり）
            const mash = Noise.fbm3(x * 0.75 + 3.1, y * 0.75 + 7.3, z * 0.75 + 1.9, this.nseed + 3, 2) - 0.5;
            const lowA = nzz.fbm3(x * 0.55, y * 0.55, z * 0.55, 3) - 0.5;          // 衣全体のうねり
            const lowB = nzz.fbm3(x * 1.25 + 7, y * 1.25, z * 1.25, 3) - 0.5;      // 大きな塊
            const cl = smoothstep(0.50, 0.78, nzz.fbm3(x * 2.8 + 3, y * 2.8, z * 2.8, 2)); // パン粉のダマ
            const hi = (nzz.fbm3(x * 6.6 + 11, y * 6.6, z * 6.6, 2) - 0.5) * (0.30 + 0.70 * cl);
            const crk = 1 - smoothstep(0, 0.050,
                Math.abs(nzz.fbm3(x * 1.9 + 21, y * 1.9, z * 1.9, 2) - 0.5));  // 衣の裂け目
            const bump = lowA * 0.95 + lowB * 0.62 + cl * 0.50 + hi * 0.50 - crk * 0.42;
            // 底は皿（揚げ鍋の底）に押されて衣が薄い
            const bottom = mix(0.55, 1.0, smooth(-0.95, -0.55, ny));
            const kt = (this.cfg.panko * (1 + bump) + 0.020) * bottom;
            out.r = t0 + 0.06 * mash + kt;
            out.base = t0;
            out.kt = kt;
            // 出っ張った破片は光を拾って明るく、谷は油がたまって濃い
            out.ct = clamp(0.46 + bump * 0.60 + cl * 0.14 - crk * 0.18 + this.tone, 0, 1);
            return out;
        }

        _crustColor(S, out) {
            const c = pankoRamp(S.ct);          // リニア
            out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
            return out;
        }

        // 断面の色。d = 断面の縁からの距離（cm）、p = 断面上の点
        _fillColor(d, px, py, pz, out) {
            const s = this.nseed, N = Noise;
            let c;
            // 縁：衣の層。外側ほど濃い（エビフライの揚げ色ランプ。リニア値なのでそのまま返す）
            if (d < 0.14) {
                const l = mix3(pankoRamp(0.40 + this.tone), pankoRamp(0.66 + this.tone), smooth(0.0, 0.14, d));
                out[0] = l[0]; out[1] = l[1]; out[2] = l[2];
                return out;
            } else {
                const v = N.fbm3(px * 1.4 + 3, py * 1.4 + 5, pz * 1.4 + 7, s + 41, 3);
                c = mix3(POTATO, POTATO_B, smooth(0.35, 0.70, v));
                // ひき肉のそぼろ。細かい粒が固まって散る
                // 【対策】低い周波数で閾値を切ると、そぼろではなく「シミ」になる
                const m = N.fbm3(px * 5.2 + 1.7, py * 5.2 + 8.1, pz * 5.2 + 4.2, s + 43, 2);
                const clus = N.v3(px * 1.1 + 3.3, py * 1.1, pz * 1.1 + 6.1, s + 45);
                const meat = smooth(0.60, 0.68, m + 0.10 * (clus - 0.5));
                c = mix3(c, MEAT, meat * 0.85);
                // 玉ねぎのみじん切り：明るく少し黄色い
                const o = N.v3(px * 3.6 + 9.2, py * 3.6 + 2.4, pz * 3.6 + 6.6, s + 47);
                c = mix3(c, ONION, smooth(0.74, 0.84, o) * (1 - meat));
                // 衣のすぐ内側は火が通って黄色い
                c = mix3(FILL_EDGE, c, smooth(0.14, 0.42, d));
            }
            out[0] = srgb(c[0]); out[1] = srgb(c[1]); out[2] = srgb(c[2]);
            return out;
        }

        // 断面の点 (c, y, z) がタネの縁からどれだけ内側か（cm）
        // G(q) = |q| - t0(q/|q|) の平面内の勾配で符号付き距離を近似する
        _depthInSection(x, y, z) {
            const G = (yy, zz) => {
                const l = Math.hypot(x, yy, zz) || 1e-6;
                return l - this._base(x / l, yy / l, zz / l);
            };
            const e = 0.02;
            const g0 = G(y, z);
            const gy = (G(y + e, z) - g0) / e, gz = (G(y, z + e) - g0) / e;
            return Math.max(0, -g0 / Math.max(0.2, Math.hypot(gy, gz)));
        }

        _geometry(res) {
            const vpf = (res + 1) * (res + 1), total = 6 * vpf;
            const positions = new Float32Array(total * 3);
            const uvs = new Float32Array(total * 2);
            const colors = new Float32Array(total * 4);
            const kts = new Float32Array(total);        // 衣の厚み（立ったパン粉の配置に使う）
            const crust = new Uint8Array(total);        // 1 = 衣の面（断面ではない）
            const indices = [];
            const S = { r: 1, base: 1, kt: 0, ct: 0 }, C = [0, 0, 0];
            const cut = this.cut;
            let cutVerts = 0;

            for (let f = 0; f < 6; f++) {
                const F = QUAD_FACE[f], base = f * vpf;
                const cx = F.u[1] * F.v[2] - F.u[2] * F.v[1];
                const cy = F.u[2] * F.v[0] - F.u[0] * F.v[2];
                const cz = F.u[0] * F.v[1] - F.u[1] * F.v[0];
                const hand = (cx * F.n[0] + cy * F.n[1] + cz * F.n[2]) > 0;
                for (let j = 0; j <= res; j++) {
                    // 【対策】等間隔の格子を球へ投影すると面の中央が粗く角が密になる。
                    //         tan で刻み直して角度的に等間隔にする
                    const b = Math.tan((-1 + 2 * j / res) * Math.PI / 4);
                    for (let i = 0; i <= res; i++) {
                        const a = Math.tan((-1 + 2 * i / res) * Math.PI / 4);
                        let x = F.n[0] + F.u[0] * a + F.v[0] * b;
                        let y = F.n[1] + F.u[1] * a + F.v[1] * b;
                        let z = F.n[2] + F.u[2] * a + F.v[2] * b;
                        const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l;
                        this._surface(x, y, z, S);
                        const k = base + j * (res + 1) + i;
                        let px = x * S.r, py = y * S.r, pz = z * S.r;
                        const bx = x * S.base, by = y * S.base, bz = z * S.base;
                        let beyond = false;
                        if (cut && cut.side * (bx - cut.c) > 0) {
                            // 【対策】断面を別メッシュにすると、外周の式の食い違いで隙間が開き、
                            //         巻き順も部品ごとに割れる（レモンで踏んだ失敗）。
                            //         切断面の向こう側の頂点を平面へ押しつぶして1メッシュのまま閉じる。
                            //         押しつぶす (y, z) はパン粉を含まない「タネ」の点から取る。
                            //         タネはほぼ凸なので x 方向の射影が単射になり、断面が折り返さない
                            //         （パン粉つきの点を射影すると凸凹で面が裏返って重なる）
                            beyond = true; cutVerts++;
                            const N = Noise, s = this.nseed;
                            // 割った断面は包丁で切った面ではなく、ぼそぼそに崩れている
                            const rough = 0.20 * (N.fbm3(bx * 1.6 + 4.1, by * 1.6 + 8.8, bz * 1.6 + 2.6, s + 51, 3) - 0.5)
                                + 0.08 * (N.v3(bx * 4.5, by * 4.5, bz * 4.5, s + 53) - 0.5);
                            const d = this._depthInSection(cut.c, by, bz);
                            // 縁では 0 に落として、衣の層との段差を作らない
                            const dx = rough * smooth(0.05, 0.6, d) + 0.03;
                            px = cut.c + cut.side * dx; py = by; pz = bz;
                            this._fillColor(d, px, py, pz, C);
                        } else {
                            this._crustColor(S, C);
                            crust[k] = 1; kts[k] = S.kt;
                        }
                        positions[k * 3] = px; positions[k * 3 + 1] = py; positions[k * 3 + 2] = pz;
                        uvs[k * 2] = i / res; uvs[k * 2 + 1] = j / res;
                        colors[k * 4] = C[0]; colors[k * 4 + 1] = C[1];
                        colors[k * 4 + 2] = C[2]; colors[k * 4 + 3] = 1;
                    }
                }
                for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
                    const A = base + j * (res + 1) + i, B = A + 1, Cc = A + res + 1, D = Cc + 1;
                    if (hand) indices.push(A, Cc, B, B, Cc, D);
                    else indices.push(A, B, Cc, B, D, Cc);
                }
            }
            this.cutVerts = cutVerts;
            let minY = Infinity;
            for (let i = 1; i < positions.length; i += 3) minY = Math.min(minY, positions[i]);
            this.minY = minY;                         // 接地面（ローカル）
            return { positions, indices, uvs, colors, kts, crust };
        }

        _build(scene, cfg, mats) {
            const g = this._geometry(cfg.croqRes);
            // 割った半分も閉じた立体のまま → 体積で巻き順を判定できる
            const normals = finalize(g.positions, g.indices, null);
            // 【対策】キューブ球は面の境界で頂点が重複する。溶接しないと十字の筋が出る
            weldNormals(g.positions, normals);
            const mesh = makeMesh(this.cut ? "korokkeHalf" : "korokke", scene,
                g.positions, g.indices, normals, g.uvs, g.colors);
            mesh.material = mats.korokke;
            mesh.receiveShadows = true;
            this.flakes = this._flakes(scene, cfg, mats, g, normals, mesh);
            return mesh;
        }

        // ---- 立ったパン粉（エビフライの pankoFlake をそのまま使う）----
        // 面から拾った法線を少し傾けて、角のある薄板を刺す。これがパン粉らしさの主成分。
        // 【対策】キューブ球の頂点から拾うと、扁平な形では面ごとの密度が偏る
        //         （上面は疎、側面は密）。衣の三角形を面積で重み付けして選ぶ
        _flakes(scene, cfg, mats, g, normals, parent) {
            const P = g.positions, I = g.indices, cut = this.cut;
            const tris = [], cum = [];
            let area = 0;
            for (let t = 0; t < I.length; t += 3) {
                const a = I[t], b = I[t + 1], c = I[t + 2];
                if (!g.crust[a] || !g.crust[b] || !g.crust[c]) continue;
                const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
                const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
                area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
                tris.push(t); cum.push(area);
            }
            const rng = new Rng(this.flakeSeed);
            const gF = new Geo();
            const th0 = cfg.panko;
            const NF = Math.round(area * cfg.pankoDensity);
            for (let f = 0; f < NF; f++) {
                // 面積の累積から三角形を二分探索し、重心座標で点を取る
                const r = rng.next() * area;
                let lo = 0, hi = cum.length - 1;
                while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < r) lo = m + 1; else hi = m; }
                const t = tris[lo];
                let w1 = rng.next(), w2 = rng.next();
                if (w1 + w2 > 1) { w1 = 1 - w1; w2 = 1 - w2; }
                const w0 = 1 - w1 - w2;
                const ia = I[t], ib = I[t + 1], ic = I[t + 2];
                const kt = w0 * g.kts[ia] + w1 * g.kts[ib] + w2 * g.kts[ic];
                if (kt < th0 * 0.42) continue;
                const n = vnorm([
                    w0 * normals[ia * 3] + w1 * normals[ib * 3] + w2 * normals[ic * 3],
                    w0 * normals[ia * 3 + 1] + w1 * normals[ib * 3 + 1] + w2 * normals[ic * 3 + 1],
                    w0 * normals[ia * 3 + 2] + w1 * normals[ib * 3 + 2] + w2 * normals[ic * 3 + 2]]);
                if (n[1] < -0.45) continue;                  // 皿に接する裏側は省く
                const p = [0, 1, 2].map((q) => w0 * P[ia * 3 + q] + w1 * P[ib * 3 + q] + w2 * P[ic * 3 + q]);
                // 割った断面の近くには刺さない（断面を突き破って見える）
                if (cut && cut.side * (p[0] - cut.c) > -0.30) continue;
                if (p[1] < this.minY + 0.16) continue;
                const c = [p[0] - n[0] * kt * 0.08, p[1] - n[1] * kt * 0.08, p[2] - n[2] * kt * 0.08];
                // 接線方向へ倒して、片側の角が浮くようにする
                const tanA = rng.range(0, TAU), tilt = rng.range(0.15, 0.85);
                const base = localFrame(c, n, [0, 1, 0]);
                const dir = vnorm(vadd(n, vadd(vmul(base.s, Math.cos(tanA) * tilt),
                    vmul(base.v, Math.sin(tanA) * tilt))));
                const lf = localFrame(c, dir, [0, 1, 0]);
                const big = rng.next() < 0.14;               // 1割は大きくはねた破片
                const hl = rng.range(0.13, big ? 0.40 : 0.26);
                const hw = hl * rng.range(0.42, 0.85);
                const cTop = pankoRamp(clamp(rng.range(0.64, 0.96) + this.tone, 0, 1));
                const cBot = pankoRamp(clamp(rng.range(0.26, 0.50) + this.tone, 0, 1));
                pankoFlake(gF, lf, rng, hw, hl, rng.range(0.022, 0.040), cTop, cBot);
            }
            if (!gF.idx.length) return null;
            const m = toMesh("pankoFlakes", gF.finish(), scene);
            m.material = mats.korokke;
            m.receiveShadows = true;
            m.parent = parent;
            return m;
        }

        // ローカル座標 (x, z) の真上から下ろした線が表面に当たる高さ。外れたら null
        topY(x, z) {
            const S = { r: 1, base: 1, kt: 0, ct: 0 };
            const inside = (y) => {
                const l = Math.hypot(x, y, z) || 1e-6;
                this._surface(x / l, y / l, z / l, S);
                return l < S.r;
            };
            let y = this.cT + 0.8, prev = y;
            const step = 0.05, floor = -this.cB - 0.5;
            while (y > floor) {
                if (inside(y)) {
                    let lo = y, hi = prev;          // lo は内側、hi は外側
                    for (let it = 0; it < 7; it++) {
                        const m = (lo + hi) * 0.5;
                        if (inside(m)) lo = m; else hi = m;
                    }
                    return hi;
                }
                prev = y; y -= step;
            }
            return null;
        }
    }

    // =================================================================
    // 6. Sauce（とんかつソース）
    // =================================================================
    // 【対策】ソースを板や円柱で置くと「乗っている」感じが出ない。
    //         コロッケ自身の形状関数に上から線を下ろして表面の高さを取り、
    //         そこに厚みを足して沿わせる（パン粉の凸凹を拾うので、先端が
    //         ソースから少し頭を出す＝実物どおり）。端から外れた所は皿に落ちて溜まる。
    //         メッシュはコロッケの子にするので、コロッケの向きに依存しない
    function buildSauce(scene, k, seed, mats) {
        const rng = new Rng(seed);
        const NS = 120, NW = 18;
        const s0 = -k.a * rng.range(0.45, 0.65), s1 = k.a * rng.range(1.22, 1.38);
        const z0 = rng.range(-0.15, 0.15) * k.b;
        const wav = rng.range(0.10, 0.25) * k.b, ph = rng.range(0, 6.28);
        const ns = rng.int(90000);
        const floorY = k.minY + 0.005;
        const pts = [], cols = [];
        const C = [1, 1, 1];
        let offAt = null;                                   // 中心線が縁を越えた位置
        for (let i = 0; i <= NS; i++) {
            const u = i / NS, x = mix(s0, s1, u);
            const zc = z0 + wav * Math.sin(u * 3.0 + ph);
            const onTop = k.topY(x, zc) !== null;
            if (!onTop && offAt === null && u > 0.3) offAt = x;
            // 皿に落ちた先で広がって溜まる
            const beyond = offAt === null ? 0 : x - offAt;
            let hw = (0.95 + 0.30 * (Noise.v3(x * 0.9, 0.5, 0.5, ns) - 0.5)) * mix(1, 1.8, smooth(0, 1.2, beyond));
            // 両端は丸く閉じる
            const taper = Math.sqrt(Math.max(0.002, smooth(0, 0.10, u) * smooth(0, 0.09, 1 - u)));
            hw *= taper;
            const T = mix(0.20, 0.11, smooth(0, 0.8, beyond)) * mix(0.3, 1, taper);
            for (let j = 0; j <= NW; j++) {
                const wv = -1 + 2 * j / NW;
                // 幅方向は中央が厚い。縁はごく薄く残して表面との z-fight を避ける
                const z = zc + wv * hw;
                let y = k.topY(x, z);
                if (y === null) y = floorY;
                const th = T * Math.pow(Math.max(0, 1 - wv * wv), 0.55) + 0.018;
                pts.push(new V3(x, y + th, z));
                cols.push(C);
            }
        }
        // 開いた面なので、はるか下の点からの向きで表裏を決める
        const mesh = gridMesh("sauce", pts, cols, NS, NW, new V3(0, -30, 0), scene);
        mesh.material = mats.sauce;
        mesh.receiveShadows = true;
        mesh.parent = k.mesh;
        return mesh;
    }

    // =================================================================
    // 7. Tableware
    // =================================================================
    // 白い丸皿の内側プロファイル（盛り付けの接地計算にも使う）
    const PLATE_INNER = [
        [0.004, 0.62], [3.0, 0.60], [6.0, 0.62], [8.4, 0.70], [9.3, 0.84],
        [10.0, 1.06], [10.7, 1.32], [11.6, 1.56], [12.5, 1.74], [13.05, 1.84]
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
    // 流用したキャベツ・トマトが呼ぶ名前
    const plateSurfaceY = (x, z) => plateInnerY(Math.hypot(x, z));

    function buildPlate(scene, cfg, mats) {
        const prof = [];
        for (const p of PLATE_INNER) prof.push({ r: p[0], y: p[1], glaze: 1 });
        // 縁は丸めて玉縁にする（角があるとハイライトが途切れる）
        prof.push({ r: 13.24, y: 1.83, glaze: 1 });
        prof.push({ r: cfg.plateOuterR, y: 1.76, glaze: 1 });
        prof.push({ r: 13.26, y: 1.66, glaze: 1 });
        const outer = [[13.05, 1.58], [12.2, 1.42], [10.8, 1.12], [9.6, 0.80],
        [8.4, 0.48], [7.6, 0.30], [7.3, 0.14]];
        for (const p of outer) prof.push({ r: p[0], y: p[1], glaze: 1 });
        // 高台（畳付きは釉を剥いで素地が出る）
        prof.push({ r: 7.2, y: 0.0, glaze: 0 });
        prof.push({ r: 6.75, y: 0.0, glaze: 0 });
        prof.push({ r: 6.62, y: 0.14, glaze: 1 });
        prof.push({ r: 4.0, y: 0.20, glaze: 1 });
        prof.push({ r: 0.004, y: 0.22, glaze: 1 });

        // 白磁。真っ白（1.0）にすると照明で飛んで形が読めない。
        // 実物の白磁の反射率は 0.8 前後 → sRGB 0.92 あたり。わずかに青白い
        const GLAZE = [0.915, 0.918, 0.905];
        const BISQUE = [0.84, 0.80, 0.74];
        const mesh = revolve("plate", prof, cfg.plateSeg, scene, {
            uScale: 10, vScale: 3, wobble: 0.0025,
            colorFn: (i, ang, p) => {
                const m = 0.985 + 0.02 * Noise.fbm3(Math.cos(ang) * 3, Math.sin(ang) * 3, i * 0.3, 5150, 2);
                const c = p.glaze ? GLAZE : BISQUE;
                return [srgb(c[0] * m), srgb(c[1] * m), srgb(c[2] * m)];
            }
        });
        mesh.material = mats.plate;
        mesh.receiveShadows = true;
        return mesh;
    }

    function buildTable(scene, mats) {
        const g = BABYLON.MeshBuilder.CreateGround("table", { width: 240, height: 240, subdivisions: 2 }, scene);
        named(g, "table");
        g.material = mats.wood;
        g.receiveShadows = true;
        g.position.y = -0.002;
        return g;
    }

    // =================================================================
    // 10. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.86, 0.84, 0.81, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    // 【対策】反射をぼかしすぎると、ハイライトのコントラストが消えて
    //         「艶消しの何か」になる。皿の釉と油の照りは環境の明暗が映って初めて出る
    env.lodGenerationOffset = 0.20;
    scene.environmentIntensity = 0.95;

    const camera = new BABYLON.ArcRotateCamera("cam", -1.92, 0.88, 44, new V3(0.6, 1.8, 0.4), scene);
    named(camera, "cam");
    camera.attachControl(true);
    camera.fov = 0.60;
    camera.wheelPrecision = 8;
    camera.minZ = 0.1;
    // 【対策】既定の maxZ = 10000 のままだと、40cm 前後の被写体の深度が
    //         0.004 付近に潰れて量子化され、被写界深度がまったく効かない
    camera.maxZ = 400;
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 160;
    camera.lowerBetaLimit = 0.05;
    camera.upperBetaLimit = 1.50;
    scene.cameraToUseForPointers = camera;

    // 大きめのソフトボックスを左上後方から。料理写真の基本形
    const key = new BABYLON.DirectionalLight("key", new V3(-0.42, -1.0, 0.62).normalize(), scene);
    named(key, "key");
    key.position = new V3(22, 40, -30);
    key.intensity = 2.8;
    key.diffuse = new BABYLON.Color3(1.0, 0.985, 0.955);
    key.specular = new BABYLON.Color3(0.95, 0.92, 0.87);
    key.autoCalcShadowZBounds = true;

    const fillL = new BABYLON.DirectionalLight("fillL", new V3(0.85, -0.35, -0.5).normalize(), scene);
    named(fillL, "fillL");
    fillL.intensity = 0.85;
    fillL.diffuse = new BABYLON.Color3(1.0, 0.96, 0.92);
    fillL.specular = new BABYLON.Color3(0.18, 0.17, 0.16);

    // 【対策】平行光源のハイライトは1点しか出ない。拡散をほぼ切って
    //         鏡面だけを足す光源をもう1灯まわし、パン粉の破片の縁に照りを散らす
    const kick = new BABYLON.DirectionalLight("kick", new V3(-0.28, -0.80, -0.95).normalize(), scene);
    named(kick, "kick");
    kick.intensity = 1.4;
    kick.diffuse = new BABYLON.Color3(0.06, 0.06, 0.06);
    kick.specular = new BABYLON.Color3(1.0, 0.95, 0.88);

    const amb = new BABYLON.HemisphericLight("amb", new V3(0, 1, 0), scene);
    named(amb, "amb");
    amb.intensity = 0.22;
    amb.diffuse = new BABYLON.Color3(1, 0.98, 0.96);
    amb.groundColor = new BABYLON.Color3(0.40, 0.34, 0.28);
    amb.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.useBlurExponentialShadowMap = true;
    sg.blurKernel = 32;
    sg.depthScale = 40;
    sg.darkness = 0.34;

    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
    // 【対策】白磁の皿は露出を上げるとすぐ飛ぶ。唐揚げ（黒皿）の 1.22 より下げる
    ip.exposure = 1.08;
    ip.contrast = 1.18;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.1;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    const mats = new Materials(scene, CFG);
    const tableMesh = buildTable(scene, mats);
    const plateMesh = buildPlate(scene, CFG, mats);

    // ---- 盛り付け（解析的な配置）------------------------------------
    // 【方針】コロッケは積まずに並べるだけなので、物理で落とすより
    //         「足跡（円の集まり）が重ならない位置へ押し出す」ほうが確実で速い。
    //         割った断面はカメラへ向けたいので、向きを物理に任せない
    const PLATE_FLAT_R = 9.2;          // 見込み（平らな所）の半径
    let food = [];                      // 破棄対象のメッシュ
    let pieces = [];                    // { mesh, circles: [{x,z,r}] ワールド }
    let stats = { verts: 0, ms: 0 };

    function worldCircles(mesh, local) {
        mesh.computeWorldMatrix(true);
        const M = mesh.getWorldMatrix(), out = [];
        for (const c of local) {
            const p = V3.TransformCoordinates(new V3(c.x, 0, c.z), M);
            out.push({ x: p.x, z: p.z, r: c.r });
        }
        return out;
    }

    function overlap(A, B, slack) {
        let worst = 0, dx = 0, dz = 0;
        for (const a of A) for (const b of B) {
            const d = Math.hypot(a.x - b.x, a.z - b.z);
            const o = a.r + b.r - slack - d;
            if (o > worst) { worst = o; dx = a.x - b.x; dz = a.z - b.z; }
        }
        return { o: worst, dx, dz };
    }

    // 接地：足跡の下の皿の高さの最大に、メッシュの最下点を合わせる
    function settle(mesh, circles, sink) {
        mesh.computeWorldMatrix(true);
        const bb = mesh.getBoundingInfo().boundingBox;
        let floor = 0;
        for (const c of circles) floor = Math.max(floor, plateInnerY(Math.hypot(c.x, c.z) + c.r * 0.5));
        mesh.position.y += floor - bb.minimumWorld.y - (sink || 0);
        mesh.computeWorldMatrix(true);
    }

    // 位置と向きを決め、既存の物と重ならない所まで押し出す
    function place(mesh, local, x, z, q, obstacles, slack) {
        mesh.rotationQuaternion = q;
        mesh.position.set(x, 0, z);
        let circ = worldCircles(mesh, local);
        for (let it = 0; it < 60; it++) {
            let moved = false;
            for (const ob of obstacles) {
                const r = overlap(circ, ob.circles, ob.slack !== undefined ? ob.slack : slack);
                if (r.o > 0) {
                    const l = Math.hypot(r.dx, r.dz) || 1;
                    mesh.position.x += r.dx / l * Math.min(0.4, r.o + 0.02);
                    mesh.position.z += r.dz / l * Math.min(0.4, r.o + 0.02);
                    moved = true;
                }
            }
            // 皿の見込みからはみ出さない
            for (const c of circ) {
                const rr = Math.hypot(c.x, c.z) + c.r;
                if (rr > PLATE_FLAT_R + 1.2) {
                    const k = (rr - PLATE_FLAT_R - 1.2) / Math.max(1e-3, Math.hypot(c.x, c.z));
                    mesh.position.x -= c.x * Math.min(0.08, k);
                    mesh.position.z -= c.z * Math.min(0.08, k);
                    moved = true;
                }
            }
            circ = worldCircles(mesh, local);
            if (!moved) break;
        }
        return circ;
    }

    function clearFood() {
        // 子（立ったパン粉・ソース）を先に破棄する。親を先に消すと子が二重に破棄される
        for (let i = food.length - 1; i >= 0; i--) if (!food[i].isDisposed()) food[i].dispose();
        food = []; pieces = [];
    }

    function yawQ(yaw, pitch, roll) {
        return BABYLON.Quaternion.FromEulerAngles(pitch || 0, yaw, roll || 0);
    }

    function build(seed) {
        const t0 = performance.now();
        clearFood();
        const rng = new Rng(seed >>> 0);
        const obstacles = [];

        // カメラ基準の「奥（f）」「右（r）」。キャベツの山はこの2軸で横長に作る（エビフライと同じ）
        const VF = [Math.cos(camera.alpha + Math.PI), Math.sin(camera.alpha + Math.PI)];
        const VR = [VF[1], -VF[0]];
        const spot = (f, r) => [VF[0] * f + VR[0] * r, VF[1] * f + VR[1] * r];

        // ---- 千切りキャベツ（奥）。エビフライの buildCabbage をそのまま使う
        if (CFG.showCabbage) {
            const CAB = { f: 5.4 + rng.range(-0.3, 0.3), r: -1.6 + rng.range(-0.4, 0.4), rr: 5.10, rf: 2.80, h: 2.75 };
            const p = spot(CAB.f, CAB.r);
            const at = [p[0], plateSurfaceY(p[0], p[1]) + 0.04, p[1]];
            const er = [VR[0], 0, VR[1]], ef = [VF[0], 0, VF[1]];
            const g = new Geo();
            buildCabbage(g, new Rng((seed ^ 0x51C3) >>> 0), new PNoise(seed ^ 0x0D71), {
                at: at, er: er, ef: ef, rr: CAB.rr, rf: CAB.rf, h: CAB.h,
                count: Math.round(CFG.cabCount)
            });
            const m = toMesh("cabbage", g.finish(), scene);
            m.material = mats.cabbage;
            m.receiveShadows = true;
            food.push(m);
            // 足跡は横長の楕円を円3つで近似。コロッケは裾に少し寄りかかってよい（slack 大）
            const circ = [];
            for (const k of [-0.55, 0, 0.55]) {
                circ.push({ x: at[0] + er[0] * CAB.rr * k, z: at[2] + er[2] * CAB.rr * k, r: CAB.rf * 0.95 });
            }
            obstacles.push({ circles: circ, slack: 1.2 });
        }

        // ---- 丸ごとのコロッケ
        // 配置はカメラ基準（f = 奥, r = 右）。長径は画面の横向きを基準に振る
        const yawR = Math.atan2(-VR[1], VR[0]);
        const WHOLE = [
            { f: 0.6, r: -4.8, yaw: 0.45 },
            { f: 2.4, r: 1.2, yaw: -0.20 },
            { f: -1.0, r: 0.0, yaw: 0.10 }
        ];
        const wholes = [];
        for (let i = 0; i < CFG.wholeCount; i++) {
            const W = WHOLE[i % WHOLE.length];
            const k = new Korokke(scene, CFG, (seed + i * 7919) >>> 0, mats, null);
            const local = [
                { x: -k.a * 0.52, z: 0, r: k.b * 0.92 }, { x: 0, z: 0, r: k.b * 0.98 },
                { x: k.a * 0.52, z: 0, r: k.b * 0.92 }
            ];
            const q = yawQ(yawR + W.yaw + rng.range(-0.25, 0.25));
            const wp = spot(W.f + rng.range(-0.4, 0.4), W.r + rng.range(-0.4, 0.4));
            const circ = place(k.mesh, local, wp[0], wp[1], q, obstacles, 0.25);
            settle(k.mesh, circ, 0.04);
            obstacles.push({ circles: circ });
            food.push(k.mesh);
            if (k.flakes) food.push(k.flakes);
            pieces.push({ mesh: k.mesh, circles: circ });
            wholes.push(k);
        }

        // ---- 割った1個（断面をカメラへ向ける）
        if (CFG.showCut) {
            const cseed = (seed + 31337) >>> 0;
            const c = new Rng(cseed).range(-0.5, 0.5);
            // 割った両半分は同じシード＝同じ1個から作る（断面の模様が対になる）
            const camDir = Math.atan2(Math.sin(camera.alpha), Math.cos(camera.alpha));
            const HALF = [
                { side: +1, f: -5.4, r: -0.8, tilt: rng.range(0.10, 0.20) },
                { side: -1, f: -2.4, r: 5.4, tilt: rng.range(0.00, 0.06) }
            ];
            for (const H of HALF) {
                const k = new Korokke(scene, CFG, cseed, mats, { c, side: H.side });
                // 残した側の足跡（切断面から奥へ）
                const sgn = -H.side;
                const span = k.a - sgn * c;
                const local = [
                    { x: c + sgn * span * 0.30, z: 0, r: Math.min(k.b * 0.95, span * 0.55) },
                    { x: c + sgn * span * 0.70, z: 0, r: Math.min(k.b * 0.80, span * 0.45) }
                ];
                // 【対策】Babylon の rotation.y = θ はローカル +x を (cosθ, 0, -sinθ) へ
                //         写す（左手系）。断面の法線（+x か -x）がカメラの水平方向
                //         (cos α, sin α) を向く θ は -α（-x のときは -α + π）
                let yaw = -camDir + (H.side > 0 ? 0 : Math.PI) + rng.range(-0.35, 0.35);
                // 断面を少し上へ傾ける。符号は実際に回して確かめる
                let q = yawQ(yaw, 0, H.tilt);
                const nf = new V3(H.side, 0, 0);
                const test = new V3();
                nf.rotateByQuaternionToRef(q, test);
                if (test.y < 0) q = yawQ(yaw, 0, -H.tilt);
                const hp = spot(H.f + rng.range(-0.3, 0.3), H.r + rng.range(-0.4, 0.4));
                const circ = place(k.mesh, local, hp[0], hp[1], q, obstacles, 0.15);
                settle(k.mesh, circ, 0.03);
                obstacles.push({ circles: circ });
                food.push(k.mesh);
                if (k.flakes) food.push(k.flakes);
                pieces.push({ mesh: k.mesh, circles: circ });
            }
        }

        // ---- プチトマト（エビフライの buildTomato をそのまま使う）
        // 原点で作ってから、空いている所へ押し出して接地させる
        if (CFG.showTomato) {
            // 押し出された先が皿の立ち上がりに乗ると浮いて見えるので、候補を順に試す
            const TOM = [[4.4, 5.6], [5.4, 3.6], [2.6, 7.0], [-4.2, 6.2], [-6.4, -3.0], [0.0, 7.6]];
            for (let i = 0; i < CFG.tomatoCount; i++) {
                const R = CFG.tomatoRadius * rng.range(0.92, 1.06);
                const g = new Geo();
                buildTomato(g, new Rng((seed ^ 0x2A17) + i * 131), new PNoise((seed ^ 0x6B3D) + i), { at: [0, 0, 0], r: R });
                const m = toMesh("tomato", g.finish(), scene);
                m.material = mats.tomato;
                m.receiveShadows = true;
                const local = [{ x: 0, z: 0, r: R * 1.02 }];
                const q = yawQ(rng.range(0, Math.PI * 2), rng.range(-0.25, 0.25), rng.range(-0.25, 0.25));
                let best = null, bestR = Infinity;
                for (let c = i; c < TOM.length; c++) {
                    const sp = spot(TOM[c][0], TOM[c][1]);
                    place(m, local, sp[0] + rng.range(-0.3, 0.3), sp[1] + rng.range(-0.3, 0.3), q, obstacles, 0.05);
                    const rr = Math.hypot(m.position.x, m.position.z);
                    if (rr < bestR) { bestR = rr; best = m.position.clone(); }
                    if (rr < 8.4) break;
                }
                m.position.copyFrom(best);
                const circ = worldCircles(m, local);
                settle(m, circ, 0.03);
                obstacles.push({ circles: circ });
                food.push(m);
            }
        }

        // ---- ソース（丸ごとのコロッケに）
        if (CFG.showSauce) {
            for (let i = 0; i < wholes.length; i++) {
                const s = buildSauce(scene, wholes[i], (seed + 17 * (i + 1)) >>> 0, mats);
                food.push(s);
            }
        }

        // 影
        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        for (const m of food) sg.addShadowCaster(m, false);
        sg.addShadowCaster(plateMesh, false);

        let verts = 0;
        for (const m of food) verts += m.getTotalVertices();
        stats = { verts, ms: performance.now() - t0 };
        if (onRebuilt) onRebuilt();
    }
    let onRebuilt = null;

    build(START_SEED);

    if (CFG.useSSAO) {
        const ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = 0.85;
        ssao.totalStrength = 1.10;
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
    dp.bloomWeight = 0.12;
    dp.bloomKernel = 48;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.22;
    // 【対策】Babylon の錯乱円は「シーン単位 × 1000 = mm」で計算される。
    //         cm 単位のシーンでは実カメラの数値を入れると合焦面が外れて全部ぼける。
    //         焦点距離を合焦距離の一定比率 K にすると focus が約分され、
    //         cocPre = (lensSize / fStop) * K / (1 - K) でカメラ距離に依存しない
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
    // 11. GUI
    // =================================================================
    // 【対策】フルスクリーン GUI は既定でシーンと同じカメラで合成されるため、
    //         Bloom / 被写界深度 / シャープンが UI にも乗ってボケる。
    //         既定では layer.applyPostProcess = false でポストプロセスの後に描く
    //         （2台目のカメラが不要なので Inspector のデバッグ表示が壊れない）。
    //         guiOwnCamera = true は layerMask で専用カメラに分ける従来方式
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (CFG.guiOwnCamera) {
        const GUI_MASK = 0x20000000;
        const guiCam = named(new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene), "guiCam");
        guiCam.layerMask = GUI_MASK;
        scene.activeCameras = [camera, guiCam];
        if (ui.layer) ui.layer.layerMask = GUI_MASK;
        // 【対策】activeCamera は毎フレーム activeCameras の末尾（guiCam）で
        //         上書きされ、scene.pick() のレイがずれる。描画後に戻す
        scene.onAfterRenderObservable.add(() => { scene.activeCamera = camera; });
    } else if (ui.layer) {
        ui.layer.applyPostProcess = false;
    }

    const COL = {
        idle: "#2b2521", active: "#b8742a", edge: "#4a3f36",
        text: "#f6efe6", sub: "#bda893", accent: "#e8b573"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "232px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(20,15,11,0.82)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "62px";
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
    function addToggle(name, label, get, set) {
        const b = addButton(name, label, () => { set(!get()); refresh(); });
        toggles.push({ b, label, get });
        return b;
    }

    addLabel("KOROKKE", 11, COL.sub, "18px");
    addLabel("コロッケ", 13, COL.accent, "22px");

    let curSeed = START_SEED;
    const toggles = [];
    function refresh() {
        for (const t of toggles) {
            const on = t.get();
            t.b.background = on ? COL.active : COL.idle;
            t.b.textBlock.text = t.label + ": " + (on ? "ON" : "OFF");
        }
    }
    const rebuildWith = (fn) => (v) => { fn(v); build(curSeed); };

    addButton("reseed", "盛り直す", () => {
        curSeed = (curSeed * 1664525 + 1013904223) >>> 0;
        build(curSeed); refresh();
    });
    addToggle("cut", "割った断面", () => CFG.showCut, rebuildWith(v => CFG.showCut = v));
    addToggle("sauce", "ソース", () => CFG.showSauce, rebuildWith(v => CFG.showSauce = v));
    addToggle("cabbage", "キャベツ", () => CFG.showCabbage, rebuildWith(v => CFG.showCabbage = v));
    addToggle("tomato", "ミニトマト", () => CFG.showTomato, rebuildWith(v => CFG.showTomato = v));
    addToggle("dof", "被写界深度", () => CFG.useDOF, (v) => { CFG.useDOF = v; dp.depthOfFieldEnabled = v; });
    addToggle("rotate", "自動回転", () => !!camera.useAutoRotationBehavior, (v) => {
        camera.useAutoRotationBehavior = v;
        if (v && camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.08;
    });

    const info = addLabel("", 12, COL.sub, "56px");
    onRebuilt = () => {
        info.text = "頂点 " + (stats.verts / 1000).toFixed(0) + "k / " + stats.ms.toFixed(0) + "ms\n"
            + "seed: " + curSeed + "\n" + BUILD_ID;
    };

    // ---- 開閉（スマホでは初期状態で畳む）-----------------------------
    // 【対策】Babylon.GUI のサイズ指定はレンダー解像度基準（≒ CSS px × DPR）。
    //         DPR 3 の端末では 34px のボタンが実質 11 CSS px になる。
    //         畳むだけでなく、開いたときは DPR 相当だけ拡大する
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
    refresh();
    applyGuiLayout();

    return scene;
};

export default createScene;