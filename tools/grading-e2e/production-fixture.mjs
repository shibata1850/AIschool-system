export function assertProductionFixtureEnvironment(env) {
  const url = new URL(env.DATABASE_ADMIN_URL ?? '');
  if (env.LOCAL_PRODUCTION_LOAD !== '1' || url.hostname !== '127.0.0.1' ||
      url.pathname !== '/aischool_test' || env.ALLOW_DEV_RESET || env.DEV_COOKIE_ROLES) {
    throw new Error('Fresh isolated production-load database required');
  }
}

// The caller owns the fresh DB lifecycle. Never reset or overwrite existing rows.
export async function prepareProductionFixture(client, env) {
  assertProductionFixtureEnvironment(env);
  await client.query('BEGIN');
  try {
    const existing = await client.query(`SELECT
      (SELECT count(*) FROM assignments) + (SELECT count(*) FROM students) +
      (SELECT count(*) FROM submissions) AS count`);
    if (Number(existing.rows[0].count) !== 0) throw new Error('Fixture requires empty learning tables');
    for (let round = 0; round < 4; round++) {
      const assignment = `production-load-round-${round}`;
      await client.query('INSERT INTO assignments (id,title,description,char_limit,deadline) VALUES ($1,$2,$3,2000,$4)',
        [assignment, 'Fictional load exercise', 'Fictional test only', '2099-01-01T00:00:00Z']);
      for (let i = 1; i <= 16; i++) {
        const student = `production-load-student-${i}`;
        if (round === 0) {
          await client.query('INSERT INTO students (id,display_name,first_seen_at,last_seen_at) VALUES ($1,$1,now(),now())', [student]);
          await client.query('INSERT INTO student_courses (student_id,course_id,last_seen_at) VALUES ($1,$2,now())', [student, 'production-load-course']);
        }
        await client.query(`INSERT INTO submissions
          (id,assignment_id,student_id,course_id,status,version,prompt_text,ai_output_text,reflection_text,is_late,has_deviation,versions)
          VALUES ($1,$2,$3,$4,'not_started',1,'','','',false,false,'[]')`,
        [`${assignment}-${student}`, assignment, student, 'production-load-course']);
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
