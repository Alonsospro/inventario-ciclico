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

  notifyCycle() {
    this.playBeep(587.33, 'sine', 0.12);
    setTimeout(() => this.playBeep(880, 'sine', 0.15), 110);
    setTimeout(() => this.playBeep(1174.66, 'sine', 0.22), 220);
  }
}

const sfx = new SoundFX();

// Main App State
const state = {
  config: null,
  inventory: [],
  currentInventoryType: 'ciclico',
  inventoryTasks: [],
  isCountingSheetOpen: false,
  currentUser: null,
  currentCentro: '1300',
  centrosList: [],
  usersList: [],
  pendingModifyItem: null,
  damagedStock: {},
  damagedPhotos: {},
  multiLocations: {},
  activeMultiLocItem: null,
  camera: {
    stream: null,
    facingMode: 'environment',
    activeItem: null,
    capturedBlob: null,
    rowElem: null,
    cameraBtn: null
  },
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
  initEventListeners();
  loadCentrosList().then(() => {
    initAuth();
  });
});

// Tab Switching
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');

      // Check role restriction for Auxiliar
      if (tab.classList.contains('admin-only') && state.currentUser?.cargo === 'AUXILIAR') {
        showToast('Esta sección está reservada exclusivamente para Encargados y Administradores', 'error');
        return;
      }      // Check role restriction for Centros & Justifications Tabs (ADMIN only)
      if ((targetId === 'centros-tab' || targetId === 'justifications-tab') && state.currentUser?.cargo !== 'ADMIN') {
        showToast('Acceso restringido: Esta sección es de uso exclusivo para Administradores.', 'error');
        return;
      }

      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const panel = document.getElementById(targetId);
      if (panel) panel.classList.add('active');

      if (targetId === 'dashboard-tab') {
        loadAnalytics();
      }
      if (targetId === 'history-tab') {
        loadCycleHistory();
      }
      if (targetId === 'justifications-tab') {
        loadJustificationsData();
      }
      if (targetId === 'users-tab') {
        loadUsersList();
      }
      if (targetId === 'centros-tab') {
        loadCentrosList();
      }
      if (targetId === 'inventory-tab') {
        if (!state.isCountingSheetOpen) {
          loadInventoryTasksSummary();
        } else {
          loadInventory();
        }
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
  let savedCentro = localStorage.getItem('cyclic_active_centro') || '1300';
  if (savedCentro === 'TODOS') savedCentro = '1300';
  state.currentCentro = savedCentro;

  if (savedUser) {
    try {
      state.currentUser = JSON.parse(savedUser);
      if (state.currentUser.cargo === 'ADMIN') {
        state.currentCentro = savedCentro && savedCentro !== 'TODOS' ? savedCentro : '1300';
      } else {
        state.currentCentro = state.currentUser.centro || savedCentro;
      }
    } catch (e) {
      state.currentUser = null;
    }
  } else {
    state.currentUser = null;
  }

  // If no user is logged in, show direct login modal immediately
  if (!state.currentUser) {
    updateUserProfileUI();
    applyRolePermissions();
    openLoginModal(true);
    return;
  }

  updateUserProfileUI();
  applyRolePermissions();
  loadAppConfig().then(() => {
    loadInventoryTasksSummary();
    loadUsersList();
    renderCentrosPortal(state.centrosList);
    if (state.currentUser?.cargo === 'ADMIN') {
      loadAnalytics();
      loadCycleHistory();
      loadJustificationsData();
    } else if (state.currentUser?.cargo === 'ENCARGADO') {
      loadAnalytics();
      loadCycleHistory();
    } else if (state.currentUser?.cargo === 'AUXILIAR') {
      checkAndShowAuxiliarAssignedAlert(state.currentUser, state.currentCentro, false);
    }
  });
}

function applyRolePermissions() {
  const user = state.currentUser;
  const isAuxiliar = user?.cargo === 'AUXILIAR';
  const isEncargado = user?.cargo === 'ENCARGADO';
  const isAdmin = user?.cargo === 'ADMIN';
  const isAlonsoSuperAdmin = isAdmin && user?.usuario?.toUpperCase() === 'ALONSO';

  // CSS Body role classes
  document.body.classList.toggle('role-auxiliar', isAuxiliar);
  document.body.classList.toggle('role-encargado', isEncargado);
  document.body.classList.toggle('role-admin', isAdmin);
  document.body.classList.toggle('is-superadmin', isAlonsoSuperAdmin);

  // Tab visibility controls:
  // - Centros Tab & Justifications Tab: ONLY for Admin
  const navCentrosBtn = document.getElementById('navCentrosBtn');
  if (navCentrosBtn) {
    navCentrosBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  }
  const navJustificationsBtn = document.getElementById('navJustificationsBtn');
  if (navJustificationsBtn) {
    navJustificationsBtn.style.display = isAdmin ? 'inline-flex' : 'none';
  }
  const btnNavViewCentros = document.getElementById('btnNavViewCentros');
  if (btnNavViewCentros) {
    btnNavViewCentros.style.display = isAdmin ? 'flex' : 'none';
  }

  // - Add Operator Modal button: ONLY for Super Admin ALONSO
  const btnAddUser = document.getElementById('btnOpenAddUserModal');
  if (btnAddUser) {
    btnAddUser.style.display = isAlonsoSuperAdmin ? 'inline-flex' : 'none';
  }

  // If Encargado or Auxiliar, strictly lock active Centro to their assigned Centro
  if ((isEncargado || isAuxiliar) && user?.centro && user.centro !== 'TODOS') {
    state.currentCentro = String(user.centro);
    localStorage.setItem('cyclic_active_centro', state.currentCentro);
  }

  // Auto-switch tab if current active tab is unauthorized
  const activeTab = document.querySelector('.nav-tab.active');
  const activeTabId = activeTab?.getAttribute('data-tab');
  if (isAuxiliar && activeTabId !== 'inventory-tab') {
    switchTab('inventory-tab');
  } else if (isEncargado && (activeTabId === 'centros-tab' || activeTabId === 'justifications-tab')) {
    switchTab('inventory-tab');
  }

  const curCentro = state.currentCentro || '1300';
  const activeCentroTxt = document.getElementById('navActiveCentroText');
  if (activeCentroTxt) activeCentroTxt.textContent = curCentro;
  const conteoTitle = document.getElementById('conteoCurrentCentroTitle');
  if (conteoTitle) conteoTitle.textContent = `Centro ${curCentro}`;
  const usersTitle = document.getElementById('usersCurrentCentroTitle');
  if (usersTitle) usersTitle.textContent = `Centro ${curCentro}`;
  const statCentroCode = document.getElementById('userStatCentroCode');
  if (statCentroCode) statCentroCode.textContent = curCentro;
  const historyTitle = document.getElementById('historyCurrentCentroTitle');
  if (historyTitle) historyTitle.textContent = `Centro ${curCentro}`;
  const historyBadge = document.getElementById('historyCentroCodeText');
  if (historyBadge) historyBadge.textContent = curCentro;
}

function updateUserProfileUI() {
  const avatar = document.getElementById('navUserAvatar');
  const nameElem = document.getElementById('navUserName');
  const roleElem = document.getElementById('navUserRole');

  if (!state.currentUser) {
    if (avatar) {
      avatar.textContent = '?';
      avatar.style.backgroundColor = '#64748b';
    }
    if (nameElem) nameElem.textContent = 'Iniciar Sesión';
    if (roleElem) roleElem.textContent = 'Sin autenticar';
    return;
  }

  const u = state.currentUser;

  if (avatar) {
    avatar.textContent = (u.nombre || u.usuario || 'U').charAt(0).toUpperCase();
    avatar.style.backgroundColor = u.avatarColor || '#3b82f6';
  }

  if (nameElem) nameElem.textContent = u.nombre || u.usuario;
  
  const roleLabel = `${u.cargo} • Centro ${u.centro || state.currentCentro}`;
  if (roleElem) roleElem.textContent = roleLabel;

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
  if (state.currentUser?.cargo !== 'ADMIN') {
    showToast(`Acceso restringido: Solo tienes autorización para gestionar el Centro ${state.currentUser?.centro || '1300'}`, 'error');
    return;
  }

  state.currentCentro = String(centroCode);
  localStorage.setItem('cyclic_active_centro', state.currentCentro);
  
  showToast(`Centro de trabajo cambiado a: Centro ${centroCode}`, 'success');
  applyRolePermissions();
  renderCentrosPortal(state.centrosList);

  switchTab('inventory-tab');
  loadInventoryTasksSummary();
  if (state.isCountingSheetOpen) {
    loadInventory();
  }
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
        let icon = '';
        if (u.cargo === 'ADMIN') icon = '<i class="fa-solid fa-crown text-amber"></i> ';
        else if (u.cargo === 'ENCARGADO') icon = '<i class="fa-solid fa-user-shield text-primary"></i> ';
        chip.innerHTML = `${icon}${escapeHtml(u.usuario)}`;
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
    if (nameElem) {
      nameElem.textContent = 'Google Sheets (Nube)';
    }
    const sheetElem = document.getElementById('activeSheetTag');
    if (sheetElem) sheetElem.textContent = data.activeSheetName || '1300';

    updateBlindCountUI(data.blindCount);
  } catch (err) {
    console.warn('Backend config init notice:', err.message);
  }
}

// =============================================================================
// Multi-Inventory Task Blocks Controller (Cíclicos, Semanales, Mensuales, Barridos)
// =============================================================================
async function loadInventoryTasksSummary() {
  const container = document.getElementById('inventoryTasksGrid');
  const titleElem = document.getElementById('tasksCentroTitle');
  const codeElem = document.getElementById('tasksCentroCodeText');

  const centro = state.currentCentro || '1300';
  if (titleElem) titleElem.textContent = `Centro ${centro}`;
  if (codeElem) codeElem.textContent = centro;

  if (container) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; color: var(--text-secondary);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary); margin-bottom: 12px;"></i>
        <p>Cargando controles de inventario del Centro ${centro}...</p>
      </div>
    `;
  }

  try {
    const res = await fetch(`/api/inventory/tasks-summary?centro=${encodeURIComponent(centro)}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.tasks)) {
      state.inventoryTasks = data.tasks;
      renderInventoryTasksDashboard(data.tasks);
    }
  } catch (err) {
    if (container) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 30px 20px; background: var(--bg-surface); border-radius: 12px; border: 1px dashed var(--border-subtle);">
          <i class="fa-solid fa-triangle-exclamation text-amber" style="font-size: 2.2rem; margin-bottom: 10px;"></i>
          <h3>Error al cargar las tareas de inventario</h3>
          <p class="text-secondary" style="font-size: 0.88rem;">${escapeHtml(err.message)}</p>
          <button class="btn btn-primary btn-sm mt-3" onclick="loadInventoryTasksSummary()"><i class="fa-solid fa-rotate"></i> Reintentar</button>
        </div>
      `;
    }
  }
}

function renderInventoryTasksDashboard(tasks) {
  const container = document.getElementById('inventoryTasksGrid');
  if (!container) return;
  container.innerHTML = '';

  const isEncargadoOrAdmin = state.currentUser && (state.currentUser.cargo === 'ENCARGADO' || state.currentUser.cargo === 'ADMIN');

  tasks.forEach(task => {
    const asg = task.assignment || {};
    const sum = task.summary || {};
    const isCompleted = asg.status === 'CONCLUIDO';
    const isAssigned = asg.status === 'ASIGNADO';

    const total = sum.totalItems || 0;
    const counted = sum.countedItems || 0;
    const pending = sum.pendingItems || (total - counted);
    const progress = total > 0 ? Math.min(100, Math.round((counted / total) * 100)) : 0;
    const ira = sum.iraPercentage !== undefined ? `${sum.iraPercentage}%` : '100%';

    let statusBadge = '<span class="status-badge" style="background: rgba(148, 163, 184, 0.15); color: var(--text-secondary); padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;"><i class="fa-regular fa-clock"></i> Sin Asignar</span>';
    if (isCompleted) {
      statusBadge = '<span class="status-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;"><i class="fa-solid fa-circle-check"></i> Concluido ✓</span>';
    } else if (isAssigned) {
      statusBadge = '<span class="status-badge" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: 600;"><i class="fa-solid fa-spinner fa-spin"></i> En Progreso</span>';
    }

    const card = document.createElement('div');
    card.className = 'inventory-task-card';
    card.innerHTML = `
      <div class="task-card-accent-bar task-card-accent-${escapeHtml(task.type)}"></div>
      
      <div class="task-card-header">
        <div class="task-card-icon-box task-icon-${escapeHtml(task.type)}">
          <i class="fa-solid ${escapeHtml(task.icon || 'fa-boxes-stacked')}"></i>
        </div>
        <div class="task-card-title-wrap">
          <h3 class="task-card-title">${escapeHtml(task.name)}</h3>
          <span class="task-card-file" title="Archivo en Drive: ${escapeHtml(task.fileTitle)}">
            <i class="fa-brands fa-google-drive text-green"></i> ${escapeHtml(task.fileTitle)}
          </span>
        </div>
      </div>

      <div class="task-card-body">
        <div class="task-card-assignment-row">
          <div class="task-card-assignment-info">
            <i class="fa-solid fa-user-tag text-primary"></i>
            <span>Responsable: <strong>${escapeHtml(asg.assignedToUserName || 'Sin asignar')}</strong></span>
          </div>
          ${statusBadge}
        </div>

        <div class="task-progress-box">
          <div class="task-progress-labels">
            <span>Avance de conteo</span>
            <strong>${progress}% (${counted} / ${total})</strong>
          </div>
          <div class="task-progress-track">
            <div class="task-progress-bar" style="width: ${progress}%; background: ${escapeHtml(task.color || '#4f46e5')};"></div>
          </div>
        </div>

        <div class="task-metrics-mini-grid">
          <div class="task-metric-mini-chip">
            <span class="lbl">Total</span>
            <span class="val">${total}</span>
          </div>
          <div class="task-metric-mini-chip">
            <span class="lbl">Pendientes</span>
            <span class="val text-amber">${pending}</span>
          </div>
          <div class="task-metric-mini-chip">
            <span class="lbl">Exactitud</span>
            <span class="val text-green">${ira}</span>
          </div>
        </div>
      </div>

      <div class="task-card-footer">
        ${isEncargadoOrAdmin ? `
          <button class="btn btn-outline btn-sm btn-assign-task" data-type="${escapeHtml(task.type)}" title="Asignar auxiliar para ${escapeHtml(task.name)}">
            <i class="fa-solid fa-user-check"></i> Asignar
          </button>
        ` : ''}
        <button class="btn btn-primary btn-sm btn-open-task" data-type="${escapeHtml(task.type)}" style="flex: 1; justify-content: center;">
          <i class="fa-solid fa-arrow-right-to-bracket"></i> Abrir y Contar
        </button>
      </div>
    `;

    card.querySelector('.btn-open-task')?.addEventListener('click', () => {
      if (task.type === 'barrido') {
        openBarridoCountingEnvironment();
      } else {
        openInventoryCountingSheet(task.type);
      }
    });

    card.querySelector('.btn-assign-task')?.addEventListener('click', () => {
      openAssignCycleModal(task.type);
    });

    container.appendChild(card);
  });
}

function openInventoryCountingSheet(type = 'ciclico') {
  if (type === 'barrido') {
    openBarridoCountingEnvironment();
    return;
  }

  state.currentInventoryType = type;
  state.isCountingSheetOpen = true;

  const dashboardView = document.getElementById('inventoryTasksDashboardView');
  const sheetView = document.getElementById('inventoryCountingSheetView');
  const barridoView = document.getElementById('barridoCountingView');
  if (dashboardView) dashboardView.classList.add('hidden');
  if (barridoView) barridoView.classList.add('hidden');
  if (sheetView) sheetView.classList.remove('hidden');

  // Update Breadcrumb and Header Tag
  const meta = (state.inventoryTasks && state.inventoryTasks.find(t => t.type === type)) || {
    name: type.toUpperCase(),
    fileTitle: `${type.toUpperCase()} NIBOL MULTIMARCAS`,
    badgeClass: `badge-${type}`,
    icon: 'fa-boxes-stacked'
  };

  const badgeElem = document.getElementById('activeTaskTypeBadge');
  if (badgeElem) {
    badgeElem.className = `badge badge-task-type ${meta.badgeClass || `badge-${type}`}`;
    badgeElem.innerHTML = `<i class="fa-solid ${meta.icon || 'fa-boxes-stacked'}"></i> ${escapeHtml(meta.name || type)}`;
  }

  const fileElem = document.getElementById('activeTaskFileTitle');
  if (fileElem) fileElem.textContent = meta.fileTitle || `${type.toUpperCase()} NIBOL MULTIMARCAS`;

  // Load Inventory for this specific type
  loadInventory();
}

function closeInventoryCountingSheet() {
  state.isCountingSheetOpen = false;

  const dashboardView = document.getElementById('inventoryTasksDashboardView');
  const sheetView = document.getElementById('inventoryCountingSheetView');
  const barridoView = document.getElementById('barridoCountingView');
  if (sheetView) sheetView.classList.add('hidden');
  if (barridoView) barridoView.classList.add('hidden');
  if (dashboardView) dashboardView.classList.remove('hidden');

  loadInventoryTasksSummary();
}

async function loadInventory() {
  try {
    const query = new URLSearchParams();
    const searchVal = document.getElementById('invSearchInput')?.value;
    const locVal = document.getElementById('invLocationFilter')?.value;
    const abcVal = document.getElementById('invAbcFilter')?.value;
    const statusVal = document.getElementById('invStatusFilter')?.value;

    query.append('centro', state.currentCentro || '1300');
    query.append('type', state.currentInventoryType || 'ciclico');
    if (state.currentUser) {
      query.append('userId', state.currentUser.id || '');
      query.append('userCargo', state.currentUser.cargo || 'AUXILIAR');
      query.append('userName', state.currentUser.nombre || state.currentUser.usuario || '');
      query.append('userLogin', state.currentUser.usuario || '');
      query.append('userCentro', state.currentUser.centro || '');
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
    console.warn('Error in loadInventory:', err.message);
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
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">No se encontraron productos con los filtros seleccionados.</td></tr>`;
    return;
  }

  items.forEach((item, index) => {
    const tr = document.createElement('tr');
    const isCounted = item.physicalStock !== null && item.physicalStock !== undefined;
    tr.className = isCounted ? 'row-counted' : 'row-pending';
    tr.id = `row-${item.sku}`;

    const countVal = isCounted ? item.physicalStock : '';
    const damagedVal = item.damagedStock !== undefined && item.damagedStock !== null 
      ? item.damagedStock 
      : (state.damagedStock[item.sku] !== undefined ? state.damagedStock[item.sku] : '');

    const hasDamaged = Number(damagedVal) > 0;
    const itemPhotos = state.damagedPhotos[item.sku] || [];
    const hasPhoto = itemPhotos.length > 0;

    // Check multi-location status
    const itemLocs = state.multiLocations[item.sku] || parseLocationsFromString(item.location, item.physicalStock, item.damagedStock);
    const hasMultiLoc = itemLocs && itemLocs.length > 1;

    let locHtml = '';
    if (hasMultiLoc) {
      const breakdownHtml = itemLocs.map(l => 
        `<div class="multi-loc-dropdown-item"><span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(l.location)}</span> <strong>${l.physicalQty || 0} uds ${l.damagedQty > 0 ? `(ME: ${l.damagedQty})` : ''}</strong></div>`
      ).join('');

      locHtml = `
        <div class="multi-location-chip btn-open-multiloc" data-sku="${escapeHtml(item.sku)}" title="Gestionar múltiples ubicaciones">
          <i class="fa-solid fa-map-location-dot"></i>
          <span>${itemLocs.length} Ubicaciones</span>
          <i class="fa-solid fa-chevron-down" style="font-size: 0.65rem; opacity: 0.7;"></i>
          <div class="multi-loc-breakdown-dropdown hidden">
            ${breakdownHtml}
          </div>
        </div>
      `;
    } else {
      const displayLoc = (itemLocs && itemLocs[0] && itemLocs[0].location) ? itemLocs[0].location : (item.location || 'Sin Ubic');
      locHtml = `
        <div class="location-clickable-tag btn-open-multiloc" data-sku="${escapeHtml(item.sku)}" title="Clic para agregar otra ubicación">
          <i class="fa-solid fa-location-dot"></i>
          <span>${escapeHtml(displayLoc)}</span>
          <i class="fa-solid fa-plus add-loc-icon" title="Agregar otra ubicación"></i>
        </div>
      `;
    }

    // Photo evidence button / thumbnail HTML
    let photoHtml = '';
    if (hasPhoto) {
      const firstPhoto = itemPhotos[0];
      photoHtml = `
        <img src="${firstPhoto.url || firstPhoto.driveUrl}" class="photo-mini-thumb" data-sku="${escapeHtml(item.sku)}" title="Ver foto en pantalla completa" alt="Foto">
      `;
    }

    tr.innerHTML = `
      <td class="cell-sku">
        <span class="mobile-label">SKU:</span>
        <strong class="font-mono text-primary">${escapeHtml(item.sku)}</strong>
      </td>
      <td class="cell-desc">
        <div class="product-title">${escapeHtml(item.description)}</div>
        <div class="product-barcode text-muted"><i class="fa-solid fa-barcode"></i> ${escapeHtml(item.barcode)}</div>
      </td>
      <td class="cell-location">
        <span class="mobile-label">Ubicación:</span>
        ${locHtml}
      </td>
      <td class="cell-abc text-center">
        <span class="mobile-label">Clase:</span>
        <span class="tag tag-abc">${escapeHtml(item.abcClass)}</span>
      </td>
      
      <!-- Input de conteo físico -->
      <td class="cell-count text-center">
        <div class="quick-count-cell">
          <input 
            type="number" 
            inputmode="numeric"
            pattern="[0-9]*"
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
            tabindex="${index * 2 + 1}"
            ${isCounted ? 'readonly' : ''}
          >
          ${isCounted ? `<button class="btn-edit-direct" data-sku="${escapeHtml(item.sku)}" title="Modificar conteo"><i class="fa-solid fa-pen"></i></button>` : ''}
        </div>
      </td>

      <!-- Input de Mal Estado -->
      <td class="cell-damaged text-center">
        <input 
          type="number" 
          inputmode="numeric"
          pattern="[0-9]*"
          class="quick-damaged-input ${hasDamaged ? 'has-damaged' : ''}" 
          id="damaged-input-${item.sku}"
          data-sku="${escapeHtml(item.sku)}"
          value="${damagedVal}"
          placeholder="0"
          min="0"
          step="1"
          tabindex="${index * 2 + 2}"
          ${isCounted ? 'readonly' : ''}
          title="Ítems en mal estado / averiados"
        >
      </td>

      <!-- Botón de Evidencia Fotográfica -->
      <td class="cell-evidence text-center">
        <div class="cell-photo-wrapper" id="photo-wrapper-${item.sku}">
          ${photoHtml}
          <button 
            type="button" 
            class="btn-damaged-photo ${hasPhoto ? 'has-photo' : (hasDamaged ? 'highlight-prompt' : '')}" 
            id="btn-camera-${item.sku}"
            data-sku="${escapeHtml(item.sku)}"
            title="${hasPhoto ? 'Foto de respaldo cargada en Drive' : (hasDamaged ? '¡Ítem con mal estado! Clic para subir foto a Drive' : 'Subir foto de respaldo')}"
          >
            <i class="fa-solid fa-camera"></i>
            ${hasPhoto ? `<span class="photo-count-badge">${itemPhotos.length}</span>` : ''}
          </button>
          <input type="file" accept="image/*" capture="environment" id="damaged-file-${item.sku}" style="display:none;">
        </div>
      </td>

      <!-- Caja de Confirmación -->
      <td class="cell-action text-center">
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

    // Elements
    const inputElem = tr.querySelector(`#count-input-${item.sku}`);
    const damagedElem = tr.querySelector(`#damaged-input-${item.sku}`);
    const cameraBtn = tr.querySelector(`#btn-camera-${item.sku}`);
    const fileInput = tr.querySelector(`#damaged-file-${item.sku}`);
    const confirmBtn = tr.querySelector(`#btn-confirm-${item.sku}`);
    const editBtn = tr.querySelector('.btn-edit-direct');
    const multilocBtn = tr.querySelector('.btn-open-multiloc');
    const photoThumb = tr.querySelector('.photo-mini-thumb');

    // Multi-location modal click
    if (multilocBtn) {
      multilocBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openMultiLocationModal(item);
      });
    }

    // Photo thumbnail click -> Lightbox
    if (photoThumb) {
      photoThumb.addEventListener('click', (e) => {
        e.stopPropagation();
        const photos = state.damagedPhotos[item.sku] || [];
        if (photos.length > 0) {
          openImageLightbox(photos[0].url || photos[0].driveUrl, `SKU: ${item.sku} - Mal Estado`, item.description);
        }
      });
    }

    // Damaged input change event: update prompt animation & state
    damagedElem.addEventListener('input', () => {
      const val = parseInt(damagedElem.value, 10) || 0;
      state.damagedStock[item.sku] = val;
      damagedElem.classList.toggle('has-damaged', val > 0);

      const photos = state.damagedPhotos[item.sku] || [];
      if (val > 0 && photos.length === 0) {
        cameraBtn.classList.add('highlight-prompt');
        cameraBtn.title = '¡Ítem con mal estado! Clic para abrir la cámara y tomar foto de respaldo';
      } else {
        cameraBtn.classList.remove('highlight-prompt');
      }
    });

    // Camera button click -> Open Live Camera Modal (Requests Camera Permission)
    cameraBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCameraCaptureModal(item, tr, cameraBtn);
    });

    // Input click if already confirmed -> prompt modify modal
    inputElem.addEventListener('click', () => {
      if (inputElem.getAttribute('data-confirmed') === 'true') {
        promptModifyConfirmation(item, inputElem, confirmBtn);
      }
    });

    inputElem.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        damagedElem.focus();
        damagedElem.select();
      }
    });

    damagedElem.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitInlineCount(item, inputElem, damagedElem, confirmBtn, index);
      }
    });

    // Confirmation button click
    confirmBtn.addEventListener('click', () => {
      if (confirmBtn.getAttribute('data-confirmed') === 'true') {
        promptModifyConfirmation(item, inputElem, confirmBtn);
      } else {
        submitInlineCount(item, inputElem, damagedElem, confirmBtn, index);
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
 * Helper to parse multi-location string like "PAS-01 (10) [ME: 2] | PAS-02 (5)"
 */
function parseLocationsFromString(locStr, defaultPhysical = 0, defaultDamaged = 0) {
  if (!locStr || typeof locStr !== 'string') {
    return [{ location: 'A-01', physicalQty: defaultPhysical || 0, damagedQty: defaultDamaged || 0 }];
  }

  if (locStr.includes(' | ')) {
    const parts = locStr.split(' | ');
    return parts.map(part => {
      const match = part.match(/^(.*?)(?:\s*\((\d+)\))?(?:\s*\[ME:\s*(\d+)\])?$/);
      if (match) {
        return {
          location: (match[1] || '').trim(),
          physicalQty: match[2] ? parseInt(match[2], 10) : 0,
          damagedQty: match[3] ? parseInt(match[3], 10) : 0
        };
      }
      return { location: part.trim(), physicalQty: 0, damagedQty: 0 };
    });
  }

  return [{ location: locStr.trim(), physicalQty: defaultPhysical || 0, damagedQty: defaultDamaged || 0 }];
}

// =============================================================================
// Live Camera Engine & Damaged Items Evidence System
// =============================================================================

/**
 * Open Live Camera Modal and Request Camera Access
 */
function openCameraCaptureModal(item, rowElem, cameraBtn) {
  state.camera.activeItem = item;
  state.camera.rowElem = rowElem;
  state.camera.cameraBtn = cameraBtn;
  state.camera.capturedBlob = null;
  state.camera.facingMode = 'environment';

  // Update modal header info
  const subtitle = document.getElementById('cameraItemSubtitle');
  if (subtitle) subtitle.textContent = `SKU: ${item.sku} • ${item.description || ''}`;

  const skuPill = document.getElementById('cameraSkuPill');
  if (skuPill) skuPill.textContent = item.sku;

  const itemName = document.getElementById('cameraItemName');
  if (itemName) itemName.textContent = item.description || 'Producto';

  const damagedVal = state.damagedStock[item.sku] !== undefined ? state.damagedStock[item.sku] : (item.damagedStock || 0);
  const badge = document.getElementById('cameraMalEstadoBadge');
  if (badge) badge.textContent = `${damagedVal} en Mal Estado`;

  // Reset controls
  document.getElementById('cameraLiveBar')?.classList.remove('hidden');
  document.getElementById('cameraReviewBar')?.classList.add('hidden');
  document.getElementById('cameraSnapshotPreview')?.classList.add('hidden');
  document.getElementById('cameraVideoFeed')?.classList.remove('hidden');
  document.getElementById('viewfinderGuides')?.classList.remove('hidden');
  document.getElementById('cameraErrorState')?.classList.add('hidden');

  // Open modal
  const modal = document.getElementById('cameraCaptureModal');
  if (modal) modal.classList.remove('hidden');

  // Start live video stream
  startLiveCameraStream(state.camera.facingMode);
}

/**
 * Start Camera Stream via navigator.mediaDevices.getUserMedia
 */
async function startLiveCameraStream(facingMode = 'environment') {
  stopCameraStream();

  const video = document.getElementById('cameraVideoFeed');
  const errorState = document.getElementById('cameraErrorState');
  const errorMsg = document.getElementById('cameraErrorMessage');
  const guides = document.getElementById('viewfinderGuides');

  if (errorState) errorState.classList.add('hidden');
  if (guides) guides.classList.remove('hidden');
  if (video) video.classList.remove('hidden');

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (errorState) errorState.classList.remove('hidden');
    if (errorMsg) errorMsg.textContent = 'Tu navegador o entorno no soporta captura directa de video. Usa la opción de seleccionar foto.';
    return;
  }

  try {
    const constraints = {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.camera.stream = stream;

    if (video) {
      video.srcObject = stream;
      await video.play();
    }
  } catch (err) {
    console.warn('Camera stream request error:', err);
    if (errorState) errorState.classList.remove('hidden');
    if (guides) guides.classList.add('hidden');
    if (video) video.classList.add('hidden');

    if (errorMsg) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg.textContent = 'Permiso denegado: Por favor habilita el permiso de cámara en tu navegador para capturar evidencia.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg.textContent = 'No se detectó ninguna cámara disponible en este dispositivo.';
      } else {
        errorMsg.textContent = `No se pudo iniciar la cámara (${err.message || 'Error desconocido'}). Puedes seleccionar una foto de tu galería.`;
      }
    }
  }
}

/**
 * Stop Video Stream and release hardware
 */
function stopCameraStream() {
  if (state.camera.stream) {
    state.camera.stream.getTracks().forEach(track => track.stop());
    state.camera.stream = null;
  }
  const video = document.getElementById('cameraVideoFeed');
  if (video) {
    video.srcObject = null;
  }
}

/**
 * Switch Camera Facing Mode (Front <-> Back)
 */
function switchCameraFacing() {
  state.camera.facingMode = state.camera.facingMode === 'environment' ? 'user' : 'environment';
  startLiveCameraStream(state.camera.facingMode);
}

/**
 * Capture Frame from Video Stream
 */
function takeCameraSnapshot() {
  const video = document.getElementById('cameraVideoFeed');
  const canvas = document.getElementById('cameraCanvas');
  const imgPreview = document.getElementById('cameraSnapshotPreview');
  const guides = document.getElementById('viewfinderGuides');

  if (!video || !canvas || !imgPreview) return;
  if (!video.videoWidth || !video.videoHeight) {
    showToast('La cámara aún se está inicializando. Intenta de nuevo en un segundo.', 'info');
    return;
  }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(blob => {
    state.camera.capturedBlob = blob;
    const url = URL.createObjectURL(blob);
    imgPreview.src = url;
    imgPreview.classList.remove('hidden');
    video.classList.add('hidden');
    if (guides) guides.classList.add('hidden');

    // Switch buttons to Review Mode
    document.getElementById('cameraLiveBar')?.classList.add('hidden');
    document.getElementById('cameraReviewBar')?.classList.remove('hidden');

    sfx.scanSuccess();
  }, 'image/jpeg', 0.92);
}

/**
 * Retake Snapshot
 */
function retakeCameraSnapshot() {
  state.camera.capturedBlob = null;
  const video = document.getElementById('cameraVideoFeed');
  const imgPreview = document.getElementById('cameraSnapshotPreview');
  const guides = document.getElementById('viewfinderGuides');

  if (imgPreview) imgPreview.classList.add('hidden');
  if (video) video.classList.remove('hidden');
  if (guides) guides.classList.remove('hidden');

  document.getElementById('cameraLiveBar')?.classList.remove('hidden');
  document.getElementById('cameraReviewBar')?.classList.add('hidden');
}

/**
 * Confirm and Upload Snapshot to Drive
 */
async function confirmAndUploadCameraSnapshot() {
  if (!state.camera.capturedBlob || !state.camera.activeItem) {
    showToast('No hay ninguna fotografía capturada para guardar.', 'error');
    return;
  }

  const uploadBtn = document.getElementById('btnConfirmUploadSnapshot');
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Subiendo a Google Drive...';
  }

  try {
    const item = state.camera.activeItem;
    const cameraBtn = state.camera.cameraBtn;
    const rowElem = state.camera.rowElem;

    const file = new File([state.camera.capturedBlob], `mal_estado_${item.sku}_${Date.now()}.jpg`, { type: 'image/jpeg' });
    await uploadDamagedPhotoForSku(item, file, cameraBtn, rowElem);

    closeCameraCaptureModal();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Guardar en Google Drive';
    }
  }
}

