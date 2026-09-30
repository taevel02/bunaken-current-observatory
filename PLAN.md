# Bunaken Current Observatory 구현 계획

버전: 1.0  
작성일: 2026-09-27  
기준: [PRD.md](PRD.md) v1.1 · [AGENTS.md](AGENTS.md) · [SPEC.md](SPEC.md) v1.0  
상태: 계획 확정용 문서. 아래 구현 작업은 아직 완료되지 않았다.

## 1 문서 역할과 실행 원칙

PRD는 제품 목적과 범위, SPEC은 구현 계약, AGENTS는 개발 규칙, PLAN은 작업 순서와 완료 근거를 관리한다. 이 문서의 체크박스는 실제 구현·검증이 끝난 뒤에만 체크한다. 문서 작성 완료를 애플리케이션 구현 완료로 표시하지 않는다.

초기 제품은 관리자 한 명이 자체 비밀번호로 로그인하여 모바일에서 공개 관측을 기록하고, 누구나 한국어·영어 대시보드와 연구 문서를 읽는 서비스다. 공개 GitHub 저장소 하나의 main/data branch를 사용한다. 외부 OAuth, 비공개 저장소, 별도 서버 DB는 추가하지 않는다.

작업마다 관련 SPEC 절과 PRD acceptance ID를 연결한다. 신규 인프라·범위 변경·모델 정책 변경은 기록하고 문서 간 불일치를 먼저 해결한다. 테스트를 통과시키기 위해 실제 관측을 고치거나 합성 데이터를 운영 기록에 넣지 않는다.

## 2 단계와 의존성

| 단계 | 결과 | 선행 조건 | 완료 기준 |
|---|---|---|---|
| P0 | 계약과 저장소 뼈대 | 현재 문서 | 동일 fixture를 웹·엔진에서 검증 |
| P1 | 자체 인증과 공개 Git 저장 | P0 | 인증·중복·충돌·공개 필드 테스트 통과 |
| P2 | 모바일 관측과 ko/en 화면 | P1 | 실제 모바일에서 저장·실패 복구 완료 |
| P3 | 소스 adapter와 snapshot | P0, 쓰기 통합은 P1 | source provenance·보간·cutoff 검증 |
| P4 | cold-start 공개 대시보드 | P2, P3 | 자료가 없을 때도 정확한 상태 표시 |
| P5 | Analog와 날짜 단위 검증 | P3, P4 | numeric gate·누수 방지·baseline 비교 |
| P6 | 전문가용·일반인용 연구 발행 | P1, P4 | 네 원고의 버전·결과 일치 검증 |
| P7 | 운영 연결과 출시 | P1–P6 | 출시 검수·복구·운영 문서 완료 |

기능 개발과 관측 축적은 서로 다른 일정이다. 출시일까지 label이 부족해도 cold-start 상태로 서비스할 수 있다. 숫자 PCI나 높은 Support를 출시 조건으로 강제하지 않는다. 각 단계의 기간은 실제 데이터 접근성·구현 인력·테스트 결과를 확인한 뒤 추정한다.

## 3 P0 계약과 개발 기반

- [x] P0-01 공개 저장소 main/data branch 구성안을 설치 문서로 작성한다. 실제 저장소 생성은 구현 요청 범위에 포함될 때 수행한다. (`docs/setup.ko.md`)
- [x] P0-02 Next.js/TypeScript 웹, Python 엔진, JSON Schema 계약의 프로젝트 뼈대를 만든다. Node/pnpm/Python/uv 버전과 lockfile을 고정한다.
- [x] P0-03 `packages/contracts/json-schema`에 create request, observation revision, source sample, snapshot, prediction, release schema를 작성한다.
- [x] P0-04 실제 데이터와 구분되는 합성 fixture를 만들고 unknown/null/0, 1.0 초과 PCI, stale, 충돌 사례를 포함한다.
- [x] P0-05 WITA↔UTC 변환, WITA 날짜 경계, 단위·enum·revision 규약을 TS/Python 공통 fixture 테스트로 고정한다.
- [x] P0-06 ko/en 번역 키, `/`의 한국어 진입, 라우팅·오류 envelope를 구성한다.
- [x] P0-07 install/dev/lint/typecheck/test/build의 실제 명령을 README에 기록하고 기본 CI를 구성한다.

산출물: 실행 가능한 개발 환경, schema와 fixture, `.env.example`, 기본 CI. 9/19 기록은 스키마 검증용 합성 기록과 별도로 취급하고 의미 확인 전 학습 적격으로 표시하지 않는다.

완료 근거: 웹과 Python이 같은 JSON fixture를 같은 결과로 검증하고, 실제 credential 없이 CI가 실행된다. 관련 기준: DATA-01, DATA-02, I18N-01.

## 4 P1 자체 인증과 공개 Git 저장

