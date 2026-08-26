const $ = (id) => document.getElementById(id);
const apiUrl = '/.netlify/functions/borrow';

let owner = null;
let guest = null;
let toolController = null;
let ownerSignalPoll = null;
let guestSignalPoll = null;
let pc = null;
let channel = null;
let pendingAgentRequests = new Map();
let activeGuestRequest = null;
let remoteCapabilities = {};
let localCapabilities = {};
let lastLeaseStage = null;

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const capabilityCatalog = {
  private_note: {
    label: 'Private Note',
    icon: '🔐',
    description: 'Secret text or a one-time message.',
    mime: 'text/plain'
  },
  text_json: {
    label: 'Text / JSON',
    icon: '🧩',
    description: 'Structured JSON or a larger text payload.',
    mime: 'text/plain'
  },
  small_file: {
    label: 'Small Text File',
    icon: '📄',
    description: 'A small TXT, JSON, CSV or Markdown file.',
    mime: 'text/plain'
  },
  page_context: {
    label: 'Page Context',
    icon: '🌐',
    description: 'Title, URL and visible text captured locally.',
    mime: 'application/json'
  }
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

function updateLease(stage) {
  const order = ['discovered', 'requested', 'approved', 'borrowed', 'revoked'];
  lastLeaseStage = stage;
  document.querySelectorAll('.lease-step').forEach((el) => {
    el.classList.remove('active', 'done', 'revoked');
    const current = order.indexOf(el.dataset.stage);
    const target = order.indexOf(stage);
    if (stage === 'revoked' && el.dataset.stage === 'revoked') {
      el.classList.add('revoked');
    } else if (current < target) {
      el.classList.add('done');
    } else if (current === target) {
      el.classList.add('active');
    }
  });
}

function capabilityManifest() {
  return Object.entries(localCapabilities).map(([id, cap]) => ({
    id,
    label: cap.label,
    description: cap.description,
    mime: cap.mime,
    size: cap.size || String(cap.value || '').length
  }));
}

function publishManifest() {
  const manifest = capabilityManifest();
  if (channel?.readyState === 'open') {
    sendPeer({ type: 'capability_manifest', capabilities: manifest });
  }
}

function renderRemoteWallet() {
  const wallet = $('remoteWallet');
  const items = Object.values(remoteCapabilities);
  $('walletCount').textContent = `${items.length} available`;
  $('ownerCapability').textContent = items.length ? `${items.length} ready ✓` : 'None discovered';

  if (!items.length) {
    wallet.innerHTML = '<div class="wallet-empty">Connect a capability holder and arm something on the other browser.</div>';
    return;
  }

  wallet.innerHTML = '';
  for (const cap of items) {
    const card = document.createElement('article');
    card.className = 'wallet-card ready';
    card.innerHTML = `
      <div class="wallet-meta"><span>${cap.icon || '⚡'} REMOTE</span><span>${cap.mime || ''}</span></div>
      <h4>${escapeHtml(cap.label)}</h4>
      <p>${escapeHtml(cap.description || '')}</p>
      <button class="secondary" data-borrow-id="${escapeHtml(cap.id)}">Request once</button>
    `;
    wallet.appendChild(card);
  }

  wallet.querySelectorAll('[data-borrow-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await requestCapability(btn.dataset.borrowId, 'Manual Capability Wallet test');
      } catch (error) {
        setResult($('ownerResult'), error.message, 'denied');
      }
    });
  });
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
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
      setResult($('guestStatus'), 'Direct P2P pipe active. Arm a capability to continue.');
      try {
        sendPeer({ type: 'hello', side: 'guest' });
        publishManifest();
      } catch {}
    }
  };

  channel.onclose = () => {
    if (side === 'owner') {
      $('ownerRemote').textContent = 'Disconnected';
      $('bridgeState').textContent = 'P2P PIPE CLOSED';
      remoteCapabilities = {};
      renderRemoteWallet();
    } else {
      setResult($('guestStatus'), 'P2P pipe closed. Armed capabilities are no longer reachable.', 'denied');
    }
  };

  channel.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    if (side === 'owner') {
      if (msg.type === 'capability_manifest') {
        remoteCapabilities = {};
        for (const cap of msg.capabilities || []) {
          const known = capabilityCatalog[cap.id] || {};
          remoteCapabilities[cap.id] = { ...known, ...cap };
        }
        renderRemoteWallet();
        if (Object.keys(remoteCapabilities).length) updateLease('discovered');
      }

      if (msg.type === 'capability_result') {
        const pending = pendingAgentRequests.get(msg.requestId);
        if (!pending) return;
        pendingAgentRequests.delete(msg.requestId);

        if (msg.status === 'approved') {
          updateLease('approved');
          setTimeout(() => updateLease('borrowed'), 250);
          const label = remoteCapabilities[msg.capabilityId]?.label || msg.capabilityId;
          setResult($('ownerResult'), `BORROWED ONCE · ${label}: ${msg.preview || 'Capability received'}`, 'approved');
          pending.resolve({
            status: 'approved',
            capability: msg.capabilityId,
            label,
            payload: msg.payload,
            mime: msg.mime
          });
        } else {
          setResult($('ownerResult'), 'ACCESS DENIED by the capability holder.', 'denied');
          pending.resolve({ status: 'denied', capability: msg.capabilityId });
        }
      }
    } else {
      if (msg.type === 'capability_request') {
        activeGuestRequest = msg;
        const cap = localCapabilities[msg.capabilityId];
        $('approvalCapability').textContent = cap?.label || msg.capabilityId || 'a capability';
        $('approvalReason').textContent = msg.reason
          ? `Reason: ${msg.reason}`
          : 'Nothing is returned until you choose.';
        $('approvalCard').classList.remove('hidden');
        setResult($('guestStatus'), `Request received for ${cap?.label || msg.capabilityId}. Waiting for your decision.`);
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

async function requestCapability(capabilityId, reason = '') {
  if (!owner) throw new Error('No active Blink Borrow session');
  if (!channel || channel.readyState !== 'open') throw new Error('The peer-to-peer pipe is not connected yet');
  if (!remoteCapabilities[capabilityId]) throw new Error('That capability is not currently available');

  const requestId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  updateLease('requested');
  setResult($('ownerResult'), `Request sent for ${remoteCapabilities[capabilityId].label}. Waiting for human approval…`);

  return await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      pendingAgentRequests.delete(requestId);
      setResult($('ownerResult'), 'Request expired without approval.', 'denied');
      resolve({ status: 'expired', capability: capabilityId });
    }, 90_000);

    pendingAgentRequests.set(requestId, {
      resolve: (value) => {
        clearTimeout(timeout);
        resolve(value);
      }
    });

    sendPeer({
      type: 'capability_request',
      requestId,
      capabilityId,
      reason: String(reason || '').slice(0, 240)
    });
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
      name: 'blink_borrow_list_capabilities',
      description: 'List the temporary capabilities currently offered by the connected Blink Borrow capability holder. Listing does not reveal any private payload.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const capabilities = Object.values(remoteCapabilities).map(({ id, label, description, mime, size }) => ({ id, label, description, mime, size }));
        return { connected: Boolean(channel && channel.readyState === 'open'), capabilities };
      },
      annotations: { readOnlyHint: true }
    }, { signal: toolController.signal });

    await document.modelContext.registerTool({
      name: 'blink_borrow_request_capability',
      description: 'Request one offered capability from the connected Blink Borrow browser. The remote human must explicitly approve once before any payload crosses the direct peer-to-peer pipe.',
      inputSchema: {
        type: 'object',
        required: ['capability_id'],
        properties: {
          capability_id: {
            type: 'string',
            enum: Object.keys(capabilityCatalog),
            description: 'The capability identifier returned by blink_borrow_list_capabilities.'
          },
          reason: {
            type: 'string',
            description: 'A short human-readable explanation of why this capability is needed.'
          }
        }
      },
      execute: async ({ capability_id, reason = '' }) => await requestCapability(capability_id, reason),
      annotations: { readOnlyHint: true, untrustedContentHint: true }
    }, { signal: toolController.signal });

    // Backward-compatible tool preserved from the known-good v0.1 demo.
    await document.modelContext.registerTool({
      name: 'blink_borrow_request_private_note',
      description: 'Request one-time access to the remote private note through Blink Borrow. The remote human must approve first.',
      inputSchema: {
        type: 'object',
        properties: { reason: { type: 'string' } }
      },
      execute: async ({ reason = '' }) => await requestCapability('private_note', reason),
      annotations: { readOnlyHint: true, untrustedContentHint: true }
    }, { signal: toolController.signal });

    await document.modelContext.registerTool({
      name: 'blink_borrow_session_status',
      description: 'Check whether the temporary Blink Borrow P2P pipe is connected and how many capabilities are currently discoverable.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => ({
        p2p_connected: Boolean(channel && channel.readyState === 'open'),
        capability_count: Object.keys(remoteCapabilities).length,
        lease_stage: lastLeaseStage
      }),
      annotations: { readOnlyHint: true }
    }, { signal: toolController.signal });

    $('ownerTool').textContent = '4 registered ✓';
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

