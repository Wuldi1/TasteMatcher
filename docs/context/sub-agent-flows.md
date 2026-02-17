# Sub-Agent Flows

Use these flows as default operating procedures.

## 1) New Feature Flow

1. `planner-agent`: define scope, acceptance criteria, file targets.
2. `shared-types-agent`: add/update shared contracts in `common/` first.
3. `backend-agent` and `frontend-agent`: implement in parallel.
4. `functions-agent`: implement async/event updates if required.
5. `review-agent`: run focused regression review.
6. `docs-agent`: update READMEs/docs and rollout notes.

## 2) Bugfix Flow

1. `planner-agent`: write reproducible failing scenario.
2. Owning implementation agent adds/updates test that fails pre-fix.
3. Apply minimal fix.
4. `review-agent`: verify no behavior regression and confirm risk boundaries.
5. `docs-agent`: document fix only if behavior/ops changed.

## 3) Refactor Flow

1. `planner-agent`: define invariant behavior and migration boundaries.
2. Implementation agent extracts abstraction with backward compatibility.
3. Update callers incrementally.
4. `review-agent`: confirm contracts, coverage, and performance assumptions.
5. `docs-agent`: update architecture docs.

## 4) Ops/Incident Flow

1. `planner-agent`: capture incident timeline and user impact.
2. Owning agent applies mitigation/fix.
3. `review-agent`: verify monitoring/logging updates.
4. `docs-agent`: add post-incident note and prevention items.

## 5) HTML Ingestion Flow

1. `planner-agent`: capture source file path, auction/source name, and expected output folder.
2. `html-parser-agent`: parse HTML into `image.*` + `metadata.json` per artwork folder.
3. `html-parser-agent`: run metadata completeness validator before upload.
4. `review-agent`: sample-check extracted fields and image links for obvious parsing drift.
5. `docs-agent`: record parser assumptions/selectors for future reuse.

## Handoff Message Template

Use this exact structure between agents:

```md
Goal:
Inputs:
Expected Output:
Validation:
Risks/Notes:
```
