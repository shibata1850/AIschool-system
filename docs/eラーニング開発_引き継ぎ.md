# e-Learning System — Developer Handover / 開発引き継ぎ資料

- Version 0.1 (draft) — 2026-09-01
- Prepared by: SOFTDOING Inc. (client / 発注者)
- For: the engineer taking over development / 開発を担当されるエンジニア向け
- Language: English body with a Japanese summary at the top of each section.
  日本語要旨を各章の冒頭に置いています。

### What you have been given / お渡しする資料

**日本語要旨**: 資料は2点。本書（進め方）と要件定義書の英訳（何を作るか）。
本書は自己完結しており、他のファイルを参照しなくても読めます。

| Document | What it is |
|---|---|
| **This document** | How we work: stages, rules, and the one design decision that matters |
| **Requirements Specification (Edition 1), English translation** | What to build: features, exceptions, acceptance criteria |

That is the whole set. **This document does not refer to anything you have not
been given.** If you find a reference you cannot follow, that is a mistake on our
side — tell us.

---

## 0. Read this first / まず読んでください

**日本語要旨**: 3点だけ先に。①UIはすべて日本語。②実在の個人情報は絶対に使わない。
③データアクセスは必ず `src/data/` 経由（理由は5章）。

Three things before anything else:

1. **All user-facing text must be in Japanese.** The users are Japanese students,
   working adults, and corporate training managers. Code, comments, commit messages
   and this document are in English — but every string a user sees is Japanese.
   If you are unsure of the wording, leave a `TODO(ja):` marker and ask.
2. **Never use real personal data.** No real names, emails, phone numbers, or
   company names — in code, test fixtures, seed data, screenshots, or commits.
   Use obviously fictional values.
3. **All data access goes through `src/data/`.** Never import `@base44/sdk`
   from a component. This single rule is what makes the later migration cheap
   (see section 5).

---

## 1. What we are building / 何を作るのか

**日本語要旨**: 通学制スクールの「教室の外」を埋めるシステム。動画を見て終わりにせず、
小テストの結果からAIが弱点を特定し、次に解くべき問題を出し分ける。これが差別化の核。

**Next Gen AI School** is a school opening in October 2026 in Kitakami, Iwate, Japan.
Students are employees of companies and local government who attend **in person**:
40 hours total (4 hours/day × 10 days). During those 40 hours each student builds
one working business system for their own workplace.

**This project is the other half — the time between classes.**

Attending in person 1–2 times a week is not enough for the material to stick.
Students study at home or at work, in **15–30 minute fragments**, mostly on a
**smartphone**. This system makes that time productive.

**The differentiator is not video delivery. It is what happens after the quiz.**
The system estimates mastery per unit, identifies weak areas, and selects which
review questions to serve next. Watching a video and moving on is exactly the
failure mode we are designing against.

### 1.1 There are two systems. Do not confuse them.

**日本語要旨**: 「クラウドキャンパス」（対面授業用・Canvas LMS）とは**別システム**。
機能が重なると補助金の二重計上になる。重なりそうな作業が出たら止めて相談すること。

| | Cloud Campus (existing) | **e-Learning (this project)** |
|---|---|---|
| Where learning happens | In the classroom, in person | At home / at work, asynchronous |
| Platform | Canvas LMS + custom layer | **Independent web app** (no Canvas dependency) |
| Devices | Classroom PCs, VR headsets | **Smartphone first** |
| Unit of evaluation | Per exercise, graded by instructor | Per unit, mastery score |

These are funded by **two different government subsidies**. If the two systems
implement the same feature, it is reported as double-counting. **This is the single
most important constraint on this project.**

**Do NOT build any of the following** — they belong to Cloud Campus:

- Course / class / timetable management (Cloud Campus owns the master data)
- AI tutor chat
- Jupyter Notebook exercise environment
- Prompt exercises and their AI grading
- Real-time in-class progress monitoring
- Anything VR / MR

If a request looks like one of these, **stop and ask** rather than implementing it.

---

### 1.2 The functional specification

