const fs = require('fs');
const path = require('path');
const storagePath = require('./storagePath');

const USERS_FILE = storagePath.getDataFilePath('users.json');

// Master list of all users and 13 Centros from official company roster + Global Admins
const ALL_MASTER_USERS = [
  // =========================================================================
  // ADMINISTRADORES GLOBALES (Acceso a todos los Centros)
  // =========================================================================
  { id: 'usr-admin-absael', nombre: 'ABSAEL', centro: 'TODOS', cargo: 'ADMIN', usuario: 'ABSAEL', password: 'ABS', avatarColor: '#6366f1', activo: true, ultimoAcceso: null, canManageAccess: false },
  { id: 'usr-admin-jcarlos', nombre: 'JUAN CARLOS', centro: 'TODOS', cargo: 'ADMIN', usuario: 'JCARLOS', password: 'JCS', avatarColor: '#3b82f6', activo: true, ultimoAcceso: null, canManageAccess: false },
  { id: 'usr-admin-alonso', nombre: 'ALONSO', centro: 'TODOS', cargo: 'ADMIN', usuario: 'ALONSO', password: 'ADM', avatarColor: '#10b981', activo: true, ultimoAcceso: null, canManageAccess: true, isSuperAdmin: true },

  // =========================================================================
  // CENTROS Y OPERADORES
  // =========================================================================
  // Centro 1300
  { id: 'usr-1300-1', nombre: 'JHAMIL CADIMA', centro: '1300', cargo: 'AUXILIAR', usuario: 'JHAMIL', password: 'JHD', avatarColor: '#3b82f6', activo: true, ultimoAcceso: null },
  { id: 'usr-1300-2', nombre: 'ERICK MORALES', centro: '1300', cargo: 'AUXILIAR', usuario: 'ERICK', password: 'ROCA', avatarColor: '#10b981', activo: true, ultimoAcceso: null },
  { id: 'usr-1300-3', nombre: 'FERNANDO PINTO', centro: '1300', cargo: 'AUXILIAR', usuario: 'FERNANDO', password: 'CEPI', avatarColor: '#8b5cf6', activo: true, ultimoAcceso: null },
  { id: 'usr-1300-4', nombre: 'JOSE MANUEL', centro: '1300', cargo: 'AUXILIAR', usuario: 'JOSE', password: 'JSM', avatarColor: '#f59e0b', activo: true, ultimoAcceso: null },
  { id: 'usr-1300-5', nombre: 'SAMIR', centro: '1300', cargo: 'AUXILIAR', usuario: 'SAMIR', password: 'TURCO', avatarColor: '#06b6d4', activo: true, ultimoAcceso: null },
  { id: 'usr-1300-6', nombre: 'JORGE RIOS', centro: '1300', cargo: 'AUXILIAR', usuario: 'JORGE', password: 'BIGOTE', avatarColor: '#ec4899', activo: true, ultimoAcceso: null },
  { id: 'usr-1300-7', nombre: 'ALONSO RIOS', centro: '1300', cargo: 'AUXILIAR', usuario: 'ALONSOR', password: 'POTER', avatarColor: '#14b8a6', activo: true, ultimoAcceso: null },
  { id: 'usr-1300-8', nombre: 'GERMAN MENDEZ', centro: '1300', cargo: 'AUXILIAR', usuario: 'GERMAN', password: 'NOCHI', avatarColor: '#f97316', activo: true, ultimoAcceso: null },
  { id: 'usr-1300-9', nombre: 'JAVIER LOPEZ', centro: '1300', cargo: 'ENCARGADO', usuario: 'JAVIER', password: 'JVLP', avatarColor: '#6366f1', activo: true, ultimoAcceso: null },

  // Centro 1800
  { id: 'usr-1800-1', nombre: 'ERICK SJ', centro: '1800', cargo: 'ENCARGADO', usuario: 'ERICK', password: 'ESJ', avatarColor: '#3b82f6', activo: true, ultimoAcceso: null },

  // Centro 1340
  { id: 'usr-1340-1', nombre: 'RUSSEL', centro: '1340', cargo: 'AUXILIAR', usuario: 'RUSSEL', password: 'RSS', avatarColor: '#10b981', activo: true, ultimoAcceso: null },
  { id: 'usr-1340-2', nombre: 'DARWIN', centro: '1340', cargo: 'ENCARGADO', usuario: 'DARWIN', password: 'DRW', avatarColor: '#8b5cf6', activo: true, ultimoAcceso: null },

  // Centro 1820
  { id: 'usr-1820-1', nombre: 'LUIS BUSTAMANTE', centro: '1820', cargo: 'ENCARGADO', usuario: 'LUIS', password: 'LSBT', avatarColor: '#f59e0b', activo: true, ultimoAcceso: null },

  // Centro 1120
  { id: 'usr-1120-1', nombre: 'WENDERSON DA SILVA', centro: '1120', cargo: 'AUXILIAR', usuario: 'WENDERSON', password: 'WDS', avatarColor: '#06b6d4', activo: true, ultimoAcceso: null },
  { id: 'usr-1120-2', nombre: 'BRAYAN', centro: '1120', cargo: 'AUXILIAR', usuario: 'BRAYAN', password: 'BRY', avatarColor: '#ec4899', activo: true, ultimoAcceso: null },
  { id: 'usr-1120-3', nombre: 'BLADIMIR', centro: '1120', cargo: 'AUXILIAR', usuario: 'BLADIMIR', password: 'BLD', avatarColor: '#14b8a6', activo: true, ultimoAcceso: null },
  { id: 'usr-1120-4', nombre: 'ISAIAS', centro: '1120', cargo: 'ENCARGADO', usuario: 'ISAIAS', password: 'ISS', avatarColor: '#f97316', activo: true, ultimoAcceso: null },

  // Centro 1180
  { id: 'usr-1180-1', nombre: 'ISMAEL', centro: '1180', cargo: 'AUXILIAR', usuario: 'ISMAEL', password: 'ISM', avatarColor: '#3b82f6', activo: true, ultimoAcceso: null },
  { id: 'usr-1180-2', nombre: 'MIGUEL', centro: '1180', cargo: 'AUXILIAR', usuario: 'MIGUEL', password: 'MGL', avatarColor: '#10b981', activo: true, ultimoAcceso: null },
  { id: 'usr-1180-3', nombre: 'GUSTAVO', centro: '1180', cargo: 'ENCARGADO', usuario: 'GUSTAVO', password: 'GST', avatarColor: '#8b5cf6', activo: true, ultimoAcceso: null },

  // Centro 1700
  { id: 'usr-1700-1', nombre: 'DIEGO', centro: '1700', cargo: 'AUXILIAR', usuario: 'DIEGO', password: 'DIG', avatarColor: '#f59e0b', activo: true, ultimoAcceso: null },
  { id: 'usr-1700-2', nombre: 'DIONEL', centro: '1700', cargo: 'ENCARGADO', usuario: 'DIONEL', password: 'DNL', avatarColor: '#06b6d4', activo: true, ultimoAcceso: null },

  // Centro 1160
  { id: 'usr-1160-1', nombre: 'ABRAHAN', centro: '1160', cargo: 'AUXILIAR', usuario: 'ABRAHAM', password: 'ABRH', avatarColor: '#ec4899', activo: true, ultimoAcceso: null },
  { id: 'usr-1160-2', nombre: 'JIMMY', centro: '1160', cargo: 'ENCARGADO', usuario: 'JIMMY', password: 'JMM', avatarColor: '#14b8a6', activo: true, ultimoAcceso: null },

  // Centro 1320
  { id: 'usr-1320-1', nombre: 'REYNALDO', centro: '1320', cargo: 'AUXILIAR', usuario: 'REYNALDO', password: 'RND', avatarColor: '#f97316', activo: true, ultimoAcceso: null },
  { id: 'usr-1320-2', nombre: 'GUILLERMO', centro: '1320', cargo: 'AUXILIAR', usuario: 'GUILLERMO', password: 'GLL', avatarColor: '#3b82f6', activo: true, ultimoAcceso: null },
  { id: 'usr-1320-3', nombre: 'IGNACIO', centro: '1320', cargo: 'ENCARGADO', usuario: 'IGNACIO', password: 'IGN', avatarColor: '#10b981', activo: true, ultimoAcceso: null },
  { id: 'usr-1320-4', nombre: 'DAVID SANCHEZ', centro: '1320', cargo: 'ENCARGADO', usuario: 'DAVID SANCHEZ', password: 'DVS', avatarColor: '#8b5cf6', activo: true, ultimoAcceso: null },

  // Centro 1310
  { id: 'usr-1310-1', nombre: 'SANDRO', centro: '1310', cargo: 'AUXILIAR', usuario: 'SANDRO', password: 'SND', avatarColor: '#f59e0b', activo: true, ultimoAcceso: null },

  // Centro 5100
  { id: 'usr-5100-1', nombre: 'ENCARGADO', centro: '5100', cargo: 'ENCARGADO', usuario: 'ENCARGADO', password: 'PASS', avatarColor: '#06b6d4', activo: true, ultimoAcceso: null },

  // Centro 3100
  { id: 'usr-3100-1', nombre: 'EDGAR', centro: '3100', cargo: 'ENCARGADO', usuario: 'EDGAR', password: 'EDG', avatarColor: '#ec4899', activo: true, ultimoAcceso: null },
  { id: 'usr-3100-2', nombre: 'DIEGO', centro: '3100', cargo: 'AUXILIAR', usuario: 'DIEGO', password: 'DGO', avatarColor: '#14b8a6', activo: true, ultimoAcceso: null },
  { id: 'usr-3100-3', nombre: 'JHONATAN', centro: '3100', cargo: 'AUXILIAR', usuario: 'JHONATAN', password: 'JHN', avatarColor: '#f97316', activo: true, ultimoAcceso: null },

  // Centro 2100
  { id: 'usr-2100-1', nombre: 'HUGO', centro: '2100', cargo: 'ENCARGADO', usuario: 'HUGO', password: 'HGO', avatarColor: '#3b82f6', activo: true, ultimoAcceso: null },
  { id: 'usr-2100-2', nombre: 'SIMON', centro: '2100', cargo: 'AUXILIAR', usuario: 'SIMON', password: 'SMN', avatarColor: '#10b981', activo: true, ultimoAcceso: null }
];

