'use strict';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'deepwoken_go_shared_registry_v1';
const OWNER_KEY = 'deepwoken_go_owner_token_v1';
const SELF_COORDS_KEY = 'deepwoken_go_self_coordinates_v1';
const LEGACY_STORAGE_KEY = 'deepwoken_go_registry_v1';
const LEGACY_USER_ID_KEY = 'deepwoken_go_soul_id_v1';

const registrationForm = $('registrationForm');
const usernameInput = $('usernameInput');
const reviewInput = $('reviewInput');
const registerBtn = $('registerBtn');
const statusText = $('statusText');
const modeIndicators = $('modeIndicators');
const tableHead = $('tableHead');
const leaderboardBody = $('leaderboardBody');
const entryCount = $('entryCount');
const selfSightBtn = $('selfSightBtn');
const selfSightTooltip = $('selfSightTooltip');
const adminDiamondBtn = $('adminDiamondBtn');
const adminTooltip = $('adminTooltip');
const adminModal = $('adminModal');
const cancelModalBtn = $('cancelModalBtn');
const modalError = $('modalError');
const ascendOverlay = $('ascendOverlay');
const kineticTitle = $('kineticTitle');
const hostRoomBtn = $('hostRoomBtn');
const joinRoomBtn = $('joinRoomBtn');
const roomCodeInput = $('roomCodeInput');
const roomStatus = $('roomStatus');
const roomCodeLine = $('roomCodeLine');
const roomCodeText = $('roomCodeText');
const copyRoomBtn = $('copyRoomBtn');
const downloadBackupBtn = $('downloadBackupBtn');
const restoreBackupBtn = $('restoreBackupBtn');
const backupFileInput = $('backupFileInput');

