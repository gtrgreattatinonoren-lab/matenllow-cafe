/**
 * drafts.js
 * 採寸値から型紙(身頃原型・袖原型・スカート原型)の輪郭を計算する。
 *
 * ここで使用する計算式は、市販の「文化式」等の特定の教本を再現したものではなく、
 * 一般的な採寸比率にもとづく簡易的な近似式です。体型には個人差が大きいため、
 * 実際に仮縫い(シーチン)して補正することを前提とした「たたき台」の原型として
 * 使ってください。
 *
 * 座標系: 単位 mm。原点(0,0) はそれぞれのパーツの中心線上、首の付け根の高さ。
 * x: 中心線から脇に向かう方向 / y: 下方向(裾に向かう方向)
 */

const Drafts = (() => {
  const cm = (v) => v * 10; // cm -> mm

  function estimateDefaults(raw) {
    const m = { ...raw };
    const bust = m.bust || 84;
    if (!m.height) m.height = 158;
    if (!m.neck) m.neck = bust * 0.38 + 2;
    if (!m.shoulder) m.shoulder = bust * 0.25 + 17;
    if (!m.backWaistLength) m.backWaistLength = m.height * 0.25;
    if (!m.sleeveLength) m.sleeveLength = m.height * 0.335;
    if (!m.upperArm) m.upperArm = bust * 0.34;
    if (!m.wrist) m.wrist = 16;
    if (!m.hipDepth) m.hipDepth = 18;
    if (!m.skirtLength) m.skirtLength = 58;
    return m;
  }

  // 差(reduction)を2箇所(例: 脇 / ダーツ)に配分する。
  // reduction が負の場合(バストよりウエストが大きい等)はフレア(外に広げる)として
  // そのまま比率配分する。
  function splitReduction(reduction, ratioA, maxA) {
    if (reduction <= 0) {
      return { a: reduction * ratioA, b: reduction * (1 - ratioA) };
    }
    const a = Math.min(reduction * ratioA, maxA);
    const b = reduction - a;
    return { a, b };
  }

  function quadCurve(p0, p1Ctrl, p2, steps = 8) {
    return Geo.sampleQuad(p0, p1Ctrl, p2, steps);
  }

  function cubicCurve(p0, c1, c2, p3, steps = 14) {
    return Geo.sampleCubic(p0, c1, c2, p3, steps);
  }

  function mirrorHalfToFull(halfPoints) {
    const mirrored = halfPoints
      .slice(1, -1)
      .reverse()
      .map((p) => Geo.pt(-p.x, p.y));
    return [...halfPoints, ...mirrored];
  }

  // ---------------- 身頃原型(ボディス) ----------------
  function buildBodice(mRaw) {
    const m = estimateDefaults(mRaw);
    const bustEase = m.bustEase ?? 6;
    const waistEase = m.waistEase ?? 2;

    const backBustQ = cm((m.bust + bustEase * 0.4) / 4);
    const frontBustQ = cm((m.bust + bustEase * 0.6) / 4 + 1.0);
    const backWaistQ = cm((m.waist + waistEase * 0.4) / 4);
    const frontWaistQ = cm((m.waist + waistEase * 0.6) / 4 + 0.5);

    const backNeckW = cm(m.neck / 6 + 0.4);
    const backNeckD = backNeckW / 3;
    const frontNeckW = cm(m.neck / 6 + 0.2);
    const frontNeckD = frontNeckW + cm(1.0);

    const shoulderHalf = cm(m.shoulder / 2);
    const shoulderDrop = cm(4.0);
    const backShoulderTip = Geo.pt(shoulderHalf, backNeckD + shoulderDrop);
    const backSNP = Geo.pt(backNeckW, backNeckD);
    const shoulderLen = Geo.dist(backSNP, backShoulderTip);
    const shoulderAngle = Math.atan2(
      backShoulderTip.y - backSNP.y,
      backShoulderTip.x - backSNP.x
    );

    const frontSNP = Geo.pt(frontNeckW, frontNeckD);
    const frontShoulderTip = Geo.add(
      frontSNP,
      Geo.scale(Geo.pt(Math.cos(shoulderAngle), Math.sin(shoulderAngle)), shoulderLen)
    );

    const armDepth = cm(m.bust / 8 + 8.2);
    const backWaistLen = cm(m.backWaistLength);
    const frontLenAdjust = cm(1.5 + Math.max(0, m.bust - 84) / 8);
    const frontWaistLen = backWaistLen + frontLenAdjust;

    // ---- 後ろ身頃(半身) ----
    const backUnderarm = Geo.pt(backBustQ, armDepth);
    const backNeckCurve = quadCurve(
      Geo.pt(0, 0),
      Geo.pt(backNeckW * 0.85, 0),
      backSNP,
      6
    );
    const backArmholeCurve = cubicCurve(
      backShoulderTip,
      Geo.pt(
        backShoulderTip.x + (backBustQ - backShoulderTip.x) * 0.2,
        backShoulderTip.y + (armDepth - backShoulderTip.y) * 0.3
      ),
      Geo.pt(backBustQ + cm(0.8), armDepth - (armDepth - backShoulderTip.y) * 0.32),
      backUnderarm,
      14
    );

    const backReduction = backBustQ - backWaistQ;
    const backSplit = splitReduction(backReduction, 0.35, cm(1.5));
    const backSideWaistX = backBustQ - backSplit.a;
    const backDartIntake = backSplit.b;
    const backDartCenterX = backBustQ * 0.45;
    const backDartLen = cm(10);

    const backHalf = [
      Geo.pt(0, 0),
      ...backNeckCurve.slice(1),
      backShoulderTip,
      ...backArmholeCurve.slice(1),
    ];
    // 脇線: アンダーアーム→ウエスト側点
    backHalf.push(Geo.pt(backSideWaistX, backWaistLen));
    if (backDartIntake > cm(0.3)) {
      const half = backDartIntake / 2;
      backHalf.pop();
      backHalf.push(Geo.pt(backSideWaistX, backWaistLen));
      backHalf.push(Geo.pt(backDartCenterX + half, backWaistLen));
      backHalf.push(Geo.pt(backDartCenterX, backWaistLen - backDartLen));
      backHalf.push(Geo.pt(backDartCenterX - half, backWaistLen));
    }
    backHalf.push(Geo.pt(0, backWaistLen));

    // ---- 前身頃(半身) ----
    const frontUnderarm = Geo.pt(frontBustQ, armDepth);
    const frontNeckCurve = quadCurve(
      Geo.pt(0, 0),
      Geo.pt(frontNeckW * 0.85, frontNeckD * 0.15),
      frontSNP,
      6
    );
    const frontArmholeCurve = cubicCurve(
      frontShoulderTip,
      Geo.pt(
        frontShoulderTip.x + (frontBustQ - frontShoulderTip.x) * 0.25,
        frontShoulderTip.y + (armDepth - frontShoulderTip.y) * 0.35
      ),
      Geo.pt(frontBustQ + cm(0.8), armDepth - (armDepth - frontShoulderTip.y) * 0.3),
      frontUnderarm,
      14
    );

    const bustPoint = Geo.pt(
      Math.max(frontBustQ * 0.35, frontBustQ - cm(8)),
      armDepth + cm(1)
    );
    const frontReduction = frontBustQ - frontWaistQ;
    const frontSplit = splitReduction(frontReduction, 0.6, cm(6));
    const bustDartIntake = frontSplit.a;
    const waistDartIntake = frontSplit.b;

    const dartTop = Geo.pt(frontBustQ, armDepth + cm(5));
    const dartBottomX = frontBustQ - bustDartIntake;
    const dartBottom = Geo.pt(dartBottomX, armDepth + cm(5));
    const sideWaistX = dartBottomX;

    const frontHalf = [
      Geo.pt(0, 0),
      ...frontNeckCurve.slice(1),
      frontShoulderTip,
      ...frontArmholeCurve.slice(1),
    ];
    if (Math.abs(bustDartIntake) > cm(0.3)) {
      frontHalf.push(dartTop, bustPoint, dartBottom);
    } else {
      frontHalf.push(dartTop);
    }
    frontHalf.push(Geo.pt(sideWaistX, frontWaistLen));
    if (waistDartIntake > cm(0.3)) {
      const half = waistDartIntake / 2;
      const dartCenterX = bustPoint.x;
      const dartLen2 = cm(9);
      frontHalf.push(Geo.pt(dartCenterX + half, frontWaistLen));
      frontHalf.push(Geo.pt(dartCenterX, frontWaistLen - dartLen2));
      frontHalf.push(Geo.pt(dartCenterX - half, frontWaistLen));
    }
    frontHalf.push(Geo.pt(0, frontWaistLen));

    const back = {
      id: 'back',
      label: '後ろ身頃',
      outline: mirrorHalfToFull(backHalf),
      centerLine: [Geo.pt(0, 0), Geo.pt(0, backWaistLen)],
      centerLabel: 'わ(布を折らずに使う場合は中心に縫い代不要)',
      grainline: [Geo.pt(0, armDepth * 0.4), Geo.pt(0, backWaistLen - cm(3))],
      notches: [backUnderarm, Geo.pt(-backUnderarm.x, backUnderarm.y)],
      armholeLength: Geo.polylineLength([backShoulderTip, ...backArmholeCurve.slice(1)]),
    };
    const front = {
      id: 'front',
      label: '前身頃',
      outline: mirrorHalfToFull(frontHalf),
      centerLine: [Geo.pt(0, 0), Geo.pt(0, frontWaistLen)],
      centerLabel: 'わ(布を折らずに使う場合は中心に縫い代不要)',
      grainline: [Geo.pt(0, armDepth * 0.4), Geo.pt(0, frontWaistLen - cm(3))],
      notches: [frontUnderarm, Geo.pt(-frontUnderarm.x, frontUnderarm.y)],
      bustPoint,
      armholeLength: Geo.polylineLength([frontShoulderTip, ...frontArmholeCurve.slice(1)]),
    };

    return { back, front, armDepth, shoulderLen };
  }

  // ---------------- 袖原型 ----------------
  function buildSleeve(mRaw, armholeLen) {
    const m = estimateDefaults(mRaw);
    const sleeveEase = m.sleeveEase ?? 5;
    const wristEase = m.wristEase ?? 3;

    const bicepHalf = cm((m.upperArm + sleeveEase) / 2);
    const wristHalf = cm((m.wrist + wristEase) / 2);
    // armholeLen はミリ単位(前+後ろのアームホール実長の合計)
    const capHeight = Math.min(cm(m.bust ? m.bust / 8 + 8.2 : 15) * 0.82, armholeLen * 0.28);
    const sleeveLenTotal = cm(m.sleeveLength);
    const below = Math.max(sleeveLenTotal - capHeight, cm(20));

    const top = Geo.pt(0, 0);
    const rightBicep = Geo.pt(bicepHalf, capHeight);
    const leftBicep = Geo.pt(-bicepHalf, capHeight);

    const rightCap = cubicCurve(
      top,
      Geo.pt(bicepHalf * 0.32, 0),
      Geo.pt(bicepHalf * 0.92, capHeight * 0.42),
      rightBicep,
      14
    );
    const leftCap = cubicCurve(
      leftBicep,
      Geo.pt(-bicepHalf * 0.92, capHeight * 0.42),
      Geo.pt(-bicepHalf * 0.32, 0),
      top,
      14
    );

    const rightWrist = Geo.pt(wristHalf, capHeight + below);
    const leftWrist = Geo.pt(-wristHalf, capHeight + below);

    const outline = [
      top,
      ...rightCap.slice(1),
      rightWrist,
      leftWrist,
      ...leftCap.slice(1),
    ];

    const sleeve = {
      id: 'sleeve',
      label: '袖(基本袖原型)',
      outline,
      centerLine: [top, Geo.pt(0, capHeight + below)],
      grainline: [Geo.pt(0, capHeight * 0.3), Geo.pt(0, capHeight + below - cm(2))],
      notches: [
        Geo.pt(rightBicep.x, capHeight * 0.55), // 前(1本ノッチ想定)
        Geo.pt(leftBicep.x, capHeight * 0.5),
        Geo.pt(leftBicep.x, capHeight * 0.5), // 後ろ(2本ノッチ想定・目印として重ねる)
      ],
      frontNotch: Geo.pt(rightBicep.x, capHeight * 0.55),
      backNotch: Geo.pt(leftBicep.x, capHeight * 0.5),
    };
    return { sleeve, capHeight };
  }

  // ---------------- スカート原型 ----------------
  function buildSkirt(mRaw, style) {
    const m = estimateDefaults(mRaw);
    const waistEase = m.skirtWaistEase ?? 1;
    const hipEase = m.skirtHipEase ?? 4;
    const hipDepth = cm(m.hipDepth);
    const length = cm(m.skirtLength);
    const flare = style === 'aline' ? cm(8) : 0;

    function buildHalf(isFront) {
      const sign = isFront ? 0.5 : -0.5;
      const waistQ = cm((m.waist + waistEase) / 4 + sign);
      const hipQ = cm((m.hip + hipEase) / 4 + sign);

      const waistPt = Geo.pt(0, 0);
      const hipPt = Geo.pt(hipQ, hipDepth);
      const hemPt = Geo.pt(hipQ + flare, length);

      const reduction = hipQ - waistQ;
      const split = splitReduction(reduction, 0.45, cm(2));
      const sideWaistX = hipQ - split.a;
      const dartIntake = split.b;
      const dartCenterX = hipQ * 0.5;
      const dartLen = cm(11);

      // 脇線: ウエスト側点(ダーツ考慮前)から腰でカーブし裾まで
      const sideCurve = quadCurve(
        Geo.pt(sideWaistX, 0),
        Geo.pt(hipQ + cm(0.5), hipDepth * 0.6),
        hipPt,
        8
      );

      const half = [waistPt];
      if (dartIntake > cm(0.3)) {
        const halfW = dartIntake / 2;
        half.push(Geo.pt(dartCenterX + halfW, 0));
        half.push(Geo.pt(dartCenterX, dartLen));
        half.push(Geo.pt(dartCenterX - halfW, 0));
      }
      half.push(...sideCurve);
      half.push(hemPt);
      half.push(Geo.pt(0, length));

      return {
        outline: mirrorHalfToFull(half),
        centerLine: [Geo.pt(0, 0), Geo.pt(0, length)],
        grainline: [Geo.pt(0, hipDepth * 0.3), Geo.pt(0, length - cm(3))],
      };
    }

    const front = { id: 'skirtFront', label: `前スカート(${style === 'aline' ? 'Aライン' : 'ストレート'})`, ...buildHalf(true) };
    const back = { id: 'skirtBack', label: `後ろスカート(${style === 'aline' ? 'Aライン' : 'ストレート'})`, ...buildHalf(false) };
    return { front, back };
  }

  return { estimateDefaults, buildBodice, buildSleeve, buildSkirt, cm };
})();
