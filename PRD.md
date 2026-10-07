# 부나켄 조류 관측과 예측 서비스 제품 요구사항

문서 버전: 1.10\
작성일: 2026-10-07
제품 가칭: Bunaken Current Observatory  
기본 언어: 한국어 `ko` · 추가 언어: 영어 `en`  
서비스 기준 시간대: `Asia/Makassar` · WITA · UTC+08:00  
상태: 구현 기준 문서. 실제 자료의 로컬 수집·재계산·검증과 코드 CI는 수행했다. production 운영 연결·공식 D+1 예측력·연구 원고 발행은 별도 검수 대상이다.

1.10 변경: 사용자 승인 Site 간 PCI 실험 `site-transfer-v1`을 기존 모델과 별도로 제공한다. 여러 다른 Site의 실제 Overall label과 목표 Site의 환경을 비교하며 항상 experimental/very_low, validation_status=unvalidated로 표시한다. 기존 같은 Site gate와 발행 연구 결과는 보존한다. 상세 계약은 [Site 전이 실험](docs/site-transfer.ko.md)을 따른다.

1.9 변경: 검증된 FES 조석 파생값을 기간·좌표·코드 hash에 묶어 재사용한다. 연구 발행은 네 원고·단일 results·검토 상태·불변 release 계약을 적용한다. 숫자 표는 results 참조로 생성하고 철회된 보고서는 홈페이지 본문을 숨긴다. 모델·PCI 정의와 관측 schema는 변경하지 않는다.

1.8 변경: 18m 전용 거리 범위를 `weighted-analog-v1.3 / site-18m-v2`로 고정한다. Ocean·Thermal은 같은 18m의 값으로 비교하고 10–30m 차이는 참고 자료로 보존한다. v1.2 범위는 archive로 재현하며 sigma=1과 숫자 gate를 유지한다.

1.7 변경: 사용자 위임에 따라 `weighted-analog-v1.2`의 18m 전용 실험 비교 범위를 적용한다. 수심은 동일 18m 제한 조건이며 거리 항목에서 제외한다. 정의되지 않은 조석 phase는 사용하지 않는다. Tide/Ocean/Thermal/Weather의 기존 상대 weight를 유지해 합계 1로 정규화하고 실제 결측·zero IQR의 coverage 차감은 유지한다. 과거 모델 재현과 신규 model context 1.1을 함께 지원한다. 기존 관측 18개의 실측 수온 28°C는 사용자 확인 정정이며 미래 모델 수온 대용이 아니다.

1.6 변경: 대표 관측 수심은 필수이며 신규 입력 기본값은 사용자 지정 18m다. 저장 전 확인·수정할 수 있다. 기존 null 기록은 2026-10-05 사용자 명시 승인에 따라 18m 정정 revision으로 반영한다. 실측 평균 수심으로 단정하지 않는다. 신규 저장 schema 1.5이며 과거 읽기·멱등 복구를 유지한다.

1.5 변경: 날짜 1회 선택·WITA 오늘 기본값·출수 필수·50분 제안·최신 입수순 목록을 적용한다. 신규 저장 schema 1.4, 기존 1.0–1.3 읽기·멱등 복구 호환을 유지한다. 신규 Peak·Zone·경로 입력은 제외하고 기존 데이터는 보존한다.

1.4 변경: 학습·예측 입력으로 사용하지 않는 시간대별 부가 표본은 신규 입력·저장에서 제외한다. schema 1.3을 적용하고 과거 1.0–1.2 표본은 읽기 호환 및 정정 시 불변 보존한다.

1.3 변경: 현장 입력에서 입수 시각·Site·Overall PCI만 필수로 먼저 제시한다. 같은 날짜를 반복 입력하지 않도록 WITA 날짜와 시각을 한 입력으로 받고 선택 항목은 접힌 상세로 분리한다. Peak 사건에 지속 양상과 구분되는 상황 설명을 추가한다. 저장 revision schema는 1.2로 올린다.

1.2 변경: `시작 수심`을 Overall PCI의 `대표 관측 수심`으로 바로잡고, 수직조류 시작 수심은 사건별로 기록한다. 신규 observation revision schema는 1.1로 올리고, 기존 1.0 기록은 읽기 호환한다. 시간대별 표본은 별도 관측으로 보존하며 Overall 학습 label에 합치지 않는다.

1.1 변경: 자체 관리자 비밀번호 인증과 공개 저장소 직접 누적 방식으로 전환했다. 외부 OAuth, 비공개 저장소, 비공개 관측 저장 후 공개 전환 단계를 제거했다. 예측·PCI·다국어의 기존 원칙은 유지한다.

## 1 제품 목적과 확정 범위

부나켄 바다를 이용하는 누구나 Site와 Zone별 조류 관련 환경, PCI 예측, 수직조류 관측 근거와 데이터의 한계를 비교할 수 있는 공개 웹서비스를 만든다. 관리자는 출수 후 스마트폰에서 관측을 기록하고, 축적된 데이터와 방법론을 전문가용 연구 문서와 일반인용 해설로 발행한다.

PCI는 개인 관찰자가 같은 기준으로 반복 기록하는 무차원 체감 조류 지표다. 공개 서비스가 되어도 개인의 관측 척도가 보편적 물리 측정값으로 바뀌는 것은 아니다. 사용자는 PCI와 함께 관찰자 척도, 근거 수, 유효 관측일 수, 최신성 및 검증 수준을 확인한다. 추천 순위, 다이빙 가능 여부 또는 안전 판정을 제공하지 않는다.

### 1.1 확정 결정

| 구분 | v1.1 결정 |
|---|---|
| 열람 | 회원가입 없이 대시보드, PCI 기준, 공개 관측, 연구 문서 열람 |
| 기록 | 허용된 관리자만 `/admin`에서 작성·수정·발행 |
| 언어 | 한국어 우선, 한국어와 영어 정식 지원 |
| 입력 기기 | 모바일 우선. PC에서도 동일 기능 제공 |
| 저장 | 별도 DB 없이 공개 GitHub 저장소의 data branch에 JSON을 직접 누적 |
| 인증 | 자체 관리자 아이디·비밀번호 로그인. 비밀번호 해시는 서버 환경변수로 관리 |
| 비밀정보 | Vercel 환경변수와 GitHub Actions Secrets. 공개 저장소에 포함 금지 |
| 공개 소스 | 코드·관측 JSON·재배포 가능한 환경 feature·예측·연구 문서 공개 |
| 실행 | Vercel 웹 및 서버 함수, GitHub Actions의 수집·계산 배치 |
| 예측 | Weighted Analog 우선. 충분한 검증 후 회귀/GAM과 비교 |
| cold start | 숫자 PCI를 생성하지 않고 원자료·근거 부족·가능한 경우 anchor 유사성 제공 |
| 연구 발행 | 하나의 연구 버전에 전문가용·일반인용 문서와 각각의 ko/en 번역을 연결 |
| 제외 | Supabase, Firebase, SQL/NoSQL, Redis/KV 등 별도 서버 DB, 상시 백엔드, LLM 런타임 의존 |

`로그인하지 않으면 접속 불가`는 관리자 영역과 관리자 API에 적용한다. 로그인 페이지와 로그인 제출 API는 세션 없이 접근할 수 있으나 CSRF·Origin·시도 제한을 적용한다. 공개 서비스 전체를 로그인으로 막지 않는다.

### 1.2 구현상 채택한 가정

초기 기록자 겸 관리자는 한 명이며 공개 사용자의 직접 투고는 받지 않는다. 관리자 아이디, 비밀번호 해시와 세션 설정을 서버 환경변수에서 읽는다. 외부 OAuth, 회원가입, 이메일 비밀번호 재설정은 제공하지 않는다. 비밀번호 재설정은 운영자가 새 해시를 설정하고 재배포하는 방식이다. 향후 여러 기록자를 허용하려면 관찰자별 척도 보정과 권한 설계를 먼저 추가한다.

제품명, 도메인, 실제 Site 좌표·Zone 경계·벽 방향, 관리자 인증 설정, 데이터 제공자 자격증명은 구현 전 운영자가 제공할 설정값이다. 알려지지 않은 지형이나 기록을 임의로 채우지 않는다. 이 문서는 기존 기록을 보존하는 원칙과 구현 규약을 확정하며, 예측 성능이나 학술 검증을 완료했다고 주장하지 않는다.

### 1.3 출시 성공 조건

- 비로그인 사용자가 1일/7일 환경 및 예측 상태를 한국어·영어로 이해할 수 있다.
- 관리자가 모바일에서 필수 관측을 목표 60초 안에 기록할 수 있다. 첫 로그인 시간은 별도 측정한다.
- 네트워크 오류·중복 탭·동시 수정에서 기록이 사라지거나 중복 생성되지 않는다.
- 수치가 없는 과거 기록, 누락값, 오래된 자료, 검증되지 않은 예측이 정상값처럼 표시되지 않는다.
- 미인증 요청과 틀린 관리자 자격증명은 관리자 화면과 저장 API에 접근하지 못한다. 공개 JSON 열람에는 인증이 필요하지 않다.
- 전문가용·일반인용 문서는 같은 연구 버전과 결과 데이터를 가리킨다.

2026-10-04 결정: 모든 Site의 허용 격자 거리는 6km, 대표 수심은 18m다. 사용자의 지도 빨간 진행 방향·파란 외해 방향을 근사 기본값 `reference_geometry`로 저장한다. 실측 벽 방향·직교 검증으로 가장하지 않는다. target 또는 선택 analog가 이 기본값을 사용하면 모든 numeric gate를 충족해도 `experimental / very_low`로 제한한다. Zone은 위치를 특정할 자료가 확보될 때까지 미등록으로 두고 Site 수준 기록·예측을 사용한다.

## 2 정보구조와 사용자 경험

### 2.1 공개 경로

| 경로 | 기능 |
|---|---|
| `/` | `/ko`로 이동. 최초 접속은 브라우저 언어와 무관하게 한국어 |
| `/{locale}` | 1일/7일 대시보드 |
| `/{locale}/sites/{siteSlug}` | Site 소개, 검증된 Zone, 관측과 환경 상세 |
| `/{locale}/pci` | PCI 정의, 눈금, anchor, 해석의 한계 |
| `/{locale}/observations` | 관리자가 공개한 정제 관측만 조회 |
| `/{locale}/research` | 연구 문서 목록, 버전, 검토 상태 |
| `/{locale}/research/{slug}/technical` | 전문가용 방법·결과·재현 안내 |
| `/{locale}/research/{slug}/guide` | 일반인용 설명·사례·해석 안내 |
| `/{locale}/methodology` | 데이터 출처, 계산 방법, 검증, 변경 이력 |
| `/{locale}/status` | 소스별 최신성, 장애, 제공 가능한 예측 범위 |
| `/{locale}/about` | 목적, 운영 원칙, 출처와 라이선스 |

`locale`은 `ko`와 `en`만 허용한다. 언어 전환은 날짜·Site·Zone·페이지를 유지한다. 사이트명은 별도 번역 가능 필드에 저장하고 원명도 확인할 수 있게 한다.

### 2.2 관리자 경로

| 경로 | 기능 |
|---|---|
| `/admin/login` | 관리자 아이디·비밀번호 입력, 인증 오류 안내 |
| `/admin` | 새 기록, 최근 기록, 처리·발행 상태, 데이터 상태 |
| `/admin/observations/new` | 모바일 빠른 관측 입력 |
| `/admin/observations/{id}` | 기록 상세·수정·정정 또는 철회 표시 |
| `/admin/research` | 연구 초안 목록 및 네 가지 문서 상태 |
| `/admin/research/{id}` | 편집·미리보기·발행·수정판 발행 |
| `/admin/sites` | Site/Zone 설정과 확인 상태 |
| `/admin/operations` | 수집 상태·재계산 요청·작업 이력 |