const CENTROS_INFO = [
  { codigo: '1300', nombre: 'Centro 1300 - Principal / Almacén Central', ubicacion: 'Sucursal Central', icono: 'fa-warehouse' },
  { codigo: '1800', nombre: 'Centro 1800 - Sucursal Norte', ubicacion: 'Zona Norte', icono: 'fa-building' },
  { codigo: '1340', nombre: 'Centro 1340 - Distribución', ubicacion: 'Parque Industrial', icono: 'fa-truck-ramp-box' },
  { codigo: '1820', nombre: 'Centro 1820 - Repuestos & Taller', ubicacion: 'Av. Principal', icono: 'fa-gears' },
  { codigo: '1120', nombre: 'Centro 1120 - Almacén Oriente', ubicacion: 'Zona Oriente', icono: 'fa-boxes-stacked' },
  { codigo: '1180', nombre: 'Centro 1180 - Logística', ubicacion: 'Sector Sur', icono: 'fa-dolly' },
  { codigo: '1700', nombre: 'Centro 1700 - Sucursal Repuestos', ubicacion: 'Zona Comercial', icono: 'fa-wrench' },
  { codigo: '1160', nombre: 'Centro 1160 - Bodega General', ubicacion: 'Sector Industrial', icono: 'fa-cubes' },
  { codigo: '1320', nombre: 'Centro 1320 - Centro Integral', ubicacion: 'Sucursal Este', icono: 'fa-network-wired' },
  { codigo: '1310', nombre: 'Centro 1310 - Módulos Express', ubicacion: 'Zona Centro', icono: 'fa-store' },
  { codigo: '5100', nombre: 'Centro 5100 - Hub Regional', ubicacion: 'Hub Regional', icono: 'fa-city' },
  { codigo: '3100', nombre: 'Centro 3100 - Almacén Occidente', ubicacion: 'Sector Occidente', icono: 'fa-pallet' },
  { codigo: '2100', nombre: 'Centro 2100 - Planta Operativa', ubicacion: 'Planta Principal', icono: 'fa-industry' }
];

