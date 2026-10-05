# 공개 대시보드와 release 운영

P4 화면은 ko/en, WITA 내일 기본값, 오늘부터 D+7, Site 비교·상세·조석·공개 관측·PCI 기준·방법론·자료 상태를 지원한다. Site 예측 기준 수심은 18m다. 현재 release는 experimental이며 공식 D+1 발행이 아니다. P5 모델·검증 gate는 구현되어 있으며 모든 적격 조건을 통과한 슬롯에만 숫자 PCI를 제공한다.

## 로컬 확인

웹의 서버 환경변수 `GITHUB_OWNER`, `GITHUB_REPO`가 공개 data branch 읽기 대상을 정한다. 읽기에 PAT를 사용하지 않는다. 아직 release가 없으면 연결 전 상태와 빈 자료를 보여준다. release 파일이 잘못되면 실제 값을 만든 것처럼 표시하지 않는다.

```sh
pnpm dev
```

`/ko`, `/en`, `/{locale}/sites/{slug}`, `/{locale}/observations`, `/{locale}/pci`, `/{locale}/methodology`, `/{locale}/status`, `/{locale}/research`, `/api/public/status`를 제공한다. 언어 전환은 선택 Site와 날짜를 유지한다. 1920×1080에서는 PCI 그래프를 상단 전체 폭으로 표시한다. Site를 조회하거나 표의 Site명을 선택하면 해당 Site 곡선만 표시한다. 아래 단일 표는 19 Site 오전·오후 PCI, 동향·북향 유속(m/s), 바람 방향(°), 파고(m)를 유지한다. 표의 상세 링크는 날짜를 유지한 Site 상세로 이동한다. 표 내부를 가로·세로 스크롤하며 헤더와 Site명은 고정한다. 우측 환경 패널은 제거하고 조석·환경 종합은 Site 상세에서 제공한다.

환경 비교값은 선택 날짜 12:00 WITA와 정확히 일치하는 실제 sample이다. 같은 시각 중복·누락, 수심 불일치, 품질·공개 권한 미충족, stale release는 미제공으로 표시한다. 최근접 시각으로 대체하거나 방향을 평균하지 않는다. 메인 hint의 margin-top은 8px다. 그래프 해석·표시 불가 사유·기준 사건·출처·생성 정보는 연구 상세에서 확인한다. 정상 생성 시각은 연구 상세로 옮기되 오래된 자료의 생성 시각은 메인에 유지한다.

PCI 그래프의 가로축은 08:00–16:00 WITA의 다이빙 시작 시각, 세로축은 60분 대표 체감 PCI다. 서버의 유효한 30분 시작 슬롯만 Site별로 연결하고 null·같은 Site 내 중복·빠진 시간 구간은 끊는다. Site 간 수치를 하나의 평균 PCI로 합치지 않는다. 1.0 초과를 허용하며 1.0을 상한·위험선으로 사용하지 않는다. 초기 v1.1 실제 데이터 통합에서는 모든 슬롯이 null이었다. 최신 v1.3 로컬 검증은 18m 비교 범위에서 재계산하며 결과·미제공 사유는 PLAN의 후속 검증에 기록한다. 로컬 패키지 생성만으로 홈페이지가 갱신되지는 않는다. 수직조류·방향·위험도는 이 곡선만으로 판단하지 않는다.

조석은 높이 m이며 현장 유속이 아니다. 독립 보조 그래프로 표시하고 PCI와 서로 다른 단위를 같은 축에 겹치지 않는다. 곡선 아래 접이식 수치 표를 제공한다.

로컬 수집은 clean trusted checkout과 실제 code SHA가 필요하다. 아래 명령은 기본값이 로컬 저장이며 공개 Git에 쓰지 않는다. 기존 output에 다른 바이트를 덮어쓰지 않는다.

```sh
CODE_COMMIT=$(git rev-parse HEAD)
uv run --env-file .env --project engine --extra providers --locked \
  python -m bunaken_engine collect --date 2026-10-04 \
  --code-commit "$CODE_COMMIT" --output .local/dashboard-collection-next
```

geometry나 필수 자료가 부족하면 snapshot은 failed, PCI는 null이다. 확인된 좌표의 FES 조석은 별도로 수집할 수 있지만 전체 예측 적격을 대신하지 않는다. 로컬 snapshot과 공개 가능한 관측 배열로 release 파일을 생성할 수 있다.

```sh
uv run --project engine --locked python -m bunaken_engine.public_release \
  --source-data-commit <40-character-data-head-sha> \
  --snapshot .local/dashboard-collection-next/snapshots/<date>/<run-id>/manifest.json \
  --observations <validated-public-observations.json> \
  --output .local/dashboard-release-next
```

선택 인자 snapshot/observations를 생략하면 해당 자료는 빈 배열이다. 로컬 생성만으로 data branch 저장이나 홈페이지 반영이 완료되지는 않는다. data SHA는 입력 provenance이며 실제 원격 발행 때는 해당 head의 현재 관측·snapshot과 다시 대조한다. main code SHA로 data head를 대체하지 않는다.

## 검증과 원자적 발행

release 1.1은 `web/releases/{uuid}/manifest.json`, `dashboard.json.gz`, `web/latest.json` 세 파일이다. gzip의 압축 바이트 hash, JSON Schema, 19 Site metadata, 허용 소스·단위·재배포 조건, snapshot 일치, anchor 복원 상태를 검사한다. 원격 발행은 source head의 현재 observation revision 전체를 대조하며 일부 기록을 빠뜨리는 패키지를 거부한다.

