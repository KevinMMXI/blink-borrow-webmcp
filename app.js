const $ = (id) => document.getElementById(id);
const apiUrl = '/.netlify/functions/borrow';

let owner = null;
let guest = null;
let toolController = null;
let ownerSignalPoll = null;
let guestSignalPoll = null;
let pc = null;
let channel = null;
let localNote = '';
let pendingAgentRequests = new Map();
let activeGuestRequestId = null;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

async function api(payload) {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

function show(panel) {
  ['homePanel', 'ownerPanel', 'guestPanel'].forEach((id) => $(id).classList.toggle('hidden', id !== panel));
}

function setResult(el, text, mode = '') {
  el.textContent = text;
  el.classList.remove('hidden', 'approved', 'denied');
  if (mode) el.classList.add(mode);
}

function webmcpAvailable() {
  return Boolean(document.modelContext?.registerTool);
}

function updateWebMCPBadge() {
  const badge = $('webmcpBadge');
  if (webmcpAvailable()) {
    badge.textContent = 'WebMCP available';
    badge.style.borderColor = '#31d8ff';
    badge.style.color = '#baf5ff';
  } else {
    badge.textContent = 'WebMCP unavailable in this browser';
  }
}

function inviteUrl(code) {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('join', code);
  return url.toString();
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
}

async function copySessionCode() {
  if (!owner?.code) return;
  const btn = $('copyCodeBtn');
  try {
    await copyText(owner.code);
    const old = btn.textContent;
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = old; }, 1400);
  } catch {
    alert(`Session code: ${owner.code}`);
  }
}

async function shareInvite() {
  if (!owner?.code) return;
  const url = inviteUrl(owner.code);
  const text = `Join my Blink Borrow session ${owner.code}. You will still choose Join and approve every capability request.`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Blink Borrow invite', text, url });
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return;
    }
  }

  try {
    await copyText(`${text}\n${url}`);
    const btn = $('shareInviteBtn');
    const old = btn.textContent;
    btn.textContent = 'Invite copied ✓';
    setTimeout(() => { btn.textContent = old; }, 1600);
  } catch {
    alert(`${text}\n${url}`);
  }
}

function loadInviteFromUrl() {
  const params = new URLSearchParams(location.search);
  const raw = params.get('join');
  if (!raw) return;
  const code = raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8);
  if (!code) return;
  $('joinCode').value = code;
  $('joinHint').classList.remove('hidden');
}

function waitForIceComplete(peer, timeoutMs = 8000) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      peer.removeEventListener('icegatheringstatechange', check);
      resolve();
    }, timeoutMs);
    function check() {
      if (peer.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        peer.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    }
    peer.addEventListener('icegatheringstatechange', check);
  });
}

function closePeer() {
  clearInterval(ownerSignalPoll);
  clearInterval(guestSignalPoll);
  ownerSignalPoll = null;
  guestSignalPoll = null;
  try { channel?.close(); } catch {}
  try { pc?.close(); } catch {}
  channel = null;
  pc = null;
}

function sendPeer(message) {
  if (!channel || channel.readyState !== 'open') throw new Error('Peer-to-peer pipe is not connected yet');
  channel.send(JSON.stringify(message));
}

function configureChannel(dc, side) {
  channel = dc;
  channel.onopen = () => {
    if (side === 'owner') {
      $('ownerRemote').textContent = 'Connected P2P ✓';
      $('remoteNode').classList.add('active');
      $('bridgeState').textContent = 'DIRECT P2P PIPE ACTIVE';
      try { sendPeer({ type: 'hello', side: 'owner' }); } catch {}
    } else {
      setResult($('guestStatus'), localNote ? 'Direct P2P pipe active. Capability armed locally.' : 'Direct P2P pipe active. Offer a capability to continue.', localNote ? 'approved' : '');
      try { sendPeer({ type: 'hello', side: 'guest', capabilityReady: Boolean(localNote) }); } catch {}
    }
  };
  channel.onclose = () => {
    if (side === 'owner') {
      $('ownerRemote').textContent = 'Disconnected';
      $('bridgeState').textContent = 'P2P PIPE CLOSED';
    } else {
      setResult($('guestStatus'), 'P2P pipe closed. The capability is no longer reachable.', 'denied');
    }
  };
  channel.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    if (side === 'owner') {
      if (msg.type === 'hello' || msg.type === 'capability_state') {
        $('ownerCapability').textContent = msg.capabilityReady ? 'Private note ready ✓' : 'Not offered';
      }
      if (msg.type === 'capability_result') {
        const pending = pendingAgentRequests.get(msg.requestId);
        if (!pending) return;
        pendingAgentRequests.delete(msg.requestId);
        if (msg.status === 'approved') {
          setResult($('ownerResult'), `BORROWED ONCE: ${msg.value}`, 'approved');
          pending.resolve(`The human approved one-time access. Remote private note: ${msg.value}`);
        } else {
          setResult($('ownerResult'), 'ACCESS DENIED by the capability holder.', 'denied');
          pending.resolve('The human denied access to the remote private note.');
        }
      }
    } else {
      if (msg.type === 'capability_request') {
        activeGuestRequestId = msg.requestId;
        $('approvalCard').dataset.requestId = msg.requestId;
        $('approvalCard').classList.remove('hidden');
        setResult($('guestStatus'), msg.reason ? `AI request reason: ${msg.reason}` : 'AI is requesting one-time access to your local note.');
      }
    }
  };
}