let peer = null;
let guestConnection = null;
let role = 'disconnected';
let roomCode = '';
let entries = [];
let entriesCache = [];
let ownCoordinates = new Map();
let showSelfCoords = false;
const hostConnections = new Set();

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function ownerToken() {
  let token = localStorage.getItem(OWNER_KEY);
  if (!token) {
    token = newId();
    localStorage.setItem(OWNER_KEY, token);
  }
  return token;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function setConnectedControls(connected) {
  hostRoomBtn.disabled = connected;
  joinRoomBtn.disabled = connected;
  roomCodeInput.disabled = connected;
  registerBtn.disabled = !connected;
}

function setAdminBadge() {
  const isAdmin = role === 'host';
  adminDiamondBtn.classList.toggle('admin-unlocked', isAdmin);
  adminDiamondBtn.setAttribute('aria-label', isAdmin ? 'Room host admin details' : 'Room admin details');
  adminTooltip.textContent = isAdmin ? 'Host Admin Active' : 'Room Admin';
}

function setModalOpen(open) {
  adminModal.classList.toggle('open', open);
  adminModal.setAttribute('aria-hidden', String(!open));
  if (open) window.setTimeout(() => cancelModalBtn.focus(), 120);
  else adminDiamondBtn.focus();
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function publicEntry(entry) {
  return {
    id: entry.id,
    username: entry.username,
    review: entry.review,
    reviewStatus: entry.reviewStatus || 'VERIFIED',
    createdAt: entry.createdAt
  };
}

function publicSnapshot() {
  return entries.slice().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(publicEntry);
}

function getVisibleCoordinates() {
  if (role === 'host') {
    return new Map(entries
      .filter((entry) => Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude))
      .map((entry) => [entry.id, { latitude: entry.latitude, longitude: entry.longitude }]));
  }
  return ownCoordinates;
}

function renderBoard() {
  const isAdmin = role === 'host';
  const visibleCoordinates = getVisibleCoordinates();
  entriesCache = role === 'host' ? publicSnapshot() : entriesCache;
  modeIndicators.replaceChildren();
  if (showSelfCoords && !isAdmin) modeIndicators.insertAdjacentHTML('beforeend', '<span class="pill-tag pill-self">SELF-SIGHT ACTIVE</span>');
  if (isAdmin) modeIndicators.insertAdjacentHTML('beforeend', '<span class="pill-tag pill-admin">ROOM HOST · ADMIN</span>');

  const showCoordColumn = isAdmin || showSelfCoords;
  tableHead.innerHTML = '<th scope="col">Username</th><th scope="col">Review</th><th scope="col">Date</th><th scope="col">Review Status</th>'
    + (showCoordColumn ? '<th scope="col">Coordinates</th>' : '')
    + (isAdmin ? '<th scope="col">Admin</th>' : '');
  entryCount.textContent = `${entriesCache.length} ${entriesCache.length === 1 ? 'pathfinder' : 'pathfinders'}`;

  if (!entriesCache.length) {
    const colSpan = 4 + (showCoordColumn ? 1 : 0) + (isAdmin ? 1 : 0);
    leaderboardBody.innerHTML = `<tr><td class="empty-state" colspan="${colSpan}">No pathfinders registered in the ledger yet.</td></tr>`;
    return;
  }

  leaderboardBody.innerHTML = entriesCache.map((entry, index) => {
    const coordinates = visibleCoordinates.get(entry.id);
    const coordinateCell = showCoordColumn
      ? (coordinates
        ? `<td><span class="coord-chip">${escapeHtml(coordinates.latitude)}, ${escapeHtml(coordinates.longitude)}</span></td>`
        : '<td><span class="veiled">[VEILED]</span></td>')
      : '';
    const actionCell = isAdmin
      ? `<td><button class="delete-bubble" type="button" data-delete-entry="${escapeHtml(entry.id)}" aria-label="Purge ${escapeHtml(entry.username)}">Purge</button></td>`
      : '';
    return `<tr style="animation-delay:${Math.min(index, 12) * 35}ms">
      <td>${escapeHtml(entry.username)}</td>
      <td><span class="review-text">“${escapeHtml(entry.review)}”</span></td>
      <td>${escapeHtml(formatDate(entry.createdAt))}</td>
      <td><span class="status-badge">✦ ${escapeHtml(entry.reviewStatus || 'VERIFIED')}</span></td>
      ${coordinateCell}${actionCell}
    </tr>`;
  }).join('');
}

function saveHostEntries() {
  localStorage.setItem(STORE_KEY, JSON.stringify(entries));
}

function loadHostEntries() {
  try {
    const existing = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (Array.isArray(existing)) {
      entries = existing;
      return;
    }
  } catch { /* Recover from malformed local data by importing the older version below. */ }

  let legacyEntries = [];
  try {
    const saved = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) legacyEntries = saved;
  } catch { /* Ignore malformed old data. */ }

  const oldOwnerId = localStorage.getItem(LEGACY_USER_ID_KEY);
  const thisOwner = ownerToken();
  entries = legacyEntries
    .filter((entry) => entry && typeof entry.username === 'string' && entry.username.trim())
    .map((entry) => {
      const latitude = Number(entry.latitude);
      const longitude = Number(entry.longitude);
      const validCoordinates = entry.latitude !== null && entry.latitude !== undefined
        && entry.longitude !== null && entry.longitude !== undefined
        && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
        && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
      const isOldOwner = Boolean(oldOwnerId) && entry.soulId === oldOwnerId;
      return {
        id: typeof entry.id === 'string' && entry.id ? entry.id : newId(),
        username: entry.username.trim().slice(0, 40),
        review: String(entry.review || 'No vow inscribed.').slice(0, 240),
        reviewStatus: 'VERIFIED',
        createdAt: Number.isNaN(Date.parse(entry.date || '')) ? new Date().toISOString() : new Date(entry.date).toISOString(),
        ownerToken: isOldOwner ? thisOwner : newId(),
        latitude: validCoordinates ? latitude : null,
        longitude: validCoordinates ? longitude : null
      };
    });
  saveHostEntries();
}

function saveOwnCoordinates() {
  localStorage.setItem(SELF_COORDS_KEY, JSON.stringify([...ownCoordinates.entries()]));
}

function loadOwnCoordinates() {
  try {
    const saved = JSON.parse(localStorage.getItem(SELF_COORDS_KEY) || '[]');
    if (Array.isArray(saved)) ownCoordinates = new Map(saved);
  } catch { ownCoordinates = new Map(); }
}

function sendToConnection(connection, message) {
  if (connection && connection.open) connection.send(message);
}

function sendSnapshot(connection) {
  sendToConnection(connection, { type: 'snapshot', entries: publicSnapshot() });
}

function sendOwnCoordinates(connection, token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 128) return;
  const coordinates = entries
    .filter((entry) => entry.ownerToken === token && Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude))
    .map((entry) => ({ id: entry.id, latitude: entry.latitude, longitude: entry.longitude }));
  sendToConnection(connection, { type: 'selfCoordinates', coordinates });
}

function broadcastSnapshot() {
  for (const connection of hostConnections) sendSnapshot(connection);
}

