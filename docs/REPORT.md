# On-Premise 스마트 헬스케어 서비스 개발 보고서

**과목**: 스마트 헬스케어 · **과제**: On-Premise 방식 스마트 헬스케어 서비스 개발
**팀 12**: 202411265 김여진(팀장) · 202011326 양현준 · 202315318 정기현 · 202315304 경장욱
**제출일**: 2026-04-24

---

## 목차

1. 개요 및 요구사항 충족 현황
2. 시스템 아키텍처
3. 기술 스택과 선정 근거
4. 구현 상세
5. REST API 명세
6. 실행 및 검증 결과
7. 기획서와의 매핑 및 변경점
8. Raspberry Pi 배포 시나리오
9. 조원별 역할 및 LLM 사용 내역
10. 한계점 및 향후 확장

---

## 1. 개요 및 요구사항 충족 현황

본 팀이 기획서(스트레스 관리 서비스 기획서, 2026-04-16)에서 정의한 서비스를
과제 지시에 따라 **On-Premise(자체 서버 기반)** 방식으로 구현했다.

| 과제 요구사항 | 충족 방법 |
| ------------- | --------- |
| ① PC / 노트북 / Raspberry Pi / EC2에서 구동 | Node.js 20+ 만 있으면 네 환경 모두 동일 코드로 실행. `HOST=0.0.0.0` 으로 네트워크 내부에서 접근 가능 |
| ② Raspberry Pi를 로컬 서버로 사용 (권장) | RPi에서 바로 `npm install && npm run server` 로 기동. Mosquitto 로컬 브로커 사용 절차도 README에 포함 |
| ③ 로컬 서버 인터페이스는 RESTful API로 설계 | `server/routes/` 하위 라우터로 리소스 지향 URL 설계 (`/api/data`, `/api/stress`, `/api/alerts`) |
| 사용 기술: Raspberry Pi, Fitbit band, MQTT.JS, Express.JS, Axios.JS | 전부 사용. Fitbit은 실제 디바이스가 없어 Web API 응답 스키마와 동일한 시뮬레이터로 대체 |

## 2. 시스템 아키텍처

### 2.1 데이터 흐름

1. **수집**
   - Fitbit 시뮬레이터: 심박수, HRV, SpO₂, 1분 걸음수, 수면 점수를 5초 주기로 생성
   - IoT 센서 시뮬레이터: 온도, 습도, CO₂ ppm, 소음 dB를 3초 주기로 생성
2. **엣지 처리 (Raspberry Pi 역할)**
   - Express 서버 내부의 MQTT 구독자가 두 토픽을 받아 사용자별 최신 스냅샷으로 병합
   - 두 데이터가 모두 도착한 시점에 스트레스 알고리즘 실행
   - 임계치 초과 시 즉시 로컬에서 알림 생성 (클라우드 왕복 없음)
3. **저장**
   - 최근 500개의 병합 샘플, 200개의 알림을 JSON 파일(`data/*.json`)로 보존
4. **피드백**
   - 웹 대시보드가 2초마다 REST API 폴링
   - 스트레스 게이지, 생체/환경 지표, 알림 목록, 추이 차트, 해결 가이드 제공

### 2.2 기기별 역할

기획서 1.2.2 표를 실제 구현 컴포넌트에 매핑했다.

| 기획서 역할 | 구현 컴포넌트 |
| ----------- | ------------- |
| Fitbit (Wearable) — HRV/수면/활동량 | `sensors/fitbitSimulator.js` (Fitbit Web API 스키마 동일) |
| IoT 센서 (Hardware) — 환경 | `sensors/iotSensorSimulator.js` (MQTT 퍼블리셔) |
| Raspberry Pi (Edge) — 데이터 통합/제어 | `server/services/mqttClient.js` + `stressAnalyzer.js` |
| Cloud Server (Backend) — 대량 분석/저장 | On-Premise 과제 범위상 **동일 로컬 서버로 흡수**. 확장 시 PostgreSQL/InfluxDB로 교체 가능 |
| Smartphone (App) — 대시보드/알림 | `public/` 하위 반응형 웹 대시보드 |

### 2.3 통합 데이터 스키마

기획서 1.2.3의 JSON 구조를 그대로 채용한다. `POST /api/data/fitbit`, `POST /api/data/sensor`
호출 두 건을 한 `user_id` 키로 병합해 동일한 형태의 객체를 생성한다.

```json
{
  "user_id": "user-001",
  "timestamp": "2026-04-24T13:17:36Z",
  "device_status": { "fitbit_connected": true, "rpi_status": "online" },
  "fitbit": { "heart_rate": 85, "hrv": 32.5, "spo2": 98, "steps_last_minute": 12, "sleep_score": 75 },
  "environment": { "temperature": 24.8, "humidity": 45, "co2_ppm": 950, "noise_db": 42.5 },
  "stress_analysis": { "current_stress_level": 68, "stress_status": "HIGH_CAUTION", "primary_factor": "high_co2_with_low_hrv" },
  "location": "study_room"
}
```

