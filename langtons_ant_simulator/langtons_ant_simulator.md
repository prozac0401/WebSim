# Langtons Ant Simulator
[블로그 글]
https://prozac0401.tistory.com/35

간단한 규칙으로 복잡한 패턴을 만들어 내는 랭턴의 개미 알고리즘을 구현했습니다.

## Script Functions
- `LangtonsAnt` 클래스: 시뮬레이터의 핵심 로직을 담고 있습니다.
    - `reset()` - 격자와 개미 상태를 초기화합니다.
    - `setupEventListeners()` - 버튼과 슬라이더, 캔버스 클릭 이벤트를 연결합니다.
    - `handleCanvasClick(e)` - 클릭 위치로 개미를 이동시킵니다.
    - `start()` / `pause()` - 자동 실행을 시작하거나 멈춥니다.
    - `animate()` - 일정 속도로 여러 스텝을 진행하며 화면을 갱신합니다.
    - 좌표 변환용 `gridToCanvas`, `canvasToGrid`, `coordToIndex` 메서드를 제공합니다.
    - `step()` - 한 스텝의 규칙을 적용하여 개미와 격자를 업데이트합니다.
    - `updateStats()` - 현재 스텝 수 등 정보를 표시합니다.
    - `draw()` - 격자와 개미를 캔버스에 그립니다.
- 전역 `resizeCanvas()` 함수는 창 크기에 맞추어 캔버스를 재설정합니다.
