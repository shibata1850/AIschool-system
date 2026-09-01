import {
  boolean,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * データ永続化層のスキーマ（要件定義書 6.1 のエンティティに対応）。
 * 参照実装は単一の DomainStore（インメモリ）だった構造をそのままテーブル化しており、
 * 6.1で挙げられた粒度（student_profiles等）への完全分割はまだ行っていない
 * （実受講生プロフィールを扱う機能自体が未実装のため。必要になったら追加する）。
 */

export const assignments = pgTable("assignments", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  charLimit: integer("char_limit").notNull(),
  /** ISO 8601 文字列のまま保持（既存の型定義・表示ロジックに合わせる） */
  deadline: text("deadline").notNull(),
});

export const submissions = pgTable("submissions", {
  id: text("id").primaryKey(),
  assignmentId: text("assignment_id")
    .notNull()
    .references(() => assignments.id),
  studentId: text("student_id").notNull(),
  status: text("status").notNull(),
  version: integer("version").notNull(),
  promptText: text("prompt_text").notNull(),
  aiOutputText: text("ai_output_text").notNull(),
  reflectionText: text("reflection_text").notNull(),
  isLate: boolean("is_late").notNull(),
  /** AiGradeResult | null */
  aiGrade: jsonb("ai_grade"),
  teacherScore: integer("teacher_score"),
  hasDeviation: boolean("has_deviation").notNull(),
  teacherComment: text("teacher_comment"),
  submittedAt: text("submitted_at"),
  /** Array<{version, promptText, submittedAt}> */
  versions: jsonb("versions").notNull(),
  /**
   * 提出者のCanvas数値ユーザーID（LTI起動時のカスタムフィールド由来）。
   * 講師の成績確定をCanvas成績表へ書き戻すのに使う（F3①・B-3方式）。
   * デモ・Cookie運用では null（書き戻しは行われない）。
   */
  canvasUserId: integer("canvas_user_id"),
  /** Canvas成績表への反映に成功した時刻。未反映は null */
  canvasSyncedAt: timestamp("canvas_synced_at", { withTimezone: true }),
  /** 未反映の理由（Canvas未接続・名簿に不在・APIエラー等）。反映済みなら null */
  canvasSyncError: text("canvas_sync_error"),
});

/** 授業コマ1回分の学習記録（到達度・出席が同居。既存 LessonRecord に対応） */
export const lessonRecords = pgTable(
  "lesson_records",
  {
    studentId: text("student_id").notNull(),
    lessonId: text("lesson_id").notNull(),
    weekStart: text("week_start").notNull(),
    attended: boolean("attended").notNull(),
    submitted: boolean("submitted").notNull(),
    score: integer("score"),
    dataMissing: boolean("data_missing").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.weekStart] })],
);

export const deviceAssignments = pgTable("device_assignments", {
  seatNo: integer("seat_no").primaryKey(),
  nucId: text("nuc_id").notNull(),
  /** 2026-08-24 パンフレットv2でGOOVIS廃止・モバイルモニターが主画面に（旧 goovisId） */
  monitorId: text("monitor_id").notNull(),
  studentId: text("student_id").notNull(),
  usingBackup: boolean("using_backup").notNull(),
});

/**
 * 週次到達度レポートの生成済みスナップショット（要件定義書F4・9.2 F4①）。
 * 毎週月曜7:00のバッチが1週につき1行を作る（再生成は同じ週の行を置き換える）。
 * 画面のリアルタイム集計とは別に、「いつ生成し・いつ通知したか」を残すための記録。
 */
export const weeklyReports = pgTable("weekly_reports", {
  /** 対象週の月曜（ISO日付）。1週1行 */
  weekStart: text("week_start").primaryKey(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
  /** WeeklyReport（src/lib/f4/weeklyReport.ts）のJSON */
  payload: jsonb("payload").notNull(),
  /** Canvasメッセージでの通知に成功した時刻。未通知はnull */
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  /** 未通知の理由（Canvas未接続・送信失敗など）。通知済みならnull */
  notifySkippedReason: text("notify_skipped_reason"),
});

/**
 * eラーニングシステム（姉妹システム）から受け取った自宅学習の到達度（E7-c）。
 *
 * **教室の到達度（lesson_records 由来）とは別物として保持し、合成しない。**
 * 尺度も期間も母集団も違うため加重平均に意味がなく、合成すると相手側が
 * 自分の算出根拠を説明できなくなる（docs/eラーニング連携.md 3.2.2）。
 *
 * 1受講生×1単元につき最新の1行だけを持つ（上書き）。履歴は監査ログ側に残る。
 * unit_id に外部キーを張らないのは、課題が削除されても受信済みの記録を
 * 消さないため（受信の事実は監査上の記録でもある）。
 */
export const externalMastery = pgTable(
  "external_mastery",
  {
    /** 受講生ID（本リポジトリのマスタが「正」。LTI起動時のCanvas利用者ID） */
    studentId: text("student_id").notNull(),
    /** 単元ID。本リポジトリの assignments.id を参照する想定（FKは張らない — 上記） */
    unitId: text("unit_id").notNull(),
    /** 送信元システムの識別子。現在は "elearning" のみ */
    source: text("source").notNull(),
    /**
     * 到達度 0〜100。**null は「測定中」**を表し、0点ではない
     * （先方要件定義書 E4 例外1。0として扱うと受講生に誤解を与える）
     */
    score: integer("score"),
    /** 算出根拠。受講生本人が確認できること（先方 受け入れ基準 B-3） */
    reasons: jsonb("reasons"),
    /** 送信元が算出した時刻（送信元の時計） */
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
    /** 本リポジトリが受け取った時刻（こちらの時計） */
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.studentId, table.unitId, table.source] })],
);

/** 追記専用（DBロールでUPDATE/DELETEを拒否 — CLAUDE.md 9章・SEC-2） */
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull(),
  actorRole: text("actor_role").notNull(),
  actorId: text("actor_id"),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
});
