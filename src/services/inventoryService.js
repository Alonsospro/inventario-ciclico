const fs = require('fs');
const path = require('path');
const config = require('../config');
const storagePath = require('./storagePath');
const auditService = require('./auditService');
const driveService = require('./driveService');
const gasService = require('./gasService');

class InventoryService {
  constructor() {
    this.invDir = storagePath.getInventoriesDirectory();
    this.justDir = storagePath.getJustificationsDirectory();
    this.seedSampleInventories();
  }

  seedSampleInventories() {
    const existing = this.getAllInventoryFiles();
    if (existing.length === 0) {
      console.log('[inventoryService] Seeding initial sample inventories...');
      const sampleItemsWarnes = [
        {
          id: 'ITEM-W1-01',
          SKU: 'JD-AH12345',
          Codigo_Barras: 'JD_78912345601',
          Descripcion: 'Filtro de Aceite Motor 6068',
          Ubicacion: 'RACK-A1-01',
          Categoria: 'FILTROS',
          Clasificacion_ABC: 'A',
          Unidad: 'PZA',
          Costo_Unitario: 45.50,
          Stock_Sistema: 10,
          Stock_Fisico: null,
          Diferencia: 0,
          Costo_Diferencia: 0,
          Fecha_Ultimo_Conteo: null,
          Responsable: 'auxiliar_warnes',
          Estado: 'Pendiente',
          Mal_estado: 0
        },
        {
          id: 'ITEM-W1-02',
          SKU: 'JD-RE504836',
          Codigo_Barras: '78912345602',
          Descripcion: 'Filtro de Combustible Primario',
          Ubicacion: 'RACK-A1-02',
          Categoria: 'FILTROS',
          Clasificacion_ABC: 'A',
          Unidad: 'PZA',
          Costo_Unitario: 68.20,
          Stock_Sistema: 15,
          Stock_Fisico: null,
          Diferencia: 0,
          Costo_Diferencia: 0,
          Fecha_Ultimo_Conteo: null,
          Responsable: 'auxiliar_warnes',
          Estado: 'Pendiente',
          Mal_estado: 0
        },
        {
          id: 'ITEM-W1-03',
          SKU: 'JD-TY26674',
          Codigo_Barras: 'JD_78912345603',
          Descripcion: 'Aceite Plus 50 II 15W40 Balde',
          Ubicacion: 'PISO-B2-01',
          Categoria: 'LUBRICANTES',
          Clasificacion_ABC: 'B',
          Unidad: 'BALDE',
          Costo_Unitario: 120.00,
          Stock_Sistema: 8,
          Stock_Fisico: null,
          Diferencia: 0,
          Costo_Diferencia: 0,
          Fecha_Ultimo_Conteo: null,
          Responsable: 'auxiliar_warnes2',
          Estado: 'Pendiente',
          Mal_estado: 0
        },
        {
          id: 'ITEM-W1-04',
          SKU: 'JD-AN20456',
          Codigo_Barras: '78912345604',
          Descripcion: 'Cuchilla Rotativa Desbrozadora',
          Ubicacion: 'RACK-C3-05',
          Categoria: 'IMPLEMENTOS',
          Clasificacion_ABC: 'C',
          Unidad: 'PZA',
          Costo_Unitario: 250.00,
          Stock_Sistema: 4,
          Stock_Fisico: null,
          Diferencia: 0,
          Costo_Diferencia: 0,
          Fecha_Ultimo_Conteo: null,
          Responsable: 'auxiliar_warnes',
          Estado: 'Pendiente',
          Mal_estado: 0
        },
        {
          id: 'ITEM-W1-05',
          SKU: 'JD-L114889',
          Codigo_Barras: 'JD_78912345605',
          Descripcion: 'Correa Alternador Ventilador',
          Ubicacion: 'RACK-A2-08',
          Categoria: 'CORREAS',
          Clasificacion_ABC: 'B',
          Unidad: 'PZA',
          Costo_Unitario: 35.00,
          Stock_Sistema: 12,
          Stock_Fisico: null,
          Diferencia: 0,
          Costo_Diferencia: 0,
          Fecha_Ultimo_Conteo: null,
          Responsable: 'auxiliar_warnes',
          Estado: 'Pendiente',
          Mal_estado: 0
        }
      ];

      const sampleCiclico = {
        id: 'INV-CICLICO-WARNES-001',
        name: 'Inventario Cíclico Filtros y Lubricantes - Warnes',
        type: 'CICLICO',
        center: 'WARNES',
        status: 'EN_PROGRESO', // EN_PROGRESO, FIRMADO, REVISADO
        createdAt: new Date().toISOString(),
        createdBy: 'admin',
        assignedAuxiliars: ['auxiliar_warnes', 'auxiliar_warnes2'],
        items: sampleItemsWarnes
      };

      const sampleBarrido = {
        id: 'INV-BARRIDO-WARNES-001',
        name: 'Barrido General Pasillo A - Warnes',
        type: 'BARRIDO',
        center: 'WARNES',
        status: 'EN_PROGRESO',
        createdAt: new Date().toISOString(),
        createdBy: 'encargado_warnes',
        assignedAuxiliars: ['auxiliar_warnes'],
        items: sampleItemsWarnes.slice(0, 3)
      };

      this.saveInventory(sampleCiclico);
      this.saveInventory(sampleBarrido);
    }
  }