async function createOwnerPeer() {
  closePeer();
  pc = new RTCPeerConnection(rtcConfig);
  const dc = pc.createDataChannel('blink-borrow', { ordered: true });
  configureChannel(dc, 'owner');

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIceComplete(pc);

  await api({ action: 'publish_offer', code: owner.code, ownerKey: owner.ownerKey, offer: pc.localDescription });

  ownerSignalPoll = setInterval(async () => {
    if (!owner || !pc || pc.remoteDescription) return;
    try {
      const result = await api({ action: 'get_answer', code: owner.code, ownerKey: owner.ownerKey });
      if (result.ready && result.answer) {
        await pc.setRemoteDescription(result.answer);
        clearInterval(ownerSignalPoll);
      }
    } catch (error) {
      console.warn('Answer signaling retry:', error);
    }
  }, 1200);
}

async function createGuestPeer() {
  closePeer();
  pc = new RTCPeerConnection(rtcConfig);
  pc.ondatachannel = (event) => configureChannel(event.channel, 'guest');

  guestSignalPoll = setInterval(async () => {
    if (!guest || !pc || pc.remoteDescription) return;
    try {
      const result = await api({ action: 'get_offer', code: guest.code, guestKey: guest.guestKey });
      if (!result.ready || !result.offer) return;

      await pc.setRemoteDescription(result.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIceComplete(pc);
      await api({ action: 'publish_answer', code: guest.code, guestKey: guest.guestKey, answer: pc.localDescription });
      clearInterval(guestSignalPoll);
    } catch (error) {
      console.warn('Offer signaling retry:', error);
    }
  }, 1000);
}

async function requestRemoteNote(reason = '') {
  if (!owner) throw new Error('No active Blink Borrow session');
  if (!channel || channel.readyState !== 'open') throw new Error('The peer-to-peer pipe is not connected yet');

  const requestId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  setResult($('ownerResult'), 'Request sent directly to the capability holder. Waiting for approval…');

  return await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingAgentRequests.delete(requestId);
      setResult($('ownerResult'), 'Request expired without approval.', 'denied');
      resolve('The temporary request expired before the human approved it.');
    }, 90_000);

    pendingAgentRequests.set(requestId, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      }
    });

    sendPeer({ type: 'capability_request', requestId, reason: String(reason || '').slice(0, 240) });
  });
}

async function registerWebMCPTools() {
  if (!webmcpAvailable() || !owner) {
    $('ownerTool').textContent = webmcpAvailable() ? 'Waiting for session' : 'Browser unsupported';
    return;
  }

  toolController?.abort();
  toolController = new AbortController();

  try {
    await document.modelContext.registerTool({
      name: 'blink_borrow_request_private_note',
      description: 'Request one-time access to the private note held locally by the connected Blink Borrow browser. The remote human must explicitly approve before the note crosses the peer-to-peer pipe.',
      inputSchema: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'A short explanation of why the agent needs the remote private note.' }
        }
      },
      execute: async ({ reason = '' }) => await requestRemoteNote(reason),
      annotations: { readOnlyHint: true, untrustedContentHint: true }
    }, { signal: toolController.signal });

    await document.modelContext.registerTool({
      name: 'blink_borrow_session_status',
      description: 'Check whether the temporary Blink Borrow peer-to-peer capability pipe is connected.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => `P2P pipe connected: ${Boolean(channel && channel.readyState === 'open')}.`,
      annotations: { readOnlyHint: true }
    }, { signal: toolController.signal });

    $('ownerTool').textContent = 'Registered ✓';
  } catch (error) {
    console.error(error);
    $('ownerTool').textContent = 'Registration failed';
  }
}

