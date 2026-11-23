const encoder = new TextEncoder();

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://xhublauncher.github.io')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
}

function response(request, env, body, status = 200) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  const origin = request.headers.get('Origin');
  if (!origin || allowedOrigins(env).includes(origin)) {
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    headers['Access-Control-Max-Age'] = '86400';
    headers.Vary = 'Origin';
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function b64urlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {
    name: 'HMAC', hash: 'SHA-256'
  }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

async function createAdminToken(secret) {
  const header = b64urlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64urlEncode(encoder.encode(JSON.stringify({
    role: 'admin', exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60
  })));
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${b64urlEncode(await sign(unsigned, secret))}`;
}

async function isAdmin(request, secret) {
  const authorization = request.headers.get('Authorization') || '';
  const parts = (authorization.startsWith('Bearer ') ? authorization.slice(7) : '').split('.');
  if (!secret || parts.length !== 3) return false;
  try {
    const unsigned = `${parts[0]}.${parts[1]}`;
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {
      name: 'HMAC', hash: 'SHA-256'
    }, false, ['verify']);
    const signatureIsValid = await crypto.subtle.verify(
      'HMAC', key, b64urlDecode(parts[2]), encoder.encode(unsigned)
    );
    if (!signatureIsValid) return false;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
    return payload.role === 'admin' && Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function sameSecret(candidate, configured) {
  const a = encoder.encode(candidate);
  const b = encoder.encode(configured);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    difference |= (a[i] || 0) ^ (b[i] || 0);
  }
  return difference === 0;
}

function publicRow(row) {
  return {
    id: row.id, username: row.username, review: row.review,
    reviewStatus: 'REGISTERED', createdAt: row.created_at
  };
}

function adminRow(row) {
  return {
    ...publicRow(row),
    latitude: row.latitude,
    longitude: row.longitude,
    locationSource: row.location_source === 'network' ? 'Approximate internet location' : 'Device location'
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (origin && !allowedOrigins(env).includes(origin)) {
      return response(new Request(request.url), {}, { error: 'Website origin is not allowed.' }, 403);
    }
    if (request.method === 'OPTIONS') return response(request, env, {}, 204);

    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/entries' && request.method === 'GET') {
        const result = await env.DB.prepare(
          'SELECT id, username, review, created_at FROM entries ORDER BY created_at DESC'
        ).all();
        return response(request, env, { entries: (result.results || []).map(publicRow) });
      }

      if (url.pathname === '/api/entries' && request.method === 'POST') {
        let submitted;
        try { submitted = await request.json(); }
        catch { return response(request, env, { error: 'Enter valid registration details.' }, 400); }
        const username = typeof submitted.username === 'string' ? submitted.username.trim() : '';
        const review = typeof submitted.review === 'string' ? submitted.review.trim() : '';
        if (!username || username.length > 40 || !review || review.length > 240) {
          return response(request, env, { error: 'Enter a username and review within the allowed length.' }, 400);
        }
        const locationSource = submitted.locationSource === 'network' ? 'network' : 'device';
        const networkLocation = request.cf || {};
        const rawLat = locationSource === 'network'
          ? Number(networkLocation.latitude)
          : Number(submitted.latitude);
        const rawLon = locationSource === 'network'
          ? Number(networkLocation.longitude)
          : Number(submitted.longitude);
        if (locationSource === 'network'
          && (networkLocation.latitude == null || networkLocation.longitude == null)) {
          return response(request, env, { error: 'An approximate internet location is unavailable. Retry device location instead.' }, 503);
        }
        if (!Number.isFinite(rawLat) || rawLat < -90 || rawLat > 90
          || !Number.isFinite(rawLon) || rawLon < -180 || rawLon > 180) {
          return response(request, env, { error: 'A valid location is required. Retry device location instead.' }, 400);
        }
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const coordinateDigits = locationSource === 'network' ? 2 : 6;
        const latitude = Math.round(rawLat * 10 ** coordinateDigits) / 10 ** coordinateDigits;
        const longitude = Math.round(rawLon * 10 ** coordinateDigits) / 10 ** coordinateDigits;
        await env.DB.prepare(
          'INSERT INTO entries (id, username, review, created_at, latitude, longitude, location_source) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, username, review, createdAt, latitude, longitude, locationSource).run();
        return response(request, env, {
          message: locationSource === 'network'
            ? 'Registered with an approximate internet location. Admins can see its source; coordinates remain private.'
            : 'Registered. Your coordinates are hidden from the public leaderboard.'
        }, 201);
      }

      if (url.pathname === '/api/admin/login' && request.method === 'POST') {
        if (!env.ADMIN_PASSWORD) return response(request, env, { error: 'Admin sign-in is not configured yet.' }, 503);
        let submitted;
        try { submitted = await request.json(); }
        catch { return response(request, env, { error: 'Enter your admin password.' }, 400); }
        const password = typeof submitted.password === 'string' ? submitted.password : '';
        if (!sameSecret(password, env.ADMIN_PASSWORD)) {
          return response(request, env, { error: 'That admin password is not correct.' }, 401);
        }
        return response(request, env, { token: await createAdminToken(env.ADMIN_PASSWORD) });
      }

      if (url.pathname === '/api/admin/entries' && request.method === 'GET') {
        if (!await isAdmin(request, env.ADMIN_PASSWORD)) {
          return response(request, env, { error: 'Admin access required. Sign in again.' }, 401);
        }
        const result = await env.DB.prepare(
          'SELECT id, username, review, created_at, latitude, longitude, location_source FROM entries ORDER BY created_at DESC'
        ).all();
        return response(request, env, { entries: (result.results || []).map(adminRow) });
      }

      const removeMatch = url.pathname.match(/^\/api\/admin\/entries\/([0-9a-f-]+)$/i);
      if (removeMatch && request.method === 'DELETE') {
        if (!await isAdmin(request, env.ADMIN_PASSWORD)) {
          return response(request, env, { error: 'Admin access required. Sign in again.' }, 401);
        }
        await env.DB.prepare('DELETE FROM entries WHERE id = ?').bind(removeMatch[1]).run();
        return response(request, env, { message: 'Registration removed.' });
      }

      return response(request, env, { error: 'That ledger action was not found.' }, 404);
    } catch (error) {
      console.error('Ledger request failed:', error);
      return response(request, env, { error: 'The ledger could not complete that request.' }, 500);
    }
  }
};