function armCapability(id, value, extra = {}) {
  const meta = capabilityCatalog[id];
  if (!meta) return;
  if (value === undefined || value === null || value === '') throw new Error('Capability payload is empty');

  localCapabilities[id] = {
    id,
    label: meta.label,
    description: meta.description,
    mime: extra.mime || meta.mime,
    value,
    size: extra.size || String(value).length,
    filename: extra.filename || null
  };
  publishManifest();
}

function setArmedState(id, text) {
  const el = $(id);
  el.textContent = text;
  el.classList.add('armed');
}

function armPrivateNote() {
  try {
    const value = $('privateNote').value.trim();
    armCapability('private_note', value);
    setArmedState('privateNoteState', 'ARMED LOCALLY ✓');
    setResult($('guestStatus'), 'Private Note armed locally. Waiting for a request.', 'approved');
  } catch (error) {
    setResult($('guestStatus'), error.message, 'denied');
  }
}

function armTextJson() {
  try {
    const value = $('textJson').value.trim();
    const mime = (() => { try { JSON.parse(value); return 'application/json'; } catch { return 'text/plain'; } })();
    armCapability('text_json', value, { mime });
    setArmedState('textJsonState', 'ARMED LOCALLY ✓');
    setResult($('guestStatus'), 'Text / JSON armed locally. Waiting for a request.', 'approved');
  } catch (error) {
    setResult($('guestStatus'), error.message, 'denied');
  }
}

