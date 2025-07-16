# Boids Simulation
[블로그 글]
https://prozac0401.tistory.com/34

단순한 규칙으로 새 떼의 군집 행동을 재현하는 보이드 알고리즘 시뮬레이션입니다.

## Script Functions
- `Vector2D` 클래스: 2차원 벡터 연산을 위한 `add`, `subtract`, `multiply`, `divide`, `magnitude`, `normalize`, `limit`, `distance` 메서드를 제공합니다.
- `Boid` 클래스: `update`, `applyForce`, `seek`, `separate`, `align`, `cohesion`, `flock`, `render` 메서드로 개별 보이드의 행동을 정의합니다.
- `initBoids()` - 지정한 수만큼 보이드를 초기 위치에 생성합니다.
- `animate(time)` - 매 프레임 보이드의 상태를 업데이트하고 화면을 다시 그립니다.
- `updateControls()` - 슬라이더 값 변경 시 파라미터를 갱신합니다.
- 마우스 `mousemove` 이벤트 핸들러는 마우스 근처의 보이드에 힘을 가하여 상호작용을 만듭니다.
