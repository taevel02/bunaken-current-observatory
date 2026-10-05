# Bunaken Current Observatory 구현 계획

버전: 1.9\
작성일: 2026-10-05\
기준: [PRD.md](PRD.md) v1.9 · [AGENTS.md](AGENTS.md) · [SPEC.md](SPEC.md) v2.1\
상태: P0–P5와 P6 발행 기반 코드 구현 완료. 첫 원고 작성·검토·웹 발행, 실제 운영 연결과 외부 검수는 남아 있다.

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

### 2.1 남은 작업과 추천 순서 (2026-10-05)

P0–P5의 완료 표시는 코드·계약 검증 완료를 뜻한다. P6는 미구현이며 P7은 운영 설정·실제 실행 검증이 남아 있다. 아래 순서는 관측을 저장하면 환경을 결합하고 Analog를 다시 계산해 홈페이지까지 갱신하는 목표를 우선한다. P7의 수집·자동화 연결 일부를 P6보다 먼저 진행하고, P7 전체 출시 완료는 P6 이후에 판단한다.

2026-10-05 실제 검증: Copernicus 19 Site 배치 수집 성공, FES 독립 참조 비교 912건 통과, 9/29–10/4 환경 backfill 28,101 sample 확보. 사용자 승인 대표 관측 수심 18m 정정은 원격 data head `43be7a66d8ba0fe9aef9789bac582472a7f4c46b`에서 현재 기록 18개·이력 36개·원본 필드 보존을 확인했다. 환경 결합은 현재 후보 18개, numeric Overall 18개(서로 다른 7일)다. scaler 2,128행은 겹치는 환경 구간이며 현장 관측 2,128건이 아니다. 실제 학습 결합 결과와 운영 자동화 상태는 구분한다.

초기 v1.1 통합 검증 결과: 304개 슬롯의 숫자 제공은 0개였다. forward와 LODO 모두 실제 관측 18개에서 제공 0/18·MAE null이다. 과거 날짜 cutoff 이전에는 이번 정정 revision과 backfill이 없어 forward 학습 후보가 0개이며, LODO는 미래 날짜를 포함하는 진단이다. 어느 결과도 D+1 운영 성능으로 표시하지 않는다. 산출물은 `.local/p3-integration-2026-10-05/`에만 생성했으며 data branch·홈페이지에 발행하지 않았다.

### 최신 18m 후속 검증

`weighted-analog-v1.3` / `site-18m-v2`로 2026-10-06의 304개 슬롯을 재계산했다. 10개 Site의 160개 슬롯에 PCI 0.283–0.448을 제공하며, 9개 Site의 144개 슬롯은 같은 Site 관측이 없어 `missing_same_site`로 남는다. 모든 숫자는 `experimental / very_low`이며 전체 feature coverage는 0.833333이다. σ 1.0·유사도 0.2·coverage 0.8·3개 label·3일·N_eff 2·같은 Site gate는 유지했다.

같은 Site 관측이 필요한 곳: Lekuan 1, Johnson’s Wall, Tengah, Raymond’s Point, Mike’s Point, Tanjung Parigi, Bunaken Timur 1, Bunaken Timur 2, Pangalisang. Site 하나의 label만으로 모든 gate 통과를 보장하지 않으며 실제 추가 관측을 사용한다.

고정 18m 비교는 동일 수심의 조류 벡터·속력과 모델 수온을 사용한다. 미정의 조석 phase·고정 수심·10–30m profile 차이는 해당 거리 범위에서 제외하되 실제 원자료와 환경 표시는 보존한다. 다른 수심으로 확장할 때 재검증한다. 이전 v1.1/v1.2 설정과 계산 분기는 immutable 결과 재현을 위해 보존했다.

바람·파고는 공식 공급 갱신 metadata를 검증해 다시 수집했다. Copernicus 모델 수온은 실제 공급 갱신이 오래되어 제외했고 사용자 확인 28°C로 대신하지 않았다. 사용자 승인 기존 18개 관측의 수온 28°C는 revision 3에 반영했다. 원격 data head `fc4e136ecc23101db9cbe7e3866fbb22c687d6e9`에서 현재 18개·전체 이력 54개·다른 필드 보존을 확인했다. 신규 실측 수온은 모델의 필수 입력이 아니므로 선택 입력을 유지한다. 과거 환경은 6일+9/19의 실제 39,862 sample을 사용했다.

