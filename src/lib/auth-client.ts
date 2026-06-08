import { createAuthClient } from "better-auth/react";
import { getAbsoluteRuntimeUrl } from "./runtime-base";

export const authClient = createAuthClient({
  baseURL: getAbsoluteRuntimeUrl("/api/auth"),
});