관리자는 URL을 직접 입력하거나 홈 화면에 바로가기를 추가해 접속할 수 있다. 관리자 링크를 숨기는 것은 보안 통제가 아니다. 서버가 페이지 렌더링 전과 API 실행 전에 인증·권한을 검사한다.

### 2.3 대시보드

2026-10-03 화면 결정: 1920×1080에서는 상단 날짜·Site 조회 뒤 전체 폭 PCI 그래프와 19 Site 스크롤 표를 배치한다. Site를 선택하면 해당 Site만 그래프에 표시하고 비교표는 전체 Site를 유지한다. 표는 오전·오후 PCI와 조류 동향/북향(m/s), 바람 방향(°), 파고(m)를 표시하며 환경값의 기준은 선택 날짜 12:00 WITA다. 모바일에서도 표를 유지하고 표 내부만 가로·세로 스크롤한다. 전체 페이지의 가로 넘침을 피한다. 조석·환경 종합은 Site 상세에서 제공한다. 그래프 hint의 상단 여백은 8px다. 메인의 상세 도움말은 연구 상세로 이동하며 기준 시간대·단위·결측·오래된 상태는 바로 표시한다. 생성 시각은 연구 상세에서 확인하고 오래된 자료일 때는 메인에도 노출한다. 7일 비교 화면의 날짜 열·Site/Zone 행 확장 계획은 유지한다.

Site 상세는 `PCI 또는 표시 불가 사유`, `수직조류 근거`, `Support`, `기준 수심`, `자료 최신성`을 포함한다. 초기 관측이 부족할 때는 `— · 관측 부족`과 원자료를 표시한다. PCI를 0으로 대체하지 않는다. 유사성도 환경 복원이 가능할 때만 표시하며, 확인되지 않은 anchor 환경을 추정해 High를 만들지 않는다.

기본 비교 시간은 오전 `[08:00,12:00)`, 오후 `[12:00,16:00)` WITA로 한다. 30분 간격의 시작 시각을 계산하고, 해당 구간에서 유효한 PCI의 중앙값을 대표값으로 제공한다. 전체 슬롯의 75% 이상이 유효해야 대표값을 표시한다. 일부 누락이 있으면 `부분 자료`를 함께 표시하고 최대값은 `가용 구간 최대`로 표기한다. 전 슬롯 유효 시 `예측 곡선 최대`로 표시한다. 이는 실제 다이빙의 순간 최대조류를 예측했다는 뜻이 아니다.

수치 범위가 색과 함께 표시되어도 안전/위험 색상 분류를 만들지 않는다. 사용자는 Site명·지역 등 중립 기준으로 정렬할 수 있고 자동 추천 점수는 없다. 조석 높이, 수평 해류 속도, 수온은 서로 다른 단위를 명시한다.

### 2.4 다국어와 접근성

- 모든 버튼·검증 오류·비어 있음·인증 오류·신선도·Support 문구를 번역 키로 관리한다.
- 공식 UI와 PCI 기준은 ko/en 모두 준비해야 출시할 수 있다. 공개 연구는 네 문서가 같은 버전으로 준비된 후 발행한다.
- 공개 관측 메모 원문은 자동으로 사실 번역하지 않는다. 공개 요약은 관리자 작성 ko/en 필드로 제공하고 원문 언어를 표시한다.
- 숫자·날짜는 언어별 표기하되, 바다의 날짜·시간은 항상 WITA다. 접속자 기기 시간대로 조용히 변환하지 않는다.
- 최소 44×44 CSS px 터치 영역, 본문 16px 이상, 명시적 레이블, 키보드 포커스, 색에 의존하지 않는 상태 표기를 적용한다.
- 360px 너비, 200% 확대, iOS Safari와 Android Chrome에서 핵심 흐름을 검증한다.
- `lang`, 언어별 canonical, `hreflang`, 페이지 제목을 제공한다. 관리자 페이지는 검색 색인에서 제외한다. 연구 초안은 사이트의 발행 목록에서 제외하지만 공개 저장소에는 보일 수 있다.

## 3 PCI 관측 기준

### 3.1 측정 대상

`PCI`는 관찰자가 체감한 다이빙의 대표적인 조류 강도이며 0 이상의 유한 실수다. 상한은 두지 않는다. 유속 m/s로 환산하지 않고 다른 다이버의 수행 능력이나 위험도에 직접 대응시키지 않는다. 다이빙 중 조류를 시험하려고 역영·위치 유지 등의 행동을 요구하지 않는다. 실제 수행 중 자연스럽게 관찰한 경험을 출수 후 기록한다.

기존 대화에는 PCI를 전체 체감 강도로 설명한 부분과 수평조류 지표로 설명한 부분이 혼재한다. v1.0은 기존 Mandolin anchor를 보존하기 위해 **전체 체감 강도**를 채택한다. 수직 방향·수직 강도는 별도 관측 속성이다. 따라서 PCI와 수직 강도가 완전히 독립적이라고 주장하지 않는다. 순수 수평 강도가 필요해지면 새로운 `horizontal_pci`와 새로운 rubric 버전을 추가하고 기존 PCI를 자동 재해석하지 않는다.

### 3.2 공개하는 눈금

다음 설명은 일관된 회상을 돕는 초기 관찰 기준이며 실험적으로 교정된 등간척도가 아니다. 0.8이 0.4보다 물리적으로 두 배라는 해석은 금지한다.

| PCI | 한국어 기준 | English reference |
|---:|---|---|
| 0.0 | 조류의 영향을 거의 느끼지 못함 | Negligible perceived current |
| 0.2 | 흐름은 느껴지지만 평소 진행에 영향이 작음 | Very weak, little effect on normal progress |
| 0.4 | 드리프트와 방향에 따른 노력 차이가 명확함 | Weak, clear drift and direction-dependent effort |
| 0.6 | 조류가 진행 경로와 위치 유지 방식에 뚜렷하게 영향을 줌 | Moderate, clearly affects route and position keeping |
| 0.8 | 조류 대응이 다이빙 진행에 큰 영향을 줌 | Strong, substantially affects dive execution |
| 1.0 | 2026-09-19 Mandolin에서 보고한 개인 기준 상태 | Personal reference event at Mandolin on 19 Sep 2026 |
| >1.0 | 해당 기준 사건보다 더 강하게 체감함 | Perceived as stronger than the reference event |

일반 사용자의 해석 문구: `PCI는 한 관찰자의 일관된 체감 기록을 바탕으로 합니다. 유속이나 모든 사람에게 동일한 난이도를 뜻하지 않습니다.` 영어: `PCI is based on a consistent observer-specific rating. It is not current speed or a universal measure of difficulty.`

입력은 소수 둘째 자리까지 허용하되 0.05 간격의 빠른 버튼과 숫자 필드를 제공한다. 슬라이더가 입력의 유일한 방법이어서는 안 된다. 1.0 초과 입력을 직접 허용한다. 예측은 기본 소수 첫째 자리로 표시하고, 둘째 자리는 관리자 분석에서만 제공한다. 실제 관측 label은 입력한 정밀도를 보존한다. 소수점 자릿수가 검증 정밀도를 뜻하지 않는다.

### 3.3 Anchor와 기존 기록의 보존

| 기록 | 보존 내용 | 수치 학습 판단 |
|---|---|---|
| 2026-09-19 Mandolin | 약 11:00, 약 15m, PCI 약 1.00, down 보고 | 유일한 기존 numeric label. 수치 label을 보존하되 Zone·대상 구간·환경 결합 품질 확인 후 학습 적격 판단 |
| 2026-09-23 | weak, Windy 0.04–0.06 m/s 보고 | 시각·Site·수치 PCI 불명. 제외 |
| 2026-09-24 | weak 보고 | 알려진 내용만 보존. 9/23의 유속을 복사하지 않음. 제외 |
| 2026-09-26 Sachiko | normal, Windy 0.08 m/s 보고 | 시각·수치 PCI 불명. 제외 |

9/19의 Zone, dive 전체 PCI인지 사건의 최대치인지, 당시 환경값은 아직 확인되지 않았다. `label_scope=legacy_unspecified`로 보존하고 `anchor_reference=true`로 표시한다. 명시적 확인 없이 overall/peak 또는 horizontal label로 변환하지 않는다. Anchor를 화면과 기준 문서에 보존하는 것과 숫자 모델의 적격 학습행으로 사용하는 것은 별개다.

기존 `weak/normal`은 새 눈금 0.4/0.6으로 변환하지 않는다. 보고된 Windy 값은 출처와 시각·깊이 불확실성이 있는 부가 기록으로 저장하며 Copernicus 값으로 가장하지 않는다. 과거 보조 자료는 존재했다고 가정하지 않는다.

### 3.4 수직조류와 관측 확신도

수직 방향은 `unknown / none / down / up / mixed`를 지원한다. 입력은 필수 선택이지만 기본 선택은 없으며 판단하지 못하면 `unknown`을 선택한다. `none`은 관찰했으나 없었다는 뜻으로 `unknown`과 구분한다. 한 다이빙에 상승과 하강이 모두 있으면 `mixed` 또는 분리된 사건으로 기록한다.

수직 강도는 선택사항이며 0 이상, 상한 없음이다. 초기 보조 눈금은 0 없음, 0.25 느껴짐, 0.5 지속적으로 의식됨, 0.75 수심 유지에 큰 영향을 줌으로 설명한다. 1.0은 관찰자가 9/19 사건을 별도 수직 anchor로 명시적으로 확인한 뒤에만 사용한다. 기존 PCI=1.0만으로 `vertical_intensity=1.0`을 생성하지 않는다. 방향 unknown이면 강도는 null, none이면 0 또는 null만 허용한다.

관측 확신도는 `high / normal / low`이며 기본 normal을 화면에 보여 수정 가능하게 한다. 초기 품질 계수는 각각 1.0 / 0.8 / 0.5다. 이는 학습용 가중치 prior이며 통계적 신뢰확률이 아니다. 장비 구성·활동 상황·관측 어려움은 공개해도 되는 선택 메모로 남긴다. 개인적인 메모 입력란과 서버 비공개 메모 저장 기능은 두지 않는다.

### 3.5 전체 기록과 Peak의 구분

필수 수치 입력은 `overall_pci` 한 개다. `peak_pci`, 사건 시각·수심·Zone은 선택 입력이다. overall은 다이빙 전체의 대표적인 체감 수준을 회상하여 기록한다. 순간적인 강한 사건은 Peak로 보존한다. Peak가 overall보다 작으면 오류로 처리한다.

전체 다이빙 target과 순간 사건 target을 같은 label로 학습하지 않는다. 수직 방향 변화가 Peak PCI와 일치하지 않을 수도 있으므로 사건의 PCI는 비워 둔 채 시작 시각·수심·방향만 기록할 수 있다. v1 예측은 특정 시각에 시작하는 기준 60분 다이빙의 대표 PCI를 대상으로 한다. 학습에서는 실제 start/end 구간의 환경 요약을 사용한다. end가 없으면 60분 구간을 가정하고 `window_inferred=true`와 품질 감소를 남긴다. anchor처럼 구간 의미 자체가 불명인 기록은 의미가 확인되기 전에는 학습 제외다. 30분 간격 출력은 겹치는 60분 구간의 추정이며 독립적인 30분 관측이 아니다.

다중 Zone 이동은 선택 경로로 저장한다. 주된 Zone을 특정할 수 없으면 Site 수준 기록으로 남기고 Exact Zone 계수를 부여하지 않는다. Peak 예측 모델은 별도 검증 데이터가 충분할 때 확장하며 v1에서는 Peak 기록과 사건 탐색만 제공한다.

## 4 모바일 관측 입력

### 4.1 필수와 선택 필드

| 구분 | 필드 및 동작 |
|---|---|
| 필수 | WITA 날짜, 입수·출수 시각, 등록 Site, Overall PCI, 대표 관측 수심 |
| 기본값 | WITA 오늘 날짜, 출수 입수 +50분 제안(수정 가능). 입수·Site·PCI는 직접 입력. 대표 관측 수심 18m(확인·수정), 관찰 확신도 normal |
| 선택 | 수직 방향·강도·시작 위치, 관찰 확신도, 실측 수온, 공개 메모, 기기 임시 보관 동의, 모델 학습 사용 동의 |
| 시스템 | 관찰자 ID, rubric 버전, 저장 시각, revision, 환경 결합 상태, snapshot 참조 |

