// =====================================================================
//  Photoreal Bowl of Rice  /  写実的な「ごはん」（茶碗一杯）  BUILD: rice-H
//  Babylon.js Playground 用（そのまま貼り付けて実行できます）
//
//  rice-G からの変更点（照明比 ─ 「白飯が灰色に見える」の本当の原因）:
//    参照オブジェクトを並べて分かったこと。白球（反射率 90%）も同じく
//    灰色に見えている。つまり米の設定は間違っておらず、
//    「この照明では白がこう出る」というだけだった。
//    直す場所はマテリアルではなく照明になる。
//
//    白キューブが答えを持っている。天面（キーライト正面）と
//    正面・側面（環境光と逆光のみ）の明るさの比が照明比そのもので、
//    rice-G ではここが 2.5 倍以上あった。実物の料理写真は大きな
//    ソフトボックスとレフ板で撮るので、この比はせいぜい 1.3〜1.6 倍。
//    白い被写体は照明比が高いと必ず灰色に見える。白飯が白く写っている
//    写真は、白いから白いのではなく、影の側にも光が回っているから白い。
//
//    そこで露出を上げるのではなく、比だけを下げた。
//    露出で持ち上げると、天面が先に飽和して階調が消える。
//      country: env 1.15→1.35 / key 2.40→1.70 / back 1.30→1.00 /
//               fill 0.34→0.80 / exposure 1.04→1.02 / contrast 1.04→0.98
//      studio : env 0.95→1.10 / key 2.80→2.00 / back 1.70→1.20 /
//               fill 0.30→0.70 / exposure 1.17→1.14 / contrast 1.08→1.02
//    本命は fill（半球光）を 0.34 → 0.80 に上げること。これがレフ板にあたる。
//
//    【対策】白球が「均一に真っ白」になる必要はない。それは球ではなく
//      発光体になる。目標は球の下半分（影側）が中間調まで持ち上がること。
//
//    併せて、トーンマッピングを GUI で切り替えられるようにした。
//    ACES は入力リニア 0.18 を出力で約 0.10 まで落とすカーブで、
//    中間調を締めるのが目的なので、白い被写体の階調はそのぶん灰色側へ
//    寄る。STANDARD にすると中間調が持ち上がる代わりに、ハイライトの
//    粘りは減る。キーライトと回り込みのスライダーも足したので、
//    照明比は実機で直接いじれる。
//
//  rice-F → rice-G の変更点（参照オブジェクト）:
//    GUI の「参照」で、左から クロム球 / 白キューブ / 茶碗 / 白球 /
//    18%グレー球 を並べる。
//    【対策】白の基準を sRGB 1.0（純白）にしてはいけない。実在する
//      白い塗料の反射率は 0.90 前後で、1.0 にすると露出を上げた瞬間に
//      飽和して「白飛びしている」のか「白が正しい」のか区別がつかない。
//      標準の白は 90%、グレーは 18%（＝リニア 0.18、sRGB 0.4626）。
//    【対策】参照球にクリアコートも透光も付けない。米のマテリアルと
//      同じ飾りを付けると比較の基準にならない。
//    【対策】並べる向きはワールドの X 軸ではなくカメラの方位角から
//      求めた「画面の横方向」。X 軸で決め打ちすると既定のカメラ角度では
//      手前と奥に並んで比較にならない。
//
//  rice-E → rice-F の変更点（テーブルの木目）:
//    (1) タイル数と実寸が合っていなかった（最大要因）。テクスチャ1枚の
//        受け持つ実寸を WOOD.extent として持ち、天板の直径と一致させた。
//    (2) CreateCylinder の既定 UV は、天面が直径いっぱいの円板投影、
//        側面は周長 201cm を u=0..1 に押し込む。同じスケールでは側面
//        だけ 60 倍以上に伸びる。faceUV で側面だけ別に貼る。
//    (3) 天板は視線に対してほぼ寝ているので、異方性フィルタが無いと
//        遠い側でモアレが出る。3枚とも 16 に上げた。
//
//  rice-D → rice-E の変更点（背景を country.env に）:
//    ・環境をプリセット化（ENVS）。country（textures/country.env ＋
//      スカイボックス）と studio（environmentSpecular ＋ 背景幕）。
//    ・createDefaultSkybox の箱は infiniteDistance なので、壁は常に
//      カメラから size/2 の距離にある。camera.maxZ は箱の対角
//      size/2·√3 を超える必要がある。
//    ・maxZ を伸ばしたぶん minZ も上げる。効くのは比なので 520/4 = 130。
//    ※ "textures/country.env" は Playground のアセット基準の相対パス。
//      外で動かすときは
//      https://playground.babylonjs.com/textures/country.env
//
//  rice-C → rice-D の変更点（背景）:
//    scene.environmentTexture は IBL にしか使われず、背景としては
//    描かれない。何も置かなければ scene.clearColor がそのまま出る。
//    円筒の内側を背景幕として立てた（平面だと自動回転で外が見える）。
//
//  rice-B → rice-C の変更点（マテリアル側の是正）:
//    (1) 透光が拡散反射を食っていた。Babylon 8 系の
//        subSurface.translucencyIntensity は「拡散反射と拡散透過の
//        配分比」で、diffuse *= (1 - t) かつ IBL の irradiance にも
//        同じ係数が掛かる。hot 0.45→0.26
//    (2) 暗さの四重掛け（擬似AO × SSAO × ORMのAO × 下地）
//    (3) 色味とトーン（albedo の青、aoColor の青、ビネット）
//    ※ 切り分けは「透光」スライダーを 0 にすれば一発で分かる。
//
//  rice-A → rice-B の変更点（Inspector のデバッグ表示）:
//    ・GUI 専用カメラで activeCameras を 2 台にすると、Babylon の各機能が
//      「activeCameras の末尾＝描画の基準カメラ」と見なす所で全部 guiCam を
//      拾い、Physics Helper / 選択ハイライト / ピッカーが同時に壊れる。
//      Layer.applyPostProcess = false なら、カメラ1台のまま GUI だけ
//      Bloom / DOF の後に合成できる。
//    ・Babylon の Node はコンストラクタで id = name を入れるので、
//      同名のメッシュを増やすときは name と id の両方を一意にすること。
//
//  構成:
//    0. CONFIG        … ごはん / 器 / 寸法 / 環境 / テーブル / 参照
//    1. Rng           … シード付き擬似乱数
//    2. Noise         … 周期2D値ノイズ / 3D値ノイズ
//    3. TextureLab    … 米の 法線 / ORM / クリアコート / 厚み
//    4. GrainGeometry … 米粒の掃引メッシュ
//    5. GrainAssets   … 米のPBRマテリアル
//    6. BowlLab       … 釉薬のテクスチャ
//    7. Bowl          … 茶碗の回転体（高台つき）
//    8. Mound         … 盛りの形とその法線
//    9. Grains        … 粒の配置 + 擬似AOの焼き込み
//   10. WoodLab       … 板目のテクスチャ
//   11. Scene / GUI   … 丸テーブル / 参照 / IBL / 照明 / 湯気
// =====================================================================

