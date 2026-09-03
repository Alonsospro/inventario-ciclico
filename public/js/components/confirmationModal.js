// Modal Helper Component
window.ModalHelper = {
  confirmResolver: null,

  open(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('active');
    }
  },

  close(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('active');
    }
    if (modalId === 'modal-app-confirm' && this.confirmResolver) {
      this.confirmResolver(false);
      this.confirmResolver = null;
    }
  },

  confirm({ title = 'Confirmación', message = '¿Desea continuar?', icon = 'fa-solid fa-circle-question', confirmText = 'Aceptar', cancelText = 'Cancelar', confirmBtnClass = 'btn-primary' } = {}) {
    return new Promise((resolve) => {
      this.confirmResolver = resolve;

      const modal = document.getElementById('modal-app-confirm');
      const titleEl = document.getElementById('modal-app-confirm-title');
      const msgEl = document.getElementById('modal-app-confirm-message');
      const okBtn = document.getElementById('modal-app-confirm-ok-btn');
      const cancelBtn = document.getElementById('modal-app-confirm-cancel-btn');

      if (!modal) {
        // Fallback to browser confirm
        return resolve(window.confirm(message));
      }

      if (titleEl) {
        titleEl.innerHTML = `<i class="${icon}"></i> ${title}`;
      }
      if (msgEl) {
        msgEl.textContent = message;
      }
      if (okBtn) {
        okBtn.textContent = confirmText;
        okBtn.className = `btn ${confirmBtnClass}`;
        okBtn.onclick = () => {
          this.close('modal-app-confirm');
          resolve(true);
          this.confirmResolver = null;
        };
      }
      if (cancelBtn) {
        cancelBtn.textContent = cancelText;
        cancelBtn.onclick = () => {
          this.close('modal-app-confirm');
          resolve(false);
          this.confirmResolver = null;
        };
      }

      const closeBtn = document.getElementById('modal-app-confirm-close-btn');
      if (closeBtn) {
        closeBtn.onclick = () => {
          this.close('modal-app-confirm');
          resolve(false);
          this.confirmResolver = null;
        };
      }

      this.open('modal-app-confirm');
    });
  },

  init() {
    // Setup modal close listeners
    document.addEventListener('click', (e) => {
      const closeBtn = e.target.closest('[data-close-modal]');
      if (closeBtn) {
        const modalId = closeBtn.getAttribute('data-close-modal');
        this.close(modalId);
      } else if (e.target.classList.contains('modal-overlay')) {
        const modalId = e.target.id;
        this.close(modalId);
      }
    });
  }
};
