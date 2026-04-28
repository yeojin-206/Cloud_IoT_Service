#!/usr/bin/env bash
# RPi 전체 실행 스크립트
# - 기존 프로세스 정리
# - 서버 + 환경 시뮬 (CO2/소음) + DHT11 publisher (온/습도) 백그라운드 실행
# - 상태 출력
set -e
cd "$(dirname "$0")"

echo "[run] 기존 프로세스 정리 중..."
pkill -f "node server/app.js" 2>/dev/null || true
pkill -f "iotSensorSimulator" 2>/dev/null || true
pkill -f "dht11_publisher" 2>/dev/null || true
sleep 1

echo "[run] Python requests 패키지 확인..."
python3 -c "import requests" 2>/dev/null || pip3 install --break-system-packages requests

echo "[run] 1/3 서버 시작..."
nohup node server/app.js > /tmp/healthcare-server.log 2>&1 &
sleep 2

echo "[run] 2/3 환경 시뮬레이터 (CO2/소음만) 시작..."
nohup env SKIP_TEMP_HUMI=true node sensors/iotSensorSimulator.js > /tmp/healthcare-sensor.log 2>&1 &
sleep 1

echo "[run] 3/3 DHT11 publisher (실측 온/습도) 시작..."
nohup env SERVER_URL=http://localhost:3000 python3 sensors/dht11_publisher.py > /tmp/healthcare-dht11.log 2>&1 &
sleep 4

echo ""
echo "============================================"
echo "✅ 3개 프로세스 모두 시작됨"
echo "============================================"
echo ""
echo "▶ 실행 중 PID:"
ps aux | grep -E "(node server|iotSensor|dht11_publisher)" | grep -v grep | awk '{printf "   %s   %s %s %s\n", $2, $11, $12, $13}'
echo ""
echo "▶ 서버 로그 (최근 5줄):"
tail -5 /tmp/healthcare-server.log | sed 's/^/   /'
echo ""
echo "▶ 환경 시뮬 로그 (최근 3줄):"
tail -3 /tmp/healthcare-sensor.log | sed 's/^/   /'
echo ""
echo "▶ DHT11 로그 (최근 3줄):"
tail -3 /tmp/healthcare-dht11.log | sed 's/^/   /'
echo ""
echo "============================================"
echo "확인: http://localhost:3000/  (또는 Cloudflare 터널 URL)"
echo "중단: bash stop-rpi.sh"
echo "로그: tail -f /tmp/healthcare-{server,sensor,dht11}.log"
echo "============================================"