대표 관측 수심은 Overall PCI를 평가할 때 주로 조류를 느낀 수심이다. 최대수심, 입수 직후 수심, 상승/하강조류가 시작된 수심을 뜻하지 않는다. 여러 수심에서 조류가 달랐다면 시각·Zone·수심별 사건을 추가로 기록한다. 신규·정정 저장은 대표 관측 수심을 확인해야 한다. 과거 unknown 기록은 계속 읽으며 명시적 정정 전에는 수심 관련 numeric 학습에서 제외한다. 사용자 지정 기본 18m는 관측자가 확인하는 대표값이며 실측 평균·최대 수심이 아니다. 수직조류가 시작된 수심은 해당 방향 사건의 수심으로 따로 기록한다. Zone 기본 수심을 사용자 관측 수심으로 복사하지 않는다. 수온의 측정 수심·시각을 모르면 원문은 보존하지만 수심별 calibration에서는 제외한다.

시간대별 표본은 시각별 현장 맥락을 보존하는 부가 관측이며 Overall PCI label이나 독립 다이빙 label이 아니다. 표본의 체감 PCI는 무차원 관찰값으로 표시하고 m/s로 환산하지 않는다. 수평 방향은 실제 지리 bearing을 추정하지 않고 다이버의 진행 경로 기준 `with_route / against_route / crossing_route / unknown`으로 저장한다. Peak 사건과 수직조류 시작 사건은 PCI가 비어 있어도 시각·수심·방향을 저장할 수 있다.

Peak의 지속 설명은 자유 텍스트로 보존하며 초 단위로 환산하지 않는다. 예를 들어 반복 구간이나 시간을 측정하지 못했다는 내용을 원문으로 남긴다.

### 4.2 입력과 저장 흐름

1. 인증 후 큰 `새 관측` 버튼을 누른다. 최근 사용 Site를 빠르게 선택한다.
2. 필수 필드를 한 열로 입력한다. 상세 사건·수온·메모는 펼침 영역으로 둔다.
3. 저장 시 UUID 형식의 관측 ID와 idempotency key를 클라이언트에서 생성하여 재시도에도 유지한다.
4. 서버가 저장 커밋을 확인한 후에만 `저장됨`을 표시한다. 환경 결합은 비동기로 진행하고 `환경 자료 연결 중`을 별도로 표시한다.
5. 저장 버튼은 `공개 저장`으로 표시한다. 입력 화면에서 공개되는 필드를 확인하고 한 번 눌러 저장한다. 서버가 공개 스키마를 검증하고 commit하면 JSON은 즉시 공개된다. 매번 별도 승인 페이지를 강제하지 않으며 저장소 반영과 홈페이지 갱신은 구분한다.

`미저장 / 기기 임시저장 / 전송 중 / 공개 저장됨 / 홈페이지 반영 중 / 홈페이지 반영됨 / 오류`를 구분한다. 실패 후 재시도는 입력값을 유지한다. GitHub 장애에서는 성공 화면을 보여주지 않는다. 입력 중 세션이 만료되면 초안을 보존한 상태로 재로그인하고, 인증이 끝난 후 명시적으로 전송한다.

기기 임시저장을 선택하지 않은 경우 재인증은 원래 폼 탭을 유지하는 별도 탭에서 진행해 메모리의 입력을 지키고, 원래 탭에서 세션을 재확인한다. 페이지 종료·브라우저 종료 후 복원은 기기 임시저장을 켠 경우에만 보장 범위에 포함한다.

### 4.3 약한 통신 환경

첫 버전은 완전 오프라인 관리자 접속을 제공하지 않는다. 이미 인증된 열린 폼에서는 연결이 끊겨도 입력을 계속하고, 복구 후 재인증을 거쳐 저장할 수 있다. 보호된 관리자 HTML·API 응답·세션을 서비스워커 캐시에 저장하지 않는다. 오프라인 상태로 `/admin`을 새로 열면 인증된 기록을 표시하지 않는다.

사용자가 `이 기기에 임시저장`을 켜면 IndexedDB에 입력 초안을 저장한다. 이는 기기 내 임시 파일 보관이며 서버 DB 도입이 아니다. 토큰·비밀번호는 저장하지 않는다. 초안은 관리자 식별자별로 분리하고 인증 후에만 복원한다. 연구 원고의 기기 초안도 같은 원칙을 적용한다. 서버 저장 확인 후 정리하며 기본 보존 기간은 7일이다. 로그아웃에서는 기본 삭제하고 남아 있는 미전송 초안 수를 알려준다. 다른 계정으로 로그인하면 앞선 사용자의 초안을 보여주지 않는다. 기기 임시저장은 OS 수준 암호화 보장을 대신하지 않으므로 선택 기능으로 둔다.

PWA 설치는 v1.1 후보이며 모바일 웹의 필수 기능을 PWA나 background sync에 의존시키지 않는다. 모바일 소프트 키보드가 저장 버튼을 가리지 않도록 safe-area와 스크롤을 처리한다.

## 5 데이터 공급과 환경 처리

### 5.1 소스 계약

| 소스 | 용도 | 구현 규칙 |
|---|---|---|
| FES | 조석 높이, 변화율, 조차, 위상 | 모델 버전·datum·좌표·계산 코드 버전 고정. 조석 높이를 현장 해류로 표시하지 않음 |
| Copernicus Marine | u/v, 깊이별 수온·염분, 수평 유속의 깊이 차이 | 제품뿐 아니라 dataset/variable/depth/시간해상도를 실제 카탈로그에서 선택 |
| Open-Meteo | 바람, 파랑·너울 | 모델·변수·단위·방향 convention·native resolution 기록 |
| 천문 계산 | 달 위상 표시 | 계산 라이브러리 버전 고정. 초기 핵심 학습 feature에서 제외 |
| 관리자 관측 | PCI, 수직 방향, 수온, 사건 | modelled와 observed 분리. label을 환경 결측 대용으로 쓰지 않음 |

FES2022b 높이 자료의 이용과 배포에는 해당 제공자의 라이선스·인용 조건을 확인한다. FES 높이 자료만 확보하고 tidal current도 확보했다고 주장하지 않는다.[R6] Copernicus는 같은 제품 안에서도 변수별 시간·수심 해상도가 다르므로 모든 변수가 1시간 또는 6시간 자료라고 가정하지 않는다.[R7] Open-Meteo 공개 API의 비상업적 사용 조건과 데이터 표시 조건을 운영 형태에 맞게 확인한다.[R8]

공개 오픈소스라는 사실이 제3자 원자료 재배포 권한을 부여하지 않는다. 소스별 `source_registry`에 공급 URL, 제품·dataset ID, 허용 사용, 공개 가능한 파생 필드, 요구 attribution, 확인일을 남긴다. 라이선스가 확인되지 않은 원자료는 Git 저장에서 제외한다. 계산에 필요한 원자료를 실행 중 임시로 처리할 수는 있지만 재배포가 허용된 feature만 공개 저장한다. 허용된 보존 형태가 없으면 해당 소스를 사용한 재현 가능한 모델 운영을 보류한다. 비용·무료 티어·요청 제한은 고정 사실로 코드에 박지 않고 배포 시 확인한다.

### 5.2 공간·수심·시간

Zone의 검증된 대표 위치에서 바다 격자를 선택한다. 육지 셀을 가로질러 무조건 bilinear interpolation하지 않는다. 선택 셀 좌표, Site와의 거리, 선택 방법, fallback 여부를 기록한다. 수용 가능한 최대 거리는 지역 격자를 검토한 후 config로 확정하며 미설정 Site는 예측 준비 미완료다. 서로 다른 Site가 같은 외해 격자를 공유하면 UI와 방법론에 이를 설명한다.

목표 수심을 사이에 두는 두 유효 layer가 있을 때 선형 보간한다. 범위 밖 또는 해저 아래는 외삽하지 않고 null 처리한다. 시간도 두 유효 시점 사이에서만 보간한다. `native_resolution`과 `evaluation_interval=30m`를 함께 저장하며, 보간 후에도 정보의 원래 시간 해상도를 유지한다. 일평균 값을 보간해서 만든 곡선을 시간별 실제 변동으로 설명하지 않는다.

벽 기준 방향은 진북에서 시계방향인 bearing을 사용한다. 동향 u, 북향 v일 때 `along = u*sin(bearing) + v*cos(bearing)`이다. cross에도 검증된 offshore bearing을 같은 방식으로 투영하고 양수는 외해 방향, 음수는 해안 방향으로 정의한다. 두 축이 수직이 아니면 직교 좌표계라고 부르지 않는다. v1 지형 설정에서는 두 축이 직교하도록 검증하고 벽 방향은 확정된 offshore 방향으로 부호를 결정한다. 불확실한 geometry는 status와 함께 보존하고 유사 지형 multiplier를 부여하지 않는다.

수평 유속의 수심별 차이인 `vertical_shear`는 수직 속도가 아니다. 외해 모델이 수직 속도를 제공하더라도 reef-scale downcurrent 검증 없이 하강조류 예보로 사용하지 않는다.

### 5.3 Feature와 표준화

| 그룹 | 초기 weight | 내용 |
|---|---:|---|
| Tide | 0.30 | 중심 시각의 전후 60분 변화율, 조차, 조석 위상 sin/cos |
| Ocean | 0.35 | along/cross current, 기준 수심 유속, 수심별 수평 유속 차이 |
| Thermal | 0.15 | 모델 수온 프로파일, 고정 수심 간 ΔT, T/S가 있을 때 밀도 기반 성층 proxy |
| Weather | 0.10 | along/cross wind, wave/swell 높이·주기·방향 |
| Depth | 0.10 | 관측 대표 수심과 목표 기준 수심 차이 |

각 다이빙 구간에서 같은 feature 추출기를 적용한다. Tide의 전후 변화는 구간 중심을 기준으로 하고 나머지 시간변동 필드는 구간 평균을 기본으로 한다. 피크·분산을 추가할 때는 schema/model 버전을 변경한다. group 내부 feature 수가 많다는 이유로 group 영향이 커지지 않도록 group별 평균 제곱 거리를 사용한다. sin/cos 쌍은 합쳐 한 방향 feature로 취급한다.

표준화는 label과 무관한 과거 환경 분포의 median/IQR를 사용한다. 운영 초깃값은 출시 이전 약 1년을 목표로 하되 실제 확보 기간을 기록한다. IQR가 0인 feature는 비활성화한다. 검증 fold에서는 해당 예측 시점 이전 환경으로 만든 scaler만 사용한다. 모든 기간의 환경값으로 scaler를 먼저 만들고 과거 성능을 평가하지 않는다.

실측 수온은 numeric PCI의 필수 입력이 아니므로 관측 폼에서 선택값으로 유지한다. 모르는 측정 시각·수심을 자동 확정하지 않는다.

수온 bias는 `observed - modelled`로 추정할 수 있지만, 초기에는 raw 모델 수온을 사용한다. 같은 Site·수심에서 시각이 맞는 관측이 10개 이상, 5일 이상 쌓인 뒤 shrinkage된 median bias를 후보로 비교한다. 보정 계수는 training fold 내에서만 적합한다. 보정 전후 값, 표본 수, 버전을 보관하며 미래 실제 수온을 feature로 사용하지 않는다.

### 5.4 결측과 품질

