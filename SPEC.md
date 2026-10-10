# Bunaken Current Observatory 기술 명세

버전: 2.8\
작성일: 2026-10-08\
기준: [PRD.md](PRD.md) v1.12 · [AGENTS.md](AGENTS.md)\
구현 순서: [PLAN.md](PLAN.md)  
상태: 구현 계약. 실행 가능한 코드·배포·실제 예측 성능을 제공하는 문서는 아니다.

## 1 적용 범위와 규약

이 문서는 PRD의 자체 인증·공개 저장소·모바일 관측·Analog 예측·연구 발행을 구현 가능한 계약으로 구체화한다. 제품 범위를 바꾸지 않는다. 충돌하면 사용자 최신 결정과 PRD를 우선하고 SPEC을 수정한다. 실제 패키지 버전, provider dataset ID, Site geometry는 구현 시 확인할 설정이며 임의로 확정하지 않는다.

`필수`는 출시 검수 대상이다. 수치 threshold는 검증 전 초기 제품 설정이며 과학적 상수나 안전 기준이 아니다. 예시 JSON의 demo 관측은 합성 데이터다. 문서의 JSON Schema 계약은 구현 시 `packages/contracts/json-schema`에 파일로 작성해야 하며 아래 예시만으로 검증기가 구현됐다고 보지 않는다.

| 항목 | 규약 |
|---|---|
| 서비스 시간대 | Asia/Makassar, WITA, UTC+08:00 |
| 저장 시각 | UTC ISO 8601, 원래 입력의 로컬 시각·precision 별도 보존 |
| 로캘 | ko 기본, en 지원 |
| 식별자 | 관측·사건·요청은 UUID, Site/Zone은 서버 등록 stable ID |
| 수치 | JSON finite number, NaN/Infinity 불가 |
| 결측 | null, unknown, none, 0의 의미 구분 |
| 단위 | 수심 m, 속도 m/s, 수온 °C, bearing 진북 기준 시계방향 도 |
| PCI | 0 이상, 상한 없음, 무차원 개인 체감 강도 |
| 버전 | 문서·schema·rubric·feature·scaler·model·geometry 버전을 독립 관리 |
| 해시 | 콘텐츠 SHA-256, 멱등 요청 식별자는 별도 비밀의 HMAC-SHA-256 |

## 2 실행 구성과 권한 경계

| 구성 | 책임 | 지속 저장 |
|---|---|---|
| 웹 클라이언트 | 공개 조회, ko/en UI, 관리자 입력, 기기 초안 | 동의한 IndexedDB 초안만 |
| Vercel 서버 함수 | 자체 인증, 서버 검증, Git 쓰기, 공개 패키지 조회 | 로컬 디스크·메모리를 원본 저장소로 사용하지 않음 |
| GitHub main branch | 웹·엔진·schema·신뢰된 workflow | 공개 코드 |
| 같은 저장소 data branch | 관측·snapshot·연구·revision·manifest | 공개 파일 |
| GitHub Actions | 환경 수집, feature, 예측, 검증, 웹 release | 결과를 data branch에 commit |

별도 서버 DB, OAuth, 비공개 저장소, 상시 백엔드와 LLM 런타임 의존은 없다. 공개 저장소의 branch는 읽기 접근 제어가 아니다. `data`의 draft와 과거 revision도 공개다. 일반 방문자는 쓰기 API를 사용할 수 없고 외부 PR은 병합 전 원본을 변경하지 않는다.

main은 코드 검토·검증 규칙을 적용한다. data는 관리자 서버와 운영 workflow의 직접 commit을 허용하되 force push·삭제를 막는다. Vercel production은 main만 배포하고 data 변경으로 preview build를 만들지 않는다. GitHub PAT는 branch/path 전용 토큰이 아니므로 main 보호와 서버의 경로 allowlist를 함께 적용한다.

## 3 설정과 자체 관리자 인증

### 3.1 서버 설정

| 이름 | 형식과 책임 |
|---|---|
| ADMIN_USERNAME | 비어 있지 않은 로그인 이름. 공개 observer alias와 별개 |
| ADMIN_PASSWORD_HASH | salt·알고리즘·파라미터를 포함한 encoded Argon2id hash |
| ADMIN_ENABLED | 명시적 boolean 설정. 미설정은 false |
| ADMIN_AUTH_VERSION | 비어 있지 않은 버전 문자열. 비밀번호 변경 시 증가/교체 |
| SESSION_SECRET | 검증된 세션 라이브러리가 요구하는 고엔트로피 키 |
| IDEMPOTENCY_SECRET | 요청 digest용 독립 HMAC key |
| GITHUB_WRITE_TOKEN | 지정 공개 저장소의 Contents read/write, 만료일 있는 fine-grained PAT |
| GITHUB_OWNER / GITHUB_REPO | 서버 고정 저장소 식별자 |
| GITHUB_DATA_BRANCH | data. 요청 본문으로 재정의 불가 |
| CANONICAL_ORIGIN | production 관리자 접근을 허용하는 HTTPS origin |

CANONICAL_ORIGIN은 PRD의 canonical origin 검사를 구현하기 위한 설정 이름이다. 개발용 localhost origin은 개발 환경에만 명시적으로 허용한다. 운영 비밀을 NEXT_PUBLIC 변수로 노출하지 않는다. 소스 자격증명은 원칙적으로 수집 workflow의 Secrets에만 둔다.

stable 관리자 subject는 로그인 이름이 아닌 내부 고정 식별자다. 초기 구현은 단일 관리자를 뜻하는 고정 subject를 사용한다. 사용자명 변경·세션 재발급이 같은 요청의 멱등성을 바꾸면 안 된다.

### 3.2 로그인 절차

1. 로그인 페이지가 `GET /api/auth/csrf`에서 짧은 수명의 token을 받는다. 응답과 사전 인증 쿠키는 no-store다.
2. 브라우저는 username/password와 token을 `POST /api/auth/login`으로 전송한다. TLS 외 URL·query string으로 비밀번호를 전송하지 않는다.
3. WAF가 로그인 POST의 IP별 5분당 10회 초기 제한을 적용한다. 초과는 429다. 카운터의 지역 범위를 전역 단일 카운터로 설명하지 않는다.
4. 서버는 origin, 요청 크기, CSRF, enabled와 필수 환경변수를 검사한다. 클라이언트가 보낸 host/header를 신뢰해 origin allowlist를 만들지 않는다.
5. username과 encoded hash를 검증한다. 잘못된 계정과 비밀번호는 동일한 401 메시지를 반환하고 계정 존재 여부를 노출하지 않는다.
6. 성공 시 새 세션과 세션에 결합된 새 CSRF token을 발급한다. 기존 사전 인증 상태를 그대로 승격하지 않는다.

비밀번호 최대 길이는 구현 schema에서 명시하고 허용 길이 안에서 truncation하지 않는다. 해시 검증은 검토된 라이브러리를 사용한다. Argon2id를 지원하지 않는 런타임은 문서화한 scrypt 대안과 자원 측정을 거친다. 평문·단순 SHA-256·자체 암호 구현은 금지한다.

CSRF 구현은 검증된 세션/CSRF 라이브러리의 signed double-submit 등 서버 DB가 필요 없는 검증 방식을 사용한다. 단순히 헤더가 존재하는지 검사하지 않는다. 세션 생성 후 token을 다시 발급하고 모든 관리자 변경 요청과 logout에 적용한다. 이 문서는 새 암호 프로토콜을 정의하지 않는다.

### 3.3 세션과 접근

세션 쿠키 이름은 `__Host-bunaken_session`이다. Secure, HttpOnly, SameSite=Lax, Path=/, Domain 없음, 절대 만료 12시간을 적용한다. 인증된 암호화 세션에 sub, issued_at, expires_at, auth_version, 무작위 session_id만 넣는다. 비밀번호·해시·PAT는 넣지 않는다.

모든 관리자 페이지와 API는 enabled, 서명/암호화 검증, 만료, auth_version, production origin을 검사한다. 미인증 페이지는 로그인으로 이동하고 API는 HTML redirect 대신 401 JSON을 반환한다. 모든 보호 응답은 `Cache-Control: private, no-store`다. 공개 JSON은 관리 화면과 별개로 익명 조회 가능하다.

