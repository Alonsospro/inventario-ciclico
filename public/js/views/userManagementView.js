// View: User Management (Admin / Superadmin Alonso)
window.UserManagementView = {
  users: [],

  init() {
    this.setupListeners();
  },

  setupListeners() {
    // Open create user modal
    document.getElementById('btn-open-create-user-modal')?.addEventListener('click', () => {
      document.getElementById('form-user-crud').reset();
      document.getElementById('user-form-id').value = '';
      document.getElementById('user-form-username').disabled = false;
      document.getElementById('user-form-pass').required = true;
      window.ModalHelper.open('modal-user-form');
    });

    // Submit user form
    document.getElementById('form-user-crud')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const id = document.getElementById('user-form-id').value;
      const username = document.getElementById('user-form-username').value.trim();
      const displayName = document.getElementById('user-form-display').value.trim();
      const password = document.getElementById('user-form-pass').value;
      const role = document.getElementById('user-form-role').value;
      const center = document.getElementById('user-form-center').value;

      try {
        if (id) {
          // Update
          await window.API.updateUser(id, { displayName, password, role, center });
          window.Toast.success('Usuario actualizado correctamente.');
        } else {
          // Create
          await window.API.createUser({ username, displayName, password, role, center });
          window.Toast.success('Usuario creado con éxito.');
        }

        window.ModalHelper.close('modal-user-form');
        this.loadUsers();
      } catch (err) {
        window.Toast.danger(err.message || 'Error al guardar usuario');
      }
    });
  },

  async loadUsers() {
    const tbody = document.getElementById('tbody-users');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando usuarios...</td></tr>';

    try {
      const res = await window.API.getUsers();
      this.users = res.users || [];

      tbody.innerHTML = this.users.map(u => {
        const isProtected = u.username.toUpperCase() === 'ALONSO' || u.isSuperadmin;

        return `
          <tr>
            <td><strong style="color: var(--primary);">${u.username}</strong> ${isProtected ? '<span class="badge badge-warning">Superadmin</span>' : ''}</td>
            <td>${u.displayName || u.username}</td>
            <td><span class="badge badge-neutral">${u.role}</span></td>
            <td><span class="badge badge-info">${u.center}</span></td>
            <td><span class="badge ${u.active !== false ? 'badge-success' : 'badge-danger'}">${u.active !== false ? 'Activo' : 'Inactivo'}</span></td>
            <td>
              <div style="display: flex; gap: 0.4rem;">
                <button class="btn btn-secondary btn-sm" onclick="window.UserManagementView.editUser('${u.id}')" title="Editar">
                  <i class="fa-solid fa-pen"></i>
                </button>
                ${!isProtected ? `
                  <button class="btn btn-danger btn-sm" onclick="window.UserManagementView.deleteUser('${u.id}', '${u.username}')" title="Eliminar">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 2rem; color: var(--danger);">Error: ${err.message}</td></tr>`;
    }
  },

  editUser(userId) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return;

    document.getElementById('user-form-id').value = user.id;
    document.getElementById('user-form-username').value = user.username;
    document.getElementById('user-form-username').disabled = true;
    document.getElementById('user-form-display').value = user.displayName || user.username;
    document.getElementById('user-form-pass').value = '';
    document.getElementById('user-form-pass').required = false;
    document.getElementById('user-form-role').value = user.role;
    document.getElementById('user-form-center').value = user.center;

    window.ModalHelper.open('modal-user-form');
  },

  async deleteUser(userId, username) {
    if (!confirm(`¿Está seguro de eliminar al usuario '${username}'?`)) return;

    try {
      await window.API.deleteUser(userId);
      window.Toast.success(`Usuario '${username}' eliminado`);
      this.loadUsers();
    } catch (err) {
      window.Toast.danger(err.message || 'Error eliminando usuario');
    }
  }
};
