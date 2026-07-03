/**
 * F3 プロンプト演習管理のドメイン型（docs/要件定義書.md F3）。
 * 状態遷移: 未着手→取組中→提出済→AI採点済→(完了|差戻し)、差戻し→取組中
 */

export type ExerciseStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "ai_graded"
  | "completed"
  | "returned";

export const STATUS_LABELS: Record<ExerciseStatus, string> = {
  not_started: "未着手",
  in_progress: "取組中",
  submitted: "提出済",
  ai_graded: "AI採点済",
  completed: "完了",
  returned: "差戻し",
};

export interface Assignment {
  id: string;
  title: string;
  description: string;
  /** プロンプト文字数上限（100〜8,000。既定4,000） */
  charLimit: number;
  /** 提出期限（ISO 8601） */
  deadline: string;
}

export interface AiGradeResult {
  /** 総合スコア 0-100 */
  totalScore: number;
  /** 受講生向け講評（ほめる点1つ以上＋改善点1つ） */
  feedback: string;
  /** 講師向け採点根拠（受講生には非表示） */
  rationale: string;
  model: string;
  promptVersion: string;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  status: ExerciseStatus;
  /** 再提出のたびに増える版数（旧版は versions に履歴保持） */
  version: number;
  promptText: string;
  aiOutputText: string;
  reflectionText: string;
  /** 期限後提出フラグ（講師承認で成績反映 — F3例外3） */
  isLate: boolean;
  aiGrade?: AiGradeResult;
  /** 講師確定スコア（完了時に設定。既定はAIスコア） */
  teacherScore?: number;
  /** AI/講師スコア差20点以上で立つ（F3例外2） */
  hasDeviation: boolean;
  /** 差戻し時の講師コメント（必須・最大1,000文字） */
  teacherComment?: string;
  submittedAt?: string;
  /** 旧版の履歴 */
  versions: Array<{
    version: number;
    promptText: string;
    submittedAt: string;
  }>;
}