격자는 공급 모델의 대표 계산 셀이다. Site 입수 좌표와 공급 셀 중심이 다를 수 있고 여러 Site가 같은 셀을 공유한다. 실제 Copernicus 공급 셀 거리는 2.603–5.343km로 사용자 지정 6km 이내이며, 18m는 유효한 양쪽 수심 15.810/18.496m 사이 보간이다. 현장 실측 유속이나 Site별 미세 흐름 해상도로 해석하지 않는다.

최종 snapshot과 release를 동일 입력으로 재생성하여 전체 파일 바이트 일치를 확인했다. 실제 생성 패키지에 production 웹 reader를 적용한 통합 테스트 1개와 엔진 86개·웹 47개 테스트, lint/typecheck가 통과했다. 패키지는 압축 121,067byte·해제 6,053,075byte로 두 크기 제한 이내다. 한국어 문장부호 검사는 규칙 미지원으로 skipped이며 통과로 계산하지 않는다.

v1.3 날짜 검증: forward는 18개 중 제공 0개·MAE null이다. 과거 cutoff 이전에는 이번 정정 revision과 backfill이 없어 학습 후보·scaler가 0개다. LODO는 18개 중 15개·6일에 제공하며 MAE 0.09832, 동일 제공 표본의 전체 baseline MAE 0.12000·Site baseline MAE 0.12133이다. 3개는 abstention이다. 날짜별 test/training ID 분리·forward 미래 배제·LODO held-out 날짜 배제를 확인했다. LODO에는 미래 날짜 학습이 포함되므로 운영 예측력이나 D+1 성능으로 보고하지 않는다.

최종 산출물은 `.local/pci-repair-2026-10-05/final/`에 보관한다. 로컬 생성과 원격 발행·홈페이지 반영·공식 D+1 seal을 구분한다.

### 수온 공급 갱신 확인 (2026-10-05 19:37 WITA)

`cmems_mod_glo_phy-thetao_anfc_0.083deg_PT6H-i` / `202406`의 공식 default part 갱신 시각은 `2026-10-05T08:59:38.518Z`다. 약 2.6시간 경과로 기존 36시간 freshness 조건을 통과했다. 이전 제외 원인은 당시 선택된 default part의 공급 갱신 시각이 36시간을 초과했기 때문이다. dataset 선택·보간·freshness 코드 변경 없이 최신 공급 시각의 회복을 확인했다. catalogue 재조회에서 currents·salinity의 당일 갱신도 확인했다.

기존 adapter로 2026-10-06 WITA 대상 수온을 19 Site에서 재수집했다. 342개 표본 중 18m의 114개 값이 모두 유효하며 모델 수온은 29.056–29.595°C다. 실제 바다 셀 거리 2.603–5.343km, 원 수심 15.810/18.496m 사이 보간 조건을 충족했다. 19 Site·16개 시작 시각의 304개 예측 구간 모두 모델 수온 feature를 추출했다. 관측의 사용자 확인 28°C는 변경하거나 미래 모델 수온에 대입하지 않았다.

342개 source sample schema, 36시간 정확 경계, 초과 stale·미래 공급 시각·unknown 거부를 확인했고 기존 adapter 테스트 5개가 통과했다. 이전 immutable snapshot의 오래된 수온은 여전히 stale로 판정된다. 검증 자료는 `.local/copernicus-temperature-2026-10-05/`의 `catalogue-status.json`, `samples.json`, `verification.json`, `checks.json`에 보관한다. 재수집 시각과 공급 갱신 시각은 구분하며 개별 issued_at은 unknown으로 유지한다.

이번 단계는 수온 공급 적격·feature 연결 확인이다. 신규 전체 PCI snapshot·release 생성, 원격 발행·홈페이지 갱신은 수행하지 않았다. 위 160개 PCI 결과는 앞선 snapshot의 결과이며 신규 수온 반영 후 숫자로 재표기하지 않는다. 다음 수집은 실제 실행 시점의 freshness를 다시 검사해야 한다.