- [x] P1-01 관리자 username, encoded password hash, enabled, auth version, session secret의 서버 설정 검증을 구현한다. (`6d77a84`)
- [x] P1-02 로컬 비밀번호 해시 생성 도구와 설정 안내를 만든다. 비밀번호·해시를 Git이나 로그에 남기지 않는다.
- [x] P1-03 로그인·로그아웃·CSRF 발급·세션 조회를 구현한다. 아이디 오류와 비밀번호 오류는 같은 메시지를 반환한다.
- [x] P1-04 관리자 페이지와 각 API에 세션·Origin·CSRF·canonical origin 검사를 적용한다. public API는 익명 열람을 유지한다.
- [x] P1-05 Vercel WAF 로그인 제한 설정을 문서화한다. 로컬 mock 검증과 실제 배포 규칙 검증을 구분한다.
- [x] P1-06 Git Data adapter를 구현한다. data branch의 head→tree→commit→non-force ref update를 처리한다.
- [x] P1-07 관측 revision/current pointer/멱등 ledger/audit를 한 commit으로 저장한다. ledger는 raw key 대신 HMAC digest를 사용한다.
- [x] P1-08 중복 요청, 같은 key의 다른 본문, 동일 revision 동시 수정, 다른 파일의 branch 경쟁, 성공 응답 유실을 검증한다.
- [x] P1-09 공개 allowlist schema를 첫 commit 전에 검사한다. 비공개 메모·인증 필드·임의 경로를 거부한다.
- [x] P1-10 PAT 만료·권한 부족·GitHub 장애를 상태별로 반환하고 입력 재시도 가능성을 보존한다.

산출물: 자체 인증, 저장 adapter, API integration test, 비밀번호 재설정·세션 철회 runbook. 실제 관리자 비밀번호나 토큰은 코드 산출물에 포함하지 않는다.

완료 근거: AUTH-01–05, SAVE-01–03, EXPORT-01, OPEN-01–02. 실제 네트워크를 사용하는 smoke test는 운영 데이터와 분리된 허용 테스트 경로에서 수행한다. 공개 데이터 정책 때문에 개인 정보로 테스트하지 않는다.

## 5 P2 모바일 관측과 다국어

- [x] P2-01 날짜·시각·Site·Zone/unknown·시작 수심·PCI·수직 방향을 한 열 폼으로 구현한다.
- [x] P2-02 숫자 직접 입력, 1.0 초과 입력, 기본값 확인, 44px 터치 영역과 키보드 대응을 구현한다.
- [x] P2-03 수온·대표 수심·Peak 사건·공개 메모를 선택 영역으로 추가한다. 모르는 값은 강제로 채우지 않는다.
- [x] P2-04 `공개 저장`과 공개 범위 안내를 제공한다. commit 성공 전에는 저장됨을 표시하지 않는다.
- [x] P2-05 클라이언트 UUID/key를 재시도 동안 유지하고 timeout 후 결과 조회를 구현한다.
- [x] P2-06 기기 임시저장 동의, 7일 보존, 인증 후 복원, 저장 후 정리, 로그아웃 삭제를 구현한다.
- [x] P2-07 세션 만료 시 원래 폼 탭을 유지한 별도 탭 재로그인을 지원한다. 임시저장 미동의 시 브라우저 종료 후 복원을 보장하지 않는다.
- [x] P2-08 기록 정정·철회와 revision 충돌 비교 UI를 구현한다. 철회가 Git 이력 삭제가 아님을 표시한다.
- [x] P2-09 ko/en의 필드명·오류·저장 상태·PCI 설명을 일치시킨다.

구현 완료 근거: MOB-01–03, I18N-01, SAVE-01–02, 자동 검증 및 production build 통과. 실기기 iOS Safari/Android Chrome와 60초 입력 시간 측정은 현 작업 환경에서 수행하지 못했으며 실제 모바일 배포 전 수동 acceptance로 남긴다. 관리자 목록은 현재 페이지마다 공개 Git의 observations tree 전체 ID를 열거한다. 큰 데이터에서 provider tree가 잘리면 502로 실패하며, 데이터 규모가 커지기 전에 prefix sharding 또는 원자 갱신 목록 인덱스로 교체해야 한다.

## 6 P3 환경 자료와 snapshot

