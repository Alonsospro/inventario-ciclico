// View: Inventories & Operative Count (Blind Count Mode)
window.InventoryView = {
  currentInventory: null,
  gasFetchedItems: [],

  init() {
    this.setupListeners();
  },

  setupListeners() {
    // Filter changes
    document.getElementById('filter-inv-type')?.addEventListener('change', () => this.loadInventories());
    document.getElementById('filter-inv-center')?.addEventListener('change', () => this.loadInventories());

    // Back to list button
    document.getElementById('btn-back-to-invs')?.addEventListener('click', () => {
      this.currentInventory = null;
      document.getElementById('view-count').classList.remove('active');
      document.getElementById('view-inventories').classList.add('active');
      this.loadInventories();
    });

    // Open new inventory modal
    document.getElementById('btn-open-new-inv-modal')?.addEventListener('click', () => {
      this.gasFetchedItems = [];
      const form = document.getElementById('form-new-inventory');
      if (form) form.reset();
      const statusSpan = document.getElementById('gas-fetch-status');
      if (statusSpan) statusSpan.textContent = '';
      window.ModalHelper.open('modal-new-inventory');
    });

    // Fetch from GAS button inside modal
    document.getElementById('btn-fetch-gas-template')?.addEventListener('click', async () => {
      const type = document.getElementById('new-inv-type').value;
      const center = document.getElementById('new-inv-center').value;
      const btn = document.getElementById('btn-fetch-gas-template');
      const statusSpan = document.getElementById('gas-fetch-status');

      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando con Google Apps Script...';
      statusSpan.textContent = '';

      try {
        const res = await window.API.fetchFromGas({ type, center });
        if (res.products && res.products.length > 0) {
          this.gasFetchedItems = res.products;
          statusSpan.textContent = `✅ ${res.products.length} productos listos para importar.`;
          window.Toast.success(`Cargados ${res.products.length} productos desde Google Sheets`);
        } else {
          statusSpan.textContent = 'ℹ️ Sin productos remotos. Se creará inventario vacío.';
          window.Toast.info(res.message || 'Se inicializará plantilla local');
        }
      } catch (err) {
        statusSpan.textContent = '⚠️ ' + err.message;
        window.Toast.warning('Aviso GAS: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Cargar productos desde Google Apps Script';
      }
    });

    // Form submit: New Inventory
    document.getElementById('form-new-inventory')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('new-inv-name').value;
      const type = document.getElementById('new-inv-type').value;
      const center = document.getElementById('new-inv-center').value;

      try {
        await window.API.createInventory({
          name,
          type,
          center,
          items: this.gasFetchedItems
        });

        window.Toast.success('Inventario creado exitosamente');
        window.ModalHelper.close('modal-new-inventory');
        this.loadInventories();
      } catch (err) {
        window.Toast.danger(err.message || 'Error creando inventario');
      }
    });

    // Search input in count view
    document.getElementById('search-count-items')?.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      this.filterCountTable(term);
    });

    // + Nueva Ubicación (Multiple Locations) button
    document.getElementById('btn-add-multiple-location')?.addEventListener('click', () => {
      if (!this.currentInventory) return;
      this.openCountModal(null, true);
    });

    // Form submit: Confirm Count
    document.getElementById('form-confirm-count')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const itemId = document.getElementById('modal-count-item-id').value;
      const isNewLoc = document.getElementById('modal-count-is-new-loc').value === 'true';
      const newLoc = document.getElementById('modal-input-new-loc').value.trim();
      const qtyVal = document.getElementById('modal-input-qty').value;
      const damagedVal = document.getElementById('modal-input-damaged').value;

      const qty = qtyVal !== '' ? parseInt(qtyVal, 10) : 0;
      const damaged = damagedVal !== '' ? parseInt(damagedVal, 10) : 0;

      if (isNewLoc && !newLoc) {
        window.Toast.warning('Debe especificar la nueva ubicación física.');
        return;
      }

      try {
        await window.API.registerCount(this.currentInventory.id, {
          itemId: itemId || null,
          stockFisico: qty,
          malEstado: damaged,
          location: isNewLoc ? newLoc : null,
          isNewLocation: isNewLoc
        });

        window.Toast.success('Conteo registrado correctamente');
        window.ModalHelper.close('modal-count-confirm');
        await this.reloadCurrentInventory();
      } catch (err) {
        window.Toast.danger(err.message || 'Error al guardar conteo');
      }
    });

    // Submit Inventory for Review & Signature
    document.getElementById('btn-submit-inv-review')?.addEventListener('click', async () => {
      if (!this.currentInventory) return;

      const uncounted = this.currentInventory.items.filter(it => it.Stock_Fisico === null);
      if (uncounted.length > 0) {
        window.Toast.warning(`Aún quedan ${uncounted.length} ítems pendientes de conteo.`);
        return;
      }

      if (!confirm('¿Desea enviar este inventario a revisión final de justificaciones?')) {
        return;
      }

      try {
        await window.API.submitInventory(this.currentInventory.id, {
          signature: `Firmado digitalmente por ${window.Auth.currentUser.username} (${new Date().toLocaleString()})`
        });

        window.Toast.success('Inventario enviado a revisión de justificaciones con éxito');
        this.openInventory(this.currentInventory.id);
      } catch (err) {
        window.Toast.danger(err.message || 'Error al enviar inventario');
      }
    });

    // Scanner button in Count View
    document.getElementById('btn-open-cam-count')?.addEventListener('click', () => {
      window.ModalHelper.open('modal-camera-scanner');
      window.ScannerComponent.start('general-reader', (decodedText) => {
        window.ModalHelper.close('modal-camera-scanner');
        window.ScannerComponent.stop();
        this.handleBarcodeScannedInCount(decodedText);
      });
    });
  },

  async loadInventories() {
    const type = document.getElementById('filter-inv-type')?.value || 'TODOS';
    const center = document.getElementById('filter-inv-center')?.value || 'TODOS';

    const tbody = document.getElementById('tbody-inventories');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando inventarios...</td></tr>';

    try {
      const res = await window.API.getInventories({ type, center });
      const list = res.inventories || [];

      if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-dim);">No se encontraron inventarios disponibles.</td></tr>';
        return;
      }

      tbody.innerHTML = list.map(inv => {
        const percent = inv.totalItems > 0 ? Math.round((inv.countedItems / inv.totalItems) * 100) : 0;
        let badgeClass = 'badge-neutral';
        if (inv.status === 'EN_PROGRESO') badgeClass = 'badge-info';
        if (inv.status === 'PENDIENTE_JUSTIFICACION') badgeClass = 'badge-warning';
        if (inv.status === 'REVISADO') badgeClass = 'badge-success';

        return `
          <tr>
            <td><strong style="color: var(--primary); font-family: var(--font-mono);">${inv.id}</strong></td>
            <td><strong>${inv.name}</strong></td>
            <td><span class="badge badge-neutral">${inv.type}</span></td>
            <td><span class="badge badge-neutral">${inv.center}</span></td>
            <td><span class="badge ${badgeClass}">${inv.status}</span></td>
            <td>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <div style="flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden; min-width: 60px;">
                  <div style="width: ${percent}%; height: 100%; background: var(--primary);"></div>
                </div>
                <span style="font-size: 0.75rem; font-family: var(--font-mono);">${inv.countedItems}/${inv.totalItems} (${percent}%)</span>
              </div>
            </td>
            <td>
              <div style="display: flex; gap: 0.35rem;">
                <button class="btn btn-primary btn-sm" onclick="window.InventoryView.openInventory('${inv.id}')">
                  <i class="fa-solid fa-play"></i> ${window.Auth.currentUser?.role === 'AUXILIAR' ? 'Contar' : 'Abrir'}
                </button>
                ${(window.Auth.hasRole(['ADMIN'])) ? `
                  <button class="btn btn-danger btn-sm" onclick="window.InventoryView.promptDelete('${inv.id}')" title="Eliminar">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--danger);">Error: ${err.message}</td></tr>`;
    }
  },

  async openInventory(id) {
    try {
      const res = await window.API.getInventoryById(id);
      this.currentInventory = res.inventory;

      document.getElementById('view-inventories').classList.remove('active');
      document.getElementById('view-count').classList.add('active');

      document.getElementById('count-inv-title').textContent = `${this.currentInventory.name} (${this.currentInventory.center})`;
      
      const blindBanner = document.getElementById('count-blind-banner');
      if (blindBanner) {
        blindBanner.style.display = this.currentInventory.isBlindCount ? 'inline-flex' : 'none';
      }

      this.renderCountTable();
    } catch (err) {
      window.Toast.danger(err.message || 'No se pudo abrir el inventario');
    }
  },

  async reloadCurrentInventory() {
    if (!this.currentInventory) return;
    const res = await window.API.getInventoryById(this.currentInventory.id);
    this.currentInventory = res.inventory;
    this.renderCountTable();
  },

  renderCountTable() {
    if (!this.currentInventory) return;

    const isBlind = this.currentInventory.isBlindCount;
    const thead = document.getElementById('thead-count-items');
    const tbody = document.getElementById('tbody-count-items');

    if (isBlind) {
      // Blind Count Headers (Columns H, I, K, L, O hidden)
      thead.innerHTML = `
        <tr>
          <th>SKU (A)</th>
          <th>Código Barras (B)</th>
          <th>Descripción (C)</th>
          <th>Ubicación (D)</th>
          <th>Categoría (E)</th>
          <th>ABC (F)</th>
          <th>Unidad (G)</th>
          <th>Físico (J)</th>
          <th>Mal Estado (P)</th>
          <th>Responsable (N)</th>
          <th>Acción</th>
        </tr>
      `;
    } else {
      // Full Headers (Admin / Encargado)
      thead.innerHTML = `
        <tr>
          <th>SKU</th>
          <th>Código Barras</th>
          <th>Descripción</th>
          <th>Ubicación</th>
          <th>ABC</th>
          <th>Costo Unit.</th>
          <th>Stock Sist.</th>
          <th>Stock Fís.</th>
          <th>Dif.</th>
          <th>Costo Dif.</th>
          <th>Mal Estado</th>
          <th>Responsable</th>
          <th>Estado</th>
          <th>Acción</th>
        </tr>
      `;
    }

    tbody.innerHTML = this.currentInventory.items.map(item => {
      const isCounted = item.Stock_Fisico !== null && item.Stock_Fisico !== undefined;
      const rowClass = isCounted ? 'counted-row' : '';

      if (isBlind) {
        return `
          <tr class="${rowClass}" data-item-id="${item.id}">
            <td><strong style="color: var(--primary);">${item.SKU}</strong></td>
            <td><code>${item.Codigo_Barras || '-'}</code></td>
            <td>${item.Descripcion}</td>
            <td><span class="badge badge-info"><i class="fa-solid fa-location-dot"></i> ${item.Ubicacion || '-'}</span></td>
            <td>${item.Categoria || '-'}</td>
            <td><span class="badge badge-neutral">${item.Clasificacion_ABC || 'C'}</span></td>
            <td>${item.Unidad || 'PZA'}</td>
            <td>
              <strong style="font-size: 1.1rem; color: ${isCounted ? 'var(--primary)' : 'var(--text-dim)'}; font-family: var(--font-mono);">
                ${isCounted ? item.Stock_Fisico : '-'}
              </strong>
            </td>
            <td>
              ${(item.Mal_estado > 0) ? `<span class="badge badge-danger">${item.Mal_estado}</span>` : '0'}
            </td>
            <td><small>${item.Responsable || '-'}</small></td>
            <td>
              <button class="btn btn-primary btn-sm" onclick="window.InventoryView.openCountModal('${item.id}', false)">
                <i class="fa-solid fa-calculator"></i> ${isCounted ? 'Editar' : 'Contar'}
              </button>
            </td>
          </tr>
        `;
      }

      // Full View
      const diff = item.Diferencia || 0;
      let diffBadge = 'badge-success';
      if (diff < 0) diffBadge = 'badge-danger';
      if (diff > 0) diffBadge = 'badge-warning';

      return `
        <tr class="${rowClass}" data-item-id="${item.id}">
          <td><strong style="color: var(--primary);">${item.SKU}</strong></td>
          <td><code>${item.Codigo_Barras || '-'}</code></td>
          <td>${item.Descripcion}</td>
          <td><span class="badge badge-info"><i class="fa-solid fa-location-dot"></i> ${item.Ubicacion || '-'}</span></td>
          <td><span class="badge badge-neutral">${item.Clasificacion_ABC || 'C'}</span></td>
          <td>$${(item.Costo_Unitario || 0).toFixed(2)}</td>
          <td><strong>${item.Stock_Sistema || 0}</strong></td>
          <td><strong style="color: var(--primary); font-family: var(--font-mono);">${isCounted ? item.Stock_Fisico : '-'}</strong></td>
          <td><span class="badge ${diffBadge}">${diff > 0 ? '+' : ''}${diff}</span></td>
          <td>$${(item.Costo_Diferencia || 0).toFixed(2)}</td>
          <td>${item.Mal_estado > 0 ? `<span class="badge badge-danger">${item.Mal_estado}</span>` : '0'}</td>
          <td><small>${item.Responsable || '-'}</small></td>
          <td><span class="badge badge-neutral">${item.Estado || 'Pendiente'}</span></td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="window.InventoryView.openCountModal('${item.id}', false)">
              <i class="fa-solid fa-pen"></i> Contar
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  filterCountTable(term) {
    const rows = document.querySelectorAll('#tbody-count-items tr');
    rows.forEach(row => {
      const text = row.textContent.toLowerCase();
      row.style.display = text.includes(term) ? '' : 'none';
    });
  },

  openCountModal(itemId, isNewLocation = false) {
    document.getElementById('modal-count-is-new-loc').value = isNewLocation ? 'true' : 'false';
    const newLocGroup = document.getElementById('group-new-location-input');

    if (isNewLocation) {
      newLocGroup.style.display = 'block';
      document.getElementById('modal-count-item-id').value = '';
      document.getElementById('modal-count-sku').textContent = 'NUEVA UBICACIÓN ADICIONAL';
      document.getElementById('modal-count-desc').textContent = 'Se creará una fila nueva al final sin sobreescribir la original';
      document.getElementById('modal-count-loc').textContent = 'Especifique la nueva ubicación física';
      document.getElementById('modal-input-qty').value = '';
      document.getElementById('modal-input-damaged').value = '0';
      document.getElementById('modal-input-new-loc').value = '';
    } else {
      newLocGroup.style.display = 'none';
      const item = this.currentInventory.items.find(it => it.id === itemId);
      if (!item) return;

      document.getElementById('modal-count-item-id').value = item.id;
      document.getElementById('modal-count-sku').textContent = item.SKU;
      document.getElementById('modal-count-desc').textContent = item.Descripcion;
      document.getElementById('modal-count-loc').textContent = `Ubicación registrada: ${item.Ubicacion}`;
      document.getElementById('modal-input-qty').value = item.Stock_Fisico !== null ? item.Stock_Fisico : '';
      document.getElementById('modal-input-damaged').value = item.Mal_estado || 0;
    }

    window.ModalHelper.open('modal-count-confirm');
  },

  handleBarcodeScannedInCount(barcode) {
    if (!this.currentInventory) return;
    const clean = String(barcode).trim().replace(/^JD_/i, '');
    const item = this.currentInventory.items.find(it => {
      const b = (it.Codigo_Barras || '').replace(/^JD_/i, '');
      const s = (it.SKU || '').replace(/^JD_/i, '');
      return b === clean || s.toUpperCase() === clean.toUpperCase();
    });

    if (item) {
      this.openCountModal(item.id, false);
      window.Toast.success(`Producto encontrado: ${item.SKU}`);
    } else {
      window.Toast.warning(`Código ${barcode} no encontrado en este inventario. Puede agregarlo como nueva ubicación.`);
    }
  },

  promptDelete(invId) {
    document.getElementById('delete-modal-inv-id').value = invId;
    document.getElementById('delete-modal-key').value = '';
    document.getElementById('delete-modal-reason').value = '';
    window.ModalHelper.open('modal-delete-confirm');

    const form = document.getElementById('form-delete-confirm');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const deleteKey = document.getElementById('delete-modal-key').value;
      const reason = document.getElementById('delete-modal-reason').value;

      try {
        await window.API.deleteInventory(invId, { deleteKey, reason });
        window.Toast.success('Inventario eliminado con éxito');
        window.ModalHelper.close('modal-delete-confirm');
        this.loadInventories();
      } catch (err) {
        window.Toast.danger(err.message || 'Error eliminando inventario');
      }
    };
  }
};