로그아웃은 쿠키와 로컬 세션 상태를 삭제한다. 전체 세션 철회는 auth version/secret 변경과 재배포로 수행한다. 비밀번호 변경 시 hash와 auth version을 함께 바꾼다. 환경변수 변경이 과거 deployment까지 즉시 적용된다고 가정하지 않으며 구버전 URL의 관리자 접근을 차단한다. 개별 탈취 세션의 즉시 서버 철회 기능은 없다.

## 4 데이터 계약

### 4.1 Site와 Zone

Site는 id, slug, name_ko, name_en, 좌표, geometry_status를 가진다. 관측 입력의 등록 Site 목록과 stable ID는 `packages/contracts/data/sites.json`을 단일 원본으로 삼으며 새 관측·수정 폼은 목록에서 선택한다. 표시명은 각각의 stable ID로 저장하며 등록되지 않은 이름은 서버가 거부한다. 사용자가 확인한 대표 입수 좌표와 예측 대표 수심만 목록에 반영한다. 미확정 방향·Zone geometry는 만들지 않는다. Zone은 id, site_id, name_ko/en, reference_depth_m, wall_bearing_deg, offshore_bearing_deg, geometry_group, geometry_version, verified_at을 가진다. 확인되지 않은 좌표·방향·수심은 null과 unverified로 남긴다.

2026-10-03 사용자 결정: 모든 Site의 예측 대표 수심은 18m다. geometry schema 1.2의 `coordinates_depth_verified`는 대표 입수 좌표·기준 수심만 확인한 상태다. wall/offshore bearing·허용 격자 거리·Zone은 null로 유지하고 전체 verified 또는 Ocean 투영 적격으로 승격하지 않는다. 이전 coordinates_verified 형상은 계속 읽는다. 실제 관측 수심과 과거 anchor 수심을 18m로 덮어쓰지 않는다.

서버는 Zone이 Site에 속하는지 검사한다. unknown Zone은 null이다. Site명 변경은 ID를 변경하지 않는다. 검증되지 않은 geometry로 Ocean group 또는 유사 지형 multiplier를 구성하지 않는다. 기본 depth는 예측 기준이지 실제 관측 수심의 자동 입력값이 아니다.

### 4.2 신규 관측 요청

| 필드 | 필수 | 형식과 검증 |
|---|---|---|
| id | 예 | 클라이언트 UUID, 재시도에 동일 값 |
| local_start | 예 | 오프셋 없는 `YYYY-MM-DDTHH:mm`, WITA로 해석 |
| local_end | 예 | 시작 이후 출수 시각. 날짜 1회 선택, 기본 입수 +50분 제안, 사용자 변경 가능. 다음 날 출수는 명시적으로 선택 |
| timezone | 예 | Asia/Makassar만 허용 |
| time_precision | 예 | reported_minute 또는 approximate |
| site_id | 예 | 등록된 Site |
| zone_id | 키 필수 | 등록된 Zone 또는 null |
| route_description | 예 | string, 최대 300자. 빈 문자열 허용, 학습 feature 아님 |
| representative_depth_m | 예 | 0–200 또는 null. Overall PCI를 대표하는 수심이며 모르면 null |
| overall_pci | 예 | 0 이상, 소수 둘째 자리까지, 상한 없음 |
| vertical | 예 | direction과 nullable intensity |
| vertical_onset | 예 | null 또는 수직조류 시작 local 시각·UTC 시각·수심. Peak PCI와 독립 |
| confidence | 예 | high/normal/low. UI 기본 normal을 보이게 표시 |
| peak_events | 예 | 없으면 빈 배열. PCI·시각·수심·Zone·지속 설명·수직 방향. 사건 시각은 WITA local 시각으로 입력하며 UTC는 서버 생성 |
| observed_temperature | 아니오 | celsius, nullable depth_m와 at |
| notes_public | 아니오 | 최대 5,000자, 공개 가능한 원문 |
| public_summary_ko/en | 아니오 | 언어별 최대 1,000자 |
| use_for_model | 예 | boolean, UI 기본 true를 명시 |

현장 입력 기본 화면의 필수값은 WITA 입수 시각, 등록 Site, Overall PCI다. 나머지는 선택 항목으로 표시하고 접힌 상세 그룹에 둔다. 모든 날짜·시각은 중복된 date/time 컨트롤 대신 `YYYY-MM-DDTHH:mm`의 WITA `datetime-local` 입력 하나로 받는다. Peak 사건의 지속 설명은 반복 양상 등 지속 방식의 원문이고 `context_description`은 당시 조류·지형 등 상황 원문이다. PCI·시각이 없어도 당시 상황이나 지속 설명은 원문으로 남길 수 있지만, 내용이 전혀 없는 Peak 사건은 저장하지 않는다. 관측 일반 메모 `notes_public`과 사건 상황 설명을 합치지 않는다. 저장 전에 공개되는 정보임을 표시한다.

`time_samples`는 Overall 학습 label과 예측 입력에 쓰이지 않으므로 새 UI와 신규 schema 1.3 이상 revision에 저장하지 않는다. create 요청 validator는 구버전 기기 초안의 미완료 멱등 요청을 마칠 수 있도록 legacy 필드를 선택적으로 검증하지만 서버는 신규 revision 작성 전에 제거한다. 기존 1.0–1.2 기록은 읽을 수 있다. 그 기록을 정정할 때 schema 1.3 revision에도 기존 표본을 변경 없이 보존한다. 구버전 정정 초안 재시도는 요청 hash가 유지되도록 검증된 기존 표본을 요청에 다시 포함할 수 있으며 서버는 제출값을 무시하고 기존 저장값만 보존한다.

추가 프로퍼티는 거부한다. client가 observer_id, revision, train_eligible, label_scope, created_at, storage path를 설정하지 못하게 한다. 신규 입력의 label_scope는 서버가 dive_overall로 지정한다. 과거 이관 경로는 별도 관리자 도구에서 legacy_unspecified 및 null numeric을 허용한다. 일반 폼의 validation을 느슨하게 해서 과거 자료를 우회 입력하지 않는다.

수직 direction은 unknown/none/down/up/mixed다. unknown의 intensity는 null, none은 0 또는 null, 다른 방향은 0 이상의 유한 값 또는 null이다. 수직 시작 시각·수심은 `vertical_onset`에 따로 저장하며 Peak PCI와 결합하지 않는다. mixed의 방향별 사건 근거는 peak_events 등에 구분해서 저장한다. 9/19 PCI=1.0을 vertical intensity=1.0으로 변환하지 않는다.

PeakEvent는 UUID, nullable local/UTC at, depth_m/zone_id/pci, nullable duration_description(최대 300자), nullable context_description(최대 1,000자), vertical_direction, nullable vertical_intensity를 갖는다. duration_description은 측정된 초로 오인하지 않도록 원문 지속 양상으로, context_description은 사건 당시 환경 메모로 각각 보존한다. peak PCI가 있으면 overall 이상이어야 한다. 시각이 명시되면 알려진 dive 범위와 일치하는지 검사한다. 범위가 불명확한 과거 사건은 precision/quality flag로 보존한다. 전체와 사건 label은 같은 학습행으로 취급하지 않는다.

TimeSample은 다이빙 중 특정 시점의 부가 관측이다. `perceived_pci`는 관찰자의 무차원 체감값이며 m/s가 아니다. 방향은 `with_route / against_route / crossing_route / unknown`으로 보존한다. TimeSample과 vertical_onset은 Overall 학습 label이 아니며 Overall PCI를 대체하거나 분할하지 않는다. 입력의 local 시각을 보존하고 UTC 시각은 서버가 생성한다.

수온은 -3–45°C 범위를 검사한다. 깊이·시각을 모르면 null로 저장하며 depth calibration에서는 제외한다. 미래 시각 오류는 서버 시간을 기준으로 검사한다. 구현은 장치 시계 오차 허용 정책을 설정으로 명시하고 임의로 날짜를 고치지 않는다.

### 4.3 저장된 관측

저장 revision은 요청의 승인된 필드에 schema_version, observer_id, rubric_version, revision, start_at/end_at UTC, 원래 local 시각, label_scope, record_status, created_at/updated_at, 수정 이유를 추가한다. 신규 기록과 일반 수정의 현재 schema_version은 `1.4`이며 시작 수심을 저장하지 않고 PeakEvent에 context_description을 보존한다. `1.0`–`1.3` revision은 기존 형상 그대로 읽을 수 있고, 그 기록의 `time_samples`는 schema 1.3 이상 정정 revision에도 변경 없이 보존한다. record_status는 active/corrected/withdrawn이다. 공개 여부 enum은 없다.