function addGuestEntry(connection, submitted) {
  if (!submitted || typeof submitted !== 'object') return;
  const username = String(submitted.username || '').trim().slice(0, 40);
  const review = String(submitted.review || 'No vow inscribed.').trim().slice(0, 240);
  const latitude = Number(submitted.latitude);
  const longitude = Number(submitted.longitude);
  const token = submitted.ownerToken;
  if (!username || typeof token !== 'string' || token.length < 20 || token.length > 128
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || entries.length >= 5000) {
    sendToConnection(connection, { type: 'error', message: 'That entry could not be added.' });
    return;
  }

  const entry = {
    id: newId(),
    username,
    review,
    reviewStatus: 'VERIFIED',
    createdAt: new Date().toISOString(),
    ownerToken: token,
    latitude,
    longitude
  };
  entries.push(entry);
  saveHostEntries();
  broadcastSnapshot();
  sendOwnCoordinates(connection, token);
  renderBoard();
}

function handleHostConnection(connection) {
  hostConnections.add(connection);
  connection.on('data', (message) => {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'hello') {
      sendSnapshot(connection);
      sendOwnCoordinates(connection, message.ownerToken);
    } else if (message.type === 'requestSelfCoordinates') {
      sendOwnCoordinates(connection, message.ownerToken);
    } else if (message.type === 'createEntry') {
      addGuestEntry(connection, message.entry);
    }
  });
  connection.on('close', () => hostConnections.delete(connection));
  connection.on('error', () => hostConnections.delete(connection));
}

function startHost() {
  if (!window.Peer) {
    roomStatus.textContent = 'The room connection service did not load. Refresh the page and try again.';
    return;
  }
  role = 'starting-host';
  roomStatus.textContent = 'Starting your room...';
  setConnectedControls(false);
  hostRoomBtn.disabled = true;
  joinRoomBtn.disabled = true;
  roomCodeInput.disabled = true;

  peer = new window.Peer();
  peer.on('connection', handleHostConnection);
  peer.on('open', (id) => {
    role = 'host';
    roomCode = id;
    loadHostEntries();
    setConnectedControls(true);
    roomCodeLine.hidden = false;
    roomCodeText.textContent = id;
    roomCodeInput.value = id;
    copyRoomBtn.hidden = false;
    downloadBackupBtn.hidden = false;
    restoreBackupBtn.hidden = false;
    setAdminBadge();
    renderBoard();
    triggerAdminTypographyAnimation();
    roomStatus.textContent = 'Room is live. Keep this page open and send the code to your friend.';
    statusText.textContent = 'You are the room host and admin. New entries sync live.';
  });
  peer.on('error', (error) => {
    if (role === 'starting-host') {
      role = 'disconnected';
      setConnectedControls(false);
      hostRoomBtn.disabled = false;
      joinRoomBtn.disabled = false;
      roomCodeInput.disabled = false;
    }
    roomStatus.textContent = error.type === 'network'
      ? 'Could not reach the free room connection service. Check the internet and try again.'
      : `Room problem: ${error.type || 'connection failed'}. Try again.`;
  });
}

function handleGuestMessage(message) {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'snapshot' && Array.isArray(message.entries)) {
    entriesCache = message.entries;
    renderBoard();
  } else if (message.type === 'selfCoordinates' && Array.isArray(message.coordinates)) {
    ownCoordinates = new Map(message.coordinates.map((item) => [item.id, item]));
    saveOwnCoordinates();
    renderBoard();
  } else if (message.type === 'error') {
    statusText.textContent = message.message || 'The host could not add that entry.';
  }
}

