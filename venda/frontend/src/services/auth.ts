export interface AuthData {
  username: string;
  role: "admin" | "manager" | "cashier";
  is_first_login: boolean;
}

const AUTH_KEY = "store_im_auth";

export function getAuth(): AuthData | null {
  const json = localStorage.getItem(AUTH_KEY);
  return json ? JSON.parse(json) : null;
}

export function setAuth(auth: AuthData) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

export async function fetchWithAuthInterceptors(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (response.status === 403) {
    const body = await response.json().catch(() => null);
    if (body?.is_first_login) {
      throw new Error("PASSWORD_RESET_REQUIRED");
    }
  }

  return response;
}