**日本語要旨**: 「何を作るか」は先方の要件定義書 第1版にある。英訳を別紙で渡す。

This document tells you **how we work**. **What to build** is in the requirements
specification (Edition 1, 21 August 2026). An English translation is provided
separately as `eラーニング要件定義_第1版_英訳.md`.

Two things to keep in mind about it:

- **It is deliberately only ~20% complete** and will be revised twice more.
  Eleven items are still open — including the mastery-scoring algorithm, which is
  the core of E4. **Do not code a guessed formula.**
- **The Japanese original is authoritative.** Where the translation is unclear, ask.

---

## 2. Scope / 担当範囲

**日本語要旨**: E1〜E6が担当範囲。E7（Canvas連携）はCanvas側の設定が要るので後段で共同作業。

| # | Feature | Yours? | Notes |
|---|---|---|---|
| E1 | Student portal | ✅ | One screen, one next action. Never show a menu of choices |
| E2 | Video progress tracking | ✅ | Playback position, completion判定 (≥90% of duration) |
| E3 | Quizzes | ✅ | Multiple choice / multi-select / fill-in (exact match). Instant grading |
| E4 | **AI mastery analysis** | ✅ | **The core. If this is weak, the project has no reason to exist** |
| E5 | Weekly report delivery | ✅ | To the student and to their company's training manager |
| E6 | Content management | ✅ | Instructor registers videos and questions. CSV bulk import |
| E7 | Cloud Campus integration | ⏸ Later | Needs Canvas-side configuration. We will do this together |
| E8 | Tests / QA | ✅ | See section 6 |
| E9 | Documentation | Shared | You write the technical docs; we write the operational ones |

**Priority if time runs short**: E4 is non-negotiable. E1–E3 feed E4, so they are
also required. If something must slip, it should be E5 → E6 → E7, in that order.
**Never propose slipping E4.**

### 2.1 Video hosting

Videos are hosted on **YouTube (unlisted)**. We do not store or stream video
ourselves. Your job is to record *which* video belongs to which unit and to track
*how much* of it the student watched — not to deliver the bytes.

---

## 3. The pipeline and what "done" means at each stage

**日本語要旨**: BASE44 → GitHub → Codex → さくらのサーバー。各段階の完了条件を先に決めておく。
**特に段階1の完了条件（モックのみ・接続点を守る）を外すと、後の工程が高くつく。**

```
[Stage 1]           [Stage 2]        [Stage 3]              [Stage 4]
BASE44        →     GitHub      →    Codex             →    Sakura Cloud
prototype           (SOFTDOING)      backend + wiring       production
mock data only      version control  replace the mock       HTTPS, backups
```

### Stage 1 — BASE44 prototype (you)

**Goal**: every screen works, using **mock data only**.

BASE44 is an AI app builder. It generates a standard **Vite + React + Tailwind +
shadcn/ui** project. You describe what you want; it writes the code. It is very fast
for screens — that is why we start here.

Definition of done:

- [ ] All E1–E6 screens exist and are usable end to end with mock data
- [ ] `src/data/types.js` is complete — **this file becomes the API specification**
- [ ] `grep -r "@base44/sdk" src/components src/pages` returns **nothing**
- [ ] The BASE44-generated auth screens are **untouched** (see section 5.2)
- [ ] On a phone, a student can complete: watch → take quiz → see result → get review
- [ ] All UI text is Japanese

### Stage 2 — Connect to GitHub (SOFTDOING side)

**Goal**: the code lives in the SOFTDOING GitHub organization.

BASE44 has a GitHub connection feature (⋯ menu → "GitHub connection"). **Note that
none of our existing BASE44 apps use it yet** — every app currently reports
`git_remote_source: "s3"`, meaning the code sits in BASE44's own storage. Connecting
is therefore a first-time operation and **SOFTDOING will handle it**, because it
touches organization-level access.

Definition of done:

- [ ] Repository exists under the SOFTDOING GitHub organization (required by the
      contract: source code must be delivered there)
- [ ] You can push to feature branches; `main` is protected
- [ ] `.env.local` and any secrets are **not** in the repository

