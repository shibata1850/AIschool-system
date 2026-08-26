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