function joinRoom() {
  const code = roomCodeInput.value.trim();
  if (!code) {
    roomStatus.textContent = 'Enter your friend’s room code first.';
    roomCodeInput.focus();
    return;
  }
  if (!window.Peer) {
    roomStatus.textContent = 'The room connection service did not load. Refresh the page and try again.';
    return;
  }
  role = 'joining';
  roomStatus.textContent = 'Connecting to your friend’s room...';
  hostRoomBtn.disabled = true;
  joinRoomBtn.disabled = true;
  roomCodeInput.disabled = true;
  peer = new window.Peer();
  peer.on('open', () => {
    guestConnection = peer.connect(code, { reliable: true });
    guestConnection.on('open', () => {
      role = 'guest';
      roomCode = code;
      setConnectedControls(true);
      roomCodeLine.hidden = true;
      copyRoomBtn.hidden = true;
      downloadBackupBtn.hidden = true;
      restoreBackupBtn.hidden = true;
      loadOwnCoordinates();
      setAdminBadge();
      guestConnection.send({ type: 'hello', ownerToken: ownerToken() });
      roomStatus.textContent = 'Connected. Your friend’s registry is syncing live.';
      statusText.textContent = 'Connected to the shared registry. Your coordinates stay private from other players.';
      renderBoard();
    });
    guestConnection.on('data', handleGuestMessage);
    guestConnection.on('error', () => {
      roomStatus.textContent = 'Could not join that room. Check the code and make sure your friend is hosting.';
      resetConnectionControls();
    });
    guestConnection.on('close', () => {
      if (role === 'guest') {
        roomStatus.textContent = 'The host disconnected. Your saved entries remain on the host’s device.';
        statusText.textContent = 'Room connection ended.';
        resetConnectionControls();
      }
    });
  });
  peer.on('error', (error) => {
    roomStatus.textContent = error.type === 'peer-unavailable'
      ? 'That room is offline. Ask your friend to open the page and host again.'
      : `Could not connect: ${error.type || 'network error'}. Check the code and try again.`;
    resetConnectionControls();
  });
}

function resetConnectionControls() {
  role = 'disconnected';
  guestConnection = null;
  setConnectedControls(false);
  setAdminBadge();
  roomCodeLine.hidden = true;
  copyRoomBtn.hidden = true;
  downloadBackupBtn.hidden = true;
  restoreBackupBtn.hidden = true;
  if (peer && !peer.destroyed) peer.destroy();
  peer = null;
  entriesCache = [];
  ownCoordinates.clear();
  renderBoard();
}

async function copyRoomCode() {
  if (!roomCode) return;
  try {
    await navigator.clipboard.writeText(roomCode);
    roomStatus.textContent = 'Room code copied. Send it to your friend.';
  } catch {
    roomCodeInput.focus();
    roomCodeInput.select();
    roomStatus.textContent = 'Room code selected. Copy it and send it to your friend.';
  }
}

function downloadBackup() {
  if (role !== 'host') return;
  const backup = { format: 1, exportedAt: new Date().toISOString(), entries };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'deepwoken-go-registry-backup.json';
  link.click();
  URL.revokeObjectURL(url);
  roomStatus.textContent = 'Backup downloaded. It includes private coordinates; keep the file private.';
}

async function restoreBackup(file) {
  if (role !== 'host' || !file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const imported = Array.isArray(parsed) ? parsed : parsed.entries;
    if (!Array.isArray(imported)) throw new Error('That backup file has no registry entries.');
    const merged = new Map(entries.map((entry) => [entry.id, entry]));
    for (const item of imported) {
      if (!item || typeof item.username !== 'string' || !item.username.trim()) continue;
      const latitude = Number(item.latitude);
      const longitude = Number(item.longitude);
      const validCoordinates = item.latitude !== null && item.latitude !== undefined
        && item.longitude !== null && item.longitude !== undefined
        && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
        && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
      const id = typeof item.id === 'string' && item.id ? item.id : newId();
      const rawDate = item.createdAt || item.date || '';
      merged.set(id, {
        id,
        username: item.username.trim().slice(0, 40),
        review: String(item.review || 'No vow inscribed.').slice(0, 240),
        reviewStatus: 'VERIFIED',
        createdAt: Number.isNaN(Date.parse(rawDate)) ? new Date().toISOString() : new Date(rawDate).toISOString(),
        ownerToken: typeof item.ownerToken === 'string' && item.ownerToken.length >= 20 ? item.ownerToken : newId(),
        latitude: validCoordinates ? latitude : null,
        longitude: validCoordinates ? longitude : null
      });
    }
    entries = [...merged.values()];
    saveHostEntries();
    renderBoard();
    broadcastSnapshot();
    roomStatus.textContent = 'Backup restored and shared with everyone in this room.';
  } catch (error) {
    roomStatus.textContent = error.message || 'Could not restore that backup file.';
  } finally {
    backupFileInput.value = '';
  }
}

function triggerAdminTypographyAnimation() {
  const phrase = "YOU'RE NOW AN ADMIN!";
  kineticTitle.replaceChildren();
  [...phrase].forEach((character, index) => {
    const span = document.createElement('span');
    span.className = 'kinetic-char';
    span.textContent = character === ' ' ? '\u00a0' : character;
    span.style.animationDelay = `${index * 0.045}s`;
    kineticTitle.appendChild(span);
  });
  ascendOverlay.classList.add('show');
  ascendOverlay.setAttribute('aria-hidden', 'false');
  window.setTimeout(() => {
    ascendOverlay.classList.remove('show');
    ascendOverlay.setAttribute('aria-hidden', 'true');
  }, 2800);
}

