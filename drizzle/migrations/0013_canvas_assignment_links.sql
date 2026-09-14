CREATE TABLE canvas_assignment_links (
  course_id text NOT NULL CHECK (length(btrim(course_id)) > 0),
  assignment_id text NOT NULL REFERENCES assignments(id),
  canvas_assignment_id integer NOT NULL CHECK (canvas_assignment_id > 0),
  created_at timestamptz NOT NULL,
  created_by text NOT NULL,
  PRIMARY KEY (course_id, assignment_id),
  CONSTRAINT canvas_assignment_links_target_key UNIQUE (course_id, canvas_assignment_id)
);
--> statement-breakpoint
GRANT SELECT, INSERT ON canvas_assignment_links TO aischool_app;
