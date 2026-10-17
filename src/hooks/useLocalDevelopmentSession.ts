import { useEffect, useState } from "react";

export type LocalDevelopmentUser = {
  email: string;
  name: string;
  picture?: string | null;
  image?: string | null;
  localDevelopment?: boolean;
};

type LocalDevelopmentSession = {
  user: LocalDevelopmentUser | null;
  isPending: boolean;
};

export function useLocalDevelopmentSession(): LocalDevelopmentSession {
  const [user, setUser] = useState<LocalDevelopmentUser | null>(null);
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/local-development-session", {
          cache: "no-store",
          credentials: "include",
        });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { user?: LocalDevelopmentUser };
        if (active && data.user) {
          setUser(data.user);
        }
      } catch {
        // Production and remote development continue through normal authentication.
      } finally {
        if (active) {
          setIsPending(false);
        }
      }
    }

    void loadSession();
    return () => {
      active = false;
    };
  }, []);

  return { user, isPending };
}
