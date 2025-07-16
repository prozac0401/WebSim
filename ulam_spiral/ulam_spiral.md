# Ulam Spiral
[블로그 글]
https://prozac0401.tistory.com/48

소수의 분포를 소용돌이 형태로 보여 주는 울람 나선 시각화입니다.

## Script Functions
- `initializeElements()` - 캔버스와 슬라이더 등 DOM 요소를 찾아 초기 설정을 합니다.
- `sieveOfEratosthenes(n)` - 소수 판별을 위한 에라토스테네스의 체 구현입니다.
- `drawUlamSpiral(elements, maxN)` - 주어진 최대 수까지 울람 나선을 그립니다.
- `initialize()` - 요소 초기화 후 슬라이더 이벤트를 설정하고 초기 나선을 그립니다.
