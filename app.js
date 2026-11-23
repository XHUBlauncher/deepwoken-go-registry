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
      ? `<td><span class="coord-chip">${escapeHtml(entry.latitude)}, ${escapeHtml(entry.longitude)}</span></td>`
      : '';
    const actionCell = isAdmin
      ? `<td><button class="delete-bubble" type="button" data-delete-entry="${escapeHtml(entry.id)}" aria-label="Remove ${escapeHtml(entry.username)}">Remove</button></td>`
      : '';
    return `<tr style="animation-delay:${Math.min(index, 12) * 35}ms">
      <td>${escapeHtml(entry.username)}</td>
      <td><span class="review-text">“${escapeHtml(entry.review)}”</span></td>
      <td>${escapeHtml(formatDate(entry.createdAt))}</td>
      <td><span class="status-badge">✦ ${escapeHtml(entry.reviewStatus || 'REGISTERED')}</span></td>
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
      enableHighAccuracy: false,
      timeout: 30000,
      maximumAge: 0
    });
  });
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
  statusText.textContent = 'Allow location access in your browser to continue…';
  try {
    const position = await getDeviceLocation();
    const result = await apiRequest('/api/entries', {
      method: 'POST',
      body: JSON.stringify({
        username: username.slice(0, 40),
        review: review.slice(0, 240),
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6))
      })
    }, '');
    usernameInput.value = '';
    reviewInput.value = '';
    statusText.textContent = result.message || 'Registered. Your coordinates are hidden from the public leaderboard.';
    await refreshLedger();
  } catch (error) {
    const locationMessages = {
      1: 'Location permission was denied. Allow location access for this website and try again.',
      2: 'Your device could not find a location. Try again where location services are available.',
      3: 'Location lookup timed out. Try again or check your device location settings.'
    };
    statusText.textContent = locationMessages[error.code] || error.message || 'Could not register this entry.';
  } finally {
    registerBtn.disabled = !API_BASE;
  }
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