### Stage 3 — Backend, in Codex (you)

**Goal**: replace the mock with a real backend. **This is the largest piece of work.**

Be aware of what BASE44 does and does not give us. The exported code is a
**front-end only**. Database, authentication and server-side functions live in
BASE44's cloud, reached through `@base44/sdk`. Moving the files to our server moves
the screens — **not the data**. So this stage is not a deployment step; it is
building the back end.

**You do not start from zero.** We have already built and hardened this exact
stack for Cloud Campus, in production. **We will hand you the files at the start
of Stage 3** — you do not need to design the infrastructure. What you will receive:

| Piece | What it gives you |
|---|---|
| `docker-compose.yml` | App container + PostgreSQL 16, with a health check so the app waits for the database. The app port binds to `127.0.0.1` only — public access goes through a reverse proxy |
| Migration setup | Drizzle ORM migrations, run from a compiled script (no dev dependencies needed at runtime) |
| **Two database roles** | An **app role** with only the CRUD grants it needs, and a separate **admin role** that owns the tables and runs migrations. The app never connects as the owner |
| **Append-only audit log** | The audit table grants the app role SELECT and INSERT **but not UPDATE or DELETE**. Tamper resistance is enforced by the database, not by application code — which is what the contract's chapter 6.2 asks for |
| Seed script | Loads fictional demo data. Refuses to run without an explicit `--force` flag, because it deletes everything first |
| Hardened container image | Dev dependencies pruned, OS packages upgraded, npm CLI removed. Currently scans clean: **zero Critical, zero High** |

Two notes on using it:

- **Copying an infrastructure pattern is fine. Copying a feature is not** (section 1.1).
  Take the compose file, the role design and the audit-log approach. Do not take
  application code.
- The audit-log role design is the part most worth keeping exactly as-is. It is
  easy to weaken by accident — for example by giving the app role UPDATE so a
  "fix a typo in the log" feature can work. **Do not.**

Definition of done:

- [ ] `src/data/http.js` implements the same contract as `src/data/mock.js`
- [ ] `src/data/mock.js` is deleted, and nothing references it
- [ ] Authentication works (see 5.2 — this is Canvas SSO, not BASE44 auth)
- [ ] All tests pass against the real backend
- [ ] `@base44/sdk` and `@base44/vite-plugin` are removed from `package.json`

### Stage 4 — Deploy to Sakura Cloud (SOFTDOING side, with you)

Definition of done — these come from the contract's acceptance criteria:

- [ ] Runs on SOFTDOING's Sakura Cloud account, **separated from Cloud Campus**
- [ ] Reachable over HTTPS (TLS 1.3) on its own subdomain, certificate auto-renews
- [ ] Login works with the same account as Cloud Campus (SSO)
- [ ] Daily backup runs; restoring any one generation has been demonstrated
- [ ] Uptime monitoring is live and alerts reach the address we specify
- [ ] Admin rights have been transferred to SOFTDOING

---

## 4. Non-negotiable rules / 守っていただく規約

**日本語要旨**: 個人情報・シークレット・日本語UI・境界。この4つは例外なし。

1. **No real personal data, anywhere.** Not in code, fixtures, seed data, logs,
   screenshots, or commit messages. Fictional values only. Learning logs are treated
   as sensitive personal data under our privacy certification (PrivacyMark).
2. **Never commit secrets.** API keys, database URLs, tokens. Check `.gitignore`
   every time. If you think a secret was committed, tell us immediately — do not
   quietly force-push.
3. **All user-facing text in Japanese** (section 0).
4. **Do not implement Cloud Campus features** (section 1.1). When in doubt, ask.
5. **Do not log personal information.** User IDs are fine; names are not.
6. **Destructive operations need confirmation first** — dropping a database,
   deploying to production, force-pushing. Ask before, not after.

---

## 5. The one design decision that matters most / 最重要の設計判断

**日本語要旨**: データアクセスを1モジュールに集約する。これを守れば、バックエンド移行が
「向き先を1行変えるだけ」になる。守らないと、全コンポーネントを書き換えることになる。

### 5.1 The data seam

