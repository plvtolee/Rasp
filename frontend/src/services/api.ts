async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const data = await res.json()
      if (data?.detail) detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
    } catch {
      /* ignore */
    }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export const api = {
  get: <T>(url: string) => fetch(url).then((r) => handle<T>(r)),
  post: <T>(url: string, body?: unknown) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  put: <T>(url: string, body: unknown) =>
    fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(
      (r) => handle<T>(r),
    ),
  patch: <T>(url: string, body: unknown) =>
    fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(
      (r) => handle<T>(r),
    ),
  del: <T>(url: string) => fetch(url, { method: 'DELETE' }).then((r) => handle<T>(r)),
  upload: <T>(url: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return fetch(url, { method: 'POST', body: fd }).then((r) => handle<T>(r))
  },
}
