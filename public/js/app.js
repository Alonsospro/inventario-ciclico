/**
 * CyclicStock Pro - Frontend Application Engine
 * Rapid Condensed Counting Sheet & Direct Excel Synchronization
 * Role-Based Access Control (Auxiliares vs Encargados)
 */

// Sound Synthesizer via Web Audio API for fast zero-latency audio feedback
class SoundFX {
  constructor() {
    this.ctx = null;
  }
  
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  playBeep(freq = 880, type = 'sine', duration = 0.12) {
    try {
      this.init();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio might be blocked until first user interaction
    }
  }

  scanSuccess() {
    this.playBeep(1200, 'sine', 0.1);
    setTimeout(() => this.playBeep(1800, 'sine', 0.15), 80);
  }

  saveSuccess() {
    this.playBeep(800, 'triangle', 0.08);
    setTimeout(() => this.playBeep(1200, 'triangle', 0.12), 90);
    setTimeout(() => this.playBeep(1600, 'triangle', 0.2), 180);
  }

  warning() {
    this.playBeep(450, 'sawtooth', 0.15);
  }

  error() {
    this.playBeep(300, 'sawtooth', 0.25);
  }
}

const sfx = new SoundFX();

// Main App State
const state = {
  config: null,
  inventory: [],
  currentUser: null,
  currentCentro: '1300',
  centrosList: [],
  usersList: [],
  pendingModifyItem: null,
  charts: {
    abc: null,
    status: null
  }
};

// =============================================================================
// DOM Elements Initializer
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initTheme();
  initAuth();
  initEventListeners();
  loadCentrosList();
  loadAppConfig().then(() => {
    loadInventory();
    loadAnalytics();
  });
});

// Tab Switching
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Check role restriction
      if (tab.classList.contains('admin-only') && state.currentUser?.cargo === 'AUXILIAR') {
        showToast('Esta sección está reservada exclusivamente para Encargados', 'error');
        return;
      }

      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      const panel = document.getElementById(targetId);
      if (panel) panel.classList.add('active');

      if (targetId === 'dashboard-tab') {
        loadAnalytics();
      }
      if (targetId === 'users-tab') {
        loadUsersList();
      }
      if (targetId === 'centros-tab') {
        loadCentrosList();
      }
      if (targetId === 'inventory-tab') {
        // Focus search or first input
        setTimeout(() => document.getElementById('invSearchInput')?.focus(), 100);
      }
    });
  });
}

function switchTab(tabId) {
  const btn = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  if (btn) btn.click();
}

// Theme handling (Light / Dark)
function initTheme() {
  const toggleBtn = document.getElementById('themeToggleBtn');
  const savedTheme = localStorage.getItem('cyclic_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  toggleBtn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('cyclic_theme', next);
    updateThemeIcon(next);
    loadAnalytics();
  });
}

function updateThemeIcon(theme) {
  const icon = document.querySelector('#themeToggleBtn i');
  if (icon) {
    icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  }
}

// =============================================================================
// Authentication & Role Permissions
// =============================================================================
function initAuth() {
  const savedUser = localStorage.getItem('cyclic_current_user');
  const savedCentro = localStorage.getItem('cyclic_active_centro') || '1300';
  state.currentCentro = savedCentro;

  if (savedUser) {
    try {
      state.currentUser = JSON.parse(savedUser);
      state.currentCentro = state.currentUser.centro || savedCentro;
    } catch (e) {
      state.currentUser = null;
    }
  }

  // If no user is logged in, default to first Auxiliar
  if (!state.currentUser) {
    state.currentUser = {
      id: 'usr-1300-1',
      nombre: 'JHAMIL CADIMA',
      centro: '1300',
      cargo: 'AUXILIAR',
      usuario: 'JHAMIL',
      avatarColor: '#3b82f6'
    };
  }

  updateUserProfileUI();
  applyRolePermissions();
}

function applyRolePermissions() {
  const isAuxiliar = state.currentUser?.cargo === 'AUXILIAR';

  if (isAuxiliar) {
    document.body.classList.add('role-auxiliar');
    // Auxiliar always lands on inventory tab
    const activeTab = document.querySelector('.nav-tab.active');
    if (activeTab && activeTab.classList.contains('admin-only')) {
      switchTab('inventory-tab');
    }
  } else {
    document.body.classList.remove('role-auxiliar');
  }

  const curCentro = state.currentCentro || '1300';
  document.getElementById('navActiveCentroText').textContent = curCentro;
  const conteoTitle = document.getElementById('conteoCurrentCentroTitle');
  if (conteoTitle) conteoTitle.textContent = `Centro ${curCentro}`;
  const usersTitle = document.getElementById('usersCurrentCentroTitle');
  if (usersTitle) usersTitle.textContent = `Centro ${curCentro}`;
  const statCentroCode = document.getElementById('userStatCentroCode');
  if (statCentroCode) statCentroCode.textContent = curCentro;
}

function updateUserProfileUI() {
  if (!state.currentUser) return;
  const u = state.currentUser;

  const avatar = document.getElementById('navUserAvatar');
  avatar.textContent = (u.nombre || u.usuario || 'U').charAt(0).toUpperCase();
  avatar.style.backgroundColor = u.avatarColor || '#3b82f6';

  document.getElementById('navUserName').textContent = u.nombre || u.usuario;
  
  const roleLabel = `${u.cargo} • Centro ${u.centro || state.currentCentro}`;
  document.getElementById('navUserRole').textContent = roleLabel;

  const popAvatar = document.getElementById('popoverAvatar');
  if (popAvatar) {
    popAvatar.textContent = (u.nombre || u.usuario || 'U').charAt(0).toUpperCase();
    popAvatar.style.backgroundColor = u.avatarColor || '#3b82f6';
  }
  const popName = document.getElementById('popoverFullName');
  if (popName) popName.textContent = u.nombre || u.usuario;
  const popSub = document.getElementById('popoverSubInfo');
  if (popSub) popSub.textContent = `Usuario: ${u.usuario} • ${u.cargo} • Centro ${u.centro || state.currentCentro}`;
}

// =============================================================================
// Centros Management
// =============================================================================
async function loadCentrosList() {
  try {
    const res = await fetch('/api/centros');
    const data = await res.json();
    if (data.success) {
      state.centrosList = data.centros;
      renderCentrosPortal(data.centros);
      populateCentrosDropdowns(data.centros);
    }
  } catch (err) {
    console.error('Error loading centros:', err);
  }
}

