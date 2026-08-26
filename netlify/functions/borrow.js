import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const store = getStore({ name: 'blink-borrow-sessions', consistency: 'strong' });
const TTL_MS = 30 * 60 * 1000;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const token = (bytes = 18) => crypto.randomBytes(bytes).toString('base64url');
const code = () => crypto.randomBytes(5).toString('hex').slice(0, 8).toUpperCase();
const cleanCode = (value = '') => String(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);

async function loadSession(sessionCode) {
  const key = `session/${sessionCode}`;
  const data = await store.get(key, { type: 'json', consistency: 'strong' });
  if (!data) return { key, data: null };
  if (Date.now() - data.createdAt > TTL_MS) {
    await store.delete(key);
    return { key, data: null };
  }
  return { key, data };
}

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const action = body?.action;

  if (action === 'create') {
    let sessionCode;
    let key;
    for (let i = 0; i < 5; i += 1) {
      sessionCode = code();
      key = `session/${sessionCode}`;
      const existing = await store.get(key, { type: 'json', consistency: 'strong' });
      if (!existing) break;
    }
    const ownerKey = token();
    const session = {
      createdAt: Date.now(),
      ownerKey,
      guestKey: null,
      guestJoined: false,
      capability: { type: 'private_note', ready: false, note: '' },
      request: null
    };
    await store.setJSON(key, session);
    return json({ ok: true, code: sessionCode, ownerKey, expiresInSeconds: TTL_MS / 1000 });
  }

  const sessionCode = cleanCode(body?.code);
  if (!sessionCode) return json({ error: 'Missing code' }, 400);
  const loaded = await loadSession(sessionCode);
  if (!loaded.data) return json({ error: 'Session not found or expired' }, 404);
  const session = loaded.data;

  if (action === 'join') {
    if (session.guestJoined) return json({ error: 'A guest has already joined this session' }, 409);
    const guestKey = token();
    session.guestKey = guestKey;
    session.guestJoined = true;
    await store.setJSON(loaded.key, session);
    return json({ ok: true, guestKey });
  }

  const isOwner = body?.ownerKey && body.ownerKey === session.ownerKey;
  const isGuest = body?.guestKey && body.guestKey === session.guestKey;

  if (action === 'state') {
    if (!isOwner && !isGuest) return json({ error: 'Unauthorized' }, 401);
    return json({
      ok: true,
      guestJoined: session.guestJoined,
      capabilityReady: session.capability.ready,
      request: session.request ? {
        id: session.request.id,
        status: session.request.status,
        createdAt: session.request.createdAt
      } : null
    });
  }

  if (action === 'offer') {
    if (!isGuest) return json({ error: 'Unauthorized' }, 401);
    const note = String(body?.note ?? '').trim().slice(0, 1200);
    if (!note) return json({ error: 'Note is empty' }, 400);
    session.capability = { type: 'private_note', ready: true, note };
    await store.setJSON(loaded.key, session);
    return json({ ok: true });
  }

  if (action === 'request') {
    if (!isOwner) return json({ error: 'Unauthorized' }, 401);
    if (!session.guestJoined) return json({ error: 'No remote browser connected' }, 409);
    if (!session.capability.ready) return json({ error: 'Remote capability is not ready' }, 409);
    const requestId = token(10);
    session.request = { id: requestId, status: 'pending', createdAt: Date.now() };
    await store.setJSON(loaded.key, session);
    return json({ ok: true, requestId });
  }

  if (action === 'decide') {
    if (!isGuest) return json({ error: 'Unauthorized' }, 401);
    if (!session.request || session.request.id !== body?.requestId) return json({ error: 'Request not found' }, 404);
    if (session.request.status !== 'pending') return json({ error: 'Request already decided' }, 409);
    const decision = body?.decision === 'approve' ? 'approved' : 'denied';
    session.request.status = decision;
    session.request.decidedAt = Date.now();
    await store.setJSON(loaded.key, session);
    return json({ ok: true, status: decision });
  }

  if (action === 'result') {
    if (!isOwner) return json({ error: 'Unauthorized' }, 401);
    if (!session.request || session.request.id !== body?.requestId) return json({ error: 'Request not found' }, 404);
    if (session.request.status === 'pending') return json({ ok: true, status: 'pending' });
    if (session.request.status === 'denied') return json({ ok: true, status: 'denied' });
    return json({ ok: true, status: 'approved', value: session.capability.note });
  }

  if (action === 'end') {
    if (!isOwner) return json({ error: 'Unauthorized' }, 401);
    await store.delete(loaded.key);
    return json({ ok: true, ended: true });
  }

  return json({ error: 'Unknown action' }, 400);
};
