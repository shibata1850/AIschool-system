/**
 * LTI Advantage NRPS（Names and Role Provisioning Services）: 名簿をLTIサービスで取得する。
 * 起動時の namesroleservice クレームの context_memberships_url から取得する。
 */
import { mapLtiRoles } from "../roles";
import type { Role } from "@/lib/auth";

export interface NrpsMember {
  userId: string;
  name?: string;
  role: Role;
  status?: string;
}

interface RawMember {
  user_id: string;
  name?: string;
  roles: string[];
  status?: string;
}

export async function getMembership(
  membershipUrl: string,
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<NrpsMember[]> {
  const res = await fetchFn(membershipUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/vnd.ims.lti-nrps.v2.membershipcontainer+json",
    },
  });
  if (!res.ok) {
    throw new Error(`名簿の取得に失敗しました（HTTP ${res.status}）`);
  }
  const json = (await res.json()) as { members?: RawMember[] };
  return (json.members ?? []).map((m) => ({
    userId: m.user_id,
    name: m.name,
    role: mapLtiRoles(m.roles ?? []),
    status: m.status,
  }));
}