hostRoomBtn.addEventListener('click', startHost);
joinRoomBtn.addEventListener('click', joinRoom);
copyRoomBtn.addEventListener('click', copyRoomCode);
downloadBackupBtn.addEventListener('click', downloadBackup);
restoreBackupBtn.addEventListener('click', () => backupFileInput.click());
backupFileInput.addEventListener('change', () => restoreBackup(backupFileInput.files?.[0]));

selfSightBtn.addEventListener('click', () => {
  showSelfCoords = !showSelfCoords;
  selfSightBtn.classList.toggle('active-self', showSelfCoords);
  selfSightBtn.setAttribute('aria-pressed', String(showSelfCoords));
  selfSightTooltip.textContent = showSelfCoords ? 'Self-Sight: ON' : 'Self-Sight: OFF';
  if (role === 'guest' && showSelfCoords && guestConnection) {
    guestConnection.send({ type: 'requestSelfCoordinates', ownerToken: ownerToken() });
  }
  renderBoard();
});

adminDiamondBtn.addEventListener('click', () => {
  modalError.textContent = role === 'host'
    ? `You are hosting room ${roomCode}. The host can see all coordinates and remove entries.`
    : role === 'guest'
      ? 'The room host is the admin. You can see your own coordinates, but not anyone else’s.'
      : 'Host a registry to become its admin, or join your friend’s room as a player.';
  setModalOpen(true);
});

function closeAdminModal() {
  setModalOpen(false);
}

cancelModalBtn.addEventListener('click', closeAdminModal);
adminModal.addEventListener('click', (event) => {
  if (event.target === adminModal) closeAdminModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && adminModal.classList.contains('open')) closeAdminModal();
});

registrationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  const review = reviewInput.value.trim() || 'No vow inscribed.';
  if (!username) {
    statusText.textContent = 'Please enter a Pathfinder Username first.';
    usernameInput.focus();
    return;
  }
  if (!['host', 'guest'].includes(role)) {
    statusText.textContent = 'Host or join a room before registering.';
    return;
  }
  if (!navigator.geolocation) {
    statusText.textContent = 'Location is not supported in this browser.';
    return;
  }

  registerBtn.disabled = true;
  statusText.textContent = 'Getting your location...';
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, timeout: 10000, maximumAge: 0
      });
    });
    const latitude = Number(position.coords.latitude.toFixed(6));
    const longitude = Number(position.coords.longitude.toFixed(6));
    const token = ownerToken();
    const entry = {
      id: newId(),
      username: username.slice(0, 40),
      review: review.slice(0, 240),
      reviewStatus: 'VERIFIED',
      createdAt: new Date().toISOString(),
      ownerToken: token,
      latitude,
      longitude
    };

    if (role === 'host') {
      entries.push(entry);
      saveHostEntries();
      renderBoard();
      broadcastSnapshot();
    } else {
      if (!guestConnection || !guestConnection.open) throw new Error('Your room connection ended. Join again to register.');
      ownCoordinates.set(entry.id, { latitude, longitude });
      saveOwnCoordinates();
      guestConnection.send({ type: 'createEntry', entry });
      renderBoard();
    }
    usernameInput.value = '';
    reviewInput.value = '';
    statusText.textContent = 'Entry shared live. Only the host and you can see its coordinates.';
  } catch (error) {
    const locationMessages = {
      1: 'Location permission was denied. Allow location access and try again.',
      2: 'Your location could not be determined. Try again where GPS is available.',
      3: 'Location lookup timed out. Please try again.'
    };
    statusText.textContent = locationMessages[error.code] || error.message;
  } finally {
    registerBtn.disabled = !['host', 'guest'].includes(role);
  }
});

leaderboardBody.addEventListener('click', (event) => {
  const button = event.target.closest('[data-delete-entry]');
  if (!button || role !== 'host') return;
  entries = entries.filter((entry) => entry.id !== button.dataset.deleteEntry);
  saveHostEntries();
  renderBoard();
  broadcastSnapshot();
  statusText.textContent = 'Admin removed the record from the shared registry.';
});

window.addEventListener('beforeunload', () => {
  if (peer && !peer.destroyed) peer.destroy();
});

setConnectedControls(false);
setAdminBadge();
renderBoard();
