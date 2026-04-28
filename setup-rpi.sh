#!/usr/bin/env bash
# RPi 초기 셋업 스크립트
# 사용법: bash setup-rpi.sh
# 동작:
#   1) .env 파일 작성 (Fitbit OAuth 자격증명 포함)
#   2) data/fitbit-tokens.json 작성 (이미 발급받은 토큰)
#   3) npm install
#   4) 검증 메시지 출력
set -e

cd "$(dirname "$0")"

echo "[setup] 1/3 .env 작성 중..."
cat > .env << 'EOF'
PORT=3000
HOST=0.0.0.0

MQTT_ENABLED=false
MQTT_BROKER_URL=mqtt://test.mosquitto.org:1883
MQTT_TOPIC_SENSOR=healthcare/sensor
MQTT_TOPIC_FITBIT=healthcare/fitbit
MQTT_CLIENT_ID=rpi-edge-server

USER_ID=user-001
SENSOR_INTERVAL_MS=3000
FITBIT_INTERVAL_MS=5000

FITBIT_ENABLED=true
FITBIT_CLIENT_ID=23VJHX
FITBIT_CLIENT_SECRET=7bffdcf9edc688ce9e3b7e8132dee03a
FITBIT_REDIRECT_URI=http://localhost:3000/auth/fitbit/callback
FITBIT_POLL_INTERVAL_MS=60000
EOF

echo "[setup] 2/3 Fitbit 토큰 파일 작성 중..."
mkdir -p data
cat > data/fitbit-tokens.json << 'EOF'
{
  "access_token": "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiIyM1ZKSFgiLCJzdWIiOiJENURNS1giLCJpc3MiOiJGaXRiaXQiLCJ0eXAiOiJhY2Nlc3NfdG9rZW4iLCJzY29wZXMiOiJyb3h5IHJociByYWN0IHJwcm8gcnNsZSIsImV4cCI6MTc3NzM3ODQ0OSwiaWF0IjoxNzc3MzQ5NjQ5fQ.7qJwORwAGaJsMcr3vDOCxkMaXnJdyoauCM97iMTSkAU",
  "refresh_token": "84007d56e21bfc9d53a492fcc2cd3acf5c74b528981bf1817bec5d5840f09ea9",
  "expires_at": 1777378449582,
  "user_id": "D5DMKX",
  "scope": "profile oxygen_saturation sleep heartrate activity"
}
EOF

echo "[setup] 3/3 npm 의존성 설치 중 (2-5분 소요)..."
npm install

echo ""
echo "✅ 셋업 완료."
echo ""
echo ".env 라인수:    $(wc -l < .env)"
echo "토큰 파일:      $(ls -la data/fitbit-tokens.json | awk '{print $5, $9}')"
echo "node_modules:  $(ls node_modules 2>/dev/null | wc -l) 패키지"
echo ""
echo "다음 단계:"
echo "  node server/app.js                 # 서버 실행"
echo "  python3 ~/dht11_publisher.py &     # DHT11 (별도 터미널)"
echo ""