/**
 * Close Camera Modal
 */
function closeCameraCaptureModal() {
  stopCameraStream();
  document.getElementById('cameraCaptureModal')?.classList.add('hidden');
  state.camera.activeItem = null;
  state.camera.capturedBlob = null;
}

/**
 * Upload Damaged Photo to Backend and Google Drive
 */
async function uploadDamagedPhotoForSku(item, file, cameraBtn, rowElem) {
  if (cameraBtn) {
    cameraBtn.disabled = true;
    cameraBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  }

  try {
    const dateStr = new Date().toISOString().substring(0, 10);
    const formData = new FormData();
    formData.append('photo', file);
    formData.append('centro', state.currentCentro || '1300');
    formData.append('sku', item.sku);
    formData.append('date', dateStr);

    const res = await fetch('/api/inventory/upload-damaged-photo', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Error al subir foto de mal estado.');
    }

    state.damagedPhotos[item.sku] = state.damagedPhotos[item.sku] || [];
    state.damagedPhotos[item.sku].push({
      url: data.relativeUrl,
      driveUrl: data.googleDriveUrl,
      fileName: data.fileName
    });

    sfx.saveSuccess();
    showToast(`✓ Foto guardada directamente en Google Drive (Nibol/ciclicos/fotos)`, 'success');

    // Update row cell UI if rowElem is present
    if (rowElem) {
      const wrapper = rowElem.querySelector(`#photo-wrapper-${item.sku}`);
      if (wrapper) {
        const photoUrl = data.googleDriveUrl || data.relativeUrl;
        wrapper.innerHTML = `
          <img src="${photoUrl}" class="photo-mini-thumb" data-sku="${escapeHtml(item.sku)}" title="Ver foto en pantalla completa" alt="Foto">
          <button type="button" class="btn-damaged-photo has-photo" id="btn-camera-${item.sku}" data-sku="${escapeHtml(item.sku)}" title="Foto de respaldo cargada en Drive (Nibol/ciclicos/fotos)">
            <i class="fa-solid fa-camera"></i>
            <span class="photo-count-badge">${state.damagedPhotos[item.sku].length}</span>
          </button>
        `;

        // Re-attach listeners for new thumbnail & camera button
        const newThumb = wrapper.querySelector('.photo-mini-thumb');
        const newCamBtn = wrapper.querySelector(`#btn-camera-${item.sku}`);

        newThumb?.addEventListener('click', (e) => {
          e.stopPropagation();
          openImageLightbox(photoUrl, `SKU: ${item.sku} - Mal Estado`, item.description);
        });

        newCamBtn?.addEventListener('click', (e) => {
          e.stopPropagation();
          openCameraCaptureModal(item, rowElem, newCamBtn);
        });
      }
    }

  } catch (err) {
    sfx.error();
    showToast(err.message, 'error');
    console.error(err);
  } finally {
    if (cameraBtn) {
      cameraBtn.disabled = false;
    }
  }
}

/**
 * Open Multi-Location Modal
 */
function openMultiLocationModal(item) {
  state.activeMultiLocItem = item;

  const subtitle = document.getElementById('multiLocItemSubtitle');
  if (subtitle) {
    subtitle.textContent = `SKU: ${item.sku} • ${item.description || ''}`;
  }

  // Load existing locations or parse
  let rows = state.multiLocations[item.sku];
  if (!rows || rows.length === 0) {
    const rawPhysical = document.getElementById(`count-input-${item.sku}`)?.value;
    const rawDamaged = document.getElementById(`damaged-input-${item.sku}`)?.value;
    const pQty = rawPhysical !== '' && !isNaN(rawPhysical) ? parseInt(rawPhysical, 10) : (item.physicalStock || 0);
    const dQty = rawDamaged !== '' && !isNaN(rawDamaged) ? parseInt(rawDamaged, 10) : (item.damagedStock || 0);
    rows = parseLocationsFromString(item.location, pQty, dQty);
  }

  renderMultiLocModalRows(rows);
  updateMultiLocSummary();

  const modal = document.getElementById('multiLocationModal');
  if (modal) modal.classList.remove('hidden');
}

function renderMultiLocModalRows(rows = []) {
  const tbody = document.getElementById('multiLocRowsTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (rows.length === 0) {
    rows.push({ location: '', physicalQty: 0, damagedQty: 0 });
  }

  rows.forEach((r, idx) => {
    addMultiLocRowElement(r.location, r.physicalQty, r.damagedQty, idx);
  });
}

function addMultiLocRowElement(loc = '', physical = 0, damaged = 0, idx) {
  const tbody = document.getElementById('multiLocRowsTbody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.className = 'multi-loc-row';

  tr.innerHTML = `
    <td>
      <input type="text" class="form-control loc-name-input" value="${escapeHtml(loc)}" placeholder="Ej: PAS-01-A, EST-04..." style="padding: 8px 10px; font-weight: 600;">
    </td>
    <td class="text-center">
      <input type="number" min="0" step="1" class="form-control loc-physical-input text-center" value="${physical}" style="padding: 8px; font-weight: 700; color: var(--primary); font-family: var(--font-mono);">
    </td>
    <td class="text-center">
      <input type="number" min="0" step="1" class="form-control loc-damaged-input text-center" value="${damaged}" style="padding: 8px; font-weight: 700; color: #f59e0b; font-family: var(--font-mono);">
    </td>
    <td class="text-center">
      <button type="button" class="btn btn-outline btn-sm btn-delete-loc-row" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.4); padding: 4px 8px;" title="Quitar ubicación">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </td>
  `;

  // Listeners to recalculate in real-time
  const locInput = tr.querySelector('.loc-name-input');
  const pInput = tr.querySelector('.loc-physical-input');
  const dInput = tr.querySelector('.loc-damaged-input');
  const delBtn = tr.querySelector('.btn-delete-loc-row');

  [locInput, pInput, dInput].forEach(inp => {
    inp.addEventListener('input', updateMultiLocSummary);
  });

  delBtn.addEventListener('click', () => {
    const totalRows = tbody.querySelectorAll('.multi-loc-row').length;
    if (totalRows <= 1) {
      // Clear inputs instead of removing last row
      locInput.value = '';
      pInput.value = 0;
      dInput.value = 0;
    } else {
      tr.remove();
    }
    updateMultiLocSummary();
  });

  tbody.appendChild(tr);
}

function updateMultiLocSummary() {
  const tbody = document.getElementById('multiLocRowsTbody');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('.multi-loc-row');
  let totalP = 0;
  let totalD = 0;
  const parts = [];

  rows.forEach(r => {
    const loc = (r.querySelector('.loc-name-input')?.value || '').trim();
    const p = parseInt(r.querySelector('.loc-physical-input')?.value, 10) || 0;
    const d = parseInt(r.querySelector('.loc-damaged-input')?.value, 10) || 0;

    totalP += p;
    totalD += d;

    if (loc) {
      let segment = loc;
      if (p > 0 || d > 0 || rows.length > 1) {
        segment += ` (${p})`;
      }
      if (d > 0) {
        segment += ` [ME: ${d}]`;
      }
      parts.push(segment);
    }
  });

  const elP = document.getElementById('multiLocTotalPhysical');
  const elD = document.getElementById('multiLocTotalDamaged');
  const elStr = document.getElementById('multiLocConsolidatedString');

  if (elP) elP.textContent = totalP;
  if (elD) elD.textContent = totalD;
  if (elStr) elStr.textContent = parts.length > 0 ? parts.join(' | ') : '-';
}

function saveMultiLocationModal() {
  if (!state.activeMultiLocItem) return;
  const item = state.activeMultiLocItem;
  const tbody = document.getElementById('multiLocRowsTbody');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('.multi-loc-row');
  const parsed = [];
  let totalP = 0;
  let totalD = 0;
  const parts = [];

  rows.forEach(r => {
    const loc = (r.querySelector('.loc-name-input')?.value || '').trim();
    const p = parseInt(r.querySelector('.loc-physical-input')?.value, 10) || 0;
    const d = parseInt(r.querySelector('.loc-damaged-input')?.value, 10) || 0;

    if (loc) {
      parsed.push({ location: loc, physicalQty: p, damagedQty: d });
      totalP += p;
      totalD += d;

      let segment = loc;
      if (p > 0 || d > 0 || rows.length > 1) {
        segment += ` (${p})`;
      }
      if (d > 0) {
        segment += ` [ME: ${d}]`;
      }
      parts.push(segment);
    }
  });

  const consolidatedString = parts.length > 0 ? parts.join(' | ') : item.location;

  // Save in memory state
  state.multiLocations[item.sku] = parsed;
  state.damagedStock[item.sku] = totalD;
  item.location = consolidatedString;

  // Update Main Table Inputs
  const countInput = document.getElementById(`count-input-${item.sku}`);
  const damagedInput = document.getElementById(`damaged-input-${item.sku}`);
  const cameraBtn = document.getElementById(`btn-camera-${item.sku}`);

  if (countInput) countInput.value = totalP;
  if (damagedInput) {
    damagedInput.value = totalD;
    damagedInput.classList.toggle('has-damaged', totalD > 0);
  }

  const itemPhotos = state.damagedPhotos[item.sku] || [];
  if (cameraBtn) {
    if (totalD > 0 && itemPhotos.length === 0) {
      cameraBtn.classList.add('highlight-prompt');
    } else {
      cameraBtn.classList.remove('highlight-prompt');
    }
  }

  // Update Location Cell in Table
  const row = document.getElementById(`row-${item.sku}`);
  if (row) {
    const locCell = row.querySelector('.cell-location');
    if (locCell) {
      if (parsed.length > 1) {
        locCell.innerHTML = `
          <span class="mobile-label">Ubicación:</span>
          <div class="multi-location-chip btn-open-multiloc" data-sku="${escapeHtml(item.sku)}" title="Gestionar múltiples ubicaciones">
            <i class="fa-solid fa-map-location-dot"></i>
            <span>${parsed.length} Ubicaciones</span>
            <i class="fa-solid fa-chevron-down" style="font-size: 0.65rem; opacity: 0.7;"></i>
          </div>
        `;
      } else {
        const singleLoc = parsed[0]?.location || consolidatedString;
        locCell.innerHTML = `
          <span class="mobile-label">Ubicación:</span>
          <div class="location-clickable-tag btn-open-multiloc" data-sku="${escapeHtml(item.sku)}" title="Clic para agregar otra ubicación">
            <i class="fa-solid fa-location-dot"></i>
            <span>${escapeHtml(singleLoc)}</span>
            <i class="fa-solid fa-plus add-loc-icon" title="Agregar otra ubicación"></i>
          </div>
        `;
      }

      locCell.querySelector('.btn-open-multiloc')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openMultiLocationModal(item);
      });
    }
  }

  document.getElementById('multiLocationModal').classList.add('hidden');
  sfx.saveSuccess();
  showToast(`✓ Ubicaciones guardadas para SKU ${item.sku} (${parsed.length} ubicación(es))`, 'success');
}

