import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { assignments, submissions, students, studentCourses, auditLog } from "@/lib/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { allocationScope } from "./allocationPolicy";

export class AllocationError extends Error {}

export async function listAllocationOptions(courseId: string) {
  const db = getDb();
  const roster = await db.select({id:students.id,displayName:students.displayName})
    .from(studentCourses).innerJoin(students,eq(students.id,studentCourses.studentId))
    .where(eq(studentCourses.courseId,courseId)).orderBy(students.displayName);
  const exercises = await db.select({id:assignments.id,title:assignments.title}).from(assignments).orderBy(assignments.title);
  return {roster,exercises};
}

export async function allocateAssignment(actor:CurrentUser, assignmentId:string, studentIds:string[]) {
  const courseId = allocationScope(actor);
  if (!courseId) throw new AllocationError("コースから講師として起動してください。");
  const ids = [...new Set(studentIds)];
  if (!ids.length || ids.length > 100) throw new AllocationError("受講生を選択してください。");
  return getDb().transaction(async tx => {
    // Serialize allocation for this exercise. Existing submissions are never updated.
    const [assignment] = await tx.select().from(assignments).where(eq(assignments.id,assignmentId)).for("update");
    if (!assignment) throw new AllocationError("課題が見つかりません。");
    const roster = await tx.select({id:students.id,canvasUserId:students.canvasUserId})
      .from(studentCourses).innerJoin(students,eq(students.id,studentCourses.studentId))
      .where(and(eq(studentCourses.courseId,courseId),inArray(students.id,ids)));
    if (roster.length !== ids.length) throw new AllocationError("このコースの起動記録にない受講生が含まれています。");
    const existing = await tx.select({studentId:submissions.studentId}).from(submissions)
      .where(and(eq(submissions.assignmentId,assignmentId),inArray(submissions.studentId,ids)));
    const allocated = new Set(existing.map(s=>s.studentId));
    const rows = roster.filter(s=>!allocated.has(s.id)).map(s=>({
      id:randomUUID(),assignmentId,studentId:s.id,canvasUserId:s.canvasUserId,
      status:"not_started",version:1,promptText:"",aiOutputText:"",reflectionText:"",
      isLate:false,hasDeviation:false,versions:[],
    }));
    if (rows.length) {
      await tx.insert(submissions).values(rows);
      await tx.insert(auditLog).values(rows.map(r=>({at:new Date(),actorRole:actor.role,actorId:actor.userId,
        action:"create",entity:"submission",entityId:r.id,
        after:{assignmentId,studentId:r.studentId,courseId,status:"not_started"},
      })));
    }
    return {created:rows.length,skipped:ids.length-rows.length};
  });
}
