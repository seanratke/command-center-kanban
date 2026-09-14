import { next } from '@vercel/functions';

export const config = { matcher: '/((?!api/login|login.html|_next|favicon.ico).*)' };

function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  const match = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default async function middleware(request) {
  const cookieValue = getCookie(request, 'site_auth');
  const expected = await sha256(process.env.SITE_PASSWORD || '');
  if (cookieValue === expected) {
    return next();
  }
  const url = new URL('/login.html', request.url);
  return Response.redirect(url);
}
