# 기여 안내

PR 전 [AGENTS.md](AGENTS.md), [PRD.md](PRD.md), [SPEC.md](SPEC.md)를 읽는다. 제품·모델·저장 계약 변경은 문서·schema·version·회귀 검증을 함께 변경한다.

```sh
pnpm install --frozen-lockfile
uv sync --project engine --locked
pnpm lint
pnpm typecheck
pnpm test
pnpm build
uv sync --project engine --extra providers --locked
uv run --project engine --extra providers --locked python -m unittest discover -s engine/provider-tests
```

- main은 PR와 CI를 통과해야 한다. 데이터 저장 token으로 보호 규칙을 우회하지 않는다.
- 합성 사례는 synthetic fixture에만 둔다. 실제 관측·geometry·연구 결과를 만들어 넣지 않는다.
- 공개 data branch는 실행 코드의 공급원이 아니다. main의 검토된 불변 SHA를 실행한다.
- 비밀값·개인정보·원 atlas·재배포 제한 자료를 diff나 이슈에 포함하지 않는다.
- 한국어/영어와 360px·1920px UI를 함께 확인한다. 선택 테스트 skip을 성공으로 보고하지 않는다.
- 관측·모델·검증의 변경은 작은 Conventional Commit으로 분리한다.
- 코드 기여에는 [MIT](LICENSE), 데이터·원고에는 [별도 이용 조건](LICENSING.md)을 적용한다.