function populateCentrosDropdowns(centros) {
  const loginSelect = document.getElementById('loginCentroSelect');
  if (loginSelect) {
    loginSelect.innerHTML = '';
    centros.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.codigo;
      opt.textContent = `Centro ${c.codigo} - ${c.ubicacion} (${c.totalUsuarios} operadores)`;
      if (c.codigo === state.currentCentro) opt.selected = true;
      loginSelect.appendChild(opt);
    });
    updateLoginQuickUsers(loginSelect.value);
  }

  const filterSelect = document.getElementById('filterUsersByCentroSelect');
  if (filterSelect && filterSelect.options.length <= 1) {
    centros.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.codigo;
      opt.textContent = `Centro ${c.codigo} (${c.nombre})`;
      if (c.codigo === state.currentCentro) opt.selected = true;
      filterSelect.appendChild(opt);
    });
  }

  const modalCentroSelect = document.getElementById('userModalCentro');
  if (modalCentroSelect) {
    modalCentroSelect.innerHTML = '';
    centros.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.codigo;
      opt.textContent = `Centro ${c.codigo} (${c.nombre})`;
      if (c.codigo === state.currentCentro) opt.selected = true;
      modalCentroSelect.appendChild(opt);
    });
  }
}

function renderCentrosPortal(centros) {
  const grid = document.getElementById('centrosCardsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  let totalPersonal = 0;
  let totalEncargados = 0;
  const searchVal = (document.getElementById('searchCentrosInput')?.value || '').toLowerCase().trim();

  centros.forEach(c => {
    totalPersonal += c.totalUsuarios;
    totalEncargados += c.encargadosCount;

    if (searchVal) {
      const match = c.codigo.toLowerCase().includes(searchVal) || 
                    c.nombre.toLowerCase().includes(searchVal) || 
                    c.ubicacion.toLowerCase().includes(searchVal) ||
                    c.encargados.some(e => e.nombre.toLowerCase().includes(searchVal) || e.usuario.toLowerCase().includes(searchVal));
      if (!match) return;
    }

    const isCurrent = c.codigo === state.currentCentro;
    const card = document.createElement('div');
    card.className = `centro-card ${isCurrent ? 'active-centro' : ''}`;

    const encargadosNames = c.encargados.length > 0 
      ? c.encargados.map(e => e.nombre).join(', ') 
      : 'Por asignar';

    card.innerHTML = `
      <div class="centro-card-header">
        <div class="centro-icon-box">
          <i class="fa-solid ${c.icono || 'fa-warehouse'}"></i>
        </div>
        <div class="text-right">
          <div class="centro-code-tag">CENTRO ${c.codigo}</div>
          ${isCurrent ? '<span class="centro-active-pill"><i class="fa-solid fa-check"></i> Activo</span>' : ''}
        </div>
      </div>

      <div class="centro-card-body">
        <div class="centro-name">${escapeHtml(c.nombre)}</div>
        <div class="centro-location">
          <i class="fa-solid fa-location-dot"></i> ${escapeHtml(c.ubicacion)}
        </div>

        <div class="centro-team-info">
          <div class="team-row">
            <span class="team-label"><i class="fa-solid fa-user-shield text-amber"></i> Encargado(s):</span>
            <span class="team-val-encargado">${escapeHtml(encargadosNames)}</span>
          </div>
          <div class="team-row">
            <span class="team-label"><i class="fa-solid fa-users text-primary"></i> Auxiliares:</span>
            <span class="team-val-auxiliar">${c.auxiliaresCount} asignados</span>
          </div>
        </div>
      </div>

      <div class="centro-card-actions">
        <button class="btn ${isCurrent ? 'btn-primary' : 'btn-secondary'} btn-sm btn-select-centro" data-centro="${c.codigo}">
          <i class="fa-solid fa-right-to-bracket"></i>
          <span>${isCurrent ? 'Centro Actual' : 'Trabajar en este Centro'}</span>
        </button>
      </div>
    `;

    card.querySelector('.btn-select-centro').addEventListener('click', () => {
      selectWorkingCentro(c.codigo);
    });

    grid.appendChild(card);
  });

  document.getElementById('statTotalCentros').textContent = centros.length;
  document.getElementById('statTotalPersonal').textContent = totalPersonal;
  document.getElementById('statTotalEncargados').textContent = totalEncargados;
}

function selectWorkingCentro(centroCode) {
  state.currentCentro = String(centroCode);
  localStorage.setItem('cyclic_active_centro', state.currentCentro);
  
  showToast(`Centro de trabajo cambiado a: Centro ${centroCode}`, 'success');
  applyRolePermissions();
  renderCentrosPortal(state.centrosList);

  switchTab('inventory-tab');
  loadInventory();
  loadAnalytics();
  loadUsersList();
}

async function updateLoginQuickUsers(centroCode) {
  const container = document.getElementById('loginQuickUsersList');
  if (!container) return;
  container.innerHTML = '';

  try {
    const res = await fetch(`/api/auth/users?centro=${centroCode}`);
    const data = await res.json();
    if (data.success && data.users.length > 0) {
      data.users.forEach(u => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'login-user-chip';
        chip.innerHTML = `${u.cargo === 'ENCARGADO' ? '<i class="fa-solid fa-user-shield text-amber"></i>' : ''} ${escapeHtml(u.usuario)}`;
        chip.title = `${u.nombre} (${u.cargo})`;
        chip.addEventListener('click', () => {
          document.getElementById('loginUsernameInput').value = u.usuario;
          document.getElementById('loginPasswordInput').focus();
        });
        container.appendChild(chip);
      });
    }
  } catch (err) {
    console.error(err);
  }
}

// =============================================================================
// Inventory & Direct Condensed Counting
// =============================================================================
async function loadAppConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    state.config = data;

    const nameElem = document.getElementById('activeExcelFileName');
    if (nameElem) nameElem.textContent = data.fileName || 'inventario.xlsx';
    const sheetElem = document.getElementById('activeSheetTag');
    if (sheetElem) sheetElem.textContent = data.activeSheetName || 'General';

    const accessUrl = `http://${data.localIp}:${data.port}`;
    const ipElem = document.getElementById('networkIpText');
    if (ipElem) ipElem.textContent = accessUrl;
    const mobElem = document.getElementById('mobileAccessUrl');
    if (mobElem) mobElem.textContent = accessUrl;

    updateBlindCountUI(data.blindCount);
    populateMappingForm(data.columnMapping);
    const pathElem = document.getElementById('configFilePath');
    if (pathElem) pathElem.textContent = data.activeFilePath;

    inspectActiveFile();
  } catch (err) {
    showToast('Error al conectar con el servidor backend', 'error');
  }
}

async function inspectActiveFile() {
  try {
    const res = await fetch('/api/config/inspect-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: state.config?.activeFilePath })
    });
    const info = await res.json();

    const sheetSelect = document.getElementById('configSheetSelect');
    sheetSelect.innerHTML = '';
    if (info.sheets && info.sheets.length > 0) {
      info.sheets.forEach(sh => {
        const opt = document.createElement('option');
        opt.value = sh.name;
        opt.textContent = `${sh.name} (${sh.rowCount} filas)`;
        if (sh.name === state.config?.activeSheetName) opt.selected = true;
        sheetSelect.appendChild(opt);
      });
    }
  } catch (err) {
    console.warn('Could not inspect sheets:', err);
  }
}