2026-10-05의 18m 전용 실험 범위에서는 Depth를 거리 항목 대신 동일 수심 적격 조건으로 사용한다. 미구현 phase 항목은 비교 registry에서 제외하고 Tide는 rate·구간 excursion 두 항목으로 계산한다. v1.3의 Ocean·Thermal은 동일 18m 값만 거리에서 비교하고 다른 수심 간 차이는 거리 항목에서 제외한다. 네 환경 group의 weight는 0.30/0.90, 0.35/0.90, 0.15/0.90, 0.10/0.90이다. 이 범위는 목표·analog마다 달라지지 않는다. 18m 외 목표는 null이고 다른 수심 label은 이웃에서 제외한다. 소스 장애나 zero IQR를 이유로 runtime registry·분모를 줄이지 않는다. 기존 v1.1의 전체 수심·phase 분모는 archived config로 재현한다.

관측 결측은 null이며 0으로 채우지 않는다. 목표와 analog에 공통으로 있는 활성 feature만 비교하고 `feature_coverage`를 산출한다. 기본적으로 Tide와 Ocean group은 필수, 전체 가중 coverage는 0.80 이상이어야 숫자 PCI 후보가 된다. group 안에서는 설정된 활성 feature의 절반 이상이 유효해야 한다. 부족하면 raw 데이터만 제공하고 `missing_required_features`를 기록한다.

목표의 동일 feature mask를 모든 analog에 적용한다. mask를 충족하지 못한 analog는 제외한다. 남은 group weight를 재정규화하며 model version에 mask를 남긴다. geometry가 없어 Ocean group을 구성하지 못한 경우 site 평균값으로 대체하지 않는다.

## 6 예측 엔진과 검증

### 6.1 Weighted Analog

환경 거리와 Site 유사도를 분리한다.

```text
D_env² = Σ(group_weight × group_mean_squared_standardized_difference)
environment_similarity = exp(-D_env² / (2 × sigma²))
w_i = environment_similarity × site_multiplier × provenance_weight × quality_weight
pci = Σ(w_i × pci_i) / Σ(w_i)
N_eff = (Σw_i)² / Σ(w_i²)
```

sigma 초기값은 1.0, 최대 이웃 수 K는 20, 최소 environment similarity는 0.20으로 둔다. 이는 검증 전 engineering prior다. 거리순 후보를 선택한 뒤 최종 가중치를 계산한다. 합계가 0이거나 유효 analog가 없으면 null을 반환한다. Weighted mean은 관측 label의 범위를 넘어 외삽하지 못한다는 한계를 문서화한다.

| 관계 | multiplier |
|---|---:|
| 같은 확인된 Zone | 1.00 |
| 같은 Site이고 한쪽 Zone이 unknown | 0.80 |
| 같은 Site의 다른 확인된 Zone | 0.65 |
| 다른 Site이며 검증된 geometry가 유사 | 0.35 |
| 다른 Bunaken Site | 0.15 |
| Site 불명 | 사용 제외 |

geometry 유사성은 사전 관리한 그룹과 근거로 판단한다. 이름이나 가까운 위도·경도만으로 비슷한 벽이라고 추정하지 않는다.

provenance 초기값은 당시 실제 보존된 forecast snapshot 1.00, 사후 analysis backfill 0.70이다. 불완전 소스는 임의로 작은 양수 weight를 주기보다 적격 조건에 따라 제외한다. quality는 confidence 계수에 시간·수심 proxy 등의 명시적 계수를 곱한다. 구간 또는 수심 하나를 추정하면 0.8, 둘 모두면 0.64를 곱하는 초기 규칙을 사용한다. 모든 계수는 config에 두고 연구 문서에 공개한다.

### 6.2 숫자 표시 gate와 Support

기본 `weighted-analog-v1.3`은 전체 numeric 기록 수만으로 숫자를 표시하지 않는다. 아래 조건을 모두 만족해야 한다.

1. 의미가 확인되고 품질 검사를 통과한 overall numeric label 3개 이상.
2. 최종 analog에 서로 다른 WITA 관측일이 3일 이상 포함됨.
3. 해당 목표에서 `N_eff >= 2`, 유효 analog 3개 이상, 같은 Site 기록 1개 이상.
4. 최소 similarity와 필수 feature·coverage 충족, 예측 시각이 공급 자료 범위 안에 있음.
5. 동일 관찰자·호환 rubric의 학습 기록만 사용함.

2026-10-07 사용자 승인 실험 예외: `site-transfer-v1`은 목표 Site label을 제외하고 최소 3개 donor Site, 3일, analog 3개, N_eff/N_eff_days/N_eff_sites 각각 2 이상, 한 Site 최종 기여 50% 이하를 요구한다. 나머지 source·coverage·수심·cutoff gate는 유지한다. 기본 모델 PCI에 자동 대입하지 않고 별도 실험 선택 화면에서만 제공한다. 전이 출력은 학습 label로 재사용하지 않는다.

같은 날 세 번 기록한 것을 독립적인 세 날로 취급하지 않는다. 하루 3회씩 한 달이면 약 90행이 생기지만 성능 또는 Site별 support를 보장하지 않는다.

| 상태 | 기본 조건 | 공개 표시 |
|---|---|---|
| Insufficient | gate 미충족 | PCI 숨김, 사유 및 raw data |
| Experimental | gate 충족, N_eff 2–3 미만 | 수치와 실험적 추정, 매우 낮은 근거 |
| Low | N_eff 3 이상 | 수치와 낮은 근거. 검증 부족 시 여기까지 |
| Medium 후보 | N_eff 5 이상, 기여 관측일 5일 이상, 같은 Site 3일 이상 | 검증 gate까지 만족할 때 중간 근거 |
| High 후보 | N_eff 10 이상, 기여 관측일 10일 이상, 같은 Zone 5일 이상 | 강화된 검증 gate까지 만족할 때 높은 근거 |

Medium 공개는 forecast 기반 전진 검증 test일 10일 이상, 기준선 대비 MAE 개선, 큰 오차 악화 없음이 필요하다. High 공개는 test일 20일 이상과 목표 Site의 held-out test일 5일 이상, site별 기준선 개선, 운영자가 사전에 정한 오차 허용기준 충족이 필요하다. 오차 허용기준이 설정되지 않으면 High는 비활성이다. 이 개수들도 초기 정책이며 과학적으로 확정된 신뢰도 임계값이 아니다.

`N_eff`는 가중 집중도를 보여주며 독립 표본 수의 보장은 아니다. 별도로 날짜별 총 weight에 같은 공식을 적용한 `N_eff_days`도 공개 상세에 제공한다. Support, 입력 confidence, prediction interval, 안전도는 서로 다른 개념이다. 초기에 검증되지 않은 확률·95% 신뢰구간을 생성하지 않는다.

### 6.3 Anchor 유사성과 수직 근거

Anchor 환경 복원이 가능할 때 environment similarity와 Site multiplier를 별도로 표시한다. similarity 0.70 이상 High, 0.40 이상 Medium, 미만 Low라는 초기 설명용 구간을 사용하되 `유사성 기준은 미검증`을 표시한다. 숫자 PCI, 위험 확률 또는 downcurrent 발생 확률로 변환하지 않는다. 사후 분석으로 복원한 anchor와 미래 forecast의 차이도 명시한다.

수직 evidence는 적격 수직 관측에 같은 환경 계산을 적용한다. `unknown`은 분모에서 제외하고 none/down/up/mixed는 각각 보존한다. internal down 지표는 down 포함 weight/known weight로 계산할 수 있으나 공개 퍼센트는 v1에서 표시하지 않는다. mixed는 down 및 up 사건이 모두 확인된 경우에만 각 evidence에 포함한다.

known 관측 5개, 3개 날짜, 방향 사건 2개 날짜, none 사례 2개 날짜 및 N_eff 3 이상이 모두 충족되기 전에는 `근거 부족`이다. 충족 후에도 `유사 조건에서 하강 관측 사례 있음`과 양성·음성 관측일 수를 제시한다. 실제 확률 표시는 별도 모델의 calibration 검증 후 결정한다. 자료가 없어서 down 보고가 0인 상태를 `하강조류 없음`으로 표시하지 않는다.

### 6.4 학습과 검증

주 검증은 시간 순서를 보존한 expanding-window 또는 rolling-origin 방식으로 한다. test 날짜보다 나중의 label, 수정 정보, bias, scaler, snapshot을 학습에 사용하지 않는다. 같은 WITA 날짜의 모든 dive·Peak·인접 파생행은 같은 fold에 배치한다.

Leave-One-Day-Out은 추가 진단으로 유지한다. 나머지 모든 날짜를 학습에 넣는 LODO는 미래 데이터를 사용할 수 있으므로 실제 D+1 운영 성능으로 부르지 않는다. Hyperparameter 튜닝은 training fold 내부의 날짜 단위 검증으로 수행한다. 최종 holdout으로 weight를 튜닝하지 않는다.

비교 기준선은 training 데이터의 전체 median PCI와 같은 Site median PCI다. 지표는 MAE, median absolute error, 큰 오차 분포, 예측 제공률, abstention 비율, Site/lead time별 오차를 포함한다. 평균 성능만 좋아지고 예측 제공률이 급락한 경우도 함께 보고한다. 날짜 단위 bootstrap이 가능한 표본량에서만 불확실성을 산출한다.

20개 이상이고 10개 날짜 이상이면 정규화 weight·sigma·K의 작은 탐색을 후보로 허용한다. 초기 weight에서의 이탈을 패널티로 제한한다. 40–60개에서는 robust regression, 60–100개에서는 GAM을 비교할 수 있으나 관측 수만으로 자동 승격하지 않는다. 신규 모델이 날짜별 out-of-sample 성능에서 이기지 못하면 Analog를 유지한다. Site/Zone별 자료가 충분할 때 hierarchical GAM을 후보로 추가한다.

관찰자 추가는 별도 버전 범위다. `observer_id`별 anchor/rubric와 겹치는 조건의 교차 기록을 확보하기 전에는 수치를 단순 합산하지 않는다.

## 7 Forecast snapshot과 시점 재현

모든 수집 실행은 immutable snapshot을 생성한다. snapshot에는 `run_id`, source별 `issued_at / retrieved_at / valid_time`, forecast lead time, 제품 버전, feature/scaler/model 버전, geometry 버전, commit SHA와 content hash를 포함한다. issued_at을 공급자가 제공하지 않으면 null과 이유를 남기며 조회 시각으로 위장하지 않는다.

기본 예측은 오늘부터 D+7까지 가능한 범위에서 생성한다. 하루에 두 번 수집하는 초기 스케줄은 UTC `23:17`과 `11:17`, 즉 WITA `07:17`과 `19:17`이다. 이는 실제 모델 갱신 시각을 확인한 뒤 조정 가능한 설정이다. GitHub Actions 예약은 지연될 수 있으므로 정시 완료를 보장하지 않는다.[R5]

기본 대시보드 날짜는 WITA 내일이며 7일 화면은 D+1부터 D+7까지다. 사용자는 오늘을 별도로 선택할 수 있다. 계산 구간의 끝과 Tide 전후 feature까지 공급 자료가 있어야 해당 슬롯을 유효하게 처리한다.

다음 날 예측 평가는 매일 WITA 20:00 이전에 실제 저장된 가장 최근 성공 run을 공식 D+1 snapshot으로 선택한다. cutoff를 넘겨 완성한 run으로 과거 공식 예측을 교체하지 않는다. 20:17에 seal job을 실행할 수 있으나 선택 기준은 20:00 cutoff이며 job 실행 시각이 아니다. 적격 run이 없으면 `missed_d1_snapshot`이다. 날짜가 지난 뒤 analysis로 만든 자료는 backfill로 분리하고 실제 forecast 성능 집계에서 제외한다.

보존 경로 예시:

```text
snapshots/2026-09-27/{runId}/manifest.json
snapshots/2026-09-27/{runId}/features.json.gz
snapshots/2026-09-27/{runId}/forecast.json.gz
seals/target-2026-09-28.json
backfills/2026-09-19/{backfillId}/manifest.json
```

대규모 원 NetCDF는 Git에 누적하지 않는다. 허용된 지역·시각의 최소 파생 feature와 재현 metadata를 압축 보존한다. 원자료가 갱신되어 재다운로드로 재현할 수 없는 경우에도 당시 실제 사용 feature는 남아야 한다. CI artifact나 Actions cache만을 유일한 snapshot 저장소로 사용하지 않는다.

