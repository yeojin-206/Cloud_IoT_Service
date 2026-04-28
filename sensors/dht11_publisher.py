#!/usr/bin/env python3
"""
DHT11 → On-Premise 헬스케어 서버 퍼블리셔
Raspberry Pi 에서 실행. GPIO 4번에 연결된 DHT11 의 온도/습도를
주기적으로 읽어서 우리 Express 서버의 /api/data/sensor 로 HTTP POST.

사용법:
    SERVER_URL=http://172.30.60.107:3000 python3 dht11_publisher.py

환경변수:
    SERVER_URL          서버 주소 (필수, 기본 http://localhost:3000)
    USER_ID             사용자 ID (기본 user-001)
    DHT_PIN             GPIO 핀 번호 (기본 4)
    INTERVAL            측정 주기 (초, 기본 5)
    LOCATION            위치 라벨 (기본 study_room)
"""
import os
import time
import sys
import datetime
import board
import adafruit_dht
import requests

SERVER_URL = os.environ.get("SERVER_URL", "http://localhost:3000")
USER_ID = os.environ.get("USER_ID", "user-001")
DHT_PIN_NUM = int(os.environ.get("DHT_PIN", "4"))
INTERVAL = int(os.environ.get("INTERVAL", "5"))
LOCATION = os.environ.get("LOCATION", "study_room")

# board.D4 같은 식으로 동적 매핑
PIN = getattr(board, f"D{DHT_PIN_NUM}")

print(f"[dht11] 시작")
print(f"[dht11] 서버: {SERVER_URL}/api/data/sensor")
print(f"[dht11] 사용자: {USER_ID}")
print(f"[dht11] GPIO 핀: {DHT_PIN_NUM}")
print(f"[dht11] 측정 주기: {INTERVAL}s")

dht = adafruit_dht.DHT11(PIN)

while True:
    try:
        temperature = dht.temperature
        humidity = dht.humidity

        if temperature is not None and humidity is not None:
            payload = {
                "user_id": USER_ID,
                "timestamp": datetime.datetime.now().isoformat(),
                "environment": {
                    "temperature": float(temperature),
                    "humidity": float(humidity),
                },
                "location": LOCATION,
            }
            try:
                r = requests.post(
                    f"{SERVER_URL}/api/data/sensor",
                    json=payload,
                    timeout=5,
                )
                status = "OK" if r.status_code == 200 else f"FAIL {r.status_code}"
                print(
                    f"[dht11] {temperature:.1f}°C / {humidity:.0f}% → server {status}"
                )
            except requests.exceptions.RequestException as e:
                print(f"[dht11] 서버 전송 실패: {e}")
        else:
            print("[dht11] 측정값 None (재시도)")
    except RuntimeError as err:
        # DHT11 은 가끔 실패함. 정상 동작 일부.
        print(f"[dht11] 일시 오류: {err.args[0]}")
    except KeyboardInterrupt:
        print("\n[dht11] 종료")
        dht.exit()
        sys.exit(0)
    except Exception as err:
        print(f"[dht11] 치명적 오류: {err}")
        dht.exit()
        raise

    time.sleep(INTERVAL)