async function loadInventory() {
  try {
    const query = new URLSearchParams();
    const searchVal = document.getElementById('invSearchInput')?.value;
    const locVal = document.getElementById('invLocationFilter')?.value;
    const abcVal = document.getElementById('invAbcFilter')?.value;
    const statusVal = document.getElementById('invStatusFilter')?.value;

    query.append('centro', state.currentCentro || '1300');
    if (state.currentUser) {
      query.append('userId', state.currentUser.id || '');
      query.append('userCargo', state.currentUser.cargo || 'AUXILIAR');
      query.append('userName', state.currentUser.nombre || state.currentUser.usuario || '');
    }

    if (searchVal) query.append('search', searchVal);
    if (locVal) query.append('location', locVal);
    if (abcVal) query.append('abcClass', abcVal);
    
    // Status custom filter
    if (statusVal === 'Contado') {
      // client-side filter handled below
    } else if (statusVal) {
      query.append('status', statusVal);
    }

    const res = await fetch(`/api/inventory?${query.toString()}`);
    const data = await res.json();

    // Update assignment badge
    const unassignedView = document.getElementById('unassignedCycleView');
    const assignedContent = document.getElementById('assignedInventoryContent');
    const assignedAuxText = document.getElementById('assignedAuxiliarNameText');
    const cycleStatusBadge = document.getElementById('cycleStatusBadgeText');

    if (data.assignment) {
      state.currentAssignment = data.assignment;
      if (assignedAuxText) {
        assignedAuxText.textContent = data.assignment.assignedToUserName || 'Sin Asignar';
      }

      if (cycleStatusBadge) {
        if (data.assignment.status === 'ASIGNADO') {
          cycleStatusBadge.textContent = 'En Proceso';
          cycleStatusBadge.className = 'badge-cycle-status status-asignado';
        } else if (data.assignment.status === 'CONCLUIDO') {
          cycleStatusBadge.textContent = 'Concluido ✓';
          cycleStatusBadge.className = 'badge-cycle-status status-concluido';
        } else {
          cycleStatusBadge.textContent = 'Sin Asignar';
          cycleStatusBadge.className = 'badge-cycle-status';
        }
      }
    }

    // Access control: If not allowed, show lock state and return early
    if (data.allowed === false) {
      if (unassignedView) unassignedView.classList.remove('hidden');
      if (assignedContent) assignedContent.classList.add('hidden');
      
      const reasonElem = document.getElementById('unassignedReasonText');
      if (reasonElem) reasonElem.textContent = data.reason || 'No tienes ningún inventario cíclico asignado en este momento.';
      
      const centroCodeElem = document.getElementById('unassignedCentroCode');
      if (centroCodeElem) centroCodeElem.textContent = state.currentCentro;
      
      const userNameElem = document.getElementById('unassignedUserName');
      if (userNameElem) userNameElem.textContent = state.currentUser?.nombre || state.currentUser?.usuario || 'Auxiliar';
      
      const t = document.getElementById('invCountTotal'); if (t) t.textContent = '0';
      const d = document.getElementById('invCountDone'); if (d) d.textContent = '0';
      const p = document.getElementById('invCountPending'); if (p) p.textContent = '0';
      const pct = document.getElementById('invProgressPercent'); if (pct) pct.textContent = '0%';
      const fill = document.getElementById('invProgressBarFill'); if (fill) fill.style.width = '0%';
      const sh = document.getElementById('invCountShown'); if (sh) sh.textContent = '0';
      return;
    } else {
      if (unassignedView) unassignedView.classList.add('hidden');
      if (assignedContent) assignedContent.classList.remove('hidden');
    }

    let items = data.items || [];
    if (statusVal === 'Contado') {
      items = items.filter(i => i.physicalStock !== null);
    }

    state.inventory = items;

    // Calculate progress stats
    const totalCount = data.totalCount || 0;
    const countedCount = items.filter(i => i.physicalStock !== null).length;
    const pendingCount = totalCount - countedCount;
    const progressPercent = totalCount > 0 ? Math.round((countedCount / totalCount) * 100) : 0;

    // Update Progress Strip
    const totalElem = document.getElementById('invCountTotal');
    if (totalElem) totalElem.textContent = totalCount;

    const doneElem = document.getElementById('invCountDone');
    if (doneElem) doneElem.textContent = countedCount;

    const pendingElem = document.getElementById('invCountPending');
    if (pendingElem) pendingElem.textContent = pendingCount;

    const pctElem = document.getElementById('invProgressPercent');
    if (pctElem) pctElem.textContent = `${progressPercent}%`;

    const barElem = document.getElementById('invProgressBarFill');
    if (barElem) barElem.style.width = `${progressPercent}%`;

    const shownElem = document.getElementById('invCountShown');
    if (shownElem) shownElem.textContent = items.length;

    populateLocationDropdown(data.locations || []);
    renderCondensedInventoryTable(items, data.blindCount);

  } catch (err) {
    console.error('Error in loadInventory:', err);
    showToast('Error al cargar productos desde Excel: ' + err.message, 'error');
  }
}

function populateLocationDropdown(locations) {
  const locSelect = document.getElementById('invLocationFilter');
  const resetLocSelect = document.getElementById('resetFilterLocation');

  if (locations && locSelect.options.length <= 1) {
    locations.forEach(loc => {
      const opt = document.createElement('option');
      opt.value = loc;
      opt.textContent = `Pasillo: ${loc}`;
      locSelect.appendChild(opt);

      const opt2 = document.createElement('option');
      opt2.value = loc;
      opt2.textContent = loc;
      resetLocSelect?.appendChild(opt2);
    });
  }
}

/**
 * Render Condensed Blind Counting Table with inline inputs & confirmation boxes
 */
