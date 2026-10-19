# 협동·상자·활성 시간 확장 검증

2026-10-19, Windows, Node v24.13.1, Chromium 145.0.7632.6. 기준 및 작업 시작/종료 전 재조회한 원격 main은 `885754e59f9e0d8755829cbaec378dc65de4c43e`였다. 시작 당시 미병합 PR은 없었고 저장소/상위 경로에서 AGENTS.md는 발견되지 않았다. README, 최근 커밋, 엔진·레벨·저장·시험을 읽었다. 로컬 사용자의 `progress.md` 변경과 첨부 폴더는 건드리지 않고 별도 관리 worktree에서 구현했다.

기존 `.agents/skills/game-verification`과 `game-playtest`를 직접 읽고 협동·시간·필수성·중간/최종 UI 절차를 확장하여 실제 적용했다. 같은 역할 스킬은 만들지 않았다. skill-creator의 검증기로 둘 다 PASS. Python 의존성은 `output/tools/skill-validation`에만 설치했고 UTF-8 모드로 실행했다.

## 결과와 증거

모든 상대 증거 경로의 시작은 `output/playwright/routine-bot/cooperation/`이다. 원본 PNG·JSON·실제 입력 로그·stdout은 Git 제외 폴더에 보존한다. 정식 시험과 보고서는 저장소에 포함한다. 로컬 서버는 다른 세션의 8123 포트를 건드리지 않고 `PORT=8124`를 사용했다.

| 항목 | 결과 | 증거와 범위 |
| --- | --- | --- |
| 변경 전 기본 회귀 | PASS | 기존 엔진·저장·위험·서버 94/94 |
| 중간 전체 자동 검사 | PASS | 당시 150/150, `early/unit-tests.txt` |
| 최종 전체 자동 검사 | PASS | 155/155, `final/unit-tests.txt`; 반례 시험 수정 후 `final/unit-tests-final.txt` 재확인 |
| 24레벨·28지도 해결 가능성 | PASS | 기존 15레벨·18지도와 새 9레벨·10지도 모두 생산 실행기 사용. 한 레벨의 여러 지도는 같은 프로그램 사용 |
| 기존 내용 보존 | PASS | 기준 커밋의 숫자 ID 1~15 모든 기존 필드와 비교: 지도·도구·상한·힌트 동일. 함수 없는 레벨12 대안 유지 |
| 필수 활용 증명 | PASS | 반복 13, 대기 3, 무함수 3,280, 무조건 AST 13,021개 전체 열거. 협동은 더 강한 단독 A 규칙의 전체 13상태 탐색. 시간 초과 없음. [범위·공개 언어·증명](LEVELS.md) |
| 협동 충돌·상자·스택·위험 | PASS | `coop.test.cjs` 28개. 손으로 정한 결과, 배열 순서 교환, 독립 분기/반복/호출, 취소된 행동 진행, 전체 목표, 위험 우선 |
| 시간·저장 이전 | PASS | `storage.test.cjs` + `timing.test.cjs` 29개. 기존 코드/완료/해금 보존, 더 빠른 같은 노드 기록, 최초/도움/버전 분리, 겹친 시간 제외, 새로고침·재시도·완료 후 도움 불변 |
| 중간 기존 UI 플레이 | PASS | `early/browser-report.json` 15항목, 초반 1~3 실제 편집·실행, 데스크톱·320/390 터치, 손상/거부 저장 |
| 기존 트리 편집 | PASS | `early/tree/tree-report.json` 26항목. 가지·삽입·접기·키보드·터치·실행 |
| 기존 제한·이전 코드 | PASS | `early/budgets/budget-report.json` 21항목. 초과 코드 유지·부분 삭제·undo·reload·실제 승리 |
| 기존 대기·위험 UI | PASS | `early/hazards/hazard-report.json` 25항목. 시간표·속도·대기·표식·함수·다중지도 회귀 |
| 최종 새 기능 UI | PASS | `final-retest/cooperation-report.json` 57항목, 실제 클릭/탭 474회, 오류 0. 데스크톱 1440×900, 터치 320×740/390×844 각각 모든 새 지도에 빈 코드에서 UI 입력→실행→성공. 접근 권한만 fixture 사용 |
| 독립 정답 미열람 플레이 | PASS | [별도 보고](COOP_BLIND_PLAYTEST.md), `blind/`. 함수 도전·협동 도입·길 열기·배송 직접 풀이, 현재 10개 예시 조작. 전체 진도 시험과 구별 |
| 기존 전체 여정 UI | PASS | `final/progression/browser-report.json` 39항목, 오류 0. 데스크톱 새 저장에서 24레벨 순차 편집·실행·해금으로 최종 완료. 320/390 터치와 저장 오류·복구도 확인 |
| 다중지도 취소·안전·키보드 | PASS | `final/safety-final/safety-report.json` 13항목. UI로 작성한 함수, 지도 전환 대기 중 멈춤/초기화/다른 레벨, 안전 한도·음소거 |
| 실제 브라우저 숨김 | PASS | `visibility-raw-cdp-retest/visibility-report.json`. 실제 다른 탭 활성화로 `document.hidden` false→true→false, 숨김 1,200ms 제외·복귀 누적·도움말 중첩. 실제 클릭으로 코드 작성 후 성공 |
| 정적 경로·메뉴·기존 링크 | PASS | `final/deployment.json`: 게임 자산과 다른 HTML 59개, `/WebSim/` 접두 경로 |
| develop-web-game 기본 클라이언트 | PASS | `client-early/`, `client-final/` 캡처·읽기 전용 상태를 생성하고 이미지 확인. 실제 블록 입력·렌더 smoke이며 이 검사를 완료 플레이로 계산하지 않음 |
| 실제 Android / iOS | NOT RUN | 실제 기기 없음. 터치 에뮬레이션을 실제 기기로 분류하지 않음 |
| 사람의 재미·이해도 연구 | NOT RUN | 자동/에이전트 플레이를 인간 평가로 표현하지 않음 |

