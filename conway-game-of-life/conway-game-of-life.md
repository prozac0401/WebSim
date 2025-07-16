# Conway Game of Life
[블로그 글]
https://prozac0401.tistory.com/16

세포 자동자의 고전인 게임 오브 라이프를 구현한 예제입니다.

## Script Functions
- `initGrid()` - 내부 그리드 배열을 초기화합니다.
- `createGridDOM()` - 현재 화면 크기에 맞추어 셀 요소들을 생성합니다.
- `toggleCell(row, col)` - 특정 셀의 생존 상태를 토글합니다.
- `setCell(row, col, state)` - 드래그 중 셀 상태를 지정합니다.
- `handleMouseDown(row, col, e)` - 마우스 또는 터치 시작 시 셀을 수정합니다.
- `handleMouseEnter(row, col)` - 드래그 중 셀을 지나갈 때 호출됩니다.
- `handleMouseUp()` - 드래그를 종료합니다.
- `updateDisplay()` - 화면의 셀 상태와 세대 수를 갱신합니다.
- `countNeighbors(row, col)` - 주변 이웃 셀의 개수를 계산합니다.
- `nextGeneration()` - 규칙에 따라 다음 세대를 계산합니다.
- `loadPattern(name)` - 미리 정의된 패턴을 그리드에 배치합니다.