function renderCondensedInventoryTable(items) {
  const tbody = document.getElementById('mainInventoryTbody');
  tbody.innerHTML = '';

  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">No se encontraron productos con los filtros seleccionados.</td></tr>`;
    return;
  }

  items.forEach((item, index) => {
    const tr = document.createElement('tr');
    const isCounted = item.physicalStock !== null && item.physicalStock !== undefined;
    tr.className = isCounted ? 'row-counted' : 'row-pending';
    tr.id = `row-${item.sku}`;

    const countVal = isCounted ? item.physicalStock : '';

    tr.innerHTML = `
      <td><strong class="font-mono text-primary">${escapeHtml(item.sku)}</strong></td>
      <td>
        <div style="font-weight: 600;">${escapeHtml(item.description)}</div>
        <div class="text-muted" style="font-size: 0.75rem; font-family: var(--font-mono);"><i class="fa-solid fa-barcode"></i> ${escapeHtml(item.barcode)}</div>
      </td>
      <td><span class="tag tag-location">${escapeHtml(item.location)}</span></td>
      <td class="text-center"><span class="tag tag-abc">${escapeHtml(item.abcClass)}</span></td>
      
      <!-- Input de conteo numérico -->
      <td class="text-center">
        <div class="quick-count-cell">
          <input 
            type="number" 
            class="quick-count-input ${isCounted ? 'locked-input' : ''}" 
            id="count-input-${item.sku}"
            data-sku="${escapeHtml(item.sku)}"
            data-system="${item.systemStock}"
            data-cost="${item.unitCost}"
            data-confirmed="${isCounted ? 'true' : 'false'}"
            value="${countVal}"
            placeholder="0"
            min="0"
            step="1"
            tabindex="${index + 1}"
            ${isCounted ? 'readonly' : ''}
          >
          ${isCounted ? `<button class="btn-edit-direct" data-sku="${escapeHtml(item.sku)}" title="Modificar conteo"><i class="fa-solid fa-pen"></i></button>` : ''}
        </div>
      </td>

      <!-- Caja de Confirmación -->
      <td class="text-center">
        <button 
          class="btn-confirm-count ${isCounted ? 'is-counted' : ''}" 
          id="btn-confirm-${item.sku}"
          data-sku="${escapeHtml(item.sku)}"
          data-confirmed="${isCounted ? 'true' : 'false'}"
          title="${isCounted ? 'Ya contado en Excel. Clic para modificar' : 'Confirmar y guardar en Excel'}"
        >
          <i class="fa-solid ${isCounted ? 'fa-circle-check' : 'fa-check'}"></i>
          <span>${isCounted ? 'Contado' : 'Confirmar'}</span>
        </button>
      </td>
    `;

    // Event: Input Enter key or Input Click
    const inputElem = tr.querySelector(`#count-input-${item.sku}`);
    const confirmBtn = tr.querySelector(`#btn-confirm-${item.sku}`);
    const editBtn = tr.querySelector('.btn-edit-direct');

    // If input is clicked and already confirmed, show modify warning modal
    inputElem.addEventListener('click', () => {
      if (inputElem.getAttribute('data-confirmed') === 'true') {
        promptModifyConfirmation(item, inputElem, confirmBtn);
      }
    });

    inputElem.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitInlineCount(item, inputElem, confirmBtn, index);
      }
    });

    // Confirmation button click
    confirmBtn.addEventListener('click', () => {
      if (confirmBtn.getAttribute('data-confirmed') === 'true') {
        promptModifyConfirmation(item, inputElem, confirmBtn);
      } else {
        submitInlineCount(item, inputElem, confirmBtn, index);
      }
    });

    if (editBtn) {
      editBtn.addEventListener('click', () => {
        promptModifyConfirmation(item, inputElem, confirmBtn);
      });
    }

    tbody.appendChild(tr);
  });
}

/**
 * Submit inline count directly to Excel backend
 * Allows empty input (defaults to 0 units for out-of-stock items)
 */
async function submitInlineCount(item, inputElem, confirmBtn, currentIndex) {
  const rawVal = inputElem.value.trim();
  let physicalStock = 0;

  // If user entered a number, use it; if left empty, default to 0 (sin existencias)
  if (rawVal !== '' && !isNaN(rawVal)) {
    physicalStock = parseInt(rawVal, 10);
  }
  if (physicalStock < 0) physicalStock = 0;

  // Put 0 in the input field if it was left empty
  inputElem.value = physicalStock;

  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

  const operatorName = state.currentUser?.nombre || state.currentUser?.usuario || 'Operador Web';

  try {
    const payload = {
      sku: item.sku,
      physicalStock: physicalStock,
      operatorName: operatorName,
      centro: state.currentCentro || '1300',
      unitCost: item.unitCost,
      systemStock: item.systemStock
    };

    const res = await fetch('/api/inventory/count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result.error || 'Error al escribir en Excel');
    }

    // Success Sound & Clean Blind Toast (no variance or status revealed)
    sfx.saveSuccess();
    showToast(`✓ SKU ${item.sku} confirmado con ${physicalStock} uds`, 'success');

    // Update Row styling
    const row = document.getElementById(`row-${item.sku}`);
    if (row) {
      row.className = 'row-counted';
    }

    // Update Input state
    inputElem.classList.add('locked-input');
    inputElem.setAttribute('data-confirmed', 'true');
    inputElem.readOnly = true;

    // Update Button state
    confirmBtn.className = 'btn-confirm-count is-counted';
    confirmBtn.setAttribute('data-confirmed', 'true');
    confirmBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>Contado</span>';
    confirmBtn.title = 'Ya contado en Excel. Clic para modificar';

    // Update item object in memory
    item.physicalStock = physicalStock;
    item.variance = result.variance;
    item.status = result.status;

    // Update Progress counter
    const total = state.inventory.length;
    const counted = state.inventory.filter(i => i.physicalStock !== null).length;
    const pending = total - counted;
    const pct = total > 0 ? Math.round((counted / total) * 100) : 0;
    
    const doneElem = document.getElementById('invCountDone');
    if (doneElem) doneElem.textContent = counted;

    const pendingElem = document.getElementById('invCountPending');
    if (pendingElem) pendingElem.textContent = pending;

    const pctElem = document.getElementById('invProgressPercent');
    if (pctElem) pctElem.textContent = `${pct}%`;

    const barElem = document.getElementById('invProgressBarFill');
    if (barElem) barElem.style.width = `${pct}%`;

    // Move focus automatically to next input in table for rapid hands-free flow
    const nextInput = document.querySelector(`.quick-count-input[tabindex="${currentIndex + 2}"]`);
    if (nextInput) {
      nextInput.focus();
      nextInput.select();
    }

    loadAnalytics();

  } catch (err) {
    sfx.error();
    showToast(err.message, 'error');
    console.error(err);
  } finally {
    confirmBtn.disabled = false;
  }
}

/**
 * Accidental Modification Protection Dialog
 */
function promptModifyConfirmation(item, inputElem, confirmBtn) {
  sfx.warning();
  state.pendingModifyItem = { item, inputElem, confirmBtn };

  document.getElementById('modSkuText').textContent = item.sku;
  document.getElementById('modDescText').textContent = item.description;
  document.getElementById('modCurrentValText').textContent = item.physicalStock !== null ? item.physicalStock : 0;

  document.getElementById('modifyConfirmModal').classList.remove('hidden');
}

function unlockItemForModification() {
  if (!state.pendingModifyItem) return;
  const { inputElem, confirmBtn } = state.pendingModifyItem;

  // Unlock input
  inputElem.readOnly = false;
  inputElem.classList.remove('locked-input');
  inputElem.setAttribute('data-confirmed', 'false');
  
  // Update button to save mode
  confirmBtn.className = 'btn-confirm-count';
  confirmBtn.setAttribute('data-confirmed', 'false');
  confirmBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> <span>Guardar</span>';
  confirmBtn.title = 'Guardar nueva cantidad en Excel';

  document.getElementById('modifyConfirmModal').classList.add('hidden');
  
  inputElem.focus();
  inputElem.select();
  showToast(`Campo desbloqueado para ${inputElem.getAttribute('data-sku')}. Ingresa la nueva cantidad.`, 'info');
}