var createScene = function () {
    // =================================================================
    // 0. CONFIG
    // =================================================================
    // 単位系: 1 unit = 1 cm。米粒は mm で書きたいので変換定数を持つ
    const MM = 0.1;

    // ---- ごはんの状態 ------------------------------------------------
    const PRESETS = {
        // 炊きたて: 膨らんで角が取れ、表面が水の膜で覆われる。透光が最大
        hot: {
            label: "炊きたて",
            lengthMM: 5.60, widthMM: 2.85, heightMM: 2.20,
            // 【対策】青を 0.878 まで落とすとクリーム色になり、暗部の
            //         色ずれと合わさって黄土色に濁る。炊きたての白飯は
            //         写真で見るとほぼ新雪で、わずかに暖かい程度。
            albedo: [0.960, 0.950, 0.932],
            baseRough: 0.30,
            // 【対策】粗さ 0.055 は車の塗装の値。この鋭さだと1粒に1つ
            //         小さな鏡ができ、白い錠剤が並んでいるように見える。
            coatIntensity: 0.78, coatRough: 0.14,
            // 【対策】ここは「透けを足す強さ」ではなく拡散反射との配分比。
            //         白い被写体では 0.25〜0.30 が上限。
            translucency: 0.26,              // 拡散のうち透過に回す比率（0〜1）
            tint: [1.00, 0.985, 0.960],
            crackAmount: 0.00,               // 糊化して割れ目は完全にふさがる
            puff: 0.055,
            grooveDepth: 0.020,
            endSwell: 0.055,
            bumpLevel: 0.20,
            wetMottle: 0.38,
            steam: true,
            moundPeak: 2.55,                 // ふっくら盛る
            grainSink: [0.00, 0.26]
        },
        // 冷や飯: 水の膜が乾き、デンプンが老化して白く不透明になる
        cold: {
            label: "冷や飯",
            lengthMM: 5.40, widthMM: 2.75, heightMM: 2.10,
            albedo: [0.945, 0.938, 0.920],
            baseRough: 0.44,
            coatIntensity: 0.32, coatRough: 0.26,
            // 【対策】老化したデンプンは光を散らして不透明に寄る。
            //         0.18 でも拡散を 18% 削るので、白さを残すなら 0.12 前後。
            translucency: 0.12,
            tint: [0.97, 0.95, 0.93],
            crackAmount: 0.10,
            puff: 0.050,
            grooveDepth: 0.028,
            endSwell: 0.030,
            bumpLevel: 0.26,
            wetMottle: 0.55,
            steam: false,
            moundPeak: 2.05,                 // 締まって盛りが低くなる
            grainSink: [0.00, 0.30]
        }
    };

    // ---- 器（釉薬）---------------------------------------------------
    // 色はすべて sRGB。アルベドはテクスチャに焼くので、そのまま書ける
    const BOWLS = {
        ame: {
            label: "飴釉",
            base: [0.30, 0.175, 0.085],
            mottle: 0.42,                    // 窯変のムラの強さ
            rough: 0.20, coat: 0.95, coatRough: 0.055,
            speck: 0.15,
            rimLight: 0.60,                  // 口縁で釉が薄くなって明るく抜ける
            rimTint: [0.66, 0.50, 0.33],
            crazing: 0.0                     // 貫入
        },
        kohiki: {
            label: "粉引",
            base: [0.865, 0.840, 0.785],
            mottle: 0.22,
            rough: 0.52, coat: 0.30, coatRough: 0.26,
            speck: 0.75,                     // 鉄点
            rimLight: 0.30,
            rimTint: [0.52, 0.42, 0.34],
            crazing: 0.35
        },
        kuro: {
            label: "黒マット",
            base: [0.115, 0.108, 0.115],
            mottle: 0.30,
            rough: 0.62, coat: 0.18, coatRough: 0.40,
            speck: 0.25,
            rimLight: 0.40,
            rimTint: [0.42, 0.36, 0.31],
            crazing: 0.0
        }
    };

    // ---- 茶碗の寸法（実寸 cm）----------------------------------------
    // 一般的な飯茶碗: 口径 11.5cm / 高さ 6cm / 高台径 5cm
    const BOWL_GEO = {
        rimY: 6.00,        // 口縁の高さ
        rIn: 5.45,         // 口縁の内径
        rOut: 5.70,        // 口縁の外径
        yFloor: 0.95,      // 見込み（内側の底）
        cIn: 1.90,         // 内側の立ち上がりの曲率（大きいほど底が平ら）
        cOut: 1.75,        // 外側
        rFootOut: 2.45,    // 高台の外径
        rFootIn: 1.95,     // 高台の内径
        yFootTop: 0.90,    // 高台の付け根
        sides: 128,        // 周方向の分割
        wobble: 1.0        // 手びねりの歪み
    };

    // ---- 参照オブジェクト ----------------------------------------------
    // 【対策】白を sRGB 1.0（純白）にしてはいけない。実在する白い塗料の
    //   反射率は 0.90 前後。1.0 にすると露出を上げた瞬間に飽和して、
    //   「白飛びしている」のか「白が正しい」のか区別がつかなくなる。
    //   標準の白は 90%、中間のグレーは 18%（＝リニア 0.18、sRGB 0.4626）。
    // 【対策】クリアコートも透光も付けない。米のマテリアルは水膜と透光を
    //   持っているので、そこを揃えると比較の基準にならない。
    const REF = {
        size: 4.0,        // キューブの一辺 / 球の直径（cm）
        items: [
            { id: "refChrome", kind: "sphere", label: "クロム球", at: -14.5, albedo: [0.95, 0.95, 0.95], metallic: 1.0, rough: 0.05 },
            { id: "refCube", kind: "cube", label: "白キューブ", at: -9.0, albedo: [0.900, 0.900, 0.900], metallic: 0.0, rough: 0.90 },
            { id: "refWhite", kind: "sphere", label: "白球", at: 9.0, albedo: [0.900, 0.900, 0.900], metallic: 0.0, rough: 0.90 },
            { id: "refGrey", kind: "sphere", label: "18%グレー球", at: 14.5, albedo: [0.4626, 0.4626, 0.4626], metallic: 0.0, rough: 0.90 }
        ],
        // 表示したときにカメラを引く距離（外側の2つが画角に入らないため）
        camRadius: 30,
        start: false
    };

    // ---- 環境（IBL / 背景 / 照明）--------------------------------------
    //  IBL を差し替えると明るさの前提がまるごと変わるので、環境強度・
    //  ライト・露出をモードごとに束ねて持つ。
    //
    // 【対策】白い被写体が灰色に見えるとき、まず疑うのは露出ではなく
    //   照明比（キーライト ÷ 回り込み）。ここが 2.5 倍もあると、
    //   反射率 90% の白球でさえ影側が中間調まで落ちて灰色に見える。
    //   実物の料理写真は 1.3〜1.6 倍しかない。露出で持ち上げると
    //   キーライト正面が先に飽和して階調が消えるので、比だけを下げる。
    //   本命は fill（半球光）＝レフ板にあたる。
    const ENVS = {
        country: {
            label: "屋外（country.env）",
            url: "textures/country.env",
            rotationY: 2.10,
            skybox: true, skyboxBlur: 0.0,
            backdrop: false,               // 背景はスカイボックスが担当
            clear: [0.72, 0.78, 0.86],
            // 【対策】屋外 IBL は半分が暗い地面なので、水平方向から来る
            //   光は室内スタジオより弱い。環境強度で補う
            env: 1.35,
            key: 1.70, back: 1.00, fill: 0.80,
            exposure: 1.02, contrast: 0.98, vignette: 0.9
        },
        studio: {
            label: "スタジオ（背景幕）",
            url: "https://assets.babylonjs.com/environments/environmentSpecular.env",
            rotationY: 0.0,
            skybox: false, skyboxBlur: 0.0,
            backdrop: true,                // 背景は円筒の幕
            clear: [0.030, 0.028, 0.026],
            env: 1.10,
            key: 2.00, back: 1.20, fill: 0.70,
            exposure: 1.14, contrast: 1.02, vignette: 1.3
        }
    };

    // ---- 背景幕（ホリゾント）------------------------------------------
    const BACKDROP = {
        radius: 65,        // 円筒の半径
        height: 100,       // 高さ
        y: 30,             // 中心の高さ（下端がテーブルの脚より下に来るように）
        top: [0.055, 0.050, 0.047],   // 上端の色（落とす）
        bottom: [0.42, 0.395, 0.370], // 下端の色（テーブル面と馴染ませる）
        curve: 0.85,       // グラデーションの曲がり。小さいほど上まで明るい
        // 【対策】DynamicTexture の invertY はバージョンで既定が違う。
        //         上下が逆に出たらここを true にする（vScale/vOffset で反転）
        flipV: false
    };

    // ---- 丸テーブル ---------------------------------------------------
    const TABLE = { diameter: 64, thickness: 3.0, pedestal: 70, footDia: 38 };

    // ---- 木（板目）----------------------------------------------------
    // 【対策】ここがテクスチャ1枚の受け持つ実寸。天板の直径と一致させて
    //   uScale = vScale = 1 にすれば、タイルの継ぎ目そのものが発生しない。
    //   1024px / 64cm = 16px/cm なので、年輪の晩材（0.2cm 幅）が 3px 出る。
    const WOOD = {
        tex: 1024,
        extent: TABLE.diameter,   // テクスチャ1枚 ＝ 天板の直径
        plankW: 9.0,       // 板の幅（cm）。天板に約7枚並ぶ
        pitch: 0.95,      // 年輪の間隔（cm）
        ringCenter: 8.0,       // 髄（年輪の中心）を板からどれだけ外に置くか
        figure: 1.9,       // 木理のうねり。大きいほど「杢」が出る
        lateW: 0.20,      // 晩材（濃い線）の幅の比
        pore: 0.85,      // 導管の目立ちかた
        seamW: 0.14,      // 板の継ぎ目の幅（cm）
        rough: 0.52,
        early: [0.560, 0.395, 0.222],   // 早材（明るい部分）
        late: [0.330, 0.200, 0.105],   // 晩材（濃い線）
        // 側面（木端）の貼り方。周長 201cm を u = 0..1 に押し込む既定 UV の
        // ままだと 60 倍に伸びるので、faceUV で別に指定する
        edgeRepeat: 20,
        edgeV0: 0.02, edgeV1: 0.08
    };

    // ---- 状態によらない共通設定 ---------------------------------------
    const GLOBAL = {
        // 米粒
        grainRings: 18,       // 1粒の分割（長さ方向）
        grainSides: 16,       //             （周方向）
        grainCount: 2500,     // 表層だけ作る。中身は riceBody が埋める
        grainVariants: 6,     // 形のバリエーション
        texNormal: 512,
        texOther: 256,
        sizeSd: 0.055,
        bend: 0.030,
        asym: 0.86,
        // 【対策】endPow を 2.4 まで下げると紡錘形になり麦やパスタに、
        //         3.2 まで上げると胴が円柱でカプセル錠剤になる。
        endPow: 2.7,
        endRound: 0.48,
        tipTaper: 0.13,       // 先端側の細り
        sectionP: 2.05,

        // 盛り
        riceEdgeDrop: 0.72,   // 器の縁から何cm下でごはんが器に接するか
        moundLump: 0.42,      // しゃもじの跡のような大きなうねり
        // 【対策】ここを大きく取ると、器の内壁との間に粒のない輪ができる。
        grainMargin: 0.18,    // 粒の中心を器の内壁からどれだけ離すか
        // 【対策】盛りの面に沿って寝かせた粒だけだと、輪郭がなめらかな
        //         ドームの曲線になって一気に嘘になる。
        grainLift: 0.30,      // 塊の上に乗って浮いている粒の高さ
        grainLiftRatio: 0.34, // そのような粒の割合
        clusterSize: 3,       // 何粒ずつ塊で置くか

        // 粒間の暗がり
        aoFloor: 0.66,        // いちばん深い谷の明るさ
        // 【対策】ここを粒の沈み込みの幅より大きくすると、どの粒もほぼ
        //         最高点と同じ高さになり、暗がりがまったく出ない。
        aoDepth: 0.42,        // 近傍最高点から何cm沈むと最も暗くなるか
        aoWall: 0.22,         // 器の内壁ぎわの追加の暗さ
        aoStrength: 1.0,      // GUIスライダーの初期値

        bowlTex: 512,
        useSSAO: true,

        // カメラとスカイボックス
        // 【対策】丸テーブル半径 32cm ＋ カメラ最遠 53cm ＝ 85cm なので、
        //   size/2 = 260cm で十分。camera.maxZ は箱の対角 450cm を超える
        skyboxSize: 520,
        camNear: 4,
        camFar: 520,

        // 被写界深度
        useDOF: true,
        // 【対策】Babylon の錯乱円は「シーン単位 × 1000 = mm」で計算される。
        //   focalLength を focusDistance の一定比 K にすると focus が
        //   約分され、寄っても引いてもボケ量が一定になる。
        dofRatio: 0.055,
        dofFStop: 2.6,

        // 【対策】ACES は入力リニア 0.18 を出力で約 0.10 まで落とすカーブ。
        //   中間調を締めるのが目的なので、白い被写体の階調はそのぶん
        //   灰色側へ寄る。STANDARD にすると中間調が持ち上がる代わりに
        //   ハイライトの粘りが減る。GUI で切り替えて比べられるようにした
        useACES: true,

        // GUI / Inspector 対策
        guiOwnCamera: false
    };

    const START_STATE = "hot";
    const START_BOWL = "ame";
    const START_ENV = "country";
    const START_SEED = 20260806;

    function buildConfig(key, bowlKey, seed) {
        const cfg = Object.assign({}, GLOBAL, PRESETS[key], BOWL_GEO);
        cfg.state = key;
        cfg.bowl = Object.assign({}, BOWLS[bowlKey]);
        cfg.bowlKey = bowlKey;
        cfg.seed = seed >>> 0;
        // ごはんが器に接する高さと、そこでの器の内径
        cfg.riceEdgeY = cfg.rimY - cfg.riceEdgeDrop;
        cfg.riceR = cfg.rIn * Math.pow(
            Math.max(0, (cfg.riceEdgeY - cfg.yFloor) / (cfg.rimY - cfg.yFloor)), 1 / cfg.cIn);
        // 盛りの頂点をわずかに片寄せる（seedごとに向きが変わる）
        const r0 = new Rng(cfg.seed ^ 0x0A51);
        const a0 = r0.range(0, Math.PI * 2), d0 = r0.range(0.10, 0.55);
        cfg.moundOffX = Math.cos(a0) * d0;
        cfg.moundOffZ = Math.sin(a0) * d0;
        return cfg;
    }

    const V3 = BABYLON.Vector3;
    const TAU = Math.PI * 2;


    // =================================================================
    // 1. Rng : mulberry32
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
        gauss(mean, sd) {
            const u = Math.max(1e-9, this.next()), v = this.next();
            return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
        }
        int(n) { return Math.floor(this.next() * n) % n; }
    }

    // ---- 小物 --------------------------------------------------------
    const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
    const mix = (a, b, t) => a + (b - a) * t;
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    // sRGB → リニア。PBRMaterial.albedoColor はリニア空間なので必ず通す
    const s2l = (c) => (c <= 0.04045) ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const col3 = (a) => new BABYLON.Color3(s2l(a[0]), s2l(a[1]), s2l(a[2]));
    // 【対策】Node のコンストラクタは id = name を入れる。Inspector の
    //         ツリーは id で照合するので、name だけ変えても id が元のまま残る
    const named = (node, name) => { node.name = name; node.id = name; return node; };
    // 角度差（周方向の最短距離）
    function angDist(a, b) {
        let d = Math.abs(a - b) % TAU;
        if (d > Math.PI) d = TAU - d;
        return d;
    }

    // =================================================================
    // 2. Noise
    // =================================================================
    const Noise = {
        _h2(x, y, seed) {
            let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177);
            return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
        },
        _h3(x, y, z, seed) {
            let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
                ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177);
            return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
        },
        // X方向だけ周期的な2D値ノイズ（周方向UVの継ぎ目を消すため）
        value2(x, y, period, seed) {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            const p = period | 0;
            let x0 = xi % p; if (x0 < 0) x0 += p;
            let x1 = (xi + 1) % p; if (x1 < 0) x1 += p;
            const a = this._h2(x0, yi, seed), b = this._h2(x1, yi, seed);
            const c = this._h2(x0, yi + 1, seed), d = this._h2(x1, yi + 1, seed);
            return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
        },
        fbm2(x, y, period, seed, oct) {
            let sum = 0, amp = 0.5, f = 1;
            for (let o = 0; o < oct; o++) {
                sum += amp * this.value2(x * f, y * f, period * f, seed + o * 131);
                f *= 2; amp *= 0.5;
            }
            return sum;
        },
        // 周期を要らない場面用（十分大きな周期を渡して折り返しを無効化する）
        fbmFree(x, y, seed, oct) { return this.fbm2(x, y, 4096, seed, oct); },
        valFree(x, y, seed) { return this.value2(x, y, 4096, seed); },
        // 3D値ノイズ。形状のゆらぎに使う。
        // 【対策】周方向を u で与えると継ぎ目に段差が出る。
        //         (cosθ, sinθ, t) の3次元で引けば継ぎ目は原理的に発生しない。
        value3(x, y, z, seed) {
            const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
            const xf = x - xi, yf = y - yi, zf = z - zi;
            const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
            const H = this._h3.bind(this);
            const c000 = H(xi, yi, zi, seed), c100 = H(xi + 1, yi, zi, seed);
            const c010 = H(xi, yi + 1, zi, seed), c110 = H(xi + 1, yi + 1, zi, seed);
            const c001 = H(xi, yi, zi + 1, seed), c101 = H(xi + 1, yi, zi + 1, seed);
            const c011 = H(xi, yi + 1, zi + 1, seed), c111 = H(xi + 1, yi + 1, zi + 1, seed);
            const x00 = mix(c000, c100, u), x10 = mix(c010, c110, u);
            const x01 = mix(c001, c101, u), x11 = mix(c011, c111, u);
            return mix(mix(x00, x10, v), mix(x01, x11, v), w);
        }
    };

    // =================================================================
    // 3. TextureLab
    // =================================================================
    const TextureLab = {
        _canvas(name, size, fill, scene) {
            const dt = new BABYLON.DynamicTexture(name, { width: size, height: size }, scene, true);
            const ctx = dt.getContext();
            const img = ctx.createImageData(size, size);
            fill(img.data, size);
            ctx.putImageData(img, 0, 0);
            dt.update(false);
            dt.hasAlpha = false;
            return dt;
        },

        // 胴割れ（横断する割れ目）の線分を先に決める。
        // 【対策】v一定の線を全周に引くと「タイヤの溝」になる。
        _cracks(rng, amount) {
            const n = Math.round(mix(0, 2.4, clamp(amount, 0, 1)));
            const out = [];
            for (let i = 0; i < n; i++) {
                out.push({
                    v: rng.range(0.16, 0.84),
                    u0: rng.next(),
                    arc: rng.range(0.16, 0.42),      // 周方向にどこまで走るか（0..1）
                    tilt: rng.range(-0.10, 0.10),    // 完全な水平にしない
                    w: rng.range(0.0016, 0.0032),
                    d: rng.range(0.55, 1.0) * clamp(amount, 0, 1.2)
                });
            }
            return out;
        },

        // 高さ場（法線マップとAOの元）
        _height(size, seed, cfg, cracks) {
            const P = 8;
            const h = new Float32Array(size * size);
            for (let y = 0; y < size; y++) {
                const v = y / size;
                // 端（極付近）はUVが潰れるので効果をフェードする
                const poleFade = smooth(0, 0.10, v) * (1 - smooth(0.90, 1.0, v));
                for (let x = 0; x < size; x++) {
                    const u = x / size;
                    // (a) デンプン粒の肌理。高周波のみ。低周波を混ぜるとシワになる
                    let e = Noise.fbm2(u * P * 6.5, v * P * 6.5, P * 6.5, seed, 2) * 0.34
                        + Noise.fbm2(u * P * 14, v * P * 14, P * 14, seed + 77, 1) * 0.36
                        + Noise.fbm2(u * P * 28, v * P * 28, P * 28, seed + 151, 1) * 0.30;
                    e = (e - 0.5) * 0.17;
                    // (b) 長さ方向の弱い筋
                    e += 0.012 * Math.sin(u * TAU * 11 + Noise.value2(v * 3, 0, 3, seed + 5) * 6);
                    // (c) 炊いた粒は端がふくれて細かいシワが出る
                    const endW = smooth(0.62, 0.86, v) + (1 - smooth(0.14, 0.38, v));
                    e += cfg.endSwell * 2.2 * endW
                        * (Noise.fbm2(u * P * 9, v * P * 9, P * 9, seed + 313, 2) - 0.5);
                    // (d) 胴割れ
                    for (let ci = 0; ci < cracks.length; ci++) {
                        const c = cracks[ci];
                        let du = u - c.u0;
                        du -= Math.round(du);                 // -0.5..0.5 に折り返す
                        const half = c.arc * 0.5;
                        if (Math.abs(du) >= half) continue;
                        const dv = v - (c.v + c.tilt * du);
                        const along = 1 - Math.pow(Math.abs(du) / half, 2);   // 端で消える
                        e -= c.d * 0.26 * along * Math.exp(-(dv * dv) / (c.w * c.w));
                    }
                    h[y * size + x] = e * poleFade;
                }
            }
            return h;
        },

        // 法線マップ。
        // 【対策】G成分の符号は (上 - 下)。ここを逆にすると、
        //         割れ目が「盛り上がった土手」に見えて一発で嘘になる。
        normalMap(scene, size, h, level, name) {
            return this._canvas(name || "riceNormal", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    for (let x = 0; x < S; x++) {
                        const xl = h[y * S + ((x - 1 + S) % S)], xr = h[y * S + ((x + 1) % S)];
                        const yu = h[Math.max(0, y - 1) * S + x], yd = h[Math.min(S - 1, y + 1) * S + x];
                        let nx = (xl - xr) * level * S * 0.06;
                        let ny = (yu - yd) * level * S * 0.06;
                        let nz = 1;
                        const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
                        const i = (y * S + x) * 4;
                        d[i] = (nx * 0.5 + 0.5) * 255;
                        d[i + 1] = (ny * 0.5 + 0.5) * 255;
                        d[i + 2] = (nz * 0.5 + 0.5) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // ORM (R=AO, G=Roughness, B=Metallic)
        ormMap(scene, size, hSmall, cfg, seed) {
            const P = 5;
            return this._canvas("riceORM", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    const v = y / S;
                    for (let x = 0; x < S; x++) {
                        const k = y * S + x, u = x / S;
                        const e = hSmall[k];
                        const cav = clamp(-e * 3.2, 0, 1);              // へこみ量
                        const n = Noise.fbm2(u * P, v * P, P, seed, 3);
                        const ao = clamp(0.97 - 0.28 * cav - 0.04 * (1 - n), 0, 1);
                        const rough = clamp(cfg.baseRough * (0.88 + 0.30 * n) + 0.22 * cav, 0.05, 1);
                        const i = k * 4;
                        d[i] = ao * 255; d[i + 1] = rough * 255; d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // クリアコート = 表面の水の膜。R=強度 / G=粗さ
        coatMap(scene, size, cfg, seed) {
            const P = 4;
            return this._canvas("riceCoat", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    const v = y / S;
                    for (let x = 0; x < S; x++) {
                        const u = x / S;
                        const cloud = Noise.fbm2(u * P, v * P * 0.8, P, seed, 3);
                        const fine = Noise.fbm2(u * P * 3.5, v * P * 3.0, P * 3.5, seed + 61, 2);
                        // 乾き斑: しきい値を超えたところだけ膜が切れる
                        const dry = smooth(0.52, 0.78, cloud) * cfg.wetMottle;
                        const inten = clamp(cfg.coatIntensity * (1 - 0.85 * dry) * (0.86 + 0.20 * fine), 0, 1);
                        const rough = clamp(cfg.coatRough * (0.85 + 0.45 * fine) + 0.30 * dry, 0.02, 1);
                        const i = (y * S + x) * 4;
                        d[i] = inten * 255; d[i + 1] = rough * 255; d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        // 厚みマップ（subSurface の R チャンネル）
        thicknessMap(scene, size, profFn, seed) {
            return this._canvas("riceThick", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    const v = y / S;
                    const t = clamp(profFn(v), 0, 1);        // 長さ方向の太さ
                    for (let x = 0; x < S; x++) {
                        const u = x / S;
                        const n = Noise.fbm2(u * 4, v * 4, 4, seed, 2);
                        const th = clamp(Math.pow(t, 0.75) * (0.86 + 0.24 * n), 0, 1);
                        const i = (y * S + x) * 4;
                        d[i] = th * 255; d[i + 1] = th * 255; d[i + 2] = th * 255; d[i + 3] = 255;
                    }
                }
            }, scene);
        }
    };

    // =================================================================
    // 4. GrainGeometry
    // =================================================================
    function profileAt(t, cfg) {
        const s = clamp(t, 0, 1);
        const u = Math.pow(s, cfg.asym);              // 太い位置を胚芽側へ
        const e = 1 - Math.pow(Math.abs(2 * u - 1), cfg.endPow);
        let r = Math.pow(Math.max(0, e), cfg.endRound);
        r *= 1 - cfg.tipTaper * smooth(0.45, 1.0, s); // 先端側だけ細らせる
        return r;
    }

    function buildGrainVertexData(cfg, seed, nT, nS) {
        const rng = new Rng(seed);
        const kL = rng.gauss(1, cfg.sizeSd);
        const kW = rng.gauss(1, cfg.sizeSd * 1.25);
        const kH = rng.gauss(1, cfg.sizeSd * 1.25);
        const L = cfg.lengthMM * MM * clamp(kL, 0.82, 1.18);
        const halfWmax = cfg.widthMM * MM * 0.5 * clamp(kW, 0.82, 1.18);
        const halfHmax = cfg.heightMM * MM * 0.5 * clamp(kH, 0.82, 1.18);
        const bend = cfg.bend * L * rng.range(0.5, 1.5);
        const ventral = -Math.PI / 2;                  // 腹側 = -Y
        const nseed = (seed + 991) >>> 0;
        const ph = rng.range(0, 20);

        const germT = rng.range(0.06, 0.11);
        const germPhi = ventral + rng.range(-0.55, 0.55);
        const germDepth = rng.range(0.07, 0.13);

        const nV = (nT + 1) * (nS + 1);
        const positions = new Float32Array(nV * 3);
        const normals = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const colors = new Float32Array(nV * 4).fill(1);
        const indices = new Uint32Array(nT * nS * 6);

        const p = cfg.sectionP;
        const rho = new Float32Array(nS + 1);
        for (let j = 0; j <= nS; j++) {
            const th = (j % nS) / nS * TAU;
            const ca = Math.abs(Math.cos(th)), sa = Math.abs(Math.sin(th));
            rho[j] = 1 / Math.pow(Math.pow(ca, p) + Math.pow(sa, p), 1 / p);
        }

        let vo = 0;
        for (let i = 0; i <= nT; i++) {
            const t = i / nT;
            const pr = profileAt(t, cfg);
            const spineY = bend * (1 - Math.pow(2 * t - 1, 2));
            const x = L * (t - 0.5);
            const swell = 1 + cfg.endSwell * (smooth(0.78, 1.0, t) + (1 - smooth(0.0, 0.22, t)));

            for (let j = 0; j <= nS; j++) {
                const th = (j % nS) / nS * TAU;
                const cth = Math.cos(th), sth = Math.sin(th);
                let r = rho[j] * pr * swell;

                // (a) 腹溝
                const dv = angDist(th, ventral);
                const groove = cfg.grooveDepth * Math.exp(-Math.pow(dv / 0.52, 2))
                    * Math.pow(Math.sin(Math.PI * t), 0.45);
                r -= groove;

                // (b) 胚芽の欠け
                const dg = angDist(th, germPhi);
                const dt2 = (t - germT) / 0.070;
                r -= germDepth * Math.exp(-dt2 * dt2) * Math.exp(-Math.pow(dg / 0.85, 2));

                // (c) 膨らみのゆらぎ（3Dノイズなので継ぎ目が出ない）
                const puff = (Noise.value3(cth * 2.1 + ph, sth * 2.1 + ph, t * 3.4 + ph, nseed) - 0.5) * 2;
                const puff2 = (Noise.value3(cth * 5.4 + ph, sth * 5.4 + ph, t * 8.2 + ph, nseed + 7) - 0.5) * 2;
                r *= 1 + cfg.puff * (puff + 0.55 * puff2);
                r = Math.max(0, r);

                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = x;
                positions[p3 + 1] = spineY + halfHmax * r * sth;
                positions[p3 + 2] = halfWmax * r * cth;
                uvs[p2] = j / nS;
                uvs[p2 + 1] = t;
                vo++;
            }
        }

        let io = 0;
        for (let i = 0; i < nT; i++) {
            for (let j = 0; j < nS; j++) {
                const a = i * (nS + 1) + j, b = a + 1, c = a + (nS + 1), d = c + 1;
                indices[io++] = a; indices[io++] = c; indices[io++] = b;
                indices[io++] = b; indices[io++] = c; indices[io++] = d;
            }
        }

        BABYLON.VertexData.ComputeNormals(positions, indices, normals);

        // 【対策】掃引の巻き順は、断面をどちら回りに取ったかで簡単に裏返る。
        {
            const pi = Math.round(nT * 0.45) * (nS + 1);   // θ=0 の頂点
            if (normals[pi * 3 + 2] < 0) {
                for (let k = 0; k < indices.length; k += 3) {
                    const tmp = indices[k + 1];
                    indices[k + 1] = indices[k + 2];
                    indices[k + 2] = tmp;
                }
                BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            }
        }

        // 【対策】周方向の最初と最後を二重に持っているので、法線を溶接する
        for (let i = 0; i <= nT; i++) {
            const a = (i * (nS + 1)) * 3, b = (i * (nS + 1) + nS) * 3;
            let nx = normals[a] + normals[b];
            let ny = normals[a + 1] + normals[b + 1];
            let nz = normals[a + 2] + normals[b + 2];
            const l = Math.hypot(nx, ny, nz) || 1;
            nx /= l; ny /= l; nz /= l;
            normals[a] = normals[b] = nx;
            normals[a + 1] = normals[b + 1] = ny;
            normals[a + 2] = normals[b + 2] = nz;
        }

        let minY = Infinity, maxY = -Infinity;
        for (let i = 1; i < positions.length; i += 3) {
            const y = positions[i];
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }

        const vd = new BABYLON.VertexData();
        vd.positions = positions;
        vd.normals = normals;
        vd.uvs = uvs;
        vd.colors = colors;
        vd.indices = indices;
        // 【対策】info に vd を入れるとメッシュが生きているあいだ
        //         巨大な型付き配列が解放されない。数値だけを持たせる。
        const info = { L, halfWmax, halfHmax, minY, maxY, tris: nT * nS * 2, verts: nV };
        return { vd, info };
    }

    // =================================================================
    // 5. GrainAssets : テクスチャ + マテリアル + メッシュ
    // =================================================================
    class GrainAssets {
        constructor(scene, cfg) {
            this.scene = scene;
            this.cfg = cfg;
            const rng = new Rng(cfg.seed ^ 0x5A5A);
            const SN = cfg.texNormal, SO = cfg.texOther;

            const cracks = TextureLab._cracks(rng, cfg.crackAmount);
            const hBig = TextureLab._height(SN, 1234, cfg, cracks);
            const hSmall = TextureLab._height(SO, 1234, cfg, cracks);

            this.texNormal = TextureLab.normalMap(scene, SN, hBig, cfg.bumpLevel, "riceNormal");
            this.texORM = TextureLab.ormMap(scene, SO, hSmall, cfg, 500);
            this.texCoat = TextureLab.coatMap(scene, SO, cfg, 811);
            this.texThick = TextureLab.thicknessMap(scene, SO, (v) => profileAt(v, cfg), 1607);
            this.mats = [];
        }

        makeMaterial(name, scale) {
            const cfg = this.cfg;
            const pbr = new BABYLON.PBRMaterial(name, this.scene);
            pbr.albedoColor = col3(cfg.albedo);
            pbr.metallic = 0.0;
            pbr.roughness = 1.0;                 // 実値はORMのGチャンネル
            pbr.metallicTexture = this.texORM;
            pbr.useAmbientOcclusionFromMetallicTextureRed = true;
            pbr.useRoughnessFromMetallicTextureGreen = true;
            pbr.useMetallnessFromMetallicTextureBlue = true;

            pbr.bumpTexture = this.texNormal;
            pbr.bumpTexture.level = 1.0;         // 強さは焼く段階で入れてある

            // --- 表面の水の膜。米の艶はこれが本体
            pbr.clearCoat.isEnabled = true;
            pbr.clearCoat.intensity = 1.0;       // 実値はcoatMapのR
            pbr.clearCoat.roughness = 1.0;       //              G
            pbr.clearCoat.texture = this.texCoat;
            pbr.clearCoat.useRoughnessFromMainTexture = true;
            // 【対策】既定のIORは1.5（樹脂のコート）。米にのっているのは水なので
            //         1.33 にする。反射率が下がって「濡れている」側に寄る。
            if ("indexOfRefraction" in pbr.clearCoat) pbr.clearCoat.indexOfRefraction = 1.33;

            // --- 透過（糊化したデンプンの散乱）
            const sub = pbr.subSurface;
            sub.isTranslucencyEnabled = true;
            sub.tintColor = col3(cfg.tint);
            // 【対策】Babylon 8 以降、translucencyIntensity は「透けを足す強さ」
            //         ではなく「拡散反射と拡散透過の配分比」。
            //             info.diffuse = computeDiffuseLighting(...) * (1 - t)
            //         かつ IBL も finalIrradiance *= (1 - t)。
            //         捨てた拡散が戻るのは粒の裏から光が来たときだけなので、
            //         0.3 を超えると白飯ではなく灰色の塊になる。
            //         7系の挙動に戻したいときは sub.legacyTranslucency = true。
            sub.translucencyIntensity = clamp(cfg.translucency, 0, 0.95);
            sub.thicknessTexture = this.texThick;
            if ("useGltfStyleTextures" in sub) sub.useGltfStyleTextures = false;
            sub.useMaskFromThicknessTexture = false;
            const H = cfg.heightMM * MM * scale;
            sub.minimumThickness = H * 0.06;
            sub.maximumThickness = H * 0.95;
            sub.tintColorAtDistance = H * 1.25;
            // 【対策】屈折は入れない。米は透明体ではなく散乱体なので、
            //         屈折を足すと途端に「ガラスの米」になる。
            sub.isRefractionEnabled = false;

            this.mats.push(pbr);
            return pbr;
        }

        dispose() {
            for (const m of this.mats) m.dispose(true, false);
            this.mats.length = 0;
            for (const t of [this.texNormal, this.texORM, this.texCoat, this.texThick]) t.dispose();
        }
    }

    function makeMesh(name, scene, cfg, seed, nT, nS, mat, scale, instanced) {
        const g = buildGrainVertexData(cfg, seed, nT, nS);
        const m = new BABYLON.Mesh(name, scene);
        named(m, name);
        g.vd.applyToMesh(m, false);
        m.hasVertexAlpha = false;              // trueだと透明パスに落ちて描画順が壊れる
        if (instanced) {
            m.registerInstancedBuffer("color", 4);
            m.instancedBuffers.color = new BABYLON.Color4(1, 1, 1, 1);
        }
        m.material = mat;
        m.scaling.setAll(scale);
        m.receiveShadows = true;
        m.info = g.info;
        return m;
    }

    // =================================================================
    // 6. BowlLab : 釉薬のテクスチャ
    // =================================================================
    const BowlLab = {
        _canvas: TextureLab._canvas,

        _speck(x, y, S, seed, amount) {
            if (amount <= 0) return 0;
            const CS = 14;
            const ci = Math.floor(x / CS), cj = Math.floor(y / CS);
            const h3 = Noise._h2(ci, cj, seed + 307);
            if (h3 > 0.30 * amount) return 0;
            const h1 = Noise._h2(ci, cj, seed + 101), h2 = Noise._h2(ci, cj, seed + 211);
            const px = (ci + h1) * CS, py = (cj + h2) * CS;
            const rad = 1.0 + 2.2 * h1;
            const d = Math.hypot(x - px, y - py);
            return 1 - smooth(rad * 0.45, rad, d);
        },

        // 【対策】色をマテリアルのalbedoColorで持つと、口縁だけ色相を変える
        //         （釉が薄く抜けて土色になる）ことができない。sRGBで焼く。
        albedo(scene, size, bp, vRim, seed) {
            return this._canvas("bowlAlbedo", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    const v = y / S;
                    for (let x = 0; x < S; x++) {
                        const u = x / S;
                        const m1 = Noise.fbm2(u * 6, v * 6, 6, seed, 4);
                        const m2 = Noise.fbm2(u * 20, v * 20, 20, seed + 7, 2);
                        let k = 1 - bp.mottle * (0.60 * (1 - m1) + 0.40 * (1 - m2));
                        if (bp.crazing > 0) {
                            const w = Noise.fbm2(u * 5, v * 5, 5, seed + 51, 3);
                            const l1 = Math.abs(Math.sin((u * 13 + w * 4) * Math.PI));
                            const l2 = Math.abs(Math.sin((v * 19 - w * 5) * Math.PI));
                            const cr = clamp((1 - smooth(0, 0.030, l1)) + (1 - smooth(0, 0.026, l2)), 0, 1);
                            k *= 1 - 0.20 * bp.crazing * cr;
                        }
                        k *= 1 - 0.62 * this._speck(x, y, S, seed, bp.speck);

                        let r = bp.base[0] * k, g = bp.base[1] * k, b = bp.base[2] * k;
                        const band = Math.exp(-Math.pow((v - vRim) / 0.020, 2));
                        const rl = clamp(bp.rimLight * band * (0.55 + 0.45 * m2), 0, 1);
                        r = mix(r, bp.rimTint[0], rl);
                        g = mix(g, bp.rimTint[1], rl);
                        b = mix(b, bp.rimTint[2], rl);

                        const i = (y * S + x) * 4;
                        d[i] = clamp(r, 0, 1) * 255;
                        d[i + 1] = clamp(g, 0, 1) * 255;
                        d[i + 2] = clamp(b, 0, 1) * 255;
                        d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        orm(scene, size, bp, vRim, seed) {
            return this._canvas("bowlORM", size, (d, S) => {
                for (let y = 0; y < S; y++) {
                    const v = y / S;
                    for (let x = 0; x < S; x++) {
                        const u = x / S;
                        const n = Noise.fbm2(u * 7, v * 7, 7, seed + 13, 3);
                        const band = Math.exp(-Math.pow((v - vRim) / 0.020, 2));
                        const rough = clamp(bp.rough * (0.85 + 0.30 * n) + 0.30 * band, 0.04, 1);
                        const ao = clamp(0.97 - 0.06 * (1 - n), 0, 1);
                        const i = (y * S + x) * 4;
                        d[i] = ao * 255; d[i + 1] = rough * 255; d[i + 2] = 0; d[i + 3] = 255;
                    }
                }
            }, scene);
        },

        normal(scene, size, bp, seed) {
            const h = new Float32Array(size * size);
            for (let y = 0; y < size; y++) {
                const v = y / size;
                for (let x = 0; x < size; x++) {
                    const u = x / size;
                    const w = Noise.fbm2(u * 4, v * 4, 4, seed + 3, 2);
                    let e = 0.10 * Math.sin((v * 190 + w * 2.4) * Math.PI * 2);
                    e += 0.045 * Math.sin((v * 41 + w * 1.2) * Math.PI * 2);
                    e += (Noise.fbm2(u * 40, v * 40, 40, seed + 9, 2) - 0.5) * 0.22;
                    e -= 0.55 * this._speck(x, y, size, seed, bp.speck);
                    h[y * size + x] = e;
                }
            }
            return TextureLab.normalMap(scene, size, h, 0.28, "bowlNormal");
        }
    };

    // =================================================================
    // 7. Bowl : 茶碗（回転体・高台つき）
    // =================================================================
    function bowlProfile(G) {
        const P = [];
        for (let i = 0; i <= 46; i++) {
            const u = i / 46;
            P.push({ r: G.rIn * u, y: G.yFloor + (G.rimY - G.yFloor) * Math.pow(u, G.cIn) });
        }
        const cx = (G.rIn + G.rOut) * 0.5, rr = (G.rOut - G.rIn) * 0.5;
        const rimIndex = P.length + 4;
        for (let i = 1; i <= 10; i++) {
            const a = Math.PI * (1 - i / 10);
            P.push({ r: cx + rr * Math.cos(a), y: G.rimY + rr * Math.sin(a) });
        }
        const outStart = P.length;
        for (let i = 1; i <= 42; i++) {
            const u = 1 - i / 42;
            P.push({
                r: G.rFootOut + (G.rOut - G.rFootOut) * u,
                y: G.yFootTop + (G.rimY - G.yFootTop) * Math.pow(u, G.cOut)
            });
        }
        const probeIndex = outStart + 12;      // 外壁の中ほど（巻き順の判定に使う）
        P.push({ r: G.rFootOut + 0.012, y: 0.42 });
        P.push({ r: G.rFootOut, y: 0.09 });
        P.push({ r: G.rFootOut - 0.045, y: 0.0 });
        P.push({ r: G.rFootIn + 0.055, y: 0.0 });
        P.push({ r: G.rFootIn, y: 0.065 });
        P.push({ r: G.rFootIn, y: 0.30 });
        P.push({ r: G.rFootIn, y: 0.52 });
        for (let i = 1; i <= 20; i++) {
            const u = 1 - i / 20;
            P.push({ r: G.rFootIn * u, y: 0.62 - 0.10 * Math.pow(u, 1.6) });
        }
        return { P, rimIndex, probeIndex };
    }

    function buildBowl(scene, cfg, mat, rng) {
        const { P, rimIndex, probeIndex } = bowlProfile(cfg);
        const N = P.length, M = cfg.sides;

        const arc = new Float32Array(N);
        for (let i = 1; i < N; i++) {
            arc[i] = arc[i - 1] + Math.hypot(P[i].r - P[i - 1].r, P[i].y - P[i - 1].y);
        }
        const total = arc[N - 1] || 1;
        const vRim = arc[rimIndex] / total;

        const ph = [rng.range(0, 9), rng.range(0, 9), rng.range(0, 9), rng.range(0, 9)];
        const nV = N * (M + 1);
        const positions = new Float32Array(nV * 3);
        const normals = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const indices = new Uint32Array((N - 1) * M * 6);

        let vo = 0;
        for (let i = 0; i < N; i++) {
            const p = P[i];
            // 【対策】口縁だけを歪ませると器がねじれて見える。内外の同じ高さを
            //         いっしょに動かすことで、肉厚を保ったまま口が波打つ。
            const mask = smooth(3.4, 5.9, p.y);
            for (let j = 0; j <= M; j++) {
                const th = (j % M) / M * TAU;
                const wob = 1 + cfg.wobble * (0.0048 * Math.sin(3 * th + ph[0])
                    + 0.0030 * Math.sin(5 * th + ph[1]));
                const dy = cfg.wobble * mask * (0.030 * Math.sin(2 * th + ph[2])
                    + 0.017 * Math.sin(3 * th + ph[3]));
                const r = p.r * wob;
                const p3 = vo * 3, p2 = vo * 2;
                positions[p3] = r * Math.cos(th);
                positions[p3 + 1] = p.y + dy;
                positions[p3 + 2] = r * Math.sin(th);
                uvs[p2] = j / M;
                uvs[p2 + 1] = arc[i] / total;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < N - 1; i++) {
            for (let j = 0; j < M; j++) {
                const a = i * (M + 1) + j, b = a + 1, c = a + (M + 1), d = c + 1;
                indices[io++] = a; indices[io++] = c; indices[io++] = b;
                indices[io++] = b; indices[io++] = c; indices[io++] = d;
            }
        }
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        // 巻き順の自動判定: 外壁 θ=0 の法線は +X を向くはず
        {
            const pi = probeIndex * (M + 1);
            if (normals[pi * 3] < 0) {
                for (let k = 0; k < indices.length; k += 3) {
                    const t = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = t;
                }
                BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            }
        }
        for (let i = 0; i < N; i++) {
            const a = (i * (M + 1)) * 3, b = (i * (M + 1) + M) * 3;
            let nx = normals[a] + normals[b], ny = normals[a + 1] + normals[b + 1],
                nz = normals[a + 2] + normals[b + 2];
            const l = Math.hypot(nx, ny, nz) || 1;
            nx /= l; ny /= l; nz /= l;
            normals[a] = normals[b] = nx;
            normals[a + 1] = normals[b + 1] = ny;
            normals[a + 2] = normals[b + 2] = nz;
        }

        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.normals = normals; vd.uvs = uvs; vd.indices = indices;
        const mesh = new BABYLON.Mesh("bowl", scene);
        named(mesh, "bowl");
        vd.applyToMesh(mesh, false);
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.vRim = vRim;
        mesh.tris = (N - 1) * M * 2;
        return mesh;
    }

    function bowlMaterial(scene, cfg, name) {
        const bp = cfg.bowl, S = cfg.bowlTex;
        const { P, rimIndex } = bowlProfile(cfg);
        let acc = 0, at = 0;
        for (let i = 1; i < P.length; i++) {
            const d = Math.hypot(P[i].r - P[i - 1].r, P[i].y - P[i - 1].y);
            acc += d;
            if (i === rimIndex) at = acc;
        }
        const vRim = at / (acc || 1);

        const pbr = new BABYLON.PBRMaterial(name, scene);
        const texA = BowlLab.albedo(scene, S, bp, vRim, 4001);
        const texO = BowlLab.orm(scene, S, bp, vRim, 4001);
        const texN = BowlLab.normal(scene, S, bp, 4001);
        // 【対策】色はテクスチャにsRGBで焼いてあるので albedoColor は白。
        pbr.albedoColor = new BABYLON.Color3(1, 1, 1);
        pbr.albedoTexture = texA;
        pbr.metallic = 0.0;
        pbr.roughness = 1.0;
        pbr.metallicTexture = texO;
        pbr.useAmbientOcclusionFromMetallicTextureRed = true;
        pbr.useRoughnessFromMetallicTextureGreen = true;
        pbr.useMetallnessFromMetallicTextureBlue = true;
        pbr.bumpTexture = texN;
        pbr.bumpTexture.level = 1.0;
        // 釉薬はガラス層。米の水膜(1.33)と違い IOR は 1.5 のまま
        pbr.clearCoat.isEnabled = true;
        pbr.clearCoat.intensity = bp.coat;
        pbr.clearCoat.roughness = bp.coatRough;
        pbr.texs = [texA, texO, texN];
        return pbr;
    }

    // =================================================================
    // 8. Mound : 盛りの形
    // =================================================================
    function moundY(x, z, cfg) {
        const dx = x - cfg.moundOffX, dz = z - cfg.moundOffZ;
        const r = Math.hypot(dx, dz);
        const u = clamp(r / cfg.riceR, 0, 1);
        // 【対策】指数を小さくすると肩が張って半球になり、器の縁に「ボール」が
        //         載った状態＝仏飯（お供え）になる。1.0 前後だと肩が落ちる。
        const dome = cfg.moundPeak * Math.pow(Math.max(0, 1 - u * u), 1.00);
        const fade = 1 - smooth(0.80, 1.0, u);
        const sd = cfg.seed ^ 0x77;
        const lump = ((Noise.value3(x * 0.50 + 31, z * 0.50 + 17, 5.3, sd) - 0.5) * 2.0
            + (Noise.value3(x * 1.30 + 7, z * 1.30 + 3, 2.1, sd + 91) - 0.5) * 1.1)
            * cfg.moundLump * fade;
        return cfg.riceEdgeY + dome + lump;
    }
    function moundN(x, z, cfg) {
        const e = 0.07;
        const dx = (moundY(x + e, z, cfg) - moundY(x - e, z, cfg)) / (2 * e);
        const dz = (moundY(x, z + e, cfg) - moundY(x, z - e, cfg)) / (2 * e);
        const n = new V3(-dx, 1, -dz);
        n.normalize();
        return n;
    }

    // 粒のすき間から器の内側が見えないように、盛りの形そのものを1枚張る。
    function buildRiceBody(scene, cfg, mat) {
        const NR = 64, NS = 144, R = cfg.riceR * 1.04;
        const sd = (cfg.seed ^ 0x33AB) >>> 0;
        const nV = (NR + 1) * (NS + 1);
        const positions = new Float32Array(nV * 3);
        const normals = new Float32Array(nV * 3);
        const uvs = new Float32Array(nV * 2);
        const colors = new Float32Array(nV * 4);
        const indices = new Uint32Array(NR * NS * 6);
        let vo = 0;
        for (let i = 0; i <= NR; i++) {
            const u = i / NR, r = R * u;
            for (let j = 0; j <= NS; j++) {
                const th = (j % NS) / NS * TAU;
                const x = r * Math.cos(th), z = r * Math.sin(th);
                const p3 = vo * 3, p2 = vo * 2, p4 = vo * 4;
                positions[p3] = x;
                // 【対策】下地を数学的になめらかな面にすると、粒のすき間から
                //         見えた瞬間に「水面」になる。粒と同じ凹凸を持たせる。
                const bump = (Noise.value3(x * 2.4 + 5, z * 2.4 + 9, 1.7, sd) - 0.5) * 2 * 0.085
                    + (Noise.value3(x * 6.0 + 2, z * 6.0 + 4, 3.3, sd + 29) - 0.5) * 2 * 0.040;
                positions[p3 + 1] = moundY(x, z, cfg) - 0.18 + bump;
                positions[p3 + 2] = z;
                uvs[p2] = j / NS * 6; uvs[p2 + 1] = u * 6;
                // 【対策】0.38 は単体では妥当でも、粒の擬似AO・SSAOと重なると
                //         山全体のトーンを引き下げ、白飯が灰色に見える主因の
                //         ひとつになる。谷の暗さは擬似AO側で作る。
                const k = 0.52 * (1 - 0.30 * smooth(0.55, 1.0, u));
                colors[p4] = k * 1.06; colors[p4 + 1] = k * 0.98; colors[p4 + 2] = k * 0.78; colors[p4 + 3] = 1;
                vo++;
            }
        }
        let io = 0;
        for (let i = 0; i < NR; i++) {
            for (let j = 0; j < NS; j++) {
                const a = i * (NS + 1) + j, b = a + 1, c = a + (NS + 1), d = c + 1;
                indices[io++] = a; indices[io++] = c; indices[io++] = b;
                indices[io++] = b; indices[io++] = c; indices[io++] = d;
            }
        }
        BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        if (normals[(NR * (NS + 1)) * 3 + 1] < 0) {
            for (let k = 0; k < indices.length; k += 3) {
                const t = indices[k + 1]; indices[k + 1] = indices[k + 2]; indices[k + 2] = t;
            }
            BABYLON.VertexData.ComputeNormals(positions, indices, normals);
        }
        const vd = new BABYLON.VertexData();
        vd.positions = positions; vd.normals = normals; vd.uvs = uvs;
        vd.colors = colors; vd.indices = indices;
        const mesh = new BABYLON.Mesh("riceBody", scene);
        named(mesh, "riceBody");
        vd.applyToMesh(mesh, false);
        mesh.hasVertexAlpha = false;
        mesh.material = mat;
        mesh.receiveShadows = true;
        mesh.tris = NR * NS * 2;
        return mesh;
    }

    // =================================================================
    // 9. Grains : 配置と「粒間の暗がり」の焼き込み
    // =================================================================
    function placeGrains(cfg, rng) {
        const cseed = (cfg.seed ^ 0x51ED) >>> 0;
        const _cc = new Map();
        const rngC = (ci) => {
            let r = _cc.get(ci);
            if (!r) { r = new Rng((cseed + ci * 2654435761) >>> 0); _cc.set(ci, r); }
            return r;
        };
        const n = cfg.grainCount;
        const Rmax = cfg.riceR - cfg.grainMargin;
        const out = [];
        // 【対策】1粒ずつ独立に撒くと、統計的に均一な絨毯になる。実物のごはんは
        //         数粒がくっついた塊と、そのあいだの空隙でできている。
        const CS = Math.max(1, cfg.clusterSize | 0);
        const cn = Math.ceil(n / CS);
        for (let i = 0; i < n; i++) {
            const ci = (i / CS) | 0;
            const rc0 = rngC(ci);
            // 【対策】sqrt は円板を面積等分する。ところが盛りは外側ほど傾いていて
            //         実面積が大きく、横から見ると外周が最も広く見える。
            const rc = Rmax * Math.pow((ci + 0.5) / cn, 0.42) * rc0.range(0.90, 1.10);
            const thc = rc0.range(0, TAU);
            const off = rng.range(0, 0.34), oa = rng.range(0, TAU);
            let x = rc * Math.cos(thc) + Math.cos(oa) * off;
            let z = rc * Math.sin(thc) + Math.sin(oa) * off;
            const rr = Math.hypot(x, z) || 1;
            if (rr > Rmax) { const k = Rmax / rr; x *= k; z *= k; }
            const r = Math.hypot(x, z);
            // 【対策】全粒を面ぴったりに置くと、モザイクを貼ったように
            //         隙間なく敷き詰まって「型に詰めたごはん」になる。
            const g0 = cfg.grainSink[0], g1 = cfg.grainSink[1];
            const t = rng.next();
            const sink = (t < cfg.grainLiftRatio)
                ? -cfg.grainLift * (t / cfg.grainLiftRatio)          // 浮いた粒
                : g0 + (g1 - g0) * Math.pow((t - cfg.grainLiftRatio)
                    / (1 - cfg.grainLiftRatio), 1.9);
            out.push({ x, z, r, y: moundY(x, z, cfg) - sink });
        }
        return out;
    }

    // ---- 擬似AO ------------------------------------------------------
    function bakeAO(pts, cfg) {
        const cell = 0.36, OFF = 4096;
        const key = (i, j) => (i + OFF) * 100003 + (j + OFF);
        // 【対策】素の高さで近傍最高点を取ると、盛りの斜面そのものの傾きを
        //         「沈み込み」として拾ってしまう。残差に直してから比べる。
        const top = new Map();
        for (const p of pts) {
            p.res = p.y - moundY(p.x, p.z, cfg);
            const i = Math.floor(p.x / cell), j = Math.floor(p.z / cell);
            const k = key(i, j);
            const cur = top.get(k);
            if (cur === undefined || p.res > cur) top.set(k, p.res);
        }
        for (const p of pts) {
            const i0 = Math.floor(p.x / cell), j0 = Math.floor(p.z / cell);
            let m = -1e9;
            for (let di = -1; di <= 1; di++) {
                for (let dj = -1; dj <= 1; dj++) {
                    const v = top.get(key(i0 + di, j0 + dj));
                    if (v !== undefined && v > m) m = v;
                }
            }
            let ao = clamp(1 - (m - p.res) / cfg.aoDepth, 0, 1);
            ao = cfg.aoFloor + (1 - cfg.aoFloor) * Math.pow(ao, 0.75);
            const wall = smooth(cfg.riceR * 0.66, cfg.riceR, p.r);
            ao *= 1 - cfg.aoWall * wall;
            p.ao = ao;
        }
        return pts;
    }

    // 【対策】遮蔽ぶんを一様に引くと、谷は必ず中性グレーになる。米粒は
    //         ほぼ半透明なので、谷に落ちた光は隣の粒を通り抜けて黄色みを
    //         帯びて戻る。ただし青を 0.30 も落とすと黄土色まで転ぶので、
    //         効き目が分かる最小限（青 0.16 / 赤 0.06）にする。
    function aoColor(ao, strength) {
        const v = clamp(1 - (1 - ao) * strength, 0.02, 1);
        const w = 1 - v;                      // 暗さ 0..1
        return new BABYLON.Color4(
            v * (1 + 0.06 * w),               // 赤はむしろ持ち上げる
            v * (1 - 0.02 * w),
            v * (1 - 0.16 * w), 1);
    }

    function buildGrains(scene, cfg, mat, rng) {
        const variants = [];
        for (let vi = 0; vi < cfg.grainVariants; vi++) {
            variants.push(makeMesh("grain" + vi, scene, cfg, (cfg.seed + vi * 1013) >>> 0,
                cfg.grainRings, cfg.grainSides, mat, 1, true));
        }
        const pts = bakeAO(placeGrains(cfg, rng), cfg);
        const used = new Set();
        const nodes = [];
        const up = new V3(0, 1, 0);
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            const variant = variants[i % variants.length];
            let node;
            if (!used.has(variant)) { used.add(variant); node = variant; }
            else node = variant.createInstance("g" + i);

            node.position.set(p.x, p.y, p.z);

            const nrm = moundN(p.x, p.z, cfg);
            const axis = V3.Cross(up, nrm);
            const len = axis.length();
            let q = (len < 1e-5)
                ? BABYLON.Quaternion.Identity()
                : BABYLON.Quaternion.RotationAxis(axis.scale(1 / len), Math.asin(clamp(len, -1, 1)));
            const spin = BABYLON.Quaternion.RotationAxis(nrm, rng.range(0, TAU));
            let rv = new V3(rng.gauss(0, 1), rng.gauss(0, 1), rng.gauss(0, 1));
            if (rv.lengthSquared() < 1e-8) rv = new V3(1, 0, 0);
            rv.normalize();
            // 【対策】全粒を同じばらつきで寝かせると整列して見える。
            //         少数の立った粒がふっくら感の正体。
            const loose = rng.next() < 0.42;
            const tilt = BABYLON.Quaternion.RotationAxis(rv, rng.gauss(0, loose ? 1.15 : 0.26));
            node.rotationQuaternion = tilt.multiply(spin.multiply(q));

            // 【対策】全粒が同じ縦横比だと整った工業製品に見える。
            const broken = rng.next() < 0.16;
            node.scaling.set(
                broken ? rng.range(0.60, 0.80) : rng.range(0.92, 1.08),
                rng.range(0.94, 1.06), rng.range(0.94, 1.06));
            node.instancedBuffers.color = aoColor(p.ao, cfg.aoStrength);
            nodes.push(node);
        }
        return { variants, nodes, pts };
    }

    // =================================================================
    // 10. WoodLab : 板目のテクスチャ
    // =================================================================
    // 【対策】年輪を sin(距離) で描くと等間隔・等濃度の縞になり、
    //   段ボールに見える。年輪の番号をハッシュして、幅・濃さ・位相を
    //   1本ずつ振ること。木目が「木」に見えるかどうかはここで決まる
    const WoodLab = {
        fields(size, seed, P) {
            const n = size * size, EXT = P.extent;
            const F = {
                h: new Float32Array(n), late: new Float32Array(n),
                plank: new Float32Array(n), pore: new Float32Array(n)
            };
            const hash1 = (i, s) => Noise._h2(i | 0, 17, s);
            for (let y = 0; y < size; y++) {
                const Z = y / size * EXT;
                // 板の番号と、板の中での位置
                const pi = Math.floor(Z / P.plankW);
                const Zl = Z - pi * P.plankW;
                const ph = hash1(pi, seed + 5);
                // 【対策】髄（年輪の中心）を板の外へ置く。板の中に置くと
                //   同心円が出て「輪切り」になる。板目は必ず外に髄がある
                const ctr = -P.ringCenter * (0.6 + 0.8 * hash1(pi, seed + 11));
                for (let x = 0; x < size; x++) {
                    const X = x / size * EXT, i = y * size + x;
                    // 髄からの距離。木理のうねりを2階層足して「杢」を出す
                    let dd = Math.abs(Zl - ctr) + ph * P.pitch;
                    dd += P.figure * (Noise.fbmFree(X * 0.085 + pi * 13, 3.1, seed + 23, 3) - 0.5);
                    dd += P.figure * 0.35 * (Noise.fbmFree(X * 0.30 + 7, Zl * 0.09, seed + 37, 2) - 0.5);
                    // 年輪の番号。1本ずつ幅と濃さを振る
                    const t = dd / P.pitch;
                    const ri = Math.floor(t);
                    const h1 = hash1(ri + pi * 977, seed + 53);
                    const h2 = hash1(ri + pi * 977, seed + 71);
                    const f = t - ri + 0.30 * (h1 - 0.5);
                    const lw = P.lateW * (0.50 + 1.00 * h1);
                    const late = smooth(1 - lw, 1 - lw * 0.22, clamp(f, 0, 1)) * (0.55 + 0.90 * h2);
                    F.late[i] = clamp(late, 0, 1);
                    // 導管（早材側にだけ出る細い穴）
                    const fib = Noise.fbmFree(X * 3.2, Z * 46, seed + 89, 2) - 0.5;
                    const pn = Noise.valFree(X * 2.6 + 31, Z * 62 + 3, seed + 101);
                    const pore = smooth(0.86, 0.99, pn) * (1 - F.late[i]) * P.pore;
                    F.pore[i] = pore;
                    // 板と板の継ぎ目
                    const seam = 1 - smooth(0.0, P.seamW, Math.min(Zl, P.plankW - Zl));
                    F.plank[i] = seam;
                    F.h[i] = 0.55 - 0.16 * F.late[i] + 0.05 * fib - 0.35 * pore - 0.45 * seam;
                }
            }
            return F;
        },

        build(scene, P, seed) {
            const S = P.tex;
            const F = this.fields(S, seed, P);
            const albedo = TextureLab._canvas("woodAlbedo", S, (d, w) => {
                for (let i = 0; i < w * w; i++) {
                    const k = F.late[i];
                    const r = mix(P.early[0], P.late[0], k);
                    const g = mix(P.early[1], P.late[1], k);
                    const b = mix(P.early[2], P.late[2], k);
                    const sh = 1 - 0.30 * F.pore[i] - 0.45 * F.plank[i];
                    const o = i * 4;
                    d[o] = clamp(r * sh, 0, 1) * 255;
                    d[o + 1] = clamp(g * sh, 0, 1) * 255;
                    d[o + 2] = clamp(b * sh, 0, 1) * 255;
                    d[o + 3] = 255;
                }
            }, scene);
            // 【対策】粗さが一様だと、天板がただの一枚鏡になって空を映すだけの
            //   面になる。晩材は硬くて滑らか、導管と継ぎ目はざらつく
            const orm = TextureLab._canvas("woodORM", S, (d, w) => {
                for (let i = 0; i < w * w; i++) {
                    const rough = clamp(P.rough - 0.10 * F.late[i] + 0.16 * F.pore[i]
                        + 0.10 * F.plank[i], 0.18, 0.95);
                    const o = i * 4;
                    d[o] = clamp(1 - 0.35 * F.plank[i] - 0.25 * F.pore[i], 0, 1) * 255;
                    d[o + 1] = rough * 255;
                    d[o + 2] = 0; d[o + 3] = 255;
                }
            }, scene);
            const normal = TextureLab.normalMap(scene, S, F.h, 2.2, "woodNormal");
            // 【対策】天板は視線に対してほぼ寝ているので、遠い側は1画素に
            //   何十本もの年輪が入る。異方性フィルタが無いとモアレが出る
            for (const t of [albedo, orm, normal]) {
                t.anisotropicFilteringLevel = 16;
                // extent と天板の直径を一致させてあるので、タイルは 1 枚だけ
                t.uScale = TABLE.diameter / P.extent;
                t.vScale = TABLE.diameter / P.extent;
            }
            return { albedo, orm, normal };
        }
    };

    // =================================================================
    // 11. Scene
    // =================================================================
    const scene = new BABYLON.Scene(engine);
    // スカイボックスや背景幕を出しているあいだ、この色は見えない
    scene.clearColor = new BABYLON.Color4(0.030, 0.028, 0.026, 1);

    const camera = new BABYLON.ArcRotateCamera("cam", -1.05, 1.06, 21, new V3(0, 3.7, 0), scene);
    camera.attachControl(true);
    camera.wheelPrecision = 10;
    // 【対策】ポストプロセスを通すとシーンは深度つきのRTへ描かれる。
    //         効くのは maxZ/minZ の比。遠クリップを 520 へ伸ばしたぶん
    //         近クリップも上げる（520/4 = 130）。
    camera.minZ = GLOBAL.camNear;
    camera.maxZ = GLOBAL.camFar;
    // 【対策】近クリップが 4cm なので、寄れる限界も上げる
    camera.lowerRadiusLimit = 11;
    // 【対策】背景幕の半径より外へカメラを出すと、幕は内向きの面なので
    //         背面カリングで消え、黒が戻る。必ず幕の内側で止める。
    camera.upperRadiusLimit = Math.min(90, BACKDROP.radius - 12);
    camera.upperBetaLimit = 1.52;   // テーブルの下へ潜らせない
    scene.cameraToUseForPointers = camera;

    // ---- 灯 -----------------------------------------------------------
    // 【対策】ここの比（key ÷ fill）が「白が白く見えるか」を決める。
    //   実値は ENVS のプリセットが入れる。GUI からも直接いじれる
    const key = new BABYLON.DirectionalLight("key", new V3(-0.48, -0.92, 0.44).normalize(), scene);
    key.position = new V3(16, 30, -14);
    key.intensity = 1.70;
    key.diffuse = new BABYLON.Color3(1.0, 0.972, 0.930);
    // 【対策】平行光の影の範囲は、既定だとキャスターのバウンディング
    //         ボックスにぴったり合わせられる。すると影の落ちる先
    //         （テーブル）が範囲外になり、影が直線でぶつ切りになる。
    //         参照オブジェクトが ±16cm まで並ぶので、そこまで含める
    key.autoUpdateExtends = false;
    key.orthoLeft = -22; key.orthoRight = 22;
    key.orthoBottom = -22; key.orthoTop = 22;
    key.shadowMinZ = 1; key.shadowMaxZ = 70;

    const back = new BABYLON.DirectionalLight("back", new V3(0.42, -0.26, -1.0).normalize(), scene);
    back.intensity = 1.00;
    back.diffuse = new BABYLON.Color3(1.0, 0.93, 0.84);
    back.specular = new BABYLON.Color3(0.55, 0.55, 0.55);

    // 【対策】これがレフ板。0.34 では回り込みが足りず、反射率 90% の白球
    //   でさえ影側が中間調まで落ちて灰色に見える。実物の料理写真は
    //   大きなソフトボックスとレフ板で照明比 1.3〜1.6 倍に収めている
    const fill = new BABYLON.HemisphericLight("fill", new V3(0, 1, 0), scene);
    fill.intensity = 0.80;
    // 【対策】半球光の下半分は groundColor。既定の黒のままだと、下から
    //   受けるはずの面がまったく持ち上がらない。テーブルの照り返しとして
    //   木の色を薄く入れる
    fill.groundColor = new BABYLON.Color3(0.30, 0.26, 0.22);
    fill.specular = new BABYLON.Color3(0, 0, 0);

    const sg = new BABYLON.ShadowGenerator(2048, key);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = BABYLON.ShadowGenerator.QUALITY_HIGH;
    sg.bias = 0.004;
    sg.normalBias = 0.014;
    // 【対策】照明比を下げたので、影も浅くなるのが物理的に正しい。
    //   0.32 のままだと影だけが取り残されて硬く見える
    sg.setDarkness(0.45);

    // ---- 丸テーブル ---------------------------------------------------
    const woodTex = WoodLab.build(scene, WOOD, 2117);

    const tableMat = new BABYLON.PBRMaterial("tableMat", scene);
    tableMat.albedoTexture = woodTex.albedo;
    tableMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    tableMat.metallicTexture = woodTex.orm;
    tableMat.useAmbientOcclusionFromMetallicTextureRed = true;
    tableMat.useRoughnessFromMetallicTextureGreen = true;
    tableMat.useMetallnessFromMetallicTextureBlue = true;
    tableMat.bumpTexture = woodTex.normal;
    tableMat.bumpTexture.level = 0.65;
    tableMat.metallic = 0.0;
    tableMat.roughness = 1.0;              // 実値は ORM の G
    // 【対策】塗装の層。強くすると屋外 IBL の空をそのまま映して
    //         プラスチックの天板になる。うっすら艶が出る程度に留める
    tableMat.clearCoat.isEnabled = true;
    tableMat.clearCoat.intensity = 0.20;
    tableMat.clearCoat.roughness = 0.35;

    const ironMat = new BABYLON.PBRMaterial("ironMat", scene);
    ironMat.albedoColor = new BABYLON.Color3(0.045, 0.045, 0.050);
    ironMat.metallic = 0.35;
    ironMat.roughness = 0.44;

    // 【対策】CreateCylinder の既定 UV は
    //   天面 = 直径いっぱいの円板投影 / 側面 = 周長 201cm を u=0..1 に押し込む。
    //   同じスケールでは側面だけ 60 倍以上に引き伸ばされて細い縞になる。
    //   faceUV（[0]=底面 / [1]=側面 / [2]=天面）で側面だけ別に貼る
    const tableFaceUV = [
        new BABYLON.Vector4(0, 0, 1, 1),                                   // 底面（見えない）
        new BABYLON.Vector4(0, WOOD.edgeV0, WOOD.edgeRepeat, WOOD.edgeV1), // 側面（木端）
        new BABYLON.Vector4(0, 0, 1, 1)                                    // 天面
    ];
    const table = BABYLON.MeshBuilder.CreateCylinder("table", {
        height: TABLE.thickness, diameter: TABLE.diameter,
        tessellation: 96, faceUV: tableFaceUV
    }, scene);
    named(table, "table");
    // 天板の上面を y = 0（器の接地面）に合わせる
    table.position.y = -TABLE.thickness / 2;
    table.material = tableMat;
    table.receiveShadows = true;

    const tableColumn = BABYLON.MeshBuilder.CreateCylinder("tableColumn",
        { height: TABLE.pedestal, diameterTop: 7.4, diameterBottom: 9.0, tessellation: 48 }, scene);
    named(tableColumn, "tableColumn");
    tableColumn.position.y = -TABLE.thickness - TABLE.pedestal / 2;
    tableColumn.material = ironMat;

    const tableFoot = BABYLON.MeshBuilder.CreateCylinder("tableFoot",
        { height: 2.4, diameterTop: TABLE.footDia * 0.82, diameterBottom: TABLE.footDia, tessellation: 64 }, scene);
    named(tableFoot, "tableFoot");
    tableFoot.position.y = -TABLE.thickness - TABLE.pedestal + 1.2;
    tableFoot.material = ironMat;

    // ---- 参照オブジェクト ----------------------------------------------
    //  【対策】並べる向きは「ワールドの X 軸」ではなく「画面の横方向」。
    //    カメラの方位角 α に対して、画面の横は (sinα, 0, -cosα) の向き。
    //    X 軸で決め打ちすると、既定のカメラ角度では手前と奥に並んで
    //    比較にならない。
    const refMeshes = [];
    const refMats = [];
    (function buildRefs() {
        const a = camera.alpha;
        const ux = Math.sin(a), uz = -Math.cos(a);   // 画面の横方向（xz平面）
        for (const it of REF.items) {
            const m = (it.kind === "cube")
                ? BABYLON.MeshBuilder.CreateBox(it.id, { size: REF.size }, scene)
                : BABYLON.MeshBuilder.CreateSphere(it.id, { diameter: REF.size, segments: 48 }, scene);
            named(m, it.id);
            m.position.set(ux * it.at, REF.size * 0.5, uz * it.at);

            const mat = new BABYLON.PBRMaterial(it.id + "Mat", scene);
            mat.albedoColor = col3(it.albedo);
            mat.metallic = it.metallic;
            mat.roughness = it.rough;
            // 【対策】クリアコートも透光も付けない。米のマテリアルと同じ
            //   飾りを付けると「比較の基準」ではなくなる
            mat.clearCoat.isEnabled = false;
            mat.subSurface.isTranslucencyEnabled = false;
            m.material = mat;
            m.receiveShadows = true;
            m.setEnabled(REF.start);
            refMeshes.push(m);
            refMats.push(mat);
        }
    })();

    // ---- 背景幕（ホリゾント）------------------------------------------
    function backdropTexture() {
        const H = 256;
        // 【対策】DynamicTexture の invertY を明示する。省略するとバージョンに
        //         よって上下が入れ替わり、空が明るく足元が暗い逆さまの幕になる。
        //         それでも逆に出るときは BACKDROP.flipV を true にする。
        // 【対策】TEXTUREFORMAT_RGBA は環境によって BABYLON.Engine 側に
        //         無いことがある。Constants を先に見て、無ければ Engine。
        const CONST = BABYLON.Constants || BABYLON.Engine || {};
        const FMT = (CONST.TEXTUREFORMAT_RGBA !== undefined) ? CONST.TEXTUREFORMAT_RGBA : 5;
        const dt = new BABYLON.DynamicTexture("cycTex", { width: 8, height: H }, scene,
            true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE, FMT, false);
        const ctx = dt.getContext();
        const img = ctx.createImageData(8, H);
        for (let y = 0; y < H; y++) {
            const v = y / (H - 1);           // invertY=false なので y=0 が下端
            const t = Math.pow(v, BACKDROP.curve);
            for (let x = 0; x < 8; x++) {
                const i = (y * 8 + x) * 4;
                for (let c = 0; c < 3; c++) {
                    img.data[i + c] = clamp(mix(BACKDROP.bottom[c], BACKDROP.top[c], t), 0, 1) * 255;
                }
                img.data[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        dt.update(false);
        dt.hasAlpha = false;
        // 【対策】既定の WRAP のままだと、上下端で反対側の色が1px にじんで
        //         幕の天地に細い線が出る。必ず CLAMP にする。
        dt.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
        dt.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        if (BACKDROP.flipV) { dt.vScale = -1; dt.vOffset = 1; }
        return dt;
    }

    const cycTex = backdropTexture();
    const cyclo = BABYLON.MeshBuilder.CreateCylinder("cyclorama", {
        diameter: BACKDROP.radius * 2,
        height: BACKDROP.height,
        tessellation: 96,
        // 【対策】内側から見るので面を裏返す。これを忘れると背面カリングで
        //         何も見えず、「幕を置いたのに黒いまま」になる。
        sideOrientation: BABYLON.Mesh.BACKSIDE
    }, scene);
    named(cyclo, "cyclorama");
    cyclo.position.y = BACKDROP.y;
    // 【対策】ピック対象に残すと、Inspector や scene.pick で手前の幕ばかり
    //         当たって器や粒が選べなくなる。
    cyclo.isPickable = false;
    cyclo.receiveShadows = false;   // 幕に器の影が落ちると、幕の距離感が壊れる

    const cycMat = new BABYLON.PBRMaterial("cycMat", scene);
    cycMat.albedoColor = new BABYLON.Color3(1, 1, 1);
    cycMat.albedoTexture = cycTex;
    cycMat.metallic = 0.0;
    cycMat.roughness = 1.0;
    // 【対策】幕にライティングを受けさせると、キーライトの当たった側だけ
    //         明るいホットスポットが出て「円筒である」ことが一目で分かる。
    cycMat.unlit = true;
    cyclo.material = cycMat;

    // ---- 画像処理 -----------------------------------------------------
    const ip = scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true;
    // 【対策】ACES は入力リニア 0.18 を出力で約 0.10 まで落とすカーブ。
    //   中間調を締めるのが目的なので、白い被写体の階調はそのぶん灰色側へ
    //   寄る。STANDARD にすると中間調が持ち上がる代わりにハイライトの
    //   粘りが減る。GUI で切り替えて比べられるようにした
    function applyToneMapping() {
        ip.toneMappingType = GLOBAL.useACES
            ? BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES
            : BABYLON.ImageProcessingConfiguration.TONEMAPPING_STANDARD;
    }
    applyToneMapping();
    ip.exposure = 1.02;
    ip.contrast = 0.98;
    ip.vignetteEnabled = true;
    ip.vignetteWeight = 0.9;
    ip.vignetteCameraFov = 0.7;
    ip.vignetteBlendMode = BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;

    // ---- 環境（IBL / スカイボックス）------------------------------------
    // 【対策】environmentTexture は IBL（反射と環境光）にしか使われない。
    //         これを入れても背景は描かれず、clearColor がそのまま出る。
    const envCache = {};
    let currentEnv = START_ENV;
    let skybox = null;

    function getEnvTex(k) {
        if (!envCache[k]) {
            const E = ENVS[k];
            const t = BABYLON.CubeTexture.CreateFromPrefilteredData(E.url, scene);
            t.rotationY = E.rotationY;
            // 【対策】ここをぼかすと、器の釉薬と米の水膜が拾う環境が
            //         全方向で同じ値になり、ハイライトが消えてのっぺりする
            t.lodGenerationOffset = 0.10;
            envCache[k] = t;
        }
        return envCache[k];
    }

    // GUI のスライダー参照（applyEnv から値を追従させる。GUI より先に
    // applyEnv が走るので、存在チェックしてから触る）
    let sExp = null, sCon = null, sEnvI = null, sKey = null, sFill = null;

    function applyEnv(k) {
        currentEnv = k;
        const E = ENVS[k];
        const tex = getEnvTex(k);
        scene.environmentTexture = tex;
        scene.environmentIntensity = E.env;
        scene.clearColor = new BABYLON.Color4(E.clear[0], E.clear[1], E.clear[2], 1);

        // 【対策】createDefaultSkybox は環境テクスチャを clone して専用
        //         マテリアルに貼る。dispose(false, true) で消しても、
        //         キャッシュしている元の CubeTexture は生き残る
        if (skybox) { try { skybox.dispose(false, true); } catch (e) { } skybox = null; }
        if (E.skybox) {
            // 第2引数 pbr = true、最後の setGlobalEnvTexture = false
            //（環境はこちらで面倒を見るので任せない）
            skybox = scene.createDefaultSkybox(tex, true, GLOBAL.skyboxSize, E.skyboxBlur, false);
            if (skybox) {
                named(skybox, "skyBox");
                skybox.isPickable = false;
                skybox.receiveShadows = false;
            }
        }
        // 背景幕はスタジオ専用。屋外では邪魔にしかならない
        cyclo.setEnabled(!!E.backdrop);

        key.intensity = E.key;
        back.intensity = E.back;
        fill.intensity = E.fill;
        ip.exposure = E.exposure;
        ip.contrast = E.contrast;
        ip.vignetteWeight = E.vignette;

        if (sExp) sExp.slider.value = E.exposure;
        if (sCon) sCon.slider.value = E.contrast;
        if (sEnvI) sEnvI.slider.value = E.env;
        if (sKey) sKey.slider.value = E.key;
        if (sFill) sFill.slider.value = E.fill;
    }

    applyEnv(currentEnv);

    // ---- 湯気 ---------------------------------------------------------
    function steamTexture() {
        const dt = new BABYLON.DynamicTexture("steamTex", { width: 128, height: 128 }, scene, true);
        const ctx = dt.getContext();
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0.0, "rgba(255,255,255,1)");
        g.addColorStop(0.45, "rgba(255,255,255,0.45)");
        g.addColorStop(1.0, "rgba(255,255,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        dt.update();
        dt.hasAlpha = true;
        return dt;
    }
    const steamTex = steamTexture();
    const steam = new BABYLON.ParticleSystem("steam", 400, scene);
    steam.particleTexture = steamTex;
    steam.emitter = new V3(0, 7.6, 0);
    steam.minEmitBox = new V3(-1.5, -0.3, -1.5);
    steam.maxEmitBox = new V3(1.5, 0.2, 1.5);
    // 【対策】加算合成にすると湯気が発光して見える。湯気は光っていない。
    steam.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    steam.color1 = new BABYLON.Color4(1, 1, 1, 0.055);
    steam.color2 = new BABYLON.Color4(0.95, 0.95, 0.95, 0.028);
    steam.colorDead = new BABYLON.Color4(1, 1, 1, 0);
    steam.minSize = 0.6; steam.maxSize = 2.1;
    steam.minLifeTime = 1.8; steam.maxLifeTime = 3.4;
    steam.emitRate = 90;
    steam.gravity = new V3(0, 1.1, 0);
    steam.direction1 = new V3(-0.35, 1.4, -0.35);
    steam.direction2 = new V3(0.35, 2.4, 0.35);
    steam.minAngularSpeed = -0.5; steam.maxAngularSpeed = 0.5;
    steam.minEmitPower = 0.4; steam.maxEmitPower = 1.0;
    steam.updateSpeed = 0.012;

    // =================================================================
    //  組み立て / 差し替え
    // =================================================================
    let state = null;              // { cfg, assets, bowlMat, bowl, body, grains }
    const riceCache = {};          // 状態 → GrainAssets
    const bowlMatCache = {};       // 器 → PBRMaterial
    let ssao = null;
    let onRebuilt = null;

    function disposeScene(st) {
        if (!st) return;
        const srcs = new Set(st.grains.variants);
        for (const n of st.grains.nodes) if (!srcs.has(n)) n.dispose();
        for (const m of st.grains.variants) m.dispose();
        st.body.dispose();
        st.bowl.dispose();
    }

    function build(stateKey, bowlKey, seed) {
        if (state) { disposeScene(state); state = null; }

        const cfg = buildConfig(stateKey, bowlKey, seed);

        let assets = riceCache[stateKey];
        if (!assets) {
            assets = new GrainAssets(scene, buildConfig(stateKey, bowlKey, 20260101));
            assets.mat = assets.makeMaterial("riceMat_" + stateKey, 1);
            // 【対策】下地に粒と同じマテリアルを貼ると、クリアコート（水の膜）が
            //         なめらかな面の上でそのまま鏡面になり、白い水がたまって
            //         見える。下地は「谷の底の影」なので、艶も透光も要らない。
            const bm = new BABYLON.PBRMaterial("riceBodyMat_" + stateKey, scene);
            bm.albedoColor = col3(PRESETS[stateKey].albedo);
            bm.metallic = 0.0;
            bm.roughness = 0.85;
            bm.clearCoat.isEnabled = false;
            bm.subSurface.isTranslucencyEnabled = false;
            assets.bodyMat = bm;
            assets.mats.push(bm);   // dispose のために登録（スライダーは効かない）
            riceCache[stateKey] = assets;
        }
        let bmat = bowlMatCache[bowlKey];
        if (!bmat) {
            bmat = bowlMaterial(scene, cfg, "bowlMat_" + bowlKey);
            bowlMatCache[bowlKey] = bmat;
        }

        const rng = new Rng((seed ^ 0x2F17) >>> 0);
        const bowl = buildBowl(scene, cfg, bmat, new Rng((seed ^ 0x9E11) >>> 0));
        const body = buildRiceBody(scene, cfg, assets.bodyMat);
        const grains = buildGrains(scene, cfg, assets.mat, rng);

        state = { cfg, assets, bowlMat: bmat, bowl, body, grains };

        // 【対策】2500粒をシャドウマップにも描くと頂点数が倍になる。
        //         キャスターは器と盛りの下地だけにする。
        // 【対策】renderList を空にしてから足し直すので、参照オブジェクトも
        //         ここで登録し直さないと、よそい直すたびに影が消える
        const smap = sg.getShadowMap();
        if (smap && smap.renderList) smap.renderList.length = 0;
        sg.addShadowCaster(bowl, true);
        sg.addShadowCaster(body, true);
        for (const m of refMeshes) sg.addShadowCaster(m);

        steam.emitter = new V3(0, cfg.riceEdgeY + cfg.moundPeak + 0.2, 0);
        applyLive();
        if (onRebuilt) onRebuilt(state);

        let aMin = 1, aSum = 0;
        for (const p of grains.pts) { aSum += p.ao; if (p.ao < aMin) aMin = p.ao; }
        console.log("[Rice]", cfg.label, "/", cfg.bowl.label, "/ env =", currentEnv,
            "/ 照明比 key/fill =", (key.intensity / Math.max(1e-6, fill.intensity)).toFixed(2),
            "/ AO min/mean =", aMin.toFixed(3), (aSum / grains.pts.length).toFixed(3),
            "/ tris =", cfg.grainCount * grains.variants[0].info.tris + body.tris + bowl.tris,
            "/ seed =", cfg.seed);
        return state;
    }

    // ---- GUIから触る値 ------------------------------------------------
    const live = {
        translucency: PRESETS[START_STATE].translucency,
        coat: 1.0, bump: 1.0, ao: GLOBAL.aoStrength
    };
    let lastStateKey = null;

    function applyLive() {
        if (!state) return;
        for (const mat of state.assets.mats) {
            mat.subSurface.translucencyIntensity = clamp(live.translucency, 0, 0.95);
            mat.clearCoat.intensity = live.coat;
            if (mat.bumpTexture) mat.bumpTexture.level = live.bump;
        }
        const pts = state.grains.pts, nodes = state.grains.nodes;
        for (let i = 0; i < nodes.length; i++) {
            nodes[i].instancedBuffers.color = aoColor(pts[i].ao, live.ao);
        }
    }

    let currentState = START_STATE, currentBowl = START_BOWL, currentSeed = START_SEED;
    build(currentState, currentBowl, currentSeed);
    lastStateKey = currentState;

    if (GLOBAL.useSSAO) {
        // 擬似AOは粒どうしの関係、SSAOは器と盛りの境目のような大きい陰り担当
        ssao = new BABYLON.SSAO2RenderingPipeline("ssao", scene,
            { ssaoRatio: 0.75, blurRatio: 1.0 }, [camera]);
        // 【対策】半径を粒の幅（約0.3cm）に近づけると、粒という粒の輪郭に
        //         黒い縁がついて全体が汚れる。粒どうしの陰りは擬似AOの担当。
        ssao.radius = 1.30;
        // 【対策】照明比を下げて回り込みを増やしたので、SSAO を強く残すと
        //         そこだけ辻褄が合わなくなる。0.35 → 0.28
        ssao.totalStrength = 0.28;
        ssao.samples = 16;
        ssao.expensiveBlur = true;
        ssao.maxZ = 160;
        ssao.minZAspect = 0.25;
    }
    const dp = new BABYLON.DefaultRenderingPipeline("dp", true, scene, [camera]);
    dp.samples = 4;
    dp.fxaaEnabled = true;
    dp.bloomEnabled = true;
    dp.bloomThreshold = 0.90;
    dp.bloomWeight = 0.14;
    dp.bloomKernel = 44;
    dp.bloomScale = 0.6;
    dp.sharpenEnabled = true;
    dp.sharpen.edgeAmount = 0.18;
    dp.depthOfFieldEnabled = GLOBAL.useDOF;
    dp.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel.High;
    dp.depthOfField.lensSize = 50;
    dp.depthOfField.fStop = GLOBAL.dofFStop;
    scene.onBeforeRenderObservable.add(() => {
        if (!dp.depthOfFieldEnabled) return;
        // ピントは常にカメラの注視点（＝茶碗の中心）に置く
        const focus = camera.radius * 1000;
        dp.depthOfField.focusDistance = focus;
        dp.depthOfField.focalLength = focus * GLOBAL.dofRatio;
    });

    // =================================================================
    //  GUI
    // =================================================================
    const GUI_MASK = 0x20000000;

    // guiOwnCamera = true（従来方式）にしたときだけ使う
    function bindDebugCamera(scene, mainCam) {
        // (1) UtilityLayerRenderer（Physics Helper / ギズモ / 選択枠の土台）
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
        const restore = () => {
            if (scene.activeCamera !== mainCam) scene.activeCamera = mainCam;
        };
        scene.onAfterRenderObservable.add(restore);
        scene.onPrePointerObservable.add(restore);
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
        idle: "#2c2a26", active: "#7a6034", edge: "#4b473f",
        text: "#f2ece0", sub: "#a9a293", accent: "#e6d4ab"
    };
    const card = new BABYLON.GUI.Rectangle("card");
    card.width = "252px";
    card.height = "92%";
    card.cornerRadius = 10;
    card.thickness = 1;
    card.color = COL.edge;
    card.background = "rgba(18,17,15,0.82)";
    card.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    card.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    card.left = "16px"; card.top = "16px";
    ui.addControl(card);

    const sv = new BABYLON.GUI.ScrollViewer("sv");
    sv.thickness = 0;
    sv.barSize = 10;
    sv.barColor = COL.edge;
    sv.barBackground = "rgba(0,0,0,0)";
    sv.wheelPrecision = 0.02;
    card.addControl(sv);

    const panel = new BABYLON.GUI.StackPanel("panel");
    panel.width = "216px";
    panel.isVertical = true;
    panel.paddingTop = "14px"; panel.paddingBottom = "16px";
    sv.addControl(panel);

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
        b.height = "32px"; b.paddingBottom = "5px";
        b.color = COL.text; b.background = COL.idle;
        b.cornerRadius = 6; b.thickness = 0; b.fontSize = 14;
        b.onPointerUpObservable.add(onClick);
        panel.addControl(b);
        return b;
    }
    function addSlider(labelText, min, max, value, onChange) {
        const lb = addLabel(labelText + "  " + value.toFixed(2), 13, COL.accent, "22px");
        const s = new BABYLON.GUI.Slider(labelText);
        s.minimum = min; s.maximum = max; s.value = value;
        s.height = "18px"; s.width = "208px"; s.paddingBottom = "8px";
        s.color = COL.accent; s.background = "#3a352c"; s.borderColor = "transparent";
        s.onValueChangedObservable.add((v) => { lb.text = labelText + "  " + v.toFixed(2); onChange(v); });
        panel.addControl(s);
        return { label: lb, slider: s };
    }
    function addSpacer(h) {
        const r = new BABYLON.GUI.Rectangle();
        r.height = h || "8px"; r.thickness = 0; r.background = "";
        panel.addControl(r);
    }

    addLabel("BOWL OF RICE / ごはん", 11, COL.sub, "18px");

    const stateBtns = {}, bowlBtns = {}, envBtns = {};
    function highlight() {
        for (const k in stateBtns) stateBtns[k].background = (k === currentState) ? COL.active : COL.idle;
        for (const k in bowlBtns) bowlBtns[k].background = (k === currentBowl) ? COL.active : COL.idle;
        for (const k in envBtns) envBtns[k].background = (k === currentEnv) ? COL.active : COL.idle;
    }
    function rebuild() {
        const changed = (currentState !== lastStateKey);
        // 状態が変わったときだけスライダーを既定へ戻す（同じ状態の盛り直しでは保つ）
        if (currentState !== lastStateKey) {
            live.translucency = PRESETS[currentState].translucency;
            live.coat = 1.0; live.bump = 1.0; live.ao = GLOBAL.aoStrength;
            lastStateKey = currentState;
        }
        build(currentState, currentBowl, currentSeed);
        highlight();
        // 【対策】湯気は状態に属する性質（冷や飯は湯気が立たない）。
        if (changed) setSteam(PRESETS[currentState].steam);
    }

    addLabel("ごはん", 13, COL.accent, "22px");
    for (const k of Object.keys(PRESETS)) {
        stateBtns[k] = addButton("s_" + k, PRESETS[k].label, () => { currentState = k; rebuild(); });
    }
    addLabel("器", 13, COL.accent, "22px");
    for (const k of Object.keys(BOWLS)) {
        bowlBtns[k] = addButton("b_" + k, BOWLS[k].label, () => { currentBowl = k; rebuild(); });
    }

    addSpacer();
    addLabel("背景 / 環境", 13, COL.accent, "22px");
    for (const k of Object.keys(ENVS)) {
        envBtns[k] = addButton("e_" + k, ENVS[k].label, () => {
            if (k === currentEnv) return;
            envBtns[k].textBlock.text = ENVS[k].label + "（読み込み中…）";
            // 【対策】ラベルを先に描かせてから切り替える。同じフレームで
            //         .env を読むと「押しても反応しない」ように見える
            setTimeout(() => {
                applyEnv(k);
                envBtns[k].textBlock.text = ENVS[k].label;
                highlight();
                updateInfo();
            }, 30);
        });
    }
    highlight();

    addSpacer();
    // ---- 参照オブジェクト ---------------------------------------------
    addLabel("参照オブジェクト", 13, COL.accent, "22px");
    addLabel("左から クロム球 / 白キューブ / 茶碗 / 白球 / 18%グレー球。"
        + "白は 90%（純白ではない）", 10, COL.sub, "44px");
    let refOn = REF.start;
    const refBtn = addButton("ref", "参照: " + (refOn ? "ON" : "OFF"), () => {
        refOn = !refOn;
        for (const m of refMeshes) m.setEnabled(refOn);
        refBtn.textBlock.text = "参照: " + (refOn ? "ON" : "OFF");
        refBtn.background = refOn ? COL.active : COL.idle;
        // 【対策】既定の画角では半幅 ≒ 11cm しか写らないので、
        //   ±14.5cm に置いた外側の2つが画面の外に出る。表示したときだけ引く
        if (refOn && camera.radius < REF.camRadius) camera.radius = REF.camRadius;
        // 【対策】被写界深度が ON のままだと外側の2つがボケて色を比べられない
        if (refOn && dp.depthOfFieldEnabled) {
            GLOBAL.useDOF = false;
            dp.depthOfFieldEnabled = false;
            dofBtn.background = COL.idle;
            dofBtn.textBlock.text = "被写界深度: OFF";
        }
    });
    refBtn.background = refOn ? COL.active : COL.idle;

    addSpacer();
    // ---- 照明 ---------------------------------------------------------
    addLabel("照明", 13, COL.accent, "22px");
    addLabel("白が灰色に見えるときは露出ではなく、キー ÷ 回り込み の比を"
        + "疑うこと。目標は 2.0〜2.5 倍", 10, COL.sub, "44px");
    sKey = addSlider("キーライト", 0.0, 4.0, key.intensity, (v) => {
        key.intensity = v; updateInfo();
    });
    // 【対策】これがレフ板。白い被写体の影側を持ち上げるのはここだけ
    sFill = addSlider("回り込み（レフ板）", 0.0, 2.0, fill.intensity, (v) => {
        fill.intensity = v; updateInfo();
    });
    const tmBtn = addButton("tm", "トーン: " + (GLOBAL.useACES ? "ACES" : "STANDARD"), () => {
        GLOBAL.useACES = !GLOBAL.useACES;
        applyToneMapping();
        tmBtn.textBlock.text = "トーン: " + (GLOBAL.useACES ? "ACES" : "STANDARD");
        tmBtn.background = GLOBAL.useACES ? COL.active : COL.idle;
    });
    tmBtn.background = GLOBAL.useACES ? COL.active : COL.idle;

    addSpacer();
    addButton("reseed", "よそい直す", () => {
        currentSeed = (currentSeed * 1664525 + 1013904223) >>> 0;
        rebuild();
    });
    const steamBtn = addButton("steam", "湯気: ON", () => setSteam(!steam.isStarted()));
    function setSteam(on) {
        if (on) steam.start(); else steam.stop();
        steamBtn.textBlock.text = "湯気: " + (on ? "ON" : "OFF");
        steamBtn.background = on ? COL.active : COL.idle;
    }
    setSteam(PRESETS[START_STATE].steam);

    const backBtn = addButton("back", "逆光: ON", () => {
        back.setEnabled(!back.isEnabled());
        backBtn.textBlock.text = "逆光: " + (back.isEnabled() ? "ON" : "OFF");
        backBtn.background = back.isEnabled() ? COL.active : COL.idle;
    });
    backBtn.background = COL.active;

    const rotBtn = addButton("rot", "自動回転: OFF", () => {
        camera.useAutoRotationBehavior = !camera.useAutoRotationBehavior;
        if (camera.autoRotationBehavior) camera.autoRotationBehavior.idleRotationSpeed = 0.09;
        rotBtn.textBlock.text = "自動回転: " + (camera.useAutoRotationBehavior ? "ON" : "OFF");
        rotBtn.background = camera.useAutoRotationBehavior ? COL.active : COL.idle;
    });

    addSpacer();
    // 米のマテリアル側。0にすると擬似AO無しの状態が見られる
    const sAO = addSlider("粒間の暗がり", 0, 1.6, live.ao, (v) => { live.ao = v; applyLive(); });
    // 【対策】上限を 1.0 のままにすると、拡散が全部消える値まで引けてしまう。
    const sT = addSlider("透光", 0, 0.6, live.translucency, (v) => { live.translucency = v; applyLive(); });
    const sC = addSlider("水膜の強さ ×", 0, 2.0, live.coat, (v) => { live.coat = v; applyLive(); });
    const sB = addSlider("肌理の強さ ×", 0, 2.0, live.bump, (v) => { live.bump = v; applyLive(); });

    addSpacer();
    // 白の出方の最終調整。環境を切り替えると既定値へ戻る
    sExp = addSlider("露出", 0.6, 2.0, ip.exposure, (v) => { ip.exposure = v; });
    sCon = addSlider("コントラスト", 0.7, 1.6, ip.contrast, (v) => { ip.contrast = v; });
    sEnvI = addSlider("環境光", 0.3, 2.0, scene.environmentIntensity,
        (v) => { scene.environmentIntensity = v; });

    addSpacer();
    addLabel("テーブル", 13, COL.accent, "22px");
    // 木目の細かさ。1.0 が実寸（テクスチャ1枚＝天板の直径）
    addSlider("木目の細かさ ×", 0.5, 3.0, 1.0, (v) => {
        const s = (TABLE.diameter / WOOD.extent) * v;
        for (const t of [woodTex.albedo, woodTex.orm, woodTex.normal]) {
            t.uScale = s; t.vScale = s;
        }
    });
    addSlider("塗装の艶", 0.0, 0.8, tableMat.clearCoat.intensity,
        (v) => { tableMat.clearCoat.intensity = v; });
    addSlider("背景幕の明るさ ×", 0.2, 2.5, 1.0, (v) => {
        cycMat.albedoColor = new BABYLON.Color3(v, v, v);
    });

    addSpacer();
    const dofBtn = addButton("dof", "被写界深度: ON", () => {
        GLOBAL.useDOF = !GLOBAL.useDOF;
        dp.depthOfFieldEnabled = GLOBAL.useDOF;
        dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
        dofBtn.textBlock.text = "被写界深度: " + (GLOBAL.useDOF ? "ON" : "OFF");
    });
    dofBtn.background = GLOBAL.useDOF ? COL.active : COL.idle;
    // ぼけ量 = 焦点距離 / ピント距離。大きいほど背景と手前が溶ける
    addSlider("ぼけ量", 0.01, 0.16, GLOBAL.dofRatio, (v) => { GLOBAL.dofRatio = v; });
    addSlider("F値", 1.2, 11.0, GLOBAL.dofFStop, (v) => { dp.depthOfField.fStop = v; });

    const info = addLabel("", 12, COL.sub, "88px");
    function updateInfo() {
        if (!state) return;
        const c = state.cfg;
        info.text = c.grainCount + " 粒 / "
            + (c.grainCount * state.grains.variants[0].info.tris
                + state.body.tris + state.bowl.tris).toLocaleString() + " tri\n"
            + "粒: " + c.lengthMM.toFixed(2) + "×" + c.widthMM.toFixed(2) + "×" + c.heightMM.toFixed(2) + "mm\n"
            + "環境: " + ENVS[currentEnv].label + "\n"
            + "照明比 key/fill: "
            + (key.intensity / Math.max(1e-6, fill.intensity)).toFixed(2) + "\n"
            + "seed: " + c.seed;
    }
    onRebuilt = () => {
        sAO.slider.value = live.ao;
        sT.slider.value = live.translucency;
        sC.slider.value = live.coat;
        sB.slider.value = live.bump;
        updateInfo();
    };
    onRebuilt(state);

    scene.onDisposeObservable.add(() => {
        for (const k in riceCache) riceCache[k].dispose();
        for (const k in bowlMatCache) {
            const m = bowlMatCache[k];
            if (m.texs) for (const t of m.texs) t.dispose();
            m.dispose(true, false);
        }
        for (const k in envCache) { if (envCache[k]) envCache[k].dispose(); }
        for (const m of refMats) m.dispose(true, false);
        steamTex.dispose();
        cycTex.dispose();
        for (const t of [woodTex.albedo, woodTex.orm, woodTex.normal]) t.dispose();
    });

    return scene;
};

export default createScene;