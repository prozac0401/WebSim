# Cosmic Simulator Single Div
[블로그 글]
https://prozac0401.tistory.com/56

단 하나의 div 요소로 우주를 표현한 CSS 애니메이션 예제입니다.

## Script Functions
- `CosmicSimulator` 생성자: 우주 시뮬레이터를 초기화하며 내부에서 다양한 메서드를 정의합니다.
- `initialize()` - 별 생성과 이벤트 바인딩 후 애니메이션을 시작합니다.
- `createStars()` - 배경 별 요소를 무작위로 배치합니다.
- `bindEvents()` - 클릭과 버튼 동작 등 사용자 이벤트를 연결합니다.
- `createCelestialBody(x, y)` - 행성(또는 천체)을 생성하여 캔버스에 추가합니다.
- `createElement(x, y, size, type)` - 천체를 표현하는 DOM 요소를 만듭니다.
- `animate()` - 매 프레임 물리 계산과 위치 갱신을 수행합니다.
- `updatePhysics()` - 천체들 간의 중력 효과를 계산합니다.
- `updatePositions()` - 위치 값을 적용하고 궤적을 생성합니다.
- `createTrail(x, y, size)` - 천체 이동 궤적을 시각적으로 표시합니다.
- `checkCollisions()` - 천체들 사이의 충돌 여부를 검사합니다.
- `mergeBodies(a, b, ia, ib)` - 충돌한 두 천체를 합쳐 새로운 천체로 만듭니다.
- `transformToBlackhole(body)` - 일정 질량 이상이 되면 블랙홀로 변환합니다.
- `splitCelestialBody(el, x, y)` - 클릭한 천체를 여러 조각으로 나눕니다.
- `createBlackholeExplosion(x, y)` - 블랙홀 분열 시 입자 효과를 생성합니다.
- `createSplitEffect(x, y)` - 일반 천체 분열 효과를 만듭니다.
- `checkStageTransition()` - 생성된 천체 수에 따라 배경 단계를 변경합니다.
- `getCurrentStage()` - 현재 단계 정보를 반환합니다.
- `showMessage(text)` - 우하단 로그에 메시지를 표시합니다.
- `addToStatusLog(text)` - 로그 항목을 추가하며 최대 개수를 제한합니다.
- `updateStats()` - 생성 횟수와 블랙홀 수 등을 갱신합니다.
- `resetUniverse()` - 모든 천체를 제거하고 초기 상태로 돌립니다.