Put **all** data access behind one module. Components never talk to BASE44 directly.

```
src/data/
  types.js    # the shape of the data — THIS IS THE API SPECIFICATION
  index.js    # the only entry point components import
  mock.js     # Stage 1 implementation: returns fixed data
  http.js     # Stage 3 implementation: calls our own API, same shapes
src/auth/
  index.js    # getCurrentUser() and nothing else
```

`index.js` decides which implementation to use:

```js
// src/data/index.js
import * as mock from './mock';
import * as http from './http';

// Stage 1: mock. Stage 3: switch to http, then delete mock.js.
export const data = import.meta.env.VITE_DATA_SOURCE === 'http' ? http : mock;
```

**Why this matters so much.** If `base44.entities.Quiz.list()` is scattered across
forty components, migrating means editing forty components and re-testing all of
them. If it is behind this seam, migrating means changing one line and writing
`http.js`. The cost difference is roughly one week versus one day.

**Write `types.js` first, before the mock.** The shapes you choose there become the
contract the backend must implement. Getting this file right means the backend is
already specified by the time Stage 1 ends — which is the entire reason this plan is
affordable.

Suggested starting point (from the requirements document's data model):

```js
/**
 * @typedef {Object} Unit          単元
 * @property {string} id
 * @property {string} title
 * @property {number} order
 *
 * @typedef {Object} Video         動画教材
 * @property {string} id
 * @property {string} unitId
 * @property {string} youtubeId
 * @property {number} durationSec
 *
 * @typedef {Object} WatchProgress 視聴進捗
 * @property {string} videoId
 * @property {number} positionSec   再生位置
 * @property {number} watchedSec    累計視聴（動画尺基準・倍速は実時間で数えない）
 * @property {boolean} completed    watchedSec / durationSec >= 0.9
 *
 * @typedef {Object} Question      設問
 * @property {string} id
 * @property {string} unitId
 * @property {'single'|'multiple'|'fill'} kind
 * @property {string} body
 * @property {Choice[]} choices
 * @property {boolean} disabled     講師が無効化した設問
 *
 * @typedef {Object} Attempt       受験セッション
 * @property {string} id
 * @property {string} unitId
 * @property {'in_progress'|'graded'|'done'} state
 * @property {Answer[]} answers
 *
 * @typedef {Object} Mastery       到達度スコア
 * @property {string} unitId
 * @property {number|null} score    0-100。データ不足なら null（「測定中」と表示、0点にしない）
 * @property {string[]} reasons     算出根拠。受講生本人が確認できること（契約要件）
 */
```

Note `Mastery.score` is nullable and carries `reasons`. Both are contractual: a
student with too little data must be shown "測定中", not a zero; and the student
must be able to see *why* their score is what it is. The algorithm must not be a
black box.

### 5.2 Do not build authentication

**日本語要旨**: BASE44の認証画面は全部捨てることが確定している。触らないでください。

BASE44 generates a full authentication suite — `Login.jsx`, `Register.jsx`,
`ForgotPassword.jsx`, `ResetPassword.jsx`, `OAuthConsent.jsx`, plus `AuthContext.jsx`
— and scatters `base44.auth.*` calls across them. In one of our existing apps there
are 15 such call sites.

**All of it will be thrown away.** The contract requires students to log in with
their **Cloud Campus (Canvas) account** via LTI 1.3 or OAuth 2.0 — so that a student
never has two accounts. BASE44's email/password and Google login are not what we need.

So: **do not elaborate those screens, do not style them, do not add features to
them.** Every hour spent there is an hour thrown away.

Instead, put a seam here too:

```js
// src/auth/index.js
export async function getCurrentUser() {
  // Stage 1: a fixed fictional user.
  // Stage 3: replaced by Canvas SSO.
  return { id: 'stu-001', displayName: '受講生テスト', role: 'student' };
}
```

### 5.3 Tell BASE44's AI about these rules

BASE44 reads `AGENTS.md` at the repository root. **If you do not write the rules
there, the AI will scatter SDK calls through your components** — it has no other way
to know. Append the following:

```markdown
## Project rules (added by SOFTDOING — do not remove)

- All user-facing text must be in Japanese.
- NEVER import `@base44/sdk` from files under `src/components/` or `src/pages/`.
  All data access goes through `src/data/index.js`.
- Add new data operations to `src/data/types.js` and `src/data/mock.js` first,
  then use them from components.
- Do NOT modify the authentication screens (`src/pages/Login.jsx`,
  `Register.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx`, `OAuthConsent.jsx`)
  or `src/lib/AuthContext.jsx`. They will be replaced by Canvas SSO.
  Use `src/auth/index.js` instead.
- Never put real personal data in code, fixtures or seed data. Fictional only.
- Design for smartphones first. Sessions are 15–30 minutes and get interrupted:
  never lose playback position or a partially answered quiz.
```

---

## 6. Testing / テスト

**日本語要旨**: 機能とテストは同じコミットに入れる。4パス（正常系・入力エラー・権限・境界値）。
権限テスト（他社の受講生情報が見えないこと）は必須項目。

Our house rule, applied here:

- Feature code and its test go in **the same commit**. No "tests later" commits.
- Each feature gets four paths: **happy path, invalid input, permissions, boundary
  values**.
- **Permission tests are mandatory and specifically called out in the contract**:
  a corporate training manager must never see students from another company.
  Mixing data between client companies would be a serious incident.
- No fixed waits (`sleep`, `waitForTimeout`). Wait on a condition.
- Selector priority: role → label → text → test-id. CSS selectors last.
- Never commit `.skip` or `.only`.

Boundary cases worth testing early, because they are in the contract:

- Closing the browser mid-video → position is kept, resumes at the same place
- Playing at 2× speed → counted against video duration, not wall-clock time
- Skipping ahead → skipped ranges do not count toward completion
- Same account playing on two devices → last write wins
- Abandoning a quiz halfway → answers are kept, can be resumed
- A student with fewer than one attempt → shows "測定中", **not** a score of 0
- Network dropped while submitting → answers held on device, sent on reconnect

---

## 7. Access you will be given / 権限の範囲

**日本語要旨**: 権限は最小限にする予定（GitHubとBASE44）。**本番のSSH・DBパスワード・
APIキーは渡さない**。デプロイはSOFTDOING側で行う。確定したら本節を更新する。

Planned (to be confirmed):

- ✅ BASE44 (the app you are building)
- ✅ GitHub, push access to feature branches in the SOFTDOING organization
- ❌ Production server SSH, database passwords, API keys

Deployment is done by SOFTDOING. If this makes the loop too slow, tell us and we
will set up a separate staging server rather than widening production access.

**If you are ever sent a credential you did not expect, do not use it — tell us.**

---

## 8. Open questions we owe you / こちらが未確定の事項

**日本語要旨**: 以下は発注者側でまだ決まっていない。着手前に確定させる。

| # | Question | Blocks |
|---|---|---|
| 1 | The mastery algorithm — weights, decay rate, thresholds | E4. We must approve it, and it must not be a black box |
| 2 | Whether learners under 18 are included | Consent handling, log retention |
| 3 | Log retention period | Currently proposed: enrollment + 3 years |
| 4 | Corporate contract structure — how many managers per company, what they may see | E5, permission model |
| 5 | System name | Nothing technical. Use a placeholder |

Do not guess on #1. Propose an approach, we approve it, and then it is written into
the specification.

---

## 9. Who to ask / 連絡先

**日本語要旨**: 判断に迷ったら止めて聞く。特に境界（1.1）に触れそうなときは必ず。

- Anything about scope, the two-system boundary, or the subsidy constraints
  → ask before implementing, not after
- Anything about Canvas / Cloud Campus / SSO → SOFTDOING side
- Anything you think might be personal data → ask

**Stopping to ask is always cheaper than building the wrong thing.** The boundary
rules in section 1.1 exist for accounting reasons that are not obvious from the
code, and they are the most expensive thing to get wrong.

---

## 10. Revision history

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-01 | Initial draft. Stage gates, data seam design, AGENTS.md rules |