관측 원본과 EnvironmentLink를 분리한다. train_eligible의 정본은 observation_revision에 연결된 검증 결과다. 공개 관측 API가 이를 표시할 때 원본과 link를 합성한다. 요청 직후 아직 link가 없으면 false와 `pending_enrichment`로 표시한다. 환경 재처리만으로 관측 원문 revision을 늘리거나 label을 바꾸지 않는다.

과거 9/19는 약 시각·수심·PCI 약 1.00·down·legacy_unspecified를 보존한다. 실제 Site ID는 등록 후 연결한다. 9/23·9/24 weak 및 9/26 Sachiko normal은 category로만 보존한다. 확인하지 않은 exact Zone, 수온, 유속, numeric PCI를 새로 만들지 않는다.

### 4.4 환경과 snapshot

SourceSample은 source/product/dataset/variable/version, lat/lon, selected_grid, depth, valid_time, issued_at, retrieved_at, value/unit, native_resolution, interpolation_method, quality_flags를 갖는다. 신규 sample schema_version은 1.1이며 site_id/zone_id, geometry_version, 선택 셀 좌표·거리, 실제 native_depths_m, source_updated_at을 함께 보존한다. 기존 schema_version 없는 sample은 1.0 형상으로 계속 읽는다. 파랑 주기의 s와 실용 염분의 PSU를 추가 허용한다. source_updated_at은 공급 자료의 갱신 시각이며 issued_at과 같다고 가정하지 않는다. issued_at 미제공은 null과 이유를 남긴다.

EnvironmentLink는 observation_id/revision, snapshot_id 또는 backfill_id, provenance, extraction_version, feature_vector, feature_mask, quality_flags, train_eligible, reason_codes를 갖는다. snapshot과 backfill을 같은 provenance로 저장하지 않는다.

Snapshot manifest는 run_id, local_run_date, generated_at, source metadata, code_ref, input_data_ref, model/scaler/feature/geometry version, 파일 경로·hash를 포함한다. 자기 자신 또는 자기 commit SHA를 자기 내부 해시에 넣지 않는다. 같은 run_id로 다른 바이트를 덮어쓰지 않는다.

Git ref 갱신 뒤 별도 immutable receipt에 snapshot_commit_sha와 실제 성공 확인 시각 recorded_at을 남긴다. commit 작성 시각만으로 cutoff 이전 저장을 증명하지 않는다. receipt ref 갱신을 확인한 직후 별도 immutable confirmation에 receipt hash와 confirmed_at을 기록한다. cutoff 적격 판정은 이 확인 시각까지 포함하며 confirmation이 없거나 실제 receipt 확인이 늦으면 보수적으로 부적격 처리한다. confirmation 파일 자체를 늦게 작성해도 확인 시각을 과거로 바꾸지 않는다. Git committer date는 보조 검사이고 독립된 저장 시각 증명은 아니다. 이 규칙은 PRD의 실제 보존 시점 조건을 구현하기 위한 세부 규약이다.

Snapshot의 논리 JSON schema는 유지하고 신규 모델 snapshot의 저장 manifest는 `manifest.json.gz`로 압축한다. 기존 `manifest.json`도 계속 검증한다. Receipt schema `1.0`은 JSON 경로, `1.1`은 gzip 경로다. `manifest_sha256`은 해제 문서가 아닌 실제 저장 파일 bytes의 hash이며 projection은 이 origin hash를 보존한다. feature/forecast artifact hash와 모델 재현 검증을 함께 수행한다. manifest는 압축 8MiB·해제 256MiB 상한을 적용하고 초과 시 발행을 중단한다. raw atlas·NetCDF는 이 포맷의 대상이 아니다. 데이터 누적에 따른 input 참조화·중복 환경 제거와 자원 사용량은 P7 검수 항목이다.

### 4.5 Prediction과 웹 release

Prediction은 site_id, nullable zone_id, start_at, duration_minutes=60, reference_depth_m, nullable pci, prediction_status, support, n_eff, n_eff_days, distinct_days, same_site_days, same_zone_days, vertical_evidence, feature_coverage, reason_codes와 모든 model/source 참조를 가진다.

prediction_status는 insufficient/experimental/available이다. support는 insufficient/very_low/low/medium/high다. gate 실패 시 pci=null이며 빈 배열 대신 원인 reason_codes를 제공한다. low support를 안전한 환경으로 번역하지 않는다.

Release manifest는 release_id, schema_version, generated_at, source_data_commit_sha, snapshot_ids, 파일 상대 경로·sha256, status를 갖는다. latest.json은 이 manifest를 가리키는 작은 pointer다. 웹은 latest를 한 번 해석한 후 모든 자산을 동일 immutable release에서 읽는다.

P4 신규 웹 release는 schema 1.1과 `dashboard.json.gz` 하나를 사용한다. gzip은 mtime=0으로 생성하고 압축 바이트의 SHA-256을 manifest에 넣는다. latest schema 1.0은 release UUID와 manifest hash를 가진다. dashboard schema 1.1은 해당 release의 19 Site metadata·예측·조석·환경 sample·현재 관측 revision 전체·출처·anchor 상태를 연결한다. 1.1의 environment_samples는 같은 snapshot에서 공개 allowlist를 통과한 비조석 SourceSample 원문이며 필수 배열이다. 기존 dashboard 1.0은 환경 배열 없는 형상으로 읽는다. source_status 실패 사유는 sources.reason_codes에 보존하고 저장 시 snapshot과 대조한다. 웹 reader도 현재 source registry의 공개 허용 변수·dataset·product·unit을 검사한다. source_data_commit_sha의 현재 관측 집합과 저장된 snapshot이 일치해야 발행한다. 세 파일을 한 commit으로 쓰며 실패하면 latest를 먼저 바꾸지 않는다. timeout 후 같은 후보 파일로 재시도하면 이미 반영된 성공을 확인한다.

압축 파일은 1,250,000byte, 해제된 JSON은 50,000,000byte 이하로 제한한다. 웹은 latest를 60초 재검증하고 immutable 자산을 공유 캐시한다. 해제 크기를 제한하고 pointer→manifest→gzip hash와 JSON Schema를 모두 검사한다. Site 표시도 같은 release metadata를 사용한다.

release generated_at과 원본 snapshot의 source_generated_at을 구분한다. 새 포장으로 source age를 초기화하지 않는다. P4의 forecast_kind는 experimental이며 공식 D+1이라고 표시하지 않는다. 숫자 모델은 P5에서 구현할 때까지 publisher가 pci!=null을 거부한다. 공식 seal 선택과 운영 발행 연결은 P7 검수 대상이다.

## 5 HTTP API 계약

### 5.1 공통 형식

JSON API는 UTF-8 application/json이다. 일반 관측 본문은 최대 64KB다. 원고 API는 별도 제한을 명시하되 임의 파일 업로드나 실행 파일을 받지 않는다. client와 server validation을 함께 적용하고 server를 정본으로 한다.

성공 응답의 기본 envelope는 data와 meta다. 실패는 error와 meta다. meta.request_id는 무작위 진단 ID이며 credential을 포함하지 않는다.

```json
{
  "error": {
    "code": "revision_conflict",
    "message_key": "errors.revisionConflict",
    "field_errors": [],
    "retryable": false,
    "current_revision": 3
  },
  "meta": {"request_id": "demo-request"}
}
```

| 상태 | 용도 |
|---|---|
| 200 | 조회, 수정, 동일 key 재시도 성공 |
| 201 | 최초 관측/원고 생성 |
| 202 | 저장 확인된 비동기 job 요청 |
| 400 | 잘못된 JSON 또는 요청 형식 |
| 401 | 세션 없음·만료·틀린 자격증명 |
| 403 | Origin/CSRF/관리자 활성 상태 등 접근 위반 |
| 404 | 유효한 ID지만 대상 없음 |
| 409 | revision 충돌, 동일 key의 다른 본문, 해결되지 않은 branch 경쟁 |
| 413 | 본문 제한 초과 |
| 422 | 필드·공개 스키마 검증 실패 |
| 429 | 시도 제한, 가능한 경우 Retry-After |
| 503 | 필수 인증 설정 오류 또는 공급/저장 서비스 장애 |

branch 경쟁의 409는 retryable=true, 관측 revision 충돌은 false다. GitHub 401을 client 로그인 오류로 가장하지 않는다. 서버 PAT 장애는 503과 storage_unavailable로 분리한다. 원본 provider 응답에 있는 비밀이나 내부 세부사항은 반환하지 않는다.

