import type { Env } from '../env';

const COOKIE = 'mynder_session';
const STATE_COOKIE = 'mynder_oauth_state';
const SESSION_DAYS = 30;

function cookieValue(request: Request, name: string): string | null {
  const value = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null;
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

async function createSession(env: Env, provider: string, providerUserId: string, profile: { email?: string; name?: string; avatar_url?: string }): Promise<string> {
  const now = Date.now();
  const userId = `${provider}:${providerUserId}`;
  await env.DB.prepare(`INSERT INTO users (id, provider, provider_user_id, email, name, avatar_url, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, provider_user_id) DO UPDATE SET email = excluded.email, name = excluded.name, avatar_url = excluded.avatar_url, updated_at = excluded.updated_at`)
    .bind(userId, provider, providerUserId, profile.email ?? null, profile.name ?? null, profile.avatar_url ?? null, now, now).run();
  const sessionId = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO sessions (id, owner_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(sessionId, userId, now + SESSION_DAYS * 86400000, now).run();
  return sessionId;
}

export async function ownerFromSession(request: Request, env: Env): Promise<string | null> {
  const id = cookieValue(request, COOKIE);
  if (!id) return null;
  const row = await env.DB.prepare('SELECT owner_id, expires_at FROM sessions WHERE id = ?').bind(id).first<{ owner_id: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return null;
  return row.owner_id;
}

export async function login(request: Request, env: Env): Promise<Response> {
  if (!env.GITHUB_CLIENT_ID || !env.APP_ORIGIN) return new Response('OAuth is not configured', { status: 503 });
  const state = crypto.randomUUID();
  const callbackUrl = `${new URL(request.url).origin}/auth/callback`;
  const headers = new Headers({ Location: `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(env.GITHUB_CLIENT_ID)}&redirect_uri=${encodeURIComponent(callbackUrl)}&scope=read:user%20user:email&state=${encodeURIComponent(state)}` });
  headers.append('Set-Cookie', cookie(STATE_COOKIE, state, 600));
  return new Response(null, { status: 302, headers });
}

export async function callback(request: Request, env: Env): Promise<Response> {
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !env.APP_ORIGIN) return new Response('OAuth is not configured', { status: 503 });
  const url = new URL(request.url);
  const expected = cookieValue(request, STATE_COOKIE);
  if (!expected || expected !== url.searchParams.get('state')) return new Response('Invalid OAuth state', { status: 400 });
  const code = url.searchParams.get('code');
  if (!code) return new Response('Missing OAuth code', { status: 400 });
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'mynder-auth' }, body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code }) });
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) return new Response('GitHub authorization failed', { status: 502 });
  const profileResponse = await fetch('https://api.github.com/user', { headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token.access_token}`, 'user-agent': 'mynder-auth' } });
  const profile = await profileResponse.json() as { id?: number; login?: string; name?: string; avatar_url?: string; email?: string };
  if (!profile.id) return new Response('GitHub profile unavailable', { status: 502 });
  const sessionId = await createSession(env, 'github', String(profile.id), { email: profile.email, name: profile.name ?? profile.login, avatar_url: profile.avatar_url });
  const headers = new Headers({ Location: env.APP_ORIGIN });
  headers.append('Set-Cookie', cookie(COOKIE, sessionId, SESSION_DAYS * 86400));
  headers.append('Set-Cookie', cookie(STATE_COOKIE, '', 0));
  return new Response(null, { status: 302, headers });
}

export async function googleLogin(request: Request, env: Env): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.APP_ORIGIN) return new Response('Google OAuth is not configured', { status: 503 });
  const state = crypto.randomUUID();
  const callbackUrl = `${new URL(request.url).origin}/auth/google/callback`;
  const location = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=${encodeURIComponent('openid email profile')}&state=${encodeURIComponent(state)}&access_type=offline&prompt=consent`;
  const headers = new Headers({ Location: location });
  headers.append('Set-Cookie', cookie(STATE_COOKIE, `google:${state}`, 600));
  return new Response(null, { status: 302, headers });
}

export async function googleCallback(request: Request, env: Env): Promise<Response> {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.APP_ORIGIN) return new Response('Google OAuth is not configured', { status: 503 });
  const url = new URL(request.url);
  const expected = cookieValue(request, STATE_COOKIE);
  if (!expected?.startsWith('google:') || expected.slice(7) !== url.searchParams.get('state')) return new Response('Invalid OAuth state', { status: 400 });
  const code = url.searchParams.get('code');
  if (!code) return new Response('Missing OAuth code', { status: 400 });
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${new URL(request.url).origin}/auth/google/callback`, grant_type: 'authorization_code' }) });
  const token = await tokenResponse.json() as { access_token?: string };
  if (!token.access_token) return new Response('Google authorization failed', { status: 502 });
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${token.access_token}` } });
  const profile = await profileResponse.json() as { sub?: string; email?: string; name?: string; picture?: string };
  if (!profile.sub) return new Response('Google profile unavailable', { status: 502 });
  const sessionId = await createSession(env, 'google', profile.sub, { email: profile.email, name: profile.name, avatar_url: profile.picture });
  const headers = new Headers({ Location: env.APP_ORIGIN });
  headers.append('Set-Cookie', cookie(COOKIE, sessionId, SESSION_DAYS * 86400));
  headers.append('Set-Cookie', cookie(STATE_COOKIE, '', 0));
  return new Response(null, { status: 302, headers });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const id = cookieValue(request, COOKIE);
  if (id) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
  const headers = new Headers({ Location: env.APP_ORIGIN ?? '/' });
  headers.append('Set-Cookie', cookie(COOKIE, '', 0));
  return new Response(null, { status: 302, headers });
}

export { COOKIE };
