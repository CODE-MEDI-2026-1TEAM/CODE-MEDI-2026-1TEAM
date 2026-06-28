export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.PROD
    ? 'https://code-medi-2026-1team.onrender.com'
    : 'http://localhost:3000');

export async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}
