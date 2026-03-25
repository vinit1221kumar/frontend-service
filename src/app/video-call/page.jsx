import { redirect } from 'next/navigation';

export default async function VideoCall({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const params = new URLSearchParams();

  Object.entries(resolvedSearchParams || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item != null) params.append(key, String(item));
      });
      return;
    }
    if (value != null) {
      params.set(key, String(value));
    }
  });

  if (!params.has('mode')) {
    params.set('mode', 'video');
  }

  const query = params.toString();
  redirect(query ? `/call?${query}` : '/call');
}
