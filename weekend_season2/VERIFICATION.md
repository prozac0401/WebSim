# 주말 계획표 시즌2 검증 기록

2026-10-17 로컬 구현을 검증했습니다. 아래 최초 결과 표는 초기 구현·시험·독립 검토 시점의 기록입니다. 이후 사용자의 업로드 요청으로 원격 브랜치 커밋·push를, 다시 배포 요청으로 최신 `main` 통합과 기존 GitHub Pages 공개 배포를 작업 범위에 추가했습니다. 계정·Secret·호스팅 설정은 변경하지 않습니다.

## 결과

| 검사 | 결과 | 직접 확인한 범위 |
| --- | --- | --- |
| 시즌2 자동시험 | **PASS 60 / FAIL 0** | 날짜·반복·장부 22, 엔진·저장 18, 독립 검토 회귀 15, 연간 여정 5 |
| 기존 관련 회귀 | **PASS 39 / FAIL 0** | 잉크 24, Boids 8, 기존 새 실험 5, 프리셋 2 |
| 합산 최종 Node 검사 | **PASS 99 / FAIL 0** | 아래 명령을 수정 후 다시 실행 |
| 실제 Chromium 통합 | **PASS 11개 검사 묶음 / FAIL 0** | 첫 두 주·실제 UI 1년 완주·반복·저장·모바일 등 |
| 원본 develop-web-game 클라이언트 | **PASS** | 설정→시작 클릭, 결정적 장면 훅, screenshot/text state 직접 열어 확인, 오류 로그 없음 |
| 독립 소스 검토 | **PASS, 발견 문제 수정 확인** | 다른 구현 담당자가 엔진·저장·UI 연결을 검토하고 재현 회귀시험 추가 |
| `git diff --check` | **PASS** | 공백 오류 없음; Windows LF→CRLF 안내는 오류가 아님 |
| Firefox·Safari·실물 Android/iOS | **NOT RUN** | Chromium 모바일 에뮬레이션과 구분 |
| 스크린리더 보조기기 실사용 | **NOT RUN** | 키보드·레이블·포커스·동작 줄이기는 별도로 확인 |
| 저사양 장치 성능·장기간 저장소 내구성 | **NOT RUN** | FPS·메모리·범용 안정성 보장 없음 |
| 사람의 장시간 재미·균형·30~45분 소요시간 평가 | **NOT RUN** | 자동 완주와 주관적 플레이 테스트는 별개 |
| 저장소의 무관한 전체 시험 | **NOT RUN** | 요청과 관련된 회귀만 실행 |
| 공개 사이트·배포 후 검사 | **NOT RUN (최초 로컬 검증 시점)** | 후속 배포 요청에 대한 공개 URL 확인은 별도로 수행 |

최종 자동시험 명령:

```powershell
node --test weekend_season2/*.test.cjs tests/new-labs.test.cjs tests/preset-scenes.test.cjs ink_time_machine/ink-flow-engine.test.cjs boids_simulation/boids-app.test.cjs
```

실제 브라우저 명령(정적 서버 실행 필요):

```powershell
$env:WEBSIM_URL = 'http://127.0.0.1:8766/'
node tests/weekend-season2.browser.cjs
```

## 완주와 데이터 검사

- 첫 14일의 날짜 처리와 공부·친구 만남·추가근무, 준비·관계·피로 변화 및 다음 급여일까지 보상 대기를 먼저 검사했습니다. UI에서도 첫 두 주의 배치→사건→회고→다음 주를 조작했습니다.
- 4개 프리셋 × 3개 시드의 활동을 계속 배치하는 혼합 선택으로 12개의 한 해를 완주했습니다. 각 한 해의 365개 일별 기록, 공휴일 기본 업무 중복 방지, 12회 고정비·카드 정산, 남은 지난 일정 없음, 원화 장부 항등식, 활동·결과물·월별·연말 로그 일치를 검사했습니다.
- 2028년 윤년의 366일과 공휴일 미확인 상태도 검사했습니다. UI의 새 게임은 2026년만 제공합니다.
- 같은 환경·시드·선택의 전체 결과가 같고, 성별만 달리한 두 한 해의 로그·경제·상태·결과물이 같음을 확인했습니다.
- 돈이 전혀 없고 돌봄 분담이 큰 경우도 무료 활동으로 완주하며 미납이 사라지지 않았습니다. 집중적인 면접 준비 후 취업·역할 변경 경로도 확인했습니다.
- 기존 플래너의 샘플·기억·비우기·복원, 홈 29개 항목과 시즌2 검색·진입 링크를 실제 브라우저로 검사했습니다.