### 5.2 라우트

| Method | 경로 | 역할 |
|---|---|---|
| GET | /api/auth/csrf | 미인증 로그인용 token |
| POST | /api/auth/login | 자체 아이디·비밀번호 검증 |
| POST | /api/auth/logout | 보호된 세션 종료 |
| GET | /api/admin/session | 관리자 세션 확인 |
| GET/POST | /api/admin/observations | 목록 / 공개 신규 저장 |
| GET/PATCH | /api/admin/observations/{id} | 상세 / 새 revision |
| POST | /api/admin/observations/{id}/withdraw | 철회 revision |
| POST | /api/admin/requests/status | body의 key로 멱등 처리 결과 조회 |
| GET/POST | /api/admin/research | 원고 목록 / 공개 draft 생성 |
| GET/PATCH | /api/admin/research/{id} | 원고 조회 / 조건부 수정 |
| POST | /api/admin/research/{id}/publish | 네 원고 검증 후 발행 요청 |
| GET/POST | /api/admin/sites | Site 목록 / 생성 |
| GET/PATCH | /api/admin/sites/{id} | geometry 조회 / 수정 |
| POST | /api/admin/jobs | 허용된 작업 요청 |
| GET | /api/admin/jobs/{id} | 작업 상태 |
| GET | /api/public/forecast | 날짜·Site·Zone별 예측과 raw metadata |
| GET | /api/public/observations | 공개 관측 pagination |
| GET | /api/public/status | source age·snapshot·공개 job 상태 |

모든 admin 라우트는 method별 인증을 검사한다. status 조회 POST에도 CSRF/Origin을 적용하고 body key를 로그에 기록하지 않는다. GET은 데이터를 변경하지 않는다. API locale은 message_key와 UI 번역으로 처리하며 한국어 문구를 enum으로 쓰지 않는다.

공개 forecast query의 date는 WITA YYYY-MM-DD, site/zone은 등록된 ID다. zone과 site 불일치는 422다. 알려진 날짜에 예측이 없으면 200과 empty/insufficient metadata를 반환한다. 그 날짜에 값이 있는 것처럼 최신 데이터를 대체하지 않는다. 목록 기본 limit=20, 최대 100으로 하고 opaque cursor는 같은 data revision에 결합한다. 페이지 사이 원본이 바뀌면 새 조회를 시작할 수 있게 revision을 표시한다.

### 5.3 관측 create와 update

POST에는 `Idempotency-Key` UUID와 `X-CSRF-Token`이 필수다. PATCH에는 추가로 `If-Match: "obs:{id}:rev:{n}"`을 받는다. 조회 응답도 같은 ETag를 돌려준다. stale ETag는 409다. 수정 이유는 PATCH에서 필수다. client가 revision 번호를 임의 증가시키지 않는다.

```json
{
  "data": {
    "id": "11111111-1111-4111-8111-111111111111",
    "revision": 1,
    "record_status": "active",
    "saved_to_public_repository": true,
    "enrichment_status": "pending",
    "website_status": "pending"
  },
  "meta": {"request_id": "demo-request", "idempotent_replay": false}
}
```

실제 응답 meta에는 확인된 commit_sha도 포함한다. 예시는 실제 commit을 꾸며 넣지 않기 위해 생략했다. 관측 commit 성공은 환경 결합·홈페이지 갱신 성공과 별개다. 실패한 요청을 무조건 새 key로 다시 보내지 않는다.

## 6 Git 저장 트랜잭션

### 6.1 원자적 파일 묶음

| 파일 | 내용 |
|---|---|
| observations/{id}/revisions/{n}.json | immutable 공개 관측 revision |
| observations/{id}/current.json | 현재 revision과 경로·hash |
| idempotency/{digest}.json | public payload hash, ID, 결과 revision, 요청 종류 |
| audit/{eventId}.json | 공개 actor alias, action, 이전/새 revision, 시각, parent_commit_sha |

첫 commit 전에 schema를 검증한다. raw key·로그인 ID·세션·IP·비밀번호 해시를 저장하지 않는다. digest는 HMAC(IDEMPOTENCY_SECRET, stable_admin_subject + 구분자 + key)로 생성한다. key는 인증 수단이 아니다.

### 6.2 처리 순서

1. 인증·CSRF·Origin·공개 schema 검증을 통과한다.
2. canonical client mutation을 정규화하고 SHA-256을 계산한다. operation, entity_id, expected_revision, 변경 필드를 포함하되 key와 서버 생성 timestamp는 제외한다. JSON canonicalization 규칙과 테스트 벡터를 TS/Python에서 고정한다.
3. 현재 data head에서 ledger를 확인한다. 같은 digest와 같은 요청 hash이면 기존 결과를 반환한다. 다른 hash이면 idempotency_conflict다.
4. 신규 ID 중복 또는 expected revision을 검사한다. 수정 대상이 이미 달라졌으면 revision_conflict다.
5. 서버 필드를 붙이고 파일 묶음의 tree/commit을 만든다. 읽은 head를 parent로 지정한다.
6. force=false로 ref를 갱신한다. 성공 확인 후 201/200을 반환한다.
7. unrelated head 경쟁이면 최신 head로 3부터 재실행한다. 최대 3회 재시도와 jitter 후 retryable 409를 반환한다.

Ledger 재시도 확인은 stale revision 검사보다 먼저 한다. 이미 성공한 PATCH를 응답 유실 때문에 다시 보냈을 때 자기 수정 때문에 충돌했다고 표시하지 않기 위해서다. 새 요청의 같은 ID·다른 key는 자동으로 중복 성공 처리하지 않는다.

Git ref 반영 이후에만 저장 성공이다. timeout으로 결과가 불명확하면 같은 key 상태를 조회하고 필요 시 재시도한다. audit에 자기 commit SHA를 미리 포함하려 하지 않는다. final commit SHA는 응답에서 반환하고 저장된 파일 자체에는 parent_commit_sha를 둔다.

## 7 환경 feature 계약

### 7.1 추출

학습 overall은 [start_at,end_at] 구간의 환경 요약을 사용한다. end가 없으면 60분 proxy와 품질 감소를 적용한다. 대표 수심이 null이면 임의 수심 proxy를 만들지 않고 수심 관련 numeric 학습에서 제외한다. 예측은 해당 시각부터 60분, Zone reference depth를 대상으로 한다. 30분 간격은 겹치는 구간 추정이다.

Tide는 구간 중심 전후 60분의 rate, 조차와 위상 sin/cos를 포함한다. Ocean은 along/cross current, 기준 depth current, 수평 유속의 깊이 차이, Thermal은 모델 수온·ΔT·가능한 성층 proxy, Weather는 바람·파랑·너울, Depth는 관측과 목표 수심 차이를 포함한다. feature 이름·단위·필요 source·aggregation·정규화 규칙은 versioned feature registry로 고정한다.

각도 bearing b에 대해 `projection=u*sin(b)+v*cos(b)`이며 계산 시 radian으로 변환한다. u는 eastward, v는 northward다. cross의 양수는 설정된 offshore 방향이다. 2026-10-04 승인된 `reference_geometry`는 사용자 지도 화살표를 15° 간격으로 반올림한 근사 진행축·외해축이다. 두 축은 독립 투영이며 직각 보정하거나 직교 벡터의 성분으로 재구성하지 않는다. 해당 target 또는 선택 analog가 reference geometry이면 numeric gate 통과 후에도 `experimental / very_low`로 제한한다. 측정 검증 상태 `verified`의 직교 조건은 유지한다. unknown geometry에 임의 bearing=0을 넣지 않는다.

두 유효 수심/시각 사이에서만 선형 보간한다. 한 점과 정확히 일치하면 그 값을 사용한다. 깊이 범위 밖·해저 아래·소스 시간 범위 밖은 null이다. 방향 각도는 359°와 1°를 산술 평균하지 않고 벡터 성분으로 처리한다. 선택 grid와 Site 거리, 육지 mask, source native resolution을 보존한다.

### 7.2 정규화와 mask

각 수치 feature는 label 없는 과거 환경 분포의 median/IQR로 정규화한다. IQR=0 또는 유효 분포가 없는 feature는 disabled다. depth 차이를 포함한 모든 활성 거리 항은 문서화된 양의 scale이 있어야 한다. 개인 PCI 표본의 작은 분포로 scale을 임의 추정하지 않는다.