| 추천 순서 | 관련 항목 | 남은 작업·현재 상태 | 담당 | 완료 기준 |
|---|---|---|---|---|
| 완료 | P3 후속 | FES 60일 조석 파생값 생성·hash 고정·재사용 adapter와 hosted 원 atlas 다운로드 제거 | Codex | 실제 값 대조, 기간·좌표·코드·변조 거부. data 파생 자료 등록·원격 재조회 통과. 실제 hosted 실행은 별도 확인 |
| 완료 | 연구 근거 | 2026-10-05 로컬 결과와 config·검증을 docs/research/evidence-2026-10-05에 고정 | Codex | 파일 hash·18개/7일·304슬롯·forward/LODO 구분, 당시 수온 stale와 이후 회복을 혼합하지 않음 |
| 완료 | P6-01/02/03/04/06 기반 | 네 원고·상태·results/manifest·안전 미리보기·불변 발행·정정·철회 안내 구현 | Codex | 계약·저장 경쟁·멱등·unsafe 원고·결과표·공개 reader·ko/en 검증. 실제 원고/웹 발행은 다음 작업 |
| 1 | P6-05 콘텐츠 | 고정 근거로 전문가용·일반용 한국어 보고서 작성, 현장 검토 후 영어판 작성 | Astra + 사용자 | 네 원고의 cutoff·version·핵심 수치·한계 일치. 자체 발행·동료심사 미실시 표기 |
| 병행 2 | P7-01/02/04/05 | GitHub 보호 환경·Secrets·branch 보호·최신 trusted entrypoint·역사 환경 연결·실제 자동 수집/seal 검수 | Codex | 07:17/19:17 수집, 20:17 seal, 전날20:00 실제 저장 cutoff. 원격 .env 자동 전달 가정 금지 |
| 3 | P6 발행·연구 상세 UI | 원고 검토·발행, 상단 메뉴 단순화·두 문서 중심 연구 상세 최종 구성 | Codex + 사용자 | 기존 /pci·/observations 유지, 독자별 보고서·이전 버전·언어/모바일/인쇄 검수 |
| 4 | P5 전향 검증 | 최소 한 달 실제 사전 예측과 현장 PCI 비교, 주간 결측·baseline·제공률·오차 점검 | 사용자 + 자동 처리 | 미래 누수·사후 backfill 제외. 실제 관측일/Site coverage와 미제공 사례 포함 |
| 5 | P7-03/06/07/08/09 | production WAF·세션 철회·복구·성능·출처 검수와 최종 출시, 결과 보고서 개정 | Codex + 사용자 + Astra | 실제 운영 acceptance·새 연구 version·검증 근거·권한 범위·복구 절차 기록 |

로컬 수집·환경 결합·Analog 재계산·패키지 통합은 완료했다. 수온 공급 확인까지 완료했다. 다음은 고정 근거로 원고 작성과 GitHub 자동 운영 연결을 병행한다. 새 서비스·DB·필수 API 키를 추가하지 않는다. Open-Meteo 비상업 이용에 API 키를 필수로 요구하지 않는다. 외부 장애는 결측/null 상태로 남기고 이전 immutable snapshot을 보존한다. 원격 단계는 non-force commit과 새 release로 기록하며 과거 snapshot·관측 이력을 재작성하지 않는다.

사용자가 확정한 입수 좌표·Site 18m·6km·지도 기본축은 다시 미확정 설정으로 분류하지 않는다. 근사축은 reference_geometry로 유지하고 numeric 출력은 experimental/very_low로 제한한다. Zone 위치 특정·GPS·실측 벽 방향·검증 오차 허용기준은 사용자 현장 검토 후 확장한다. Zone/GPS와 높은 Support는 Site 수준 cold-start 운영을 차단하지 않는다. 대표 관측 수심은 필수이며 사용자 지정 신규 기본값 18m를 확인·수정한다. 기존 null 관측도 2026-10-05 명시 승인에 따라 개별 18m 정정 revision을 저장했다. 실측 평균 수심으로 단정하거나 앞으로의 미확인 과거 기록을 자동 보충하지 않는다.

### Actions/FES 운영 연결 구현 (2026-10-05)

[운영 설치 절차](docs/actions-operations.ko.md)에 환경 Secret/variable, 고정 SHA, branch 보호, 최초 실행·복구 조건을 기록했다. 예약은 UTC 23:17/11:17 수집·12:17 seal이며 cutoff는 기존 WITA 20:00이다. FES 원본은 비공개 로컬에서 검증한다. 일반 hosted runner는 코드 hash에 고정된 조석 파생값만 읽고 실제 forecast 수집을 진행한다. 일반 저장 PAT의 권한은 확대하지 않는다. 로컬 engine 86개·provider 12개·actionlint 검증을 통과했으며 FES 증거는 현재 코드에 맞춰 재생성했다. 원격 환경/Secrets·branch 보호·entrypoint 설치·실제 Actions 실행은 아직 완료 조건을 충족하지 않았다.

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

