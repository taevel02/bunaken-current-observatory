# Bunaken Current Observatory 개발 지침

이 파일은 저장소 루트에 두는 개발 에이전트와 기여자의 작업 지침이다. 제품 요구사항의 정본은 같은 디렉터리의 `PRD.md` v1.12이다. 2026-09-27 결정에 따라 외부 OAuth와 비공개 저장소를 사용하지 않는다. 기본 작업·보고 언어는 한국어다. 제품은 한국어 우선이며 영어를 함께 지원한다.

이 문서와 PRD는 구현 계획이다. 존재하지 않는 코드·명령·배포·테스트 결과를 있다고 보고하지 않는다. 첫 구현에서 실제 구조와 실행 명령을 만든 후 README와 이 문서의 명령 안내를 함께 갱신한다.

## 1 작업 순서

1. `PRD.md`, 해당 디렉터리의 더 구체적인 지침, 관련 코드·스키마·테스트를 먼저 읽는다.
2. 사용자 요청의 범위와 현재 저장소 상태를 확인한다. 사용자의 기존 변경을 덮어쓰지 않는다.
3. 작은 단위로 구현하고 영향받는 계약·번역·문서를 함께 수정한다.
4. 실제 실패 위험을 다루는 검증을 수행한다. 실행하지 못한 검증과 원인을 보고한다.
5. 완료 보고에는 바뀐 사용자 동작, 검증 결과, 남은 의존 설정을 간결하게 적는다.

일상적인 가역적 구현 선택은 스스로 진행한다. 모호한 내용을 채우기 위해 관측값·Site geometry·자격증명·공급 데이터·연구 결과를 만들지 않는다. 문서 작성 요청을 배포나 실제 데이터 발행까지 확대하지 않는다. 외부 공개·삭제·이력 재작성은 현재 요청에서 승인된 범위인지 확인한다.

하위 지침은 국소 구현 방식을 구체화할 수 있지만 제품 불변 조건을 조용히 바꾸지 않는다. 충돌하는 요구가 생기면 차이와 영향을 설명하고 PRD·schema·migration을 같은 변경에서 다룬다.

## 2 제품 불변 조건

- 공개 대시보드·연구 원고는 `/`와 `/research`에서 로그인 없이 읽는다. 공개 관측 JSON은 data branch에 보존하며 PCI 기준은 연구 원고와 관리자 입력 도움말에서 설명한다. 이전 public URL은 canonical 경로로 연결한다.
- `/admin`과 모든 관리자 API는 서버의 자체 세션 검증을 통과해야 한다. 로그인 페이지·CSRF 발급·비밀번호 제출만 미인증 진입점이다.
- 별도 서버 DB를 도입하지 않는다. Supabase, Firebase, SQL/NoSQL, Redis/KV 및 인증 DB adapter를 추가하지 않는다.
- 하나의 공개 GitHub 저장소에서 main은 코드, data는 JSON·연구 파일을 보관한다. 두 branch 모두 공개이며 비공개 저장소를 만들지 않는다.
- 서버 함수의 임시 디스크나 메모리를 영구 저장소로 사용하지 않는다.
- 한국어가 기본 언어이며 정식 UI·PCI 기준은 ko/en을 함께 제공한다.
- 모바일 기록의 완료·실패·복구 흐름은 데스크톱과 동등한 필수 기능이다.
- 추천 점수, 안전 판정, 다이빙 가능/불가 판정 또는 현장 유속처럼 보이는 PCI 환산값을 만들지 않는다.
- LLM API를 수집·예측·기록의 필수 런타임 의존성으로 추가하지 않는다.

## 3 관측과 PCI

PCI는 관찰자별 무차원 전체 체감 강도다. v1의 `overall_pci`는 다이빙 대표 수준이고 `peak_pci`는 별도 사건 label이다. 순수 수평 강도, m/s, 확률, 위험도와 동일시하지 않는다. 상한은 1.0이 아니며 0 이상의 유한 값을 허용한다.

2026-09-19 Mandolin의 사용자 확인 Overall 0.7·Peak 1.0과 down 보고를 보존한다. 약 11:00/15m의 초기 사건 정보는 원래 precision으로 보존하며 알려지지 않은 Zone, 정확 시각, 수직 강도와 환경값을 확정하지 않는다. `legacy_unspecified` 기록은 의미 확인 전 numeric training에서 제외한다. 화면의 anchor 보존과 학습 적격 판단은 별개다.

