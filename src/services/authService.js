const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const storagePath = require('./storagePath');

class AuthService {
  constructor() {
    this.usersFile = storagePath.getUsersFilePath();
    this.seedDefaultUsers();
  }

  seedDefaultUsers() {
    let users = storagePath.readJson(this.usersFile, null);
    if (!users || !Array.isArray(users) || users.length === 0) {
      const salt = bcrypt.genSaltSync(10);
      const defaultUsers = [
        {
          id: 'USR-SUPERADMIN-ALONSO',
          username: 'ALONSO',
          displayName: 'Alonso (Superadmin)',
          role: 'ADMIN',
          center: 'GLOBAL',
          isSuperadmin: true,
          passwordHash: bcrypt.hashSync('alonso.superadmin2026', salt),
          createdAt: new Date().toISOString(),
          active: true
        },
        {
          id: 'USR-ADMIN-GLOBAL',
          username: 'admin',
          displayName: 'Administrador General',
          role: 'ADMIN',
          center: 'GLOBAL',
          isSuperadmin: false,
          passwordHash: bcrypt.hashSync('admin.nibol2026', salt),
          createdAt: new Date().toISOString(),
          active: true
        },
        {
          id: 'USR-ENC-WARNES',
          username: 'encargado_warnes',
          displayName: 'Encargado Warnes',
          role: 'ENCARGADO',
          center: 'WARNES',
          isSuperadmin: false,
          passwordHash: bcrypt.hashSync('warnes2026', salt),
          createdAt: new Date().toISOString(),
          active: true
        },
        {
          id: 'USR-AUX-WARNES-1',
          username: 'auxiliar_warnes',
          displayName: 'Carlos Pérez (Auxiliar Warnes)',
          role: 'AUXILIAR',
          center: 'WARNES',
          isSuperadmin: false,
          passwordHash: bcrypt.hashSync('auxiliar2026', salt),
          createdAt: new Date().toISOString(),
          active: true
        },
        {
          id: 'USR-AUX-WARNES-2',
          username: 'auxiliar_warnes2',
          displayName: 'Jorge Medina (Auxiliar Warnes 2)',
          role: 'AUXILIAR',
          center: 'WARNES',
          isSuperadmin: false,
          passwordHash: bcrypt.hashSync('auxiliar2026', salt),
          createdAt: new Date().toISOString(),
          active: true
        },
        {
          id: 'USR-ENC-CENTRAL',
          username: 'encargado_central',
          displayName: 'Encargado Central',
          role: 'ENCARGADO',
          center: 'CENTRAL',
          isSuperadmin: false,
          passwordHash: bcrypt.hashSync('central2026', salt),
          createdAt: new Date().toISOString(),
          active: true
        },
        {
          id: 'USR-AUX-CENTRAL-1',
          username: 'auxiliar_central',
          displayName: 'Roberto Siles (Auxiliar Central)',
          role: 'AUXILIAR',
          center: 'CENTRAL',
          isSuperadmin: false,
          passwordHash: bcrypt.hashSync('auxiliar2026', salt),
          createdAt: new Date().toISOString(),
          active: true
        }
      ];

      storagePath.writeJson(this.usersFile, defaultUsers);
      console.log('[authService] Default users seeded successfully.');
    }
  }

  getUsersList() {
    return storagePath.readJson(this.usersFile, []);
  }

  saveUsersList(users) {
    storagePath.writeJson(this.usersFile, users);
  }

  authenticate(username, password) {
    if (!username || !password) {
      throw new Error('Debe proporcionar usuario y contraseña');
    }

    const cleanUsername = String(username).trim();
    const users = this.getUsersList();
    const user = users.find(
      u => u.username.toLowerCase() === cleanUsername.toLowerCase() && u.active !== false
    );

    if (!user) {
      throw new Error('Credenciales inválidas o usuario inactivo');
    }

    const isMatch = bcrypt.compareSync(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Credenciales inválidas o usuario inactivo');
    }

    const token = this.generateToken(user);
    const sanitizedUser = this.sanitizeUser(user);

    return {
      token,
      user: sanitizedUser
    };
  }

