# 공개 저장소 설치

이 문서는 Bunaken Current Observatory의 공개 GitHub 저장소를 `main` 코드 branch와 `data` 공개 데이터 branch로 구성하는 운영 절차다. 저장소 생성이나 배포는 포함하지 않는다.

## 공개 범위

- 저장소와 두 branch 모두 공개다. `data`의 관측, 연구 초안, 과거 revision도 누구나 읽을 수 있다.
- 비밀 초안, 비밀번호, 인증 설정, 토큰, 개인 정보, 재배포 권한이 없는 원자료를 저장소에 넣지 않는다.
- 관측 저장은 공개 저장이다. `use_for_model=false`는 학습 제외만 뜻하며 공개 취소가 아니다. Git 이력에서 삭제를 보장하지 않는다.
- 별도 비공개 저장소, OAuth, 서버 DB는 만들지 않는다.

## 저장소와 branch 준비

1. GitHub에서 하나의 **public** repository를 만든다. `main`을 기본 branch로 설정한다.
2. `main`에는 검토된 애플리케이션 코드, schema, 문서, 신뢰된 workflow만 둔다. 제품 구현 후 프로젝트 구조 예시에 따라 저장소 디렉터리를 추가한다.
3. `data` branch를 `main`에서 생성한다. 운영 데이터가 아직 없다면 branch만 만들고 예시 관측을 실제 기록으로 취급하지 않는다.
4. `data`에는 확인된 운영 파일만 둔다. 초기 경로 계약은 `config/sites.json`, `config/zones.json`, `observers/`, `observations/`, `environment-links/`, `idempotency/`, `audit/`, `snapshots/`, `seals/`, `backfills/`, `research/`, `jobs/`, `models/`, `scalers/`, `releases/`, `latest.json`이다. 앱에서 해당 형식을 구현하기 전 빈 구조를 임의 데이터로 채우지 않는다.
5. `data/.github/workflows/on-data.yml`은 설치 운영자가 두는 최소 entrypoint로 제한한다. 공개 `main`의 검토된 고정 commit에 있는 reusable workflow만 호출하고, `data`의 파일을 실행 코드로 checkout·실행하지 않는다. 실제 실행 workflow는 지원되는 GitHub Actions 설정을 확인한 뒤 추가한다.

## 접근·보호 규칙

- `main`에 PR 검토와 필요한 CI 통과를 요구하는 branch protection/ruleset을 설정한다. 일반 데이터 저장용 PAT로 `main`이나 workflow를 변경할 수 없게 권한을 분리한다.
- `data`는 관리자 서버와 운영 workflow의 직접 commit을 허용하되 force push와 branch 삭제를 금지한다. 정상 운영에서 기록 이력을 rewrite하지 않는다.
- GitHub fine-grained PAT는 해당 공개 저장소의 Contents 쓰기만 부여하고 만료일을 설정한다. PAT는 파일 경로별 권한을 제공하지 않으므로 서버 측 경로 allowlist도 필요하다. PAT 유출 피해가 allowlist만으로 제한된다고 보지 않는다.
- Actions workflow는 필요한 최소 `GITHUB_TOKEN` 권한만 선언한다. 외부 PR에 production secret을 제공하지 않고, 외부 코드를 secret 권한 workflow에서 실행하지 않는다. 외부 Actions는 immutable commit SHA로 고정한다.

## 배포 연결

- Vercel 프로젝트는 이 저장소의 `main`을 production branch로 연결한다.
- `data` push는 Vercel preview/production build를 만들지 않도록 Git integration의 branch/build 설정에서 제외한다. 배포 플랫폼의 현재 설정 화면에서 실제 동작을 확인한다.
- 서버 환경변수는 Vercel의 서버 전용 변수로 설정한다. `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_ENABLED`, `ADMIN_AUTH_VERSION`, `SESSION_SECRET`, `IDEMPOTENCY_SECRET`, `GITHUB_WRITE_TOKEN`, `PUBLIC_OBSERVER_ID`를 client-visible 또는 `NEXT_PUBLIC_` 변수로 만들지 않는다. `PUBLIC_OBSERVER_ID`는 공개 관측자 별칭으로 로그인 아이디와 분리한다.
- 관리자 로그인 공개 전에 인증·CSRF·Origin 경계와 Vercel WAF의 `/api/auth/login` IP별 5분 10회 제한을 실제 배포에서 확인한다. 로컬 동작은 WAF 설정 검증을 대신하지 않는다.
- 새 코드 배포는 `main` 보호 규칙을 통과시킨다. secret 변경에 따른 전체 세션 철회는 환경변수 변경과 production 재배포 절차로 수행한다. 과거 deployment URL도 별도로 차단하고, 유출된 이전 배포는 중지한다.

## 첫 데이터 쓰기 전 확인

운영 저장 API와 workflow가 구현된 뒤에만 실제 데이터를 연결한다. 공개 allowlist/schema 검사, 허용된 `data` 경로 제한, 비 force ref 갱신, branch head 충돌 처리, revision·current pointer·idempotency·audit 단일 commit을 먼저 검증한다. 저장 성공 응답은 commit과 branch 반영 확인 뒤에만 반환한다. 첫 commit 전에 금지 필드와 알 수 없는 필드를 거부해야 한다.

초기 설정에 필요한 관리자 자격 증명, PAT, source 계정, 좌표·Site geometry, 관측 의미와 라이선스는 운영자가 확인한 값만 입력한다. 미확인 항목은 비활성/미확인 상태로 두며 문서 예시나 합성 fixture를 실제 데이터로 복사하지 않는다.

## 검수 기록

설치 시 다음을 운영 기록에 남긴다: 공개 repository 식별자, `main` 기본 branch, `data` branch 존재 여부, main 보호 규칙, data force-push/삭제 차단, Vercel production branch, data push build 제외 여부, PAT 권한·만료일, WAF 제한 검증 시각. 비밀값이나 토큰 자체는 기록하지 않는다.