압축 파일은 1,250,000byte 이하, 해제 JSON은 10,000,000byte 이하로 제한한다. 최신 pointer를 먼저 바꾸지 않고 세 파일을 원자적 Git commit과 non-force ref 갱신으로 반영한다. head 경쟁·관측 변경이면 실패하며 이전 latest를 보존한다. 같은 후보의 응답 유실 재시도는 이미 저장된 바이트를 확인한다.

P7 운영 연결 후 CLI의 `--publish`를 명시한 경우에만 공개 저장한다. `.env`를 읽는 발행 명령은 `uv run --env-file .env ...` 형태다. output 경로를 유지하고 같은 명령으로 재시도한다. 저장소/PAT 설정과 source_data_commit에 해당하는 원격 데이터가 필요하다. 이미 존재하는 local output의 publish는 그 후보를 재사용한다.

trusted 환경 workflow는 collect→receipt/confirmation→web release를 한 chain에서 수행한다. 다음 workflow가 GITHUB_TOKEN commit으로 자동 실행될 것에 의존하지 않는다. template의 고정 code SHA·원격 설치·Secrets·실제 실행은 P7 검수 대상이다. 이 작업에서는 push·원격 실행·배포를 수행하지 않았다.

## 실제 패키지 통합 확인 (2026-10-05)

현재 관측 18개·19 Site·예측 슬롯 304개를 담은 release 후보를 로컬에서 생성했다. gzip 97,080byte, 해제 JSON 5,047,981byte로 크기 제한을 통과했다. 실제 웹 서버 reader에 생성 파일을 공급하여 pointer·manifest·gzip hash·공개 소스 계약을 검증했다. 손상 파일, hash를 다시 계산한 허용되지 않는 소스 variable, 미래 생성 시각은 거부했고 오래된 source 생성 시각은 stale로 처리했다. 환경 화면은 실패 source의 reason code가 있으면 정상 수치에서 제외한다.

동일 입력의 release 재생성 바이트 일치도 확인했다. 로컬 후보는 `.local/p3-integration-2026-10-05/release/`에 있으며 원격 latest 갱신·홈페이지 반영은 수행하지 않았다. 반복 검증 명령은 README의 공개 release reader integration 항목을 따른다.

## 캐시와 시각

웹은 latest를 60초 재검증하고 hash로 연결된 immutable gzip 자산을 공유 캐시한다. 한 응답의 Site metadata와 수치는 같은 release를 사용한다. 압축 크기 제한은 Next fetch cache의 base64 저장 크기도 고려한다. status API는 CDN 60초, stale-while-revalidate 300초다.

release 생성 시각과 source snapshot 생성 시각은 별개다. source age는 원본 시각으로 계산하며 새 release로 포장해도 초기화하지 않는다. 오래된 release는 오래된 상태를 명시한다. snapshot이 없는 cold-start release는 source 생성 시각을 null로 둔다.

오전·오후는 각각 8개 30분 시작 슬롯 중 6개 이상 유효할 때 중앙값을 표시한다. 부분 자료의 최대와 전체 예측 곡선 최대를 구별한다. 각 슬롯은 60분 대표 PCI이고 순간 최대 유속이 아니다. 집계 Support는 가장 낮은 슬롯 수준, 최대값 Support는 해당 슬롯 수준을 표시한다.

## 남은 운영 검수

공식 D+1 seal의 cutoff 적격 출력 연결, GitHub protected environment·workflow 설치, Vercel 배포·WAF·캐시 반영 지연, 실제 iOS/Android 모바일 검수는 P7에 남아 있다. FES reference proof도 현재 geometry/code hash와 맞는 runner 근거를 설치해야 한다. 로컬 수치 비교를 원격 proof로 복사해 통과시켰다고 주장하지 않는다.

## 환경 종합

상단에서 날짜·Site와 달의 위상·밝은 면 비율을 함께 확인한다. 달은 USNO의 해당 날짜 WITA 정오 천문 자료이며, 모양은 위상 도식이다. PCI 학습 입력이나 immutable forecast snapshot과 별도다. API 장애 시 달만 미제공으로 표시한다.

Site 상세의 조석 아래 환경 표는 광역 조류의 동향/북향 성분, 모델 수온·염분, 10m 바람·방향, 파고·주기·방향과 너울 높이·주기·방향을 제공한다. 수심이 있는 자료는 Site 대표 수심과 일치해야 한다. 점의 가로축은 공통 00–24 WITA이며 자료 없는 구간을 연결하거나 보간하지 않는다. 숫자 범위는 제공 시각만 대상으로 한다. 방향은 최소·최대 대신 점과 펼친 시각별 값을 확인한다.

`환경 값·출처·품질 상세`에서 원해상도, 발행·조회·공급 갱신 시각과 품질 상태를 확인한다. 공개 권한, 격자·geometry, freshness가 미확인인 자료는 사유를 표시한다. 오래되거나 실패한 공급자료는 정상 수치로 표시하지 않는다. 조석 높이, 광역 모델 유속, 체감 PCI는 다른 지표다.

신규 dashboard 1.1의 환경 배열과 출처 실패 사유는 같은 snapshot에서 발행·검증한다. 구버전 dashboard 1.0은 환경 자료 대기로 표시한다. 실제 raw NetCDF나 비공개 연구 파일을 웹에 연결하지 않는다.
