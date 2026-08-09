// =====================================================================
//  Photoreal Tsukimi Dango  /  写実的な月見団子（十五夜・三方・積み上げ）
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  実物の要点（ここを外すと「白い球を積んだ CG」になる）:
//    ・月見団子は球ではない。自重と隣どうしの押し合いで、接する所が平らになる。
//      下の段ほど潰れ、上へ行くほど丸い。真球のまま積むと発泡スチロールに見える
//    ・潰れた分の体積はどこかへ行く。餅は非圧縮なので、切り取られた球冠の体積ぶん
//      だけ自由な面が膨らむ。これを入れると「柔らかい物が触れ合っている」感じが出る
//    ・接触の縁は角ではない。わずかに丸い土手ができて、そこに細い影の線が入る
//    ・上新粉／白玉の生地は光を通す。透過を切ると石膏の球になる
//    ・真っ白ではない。ごく淡い黄味があり、練りむらで場所により濃淡が出る
//    ・茹でたての濡れた膜は「全体に均一」ではない。乾き始めた所だけ艶が鈍る
//    ・丸めたときの畳み込み（しわ）と、閉じ口の「へそ」がどこかに必ずある
//    ・十五夜は 9 + 4 + 2 の15個。いちばん上は2個を縦に並べる（関東の積み方）。
//      上の2個は4個の「谷」ではなく「溝」に乗るので、思ったより高い位置に来る
//    ・三方の台には眼（まなこ）と呼ぶ宝珠形の刳り抜きがあり、3方に開く（1方は塞ぐ）
//    ・敷紙は皿の柄ではなく紙。角が反り、後ろで折り上がって三角に立つ
//
//  団子シリーズ（dango-A〜C）から引き継いだもの:
//    ・法線マップの V の符号は (yd - yu)。Babylon の接空間は V が下向き
//    ・影は ESM ではなく PCF + forceBackFacesOnly（ESM の自己遮蔽が痣になる）
//    ・テクスチャに anisotropicFilteringLevel = 16
//    ・被写界深度の錯乱円は「1単位 = 1m」で計算される。ピントは radius×1000
//    ・テクスチャは個体ごとに焼かない。変種を数セット焼いて配る
//    ・Babylon の物理ベース機能に頼らず、吸収などは CPU で解いて焼くほうが確実
//
//  面の向きの規約（このファイル全体で統一）:
//    Babylon の VertexData.ComputeNormals は cross(v1-v2, v3-v2) で面法線を出す。
//    そのため「外から見て反時計回り」に並べた四角形 p0..p3 は、
//    indices を (0,2,1),(0,3,2) の順で積むと法線が外を向く。Buf.quad がこれを行う。
// =====================================================================