- [x] P2-01 WITA 날짜·입수/출수 시각·Site·Overall PCI와 실제 대표 관측 수심을 모바일 폼으로 구현한다. 날짜 기본값과 출수 50분 제안은 실제 입력 확인 후 저장한다.
- [x] P2-02 숫자 직접 입력, 1.0 초과 입력, 기본값 확인, 44px 터치 영역과 키보드 대응을 구현한다.
- [x] P2-03 수온·수직 관측·공개 메모를 선택 영역으로 제공한다. 신규 Peak·Zone·경로 입력은 제외하며 기존 사건·복원 초안은 보존한다. 모르는 값은 강제로 채우지 않는다.
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
- [x] P3-05 실행 가능한 범위의 historical 환경 분포를 수집하고 scaler 생성 기간과 feature 비활성 사유를 기록한다.
- [x] P3-06 snapshot manifest·feature·forecast를 immutable하게 저장한다. issued/retrieved/valid time과 실제 보존 시점을 분리한다.
- [x] P3-07 WITA 20:00 cutoff의 D+1 seal을 구현한다. 늦은 job, 빈 후보, 재실행, 사후 backfill을 검증한다.
- [x] P3-08 data branch push entrypoint와 main의 고정 commit reusable workflow를 연결한다. data를 실행 코드로 취급하지 않는다.

외부 데이터 연결이 막혀도 adapter contract·합성 fixture·결측 UI 개발은 진행한다. 실제 provider 연결이 안 된 테스트를 통과했다고 표시하지 않는다. 제공자 자료를 공개 보존할 권한이 없으면 다른 허용 자료를 검토하며 비공개 저장소를 임의로 도입하지 않는다.

완료 근거: MODEL-03, MODEL-05, SNAP-01–02, OPS-01. 실제 dataset ID와 좌표의 검증 evidence를 운영 문서에 남긴다.

P3-01/02 코드 완료 근거: `config/source-registry.json`, `config/geometry.json`, `engine/bunaken_engine/registry.py`, `docs/environment-sources.ko.md`. Python 3.14.7/uv에서 10개 테스트 통과. 초기에는 19개 Site를 null/unverified로 등록했다. 이후 사용자 확인 대표 입수 좌표를 반영했고, 2026-10-03에는 모든 Site의 대표 수심 18m를 coordinates_depth_verified로 반영했다. 방향·격자 거리와 Zone은 미확정이다. 초기에는 Copernicus 라이선스 원문 접근 실패로 공개 export를 차단했다. 2026-10-04 사용자 제공 원문 PDF §2.2/2.4/2.6을 확인하여 파생 샘플 공개를 허용했다(`docs/copernicus-license.ko.md`). 전체 geometry와 일부 공급원의 metadata·공개 재배포 조건은 운영 연결 의존이다. 관련 기준: MODEL-03, MODEL-05.

P3-03/04 구현 근거: `sources.py`의 공식 SDK/고정 모델 adapter와 `features.py`의 바다 셀·해저 수심·벡터·보간·구간 요약. core 20개/provider SDK-backed mock 2개 검증 통과. 실제 Copernicus catalogue에서 dataset version 202406과 50개 depth 좌표를 조회했다. 초기 검증에서는 live 수집을 실행하지 않았으며, 2026-10-01 실제 FES atlas 수집·독립 비교·adapter 확인을 완료했다. source age 또는 FES reference conformance가 확인되지 않으면 운영 적격으로 쓰지 않는다. P3-05의 실행 가능한 조석 historical 분포 수집·부분 scaler는 아래 추가 검증 기록에 따라 완료했다. 다른 공급원·geometry 의존 feature는 명시적으로 비활성이다.

P3-06/07 구현 근거: `snapshots.py`, `git_store.py`, `pipeline.py`, CLI와 snapshot 1.1/receipt 1.0/seal 1.0 계약. 원자적 non-force 저장·unrelated head 경쟁·응답 유실·immutable 재시도, cutoff 직전/동시/직후·late rerun·backfill·빈 후보를 fixture/mock으로 검증했다. 실제 data branch 저장은 미실행이며 CLI 기본값은 로컬 진단 출력이다.

