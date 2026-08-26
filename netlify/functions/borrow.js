import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const TTL_MS = 30 * 60 * 1000;
const MAX_SDP_BYTES = 64 * 1024;

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }
});

const token = (bytes = 18) => crypto.randomBytes(bytes).toString('base64url');
const code = () => crypto.randomBytes(5).toString('hex').slice(0, 8).toUpperCase();
const cleanCode = (value = '') => String(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);

function validDescription(value, type) {
  if (!value || value.type !== type || typeof value.sdp !== 'string') return false;
  return Buffer.byteLength(value.sdp, 'utf8') <= MAX_SDP_BYTES;
}

async function loadSession(store, sessionCode) {
  const key = `session/${sessionCode}`;
  const data = await store.get(key, { type: 'json', consistency: 'strong' });
  if (!data) return { key, data: null };

  if (Date.now() - data.createdAt > TTL_MS) {
    await store.delete(key);
    return { key, data: null };
  }

  return { key, data };
}

async function handle(req) {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const store = getStore('blink-borrow-sessions');

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const action = body?.action;

  if (action === 'health') {
    return json({ ok: true, service: 'blink-borrow-signaling', timestamp: Date.now() });
  }

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
      offer: null,
      answer: null,
      signalGeneration: 0
    };

    await store.setJSON(key, session);
    return json({ ok: true, code: sessionCode, ownerKey, expiresInSeconds: TTL_MS / 1000 });
  }

  const sessionCode = cleanCode(body?.code);
  if (!sessionCode) return json({ error: 'Missing code' }, 400);

  const loaded = await loadSession(store, sessionCode);
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
      offerReady: Boolean(session.offer),
      answerReady: Boolean(session.answer),
      signalGeneration: session.signalGeneration
    });
  }

  if (action === 'publish_offer') {
    if (!isOwner) return json({ error: 'Unauthorized' }, 401);
    if (!validDescription(body?.offer, 'offer')) return json({ error: 'Invalid WebRTC offer' }, 400);

    session.signalGeneration += 1;
    session.offer = body.offer;
    session.answer = null;
    session.signalUpdatedAt = Date.now();
    await store.setJSON(loaded.key, session);
    return json({ ok: true, signalGeneration: session.signalGeneration });
  }

  if (action === 'get_offer') {
    if (!isGuest) return json({ error: 'Unauthorized' }, 401);
    return json({
      ok: true,
      ready: Boolean(session.offer),
      offer: session.offer,
      signalGeneration: session.signalGeneration
    });
  }

  if (action === 'publish_answer') {
    if (!isGuest) return json({ error: 'Unauthorized' }, 401);
    if (!validDescription(body?.answer, 'answer')) return json({ error: 'Invalid WebRTC answer' }, 400);

    session.answer = body.answer;
    session.signalUpdatedAt = Date.now();
    await store.setJSON(loaded.key, session);
    return json({ ok: true, signalGeneration: session.signalGeneration });
  }

  if (action === 'get_answer') {
    if (!isOwner) return json({ error: 'Unauthorized' }, 401);
    return json({
      ok: true,
      ready: Boolean(session.answer),
      answer: session.answer,
      signalGeneration: session.signalGeneration
    });
  }

  if (action === 'end') {
    if (!isOwner) return json({ error: 'Unauthorized' }, 401);
    await store.delete(loaded.key);
    return json({ ok: true, ended: true });
  }

  return json({ error: 'Unknown action' }, 400);
}

export default async (req) => {
  try {
    return await handle(req);
  } catch (error) {
    console.error('Blink Borrow signaling error:', error);
    return json({ error: 'Temporary signaling error', code: 'BORROW_SIGNAL_ERROR' }, 500);
  }
};