과거 weak/normal을 숫자로 바꾸지 않는다. 9/23의 유속을 9/24에 복사하지 않는다. Windy 보고 값을 Copernicus 관측으로 가장하지 않는다. 가상 사례는 `synthetic` fixture에 두고 실제 초기 데이터에 섞지 않는다.

`null`, `unknown`, `none`, `0`을 구분한다. 수직 방향은 unknown/none/down/up/mixed를 지원한다. PCI=1.0이라는 이유로 vertical intensity=1.0을 생성하지 않는다. 사용자가 다이빙 중 강도를 시험하는 행동을 하도록 입력 안내를 작성하지 않는다.

모든 관측은 observer/rubric/schema 버전을 갖는다. 수정은 revision과 이유를 남긴다. 사용자 원문과 자동 환경 결합을 별도로 저장한다. 학습 여부는 서버가 적격 조건과 `use_for_model`로 결정하며 client가 `train_eligible`을 설정할 수 없다. 서버에 저장한 관측은 공개다. `use_for_model=false`는 학습 제외이며 공개 취소가 아니다. record_status=withdrawn이어도 과거 Git 이력은 남는다.

## 4 모델과 검증

초기 엔진은 Weighted Analog다. 초기 weight는 Tide 0.30, Ocean 0.35, Thermal 0.15, Weather 0.10, Depth 0.10이다. Site/Zone multiplier는 환경 거리 이후 적용한다. quality와 provenance도 별도 가중치다. 숫자는 config와 model version에 두고 과학적으로 확정된 상수라고 쓰지 않는다.

숫자 PCI는 PRD의 모든 gate를 통과한 경우만 반환한다. 최소 조건은 적격 numeric label 3개, 서로 다른 관측일 3일, N_eff 2 이상, 유효 analog 3개, 같은 Site 기록 1개, 충분한 환경 feature다. 같은 날 세 번의 다이빙을 독립적인 세 날로 세지 않는다. 2026-10-07 사용자 승인 `site-transfer-v1`만 별도 실험 예외를 적용한다. 목표 Site label을 제외하고 donor Site 3개·3일·3 analog, N_eff/N_eff_days/N_eff_sites 각각 2 이상, 최대 Site 기여 50% 이하를 요구한다. 기본 PCI에 대입하거나 학습 label로 재사용하지 않으며 항상 experimental/very_low·unvalidated로 표시한다. 표시 불가면 null과 reason code를 반환한다. PCI 한 개로 새로운 예측 숫자를 만들지 않는다.

Support는 N_eff뿐 아니라 날짜·Site/Zone coverage와 검증을 고려한다. 관측 confidence, 데이터 support, 예측 불확실성, 안전성은 서로 다르다. 검증되지 않은 신뢰구간·확률을 생성하지 않는다. 데이터 건수에 따라 GAM을 자동 승격하지 않는다.

- 주 검증은 시간 순서 전진 검증이다. 동일 WITA 날짜의 dive/Peak/파생행을 같은 fold에 둔다.
- Leave-One-Day-Out은 별도 진단이다. 미래 날짜를 학습에 포함했다면 D+1 운영 성능으로 표기하지 않는다.
- scaler, 수온 bias, feature 선택, 튜닝은 training 정보만 사용한다.
- overall은 실제 dive 구간의 feature, 예측은 기준 60분 구간의 feature를 사용한다. peak label을 섞지 않는다.
- label 없는 장기 환경 분포로 표준화하되 검증 시점 이후 자료를 사용하지 않는다.
- 같은 observer와 호환 rubric만 함께 학습한다. 여러 관찰자를 보정 없이 합치지 않는다.
- baseline·예측 제공률·abstention·큰 오차를 함께 보고한다. 유리한 사례만 선택하지 않는다.
- 수직 unknown은 known 분모에서 제외한다. 소수 down 사례를 down 확률로 표시하지 않는다.

Anchor 환경을 복원하지 못하면 similarity도 제공하지 않는다. 높은 similarity는 높은 PCI나 위험 확률이 아니다. group 결측을 0으로 대체하거나 실제 geometry 없이 유사한 Site 그룹을 만들지 않는다.

