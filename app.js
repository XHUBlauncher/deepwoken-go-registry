'use strict';

const $ = (id) => document.getElementById(id);
const API_BASE = String(window.REGISTRY_API_URL || '').trim().replace(/\/$/, '');
const ADMIN_TOKEN_KEY = 'deepwoken_go_admin_session_v1';

const registrationForm = $('registrationForm');
const usernameInput = $('usernameInput');
const reviewInput = $('reviewInput');
const registerBtn = $('registerBtn');
const statusText = $('statusText');
const modeIndicators = $('modeIndicators');
const tableHead = $('tableHead');
const leaderboardBody = $('leaderboardBody');
const entryCount = $('entryCount');
const adminDiamondBtn = $('adminDiamondBtn');
const adminTooltip = $('adminTooltip');
const adminModal = $('adminModal');
const cancelModalBtn = $('cancelModalBtn');
const modalError = $('modalError');
const adminSignInForm = $('adminSignInForm');
const adminPasswordInput = $('adminPasswordInput');
const adminSignInBtn = $('adminSignInBtn');
const adminState = $('adminState');
const adminLogoutBtn = $('adminLogoutBtn');
const roomStatus = $('roomStatus');
const locationFallback = $('locationFallback');
const retryLocationBtn = $('retryLocationBtn');
const networkLocationBtn = $('networkLocationBtn');
const quickRegisterBtn = $('quickRegisterBtn');
const quickLedgerBtn = $('quickLedgerBtn');
const registrationCard = $('registrationCard');
const ledgerCard = $('ledgerCard');

let adminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
let isAdmin = false;
let entries = [];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
}

function setModalOpen(open) {
  adminModal.classList.toggle('open', open);
  adminModal.setAttribute('aria-hidden', String(!open));
  if (open) window.setTimeout(() => (isAdmin ? adminLogoutBtn : adminPasswordInput).focus(), 120);
  else adminDiamondBtn.focus();
}

function updateAdminControls() {
  adminDiamondBtn.classList.toggle('admin-unlocked', isAdmin);
  adminDiamondBtn.setAttribute('aria-label', isAdmin ? 'Admin access active' : 'Open admin sign-in');
  adminTooltip.textContent = isAdmin ? 'Admin Access Active' : 'Admin Sign-in';
  adminSignInForm.hidden = isAdmin;
  adminState.hidden = !isAdmin;
  adminLogoutBtn.hidden = !isAdmin;
  modeIndicators.replaceChildren();
  if (isAdmin) modeIndicators.innerHTML = '<span class="pill-tag pill-admin">ADMIN · COORDINATES VISIBLE</span>';
}

function renderBoard() {
  const columns = isAdmin ? 6 : 4;
  tableHead.innerHTML = '<th scope="col">Username</th><th scope="col">Review</th><th scope="col">Date</th><th scope="col">Review Status</th>'
    + (isAdmin ? '<th scope="col">Coordinates</th><th scope="col">Admin</th>' : '');
  entryCount.textContent = `${entries.length} ${entries.length === 1 ? 'pathfinder' : 'pathfinders'}`;

  if (!entries.length) {
    leaderboardBody.innerHTML = `<tr><td class="empty-state" colspan="${columns}">No pathfinders registered in the ledger yet.</td></tr>`;
    return;
  }

  leaderboardBody.innerHTML = entries.map((entry, index) => {
    const coordinateCell = isAdmin
      ? `<td data-label="Coordinates"><span class="coord-chip">${escapeHtml(entry.latitude)}, ${escapeHtml(entry.longitude)}</span><small class="coord-source">${escapeHtml(entry.locationSource || 'Device location')}</small></td>`
      : '';
    const actionCell = isAdmin
      ? `<td data-label="Admin"><button class="delete-bubble" type="button" data-delete-entry="${escapeHtml(entry.id)}" aria-label="Remove ${escapeHtml(entry.username)}">Remove</button></td>`
      : '';
    const isCrimsonKaido = String(entry.username || '').trim().toLowerCase() === 'crimson kaido';
    const vipName = isCrimsonKaido
      ? `<span class="crow-crest" role="img" aria-label="Shining crow VIP crest"><span aria-hidden="true">🐦‍⬛</span></span><span class="vip-name">${escapeHtml(entry.username)}</span>`
      : escapeHtml(entry.username);
    const reviewContent = isCrimsonKaido
      ? `<div class="vip-review-bar"><span class="review-text">“${escapeHtml(entry.review)}”</span><span class="vip-review-label">Top Reviews // VIP Member</span></div>`
      : `<span class="review-text">“${escapeHtml(entry.review)}”</span>`;
    return `<tr class="${isCrimsonKaido ? 'vip-row' : ''}" style="animation-delay:${Math.min(index, 12) * 35}ms">
      <td data-label="Username" class="${isCrimsonKaido ? 'vip-name-cell' : ''}">${vipName}</td>
      <td data-label="Review" class="${isCrimsonKaido ? 'vip-review-cell' : ''}">${reviewContent}</td>
      <td data-label="Date">${escapeHtml(formatDate(entry.createdAt))}</td>
      <td data-label="Review status"><span class="status-badge">✦ ${escapeHtml(entry.reviewStatus || 'REGISTERED')}</span></td>
      ${coordinateCell}${actionCell}
    </tr>`;
  }).join('');
}

