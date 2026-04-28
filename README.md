# On-Premise 스마트 헬스케어 서비스 — 스트레스 관리 (팀 12)

**과제**: On-Premise 방식 스마트 헬스케어 서비스 개발
**팀 12**: 202411265 김여진(팀장) · 202011326 양현준 · 202315318 정기현 · 202315304 경장욱
**제출일**: 2026-04-24

Raspberry Pi, Fitbit Band, MQTT.JS, Express.JS, Axios.JS를 사용해서
개인 PC / 노트북 / Raspberry Pi / Amazon EC2 어디에서든 단일 호스트로 구동되는
On-Premise(자체 서버 기반) 스트레스 관리 헬스케어 서비스다.

---

## 1. 시스템 구성

```
 ┌──────────────────┐        ┌───────────────────────┐        ┌─────────────────┐
 │  Fitbit          │  HR /  │   Fitbit Simulator    │  HTTP  │                 │
 │  (시뮬레이션)    │  HRV   │   (Axios.JS)          │ ─POST─▶│                 │
 └──────────────────┘        │                       │        │                 │
                             └───────────────────────┘        │  Express.JS     │
                                                              │  REST API       │
 ┌──────────────────┐                                         │  (Raspberry Pi  │
 │  IoT Sensor      │  temp/humi/ ┌─────────────────┐  MQTT   │   또는 PC)      │
 │  (시뮬레이션)    │   co2/noise │ IoT Simulator   │ ──pub──▶│                 │
 └──────────────────┘             │ (MQTT.JS)       │         │  - MQTT 구독     │
                                  └─────────────────┘         │  - 스트레스 분석  │
                                                              │  - 알림 로직     │
                                                              │  - 대시보드 호스팅│
                                                              └────────┬────────┘
                                                                       │
                                                          GET /api/... │
                                                                       ▼
                                                              ┌─────────────────┐
                                                              │ Web Dashboard   │
                                                              │ (브라우저)      │
                                                              └─────────────────┘
```

- **로컬 서버**: Express.JS 로 REST API + 대시보드 서빙
- **MQTT 브로커**: 기본값은 `mqtt://test.mosquitto.org:1883` (공용). Raspberry Pi에 Mosquitto를 설치했다면 `.env`에서 로컬 브로커로 변경 가능
- **Fitbit**: Web API OAuth2 대신, 실제 배포 전에는 시뮬레이터로 동등한 데이터 스키마 생성
- **IoT 센서**: 실제 배포에서는 DHT22(온습도), MH-Z19(CO₂), KY-038(소음)을 RPi GPIO/I2C로 연결. 현재는 시뮬레이터가 같은 MQTT 토픽으로 발행
- **저장소**: 인메모리 + JSON 파일 (별도 DB 불필요, On-Premise 전제에 적합)

기획서 대비 변경점: 기획서에서는 클라우드 경유 저장/분석이 있었으나, 과제 범위(On-Premise)에
맞춰 분석/저장/알림 전부를 로컬 서버에서 수행하도록 단순화했다.

## 2. 파일 구조

```
smart-healthcare-service/
├── package.json              # 의존성
├── .env.example              # 환경 변수 예시
├── server/
│   ├── app.js                # Express 엔트리
│   ├── config/index.js       # 전역 설정 (포트, MQTT, 임계치)
│   ├── db/storage.js         # JSON/메모리 저장소
│   ├── services/
│   │   ├── mqttClient.js     # MQTT 구독자 (Raspberry Pi 엣지)
│   │   └── stressAnalyzer.js # 스트레스 알고리즘 + 알림 로직
│   └── routes/
│       ├── data.js           # 데이터 수신/조회 REST API
│       ├── stress.js         # 스트레스 분석 API
│       └── alerts.js         # 알림 API
├── sensors/
│   ├── iotSensorSimulator.js # IoT 센서 시뮬레이터 (MQTT 퍼블리셔)
│   └── fitbitSimulator.js    # Fitbit 시뮬레이터 (Axios HTTP + MQTT)
├── public/                   # 대시보드 (HTML/CSS/JS)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── data/                     # 런타임 저장 (samples.json, alerts.json)
└── docs/
    └── REPORT.md             # 과제 보고서
```

## 3. 실행 방법

### 3.1 설치

```bash
cd smart-healthcare-service
npm install
```

### 3.2 세 개의 프로세스를 각각 띄운다

```bash
# 터미널 1 — 로컬 서버 (Raspberry Pi 또는 PC)
npm run server

# 터미널 2 — IoT 환경 센서 시뮬레이터 (MQTT publisher)
npm run sensor

# 터미널 3 — Fitbit 시뮬레이터 (Axios HTTP POST 기본)
npm run fitbit
```

또는 한 번에:

```bash
npm run dev   # concurrently 로 3개 동시 실행
```

### 3.3 대시보드 확인

