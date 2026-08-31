// Authentication and Session State Manager
window.Auth = {
  currentUser: null,
  token: null,

  init() {
    this.token = localStorage.getItem(window.AppConfig.storageTokenKey);
    const storedUser = localStorage.getItem(window.AppConfig.storageUserKey);
    if (storedUser) {
      try {
        this.currentUser = JSON.parse(storedUser);
      } catch (e) {
        this.currentUser = null;
      }
    }
  },

  async checkSession() {
    if (!this.token) {
      this.logout(false);
      return false;
    }

    try {
      const res = await window.API.getMe();
      if (res && res.user) {
        this.currentUser = res.user;
        localStorage.setItem(window.AppConfig.storageUserKey, JSON.stringify(res.user));
        this.updateUI();
        return true;
      }
    } catch (e) {
      this.logout(false);
      return false;
    }
    return false;
  },

  async login(username, password) {
    const res = await window.API.login(username, password);
    this.token = res.token;
    this.currentUser = res.user;
    localStorage.setItem(window.AppConfig.storageTokenKey, res.token);
    localStorage.setItem(window.AppConfig.storageUserKey, JSON.stringify(res.user));
    this.updateUI();
    return res.user;
  },

  logout(showToast = true) {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem(window.AppConfig.storageTokenKey);
    localStorage.removeItem(window.AppConfig.storageUserKey);

    document.getElementById('main-navbar').style.display = 'none';
    window.Router.navigate('login');

    if (showToast) {
      window.Toast.info('Sesión finalizada.');
    }
  },

  updateUI() {
    if (!this.currentUser) return;

    const nav = document.getElementById('main-navbar');
    nav.style.display = 'flex';

    document.getElementById('nav-user-name').textContent = this.currentUser.displayName || this.currentUser.username;
    document.getElementById('nav-user-role').textContent = `${this.currentUser.role} • ${this.currentUser.center}`;

    const role = this.currentUser.role;
    const isSuperadmin = !!this.currentUser.isSuperadmin;

    // Toggle role-specific navigation buttons
    document.querySelectorAll('.role-admin-only').forEach(el => {
      el.style.display = (role === 'ADMIN' || isSuperadmin) ? '' : 'none';
    });

    document.querySelectorAll('.role-encargado-admin').forEach(el => {
      el.style.display = (role === 'ADMIN' || role === 'ENCARGADO' || isSuperadmin) ? '' : 'none';
    });
  },

  hasRole(allowedRoles = []) {
    if (!this.currentUser) return false;
    if (this.currentUser.isSuperadmin || this.currentUser.role === 'ADMIN') return true;
    return allowedRoles.includes(this.currentUser.role);
  }
};