대상에서 유효한 활성 feature mask를 한 번 정한다. group 내 활성 feature 절반 이상이 유효해야 group을 사용한다. sin/cos 쌍은 함께 있어야 하고 한 feature로 계산한다. 그 mask를 완전히 충족하지 못한 analog는 제외한다. analog마다 다른 mask로 유리한 거리를 계산하지 않는다.

Coverage는 nominal group weight에 group 내부 사용 feature 비율을 곱해 더한 0–1 값으로 계산한다. disabled feature는 사용 정보에 포함하지 않아 coverage를 인위적으로 높이지 않는다. Tide/Ocean group이 필요하고 coverage>=0.80이어야 한다. 사용 가능한 group weight는 거리 계산 시 합계 1로 재정규화한다. 구체 feature registry가 없으면 모델을 production-ready로 간주하지 않는다.

`weighted-analog-v1.2`의 `comparison_scope=site-18m-v1`은 사용자 지정 18m 전용 실험 범위다. Depth group과 정의되지 않은 phase 쌍을 거리·coverage registry에서 고정 제외하고 네 환경 group의 기존 weight를 합계 0.90으로 나눈다. 나머지 registry의 disabled·zero IQR·결측은 분모에 남는다. 목표 수심이 18m가 아니면 `outside_model_depth_scope`, 이웃 수심이 다르면 후보에서 제외한다. 이 범위의 숫자는 항상 experimental/very_low다. 관측 실측 수온은 선택 입력이며 미래 modelled temperature를 대체하지 않는다.

`weighted-analog-v1.3 / comparison_scope=site-18m-v2`는 v1.2와 같은 수심 stratum·네 group weight·숫자 gate를 사용한다. Ocean은 18m along/cross/speed 세 항목, Thermal은 18m modelled temperature 한 항목이다. 10–30m shear·수온 차이는 원자료와 참고 표에 남기고 이 profile 거리·coverage registry에서 고정 제외한다. sigma=1은 유지한다. v1.2의 profile은 archived config로 재현한다.

신규 model context는 1.1이며 schema는 과거 1.0도 읽는다. 동일 시각 cutoff 내에서 snapshot을 backfill보다 우선하고, 같은 종류에서는 최신 생성 환경을 사용한다. 학습과 예측 모두 해당 관측 수심의 소스 적격 검사를 적용한다. archived v1.1 config는 이전 선택·coverage·소스 처리 동작으로 재현하며 과거 immutable 산출물을 고치지 않는다.

초기 weight는 tide=0.30, ocean=0.35, thermal=0.15, weather=0.10, depth=0.10이다. Moon은 표시 metadata이며 초기 distance에는 넣지 않는다. 실제 미래 수온을 feature로 쓰지 않는다. 수온 bias 보정은 PRD의 표본 조건과 training-only 검증을 통과한 별도 모델 버전에서만 활성화한다.

## 8 Weighted Analog와 출력 gate

### 8.1 후보와 계산

적격 후보는 호환 observer/rubric, numeric overall, 해석 가능한 구간, active/corrected 최신 revision, use_for_model=true, 적격 EnvironmentLink를 모두 충족한다. 같은 관측의 revision을 여러 표본으로 세지 않는다. withdrawn 및 legacy_unspecified는 제외한다.

```text
group_distance² = 해당 group에서 사용한 feature 제곱차의 평균
D_env² = sum(재정규화한 group_weight × group_distance²)
S_env = exp(-D_env² / (2 × sigma²)), sigma = 1.0
w_i = S_env × site_multiplier × provenance_weight × quality_weight
PCI = sum(w_i × label_i) / sum(w_i)
N_eff = sum(w_i)² / sum(w_i²)
N_eff_days = sum(W_day)² / sum(W_day²)
```

벡터 방향 sin/cos의 제곱차 합은 한 항으로 취급한다. 거리 오름차순으로 정렬하며 동률은 observation ID로 결정한다. S_env>=0.20인 후보에서 K<=20을 선택한 뒤 Site/quality/provenance weight를 곱한다. 같은 Site가 필요하다는 이유로 나중에 유리한 표본을 몰래 끼워 넣지 않는다. 모두 0이면 null이다.

| 관계 | Site multiplier |
|---|---:|
| 확인된 같은 Zone | 1.00 |
| 같은 Site, 한쪽 이상 unknown Zone | 0.80 |
| 같은 Site, 다른 확인된 Zone | 0.65 |
| 다른 Site, 확인된 유사 geometry | 0.35 |
| 다른 Bunaken Site | 0.15 |
| Site 불명 | 제외 |

forecast snapshot provenance=1.00, 사후 analysis backfill=0.70이다. 불완전 source는 적격 조건에 따라 제외한다. confidence 계수 high=1.0, normal=0.8, low=0.5에 구간 추정 0.8, depth 추정 0.8을 각각 곱한다. 둘 모두 추정이면 추가 곱은 0.64다.

### 8.2 숫자와 Support

기본 모델 숫자는 최종 후보에서 numeric label>=3, 서로 다른 WITA 날짜>=3, analog>=3, N_eff>=2, 같은 Site 관측>=1, 필수 source/coverage/time range 조건을 모두 충족할 때만 반환한다. 같은 날짜 세 개는 gate를 통과하지 못한다.

| 조건 | prediction_status | support |
|---|---|---|
| 어느 gate든 실패 | insufficient, pci=null | insufficient |
| gate 통과, 2<=N_eff<3 | experimental | very_low |
| N_eff>=3, 상위 조건 미충족 | available | low |
| N_eff>=5, 5일, 같은 Site 3일, Medium 검증 통과 | available | medium |
| N_eff>=10, 10일, 같은 Zone 5일, High 검증 통과 | available | high |

상위 조건부터 평가한다. Medium은 전진 forecast 검증 test일>=10, baseline MAE 개선, 큰 오차 악화 없음이 필요하다. High는 test일>=20, 목표 Site test일>=5, Site baseline 개선 및 사전 오차 허용기준이 필요하다. 큰 오차 비교 기준과 허용 오차가 미설정이면 해당 승격을 비활성화하고 Low를 유지한다. 단순 건수로 모델을 승격하지 않는다.

대표 reason code는 insufficient_numeric_labels, insufficient_distinct_days, insufficient_effective_support, no_same_site_analog, missing_required_features, insufficient_feature_coverage, unverified_geometry, stale_required_source, outside_source_horizon, pending_enrichment, legacy_label_scope, zero_weight다. 모든 실패 원인을 배열로 남기고 UI는 우선 원인과 상세를 제공한다.

### 8.2.1 별도 Site 전이 실험

`config/site-transfer.json`의 `site-transfer-v1`은 target Site와 모든 Zone label을 제외한다. Tide rate/excursion, 18m current speed, modelled temperature, wave/swell height/period를 비교한다. 독립 지도축의 방향 projection은 전이 feature로 쓰지 않는다. similarity·K·quality·provenance는 baseline 설정을 사용한다. Site별 round robin으로 최대 K를 선택하고 각 raw weight를 그 Site/날짜의 관측 수와 그 Site의 기여 날짜 수로 나눈다. 최소 3개 donor Site·3일·3 analog, N_eff 및 날짜/Site 유효수 각각 2 이상, 최대 Site 기여 0.5를 요구한다. 물리 source·coverage 0.8·18m·시간 gate를 유지하며 항상 experimental/very_low로 표시한다. 수직 evidence는 전이하지 않는다.

웹 exporter의 `--experimental-transfer --code-commit <clean HEAD>` 옵션은 dashboard/release schema 1.2로 `experimental_transfer` sidecar를 추가한다. 기본 `predictions`는 그대로 보존한다. sidecar는 config·context·실행 code SHA, unvalidated 상태, point별 donor Site/유효 Site 수/최대 기여 비율을 갖는다. 새 reader는 기존 schema 1.1도 읽는다. 발행 저장 경계에서 manifest/payload 버전·생성 시각을 일치시키고 sidecar를 원 snapshot·context에서 재계산한다. 재개 발행도 실제 clean HEAD를 검사한다. 실험 config 변경은 새 버전·새 패키지와 함께 진행한다.

전진 검증과 별도 whole-Site holdout, 고정 3km 지리 블록의 전진 검증을 수행한다. held-out Site/블록의 label과 환경 scaler 행을 제외한다. whole-Site holdout은 미래 날짜를 포함하는 진단이며 D+1 성능으로 표기하지 않는다. 결과에는 분모·abstention·matched donor median baseline·fold ID/날짜/Site·config/context hash를 기록한다. 자동 정확도 승격이나 PCI label 생성은 금지한다. 상세는 [Site 전이 실험](docs/site-transfer.ko.md)을 따른다.

