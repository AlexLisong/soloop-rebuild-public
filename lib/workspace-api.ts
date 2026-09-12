export type Project = {
  id: string;
  name: string;
  brief: string;
  url: string;
  version: number;
  updated_at: number;
};
export type Message = {
  sequence: number;
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: number;
};
export type Action = {
  id: string;
  title: string;
  kind: string;
  instructions: string;
  rationale: string;
  status: string;
};
export type Artifact = {
  id: string;
  title: string;
  content: string;
  version: number;
  updated_at: number;
};
export type Run = {
  id: string;
  kind: string;
  action_id: string | null;
  status: string;
  error: string | null;
  created_at: number;
};
export type Detail = {
  project: Project;
  messages: Message[];
  actions: Action[];
  artifacts: Omit<Artifact, "content">[];
  runs: Run[];
};
export type Session = {
  user: { id: string; username: string };
  csrf: string;
  aiReady: boolean;
  model: string;
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
  csrf?: string,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    ...(method !== "GET"
      ? {
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrf || "",
          },
          body: JSON.stringify(data ?? {}),
        }
      : {}),
  });
  const payload = (await response.json().catch(() => ({
    error: "The workspace is temporarily unavailable. Please try again.",
  }))) as T & { error?: string };
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/password")
      window.location.assign("/login");
    throw new ApiError(
      payload.error || "Something went wrong.",
      response.status,
    );
  }
  return payload;
}