소스별 `stale_after_hours` 초기값은 36시간이며 실제 갱신 주기에 맞춰 고정한다. 필수 동적 소스가 stale이면 새로운 숫자 예측을 발행하지 않는다. 기존 결과를 남길 때는 `이전 예측`, 생성 시각과 stale 상태를 명확히 표시한다. 유효 시간 범위 밖은 missing이다. 정적 조석 모델은 다운로드 나이를 일별 forecast 나이와 동일하게 처리하지 않는다. 환경값은 반드시 해당 valid time을 사용한다.

## 8 데이터 모델

스키마는 언어와 UI에 독립적인 영문 snake_case 이름을 사용한다. 모든 기록에 `schema_version`을 둔다. 시각 저장은 UTC ISO 8601과 `timezone=Asia/Makassar`, 원래 입력 로컬 시각을 함께 유지한다. 공란은 null이고 unknown은 명시적인 enum이다. 관측 ID와 Site ID는 표시명 변경에도 유지한다.

### 8.1 핵심 엔티티

| 엔티티 | 주요 필드 |
|---|---|
| Site | id, slug, name_ko, name_en, lat, lon, geometry_status, public_description_ko/en |
| Zone | id, site_id, name_ko/en, reference_depth_m, wall_bearing_deg, offshore_bearing_deg, geometry_group, geometry_version, verified_at |
| Observer | id, rubric_id, anchor_reference_ids, public_alias |
| Observation | id, schema_version, revision, observer_id, rubric_version, site_id, zone_id nullable, route_description, start_at, end_at nullable, time_precision, representative_depth_m nullable, overall_pci nullable, label_scope, legacy_category nullable, vertical, vertical_onset nullable, confidence, peak_events, observed_temperature, notes_public, public_summary_ko/en, record_status, use_for_model, train_eligible, created_at, updated_at. Historical schema 1.0–1.2 may contain immutable time_samples; schema 1.3 corrections preserve those legacy values unchanged. New records omit them. |
| PeakEvent | id, parent_observation_id, zone_id nullable, local_at/at nullable, depth_m nullable, pci nullable, duration_description nullable, context_description nullable, vertical_direction, vertical_intensity nullable |
| TimeSample | id, parent_observation_id, local_at/at, zone_id nullable, depth_m nullable, temperature_c nullable, perceived_pci nullable, horizontal_direction |
| EnvironmentLink | observation_id, observation_revision, snapshot_id nullable, backfill_id nullable, provenance, feature_vector, feature_mask, quality_flags, extraction_version |
| Snapshot | id, run metadata, source metadata, issued/retrieved/valid times, source_resolution, geometry/scaler/model versions, hashes |
| Prediction | site_id, zone_id nullable, start_at, duration_minutes, reference_depth_m, pci nullable, prediction_status, support, n_eff, n_eff_days, distinct_days, same_site_days, vertical_evidence, feature_coverage, reason_codes, model_version, snapshot_id |
| ResearchRelease | id, slug, version, status, data_cutoff, dataset_manifest_hash, model_version, metrics_hash, peer_review_status, four_document_paths, references, changelog, published_at |
| AuditEvent | id, actor_alias, action, entity_id, previous_revision, new_revision, request_digest, timestamp, parent_commit_sha |

관측용 초기 Site registry는 `packages/contracts/data/sites.json`에 둔다. Lekuan 1/2/3, Celah Celah, Alung Banua, Johnson's Wall, Fukui, Ron's Point, Mandolin, Tengah, Raymond's Point, Mike's Point, Tanjung Parigi, Sachiko's Point, Pahepa, Bunaken Timur 1/2, Pangalisang, Muka Kampung을 포함한다. 입력·수정 UI는 해당 목록을 드롭다운으로 제공하고 stable `site_id`를 저장한다. 좌표와 geometry는 검증 전까지 null/unverified다.

신규 기록과 달리 과거 기록의 이관에는 `overall_pci=null`을 허용한다. 이는 기존 카테고리 기록을 원래 의미대로 보존하기 위한 예외다.

### 8.2 관측 JSON 예시

아래는 schema 1.2 과거 호환 설명용 가상 데이터이며 실제 관측으로 seed하지 않는다. 신규 기록에는 `time_samples`를 저장하지 않는다. schema 1.0–1.2 기록의 정정 revision은 기존 표본을 변경 없이 보존한다. create 요청은 이전 클라이언트에서 만든 미완료 멱등 초안을 처리하기 위해 legacy `time_samples`를 선택적으로 검증할 수 있으며, 신규 기록 생성 전에 서버가 필드를 제거한다. 이전 정정 초안은 동일한 요청 hash로 재시도할 수 있도록 legacy 표본을 요청에 포함하고 서버는 저장된 기존 표본만 그대로 유지한다.

```json
{
  "schema_version": "1.2",
  "id": "11111111-1111-4111-8111-111111111111",
  "revision": 1,
  "observer_id": "observer_demo",
  "rubric_version": "pci-overall-v1",
  "site_id": "site_demo",
  "zone_id": null,
  "timezone": "Asia/Makassar",
  "start_at": "2026-09-28T02:00:00Z",
  "end_at": "2026-09-28T03:00:00Z",
  "local_start": "2026-09-28T10:00",
  "local_end": "2026-09-28T11:00",
  "time_precision": "reported_minute",
  "route_description": "가상 경로 메모",
  "representative_depth_m": 18,
  "overall_pci": 0.45,
  "label_scope": "dive_overall",
  "vertical": {"direction": "unknown", "intensity": null},
  "vertical_onset": null,
  "confidence": "normal",
  "peak_events": [],
  "time_samples": [
    {"id": "22222222-2222-4222-8222-222222222222", "local_at": "2026-09-28T10:20", "at": "2026-09-28T02:20:00Z", "zone_id": "zone_demo", "depth_m": 18, "temperature_c": 28.1, "perceived_pci": 0.4, "horizontal_direction": "against_route"}
  ],
  "observed_temperature": {"celsius": 28.1, "depth_m": 18, "at": null},
  "record_status": "active",
  "use_for_model": true,
  "train_eligible": false,
  "notes_public": "가상 예시",
  "public_summary_ko": null,
  "public_summary_en": null
}
```

`train_eligible`은 사용자가 true로 보낼 수 없다. 서버 결합·검증 결과로 계산한다. 수정할 때 이전 revision을 삭제하지 않고 새로운 revision과 수정 이유를 남긴다. 환경 재결합은 원래 label을 변경하지 않는다. 철회는 record_status=withdrawn인 새 revision으로 남기고 기본 화면·학습에서 제외한다. 공개 저장소의 과거 revision은 계속 열람 가능하다.

### 8.3 저장 검증

- PCI와 수직 강도는 finite number이며 0 이상. Infinity/NaN/문자열 숫자는 거부한다.
- Site/Zone 관계가 유효해야 한다. unknown Zone은 임의 ID가 아닌 null로 저장한다.
- 시작/종료 순서와 실제 관측의 미래 시각 오입력을 검증한다. 대략 시각은 precision 플래그로 허용한다.
- 수심은 0 이상이며 v1 입력 범위 0–200m를 적용한다. 범위 확장이 필요하면 config와 검증 규칙을 함께 바꾼다.
- 수온은 -3–45°C 저장 범위 검증, 지역적으로 이례적인 값은 삭제하지 않고 확인 요청한다.
- 메모는 최대 5,000자, 공개 요약은 언어별 1,000자, 일반 관측 API 본문은 64KB로 제한한다.
- 관측 ID·revision·권한·공개 필드 스키마를 서버에서 검사하고 클라이언트가 Git 경로나 저장소를 선택하지 못하게 한다.

## 9 서버 DB 없는 운영 아키텍처

### 9.1 하나의 공개 저장소

비공개 저장소를 만들지 않는다. 하나의 공개 GitHub 저장소 안에서 `main`은 코드, `data`는 계속 누적되는 관측·snapshot·연구 파일로 구분한다. 두 branch 모두 공개다. branch 분리는 코드 배포와 데이터 누적을 분리하기 위한 것이며 접근 제어 경계가 아니다. Vercel은 main만 production으로 배포하고 data 변경은 웹 재배포를 유발하지 않게 한다.

| 저장 위치 | 내용 | 접근 |
|---|---|---|
| 공개 저장소 main branch | 웹·엔진 코드, 스키마, 지침, 설치 안내, 신뢰된 workflow | 누구나 읽기, 권한 있는 기여자만 반영 |
| 같은 저장소 data branch | 관측 revision, 환경 feature, snapshot, 학습 결과, 연구 draft/release, 최소 audit | 누구나 읽기, 인증된 서버와 운영 배치만 쓰기 |
| Vercel 서버 환경변수 | 관리자 설정·비밀번호 해시·세션 키·GitHub 쓰기 토큰·멱등 키 해시용 비밀 | 서버만 접근 |
| GitHub Actions Secrets | 소스 인증 등 배치에 필요한 비밀 | 신뢰된 운영 workflow만 접근 |
| 사용자 기기 IndexedDB | 동의한 경우 미전송 관측·원고 초안 | 해당 기기 브라우저 |

공개 저장소를 clone해도 관리자 세션이나 쓰기 권한을 얻을 수 없어야 한다. 외부 사용자의 fork와 PR은 원본을 변경하지 않는다. 원본 변경은 쓰기 권한자의 직접 commit 또는 승인된 PR 병합으로만 일어난다. 관리 화면 저장은 PR 없이 서버가 data branch에 commit한다.

main에는 검토·검증 규칙을 적용하고 data에는 정상 저장을 위한 직접 commit을 허용하되 삭제·force push는 차단한다. 저장 API의 branch와 허용 경로는 서버 고정 설정이다. GitHub 토큰은 파일 경로 단위 권한이 아니므로, 서버의 경로 검사만으로 토큰 유출 시 피해까지 막는다고 설명하지 않는다. main 보호 규칙이 토큰의 계정에도 적용되도록 설정하고 검증한다.

데이터 파일은 정해진 공개 스키마만 허용한다. 개인 메모, 로그인 이름, 비밀번호 해시, IP, 쿠키, 인증 로그, raw idempotency key는 저장소에 넣지 않는다. 공개 관측자 별칭은 로그인 아이디와 구분한다. 기초 용량 계획은 관리자 1명, 일 관측 30건 이하, Site×Zone 30개 이하로 한다. 공개 트래픽은 정적 자산과 CDN이 처리한다. 대규모 원자료와 이미지 첨부는 v1 범위에서 제외한다.

### 9.2 자체 관리자 인증

`/admin/login`에서 아이디·비밀번호를 입력하고 `/api/auth/login` 서버가 환경변수의 계정과 비교한다. 외부 OAuth·GitHub 로그인·사용자 DB·회원가입은 사용하지 않는다. 브라우저 자동완성과 비밀번호 관리자가 작동하도록 username/current-password 속성을 제공한다. 비밀번호를 자동 저장하거나 로그에 남기지 않는다.

비밀번호는 운영자가 로컬 도구로 무작위 salt를 포함한 Argon2id 해시를 생성하여 환경변수에 넣는다. 검증은 검토된 라이브러리를 사용하고 평문 저장, 단순 SHA-256, 직접 만든 암호 알고리즘은 금지한다. OWASP의 현재 기준 이상을 적용하되 Vercel 런타임에서 메모리·지연을 측정한다. Argon2id를 지원하지 않는 배포에서는 검증된 scrypt 구현을 대안으로 쓰고 설정을 문서화한다.[R1] 초기 비밀번호는 비밀번호 관리자에서 생성한 긴 무작위 값을 권장한다.

