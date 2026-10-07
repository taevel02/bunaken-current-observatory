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
