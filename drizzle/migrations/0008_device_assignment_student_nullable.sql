-- 座席の受講生割当を「空席あり」にする（2026-09-04）。
--
-- 経緯: 0007 で名簿をLTI起動の記録（students）から作るようにしたが、
-- device_assignments.student_id は seed が入れた架空ID（s02 など）のままで、
-- 実受講生がどの座席にも紐づかず座席番号 0 で表示されていた。
-- 講師が画面から座席へ割り当てられるようにするには、割当前の状態＝空席を
-- 表現できる必要がある。NOT NULL のままだと空文字などの偽の値を使うことになる。
ALTER TABLE "device_assignments" ALTER COLUMN "student_id" DROP NOT NULL;

-- 同じ受講生が2席に居ることはない（16台の実機に1人ずつ座る）。
-- NULL は複数許されるため、空席が複数あってもこの制約には掛からない。
CREATE UNIQUE INDEX IF NOT EXISTS "device_assignments_student_id_key"
  ON "device_assignments" ("student_id");
