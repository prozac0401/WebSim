# 주말 계획표 시즌2 검증 기록

## 2026-10-17 인구·소득 근거와 인물·집 다양화

새 인생에 공개 집계 자료를 연결하고, 출처와 게임 가정을 구분했습니다. 상세 설명은 시작 화면의 **이 삶은 어떻게 뽑혔나요?**와 [자료 설명](weekend_season2_doc.html#life-sources)에 있습니다. 이전 저장은 새 통계를 소급 적용하지 않고 복원합니다.

| 검사 | 결과 | 직접 확인한 범위 |
| --- | --- | --- |
| 시즌2 자동시험 | **PASS 111 / FAIL 0** | 기존 85개 + 인구·이름 6, 소득 8, 생성·저장 6, 그림 6 |
| 기존 관련 회귀 | **PASS 67 / FAIL 0** | 기존 플래너 관련·잉크·Boids·차량 검사 |
| 최종 통합 Node | **PASS 178 / FAIL 0** | 아래 명령으로 최종 로직 재검사 |
| 실제 Chromium 통합 | **PASS 15개 검사 묶음 / FAIL 0** | 기존 수동·자동 365일, 저장, 모바일, 키보드, 동작 줄이기 + 새 인생 다양화 |
| 최종 문구 수정 후 부분 브라우저 검사 | **PASS 2개 묶음 / FAIL 0** | 16회 새 인생, 지역 선택·직접 수입·v3 저장·오류 없음 |
| 원본 develop-web-game 클라이언트 | **PASS** | 최종 화면 시작·장면 훅·스크린샷 직접 확인 |
| 인구 비례 추출 | **PASS** | 100,000개 결정적 시드에서 17시도 및 수도권 비중 확인 |
| 공식 소득 표 대조 | **PASS 285셀 일치** | 전국·기타·17시도 × 15구간의 원표 캡처와 모듈값을 독립 대조; 행·열 합계 확인 |
| 독립 극값 완주 | **PASS 8개 시드** | 매우 낮은 소득·상단 구간에서 365일, 7월 저장 복원, 장부·연말 저장 검증 |
| 실제 이전 공개 v2 저장 | **PASS** | JSON 가져오기·1월 11일 회고 복구; 이전 소스와 새 소스의 동일 저장 장면 Canvas 픽셀 일치 |
| 독립 UI 검토 | **PASS** | 390×844 시작·자동 버튼 노출, 상세 입력 초점·스크롤 유지, 소수 금액, 오류 0 |
| Firefox·Safari·실물 Android/iOS·스크린리더 | **NOT RUN** | Chromium 에뮬레이션과 구분 |
| 사람의 재미·균형·저사양 성능 | **NOT RUN** | 자동 완주를 해당 평가로 해석하지 않음 |
| 이번 수정의 공개 배포 후 검사 | **NOT RUN (커밋 시점)** | 배포 후 별도 산출물 및 최종 응답에 결과 기록 |

```powershell
node --test weekend_season2/*.test.cjs tests/new-labs.test.cjs tests/preset-scenes.test.cjs ink_time_machine/ink-flow-engine.test.cjs boids_simulation/boids-app.test.cjs evolving_vehicles_2/continuous-race.test.cjs evolving_vehicles_2/racing-guidance.test.cjs
$env:WEBSIM_URL = 'http://127.0.0.1:8766/'
$env:WEBSIM_EVIDENCE = 'output/playwright/weekend-season2-diversity'
node tests/weekend-season2.browser.cjs
```

### 적용 자료와 가정

- 주민등록인구: 행정안전부 2024-12-31 스냅샷, 17시도 합계 51,217,221명. 서울·인천·경기 합계 26,047,523명(약 50.86%). 모든 연령·거주불명자·재외국민 포함, 외국인 제외. 수도권은 별도 중복 추출 항목이 아닙니다.
- 소득: 국세청/KOSIS `DT_133N_427`, 2024년 귀속 주소지별 연간 총급여 구간 인원. 전국 21,078,535명 중 주소지 기타 5,009명을 제외한 17시도 자료를 사용합니다. 과세미달·외국인·중도입퇴사 포함이며 합산하지 않은 이중근로는 중복 가능성이 있습니다. 현재 월 실수령액이나 모든 주민의 소득 자료가 아닙니다.
- 닫힌 급여 구간의 12개월 환산 정수 범위 내 균등 추출, 연10억원초과의 게임 대표 월1억원은 명시한 가정입니다. 구직자·대학원생·돌봄 역할 지원비는 기준액의30%·50%·65%인 가상 모델입니다. 기본 화면에서 **월 환산 급여 / 월 생활비 / 직접 설정한 월 수입**을 구분합니다.
- 이름 140개는 실제 공개 집계·보도에서 확인한 부분 목록의 합집합이며 균등 추출합니다. 2차 출처라는 한계를 명시하고 확인하지 못한 빈도를 만들지 않았습니다. 성씨 20개는 2015 한자별 상위 항목 안에서만 인구 비례로 추출합니다. 이름·성씨 조합은 실존 개인의 프로필을 뜻하지 않습니다.
- 얼굴형 5, 머리 10, 머리색 5, 피부색 4, 의상 6과 집색 6, 배치 3, 장식 4, 창밖 4를 조합합니다. 창작 외모·가족·생활비 설정이며 전체 생성 인생이 한국인의 대표 표본이라는 주장은 하지 않습니다.

### 독립 검토와 수정

취업 사건 뒤 최초 지원비 근거를 현재 수입처럼 표시하던 문제를 수정했습니다. 원래 추첨 시도·금액을 보존하고 이후 수입 변경을 알려 줍니다. 잘못된 출처·구간·지원비 비율·구간 밖 금액·삽화 enum은 저장 검증에서 거절합니다. 지역만 해제한 사용자에게 수입을 직접 수정했다고 표시하던 문구도 고쳤습니다. 마지막 문구 변경 후 부분 브라우저와 원본 게임 클라이언트를 재실행했습니다.

독립 검토자는 소득 극값 시드 `5828/6920/445/6973/9458/13702/1763/1859`의 완주와 취업 후 수입 변경을 재현했고, 다른 검토자는 실제 모바일 입력·스크롤·초점과 이전 저장 장면의 정확한 픽셀 일치를 확인했습니다. 최종 확인 범위의 진행 차단 문제는 남지 않았습니다.

### 파일과 화면

추가: `demographics.js`, `income-data.js` 및 각각의 시험, `life-distribution.test.cjs`. 수정: 시즌2 `data.js`, `engine.js`, `storage.js`, `scene.js`, `app.js`, `index.html`, 관련 시험·문서와 `tests/weekend-season2.browser.cjs`. 기존 플래너·잉크·Boids·차량 구현, 루트 `progress.md`, 원본 체크아웃은 수정하지 않았습니다. 계정·Secret·호스팅 설정은 그대로입니다.

- [얼굴·머리 비교](../output/playwright/weekend-season2/visual-variety-faces.png), [집 구조·색상 비교](../output/playwright/weekend-season2/visual-variety-rooms.png)
- [최종 모바일 시작](../output/playwright/weekend-season2-diversity/label-check/diverse-first-life-mobile.png), [새 가족의 플레이](../output/playwright/weekend-season2-diversity/diverse-family-mobile.png)
- [전체 브라우저 결과](../output/playwright/weekend-season2-diversity/result.json), [공식 표 대조 기록](../output/playwright/income-research/source-verification.json)

화면·원표 캡처·검사 저장은 Git에서 제외되는 로컬 자료입니다. 공개 배포 후 검사 산출물은 `output/playwright/weekend-season2-diversity-deployed/`에 보관합니다. 아래는 이전 업데이트의 역사적 검증 기록입니다.

---

## 2026-10-17 간소화·자동진행·가족 업데이트

이번 업데이트의 기본 흐름은 **자동 배정된 가상 인생 → 이 삶으로 시작 → 자동진행 → 중요한 사건에서 직접 선택 → 연말 회고**입니다. 환경 설정, 세부 일정, 장부, 전체 기록은 접힌 영역에 남겨 두었습니다. 모바일에서는 자동진행·일시정지가 하단에 고정됩니다.

| 검사 | 결과 | 확인한 범위 |
| --- | --- | --- |
| 시즌2 자동시험 | **PASS 85 / FAIL 0** | 기존 60개, 인생 배정·자동일정·가족·저장 이전 19개, 삽화 6개 |
| 기존 관련 회귀 | **PASS 67 / FAIL 0** | 기존 플래너 관련·잉크·Boids 39개, 차량 28개 |
| 최종 Node 합계 | **PASS 152 / FAIL 0** | 아래 통합 명령을 수정 후 실행 |
| 실제 Chromium 통합 | **PASS 14개 검사 묶음 / FAIL 0** | 기존 11개 흐름과 자동 인생·짧은 모바일 화면·자동 365일 완주 |
| 원본 develop-web-game 클라이언트 | **PASS** | 최종 자산 URL로 시작·장면 훅·화면 확인 |
| 기존 공개 버전 저장 복원 | **PASS** | 실제 v1 파일의 장부·난수·과거 로그 유지, v2 전환, 자동진행은 정지 상태로 복원 |
| 독립 검토 | **PASS, 발견 문제 수정 후 재검사** | 다른 담당자가 자동일정 예산 보존·돌봄 분담·사건 뒤 진행 충돌 재현 |
| Firefox·Safari·실물 모바일·스크린리더 | **NOT RUN** | Chromium의 390×844 터치·키보드·동작 줄이기 검사를 대체하지 않음 |
| 사람의 재미·장기 균형·저사양 성능 평가 | **NOT RUN** | 자동 완주를 이 항목의 검증으로 해석하지 않음 |
| 이번 업데이트 공개 배포 검사 | **NOT RUN (이 기록을 커밋하는 시점)** | 배포 후 같은 14개 브라우저 검사를 실행하고 별도 로컬 산출물과 최종 보고에 기록 |

```powershell
node --test weekend_season2/*.test.cjs tests/new-labs.test.cjs tests/preset-scenes.test.cjs ink_time_machine/ink-flow-engine.test.cjs boids_simulation/boids-app.test.cjs evolving_vehicles_2/continuous-race.test.cjs evolving_vehicles_2/racing-guidance.test.cjs
$env:WEBSIM_URL = 'http://127.0.0.1:8766/'
$env:WEBSIM_EVIDENCE = 'output/playwright/weekend-season2-refresh'
node tests/weekend-season2.browser.cjs
```

- 생활 역할 4종 × 혼인 상태 2종 × 자녀 유무 2종의 16개 조합을 시드로 배정하며, 이 조합들의 연간 진행을 자동시험했습니다. 성별과 혼인 상태만으로 수입·숙련·돌봄 분담을 바꾸지 않습니다.
- 자동일정은 균형·취미·휴식의 세 방향을 제공하고, 이미 직접 배치한 일정과 예산을 보존합니다. 사건·충돌·확인이 필요한 반복 예약에서는 멈춥니다. 실제 모바일 UI에서 사건 버튼만 선택하며 365일 자동 완주했고, 실제 활동 기록 30개 초과를 확인했습니다.
- 여성·남성·그 밖의 성별·미지정의 그림, 배우자 유무, 자녀 0~6명과 연령대가 장면에 반영됩니다. 모바일에서 성별·배우자·자녀 설정 전후 픽셀이 달라지는지 검사했습니다. 모든 지원 활동의 가족 좌표와 경계도 검사했습니다.
- 기혼·미혼 및 자녀 유무에 따른 최초 장면 4개와 후속 장면 2개를 추가하여 사건은 총 29종입니다. 가족 시간·각자 시간·돌봄 분담 선택이 이후 시간과 관계 기록에 반영됩니다.
- 모든 돈 표시는 만원 단위입니다. 180.05만원 입력이 내부 1,800,500원으로 유지됨을 실제 브라우저에서 확인했습니다. 내부 장부는 정수 원화를 유지합니다.
- 같은 390px 폭에서 기존 배치 화면 캡처는 3,051px, 새 기본 시작 화면은 980px, 새 기본 플레이 화면은 1,069px였습니다. 서로 다른 예시 상태의 전체 화면 높이이며 모든 플레이 상황의 고정 높이나 성능 측정은 아닙니다.
- 이전 v1 저장의 혼인 상태는 미지정으로 이전합니다. 기존 로그에 배우자를 새로 만들어 넣지 않으며, 새 게임에서는 혼인 상태를 배정합니다. 기존 공개 소스에서 만든 23종 사건 대기 저장을 이전했고, 두 대표 환경의 연말 장부·난수·상태·결과물이 이전 전후 같음을 독립 확인했습니다.
- 독립 검토에서 발견한 유료 자동 활동이 수동 일정 예산을 먼저 쓰는 문제, 큰 돌봄 부담에서 분담 효과가 사라지는 문제, 사건 뒤 같은 주 자동진행이 멈추는 문제를 수정하고 재현 시험 및 전체 브라우저 검사를 통과했습니다.

화면과 결과: [모바일 시작](../output/playwright/weekend-season2-refresh/compact-default-mobile.png), [모바일 플레이](../output/playwright/weekend-season2-refresh/compact-play-mobile.png), [자동 연말 회고](../output/playwright/weekend-season2-refresh/automatic-year-mobile.png), [14개 검사 결과](../output/playwright/weekend-season2-refresh/result.json). 공개 배포 후 산출물은 `output/playwright/weekend-season2-refresh-deployed/`에 따로 보관합니다. 모두 Git에서 제외되는 로컬 자료입니다.

수정 파일은 시즌2의 `app.js`, `style.css`, `index.html`, `scene.js`, `data.js`, `events.js`, `engine.js`, `storage.js`, 관련 문서·시험과 홈의 시즌2 소개 문구입니다. `life-family.test.cjs`, `scene-family.test.cjs`를 추가하고 `tests/weekend-season2.browser.cjs`를 확장했습니다. 기존 플래너·잉크·Boids·차량 구현과 루트 `progress.md`는 수정하지 않았습니다.

아래는 최초 구현 및 첫 배포 준비 시점의 기록입니다.

---

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