/**
 * Submit inline count directly to Excel backend
 * Allows empty input (defaults to 0 units for out-of-stock items)
 */
async function submitInlineCount(item, inputElem, damagedInputElem, confirmBtn, currentIndex) {
  const rawVal = inputElem.value.trim();
  let physicalStock = 0;

  if (rawVal !== '' && !isNaN(rawVal)) {
    physicalStock = parseInt(rawVal, 10);
  }
  if (physicalStock < 0) physicalStock = 0;

  inputElem.value = physicalStock;

  const rawDamaged = damagedInputElem ? damagedInputElem.value.trim() : '0';
  let damagedStock = 0;
  if (rawDamaged !== '' && !isNaN(rawDamaged)) {
    damagedStock = parseInt(rawDamaged, 10);
  }
  if (damagedStock < 0) damagedStock = 0;

  confirmBtn.disabled = true;
  confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

  const operatorName = state.currentUser?.nombre || state.currentUser?.usuario || 'Operador Web';
  const previousStock = (item.physicalStock !== null && item.physicalStock !== undefined && item.physicalStock !== '') ? Number(item.physicalStock) : null;
  const isModification = previousStock !== null;

  const locBreakdown = state.multiLocations[item.sku] || [];
  const locString = item.location || '';
  const itemPhotos = state.damagedPhotos[item.sku] || [];

  try {
    const payload = {
      sku: item.sku,
      description: item.description || '',
      location: locString,
      locationString: locString,
      locationsBreakdown: locBreakdown,
      physicalStock: physicalStock,
      damagedStock: damagedStock,
      damagedPhotos: itemPhotos,
      previousStock: previousStock,
      isModification: isModification,
      operatorName: operatorName,
      operatorUser: state.currentUser?.usuario || '',
      operatorCargo: state.currentUser?.cargo || 'AUXILIAR',
      centro: state.currentCentro || '1300',
      type: state.currentInventoryType || 'ciclico',
      inventoryType: state.currentInventoryType || 'ciclico',
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

    // Success Sound & Toast
    sfx.saveSuccess();
    const damagedMsg = damagedStock > 0 ? ` [Mal Estado: ${damagedStock}]` : '';
    showToast(`✓ SKU ${item.sku} confirmado con ${physicalStock} uds${damagedMsg}`, 'success');

    // Update Row styling
    const row = document.getElementById(`row-${item.sku}`);
    if (row) {
      row.className = 'row-counted';
    }

    // Update Input state
    inputElem.classList.add('locked-input');
    inputElem.setAttribute('data-confirmed', 'true');
    inputElem.readOnly = true;
    if (damagedInputElem) damagedInputElem.readOnly = true;

    // Update Button state
    confirmBtn.className = 'btn-confirm-count is-counted';
    confirmBtn.setAttribute('data-confirmed', 'true');
    confirmBtn.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>Contado</span>';
    confirmBtn.title = 'Ya contado en Excel. Clic para modificar';

    // Update item object in memory
    item.physicalStock = physicalStock;
    item.damagedStock = damagedStock;
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
    const nextInput = document.querySelector(`.quick-count-input[tabindex="${(currentIndex + 1) * 2 + 1}"]`);
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
 * Open Lightbox for Image Evidence & Reference Photos
 */
function openImageLightbox(url, title = 'Evidencia Fotográfica', subtitle = '') {
  if (!url) return;
  const lightboxModal = document.getElementById('imageLightboxModal');
  const lightboxImg = document.getElementById('lightboxImg');
  const lightboxTitle = document.getElementById('lightboxTitle');
  const lightboxSubtitle = document.getElementById('lightboxSubtitle');
  const lightboxNewTab = document.getElementById('lightboxOpenNewTabBtn');

  if (lightboxImg) {
    lightboxImg.src = url;
    lightboxImg.alt = title || 'Imagen';
  }
  if (lightboxTitle) {
    lightboxTitle.textContent = title || 'Evidencia Fotográfica';
  }

  // Prevent dumping raw base64 / data URL code into the text container
  if (lightboxSubtitle) {
    if (subtitle && !String(subtitle).startsWith('data:')) {
      lightboxSubtitle.textContent = subtitle;
    } else if (url.startsWith('http')) {
      lightboxSubtitle.textContent = 'Imagen sincronizada desde la nube';
    } else {
      lightboxSubtitle.textContent = 'Vista previa en alta resolución';
    }
  }

  if (lightboxNewTab) {
    lightboxNewTab.onclick = (e) => {
      e.preventDefault();
      if (url.startsWith('data:')) {
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title || 'Foto'}</title><style>body{margin:0;background:#090d16;display:flex;align-items:center;justify-content:center;min-height:100vh;overflow:auto;}img{max-width:96vw;max-height:96vh;object-fit:contain;border-radius:8px;box-shadow:0 12px 36px rgba(0,0,0,0.8);}</style></head><body><img src="${url}" alt="Foto" /></body></html>`);
          win.document.close();
        }
      } else {
        window.open(url, '_blank');
      }
    };
  }

  if (lightboxModal) lightboxModal.classList.remove('hidden');
}

/**
 * Accidental Modification Protection Dialog
 */
function promptModifyConfirmation(item, inputElem, confirmBtn) {
  sfx.warning();
  const damagedElem = document.getElementById(`damaged-input-${item.sku}`);
  state.pendingModifyItem = { item, inputElem, damagedElem, confirmBtn };

  document.getElementById('modSkuText').textContent = item.sku;
  document.getElementById('modDescText').textContent = item.description;
  document.getElementById('modCurrentValText').textContent = item.physicalStock !== null ? item.physicalStock : 0;

  document.getElementById('modifyConfirmModal').classList.remove('hidden');
}

function unlockItemForModification() {
  if (!state.pendingModifyItem) return;
  const { inputElem, damagedElem, confirmBtn } = state.pendingModifyItem;

  // Unlock inputs
  inputElem.readOnly = false;
  inputElem.classList.remove('locked-input');
  inputElem.setAttribute('data-confirmed', 'false');
  
  if (damagedElem) {
    damagedElem.readOnly = false;
  }

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
    const user = state.currentUser;
    const filterSelect = document.getElementById('filterUsersByCentroSelect');
    let selectedCentro = filterSelect?.value || state.currentCentro;

    if (user?.cargo === 'ENCARGADO' && user?.centro && user.centro !== 'TODOS') {
      selectedCentro = user.centro;
      if (filterSelect) {
        filterSelect.value = user.centro;
        filterSelect.disabled = true;
      }
    } else if (filterSelect) {
      filterSelect.disabled = false;
    }

    const url = selectedCentro && selectedCentro !== 'TODOS' ? `/api/auth/users/all?centro=${selectedCentro}` : '/api/auth/users/all';

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

  const isAlonso = state.currentUser?.usuario?.toUpperCase() === 'ALONSO' && state.currentUser?.cargo === 'ADMIN';
  const searchVal = (document.getElementById('usersSearchInput')?.value || '').toLowerCase().trim();

  let activeEncargados = 0;
  let activeAuxiliares = 0;

  users.forEach(u => {
    if (u.activo) {
      if (u.cargo === 'ENCARGADO') activeEncargados++;
      else if (u.cargo === 'AUXILIAR') activeAuxiliares++;
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
    const isAdmin = u.cargo === 'ADMIN';

    let badgeClass = 'badge-auxiliar';
    let iconClass = 'fa-user-tag';
    if (isAdmin) {
      badgeClass = 'badge-admin';
      iconClass = 'fa-crown';
    } else if (isEncargado) {
      badgeClass = 'badge-supervisor';
      iconClass = 'fa-user-shield';
    }

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
        <span class="user-card-badge ${badgeClass}">
          <i class="fa-solid ${iconClass}"></i> ${u.cargo}
        </span>
        <span class="user-card-centro"><i class="fa-solid fa-warehouse"></i> Centro ${u.centro || '1300'}</span>
      </div>

      <div class="user-card-footer">
        <span class="user-access-text"><i class="fa-solid fa-clock"></i> ${u.ultimoAcceso ? 'Último: ' + u.ultimoAcceso.substring(0, 10) : 'Sin accesos recientes'}</span>
        ${isAlonso ? `
          <button class="btn btn-outline btn-sm btn-edit-user" data-id="${u.id}">
            <i class="fa-solid fa-pen"></i> Editar
          </button>
        ` : ''}
      </div>
    `;

    if (isAlonso) {
      card.querySelector('.btn-edit-user')?.addEventListener('click', () => {
        openEditUserModal(u);
      });
    }

    grid.appendChild(card);
  });

  document.getElementById('usersTotalEncargadosCount').textContent = activeEncargados;
  document.getElementById('usersTotalAuxiliaresCount').textContent = activeAuxiliares;
}

function openEditUserModal(user) {
  if (state.currentUser?.usuario?.toUpperCase() !== 'ALONSO') {
    showToast('Permiso denegado: Solo el usuario administrador ALONSO puede modificar accesos y operadores.', 'error');
    return;
  }

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
    const user = state.currentUser;
    let curCentro = state.currentCentro || '1300';
    if (user?.cargo === 'ENCARGADO' && user?.centro && user.centro !== 'TODOS') {
      curCentro = user.centro;
    }

    const query = new URLSearchParams();
    query.append('centro', curCentro);
    query.append('type', state.currentInventoryType || 'ciclico');
    if (user) {
      query.append('userCargo', user.cargo || '');
      query.append('userCentro', user.centro || '');
    }

    const res = await fetch(`/api/analytics?${query.toString()}`);
    const data = await res.json();
    if (!data) return;

    const ira = data.iraPercentage !== undefined ? data.iraPercentage : (data.iraPercent !== undefined ? data.iraPercent : 100);
    const progress = data.cycleProgress !== undefined ? data.cycleProgress : (data.progressPercent !== undefined ? data.progressPercent : 0);
    const totalItems = data.totalItems !== undefined ? data.totalItems : (data.totalCount || 0);
    const countedItems = data.countedItems !== undefined ? data.countedItems : (data.countedCount || 0);
    const exactMatches = data.exactMatches !== undefined ? data.exactMatches : (data.withoutVarianceCount || 0);
    const missingItems = data.missingItems !== undefined ? data.missingItems : (data.missingCount || 0);
    const surplusItems = data.surplusItems !== undefined ? data.surplusItems : (data.surplusCount || 0);
    const pendingItems = data.pendingItems !== undefined ? data.pendingItems : Math.max(0, totalItems - countedItems);
    const discrepancies = missingItems + surplusItems;
    const netCost = data.netVarianceCost !== undefined ? data.netVarianceCost : (data.netVarianceValue !== undefined ? data.netVarianceValue : 0);
    const absCost = data.absoluteVarianceCost !== undefined ? data.absoluteVarianceCost : (data.absoluteVarianceValue !== undefined ? data.absoluteVarianceValue : 0);

    const elIra = document.getElementById('kpiIraScore'); if (elIra) elIra.textContent = ira;
    const elProg = document.getElementById('kpiProgress'); if (elProg) elProg.textContent = progress;
    const elTot = document.getElementById('kpiTotalItems'); if (elTot) elTot.textContent = totalItems;
    const elCount = document.getElementById('kpiCountedItems'); if (elCount) elCount.textContent = countedItems;
    const elExact = document.getElementById('kpiExactMatches'); if (elExact) elExact.textContent = exactMatches;
    const elDisc = document.getElementById('kpiDiscrepancies'); if (elDisc) elDisc.textContent = discrepancies;
    const elMiss = document.getElementById('kpiMissing'); if (elMiss) elMiss.textContent = missingItems;
    const elSurp = document.getElementById('kpiSurplus'); if (elSurp) elSurp.textContent = surplusItems;
    const elNet = document.getElementById('kpiNetCost'); if (elNet) elNet.textContent = `$${Number(netCost).toLocaleString('es-CO', { minimumFractionDigits: 2 })}`;
    const elAbs = document.getElementById('kpiAbsCost'); if (elAbs) elAbs.textContent = `$${Number(absCost).toLocaleString('es-CO', { minimumFractionDigits: 2 })}`;

    if (data.abcStats) {
      renderAbcChart(data.abcStats);
    }
    renderStatusChart(exactMatches, missingItems, surplusItems, pendingItems);
    renderTopDiscrepancies(data.topDiscrepancies || []);

    if (data.operatorEfficiency) {
      state.lastEfficiency = data.operatorEfficiency;
      state.lastAuditLogs = data.operatorEfficiency.recentAuditFeed || [];
      renderOperatorEfficiency(data.operatorEfficiency);
      renderAuditTrail(state.lastAuditLogs);
    }
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

function renderOperatorEfficiency(eff) {
  if (!eff) return;

  const elTot = document.getElementById('effTotalAuditLogs');
  if (elTot) elTot.textContent = eff.totalLogs || 0;

  const elRec = document.getElementById('effTotalRecounts');
  if (elRec) elRec.textContent = `${eff.totalRecounts || 0} (${eff.globalRecountRate || 0}%)`;

  const elAvg = document.getElementById('effAvgAccuracy');
  if (elAvg) elAvg.textContent = `${eff.avgOperatorAccuracy || 100}%`;

  const tbody = document.getElementById('operatorEfficiencyTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const operators = eff.operators || [];
  if (operators.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9">No hay registros de conteos para calcular la eficacia en este centro.</td></tr>`;
    return;
  }

  operators.forEach(op => {
    const tr = document.createElement('tr');
    const initial = (op.name || op.user || 'U').charAt(0).toUpperCase();
    const avatarColor = op.role === 'ADMIN' ? '#f59e0b' : (op.role === 'ENCARGADO' ? '#3b82f6' : '#10b981');
    const firstAccClass = op.firstTimeAccuracyPct >= 95 ? 'text-green' : (op.firstTimeAccuracyPct >= 85 ? 'text-primary' : 'text-red');
    const recountClass = op.recountRatePct > 30 ? 'text-red' : (op.recountRatePct > 15 ? 'text-amber' : 'text-muted');

    tr.innerHTML = `
      <td>
        <div class="operator-cell">
          <div class="operator-avatar-pill" style="background-color: ${avatarColor};">${initial}</div>
          <div class="operator-details-text">
            <strong>${escapeHtml(op.name)}</strong>
            <span>@${escapeHtml(op.user)}</span>
          </div>
        </div>
      </td>
      <td>
        <span class="user-card-badge ${op.role === 'ADMIN' ? 'badge-admin' : (op.role === 'ENCARGADO' ? 'badge-supervisor' : 'badge-auxiliar')}">
          ${op.role} &bull; C${op.centro || state.currentCentro}
        </span>
      </td>
      <td class="text-center"><strong>${op.totalActions}</strong></td>
      <td class="text-center">${op.firstTimeCounts}</td>
      <td class="text-center"><span class="${recountClass}"><strong>${op.recounts}</strong></span></td>
      <td class="text-center"><span class="${recountClass}"><strong>${op.recountRatePct}%</strong></span></td>
      <td class="text-center"><strong class="${firstAccClass}">${op.firstTimeAccuracyPct}%</strong></td>
      <td class="text-center">
        <span class="text-green font-mono">${op.finalExact}</span> / <span class="font-mono">${op.uniqueItems}</span> (${op.finalAccuracyPct}%)
      </td>
      <td class="text-center">
        <span class="${op.ratingClass || 'badge-rating-excelente'}">
          <i class="fa-solid fa-medal"></i> ${op.rating}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAuditTrail(logs) {
  const tbody = document.getElementById('auditTrailTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = (document.getElementById('auditTrailSearchInput')?.value || '').toLowerCase().trim();

  let filtered = logs;
  if (searchVal) {
    filtered = logs.filter(l =>
      (l.sku && l.sku.toLowerCase().includes(searchVal)) ||
      (l.description && l.description.toLowerCase().includes(searchVal)) ||
      (l.counterName && l.counterName.toLowerCase().includes(searchVal)) ||
      (l.counterUser && l.counterUser.toLowerCase().includes(searchVal)) ||
      (l.type && l.type.toLowerCase().includes(searchVal)) ||
      (l.status && l.status.toLowerCase().includes(searchVal))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="11">No hay registros de auditoría de conteos para mostrar.</td></tr>`;
    return;
  }

  filtered.forEach(log => {
    const tr = document.createElement('tr');
    const isRecount = log.type === 'RECONTEO_EDICION' || log.isRecount;
    const sign = log.variance > 0 ? '+' : '';
    const varClass = log.variance === 0 ? 'text-green' : (log.variance < 0 ? 'text-red' : 'text-primary');

    let countHtml = `<strong>${log.physicalStock}</strong>`;
    if (isRecount && log.previousStock !== null && log.previousStock !== undefined) {
      countHtml = `
        <div class="count-transition-pill">
          <span class="count-prev-val">${log.previousStock}</span>
          <i class="fa-solid fa-arrow-right text-amber" style="font-size: 0.75rem;"></i>
          <span class="count-new-val">${log.physicalStock}</span>
        </div>
      `;
    }

    tr.innerHTML = `
      <td><span class="font-mono text-muted" style="font-size: 0.8rem;">${escapeHtml(log.timestamp ? log.timestamp.substring(5, 19) : '-')}</span></td>
      <td><span class="tag tag-location">C${escapeHtml(log.centro || '1300')}</span></td>
      <td><strong class="font-mono text-primary">${escapeHtml(log.sku)}</strong></td>
      <td title="${escapeHtml(log.description)}">${escapeHtml(log.description || '-')}</td>
      <td><span class="tag tag-location">${escapeHtml(log.location || '-')}</span></td>
      <td class="text-center font-mono">${log.systemStock}</td>
      <td class="text-center">${countHtml}</td>
      <td class="text-center"><span class="${varClass}"><strong>${sign}${log.variance}</strong></span></td>
      <td class="text-center">
        <span class="${isRecount ? 'badge-event-recount' : 'badge-event-first'}">
          <i class="fa-solid ${isRecount ? 'fa-arrows-rotate' : 'fa-check'}"></i> ${isRecount ? 'Re-conteo' : '1er Conteo'}
        </span>
      </td>
      <td>
        <strong style="font-size: 0.85rem;">${escapeHtml(log.counterName)}</strong>
      </td>
      <td class="text-center"><span class="status-badge ${log.status === 'Faltante' ? 'faltante' : (log.status === 'Sobrante' ? 'sobrante' : 'cuadrado')}">${log.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================================================================
// Configuration & Mapping Helpers
// =============================================================================
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
      
      // If user is Admin (cargo: 'ADMIN'), preserve active working centro, NEVER set it to 'TODOS'!
      if (data.user.cargo === 'ADMIN') {
        state.currentCentro = (centro && centro !== 'TODOS') ? String(centro) : (state.currentCentro && state.currentCentro !== 'TODOS' ? state.currentCentro : '1300');
      } else {
        state.currentCentro = data.user.centro || centro || '1300';
      }

      localStorage.setItem('cyclic_current_user', JSON.stringify(data.user));
      localStorage.setItem('cyclic_active_centro', state.currentCentro);

      showToast(`¡Bienvenido ${data.user.nombre}! (${data.user.cargo})`, 'success');
      loginModal.classList.add('hidden');

      updateUserProfileUI();
      applyRolePermissions();
      loadAppConfig().then(() => {
        loadInventory();
        loadUsersList();
        renderCentrosPortal(state.centrosList);
        if (state.currentUser?.cargo === 'ADMIN' || state.currentUser?.cargo === 'ENCARGADO') {
          loadAnalytics();
          loadCycleHistory();
        } else if (state.currentUser?.cargo === 'AUXILIAR') {
          checkAndShowAuxiliarAssignedAlert(state.currentUser, state.currentCentro, true);
        }
      });

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
    const requestingUser = state.currentUser?.usuario || '';
    const payload = {
      nombre: document.getElementById('userModalNombre').value,
      centro: document.getElementById('userModalCentro').value,
      cargo: document.getElementById('userModalCargo').value,
      usuario: document.getElementById('userModalUsuario').value,
      password: document.getElementById('userModalPassword').value,
      requestingUser
    };

    try {
      const url = id ? `/api/auth/users/${id}` : '/api/auth/users';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'x-requesting-user': requestingUser
        },
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

  // Audit Trail search input in Dashboard
  document.getElementById('auditTrailSearchInput')?.addEventListener('input', () => {
    if (state.lastAuditLogs) {
      renderAuditTrail(state.lastAuditLogs);
    }
  });

  document.getElementById('btnRefreshInventory').addEventListener('click', () => {
    loadInventory();
    loadAnalytics();
    showToast('Inventario sincronizado', 'info');
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

  // Multi-Inventory Tasks Dashboard Navigation
  document.getElementById('btnBackToTasksDashboard')?.addEventListener('click', closeInventoryCountingSheet);
  document.getElementById('btnRefreshTasksDashboard')?.addEventListener('click', () => {
    loadInventoryTasksSummary();
    showToast('Tareas de inventario actualizadas', 'info');
  });

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

  // =========================================================================
  // HISTORY TAB EVENT LISTENERS
  // =========================================================================
  document.getElementById('filterHistoryStatusSelect')?.addEventListener('change', () => {
    loadCycleHistory();
  });
  document.getElementById('historySearchInput')?.addEventListener('input', () => {
    loadCycleHistory();
  });
  document.getElementById('btnRefreshHistory')?.addEventListener('click', () => {
    loadCycleHistory();
    showToast('Historial de cíclicos actualizado', 'info');
  });
  document.getElementById('btnCloseCycleDetailModal')?.addEventListener('click', () => {
    document.getElementById('cycleDetailModal').classList.add('hidden');
  });
  document.getElementById('btnCloseCycleDetailModalBtn')?.addEventListener('click', () => {
    document.getElementById('cycleDetailModal').classList.add('hidden');
  });

  // =========================================================================
  // REOPEN CYCLE MODAL LISTENERS (ADMIN AUTHORIZATION)
  // =========================================================================
  document.getElementById('btnCloseReopenAuthModal')?.addEventListener('click', closeReopenAuthModal);
  document.getElementById('btnCancelReopenModal')?.addEventListener('click', closeReopenAuthModal);
  document.getElementById('btnSubmitReopenCycle')?.addEventListener('click', handleReopenCycleSubmit);
  document.getElementById('reopenAdminPasswordInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleReopenCycleSubmit();
    }
  });

  // =========================================================================
  // DELETE CYCLE MODAL LISTENERS (ADMIN / ENCARGADO AUTHORIZATION)
  // =========================================================================
  document.getElementById('btnCloseDeleteCycleModal')?.addEventListener('click', closeDeleteCycleModal);
  document.getElementById('btnCancelDeleteCycle')?.addEventListener('click', closeDeleteCycleModal);
  document.getElementById('deleteCycleForm')?.addEventListener('submit', handleDeleteCycleSubmit);

  // =========================================================================
  // ASSIGNED CYCLIC ALERT MODAL LISTENERS (MEDIA PANTALLA)
  // =========================================================================
  document.getElementById('btnCloseAssignedAlertModal')?.addEventListener('click', () => {
    hideAssignedCyclicModal();
  });
  document.getElementById('btnDismissAssignedAlert')?.addEventListener('click', () => {
    hideAssignedCyclicModal();
  });
  document.getElementById('btnStartAssignedCycleNow')?.addEventListener('click', () => {
    hideAssignedCyclicModal();
    sfx.scanSuccess();
    switchTab('inventory-tab');
    showToast('¡Orden de conteo activada! Puedes comenzar a registrar cantidades.', 'info');
    setTimeout(() => {
      const firstInput = document.querySelector('#mainInventoryTable input.count-input-rapid');
      if (firstInput) {
        firstInput.focus();
        firstInput.select();
      } else {
        document.getElementById('invSearchInput')?.focus();
      }
    }, 300);
  });

  // =========================================================================
  // JUSTIFICATIONS TAB & LIGHTBOX LISTENERS (ADMIN ONLY)
  // =========================================================================
  document.getElementById('btnFinishJustificationsReview')?.addEventListener('click', openFinishReviewModal);
  document.getElementById('btnCloseFinishReviewConfirmModal')?.addEventListener('click', closeFinishReviewConfirmModal);
  document.getElementById('btnCancelFinishReviewModal')?.addEventListener('click', closeFinishReviewConfirmModal);
  document.getElementById('btnSubmitFinishReview')?.addEventListener('click', handleFinishReviewSubmit);
  document.getElementById('btnCloseFinishReviewSuccessModal')?.addEventListener('click', closeFinishReviewSuccessModal);

  document.getElementById('btnRefreshJustifications')?.addEventListener('click', () => {
    loadJustificationsData();
    showToast('Lista de verificación y justificaciones actualizada', 'info');
  });
  document.getElementById('justifSearchInput')?.addEventListener('input', () => {
    renderJustificationsTable(justificationsState.items);
  });
  document.getElementById('justifStatusFilter')?.addEventListener('change', () => {
    renderJustificationsTable(justificationsState.items);
  });
  document.getElementById('justifJustifiedFilter')?.addEventListener('change', () => {
    renderJustificationsTable(justificationsState.items);
  });
  document.getElementById('btnCloseLightbox')?.addEventListener('click', () => {
    document.getElementById('imageLightboxModal')?.classList.add('hidden');
  });
  document.getElementById('btnCloseLightboxBtn')?.addEventListener('click', () => {
    document.getElementById('imageLightboxModal')?.classList.add('hidden');
  });

  // =========================================================================
  // MULTI-LOCATION MODAL LISTENERS
  // =========================================================================
  document.getElementById('btnAddLocRowBtn')?.addEventListener('click', () => {
    addMultiLocRowElement('', 0, 0, 999);
    updateMultiLocSummary();
  });
  document.getElementById('btnSaveMultiLocModal')?.addEventListener('click', saveMultiLocationModal);
  document.getElementById('btnCancelMultiLocModal')?.addEventListener('click', () => {
    document.getElementById('multiLocationModal')?.classList.add('hidden');
  });
  document.getElementById('btnCloseMultiLocModal')?.addEventListener('click', () => {
    document.getElementById('multiLocationModal')?.classList.add('hidden');
  });

  // =========================================================================
  // LIVE CAMERA CAPTURE MODAL LISTENERS
  // =========================================================================
  document.getElementById('btnCloseCameraModal')?.addEventListener('click', closeCameraCaptureModal);
  document.getElementById('btnSwitchCameraFacing')?.addEventListener('click', switchCameraFacing);
  document.getElementById('btnShutterCapture')?.addEventListener('click', takeCameraSnapshot);
  document.getElementById('btnRetakeSnapshot')?.addEventListener('click', retakeCameraSnapshot);
  document.getElementById('btnConfirmUploadSnapshot')?.addEventListener('click', confirmAndUploadCameraSnapshot);

  // Gallery fallback picker
  const cameraFileInput = document.getElementById('cameraModalFileInput');
  const triggerGallery = () => cameraFileInput?.click();
  document.getElementById('btnOpenGalleryPicker')?.addEventListener('click', triggerGallery);
  document.getElementById('btnCameraFallbackUpload')?.addEventListener('click', triggerGallery);

  cameraFileInput?.addEventListener('change', () => {
    if (cameraFileInput.files && cameraFileInput.files[0]) {
      const file = cameraFileInput.files[0];
      state.camera.capturedBlob = file;

      const imgPreview = document.getElementById('cameraSnapshotPreview');
      const video = document.getElementById('cameraVideoFeed');
      const guides = document.getElementById('viewfinderGuides');
      const errorState = document.getElementById('cameraErrorState');

      if (imgPreview) {
        imgPreview.src = URL.createObjectURL(file);
        imgPreview.classList.remove('hidden');
      }
      if (video) video.classList.add('hidden');
      if (guides) guides.classList.add('hidden');
      if (errorState) errorState.classList.add('hidden');

      document.getElementById('cameraLiveBar')?.classList.add('hidden');
      document.getElementById('cameraReviewBar')?.classList.remove('hidden');
    }
  });

  // Initialize Canvas Pad
  initSignaturePad();
}

function openLoginModal(isMandatory = false) {
  const modal = document.getElementById('loginModal');
  modal.classList.remove('hidden');

  const closeBtn = document.getElementById('btnCloseLoginModal');
  if (closeBtn) {
    closeBtn.style.display = isMandatory ? 'none' : 'block';
  }

  const centroSelect = document.getElementById('loginCentroSelect');
  if (centroSelect) {
    centroSelect.value = state.currentCentro || '1300';
    updateLoginQuickUsers(state.currentCentro || '1300');
  }
  document.getElementById('loginUsernameInput').value = '';
  document.getElementById('loginPasswordInput').value = '';
  setTimeout(() => document.getElementById('loginUsernameInput')?.focus(), 100);
}

function updateLoginQuickUsers(centro) {
  const container = document.getElementById('loginQuickUsersList');
  if (!container) return;
  container.innerHTML = '';

  const targetCentro = (centro && centro !== 'TODOS') ? String(centro) : (state.currentCentro || '1300');

  fetch(`/api/auth/users/all?centro=${targetCentro}`)
    .then(r => r.json())
    .then(data => {
      if (!data.success) return;
      container.innerHTML = '';

      // Admin quick chips (ALONSO, ABSAEL, JCARLOS)
      const admins = [
        { nombre: 'ALONSO (SuperAdmin)', usuario: 'ALONSO', cargo: 'ADMIN', icon: 'fa-crown' },
        { nombre: 'ABSAEL (Admin)', usuario: 'ABSAEL', cargo: 'ADMIN', icon: 'fa-crown' },
        { nombre: 'JUAN CARLOS (Admin)', usuario: 'JCARLOS', cargo: 'ADMIN', icon: 'fa-crown' }
      ];

      admins.forEach(adm => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'login-user-chip chip-admin';
        chip.innerHTML = `<i class="fa-solid ${adm.icon}"></i> ${escapeHtml(adm.usuario)}`;
        chip.title = `${adm.nombre} - Administrador Global`;
        chip.addEventListener('click', () => {
          document.getElementById('loginUsernameInput').value = adm.usuario;
          document.getElementById('loginPasswordInput').value = '';
          document.getElementById('loginPasswordInput').focus();
        });
        container.appendChild(chip);
      });

      // Encargados & Auxiliares of this Centro
      const localUsers = (data.users || []).filter(u => u.cargo !== 'ADMIN' && u.activo);
      localUsers.forEach(u => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `login-user-chip ${u.cargo === 'ENCARGADO' ? 'chip-encargado' : 'chip-auxiliar'}`;
        const icon = u.cargo === 'ENCARGADO' ? 'fa-user-shield' : 'fa-user';
        chip.innerHTML = `<i class="fa-solid ${icon}"></i> ${escapeHtml(u.usuario || u.nombre.split(' ')[0])}`;
        chip.title = `${u.nombre} (${u.cargo})`;
        chip.addEventListener('click', () => {
          document.getElementById('loginUsernameInput').value = u.usuario;
          document.getElementById('loginPasswordInput').value = '';
          document.getElementById('loginPasswordInput').focus();
        });
        container.appendChild(chip);
      });
    })
    .catch(err => {
      console.warn('Error fetching quick users for login:', err.message);
    });
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
async function openAssignCycleModal(type = 'ciclico') {
  const modal = document.getElementById('assignCycleModal');
  if (!modal) return;

  const targetType = type || state.currentInventoryType || 'ciclico';
  const typeSelect = document.getElementById('assignInventoryTypeSelect');
  if (typeSelect) {
    typeSelect.value = targetType;
  }

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
          if (state.currentAssignment?.assignedToUserId === aux.id || state.currentAssignment?.assignedToUserLogin === aux.usuario) {
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
  const inventoryType = document.getElementById('assignInventoryTypeSelect')?.value || state.currentInventoryType || 'ciclico';

  try {
    const res = await fetch('/api/assignments/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        centro: state.currentCentro,
        assignedToUserId,
        assignedToUserName,
        assignedToUserLogin,
        assignedByUserName: state.currentUser?.nombre || state.currentUser?.usuario || 'Encargado',
        assignedByUserRole: state.currentUser?.cargo || 'AUXILIAR',
        assignedByUserCentro: state.currentUser?.centro || state.currentCentro,
        notes,
        inventoryType
      })
    });

    const data = await res.json();
    if (data.success) {
      sfx.saveSuccess();
      showToast(`✓ ${inventoryType.toUpperCase()} asignado a ${assignedToUserName}.`, 'success');
      
      // Limpiar formulario y cerrar modal
      if (document.getElementById('assignNotesInput')) {
        document.getElementById('assignNotesInput').value = '';
      }
      document.getElementById('assignCycleModal')?.classList.add('hidden');
      
      // Refrescar inventario, tareas e historial
      await loadInventoryTasksSummary();
      await loadCycleHistory();
      if (state.isCountingSheetOpen) {
        await loadInventory();
      }
      
      // Redirigir al historial para que el encargado visualice la orden asignada
      if (state.currentUser && (state.currentUser.cargo === 'ENCARGADO' || state.currentUser.cargo === 'ADMIN')) {
        switchTab('history-tab');
      }
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

  // Dynamic canvas resize to fit modal width on mobile/tablets
  setTimeout(() => {
    const wrapper = modal.querySelector('.canvas-wrapper');
    if (wrapper && signatureState.canvas) {
      const w = wrapper.clientWidth || 450;
      signatureState.canvas.width = w;
      signatureState.canvas.height = 180;
      clearSignatureCanvas();
    }
  }, 50);
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
        type: state.currentInventoryType || 'ciclico',
        inventoryType: state.currentInventoryType || 'ciclico',
        signatureBase64,
        operatorName: state.currentUser?.nombre || state.currentUser?.usuario || 'Operador',
        operatorRole: state.currentUser?.cargo || 'AUXILIAR',
        notes
      })
    });

    const data = await res.json();
    if (data.success) {
      sfx.saveSuccess();
      showToast('🎉 ¡Inventario CONCLUIDO y FIRMADO con éxito!', 'success');
      document.getElementById('signatureModal').classList.add('hidden');
      loadInventoryTasksSummary();
      loadInventory();
      loadAnalytics();
      loadCycleHistory();
    } else {
      throw new Error(data.error || 'Error al guardar firma');
    }
  } catch (err) {
    sfx.error();
    showToast('Error al concluir ciclo: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-file-signature"></i> GUARDAR FIRMA Y CONCLUIR';
  }
}

// =============================================================================
// Cycle History Controller (Encargados Only)
// =============================================================================
async function loadCycleHistory() {
  try {
    const user = state.currentUser;
    const isEncargadoOrAux = user?.cargo === 'ENCARGADO' || user?.cargo === 'AUXILIAR';

    // Strict Centro isolation: Encargados/Auxiliares locked to their own centro
    let centro = state.currentCentro || '1300';
    if (isEncargadoOrAux && user?.centro && user.centro !== 'TODOS') {
      centro = user.centro;
    }

    // Update history header UI
    const historyTitle = document.getElementById('historyCurrentCentroTitle');
    if (historyTitle) historyTitle.textContent = `Centro ${centro}`;
    const historyBadge = document.getElementById('historyCentroCodeText');
    if (historyBadge) historyBadge.textContent = centro;

    const status = document.getElementById('filterHistoryStatusSelect')?.value || '';
    const search = document.getElementById('historySearchInput')?.value || '';

    const query = new URLSearchParams();
    if (centro && centro !== 'TODOS') query.append('centro', centro);
    if (status) query.append('status', status);
    if (search) query.append('search', search);
    if (user) {
      query.append('userCargo', user.cargo || '');
      query.append('userCentro', user.centro || '');
    }

    const res = await fetch(`/api/assignments/history?${query.toString()}`);
    const data = await res.json();
    if (data.success) {
      state.cycleHistory = data.history || [];
      renderCycleHistoryList(state.cycleHistory);
    }
  } catch (err) {
    console.error('Error loading cycle history:', err);
  }
}

function renderCycleHistoryList(history) {
  const container = document.getElementById('historyListContainer');
  if (!container) return;
  container.innerHTML = '';

  // Calculate summary stats for the strip
  const total = history.length;
  const completed = history.filter(h => h.status === 'CONCLUIDO').length;
  const pending = history.filter(h => h.status === 'ASIGNADO').length;
  
  let sumIra = 0;
  let iraCount = 0;
  history.forEach(h => {
    if (h.summary && h.summary.iraPercent !== undefined) {
      sumIra += Number(h.summary.iraPercent);
      iraCount++;
    }
  });
  const avgIra = iraCount > 0 ? (sumIra / iraCount).toFixed(1) : '100';

  const elTot = document.getElementById('histStatTotalCount'); if (elTot) elTot.textContent = total;
  const elComp = document.getElementById('histStatCompletedCount'); if (elComp) elComp.textContent = completed;
  const elPend = document.getElementById('histStatPendingCount'); if (elPend) elPend.textContent = pending;
  const elAvg = document.getElementById('histStatAvgIra'); if (elAvg) elAvg.textContent = `${avgIra}%`;

  if (history.length === 0) {
    container.innerHTML = `
      <div class="empty-history-state" style="text-align: center; padding: 48px 20px; background: var(--bg-surface); border-radius: 12px; border: 1px dashed var(--border-subtle);">
        <i class="fa-solid fa-clipboard-question" style="font-size: 3rem; color: var(--text-secondary); margin-bottom: 12px; opacity: 0.6;"></i>
        <h3 style="font-size: 1.1rem; color: var(--text-primary); margin-bottom: 6px;">No se encontraron registros de inventarios cíclicos</h3>
        <p style="font-size: 0.88rem; color: var(--text-secondary); max-width: 480px; margin: 0 auto;">Los ciclos asignados y concluidos por los auxiliares se registrarán automáticamente aquí para auditoría y trazabilidad.</p>
      </div>
    `;
    return;
  }

  history.forEach(cycle => {
    const isReviewed = cycle.status === 'REVISADO_Y_JUSTIFICADO' || cycle.isReviewed;
    const isCompleted = cycle.status === 'CONCLUIDO' || isReviewed;
    const card = document.createElement('div');
    card.className = `history-cycle-card ${isReviewed ? 'status-reviewed' : (isCompleted ? 'status-completed' : 'status-pending')}`;

    const summary = cycle.summary || {};
    const ira = summary.iraPercent !== undefined ? `${summary.iraPercent}%` : (isCompleted ? '100%' : 'En curso');
    const itemsCount = summary.totalCount !== undefined ? `${summary.countedCount || 0} / ${summary.totalCount}` : (summary.totalItems ? `${summary.totalItems} ítems` : 'Conteo en curso');
    const exact = summary.withoutVarianceCount !== undefined ? summary.withoutVarianceCount : (summary.exactMatches !== undefined ? summary.exactMatches : '-');
    const discrepancies = summary.discrepanciesCount !== undefined ? summary.discrepanciesCount : (summary.discrepancies !== undefined ? summary.discrepancies : '-');
    const netCost = summary.netVarianceValue !== undefined ? `$${Number(summary.netVarianceValue).toLocaleString('es-CO', { minimumFractionDigits: 2 })}` : (summary.netVarianceCost !== undefined ? `$${Number(summary.netVarianceCost).toLocaleString('es-CO', { minimumFractionDigits: 2 })}` : '$0.00');
    const assignedDate = cycle.assignedAt ? cycle.assignedAt.substring(0, 16).replace('T', ' ') : '-';
    const completedDate = cycle.completedAt ? cycle.completedAt.substring(0, 16).replace('T', ' ') : (isCompleted ? 'Concluido' : 'En ejecución');

    let badgeHtml = '';
    if (isReviewed) {
      badgeHtml = `
        <span class="hist-status-badge badge-revisado-justificado">
          <i class="fa-solid fa-shield-check"></i>
          <span>✓ Revisado y Justificado</span>
        </span>
      `;
    } else if (isCompleted) {
      badgeHtml = `
        <span class="hist-status-badge badge-concluido">
          <i class="fa-solid fa-circle-check"></i>
          <span>Concluido y Firmado</span>
        </span>
      `;
    } else {
      badgeHtml = `
        <span class="hist-status-badge badge-proceso">
          <i class="fa-solid fa-clock"></i>
          <span>Asignado en Proceso</span>
        </span>
      `;
    }

    card.innerHTML = `
      <div class="hist-card-header">
        <div class="hist-card-title-group">
          <span class="hist-cycle-code font-mono"><i class="fa-solid fa-hashtag"></i> ${escapeHtml(cycle.cycleId || 'CYC')}</span>
          <span class="hist-centro-pill"><i class="fa-solid fa-warehouse"></i> Centro ${escapeHtml(cycle.centro)}</span>
        </div>
        ${badgeHtml}
      </div>

      <div class="hist-card-body">
        <div class="hist-personnel-row">
          <div class="hist-personnel-item">
            <span class="p-label"><i class="fa-solid fa-user-tag text-primary"></i> Auxiliar Responsable:</span>
            <strong class="p-name">${escapeHtml(cycle.assignedToUserName || 'Auxiliar')}</strong>
            <span class="p-sub text-muted">(@${escapeHtml(cycle.assignedToUserLogin || cycle.assignedToUserId || '')})</span>
          </div>
          <div class="hist-personnel-item">
            <span class="p-label"><i class="fa-solid fa-user-shield text-amber"></i> Encargado Asignador:</span>
            <strong class="p-name">${escapeHtml(cycle.assignedByUserName || 'Encargado')}</strong>
          </div>
          ${isReviewed ? `
            <div class="hist-personnel-item">
              <span class="p-label"><i class="fa-solid fa-user-check text-green"></i> Revisado / Justificado por:</span>
              <strong class="p-name">${escapeHtml(cycle.reviewedBy || 'Administrador')}</strong>
              <span class="p-sub text-muted">${escapeHtml(cycle.reviewedAt ? cycle.reviewedAt.substring(0, 16).replace('T', ' ') : '')}</span>
            </div>
          ` : `
            <div class="hist-personnel-item">
              <span class="p-label"><i class="fa-solid fa-calendar-plus text-primary"></i> Asignado el:</span>
              <span class="p-date">${escapeHtml(assignedDate)}</span>
            </div>
          `}
          <div class="hist-personnel-item">
            <span class="p-label"><i class="fa-solid fa-calendar-check text-green"></i> Fecha de Conclusión:</span>
            <span class="p-date">${escapeHtml(completedDate)}</span>
          </div>
        </div>

        <div class="hist-metrics-row">
          <div class="hist-metric-chip">
            <span class="chip-label">Artículos</span>
            <strong class="chip-val">${escapeHtml(String(itemsCount))}</strong>
          </div>
          <div class="hist-metric-chip">
            <span class="chip-label">Exactitud IRA</span>
            <strong class="chip-val ${isCompleted ? 'text-green' : 'text-amber'}">${escapeHtml(ira)}</strong>
          </div>
          <div class="hist-metric-chip">
            <span class="chip-label">Cuadrados</span>
            <strong class="chip-val text-green">${escapeHtml(String(exact))}</strong>
          </div>
          <div class="hist-metric-chip">
            <span class="chip-label">Discrepancias</span>
            <strong class="chip-val ${Number(discrepancies) > 0 ? 'text-red' : 'text-primary'}">${escapeHtml(String(discrepancies))}</strong>
          </div>
          <div class="hist-metric-chip">
            <span class="chip-label">Impacto Financiero</span>
            <strong class="chip-val">${escapeHtml(netCost)}</strong>
          </div>
        </div>

        ${cycle.notes || cycle.reviewNotes ? `
          <div class="hist-notes-preview">
            <i class="fa-solid fa-note-sticky text-amber"></i>
            <span>${escapeHtml(cycle.reviewNotes ? `[Revisión Admin]: ${cycle.reviewNotes}` : cycle.notes)}</span>
          </div>
        ` : ''}
      </div>

      <div class="hist-card-footer">
        <div class="hist-signature-status">
          ${isReviewed ? '<span class="text-green"><i class="fa-solid fa-certificate"></i> Guardado en Google Drive &bull; Revisado y Aprobado</span>' : (cycle.signatureBase64 ? '<span class="text-green"><i class="fa-solid fa-file-signature"></i> Firma digital registrada</span>' : (isCompleted ? '<span class="text-green"><i class="fa-solid fa-certificate"></i> Auditado en Excel</span>' : '<span class="text-muted"><i class="fa-solid fa-pen"></i> Pendiente de firma</span>'))}
        </div>
        <div class="hist-card-actions-group" style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          ${!isCompleted ? `
            <button class="btn btn-outline btn-sm btn-reassign-auxiliar" data-cycle-id="${escapeHtml(cycle.cycleId)}" data-centro="${escapeHtml(cycle.centro)}" style="border-color: var(--primary-color); color: var(--primary-color); font-weight: 600; display: inline-flex; align-items: center; gap: 6px;" title="Cambiar auxiliar asignado a este ciclo">
              <i class="fa-solid fa-user-pen"></i> Cambiar Auxiliar
            </button>
          ` : ''}
          ${isReviewed ? `
            <a href="/api/download-excel?centro=${escapeHtml(cycle.centro)}&reviewed=true" class="btn btn-outline btn-sm" style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; border-color: #10b981; color: #10b981;" title="Descargar Reporte Revisado en Excel">
              <i class="fa-solid fa-file-excel"></i> Descargar Reporte (.xlsx)
            </a>
          ` : ''}
          ${cycle.googleDriveFileUrl ? `
            <a href="${escapeHtml(cycle.googleDriveFileUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-success btn-sm" style="display: inline-flex; align-items: center; gap: 6px; font-weight: 600; border-color: #10b981; color: #10b981;" title="Abrir planilla en Google Drive (Nibol/ciclicos)">
              <i class="fa-brands fa-google-drive"></i> Ver en Google Drive
            </a>
          ` : ''}
          ${isCompleted ? `
            <button class="btn btn-outline btn-sm btn-reopen-cycle" data-cycle-id="${escapeHtml(cycle.cycleId)}" data-centro="${escapeHtml(cycle.centro)}" style="border-color: #f59e0b; color: #f59e0b; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;" title="Reabrir este inventario con autorización de Administrador">
              <i class="fa-solid fa-lock-open"></i> Reabrir / Actualizar
            </button>
          ` : ''}
          <button class="btn btn-outline btn-sm btn-view-cycle-detail" data-cycle-id="${escapeHtml(cycle.cycleId)}" style="font-weight: 600; display: inline-flex; align-items: center; gap: 6px;" title="Consultar lista de artículos y detalles del cíclico">
            <i class="fa-solid fa-eye"></i> Consultar Cíclico
          </button>
          <button class="btn btn-outline btn-sm btn-delete-cycle" data-cycle-id="${escapeHtml(cycle.cycleId)}" data-centro="${escapeHtml(cycle.centro)}" style="border-color: #ef4444; color: #ef4444; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;" title="Eliminar cíclico y restaurar artículos al Plan de Cíclicos">
            <i class="fa-solid fa-trash-can"></i> Borrar
          </button>
        </div>
      </div>
    `;

    card.querySelector('.btn-view-cycle-detail')?.addEventListener('click', () => {
      openCycleDetailModal(cycle);
    });

    if (!isCompleted) {
      card.querySelector('.btn-reassign-auxiliar')?.addEventListener('click', () => {
        if (cycle.centro) state.currentCentro = cycle.centro;
        openAssignCycleModal();
      });
    }

    if (isCompleted) {
      card.querySelector('.btn-reopen-cycle')?.addEventListener('click', () => {
        openReopenAuthModal(cycle.cycleId, cycle.centro);
      });
    }

    card.querySelector('.btn-delete-cycle')?.addEventListener('click', () => {
      openDeleteCycleModal(cycle.cycleId, cycle.centro);
    });

    container.appendChild(card);
  });
}

// =============================================================================
// DELETE CYCLIC INVENTORY CONTROLLER (ADMIN / ENCARGADO PASSWORD REQUIRED)
// =============================================================================
let pendingDeleteCycleData = null;

function openDeleteCycleModal(cycleId, centro) {
  const modal = document.getElementById('deleteCycleModal');
  if (!modal) return;

  pendingDeleteCycleData = { cycleId, centro };

  document.getElementById('deleteCycleIdText').textContent = cycleId || 'CYC';
  document.getElementById('deleteCentroText').textContent = `Centro ${centro || state.currentCentro}`;

  const userInput = document.getElementById('deleteAdminUserInput');
  const passInput = document.getElementById('deleteAdminPasswordInput');

  if (state.currentUser) {
    userInput.value = state.currentUser.usuario || state.currentUser.nombre;
  } else {
    userInput.value = '';
  }
  passInput.value = '';

  modal.classList.remove('hidden');
  setTimeout(() => passInput.focus(), 150);
}

function closeDeleteCycleModal() {
  const modal = document.getElementById('deleteCycleModal');
  if (modal) modal.classList.add('hidden');
  pendingDeleteCycleData = null;
}

async function handleDeleteCycleSubmit(e) {
  e.preventDefault();
  if (!pendingDeleteCycleData) return;

  const username = document.getElementById('deleteAdminUserInput')?.value?.trim();
  const password = document.getElementById('deleteAdminPasswordInput')?.value?.trim();

  if (!username || !password) {
    sfx.warning();
    showToast('⚠️ Ingresa tu usuario y contraseña de confirmación.', 'error');
    return;
  }

  const btn = document.getElementById('btnSubmitDeleteCycle');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Eliminando...';

  try {
    const res = await fetch('/api/assignments/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cycleId: pendingDeleteCycleData.cycleId,
        centro: pendingDeleteCycleData.centro,
        username,
        password
      })
    });

    const data = await res.json();
    if (data.success) {
      sfx.saveSuccess();
      showToast(`✓ ${data.message || 'Inventario cíclico eliminado con éxito.'}`, 'success');
      closeDeleteCycleModal();

      // Recargar historial, inventario y métricas para actualizar el Plan de Cíclicos
      await loadCycleHistory();
      await loadInventory();
      await loadAnalytics();
    } else {
      sfx.error();
      showToast('Error al eliminar cíclico: ' + (data.error || 'No autorizado'), 'error');
    }
  } catch (err) {
    sfx.error();
    showToast('Error al eliminar cíclico: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-trash-can"></i> Confirmar y Eliminar Cíclico';
  }
}

// =============================================================================
// REOPEN CYCLIC INVENTORY CONTROLLER (ADMIN AUTHORIZATION REQUIRED)
// =============================================================================
let pendingReopenCycleData = null;

function openReopenAuthModal(cycleId, centro) {
  const modal = document.getElementById('reopenAuthModal');
  if (!modal) return;

  pendingReopenCycleData = { cycleId, centro };

  document.getElementById('reopenCycleIdText').textContent = cycleId || 'CYC';
  document.getElementById('reopenCentroText').textContent = `Centro ${centro || state.currentCentro}`;

  const userInput = document.getElementById('reopenAdminUserInput');
  const passInput = document.getElementById('reopenAdminPasswordInput');
  const reasonInput = document.getElementById('reopenReasonInput');

  // Pre-fill user if already logged in as ENCARGADO / ADMIN
  if (state.currentUser && (state.currentUser.cargo === 'ENCARGADO' || state.currentUser.cargo === 'ADMIN')) {
    userInput.value = state.currentUser.usuario || state.currentUser.nombre;
  } else {
    userInput.value = '';
  }

  passInput.value = '';
  reasonInput.value = '';

  modal.classList.remove('hidden');
  setTimeout(() => passInput.focus(), 150);
}

function closeReopenAuthModal() {
  const modal = document.getElementById('reopenAuthModal');
  if (modal) modal.classList.add('hidden');
  pendingReopenCycleData = null;
}

async function handleReopenCycleSubmit() {
  if (!pendingReopenCycleData) return;

  const adminUsername = document.getElementById('reopenAdminUserInput')?.value?.trim();
  const adminPassword = document.getElementById('reopenAdminPasswordInput')?.value?.trim();
  const reopenReason = document.getElementById('reopenReasonInput')?.value?.trim();

  if (!adminUsername || !adminPassword) {
    sfx.warning();
    showToast('⚠️ Ingresa el usuario y la contraseña del Administrador / Encargado.', 'error');
    return;
  }

  if (!reopenReason) {
    sfx.warning();
    showToast('⚠️ Ingresa el motivo o justificación de la reapertura.', 'error');
    document.getElementById('reopenReasonInput')?.focus();
    return;
  }

  const btn = document.getElementById('btnSubmitReopenCycle');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Validando autorización...';

  try {
    const res = await fetch('/api/assignments/reopen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cycleId: pendingReopenCycleData.cycleId,
        centro: pendingReopenCycleData.centro,
        adminUsername,
        adminPassword,
        reopenReason,
        requestedBy: state.currentUser?.nombre || state.currentUser?.usuario || 'Usuario'
      })
    });

    const data = await res.json();
    if (data.success) {
      sfx.saveSuccess();
      showToast(`✓ Inventario ${pendingReopenCycleData.cycleId} reabierto con éxito para actualización.`, 'success');
      closeReopenAuthModal();
      
      // Update local state and switch to inventory tab to begin counting/updating
      if (pendingReopenCycleData.centro) {
        state.currentCentro = pendingReopenCycleData.centro;
      }
      
      await loadCycleHistory();
      await loadInventory();
      await loadAnalytics();

      // Switch to inventory tab
      switchTab('inventory-tab');
    } else {
      sfx.error();
      showToast('Error de autorización: ' + (data.error || 'No autorizado'), 'error');
    }
  } catch (err) {
    sfx.error();
    showToast('Error al reabrir ciclo: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-lock-open"></i> AUTORIZAR Y REABRIR';
  }
}

function openCycleDetailModal(cycle) {
  const modal = document.getElementById('cycleDetailModal');
  if (!modal) return;

  const isCompleted = cycle.status === 'CONCLUIDO';
  const summary = cycle.summary || {};

  document.getElementById('cycleDetailIdHeader').textContent = cycle.cycleId || 'Cíclico';
  document.getElementById('cycleDetailCentroSubtitle').textContent = `Centro ${cycle.centro} • Estado: ${isCompleted ? 'Concluido y Auditado' : 'Asignado en Proceso'}`;
  document.getElementById('cycleDetailAuxiliarText').textContent = `${cycle.assignedToUserName || 'Auxiliar'} (@${cycle.assignedToUserLogin || cycle.assignedToUserId || ''})`;
  document.getElementById('cycleDetailEncargadoText').textContent = cycle.assignedByUserName || 'Encargado';
  document.getElementById('cycleDetailAssignedAtText').textContent = cycle.assignedAt ? cycle.assignedAt.substring(0, 19).replace('T', ' ') : '-';
  document.getElementById('cycleDetailCompletedAtText').textContent = cycle.completedAt ? cycle.completedAt.substring(0, 19).replace('T', ' ') : 'En ejecución';

  const itemsCount = summary.totalCount !== undefined ? `${summary.countedCount || 0} / ${summary.totalCount}` : '-';
  const ira = summary.iraPercent !== undefined ? `${summary.iraPercent}%` : (isCompleted ? '100%' : '-');
  const exact = summary.withoutVarianceCount !== undefined ? summary.withoutVarianceCount : '-';
  const discrepancies = summary.discrepanciesCount !== undefined ? summary.discrepanciesCount : '-';
  const netCost = summary.netVarianceValue !== undefined ? `$${Number(summary.netVarianceValue).toLocaleString('es-CO', { minimumFractionDigits: 2 })}` : '$0.00';

  document.getElementById('cycleDetailItemsVal').textContent = itemsCount;
  document.getElementById('cycleDetailIraVal').textContent = ira;
  document.getElementById('cycleDetailExactVal').textContent = exact;
  document.getElementById('cycleDetailDiscrepanciesVal').textContent = discrepancies;
  document.getElementById('cycleDetailNetVal').textContent = netCost;

  document.getElementById('cycleDetailNotesText').textContent = cycle.notes || 'Sin observaciones registradas.';

  // Google Drive link handling
  const driveBox = document.getElementById('cycleDetailDriveBox');
  const driveLink = document.getElementById('cycleDetailDriveLink');
  const driveTargetUrl = cycle.googleDriveFileUrl || cycle.googleDriveFolderUrl || cycle.driveFolderUrl;
  if (driveTargetUrl) {
    if (driveBox) driveBox.style.display = 'flex';
    if (driveLink) driveLink.href = driveTargetUrl;
  } else {
    if (driveBox) driveBox.style.display = 'none';
  }

  const sigImg = document.getElementById('cycleDetailSigImg');
  const noSigText = document.getElementById('cycleDetailNoSigText');
  if (cycle.signatureBase64) {
    sigImg.src = cycle.signatureBase64;
    sigImg.style.display = 'inline-block';
    noSigText.style.display = 'none';
  } else {
    sigImg.style.display = 'none';
    noSigText.style.display = 'inline-block';
  }

  // Load & render items table for this cycle/centro
  const tbody = document.getElementById('cycleDetailItemsTbody');
  const badge = document.getElementById('cycleDetailItemsBadge');
  const searchInput = document.getElementById('cycleDetailItemsSearch');
  if (searchInput) searchInput.value = '';

  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding: 16px;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando lista de artículos del Centro...</td></tr>';
    
    fetch(`/api/inventory?centro=${encodeURIComponent(cycle.centro || state.currentCentro)}`)
      .then(res => res.json())
      .then(invData => {
        const items = invData.items || [];
        if (badge) badge.textContent = items.length;
        renderCycleDetailItems(items);

        if (searchInput) {
          searchInput.oninput = (e) => {
            const q = e.target.value.toLowerCase().trim();
            const filtered = items.filter(it => 
              (it.sku && it.sku.toLowerCase().includes(q)) ||
              (it.description && it.description.toLowerCase().includes(q)) ||
              (it.location && it.location.toLowerCase().includes(q))
            );
            renderCycleDetailItems(filtered);
          };
        }
      })
      .catch(err => {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger" style="padding: 16px;">Error al cargar artículos: ${escapeHtml(err.message)}</td></tr>`;
      });
  }

  modal.classList.remove('hidden');
}

function renderCycleDetailItems(items) {
  const tbody = document.getElementById('cycleDetailItemsTbody');
  if (!tbody) return;

  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding: 16px;">No se encontraron artículos en este centro</td></tr>';
    return;
  }

  tbody.innerHTML = items.map(item => {
    const unitCost = Number(item.unitCost || 0);
    const sysStock = Number(item.systemStock || 0);
    const physStock = (item.physicalStock !== null && item.physicalStock !== undefined && item.physicalStock !== '') ? Number(item.physicalStock) : null;
    const variance = (physStock !== null) ? physStock - sysStock : null;

    let statusBadge = '<span class="status-badge status-pending">Pendiente</span>';
    if (physStock !== null) {
      if (variance === 0) {
        statusBadge = '<span class="status-badge status-exact">Exacto</span>';
      } else if (variance < 0) {
        statusBadge = `<span class="status-badge status-missing">Faltante (${variance})</span>`;
      } else {
        statusBadge = `<span class="status-badge status-surplus">Sobrante (+${variance})</span>`;
      }
    }

    return `
      <tr>
        <td class="font-mono"><strong>${escapeHtml(item.sku)}</strong></td>
        <td>${escapeHtml(item.description || '-')}</td>
        <td><span class="location-badge">${escapeHtml(item.location || '-')}</span></td>
        <td style="text-align: right;">$${unitCost.toFixed(2)}</td>
        <td style="text-align: right; font-weight: 600;">${sysStock}</td>
        <td style="text-align: right; font-weight: 700; color: ${physStock !== null ? 'var(--primary-color)' : 'var(--text-secondary)'};">${physStock !== null ? physStock : '-'}</td>
        <td style="text-align: right; font-weight: 600; color: ${variance === null ? 'inherit' : (variance === 0 ? 'var(--green)' : 'var(--red)')};">${variance !== null ? (variance > 0 ? `+${variance}` : variance) : '-'}</td>
        <td style="text-align: center;">${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

// =============================================================================
// ASSIGNED CYCLIC NOTIFICATION MODAL (MEDIA PANTALLA PARA AUXILIARES)
// =============================================================================
function showAssignedCyclicModal(assignment) {
  if (!assignment || assignment.status !== 'ASIGNADO') return;
  const modal = document.getElementById('assignedCyclicAlertModal');
  if (!modal) return;

  const u = state.currentUser;
  const auxNameElem = document.getElementById('alertAuxiliarName');
  if (auxNameElem) {
    auxNameElem.textContent = u ? (u.nombre || u.usuario) : (assignment.assignedToUserName || 'Operador');
  }

  const centroElem = document.getElementById('alertCentroText');
  if (centroElem) {
    centroElem.textContent = `Centro ${assignment.centro || state.currentCentro}`;
  }

  const cycleIdElem = document.getElementById('alertCycleIdText');
  if (cycleIdElem) {
    cycleIdElem.textContent = assignment.cycleId || 'Cíclico Activo';
  }

  const assignedByElem = document.getElementById('alertAssignedByText');
  if (assignedByElem) {
    assignedByElem.textContent = assignment.assignedByUserName || 'Encargado de Centro';
  }

  const assignedAtElem = document.getElementById('alertAssignedAtText');
  if (assignedAtElem) {
    const rawDate = assignment.assignedAt ? assignment.assignedAt.substring(0, 19).replace('T', ' ') : '-';
    assignedAtElem.textContent = rawDate;
  }

  const notesElem = document.getElementById('alertNotesText');
  if (notesElem) {
    if (assignment.notes && assignment.notes.trim()) {
      notesElem.textContent = `"${assignment.notes.trim()}"`;
    } else {
      notesElem.textContent = 'Realiza el conteo físico de los artículos asignados e ingresa las cantidades directamente en la tabla. Al finalizar, podrás firmar de conformidad.';
    }
  }

  // Play audio notification chime
  sfx.notifyCycle();

  // Show the modal
  modal.classList.remove('hidden');

  // Register in sessionStorage to avoid repeating automatically upon passive refreshes in this session
  sessionStorage.setItem(`notified_cycle_${assignment.cycleId}`, 'true');
}

function hideAssignedCyclicModal() {
  const modal = document.getElementById('assignedCyclicAlertModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function checkAndShowAuxiliarAssignedAlert(user, centro, forceShow = false) {
  if (!user || user.cargo !== 'AUXILIAR') return;
  const targetCentro = centro || user.centro || state.currentCentro || '1300';

  try {
    const params = new URLSearchParams({
      centro: targetCentro,
      userId: user.id || '',
      userCargo: user.cargo || 'AUXILIAR',
      userName: user.nombre || user.usuario || '',
      userLogin: user.usuario || ''
    });

    const res = await fetch(`/api/assignments/check-user?${params.toString()}`);
    const data = await res.json();

    if (data.success && data.hasActiveAssignment && data.assignment) {
      const alreadyNotified = sessionStorage.getItem(`notified_cycle_${data.assignment.cycleId}`);
      if (forceShow || !alreadyNotified) {
        showAssignedCyclicModal(data.assignment);
      }
    }
  } catch (err) {
    console.warn('Notice checking active assignment notification:', err.message);
  }
}

// =============================================================================
// JUSTIFICATIONS & FINAL VERIFICATION CONTROLLER (ADMIN ONLY)
// =============================================================================
let justificationsState = {
  items: [],
  targetFolderCode: '',
  googleDriveUrl: ''
};

async function loadJustificationsData() {
  if (state.currentUser?.cargo !== 'ADMIN') return;

  const user = state.currentUser;
  const curCentro = state.currentCentro || '1300';
  const query = new URLSearchParams({
    centro: curCentro,
    userCargo: user.cargo || '',
    userCentro: user.centro || '',
    userLogin: user.usuario || ''
  });

  try {
    const res = await fetch(`/api/justifications?${query.toString()}`);
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Error cargando datos de verificación');
    }

    justificationsState.items = data.items || [];
    justificationsState.googleDriveUrl = data.googleDriveRootUrl || 'https://drive.google.com/drive/folders/1eYg5xYTpWVhgBk_vLDJH3_ZxAMxGc-wY?usp=sharing';
    justificationsState.targetFolderCode = `Centro_${data.centro}_${data.date || new Date().toISOString().substring(0, 10)}`;

    const folderCodeElem = document.getElementById('justifTargetFolderCode');
    if (folderCodeElem) folderCodeElem.textContent = justificationsState.targetFolderCode;

    // Document download button & Google Drive button bindings
    const docBtn = document.getElementById('btnDownloadJustifDoc');
    const docNameText = document.getElementById('justifDocFileNameText');
    if (docBtn && data.documentDownloadUrl) {
      docBtn.href = data.documentDownloadUrl;
    }
    if (docNameText && data.documentFileName) {
      docNameText.textContent = data.documentFileName;
    }
    const driveLinkBtn = document.getElementById('justifDriveLinkBtn');
    if (driveLinkBtn && data.googleDriveRootUrl) {
      driveLinkBtn.href = data.googleDriveRootUrl;
    }

    // Update KPI strip
    const summary = data.summary || {};
    const discElem = document.getElementById('justifKpiDiscrepancies');
    if (discElem) discElem.textContent = summary.discrepanciesCount || 0;

    const justElem = document.getElementById('justifKpiJustified');
    if (justElem) justElem.textContent = summary.justifiedCount || 0;

    const pendElem = document.getElementById('justifKpiPending');
    if (pendElem) pendElem.textContent = summary.pendingJustificationCount || 0;

    const badge = document.getElementById('justificationsPendingBadge');
    if (badge) {
      badge.textContent = summary.pendingJustificationCount || 0;
      badge.style.display = summary.pendingJustificationCount > 0 ? 'inline-flex' : 'none';
    }

    let netCost = 0;
    justificationsState.items.forEach(i => {
      if (i.isDiscrepancy) {
        netCost += Number(i.varianceCost || 0);
      }
    });
    const netElem = document.getElementById('justifKpiNetCost');
    if (netElem) {
      netElem.textContent = `$${netCost.toLocaleString('es-CO', { minimumFractionDigits: 2 })}`;
      netElem.className = `justif-kpi-val ${netCost < 0 ? 'text-red' : (netCost > 0 ? 'text-primary' : 'text-green')}`;
    }

    renderJustificationsTable(justificationsState.items);
  } catch (err) {
    console.error('Error loading justifications:', err);
    showToast('Error al cargar verificaciones: ' + err.message, 'error');
  }
}

function renderJustificationsTable(items) {
  const tbody = document.getElementById('justificationsTbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const searchVal = (document.getElementById('justifSearchInput')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('justifStatusFilter')?.value || 'DISCREPANCIAS';
  const justifiedFilter = document.getElementById('justifJustifiedFilter')?.value || '';

  let filtered = (items || []).filter(item => {
    // Status filter
    if (statusFilter === 'DISCREPANCIAS' && !item.isDiscrepancy) return false;
    if (statusFilter === 'FALTANTES' && item.status !== 'Faltante') return false;
    if (statusFilter === 'SOBRANTES' && item.status !== 'Sobrante') return false;

    // Justified filter
    if (justifiedFilter === 'PENDIENTE' && item.isJustified) return false;
    if (justifiedFilter === 'JUSTIFICADO' && !item.isJustified) return false;

    // Search filter
    if (searchVal) {
      const match = (item.sku && item.sku.toLowerCase().includes(searchVal)) ||
                    (item.description && item.description.toLowerCase().includes(searchVal)) ||
                    (item.location && item.location.toLowerCase().includes(searchVal)) ||
                    (item.comments && item.comments.toLowerCase().includes(searchVal));
      if (!match) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="12">No se encontraron artículos que coincidan con los filtros aplicados.</td></tr>`;
    return;
  }

  filtered.forEach(item => {
    const tr = document.createElement('tr');
    tr.id = `justif-row-${item.sku}`;
    if (item.isJustified) tr.classList.add('row-justified');

    const statusBadgeClass = item.status === 'Faltante' ? 'faltante' : (item.status === 'Sobrante' ? 'sobrante' : (item.status === 'Cuadrado' ? 'cuadrado' : 'pendiente'));
    const initialPhys = item.physicalStock !== null && item.physicalStock !== undefined ? item.physicalStock : '-';
    const finalQty = item.finalVerifiedStock !== null && item.finalVerifiedStock !== undefined ? item.finalVerifiedStock : (item.physicalStock !== null ? item.physicalStock : 0);

    const safeSku = escapeHtml(item.sku);
    const photos = item.photos || [];

    // Photos thumbnails list HTML
    let photosHtml = `<div class="photos-cell-wrapper" id="photos-cell-${safeSku}">`;
    photos.forEach((pUrl, pIdx) => {
      photosHtml += `
        <div class="photo-thumb-item" onclick="openPhotoLightbox('${escapeHtml(pUrl)}', 'SKU ${safeSku} - Evidencia ${pIdx + 1}')" title="Ver foto ampliada">
          <img src="${escapeHtml(pUrl)}" alt="Evidencia" class="photo-thumb-img">
          <button type="button" class="btn-delete-photo" onclick="event.stopPropagation(); deleteEvidencePhoto('${safeSku}', '${escapeHtml(pUrl)}')" title="Eliminar foto">&times;</button>
        </div>
      `;
    });
    photosHtml += `
      <label class="btn-add-photo" title="Tomar foto o subir evidencia">
        <i class="fa-solid fa-camera"></i>
        <input type="file" accept="image/*" capture="environment" style="display: none;" onchange="handlePhotoUpload(event, '${safeSku}', '${escapeHtml(item.description)}')">
      </label>
    </div>`;

    const diffSign = item.variance > 0 ? '+' : '';
    const diffClass = item.variance < 0 ? 'text-red' : (item.variance > 0 ? 'text-primary' : 'text-green');

    tr.innerHTML = `
      <td>
        <strong class="font-mono text-primary">${safeSku}</strong>
      </td>
      <td>
        <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(item.description)}</div>
        <div style="font-size: 0.76rem; color: var(--text-muted);"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(item.location || '-')} &bull; $${Number(item.unitCost).toFixed(2)}</div>
      </td>
      <td class="text-center font-mono">${item.systemStock}</td>
      <td class="text-center font-mono text-muted">${initialPhys}</td>
      <td class="text-center">
        <input type="number" min="0" class="justif-count-input" id="justif-qty-${safeSku}" value="${finalQty}" oninput="recalcJustifRow('${safeSku}', ${item.systemStock}, ${item.unitCost})" />
      </td>
      <td class="text-center">
        <strong id="justif-diff-${safeSku}" class="${diffClass}">${diffSign}${item.variance}</strong>
      </td>
      <td class="text-center">
        <strong id="justif-cost-${safeSku}" class="${diffClass}">$${item.varianceCost}</strong>
      </td>
      <td class="text-center">
        <span id="justif-status-${safeSku}" class="status-badge ${statusBadgeClass}">${item.status}</span>
      </td>
      <td>
        <select class="justif-select" id="justif-type-${safeSku}">
          <option value="MERMA_DETERIORO" ${item.justificationType === 'MERMA_DETERIORO' ? 'selected' : ''}>Merma / Deterioro</option>
          <option value="ERROR_FACTURACION_SISTEMA" ${item.justificationType === 'ERROR_FACTURACION_SISTEMA' ? 'selected' : ''}>Error en Sistema / Facturación</option>
          <option value="UBICACION_CRUZADA" ${item.justificationType === 'UBICACION_CRUZADA' ? 'selected' : ''}>Ubicación Cruzada / Incorrecta</option>
          <option value="MUESTRA_COMERCIAL" ${item.justificationType === 'MUESTRA_COMERCIAL' ? 'selected' : ''}>Muestra Comercial / Exhibición</option>
          <option value="AJUSTE_ADMINISTRATIVO" ${item.justificationType === 'AJUSTE_ADMINISTRATIVO' || !item.justificationType ? 'selected' : ''}>Ajuste Administrativo</option>
          <option value="OTRO" ${item.justificationType === 'OTRO' ? 'selected' : ''}>Otro Motivo</option>
        </select>
      </td>
      <td>
        <input type="text" class="justif-comment-input" id="justif-comment-${safeSku}" placeholder="Escribe el motivo o justificación..." value="${escapeHtml(item.comments || '')}" />
      </td>
      <td>${photosHtml}</td>
      <td class="text-center">
        <button type="button" class="btn btn-primary btn-sm btn-save-justif" id="btn-save-justif-${safeSku}" onclick="saveSingleJustification('${safeSku}')">
          <i class="fa-solid fa-floppy-disk"></i> Guardar
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function recalcJustifRow(sku, sysStock, unitCost) {
  const input = document.getElementById(`justif-qty-${sku}`);
  if (!input) return;

  const raw = input.value.trim();
  const finalQty = (raw !== '' && !isNaN(raw)) ? Number(raw) : 0;
  const variance = finalQty - sysStock;
  const varianceCost = Number((variance * (Number(unitCost) || 0)).toFixed(2));

  let status = 'Cuadrado';
  let badgeClass = 'cuadrado';
  let diffClass = 'text-green';
  if (variance < 0) {
    status = 'Faltante';
    badgeClass = 'faltante';
    diffClass = 'text-red';
  } else if (variance > 0) {
    status = 'Sobrante';
    badgeClass = 'sobrante';
    diffClass = 'text-primary';
  }

  const diffElem = document.getElementById(`justif-diff-${sku}`);
  if (diffElem) {
    diffElem.textContent = `${variance > 0 ? '+' : ''}${variance}`;
    diffElem.className = diffClass;
  }

  const costElem = document.getElementById(`justif-cost-${sku}`);
  if (costElem) {
    costElem.textContent = `$${varianceCost}`;
    costElem.className = diffClass;
  }

  const statusElem = document.getElementById(`justif-status-${sku}`);
  if (statusElem) {
    statusElem.textContent = status;
    statusElem.className = `status-badge ${badgeClass}`;
  }
}

async function handlePhotoUpload(event, sku, description) {
  const file = event.target.files?.[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('photo', file);
  formData.append('centro', state.currentCentro || '1300');
  formData.append('sku', sku);
  formData.append('description', description);

  try {
    showToast(`Subiendo evidencia para SKU ${sku}...`, 'info');
    const res = await fetch('/api/justifications/upload-photo', {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Error al subir foto');
    }

    sfx.saveSuccess();
    showToast(`✓ Foto subida y guardada: ${data.fileName}`, 'success');

    // Update item photos list in memory
    const item = (justificationsState.items || []).find(i => String(i.sku).toUpperCase() === String(sku).toUpperCase());
    if (item) {
      item.photos = item.photos || [];
      item.photos.push(data.relativeUrl);
      item.isJustified = true;
    }

    renderJustificationsTable(justificationsState.items);
  } catch (err) {
    sfx.error();
    showToast('Error al subir foto: ' + err.message, 'error');
  }
}

async function deleteEvidencePhoto(sku, photoUrl) {
  if (!confirm('¿Deseas eliminar esta foto de evidencia?')) return;

  try {
    const res = await fetch('/api/justifications/photo', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        relativeUrl: photoUrl,
        userCargo: state.currentUser?.cargo || ''
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Error al eliminar foto');

    const item = (justificationsState.items || []).find(i => String(i.sku).toUpperCase() === String(sku).toUpperCase());
    if (item && item.photos) {
      item.photos = item.photos.filter(p => p !== photoUrl);
    }
    showToast('Foto eliminada', 'info');
    renderJustificationsTable(justificationsState.items);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function saveSingleJustification(sku) {
  const item = (justificationsState.items || []).find(i => String(i.sku).toUpperCase() === String(sku).toUpperCase());
  if (!item) return;

  const btn = document.getElementById(`btn-save-justif-${sku}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
  }

  const finalQtyInput = document.getElementById(`justif-qty-${sku}`);
  const finalQty = finalQtyInput ? parseInt(finalQtyInput.value, 10) : item.physicalStock;
  const justificationType = document.getElementById(`justif-type-${sku}`)?.value || 'AJUSTE_ADMINISTRATIVO';
  const comments = document.getElementById(`justif-comment-${sku}`)?.value || '';

  const payload = {
    centro: state.currentCentro || '1300',
    sku: item.sku,
    description: item.description,
    location: item.location,
    unitCost: item.unitCost,
    systemStock: item.systemStock,
    physicalStock: item.physicalStock,
    finalVerifiedStock: finalQty,
    justificationType,
    comments,
    photos: item.photos || [],
    userCargo: state.currentUser?.cargo || '',
    userCentro: state.currentUser?.centro || '',
    userLogin: state.currentUser?.usuario || '',
    userName: state.currentUser?.nombre || ''
  };

  try {
    const res = await fetch('/api/justifications/verify-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Error al guardar verificación');
    }

    sfx.saveSuccess();
    showToast(`✓ Verificación y justificación de ${sku} guardada en Excel y Auditoría`, 'success');

    // Update in memory
    item.finalVerifiedStock = finalQty;
    item.variance = finalQty - item.systemStock;
    item.varianceCost = Number((item.variance * item.unitCost).toFixed(2));
    item.status = item.variance === 0 ? 'Cuadrado' : (item.variance < 0 ? 'Faltante' : 'Sobrante');
    item.isDiscrepancy = item.status === 'Faltante' || item.status === 'Sobrante';
    item.justificationType = justificationType;
    item.comments = comments;
    item.isJustified = true;

    // Refresh KPI counts
    loadJustificationsData();
  } catch (err) {
    sfx.error();
    showToast('Error: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar';
    }
  }
}

function openPhotoLightbox(photoUrl, title = 'Evidencia Fotográfica', subtitle = '') {
  openImageLightbox(photoUrl, title, subtitle);
}

// =============================================================================
// FINISH VERIFICATION REVIEW & EXPORT TO DRIVE (ADMIN ONLY)
// =============================================================================
function openFinishReviewModal() {
  if (state.currentUser?.cargo !== 'ADMIN') {
    showToast('Solo los administradores pueden finalizar la revisión oficial.', 'error');
    return;
  }

  const modal = document.getElementById('finishReviewConfirmModal');
  if (!modal) return;

  const curCentro = state.currentCentro || '1300';
  const totalDisc = (justificationsState.items || []).filter(i => i.isDiscrepancy).length;
  const justifiedCount = (justificationsState.items || []).filter(i => i.isDiscrepancy && i.isJustified).length;

  document.getElementById('finishReviewCentroText').textContent = `Centro ${curCentro}`;
  document.getElementById('finishReviewDiscrepanciesText').textContent = `${totalDisc} ${totalDisc === 1 ? 'ítem' : 'ítems'}`;
  document.getElementById('finishReviewJustifiedText').textContent = `${justifiedCount} de ${totalDisc} justificados`;

  const notesInput = document.getElementById('finishReviewFinalNotes');
  if (notesInput) notesInput.value = '';

  modal.classList.remove('hidden');
}

function closeFinishReviewConfirmModal() {
  const modal = document.getElementById('finishReviewConfirmModal');
  if (modal) modal.classList.add('hidden');
}

function closeFinishReviewSuccessModal() {
  const modal = document.getElementById('finishReviewSuccessModal');
  if (modal) modal.classList.add('hidden');
}

async function handleFinishReviewSubmit() {
  const btn = document.getElementById('btnSubmitFinishReview');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando en Google Drive...';
  }

  const user = state.currentUser;
  const curCentro = state.currentCentro || '1300';
  const finalNotes = document.getElementById('finishReviewFinalNotes')?.value || '';

  try {
    const res = await fetch('/api/justifications/finish-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        centro: curCentro,
        userCargo: user?.cargo || 'ADMIN',
        userCentro: user?.centro || '',
        userLogin: user?.usuario || '',
        userName: user?.nombre || '',
        finalNotes
      })
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Error al finalizar la revisión');
    }

    // Close confirmation modal
    closeFinishReviewConfirmModal();

    // Setup success & download question modal
    const successModal = document.getElementById('finishReviewSuccessModal');
    if (successModal) {
      const nameElem = document.getElementById('finishSuccessFileName');
      if (nameElem) nameElem.textContent = data.fileName || `${data.date}_Ciclico_Centro_${data.centro}_Revisado`;

      const downloadBtn = document.getElementById('btnDownloadRevisedExcelDoc');
      if (downloadBtn) {
        downloadBtn.href = data.downloadUrl || `/api/download-excel?centro=${curCentro}&date=${data.date}&reviewed=true`;
      }

      const driveBtn = document.getElementById('btnOpenRevisedGoogleDrive');
      if (driveBtn) {
        driveBtn.href = data.googleDriveFileUrl || 'https://drive.google.com/drive/folders/1eYg5xYTpWVhgBk_vLDJH3_ZxAMxGc-wY';
      }

      successModal.classList.remove('hidden');
    }

    sfx.saveSuccess();
    showToast(`✓ Revisión finalizada y guardada en Google Drive (Nibol/ciclicos)`, 'success');

    // 1. Clear local memory and refresh views
    state.inventory = [];
    justificationsState.items = [];
    
    await loadJustificationsData();
    await loadInventory();
    await loadCycleHistory();
    await loadAnalytics();
  } catch (err) {
    sfx.error();
    showToast('Error al terminar revisión: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-flag-checkered"></i> GUARDAR EN DRIVE Y TERMINAR';
    }
  }
}

// =============================================================================
// CONCLUIR REVISIÓN DIRECTA (COMPATIBILIDAD FRONT.JS & GOOGLE APPS SCRIPT)
// =============================================================================
async function concluirRevision(customPayload = null) {
  const currentType = state.currentInventoryType || 'ciclico';
  const SCRIPT_URL = (state.config?.googleSheetUrls && state.config.googleSheetUrls[currentType]) ||
    state.config?.googleSheetUrl ||
    "https://script.google.com/macros/s/AKfycbwpJ5klIWQmhhM4RNgxfG4QabqLOOb2KCVhLPhyIWvHeUsQ39wgHjMt3sHLJo9tH-9p/exec";
  const curCentro = state.currentCentro || '1300';
  const nowStr = new Date().toISOString().substring(0, 10);
  const typeLabel = currentType.charAt(0).toUpperCase() + currentType.slice(1);
  const finalNotes = document.getElementById('finishReviewFinalNotes')?.value || '';

  // Generar correcciones dinámicas a partir de las justificaciones realizadas
  const dynamicCorrections = (justificationsState.items || [])
    .filter(i => i.isJustified)
    .map((item, idx) => ({
      celda: `A${idx + 2}`,
      valor: item.sku,
      sku: item.sku,
      descripcion: item.description,
      conteoFinal: item.finalVerifiedStock,
      justificacion: item.justificationType || 'Ajuste Aprobado',
      comentario: item.comments || ''
    }));

  const payload = customPayload || {
    action: "concluirRevision",
    centro: curCentro,
    inventoryType: currentType,
    adminName: state.currentUser?.nombre || state.currentUser?.usuario || 'ADMIN',
    nuevoNombre: `${nowStr}_${typeLabel}_Centro_${curCentro}_Revisado`,
    observacionesGenerales: finalNotes || "Revisión completada sin novedades críticas.",
    items: justificationsState.items || [],
    correcciones: dynamicCorrections.length > 0 ? dynamicCorrections : [
      { celda: "A1", valor: "CENTRO " + curCentro + " - REVISIÓN CONCLUIDA" }
    ]
  };

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // Evita problemas de CORS preflight
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.status === "success" || result.success) {
      const fileUrl = result.newFileUrl || result.fileUrl;
      console.log("✓ Enlace a la copia generada en Google Drive:", fileUrl);
      showToast("¡Copia creada con éxito en Google Drive (Nibol/ciclicos)!", "success");
      return { success: true, ...result, newFileUrl: fileUrl, fileUrl: fileUrl };
    } else {
      console.error("Error en Apps Script:", result.message || result.error);
      showToast("Error en Apps Script: " + (result.message || result.error), "error");
      return { success: false, ...result };
    }
  } catch (err) {
    console.error("Error en la llamada a Apps Script:", err);
    showToast("Error de conexión con Google Apps Script: " + err.message, "error");
    throw err;
  }
}