// =============================================================================
// Users Management Tab (Equipo & Personal)
// =============================================================================
async function loadUsersList() {
  try {
    const selectedCentro = document.getElementById('filterUsersByCentroSelect')?.value || state.currentCentro;
    const url = selectedCentro ? `/api/auth/users/all?centro=${selectedCentro}` : '/api/auth/users/all';

    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      state.usersList = data.users;
      renderUsersGrid(data.users);
    }
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function renderUsersGrid(users) {
  const grid = document.getElementById('usersCardsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const searchVal = (document.getElementById('usersSearchInput')?.value || '').toLowerCase().trim();

  let activeEncargados = 0;
  let activeAuxiliares = 0;

  users.forEach(u => {
    if (u.activo) {
      if (u.cargo === 'ENCARGADO') activeEncargados++;
      else activeAuxiliares++;
    }

    if (searchVal) {
      const match = u.nombre.toLowerCase().includes(searchVal) || 
                    u.usuario.toLowerCase().includes(searchVal) || 
                    u.cargo.toLowerCase().includes(searchVal) ||
                    (u.centro && u.centro.includes(searchVal));
      if (!match) return;
    }

    const card = document.createElement('div');
    card.className = `user-card ${!u.activo ? 'inactive' : ''}`;
    const initial = (u.nombre || u.usuario || 'U').charAt(0).toUpperCase();
    const isEncargado = u.cargo === 'ENCARGADO';

    card.innerHTML = `
      <div class="user-card-top">
        <div class="user-card-avatar" style="background-color: ${u.avatarColor || '#3b82f6'};">
          ${initial}
        </div>
        <div class="user-card-info">
          <h3 class="user-card-name">${escapeHtml(u.nombre)}</h3>
          <div class="user-card-user"><i class="fa-solid fa-at"></i> ${escapeHtml(u.usuario)}</div>
        </div>
      </div>

      <div class="user-card-meta">
        <span class="user-card-badge ${isEncargado ? 'badge-supervisor' : 'badge-auxiliar'}">
          <i class="fa-solid ${isEncargado ? 'fa-user-shield' : 'fa-user-tag'}"></i> ${u.cargo}
        </span>
        <span class="user-card-centro"><i class="fa-solid fa-warehouse"></i> Centro ${u.centro || '1300'}</span>
      </div>

      <div class="user-card-footer">
        <span class="user-access-text"><i class="fa-solid fa-clock"></i> ${u.ultimoAcceso ? 'Último: ' + u.ultimoAcceso.substring(0, 10) : 'Sin accesos recientes'}</span>
        <button class="btn btn-outline btn-sm btn-edit-user" data-id="${u.id}">
          <i class="fa-solid fa-pen"></i> Editar
        </button>
      </div>
    `;

    card.querySelector('.btn-edit-user').addEventListener('click', () => {
      openEditUserModal(u);
    });

    grid.appendChild(card);
  });

  document.getElementById('usersTotalEncargadosCount').textContent = activeEncargados;
  document.getElementById('usersTotalAuxiliaresCount').textContent = activeAuxiliares;
}

function openEditUserModal(user) {
  document.getElementById('userModalTitle').textContent = user ? 'Editar Operador' : 'Registrar Nuevo Operador';
  document.getElementById('userModalId').value = user ? user.id : '';
  document.getElementById('userModalNombre').value = user ? user.nombre : '';
  document.getElementById('userModalCentro').value = user ? user.centro : state.currentCentro;
  document.getElementById('userModalCargo').value = user ? user.cargo : 'AUXILIAR';
  document.getElementById('userModalUsuario').value = user ? user.usuario : '';
  document.getElementById('userModalPassword').value = '';
  document.getElementById('userModalPassword').required = !user;

  document.getElementById('userModal').classList.remove('hidden');
}

// =============================================================================
// Dashboard & Analytics (IRA & Charts)
// =============================================================================
async function loadAnalytics() {
  try {
    const curCentro = state.currentCentro || '1300';
    const res = await fetch(`/api/analytics?centro=${encodeURIComponent(curCentro)}`);
    const data = await res.json();

    document.getElementById('kpiIraScore').textContent = data.iraPercentage;
    document.getElementById('kpiProgress').textContent = data.cycleProgress;
    document.getElementById('kpiTotalItems').textContent = data.totalItems;
    document.getElementById('kpiCountedItems').textContent = data.countedItems;
    document.getElementById('kpiExactMatches').textContent = data.exactMatches;
    document.getElementById('kpiDiscrepancies').textContent = data.missingItems + data.surplusItems;
    document.getElementById('kpiMissing').textContent = data.missingItems;
    document.getElementById('kpiSurplus').textContent = data.surplusItems;
    document.getElementById('kpiNetCost').textContent = `$${data.netVarianceCost.toLocaleString('es-CO', { minimumFractionDigits: 2 })}`;
    document.getElementById('kpiAbsCost').textContent = `$${data.absoluteVarianceCost.toLocaleString('es-CO', { minimumFractionDigits: 2 })}`;

    renderAbcChart(data.abcStats);
    renderStatusChart(data.exactMatches, data.missingItems, data.surplusItems, data.pendingItems);
    renderTopDiscrepancies(data.topDiscrepancies);
  } catch (err) {
    console.error('Error loading analytics:', err);
  }
}

function renderAbcChart(abcStats) {
  const ctx = document.getElementById('abcChart');
  if (!ctx) return;

  if (state.charts.abc) {
    state.charts.abc.destroy();
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  state.charts.abc = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Clase A (Críticos)', 'Clase B (Medios)', 'Clase C (Bajos)'],
      datasets: [
        {
          label: 'Total Ítems',
          data: [abcStats.A.total, abcStats.B.total, abcStats.C.total],
          backgroundColor: 'rgba(148, 163, 184, 0.3)',
          borderColor: 'rgba(148, 163, 184, 0.8)',
          borderWidth: 1,
          borderRadius: 6
        },
        {
          label: 'Contados Exactos',
          data: [abcStats.A.exact, abcStats.B.exact, abcStats.C.exact],
          backgroundColor: 'rgba(16, 185, 129, 0.7)',
          borderColor: '#10b981',
          borderWidth: 1,
          borderRadius: 6
        },
        {
          label: 'Con Discrepancia',
          data: [abcStats.A.discrepancies, abcStats.B.discrepancies, abcStats.C.discrepancies],
          backgroundColor: 'rgba(239, 68, 68, 0.7)',
          borderColor: '#ef4444',
          borderWidth: 1,
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: textColor, font: { family: 'Inter', size: 12 } }
        }
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { family: 'Inter' } },
          grid: { display: false }
        },
        y: {
          ticks: { color: textColor, font: { family: 'Inter' } },
          grid: { color: gridColor }
        }
      }
    }
  });
}