| 서버 설정 | 용도 |
|---|---|
| `ADMIN_USERNAME` | 관리자 로그인 이름. 공개 관찰자 별칭과 분리 |
| `ADMIN_PASSWORD_HASH` | salt·알고리즘 파라미터를 포함한 encoded hash |
| `ADMIN_ENABLED` | 운영자의 전체 로그인/관리 기능 차단 |
| `ADMIN_AUTH_VERSION` | 비밀번호 변경 시 함께 올리는 세션 무효화 버전 |
| `SESSION_SECRET` | 검증된 세션 라이브러리의 충분한 엔트로피 비밀키 |
| `IDEMPOTENCY_SECRET` | 공개되는 멱등 요청 digest 생성용 별도 HMAC key |
| `GITHUB_WRITE_TOKEN` | 선택한 공개 저장소에 한정된 서버 쓰기 토큰 |
| `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_DATA_BRANCH` | 서버가 고정하는 대상. 비밀 값은 아니지만 사용자 요청으로 변경 불가 |

세션은 검증된 라이브러리의 인증된 암호화 쿠키를 사용한다. 쿠키는 `__Host-bunaken_session`, Secure, HttpOnly, SameSite=Lax, Path=/, Domain 없음으로 한다. 세션에는 관리자 내부 subject, 발급/만료 시각, auth_version, 무작위 세션 ID만 넣는다. 비밀번호 해시·GitHub 토큰은 넣지 않는다. 절대 만료 12시간, 자동 무기한 연장 없음이다.

로그인 페이지와 로그인 제출 API만 미인증 진입을 허용한다. 로그인 자체에도 Origin과 CSRF 검증을 적용해 login CSRF를 막는다. 성공 시 새 세션과 CSRF token을 발급한다. 틀린 아이디·비밀번호는 같은 일반 오류를 반환하고, 비교 시간 차이를 줄이도록 정해진 해시 검증 경로를 사용한다. 비밀번호는 최대 길이를 제한해 요청 자원 남용을 막되 허용 범위에서 조용히 자르지 않는다.

로그아웃은 세션 쿠키와 화면의 민감 상태를 지운다. 서버 세션 DB가 없으므로 이미 복사된 개별 세션을 즉시 취소하는 기능은 제공하지 않는다. 전체 세션 무효화는 ADMIN_AUTH_VERSION 증가 또는 SESSION_SECRET 교체 후 production 재배포로 수행한다. 비밀번호 변경 시 hash와 auth_version을 함께 바꾼다. ADMIN_ENABLED=false도 재배포 후 적용된다. 환경변수 수정만으로 실행 중인 모든 배포가 즉시 바뀐다고 주장하지 않는다. 구버전 배포 URL은 관리자 요청을 거부하도록 canonical production origin 검사와 배포 접근 설정을 적용하고, 키 유출 시 옛 배포도 중지한다.

### 9.3 로그인 시도 제한과 서버 보호

Vercel WAF의 rate-limit rule을 `/api/auth/login`의 POST에 적용한다. 초기값은 IP별 5분당 10회, 초과 시 429다. 이는 인증 전 실행되어 비밀번호 해싱 자원도 보호해야 한다. WAF 카운터는 지역 단위이므로 전 세계 단일 총량 제한이라고 설명하지 않는다. 확인일 기준 Hobby에도 rate-limit rule 1개가 포함되지만 배포 시 실제 제공 범위·포함 요청량을 확인한다.[R9] 서버 메모리 카운터 또는 공개 Git JSON을 로그인 횟수 저장소로 사용하지 않는다. 고정 관리자 전체 계정 잠금으로 외부 공격자가 정상 로그인을 계속 막게 하지 않는다.

- `/admin/**` 및 `/api/admin/**`는 각 서버 진입점에서 세션·enabled·auth_version을 검증한다. 메뉴 숨김이나 클라이언트 redirect만으로 보호하지 않는다.
- 관리자 응답은 `Cache-Control: private, no-store`; CDN·서비스워커에 보호 응답을 저장하지 않는다. 공개 기록이더라도 관리자 조작 화면은 보호한다.
- 모든 쓰기에 CSRF token·Origin 검사를 적용한다. GET은 상태를 변경하지 않는다. return URL은 같은 origin의 허용 경로만 받는다.
- 환경변수 누락·잘못된 해시·disabled이면 로그인과 쓰기를 차단한다. 개발 기본 비밀번호를 배포하지 않는다.
- 입력 크기와 스키마를 검증한다. 계정명·토큰·비밀번호·쿠키를 인증 실패 로그 또는 Git commit 메시지에 남기지 않는다.
- 외부 PR/preview에는 production secret을 제공하지 않는다. `pull_request_target`에서 외부 PR 코드를 secret과 함께 실행하지 않는다.
- 서버 저장 토큰의 branch·경로·파일 타입은 내부에서 결정하고 path traversal과 임의 workflow/코드 쓰기를 거부한다.
- 관리자 입력 Markdown은 안전하게 렌더링하고 임의 HTML/script/MDX 실행을 차단한다.

Vercel server-side secret 환경변수를 사용하며 NEXT_PUBLIC 변수·클라이언트 bundle·source map에 섞이지 않는지 검증한다.[R4] 홈페이지 관리자 인증과 GitHub에 JSON을 쓰기 위한 자격증명은 별개의 것이다.

### 9.4 공개 Git 저장과 중복 방지

서버 쓰기는 선택 저장소의 Contents read/write 권한만 가진 만료일 있는 fine-grained PAT를 기본으로 한다. OAuth 로그인은 필요하지 않다. 토큰을 가진 서버가 관리자 요청을 대신 commit하고 브라우저에는 토큰을 보내지 않는다. Workflows/Administration 권한은 주지 않는다. 토큰 만료 전 회전 절차를 운영 문서에 둔다.[R2]

관측 revision, 현재 revision pointer, 멱등 처리 기록, 최소 audit event를 한 Git commit에 반영한다. Git Data API로 현재 data branch head를 읽고 그 head를 parent로 새 tree/commit을 만든다. ref update는 force=false로 수행한다.[R3] 다른 쓰기 때문에 head가 바뀌면 재조회 후 도메인 조건을 재검사하고 최대 3회 jitter 재시도한다. 같은 관측의 expected revision이 달라졌으면 409를 반환하고 덮어쓰지 않는다.

새 관측은 `observations/{id}/revisions/000001.json`에 기록한다. raw idempotency key는 브라우저와 인증된 API 사이에서만 사용한다. 공개 ledger는 HMAC(IDEMPOTENCY_SECRET, stable_admin_subject + key)인 digest, canonical public payload hash, 관측 ID와 결과 revision만 보존한다. 같은 key·본문은 기존 성공, 같은 key·다른 본문은 409다. 세션 ID가 바뀌어도 stable subject를 사용해 재로그인 재시도가 중복되지 않아야 한다. 멱등 비밀을 회전하면 이전 키를 한시적으로 읽기 검증에만 유지하거나 요청 미결 상태를 먼저 해소하는 절차를 둔다.

Ledger에 세션·CSRF token·IP·인증 응답을 넣지 않는다. 공개 digest는 인증 수단이 아니며 API는 매 요청마다 세션을 확인한다. 수정은 If-Match로 expected revision을 받고 관측 수정 이유를 공개 이력으로 남긴다. 응답이 유실되면 같은 key로 재시도하거나 인증된 상태 API로 commit 여부를 확인한다. ref 반영 확인 전에는 저장 성공이 아니다. audit에는 parent_commit_sha를 넣고 최종 commit SHA는 API 응답에서 반환한다. 자기 자신의 commit SHA를 같은 commit 내부 파일에 미리 넣으려 하지 않는다.

### 9.5 공개 데이터와 연구 초안의 의미

저장 API는 허용 필드로 새 공개 JSON을 구성하고 알 수 없는 필드와 `notes_private`, password/token 등의 금지 필드를 거부한다. 값을 몇 개 지우는 사후 exporter에 의존하지 않고 **첫 commit 전에** 공개 적합성을 확인한다. 자유 텍스트의 개인정보를 자동으로 완전히 판별할 수는 없으므로 입력창에 공개 범위를 알린다. 인증 설정과 원자료 재배포 금지 항목은 Git에 넣지 않는다.

관측 저장은 공개 저장이다. UI에는 `저장하면 관측 JSON과 수정 이력이 공개됩니다`를 표시한다. `record_status`는 active/corrected/withdrawn을 나타내며 비공개 상태가 아니다. `use_for_model=false`는 학습 제외일 뿐 공개 취소가 아니다. 공개 관찰자 별칭을 사용하고 서버 로그인 ID는 기록하지 않는다.

연구 원고의 `draft/in_review/ready`는 편집 상태다. 서버에 저장된 연구 초안도 공개 저장소에서 읽을 수 있다. 홈페이지는 published release만 목록에 노출하고 저장소 초안에는 미발행 문구를 넣는다. 비밀 초안 보관 기능은 제공하지 않는다. 미공개로 작업하려면 저장 전 기기 내 초안으로 유지하거나 파일로 내려받는다. 공개 branch/PR/Actions artifact를 비공개 보관소처럼 쓰지 않는다.

웹용 패키지는 공개 JSON을 집계해 release ID 아래 생성하고 마지막에 latest manifest를 바꾼다. 저장소 공개는 commit 즉시, 홈페이지 반영은 배치·캐시 갱신 이후다. 모든 파일을 쓰고 hash/schema를 검증한 뒤 manifest를 바꿔 버전이 섞이지 않게 한다.

정정·철회는 새 revision으로 남긴다. 홈페이지에서 숨겨도 이미 공개된 Git 이력·복제본을 회수할 수 있다고 설명하지 않는다. 전체 저장소 손실 대비 운영자는 주기적으로 main/data를 포함한 git bundle을 자신의 기기에 내려받고 분기별 복구를 점검한다. 별도 비공개 원격 저장소는 사용하지 않는다. GitHub 장애 중에는 온라인 저장을 성공으로 표시하지 않고 기기 초안을 유지한다.

## 10 API와 코드 구조

### 10.1 API 계약

| Method | 경로 | 인증 | 결과 |
|---|---|---|---|
| GET | `/api/public/forecast?date=&site=&zone=` | 없음 | 공개 release의 forecast와 metadata |
| GET | `/api/public/observations` | 없음 | 공개 관측 요약·pagination |
| GET | `/api/public/status` | 없음 | 공개 가능한 소스 신선도·운영 상태 |
| GET | `/api/auth/csrf` | 진입점 | 짧은 수명 로그인 CSRF token, no-store |
| POST | `/api/auth/login` | 비밀번호·CSRF·Origin·WAF | 자체 관리자 인증·세션 생성 |
| POST | `/api/auth/logout` | 세션·CSRF | 쿠키 삭제 |
| GET | `/api/admin/session` | 필수 | 최소 세션 상태 |
| GET/POST | `/api/admin/observations` | 필수 | 관리 목록/신규 공개 저장 |
| GET/PATCH | `/api/admin/observations/{id}` | 필수 | 상세/공개 revision 생성 |
| POST | `/api/admin/observations/{id}/withdraw` | 필수 | 철회 revision 생성. Git 이력 유지 |
| POST | `/api/admin/requests/status` | 필수 | body의 key로 멱등 요청 결과 조회. 요청 본문 로그 기록 금지 |
| GET/POST | `/api/admin/research` | 필수 | 목록/공개 저장소에 원고 저장 |
| GET/PATCH | `/api/admin/research/{id}` | 필수 | 공개 초안 상세/조건부 수정 |
| POST | `/api/admin/research/{id}/publish` | 필수 | 검증 후 홈페이지 release 요청 |
| GET/PATCH | `/api/admin/sites/{id}` | 필수 | geometry와 표시 설정 |
| POST | `/api/admin/jobs` | 필수 | 수집/재계산/발행 요청 파일 생성 |
| GET | `/api/admin/jobs/{id}` | 필수 | queued/running/succeeded/failed 상태 |

사이트 설정 목록은 `/api/admin/sites`, 신규 Site 등록은 목록 POST로 구현한다. job 요청은 공개해도 되는 kind·대상·무작위 ID만 저장하며 data branch의 trusted push workflow가 처리한다. URL·credential·shell command를 임의 job 인자로 받지 않는다. 로그인 시도·실패는 Git에 저장하지 않는다.