P3-08 구현 근거: `.github/workflows/environment.yml`과 `ops/workflows/data-entrypoint.yml`. reusable workflow/실행 코드는 검증된 full SHA로 고정하고 main ancestry를 검사한다. data observation push만 호출하며 raw data를 실행하지 않는다. 실제 data branch 설치·예약 작업·environment 설정은 P7 운영 의존으로 남았다.

## 7 P4 공개 대시보드와 cold start

- [x] P4-01 WITA 내일 기본 날짜, D+1–D+7 화면, 오늘 선택을 구현한다.
- [x] P4-02 조석 그래프·Site 비교표·모바일 카드를 구현한다. 단위·기준 수심·생성 시각을 노출한다.
- [x] P4-03 PCI null과 reason code를 근거 부족/자료 누락/오래된 자료/범위 밖 상태로 번역한다.
- [x] P4-04 anchor 환경이 없을 때 similarity를 생성하지 않는다. 복원 가능한 경우에도 미검증 유사성으로 표시한다.
- [x] P4-05 오전/오후 중앙값·가용 슬롯 비율·예측 곡선 최대의 의미를 구현한다.
- [x] P4-06 공개 관측·Site 상세·PCI 기준·방법론·status 페이지를 ko/en으로 만든다.
- [x] P4-07 release 파일 검증 후 latest manifest를 교체하고 CDN이 같은 release만 읽도록 한다.

완료 근거: PUB-01, DATA-01–02, MODEL-01, MODEL-03–04, I18N-01. 색으로 안전 판정을 하지 않고 모든 핵심 상태를 텍스트로 설명한다.

## 8 P5 Analog와 검증

- [x] P5-01 overall/peak/legacy label scope, observer/rubric, use_for_model, 최신 유효 revision의 적격 필터를 구현한다.
- [x] P5-02 같은 목표 mask, 환경 거리, Site·quality·provenance 가중치와 결정적인 이웃 정렬을 구현한다.
- [x] P5-03 numeric gate와 N_eff/N_eff_days, 같은 Site/Zone 날짜 수를 계산한다.
- [x] P5-04 support 단계는 표본 조건과 검증 조건을 함께 검사한다. 검증 기준 미설정 시 Medium/High를 승격하지 않는다.
- [x] P5-05 별도 적격 수직 관측 집합에서 evidence를 계산한다. unknown 제외와 none 구분을 검증한다.
- [x] P5-06 날짜별 전진 검증과 진단용 LODO를 분리한다. scaler·bias·튜닝을 training 범위 안에 둔다.
- [x] P5-07 전체/Site median baseline, MAE·큰 오차·제공률·abstention을 같은 test 조건에서 보고한다.
- [x] P5-08 모델·scaler·feature·geometry·dataset manifest를 고정하여 재현 가능한 실행을 만든다.

완료 근거: MODEL-01–05, VAL-01, SNAP-01–02. 합성 데이터에서 알고리즘이 정상 동작하는 것과 실제 예측력이 입증된 것은 구분한다. 초기 label이 부족하면 실제 공개 출력은 계속 null이어야 한다.

P5 구현 근거: `config/model.json`, `analog.py`, `model_data.py`, `model_input.py`, `validation.py`, snapshot/model-context 계약과 `docs/analog-engine.ko.md`. 최신 revision·실제 저장 cutoff·같은 WITA 날짜/관측 ID 분리, 고정 mask·이웃/ESS·수직 근거, baseline·abstention, trusted 역사 설정으로 원자료부터 재현하여 변조를 거부하는 경계를 구현했다. 합성 integration에서 numeric PCI와 공개 release 생성·버전 변경 후 replay를 검증한다. 2026-10-04 초기 검증 당시 data branch는 4개 revision·적격 label 0개였고 관측 대표 수심과 환경 결합이 부족했다. 이 초기 상태는 2026-10-05 정정·18개 학습 후보·7일 로컬 결합 결과로 대체되었으며 최신 근거는 §2.1과 고정 연구 근거 묶음을 따른다. 실제 Copernicus 19개 Site/18m 파생 샘플 456개가 유효하다. 2026-10-04 사용자 승인에 따라 허용 거리 6km·지도 진행/외해 근사축을 reference_geometry로 등록했다. target 또는 선택 analog가 이 기준이면 experimental/very_low로 제한하며 실제 예측력 검증 완료를 뜻하지 않는다. Zone은 위치 근거 확보 전 미등록이다. 큰 오차·High 기준은 null로 유지하고 Medium/High를 승격하지 않는다.