브라우저에서 **http://localhost:3000/** 접속.
스트레스 수치, Fitbit 생체 데이터, 환경 데이터, 알림, 추이 그래프가 2초마다 갱신된다.

## 4. REST API 명세

| Method | Path | 설명 |
| ------ | ---- | ---- |
| GET  | `/api/health`                       | 헬스체크 |
| GET  | `/api/info`                         | 서비스/팀 메타 |
| POST | `/api/data/fitbit`                  | Fitbit 데이터 수신 (Axios 경로) |
| POST | `/api/data/sensor`                  | 환경 센서 데이터 수신 |
| GET  | `/api/data/latest/:userId`          | 사용자 최신 스냅샷 |
| GET  | `/api/data/latest`                  | 전체 사용자 최신 요약 |
| GET  | `/api/data/history?user_id=&limit=` | 병합 샘플 히스토리 |
| GET  | `/api/stress/:userId`               | 현재 스트레스 분석 + 가이드 |
| GET  | `/api/stress/:userId/history`       | 스트레스 추이 |
| GET  | `/api/alerts?user_id=&limit=`       | 최근 알림 목록 |

요청 예시:

```bash
curl -X POST http://localhost:3000/api/data/fitbit \
  -H "Content-Type: application/json" \
  -d '{"user_id":"user-001","fitbit":{"heart_rate":95,"hrv":25,"spo2":98,"steps_last_minute":5,"sleep_score":55}}'

curl http://localhost:3000/api/stress/user-001 | jq
```

## 5. 기획서와의 매핑

| 기획서 항목 | 본 구현 위치 |
| ----------- | ----------- |
| 1.2.1 데이터 흐름 — 수집 | `sensors/iotSensorSimulator.js`, `sensors/fitbitSimulator.js` |
| 1.2.1 — 엣지 처리 | `server/services/mqttClient.js` (Raspberry Pi 역할) |
| 1.2.1 — 저장/분석 | `server/db/storage.js`, `server/services/stressAnalyzer.js` |
| 1.2.1 — 피드백 | `public/index.html` + `public/app.js` (대시보드) |
| 1.2.3 데이터 명세서 | `server/routes/data.js` 응답 / 통합 샘플 구조 |
| 1.3.1 MVP — 데이터 수집 및 연동 | MQTT + Axios HTTP 이원화 경로 |
| 1.3.1 MVP — 스트레스 분석 및 시각화 | `stressAnalyzer.computeStressLevel` + 대시보드 게이지 |
| 1.3.1 MVP — 해결 가이드 | `stressAnalyzer.buildGuide` (심호흡/휴식 가이드) |
| 1.3.2 알람 로직 | `stressAnalyzer.buildAlerts` (HRV+HR, CO₂/소음, 걸음수, 수면+HRV) |

## 6. Raspberry Pi 배포 가이드 (추천사항 ②)

1. Raspberry Pi OS(64-bit) 설치 후 Node.js 20+ 설치:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs mosquitto
   ```
2. 로컬 MQTT 브로커 활성화:
   ```bash
   sudo systemctl enable --now mosquitto
   ```
3. 저장소 클론 후 `.env` 를 다음과 같이 설정:
   ```env
   MQTT_BROKER_URL=mqtt://localhost:1883
   PORT=3000
   HOST=0.0.0.0
   ```
4. `pm2` 로 상시 구동 (추천):
   ```bash
   sudo npm i -g pm2
   pm2 start server/app.js --name healthcare-server
   pm2 start sensors/iotSensorSimulator.js --name healthcare-sensor
   pm2 save && pm2 startup
   ```
5. 같은 Wi-Fi 의 스마트폰 브라우저에서 `http://<RPi IP>:3000/` 로 대시보드 접속.

## 7. 조원별 역할 (기획서 양심서약서와 동일)

| 이름 | 학번 | 역할 |
| ---- | ---- | ---- |
| 김여진 (팀장) | 202411265 | 헬스케어 서비스 기획 · 서버/API 설계 |
| 양현준 | 202011326 | LLM 보고서 및 PPT 제작 |
| 경장욱 | 202315304 | 스마트 헬스케어 서비스 사례 조사 |
| 정기현 | 202315318 | 웨어러블 기술 조사 |

## 8. LLM 활용 내역

본 과제 수행 과정에서 Claude (Anthropic) 를 다음 용도로 활용했다.

- **프로젝트 스캐폴딩**: Express.JS + MQTT.JS + Axios.JS 조합에 맞는 디렉토리 구조 초안 생성
- **코드 리뷰**: 기획서의 알람 로직(파이썬 의사코드)을 JavaScript로 이식하며 경계값을 점검
- **문서 정리**: README 섹션 구성 및 표 포매팅

모든 코드의 최종 검토·동작 확인·커스터마이징은 팀 내에서 직접 수행했다.
