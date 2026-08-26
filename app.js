const $ = (id) => document.getElementById(id);
const apiUrl = '/.netlify/functions/borrow';

let owner = null;
let guest = null;
let toolController = null;
let ownerPoll = null;
let guestPoll = null;

async function api(payload) {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
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

async function requestRemoteNote() {
  if (!owner) throw new Error('No active Blink Borrow session');
  const started = await api({ action: 'request', code: owner.code, ownerKey: owner.ownerKey });
  setResult($('ownerResult'), 'Request sent. Waiting for the capability holder to approve…');

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const result = await api({
      action: 'result',
      code: owner.code,
      ownerKey: owner.ownerKey,
      requestId: started.requestId
    });
    if (result.status === 'approved') {
      setResult($('ownerResult'), `BORROWED ONCE: ${result.value}`, 'approved');
      return `The human approved one-time access. Remote private note: ${result.value}`;
    }
    if (result.status === 'denied') {
      setResult($('ownerResult'), 'ACCESS DENIED by the capability holder.', 'denied');
      return 'The human denied access to the remote private note.';
    }
  }
  setResult($('ownerResult'), 'Request expired without approval.', 'denied');
  return 'The temporary request expired before the human approved it.';
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
      description: 'Request one-time access to the private note held by the connected Blink Borrow browser. The remote human must explicitly approve before any note is returned.',
      inputSchema: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description: 'A short explanation of why the agent needs the remote private note.'
          }
        }
      },
      execute: async ({ reason = '' }) => {
        console.info('Blink Borrow WebMCP request reason:', reason);
        return await requestRemoteNote();
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true
      }
    }, { signal: toolController.signal });

    await document.modelContext.registerTool({
      name: 'blink_borrow_session_status',
      description: 'Check whether the temporary Blink Borrow session has a connected remote browser and an offered capability.',
      inputSchema: { type: 'object', properties: {} },
      execute: async () => {
        const state = await api({ action: 'state', code: owner.code, ownerKey: owner.ownerKey });
        return `Remote connected: ${state.guestJoined}. Capability ready: ${state.capabilityReady}.`;
      },
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
    startOwnerPolling();
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
    startGuestPolling();
  } catch (error) {
    alert(error.message);
  }
}

async function offerCapability() {
  const note = $('privateNote').value.trim();
  if (!note || !guest) return;
  try {
    await api({ action: 'offer', code: guest.code, guestKey: guest.guestKey, note });
    setResult($('guestStatus'), 'Capability armed. The note remains hidden until you approve a request.', 'approved');
  } catch (error) {
    setResult($('guestStatus'), error.message, 'denied');
  }
}

async function decide(decision) {
  if (!guest) return;
  const requestId = $('approvalCard').dataset.requestId;
  if (!requestId) return;
  try {
    await api({ action: 'decide', code: guest.code, guestKey: guest.guestKey, requestId, decision });
    $('approvalCard').classList.add('hidden');
    setResult(
      $('guestStatus'),
      decision === 'approve' ? 'Approved once. The AI received the borrowed capability.' : 'Denied. Nothing was revealed.',
      decision === 'approve' ? 'approved' : 'denied'
    );
  } catch (error) {
    setResult($('guestStatus'), error.message, 'denied');
  }
}

function startOwnerPolling() {
  clearInterval(ownerPoll);
  ownerPoll = setInterval(async () => {
    if (!owner) return;
    try {
      const state = await api({ action: 'state', code: owner.code, ownerKey: owner.ownerKey });
      $('ownerRemote').textContent = state.guestJoined ? 'Connected ✓' : 'Not connected';
      $('ownerCapability').textContent = state.capabilityReady ? 'Private note ready ✓' : 'Not offered';
      $('remoteNode').classList.toggle('active', state.guestJoined);
      $('bridgeState').textContent = state.guestJoined ? 'TEMPORARY BRIDGE ACTIVE' : 'WAITING FOR SECOND BROWSER';
    } catch (error) {
      clearInterval(ownerPoll);
      setResult($('ownerResult'), error.message, 'denied');
    }
  }, 1500);
}

function startGuestPolling() {
  clearInterval(guestPoll);
  guestPoll = setInterval(async () => {
    if (!guest) return;
    try {
      const state = await api({ action: 'state', code: guest.code, guestKey: guest.guestKey });
      if (state.request?.status === 'pending') {
        $('approvalCard').dataset.requestId = state.request.id;
        $('approvalCard').classList.remove('hidden');
      }
    } catch (error) {
      clearInterval(guestPoll);
      setResult($('guestStatus'), 'Session ended or expired. The borrowed capability is gone.', 'denied');
      $('approvalCard').classList.add('hidden');
    }
  }, 1200);
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
  clearInterval(ownerPoll);
  sessionStorage.removeItem('blinkBorrowOwner');
  owner = null;
  setResult($('ownerResult'), 'SESSION REVOKED. WebMCP tools removed. Remote capability forgotten.', 'denied');
  $('ownerTool').textContent = 'Revoked';
  $('ownerRemote').textContent = 'Disconnected';
  $('ownerCapability').textContent = 'Gone';
  setTimeout(() => location.reload(), 1800);
}

function restore() {
  try {
    const savedOwner = JSON.parse(sessionStorage.getItem('blinkBorrowOwner') || 'null');
    if (savedOwner?.code && savedOwner?.ownerKey) {
      owner = savedOwner;
      $('ownerCode').textContent = owner.code;
      show('ownerPanel');
      registerWebMCPTools();
      startOwnerPolling();
      return;
    }
    const savedGuest = JSON.parse(sessionStorage.getItem('blinkBorrowGuest') || 'null');
    if (savedGuest?.code && savedGuest?.guestKey) {
      guest = savedGuest;
      $('guestCode').textContent = guest.code;
      show('guestPanel');
      startGuestPolling();
    }
  } catch {
    sessionStorage.clear();
  }
}

$('createBtn').addEventListener('click', createSession);
$('joinBtn').addEventListener('click', joinSession);
$('offerBtn').addEventListener('click', offerCapability);
$('approveBtn').addEventListener('click', () => decide('approve'));
$('denyBtn').addEventListener('click', () => decide('deny'));
$('manualRequestBtn').addEventListener('click', async () => {
  try { await requestRemoteNote(); } catch (error) { setResult($('ownerResult'), error.message, 'denied'); }
});
$('endBtn').addEventListener('click', endSession);
$('joinCode').addEventListener('keydown', (event) => { if (event.key === 'Enter') joinSession(); });

updateWebMCPBadge();
restore();
