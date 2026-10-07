# Site 간 PCI 전이 실험

2026-10-07 사용자 승인 연구 기능. 기본 모델 `weighted-analog-v1.3`과 별개의 `site-transfer-v1`이다. 한 관찰자의 실제 Overall PCI를 다른 Site로 전이할 수 있는지 탐색한다. 모든 산출값은 `experimental / very_low`, `validation_status=unvalidated`다. 숫자 제공과 성능 입증은 다르다. 발행 보고서 v1.0.1의 수치와 결론을 자동 갱신하지 않는다.

## 계산 계약

목표 Site 자체의 label을 모두 제외한다. 목표 Site에서 공급된 18m 모델 current speed와 조석 변화율·구간 excursion, 모델 수온, 파랑·너울 높이/주기를 다른 Site의 실제 dive interval 환경과 비교한다. 실측 수온·Peak·지도 방향·가상 Site multiplier를 만들지 않는다. 지도별 독립 진행/외해 축은 서로 다른 방향이므로 projection 값을 Site 사이에서 직접 비교하지 않는다. 방향 효과의 생략은 모델 한계다.

그룹 초기 weight는 Tide 0.30, Ocean 0.35, Thermal 0.15, Weather 0.10을 합계 0.90으로 정규화한다. 비교 가능한 환경 mask, median/IQR scaler, Gaussian similarity, similarity 0.2, K 최대 20과 quality/provenance는 기본 엔진 설정을 사용한다. 정의된 feature가 결측·zero IQR이면 coverage가 줄어든다. 필수 Tide/Ocean과 전체 coverage 0.8 미만은 null이다.

환경 거리로 정렬한 Site별 후보를 round robin으로 선택한다. 각 raw similarity×quality×provenance weight를 해당 Site/날짜의 관측 수와 해당 Site의 날짜 수로 나눈다. 반복 다이빙 수가 Site 기여도를 자동 증가시키지 않는다. 계산점마다 다음을 검사한다.

- 실제 numeric Overall analog 3개 이상, 서로 다른 WITA 날짜 3일 이상
- 서로 다른 donor Site 3개 이상
- N_eff, N_eff_days, N_eff_sites 각각 2 이상
- 최대 Site 최종 기여 비율 0.5 이하
- 유효 geometry·18m·필수 source·공급 시간 범위·cutoff

실패 시 PCI는 null이고 모든 reason code를 남긴다. 목표 Site 자료를 추가해 강제로 gate를 통과시키지 않는다. Site별 관측이 없으면 그 Site에서 관찰된 PCI라는 의미를 부여하지 않는다. 수직 방향·위험도·확률은 전이하지 않는다. 전이 PCI는 향후 학습 데이터로 넣지 않는다.

## 검증과 재현

`validate-transfer`는 기록을 수정하거나 원격을 발행하지 않는다. 입력은 검증된 immutable model context다. label 최신 revision·observer/rubric·source provenance는 기존 계약을 따른다.

```sh
uv run --project engine --locked python -m bunaken_engine validate-transfer \
  --context /absolute/path/model-context.json --mode forward --operational \
  --output /absolute/path/transfer-forward.json
```

`leave_one_site_out`은 목표 Site의 모든 label과 그 Site의 scaler 환경 행을 제외한다. 미래 날짜의 다른 Site 기록을 사용할 수 있어 회고 진단이다. `spatial_block_forward`는 3km 고정 격자(위도/경도 ×111.195km, 원점 0)의 블록을 동시에 제외하고 이전 WITA 날짜·cutoff 이전 기록만 쓴다. 이는 검증 분할이며 가상의 geometry group이 아니다. 북술라웨시 저위도에서 사용하는 근사 partition으로 현장 흐름 경계를 뜻하지 않는다.

각 mode는 전체 평가 분모, 제공률·abstention, 같은 예측 표본의 donor 전체 median baseline, Site별 결과, test/training ID·Site·날짜, scaler/config/context hash를 남긴다. Site별 표본이 적고 여러 Site가 공급 셀을 공유하므로 holdout 통과만으로 공간 일반화를 입증하지 않는다. 최소 한 달 이상의 사전 예측/현장 관측과 별도 검토가 필요하다. 현재 허용 오차·승격 기준은 정하지 않았다.

## 화면과 배포 계약

새 웹 패키지의 별도 실험 계열로 저장하고 사용자가 `Site 간 추정 · 실험`을 선택할 때만 표시한다. 기존 prediction과 독립이므로 롤백은 실험 exporter 옵션을 끄고 새 패키지를 생성하는 것으로 충분하다. 기존 데이터와 불변 release는 삭제하지 않는다. 원자료 재수집·새 계정·API 키는 필요하지 않다.