## 브라우저에서 조작한 흐름

Chromium 1440×1000 데스크톱과 390×844 터치·동작 줄이기 환경에서 검사했습니다.

1. 4개 프리셋 선택, 환경 수정, Enter로 새 게임 시작.
2. 독서·공부·카드 사진·추가근무 배치. 평일 예약의 휴일 이동, 확정, 같은 시간 충돌, 날짜 미루기, 건너뛰기, 중단.
3. 주간 회고의 장면 전환, 다음 주 진행, 취미 결과물 생성과 보상 지급 대기.
4. 로컬 저장 후 재로드·이어하기, JSON 실제 다운로드, 잘못된 파일 거절, 유효한 파일 덮어쓰기 취소·승인.
5. 동일 UI 게임을 사건 선택 버튼과 진행 버튼으로 연말까지 완주. 저장된 365일 로그 및 소비 합계 확인.
6. 모바일 돌봄 프리셋의 터치 배치와 주간 진행, 수평 넘침 없음, 키보드 포커스 이동, 움직임 줄이기 상태에서 Canvas 픽셀 불변.
7. 게임 동안 외부 요청 없음, 브라우저 `pageerror`·`console.error` 없음.

검사 결과 JSON: [result.json](../output/playwright/weekend-season2/result.json). 자동 선택으로 만든 연간 실제 로그: [ui-year-summary.json](../output/playwright/weekend-season2/ui-year-summary.json). 개인 플레이 기록이 아닌 검사 시나리오입니다.

## 독립 검토에서 수정한 문제

- 사건 도중 정지·재개 시 이미 완료한 구간에 휴식이 중복 적용되는 문제, 지난 구간에 다시 배치할 수 있던 문제.
- 행동 후속 사건이 외부 난수 진행을 바꾸던 문제와 연기된 외부 사건 사이의 대기기간 문제.
- 돌봄과 사건 시간이 240분을 넘는 선택, 첫 외출에만 추가한다고 표시한 이동이 여러 외출에 적용되는 문제.
- 돌봄 충돌에서 다음 가능한 구간으로 원래 반복 회차를 보존해 재배치하는 경로 추가.
- 저장된 사건의 필수 문맥·진행 단계, 알 수 없는 활동·상속 속성 ID, 예산·정산 표식·활동 횟수·결과물 누락이 검증을 통과하던 문제.
- UI의 반복 조작이 직접 만든 불완전한 로그, 표시 주기·날짜 범위 불일치, 같은 날로 미루기가 관계를 깎던 문제.
- 횟수 정렬을 시간 순위로 부르던 회고 제목, 모바일 작은 글자·버튼·포커스 보존, 원래 날짜가 이동된 예약 확인을 보완했습니다.
- 최종 화면 확인에서 발견한 일정 조정 사유의 내부 구분값을 한국어 설명으로 바꾸고, 주간 회고의 실제 표시를 브라우저 검사에 포함했습니다.

수정 후 해당 회귀 및 통합 검사를 다시 통과했습니다. 최종 확인 범위에서 남은 진행 차단 문제는 발견하지 못했습니다. 모든 조합의 무결함을 보장하는 결과는 아닙니다.

## 화면 자료

