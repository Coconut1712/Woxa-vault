import { apiFetch } from "./client";

export interface Team {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  createdAt: string;
}

export interface TeamMember {
  userId: string;
  email: string;
  displayName: string;
  role: "lead" | "member";
  addedAt: string;
}

export interface CreateTeamInput {
  name: string;
  description?: string | null;
}

export interface TeamDetail {
  team: Team;
  members: TeamMember[];
}

/** GET /teams — List teams in active workspace. */
export async function listTeams(): Promise<{ teams: Team[] }> {
  return apiFetch<{ teams: Team[] }>("/teams");
}

/** POST /teams — Create a new team. */
export async function createTeam(input: CreateTeamInput): Promise<{ team: Team }> {
  return apiFetch<{ team: Team }>("/teams", {
    method: "POST",
    body: input,
  });
}

/** GET /teams/:id — Get team details + members. */
export async function getTeam(id: string): Promise<TeamDetail> {
  return apiFetch<TeamDetail>(`/teams/${id}`);
}

/** PATCH /teams/:id — Update team details. */
export async function updateTeam(id: string, input: Partial<CreateTeamInput>): Promise<{ team: Team }> {
  return apiFetch<{ team: Team }>(`/teams/${id}`, {
    method: "PATCH",
    body: input,
  });
}

/** DELETE /teams/:id — Delete a team. */
export async function deleteTeam(id: string): Promise<void> {
  return apiFetch<void>(`/teams/${id}`, {
    method: "DELETE",
  });
}

/** POST /teams/:id/members — Add/update a team member. */
export async function addTeamMember(
  teamId: string,
  input: { userId: string; role: "lead" | "member" },
): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>(`/teams/${teamId}/members`, {
    method: "POST",
    body: input,
  });
}

/** DELETE /teams/:id/members/:userId — Remove a member from a team. */
export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  return apiFetch<void>(`/teams/${teamId}/members/${userId}`, {
    method: "DELETE",
  });
}
