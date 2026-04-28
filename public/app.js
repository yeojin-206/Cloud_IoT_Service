// 대시보드 클라이언트 — 2초마다 REST API를 폴링해 UI를 갱신한다.
const USER_ID = new URLSearchParams(location.search).get('user') || 'user-001';
document.getElementById('userLabel').textContent = USER_ID;

const POLL_MS = 2000;

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function refresh() {
  try {
    // 서버 상태
    await getJSON('/api/health');
    setServerStatus('서버 연결됨', 'chip-ok');

    // 최신 스냅샷
    const latest = await fetch(`/api/data/latest/${USER_ID}`).then((r) =>
      r.ok ? r.json() : null
    );
    if (latest) updateLatest(latest);

    // 스트레스 분석 + 가이드
    const stress = await fetch(`/api/stress/${USER_ID}`).then((r) =>
      r.ok ? r.json() : null
    );
    if (stress) updateStress(stress);

    // 추이 차트
    const history = await getJSON(`/api/stress/${USER_ID}/history?limit=50`);
    drawChart(history);

    // 알림
    const alerts = await getJSON(`/api/alerts?user_id=${USER_ID}&limit=15`);
    renderAlerts(alerts);
  } catch (err) {
    setServerStatus('서버 응답 없음', 'chip-danger');
    console.error(err);
  }
}

function setServerStatus(text, cls) {
  const el = document.getElementById('serverStatus');
  el.textContent = text;
  el.className = `chip ${cls}`;
}

function updateLatest(latest) {
  const f = latest.fitbit || {};
  document.getElementById('hr').textContent = f.heart_rate ?? '--';
  document.getElementById('hrv').textContent = f.hrv ?? '--';
  document.getElementById('spo2').textContent = f.spo2 ?? '--';
  document.getElementById('steps').textContent = f.steps_last_minute ?? '--';
  document.getElementById('sleep').textContent = f.sleep_score ?? '--';

  const e = latest.environment || {};
  document.getElementById('temp').textContent = e.temperature ?? '--';
  document.getElementById('humi').textContent = e.humidity ?? '--';
  document.getElementById('co2').textContent = e.co2_ppm ?? '--';
  document.getElementById('noise').textContent = e.noise_db ?? '--';
  document.getElementById('loc').textContent = latest.location || '--';
}

function updateStress(s) {
  const level = s.current_stress_level;
  document.getElementById('stressLevel').textContent = level;
  document.getElementById('stressStatus').textContent = statusKo(s.stress_status);
  document.getElementById('primaryFactor').textContent = factorKo(s.primary_factor);

  // 원형 게이지 부분 fill
  const fill = document.getElementById('gaugeFill');
  const pct = 100 - level; // 빈 영역을 덮는다
  fill.style.background = `conic-gradient(transparent ${level}%, var(--card) ${level}%)`;

  const guide = s.guide || {};
  document.getElementById('guideTitle').textContent = guide.title || '';
  const stepsEl = document.getElementById('guideSteps');
  stepsEl.innerHTML = '';
  (guide.steps || []).forEach((step) => {
    const li = document.createElement('li');
    li.textContent = step;
    stepsEl.appendChild(li);
  });
}

function statusKo(s) {
  return (
    {
      NORMAL: '정상',
      CAUTION: '주의',
      HIGH_CAUTION: '경고',
    }[s] || s || '--'
  );
}

function factorKo(f) {
  return (
    {
      stable: '안정',
      low_hrv: 'HRV 저하',
      high_heart_rate: '심박수 상승',
      high_co2: 'CO₂ 높음',
      high_noise: '소음 높음',
      low_sleep: '수면 부족',
      high_co2_with_low_hrv: 'CO₂↑ + HRV↓ 복합',
    }[f] || f || '--'
  );
}

function renderAlerts(alerts) {
  const ul = document.getElementById('alerts');
  ul.innerHTML = '';
  if (!alerts.length) {
    const li = document.createElement('li');
    li.textContent = '최근 알림이 없습니다.';
    ul.appendChild(li);
    return;
  }
  alerts.forEach((a) => {
    const li = document.createElement('li');
    li.className = `lv-${a.level}`;
    const ts = new Date(a.timestamp).toLocaleTimeString();
    li.innerHTML = `<span class="ts">${ts}</span><span class="code">[${a.code}]</span>${a.message}`;
    ul.appendChild(li);
  });
}

// --- 간단한 라인 차트 (Chart.js 없이 canvas 직접 사용) ---
function drawChart(series) {
  const canvas = document.getElementById('chart');
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const W = (canvas.width = rect.width * window.devicePixelRatio);
  const H = (canvas.height = 160 * window.devicePixelRatio);
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  const w = rect.width;
  const h = 160;

  ctx.clearRect(0, 0, w, h);

  // 가이드 선
  ctx.strokeStyle = 'rgba(148,163,184,0.15)';
  ctx.lineWidth = 1;
  [25, 50, 75].forEach((v) => {
    const y = h - (v / 100) * h;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  });

  // 임계치 영역
  ctx.fillStyle = 'rgba(239,68,68,0.08)';
  ctx.fillRect(0, 0, w, h - (70 / 100) * h);

  if (!series.length) return;

  // 데이터 라인
  const stepX = w / Math.max(series.length - 1, 1);
  ctx.beginPath();
  ctx.strokeStyle = '#60a5fa';
  ctx.lineWidth = 2;
  series.forEach((p, i) => {
    const x = i * stepX;
    const y = h - (p.stress_level / 100) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // 포인트
  series.forEach((p, i) => {
    const x = i * stepX;
    const y = h - (p.stress_level / 100) * h;
    ctx.beginPath();
    ctx.fillStyle =
      p.stress_level >= 70 ? '#ef4444' : p.stress_level >= 50 ? '#f59e0b' : '#22c55e';
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

refresh();
setInterval(refresh, POLL_MS);