### 8.3 수직 근거와 anchor

수직 evidence는 numeric overall 유무가 아닌 수직 label의 적격성을 기준으로 별도 후보 집합을 만든다. 구간과 환경이 해석 가능해야 하며 동일 환경 계산을 사용한다. unknown은 분모에서 제외하고 none을 실제 음성 관측으로 보존한다. mixed는 방향별 사건 확인 시에만 해당 양성에 포함한다.

known>=5, 날짜>=3, 해당 방향 사건 날짜>=2, none 날짜>=2, N_eff>=3을 모두 통과해야 사례 근거를 표시한다. 그 전은 insufficient다. 공개 출력은 방향별 evidence 상태와 양성/음성 날짜 수이며 퍼센트가 아니다. 자료 부족을 수직조류 없음으로 표시하지 않는다.

anchor 환경이 없으면 similarity=null이다. 존재하면 환경 similarity와 Site multiplier를 분리한다. >=0.70 high, >=0.40 medium, 그 미만 low이며 미검증 설명을 표시한다. anchor similarity는 PCI 또는 위험 확률로 변환하지 않는다.

## 9 Snapshot과 batch

수집 기본 스케줄은 UTC 23:17/11:17, 즉 WITA 07:17/19:17이다. D+1 seal은 UTC 12:17, WITA 20:17에 실행하며 cutoff는 WITA 20:00다. 예약은 main의 workflow에 둔다. schedule 지연 시 cutoff를 job 시작 시각으로 변경하지 않는다.

```text
snapshots/{localDate}/{runId}/manifest.json
snapshots/{localDate}/{runId}/features.json.gz
snapshots/{localDate}/{runId}/forecast.json.gz
snapshot-receipts/{runId}.json
seals/target-{localDate}.json
backfills/{observationDate}/{backfillId}/manifest.json
```

Snapshot schema 1.1은 status/kind, feature/source registry/geometry 버전·hash, deterministic gzip artifact hash, source별 실패 이유를 추가한다. SourceSample 1.0과 기존 snapshot 형상은 계속 읽을 수 있다. 신규 snapshot code_commit은 실제 40자 code SHA다. source_retrieved_at은 실제 수집이 없으면 null이며 retrieved time을 issued time으로 사용하지 않는다. SnapshotReceipt 1.0은 저장 commit과 manifest hash를 연결하고 Seal 1.0은 목표일/cutoff/선택 결과만 가진다. receipt와 seal에 알 수 없는 필드를 저장하지 않는다.

공식 seal은 cutoff 이전 실제 보존이 확인된 성공 run 중 최신 run을 선택한다. 목표일을 포함하지 않는 run은 제외한다. 없으면 missed_d1_snapshot이다. 미래에 analysis로 과거 seal을 채우지 않는다. 한 번 생성한 공식 seal은 불변이고 정정은 새 정정 기록을 별도로 남긴다.

source별 stale_after_hours 초기값은 동적 source 36시간이며 실제 갱신 주기로 조정한다. 정적 FES 파일의 다운로드 나이를 forecast age와 동일 취급하지 않는다. 필수 source가 stale이면 새 숫자를 발행하지 않고 이전 결과는 이전 생성 시각과 함께 표시한다.

data push entrypoint는 고정 commit의 trusted reusable workflow를 호출한다. GITHUB_TOKEN commit에 의해 다른 workflow가 자동 실행될 것에 의존하지 않는다. enrich→계산→release가 필요한 작업은 한 chain에서 완료한다. 경로 필터로 산출물 무한 재실행을 막고 파일을 shell command로 해석하지 않는다.

배치의 장애 상태는 queued/running/succeeded/failed이며 completed 결과에 source별 failure와 retry 가능 여부를 남긴다. 실행 재시작 시 같은 job/run ID의 성공 산출물을 다시 변형하지 않는다. 대규모 NetCDF와 비밀은 Git에 저장하지 않고 공개 보존이 허용된 최소 feature만 남긴다.

## 10 공개 화면과 모바일 상태

루트는 /ko로 이동한다. ko/en 언어 전환은 Site·Zone·날짜를 유지한다. 기본 날짜는 WITA 내일, 7일 화면은 D+1–D+7이다. 시각은 접속자 기기 timezone으로 자동 이동하지 않는다.

30분 시작 슬롯의 60분 대표 PCI를 표시한다. 오전 [08:00,12:00), 오후 [12:00,16:00)의 대표값은 유효 PCI 중앙값이다. 8개 슬롯 중 6개 이상이 유효해야 표시한다. 일부 누락 시 부분 자료와 가용 구간 최대, 전체 유효 시 예측 곡선 최대를 표시한다. 순간 최대 조류를 예측했다고 설명하지 않는다.

2026-10-03 메인 UI: 선택 Site가 있으면 PCI 그래프를 해당 Site의 유효 슬롯으로 제한한다. 선택이 없으면 전체 Site별 곡선을 표시한다. 19 Site 단일 비교표는 선택에 관계없이 유지하며 고정 헤더·고정 Site명·표 내부 스크롤을 제공한다. 오른쪽 환경 패널은 제거하고 조석·환경 종합은 Site 상세로 제한한다.

메인 환경 열은 조류 동향/북향, 바람 방향, 파고다. 선택 날짜 12:00 WITA와 정확히 일치하는 단일 sample만 표시한다. 공급원·변수·단위·Site·Zone·기준 수심과 공개 허용·품질을 검사하며 중복·누락·stale release는 미제공이다. 최근접 시각으로 대체하거나 방향을 산술 평균하지 않는다. 그래프 hint는 margin-top 8px다. 그래프 해석·표시 불가 사유·기준 사건·출처·생성 정보는 공개 /{locale}/research에서 일반 본문으로 제공한다. 메인은 정상 생성 시각을 생략하되 stale 상태와 이전 생성 시각은 함께 표시한다.

집계 Support는 표시된 슬롯 중 가장 낮은 수준을 사용하고 최대값 슬롯의 support를 상세에서 보여준다. 슬롯별 evidence를 평균하여 수직 확률로 만들지 않는다. 예측 수치는 기본 소수 첫째 자리, 실제 관측은 입력 정밀도를 보존한다.

관리자 폼 상태는 미저장→기기 임시저장(선택)→전송 중→공개 저장됨→홈페이지 반영 중→반영됨이다. 오류는 기존 입력값과 같은 key를 유지한다. 세션 만료는 원래 폼을 유지하는 별도 탭 재로그인 후 복귀한다. 사용자가 변경된 값을 새 요청으로 확정하기 전 미결 key의 성공 여부부터 확인한다.

기기 초안은 동의한 경우만 IndexedDB에 저장하고 7일 TTL, 인증 후 복원, 관리자 subject 분리, 서버 저장 후 정리, 로그아웃 기본 삭제를 적용한다. 토큰은 저장하지 않는다. 오프라인으로 관리자 페이지를 새로 열어 인증을 우회하지 않는다. 서비스워커에 보호 응답을 캐시하지 않는다.

## 11 연구 발행 계약

ResearchRelease는 네 파일 technical.ko.md, technical.en.md, guide.ko.md, guide.en.md를 동일 version·data_cutoff·dataset/model/metrics hash에 연결한다. 한국어 원고가 정본이다. JSON results에서 표·차트 숫자를 가져오고 원고의 서술은 별도로 검토한다.

draft→in_review→ready→published의 편집 상태를 사용한다. 발행된 버전을 수정하면 새 버전으로 시작하고 이전 것은 superseded로 연결한다. withdrawn은 홈페이지 안내 상태이며 이미 공개된 Git의 삭제를 뜻하지 않는다. draft도 공개 저장소에서 읽을 수 있다.

publish 요청은 네 원고의 존재, 번역 상태, hash/version 일치, 참고문헌, 공개 데이터 권리, 실제/가상 구분, peer_review_status를 검사한다. 실패하면 422와 항목별 오류를 반환하고 초안을 유지한다. 동료심사를 하지 않았다면 not_peer_reviewed로 명시한다. unsafe HTML/MDX는 실행하지 않는다. 모델 배치가 원고를 자동 발행하지 않는다.

### 11.1 연구 저장 API와 불변 경로

