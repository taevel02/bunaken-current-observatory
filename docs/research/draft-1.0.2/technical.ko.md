권태훈 / PADI IDC Staff Instructor (#554990)
기여: 연구 구상, 현장 다이빙·관측·기록, 자료 분석·해석, 원고 작성 및 자체 발행
버전 1.0.2 · 자체 발행 연구 보고서 · 동료심사 미실시

## 초록

이 보고서는 인도네시아 북술라웨시 부나켄의 다이브 사이트를 대상으로, 다이버가 사후 기록한 주관적 체감 조류 지표(Perceived Current Intensity, PCI)와 조석·해양·기상 모델 자료를 연결하는 초기 연구 방법과 정정 후 계산 상태를 기술한다. PCI는 현장 유속이나 위험을 측정하는 변수가 아니다. 예측 엔진은 고정된 환경 feature 거리와 품질·출처·Site 가중치를 사용하는 Weighted Analog이며, numeric gate 미충족 시 abstain한다.

정정된 공개 관측은 24건, 서로 다른 WITA 날짜는 9일이다. 수정된 dataset context의 24개 후보를 재계산했으며 환경 scaler에는 2,736개 행이 사용됐다. 같은 Site 근거를 포함한 공식 조건 forward 평가는 24건 중 0건을 제공했다. 따라서 이 정정 context에서 발행할 target PCI 슬롯은 없다. 이전 backfill 기반 forward와 LODO 수치는 진단용이며 D+1 운영 성능을 입증하지 않는다. 예측력은 입증되지 않았고 본문은 진행 중인 연구의 방법과 현재 상태를 보고한다.

## 연구 질문과 범위

질문은 “Site 수준의 과거 주관적 PCI 기록과 예측 시점에 확보 가능한 환경 feature가 다음 다이빙 시간대의 관찰 PCI를 어느 정도 설명하는가”이다. 현재 단계는 feature 파이프라인·gate·데이터 보존·시간 분할을 검토하는 초기 구현 평가다. 인과 효과, 안전도, 잠수 적합성, 유속 환산, 보편적 예측 성능을 평가하지 않는다. 최소 한 달의 전향적 기록은 이 보고서의 결과가 아니라 후속 계획이다.

저자이자 단일 관찰자인 권태훈은 직접 다이빙하고 PCI를 기록·해석하며 연구를 발행한다. 독립 관찰자 간 일치도, observer 보정, 외부 동료 심사는 수행되지 않았다.

## 연구 지역과 공간 표상

연구 registry에는 부나켄의 19개 Site가 있다. 좌표는 저자가 확인한 대표 입수점을 나타내며 실제 보트 입수 위치가 매번 같다는 뜻은 아니다. 비교 수심은 모든 Site에 설정한 대표값 18m다. 이는 각 다이빙의 실측 평균 수심이 아니다.

환경 격자는 공급 모델의 공간 표본 셀이다. 좌표에서 6km 이내의 유효 해상 셀을 제한적으로 선택하는 기준이지, 그 반경의 모든 벽·동굴·해안 흐름을 대표한다는 검증이 아니다. 각 Site의 진행축과 외해축은 저자가 반복 다이빙 경험으로 제안한 운영 기본 방향이다. 2026-10-04 저자가 제공한, 부나켄 해안선과 Site 이름 위에 진행 방향을 빨간색·외해 방향을 파란색으로 손으로 주석한 비공개 화면을 내부 판독에 사용했다. 북쪽이 위라는 가정 아래 두 방향을 독립적으로 판독하고 약 15° 간격의 방위각으로 기록했다. 이는 측량한 벽 법선이나 GPS 궤적, 직교 축이 아니다. 배경 지도 URL·축척·투영법은 기록하지 않았고 원 주석 화면도 공개하지 않으므로 원본 주석에서 방위각을 다시 판독하는 절차는 독립 재현할 수 없다. 계산 재현의 입력은 공개 config/geometry.json의 wall_bearing_deg(진행축을 담는 기존 필드명)와 offshore_bearing_deg다. 북쪽을 0°로 두고 시계 방향으로 정의한 이 숫자와 direction_reference의 가정·반올림·판독 provenance를 사용하면 벡터 투영 계산을 재현할 수 있다. 현장 방향의 정확성이 독립 검증됐다는 뜻은 아니다. Zone 위치 자료는 없어 Zone 단위 예측과 geometry group을 만들지 않았다.

따라서 공간 해상도는 Site의 실측 흐름 규모보다 거칠 수 있다. 동일하거나 가까운 provider cell이 여러 Site에서 선택될 수도 있다. 좌표 정확성과 사용자가 경험하는 국지 흐름의 대표성은 별개다.

## 현장 관측 및 PCI 정의

관측 단위는 한 번의 다이빙이다. Overall PCI는 다이빙의 대표 체감이며 Peak PCI는 별도로 식별한 강한 순간의 사건 label이다. 두 범위를 혼합하지 않는다. 시간·수심·Zone 등 모르는 값은 null/unknown으로 두며 추정값을 채우지 않는다. 기록 수정은 공개 revision으로 보존한다. `use_for_model`은 학습 적격성과 공개 여부를 구분한다.

PCI는 무차원·관찰자 주관 지표다. 기준 anchor는 0.0(영향 거의 없음), 0.2(흐름은 느껴지나 진행 영향 작음), 0.4(드리프트와 방향별 노력 차이가 분명함), 0.6(경로·위치 유지에 뚜렷한 영향), 0.8(다이빙 진행에 큰 영향), 1.0(저자의 기준 사건 수준), 1.0 초과(그 사건보다 강한 체감)이다. 1.0은 상한이 아니다. 이 값은 m/s, 확률, 위험도 또는 안전 판정이 아니다. 관찰자·상황별 척도 차이가 보정되지 않았다.

2026-09-19 Mandolin 사례는 Overall 0.7, 별도 Peak 1.0으로 저자가 정정했다. 저자는 BCD에 공기를 넣고 강하게 핀을 차도 상승하기 어려워 벽을 잡고 이동했다고 회고했다. 이것은 주관적인 사건 맥락이며, 수직 유속 계측이나 일반적인 안전 행동 지침이 아니다. 사건의 정확한 시각·Zone·유속은 확인되지 않았다. legacy categorical 기록이나 peak를 overall로 대체하지 않는다.

## 환경 공급 자료와 provenance

사용 feature의 원천·역할은 다음과 같다.

- **FES2022b ocean_tide_20241025**: harmonic atlas에서 파생한 조석 높이. 시간 변화율과 요청 구간 excursion으로 변환한다. 조석 높이·변화는 조류 속도나 현장 유속이 아니다. 원 atlas는 공개 bundle에 포함하지 않았다.
- **Copernicus Marine GLOBAL_ANALYSISFORECAST_PHY_001_024**, dataset `cmems_mod_glo_phy-cur_anfc_0.083deg_PT6H-i` 등, version `202406`: uo/vo 수평 해양 모델 조류, thetao 모델 수온. 설정한 제품은 0.083° 격자, 6시간 시간 간격, 50개 native depth level이며 선택 수심의 실제 좌표축도 보존한다. 모델 조류는 현장 유속 계측값이 아니다.
- **Open-Meteo ECMWF 및 Marine 계열**: 바람, 파랑, 너울 관련 변수. API 응답 간격과 provider native resolution은 같은 의미가 아니다. 바람 방향 convention과 모델 수평 조류 방향을 구분한다.

registry에 등록된 후보 feature는 `tide_rate_m_per_hour`, `tide_excursion_m`; `current_along_m_s`, `current_cross_m_s`, `current_speed_m_s`, `horizontal_shear_10_30_m_s`; `modelled_temperature_c`, `temperature_difference_10_30_c`; `wind_along_m_s`, `wind_cross_m_s`, `wave_height_m`, `wave_period_s`, `swell_height_m`, `swell_period_s`, `wave_direction_sin/cos`, `swell_direction_sin/cos`다. 실제 비교에 사용되는 feature는 model version의 comparison scope와 scaler·target mask로 결정한다. v1.3의 18m 비교는 10–30m 차이를 거리에서 제외한다. 바람은 지도 기준축으로 projection되며 방향각은 주기형 성분으로 비교한다. 10m과 30m 사이 차이는 수평 층간 차이며 수직 유속이 아니다. 조석 excursion은 요청된 60분 window 내부 범위이지 전체 조석 주기 범위가 아니다.

Salinity와 달 정보는 수집·표시될 수 있지만 이번 PCI active feature가 아니다. 실제 dive computer 수온도 현재 comparison scope의 모델 수온과 별개의 관측값이며, 이를 모델 수온으로 치환하지 않는다. observation의 28°C 확인은 현장 label과 함께 보존되지만 modelled-temperature feature의 대체·보정값은 아니다.

Retrieval은 dataset/version, issued/retrieved/valid time, source status, resolution, geometry와 provenance를 기록한다. 유효한 경계 안에서만 시간·수심 보간을 수행하며 육지 셀, 거리, 수심, 품질 및 staleness를 검사한다. 사후 backfill은 당시 forecast로 소급 표기하지 않는다. 공개 결과에는 허용된 파생값과 attribution만 사용하며 원자료 라이선스 범위 밖 파일은 포함하지 않는다.

## Feature 구성과 Weighted Analog

현재 comparison scope는 `site-18m-v2`, 엔진 버전은 `weighted-analog-v1.3`이다. active group은 tide(초기 weight 0.30), ocean(0.35), thermal(0.15), weather(0.10)다. 설정의 depth weight 0.10은 모든 Site의 기준 깊이가 같아 분산이 없으므로 현재 scaler에서 비활성이다. 이는 feature 목록에 등록된 것과 실제 계산 거리에 쓰인 것을 구분한다. tide phase sin/cos는 정의 검증 부족으로 비활성이다. 각 그룹 내 enabled feature를 비교하며 결측을 0으로 채우지 않는다. 학습 수온 bias는 적용하지 않는다.

Scalers는 label이 아닌 cutoff 이전의 환경 분포로 구성한다. 현재 계산에는 scaler 행 2,736개가 있었고, 정정 dataset context cutoff는 2026-10-07T00:05:28Z다. IQR 기반 feature 거리와 고정된 비교 mask로 환경 거리를 구하고 Gaussian 형태의 similarity(σ=1.0)를 적용한다. minimum similarity 0.2, 최대 이웃 20개를 둔다. 같은 Zone/Site, 다른 Site, quality, provenance, approximate time/depth에 설정된 계수를 곱해 이웃 가중치를 만든다. Site 계수는 같은 Zone 1.0, 같은 Site·unknown Zone 0.8, 같은 Site·다른 Zone 0.65, 검증된 유사 geometry 0.35, 다른 Site 0.15다. Quality 계수는 high 1.0, normal 0.8, low 0.5이며 snapshot provenance 1.0, backfill 0.7이다. approximate time과 estimated depth에는 각각 0.8을 쓴다. 다른 Site 계수는 전체 gate에 대한 면제가 아니다. 가중 평균 PCI와 유효 표본수 (N_{eff}=(Σw)^2/Σw^2)를 산출한다. weight와 feature는 구현 설정값이지 물리적 기여율로 추정된 계수가 아니다.

수치 반환 gate는 적격 numeric overall label 최소 3개, 서로 다른 날짜 최소 3일, 유효 이웃 최소 3개, (N_{eff}≥2), 같은 Site 근거 최소 1개, 필수 tide/ocean feature와 충분한 feature coverage다. 날짜는 WITA로 묶는다. gate 실패·자료 결측 시 PCI는 null 및 사유 코드로 남는다. 실험 데이터의 수가 늘었다는 사실만으로 gate나 정확도가 자동 개선되지 않는다. reference geometry 때문에 숫자가 생성돼도 상태는 experimental/very_low다.

현재 Site별 gate는 저방문 Site에 same-site analog를 요구하므로 다른 Site 유속을 수집해도 비어 있는 PCI를 자동 채우지 않는다. 다른 Site 전이 모델은 별도 모델 버전으로 격리하고 leave-one-site-out, 공간 block, 기준 모델 대비 error와 coverage를 사전 정의해 평가해야 한다. 이번 자료는 그 일반화를 입증하지 않으며 모델 gate를 변경하지 않았다.

## 예측 시간창과 검증 설계

각 출력은 시작 시각 기준 60분 window의 요약이며 target 시각은 실제 다이빙 관측 구간과 다를 수 있다. 출력 점은 30분 간격으로 배치되고 이웃 window는 겹친다. 시각 표시는 prediction 시점의 순간 관측으로 해석하면 안 된다.

주 검증 설계는 WITA 날짜를 기준으로 과거 label만 학습에 포함하는 시간 순서 forward다. 같은 날짜의 dive/Peak/파생행은 fold를 공유한다. 공식 D+1 cutoff는 전날 20:00 WITA까지 실제 보존된 성공 snapshot이다. late run, retrospective backfill 또는 미래 자료를 당시 발행된 forecast로 만들지 않는다. 평가 조건·환경 provenance를 만족하지 않으면 예측을 abstain한다. 전체 제공률, abstention, MAE와 matched baseline을 함께 보고한다. 큰 오차 기준은 설정되지 않아 error-rate metric을 만들지 않는다.

LODO는 하루를 제외하고 나머지 날짜로 계산하는 사후 진단이다. training에 제외일 뒤의 날짜가 들어갈 수 있어 D+1 성능 또는 미래 일반화 검증이 아니다. 별도 report를 유지한다. scaler와 bias는 각 fold의 허용 training 정보 범위 안에서만 fit한다.

## 정정 데이터 계산·검증 결과

현재 공개 data head는 a431af719b869ae578b95e1392df8618cee0dfc8이다. 이번 계산은 이전에 확인된 immutable historical environment bundle을 재사용했다. 새 source 수집 시도에서는 필요한 historical source를 확보하지 못했으므로 신규 환경 수집이나 production 운영 검증을 주장하지 않는다. 관측 24건, WITA 날짜 9일, 등록 Site 19곳을 사용했다. Dataset SHA-256은 958cdbda3c831df6b756c8a19772f0139e34014a68244ca707ce823fbca2f03c다. 모델은 weighted-analog-v1.3, scope는 site-18m-v2다. Muka Kampung 실측 수온을 27°C에서 28°C로 정정했다. 실측 수온은 active PCI feature가 아니므로 후보 PCI 입력은 바뀌지 않았지만, 정정 context와 hash는 갱신했다.

정정 revision은 2026-10-07 08:05 WITA에 저장됐다. 첫 target window가 08:00에 시작된 뒤이므로 해당 날짜 PCI를 만들지 않았다. 이전 target 환경 snapshot도 전날 20:00 WITA cutoff 후 수집되어 공식 D+1 forecast로 쓸 수 없다. 정정 이후 정보를 과거 예측인 것처럼 재생하지 않았다. 엄격한 target replay는 수행되지 않았고, 정정 head의 target PCI 결과는 발행하지 않는다.

| 결과 | 값 |
|---|---|
| 공개 관측 / WITA 날짜 | {{metrics.observations}} / {{metrics.observation_days}} |
| 등록 Site 수 | {{metrics.total_sites}} |
| 공식 조건 forward: 예측 / 평가 관측 | {{metrics.operational_forward_predicted}} / {{metrics.operational_forward_test}} |
| 공식 조건 forward coverage / abstention | {{metrics.operational_forward_coverage}} / {{metrics.operational_forward_abstention}} |
| 공식 조건 forward MAE | {{metrics.operational_forward_mae}} |
| 사후 backfill forward: 예측 / 평가 관측 | {{metrics.backfill_forward_predicted}} / {{metrics.backfill_forward_test}} |
| 사후 backfill MAE / global baseline / Site baseline | {{metrics.backfill_forward_mae}} / {{metrics.backfill_global_baseline_mae}} / {{metrics.backfill_site_baseline_mae}} |
| LODO 진단: 예측 / 평가 관측 / MAE | {{metrics.lodo_predicted}} / {{metrics.lodo_test}} / {{metrics.lodo_mae}} |
| LODO global / Site baseline MAE | {{metrics.lodo_global_baseline_mae}} / {{metrics.lodo_site_baseline_mae}} |

공식 조건 forward는 0/24 제공이다. MAE null은 틀린 예측 24건이 아니라 비교할 예측이 없어 오차를 계산하지 않았다는 뜻이다. 별도 retrospective forward는 3/24를 제공했고 MAE 0.06713으로 matched global baseline 0.04000과 Site baseline 0.05833보다 컸다. 이후 수집된 backfill 환경자료를 사용했다. LODO는 21/24 제공, MAE 0.06816, global baseline 0.07524, Site baseline 0.06857이었다. LODO는 held-out 날짜보다 뒤의 자료를 학습에 포함할 수 있으므로 D+1 운영 성능이 아니다.

현재 공개 관측의 Site별 수는 아래와 같다. observation ID별 최신 상태 한 건만 집계하고 withdrawn는 제외했다. 관측 수 내림차순이며 동률은 registry 순서다.

| Site | 공개 관측 수 |
|---|---|
| Lekuan Two | {{metrics.site_records_lekuan_two}} |
| Celah Celah | {{metrics.site_records_celah_celah}} |
| Alung Banua | {{metrics.site_records_alung_banua}} |
| Fukui | {{metrics.site_records_fukui}} |
| Muka Kampung | {{metrics.site_records_muka_kampung}} |
| Lekuan Three | {{metrics.site_records_lekuan_three}} |
| Mandolin | {{metrics.site_records_mandolin}} |
| Ron's Point | {{metrics.site_records_rons_point}} |
| Sachiko's Point | {{metrics.site_records_sachikos_point}} |
| Pahepa | {{metrics.site_records_pahepa}} |
| Lekuan One | {{metrics.site_records_lekuan_one}} |
| Johnson's Wall | {{metrics.site_records_johnsons_wall}} |
| Tengah | {{metrics.site_records_tengah}} |
| Raymond's Point | {{metrics.site_records_raymonds_point}} |
| Mike's Point | {{metrics.site_records_mikes_point}} |
| Tanjung Parigi | {{metrics.site_records_tanjung_parigi}} |
| Bunaken Timur One | {{metrics.site_records_bunaken_timur_one}} |
| Bunaken Timur Two | {{metrics.site_records_bunaken_timur_two}} |
| Pangalisang | {{metrics.site_records_pangalisang}} |

이 수는 현재 공개 저장소 기록이며 저자의 전체 다이빙 횟수가 아니다. Mike's Point, Tengah, Johnson's Wall, Raymond's Point, Tanjung Parigi, Pangalisang에는 저장 관측이 없다. 동일 Site 근거 gate를 유지했다. 다른 Site의 모델 유속은 환경 자료로 비교할 수 있어도 유속 자체로 사람의 PCI를 만들거나 빈 Site의 PCI를 채우지 않는다. Site 간 PCI 전이는 별도 모델로 격리하고 whole-Site holdout, spatial block, 독립 날짜, coverage와 matched baseline을 검증하기 전에는 공개 예측으로 제공하지 않는다.

PCI 그래프는 실제 계산된 유효 시간 슬롯만 연결하고 결측·중복·gate 차단 구간은 끊는다. 보기 좋은 삼각함수 곡선을 위해 PCI 값을 합성하지 않는다. 조석과 모델 유속은 별도 환경 계열로 보여줄 수 있지만 PCI와 단위·의미가 다르다. 현재 결과는 전체 Site PCI 곡선이나 공간 전이 성능을 검증하지 않았다.

## 한계·재현성·자료 권리

단일 관찰자와 현재 anchor를 쓰므로 observer drift, 반복성, observer 간 척도 차이를 추정하지 못했다. Site 방문은 균등하지 않고, 여러 Site에는 저장 관측이 전혀 없다. 같은 Site 요건 때문에 데이터가 많은 Site의 결과가 우세하며, site별 MAE도 표본 부족 상태다. reference geometry, 18m 대표 수심 및 6km grid limit은 분석상 기준이며 현장 흐름 검증이 아니다. Zone/GPS 자료도 없다. native grid와 국지 지형 간 대표성은 미측정이다.

향후에는 최소 한 달 이상의 전향적 관측, 동일 observer rubric 기록, timestamp·환경 cutoff 보존, 누락·abstention 추적, 사전 정의한 baseline 비교를 수행한다. 다른 Site 자료 전이는 whole-Site holdout·spatial block 및 독립 날짜 검증, matched baseline 대비 오차와 제공률 검토를 통과하기 전 별도 experimental model로 발행하지 않는다. 관측 수 자체는 예측력을 보장하지 않는다. 곡선은 실제 산출 점 사이만 연결하고 누락 구간은 끊어야 한다. 삼각함수 형태의 가상 PCI를 채워 그리지 않는다.

재현 기준: model `weighted-analog-v1.3`; scope `site-18m-v2`; dataset hash와 source data/code commits는 위 metadata에 동일하게 기록; scaler cutoff는 데이터 cutoff와 분리해 구현 bundle manifest에 보존한다. immutable source snapshot과 result hash가 연구 release에 연결된다. 공개물은 원 NetCDF/FES atlas가 아니라 허용된 유도 결과만 포함한다. FES·Copernicus·Open-Meteo의 데이터·라이선스·attribution은 각 provider 조건을 따른다.

## 참고 자료

- AVISO, *FES2022 handbook*. https://www.aviso.altimetry.fr/fileadmin/documents/data/tools/hdbk_FES2022.pdf
- AVISO, *License*. https://www.aviso.altimetry.fr/fileadmin/documents/data/License_Aviso.pdf
- Copernicus Marine, *Global Ocean Physics Analysis and Forecast*. https://data.marine.copernicus.eu/product/GLOBAL_ANALYSISFORECAST_PHY_001_024/services
- Copernicus Marine, *Service Commitments and Licence*. https://marine.copernicus.eu/user-corner/service-commitments-and-licence
- Open-Meteo, *ECMWF API*. https://open-meteo.com/en/docs/ecmwf-api
- Open-Meteo, *Marine Weather API*. https://open-meteo.com/en/docs/marine-weather-api
- Open-Meteo, *Terms*. https://open-meteo.com/en/terms

## 개정 보충: 가중치와 운영 검증

과거 PCI는 학습 정답 label이며 환경 거리 feature가 아니다. 목표 시간의 조석·모델 조류·수온·기상 feature와 과거 다이빙 구간의 feature를 비교한 후, 환경이 비슷한 과거 기록의 Overall PCI를 가중 평균한다. 특정 PCI 값이 높다는 이유로 이웃을 선택하거나 그 기록에 큰 가중치를 부여하지 않는다.

유효 group의 상대 weight를 정규화하고, 각 feature 차이를 training 이전 자료의 IQR로 나눈 제곱 차이를 group 내에서 평균한다. group별 기여를 합산한 제곱근이 환경 거리 d다. 유사도는 exp(-d²/(2σ²)), 최종 이웃 가중치는 유사도 × Site/Zone 가중치 × 관측 품질 × provenance다. 최종 PCI는 이 가중치로 Overall label을 평균한다. 결측·비활성·zero IQR는 coverage와 gate에 반영하며 0으로 채우지 않는다. 18m 비교 범위에서는 Depth가 적격 층이고 실제 비교 weight는 해당 모델 config와 feature mask를 따른다.

달 모양·염분 등 화면이나 수집 자료가 모두 현재 거리 feature인 것은 아니다. 현재 model version의 실제 feature registry·scaler·mask를 확인해야 한다. 달이나 조석차의 영향이 중요할 수 있다는 가설만으로 관측되지 않은 효과나 임의 계수를 넣지 않는다. 가중치의 개선은 training 내부 튜닝과 시간 순서 검증, 같은 제공 표본의 baseline, 제공률·abstention으로 평가한다.

공식 D+1 대조는 전날 WITA cutoff 이전 실제 Git 저장이 확인된 forecast와 seal을 사용한다. 실제 다이빙 중간 시각에 가까운 저장된 60분 슬롯을 사전에 고정한 규칙으로 선택한다. Site·Zone·대표 수심·observer·rubric을 대조하고 Peak를 섞지 않는다. 시간대가 맞는 슬롯이 null이면 다른 숫자를 찾지 않는다. 근사 구간 대조이며 실제 dive 전체의 동일 환경 구간을 재계산한 값과 구분한다.

운영 수집과 관측 축적은 frozen 보고서 결과를 자동 개정하지 않는다. 새로운 관측과 예측의 오차·baseline·제공률이 축적되어야 미래 성능을 검증할 수 있다. 자동 튜닝과 모델 승격은 별도의 검증 기준·승인·version 변경이 필요한 후속 단계다. 이 개정의 결과표·data cutoff·dataset hash는 이전 고정 context를 유지하며 새로운 운영 성능 결과를 추가하지 않았다.