async function apiRequest(path, options = {}, token = adminToken) {
  if (!API_BASE) throw new Error('The shared ledger server is not connected yet.');
  const headers = new Headers(options.headers || {});
  if (options.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `The ledger returned an error (${response.status}).`);
  return body;
}

async function refreshLedger() {
  if (!API_BASE) {
    roomStatus.textContent = 'The shared ledger server needs to be connected before registration is available.';
    statusText.textContent = 'Ledger setup is not finished yet.';
    registerBtn.disabled = true;
    entries = [];
    updateAdminControls();
    renderBoard();
    return;
  }

  roomStatus.textContent = 'Loading the shared ledger…';
  try {
    if (adminToken) {
      try {
        const result = await apiRequest('/api/admin/entries');
        entries = result.entries || [];
        isAdmin = true;
      } catch (error) {
        if (error.message.includes('401') || error.message.toLowerCase().includes('admin')) {
          sessionStorage.removeItem(ADMIN_TOKEN_KEY);
          adminToken = '';
          isAdmin = false;
        } else throw error;
      }
    }
    if (!isAdmin) {
      const result = await apiRequest('/api/entries', {}, '');
      entries = result.entries || [];
    }
    updateAdminControls();
    renderBoard();
    roomStatus.textContent = 'Connected. New registrations appear here for everyone.';
    registerBtn.disabled = false;
  } catch (error) {
    roomStatus.textContent = error.message || 'Could not reach the shared ledger.';
    statusText.textContent = 'Check your internet connection and try again.';
    registerBtn.disabled = true;
  }
}

function getDeviceLocation() {
  if (!navigator.geolocation) return Promise.reject(new Error('This browser does not support location sharing.'));
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      // Match the original PC-working setting. Windows desktops can need
      // more time to obtain their first fix than a phone with GPS.
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 0
    });
  });
}

async function saveRegistration(username, review, location) {
  const result = await apiRequest('/api/entries', {
    method: 'POST',
    body: JSON.stringify({
      username: username.slice(0, 40),
      review: review.slice(0, 240),
      ...location
    })
  }, '');
  usernameInput.value = '';
  reviewInput.value = '';
  locationFallback.hidden = true;
  statusText.textContent = result.message || 'Registered. Your coordinates are hidden from the public leaderboard.';
  await refreshLedger();
}

registrationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  const review = reviewInput.value.trim();
  if (!username || !review) {
    statusText.textContent = 'Enter both your username and review first.';
    (!username ? usernameInput : reviewInput).focus();
    return;
  }
  if (!API_BASE) {
    statusText.textContent = 'The shared ledger server is not connected yet.';
    return;
  }

  registerBtn.disabled = true;
  locationFallback.hidden = true;
  statusText.textContent = 'Allow location access in your browser to continue…';
  try {
    const position = await getDeviceLocation();
    await saveRegistration(username, review, {
      latitude: Number(position.coords.latitude.toFixed(6)),
      longitude: Number(position.coords.longitude.toFixed(6)),
      locationSource: 'device'
    });
  } catch (error) {
    locationFallback.hidden = false;
    if (error.code === 2 || error.code === 3) {
      statusText.textContent = error.code === 3
        ? 'Your device location timed out. Retry, or choose the approximate internet location below.'
        : 'Your device could not find a location. Retry, or choose the approximate internet location below.';
    } else if (error.code === 1) {
      statusText.textContent = 'Chrome or Windows is blocking location. Set this site to Allow in Chrome Site settings, enable Windows Location services and desktop app access, then refresh. Or choose the approximate internet location below.';
    } else {
      statusText.textContent = `${error.message || 'Device location is unavailable.'} Retry after allowing location, or choose the approximate internet location below.`;
    }
  } finally {
    registerBtn.disabled = !API_BASE;
  }
});

retryLocationBtn.addEventListener('click', () => {
  locationFallback.hidden = true;
  registrationForm.requestSubmit();
});

networkLocationBtn.addEventListener('click', async () => {
  const username = usernameInput.value.trim();
  const review = reviewInput.value.trim();
  if (!username || !review) {
    statusText.textContent = 'Enter both your username and review first.';
    (!username ? usernameInput : reviewInput).focus();
    return;
  }

  registerBtn.disabled = true;
  retryLocationBtn.disabled = true;
  networkLocationBtn.disabled = true;
  statusText.textContent = 'Getting an approximate location from your internet connection…';
  try {
    await saveRegistration(username, review, { locationSource: 'network' });
  } catch (error) {
    statusText.textContent = error.message || 'Could not get an approximate location.';
  } finally {
    registerBtn.disabled = !API_BASE;
    retryLocationBtn.disabled = false;
    networkLocationBtn.disabled = false;
  }
});

quickRegisterBtn.addEventListener('click', () => {
  registrationCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => usernameInput.focus({ preventScroll: true }), 420);
});

quickLedgerBtn.addEventListener('click', () => {
  ledgerCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

adminDiamondBtn.addEventListener('click', () => {
  modalError.textContent = '';
  setModalOpen(true);
});

adminSignInForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = adminPasswordInput.value;
  if (!password) return;
  adminSignInBtn.disabled = true;
  modalError.textContent = 'Checking admin access…';
  try {
    const result = await apiRequest('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    }, '');
    adminToken = result.token;
    sessionStorage.setItem(ADMIN_TOKEN_KEY, adminToken);
    adminPasswordInput.value = '';
    modalError.textContent = '';
    await refreshLedger();
    if (!isAdmin) throw new Error('Admin access could not be confirmed.');
    setModalOpen(false);
    statusText.textContent = 'Admin signed in. Coordinates are visible only for this session.';
  } catch (error) {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    adminToken = '';
    isAdmin = false;
    updateAdminControls();
    modalError.textContent = error.message || 'Admin sign-in failed.';
  } finally {
    adminSignInBtn.disabled = false;
  }
});

adminLogoutBtn.addEventListener('click', async () => {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  adminToken = '';
  isAdmin = false;
  await refreshLedger();
  setModalOpen(false);
  statusText.textContent = 'Signed out. Coordinates are hidden.';
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

leaderboardBody.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-entry]');
  if (!button || !isAdmin) return;
  if (!window.confirm('Remove this registration from the ledger?')) return;
  button.disabled = true;
  try {
    await apiRequest(`/api/admin/entries/${encodeURIComponent(button.dataset.deleteEntry)}`, { method: 'DELETE' });
    statusText.textContent = 'Admin removed the registration.';
    await refreshLedger();
  } catch (error) {
    statusText.textContent = error.message || 'Could not remove this registration.';
    button.disabled = false;
  }
});

updateAdminControls();
renderBoard();
refreshLedger();
window.setInterval(refreshLedger, 60000);