## 9 P6 연구 발행

- [x] P6-01 공개 Markdown 원고와 metadata의 draft/in_review/ready/published 상태를 구현한다.
- [x] P6-02 technical.ko/en, guide.ko/en을 같은 release에 연결한다.
- [x] P6-03 단일 results.json과 manifest로 숫자·차트·표를 연결하고 네 원고 간 hash/version 불일치를 검사한다.
- [x] P6-04 안전한 Markdown 미리보기, 발행 버튼, 이전 버전, 정정 이유를 구현한다.
- [ ] P6-05 첫 방법론 보고서는 데이터 부족과 미검증 상태를 명시한다. 존재하지 않는 성능·DOI·심사 이력을 생성하지 않는다.
- [x] P6-06 홈페이지에는 published만 노출하되 저장소 draft가 공개라는 사실을 편집 화면에 표시한다.

구현 근거: research-release/results schema 1.0, /api/admin/research, /{locale}/admin/research, immutable research releases와 공개 reader. 고정 근거 묶음·Astra 작성 지시는 docs/research/에 둔다. 연구 원고 작성·사람 검토·실제 웹 발행은 아직 수행하지 않았다.

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

P3 최종 검증 기록: core Python 39개, provider SDK-backed mock 2개, Node 계약·인증·저장·HTTP 42개 통과. lint/typecheck 통과. 격리한 source checkout의 `next build --webpack` 통과. Python wheel/sdist 생성 및 저장소 밖 installed CLI status 확인. 실제 좌표 없는 collect 진단은 samples=0/status=failed/PCI=null로 종료하고 공개 Git 저장을 수행하지 않았다.

P3 추가 검증 (2026-10-01): FES2022b ocean_tide_20241025 실제 34개 성분 다운로드·길이·XZ CRC·단위·hash 확인. 정사각 crop의 축 해석 오류를 재현하고 `(lon, lat)` 저장으로 수정했다. 19개 대표 입수 좌표 × 30일(2026-09 WITA), 27,341행의 historical 환경 분포와 scaler 생성. 활성 feature 2개, 비활성 19개 및 사유 기록. LIBFES 2.9.7 독립 비교 4,560건 통과, 거부값 0건, 최대 차이 0.000843149m(기준 0.001m). 이는 구현 간 수치 비교이며 현장 정확도 검증이 아니다. 실제 adapter 추가 확인 19 Site/57 sample, 검증 flag 0개. 현재 core 45개/provider 6개 테스트 통과. 같은 작업에서 Node 42개·lint·typecheck 통과. 최종 wheel/sdist 재생성, 저장소 밖 Python 3.14.7 환경에서 두 CLI와 provenance module 확인, archive 비밀·원자료·pyc 제외 및 연구 산출물 hash 확인. 원본·산출물은 ignored `.local/`에만 저장했다. 공개 Git·운영 forecast 발행은 수행하지 않았다.

P3-05 근거: `fes_atlas.py`, `fes_research.py`, `fes_validation.py`, `docs/fes-atlas.ko.md`; 로컬 `.local/history-2026-09/manifest.json` SHA-256 `35e2f7dde21fbac3eff3e5b35ccc8e063539cc1b3065d386f3a21d6e5c67a575`. 실제 확보 cutoff `2026-10-01T12:44:19.124938Z`. 과거 cutoff 이전에 확보한 분포로 가장하지 않는다. phase 정의와 다른 공급원·geometry가 미확인인 feature는 null/disabled이며 PCI label을 만들지 않는다.

P3 남은 운영 의존: 벽/외해 방향·Zone geometry·허용 격자 거리의 현장 확인, Copernicus 공개 재배포 권한과 source age 확인. 실제 FES atlas/NetCDF smoke 및 참조 비교는 완료했지만 이를 다른 공급원 검증으로 대체하지 않는다. P3-08 template 원격 설치·protected environment Secrets·runner 참조 증거·scheduled run 연결은 P7에 남긴다. 로컬 `.env`는 등록 완료했으며 GitHub로 전달하지 않았다.


