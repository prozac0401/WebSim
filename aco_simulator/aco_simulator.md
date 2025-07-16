# ACO Simulator
[블로그 글]
https://prozac0401.tistory.com/37

개미 집단이 페로몬을 이용해 최적 경로를 탐색하는 과정을 웹에서 볼 수 있는 시뮬레이터입니다.

## Script Functions
- `setupCanvas()` - 캔버스 크기를 초기화하고 리사이즈 이벤트를 등록합니다.
- `resizeCanvas()` - 창 크기가 변할 때 캔버스를 다시 조정합니다.
- `setupEventListeners()` - 버튼과 슬라이더 등 UI 요소의 이벤트를 설정합니다.
- `addCity(x, y)` - 지정한 위치에 새로운 도시를 추가합니다.
- `updateDistanceMatrix()` - 거리와 페로몬 행렬을 재계산합니다.
- `updateDistanceMatrixOnly()` - 거리 행렬만 업데이트합니다.
- `generateRandomCities()` - 초기 도시들을 무작위로 배치합니다.
- `initializeMatrices()` - 거리와 페로몬 정보를 초기화합니다.
- `startSimulation()` - 시뮬레이션을 초기화하고 시작합니다.
- `continuousSimulation()` - 최대 세대까지 반복 실행합니다.
- `runGeneration()` - 한 세대의 경로 탐색과 페로몬 갱신을 수행합니다.
- `animateAnts()` - 개미들이 이동하는 모습을 애니메이션으로 표시합니다.
- `smoothMoveAnts()` - 부드러운 이동 효과를 계산합니다.
- `clearAntTrails()` - 개미의 이동 흔적을 정리합니다.
- `constructPath()` - 개미 한 마리의 이동 경로를 생성합니다.
- `calculatePathDistance(path)` - 경로의 총 거리를 계산합니다.
- `updatePheromones(paths, distances)` - 페로몬 값을 업데이트합니다.
- `updateRoadNetwork()` - 페로몬 수준에 따라 도로 네트워크를 관리합니다.
- `updateDisplay()` - 캔버스에 현재 상태를 그립니다.
- `drawRoadNetwork()` - 도로를 시각적으로 표시합니다.
- `drawPath(path, color, width)` - 주어진 경로를 선으로 그립니다.
- `drawMovingAnts()` - 움직이는 개미들을 그립니다.
- `drawCities()` - 도시 노드를 캔버스에 그립니다.
- `stopSimulation()` - 진행 중인 시뮬레이션을 멈춥니다.
- `resetSimulation()` - 시뮬레이션을 초기 상태로 되돌립니다.
- `updateStats()` - 세대 수 등 통계 정보를 갱신합니다.
- `updateParameters()` - UI 입력값을 읽어 설정을 갱신합니다.
- `delay(ms)` - 일정 시간 대기하는 Promise 를 반환합니다.
