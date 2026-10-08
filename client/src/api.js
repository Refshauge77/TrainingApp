export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Noget gik galt – prøv igen');
  return data;
}

api.get = (path) => api('GET', path);
api.post = (path, body = {}) => api('POST', path, body);
api.put = (path, body) => api('PUT', path, body);
api.patch = (path, body) => api('PATCH', path, body);
api.delete = (path) => api('DELETE', path);
