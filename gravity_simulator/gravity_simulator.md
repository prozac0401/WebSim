# Gravity Simulator
[블로그 글]
https://prozac0401.tistory.com/43

질량을 가진 물체 사이의 중력 상호작용을 시각화한 시뮬레이터입니다.

## Script Functions
- `init()` - 캔버스 크기를 설정하고 시뮬레이터를 초기화합니다.
- `resizeCanvas()` - 화면 크기 변경 시 캔버스를 조정합니다.
- `setupEventListeners()` - 마우스 및 터치 이벤트와 슬라이더를 연결합니다.
- `handleMouseDown(e)` / `handleMouseMove(e)` / `handleMouseUp(e)` - 위성 발사와 블랙홀 이동을 처리합니다.
- `handleTouchStart(e)` / `handleTouchMove(e)` / `handleTouchEnd(e)` - 모바일 터치 이벤트 대응입니다.
- `updateDragIndicator(start, current)` - 드래그 중 궤적 원을 표시합니다.
- `hideDragIndicator()` - 드래그 표시를 숨깁니다.
- `launchSatellite(start, end)` - 시작점과 끝점으로 위성을 발사합니다.
- `updatePlanetCount()` - 블랙홀 수를 초기화하고 배치합니다.
- `updateSpeedMult()` `updateGravityStrength()` `updateRandomCount()` - 슬라이더 값 변화를 반영합니다.
- `addRandomPlanet()` `addRandomSatellite()` - 무작위 블랙홀과 위성을 생성합니다.
- `clearSatellites()` - 모든 위성을 제거합니다.
- `toggleCollision()` - 충돌 처리 여부를 토글합니다.
- `toggleOrbit()` / `toggleVelocity()` - 궤도 및 속도 벡터 표시를 전환합니다.
- `resetSim()` - 시뮬레이션을 초기 상태로 재설정합니다.
- `startSim()` / `pauseSim()` - 시뮬레이션을 실행하거나 일시 정지합니다.
- `updateStatus()` - 상태 표시줄 정보를 갱신합니다.
- `updateUI()` - 초기 슬라이더 값을 반영합니다.
- `physics(dt)` - 중력 계산과 위성 이동 등을 처리합니다.
- `draw()` - 블랙홀, 위성, 궤도를 화면에 그립니다.
- `loop()` - 애니메이션 루프를 돌며 물리 계산과 그리기를 반복합니다.