// Exponer la función para uso global o consola
window.concluirRevision = concluirRevision;

// =============================================================================
// =============================================================================
// MÓDULO DEDICADO: ENTORNO DE CONTEO BARRIDO GENERAL & SANEAMIENTO
// =============================================================================
// =============================================================================

const barridoState = {
  isOpen: false,
  sessionStartDate: null, // "YYYY-MM-DD"
  sessionStartTimestamp: null, // "DD/MM/YYYY HH:mm"
  sessionCountedItems: 0,
  recentItems: [],
  
  // Scanner Engine & Focus Reticle
  html5QrCode: null,
  isCameraRunning: false,
  facingMode: 'environment',
  torchOn: false,
  reticlePreset: 'barcode', // 'barcode', 'qr', 'custom'
  reticleWidth: 280,
  reticleHeight: 140,
  
  // 1-Second Stabilization Delay Engine
  candidateCode: null,
  candidateStartTime: 0,
  stabilizeInterval: null,
  isStabilizing: false,
  lastSuccessfulScan: null,
  lastScanTimestamp: 0,
  
  // Current Item Form
  currentItem: null,
  extraLocations: [],
  damagedPhotoBlob: null,
  damagedPhotoBase64: null,
  damagedPhotoFileName: null,
  listenersBound: false
};