## 3. 기술 스택과 선정 근거

| 기술 | 역할 | 선정 이유 |
| ---- | ---- | -------- |
| Node.js 20 | 런타임 | Raspberry Pi 4에서도 부담 없이 구동. 단일 언어(JS)로 엣지/백엔드/프론트 통일 |
| Express.JS | HTTP 서버 + REST API | 과제 명시. 경량·라우터 기반 설계로 REST API 요구사항 충족 |
| MQTT.JS | IoT pub/sub | 과제 명시. IoT 센서의 비동기/대량 이벤트 전달에 최적 |
| Axios.JS | HTTP 클라이언트 | 과제 명시. Fitbit 시뮬레이터가 Axios로 로컬 서버에 POST |
| mosquitto (권장) | MQTT 브로커 | Raspberry Pi에 로컬 설치해 완전한 On-Premise 구성 가능. 기본값은 `test.mosquitto.org` 공용 브로커 |
| HTML5 Canvas | 차트 | 외부 CDN 불필요. 완전한 오프라인 구동 지원 |

## 4. 구현 상세

### 4.1 스트레스 분석 알고리즘

`server/services/stressAnalyzer.js` 에서 구현. 기획서에는 "HRV와 환경 변수를 조합한 자체 스트레스 알고리즘"으로만 명시되어 있어, 다음과 같이 구체화했다.

각 지표를 0~100의 "스트레스 기여도"로 정규화 후 가중합한다.

| 지표 | 정규화 방식 | 가중치 |
| ---- | ----------- | ------ |
| HRV | 60ms↑에서 0, 20ms↓에서 100 | 40% |
| 심박수 | 60bpm↓에서 0, 120bpm↑에서 100 | 20% |
| CO₂ | 400ppm에서 0, 1600ppm↑에서 100 | 15% |
| 소음 | 30dB에서 0, 90dB↑에서 100 | 10% |
| 수면 점수 | 80점↑에서 0, 0점에서 100 | 15% |

결과는 0~100 사이 정수. 분류는 `< 50` 정상, `50~69` 주의, `≥ 70` 경고로 나눈다.
**주요 요인(primary_factor)**은 기획서 예시인 `high_co2_with_low_hrv` 복합 케이스도 특별 처리한다.

### 4.2 알람 로직

기획서 1.3.2의 파이썬 의사코드를 JavaScript로 이식하며 경계값을 보존했다.

| 알람 코드 | 조건 | 레벨 | 메시지 |
| --------- | ---- | ---- | ------ |
| `ACUTE_STRESS` | HRV < 30 AND HR > 90 | WARNING | 높은 스트레스 감지: 3분 명상을 시작할까요? |
| `BAD_ENV` | CO₂ > 1000 OR 소음 > 70 | INFO | 집중력 저하 환경: 환기가 필요하거나 장소를 옮겨보세요. |
| `INACTIVE` | 1분 걸음수 < 10 | CAUTION | 장시간 부동 자세: 가벼운 스트레칭으로 긴장을 풀어주세요. |
| `LOW_CONDITION` | 수면 점수 < 60 AND HRV < 20 | ADVICE | 컨디션 난조: 오늘은 카페인을 줄이고 일찍 휴식하세요. |

기획서 원문은 "걸음수 < 1000"이었으나 이는 "1분 간 1000걸음"으로 읽혔을 때 현실과 어긋나므로,
주석에 원문을 남기고 임계치를 10으로 보정했다(대체로 걷고 있지 않은 상황을 감지하기 위함).

### 4.3 해결 가이드

기획서 1.3.1 MVP "해결 가이드 제공 — 심호흡 가이드"를 `stressAnalyzer.buildGuide()`에서 제공한다.
상태가 `HIGH_CAUTION`이면 **4-7-8 호흡법** 단계, `CAUTION`이면 환기/스트레칭을 안내한다.

### 4.4 저장 전략

On-Premise 환경에서 외부 DB 의존을 피하기 위해 JSON 파일 기반 경량 저장소를 채택했다.
- 최근 500개의 통합 샘플, 최근 200개의 알림만 보존하여 Raspberry Pi에서도 용량 부담 없음
- 확장이 필요하면 `server/db/storage.js` 인터페이스만 유지한 채 SQLite, InfluxDB 등으로 교체 가능

## 5. REST API 명세