  generateToken(user) {
    return jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        center: user.center,
        isSuperadmin: !!user.isSuperadmin
      },
      config.jwtSecret,
      { expiresIn: '24h' }
    );
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, config.jwtSecret);
    } catch (err) {
      return null;
    }
  }

  getUserById(userId) {
    const users = this.getUsersList();
    const found = users.find(u => u.id === userId);
    return found ? this.sanitizeUser(found) : null;
  }

  getUserByUsername(username) {
    const users = this.getUsersList();
    const found = users.find(u => u.username.toLowerCase() === String(username).toLowerCase());
    return found ? this.sanitizeUser(found) : null;
  }

  sanitizeUser(user) {
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  }

  getAllUsers(requestingUser) {
    const users = this.getUsersList();
    let filtered = users;

    if (requestingUser.role === 'ADMIN' || requestingUser.isSuperadmin) {
      // Admin sees all
      filtered = users;
    } else if (requestingUser.role === 'ENCARGADO') {
      // Encargado only sees users in their center
      filtered = users.filter(u => u.center === requestingUser.center);
    } else {
      // Auxiliar cannot view user lists
      return [];
    }

    return filtered.map(u => this.sanitizeUser(u));
  }

  createUser(userData, requestingUser) {
    if (requestingUser.role !== 'ADMIN' && requestingUser.role !== 'ENCARGADO') {
      throw new Error('No tiene permisos para crear usuarios');
    }

    const { username, password, displayName, role, center } = userData;
    if (!username || !password || !role) {
      throw new Error('Faltan campos obligatorios (username, password, role)');
    }

    const targetCenter = requestingUser.role === 'ADMIN' ? (center || 'GLOBAL') : requestingUser.center;
    const targetRole = requestingUser.role === 'ADMIN' ? role : 'AUXILIAR'; // Encargado can only create Auxiliares

    const users = this.getUsersList();
    const exists = users.some(u => u.username.toLowerCase() === username.toLowerCase());
    if (exists) {
      throw new Error(`El usuario '${username}' ya existe`);
    }

    const salt = bcrypt.genSaltSync(10);
    const newUser = {
      id: 'USR-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      username: username.trim(),
      displayName: (displayName || username).trim(),
      role: targetRole,
      center: targetCenter,
      isSuperadmin: false,
      passwordHash: bcrypt.hashSync(password, salt),
      createdAt: new Date().toISOString(),
      active: true
    };

    users.push(newUser);
    this.saveUsersList(users);

    return this.sanitizeUser(newUser);
  }

  updateUser(userId, updateData, requestingUser) {
    const users = this.getUsersList();
    const userIndex = users.findIndex(u => u.id === userId);

    if (userIndex === -1) {
      throw new Error('Usuario no encontrado');
    }

    const target = users[userIndex];

    if (!requestingUser.isSuperadmin && requestingUser.role !== 'ADMIN') {
      if (requestingUser.role === 'ENCARGADO' && target.center !== requestingUser.center) {
        throw new Error('No tiene permisos para modificar usuarios de otro centro');
      }
      if (requestingUser.role === 'AUXILIAR') {
        throw new Error('No tiene permisos para modificar usuarios');
      }
    }

    if (updateData.displayName) target.displayName = updateData.displayName.trim();
    if (updateData.password && updateData.password.trim().length >= 4) {
      const salt = bcrypt.genSaltSync(10);
      target.passwordHash = bcrypt.hashSync(updateData.password.trim(), salt);
    }

    if (requestingUser.role === 'ADMIN' || requestingUser.isSuperadmin) {
      if (updateData.role) target.role = updateData.role;
      if (updateData.center) target.center = updateData.center;
      if (typeof updateData.active === 'boolean') target.active = updateData.active;
    }

    users[userIndex] = target;
    this.saveUsersList(users);

    return this.sanitizeUser(target);
  }

  deleteUser(userId, requestingUser) {
    if (!requestingUser.isSuperadmin && requestingUser.role !== 'ADMIN') {
      throw new Error('Solo los administradores pueden eliminar usuarios');
    }

    const users = this.getUsersList();
    const target = users.find(u => u.id === userId);
    if (!target) {
      throw new Error('Usuario no encontrado');
    }

    if (target.isSuperadmin || target.username.toUpperCase() === 'ALONSO') {
      throw new Error('No se puede eliminar al usuario Superadministrador principal');
    }

    const updated = users.filter(u => u.id !== userId);
    this.saveUsersList(updated);
    return { success: true, message: `Usuario ${target.username} eliminado` };
  }
}

module.exports = new AuthService();