class UsersService {
  constructor() {
    this.ensureDataDirectory();
    this.users = this.loadUsers();
  }

  ensureDataDirectory() {
    const dataDir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  loadUsers() {
    try {
      let currentUsers = [];
      if (fs.existsSync(USERS_FILE)) {
        const raw = fs.readFileSync(USERS_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          currentUsers = parsed;
        }
      }

      // Merge master users and administrators into file
      const merged = [...ALL_MASTER_USERS];
      currentUsers.forEach(cu => {
        const idx = merged.findIndex(mu => mu.id === cu.id || (mu.usuario.toUpperCase() === cu.usuario.toUpperCase() && mu.centro === cu.centro));
        if (idx !== -1) {
          // If admin, keep authoritative master passwords/privileges
          if (merged[idx].cargo === 'ADMIN') {
            merged[idx] = { ...merged[idx], ultimoAcceso: cu.ultimoAcceso || null };
          } else {
            merged[idx] = { ...merged[idx], ...cu };
          }
        } else {
          merged.push(cu);
        }
      });

      this.saveUsers(merged);
      return merged;
    } catch (err) {
      console.warn('Error al leer users.json, cargando master roster:', err.message);
      this.saveUsers(ALL_MASTER_USERS);
      return ALL_MASTER_USERS;
    }
  }

  saveUsers(usersList) {
    try {
      this.ensureDataDirectory();
      this.users = usersList;
      fs.writeFileSync(USERS_FILE, JSON.stringify(this.users, null, 2), 'utf8');
      return this.users;
    } catch (err) {
      console.error('Error al guardar users.json:', err.message);
      throw err;
    }
  }

  assertCanManageAccess(requestingUser) {
    const cleanReqUser = String(requestingUser || '').trim().toUpperCase();
    if (cleanReqUser !== 'ALONSO') {
      throw new Error('Permiso denegado: Únicamente el usuario administrador ALONSO tiene autorización para crear, modificar accesos o eliminar operadores.');
    }
  }

  getCentros() {
    return CENTROS_INFO.map(c => {
      const centroUsers = this.users.filter(u => u.centro === c.codigo && u.activo);
      const encargados = centroUsers.filter(u => u.cargo === 'ENCARGADO');
      const auxiliares = centroUsers.filter(u => u.cargo === 'AUXILIAR');
      return {
        ...c,
        totalUsuarios: centroUsers.length,
        encargados: encargados.map(e => ({ id: e.id, nombre: e.nombre, usuario: e.usuario })),
        auxiliaresCount: auxiliares.length,
        encargadosCount: encargados.length
      };
    });
  }

  getPublicUsers(centro = null) {
    this.users = this.loadUsers();
    let list = this.users.filter(u => u.activo);
    if (centro && centro !== 'TODOS') {
      list = list.filter(u => u.centro === String(centro).trim() || u.cargo === 'ADMIN');
    }
    return list.map(({ password, ...safeUser }) => safeUser);
  }

  getAllUsersWithDetails(centro = null) {
    this.users = this.loadUsers();
    let list = this.users;
    if (centro && centro !== 'TODOS') {
      list = list.filter(u => u.centro === String(centro).trim() || u.cargo === 'ADMIN');
    }
    return list.map(({ password, ...safeUser }) => ({
      ...safeUser,
      hasPassword: Boolean(password)
    }));
  }

  authenticate(username, password, centro = null) {
    this.users = this.loadUsers();
    if (!username || !password) {
      return { success: false, error: 'Usuario y contraseña son requeridos' };
    }

    const cleanUsername = String(username).trim().toUpperCase();
    const cleanPassword = String(password).trim();
    const cleanCentro = centro ? String(centro).trim() : null;

    // 1. Check if Global Administrator is logging in
    const adminUsers = this.users.filter(
      u => u.usuario.toUpperCase() === cleanUsername && u.cargo === 'ADMIN' && u.activo
    );
    for (const adminUser of adminUsers) {
      const matchExact = adminUser.password === cleanPassword;
      const matchUpper = adminUser.password.toUpperCase() === cleanPassword.toUpperCase();
      if (matchExact || matchUpper) {
        adminUser.ultimoAcceso = new Date().toISOString();
        this.saveUsers(this.users);
        const { password: _, ...userData } = adminUser;
        return {
          success: true,
          user: userData
        };
      }
    }

    // 2. Standard user search (scoped to centro if provided)
    let user = null;
    if (cleanCentro && cleanCentro !== 'TODOS') {
      user = this.users.find(
        u => u.usuario.toUpperCase() === cleanUsername && u.centro === cleanCentro && u.activo
      );
    }

    if (!user) {
      // Fallback search by username and password directly
      const candidates = this.users.filter(
        u => u.usuario.toUpperCase() === cleanUsername && u.activo
      );
      if (candidates.length === 1) {
        user = candidates[0];
      } else if (candidates.length > 1) {
        user = candidates.find(u => u.password === cleanPassword || u.password.toUpperCase() === cleanPassword.toUpperCase()) || candidates[0];
      }
    }

    if (!user) {
      return { success: false, error: 'Usuario no encontrado en el centro seleccionado' };
    }

    const matchExact = user.password === cleanPassword;
    const matchUpper = user.password.toUpperCase() === cleanPassword.toUpperCase();
    if (!matchExact && !matchUpper) {
      return { success: false, error: 'Contraseña incorrecta' };
    }

    // Update last access timestamp
    user.ultimoAcceso = new Date().toISOString();
    this.saveUsers(this.users);

    const { password: _, ...userData } = user;
    return {
      success: true,
      user: userData
    };
  }

  addUser({ nombre, centro = '1300', cargo = 'AUXILIAR', usuario, password, avatarColor = '#3b82f6' }, requestingUser = null) {
    this.assertCanManageAccess(requestingUser);

    if (!nombre || !usuario || !password) {
      throw new Error('Nombre, usuario y contraseña son obligatorios.');
    }

    const cleanUsername = usuario.trim().toUpperCase();
    const cleanCentro = String(centro).trim();

    // Check if user already exists
    const exists = this.users.some(
      u => u.usuario.toUpperCase() === cleanUsername && u.centro === cleanCentro && u.activo
    );
    if (exists) {
      throw new Error(`El usuario "${cleanUsername}" ya existe en el Centro ${cleanCentro}.`);
    }

    const newUser = {
      id: `usr-${cleanCentro}-${Date.now()}`,
      nombre: nombre.trim().toUpperCase(),
      centro: cleanCentro,
      cargo: cargo.trim().toUpperCase(),
      usuario: cleanUsername,
      password: password.trim(),
      avatarColor,
      activo: true,
      ultimoAcceso: null
    };

    this.users.push(newUser);
    this.saveUsers(this.users);

    const { password: _, ...userData } = newUser;
    return userData;
  }

  updateUser(id, updates, requestingUser = null) {
    this.assertCanManageAccess(requestingUser);

    const userIndex = this.users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      throw new Error('Usuario no encontrado.');
    }

    const current = this.users[userIndex];
    const updated = {
      ...current,
      ...updates
    };

    if (updates.nombre) updated.nombre = updates.nombre.trim().toUpperCase();
    if (updates.cargo) updated.cargo = updates.cargo.trim().toUpperCase();
    if (updates.centro) updated.centro = String(updates.centro).trim();
    if (updates.password) updated.password = updates.password.trim();

    this.users[userIndex] = updated;
    this.saveUsers(this.users);

    const { password: _, ...userData } = updated;
    return userData;
  }

  deleteUser(id, requestingUser = null) {
    this.assertCanManageAccess(requestingUser);

    const userIndex = this.users.findIndex(u => u.id === id);

    if (userIndex === -1) {
      throw new Error('Usuario no encontrado.');
    }

    // Do not allow deleting superadmin
    if (this.users[userIndex].usuario.toUpperCase() === 'ALONSO' && this.users[userIndex].cargo === 'ADMIN') {
      throw new Error('No es posible eliminar al Super Administrador principal.');
    }

    this.users[userIndex].activo = false;
    this.saveUsers(this.users);
    return { success: true, message: 'Usuario desactivado correctamente' };
  }
}

module.exports = new UsersService();
