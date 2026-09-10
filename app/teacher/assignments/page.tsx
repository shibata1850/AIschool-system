import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { allocationScope } from "@/lib/f3/allocationPolicy";
import { listAllocationOptions } from "@/lib/f3/allocation";
import { AllocationForm } from "./allocation-form";

export const dynamic = "force-dynamic";
export default async function AssignmentsPage() {
  const scope = allocationScope(await getCurrentUser());
  if (!scope) return <main><h1>課題の割当</h1><p>Canvasのコースから講師として起動してください。</p></main>;
  const {roster,exercises} = await listAllocationOptions(scope);
  return <main style={{maxWidth:"52rem"}}>
    <Link href="/">← ホームにもどる</Link>
    <h1>課題の割当</h1>
    {!exercises.length ? <p>登録されている課題がありません。</p> :
      !roster.length ? <p>このコースの受講生の起動記録はまだありません。</p> :
      <AllocationForm roster={roster} exercises={exercises} />}
  </main>;
}