| Method | Path | 설명 |
| ------ | ---- | ---- |
| GET  | `/api/health` | 서버 헬스체크 |
| GET  | `/api/info` | 서비스/팀 메타 |
| POST | `/api/data/fitbit` | Fitbit 데이터 수신 (Axios HTTP 경로) |
| POST | `/api/data/sensor` | IoT 환경 데이터 수신 (보조 HTTP 경로) |
| GET  | `/api/data/latest/:userId` | 사용자 최신 스냅샷 |
| GET  | `/api/data/latest` | 전체 사용자 최신 요약 |
| GET  | `/api/data/history?user_id=&limit=` | 병합 샘플 히스토리 |
| GET  | `/api/stress/:userId` | 현재 스트레스 분석 + 가이드 |
| GET  | `/api/stress/:userId/history?limit=` | 스트레스 추이 시계열 |
| GET  | `/api/alerts?user_id=&limit=` | 최근 알림 목록 |

## 6. 실행 및 검증 결과

### 6.1 실행 명령

```bash
npm install
npm run server        # 로컬 Express 서버
npm run sensor        # IoT 센서 시뮬레이터 (MQTT)
npm run fitbit        # Fitbit 시뮬레이터 (Axios)
# 또는
npm run dev           # concurrently 로 세 개 동시 실행
```

### 6.2 엔드 투 엔드 스모크 테스트

개발 단계에서 다음 시퀀스로 전체 흐름 동작을 확인했다.

```bash
# 1) 서버 기동
$ curl http://localhost:3000/api/health
{"status":"ok","service":"smart-healthcare-onprem","timestamp":"2026-04-24T13:17:27Z","users":0}

# 2) Fitbit + 환경 데이터 주입
$ curl -X POST http://localhost:3000/api/data/fitbit -H "Content-Type: application/json" \
    -d '{"user_id":"user-001","fitbit":{"heart_rate":95,"hrv":25,"spo2":98,"steps_last_minute":5,"sleep_score":55}}'
$ curl -X POST http://localhost:3000/api/data/sensor -H "Content-Type: application/json" \
    -d '{"user_id":"user-001","environment":{"temperature":25,"humidity":50,"co2_ppm":1200,"noise_db":55},"location":"study_room"}'

# 3) 스트레스 분석 결과
$ curl http://localhost:3000/api/stress/user-001
{
  "current_stress_level": 66,
  "stress_status": "CAUTION",
  "primary_factor": "high_co2_with_low_hrv",
  "alerts": [
    {"level":"WARNING","code":"ACUTE_STRESS","message":"높은 스트레스 감지: 3분 명상을 시작할까요?"},
    {"level":"INFO","code":"BAD_ENV","message":"집중력 저하 환경: 환기가 필요하거나 장소를 옮겨보세요."},
    {"level":"CAUTION","code":"INACTIVE","message":"장시간 부동 자세: 가벼운 스트레칭으로 긴장을 풀어주세요."}
  ],
  "guide": {
    "title": "자리에서 잠깐 일어나기",
    "steps": ["의자에서 일어나 목과 어깨를 천천히 돌린다","창문을 열어 환기를 한다","물 한 잔을 마신다"],
    "reason": "high_co2_with_low_hrv"
  }
}
```

HRV 25 + 심박수 95 + CO₂ 1200 + 1분 걸음 5 → 세 개의 알림(ACUTE_STRESS, BAD_ENV, INACTIVE)이 정확히 트리거되며, 기획서가 예시로 든 `high_co2_with_low_hrv` 복합 요인 분류가 정상적으로 나타나는 것을 확인했다.

### 6.3 대시보드 화면 구성

`public/index.html` 의 섹션 구성은 다음과 같다.

1. 상단 바 — 서버 상태, 사용자 ID
2. 현재 스트레스 게이지 (색상: 정상 녹색 / 주의 주황 / 경고 빨강)
3. 해결 가이드 카드
4. Fitbit 생체 데이터 카드 (HR, HRV, SpO₂, 걸음, 수면)
5. 환경 카드 (온/습/CO₂/소음/위치)
6. 스트레스 추이 차트 (최근 50 포인트)
7. 최근 알림 타임라인

## 7. 기획서와의 매핑 및 변경점

### 7.1 매핑

| 기획서 항목 | 구현 위치 |
| ---------- | -------- |
| 1.2.1 수집 | `sensors/*.js` |
| 1.2.1 엣지 처리 | `server/services/mqttClient.js` |
| 1.2.1 저장/분석 | `server/db/storage.js`, `server/services/stressAnalyzer.js` |
| 1.2.1 피드백 | `public/` 대시보드 |
| 1.2.3 데이터 명세서 | `/api/data/latest/:userId` 응답 형태 |
| 1.3.1 MVP 데이터 수집 | MQTT(센서) + Axios HTTP(Fitbit) 이원화 |
| 1.3.1 MVP 스트레스 분석/시각화 | `stressAnalyzer` + 원형 게이지 + 라인 차트 |
| 1.3.1 MVP 해결 가이드 | `buildGuide()` 4-7-8 호흡법 안내 |
| 1.3.2 알람 로직 | `buildAlerts()` 4종 알림 |