### P3/P4 추가 작업 (2026-10-03)

- P3: 19 Site 대표 수심 18m 확인. 실제 관측 수심·9/19 anchor 수심은 변경하지 않았다. geometry 1.2의 부분 확인 상태는 전체 verified와 구분한다. `ea17320`.
- Copernicus SDK 2.5.0의 갱신 시각은 dataset version의 선택 part에 있다. 실제 SDK 구조와 자료 수집으로 adapter 오류를 수정했다. `f41c670`.
- FES: 변경된 geometry로 독립 비교·provenance 재생성. 19 Site × 30일, 27,341행, 비교 4,560건, 거부 0건, 최대 차이 0.000843149m. 현재 geometry와 코드 hash에서 19 Site의 provenance 확인. 현장 정확도 검증을 뜻하지 않는다. `.local/history-2026-09-depth18/manifest.json` SHA-256 `58ba7b3c2e555771af0e63d6051be44db7fe8ba2abc7a3efc7e5b07cf36139e3`, 실제 확보 cutoff `2026-10-02T23:35:08.822933Z`.
- Copernicus currents/temperature/salinity와 Open-Meteo wind/wave 5개 자료 실제 수집. 모두 비공개 로컬 연구 산출물이며 운영 적격은 false다. 18m를 포함하는 실제 수심 격자와 wet mask를 확인했다. 대표 입수점의 최근접 후보는 2개 바다 셀, 거리 2.60–5.34km다. 허용 거리나 현장 대표성을 확정하지 않았다. `.local/providers-2026-09-depth18-v4/manifest.json` SHA-256 `ef40124e9b5aa6949f1455b0cae203b77266d77493d3a47422ed7081aa5c3588`, 실제 확보 시각 `2026-10-03T00:23:01Z`. bathymetry·mask와 검토표를 포함한 7개 파일 hash 및 Python 3.14.7/SDK 2.5.0을 보존하고 현재 코드 hash 일치 확인. `234f317`, `6c4bf83`.
- P4-01–06: ko/en 공개 대시보드, 오늘/D+1–D+7, Site 필터·상세, 실제 조석 그래프와 수치 표, 오전/오후 집계, 공개 관측·PCI 기준·방법론·자료 상태 구현. 기본 내일과 WITA 고정 시각, 최소 44px 조작 영역, 부분 자료와 범위 밖 상태를 적용했다. anchor 환경 미복원이면 similarity=null이다. `e271aa1`.
- P4-07: dashboard/latest schema, release 1.1, 허용 소스·현재 관측 전체 집합·snapshot 및 geometry 일치·압축 파일 hash 검증 후 원자적 non-force commit으로 latest를 교체한다. 응답 유실 후 같은 후보 재시도는 기존 성공을 확인한다. 웹은 동일 release의 Site metadata와 자료만 읽는다. source 생성 시각과 release 생성 시각을 구분한다. `2fbfbe7`, `5364c17`.
- 실제 로컬 preview: 2026-10-04 시작 7일, 19 Site, 조석 6,555건, 예측 슬롯 2,128개, 숫자 PCI 0건. 6,581,551byte JSON을 134,684byte gzip으로 저장했다. 공개 Git 쓰기·배포·공식 D+1 발행은 실행하지 않았다.
- 검증: 설치된 TypeScript 7 typecheck·ESLint·production build 통과. pnpm wrapper는 격리 환경의 registry signature fetch 실패로 실행되지 않아 동일 package script의 설치된 도구를 직접 실행했다. 360/375/1280px Chrome 렌더에서 가로 넘침 없음, native PCI 도움말 Enter 열기 확인. 실제 FES 자료 48개로 모바일 조석 그래프 렌더 확인. ko/en 공개 경로 12개 HTTP 200, 미등록 Site 404, 미설정 status는 unavailable. wheel/sdist 빌드와 저장소 밖 Python 3.14.7 설치 CLI 확인, archive에 비밀·NetCDF·pyc 없음. 이번 작업에서는 테스트를 추가하거나 테스트 suite를 실행하지 않았다. 기존 기대값과 SDK mock 형상만 수정했다.
- 현재 공개 release는 experimental 전용이다. 공식 D+1 seal 적격 출력 연결, 원격 workflow 설치·Secrets·배포·실기기 acceptance는 P7에서 검증한다. 수집 후 release 발행은 하나의 trusted workflow chain에 연결했으나 원격 실행은 하지 않았다. `5893006`.

