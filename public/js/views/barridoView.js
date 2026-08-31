// View: Dedicated Barrido Screen
window.BarridoView = {
  currentScannedProduct: null,
  isCameraActive: false,
  uploadedPhotoUrl: null,

  init() {
    this.setupListeners();
  },

  setupListeners() {
    // Toggle Camera in Barrido
    document.getElementById('btn-toggle-barrido-cam')?.addEventListener('click', () => {
      this.toggleCamera();
    });

    // Manual Barcode / SKU search
    document.getElementById('btn-search-barrido-manual')?.addEventListener('click', () => {
      this.searchManual();
    });

    document.getElementById('input-barrido-manual')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.searchManual();
      }
    });

    // Mal estado input change -> toggle photo upload box
    document.getElementById('barrido-input-damaged')?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10) || 0;
      const photoBox = document.getElementById('barrido-photo-box');
      if (photoBox) {
        photoBox.style.display = val > 0 ? 'block' : 'none';
      }
    });

    // Photo file selection & upload
    const photoZone = document.getElementById('zone-barrido-photo');
    const photoInput = document.getElementById('input-barrido-photo-file');
    const previewImg = document.getElementById('img-barrido-preview');

    photoZone?.addEventListener('click', () => photoInput.click());

    photoInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        window.Toast.info('Subiendo evidencia binaria de daño...');
        const res = await window.API.uploadPhoto(file);
        if (res.photo && res.photo.url) {
          this.uploadedPhotoUrl = res.photo.url;
          previewImg.src = res.photo.url;
          previewImg.style.display = 'block';
          window.Toast.success('Foto subida con éxito.');
        }
      } catch (err) {
        window.Toast.danger(err.message || 'Error al subir foto.');
      }
    });

    // Form submit: Register Barrido Count
    document.getElementById('form-barrido-count')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!this.currentScannedProduct) return;

      const loc = document.getElementById('barrido-input-loc').value.trim();
      const qty = parseInt(document.getElementById('barrido-input-qty').value, 10) || 0;
      const damaged = parseInt(document.getElementById('barrido-input-damaged').value, 10) || 0;

      if (!loc) {
        window.Toast.warning('Debe ingresar la ubicación física.');
        return;
      }

      try {
        const item = this.currentScannedProduct.item;
        const isNewLoc = item.UbicacionOriginal && item.UbicacionOriginal !== loc;

        await window.API.registerBarridoCount({
          inventoryId: this.currentScannedProduct.inventoryId || null,
          itemId: item.id || null,
          sku: item.SKU,
          stockFisico: qty,
          malEstado: damaged,
          location: loc,
          isNewLocation: isNewLoc,
          reason: 'Barrido físico registrado'
        });

        window.Toast.success(`Registrado ${qty} unid. de ${item.SKU} en ${loc}`);
        this.resetBarridoForm();
      } catch (err) {
        window.Toast.danger(err.message || 'Error registrando conteo en barrido');
      }
    });

    // Finalizar Barrido
    document.getElementById('btn-finish-barrido')?.addEventListener('click', async () => {
      if (!confirm('¿Desea dar por concluido el barrido y enviarlo a revisión por el administrador?')) {
        return;
      }

      try {
        const res = await window.API.finishBarrido({});
        window.Toast.success(res.message || 'Barrido finalizado correctamente');
        window.Router.navigate('inventories');
      } catch (err) {
        window.Toast.danger(err.message || 'Error al finalizar barrido');
      }
    });
  },

  async toggleCamera() {
    const btn = document.getElementById('btn-toggle-barrido-cam');
    if (this.isCameraActive) {
      await window.ScannerComponent.stop();
      this.isCameraActive = false;
      if (btn) btn.innerHTML = '<i class="fa-solid fa-video"></i> Activar Cámara';
    } else {
      if (btn) btn.innerHTML = '<i class="fa-solid fa-video-slash"></i> Detener Cámara';
      this.isCameraActive = true;
      await window.ScannerComponent.start('barrido-reader', (barcode) => {
        this.handleBarcodeRead(barcode);
      });
    }
  },

  async searchManual() {
    const input = document.getElementById('input-barrido-manual');
    const term = input.value.trim();
    if (!term) {
      window.Toast.warning('Ingrese un código o SKU para buscar.');
      return;
    }

    await this.handleBarcodeRead(term);
  },

  async handleBarcodeRead(barcode) {
    try {
      const res = await window.API.searchBarrido(barcode, window.Auth.currentUser?.center);
      this.displayScannedItem(res);
      window.Toast.success(`Código reconocido: ${barcode}`);
    } catch (err) {
      window.Toast.danger(err.message || 'Error al buscar producto');
    }
  },

  displayScannedItem(data) {
    this.currentScannedProduct = data;
    const item = data.item;

    document.getElementById('barrido-empty-state').style.display = 'none';
    const form = document.getElementById('form-barrido-count');
    form.style.display = 'block';

    document.getElementById('barrido-item-sku').textContent = item.SKU;
    document.getElementById('barrido-item-desc').textContent = item.Descripcion;
    document.getElementById('barrido-item-abc').textContent = `ABC: ${item.Clasificacion_ABC || 'C'}`;
    document.getElementById('barrido-item-orig-loc').textContent = item.UbicacionOriginal || item.Ubicacion || 'No asignada';

    document.getElementById('barrido-input-loc').value = item.Ubicacion || '';
    document.getElementById('barrido-input-qty').value = item.Stock_Fisico !== null && item.Stock_Fisico !== undefined ? item.Stock_Fisico : 1;
    document.getElementById('barrido-input-damaged').value = item.Mal_estado || 0;

    const photoBox = document.getElementById('barrido-photo-box');
    photoBox.style.display = (item.Mal_estado > 0) ? 'block' : 'none';
    this.uploadedPhotoUrl = null;
    document.getElementById('img-barrido-preview').style.display = 'none';
  },

  resetBarridoForm() {
    this.currentScannedProduct = null;
    this.uploadedPhotoUrl = null;
    document.getElementById('form-barrido-count').reset();
    document.getElementById('form-barrido-count').style.display = 'none';
    document.getElementById('barrido-empty-state').style.display = 'block';
    document.getElementById('input-barrido-manual').value = '';
    document.getElementById('img-barrido-preview').style.display = 'none';
    document.getElementById('barrido-photo-box').style.display = 'none';
  }
};