function renderStatusChart(exact, missing, surplus, pending) {
  const ctx = document.getElementById('statusChart');
  if (!ctx) return;

  if (state.charts.status) {
    state.charts.status.destroy();
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';

  state.charts.status = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Exactos (Cuadrados)', 'Faltantes', 'Sobrantes', 'Pendientes'],
      datasets: [
        {
          data: [exact, missing, surplus, pending],
          backgroundColor: ['#10b981', '#ef4444', '#3b82f6', '#64748b'],
          borderWidth: 2,
          borderColor: isDark ? '#111827' : '#ffffff'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: textColor, font: { family: 'Inter', size: 12 } }
        }
      },
      cutout: '68%'
    }
  });
}

function renderTopDiscrepancies(items) {
  const tbody = document.getElementById('topDiscrepanciesTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9">No se registran discrepancias en los artículos contados.</td></tr>`;
    return;
  }

  items.forEach(item => {
    const tr = document.createElement('tr');
    const statusClass = item.status === 'Faltante' ? 'faltante' : 'sobrante';
    const sign = item.variance > 0 ? '+' : '';

    tr.innerHTML = `
      <td><strong class="font-mono text-primary">${escapeHtml(item.sku)}</strong></td>
      <td>${escapeHtml(item.description)}</td>
      <td><span class="tag tag-location">${escapeHtml(item.location)}</span></td>
      <td>${item.systemStock}</td>
      <td><strong>${item.physicalStock}</strong></td>
      <td class="${item.variance < 0 ? 'text-red' : 'text-primary'}"><strong>${sign}${item.variance}</strong></td>
      <td>$${item.unitCost.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</td>
      <td class="${item.varianceCost < 0 ? 'text-red' : 'text-primary'}"><strong>$${item.varianceCost.toLocaleString('es-CO', { minimumFractionDigits: 2 })}</strong></td>
      <td><span class="status-badge ${statusClass}">${item.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================================================================
// Configuration & Mapping Helpers
// =============================================================================
function populateMappingForm(map) {
  if (!map) return;
  const fields = ['sku', 'barcode', 'description', 'location', 'category', 'abcClass', 'unit', 'unitCost', 'systemStock', 'physicalStock', 'variance', 'varianceCost', 'lastCountDate', 'counterName', 'status'];

  fields.forEach(f => {
    const inputId = `map${f.charAt(0).toUpperCase() + f.slice(1)}`;
    const input = document.getElementById(inputId);
    if (input && map[f]) {
      input.value = map[f];
    }
  });
}

function extractMappingFromForm() {
  const fields = ['sku', 'barcode', 'description', 'location', 'category', 'abcClass', 'unit', 'unitCost', 'systemStock', 'physicalStock', 'variance', 'varianceCost', 'lastCountDate', 'counterName', 'status'];
  const mapping = {};

  fields.forEach(f => {
    const inputId = `map${f.charAt(0).toUpperCase() + f.slice(1)}`;
    const input = document.getElementById(inputId);
    if (input && input.value) {
      mapping[f] = input.value.trim().toUpperCase();
    }
  });

  return mapping;
}

async function saveMappingToServer() {
  const mapping = extractMappingFromForm();
  const sheetName = document.getElementById('configSheetSelect').value;

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        columnMapping: mapping,
        activeSheetName: sheetName
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Configuración y mapeo de Excel guardados correctamente', 'success');
      loadAppConfig();
      loadInventory();
      loadAnalytics();
    }
  } catch (err) {
    showToast('Error al guardar mapeo: ' + err.message, 'error');
  }
}

function updateBlindCountUI(isBlind) {
  const label = document.getElementById('blindCountLabel');
  if (label) {
    label.textContent = isBlind ? 'Modo Ciego: ON' : 'Modo Ciego: OFF';
  }
}

// =============================================================================
// Event Listeners Initializer
// =============================================================================
function initEventListeners() {
  // Accidental Modification Modal Actions
  document.getElementById('btnConfirmModifyModal').addEventListener('click', unlockItemForModification);
  document.getElementById('btnCancelModifyModal').addEventListener('click', () => {
    document.getElementById('modifyConfirmModal').classList.add('hidden');
  });
  document.getElementById('btnCloseModifyModal').addEventListener('click', () => {
    document.getElementById('modifyConfirmModal').classList.add('hidden');
  });

  // Profile Popover
  const profileBtn = document.getElementById('userProfileBtn');
  const popover = document.getElementById('userDropdownPopover');
  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popover.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!popover.contains(e.target) && e.target !== profileBtn) {
      popover.classList.add('hidden');
    }
  });

  document.getElementById('btnSwitchUser').addEventListener('click', () => {
    popover.classList.add('hidden');
    openLoginModal();
  });

  document.getElementById('btnLogout').addEventListener('click', () => {
    popover.classList.add('hidden');
    localStorage.removeItem('cyclic_current_user');
    openLoginModal();
  });

  document.getElementById('btnSwitchCentroNav')?.addEventListener('click', () => {
    switchTab('centros-tab');
  });
  document.getElementById('btnNavViewCentros')?.addEventListener('click', () => {
    popover.classList.add('hidden');
    switchTab('centros-tab');
  });

  document.getElementById('searchCentrosInput')?.addEventListener('input', () => {
    renderCentrosPortal(state.centrosList);
  });

  // Login Modal
  const loginModal = document.getElementById('loginModal');
  document.getElementById('btnCloseLoginModal').addEventListener('click', () => {
    loginModal.classList.add('hidden');
  });

  document.getElementById('loginCentroSelect')?.addEventListener('change', (e) => {
    updateLoginQuickUsers(e.target.value);
  });

  document.getElementById('btnToggleLoginPassword').addEventListener('click', () => {
    const pwdInput = document.getElementById('loginPasswordInput');
    const eye = document.getElementById('loginPwdEyeIcon');
    if (pwdInput.type === 'password') {
      pwdInput.type = 'text';
      eye.className = 'fa-solid fa-eye-slash';
    } else {
      pwdInput.type = 'password';
      eye.className = 'fa-solid fa-eye';
    }
  });

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const centro = document.getElementById('loginCentroSelect').value;
    const username = document.getElementById('loginUsernameInput').value;
    const password = document.getElementById('loginPasswordInput').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ centro, username, password })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Credenciales inválidas');
      }

      state.currentUser = data.user;
      state.currentCentro = data.user.centro || centro;
      localStorage.setItem('cyclic_current_user', JSON.stringify(data.user));
      localStorage.setItem('cyclic_active_centro', state.currentCentro);

      showToast(`¡Bienvenido ${data.user.nombre}! (${data.user.cargo})`, 'success');
      loginModal.classList.add('hidden');

      updateUserProfileUI();
      applyRolePermissions();
      loadInventory();
      loadUsersList();
      renderCentrosPortal(state.centrosList);

    } catch (err) {
      sfx.error();
      showToast(err.message, 'error');
    }
  });

  // Users Tab
  document.getElementById('filterUsersByCentroSelect')?.addEventListener('change', () => {
    loadUsersList();
  });
  document.getElementById('usersSearchInput')?.addEventListener('input', () => {
    renderUsersGrid(state.usersList);
  });

  document.getElementById('btnOpenAddUserModal')?.addEventListener('click', () => {
    openEditUserModal(null);
  });
  document.getElementById('btnCloseUserModal').addEventListener('click', () => {
    document.getElementById('userModal').classList.add('hidden');
  });
  document.getElementById('btnCancelUserModal').addEventListener('click', () => {
    document.getElementById('userModal').classList.add('hidden');
  });

  document.getElementById('userModalForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('userModalId').value;
    const payload = {
      nombre: document.getElementById('userModalNombre').value,
      centro: document.getElementById('userModalCentro').value,
      cargo: document.getElementById('userModalCargo').value,
      usuario: document.getElementById('userModalUsuario').value,
      password: document.getElementById('userModalPassword').value
    };

    try {
      const url = id ? `/api/auth/users/${id}` : '/api/auth/users';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      showToast(`Operador ${payload.nombre} guardado exitosamente`, 'success');
      document.getElementById('userModal').classList.add('hidden');
      loadUsersList();
      loadCentrosList();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Filters for Rapid Counting Table
  ['invSearchInput', 'invLocationFilter', 'invAbcFilter', 'invStatusFilter'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      loadInventory();
    });
  });

  document.getElementById('btnRefreshInventory').addEventListener('click', () => {
    loadInventory();
    loadAnalytics();
    showToast('Datos de Excel recargados', 'info');
  });

  // Toggle Blind Count (Admin only)
  document.getElementById('btnToggleBlindCount')?.addEventListener('click', async () => {
    const nextVal = !state.config?.blindCount;
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blindCount: nextVal })
    });
    state.config.blindCount = nextVal;
    updateBlindCountUI(nextVal);
    loadInventory();
  });

  document.getElementById('btnDownloadCurrentExcel')?.addEventListener('click', () => {
    window.location.href = '/api/download-excel';
  });

  // Reset Cycle Modal (Admin only)
  const resetModal = document.getElementById('resetCycleModal');
  document.getElementById('btnResetCycleModal')?.addEventListener('click', () => {
    resetModal.classList.remove('hidden');
  });
  document.getElementById('btnCloseResetModal').addEventListener('click', () => {
    resetModal.classList.add('hidden');
  });
  document.getElementById('btnCancelResetModal').addEventListener('click', () => {
    resetModal.classList.add('hidden');
  });

  document.getElementById('btnConfirmResetCycle').addEventListener('click', async () => {
    const loc = document.getElementById('resetFilterLocation').value;
    const abc = document.getElementById('resetFilterAbc').value;

    try {
      const res = await fetch('/api/inventory/reset-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: loc, abcClass: abc })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Ciclo reiniciado: ${data.resetCount} productos listos para nuevo conteo`, 'success');
        resetModal.classList.add('hidden');
        loadInventory();
        loadAnalytics();
      }
    } catch (err) {
      showToast('Error al reiniciar ciclo: ' + err.message, 'error');
    }
  });

  document.getElementById('btnSaveMapping')?.addEventListener('click', saveMappingToServer);

  document.getElementById('btnCreateSampleExcel')?.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/config/create-sample', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        loadAppConfig();
        loadInventory();
        loadAnalytics();
      }
    } catch (err) {
      showToast('Error al generar plantilla: ' + err.message, 'error');
    }
  });

  document.getElementById('btnCopyUrl')?.addEventListener('click', () => {
    const url = document.getElementById('mobileAccessUrl').textContent;
    navigator.clipboard.writeText(url).then(() => {
      showToast('URL copiada al portapapeles', 'info');
    });
  });

  // Drag and drop / File Upload
  const dropZone = document.getElementById('fileDropZone');
  const fileInput = document.getElementById('excelFileInput');

  if (dropZone && fileInput) {
    document.getElementById('btnBrowseFile').addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('click', (e) => {
      if (e.target !== document.getElementById('btnBrowseFile')) {
        fileInput.click();
      }
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileUpload(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        handleFileUpload(fileInput.files[0]);
      }
    });
  }

  // =========================================================================
  // ASSIGN CYCLE TO AUXILIAR EVENT LISTENERS (ENCARGADOS)
  // =========================================================================
  document.getElementById('btnOpenAssignModal')?.addEventListener('click', openAssignCycleModal);
  document.getElementById('btnCloseAssignModal')?.addEventListener('click', () => {
    document.getElementById('assignCycleModal').classList.add('hidden');
  });
  document.getElementById('btnCancelAssignModal')?.addEventListener('click', () => {
    document.getElementById('assignCycleModal').classList.add('hidden');
  });
  document.getElementById('assignCycleForm')?.addEventListener('submit', handleAssignCycleSubmit);

  // =========================================================================
  // DIGITAL SIGNATURE & CONCLUSION EVENT LISTENERS
  // =========================================================================
  document.getElementById('btnOpenSignatureModal')?.addEventListener('click', openSignatureModal);
  document.getElementById('btnCloseSignatureModal')?.addEventListener('click', () => {
    document.getElementById('signatureModal').classList.add('hidden');
  });
  document.getElementById('btnCancelSignatureModal')?.addEventListener('click', () => {
    document.getElementById('signatureModal').classList.add('hidden');
  });
  document.getElementById('btnSubmitSignatureAndConclude')?.addEventListener('click', handleSignatureSubmit);

  // Initialize Canvas Pad
  initSignaturePad();
}

