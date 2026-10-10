# 연구 v1.0.2 원고 보존본

기존 v1.0.1 네 원고에서 body를 가져와 가중치·운영 대조·계속되는 관측의 해석을 보강했다. 한국어가 정본이며 영어를 함께 갱신했다. 공개 data branch에 새 v1.0.2 release로 발행했으며 기존 release 파일을 변경하지 않았다. 이 디렉터리는 공개 검토용이며 비공개 초안이 아니다.

results.json은 기존 고정 결과의 metrics·data cutoff·model version·dataset hash를 보존한다. release version만 1.0.2로 갱신하여 결과 파일 hash는 새로 계산한다. metadata의 data_cutoff/model context/dataset hash와 결과는 그대로다. 새 성능 수치·DOI·심사 이력을 추가하지 않았다. bundle 생성으로 context·결과 hash 일치를 검증하며 narrative/translation/results/rights/real-synthetic 검토와 원격 네 원고·결과 hash 검증을 완료했다.

| 보강 주장 | 근거 |
|---|---|
| PCI는 환경 거리 입력이 아니라 Overall label | engine/bunaken_engine/analog.py: environmental_distance, select_neighbors |
| 거리·유사도·Site·quality·provenance | analog.py 및 config/model.json, config/features.json |
| 실제 저장 forecast·cutoff·observer/rubric·시간 고정 매칭 | engine/bunaken_engine/d1_matching.py |
| collect/seal 후 같은 chain에서 대조 | .github/workflows/environment.yml |
| 연구 결과 자동 개정·자동 승격 아님 | AGENTS.md, PLAN.md |

미확인: 새로운 공식 D+1 성능·자동 튜닝 승격 기준·독립 관찰자 일치도·한 달 이상 전향 평가. 현재 원고에 결과로 쓰지 않았다.

2026-10-10 사용자 요청으로 발행. 발행 commit `d449770941e32b2841c67e7fdbd30178bbde91f3`, 결과 SHA-256 `f504b84caa89714dee0706d449adb5148cfa23a6fd9cb289e7ebffd2a0f3504d`. 최신 공개 관측은 계속 증가하며 이 보고서의 cutoff·metrics는 고정한다.