### 7.2 과제 범위에 맞춰 미구현한 기획서 항목

과제 지시 ①의 "여건 상 개발하기 어려운 기능은 제외 가능" 조항에 근거해 다음은 제외 또는 축소했다. 클라우드 개발 단계에서 추가 예정이다.

- **FCM 푸시 알림**: On-Premise 과제 범위 초과. 대시보드 내 알림 목록으로 대체
- **AI 기반 번아웃 예측**: TensorFlow Lite 추론은 교안상 "제한" 표시. 현재는 규칙 기반 분석만 수행
- **캐릭터 성장, 심리상담사 연결**: 확장 기능이므로 범위에서 제외

### 7.3 기획서에서 발견한 오탈자/의도 재해석

기획서 1.3.2 조건 `data["fitbit"]["steps_last_minute"] < 1000` 은 "1분에 1000걸음"을 의미하게 되어 현실성 없음. 실제 의도한 바인 "부동 자세 감지"를 위해 임계치를 **10걸음**으로 보정했고, 원문을 코드 주석으로 보존했다.

## 8. Raspberry Pi 배포 시나리오

1. Raspberry Pi OS(64-bit) + Node.js 20 + Mosquitto 설치
2. 본 저장소를 `git clone` 후 `npm install`
3. `.env` 로 `MQTT_BROKER_URL=mqtt://localhost:1883` 지정
4. `pm2` 로 server/sensor 프로세스를 상시 구동 등록
5. 같은 Wi-Fi 내 스마트폰 브라우저에서 `http://<RPi_IP>:3000/` 접속

Fitbit 실기기 연동 시에는 `sensors/fitbitSimulator.js` 대신 `Fitbit Web API OAuth2 클라이언트`를 Axios로 구현해 `/api/data/fitbit` 에 동일한 스키마로 POST하도록 교체하면 된다. 서버 측 코드는 변경 불필요.

## 9. 조원별 역할 및 LLM 사용 내역

### 9.1 조원별 역할

| 이름 | 학번 | 역할 |
| ---- | ---- | ---- |
| 김여진 (팀장) | 202411265 | 헬스케어 서비스 기획 · 서버/API 설계 · 구현 총괄 |
| 양현준 | 202011326 | LLM 보고서 및 PPT 제작 |
| 경장욱 | 202315304 | 스마트 헬스케어 서비스 사례 조사 |
| 정기현 | 202315318 | 웨어러블 기술 조사 |

### 9.2 LLM 사용 내역 (Claude / Anthropic)

양심서약에 따라 명확히 밝힌다.

- **스캐폴딩 보조**: Express.JS + MQTT.JS + Axios.JS 조합에 맞는 디렉토리 구조 초안 생성을 LLM에 요청
- **알고리즘 이식 리뷰**: 기획서의 파이썬 의사코드(알람 로직)를 JavaScript로 옮긴 뒤, 경계값 테스트 케이스 검토
- **README/보고서 포매팅**: 마크다운 표와 섹션 구성 제안

모든 **최종 코드 확인·동작 검증·수치 튜닝(가중치, 임계치)**은 팀 내에서 직접 수행했고, 기획서 작성과 서비스 정의는 LLM 사용 없이 팀 토의로 결정했다.

## 10. 한계점 및 향후 확장

| 한계점 | 확장 방향 |
| ------ | --------- |
| 규칙 기반 분석 → 개인차 반영 부족 | 사용자별 baseline HRV/수면 학습 후 Z-score 기반 동적 임계치 |
| JSON 파일 저장 → 장기 데이터 집계 어려움 | InfluxDB 또는 TimescaleDB 로 교체 |
| 실기기(Fitbit) 미연동 | `sensors/fitbitSimulator.js` 교체하여 Fitbit Web API OAuth2 플로우 구현 |
| 푸시 알림 없음 | Firebase Cloud Messaging 또는 웹 Push API 추가 |
| 인증/보안 부재 | JWT 기반 사용자 인증 + HTTPS + TLS 1.3 적용 (기획서 1.5 보안/윤리 섹션 참조) |

---

**부록**: 실행 가능한 전체 소스코드는 저장소 루트와 `server/`, `sensors/`, `public/` 디렉토리에 포함되어 있다. `npm install && npm run dev` 명령 하나로 세 개의 프로세스를 띄워 대시보드 http://localhost:3000/ 에서 즉시 서비스를 확인할 수 있다.