- [x] P3-01 source registry를 작성한다. dataset/variable/depth/native resolution/갱신 주기/재배포 범위를 실제 metadata로 확정한다.
- [x] P3-02 Site/Zone의 확인된 좌표·수심·방향·격자 거리 기준을 등록한다. 미확정이면 unverified로 유지한다.
- [x] P3-03 FES, Copernicus, Open-Meteo adapter를 각각 구현하고 credential·요청 제한·retry 정책을 분리한다.
- [x] P3-04 바다 셀 선택, u/v 투영, 깊이·시간 보간, 필수 소스 결측·stale 처리를 검증한다.
- [ ] P3-05 실행 가능한 범위의 historical 환경 분포를 수집하고 scaler 생성 기간과 feature 비활성 사유를 기록한다.
- [ ] P3-06 snapshot manifest·feature·forecast를 immutable하게 저장한다. issued/retrieved/valid time과 실제 보존 시점을 분리한다.
- [ ] P3-07 WITA 20:00 cutoff의 D+1 seal을 구현한다. 늦은 job, 빈 후보, 재실행, 사후 backfill을 검증한다.
- [ ] P3-08 data branch push entrypoint와 main의 고정 commit reusable workflow를 연결한다. data를 실행 코드로 취급하지 않는다.

외부 데이터 연결이 막혀도 adapter contract·합성 fixture·결측 UI 개발은 진행한다. 실제 provider 연결이 안 된 테스트를 통과했다고 표시하지 않는다. 제공자 자료를 공개 보존할 권한이 없으면 다른 허용 자료를 검토하며 비공개 저장소를 임의로 도입하지 않는다.

완료 근거: MODEL-03, MODEL-05, SNAP-01–02, OPS-01. 실제 dataset ID와 좌표의 검증 evidence를 운영 문서에 남긴다.

P3-01/02 코드 완료 근거: `config/source-registry.json`, `config/geometry.json`, `engine/bunaken_engine/registry.py`, `docs/environment-sources.ko.md`. Python 3.14.7/uv에서 10개 테스트 통과. 19개 Site는 확인 evidence가 없으므로 null/unverified이며 Zone은 빈 목록이다. Copernicus 라이선스 원문 접근 실패로 공개 export를 차단했다. 실제 geometry·provider version·credential 확인은 운영 연결 의존이다. 관련 기준: MODEL-03, MODEL-05.

P3-03/04 구현 근거: `sources.py`의 공식 SDK/고정 모델 adapter와 `features.py`의 바다 셀·해저 수심·벡터·보간·구간 요약. core 20개/provider SDK-backed mock 2개 검증 통과. 실제 Copernicus catalogue에서 dataset version 202406과 50개 depth 좌표를 조회했다. 실제 현장 좌표·atlas·credential을 사용한 live 수집은 미실행. source age 또는 FES reference conformance가 확인되지 않으면 운영 적격으로 쓰지 않는다. P3-05의 scaler 생성 코드는 있으나 실제 historical 환경 분포 수집은 geometry·소스 권한 의존으로 미완료다.

## 7 P4 공개 대시보드와 cold start

- [ ] P4-01 WITA 내일 기본 날짜, D+1–D+7 화면, 오늘 선택을 구현한다.
- [ ] P4-02 조석 그래프·Site 비교표·모바일 카드를 구현한다. 단위·기준 수심·생성 시각을 노출한다.
- [ ] P4-03 PCI null과 reason code를 근거 부족/자료 누락/오래된 자료/범위 밖 상태로 번역한다.
- [ ] P4-04 anchor 환경이 없을 때 similarity를 생성하지 않는다. 복원 가능한 경우에도 미검증 유사성으로 표시한다.
- [ ] P4-05 오전/오후 중앙값·가용 슬롯 비율·예측 곡선 최대의 의미를 구현한다.
- [ ] P4-06 공개 관측·Site 상세·PCI 기준·방법론·status 페이지를 ko/en으로 만든다.
- [ ] P4-07 release 파일 검증 후 latest manifest를 교체하고 CDN이 같은 release만 읽도록 한다.

완료 근거: PUB-01, DATA-01–02, MODEL-01, MODEL-03–04, I18N-01. 색으로 안전 판정을 하지 않고 모든 핵심 상태를 텍스트로 설명한다.

## 8 P5 Analog와 검증

- [ ] P5-01 overall/peak/legacy label scope, observer/rubric, use_for_model, 최신 유효 revision의 적격 필터를 구현한다.
- [ ] P5-02 같은 목표 mask, 환경 거리, Site·quality·provenance 가중치와 결정적인 이웃 정렬을 구현한다.
- [ ] P5-03 numeric gate와 N_eff/N_eff_days, 같은 Site/Zone 날짜 수를 계산한다.
- [ ] P5-04 support 단계는 표본 조건과 검증 조건을 함께 검사한다. 검증 기준 미설정 시 Medium/High를 승격하지 않는다.
- [ ] P5-05 별도 적격 수직 관측 집합에서 evidence를 계산한다. unknown 제외와 none 구분을 검증한다.
- [ ] P5-06 날짜별 전진 검증과 진단용 LODO를 분리한다. scaler·bias·튜닝을 training 범위 안에 둔다.
- [ ] P5-07 전체/Site median baseline, MAE·큰 오차·제공률·abstention을 같은 test 조건에서 보고한다.
- [ ] P5-08 모델·scaler·feature·geometry·dataset manifest를 고정하여 재현 가능한 실행을 만든다.