## 5 시간과 환경 자료

서비스 날짜·스케줄·검증 그룹은 `Asia/Makassar`다. 저장 시각은 UTC ISO 8601이며 원래 로컬 입력과 precision을 보존한다. 기기의 시간대나 UTC 날짜로 관측일을 잘못 나누지 않는다.

FES는 조석 정보이며 높이 또는 변화율을 현장 조류로 표시하지 않는다. Copernicus의 제품명만 보고 모든 depth/variable의 해상도를 동일하게 가정하지 않는다. u/v는 동향/북향 속도이며 벽과 외해의 확인된 bearing으로 투영한다. 수평 유속의 수심 차이는 수직 속도가 아니다.

사용자가 승인한 지도 근사값은 `reference_geometry`로 보존한다. 빨간 진행축은 실측 벽 방향이 아니며 파란 외해축과 독립 투영한다. 이 상태는 실측 `verified`로 승격하지 않는다. target 또는 선택 analog가 근사 geometry이면 numeric gate 통과 후에도 `experimental / very_low`로 제한한다. Zone 위치 근거가 없으면 Site 수준으로 계산하고 가상의 Zone·geometry 그룹을 만들지 않는다.

시간·수심 보간은 유효한 두 지점 사이에서만 한다. 범위 밖은 null이고 원해상도를 metadata에 남긴다. 육지 셀·격자 거리·수심 범위를 검사한다. modelled temperature와 observed temperature를 분리한다. 30분 보간으로 30분 원자료가 생겼다고 표현하지 않는다.

Snapshot은 immutable이다. source issued/retrieved/valid time, 실제 저장 시각, dataset/version, geometry, scaler, code hash를 보존한다. D+1 공식 snapshot은 전날 WITA 20:00 이전 실제 저장된 성공 run만 선택한다. 늦은 재실행이나 analysis backfill로 과거 forecast를 덮어쓰지 않는다.

필수 소스가 누락·stale이면 새 숫자 예측을 발행하지 않는다. 이전 결과를 보여줄 때 생성 시각과 오래된 예측임을 명시한다. license/attribution이 확인되지 않은 원자료를 공개 저장소에 복사하지 않는다.

## 6 자체 인증과 비밀정보

외부 OAuth·소셜 로그인·로그인용 GitHub App·사용자 DB를 추가하지 않는다. 관리자는 `/admin/login`에서 아이디·비밀번호로 로그인한다. ADMIN_USERNAME, ADMIN_PASSWORD_HASH, ADMIN_ENABLED, ADMIN_AUTH_VERSION, SESSION_SECRET은 서버 환경변수로 관리한다. 비밀번호 해시는 salt와 파라미터를 포함한 Argon2id encoded hash를 기본으로 하고 검증된 라이브러리를 사용한다. 런타임 제약 시 문서화한 scrypt 대안을 사용한다. 평문 비밀번호·단순 SHA-256·직접 만든 암호 프로토콜은 금지한다.

로그인 성공 시 인증된 암호화 세션 쿠키를 새로 발급한다. Secure/HttpOnly/SameSite=Lax와 `__Host-` 조건, 12시간 절대 만료, auth_version 검증을 적용한다. 쿠키에 비밀번호·해시·GitHub 토큰을 넣지 않는다. 관리자 페이지와 각 API 핸들러에서 enabled·세션·버전을 검사한다. Middleware나 메뉴 숨기기만으로 보호했다고 간주하지 않는다.

로그인 자체를 포함한 모든 쓰기에 CSRF·Origin 검사를 적용한다. 틀린 아이디와 비밀번호는 동일한 일반 오류를 반환한다. 환경변수 누락·잘못된 해시·disabled이면 fail closed로 동작하고 개발 기본 비밀번호를 사용하지 않는다. 보호 응답은 private/no-store다.

인증 전 `/api/auth/login` POST에 Vercel WAF IP별 5분당 10회 제한을 초기값으로 적용하고 초과는 429다. 실제 배포 규칙을 검증한다. 카운터가 지역 단위라는 제약을 밝히며 서버 메모리 카운터를 전역 제한으로 가장하지 않는다. 공개 Git 파일에 로그인 시도/IP/인증 실패 정보를 저장하지 않는다. 별도 Redis/KV를 도입하지 않는다.