function openLoginModal() {
  const modal = document.getElementById('loginModal');
  modal.classList.remove('hidden');
  const centroSelect = document.getElementById('loginCentroSelect');
  if (centroSelect) {
    centroSelect.value = state.currentCentro;
    updateLoginQuickUsers(state.currentCentro);
  }
  document.getElementById('loginUsernameInput').value = '';
  document.getElementById('loginPasswordInput').value = '';
  document.getElementById('loginUsernameInput').focus();
}

async function handleFileUpload(file) {
  if (!file.name.match(/\.(xlsx|xlsm|xls)$/i)) {
    showToast('Por favor selecciona un archivo de Excel válido (.xlsx, .xlsm)', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('excelFile', file);
  showToast('Subiendo y vinculando archivo Excel...', 'info');

  try {
    const res = await fetch('/api/config/upload-excel', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      showToast('Archivo Excel vinculado exitosamente', 'success');
      loadAppConfig();
      loadInventory();
      loadAnalytics();
    } else {
      throw new Error(data.error);
    }
  } catch (err) {
    showToast('Error al procesar archivo Excel: ' + err.message, 'error');
  }
}

// Toast Notifications Helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  let icon = 'fa-solid fa-circle-info';
  if (type === 'success') icon = 'fa-solid fa-circle-check text-green';
  if (type === 'error') icon = 'fa-solid fa-triangle-exclamation text-red';

  toast.innerHTML = `<i class="${icon}"></i> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =============================================================================
// Cycle Assignment Controller (Encargados Only)
// =============================================================================
async function openAssignCycleModal() {
  const modal = document.getElementById('assignCycleModal');
  if (!modal) return;

  document.getElementById('assignModalCentroText').textContent = state.currentCentro;
  const select = document.getElementById('assignAuxiliarSelect');
  select.innerHTML = '<option value="">Cargando auxiliares del centro...</option>';

  try {
    const res = await fetch(`/api/auth/users/all?centro=${state.currentCentro}`);
    const data = await res.json();
    if (data.success) {
      select.innerHTML = '';
      const auxiliares = data.users.filter(u => u.cargo === 'AUXILIAR');
      if (auxiliares.length === 0) {
        select.innerHTML = '<option value="">No hay auxiliares registrados en este centro</option>';
      } else {
        auxiliares.forEach(aux => {
          const opt = document.createElement('option');
          opt.value = aux.id;
          opt.textContent = `${aux.nombre} (@${aux.usuario})`;
          opt.dataset.name = aux.nombre;
          opt.dataset.login = aux.usuario;
          if (state.currentAssignment?.assignedToUserId === aux.id) {
            opt.selected = true;
          }
          select.appendChild(opt);
        });
      }
    }
  } catch (err) {
    select.innerHTML = '<option value="">Error al cargar auxiliares</option>';
  }

  modal.classList.remove('hidden');
}

async function handleAssignCycleSubmit(e) {
  e.preventDefault();
  const select = document.getElementById('assignAuxiliarSelect');
  const selectedOpt = select.options[select.selectedIndex];
  if (!selectedOpt || !selectedOpt.value) {
    showToast('Selecciona un auxiliar para asignar el inventario.', 'error');
    return;
  }

  const assignedToUserId = selectedOpt.value;
  const assignedToUserName = selectedOpt.dataset.name || selectedOpt.textContent;
  const assignedToUserLogin = selectedOpt.dataset.login || '';
  const notes = document.getElementById('assignNotesInput')?.value || '';

  try {
    const res = await fetch('/api/assignments/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        centro: state.currentCentro,
        assignedToUserId,
        assignedToUserName,
        assignedToUserLogin,
        assignedByUserName: state.currentUser?.nombre || 'Encargado',
        notes
      })
    });

    const data = await res.json();
    if (data.success) {
      sfx.saveSuccess();
      showToast(`✓ Cíclico asignado exitosamente a ${assignedToUserName}`, 'success');
      document.getElementById('assignCycleModal').classList.add('hidden');
      loadInventory();
    } else {
      throw new Error(data.error);
    }
  } catch (err) {
    showToast('Error al asignar cíclico: ' + err.message, 'error');
  }
}

// =============================================================================
// Digital Signature Pad Controller & Excel Conclusion
// =============================================================================
const signatureState = {
  isDrawing: false,
  hasStrokes: false,
  canvas: null,
  ctx: null
};

function initSignaturePad() {
  const canvas = document.getElementById('digitalSignaturePad');
  if (!canvas) return;
  signatureState.canvas = canvas;
  signatureState.ctx = canvas.getContext('2d');

  function setupCanvasResolution() {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 500;
    canvas.width = width;
    canvas.height = 180;

    const ctx = signatureState.ctx;
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    clearSignatureCanvas();
  }

  window.addEventListener('resize', setupCanvasResolution);
  setTimeout(setupCanvasResolution, 250);

  function getCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function startDrawing(e) {
    signatureState.isDrawing = true;
    const coords = getCoordinates(e);
    const ctx = signatureState.ctx;
    ctx.beginPath();
    ctx.moveTo(coords.x, coords.y);
    signatureState.hasStrokes = true;
    document.querySelector('.canvas-wrapper')?.classList.add('has-strokes');
  }

  function draw(e) {
    if (!signatureState.isDrawing) return;
    if (e.cancelable) e.preventDefault();
    const coords = getCoordinates(e);
    const ctx = signatureState.ctx;
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
  }

  function stopDrawing() {
    if (signatureState.isDrawing) {
      signatureState.ctx.closePath();
      signatureState.isDrawing = false;
    }
  }

  // Mouse Events
  canvas.addEventListener('mousedown', startDrawing);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDrawing);
  canvas.addEventListener('mouseleave', stopDrawing);

  // Touch Events (Mobile/Tablet)
  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDrawing);

  // Clear button
  document.getElementById('btnClearSignaturePad')?.addEventListener('click', clearSignatureCanvas);
}

function clearSignatureCanvas() {
  if (!signatureState.canvas || !signatureState.ctx) return;
  signatureState.ctx.clearRect(0, 0, signatureState.canvas.width, signatureState.canvas.height);
  signatureState.hasStrokes = false;
  document.querySelector('.canvas-wrapper')?.classList.remove('has-strokes');
}

function openSignatureModal() {
  const modal = document.getElementById('signatureModal');
  if (!modal) return;

  const total = state.inventory.length;
  const counted = state.inventory.filter(i => i.physicalStock !== null).length;
  const pct = total > 0 ? Math.round((counted / total) * 100) : 0;

  document.getElementById('signCentroCodeText').textContent = state.currentCentro;
  document.getElementById('signOperatorNameText').textContent = state.currentUser?.nombre || state.currentUser?.usuario || 'Operador';
  document.getElementById('signOperatorCargoText').textContent = `${state.currentUser?.cargo || 'AUXILIAR'} • Centro ${state.currentCentro}`;
  document.getElementById('signCountProgressText').textContent = `${counted} de ${total} productos contados (${pct}%)`;
  document.getElementById('signTimestampText').textContent = new Date().toISOString().replace('T', ' ').substring(0, 16);

  clearSignatureCanvas();
  modal.classList.remove('hidden');
}

async function handleSignatureSubmit() {
  if (!signatureState.hasStrokes) {
    sfx.warning();
    showToast('⚠️ Por favor estampa tu firma digital en el recuadro antes de continuar.', 'error');
    return;
  }

  const btn = document.getElementById('btnSubmitSignatureAndConclude');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando firma en Excel...';

  const signatureBase64 = signatureState.canvas.toDataURL('image/png');
  const notes = document.getElementById('signatureNotesInput')?.value || '';

  try {
    const res = await fetch('/api/assignments/conclude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        centro: state.currentCentro,
        signatureBase64,
        operatorName: state.currentUser?.nombre || state.currentUser?.usuario || 'Operador',
        operatorRole: state.currentUser?.cargo || 'AUXILIAR',
        notes
      })
    });

    const data = await res.json();
    if (data.success) {
      sfx.saveSuccess();
      showToast('🎉 ¡Inventario Cíclico CONCLUIDO y FIRMADO con éxito en Excel!', 'success');
      document.getElementById('signatureModal').classList.add('hidden');
      loadInventory();
      loadAnalytics();
    } else {
      throw new Error(data.error || 'Error al guardar firma en Excel');
    }
  } catch (err) {
    sfx.error();
    showToast('Error al concluir ciclo: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-file-signature"></i> GUARDAR FIRMA Y CONCLUIR EN EXCEL';
  }
}