그래프는 실제 숫자 슬롯만 표시한다. 두 점 사이를 단조 cubic Hermite 곡선으로 연결하되 overshoot·외삽을 막고 null·중복·누락 구간은 끊는다. 곡선 내부는 시각적 연결이며 새로운 예측 시각이 아니다. 모델 유속(m/s)·FES 조석(m)은 별도 계열로 표시한다. PCI를 사인 함수에 맞추지 않는다.

참고한 구현 원리: [SciPy PCHIP 공식 문서](https://docs.scipy.org/doc/scipy/reference/generated/scipy.interpolate.PchipInterpolator.html), [scikit-learn 그룹 분할 공식 문서](https://scikit-learn.org/stable/modules/cross_validation.html#cross-validation-iterators-for-grouped-data). 새 라이브러리 의존성은 도입하지 않는다.


## 실제 초기 진단 (2026-10-07)

정정 data commit `a431af719b869ae578b95e1392df8618cee0dfc8`의 24개 관측·9개 WITA 날짜를 고정했다. baseline model context SHA-256은 `958cdbda3c831df6b756c8a19772f0139e34014a68244ca707ce823fbca2f03c`, 실험 config SHA-256은 `449630effb68f3ee2ba5d822d45c30f367331cb44811de53743b4762aa0cc3cb`다. 실제 분석 코드는 `028bbad50567c52f3e37da0971502f125d2114a6`에 보존한다.

| 검증 | 제공 / 평가 | MAE | 같은 제공 표본의 donor median baseline MAE | 해석 |
|---|---|---|---|---|
| 공식 조건 전진 | 0 / 24 | null | null | 공식 snapshot/cutoff 근거 부족, 성능 평가 불가 |
| Site 전체 제외 | 24 / 24 | 0.10355948 | 0.08416667 | 미래 날짜 포함 회고 진단, baseline보다 나쁨 |
| 공간 블록 사후자료 전진 | 3 / 24 | 0.12481668 | 0.09666667 | 21개 abstention, 사후 backfill 사용, baseline보다 나쁨 |

성능 개선 근거가 없으므로 validation_status와 Support를 승격하지 않는다. 기준선 비교는 예측 제공 표본에 맞춰 수행했고, 미제공 행도 평가 분모에 포함했다. 큰 오차·확률·운영 정확도를 추정하지 않았다. 현장 소스의 격자 공유와 관찰자 편향, 공간 방향을 생략한 feature의 한계가 남는다. Weighted mean은 선택한 실제 label 범위 안의 가설을 만들므로 미관측 강한 사건을 잘 재현한다는 근거도 없다.

검증 JSON은 로컬 `.local/site-transfer-2026-10-07/forward-operational-v1.json`, `leave-one-site-out-v1.json`, `spatial-block-forward.json`에 보관했다. 실제 context와 원 공급 atlas는 이 문서에 복사하지 않았다. 원격 연구 발행·서비스 운영 성능으로 표기하지 않는다.

같은 날 남은 시간대에 대해 검증된 snapshot `36d98dec-3132-450f-b9d8-ffcb9ffea2f7`을 사용한 로컬 실험 분석은 133개 슬롯에서 108개 숫자, 19개 Site를 제공했다. 25개는 distinct/effective day gate로 보류했다. 숫자 범위는 약 0.27296~0.34260이며 유속·위험도 또는 성능 수치가 아니다. source manifest SHA-256은 `8d605d39476805cba354cd4daffe475762ae1aea091bb92d890032c055a28d7a`다. 결과는 `remaining-day-analysis.json`/`remaining-day-summary.json`에 보존했고 data branch에 발행하지 않았다. 이 snapshot에는 다음 날 환경이 없어 다음 날의 PCI를 생성하지 않았다.

## 실행·호환 조건

기본 exporter는 schema 1.1을 유지한다. `--experimental-transfer --code-commit <clean HEAD>`로 schema 1.2와 실험 sidecar를 생성한다. 같은 snapshot의 기본 PCI는 바꾸지 않고, config/context hash와 실험 실행 code SHA를 함께 기록한다. 발행 재개도 실제 clean HEAD를 검사한다. Git 저장 전에 원 snapshot에서 sidecar를 재계산해 비교하며 manifest/payload 버전·생성 시각 불일치는 거부한다.

공개 reader는 1.1/1.2를 읽고 실험 config/hash·donor 최소 조건·항상 very_low/unvalidated를 검사한다. 실험 config를 바꾸면 모델 버전을 올리고 새 reader/패키지를 함께 준비해야 한다. 기존 package를 수동 편집하지 않는다.

수집 workflow는 추가 계정·Secret 없이 실험 exporter를 연결한다. main push/CI 성공 후 새 trusted SHA로 data entrypoint 설치와 실제 수집·발행을 검수해야 production에 결과가 보인다. Vercel 확인과 공식 D+1 seal은 P7에 남았다. 이번 변경에서 원격 데이터·snapshot·연구 보고서를 갱신하지 않았다.
