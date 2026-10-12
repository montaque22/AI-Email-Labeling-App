/**
 * `interrupted` is synthesized by the client, never returned by the server. The task store is
 * in-memory, so a restart makes an in-flight task disappear from `GET /api/background-tasks`;
 * the drawer keeps the row and marks it interrupted rather than letting it silently vanish
 * while the user still believes the work is running.
 */
export type BackgroundTaskStatus = "running" | "success" | "warning" | "error" | "interrupted";

export type BackgroundTaskError = {
  message: string;
  description?: string;
};

export type BackgroundTask = {
  id: string;
  type: string;
  title: string;
  message: string;
  status: BackgroundTaskStatus;
  total: number;
  completed: number;
  failed: number;
  errors: BackgroundTaskError[];
  description?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Only the fields the drawer actually reads. Structural, so the app's richer `AuthUser`
 * satisfies it without this module depending on the auth types.
 */
export type BackgroundTaskUser = {
  email: string;
};
