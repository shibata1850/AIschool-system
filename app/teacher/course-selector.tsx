export function CourseSelector({ courses, courseId, labels = {}, emptyLabel = "コース未設定の記録" }: {
  courses: string[]; courseId: string | null; labels?: Record<string, string>; emptyLabel?: string;
}) {
  return <form method="get" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", margin: "1rem 0" }}>
    <label htmlFor="staff-course">コース</label>
    <select id="staff-course" name="course" defaultValue={courseId ?? ""} style={{ maxWidth: "100%", minWidth: 0 }}>
      {courses.map(id => <option key={id} value={id}>{labels[id] ?? id}</option>)}
      <option value="">{emptyLabel}</option>
    </select>
    <button type="submit">表示</button>
  </form>;
}