비밀번호 변경·전체 세션 철회는 해시/auth_version 또는 세션 키를 바꾼 뒤 production을 재배포하는 절차다. 환경변수 변경만으로 과거 배포까지 즉시 무효화한다고 주장하지 않는다. 옛 deployment URL의 관리자 접근을 차단하고 유출 시 옛 배포를 중지한다. DB 없이 개별 탈취 세션을 즉시 철회할 수 있다는 주장을 하지 않는다.

GITHUB_WRITE_TOKEN은 홈페이지 로그인 수단이 아니라 JSON 저장용 fine-grained PAT다. 선택한 공개 저장소의 Contents 쓰기만 허용하고 만료·회전을 관리한다. 서버는 data branch와 허용 경로만 쓴다. 토큰 자체에는 파일 경로별 권한이 없으므로 토큰 유출의 피해를 서버 경로 검사만으로 제한할 수 있다고 설명하지 않는다. main 보호 규칙을 적용한다.

IDEMPOTENCY_SECRET은 raw 요청 key 대신 공개 ledger용 digest를 생성하는 별도 HMAC key다. 인증 설정, 해시, 토큰, 쿠키, raw idempotency key, IP는 공개 Git·로그·클라이언트 bundle·NEXT_PUBLIC 변수·source map에 넣지 않는다. `.env.example`에는 placeholder만 둔다. 로그인 ID와 공개 observer 별칭도 분리한다.

외부 PR/preview에는 production secret을 제공하지 않는다. `pull_request_target`에서 외부 코드를 secret과 함께 실행하지 않는다. 저장 API가 workflow·코드·인증 설정을 임의로 바꾸게 하지 않는다.

## 7 Git 저장과 공개 발행

관측 revision, current pointer, idempotency, audit를 원자적인 한 commit에 반영한다. 현재 head를 parent로 Git tree/commit을 만들고 ref를 `force=false`로 갱신한다. branch head 충돌 시 다시 읽고 조건을 검사한다. 같은 관측의 revision이 바뀌었으면 409로 반환한다.

- 같은 key와 같은 본문은 기존 성공 결과를 반환한다. 공개 ledger는 stable 관리자 subject와 key의 HMAC digest만 저장한다. 재로그인 후에도 같은 key가 유지돼야 한다.
- 같은 key와 다른 본문은 409다.
- 저장 commit과 branch 반영을 확인하기 전에는 성공을 반환하지 않는다.
- 저장 요청 timeout은 같은 key 조회/재시도로 해소한다.
- 서버 메모리 lock이나 Actions concurrency만으로 웹 동시성이 해결됐다고 가정하지 않는다.
- 정상 운영에서 force push 또는 기록 이력 삭제를 사용하지 않는다.

첫 Git commit 전에 저장 API가 공개 allowlist 스키마로 JSON을 구성한다. notes_private·password·token 등 금지 필드와 알 수 없는 필드는 거부한다. 공개 저장소에 먼저 저장하고 나중에 공개 필드를 제거하는 방식은 금지한다. 자유 텍스트의 민감정보를 자동으로 완전히 판별할 수는 없으므로 폼에 공개 범위를 명확히 표시한다.

관측은 공개 저장 버튼으로 바로 commit하며 별도 private→publish 단계를 만들지 않는다. 저장소 공개와 홈페이지 캐시 갱신은 구분한다. 웹 패키지를 모두 검증한 뒤 latest manifest를 갱신한다. 공개 철회가 과거 Git 이력까지 지운다고 설명하지 않는다. 대규모 원 NetCDF·비밀 키·개인정보·재배포 불가 원자료는 commit하지 않는다. 연구 draft는 공개 가능한 원고만 저장한다.

## 8 모바일과 다국어

관리자 관측 폼은 360px 너비부터 설계한다. 최소 44px 터치 영역, 16px 본문, 숫자 키보드, 직접 숫자 입력, 명확한 필수/선택 구분을 제공한다. 저장 버튼을 소프트 키보드가 가리지 않아야 한다. 슬라이더만으로 수치를 입력하게 하지 않는다. 다이빙 시각·PCI·수직 방향을 자동 확정하지 않는다.

