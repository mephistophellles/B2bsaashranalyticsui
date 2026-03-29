const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

export type UserRole = "employee" | "manager" | "admin";

export type UserMe = {
  id: number;
  username: string;
  role: UserRole;
  employee_id: number | null;
};

function authHeaders(token: string | null): HeadersInit {
  const h: Record<string, string> = {};
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function apiFetch(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<Response> {
  const { token, ...rest } = options;
  const headers = new Headers(rest.headers);
  const t = token ?? localStorage.getItem("token");
  if (t) headers.set("Authorization", `Bearer ${t}`);
  if (
    rest.body &&
    !(rest.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${base}${path}`, { ...rest, headers });
  if (res.status === 401) {
    localStorage.removeItem("token");
    window.dispatchEvent(new Event("auth:logout"));
  }
  // 403 — нет прав; не сбрасываем сессию (иначе «страница не открывается»).
  return res;
}

export async function loginRequest(username: string, password: string) {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error("Неверный логин или пароль");
  return res.json() as Promise<{ access_token: string; token_type: string }>;
}

export async function fetchMe(token: string) {
  const res = await apiFetch("/auth/me", { token });
  if (!res.ok) throw new Error("me failed");
  return res.json() as Promise<UserMe>;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Скачивание файла с авторизацией (blob). */
export async function downloadWithAuth(path: string, filename: string) {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error("Не удалось скачать файл");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: string | unknown };
    if (typeof j.detail === "string") return j.detail;
    if (Array.isArray(j.detail)) return JSON.stringify(j.detail);
  } catch {
    /* ignore */
  }
  return res.statusText || `Ошибка ${res.status}`;
}
