# 첫 방법론 보고서의 고정 근거

이 묶음은 2026-10-05 로컬 분석의 공개 가능한 근거다. 홈페이지에 발행한 보고서나 실제 D+1 운영 성능을 뜻하지 않는다. 원 atlas·NetCDF·자격증명·대규모 model context는 포함하지 않는다.

## 기준과 결과

- 연구 초판용 결과 버전: `1.0.0`.
- 자료 cutoff: `2026-10-05T06:43:30Z`. 모델 training cutoff는 manifest에서 별도로 확인한다.
- 관측 18개, 관측일 7일. 모델 `weighted-analog-v1.3 / site-18m-v2`.
- 19 Site·304개 forecast 슬롯 중 numeric 160개, 나머지 144개는 같은 Site 관측 부족. 로컬 재계산이며 공식 사전 예측이 아니다.
- forward 제공 0/18, MAE null. 당시 cutoff 이전에 이번 정정 revision·환경 backfill이 없었다.
- LODO 제공 15/18, MAE 약 0.09832. 미래 날짜 학습을 포함하는 진단이며 운영 정확도 주장에 사용하지 않는다. baseline은 동일 제공 표본으로 비교했다.
- 이 snapshot의 모델 수온은 stale로 제외했다. `temperature-checks.json`의 이후 회복 확인은 cutoff 이후 별도 자료이며 위 PCI 결과에 반영하지 않았다.

## 파일 역할

| 파일 | 용도 |
|---|---|
| results.json | 네 원고·표·차트가 공유할 결과 수치 |
| manifest.json | 실제 코드/data commit·dataset hash·원본 산출물 hash·주장 범위 |
| integration.json | 로컬 snapshot/release 재현·슬롯·null 사유 |
| forward.json / lodo.json | 날짜별 검증 상세. 두 방법의 의미를 구분 |
| model.json / features.json | 당시 model context에 고정된 설정 |
| geometry.json / sites.json | 승인된 좌표·18m·6km·근사 진행/외해축 |
| sources.json | 당시 source registry·dataset·해상도·라이선스·attribution |
| temperature-checks.json | 후속 공급 회복 확인. frozen 결과와 혼합 금지 |

`manifest.files`는 파일 바이트 SHA-256이다. `results_canonical_sha256`은 JSON key 정렬·compact serialization, 마지막 개행 제외 규약이다. dataset hash는 당시 model context의 canonical bytes이며 원본 파일 hash와 구분한다. 원고 버전이나 결과를 바꿀 때는 새 묶음·연구 버전으로 시작한다.

## 원고에서 유지할 구분

PCI는 무차원 주관적 전체 체감이며 유속·위험도·안전 판정이 아니다. 대표 수심은 사용자 지정 18m로 실제 평균 수심이라고 단정하지 않는다. 허용 격자 거리는 6km이고 Site 미세 흐름을 해상한다고 주장하지 않는다. 진행축·외해축은 reference_geometry이며 숫자 출력은 experimental/very_low다. Zone 위치는 아직 등록하지 않았다.

달과 염분 등 화면 표시 자료를 모두 현재 모델 feature라고 쓰지 않는다. 18m 거리 범위에서 사용하는 실제 feature·weight는 model/features 파일이 정본이다. FES 조석 높이와 Copernicus 모델 조류, 실측 수온과 모델 수온을 구분한다. 관측 수 증가만으로 정확도가 자동 향상된다고 주장하지 않는다.

최소 한 달 실험은 계획이다. 전날 WITA 20:00 이전 실제 저장한 snapshot과 이후 현장 관측을 비교해야 전향적 운영 평가가 가능하다. 모형 변경·결측·미제공·Site coverage·baseline을 함께 기록한다.