완료 근거: MODEL-01–05, VAL-01, SNAP-01–02. 합성 데이터에서 알고리즘이 정상 동작하는 것과 실제 예측력이 입증된 것은 구분한다. 초기 label이 부족하면 실제 공개 출력은 계속 null이어야 한다.

## 9 P6 연구 발행

- [ ] P6-01 공개 Markdown 원고와 metadata의 draft/in_review/ready/published 상태를 구현한다.
- [ ] P6-02 technical.ko/en, guide.ko/en을 같은 release에 연결한다.
- [ ] P6-03 단일 results.json과 manifest로 숫자·차트·표를 연결하고 네 원고 간 hash/version 불일치를 검사한다.
- [ ] P6-04 안전한 Markdown 미리보기, 발행 버튼, 이전 버전, 정정 이유를 구현한다.
- [ ] P6-05 첫 방법론 보고서는 데이터 부족과 미검증 상태를 명시한다. 존재하지 않는 성능·DOI·심사 이력을 생성하지 않는다.
- [ ] P6-06 홈페이지에는 published만 노출하되 저장소 draft가 공개라는 사실을 편집 화면에 표시한다.

완료 근거: RES-01–02, OPEN-03. 논문 작성·외부 학술지 제출은 별도 콘텐츠 작업이며 이 계획으로 자동 제출하지 않는다.

## 10 P7 운영 연결과 출시

- [ ] P7-01 production 환경변수·PAT·소스 자격증명을 설정하고 외부 PR/preview 격리를 검증한다.
- [ ] P7-02 main 보호, data non-force 쓰기, workflow 권한, 고정 commit 참조를 확인한다.
- [ ] P7-03 production의 로그인 WAF 규칙, canonical origin, 구버전 deployment 차단을 실제 요청으로 확인한다.
- [ ] P7-04 수집 07:17/19:17, seal 20:17 WITA를 연결하고 지연·누락 상태를 확인한다.
- [ ] P7-05 웹 PAT commit 후 작업이 이어지고 GITHUB_TOKEN 후속 commit에 무한 실행 또는 작업 누락이 없는지 확인한다.
- [ ] P7-06 Git bundle로 관측·snapshot·seal·manifest 복원을 검증한다.
- [ ] P7-07 저장 p95·홈페이지 반영 지연·모바일 LCP·source age·사용량을 측정한다. 목표와 실제를 나란히 기록한다.
- [ ] P7-08 출처·데이터 이용 조건·한국어/영어 안내·cold-start 상태를 최종 검수한다.
- [ ] P7-09 현재 작업에서 승인된 범위에 따라 배포·공개를 수행하고 버전·일시·검증 근거를 남긴다.

완료 근거: PRD 전체 acceptance matrix. 운영 연결 전에는 fixture 기반 preview로 검토 가능하게 만들며 사용자에게 빈 화면이나 계획만을 승인 대상으로 제시하지 않는다.

## 11 설정 의존성과 차단 범위

| 미확정 항목 | 차단되는 작업 | 계속 가능한 작업 |
|---|---|---|
| 관리자 hash/session key | 실제 로그인 | 인증 코드와 mock 테스트 |
| 저장소/PAT | 실제 Git 저장 | adapter·충돌 시뮬레이션 |
| 소스 계정/dataset/license | 실제 자료 수집·공개 보존 | adapter schema·missing UI |
| Site geometry | 해당 Site numeric 예측 | unverified 표시·기록 저장 |
| 9/19 label 의미 | anchor의 numeric training | 원래 기록·rubric 보존 |
| 검증 오차 허용기준 | High support | Low 또는 cold-start 운영 |
| 실제 데이터 수 | 성능 주장·모델 승격 | 제품 개발·기록·방법론 발행 |

이 목록은 지금 사용자에게 전부 질문하라는 뜻이 아니다. 작업 가능한 부분을 먼저 완성하고 특정 단계에서 필요한 정확한 설정만 요청한다.

## 12 작업 기록과 변경 관리

각 작업의 상태는 `todo / in_progress / blocked / done`으로 기록한다. blocked에는 원인과 계속 가능한 작업을 남긴다. done에는 commit, 실행한 검증, 관련 acceptance ID를 기록한다. 실제 작업이 시작되기 전에는 아래 템플릿을 가상 진행 이력으로 채우지 않는다.

| 항목 | 기록 형식 |
|---|---|
| 작업 | P번호와 작업 ID |
| 변경 | 사용자에게 달라진 동작 |
| 구현 근거 | 관련 파일과 commit |
| 검증 | 명령·환경·결과·acceptance ID |
| 제한 | 미실행 검증 또는 외부 설정 의존 |
| 다음 단계 | 의존성이 해소된 후속 작업 |
