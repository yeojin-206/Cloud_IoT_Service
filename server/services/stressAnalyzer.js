// 스트레스 분석 알고리즘
// 기획서 1.2.3 / 1.3.2 에 정의된 HRV + 환경 + 활동량 결합 지표
const { thresholds } = require('../config');

/**
 * 0~100 사이의 스트레스 지수를 산출한다.
 * 가중치:
 *   - HRV (낮을수록 스트레스↑)           : 40%
 *   - 심박수 (높을수록 스트레스↑)          : 20%
 *   - CO2 (높을수록 집중/스트레스 악화)     : 15%
 *   - 소음 (높을수록 스트레스↑)            : 10%
 *   - 수면 점수 (낮을수록 누적 피로↑)       : 15%
 */
function computeStressLevel(fitbit, env) {
  const safe = (v, fallback) => (typeof v === 'number' && !Number.isNaN(v) ? v : fallback);

  const hrv = safe(fitbit?.hrv, 50);
  const hr = safe(fitbit?.heart_rate, 70);
  const sleep = safe(fitbit?.sleep_score, 75);
  const co2 = safe(env?.co2_ppm, 600);
  const noise = safe(env?.noise_db, 40);

  // 각 지표를 0~100 스케일의 "스트레스 기여도"로 정규화
  const hrvScore = clamp(((60 - hrv) / 40) * 100, 0, 100); // hrv 20↓이면 만점, 60↑이면 0점
  const hrScore = clamp(((hr - 60) / 60) * 100, 0, 100); // hr 120↑이면 만점, 60↓이면 0점
  const co2Score = clamp(((co2 - 400) / 1200) * 100, 0, 100); // 1600ppm↑이면 만점
  const noiseScore = clamp(((noise - 30) / 60) * 100, 0, 100); // 90dB↑이면 만점
  const sleepScore = clamp(((80 - sleep) / 80) * 100, 0, 100); // 수면 0점이면 만점, 80↑이면 0점

  const stress =
    hrvScore * 0.4 + hrScore * 0.2 + co2Score * 0.15 + noiseScore * 0.1 + sleepScore * 0.15;

  return Math.round(stress);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function classify(stress) {
  if (stress >= thresholds.stressHigh) return 'HIGH_CAUTION';
  if (stress >= thresholds.stressCaution) return 'CAUTION';
  return 'NORMAL';
}

function primaryFactor(fitbit, env) {
  const reasons = [];
  if (fitbit?.hrv != null && fitbit.hrv < thresholds.hrvLow) reasons.push({ key: 'low_hrv', w: 40 });
  if (fitbit?.heart_rate != null && fitbit.heart_rate > thresholds.heartRateHigh)
    reasons.push({ key: 'high_heart_rate', w: 20 });
  if (env?.co2_ppm != null && env.co2_ppm > thresholds.co2High)
    reasons.push({ key: 'high_co2', w: 15 });
  if (env?.noise_db != null && env.noise_db > thresholds.noiseHigh)
    reasons.push({ key: 'high_noise', w: 10 });
  if (fitbit?.sleep_score != null && fitbit.sleep_score < thresholds.sleepScoreLow)
    reasons.push({ key: 'low_sleep', w: 15 });

  if (!reasons.length) return 'stable';

  // HRV가 낮고 CO2가 높으면 기획서 예시처럼 복합 요인으로 표시
  const hasLowHrv = reasons.some((r) => r.key === 'low_hrv');
  const hasHighCo2 = reasons.some((r) => r.key === 'high_co2');
  if (hasLowHrv && hasHighCo2) return 'high_co2_with_low_hrv';

  reasons.sort((a, b) => b.w - a.w);
  return reasons[0].key;
}

/**
 * 기획서 1.3.2 알람 로직을 JavaScript로 구현.
 * 알림 배열을 반환한다. 빈 배열이면 알림 없음.
 */
function buildAlerts(fitbit, env) {
  const alerts = [];

  // 1. 급성 스트레스 감지
  if (
    fitbit?.hrv != null &&
    fitbit.hrv < thresholds.hrvLow &&
    fitbit?.heart_rate != null &&
    fitbit.heart_rate > thresholds.heartRateHigh
  ) {
    alerts.push({
      level: 'WARNING',
      code: 'ACUTE_STRESS',
      message: '높은 스트레스 감지: 3분 명상을 시작할까요?',
    });
  }

  // 2. 집중 방해 환경 감지
  if (
    (env?.co2_ppm != null && env.co2_ppm > thresholds.co2High) ||
    (env?.noise_db != null && env.noise_db > thresholds.noiseHigh)
  ) {
    alerts.push({
      level: 'INFO',
      code: 'BAD_ENV',
      message: '집중력 저하 환경: 환기가 필요하거나 장소를 옮겨보세요.',
    });
  }

  // 3. 신체 활동 부족 (최근 1분 걸음수)
  if (fitbit?.steps_last_minute != null && fitbit.steps_last_minute < thresholds.stepsLow) {
    alerts.push({
      level: 'CAUTION',
      code: 'INACTIVE',
      message: '장시간 부동 자세: 가벼운 스트레칭으로 긴장을 풀어주세요.',
    });
  }

  // 4. 수면 부족 및 컨디션 저하
  if (
    fitbit?.sleep_score != null &&
    fitbit.sleep_score < thresholds.sleepScoreLow &&
    fitbit?.hrv != null &&
    fitbit.hrv < thresholds.hrvVeryLow
  ) {
    alerts.push({
      level: 'ADVICE',
      code: 'LOW_CONDITION',
      message: '컨디션 난조: 오늘은 카페인을 줄이고 일찍 휴식하세요.',
    });
  }

  return alerts;
}

/**
 * 해결 가이드 (기획서 1.3.1 MVP - 해결 가이드 제공)
 */
function buildGuide(stressStatus, factor) {
  if (stressStatus === 'HIGH_CAUTION') {
    return {
      title: '지금 바로 3분 심호흡',
      steps: [
        '4초 동안 코로 숨을 들이쉰다',
        '7초 동안 숨을 참는다',
        '8초 동안 입으로 숨을 내쉰다',
        '위 과정을 4회 반복한다 (4-7-8 호흡법)',
      ],
      reason: factor,
    };
  }
  if (stressStatus === 'CAUTION') {
    return {
      title: '자리에서 잠깐 일어나기',
      steps: [
        '의자에서 일어나 목과 어깨를 천천히 돌린다',
        '창문을 열어 환기를 한다',
        '물 한 잔을 마신다',
      ],
      reason: factor,
    };
  }
  return {
    title: '컨디션 양호',
    steps: ['현재 상태가 안정적입니다. 집중을 유지하세요.'],
    reason: factor,
  };
}

function analyze(fitbit, env) {
  const level = computeStressLevel(fitbit, env);
  const status = classify(level);
  const factor = primaryFactor(fitbit, env);
  const alerts = buildAlerts(fitbit, env);
  const guide = buildGuide(status, factor);

  return {
    current_stress_level: level,
    stress_status: status,
    primary_factor: factor,
    alerts,
    guide,
  };
}

module.exports = {
  analyze,
  computeStressLevel,
  classify,
  primaryFactor,
  buildAlerts,
  buildGuide,
};
