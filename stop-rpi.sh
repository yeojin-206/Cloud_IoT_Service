#!/usr/bin/env bash
# RPi 전체 프로세스 종료
echo "[stop] 모든 healthcare 프로세스 종료 중..."
pkill -f "node server/app.js" 2>/dev/null && echo "  - 서버 종료" || echo "  - 서버 (이미 종료)"
pkill -f "iotSensorSimulator" 2>/dev/null && echo "  - 환경 시뮬 종료" || echo "  - 환경 시뮬 (이미 종료)"
pkill -f "dht11_publisher" 2>/dev/null && echo "  - DHT11 publisher 종료" || echo "  - DHT11 publisher (이미 종료)"
echo "✅ 완료"