`research-release`와 `research-results` schema 1.0을 사용한다. `/api/admin/research` GET/POST와 `/{locale}/admin/research`는 자체 관리자 세션을 요구한다. POST는 Origin·CSRF·600KB 요청 상한·HMAC 멱등키·expected_revision을 검사한다. metadata의 추가 필드, 누락 원고, 결과/context/hash 불일치와 unsafe Markdown은 첫 Git blob 전에 거부한다. 오류는 422·field_errors이며 기존 입력을 보존한다.

초안은 `research/{slug}/versions/{version}/revisions/{revision}/`에 manifest·results·네 원고를 불변 저장한다. current pointer·research/index.json·ledger·audit를 같은 non-force commit으로 갱신한다. ready/published는 네 본문·참고 자료·translation/narrative/rights/real_synthetic/results 검토 확인을 요구한다. 발행 시 `research/{slug}/releases/{version}/`을 같은 commit에 생성한다. 이미 발행한 버전은 본문 수정 불가, 개정판은 새 version과 change_reason을 요구한다.

frontmatter는 version/data_cutoff/model_version/dataset_sha256/results_sha256/audience/locale의 JSON quoted 문자열만 허용한다. 각 원고에서 숫자 표 literal을 거부하고 `{{metrics.<key>}}`·`{{results}}`로 수치를 연결한다. 제한된 Markdown은 React text로 escaping하며 HTML·MDX·이미지·HTTPS/fragment 이외 링크는 거부한다. 본문 서술 검토는 자동 검사로 대신하지 않는다.

공개 reader는 한 data head를 고정하고 index와 immutable release hash·네 문서·results를 검사한다. published는 기본 목록, superseded는 이전 버전, withdrawn은 본문 없는 안내다. draft/in_review/ready는 홈페이지에서 읽지 않는다. 서버 초안은 공개 Git에 존재한다. 웹 원고는 `/{locale}/research/{slug}/{technical|guide}?version={version}`으로 열람하며 언어 전환에서 version을 유지한다.

### 11.2 FES 재사용 계약

`fes_cache prepare`는 독립 참조 비교가 통과한 atlas로 기본 60일·30분 조석값과 양끝 2시간을 직접 계산한다. 생성 시각·atlas/config·SDK·계산 코드·geometry·source hash·conformance·attribution을 manifest에 보존한다. data 저장 경로는 `tides/ephemerides/{manifest hash}/{manifest.json|heights.json.gz}`만 허용하며 NetCDF는 금지한다.

trusted code의 config/fes-derived.json은 manifest와 gzip hash를 고정한다. 일반 hosted 수집은 같은 data head의 두 파일을 읽고 hash·구조·좌표·source·계산 코드·기간을 검증한다. 생성 환경 SDK 버전은 provenance로 보존하고 hosted SDK와 같다고 가장하지 않는다. FES_DERIVED_ROOT가 설정되면 실패 시 원 atlas로 fallback하지 않는다. 유효 범위 밖·비정렬 시각·결측·변조는 fail closed다. 원래 생성 시각은 samples.retrieved_at에 유지하고 issued_at은 null이다. 새 snapshot의 실제 저장 cutoff는 별도 receipt/confirmation으로 판단한다.

## 12 검증과 재현

주 검증은 날짜 순서 expanding/rolling window다. 동일 WITA 날짜의 모든 관측과 Peak·파생행은 같은 fold다. training 시점 이후 수정 정보·feature scaler·bias를 사용하지 않는다. LODO는 추가 진단으로 분리하고 미래 데이터를 포함했다면 실제 D+1 성능으로 표기하지 않는다.

검증 manifest는 train/test 날짜, 사용 가능한 당시 snapshot과 label revision, 코드·model·scaler·feature 버전, baseline, MAE·median absolute error·큰 오차·제공률·abstention을 포함한다. tuning은 training fold 내부에서만 수행한다. 숫자 출력이 적어진 것만으로 성능 개선을 주장하지 않는다.

| 영역 | 최소 검증 |
|---|---|
| auth | 잘못된 계정·비밀번호, login CSRF, 만료/변조, 버전 변경, 실제 WAF, 옛 URL |
| storage | 이중 탭, 재로그인 재시도, 같은 key 다른 본문, stale ETag, branch 경쟁, 응답 유실 |
| schema | forbidden field, unknown enum, null/0, finite number, 1.0 초과, Peak 관계 |
| features | 진북/동향 벡터, 359/1도 방향, 보간 경계, 육지 셀, zero IQR, 동일 mask |
| model | 한 label, 같은 날 세 label, 3일 gate, ESS, zero weight, 수직 unknown 제외 |
| snapshot | cutoff 전후 receipt, 지연 seal, backfill 분리, immutable overwrite 거부 |
| UI | 360px, 키보드, 오류 복구, ko/en, WITA 자정, partial/stale 표시 |
| research | 네 문서 누락, metric 불일치, 새 버전, draft 공개 안내 |

각 검증은 PRD §13의 acceptance ID와 PLAN 작업 ID로 연결한다. 실제 provider와 배포 검증이 없으면 fixture 통과만 기록한다. 앱 테스트와 별개로 문서의 표·JSON 예시·교차 참조가 유효해야 한다.

## 13 구현 전 확정할 설정

FES2022b·Copernicus dataset/version·공개 파생 변수는 config/source-registry.json, 승인된 19 Site 좌표·대표 수심 18m·허용 거리 6km·지도 근사축은 config/geometry.json에 등록되어 있다. 근사축은 reference_geometry이며 Zone 위치·실측 벽 방향·High 허용 오차는 미확정이다. 실제 공급 metadata·freshness는 매 실행 재검증한다. 로컬 관리자/PAT 설정과 production Secrets·domain·WAF 운영 검수는 구분하며 값이 없으면 fail closed다.

스키마·API·모델 계약을 바꾸면 SPEC 버전과 실제 schema/model 버전을 함께 검토하고 fixture·migration·PRD 영향·PLAN 작업을 갱신한다. 기록 저장을 공개→비공개로 바꾸거나 외부 OAuth/DB를 추가하는 변경은 단순 구현 세부가 아니라 제품 결정 변경이다.

### 환경 종합 표시

선택 Site·WITA 날짜의 PCI, 조석과 u/v, 모델 수온, 염분, 10m 바람·방향, 파고·주기·방향, 너울 높이·주기·방향을 함께 표시한다. 환경 값은 예측 PCI와 단위를 섞지 않는다. 일 범위는 제공 시각의 min/max이며 하루 전체 coverage를 주장하지 않는다. 방향은 circular min/max 대신 시각별 점·값을 표시한다. 수치가 없는 경우 공개 권한·geometry·freshness·결측 사유를 보존한다. source 실패 또는 나이 미확인 자료를 유효 환경값으로 표시하지 않는다.

달은 USNO Complete Sun and Moon Data for One Day API의 해당 날짜 WITA 정오 위상·밝은 면 비율을 사용한다. 고정 HTTPS endpoint, 4초 timeout, 16KB 응답 제한, 24시간 cache, 좌표·날짜·위상·비율 검증을 적용한다. API 실패는 달만 미제공으로 처리한다. 달 모양은 위상 도식이며 관측 사진·현지 하늘 방향을 뜻하지 않는다. 천문 metadata는 forecast snapshot 밖의 별도 표시 자료로 구분하며 PCI feature나 weight를 추가하지 않는다. 가입·API key·신규 환경변수는 필요 없다.

### 2026-10-04 관측 입력 결정

WITA 오늘 날짜를 기본으로 제시하고 입수 시각만 선택하면 출수 +50분을 제안한다. 출수 수동 변경 후 입수 변경은 사용자가 정한 출수를 유지하며 시간 순서를 다시 검사한다. 출수는 신규·정정 저장의 필수값이며 시작보다 늦어야 한다. 자정 통과는 다음 날 선택으로 명시한다. schema 1.4의 local_end/end_at은 null을 허용하지 않는다. 기존 1.0–1.3 기록과 이미 성공한 멱등 요청은 그대로 읽거나 복구한다. 과거 출수를 자동 보충하지 않는다.

