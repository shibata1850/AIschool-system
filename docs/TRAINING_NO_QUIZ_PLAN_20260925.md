# Explicit no-quiz lesson setting

Status: implemented and tested locally; not deployed. Production database and settings remain unchanged.

## Production approval

The user explicitly approved the proposed deployment scope on 2026-09-25 (recorded at 18:04 JST): migration 0020, custom-app update, and course2 lesson5's no-quiz setting. The approval follows the proposed execution window of 21:00 JST or later; it does not override the weekday 16:00-21:00 build/restart restriction. Revalidate production state and take a fresh backup before execution. Canvas itself, .env, quiz publication and formal achievement adoption remain outside this approval. Deployment is still pending.

## Local verification completed on 2026-09-25

- Isolated PostgreSQL migration runner completed twice, including migration 0020.
- Focused database and training tests: 81 passed across 5 files.
- Supplemental training form and link tests: 10 passed.
- Browser regression tests: 20 passed across four viewport projects, including mobile. The new checkbox, disabled quiz selector, save/reload, explicit no-quiz student display, and transition back to required were exercised.
- TypeScript check passed after the browser tests completed. The temporary database server shut down normally.
- Existing-row upgrade verification passed at 17:27 JST: the isolated harness applied the actual 0016 DDL, inserted fictional rows with and without quiz URLs, then applied the actual 0020 migration. All original row values were preserved and quiz_required defaulted to true. Saving false with a null URL succeeded; false with a URL and a null boolean were rejected with PostgreSQL constraint errors. The test transaction was rolled back without touching the public schema.
- After the upgrade check, the full migration runner succeeded twice and all 81 focused tests passed again. The temporary database shut down normally. This is a representative local upgrade check, not a production backup restore rehearsal.
- Full isolated local suite at 17:31 JST: 111 test files and 966 tests passed (82.59 seconds). The same run also passed the existing-row upgrade check and two migration-runner executions, then shut down its temporary PostgreSQL server normally.
- Production migration scope is now approved as recorded above; execution still requires a permitted deployment window. No production migration, restart, lesson setting change, or quiz publication was performed for this implementation.

## Observed issue

Lesson 5 is the first half of STEP05 and intentionally has no final quiz. Lesson 6 holds its final quiz. Both intentional absence and an unfinished quiz configuration currently use canvas_quiz_url = NULL and render 小テスト：準備中. The setting is not recoverable from the existing database value alone.

## Proposed representation

- Add quizRequired:boolean, default true, to each training day, persisted in a new NOT NULL boolean column with default true. This is an additive migration, not part of the previous no-migration deployments.
- Existing records and older API payloads without the field preserve true. Never infer false from lesson number, title, missing URL or material URL.
- Reject non-boolean supplied values. Reject quizRequired=false combined with a non-null quiz URL.
- Teacher form: a labelled checkbox per lesson, 小テストを実施する. Unchecking clears the selected quiz URL and disables its selector; rechecking leaves the URL unselected so the teacher chooses it explicitly.
- Student home: false -> 小テスト：この回は実施しません; true and URL absent -> 小テスト：準備中; true and URL present -> existing external link. Preserve target=_blank and noopener/noreferrer.
- Existing course access, URL allowlists, revision conflict handling and audit logging remain unchanged. Include the new value in read, save, audit before/after and response validation.

## Verification before release

1. Parser defaults for old records/payloads; true/false round-trip; invalid type and inconsistent URL rejection.
2. Isolated DB additive migration and repeated migration runner; existing rows keep true, false survives save/read, audit retains intent, conflicts and failed writes stay atomic.
3. Teacher UI toggle, disabled URL control, save/reload, and transitions back to required. Student view distinguishes all three states. Existing legacy home and cross-course isolation unchanged.
4. Browser checks on desktop/mobile, including preserved external-tab behavior. Keep real Canvas and production DB out of local tests.
5. Before production migration, review and explicitly confirm the new migration scope; take a validated backup and deploy outside prohibited restart/build hours. Do not reset any existing lesson or publish additional quizzes.
6. After deployment, change only course2 lesson5 to not required and verify student display with temporary lesson selection, restoring current lesson afterward. Lesson6 final quiz remains130.

## Rollback caution

Old application code ignores the new field. After false values are saved, rolling back the application can display 準備中 again and an old writer can overwrite the flag with its default during day replacement. Keep the additive column; do not drop it during rollback. Record affected lesson settings before reverting and reapply intent after forward recovery.

## Production execution gates (not executed)

1. Obtain explicit approval for migration 0020, custom-app replacement, and course2 lesson5's no-quiz setting. Weekday 16:00-21:00 JST remains excluded for builds/restarts unless separately overridden.
2. Re-read the production HEAD, worktree status, container image, resolved ports and migration ledger. The previously observed HEAD was 8fb6dd6; do not assume it is still current. Stop if another agent's changes or unexpected pending migrations are found. Do not overwrite server-local compose overrides or Caddy configuration.
3. Commit and review the exact candidate before packaging. Confirm that 0020 is the only pending migration. The normal migration runner applies all pending entries, so never invoke it without this check.
4. Take a new restricted-permission database backup and verify archive integrity; distinguish that check from a successful restore rehearsal. Record the current app image and compose configuration for rollback without printing environment values.
5. Build the candidate before applying the migration. Use a bounded database lock timeout for the migration session; a lock timeout is a stop condition, not permission to terminate other sessions. Apply via the normal migration runner so the ledger stays consistent. Verify the new column, constraint, row counts and default values using counts/booleans only.
6. Replace only the custom app, preserving 127.0.0.1:3001 and all other compose settings. Verify container health, local/public HTTP responses and Canvas LTI launch. Do not restart Canvas or change .env.
7. Through the teacher UI, set only course2 lesson5 to no quiz. Verify saved state and student display, keep lesson6 quiz130 unchanged, restore the original current-lesson selection and exit impersonation. Leave STEP02-09 quizzes unpublished and formal achievement records unchanged.
8. If application verification fails, restore the recorded app image/configuration without dropping the additive column. Avoid settings writes from the old app after a false value has been saved. Record the failure and remaining recovery work rather than claiming a complete rollback of behavior.

## Separate pending work

Formal achievement adoption is not authorized by the completed learner-display approval. Do not adopt a result into the teaching-week aggregate as part of this change. STEP02-09 quiz publication and low-priority Quest speech fallback are also out of scope.