POST 관측 성공은 201, 멱등 재시도 성공은 200, 비동기 job 요청은 202다. 401 미인증/잘못된 자격증명, 403 권한 또는 Origin 위반, 409 충돌, 422 데이터 검증 오류, 429 제한, 503 의존 서비스/필수 인증 설정 장애를 구분한다. 오류 형식은 code, message_key, field_errors, retryable, request_id다. 민감한 원본 GitHub 응답이나 credential을 반환하지 않는다.

### 10.2 공개 저장소 main branch 구조

```text
AGENTS.md
PRD.md
README.md
.env.example
apps/web/
  app/[locale]/
  app/admin/
  app/api/
  components/
  i18n/ko.json
  i18n/en.json
  server/auth/
  server/git-store/
  server/public-data/
packages/contracts/
  json-schema/
  fixtures/synthetic/
engine/
  sources/
  features/
  analog/
  validation/
  export/
config/
  defaults.json
  source-registry.example.json
docs/
  setup.ko.md
  setup.en.md
  operations.md
  methodology/
  adr/
tests/
  unit/
  integration/
  e2e/
ops/
  workflows/
.github/workflows/
```

Web는 Next.js·TypeScript, 엔진은 Python을 기본안으로 한다. 버전은 구현 시작 시 공식 지원 상태를 확인하고 lockfile로 고정한다. 계약은 JSON Schema를 정본으로 두고 TS/Python에서 같은 fixture를 검증한다. 실행 명령은 구현 저장소의 실제 package/script 설정과 일치시킨다. 이 문서 자체는 실행 가능한 앱 scaffold가 아니다.

### 10.3 같은 공개 저장소 data branch 구조

```text
config/sites.json
config/zones.json
observers/
observations/{id}/current.json
observations/{id}/revisions/{revision}.json
environment-links/
idempotency/{requestDigest}.json
audit/
snapshots/{date}/{runId}/
seals/
backfills/
research/drafts/
research/releases/
jobs/requests/
jobs/results/
models/
scalers/
releases/{releaseId}/
latest.json
.github/workflows/on-data.yml
```

`security/access.json`과 비공개 메모 파일은 없다. 로그인 설정은 환경변수에만 존재한다. data branch의 on-data workflow는 설치 시 운영자가 배치하는 작은 trusted entrypoint이며 공개 main의 고정 commit에 있는 reusable workflow를 호출한다. 일반 저장 토큰은 workflow 변경 권한을 갖지 않는다. 실행 코드는 검토된 고정 commit에서 가져오고 data branch의 파일을 명령이나 스크립트로 실행하지 않는다. code_ref 갱신은 별도 코드 변경으로 검토한다.

## 11 GitHub Actions와 운영

| Job | 위치·트리거 | 작업 |
|---|---|---|
| CI | main 대상 PR/push | 타입·스키마·엔진·인증 테스트, 번역 누락, 빌드, secret 검사 |
| Bootstrap history | main의 수동 workflow | 과거 환경·표준화 분포 생성 후 허용된 파생자료를 data에 저장 |
| Refresh forecast | main의 매일 2회 및 수동 workflow | 수집·feature·Analog·snapshot·웹 release를 한 파이프라인에서 생성 |
| Seal D+1 | main의 WITA 20:17 workflow | 20:00 전 실제 보존 snapshot 중 공식 seal 생성 |
| Observation enrich | data의 관측 변경 push entrypoint | 당시 snapshot 결합, 품질 검사, 웹 release 갱신 |
| Publish research | 자체 인증 관리자 서버의 명시적 발행 요청 | 네 원고·metadata·results·검토 상태를 검사하고 공개 release/index를 원자 저장. 자동 모델 job은 연구를 발행하지 않음 |
| Validate models | main의 주 1회 및 수동 workflow | 날짜 단위 검증·모델 비교·공개 미발행 보고서 생성 |
| Recovery check | 운영자 수동 | 저장소 bundle 다운로드·복구 점검 |

예약 workflow는 기본 branch main에 둔다. data push의 entrypoint는 검토된 workflow의 고정 commit을 호출하고 입력 데이터만 읽는다. 웹 PAT가 생성한 data push와 GITHUB_TOKEN이 생성한 후속 commit의 event 동작을 구분한다. GITHUB_TOKEN commit이 다음 workflow를 자동 실행할 것에 의존하지 않고 enrich→forecast→release를 필요한 하나의 job chain에서 이어 실행한다.[R5]

배치는 해당 저장소의 GITHUB_TOKEN과 필요한 최소 Contents 쓰기 권한을 사용한다. 별도 publisher App은 만들지 않는다. code/main 보호 규칙과 data 직접 쓰기 규칙을 구분한다. 외부 PR은 secret 없이 테스트하고 자동 병합·데이터 반영을 하지 않는다. 외부 PR 코드를 privileged workflow로 checkout하지 않는다. 외부 Actions는 commit SHA로 고정한다.

수집·seal·publish는 작업별 concurrency group을 사용하고 불변 snapshot 생성 중 작업을 무조건 취소하지 않는다. 웹 저장과의 branch 충돌은 9.4 규칙으로 해결한다. 산출물 commit으로 반복 실행되지 않도록 경로 필터와 event 구분을 적용한다. data branch push로 Vercel preview build를 만들지 않는다.

공개 저장소의 예약은 지연되거나 비활성 조건의 영향을 받을 수 있다.[R5] `/status`는 실제 snapshot age로 누락을 표시한다. 수동 재시도는 같은 작업의 중복 실행 방지와 상태 확인을 포함한다. 한 소스가 실패하면 source별 상태를 남기고 필수 gate 실패 시 숫자를 발행하지 않는다. timeout·backoff·상한과 Retry-After를 적용한다.

v1 목표는 오전 데이터 08:00, 저녁 D+1 후보 20:00 WITA 이전 준비다. 운영 목표이며 SLA가 아니다. 저장 목표 p95 10초 이하, 홈페이지 반영 목표 5분 이내를 정상 조건에서 측정한다. source age·quota·job 실패·공개 반영 지연을 표시한다. 표준 공개 Actions와 호스팅 포함량 안에서 시작하되 무료 무제한 저장·트래픽을 보장하지 않는다. 원 NetCDF를 매 실행 내려받거나 원자료를 Git 이력에 누적하지 않는다. FES는 검증된 로컬 atlas에서 기간별 조석 파생값을 생성하고 data에 허용된 값·provenance만 저장한다. 일반 수집은 코드에 고정된 hash·좌표·계산 코드·기간을 검증해 재사용한다. 동적 Copernicus·기상 자료는 새로 수집하며 조석 생성 시각을 새 issued time으로 바꾸지 않는다.

## 12 전문가용 연구와 일반인용 발행

### 12.1 문서의 성격

첫 발행물은 독립적인 관측 프로젝트의 **방법론 및 관측 보고서**다. 저널 게재·동료심사를 받지 않았다면 `자체 발행 연구 보고서 · 동료심사 미실시`와 `Independent research report · Not peer reviewed`를 명시한다. 데이터가 부족한 단계에서는 방법과 연구 계획을 발행하고 성능 결과를 꾸며 넣지 않는다. 보고서는 서비스의 동작을 설명하고 축적된 근거에 따라 개정한다.

같은 연구 release에 다음 네 문서를 묶는다.

| 독자 | 한국어 | 영어 |
|---|---|---|
| 전문가 | technical.ko.md | technical.en.md |
| 일반인 | guide.ko.md | guide.en.md |

일반인용은 전문가용의 단순 축약 번역이 아니라 질문·그림·사례 중심으로 재서술한다. 데이터 cutoff, 모델 버전, 핵심 결과 수치, 한계와 결론은 일치해야 한다. 한국어 원고가 정본이며 번역은 같은 release를 따라간다. 문서 제목과 연구 결과는 실제 내용에 맞게 정하고 결과가 나오기 전 효과·정확성을 암시하지 않는다.

### 12.2 전문가용 필수 구성

1. 제목, 저자·기여 역할, 버전, 작성일, 공개 상태, 동료심사 여부.
2. 초록: 질문, 자료 범위, 방법, 검증 상태와 확인된 결과만 기재.
3. 연구 지역과 Site/Zone geometry, 격자 한계, 관찰자와 관측 프로토콜.
4. PCI 정의·anchor·rubric 버전, 측정 타당성 한계와 관찰자 bias.
5. 자료 출처·dataset·native resolution·품질·시점과 forecast snapshot 정책.
6. Feature 계산, 결측 처리, 거리·weight·support gate, 구현 버전.
7. 시간 순서 검증, 날짜 그룹, baseline, 모델 선택과 tuning 절차.
8. 결과: 관측 수와 날짜 수, Site coverage, MAE, 제공률, 사건 근거, 성능이 없는 부분.
9. 논의: 소표본, 방문 Site 선택 편향, 주관 평가, 장비·상태 변화, grid/site mismatch, distribution shift.
10. 재현 manifest, 공개 가능한 데이터, 재배포 제한 자료 제외 범위, 라이선스와 참고문헌.
11. 변경 이력, 정정, 미해결 질문과 다음 관측 계획.

관측과 모델링의 상관관계를 조석이나 지형의 인과효과로 단정하지 않는다. 같은 날 여러 Site를 방문한 자료도 방문 시각·깊이·경로가 달라 완전한 통제 실험이 아니다. 누락과 모델이 예측하지 못한 사례를 결과에서 제외해 성능을 좋게 보이게 하지 않는다.

### 12.3 일반인용 필수 구성

`무엇을 보여주는 서비스인가`, `PCI 눈금을 읽는 방법`, `관측 부족이 뜻하는 것`, `같은 날 Site별로 다를 수 있는 이유`, `모델 자료와 현장 경험의 차이`, `이번 자료에서 실제로 배운 것`, `아직 모르는 것`을 평이한 언어로 설명한다. 예시는 실제와 가상을 명확히 구분한다. PCI·수직 근거·Support를 읽는 예를 포함하고, 관측 횟수가 늘면 자동으로 정확해지는 것처럼 설명하지 않는다.

홈페이지 `/pci`에서 눈금과 기준 사건을 상시 공개하고 연구 문서의 해당 버전으로 연결한다. 대시보드의 PCI·Support 옆에도 짧은 정의와 상세 링크를 제공한다. 전문 문서를 읽지 않아도 핵심 해석과 한계를 이해할 수 있어야 한다.

### 12.4 발행 흐름

`draft → in_review → ready → published → superseded/withdrawn` 상태를 둔다. 연구 편집은 Markdown 본문과 구조화 metadata를 사용하고 관리자 편집 내용이 서버 코드를 실행할 수 없게 한다. 메트릭·차트·표는 하나의 `results.json`과 manifest에서 생성해 네 원고에 연결한다. 자동 숫자 검사와 사람의 서술 검토를 함께 수행한다. 원고의 숫자 표는 `{{metrics.<key>}}` 또는 `{{results}}`로 단일 results를 참조하고 숫자 literal 표는 거부한다. 일반 서술의 수치·해석은 사람이 확인한다. 철회된 URL은 안내만 제공하고 본문·저자·결과는 홈페이지에서 제공하지 않는다. 이전 Git 이력은 유지한다.

발행 버튼 전에는 네 문서 존재, 같은 연구 버전, 번역 검토, 출처 링크, 실제 데이터/가상 예시 구분, 공개 필드 검사, 데이터 라이선스, 재현 manifest를 검사한다. 이 항목은 요청한 연구 공개를 구체적으로 검수하기 위한 제품 기능이다. 준비가 안 된 원고는 홈페이지 미발행 상태로 남긴다. 서버에 저장한 초안도 공개 저장소에서 읽을 수 있다는 점은 9.5를 따른다.

