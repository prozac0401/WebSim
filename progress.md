Original prompt: 다음 시뮬레이터를 만들어 보려고 해요. 기존 구조를 참고하여 추가 부탁드리며 내용은 아래 대화를 참고해 주세요.

## 2026-03-08 작업 로그
- `develop-web-game` 스킬 지침 확인.
- 루트 구조 및 기존 시뮬레이터 패턴 확인 (`시뮬레이터.html`, `*_doc.html`, `*.md`).
- 신규 구현 대상 확정: `weekend_recovery_simulator` (주말 회복 플래너형 시뮬레이터).
- `weekend_recovery_simulator` 본체 구현:
  - 토/일 타임라인 블록 배치(드래그/클릭 추가, 이동, 편집/복제/삭제)
  - 실시간 회복 곡선(Canvas), 4축 점수, 원인 배지, 3문장 해석
  - 추천안 3종(외출 몰기형/회복 버퍼형/수면 보호형) 미리보기/적용
  - `window.render_game_to_text`, `window.advanceTime` 노출
- 신규 문서 파일 추가: `weekend_recovery_simulator.md`, `weekend_recovery_simulator_doc.html`
- 목록 반영: 루트 `index.html`, `README.md`
- 테스트:
  - `python -m http.server 4173`로 로컬 서빙 후 Playwright 클라이언트 실행
    - `web_game_playwright_client.js` 사용, 스크린샷/상태 JSON 생성 확인
  - Playwright 직접 시나리오 테스트(샘플 로드 → 목표 변경 → 블록 추가 → 편집 → 추천안 미리보기/적용)
  - 콘솔 에러/페이지 에러 0건 확인
- 수정:
  - 한글 깨짐 방지를 위해 `weekend_recovery_simulator.html`에 `meta charset="UTF-8"` 추가

## 다음 에이전트 참고 TODO
- 블로그 임베드가 `HTML fragment`만 허용되는 환경이라면, 현재 full HTML 래퍼(`<!doctype ...>`)가 문제 없는지 최종 게시 환경에서 확인 필요
- 현재 자동 추천안은 규칙 기반(휴리스틱) 3종이므로, 필요 시 사용자 선호(예: 외출 최소/성취 우선) 기반 추천으로 고도화 가능

## 2026-03-08 추가 반영 (사용자 피드백)
- 시간대 제약 추가:
  - `밤늦게 폰 보기`: 22:00~24:00
  - `일찍 눕기`: 20:00~24:00
  - `브런치 약속`: 09:00~14:00
- 신규 블록 추가:
  - `가족과 함께 외식` (social)
  - `운전` (travel)
- 블록 길이 조절 개선:
  - 블록 상/하단 리사이즈 핸들(`.rz`) 드래그로 길이 증감 가능
  - 리사이즈 시 겹침/시간대 제약 동시 검증
- 워딩 개선:
  - `약속 편안함` → `심리 소모도`
  - 상단 점수 라벨 `회복도` → `현재 상태`
  - 추천안 카드의 `예상 회복도` → `예상 상태`
- 추가 기능:
  - `일정 사이 마진` 슬라이더(0~120분, 30분 단위) 추가
  - 배치/이동/복제/리사이즈 시 마진 규칙을 함께 검증
  - 마진 충돌 시 가능한 가장 가까운 시간으로 자동 이동 + 안내 메시지 노출
- 테스트 결과:
  - Playwright 자동 시나리오에서 제약/신규 블록/리사이즈 모두 통과
  - 콘솔/페이지 에러 0건
  - 검증 체크:
    - `late_screen` 오전 배치 차단 + 22시 이후 배치 허용
    - `early_sleep` 저녁 이전 배치 차단
    - `brunch` 점심 이후 배치 차단
    - `family_dining`, `driving` 이벤트 생성 확인
    - 리사이즈 핸들 드래그로 `family_dining` duration 증가 확인
