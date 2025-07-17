# Fractal Tree Simulator
[블로그 글]
https://prozac0401.tistory.com/66

여러 L-System 프리셋을 선택해 다양한 프랙탈 패턴을 그려 볼 수 있습니다. 각도와 가지 길이, 바람 세기를 조절하며 세대별 성장을 관찰할 수 있습니다.

## 패턴 프리셋
시뮬레이터에서 제공하는 L-System 예시는 다음 표와 같습니다. **Axiom**은 패턴 생성을 시작하는 기본 문자열이며, **Production Rules**는 각 세대에서 문자가 어떻게 치환되는지를 정의합니다. 이 규칙을 반복 적용하면 복잡한 프랙탈이 만들어집니다.

| 패턴 이름 | 계열 | Axiom (시작 문자열) | Production Rules | 기본 회전각 |
| ------------------------------ | ------ | -------------- | ---------------------------------------------------------- | ------------- |
| **Koch Snowflake**             | 기하·눈꽃  | `F++F++F`      | `F → F−F++F−F`                                             | **60°**       |
| **Sierpinski Triangle**        | 기하·삼각  | `F-G-G`        | `F → F-G+F+G-F`<br>`G → GG`                                | **120°**      |
| **Heighway Dragon**            | 기하·드래곤 | `FX`           | `X → X+YF+`<br>`Y → -FX-Y`                                 | **90°**       |
| **Levy C-Curve**               | 기하·곡선  | `F`            | `F → +F--F+`                                               | **45°**       |
| **Hilbert Curve**              | 공간 충전  | `A`            | `A → -BF+AFA+FB-`<br>`B → +AF-BFB-FA+`                     | **90°**       |
| **Gosper (Peano-Gosper)**      | 공간 충전  | `A`            | `A → A+BF++BF-FA--FAFA-BF+`<br>`B → -FA+BFBB++BF+FA--FA-B` | **60°**       |
| **Classic Fractal Plant**      | 나무·식물  | `X`            | `X → F-[[X]+X]+F[+FX]-X`<br>`F → FF`                       | **25°**       |
| **Penrose Tiling (P2 5-fold)** | 타일·준주기 | `F++F++F`      | `F → F++F--F` (다른 변형 다수)                                   | **36° / 72°** |

각 프리셋의 기본 회전각은 터틀 그래픽스의 방향을 결정하며, 설정 패널에서 임의로 조정할 수 있습니다.