발행 후 동일 버전의 내용을 조용히 교체하지 않는다. 수정판은 새 버전과 변경 이유를 갖고 이전 버전을 열람 가능하게 유지한다. 잘못된 개인정보는 별도 철회 절차로 처리한다. 데이터가 추가되어도 연구 결론을 자동 발행하지 않는다. 관리자가 결과와 두 독자용 해석을 검토하고 발행한다.

HTML이 기본 공개 형식이고 인쇄 스타일을 제공한다. PDF와 DOI/외부 preprint 등록은 후속 버전의 선택 기능이다. DOI나 심사 이력을 실제로 발급·수행하지 않고 만들어 넣지 않는다.

## 13 출시 검수 기준

| ID | 시나리오 | 통과 조건 |
|---|---|---|
| PUB-01 | 비로그인 공개 열람 | 대시보드·PCI·연구를 ko/en으로 읽을 수 있음 |
| AUTH-01 | `/admin` 직접 요청 및 보호 API 직접 호출 | 미인증 페이지는 로그인으로, API는 401. 관리 세션·조작 화면 유출 없음 |
| AUTH-02 | 틀린 관리자 아이디·비밀번호 | 동일한 일반 오류, 세션 발급 없음 |
| AUTH-03 | login CSRF·변조/만료 쿠키·다른 Origin | 로그인/쓰기 거부. 세션·비밀 유출 없음 |
| AUTH-04 | enabled=false 또는 auth_version 변경 후 재배포 | 새 production에서 이전 세션 거부. 구버전 URL의 관리자 접근 차단 |
| AUTH-05 | 여러 함수 인스턴스로 반복 로그인 | 배포한 WAF 규칙대로 지역별 IP 제한 적용, 초과 429. 메모리 limiter에 의존하지 않음 |
| DATA-01 | 카테고리만 있는 과거 관측 | 수치 자동 변환 없음 |
| DATA-02 | 기존 9/19 import | 약 1.00/down 보존. 전체/수평/수직 강도 임의 확정 없음 |
| MODEL-01 | 전체 1개 또는 같은 날 3개 label | PCI null, 명시 reason code |
| MODEL-02 | 유효 numeric 3일과 모든 gate 충족 | Experimental 수치와 실제 Support 표시 |
| MODEL-03 | 핵심 소스 누락·stale·geometry 미확인 | raw 상태 제공, 새 숫자 PCI 발행 차단 |
| MODEL-04 | all-known vertical이 한 사건만 존재 | 수직 evidence 근거 부족, 확률 없음 |
| MODEL-05 | 유속 방향·수심·시간 보간 | 알려진 벡터 fixture와 일치, 범위 밖 null |
| VAL-01 | 날짜가 겹치는 dive/Peak 파생행 | 같은 fold, 미래 label/scaler 유입 없음 |
| SNAP-01 | D+1 cutoff 전후 완료한 run | 실제 cutoff 전 snapshot만 공식 seal에 포함 |
| SNAP-02 | 같은 run 재실행 | 기존 immutable snapshot 불변, 새 run ID 또는 멱등 결과 |
| SAVE-01 | 더블 탭·timeout 후 같은 key 재전송 | 한 관측·한 revision만 생성 |
| SAVE-02 | 두 기기의 동시 수정 | 한쪽 성공, 다른 쪽 409. 조용한 덮어쓰기 없음 |
| SAVE-03 | 관측과 batch의 동시 commit | unrelated 변경 보존, ref 충돌 안전 재시도 |
| MOB-01 | 360px 화면·소프트 키보드 | 필수 필드·저장 버튼 접근 가능, 페이지 가로 넘침 없음 |
| MOB-02 | 입력 후 통신 끊김·세션 만료 | 초안 유지, 재인증 후 중복 없이 저장 |
| MOB-03 | 로그아웃·다른 계정·오프라인 재접속 | 미전송 기기 초안·관리 세션 자동 노출 없음 |
| I18N-01 | 언어 전환과 WITA 자정 | 같은 Site/날짜 유지, date grouping 정확 |
| EXPORT-01 | notes_private·password 등 금지 필드 제출 | 첫 Git commit 전 422. 인증 비밀이 데이터·bundle·로그에 없음 |
| OPEN-01 | 관측 공개 저장 및 정정 | data branch에 즉시 JSON·revision 누적. 홈페이지는 후속 갱신 |
| OPEN-02 | 외부 fork/PR 생성 | 원본 변화 없음. 관리자 승인/병합 없는 데이터 반영 없음 |
| OPEN-03 | 공개 연구 draft 저장 | 저장소 열람 가능, 홈페이지 published 목록에는 미노출 |
| RES-01 | 한 문서 번역 누락 또는 metric hash 불일치 | 연구 발행 차단, 초안 보존 |
| RES-02 | 발행 후 수정 | 새 버전 생성, 변경 이력과 이전 버전 유지 |
| OPS-01 | 수집 실패·GitHub 429/503 | 상태 표시·제한된 재시도·잘못된 성공 없음 |
| OPS-02 | backup으로 복원 | 관측 revision·manifest·seal hash 일치 |

공개 화면의 주요 콘텐츠 로딩 목표는 모바일 조건에서 LCP 2.5초 이하이며 실제 네트워크 프로필과 측정 방식을 기록한다. 차트 전체 번들을 첫 화면에 강제하지 않고 텍스트 상태와 표를 먼저 렌더링한다. 테스트는 단순 스냅샷 수보다 인증 경계, 통계 누수, 저장 무결성, 모바일 실패 복구를 우선한다.

## 14 구현 단계와 출시 전 설정

### 14.1 구현 순서

1. **계약과 기초 화면**: ko/en, 공개/관리 경계, 스키마, 합성 fixture, 실제 기록 이관 규칙, 모바일 form.
2. **인증과 Git 저장**: 자체 로그인·환경변수, 세션, revision, 멱등성, 동시성, 초안 복구. 실제 저장 성공까지 end-to-end 확인.
3. **환경과 snapshot**: 소스별 capability 검증, geometry 확인, 최소 subset, 보간, D+1 보존, stale 상태.
4. **Cold-start 공개 서비스**: 원자료·PCI 기준·관측 현황·anchor 유사성 가능 여부. 가짜 수치 없이 공개 가능.
5. **Analog와 검증**: numeric gate, 날짜 단위 검증, support, 모델 버전, baseline 보고.
6. **연구 발행**: 전문가/일반인 각각 ko/en, 관리자 편집·미리보기·발행, 결과 manifest 연결.
7. **운영 출시**: 인증·privacy·모바일·복구 검수, 실제 credential 분리, 출처 표시, source별 라이선스 확인.

실제 예측 품질 확보 기간은 구현 일정과 분리한다. 앱 개발이 끝나도 충분한 label이 없으면 cold-start로 운영한다. 본 요청의 산출물은 PRD와 AGENTS 파일이며 앱·논문 본문·저장소 생성·배포 자체는 별도 구현 작업이다.

### 14.2 운영자가 제공해야 하는 설정

| 항목 | 기본 방향 | 미확정 시 처리 |
|---|---|---|
| 이름·도메인 | 가칭 Bunaken Current Observatory | 로컬/preview에 가칭 사용 |
| 관리자 인증 | username, encoded password hash, session secret, auth version | 실제 로그인 비활성 |
| 공개 저장소 | main 코드, data JSON. 비공개 저장소 없음 | Git 저장 실연결 불가 |
| GitHub 쓰기 credential | 만료일 있는 fine-grained PAT, 선택 저장소 Contents 쓰기 | 합성 fixture로 개발 가능 |
| 로그인 시도 제한 | Vercel WAF login POST 규칙 | 실제 규칙 적용·검증 후 관리자 공개 |
| 소스 계정·데이터셋 | FES, Copernicus, Open-Meteo | 미확인 source는 unavailable |
| Site/Zone geometry | 확인된 좌표·축·수심 | 미검증으로 표시, 관련 숫자 gate 차단 |
| 9/19 label 의미 | 전체인지 사건 Peak인지 확인 | anchor 보존, numeric training 보류 |
| 소스 라이선스 | 원자료·파생자료 조건 기록 | 해당 자료의 공개 export 차단 |
| 코드 라이선스 | MIT를 후보로 두되 의존성 검토 | LICENSE를 임의 확정하지 않음 |
| 연구/관측 공개 라이선스 | 직접 작성 콘텐츠 CC BY 4.0 후보 | 권리 확인 후 실제 적용 |
| High 오차 기준 | 전진 검증과 사전 기준 | High 비활성 유지 |

라이선스 결정은 코드·자체 콘텐츠·제3자 자료를 따로 관리한다. FES 관련 도구의 라이선스와 결합 방식에 따라 배포 의무가 달라질 수 있으므로 MIT 표기를 전체 데이터·도구에 일괄 적용하지 않는다.

### 14.3 후속 버전 후보

다중 관찰자 calibration, PWA, 실제 Peak 예측, calibrated 수직 확률, GAM 모델 비교, PDF 연구 보고서, 외부 논문 제출, 기기 센서 연동은 후속 범위다. 공개 사용자 회원가입·관측 투고·커뮤니티 기능은 현재 포함하지 않는다.

## 15 구현 근거와 참고 자료

다음 공식 문서는 2026-09-27 확인했다. API와 제공 조건은 바뀔 수 있으므로 실제 구현 시 재확인하고 사용 버전을 고정한다. 본 문서의 모델 threshold·weight·운영 목표는 제품 초기 결정이며 아래 문서가 그 수치의 과학적 타당성을 보장하는 것은 아니다.

- [R1 OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) 및 [Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) — 해시·로그인 보호 기준.
- [R2 GitHub fine-grained PAT 관리](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) — 서버 저장용 토큰의 저장소·권한·만료 설정.
- [R3 Git references API](https://docs.github.com/en/rest/git/refs) 및 [Git database API guide](https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-your-git-database) — tree/commit/ref 기반 파일 저장.
- [R4 Vercel sensitive environment variables](https://vercel.com/docs/environment-variables/sensitive-environment-variables) — 서버 비밀 설정.
- [R5 GitHub Actions events and schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) — 스케줄 지연·운영 제약.
- [R6 AVISO FES product](https://www.aviso.altimetry.fr/en/data/products/auxiliary-products/global-tide-fes.html) 및 [FES2022 release](https://www.aviso.altimetry.fr/en/data/products/auxiliary-products/global-tide-fes/release-fes22.html) — 조석 자료와 사용 조건.
- [R7 Copernicus GLO12 product migration and datasets](https://help.marine.copernicus.eu/en/articles/7045314-migration-from-psy4-to-glo12-for-the-global-ocean-physics-analysis-and-forecast-product) 및 [products and datasets](https://help.marine.copernicus.eu/en/articles/4703373-differences-between-copernicus-marine-products-and-datasets-and-their-identifiers) — 변수·시간해상도 구분.
- [R8 Open-Meteo terms](https://open-meteo.com/en/terms) 및 [Marine Weather API](https://open-meteo.com/en/docs/marine-weather-api) — API 사용 조건·해양 변수.

- [R9 Vercel WAF Rate Limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) 및 [WAF Usage and Pricing](https://vercel.com/docs/vercel-firewall/vercel-waf/usage-and-pricing) — 자체 로그인 요청 제한, 지역별 카운터와 플랜 범위.

연구 보고서 발행 시에는 Analog Ensemble, 주관 척도 측정, 날짜 단위 검증, GAM 방법론에 관한 실제로 검토한 학술 문헌을 추가한다. 대화에 등장한 논문 링크를 내용 확인 없이 결과의 근거로 인용하지 않는다.

2026-10-04 입력 간소화: 날짜는 한 번 선택하며 다음 날 출수만 별도 표시한다. 출수는 시작보다 늦어야 한다. 저장 schema 1.4를 적용하고 과거 1.0–1.3의 nullable 출수는 읽기 호환한다. 신규 Peak·Zone·경로 입력은 제외하고 저장된 과거 값은 유지한다. 빈 Peak 섹션은 상세·수정에 표시하지 않는다. 공개 기록 목록은 입수 최신순이며 로딩 힌트를 표시한다.
