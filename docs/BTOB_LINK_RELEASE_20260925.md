# BtoB link release checkpoint - 2026-09-25

## Scope

- Course-2-only approved material/final-quiz selections and saved student-home links.
- Preserve all course-1 question mappings; append the 270 course-2 mappings verified against Canvas content migration 12.
- No database migration, environment-file edits, Canvas publication, enrollment changes, or answer submissions in this release.
- STEP05 covers two lessons; lesson selection remains explicit rather than deriving lesson numbers from STEP numbers.

## Verification

- Published materials: https://ngas-step01-pc-review.vercel.app/btob/
- Material deployment: dpl_CeHEXnzuxb1y4HeEGZPU5B2hiRRY. All 128 served files returned HTTP 200 and matched the release SHA256 manifest, including preserved original files.
- Full isolated suite before final link-policy additions: 109 files / 951 tests passed.
- Focused link policy/form/API/home suite: 73 tests passed. TypeScript passed.
- Latest isolated training suite: 74 tests passed; browser E2E: 20 passed across four viewport profiles. Includes actual policy selections, save/reload, student hrefs, and other-course exclusion.
- Screenshot caret suppression caused hydration warnings in the initial run; retaining the initial caret removed those warnings in the repeat run. No application workaround was added.
- Viewport coverage is not Quest hardware acceptance. Actual Canvas course-2 end-to-end acceptance remains pending.

## Production preflight

- Server HEAD: 24920787eb6717456eeb6c97f38a98fa870016b4, branch claude/requirements-definition-suuul0.
- Running app: ngas-quiz-review:24920787; database healthy.
- Preserve modified infra/reverse-proxy/Caddyfile and untracked infra/custom-layer/docker-compose.override.yml. Do not reset or overwrite either.
- Resolved app port: 127.0.0.1:3001 -> 3000; restart unless-stopped.
- Formal quiz achievement is enabled; Canvas review instance is configured. Preserve existing values without printing secrets.
- Caddy SHA256: dd382ccdb9e1c739735ce948fb4a3f0583aacd260481cb273994c4d9d04b598a.
- Existing override SHA256: 252f575e78c73f7d034b7e3813499f4096f02a77e350c971146ba5c568d995e3.

## Deployment gates

1. Recheck remote HEAD and configuration hashes for concurrent changes.
2. Review and publish the candidate commit, then use a fast-forward-only source update that preserves local configuration.
3. Verify a recent backup and retain a validated pre-update database backup.
4. Build a uniquely tagged candidate. Do not overwrite ngas-quiz-review:24920787 through the existing Compose image setting; retain it for rollback.
5. Select the candidate with a narrowly scoped app-image override while retaining the existing Compose overrides, ports, environment, network, and feature flags. Record how that selection survives later restarts.
6. Restart only the app during the permitted window. Verify container image/port, HTTP, authenticated UI, and existing formal-grade functionality. Preserve DB and proxy containers.
7. On failure, restore the prior app image and verify HTTP. Do not remove containers, volumes, or database records.

This checkpoint is not evidence of LMS production deployment. Course publication, quiz publication, enrollment, lesson URL saving, and fictional-student acceptance are separate remaining operations.

## Subsequent production acceptance

- Deployed 7cf767a as ngas-btob-links:7cf767a. App port remains 127.0.0.1:3001; DB healthy; local/public HTTP 200. Existing proxy configuration and environment retained, no migrations.
- Saved all ten material links and nine final-test links. Lesson 5 intentionally has no final test; lesson 6 uses STEP05 final test. Current lesson restored to unselected after checks.
- With explicit approval, published course 2 with course-only visibility, selected Tokyo timezone, and enrolled existing teacher-test and fictional demo student 01. Both invitations accepted; no new accounts.
- Student LTI shows the selected lesson without teacher/admin menus. Material renders; quiz 100 shows its 12-question start page. No answer attempt or grade adoption performed.
- Found nested Canvas navigation when the quiz link opens inside the LTI iframe. Follow-up code opens both external lesson links in a separate tab with noopener/noreferrer, retaining the original home. This follow-up is NOT yet deployed.
- Added an offline iframe browser regression with intercepted destinations: verifies popup URL, null opener, and preserved home. Actual Canvas popup acceptance remains a post-deployment gate.
- Follow-up verification: 74 isolated training tests and all 20 browser tests passed across four viewport profiles. TypeScript passed after the browser server stopped; an earlier concurrent check collided with regenerated Next.js type files. Local test database stopped successfully.
- STEP02-09 quizzes remain unpublished. Teacher-specific result/adoption workflow and deliberate fictional quiz submission are still pending.

## Production popup acceptance and teacher selector follow-up

- Deployed 1bf8a00 as ngas-btob-popup:1bf8a00; app Up on port 3001, DB healthy, local/public HTTP 200. Guarded image-only override change; backup retained; no migration or environment edits.
- Actual fictional-student clicks opened course-2 quiz100 and BtoB materials in separate top-level tabs; original LTI home remained. No quiz attempt started. Restored unselected lesson and administrator session.
- Masqueraded as existing teacher-test (user19), launched course2 LTI, confirmed teacher menu and absence of administrator menu. Results page was accessible and had no saved review data.
- Found two identical STEP01 final-test selector labels with values 4 and 100. Did not request a CSV or adopt a result while selection was ambiguous. Ended masquerade.
- Follow-up labels include catalog course ID and quiz ID while preserving all-course teacher access. No authorization, acquisition, or grading changes. Focused selector/catalog tests: 4 passed; TypeScript passed. This selector change is not yet deployed or browser-verified.