관리자 목록은 입수 시각 내림차순, 동률은 생성 시각·ID 순이다. 페이지 cursor는 같은 Git head와 정렬 방식을 고정한다. 불러오는 동안 상태를 표시하고 완료 전 빈 목록으로 안내하지 않는다. 신규 Zone·경로·Peak 입력은 제거하고 기존 값은 보존한다. Peak가 없는 상세·정정 화면은 사건 섹션을 표시하지 않는다. 2026-10-05 사용자 결정에 따라 대표 관측 수심은 필수, 신규 기본값은 18m다. 저장 시 확인·수정하며 null 복원 초안은 임의로 채우지 않는다. schema 1.5는 대표 관측 수심 number와 출수 시각을 요구한다. 기존 1.0–1.4 null 기록·성공 요청 재시도는 호환한다. 기존 null 관측의 18m 지정은 사용자 명시 승인에 따른 개별 정정 revision으로 기록하고 원본 PCI·시각·사건·label_scope를 보존한다. 18m를 실측 평균 수심으로 표현하지 않는다.

### 연구 검토와 조회 경계 보강

원고·결과·metadata 편집은 editor의 review flags를 초기화하고 draft로 전환한다. ready→published 요청은 서버에 저장된 ready 원고·결과·핵심 metadata와 일치해야 한다. 응답 손실 시 동일 요청 확인 전 입력을 잠가 재시도 성공으로 새 편집 내용을 덮어쓰지 않는다. 목록 revision보다 상세 응답 revision을 저장 조건으로 사용한다. 공개 목록은 20개씩 metadata만 조회하며 상세는 선택 release만 조회한다. 조회 전체 시간 15초·누적 8MB 제한을 적용한다. 목록의 손상된 개별 release는 다른 항목을 차단하지 않으며 부분 실패 안내를 표시한다.

### 공개 대시보드 날짜 선택·공급 시각 보정 (2026-10-08)

- `loadPublicRelease(day)`는 선택 WITA 날짜 전체를 포함하는 immutable 공개 package를 사용한다. 최신 package가 내일부터 시작하면 `web/latest.json`의 최근 Git commit 이력 12개 범위에서 기존 package를 조회한다. GitHub 공개 API는 5분 재검증 cache, manifest/dashboard는 고정 commit 경로·hash·schema·크기·freshness 검사 유지. main/data의 실행 코드를 읽지 않는다. 이력 조회 실패/범위 밖은 reason을 표시하고 값을 만들지 않는다. API 제한·잦은 수동 발행으로 12개를 초과할 경우를 위한 날짜 index는 P7 개선 대상으로 남긴다.
- 메인·Site 상세 모두 같은 날짜 선택 함수를 사용한다. 무인자 공개 status/관측 조회는 최신 package 호환 유지. 선택 package의 생성 시각을 항상 표시한다. 과거 package의 관측도 당시 package 범위이며 최신 revision 전체를 과거 forecast에 혼합하지 않는다. 공개 experimental package 조회와 공식 D+1 seal은 구분하며 seal을 교체하지 않는다.
- 자료 연결 정상은 `공개 자료 연결됨`, 현장 성능은 `현장 예측력 미검증`으로 독립 표시한다. 자료 없음·stale·환경/label 부족은 해당 상태를 보존한다.
- 환경 비교표는 등록 Site 전체의 u/v·바람 방향·파고에 공통으로 존재하는 실제 공급 시각 중 정오에 가장 가까운 시각을 선택하고 WITA로 명시한다. 동률은 이른 시각이다. 모든 Site/열은 같은 시각이며 개별 Site 최근접 시각 대체나 보간을 하지 않는다. 중복·금지 quality·stale·범위 밖·결측 값은 null 유지한다. 공통 시각이 없으면 그 사유를 표시한다. graph의 원시각 자료와 PCI gate는 변경하지 않는다.

### 공개 작업 화면 통합 (2026-10-08)

공개 canonical 경로는 `/`와 `/research`다. lang=ko/en, date/site/model, audience=guide/technical, slug/version query를 escaping한 URL로 보존한다. 이전 locale/Site/연구 세부 URL은 의미에 맞는 canonical 경로로 redirect한다. 관리자/API 경로의 인증·CSRF·no-store는 유지한다.

메인은 공통 날짜/모델/달(확보 시)/생성 상태 헤더와 왼쪽 Site 표·오른쪽 선택 Site 그래프 2열이다. Site 링크는 같은 `/`의 query를 변경한다. 등록 Site와 최신 package 관측 수를 기준으로 정렬하며 특정 Site/날짜/관측 건수를 하드코딩하지 않는다. PCI·Copernicus 모델 조류 속력·FES 조석은 각각 무차원/m/s/m 단위와 실제 시각으로 표시한다. 현재 Site 수준 18m/6km/reference_geometry·numeric gate·null·결측 구간 단절 계약은 바꾸지 않는다. 공통 공급 시각의 동향 u/북향 v·바람 방향·파고를 표에 보존한다.

메인의 graph 읽기/help/details는 제거하고 필요한 미제공 reason만 유지한다. 기본 PCI와 Site 간 실험은 명시 선택, support는 실제 prediction metadata에서 결정한다. 원고 페이지는 최신 published metadata 한 개를 선택한 뒤 해당 release의 네 문서/results를 검증한다. 미선택 과거 문서 오류 때문에 최신 원고를 숨기지 않는다. 원고 자체와 frozen 연구 결과는 수정하지 않는다. legacy URL로 이전 version도 열람 가능하다.

라이선스/출처 표기는 메인의 간결한 footer에 유지하며 상세 정책은 각 공급자 license URL로 연결한다. 도움말 제거가 필수 attribution 제거를 뜻하지 않는다.

### 불변 환경 입력 참조 encoding (2026-10-08)

신규 model snapshot의 저장 JSON은 `encoding=snapshot-environment-references-v1`, `manifest`, `training_bundle_references`, `expanded_manifest_sha256`만 갖는 envelope를 지원한다. manifest의 model context에서는 training_bundles를 빈 배열로 두고, 순서가 보존된 참조마다 `environment-inputs/<sha256>.json.gz` 경로와 저장 바이트 SHA-256을 기록한다. decoder는 고정 Git commit 또는 로컬 output에서 입력 파일을 읽고 hash·경로·중복·개별 크기·10,000개 상한을 검사한 뒤 원 manifest를 복원하여 expanded hash와 기존 schema·licence·forecast replay를 검증한다. 참조 파일에는 이미 검증된 environment-only bundle만 허용한다. 기존 저장 encoding·snapshot/model schema와 계산 의미는 유지하며 과거 input을 자동 삭제하지 않는다.

### P7 운영 비교·배포 계약 (2026-10-09)

- collect/seal 뒤 같은 chain에서 공식 D+1 comparison을 저장한다. `validation/d1/<date>/<input SHA-256>.json`은 새 `d1-comparison` allowlist schema를 따른다. 같은 입력의 동시 재시도는 첫 확인된 bytes를 재사용한다. 관측 revision·철회·날짜 이동은 새 불변 comparison으로 반영한다.
- 공식 seal의 run/manifest/storage commit과 실제 receipt confirmation을 대조한다. cutoff 이후 저장·backfill·현재 재계산 PCI를 공식 예측으로 바꾸지 않는다. observer/rubric별 지표를 분리하고 실제 다이빙과 60분 슬롯의 근사 시간 차이를 저장한다.
- 수치 재생의 플랫폼 roundoff는 absolute/relative 1e-12 범위에서만 허용한다. 원본 hash·설정·scaler identity·gate·문자열·구조는 정확히 검사한다. 원본 저장 파일과 과거 예측은 변경하지 않는다.
- Vercel preview/development 관리자 인증은 enabled 값과 무관하게 차단한다. Production Secret은 preview/외부 PR과 분리하고 data Git 배포를 비활성화한다. 실제 production WAF·Origin·옛 deployment 차단은 외부 운영 acceptance로 확인한다.


### 공개 metadata·문서 계약 (2026-10-09)

공개 두 경로의 Metadata API는 ko/en 제목·설명·Open Graph·Twitter summary와 canonical/언어 alternates를 제공한다. 대시보드의 날짜·Site·모델 변형은 언어별 대표 URL로 canonical을 정리한다. 연구는 audience와 명시 slug/version을 보존한다. 관리자 경로는 기본 noindex, robots는 관리자/API crawl을 제외하며 인증 경계는 그대로다. sitemap은 공개 언어·원고 독자 경로만 포함한다.

헤더의 소스 링크는 연구 메뉴 뒤에 둔다. 연구 페이지의 진행 중 안내는 현재 운영과 보고서의 frozen 결과를 구분하며 새 수치나 성능 주장을 추가하지 않는다. v1.0.2는 검토용 body 원고와 version이 일치하는 results를 묶고, 발행된 v1.0.1은 불변 보존한다.