PR·main 병합·운영 배포의 커밋과 공개 사이트 검증 결과는 해당 PR의 게시 기록 및 최종 보고에 남긴다. 로컬 검증 결과와 운영 배포 결과를 구분한다.

## 관찰 → 수정 → 같은 장면 재검증

1. 규칙 예시를 보고 도움 기록이 되었지만 사전 설명이 없었다. 도움/예시 사용을 즉시 표시하고 도움말에도 명시했다. 독립 데스크톱·모바일 및 최종 UI 재생 PASS.
2. 튜토리얼에서 로봇/상자가 집·목적지 문자를 가렸다. 점유된 칸에도 별도의 바닥 표식 배지를 남겼다. 320/390 터치 재확인 PASS. 실제 지도도 목표 테두리를 점유물 뒤에 다시 그린다.
3. 빠른 실행 후 프로그램이 끝나면 구체적인 막힘 이유가 일반 종료 문구로 사라졌다. 마지막 물리 행동과 실패 이유를 로봇별 상태·최종 메시지에 보존했다. 같은 실패 프로그램·배열 교환·UI 재실행 PASS.
4. 새 기록 시작 시 도움 플래그만 지워지고 화면의 힌트가 남았다. 힌트 텍스트·단계·버튼도 함께 초기화했다. UI 회귀 PASS.
5. 일부 도전의 튜토리얼 키에 대응하는 규칙이 없어 상자 설명이 열렸다. 대기·조건·함수·협동 시간의 짧은 문맥별 예시를 연결했다. 현재 10개 규칙 모두 터치로 조작 PASS.
6. 완료 후 도움말을 열면 이미 끝난 도전의 도움 여부 표시가 바뀌었다. 완료한 tracker의 도움 여부를 고정했다. 단위 시험 및 독립 48–50번 장면, 최종 세 기기 폭 재검증 PASS.
7. 모바일에서 긴 설명과 지도 글로 읽기가 겹쳤다. 협동 화면의 해당 항목을 지도 아래 정상 흐름에 배치했다. 320/390 겹침 검사·스크린샷·독립 재확인 PASS. 협동 모바일은 편집을 가리지 않도록 지도/편집기를 스크롤하며 사용한다.
8. 저장 완료의 기존 `executed`에 새 턴 수가 들어갈 수 있었다. 기존 평가 명령 수와 새 물리 턴 수를 따로 저장하며 회귀 시험으로 구분했다. PASS.
9. 최종 증거 감사에서 finale 반례 시험이 명령 상한을 9→13으로 넓혔음을 발견했다. 공개 상한 그대로 유효한 9블록 대안으로 바꾸고 7턴의 위험 실패를 재확인했다. 게임 지도·규칙 변경 없이 필수성 집중 시험 18/18 PASS.

시험 환경에서 발견한 실패도 보존했다. 중간 협동 시험의 옛 문구 정규식, 트레이스 내보내기 스트림 오류, 기존 모바일 고정 지도를 가정한 assertion은 각각 수정/별도 분류 후 실제 조작 로그·PNG로 재실행했다. 기존 안전성 fixture가 `pagehide` 체크포인트에 덮이는 경우 다음 문서의 앱 시작 전에 한 번만 적용하도록 바꿨다. Playwright의 항상 포커스 모방으로 실제 숨김이 발생하지 않은 시도는 FAIL 증거로 보존하고, 독립 Chromium/raw CDP에서 실제 탭 활성화로 검증했다. 상태·시계·이벤트를 주입하지 않았다. 테스트 편의를 위해 게임의 저장이나 충돌 규칙을 약화하지 않았다.

## 확정 정책

[동시 턴 규칙](COOP-RULES.md), [활성 풀이 시간·저장 이전](TIMING_STORAGE.md), [레벨 감사·삽입 순서·필수성](LEVELS.md)에 명세를 남겼다. 기존 숫자 ID는 유지하고 표시 순서/해금은 별도 카탈로그로 관리한다. 새 기록은 지도/규칙 버전별이며 과거 시간 없는 완료에는 임의 시간을 만들지 않는다. 실패/위치 초기화는 활성 시간을 지우지 않는다. 단조 시계와 약 1초 체크포인트를 사용하며 비정상 종료·중단·저장 불가의 오차 한계는 시간 문서에 명시했다. 개인 기록은 서버 검증 경쟁 기록이 아니다.

## 재현

```powershell
$env:PORT='8124'
node tests/routine-bot-server.cjs
# 다른 터미널
$env:WEBSIM_URL='http://127.0.0.1:8124/WebSim/'
node --test routine_bot/*.test.cjs tests/routine-bot-server.test.cjs
node tests/routine-bot-cooperation.browser.cjs final
node tests/routine-bot.browser.cjs final
node tests/routine-bot-safety.browser.cjs
node tests/routine-bot-tree.browser.cjs
node tests/routine-bot-budgets.browser.cjs
node tests/routine-bot-hazards.browser.cjs
node tests/routine-bot-visibility.browser.cjs
node tests/routine-bot-deployment.cjs final
```

각 실행에 `WEBSIM_EVIDENCE`를 별도로 지정하면 과거 실패와 재검증 산출물을 덮어쓰지 않는다. 브라우저 트레이스 수집은 경쟁하지 않도록 순서대로 실행한다.