async function armFile() {
  const file = $('smallFile').files?.[0];
  if (!file) return setResult($('guestStatus'), 'Choose a file first.', 'denied');
  if (file.size > 256 * 1024) return setResult($('guestStatus'), 'File is larger than the 256 KB demo limit.', 'denied');
  try {
    const value = await file.text();
    armCapability('small_file', value, {
      mime: file.type || 'text/plain',
      size: file.size,
      filename: file.name
    });
    setArmedState('fileState', `ARMED · ${file.name}`);
    setResult($('guestStatus'), `${file.name} armed locally. Waiting for a request.`, 'approved');
  } catch (error) {
    setResult($('guestStatus'), error.message, 'denied');
  }
}

function armPageContext() {
  try {
    const visibleText = document.body.innerText.slice(0, 12000);
    const payload = JSON.stringify({
      title: document.title,
      url: location.href,
      visibleText,
      capturedAt: new Date().toISOString()
    });
    armCapability('page_context', payload, { mime: 'application/json' });
    setArmedState('pageState', 'CAPTURED & ARMED ✓');
    setResult($('guestStatus'), 'Page Context captured locally. Waiting for a request.', 'approved');
  } catch (error) {
    setResult($('guestStatus'), error.message, 'denied');
  }
}

function decide(decision) {
  if (!guest || !activeGuestRequest) return;
  const request = activeGuestRequest;
  const cap = localCapabilities[request.capabilityId];

  try {
    if (decision === 'approve') {
      if (!cap) throw new Error('That capability is no longer armed');
      const preview = cap.filename || String(cap.value).replace(/\s+/g, ' ').slice(0, 90);
      sendPeer({
        type: 'capability_result',
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: 'approved',
        payload: cap.value,
        mime: cap.mime,
        filename: cap.filename,
        preview
      });

      // One-time lease: consume the capability immediately after one approved delivery.
      delete localCapabilities[request.capabilityId];
      publishManifest();
      setResult($('guestStatus'), `Approved once. ${cap.label} crossed the direct P2P pipe and was revoked locally.`, 'approved');
      const stateIds = {
        private_note: 'privateNoteState',
        text_json: 'textJsonState',
        small_file: 'fileState',
        page_context: 'pageState'
      };
      const stateEl = $(stateIds[request.capabilityId]);
      if (stateEl) {
        stateEl.textContent = 'CONSUMED · RE-ARM TO OFFER AGAIN';
        stateEl.classList.remove('armed');
      }
    } else {
      sendPeer({
        type: 'capability_result',
        requestId: request.requestId,
        capabilityId: request.capabilityId,
        status: 'denied'
      });
      setResult($('guestStatus'), 'Denied. Nothing left this browser.', 'denied');
    }

    $('approvalCard').classList.add('hidden');
    activeGuestRequest = null;
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
  updateLease('revoked');
  closePeer();
  sessionStorage.removeItem('blinkBorrowOwner');
  owner = null;
  remoteCapabilities = {};
  renderRemoteWallet();
  setResult($('ownerResult'), 'SESSION REVOKED. WebMCP tools removed. P2P capability pipe destroyed.', 'denied');
  $('ownerTool').textContent = 'Revoked';
  $('ownerRemote').textContent = 'Disconnected';
  $('ownerCapability').textContent = 'Gone';
  setTimeout(() => location.reload(), 1800);
}

async function restore() {
  try {
    const inviteCode = new URLSearchParams(location.search).get('join');
    if (inviteCode) {
      loadInviteFromUrl();
      return;
    }

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
$('copyCodeBtn').addEventListener('click', copySessionCode);
$('shareInviteBtn').addEventListener('click', shareInvite);
$('armPrivateNoteBtn').addEventListener('click', armPrivateNote);
$('armTextJsonBtn').addEventListener('click', armTextJson);
$('armFileBtn').addEventListener('click', armFile);
$('armPageBtn').addEventListener('click', armPageContext);
$('approveBtn').addEventListener('click', () => decide('approve'));
$('denyBtn').addEventListener('click', () => decide('deny'));
$('endBtn').addEventListener('click', endSession);
$('joinCode').addEventListener('keydown', (event) => { if (event.key === 'Enter') joinSession(); });

updateWebMCPBadge();
loadInviteFromUrl();
restore();