async function createSession() {
  try {
    const data = await api({ action: 'create' });
    owner = { code: data.code, ownerKey: data.ownerKey };
    sessionStorage.setItem('blinkBorrowOwner', JSON.stringify(owner));
    $('ownerCode').textContent = owner.code;
    show('ownerPanel');
    await registerWebMCPTools();
    await createOwnerPeer();
  } catch (error) {
    alert(error.message);
  }
}

async function joinSession() {
  const code = $('joinCode').value.trim().toUpperCase();
  if (!code) return;
  try {
    const data = await api({ action: 'join', code });
    guest = { code, guestKey: data.guestKey };
    sessionStorage.setItem('blinkBorrowGuest', JSON.stringify(guest));
    $('guestCode').textContent = code;
    show('guestPanel');
    await createGuestPeer();
  } catch (error) {
    alert(error.message);
  }
}

function offerCapability() {
  const note = $('privateNote').value.trim();
  if (!note || !guest) return;
  localNote = note;
  setResult($('guestStatus'), 'Capability armed locally. The note stays on this browser until you approve a live request.', 'approved');
  try { sendPeer({ type: 'capability_state', capabilityReady: true }); } catch {}
}

function decide(decision) {
  if (!guest || !activeGuestRequestId) return;
  try {
    if (decision === 'approve') {
      if (!localNote) throw new Error('No local note is armed');
      sendPeer({ type: 'capability_result', requestId: activeGuestRequestId, status: 'approved', value: localNote });
      setResult($('guestStatus'), 'Approved once. The note crossed the direct P2P pipe.', 'approved');
    } else {
      sendPeer({ type: 'capability_result', requestId: activeGuestRequestId, status: 'denied' });
      setResult($('guestStatus'), 'Denied. Nothing left this browser.', 'denied');
    }
    $('approvalCard').classList.add('hidden');
    activeGuestRequestId = null;
  } catch (error) {
    setResult($('guestStatus'), error.message, 'denied');
  }
}

async function endSession() {
  if (!owner) return;
  try {
    await api({ action: 'end', code: owner.code, ownerKey: owner.ownerKey });
  } catch (error) {
    console.warn(error);
  }
  toolController?.abort();
  toolController = null;
  closePeer();
  sessionStorage.removeItem('blinkBorrowOwner');
  owner = null;
  setResult($('ownerResult'), 'SESSION REVOKED. WebMCP tools removed. P2P capability pipe destroyed.', 'denied');
  $('ownerTool').textContent = 'Revoked';
  $('ownerRemote').textContent = 'Disconnected';
  $('ownerCapability').textContent = 'Gone';
  setTimeout(() => location.reload(), 1800);
}

async function restore() {
  try {
    const savedOwner = JSON.parse(sessionStorage.getItem('blinkBorrowOwner') || 'null');
    if (savedOwner?.code && savedOwner?.ownerKey) {
      owner = savedOwner;
      $('ownerCode').textContent = owner.code;
      show('ownerPanel');
      await registerWebMCPTools();
      setResult($('ownerResult'), 'Session restored. Rebuilding the temporary P2P pipe…');
      await createOwnerPeer();
      return;
    }

    const savedGuest = JSON.parse(sessionStorage.getItem('blinkBorrowGuest') || 'null');
    if (savedGuest?.code && savedGuest?.guestKey) {
      guest = savedGuest;
      $('guestCode').textContent = guest.code;
      show('guestPanel');
      setResult($('guestStatus'), 'Session restored. Rebuilding the temporary P2P pipe…');
      await createGuestPeer();
    }
  } catch (error) {
    console.warn('Restore failed:', error);
    sessionStorage.clear();
    closePeer();
  }
}

$('createBtn').addEventListener('click', createSession);
$('joinBtn').addEventListener('click', joinSession);
$('offerBtn').addEventListener('click', offerCapability);
$('approveBtn').addEventListener('click', () => decide('approve'));
$('denyBtn').addEventListener('click', () => decide('deny'));
$('manualRequestBtn').addEventListener('click', async () => {
  try { await requestRemoteNote('Manual demo request'); } catch (error) { setResult($('ownerResult'), error.message, 'denied'); }
});
$('copyCodeBtn').addEventListener('click', copySessionCode);
$('shareInviteBtn').addEventListener('click', shareInvite);
$('endBtn').addEventListener('click', endSession);
$('joinCode').addEventListener('keydown', (event) => { if (event.key === 'Enter') joinSession(); });

updateWebMCPBadge();
loadInviteFromUrl();
restore();
