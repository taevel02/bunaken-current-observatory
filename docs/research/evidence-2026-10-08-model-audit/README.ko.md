# 2026-10-08 모델 기여율·가중치 사후 진단 근거

이 디렉터리는 운영 성능 보고서나 새 연구 release가 아니다. 고정 입력으로 실행한 요인 진단을 보존한다. 연구 release v1.0.1의 context와 수치를 변경하지 않았다.

- 공개 data head: `baaac4797f19b75a303be53d00585398a7c6ecfe`. 최신 관측 29건, revision 67개.
- 입력 snapshot: `snapshots/2026-10-09/12ab5b5b-e1f0-59cc-88af-811903b2c95a/manifest.json.gz`.
- 모델 context cutoff: `2026-10-08T02:45:19Z` (WITA 10:45:19). 적격 Overall 26건·10일, scaler 3,192행.
- Context SHA-256: `c51578fc503ed00277c0376b3860f7388d3a3f803b712731e7716d6d1ddfaa1c`.
- `diagnostic.json` SHA-256: `469991d10beeff41f599c3f0df3d3e255edc9216714fc953eeeea4f0bfb8ab35`.
- 오늘 추가한 3건은 frozen context에 소급 삽입하지 않았다. pending은 그 context의 후보가 아니라는 뜻이며 학습 영구 제외를 뜻하지 않는다.

## 결과

같은 WITA 날짜를 전체 제외한 진단이며 다른 미래 날짜와 cutoff 당시의 환경 scaler를 포함할 수 있다. 현재 설정은 21/26 제공, MAE 약 0.06857; matched Site 중앙값 기준선도 약 0.06857이다. D+1 예측력을 입증하지 않는다.

| 실험 | 제공/평가 | 전체 MAE | 공통 표본 수 | 공통 표본 현재 MAE | 공통 표본 실험 MAE |
|---|---:|---:|---:|---:|---:|
| current | 21/26 | 0.06857 | 21 | 0.06857 | 0.06857 |
| without_ocean | 21/26 | 0.05710 | 20 | 0.05271 | 0.05329 |
| without_thermal | 21/26 | 0.06716 | 21 | 0.06857 | 0.06716 |
| without_tide | 22/26 | 0.06806 | 21 | 0.06857 | 0.06721 |
| without_weather | 21/26 | 0.06829 | 21 | 0.06857 | 0.06829 |
| equal_groups | 22/26 | 0.06896 | 21 | 0.06857 | 0.06767 |
| sigma_0.5 | 18/26 | 0.05146 | 18 | 0.05012 | 0.05146 |
| sigma_2.0 | 21/26 | 0.06931 | 21 | 0.06857 | 0.06931 |
| neighbors_5 | 8/26 | 0.04901 | 8 | 0.04628 | 0.04901 |
| neighbors_10 | 20/26 | 0.05410 | 20 | 0.05271 | 0.05410 |

조류 weight 제거는 전체 MAE가 낮아 보여도 공통 표본에서는 현재 설정보다 나쁘다. sigma=0.5와 작은 이웃 수도 공통 표본에서 개선되지 않았다. 일부 미세 개선은 사후 진단 안의 결과이며 시간 순서 holdout·전향 검증 없이 가중치 변경 근거로 쓰지 않는다.

기본 설정의 숫자 제공 관측에서 단일 donor 최대 기여는 약 24.33%, 날짜 최대 합산 기여는 약 32.63%, Site 최대 합산 기여는 약 52.18%였다. PCI는 이웃 거리·weight의 입력이 아니라 최종 가중 평균의 Overall 정답 label이다. Site 집중과 방문 편향은 남아 있다. Peak는 사용하지 않았다.

별도 사후 시간 순서 검증은 29건 중 2건 제공, 27건 abstention이며 예측 제공 날짜는 1일뿐이다. MAE 약 0.00234, matched global baseline 약 0.00500, Site baseline 약 0.03000이다. 이 적은 표본의 수치를 일반화 성능으로 쓰지 않는다. 사후 target 환경을 허용하며 실제 Git confirmation을 이 명령에서 검증하지 않았으므로 공식 D+1 성능이 아니다.

## 주장과 근거

| 주장 | diagnostic.json 필드 |
|---|---|
| cohort와 cutoff | cutoff, observations_at_cutoff, eligible_candidates, distinct_days |
| 오늘 3건을 frozen 후보로 소급하지 않음 | current_observations, pending_observations |
| 기본/실험 제공률·baseline | experiments[].metrics |
| 동일 표본 비교 | experiments[].common_with_current_metrics, current_on_common_metrics |
| donor·날짜·Site 집중 | influence[].neighbors[].normalized_weight, day_shares, site_shares |
| 환경 거리 분해 | influence[].neighbors[].distance_squared_by_group |
| 사후 forward | retrospective_forward.metrics, folds, rows |
| 자동 선택·승격 안 함 | selection=null, promotion=false |
| 운영 성능 검증 아님 | operational_forecast=false, storage_confirmation_checked=false, limitations |

## 재현·미확인 사항

동일 snapshot의 model_context와 고정 data head의 revision 배열로 `audit-model`을 실행한다. 명령과 해석은 [Analog 엔진 문서](../../analog-engine.ko.md)의 관측별 기여율·요인 진단을 따른다. JSON에는 provider 원 atlas나 인증정보를 넣지 않았다.

- 미확인: 이후 날짜 실제 D+1 성능, 충분한 날짜의 오차 안정성, 현장 실측 방향·Zone, 독립 관찰자 척도, 달·전체 조석 주기 변수의 추가 효과.
- 전문가용 다음 원고에서 현재 18m 거리 registry, 정규화 weight, 현재 제외한 10–30m 차이, target label과 feature 구분을 정정해야 한다. 발행된 v1.0.1은 불변 보존한다.
- 자동 튜닝·승격, production 배포, source 재수집 및 외부 발행은 이 진단에 포함하지 않았다.