- [시작 환경](../output/playwright/weekend-season2/setup-desktop.png)
- [주간 활동 배치](../output/playwright/weekend-season2/planning-desktop.png)
- [반복 일정](../output/playwright/weekend-season2/routines-desktop.png)
- [사건 선택](../output/playwright/weekend-season2/event-desktop.png)
- [주간 장면](../output/playwright/weekend-season2/week-scenes-desktop.png)
- [연말 결산 첫 화면](../output/playwright/weekend-season2/yearbook-overview.png)
- [연말 전체 화면](../output/playwright/weekend-season2/yearbook-desktop.png)
- [모바일 화면](../output/playwright/weekend-season2/planning-mobile.png)

이 자료는 `output/` 아래의 로컬 검사 산출물이며 Git 추적 대상에서 제외됩니다. 최종 설정·배치·모바일·연말·게임 클라이언트 화면을 열어 육안으로 확인했습니다.

## 변경 파일과 보존 범위

새 구현은 `weekend_season2/`에만 있습니다:

- `index.html`, `app.js`, `style.css`, `scene.js`
- `calendar.js`, `recurrence.js`, `finance.js`, `data.js`, `events.js`, `engine.js`, `storage.js`
- `calendar-finance.test.cjs`, `engine.test.cjs`, `independent-review.test.cjs`, `journey.test.cjs`
- `README.md`, `weekend_season2_doc.html`, `VERIFICATION.md`, `progress.md`

공통 변경은 루트 `README.md`, `index.html`, `assets/simulator.js`의 시즌2 목록·진입 링크와 도구 개수입니다. 새 브라우저 시험은 `tests/weekend-season2.browser.cjs`입니다. 기존 플래너·잉크·Boids 구현 파일은 수정하지 않았습니다.

격리 작업 사본의 브랜치는 `codex/weekend-season2`, 시작 커밋은 `0520531`입니다. 이후 배포 요청에 따라 최신 `origin/main`의 `9862ad9`를 격리 브랜치에 병합했습니다. 두 작업의 변경 파일은 겹치지 않았으며, 차량 시뮬레이터와 루트 `progress.md`가 최신 main과 같은 내용을 유지하는지 확인했습니다. 원본 작업 폴더의 미커밋 변경은 수정하지 않았습니다.

## 후속 배포 준비

- 기존 GitHub Pages는 `main` 브랜치의 `/` 경로를 배포합니다. 별도 호스팅이나 계정 설정을 추가하지 않습니다.
- 최신 main 통합 후 **PASS 127 / FAIL 0**: 기존 합산 99개와 최신 차량 시뮬레이터 관련 검사 28개를 함께 실행했습니다.
- 독립 읽기 검토에서 경로·정적 자산 참조 22개가 모두 존재하고 기존 기능의 변경이 보존됨을 확인했습니다.
- 공개 사이트 검사는 배포 후 같은 브라우저 검사에 `WEBSIM_URL=https://prozac0401.github.io/WebSim/`을 지정해 수행합니다. 배포 검사 산출물은 Git에서 제외되는 `output/playwright/weekend-season2-deployed/`에 따로 보관합니다.

```powershell
node --test weekend_season2/*.test.cjs tests/new-labs.test.cjs tests/preset-scenes.test.cjs ink_time_machine/ink-flow-engine.test.cjs boids_simulation/boids-app.test.cjs evolving_vehicles_2/continuous-race.test.cjs evolving_vehicles_2/racing-guidance.test.cjs
```

## 남은 범위와 해석 한계

비용·접근성·이동시간·효과·성과 판정은 제작자의 게임 가정입니다. 23개 사건은 짧은 연결 장면이며 장편 인물 서사나 현실 예측이 아닙니다. 다년 이어하기, 지방별 특별 휴일, 여행·장기 프로젝트, 개별 돌봄 대상별 일정은 제공하지 않습니다. 다른 연도는 날짜 엔진만 지원하고 휴일 자료를 추측하지 않습니다.

회고의 긴 목록은 최근 일부를 표시하며 전체 상태·로그는 저장 JSON에 남습니다. 기분의 월별 평균은 기록을 비교하는 값이고 삶의 평가가 아닙니다. 재미·플레이 시간·성능은 별도의 사람·장치 시험이 필요합니다.