저장 실패·연결 끊김·세션 만료에서 입력값을 보존한다. 공개 저장소 저장과 기기 임시저장, 홈페이지 반영을 구분한다. IndexedDB 초안은 명시 동의, 계정별 구분, 인증 후 복원, 보존 기간·삭제 규칙을 적용한다. 초안에 토큰을 저장하지 않는다. 오프라인 신규 관리자 접속을 우회 허용하거나 관리자 응답을 서비스워커에 캐시하지 않는다.

UI 문자열을 translation key로 관리하고 ko/en 누락 검사를 둔다. `/`는 한국어로 시작한다. 언어 전환은 Site·날짜·화면 상태를 유지한다. 날짜 표기만 현지화하며 기준 시각은 WITA다. raw error와 영어 전용 버튼을 그대로 노출하지 않는다. 색 이외의 상태 설명과 키보드 접근을 제공한다.

## 9 연구와 콘텐츠

연구 release는 technical.ko, technical.en, guide.ko, guide.en 네 문서와 하나의 결과 manifest를 연결한다. 서버에 저장한 draft도 공개 저장소에서 읽을 수 있다. 홈페이지의 미발행 상태를 비공개 보관으로 설명하지 않는다. 비밀 초안이 필요하면 서버에 저장하지 않고 기기 초안/로컬 파일로 유지한다. 전문가용과 일반인용의 데이터 cutoff·수치·모델 버전·한계가 일치해야 한다. 한국어 원고가 정본이다.

실제 검토하지 않은 문헌을 근거로 인용하거나 데이터가 없는 결과·DOI·동료심사 상태를 만들지 않는다. 독립적인 자체 보고서는 그 상태를 명시한다. 실제 관측과 합성 예시를 구별하고 상관을 인과로 설명하지 않는다.

관리자 콘텐츠는 실행 가능한 MDX가 아닌 안전한 Markdown과 구조화 metadata다. HTML/script를 차단하고 escaping·CSP를 적용한다. 발행 전에 네 문서·번역·숫자 일치·출처·개인정보·권리를 검증한다. 공개 버전 수정은 새 release와 변경 이력을 만든다. 모델 업데이트가 연구 결론을 자동 발행하지 않게 한다.

## 10 구조와 기술 선택

기본안은 Next.js/TypeScript 웹, Python 엔진, JSON Schema 계약, Vercel 서버 함수, GitHub Actions다. 구체 버전은 구현 시 지원 상태를 확인한 뒤 lockfile로 고정한다. 실제 코드를 읽기 전 특정 패키지가 설치되어 있다고 가정하지 않는다.

주요 경로는 `apps/web`, `packages/contracts`, `engine`, `config`, `docs`, `tests`, `ops/workflows`다. 공개 code의 고정 commit/tag에서 신뢰된 운영 코드를 가져온다. data branch의 데이터·연구 원고가 실행 코드를 주입하게 하지 않는다. 외부 Actions는 immutable commit SHA로 고정한다. 예약 workflow는 main에 두고 data push는 설치 시 둔 trusted entrypoint에서 고정 commit의 reusable workflow를 호출한다. GITHUB_TOKEN commit이 다음 workflow를 자동으로 실행할 것에 의존하지 않고 필요한 단계를 한 chain에서 이어 실행한다. data 변경에 Vercel preview build를 만들지 않는다.

소스 adapter, 순수 feature 함수, Analog core, storage adapter, auth, public exporter의 책임을 분리한다. 단위는 field 이름과 schema에 명시한다. 변경된 model/rubric/schema는 버전을 올리고 compatibility·migration을 함께 작성한다. 실험적 모델을 production 기본값으로 조용히 교체하지 않는다.

## 11 검증과 완료 조건

변경과 관련된 검증을 선택하되 다음 경계는 빠뜨리지 않는다.

