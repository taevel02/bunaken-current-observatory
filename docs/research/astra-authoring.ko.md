# Astra 원고 작성 지시문

아래를 Astra 세션에 전달한다. 연구 저자·공개 별칭·기여 역할은 사용자가 확인한 정보만 사용한다. 근거 문서는 읽기 입력이며 자동 배포·GitHub 쓰기를 허용하지 않는다.

```text
부나켄 PCI 예측 프로젝트의 첫 웹 공개용 방법론 및 초기 관측 보고서를 작성하라.
구현, 모델 변경, 환경 재수집, GitHub 저장, 배포, 발행은 하지 않는다.

AGENTS.md, PRD.md v1.9, SPEC.md v2.1, PLAN.md와
docs/research/evidence-2026-10-05/README.ko.md를 먼저 읽어라.
같은 디렉터리의 manifest/results/integration/forward/lodo와
model/features/geometry/sites/sources JSON을 근거로 사용하라.
temperature-checks는 frozen snapshot 이후의 별도 확인이다.
.env, 토큰, 세션, 원 atlas와 재배포 제한 원자료는 읽거나 인용하지 않는다.

산출물:
1. technical.ko.md: 전문가용 방법론 및 초기 관측 보고서
2. guide.ko.md: 강사와 일반 다이버용 연구 해설
3. 한국어를 사용자 검토한 뒤 technical.en.md, guide.en.md
4. metadata.json: 실제 확인한 저자/역할·제목·참고 자료·변경 이유
5. 주장별 근거 파일/필드 목록과 미확인 사항 목록

한국어가 정본이다. 일반용은 전문가용의 단순 축약이 아니라
PCI의 의미, 현장 기록 방법, 그래프 읽기와 한계를 쉽게 설명한다.
네 파일은 같은 version/data_cutoff/model_version/dataset_sha256/results를 따른다.
원고에는 frontmatter 없이 본문만 작성한다. 최종 bundle 생성 도구가
context와 결과 hash를 붙인다. 숫자 표에는 literal을 쓰지 않는다.
results.metrics의 {{metrics.<key>}} 또는 {{results}}를 사용한다.
표에 필요한 수치가 results에 없다면 임의 추가하지 말고 요청 목록에 남긴다.

전문가용 구성:
제목·저자·버전·동료심사 여부, 초록, 연구 지역·관측 프로토콜,
PCI 정의·anchor·observer bias, 공급 자료·native resolution·provenance,
실제 사용 feature·Weighted Analog·weight·numeric gate·결측,
18m/6km/reference_geometry 한계, snapshot·D+1 cutoff,
시간 순서 forward·baseline·abstention과 별도 LODO 진단,
확인한 결과·한계·재현 정보·라이선스·참고문헌·후속 실험 계획.

PCI는 주관적 무차원 전체 체감이며 유속·위험도·안전 판정이 아니다.
1.0은 상한이 아니다. overall·Peak·legacy anchor를 섞지 않는다.
지도 근사축은 실측 벽 방향이 아니며 숫자는 experimental/very_low다.
달·염분 등 수집/표시 자료가 모두 현재 PCI feature인 것은 아니다.
FES 조석, Copernicus 모델 조류, 모델 수온과 실측 수온을 구분하라.
사후 backfill을 당시 확보한 forecast로 쓰지 않는다.
LODO의 MAE를 D+1 운영 성능으로 표현하지 않는다.
이 결과의 forward는 제공 0/18이고 성능이 입증되지 않았다.
후속 수온 회복을 frozen 160개 PCI의 재계산 결과로 쓰지 않는다.

현재 시행 단계이며 최소 한 달 이상의 전향적 관측은 앞으로의 계획이다.
수치 예측 불가 사례·방문 Site 편향·관찰자 척도·격자 차이도 설명하라.
관측 수가 늘면 자동으로 정확해진다고 쓰지 않는다.
구현, 로컬 검증, production 운영 검증, 향후 계획을 구분하라.

첫 발행 표기:
자체 발행 연구 보고서 · 동료심사 미실시
Independent research report · Not peer reviewed

저자 정보, 성능, DOI, 심사 이력, 읽지 않은 문헌을 만들지 않는다.
외부 참고문헌은 실제 확인한 1차 출처만 URL과 함께 사용한다.
원고의 서술 숫자는 근거와 대조하고 번역의 핵심 수치·한계를 일치시킨다.
우선 두 한국어 원고와 주장별 근거·미확인 사항을 제출하고 검토를 기다려라.
```

## 작성 후 웹 가져오기

metadata는 research-release schema의 `slug`, `version`, `data_cutoff`, `model_version`, `dataset_sha256`, ko/en `title`, `authors`, `source_data_commit`, `code_commit`, `peer_review_status=not_peer_reviewed`, `change_reason`, `references`를 갖는다. cutoff·모델·dataset hash는 results, 두 commit은 evidence manifest에서 복사한다. 저자 정보는 사용자 확인 후 입력한다. reviews/hash/state/revision/timestamp는 생성 도구가 설정하므로 metadata에 넣을 필요 없다.

네 본문 파일을 같은 디렉터리에 준비한 뒤 로컬 묶음을 만든다.

```sh
node apps/web/scripts/create-research-bundle.mjs \
  --metadata .local/research-draft/metadata.json \
  --results docs/research/evidence-2026-10-05/results.json \
  --documents .local/research-draft \
  --output .local/research-draft/bundle.json
```

기존 output은 덮어쓰지 않는다. 이 명령은 검토 체크를 모두 false인 draft로 만들며 GitHub에 저장하지 않는다. `/ko/admin/research`의 묶음 가져오기로 입력하고 미리보기·한국어/영어·수치·권리·개인정보를 확인한다. 서버 초안 저장도 공개 Git 저장이다. 실제 발행은 사용자의 원고 검토 후 수행한다.


## 현재 개정 원고

[검토용 v1.0.2](draft-1.0.2/README.ko.md)는 기존 v1.0.1의 고정 결과를 보존하고 모델 가중치·공식 대조·지속 관측의 해석을 보강한다. 네 body와 metadata/results의 bundle 검증을 통과했다. 공개 발행은 별도 narrative/translation/results/rights 검토 후 새 release로 수행한다. 운영 성공이 연구 성능을 입증하지 않는다.
