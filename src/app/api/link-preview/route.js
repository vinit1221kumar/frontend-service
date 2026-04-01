export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  if (!url) return Response.json({ error: 'url required' }, { status: 400 });

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return Response.json({ error: 'invalid url' }, { status: 400 });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return Response.json({ error: 'invalid url' }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; D-Lite/1.0)' },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow'
    });
    const html = await res.text();

    const getOg = (prop) => {
      const pattern = new RegExp(
        `<meta[^>]+(?:property=["']og:${prop}["'][^>]+content=["']([^"']+)["']|content=["']([^"']+)["'][^>]+property=["']og:${prop}["'])`,
        'i'
      );
      const m = html.match(pattern);
      return m ? (m[1] || m[2] || '').trim() : '';
    };

    const title = getOg('title') || (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '').trim();
    const description = getOg('description');
    const image = getOg('image');
    const siteName = getOg('site_name') || parsed.hostname;

    return Response.json({ title, description, image, siteName, url }, {
      headers: { 'Cache-Control': 'public, max-age=3600' }
    });
  } catch {
    return Response.json({ error: 'fetch failed' }, { status: 500 });
  }
}