| 변경 | 필요한 핵심 검증 |
|---|---|
| 인증·관리자 API | 틀린 비밀번호, 변조/만료, login CSRF, Origin, 실제 WAF 제한, 환경변수 재배포 후 철회 및 no-store |
| 저장 | 멱등 재시도, 본문 불일치, 동시 수정 409, unrelated branch 경쟁, timeout 복구 |
| 엔진 | 숫자 gate, 결측, 방향 투영, 보간 경계, weight/ESS, zero-weight, 날짜 누수 |
| snapshot | cutoff, source provenance, immutable 재실행, backfill 분리 |
| 모바일 | 360px, 키보드, 1.0 초과 입력, 통신 실패, 세션 만료, 다른 계정 |
| 공개 저장 | 금지 필드가 첫 commit 전 거부됨, 공개 JSON·revision 직접 누적, raw 요청 키/인증 비밀 유출 없음, license allowlist |
| i18n | ko/en 동일 기능, 번역 키, WITA 날짜 경계 |
| 연구 | 네 문서 준비, metric hash 일치, 새 버전 발행, unsafe Markdown 차단 |

실제 credential 없이 돌아가는 합성 fixture와 provider mock을 기본 테스트에 사용한다. 실제 API smoke test는 설정이 있을 때만 별도로 실행하고 rate limit·비용을 고려한다. 잘못된 expected 값을 구현에 맞춰 테스트를 통과시키지 않는다.

현재 이 문서만으로 실행 명령이 존재한다고 가정하지 않는다. 구현 시 README에 install, dev, lint, typecheck, unit, integration, e2e, engine test, production build 명령을 실제 설정 그대로 기록한다. 명령을 실행했다면 exit 상태와 중요한 결과를 확인한다.

완료 전 확인 사항:

1. PRD의 관련 acceptance ID가 충족되거나 미완료 사유가 명확하다.
2. ko/en, 모바일 오류 흐름, 스키마·migration·문서가 구현과 일치한다.
3. 인증 비밀·개인정보·raw 요청 키·합성 관측이 부적절한 산출물에 들어가지 않았다.
4. 필요한 검증이 통과했고 미실행 항목을 숨기지 않았다.
5. 새 인프라 비용·권한·공개 동작이 요청 범위를 넘지 않는다.

별도 기능을 추가하기보다 요청한 기능의 저장·인증·실패 복구·표시 의미까지 완성한다.


## 12 공개 문서·metadata 유지

- Production 기본 URL은 https://bunaken-current-observatory.vercel.app 이다. 공개 `/`와 `/research`의 title·description·canonical·ko/en alternates는 Next.js Metadata API에서 구성한다. 관리자 페이지는 noindex를 유지하되 robots를 인증 수단으로 간주하지 않는다.
- GitHub 소스 링크는 공개 헤더의 연구 메뉴 뒤·언어 선택 앞에 둔다. 기존 44px 조작 영역과 모바일 줄바꿈을 유지한다.
- 프로젝트 소프트웨어·개발/운영 문서는 MIT다. 연구 원고·고정 근거·관측·공급자 자료에 코드 MIT를 확장하지 않는다. LICENSING.md와 원 제공자의 조건을 확인한다.
- 최신 운영 안내는 README.md와 docs/README.ko.md에서 연결한다. dated 검증·연구 근거는 historical evidence로 보존하며 현재 운영 절차로 복사하지 않는다. docs/environment-sources.ko.md는 사용자 요청 없이 변경하지 않는다.
- 발행 연구 수정은 새 version의 네 원고·단일 results·metadata로 검토한다. results의 version은 release와 같아야 하며 수치가 같아도 결과 파일 hash를 새로 계산한다. 기존 release·frozen metrics·data cutoff를 덮어쓰지 않는다.
- Next.js 로컬 dotenv용 escaped dollar와 Vercel 변수의 literal dollar를 구분한다. Node --env-file의 해석을 Next.js 환경 로더와 동일하다고 가정하지 않는다. 검사에 secret 값을 출력하지 않는다.

- 공개 로딩은 정적 헤더·날짜/모델 조작·Site 이름·열 제목·그래프 제목/시간축을 먼저 표시한다. 수치·곡선·생성 시각·실제 공급 상태만 대기 표시하며 대기를 `0`·`미제공`·정상 자료로 표현하지 않는다. 조작부는 자료 Suspense 밖에 둬 완료 시 미전송 입력을 초기화하지 않는다. 전역 loading으로 관리자 인증 redirect의 HTTP 상태를 변경하지 않는다.