var createScene = function () {

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;

    // =================================================================
    // 0. CONFIG
    // =================================================================
    const GLOBAL = {
        // --- 団子
        ballDiameter: 4.5,          // 一寸五分。月見団子の標準
        sizeJitter: 0.045,          // 手で丸めるので一個ずつ違う
        latSegments: 60,
        lonSegments: 84,
        // 接触距離 = (Ra+Rb) × pack。1.0 で「触れるだけ」、小さいほど潰れる
        packLayer: 0.955,           // 段と段（上の重さがそのまま乗る）
        floorSink: 0.945,           // 底（紙と板に押しつけられていちばん潰れる）
        fillet: 0.090,              // 接触の縁の丸み（R 基準）。0 だと切り口が角になる
        posJitter: 0.090,           // 置き位置のばらつき（R 基準）
        // --- テクスチャ
        textureSize: 384,
        skinVariants: 5,            // 個体ごとに焼くと GUI 操作のたびに固まる
        woodTextureSize: 512,
        // --- 描画
        useSSAO: true
    };

    // 積み方。pack は「その段の中での」中心間距離 /(Ra+Rb)
    const PILES = {
        jugoya: {
            label: "十五夜（15個）",
            layers: [
                { kind: "grid", n: 3, pack: 0.925 },
                { kind: "grid", n: 2, pack: 0.945 },
                { kind: "pair", pack: 0.955 }
            ]
        },
        jusanya: {
            label: "十三夜（13個）",
            layers: [
                { kind: "grid", n: 3, pack: 0.925 },
                { kind: "grid", n: 2, pack: 0.945 }
            ]
        },
        tetra: {
            label: "三角積み（10個）",
            layers: [
                { kind: "tri", n: 3, pack: 0.925 },
                { kind: "tri", n: 2, pack: 0.945 },
                { kind: "tri", n: 1, pack: 0.955 }
            ]
        },
        five: {
            label: "五個（略式）",
            layers: [
                { kind: "grid", n: 2, pack: 0.930 },
                { kind: "tri", n: 1, pack: 0.955 }
            ]
        }
    };

    const START = { pile: "jugoya", vessel: "sanbou", mode: "night", susuki: true, seed: 20260915 };

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
        unit() {
            const z = this.range(-1, 1), a = this.range(0, TAU), s = Math.sqrt(Math.max(0, 1 - z * z));
            return new V3(Math.cos(a) * s, z, Math.sin(a) * s);
        }
    }
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;
    // 多項式スムーズ最小値。球と接触平面をなめらかに繋ぐ（＝縁の丸い土手）
    const smin = (a, b, k) => {
        const h = Math.max(0, k - Math.abs(a - b)) / k;
        return Math.min(a, b) - h * h * k * 0.25;
    };
    function hashStr(s) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
        return h >>> 0;
    }

    // =================================================================
    // 2. Noise（x 方向だけ period で巻く。テクスチャの継ぎ目が出ないのはこのため）
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
    // 3. Buf : 四角形／三角形を積んでメッシュにする
    //    法線は ComputeNormals に任せる（頂点は面ごとに独立なので自動的に平面シェード）
    // =================================================================
    class Buf {
        constructor() { this.pos = []; this.uv = []; this.idx = []; }
        _v(p, u, v) {
            this.pos.push(p.x, p.y, p.z); this.uv.push(u, v);
            return (this.pos.length / 3) - 1;
        }
        // p0..p3 は「外から見て反時計回り」
        quad(p0, p1, p2, p3, uv0, uv1, uv2, uv3) {
            const a = this._v(p0, uv0[0], uv0[1]), b = this._v(p1, uv1[0], uv1[1]);
            const c = this._v(p2, uv2[0], uv2[1]), d = this._v(p3, uv3[0], uv3[1]);
            this.idx.push(a, c, b, a, d, c);
        }
        tri(p0, p1, p2, uv0, uv1, uv2) {
            const a = this._v(p0, uv0[0], uv0[1]), b = this._v(p1, uv1[0], uv1[1]);
            const c = this._v(p2, uv2[0], uv2[1]);
            this.idx.push(a, c, b);
        }
        // 直方体。grain は木目を走らせたい軸（法線がその軸に近い面＝木口だけ別扱い）
        box(center, half, grain, uvScale) {
            const AX = [new V3(1, 0, 0), new V3(0, 1, 0), new V3(0, 0, 1)];
            const faces = [
                [0, 1, 2, +1], [0, 2, 1, -1],   // ±X : a×b = ±X
                [1, 2, 0, +1], [1, 0, 2, -1],   // ±Y
                [2, 0, 1, +1], [2, 1, 0, -1]    // ±Z
            ];
            for (const f of faces) {
                // faces の並びは a×b = n（面の法線）になるよう組んである
                const nAxis = AX[f[0]], A = AX[f[1]].scale(half.asArray()[f[1]]), B = AX[f[2]].scale(half.asArray()[f[2]]);
                const n = nAxis.scale(f[3]);
                const c = center.add(n.scale(half.asArray()[f[0]]));
                const p0 = c.subtract(A).subtract(B), p1 = c.add(A).subtract(B);
                const p2 = c.add(A).add(B), p3 = c.subtract(A).add(B);
                // 木目の向き。面法線が木目軸と一致する面（木口）は別の軸を使う
                let vAx = grain;
                if (Math.abs(V3.Dot(n, grain)) > 0.5) vAx = Math.abs(n.x) > 0.5 ? new V3(0, 1, 0) : new V3(1, 0, 0);
                let uAx = V3.Cross(n, vAx);
                const UV = (p) => [V3.Dot(p, uAx) / uvScale, V3.Dot(p, vAx) / uvScale];
                this.quad(p0, p1, p2, p3, UV(p0), UV(p1), UV(p2), UV(p3));
            }
        }
        mesh(name, scene, mat) {
            const m = new BABYLON.Mesh(name, scene);
            const vd = new BABYLON.VertexData();
            vd.positions = new Float32Array(this.pos);
            vd.uvs = new Float32Array(this.uv);
            vd.indices = this.idx;
            const nrm = new Float32Array(this.pos.length);
            BABYLON.VertexData.ComputeNormals(vd.positions, vd.indices, nrm);
            vd.normals = nrm;
            vd.applyToMesh(m, false);
            if (mat) m.material = mat;
            m.receiveShadows = true;
            return m;
        }
    }

    // 太さの変わる管（竹の茎・ススキ）。R×U = T になる枠を作れば巻き方向は上の規約に合う
    function tube(buf, pts, radAt, sides, uvLen) {
        const rings = [];
        for (let i = 0; i < pts.length; i++) {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
            let T = b.subtract(a);
            const tl = T.length();
            T = tl > 1e-9 ? T.scale(1 / tl) : new V3(0, 1, 0);
            const up = Math.abs(T.y) > 0.95 ? new V3(1, 0, 0) : new V3(0, 1, 0);
            const R = V3.Cross(up, T).normalize();
            const U = V3.Cross(T, R);
            const r = Math.max(1e-4, radAt(i / (pts.length - 1)));
            const ring = [];
            for (let j = 0; j <= sides; j++) {
                const ph = j / sides * TAU;
                ring.push(pts[i].add(R.scale(Math.cos(ph) * r)).add(U.scale(Math.sin(ph) * r)));
            }
            rings.push(ring);
        }
        for (let i = 0; i < rings.length - 1; i++) {
            for (let j = 0; j < sides; j++) {
                buf.quad(rings[i][j], rings[i][j + 1], rings[i + 1][j + 1], rings[i + 1][j],
                    [j / sides, i / uvLen], [(j + 1) / sides, i / uvLen],
                    [(j + 1) / sides, (i + 1) / uvLen], [j / sides, (i + 1) / uvLen]);
            }
        }
    }

    // =================================================================
    // 4. TextureLab
    // =================================================================
    const TextureLab = {
        _tex(name, size, fill, scene, alpha) {
            const dt = new BABYLON.DynamicTexture(name, { width: size, height: size }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(size, size);
            fill(img.data, size);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = !!alpha;
            dt.anisotropicFilteringLevel = 16;
            return dt;
        },

        // 蒸し／茹でで出る細かい気泡
        poreMask(size, seed) {
            const m = new Float32Array(size * size);
            const r = new Rng(seed);
            const n = Math.round(size * size * 0.0022);
            for (let k = 0; k < n; k++) {
                const cx = r.next() * size, cy = r.range(0.03, 0.97) * size;
                const rad = Math.max(0.7, r.range(0.0016, 0.0048) * size);
                const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(size - 1, Math.ceil(cy + rad));
                for (let y = y0; y <= y1; y++) {
                    for (let x = Math.floor(cx - rad); x <= Math.ceil(cx + rad); x++) {
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

        // ---- 閉じ口の「へそ」------------------------------------------------
        // 【対策】v1 は「丸めたときの畳み込み」を u 方向に一周する正弦曲線で入れたが、
        //         球に巻きつく大きな縞になり、バスケットボールの縫い目にしか見えなかった。
        //         白玉の表面は基本なめらか。傷はへそ1点に絞り、それも浅くする
        navelAt(u, v, sk) {
            const nv = sk.navel;
            let du = Math.abs(u - nv.u); du = Math.min(du, 1 - du);
            // 極に近いほど u は詰まる。円に見せるには u 側を sin で伸ばす
            const sv = Math.max(0.15, Math.sin(v * Math.PI));
            const dx = du * sv / nv.r, dy = (v - nv.v) / nv.r;
            const d = Math.hypot(dx, dy);
            if (d >= 1.6) return 0;
            const ang = Math.atan2(dy, dx);
            // 中央のくぼみ＋放射状の小じわ
            const star = 1 + 0.30 * Math.cos(ang * nv.arms + nv.ph);
            const dd = d / star;
            if (dd >= 1.5) return 0;
            return Math.pow(Math.max(0, 1 - dd / 1.5), 2.0);
        },

        dangoAlbedo(scene, size, sk) {
            const BASE = [0.980, 0.974, 0.960];   // 白玉の白。青白くはしない
            const WARM = [0.952, 0.928, 0.884];   // 練りむらの濃い側（上新粉の黄味）
            const SHADE = [0.900, 0.876, 0.842];  // へその底
            return this._tex("dangoAlbedo", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        const mott = smooth(0.34, 0.74, Noise.fbm(u * 3.5, v * 2.6, 4, sk.seed + 3, 3));
                        let cr = mix(BASE[0], WARM[0], mott * 0.45);
                        let cg = mix(BASE[1], WARM[1], mott * 0.45);
                        let cb = mix(BASE[2], WARM[2], mott * 0.45);
                        // 米粉のごく細かい粒。±2% 程度で十分（強いと梨地になる）
                        const gr = Noise.fbm(u * 86, v * 66, 86, sk.seed + 29, 2) - 0.5;
                        const g = 1 + gr * 0.020;
                        cr *= g; cg *= g; cb *= g;
                        // へそ
                        const cw = this.navelAt(u, v, sk);
                        if (cw > 0) {
                            const w = cw * 0.22;
                            cr = mix(cr, SHADE[0], w); cg = mix(cg, SHADE[1], w); cb = mix(cb, SHADE[2], w);
                        }
                        // 気泡
                        const pk = smooth(0.30, 0.95, sk.pores[y * N + x]) * 0.07;
                        cr *= 1 - pk; cg *= 1 - pk; cb *= 1 - pk;
                        d[i] = clamp(cr, 0, 1) * 255;
                        d[i + 1] = clamp(cg, 0, 1) * 255;
                        d[i + 2] = clamp(cb, 0, 1) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        dangoORM(scene, size, sk) {
            return this._tex("dangoORM", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        // 下地の粗さ。艶はクリアコート（濡れた膜）側で作る
                        let rough = 0.52 + 0.12 * (Noise.fbm(u * 9, v * 7, 9, sk.seed + 5, 2) - 0.5);
                        const cw = this.navelAt(u, v, sk);
                        rough = mix(rough, 0.64, cw * 0.7);
                        let ao = 1.0;
                        ao = mix(ao, 0.72, cw * 0.5);
                        ao = mix(ao, 0.88, smooth(0.30, 0.95, sk.pores[y * N + x]));
                        d[i] = clamp(ao, 0, 1) * 255;
                        d[i + 1] = clamp(rough, 0.04, 1) * 255;
                        d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // 【対策】法線の V は (yd - yu)。Babylon の接空間は V が下向きなので
        //         OpenGL 系の (yu - yd) で焼くと気泡が突起になる
        dangoNormal(scene, size, sk) {
            const h = new Float32Array(size * size);
            for (let y = 0; y < size; y++) {
                const v = y / size;
                for (let x = 0; x < size; x++) {
                    const u = x / size;
                    const grain = Noise.fbm(u * 40, v * 32, 40, sk.seed + 61, 2) * 0.16;
                    const micro = Noise.fbm(u * 110, v * 88, 110, sk.seed + 71, 2) * 0.07;
                    const cw = this.navelAt(u, v, sk) * 0.85;
                    h[y * size + x] = grain + micro - cw - sk.pores[y * size + x] * 0.22;
                }
            }
            return this._tex("dangoNormal", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const vv = y / N;
                    // 極では u が詰まって法線が暴れる。両端で効きを落とす
                    const k = 0.85 * smooth(0, 0.05, vv) * (1 - smooth(0.95, 1.0, vv));
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

        // 濡れた膜。R=強度 / G=粗さ。乾き始めた所だけ鈍くする
        dangoCoat(scene, size, sk) {
            return this._tex("dangoCoat", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        const dry = smooth(0.42, 0.78, Noise.fbm(u * 2.6, v * 2.0, 3, sk.seed + 97, 3));
                        // 【対策】v1 は強度0.92・実効粗さ0.06。暗い夜の環境をそのまま映して
                        //         灰色のゴムボールになった。濡れ艶は「小さく強いハイライトが
                        //         1〜2個」くらいが実物に近い
                        const inten = mix(0.50, 0.20, dry);
                        let rough = mix(0.24, 0.44, dry);
                        rough += 0.06 * (Noise.fbm(u * 14, v * 11, 14, sk.seed + 103, 2) - 0.5);
                        d[i] = clamp(inten, 0, 1) * 255;
                        d[i + 1] = clamp(rough, 0.05, 1) * 255;
                        d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // ---- 檜（三方・角盆）--------------------------------------------
        // 木目は v 方向に走る。板の向きは UV 側で合わせる
        wood(scene, size, seed) {
            // 【対策】v1 は 12cm 幅に 13 本の濃い縞＋強い法線で、鉋がけの檜ではなく
            //         すだれか段ボールに見えた。白木の三方はほぼ無地に近く、木目は
            //         「よく見ると分かる」程度。本数を減らし、明暗差も法線も大きく下げる
            const PALE = [0.938, 0.892, 0.782];
            const DARK = [0.800, 0.730, 0.588];
            const grainField = (u, v) => {
                const t = u * 4.5 + Noise.fbm(u * 1.1, v * 0.6, 2, seed, 3) * 2.2 + Noise.fbm(u * 4, v * 1.4, 4, seed + 9, 2) * 0.5;
                const f = t - Math.floor(t);
                return Math.pow(smooth(0.60, 0.99, f), 1.7);
            };
            const alb = this._tex("woodAlbedo", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        const line = grainField(u, v);
                        const fib = Noise.fbm(u * 120, v * 6, 120, seed + 17, 2) - 0.5;
                        const k = clamp(line * 0.30 + fib * 0.10 + 0.04, 0, 1);
                        const cr = mix(PALE[0], DARK[0], k), cg = mix(PALE[1], DARK[1], k), cb = mix(PALE[2], DARK[2], k);
                        d[i] = clamp(cr, 0, 1) * 255;
                        d[i + 1] = clamp(cg, 0, 1) * 255;
                        d[i + 2] = clamp(cb, 0, 1) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
            const orm = this._tex("woodORM", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        const line = grainField(u, v);
                        // 硬い夏目は少しだけ滑らか。全体は鉋がけの白木なので粗い
                        const rough = clamp(0.62 - line * 0.06 + (Noise.fbm(u * 30, v * 8, 30, seed + 23, 2) - 0.5) * 0.08, 0.2, 1);
                        d[i] = clamp(1 - line * 0.08, 0, 1) * 255;
                        d[i + 1] = rough * 255;
                        d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
            const h = new Float32Array(size * size);
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const u = x / size, v = y / size;
                    h[y * size + x] = -grainField(u, v) * 0.20
                        + Noise.fbm(u * 150, v * 8, 150, seed + 31, 2) * 0.14;
                }
            }
            const nrm = this._tex("woodNormal", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    for (let x = 0; x < N; x++) {
                        const xl = h[y * N + ((x - 1 + N) % N)], xr = h[y * N + ((x + 1) % N)];
                        const yu = h[Math.max(0, y - 1) * N + x], yd = h[Math.min(N - 1, y + 1) * N + x];
                        let nx = (xl - xr) * 1.6, ny = (yd - yu) * 1.6, nz = 1;
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const i = (y * N + x) * 4;
                        d[i] = (nx * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
            return { alb, orm, nrm };
        },

        // ---- 黒い陶皿 ----------------------------------------------------
        stoneware(scene, size, seed) {
            const alb = this._tex("plateAlbedo", size, (d, N) => {
                const r = new Rng(seed);
                const spots = [];
                for (let k = 0; k < 900; k++) spots.push([r.next(), r.next(), r.range(0.0015, 0.005), r.range(0.15, 0.5)]);
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        const mot = Noise.fbm(u * 6, v * 6, 6, seed + 3, 3);
                        let c = 0.045 + mot * 0.045;
                        let cr = c * 1.05, cg = c, cb = c * 1.06;
                        for (const s of spots) {
                            let du = Math.abs(u - s[0]); du = Math.min(du, 1 - du);
                            const dd = Math.hypot(du, v - s[1]) / s[2];
                            if (dd < 1) { const w = (1 - dd) * s[3]; cr += w * 0.5; cg += w * 0.45; cb += w * 0.40; }
                        }
                        d[i] = clamp(cr, 0, 1) * 255;
                        d[i + 1] = clamp(cg, 0, 1) * 255;
                        d[i + 2] = clamp(cb, 0, 1) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
            const orm = this._tex("plateORM", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        // 半艶のマット釉。むらが無いと塗装のプラスチックに見える
                        const rough = clamp(0.50 + (Noise.fbm(u * 8, v * 8, 8, seed + 11, 3) - 0.5) * 0.30, 0.2, 0.95);
                        d[i] = 255; d[i + 1] = rough * 255; d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
            return { alb, orm };
        },

        // ---- 敷紙（半紙）--------------------------------------------------
        paper(scene, size, seed) {
            const alb = this._tex("paperAlbedo", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const v = y / N;
                    for (let x = 0; x < N; x++) {
                        const u = x / N, i = (y * N + x) * 4;
                        const fib = Noise.fbm(u * 90, v * 26, 90, seed, 2) - 0.5;
                        const cloud = Noise.fbm(u * 5, v * 5, 5, seed + 5, 3) - 0.5;
                        const c = clamp(0.945 + fib * 0.05 + cloud * 0.035, 0, 1);
                        d[i] = c * 255; d[i + 1] = c * 254; d[i + 2] = c * 246; d[i + 3] = 255;
                    }
                }
            }, scene);
            const h = new Float32Array(size * size);
            for (let y = 0; y < size; y++)
                for (let x = 0; x < size; x++)
                    h[y * size + x] = Noise.fbm(x / size * 70, y / size * 22, 70, seed + 9, 2) * 0.5;
            const nrm = this._tex("paperNormal", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    for (let x = 0; x < N; x++) {
                        const xl = h[y * N + ((x - 1 + N) % N)], xr = h[y * N + ((x + 1) % N)];
                        const yu = h[Math.max(0, y - 1) * N + x], yd = h[Math.min(N - 1, y + 1) * N + x];
                        let nx = (xl - xr) * 0.9, ny = (yd - yu) * 0.9, nz = 1;
                        const l = Math.hypot(nx, ny, nz);
                        const i = (y * N + x) * 4;
                        d[i] = (nx / l * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny / l * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz / l * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
            return { alb, nrm };
        },

        // ---- 満月 ---------------------------------------------------------
        // 板に描く（球に貼ると周縁減光を仕込めない）。α で円に抜く
        moon(scene, size, seed) {
            const r = new Rng(seed);
            const craters = [];
            for (let k = 0; k < 70; k++) {
                const p = r.unit();
                if (p.z < 0.05) continue;                 // 手前側だけ
                craters.push({ x: p.x, y: p.y, r: r.range(0.012, 0.075) * (p.z * 0.6 + 0.4), k: r.range(0.4, 1.0) });
            }
            const rays = [];
            for (let k = 0; k < 14; k++) rays.push({ a: r.range(0, TAU), w: r.range(0.04, 0.10), k: r.range(0.25, 0.6) });
            const rayC = { x: r.range(-0.25, 0.25), y: r.range(-0.6, -0.25) };
            return this._tex("moonTex", size, (d, N) => {
                for (let y = 0; y < N; y++) {
                    const py = (y / N - 0.5) * 2.12;
                    for (let x = 0; x < N; x++) {
                        const px = (x / N - 0.5) * 2.12, i = (y * N + x) * 4;
                        const dd = Math.hypot(px, py);
                        if (dd >= 1) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 0; continue; }
                        const z = Math.sqrt(Math.max(1e-4, 1 - dd * dd));
                        // 海（暗い玄武岩）
                        const maria = smooth(0.46, 0.62, Noise.fbm(px * 2.4 + 3, py * 2.4 + 3, 64, seed + 7, 4));
                        let g = mix(0.90, 0.60, maria);
                        g += (Noise.fbm(px * 14 + 9, py * 14 + 9, 64, seed + 13, 3) - 0.5) * 0.10;
                        // 光条（ティコの条線）
                        for (const ry of rays) {
                            const ang = Math.atan2(py - rayC.y, px - rayC.x);
                            let da = Math.abs(((ang - ry.a + Math.PI * 3) % TAU) - Math.PI);
                            const dist = Math.hypot(px - rayC.x, py - rayC.y);
                            if (da < ry.w && dist > 0.05) g += ry.k * (1 - da / ry.w) * smooth(1.4, 0.15, dist) * 0.16;
                        }
                        // クレーター：底が暗く、縁が明るい
                        for (const c of craters) {
                            const t = Math.hypot(px - c.x, py - c.y) / c.r;
                            if (t > 1.35) continue;
                            g -= smooth(1.0, 0.25, t) * 0.13 * c.k;
                            g += smooth(0.72, 0.98, t) * (1 - smooth(1.0, 1.25, t)) * 0.20 * c.k;
                        }
                        // 周縁減光。満月は正面から照らされるので効きは弱い
                        g *= 0.62 + 0.38 * Math.pow(z, 0.55);
                        const a = smooth(1.0, 0.985, dd);
                        d[i] = clamp(g * 1.00, 0, 1) * 255;
                        d[i + 1] = clamp(g * 0.985, 0, 1) * 255;
                        d[i + 2] = clamp(g * 0.945, 0, 1) * 255;
                        d[i + 3] = a * 255;
                    }
                }
            }, scene, true);
        }
    };

    // =================================================================
    // 5. Skin : 団子の見た目一式（変種単位でキャッシュ）
    // =================================================================
    class DangoSkin {
        constructor(scene, variantSeed) {
            const S = GLOBAL.textureSize;
            const rng = new Rng(variantSeed);
            this.seed = (variantSeed % 60000) | 0;
            this.pores = TextureLab.poreMask(S, variantSeed ^ 0x5bf03635);
            // へそ（丸めたときの閉じ口）
            this.navel = {
                u: rng.next(), v: rng.range(0.24, 0.76),
                r: rng.range(0.035, 0.060), arms: 3 + rng.int(3), ph: rng.range(0, TAU)
            };

            this.albedoTex = TextureLab.dangoAlbedo(scene, S, this);
            this.ormTex = TextureLab.dangoORM(scene, S, this);
            this.normalTex = TextureLab.dangoNormal(scene, S, this);
            this.coatTex = TextureLab.dangoCoat(scene, S, this);

            const pbr = new BABYLON.PBRMaterial("dangoMat", scene);
            pbr.albedoTexture = this.albedoTex;
            pbr.metallic = 0.0;
            pbr.roughness = 1.0;                     // 実値は ORM の G
            pbr.metallicTexture = this.ormTex;
            pbr.useAmbientOcclusionFromMetallicTextureRed = true;
            pbr.useRoughnessFromMetallicTextureGreen = true;
            pbr.useMetallnessFromMetallicTextureBlue = true;
            pbr.bumpTexture = this.normalTex;
            pbr.bumpTexture.level = 0.32;
            // 茹でたての濡れた膜。無色の艶だけを別層で持つ
            pbr.clearCoat.isEnabled = true;
            pbr.clearCoat.intensity = 1.0;           // 実値はテクスチャの R
            pbr.clearCoat.roughness = 0.62;          // 実値は G と乗算 → 0.15〜0.27
            pbr.clearCoat.texture = this.coatTex;
            pbr.clearCoat.useRoughnessFromMainTexture = true;
            pbr.clearCoat.indexOfRefraction = 1.36;  // ほぼ水
            pbr.clearCoat.isTintEnabled = false;     // dango-C の教訓。着色は使わない
            // 【対策】生地は光を通す。これを切ると石膏の球になる。
            //         径4.5cm なので厚みも実寸に近い値を入れる
            pbr.subSurface.isTranslucencyEnabled = true;
            pbr.subSurface.tintColor = new BABYLON.Color3(1.0, 0.972, 0.930);
            pbr.subSurface.translucencyIntensity = 0.55;
            pbr.subSurface.minimumThickness = 0.6;
            pbr.subSurface.maximumThickness = 2.2;
            this.mat = pbr;
        }
    }

    // =================================================================
    // 6. Ball : 球から接触面を切り取った団子1個
    //   ・cuts[] は世界座標の平面（法線 n・中心からの距離 d）
    //   ・方向ごとの半径を smin で丸めると、縁に土手のある柔らかい接触になる
    //   ・切り取った球冠の体積ぶんだけ全体を膨らませる（餅は非圧縮）
    // =================================================================
    function makeBall(scene, b, mat) {
        const N = GLOBAL.latSegments, M = GLOBAL.lonSegments;
        const nv = (N + 1) * (M + 1);
        const positions = new Float32Array(nv * 3);
        const uvs = new Float32Array(nv * 2);
        const idx = [];
        // 軸 n・接線 t・従法線 bt。b×t = n になるよう作る（面の向きの規約に合わせる）
        const n = b.axis;
        let t = Math.abs(n.y) > 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0);
        t = t.subtract(n.scale(V3.Dot(t, n))).normalize();
        const bt = V3.Cross(t, n);

        let p = 0, q = 0, neg = 0;
        for (let i = 0; i <= N; i++) {
            const th = i / N * Math.PI, st = Math.sin(th), ct = Math.cos(th);
            for (let j = 0; j <= M; j++) {
                const ph = j / M * TAU, cp = Math.cos(ph), sp = Math.sin(ph);
                const dx = n.x * ct + t.x * st * cp + bt.x * st * sp;
                const dy = n.y * ct + t.y * st * cp + bt.y * st * sp;
                const dz = n.z * ct + t.z * st * cp + bt.z * st * sp;
                const r = ballRadius(b, dx, dy, dz);
                if (r <= 0) neg++;
                positions[p++] = b.c.x + dx * r;
                positions[p++] = b.c.y + dy * r;
                positions[p++] = b.c.z + dz * r;
                uvs[q++] = j / M; uvs[q++] = 1 - i / N;
            }
        }
        const build = (flip) => {
            const a = [];
            for (let i = 0; i < N; i++) {
                for (let j = 0; j < M; j++) {
                    const v0 = i * (M + 1) + j, v1 = v0 + 1, v3 = v0 + M + 1, v2 = v3 + 1;
                    // 外から見て反時計回り: v0,v1,v2,v3
                    if (flip) a.push(v0, v1, v2, v0, v2, v3);
                    else a.push(v0, v2, v1, v0, v3, v2);
                }
            }
            return a;
        };
        let indices = build(false);
        let normals = new Float32Array(positions.length);
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        // 保険：赤道の1点で法線が外を向いているか確かめ、違えば巻きを反転する
        const vi = (Math.floor(N / 2) * (M + 1) + Math.floor(M / 4));
        const ox = positions[vi * 3] - b.c.x, oy = positions[vi * 3 + 1] - b.c.y, oz = positions[vi * 3 + 2] - b.c.z;
        if (ox * normals[vi * 3] + oy * normals[vi * 3 + 1] + oz * normals[vi * 3 + 2] < 0) {
            indices = build(true);
            normals = new Float32Array(positions.length);
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        const mesh = new BABYLON.Mesh("dango", scene);
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.indices = indices; vd.normals = normals; vd.uvs = uvs;
        vd.applyToMesh(mesh, false);
        mesh.material = mat;
        mesh.receiveShadows = true;
        b.negative = neg;
        return mesh;
    }

    function ballRadius(b, dx, dy, dz) {
        // 手で丸めた低周波の凹凸。真球だと 3D ソフトの球にしか見えない
        let l = 1;
        for (const w of b.waves) {
            const dot = dx * w.x + dy * w.y + dz * w.z;
            l += w.a * Math.cos(w.f * dot * Math.PI + w.p);
        }
        // わずかな楕円（掌の中で転がすと必ずどこかが長い）
        const de = dx * b.ell.x + dy * b.ell.y + dz * b.ell.z;
        l += b.ellK * (de * de - 1 / 3);

        let r = b.R * b.inflate * l;
        for (const c of b.cuts) {
            const cs = dx * c.nx + dy * c.ny + dz * c.nz;
            if (cs > 1e-3) r = smin(r, c.d / cs, b.fillet);
        }
        return r;
    }

    // =================================================================
    // 7. Pile : 並べて落として、接触を平面に変換する
    // =================================================================
    function layerOffsets(spec, s) {
        const out = [];
        if (spec.kind === "grid") {
            for (let i = 0; i < spec.n; i++)
                for (let k = 0; k < spec.n; k++)
                    out.push([(i - (spec.n - 1) / 2) * s, (k - (spec.n - 1) / 2) * s]);
        } else if (spec.kind === "tri") {
            const n = spec.n;
            for (let row = 0; row < n; row++) {
                const cnt = n - row;
                for (let j = 0; j < cnt; j++)
                    out.push([(j - (cnt - 1) / 2) * s, (row - (n - 1) / 3) * s * 0.866]);
            }
        } else if (spec.kind === "pair") {
            out.push([0, -s * 0.5], [0, s * 0.5]);
        }
        return out;
    }

    function buildPile(scene, pileKey, seed, floorY, skins) {
        const rng = new Rng((seed ^ 0x9E3779B9) >>> 0);
        const spec = PILES[pileKey];
        const R0 = GLOBAL.ballDiameter * 0.5;
        const balls = [];

        for (let L = 0; L < spec.layers.length; L++) {
            const spc = spec.layers[L];
            const offs = layerOffsets(spc, R0 * 2 * spc.pack);
            const layerBalls = [];
            for (const o of offs) {
                const R = R0 * (1 + rng.gauss(0, GLOBAL.sizeJitter * 0.6));
                const x = o[0] + rng.gauss(0, GLOBAL.posJitter * R0);
                const z = o[1] + rng.gauss(0, GLOBAL.posJitter * R0);
                // 【対策】支持に「同じ段」を入れてはいけない。互いに乗り合って
                //         段全体がじりじり浮き上がる。下の段だけを見る
                let y = floorY + R * GLOBAL.floorSink;
                for (const p of balls) {
                    const dx = x - p.c.x, dz = z - p.c.z;
                    const h2 = dx * dx + dz * dz;
                    const cd = (R + p.R) * GLOBAL.packLayer;
                    if (h2 < cd * cd - 1e-6) y = Math.max(y, p.c.y + Math.sqrt(cd * cd - h2));
                }
                layerBalls.push({ c: new V3(x, y, z), R: R, layer: L, cuts: [] });
            }
            for (const b of layerBalls) balls.push(b);
        }

        // 接触 → 平面（半径が違う場合は根軸面。等しければちょうど中点）
        for (let i = 0; i < balls.length; i++) {
            const a = balls[i];
            for (let j = i + 1; j < balls.length; j++) {
                const b = balls[j];
                const dx = b.c.x - a.c.x, dy = b.c.y - a.c.y, dz = b.c.z - a.c.z;
                const d = Math.hypot(dx, dy, dz);
                if (d >= a.R + b.R || d < 1e-4) continue;
                const da = (d * d + a.R * a.R - b.R * b.R) / (2 * d);
                a.cuts.push({ nx: dx / d, ny: dy / d, nz: dz / d, d: clamp(da, a.R * 0.35, a.R) });
                b.cuts.push({ nx: -dx / d, ny: -dy / d, nz: -dz / d, d: clamp(d - da, b.R * 0.35, b.R) });
            }
            // 床
            const df = a.c.y - floorY;
            if (df < a.R) a.cuts.push({ nx: 0, ny: -1, nz: 0, d: clamp(df, a.R * 0.35, a.R) });
        }

        // 個体差と、切り取った体積の埋め合わせ
        for (let i = 0; i < balls.length; i++) {
            const b = balls[i];
            const r = new Rng((seed + i * 8191) >>> 0);
            b.waves = [];
            for (let k = 0; k < 4; k++) {
                const u = r.unit();
                b.waves.push({ x: u.x, y: u.y, z: u.z, a: r.range(0.006, 0.017), f: r.range(0.8, 2.1), p: r.range(0, TAU) });
            }
            const e = r.unit();
            b.ell = e; b.ellK = r.range(0.018, 0.040);
            b.fillet = b.R * GLOBAL.fillet;
            b.axis = r.unit();                        // 分割の極を毎回ばらす
            b.skin = skins[i % skins.length];
            let vol = 0;
            for (const c of b.cuts) {
                const h = b.R - c.d;
                if (h > 0) vol += Math.PI * h * h * (3 * b.R - h) / 3;
            }
            b.cutVolume = vol;
            b.inflate = Math.pow(1 + vol / (4 / 3 * Math.PI * b.R * b.R * b.R), 1 / 3);
        }
        return balls;
    }

    // =================================================================
    // 8. 器
    // =================================================================
    function octagon(H, c) {
        return [[H, -(H - c)], [H - c, -H], [-(H - c), -H], [-H, -(H - c)],
        [-H, H - c], [-(H - c), H], [H - c, H], [H, H - c]]
            .map(p => new V3(p[0], 0, p[1]));
    }
    // 上（+Y）から見て反時計回りに並んだ凸多角形を内側へ t だけ縮める
    function offsetIn(poly, t) {
        const n = poly.length, out = [];
        const inNormal = (a, b) => {
            const d = b.subtract(a); d.y = 0;
            const l = Math.hypot(d.x, d.z);
            return new V3(-d.z / l * -1, 0, d.x / l * -1);   // = normalize(cross(Y, dir)) の反対 → 内向き
        };
        for (let i = 0; i < n; i++) {
            const prev = inNormal(poly[(i - 1 + n) % n], poly[i]);
            const cur = inNormal(poly[i], poly[(i + 1) % n]);
            const dot = V3.Dot(prev, cur);
            const m = prev.add(cur).scale(1 / Math.max(0.2, 1 + dot));
            out.push(poly[i].add(m.scale(t)));
        }
        return out;
    }

    function slab(buf, poly, y0, y1, uvS) {
        const n = poly.length;
        const top = new V3(0, y1, 0), bot = new V3(0, y0, 0);
        const P = (i, y) => new V3(poly[i].x, y, poly[i].z);
        const UV = (p) => [p.x / uvS, p.z / uvS];
        // 【対策】側面の UV を 0..1 で貼ると、1辺ごとにテクスチャ全幅が圧縮されて
        //         木口に細かい縦縞が並ぶ（すだれの正体のひとつ）。実寸で貼る
        let run = 0;
        const th = (y1 - y0) / uvS;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            buf.tri(top, P(i, y1), P(j, y1), UV(top), UV(P(i, y1)), UV(P(j, y1)));
            buf.tri(bot, P(j, y0), P(i, y0), UV(bot), UV(P(j, y0)), UV(P(i, y0)));
            const len = Math.hypot(poly[j].x - poly[i].x, poly[j].z - poly[i].z);
            const v0 = run / uvS, v1 = (run + len) / uvS; run += len;
            buf.quad(P(i, y0), P(j, y0), P(j, y1), P(i, y1), [0, v0], [0, v1], [th, v1], [th, v0]);
        }
    }

    // 三方の眼（宝珠形）。円と三角形の和を、中心からの極座標で持つ。
    // 【対策】単純な max だと接ぎ目に小さな段（えぐれ）が見える。滑らかな最大値で
    //         肩を丸める（尖端は差が大きいので影響を受けない）
    const smax = (a, b, k) => -smin(-a, -b, k);
    function hojuRadius(th, hole) {
        const rc = hole.r;
        // 三角形（頂点 apex / 底の2点）との射線交差
        const dx = Math.cos(th), dy = Math.sin(th);
        let rt = 0;
        const V = [[0, hole.apex], [-hole.bw, -hole.bh], [hole.bw, -hole.bh]];
        for (let i = 0; i < 3; i++) {
            const a = V[i], b = V[(i + 1) % 3];
            const ex = b[0] - a[0], ey = b[1] - a[1];
            const den = dx * ey - dy * ex;
            if (Math.abs(den) < 1e-9) continue;
            const t = (a[0] * ey - a[1] * ex) / den;      // 射線パラメータ
            const s = (a[0] * dy - a[1] * dx) / den;      // 辺のパラメータ
            if (t > 0 && s >= 0 && s <= 1) rt = Math.max(rt, t);
        }
        return smax(rc, rt, 0.42);
    }

    function panel(buf, o, r, u, w, h, t, hole, uvS) {
        const n = V3.Cross(r, u);
        const P = (lx, ly, dep) => o.add(r.scale(lx)).add(u.scale(ly)).add(n.scale(-dep));
        const UV = (lx, ly) => [lx / uvS, ly / uvS];
        if (!hole) {
            buf.quad(P(-w / 2, 0, 0), P(w / 2, 0, 0), P(w / 2, h, 0), P(-w / 2, h, 0),
                UV(-w / 2, 0), UV(w / 2, 0), UV(w / 2, h), UV(-w / 2, h));
            buf.quad(P(-w / 2, h, t), P(w / 2, h, t), P(w / 2, 0, t), P(-w / 2, 0, t),
                UV(-w / 2, h), UV(w / 2, h), UV(w / 2, 0), UV(-w / 2, 0));
            buf.quad(P(-w / 2, 0, 0), P(-w / 2, h, 0), P(-w / 2, h, t), P(-w / 2, 0, t),
                UV(0, 0), UV(0, h), UV(t, h), UV(t, 0));
            buf.quad(P(w / 2, h, 0), P(w / 2, 0, 0), P(w / 2, 0, t), P(w / 2, h, t),
                UV(0, h), UV(0, 0), UV(t, 0), UV(t, h));
            buf.quad(P(-w / 2, 0, 0), P(-w / 2, 0, t), P(w / 2, 0, t), P(w / 2, 0, 0),
                UV(-w / 2, 0), UV(-w / 2, t), UV(w / 2, t), UV(w / 2, 0));
            buf.quad(P(-w / 2, h, t), P(-w / 2, h, 0), P(w / 2, h, 0), P(w / 2, h, t),
                UV(-w / 2, t), UV(-w / 2, 0), UV(w / 2, 0), UV(w / 2, t));
            return;
        }
        // 角の方向を必ずサンプルに含める（含めないと角が丸く落ちる）
        const cx = 0, cy = hole.cy;
        const corners = [[w / 2, -cy], [w / 2, h - cy], [-w / 2, h - cy], [-w / 2, -cy]];
        const ths = [];
        const M = 84;
        for (let i = 0; i < M; i++) ths.push(i / M * TAU);
        // 【対策】atan2 は -π..π を返す。0..TAU に揃えないと並べ替えたとき
        //         角度の範囲が2πを超え、リングが一周してから折り返して自分に重なる
        for (const c of corners) {
            const a = (Math.atan2(c[1], c[0]) + TAU) % TAU;
            ths.push((a - 1e-4 + TAU) % TAU, (a + 1e-4) % TAU);
        }
        ths.sort((a, b) => a - b);
        const inner = [], outer = [];
        for (const th of ths) {
            const dx = Math.cos(th), dy = Math.sin(th);
            const ri = hojuRadius(th, hole);
            // 外形（矩形）との交差
            let to = 1e9;
            if (Math.abs(dx) > 1e-9) to = Math.min(to, (w / 2 * Math.sign(dx) - cx) / dx);
            if (Math.abs(dy) > 1e-9) to = Math.min(to, ((dy > 0 ? h - cy : -cy)) / dy);
            inner.push([cx + dx * ri, cy + dy * ri]);
            outer.push([cx + dx * to, cy + dy * to]);
        }
        const K = ths.length;
        for (let i = 0; i < K; i++) {
            const j = (i + 1) % K;
            const iA = inner[i], iB = inner[j], oA = outer[i], oB = outer[j];
            // 表
            buf.quad(P(iA[0], iA[1], 0), P(oA[0], oA[1], 0), P(oB[0], oB[1], 0), P(iB[0], iB[1], 0),
                UV(iA[0], iA[1]), UV(oA[0], oA[1]), UV(oB[0], oB[1]), UV(iB[0], iB[1]));
            // 裏
            buf.quad(P(iA[0], iA[1], t), P(iB[0], iB[1], t), P(oB[0], oB[1], t), P(oA[0], oA[1], t),
                UV(iA[0], iA[1]), UV(iB[0], iB[1]), UV(oB[0], oB[1]), UV(oA[0], oA[1]));
            // 眼の内壁（法線は穴の中心を向く）
            buf.quad(P(iA[0], iA[1], 0), P(iB[0], iB[1], 0), P(iB[0], iB[1], t), P(iA[0], iA[1], t),
                UV(iA[0], iA[1]), UV(iB[0], iB[1]), UV(iB[0], iB[1] + t), UV(iA[0], iA[1] + t));
            // 外周の木口
            buf.quad(P(oA[0], oA[1], 0), P(oA[0], oA[1], t), P(oB[0], oB[1], t), P(oB[0], oB[1], 0),
                UV(oA[0], oA[1]), UV(oA[0], oA[1] + t), UV(oB[0], oB[1] + t), UV(oB[0], oB[1]));
        }
    }

    // 【対策】v1 は板厚1.3・縁2.5cm・台の高さ11.9cm で、三方というより木箱だった。
    //         実物は折敷が広く薄く、台は細く高い
    const SANBOU = {
        H: 12.0, corner: 3.4,        // 折敷（八角。対辺24cm）
        slab0: 14.6, slab1: 15.5,    // 板厚 0.9
        rimH: 1.7, rimT: 0.70,
        daiH: 14.6, daiHalf: 6.9, daiT: 0.85, footH: 0.9, footHalf: 8.0
    };

    function buildSanbou(scene, mat) {
        const S = SANBOU, buf = new Buf();
        // 底（足元の広がり）
        buf.box(new V3(0, S.footH / 2, 0), new V3(S.footHalf, S.footH / 2, S.footHalf), new V3(1, 0, 0), 12);
        // 台（4面。3方に眼を開け、1方は塞ぐ）
        const hole = { r: 2.30, apex: 4.25, bw: 2.26, bh: 0.45, cy: 6.4 };
        const y0 = S.footH, h = S.daiH - S.footH;
        const wZ = S.daiHalf * 2 - S.daiT * 2;
        panel(buf, new V3(0, y0, S.daiHalf), new V3(1, 0, 0), new V3(0, 1, 0), S.daiHalf * 2, h, S.daiT, hole, 12);
        panel(buf, new V3(-S.daiHalf, y0, 0), new V3(0, 0, 1), new V3(0, 1, 0), wZ, h, S.daiT, hole, 12);
        panel(buf, new V3(S.daiHalf, y0, 0), new V3(0, 0, -1), new V3(0, 1, 0), wZ, h, S.daiT, hole, 12);
        panel(buf, new V3(0, y0, -S.daiHalf), new V3(-1, 0, 0), new V3(0, 1, 0), S.daiHalf * 2, h, S.daiT, null, 12);
        // 折敷（八角の板）
        const oct = octagon(S.H, S.corner);
        slab(buf, oct, S.slab0, S.slab1, 14);
        // 縁
        const inn = offsetIn(oct, S.rimT);
        const y1 = S.slab1, y2 = S.slab1 + S.rimH;
        let run = 0;
        for (let i = 0; i < oct.length; i++) {
            const j = (i + 1) % oct.length;
            const Oi = oct[i], Oj = oct[j], Ii = inn[i], Ij = inn[j];
            const len = Math.hypot(Oj.x - Oi.x, Oj.z - Oi.z);
            const u0 = run / 10, u1 = (run + len) / 10; run += len;
            const at = (p, y) => new V3(p.x, y, p.z);
            // 木目は板の長さ方向に走らせたいので v = 長さ
            buf.quad(at(Oi, y1), at(Oj, y1), at(Oj, y2), at(Oi, y2), [0, u0], [0, u1], [S.rimH / 10, u1], [S.rimH / 10, u0]);
            buf.quad(at(Oi, y2), at(Oj, y2), at(Ij, y2), at(Ii, y2), [0.3, u0], [0.3, u1], [0.3 + S.rimT / 10, u1], [0.3 + S.rimT / 10, u0]);
            buf.quad(at(Ii, y2), at(Ij, y2), at(Ij, y1), at(Ii, y1), [0.6, u0], [0.6, u1], [0.6 + S.rimH / 10, u1], [0.6 + S.rimH / 10, u0]);
        }
        const m = buf.mesh("sanbou", scene, mat);
        return { mesh: m, floorY: S.slab1, innerHalf: S.H - S.rimT - 0.4, height: y2 };
    }

    function buildPlate(scene, mat) {
        // 内側は平ら（傾けると団子が中心で沈み縁で浮く）→ 縁 → 裏 → 高台
        const prof = [
            new V3(0.00, 0.95, 0), new V3(9.20, 0.95, 0), new V3(11.60, 1.05, 0),
            new V3(13.40, 1.55, 0), new V3(13.85, 1.48, 0), new V3(13.45, 1.20, 0),
            new V3(11.90, 0.62, 0), new V3(6.20, 0.30, 0), new V3(5.60, 0.00, 0),
            new V3(5.10, 0.00, 0), new V3(4.90, 0.42, 0), new V3(0.00, 0.46, 0)
        ];
        const mesh = BABYLON.MeshBuilder.CreateLathe("plate", { shape: prof, tessellation: 160 }, scene);
        mesh.material = mat;
        mesh.receiveShadows = true;
        return { mesh, floorY: 0.95, innerHalf: 9.0, height: 1.55 };
    }

    // 敷紙。四隅だけが縁に当たって立ち上がる（実物の白い三角の正体はこれ）
    // 【対策】v1 は独立した三角を2枚立てていたが、紙ではなく牙に見えた
    function buildPaper(scene, mat, half, y, seed) {
        const rng = new Rng(seed);
        const N = 30;
        const pos = new Float32Array((N + 1) * (N + 1) * 3);
        const uvs = new Float32Array((N + 1) * (N + 1) * 2);
        const idx = [];
        let p = 0, q = 0;
        const rise = rng.range(1.4, 2.1), ph = rng.range(0, TAU);
        for (let i = 0; i <= N; i++) {
            for (let j = 0; j <= N; j++) {
                const fx = (i / N - 0.5) * 2, fz = (j / N - 0.5) * 2;
                // 角（|fx|・|fz| がともに大きい所）だけを立てる。辺の中央は寝たまま
                const corner = Math.pow(Math.abs(fx) * Math.abs(fz), 1.6);
                const edge = Math.pow(Math.max(Math.abs(fx), Math.abs(fz)), 10);
                const lift = rise * corner + rise * 0.22 * edge
                    + 0.05 * Math.sin(fx * 3.1 + ph) * Math.cos(fz * 2.4)
                    + 0.04 * (Noise.fbm(i / N * 3, j / N * 3, 3, seed, 2) - 0.5);
                pos[p++] = fx * half; pos[p++] = y + lift; pos[p++] = fz * half;
                uvs[q++] = i / N; uvs[q++] = j / N;
            }
        }
        for (let i = 0; i < N; i++)
            for (let j = 0; j < N; j++) {
                const a = i * (N + 1) + j;
                idx.push(a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1);
            }
        const nrm = new Float32Array(pos.length);
        BABYLON.VertexData.ComputeNormals(pos, idx, nrm);
        const mesh = new BABYLON.Mesh("paper", scene);
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = idx; vd.normals = nrm; vd.uvs = uvs;
        vd.applyToMesh(mesh, false);
        mesh.material = mat;
        mesh.receiveShadows = true;
        return mesh;
    }

    // =================================================================
    // 9. ススキ と 月
    // =================================================================
    function buildSusuki(scene, seed, mat) {
        const rng = new Rng(seed);
        const buf = new Buf();
        // 【対策】v1 は高さ50〜70cm・手前左に配置したため、茎だけが団子の真上を
        //         横切り、穂は画面の遥か上に消えていた。穂が団子の山と同じくらいの
        //         高さに来るよう丈を詰め、左奥（+z）へ回す
        const n = 3;
        for (let s = 0; s < n; s++) {
            const bx = -12 - rng.range(0, 11), bz = 7 + rng.range(0, 15);
            const H = rng.range(25, 39);
            const lean = rng.range(-7, 1), leanZ = rng.range(-2, 6);
            const pts = [];
            const K = 16;
            for (let k = 0; k <= K; k++) {
                const t = k / K;
                pts.push(new V3(
                    bx + lean * t * t + Math.sin(t * 2.3 + s) * 0.9 * t,
                    H * Math.sin(t * Math.PI * 0.48),
                    bz + leanZ * t * t
                ));
            }
            tube(buf, pts, (t) => 0.15 * (1 - 0.45 * t), 8, 6);
            const tip = pts[K];
            const dir = pts[K].subtract(pts[K - 1]).normalize();
            plume(buf, rng, tip, dir);
        }
        const m = buf.mesh("susuki", scene, mat);
        return m;
    }

    function plume(buf, rng, tip, dir) {
        let e1 = Math.abs(dir.y) > 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0);
        e1 = e1.subtract(dir.scale(V3.Dot(e1, dir))).normalize();
        const e2 = V3.Cross(dir, e1);
        const rays = 12 + rng.int(5);
        for (let r = 0; r < rays; r++) {
            const az = r / rays * TAU + rng.range(-0.20, 0.20);
            const open = rng.range(0.30, 1.10);
            const L = rng.range(6.5, 12);
            const droop = rng.range(0.30, 0.95);
            const d0 = dir.scale(Math.cos(open))
                .add(e1.scale(Math.cos(az) * Math.sin(open)))
                .add(e2.scale(Math.sin(az) * Math.sin(open)));
            const P = [];
            const K = 7;
            for (let k = 0; k <= K; k++) {
                const t = k / K;
                P.push(tip.add(d0.scale(L * t)).add(new V3(0, -droop * L * t * t * 0.55, 0)));
            }
            tube(buf, P, (t) => 0.042 * (1 - 0.65 * t), 4, 6);
            // 小穂
            const S = 16 + rng.int(8);
            for (let m = 0; m < S; m++) {
                const t = 0.10 + 0.90 * (m / S);
                const k = Math.min(K - 1, Math.floor(t * K));
                const f = t * K - k;
                const pos = P[k].add(P[k + 1].subtract(P[k]).scale(f));
                let tan = P[k + 1].subtract(P[k]);
                const tl = tan.length(); tan = tl > 1e-6 ? tan.scale(1 / tl) : d0;
                let side = V3.Cross(tan, new V3(0, 1, 0));
                if (side.length() < 1e-4) side = e1.clone();
                side.normalize();
                const roll = rng.range(0, TAU);
                const up = V3.Cross(side, tan);
                const a = side.scale(Math.cos(roll)).add(up.scale(Math.sin(roll)));
                const e = tan.scale(rng.range(0.35, 0.75)).add(a.scale(rng.range(0.55, 1.0))).normalize();
                const len = rng.range(0.7, 1.4), wid = rng.range(0.035, 0.065);
                const c1 = V3.Cross(e, tan).normalize();
                const c2 = V3.Cross(e, c1);
                for (const cc of [c1, c2]) {
                    const q0 = pos;
                    const q1 = pos.add(e.scale(len * 0.32)).add(cc.scale(wid));
                    const q2 = pos.add(e.scale(len));
                    const q3 = pos.add(e.scale(len * 0.32)).subtract(cc.scale(wid));
                    buf.quad(q0, q1, q2, q3, [0, 0], [0.5, 0.3], [1, 1], [0.5, 0.3]);
                }
            }
        }
    }

    // =================================================================
    // 10. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.03, 1);

    const env = BABYLON.CubeTexture.CreateFromPrefilteredData(
        "https://assets.babylonjs.com/environments/environmentSpecular.env", scene);
    scene.environmentTexture = env;
    env.lodGenerationOffset = 0.30;

    const camera = new BABYLON.ArcRotateCamera("cam", -1.14, 1.36, 62, new V3(0, 14, 0), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 6;
    camera.minZ = 0.1;
    camera.lowerRadiusLimit = 12;
    camera.upperRadiusLimit = 220;
    scene.cameraToUseForPointers = camera;

    const key = new BABYLON.DirectionalLight("key", new V3(-0.62, -0.80, 0.52).normalize(), scene);
    key.position = new V3(40, 62, -34);
    key.intensity = 2.6;
    key.diffuse = new BABYLON.Color3(1.0, 0.96, 0.90);
    key.specular = new BABYLON.Color3(0.75, 0.73, 0.68);
    key.autoCalcShadowZBounds = true;

    const rim = new BABYLON.DirectionalLight("rim", new V3(0.52, -0.34, -0.78).normalize(), scene);
    rim.intensity = 1.30;
    rim.diffuse = new BABYLON.Color3(0.92, 0.94, 1.0);
    rim.specular = new BABYLON.Color3(0.30, 0.31, 0.34);

    const fill = new BABYLON.HemisphericLight("fill", new V3(0, 1, 0), scene);
    fill.intensity = 0.20;
    fill.specular = new BABYLON.Color3(0, 0, 0);

    // 【対策】影は ESM ではなく PCF。ESM の自己遮蔽が団子の腹に痣として出る
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
    // 【対策】v1 は露出1.05・コントラスト1.15・強いビネットで、albedo 0.97 の白玉が
    //         中間グレーまで落ちていた。ACES は中間調を下げるので、白い被写体では
    //         露出を上げてコントラストを寝かせる
    ip.exposure = 1.18;
    ip.contrast = 1.04;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 1.0;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    // ---- マテリアル ---------------------------------------------------
    const woodTex = TextureLab.wood(scene, GLOBAL.woodTextureSize, 4711);
    const woodMat = new BABYLON.PBRMaterial("woodMat", scene);
    woodMat.albedoTexture = woodTex.alb;
    woodMat.metallicTexture = woodTex.orm;
    woodMat.useAmbientOcclusionFromMetallicTextureRed = true;
    woodMat.useRoughnessFromMetallicTextureGreen = true;
    woodMat.useMetallnessFromMetallicTextureBlue = true;
    woodMat.bumpTexture = woodTex.nrm;
    woodMat.bumpTexture.level = 0.22;
    woodMat.metallic = 0.0; woodMat.roughness = 1.0;
    // 白木は塗っていないので艶は無い。ただし木口だけは光る…程度に留める
    woodMat.clearCoat.isEnabled = true;
    woodMat.clearCoat.intensity = 0.06;
    woodMat.clearCoat.roughness = 0.55;
    woodMat.backFaceCulling = false;
    woodMat.twoSidedLighting = true;

    const plateTex = TextureLab.stoneware(scene, 384, 991);
    const plateMat = new BABYLON.PBRMaterial("plateMat", scene);
    plateMat.albedoTexture = plateTex.alb;
    plateMat.metallicTexture = plateTex.orm;
    plateMat.useRoughnessFromMetallicTextureGreen = true;
    plateMat.metallic = 0.0; plateMat.roughness = 1.0;
    plateMat.clearCoat.isEnabled = true;
    plateMat.clearCoat.intensity = 0.30;
    plateMat.clearCoat.roughness = 0.28;
    plateMat.backFaceCulling = false;
    plateMat.twoSidedLighting = true;

    const paperTex = TextureLab.paper(scene, 384, 313);
    const paperMat = new BABYLON.PBRMaterial("paperMat", scene);
    paperMat.albedoTexture = paperTex.alb;
    paperMat.bumpTexture = paperTex.nrm;
    paperMat.bumpTexture.level = 0.35;
    paperMat.metallic = 0.0; paperMat.roughness = 0.82;
    paperMat.backFaceCulling = false;
    paperMat.twoSidedLighting = true;
    // 紙は光を通す。裏から当たると縁が明るく抜ける
    paperMat.subSurface.isTranslucencyEnabled = true;
    paperMat.subSurface.tintColor = new BABYLON.Color3(1.0, 0.97, 0.92);
    paperMat.subSurface.translucencyIntensity = 0.30;
    paperMat.subSurface.minimumThickness = 0.02;
    paperMat.subSurface.maximumThickness = 0.10;

    const susukiMat = new BABYLON.PBRMaterial("susukiMat", scene);
    susukiMat.albedoColor = new BABYLON.Color3(0.760, 0.672, 0.480).toLinearSpace();
    susukiMat.metallic = 0.0; susukiMat.roughness = 0.72;
    susukiMat.backFaceCulling = false;
    susukiMat.twoSidedLighting = true;
    susukiMat.subSurface.isTranslucencyEnabled = true;
    susukiMat.subSurface.tintColor = new BABYLON.Color3(0.98, 0.88, 0.66);
    susukiMat.subSurface.translucencyIntensity = 0.75;
    susukiMat.subSurface.minimumThickness = 0.02;
    susukiMat.subSurface.maximumThickness = 0.20;

    // ---- 卓 -----------------------------------------------------------
    const tableDark = BABYLON.MeshBuilder.CreateDisc("tableDark", { radius: 130, tessellation: 96 }, scene);
    tableDark.rotation.x = Math.PI / 2;
    tableDark.position.y = -0.004;
    const tdm = new BABYLON.PBRMaterial("tableDarkMat", scene);
    tdm.albedoColor = new BABYLON.Color3(0.048, 0.046, 0.050).toLinearSpace();
    // 【対策】粗さ0.34 だと環境マップの明るい面をそのまま映して、
    //         背景の片側だけが白く光る帯になる
    tdm.metallic = 0.0; tdm.roughness = 0.62;
    tableDark.material = tdm;
    tableDark.receiveShadows = true;

    const tableWood = BABYLON.MeshBuilder.CreateDisc("tableWood", { radius: 130, tessellation: 96 }, scene);
    tableWood.rotation.x = Math.PI / 2;
    tableWood.position.y = -0.004;
    const twm = new BABYLON.PBRMaterial("tableWoodMat", scene);
    const tTex = TextureLab.wood(scene, 512, 8123);
    twm.albedoTexture = tTex.alb;
    twm.albedoTexture.uScale = 3.2; twm.albedoTexture.vScale = 3.2;
    twm.bumpTexture = tTex.nrm;
    twm.bumpTexture.uScale = 3.2; twm.bumpTexture.vScale = 3.2;
    twm.bumpTexture.level = 0.4;
    twm.metallic = 0.0; twm.roughness = 0.55;
    tableWood.material = twm;
    tableWood.receiveShadows = true;

    // ---- 月 -----------------------------------------------------------
    const moonTex = TextureLab.moon(scene, 512, 1042);
    const moon = BABYLON.MeshBuilder.CreatePlane("moon", { size: 82 }, scene);
    moon.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    // 【対策】v1 は月が一度も画面に入らなかった。既定のカメラは山を見下ろして
    //         いる（視線は水平から約12度下）ので、「後ろに高く」置くと視線から
    //         34度も外れる。視線を基準に上18度・左12度、距離230の位置へ
    moon.position = new V3(-118, 50, 142);
    const moonMat = new BABYLON.StandardMaterial("moonMat", scene);
    moonMat.emissiveTexture = moonTex;
    moonMat.opacityTexture = moonTex;
    moonMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
    moonMat.specularColor = new BABYLON.Color3(0, 0, 0);
    moonMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
    moonMat.disableLighting = true;
    moonMat.backFaceCulling = false;
    moon.material = moonMat;
    moon.isPickable = false;

    // =================================================================
    // 11. 生成
    // =================================================================
    const skinCache = {};
    function getSkin(v) {
        if (!skinCache[v]) skinCache[v] = new DangoSkin(scene, hashStr("tsukimi|" + v));
        return skinCache[v];
    }

    let state = null, susukiMesh = null, onRebuilt = null;
    let cur = Object.assign({}, START);

    function build(pileKey, vesselKey, seed) {
        if (state) {
            for (const m of state.meshes) m.dispose();
            state = null;
        }
        const t0 = (typeof performance !== "undefined" ? performance.now() : 0);
        const meshes = [], casters = [];

        const vessel = vesselKey === "sanbou" ? buildSanbou(scene, woodMat) : buildPlate(scene, plateMat);
        meshes.push(vessel.mesh); casters.push(vessel.mesh);

        let floorY = vessel.floorY;
        if (vesselKey === "sanbou") {
            // 【対策】紙の角は八角形の切り欠き（x+z = 20.6）に当たる。正方形のまま
            //         内寸いっぱいにすると角が縁を突き抜ける
            const sheet = buildPaper(scene, paperMat, 9.4, floorY + 0.03, seed ^ 0x77);
            meshes.push(sheet); casters.push(sheet);
            floorY += 0.05;   // 紙の厚みぶん。離しすぎると団子が浮いて見える
        }

        const skins = [];
        for (let i = 0; i < GLOBAL.skinVariants; i++) skins.push(getSkin(i));
        const balls = buildPile(scene, pileKey, seed, floorY, skins);
        let negTotal = 0;
        for (const b of balls) {
            const m = makeBall(scene, b, b.skin.mat);
            negTotal += b.negative;
            meshes.push(m); casters.push(m);
            b.mesh = m;
        }

        // 影
        const sm = sg.getShadowMap();
        if (sm && sm.renderList) sm.renderList.length = 0;
        for (const m of casters) sg.addShadowCaster(m, true);
        // 【対策】renderList を空にするとススキの影も消える。積み方を変えるたびに
        //         影が抜けるので、生きていれば入れ直す
        if (susukiMesh) sg.addShadowCaster(susukiMesh, true);

        // カメラ
        let top = -1e9;
        for (const b of balls) top = Math.max(top, b.c.y + b.R);
        camera.target.set(0, (vessel.floorY + top) * 0.5, 0);
        camera.radius = Math.max(vessel.innerHalf * 2.2, top * 1.75, 34);
        if (ssao) ssao.radius = GLOBAL.ballDiameter * 0.16;

        state = { pileKey, vesselKey, seed, meshes, balls, floorY, top, vessel, negTotal };
        if (onRebuilt) onRebuilt(state);
        if (typeof console !== "undefined") {
            console.log("[Tsukimi]", PILES[pileKey].label, "/", vesselKey, "/ seed =", seed,
                "/", balls.length, "個 / build",
                ((typeof performance !== "undefined" ? performance.now() : 0) - t0).toFixed(0) + "ms");
        }
        return state;
    }

    function applyMode(mode) {
        const night = mode === "night";
        scene.clearColor = night ? new BABYLON.Color4(0.018, 0.018, 0.026, 1)
            : new BABYLON.Color4(0.86, 0.83, 0.78, 1);
        scene.environmentIntensity = night ? 0.62 : 1.10;
        key.intensity = night ? 3.3 : 2.4;
        key.diffuse = night ? new BABYLON.Color3(0.96, 0.95, 1.0) : new BABYLON.Color3(1.0, 0.95, 0.87);
        rim.intensity = night ? 1.05 : 0.85;
        fill.intensity = night ? 0.34 : 0.45;
        ip.exposure = night ? 1.18 : 1.15;
        ip.vignetteWeight = night ? 1.0 : 0.7;
        tableDark.setEnabled(night);
        tableWood.setEnabled(!night);
        moon.setEnabled(night);
        sg.setDarkness(night ? 0.50 : 0.52);
    }

    function applySusuki(on, seed) {
        if (susukiMesh) { susukiMesh.dispose(); susukiMesh = null; }
        if (!on) return;
        susukiMesh = buildSusuki(scene, (seed ^ 0x5151) >>> 0, susukiMat);
        sg.addShadowCaster(susukiMesh, true);
    }

    let ssao = null;
    build(cur.pile, cur.vessel, cur.seed);
    applyMode(cur.mode);
    applySusuki(cur.susuki, cur.seed);

    if (GLOBAL.useSSAO) {
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene, { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        ssao.radius = GLOBAL.ballDiameter * 0.16;
        ssao.totalStrength = 0.62;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 300;
        ssao.minZAspect = 0.2;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.94;
    dp.bloomWeight = 0.12;
    dp.bloomKernel = 44;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.12;
    // 【対策】錯乱円は「シーンの1単位 = 1m」として深度を mm 換算している。
    //         ピント位置は radius×1000 のままにし、焦点距離と絞りで合焦幅を作る
    dp.depthOfFieldEnabled = true;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.Medium;
    dp.depthOfField.fStop = 3.6;
    dp.depthOfField.focalLength = 90;
    dp.depthOfField.focusDistance = camera.radius * 1000;
    scene.onBeforeRenderObservable.add(() => {
        if (dp.depthOfFieldEnabled) dp.depthOfField.focusDistance = camera.radius * 1000;
    });

    // =================================================================
    // 12. GUI
    // =================================================================
    // 【対策】フルスクリーン GUI は既定でシーンと同じカメラで合成されるため、
    //         Bloom / 被写界深度 / シャープンが UI にも乗ってぼやける
    const GUI_MASK = 0x20000000;
    const guiCam = new BABYLON.FreeCamera("guiCam", new V3(0, 0, -50), scene);
    guiCam.layerMask = GUI_MASK;
    scene.activeCameras = [camera, guiCam];
    const ui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI("ui", true, scene);
    if (ui.layer) ui.layer.layerMask = GUI_MASK;

    const COL = { idle: "#242024", active: "#6f6a52", edge: "#443f42", text: "#f4f1ea", sub: "#b6ad9e", accent: "#e6dcbe" };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "224px";
    card.adaptHeightToChildren = true;
    card.cornerRadius = 10; card.thickness = 1;
    card.color = COL.edge; card.background = "rgba(14,13,12,0.82)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "16px";
    ui.addControl(card);

    const panelUI = new BABYLON.GUI.StackPanel("panel");
    panelUI.width = "192px"; panelUI.isVertical = true;
    panelUI.paddingTop = "12px"; panelUI.paddingBottom = "12px";
    card.addControl(panelUI);

    function addLabel(text, size, color, height) {
        const t = new BABYLON.GUI.TextBlock();
        t.text = text; t.height = height || "20px";
        t.color = color || COL.text; t.fontSize = size || 13;
        t.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        t.textWrapping = true;
        panelUI.addControl(t);
        return t;
    }
    function addButton(name, text, onClick) {
        const b = BABYLON.GUI.Button.CreateSimpleButton(name, text);
        b.height = "30px"; b.paddingBottom = "5px";
        b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 13;
        b.onPointerUpObservable.add(onClick);
        panelUI.addControl(b);
        return b;
    }
    function spacer(h) {
        const s = new BABYLON.GUI.Rectangle();
        s.height = h; s.thickness = 0; s.background = "";
        panelUI.addControl(s);
    }

    addLabel("TSUKIMI DANGO", 11, COL.sub, "18px");
    addLabel("積み方", 13, COL.accent, "20px");
    const pileBtn = {}, vesselBtn = {}, modeBtn = {};
    function highlight() {
        for (const k in pileBtn) pileBtn[k].background = (k === cur.pile) ? COL.active : COL.idle;
        for (const k in vesselBtn) vesselBtn[k].background = (k === cur.vessel) ? COL.active : COL.idle;
        for (const k in modeBtn) modeBtn[k].background = (k === cur.mode) ? COL.active : COL.idle;
    }
    for (const k of Object.keys(PILES)) {
        pileBtn[k] = addButton("p_" + k, PILES[k].label, () => {
            cur.pile = k; build(cur.pile, cur.vessel, cur.seed); highlight();
        });
    }
    spacer("6px");
    addLabel("器", 13, COL.accent, "20px");
    for (const k of [["sanbou", "三方"], ["kuro", "黒皿"]]) {
        vesselBtn[k[0]] = addButton("v_" + k[0], k[1], () => {
            cur.vessel = k[0]; build(cur.pile, cur.vessel, cur.seed); highlight();
        });
    }
    spacer("6px");
    addLabel("背景", 13, COL.accent, "20px");
    for (const k of [["night", "月夜"], ["day", "昼"]]) {
        modeBtn[k[0]] = addButton("m_" + k[0], k[1], () => {
            cur.mode = k[0]; applyMode(cur.mode); highlight();
        });
    }
    spacer("6px");
    const susBtn = addButton("sus", "ススキ: ON", () => {
        cur.susuki = !cur.susuki;
        applySusuki(cur.susuki, cur.seed);
        susBtn.textBlock.text = "ススキ: " + (cur.susuki ? "ON" : "OFF");
        susBtn.background = cur.susuki ? COL.active : COL.idle;
    });
    susBtn.background = cur.susuki ? COL.active : COL.idle;
    addButton("reseed", "別の個体を生成", () => {
        cur.seed = (cur.seed * 1664525 + 1013904223) >>> 0;
        build(cur.pile, cur.vessel, cur.seed);
        applySusuki(cur.susuki, cur.seed);
        highlight();
    });
    const rotBtn = addButton("rot", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.08;
        rotBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });
    let shadowOn = true;
    const shadowBtn = addButton("shadow", "影: ON", () => {
        shadowOn = !shadowOn;
        const sm = sg.getShadowMap();
        if (sm) sm.refreshRate = shadowOn
            ? BABYLON.RenderTargetTexture.REFRESHRATE_RENDER_ONEVERYFRAME : 0;
        sg.setDarkness(shadowOn ? (cur.mode === "night" ? 0.50 : 0.52) : 1.0);
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

    const info = addLabel("", 12, COL.sub, "72px");
    onRebuilt = (st) => {
        if (!info) return;
        const b0 = st.balls[0];
        // 底の段の接触面（いちばん潰れている所）を実測する
        let flat = 0, cnt = 0;
        for (const b of st.balls) {
            if (b.layer !== 0) continue;
            for (const c of b.cuts) {
                const rr = b.R * b.inflate;
                flat += 2 * Math.sqrt(Math.max(0, rr * rr - c.d * c.d)); cnt++;
            }
        }
        info.text = "径 " + (b0.R * 2).toFixed(2) + "cm / " + st.balls.length + "個\n"
            + "接触面 φ" + (cnt ? (flat / cnt).toFixed(2) : "0") + "cm\n"
            + "山の高さ " + (st.top - st.floorY).toFixed(2) + "cm\n"
            + "seed: " + st.seed;
    };
    onRebuilt(state);
    highlight();

    return scene;
};

export default createScene;