검토 보류: 벽/외해 bearing, Zone geometry, Copernicus 후보 셀의 허용 거리·대표성, Copernicus 공개 재배포 권한, Open-Meteo source age·sea grid 대표성. 미확인 항목은 값이나 학습 적격을 생성하지 않는다. 실행·재시도 안내는 [공개 대시보드](docs/public-dashboard.ko.md), [환경 연구 수집](docs/provider-research.ko.md)에 기록한다. `docs/environment-sources.ko.md`는 수정하지 않았다.

### 2026-10-04 후속 반영

- geometry: `7d62a04`, `0c16f71`, `3d4c650`. 사용자 승인 6km·대표 수심 18m·지도 진행/외해 기본축을 적용했다. Site 입수점과 실제 공급 셀은 다른 좌표로 설명한다. Zone은 추후 식별 근거 확보 시 확장한다. 기준축은 실측 검증과 구분하며 numeric 결과는 experimental/very_low로 제한한다. 기존 실데이터 격자·수심 검사 19 Site 통과, 최신 SDK 실시간 재수집은 시간 초과로 검증 미완료다.
- 관측 UX: 최신 입수순 고정 head 페이지 정렬, 로딩 힌트, WITA 오늘 날짜, 날짜 한 번 선택, 출수 필수·50분 제안·직접 수정·명시적 다음 날 출수를 적용했다. schema 1.4를 도입하고 과거 nullable 출수·이미 성공한 멱등 요청을 보존한다. 빈 Peak 섹션은 숨기며 복원된 기존 사건·Zone·경로는 삭제하지 않는다.
- 남은 연결: 공급자 요청 제한/지연 복구·공유 셀 요청 최적화, 실제 관측 구간 자동 환경 결합, 최신 trusted code를 사용하는 원격 수집→모델 갱신→검증→release chain, 실제 저장 cutoff/seal·홈페이지 반영 검증. 현장 정답은 자동 생성하지 않으며 관측 축적 전 숫자 예측 gate는 유지한다.
- 검증: 독립 worktree의 typecheck·lint·production build 통과. 웹 단위/계약/HTTP 47개, 엔진 74개, 실제 Chrome 브라우저 회귀 1개(13개 항목) 통과. 최신순 테스트 2개는 수정 전 코드에서 실패를 재현했다. 실제 GitHub 관측 저장·배포는 수행하지 않았다.

### 이번 요청 완료와 다음 의존 (2026-10-05)

FES 파생 조석 54,891개(19 Site × 2,889 시각), gzip 498,284 bytes를 data commit `4e3ae9aff4bb89c774677ae5921ce9922e70247e`에 저장하고 같은 고정 head에서 다시 읽어 hash·geometry·계산 코드 검증을 통과했다. 원 atlas는 공개 저장하지 않았다. valid 범위는 WITA 2026-10-05 22:00–2026-12-05 02:00이다. 7일 수집과 양끝 2시간을 포함한 마지막 온전한 target date는 2026-11-28이다. 만료 직전까지 기다리지 않고 11월 중순에 다음 파생 묶음을 준비한다. 좌표·계산 코드 변경 시에도 새 묶음·pin이 필요하다.

trusted data entrypoint template은 검토된 코드 `490264b25362a60ad1425a686f7f83a4084ef898`에 고정했다. AVISO secret 전달은 제거했으며 원격 entrypoint 설치·Secrets·보호 환경·실제 실행은 P7에 남는다. 로컬 커밋만으로 원격 workflow가 바뀌지 않는다.

P6 기반 검증: engine 90개, 계약/웹 단위 58개, 실제 로컬 인증 HTTP·합성 연구 브라우저 2개, provider 12개, TypeScript 7·ESLint·격리 production build·actionlint 통과. 1920px·360px 확인, 최신 revision·timeout 동일 요청 복구·편집 후 검토 초기화·검토 내용 불변 발행 검증을 포함한다. 실제 원고 작성은 [Astra 지시문](docs/research/astra-authoring.ko.md)에 따라 진행한다. 원고·예측 snapshot의 실제 웹 발행과 production 검수는 수행하지 않았다.