/**
 * Open the dedicated Barrido Counting Environment
 */
function openBarridoCountingEnvironment() {
  state.currentInventoryType = 'barrido';
  barridoState.isOpen = true;

  // Strict Centro lock for Encargados & Auxiliares
  if (state.currentUser && (state.currentUser.cargo === 'ENCARGADO' || state.currentUser.cargo === 'AUXILIAR')) {
    if (state.currentUser.centro && state.currentUser.centro !== 'TODOS') {
      state.currentCentro = String(state.currentUser.centro);
      localStorage.setItem('cyclic_active_centro', state.currentCentro);
    }
  }

  // Initialize session start date if not yet initialized
  const now = new Date();
  if (!barridoState.sessionStartDate) {
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    barridoState.sessionStartDate = `${yyyy}-${mm}-${dd}`;
    barridoState.sessionStartTimestamp = `${dd}/${mm}/${yyyy} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  // Hide other views and show Barrido Environment
  const dashboardView = document.getElementById('inventoryTasksDashboardView');
  const countingSheetView = document.getElementById('inventoryCountingSheetView');
  const barridoView = document.getElementById('barridoCountingView');

  if (dashboardView) dashboardView.classList.add('hidden');
  if (countingSheetView) countingSheetView.classList.add('hidden');
  if (barridoView) barridoView.classList.remove('hidden');

  // Update Topbar Info
  const curCentro = state.currentCentro || '1300';
  const centroText = document.getElementById('barridoActiveCentroText');
  if (centroText) centroText.textContent = curCentro;

  const sessionText = document.getElementById('barridoSessionStartText');
  if (sessionText) sessionText.textContent = barridoState.sessionStartTimestamp;

  updateBarridoSessionBadge();

  // Show Screen 1 (Code Entry & Scanner) by default
  showBarridoScreen('codeEntry');

  // Bind event listeners once
  if (!barridoState.listenersBound) {
    bindBarridoEventListeners();
    barridoState.listenersBound = true;
  }

  // Pre-load Barrido items in background for instant search
  loadBarridoInventoryCache();

  // Focus main input
  setTimeout(() => {
    const input = document.getElementById('barridoCodeInput');
    if (input) input.focus();
  }, 150);

  // Apply default reticle preset
  applyBarridoReticlePreset(barridoState.reticlePreset);
}

/**
 * Close Barrido Environment and return to Tasks Dashboard
 */
function closeBarridoCountingEnvironment() {
  barridoState.isOpen = false;

  // Stop camera if running
  stopBarridoCamera();

  const barridoView = document.getElementById('barridoCountingView');
  const dashboardView = document.getElementById('inventoryTasksDashboardView');

  if (barridoView) barridoView.classList.add('hidden');
  if (dashboardView) dashboardView.classList.remove('hidden');

  loadInventoryTasksSummary();
}

/**
 * Switch between Screen 1 (Code Entry) and Screen 2 (Item Detail)
 */
function showBarridoScreen(screen = 'codeEntry') {
  const screen1 = document.getElementById('barridoScreenCodeEntry');
  const screen2 = document.getElementById('barridoScreenItemDetail');

  if (screen === 'codeEntry') {
    if (screen2) screen2.classList.add('hidden');
    if (screen1) screen1.classList.remove('hidden');
    
    // Reset inputs and focus
    const input = document.getElementById('barridoCodeInput');
    if (input) {
      input.value = '';
      input.focus();
    }
    const clearBtn = document.getElementById('btnBarridoClearCode');
    if (clearBtn) clearBtn.classList.add('hidden');
  } else if (screen === 'itemDetail') {
    if (screen1) screen1.classList.add('hidden');
    if (screen2) screen2.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function updateBarridoSessionBadge() {
  const badge = document.getElementById('barridoSessionCountBadge');
  if (badge) badge.textContent = barridoState.sessionCountedItems;
}

/**
 * Pre-cache Barrido inventory items for fast lookup
 */
let barridoItemsCache = [];
async function loadBarridoInventoryCache() {
  try {
    const curCentro = state.currentCentro || '1300';
    const params = new URLSearchParams({
      centro: curCentro,
      type: 'barrido',
      userCargo: state.currentUser?.cargo || 'ADMIN',
      userName: state.currentUser?.nombre || state.currentUser?.usuario || 'Operador',
      userId: state.currentUser?.id || ''
    });
    const res = await fetch(`/api/inventory?${params.toString()}`);
    const data = await res.json();
    if (data.items && Array.isArray(data.items)) {
      barridoItemsCache = data.items;
      console.log(`✓ Inventario Barrido precargado: ${barridoItemsCache.length} items.`);
    }
  } catch (err) {
    console.warn('Aviso precargando inventario barrido:', err.message);
  }
}

/**
 * Bind all event listeners for the Barrido Environment
 */
function bindBarridoEventListeners() {
  // 1. Back button
  document.getElementById('btnBackFromBarrido')?.addEventListener('click', () => {
    closeBarridoCountingEnvironment();
  });

  // 2. Fullscreen toggle
  document.getElementById('btnToggleBarridoFullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // 3. Code Form Submit & Clear
  const codeInput = document.getElementById('barridoCodeInput');
  const clearBtn = document.getElementById('btnBarridoClearCode');

  codeInput?.addEventListener('input', () => {
    if (codeInput.value.trim()) {
      clearBtn?.classList.remove('hidden');
    } else {
      clearBtn?.classList.add('hidden');
    }
  });

  clearBtn?.addEventListener('click', () => {
    if (codeInput) {
      codeInput.value = '';
      clearBtn.classList.add('hidden');
      codeInput.focus();
    }
  });

  document.getElementById('barridoCodeForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = codeInput?.value.trim();
    if (code) {
      lookupBarridoItem(code);
    }
  });

  // 4. Reticle Presets
  const presetBtns = document.querySelectorAll('.btn-reticle-preset');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const preset = btn.getAttribute('data-preset');
      applyBarridoReticlePreset(preset);
    });
  });

  // 5. Reticle Sliders
  const widthSlider = document.getElementById('barridoReticleWidthSlider');
  const heightSlider = document.getElementById('barridoReticleHeightSlider');
  const widthVal = document.getElementById('barridoReticleWidthVal');
  const heightVal = document.getElementById('barridoReticleHeightVal');
  const reticleBox = document.getElementById('barridoReticleBox');

  widthSlider?.addEventListener('input', (e) => {
    const val = e.target.value;
    if (widthVal) widthVal.textContent = `${val}px`;
    if (reticleBox) reticleBox.style.width = `${val}px`;
    barridoState.reticleWidth = Number(val);
  });

  heightSlider?.addEventListener('input', (e) => {
    const val = e.target.value;
    if (heightVal) heightVal.textContent = `${val}px`;
    if (reticleBox) reticleBox.style.height = `${val}px`;
    barridoState.reticleHeight = Number(val);
  });

  // 6. Camera Controls
  document.getElementById('btnToggleBarridoCamera')?.addEventListener('click', () => {
    if (barridoState.isCameraRunning) {
      stopBarridoCamera();
    } else {
      startBarridoCamera();
    }
  });

  document.getElementById('btnStartCameraOverlay')?.addEventListener('click', () => {
    startBarridoCamera();
  });

  document.getElementById('btnSwitchBarridoCamera')?.addEventListener('click', () => {
    barridoState.facingMode = (barridoState.facingMode === 'environment') ? 'user' : 'environment';
    if (barridoState.isCameraRunning) {
      stopBarridoCamera();
      startBarridoCamera();
    }
  });

  document.getElementById('btnToggleBarridoTorch')?.addEventListener('click', () => {
    toggleBarridoTorch();
  });

  // 7. Screen 2: Add Extra Location
  document.getElementById('btnAddBarridoExtraLocation')?.addEventListener('click', () => {
    addBarridoExtraLocationRow();
  });

  // 8. Screen 2: Stepper buttons for Total Stock & Damaged Stock
  const totalInput = document.getElementById('barridoTotalStockInput');
  const damagedInput = document.getElementById('barridoDamagedStockInput');

  document.getElementById('btnBarridoTotalMinus')?.addEventListener('click', () => {
    if (totalInput) {
      const current = Number(totalInput.value) || 0;
      if (current > 0) totalInput.value = current - 1;
      validateDamagedVersusTotal();
    }
  });

  document.getElementById('btnBarridoTotalPlus')?.addEventListener('click', () => {
    if (totalInput) {
      const current = Number(totalInput.value) || 0;
      totalInput.value = current + 1;
      validateDamagedVersusTotal();
    }
  });

  document.getElementById('btnBarridoDamagedMinus')?.addEventListener('click', () => {
    if (damagedInput) {
      const current = Number(damagedInput.value) || 0;
      if (current > 0) damagedInput.value = current - 1;
      updateDamagedPhotoTriggerState();
    }
  });

  document.getElementById('btnBarridoDamagedPlus')?.addEventListener('click', () => {
    if (damagedInput) {
      const current = Number(damagedInput.value) || 0;
      damagedInput.value = current + 1;
      updateDamagedPhotoTriggerState();
    }
  });

  totalInput?.addEventListener('input', () => validateDamagedVersusTotal());
  damagedInput?.addEventListener('input', () => {
    validateDamagedVersusTotal();
    updateDamagedPhotoTriggerState();
  });

  // 9. Screen 2: Damaged Photo Trigger & Upload
  const damagedTrigger = document.getElementById('btnBarridoDamagedPhotoTrigger');
  const fileInput = document.getElementById('barridoDamagedFileInput');

  damagedTrigger?.addEventListener('click', () => {
    if (damagedTrigger.classList.contains('disabled')) {
      showToast('Ingresa una cantidad mayor a 0 en "En Mal Estado" para tomar foto de evidencia', 'warning');
      return;
    }
    // Trigger file input or camera capture
    if (fileInput) fileInput.click();
  });

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      handleBarridoDamagedPhotoSelected(file);
    }
  });

  document.getElementById('btnRetakeBarridoDamagedPhoto')?.addEventListener('click', () => {
    if (fileInput) fileInput.click();
  });

  document.getElementById('btnRemoveBarridoDamagedPhoto')?.addEventListener('click', () => {
    clearBarridoDamagedPhoto();
  });

  // 10. Screen 2: Quick Comment Chips
  const commentChips = document.querySelectorAll('.chip-comment');
  const notesTextarea = document.getElementById('barridoNotesInput');
  commentChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const comment = chip.getAttribute('data-comment');
      if (notesTextarea && comment) {
        const current = notesTextarea.value.trim();
        if (current) {
          notesTextarea.value = `${current}, ${comment}`;
        } else {
          notesTextarea.value = comment;
        }
        notesTextarea.focus();
      }
    });
  });

  // 11. Screen 2: Reference Photo Zoom Lightbox
  document.getElementById('btnZoomBarridoRefPhoto')?.addEventListener('click', () => {
    const img = document.getElementById('barridoRefImg');
    if (img && img.src) {
      const skuName = barridoState.currentItem?.sku || 'Item';
      openImageLightbox(img.src, `Foto de Referencia: ${skuName}`, 'Carpeta Drive: Nibol/ciclicos/fotosreferencias');
    }
  });

  document.getElementById('barridoRefImg')?.addEventListener('click', () => {
    const img = document.getElementById('barridoRefImg');
    if (img && img.src) {
      const skuName = barridoState.currentItem?.sku || 'Item';
      openImageLightbox(img.src, `Foto de Referencia: ${skuName}`, 'Carpeta Drive: Nibol/ciclicos/fotosreferencias');
    }
  });

  // 12. Screen 2: Cancel & Submit buttons
  document.getElementById('btnBarridoCancelItem')?.addEventListener('click', () => {
    showBarridoScreen('codeEntry');
  });

  document.getElementById('btnBarridoSubmitCount')?.addEventListener('click', () => {
    submitBarridoCount();
  });

  // 13. Finish Barrido Session & Excel Export Modal listeners
  document.getElementById('btnFinishBarridoSession')?.addEventListener('click', () => {
    openFinishBarridoModal();
  });

  document.getElementById('btnCloseFinishBarridoModal')?.addEventListener('click', () => {
    document.getElementById('finishBarridoModal')?.classList.add('hidden');
  });

  document.getElementById('btnCancelFinishBarridoModal')?.addEventListener('click', () => {
    document.getElementById('finishBarridoModal')?.classList.add('hidden');
  });

  document.getElementById('btnSubmitFinishBarrido')?.addEventListener('click', () => {
    submitFinishBarridoSession();
  });

  document.getElementById('btnCloseBarridoSuccessAndReturn')?.addEventListener('click', () => {
    closeBarridoSuccessAndReturn();
  });
}

/**
 * Apply Focus Reticle Presets (Barcode, QR, Custom)
 */
function applyBarridoReticlePreset(preset = 'barcode') {
  barridoState.reticlePreset = preset;
  const reticleBox = document.getElementById('barridoReticleBox');
  const slidersPanel = document.getElementById('barridoReticleSlidersPanel');
  const widthSlider = document.getElementById('barridoReticleWidthSlider');
  const heightSlider = document.getElementById('barridoReticleHeightSlider');
  const widthVal = document.getElementById('barridoReticleWidthVal');
  const heightVal = document.getElementById('barridoReticleHeightVal');

  if (preset === 'barcode') {
    if (slidersPanel) slidersPanel.classList.add('hidden');
    barridoState.reticleWidth = 300;
    barridoState.reticleHeight = 110;
  } else if (preset === 'qr') {
    if (slidersPanel) slidersPanel.classList.add('hidden');
    barridoState.reticleWidth = 220;
    barridoState.reticleHeight = 220;
  } else if (preset === 'custom') {
    if (slidersPanel) slidersPanel.classList.remove('hidden');
    barridoState.reticleWidth = Number(widthSlider?.value || 280);
    barridoState.reticleHeight = Number(heightSlider?.value || 140);
  }

  if (reticleBox) {
    reticleBox.style.width = `${barridoState.reticleWidth}px`;
    reticleBox.style.height = `${barridoState.reticleHeight}px`;
  }
  if (widthVal) widthVal.textContent = `${barridoState.reticleWidth}px`;
  if (heightVal) heightVal.textContent = `${barridoState.reticleHeight}px`;
}

/**
 * Start Camera Scanner
 */
async function startBarridoCamera() {
  const overlay = document.getElementById('barridoCameraInactiveOverlay');
  const statusText = document.getElementById('barridoCameraStatusText');
  const statusPill = document.getElementById('barridoCameraStatusPill');
  const btnToggle = document.getElementById('btnToggleBarridoCamera');
  const btnText = document.getElementById('btnToggleBarridoCameraText');

  try {
    if (typeof Html5Qrcode === 'undefined') {
      showToast('Motor de escáner HTML5 QR Code no disponible en este momento.', 'warning');
      return;
    }

    if (!barridoState.html5QrCode) {
      barridoState.html5QrCode = new Html5Qrcode('barridoScannerReader');
    }

    const qrConfig = {
      fps: 20,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const w = Math.min(viewfinderWidth * 0.85, barridoState.reticleWidth || 280);
        const h = Math.min(viewfinderHeight * 0.75, barridoState.reticleHeight || 140);
        return { width: Math.floor(w), height: Math.floor(h) };
      },
      aspectRatio: 1.333334
    };

    await barridoState.html5QrCode.start(
      { facingMode: barridoState.facingMode },
      qrConfig,
      (decodedText) => {
        handleBarridoScannedCode(decodedText);
      },
      (error) => {
        // Continuous scan error - safely ignore frame misses
      }
    );

    barridoState.isCameraRunning = true;
    if (overlay) overlay.classList.add('hidden');
    if (statusText) statusText.textContent = 'Cámara Activa (Enfocando)';
    if (statusPill) statusPill.classList.remove('status-inactive');
    if (btnText) btnText.textContent = 'Pausar Cámara';
    if (btnToggle) btnToggle.classList.replace('btn-primary', 'btn-secondary');
  } catch (err) {
    console.error('Error al iniciar cámara de barrido:', err);
    showToast('No se pudo acceder a la cámara: ' + err.message, 'error');
    if (statusText) statusText.textContent = 'Cámara Inactiva';
    if (statusPill) statusPill.classList.add('status-inactive');
  }
}

/**
 * Stop Camera Scanner
 */
async function stopBarridoCamera() {
  const overlay = document.getElementById('barridoCameraInactiveOverlay');
  const statusText = document.getElementById('barridoCameraStatusText');
  const statusPill = document.getElementById('barridoCameraStatusPill');
  const btnToggle = document.getElementById('btnToggleBarridoCamera');
  const btnText = document.getElementById('btnToggleBarridoCameraText');

  resetBarridoStabilization();

  if (barridoState.html5QrCode && barridoState.isCameraRunning) {
    try {
      await barridoState.html5QrCode.stop();
    } catch (e) {
      // Ignore stop errors
    }
  }

  barridoState.isCameraRunning = false;
  if (overlay) overlay.classList.remove('hidden');
  if (statusText) statusText.textContent = 'Cámara en Pausa';
  if (statusPill) statusPill.classList.add('status-inactive');
  if (btnText) btnText.textContent = 'Iniciar Cámara';
  if (btnToggle) btnToggle.classList.replace('btn-secondary', 'btn-primary');
}

/**
 * Toggle Torch/Flashlight
 */
async function toggleBarridoTorch() {
  if (!barridoState.html5QrCode || !barridoState.isCameraRunning) {
    showToast('Inicia la cámara para activar la linterna', 'info');
    return;
  }
  try {
    barridoState.torchOn = !barridoState.torchOn;
    await barridoState.html5QrCode.applyVideoConstraints({
      advanced: [{ torch: barridoState.torchOn }]
    });
    const btn = document.getElementById('btnToggleBarridoTorch');
    if (btn) {
      if (barridoState.torchOn) btn.classList.add('btn-primary');
      else btn.classList.remove('btn-primary');
    }
  } catch (e) {
    showToast('Linterna no soportada por el sensor de esta cámara', 'info');
  }
}

/**
 * 1-Second Stabilization Delay Engine
 * Prevents accidental misreads by requiring 1.0 second continuous steady frame
 */
function handleBarridoScannedCode(decodedText) {
  if (!decodedText || typeof decodedText !== 'string') return;
  const cleanCode = decodedText.trim();
  if (!cleanCode) return;

  // Ignore rapid duplicate scans within 3 seconds of last success
  const now = Date.now();
  if (barridoState.lastSuccessfulScan === cleanCode && (now - barridoState.lastScanTimestamp) < 3000) {
    return;
  }

  // If new candidate code detected, restart 1-second stabilization timer
  if (barridoState.candidateCode !== cleanCode) {
    resetBarridoStabilization();
    barridoState.candidateCode = cleanCode;
    barridoState.candidateStartTime = now;
    barridoState.isStabilizing = true;

    // Show stabilization UI
    const indicator = document.getElementById('barridoStabilizationIndicator');
    const codeElem = document.getElementById('barridoCandidateCode');
    const progressCircle = document.getElementById('barridoStabilizeProgressCircle');

    if (indicator) indicator.classList.remove('hidden');
    if (codeElem) codeElem.textContent = cleanCode;
    if (progressCircle) progressCircle.style.strokeDashoffset = '100';

    // Start 1.0s countdown ticker
    barridoState.stabilizeInterval = setInterval(() => {
      const elapsed = Date.now() - barridoState.candidateStartTime;
      const progressPercent = Math.min(100, Math.floor((elapsed / 1000) * 100));

      if (progressCircle) {
        progressCircle.style.strokeDashoffset = String(100 - progressPercent);
      }

      // Check if 1000ms (1 second) has elapsed with steady lock
      if (elapsed >= 1000) {
        clearInterval(barridoState.stabilizeInterval);
        barridoState.stabilizeInterval = null;
        barridoState.isStabilizing = false;

        if (indicator) indicator.classList.add('hidden');

        // Confirm valid scan
        barridoState.lastSuccessfulScan = cleanCode;
        barridoState.lastScanTimestamp = Date.now();

        // Audio & Haptic confirmation
        sfx.scanSuccess();
        if (navigator.vibrate) {
          try { navigator.vibrate([70, 40, 90]); } catch (e) {}
        }

        // Execute lookup
        lookupBarridoItem(cleanCode);
      }
    }, 40);
  }
}

function resetBarridoStabilization() {
  if (barridoState.stabilizeInterval) {
    clearInterval(barridoState.stabilizeInterval);
    barridoState.stabilizeInterval = null;
  }
  barridoState.isStabilizing = false;
  barridoState.candidateCode = null;
  barridoState.candidateStartTime = 0;

  const indicator = document.getElementById('barridoStabilizationIndicator');
  if (indicator) indicator.classList.add('hidden');
}

/**
 * Lookup SKU / Barcode in Barrido Sheet (Column B / Column A without JD_ prefix)
 */
async function lookupBarridoItem(code) {
  if (!code) return;
  const cleanCode = code.trim().toUpperCase();
  const strippedCode = cleanCode.replace(/^JD[_-]?/i, '');

  const curCentro = state.currentCentro || '1300';
  const searchBtn = document.getElementById('btnBarridoSearchCode');
  const origBtnHtml = searchBtn ? searchBtn.innerHTML : '';

  if (searchBtn) {
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Buscando...</span>';
  }

  try {
    let foundItem = null;

    // 1. Check local in-memory cache first (matching Column B barcode or Column A SKU without JD_)
    if (barridoItemsCache.length > 0) {
      foundItem = barridoItemsCache.find(i => {
        const itemBarcode = String(i.barcode || '').trim().toUpperCase();
        const itemSku = String(i.sku || '').trim().toUpperCase();
        const itemBarcodeClean = itemBarcode.replace(/^JD[_-]?/i, '');
        const itemSkuClean = itemSku.replace(/^JD[_-]?/i, '');

        // Validación prioritaria: Columna B (Código de barras sin prefijo JD_)
        if (itemBarcode && (itemBarcode === cleanCode || itemBarcode === strippedCode || itemBarcodeClean === strippedCode)) {
          return true;
        }
        // Validación secundaria: Columna A (SKU con o sin prefijo JD_)
        if (itemSku && (itemSku === cleanCode || itemSkuClean === strippedCode || itemSkuClean === cleanCode || itemSku === ('JD_' + strippedCode))) {
          return true;
        }
        return false;
      });
    }

    // 2. If not found in cache, perform live backend search
    if (!foundItem) {
      const searchParams = new URLSearchParams({
        centro: curCentro,
        type: 'barrido',
        search: strippedCode,
        userCargo: state.currentUser?.cargo || 'ADMIN',
        userName: state.currentUser?.nombre || state.currentUser?.usuario || 'Operador',
        userId: state.currentUser?.id || ''
      });
      const res = await fetch(`/api/inventory?${searchParams.toString()}`);
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        foundItem = data.items.find(i => {
          const itemBarcode = String(i.barcode || '').trim().toUpperCase();
          const itemSku = String(i.sku || '').trim().toUpperCase();
          const itemBarcodeClean = itemBarcode.replace(/^JD[_-]?/i, '');
          const itemSkuClean = itemSku.replace(/^JD[_-]?/i, '');

          return (
            (itemBarcode && (itemBarcode === cleanCode || itemBarcode === strippedCode || itemBarcodeClean === strippedCode)) ||
            (itemSku && (itemSku === cleanCode || itemSkuClean === strippedCode || itemSkuClean === cleanCode || itemSku === ('JD_' + strippedCode)))
          );
        }) || data.items[0];
      }
    }

    if (foundItem) {
      populateBarridoItemDetail(foundItem);
      showBarridoScreen('itemDetail');
    } else {
      sfx.warning();
      // Ask operator if they want to register a newly found item in aisle
      const confirmNew = confirm(`El código "${strippedCode}" no fue encontrado en la hoja de Barrido (Col B / Col A) de Centro ${curCentro}.\n\n¿Deseas registrarlo como producto nuevo hallado en pasillo para saneamiento?`);
      if (confirmNew) {
        const newItem = {
          sku: strippedCode,
          barcode: strippedCode,
          description: `Item nuevo hallado en barrido (${strippedCode})`,
          location: '',
          category: 'Saneamiento',
          abcClass: 'C',
          systemStock: 0,
          unitCost: 0
        };
        populateBarridoItemDetail(newItem);
        showBarridoScreen('itemDetail');
      } else {
        const input = document.getElementById('barridoCodeInput');
        if (input) {
          input.focus();
          input.select();
        }
      }
    }
  } catch (err) {
    console.error('Error al buscar item:', err);
    showToast('Error al buscar producto: ' + err.message, 'error');
  } finally {
    if (searchBtn) {
      searchBtn.disabled = false;
      searchBtn.innerHTML = origBtnHtml;
    }
  }
}

/**
 * Populate Screen 2 with item data and trigger reference photo query
 */
function populateBarridoItemDetail(item) {
  barridoState.currentItem = item;
  barridoState.extraLocations = [];
  barridoState.damagedPhotoBlob = null;
  barridoState.damagedPhotoBase64 = null;
  barridoState.damagedPhotoFileName = null;

  // 1. Text Details (Completely Blind: no system stock shown)
  const cleanCodeDisplay = item.barcode || item.sku.replace(/^JD[_-]?/i, '');
  const skuElem = document.getElementById('barridoDetailSku');
  const descElem = document.getElementById('barridoDetailDescription');
  const barcodeElem = document.getElementById('barridoDetailBarcode');
  const catElem = document.getElementById('barridoDetailCategory');
  const abcElem = document.getElementById('barridoDetailAbc');

  if (skuElem) skuElem.textContent = cleanCodeDisplay || item.sku || 'SKU';
  if (descElem) descElem.textContent = item.description || 'Sin Descripción';
  if (barcodeElem) barcodeElem.innerHTML = `<i class="fa-solid fa-barcode"></i> ${escapeHtml(cleanCodeDisplay || item.barcode || 'S/C')}`;
  if (catElem) catElem.innerHTML = `<i class="fa-solid fa-tags"></i> ${escapeHtml(item.category || 'General')}`;
  
  if (abcElem) {
    const abc = (item.abcClass || 'C').toUpperCase();
    abcElem.className = `badge badge-abc-${abc.toLowerCase()}`;
    abcElem.textContent = `Clase ${abc}`;
  }

  // 2. Original Location (Read-Only from base)
  const primaryLocInput = document.getElementById('barridoPrimaryLocationInput');
  if (primaryLocInput) {
    primaryLocInput.value = item.location || 'Sin Ubicación Registrada';
    primaryLocInput.readOnly = true;
  }

  // Clear extra locations container
  const extraLocList = document.getElementById('barridoExtraLocationsList');
  if (extraLocList) extraLocList.innerHTML = '';

  // 3. Stock Inputs (Blind count default 1)
  const totalInput = document.getElementById('barridoTotalStockInput');
  const damagedInput = document.getElementById('barridoDamagedStockInput');

  const defaultTotal = (item.physicalStock !== null && item.physicalStock !== undefined && item.physicalStock > 0) 
    ? item.physicalStock 
    : 1;

  if (totalInput) totalInput.value = defaultTotal;
  if (damagedInput) damagedInput.value = 0;

  // 4. Damaged Photo Trigger State (Disabled by default since damaged is 0)
  updateDamagedPhotoTriggerState();
  clearBarridoDamagedPhoto();

  // 5. Notes / Comments
  const notesElem = document.getElementById('barridoNotesInput');
  if (notesElem) notesElem.value = item.notes || '';

  // 6. Query Reference Photo from Google Drive (Nibol/ciclicos/fotosreferencias)
  loadBarridoReferencePhoto(item.sku);
}

/**
 * Load Reference Photo from Google Drive (Nibol/ciclicos/fotosreferencias)
 */
async function loadBarridoReferencePhoto(sku) {
  const loading = document.getElementById('barridoRefPhotoLoading');
  const imgWrap = document.getElementById('barridoRefImgWrap');
  const imgElem = document.getElementById('barridoRefImg');
  const placeholder = document.getElementById('barridoRefPhotoPlaceholder');
  const placeholderSku = document.getElementById('barridoRefPlaceholderSku');
  const skuBadge = document.getElementById('barridoRefSkuBadge');

  if (loading) loading.classList.remove('hidden');
  if (imgWrap) imgWrap.classList.add('hidden');
  if (placeholder) placeholder.classList.add('hidden');
  if (placeholderSku) placeholderSku.textContent = sku;
  if (skuBadge) skuBadge.textContent = sku;

  try {
    const curCentro = state.currentCentro || '1300';
    const res = await fetch(`/api/inventory/reference-photo?sku=${encodeURIComponent(sku)}&centro=${encodeURIComponent(curCentro)}&type=barrido`);
    const data = await res.json();

    if (loading) loading.classList.add('hidden');

    if (data.success && data.found && (data.relativeUrl || data.dataUrl || data.thumbnailUrl || data.fileUrl)) {
      const srcUrl = data.relativeUrl || data.dataUrl || data.thumbnailUrl || data.fileUrl;
      if (imgElem) imgElem.src = srcUrl;
      if (imgWrap) imgWrap.classList.remove('hidden');
    } else {
      if (placeholder) placeholder.classList.remove('hidden');
    }
  } catch (err) {
    if (loading) loading.classList.add('hidden');
    if (placeholder) placeholder.classList.remove('hidden');
  }
}

/**
 * Manage Dynamic Additional Locations in Screen 2 with Quantities & Damaged inputs
 */
function addBarridoExtraLocationRow() {
  const container = document.getElementById('barridoExtraLocationsList');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'location-row extra-location-row';
  row.innerHTML = `
    <div class="extra-loc-main-wrap">
      <div class="location-input-wrap">
        <span class="location-badge-label extra-badge"><i class="fa-solid fa-plus"></i> Extra:</span>
        <input type="text" class="form-control location-input extra-loc-name" placeholder="Ej: B-02-01, Pasillo 4, Estante C...">
      </div>
      <div class="extra-loc-qty-group">
        <div class="extra-qty-field">
          <span class="extra-qty-tag text-primary"><i class="fa-solid fa-boxes-stacked"></i> Cant:</span>
          <input type="number" class="form-control extra-qty-input extra-loc-qty" min="0" value="1" placeholder="0">
        </div>
        <div class="extra-qty-field">
          <span class="extra-qty-tag text-amber"><i class="fa-solid fa-triangle-exclamation"></i> Mal Estado:</span>
          <input type="number" class="form-control extra-qty-input extra-loc-damaged" min="0" value="0" placeholder="0">
        </div>
      </div>
      <button type="button" class="btn-remove-location" title="Eliminar esta ubicación extra">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `;

  // Real-time quantity listeners
  const qtyInput = row.querySelector('.extra-loc-qty');
  const damagedInput = row.querySelector('.extra-loc-damaged');

  const onQtyChange = () => {
    const q = Number(qtyInput.value) || 0;
    let d = Number(damagedInput.value) || 0;
    if (d > q) {
      d = q;
      damagedInput.value = d;
    }
    syncBarridoTotalsFromExtraLocations();
  };

  qtyInput?.addEventListener('input', onQtyChange);
  damagedInput?.addEventListener('input', onQtyChange);

  row.querySelector('.btn-remove-location')?.addEventListener('click', () => {
    row.remove();
    syncBarridoTotalsFromExtraLocations();
  });

  container.appendChild(row);
  row.querySelector('.extra-loc-name')?.focus();

  syncBarridoTotalsFromExtraLocations();
}

/**
 * Synchronize Main Quantity Steppers with Extra Locations Breakdown
 */
function syncBarridoTotalsFromExtraLocations() {
  const extraRows = document.querySelectorAll('.extra-location-row');
  if (extraRows.length === 0) return;

  let sumQty = 0;
  let sumDamaged = 0;

  extraRows.forEach(row => {
    const q = Number(row.querySelector('.extra-loc-qty')?.value) || 0;
    const d = Number(row.querySelector('.extra-loc-damaged')?.value) || 0;
    sumQty += q;
    sumDamaged += d;
  });

  const totalInput = document.getElementById('barridoTotalStockInput');
  const damagedInput = document.getElementById('barridoDamagedStockInput');

  if (totalInput && sumQty > 0) {
    totalInput.value = sumQty;
  }
  if (damagedInput) {
    damagedInput.value = sumDamaged;
  }

  updateDamagedPhotoTriggerState();
}

/**
 * Format Combined Locations String e.g. "A-04-02, B-02-01 (10 unid, 2 dañados)"
 */
function getBarridoCombinedLocationString() {
  const rawPrimaryLoc = document.getElementById('barridoPrimaryLocationInput')?.value.trim() || '';
  const primaryLoc = (rawPrimaryLoc && rawPrimaryLoc !== 'Sin Ubicación Registrada') ? rawPrimaryLoc : '';
  const parts = [];
  if (primaryLoc) parts.push(primaryLoc);

  const extraRows = document.querySelectorAll('.extra-location-row');
  extraRows.forEach(row => {
    const loc = row.querySelector('.extra-loc-name')?.value.trim();
    const qty = row.querySelector('.extra-loc-qty')?.value.trim();
    const dmg = row.querySelector('.extra-loc-damaged')?.value.trim();
    if (loc) {
      let suffix = '';
      if (qty && Number(qty) > 0) {
        suffix += ` (${qty} unid`;
        if (dmg && Number(dmg) > 0) {
          suffix += `, ${dmg} dañados`;
        }
        suffix += ')';
      }
      parts.push(`${loc}${suffix}`);
    }
  });

  return parts.join(', ') || primaryLoc || (barridoState.currentItem?.location || '');
}

/**
 * Validate Damaged Stock does not exceed Total Stock
 */
function validateDamagedVersusTotal() {
  const totalInput = document.getElementById('barridoTotalStockInput');
  const damagedInput = document.getElementById('barridoDamagedStockInput');

  const total = Number(totalInput?.value) || 0;
  let damaged = Number(damagedInput?.value) || 0;

  if (damaged > total) {
    if (damagedInput) damagedInput.value = total;
  }
}

/**
 * Enable/Disable Damaged Photo Trigger based on 'En Mal Estado' value
 */
function updateDamagedPhotoTriggerState() {
  const damagedInput = document.getElementById('barridoDamagedStockInput');
  const triggerBtn = document.getElementById('btnBarridoDamagedPhotoTrigger');
  const lockIcon = document.getElementById('barridoDamagedLockIcon');
  const lockText = document.getElementById('barridoDamagedLockText');

  const damagedQty = Number(damagedInput?.value) || 0;

  if (damagedQty > 0) {
    if (triggerBtn) {
      triggerBtn.classList.remove('disabled');
      triggerBtn.removeAttribute('disabled');
      triggerBtn.title = 'Tomar foto de evidencia para el producto dañado';
    }
    if (lockIcon) lockIcon.className = 'fa-solid fa-camera text-amber';
    if (lockText) lockText.textContent = `Cámara habilitada: Registra la foto de evidencia de los ${damagedQty} item(s) en mal estado.`;
  } else {
    if (triggerBtn) {
      triggerBtn.classList.add('disabled');
      triggerBtn.setAttribute('disabled', 'true');
      triggerBtn.title = 'Ingresa una cantidad mayor a 0 en "Mal Estado" para habilitar la cámara';
    }
    if (lockIcon) lockIcon.className = 'fa-solid fa-lock';
    if (lockText) lockText.textContent = 'La cámara se habilitará automáticamente al ingresar unidades en mal estado.';
  }
}

/**
 * Handle Damaged Photo Capture / File selection
 */
function handleBarridoDamagedPhotoSelected(file) {
  if (!file) return;

  const sku = barridoState.currentItem?.sku || 'SKU';
  const reader = new FileReader();

  reader.onload = (e) => {
    const base64 = e.target.result;
    barridoState.damagedPhotoBlob = file;
    barridoState.damagedPhotoBase64 = base64;
    barridoState.damagedPhotoFileName = `${sku}.jpg`;

    // Show Preview Box
    const previewBox = document.getElementById('barridoDamagedPhotoPreviewBox');
    const thumbnail = document.getElementById('barridoDamagedPhotoThumbnail');
    const fileNameElem = document.getElementById('barridoDamagedFileName');
    const targetFolderElem = document.getElementById('barridoDamagedTargetFolder');

    if (thumbnail) thumbnail.src = base64;
    if (fileNameElem) fileNameElem.textContent = `${sku}.jpg`;
    if (targetFolderElem) targetFolderElem.textContent = `nibol/fotos/${barridoState.sessionStartDate}`;
    if (previewBox) previewBox.classList.remove('hidden');

    showToast('Foto de evidencia de mal estado capturada correctamente', 'success');
  };

  reader.readAsDataURL(file);
}

function clearBarridoDamagedPhoto() {
  barridoState.damagedPhotoBlob = null;
  barridoState.damagedPhotoBase64 = null;
  barridoState.damagedPhotoFileName = null;

  const fileInput = document.getElementById('barridoDamagedFileInput');
  if (fileInput) fileInput.value = '';

  const previewBox = document.getElementById('barridoDamagedPhotoPreviewBox');
  if (previewBox) previewBox.classList.add('hidden');
}

/**
 * Submit Count & Loop back to Screen 1 for continuous counting
 */
async function submitBarridoCount() {
  const item = barridoState.currentItem;
  if (!item) {
    showToast('No hay ningún item seleccionado para registrar', 'warning');
    return;
  }

  const totalInput = document.getElementById('barridoTotalStockInput');
  const damagedInput = document.getElementById('barridoDamagedStockInput');
  const notesInput = document.getElementById('barridoNotesInput');

  const physicalStock = Number(totalInput?.value);
  const damagedStock = Number(damagedInput?.value) || 0;
  const notes = notesInput?.value.trim() || '';
  const locationString = getBarridoCombinedLocationString();

  if (isNaN(physicalStock) || physicalStock < 0) {
    showToast('Por favor ingresa una cantidad total válida (>= 0)', 'warning');
    totalInput?.focus();
    return;
  }

  if (damagedStock > physicalStock) {
    showToast('La cantidad en mal estado no puede superar la cantidad total contada', 'warning');
    damagedInput?.focus();
    return;
  }

  const submitBtn = document.getElementById('btnBarridoSubmitCount');
  const origBtnHtml = submitBtn ? submitBtn.innerHTML : '';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Guardando Conteo en Sheets...</span>';
  }

  try {
    const curCentro = state.currentCentro || '1300';
    const operator = state.currentUser?.nombre || state.currentUser?.usuario || 'Operador Barrido';

    // 1. Upload Damaged Photo to Google Drive (Nibol/fotos/[sessionDate]/[SKU].jpg) if present
    let uploadedPhotoUrl = null;
    if (damagedStock > 0 && barridoState.damagedPhotoBlob) {
      try {
        const photoFormData = new FormData();
        photoFormData.append('photo', barridoState.damagedPhotoBlob, `${item.sku}.jpg`);
        photoFormData.append('sku', item.sku);
        photoFormData.append('centro', curCentro);
        photoFormData.append('sessionDate', barridoState.sessionStartDate);
        photoFormData.append('type', 'barrido');

        const uploadRes = await fetch('/api/inventory/upload-damaged-photo', {
          method: 'POST',
          body: photoFormData
        });
        const uploadData = await uploadRes.json();
        if (uploadData.success) {
          uploadedPhotoUrl = uploadData.googleDriveUrl || uploadData.relativeUrl;
        }
      } catch (upErr) {
        console.warn('Aviso subiendo foto de mal estado:', upErr.message);
      }
    }

    // 2. Submit Count Record to Google Sheets / Backend
    const cleanBarcode = item.barcode || item.sku.replace(/^JD[_-]?/i, '');
    const countPayload = {
      sku: item.sku,
      barcode: cleanBarcode,
      cleanSku: cleanBarcode,
      physicalStock: physicalStock,
      damagedStock: damagedStock,
      locationString: locationString,
      location: locationString,
      centro: curCentro,
      type: 'barrido',
      operatorName: operator,
      operatorUser: state.currentUser?.usuario || '',
      operatorCargo: state.currentUser?.cargo || 'AUXILIAR',
      description: item.description || '',
      unitCost: item.unitCost || 0,
      systemStock: item.systemStock || 0,
      notes: notes + (uploadedPhotoUrl ? ` [Foto Drive: ${uploadedPhotoUrl}]` : '')
    };

    const countRes = await fetch('/api/inventory/count', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(countPayload)
    });

    const countResult = await countRes.json();

    if (!countRes.ok || countResult.error) {
      throw new Error(countResult.error || 'Error al registrar el conteo en Google Sheets');
    }

    // 3. Audio & Success Feedback
    sfx.saveSuccess();
    if (navigator.vibrate) {
      try { navigator.vibrate([100, 50, 100]); } catch (e) {}
    }

    showToast(`¡Conteo guardado! SKU: ${item.sku} &bull; Total: ${physicalStock}${damagedStock > 0 ? ` (Mal estado: ${damagedStock})` : ''}`, 'success');

    // 4. Update Session Stats & Recents List
    barridoState.sessionCountedItems++;
    updateBarridoSessionBadge();

    barridoState.recentItems.unshift({
      sku: item.sku,
      description: item.description,
      physicalStock: physicalStock,
      damagedStock: damagedStock,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    renderBarridoRecentSweepsList();

    // 5. Update local cache with new count
    const cacheIdx = barridoItemsCache.findIndex(i => i.sku === item.sku);
    if (cacheIdx !== -1) {
      barridoItemsCache[cacheIdx].physicalStock = physicalStock;
      barridoItemsCache[cacheIdx].status = 'Contado';
    }

    // 6. Clean form and return immediately to Screen 1 for next item
    clearBarridoDamagedPhoto();
    showBarridoScreen('codeEntry');

  } catch (err) {
    console.error('Error guardando conteo de barrido:', err);
    showToast('Error al guardar conteo: ' + err.message, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origBtnHtml;
    }
  }
}

/**
 * Render recent session sweeps list
 */
function renderBarridoRecentSweepsList() {
  const container = document.getElementById('barridoRecentSweepsList');
  const counterElem = document.getElementById('barridoRecentCounter');

  if (counterElem) {
    counterElem.textContent = `${barridoState.recentItems.length} item(s)`;
  }

  if (!container) return;

  if (barridoState.recentItems.length === 0) {
    container.innerHTML = `
      <div class="recent-sweeps-empty">
        <i class="fa-solid fa-boxes-stacked"></i>
        <p>Aún no has registrado ningún producto en esta sesión de barrido.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = barridoState.recentItems.slice(0, 8).map(item => `
    <div class="recent-sweep-item">
      <div>
        <span class="recent-sweep-sku">${escapeHtml(item.sku)}</span>
        <span class="recent-sweep-desc" title="${escapeHtml(item.description)}">${escapeHtml(item.description)}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        ${item.damagedStock > 0 ? `<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; font-size: 0.75rem; padding: 2px 6px;">${item.damagedStock} dañados</span>` : ''}
        <span class="recent-sweep-qty">Cant: ${item.physicalStock}</span>
      </div>
    </div>
  `).join('');
}

/**
 * Open Modal to Confirm and Finish Barrido Inventory Session
 */
function openFinishBarridoModal() {
  const modal = document.getElementById('finishBarridoModal');
  if (!modal) return;

  const curCentro = state.currentCentro || '1300';
  const centroText = document.getElementById('finishBarridoCentroText');
  const countedText = document.getElementById('finishBarridoCountedText');
  const exactText = document.getElementById('finishBarridoExactText');
  const damagedText = document.getElementById('finishBarridoDamagedText');
  const notesInput = document.getElementById('finishBarridoNotesInput');

  if (centroText) centroText.textContent = `Centro ${curCentro}`;

  // Calculate live stats from barridoItemsCache
  const countedItems = barridoItemsCache.filter(i => i.physicalStock !== null && i.physicalStock !== undefined);
  const exactItems = countedItems.filter(i => Number(i.variance) === 0);
  const totalDamagedUnits = barridoItemsCache.reduce((acc, i) => acc + (Number(i.damagedStock) || 0), 0);

  if (countedText) countedText.textContent = `${countedItems.length} ítems`;
  if (exactText) exactText.textContent = `${exactItems.length} ítems`;
  if (damagedText) damagedText.textContent = `${totalDamagedUnits} unid.`;
  if (notesInput) notesInput.value = '';

  modal.classList.remove('hidden');
}

/**
 * Submit Finish Barrido Session to Backend & Generate Excel
 */
async function submitFinishBarridoSession() {
  const submitBtn = document.getElementById('btnSubmitFinishBarrido');
  const originalHtml = submitBtn ? submitBtn.innerHTML : '';
  const notes = document.getElementById('finishBarridoNotesInput')?.value.trim() || '';
  const curCentro = state.currentCentro || '1300';

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generando Excel de Cierre...';
    }

    const payload = {
      centro: curCentro,
      operatorName: state.currentUser?.nombre || state.currentUser?.usuario || 'Operador',
      operatorUser: state.currentUser?.usuario || '',
      operatorCargo: state.currentUser?.cargo || 'ENCARGADO',
      operatorCentro: state.currentUser?.centro || curCentro,
      notes: notes,
      summary: {
        totalItems: barridoItemsCache.length,
        countedItems: barridoItemsCache.filter(i => i.physicalStock !== null && i.physicalStock !== undefined).length,
        damagedItems: barridoItemsCache.reduce((acc, i) => acc + (Number(i.damagedStock) || 0), 0)
      }
    };

    const res = await fetch('/api/inventory/finish-barrido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Error al finalizar el inventario de barrido');
    }

    // Hide confirmation modal
    document.getElementById('finishBarridoModal')?.classList.add('hidden');

    // Show Success Modal with download link
    const successModal = document.getElementById('finishBarridoSuccessModal');
    const fileNameElem = document.getElementById('finishBarridoSuccessFileName');
    const downloadBtn = document.getElementById('btnDownloadBarridoExcelDoc');

    if (fileNameElem) fileNameElem.textContent = data.fileName || `BARRIDO_NIBOL_CENTRO_${curCentro}.xlsx`;
    if (downloadBtn && data.downloadUrl) {
      downloadBtn.href = data.downloadUrl;
    }

    if (successModal) successModal.classList.remove('hidden');
    sfx.saveSuccess();
    showToast(`✓ Inventario de Barrido del Centro ${curCentro} finalizado exitosamente.`, 'success');

    // Automatically trigger the Excel download
    if (data.downloadUrl) {
      const a = document.createElement('a');
      a.href = data.downloadUrl;
      a.download = data.fileName || `BARRIDO_NIBOL_CENTRO_${curCentro}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  } catch (err) {
    sfx.error();
    showToast(`Error al finalizar barrido: ${err.message}`, 'error');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
  }
}

function closeBarridoSuccessAndReturn() {
  document.getElementById('finishBarridoSuccessModal')?.classList.add('hidden');
  closeBarridoCountingEnvironment();
}





