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
    let message = text;
    try {
      const payload = JSON.parse(text) as { message?: string | string[] };
      message = Array.isArray(payload.message)
        ? payload.message.join('\n')
        : payload.message ?? `요청 처리에 실패했습니다 (${response.status}).`;
    } catch { /* Non-JSON server errors retain their message. */ }
    throw new Error(message || `요청 처리에 실패했습니다 (${response.status}).`);
  }

  return response.json() as Promise<T>;
}
