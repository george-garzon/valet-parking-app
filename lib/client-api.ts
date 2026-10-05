export async function api<T>(action: string, body?: unknown, token?: string): Promise<T> {
  const query = new URLSearchParams({ action });
  if (token !== undefined) query.set('token', token);
  const response = await fetch(`/api?${query}`, body === undefined ? { cache: 'no-store' } : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || 'Something went wrong');
  return data as T;
}
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
