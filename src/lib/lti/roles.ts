import type { Role } from "@/lib/auth";

/**
 * LTI 1.3 のロール（IMS URN）をカスタム層のロールへ写像する。
 * 例: http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor
 * 上位ロールを優先（管理者＞講師＞受講生＞ゲスト）。
 */
export function mapLtiRoles(roles: readonly string[]): Role {
  const has = (keyword: string) => roles.some((r) => r.includes(keyword));
  if (has("Administrator")) return "admin";
  if (has("Instructor") || has("TeachingAssistant") || has("ContentDeveloper")) {
    return "teacher";
  }
  if (has("Learner") || has("Student")) return "student";
  return "guest";
}