  getAllInventoryFiles() {
    try {
      const files = fs.readdirSync(this.invDir);
      return files.filter(f => f.endsWith('.json'));
    } catch (e) {
      return [];
    }
  }

  saveInventory(inventory) {
    const filePath = path.join(this.invDir, `${inventory.id}.json`);
    storagePath.writeJson(filePath, inventory);
    return inventory;
  }

  getInventoryRaw(id) {
    const filePath = path.join(this.invDir, `${id}.json`);
    return storagePath.readJson(filePath, null);
  }

  getInventories(user, filterCenter = null, filterType = null) {
    const files = this.getAllInventoryFiles();
    let list = [];

    files.forEach(file => {
      const inv = storagePath.readJson(path.join(this.invDir, file), null);
      if (inv) {
        // Center filtering
        if (user.role !== 'ADMIN' && !user.isSuperadmin) {
          if (inv.center !== user.center) return;
        } else if (filterCenter && filterCenter !== 'TODOS' && filterCenter !== 'GLOBAL') {
          if (inv.center !== filterCenter) return;
        }

        // Type filtering
        if (filterType && filterType !== 'TODOS') {
          if (inv.type !== filterType) return;
        }

        // Auxiliar specific filter: only show if assigned or has pending items
        if (user.role === 'AUXILIAR') {
          const hasAssignedItems = inv.items.some(it => it.Responsable === user.username);
          if (!hasAssignedItems && !inv.assignedAuxiliars?.includes(user.username)) {
            return;
          }
        }

        // Generate summary stats for list view
        const totalItems = inv.items.length;
        const countedItems = inv.items.filter(it => it.Stock_Fisico !== null).length;
        const pendingItems = totalItems - countedItems;

        list.push({
          id: inv.id,
          name: inv.name,
          type: inv.type,
          center: inv.center,
          status: inv.status,
          createdAt: inv.createdAt,
          createdBy: inv.createdBy,
          totalItems,
          countedItems,
          pendingItems,
          isCompleted: countedItems === totalItems
        });
      }
    });

    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getInventoryById(id, user) {
    const inv = this.getInventoryRaw(id);
    if (!inv) {
      throw new Error(`Inventario con ID '${id}' no encontrado`);
    }

    // Check center authorization
    if (user.role !== 'ADMIN' && !user.isSuperadmin && inv.center !== user.center) {
      throw new Error(`No tiene permisos para acceder a inventarios del centro ${inv.center}`);
    }

    // If role is AUXILIAR:
    // 1. Filter items strictly to those assigned to this auxiliary
    // 2. Hide columns H, I, K, L, O (Blind Count)
    if (user.role === 'AUXILIAR') {
      const isConteoPhase = inv.status !== 'REVISADO';
      const userItems = inv.items.filter(it => it.Responsable === user.username || !it.Responsable);

      return {
        ...inv,
        items: userItems.map(item => {
          if (isConteoPhase) {
            const {
              Costo_Unitario,
              Stock_Sistema,
              Diferencia,
              Costo_Diferencia,
              Estado,
              ...safeBlindItem
            } = item;
            return safeBlindItem;
          }
          return item;
        }),
        isBlindCount: isConteoPhase
      };
    }

    // ADMIN and ENCARGADO see complete inventory with full columns
    return {
      ...inv,
      isBlindCount: false
    };
  }

  createInventory({ type, center, name, items, user }) {
    if (!type || !center) {
      throw new Error('Tipo y Centro son requeridos');
    }

    const cleanType = type.toUpperCase();
    const cleanCenter = center.toUpperCase();

    if (user.role !== 'ADMIN' && !user.isSuperadmin && user.center !== cleanCenter) {
      throw new Error(`No puede crear inventarios para el centro ${cleanCenter}`);
    }

    const invId = `INV-${cleanType}-${cleanCenter}-${Date.now().toString(36).toUpperCase()}`;
    const mappedItems = (items && items.length > 0)
      ? gasService.mapRawRowsToColumns(items)
      : [];

    const newInventory = {
      id: invId,
      name: name || `Inventario ${cleanType} - ${cleanCenter} (${new Date().toLocaleDateString()})`,
      type: cleanType,
      center: cleanCenter,
      status: 'EN_PROGRESO',
      createdAt: new Date().toISOString(),
      createdBy: user.username,
      assignedAuxiliars: [],
      items: mappedItems
    };

    this.saveInventory(newInventory);
    auditService.logAction({
      action: 'INVENTORY_CREATED',
      details: `Inventario ${newInventory.name} creado con ${mappedItems.length} ítems`,
      user: user.username,
      center: cleanCenter,
      targetId: invId
    });

    return newInventory;
  }

  updateCount({ inventoryId, itemId, sku, stockFisico, malEstado = 0, location = null, isNewLocation = false, user, reason }) {
    const inv = this.getInventoryRaw(inventoryId);
    if (!inv) {
      throw new Error(`Inventario '${inventoryId}' no encontrado`);
    }

    if (user.role !== 'ADMIN' && !user.isSuperadmin && inv.center !== user.center) {
      throw new Error(`No tiene permisos para modificar inventarios del centro ${inv.center}`);
    }

    const qty = (stockFisico !== null && stockFisico !== undefined && stockFisico !== '') ? parseInt(stockFisico, 10) : 0;
    const damagedQty = parseInt(malEstado, 10) || 0;

    let targetItem = inv.items.find(it => it.id === itemId || (sku && it.SKU === sku));
    let previousQty = targetItem ? targetItem.Stock_Fisico : null;

    if (isNewLocation) {
      // MULTIPLE LOCATIONS: DO NOT OVERWRITE ORIGINAL ROW.
      // Append a new row at the end of items list.
      const baseItem = targetItem || {
        SKU: sku || 'SKU-EXTRA',
        Codigo_Barras: '',
        Descripcion: 'Ubicación Adicional',
        Categoria: 'GENERAL',
        Clasificacion_ABC: 'C',
        Unidad: 'PZA',
        Costo_Unitario: 0,
        Stock_Sistema: 0
      };

      const newItemId = `ITEM-NEW-LOC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newRow = {
        id: newItemId,
        SKU: baseItem.SKU,
        Codigo_Barras: baseItem.Codigo_Barras || '',
        Descripcion: `${baseItem.Descripcion} (Ubicación Adicional)`,
        Ubicacion: location || 'NUEVA_UBICACION',
        Categoria: baseItem.Categoria,
        Clasificacion_ABC: baseItem.Clasificacion_ABC,
        Unidad: baseItem.Unidad,
        Costo_Unitario: baseItem.Costo_Unitario || 0,
        Stock_Sistema: 0, // Additional location system expected is 0
        Stock_Fisico: qty,
        Diferencia: qty - 0,
        Costo_Diferencia: (qty - 0) * (baseItem.Costo_Unitario || 0),
        Fecha_Ultimo_Conteo: new Date().toISOString(),
        Responsable: user.username,
        Estado: 'Contado',
        Mal_estado: damagedQty,
        isAdditionalLocation: true,
        originalItemId: targetItem ? targetItem.id : null
      };

      inv.items.push(newRow);
      targetItem = newRow;
    } else {
      if (!targetItem) {
        throw new Error(`Ítem con ID '${itemId}' o SKU '${sku}' no encontrado en el inventario`);
      }

      // Auxiliar can only count items assigned to them (except in BARRIDO mode where scan is open for the center)
      if (user.role === 'AUXILIAR' && inv.type !== 'BARRIDO' && targetItem.Responsable && targetItem.Responsable !== user.username) {
        throw new Error(`Este ítem está asignado al auxiliar ${targetItem.Responsable}`);
      }

      targetItem.Stock_Fisico = qty;
      targetItem.Mal_estado = damagedQty;
      targetItem.Diferencia = qty - (targetItem.Stock_Sistema || 0);
      targetItem.Costo_Diferencia = targetItem.Diferencia * (targetItem.Costo_Unitario || 0);
      targetItem.Fecha_Ultimo_Conteo = new Date().toISOString();
      targetItem.Responsable = user.username;
      targetItem.Estado = 'Contado';
    }

    this.saveInventory(inv);

    // Audit log
    auditService.logCount({
      inventoryId: inv.id,
      sku: targetItem.SKU,
      previousQty,
      newQty: qty,
      user: user.username,
      center: inv.center,
      location: targetItem.Ubicacion,
      malEstado: damagedQty,
      reason: reason || (isNewLocation ? 'Nueva ubicación detectada' : 'Conteo físico confirmado')
    });

    return {
      success: true,
      item: targetItem,
      inventoryStatus: inv.status
    };
  }

  reassignTasks({ inventoryId, itemIds, toUser, requestingUser, reason }) {
    const inv = this.getInventoryRaw(inventoryId);
    if (!inv) {
      throw new Error('Inventario no encontrado');
    }

    if (requestingUser.role !== 'ADMIN' && !requestingUser.isSuperadmin) {
      if (requestingUser.role === 'ENCARGADO' && inv.center !== requestingUser.center) {
        throw new Error('No puede reasignar tareas de otro centro');
      }
      if (requestingUser.role === 'AUXILIAR') {
        throw new Error('Los auxiliares no tienen permisos para reasignar tareas');
      }
    }

    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      throw new Error('Debe especificar los ítems a reasignar');
    }

    let count = 0;
    inv.items.forEach(item => {
      if (itemIds.includes(item.id)) {
        item.Responsable = toUser;
        count++;
      }
    });

    if (!inv.assignedAuxiliars) inv.assignedAuxiliars = [];
    if (!inv.assignedAuxiliars.includes(toUser)) {
      inv.assignedAuxiliars.push(toUser);
    }

    this.saveInventory(inv);

    auditService.logReassignment({
      inventoryId: inv.id,
      fromUser: 'Varios',
      toUser,
      adminUser: requestingUser.username,
      center: inv.center,
      affectedCount: count,
      reason
    });

    return { success: true, count, toUser };
  }

  submitInventoryForReview({ inventoryId, user, signature }) {
    const inv = this.getInventoryRaw(inventoryId);
    if (!inv) throw new Error('Inventario no encontrado');

    const uncounted = inv.items.filter(it => it.Stock_Fisico === null);
    if (uncounted.length > 0) {
      throw new Error(`No se puede cerrar para revisión: aún quedan ${uncounted.length} ítems sin contar`);
    }

    inv.status = 'PENDIENTE_JUSTIFICACION';
    inv.submittedAt = new Date().toISOString();
    inv.submittedBy = user.username;
    inv.signature = signature || 'Firma digital operativa';

    this.saveInventory(inv);
    auditService.logAction({
      action: 'INVENTORY_SUBMITTED_FOR_REVIEW',
      details: `Inventario completado por auxiliares y enviado a revisión de justificaciones`,
      user: user.username,
      center: inv.center,
      targetId: inv.id
    });

    return inv;
  }

  saveJustification({ inventoryId, sku, justification, photoUrl, reasonType, user }) {
    const inv = this.getInventoryRaw(inventoryId);
    if (!inv) throw new Error('Inventario no encontrado');

    const item = inv.items.find(it => it.SKU === sku);
    if (!item) throw new Error(`Ítem ${sku} no encontrado en el inventario`);

    const justId = driveService.formatJustificationName(inv.type, sku, inv.center);
    const justFilePath = path.join(this.justDir, `${justId}.json`);

    const justRecord = {
      id: justId,
      inventoryId: inv.id,
      sku,
      descripcion: item.Descripcion,
      ubicacion: item.Ubicacion,
      stockSistema: item.Stock_Sistema,
      stockFisico: item.Stock_Fisico,
      diferencia: item.Diferencia,
      costoDiferencia: item.Costo_Diferencia,
      malEstado: item.Mal_estado,
      justification: justification || 'Sin observaciones adicionales',
      reasonType: reasonType || 'AJUSTE_INVENTARIO',
      photoUrl: photoUrl || null,
      reviewedBy: user.username,
      reviewedAt: new Date().toISOString(),
      center: inv.center,
      type: inv.type,
      status: 'REVISADO'
    };

    storagePath.writeJson(justFilePath, justRecord);

    item.Estado = 'Justificado';
    this.saveInventory(inv);

    auditService.logJustification({
      inventoryId: inv.id,
      sku,
      justification,
      photoUrl,
      user: user.username,
      center: inv.center,
      diffQty: item.Diferencia,
      diffCost: item.Costo_Diferencia
    });

    return justRecord;
  }

  getJustificationsForInventory(inventoryId) {
    try {
      const files = fs.readdirSync(this.justDir).filter(f => f.endsWith('.json'));
      const list = [];
      files.forEach(f => {
        const j = storagePath.readJson(path.join(this.justDir, f), null);
        if (j && j.inventoryId === inventoryId) {
          list.push(j);
        }
      });
      return list;
    } catch (e) {
      return [];
    }
  }

  getPendingJustifications(user, centerFilter = null) {
    if (user.role !== 'ADMIN' && !user.isSuperadmin) {
      throw new Error('Solo los administradores pueden acceder a la pestaña de justificaciones');
    }

    const files = this.getAllInventoryFiles();
    const tasks = [];

    files.forEach(f => {
      const inv = storagePath.readJson(path.join(this.invDir, f), null);
      if (!inv) return;
      if (centerFilter && centerFilter !== 'TODOS' && centerFilter !== 'GLOBAL' && inv.center !== centerFilter) return;

      // Check items with differences or damaged goods
      const discrepantItems = inv.items.filter(it => (it.Diferencia !== 0 || it.Mal_estado > 0));
      const existingJustifications = this.getJustificationsForInventory(inv.id);
      const justifiedSkus = new Set(existingJustifications.map(j => j.sku));

      const pendingDiscrepancies = discrepantItems.filter(it => !justifiedSkus.has(it.SKU));

      if (discrepantItems.length > 0 || inv.status === 'PENDIENTE_JUSTIFICACION') {
        tasks.push({
          inventoryId: inv.id,
          inventoryName: inv.name,
          type: inv.type,
          center: inv.center,
          status: inv.status,
          totalItems: inv.items.length,
          totalDiscrepancies: discrepantItems.length,
          pendingJustificationsCount: pendingDiscrepancies.length,
          items: discrepantItems.map(it => ({
            ...it,
            isJustified: justifiedSkus.has(it.SKU),
            justificationDetails: existingJustifications.find(j => j.sku === it.SKU) || null
          }))
        });
      }
    });

    return tasks;
  }

  async finishReviewAndClose({ inventoryId, user, reviewNotes }) {
    if (user.role !== 'ADMIN' && !user.isSuperadmin) {
      throw new Error('Solo los administradores pueden terminar la revisión y crear el archivo final en Google Drive');
    }

    const inv = this.getInventoryRaw(inventoryId);
    if (!inv) throw new Error('Inventario no encontrado');

    const justifications = this.getJustificationsForInventory(inventoryId);

    // 1. Create final file in Google Drive via driveService
    const driveResult = await driveService.createFinalDriveFile({
      inventory: inv,
      justifications,
      user,
      reviewNotes
    });

    // 2. Mark inventory as reviewed and closed
    inv.status = 'REVISADO';
    inv.closedAt = new Date().toISOString();
    inv.closedBy = user.username;
    inv.driveFileId = driveResult.fileId;
    inv.driveFileName = driveResult.fileName;
    inv.driveUrl = driveResult.driveUrl;

    this.saveInventory(inv);

    auditService.logAction({
      action: 'INVENTORY_REVIEW_FINISHED',
      details: `Revisión completada por ${user.username}. Archivo final Drive creado: ${driveResult.fileName}`,
      user: user.username,
      center: inv.center,
      targetId: inv.id
    });

    return {
      success: true,
      message: 'Revisión finalizada con éxito. Archivo de inventario creado en Google Drive.',
      drive: driveResult,
      inventory: inv
    };
  }

  reopenInventory({ inventoryId, user, reason }) {
    if (user.role !== 'ADMIN' && !user.isSuperadmin) {
      throw new Error('Solo los administradores pueden reabrir inventarios');
    }

    const inv = this.getInventoryRaw(inventoryId);
    if (!inv) throw new Error('Inventario no encontrado');

    inv.status = 'EN_PROGRESO';
    inv.reopenedAt = new Date().toISOString();
    inv.reopenedBy = user.username;

    this.saveInventory(inv);
    auditService.logReopen({
      inventoryId: inv.id,
      user: user.username,
      center: inv.center,
      reason
    });

    return inv;
  }

  deleteInventory({ inventoryId, user, deleteKey, reason }) {
    if (user.role !== 'ADMIN' && !user.isSuperadmin) {
      throw new Error('Solo los administradores pueden eliminar inventarios');
    }

    if (deleteKey !== config.adminDeleteKey) {
      throw new Error('Clave de confirmación de eliminación incorrecta');
    }

    const inv = this.getInventoryRaw(inventoryId);
    if (!inv) throw new Error('Inventario no encontrado');

    const filePath = path.join(this.invDir, `${inventoryId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    auditService.logDeletion({
      inventoryId,
      user: user.username,
      center: inv.center,
      reason
    });

    return { success: true, message: `Inventario ${inv.name} (${inventoryId}) eliminado exitosamente` };
  }

  searchProductForBarrido({ barcodeOrSku, center }) {
    if (!barcodeOrSku) {
      throw new Error('Debe proporcionar un código de barras o SKU');
    }

    const raw = String(barcodeOrSku).trim();
    // Normalize code: strip leading JD_ if exists, also support matching with JD_
    const stripped = raw.replace(/^JD_/i, '').trim();
    const withPrefix = `JD_${stripped}`;

    // Search through all current inventory items in this center
    const files = this.getAllInventoryFiles();
    for (const f of files) {
      const inv = storagePath.readJson(path.join(this.invDir, f), null);
      if (!inv) continue;
      if (center && center !== 'GLOBAL' && inv.center !== center) continue;

      for (const it of inv.items) {
        const itBarcode = (it.Codigo_Barras || '').trim();
        const itSku = (it.SKU || '').trim();
        const itBarcodeStripped = itBarcode.replace(/^JD_/i, '').trim();

        if (
          itBarcode === raw ||
          itBarcode === stripped ||
          itBarcode === withPrefix ||
          itBarcodeStripped === stripped ||
          itSku.toUpperCase() === raw.toUpperCase() ||
          itSku.toUpperCase() === stripped.toUpperCase()
        ) {
          return {
            found: true,
            source: 'EXISTING_INVENTORY',
            inventoryId: inv.id,
            item: {
              ...it,
              UbicacionOriginal: it.Ubicacion
            }
          };
        }
      }
    }

    // If not found in local files, return structured item placeholder for new discovery in barrido
    return {
      found: false,
      source: 'NEW_DISCOVERY',
      item: {
        SKU: raw.toUpperCase(),
        Codigo_Barras: raw,
        Descripcion: `Ítem Descubierto en Barrido (${raw})`,
        Ubicacion: '',
        Categoria: 'BARRIDO',
        Clasificacion_ABC: 'C',
        Unidad: 'PZA',
        Costo_Unitario: 0,
        Stock_Sistema: 0,
        Stock_Fisico: null,
        Diferencia: 0,
        Costo_Diferencia: 0,
        Estado: 'Pendiente',
        Mal_estado: 0
      }
    };
  }
}

module.exports = new InventoryService();
